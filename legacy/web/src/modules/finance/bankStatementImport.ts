import { read, SSF, utils } from 'xlsx';

export type ImportedBankStatementLine = {
  key: string;
  rowNumber: number;
  transactionDate: string;
  valueDate: string;
  direction: 'Thu' | 'Chi';
  amount: number;
  balance?: number;
  description: string;
  counterparty: string;
  counterpartyAccount: string;
  reference: string;
  transactionId: string;
  currency: string;
  duplicate: boolean;
};

const HEADER_ALIASES = {
  transactionDate: ['date', 'transactiondate', 'bookingdate', 'postingdate', 'ngay', 'ngaygiaodich', 'ngayhachtoan'],
  valueDate: ['valuedate', 'settlementdate', 'ngaygiatri'],
  description: ['description', 'transactiondescription', 'details', 'narrative', 'memo', 'remark', 'remarks', 'noidung', 'diengiai', 'noidunggiaodich', 'chitiet'],
  debit: ['debit', 'debitamount', 'withdrawal', 'withdrawals', 'moneyout', 'sotienchi', 'tienchi', 'no'],
  credit: ['credit', 'creditamount', 'deposit', 'deposits', 'moneyin', 'sotienthu', 'tienthu', 'co'],
  amount: ['amount', 'transactionamount', 'value', 'sotien', 'giatri', 'sotiengiaodich'],
  balance: ['balance', 'runningbalance', 'closingbalance', 'sodu', 'sodudu', 'sosau', 'saugiaodich'],
  counterparty: ['counterparty', 'beneficiary', 'payer', 'payee', 'tennguoinop', 'tennguoinhan', 'doitac'],
  counterpartyAccount: ['counterpartyaccount', 'accountnumber', 'sotaikhoandoitac', 'stkdoitac'],
  reference: ['reference', 'referencenumber', 'ref', 'transactionreference', 'machungtu', 'magiayto', 'mathamchieu'],
  transactionId: ['transactionid', 'transactionno', 'transactionnumber', 'machuyenkhoan', 'magiaodich', 'sogiaodich'],
} as const;

const normalizeHeader = (value: unknown) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function parseAmount(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  let text = String(value).trim().replace(/[−–]/g, '-');
  const negative = /^\(.*\)$/.test(text) || text.startsWith('-') || text.endsWith('-');
  text = text.replace(/[()]/g, '').replace(/\s/g, '').replace(/[^\d.,+-]/g, '').replace(/^[+-]|[+-]$/g, '');
  if (!text) return 0;
  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  const lastSeparator = Math.max(comma, dot);
  const trailingDigits = lastSeparator < 0 ? 0 : text.length - lastSeparator - 1;
  const hasDecimal = lastSeparator >= 0 && trailingDigits > 0 && trailingDigits <= 2;
  if (hasDecimal) {
    const decimal = text[lastSeparator];
    text = text.slice(0, lastSeparator).replace(/[.,]/g, '') + '.' + text.slice(lastSeparator + 1);
    if (!decimal) return 0;
  } else {
    text = text.replace(/[.,]/g, '');
  }
  const amount = Number(text);
  return Number.isFinite(amount) ? Math.round(Math.abs(amount) * 100) / 100 * (negative ? -1 : 1) : 0;
}

function isoDate(value: unknown): string {
  let year: number, month: number, day: number;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    year = value.getFullYear(); month = value.getMonth() + 1; day = value.getDate();
  } else if (typeof value === 'number' && Number.isFinite(value)) {
    const parts = SSF.parse_date_code(value);
    if (!parts) return '';
    year = parts.y; month = parts.m; day = parts.d;
  } else {
    const text = String(value ?? '').trim();
    let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
    if (match) [, year, month, day] = match.map(Number) as [number, number, number, number];
    else {
      match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
      if (!match) return '';
      [, day, month, year] = match.map(Number) as [number, number, number, number];
    }
  }
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function headerColumns(values: unknown[]) {
  const normalized = values.map(normalizeHeader);
  const columns: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const index = normalized.findIndex(value => (aliases as readonly string[]).includes(value));
    if (index >= 0) columns[field] = index;
  }
  return columns;
}

