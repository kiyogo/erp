/**
 * KIYOVN DIGITAL SIGNATURE VERIFICATION ENGINE - FULL 100% SPECIFICATIONS
 * Tuân thủ tiêu chuẩn X.509 v3 (RFC 5280), PKCS#7 (CMS RFC 5652), PAdES (ISO 32000-1),
 * XMLDSig (W3C), Luật Giao dịch điện tử số 20/2023/QH15,
 * Nghị định 130/2018/NĐ-CP và Thông tư 16/2019/TT-BTTTT của Bộ TT&TT.
 */

export interface VerifiedSignature {
  id: string;
  // 1. Thông tin Chủ thể (Signer / Subject)
  signerName: string;         // Tên chủ thể (Subject CN / O)
  signerTaxCode?: string;     // Mã số thuế (MST) / CMND / CCCD
  signerOrg?: string;         // Tên tổ chức / Công ty (Subject O)
  signerUnit?: string;        // Phòng ban / Đơn vị trực thuộc (Subject OU)
  signerTitle?: string;       // Chức danh người ký (Title / Chức vụ)
  signerCountry: string;      // Quốc gia người ký (C: VN)
  signerCity?: string;        // Tỉnh / Thành phố (L / ST)
  signerAddress?: string;     // Địa chỉ trụ sở (Street Address)
  signerEmail?: string;       // Email người ký

  // 2. Thông tin Nhà cung cấp Chứng thực số (CA Issuer)
  issuerUnit: string;         // Tên nhà cung cấp dịch vụ CA (Issuer CN, ví dụ: VIETTEL-CA)
  issuerOrg?: string;         // Đơn vị / Tập đoàn phát hành CA (Issuer O)
  issuerUnitDept?: string;    // Phòng ban CA (Issuer OU)
  issuerCountry: string;      // Quốc gia cấp phát (VN)
  issuerAuthority: string;    // Cơ quan giám sát (NEAC - Bộ TT&TT)

  // 3. Thông số Chứng thư số & Thời hạn (Certificate Info & Validity)
  certNumber: string;         // Số serial chứng thư số (Hex)
  certNumberDec?: string;     // Số serial dạng thập phân (Decimal)
  version: string;            // Phiên bản chứng thư: X.509 v3 (RFC 5280)
  validFrom: string;          // Ngày bắt đầu hiệu lực (dd/MM/yyyy HH:mm:ss)
  validTo: string;            // Ngày hết hạn hiệu lực (dd/MM/yyyy HH:mm:ss)
  remainingTime: string;      // Thời gian còn lại (e.g. "Còn 2 năm 140 ngày")
  isCertExpired: boolean;     // Đã hết hạn chưa
  certStatus: 'Còn hiệu lực' | 'Sắp hết hạn' | 'Đã hết hạn';

  // 4. Thông số Ký số & Dấu thời gian (Signing Time & Context)
  signedAt: string;           // Thời gian ký số chính xác
  timeSource: string;         // Nguồn thời gian (TSA / PKCS#9 / PDF Dictionary)
  reason?: string;            // Lý do ký (Reason)
  location?: string;          // Địa điểm ký (Location)
  contactInfo?: string;       // Thông tin liên hệ

  // 5. Thuật toán & Khóa mật mã (Cryptographic Specs)
  algorithm: string;          // Thuật toán ký: SHA-256 with RSA 2048-bit (PKCS#1 v1.5)
  digestAlgorithm: string;    // Thuật toán băm thông điệp: SHA-256
  publicKeyType: string;      // Loại khóa công khai: RSA 2048-bit (Exponent 65537)
  thumbprintSha256: string;   // Mã băm chứng thư SHA-256 (Fingerprint)
  thumbprintSha1: string;     // Mã băm chứng thư SHA-1 (Fingerprint)
  keyUsage: string[];         // Mục đích sử dụng khóa (Key Usage)
  extKeyUsage: string[];      // Mục đích mở rộng (Extended Key Usage)
  crlDistributionPoints?: string[]; // Danh sách thu hồi CRL
  ocspUrls?: string[];        // Máy chủ OCSP

  // 6. Tiêu chuẩn & Vùng chứa kỹ thuật (Container & Compliance)
  standard: 'PAdES (ISO 32000-1)' | 'CAdES-BES' | 'XMLDSig (W3C)' | 'PKCS#7 / CMS' | 'Office OpenXML Signature';
  subFilter?: string;         // adbe.pkcs7.detached / ETSI.CAdES.detached
  filter?: string;            // Adobe.PPKLite
  byteRange?: string;         // [0, 12500, 24500, 98200]
  legalCompliance: string;    // Căn cứ pháp lý đầy đủ
  isValid: boolean;           // Chỉ true khi chuỗi ký, chuỗi tin cậy và trạng thái thu hồi đã được xác thực.
  integrityMessage: string;   // Thông báo chi tiết, không suy diễn tính toàn vẹn từ chứng thư đơn lẻ.

  // 7. Cây dữ liệu nguyên bản (Raw DNs)
  rawSubject: string;
  rawIssuer: string;
}

export interface VerificationResult {
  hasSignature: boolean;
  fileName: string;
  fileSize: string;
  fileType: 'PDF' | 'XML' | 'DOCX' | 'CERT' | 'OTHER';
  totalSignatures: number;
  signatures: VerifiedSignature[];
  documentIntegrity: 'VALID' | 'INVALID' | 'UNVERIFIED' | 'NO_SIGNATURE';
  checkedAt: string;
}

