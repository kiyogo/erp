// Số tiền đồng Việt Nam bằng chữ, ví dụ 1.234.567 là "Một triệu hai trăm ba mươi tư nghìn năm trăm sáu mươi bảy đồng chẵn".
// Giữ khớp với vndInWords trong legacy/api/invoiceRules.mjs; tests/cash-voucher-print.test.mjs so khớp hai bản.
const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];

function readTriple(value: number, full: boolean): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const units = value % 10;
  const words: string[] = [];
  if (hundreds > 0 || full) words.push(`${DIGITS[hundreds]} trăm`);
  if (tens > 1) words.push(`${DIGITS[tens]} mươi`);
  else if (tens === 1) words.push('mười');
  else if (units > 0 && (hundreds > 0 || full)) words.push('lẻ');
  if (units > 0) {
    if (units === 1 && tens > 1) words.push('mốt');
    else if (units === 5 && tens > 0) words.push('lăm');
    else if (units === 4 && tens > 1) words.push('tư');
    else words.push(DIGITS[units]);
  }
  return words.join(' ');
}

export function vndInWords(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Số tiền không hợp lệ.');
  if (amount === 0) return 'Không đồng';
  const groups: number[] = [];
  for (let rest = amount; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  const parts: string[] = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    if (groups[index] === 0) continue;
    parts.push(`${readTriple(groups[index], index < groups.length - 1)} ${SCALES[index]}`.trim());
  }
  const text = parts.join(' ').trim();
  return `${text[0].toUpperCase()}${text.slice(1)} đồng chẵn`;
}