export function parseBankStatementRows(rows: unknown[][]): ImportedBankStatementLine[] {
  const headerIndex = rows.slice(0, 20).findIndex(row => {
    const columns = headerColumns(row);
    return columns.transactionDate !== undefined && (columns.amount !== undefined || columns.debit !== undefined || columns.credit !== undefined);
  });
  if (headerIndex < 0) throw new Error('Không nhận diện được cột ngày và số tiền. Tệp cần có hàng tiêu đề ngày giao dịch cùng số tiền, tiền thu hoặc tiền chi.');
  const columns = headerColumns(rows[headerIndex]);
  const amountColumn = columns.amount;
  const useSplitAmounts = columns.debit !== undefined || columns.credit !== undefined;
  if (useSplitAmounts && columns.debit === undefined && columns.credit === undefined) throw new Error('Thiếu cột tiền thu hoặc tiền chi trong sao kê.');
  const lines: ImportedBankStatementLine[] = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] || [];
    if (!row.some(value => String(value ?? '').trim())) continue;
    const transactionDate = isoDate(row[columns.transactionDate]);
    const valueDate = columns.valueDate === undefined ? '' : isoDate(row[columns.valueDate]);
    const debit = columns.debit === undefined ? 0 : parseAmount(row[columns.debit]);
    const credit = columns.credit === undefined ? 0 : parseAmount(row[columns.credit]);
    if (debit < 0 || credit < 0 || (debit > 0 && credit > 0)) throw new Error(`Dòng ${index + 1}: số tiền thu/chi không hợp lệ hoặc cùng có giá trị.`);
    const rawAmount = useSplitAmounts ? (credit > 0 ? credit : debit) : parseAmount(row[amountColumn!]);
    if (!transactionDate || rawAmount === 0) throw new Error(`Dòng ${index + 1}: ngày giao dịch hoặc số tiền không hợp lệ.`);
    if (!useSplitAmounts && !amountColumn && !columns.amount) throw new Error('Thiếu cột số tiền.');
    const description = columns.description === undefined ? '' : String(row[columns.description] ?? '').trim();
    const reference = columns.reference === undefined ? '' : String(row[columns.reference] ?? '').trim();
    const transactionId = columns.transactionId === undefined ? '' : String(row[columns.transactionId] ?? '').trim();
    const direction = useSplitAmounts ? (credit > 0 ? 'Thu' : 'Chi') : (rawAmount < 0 ? 'Chi' : 'Thu');
    lines.push({
      key: `line-${index + 1}`, rowNumber: index + 1, transactionDate, valueDate,
      direction, amount: Math.abs(rawAmount),
      balance: columns.balance === undefined || row[columns.balance] === '' ? undefined : parseAmount(row[columns.balance]),
      description, counterparty: columns.counterparty === undefined ? '' : String(row[columns.counterparty] ?? '').trim(),
      counterpartyAccount: columns.counterpartyAccount === undefined ? '' : String(row[columns.counterpartyAccount] ?? '').trim(),
      reference, transactionId, currency: 'VND', duplicate: false,
    });
    if (lines.length > 1000) throw new Error('Tệp vượt quá giới hạn 1.000 giao dịch cho mỗi lần nhập.');
  }
  if (!lines.length) throw new Error('Không tìm thấy dòng giao dịch hợp lệ trong tệp.');
  return lines;
}

export function bankStatementLineFingerprint(line: Pick<ImportedBankStatementLine, 'transactionDate' | 'direction' | 'amount' | 'balance' | 'description' | 'reference' | 'transactionId'>): string {
  const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('vi-VN').replace(/\s+/g, ' ');
  return [normalize(line.transactionId), line.transactionDate, line.direction, Number(line.amount).toFixed(2),
    line.balance === undefined ? '' : Number(line.balance).toFixed(2), normalize(line.reference), normalize(line.description)].join('|');
}

export async function parseBankStatementFile(file: File): Promise<{ lines: ImportedBankStatementLine[]; fileHash: string }> {
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) throw new Error('Chỉ hỗ trợ tệp CSV, XLSX hoặc XLS.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Tệp sao kê vượt quá giới hạn 5 MB.');
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const fileHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  const workbook = read(bytes, { type: 'array', cellDates: true, raw: true });
  if (!workbook.SheetNames.length) throw new Error('Tệp không có trang tính dữ liệu.');
  let lastError: unknown;
  for (const sheetName of workbook.SheetNames) {
    const rows = utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' });
    try {
      return { lines: parseBankStatementRows(rows), fileHash };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Không tìm thấy trang tính có dữ liệu sao kê hợp lệ.');
}