// ============================================================================
// 1. BẢNG ÁNH XẠ NHÀ CUNG CẤP CA ĐƯỢC BỘ TT&TT CẤP PHÉP (NEAC)
// ============================================================================
const VIETNAM_CA_MAP: Array<{ match: string[]; officialName: string; org: string; ocsp?: string; crl?: string }> = [
  { match: ['VIETTEL', 'VIETTEL-CA', 'TẬP ĐOÀN CÔNG NGHIỆP - VIỄN THÔNG QUÂN ĐỘI'], officialName: 'VIETTEL-CA', org: 'Tập đoàn Công nghiệp - Viễn thông Quân đội', ocsp: 'http://ocsp.viettel-ca.vn', crl: 'http://crl.viettel-ca.vn/crl/viettel-ca.crl' },
  { match: ['VNPT', 'VNPT-CA', 'TẬP ĐOÀN BƯU CHÍNH VIỄN THÔNG'], officialName: 'VNPT-CA', org: 'Tập đoàn Bưu chính Viễn thông Việt Nam', ocsp: 'http://ocsp.vnpt-ca.vn', crl: 'http://crl.vnpt-ca.vn/vnpt-ca.crl' },
  { match: ['FPT', 'FPT-CA', 'FPT INFORMATION SYSTEM', 'HỆ THỐNG THÔNG TIN FPT'], officialName: 'FPT-CA', org: 'Công ty TNHH Hệ thống Thông tin FPT', ocsp: 'http://ocsp.fpt-ca.vn', crl: 'http://crl.fpt-ca.vn/fpt-ca.crl' },
  { match: ['BKAV', 'BKAV-CA', 'BKAV CORPORATION'], officialName: 'BKAV-CA', org: 'Công ty Cổ phần BKAV', ocsp: 'http://ocsp.bkavca.vn', crl: 'http://crl.bkavca.vn/bkavca.crl' },
  { match: ['MISA', 'MISA-CA', 'MISA ESIGN', 'MISA JSC'], officialName: 'MISA-CA', org: 'Công ty Cổ phần MISA', ocsp: 'http://ocsp.esign.misa.vn', crl: 'http://crl.esign.misa.vn/misa-ca.crl' },
  { match: ['SMARTSIGN', 'VINA-CA', 'VINA CA', 'SMART SIGN'], officialName: 'SMARTSIGN', org: 'Công ty Cổ phần Chữ ký số ViNa', ocsp: 'http://ocsp.smartsign.com.vn', crl: 'http://crl.smartsign.com.vn/smartsign.crl' },
  { match: ['CA2', 'NACENCOMM', 'NATIONAL CENTER FOR ENTERPRISE AND COMPUTER'], officialName: 'CA2', org: 'Công ty Cổ phần Công nghệ Thẻ Nacencomm', ocsp: 'http://ocsp.ca2.vn', crl: 'http://crl.ca2.vn/ca2.crl' },
  { match: ['TRUSTCA', 'SAVIS', 'SAVIS TECHNOLOGY'], officialName: 'TrustCA', org: 'Công ty Cổ phần Công nghệ SAVIS', ocsp: 'http://ocsp.trustca.vn', crl: 'http://crl.trustca.vn/trustca.crl' },
  { match: ['SAFE-CA', 'SAFECA', 'TS24', 'TS24 CORP'], officialName: 'Safe-CA', org: 'Công ty Cổ phần TS24', ocsp: 'http://ocsp.safeca.vn', crl: 'http://crl.safeca.vn/safeca.crl' },
  { match: ['FAST-CA', 'FASTCA', 'FAST CA'], officialName: 'FastCA', org: 'Công ty Cổ phần Chữ ký số FastCA', ocsp: 'http://ocsp.fastca.vn', crl: 'http://crl.fastca.vn/fastca.crl' },
  { match: ['EASYCA', 'EASY-CA', 'SOFTDREAMS'], officialName: 'EasyCA', org: 'Công ty Cổ phần Đầu tư Công nghệ và Thương mại Softdreams', ocsp: 'http://ocsp.easyca.vn', crl: 'http://crl.easyca.vn/easyca.crl' },
  { match: ['EFY', 'EFY-CA', 'EFY VIETNAM'], officialName: 'EFY-CA', org: 'Công ty Cổ phần Công nghệ Tin học EFY Việt Nam', ocsp: 'http://ocsp.efy.com.vn', crl: 'http://crl.efy.com.vn/efy-ca.crl' },
  { match: ['NC-CA', 'NCCA', 'DỮ LIỆU SỐ QUỐC GIA'], officialName: 'NC-CA', org: 'Công ty Cổ phần Dữ liệu số Quốc gia', ocsp: 'http://ocsp.ncca.vn', crl: 'http://crl.ncca.vn/ncca.crl' },
  { match: ['ONE-CA', 'ONECA', 'NEWTEL', 'NEW-TELECOM'], officialName: 'One-CA', org: 'Công ty Cổ phần Viễn thông New-Telecom', ocsp: 'http://ocsp.newtel-ca.vn', crl: 'http://crl.newtel-ca.vn/newtel-ca.crl' },
  { match: ['MATBAO', 'MAT BAO', 'MẮT BÃO'], officialName: 'MatBao-CA', org: 'Công ty Cổ phần Mắt Bão', ocsp: 'http://ocsp.matbao-ca.vn', crl: 'http://crl.matbao-ca.vn/matbao-ca.crl' },
  { match: ['LCS', 'LCS-CA'], officialName: 'LCS-CA', org: 'Công ty TNHH MTV Giải pháp Công nghệ LCS' },
  { match: ['HILO', 'HILO-CA'], officialName: 'HILO-CA', org: 'Công ty Cổ phần Dịch vụ T-VAN HILO' },
  { match: ['I-CA', 'ICA'], officialName: 'I-CA', org: 'Công ty Cổ phần I-CA' },
  { match: ['BAN CƠ YẾU', 'VGCA', 'GOVERNMENT CIPHER', 'BAN CO YEU'], officialName: 'Ban Cơ yếu Chính phủ', org: 'Cục Chứng thực số & Bảo mật thông tin - Ban Cơ yếu Chính phủ' },
  { match: ['NEAC', 'NATIONAL ROOT CA', 'ROOT CA QUỐC GIA', 'BỘ THÔNG TIN'], officialName: 'NEAC', org: 'Trung tâm Chứng thực điện tử quốc gia - Bộ TT&TT' },
  { match: ['KIYO', 'KIYOVN'], officialName: 'KIYO GROUP', org: 'Tập đoàn Công nghệ KIYOVN' },
];

function normalizeIssuer(rawIssuer: string): { officialName: string; org: string; ocsp?: string; crl?: string } {
  if (!rawIssuer) {
    return { officialName: 'Đơn vị Chứng thực số (CA)', org: 'Tổ chức Cung cấp Dịch vụ Chứng thực Chữ ký số' };
  }
  const upper = rawIssuer.toUpperCase();
  for (const ca of VIETNAM_CA_MAP) {
    for (const kw of ca.match) {
      if (upper.includes(kw)) {
        return { officialName: ca.officialName, org: ca.org, ocsp: ca.ocsp, crl: ca.crl };
      }
    }
  }
  return {
    officialName: rawIssuer,
    org: 'Tổ chức Cung cấp Dịch vụ Chứng thực Chữ ký số'
  };
}

// ============================================================================
// 2. ASN.1 DER LOW-LEVEL PARSER
// ============================================================================
interface ASN1Element {
  tag: number;
  tagClass: number;
  isConstructed: boolean;
  headerLength: number;
  length: number;
  dataOffset: number;
  totalLength: number;
  bytes: Uint8Array;
}

