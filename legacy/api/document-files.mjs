const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(parts) {
  const localParts = [], directoryParts = [];
  let offset = 0;
  for (const [name, xml] of parts) {
    const filename = Buffer.from(name, 'utf8');
    const content = Buffer.from(xml, 'utf8');
    const checksum = crc32(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6);
    // Stable ZIP timestamps keep equivalent contract text byte-for-byte identical.
    header.writeUInt16LE(33, 12);
    header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(content.length, 18); header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(filename.length, 26);
    localParts.push(header, filename, content);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50);
    directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8);
    directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(checksum, 16);
    directory.writeUInt32LE(content.length, 20); directory.writeUInt32LE(content.length, 24);
    directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    directoryParts.push(directory, filename);
    offset += header.length + filename.length + content.length;
    if (offset > 0xffffffff) throw new RangeError('Document exceeds the classic ZIP size limit.');
  }
  const directoryLength = directoryParts.reduce((length, part) => length + part.length, 0);
  if (offset + directoryLength > 0xffffffff) throw new RangeError('Document exceeds the classic ZIP size limit.');
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(parts.length, 8); end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directoryLength, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...directoryParts, end]);
}

function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function createDocxFromText(text) {
  if (typeof text !== 'string') throw new TypeError('Document text must be a string.');
  const clean = text.replace(/\r\n?/g, '\n').replace(/[^\u0009\u000A\u000C\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, '\uFFFD');
  const paragraphs = clean.split('\f').flatMap((page, pageIndex) => page.split('\n').map((line, lineIndex) => {
    const pageBreak = pageIndex > 0 && lineIndex === 0 ? '<w:pPr><w:pageBreakBefore/></w:pPr>' : '';
    const runs = line.split('\t').map((part, index) => `${index ? '<w:tab/>' : ''}<w:t xml:space="preserve">${escapeXml(part)}</w:t>`).join('');
    return `<w:p>${pageBreak}<w:r>${runs}</w:r></w:p>`;
  })).join('');
  const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  return zip([
    ['[Content_Types].xml', `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`],
    ['_rels/.rels', `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`],
    ['word/document.xml', `${declaration}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`],
  ]);
}
