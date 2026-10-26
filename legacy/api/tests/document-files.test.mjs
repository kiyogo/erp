import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { test } from 'node:test';
import { createDocxFromText } from '../document-files.mjs';

function readPackage(bytes) {
  assert.ok(Buffer.isBuffer(bytes));
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  assert.equal(bytes.readUInt16LE(end + 4), 0);
  assert.equal(bytes.readUInt16LE(end + 6), 0);
  const count = bytes.readUInt16LE(end + 10);
  assert.equal(bytes.readUInt16LE(end + 8), count);
  assert.equal(bytes.readUInt16LE(end + 20), 0);
  const centralStart = bytes.readUInt32LE(end + 16);
  assert.equal(centralStart + bytes.readUInt32LE(end + 12), end);
  let central = centralStart, nextLocal = 0;
  const files = new Map();
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(central), 0x02014b50);
    const local = bytes.readUInt32LE(central + 42);
    assert.equal(local, nextLocal, 'Local records occupy contiguous declared offsets');
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    assert.equal(bytes.readUInt16LE(local + 4), 20);
    assert.equal(bytes.readUInt16LE(local + 6), 0x800);
    assert.equal(bytes.readUInt16LE(central + 8), 0x800);
    assert.equal(bytes.readUInt16LE(local + 8), 0);
    assert.equal(bytes.readUInt16LE(central + 10), 0);
    const size = bytes.readUInt32LE(central + 24);
    assert.equal(bytes.readUInt32LE(central + 20), size);
    assert.equal(bytes.readUInt32LE(local + 18), size);
    assert.equal(bytes.readUInt32LE(local + 22), size);
    const nameSize = bytes.readUInt16LE(central + 28);
    const extraSize = bytes.readUInt16LE(central + 30);
    const commentSize = bytes.readUInt16LE(central + 32);
    const name = bytes.subarray(central + 46, central + 46 + nameSize).toString('utf8');
    assert.equal(bytes.readUInt16LE(local + 26), nameSize);
    assert.equal(bytes.subarray(local + 30, local + 30 + nameSize).toString('utf8'), name);
    const dataStart = local + 30 + nameSize + bytes.readUInt16LE(local + 28);
    const content = bytes.subarray(dataStart, dataStart + size);
    assert.equal(content.length, size);
    assert.equal(crc32(content), bytes.readUInt32LE(local + 14), `${name} matches independent native CRC32`);
    assert.equal(crc32(content), bytes.readUInt32LE(central + 16));
    assert.ok(!files.has(name)); files.set(name, content);
    nextLocal = dataStart + size;
    central += 46 + nameSize + extraSize + commentSize;
  }
  assert.equal(central, end);
  assert.equal(nextLocal, centralStart);
  return files;
}