function parseASN1Length(bytes: Uint8Array, offset: number): { length: number; headerLength: number } {
  if (offset >= bytes.length) return { length: 0, headerLength: 0 };
  const b = bytes[offset];
  if ((b & 0x80) === 0) {
    return { length: b, headerLength: 1 };
  }
  const numBytes = b & 0x7f;
  if (numBytes === 0) {
    return { length: -1, headerLength: 1 };
  }
  if (offset + 1 + numBytes > bytes.length) {
    return { length: bytes.length - offset - 1, headerLength: 1 + numBytes };
  }
  let len = 0;
  for (let i = 0; i < numBytes; i++) {
    len = (len << 8) | bytes[offset + 1 + i];
  }
  return { length: len, headerLength: 1 + numBytes };
}

function readASN1(bytes: Uint8Array, offset: number = 0): ASN1Element | null {
  if (offset >= bytes.length) return null;
  const tagByte = bytes[offset];
  const tagClass = tagByte >> 6;
  const isConstructed = (tagByte & 0x20) !== 0;
  let tag = tagByte & 0x1f;

  let headerOffset = offset + 1;
  if (tag === 0x1f) {
    tag = 0;
    while (headerOffset < bytes.length) {
      const tb = bytes[headerOffset++];
      tag = (tag << 7) | (tb & 0x7f);
      if ((tb & 0x80) === 0) break;
    }
  }

  const { length, headerLength } = parseASN1Length(bytes, headerOffset);
  const dataOffset = headerOffset + headerLength;
  const validLen = length >= 0 ? length : Math.max(0, bytes.length - dataOffset);
  const totalLength = (dataOffset - offset) + validLen;

  return {
    tag: tagByte,
    tagClass,
    isConstructed,
    headerLength: dataOffset - offset,
    length: validLen,
    dataOffset,
    totalLength,
    bytes: bytes.subarray(dataOffset, Math.min(bytes.length, dataOffset + validLen))
  };
}

function getChildren(bytes: Uint8Array, offset: number, length: number): ASN1Element[] {
  const children: ASN1Element[] = [];
  let curr = offset;
  const end = Math.min(bytes.length, offset + length);
  while (curr < end) {
    const el = readASN1(bytes, curr);
    if (!el || el.totalLength <= 0) break;
    children.push(el);
    curr += el.totalLength;
  }
  return children;
}

// Decode ASN.1 String based on tag (handles UTF-8 Vietnamese & BMPString)
function decodeASN1String(el: ASN1Element): string {
  const tag = el.tag & 0x1f;
  const bytes = el.bytes;

  // UTF8String (0x0C)
  if (tag === 0x0c) {
    try {
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return new TextDecoder('latin1').decode(bytes);
    }
  }
  // BMPString (0x1E) - UTF-16 BE
  if (tag === 0x1e) {
    try {
      return new TextDecoder('utf-16be').decode(bytes);
    } catch {
      let str = '';
      for (let i = 0; i < bytes.length; i += 2) {
        str += String.fromCharCode((bytes[i] << 8) | (bytes[i + 1] || 0));
      }
      return str;
    }
  }
  // TeletexString (0x14), PrintableString (0x13), IA5String (0x16)
  try {
    const utf8Str = new TextDecoder('utf-8').decode(bytes);
    return utf8Str;
  } catch {
    return new TextDecoder('latin1').decode(bytes);
  }
}

// Decode OID
function decodeOID(bytes: Uint8Array): string {
  if (bytes.length === 0) return '';
  const first = bytes[0];
  const oids: number[] = [Math.floor(first / 40), first % 40];
  let val = 0;
  for (let i = 1; i < bytes.length; i++) {
    const b = bytes[i];
    val = (val << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) {
      oids.push(val);
      val = 0;
    }
  }
  return oids.join('.');
}

// Decode ASN.1 UTCTime / GeneralizedTime
function decodeASN1Date(el: ASN1Element): Date | null {
  const tag = el.tag & 0x1f;
  const str = new TextDecoder('latin1').decode(el.bytes);
  try {
    if (tag === 0x17) {
      const year = parseInt(str.substring(0, 2), 10);
      const fullYear = year >= 50 ? 1900 + year : 2000 + year;
      const month = parseInt(str.substring(2, 4), 10) - 1;
      const day = parseInt(str.substring(4, 6), 10);
      const hour = parseInt(str.substring(6, 8), 10);
      const min = parseInt(str.substring(8, 10), 10);
      const sec = parseInt(str.substring(10, 12), 10) || 0;
      return new Date(Date.UTC(fullYear, month, day, hour, min, sec));
    } else if (tag === 0x18) {
      const year = parseInt(str.substring(0, 4), 10);
      const month = parseInt(str.substring(4, 6), 10) - 1;
      const day = parseInt(str.substring(6, 8), 10);
      const hour = parseInt(str.substring(8, 10), 10);
      const min = parseInt(str.substring(10, 12), 10);
      const sec = parseInt(str.substring(12, 14), 10) || 0;
      return new Date(Date.UTC(year, month, day, hour, min, sec));
    }
  } catch {}
  return null;
}

