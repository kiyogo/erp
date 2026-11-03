const mappingPrefixes = [
  ['1111', 'S2d-DNSN', false, ''], ['1112', 'S2d-DNSN', false, ''],
  ['1311', 'S4a-DNSN', true, 'Cần đối chiếu số dư theo từng khách hàng hoặc đối tượng phải thu.'],
  ['1318', 'S4a-DNSN', true, 'Cần đối chiếu số dư theo từng đối tượng phải thu.'],
  ['1313', 'S3b-DNSN', false, ''],
  ['1521', 'S2c-DNSN', true, 'Cần đối chiếu số lượng và giá trị theo từng vật tư, hàng hóa và kho.'],
  ['1524', 'S2c-DNSN', true, 'Cần đối chiếu chi tiết sản phẩm dở dang và giá trị theo đối tượng tập hợp chi phí.'],
  ['1526', 'S2c-DNSN', true, 'Cần đối chiếu số lượng và giá trị theo từng thành phẩm, hàng hóa và kho.'],
  ['211', 'S4b-DNSN', true, 'Cần đối chiếu nguyên giá theo từng tài sản cố định.'],
  ['3311', 'S4a-DNSN', true, 'Cần đối chiếu số dư theo từng người lao động.'],
  ['3312', 'S4a-DNSN', true, 'Cần đối chiếu số dư theo từng khoản trích theo lương.'],
  ['33131', 'S3b-DNSN', false, ''],
  ['33134', '', false, ''],
  ['33138', 'S4a-DNSN', true, 'Cần phân loại số dư theo sắc thuế, phí và đối tượng trước khi chuyển.'],
  ['3318', 'S4a-DNSN', true, 'Cần đối chiếu số dư theo từng đối tượng phải trả.'],
  ['4111', 'S4d-DNSN', false, ''], ['4118', 'S4d-DNSN', false, ''],
];

function toCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000_000_000_000) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents / 100 === amount ? cents : null;
}

function targetForAccount(code, vatMethod, citMethod) {
  if (code.startsWith('33134')) {
    if (citMethod === 'taxable_income') return ['33134', 'S2b-DNSN', false, ''];
    if (citMethod === 'revenue_percentage') return ['33134', vatMethod === 'deduction' ? 'S3a-DNSN' : 'S1-DNSN', false, ''];
  }
  const mapping = mappingPrefixes.find(([prefix]) => code.startsWith(prefix));
  if (mapping) return mapping;
  return null;
}

export function buildTT132ToTT58BalancePreview(records, { openingDate, vatMethod, citMethod }) {
  if (!Array.isArray(records) || !/^\d{4}-\d{2}-\d{2}$/.test(String(openingDate || ''))) {
    throw new TypeError('Cần danh sách bút toán và ngày đầu kỳ hợp lệ.');
  }
  const balances = new Map();
  let sourceEntryCount = 0;
  let totalDebitCents = 0;
  let totalCreditCents = 0;
  for (const record of records) {
    if (record?.accountingRegime !== 'TT132' || record?.status !== 'Đã ghi sổ cái'
      || typeof record.entryDate !== 'string' || record.entryDate >= openingDate) continue;
    const amount = toCents(record.amount);
    const lines = Array.isArray(record.lines) ? record.lines : [
      { account: record.debitAccount, debit: record.amount, credit: 0 },
      { account: record.creditAccount, debit: 0, credit: record.amount },
    ];
    if (amount === null || lines.length < 2) throw new TypeError(`Chứng từ ${record.voucherCode || record.key || ''} có số tiền không hợp lệ.`);
    let entryDebitCents = 0;
    let entryCreditCents = 0;
    for (const line of lines) {
      const account = String(line?.account || '').replace(/^TK\s*/i, '').trim();
      const debit = toCents(line?.debit ?? 0);
      const credit = toCents(line?.credit ?? 0);
      if (!/^\d{3,10}$/.test(account) || debit === null || credit === null || debit < 0 || credit < 0 || (debit > 0) === (credit > 0)) {
        throw new TypeError(`Chứng từ ${record.voucherCode || record.key || ''} có dòng hạch toán không hợp lệ.`);
      }
      const balance = balances.get(account) || { debitCents: 0, creditCents: 0 };
      balance.debitCents += debit;
      balance.creditCents += credit;
      if (!Number.isSafeInteger(balance.debitCents) || !Number.isSafeInteger(balance.creditCents)) throw new RangeError('Tổng số dư vượt phạm vi xử lý an toàn.');
      balances.set(account, balance);
      totalDebitCents += debit;
      totalCreditCents += credit;
      entryDebitCents += debit;
      entryCreditCents += credit;
      if (!Number.isSafeInteger(totalDebitCents) || !Number.isSafeInteger(totalCreditCents)) throw new RangeError('Tổng số dư vượt phạm vi xử lý an toàn.');
    }
    if (entryDebitCents !== entryCreditCents || entryDebitCents !== amount) throw new TypeError(`Chứng từ ${record.voucherCode || record.key || ''} không cân bằng.`);
    sourceEntryCount += 1;
  }
  const accounts = [...balances.entries()].map(([accountCode, movement]) => {
    const netCents = movement.debitCents - movement.creditCents;
    const mapping = targetForAccount(accountCode, vatMethod, citMethod);
    return {
      accountCode,
      debitBalanceCents: Math.max(0, netCents),
      creditBalanceCents: Math.max(0, -netCents),
      targetBookCode: mapping?.[1] || null,
      detailRequired: Boolean(mapping?.[2]),
      reconciliationNote: mapping?.[3] || (mapping ? '' : 'Chưa có quy tắc chuyển tự động; cần kế toán đối chiếu thủ công.'),
    };
  }).filter(account => account.debitBalanceCents || account.creditBalanceCents)
    .sort((left, right) => Number(left.accountCode) - Number(right.accountCode));
  return {
    openingDate,
    sourceRegime: 'TT132',
    targetRegime: 'TT58',
    sourceEntryCount,
    totalDebitCents,
    totalCreditCents,
    balanced: totalDebitCents === totalCreditCents,
    accounts,
  };
}
