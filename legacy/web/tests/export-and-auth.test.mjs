import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import ts from 'typescript';
import { PDFDocument } from 'pdf-lib';

async function loadTs(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { generateValidPdfBlob, generateValidXlsxBlob, calculateCrc32 } = await loadTs('../src/utils/fileExporter.ts');

test('PDF preserves all lines across pages and never invents a signature', async () => {
  const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}: (value) \\ escaped`);
  const bytes = await generateValidPdfBlob('Report', 'Subtitle', lines).arrayBuffer();
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 4);
  const text = Buffer.from(bytes).toString();
  assert.ok(text.includes('Line 99:'));
  assert.ok(text.includes('\\(value\\) \\\\ escaped'));
  assert.ok(!text.includes('ROOT CA'));
  assert.ok(!text.includes('CHU KY SO HOP LE'));
});

test('PDF wraps long unbroken lines and supports an empty report', async () => {
  const text = await generateValidPdfBlob('', '', ['X'.repeat(3000)]).text();
  assert.equal((text.match(/X/g) || []).length, 3000);
  assert.equal((await PDFDocument.load(await generateValidPdfBlob('', '', []).arrayBuffer())).getPageCount(), 1);
});

test('XLSX is an OpenXML ZIP with real numbers, Unicode, escaping and no formula injection', async () => {
  const bytes = new Uint8Array(await generateValidXlsxBlob([
    ['Phòng kế toán & <nhân sự>', 123456.75, '=HYPERLINK("bad")', true, null],
    Array.from({ length: 28 }, (_, i) => i),
  ]).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const entries = new Map();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    const content = bytes.slice(start, start + size);
    assert.equal(calculateCrc32(content), view.getUint32(offset + 14, true));
    entries.set(name, new TextDecoder().decode(content));
    offset = start + size;
  }
  assert.equal(entries.size, 5);
  assert.equal(view.getUint32(offset, true), 0x02014b50);
  const sheet = entries.get('xl/worksheets/sheet1.xml');
  assert.ok(sheet.includes('Phòng kế toán &amp; &lt;nhân sự&gt;'));
  assert.ok(sheet.includes('<c r="B1"><v>123456.75</v></c>'));
  assert.ok(sheet.includes('r="AB2"'));
  assert.ok(sheet.includes('=HYPERLINK(&quot;bad&quot;)'));
  assert.ok(!sheet.includes('<f>'));
});

test('TOTP matches RFC 6238 and rejects an empty secret', async () => {
  const originalWindow = globalThis.window;
  const originalNow = Date.now;
  globalThis.window = { crypto: webcrypto };
  Date.now = () => 59000;
  try {
    const { generateTOTP, verifyTOTP } = await loadTs('../src/utils/twoFactorAuth.ts');
    assert.equal(await generateTOTP('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), '287082');
    assert.equal(await verifyTOTP('', '000000'), false);
    assert.equal(await verifyTOTP('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082'), true);
  } finally {
    Date.now = originalNow;
    globalThis.window = originalWindow;
  }
});