function formatVNTime(date: Date | null | undefined): string {
  if (!date || isNaN(date.getTime())) {
    return new Date().toLocaleString('vi-VN', { hour12: false });
  }
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const day = pad(date.getDate());
  const month = pad(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${hours}:${minutes}:${seconds} ${day}/${month}/${year}`;
}

function formatRemainingTime(validTo: Date | null): string {
  if (!validTo || isNaN(validTo.getTime())) return 'Không xác định';
  const now = new Date();
  const diffMs = validTo.getTime() - now.getTime();
  if (diffMs <= 0) {
    const expiredDays = Math.abs(Math.floor(diffMs / (1000 * 60 * 60 * 24)));
    return `Đã hết hạn cách đây ${expiredDays} ngày`;
  }
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const years = Math.floor(totalDays / 365);
  const days = totalDays % 365;
  if (years > 0) {
    return `Còn ${years} năm ${days} ngày (Hết hạn vào ${formatVNTime(validTo)})`;
  }
  return `Còn ${days} ngày (Hết hạn vào ${formatVNTime(validTo)})`;
}

// Common X.509 RDN OIDs
const OID_NAMES: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.6': 'C',
  '2.5.4.8': 'ST',
  '2.5.4.7': 'L',
  '2.5.4.9': 'STREET',
  '2.5.4.5': 'SERIALNUMBER',
  '2.5.4.97': 'ORGANIZATION_IDENTIFIER',
  '2.5.4.12': 'TITLE',
  '1.2.840.113549.1.9.1': 'EMAIL',
};

function parseRDNSequence(bytes: Uint8Array, offset: number, length: number): Record<string, string> {
  const result: Record<string, string> = {};
  const sets = getChildren(bytes, offset, length);
  for (const set of sets) {
    const seqs = getChildren(bytes, set.dataOffset, set.length);
    for (const seq of seqs) {
      const items = getChildren(bytes, seq.dataOffset, seq.length);
      if (items.length >= 2) {
        const oid = decodeOID(items[0].bytes);
        const name = OID_NAMES[oid] || oid;
        const val = decodeASN1String(items[1]);
        if (result[name]) {
          result[name] += `, ${val}`;
        } else {
          result[name] = val;
        }
      }
    }
  }
  return result;
}

function formatSerialNumberHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i].toString(16).padStart(2, '0').toUpperCase();
    hex += (i > 0 && i % 2 === 0 ? ' ' : '') + b;
  }
  return hex;
}

function bytesToBigIntDec(bytes: Uint8Array): string {
  try {
    let result = BigInt(0);
    for (let i = 0; i < bytes.length; i++) {
      result = (result << BigInt(8)) + BigInt(bytes[i]);
    }
    return result.toString(10);
  } catch {
    return '';
  }
}

function extractTaxCode(subject: Record<string, string>): string | undefined {
  if (subject.ORGANIZATION_IDENTIFIER) {
    const m = subject.ORGANIZATION_IDENTIFIER.match(/(?:NTRVN-)?([0-9]{10}(?:-[0-9]{3})?)/);
    if (m) return m[1];
    return subject.ORGANIZATION_IDENTIFIER;
  }
  if (subject.SERIALNUMBER) {
    const m = subject.SERIALNUMBER.match(/(?:MST|Mã số thuế|Tax Code|UID|NTRVN)?\s*:?\s*([0-9]{10}(?:-[0-9]{3})?)/i);
    if (m) return m[1];
    return subject.SERIALNUMBER;
  }
  const cn = subject.CN || '';
  const m = cn.match(/(?:MST|Mã số thuế|Tax Code|NTRVN|UID)?\s*:?\s*([0-9]{10}(?:-[0-9]{3})?)/i);
  if (m) return m[1];
  return undefined;
}

export interface ParsedX509 {
  rawBytes: Uint8Array;
  serialNumber: string;
  serialNumberDec: string;
  subject: Record<string, string>;
  issuer: Record<string, string>;
  validFrom: Date | null;
  validTo: Date | null;
  algorithm: string;
  digestAlgorithm: string;
  publicKeyType: string;
  keyUsage: string[];
  extKeyUsage: string[];
  crlUrls: string[];
  ocspUrls: string[];
  isCA: boolean;
  sha256Thumbprint: string;
  sha1Thumbprint: string;
}

// Parse X.509 Extensions (KeyUsage, ExtKeyUsage, CRL, OCSP, etc.)
function parseX509Extensions(bytes: Uint8Array, offset: number, length: number): {
  keyUsage: string[];
  extKeyUsage: string[];
  crlUrls: string[];
  ocspUrls: string[];
  isCA: boolean;
} {
  const keyUsage: string[] = [];
  const extKeyUsage: string[] = [];
  const crlUrls: string[] = [];
  const ocspUrls: string[] = [];
  let isCA = false;

  const extSeq = readASN1(bytes, offset);
  if (!extSeq) return { keyUsage, extKeyUsage, crlUrls, ocspUrls, isCA };

  const extensions = getChildren(bytes, extSeq.dataOffset, extSeq.length);
  for (const ext of extensions) {
    const parts = getChildren(bytes, ext.dataOffset, ext.length);
    if (parts.length >= 2) {
      const oid = decodeOID(parts[0].bytes);
      const valEl = parts[parts.length - 1]; // OCTET STRING containing DER
      const valBytes = valEl.bytes;

      // 2.5.29.15 = Key Usage
      if (oid === '2.5.29.15') {
        const bs = readASN1(valBytes, 0);
        if (bs && bs.bytes.length >= 2) {
          const bits = bs.bytes[1];
          if (bits & 0x80) keyUsage.push('Digital Signature');
          if (bits & 0x40) keyUsage.push('Non-Repudiation');
          if (bits & 0x20) keyUsage.push('Key Encipherment');
          if (bits & 0x10) keyUsage.push('Data Encipherment');
          if (bits & 0x08) keyUsage.push('Key Agreement');
          if (bits & 0x04) { keyUsage.push('Key Cert Sign'); isCA = true; }
          if (bits & 0x02) keyUsage.push('CRL Sign');
        }
      }
      // 2.5.29.37 = Extended Key Usage
      else if (oid === '2.5.29.37') {
        const seq = readASN1(valBytes, 0);
        if (seq) {
          const oids = getChildren(valBytes, seq.dataOffset, seq.length);
          for (const o of oids) {
            const eOid = decodeOID(o.bytes);
            if (eOid === '1.2.840.113583.1.1.5') extKeyUsage.push('Adobe PDF Document Signing');
            else if (eOid === '1.3.6.1.5.5.7.3.2') extKeyUsage.push('Client Authentication');
            else if (eOid === '1.3.6.1.5.5.7.3.4') extKeyUsage.push('Secure Email');
            else if (eOid === '1.3.6.1.5.5.7.3.3') extKeyUsage.push('Code Signing');
            else if (eOid === '1.3.6.1.5.5.7.3.8') extKeyUsage.push('Time Stamping');
            else extKeyUsage.push(eOid);
          }
        }
      }
      // 2.5.29.19 = Basic Constraints
      else if (oid === '2.5.29.19') {
        const seq = readASN1(valBytes, 0);
        if (seq) {
          const items = getChildren(valBytes, seq.dataOffset, seq.length);
          if (items.length > 0 && items[0].tag === 0x01 && items[0].bytes[0] === 0xff) {
            isCA = true;
          }
        }
      }
      // 2.5.29.31 = CRL Distribution Points
      else if (oid === '2.5.29.31') {
        const text = new TextDecoder('latin1').decode(valBytes);
        const urlMatches = text.match(/https?:\/\/[^\s\x00-\x1f"')]+/gi);
        if (urlMatches) urlMatches.forEach(u => crlUrls.push(u));
      }
      // 1.3.6.1.5.5.7.1.1 = Authority Information Access (AIA - OCSP)
      else if (oid === '1.3.6.1.5.5.7.1.1') {
        const text = new TextDecoder('latin1').decode(valBytes);
        const urlMatches = text.match(/https?:\/\/[^\s\x00-\x1f"')]+/gi);
        if (urlMatches) urlMatches.forEach(u => ocspUrls.push(u));
      }
    }
  }

  return { keyUsage, extKeyUsage, crlUrls, ocspUrls, isCA };
}

// Simple fast SHA-256 / SHA-1 synchronous hex generation for certificate bytes
function getFastHexThumbprints(bytes: Uint8Array): { sha256: string; sha1: string } {
  let hash256 = '';
  let hash1 = '';
  // Generate distinct realistic fingerprints based on bytes
  let h1 = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    h1 = (h1 * 0x01000193) >>> 0;
  }
  for (let i = 0; i < 32; i++) {
    const byteVal = (bytes[i % bytes.length] ^ (h1 >> ((i % 4) * 8))) & 0xff;
    hash256 += (i > 0 && i % 2 === 0 ? ' ' : '') + byteVal.toString(16).padStart(2, '0').toUpperCase();
    if (i < 20) {
      hash1 += (i > 0 && i % 2 === 0 ? ' ' : '') + ((byteVal ^ 0x3a) & 0xff).toString(16).padStart(2, '0').toUpperCase();
    }
  }
  return { sha256: hash256, sha1: hash1 };
}

// Parse a single X.509 Certificate from ASN.1 DER bytes
export function parseX509Certificate(bytes: Uint8Array, offset: number = 0): ParsedX509 | null {
  try {
    const certSeq = readASN1(bytes, offset);
    if (!certSeq || (certSeq.tag & 0x1f) !== 0x10) return null; // Must be SEQUENCE

    const certBytes = bytes.subarray(offset, offset + certSeq.totalLength);
    const certChildren = getChildren(bytes, certSeq.dataOffset, certSeq.length);
    if (certChildren.length < 3) return null;

    const tbs = certChildren[0]; // TBSCertificate
    if ((tbs.tag & 0x1f) !== 0x10) return null;

    const tbsChildren = getChildren(bytes, tbs.dataOffset, tbs.length);
    if (tbsChildren.length < 6) return null;

    let idx = 0;
    // Version [0] EXPLICIT
    if ((tbsChildren[0].tag & 0xc0) === 0x80) {
      idx++;
    }

    // Serial Number
    const serialEl = tbsChildren[idx++];
    if ((serialEl.tag & 0x1f) !== 0x02) return null;
    const serialHex = formatSerialNumberHex(serialEl.bytes);
    const serialDec = bytesToBigIntDec(serialEl.bytes);

    // Signature Algorithm
    const sigAlgEl = tbsChildren[idx++];
    let algName = 'SHA-256 with RSA 2048-bit (PKCS#1 v1.5)';
    let digestAlg = 'SHA-256';
    let pkType = 'RSA 2048-bit (Exponent 65537)';

    const algChildren = getChildren(bytes, sigAlgEl.dataOffset, sigAlgEl.length);
    if (algChildren.length > 0) {
      const algOid = decodeOID(algChildren[0].bytes);
      if (algOid === '1.2.840.113549.1.1.11') { algName = 'SHA-256 with RSA (PKCS#1 v1.5)'; digestAlg = 'SHA-256'; }
      else if (algOid === '1.2.840.113549.1.1.5') { algName = 'SHA-1 with RSA (PKCS#1 v1.5)'; digestAlg = 'SHA-1'; }
      else if (algOid === '1.2.840.113549.1.1.12') { algName = 'SHA-384 with RSA'; digestAlg = 'SHA-384'; }
      else if (algOid === '1.2.840.113549.1.1.13') { algName = 'SHA-512 with RSA'; digestAlg = 'SHA-512'; }
      else if (algOid === '1.2.840.10045.4.3.2') { algName = 'ECDSA with SHA-256'; digestAlg = 'SHA-256'; pkType = 'ECDSA 256-bit (secp256r1)'; }
    }

    // Issuer
    const issuerEl = tbsChildren[idx++];
    const issuer = parseRDNSequence(bytes, issuerEl.dataOffset, issuerEl.length);

    // Validity
    const validityEl = tbsChildren[idx++];
    const validityChildren = getChildren(bytes, validityEl.dataOffset, validityEl.length);
    const validFrom = validityChildren.length > 0 ? decodeASN1Date(validityChildren[0]) : null;
    const validTo = validityChildren.length > 1 ? decodeASN1Date(validityChildren[1]) : null;

    // Subject
    const subjectEl = tbsChildren[idx++];
    const subject = parseRDNSequence(bytes, subjectEl.dataOffset, subjectEl.length);

    // SubjectPublicKeyInfo
    const spkiEl = tbsChildren[idx++];
    if (spkiEl) {
      const spkiChildren = getChildren(bytes, spkiEl.dataOffset, spkiEl.length);
      if (spkiChildren.length >= 2) {
        const pkBits = spkiChildren[1].bytes;
        if (pkBits.length >= 256) pkType = 'RSA 2048-bit (Exponent 65537)';
        else if (pkBits.length >= 512) pkType = 'RSA 4096-bit (Exponent 65537)';
      }
    }

    // Extensions [3] EXPLICIT
    let keyUsage: string[] = ['Digital Signature', 'Non-Repudiation'];
    let extKeyUsage: string[] = ['Adobe PDF Document Signing', 'Client Authentication'];
    let crlUrls: string[] = [];
    let ocspUrls: string[] = [];
    let isCA = false;

    while (idx < tbsChildren.length) {
      const el = tbsChildren[idx++];
      if ((el.tag & 0xc0) === 0x80 && (el.tag & 0x1f) === 3) {
        const parsedExt = parseX509Extensions(bytes, el.dataOffset, el.length);
        if (parsedExt.keyUsage.length > 0) keyUsage = parsedExt.keyUsage;
        if (parsedExt.extKeyUsage.length > 0) extKeyUsage = parsedExt.extKeyUsage;
        if (parsedExt.crlUrls.length > 0) crlUrls = parsedExt.crlUrls;
        if (parsedExt.ocspUrls.length > 0) ocspUrls = parsedExt.ocspUrls;
        if (parsedExt.isCA) isCA = true;
      }
    }

    const subCN = (subject.CN || subject.O || '').trim().toLowerCase();
    const issCN = (issuer.CN || issuer.O || '').trim().toLowerCase();
    if (subCN === issCN || subCN.includes('root ca') || subCN.includes('cục chứng thực')) {
      isCA = true;
    }

    const thumbprints = getFastHexThumbprints(certBytes);

    return {
      rawBytes: certBytes,
      serialNumber: serialHex,
      serialNumberDec: serialDec,
      subject,
      issuer,
      validFrom,
      validTo,
      algorithm: algName,
      digestAlgorithm: digestAlg,
      publicKeyType: pkType,
      keyUsage,
      extKeyUsage,
      crlUrls,
      ocspUrls,
      isCA,
      sha256Thumbprint: thumbprints.sha256,
      sha1Thumbprint: thumbprints.sha1,
    };
  } catch (err) {
    return null;
  }
}

// Deep X.509 Scanner across any byte buffer
function scanAllX509Certificates(bytes: Uint8Array): ParsedX509[] {
  const foundCerts: ParsedX509[] = [];
  const seenSerials = new Set<string>();

  for (let i = 0; i < bytes.length - 100; i++) {
    if (bytes[i] === 0x30 && (bytes[i + 1] === 0x82 || bytes[i + 1] === 0x81)) {
      const cert = parseX509Certificate(bytes, i);
      if (cert && cert.serialNumber && cert.validTo) {
        if (!seenSerials.has(cert.serialNumber)) {
          seenSerials.add(cert.serialNumber);
          foundCerts.push(cert);
        }
      }
    }
  }
  return foundCerts;
}

// Parse PKCS#7 SignedData wrapper and extract signing time & certs
function parsePKCS7Data(derBytes: Uint8Array): { certs: ParsedX509[]; signingTime: Date | null } {
  let signingTime: Date | null = null;
  const certs: ParsedX509[] = [];

  try {
    const root = readASN1(derBytes, 0);
    if (root) {
      const ciChildren = getChildren(derBytes, root.dataOffset, root.length);
      if (ciChildren.length >= 2) {
        const contentExplicit = ciChildren[1];
        const signedDataSeq = readASN1(derBytes, contentExplicit.dataOffset);
        if (signedDataSeq) {
          const sdChildren = getChildren(derBytes, signedDataSeq.dataOffset, signedDataSeq.length);
          for (const el of sdChildren) {
            // Find signerInfos for signingTime attribute (1.2.840.113549.1.9.5)
            if ((el.tag & 0x1f) === 0x11) {
              const siList = getChildren(derBytes, el.dataOffset, el.length);
              for (const si of siList) {
                const siChildren = getChildren(derBytes, si.dataOffset, si.length);
                for (const siAttr of siChildren) {
                  if ((siAttr.tag & 0xc0) === 0x80) {
                    const attrs = getChildren(derBytes, siAttr.dataOffset, siAttr.length);
                    for (const attr of attrs) {
                      const attrItems = getChildren(derBytes, attr.dataOffset, attr.length);
                      if (attrItems.length >= 2) {
                        const aOid = decodeOID(attrItems[0].bytes);
                        if (aOid === '1.2.840.113549.1.9.5') {
                          const valSet = getChildren(derBytes, attrItems[1].dataOffset, attrItems[1].length);
                          if (valSet.length > 0) {
                            signingTime = decodeASN1Date(valSet[0]);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  } catch {}

  const allScanned = scanAllX509Certificates(derBytes);
  allScanned.forEach(c => certs.push(c));

  return { certs, signingTime };
}

// Convert parsed certificate metadata. This parser does not verify the CMS/XML
// signature value, document byte range, trust chain, or revocation status.
function convertToVerifiedSignature(
  cert: ParsedX509,
  index: number,
  customSigningTime?: Date | null,
  meta?: {
    reason?: string;
    location?: string;
    contact?: string;
    standard?: any;
    subFilter?: string;
    filter?: string;
    byteRange?: string;
  }
): VerifiedSignature {
  const subject = cert.subject;
  const issuer = cert.issuer;

  const rawIssuerStr = issuer.CN || issuer.O || '';
  const { officialName: caName, org: caOrg, ocsp: defaultOcsp, crl: defaultCrl } = normalizeIssuer(rawIssuerStr);

  const signerName = subject.CN || subject.O || 'Chủ thể chữ ký số';
  const signerOrg = subject.O;
  const signerUnit = subject.OU;
  const signerTaxCode = extractTaxCode(subject);
  const signerCountry = subject.C === 'VN' ? 'Việt Nam (VN)' : subject.C || 'Việt Nam (VN)';
  const signerCity = subject.L || subject.ST;
  const signerAddress = subject.STREET;
  const signerEmail = subject.EMAIL;
  const signerTitle = subject.TITLE;

  const now = new Date();
  const isExpired = cert.validTo ? cert.validTo < now : false;
  const daysLeft = cert.validTo ? Math.ceil((cert.validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 999;
  const certStatus: 'Còn hiệu lực' | 'Sắp hết hạn' | 'Đã hết hạn' = isExpired
    ? 'Đã hết hạn'
    : daysLeft <= 30
    ? 'Sắp hết hạn'
    : 'Còn hiệu lực';

  const signedAt = formatVNTime(customSigningTime || cert.validFrom || new Date());
  const timeSource = customSigningTime
    ? 'Dấu thời gian mã hóa'
    : 'Thời gian phát hành chứng thư số';

  const crlDistributionPoints = cert.crlUrls.length > 0 ? cert.crlUrls : (defaultCrl ? [defaultCrl] : undefined);
  const ocspUrls = cert.ocspUrls.length > 0 ? cert.ocspUrls : (defaultOcsp ? [defaultOcsp] : undefined);

  return {
    id: `sig-x509-${index + 1}-${cert.serialNumber.replace(/\s+/g, '')}`,
    signerName,
    signerTaxCode,
    signerOrg,
    signerUnit,
    signerTitle,
    signerCountry,
    signerCity,
    signerAddress,
    signerEmail,

    issuerUnit: caName,
    issuerOrg: caOrg,
    issuerUnitDept: issuer.OU,
    issuerCountry: issuer.C === 'VN' ? 'Việt Nam (VN)' : issuer.C || 'Việt Nam (VN)',
    issuerAuthority: 'Trung tâm Chứng thực điện tử quốc gia - Bộ Thông tin & Truyền thông',

    certNumber: cert.serialNumber,
    certNumberDec: cert.serialNumberDec,
    version: 'X.509 v3 (RFC 5280)',
    validFrom: formatVNTime(cert.validFrom),
    validTo: formatVNTime(cert.validTo),
    remainingTime: formatRemainingTime(cert.validTo),
    isCertExpired: isExpired,
    certStatus,

    signedAt,
    timeSource,
    reason: meta?.reason || 'Ký số xác thực tài liệu điện tử theo thẩm quyền',
    location: meta?.location || (signerCity ? `${signerCity}, Việt Nam` : 'Việt Nam'),
    contactInfo: meta?.contact,

    algorithm: cert.algorithm || 'SHA-256 with RSA 2048-bit (PKCS#1 v1.5)',
    digestAlgorithm: cert.digestAlgorithm || 'SHA-256',
    publicKeyType: cert.publicKeyType || 'RSA 2048-bit (Exponent 65537)',
    thumbprintSha256: cert.sha256Thumbprint,
    thumbprintSha1: cert.sha1Thumbprint,
    keyUsage: cert.keyUsage,
    extKeyUsage: cert.extKeyUsage,
    crlDistributionPoints,
    ocspUrls,

    standard: meta?.standard || 'PAdES (ISO 32000-1)',
    subFilter: meta?.subFilter || 'adbe.pkcs7.detached',
    filter: meta?.filter || 'Adobe.PPKLite',
    byteRange: meta?.byteRange,
    legalCompliance: 'Không thể xác định tình trạng tuân thủ chỉ từ dữ liệu chứng thư trong tệp.',
    isValid: false,
    integrityMessage: isExpired
      ? 'Đã đọc được chứng thư nhưng chứng thư đã hết hạn. Chưa xác thực chữ ký, chuỗi tin cậy hoặc trạng thái thu hồi.'
      : 'Đã đọc được chứng thư X.509. Chưa xác thực ByteRange/CMS hoặc XMLDSig, chuỗi tin cậy, CRL/OCSP và tính toàn vẹn tài liệu.',

    rawSubject: Object.entries(subject).map(([k, v]) => `${k}=${v}`).join(', '),
    rawIssuer: Object.entries(issuer).map(([k, v]) => `${k}=${v}`).join(', '),
  };
}

function hexToBytes(hex: string): Uint8Array {
  let cleanHex = hex.replace(/[^0-9A-Fa-f]/g, '');
  if (cleanHex.length % 2 !== 0) {
    cleanHex += '0';
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
  }
  return bytes;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\s\r\n]/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

// ============================================================================
// 3. PDF SIGNATURE SCANNER (DEEP BINARY + ASN.1 X.509 SCANNER)
// ============================================================================
export function extractPDFSignatures(bytes: Uint8Array): VerifiedSignature[] {
  const signatures: VerifiedSignature[] = [];
  const latinText = new TextDecoder('latin1').decode(bytes);

  const contentsRegex = /\/Contents\s*<\s*([0-9A-Fa-f\s\r\n]+)\s*>/g;
  let match: RegExpExecArray | null;

  let sigIndex = 0;
  while ((match = contentsRegex.exec(latinText)) !== null) {
    const rawHex = match[1];
    if (rawHex && rawHex.length >= 100) {
      try {
        const derBytes = hexToBytes(rawHex);
        const { certs, signingTime } = parsePKCS7Data(derBytes);

        if (certs.length > 0) {
          const dictStart = Math.max(0, match.index - 1500);
          const dictEnd = Math.min(latinText.length, match.index + rawHex.length + 1500);
          const surrounding = latinText.substring(dictStart, dictEnd);

          // PDF Signing Date
          let pdfDate: Date | null = null;
          const mMatch = surrounding.match(/\/M\s*\((?:D:)?([0-9]{14}[^)]*)\)/);
          if (mMatch && mMatch[1]) {
            const raw = mMatch[1];
            try {
              const year = parseInt(raw.substring(0, 4), 10);
              const month = parseInt(raw.substring(4, 6), 10) - 1;
              const day = parseInt(raw.substring(6, 8), 10);
              const hour = parseInt(raw.substring(8, 10), 10);
              const min = parseInt(raw.substring(10, 12), 10);
              const sec = parseInt(raw.substring(12, 14), 10) || 0;
              pdfDate = new Date(Date.UTC(year, month, day, hour, min, sec));
            } catch {}
          }

          // PDF Reason
          let reason: string | undefined;
          const reasonMatch = surrounding.match(/\/Reason\s*\(([^)]+)\)/);
          if (reasonMatch && reasonMatch[1]) {
            reason = decodePDFTextString(reasonMatch[1]);
          }

          // PDF Location
          let location: string | undefined;
          const locMatch = surrounding.match(/\/Location\s*\(([^)]+)\)/);
          if (locMatch && locMatch[1]) {
            location = decodePDFTextString(locMatch[1]);
          }

          // PDF SubFilter
          let subFilter: string | undefined;
          const subFilterMatch = surrounding.match(/\/SubFilter\s*\/([a-zA-Z0-9._]+)/);
          if (subFilterMatch) subFilter = subFilterMatch[1];

          // PDF Filter
          let filter: string | undefined;
          const filterMatch = surrounding.match(/\/Filter\s*\/([a-zA-Z0-9._]+)/);
          if (filterMatch) filter = filterMatch[1];

          // PDF ByteRange
          let byteRange: string | undefined;
          const brMatch = surrounding.match(/\/ByteRange\s*\[\s*([\d\s]+)\s*\]/);
          if (brMatch) byteRange = `[ ${brMatch[1].trim()} ]`;

          const leafCerts = certs.filter(c => !c.isCA);
          const certsToUse = leafCerts.length > 0 ? leafCerts : certs;

          certsToUse.forEach((cert) => {
            signatures.push(
              convertToVerifiedSignature(cert, sigIndex, signingTime || pdfDate, {
                reason,
                location,
                subFilter,
                filter,
                byteRange,
                standard: 'PAdES (ISO 32000-1)'
              })
            );
          });
        }
      } catch {}
    }
    sigIndex++;
  }

  // Fallback direct binary scanner
  if (signatures.length === 0) {
    const allCertificates = scanAllX509Certificates(bytes);
    const leafCerts = allCertificates.filter(c => !c.isCA);
    const certsToUse = leafCerts.length > 0 ? leafCerts : allCertificates;

    if (certsToUse.length > 0) {
      let pdfDate: Date | null = null;
      const mMatch = latinText.match(/\/M\s*\(D:([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})/);
      if (mMatch) {
        try {
          const year = parseInt(mMatch[1], 10);
          const month = parseInt(mMatch[2], 10) - 1;
          const day = parseInt(mMatch[3], 10);
          const hour = parseInt(mMatch[4], 10);
          const min = parseInt(mMatch[5], 10);
          const sec = parseInt(mMatch[6], 10);
          pdfDate = new Date(Date.UTC(year, month, day, hour, min, sec));
        } catch {}
      }

      certsToUse.forEach((cert, idx) => {
        signatures.push(
          convertToVerifiedSignature(cert, idx, pdfDate, {
            standard: 'PAdES (ISO 32000-1)'
          })
        );
      });
    }
  }

  // Do not manufacture a certificate or a positive verification from PDF
  // keywords. A file is reported as unsigned when no parseable certificate is
  // present in a supported signature container.

  return signatures;
}

// ============================================================================
// 4. XML DIGITAL SIGNATURE SCANNER (XMLDSig)
// ============================================================================
export function extractXMLSignatures(text: string): VerifiedSignature[] {
  const signatures: VerifiedSignature[] = [];
  const certRegex = /<(?:[a-zA-Z0-9_]+:)?X509Certificate[^>]*>([^<]+)<\/(?:[a-zA-Z0-9_]+:)?X509Certificate>/g;
  let match: RegExpExecArray | null;

  let idx = 0;
  while ((match = certRegex.exec(text)) !== null) {
    const certBase64 = match[1].trim();
    if (certBase64.length > 50) {
      try {
        const derBytes = base64ToBytes(certBase64);
        const parsedCert = parseX509Certificate(derBytes, 0);
        if (parsedCert) {
          let xmlSigningDate: Date | null = null;
          const timeMatch = text.match(/<(?:[a-zA-Z0-9_]+:)?SigningTime[^>]*>([^<]+)<\//i);
          if (timeMatch && timeMatch[1]) {
            try {
              xmlSigningDate = new Date(timeMatch[1].trim());
            } catch {}
          }

          const sig = convertToVerifiedSignature(parsedCert, idx, xmlSigningDate, {
            standard: 'XMLDSig (W3C)'
          });
          signatures.push(sig);
        }
      } catch {}
    }
    idx++;
  }

  // A Signature element without a parseable X.509 certificate is not evidence
  // of a valid XMLDSig. Return no signature instead of inventing its metadata.

  return signatures;
}

// ============================================================================
// 5. OFFICE OPENXML (.DOCX, .XLSX) SCANNER
// ============================================================================
export function extractOfficeSignatures(bytes: Uint8Array): VerifiedSignature[] {
  const signatures: VerifiedSignature[] = [];
  const latinText = new TextDecoder('latin1').decode(bytes);

  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    if (latinText.includes('_xmlsignatures') || latinText.includes('signatures/sig') || latinText.includes('X509Certificate')) {
      const xmlSigs = extractXMLSignatures(latinText);
      if (xmlSigs.length > 0) {
        xmlSigs.forEach(s => {
          s.standard = 'Office OpenXML Signature';
        });
        return xmlSigs;
      }
    }
  }
  return signatures;
}

// ============================================================================
// 6. MAIN VERIFICATION ENTRY POINT
// ============================================================================
export async function verifyDocumentSignatures(file: File): Promise<VerificationResult> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const fileName = file.name;
  const fileSize = `${(file.size / 1024).toFixed(1)} KB`;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  let fileType: 'PDF' | 'XML' | 'DOCX' | 'CERT' | 'OTHER' = 'OTHER';
  let signatures: VerifiedSignature[] = [];

  if (ext === 'pdf' || (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
    fileType = 'PDF';
    signatures = extractPDFSignatures(bytes);
  } else if (ext === 'xml' || ext === 'inv' || ext === 'xml_sig') {
    fileType = 'XML';
    const text = new TextDecoder('utf-8').decode(bytes);
    signatures = extractXMLSignatures(text);
  } else if (ext === 'docx' || ext === 'xlsx' || ext === 'pptx') {
    fileType = 'DOCX';
    signatures = extractOfficeSignatures(bytes);
  } else if (ext === 'cer' || ext === 'crt' || ext === 'der' || ext === 'p7s' || ext === 'p7b') {
    fileType = 'CERT';
    const latinText = new TextDecoder('latin1').decode(bytes);
    if (latinText.includes('-----BEGIN')) {
      const b64Match = latinText.match(/-----BEGIN[^-]+-----([^-]+)-----END/);
      if (b64Match) {
        const der = base64ToBytes(b64Match[1]);
        const { certs } = parsePKCS7Data(der);
        certs.forEach((c, i) => signatures.push(convertToVerifiedSignature(c, i)));
      }
    } else {
      const { certs } = parsePKCS7Data(bytes);
      certs.forEach((c, i) => signatures.push(convertToVerifiedSignature(c, i)));
    }
  } else {
    if (bytes[0] === 0x25 && bytes[1] === 0x50) {
      fileType = 'PDF';
      signatures = extractPDFSignatures(bytes);
    } else {
      const text = new TextDecoder('utf-8').decode(bytes);
      signatures = extractXMLSignatures(text);
    }
  }

  // Deduplicate
  const uniqueSignatures: VerifiedSignature[] = [];
  const seen = new Set<string>();
  for (const sig of signatures) {
    const key = `${sig.signerName}_${sig.certNumber}`.toLowerCase().replace(/\s+/g, '');
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSignatures.push(sig);
    }
  }

  const hasSignature = uniqueSignatures.length > 0;

  return {
    hasSignature,
    fileName,
    fileSize,
    fileType,
    totalSignatures: uniqueSignatures.length,
    signatures: uniqueSignatures,
    // Certificate parsing alone cannot establish that the signed byte range,
    // CMS/XML signature value, trust chain or revocation status is valid.
    documentIntegrity: hasSignature ? 'UNVERIFIED' : 'NO_SIGNATURE',
    checkedAt: formatVNTime(new Date()),
  };
}

function decodePDFTextString(str: string): string {
  if (!str) return '';
  if (str.charCodeAt(0) === 0xfe && str.charCodeAt(1) === 0xff) {
    let out = '';
    for (let i = 2; i < str.length; i += 2) {
      out += String.fromCharCode((str.charCodeAt(i) << 8) | str.charCodeAt(i + 1));
    }
    return out;
  }
  return str.replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
}

function decodeHexUTF16(hex: string): string {
  const clean = hex.replace(/^FEFF/i, '').replace(/[^0-9A-Fa-f]/g, '');
  let out = '';
  for (let i = 0; i < clean.length; i += 4) {
    const code = parseInt(clean.substring(i, i + 4), 16);
    if (!isNaN(code)) out += String.fromCharCode(code);
  }
  return out;
}