test('generated DOCX is a deterministic valid ZIP with the required OpenXML package relationships', () => {
  const bytes = createDocxFromText('Hợp đồng tiếng Việt');
  const files = readPackage(bytes);
  assert.deepEqual([...files.keys()], ['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
  assert.deepEqual(bytes, createDocxFromText('Hợp đồng tiếng Việt'));
  assert.match(files.get('[Content_Types].xml').toString(), /PartName="\/word\/document.xml" ContentType="application\/vnd.openxmlformats-officedocument.wordprocessingml.document.main\+xml"/);
  assert.match(files.get('_rels/.rels').toString(), /Type="http:\/\/schemas.openxmlformats.org\/officeDocument\/2006\/relationships\/officeDocument" Target="word\/document.xml"/);
  assert.match(files.get('word/document.xml').toString(), /xmlns:w="http:\/\/schemas.openxmlformats.org\/wordprocessingml\/2006\/main"/);
});

test('DOCX preserves Unicode, leading spaces, paragraphs, tabs and explicit page breaks while escaping text', () => {
  const xml = readPackage(createDocxFromText('  Nguyễn & <tag> "x" \'y\' 😀  \r\n\rDòng\tcột\r\nCuối\fTrang 2')).get('word/document.xml').toString();
  assert.ok(xml.includes('  Nguyễn &amp; &lt;tag&gt; &quot;x&quot; &apos;y&apos; 😀  '));
  assert.ok(xml.includes('xml:space="preserve"'));
  assert.equal((xml.match(/<w:p>/g) || []).length, 5);
  assert.equal((xml.match(/<w:tab\/>/g) || []).length, 1);
  assert.equal((xml.match(/<w:pageBreakBefore\/>/g) || []).length, 1);
  assert.ok(!xml.includes('\r'));
  assert.ok(!xml.includes('\f'));
});

test('DOCX accepts empty text, replaces forbidden XML characters and refuses non-text inputs', () => {
  const empty = readPackage(createDocxFromText('')).get('word/document.xml').toString();
  assert.equal((empty.match(/<w:p>/g) || []).length, 1);
  const xml = readPackage(createDocxFromText('A\0B\u0008C\u000bD\u001fE\ufffeF\uffffG\ud800H\udc00I 😀')).get('word/document.xml').toString();
  assert.ok(xml.includes('A�B�C�D�E�F�G�H�I 😀'));
  for (const value of [undefined, null, 123, {}, Buffer.from('text')]) assert.throws(() => createDocxFromText(value), TypeError);
});

test('ZIP stores full long document lengths and complete final paragraphs beyond 16-bit sizes', () => {
  const text = 'Dòng hợp đồng & điều khoản\n'.repeat(20000) + 'ĐIỀU KHOẢN CUỐI CÙNG';
  const xml = readPackage(createDocxFromText(text)).get('word/document.xml');
  assert.ok(xml.length > 65535);
  assert.equal((xml.toString().match(/<w:p>/g) || []).length, 20001);
  assert.ok(xml.toString().includes('ĐIỀU KHOẢN CUỐI CÙNG'));
});

test('all generated package XML parses in the existing browser XML parser with exact document content', async () => {
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const files = readPackage(createDocxFromText('  Nguyễn & <tag> "x" \'y\' 😀  \r\n\rDòng\tcột\r\nCuối\fTrang 2\u0000'));
    const parsed = await page.evaluate(parts => {
      const documents = new Map(parts.map(([name, xml]) => {
        const document = new DOMParser().parseFromString(xml, 'application/xml');
        if (document.querySelector('parsererror')) throw new Error(`${name}: ${document.querySelector('parsererror').textContent}`);
        return [name, document];
      }));
      const namespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
      const document = documents.get('word/document.xml');
      const paragraphs = [...document.getElementsByTagNameNS(namespace, 'p')];
      const relationship = documents.get('_rels/.rels').documentElement.firstElementChild;
      const override = [...documents.get('[Content_Types].xml').documentElement.children].find(node => node.localName === 'Override');
      return {
        namespace: document.documentElement.namespaceURI,
        paragraphs: paragraphs.map(paragraph => [...paragraph.getElementsByTagNameNS(namespace, 'r')].map(run => [...run.children].map(node => node.localName === 'tab' ? '\t' : node.textContent).join('')).join('')),
        pageBreaks: paragraphs.map(paragraph => paragraph.getElementsByTagNameNS(namespace, 'pageBreakBefore').length),
        bodyLast: document.getElementsByTagNameNS(namespace, 'body')[0].lastElementChild.localName,
        target: relationship.getAttribute('Target'), part: override.getAttribute('PartName'),
      };
    }, [...files].map(([name, content]) => [name, content.toString()]));
    assert.equal(parsed.namespace, 'http://schemas.openxmlformats.org/wordprocessingml/2006/main');
    assert.deepEqual(parsed.paragraphs, ['  Nguyễn & <tag> "x" \'y\' 😀  ', '', 'Dòng\tcột', 'Cuối', 'Trang 2�']);
    assert.deepEqual(parsed.pageBreaks, [0, 0, 0, 0, 1]);
    assert.equal(parsed.bodyLast, 'sectPr');
    assert.equal(parsed.target, parsed.part.slice(1));
  } finally { await browser.close(); }
});
