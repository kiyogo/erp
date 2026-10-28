import { createServer } from 'node:http';
import { createCipheriv, createDecipheriv, createHash, createHmac, createPublicKey, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, verify as verifySignature } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import db, { initDatabaseSchema } from './db.mjs';
import cryptoService, { encryptField, decryptField, isEncrypted, computeBlindIndex } from './crypto.mjs';
import logger from './logger.mjs';
import { createBackupManager } from './backups.mjs';
import { createDocxFromText } from './document-files.mjs';
import {
  maskPhone,
  maskEmail,
  maskBankAccount,
  maskIdNumber,
  canViewFullEmployee,
  canViewSalary,
  serializeEmployeeSummary,
  serializeEmployeeDetail,
  serializeUserProfile,
  serializeContract,
  serializeCollectionRecord,
} from './serializers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scrypt = promisify(scryptCallback);
const API_PREFIX = '/api/v1';
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.KIYOVN_DATA_DIR || path.join(__dirname, 'data'));
const DB_PATH = path.resolve(process.env.KIYOVN_DB_PATH || path.join(DATA_DIR, 'kiyovn.sqlite'));
const FILES_DIR = path.resolve(process.env.KIYOVN_FILES_DIR || path.join(DATA_DIR, 'files'));
const backupManager = createBackupManager({ db, filesDir: FILES_DIR, dataDir: DATA_DIR });
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT = 8;
const TOKEN_TTL_SECONDS = 12 * 60 * 60;
const loginAttempts = new Map();
const ekycSessions = new Map();

function cleanOldEkycSessions() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [token, session] of ekycSessions.entries()) {
    if (session.createdAt < cutoff) {
      ekycSessions.delete(token);
    }
  }
}
setInterval(cleanOldEkycSessions, 60 * 60 * 1000);
const DEFAULT_EMPLOYEE_SYSTEM_FILE_NAMES = [
  'Quy_che_va_Noi_quy_lao_dong_2026.docx',
  'Phieu_luong_dien_tu_T08_2026.pdf',
  'Bien_ban_ban_giao_tai_san_thiet_bi.pdf',
];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

await mkdir(FILES_DIR, { recursive: true });
await initDatabaseSchema();

async function getJwtSecret() {
  const supplied = process.env.JWT_SECRET?.trim();
  if (supplied) return supplied;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required when NODE_ENV=production.');
  }

  const secretPath = path.join(DATA_DIR, '.jwt-secret');
  try {
    const stored = (await readFile(secretPath, 'utf8')).trim();
    if (stored.length >= 32) return stored;
  } catch {
    // The local secret is initialized below.
  }

  const generated = randomBytes(48).toString('base64url');
  await writeFile(secretPath, `${generated}\n`, { encoding: 'utf8', mode: 0o600 });
  return generated;
}

const jwtSecret = await getJwtSecret();
const settingsCipherKey = createHash('sha256').update(process.env.MAIL_CONFIG_ENCRYPTION_KEY || jwtSecret).digest();

function now() {
  return new Date().toISOString();
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function publicUser(row, profile = null) {
  if (!row) return null;
  return {
    ...serializeUserProfile(row, profile),
    ...(row.activation_pending !== undefined ? { activationStatus: row.activation_pending ? 'Chờ kích hoạt' : profile?.employment_status === 'Đã nghỉ việc' ? 'Đã nghỉ việc' : row.is_active ? 'Đang hoạt động' : 'Đã khóa' } : {}),
  };
}

function formatRelativeTime(isoString) {
  if (!isoString) return '';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Vừa xong';
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMs / 3600000);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 30) return `${diffDays} ngày trước`;
  return String(isoString).slice(0, 10);
}

function publicNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type || 'system',
    link: row.link || '',
    read: Boolean(row.is_read),
    unread: !Boolean(row.is_read),
    createdAt: row.created_at,
    time: formatRelativeTime(row.created_at),
  };
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function jsonObject(value, field = 'Thông tin hồ sơ') {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(422, `${field} không hợp lệ.`);
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > 50 * 1024 * 1024) throw new HttpError(422, `${field} vượt quá dung lượng cho phép.`);
  return value;
}

const EMPLOYMENT_STATUSES = ['Chính thức', 'Thử việc', 'Đã nghỉ việc'];

async function employeeProfileRowByUserId(userId) {
  if (!userId) return null;
  return await db.prepare(`
    SELECT u.*, p.phone, p.department, p.position, p.employment_status, p.join_date,
      p.salary_base, p.avatar_url, p.details_json, p.created_at AS profile_created_at,
      p.updated_at AS profile_updated_at
    FROM users u
    LEFT JOIN employee_profiles p ON p.user_id = u.id
    WHERE u.id = ? OR LOWER(u.employee_code) = LOWER(?) OR p.user_id = ?
    LIMIT 1
  `).get(userId, userId, userId);
}

function publicEmployee(row, actor = null) {
  if (!row) return null;
  return serializeEmployeeDetail(row, row, actor || { role: 'ADMIN' });
}

function publicEmployeeSummary(row, actor = null) {
  if (!row) return null;
  return serializeEmployeeSummary(row, row, actor || { role: 'ADMIN' });
}

async function ensureEmployeeProfile(user, input = {}) {
  const existing = await db.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').get(user.id);
  if (existing) return existing;
  const timestamp = now();
  const rawDetails = jsonObject(input.details, 'Thông tin hồ sơ');
  const details = { ...rawDetails };
  const sensitiveKeys = ['idNumber', 'docNumber', 'bankAccount', 'taxCode', 'resAddress'];
  for (const k of sensitiveKeys) {
    if (details[k] && !isEncrypted(details[k])) {
      details[k] = encryptField(details[k], 'profile');
    }
  }

  const rawPhone = optionalText(input.phone, 'Số điện thoại', 32);
  const encryptedPhone = rawPhone && !isEncrypted(rawPhone) ? encryptField(rawPhone, 'profile') : rawPhone;

  await db.prepare(`INSERT INTO employee_profiles (
    user_id, phone, department, position, employment_status, join_date, salary_base,
    avatar_url, details_json, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      user.id,
      encryptedPhone,
      optionalText(input.department, 'Phòng ban', 160),
      optionalText(input.position, 'Chức danh', 160),
      EMPLOYMENT_STATUSES.includes(input.status) ? input.status : 'Chính thức',
      input.joinDate ? requiredIsoDate(input.joinDate, 'Ngày vào làm') : '',
      optionalAmount(input.salaryBase, 'Lương cơ bản'),
      optionalText(input.avatar, 'Ảnh đại diện', 25_000_000),
      JSON.stringify(details),
      timestamp,
      timestamp,
    );
  return await db.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').get(user.id);
}

async function updateEmployeeProfileRecord(userId, input, { allowIdentityChanges = false } = {}) {
  const current = await employeeProfileRowByUserId(userId);
  if (!current) throw new HttpError(404, 'Không tìm thấy nhân sự.');
  const realUserId = current.id;
  await ensureEmployeeProfile(current);
  const profile = await db.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').get(realUserId);
  const changes = input || {};

  let name = current.name;
  let email = current.email;
  let employeeCode = current.employee_code;
  if (allowIdentityChanges && (changes.name !== undefined || changes.fullName !== undefined)) {
    name = requiredText(changes.name ?? changes.fullName, 'Họ tên', 160);
  }
  if (allowIdentityChanges && changes.email !== undefined) {
    email = normalizeEmail(changes.email);
    const sameEmailOwner = await getUserByEmail(email);
    if (sameEmailOwner && sameEmailOwner.id !== realUserId) throw new HttpError(409, 'Email đã tồn tại.');
  }
  if (allowIdentityChanges && (changes.code !== undefined || changes.employeeCode !== undefined)) {
    employeeCode = requiredText(changes.code ?? changes.employeeCode, 'Mã nhân sự', 64).toUpperCase();
    const sameCodeOwner = await db.prepare('SELECT id FROM users WHERE employee_code = ?').get(employeeCode);
    if (sameCodeOwner && sameCodeOwner.id !== realUserId) throw new HttpError(409, 'Mã nhân sự đã tồn tại.');
  }

  let phone = profile.phone;
  if (changes.phone !== undefined) {
    const rawPhone = optionalText(changes.phone, 'Số điện thoại', 32);
    phone = rawPhone && !isEncrypted(rawPhone) ? encryptField(rawPhone, 'profile') : rawPhone;
  }

  const department = changes.department === undefined ? profile.department : optionalText(changes.department, 'Phòng ban', 160);

  if (changes.department !== undefined && allowIdentityChanges) {
    try {
      const orgUnitRows = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'business_org_units'").all();
      for (const uRow of orgUnitRows) {
        const u = parseJsonObject(uRow.payload_json);
        if (u && u.manager && u.manager !== 'Chưa phân công') {
          const mgr = String(u.manager).trim().toLowerCase();
          const empName = String(name || current.name).trim().toLowerCase();
          const empCode = String(employeeCode || current.employee_code).trim().toLowerCase();
          if (mgr === empName || mgr === empCode || mgr.includes(empName) || (empCode && mgr.includes(empCode))) {
            const newDeptStr = String(department || '').toLowerCase();
            const uName = String(u.name || '').toLowerCase();
            const uCode = String(u.code || '').toLowerCase();
            if (uName && !newDeptStr.includes(uName) && (!uCode || !newDeptStr.includes(uCode))) {
              throw new HttpError(422, `Nhân sự "${current.name}" đang là Trưởng đơn vị của "${u.name}". Vui lòng gỡ hoặc thay đổi Trưởng đơn vị tại mục Đơn vị tổ chức trước khi xóa đơn vị của nhân sự này.`);
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
    }
  }
  const position = changes.position === undefined ? profile.position : optionalText(changes.position, 'Chức danh', 160);
  const status = changes.status === undefined
    ? (profile.employment_status || 'Chính thức')
    : oneOf(changes.status, 'Trạng thái nhân sự', EMPLOYMENT_STATUSES);
  const joinDate = changes.joinDate === undefined
    ? profile.join_date
    : changes.joinDate ? requiredIsoDate(changes.joinDate, 'Ngày vào làm') : '';
  const salaryBase = changes.salaryBase === undefined ? Number(profile.salary_base || 0) : optionalAmount(changes.salaryBase, 'Lương cơ bản');
  const avatar = changes.avatar === undefined ? profile.avatar_url : optionalText(changes.avatar, 'Ảnh đại diện', 25_000_000);
  
  const currentDetails = parseJsonObject(profile.details_json);
  const inputDetails = changes.details === undefined ? currentDetails : { ...currentDetails, ...jsonObject(changes.details, 'Thông tin hồ sơ') };
  const details = { ...inputDetails };
  const sensitiveKeys = ['idNumber', 'docNumber', 'bankAccount', 'taxCode', 'resAddress'];
  for (const k of sensitiveKeys) {
    if (details[k] && !isEncrypted(details[k])) {
      details[k] = encryptField(details[k], 'profile');
    }
  }
  const timestamp = now();

  await db.transaction(async () => {
    if (allowIdentityChanges && (changes.password || changes.newPassword)) {
      const rawPass = String(changes.password || changes.newPassword).trim();
      if (rawPass) {
        const passwordHash = await hashPassword(validatePassword(rawPass));
        await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, realUserId);
      }
    }
    await db.prepare('UPDATE users SET name = ?, email = ?, employee_code = ?, updated_at = ? WHERE id = ?')
      .run(name, email, employeeCode, timestamp, realUserId);
    await db.prepare(`UPDATE employee_profiles SET
      phone = ?, department = ?, position = ?, employment_status = ?, join_date = ?,
      salary_base = ?, avatar_url = ?, details_json = ?, updated_at = ?
      WHERE user_id = ?`)
      .run(phone, department, position, status, joinDate, salaryBase, avatar, JSON.stringify(details), timestamp, realUserId);
    if (status === 'Đã nghỉ việc') {
      await cleanupEmptyEmployeeWorkspace(realUserId);
    } else {
      await ensureEmployeeWorkspace(await getUserById(realUserId));
    }
  });
  const updatedRow = await employeeProfileRowByUserId(realUserId);
  return serializeEmployeeDetail(updatedRow, updatedRow, { role: 'ADMIN' });
}

async function getSystemSetting(key) {
  const row = await db.prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?').get(key);
  return row ? row.setting_value : '';
}

async function setSystemSetting(key, value) {
  await db.prepare(`INSERT INTO system_settings (setting_key, setting_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`)
    .run(key, value, now());
}

function encryptSetting(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', settingsCipherKey, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptSetting(value) {
  const [ivValue, tagValue, encryptedValue] = String(value || '').split('.');
  if (!ivValue || !tagValue || !encryptedValue) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', settingsCipherKey, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

async function getEmailConfig() {
  const raw = await getSystemSetting('email_config');
  const stored = parseJsonObject(raw);
  const host = String(stored.host || '').trim() || 'smtp.gmail.com';
  const port = Number(stored.port || 587);
  const username = String(stored.username || stored.senderEmail || '').trim();
  const senderEmail = String(stored.senderEmail || stored.username || '').trim();
  const senderName = String(stored.senderName || 'KIYOVN Enterprise').trim();
  const security = stored.security === 'SSL' ? 'SSL' : 'STARTTLS';
  const portalUrl = String(stored.portalUrl || process.env.PORTAL_BASE_URL || 'http://localhost:3004').replace(/\/$/, '');
  const enabled = stored.enabled === false ? false : true;
  const password = (decryptSetting(stored.passwordEncrypted) || String(stored.password || '')).trim();
  const configured = Boolean(enabled && host && port > 0 && senderEmail && password);
  return {
    host,
    port,
    username: username || senderEmail,
    senderEmail,
    senderName,
    security,
    portalUrl,
    enabled,
    password,
    passwordConfigured: Boolean(password),
    configured,
  };
}

async function publicEmailConfig() {
  const config = await getEmailConfig();
  return config;
}

async function saveEmailConfig(input) {
  const existing = await getEmailConfig();
  const host = requiredText(input.host, 'Máy chủ SMTP', 255);
  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(422, 'Cổng SMTP không hợp lệ.');
  const senderEmail = normalizeEmail(input.senderEmail);
  const username = optionalText(input.username, 'Tài khoản SMTP', 254) || senderEmail;
  const password = input.password === undefined || input.password === '' ? existing.password : String(input.password);
  if (!password) throw new HttpError(422, 'Vui lòng nhập mật khẩu hoặc App Password SMTP.');
  const portalUrl = optionalText(input.portalUrl, 'Địa chỉ cổng nhân viên', 500) || existing.portalUrl;
  if (!/^https?:\/\/[^\s]+$/i.test(portalUrl)) throw new HttpError(422, 'Địa chỉ cổng nhân viên phải bắt đầu bằng http:// hoặc https://.');
  const config = {
    host,
    port,
    username,
    senderEmail,
    senderName: optionalText(input.senderName, 'Tên người gửi', 120) || 'KIYOVN Enterprise',
    security: input.security === 'SSL' ? 'SSL' : 'STARTTLS',
    portalUrl: portalUrl.replace(/\/$/, ''),
    enabled: input.enabled === false ? false : true,
    passwordEncrypted: encryptSetting(password),
  };
  await setSystemSetting('email_config', JSON.stringify(config));
  return await publicEmailConfig();
}

const DEFAULT_ACTIVATION_TEMPLATE = {
  subject: 'Kích hoạt tài khoản KIYOVN Enterprise',
  heading: 'Chào mừng bạn đến với KIYOVN',
  body: 'Tài khoản công việc của bạn đã sẵn sàng. Vui lòng kích hoạt để đặt mật khẩu và hoàn tất hồ sơ.',
  buttonLabel: 'Kích hoạt tài khoản',
  footer: 'Liên kết có hiệu lực trong 02 ngày. Nếu bạn yêu cầu gửi lại, chỉ liên kết mới nhất còn hiệu lực.',
};

async function getActivationTemplate() {
  return { ...DEFAULT_ACTIVATION_TEMPLATE, ...parseJsonObject(await getSystemSetting('activation_email_template')) };
}

async function saveActivationTemplate(input) {
  const template = {
    subject: requiredText(input.subject, 'Tiêu đề email', 200),
    heading: requiredText(input.heading, 'Tiêu đề thư', 200),
    body: requiredText(input.body, 'Nội dung thư', 4_000),
    buttonLabel: requiredText(input.buttonLabel, 'Nhãn nút', 100),
    footer: requiredText(input.footer, 'Ghi chú cuối thư', 1_000),
  };
  await setSystemSetting('activation_email_template', JSON.stringify(template));
  return template;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>\"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

async function createActivationToken(userId) {
  const rawToken = randomBytes(32).toString('base64url');
  const timestamp = now();
  const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare('UPDATE activation_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(timestamp, userId);
  await db.prepare(`INSERT INTO activation_tokens (id, user_id, token_hash, issued_at, expires_at)
    VALUES (?, ?, ?, ?, ?)`)
    .run(randomUUID(), userId, createHash('sha256').update(rawToken).digest('hex'), timestamp, expiresAt);
  return { rawToken, expiresAt };
}

async function recentPendingActivation(userId, withinMs = 60_000) {
  const row = await db.prepare(`SELECT * FROM activation_tokens
    WHERE user_id = ? AND used_at IS NULL AND expires_at > ?
    ORDER BY issued_at DESC LIMIT 1`).get(userId, now());
  if (!row) return null;
  const issuedAt = Date.parse(row.issued_at);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > withinMs) return null;
  return row;
}

async function activationRow(rawToken) {
  const tokenHash = createHash('sha256').update(String(rawToken || '')).digest('hex');
  return await db.prepare(`SELECT a.*, u.id AS user_id, u.email, u.name, u.employee_code, u.role, u.is_active,
    u.created_at AS user_created_at, u.updated_at AS user_updated_at
    FROM activation_tokens a JOIN users u ON u.id = a.user_id WHERE a.token_hash = ?`).get(tokenHash);
}

async function requireUsableActivation(rawToken) {
  const record = await activationRow(rawToken);
  const timestamp = Date.now();
  if (!record || Date.parse(record.expires_at) <= timestamp) {
    throw new HttpError(410, 'Đã hết hạn kích hoạt tài khoản');
  }
  if (record.used_at) {
    throw new HttpError(410, 'Liên kết kích hoạt này không còn hiệu lực. Vui lòng dùng email kích hoạt mới nhất.');
  }
  return record;
}

async function openActivation(rawToken) {
  const record = await requireUsableActivation(rawToken);
  if (!record.first_opened_at) {
    const firstOpenedAt = now();
    const sessionExpiresAt = record.expires_at;
    await db.prepare('UPDATE activation_tokens SET first_opened_at = ?, session_expires_at = ? WHERE id = ?')
      .run(firstOpenedAt, sessionExpiresAt, record.id);
    record.first_opened_at = firstOpenedAt;
    record.session_expires_at = sessionExpiresAt;
  }
  return record;
}

function activationSessionToken(user, activationId, expiresAt) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    sub: user.id,
    role: user.role,
    scope: 'activation',
    activationId,
    iat: issuedAt,
    exp: Math.floor(Date.parse(expiresAt) / 1000),
  }));
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function requireActivationSession(token) {
  const claims = verifyToken(token);
  if (claims.scope !== 'activation' || !claims.activationId) throw new HttpError(401, 'Phiên kích hoạt không hợp lệ.');
  const record = await db.prepare('SELECT * FROM activation_tokens WHERE id = ? AND user_id = ?').get(claims.activationId, claims.sub);
  if (!record || record.used_at || !record.session_expires_at || Date.parse(record.session_expires_at) <= Date.now() || Date.parse(record.expires_at) <= Date.now()) {
    throw new HttpError(410, 'Đã hết hạn kích hoạt tài khoản');
  }
  const user = await getUserById(claims.sub);
  if (!user) throw new HttpError(410, 'Đã hết hạn kích hoạt tài khoản');
  return { user, record };
}

let googleSigningKeys = { keys: [], fetchedAt: 0, expiresAt: 0 };

async function getGoogleConfig() {
  const saved = parseJsonObject(await getSystemSetting('google_sso_config'));
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || saved.clientKey || '';
  const allowedDomain = process.env.GOOGLE_ALLOWED_DOMAIN?.trim().toLowerCase() || saved.allowedDomain || '';
  const enforce = process.env.GOOGLE_ENFORCE_LOGIN !== undefined ? ['true', '1'].includes(process.env.GOOGLE_ENFORCE_LOGIN) : saved.enforceGoogleLogin === '100';
  return { clientId, clientKey: clientId, allowedDomain, configured: Boolean(clientId), enforceGoogleLogin: enforce ? '100' : 'optional', redirectUri: saved.redirectUri || '', clientSecret: '', environmentOverride: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) };
}

async function getCompanyProfile() {
  const row = await db.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'company_profile'").get();
  return { companyName: '', fullName: '', shortName: '', companyCode: '', taxCode: '', businessType: '', establishedDate: '', registrationDate: '', registrationNo: '', registrationIssuer: '', representative: '', representativeTitle: '', address: '', phone: '', fax: '', email: '', website: '', domain: '', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', bankAccountId: '', ...parseJsonObject(row?.setting_value) };
}

async function verifyGoogleIdentityCredential(credential) {
  const config = await getGoogleConfig();
  const clientId = config.clientId;
  if (!clientId) throw new HttpError(422, 'Chưa cấu hình GOOGLE_CLIENT_ID để đăng nhập hoặc liên kết tài khoản Google.');
  const parts = String(credential || '').split('.');
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new HttpError(422, 'Chứng thực Google không hợp lệ.');
  let header;
  let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch { throw new HttpError(422, 'Chứng thực Google không hợp lệ.'); }
  const current = Math.floor(Date.now() / 1000);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || payload.aud !== clientId
    || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)
    || !Number.isInteger(payload.exp) || payload.exp <= current
    || !Number.isInteger(payload.iat) || payload.iat > current + 60
    || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255
    || !payload.email || ![true, 'true'].includes(payload.email_verified)) {
    throw new HttpError(422, 'Tài khoản Google không hợp lệ hoặc chưa xác minh email.');
  }
  const domain = config.allowedDomain;
  if (domain && String(payload.hd || '').toLowerCase() !== domain) throw new HttpError(403, 'Tài khoản Google không thuộc tên miền doanh nghiệp được cấp quyền.');
  if (googleSigningKeys.expiresAt <= Date.now()
    || (!googleSigningKeys.keys.some(key => key.kid === header.kid) && googleSigningKeys.fetchedAt < Date.now() - 60_000)) {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error('Google signing keys unavailable');
      const result = await response.json();
      if (!Array.isArray(result.keys)) throw new Error('Invalid signing keys');
      const maxAge = Number(/max-age=(\d+)/i.exec(response.headers.get('cache-control') || '')?.[1] || 300);
      googleSigningKeys = { keys: result.keys, fetchedAt: Date.now(), expiresAt: Date.now() + Math.min(maxAge, 86400) * 1000 };
    } catch { throw new HttpError(503, 'Không thể kết nối dịch vụ xác thực Google. Vui lòng thử lại.'); }
  }
  const key = googleSigningKeys.keys.find(item => item.kid === header.kid && item.kty === 'RSA');
  let verified = false;
  try {
    verified = Boolean(key) && verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  } catch {}
  if (!verified) throw new HttpError(422, 'Chữ ký chứng thực Google không hợp lệ.');
  return normalizeEmail(payload.email);
}

async function logOutboundEmail(category, recipient, subject, status, errorMessage = '') {
  await db.prepare(`INSERT INTO outbound_mail_log (id, category, recipient, subject, status, error_message, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), category, recipient, subject, status, errorMessage.slice(0, 1_000), now());
}

function smtpRead(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => finish(new Error('Máy chủ SMTP không phản hồi.')), 15_000);
    const finish = (error, response) => {
      clearTimeout(timer);
      socket.off('data', onData);
      socket.off('error', onError);
      if (error) reject(error); else resolve(response);
    };
    const onError = (error) => finish(error);
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || '';
      if (/^\d{3} /.test(last)) finish(null, { code: Number(last.slice(0, 3)), message: lines.join('\n') });
    };
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

async function smtpCommand(socket, command, acceptedCodes) {
  socket.write(`${command}\r\n`);
  const response = await smtpRead(socket);
  if (!acceptedCodes.includes(response.code)) throw new Error(`SMTP ${response.code}: ${response.message}`);
  return response;
}

function connectSmtp(config) {
  return new Promise((resolve, reject) => {
    const options = { host: config.host, port: config.port, servername: config.host, rejectUnauthorized: process.env.NODE_ENV === 'production' };
    const socket = config.security === 'SSL' ? tls.connect(options) : net.connect({ host: config.host, port: config.port });
    const event = config.security === 'SSL' ? 'secureConnect' : 'connect';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Không thể kết nối SMTP.'));
    }, 15_000);
    socket.once(event, () => { clearTimeout(timer); resolve(socket); });
    socket.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

function upgradeStartTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host, rejectUnauthorized: process.env.NODE_ENV === 'production' });
    secure.once('secureConnect', () => resolve(secure));
    secure.once('error', reject);
  });
}

async function sendSmtpEmail({ to, subject, html, text }) {
  const config = await getEmailConfig();
  if (!config.configured) throw new HttpError(422, 'Chưa cấu hình cổng gửi email doanh nghiệp.');
  let socket = await connectSmtp(config);
  try {
    await smtpRead(socket);
    await smtpCommand(socket, `EHLO ${new URL(config.portalUrl).hostname || 'localhost'}`, [250]);
    if (config.security === 'STARTTLS') {
      await smtpCommand(socket, 'STARTTLS', [220]);
      socket = await upgradeStartTls(socket, config.host);
      await smtpCommand(socket, `EHLO ${new URL(config.portalUrl).hostname || 'localhost'}`, [250]);
    }
    const auth = Buffer.from(`\u0000${config.username}\u0000${config.password}`).toString('base64');
    await smtpCommand(socket, `AUTH PLAIN ${auth}`, [235]);
    await smtpCommand(socket, `MAIL FROM:<${config.senderEmail}>`, [250]);
    await smtpCommand(socket, `RCPT TO:<${normalizeEmail(to)}>`, [250, 251]);
    await smtpCommand(socket, 'DATA', [354]);
    const boundary = `kiyovn-${randomBytes(12).toString('hex')}`;
    const message = [
      `From: ${config.senderName.replace(/[\r\n]/g, '')} <${config.senderEmail}>`,
      `To: <${normalizeEmail(to)}>`,
      `Subject: ${String(subject).replace(/[\r\n]/g, '')}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      String(text || '').replace(/^\./gm, '..'),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      String(html || '').replace(/^\./gm, '..'),
      `--${boundary}--`,
      '.',
    ].join('\r\n');
    socket.write(`${message}\r\n`);
    const response = await smtpRead(socket);
    if (response.code !== 250) throw new Error(`SMTP ${response.code}: ${response.message}`);
    await smtpCommand(socket, 'QUIT', [221]);
  } finally {
    socket.end();
  }
}

async function activationEmail(user, rawToken) {
  const config = await getEmailConfig();
  const template = await getActivationTemplate();
  const link = `${config.portalUrl}/activate-account?token=${encodeURIComponent(rawToken)}`;
  const safeName = escapeHtml(user.name);
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f8fb;font:14px Arial,sans-serif;color:#1f2937"><main style="max-width:520px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:28px"><h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(template.heading)}</h1><p>Xin chào ${safeName},</p><p>${escapeHtml(template.body)}</p><p style="margin:24px 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#009688;color:#fff;text-decoration:none;padding:11px 18px;border-radius:6px;font-weight:700">${escapeHtml(template.buttonLabel)}</a></p><p style="font-size:12px;color:#64748b">${escapeHtml(template.footer)}</p></main></body></html>`;
  const text = `${template.heading}\n\nXin chào ${user.name},\n${template.body}\n\n${template.buttonLabel}: ${link}\n\n${template.footer}`;
  return { subject: template.subject, html, text, link };
}

async function sendActivationEmail(user, rawToken) {
  const mail = await activationEmail(user, rawToken);
  try {
    await sendSmtpEmail({ to: user.email, ...mail });
    await logOutboundEmail('account_activation', user.email, mail.subject, 'sent');
    return { status: 'sent' };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Không thể gửi email.';
    await logOutboundEmail('account_activation', user.email, mail.subject, 'failed', reason);
    return { status: 'failed', message: reason };
  }
}

function normalizeFileName(value, field = 'Tên tệp') {
  const name = requiredText(value, field, 255);
  if (name === '.' || name === '..' || /[\\\\/\u0000-\u001F]/.test(name)) {
    throw new HttpError(422, `${field} chứa ký tự không hợp lệ.`);
  }
  return name;
}

function isAllowedEmployeeUpload(name, mimeType = '') {
  const lowerName = String(name || '').toLowerCase();
  const lowerMime = String(mimeType || '').toLowerCase();
  if (lowerMime.startsWith('image/') || lowerMime.startsWith('video/')) return true;
  return /\.(pdf|doc|docx|xls|xlsx|csv|txt|rtf|ppt|pptx)$/i.test(lowerName);
}

function publicFileNode(row) {
  return {
    key: row.id,
    id: row.id,
    parentId: row.parent_id || null,
    employeeId: row.employee_id || null,
    name: row.name,
    type: row.node_type,
    mime: row.mime_type || undefined,
    sizeBytes: Number(row.size || 0),
    owner: row.owner_code || '',
    group: row.is_system ? 'system' : 'enterprise',
    permission: row.is_protected ? '555' : row.node_type === 'dir' ? '755' : '644',
    modified: row.updated_at,
    originModule: row.origin_module,
    isHidden: Boolean(row.is_hidden),
    isSystem: Boolean(row.is_system),
    isProtected: Boolean(row.is_protected),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicFileShare(row, fileRow) {
  return {
    id: row.id,
    fileId: row.file_id,
    token: row.token,
    isActive: Boolean(row.is_active),
    url: `/files/share?token=${encodeURIComponent(row.token)}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    file: fileRow ? publicFileNode(fileRow) : undefined,
  };
}

async function fileNodeById(id) {
  return await db.prepare(`
    SELECT f.*, owner.employee_code AS owner_code
    FROM file_nodes f
    LEFT JOIN users owner ON owner.id = f.owner_id
    WHERE f.id = ? AND f.deleted_at IS NULL
  `).get(id);
}

async function fileShareByFileId(fileId) {
  return await db.prepare('SELECT * FROM file_shares WHERE file_id = ? ORDER BY updated_at DESC LIMIT 1').get(fileId);
}

async function fileShareByToken(token) {
  return await db.prepare(`
    SELECT s.*, f.id AS file_node_id, f.parent_id, f.employee_id, f.owner_id, f.name, f.node_type, f.mime_type, f.size,
      f.storage_key, f.origin_module, f.is_hidden, f.is_system, f.is_protected, f.deleted_at, f.created_at AS file_created_at,
      f.updated_at AS file_updated_at, owner.employee_code AS owner_code
    FROM file_shares s
    JOIN file_nodes f ON f.id = s.file_id
    LEFT JOIN users owner ON owner.id = f.owner_id
    WHERE s.token = ? AND f.deleted_at IS NULL
    LIMIT 1
  `).get(token);
}

function fileNodeFromShareRow(row) {
  if (!row) return null;
  return {
    id: row.file_node_id,
    parent_id: row.parent_id,
    employee_id: row.employee_id,
    owner_id: row.owner_id,
    name: row.name,
    node_type: row.node_type,
    mime_type: row.mime_type,
    size: row.size,
    storage_key: row.storage_key,
    origin_module: row.origin_module,
    is_hidden: row.is_hidden,
    is_system: row.is_system,
    is_protected: row.is_protected,
    deleted_at: row.deleted_at,
    created_at: row.file_created_at,
    updated_at: row.file_updated_at,
    owner_code: row.owner_code,
  };
}

async function employeeRootFolder(employeeId) {
  return await db.prepare(`
    SELECT * FROM file_nodes
    WHERE employee_id = ? AND node_type = 'dir' AND is_system = 1 AND is_protected = 1
      AND parent_id = (SELECT id FROM file_nodes WHERE parent_id IS NULL AND name = 'Nhân Sự' AND deleted_at IS NULL)
      AND deleted_at IS NULL
    LIMIT 1
  `).get(employeeId);
}

async function employeeSystemFolder(employeeId) {
  const employeeRoot = await employeeRootFolder(employeeId);
  if (!employeeRoot) return null;
  return await db.prepare(`
    SELECT * FROM file_nodes
    WHERE parent_id = ? AND name = 'System' AND node_type = 'dir' AND is_system = 1
      AND is_protected = 1 AND deleted_at IS NULL
    LIMIT 1
  `).get(employeeRoot.id);
}

function employeeFolderName(user) {
  return `${user.employee_code}-${user.name}`.slice(0, 255);
}

async function ensureStaffRoot() {
  const existing = await db.prepare(`
    SELECT * FROM file_nodes WHERE parent_id IS NULL AND name = 'Nhân Sự' AND deleted_at IS NULL LIMIT 1
  `).get();
  if (existing) return existing;
  const timestamp = now();
  const root = {
    id: randomUUID(),
    name: 'Nhân Sự',
    timestamp,
  };
  await db.prepare(`INSERT INTO file_nodes (
    id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key,
    origin_module, is_hidden, is_system, is_protected, created_at, updated_at
  ) VALUES (?, NULL, NULL, NULL, ?, 'dir', '', 0, NULL, 'system', 0, 1, 1, ?, ?)`)
    .run(root.id, root.name, root.timestamp, root.timestamp);
  return await db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(root.id);
}

async function ensureEmployeeWorkspace(user) {
  if (!user) return null;
  const profile = await db.prepare('SELECT employment_status FROM employee_profiles WHERE user_id = ?').get(user.id);
  if (profile?.employment_status === 'Đã nghỉ việc') {
    await cleanupEmptyEmployeeWorkspace(user.id);
    return null;
  }

  const root = await ensureStaffRoot();
  let employeeRoot = await employeeRootFolder(user.id);
  const timestamp = now();
  if (!employeeRoot) {
    const id = randomUUID();
    await db.prepare(`INSERT INTO file_nodes (
      id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key,
      origin_module, is_hidden, is_system, is_protected, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'dir', '', 0, NULL, 'system', 0, 1, 1, ?, ?)`)
      .run(id, root.id, user.id, user.id, employeeFolderName(user), timestamp, timestamp);
    employeeRoot = await db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(id);
  } else if (employeeRoot.name !== employeeFolderName(user)) {
    await db.prepare('UPDATE file_nodes SET name = ?, updated_at = ? WHERE id = ?')
      .run(employeeFolderName(user), timestamp, employeeRoot.id);
  }

  let system = await employeeSystemFolder(user.id);
  if (!system) {
    const id = randomUUID();
    await db.prepare(`INSERT INTO file_nodes (
      id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key,
      origin_module, is_hidden, is_system, is_protected, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'System', 'dir', '', 0, NULL, 'system', 0, 1, 1, ?, ?)`)
      .run(id, employeeRoot.id, user.id, user.id, timestamp, timestamp);
    system = await db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(id);
  }

  await cleanupDefaultSystemFilesForEmployee(system);

  return { root: employeeRoot, system };
}

async function cleanupDefaultSystemFilesForEmployee(systemFolder) {
  if (!systemFolder) return;
  const placeholders = DEFAULT_EMPLOYEE_SYSTEM_FILE_NAMES.map(() => '?').join(', ');
  const timestamp = now();
  await db.prepare(`
    UPDATE file_nodes
    SET deleted_at = ?, updated_at = ?
    WHERE parent_id = ?
      AND node_type = 'file'
      AND is_system = 1
      AND is_protected = 1
      AND deleted_at IS NULL
      AND name IN (${placeholders})
  `).run(timestamp, timestamp, systemFolder.id, ...DEFAULT_EMPLOYEE_SYSTEM_FILE_NAMES);
}

async function cleanupEmptyEmployeeWorkspace(userId) {
  if (!userId) return;
  const staffRoot = await ensureStaffRoot();
  const employeeRoot = await db.prepare(`
    SELECT * FROM file_nodes 
    WHERE parent_id = ? AND employee_id = ? AND node_type = 'dir' AND deleted_at IS NULL
    LIMIT 1
  `).get(staffRoot.id, userId);

  if (!employeeRoot) return;

  // Check if there are any non-deleted files stored anywhere inside this employee's folder/tree
  const filesRow = await db.prepare(`
    WITH RECURSIVE folder_tree(id) AS (
      SELECT id FROM file_nodes WHERE id = ? AND deleted_at IS NULL
      UNION ALL
      SELECT fn.id FROM file_nodes fn
      JOIN folder_tree ft ON fn.parent_id = ft.id
      WHERE fn.deleted_at IS NULL
    )
    SELECT COUNT(*) AS count FROM file_nodes
    WHERE parent_id IN (SELECT id FROM folder_tree)
      AND node_type = 'file'
      AND deleted_at IS NULL
  `).get(employeeRoot.id);

  const fileCount = Number(filesRow?.count || 0);
  if (fileCount === 0) {
    // If no files are stored, remove the entire empty employee folder tree from /Nhân Sự (children first)
    const descendantIds = await db.prepare(`
      WITH RECURSIVE folder_tree(id, level) AS (
        SELECT id, 0 FROM file_nodes WHERE id = ?
        UNION ALL
        SELECT fn.id, ft.level + 1 FROM file_nodes fn
        JOIN folder_tree ft ON fn.parent_id = ft.id
      )
      SELECT id FROM folder_tree ORDER BY level DESC
    `).all(employeeRoot.id);

    for (const row of descendantIds) {
      await db.prepare('DELETE FROM file_nodes WHERE id = ?').run(row.id);
    }
  }
}

async function cleanupAllEmptyInactiveEmployeeWorkspaces() {
  const inactiveUsers = await db.prepare(`
    SELECT u.id FROM users u
    LEFT JOIN employee_profiles p ON p.user_id = u.id
    WHERE p.employment_status = 'Đã nghỉ việc'
  `).all();

  for (const u of inactiveUsers) {
    await cleanupEmptyEmployeeWorkspace(u.id);
  }
}

async function ensureAllEmployeeWorkspaces() {
  await ensureStaffRoot();
  const users = await db.prepare(`
    SELECT u.* FROM users u
    LEFT JOIN employee_profiles p ON p.user_id = u.id
    WHERE p.employment_status IS NULL OR p.employment_status != 'Đã nghỉ việc'
  `).all();
  for (const user of users) await ensureEmployeeWorkspace(user);
  await cleanupAllEmptyInactiveEmployeeWorkspaces();
}

function isAdmin(user) {
  return user.role === 'ADMIN';
}

function canAccessFileNode(user, node) {
  if (!node || node.deleted_at) return false;
  if (isAdmin(user)) return true;
  return node.employee_id === user.id;
}

function requireFileAccess(user, node) {
  if (!node || !canAccessFileNode(user, node)) {
    throw new HttpError(404, 'Tệp này không tồn tại.');
  }
  return node;
}

async function defaultFileDirectory(user) {
  if (isAdmin(user)) return await ensureStaffRoot();
  return await ensureEmployeeWorkspace(user).system;
}

function fileStoragePath(storageKey) {
  if (!/^[a-f0-9-]{36}\.bin$/i.test(storageKey || '')) throw new HttpError(404, 'Tệp không hợp lệ.');
  return path.join(FILES_DIR, storageKey);
}

async function readBinary(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += data.length;
    if (length > MAX_FILE_SIZE_BYTES) throw new HttpError(413, `Tệp vượt quá giới hạn ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`);
    chunks.push(data);
  }
  return Buffer.concat(chunks, length);
}

function ensureDirectoryWriteAccess(user, parent) {
  requireFileAccess(user, parent);
  if (parent.node_type !== 'dir') throw new HttpError(422, 'Vị trí lưu không phải là thư mục.');
  return parent;
}

function publicCashTransaction(row) {
  return {
    key: row.id,
    code: row.code,
    type: row.transaction_type,
    source: row.source,
    category: row.category,
    amount: row.amount,
    date: row.transaction_date,
    recipientOrPayer: row.counterparty,
    account: row.account_name,
    status: row.status,
    note: row.note,
    department: row.department || '',
    employeeCode: row.employee_code || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function financeStoredInteger(value) {
  const result = typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)) ? Number(value) : NaN;
  if (!Number.isSafeInteger(result) || result < 0) throw new HttpError(500, 'Dữ liệu số tiền không hợp lệ');
  return result;
}

function publicFinanceDocument(row) {
  const amount = financeStoredInteger(row.amount);
  const paidAmount = financeStoredInteger(row.paid_amount);
  return {
    key: row.id,
    code: row.code,
    documentType: row.document_type,
    subtype: row.subtype,
    partnerName: row.partner_name,
    description: row.description,
    amount,
    paidAmount,
    remainingAmount: Math.max(0, amount - paidAmount),
    documentDate: row.document_date,
    dueDate: row.due_date || '',
    status: row.status,
    taxCode: row.tax_code,
    vatRate: financeStoredInteger(row.vat_rate),
    vatAmount: financeStoredInteger(row.vat_amount),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function publicBankAccount(row, actor = null) {
  if (!row) return null;
  const isFull = !actor || actor.role === 'ADMIN';
  const rawAcc = decryptField(row.account_number, 'finance');
  return {
    key: row.id,
    bankName: row.bank_name,
    accountNumber: isFull ? rawAcc : maskBankAccount(rawAcc),
    accountHolder: row.account_holder,
    branch: row.branch,
    balance: isFull ? (row.opening_balance || 0) : 0,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function internalTransferAccounts() {
  const banks = (await db.prepare('SELECT * FROM finance_bank_accounts ORDER BY bank_name, id').all()).map(row => publicBankAccount(row));
  const transactions = await db.prepare("SELECT source, account_name, transaction_type, amount FROM finance_cash_transactions WHERE status = 'Đã hoàn thành'").all();
  const bankNameCounts = new Map();
  for (const bank of banks) bankNameCounts.set(bank.bankName, (bankNameCounts.get(bank.bankName) || 0) + 1);
  const accounts = banks.map(bank => {
    const name = `${bank.bankName} (${bank.accountNumber})`;
    const aliases = new Set([bank.key, bank.accountNumber, name, `${bank.bankName} - ${bank.accountNumber} (VND)`]);
    // Old cash entries used bank names; only assign them when the name identifies one account.
    if (bankNameCounts.get(bank.bankName) === 1) aliases.add(bank.bankName);
    const movement = transactions.filter(item => item.source === 'bank' && aliases.has(item.account_name))
      .reduce((sum, item) => sum + (item.transaction_type === 'Thu' ? Number(item.amount) : -Number(item.amount)), 0);
    return { key: bank.key, name, source: 'bank', balance: Number(bank.balance) + movement, status: bank.status };
  });
  for (const name of new Set(['Quỹ tiền mặt', ...transactions.filter(item => item.source === 'petty').map(item => item.account_name)])) {
    const balance = transactions.filter(item => item.source === 'petty' && item.account_name === name)
      .reduce((sum, item) => sum + (item.transaction_type === 'Thu' ? Number(item.amount) : -Number(item.amount)), 0);
    accounts.push({ key: `petty:${name}`, name, source: 'petty', balance, status: 'Đang hoạt động' });
  }
  return accounts;
}

async function lockTransferLedger() {
  if (db.pool) await db.exec('LOCK TABLE finance_cash_transactions IN SHARE ROW EXCLUSIVE MODE');
}

function publicCrmContact(row, actor = null) {
  if (!row) return null;
  const isFull = !actor || actor.role === 'ADMIN';
  const rawPhone = decryptField(row.phone, 'crm');
  const rawEmail = decryptField(row.email, 'crm');
  const rawBank = decryptField(row.bank_account, 'crm');
  const rawAddress = decryptField(row.address, 'crm');

  return {
    key: row.id,
    code: row.code,
    name: row.name,
    type: row.contact_type,
    taxCode: row.tax_code,
    industry: row.industry,
    contactPerson: row.contact_person,
    phone: isFull ? rawPhone : maskPhone(rawPhone),
    email: isFull ? rawEmail : maskEmail(rawEmail),
    address: isFull ? rawAddress : '',
    bankAccount: isFull ? rawBank : maskBankAccount(rawBank),
    creditLimit: isFull ? (row.credit_limit || 0) : 0,
    totalValue: isFull ? (row.total_value || 0) : 0,
    debtBalance: isFull ? (row.debt_balance || 0) : 0,
    tier: row.tier,
    accountManager: row.account_manager,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function taskRowById(id) {
  return await db.prepare(`
    SELECT t.*,
      COALESCE(assignee.name, 'Người thực hiện') AS assignee_name,
      COALESCE(assignee.employee_code, t.assignee_id) AS assignee_employee_code,
      COALESCE(creator.name, 'Hệ thống') AS creator_name
    FROM tasks t
    LEFT JOIN users assignee ON (assignee.id = t.assignee_id OR assignee.employee_code = t.assignee_id)
    LEFT JOIN users creator ON (creator.id = t.created_by OR creator.employee_code = t.created_by)
    WHERE t.id = ? OR t.code = ?
  `).get(id, id);
}

function publicTask(row) {
  if (!row) return null;
  return {
    key: row.id,
    taskCode: row.code,
    taskTitle: row.title,
    description: row.description || '',
    projectName: row.project_name || '',
    assigneeId: row.assignee_id,
    assignee: `${row.assignee_name} (${row.assignee_employee_code})`,
    createdBy: row.creator_name,
    priority: row.priority,
    dueDate: row.due_date,
    progress: row.progress,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function populateTaskDetails(task, taskId) {
  if (!task) return null;
  const id = task.id || taskId || task.key;
  const code = task.code || task.taskCode || id;
  const subtasksRows = await db.prepare(`
    SELECT id AS key, title, is_completed AS completed, sort_order AS sortOrder
    FROM task_checklist_items WHERE task_id = ? OR task_id = ? ORDER BY sort_order ASC, id ASC
  `).all(id, code);
  const subtasks = subtasksRows.map((item) => ({ ...item, completed: Boolean(item.completed) }));

  const comments = await db.prepare(`
    SELECT c.id AS key, c.content, c.created_at AS createdAt, u.name AS author
    FROM task_comments c JOIN users u ON u.id = c.author_id
    WHERE c.task_id = ? OR c.task_id = ? ORDER BY c.created_at DESC
  `).all(id, code);

  const activities = await db.prepare(`
    SELECT a.id AS key, a.content, a.created_at AS createdAt, u.name AS actor
    FROM task_activities a JOIN users u ON u.id = a.actor_id
    WHERE a.task_id = ? OR a.task_id = ? ORDER BY a.created_at DESC
  `).all(id, code);

  const reportsRows = await db.prepare(`
    SELECT r.id AS key, r.content, r.attachments_json AS attachmentsJson, r.progress, r.status,
      r.created_at AS createdAt, u.name AS author
    FROM task_reports r JOIN users u ON u.id = r.author_id
    WHERE r.task_id = ? OR r.task_id = ? ORDER BY r.created_at DESC
  `).all(id, code);

  const reports = reportsRows.map((report) => {
    let attachments = [];
    try {
      const parsed = JSON.parse(report.attachmentsJson || '[]');
      attachments = Array.isArray(parsed) ? parsed : [];
    } catch {
      attachments = [];
    }
    return { ...report, attachments, attachmentsJson: undefined };
  });

  return {
    ...task,
    subtasks,
    comments,
    activities,
    reports,
  };
}

async function proposalRowById(id) {
  return await db.prepare(`
    SELECT p.*, submitter.name AS submitter_name, submitter.employee_code AS submitter_employee_code,
      reviewer.name AS reviewer_name
    FROM employee_proposals p
    JOIN users submitter ON submitter.id = p.submitter_id
    LEFT JOIN users reviewer ON reviewer.id = p.reviewer_id
    WHERE p.id = ?
  `).get(id);
}

function publicProposal(row) {
  return {
    key: row.id,
    code: row.code,
    title: row.title,
    type: row.proposal_type,
    amount: row.estimated_amount,
    content: row.content,
    submitterId: row.submitter_id,
    employeeName: row.submitter_name,
    employeeCode: row.submitter_employee_code,
    status: row.status,
    approver: row.reviewer_name || '',
    reviewNote: row.review_note || '',
    reviewedAt: row.reviewed_at || '',
    date: row.created_at.slice(0, 10),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createToken(user, request, method = 'password') {
  const issuedAt = Math.floor(Date.now() / 1000);
  const sessionId = randomUUID();
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: user.id, role: user.role, scope: 'access', sid: sessionId, iat: issuedAt, exp: issuedAt + TOKEN_TTL_SECONDS }));
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url');
  await saveAuthSession(user, sessionId, request, issuedAt, issuedAt + TOKEN_TTL_SECONDS, method);
  return `${header}.${payload}.${signature}`;
}

async function saveAuthSession(user, key, request, issuedAt, expiresAt, method) {
  const timestamp = now();
  const session = {
    kind: 'auth_session', key, userId: user.id, method,
    ip: String(request.socket.remoteAddress || '').replace(/^::ffff:/, ''),
    userAgent: String(request.headers['user-agent'] || '').slice(0, 1024),
    loginTime: new Date(issuedAt * 1000).toISOString(), lastActive: timestamp,
    expiresAt: new Date(expiresAt * 1000).toISOString(), revokedAt: '', revokedBy: '',
    tlsProtocol: request.socket.encrypted ? request.socket.getProtocol?.() || 'TLS' : '',
    cipher: request.socket.encrypted ? request.socket.getCipher?.()?.name || '' : '',
  };
  await db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
    VALUES (?, 'admin_sessions', ?, ?, ?, ?, ?) ON CONFLICT(scope, record_key, owner_id) DO NOTHING`)
    .run(randomUUID(), key, user.id, JSON.stringify(session), timestamp, timestamp);
}

function publicAuthSession(record, user, currentKey) {
  const expired = Date.parse(record.expiresAt) <= Date.now();
  const idle = Date.parse(record.lastActive) < Date.now() - 5 * 60 * 1000;
  const ip = record.ip || '';
  const local = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip === '::1' || /^(fc|fd|fe80:)/i.test(ip);
  const agent = record.userAgent || '';
  const browser = /Edg\//.test(agent) ? 'Microsoft Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : 'Không xác định';
  const device = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Windows/.test(agent) ? 'Windows' : /Macintosh/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : 'Không xác định';
  return {
    key: record.key, userId: user.id, user: user.name, empCode: user.employee_code, role: user.role,
    ip, ipType: local ? 'Mạng nội bộ / Loopback' : ip ? 'Mạng ngoài' : 'Chưa xác định',
    device, browser, userAgent: agent, location: 'Chưa xác định',
    loginTime: record.loginTime, lastActive: record.lastActive, expiresAt: record.expiresAt,
    mfaVerified: false, method: record.method, tlsProtocol: record.tlsProtocol || '', cipher: record.cipher || '',
    status: record.revokedAt ? 'Đã thu hồi' : expired ? 'Đã hết hạn' : idle ? 'Treo / Chờ thao tác' : 'Đang hoạt động',
    revokedAt: record.revokedAt || '', revokedBy: record.revokedBy || '', revokeReason: record.revokeReason || '',
    current: record.key === currentKey,
  };
}

async function revokeAuthSession(row, actorId, reason) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const session = publicCollectionRecord(row);
    if (session.revokedAt) return session;
    const timestamp = now();
    const revoked = { ...session, revokedAt: timestamp, revokedBy: actorId, revokeReason: reason };
    const result = await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ? AND payload_json = ?')
      .run(JSON.stringify(revoked), timestamp, row.id, row.payload_json);
    if (result.changes) {
      await recordAuditEvent(actorId, 'revoke_session', 'admin_sessions', session.key, { userId: session.userId, reason });
      return revoked;
    }
    row = await db.prepare('SELECT * FROM collection_records WHERE id = ?').get(row.id);
    if (!row) throw new HttpError(404, 'Không tìm thấy phiên đăng nhập.');
  }
  throw new HttpError(409, 'Phiên đang được cập nhật, vui lòng thử thu hồi lại.');
}

function verifyToken(token) {
  const [header, payload, signature] = String(token || '').split('.');
  if (!header || !payload || !signature) throw new HttpError(401, 'Phiên đăng nhập không hợp lệ.');
  const expected = createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new HttpError(401, 'Phiên đăng nhập không hợp lệ.');
  }
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new HttpError(401, 'Phiên đăng nhập không hợp lệ.');
  }
  if (!claims?.sub || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new HttpError(401, 'Phiên đăng nhập đã hết hạn.');
  }
  return claims;
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${derived.toString('base64url')}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, salt, expectedValue] = String(encoded || '').split('$');
  if (algorithm !== 'scrypt' || !salt || !expectedValue) return false;
  const expected = Buffer.from(expectedValue, 'base64url');
  const actual = await scrypt(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpError(422, 'Email không đúng định dạng.');
  }
  return email;
}

function requiredText(value, field, maxLength) {
  const text = String(value || '').trim();
  if (!text) throw new HttpError(422, `${field} là bắt buộc.`);
  if (text.length > maxLength) throw new HttpError(422, `${field} vượt quá độ dài cho phép.`);
  return text;
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null) return '';
  const text = Array.isArray(value) ? value.filter(Boolean).join(', ').trim() : String(value).trim();
  if (text.length > maxLength) throw new HttpError(422, `${field} vượt quá độ dài cho phép.`);
  return text;
}

function requiredAmount(value, field) {
  const amount = typeof value === 'number' ? value : Number(String(value || '').trim());
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000_000_000) {
    throw new HttpError(422, `${field} phải là số nguyên dương hợp lệ.`);
  }
  return amount;
}

function optionalAmount(value, field) {
  if (value === undefined || value === null || value === '') return 0;
  const amount = typeof value === 'number' ? value : Number(String(value || '').trim());
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000_000) {
    throw new HttpError(422, `${field} phải là số nguyên không âm hợp lệ.`);
  }
  return amount;
}

function formatWorkflowFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function normalizeWorkflowAttachments(values, actor, { pdfOnly = false } = {}) {
  if (!Array.isArray(values) || values.length > 20) throw new HttpError(422, 'Danh sách tệp đính kèm không hợp lệ hoặc vượt quá 20 tệp.');
  const ids = values.map((file) => requiredText(file?.fileNodeId, 'Mã tệp đính kèm', 160));
  if (new Set(ids).size !== ids.length) throw new HttpError(422, 'Tệp đính kèm bị trùng.');
  const attachments = [];
  for (const id of ids) {
    const file = await db.prepare("SELECT id, name, mime_type, size, storage_key, owner_id, origin_module, node_type, deleted_at, created_at FROM file_nodes WHERE id = ?").get(id);
    if (!file || file.node_type !== 'file' || file.deleted_at || file.origin_module !== 'workflow-requests') {
      throw new HttpError(422, 'Tệp đính kèm không tồn tại hoặc không thuộc luồng hồ sơ.');
    }
    if (file.owner_id !== actor.id) throw new HttpError(403, 'Chỉ người tải tệp lên mới được đính kèm tệp vào hồ sơ.');
    if (Number(file.size) <= 0) throw new HttpError(422, 'Không thể đính kèm tệp rỗng.');
    if (pdfOnly) {
      if (!/\.pdf$/i.test(file.name) || !file.storage_key) throw new HttpError(422, 'Trường này chỉ nhận tệp PDF hợp lệ.');
      let content;
      try { content = await readFile(fileStoragePath(file.storage_key)); } catch { throw new HttpError(422, 'Không đọc được nội dung tệp PDF.'); }
      if (content.subarray(0, 5).toString('ascii') !== '%PDF-') throw new HttpError(422, 'Nội dung tệp không phải PDF hợp lệ.');
    }
    attachments.push({
      fileNodeId: file.id,
      fileName: file.name,
      fileSizeBytes: Number(file.size),
      fileSize: formatWorkflowFileSize(Number(file.size)),
      fileType: file.mime_type || 'application/octet-stream',
      uploadTime: file.created_at,
    });
  }
  return attachments;
}

function normalizeWorkflowFormData(schema, values, attachments) {
  if (!Array.isArray(schema)) return {};
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new HttpError(422, 'Dữ liệu trường bổ sung không hợp lệ.');
  const customFields = schema.filter((field) => !['title', 'content', 'attachments'].includes(String(field.fieldName)));
  const names = new Set(customFields.map((field) => String(field.fieldName)));
  if (Object.keys(values).some((name) => !names.has(name))) throw new HttpError(422, 'Dữ liệu chứa trường không có trong biểu mẫu quy trình.');
  const result = {};
  for (const field of schema) {
    const name = String(field.fieldName);
    if (name === 'title' || name === 'content') continue;
    if (name === 'attachments') {
      if (field.required && attachments.length === 0) throw new HttpError(422, `${field.label} là bắt buộc.`);
      continue;
    }
    const value = values[name];
    const empty = value === undefined || value === null || (typeof value === 'string' && !value.trim());
    if (empty && field.required) throw new HttpError(422, `${field.label} là bắt buộc.`);
    if (empty) { result[name] = ''; continue; }
    const type = String(field.type || '').toLowerCase();
    if (type.includes('số') || type.includes('number')) {
      const number = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(number) || Math.abs(number) > 1_000_000_000_000) throw new HttpError(422, `${field.label} phải là số hợp lệ.`);
      result[name] = number;
    } else if (type.includes('ngày') || type.includes('date')) {
      result[name] = requiredIsoDate(value, field.label);
    } else {
      result[name] = requiredText(value, field.label, 4_000);
    }
  }
  return result;
}

function requiredIsoDate(value, field) {
  const date = requiredText(value, field, 10);
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new HttpError(422, `${field} không đúng định dạng YYYY-MM-DD.`);
  }
  return date;
}

function parseMeetingTimeRange(value) {
  const slot = requiredText(value, 'Khung giờ', 40);
  const match = /^(?:([01]\d|2[0-3]):([0-5]\d))\s*-\s*(?:([01]\d|2[0-3]):([0-5]\d))$/.exec(slot);
  if (!match) throw new HttpError(422, 'Khung giờ phải theo dạng HH:mm - HH:mm.');
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  if (end <= start || end - start > 240) throw new HttpError(422, 'Thời gian họp phải từ 1 phút đến 4 giờ và không qua ngày.');
  return { slot, start, end };
}

function buildAssetDepreciationSchedule({ originalCost, residualValue, lifeMonths, startDate, depreciatedMonths = 0, method, productionCapacity = 0, productionByPeriod = {} }) {
  const cost = Number(originalCost);
  const residual = Number(residualValue);
  const life = Number(lifeMonths);
  if (!Number.isSafeInteger(cost) || cost <= 0 || !Number.isSafeInteger(residual) || residual < 0 || residual >= cost) {
    throw new HttpError(422, 'Nguyên giá phải lớn hơn 0 và giá trị thu hồi phải nhỏ hơn nguyên giá.');
  }
  if (!Number.isSafeInteger(life) || life < 1 || life > 120) throw new HttpError(422, 'Thời gian khấu hao phải từ 1 đến 120 tháng.');
  const start = requiredIsoDate(startDate, 'Ngày bắt đầu khấu hao');
  const methods = ['Đường thẳng', 'Số dư giảm dần có điều chỉnh', 'Theo sản lượng / Công suất'];
  oneOf(method, 'Phương pháp khấu hao', methods);
  const alreadyPosted = Number(depreciatedMonths);
  if (!Number.isSafeInteger(alreadyPosted) || alreadyPosted < 0 || alreadyPosted > life) throw new HttpError(422, 'Số kỳ đã trích khấu hao không hợp lệ.');
  const capacity = method === 'Theo sản lượng / Công suất' ? requiredAmount(productionCapacity, 'Tổng sản lượng dự kiến') : 0;
  const base = cost - residual;
  const startYear = Number(start.slice(0, 4));
  const startMonth = Number(start.slice(5, 7));
  const rate = (life <= 48 ? 1.5 : life <= 72 ? 2 : 2.5) * 12 / life;
  let accumulated = 0;
  const rows = [];
  for (let index = 0; index < life; index += 1) {
    const monthSerial = startMonth - 1 + index;
    const periodYear = startYear + Math.floor(monthSerial / 12);
    const periodMonth = monthSerial % 12 + 1;
    const period = `${periodYear}-${String(periodMonth).padStart(2, '0')}`;
    const remaining = Math.max(0, base - accumulated);
    let productionUnits;
    let amount = 0;
    if (remaining > 0) {
      if (method === 'Đường thẳng') amount = Math.min(remaining, Math.round(base / life));
      else if (method === 'Số dư giảm dần có điều chỉnh') {
        const monthsLeft = life - index;
        amount = Math.min(remaining, Math.round(Math.max(remaining / monthsLeft, remaining * rate / 12)));
      } else {
        productionUnits = Number(productionByPeriod?.[period]) || 0;
        if (!Number.isSafeInteger(productionUnits) || productionUnits < 0 || productionUnits > capacity) {
          throw new HttpError(422, `Sản lượng kỳ ${period} không hợp lệ.`);
        }
        amount = Math.min(remaining, Math.round(base * productionUnits / capacity));
      }
    }
    amount = Math.max(0, Math.min(remaining, amount));
    accumulated += amount;
    rows.push({
      period,
      monthNumber: index + 1,
      monthlyAmount: amount,
      accumulatedAmount: accumulated,
      remainingAmount: Math.max(residual, cost - accumulated),
      posted: index < alreadyPosted,
      ...(productionUnits === undefined ? {} : { productionUnits }),
    });
  }
  return rows;
}

function oneOf(value, field, allowed) {
  if (!allowed.includes(value)) throw new HttpError(422, `${field} không hợp lệ.`);
  return value;
}

const USER_COLLECTION_PREFIXES = ['employee.', 'employee_', 'employee-', 'settings.', 'settings_', 'chat.', 'user.', 'user_', 'business_', 'dropdown_', 'hr_', 'asset_', 'finance_'];
const USER_COLLECTION_SCOPES = new Set([
  'employee_my_profile',
  'attendance.leave-requests',
  'attendance.overtime-requests',
  'meeting-room.bookings',
  'meeting_rooms',
  'room_bookings',
  'tickets.requests',
  'leave_requests',
  'attendance_overtime',
  'attendance_leave_summary',
  'attendance_explanations',
  'workflow_requests',
  'workflow_blueprints',
]);

function normalizeCollectionScope(value) {
  const scope = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(scope)) {
    throw new HttpError(422, 'Phạm vi dữ liệu không hợp lệ.');
  }
  return scope;
}

function canUseCollectionAsUser(scope) {
  return USER_COLLECTION_SCOPES.has(scope) || USER_COLLECTION_PREFIXES.some((prefix) => scope.startsWith(prefix));
}

async function workflowDelegationRows() {
  const rows = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'workflow_delegations'").all();
  return rows.map((row) => parseJsonObject(row.payload_json));
}

function workflowDelegationApplies(delegation, workflow) {
  const today = new Date().toISOString().slice(0, 10);
  if (!delegation.fromDate || !delegation.toDate || today < delegation.fromDate || today > delegation.toDate) return false;
  const scope = String(delegation.scope || '').trim().toLocaleLowerCase();
  const workflowCode = String(workflow.workflowCode || '').trim().toLocaleLowerCase();
  const category = String(workflow.category || '').trim().toLocaleLowerCase();
  if (!['*', 'all', 'all_workflows', 'workflow_requests', 'toàn công ty', 'tất cả quy trình', 'mọi quy trình', workflowCode, category].includes(scope)) return false;
  const maxBudgetAmount = Number(delegation.maxBudgetAmount) || 0;
  return maxBudgetAmount <= 0 || Number(workflow.budgetAmount) <= maxBudgetAmount;
}

function workflowDecisionAccess(actor, workflow, delegations = []) {
  if (actor.role === 'ADMIN') return { allowed: true, delegated: false };
  if (workflow.status !== 'Chờ bạn ký duyệt' || !workflow.currentApproverId || workflow.requesterId === actor.id) return { allowed: false, delegated: false };
  if (workflow.currentApproverId === actor.id) return { allowed: true, delegated: false };
  const delegated = delegations.some((rule) => rule.delegatorId === workflow.currentApproverId
    && rule.delegateeId === actor.id && workflowDelegationApplies(rule, workflow));
  return { allowed: delegated, delegated };
}

async function canDecideWorkflow(actor, workflow) {
  if (actor.role === 'ADMIN') return true;
  return workflowDecisionAccess(actor, workflow, await workflowDelegationRows()).allowed;
}

async function canReadWorkflowAttachment(actor, fileId) {
  if (actor.role === 'ADMIN') return true;
  const rows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'workflow_requests'").all();
  for (const row of rows) {
    const workflow = publicCollectionRecord(row);
    if (!workflow.attachments?.some((attachment) => attachment.fileNodeId === fileId)) continue;
    if (row.owner_id === actor.id || await canDecideWorkflow(actor, workflow)) return true;
  }
  return false;
}

async function requireCollectionActor(request, scope) {
  const actor = await requireUser(request);
  if (scope === 'finance_purchase_requests' && actor.role !== 'ADMIN') {
    throw new HttpError(403, 'Chỉ quản trị viên được quản lý yêu cầu mua sắm.');
  }
  if (scope === 'finance_purchase_requests' && !['GET', 'POST', 'PATCH'].includes(request.method)) {
    throw new HttpError(request.method === 'DELETE' ? 409 : 405, 'Yêu cầu mua sắm phải được cập nhật theo luồng để giữ lịch sử xử lý.');
  }
  if (scope === 'tickets' && actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được quản lý ticket hỗ trợ.');
  if (scope === 'tickets' && ['PUT', 'DELETE'].includes(request.method)) throw new HttpError(405, 'Ticket phải được tạo hoặc cập nhật từng hồ sơ để giữ lịch sử xử lý.');
  if (scope === 'doc_notes' && actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được quản lý sổ chỉ đạo.');
  if (scope === 'doc_notes' && ['PUT', 'DELETE'].includes(request.method)) throw new HttpError(405, 'Chỉ đạo phải được cập nhật từng hồ sơ để giữ lịch sử xử lý.');
  if (scope === 'finance_costing' && actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được quản lý sổ giá thành.');
  if (scope === 'finance_costing' && !['GET', 'POST'].includes(request.method)) throw new HttpError(405, 'Hồ sơ giá thành đã ghi chỉ được lưu mới để giữ dữ liệu đối chiếu.');
  if (['finance_inventory', 'finance_inventory_transactions', 'finance_inventory_warehouses', 'finance_inventory_settings'].includes(scope) && actor.role !== 'ADMIN') {
    throw new HttpError(403, 'Chỉ quản trị viên được quản lý dữ liệu kho hàng.');
  }
  if (scope === 'finance_inventory_transactions' && request.method !== 'GET') {
    throw new HttpError(405, 'Giao dịch kho phải được ghi qua luồng xử lý tồn kho.');
  }
  if (['asset_disposals', 'asset_maintenances', 'asset_systems', 'asset_depreciations', 'crm_feedback', 'crm_supplier_evaluations', 'crm_promotions'].includes(scope) && actor.role !== 'ADMIN') {
    if (scope === 'crm_feedback') throw new HttpError(403, 'Chỉ quản trị viên được quản lý phản ánh khách hàng.');
    if (scope === 'crm_supplier_evaluations') throw new HttpError(403, 'Chỉ quản trị viên được quản lý đánh giá nhà cung cấp.');
    if (scope === 'crm_promotions') throw new HttpError(403, 'Chỉ quản trị viên được quản lý chương trình khuyến mại.');
    throw new HttpError(403, 'Chỉ quản trị viên được truy cập hồ sơ tài sản này.');
  }
  if (actor.role !== 'ADMIN' && !canUseCollectionAsUser(scope)) {
    throw new HttpError(403, 'Bạn không có quyền truy cập dữ liệu quản trị này.');
  }
  if (scope === 'meeting_rooms' && actor.role !== 'ADMIN' && request.method !== 'GET') throw new HttpError(403, 'Chỉ quản trị viên được quản lý danh mục phòng họp.');
  if (scope === 'meeting_rooms' && request.method === 'DELETE') throw new HttpError(409, 'Danh mục phòng họp được lưu để giữ lịch sử đặt phòng.');
  if (scope === 'meeting_room_settings' && actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được quản lý quy định đặt phòng họp.');
  if (scope === 'meeting_room_settings' && request.method === 'DELETE') throw new HttpError(409, 'Thiết lập phòng họp được lưu để bảo toàn lịch sử thay đổi.');
  if (scope === 'room_bookings' && ['PATCH', 'DELETE'].includes(request.method)) {
    if (request.method === 'DELETE') throw new HttpError(409, 'Lịch họp phải được hủy để giữ lại lịch sử sử dụng phòng.');
  }
  if (actor.role !== 'ADMIN' && scope === 'workflow_blueprints' && request.method !== 'GET') {
    throw new HttpError(403, 'Chỉ quản trị viên được thay đổi cấu hình quy trình.');
  }
  if (actor.role !== 'ADMIN' && ['hr_job_openings', 'hr_recruitment_candidates', 'hr_onboarding_tasks', 'hr_employee_history', 'hr_rewards', 'hr_performance_reviews'].includes(scope)) {
    throw new HttpError(403, 'Chỉ quản trị viên được quản lý tuyển dụng.');
  }
  if (actor.role !== 'ADMIN' && scope === 'attendance_leave_summary' && request.method !== 'GET') throw new HttpError(403, 'Chỉ quản trị viên được điều chỉnh số dư phép.');
  if (scope === 'employee_timesheets' && request.method !== 'GET') throw new HttpError(405, 'Vui lòng chấm công qua chức năng ghi nhận giờ vào/ra.');
  if (scope === 'asset_todos' && actor.role !== 'ADMIN' && ['POST', 'DELETE'].includes(request.method)) throw new HttpError(403, 'Nhân viên chỉ được cập nhật nhiệm vụ tài sản được giao.');
  if (scope === 'attendance_explanations' && request.method === 'PUT') throw new HttpError(405, 'Giải trình phải được gửi và xử lý theo từng bản ghi để giữ lịch sử duyệt.');
  if (scope === 'attendance_explanations' && request.method === 'DELETE' && actor.role === 'ADMIN') throw new HttpError(409, 'Giải trình được lưu để bảo toàn lịch sử xử lý.');
  if (request.method === 'PUT' && ['leave_requests', 'attendance_overtime', 'hr_recruitment_candidates', 'hr_employee_history', 'hr_rewards', 'hr_performance_reviews', 'enterprise_documents', 'doc_archives', 'business_travels', 'asset_disposals', 'asset_todos', 'asset_maintenances', 'asset_systems', 'asset_depreciations', 'crm_feedback', 'crm_supplier_evaluations', 'crm_promotions', 'workflow_requests', 'workflow_blueprints', 'workflow_settings', 'workflow_delegations', 'workflow_security_settings', 'meeting_rooms', 'room_bookings', 'meeting_room_settings', 'finance_inventory', 'finance_inventory_transactions', 'finance_inventory_settings'].includes(scope)) {
    throw new HttpError(405, 'Vui lòng tạo hoặc cập nhật từng bản ghi để giữ lịch sử và quyền phê duyệt.');
  }
  return actor;
}

async function normalizeCollectionRecord(value, scope, actor, current = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(422, 'Bản ghi phải là một đối tượng JSON.');
  }
  let record = { ...value };
  if (scope === 'tickets') {
    const at = now();
    if (current) {
      if (current.status === 'Đã hoàn thành') throw new HttpError(409, 'Ticket đã hoàn tất và được lưu để bảo toàn lịch sử.');
      const status = oneOf(record.status, 'Trạng thái ticket', ['Đang xử lý', 'Đã hoàn thành']);
      if (current.status !== 'Mới tạo' && current.status !== 'Đang xử lý') throw new HttpError(409, 'Trạng thái ticket hiện tại không cho phép cập nhật.');
      if (current.status === 'Đang xử lý' && status !== 'Đã hoàn thành') throw new HttpError(409, 'Ticket đang xử lý chỉ có thể được hoàn tất.');
      const history = Array.isArray(current.history) ? current.history : [];
      const updated = {
        ...current,
        status,
        acceptedAt: current.acceptedAt || at,
        ...(status === 'Đã hoàn thành' ? { resolvedAt: at } : {}),
        updatedAt: at,
        updatedBy: actor.name,
        updatedById: actor.id,
        history: [...history, {
          action: status === 'Đã hoàn thành' ? 'Hoàn tất yêu cầu' : 'Tiếp nhận yêu cầu',
          actor: actor.name,
          actorId: actor.id,
          at,
        }],
      };
      return { record: updated, recordKey: current.key, serialized: JSON.stringify(updated) };
    }

    const code = requiredText(record.code || record.key, 'Mã ticket', 80).toLocaleUpperCase();
    const duplicate = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'tickets' AND (LOWER(record_key) = LOWER(?) OR LOWER(json_extract(payload_json, '$.code')) = LOWER(?)) LIMIT 1").get(code, code);
    if (duplicate) throw new HttpError(409, 'Mã ticket đã tồn tại.');
    const title = requiredText(record.title, 'Tiêu đề ticket', 300);
    const description = requiredText(record.description, 'Mô tả ticket', 4_000);
    const priority = oneOf(record.priority, 'Mức độ ưu tiên', ['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp']);
    const departmentName = requiredText(record.department, 'Phòng ban', 160);
    const departments = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'business_org_units'").all();
    const department = departments.map((row) => parseJsonObject(row.payload_json))
      .find((item) => String(item.name || '').trim().toLocaleLowerCase() === departmentName.toLocaleLowerCase());
    if (!department || department.status === 'Tạm ngưng' || department.isActive === false) {
      throw new HttpError(422, 'Phòng ban không tồn tại hoặc đã tạm ngưng.');
    }
    record = {
      key: code,
      code,
      title,
      description,
      requester: actor.name,
      requesterId: actor.id,
      department: department.name,
      priority,
      status: 'Mới tạo',
      createdDate: at,
      createdBy: actor.name,
      createdById: actor.id,
      history: [{ action: 'Tạo ticket', actor: actor.name, actorId: actor.id, at }],
    };
    return { record, recordKey: code, serialized: JSON.stringify(record) };
  }
  if (scope === 'doc_notes') {
    const at = now();
    const businessDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const deriveStatus = (actionItems, deadline, previousStatus = '') => {
      const completionRate = actionItems.length
        ? Math.round(actionItems.filter((item) => item.done).length * 100 / actionItems.length)
        : 0;
      if (completionRate === 100) return 'Đã hoàn thành';
      if (deadline < businessDate) return 'Quá hạn';
      return previousStatus === 'Cần đẩy nhanh' ? previousStatus : 'Đang thực hiện';
    };
    if (current) {
      const fields = Object.keys(record).filter((field) => field !== 'key' && field !== 'noteCode' && record[field] !== current[field]);
      const history = Array.isArray(current.history) ? current.history : [];
      let updated;
      if (fields.length === 1 && fields[0] === 'isPinned') {
        if (typeof record.isPinned !== 'boolean') throw new HttpError(422, 'Trạng thái ghim không hợp lệ.');
        updated = {
          ...current,
          isPinned: record.isPinned,
          updatedAt: at,
          updatedBy: actor.name,
          updatedById: actor.id,
          history: [...history, { action: record.isPinned ? 'Ghim ưu tiên' : 'Gỡ ghim ưu tiên', actor: actor.name, actorId: actor.id, at }],
        };
      } else if (fields.length === 1 && fields[0] === 'actionItems') {
        if (!Array.isArray(record.actionItems) || record.actionItems.length !== current.actionItems?.length || record.actionItems.length < 1 || record.actionItems.length > 50) {
          throw new HttpError(422, 'Danh sách đầu việc không hợp lệ.');
        }
        const ids = new Set();
        const actionItems = record.actionItems.map((item, index) => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(422, 'Đầu việc không hợp lệ.');
          const id = Number(item.id);
          if (!Number.isSafeInteger(id) || id < 1 || ids.has(id)) throw new HttpError(422, 'Mã đầu việc không hợp lệ hoặc bị trùng.');
          ids.add(id);
          if (typeof item.done !== 'boolean') throw new HttpError(422, 'Trạng thái đầu việc không hợp lệ.');
          return { id, text: requiredText(item.text, `Đầu việc ${index + 1}`, 500), done: item.done };
        });
        if (actionItems.some((item, index) => item.id !== current.actionItems[index].id || item.text !== current.actionItems[index].text)) {
          throw new HttpError(422, 'Không thể thay đổi hoặc xóa đầu việc đã ban hành.');
        }
        const completionRate = Math.round(actionItems.filter((item) => item.done).length * 100 / actionItems.length);
        updated = {
          ...current,
          actionItems,
          completionRate,
          status: deriveStatus(actionItems, current.deadline, current.status),
          updatedAt: at,
          updatedBy: actor.name,
          updatedById: actor.id,
          history: [...history, {
            action: `Cập nhật tiến độ ${actionItems.filter((item) => item.done).length}/${actionItems.length} đầu việc`,
            actor: actor.name, actorId: actor.id, at,
          }],
        };
        if (completionRate === 100) updated.completedAt = current.completedAt || at;
        else delete updated.completedAt;
      } else {
        throw new HttpError(422, 'Chỉ được ghim hoặc cập nhật trạng thái từng đầu việc.');
      }
      return { record: updated, recordKey: current.key, serialized: JSON.stringify(updated) };
    }

    const noteCode = requiredText(record.noteCode || record.key, 'Mã chỉ đạo', 80);
    const duplicate = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'doc_notes' AND (LOWER(record_key) = LOWER(?) OR LOWER(json_extract(payload_json, '$.noteCode')) = LOWER(?)) LIMIT 1").get(noteCode, noteCode);
    if (duplicate) throw new HttpError(409, 'Mã chỉ đạo đã tồn tại.');
    const title = requiredText(record.title, 'Tiêu đề chỉ đạo', 300);
    const category = oneOf(record.category, 'Phân loại chỉ đạo', ['Ý kiến chỉ đạo BGĐ', 'Giao ban tuần & Tháng', 'Biên bản cuộc họp HĐQT', 'Ghi nhớ dự án & Kỹ thuật', 'Chỉ đạo đột xuất']);
    const priority = oneOf(record.priority, 'Mức độ ưu tiên', ['Khẩn cấp P1', 'Ưu tiên cao P2', 'Bình thường P3']);
    const author = requiredText(record.author, 'Người chỉ đạo', 160);
    const authorRole = requiredText(record.authorRole, 'Chức danh', 160);
    const departmentName = requiredText(record.assignedToDept, 'Đơn vị thực thi', 160);
    const departments = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'business_org_units'").all();
    const department = departments.map((row) => parseJsonObject(row.payload_json))
      .find((item) => String(item.name || '').trim().toLocaleLowerCase() === departmentName.toLocaleLowerCase());
    if (!department || department.status === 'Tạm ngưng' || department.isActive === false) {
      throw new HttpError(422, 'Đơn vị thực thi không tồn tại hoặc đã tạm ngưng.');
    }
    const deadline = requiredIsoDate(record.deadline, 'Hạn chót hoàn thành');
    const content = requiredText(record.content, 'Nội dung chỉ đạo', 4_000);
    if (!Array.isArray(record.actionItems) || record.actionItems.length < 1 || record.actionItems.length > 50) {
      throw new HttpError(422, 'Cần có từ 1 đến 50 đầu việc cụ thể.');
    }
    const actionItems = record.actionItems.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(422, 'Đầu việc không hợp lệ.');
      return { id: index + 1, text: requiredText(item.text, `Đầu việc ${index + 1}`, 500), done: false };
    });
    if (record.isPinned !== undefined && typeof record.isPinned !== 'boolean') throw new HttpError(422, 'Trạng thái ghim không hợp lệ.');
    const completionRate = 0;
    const status = deriveStatus(actionItems, deadline);
    record = {
      key: noteCode,
      noteCode,
      title,
      category,
      priority,
      author,
      authorRole,
      assignedToDept: department.name,
      deadline,
      createdDate: at,
      createdBy: actor.name,
      createdById: actor.id,
      isPinned: record.isPinned === true,
      completionRate,
      content,
      actionItems,
      status,
      history: [{ action: 'Ban hành chỉ đạo', actor: actor.name, actorId: actor.id, at }],
      reminderHistory: [],
    };
    return { record, recordKey: noteCode, serialized: JSON.stringify(record) };
  }
  if (scope === 'finance_costing') {
    if (current) throw new HttpError(405, 'Hồ sơ giá thành đã ghi không thể thay thế hoặc xóa trực tiếp.');
    const code = requiredText(record.code || record.key, 'Mã giá thành', 80);
    const duplicate = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'finance_costing' AND LOWER(record_key) = LOWER(?) LIMIT 1").get(code);
    if (duplicate) throw new HttpError(409, 'Mã giá thành đã tồn tại.');
    const category = oneOf(record.category, 'Phân loại', ['Hợp đồng kinh tế B2B', 'Đơn đặt hàng (Job-Order)', 'Công trình thi công', 'Dịch vụ duy trì SLA']);
    const requiredAmount = (value, label) => {
      if (value === undefined || value === null || String(value).trim() === '') throw new HttpError(422, `Vui lòng nhập ${label}; nhập 0 nếu không phát sinh.`);
      const amount = Number(value);
      if (!Number.isSafeInteger(amount) || amount < 0) throw new HttpError(422, `${label} phải là số nguyên không âm hợp lệ.`);
      return amount;
    };
    const materialCost = requiredAmount(record.materialCost, 'chi phí vật tư trực tiếp');
    const directLabor = requiredAmount(record.directLabor, 'chi phí nhân công trực tiếp');
    const infrastructureCost = requiredAmount(record.infrastructureCost, 'chi phí hạ tầng');
    const softwareLicense = requiredAmount(record.softwareLicense, 'chi phí bản quyền phần mềm');
    const overheadCost = requiredAmount(record.overheadCost, 'chi phí chung khác');
    const revenue = requiredAmount(record.revenue, 'doanh thu');
    const totalCost = materialCost + directLabor + infrastructureCost + softwareLicense + overheadCost;
    if (!Number.isSafeInteger(totalCost)) throw new HttpError(422, 'Tổng chi phí vượt giới hạn số liệu an toàn.');
    const constructionSite = category === 'Công trình thi công'
      ? requiredText(record.constructionSite, 'Địa điểm công trình', 300)
      : optionalText(record.constructionSite, 'Địa điểm công trình', 300);
    const status = oneOf(record.status, 'Trạng thái hồ sơ', ['Đang thực hiện', 'Hoàn thành', 'Tạm dừng']);
    const profitMargin = revenue > 0 ? Math.round(((revenue - totalCost) / revenue) * 1000) / 10 : null;
    const saved = {
      key: code,
      code,
      projectName: requiredText(record.projectName, 'Tên dự án', 300),
      category,
      ...(constructionSite ? { constructionSite } : {}),
      materialCost,
      directLabor,
      infrastructureCost,
      softwareLicense,
      overheadCost,
      totalCost,
      revenue,
      profitMargin,
      status,
      createdDate: now(),
      createdBy: actor.name,
      createdById: actor.id,
    };
    return { record: saved, recordKey: code, serialized: JSON.stringify(saved) };
  }
  if (scope === 'finance_purchase_requests') {
    const at = now();
    if (current) {
      if (current.status !== 'Chờ xác định nhà cung cấp' || current.supplierKey) {
        throw new HttpError(409, 'Yêu cầu đã xác định nhà cung cấp và được lưu để bảo toàn lịch sử.');
      }
      const supplierKey = requiredText(record.supplierKey, 'Nhà cung cấp', 160);
      const supplier = await db.prepare("SELECT id, code, name, status FROM crm_contacts WHERE id = ? AND contact_type = 'supplier'").get(supplierKey);
      if (!supplier || /tạm|ngừng|dừng|không hoạt động|inactive/i.test(String(supplier.status || ''))) {
        throw new HttpError(422, 'Nhà cung cấp không tồn tại hoặc đã tạm dừng.');
      }
      const updated = {
        ...current,
        supplierKey: supplier.id,
        supplierCode: supplier.code,
        supplierName: supplier.name,
        status: 'Đã xác định nhà cung cấp',
        supplierSelectedAt: at,
        supplierSelectedBy: actor.name,
        supplierSelectedById: actor.id,
        history: [...(Array.isArray(current.history) ? current.history : []), {
          action: 'Xác định nhà cung cấp',
          actor: actor.name,
          actorId: actor.id,
          at,
          detail: `${supplier.code} · ${supplier.name}`,
        }],
      };
      return { record: updated, recordKey: current.key, serialized: JSON.stringify(updated) };
    }

    if (record.supplierKey) throw new HttpError(422, 'Nhà cung cấp chỉ được xác định sau khi tổng hợp yêu cầu.');
    const departmentKey = requiredText(record.departmentKey, 'Đơn vị yêu cầu', 160);
    const departmentRow = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'business_org_units' AND record_key = ? ORDER BY updated_at DESC LIMIT 1").get(departmentKey);
    if (!departmentRow) throw new HttpError(422, 'Đơn vị yêu cầu không tồn tại hoặc đã ngừng hoạt động.');
    const department = parseJsonObject(departmentRow.payload_json);
    if (department.isActive === false || /tạm|ngừng|dừng|không hoạt động|inactive/i.test(String(department.status || ''))) {
      throw new HttpError(422, 'Đơn vị yêu cầu không tồn tại hoặc đã ngừng hoạt động.');
    }

    if (!Array.isArray(record.items) || record.items.length < 1 || record.items.length > 100) {
      throw new HttpError(422, 'Yêu cầu cần có từ 1 đến 100 dòng hàng hóa hoặc dịch vụ.');
    }
    let estimatedTotal = 0;
    const items = record.items.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(422, `Dòng hàng ${index + 1} không hợp lệ.`);
      const quantity = Number(item.quantity);
      const estimatedUnitPrice = Number(item.estimatedUnitPrice);
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 1_000_000_000) {
        throw new HttpError(422, `Số lượng dòng ${index + 1} phải là số nguyên dương hợp lệ.`);
      }
      if (!Number.isSafeInteger(estimatedUnitPrice) || estimatedUnitPrice < 0 || estimatedUnitPrice > 1_000_000_000_000) {
        throw new HttpError(422, `Đơn giá dự kiến dòng ${index + 1} phải là số nguyên không âm hợp lệ.`);
      }
      const lineTotal = quantity * estimatedUnitPrice;
      if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(estimatedTotal + lineTotal)) {
        throw new HttpError(422, 'Tổng giá trị dự kiến vượt giới hạn số liệu an toàn.');
      }
      estimatedTotal += lineTotal;
      return {
        lineNumber: index + 1,
        itemName: requiredText(item.itemName, `Tên hàng hóa/dịch vụ dòng ${index + 1}`, 300),
        unit: requiredText(item.unit, `Đơn vị tính dòng ${index + 1}`, 40),
        quantity,
        estimatedUnitPrice,
        lineTotal,
      };
    });

    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(at));
    const year = date.slice(0, 4);
    const existingCodes = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'finance_purchase_requests' AND record_key LIKE ?").all(`YCMS-${year}-%`);
    const sequence = existingCodes.reduce((maximum, row) => {
      const match = new RegExp(`^YCMS-${year}-(\\d{4})$`).exec(row.record_key);
      return match ? Math.max(maximum, Number(match[1])) : maximum;
    }, 0) + 1;
    const requestNumber = `YCMS-${year}-${String(sequence).padStart(4, '0')}`;
    const saved = {
      key: requestNumber,
      requestNumber,
      departmentKey,
      departmentName: requiredText(department.name, 'Tên đơn vị yêu cầu', 160),
      requester: actor.name,
      requesterId: actor.id,
      deliveryDeadline: requiredIsoDate(record.deliveryDeadline, 'Hạn giao hàng'),
      purpose: requiredText(record.purpose, 'Mục đích mua sắm', 1_000),
      notes: optionalText(record.notes, 'Ghi chú', 2_000),
      items,
      estimatedTotal,
      status: 'Chờ xác định nhà cung cấp',
      requestDate: date,
      requestedAt: at,
      supplierKey: '',
      supplierCode: '',
      supplierName: '',
      createdBy: actor.name,
      createdById: actor.id,
      history: [{ action: 'Tạo yêu cầu mua sắm', actor: actor.name, actorId: actor.id, at }],
    };
    return { record: saved, recordKey: requestNumber, serialized: JSON.stringify(saved) };
  }
  if (scope === 'meeting_room_settings') {
    if (actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được quản lý quy định đặt phòng họp.');
    const maxDuration = Number(record.maxDuration);
    const maxAdvanceDays = Number(record.maxAdvanceDays);
    if (!Number.isSafeInteger(maxDuration) || maxDuration < 15 || maxDuration > 240) throw new HttpError(422, 'Thời lượng tối đa phải từ 15 đến 240 phút.');
    if (!Number.isSafeInteger(maxAdvanceDays) || maxAdvanceDays < 1 || maxAdvanceDays > 365) throw new HttpError(422, 'Số ngày đặt trước phải từ 1 đến 365 ngày.');
    const updatedAt = now();
    const updated = {
      key: 'default', maxDuration, maxAdvanceDays,
      updatedBy: actor.name, updatedById: actor.id, updatedAt,
      ...(current?.createdAt ? { createdAt: current.createdAt } : { createdAt: updatedAt }),
      history: [ ...(Array.isArray(current?.history) ? current.history : []), { action: 'Cập nhật quy định đặt phòng', actor: actor.name, actorId: actor.id, at: updatedAt } ],
    };
    return { record: updated, recordKey: 'default', serialized: JSON.stringify(updated) };
  }
  if (scope === 'meeting_rooms') {
    if (current) {
      const status = oneOf(record.status, 'Trạng thái phòng họp', ['Trống', 'Đang sử dụng', 'Bảo trì', 'Tạm ngưng']);
      const updatedAt = now();
      const updated = {
        ...current, status, updatedBy: actor.name, updatedById: actor.id, updatedAt,
        history: [ ...(Array.isArray(current.history) ? current.history : []), { action: `Đổi trạng thái thành ${status}`, actor: actor.name, actorId: actor.id, at: updatedAt } ],
      };
      return { record: updated, recordKey: current.key, serialized: JSON.stringify(updated) };
    }
    for (const field of Object.keys(record)) if (!['key', 'name', 'capacity', 'location', 'equipment'].includes(field)) delete record[field];
    record.key = requiredText(record.key, 'Khóa phòng họp', 160);
    record.name = requiredText(record.name, 'Tên phòng họp', 160);
    const duplicateName = await db.prepare(`SELECT record_key FROM collection_records
      WHERE scope = 'meeting_rooms' AND LOWER(json_extract(payload_json, '$.name')) = LOWER(?) LIMIT 1`).get(record.name);
    if (duplicateName) throw new HttpError(409, 'Tên phòng họp đã tồn tại.');
    const capacity = Number(record.capacity);
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000) throw new HttpError(422, 'Sức chứa phải là số nguyên từ 1 đến 1.000.');
    record.capacity = capacity;
    record.location = requiredText(record.location, 'Vị trí phòng họp', 255);
    const equipment = Array.isArray(record.equipment) ? record.equipment : String(record.equipment || '').split(',');
    record.equipment = [...new Set(equipment.map(item => optionalText(item, 'Thiết bị phòng họp', 100)).filter(Boolean))].slice(0, 40);
    record.status = 'Trống';
    record.createdBy = actor.name;
    record.createdById = actor.id;
    record.createdAt = now();
  }
  if (scope === 'room_bookings') {
    if (current) {
      if (actor.role !== 'ADMIN' && actor.id !== current.bookerId) throw new HttpError(403, 'Chỉ người đặt lịch hoặc quản trị viên được hủy lịch này.');
      if (current.status !== 'Đã xác nhận' || value.status !== 'Đã hủy') throw new HttpError(409, 'Chỉ lịch đang xác nhận mới được hủy.');
      record.key = current.key;
      record.status = 'Đã hủy';
      record.canceledBy = actor.name;
      record.canceledById = actor.id;
      record.canceledAt = now();
      record.history = [...(Array.isArray(current.history) ? current.history : []), {
        action: 'Hủy lịch họp', actor: actor.name, actorId: actor.id, at: record.canceledAt,
      }];
    } else {
      for (const field of Object.keys(record)) if (!['key', 'roomKey', 'roomName', 'meetingTitle', 'date', 'timeSlot', 'participantsCount'].includes(field)) delete record[field];
      record.key = requiredText(record.key, 'Khóa lịch họp', 160);
      const suppliedRoomName = optionalText(record.roomName, 'Tên phòng họp', 160);
      const roomKey = optionalText(record.roomKey, 'Khóa phòng họp', 160)
        || (await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'meeting_rooms' AND LOWER(json_extract(payload_json, '$.name')) = LOWER(?) LIMIT 1").get(suppliedRoomName))?.record_key;
      if (!roomKey) throw new HttpError(422, 'Chọn một phòng họp đang có trong danh mục.');
      const roomRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'meeting_rooms' AND record_key = ? ORDER BY updated_at DESC LIMIT 1").get(roomKey);
      const room = publicCollectionRecord(roomRow);
      if (!room || room.status === 'Bảo trì' || room.status === 'Tạm ngưng') throw new HttpError(422, 'Phòng họp không tồn tại hoặc đang tạm ngưng sử dụng.');
      const date = requiredIsoDate(record.date, 'Ngày họp');
      const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      if (date < businessDate) throw new HttpError(422, 'Không thể đặt phòng cho ngày đã qua.');
      const { slot, start, end } = parseMeetingTimeRange(record.timeSlot);
      const settingsRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'meeting_room_settings' AND record_key = 'default' ORDER BY updated_at DESC LIMIT 1").get();
      const settings = publicCollectionRecord(settingsRow) || { maxDuration: 120, maxAdvanceDays: 14 };
      const bookingDay = Date.parse(`${date}T00:00:00.000Z`);
      const businessDay = Date.parse(`${businessDate}T00:00:00.000Z`);
      if (end - start > Number(settings.maxDuration || 120)) throw new HttpError(422, `Thời lượng họp vượt quá giới hạn ${settings.maxDuration || 120} phút.`);
      if ((bookingDay - businessDay) / 86_400_000 > Number(settings.maxAdvanceDays || 14)) throw new HttpError(422, `Chỉ được đặt phòng trước tối đa ${settings.maxAdvanceDays || 14} ngày.`);
      const participantsCount = Number(record.participantsCount);
      if (!Number.isSafeInteger(participantsCount) || participantsCount < 1 || participantsCount > room.capacity) {
        throw new HttpError(422, `Số người tham gia phải từ 1 đến ${room.capacity}.`);
      }
      const bookings = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'room_bookings' AND json_extract(payload_json, '$.date') = ?").all(date);
      const conflict = bookings.map(row => parseJsonObject(row.payload_json)).some(booking => {
        if (booking.status !== 'Đã xác nhận' || (booking.roomKey !== room.key && String(booking.roomName || '').toLocaleLowerCase() !== String(room.name).toLocaleLowerCase())) return false;
        try {
          const other = parseMeetingTimeRange(booking.timeSlot);
          return start < other.end && other.start < end;
        } catch {
          return String(booking.timeSlot || '') === slot;
        }
      });
      if (conflict) throw new HttpError(409, 'Phòng đã có lịch trùng khung giờ. Hãy chọn khung giờ khác.');
      record.roomKey = room.key;
      record.roomName = room.name;
      record.roomLocation = room.location;
      record.roomCapacity = room.capacity;
      record.meetingTitle = requiredText(record.meetingTitle, 'Tiêu đề cuộc họp', 255);
      record.date = date;
      record.timeSlot = slot;
      record.participantsCount = participantsCount;
      record.booker = actor.name;
      record.bookerId = actor.id;
      record.status = 'Đã xác nhận';
      record.createdAt = now();
      record.history = [{ action: 'Đặt phòng họp', actor: actor.name, actorId: actor.id, at: record.createdAt }];
    }
  }
  if (scope === 'crm_feedback') {
    const priorities = ['Khẩn cấp', 'Cao', 'Trung bình'];
    const allowedFields = new Set(['key', 'feedbackCode', 'clientName', 'contactPerson', 'phone', 'serviceName', 'rating', 'content', 'priority', 'assignedStaffId', 'assignedStaff', 'status', 'resolutionAction', 'receivedDate', 'resolvedDate', 'resolvedBy', 'resolvedById', 'createdBy', 'createdById', 'createdAt']);
    for (const field of Object.keys(record)) if (!allowedFields.has(field)) delete record[field];
    if (!current) {
      record.key = requiredText(record.key, 'Khóa phản ánh', 160);
      record.feedbackCode = requiredText(record.feedbackCode, 'Mã phản ánh', 80);
      const duplicateCode = await db.prepare(`SELECT record_key FROM collection_records
        WHERE scope = 'crm_feedback' AND LOWER(json_extract(payload_json, '$.feedbackCode')) = LOWER(?) LIMIT 1`).get(record.feedbackCode);
      if (duplicateCode) throw new HttpError(409, 'Mã phản ánh đã tồn tại.');
      record.clientName = requiredText(record.clientName, 'Khách hàng', 255);
      record.contactPerson = optionalText(record.contactPerson, 'Người phản ánh', 160);
      record.phone = optionalText(record.phone, 'Số điện thoại', 80);
      record.serviceName = requiredText(record.serviceName, 'Dịch vụ liên quan', 255);
      const rating = record.rating == null || record.rating === '' ? null : Number(record.rating);
      if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new HttpError(422, 'Đánh giá phải là số nguyên từ 1 đến 5 sao.');
      record.rating = rating;
      record.content = requiredText(record.content, 'Nội dung phản ánh', 4_000);
      record.priority = oneOf(record.priority, 'Mức độ ưu tiên', priorities);
      const assignedStaffId = requiredText(record.assignedStaffId, 'Cán bộ phụ trách', 160);
      const assignedStaff = await db.prepare(`SELECT u.id, u.name, p.employment_status FROM users u
        LEFT JOIN employee_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.is_active = 1`).get(assignedStaffId);
      if (!assignedStaff || assignedStaff.employment_status === 'Đã nghỉ việc') throw new HttpError(422, 'Cán bộ phụ trách phải là nhân viên đang hoạt động.');
      record.assignedStaffId = assignedStaff.id;
      record.assignedStaff = assignedStaff.name;
      record.receivedDate = now().slice(0, 10);
      record.resolutionAction = '';
      record.resolvedDate = '';
      record.resolvedBy = '';
      record.resolvedById = '';
      record.status = 'Đang xử lý';
      record.createdBy = actor.name;
      record.createdById = actor.id;
      record.createdAt = now();
    } else {
      if (current.status !== 'Đang xử lý' || value.status !== 'Đã giải quyết thỏa đáng') {
        throw new HttpError(422, 'Phản ánh chỉ được chuyển từ đang xử lý sang đã giải quyết.');
      }
      record.key = current.key;
      for (const field of ['feedbackCode', 'clientName', 'contactPerson', 'phone', 'serviceName', 'rating', 'content', 'priority', 'assignedStaff', 'assignedStaffId', 'receivedDate', 'createdBy', 'createdById', 'createdAt']) {
        record[field] = current[field];
      }
      record.resolutionAction = requiredText(value.resolutionAction, 'Biện pháp xử lý', 4_000);
      record.status = 'Đã giải quyết thỏa đáng';
      record.resolvedDate = now().slice(0, 10);
      record.resolvedBy = actor.name;
      record.resolvedById = actor.id;
    }
  }
  if (scope === 'crm_supplier_evaluations') {
    if (current) throw new HttpError(422, 'Đánh giá nhà cung cấp đã lưu không thể sửa.');
    const allowedFields = new Set(['key', 'evalCode', 'supplierId', 'evalPeriod', 'qualityScore', 'deliveryScore', 'priceScore', 'serviceScore', 'strengths', 'weaknesses', 'decision', 'supplierName', 'category', 'totalScore', 'tier', 'evaluator', 'evaluatorId', 'evalDate', 'createdAt', 'createdBy', 'createdById']);
    for (const field of Object.keys(record)) if (!allowedFields.has(field)) delete record[field];
    record.key = requiredText(record.key, 'Khóa đánh giá', 160);
    record.evalCode = requiredText(record.evalCode, 'Mã đánh giá', 80);
    const duplicateCode = await db.prepare(`SELECT record_key FROM collection_records
      WHERE scope = 'crm_supplier_evaluations' AND LOWER(json_extract(payload_json, '$.evalCode')) = LOWER(?) LIMIT 1`).get(record.evalCode);
    if (duplicateCode) throw new HttpError(409, 'Mã đánh giá nhà cung cấp đã tồn tại.');
    const supplierId = requiredText(record.supplierId, 'Nhà cung cấp', 160);
    const supplier = await db.prepare("SELECT id, name, industry, status FROM crm_contacts WHERE id = ? AND contact_type = 'supplier'").get(supplierId);
    if (!supplier || String(supplier.status).toLocaleLowerCase().includes('tạm')) throw new HttpError(422, 'Nhà cung cấp không tồn tại hoặc đang tạm dừng.');
    record.supplierId = supplier.id;
    record.supplierName = supplier.name;
    record.category = supplier.industry;
    record.evalPeriod = requiredText(record.evalPeriod, 'Kỳ đánh giá', 100);
    const scoreLimits = { qualityScore: 40, deliveryScore: 30, priceScore: 20, serviceScore: 10 };
    for (const [field, maximum] of Object.entries(scoreLimits)) {
      const score = Number(record[field]);
      if (record[field] === '' || record[field] === undefined || !Number.isInteger(score) || score < 0 || score > maximum) {
        throw new HttpError(422, `Điểm ${field} phải là số nguyên từ 0 đến ${maximum}.`);
      }
      record[field] = score;
    }
    record.totalScore = record.qualityScore + record.deliveryScore + record.priceScore + record.serviceScore;
    record.tier = record.totalScore >= 90 ? 'Hạng A' : record.totalScore >= 75 ? 'Hạng B' : 'Hạng C';
    record.evaluator = actor.name;
    record.evaluatorId = actor.id;
    record.evalDate = now().slice(0, 10);
    record.createdAt = now();
    record.createdBy = actor.name;
    record.createdById = actor.id;
    record.strengths = optionalText(record.strengths, 'Ưu điểm', 2_000);
    record.weaknesses = optionalText(record.weaknesses, 'Điểm cần cải thiện', 2_000);
    const decisions = ['Duy trì đối tác chiến lược', 'Gia hạn hợp đồng & đàm phán giá', 'Yêu cầu khắc phục SLA trong 30 ngày', 'Chấm dứt hợp tác'];
    record.decision = record.decision ? oneOf(record.decision, 'Kết luận đề xuất', decisions) : '';
  }
  if (scope === 'crm_promotions') {
    const editable = new Set([
      'key', 'code', 'name', 'startDate', 'endDate', 'promotionType', 'target', 'enabled', 'allowConcurrent',
      'eligibleItemCodes', 'amountBasis', 'orgUnitKeys', 'employeeIds', 'applyOnce', 'combinablePromotionKeys',
      'taxCondition', 'minimumSubtotal', 'unitPrice', 'unit', 'customerKeys', 'discountKind', 'discountValue',
    ]);
    for (const field of Object.keys(record)) if (!editable.has(field)) delete record[field];
    record.key = current ? current.key : requiredText(record.key, 'Khóa chương trình', 160);
    record.code = requiredText(record.code, 'Mã chương trình', 80);
    const duplicate = await db.prepare(`SELECT record_key FROM collection_records
      WHERE scope = 'crm_promotions' AND LOWER(json_extract(payload_json, '$.code')) = LOWER(?) AND record_key <> ? LIMIT 1`)
      .get(record.code, current?.key || '');
    if (duplicate) throw new HttpError(409, 'Mã chương trình khuyến mại đã tồn tại.');
    record.name = requiredText(record.name, 'Tên chương trình', 180);
    record.startDate = requiredIsoDate(record.startDate, 'Ngày bắt đầu');
    record.endDate = requiredIsoDate(record.endDate, 'Ngày kết thúc');
    if (record.endDate < record.startDate) throw new HttpError(422, 'Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.');
    record.promotionType = oneOf(record.promotionType, 'Loại khuyến mại', ['Chiết khấu', 'Tặng quà', 'Tích điểm']);
    record.target = requiredText(record.target, 'Đối tượng áp dụng', 180);
    record.amountBasis = oneOf(record.amountBasis, 'Căn cứ khuyến mại', ['Thành tiền trước thuế', 'Thành tiền sau thuế']);
    record.taxCondition = oneOf(record.taxCondition, 'Điều kiện thuế', ['Bất kỳ', 'Có thuế', 'Không thuế']);
    record.discountKind = oneOf(record.discountKind, 'Kiểu chiết khấu', ['Phần trăm', 'Số tiền']);
    record.minimumSubtotal = optionalAmount(record.minimumSubtotal, 'Điều kiện theo thành tiền');
    record.unitPrice = optionalAmount(record.unitPrice, 'Đơn giá áp dụng');
    record.discountValue = optionalAmount(record.discountValue, 'Giá trị khuyến mại');
    if (record.promotionType === 'Chiết khấu' && record.discountValue <= 0) throw new HttpError(422, 'Chương trình chiết khấu phải có giá trị lớn hơn 0.');
    if (record.discountKind === 'Phần trăm' && record.discountValue > 100) throw new HttpError(422, 'Chiết khấu theo phần trăm không được vượt quá 100%.');
    record.unit = requiredText(record.unit, 'Đơn vị', 80);
    const list = (input, field, maxItems = 500, maxLength = 160) => {
      if (input === undefined || input === null) return [];
      if (!Array.isArray(input) || input.length > maxItems) throw new HttpError(422, `${field} không hợp lệ.`);
      const values = input.map((item) => requiredText(item, field, maxLength));
      if (new Set(values).size !== values.length) throw new HttpError(422, `${field} không được trùng lặp.`);
      return values;
    };
    record.eligibleItemCodes = list(record.eligibleItemCodes, 'Mã hàng áp dụng', 500, 100);
    record.orgUnitKeys = list(record.orgUnitKeys, 'Cơ cấu tổ chức', 250);
    record.employeeIds = list(record.employeeIds, 'Nhân viên áp dụng', 500);
    record.customerKeys = list(record.customerKeys, 'Khách hàng', 500);
    record.combinablePromotionKeys = record.allowConcurrent === true ? list(record.combinablePromotionKeys, 'Chương trình áp dụng đồng thời', 200) : [];
    if (record.promotionType === 'Tặng quà' && !record.eligibleItemCodes.length) throw new HttpError(422, 'Chương trình tặng quà phải khai báo mã hàng hoặc bộ quà áp dụng.');
    if (record.orgUnitKeys.length) {
      const placeholders = record.orgUnitKeys.map(() => '?').join(',');
      const rows = await db.prepare(`SELECT record_key FROM collection_records WHERE scope = 'business_org_units' AND record_key IN (${placeholders})`).all(...record.orgUnitKeys);
      if (rows.length !== record.orgUnitKeys.length) throw new HttpError(422, 'Có đơn vị áp dụng không còn tồn tại.');
    }
    for (const id of record.employeeIds) {
      const employee = await db.prepare("SELECT id FROM users WHERE id = ? AND is_active = 1").get(id);
      if (!employee) throw new HttpError(422, 'Nhân viên áp dụng phải là tài khoản đang hoạt động.');
    }
    for (const key of record.customerKeys) {
      const customer = await db.prepare("SELECT id FROM crm_contacts WHERE id = ? AND contact_type = 'customer'").get(key);
      if (!customer) throw new HttpError(422, 'Khách hàng áp dụng không tồn tại trong danh bạ CRM.');
    }
    for (const key of record.combinablePromotionKeys) {
      if (key === record.key) throw new HttpError(422, 'Chương trình không thể áp dụng đồng thời với chính nó.');
      const other = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'crm_promotions' AND record_key = ?").get(key);
      if (!other) throw new HttpError(422, 'Chương trình áp dụng đồng thời không tồn tại.');
    }
    const timestamp = now();
    const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    record.enabled = record.enabled === true;
    record.allowConcurrent = record.allowConcurrent === true;
    record.applyOnce = record.applyOnce === true;
    record.owner = current?.owner || actor.name;
    record.ownerId = current?.ownerId || actor.id;
    record.createdAt = current?.createdAt || timestamp;
    record.createdBy = current?.createdBy || actor.name;
    record.createdById = current?.createdById || actor.id;
    record.updatedAt = timestamp;
    record.updatedBy = actor.name;
    record.updatedById = actor.id;
    record.status = record.endDate < businessDate ? 'Đã kết thúc' : !record.enabled ? 'Tạm dừng' : record.startDate > businessDate ? 'Nháp' : 'Đang hoạt động';
    record.history = [...(Array.isArray(current?.history) ? current.history : []), {
      action: current ? 'Cập nhật chương trình' : 'Tạo chương trình', actor: actor.name, actorId: actor.id, at: timestamp,
    }].slice(-200);
  }
  if (scope === 'asset_items') {
    const assetCode = String(record.code || '').trim();
    const barcode = String(record.barcode || '').trim().replace(/\s+/g, '');
    if (assetCode) {
      const duplicateCode = await db.prepare(`SELECT record_key FROM collection_records
        WHERE scope = 'asset_items' AND LOWER(json_extract(payload_json, '$.code')) = LOWER(?) AND record_key <> ? LIMIT 1`)
        .get(assetCode, current?.key || record.key || '');
      if (duplicateCode) throw new HttpError(409, 'Mã tài sản đã tồn tại.');
      record.code = assetCode;
    }
    if (barcode) {
      const duplicateBarcode = await db.prepare(`SELECT record_key FROM collection_records
        WHERE scope = 'asset_items' AND LOWER(REPLACE(json_extract(payload_json, '$.barcode'), ' ', '')) = LOWER(?) AND record_key <> ? LIMIT 1`)
        .get(barcode, current?.key || record.key || '');
      if (duplicateBarcode) throw new HttpError(409, 'Mã barcode đã tồn tại.');
      record.barcode = barcode;
    }
  }
  if (scope === 'asset_depreciations') {
    if (current) {
      for (const field of ['assetKey', 'assetCode', 'assetName', 'category', 'department', 'originalCost', 'lifeMonths', 'residualValue', 'startDate', 'depreciationMethod', 'costAccount', 'assetAccount', 'productionCapacity']) {
        record[field] = current[field];
      }
    } else {
      record.key = requiredText(record.key, 'Khóa hồ sơ khấu hao', 160);
      const assetKey = requiredText(record.assetKey, 'Tài sản', 160);
      const assetRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items' AND record_key = ? ORDER BY updated_at DESC LIMIT 1").get(assetKey);
      const asset = publicCollectionRecord(assetRow);
      if (!asset || !['Đang sử dụng', 'Trong kho'].includes(asset.status)) {
        throw new HttpError(422, 'Chỉ tài sản đang sử dụng hoặc trong kho mới được lập hồ sơ khấu hao.');
      }
      const code = requiredText(asset.code || asset.assetCode, 'Mã tài sản', 80);
      const duplicateAsset = await db.prepare(`SELECT record_key FROM collection_records
        WHERE scope = 'asset_depreciations'
          AND (json_extract(payload_json, '$.assetKey') = ? OR LOWER(json_extract(payload_json, '$.assetCode')) = LOWER(?))
        LIMIT 1`).get(asset.key, code);
      if (duplicateAsset) throw new HttpError(409, 'Tài sản đã có hồ sơ khấu hao.');
      const originalCost = optionalAmount(asset.originalPrice, 'Nguyên giá tài sản');
      const accumulatedDepreciation = optionalAmount(asset.accumulatedDepreciation, 'Khấu hao lũy kế');
      if (originalCost <= 0 || accumulatedDepreciation < 0 || accumulatedDepreciation > originalCost) {
        throw new HttpError(422, 'Chỉ lập hồ sơ mới khi tài sản có nguyên giá hợp lệ và khấu hao lũy kế không vượt nguyên giá.');
      }
      const lifeMonths = Number(asset.depreciationMonths);
      if (!Number.isSafeInteger(lifeMonths) || lifeMonths < 1 || lifeMonths > 120) {
        throw new HttpError(422, 'Thời gian khấu hao trong danh mục phải từ 1 đến 120 tháng.');
      }
      const residualValue = optionalAmount(record.residualValue, 'Giá trị thu hồi');
      if (residualValue >= originalCost) throw new HttpError(422, 'Giá trị thu hồi phải nhỏ hơn nguyên giá.');
      const methods = ['Đường thẳng', 'Số dư giảm dần có điều chỉnh', 'Theo sản lượng / Công suất'];
      record.depreciationMethod = oneOf(record.depreciationMethod, 'Phương pháp khấu hao', methods);
      record.costAccount = oneOf(record.costAccount, 'Tài khoản chi phí', [
        'Nợ 6421 (CP Quản lý CNTT)', 'Nợ 6422 (CP Vật liệu & CCDC Văn phòng)',
        'Nợ 641 (CP Bán Hàng)', 'Nợ 627 (CP Sản xuất chung)',
      ]);
      record.assetAccount = oneOf(record.assetAccount, 'Tài khoản hao mòn', [
        'Có 2141 (Hao mòn TSCĐ hữu hình)', 'Có 2143 (Hao mòn TSCĐ vô hình)',
      ]);
      const startDate = requiredIsoDate(record.startDate, 'Ngày bắt đầu khấu hao');
      const productionCapacity = record.depreciationMethod === 'Theo sản lượng / Công suất'
        ? requiredAmount(record.productionCapacity, 'Tổng sản lượng dự kiến') : 0;
      const openingMonths = Number(record.openingDepreciatedMonths ?? 0);
      if (!Number.isSafeInteger(openingMonths) || openingMonths < 0 || openingMonths > lifeMonths) {
        throw new HttpError(422, 'Số tháng khấu hao đầu kỳ phải là số nguyên từ 0 đến thời gian khấu hao.');
      }
      const rawOpeningProduction = record.openingProductionByPeriod ?? {};
      if (!rawOpeningProduction || typeof rawOpeningProduction !== 'object' || Array.isArray(rawOpeningProduction)) {
        throw new HttpError(422, 'Lịch sản lượng đầu kỳ không hợp lệ.');
      }
      const openingProductionByPeriod = {};
      for (const [period, quantity] of Object.entries(rawOpeningProduction)) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 0) {
          throw new HttpError(422, `Sản lượng đầu kỳ ${period} phải là số nguyên không âm theo kỳ YYYY-MM.`);
        }
        openingProductionByPeriod[period] = Number(quantity);
      }
      if (record.depreciationMethod === 'Theo sản lượng / Công suất'
        && Object.values(openingProductionByPeriod).reduce((sum, quantity) => sum + quantity, 0) > productionCapacity) {
        throw new HttpError(422, 'Tổng sản lượng đầu kỳ vượt công suất dự kiến trong vòng đời tài sản.');
      }
      if (record.depreciationMethod !== 'Theo sản lượng / Công suất' && Object.keys(openingProductionByPeriod).length) {
        throw new HttpError(422, 'Chỉ phương pháp theo sản lượng mới nhận lịch sản lượng đầu kỳ.');
      }
      const scheduleList = buildAssetDepreciationSchedule({
        originalCost, residualValue, lifeMonths, startDate, depreciatedMonths: openingMonths,
        method: record.depreciationMethod, productionCapacity, productionByPeriod: openingProductionByPeriod,
      });
      const expectedOpeningPeriods = scheduleList.slice(0, openingMonths).map((row) => row.period);
      if (record.depreciationMethod === 'Theo sản lượng / Công suất') {
        const suppliedPeriods = Object.keys(openingProductionByPeriod).sort();
        if (JSON.stringify(suppliedPeriods) !== JSON.stringify([...expectedOpeningPeriods].sort())) {
          throw new HttpError(422, 'Cần nhập sản lượng đầu kỳ cho đủ từng tháng đã khấu hao và không nhập kỳ ngoài khoảng này.');
        }
      } else if (Object.keys(openingProductionByPeriod).length) {
        throw new HttpError(422, 'Lịch sản lượng đầu kỳ không khớp phương pháp khấu hao.');
      }
      const openingAccumulated = openingMonths ? Number(scheduleList[openingMonths - 1]?.accumulatedAmount || 0) : 0;
      if (openingAccumulated !== accumulatedDepreciation) {
        throw new HttpError(422, 'Số dư khấu hao trong danh mục không khớp thời gian, phương pháp và lịch đầu kỳ đã nhập.');
      }
      if (asset.netBookValue !== undefined && asset.netBookValue !== null && asset.netBookValue !== ''
        && optionalAmount(asset.netBookValue, 'Giá trị còn lại tài sản') !== originalCost - accumulatedDepreciation) {
        throw new HttpError(422, 'Giá trị còn lại trong danh mục không khớp nguyên giá trừ khấu hao lũy kế.');
      }
      if (openingMonths > 0) {
        const businessPeriod = inventoryBusinessDate().slice(0, 7);
        const priorPeriodDate = new Date(`${businessPeriod}-01T00:00:00.000Z`);
        priorPeriodDate.setUTCMonth(priorPeriodDate.getUTCMonth() - 1);
        const priorPeriod = priorPeriodDate.toISOString().slice(0, 7);
        const throughPeriod = scheduleList[openingMonths - 1]?.period;
        if (throughPeriod !== priorPeriod) {
          throw new HttpError(422, `Số dư đầu kỳ phải khớp lịch đến hết kỳ gần nhất (${priorPeriod}).`);
        }
        const [year, month] = throughPeriod.split('-').map(Number);
        const periodEndDate = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
        record.lastRunDate = periodEndDate;
        record.openingBalanceImport = {
          accumulatedDepreciation: openingAccumulated,
          depreciatedMonths: openingMonths,
          throughPeriod,
          importedAt: now(),
          importedBy: actor.name,
          importedById: actor.id,
        };
      } else {
        record.lastRunDate = 'Chưa trích';
        delete record.openingBalanceImport;
      }
      delete record.openingDepreciatedMonths;
      delete record.openingProductionByPeriod;
      const [endYear, endMonth] = scheduleList.at(-1).period.split('-').map(Number);
      record.assetKey = asset.key;
      record.assetCode = code;
      record.assetName = requiredText(asset.name || asset.assetName, 'Tên tài sản', 255);
      record.category = optionalText(asset.category, 'Nhóm tài sản', 120);
      record.department = optionalText(asset.department, 'Phòng ban', 160);
      record.originalCost = originalCost;
      record.residualValue = residualValue;
      record.lifeMonths = lifeMonths;
      record.startDate = startDate;
      record.productionCapacity = productionCapacity || undefined;
      record.productionByPeriod = openingProductionByPeriod;
      record.depreciatedMonths = openingMonths;
      record.monthlyDeprec = scheduleList[openingMonths]?.monthlyAmount || 0;
      const reportingYear = (openingMonths ? inventoryBusinessDate() : startDate).slice(0, 4);
      record.yearlyDeprec = scheduleList.filter((row) => row.period.startsWith(`${reportingYear}-`)).reduce((sum, row) => sum + row.monthlyAmount, 0);
      record.accumulatedDeprec = openingAccumulated;
      record.netBookValue = originalCost - openingAccumulated;
      record.endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
      record.status = openingMonths >= lifeMonths || record.netBookValue <= residualValue ? 'Đã trích hết 100%' : 'Đang trích khấu hao';
      record.notes = optionalText(record.notes, 'Ghi chú', 2_000);
      record.scheduleList = scheduleList;
      record.createdBy = actor.name;
      record.createdById = actor.id;
      record.createdAt = now();
    }
  }
  if (scope === 'asset_disposals') {
    const methods = ['Bán đấu giá nội bộ CBNV', 'Bán thanh lý cho đơn vị thu mua ngoài', 'Tiêu hủy an toàn (Data Wiping / Shredding)', 'Tặng / Quyên góp từ thiện', 'Báo mất / Thất lạc do rủi ro'];
    const finalStatuses = ['Đã thanh lý & Hoàn tất sổ sách', 'Đã tiêu hủy an toàn', 'Đã xử lý mất'];
    const needsDataWipe = (category, method) => method.startsWith('Tiêu hủy') || ['Thiết bị IT', 'Máy chủ & Hạ tầng IDC'].includes(category);
    record.key = current?.key || requiredText(record.key, 'Khóa biên bản thanh lý', 160);
    if (!current) {
      record.disposalCode = requiredText(record.disposalCode, 'Mã biên bản thanh lý', 80);
      const duplicateCode = await db.prepare(`SELECT record_key FROM collection_records
        WHERE scope = 'asset_disposals' AND LOWER(json_extract(payload_json, '$.disposalCode')) = LOWER(?) LIMIT 1`).get(record.disposalCode);
      if (duplicateCode) throw new HttpError(409, 'Mã biên bản thanh lý đã tồn tại.');
      record.disposalMethod = oneOf(record.disposalMethod, 'Hình thức thanh lý', methods);
      record.reason = requiredText(record.reason, 'Lý do thanh lý', 2_000);
      record.disposalDate = requiredIsoDate(record.disposalDate, 'Ngày đề xuất');
      record.startingAuctionPrice = optionalAmount(record.startingAuctionPrice, 'Giá khởi điểm');
      record.councilLeader = requiredText(record.councilLeader, 'Chủ tịch hội đồng', 160);
      record.councilMembers = requiredText(record.councilMembers, 'Thành viên hội đồng', 1_000);
      record.notes = optionalText(record.notes, 'Ghi chú', 2_000);
      const assetKey = requiredText(record.assetKey, 'Tài sản', 160);
      const assetRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items' AND record_key = ? ORDER BY updated_at DESC LIMIT 1").get(assetKey);
      const asset = publicCollectionRecord(assetRow);
      if (!asset || !['Đang sử dụng', 'Trong kho', 'Chờ thanh lý'].includes(asset.status)) {
        throw new HttpError(422, 'Tài sản không tồn tại hoặc không đủ điều kiện đề xuất thanh lý.');
      }
      const duplicateAsset = await db.prepare(`SELECT record_key FROM collection_records
        WHERE scope = 'asset_disposals' AND json_extract(payload_json, '$.assetKey') = ?
          AND json_extract(payload_json, '$.status') IN ('Chờ hội đồng phê duyệt', 'Đang thực hiện xử lý', 'Đang đấu giá / Thu gom') LIMIT 1`).get(assetKey);
      if (duplicateAsset) throw new HttpError(409, 'Tài sản đã có một hồ sơ thanh lý đang xử lý.');
      const originalCost = optionalAmount(asset.originalPrice, 'Nguyên giá tài sản');
      const accumulatedDepreciation = optionalAmount(asset.accumulatedDepreciation, 'Khấu hao lũy kế');
      if (accumulatedDepreciation > originalCost) throw new HttpError(422, 'Khấu hao lũy kế không được vượt nguyên giá.');
      record.assetKey = asset.key;
      record.assetCode = requiredText(asset.code, 'Mã tài sản', 80);
      record.assetName = requiredText(asset.name, 'Tên tài sản', 255);
      record.category = optionalText(asset.category, 'Nhóm tài sản', 120);
      record.serialNo = optionalText(asset.model, 'Số hiệu tài sản', 160);
      record.sourceAssetStatus = asset.status;
      record.originalCost = originalCost;
      record.accumulatedDepreciation = accumulatedDepreciation;
      record.netBookValue = originalCost - accumulatedDepreciation;
      record.actualDisposalPrice = 0;
      record.disposalCost = 0;
      record.netGainLoss = 0;
      record.buyerName = ''; record.buyerPhone = '';
      record.securityDataWipeCertified = false; record.dataWipeOfficer = '';
      record.requester = actor.name; record.requesterId = actor.id; record.requestedAt = now();
      record.approvedBy = ''; record.approvedById = ''; record.approvedAt = '';
      record.completedBy = ''; record.completedById = ''; record.completedAt = '';
      record.status = 'Chờ hội đồng phê duyệt';
    } else {
      const immutable = ['disposalCode', 'disposalMethod', 'reason', 'disposalDate', 'startingAuctionPrice', 'councilLeader', 'councilMembers', 'notes', 'assetKey', 'assetCode', 'assetName', 'category', 'serialNo', 'sourceAssetStatus', 'originalCost', 'accumulatedDepreciation', 'netBookValue', 'requester', 'requesterId', 'requestedAt'];
      for (const field of immutable) record[field] = current[field];
      const requestedStatus = record.status;
      Object.assign(record, current);
      if (current.status === 'Chờ hội đồng phê duyệt' && requestedStatus === 'Đang thực hiện xử lý') {
        record.status = requestedStatus;
        record.approvedBy = actor.name; record.approvedById = actor.id; record.approvedAt = now();
      } else if (['Đang thực hiện xử lý', 'Đang đấu giá / Thu gom'].includes(current.status) && finalStatuses.includes(requestedStatus)) {
        record.status = requestedStatus;
        record.actualDisposalPrice = optionalAmount(value.actualDisposalPrice, 'Số tiền thu thực tế');
        record.disposalCost = optionalAmount(value.disposalCost, 'Chi phí xử lý');
        record.disposalDate = requiredIsoDate(value.disposalDate, 'Ngày xử lý thực tế');
        record.buyerName = optionalText(value.buyerName, 'Bên mua / tiếp nhận', 255);
        record.buyerPhone = optionalText(value.buyerPhone, 'Số điện thoại liên hệ', 80);
        if ((record.disposalMethod.startsWith('Bán') && record.actualDisposalPrice <= 0)
          || (record.disposalMethod.startsWith('Bán') && !record.buyerName)
          || (record.disposalMethod.startsWith('Tặng') && !record.buyerName)) {
          throw new HttpError(422, 'Hồ sơ bán phải có số tiền lớn hơn 0 và bên mua; hồ sơ tặng phải có đơn vị tiếp nhận.');
        }
        const expectedStatus = record.disposalMethod.startsWith('Tiêu hủy') ? 'Đã tiêu hủy an toàn'
          : record.disposalMethod.startsWith('Báo mất') ? 'Đã xử lý mất' : 'Đã thanh lý & Hoàn tất sổ sách';
        if (requestedStatus !== expectedStatus) throw new HttpError(422, 'Trạng thái hoàn tất không khớp với hình thức xử lý.');
        record.securityDataWipeCertified = value.securityDataWipeCertified === true;
        record.dataWipeOfficer = record.securityDataWipeCertified ? requiredText(value.dataWipeOfficer, 'Người ghi nhận xóa dữ liệu', 160) : '';
        if (needsDataWipe(record.category, record.disposalMethod) && !record.securityDataWipeCertified) {
          throw new HttpError(422, 'Tài sản hoặc hình thức xử lý này cần ghi nhận thao tác xóa dữ liệu trước khi hoàn tất.');
        }
        record.netGainLoss = record.actualDisposalPrice - record.disposalCost - record.netBookValue;
        if (!Number.isSafeInteger(record.netGainLoss)) throw new HttpError(422, 'Kết quả lãi/lỗ vượt giới hạn tính toán.');
        record.completedBy = actor.name; record.completedById = actor.id; record.completedAt = now();
      } else {
        throw new HttpError(422, 'Hồ sơ đã được xử lý hoặc trạng thái chuyển tiếp không hợp lệ.');
      }
    }
  }
  if (scope === 'finance_inventory_settings') {
    if (actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được cấu hình kho hàng.');
    const editable = ['key', 'issueMethodMode', 'issueMethod', 'lotManagedDefault', 'barcodeManagedDefault', 'warehouseNames', 'categoryNames'];
    const serverOwned = ['id', 'createdAt', 'createdBy', 'createdById', 'updatedAt', 'updatedBy', 'updatedById'];
    const allowed = [...editable, ...serverOwned];
    if (Object.keys(value).some((field) => !allowed.includes(field))) throw new HttpError(422, 'Cấu hình kho có trường không hỗ trợ.');
    if (current && JSON.stringify(value.key) !== JSON.stringify(current.key)) throw new HttpError(422, 'Không thể thay đổi khóa cấu hình kho.');
    record = current ? { ...current } : { key: 'global' };
    for (const field of editable) if (value[field] !== undefined) record[field] = value[field];
    record.issueMethodMode = oneOf(record.issueMethodMode || 'Mỗi mặt hàng', 'Chế độ tính giá xuất', ['Mỗi mặt hàng', 'Dùng chung']);
    record.issueMethod = oneOf(record.issueMethod || 'FIFO', 'Phương pháp xuất kho chung', ['FIFO', 'LIFO', 'Bình quân']);
    record.lotManagedDefault = Boolean(record.lotManagedDefault);
    record.barcodeManagedDefault = Boolean(record.barcodeManagedDefault);
    const warehouseNames = Array.isArray(record.warehouseNames) ? record.warehouseNames : ['Kho chính'];
    record.warehouseNames = [...new Set(warehouseNames.map((name) => requiredText(name, 'Tên kho', 160)))];
    if (!record.warehouseNames.length || record.warehouseNames.length > 100) throw new HttpError(422, 'Cần từ 1 đến 100 kho hàng.');
    const categoryNames = Array.isArray(record.categoryNames) ? record.categoryNames : ['Hàng hóa'];
    record.categoryNames = [...new Set(categoryNames.map((name) => requiredText(name, 'Tên nhóm hàng', 160)))];
    if (!record.categoryNames.length || record.categoryNames.length > 300) throw new HttpError(422, 'Cần từ 1 đến 300 nhóm hàng.');
    if (!current) { record.createdAt = now(); record.createdBy = actor.name; record.createdById = actor.id; }
    record.updatedAt = now(); record.updatedBy = actor.name; record.updatedById = actor.id;
  }
  if (scope === 'finance_inventory') {
    const editableFields = ['key', 'sku', 'name', 'category', 'unit', 'minQty', 'maxQty', 'unitPrice', 'warehouse', 'storageLocation', 'categoryType', 'barcode', 'lotManaged', 'barcodeManaged', 'issueMethod'];
    const integerAmount = (input, field) => {
      const amount = typeof input === 'number' ? input : Number(String(input ?? '').trim());
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000_000) throw new HttpError(422, `${field} phải là số nguyên không âm hợp lệ.`);
      return amount;
    };
    if (current) {
      if (actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được sửa danh mục hàng hóa.');
      const protectedFields = ['stockQty', 'lots', 'stockByWarehouse', 'status', 'createdAt', 'createdBy', 'createdById'];
      if (protectedFields.some((field) => JSON.stringify(value[field]) !== JSON.stringify(current[field]))) {
        throw new HttpError(422, 'Số lượng tồn, lô hàng và lịch sử chỉ được thay đổi qua giao dịch kho.');
      }
      Object.assign(record, current);
      for (const field of editableFields) if (value[field] !== undefined) record[field] = value[field];
    } else {
      if (actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được tạo mặt hàng kho.');
      const unsupported = Object.keys(value).filter((field) => ![...editableFields, 'stockQty', 'lots'].includes(field));
      if (unsupported.length) throw new HttpError(422, 'Mặt hàng chứa trường không hỗ trợ.');
      record.key = requiredText(record.key, 'Khóa mặt hàng', 160);
      record.stockQty = 0;
      record.lots = [];
      record.stockByWarehouse = [];
      record.createdAt = now(); record.createdBy = actor.name; record.createdById = actor.id;
    }
    record.sku = requiredText(record.sku || record.itemCode, 'Mã SKU', 80).toLocaleUpperCase('vi-VN');
    record.name = requiredText(record.name, 'Tên hàng hóa', 255);
    record.category = optionalText(record.category || 'Chưa phân loại', 'Nhóm hàng hóa', 160);
    record.unit = requiredText(record.unit || 'Cái', 'Đơn vị tính', 80);
    record.minQty = integerAmount(record.minQty ?? 0, 'Tồn tối thiểu');
    record.maxQty = integerAmount(record.maxQty ?? 0, 'Tồn tối đa');
    if (record.maxQty > 0 && record.maxQty < record.minQty) throw new HttpError(422, 'Tồn tối đa phải bằng hoặc lớn hơn tồn tối thiểu.');
    record.unitPrice = optionalAmount(record.unitPrice, 'Đơn giá vốn');
    record.warehouse = requiredText(record.warehouse || 'Kho chính', 'Kho mặc định', 160);
    record.storageLocation = optionalText(record.storageLocation, 'Vị trí lưu trữ', 160);
    record.categoryType = optionalText(record.categoryType || 'Hàng hóa', 'Loại hàng hóa', 80);
    record.barcode = optionalText(record.barcode, 'Barcode / QR', 100).replace(/\s+/g, '').toLocaleUpperCase('vi-VN');
    const inventorySettingsRow = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'finance_inventory_settings' AND record_key = 'global' LIMIT 1").get();
    const inventorySettings = inventorySettingsRow ? parseJsonObject(inventorySettingsRow.payload_json) : {};
    record.lotManaged = Boolean(record.lotManaged ?? inventorySettings.lotManagedDefault);
    record.barcodeManaged = Boolean(record.barcodeManaged ?? inventorySettings.barcodeManagedDefault);
    if (record.barcodeManaged && !record.barcode) throw new HttpError(422, 'Mặt hàng bật quản lý Barcode/QR cần có mã quét.');
    record.issueMethod = oneOf(record.issueMethod || 'FIFO', 'Phương pháp xuất kho', ['FIFO', 'LIFO', 'Bình quân']);
    const duplicateSku = await db.prepare(`SELECT record_key FROM collection_records
      WHERE scope = 'finance_inventory' AND LOWER(json_extract(payload_json, '$.sku')) = LOWER(?) AND record_key <> ? LIMIT 1`).get(record.sku, record.key);
    if (duplicateSku) throw new HttpError(409, 'Mã SKU đã tồn tại.');
    if (record.barcode) {
      const duplicateBarcode = await db.prepare(`SELECT record_key FROM collection_records
        WHERE scope = 'finance_inventory' AND LOWER(json_extract(payload_json, '$.barcode')) = LOWER(?) AND record_key <> ? LIMIT 1`).get(record.barcode, record.key);
      if (duplicateBarcode) throw new HttpError(409, 'Barcode / QR đã thuộc mặt hàng khác.');
    }
    const lots = Array.isArray(record.lots) && (record.lots.length > 0 || Number(current?.stockQty || 0) <= 0)
      ? record.lots
      : Number(current?.stockQty || record.stockQty || 0) > 0 ? [{
        lotCode: current?.lotManaged ? 'LEGACY' : '', warehouse: String(current?.warehouse || record.warehouse || 'Kho chính'),
        quantity: Number(current?.stockQty ?? record.stockQty), expiryDate: '', receivedDate: String(current?.updatedAt || current?.createdAt || now()).slice(0, 10),
        unitCost: Number(current?.unitPrice ?? record.unitPrice) || 0,
      }] : [];
    record.stockQty = lots.reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0);
    record.stockByWarehouse = [...new Set(lots.map((lot) => String(lot.warehouse || '').trim()).filter(Boolean))]
      .map((warehouse) => ({ warehouse, quantity: lots.filter((lot) => lot.warehouse === warehouse).reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0) }));
    if (lots.length) {
      const costQuantity = lots.reduce((sum, lot) => sum + (Number(lot.quantity) || 0), 0);
      const totalCost = lots.reduce((sum, lot) => sum + (Number(lot.quantity) || 0) * (Number(lot.unitCost) || 0), 0);
      if (costQuantity > 0) record.unitPrice = Math.round(totalCost / costQuantity);
    }
    record.status = record.stockQty < record.minQty ? 'Sắp hết hàng' : record.maxQty > 0 && record.stockQty > record.maxQty ? 'Vượt mức tối đa' : 'Đủ tồn kho';
    if (current) { record.updatedAt = now(); record.updatedBy = actor.name; record.updatedById = actor.id; }
  }
  if (scope === 'asset_todos') {
    const categories = ['Cấp phát / Bàn giao', 'Thu hồi tài sản', 'Bảo dưỡng / Kiểm định', 'Sửa chữa & Thay thế', 'Kiểm kê đối soát', 'Thanh lý & Tiêu hủy', 'Đề xuất mua sắm'];
    const priorities = ['Khẩn cấp (P1)', 'Cao (P2)', 'Trung bình (P3)', 'Thấp (P4)', 'Thấp'];
    const taskStatuses = ['Chờ xử lý', 'Đang thực hiện', 'Chờ phê duyệt cấp trên', 'Đã hoàn thành'];
    const deriveSla = (deadline, at = now()) => {
      const dueDay = String(deadline).slice(0, 10);
      const currentDay = String(at).slice(0, 10);
      const dueTime = Date.parse(`${dueDay}T00:00:00Z`);
      const currentTime = Date.parse(`${currentDay}T00:00:00Z`);
      if (!Number.isFinite(dueTime) || !Number.isFinite(currentTime)) return 'Trong hạn SLA';
      if (dueTime < currentTime) return 'Trễ hạn SLA';
      return dueTime - currentTime <= 2 * 86_400_000 ? 'Sắp chạm hạn SLA' : 'Trong hạn SLA';
    };
    const normalizeChecklist = (entries, { forceIncomplete = false } = {}) => {
      if (!Array.isArray(entries) || entries.length < 1 || entries.length > 30) throw new HttpError(422, 'Checklist phải có từ 1 đến 30 mục.');
      const normalized = entries.map((entry) => ({
        item: requiredText(entry?.item, 'Nội dung checklist', 300),
        done: forceIncomplete ? false : entry?.done === true,
      }));
      if (new Set(normalized.map((entry) => entry.item.toLowerCase())).size !== normalized.length) throw new HttpError(422, 'Checklist không được có mục trùng lặp.');
      return normalized;
    };
    const estimatedHours = (input) => {
      const value = Number(input);
      if (!Number.isFinite(value) || value < 0.5 || value > 1000) throw new HttpError(422, 'Thời gian dự kiến phải từ 0,5 đến 1.000 giờ.');
      return value;
    };
    if (!current) {
      if (actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được tạo nhiệm vụ tài sản.');
      record.key = requiredText(record.key, 'Khóa nhiệm vụ', 160);
      record.taskCode = requiredText(record.taskCode, 'Mã nhiệm vụ', 80);
      const duplicateCode = await db.prepare(`SELECT record_key FROM collection_records
        WHERE scope = 'asset_todos' AND LOWER(json_extract(payload_json, '$.taskCode')) = LOWER(?) LIMIT 1`).get(record.taskCode);
      if (duplicateCode) throw new HttpError(409, 'Mã nhiệm vụ đã tồn tại.');
      record.taskTitle = requiredText(record.taskTitle, 'Tiêu đề nhiệm vụ', 300);
      record.taskCategory = oneOf(record.taskCategory, 'Nhóm nhiệm vụ', categories);
      record.priority = oneOf(record.priority, 'Mức ưu tiên', priorities);
      record.deadline = requiredIsoDate(record.deadline, 'Hạn hoàn thành');
      record.assignedStaffId = requiredText(record.assignedStaffId, 'Nhân viên phụ trách', 160);
      const assignedEmployee = await db.prepare(`SELECT u.id, u.name, u.employee_code, p.department, p.employment_status
        FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id
        WHERE u.id = ? AND u.role = 'USER' AND u.is_active = 1`).get(record.assignedStaffId);
      if (!assignedEmployee || assignedEmployee.employment_status === 'Đã nghỉ việc') throw new HttpError(422, 'Nhân viên phụ trách phải là tài khoản nhân viên đang hoạt động.');
      record.assignedStaff = assignedEmployee.name;
      record.assignedDepartment = assignedEmployee.department || '';
      record.requester = requiredText(record.requester, 'Người yêu cầu / bộ phận', 160);
      record.relatedAssetCode = optionalText(record.relatedAssetCode, 'Mã tài sản', 80);
      record.location = requiredText(record.location, 'Vị trí / phòng ban', 160);
      record.estimatedHours = estimatedHours(record.estimatedHours);
      record.actualHours = 0;
      record.notes = optionalText(record.notes, 'Ghi chú', 2_000);
      record.checklist = normalizeChecklist(record.checklist, { forceIncomplete: true });
      record.status = 'Chờ xử lý';
      record.slaStatus = deriveSla(record.deadline);
      record.resolutionResult = '';
      record.createdBy = actor.name; record.createdById = actor.id; record.createdAt = now();
      record.updatedBy = actor.name; record.updatedById = actor.id; record.updatedAt = record.createdAt;
      record.completedBy = ''; record.completedById = ''; record.completedAt = '';
    } else {
      const requestedStatus = record.status;
      const previous = current.status;
      Object.assign(record, current);
      const checklistChanged = value.checklist !== undefined && JSON.stringify(value.checklist) !== JSON.stringify(current.checklist);
      if (checklistChanged) {
        if (previous !== 'Đang thực hiện') throw new HttpError(422, 'Checklist chỉ sửa được khi nhiệm vụ đang thực hiện.');
        const updated = normalizeChecklist(value.checklist);
        if (updated.length !== current.checklist.length || updated.some((entry, index) => entry.item !== current.checklist[index]?.item)) {
          throw new HttpError(422, 'Không thể thay đổi cấu trúc checklist sau khi tạo nhiệm vụ.');
        }
        record.checklist = updated;
      } else if (requestedStatus !== previous) {
        const allowedNext = {
          'Chờ xử lý': ['Đang thực hiện'],
          'Đang thực hiện': ['Chờ phê duyệt cấp trên'],
          'Chờ phê duyệt cấp trên': ['Đã hoàn thành'],
        };
        if (!taskStatuses.includes(requestedStatus) || !allowedNext[previous]?.includes(requestedStatus)) {
          throw new HttpError(422, 'Chuyển trạng thái nhiệm vụ không hợp lệ.');
        }
        if (['Chờ phê duyệt cấp trên', 'Đã hoàn thành'].includes(requestedStatus)
          && (!record.checklist.length || record.checklist.some((entry) => !entry.done))) {
          throw new HttpError(422, 'Phải hoàn thành toàn bộ checklist trước khi gửi duyệt hoặc nghiệm thu.');
        }
        record.status = requestedStatus;
        if (requestedStatus === 'Đã hoàn thành') {
          const actual = Number(value.actualHours);
          if (!Number.isFinite(actual) || actual < 0.5 || actual > 1000) throw new HttpError(422, 'Thời gian thực tế phải từ 0,5 đến 1.000 giờ.');
          record.actualHours = actual;
          record.resolutionResult = requiredText(value.resolutionResult, 'Kết quả nghiệm thu', 2_000);
          record.completedBy = actor.name; record.completedById = actor.id; record.completedAt = now();
        }
      } else {
        throw new HttpError(422, 'Không có thay đổi hợp lệ cho nhiệm vụ.');
      }
      record.slaStatus = deriveSla(record.deadline, record.completedAt || now());
      record.updatedBy = actor.name; record.updatedById = actor.id; record.updatedAt = now();
    }
  }
  if (scope === 'asset_maintenances') {
    const frequencies = ['Hàng tháng', 'Hàng quý (3 tháng)', 'Định kỳ 6 tháng', 'Hàng năm'];
    const frequencyDays = { 'Hàng tháng': 30, 'Hàng quý (3 tháng)': 90, 'Định kỳ 6 tháng': 180, 'Hàng năm': 365 };
    const maintenanceTypes = ['Phòng ngừa định kỳ', 'Kiểm định an toàn PCCC & Điện', 'Nâng cấp bảo trì Firmware / Patch OS'];
    const slaLevels = ['SLA Platinum (4h)', 'SLA Gold (8h)', 'SLA Standard (24h)'];
    const checklistDefaults = [
      'Kiểm tra ngoại quan, ốc vít và các điểm tiếp xúc cáp',
      'Vệ sinh bụi bẩn khe thông gió và bộ làm mát',
      'Kiểm tra thông số điện áp, nhiệt độ và công suất tải',
      'Cập nhật bản ghi nhật ký vận hành kỹ thuật',
    ];
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const scheduleStatus = (date) => {
      const due = Date.parse(`${date}T00:00:00Z`);
      const current = Date.parse(`${today}T00:00:00Z`);
      if (due < current) return 'Quá hạn bảo dưỡng';
      if (due - current <= 7 * 86_400_000) return 'Sắp đến hạn';
      return 'Đã lên lịch';
    };
    const normalizeChecklist = (entries, { forceIncomplete = false } = {}) => {
      if (!Array.isArray(entries) || entries.length !== checklistDefaults.length) throw new HttpError(422, 'Checklist bảo dưỡng không hợp lệ.');
      const normalized = entries.map((entry, index) => ({
        item: requiredText(entry?.item, 'Nội dung checklist', 300),
        done: forceIncomplete ? false : entry?.done === true,
        note: optionalText(entry?.note, 'Ghi chú checklist', 1_000),
      }));
      if (normalized.some((entry, index) => entry.item !== checklistDefaults[index])) throw new HttpError(422, 'Không thể thay đổi cấu trúc checklist bảo dưỡng.');
      return normalized;
    };
    const parseDate = (value, field) => {
      if (!value) return '';
      return requiredIsoDate(value, field);
    };
    const addCycle = (date, frequency) => {
      const next = new Date(`${date}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + frequencyDays[frequency]);
      return next.toISOString().slice(0, 10);
    };
    if (!current) {
      record.key = requiredText(record.key, 'Khóa kế hoạch bảo dưỡng', 160);
      record.maintCode = requiredText(record.maintCode, 'Mã kế hoạch', 80);
      const duplicateCode = await db.prepare(`SELECT record_key FROM collection_records
        WHERE scope = 'asset_maintenances' AND LOWER(json_extract(payload_json, '$.maintCode')) = LOWER(?) LIMIT 1`).get(record.maintCode);
      if (duplicateCode) throw new HttpError(409, 'Mã kế hoạch bảo dưỡng đã tồn tại.');
      record.frequency = oneOf(record.frequency, 'Tần suất bảo dưỡng', frequencies);
      record.maintenanceType = oneOf(record.maintenanceType, 'Loại hình bảo dưỡng', maintenanceTypes);
      record.slaLevel = oneOf(record.slaLevel, 'Mức ưu tiên xử lý', slaLevels);
      record.estimatedBudget = optionalAmount(record.estimatedBudget, 'Dự toán kinh phí');
      record.lastDate = parseDate(record.lastDate, 'Ngày bảo dưỡng gần nhất');
      record.nextDate = requiredIsoDate(record.nextDate, 'Ngày bảo dưỡng tiếp theo');
      if (record.lastDate && record.lastDate > record.nextDate) throw new HttpError(422, 'Ngày bảo dưỡng tiếp theo phải bằng hoặc sau ngày gần nhất.');
      const assetKey = requiredText(record.assetKey, 'Tài sản', 160);
      const assetRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items' AND record_key = ? ORDER BY updated_at DESC LIMIT 1").get(assetKey);
      const asset = publicCollectionRecord(assetRow);
      if (!asset || !['Đang sử dụng', 'Trong kho'].includes(asset.status)) throw new HttpError(422, 'Chỉ tài sản đang sử dụng hoặc trong kho mới được lập lịch bảo dưỡng.');
      const duplicateAsset = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'asset_maintenances' AND json_extract(payload_json, '$.assetKey') = ? LIMIT 1").get(assetKey);
      if (duplicateAsset) throw new HttpError(409, 'Tài sản đã có kế hoạch bảo dưỡng định kỳ.');
      const employeeId = requiredText(record.responsibleEngineerId, 'Kỹ sư phụ trách', 160);
      const engineer = await db.prepare(`SELECT u.id, u.name, p.employment_status FROM users u
        LEFT JOIN employee_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.role = 'USER' AND u.is_active = 1`).get(employeeId);
      if (!engineer || engineer.employment_status === 'Đã nghỉ việc') throw new HttpError(422, 'Kỹ sư phụ trách phải là tài khoản nhân viên đang hoạt động.');
      record.assetKey = asset.key;
      record.assetCodes = requiredText(asset.code || asset.assetCode, 'Mã tài sản', 80);
      record.systemName = requiredText(asset.name || asset.assetName, 'Tên tài sản', 255);
      record.category = optionalText(asset.category, 'Nhóm tài sản', 120);
      record.location = optionalText(record.location || asset.location || asset.currentLocation || asset.department, 'Vị trí lắp đặt', 255);
      record.responsibleEngineerId = engineer.id;
      record.responsibleEngineer = engineer.name;
      record.vendorPartner = optionalText(record.vendorPartner, 'Đối tác kỹ thuật', 255);
      record.actualCost = 0;
      record.healthScore = 0;
      record.certificateCode = '';
      record.checklist = checklistDefaults.map((item) => ({ item, done: false, note: '' }));
      record.status = scheduleStatus(record.nextDate);
      record.notes = optionalText(record.notes, 'Ghi chú', 2_000);
      record.maintenanceHistory = [];
      record.lastCompletionStatus = '';
      record.startedBy = ''; record.startedById = ''; record.startedAt = '';
      record.createdBy = actor.name; record.createdById = actor.id; record.createdAt = now();
      record.updatedBy = actor.name; record.updatedById = actor.id; record.updatedAt = record.createdAt;
    } else {
      const requestedStatus = value.status;
      const fields = Object.keys(value).filter((field) => field !== 'key' && JSON.stringify(value[field]) !== JSON.stringify(current[field]));
      const isStart = fields.length === 1 && fields[0] === 'status' && requestedStatus === 'Đang tiến hành bảo dưỡng';
      const isChecklist = fields.length === 1 && fields[0] === 'checklist';
      const completionFields = new Set(['status', 'performedDate', 'actualCost', 'healthScore', 'checklist', 'notes', 'certificateCode']);
      const isCompletion = requestedStatus === 'Đã hoàn thành đúng lịch' && Object.hasOwn(value, 'performedDate')
        && Object.hasOwn(value, 'actualCost') && Object.hasOwn(value, 'healthScore') && Object.hasOwn(value, 'checklist')
        && fields.every((field) => completionFields.has(field));
      if (isStart) {
        if (!['Đã lên lịch', 'Sắp đến hạn', 'Quá hạn bảo dưỡng'].includes(current.status)) throw new HttpError(422, 'Kế hoạch không ở trạng thái có thể bắt đầu.');
        Object.assign(record, current, {
          status: 'Đang tiến hành bảo dưỡng', startedBy: actor.name, startedById: actor.id, startedAt: now(),
          checklist: current.lastCompletedAt ? checklistDefaults.map((item) => ({ item, done: false, note: '' })) : current.checklist,
        });
      } else if (isChecklist) {
        if (current.status !== 'Đang tiến hành bảo dưỡng') throw new HttpError(422, 'Checklist chỉ được sửa khi đang tiến hành bảo dưỡng.');
        const checklist = normalizeChecklist(value.checklist);
        Object.assign(record, current, { checklist });
      } else if (isCompletion) {
        if (current.status !== 'Đang tiến hành bảo dưỡng') throw new HttpError(422, 'Chỉ được nghiệm thu kế hoạch đang tiến hành.');
        const performedDate = requiredIsoDate(value.performedDate, 'Ngày thực hiện');
        if (performedDate > today) throw new HttpError(422, 'Ngày thực hiện không được ở tương lai.');
        if (current.lastDate && performedDate < current.lastDate) throw new HttpError(422, 'Ngày thực hiện không được trước lần bảo dưỡng gần nhất.');
        const checklist = normalizeChecklist(value.checklist);
        if (checklist.some((entry) => !entry.done)) throw new HttpError(422, 'Cần hoàn thành mọi mục checklist trước khi nghiệm thu.');
        const actualCost = optionalAmount(value.actualCost, 'Chi phí thực tế');
        const healthScore = Number(value.healthScore);
        if (!Number.isSafeInteger(healthScore) || healthScore < 0 || healthScore > 100) throw new HttpError(422, 'Điểm sức khỏe phải là số nguyên từ 0 đến 100.');
        const nextDate = addCycle(performedDate, current.frequency);
        const history = Array.isArray(current.maintenanceHistory) ? current.maintenanceHistory : [];
        Object.assign(record, current, {
          status: scheduleStatus(nextDate), lastDate: performedDate, nextDate,
          checklist: checklistDefaults.map((item) => ({ item, done: false, note: '' })),
          actualCost, healthScore, certificateCode: optionalText(value.certificateCode, 'Số chứng nhận', 160),
          notes: optionalText(value.notes, 'Ghi chú nghiệm thu', 2_000), lastCompletionStatus: performedDate <= current.nextDate ? 'Đúng hạn' : 'Trễ hạn',
          lastCompletedAt: now(), lastCompletedBy: actor.name, lastCompletedById: actor.id,
          maintenanceHistory: [...history, { date: performedDate, dueDate: current.nextDate, nextDate, completedOnTime: performedDate <= current.nextDate, actualCost, healthScore, checklist, notes: optionalText(value.notes, 'Ghi chú nghiệm thu', 2_000), certificateCode: optionalText(value.certificateCode, 'Số chứng nhận', 160), completedBy: actor.name, completedById: actor.id, completedAt: now() }],
        });
      } else {
        throw new HttpError(422, 'Chỉ được bắt đầu, cập nhật checklist hoặc nghiệm thu theo đúng quy trình.');
      }
      for (const field of ['maintCode', 'assetKey', 'assetCodes', 'systemName', 'category', 'location', 'frequency', 'maintenanceType', 'slaLevel', 'responsibleEngineer', 'responsibleEngineerId', 'vendorPartner', 'estimatedBudget', 'createdBy', 'createdById', 'createdAt']) {
        record[field] = current[field];
      }
      record.updatedBy = actor.name; record.updatedById = actor.id; record.updatedAt = now();
    }
  }
  if (scope === 'asset_systems') {
    const categories = ['Vị trí & Tủ Rack', 'Nhóm & Loại tài sản', 'Định mức cấp phát chức danh', 'Quy tắc sinh mã tự động', 'Mẫu văn bản & Quy trình', 'Nhà cung cấp'];
    const statuses = ['Đang áp dụng', 'Tạm ngưng'];
    if (!current) {
      record.key = requiredText(record.key, 'Khóa cấu hình', 160);
      record.code = requiredText(record.code, 'Mã cấu hình', 80);
      const duplicateCode = await db.prepare(`SELECT record_key FROM collection_records
        WHERE scope = 'asset_systems' AND LOWER(json_extract(payload_json, '$.code')) = LOWER(?) LIMIT 1`).get(record.code);
      if (duplicateCode) throw new HttpError(409, 'Mã cấu hình đã tồn tại.');
      record.name = requiredText(record.name, 'Tên cấu hình', 255);
      record.category = oneOf(record.category, 'Phân loại cấu hình', categories);
      record.details = requiredText(record.details, 'Nội dung quy định', 4_000);
      record.scope = requiredText(record.scope, 'Phạm vi áp dụng', 255);
      record.allocatedRole = requiredText(record.allocatedRole, 'Chức danh áp dụng', 255);
      record.standardPackage = optionalText(record.standardPackage, 'Gói tiêu chuẩn', 2_000);
      record.budgetLimit = optionalAmount(record.budgetLimit, 'Hạn mức kinh phí');
      const months = Number(record.depreciationMonthsDefault ?? 0);
      if (!Number.isSafeInteger(months) || months < 0 || months > 1_200) throw new HttpError(422, 'Thời gian khấu hao phải là số tháng nguyên từ 0 đến 1.200.');
      record.depreciationMonthsDefault = months;
      record.prefixPattern = optionalText(record.prefixPattern, 'Quy tắc sinh mã', 100);
      if (record.category === 'Quy tắc sinh mã tự động' && (record.prefixPattern.split('{YYYY}').length !== 2
        || record.prefixPattern.split('{####}').length !== 2
        || /[{}]/.test(record.prefixPattern.replace('{YYYY}', '').replace('{####}', '')))) {
        throw new HttpError(422, 'Quy tắc sinh mã cần có đúng một {YYYY} và một {####}.');
      }
      const responsiblePersonId = requiredText(record.responsiblePersonId, 'Người phụ trách', 160);
      const responsiblePerson = await db.prepare(`SELECT u.id, u.name, u.is_active, p.employment_status FROM users u
        LEFT JOIN employee_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.is_active = 1`).get(responsiblePersonId);
      if (!responsiblePerson || responsiblePerson.employment_status === 'Đã nghỉ việc') throw new HttpError(422, 'Người phụ trách phải là nhân viên đang hoạt động.');
      record.responsiblePersonId = responsiblePerson.id;
      record.responsiblePerson = responsiblePerson.name;
      record.notes = optionalText(record.notes, 'Ghi chú', 2_000);
      record.status = 'Đang áp dụng';
      record.createdBy = actor.name; record.createdById = actor.id; record.createdAt = now();
      record.updatedBy = actor.name; record.updatedById = actor.id; record.updatedAt = record.createdAt;
    } else {
      if (value.status === current.status || !statuses.includes(value.status)) throw new HttpError(422, 'Trạng thái cấu hình không thay đổi hoặc không hợp lệ.');
      Object.assign(record, current, { status: value.status, updatedBy: actor.name, updatedById: actor.id, updatedAt: now() });
    }
  }
  if (scope === 'business_travels') {
    record.key = current?.key || requiredText(record.key, 'Khóa chuyến công tác', 160);
    record.travelCode = current?.travelCode || requiredText(record.travelCode, 'Mã chuyến công tác', 80);
    const duplicateCode = await db.prepare(`SELECT record_key FROM collection_records
      WHERE scope = 'business_travels' AND LOWER(json_extract(payload_json, '$.travelCode')) = LOWER(?) AND record_key <> ? LIMIT 1`)
      .get(record.travelCode, record.key);
    if (duplicateCode) throw new HttpError(409, 'Mã chuyến công tác đã tồn tại.');
    record.tripType = current?.tripType || oneOf(record.tripType, 'Loại chuyến đi', ['Nội địa', 'Quốc tế']);
    record.destination = current?.destination || requiredText(record.destination, 'Địa điểm công tác', 500);
    record.purpose = current?.purpose || requiredText(record.purpose, 'Mục đích công tác', 4_000);
    record.startDate = current?.startDate || requiredIsoDate(record.startDate, 'Ngày bắt đầu công tác');
    record.endDate = current?.endDate || requiredIsoDate(record.endDate, 'Ngày kết thúc công tác');
    const startTimestamp = Date.parse(`${record.startDate}T00:00:00Z`);
    const endTimestamp = Date.parse(`${record.endDate}T00:00:00Z`);
    if (endTimestamp < startTimestamp) throw new HttpError(422, 'Ngày kết thúc phải từ ngày bắt đầu trở đi.');
    record.daysCount = Math.floor((endTimestamp - startTimestamp) / 86_400_000) + 1;
    record.budgetEstimated = optionalAmount(current?.budgetEstimated ?? record.budgetEstimated, 'Dự toán công tác');
    record.advanceAmount = optionalAmount(current?.advanceAmount ?? record.advanceAmount, 'Tạm ứng đề xuất');
    if (record.advanceAmount > record.budgetEstimated) throw new HttpError(422, 'Tạm ứng đề xuất không được vượt dự toán.');
    record.flightTicket = optionalText(current?.flightTicket ?? record.flightTicket, 'Thông tin phương tiện', 500);
    record.hotelName = optionalText(current?.hotelName ?? record.hotelName, 'Thông tin lưu trú', 500);

    if (!current) {
      record.employeeId = requiredText(record.employeeId, 'Nhân viên đi công tác', 160);
      if (actor.role !== 'ADMIN' && record.employeeId !== actor.id) throw new HttpError(403, 'Nhân viên chỉ được tạo đề xuất cho chính mình.');
      const employee = await db.prepare(`SELECT u.id, u.name, u.employee_code, p.department, p.position
        FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id
        WHERE u.id = ? AND u.is_active = 1 AND COALESCE(p.employment_status, 'Chính thức') <> 'Đã nghỉ việc'`).get(record.employeeId);
      if (!employee) throw new HttpError(422, 'Nhân viên không tồn tại, không hoạt động hoặc đã nghỉ việc.');
      record.employeeName = employee.name;
      record.empCode = employee.employee_code;
      record.department = employee.department || '';
      record.position = employee.position || '';
      record.requester = actor.name;
      record.requesterId = actor.id;
      record.requestedAt = now();
      record.status = 'Chờ lãnh đạo duyệt';
      record.approver = '';
      record.approvedBy = ''; record.approvedById = ''; record.approvedAt = '';
      record.rejectedAt = ''; record.rejectionReason = '';
      record.decisionBy = ''; record.decisionById = ''; record.decisionAt = '';
      record.actualExpense = 0;
      record.settlementStatus = 'Chưa quyết toán';
      record.invoiceReference = ''; record.invoiceFileId = ''; record.invoiceFileName = '';
      record.settlementNote = ''; record.settlementRecordedBy = ''; record.settlementRecordedAt = '';
      record.settlementRecordedById = '';
      record.settledBy = ''; record.settledAt = '';
      record.settledById = '';
    } else {
      record.employeeId = current.employeeId;
      record.employeeName = current.employeeName;
      record.empCode = current.empCode;
      record.department = current.department;
      record.position = current.position;
      record.requester = current.requester;
      record.requesterId = current.requesterId;
      record.requestedAt = current.requestedAt;
      record.approver = current.approver || '';
      record.approvedBy = current.approvedBy || ''; record.approvedById = current.approvedById || '';
      record.approvedAt = current.approvedAt || ''; record.rejectedAt = current.rejectedAt || '';
      record.rejectionReason = current.rejectionReason || '';
      const changingStatus = record.status !== current.status;
      if (changingStatus) {
        if (actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được duyệt hoặc từ chối đề xuất công tác.');
        if (current.status !== 'Chờ lãnh đạo duyệt') throw new HttpError(422, 'Chỉ đề xuất đang chờ duyệt mới được xử lý.');
        record.status = oneOf(record.status, 'Quyết định công tác', ['Đã duyệt công tác', 'Từ chối']);
        record.approver = actor.name;
        record.decisionBy = actor.name; record.decisionById = actor.id; record.decisionAt = now();
        if (record.status === 'Đã duyệt công tác') {
          record.approvedBy = actor.name; record.approvedById = actor.id; record.approvedAt = record.decisionAt;
          record.rejectionReason = ''; record.rejectedAt = '';
        } else {
          record.rejectionReason = requiredText(record.rejectionReason, 'Lý do từ chối', 1_000);
          record.rejectedAt = record.decisionAt;
          record.approvedBy = ''; record.approvedById = ''; record.approvedAt = '';
        }
      } else {
        const settlementFields = ['actualExpense', 'invoiceReference', 'invoiceFileId', 'invoiceFileName', 'settlementNote'];
        const settlementChanged = settlementFields.some((field) => JSON.stringify(record[field] ?? '') !== JSON.stringify(current[field] ?? ''));
        if (settlementChanged) {
          if (actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được ghi nhận quyết toán công tác.');
          if (current.status !== 'Đã duyệt công tác') throw new HttpError(422, 'Chỉ chuyến công tác đã duyệt mới được quyết toán.');
          if (current.settlementStatus === 'Đã quyết toán xong') throw new HttpError(422, 'Quyết toán đã hoàn tất và không thể sửa trực tiếp.');
          record.actualExpense = requiredAmount(record.actualExpense, 'Chi phí thực tế');
          record.invoiceReference = optionalText(record.invoiceReference, 'Mã tham chiếu chứng từ', 120);
          record.invoiceFileId = optionalText(record.invoiceFileId, 'Tệp chứng từ', 160);
          record.invoiceFileName = optionalText(record.invoiceFileName, 'Tên tệp chứng từ', 255);
          record.settlementNote = optionalText(record.settlementNote, 'Ghi chú quyết toán', 1_000);
          if (record.invoiceFileId) {
            const file = await db.prepare("SELECT id FROM file_nodes WHERE id = ? AND node_type = 'file' AND deleted_at IS NULL").get(record.invoiceFileId);
            if (!file) throw new HttpError(422, 'Không tìm thấy tệp chứng từ đã tải lên.');
          }
          record.settlementStatus = record.invoiceReference || record.invoiceFileId ? 'Đã quyết toán xong' : 'Chờ nộp hóa đơn đỏ';
          record.settlementRecordedBy = actor.name; record.settlementRecordedById = actor.id; record.settlementRecordedAt = now();
          record.settledBy = record.settlementStatus === 'Đã quyết toán xong' ? actor.name : '';
          record.settledById = record.settlementStatus === 'Đã quyết toán xong' ? actor.id : '';
          record.settledAt = record.settlementStatus === 'Đã quyết toán xong' ? record.settlementRecordedAt : '';
        } else {
          record.actualExpense = Number(current.actualExpense) || 0;
          record.settlementStatus = current.settlementStatus || 'Chưa quyết toán';
          record.invoiceReference = current.invoiceReference || ''; record.invoiceFileId = current.invoiceFileId || '';
          record.invoiceFileName = current.invoiceFileName || ''; record.settlementNote = current.settlementNote || '';
          record.settlementRecordedBy = current.settlementRecordedBy || ''; record.settlementRecordedById = current.settlementRecordedById || '';
          record.settlementRecordedAt = current.settlementRecordedAt || ''; record.settledBy = current.settledBy || '';
          record.settledById = current.settledById || ''; record.settledAt = current.settledAt || '';
        }
      }
    }
  }
  if (scope === 'workflow_requests' && current?.status === 'Yêu cầu bổ sung') {
    if (actor.id !== current.requesterId) throw new HttpError(403, 'Chỉ người gửi hồ sơ mới được nộp thông tin bổ sung.');
    const submission = record.resubmission;
    if (!submission || typeof submission !== 'object' || Array.isArray(submission)) {
      throw new HttpError(422, 'Hồ sơ đang chờ người gửi bổ sung thông tin.');
    }
    if (Object.keys(submission).some(field => !['summaryDetails', 'budgetAmount', 'response', 'formData', 'attachments'].includes(field))) {
      throw new HttpError(422, 'Thông tin bổ sung chứa trường không được phép.');
    }
    const summaryDetails = requiredText(submission.summaryDetails, 'Nội dung hồ sơ', 8_000);
    const response = requiredText(submission.response, 'Phản hồi yêu cầu bổ sung', 4_000);
    const budgetAmount = optionalAmount(submission.budgetAmount ?? current.budgetAmount, 'Dự toán kinh phí');
    const pdfOnly = (current.approvalFormFields || []).some(field => field.fieldName === 'attachments' && String(field.type).toLowerCase().includes('pdf'));
    const newAttachments = await normalizeWorkflowAttachments(submission.attachments ?? [], actor, { pdfOnly });
    const attachments = [...(Array.isArray(current.attachments) ? current.attachments : []), ...newAttachments];
    if (attachments.length > 20 || new Set(attachments.map(file => file.fileNodeId)).size !== attachments.length) {
      throw new HttpError(422, 'Tệp bổ sung bị trùng hoặc tổng số tệp vượt quá 20.');
    }
    const formData = normalizeWorkflowFormData(
      current.approvalFormFields || [],
      { ...(current.formData || {}), ...(submission.formData || {}) },
      attachments,
    );
    const timestamp = now();
    const eventPayload = {
      requestCode: current.code,
      workflowCode: current.workflowCode,
      txCode: `WF-TX-${randomUUID()}`,
      level: Number(current.currentLevel),
      approverId: actor.id,
      approver: actor.name,
      approverRole: actor.role,
      decision: 'Đã nộp bổ sung',
      timestamp,
      comments: response,
      previousHash: current.approvalHistory?.at(-1)?.sha256Hash || '',
    };
    const sha256Hash = createHash('sha256').update(JSON.stringify(eventPayload)).digest('hex');
    Object.assign(record, current, {
      summaryDetails,
      budgetAmount,
      formData,
      attachments,
      status: 'Chờ bạn ký duyệt',
      currentLevel: Number(current.currentLevel),
      roleRequirement: current.roleRequirement,
      updatedAt: timestamp,
      updatedBy: actor.id,
      resubmittedAt: timestamp,
      resubmittedBy: actor.id,
      resubmissionNote: response,
      lastDecision: 'Đã nộp bổ sung',
      slaDeadlineAt: new Date(Date.now() + Number(current.slaHoursTarget || 4) * 60 * 60 * 1000).toISOString(),
      slaHoursLeft: Number(current.slaHoursTarget || 4),
      approvalHistory: [
        ...(Array.isArray(current.approvalHistory) ? current.approvalHistory : []),
        {
          ...eventPayload,
          hashPayload: eventPayload,
          sha256Hash,
          certificateProvider: 'Không áp dụng',
          certificateSerial: '',
          validityStatus: 'Không áp dụng',
          attachmentCount: attachments.length,
          budgetAmount,
          workflowName: current.workflowName,
          category: current.category,
          actorType: 'requester',
        },
      ],
    });
    record.slaDeadline = record.slaDeadlineAt;
    delete record.resubmission;
    const recordKey = requiredText(current.key ?? current.code, 'Khóa hồ sơ', 160);
    const serialized = JSON.stringify(record);
    if (serialized.length > 128 * 1024) throw new HttpError(422, 'Bản ghi vượt quá dung lượng cho phép.');
    return { recordKey, record, serialized };
  }
  if (scope === 'hr_employee_history') {
    record.employeeId = requiredText(record.employeeId, 'Nhân viên', 160);
    const employee = await getUserById(record.employeeId);
    if (!employee) throw new HttpError(422, 'Nhân viên không tồn tại.');
    record.employeeName = employee.name; record.employeeCode = employee.employee_code;
    record.type = oneOf(record.type, 'Loại biến động', ['Chức vụ', 'Thuyên chuyển', 'Nghỉ việc', 'Khen thưởng', 'Kỷ luật sự cố']);
    record.eventDate = requiredIsoDate(record.eventDate, 'Ngày hiệu lực');
    record.newValue = requiredText(record.newValue, 'Nội dung mới', 4000);
    for (const field of ['oldValue', 'decisionNumber', 'signer', 'note']) record[field] = optionalText(record[field], 'Thông tin biến động', 4000);
    record.code = current?.code || requiredText(record.code, 'Mã lịch sử', 160);
    record.createdAt = current?.createdAt || now(); record.createdBy = current?.createdBy || actor.name;
    record.updatedAt = now(); record.updatedBy = actor.name;
  }
  if (scope === 'hr_onboarding_tasks') {
    record.employeeId = requiredText(record.employeeId, 'Nhân viên hội nhập', 160);
    const employee = await db.prepare('SELECT u.id, u.name, u.employee_code, p.department, p.position FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.is_active = 1').get(record.employeeId);
    if (!employee) throw new HttpError(422, 'Nhân viên không tồn tại hoặc đã ngừng hoạt động.');
    record.employeeName = employee.name; record.empCode = employee.employee_code;
    record.department = requiredText(record.department || employee.department, 'Phòng ban tiếp nhận', 160);
    record.position = requiredText(record.position || employee.position, 'Vị trí tiếp nhận', 160);
    record.startDate = requiredIsoDate(record.startDate, 'Ngày bắt đầu hội nhập');
    record.evaluationDate = requiredIsoDate(record.evaluationDate, 'Ngày đánh giá');
    if (record.evaluationDate < record.startDate) throw new HttpError(422, 'Ngày đánh giá phải sau ngày bắt đầu.');
    record.mentor = requiredText(record.mentor, 'Người hướng dẫn', 160);
    record.mentorPhone = optionalText(record.mentorPhone, 'Điện thoại người hướng dẫn', 40);
    record.supportNote = optionalText(record.supportNote, 'Ghi nhận hỗ trợ', 4000);
    record.reviewNotes = optionalText(record.reviewNotes, 'Ghi nhận nghiệm thu', 4000);
    const keys = ['equipment', 'orientation', 'training', 'trialTasks', 'probationReview'];
    const input = Array.isArray(record.checklist) ? record.checklist : [];
    if (input.length !== keys.length || new Set(input.map(item => item.key)).size !== keys.length || input.some(item => !keys.includes(item.key) || typeof item.completed !== 'boolean')) throw new HttpError(422, 'Cần đủ năm mục kiểm tra hội nhập.');
    record.checklist = keys.map(key => {
      const item = input.find(entry => entry.key === key);
      const previous = current?.checklist?.find(entry => entry.key === key);
      return { key, completed: item.completed, ...(item.completed ? { completedAt: previous?.completed ? previous.completedAt || now() : now(), completedBy: previous?.completed ? previous.completedBy || actor.name : actor.name } : {}) };
    });
    record.progress = record.checklist.filter(item => item.completed).length * 20;
    record.laptopProvided = record.checklist[0].completed;
    record.emailCreated = record.checklist[0].completed;
    record.currentStep = ['Cấp phát thiết bị & Tài khoản', 'Giới thiệu công ty & Văn hóa', 'Đào tạo nghiệp vụ', 'Thực hiện công việc thử việc', 'Đánh giá thử việc'][record.checklist.findIndex(item => !item.completed)] || 'Chờ nghiệm thu hội nhập';
    record.status = oneOf(record.status || 'Đang hội nhập', 'Trạng thái hội nhập', ['Đang hội nhập', 'Đã hoàn thành', 'Cần hỗ trợ']);
    if (record.status === 'Đã hoàn thành') {
      if (record.progress !== 100) throw new HttpError(422, 'Cần hoàn thành tất cả mục kiểm tra trước khi nghiệm thu.');
      record.reviewNotes = requiredText(record.reviewNotes, 'Ghi nhận nghiệm thu', 4000);
      record.completedAt = current?.completedAt || now(); record.completedBy = current?.completedBy || actor.name;
    } else { delete record.completedAt; delete record.completedBy; }
    record.contractSigned = Boolean(current?.contractSigned);
  }
  if (scope === 'attendance_explanations') {
    if (!current && actor.role !== 'USER') throw new HttpError(403, 'Giải trình chấm công phải do tài khoản nhân viên gửi.');
    if (current && current.status !== 'Chờ duyệt') throw new HttpError(409, 'Giải trình đã được xử lý và không thể sửa.');
    record.date = requiredIsoDate(record.date, 'Ngày giải trình');
    record.reason = requiredText(record.reason, 'Lý do giải trình', 4000);
    record.note = optionalText(record.note, 'Ghi chú', 4000) || '';
    record.employeeId = current?.employeeId || actor.id;
    record.employeeName = current?.employeeName || actor.name;
    if (!current) {
      if (record.status !== undefined && record.status !== 'Chờ duyệt') throw new HttpError(422, 'Giải trình mới phải chờ duyệt.');
      record.status = 'Chờ duyệt';
      delete record.reviewedBy;
      delete record.reviewedAt;
    } else if (actor.role === 'ADMIN') {
      record.status = oneOf(record.status, 'Trạng thái giải trình', ['Đã duyệt', 'Từ chối']);
      record.reviewedBy = actor.name;
      record.reviewedAt = now();
    } else {
      record.status = 'Chờ duyệt';
      delete record.reviewedBy;
      delete record.reviewedAt;
    }
    record.createdAt = current?.createdAt || now();
  }
  if (scope === 'finance_budgets') {
    record.code = requiredText(record.code, 'Mã ngân sách', 160);
    record.department = requiredText(record.department, 'Phòng ban', 160);
    record.fiscalYear = requiredText(record.fiscalYear, 'Kỳ áp dụng', 160);
    record.allocatedBudget = requiredAmount(record.allocatedBudget, 'Ngân sách');
    record.actualSpent = optionalAmount(record.actualSpent, 'Số tiền đã giải ngân');
    record.remainingBudget = record.allocatedBudget - record.actualSpent;
    record.utilizationRate = Math.round(record.actualSpent / record.allocatedBudget * 1000) / 10;
    record.status = record.utilizationRate > 100 ? 'Vượt ngân sách' : record.utilizationRate > 80 ? 'Cảnh báo hạn mức' : 'Trong hạn mức';
  }
  if (scope === 'workflow_requests') {
    const pending = 'Chờ bạn ký duyệt';
    record.code = requiredText(record.code, 'Mã hồ sơ', 160);
    record.workflowCode = requiredText(record.workflowCode, 'Mã quy trình', 80);
    record.workflowName = requiredText(record.workflowName, 'Tiêu đề hồ sơ', 240);
    record.category = oneOf(record.category, 'Phân loại', ['Mua sắm & Tài sản', 'Tài chính & Thanh toán', 'Hợp đồng & Pháp chế', 'Nhân sự & Phúc lợi', 'Văn phòng & Hành chính', 'Vận hành Kỹ thuật & IDC']);
    record.department = requiredText(record.department, 'Phòng ban', 160);
    record.summaryDetails = requiredText(record.summaryDetails, 'Nội dung hồ sơ', 8_000);
    record.budgetAmount = optionalAmount(record.budgetAmount, 'Dự toán kinh phí');
    record.priority = oneOf(record.priority, 'Mức độ ưu tiên', ['Khẩn cấp (P1)', 'Cao (P2)', 'Bình thường (P3)']);
    const blueprintRow = current ? null : await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'workflow_blueprints' AND LOWER(json_extract(payload_json, '$.workflowCode')) = LOWER(?) LIMIT 1").get(record.workflowCode);
    const blueprint = blueprintRow ? parseJsonObject(blueprintRow.payload_json) : null;
    if (blueprint && blueprint.status !== 'Đang áp dụng') throw new HttpError(422, 'Quy trình đã tạm ngưng hoặc chưa được kích hoạt.');
    if (blueprint) {
      record.category = blueprint.category;
      if (blueprint.applicableBudgetLimit > 0 && record.budgetAmount > blueprint.applicableBudgetLimit) throw new HttpError(422, 'Dự toán vượt hạn mức của quy trình.');
    }
    record.approvalFormFields = Array.isArray(current?.approvalFormFields)
      ? current.approvalFormFields
      : Array.isArray(blueprint?.formFields) ? blueprint.formFields : [];
    if (!current) {
      const pdfOnly = record.approvalFormFields.some(field => field.fieldName === 'attachments' && String(field.type).toLowerCase().includes('pdf'));
      record.attachments = await normalizeWorkflowAttachments(record.attachments || [], actor, { pdfOnly });
      record.formData = normalizeWorkflowFormData(record.approvalFormFields, record.formData || {}, record.attachments);
    } else {
      record.attachments = Array.isArray(current.attachments) ? current.attachments : [];
      record.formData = current.formData && typeof current.formData === 'object' ? current.formData : {};
    }
    let slaHours = record.priority === 'Khẩn cấp (P1)' ? 2 : record.priority === 'Cao (P2)' ? 4 : 8;
    const timestamp = now();
    const currentLevel = current ? Number(current.currentLevel) : 1;
    let budgetTier = null;
    if (!current) {
      const tiers = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'workflow_settings'").all();
      budgetTier = tiers.map(row => parseJsonObject(row.payload_json)).find(tier => tier.status === 'Kích hoạt' && record.budgetAmount >= Number(tier.minAmount) && record.budgetAmount <= Number(tier.maxAmount)) || null;
    }
    const configuredTierSteps = budgetTier
      ? Number(/^\s*(\d+)/.exec(String(budgetTier.requiredLevels || ''))?.[1]) || String(budgetTier.requiredLevels || '').split(/➔|→|->/).map(value => value.trim()).filter(Boolean).length
      : 0;
    const blueprintSteps = Number(blueprint?.approvalFlow?.length || 0);
    const totalLevels = current ? Number(current.totalLevels) : blueprint
      ? Math.max(blueprintSteps, configuredTierSteps)
      : Math.max(1, configuredTierSteps, Number(record.totalLevels || 1));
    if (!Number.isInteger(totalLevels) || totalLevels < 1 || totalLevels > 10 || !Number.isInteger(currentLevel) || currentLevel < 1 || currentLevel > totalLevels) {
      throw new HttpError(422, 'Số cấp phê duyệt không hợp lệ.');
    }
    record.totalLevels = totalLevels;
    record.currentLevel = currentLevel;
    const configuredStepNames = blueprint?.approvalFlow?.map(step => String(step.roleName || '').trim())
      || String(budgetTier?.requiredLevels || '').split(/➔|→|->/).map(value => value.replace(/^\s*\d+\s*Cấp:\s*/i, '').trim()).filter(Boolean);
    record.approvalSteps = Array.isArray(current?.approvalSteps) ? [...current.approvalSteps] : Array.from({ length: totalLevels }, (_, index) => configuredStepNames[index] || `Cấp ${index + 1}`);
    record.approvalAssignees = Array.isArray(current?.approvalAssignees)
      ? [...current.approvalAssignees]
      : Array.from({ length: totalLevels }, (_, index) => {
          const step = blueprint?.approvalFlow?.[index];
          return step?.approverId ? { userId: step.approverId, name: step.defaultApprover } : null;
        });
    record.approvalSlaHours = Array.isArray(current?.approvalSlaHours)
      ? [...current.approvalSlaHours]
      : Array.from({ length: totalLevels }, (_, index) => Math.min(
          slaHours,
          Number(budgetTier?.slaHours || slaHours),
          Number(blueprint?.approvalFlow?.[index]?.slaHours || slaHours),
        ));
    record.approvalCanRejectLevels = Array.isArray(current?.approvalCanRejectLevels)
      ? [...current.approvalCanRejectLevels]
      : Array.from({ length: totalLevels }, (_, index) => blueprint?.approvalFlow?.[index]?.canReject !== false);
    record.approvalPKILevels = Array.isArray(current?.approvalPKILevels)
      ? [...current.approvalPKILevels]
      : Array.from({ length: totalLevels }, (_, index) => Boolean(budgetTier?.requirePKI || blueprint?.approvalFlow?.[index]?.requireTokenPKI));
    record.requester = current?.requester || actor.name;
    record.requesterId = current?.requesterId || actor.id;
    record.submittedAt = current?.submittedAt || timestamp;
    record.createdAt = current?.createdAt || timestamp;
    record.createdBy = current?.createdBy || actor.id;
    record.updatedAt = timestamp;
    record.updatedBy = actor.id;
    record.approvalHistory = Array.isArray(current?.approvalHistory) ? [...current.approvalHistory] : [];
    record.roleRequirement = record.approvalSteps[currentLevel - 1] || `Cấp ${currentLevel}`;
    record.currentApproverId = record.approvalAssignees[currentLevel - 1]?.userId || '';
    record.currentApprover = record.approvalAssignees[currentLevel - 1]?.name || '';
      record.tokenRequired = Boolean(record.approvalPKILevels[currentLevel - 1]);
      record.slaHoursTarget = current?.slaHoursTarget || Number(record.approvalSlaHours[currentLevel - 1] || slaHours);
    delete record.digitalSignatureInfo;

    if (!current) {
      const duplicate = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'workflow_requests' AND LOWER(json_extract(payload_json, '$.code')) = LOWER(?) LIMIT 1").get(record.code);
      if (duplicate) throw new HttpError(409, 'Mã hồ sơ đã tồn tại.');
      record.status = pending;
      record.slaDeadlineAt = new Date(Date.now() + Number(record.slaHoursTarget || slaHours) * 60 * 60 * 1000).toISOString();
      record.slaDeadline = record.slaDeadlineAt;
      record.slaHoursLeft = Number(record.slaHoursTarget || slaHours);
      record.approvalHistory = [];
      delete record.approvalNotes;
      delete record.decision;
    } else {
      if (current.status !== pending) throw new HttpError(422, 'Hồ sơ đã kết thúc hoặc đang chờ người gửi bổ sung.');
      if (!workflowDecisionAccess(actor, current, await workflowDelegationRows()).allowed) {
        throw new HttpError(403, 'Chỉ người được giao phê duyệt hoặc người được ủy quyền đang hiệu lực mới được xử lý hồ sơ.');
      }
      const decision = oneOf(record.decision, 'Quyết định', ['Đã phê duyệt', 'Từ chối', 'Yêu cầu bổ sung']);
      if (decision !== 'Đã phê duyệt' && current.approvalCanRejectLevels?.[currentLevel - 1] === false) {
        throw new HttpError(422, 'Cấp phê duyệt này chỉ được phê duyệt, không được từ chối hoặc yêu cầu bổ sung.');
      }
      if (decision === 'Đã phê duyệt' && current.tokenRequired) throw new HttpError(409, 'Tầng ngân sách này bắt buộc ký CA; nhà cung cấp ký số chưa được tích hợp.');
      const comments = optionalText(record.approvalNote, 'Ý kiến xử lý', 4_000);
      if (decision !== 'Đã phê duyệt' && !comments) throw new HttpError(422, 'Cần ghi lý do khi từ chối hoặc yêu cầu bổ sung.');
      const eventPayload = {
        requestCode: record.code,
        workflowCode: record.workflowCode,
        txCode: `WF-TX-${randomUUID()}`,
        level: currentLevel,
        approverId: actor.id,
        approver: actor.name,
        approverRole: actor.role,
        decision,
        timestamp,
        comments,
        previousHash: record.approvalHistory.at(-1)?.sha256Hash || '',
      };
      const sha256Hash = createHash('sha256').update(JSON.stringify(eventPayload)).digest('hex');
      record.approvalHistory.push({
        ...eventPayload,
        hashPayload: eventPayload,
        sha256Hash,
        certificateProvider: 'Chữ ký nội bộ',
        certificateSerial: '',
        validityStatus: 'Chưa kiểm tra',
        attachmentCount: record.attachments.length,
        budgetAmount: record.budgetAmount,
        workflowName: record.workflowName,
        category: record.category,
      });
      record.lastDecision = decision;
      record.approvalNotes = comments;
      if (decision === 'Đã phê duyệt') {
        record.currentLevel = currentLevel >= totalLevels ? totalLevels : currentLevel + 1;
        record.roleRequirement = record.approvalSteps[record.currentLevel - 1] || `Cấp ${record.currentLevel}`;
        record.currentApproverId = record.approvalAssignees[record.currentLevel - 1]?.userId || '';
        record.currentApprover = record.approvalAssignees[record.currentLevel - 1]?.name || '';
        record.tokenRequired = Boolean(record.approvalPKILevels[record.currentLevel - 1]);
        record.slaHoursTarget = Number(record.approvalSlaHours[record.currentLevel - 1] || slaHours);
        record.status = currentLevel >= totalLevels ? 'Đã phê duyệt' : pending;
        if (record.status === pending) {
          record.slaDeadlineAt = new Date(Date.now() + Number(record.slaHoursTarget || slaHours) * 60 * 60 * 1000).toISOString();
          record.slaDeadline = record.slaDeadlineAt;
          record.slaHoursLeft = Number(record.slaHoursTarget || slaHours);
        } else record.slaHoursLeft = 0;
      } else {
        record.status = decision === 'Từ chối' ? 'Đã từ chối' : 'Yêu cầu bổ sung';
        record.slaHoursLeft = 0;
      }
      delete record.decision;
      delete record.approvalNote;
    }
  }
  if (scope === 'workflow_blueprints') {
    record.workflowCode = requiredText(record.workflowCode, 'Mã quy trình', 80).toUpperCase();
    record.workflowName = requiredText(record.workflowName, 'Tên quy trình', 240);
    record.category = oneOf(record.category, 'Phân loại', ['Mua sắm & Tài sản', 'Tài chính & Thanh toán', 'Hợp đồng & Pháp chế', 'Nhân sự & Phúc lợi', 'Văn phòng & Hành chính', 'Vận hành Kỹ thuật & IDC']);
    record.description = optionalText(record.description, 'Mô tả', 4_000);
    record.scope = requiredText(record.scope, 'Phạm vi áp dụng', 160);
    const totalSteps = Number(record.totalSteps);
    if (!Number.isInteger(totalSteps) || totalSteps < 1 || totalSteps > 10) throw new HttpError(422, 'Số cấp phê duyệt phải từ 1 đến 10.');
    record.totalSteps = totalSteps;
    record.slaTargetHours = requiredAmount(record.slaTargetHours, 'SLA mục tiêu');
    record.applicableBudgetLimit = optionalAmount(record.applicableBudgetLimit, 'Hạn mức áp dụng');
    record.status = oneOf(record.status || 'Bản nháp', 'Trạng thái quy trình', ['Đang áp dụng', 'Bản nháp', 'Tạm ngưng']);
    if (!Array.isArray(record.approvalFlow) || record.approvalFlow.length !== totalSteps) throw new HttpError(422, 'Sơ đồ phê duyệt phải có đủ số cấp đã khai báo.');
    record.approvalFlow = await Promise.all(record.approvalFlow.map(async (step, index) => {
      if (!step || typeof step !== 'object' || Array.isArray(step)) throw new HttpError(422, 'Cấu hình cấp phê duyệt không hợp lệ.');
      const approverId = optionalText(step.approverId, 'Người phê duyệt', 160);
      const approver = approverId ? await getUserById(approverId) : null;
      if (approverId && !approver?.is_active) throw new HttpError(422, `Người phê duyệt cấp ${index + 1} không tồn tại hoặc đã ngừng hoạt động.`);
      return {
        level: index + 1,
        roleName: requiredText(step.roleName, 'Vai trò phê duyệt', 160),
        defaultApprover: approver?.name || requiredText(step.defaultApprover, 'Người nhận mặc định', 160),
        ...(approver ? { approverId: approver.id } : {}),
        slaHours: requiredAmount(step.slaHours, 'SLA cấp phê duyệt'),
        canReject: step.canReject !== false,
        requireTokenPKI: Boolean(step.requireTokenPKI),
      };
    }));
    if (!Array.isArray(record.formFields) || record.formFields.length > 40) throw new HttpError(422, 'Danh sách trường biểu mẫu không hợp lệ.');
    const fieldNames = new Set();
    const reservedFieldNames = new Set(['key', 'code', 'workflowcode', 'workflowname', 'category', 'department', 'priority', 'budgetamount', 'summarydetails', 'supplementalresponse', 'constructor', 'prototype', 'tostring', 'hasownproperty']);
    record.formFields = record.formFields.map((field) => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) throw new HttpError(422, 'Trường biểu mẫu không hợp lệ.');
      const fieldName = requiredText(field.fieldName, 'Mã trường biểu mẫu', 80);
      const normalizedName = fieldName.toLowerCase();
      if (!/^[a-z][a-zA-Z0-9_]{0,79}$/.test(fieldName) || fieldNames.has(normalizedName) || (reservedFieldNames.has(normalizedName) && !['title', 'content', 'attachments'].includes(fieldName))) {
        throw new HttpError(422, 'Mã trường biểu mẫu không hợp lệ, bị trùng hoặc dành riêng cho hệ thống.');
      }
      fieldNames.add(normalizedName);
      return {
        fieldName,
        label: requiredText(field.label, 'Tên trường biểu mẫu', 160),
        type: requiredText(field.type, 'Kiểu trường biểu mẫu', 80),
        required: Boolean(field.required),
      };
    });
    record.version = requiredText(record.version || current?.version || 'v1.0', 'Phiên bản', 32);
    record.createdAt = current?.createdAt || now();
    record.createdBy = current?.createdBy || actor.name;
    record.updatedAt = now();
    record.updatedBy = actor.name;
    const requests = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'workflow_requests'").all();
    const linked = requests.map(row => parseJsonObject(row.payload_json)).filter(item => item.workflowCode === record.workflowCode);
    const completed = linked.filter(item => ['Đã phê duyệt', 'Đã ký số phê duyệt'].includes(item.status)).length;
    const closed = completed + linked.filter(item => item.status === 'Đã từ chối').length;
    record.activeInstancesCount = linked.filter(item => ['Chờ bạn ký duyệt', 'Yêu cầu bổ sung'].includes(item.status)).length;
    record.totalCompletedCount = completed;
    record.passRate = closed ? Math.round(completed / closed * 10_000) / 100 : 0;
    const duplicate = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'workflow_blueprints' AND LOWER(json_extract(payload_json, '$.workflowCode')) = LOWER(?) AND record_key <> ? LIMIT 1").get(record.workflowCode, current?.key || record.workflowCode);
    if (duplicate) throw new HttpError(409, 'Mã quy trình đã tồn tại.');
  }
  if (scope === 'workflow_settings') {
    record.tierName = requiredText(record.tierName, 'Tên phân cấp', 160);
    record.minAmount = optionalAmount(record.minAmount, 'Số tiền tối thiểu');
    record.maxAmount = requiredAmount(record.maxAmount, 'Số tiền tối đa');
    if (record.minAmount >= record.maxAmount) throw new HttpError(422, 'Mức tối đa phải lớn hơn mức tối thiểu.');
    record.requiredLevels = requiredText(record.requiredLevels, 'Luồng phê duyệt', 500);
    record.slaHours = requiredAmount(record.slaHours, 'SLA');
    record.autoEscalateHours = requiredAmount(record.autoEscalateHours, 'Thời gian leo thang');
    if (record.slaHours > 72 || record.autoEscalateHours > 72) throw new HttpError(422, 'SLA và thời gian leo thang không được vượt quá 72 giờ.');
    record.requirePKI = Boolean(record.requirePKI);
    record.status = oneOf(record.status || 'Kích hoạt', 'Trạng thái tầng hạn mức', ['Kích hoạt', 'Tạm dừng']);
    record.createdAt = current?.createdAt || now();
    record.createdBy = current?.createdBy || actor.name;
    record.updatedAt = now();
    record.updatedBy = actor.name;
    if (record.status === 'Kích hoạt') {
      const rows = await db.prepare("SELECT record_key, payload_json FROM collection_records WHERE scope = 'workflow_settings'").all();
      for (const row of rows) {
        if (row.record_key === current?.key) continue;
        const tier = parseJsonObject(row.payload_json);
        if (tier.status === 'Kích hoạt' && record.minAmount <= Number(tier.maxAmount) && record.maxAmount >= Number(tier.minAmount)) {
          throw new HttpError(409, 'Khoảng ngân sách bị trùng với một tầng đang kích hoạt.');
        }
      }
    }
  }
  if (scope === 'workflow_delegations') {
    record.delegatorId = requiredText(record.delegatorId, 'Người ủy quyền', 160);
    record.delegateeId = requiredText(record.delegateeId, 'Người nhận ủy quyền', 160);
    if (record.delegatorId === record.delegateeId) throw new HttpError(422, 'Người ủy quyền và người nhận phải khác nhau.');
    const [delegator, delegatee] = await Promise.all([getUserById(record.delegatorId), getUserById(record.delegateeId)]);
    if (!delegator?.is_active || !delegatee?.is_active) throw new HttpError(422, 'Cả hai tài khoản phải đang hoạt động.');
    const delegatorProfile = await employeeProfileRowByUserId(delegator.id);
    const delegateeProfile = await employeeProfileRowByUserId(delegatee.id);
    record.delegator = delegator.name;
    record.delegatorRole = delegatorProfile?.position || delegator.role;
    record.delegatee = delegatee.name;
    record.delegateeRole = delegateeProfile?.position || delegatee.role;
    record.fromDate = requiredIsoDate(record.fromDate, 'Ngày bắt đầu ủy quyền');
    record.toDate = requiredIsoDate(record.toDate, 'Ngày kết thúc ủy quyền');
    if (record.toDate < record.fromDate) throw new HttpError(422, 'Ngày kết thúc phải từ ngày bắt đầu trở đi.');
    record.scope = requiredText(record.scope, 'Phạm vi ủy quyền', 500);
    record.maxBudgetAmount = optionalAmount(record.maxBudgetAmount, 'Hạn mức được ủy quyền');
    record.reason = requiredText(record.reason, 'Lý do ủy quyền', 2_000);
    record.notifySlack = Boolean(record.notifySlack);
    if (record.notifySlack) throw new HttpError(409, 'Thông báo Slack chưa được tích hợp.');
    const today = new Date().toISOString().slice(0, 10);
    record.status = today < record.fromDate ? 'Sắp tới' : today <= record.toDate ? 'Đang hiệu lực' : 'Đã hết hạn';
    record.createdAt = current?.createdAt || now();
    record.createdBy = current?.createdBy || actor.name;
    record.updatedAt = now();
    record.updatedBy = actor.name;
  }
  if (scope === 'workflow_security_settings') {
    const recordKey = 'security';
    const storedRow = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'workflow_security_settings' AND record_key = ?").get(recordKey);
    const stored = storedRow ? parseJsonObject(storedRow.payload_json) : {};
    const suppliedWebhook = optionalText(record.slackWebhook, 'Webhook Slack', 2_000);
    if (suppliedWebhook && (!/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]+$/.test(suppliedWebhook))) {
      throw new HttpError(422, 'Webhook Slack không hợp lệ.');
    }
    record.key = recordKey;
    record.caProvider = oneOf(record.caProvider || 'not_configured', 'Nhà cung cấp CA', ['not_configured', 'viettel_ca', 'vnpt_ca', 'fpt_ca']);
    record.encryptionStandard = oneOf(record.encryptionStandard || 'rsa_2048', 'Chuẩn mã hóa', ['rsa_2048', 'rsa_4096', 'ecdsa_p256']);
    record.sessionTimeout = requiredAmount(record.sessionTimeout, 'Thời gian khóa phiên');
    if (record.sessionTimeout < 5 || record.sessionTimeout > 60) throw new HttpError(422, 'Thời gian khóa phiên phải từ 5 đến 60 phút.');
    record.autoEscalate = oneOf(record.autoEscalate || 'no', 'Tự động leo thang', ['yes', 'no']);
    record.requireOtpForLargeBudget = oneOf(record.requireOtpForLargeBudget || 'no', 'Yêu cầu OTP', ['yes', 'no']);
    record.dailyDigestTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(record.dailyDigestTime || '')) ? record.dailyDigestTime : '08:00';
    record.slackWebhookEncrypted = suppliedWebhook ? encryptSetting(suppliedWebhook) : stored.slackWebhookEncrypted || '';
    record.slackWebhookConfigured = Boolean(record.slackWebhookEncrypted);
    delete record.slackWebhook;
    record.createdAt = stored.createdAt || now();
    record.createdBy = stored.createdBy || actor.name;
    record.updatedAt = now();
    record.updatedBy = actor.name;
  }
  const candidate = record.key ?? record.id ?? record.code;
  const recordKey = candidate === undefined || candidate === null || String(candidate).trim() === ''
    ? randomUUID()
    : String(candidate).trim();
  if (recordKey.length > 160 || /[\u0000-\u001f]/.test(recordKey)) {
    throw new HttpError(422, 'Khóa bản ghi không hợp lệ.');
  }
  if (record.key === undefined) record.key = recordKey;
  if (scope === 'hr_performance_reviews') {
    const pending = 'Chờ phê duyệt điểm', completed = 'Đã hoàn tất đánh giá';
    record.status = oneOf(record.status || pending, 'Trạng thái đánh giá', [pending, completed]);
    if (!current && record.status !== pending) throw new HttpError(422, 'Phiếu mới phải chờ phê duyệt điểm.');
    if (current?.status === completed) throw new HttpError(422, 'Phiếu đã hoàn tất không thể sửa hoặc phê duyệt lại.');
    record.employeeId = requiredText(record.employeeId, 'Nhân viên được đánh giá', 160);
    record.evaluatorId = requiredText(record.evaluatorId, 'Người đánh giá', 160);
    const employee = await employeeProfileRowByUserId(record.employeeId);
    const evaluator = await getUserById(record.evaluatorId);
    if (!employee || !evaluator) throw new HttpError(422, 'Nhân viên hoặc người đánh giá không tồn tại.');
    record.employeeName = employee.name; record.empCode = employee.employee_code; record.evaluator = evaluator.name;
    record.department = requiredText(record.department || employee.department, 'Phòng ban tại kỳ đánh giá', 160);
    record.position = optionalText(record.position || employee.position, 'Chức danh tại kỳ đánh giá', 160);
    record.code = requiredText(record.code, 'Mã phiếu đánh giá', 160);
    record.period = requiredText(record.period, 'Kỳ đánh giá', 160);
    record.managerComment = optionalText(record.managerComment, 'Nhận xét quản lý', 4000);
    const score = (value, maximum, label, optional = false) => {
      if (value === '' || value === null || value === undefined) { if (optional) return null; throw new HttpError(422, `${label} là bắt buộc.`); }
      const number = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
      if (!Number.isFinite(number) || number < 0 || number > maximum || Math.abs(number * 100 - Math.round(number * 100)) > 0.00001) throw new HttpError(422, `${label} phải từ 0 đến ${maximum}, tối đa hai chữ số thập phân.`);
      return number;
    };
    record.selfScore = score(record.selfScore, 100, 'Điểm tự chấm', true);
    const pillars = ['productivityScore', 'disciplineScore', 'innovationScore'];
    pillars.forEach((key, index) => { record[key] = score(record[key], index === 0 ? 60 : 20, 'Điểm trụ cột', true); });
    const measured = pillars.filter(key => record[key] !== null).length;
    if (measured !== 0 && measured !== 3) throw new HttpError(422, 'Nhập đủ ba trụ cột hoặc để trống cả ba để nhập điểm tổng hợp.');
    record.managerScore = measured === 3 ? Math.round(pillars.reduce((sum, key) => sum + record[key], 0) * 100) / 100 : score(record.managerScore, 100, 'Điểm quản lý');
    record.grade = record.managerScore >= 95 ? 'A+ (Xuất sắc)' : record.managerScore >= 85 ? 'A (Tốt)' : record.managerScore >= 70 ? 'B (Đạt)' : 'C (Cần cải thiện)';
    record.kpiBonus = optionalAmount(record.kpiBonus, 'Thưởng KPI đề xuất');
    const reviews = await db.prepare("SELECT record_key, payload_json FROM collection_records WHERE scope = 'hr_performance_reviews'").all();
    for (const row of reviews) {
      if (row.record_key === recordKey) continue;
      const item = parseJsonObject(row.payload_json);
      if (String(item.code || '').toLowerCase() === record.code.toLowerCase()) throw new HttpError(409, 'Mã phiếu đánh giá đã tồn tại.');
      if ((item.employeeId === record.employeeId || item.empCode === record.empCode) && String(item.period || '').trim().toLowerCase() === record.period.toLowerCase()) throw new HttpError(409, 'Nhân viên đã có phiếu trong kỳ đánh giá này.');
    }
    record.createdAt = current?.createdAt || now(); record.createdBy = current?.createdBy || actor.name;
    record.updatedAt = now(); record.updatedBy = actor.name;
    for (const key of ['approvedBy', 'approvedById', 'approvedAt']) delete record[key];
    if (current && record.status === completed) { record.approvedBy = actor.name; record.approvedById = actor.id; record.approvedAt = now(); }
    record.payrollTransferred = false;
    record.history = Array.isArray(current?.history) ? [...current.history] : [];
    record.history.push({ status: record.status, at: now(), actorId: actor.id, actor: actor.name });
  }
  if (['enterprise_documents', 'doc_archives'].includes(scope)) {
    const archived = scope === 'doc_archives';
    if (archived) {
      record.dispatchType = oneOf(record.dispatchType, 'Chiều văn bản', ['Văn bản đến', 'Văn bản đi']);
      record.docType = oneOf(record.docType, 'Loại văn bản', ['Công văn', 'Quyết định', 'Thông báo', 'Tờ trình', 'Hợp đồng', 'Giấy mời']);
      record.subject = requiredText(record.subject, 'Trích yếu', 4000);
      record.partner = requiredText(record.partner, 'Cơ quan gửi / nhận', 200);
      record.docDate = requiredIsoDate(record.docDate, 'Ngày văn bản');
      record.dateReceivedOrIssued = requiredIsoDate(record.dateReceivedOrIssued, 'Ngày vào sổ');
      record.slaDeadline = record.slaDeadline ? requiredIsoDate(record.slaDeadline, 'Hạn xử lý') : '';
      if (record.slaDeadline && record.slaDeadline < record.dateReceivedOrIssued) throw new HttpError(422, 'Hạn xử lý phải từ ngày vào sổ.');
      record.securityLevel = oneOf(record.securityLevel || 'Thường', 'Độ mật', ['Tuyệt mật', 'Mật', 'Nội bộ', 'Thường']);
      record.urgency = oneOf(record.urgency || 'Bình thường', 'Độ khẩn', ['Hỏa tốc', 'Thượng khẩn', 'Bình thường']);
      for (const field of ['originalCode', 'signer', 'signerPosition', 'receiverOrAuthor', 'forwardNote']) record[field] = optionalText(record[field], 'Thông tin văn bản', 4000);
      if (record.pageCount !== undefined && record.pageCount !== '' && record.pageCount !== null) record.pageCount = requiredAmount(record.pageCount, 'Số trang');
      else delete record.pageCount;
      const terminal = record.dispatchType === 'Văn bản đến' ? 'Đã giải quyết xong' : 'Đã chuyển phát bưu điện';
      record.status = oneOf(record.status || 'Đang xử lý đúng hạn', 'Trạng thái văn bản', ['Đang xử lý đúng hạn', 'Cảnh báo quá hạn', terminal]);
      if (!current && record.status !== 'Đang xử lý đúng hạn') throw new HttpError(422, 'Văn bản mới phải bắt đầu ở trạng thái đang xử lý.');
      if (current && current.dispatchType !== record.dispatchType) throw new HttpError(422, 'Không thể chuyển văn bản sang sổ khác.');
      if (current?.status === terminal && record.status !== terminal) throw new HttpError(422, 'Văn bản đã hoàn tất không thể mở lại.');
      const rows = await db.prepare("SELECT record_key, payload_json FROM collection_records WHERE scope = 'doc_archives'").all();
      const sameBook = rows.filter(row => { const item = parseJsonObject(row.payload_json); return item.dispatchType === record.dispatchType && String(item.dateReceivedOrIssued || '').slice(0, 4) === record.dateReceivedOrIssued.slice(0, 4); });
      if (!String(record.bookNumber || '').trim()) {
        const next = 1 + sameBook.reduce((max, row) => Math.max(max, Number.parseInt(parseJsonObject(row.payload_json).bookNumber, 10) || 0), 0);
        record.bookNumber = `${String(next).padStart(4, '0')}/${record.dateReceivedOrIssued.slice(0, 4)}`;
      }
      record.bookNumber = requiredText(record.bookNumber, 'Số vào sổ', 160);
      if (sameBook.some(row => row.record_key !== recordKey && String(parseJsonObject(row.payload_json).bookNumber || '').toLowerCase() === record.bookNumber.toLowerCase())) throw new HttpError(409, 'Số vào sổ đã tồn tại trong năm và chiều văn bản này.');
      record.digitalVerified = false;
    } else {
      record.docCode = requiredText(record.docCode, 'Số / ký hiệu văn bản', 160);
      record.title = requiredText(record.title, 'Trích yếu', 4000);
      record.docCategory = oneOf(record.docCategory, 'Phân loại', ['Quy chế & Quyết định', 'Công văn điều hành', 'Thông báo nội bộ', 'Hợp đồng & Pháp lý', 'Biên bản & Kỹ thuật']);
      record.direction = oneOf(record.direction, 'Chiều văn bản', ['Nội bộ ban hành', 'Văn bản đến', 'Văn bản đi']);
      record.securityLevel = oneOf(record.securityLevel, 'Độ mật', ['Tuyệt mật (BOD Only)', 'Mật (Confidential)', 'Nội bộ công ty', 'Công khai']);
      record.status = oneOf(record.status || 'Dự thảo thẩm định', 'Trạng thái văn bản', ['Đang hiệu lực', 'Mới ban hành', 'Dự thảo thẩm định', 'Hết hiệu lực / Lưu kho']);
      record.issuingAuthority = requiredText(record.issuingAuthority, 'Đơn vị ban hành', 200);
      for (const field of ['signerName', 'signerPosition', 'storageLocation', 'summary']) record[field] = optionalText(record[field], 'Thông tin văn bản', 4000);
      record.issuedDate = requiredIsoDate(record.issuedDate, 'Ngày ban hành');
      record.effectiveDate = requiredIsoDate(record.effectiveDate, 'Ngày có hiệu lực');
      if (record.effectiveDate < record.issuedDate) throw new HttpError(422, 'Ngày hiệu lực phải từ ngày ban hành.');
      record.expirationDate = record.expirationDate && record.expirationDate !== 'Vĩnh viễn' ? requiredIsoDate(record.expirationDate, 'Ngày hết hiệu lực') : 'Vĩnh viễn';
      if (record.expirationDate !== 'Vĩnh viễn' && record.expirationDate < record.effectiveDate) throw new HttpError(422, 'Ngày hết hiệu lực phải từ ngày hiệu lực.');
      record.tags = Array.isArray(record.tags) ? [...new Set(record.tags.map(tag => requiredText(tag, 'Từ khóa', 100)))].slice(0, 40) : [];
      const rows = await db.prepare("SELECT record_key, payload_json FROM collection_records WHERE scope = 'enterprise_documents'").all();
      if (rows.some(row => row.record_key !== recordKey && String(parseJsonObject(row.payload_json).docCode || '').toLowerCase() === record.docCode.toLowerCase())) throw new HttpError(409, 'Số / ký hiệu văn bản đã tồn tại.');
      record.caSigned = false;
      delete record.caVerifiedAt;
    }
    for (const field of ['fileNodeId', ...(!archived ? ['wordFileNodeId'] : [])]) {
      record[field] = optionalText(record[field], 'Tệp đính kèm', 160);
      const prefix = field === 'wordFileNodeId' ? 'word' : '';
      if (record[field]) {
        const node = requireFileAccess(actor, await fileNodeById(record[field]));
        if (node.node_type !== 'file' || !node.storage_key) throw new HttpError(422, 'Nội dung tệp đính kèm chưa được lưu.');
        if (prefix && !/\.docx$/i.test(node.name)) throw new HttpError(422, 'Bản soạn thảo phải là tệp DOCX.');
        let bytes;
        try { bytes = await readFile(fileStoragePath(node.storage_key)); } catch { throw new HttpError(422, 'Không đọc được nội dung tệp đính kèm.'); }
        const size = bytes.length;
        const displaySize = size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
        if (prefix) { record.wordFileName = node.name; record.wordFileSizeBytes = size; record.wordSha256Hash = createHash('sha256').update(bytes).digest('hex'); }
        else {
          record[archived ? 'fileScan' : 'fileName'] = node.name; record.fileSizeBytes = size; record.fileSize = displaySize;
          record.sha256Hash = createHash('sha256').update(bytes).digest('hex');
          if (!archived) record.fileFormat = path.extname(node.name).slice(1).toUpperCase();
        }
      } else if (prefix) { record.wordFileName = ''; record.wordFileSizeBytes = 0; record.wordSha256Hash = ''; }
      else { record[archived ? 'fileScan' : 'fileName'] = ''; record.fileSizeBytes = 0; record.fileSize = ''; record.sha256Hash = ''; if (!archived) record.fileFormat = ''; }
    }
    record.createdAt = current?.createdAt || now(); record.createdBy = current?.createdBy || actor.name;
    record.updatedAt = now(); record.updatedBy = actor.name;
    record.history = Array.isArray(current?.history) ? [...current.history] : [];
    if (!current || current.status !== record.status || current.receiverOrAuthor !== record.receiverOrAuthor || current.fileNodeId !== record.fileNodeId || current.wordFileNodeId !== record.wordFileNodeId) record.history.push({ status: record.status, receiverOrAuthor: record.receiverOrAuthor || '', at: now(), actorId: actor.id, actor: actor.name });
  }
  if (scope === 'hr_rewards') {
    const pending = 'Chờ duyệt', approved = 'Đã ký quyết định', waiting = 'Chờ trao thưởng trong lễ vinh danh';
    const awarded = ['Đã trao giải', 'Đã trao thưởng'];
    record.status = oneOf(record.status || pending, 'Trạng thái khen thưởng', [pending, approved, waiting, ...awarded]);
    if (!current && record.status !== pending) throw new HttpError(422, 'Khen thưởng mới phải chờ duyệt.');
    if (current && current.status !== pending) {
      if (record.status === current.status || ![approved, waiting].includes(current.status) || record.status !== 'Đã trao giải') throw new HttpError(422, 'Quyết định đã duyệt chỉ có thể ghi nhận trao thưởng một lần.');
      const allowed = new Set(['status', 'key', 'id', 'awardedBy', 'awardedById', 'awardedAt']);
      if (Object.keys(record).some(key => !allowed.has(key) && JSON.stringify(record[key]) !== JSON.stringify(current[key]))) throw new HttpError(422, 'Không thể sửa nội dung quyết định đã duyệt.');
    }
    if (current?.status === pending && ![pending, approved].includes(record.status)) throw new HttpError(422, 'Cần duyệt quyết định trước khi trao thưởng.');
    record.employeeId = requiredText(record.employeeId, 'Người nhận / đại diện', 160);
    const employee = await getUserById(record.employeeId);
    if (!employee) throw new HttpError(422, 'Người nhận không tồn tại.');
    record.employeeName = current && current.status !== pending ? current.employeeName : employee.name;
    record.empCode = current && current.status !== pending ? current.empCode : employee.employee_code;
    for (const field of ['rewardCode', 'title', 'department', 'decisionNo']) record[field] = requiredText(record[field], 'Thông tin khen thưởng', 200);
    record.rewardType = oneOf(record.rewardType, 'Hình thức khen thưởng', ['Tiền mặt & Cúp pha lê', 'Chuyến du lịch nghỉ dưỡng 5 sao', 'Cổ phần thưởng ESOP', 'Bằng khen Ban Giám Đốc']);
    record.achievementSummary = optionalText(record.achievementSummary, 'Thành tích', 4000);
    record.rewardValue = optionalAmount(record.rewardValue, 'Giá trị khen thưởng');
    record.date = requiredIsoDate(record.date, 'Ngày quyết định');
    const rows = await db.prepare("SELECT record_key, payload_json FROM collection_records WHERE scope = 'hr_rewards'").all();
    if (rows.some(row => row.record_key !== recordKey && String(parseJsonObject(row.payload_json).rewardCode || '').toLowerCase() === record.rewardCode.toLowerCase())) throw new HttpError(409, 'Mã khen thưởng đã tồn tại.');
    for (const field of ['approvedBy', 'approvedById', 'approvedAt', 'awardedBy', 'awardedById', 'awardedAt']) { if (current?.[field]) record[field] = current[field]; else delete record[field]; }
    if (current?.status === pending && record.status === approved) { record.approvedBy = actor.name; record.approvedById = actor.id; record.approvedAt = now(); record.signer = actor.name; }
    else record.signer = current?.signer || '';
    if (current && [approved, waiting].includes(current.status) && record.status === 'Đã trao giải') { record.awardedBy = actor.name; record.awardedById = actor.id; record.awardedAt = now(); }
    record.createdAt = current?.createdAt || now(); record.updatedAt = now();
  }
  if (scope === 'hr_job_openings') {
    record.jobCode = requiredText(record.jobCode, 'Mã tuyển dụng', 160);
    record.title = requiredText(record.title, 'Vị trí tuyển dụng', 200);
    record.department = requiredText(record.department, 'Phòng ban', 160);
    record.headcountNeeded = requiredAmount(record.headcountNeeded, 'Số lượng tuyển');
    record.deadline = requiredIsoDate(record.deadline, 'Hạn tuyển dụng');
    record.status = oneOf(record.status || 'Đang tuyển dụng', 'Trạng thái tuyển dụng', ['Đang tuyển dụng', 'Tạm dừng', 'Đã đóng', 'Đã đóng (Đủ định biên)', 'Đã đủ chỉ tiêu']);
    record.createdAt = current?.createdAt || record.createdAt || now();
    const jobs = await db.prepare("SELECT record_key, payload_json FROM collection_records WHERE scope = 'hr_job_openings'").all();
    if (jobs.some(row => row.record_key !== recordKey && String(parseJsonObject(row.payload_json).jobCode || '').toLowerCase() === record.jobCode.toLowerCase())) throw new HttpError(409, 'Mã tuyển dụng đã tồn tại.');
  }
  if (scope === 'hr_recruitment_candidates') {
    record.jobKey = requiredText(record.jobKey, 'Vị trí tuyển dụng', 160);
    const jobRow = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'hr_job_openings' AND record_key = ?").get(record.jobKey);
    if (!jobRow) throw new HttpError(422, 'Vị trí tuyển dụng không tồn tại.');
    if (!current && parseJsonObject(jobRow.payload_json).status !== 'Đang tuyển dụng') throw new HttpError(422, 'Vị trí hiện không tiếp nhận ứng viên.');
    if (current && current.jobKey !== record.jobKey) throw new HttpError(422, 'Không thể chuyển hồ sơ sang vị trí khác.');
    record.name = requiredText(record.name, 'Tên ứng viên', 160);
    record.email = normalizeEmail(record.email);
    record.phone = optionalText(record.phone, 'Điện thoại', 40);
    record.appliedAt = requiredIsoDate(record.appliedAt, 'Ngày ứng tuyển');
    record.status = oneOf(record.status || 'applied', 'Giai đoạn ứng viên', ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected']);
    const transitions = { applied: ['screening', 'rejected'], screening: ['interview', 'rejected'], interview: ['offer', 'rejected'], offer: ['hired', 'rejected'], hired: [], rejected: [] };
    if (!current && record.status !== 'applied') throw new HttpError(422, 'Ứng viên mới phải bắt đầu ở giai đoạn tiếp nhận.');
    if (current && current.status !== record.status && !transitions[current.status]?.includes(record.status)) throw new HttpError(422, 'Không thể chuyển sang giai đoạn ứng viên này.');
    const candidates = await db.prepare("SELECT record_key, payload_json FROM collection_records WHERE scope = 'hr_recruitment_candidates'").all();
    if (candidates.some(row => { const item = parseJsonObject(row.payload_json); return row.record_key !== recordKey && item.jobKey === record.jobKey && String(item.email || '').toLowerCase() === record.email; })) throw new HttpError(409, 'Email ứng viên đã tồn tại trong vị trí tuyển dụng này.');
    if (record.interviewAt) {
      const date = String(record.interviewAt);
      requiredIsoDate(date.slice(0, 10), 'Ngày phỏng vấn');
      if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(date)) throw new HttpError(422, 'Thời gian phỏng vấn không hợp lệ.');
      if (date.slice(0, 10) < record.appliedAt) throw new HttpError(422, 'Ngày phỏng vấn không được trước ngày ứng tuyển.');
    }
    for (const field of ['offerDate', 'hiredDate']) {
      if (record[field]) { record[field] = requiredIsoDate(record[field], 'Ngày tuyển dụng'); if (record[field] < record.appliedAt) throw new HttpError(422, 'Ngày tuyển dụng không được trước ngày ứng tuyển.'); }
    }
    if (record.status === 'interview' && !record.interviewAt) throw new HttpError(422, 'Vui lòng nhập lịch phỏng vấn.');
    if (record.status === 'interview' && !String(record.interviewer || '').trim()) throw new HttpError(422, 'Vui lòng nhập người phỏng vấn.');
    if (record.status === 'offer' && !record.offerDate) throw new HttpError(422, 'Vui lòng nhập ngày gửi đề nghị.');
    if (record.status === 'hired' && !record.hiredDate) throw new HttpError(422, 'Vui lòng nhập ngày nhận việc.');
    if (record.status === 'hired' && !record.offerDate) throw new HttpError(422, 'Vui lòng nhập ngày đề nghị.');
    if (record.offerDate && record.interviewAt && record.offerDate < record.interviewAt.slice(0, 10)) throw new HttpError(422, 'Ngày đề nghị không được trước ngày phỏng vấn.');
    if (record.hiredDate && record.offerDate && record.hiredDate < record.offerDate) throw new HttpError(422, 'Ngày nhận việc không được trước ngày đề nghị.');
    record.history = Array.isArray(current?.history) ? [...current.history] : [];
    if (!current || current.status !== record.status) record.history.push({ status: record.status, at: now(), actorId: actor.id, actor: actor.name });
    if (record.cvFileId) {
      const file = await db.prepare("SELECT id FROM file_nodes WHERE id = ? AND node_type = 'file' AND deleted_at IS NULL").get(record.cvFileId);
      if (!file) throw new HttpError(422, 'Tệp CV không tồn tại.');
    }
  }
  if (['leave_requests', 'attendance_overtime', 'attendance_shift_assignments', 'attendance_leave_summary', 'attendance_leave_plans', 'attendance_timesheet_summary', 'attendance_alerts'].includes(scope)) {
    let employeeId = actor.role === 'ADMIN' ? optionalText(record.employeeId, 'Nhân viên', 160) : actor.id;
    if (!employeeId && (record.empCode || record.employeeCode)) employeeId = (await db.prepare('SELECT id FROM users WHERE employee_code = ?').get(record.empCode || record.employeeCode))?.id;
    if (!employeeId && record.employeeName) {
      const employees = await db.prepare('SELECT id FROM users WHERE name = ?').all(record.employeeName);
      if (employees.length === 1) employeeId = employees[0].id;
    }
    if (!employeeId) throw new HttpError(422, 'Vui lòng liên kết nhân viên có trong hệ thống.');
    const employee = await db.prepare('SELECT u.id, u.name, u.employee_code, p.department FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.is_active = 1').get(employeeId);
    if (!employee) throw new HttpError(422, 'Nhân viên không tồn tại hoặc đã ngừng hoạt động.');
    record.employeeId = employee.id;
    record.employeeName = employee.name;
    record.empCode = employee.employee_code;
    record.department = employee.department || '';
    if (['leave_requests', 'attendance_overtime', 'attendance_shift_assignments'].includes(scope)) record.code = requiredText(record.code, 'Mã đơn', 160);
  }
  if (scope === 'attendance_leave_plans') {
    record.fromDate = requiredIsoDate(record.fromDate, 'Ngày bắt đầu'); record.toDate = requiredIsoDate(record.toDate, 'Ngày kết thúc');
    const span = (Date.parse(record.toDate) - Date.parse(record.fromDate)) / 86400000 + 1;
    record.totalDays = Number(record.totalDays);
    if (span <= 0 || !Number.isFinite(record.totalDays) || record.totalDays <= 0 || record.totalDays > span || !Number.isInteger(record.totalDays * 2)) throw new HttpError(422, 'Số ngày nghỉ theo kế hoạch không hợp lệ.');
    record.status = oneOf(record.status || 'Chờ phê duyệt', 'Trạng thái kế hoạch nghỉ', ['Chờ phê duyệt', 'Đã duyệt kế hoạch', 'Từ chối']);
    if ((!current && record.status !== 'Chờ phê duyệt') || (current && current.status !== 'Chờ phê duyệt')) throw new HttpError(422, 'Kế hoạch đã xử lý hoặc chưa được tạo để phê duyệt.');
    if (current && record.status !== current.status) { record.approver = actor.name; record.approvedAt = now(); }
  }
  if (scope === 'attendance_timesheet_summary') {
    record.month = requiredText(record.month, 'Kỳ công', 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(record.month)) throw new HttpError(422, 'Kỳ công phải theo YYYY-MM.');
    const [year, month] = record.month.split('-').map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (const field of ['standardDays', 'actualDays', 'paidLeaveDays', 'unpaidLeaveDays', 'otHoursWeekday', 'otHoursWeekend']) {
      record[field] = Number(record[field] ?? 0);
      if (!Number.isFinite(record[field]) || record[field] < 0 || record[field] > (field.startsWith('otHours') ? days * 24 : days)) throw new HttpError(422, 'Số ngày hoặc giờ công không hợp lệ.');
    }
    if (!record.standardDays || record.actualDays + record.paidLeaveDays + record.unpaidLeaveDays > days) throw new HttpError(422, 'Tổng ngày công/nghỉ không hợp lệ trong tháng.');
    if (current?.status === 'Đã khóa công') throw new HttpError(422, 'Bảng công đã khóa không thể thay đổi.');
    record.employeeCode = record.empCode;
    record.totalPayDays = record.actualDays + record.paidLeaveDays;
    record.attendanceRate = Math.round(record.totalPayDays / record.standardDays * 100);
    record.status = oneOf(record.status || 'Chờ đối soát', 'Trạng thái bảng công', ['Chờ đối soát', 'Đã khóa công']);
    if (!current && record.status !== 'Chờ đối soát') throw new HttpError(422, 'Cần lập bảng công trước khi khóa.');
    if (record.status === 'Đã khóa công') { record.lockedBy = actor.name; record.lockedAt = now(); }
  }
  if (scope === 'attendance_alerts') {
    record.alertCode = requiredText(record.alertCode, 'Mã cảnh báo', 160);
    record.alertDate = requiredIsoDate(record.alertDate, 'Ngày cảnh báo');
    record.alertType = requiredText(record.alertType, 'Loại cảnh báo', 160);
    record.details = requiredText(record.details, 'Chi tiết cảnh báo', 4000);
    record.penaltyAmount = optionalAmount(record.penaltyAmount, 'Số tiền đề xuất');
    record.status = oneOf(record.status || 'Chờ nhân viên giải trình', 'Trạng thái cảnh báo', ['Chờ nhân viên giải trình', 'Đã giải trình hợp lệ', 'Đã trừ phạt chuyên cần']);
    if (record.status !== 'Chờ nhân viên giải trình') {
      record.explanationText = requiredText(record.explanationText, 'Nội dung giải trình', 4000);
      record.reviewedBy = actor.name; record.reviewedAt = now();
    }
  }
  if (scope === 'attendance_raw_data') {
    record.status = oneOf(record.status || 'Cần kiểm tra', 'Trạng thái dữ liệu chấm công', ['Dữ liệu hợp lệ', 'Bản ghi trùng lặp', 'Bản ghi trùng lặp (Đã lọc)', 'Cần kiểm tra']);
    if (current && ['Bản ghi trùng lặp', 'Bản ghi trùng lặp (Đã lọc)'].includes(current.status) && record.status === 'Dữ liệu hợp lệ') {
      throw new HttpError(422, 'Bản ghi trùng lặp không thể được xác nhận hợp lệ để tính công.');
    }
  }
  if (scope === 'attendance_shifts') {
    record.shiftCode = requiredText(record.shiftCode, 'Mã ca', 160);
    record.shiftName = requiredText(record.shiftName, 'Tên ca', 160);
    record.startTime = requiredText(record.startTime, 'Giờ bắt đầu', 5);
    record.endTime = requiredText(record.endTime, 'Giờ kết thúc', 5);
    const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!clock.test(record.startTime) || !clock.test(record.endTime) || record.startTime === record.endTime) throw new HttpError(422, 'Giờ ca làm việc không hợp lệ.');
    const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const hours = ((minutes(record.endTime) - minutes(record.startTime) + 1440) % 1440) / 60;
    for (const field of ['workingHours', 'workUnits', 'allowGraceMinutes', 'nightAllowancePct']) {
      record[field] = Number(record[field] ?? 0);
      if (!Number.isFinite(record[field]) || record[field] < 0) throw new HttpError(422, `${field} không hợp lệ.`);
    }
    if (!record.workingHours || record.workingHours > hours || record.workUnits > 2 || record.allowGraceMinutes > 1440 || record.nightAllowancePct > 100) throw new HttpError(422, 'Thông số giờ làm, ngày công hoặc phụ cấp không hợp lệ.');
    record.status = oneOf(record.status || 'Đang áp dụng', 'Trạng thái ca', ['Đang áp dụng', 'Tạm ngưng']);
    record.timeRange = `${record.startTime} - ${record.endTime}`;
    if (record.breakTime && record.breakTime !== '0') {
      const pause = /^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)/.exec(String(record.breakTime));
      if (!pause) throw new HttpError(422, 'Thời gian nghỉ giữa ca không hợp lệ.');
      const pauseStart = Number(pause[1]) * 60 + Number(pause[2]);
      const pauseEnd = Number(pause[3]) * 60 + Number(pause[4]);
      const pauseLength = (pauseEnd - pauseStart + 1440) % 1440;
      if (!pauseLength || (pauseStart - minutes(record.startTime) + 1440) % 1440 + pauseLength > hours * 60 || record.workingHours > hours - pauseLength / 60 + 0.001) throw new HttpError(422, 'Giờ làm và giờ nghỉ phải nằm trong ca.');
    }
  }
  if (scope === 'attendance_shift_assignments') {
    record.effectiveFrom = requiredIsoDate(record.effectiveFrom, 'Ngày áp dụng');
    record.effectiveTo = requiredIsoDate(record.effectiveTo, 'Ngày kết thúc');
    if (record.effectiveFrom > record.effectiveTo) throw new HttpError(422, 'Ngày kết thúc phải sau ngày bắt đầu.');
    record.shiftKey = requiredText(record.shiftKey, 'Ca làm việc', 160);
    const shiftRow = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'attendance_shifts' AND record_key = ?").get(record.shiftKey);
    const shift = parseJsonObject(shiftRow?.payload_json);
    if (!shiftRow || shift.status !== 'Đang áp dụng') throw new HttpError(422, 'Ca làm việc không tồn tại hoặc đã ngừng áp dụng.');
    record.shiftName = shift.shiftName; record.shiftCode = shift.shiftCode; record.workHours = shift.timeRange;
    record.status = oneOf(record.status || 'Đang áp dụng', 'Trạng thái phân ca', ['Đang áp dụng', 'Chờ duyệt đổi ca', 'Đã kết thúc']);
    if (record.status === 'Chờ duyệt đổi ca') {
      record.swapTargetKey = requiredText(record.swapTargetKey, 'Phân ca đối ứng', 160);
      record.swapReason = requiredText(record.swapReason, 'Lý do đổi ca', 2000);
      if (record.swapTargetKey === recordKey) throw new HttpError(422, 'Không thể đổi cùng một phân ca.');
    }
  }
  if (scope === 'attendance_leave_summary') {
    record.year = Number(record.year || new Date().getFullYear());
    if (!Number.isInteger(record.year) || record.year < 2000 || record.year > 2200) throw new HttpError(422, 'Năm phép không hợp lệ.');
    for (const field of ['standardQuota', 'seniorityQuota', 'carriedOver', 'usedLeaves']) {
      record[field] = Number(record[field] ?? 0);
      if (!Number.isFinite(record[field]) || record[field] < 0) throw new HttpError(422, 'Số ngày phép không hợp lệ.');
    }
    record.totalEntitled = record.standardQuota + record.seniorityQuota + record.carriedOver;
    record.remainingLeaves = record.totalEntitled - record.usedLeaves;
    record.leaveUsagePct = record.totalEntitled ? Math.round(record.usedLeaves / record.totalEntitled * 1000) / 10 : 0;
    record.status = record.remainingLeaves <= 0 ? 'Đã hết phép' : record.remainingLeaves <= 3 ? 'Sắp hết phép' : 'Còn nhiều phép';
    const summaries = await db.prepare("SELECT record_key, payload_json FROM collection_records WHERE scope = 'attendance_leave_summary'").all();
    if (summaries.some(row => { const item = parseJsonObject(row.payload_json); return row.record_key !== recordKey && item.employeeId === record.employeeId && Number(item.year) === record.year; })) throw new HttpError(409, 'Nhân viên đã có số dư phép cho năm này.');
  }
  if (scope === 'leave_requests') {
    record.startDate = requiredIsoDate(record.startDate, 'Ngày bắt đầu');
    record.endDate = requiredIsoDate(record.endDate, 'Ngày kết thúc');
    const span = (Date.parse(record.endDate) - Date.parse(record.startDate)) / 86400000 + 1;
    record.daysCount = Number(record.daysCount);
    if (span <= 0 || !Number.isFinite(record.daysCount) || record.daysCount <= 0 || record.daysCount > span || !Number.isInteger(record.daysCount * 2)) throw new HttpError(422, 'Số ngày nghỉ phải theo nửa ngày và nằm trong khoảng ngày đăng ký.');
    record.reason = requiredText(record.reason, 'Lý do nghỉ', 4000);
    record.leaveType = requiredText(record.leaveType, 'Loại nghỉ', 160);
    record.status = oneOf(record.status || 'Chờ duyệt', 'Trạng thái đơn nghỉ', ['Chờ duyệt', 'Đã duyệt', 'Từ chối']);
  }
  if (scope === 'attendance_overtime') {
    record.otDate = requiredIsoDate(record.otDate, 'Ngày làm thêm');
    const match = /^([01]\d|2[0-3]):([0-5]\d)\s*-\s*([01]\d|2[0-3]):([0-5]\d)$/.exec(String(record.timeRange || ''));
    if (!match) throw new HttpError(422, 'Khung giờ làm thêm không hợp lệ.');
    const start = Number(match[1]) * 60 + Number(match[2]);
    const end = Number(match[3]) * 60 + Number(match[4]);
    const hours = ((end - start + 1440) % 1440) / 60;
    if (!hours || Math.abs(Number(record.totalHours) - hours) > 0.01) throw new HttpError(422, 'Số giờ làm thêm phải khớp khung giờ đăng ký.');
    record.totalHours = hours;
    record.reason = requiredText(record.reason, 'Lý do làm thêm', 4000);
    if (actor.role !== 'ADMIN') { record.multiplier = current?.multiplier ?? 1; record.baseHourlyRate = current?.baseHourlyRate ?? 0; }
    record.multiplier = Number(record.multiplier ?? 1);
    record.baseHourlyRate = Number(record.baseHourlyRate ?? 0);
    if (!Number.isFinite(record.multiplier) || record.multiplier <= 0 || record.multiplier > 10 || !Number.isFinite(record.baseHourlyRate) || record.baseHourlyRate < 0) throw new HttpError(422, 'Hệ số hoặc đơn giá làm thêm không hợp lệ.');
    record.totalAmount = Math.round(record.totalHours * record.multiplier * record.baseHourlyRate);
    record.status = oneOf(record.status || 'Chờ phê duyệt', 'Trạng thái làm thêm', ['Chờ phê duyệt', 'Chờ duyệt', 'Đã duyệt OT', 'Từ chối']);
  }
  if (['leave_requests', 'attendance_overtime'].includes(scope)) {
    const pending = scope === 'leave_requests' ? 'Chờ duyệt' : 'Chờ phê duyệt';
    if (!current && !['Chờ duyệt', 'Chờ phê duyệt'].includes(record.status)) throw new HttpError(422, 'Đơn mới phải chờ phê duyệt.');
    if (current && !['Chờ duyệt', 'Chờ phê duyệt'].includes(current.status) && JSON.stringify(record) !== JSON.stringify(current)) throw new HttpError(422, 'Đơn đã xử lý không thể thay đổi.');
    if (actor.role !== 'ADMIN' && record.status !== pending && record.status !== 'Chờ duyệt') throw new HttpError(403, 'Chỉ quản trị viên được phê duyệt.');
    if (current && record.status !== current.status && !['Chờ duyệt', 'Chờ phê duyệt'].includes(record.status)) {
      record.approver = actor.name; record.approverId = actor.id; record.approvedAt = now();
    } else if (!current) { delete record.approver; delete record.approverId; delete record.approvedAt; }
  }
  const serialized = JSON.stringify(record);
  if (serialized.length > 128 * 1024) throw new HttpError(422, 'Bản ghi vượt quá dung lượng cho phép.');
  return { recordKey, record, serialized };
}

function publicCollectionRecord(row) {
  const record = serializeCollectionRecord(row);
  if (record && row.scope === 'workflow_security_settings') {
    record.slackWebhookConfigured = Boolean(record.slackWebhookEncrypted);
    delete record.slackWebhookEncrypted;
    record.slackWebhook = '';
  }
  if (record && row.scope === 'employee_timesheets') return { ...record, employeeId: row.owner_id };
  return record;
}

async function recordAuditEvent(actorId, action, scope, resourceId = '', details = {}) {
  const serialized = JSON.stringify(details && typeof details === 'object' && !Array.isArray(details) ? details : {});
  await db.prepare(`INSERT INTO audit_events (id, actor_id, action, resource_scope, resource_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), actorId || null, requiredText(action, 'Hành động', 120), normalizeCollectionScope(scope), String(resourceId || '').slice(0, 160), serialized.slice(0, 8_192), now());
}

function applicationCategoryForAudit(scope, resourceId = '') {
  const value = String(scope || '').trim().toLowerCase();
  if (value === 'application_usage') return ['finance', 'business', 'hr', 'digital_office'].includes(resourceId) ? resourceId : null;
  if (/^finance_(sales|purchase|purchasing|inventory)/.test(value)) return 'business';
  if (/^(finance|payroll|asset_)/.test(value)) return 'finance';
  if (/^(crm|sales|purchase|business|inventory)/.test(value)) return 'business';
  if (/^(hr|attendance|insurance|leave_requests|employee_timesheets)/.test(value)) return 'hr';
  if (/^(workflow|doc|meeting|room_bookings|chat|channel|file|notification|task|enterprise_documents|digital_signature|admin_|system_|company_profile|audit)/.test(value)) return 'digital_office';
  return null;
}

function usageDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftUsageDateKey(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getUsagePeriodRange(period) {
  const today = usageDateKey(new Date());
  let startDate = today;
  let endDate = today;
  if (period === 'this_week') {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    startDate = shiftUsageDateKey(today, -((weekday + 6) % 7));
  } else if (period === 'this_month') {
    startDate = `${today.slice(0, 7)}-01`;
  } else if (period === 'this_quarter') {
    const month = Number(today.slice(5, 7));
    const quarterMonth = Math.floor((month - 1) / 3) * 3 + 1;
    startDate = `${today.slice(0, 4)}-${String(quarterMonth).padStart(2, '0')}-01`;
  } else if (period === 'all_time') {
    startDate = '1970-01-01';
  }
  const nextDate = shiftUsageDateKey(endDate, 1);
  return {
    start: new Date(`${startDate}T00:00:00+07:00`).toISOString(),
    end: new Date(`${nextDate}T00:00:00+07:00`).toISOString(),
    fromDate: startDate,
    toDate: endDate,
  };
}

function loyaltyBalances(entries) {
  const balances = new Map();
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.delta)) throw new HttpError(500, 'Sổ điểm chứa dữ liệu không hợp lệ.');
    const balance = (balances.get(entry.customerId) || 0n) + BigInt(entry.delta);
    balances.set(entry.customerId, balance);
  }
  for (const [customerId, balance] of balances) {
    if (balance < 0n || balance > BigInt(Number.MAX_SAFE_INTEGER)) throw new HttpError(500, 'Số dư điểm không hợp lệ.');
    balances.set(customerId, Number(balance));
  }
  return balances;
}

async function loyaltyEntries() {
  const rows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'crm_loyalty_ledger' ORDER BY created_at DESC, record_key DESC").all();
  return rows.map(publicCollectionRecord).filter(Boolean);
}

async function saleCustomerLinks() {
  const rows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_sale_customer_links'").all();
  return rows.map(publicCollectionRecord).filter(Boolean);
}

async function salePromotionSnapshots() {
  const rows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_sale_promotions'").all();
  return rows.map(publicCollectionRecord).filter(Boolean);
}

function publicSalePromotion(snapshot) {
  return snapshot ? { grossAmount: snapshot.grossAmount, discountAmount: snapshot.discountAmount, appliedPromotions: snapshot.applications } : {};
}

async function insertSaleCustomerLink(saleId, saleCode, customer, actor, timestamp) {
  const link = {
    key: saleId, saleCode, customerId: customer.id, customerCode: customer.code, customerName: customer.name,
    createdAt: timestamp, createdBy: actor.name, createdById: actor.id,
  };
  await db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
    VALUES (?, 'finance_sale_customer_links', ?, ?, ?, ?, ?)`)
    .run(randomUUID(), saleId, actor.id, JSON.stringify(link), timestamp, timestamp);
  await recordAuditEvent(actor.id, 'link_sale_customer', 'finance_sale_customer_links', saleId, { customerId: customer.id });
  return link;
}

function payrollMonth(value) {
  const text = String(value || '').trim();
  const local = /^(\d{1,2})[/-](\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(text);
  const month = Number(local ? local[1] : iso ? iso[2] : 0);
  const year = local ? local[2] : iso ? iso[1] : '';
  if (iso?.[3]) {
    const day = Number(iso[3]);
    const timestamp = Date.UTC(Number(year), month - 1, day);
    const date = new Date(timestamp);
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return '';
  }
  return month >= 1 && month <= 12 && year ? `${String(month).padStart(2, '0')}/${year}` : '';
}

async function payrollLedgerPreview(period, employerInsurance, actor, allowEmpty = false) {
  const rows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'payroll' ORDER BY record_key ASC").all();
  const records = rows.map(publicCollectionRecord).filter((record) => record && payrollMonth(record.month) === period);
  if (!records.length && !allowEmpty) throw new HttpError(422, 'Kỳ lương không có dữ liệu hợp lệ để hạch toán.');
  if (!records.length && employerInsurance !== 0) throw new HttpError(422, 'Kỳ lương không có phiếu, khoản doanh nghiệp đóng phải là 0.');
  const seen = new Set();
  const totals = { gross: 0, employeeInsurance: 0, tax: 0, paid: 0 };
  for (const record of records) {
    const code = requiredText(record.employeeCode, 'Mã nhân viên', 160).toLocaleLowerCase('vi-VN');
    if (seen.has(code)) throw new HttpError(422, 'Kỳ lương có nhân viên trùng, cần đối chiếu trước khi ghi sổ.');
    seen.add(code);
    if (!['Chưa chi trả', 'Đã chi trả'].includes(record.status)) throw new HttpError(422, 'Kỳ lương có phiếu chưa được duyệt hoặc trạng thái không hợp lệ.');
    const readMoney = (field) => {
      if (record[field] === undefined || record[field] === null || record[field] === '') throw new HttpError(422, `Phiếu lương ${record.employeeCode} thiếu số liệu ${field}.`);
      return optionalAmount(record[field], field);
    };
    const gross = readMoney('baseSalary') + readMoney('allowance') + readMoney('bonus');
    const insurance = readMoney('insuranceDeduction');
    const tax = readMoney('taxDeduction');
    const net = readMoney('netSalary');
    if (gross - insurance - tax !== net) throw new HttpError(422, `Phiếu lương ${record.employeeCode} không cân đối.`);
    totals.gross += gross; totals.employeeInsurance += insurance; totals.tax += tax;
    if (record.status === 'Đã chi trả') totals.paid += net;
  }
  if (!Object.values(totals).every(Number.isSafeInteger) || (records.length && totals.gross <= 0)) throw new HttpError(422, 'Tổng tiền lương không hợp lệ.');
  const lines = [
    { description: `Ghi nhận lương phải trả kỳ ${period}`, debitAccount: 'TK 642', creditAccount: 'TK 334', amount: totals.gross },
    { description: `Trích bảo hiểm phần doanh nghiệp kỳ ${period}`, debitAccount: 'TK 642', creditAccount: 'TK 338', amount: employerInsurance },
    { description: `Khấu trừ bảo hiểm người lao động kỳ ${period}`, debitAccount: 'TK 334', creditAccount: 'TK 338', amount: totals.employeeInsurance },
    { description: `Khấu trừ thuế TNCN kỳ ${period}`, debitAccount: 'TK 334', creditAccount: 'TK 3335', amount: totals.tax },
    { description: `Ghi nhận lương đã chi kỳ ${period}`, debitAccount: 'TK 334', creditAccount: 'TK 112', amount: totals.paid },
  ].filter((line) => line.amount > 0);
  const fingerprint = createHash('sha256').update(JSON.stringify({ period, employerInsurance, actorId: actor.id, records })).digest('hex');
  return { period, employerInsurance, employeeCount: records.length, lines, fingerprint, records };
}

function salePromotionKeys(input) {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > 10) throw new HttpError(422, 'Danh sách khuyến mại không hợp lệ.');
  const keys = input.map((key) => requiredText(key, 'Chương trình khuyến mại', 160));
  if (new Set(keys).size !== keys.length) throw new HttpError(422, 'Chương trình khuyến mại không được chọn trùng.');
  return keys;
}

async function calculateSalePromotions(document, customer, actor, keys) {
  if (!keys.length || !customer) throw new HttpError(422, 'Chọn khách hàng CRM và chương trình khuyến mại.');
  if (document.documentType !== 'sale' || !['Đơn bán hàng', 'Hợp đồng bán'].includes(document.subtype)
    || !['Đang triển khai', 'Đã bàn giao'].includes(document.status)) throw new HttpError(422, 'Khuyến mại chỉ áp dụng cho đơn hoặc hợp đồng bán đang thực hiện.');
  if (document.vatRate !== 0 || document.vatAmount !== 0) throw new HttpError(422, 'Chứng từ có thuế cần được tính theo dòng hàng trước khi áp dụng khuyến mại.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const promotions = [];
  for (const key of keys) {
    const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'crm_promotions' AND record_key = ? LIMIT 1").get(key);
    const promotion = row && publicCollectionRecord(row);
    if (!promotion || promotion.promotionType !== 'Chiết khấu' || !promotion.enabled
      || promotion.startDate > today || promotion.endDate < today
      || promotion.startDate > document.documentDate || promotion.endDate < document.documentDate) {
      throw new HttpError(422, 'Chương trình không hoạt động hoặc không phù hợp ngày chứng từ.');
    }
    const target = String(promotion.target || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
    if (target !== 'tất cả khách hàng') throw new HttpError(422, 'Đối tượng chương trình cần được xác định cụ thể trước khi áp dụng tự động.');
    if (!Array.isArray(promotion.customerKeys) || (promotion.customerKeys.length && !promotion.customerKeys.includes(customer.id))) {
      throw new HttpError(422, 'Khách hàng không thuộc phạm vi chương trình.');
    }
    if (!Array.isArray(promotion.employeeIds) || (promotion.employeeIds.length && !promotion.employeeIds.includes(actor.id))) {
      throw new HttpError(403, 'Người lập chứng từ không thuộc phạm vi chương trình.');
    }
    if (!Array.isArray(promotion.eligibleItemCodes) || promotion.eligibleItemCodes.length
      || Number(promotion.unitPrice) !== 0 || String(promotion.unit || '').trim().toLocaleLowerCase('vi-VN') !== 'đơn hàng') {
      throw new HttpError(422, 'Chương trình cần thông tin dòng hàng hoặc đơn giá chưa có trên chứng từ.');
    }
    if (!Array.isArray(promotion.orgUnitKeys) || promotion.orgUnitKeys.length) throw new HttpError(422, 'Chương trình theo cơ cấu tổ chức cần xác định đơn vị của chứng từ.');
    if (promotion.taxCondition === 'Có thuế') throw new HttpError(422, 'Chương trình chỉ áp dụng cho chứng từ có thuế.');
    if (!['Bất kỳ', 'Không thuế'].includes(promotion.taxCondition)) throw new HttpError(422, 'Điều kiện thuế của chương trình không hợp lệ.');
    if (!Number.isSafeInteger(promotion.minimumSubtotal) || document.amount < promotion.minimumSubtotal) throw new HttpError(422, 'Chứng từ chưa đạt điều kiện thành tiền của chương trình.');
    promotions.push(promotion);
  }
  if (promotions.length > 1) {
    for (const promotion of promotions) {
      if (!promotion.allowConcurrent || !Array.isArray(promotion.combinablePromotionKeys)
        || promotions.some((other) => other.key !== promotion.key && !promotion.combinablePromotionKeys.includes(other.key))) {
        throw new HttpError(422, 'Các chương trình được chọn chưa cho phép áp dụng đồng thời với nhau.');
      }
    }
  }
  if (promotions.some((promotion) => promotion.applyOnce)) {
    const rows = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'finance_sale_promotions'").all();
    const used = rows.map((row) => parseJsonObject(row.payload_json)).filter((record) => record.customerId === customer.id);
    if (promotions.some((promotion) => promotion.applyOnce && used.some((record) => Array.isArray(record.applications) && record.applications.some((item) => item.key === promotion.key)))) {
      throw new HttpError(409, 'Khách hàng đã sử dụng chương trình chỉ áp dụng một lần.');
    }
  }
  let remaining = document.amount;
  const applications = promotions.map((promotion) => {
    const value = Number(promotion.discountValue);
    if (!Number.isSafeInteger(value) || value <= 0 || (promotion.discountKind === 'Phần trăm' && value > 100)
      || !['Phần trăm', 'Số tiền'].includes(promotion.discountKind)) throw new HttpError(422, 'Giá trị chiết khấu không hợp lệ.');
    const discount = promotion.discountKind === 'Phần trăm' ? Number((BigInt(remaining) * BigInt(value) + 50n) / 100n) : value;
    if (discount <= 0 || discount >= remaining) throw new HttpError(422, 'Chiết khấu phải lớn hơn 0 và nhỏ hơn số tiền còn lại.');
    const basis = remaining;
    remaining -= discount;
    return { key: promotion.key, code: promotion.code, name: promotion.name, discountKind: promotion.discountKind, discountValue: value, basis, discount };
  });
  const result = { grossAmount: document.amount, discountAmount: document.amount - remaining, netAmount: remaining, applications };
  const fingerprint = createHash('sha256').update(JSON.stringify({ actorId: actor.id, customerId: customer.id, date: document.documentDate, subtype: document.subtype, status: document.status, ...result })).digest('hex');
  return { ...result, fingerprint };
}

function validateCashTransaction(input) {
  return {
    code: '',
    type: oneOf(input.type, 'Loại chứng từ', ['Thu', 'Chi']),
    source: oneOf(input.source || 'bank', 'Nguồn tiền', ['bank', 'petty']),
    category: requiredText(input.category, 'Nội dung thu chi', 500),
    amount: requiredAmount(input.amount, 'Số tiền'),
    date: requiredIsoDate(input.date, 'Ngày hạch toán'),
    recipientOrPayer: requiredText(input.recipientOrPayer, 'Đối tác hoặc người nhận', 200),
    account: requiredText(input.account, 'Tài khoản hoặc quỹ tiền', 200),
    status: oneOf(input.status || 'Chờ duyệt', 'Trạng thái', ['Đã hoàn thành', 'Chờ duyệt', 'Đã hủy']),
    note: optionalText(input.note, 'Ghi chú', 2_000),
    department: optionalText(input.department, 'Phòng ban', 160),
    employeeCode: optionalText(input.employeeCode, 'Mã nhân viên', 64).toUpperCase(),
  };
}

function validateFinanceDocument(input) {
  const documentType = oneOf(input.documentType, 'Loại chứng từ', ['sale', 'purchase', 'invoice']);
  const subtype = requiredText(input.subtype, 'Phân loại chứng từ', 80);
  const amount = requiredAmount(input.amount, 'Tổng tiền');
  const paidAmount = optionalAmount(input.paidAmount, 'Số tiền đã thanh toán');
  if (paidAmount > amount) throw new HttpError(422, 'Số tiền đã thanh toán không được lớn hơn tổng tiền.');
  const dueDate = input.dueDate ? requiredIsoDate(input.dueDate, 'Hạn thanh toán') : '';
  const documentDate = requiredIsoDate(input.documentDate, 'Ngày chứng từ');
  if (dueDate && Date.parse(`${dueDate}T00:00:00.000Z`) < Date.parse(`${documentDate}T00:00:00.000Z`)) {
    throw new HttpError(422, 'Hạn thanh toán không được trước ngày chứng từ.');
  }

  const vatRate = optionalAmount(input.vatRate, 'Thuế suất VAT');
  if (![0, 5, 8, 10].includes(vatRate)) throw new HttpError(422, 'Thuế suất VAT không hợp lệ.');
  const vatAmount = optionalAmount(input.vatAmount, 'Tiền VAT');

  return {
    documentType,
    code: '',
    subtype,
    partnerName: requiredText(input.partnerName, 'Đối tác', 200),
    description: optionalText(input.description, 'Diễn giải', 1_000),
    amount,
    paidAmount,
    documentDate,
    dueDate,
    status: requiredText(input.status || 'Chưa thanh toán', 'Trạng thái', 80),
    taxCode: optionalText(input.taxCode, 'Mã số thuế', 32),
    vatRate,
    vatAmount,
  };
}

function validateBankAccount(input) {
  return {
    bankName: requiredText(input.bankName, 'Tên ngân hàng', 200),
    accountNumber: requiredText(input.accountNumber, 'Số tài khoản', 64),
    accountHolder: requiredText(input.accountHolder, 'Chủ tài khoản', 200),
    branch: optionalText(input.branch, 'Chi nhánh', 200),
    balance: optionalAmount(input.balance, 'Số dư ban đầu'),
    status: requiredText(input.status || 'Đang hoạt động', 'Trạng thái', 80),
  };
}

function validateCrmContact(input) {
  const type = oneOf(input.type, 'Loại đối tác', ['customer', 'supplier', 'partner']);
  const email = optionalText(input.email, 'Email', 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, 'Email liên hệ không đúng định dạng.');
  return {
    code: '',
    name: requiredText(input.name, 'Tên đối tác', 220),
    type,
    taxCode: optionalText(input.taxCode, 'Mã số thuế', 32),
    industry: optionalText(input.industry, 'Ngành nghề', 220),
    contactPerson: optionalText(input.contactPerson, 'Người liên hệ', 200),
    phone: optionalText(input.phone, 'Số điện thoại', 32),
    email,
    address: optionalText(input.address, 'Địa chỉ', 500),
    bankAccount: optionalText(input.bankAccount, 'Tài khoản ngân hàng', 220),
    creditLimit: optionalAmount(input.creditLimit, 'Hạn mức tín dụng'),
    totalValue: optionalAmount(input.totalValue, 'Giá trị giao dịch'),
    debtBalance: optionalAmount(input.debtBalance, 'Công nợ'),
    tier: optionalText(input.tier, 'Hạng đối tác', 80) || 'Tiêu chuẩn',
    accountManager: optionalText(input.accountManager, 'Người phụ trách', 160),
    status: optionalText(input.status, 'Trạng thái', 80) || 'Đang hoạt động',
  };
}

const TASK_PRIORITIES = ['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp'];
const TASK_STATUSES = ['Chưa bắt đầu', 'Đang thực hiện', 'Chờ nghiệm thu', 'Hoàn thành', 'Tạm dừng'];
const EMPLOYEE_TASK_STATUSES = ['Chưa bắt đầu', 'Đang thực hiện', 'Chờ nghiệm thu', 'Tạm dừng'];

function optionalProgress(value) {
  const progress = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
    throw new HttpError(422, 'Tiến độ phải là số nguyên từ 0 đến 100.');
  }
  return progress;
}

function validateChecklist(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 30) throw new HttpError(422, 'Checklist tối đa 30 hạng mục.');
  return value.map((item, index) => requiredText(
    typeof item === 'string' ? item : item?.title,
    `Hạng mục checklist ${index + 1}`,
    300,
  ));
}

function validateTaskCreate(input) {
  const defaultDueDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  return {
    code: '',
    taskTitle: requiredText(input.taskTitle, 'Tên nhiệm vụ', 500),
    description: optionalText(input.description, 'Mô tả nhiệm vụ', 4_000),
    projectName: optionalText(input.projectName, 'Đơn vị', 200),
    assigneeId: requiredText(input.assigneeId, 'Người thực hiện', 128),
    priority: oneOf(input.priority || 'Trung bình', 'Độ ưu tiên', TASK_PRIORITIES),
    dueDate: (input.dueDate && String(input.dueDate).trim()) ? requiredIsoDate(input.dueDate, 'Hạn hoàn thành') : defaultDueDate,
    checklist: validateChecklist(input.checklist),
  };
}

function validateEmployeeProposal(input) {
  return {
    title: requiredText(input.title, 'Tiêu đề kiến nghị', 500),
    type: requiredText(input.type, 'Hạng mục kiến nghị', 160),
    amount: optionalAmount(input.amount, 'Dự toán kinh phí'),
    content: requiredText(input.content || input.note, 'Nội dung kiến nghị', 4_000),
  };
}

function publicContract(row, actor = null) {
  if (!row) return null;
  const isFull = !actor || actor.role === 'ADMIN' || actor.id === row.employee_user_id;
  let customFields = {};
  try {
    if (row.custom_field_values_json) customFields = JSON.parse(row.custom_field_values_json);
  } catch {}

  const rawPartyBPhone = decryptField(row.party_b_phone, 'contract');
  const rawPartyBEmail = decryptField(row.party_b_email, 'contract');
  const rawPartyBBank = decryptField(row.party_b_bank, 'contract');
  const rawPartyBId = decryptField(row.party_b_id_number, 'contract');
  const rawPartyBAddress = decryptField(row.party_b_address, 'contract');

  const rawEmpPhone = decryptField(row.employee_phone, 'contract');
  const rawEmpEmail = decryptField(row.employee_email, 'contract');
  const rawEmpBank = decryptField(row.employee_bank, 'contract');
  const rawEmpId = decryptField(row.employee_id_number, 'contract');

  return {
    key: row.id,
    id: row.id,
    code: row.code,
    name: row.name,
    contractCategory: row.contract_category || 'labor',
    contractTemplate: row.contract_template || 'Hợp đồng lao động chính thức',
    partyBType: row.party_b_type || 'employee',
    partyBName: row.party_b_name || '',
    partyBTaxCode: row.party_b_tax_code || '',
    partyBRepresentative: row.party_b_representative || '',
    partyBPosition: row.party_b_position || '',
    partyBIdNumber: isFull ? rawPartyBId : maskIdNumber(rawPartyBId),
    partyBPhone: isFull ? rawPartyBPhone : maskPhone(rawPartyBPhone),
    partyBEmail: isFull ? rawPartyBEmail : maskEmail(rawPartyBEmail),
    partyBBank: isFull ? rawPartyBBank : maskBankAccount(rawPartyBBank),
    partyBAddress: isFull ? rawPartyBAddress : '',
    employeeCode: row.employee_code || '',
    employeeName: row.employee_name || '',
    employeeIdNumber: isFull ? rawEmpId : maskIdNumber(rawEmpId),
    employeePhone: isFull ? rawEmpPhone : maskPhone(rawEmpPhone),
    employeeEmail: isFull ? rawEmpEmail : maskEmail(rawEmpEmail),
    employeeBank: isFull ? rawEmpBank : maskBankAccount(rawEmpBank),
    type: row.contract_type || 'Hợp đồng lao động chính thức',
    position: row.position || '',
    department: row.department || '',
    jobLevel: row.job_level || '',
    workLocation: row.work_location || '',
    startDate: row.start_date || '',
    endDate: row.end_date || '',
    probationMonths: row.probation_months || 0,
    contractValue: isFull ? (row.contract_value || 0) : 0,
    salary: isFull ? (row.salary || 0) : 0,
    allowance: isFull ? (row.allowance || 0) : 0,
    stockSharesPercent: row.stock_shares_percent || '',
    paymentMethod: row.payment_method || '',
    paymentDay: row.payment_day || 5,
    workingHours: row.working_hours || '',
    annualLeaveDays: row.annual_leave_days || 12,
    insuranceType: row.insurance_type || '',
    ndaClause: Boolean(row.nda_clause),
    nonCompeteClause: Boolean(row.non_compete_clause),
    status: row.status || 'Chờ ký',
    employeeSignStatus: row.employee_sign_status || 'Chưa ký',
    employeeSignDate: row.employee_sign_date || null,
    employeeSignMethod: row.employee_sign_method || 'digital',
    employeeCertName: row.employee_cert_name || null,
    employeeSignedFileName: row.employee_signed_file_name || null,
    companySignStatus: row.company_sign_status || 'Chưa ký',
    companySignDate: row.company_sign_date || null,
    companySignMethod: row.company_sign_method || 'digital',
    companyCertName: row.company_cert_name || null,
    companySignedFileName: row.company_signed_file_name || null,
    signerName: row.signer_name || '',
    signerPosition: row.signer_position || '',
    note: row.note || '',
    customFieldValues: customFields,
    fileNodeId: row.file_node_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateContract(input) {
  return {
    code: optionalText(input.code, 'Mã hợp đồng', 80) || '',
    name: requiredText(input.name, 'Tên hợp đồng', 300),
    contractCategory: optionalText(input.contractCategory, 'Danh mục hợp đồng', 80) || 'labor',
    contractTemplate: requiredText(input.contractTemplate, 'Mẫu hợp đồng', 200),
    partyBType: optionalText(input.partyBType, 'Loại đối tác', 40) || 'employee',
    partyBName: optionalText(input.partyBName, 'Tên bên B', 200) || '',
    partyBTaxCode: optionalText(input.partyBTaxCode, 'Mã số thuế', 40) || '',
    partyBRepresentative: optionalText(input.partyBRepresentative, 'Đại diện bên B', 160) || '',
    partyBPosition: optionalText(input.partyBPosition, 'Chức vụ bên B', 160) || '',
    partyBIdNumber: optionalText(input.partyBIdNumber, 'Số CCCD/CMND', 40) || '',
    partyBPhone: optionalText(input.partyBPhone, 'Số điện thoại', 32) || '',
    partyBEmail: optionalText(input.partyBEmail, 'Email bên B', 254) || '',
    partyBBank: optionalText(input.partyBBank, 'Ngân hàng bên B', 220) || '',
    partyBAddress: optionalText(input.partyBAddress, 'Địa chỉ bên B', 500) || '',
    employeeCode: optionalText(input.employeeCode, 'Mã nhân viên', 40) || '',
    employeeName: optionalText(input.employeeName, 'Tên nhân viên', 160) || '',
    employeeIdNumber: optionalText(input.employeeIdNumber, 'CCCD nhân viên', 40) || '',
    employeePhone: optionalText(input.employeePhone, 'SĐT nhân viên', 32) || '',
    employeeEmail: optionalText(input.employeeEmail, 'Email nhân viên', 254) || '',
    employeeBank: optionalText(input.employeeBank, 'Ngân hàng nhân viên', 220) || '',
    contractType: optionalText(input.type || input.contractType, 'Loại hợp đồng', 160) || 'Hợp đồng lao động chính thức',
    position: optionalText(input.position, 'Vị trí công tác', 160) || '',
    department: optionalText(input.department, 'Phòng ban', 160) || '',
    jobLevel: optionalText(input.jobLevel, 'Cấp bậc', 80) || '',
    workLocation: optionalText(input.workLocation, 'Địa điểm làm việc', 250) || '',
    startDate: optionalText(input.startDate, 'Ngày bắt đầu', 40) || '',
    endDate: optionalText(input.endDate, 'Ngày kết thúc', 40) || '',
    probationMonths: optionalAmount(input.probationMonths, 'Thời gian thử việc') || 0,
    contractValue: optionalAmount(input.contractValue, 'Giá trị hợp đồng') || 0,
    salary: optionalAmount(input.salary, 'Mức lương') || 0,
    allowance: optionalAmount(input.allowance, 'Phụ cấp') || 0,
    stockSharesPercent: optionalText(input.stockSharesPercent, 'Cổ phần ESOP', 120) || '',
    paymentMethod: optionalText(input.paymentMethod, 'Phương thức thanh toán', 120) || '',
    paymentDay: optionalAmount(input.paymentDay, 'Ngày thanh toán') || 5,
    workingHours: optionalText(input.workingHours, 'Thời gian làm việc', 160) || '',
    annualLeaveDays: optionalAmount(input.annualLeaveDays, 'Ngày phép năm') || 12,
    insuranceType: optionalText(input.insuranceType, 'Loại bảo hiểm', 160) || '',
    ndaClause: input.ndaClause !== undefined ? (input.ndaClause ? 1 : 0) : 1,
    nonCompeteClause: input.nonCompeteClause ? 1 : 0,
    status: optionalText(input.status, 'Trạng thái', 80) || 'Chờ ký',
    employeeSignStatus: optionalText(input.employeeSignStatus, 'Trạng thái ký nhân viên', 80) || 'Chưa ký',
    employeeSignDate: optionalText(input.employeeSignDate, 'Ngày nhân viên ký', 60) || null,
    employeeSignMethod: optionalText(input.employeeSignMethod, 'Phương thức ký', 60) || 'digital',
    employeeCertName: optionalText(input.employeeCertName, 'Chứng thư nhân viên', 255) || null,
    employeeSignedFileName: optionalText(input.employeeSignedFileName, 'Tên tệp đã ký', 255) || null,
    companySignStatus: optionalText(input.companySignStatus, 'Trạng thái ký công ty', 80) || 'Chưa ký',
    companySignDate: optionalText(input.companySignDate, 'Ngày công ty ký', 60) || null,
    companySignMethod: optionalText(input.companySignMethod, 'Phương thức ký công ty', 60) || 'digital',
    companyCertName: optionalText(input.companyCertName, 'Chứng thư công ty', 255) || null,
    companySignedFileName: optionalText(input.companySignedFileName, 'Tên tệp công ty ký', 255) || null,
    signerName: optionalText(input.signerName, 'Người đại diện ký', 160) || '',
    signerPosition: optionalText(input.signerPosition, 'Chức vụ người ký', 160) || '',
    note: optionalText(input.note, 'Ghi chú', 2000) || '',
    customFieldValuesJson: JSON.stringify(input.customFieldValues || {}),
  };
}

function generateContractDocContent(contract, user, company = {}) {
  contract = { ...contract };
  for (const field of ['party_b_id_number', 'party_b_phone', 'party_b_email', 'party_b_bank', 'party_b_address', 'employee_id_number', 'employee_phone', 'employee_email', 'employee_bank']) contract[field] = decryptField(contract[field], 'contract');
  const bName = contract.employee_name || contract.party_b_name || user?.name || 'Nhân sự';
  const bCode = contract.employee_code || user?.employee_code || '';
  const bPos = contract.position || contract.party_b_position || '';
  const bDept = contract.department || '';
  const sal = (contract.salary || contract.contract_value || 0).toLocaleString('vi-VN');

  return `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\n------------------------\n\n${(contract.name || 'HỢP ĐỒNG DOANH NGHIỆP').toUpperCase()}\nSố: ${contract.code}\n\nI. ĐẠI DIỆN BÊN A (NGƯỜI SỬ DỤNG LAO ĐỘNG / ĐƠN VỊ CUNG CẤP):\n- Pháp nhân doanh nghiệp: ${company.fullName || company.companyName || 'Chưa cấu hình'}\n- Mã số thuế: ${company.taxCode || 'Chưa khai báo'}\n- Đại diện: ${contract.signer_name || company.representative || 'Chưa khai báo'}\n- Chức vụ: ${contract.signer_position || company.representativeTitle || 'Chưa khai báo'}\n- Địa chỉ doanh nghiệp: ${company.address || 'Chưa cấu hình'}\n\nII. ĐẠI DIỆN BÊN B (NGƯỜI LAO ĐỘNG / ĐỐI TÁC):\n- Họ và tên: ${bName}\n- Mã nhân viên / Mã định danh: ${bCode}\n- Vị trí công tác: ${bPos}\n- Phòng ban: ${bDept}\n- Số CCCD/CMND: ${contract.employee_id_number || contract.party_b_id_number || ''}\n- Điện thoại: ${contract.employee_phone || contract.party_b_phone || ''}\n- Email: ${contract.employee_email || contract.party_b_email || user?.email || ''}\n\nIII. ĐIỀU KHOẢN HỢP ĐỒNG & CHẾ ĐỘ:\n- Mức lương / Giá trị hợp đồng: ${sal} VNĐ / tháng\n- Phụ cấp: ${(contract.allowance || 0).toLocaleString('vi-VN')} VNĐ\n- Thời hạn hợp đồng: Từ ${contract.start_date || ''} đến ${contract.end_date || ''}\n- Chế độ bảo hiểm: ${contract.insurance_type || ''}\n- Cam kết bảo mật NDA: ${contract.nda_clause ? 'Bắt buộc tuân thủ' : 'Theo thỏa thuận'}\n\nIV. TRẠNG THÁI KÝ KẾT ĐIỆN TỬ:\n- Bên A: ${contract.company_sign_status || 'Chưa ký'} ${contract.company_cert_name ? `(${contract.company_cert_name})` : ''}\n- Bên B: ${contract.employee_sign_status || 'Chưa ký'} ${contract.employee_cert_name ? `(${contract.employee_cert_name})` : ''}\n- Thời gian ghi nhận ký: ${contract.employee_sign_date || contract.company_sign_date || 'Chưa ghi nhận'}\n- Trạng thái/chứng thư là thông tin ghi nhận trong hệ thống, chưa được dịch vụ CA xác minh.`;
}

async function syncContractToFileNodes(contract, { overwrite = true } = {}) {
  if (!contract) return null;
  if (!overwrite && contract.file_node_id) {
    const existing = await fileNodeById(contract.file_node_id);
    if (existing?.storage_key) {
      const bytes = await readFile(fileStoragePath(existing.storage_key)).catch(() => null);
      if (bytes?.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50) return existing;
    }
  }
  let user = null;
  if (contract.employee_user_id) {
    user = await db.prepare('SELECT * FROM users WHERE id = ?').get(contract.employee_user_id);
  }
  if (!user && contract.employee_code) {
    user = await db.prepare('SELECT * FROM users WHERE employee_code = ?').get(contract.employee_code);
  }
  if (!user && contract.employee_email) {
    user = await db.prepare('SELECT * FROM users WHERE email = ?').get(decryptField(contract.employee_email, 'contract'));
  }
  if (!user && contract.employee_name) {
    user = await db.prepare('SELECT * FROM users WHERE name = ? COLLATE NOCASE').get(contract.employee_name);
  }
  const employeeUserId = user?.id || null;
  if (!user && contract.created_by) user = await getUserById(contract.created_by);
  if (!user) return null;

  const workspace = await ensureEmployeeWorkspace(user);
  const systemFolder = workspace.system;
  if (!systemFolder) return null;

  const cleanCode = (contract.code || 'HD').replace(/[\\/:*?"<>|]/g, '-');
  const cleanName = (contract.name || 'Hop_dong').replace(/[\\/:*?"<>|]/g, '_');
  const safeFileName = `${cleanCode}_${cleanName}.docx`;
  const contentBuf = createDocxFromText(generateContractDocContent(contract, user, await getCompanyProfile()));

  let fileNode = await db.prepare('SELECT * FROM file_nodes WHERE parent_id = ? AND name = ? AND deleted_at IS NULL')
    .get(systemFolder.id, safeFileName);
  const timestamp = now();

  if (!fileNode) {
    const fileId = randomUUID();
    const storageKey = `${fileId}.bin`;
    await writeFile(fileStoragePath(storageKey), contentBuf, { flag: 'w' });
    await db.prepare(`INSERT INTO file_nodes (
      id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key,
      origin_module, is_hidden, is_system, is_protected, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'file', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ?, ?, 'contracts', 0, 1, 1, ?, ?)`)
      .run(fileId, systemFolder.id, user.id, user.id, safeFileName, contentBuf.length, storageKey, timestamp, timestamp);
    fileNode = await db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(fileId);
  } else {
    const storageKey = `${randomUUID()}.bin`;
    await writeFile(fileStoragePath(storageKey), contentBuf, { flag: 'w' });
    await db.prepare('UPDATE file_nodes SET storage_key = ?, size = ?, updated_at = ? WHERE id = ?')
      .run(storageKey, contentBuf.length, timestamp, fileNode.id);
  }

  if (fileNode && contract.id) {
    await db.prepare('UPDATE contracts SET file_node_id = ?, employee_user_id = ? WHERE id = ?')
      .run(fileNode.id, employeeUserId, contract.id);
  }
  return fileNode;
}

async function seedDefaultContracts() {
  const count = (await db.prepare('SELECT COUNT(*) AS count FROM contracts').get())?.count;
  if (count > 0) return;

  const defaultList = [
    {
      code: 'HDLD-2024/8809-CT',
      name: 'Hợp đồng lao động không xác định thời hạn',
      contractCategory: 'labor',
      contractTemplate: 'Hợp đồng lao động chính thức',
      partyBType: 'employee',
      partyBName: 'Nguyễn Huy Tùng',
      partyBRepresentative: 'Nguyễn Huy Tùng',
      partyBPosition: 'Giám Đốc Công Nghệ',
      partyBIdNumber: '001201008899',
      partyBPhone: '0912345678',
      partyBEmail: 'tung.nguyen@kiyovn.com',
      partyBBank: 'Vietcombank - 0011004567890',
      partyBAddress: 'Trụ sở chính KIYOVN, Hà Nội',
      employeeCode: 'EMP-951954',
      employeeName: 'Nguyễn Huy Tùng',
      employeeIdNumber: '001201008899',
      employeePhone: '0912345678',
      employeeEmail: 'tung.nguyen@kiyovn.com',
      employeeBank: 'Vietcombank - 0011004567890',
      type: 'Hợp đồng lao động không xác định thời hạn',
      position: 'Giám Đốc Công Nghệ & Trưởng Khối R&D',
      department: 'Ban Công Nghệ & Kỹ Thuật Hệ Thống',
      jobLevel: 'C-Level / Ban Điều Hành',
      workLocation: 'Hà Nội',
      startDate: '2024-01-01',
      endDate: 'Không thời hạn',
      probationMonths: 0,
      contractValue: 0,
      salary: 85000000,
      allowance: 15000000,
      stockSharesPercent: '2.5% Tổng cổ phần phát hành',
      paymentMethod: 'Chuyển khoản ngân hàng',
      paymentDay: 5,
      workingHours: 'Linh hoạt theo quy chế Ban Giám Đốc',
      annualLeaveDays: 18,
      insuranceType: 'BHXH, BHYT, BHTN & Bảo hiểm Sức khỏe Toàn cầu 24/7',
      ndaClause: true,
      nonCompeteClause: true,
      status: 'Chờ ký',
      employeeSignStatus: 'Chưa ký',
      companySignStatus: 'Đã ký',
      companySignDate: '2024-01-01 08:30:00',
      companySignMethod: 'digital',
      companyCertName: 'Trần Tuấn Anh - Tổng Giám Đốc Token USB CA-2026',
      signerName: 'Trần Tuấn Anh',
      signerPosition: 'Tổng Giám Đốc',
      note: 'Hợp đồng lao động cán bộ quản lý cấp cao',
    },
    {
      code: 'HDCP-2026/099-ESOP',
      name: 'Hợp đồng lao động tính theo cổ phần',
      contractCategory: 'equity',
      contractTemplate: 'Hợp đồng lao động tính theo cổ phần',
      partyBType: 'employee',
      partyBName: 'Nguyễn Huy Tùng',
      partyBRepresentative: 'Nguyễn Huy Tùng',
      partyBPosition: 'Kỹ Sư Trưởng Hệ Thống & Cổ Đông',
      partyBIdNumber: '064210005343',
      partyBPhone: '0987654321',
      partyBEmail: 'tung.nguyen@kiyovn.com',
      partyBBank: 'Techcombank - 19034567890011',
      partyBAddress: 'Trụ sở chính KIYOVN - Tòa nhà Keangnam Landmark 72, Hà Nội',
      employeeCode: 'EMP-951954',
      employeeName: 'Nguyễn Huy Tùng',
      type: 'Hợp đồng tính theo cổ phần ESOP',
      position: 'Kỹ Sư Trưởng Hệ Thống',
      department: 'Phòng Kỹ Thuật Hệ Thống',
      startDate: '2026-01-01',
      endDate: '2031-01-01',
      salary: 50000000,
      allowance: 10000000,
      stockSharesPercent: '1.2% Cổ phần ESOP',
      status: 'Chờ ký',
      employeeSignStatus: 'Chưa ký',
      companySignStatus: 'Đã ký',
      signerName: 'Trần Tuấn Anh',
      signerPosition: 'Tổng Giám Đốc',
    },
    {
      code: 'HDCV-2026/08-TECH',
      name: 'Hợp đồng thuê chuyên gia cố vấn an ninh mạng',
      contractCategory: 'consultant',
      contractTemplate: 'Hợp đồng thuê chuyên gia cố vấn',
      partyBType: 'individual',
      partyBName: 'TS. Hoàng Minh Quân',
      partyBRepresentative: 'Hoàng Minh Quân',
      partyBPosition: 'Chuyên Gia Cố Vấn An Ninh Mạng',
      partyBIdNumber: '001085002934',
      partyBPhone: '0977112233',
      partyBEmail: 'quan.hoang@cybersec-advisors.vn',
      partyBBank: 'Vietcombank - 002100887766',
      partyBAddress: 'Quận Cầu Giấy, TP. Hà Nội',
      employeeCode: 'CG-001',
      employeeName: 'TS. Hoàng Minh Quân',
      type: 'Hợp đồng thuê chuyên gia cố vấn',
      position: 'Cố Vấn Trưởng',
      department: 'Ban An Toàn Thông Tin',
      startDate: '2026-01-15',
      endDate: '2027-01-15',
      contractValue: 780000000,
      salary: 65000000,
      allowance: 5000000,
      status: 'Còn hiệu lực',
      employeeSignStatus: 'Đã ký',
      employeeSignDate: '2026-01-15 08:30:00',
      companySignStatus: 'Đã ký',
    },
    {
      code: 'NDA-2026/001-SEC',
      name: 'Thỏa thuận bảo mật thông tin & Sở hữu trí tuệ',
      contractCategory: 'nda',
      contractTemplate: 'Thỏa thuận bảo mật thông tin (NDA)',
      partyBType: 'employee',
      partyBName: 'Nguyễn Huy Tùng',
      employeeCode: 'EMP-951954',
      employeeName: 'Nguyễn Huy Tùng',
      type: 'Thỏa thuận bảo mật thông tin',
      position: 'Giám Đốc Công Nghệ',
      department: 'Ban Công Nghệ',
      startDate: '2026-01-01',
      endDate: '2030-01-01',
      salary: 0,
      status: 'Còn hiệu lực',
      employeeSignStatus: 'Đã ký',
      employeeSignDate: '2026-01-01 10:00:00',
      employeeCertName: 'Nguyễn Huy Tùng CCCD NEAC Digital ID',
      companySignStatus: 'Đã ký',
    },
    {
      code: 'HDDV-2026/012-CLOUD',
      name: 'Hợp đồng cung cấp dịch vụ hạ tầng đám mây',
      contractCategory: 'service',
      contractTemplate: 'Hợp đồng cung cấp dịch vụ công nghệ',
      partyBType: 'organization',
      partyBName: 'CÔNG TY CP VIỄN THÔNG FPT',
      partyBTaxCode: '0101778163',
      partyBRepresentative: 'Nguyễn Văn Khoa',
      employeeCode: 'DT-001',
      employeeName: 'FPT Telecom',
      type: 'Hợp đồng cung cấp dịch vụ',
      position: 'Đối tác dịch vụ',
      department: 'Khối Hạ Tầng IDC',
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      contractValue: 480000000,
      salary: 0,
      status: 'Còn hiệu lực',
      employeeSignStatus: 'Đã ký',
      companySignStatus: 'Đã ký',
    },
    {
      code: 'HDLD-2026/102-DEV',
      name: 'Hợp đồng thử việc kỹ sư phát triển phần mềm',
      contractCategory: 'labor',
      contractTemplate: 'Hợp đồng lao động thử việc',
      partyBType: 'employee',
      partyBName: 'Lê Hoàng Yến',
      employeeCode: 'NV-82914',
      employeeName: 'Lê Hoàng Yến',
      type: 'Hợp đồng lao động thử việc',
      position: 'Kỹ sư Phần mềm',
      department: 'Trung Tâm R&D',
      startDate: '2026-08-01',
      endDate: '2026-10-01',
      salary: 22000000,
      status: 'Chờ ký',
      employeeSignStatus: 'Chưa ký',
      companySignStatus: 'Đã ký',
    },
  ];

  for (const item of defaultList) {
    const validated = validateContract(item);
    const id = randomUUID();
    const timestamp = now();
    await db.prepare(`INSERT INTO contracts (
      id, code, name, contract_category, contract_template, party_b_type, party_b_name,
      party_b_tax_code, party_b_representative, party_b_position, party_b_id_number,
      party_b_phone, party_b_email, party_b_bank, party_b_address, employee_code,
      employee_name, employee_id_number, employee_phone, employee_email, employee_bank,
      contract_type, position, department, job_level, work_location, start_date, end_date,
      probation_months, contract_value, salary, allowance, stock_shares_percent,
      payment_method, payment_day, working_hours, annual_leave_days, insurance_type,
      nda_clause, non_compete_clause, status, employee_sign_status, employee_sign_date,
      employee_sign_method, employee_cert_name, employee_signed_file_name,
      company_sign_status, company_sign_date, company_sign_method, company_cert_name,
      company_signed_file_name, signer_name, signer_position, note, custom_field_values_json,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`).run(
      id,
      validated.code,
      validated.name,
      validated.contractCategory,
      validated.contractTemplate,
      validated.partyBType,
      validated.partyBName,
      validated.partyBTaxCode,
      validated.partyBRepresentative,
      validated.partyBPosition,
      validated.partyBIdNumber,
      validated.partyBPhone,
      validated.partyBEmail,
      validated.partyBBank,
      validated.partyBAddress,
      validated.employeeCode,
      validated.employeeName,
      validated.employeeIdNumber,
      validated.employeePhone,
      validated.employeeEmail,
      validated.employeeBank,
      validated.contractType,
      validated.position,
      validated.department,
      validated.jobLevel,
      validated.workLocation,
      validated.startDate,
      validated.endDate,
      validated.probationMonths,
      validated.contractValue,
      validated.salary,
      validated.allowance,
      validated.stockSharesPercent,
      validated.paymentMethod,
      validated.paymentDay,
      validated.workingHours,
      validated.annualLeaveDays,
      validated.insuranceType,
      validated.ndaClause,
      validated.nonCompeteClause,
      validated.status,
      validated.employeeSignStatus,
      validated.employeeSignDate,
      validated.employeeSignMethod,
      validated.employeeCertName,
      validated.employeeSignedFileName,
      validated.companySignStatus,
      validated.companySignDate,
      validated.companySignMethod,
      validated.companyCertName,
      validated.companySignedFileName,
      validated.signerName,
      validated.signerPosition,
      validated.note,
      validated.customFieldValuesJson,
      timestamp,
      timestamp,
    );

    const savedRow = await db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
    await syncContractToFileNodes(savedRow);
  }
}

async function recordTaskActivity(taskId, actorId, content, timestamp = now()) {
  await db.prepare('INSERT INTO task_activities (id, task_id, actor_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(randomUUID(), taskId, actorId, content, timestamp);
}

async function generateEmployeeCode() {
  const countRow = await db.prepare(`SELECT COUNT(*) as c FROM users WHERE employee_code LIKE 'NV-%'`).get();
  const nextNum = Math.max(1, (countRow?.c || 0) + 1);
  const exists = db.prepare(`SELECT 1 FROM users WHERE employee_code = ? LIMIT 1`);
  for (let offset = 0; offset < 100; offset += 1) {
    const code = `NV-${String(nextNum + offset).padStart(3, '0')}`;
    if (!(await exists.get(code))) return code;
  }
  return `NV-${String(Date.now()).slice(-4)}`;
}

function ensureTaskAccess(task, actor) {
  if (!task) throw new HttpError(404, 'Không tìm thấy nhiệm vụ.');
  if (actor.role !== 'ADMIN' && task.assignee_id !== actor.id && task.created_by !== actor.id) {
    throw new HttpError(403, 'Bạn không có quyền thao tác nhiệm vụ này.');
  }
}

function validateTaskReport(input, isAdmin = false) {
  const attachments = Array.isArray(input.attachments) ? input.attachments : [];
  if (attachments.length > 10) throw new HttpError(422, 'Tối đa 10 tệp đính kèm cho một báo cáo.');
  const safeAttachments = attachments.map((file, index) => ({
    id: requiredText(file?.id, `Tệp đính kèm ${index + 1}`, 128),
    key: requiredText(file?.key, `Tệp đính kèm ${index + 1}`, 256),
    name: requiredText(file?.name, `Tệp đính kèm ${index + 1}`, 255),
    size: optionalAmount(file?.size, `Dung lượng tệp ${index + 1}`),
    type: optionalText(file?.type, `Loại tệp ${index + 1}`, 120),
  }));
  const content = optionalText(input.content, 'Nội dung báo cáo', 4_000);
  if (!content && safeAttachments.length === 0) {
    throw new HttpError(422, 'Vui lòng nhập nội dung báo cáo hoặc đính kèm tệp.');
  }
  let progress = optionalProgress(input.progress);
  let status = input.status;
  if (!isAdmin && status === 'Hoàn thành') {
    status = 'Chờ nghiệm thu';
  }
  status = oneOf(status, 'Trạng thái', isAdmin ? TASK_STATUSES : EMPLOYEE_TASK_STATUSES);
  if (status === 'Chờ nghiệm thu' && progress < 100) {
    status = progress > 0 ? 'Đang thực hiện' : 'Chưa bắt đầu';
  }
  return { content, attachments: safeAttachments, progress, status };
}

async function nextUniqueCode(prefix, tableName, columnName = 'code') {
  const allowedTables = new Set(['users', 'finance_cash_transactions', 'finance_documents', 'crm_contacts', 'tasks', 'employee_proposals']);
  const allowedColumns = new Set(['code', 'employee_code']);
  if (!allowedTables.has(tableName) || !allowedColumns.has(columnName)) {
    throw new Error('Invalid system code configuration.');
  }
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const exists = db.prepare(`SELECT 1 FROM ${tableName} WHERE ${columnName} = ? LIMIT 1`);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = randomBytes(4).toString('hex').toUpperCase();
    const code = `${prefix}-${date}-${suffix}`;
    if (!(await exists.get(code))) return code;
  }
  throw new HttpError(500, 'Không thể tạo mã hệ thống. Vui lòng thử lại.');
}

function cashTypeForDocument(document) {
  if (document.documentType === 'sale') return 'Thu';
  if (document.documentType === 'purchase') return 'Chi';
  if (document.documentType === 'invoice' && document.subtype.includes('Đầu ra')) return 'Thu';
  if (document.documentType === 'invoice' && document.subtype.includes('Đầu vào')) return 'Chi';
  return null;
}

async function insertAutomaticCashTransaction(document, actorId, timestamp) {
  if (document.paidAmount <= 0) return;
  const type = cashTypeForDocument(document);
  if (!type) return;
  const code = `AUTO-${document.code}`;
  if (await db.prepare('SELECT id FROM finance_cash_transactions WHERE code = ?').get(code)) return;
  await db.prepare(`INSERT INTO finance_cash_transactions (
    id, code, transaction_type, source, category, amount, transaction_date, counterparty,
    account_name, status, note, department, employee_code, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, 'bank', ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`)
    .run(
      randomUUID(),
      code,
      type,
      document.description || document.subtype,
      document.paidAmount,
      document.documentDate,
      document.partnerName,
      'Tài khoản ngân hàng',
      'Đã hoàn thành',
      `Tự động ghi nhận từ chứng từ ${document.code}`,
      actorId,
      timestamp,
      timestamp,
    );
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 6 || password.length > 256) {
    throw new HttpError(422, 'Mật khẩu phải dài từ 6 đến 256 ký tự.');
  }
  return password;
}

async function readJson(request, maxBytes = 50 * 1024 * 1024) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > maxBytes) throw new HttpError(413, 'Nội dung yêu cầu quá lớn.');
  }
  if (!body) return {};
  try {
    const parsed = JSON.parse(body);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('invalid');
    return parsed;
  } catch {
    throw new HttpError(400, 'Dữ liệu JSON không hợp lệ.');
  }
}

async function getUserById(id) {
  if (!id) return null;
  return await db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

async function resolveUser(identifier, fallbackActor = null) {
  if (!identifier || identifier === 'SELF' || identifier === 'Tôi') return fallbackActor;
  // 1. Direct match users.id
  let user = await db.prepare('SELECT * FROM users WHERE id = ?').get(identifier);
  if (user) return { ...user, is_active: 1 };
  // 2. Match users.employee_code
  user = await db.prepare('SELECT * FROM users WHERE LOWER(employee_code) = ?').get(String(identifier).toLowerCase());
  if (user) return { ...user, is_active: 1 };
  // 3. Match employee_profiles (by user_id or employee_code)
  try {
    const profile = await db.prepare('SELECT user_id, name, email, employee_code FROM employee_profiles WHERE user_id = ? OR LOWER(employee_code) = ?').get(identifier, String(identifier).toLowerCase());
    if (profile) {
      if (profile.user_id) {
        user = await db.prepare('SELECT * FROM users WHERE id = ?').get(profile.user_id);
        if (user) return { ...user, is_active: 1 };
      }
      return {
        id: profile.user_id || identifier,
        name: profile.name,
        email: profile.email,
        employee_code: profile.employee_code,
        role: 'USER',
        is_active: 1,
      };
    }
  } catch {}
  // 4. Match users.email
  user = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(String(identifier).toLowerCase());
  if (user) return { ...user, is_active: 1 };
  // 5. Match users.name
  user = await db.prepare('SELECT * FROM users WHERE LOWER(name) = ?').get(String(identifier).toLowerCase());
  if (user) return { ...user, is_active: 1 };
  return fallbackActor ? { ...fallbackActor, is_active: 1 } : null;
}

async function getUserByEmail(email) {
  if (!email) return null;
  return await db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

async function createUser(input) {
  const email = normalizeEmail(input.email);
  const name = requiredText(input.name || input.fullName, 'Họ tên', 160);
  const suppliedEmployeeCode = optionalText(input.employeeCode ?? input.code, 'Mã nhân sự', 64).toUpperCase();
  const employeeCode = suppliedEmployeeCode || await generateEmployeeCode();
  const role = input.role === 'ADMIN' ? 'ADMIN' : input.role === 'USER' ? 'USER' : 'USER';
  if (input.role !== undefined && !['ADMIN', 'USER'].includes(input.role)) throw new HttpError(422, 'Vai trò không hợp lệ.');
  const password = validatePassword(input.password);
  if (await getUserByEmail(email)) throw new HttpError(409, 'Email đã tồn tại.');
  if (await db.prepare('SELECT 1 FROM users WHERE employee_code = ? LIMIT 1').get(employeeCode)) {
    throw new HttpError(409, 'Mã nhân sự đã tồn tại.');
  }
  const user = {
    id: randomUUID(),
    email,
    name,
    employeeCode,
    role,
    passwordHash: await hashPassword(password),
    timestamp: now(),
  };
  await db.transaction(async () => {
    await db.prepare(`INSERT INTO users (id, email, name, employee_code, role, password_hash, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
      .run(user.id, user.email, user.name, user.employeeCode, user.role, user.passwordHash, user.timestamp, user.timestamp);
    await ensureEmployeeProfile(user, input);
    await ensureEmployeeWorkspace(await getUserById(user.id));
  });
  return publicUser(await getUserById(user.id));
}

function validateEmployeeCreate(input) {
  const status = oneOf(input.status || 'Chính thức', 'Trạng thái nhân sự', EMPLOYMENT_STATUSES);
  return {
    employeeCode: requiredText(input.employeeCode ?? input.code, 'Mã nhân viên', 64).toUpperCase(),
    name: requiredText(input.name || input.fullName, 'Họ tên', 160),
    email: normalizeEmail(input.email),
    phone: optionalText(input.phone, 'Số điện thoại', 32) || '',
    department: optionalText(input.department, 'Phòng ban', 160) || '',
    position: optionalText(input.position, 'Chức danh', 160) || '',
    status,
    joinDate: input.joinDate ? requiredIsoDate(input.joinDate, 'Ngày vào làm') : new Date().toISOString().slice(0, 10),
    salaryBase: optionalAmount(input.salaryBase, 'Lương cơ bản'),
    avatar: optionalText(input.avatar, 'Ảnh đại diện', 25_000_000),
    details: jsonObject(input.details, 'Thông tin hồ sơ'),
  };
}

async function createPendingEmployee(input) {
  const employee = validateEmployeeCreate(input);
  if (await getUserByEmail(employee.email)) throw new HttpError(409, 'Email công việc đã tồn tại.');
  if (await db.prepare('SELECT 1 FROM users WHERE employee_code = ?').get(employee.employeeCode)) {
    throw new HttpError(409, 'Mã nhân viên đã tồn tại.');
  }

  const timestamp = now();
  const user = {
    id: randomUUID(),
    email: employee.email,
    name: employee.name,
    employeeCode: employee.employeeCode,
    role: 'USER',
    // A pending account has no usable password. This random hash only fulfils
    // the non-null storage invariant until the employee sets it from the link.
    passwordHash: await hashPassword(randomBytes(48).toString('base64url')),
    timestamp,
  };
  let activation;
  await db.transaction(async () => {
    await db.prepare(`INSERT INTO users (id, email, name, employee_code, role, password_hash, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'USER', ?, 0, ?, ?)`)
      .run(user.id, user.email, user.name, user.employeeCode, user.passwordHash, timestamp, timestamp);
    await ensureEmployeeProfile(user, employee);
    await ensureEmployeeWorkspace(await getUserById(user.id));
    activation = await createActivationToken(user.id);
  });

  const config = await getEmailConfig();
  const delivery = config.configured
    ? await sendActivationEmail(await getUserById(user.id), activation.rawToken)
    : { status: 'not_configured', message: 'Chưa cấu hình cổng gửi email doanh nghiệp.' };
  return {
    employee: publicEmployee(await employeeProfileRowByUserId(user.id)),
    user: publicUser(await getUserById(user.id)),
    delivery,
    expiresAt: activation.expiresAt,
  };
}

function getBearerToken(request) {
  const value = request.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(value);
  if (!match) throw new HttpError(401, 'Cần đăng nhập để tiếp tục.');
  return match[1];
}

async function requireUser(request) {
  const token = getBearerToken(request);
  const claims = verifyToken(token);
  if (claims.scope && claims.scope !== 'access') throw new HttpError(401, 'Token này không có quyền truy cập hệ thống.');
  const user = await getUserById(claims.sub);
  if (!user || !user.is_active) throw new HttpError(401, 'Tài khoản không còn hoạt động.');
  const key = claims.sid || `legacy-${createHash('sha256').update(token).digest('hex')}`;
  let row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'admin_sessions' AND record_key = ? AND owner_id = ?").get(key, user.id);
  if (!row && !claims.sid) {
    if (!Number.isInteger(claims.iat) || claims.iat > Math.floor(Date.now() / 1000)) throw new HttpError(401, 'Phiên đăng nhập không hợp lệ.');
    await saveAuthSession(user, key, request, claims.iat, claims.exp, 'legacy');
    row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'admin_sessions' AND record_key = ? AND owner_id = ?").get(key, user.id);
  }
  const session = row && publicCollectionRecord(row);
  if (!session || session.kind !== 'auth_session' || session.revokedAt || Date.parse(session.expiresAt) <= Date.now()) {
    throw new HttpError(401, 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.');
  }
  if (Date.parse(session.lastActive) < Date.now() - 30_000) {
    const timestamp = now();
    // Compare the stored revision so a concurrent activity update cannot overwrite revocation.
    await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ? AND payload_json = ?')
      .run(JSON.stringify({ ...session, lastActive: timestamp }), timestamp, row.id, row.payload_json);
  }
  request.authSession = { row, key, session };
  return user;
}

async function requireAdmin(request) {
  const user = await requireUser(request);
  if (user.role !== 'ADMIN') throw new HttpError(403, 'Bạn không có quyền quản trị.');
  return user;
}

async function lockUserAdministration(actor) {
  if (db.pool) await db.prepare("SELECT pg_advisory_xact_lock(hashtext('user-admin-lifecycle'))").get();
  const freshActor = await getUserById(actor.id);
  if (!freshActor || !freshActor.is_active || freshActor.role !== 'ADMIN') throw new HttpError(403, 'Quyền quản trị của phiên này đã thay đổi.');
}

async function retainActiveAdministrator(target) {
  if (target.role !== 'ADMIN' || !target.is_active) return;
  const others = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1 AND id <> ?").get(target.id);
  if (Number(others.count) === 0) throw new HttpError(422, 'Phải giữ ít nhất một quản trị viên đang hoạt động.');
}

function loginKey(request, email) {
  return `${request.socket.remoteAddress || 'unknown'}:${email}`;
}

function enforceLoginRateLimit(key) {
  const entry = loginAttempts.get(key);
  const timestamp = Date.now();
  if (!entry || timestamp - entry.windowStart >= LOGIN_WINDOW_MS) return;
  if (entry.count >= LOGIN_LIMIT) throw new HttpError(429, 'Đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau.');
}

function recordLoginFailure(key) {
  const timestamp = Date.now();
  const current = loginAttempts.get(key);
  if (!current || timestamp - current.windowStart >= LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { windowStart: timestamp, count: 1 });
  } else {
    current.count += 1;
  }
}

function clearLoginFailures(key) {
  loginAttempts.delete(key);
}

function allowOrigin(request, response) {
  const origin = request.headers.origin;
  if (!origin) return;
  const extraOrigin = process.env.CORS_ORIGIN?.trim();
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || origin === extraOrigin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-File-Name, X-Parent-Id, X-Origin-Module');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  response.end(JSON.stringify(payload));
}

async function runAssetDepreciationBatch(request) {
  const actor = await requireAdmin(request);
  const payload = await readJson(request, 4 * 1024 * 1024);
  const period = requiredText(payload.period, 'Kỳ khấu hao', 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new HttpError(422, 'Kỳ khấu hao phải theo định dạng YYYY-MM.');
  const businessDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  if (period !== businessDate.slice(0, 7)) throw new HttpError(422, 'Chỉ được ghi khấu hao cho kỳ hiện tại.');
  if (!Array.isArray(payload.entries) || payload.entries.length < 1 || payload.entries.length > 500) {
    throw new HttpError(422, 'Danh sách tài sản khấu hao không hợp lệ.');
  }
  const depreciationKeys = payload.entries.map((entry) => requiredText(entry?.depreciationKey, 'Hồ sơ khấu hao', 160));
  if (new Set(depreciationKeys).size !== depreciationKeys.length) throw new HttpError(422, 'Một tài sản không thể xuất hiện nhiều lần trong cùng kỳ.');
  const timestamp = now();
  const updated = [];
  let totalAmount = 0;
  await db.transaction(async () => {
    if (db.pool) {
      for (const scope of ['asset_depreciations', 'asset_items', 'finance_general_ledger']) {
        await db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [scope]);
      }
    }
    for (const entry of payload.entries) {
      const depreciationRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_depreciations' AND record_key = ? ORDER BY updated_at DESC LIMIT 1").get(entry.depreciationKey);
      const depreciation = publicCollectionRecord(depreciationRow);
      if (!depreciation) throw new HttpError(404, `Không tìm thấy hồ sơ khấu hao ${entry.depreciationKey}.`);
      if (depreciation.status !== 'Đang trích khấu hao') throw new HttpError(422, `Tài sản ${depreciation.assetCode} không ở trạng thái có thể ghi khấu hao.`);
      const assetRows = depreciation.assetKey
        ? [await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items' AND record_key = ? ORDER BY updated_at DESC LIMIT 1").get(depreciation.assetKey)].filter(Boolean)
        : await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items' AND LOWER(json_extract(payload_json, '$.code')) = LOWER(?) ORDER BY updated_at DESC").all(depreciation.assetCode);
      if (assetRows.length !== 1) throw new HttpError(409, `Không xác định duy nhất tài sản gốc ${depreciation.assetCode}.`);
      const assetRow = assetRows[0];
      const asset = publicCollectionRecord(assetRow);
      if (!asset || !['Đang sử dụng', 'Trong kho', 'Đang sửa chữa'].includes(asset.status)) {
        throw new HttpError(422, `Tài sản ${depreciation.assetCode} đã thanh lý hoặc đang chờ thanh lý.`);
      }
      const originalCost = optionalAmount(depreciation.originalCost, 'Nguyên giá khấu hao');
      const residualValue = optionalAmount(depreciation.residualValue, 'Giá trị thu hồi');
      const lifeMonths = Number(depreciation.lifeMonths);
      const depreciatedMonths = Number(depreciation.depreciatedMonths || 0);
      const method = oneOf(depreciation.depreciationMethod, 'Phương pháp khấu hao', ['Đường thẳng', 'Số dư giảm dần có điều chỉnh', 'Theo sản lượng / Công suất']);
      const inventoryCost = optionalAmount(asset.originalPrice, 'Nguyên giá danh mục');
      const inventoryAccumulated = optionalAmount(asset.accumulatedDepreciation, 'Hao mòn lũy kế danh mục');
      if (inventoryCost !== originalCost || inventoryAccumulated !== Number(depreciation.accumulatedDeprec || 0)) {
        throw new HttpError(409, `Số dư danh mục tài sản ${depreciation.assetCode} đã thay đổi; cần đối chiếu trước khi ghi kỳ.`);
      }
      const expectedBookValue = originalCost - inventoryAccumulated;
      if (asset.netBookValue !== undefined && optionalAmount(asset.netBookValue, 'Giá trị còn lại danh mục') !== expectedBookValue) {
        throw new HttpError(409, `Giá trị còn lại của ${depreciation.assetCode} không khớp sổ khấu hao.`);
      }
      const index = depreciatedMonths;
      const previousProduction = depreciation.productionByPeriod || {};
      if (String(depreciation.lastRunDate || '').slice(0, 7) === period || Object.hasOwn(previousProduction, period)) {
        throw new HttpError(409, `Tài sản ${depreciation.assetCode} đã ghi nhận kỳ ${period}.`);
      }
      const beforeSchedule = buildAssetDepreciationSchedule({
        originalCost, residualValue, lifeMonths, startDate: depreciation.startDate, depreciatedMonths: index,
        method, productionCapacity: depreciation.productionCapacity, productionByPeriod: previousProduction,
      });
      const openingAccumulated = index > 0 ? beforeSchedule[index - 1]?.accumulatedAmount : 0;
      if (Math.abs(Number(openingAccumulated || 0) - Number(depreciation.accumulatedDeprec || 0)) > 1) {
        throw new HttpError(409, `Số lũy kế đã lưu của ${depreciation.assetCode} không khớp lịch.`);
      }
      const currentRow = beforeSchedule[index];
      if (!currentRow || currentRow.period !== period) {
        throw new HttpError(422, `Tài sản ${depreciation.assetCode} chưa đến kỳ khấu hao.`);
      }
      const productionByPeriod = { ...previousProduction };
      let productionUnits;
      if (method === 'Theo sản lượng / Công suất') {
        productionUnits = requiredAmount(entry.productionUnits, 'Sản lượng kỳ');
        const used = Object.values(previousProduction).reduce((sum, quantity) => sum + Number(quantity || 0), 0);
        if (used + productionUnits > Number(depreciation.productionCapacity)) throw new HttpError(422, `Sản lượng vượt công suất còn lại của ${depreciation.assetCode}.`);
        productionByPeriod[period] = productionUnits;
      } else if (entry.productionUnits !== undefined) {
        throw new HttpError(422, 'Không nhận sản lượng cho phương pháp khấu hao theo thời gian.');
      }
      const schedule = buildAssetDepreciationSchedule({
        originalCost, residualValue, lifeMonths, startDate: depreciation.startDate, depreciatedMonths: index,
        method, productionCapacity: depreciation.productionCapacity, productionByPeriod,
      });
      const currentRowWithProduction = schedule[index];
      const amount = requiredAmount(entry.amount, 'Số khấu hao kỳ');
      if (currentRowWithProduction.monthlyAmount <= 0 || amount !== currentRowWithProduction.monthlyAmount || currentRowWithProduction.period !== period) {
        throw new HttpError(422, `Số khấu hao ${depreciation.assetCode} không khớp phương pháp và dữ liệu kỳ.`);
      }
      const nextMonths = index + 1;
      const nextSchedule = buildAssetDepreciationSchedule({
        originalCost, residualValue, lifeMonths, startDate: depreciation.startDate, depreciatedMonths: nextMonths,
        method, productionCapacity: depreciation.productionCapacity, productionByPeriod,
      });
      const finished = nextMonths >= lifeMonths || currentRowWithProduction.remainingAmount <= residualValue;
      const sourceReference = `asset-depreciation:${period}:${depreciation.key}`;
      const existingEntry = await db.prepare(`SELECT record_key FROM collection_records WHERE scope = 'finance_general_ledger'
        AND (record_key = ? OR json_extract(payload_json, '$.sourceReference') = ?) LIMIT 1`).get(sourceReference, sourceReference);
      if (existingEntry) throw new HttpError(409, `Bút toán khấu hao ${depreciation.assetCode} kỳ ${period} đã tồn tại.`);
      const nextDepreciation = {
        ...depreciation,
        assetKey: asset.key,
        productionByPeriod,
        depreciatedMonths: nextMonths,
        monthlyDeprec: nextSchedule[nextMonths]?.monthlyAmount ?? currentRowWithProduction.monthlyAmount,
        yearlyDeprec: nextSchedule.filter((row) => row.period.startsWith(`${period.slice(0, 4)}-`)).reduce((sum, row) => sum + row.monthlyAmount, 0),
        accumulatedDeprec: currentRowWithProduction.accumulatedAmount,
        netBookValue: currentRowWithProduction.remainingAmount,
        lastRunDate: businessDate,
        status: finished ? 'Đã trích hết 100%' : 'Đang trích khấu hao',
        scheduleList: nextSchedule,
      };
      const nextAsset = {
        ...asset,
        accumulatedDepreciation: currentRowWithProduction.accumulatedAmount,
        netBookValue: currentRowWithProduction.remainingAmount,
        history: [...(Array.isArray(asset.history) ? asset.history : []), {
          key: randomUUID(), date: businessDate, action: 'Ghi nhận khấu hao tài sản', actor: actor.name,
          note: `Kỳ ${period} · ${depreciation.assetCode} · ${amount.toLocaleString('vi-VN')} VNĐ`,
        }],
      };
      const depreciationUpdate = await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ? AND payload_json = ?')
        .run(JSON.stringify(nextDepreciation), timestamp, depreciationRow.id, depreciationRow.payload_json);
      if (!depreciationUpdate.changes) throw new HttpError(409, `Hồ sơ khấu hao ${depreciation.assetCode} vừa được thay đổi.`);
      const assetUpdate = await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ? AND payload_json = ?')
        .run(JSON.stringify(nextAsset), timestamp, assetRow.id, assetRow.payload_json);
      if (!assetUpdate.changes) throw new HttpError(409, `Danh mục tài sản ${depreciation.assetCode} vừa được thay đổi.`);
      const accountCode = (value, prefix) => String(value || '').replace(new RegExp(`^${prefix}\\s*`, 'i'), '').split(' (')[0].trim();
      const ledgerEntry = {
        key: sourceReference,
        voucherCode: `KH-${period.replace('-', '')}-${String(updated.length + 1).padStart(3, '0')}`,
        entryDate: businessDate,
        description: `Khấu hao ${depreciation.assetCode} - ${depreciation.assetName} kỳ ${period}`,
        debitAccount: accountCode(depreciation.costAccount, 'Nợ'),
        creditAccount: accountCode(depreciation.assetAccount, 'Có'),
        amount,
        author: actor.name,
        status: 'Đã ghi sổ cái',
        sourceModule: 'asset_depreciation',
        sourceReference,
      };
      await db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
        VALUES (?, 'finance_general_ledger', ?, ?, ?, ?, ?)`)
        .run(randomUUID(), sourceReference, actor.id, JSON.stringify(ledgerEntry), timestamp, timestamp);
      await recordAuditEvent(actor.id, 'post_depreciation', 'asset_depreciations', depreciation.key, { period, assetKey: asset.key, amount, sourceReference });
      totalAmount += amount;
      updated.push(nextDepreciation);
    }
  });
  return { period, count: updated.length, totalAmount, records: updated };
}

function inventoryBusinessDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function inventoryQuantity(value, field, allowZero = false) {
  const quantity = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isFinite(quantity) || quantity < (allowZero ? 0 : 0.001) || quantity > 1_000_000_000 || Math.round(quantity * 1000) !== quantity * 1000) {
    throw new HttpError(422, `${field} phải có tối đa 3 chữ số thập phân${allowZero ? ' và không âm' : ' và lớn hơn 0'}.`);
  }
  return quantity;
}

function inventoryLots(product, date) {
  if (Array.isArray(product.lots) && (product.lots.length > 0 || Number(product.stockQty || 0) <= 0)) return product.lots.map((lot) => ({
    lotCode: String(lot.lotCode || ''), warehouse: String(lot.warehouse || product.warehouse || 'Kho chính'),
    quantity: inventoryQuantity(lot.quantity ?? 0, 'Số lượng lô', true), expiryDate: String(lot.expiryDate || ''),
    receivedDate: String(lot.receivedDate || date), receivedAt: String(lot.receivedAt || lot.receivedDate || date), unitCost: optionalAmount(lot.unitCost ?? product.unitPrice, 'Đơn giá lô'),
  })).filter((lot) => lot.quantity > 0);
  const quantity = inventoryQuantity(product.stockQty ?? 0, 'Số lượng tồn', true);
  return quantity > 0 ? [{
    lotCode: product.lotManaged ? 'LEGACY' : '', warehouse: String(product.warehouse || 'Kho chính'), quantity,
    expiryDate: '', receivedDate: String(product.updatedAt || product.createdAt || date).slice(0, 10), receivedAt: String(product.updatedAt || product.createdAt || date),
    unitCost: optionalAmount(product.unitPrice ?? 0, 'Đơn giá vốn'),
  }] : [];
}

function inventorySummary(product, lots, actor, timestamp) {
  const stockQty = Math.round(lots.reduce((sum, lot) => sum + lot.quantity, 0) * 1000) / 1000;
  const byWarehouse = new Map();
  for (const lot of lots) byWarehouse.set(lot.warehouse, (byWarehouse.get(lot.warehouse) || 0) + lot.quantity);
  const unitPrice = stockQty ? Math.round(lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0) / stockQty) : Number(product.unitPrice) || 0;
  return {
    ...product, lots: lots.filter((lot) => lot.quantity > 0), stockQty, unitPrice,
    stockByWarehouse: [...byWarehouse.entries()].sort(([a], [b]) => a.localeCompare(b, 'vi')).map(([warehouse, quantity]) => ({ warehouse, quantity })),
    status: stockQty < Number(product.minQty || 0) ? 'Sắp hết hàng' : Number(product.maxQty || 0) && stockQty > Number(product.maxQty) ? 'Vượt mức tối đa' : 'Đủ tồn kho',
    updatedAt: timestamp, updatedBy: actor.name, updatedById: actor.id,
  };
}

async function createInventoryTransaction(actor, input) {
  const type = oneOf(input?.type, 'Loại giao dịch kho', ['Nhập kho', 'Xuất kho', 'Điều chuyển', 'Kiểm kê', 'Giao hàng', 'Lắp ráp', 'Tháo dỡ']);
  const transactionCode = requiredText(input.transactionCode, 'Mã giao dịch', 100).toLocaleUpperCase('vi-VN');
  const transactionDate = requiredIsoDate(input.transactionDate, 'Ngày giao dịch');
  const linesInput = input.lines;
  if (!Array.isArray(linesInput) || linesInput.length < 1 || linesInput.length > 100) throw new HttpError(422, 'Giao dịch cần từ 1 đến 100 dòng hàng hóa.');
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const timestamp = now();
  let transaction;
  let replayed = false;
  await db.transaction(async () => {
    if (db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('finance_inventory'))");
    const duplicate = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_inventory_transactions' AND record_key = ? ORDER BY created_at LIMIT 1").get(transactionCode);
    if (duplicate) {
      transaction = publicCollectionRecord(duplicate);
      if (transaction.requestFingerprint !== fingerprint) throw new HttpError(409, 'Mã giao dịch đã được dùng cho nội dung khác.');
      replayed = true;
      return;
    }
    const rows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_inventory'").all();
    const items = new Map(rows.map((row) => {
      const product = publicCollectionRecord(row);
      return [row.record_key, { row, product, lots: inventoryLots(product, transactionDate) }];
    }));
    const changed = new Set();
    const movements = [];
    const settingsRow = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'finance_inventory_settings' AND record_key = 'global' LIMIT 1").get();
    const issueSettings = settingsRow ? parseJsonObject(settingsRow.payload_json) : {};
    const resolveItem = (line) => {
      const lookup = String(line?.productKey || line?.sku || line?.barcode || '').trim().toLocaleLowerCase('vi-VN');
      if (!lookup) throw new HttpError(422, 'Chọn mặt hàng trong danh mục kho.');
      const matches = [...items.entries()].filter(([key, item]) => [key, item.product.sku, item.product.barcode].some((value) => String(value || '').trim().toLocaleLowerCase('vi-VN') === lookup));
      if (!matches.length) throw new HttpError(404, `Không tìm thấy mặt hàng ${lookup}.`);
      if (matches.length > 1) throw new HttpError(409, `Mã mặt hàng ${lookup} bị trùng.`);
      return matches[0];
    };
    const addStock = (item, warehouse, quantity, source, unitCost, preserveReceivedDate = false) => {
      const lotCode = item.product.lotManaged ? requiredText(source.lotCode, 'Số lô', 80) : optionalText(source.lotCode, 'Số lô', 80);
      const expiryDate = source.expiryDate ? requiredIsoDate(source.expiryDate, 'Hạn sử dụng') : '';
      if (item.product.lotManaged && !expiryDate) throw new HttpError(422, 'Mặt hàng quản lý số lô cần hạn sử dụng cho mỗi lô nhập.');
      const lot = item.lots.find((entry) => entry.warehouse === warehouse && entry.lotCode === lotCode);
      if (lot) {
        if (lot.expiryDate !== expiryDate) throw new HttpError(409, `Số lô ${lotCode || '(không mã)'} có hạn sử dụng khác.`);
        const oldQty = lot.quantity;
        lot.quantity = Math.round((lot.quantity + quantity) * 1000) / 1000;
        lot.unitCost = Math.round((oldQty * lot.unitCost + quantity * unitCost) / lot.quantity);
        if (preserveReceivedDate && source.receivedAt && source.receivedAt < lot.receivedAt) { lot.receivedAt = source.receivedAt; lot.receivedDate = source.receivedDate; }
      } else item.lots.push({
        lotCode, warehouse, quantity, expiryDate,
        receivedDate: preserveReceivedDate ? source.receivedDate || transactionDate : transactionDate,
        receivedAt: preserveReceivedDate ? source.receivedAt || source.receivedDate || timestamp : timestamp,
        unitCost,
      });
      changed.add(item.product.key);
    };
    const removeStock = (item, warehouse, quantity, lotCode = '') => {
      const eligible = item.lots.filter((lot) => lot.warehouse === warehouse && lot.quantity > 0 && (!lotCode || lot.lotCode.toLocaleLowerCase('vi-VN') === lotCode.toLocaleLowerCase('vi-VN')));
      const method = issueSettings.issueMethodMode === 'Dùng chung' ? issueSettings.issueMethod || 'FIFO' : item.product.issueMethod || 'FIFO';
      eligible.sort((a, b) => method === 'LIFO'
        ? String(b.receivedAt || b.receivedDate).localeCompare(String(a.receivedAt || a.receivedDate)) || b.lotCode.localeCompare(a.lotCode)
        : String(a.receivedAt || a.receivedDate).localeCompare(String(b.receivedAt || b.receivedDate)) || a.lotCode.localeCompare(b.lotCode));
      const available = eligible.reduce((sum, lot) => sum + lot.quantity, 0);
      if (available + 0.0001 < quantity) throw new HttpError(409, `${item.product.sku} tại ${warehouse} không đủ tồn. Còn ${available} ${item.product.unit}.`);
      const averageIssueCost = method === 'Bình quân' ? Math.round(Number(item.product.unitPrice) || 0) : null;
      let remaining = quantity;
      const allocations = [];
      for (const lot of eligible) {
        if (remaining <= 0) break;
        const moved = Math.min(remaining, lot.quantity);
        lot.quantity = Math.round((lot.quantity - moved) * 1000) / 1000;
        remaining = Math.round((remaining - moved) * 1000) / 1000;
        allocations.push({ lotCode: lot.lotCode, expiryDate: lot.expiryDate, quantity: moved, unitCost: averageIssueCost ?? lot.unitCost, receivedDate: lot.receivedDate, receivedAt: lot.receivedAt });
      }
      changed.add(item.product.key);
      return allocations;
    };
    const seen = new Set();
    const assemblyLines = ['Lắp ráp', 'Tháo dỡ'].includes(type);
    if (assemblyLines && !['Thành phần', 'Thành phẩm'].every((direction) => linesInput.some((line) => line.direction === direction))) {
      throw new HttpError(422, 'Lắp ráp / tháo dỡ cần có cả hàng xuất và hàng nhận.');
    }
    const isAssemblyOutput = (line) => type === 'Lắp ráp' ? line.direction === 'Thành phẩm' : line.direction === 'Thành phần';
    const orderedLines = assemblyLines
      ? [...linesInput].sort((a, b) => Number(isAssemblyOutput(a)) - Number(isAssemblyOutput(b)))
      : linesInput;
    let assemblyCost = 0;
    const assemblyOutputQty = assemblyLines
      ? linesInput.filter(isAssemblyOutput).reduce((sum, line) => sum + inventoryQuantity(line.quantity, 'Số lượng thành phẩm'), 0)
      : 0;
    for (const line of orderedLines) {
      const [key, item] = resolveItem(line);
      const assemblyOutput = assemblyLines && isAssemblyOutput(line);
      if (assemblyLines && !['Thành phần', 'Thành phẩm'].includes(line.direction)) throw new HttpError(422, 'Chiều luân chuyển của dòng lắp ráp không hợp lệ.');
      const isReceipt = type === 'Nhập kho' || assemblyOutput;
      const warehouse = requiredText(line.warehouse || (isReceipt ? input.destinationWarehouse : input.sourceWarehouse), isReceipt ? 'Kho nhận' : 'Kho xuất', 160);
      const lotCode = optionalText(line.lotCode, 'Số lô', 80);
      const identity = `${key}\u0000${warehouse}\u0000${lotCode.toLocaleLowerCase('vi-VN')}\u0000${line.direction || ''}`;
      if (seen.has(identity)) throw new HttpError(422, 'Không ghép trùng mặt hàng, kho và lô trong cùng giao dịch.');
      seen.add(identity);
      if (isReceipt) {
        const quantity = inventoryQuantity(line.quantity, 'Số lượng nhập');
        const unitCost = assemblyLines
          ? Math.round(assemblyCost / Math.max(assemblyOutputQty, 1))
          : optionalAmount(line.unitCost ?? item.product.unitPrice, 'Đơn giá nhập');
        addStock(item, warehouse, quantity, line, unitCost);
        movements.push({ itemKey: key, sku: item.product.sku, name: item.product.name, unit: item.product.unit, operation: type, direction: assemblyLines ? line.direction : '', warehouse, lotCode, expiryDate: line.expiryDate || '', quantity, unitCost, amount: quantity * unitCost });
      } else if (type === 'Kiểm kê') {
        const actualQty = inventoryQuantity(line.actualQty, 'Số lượng thực tế', true);
        const trackedLot = item.product.lotManaged ? requiredText(line.lotCode, 'Số lô kiểm kê', 80) : lotCode;
        const physicalLots = item.lots.filter((entry) => entry.warehouse === warehouse && (!item.product.lotManaged || entry.lotCode === trackedLot));
        const bookQty = physicalLots.reduce((sum, entry) => sum + entry.quantity, 0);
        const difference = Math.round((actualQty - bookQty) * 1000) / 1000;
        if (difference > 0) addStock(item, warehouse, difference, line, optionalAmount(line.unitCost ?? item.product.unitPrice, 'Đơn giá kiểm kê'));
        if (difference < 0) removeStock(item, warehouse, -difference, trackedLot);
        movements.push({ itemKey: key, sku: item.product.sku, name: item.product.name, unit: item.product.unit, operation: type, warehouse, lotCode: trackedLot, bookQty, actualQty, difference });
      } else {
        const quantity = inventoryQuantity(line.quantity, type === 'Điều chuyển' ? 'Số lượng điều chuyển' : 'Số lượng xuất');
        const fromWarehouse = requiredText(line.fromWarehouse || input.sourceWarehouse || warehouse, 'Kho xuất', 160);
        const allocations = removeStock(item, fromWarehouse, quantity, lotCode);
        if (assemblyLines) assemblyCost += allocations.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
        if (type === 'Điều chuyển') {
          const toWarehouse = requiredText(line.toWarehouse || input.destinationWarehouse, 'Kho nhận', 160);
          if (fromWarehouse === toWarehouse) throw new HttpError(422, 'Kho xuất và kho nhận phải khác nhau.');
          for (const allocation of allocations) addStock(item, toWarehouse, allocation.quantity, allocation, allocation.unitCost, true);
        }
        if (type === 'Giao hàng' && allocations.some((lot) => lot.expiryDate && lot.expiryDate < inventoryBusinessDate())) throw new HttpError(409, `${item.product.sku} có lô đã hết hạn và không thể giao.`);
        movements.push({ itemKey: key, sku: item.product.sku, name: item.product.name, unit: item.product.unit, operation: type, direction: assemblyLines ? line.direction : '', warehouse: fromWarehouse, destinationWarehouse: type === 'Điều chuyển' ? line.toWarehouse || input.destinationWarehouse : '', lotCode, quantity, amount: allocations.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0), allocatedLots: allocations });
      }
    }
    if (['Xuất kho', 'Giao hàng'].includes(type)) requiredText(input.reason || input.recipient, 'Lý do xuất / người nhận', 255);
    if (assemblyLines) requiredText(input.reason, 'Lý do lắp ráp / tháo dỡ', 255);
    if (type === 'Điều chuyển' && !input.destinationWarehouse && linesInput.some((line) => !line.toWarehouse)) throw new HttpError(422, 'Chọn kho nhận cho phiếu điều chuyển.');
    if (type === 'Giao hàng') requiredText(input.deliveryAddress, 'Địa chỉ giao hàng', 500);
    for (const key of changed) {
      const item = items.get(key);
      const updated = inventorySummary(item.product, item.lots, actor, timestamp);
      await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updated), timestamp, item.row.id);
    }
    const totalQuantity = Math.round(movements.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0) * 1000) / 1000;
    const amountMovements = assemblyLines ? movements.filter((line) => line.direction === (type === 'Lắp ráp' ? 'Thành phần' : 'Thành phẩm')) : movements;
    const totalAmount = Math.round(amountMovements.reduce((sum, line) => sum + (Number(line.amount) || 0), 0));
    transaction = {
      key: transactionCode, transactionCode, type, transactionDate, sourceWarehouse: input.sourceWarehouse || '', destinationWarehouse: input.destinationWarehouse || '',
      reason: optionalText(input.reason || input.recipient, 'Lý do / người nhận', 255), recipient: optionalText(input.recipient, 'Người nhận', 255),
      deliveryAddress: optionalText(input.deliveryAddress, 'Địa chỉ giao hàng', 500), carrier: optionalText(input.carrier, 'Đơn vị vận chuyển', 160),
      trackingNumber: optionalText(input.trackingNumber, 'Mã vận đơn', 120), shipmentStatus: type === 'Giao hàng' ? 'Chờ giao' : '', shipmentHistory: [],
      lines: movements, totalQuantity, totalAmount, notes: optionalText(input.notes, 'Ghi chú', 2_000),
      requestFingerprint: fingerprint, status: 'Đã ghi nhận', createdAt: timestamp, createdBy: actor.name, createdById: actor.id,
    };
    await db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
      VALUES (?, 'finance_inventory_transactions', ?, ?, ?, ?, ?)`).run(randomUUID(), transactionCode, actor.id, JSON.stringify(transaction), timestamp, timestamp);
    await recordAuditEvent(actor.id, 'inventory_transaction', 'finance_inventory_transactions', transactionCode, { type, totalQuantity, totalAmount });
  });
  return { transaction, replayed };
}

async function receiveInventoryShipmentReturn(actor, shipmentCode, input) {
  const returnCode = requiredText(input.returnCode, 'Mã phiếu nhận trả', 100).toLocaleUpperCase('vi-VN');
  const receivedDate = requiredIsoDate(input.receivedDate, 'Ngày nhận hàng về');
  const linesInput = input.lines;
  if (!Array.isArray(linesInput) || linesInput.length < 1 || linesInput.length > 100) {
    throw new HttpError(422, 'Chọn ít nhất một dòng hàng để nhận trả.');
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const timestamp = now();
  let result;
  await db.transaction(async () => {
    if (db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('finance_inventory'))");
    const duplicate = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_inventory_transactions' AND record_key = ? ORDER BY created_at LIMIT 1").get(returnCode);
    if (duplicate) {
      const receipt = publicCollectionRecord(duplicate);
      if (receipt.shipmentReturnOf !== shipmentCode || receipt.requestFingerprint !== fingerprint) {
        throw new HttpError(409, 'Mã phiếu nhận trả đã được dùng cho nội dung khác.');
      }
      const parentRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_inventory_transactions' AND record_key = ? ORDER BY created_at LIMIT 1").get(shipmentCode);
      result = { receipt, transaction: parentRow ? publicCollectionRecord(parentRow) : null, replayed: true };
      return;
    }

    const shipmentRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_inventory_transactions' AND record_key = ? ORDER BY created_at LIMIT 1").get(shipmentCode);
    if (!shipmentRow) throw new HttpError(404, 'Không tìm thấy phiếu giao hàng.');
    const shipment = publicCollectionRecord(shipmentRow);
    if (shipment.type !== 'Giao hàng') throw new HttpError(422, 'Giao dịch này không phải phiếu giao hàng.');
    if (shipment.shipmentStatus !== 'Giao thất bại') throw new HttpError(409, 'Chỉ nhận hàng về sau khi phiếu giao hàng được xác nhận thất bại.');
    if (returnCode === shipmentCode) throw new HttpError(409, 'Mã phiếu nhận trả phải khác mã phiếu giao hàng.');
    if (!Array.isArray(shipment.lines) || !shipment.lines.length) throw new HttpError(409, 'Phiếu giao hàng không có dòng hàng hợp lệ để đối chiếu.');

    const previousReturns = Array.isArray(shipment.shipmentReturns) ? shipment.shipmentReturns : [];
    const seenLines = new Set();
    const productRows = new Map();
    const changed = new Set();
    const receiptLines = [];
    const movements = [];
    for (const entry of linesInput) {
      const lineIndex = Number(entry?.lineIndex);
      if (!Number.isSafeInteger(lineIndex) || lineIndex < 0 || lineIndex >= shipment.lines.length || seenLines.has(lineIndex)) {
        throw new HttpError(422, 'Dòng hàng nhận trả không hợp lệ hoặc bị lặp.');
      }
      seenLines.add(lineIndex);
      const requestedQty = inventoryQuantity(entry.quantity, 'Số lượng nhận lại');
      const shipmentLine = shipment.lines[lineIndex];
      if (!shipmentLine.itemKey) throw new HttpError(409, `Dòng ${shipmentLine.sku || lineIndex + 1} không còn mã mặt hàng để cộng tồn.`);
      let item = productRows.get(shipmentLine.itemKey);
      if (!item) {
        const productRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_inventory' AND record_key = ? ORDER BY created_at LIMIT 1").get(shipmentLine.itemKey);
        if (!productRow) throw new HttpError(404, `Không tìm thấy mặt hàng ${shipmentLine.sku || shipmentLine.itemKey}.`);
        const product = publicCollectionRecord(productRow);
        item = { row: productRow, product, lots: inventoryLots(product, receivedDate) };
        productRows.set(shipmentLine.itemKey, item);
      }

      const originLots = Array.isArray(shipmentLine.allocatedLots) && shipmentLine.allocatedLots.length
        ? shipmentLine.allocatedLots
        : [{
          lotCode: shipmentLine.lotCode || (item.product.lotManaged ? 'LEGACY' : ''),
          expiryDate: shipmentLine.expiryDate || '', quantity: shipmentLine.quantity,
          unitCost: Number(shipmentLine.quantity) > 0 ? Number(shipmentLine.amount || 0) / Number(shipmentLine.quantity) : item.product.unitPrice,
          receivedDate: shipment.transactionDate, receivedAt: shipment.transactionDate,
        }];
      const originalQty = inventoryQuantity(shipmentLine.quantity, 'Số lượng giao ban đầu');
      const allocatedQty = originLots.reduce((sum, lot) => sum + inventoryQuantity(lot.quantity, 'Số lượng theo lô'), 0);
      if (Math.abs(allocatedQty - originalQty) > 0.001) throw new HttpError(409, `Không đủ lịch sử lô của ${shipmentLine.sku} để nhận trả an toàn.`);

      const returnedByOriginLot = new Map();
      let returnedForLine = 0;
      for (const receipt of previousReturns) {
        for (const returnedLine of Array.isArray(receipt.lines) ? receipt.lines : []) {
          if (Number(returnedLine.lineIndex) !== lineIndex) continue;
          returnedForLine += Number(returnedLine.quantity) || 0;
          for (const returnedLot of Array.isArray(returnedLine.allocatedLots) ? returnedLine.allocatedLots : []) {
            const originIndex = Number(returnedLot.originLotIndex);
            if (!Number.isSafeInteger(originIndex) || originIndex < 0) continue;
            returnedByOriginLot.set(originIndex, (returnedByOriginLot.get(originIndex) || 0) + Number(returnedLot.quantity || 0));
          }
        }
      }
      const outstandingQty = Math.round((originalQty - returnedForLine) * 1000) / 1000;
      if (requestedQty > outstandingQty + 0.0001) throw new HttpError(409, `${shipmentLine.sku} chỉ còn ${Math.max(0, outstandingQty)} ${item.product.unit} chưa nhận lại.`);

      let remaining = requestedQty;
      const returnedLots = [];
      for (let originLotIndex = 0; originLotIndex < originLots.length && remaining > 0; originLotIndex += 1) {
        const sourceLot = originLots[originLotIndex];
        const available = Math.round((Number(sourceLot.quantity) - (returnedByOriginLot.get(originLotIndex) || 0)) * 1000) / 1000;
        if (available <= 0) continue;
        const quantity = Math.min(remaining, available);
        const warehouse = requiredText(shipmentLine.warehouse || shipment.sourceWarehouse || 'Kho chính', 'Kho nhận hàng về', 160);
        const lotCode = item.product.lotManaged
          ? requiredText(sourceLot.lotCode, 'Số lô nhận lại', 80)
          : optionalText(sourceLot.lotCode, 'Số lô nhận lại', 80);
        const expiryDate = sourceLot.expiryDate ? requiredIsoDate(sourceLot.expiryDate, 'Hạn sử dụng lô nhận lại') : '';
        if (item.product.lotManaged && !expiryDate) throw new HttpError(409, `${shipmentLine.sku} không có hạn sử dụng trong lịch sử lô giao; cần đối chiếu thủ công.`);
        const unitCost = optionalAmount(sourceLot.unitCost ?? item.product.unitPrice, 'Giá vốn lô nhận lại');
        const existingLot = item.lots.find((lot) => lot.warehouse === warehouse && lot.lotCode === lotCode);
        if (existingLot) {
          if (existingLot.expiryDate !== expiryDate) throw new HttpError(409, `Số lô ${lotCode || '(không mã)'} có hạn sử dụng khác tại ${warehouse}.`);
          const nextQty = existingLot.quantity + quantity;
          existingLot.unitCost = Math.round((existingLot.quantity * existingLot.unitCost + quantity * unitCost) / nextQty);
          existingLot.quantity = Math.round(nextQty * 1000) / 1000;
          const sourceReceivedAt = String(sourceLot.receivedAt || sourceLot.receivedDate || shipment.transactionDate);
          if (sourceReceivedAt < String(existingLot.receivedAt || existingLot.receivedDate || receivedDate)) {
            existingLot.receivedAt = sourceReceivedAt;
            existingLot.receivedDate = String(sourceLot.receivedDate || sourceReceivedAt.slice(0, 10));
          }
        } else {
          item.lots.push({
            lotCode, warehouse, quantity, expiryDate, unitCost,
            receivedDate: String(sourceLot.receivedDate || shipment.transactionDate),
            receivedAt: String(sourceLot.receivedAt || sourceLot.receivedDate || shipment.transactionDate),
          });
        }
        changed.add(shipmentLine.itemKey);
        returnedLots.push({
          originLotIndex, lotCode, warehouse, expiryDate, quantity, unitCost,
          receivedDate: String(sourceLot.receivedDate || shipment.transactionDate),
          receivedAt: String(sourceLot.receivedAt || sourceLot.receivedDate || shipment.transactionDate),
        });
        remaining = Math.round((remaining - quantity) * 1000) / 1000;
      }
      if (remaining > 0.0001) throw new HttpError(409, `${shipmentLine.sku} không đủ số lượng theo lô để nhận trả.`);
      const amount = Math.round(returnedLots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0));
      const lineAmount = Math.round(returnedLots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0) * 100) / 100;
      const receiptLine = { lineIndex, itemKey: shipmentLine.itemKey, sku: shipmentLine.sku, name: shipmentLine.name, unit: item.product.unit, quantity: requestedQty, amount: lineAmount, allocatedLots: returnedLots };
      receiptLines.push(receiptLine);
      movements.push({
        itemKey: shipmentLine.itemKey, sku: shipmentLine.sku, name: shipmentLine.name, unit: item.product.unit,
        operation: 'Nhập kho', warehouse: returnedLots[0]?.warehouse || shipmentLine.warehouse || shipment.sourceWarehouse,
        lotCode: returnedLots.length === 1 ? returnedLots[0].lotCode : '', quantity: requestedQty,
        unitCost: requestedQty ? Math.round(amount / requestedQty) : 0, amount: lineAmount,
        allocatedLots: returnedLots, shipmentCode, shipmentLineIndex: lineIndex,
      });
    }

    const totalQuantity = Math.round(movements.reduce((sum, line) => sum + line.quantity, 0) * 1000) / 1000;
    const totalAmount = Math.round(movements.reduce((sum, line) => sum + line.amount, 0));
    const notes = optionalText(input.notes, 'Ghi chú nhận trả', 2_000);
    const receipt = {
      key: returnCode, transactionCode: returnCode, type: 'Nhập kho', transactionDate: receivedDate,
      destinationWarehouse: shipment.sourceWarehouse || '', reason: `Nhận hàng giao thất bại ${shipmentCode}`,
      notes, lines: movements, totalQuantity, totalAmount, status: 'Đã ghi nhận',
      shipmentReturnOf: shipmentCode, shipmentReturnFingerprint: fingerprint,
      requestFingerprint: fingerprint, createdAt: timestamp, createdBy: actor.name, createdById: actor.id,
    };
    const returnRecord = {
      returnCode, transactionDate: receivedDate, actor: actor.name, actorId: actor.id,
      notes, lines: receiptLines, totalQuantity, totalAmount,
    };
    for (const key of changed) {
      const item = productRows.get(key);
      const updated = inventorySummary(item.product, item.lots, actor, timestamp);
      await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updated), timestamp, item.row.id);
    }
    const updatedShipment = { ...shipment, shipmentReturns: [...previousReturns, returnRecord] };
    await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updatedShipment), timestamp, shipmentRow.id);
    await db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
      VALUES (?, 'finance_inventory_transactions', ?, ?, ?, ?, ?)`).run(randomUUID(), returnCode, actor.id, JSON.stringify(receipt), timestamp, timestamp);
    await recordAuditEvent(actor.id, 'inventory_shipment_return', 'finance_inventory_transactions', shipmentCode, { returnCode, totalQuantity, totalAmount });
    await recordAuditEvent(actor.id, 'inventory_transaction', 'finance_inventory_transactions', returnCode, { type: 'Nhập kho', totalQuantity, totalAmount, shipmentCode });
    result = { receipt, transaction: updatedShipment, replayed: false };
  });
  return result;
}

async function handleRequest(request, response) {
  allowOrigin(request, response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Cache-Control': 'no-store' });
    response.end();
    return;
  }

  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  let pathname = url.pathname;
  if (request.method === 'GET' && (pathname === '/health' || pathname === '/api/health' || pathname === '/api/v1/health')) {
    sendJson(response, 200, { status: 'ok', database: 'connected' });
    return;
  }

  let resource = pathname;
  if (resource.startsWith(API_PREFIX)) {
    resource = resource.slice(API_PREFIX.length);
  } else if (resource.startsWith('/api')) {
    resource = resource.slice('/api'.length);
  }
  if (!resource.startsWith('/')) {
    resource = '/' + resource;
  }
  if (resource.length > 1 && resource.endsWith('/')) {
    resource = resource.slice(0, -1);
  }
  if (resource === '/assets/depreciation-runs' && request.method === 'POST') {
    sendJson(response, 200, await runAssetDepreciationBatch(request));
    return;
  }

  if (request.method === 'POST' && resource === '/auth/login') {
    if ((await getGoogleConfig()).enforceGoogleLogin === '100') throw new HttpError(403, 'Hệ thống yêu cầu đăng nhập bằng Google.');
    const payload = await readJson(request);
    const rawAccount = String(payload.email || payload.username || '').trim().toLowerCase();
    const rawPassword = String(payload.password || '');
    if (!rawAccount || !rawPassword) {
      throw new HttpError(422, 'Vui lòng nhập tài khoản/email và mật khẩu.');
    }

    const email = rawAccount.includes('@')
      ? (rawAccount.includes('.') ? rawAccount : `${rawAccount}.com`)
      : `${rawAccount}@kiyovn.com`;

    const adminCountRow = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN'").get();
    const adminCount = Number(adminCountRow?.count || 0);

    let user = null;

    if (adminCount === 0) {
      // Khi hệ thống CHƯA CÓ TÀI KHOẢN ADMIN: Tự động lấy tài khoản đăng nhập đầu tiên làm ADMIN và tự động tạo tài khoản luôn
      const accountLower = rawAccount.toLowerCase();
      const accountNormalizedCode = accountLower.replace(/[\s-_]/g, '');

      // Kiểm tra xem đã có tài khoản nhân viên nào khớp thông tin không
      user = (await db.prepare('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1').get(accountLower))
        || (await db.prepare('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1').get(email.toLowerCase()))
        || (await db.prepare('SELECT * FROM users WHERE LOWER(employee_code) = ? LIMIT 1').get(accountLower))
        || (await db.prepare("SELECT * FROM users WHERE REPLACE(REPLACE(LOWER(employee_code), '-', ''), '_', '') = ? LIMIT 1").get(accountNormalizedCode))
        || (await db.prepare("SELECT * FROM users WHERE LOWER(email) LIKE ? LIMIT 1").get(`${accountLower}@%`))
        || (await db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(rawAccount))
        || (await db.prepare('SELECT * FROM users WHERE LOWER(name) = ? LIMIT 1').get(accountLower));

      const timestamp = now();
      const passwordHash = await hashPassword(rawPassword.trim() || rawPassword);

      await db.transaction(async () => {
        if (user) {
          // Nâng cấp tài khoản hiện có thành ADMIN tối cao và kích hoạt ngay
          await db.prepare('UPDATE users SET role = ?, is_active = 1, password_hash = ?, updated_at = ? WHERE id = ?')
            .run('ADMIN', passwordHash, timestamp, user.id);
          user = await getUserById(user.id);
          await ensureEmployeeProfile(user, {
            name: user.name,
            email: user.email,
            employeeCode: user.employee_code,
            department: 'Ban Giám Đốc',
            position: 'Tổng Quản Trị Hệ Thống',
            status: 'Chính thức',
          });
          await ensureEmployeeWorkspace(user);
        } else {
          // Tự động tạo tài khoản ADMIN mới hoàn toàn với mã nhân viên duy nhất
          const id = randomUUID();
          const name = rawAccount.includes('@')
            ? rawAccount.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
            : rawAccount.replace(/\b\w/g, (c) => c.toUpperCase());
          
          let employeeCode = 'ADMIN-001';
          let counter = 1;
          while (await db.prepare('SELECT 1 FROM users WHERE employee_code = ?').get(employeeCode)) {
            counter += 1;
            employeeCode = `ADMIN-${String(counter).padStart(3, '0')}`;
          }

          await db.prepare(`INSERT INTO users (id, email, name, employee_code, role, password_hash, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'ADMIN', ?, 1, ?, ?)`)
            .run(id, email, name || 'Quản Trị Viên', employeeCode, passwordHash, timestamp, timestamp);

          user = await getUserById(id);
          await ensureEmployeeProfile(user, {
            name: user.name,
            email: user.email,
            employeeCode: user.employee_code,
            department: 'Ban Giám Đốc',
            position: 'Tổng Quản Trị Hệ Thống',
            status: 'Chính thức',
            phone: '',
          });
          await ensureEmployeeWorkspace(user);
        }
      });
    } else {
      // Khi hệ thống ĐÃ CÓ TÀI KHOẢN: Tìm kiếm đa năng tài khoản (Email, Mã nhân viên, Tên đăng nhập, Số điện thoại)
      const accountLower = rawAccount.toLowerCase();
      const accountNormalizedCode = accountLower.replace(/[\s-_]/g, '');

      // 1. Direct email match (case-insensitive)
      user = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1').get(accountLower);

      // 2. Direct employee code match (case-insensitive)
      if (!user) {
        user = await db.prepare('SELECT * FROM users WHERE LOWER(employee_code) = ? LIMIT 1').get(accountLower);
      }

      // 3. Normalized employee code match (e.g. NV60316 matching NV-60316)
      if (!user) {
        user = await db.prepare("SELECT * FROM users WHERE REPLACE(REPLACE(LOWER(employee_code), '-', ''), '_', '') = ? LIMIT 1").get(accountNormalizedCode);
      }

      // 4. Email prefix match (e.g. user enters "tung.nh" for "tung.nh@kiyovn.vn" or "test_123" for "test_123@kiyovn.local")
      if (!user) {
        user = await db.prepare("SELECT * FROM users WHERE LOWER(email) LIKE ? LIMIT 1").get(`${accountLower}@%`);
      }

      // 5. Employee profile phone match
      if (!user) {
        const profileRow = await db.prepare(`SELECT user_id FROM employee_profiles 
          WHERE phone = ? OR REPLACE(REPLACE(phone, ' ', ''), '-', '') = ? LIMIT 1`)
          .get(rawAccount, accountNormalizedCode);
        if (profileRow?.user_id) {
          user = await getUserById(profileRow.user_id);
        }
      }

      // 6. Direct user ID match
      if (!user) {
        user = await db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').get(rawAccount);
      }

      // 7. Full name match (case-insensitive)
      if (!user) {
        user = await db.prepare('SELECT * FROM users WHERE LOWER(name) = ? LIMIT 1').get(accountLower);
      }

      if (!user) {
        throw new HttpError(401, 'Email/tài khoản hoặc mật khẩu không chính xác.');
      }

      const isValidPassword = (await verifyPassword(rawPassword, user.password_hash)) ||
                              (await verifyPassword(rawPassword.trim(), user.password_hash));
      if (!isValidPassword) {
        throw new HttpError(401, 'Email/tài khoản hoặc mật khẩu không chính xác.');
      }

      if (!user.is_active) {
        throw new HttpError(403, 'Tài khoản của bạn chưa được kích hoạt hoặc đã bị khóa. Vui lòng kích hoạt qua liên kết đã nhận hoặc liên hệ Quản trị viên.');
      }
    }

    const profile = await db.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').get(user.id);
    const token = await createToken(user, request);
    sendJson(response, 200, {
      token,
      access_token: token,
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_SECONDS,
      user: publicUser(user, profile),
    });
    return;
  }

  if (request.method === 'GET' && resource === '/auth/google/config') {
    sendJson(response, 200, await getGoogleConfig());
    return;
  }

  if (request.method === 'PUT' && resource === '/system/google-config') {
    const actor = await requireAdmin(request);
    const payload = await readJson(request);
    const current = await getGoogleConfig();
    const clientKey = requiredText(payload.clientKey, 'Google Client ID', 255);
    if (!/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(clientKey)) throw new HttpError(422, 'Google Client ID không đúng định dạng.');
    if (current.environmentOverride && clientKey !== current.clientId) throw new HttpError(422, 'Google Client ID đang được cấu hình bằng biến môi trường.');
    const allowedDomain = optionalText(payload.allowedDomain, 'Tên miền Google Workspace', 255).replace(/^@/, '').toLowerCase();
    if (allowedDomain && !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(allowedDomain)) throw new HttpError(422, 'Tên miền Google Workspace không hợp lệ.');
    if (process.env.GOOGLE_ALLOWED_DOMAIN !== undefined && allowedDomain !== process.env.GOOGLE_ALLOWED_DOMAIN.trim().toLowerCase()) throw new HttpError(422, 'Tên miền Google đang được cấu hình bằng biến môi trường.');
    const enforceGoogleLogin = oneOf(payload.enforceGoogleLogin || 'optional', 'Chế độ đăng nhập', ['100', 'optional']);
    if (enforceGoogleLogin === '100' && (request.authSession.session.method !== 'google' || clientKey !== current.clientId || allowedDomain !== current.allowedDomain)) throw new HttpError(422, 'Hãy lưu chế độ linh hoạt và đăng nhập Google thành công bằng Client ID và tên miền này trước khi bật bắt buộc.');
    const redirectUri = optionalText(payload.redirectUri, 'Authorized JavaScript origin', 2048);
    if (redirectUri) {
      let url;
      try { url = new URL(redirectUri); } catch { throw new HttpError(422, 'Origin không hợp lệ.'); }
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== redirectUri.replace(/\/$/, '')) throw new HttpError(422, 'Origin chỉ gồm giao thức, tên miền và cổng.');
    }
    await setSystemSetting('google_sso_config', JSON.stringify({ clientKey, allowedDomain, enforceGoogleLogin, redirectUri }));
    await recordAuditEvent(actor.id, 'configure_google', 'system', '', { clientId: clientKey });
    sendJson(response, 200, { config: await getGoogleConfig() });
    return;
  }

  if (request.method === 'POST' && resource === '/auth/google') {
    const payload = await readJson(request);
    const credential = requiredText(payload.credential, 'Chứng thực đăng nhập Google', 16_000);
    const googleEmail = await verifyGoogleIdentityCredential(credential);
    const identity = JSON.parse(Buffer.from(credential.split('.')[1], 'base64url').toString('utf8'));
    const googleName = optionalText(identity.name, 'Tên tài khoản Google', 160);
    const googleAvatar = /^https:\/\//i.test(String(identity.picture || '')) ? String(identity.picture).slice(0, 2000) : '';
    let user = await db.prepare('SELECT * FROM users WHERE LOWER(email) = ? LIMIT 1').get(googleEmail.toLowerCase());
    if (!user) {
      const linked = await db.prepare("SELECT user_id, details_json FROM employee_profiles WHERE LOWER(json_extract(details_json, '$.googleEmail')) = ?").all(googleEmail);
      if (linked.length === 1) user = await getUserById(linked[0].user_id);
    }

    const timestamp = now();

    if (user) {
      if (!user.is_active) throw new HttpError(403, 'Tài khoản chưa kích hoạt hoặc đã bị khóa. Vui lòng dùng liên kết kích hoạt hoặc liên hệ quản trị viên.');
      const profile = await db.prepare('SELECT details_json FROM employee_profiles WHERE user_id = ?').get(user.id);
      const details = parseJsonObject(profile?.details_json);
      if (details.googleSubject && details.googleSubject !== identity.sub) throw new HttpError(403, 'Danh tính Google không khớp tài khoản đã liên kết.');
      if (!details.googleSubject && !googleEmail.endsWith('@gmail.com') && !identity.hd && details.googleEmail !== googleEmail) {
        throw new HttpError(403, 'Vui lòng liên kết tài khoản Google qua quy trình kích hoạt trước khi đăng nhập.');
      }
    } else {
      const id = randomUUID();
      const finalName = googleName || (googleEmail.includes('@') ? googleEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Google User');
      const code = await generateEmployeeCode();
      const dummyHash = await hashPassword(randomUUID());

      await db.prepare(`INSERT INTO users (id, email, name, employee_code, role, password_hash, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'USER', ?, 1, ?, ?)`).run(id, googleEmail, finalName, code, dummyHash, timestamp, timestamp);

      user = await getUserById(id);
      await ensureEmployeeProfile(user, {
        name: finalName,
        email: googleEmail,
        employeeCode: code,
        department: '',
        position: '',
        status: 'Chính thức',
        avatar: googleAvatar || '',
      });
      await ensureEmployeeWorkspace(user);
    }

    const linkedProfile = await db.prepare('SELECT details_json FROM employee_profiles WHERE user_id = ?').get(user.id);
    const linkedDetails = { ...parseJsonObject(linkedProfile?.details_json), googleEmail, googleSubject: identity.sub, googleLinkedAt: timestamp };
    await db.prepare('UPDATE employee_profiles SET details_json = ?, updated_at = ? WHERE user_id = ?').run(JSON.stringify(linkedDetails), timestamp, user.id);

    const profile = await db.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').get(user.id);
    const token = await createToken(user, request, 'google');
    sendJson(response, 200, {
      token,
      access_token: token,
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_SECONDS,
      user: publicUser(user, profile),
    });
    return;
  }

  if (request.method === 'GET' && resource === '/auth/profile') {
    const actor = await requireUser(request);
    const profile = await db.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').get(actor.id);
    sendJson(response, 200, { user: publicUser(actor, profile) });
    return;
  }

  if (request.method === 'POST' && resource === '/auth/logout') {
    const actor = await requireUser(request);
    await db.transaction(() => revokeAuthSession(request.authSession.row, actor.id, 'Đăng xuất'));
    sendJson(response, 200, { loggedOut: true });
    return;
  }

  if (request.method === 'POST' && resource === '/admin/usage/activity') {
    const actor = await requireUser(request);
    const payload = await readJson(request, 16 * 1024);
    const application = oneOf(payload.application, 'Ứng dụng', ['finance', 'business', 'hr', 'digital_office']);
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    let recorded = false;
    await db.transaction(async () => {
      if (db.pool) await db.prepare('SELECT pg_advisory_xact_lock(hashtext(?))').get(`usage:${actor.id}:${application}`);
      const recent = await db.prepare(`SELECT id FROM audit_events
        WHERE actor_id = ? AND action = 'view_application' AND resource_scope = 'application_usage'
          AND resource_id = ? AND created_at >= ? LIMIT 1`).get(actor.id, application, cutoff);
      if (!recent) {
        await recordAuditEvent(actor.id, 'view_application', 'application_usage', application);
        recorded = true;
      }
    });
    sendJson(response, 201, { recorded });
    return;
  }

  if (request.method === 'GET' && resource === '/admin/usage') {
    await requireAdmin(request);
    const application = oneOf(url.searchParams.get('application') || 'all', 'Ứng dụng', ['all', 'finance', 'business', 'hr', 'digital_office']);
    const period = oneOf(url.searchParams.get('period') || 'this_week', 'Khoảng thời gian', ['this_week', 'this_month', 'this_quarter', 'all_time']);
    const range = getUsagePeriodRange(period);
    const [users, sessions, activities] = await Promise.all([
      db.prepare(`SELECT u.id, u.name, u.email, u.employee_code AS employeeCode, p.department
        FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id ORDER BY u.name, u.email`).all(),
      db.prepare(`SELECT owner_id, created_at, payload_json FROM collection_records
        WHERE scope = 'admin_sessions' AND created_at >= ? AND created_at < ?`).all(range.start, range.end),
      db.prepare(`SELECT actor_id, resource_scope, resource_id, COUNT(*) AS event_count, MAX(created_at) AS last_used_at
        FROM audit_events WHERE actor_id IS NOT NULL AND created_at >= ? AND created_at < ?
        GROUP BY actor_id, resource_scope, resource_id`).all(range.start, range.end),
    ]);
    const aggregateByUser = new Map();
    const aggregate = (userId) => {
      if (!aggregateByUser.has(userId)) aggregateByUser.set(userId, { loginCount: 0, operationCount: 0, lastUsedAt: '' });
      return aggregateByUser.get(userId);
    };
    for (const row of sessions) {
      const session = parseJsonObject(row.payload_json);
      if (session.kind !== 'auth_session') continue;
      const item = aggregate(row.owner_id);
      item.loginCount += 1;
      if (application === 'all') {
        const lastActive = String(session.lastActive || session.loginTime || row.created_at);
        if (lastActive >= range.start && lastActive < range.end && lastActive > item.lastUsedAt) item.lastUsedAt = lastActive;
      }
    }
    for (const row of activities) {
      const category = applicationCategoryForAudit(row.resource_scope, row.resource_id);
      if (application !== 'all' && category !== application) continue;
      const item = aggregate(row.actor_id);
      item.operationCount += Number(row.event_count) || 0;
      if (row.last_used_at > item.lastUsedAt) item.lastUsedAt = row.last_used_at;
    }
    const data = users.map(user => {
      const item = aggregateByUser.get(user.id);
      return item ? {
        userId: user.id, name: user.name, email: user.email, employeeCode: user.employeeCode || '',
        department: user.department || '', loginCount: item.loginCount, operationCount: item.operationCount,
        lastUsedAt: item.lastUsedAt,
      } : null;
    }).filter(Boolean).sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt) || left.name.localeCompare(right.name, 'vi'));
    sendJson(response, 200, {
      application, period, fromDate: range.fromDate, toDate: range.toDate,
      summary: {
        loggedInPeople: data.filter(item => item.loginCount > 0).length,
        operatedPeople: data.filter(item => item.operationCount > 0).length,
        loginCount: data.reduce((sum, item) => sum + item.loginCount, 0),
        operationCount: data.reduce((sum, item) => sum + item.operationCount, 0),
      },
      data,
    });
    return;
  }

  if (request.method === 'GET' && resource === '/admin/sessions') {
    await requireAdmin(request);
    const rows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'admin_sessions' ORDER BY created_at DESC, record_key").all();
    const data = [];
    for (const row of rows) {
      const session = publicCollectionRecord(row);
      if (session?.kind !== 'auth_session') continue;
      const user = await getUserById(row.owner_id);
      if (user) data.push(publicAuthSession(session, user, request.authSession.key));
    }
    sendJson(response, 200, { data });
    return;
  }

  const sessionRevokeMatch = /^\/admin\/sessions\/([^/]+)\/revoke$/.exec(resource);
  if (request.method === 'POST' && sessionRevokeMatch) {
    const actor = await requireAdmin(request);
    const key = requiredText(decodeURIComponent(sessionRevokeMatch[1]), 'Mã phiên', 160);
    const input = await readJson(request, 16 * 1024);
    const reason = optionalText(input.reason, 'Lý do thu hồi', 1000) || 'Quản trị viên thu hồi phiên';
    let revoked;
    await db.transaction(async () => {
      const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'admin_sessions' AND record_key = ? ORDER BY created_at LIMIT 1").get(key);
      if (!row || publicCollectionRecord(row)?.kind !== 'auth_session') throw new HttpError(404, 'Không tìm thấy phiên đăng nhập được xác thực.');
      const session = await revokeAuthSession(row, actor.id, reason);
      revoked = publicAuthSession(session, await getUserById(row.owner_id), request.authSession.key);
    });
    sendJson(response, 200, { session: revoked });
    return;
  }

  if (request.method === 'POST' && resource === '/auth/activation/authorize') {
    const payload = await readJson(request);
    const rawToken = requiredText(payload.token, 'Liên kết kích hoạt', 1_000);
    const record = await openActivation(rawToken);
    const user = await getUserById(record.user_id);
    const profile = await db.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').get(user.id);
    sendJson(response, 200, {
      activation_token: activationSessionToken(user, record.id, record.session_expires_at),
      expires_at: record.session_expires_at,
      user: publicUser(user, profile),
    });
    return;
  }

  if (request.method === 'POST' && resource === '/auth/activation/set-password') {
    const payload = await readJson(request);
    const activationToken = requiredText(payload.activationToken, 'Phiên kích hoạt', 4_000);
    const { user, record } = await requireActivationSession(activationToken);
    const password = validatePassword(String(payload.password || '').trim());
    const googleEmail = payload.googleCredential ? await verifyGoogleIdentityCredential(payload.googleCredential) : '';
    const timestamp = now();
    await db.transaction(async () => {
      await db.prepare('UPDATE users SET password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?')
        .run(await hashPassword(password), timestamp, user.id);
      await db.prepare('UPDATE activation_tokens SET used_at = ? WHERE id = ?').run(timestamp, record.id);
      await db.prepare("UPDATE employee_profiles SET employment_status = 'Chính thức', updated_at = ? WHERE user_id = ? AND (employment_status = 'Chờ kích hoạt' OR employment_status IS NULL)")
        .run(timestamp, user.id);
      await ensureEmployeeProfile(await getUserById(user.id));
      if (googleEmail) {
        const profile = await db.prepare('SELECT details_json FROM employee_profiles WHERE user_id = ?').get(user.id);
        const details = { ...parseJsonObject(profile?.details_json), googleEmail, googleLinkedAt: timestamp };
        await db.prepare('UPDATE employee_profiles SET details_json = ?, updated_at = ? WHERE user_id = ?')
          .run(JSON.stringify(details), timestamp, user.id);
      }
      await ensureEmployeeWorkspace(await getUserById(user.id));
    });
    const activatedUser = await getUserById(user.id);
    const profile = await db.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').get(user.id);
    sendJson(response, 200, {
      access_token: await createToken(activatedUser, request, 'activation'),
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_SECONDS,
      user: publicUser(activatedUser, profile),
    });
    return;
  }

  if (request.method === 'POST' && resource === '/auth/change-password') {
    const actor = await requireUser(request);
    const payload = await readJson(request);
    const oldPassword = String(payload.oldPassword || payload.currentPassword || '');
    const newPassword = String(payload.newPassword || '');
    const confirmPassword = String(payload.confirmPassword || '');

    if (!oldPassword) {
      throw new HttpError(422, 'Vui lòng nhập mật khẩu hiện tại.');
    }
    if (!newPassword) {
      throw new HttpError(422, 'Vui lòng nhập mật khẩu mới.');
    }
    if (newPassword.length < 6 || newPassword.length > 256) {
      throw new HttpError(422, 'Mật khẩu mới phải dài từ 6 đến 256 ký tự.');
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      throw new HttpError(422, 'Xác nhận mật khẩu mới không trùng khớp.');
    }

    const userRow = await getUserById(actor.id);
    if (!userRow) {
      throw new HttpError(404, 'Không tìm thấy thông tin tài khoản.');
    }

    const isMatch = await verifyPassword(oldPassword, userRow.password_hash);
    if (!isMatch) {
      throw new HttpError(400, 'Mật khẩu hiện tại không chính xác.');
    }

    const newHash = await hashPassword(newPassword);
    const timestamp = now();
    await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(newHash, timestamp, actor.id);

    sendJson(response, 200, {
      success: true,
      message: 'Đã thay đổi mật khẩu tài khoản thành công.',
    });
    return;
  }

  // ===== eKYC Cross-device Session Synchronization =====
  if (request.method === 'GET' && resource === '/ekyc/lan-info') {
    let lanIp = '127.0.0.1';
    try {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name] || []) {
          if (net.family === 'IPv4' && !net.internal && (net.address.startsWith('192.168.') || net.address.startsWith('10.') || (net.address.startsWith('172.') && !net.address.startsWith('172.18.')))) {
            lanIp = net.address;
            break;
          }
        }
        if (lanIp !== '127.0.0.1') break;
      }
    } catch {}
    sendJson(response, 200, { lanIp, port: 3004 });
    return;
  }

  if (request.method === 'POST' && resource === '/ekyc/session') {
    const payload = await readJson(request).catch(() => ({}));
    const token = String(payload.token || randomUUID()).trim();
    const actor = await requireUser(request);
    const userId = payload.userId || actor.id;
    if (userId !== actor.id && actor.role !== 'ADMIN') throw new HttpError(403, 'Bạn không được tạo phiên xác minh cho người khác.');
    ekycSessions.set(token, {
      token,
      userId,
      status: 'PENDING',
      data: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    sendJson(response, 200, { token, status: 'PENDING' });
    return;
  }

  if (request.method === 'POST' && resource.startsWith('/ekyc/session/') && resource.endsWith('/verify')) {
    const token = decodeURIComponent(resource.slice('/ekyc/session/'.length, -'/verify'.length));
    const payload = await readJson(request);
    const session = ekycSessions.get(token) || { token, createdAt: Date.now() };
    session.status = 'VERIFIED';
    const verifiedData = payload.data || payload;
    session.data = verifiedData;
    session.verifiedAt = new Date().toISOString();
    session.updatedAt = Date.now();
    ekycSessions.set(token, session);

    // LƯU TRỰC TIẾP VÀO DATABASE (employee_profiles & users)
    let targetUserId = payload.userId || verifiedData.userId || session.userId;
    if (!targetUserId) {
      const fallbackUser = await db.prepare("SELECT id FROM users WHERE role != 'ADMIN' AND is_active = 1 ORDER BY updated_at DESC LIMIT 1").get();
      if (fallbackUser) targetUserId = fallbackUser.id;
    }

    if (targetUserId) {
      try {
        const userRow = await getUserById(targetUserId);
        if (userRow) {
          await ensureEmployeeProfile(userRow);
          const profile = await db.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').get(targetUserId);
          const existingDetails = parseJsonObject(profile?.details_json);
          const updatedDetails = {
            ...existingDetails,
            docType: 'Căn cước công dân',
            docNumber: verifiedData.idNumber || existingDetails.docNumber || '001095012345',
            docIssueDate: verifiedData.issueDate || existingDetails.docIssueDate || '2025-03-24',
            docIssuePlace: verifiedData.issuePlace || existingDetails.docIssuePlace || 'Bộ Công an',
            docExpiryDate: verifiedData.expiryDate || existingDetails.docExpiryDate || '2035-06-06',
            name: verifiedData.name || userRow.name,
            displayName: verifiedData.name || existingDetails.displayName || userRow.name,
            birthDate: verifiedData.birthDate || existingDetails.birthDate,
            gender: verifiedData.gender || existingDetails.gender,
            originPlace: verifiedData.originPlace || existingDetails.originPlace,
            hkttAddress: verifiedData.residencePlace || existingDetails.hkttAddress,
            currentAddress: verifiedData.residencePlace || existingDetails.currentAddress,
            avatarUrl: verifiedData.cardAvatarUrl || verifiedData.livePhotoUrl || profile?.avatar_url,
            ekycVerified: true,
            idNumber: verifiedData.idNumber || existingDetails.idNumber || existingDetails.docNumber,
            residencePlace: verifiedData.residencePlace || existingDetails.residencePlace || existingDetails.hkttAddress,
            cardFrontUrl: verifiedData.cardFrontUrl || existingDetails.cardFrontUrl,
            cardBackUrl: verifiedData.cardBackUrl || existingDetails.cardBackUrl,
            livePhotoUrl: verifiedData.livePhotoUrl || existingDetails.livePhotoUrl,
            liveVideoUrl: verifiedData.liveVideoUrl || existingDetails.liveVideoUrl,
            cardAvatarUrl: verifiedData.cardAvatarUrl || existingDetails.cardAvatarUrl,
            certificateId: verifiedData.certificateId,
            verifiedAt: verifiedData.verifiedAt || new Date().toISOString(),
            faceMatchScore: verifiedData.faceMatchScore,
          };

          const newAvatar = verifiedData.cardAvatarUrl || verifiedData.livePhotoUrl || profile?.avatar_url;
          await db.prepare('UPDATE employee_profiles SET details_json = ?, avatar_url = ?, updated_at = ? WHERE user_id = ?')
            .run(JSON.stringify(updatedDetails), newAvatar, now(), targetUserId);
          if (verifiedData.name) {
            await db.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?')
              .run(verifiedData.name, now(), targetUserId);
          }
        }
      } catch (err) {
        console.error('Lỗi lưu eKYC vào database:', err);
      }
    }

    sendJson(response, 200, { success: true, status: 'VERIFIED', token, data: verifiedData });
    return;
  }

  if (request.method === 'POST' && resource.startsWith('/ekyc/session/') && resource.endsWith('/connect')) {
    const token = decodeURIComponent(resource.slice('/ekyc/session/'.length, -'/connect'.length));
    const session = ekycSessions.get(token) || { token, createdAt: Date.now() };
    if (session.status !== 'VERIFIED') {
      session.status = 'CONNECTED';
      session.connectedAt = new Date().toISOString();
      session.updatedAt = Date.now();
      ekycSessions.set(token, session);
    }
    sendJson(response, 200, { success: true, status: session.status, token });
    return;
  }

  if (request.method === 'GET' && resource.startsWith('/ekyc/session/') && resource.endsWith('/status')) {
    if (request.headers.authorization) await requireUser(request);
    const token = decodeURIComponent(resource.slice('/ekyc/session/'.length, -'/status'.length));
    const session = ekycSessions.get(token);
    if (session && session.status === 'VERIFIED' && session.data) {
      sendJson(response, 200, {
        status: 'VERIFIED',
        verified: true,
        data: session.data,
        verifiedAt: session.verifiedAt,
      });
      return;
    }

    if (session && session.status === 'CONNECTED') {
      sendJson(response, 200, {
        status: 'CONNECTED',
        verified: false,
        connected: true,
        connectedAt: session.connectedAt,
      });
      return;
    }

    // Kiểm tra trong database theo userId nếu có
    let targetUserId = session?.userId || url.searchParams.get('userId');
    if (!targetUserId) {
      targetUserId = (await requireUser(request)).id;
    }

    if (targetUserId) {
      try {
        const profile = await db.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').get(targetUserId);
        if (profile) {
          const details = parseJsonObject(profile.details_json);
          if (details && (details.ekycVerified || details.docNumber)) {
            sendJson(response, 200, {
              status: 'VERIFIED',
              verified: true,
              data: {
                ...details,
                idNumber: details.docNumber || details.idNumber,
                docNumber: details.docNumber || details.idNumber,
                issueDate: details.docIssueDate || details.issueDate,
                issuePlace: details.docIssuePlace || details.issuePlace,
                expiryDate: details.docExpiryDate || details.expiryDate,
                cardAvatarUrl: profile.avatar_url || details.avatarUrl,
              },
              verifiedAt: details.verifiedAt || profile.updated_at,
            });
            return;
          }
        }
      } catch {}
    }

    sendJson(response, 200, { status: 'PENDING', verified: false, data: null });
    return;
  }

  // Generic persistence for the existing long-tail business modules.  These
  // routes intentionally expose no seed/default records: an empty table is an
  // empty UI state.  ADMIN users operate on shared collections; normal users
  // can only access the explicitly personal/request scopes above and only
  // their own rows.
  if (request.method === 'POST' && resource === '/attendance/check-in') {
    const actor = await requireUser(request);
    const payload = await readJson(request);
    const type = oneOf(payload.type, 'Loại chấm công', ['in', 'out']);
    const timestamp = now();
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}:${parts.second}`;
    const key = `${actor.id}-${date}`;
    let record;
    await db.transaction(async () => {
      if (db.pool) await db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [key]);
      const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'employee_timesheets' AND record_key = ? AND owner_id = ?").get(key, actor.id);
      record = row ? publicCollectionRecord(row) : { key, employeeId: actor.id, employeeName: actor.name, empCode: actor.employee_code, date, checkIn: '', checkOut: '', status: 'Chờ đối soát', note: 'Chấm công trực tuyến', source: 'web', locationVerified: false };
      if (type === 'in' && record.checkIn) throw new HttpError(409, 'Bạn đã chấm công vào trong ngày.');
      if (type === 'out' && !record.checkIn) throw new HttpError(422, 'Cần chấm công vào trước khi chấm công ra.');
      if (type === 'out' && record.checkOut) throw new HttpError(409, 'Bạn đã chấm công ra trong ngày.');
      if (type === 'in') { record.checkIn = time; record.checkInAt = timestamp; record.duration = 'Đang làm việc'; }
      else {
        record.checkOut = time; record.checkOutAt = timestamp;
        record.durationMinutes = Math.max(0, Math.round((Date.parse(timestamp) - Date.parse(record.checkInAt)) / 60000));
        record.duration = `${Math.floor(record.durationMinutes / 60)}h ${record.durationMinutes % 60}m`;
      }
      await db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
        VALUES (?, 'employee_timesheets', ?, ?, ?, ?, ?) ON CONFLICT(scope, record_key, owner_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`)
        .run(row?.id || randomUUID(), key, actor.id, JSON.stringify(record), row?.created_at || timestamp, timestamp);
      await recordAuditEvent(actor.id, type === 'in' ? 'check_in' : 'check_out', 'employee_timesheets', key);
    });
    sendJson(response, 200, { record });
    return;
  }

  if (resource === '/admin/backups' && ['GET', 'POST'].includes(request.method)) {
    const actor = await requireAdmin(request);
    if (request.method === 'GET') sendJson(response, 200, await backupManager.list());
    else {
      const backup = await backupManager.create(await readJson(request), actor);
      await recordAuditEvent(actor.id, 'create', 'admin_backups', backup.key, { type: backup.type, checksumSha256: backup.checksumSha256 });
      sendJson(response, 201, { backup });
    }
    return;
  }
  const backupMatch = /^\/admin\/backups\/([^/]+)\/(verify|download|restore)$/.exec(resource);
  if (backupMatch) {
    const actor = await requireAdmin(request);
    const key = decodeURIComponent(backupMatch[1]);
    if (backupMatch[2] === 'verify' && request.method === 'POST') {
      const backup = await backupManager.verify(key);
      await recordAuditEvent(actor.id, 'verify', 'admin_backups', key, { status: backup.status });
      sendJson(response, 200, { backup });
      return;
    }
    if (backupMatch[2] === 'download' && request.method === 'GET') {
      const file = await backupManager.download(key);
      response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': file.sizeBytes,
        'Content-Disposition': `attachment; filename="${file.fileName}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      await pipeline(createReadStream(file.filePath), response);
      return;
    }
    if (backupMatch[2] === 'restore' && request.method === 'POST') throw new HttpError(409, 'Khôi phục tự động chưa được hỗ trợ. Hãy kiểm tra bản sao lưu và lập kế hoạch khôi phục ngoại tuyến.');
  }

  const collectionMatch = /^\/collections\/([^/]+)$/.exec(resource);
  const collectionRecordMatch = /^\/collections\/([^/]+)\/([^/]+)$/.exec(resource);

  if ((collectionMatch || collectionRecordMatch) && normalizeCollectionScope(decodeURIComponent((collectionMatch || collectionRecordMatch)[1])) === 'asset_transfers') {
    await requireAdmin(request);
    if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(409, 'Vui lòng xử lý điều chuyển qua chức năng tài sản.');
  }

  if ((collectionMatch || collectionRecordMatch) && normalizeCollectionScope(decodeURIComponent((collectionMatch || collectionRecordMatch)[1])) === 'asset_allocations') {
    await requireAdmin(request);
    if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(409, 'Vui lòng xử lý cấp phát và thu hồi qua chức năng tài sản.');
  }

  if ((collectionMatch || collectionRecordMatch) && normalizeCollectionScope(decodeURIComponent((collectionMatch || collectionRecordMatch)[1])) === 'asset_repairs') {
    await requireAdmin(request);
    if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(409, 'Vui lòng xử lý phiếu sửa chữa qua chức năng tài sản.');
  }

  if ((collectionMatch || collectionRecordMatch)
    && normalizeCollectionScope(decodeURIComponent((collectionMatch || collectionRecordMatch)[1])) === 'asset_licenses') {
    await requireAdmin(request);
    throw new HttpError(409, 'Vui lòng sử dụng chức năng quản lý bản quyền.');
  }

  if ((collectionMatch || collectionRecordMatch)
    && ['finance_sale_customer_links', 'finance_sale_promotions'].includes(normalizeCollectionScope(decodeURIComponent((collectionMatch || collectionRecordMatch)[1])))) {
    await requireAdmin(request);
    if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(409, 'Dữ liệu bán hàng phải được ghi qua chức năng bán hàng.');
  }

  if ((collectionMatch || collectionRecordMatch) && ['finance_payroll_postings', 'finance_payroll_adjustments'].includes(normalizeCollectionScope(decodeURIComponent((collectionMatch || collectionRecordMatch)[1])))) {
    await requireAdmin(request);
    if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(409, 'Bảng đối chiếu lương do chức năng hạch toán quản lý.');
  }

  if ((collectionMatch || collectionRecordMatch) && !['GET', 'HEAD'].includes(request.method)
    && normalizeCollectionScope(decodeURIComponent((collectionMatch || collectionRecordMatch)[1])) === 'crm_loyalty_ledger') {
    await requireAdmin(request);
    throw new HttpError(409, 'Sổ điểm chỉ được cập nhật qua chức năng tích điểm và đổi thưởng.');
  }

  if ((collectionMatch || collectionRecordMatch) && !['GET', 'HEAD'].includes(request.method)
    && normalizeCollectionScope(decodeURIComponent((collectionMatch || collectionRecordMatch)[1])) === 'finance_internal_transfers') {
    await requireAdmin(request);
    throw new HttpError(409, 'Lệnh điều chuyển phải được ghi hoặc hủy qua API điều chuyển để bảo toàn sổ quỹ.');
  }
  if ((collectionMatch || collectionRecordMatch) && !['GET', 'HEAD'].includes(request.method)
    && normalizeCollectionScope(decodeURIComponent((collectionMatch || collectionRecordMatch)[1])) === 'finance_payments') {
    await requireUser(request);
    throw new HttpError(409, 'Đề nghị thanh toán phải đi qua API quy trình để lưu đúng người lập, người duyệt và lịch sử xử lý.');
  }
  if ((collectionMatch || collectionRecordMatch) && !['GET', 'HEAD'].includes(request.method)
    && ['admin_sessions', 'admin_backups'].includes(normalizeCollectionScope(decodeURIComponent((collectionMatch || collectionRecordMatch)[1])))) {
    await requireAdmin(request);
    throw new HttpError(409, 'Dữ liệu quản trị này do hệ thống quản lý. Vui lòng dùng API quản trị tương ứng.');
  }

  if (collectionMatch && request.method === 'GET') {
    const scope = normalizeCollectionScope(decodeURIComponent(collectionMatch[1]));
    const actor = await requireCollectionActor(request, scope);
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '100', 10) || 100));
    const query = String(url.searchParams.get('q') || '').trim().toLowerCase().slice(0, 200);
    const sort = String(url.searchParams.get('sort') || '').trim();
    const order = url.searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
    if (actor.role !== 'ADMIN' && scope === 'workflow_requests') {
      const allRows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'workflow_requests' ORDER BY updated_at DESC, record_key ASC").all();
      const delegations = await workflowDelegationRows();
      let visible = allRows.map((row) => {
        const record = publicCollectionRecord(row);
        const access = workflowDecisionAccess(actor, record, delegations);
        return row.owner_id === actor.id || access.allowed ? { ...record, canDecide: access.allowed, delegatedFor: access.delegated ? record.currentApprover : '' } : null;
      }).filter(Boolean);
      if (query) visible = visible.filter((item) => JSON.stringify(item).toLowerCase().includes(query));
      if (/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(sort)) {
        visible.sort((left, right) => {
          const a = left[sort]; const b = right[sort];
          const compared = typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), 'vi');
          return order === 'ASC' ? compared : -compared;
        });
      }
      const total = visible.length;
      const data = visible.slice((page - 1) * limit, page * limit);
      sendJson(response, 200, { data, pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) } });
      return;
    }
    const sortExpression = /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(sort)
      ? `json_extract(payload_json, '$.${sort}')`
      : 'updated_at';
    const where = ['scope = ?'];
    const parameters = [scope];
    const SHARED_READ_SCOPES = new Set([
      'business_org_units',
      'org_units',
      'positions',
      'job_titles',
      'work_statuses',
      'admin_drop_menus',
      'drop_menus',
      'system_broadcasts',
      'enterprise_settings',
      'workflow_blueprints',
      'meeting_rooms',
      'room_bookings',
    ]);
    if (actor.role !== 'ADMIN' && scope === 'attendance_leave_summary') {
      where.push("(owner_id = ? OR json_extract(payload_json, '$.employeeId') = ?)");
      parameters.push(actor.id, actor.id);
    } else if (actor.role !== 'ADMIN' && scope === 'asset_todos') {
      where.push("json_extract(payload_json, '$.assignedStaffId') = ?");
      parameters.push(actor.id);
    } else if (actor.role !== 'ADMIN' && !SHARED_READ_SCOPES.has(scope) && (scope === 'business_travels' || (!scope.startsWith('business_') && !scope.startsWith('dropdown_')))) {
      where.push('owner_id = ?');
      parameters.push(actor.id);
    }
    if (query) {
      where.push('LOWER(payload_json) LIKE ? ESCAPE \'\\\'');
      parameters.push(`%${query.replace(/[\\%_]/g, '\\$&')}%`);
    }
    const whereSql = where.join(' AND ');
    const total = (await db.prepare(`SELECT COUNT(*) AS count FROM collection_records WHERE ${whereSql}`).get(...parameters))?.count;
    const rows = await db.prepare(`SELECT * FROM collection_records WHERE ${whereSql}
      ORDER BY ${sortExpression} ${order}, record_key ASC LIMIT ? OFFSET ?`)
      .all(...parameters, limit, (page - 1) * limit);
    const data = rows.map(publicCollectionRecord).filter(Boolean);
    sendJson(response, 200, {
      data,
      pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) },
    });
    return;
  }

  if (collectionMatch && request.method === 'PUT') {
    const scope = normalizeCollectionScope(decodeURIComponent(collectionMatch[1]));
    const actor = await requireCollectionActor(request, scope);
    const payload = await readJson(request, 4 * 1024 * 1024);
    if (!Array.isArray(payload.records) || payload.records.length > 1_000) {
      throw new HttpError(422, 'Danh sách bản ghi không hợp lệ hoặc vượt quá giới hạn 1.000 bản ghi.');
    }
    const records = await Promise.all(payload.records.map(record => normalizeCollectionRecord(record, scope, actor)));
    if (new Set(records.map((item) => item.recordKey)).size !== records.length) {
      throw new HttpError(422, 'Danh sách có khóa bản ghi trùng lặp.');
    }
    const existingRows = actor.role === 'ADMIN'
      ? await db.prepare('SELECT record_key, created_at FROM collection_records WHERE scope = ?').all(scope)
      : await db.prepare('SELECT record_key, created_at FROM collection_records WHERE scope = ? AND owner_id = ?').all(scope, actor.id);
    const createdAtByKey = new Map(existingRows.map((row) => [row.record_key, row.created_at]));
    const timestamp = now();
    await db.transaction(async () => {
      if (db.pool) await db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [scope]);
      if (scope === 'finance_general_ledger') {
        const existingPayroll = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'finance_general_ledger' AND json_extract(payload_json, '$.sourceModule') = 'payroll' LIMIT 1").get();
        if (existingPayroll || records.some((item) => item.record.sourceModule === 'payroll' || String(item.record.sourceReference || '').startsWith('payroll:'))) throw new HttpError(409, 'Không thể ghi đè bút toán lương.');
      }
      if (actor.role === 'ADMIN') {
        await db.prepare('DELETE FROM collection_records WHERE scope = ?').run(scope);
      } else {
        await db.prepare('DELETE FROM collection_records WHERE scope = ? AND owner_id = ?').run(scope, actor.id);
      }
      const insert = await db.prepare(`INSERT INTO collection_records
        (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`);
      for (const item of records) {
        await insert.run(randomUUID(), scope, item.recordKey, actor.id, item.serialized, createdAtByKey.get(item.recordKey) || timestamp, timestamp);
      }
      await recordAuditEvent(actor.id, 'replace_collection', scope, '', { recordCount: records.length });
    });
    const savedRows = await db.prepare('SELECT * FROM collection_records WHERE scope = ? AND owner_id = ? ORDER BY updated_at DESC, record_key ASC')
      .all(scope, actor.id);
    sendJson(response, 200, { data: savedRows.map(publicCollectionRecord).filter(Boolean) });
    return;
  }

  if (collectionMatch && request.method === 'POST') {
    const scope = normalizeCollectionScope(decodeURIComponent(collectionMatch[1]));
    const actor = await requireCollectionActor(request, scope);
    const payload = await readJson(request, 256 * 1024);
    let item;
    let ownerId = actor.id;
    const timestamp = now();
    try {
      await db.transaction(async () => {
        if (db.pool) await db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [scope]);
        if (scope === 'asset_disposals' && db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('asset_items'))");
        if (scope === 'asset_depreciations' && db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('asset_items'))");
        item = await normalizeCollectionRecord(payload.record, scope, actor);
        if (scope === 'finance_general_ledger' && (item.record.sourceModule === 'payroll' || String(item.record.sourceReference || '').startsWith('payroll:') || item.recordKey.startsWith('payroll:'))) throw new HttpError(409, 'Bút toán lương phải được tạo qua chức năng hạch toán lương.');
        if (['leave_requests', 'attendance_overtime', 'attendance_leave_summary'].includes(scope)) ownerId = item.record.employeeId;
        await db.prepare(`INSERT INTO collection_records
          (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(randomUUID(), scope, item.recordKey, ownerId, item.serialized, timestamp, timestamp);
        await recordAuditEvent(actor.id, 'create', scope, item.recordKey);
      });
    } catch (error) {
      if (String(error?.message || '').includes('UNIQUE')) throw new HttpError(409, 'Khóa bản ghi đã tồn tại.');
      throw error;
    }
    const row = await db.prepare('SELECT * FROM collection_records WHERE scope = ? AND record_key = ? AND owner_id = ?')
      .get(scope, item.recordKey, ownerId);
    sendJson(response, 201, { record: publicCollectionRecord(row) });
    return;
  }

  if (collectionRecordMatch) {
    const scope = normalizeCollectionScope(decodeURIComponent(collectionRecordMatch[1]));
    const recordKey = requiredText(decodeURIComponent(collectionRecordMatch[2]), 'Khóa bản ghi', 160);
    const actor = await requireCollectionActor(request, scope);
    const SHARED_READ_SCOPES = new Set([
      'business_org_units',
      'org_units',
      'positions',
      'job_titles',
      'work_statuses',
      'admin_drop_menus',
      'drop_menus',
      'system_broadcasts',
      'enterprise_settings',
      'workflow_blueprints',
      'meeting_rooms',
      'room_bookings',
    ]);
    const isShared = actor.role === 'ADMIN' || (request.method === 'GET' && (SHARED_READ_SCOPES.has(scope) || scope.startsWith('business_') || scope.startsWith('dropdown_')));
    const businessTravelOwnerRead = scope === 'business_travels' && request.method === 'GET' && actor.role !== 'ADMIN';
    const sharedAccess = isShared && !businessTravelOwnerRead;
    const workflowRequestAccess = scope === 'workflow_requests' && request.method !== 'DELETE' && actor.role !== 'ADMIN';
    const assignedAssetTodoAccess = scope === 'asset_todos' && actor.role !== 'ADMIN';
    const ownershipSql = sharedAccess || workflowRequestAccess || assignedAssetTodoAccess ? '' : ' AND owner_id = ?';
    const ownershipParams = sharedAccess || workflowRequestAccess || assignedAssetTodoAccess ? [] : [actor.id];
    const existing = await db.prepare(`SELECT * FROM collection_records WHERE scope = ? AND record_key = ?${ownershipSql} ORDER BY updated_at DESC LIMIT 1`)
      .get(scope, recordKey, ...ownershipParams);
    if (!existing) throw new HttpError(404, 'Không tìm thấy bản ghi.');

    if (assignedAssetTodoAccess && publicCollectionRecord(existing)?.assignedStaffId !== actor.id) {
      throw new HttpError(404, 'Không tìm thấy bản ghi.');
    }

    if (scope === 'workflow_requests' && actor.role !== 'ADMIN') {
      const current = publicCollectionRecord(existing);
      const isOwner = existing.owner_id === actor.id;
      if (request.method === 'DELETE' ? !isOwner : !isOwner && !await canDecideWorkflow(actor, current)) {
        throw new HttpError(404, 'Không tìm thấy bản ghi.');
      }
    }

    if (request.method === 'GET') {
      const record = publicCollectionRecord(existing);
      if (scope === 'workflow_requests' && actor.role !== 'ADMIN') {
        const access = workflowDecisionAccess(actor, record, await workflowDelegationRows());
        record.canDecide = access.allowed;
        record.delegatedFor = access.delegated ? record.currentApprover : '';
      }
      sendJson(response, 200, { record });
      return;
    }

    if (request.method === 'PATCH') {
      const payload = await readJson(request, 256 * 1024);
      const patch = payload.patch;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(422, 'Dữ liệu cập nhật không hợp lệ.');
      if (scope === 'finance_purchase_requests' && (Object.keys(patch).length !== 1 || !Object.hasOwn(patch, 'supplierKey'))) {
        throw new HttpError(422, 'Yêu cầu mua sắm chỉ được cập nhật qua thao tác xác định nhà cung cấp.');
      }
      if (scope === 'tickets') {
        const fields = Object.keys(patch).filter((field) => field !== 'key');
        if (fields.length !== 1 || fields[0] !== 'status' || !['Đang xử lý', 'Đã hoàn thành'].includes(patch.status)) {
          throw new HttpError(422, 'Ticket chỉ được chuyển trạng thái qua thao tác được phép.');
        }
      }
      if (scope === 'doc_notes') {
        const fields = Object.keys(patch).filter((field) => field !== 'key' && field !== 'noteCode');
        const isPin = fields.length === 1 && fields[0] === 'isPinned' && typeof patch.isPinned === 'boolean';
        const isActionUpdate = fields.length === 1 && fields[0] === 'actionItems' && Array.isArray(patch.actionItems);
        if (!isPin && !isActionUpdate) throw new HttpError(422, 'Chỉ được ghim chỉ đạo hoặc cập nhật trạng thái đầu việc.');
      }
      if (scope === 'attendance_explanations') {
        const current = publicCollectionRecord(existing);
        if (current.status !== 'Chờ duyệt') throw new HttpError(409, 'Giải trình đã được xử lý và không thể sửa.');
        const fields = Object.keys(patch);
        if (actor.role === 'ADMIN') {
          if (fields.length !== 1 || fields[0] !== 'status' || !['Đã duyệt', 'Từ chối'].includes(patch.status)) {
            throw new HttpError(422, 'Quản trị viên chỉ được duyệt hoặc từ chối giải trình đang chờ.');
          }
        } else if (!fields.length || fields.some((field) => !['date', 'reason', 'note'].includes(field))) {
          throw new HttpError(403, 'Nhân viên chỉ được sửa ngày, lý do và ghi chú của giải trình đang chờ.');
        }
      }
      if (scope === 'room_bookings') {
        const fields = Object.keys(patch).filter((field) => field !== 'key');
        const current = publicCollectionRecord(existing);
        if (fields.length !== 1 || fields[0] !== 'status' || patch.status !== 'Đã hủy') {
          throw new HttpError(422, 'Lịch họp chỉ được cập nhật bằng thao tác hủy.');
        }
        if (current.status !== 'Đã xác nhận') throw new HttpError(409, 'Lịch họp đã được xử lý.');
      }
      if (scope === 'meeting_rooms') {
        const fields = Object.keys(patch).filter(field => field !== 'key');
        if (actor.role !== 'ADMIN' || fields.length !== 1 || fields[0] !== 'status') throw new HttpError(actor.role === 'ADMIN' ? 422 : 403, 'Phòng họp chỉ cho phép quản trị viên cập nhật trạng thái.');
      }
      if (scope === 'meeting_room_settings') {
        if (actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được quản lý quy định đặt phòng họp.');
        if (Object.keys(patch).some(field => !['maxDuration', 'maxAdvanceDays'].includes(field))) throw new HttpError(422, 'Chỉ được cập nhật giới hạn thời lượng và số ngày đặt trước.');
        if (!Object.keys(patch).length) throw new HttpError(422, 'Chưa có thiết lập nào được thay đổi.');
      }
      if (scope === 'asset_depreciations') {
        const fields = Object.keys(patch).filter((field) => field !== 'key');
        const current = publicCollectionRecord(existing);
        const validToggle = fields.length === 1 && fields[0] === 'status'
          && ((current.status === 'Đang trích khấu hao' && patch.status === 'Tạm dừng trích KH')
            || (current.status === 'Tạm dừng trích KH' && patch.status === 'Đang trích khấu hao'));
        if (!validToggle) throw new HttpError(422, 'Tiến độ khấu hao chỉ được ghi qua thao tác hạch toán theo kỳ.');
      }
      if (scope === 'crm_feedback') {
        const fields = Object.keys(patch);
        if (actor.role !== 'ADMIN' || fields.length !== 2 || !fields.includes('status') || !fields.includes('resolutionAction')) {
          throw new HttpError(actor.role === 'ADMIN' ? 422 : 403, 'Chỉ được đóng phản ánh bằng trạng thái và biện pháp xử lý.');
        }
      }
      if (scope === 'crm_promotions') {
        const editable = new Set([
          'key', 'code', 'name', 'startDate', 'endDate', 'promotionType', 'target', 'enabled', 'allowConcurrent',
          'eligibleItemCodes', 'amountBasis', 'orgUnitKeys', 'employeeIds', 'applyOnce', 'combinablePromotionKeys',
          'taxCondition', 'minimumSubtotal', 'unitPrice', 'unit', 'customerKeys', 'discountKind', 'discountValue',
        ]);
        const unsupported = Object.keys(patch).filter((field) => !editable.has(field));
        if (actor.role !== 'ADMIN' || unsupported.length || !Object.keys(patch).some((field) => field !== 'key')
          || (patch.key !== undefined && patch.key !== recordKey)) {
          throw new HttpError(actor.role === 'ADMIN' ? 422 : 403, 'Chương trình chỉ được cập nhật bằng các trường cấu hình được phép.');
        }
      }
      if (scope === 'asset_disposals') {
        const fields = Object.keys(patch).filter((field) => field !== 'key');
        const allowed = new Set(['status', 'actualDisposalPrice', 'disposalCost', 'disposalDate', 'buyerName', 'buyerPhone', 'securityDataWipeCertified', 'dataWipeOfficer']);
        const finalFields = new Set(['status', 'actualDisposalPrice', 'disposalCost', 'disposalDate', 'buyerName', 'buyerPhone', 'securityDataWipeCertified', 'dataWipeOfficer']);
        const isApproval = fields.length === 1 && fields[0] === 'status' && patch.status === 'Đang thực hiện xử lý';
        const isFinalization = fields.includes('status') && ['actualDisposalPrice', 'disposalCost', 'disposalDate'].every((field) => fields.includes(field))
          && fields.every((field) => finalFields.has(field));
        if (actor.role !== 'ADMIN' || (!isApproval && !isFinalization) || fields.some((field) => !allowed.has(field))) {
          throw new HttpError(actor.role === 'ADMIN' ? 422 : 403, 'Chỉ được phê duyệt hoặc hoàn tất thanh lý bằng các trường được phép.');
        }
      }
      if (scope === 'asset_todos') {
        const fields = Object.keys(patch).filter((field) => field !== 'key');
        const statusOnly = fields.length === 1 && fields[0] === 'status';
        const checklistOnly = fields.length === 1 && fields[0] === 'checklist';
        const completion = fields.length === 3 && ['status', 'actualHours', 'resolutionResult'].every((field) => fields.includes(field)) && patch.status === 'Đã hoàn thành';
        const current = publicCollectionRecord(existing);
        const employeeStart = statusOnly && current.status === 'Chờ xử lý' && patch.status === 'Đang thực hiện';
        const employeeSubmit = statusOnly && current.status === 'Đang thực hiện' && patch.status === 'Chờ phê duyệt cấp trên';
        const employeeChecklist = checklistOnly && current.status === 'Đang thực hiện';
        if (actor.role === 'ADMIN' ? (!statusOnly && !checklistOnly && !completion) : (!employeeStart && !employeeSubmit && !employeeChecklist)) {
          throw new HttpError(actor.role === 'ADMIN' ? 422 : 403, 'Nhân viên chỉ được bắt đầu, cập nhật checklist hoặc gửi duyệt nhiệm vụ được giao.');
        }
      }
      if (scope === 'asset_maintenances') {
        const fields = Object.keys(patch).filter((field) => field !== 'key');
        const isStart = fields.length === 1 && fields[0] === 'status' && patch.status === 'Đang tiến hành bảo dưỡng';
        const isChecklist = fields.length === 1 && fields[0] === 'checklist';
        const allowedCompletion = new Set(['status', 'performedDate', 'actualCost', 'healthScore', 'checklist', 'notes', 'certificateCode']);
        const isCompletion = patch.status === 'Đã hoàn thành đúng lịch' && fields.includes('performedDate')
          && fields.includes('actualCost') && fields.includes('healthScore') && fields.includes('checklist')
          && fields.every((field) => allowedCompletion.has(field));
        if (actor.role !== 'ADMIN' || (!isStart && !isChecklist && !isCompletion)) {
          throw new HttpError(actor.role === 'ADMIN' ? 422 : 403, 'Chỉ được bắt đầu, cập nhật checklist hoặc nghiệm thu theo đúng quy trình.');
        }
      }
      if (scope === 'asset_systems') {
        const fields = Object.keys(patch).filter((field) => field !== 'key');
        if (actor.role !== 'ADMIN' || fields.length !== 1 || fields[0] !== 'status') {
          throw new HttpError(actor.role === 'ADMIN' ? 422 : 403, 'Cấu hình hệ thống chỉ cho phép đổi trạng thái bằng thao tác riêng.');
        }
      }
      if (scope === 'business_travels') {
        const fields = Object.keys(patch).filter((field) => field !== 'key');
        const decisionFields = new Set(['status', 'rejectionReason']);
        const settlementFields = new Set(['actualExpense', 'invoiceReference', 'invoiceFileId', 'invoiceFileName', 'settlementNote']);
        const isDecision = fields.includes('status');
        const isSettlement = fields.some((field) => settlementFields.has(field));
        if (!fields.length || (isDecision && (actor.role !== 'ADMIN' || fields.some((field) => !decisionFields.has(field))))
          || (isSettlement && (actor.role !== 'ADMIN' || fields.some((field) => !settlementFields.has(field))))
          || (!isDecision && !isSettlement)) {
          throw new HttpError(actor.role === 'ADMIN' ? 422 : 403, 'Chỉ được duyệt, từ chối hoặc ghi quyết toán theo các trường cho phép.');
        }
      }
      if (scope === 'workflow_requests') {
        const allowedFields = new Set(['decision', 'approvalNote', 'resubmission']);
        if (Object.keys(patch).some(field => !allowedFields.has(field))) {
          throw new HttpError(422, 'Hồ sơ quy trình chỉ được cập nhật bằng thao tác xử lý được phép.');
        }
        if (Object.hasOwn(patch, 'resubmission') && Object.keys(patch).length !== 1) {
          throw new HttpError(422, 'Nộp bổ sung không thể gộp với quyết định xử lý khác.');
        }
      }
      await db.transaction(async () => {
        if (db.pool) await db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [scope]);
        if (scope === 'asset_disposals' && db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('asset_items'))");
        if (scope === 'asset_maintenances' && db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('asset_items'))");
        const fresh = await db.prepare('SELECT * FROM collection_records WHERE id = ?').get(existing.id);
        if (!fresh) throw new HttpError(404, 'Không tìm thấy bản ghi.');
        const current = publicCollectionRecord(fresh) || {};
        if (scope === 'asset_todos' && (fresh.updated_at !== existing.updated_at || fresh.payload_json !== existing.payload_json)) {
          throw new HttpError(409, 'Nhiệm vụ vừa được cập nhật; vui lòng tải lại trước khi sửa.');
        }
        if (scope === 'attendance_explanations' && current.status !== 'Chờ duyệt') throw new HttpError(409, 'Giải trình đã được xử lý bởi một yêu cầu khác.');
        if (scope === 'finance_general_ledger' && (current.sourceModule === 'payroll' || String(current.sourceReference || '').startsWith('payroll:') || patch.sourceModule === 'payroll' || String(patch.sourceReference || '').startsWith('payroll:'))) throw new HttpError(409, 'Bút toán lương phải được giữ để đối chiếu.');
        if (scope === 'room_bookings' && current.status !== 'Đã xác nhận') throw new HttpError(409, 'Lịch họp đã được hủy hoặc thay đổi bởi yêu cầu khác.');
        if (scope === 'crm_promotions') {
          const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
          if (current.endDate < businessDate || current.status === 'Đã kết thúc') throw new HttpError(409, 'Chương trình đã kết thúc và được lưu để bảo toàn lịch sử.');
        }
        if (scope === 'meeting_rooms' && ['Bảo trì', 'Tạm ngưng'].includes(patch.status)) {
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
          const activeBookings = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'room_bookings' AND json_extract(payload_json, '$.date') >= ?").all(today);
          const hasFutureBooking = activeBookings.some(row => {
            const booking = parseJsonObject(row.payload_json);
            return booking.status === 'Đã xác nhận' && (booking.roomKey === current.key || String(booking.roomName || '').toLocaleLowerCase() === String(current.name || '').toLocaleLowerCase());
          });
          if (hasFutureBooking) throw new HttpError(409, 'Không thể tạm ngưng phòng đang có lịch đã xác nhận. Hãy xử lý lịch trước.');
        }
        if (scope === 'asset_depreciations' && current.status === patch.status) throw new HttpError(422, 'Trạng thái khấu hao vừa được cập nhật bởi một thao tác khác.');
        if (scope === 'crm_feedback' && current.status !== 'Đang xử lý') throw new HttpError(422, 'Phản ánh đã được xử lý bởi một yêu cầu khác.');
        if (scope === 'business_travels' && Object.hasOwn(patch, 'status') && current.status !== 'Chờ lãnh đạo duyệt') {
          throw new HttpError(422, 'Đề xuất công tác đã được xử lý bởi một yêu cầu khác.');
        }
        if (scope === 'business_travels' && Object.keys(patch).some((field) => ['actualExpense', 'invoiceReference', 'invoiceFileId', 'invoiceFileName', 'settlementNote'].includes(field))
          && current.settlementStatus === 'Đã quyết toán xong') {
          throw new HttpError(422, 'Quyết toán đã hoàn tất bởi một yêu cầu khác.');
        }
        const item = await normalizeCollectionRecord({ ...current, ...patch, key: current.key ?? recordKey }, scope, actor, current);
        if (scope === 'asset_maintenances' && item.record.lastCompletedAt !== current.lastCompletedAt) {
          const assetRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items' AND record_key = ? ORDER BY updated_at DESC LIMIT 1").get(current.assetKey);
          const asset = publicCollectionRecord(assetRow);
          if (!asset || ['Đã thanh lý', 'Chờ thanh lý'].includes(asset.status)) throw new HttpError(422, 'Tài sản không còn đủ điều kiện để ghi nhận bảo dưỡng.');
          const completed = item.record.maintenanceHistory.at(-1);
          const updatedAsset = {
            ...asset,
            history: [...(Array.isArray(asset.history) ? asset.history : []), {
              key: randomUUID(), date: completed.completedAt, action: 'Hoàn tất bảo dưỡng định kỳ', actor: actor.name,
              note: `${item.record.maintCode} · ${item.record.assetCodes} · ${completed.date} · Chi phí ${completed.actualCost}`,
            }],
          };
          await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?')
            .run(JSON.stringify(updatedAsset), completed.completedAt, assetRow.id);
        }
        if (scope === 'asset_disposals' && item.record.status !== current.status) {
          const assetRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items' AND record_key = ? ORDER BY updated_at DESC LIMIT 1").get(current.assetKey);
          if (!assetRow) throw new HttpError(422, 'Không tìm thấy tài sản liên kết để cập nhật.');
          const asset = publicCollectionRecord(assetRow);
          const approving = item.record.status === 'Đang thực hiện xử lý';
          const expectedStatus = approving ? current.sourceAssetStatus : 'Chờ thanh lý';
          const nextStatus = approving ? 'Chờ thanh lý' : 'Đã thanh lý';
          if (asset.status !== expectedStatus) throw new HttpError(422, 'Trạng thái tài sản đã thay đổi; hãy tải lại và kiểm tra hồ sơ.');
          const timestamp = approving ? item.record.approvedAt : item.record.completedAt;
          const history = Array.isArray(asset.history) ? asset.history : [];
          const updatedAsset = {
            ...asset,
            status: nextStatus,
            history: [...history, {
              key: randomUUID(),
              date: timestamp,
              action: approving ? 'Đưa vào xử lý thanh lý' : 'Hoàn tất xử lý thanh lý',
              actor: actor.name,
              note: `${item.record.disposalCode} · ${item.record.disposalMethod}${approving ? '' : ` · ${item.record.status}`}`,
            }],
          };
          await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?')
            .run(JSON.stringify(updatedAsset), timestamp, assetRow.id);
        }
        if (scope === 'attendance_shift_assignments' && current.status === 'Chờ duyệt đổi ca' && patch.swapDecision) {
          if (actor.role !== 'ADMIN') throw new HttpError(403, 'Chỉ quản trị viên được duyệt đổi ca.');
          if (!['Đã duyệt', 'Từ chối'].includes(patch.swapDecision)) throw new HttpError(422, 'Quyết định đổi ca không hợp lệ.');
          if (patch.swapDecision === 'Đã duyệt') {
            const targetRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'attendance_shift_assignments' AND record_key = ?").get(current.swapTargetKey);
            const target = publicCollectionRecord(targetRow);
            if (!target || target.status !== 'Đang áp dụng' || target.employeeId === current.employeeId || target.effectiveFrom !== current.effectiveFrom || target.effectiveTo !== current.effectiveTo) throw new HttpError(422, 'Phân ca đối ứng phải đang áp dụng, khác nhân viên và trùng khoảng ngày.');
            const shiftedTarget = { ...target };
            for (const field of ['shiftKey', 'shiftName', 'shiftCode', 'workHours']) { item.record[field] = target[field]; shiftedTarget[field] = current[field]; }
            shiftedTarget.swapDecision = 'Đã duyệt'; shiftedTarget.swapApprover = actor.name; shiftedTarget.swapApprovedAt = now();
            await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(shiftedTarget), now(), targetRow.id);
          }
          item.record.status = 'Đang áp dụng'; item.record.swapApprover = actor.name; item.record.swapApprovedAt = now();
          item.serialized = JSON.stringify(item.record);
        }
        const ownerId = ['leave_requests', 'attendance_overtime', 'attendance_leave_summary'].includes(scope) ? item.record.employeeId : fresh.owner_id;
        await db.prepare('UPDATE collection_records SET record_key = ?, owner_id = ?, payload_json = ?, updated_at = ? WHERE id = ?')
          .run(item.recordKey, ownerId, item.serialized, now(), existing.id);
        await recordAuditEvent(actor.id, 'update', scope, item.recordKey);
      });
      const updated = await db.prepare('SELECT * FROM collection_records WHERE id = ?').get(existing.id);
      sendJson(response, 200, { record: publicCollectionRecord(updated) });
      return;
    }

    if (request.method === 'DELETE') {
      await db.transaction(async () => {
        if (db.pool) await db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [scope]);
        const fresh = await db.prepare('SELECT * FROM collection_records WHERE id = ?').get(existing.id);
        if (!fresh) throw new HttpError(404, 'Không tìm thấy bản ghi.');
        if (scope === 'finance_general_ledger' && (publicCollectionRecord(fresh)?.sourceModule === 'payroll' || String(publicCollectionRecord(fresh)?.sourceReference || '').startsWith('payroll:'))) throw new HttpError(409, 'Bút toán lương phải được giữ để đối chiếu.');
        if (scope === 'attendance_explanations' && publicCollectionRecord(fresh)?.status !== 'Chờ duyệt') throw new HttpError(409, 'Giải trình đã được xử lý và không thể xóa.');
        if (scope === 'workflow_requests') {
          const current = publicCollectionRecord(fresh);
          if (current.status !== 'Chờ bạn ký duyệt' || current.approvalHistory?.length) throw new HttpError(422, 'Hồ sơ đã xử lý nên không thể xóa.');
        } else if (scope === 'crm_feedback') {
          throw new HttpError(422, 'Phản ánh khách hàng được lưu để bảo toàn lịch sử xử lý.');
        } else if (scope === 'crm_supplier_evaluations') {
          throw new HttpError(422, 'Đánh giá nhà cung cấp được lưu để bảo toàn lịch sử đối tác.');
        } else if (scope === 'crm_promotions') {
          throw new HttpError(409, 'Chương trình khuyến mại được lưu để bảo toàn lịch sử áp dụng.');
        } else if (scope === 'business_travels') {
          const current = publicCollectionRecord(fresh);
          if (current.status !== 'Chờ lãnh đạo duyệt') throw new HttpError(422, 'Đề xuất đã được xử lý nên không thể xóa.');
        } else if (scope === 'asset_disposals') {
          const current = publicCollectionRecord(fresh);
          if (current.status !== 'Chờ hội đồng phê duyệt') throw new HttpError(422, 'Chỉ hồ sơ chưa được phê duyệt mới có thể xóa.');
        } else if (scope === 'asset_todos') {
          const current = publicCollectionRecord(fresh);
          if (current.status !== 'Chờ xử lý') throw new HttpError(422, 'Chỉ nhiệm vụ chưa bắt đầu mới có thể xóa.');
        } else if (scope === 'finance_inventory') {
          const current = publicCollectionRecord(fresh);
          if (Number(current.stockQty || 0) !== 0) throw new HttpError(409, 'Không thể xóa mặt hàng còn tồn kho.');
          const movements = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'finance_inventory_transactions'").all();
          if (movements.some((row) => (parseJsonObject(row.payload_json).lines || []).some((line) => line.itemKey === current.key))) {
            throw new HttpError(409, 'Mặt hàng đã có lịch sử giao dịch kho và được giữ để đối chiếu.');
          }
        } else if (scope === 'asset_maintenances') {
          const current = publicCollectionRecord(fresh);
          if (current.startedAt || (Array.isArray(current.maintenanceHistory) && current.maintenanceHistory.length)) throw new HttpError(422, 'Chỉ kế hoạch chưa bắt đầu mới có thể xóa.');
        } else if (scope === 'asset_depreciations') {
          const current = publicCollectionRecord(fresh);
          if (Number(current.depreciatedMonths || 0) > 0 || current.lastRunDate !== 'Chưa trích') throw new HttpError(422, 'Hồ sơ đã ghi khấu hao phải được giữ để bảo toàn sổ kế toán.');
        } else if (['leave_requests', 'attendance_overtime', 'hr_rewards', 'hr_performance_reviews'].includes(scope)) {
          const current = publicCollectionRecord(fresh);
          if (!['Chờ duyệt', 'Chờ phê duyệt', 'Chờ phê duyệt điểm'].includes(current.status)) throw new HttpError(422, 'Không thể xóa bản ghi đã phê duyệt hoặc từ chối.');
        }
        await db.prepare('DELETE FROM collection_records WHERE id = ?').run(existing.id);
        await recordAuditEvent(actor.id, 'delete', scope, recordKey);
      });
      sendJson(response, 200, { deleted: true });
      return;
    }
  }

  const publicFileShareMatch = /^\/files\/share\/([^/]+)$/.exec(resource);
  if (publicFileShareMatch && request.method === 'GET') {
    const token = requiredText(decodeURIComponent(publicFileShareMatch[1]), 'Mã chia sẻ', 160);
    const share = await fileShareByToken(token);
    if (!share || !share.is_active) throw new HttpError(404, 'Link chia sẻ không hoạt động.');
    const node = fileNodeFromShareRow(share);
    if (!node || node.node_type !== 'file') throw new HttpError(404, 'Tệp chia sẻ không tồn tại.');
    sendJson(response, 200, { share: publicFileShare(share, node) });
    return;
  }

  const publicFileShareDownloadMatch = /^\/files\/share\/([^/]+)\/download$/.exec(resource);
  if (publicFileShareDownloadMatch && request.method === 'GET') {
    const token = requiredText(decodeURIComponent(publicFileShareDownloadMatch[1]), 'Mã chia sẻ', 160);
    const share = await fileShareByToken(token);
    if (!share || !share.is_active) throw new HttpError(404, 'Link chia sẻ không hoạt động.');
    const node = fileNodeFromShareRow(share);
    if (!node || node.node_type !== 'file') throw new HttpError(404, 'Tệp chia sẻ không tồn tại.');
    if (!node.storage_key) throw new HttpError(404, 'Nội dung tệp chưa được lưu.');
    let content;
    try {
      content = await readFile(fileStoragePath(node.storage_key));
    } catch {
      throw new HttpError(404, 'Không tìm thấy nội dung tệp.');
    }
    const encodedName = encodeURIComponent(node.name).replace(/['()]/g, escape);
    response.writeHead(200, {
      'Content-Type': node.mime_type || 'application/octet-stream',
      'Content-Length': content.length,
      'Content-Disposition': `inline; filename="download"; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(content);
    return;
  }

  const fileShareMatch = /^\/files\/([^/]+)\/share$/.exec(resource);
  if (fileShareMatch && (request.method === 'GET' || request.method === 'POST' || request.method === 'PATCH')) {
    const actor = await requireUser(request);
    const node = requireFileAccess(actor, await fileNodeById(decodeURIComponent(fileShareMatch[1])));
    if (node.node_type !== 'file') throw new HttpError(422, 'Chỉ có thể chia sẻ tệp.');

    let share = await fileShareByFileId(node.id);
    if (request.method === 'GET') {
      if (!share) {
        sendJson(response, 200, { share: null, file: publicFileNode(node) });
        return;
      }
      sendJson(response, 200, { share: publicFileShare(share, node) });
      return;
    }

    const payload = await readJson(request, 64 * 1024);
    const timestamp = now();
    const shouldRegenerate = Boolean(payload.regenerate);
    const isActive = payload.isActive === undefined ? 1 : (payload.isActive ? 1 : 0);
    if (!share) {
      const id = randomUUID();
      const token = randomBytes(18).toString('base64url');
      await db.prepare(`INSERT INTO file_shares (id, file_id, token, is_active, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(id, node.id, token, isActive, actor.id, timestamp, timestamp);
      share = await fileShareByFileId(node.id);
    } else {
      const nextToken = shouldRegenerate ? randomBytes(18).toString('base64url') : share.token;
      await db.prepare('UPDATE file_shares SET token = ?, is_active = ?, updated_at = ? WHERE id = ?')
        .run(nextToken, isActive, timestamp, share.id);
      share = await fileShareByFileId(node.id);
    }
    sendJson(response, 200, { share: publicFileShare(share, node) });
    return;
  }

  const fileDownloadMatch = /^\/files\/([^/]+)\/download$/.exec(resource);
  if (fileDownloadMatch && request.method === 'GET') {
    const actor = await requireUser(request);
    const node = await fileNodeById(decodeURIComponent(fileDownloadMatch[1]));
    if (!node || node.deleted_at || (!canAccessFileNode(actor, node) && !await canReadWorkflowAttachment(actor, node.id))) {
      throw new HttpError(404, 'Tệp này không tồn tại.');
    }
    if (node.node_type !== 'file') throw new HttpError(422, 'Chỉ có thể tải xuống tệp.');
    if (!node.storage_key) throw new HttpError(404, 'Nội dung tệp chưa được lưu.');
    let content;
    try {
      content = await readFile(fileStoragePath(node.storage_key));
    } catch {
      throw new HttpError(404, 'Không tìm thấy nội dung tệp.');
    }
    const encodedName = encodeURIComponent(node.name).replace(/['()]/g, escape);
    response.writeHead(200, {
      'Content-Type': node.mime_type || 'application/octet-stream',
      'Content-Length': content.length,
      'Content-Disposition': `attachment; filename="download"; filename*=UTF-8''${encodedName}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    response.end(content);
    return;
  }

  const fileContentMatch = /^\/files\/([^/]+)\/content$/.exec(resource);
  if (fileContentMatch && request.method === 'PUT') {
    const actor = await requireUser(request);
    const node = requireFileAccess(actor, await fileNodeById(decodeURIComponent(fileContentMatch[1])));
    if (node.node_type !== 'file') throw new HttpError(422, 'Chỉ có thể cập nhật nội dung tệp.');
    if (node.is_protected) throw new HttpError(403, 'Không thể sửa tệp hệ thống được bảo vệ.');
    const content = await readBinary(request);
    const storageKey = node.storage_key || `${node.id}.bin`;
    await writeFile(fileStoragePath(storageKey), content);
    const timestamp = now();
    await db.prepare('UPDATE file_nodes SET storage_key = ?, size = ?, mime_type = ?, updated_at = ? WHERE id = ?')
      .run(storageKey, content.length, optionalText(request.headers['content-type'], 'Loại tệp', 200) || node.mime_type, timestamp, node.id);
    sendJson(response, 200, { file: publicFileNode(await fileNodeById(node.id)) });
    return;
  }

  if (request.method === 'GET' && resource === '/files') {
    const actor = await requireUser(request);
    const requestedParentId = url.searchParams.get('parentId');
    const employeeScope = url.searchParams.get('scope') === 'employee';
    const isEmployeeView = employeeScope || !isAdmin(actor);
    const staffRoot = await ensureStaffRoot();
    if (!requestedParentId || requestedParentId === staffRoot.id) {
      await cleanupAllEmptyInactiveEmployeeWorkspaces();
    }
    const workspace = !requestedParentId && isEmployeeView ? await ensureEmployeeWorkspace(actor) : null;
    const parent = requestedParentId
      ? requireFileAccess(actor, await fileNodeById(requestedParentId))
      : workspace?.root || await defaultFileDirectory(actor);
    if (employeeScope && parent.employee_id !== actor.id) {
      throw new HttpError(403, 'Chỉ được xem thư mục của chính nhân sự đang đăng nhập.');
    }
    if (parent.node_type !== 'dir') throw new HttpError(422, 'Vị trí cần xem không phải là thư mục.');
    const includeHidden = url.searchParams.get('includeHidden') === 'true';
    const rows = await db.prepare(`
      SELECT f.*, owner.employee_code AS owner_code
      FROM file_nodes f
      LEFT JOIN users owner ON owner.id = f.owner_id
      WHERE f.parent_id = ? AND f.deleted_at IS NULL AND (? = 1 OR f.is_hidden = 0)
      ORDER BY CASE f.node_type WHEN 'dir' THEN 0 ELSE 1 END, f.name COLLATE NOCASE
    `).all(parent.id, includeHidden ? 1 : 0);
    sendJson(response, 200, {
      data: rows.map(publicFileNode),
      context: {
        parentId: parent.id,
        isVirtualEmployeeRoot: isEmployeeView && !requestedParentId,
        rootLabel: workspace?.root.name || 'Nhân Sự',
        canShowHidden: true,
      },
    });
    return;
  }

  if (request.method === 'POST' && resource === '/files/folders') {
    const actor = await requireUser(request);
    const payload = await readJson(request);
    const requestedParent = payload.parentId
      ? ensureDirectoryWriteAccess(actor, await fileNodeById(String(payload.parentId)))
      : await defaultFileDirectory(actor);
    const parent = requestedParent;
    if (parent.parent_id === null) {
      throw new HttpError(403, 'Thư mục hệ thống này chỉ được tạo bởi quy trình cấp phát nhân sự.');
    }
    const name = normalizeFileName(payload.name, 'Tên thư mục');
    if (await db.prepare('SELECT 1 FROM file_nodes WHERE parent_id = ? AND name = ? AND deleted_at IS NULL').get(parent.id, name)) {
      throw new HttpError(409, 'Tên thư mục đã tồn tại.');
    }
    const timestamp = now();
    const id = randomUUID();
    await db.prepare(`INSERT INTO file_nodes (
      id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key,
      origin_module, is_hidden, is_system, is_protected, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'dir', '', 0, NULL, ?, 0, 0, 0, ?, ?)`)
      .run(id, parent.id, parent.employee_id || actor.id, actor.id, name, optionalText(payload.originModule, 'Nguồn tệp', 80) || 'files', timestamp, timestamp);
    sendJson(response, 201, { file: publicFileNode(await fileNodeById(id)) });
    return;
  }

  if (request.method === 'POST' && resource === '/files/upload') {
    const actor = await requireUser(request);
    const parentId = request.headers['x-parent-id'];
    const requestedParent = parentId
      ? ensureDirectoryWriteAccess(actor, await fileNodeById(String(parentId)))
      : await defaultFileDirectory(actor);
    const parent = requestedParent;
    if (parent.parent_id === null) {
      throw new HttpError(403, 'Không thể lưu tệp trực tiếp vào thư mục hệ thống này.');
    }
    const rawName = request.headers['x-file-name'];
    let name = normalizeFileName(rawName ? decodeURIComponent(String(rawName)) : '', 'Tên tệp');
    const originModule = optionalText(request.headers['x-origin-module'], 'Nguồn tệp', 80) || 'files';
    const mimeType = optionalText(request.headers['content-type'], 'Loại tệp', 200) || 'application/octet-stream';
    if (originModule === 'employee-files' && !isAllowedEmployeeUpload(name, mimeType)) {
      throw new HttpError(422, 'employee/files chỉ cho phép tải lên ảnh, video và tài liệu.');
    }
    const existingFile = await db.prepare('SELECT 1 FROM file_nodes WHERE parent_id = ? AND name = ? AND deleted_at IS NULL').get(parent.id, name);
    if (existingFile) {
      const extMatch = name.match(/^(.*?)(\.[^.]*)?$/);
      const base = extMatch ? extMatch[1] : name;
      const ext = extMatch && extMatch[2] ? extMatch[2] : '';
      let counter = 1;
      while (await db.prepare('SELECT 1 FROM file_nodes WHERE parent_id = ? AND name = ? AND deleted_at IS NULL').get(parent.id, `${base} (${counter})${ext}`)) {
        counter++;
      }
      name = `${base} (${counter})${ext}`;
    }
    const content = await readBinary(request);
    const id = randomUUID();
    const storageKey = `${id}.bin`;
    await writeFile(fileStoragePath(storageKey), content, { flag: 'wx' });
    const timestamp = now();
    await db.prepare(`INSERT INTO file_nodes (
      id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key,
      origin_module, is_hidden, is_system, is_protected, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'file', ?, ?, ?, ?, 0, 0, 0, ?, ?)`)
      .run(
        id,
        parent.id,
        parent.employee_id || actor.id,
        actor.id,
        name,
        mimeType,
        content.length,
        storageKey,
        originModule,
        timestamp,
        timestamp,
      );
    sendJson(response, 201, { file: publicFileNode(await fileNodeById(id)) });
    return;
  }

  const fileNodeMatch = /^\/files\/([^/]+)$/.exec(resource);
  if (fileNodeMatch && request.method === 'PATCH') {
    const actor = await requireUser(request);
    const node = requireFileAccess(actor, await fileNodeById(decodeURIComponent(fileNodeMatch[1])));
    if (node.is_protected) throw new HttpError(403, 'Không thể đổi tên thư mục hoặc tệp hệ thống được bảo vệ.');
    const payload = await readJson(request);
    const name = normalizeFileName(payload.name, 'Tên mới');
    if (await db.prepare('SELECT 1 FROM file_nodes WHERE parent_id = ? AND name = ? AND id != ? AND deleted_at IS NULL').get(node.parent_id, name, node.id)) {
      throw new HttpError(409, 'Tên tệp hoặc thư mục đã tồn tại.');
    }
    await db.prepare('UPDATE file_nodes SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), node.id);
    sendJson(response, 200, { file: publicFileNode(await fileNodeById(node.id)) });
    return;
  }

  if (fileNodeMatch && request.method === 'DELETE') {
    const actor = await requireUser(request);
    const node = requireFileAccess(actor, await fileNodeById(decodeURIComponent(fileNodeMatch[1])));
    if (node.is_protected) throw new HttpError(403, 'Không thể xóa thư mục hoặc tệp hệ thống được bảo vệ.');
    const child = await db.prepare('SELECT id FROM file_nodes WHERE parent_id = ? AND deleted_at IS NULL LIMIT 1').get(node.id);
    if (child) throw new HttpError(422, 'Chỉ có thể xóa thư mục trống.');
    await db.prepare('UPDATE file_nodes SET deleted_at = ?, updated_at = ? WHERE id = ?').run(now(), now(), node.id);
    sendJson(response, 200, { deleted: true });
    return;
  }

  if (request.method === 'GET' && resource === '/dashboard/stats') {
    await requireUser(request);
    const totalEmployees = Number((await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role != 'ADMIN'").get())?.count || 0);
    const totalUsers = Number((await db.prepare('SELECT COUNT(*) AS count FROM users').get())?.count || 0);
    const activeUsers = Number((await db.prepare('SELECT COUNT(*) AS count FROM users WHERE is_active = 1').get())?.count || 0);

    const currentMonthPrefix = new Date().toISOString().slice(0, 7);
    const newEmployeesThisMonth = Number((await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role != 'ADMIN' AND created_at LIKE ?").get(`${currentMonthPrefix}%`))?.count || 0);

    const revenueRow = await db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM finance_cash_transactions WHERE transaction_type = 'Thu' AND status = 'Đã hoàn thành' AND (transaction_date LIKE ? OR created_at LIKE ?)`).get(`${currentMonthPrefix}%`, `${currentMonthPrefix}%`);
    const expenseRow = await db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM finance_cash_transactions WHERE transaction_type = 'Chi' AND status = 'Đã hoàn thành' AND (transaction_date LIKE ? OR created_at LIKE ?)`).get(`${currentMonthPrefix}%`, `${currentMonthPrefix}%`);
    const monthlyRevenue = Number(revenueRow?.total || 0);
    const monthlyExpense = Number(expenseRow?.total || 0);

    const pendingProposals = Number((await db.prepare(`SELECT COUNT(*) AS count FROM employee_proposals WHERE status = 'Chờ duyệt'`).get())?.count || 0);
    const pendingTasks = Number((await db.prepare(`SELECT COUNT(*) AS count FROM tasks WHERE status = 'Chờ nghiệm thu'`).get())?.count || 0);
    const pendingContracts = Number((await db.prepare(`SELECT COUNT(*) AS count FROM contracts WHERE status IN ('Chờ ký', 'Chờ duyệt')`).get())?.count || 0);
    const pendingApprovalsCount = pendingProposals + pendingTasks + pendingContracts;

    const pendingProposalList = (await db.prepare(`
      SELECT p.*, u.name AS submitter_name, u.employee_code AS submitter_code, ep.department
      FROM employee_proposals p
      JOIN users u ON u.id = p.submitter_id
      LEFT JOIN employee_profiles ep ON ep.user_id = u.id
      WHERE p.status = 'Chờ duyệt'
      ORDER BY p.created_at DESC LIMIT 5
    `).all()).map((r) => ({
      key: r.id,
      id: r.id,
      code: r.code,
      title: r.title,
      requester: r.submitter_name,
      department: r.department || 'Doanh nghiệp',
      submittedDate: r.created_at ? r.created_at.slice(0, 10) : '',
      status: 'Đang xử lý',
      type: r.proposal_type,
      amount: r.estimated_amount,
    }));

    const auditRows = await db.prepare(`
      SELECT a.*, u.name AS actor_name, u.email AS actor_email
      FROM audit_events a
      LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.created_at DESC LIMIT 6
    `).all();

    const recentAuditLogs = auditRows.map((r) => ({
      key: r.id,
      time: formatRelativeTime(r.created_at),
      timestamp: r.created_at,
      action: `${r.actor_name || r.actor_email || 'Hệ thống'} ${r.action === 'create' ? 'tạo mới' : r.action === 'update' ? 'cập nhật' : r.action === 'delete' ? 'xóa' : r.action} [${r.resource_scope}]`,
      type: r.resource_scope || 'Hệ thống',
      user: r.actor_name || r.actor_email || 'Hệ thống',
      detail: r.resource_id ? `Mục: ${r.resource_id}` : '',
    }));

    sendJson(response, 200, {
      totalUsers,
      activeUsers,
      totalEmployees,
      newEmployeesThisMonth,
      monthlyRevenue,
      monthlyExpense,
      pendingApprovalsCount,
      pendingWorkflows: pendingProposalList,
      recentAuditLogs,
    });
    return;
  }

  const directiveReminderMatch = /^\/document-notes\/([^/]+)\/remind$/.exec(resource);
  if (directiveReminderMatch && request.method === 'POST') {
    const actor = await requireAdmin(request);
    const noteKey = requiredText(decodeURIComponent(directiveReminderMatch[1]), 'Mã chỉ đạo', 160);
    let result;
    await db.transaction(async () => {
      if (db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('doc_notes'))");
      const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'doc_notes' AND record_key = ? ORDER BY updated_at DESC LIMIT 1").get(noteKey);
      if (!row) throw new HttpError(404, 'Không tìm thấy chỉ đạo.');
      const note = publicCollectionRecord(row);
      const actionItems = Array.isArray(note.actionItems) ? note.actionItems : [];
      if (actionItems.length > 0 && actionItems.every((item) => item.done === true)) throw new HttpError(409, 'Chỉ đạo đã hoàn thành, không cần gửi nhắc việc.');
      const recipients = await db.prepare(`SELECT u.id FROM users u
        INNER JOIN employee_profiles p ON p.user_id = u.id
        WHERE u.is_active = 1 AND COALESCE(p.employment_status, '') <> 'Đã nghỉ việc'
          AND LOWER(TRIM(COALESCE(p.department, ''))) = LOWER(TRIM(?))
        ORDER BY u.id`).all(note.assignedToDept);
      if (recipients.length === 0) throw new HttpError(422, 'Đơn vị chưa có nhân sự đang hoạt động để nhận nhắc việc.');
      const timestamp = now();
      const notificationTitle = `Nhắc việc: ${note.noteCode}`.slice(0, 255);
      const notificationMessage = `${note.title}\nHạn chót: ${note.deadline}\nĐơn vị: ${note.assignedToDept}\n${String(note.content || '').slice(0, 1_400)}`.slice(0, 2_000);
      const notificationInsert = await db.prepare(`INSERT INTO notifications (id, user_id, title, message, type, link, is_read, created_at)
        VALUES (?, ?, ?, ?, 'document_note', '/admin/documents/notes', 0, ?)`);
      for (const recipient of recipients) await notificationInsert.run(randomUUID(), recipient.id, notificationTitle, notificationMessage, timestamp);
      const updated = {
        ...note,
        reminderHistory: [...(Array.isArray(note.reminderHistory) ? note.reminderHistory : []), {
          actor: actor.name, actorId: actor.id, at: timestamp, recipientCount: recipients.length,
        }],
        updatedAt: timestamp,
        updatedBy: actor.name,
        updatedById: actor.id,
        history: [...(Array.isArray(note.history) ? note.history : []), {
          action: `Gửi nhắc việc nội bộ đến ${recipients.length} nhân sự`, actor: actor.name, actorId: actor.id, at: timestamp,
        }],
      };
      await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(updated), timestamp, row.id);
      await recordAuditEvent(actor.id, 'send_internal_reminder', 'doc_notes', note.key, { recipientCount: recipients.length });
      result = { record: updated, recipientCount: recipients.length };
    });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'GET' && resource === '/notifications') {
    const actor = await requireUser(request);
    const rows = await db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(actor.id);
    sendJson(response, 200, { data: rows.map(publicNotification) });
    return;
  }

  if (request.method === 'POST' && resource === '/notifications') {
    const actor = await requireUser(request);
    const payload = await readJson(request, 64 * 1024);
    const title = requiredText(payload.title, 'Tiêu đề thông báo', 255);
    const message = requiredText(payload.message, 'Nội dung thông báo', 2000);
    const type = optionalText(payload.type, 'Loại thông báo', 64) || 'system';
    const link = optionalText(payload.link, 'Đường dẫn', 500) || '';
    const targetUserId = actor.role === 'ADMIN' && payload.userId ? payload.userId : actor.id;
    const timestamp = now();
    const id = randomUUID();

    await db.prepare(`INSERT INTO notifications (id, user_id, title, message, type, link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)`).run(id, targetUserId, title, message, type, link, timestamp);

    const created = await db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    sendJson(response, 201, { notification: publicNotification(created) });
    return;
  }

  const notifReadMatch = /^\/notifications\/([^/]+)\/read$/.exec(resource);
  if (notifReadMatch && request.method === 'PATCH') {
    const actor = await requireUser(request);
    const id = decodeURIComponent(notifReadMatch[1]);
    await db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(id, actor.id);
    const updated = await db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
    sendJson(response, 200, { notification: publicNotification(updated) });
    return;
  }

  if (request.method === 'POST' && resource === '/notifications/mark-all-read') {
    const actor = await requireUser(request);
    await db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(actor.id);
    const rows = await db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').all(actor.id);
    sendJson(response, 200, { data: rows.map(publicNotification) });
    return;
  }

  const notifMatch = /^\/notifications\/([^/]+)$/.exec(resource);
  if (notifMatch && request.method === 'DELETE') {
    const actor = await requireUser(request);
    const id = decodeURIComponent(notifMatch[1]);
    await db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(id, actor.id);
    sendJson(response, 200, { deleted: true });
    return;
  }

  if (request.method === 'DELETE' && resource === '/notifications') {
    const actor = await requireUser(request);
    await db.prepare('DELETE FROM notifications WHERE user_id = ?').run(actor.id);
    sendJson(response, 200, { deleted: true });
    return;
  }

  if (request.method === 'GET' && resource === '/admin/audit-logs') {
    await requireAdmin(request);
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(500, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const total = (await db.prepare('SELECT COUNT(*) AS count FROM audit_events').get())?.count;
    const rows = await db.prepare(`
      SELECT a.*, u.name AS actor_name, u.email AS actor_email
      FROM audit_events a
      LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.created_at DESC LIMIT ? OFFSET ?
    `).all(limit, (page - 1) * limit);
    const data = rows.map((r) => ({
      key: r.id,
      id: r.id,
      timestamp: r.created_at ? r.created_at.replace('T', ' ').slice(0, 19) : '',
      user: r.actor_name ? `${r.actor_name} (${r.actor_email || ''})` : (r.actor_email || 'Hệ thống'),
      action: r.action,
      module: r.resource_scope,
      detail: r.resource_id ? `Đối tượng: ${r.resource_id}` : (r.details_json || ''),
    }));
    sendJson(response, 200, { data, pagination: { page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) } });
    return;
  }

  if (request.method === 'POST' && resource === '/audit-events') {
    const actor = await requireUser(request);
    const payload = await readJson(request, 64 * 1024);
    const action = requiredText(payload.action, 'Hành động', 100);
    const moduleScope = optionalText(payload.module || payload.resourceScope, 'Phân hệ', 100) || 'Hệ thống';
    const detail = optionalText(payload.detail || payload.resourceId, 'Chi tiết', 500) || '';
    await recordAuditEvent(actor.id, action, moduleScope, detail, payload.details || {});
    sendJson(response, 201, { recorded: true });
    return;
  }

  if (request.method === 'GET' && resource === '/finance/payments') {
    const actor = await requireUser(request);
    const rows = actor.role === 'ADMIN'
      ? await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_payments' ORDER BY created_at DESC, record_key DESC").all()
      : await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_payments' AND owner_id = ? ORDER BY created_at DESC, record_key DESC").all(actor.id);
    sendJson(response, 200, { data: rows.map(publicCollectionRecord).filter(Boolean) });
    return;
  }

  if (request.method === 'GET' && resource === '/finance/payment-accounts') {
    await requireAdmin(request);
    const accounts = (await internalTransferAccounts()).filter(account => account.status === 'Đang hoạt động');
    sendJson(response, 200, { accounts });
    return;
  }

  if (request.method === 'POST' && resource === '/finance/payments') {
    const actor = await requireUser(request);
    const input = await readJson(request, 32 * 1024);
    const beneficiary = requiredText(input.beneficiary, 'Đơn vị thụ hưởng', 200);
    const category = requiredText(input.category, 'Nội dung thanh toán', 500);
    const amount = requiredAmount(input.amount, 'Số tiền thanh toán');
    if (amount < 1_000) throw new HttpError(422, 'Số tiền thanh toán tối thiểu là 1.000 đồng.');
    const paymentMethod = oneOf(input.paymentMethod, 'Phương thức thanh toán', ['Chuyển khoản VCB', 'Chuyển khoản TCB', 'Tiền mặt', 'Thẻ tín dụng DN']);
    const bankAccountInfo = requiredText(input.bankAccountInfo, 'Thông tin thụ hưởng', 200);
    const id = randomUUID();
    const timestamp = now();
    const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
    const createdDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    const payment = {
      key: id,
      code: `PAY-${dateParts.year}-${id.slice(0, 8).toUpperCase()}`,
      beneficiary,
      taxCode: optionalText(input.taxCode, 'Mã số thuế', 30),
      bankAccountInfo,
      category,
      amount,
      paymentMethod,
      creator: actor.name,
      creatorId: actor.id,
      empCode: actor.employee_code || '',
      approver: '',
      approverId: '',
      createdDate,
      createdAt: timestamp,
      status: 'Chờ duyệt',
      notes: optionalText(input.notes, 'Ghi chú', 1_000),
      history: [{ action: 'Trình duyệt', status: 'Chờ duyệt', actor: actor.name, actorId: actor.id, at: timestamp }],
    };
    await db.transaction(async () => {
      if (db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('finance_payments'))");
      await db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
        VALUES (?, 'finance_payments', ?, ?, ?, ?, ?)`)
        .run(id, id, actor.id, JSON.stringify(payment), timestamp, timestamp);
      await recordAuditEvent(actor.id, 'submit_payment_request', 'finance_payments', id, { amount, paymentMethod });
    });
    sendJson(response, 201, { payment });
    return;
  }

  const paymentActionMatch = /^\/finance\/payments\/([^/]+)\/(approve|reject|execute)$/.exec(resource);
  if (paymentActionMatch && request.method === 'POST') {
    const actor = await requireAdmin(request);
    const key = requiredText(decodeURIComponent(paymentActionMatch[1]), 'Mã đề nghị', 160);
    const action = paymentActionMatch[2];
    const input = await readJson(request, 16 * 1024);
    const reason = action === 'reject' ? requiredText(input.reason, 'Lý do từ chối', 1_000) : '';
    const settlementReference = action === 'execute' ? requiredText(input.settlementReference, 'Mã giao dịch hoặc chứng từ chi', 120) : '';
    const sourceAccountId = action === 'execute' ? requiredText(input.sourceAccountId, 'Tài khoản nguồn', 200) : '';
    if (action === 'execute' && settlementReference.length < 3) throw new HttpError(422, 'Mã giao dịch hoặc chứng từ chi phải có ít nhất 3 ký tự.');
    let payment;
    await db.transaction(async () => {
      if (db.pool) await db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [`finance_payments:${key}`]);
      const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_payments' AND record_key = ? ORDER BY created_at LIMIT 1").get(key);
      if (!row) throw new HttpError(404, 'Không tìm thấy đề nghị thanh toán.');
      const current = publicCollectionRecord(row);
      const timestamp = now();
      if (action === 'approve') {
        if (current.status !== 'Chờ duyệt') throw new HttpError(409, 'Đề nghị này không còn ở trạng thái chờ duyệt.');
        payment = { ...current, status: 'Đã phê duyệt', approver: actor.name, approverId: actor.id, approvedAt: timestamp };
      } else if (action === 'reject') {
        if (current.status !== 'Chờ duyệt') throw new HttpError(409, 'Chỉ có thể từ chối đề nghị đang chờ duyệt.');
        payment = { ...current, status: 'Từ chối', approver: actor.name, approverId: actor.id, rejectedAt: timestamp, rejectionReason: reason };
      } else {
        if (current.status !== 'Đã phê duyệt') throw new HttpError(409, 'Chỉ có thể ghi nhận chi cho đề nghị đã được phê duyệt.');
        await lockTransferLedger();
        const source = (await internalTransferAccounts()).find(account => account.key === sourceAccountId);
        if (!source || source.status !== 'Đang hoạt động') throw new HttpError(422, 'Tài khoản nguồn không tồn tại hoặc đã ngừng hoạt động.');
        if (current.paymentMethod === 'Tiền mặt' && source.source !== 'petty') throw new HttpError(422, 'Phương thức tiền mặt phải ghi chi từ quỹ tiền mặt.');
        if (current.paymentMethod !== 'Tiền mặt' && source.source !== 'bank') throw new HttpError(422, 'Phương thức thanh toán này phải ghi chi từ tài khoản ngân hàng.');
        if (current.paymentMethod === 'Chuyển khoản VCB' && !/vietcombank|\bvcb\b/i.test(source.name)) throw new HttpError(422, 'Hãy chọn tài khoản Vietcombank phù hợp với phương thức thanh toán.');
        if (current.paymentMethod === 'Chuyển khoản TCB' && !/techcombank|\btcb\b/i.test(source.name)) throw new HttpError(422, 'Hãy chọn tài khoản Techcombank phù hợp với phương thức thanh toán.');
        if (!Number.isSafeInteger(source.balance) || source.balance < current.amount) throw new HttpError(422, 'Số dư tài khoản nguồn không đủ cho khoản chi.');
        const transactionId = randomUUID();
        const transactionCode = `${current.code}-OUT`;
        const transactionNote = `${current.category}; Tham chiếu: ${settlementReference}`.slice(0, 1_000);
        const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
        }).formatToParts(new Date(timestamp)).map(part => [part.type, part.value]));
        const paymentDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
        await db.prepare(`INSERT INTO finance_cash_transactions (
          id, code, transaction_type, source, category, amount, transaction_date, counterparty,
          account_name, status, note, employee_code, created_by, created_at, updated_at
        ) VALUES (?, ?, 'Chi', ?, 'Thanh toán đề nghị', ?, ?, ?, ?, 'Đã hoàn thành', ?, ?, ?, ?, ?)`)
          .run(transactionId, transactionCode, source.source, current.amount, paymentDate, current.beneficiary,
            source.name, transactionNote, current.empCode || null, actor.id, timestamp, timestamp);
        payment = {
          ...current, status: 'Đã thanh toán', paidBy: actor.name, paidById: actor.id, paidAt: timestamp,
          settlementReference, settlementRecordedInternally: true, sourceAccountId: source.key,
          sourceAccount: source.name, sourceType: source.source, financeTransactionId: transactionId, ledgerRecorded: true,
        };
      }
      payment.history = [...(Array.isArray(current.history) ? current.history : []), {
        action: action === 'approve' ? 'Phê duyệt' : action === 'reject' ? 'Từ chối' : 'Ghi nhận đã chi',
        status: payment.status,
        actor: actor.name,
        actorId: actor.id,
        at: timestamp,
        ...(reason ? { reason } : {}),
        ...(settlementReference ? { reference: settlementReference } : {}),
        ...(payment.sourceAccount ? { sourceAccount: payment.sourceAccount, financeTransactionId: payment.financeTransactionId } : {}),
      }];
      await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?')
        .run(JSON.stringify(payment), timestamp, row.id);
      await recordAuditEvent(actor.id, `payment_${action}`, 'finance_payments', key, {
        code: payment.code,
        amount: payment.amount,
        ...(payment.sourceAccountId ? { sourceAccountId: payment.sourceAccountId, financeTransactionId: payment.financeTransactionId } : {}),
        ...(reason ? { reason } : {}),
        ...(settlementReference ? { settlementReference } : {}),
      });
    });
    sendJson(response, 200, { payment });
    return;
  }

  if (request.method === 'GET' && resource === '/finance/cash-transactions') {
    await requireAdmin(request);
    const source = url.searchParams.get('source');
    if (source && source !== 'bank' && source !== 'petty') throw new HttpError(422, 'Nguồn tiền không hợp lệ.');
    const rows = source
      ? await db.prepare('SELECT * FROM finance_cash_transactions WHERE source = ? ORDER BY transaction_date DESC, created_at DESC').all(source)
      : await db.prepare('SELECT * FROM finance_cash_transactions ORDER BY transaction_date DESC, created_at DESC').all();
    sendJson(response, 200, { data: rows.map(publicCashTransaction) });
    return;
  }

  if (request.method === 'POST' && resource === '/finance/cash-transactions') {
    const actor = await requireAdmin(request);
    const transaction = validateCashTransaction(await readJson(request));
    transaction.code = await nextUniqueCode(transaction.type === 'Thu' ? 'PT' : 'PC', 'finance_cash_transactions');
    const id = randomUUID();
    const timestamp = now();
    await db.prepare(`INSERT INTO finance_cash_transactions (
      id, code, transaction_type, source, category, amount, transaction_date, counterparty,
      account_name, status, note, department, employee_code, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        id, transaction.code, transaction.type, transaction.source, transaction.category,
        transaction.amount, transaction.date, transaction.recipientOrPayer, transaction.account,
        transaction.status, transaction.note, transaction.department || null, transaction.employeeCode || null,
        actor.id, timestamp, timestamp,
      );
    sendJson(response, 201, { transaction: publicCashTransaction(await db.prepare('SELECT * FROM finance_cash_transactions WHERE id = ?').get(id)) });
    return;
  }

  const cashTransactionMatch = /^\/finance\/cash-transactions\/([^/]+)$/.exec(resource);
  if (cashTransactionMatch && request.method === 'PATCH') {
    await requireAdmin(request);
    const id = decodeURIComponent(cashTransactionMatch[1]);
    const current = await db.prepare('SELECT * FROM finance_cash_transactions WHERE id = ?').get(id);
    if (!current) throw new HttpError(404, 'Không tìm thấy chứng từ thu chi.');
    if (/^TRF-[0-9a-f-]+-(OUT|IN|FEE)$/i.test(current.code)) {
      throw new HttpError(409, 'Chứng từ thuộc lệnh điều chuyển. Hãy hủy cả lệnh để bảo toàn hai bên sổ quỹ.');
    }
    const payload = await readJson(request);
    if (payload.status !== 'Đã hủy') throw new HttpError(422, 'Chỉ hỗ trợ hủy chứng từ qua API này.');
    await db.prepare('UPDATE finance_cash_transactions SET status = ?, updated_at = ? WHERE id = ?').run('Đã hủy', now(), id);
    sendJson(response, 200, { transaction: publicCashTransaction(await db.prepare('SELECT * FROM finance_cash_transactions WHERE id = ?').get(id)) });
    return;
  }

  if (request.method === 'GET' && resource === '/finance/internal-transfers') {
    await requireAdmin(request);
    const rows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_internal_transfers' ORDER BY created_at DESC, record_key").all();
    sendJson(response, 200, { data: rows.map(publicCollectionRecord).filter(Boolean), accounts: await internalTransferAccounts() });
    return;
  }

  if (request.method === 'POST' && resource === '/finance/internal-transfers') {
    const actor = await requireAdmin(request);
    const input = await readJson(request, 16 * 1024);
    const requestId = requiredText(input.requestId, 'Mã yêu cầu', 100);
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(requestId)) throw new HttpError(422, 'Mã yêu cầu không hợp lệ.');
    const sourceId = requiredText(input.sourceAccountId, 'Tài khoản nguồn', 200);
    const destinationId = requiredText(input.destinationAccountId, 'Tài khoản đích', 200);
    if (sourceId === destinationId) throw new HttpError(422, 'Tài khoản nguồn và đích phải khác nhau.');
    const amount = requiredAmount(input.amount, 'Số tiền điều chuyển');
    const fee = optionalAmount(input.fee, 'Phí thực tế');
    const purpose = requiredText(input.purpose, 'Nội dung điều chuyển', 1000);
    const transferDate = requiredIsoDate(input.transferDate, 'Ngày điều chuyển');
    if (new Date(`${transferDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== transferDate) throw new HttpError(422, 'Ngày điều chuyển không tồn tại.');
    if (transferDate > now().slice(0, 10)) throw new HttpError(422, 'Chỉ ghi sổ giao dịch đã thực hiện, không ghi ngày tương lai.');
    const transferMethod = oneOf(input.transferMethod || 'Ghi sổ nội bộ', 'Phương thức', ['Ghi sổ nội bộ', 'Napas 247', 'CITAD Liên Ngân Hàng', 'Rút séc / Nộp tiền mặt két']);
    const fingerprint = JSON.stringify({ sourceId, destinationId, amount, fee, purpose, transferDate, transferMethod });
    const key = `request-${actor.id}-${requestId}`;
    let transfer;
    let replayed = false;
    await db.transaction(async () => {
      await lockTransferLedger();
      const previous = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_internal_transfers' AND record_key = ? AND owner_id = ?").get(key, actor.id);
      if (previous) {
        transfer = publicCollectionRecord(previous);
        if (transfer.requestFingerprint !== fingerprint) throw new HttpError(409, 'Mã yêu cầu đã được dùng cho một lệnh khác.');
        replayed = true;
        return;
      }
      const accounts = await internalTransferAccounts();
      const source = accounts.find(item => item.key === sourceId);
      const destination = accounts.find(item => item.key === destinationId);
      if (!source || !destination) throw new HttpError(422, 'Không tìm thấy tài khoản hoặc quỹ đã chọn.');
      if ([source, destination].some(item => item.status !== 'Đang hoạt động')) throw new HttpError(422, 'Tài khoản điều chuyển phải đang hoạt động.');
      if (!Number.isSafeInteger(source.balance) || source.balance < amount + fee) throw new HttpError(422, 'Số dư tài khoản nguồn không đủ cho số tiền và phí điều chuyển.');
      const id = randomUUID();
      const timestamp = now();
      const code = `TRF-${id}`;
      const transactionIds = [randomUUID(), randomUUID(), ...(fee > 0 ? [randomUUID()] : [])];
      const insert = db.prepare(`INSERT INTO finance_cash_transactions (
        id, code, transaction_type, source, category, amount, transaction_date, counterparty,
        account_name, status, note, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Đã hoàn thành', ?, ?, ?, ?)`);
      await insert.run(transactionIds[0], `${code}-OUT`, 'Chi', source.source, 'Chuyển tiền nội bộ', amount, transferDate, destination.name, source.name, purpose, actor.id, timestamp, timestamp);
      await insert.run(transactionIds[1], `${code}-IN`, 'Thu', destination.source, 'Chuyển tiền nội bộ', amount, transferDate, source.name, destination.name, purpose, actor.id, timestamp, timestamp);
      if (fee > 0) await insert.run(transactionIds[2], `${code}-FEE`, 'Chi', source.source, 'Phí điều chuyển nội bộ', fee, transferDate, 'Phí thực tế do người lập ghi nhận', source.name, purpose, actor.id, timestamp, timestamp);
      transfer = {
        key, transferCode: code, sourceAccountId: sourceId, destinationAccountId: destinationId,
        sourceAccount: source.name, destinationAccount: destination.name, sourceType: source.source, destinationType: destination.source,
        amount, fee, purpose, transferDate, transferMethod, time: timestamp.slice(11, 19) + ' UTC',
        executor: actor.name, executorId: actor.id, approver: '', status: 'Thành công',
        ledgerRecorded: true, executionStatus: 'ledger_only', transactionIds, requestFingerprint: fingerprint,
        createdAt: timestamp, updatedAt: timestamp,
      };
      await db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
        VALUES (?, 'finance_internal_transfers', ?, ?, ?, ?, ?)`)
        .run(id, key, actor.id, JSON.stringify(transfer), timestamp, timestamp);
      await recordAuditEvent(actor.id, 'record_internal_transfer', 'finance_internal_transfers', key, { amount, fee, sourceId, destinationId, transactionIds });
    });
    sendJson(response, replayed ? 200 : 201, { transfer, replayed });
    return;
  }

  const transferCancelMatch = /^\/finance\/internal-transfers\/([^/]+)\/cancel$/.exec(resource);
  if (transferCancelMatch && request.method === 'POST') {
    const actor = await requireAdmin(request);
    const key = requiredText(decodeURIComponent(transferCancelMatch[1]), 'Mã lệnh', 160);
    const reason = requiredText((await readJson(request, 16 * 1024)).reason, 'Lý do hủy', 1000);
    let transfer;
    await db.transaction(async () => {
      await lockTransferLedger();
      const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_internal_transfers' AND record_key = ? ORDER BY created_at LIMIT 1").get(key);
      if (!row) throw new HttpError(404, 'Không tìm thấy lệnh điều chuyển.');
      transfer = publicCollectionRecord(row);
      if (!transfer.ledgerRecorded || !Array.isArray(transfer.transactionIds)) throw new HttpError(409, 'Lệnh cũ chưa có chứng từ liên kết, cần đối chiếu trước khi hủy.');
      if (transfer.status === 'Đã hủy') return;
      const destination = (await internalTransferAccounts()).find(item => item.key === transfer.destinationAccountId);
      if (!destination || destination.balance < transfer.amount) throw new HttpError(422, 'Tài khoản đích không đủ số dư để hoàn lại lệnh điều chuyển.');
      const timestamp = now();
      for (const transactionId of transfer.transactionIds) {
        const current = await db.prepare('SELECT * FROM finance_cash_transactions WHERE id = ?').get(transactionId);
        if (!current || current.status !== 'Đã hoàn thành') throw new HttpError(409, 'Chứng từ liên kết không đầy đủ, cần đối chiếu sổ quỹ.');
        await db.prepare("UPDATE finance_cash_transactions SET status = 'Đã hủy', updated_at = ? WHERE id = ?").run(timestamp, transactionId);
      }
      transfer = { ...transfer, status: 'Đã hủy', canceledBy: actor.name, canceledById: actor.id, canceledAt: timestamp, cancelReason: reason, updatedAt: timestamp };
      await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(transfer), timestamp, row.id);
      await recordAuditEvent(actor.id, 'cancel_internal_transfer', 'finance_internal_transfers', key, { reason });
    });
    sendJson(response, 200, { transfer });
    return;
  }

  const inventoryShipmentStatus = /^\/finance\/inventory\/transactions\/([^/]+)\/shipment-status$/.exec(resource);
  if (request.method === 'POST' && inventoryShipmentStatus) {
    const actor = await requireAdmin(request);
    const transactionCode = requiredText(decodeURIComponent(inventoryShipmentStatus[1]), 'Mã giao dịch', 100).toLocaleUpperCase('vi-VN');
    const payload = await readJson(request, 64 * 1024);
    const nextStatus = oneOf(payload.status, 'Trạng thái giao hàng', ['Đang giao', 'Đã giao', 'Giao thất bại']);
    const result = await db.transaction(async () => {
      if (db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('finance_inventory'))");
      const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_inventory_transactions' AND record_key = ? ORDER BY created_at LIMIT 1").get(transactionCode);
      if (!row) throw new HttpError(404, 'Không tìm thấy giao dịch giao hàng.');
      const transaction = publicCollectionRecord(row);
      if (transaction.type !== 'Giao hàng') throw new HttpError(422, 'Giao dịch này không phải phiếu giao hàng.');
      if (transaction.shipmentStatus === nextStatus) return transaction;
      const allowed = transaction.shipmentStatus === 'Chờ giao' ? ['Đang giao'] : transaction.shipmentStatus === 'Đang giao' ? ['Đã giao', 'Giao thất bại'] : [];
      if (!allowed.includes(nextStatus)) throw new HttpError(409, 'Trạng thái giao hàng không thể chuyển theo luồng này.');
      const note = nextStatus === 'Giao thất bại' ? requiredText(payload.reason, 'Lý do giao thất bại', 500) : optionalText(payload.note, 'Ghi chú cập nhật', 500);
      const timestamp = now();
      const updated = { ...transaction, shipmentStatus: nextStatus, shipmentHistory: [...(Array.isArray(transaction.shipmentHistory) ? transaction.shipmentHistory : []), { from: transaction.shipmentStatus, to: nextStatus, at: timestamp, actor: actor.name, actorId: actor.id, note }] };
      await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updated), timestamp, row.id);
      await recordAuditEvent(actor.id, 'inventory_shipment_status', 'finance_inventory_transactions', transactionCode, { from: transaction.shipmentStatus, to: nextStatus });
      return updated;
    });
    sendJson(response, 200, { transaction: result });
    return;
  }

  const inventoryShipmentReturn = /^\/finance\/inventory\/transactions\/([^/]+)\/returns$/.exec(resource);
  if (request.method === 'POST' && inventoryShipmentReturn) {
    const actor = await requireAdmin(request);
    const transactionCode = requiredText(decodeURIComponent(inventoryShipmentReturn[1]), 'Mã giao dịch', 100).toLocaleUpperCase('vi-VN');
    const payload = await readJson(request, 256 * 1024);
    const result = await receiveInventoryShipmentReturn(actor, transactionCode, payload);
    sendJson(response, result.replayed ? 200 : 201, result);
    return;
  }

  if (request.method === 'POST' && resource === '/finance/inventory/transactions') {
    const actor = await requireAdmin(request);
    const result = await createInventoryTransaction(actor, await readJson(request, 512 * 1024));
    sendJson(response, result.replayed ? 200 : 201, result);
    return;
  }

  const assetTransferAction = /^\/assets\/transfers\/([^/]+)\/(approve|reject|receive)$/.exec(resource);
  const assetAllocationAction = /^\/assets\/allocations\/([^/]+)\/confirm$/.exec(resource);
  if (request.method === 'POST' && (resource === '/assets/allocations' || assetAllocationAction)) {
    const actor = await requireAdmin(request);
    const input = await readJson(request);
    const timestamp = now();
    let result;
    await db.transaction(async () => {
      if (db.pool) {
        await db.query("SELECT pg_advisory_xact_lock(hashtext('asset_allocations'))");
        await db.query("SELECT pg_advisory_xact_lock(hashtext('asset_items'))");
      }
      const rows = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'asset_allocations'").all();
      const existing = rows.map((row) => parseJsonObject(row.payload_json));
      if (!assetAllocationAction) {
        const ticketCode = requiredText(input.ticketCode, 'Mã biên bản', 80);
        const type = oneOf(input.type, 'Loại nghiệp vụ', ['Cấp phát', 'Thu hồi']);
        const assetCode = requiredText(input.assetCode, 'Mã tài sản', 160);
        const employeeCode = requiredText(input.employeeCode, 'Mã nhân viên', 80);
        const employee = await db.prepare(`SELECT u.id, u.name, u.employee_code, u.is_active, p.department, p.position, p.employment_status
          FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id
          WHERE LOWER(u.employee_code) = LOWER(?) AND u.role != 'ADMIN' AND u.is_active = 1`).get(employeeCode);
        if (!employee || employee.employment_status === 'Đã nghỉ việc') throw new HttpError(422, 'Chọn nhân viên đang làm việc trong danh bạ.');
        const assetRows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items'").all();
        const matches = assetRows.map((row) => ({ row, asset: publicCollectionRecord(row) }))
          .filter(({ asset }) => String(asset?.code || asset?.assetCode || '').trim().toLocaleLowerCase('vi-VN') === assetCode.trim().toLocaleLowerCase('vi-VN'));
        if (!matches.length) throw new HttpError(404, 'Không tìm thấy tài sản trong danh mục.');
        if (matches.length !== 1) throw new HttpError(409, 'Mã tài sản bị trùng trong danh mục.');
        const { row: assetRow } = matches[0];
        const asset = publicCollectionRecord(assetRow);
        if (existing.some((item) => String(item.ticketCode || '').trim().toLocaleLowerCase('vi-VN') === ticketCode.toLocaleLowerCase('vi-VN'))) throw new HttpError(409, 'Mã biên bản đã tồn tại.');
        if (existing.some((item) => item.assetKey === asset.key && item.status === 'Chờ nhân viên ký xác nhận')) throw new HttpError(409, 'Tài sản đã có biên bản cấp phát đang chờ xác nhận.');
        const allocatedDate = requiredIsoDate(input.allocatedDate, 'Ngày bàn giao hoặc thu hồi');
        const expectedReturnDate = optionalText(input.expectedReturnDate, 'Hạn trả dự kiến', 40);
        if (expectedReturnDate && expectedReturnDate.normalize('NFKC').trim().toLocaleLowerCase('vi-VN') !== 'vô thời hạn') {
          requiredIsoDate(expectedReturnDate, 'Hạn trả dự kiến');
          if (expectedReturnDate < allocatedDate) throw new HttpError(422, 'Hạn trả dự kiến không được trước ngày bàn giao.');
        }
        const condition = requiredText(input.condition, 'Tình trạng tài sản', 2000);
        const employeeName = requiredText(employee.name, 'Tên nhân viên', 255);
        const same = (left, right) => String(left || '').normalize('NFKC').trim().toLocaleLowerCase('vi-VN') === String(right || '').normalize('NFKC').trim().toLocaleLowerCase('vi-VN');
        if (type === 'Cấp phát' && asset.status !== 'Trong kho') throw new HttpError(409, 'Chỉ cấp phát tài sản đang ở kho.');
        if (type === 'Thu hồi') {
          if (asset.status !== 'Đang sử dụng' || !same(asset.assignedTo, employeeName)) throw new HttpError(409, 'Tài sản không đang được giữ bởi nhân viên trong biên bản.');
        }
        const department = String(employee.department || '').trim() || requiredText(input.department, 'Phòng ban', 255);
        const position = String(employee.position || '').trim() || optionalText(input.position, 'Chức vụ', 255);
        const assetOrigin = { status: String(asset.status || ''), assignedTo: String(asset.assignedTo || ''), department: String(asset.department || ''), location: String(asset.location || '') };
        result = {
          key: randomUUID(), ticketCode, type,
          assetKey: asset.key, assetCode: requiredText(asset.code || asset.assetCode, 'Mã tài sản', 160),
          assetName: requiredText(asset.name || asset.assetName, 'Tên tài sản', 255), category: String(asset.category || ''),
          serialNo: String(asset.serialNo || asset.serialNumber || ''), employeeCode: employee.employee_code,
          employeeId: employee.id, employeeName, department, position,
          handoverPerson: requiredText(input.handoverPerson, 'Cán bộ bàn giao', 255),
          allocatedDate, expectedReturnDate,
          purpose: oneOf(input.purpose, 'Mục đích', ['Cấp phát chính thức cho nhân viên mới', 'Cấp phát theo dự án ngắn hạn', 'Thay thế thiết bị bảo hành', 'Thu hồi do nhân viên nghỉ việc', 'Thu hồi định kỳ nâng cấp', 'Thu hồi do chuyển đổi vị trí']),
          condition, accessories: optionalText(input.accessories, 'Phụ kiện', 2000),
          compensationAmount: optionalAmount(input.compensationAmount, 'Số tiền bồi thường'),
          signedByReceiver: false, notes: optionalText(input.notes, 'Ghi chú', 4000), assetOrigin,
          status: type === 'Cấp phát' ? 'Chờ nhân viên ký xác nhận' : 'Đã thu hồi về kho',
          createdAt: timestamp, createdBy: actor.name, createdById: actor.id,
        };
        if (type === 'Thu hồi') {
          result.receivedAt = timestamp;
          result.receivedByAccount = actor.name;
          result.receivedByAccountId = actor.id;
          const updatedAsset = {
            ...asset, status: 'Trong kho', assignedTo: '',
            history: [...(Array.isArray(asset.history) ? asset.history : []), {
              key: randomUUID(), date: timestamp, action: 'Thu hồi tài sản', actor: actor.name, actorId: actor.id,
              note: `Biên bản ${ticketCode}; thu hồi từ ${employeeName}; tình trạng: ${condition}`,
            }],
          };
          await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updatedAsset), timestamp, assetRow.id);
        }
        await db.prepare("INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at) VALUES (?, 'asset_allocations', ?, ?, ?, ?, ?)")
          .run(randomUUID(), result.key, actor.id, JSON.stringify(result), timestamp, timestamp);
        await recordAuditEvent(actor.id, type === 'Cấp phát' ? 'create_asset_allocation' : 'return_asset', 'asset_allocations', result.key, { assetKey: asset.key });
      } else {
        const key = requiredText(decodeURIComponent(assetAllocationAction[1]), 'Mã biên bản', 160);
        const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_allocations' AND record_key = ?").get(key);
        if (!row) throw new HttpError(404, 'Không tìm thấy biên bản cấp phát.');
        const allocation = publicCollectionRecord(row);
        if (allocation.type !== 'Cấp phát' || allocation.status !== 'Chờ nhân viên ký xác nhận') throw new HttpError(409, 'Biên bản không còn chờ xác nhận bàn giao.');
        const receiverName = requiredText(input.receiverName, 'Tên người nhận xác nhận', 255);
        const same = (left, right) => String(left || '').normalize('NFKC').trim().toLocaleLowerCase('vi-VN') === String(right || '').normalize('NFKC').trim().toLocaleLowerCase('vi-VN');
        if (!same(receiverName, allocation.employeeName)) throw new HttpError(422, 'Tên xác nhận phải khớp với nhân viên nhận trên biên bản.');
        const employee = await db.prepare(`SELECT u.id, u.is_active, p.employment_status FROM users u
          LEFT JOIN employee_profiles p ON p.user_id = u.id WHERE u.id = ? AND u.role != 'ADMIN'`).get(allocation.employeeId);
        if (!employee || !employee.is_active || employee.employment_status === 'Đã nghỉ việc') throw new HttpError(409, 'Nhân viên nhận không còn hoạt động; cần lập lại biên bản với nhân viên phù hợp.');
        const assetRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items' AND record_key = ?").get(allocation.assetKey);
        if (!assetRow) throw new HttpError(404, 'Không tìm thấy tài sản gốc.');
        const asset = publicCollectionRecord(assetRow);
        const origin = allocation.assetOrigin || {};
        if (asset.status !== 'Trong kho' || !same(asset.status, origin.status) || !same(asset.assignedTo, origin.assignedTo)
          || !same(asset.department, origin.department) || !same(asset.location, origin.location)) throw new HttpError(409, 'Thông tin tài sản đã thay đổi trong lúc chờ xác nhận. Cần đối chiếu trước khi bàn giao.');
        if (existing.some((item) => item.key !== key && item.assetKey === asset.key && item.status === 'Chờ nhân viên ký xác nhận')) throw new HttpError(409, 'Tài sản đang có biên bản cấp phát khác chờ xác nhận.');
        const updatedAsset = {
          ...asset, status: 'Đang sử dụng', assignedTo: allocation.employeeName, department: allocation.department,
          history: [...(Array.isArray(asset.history) ? asset.history : []), {
            key: randomUUID(), date: timestamp, action: 'Cấp phát tài sản', actor: actor.name, actorId: actor.id,
            note: `Biên bản ${allocation.ticketCode}; người nhận ${allocation.employeeName}; tình trạng: ${allocation.condition}`,
          }],
        };
        await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updatedAsset), timestamp, assetRow.id);
        result = { ...allocation, signedByReceiver: true, signedByName: allocation.employeeName, signedByAccount: actor.name, signedByAccountId: actor.id, signedAt: timestamp, status: 'Đã bàn giao hoàn tất' };
        await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(result), timestamp, row.id);
        await recordAuditEvent(actor.id, 'confirm_asset_allocation', 'asset_allocations', key, { assetKey: asset.key });
      }
    });
    sendJson(response, assetAllocationAction ? 200 : 201, { record: result });
    return;
  }

  const assetRepairAction = /^\/assets\/repairs\/([^/]+)\/(approve|transition|complete)$/.exec(resource);
  if (request.method === 'POST' && (resource === '/assets/repairs' || assetRepairAction)) {
    const actor = await requireAdmin(request);
    const input = await readJson(request);
    const timestamp = now();
    let result;
    await db.transaction(async () => {
      if (db.pool) {
        await db.query("SELECT pg_advisory_xact_lock(hashtext('asset_repairs'))");
        await db.query("SELECT pg_advisory_xact_lock(hashtext('asset_items'))");
      }
      const same = (left, right) => String(left || '').normalize('NFKC').trim().toLocaleLowerCase('vi-VN') === String(right || '').normalize('NFKC').trim().toLocaleLowerCase('vi-VN');
      const assetRows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items'").all();
      const findAsset = (code) => {
        const matches = assetRows.map((row) => ({ row, asset: publicCollectionRecord(row) }))
          .filter(({ asset }) => same(asset?.code || asset?.assetCode, code));
        if (!matches.length) throw new HttpError(404, 'Không tìm thấy tài sản trong danh mục.');
        if (matches.length !== 1) throw new HttpError(409, 'Mã tài sản bị trùng trong danh mục.');
        return matches[0];
      };
      const addHistory = (asset, action, note) => ({
        ...asset,
        history: [...(Array.isArray(asset.history) ? asset.history : []), {
          key: randomUUID(), date: timestamp, action, actor: actor.name, actorId: actor.id, note,
        }],
      });

      if (!assetRepairAction) {
        const repairCode = requiredText(input.repairCode, 'Mã phiếu sửa', 80);
        const assetCode = requiredText(input.assetCode, 'Mã tài sản', 160);
        const { row: assetRow, asset } = findAsset(assetCode);
        const existingRows = await db.prepare("SELECT payload_json FROM collection_records WHERE scope = 'asset_repairs'").all();
        const existing = existingRows.map((row) => parseJsonObject(row.payload_json));
        if (existing.some((item) => same(item.repairCode, repairCode))) throw new HttpError(409, 'Mã phiếu sửa đã tồn tại.');
        if (existing.some((item) => item.assetKey === asset.key && !['Đã sửa xong & Bàn giao', 'Không thể sửa chữa'].includes(item.status))) {
          throw new HttpError(409, 'Tài sản đã có phiếu sửa chữa đang mở.');
        }
        if (!['Trong kho', 'Đang sử dụng'].includes(asset.status)) throw new HttpError(409, 'Chỉ tiếp nhận sửa tài sản trong kho hoặc đang sử dụng.');
        const startDate = requiredIsoDate(input.startDate, 'Ngày gửi máy');
        const expectedEndDate = requiredIsoDate(input.expectedEndDate, 'Ngày dự kiến hoàn thành');
        if (expectedEndDate < startDate) throw new HttpError(422, 'Ngày dự kiến hoàn thành không được trước ngày gửi máy.');
        if (input.estimatedCost === undefined || input.estimatedCost === null || input.estimatedCost === '') throw new HttpError(422, 'Nhập chi phí dự toán.');
        const assetOrigin = {
          status: String(asset.status || ''), assignedTo: String(asset.assignedTo || ''),
          department: String(asset.department || ''), location: String(asset.location || ''),
        };
        result = {
          key: randomUUID(), repairCode, assetKey: asset.key,
          assetCode: requiredText(asset.code || asset.assetCode, 'Mã tài sản', 160),
          assetName: requiredText(asset.name || asset.assetName, 'Tên tài sản', 255),
          category: String(asset.category || ''), serialNo: String(asset.serialNo || asset.serialNumber || ''),
          requester: requiredText(input.requester, 'Người báo hỏng', 255),
          department: requiredText(input.department, 'Phòng ban', 255),
          severity: oneOf(input.severity, 'Mức độ nghiêm trọng', ['Khẩn cấp (P1)', 'Cao (P2)', 'Trung bình (P3)', 'Thấp']),
          repairUnit: oneOf(input.repairUnit, 'Hình thức sửa chữa', ['Nội bộ IT Cty', 'Trung tâm bảo hành chính hãng', 'Đơn vị dịch vụ ngoài']),
          vendor: requiredText(input.vendor, 'Đơn vị sửa chữa', 255), vendorContact: optionalText(input.vendorContact, 'Liên hệ đơn vị sửa chữa', 255),
          issueDescription: requiredText(input.issueDescription, 'Mô tả sự cố', 4000),
          rootCause: optionalText(input.rootCause, 'Nguyên nhân', 2000), solution: optionalText(input.solution, 'Phương án khắc phục', 2000),
          replacedParts: optionalText(input.replacedParts, 'Linh kiện thay thế', 2000),
          estimatedCost: optionalAmount(input.estimatedCost, 'Chi phí dự toán'), actualCost: 0,
          costBearing: oneOf(input.costBearing, 'Nguồn kinh phí', ['Bảo hành miễn phí hãng', 'Công ty chi trả', 'Bảo hiểm chi trả', 'Cá nhân bồi thường']),
          startDate, expectedEndDate, warrantyAfterRepair: optionalText(input.warrantyAfterRepair, 'Bảo hành sau sửa', 255),
          status: 'Chờ duyệt báo giá', approver: '', notes: optionalText(input.notes, 'Ghi chú', 4000), assetOrigin,
          createdAt: timestamp, createdBy: actor.name, createdById: actor.id,
        };
        const updatedAsset = addHistory({ ...asset, status: 'Đang sửa chữa' }, 'Bắt đầu sửa chữa', `Phiếu ${repairCode}; ${result.issueDescription}`);
        await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updatedAsset), timestamp, assetRow.id);
        await db.prepare("INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at) VALUES (?, 'asset_repairs', ?, ?, ?, ?, ?)")
          .run(randomUUID(), result.key, actor.id, JSON.stringify(result), timestamp, timestamp);
        await recordAuditEvent(actor.id, 'create_asset_repair', 'asset_repairs', result.key, { assetKey: asset.key });
      } else {
        const key = requiredText(decodeURIComponent(assetRepairAction[1]), 'Mã phiếu sửa', 160);
        const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_repairs' AND record_key = ?").get(key);
        if (!row) throw new HttpError(404, 'Không tìm thấy phiếu sửa chữa.');
        const repair = publicCollectionRecord(row);
        const transition = assetRepairAction[2];
        if (transition === 'approve') {
          if (repair.status !== 'Chờ duyệt báo giá') throw new HttpError(409, 'Phiếu không còn chờ duyệt báo giá.');
          const assetRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items' AND record_key = ?").get(repair.assetKey);
          if (!assetRow) throw new HttpError(404, 'Không tìm thấy tài sản gốc.');
          const asset = publicCollectionRecord(assetRow);
          const origin = repair.assetOrigin || {};
          if (asset.status !== 'Đang sửa chữa' || !same(asset.assignedTo, origin.assignedTo)
            || !same(asset.department, origin.department) || !same(asset.location, origin.location)) {
            throw new HttpError(409, 'Thông tin tài sản đã thay đổi so với lúc tiếp nhận sửa chữa; cần đối chiếu trước khi cập nhật.');
          }
          result = { ...repair, status: 'Đang sửa chữa tại hãng', approver: actor.name, approverId: actor.id, approvedAt: timestamp, updatedAt: timestamp };
        } else {
          const assetRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items' AND record_key = ?").get(repair.assetKey);
          if (!assetRow) throw new HttpError(404, 'Không tìm thấy tài sản gốc.');
          const asset = publicCollectionRecord(assetRow);
          const origin = repair.assetOrigin || {};
          if (asset.status !== 'Đang sửa chữa' || !same(asset.assignedTo, origin.assignedTo)
            || !same(asset.department, origin.department) || !same(asset.location, origin.location)) {
            throw new HttpError(409, 'Thông tin tài sản đã thay đổi so với lúc tiếp nhận sửa chữa; cần đối chiếu trước khi cập nhật.');
          }
          if (transition === 'complete') {
            if (repair.status !== 'Đang sửa chữa tại hãng') throw new HttpError(409, 'Chỉ nghiệm thu khi phiếu đang sửa chữa.');
            if (input.actualCost === undefined || input.actualCost === null || input.actualCost === '') throw new HttpError(422, 'Nhập chi phí thực tế.');
            const actualCost = optionalAmount(input.actualCost, 'Chi phí thực tế');
            const completionNotes = requiredText(input.completionNotes, 'Kết quả nghiệm thu', 2000);
            result = {
              ...repair, status: 'Đã sửa xong & Bàn giao', actualCost, completedDate: timestamp,
              completedBy: actor.name, completedById: actor.id,
              notes: [repair.notes, `Nghiệm thu: ${completionNotes}`].filter(Boolean).join('\n'), updatedAt: timestamp,
            };
            const restoredStatus = origin.status === 'Đang sử dụng' ? 'Đang sử dụng' : 'Trong kho';
            const updatedAsset = addHistory({ ...asset, status: restoredStatus }, 'Hoàn tất sửa chữa', `Phiếu ${repair.repairCode}; ${completionNotes}`);
            await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updatedAsset), timestamp, assetRow.id);
          } else {
            const nextStatus = oneOf(input.status, 'Trạng thái sửa chữa', ['Đang sửa chữa tại hãng', 'Chờ linh kiện thay thế', 'Không thể sửa chữa']);
            const source = repair.status;
            const allowed = nextStatus === 'Đang sửa chữa tại hãng'
              ? source === 'Chờ linh kiện thay thế'
              : nextStatus === 'Chờ linh kiện thay thế'
                ? source === 'Đang sửa chữa tại hãng'
                : ['Đang sửa chữa tại hãng', 'Chờ linh kiện thay thế'].includes(source);
            if (!allowed) throw new HttpError(409, 'Trạng thái phiếu không cho phép chuyển theo yêu cầu.');
            const note = optionalText(input.note, 'Ghi chú chuyển trạng thái', 1000);
            result = { ...repair, status: nextStatus, notes: [repair.notes, `${timestamp} | ${actor.name} | ${nextStatus}${note ? `: ${note}` : ''}`].filter(Boolean).join('\n'), updatedAt: timestamp };
            const assetStatus = nextStatus === 'Không thể sửa chữa' ? 'Chờ thanh lý' : 'Đang sửa chữa';
            const action = nextStatus === 'Đang sửa chữa tại hãng' ? 'Tiếp tục sửa chữa' : nextStatus;
            const updatedAsset = addHistory({ ...asset, status: assetStatus }, action, `Phiếu ${repair.repairCode}${note ? `; ${note}` : ''}`);
            await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updatedAsset), timestamp, assetRow.id);
          }
        }
        await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(result), timestamp, row.id);
        await recordAuditEvent(actor.id, `asset_repair_${transition}`, 'asset_repairs', key, { assetKey: repair.assetKey, status: result.status });
      }
    });
    sendJson(response, assetRepairAction ? 200 : 201, { record: result });
    return;
  }

  if (request.method === 'POST' && (resource === '/assets/transfers' || assetTransferAction)) {
    const actor = await requireAdmin(request);
    const input = await readJson(request);
    const timestamp = now();
    let result;
    await db.transaction(async () => {
      if (db.pool) {
        await db.query("SELECT pg_advisory_xact_lock(hashtext('asset_transfers'))");
        await db.query("SELECT pg_advisory_xact_lock(hashtext('asset_items'))");
      }
      const findAsset = async (key, code) => {
        if (key) {
          const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items' AND record_key = ?").get(key);
          if (!row) throw new HttpError(404, 'Không tìm thấy tài sản gốc.');
          return row;
        }
        const rows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_items'").all();
        const wanted = String(code || '').trim().toLocaleLowerCase('vi-VN');
        const matching = rows.filter((row) => String(publicCollectionRecord(row)?.code || publicCollectionRecord(row)?.assetCode || '').trim().toLocaleLowerCase('vi-VN') === wanted);
        if (matching.length !== 1) throw new HttpError(409, 'Không xác định duy nhất tài sản gốc theo mã.');
        return matching[0];
      };
      if (!assetTransferAction) {
        const transferCode = requiredText(input.transferCode, 'Mã lệnh điều chuyển', 80);
        const assetCode = requiredText(input.assetCode, 'Mã tài sản', 160);
        const row = await findAsset('', assetCode);
        const asset = publicCollectionRecord(row);
        if (asset.status === 'Đã thanh lý') throw new HttpError(422, 'Không thể điều chuyển tài sản đã thanh lý.');
        const existingRows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_transfers'").all();
        const existing = existingRows.map(publicCollectionRecord).filter(Boolean);
        if (existing.some((item) => String(item.transferCode || '').trim().toLocaleLowerCase('vi-VN') === transferCode.toLocaleLowerCase('vi-VN'))) throw new HttpError(409, 'Mã lệnh điều chuyển đã tồn tại.');
        if (existing.some((item) => ['Chờ phê duyệt', 'Đang vận chuyển'].includes(item.status) && (item.assetKey === asset.key || String(item.assetCode || '').trim().toLocaleLowerCase('vi-VN') === assetCode.toLocaleLowerCase('vi-VN')))) throw new HttpError(409, 'Tài sản đã có lệnh điều chuyển đang xử lý.');
        const transferDate = requiredIsoDate(input.transferDate, 'Ngày gửi');
        const expectedDeliveryDate = requiredIsoDate(input.expectedDeliveryDate, 'Ngày nhận dự kiến');
        if (expectedDeliveryDate < transferDate) throw new HttpError(422, 'Ngày nhận dự kiến không được trước ngày gửi.');
        const origin = { location: String(asset.location || ''), department: String(asset.department || ''), assignedTo: String(asset.assignedTo || '') };
        result = {
          key: randomUUID(), transferCode, assetKey: asset.key, assetCode: asset.code || asset.assetCode,
          assetName: requiredText(asset.name || asset.assetName, 'Tên tài sản', 255), category: String(asset.category || ''),
          serialNo: optionalText(input.serialNo, 'Số serial', 160), originalPrice: optionalAmount(asset.originalPrice, 'Nguyên giá'),
          netBookValue: optionalAmount(asset.netBookValue, 'Giá trị còn lại'), assetOrigin: origin,
          fromLocation: origin.location || requiredText(input.fromLocation, 'Địa điểm gửi', 255),
          fromDepartment: origin.department || requiredText(input.fromDepartment, 'Phòng ban gửi', 255),
          fromCustodian: origin.assignedTo || requiredText(input.fromCustodian, 'Người bàn giao', 255),
          toLocation: requiredText(input.toLocation, 'Địa điểm nhận', 255), toDepartment: requiredText(input.toDepartment, 'Phòng ban nhận', 255),
          toCustodian: requiredText(input.toCustodian, 'Người tiếp nhận', 255), carrierName: requiredText(input.carrierName, 'Đơn vị vận chuyển', 255),
          trackingCode: optionalText(input.trackingCode, 'Mã vận đơn', 160), shippingCost: optionalAmount(input.shippingCost, 'Cước vận chuyển'),
          transferDate, expectedDeliveryDate, reason: requiredText(input.reason, 'Lý do điều chuyển', 2000),
          condition: optionalText(input.condition, 'Tình trạng gửi', 2000), notes: optionalText(input.notes, 'Ghi chú', 2000),
          status: 'Chờ phê duyệt', approver: '', createdAt: timestamp, createdBy: actor.name, createdById: actor.id,
        };
        await db.prepare("INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at) VALUES (?, 'asset_transfers', ?, ?, ?, ?, ?)")
          .run(randomUUID(), result.key, actor.id, JSON.stringify(result), timestamp, timestamp);
        await recordAuditEvent(actor.id, 'create_asset_transfer', 'asset_transfers', result.key, { assetKey: asset.key });
      } else {
        const key = requiredText(decodeURIComponent(assetTransferAction[1]), 'Mã lệnh', 160);
        const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'asset_transfers' AND record_key = ?").get(key);
        if (!row) throw new HttpError(404, 'Không tìm thấy lệnh điều chuyển.');
        const transfer = publicCollectionRecord(row);
        const action = assetTransferAction[2];
        if (action === 'approve' || action === 'reject') {
          if (transfer.status !== 'Chờ phê duyệt') throw new HttpError(409, 'Lệnh không còn chờ phê duyệt.');
          result = { ...transfer, status: action === 'approve' ? 'Đang vận chuyển' : 'Từ chối điều chuyển', approver: actor.name, approvedById: actor.id, approvedAt: timestamp };
        } else {
          if (transfer.status !== 'Đang vận chuyển') throw new HttpError(409, 'Chỉ nhận tài sản khi lệnh đang vận chuyển.');
          const condition = requiredText(input.receiveCondition, 'Tình trạng nhận', 2000);
          const assetRow = await findAsset(transfer.assetKey, transfer.assetCode);
          const asset = publicCollectionRecord(assetRow);
          if (asset.status === 'Đã thanh lý') throw new HttpError(409, 'Tài sản đã thanh lý, không thể nghiệm thu điều chuyển.');
          const origin = transfer.assetOrigin || { location: transfer.fromLocation, department: transfer.fromDepartment, assignedTo: transfer.fromCustodian };
          const same = (left, right) => String(left || '').normalize('NFKC').trim().toLocaleLowerCase('vi-VN') === String(right || '').normalize('NFKC').trim().toLocaleLowerCase('vi-VN');
          if (!same(asset.location, origin.location) || !same(asset.department, origin.department) || !same(asset.assignedTo, origin.assignedTo)) throw new HttpError(409, 'Vị trí hoặc người giữ tài sản đã thay đổi. Cần đối chiếu trước khi nhận.');
          const toLocation = requiredText(transfer.toLocation, 'Địa điểm nhận', 255);
          const toDepartment = requiredText(transfer.toDepartment, 'Phòng ban nhận', 255);
          const toCustodian = requiredText(transfer.toCustodian, 'Người tiếp nhận', 255);
          const history = { key: `transfer-${randomUUID()}`, date: timestamp, action: 'Điều chuyển tài sản', actor: actor.name, actorId: actor.id, note: `Phiếu ${transfer.transferCode}; ${transfer.fromLocation} → ${toLocation}; tình trạng nhận: ${condition}` };
          const updatedAsset = { ...asset, location: toLocation, department: toDepartment, assignedTo: toCustodian, history: [...(Array.isArray(asset.history) ? asset.history : []), history] };
          await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(updatedAsset), timestamp, assetRow.id);
          result = { ...transfer, assetKey: asset.key, status: 'Đã điều chuyển hoàn tất', receivedDate: timestamp, receiveCondition: condition, receivedBy: actor.name, receivedById: actor.id };
        }
        await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(result), timestamp, row.id);
        await recordAuditEvent(actor.id, `${action}_asset_transfer`, 'asset_transfers', key, { assetKey: result.assetKey || '' });
      }
    });
    sendJson(response, assetTransferAction ? 200 : 201, { transfer: result });
    return;
  }

  const licenseAction = /^\/assets\/licenses\/([^/]+)\/(allocate|renew)$/.exec(resource);
  if (resource === '/assets/licenses' || licenseAction) {
    const actor = await requireAdmin(request);
    const scope = 'asset_licenses';
    if (request.method === 'GET' && !licenseAction) {
      const rows = await db.prepare('SELECT * FROM collection_records WHERE scope = ? ORDER BY updated_at DESC, record_key ASC').all(scope);
      const data = rows.map(publicCollectionRecord).filter(Boolean).map((item) => ({ ...item, productKey: decryptField(item.productKey || '', 'system') }));
      sendJson(response, 200, { data });
      return;
    }
    if (request.method === 'POST') {
      const input = await readJson(request);
      let result;
      await db.transaction(async () => {
        if (db.pool) await db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [scope]);
        const timestamp = now();
        if (!licenseAction) {
          const licenseCode = requiredText(input.licenseCode, 'Mã bản quyền', 80);
          const rows = await db.prepare('SELECT payload_json FROM collection_records WHERE scope = ?').all(scope);
          if (rows.some((row) => String(parseJsonObject(row.payload_json).licenseCode || '').trim().toLocaleLowerCase('vi-VN') === licenseCode.toLocaleLowerCase('vi-VN'))) throw new HttpError(409, 'Mã bản quyền đã tồn tại.');
          const seatsTotal = requiredAmount(input.seatsTotal, 'Tổng số ghế');
          const seatsAllocated = optionalAmount(input.seatsAllocated, 'Số ghế đã dùng');
          if (seatsAllocated > seatsTotal) throw new HttpError(422, 'Số ghế đã dùng vượt tổng số ghế.');
          const purchaseDate = requiredIsoDate(input.purchaseDate, 'Ngày mua');
          const expireDate = requiredIsoDate(input.expireDate, 'Ngày hết hạn');
          if (expireDate < purchaseDate) throw new HttpError(422, 'Ngày hết hạn không được trước ngày mua.');
          const productKey = requiredText(input.productKey, 'Mã kích hoạt', 4000);
          result = {
            key: randomUUID(), licenseCode, softwareName: requiredText(input.softwareName, 'Tên phần mềm', 255),
            vendor: requiredText(input.vendor, 'Nhà cung cấp', 255), category: requiredText(input.category, 'Nhóm phần mềm', 120),
            licenseType: requiredText(input.licenseType, 'Hình thức cấp phép', 120), productKey: encryptField(productKey, 'system'),
            seatsTotal, seatsAllocated, annualCost: optionalAmount(input.annualCost, 'Chi phí'),
            billingCycle: requiredText(input.billingCycle, 'Kỳ thanh toán', 120), purchaseDate, expireDate,
            assignedDepartment: requiredText(input.assignedDepartment, 'Phòng ban', 255),
            assignedAdmin: requiredText(input.assignedAdmin, 'Người quản trị', 255), notes: optionalText(input.notes, 'Ghi chú', 4000),
            allocatedUsers: [], renewals: [], createdAt: timestamp, createdBy: actor.name, createdById: actor.id,
          };
          await db.prepare('INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
            .run(randomUUID(), scope, result.key, actor.id, JSON.stringify(result), timestamp, timestamp);
          await recordAuditEvent(actor.id, 'create_license', scope, result.key, { licenseCode });
        } else {
          const key = requiredText(decodeURIComponent(licenseAction[1]), 'Khóa bản quyền', 160);
          const row = await db.prepare('SELECT * FROM collection_records WHERE scope = ? AND record_key = ?').get(scope, key);
          if (!row) throw new HttpError(404, 'Không tìm thấy bản quyền.');
          result = publicCollectionRecord(row);
          if (licenseAction[2] === 'allocate') {
            const seatsTotal = requiredAmount(result.seatsTotal, 'Tổng số ghế');
            const seatsAllocated = optionalAmount(result.seatsAllocated, 'Số ghế đã dùng');
            if (seatsAllocated >= seatsTotal) throw new HttpError(409, 'Đã hết ghế bản quyền.');
            const name = requiredText(input.name, 'Họ tên', 255);
            const email = normalizeEmail(input.email);
            const allocatedUsers = Array.isArray(result.allocatedUsers) ? result.allocatedUsers : [];
            if (allocatedUsers.some((item) => String(item.email || '').trim().toLowerCase() === email && item.status !== 'Tạm khóa')) throw new HttpError(409, 'Email đã được cấp ghế cho bản quyền này.');
            result.allocatedUsers = [{ name, email, deviceCode: optionalText(input.deviceCode, 'Thiết bị', 120), assignedDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), status: 'Đang dùng', assignedBy: actor.name, assignedById: actor.id }, ...allocatedUsers];
            result.seatsAllocated = seatsAllocated + 1;
          } else {
            const expireDate = requiredIsoDate(input.expireDate, 'Ngày hết hạn mới');
            const previousExpireDate = requiredIsoDate(result.expireDate, 'Ngày hết hạn hiện tại');
            if (expireDate <= previousExpireDate) throw new HttpError(422, 'Ngày hết hạn mới phải sau ngày hiện tại.');
            const annualCost = optionalAmount(input.annualCost, 'Chi phí');
            result.renewals = [...(Array.isArray(result.renewals) ? result.renewals : []), { previousExpireDate, expireDate, annualCost, recordedAt: timestamp, recordedBy: actor.name, recordedById: actor.id }];
            result.expireDate = expireDate;
            result.annualCost = annualCost;
          }
          if (result.productKey && !isEncrypted(result.productKey)) result.productKey = encryptField(result.productKey, 'system');
          await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE scope = ? AND record_key = ?').run(JSON.stringify(result), timestamp, scope, key);
          await recordAuditEvent(actor.id, licenseAction[2] === 'allocate' ? 'allocate_license' : 'renew_license', scope, key);
        }
      });
      sendJson(response, licenseAction ? 200 : 201, { record: { ...result, productKey: decryptField(result.productKey || '', 'system') } });
      return;
    }
  }

  if (request.method === 'GET' && resource === '/finance/payroll/posted-periods') {
    await requireAdmin(request);
    const rows = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'finance_payroll_postings' ORDER BY record_key").all();
    sendJson(response, 200, { periods: rows.map((row) => payrollMonth(row.record_key)).filter(Boolean) });
    return;
  }

  if (request.method === 'POST' && ['/finance/payroll/ledger-preview', '/finance/payroll/ledger-post'].includes(resource)) {
    const actor = await requireAdmin(request);
    const input = await readJson(request);
    const period = payrollMonth(input.period);
    if (!period) throw new HttpError(422, 'Kỳ lương không hợp lệ.');
    if (input.employerInsurance === undefined || input.employerInsurance === null || input.employerInsurance === '') throw new HttpError(422, 'Nhập số tiền doanh nghiệp đóng đã đối chiếu.');
    const employerInsurance = optionalAmount(input.employerInsurance, 'Bảo hiểm doanh nghiệp');
    const posting = resource.endsWith('ledger-post');
    let result;
    await db.transaction(async () => {
      if (db.pool) {
        await db.query("SELECT pg_advisory_xact_lock(hashtext('payroll'))");
        await db.query("SELECT pg_advisory_xact_lock(hashtext('finance_general_ledger'))");
      }
      const sourceReference = `payroll:${period}`;
      const existing = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'finance_general_ledger' AND json_extract(payload_json, '$.sourceReference') = ? LIMIT 1").get(sourceReference);
      const existingSnapshot = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'finance_payroll_postings' AND record_key = ? LIMIT 1").get(period);
      if (existing || existingSnapshot) throw new HttpError(409, 'Kỳ lương đã có bút toán trong Sổ Cái, cần đối chiếu trước khi xử lý tiếp.');
      result = await payrollLedgerPreview(period, employerInsurance, actor);
      if (!posting) return;
      if (requiredText(input.fingerprint, 'Kết quả xem trước', 64) !== result.fingerprint) throw new HttpError(409, 'Dữ liệu kỳ lương đã thay đổi. Vui lòng xem lại trước khi ghi sổ.');
      const timestamp = now();
      const entryDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const insert = await db.prepare("INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at) VALUES (?, 'finance_general_ledger', ?, ?, ?, ?, ?)");
      for (const [index, line] of result.lines.entries()) {
        const key = `payroll:${period.replace('/', '-')}:${index + 1}`;
        if (await db.prepare("SELECT id FROM collection_records WHERE scope = 'finance_general_ledger' AND record_key = ?").get(key)) throw new HttpError(409, 'Mã bút toán đã tồn tại, cần đối chiếu Sổ Cái.');
        const entry = { key, voucherCode: `BL-${period.replace('/', '')}-${index + 1}`, entryDate, ...line, author: actor.name, status: 'Đã ghi sổ cái', sourceModule: 'payroll', sourceReference, createdById: actor.id, createdAt: timestamp };
        await insert.run(randomUUID(), key, actor.id, JSON.stringify(entry), timestamp, timestamp);
      }
      const snapshot = { key: period, period, employerInsurance, employeeCount: result.employeeCount, fingerprint: result.fingerprint, records: result.records, lines: result.lines, createdAt: timestamp, createdBy: actor.name, createdById: actor.id };
      await db.prepare("INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at) VALUES (?, 'finance_payroll_postings', ?, ?, ?, ?, ?)")
        .run(randomUUID(), period, actor.id, JSON.stringify(snapshot), timestamp, timestamp);
      await recordAuditEvent(actor.id, 'post_payroll', 'finance_general_ledger', sourceReference, { employeeCount: result.employeeCount, entries: result.lines.length, employerInsurance });
    });
    const { records: _records, ...publicResult } = result;
    sendJson(response, posting ? 201 : 200, publicResult);
    return;
  }

  if (request.method === 'POST' && ['/finance/payroll/adjustment-preview', '/finance/payroll/adjustment-post'].includes(resource)) {
    const actor = await requireAdmin(request);
    const input = await readJson(request);
    const period = payrollMonth(input.period);
    if (!period) throw new HttpError(422, 'Kỳ lương không hợp lệ.');
    if (input.employerInsurance === undefined || input.employerInsurance === null || input.employerInsurance === '') throw new HttpError(422, 'Nhập số tiền doanh nghiệp đóng đã đối chiếu.');
    const employerInsurance = optionalAmount(input.employerInsurance, 'Bảo hiểm doanh nghiệp');
    const posting = resource.endsWith('adjustment-post');
    let result;
    await db.transaction(async () => {
      if (db.pool) {
        await db.query("SELECT pg_advisory_xact_lock(hashtext('payroll'))");
        await db.query("SELECT pg_advisory_xact_lock(hashtext('finance_general_ledger'))");
      }
      const originalRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_payroll_postings' AND record_key = ?").get(period);
      if (!originalRow) throw new HttpError(409, 'Kỳ lương chưa có bản đối chiếu hạch toán. Cần kiểm tra chứng từ cũ trước khi điều chỉnh.');
      const original = publicCollectionRecord(originalRow);
      const sourceReference = `payroll:${period}`;
      const existing = await db.prepare("SELECT record_key FROM collection_records WHERE scope = 'finance_general_ledger' AND json_extract(payload_json, '$.sourceReference') = ? LIMIT 1").get(sourceReference);
      if (!existing) throw new HttpError(409, 'Không tìm thấy bút toán gốc của kỳ lương.');
      const adjustmentRows = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_payroll_adjustments' AND json_extract(payload_json, '$.period') = ?").all(period);
      const adjustments = adjustmentRows.map(publicCollectionRecord).sort((a, b) => a.sequence - b.sequence);
      const previous = adjustments.at(-1) || original;
      const reviewed = await payrollLedgerPreview(period, employerInsurance, actor, true);
      const accountKey = (line) => `${line.debitAccount}|${line.creditAccount}`;
      const priorLines = new Map(previous.lines.map((line) => [accountKey(line), line]));
      const currentLines = new Map(reviewed.lines.map((line) => [accountKey(line), line]));
      const keys = new Set([...priorLines.keys(), ...currentLines.keys()]);
      const lines = [];
      for (const key of keys) {
        const before = priorLines.get(key);
        const after = currentLines.get(key);
        const difference = (after?.amount || 0) - (before?.amount || 0);
        if (!Number.isSafeInteger(difference)) throw new HttpError(422, 'Chênh lệch hạch toán không hợp lệ.');
        if (!difference) continue;
        const reference = after || before;
        lines.push({ description: `Điều chỉnh: ${reference.description}`, debitAccount: difference > 0 ? reference.debitAccount : reference.creditAccount, creditAccount: difference > 0 ? reference.creditAccount : reference.debitAccount, amount: Math.abs(difference) });
      }
      if (!lines.length) throw new HttpError(422, 'Không có chênh lệch cần ghi sổ.');
      const fingerprint = createHash('sha256').update(JSON.stringify({ actorId: actor.id, period, previousKey: previous.key, sequence: adjustments.length, priorLines: previous.lines, reviewedFingerprint: reviewed.fingerprint, lines })).digest('hex');
      result = { period, employerInsurance, employeeCount: reviewed.employeeCount, sequence: adjustments.length + 1, lines, fingerprint };
      if (!posting) return;
      if (requiredText(input.fingerprint, 'Kết quả xem trước', 64) !== fingerprint) throw new HttpError(409, 'Dữ liệu kỳ lương đã thay đổi. Vui lòng xem lại trước khi điều chỉnh.');
      const timestamp = now();
      const id = randomUUID();
      const entryDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const insert = await db.prepare("INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at) VALUES (?, 'finance_general_ledger', ?, ?, ?, ?, ?)");
      for (const [index, line] of lines.entries()) {
        const key = `payroll:${period.replace('/', '-')}:adjustment:${id}:${index + 1}`;
        const entry = { key, voucherCode: `BL-${period.replace('/', '')}-DC${result.sequence}-${index + 1}`, entryDate, ...line, author: actor.name, status: 'Đã ghi sổ cái', sourceModule: 'payroll', sourceReference, createdById: actor.id, createdAt: timestamp };
        await insert.run(randomUUID(), key, actor.id, JSON.stringify(entry), timestamp, timestamp);
      }
      const snapshot = { key: id, period, sequence: result.sequence, employerInsurance, records: reviewed.records, lines: reviewed.lines, adjustmentLines: lines, fingerprint, createdAt: timestamp, createdBy: actor.name, createdById: actor.id };
      await db.prepare("INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at) VALUES (?, 'finance_payroll_adjustments', ?, ?, ?, ?, ?)")
        .run(randomUUID(), id, actor.id, JSON.stringify(snapshot), timestamp, timestamp);
      await recordAuditEvent(actor.id, 'adjust_payroll', 'finance_general_ledger', sourceReference, { sequence: result.sequence, entries: lines.length });
    });
    sendJson(response, posting ? 201 : 200, result);
    return;
  }

  if (request.method === 'POST' && resource === '/finance/sales/promotion-preview') {
    const actor = await requireAdmin(request);
    const input = await readJson(request);
    const customerId = requiredText(input.customerId, 'Khách hàng', 160);
    const customer = await db.prepare("SELECT id, code, name, status FROM crm_contacts WHERE id = ? AND contact_type = 'customer'").get(customerId);
    if (!customer || String(customer.status || '').toLocaleLowerCase().includes('tạm')) throw new HttpError(422, 'Khách hàng không tồn tại hoặc đang tạm dừng.');
    const document = validateFinanceDocument({ ...input, documentType: 'sale', partnerName: customer.name, paidAmount: 0 });
    const result = await calculateSalePromotions(document, customer, actor, salePromotionKeys(input.promotionKeys));
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'GET' && resource === '/finance/documents') {
    await requireAdmin(request);
    const documentType = url.searchParams.get('documentType');
    const subtype = url.searchParams.get('subtype');
    if (documentType && !['sale', 'purchase', 'invoice'].includes(documentType)) {
      throw new HttpError(422, 'Loại chứng từ không hợp lệ.');
    }
    const where = [];
    const params = [];
    if (documentType) {
      where.push('document_type = ?');
      params.push(documentType);
    }
    if (subtype) {
      where.push('subtype = ?');
      params.push(subtype);
    }
    const sql = `SELECT * FROM finance_documents${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY document_date DESC, created_at DESC`;
    const rows = await db.prepare(sql).all(...params);
    const hasSales = rows.some((row) => row.document_type === 'sale');
    const links = hasSales ? await saleCustomerLinks() : [];
    const promotions = hasSales ? await salePromotionSnapshots() : [];
    const linksBySale = new Map(links.map((link) => [link.key, link]));
    const promotionsBySale = new Map(promotions.map((snapshot) => [snapshot.key, snapshot]));
    sendJson(response, 200, { data: rows.map((row) => {
      const document = publicFinanceDocument(row);
      const link = linksBySale.get(row.id);
      return { ...document, ...(link ? { customerId: link.customerId, customerCode: link.customerCode } : {}), ...publicSalePromotion(promotionsBySale.get(row.id)) };
    }) });
    return;
  }

  if (request.method === 'POST' && resource === '/finance/documents') {
    const actor = await requireAdmin(request);
    const input = await readJson(request);
    const customerId = optionalText(input.customerId, 'Khách hàng', 160);
    if (customerId && input.documentType !== 'sale') throw new HttpError(422, 'Liên kết khách hàng chỉ áp dụng cho chứng từ bán hàng.');
    const promotionKeys = salePromotionKeys(input.promotionKeys);
    if (promotionKeys.length && (!customerId || input.documentType !== 'sale')) throw new HttpError(422, 'Chọn khách hàng CRM cho chứng từ bán có khuyến mại.');
    const requestId = promotionKeys.length ? requiredText(input.requestId, 'Mã yêu cầu', 160) : '';
    const fingerprint = promotionKeys.length ? requiredText(input.promotionFingerprint, 'Kết quả tính khuyến mại', 64) : '';
    let document;
    let link;
    let snapshot;
    let replayed = false;
    let id = randomUUID();
    const timestamp = now();
    const insertDocument = await db.prepare(`INSERT INTO finance_documents (
      id, document_type, code, subtype, partner_name, description, amount, paid_amount,
      document_date, due_date, status, tax_code, vat_rate, vat_amount, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    await db.transaction(async () => {
      if (promotionKeys.length && db.pool) {
        await db.query("SELECT pg_advisory_xact_lock(hashtext('crm_promotions'))");
        await db.query("SELECT pg_advisory_xact_lock(hashtext('finance_sale_promotions'))");
      }
      let customer;
      if (customerId) {
        customer = await db.prepare("SELECT id, code, name, status FROM crm_contacts WHERE id = ? AND contact_type = 'customer'").get(customerId);
        if (!customer || String(customer.status || '').toLocaleLowerCase().includes('tạm')) throw new HttpError(422, 'Khách hàng không tồn tại hoặc đang tạm dừng.');
      }
      document = validateFinanceDocument({ ...input, partnerName: customer ? customer.name : input.partnerName });
      if (promotionKeys.length) {
        const requestHash = createHash('sha256').update(JSON.stringify({ actorId: actor.id, customerId, promotionKeys, fingerprint, document })).digest('hex');
        const existing = (await salePromotionSnapshots()).find((item) => item.requestId === requestId);
        if (existing) {
          if (existing.requestHash !== requestHash) throw new HttpError(409, 'Mã yêu cầu đã được dùng cho chứng từ khác.');
          id = existing.key;
          snapshot = existing;
          link = { customerId: existing.customerId, customerCode: existing.customerCode };
          replayed = true;
          return;
        }
        const calculated = await calculateSalePromotions(document, customer, actor, promotionKeys);
        if (calculated.fingerprint !== fingerprint) throw new HttpError(409, 'Điều kiện khuyến mại đã thay đổi. Vui lòng tính lại trước khi lưu.');
        if (document.paidAmount > calculated.netAmount) throw new HttpError(422, 'Số tiền đã thu không được vượt số tiền sau khuyến mại.');
        document.amount = calculated.netAmount;
        snapshot = { key: id, customerId, customerCode: customer.code, requestId, requestHash, ...calculated, createdAt: timestamp, createdBy: actor.name, createdById: actor.id };
      }
      document.code = await nextUniqueCode(document.documentType === 'sale' ? 'SALE' : document.documentType === 'purchase' ? 'PUR' : 'INV', 'finance_documents');
      await insertDocument.run(
        id,
        document.documentType,
        document.code,
        document.subtype,
        document.partnerName,
        document.description,
        document.amount,
        document.paidAmount,
        document.documentDate,
        document.dueDate || null,
        document.status,
        document.taxCode,
        document.vatRate,
        document.vatAmount,
        actor.id,
        timestamp,
        timestamp,
      );
      if (customer) link = await insertSaleCustomerLink(id, document.code, customer, actor, timestamp);
      if (snapshot) {
        await db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
          VALUES (?, 'finance_sale_promotions', ?, ?, ?, ?, ?)`)
          .run(randomUUID(), id, actor.id, JSON.stringify(snapshot), timestamp, timestamp);
        await recordAuditEvent(actor.id, 'apply_sale_promotions', 'finance_sale_promotions', id, { customerId, promotionKeys, discountAmount: snapshot.discountAmount });
      }
      await insertAutomaticCashTransaction(document, actor.id, timestamp);
    });
    const saved = publicFinanceDocument(await db.prepare('SELECT * FROM finance_documents WHERE id = ?').get(id));
    const result = { ...saved, ...(link ? { customerId: link.customerId, customerCode: link.customerCode } : {}), ...publicSalePromotion(snapshot) };
    sendJson(response, replayed ? 200 : 201, promotionKeys.length ? { document: result, replayed } : { document: result });
    return;
  }

  const saleCustomerMatch = /^\/finance\/sales\/([^/]+)\/customer$/.exec(resource);
  if (request.method === 'POST' && saleCustomerMatch) {
    const actor = await requireAdmin(request);
    const saleId = requiredText(decodeURIComponent(saleCustomerMatch[1]), 'Chứng từ bán', 160);
    const customerId = requiredText((await readJson(request)).customerId, 'Khách hàng', 160);
    let result;
    await db.transaction(async () => {
      if (db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('finance_sale_customer_links'))");
      const sale = await db.prepare("SELECT id, code, partner_name, status FROM finance_documents WHERE id = ? AND document_type = 'sale'").get(saleId);
      if (!sale || sale.status === 'Đã hủy') throw new HttpError(422, 'Chứng từ bán không tồn tại hoặc đã hủy.');
      const customer = await db.prepare("SELECT id, code, name, status FROM crm_contacts WHERE id = ? AND contact_type = 'customer'").get(customerId);
      if (!customer || String(customer.status || '').toLocaleLowerCase().includes('tạm')) throw new HttpError(422, 'Khách hàng không tồn tại hoặc đang tạm dừng.');
      const existingRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_sale_customer_links' AND record_key = ? LIMIT 1").get(saleId);
      if (existingRow) {
        const existing = publicCollectionRecord(existingRow);
        if (existing.customerId !== customerId) throw new HttpError(409, 'Chứng từ đã liên kết với khách hàng khác.');
        result = { link: existing, replayed: true };
        return;
      }
      const normalizeName = (value) => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
      if (normalizeName(sale.partner_name) !== normalizeName(customer.name)) throw new HttpError(422, 'Tên khách hàng trong chứng từ phải khớp danh bạ để liên kết.');
      result = { link: await insertSaleCustomerLink(sale.id, sale.code, customer, actor, now()), replayed: false };
    });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'GET' && resource === '/finance/debts') {
    await requireAdmin(request);
    const rows = await db.prepare(`
      SELECT
        CASE
          WHEN document_type = 'purchase' OR (document_type = 'invoice' AND subtype LIKE '%Đầu vào%') THEN 'Phải trả'
          ELSE 'Phải thu'
        END AS type,
        partner_name,
        SUM(amount) AS total_amount,
        SUM(paid_amount) AS paid_amount,
        MAX(COALESCE(due_date, document_date)) AS due_date
      FROM finance_documents
      WHERE status <> 'Đã hủy'
      GROUP BY type, partner_name
      HAVING SUM(amount - paid_amount) > 0
      ORDER BY due_date ASC, partner_name ASC
    `).all();
    const debts = rows.map((row, index) => ({
      key: `${row.type}-${row.partner_name}-${index}`,
      partnerName: row.partner_name,
      type: row.type,
      totalAmount: financeStoredInteger(row.total_amount),
      paidAmount: financeStoredInteger(row.paid_amount),
      remainingAmount: Math.max(0, financeStoredInteger(row.total_amount) - financeStoredInteger(row.paid_amount)),
      dueDate: row.due_date,
      status: Date.parse(`${row.due_date}T00:00:00.000Z`) < Date.now() ? 'Quá hạn' : 'Đúng hạn',
    }));
    sendJson(response, 200, { data: debts });
    return;
  }

  if (request.method === 'GET' && resource === '/finance/bank-accounts') {
    await requireAdmin(request);
    const rows = await db.prepare('SELECT * FROM finance_bank_accounts ORDER BY created_at DESC').all();
    const balances = new Map((await internalTransferAccounts()).map(account => [account.key, account.balance]));
    sendJson(response, 200, { data: rows.map(row => ({ ...publicBankAccount(row), currentBalance: balances.get(row.id) })) });
    return;
  }

  if (request.method === 'POST' && resource === '/finance/bank-accounts') {
    const actor = await requireAdmin(request);
    const account = validateBankAccount(await readJson(request));
    const encAccountNum = encryptField(account.accountNumber, 'finance');
    const id = randomUUID();
    const timestamp = now();
    await db.prepare(`INSERT INTO finance_bank_accounts (
      id, bank_name, account_number, account_holder, branch, opening_balance, status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, account.bankName, encAccountNum, account.accountHolder, account.branch, account.balance, account.status, actor.id, timestamp, timestamp);
    sendJson(response, 201, { account: publicBankAccount(await db.prepare('SELECT * FROM finance_bank_accounts WHERE id = ?').get(id), actor) });
    return;
  }

  if (request.method === 'GET' && resource === '/crm/loyalty') {
    await requireAdmin(request);
    const entries = await loyaltyEntries();
    const balances = loyaltyBalances(entries);
    const customers = await db.prepare("SELECT id, code, name, status FROM crm_contacts WHERE contact_type = 'customer' ORDER BY name, code").all();
    const links = new Map((await saleCustomerLinks()).map((link) => [link.key, link]));
    const saleRows = await db.prepare("SELECT id, code, amount, document_date FROM finance_documents WHERE document_type = 'sale' AND status = 'Đã bàn giao' AND subtype <> 'Báo giá' ORDER BY document_date DESC, created_at DESC").all();
    sendJson(response, 200, {
      customers: customers.map((customer) => ({ key: customer.id, code: customer.code, name: customer.name, status: customer.status, balance: balances.get(customer.id) || 0 })),
      entries,
      sales: saleRows.filter((sale) => links.has(sale.id)).map((sale) => ({ key: sale.id, code: sale.code, customerId: links.get(sale.id).customerId, amount: financeStoredInteger(sale.amount), documentDate: sale.document_date })),
    });
    return;
  }

  if (request.method === 'POST' && resource === '/crm/loyalty/entries') {
    const actor = await requireAdmin(request);
    const input = await readJson(request);
    const requestId = requiredText(input.requestId, 'Mã yêu cầu', 160);
    const type = oneOf(input.type, 'Loại giao dịch điểm', ['earn', 'redeem']);
    const customerId = requiredText(input.customerId, 'Khách hàng', 160);
    const points = requiredAmount(input.points, 'Số điểm');
    const saleId = optionalText(input.saleId, 'Chứng từ bán hàng', 160);
    if (saleId && type !== 'earn') throw new HttpError(422, 'Chỉ giao dịch tích điểm được gắn chứng từ bán hàng.');
    let reference = saleId ? '' : requiredText(input.reference, 'Mã tham chiếu', 160);
    const rewardName = type === 'redeem' ? requiredText(input.rewardName, 'Phần thưởng', 255) : '';
    const note = optionalText(input.note, 'Ghi chú', 1000);
    let result;
    await db.transaction(async () => {
      if (db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('crm_loyalty_ledger'))");
      const entries = await loyaltyEntries();
      const balances = loyaltyBalances(entries);
      const existing = entries.find((entry) => entry.key === requestId);
      if (existing) {
        if (existing.type !== type || existing.customerId !== customerId || existing.points !== points
          || String(existing.saleId || '') !== saleId || (!saleId && existing.reference !== reference)
          || existing.rewardName !== rewardName || existing.note !== note) {
          throw new HttpError(409, 'Mã yêu cầu đã được dùng cho giao dịch khác.');
        }
        result = { entry: existing, balance: balances.get(customerId) || 0, replayed: true };
        return;
      }
      const customer = await db.prepare("SELECT id, code, name, status FROM crm_contacts WHERE id = ? AND contact_type = 'customer'").get(customerId);
      if (!customer || String(customer.status || '').toLocaleLowerCase().includes('tạm')) throw new HttpError(422, 'Khách hàng không tồn tại hoặc đang tạm dừng.');
      let sale;
      if (saleId) {
        sale = await db.prepare("SELECT id, code, subtype, status, amount, document_date FROM finance_documents WHERE id = ? AND document_type = 'sale'").get(saleId);
        const linkRow = await db.prepare("SELECT * FROM collection_records WHERE scope = 'finance_sale_customer_links' AND record_key = ? LIMIT 1").get(saleId);
        const link = linkRow && publicCollectionRecord(linkRow);
        if (!sale || sale.status !== 'Đã bàn giao' || sale.subtype === 'Báo giá' || !link || link.customerId !== customerId) {
          throw new HttpError(422, 'Chọn chứng từ bán đã bàn giao và liên kết với đúng khách hàng.');
        }
        if (entries.some((entry) => entry.type === 'earn' && entry.saleId === saleId && entry.status !== 'Đã hủy')) {
          throw new HttpError(409, 'Chứng từ này đã được tích điểm.');
        }
        reference = sale.code;
      }
      if (entries.some((entry) => entry.customerId === customerId && entry.type === type && entry.status !== 'Đã hủy'
        && String(entry.reference || '').toLocaleLowerCase() === reference.toLocaleLowerCase())) {
        throw new HttpError(409, 'Mã tham chiếu đã được ghi nhận cho khách hàng này.');
      }
      const balance = balances.get(customerId) || 0;
      const delta = type === 'earn' ? points : -points;
      const nextBalance = balance + delta;
      if (!Number.isSafeInteger(nextBalance)) throw new HttpError(422, 'Số dư điểm vượt giới hạn tính toán.');
      if (nextBalance < 0) throw new HttpError(422, 'Khách hàng không đủ điểm để đổi thưởng.');
      const timestamp = now();
      const entry = {
        key: requestId, type, customerId, customerCode: customer.code, customerName: customer.name,
        points, delta, balanceAfter: nextBalance, reference, rewardName, note,
        status: type === 'earn' ? 'Đã ghi nhận' : 'Chờ trao', createdAt: timestamp,
        createdBy: actor.name, createdById: actor.id,
        ...(sale ? { saleId: sale.id, saleCode: sale.code, saleAmount: financeStoredInteger(sale.amount), saleDate: sale.document_date } : {}),
      };
      await db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
        VALUES (?, 'crm_loyalty_ledger', ?, ?, ?, ?, ?)`)
        .run(randomUUID(), requestId, actor.id, JSON.stringify(entry), timestamp, timestamp);
      await recordAuditEvent(actor.id, type === 'earn' ? 'loyalty_earn' : 'loyalty_redeem', 'crm_loyalty_ledger', requestId, { customerId, points, reference });
      result = { entry, balance: nextBalance, replayed: false };
    });
    sendJson(response, result.replayed ? 200 : 201, result);
    return;
  }

  const loyaltyAction = /^\/crm\/loyalty\/entries\/([^/]+)\/(fulfill|cancel)$/.exec(resource);
  if (request.method === 'POST' && loyaltyAction) {
    const actor = await requireAdmin(request);
    const key = requiredText(decodeURIComponent(loyaltyAction[1]), 'Mã giao dịch điểm', 160);
    const action = loyaltyAction[2];
    const input = await readJson(request);
    const detail = requiredText(action === 'fulfill' ? input.reference : input.reason, action === 'fulfill' ? 'Mã xác nhận trao thưởng' : 'Lý do hủy', 500);
    let result;
    await db.transaction(async () => {
      if (db.pool) await db.query("SELECT pg_advisory_xact_lock(hashtext('crm_loyalty_ledger'))");
      const row = await db.prepare("SELECT * FROM collection_records WHERE scope = 'crm_loyalty_ledger' AND record_key = ? ORDER BY created_at LIMIT 1").get(key);
      if (!row) throw new HttpError(404, 'Không tìm thấy giao dịch điểm.');
      const entry = publicCollectionRecord(row);
      if (action === 'fulfill' && (entry.type !== 'redeem' || entry.status !== 'Chờ trao')) throw new HttpError(409, 'Chỉ phần thưởng đang chờ mới được xác nhận trao.');
      if (action === 'cancel' && !((entry.type === 'redeem' && entry.status === 'Chờ trao') || (entry.type === 'earn' && entry.status === 'Đã ghi nhận'))) {
        throw new HttpError(409, 'Giao dịch điểm đã được xử lý và không thể hủy.');
      }
      const entries = await loyaltyEntries();
      const balance = loyaltyBalances(entries).get(entry.customerId) || 0;
      const timestamp = now();
      let nextBalance = balance;
      if (action === 'cancel') {
        const delta = entry.type === 'earn' ? -entry.points : entry.points;
        nextBalance = balance + delta;
        if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) throw new HttpError(422, 'Không đủ điểm để hủy giao dịch tích điểm này.');
        const adjustment = {
          key: `adjust-${randomUUID()}`, type: entry.type === 'earn' ? 'reversal' : 'refund',
          customerId: entry.customerId, customerCode: entry.customerCode, customerName: entry.customerName,
          points: entry.points, delta, balanceAfter: nextBalance, reference: entry.reference, rewardName: entry.rewardName,
          note: detail, sourceKey: entry.key, status: 'Đã ghi nhận', createdAt: timestamp, createdBy: actor.name, createdById: actor.id,
        };
        await db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
          VALUES (?, 'crm_loyalty_ledger', ?, ?, ?, ?, ?)`)
          .run(randomUUID(), adjustment.key, actor.id, JSON.stringify(adjustment), timestamp, timestamp);
        entry.status = 'Đã hủy';
        entry.cancelReason = detail;
      } else {
        entry.status = 'Đã trao';
        entry.fulfillmentReference = detail;
      }
      entry.handledAt = timestamp;
      entry.handledBy = actor.name;
      entry.handledById = actor.id;
      await db.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(entry), timestamp, row.id);
      await recordAuditEvent(actor.id, action === 'fulfill' ? 'loyalty_fulfill' : 'loyalty_cancel', 'crm_loyalty_ledger', key, { detail });
      result = { entry, balance: nextBalance };
    });
    sendJson(response, 200, result);
    return;
  }

  if (request.method === 'GET' && resource === '/crm/contacts') {
    const actor = await requireAdmin(request);
    const type = url.searchParams.get('type');
    if (type && !['customer', 'supplier', 'partner'].includes(type)) throw new HttpError(422, 'Loại đối tác không hợp lệ.');
    const rows = type
      ? await db.prepare('SELECT * FROM crm_contacts WHERE contact_type = ? ORDER BY created_at DESC').all(type)
      : await db.prepare('SELECT * FROM crm_contacts ORDER BY created_at DESC').all();
    sendJson(response, 200, { data: rows.map(r => publicCrmContact(r, actor)) });
    return;
  }

  const crmContactMatch = resource.match(/^\/crm\/contacts\/([^/]+)$/);
  if (request.method === 'PATCH' && crmContactMatch) {
    const actor = await requireAdmin(request);
    const id = decodeURIComponent(crmContactMatch[1]);
    const row = await db.prepare('SELECT * FROM crm_contacts WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Không tìm thấy đối tác cần cập nhật.');
    const body = await readJson(request);
    const patch = body?.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(422, 'Dữ liệu cập nhật đối tác không hợp lệ.');
    const editableFields = new Set([
      'name', 'taxCode', 'industry', 'contactPerson', 'phone', 'email', 'address', 'bankAccount',
      'creditLimit', 'totalValue', 'debtBalance', 'tier', 'accountManager', 'status',
    ]);
    const unsupportedFields = Object.keys(patch).filter(field => !editableFields.has(field));
    if (unsupportedFields.length) throw new HttpError(422, 'Không thể thay đổi mã hoặc loại đối tác.');
    if (!Object.keys(patch).length) throw new HttpError(422, 'Chưa có thông tin nào để cập nhật.');

    const contact = validateCrmContact({ ...publicCrmContact(row, actor), ...patch, type: row.contact_type });
    const timestamp = now();
    await db.prepare(`UPDATE crm_contacts SET
      name = ?, tax_code = ?, industry = ?, contact_person = ?, phone = ?, email = ?, address = ?, bank_account = ?,
      credit_limit = ?, total_value = ?, debt_balance = ?, tier = ?, account_manager = ?, status = ?, updated_at = ?
      WHERE id = ?`)
      .run(
        contact.name,
        contact.taxCode,
        contact.industry,
        contact.contactPerson,
        encryptField(contact.phone, 'crm'),
        encryptField(contact.email, 'crm'),
        encryptField(contact.address, 'crm'),
        encryptField(contact.bankAccount, 'crm'),
        contact.creditLimit,
        contact.totalValue,
        contact.debtBalance,
        contact.tier,
        contact.accountManager,
        contact.status,
        timestamp,
        id,
      );
    sendJson(response, 200, { contact: publicCrmContact(await db.prepare('SELECT * FROM crm_contacts WHERE id = ?').get(id), actor) });
    return;
  }

  if (request.method === 'POST' && resource === '/crm/contacts') {
    const actor = await requireAdmin(request);
    const contact = validateCrmContact(await readJson(request));
    contact.code = await nextUniqueCode(contact.type === 'customer' ? 'KH' : contact.type === 'supplier' ? 'NCC' : 'DT', 'crm_contacts');
    const id = randomUUID();
    const timestamp = now();
    await db.prepare(`INSERT INTO crm_contacts (
      id, code, name, contact_type, tax_code, industry, contact_person, phone, email,
      address, bank_account, credit_limit, total_value, debt_balance, tier, account_manager,
      status, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        id,
        contact.code,
        contact.name,
        contact.type,
        contact.taxCode,
        contact.industry,
        contact.contactPerson,
        encryptField(contact.phone, 'crm'),
        encryptField(contact.email, 'crm'),
        encryptField(contact.address, 'crm'),
        encryptField(contact.bankAccount, 'crm'),
        contact.creditLimit,
        contact.totalValue,
        contact.debtBalance,
        contact.tier,
        contact.accountManager,
        contact.status,
        actor.id,
        timestamp,
        timestamp,
      );
    sendJson(response, 201, { contact: publicCrmContact(await db.prepare('SELECT * FROM crm_contacts WHERE id = ?').get(id), actor) });
    return;
  }

  if (request.method === 'GET' && resource === '/tasks/assignees') {
    await requireUser(request);
    const rows = await db.prepare(`
      SELECT u.id, u.name, u.employee_code AS employeeCode, u.role,
        p.department, p.position
      FROM users u
      LEFT JOIN employee_profiles p ON p.user_id = u.id
      WHERE u.role != 'ADMIN'
        AND COALESCE(p.employment_status, 'Chính thức') != 'Đã nghỉ việc'
      ORDER BY u.name COLLATE NOCASE ASC
    `).all();
    sendJson(response, 200, { data: rows });
    return;
  }

  if (request.method === 'GET' && resource === '/tasks') {
    const actor = await requireUser(request);
    const rows = actor.role === 'ADMIN'
      ? await db.prepare(`
          SELECT t.*,
            COALESCE(assignee.name, 'Người thực hiện') AS assignee_name,
            COALESCE(assignee.employee_code, t.assignee_id) AS assignee_employee_code,
            COALESCE(creator.name, 'Hệ thống') AS creator_name
          FROM tasks t
          LEFT JOIN users assignee ON (assignee.id = t.assignee_id OR assignee.employee_code = t.assignee_id)
          LEFT JOIN users creator ON (creator.id = t.created_by OR creator.employee_code = t.created_by)
          ORDER BY t.created_at DESC, t.id DESC
        `).all()
      : await db.prepare(`
          SELECT t.*,
            COALESCE(assignee.name, 'Người thực hiện') AS assignee_name,
            COALESCE(assignee.employee_code, t.assignee_id) AS assignee_employee_code,
            COALESCE(creator.name, 'Hệ thống') AS creator_name
          FROM tasks t
          LEFT JOIN users assignee ON (assignee.id = t.assignee_id OR assignee.employee_code = t.assignee_id)
          LEFT JOIN users creator ON (creator.id = t.created_by OR creator.employee_code = t.created_by)
          WHERE t.assignee_id = ? OR t.assignee_id = ? OR t.created_by = ? OR t.created_by = ?
          ORDER BY t.created_at DESC, t.id DESC
        `).all(actor.id, actor.employee_code || actor.id, actor.id, actor.employee_code || actor.id);
    sendJson(response, 200, { data: rows.map((row) => publicTask(row)) });
    return;
  }

  if (request.method === 'POST' && resource === '/tasks') {
    const actor = await requireUser(request);
    const payload = await readJson(request);
    const task = validateTaskCreate(payload);
    const assignee = await resolveUser(task.assigneeId, actor);
    if (!assignee) throw new HttpError(422, 'Người thực hiện không tồn tại.');
    const code = await nextUniqueCode('TASK', 'tasks');

    const id = randomUUID();
    const timestamp = now();
    await db.transaction(async () => {
      await db.prepare(`INSERT INTO tasks (
        id, code, title, description, project_name, assignee_id, created_by, priority,
        due_date, progress, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'Chưa bắt đầu', ?, ?)`)
        .run(id, code, task.taskTitle, task.description, task.projectName, assignee.id, actor.id, task.priority, task.dueDate, timestamp, timestamp);
      const insertChecklist = await db.prepare(`
        INSERT INTO task_checklist_items (id, task_id, title, is_completed, sort_order) VALUES (?, ?, ?, 0, ?)
      `);
      for (const [index, title] of task.checklist.entries()) {
        await insertChecklist.run(randomUUID(), id, title, index);
      }
      await recordTaskActivity(id, actor.id, `Đã tạo nhiệm vụ "${task.taskTitle}" cho ${assignee.name}.`, timestamp);
    });
    sendJson(response, 201, { task: await populateTaskDetails(publicTask(await taskRowById(id)), id) });
    return;
  }

  const taskDetailMatch = /^\/tasks\/([^/]+)$/.exec(resource);
  if (taskDetailMatch && request.method === 'GET') {
    const actor = await requireUser(request);
    const id = decodeURIComponent(taskDetailMatch[1]);
    const task = await taskRowById(id);
    ensureTaskAccess(task, actor);
    sendJson(response, 200, { task: await populateTaskDetails(publicTask(task), task.id) });
    return;
  }

  if (taskDetailMatch && request.method === 'DELETE') {
    const actor = await requireUser(request);
    const id = decodeURIComponent(taskDetailMatch[1]);
    const current = await taskRowById(id);
    ensureTaskAccess(current, actor);
    if (actor.role !== 'ADMIN' && current.created_by !== actor.id && current.created_by !== actor.employee_code) {
      throw new HttpError(403, 'Chỉ Quản trị viên hoặc người tạo mới có quyền xóa nhiệm vụ.');
    }
    await db.transaction(async () => {
      await db.prepare('DELETE FROM task_checklist_items WHERE task_id = ?').run(id);
      await db.prepare('DELETE FROM task_comments WHERE task_id = ?').run(id);
      await db.prepare('DELETE FROM task_reports WHERE task_id = ?').run(id);
      await db.prepare('DELETE FROM task_activities WHERE task_id = ?').run(id);
      await db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    });
    sendJson(response, 200, { deleted: true });
    return;
  }

  if (taskDetailMatch && request.method === 'PATCH') {
    const actor = await requireUser(request);
    const id = decodeURIComponent(taskDetailMatch[1]);
    const current = await taskRowById(id);
    ensureTaskAccess(current, actor);
    const payload = await readJson(request);
    const isAdmin = actor.role === 'ADMIN';
    if (!isAdmin && current.assignee_id !== actor.id && current.assignee_id !== actor.employee_code) {
      throw new HttpError(403, 'Chỉ người thực hiện mới có thể cập nhật tiến độ nhiệm vụ.');
    }
    if (!isAdmin && Object.keys(payload).some((key) => !['progress', 'status'].includes(key))) {
      throw new HttpError(403, 'Nhân viên chỉ được cập nhật tiến độ và trạng thái nhiệm vụ của mình.');
    }

    const taskTitle = isAdmin && payload.taskTitle !== undefined ? requiredText(payload.taskTitle, 'Tên nhiệm vụ', 500) : current.title;
    const description = isAdmin && payload.description !== undefined ? optionalText(payload.description, 'Mô tả nhiệm vụ', 4_000) : current.description;
    const projectName = isAdmin && payload.projectName !== undefined ? optionalText(payload.projectName, 'Đơn vị', 200) : current.project_name;
    const priority = isAdmin && payload.priority !== undefined ? oneOf(payload.priority, 'Độ ưu tiên', TASK_PRIORITIES) : current.priority;
    const dueDate = isAdmin && payload.dueDate !== undefined ? requiredIsoDate(payload.dueDate, 'Hạn hoàn thành') : current.due_date;
    let finalAssigneeId = current.assignee_id;
    if (isAdmin && payload.assigneeId !== undefined && payload.assigneeId !== current.assignee_id) {
      const assignee = await resolveUser(payload.assigneeId);
      if (!assignee) throw new HttpError(422, 'Người thực hiện không tồn tại.');
      finalAssigneeId = assignee.id;
    }
    let progress = payload.progress === undefined ? current.progress : optionalProgress(payload.progress);
    const status = payload.status === undefined
      ? current.status
      : oneOf(
        payload.status,
        'Trạng thái',
        isAdmin ? TASK_STATUSES : EMPLOYEE_TASK_STATUSES,
      );
    if (status === 'Hoàn thành') progress = 100;
    const timestamp = now();
    await db.prepare(`UPDATE tasks SET
      title = ?, description = ?, project_name = ?, assignee_id = ?, priority = ?,
      due_date = ?, progress = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(taskTitle, description, projectName, finalAssigneeId, priority, dueDate, progress, status, timestamp, id);
    const statusChanged = status !== current.status;
    const progressChanged = progress !== current.progress;
    if (statusChanged || progressChanged) {
      const descriptions = [];
      if (statusChanged) descriptions.push(`Đã đổi trạng thái thành ${status}.`);
      if (progressChanged) descriptions.push(`Đã cập nhật tiến độ ${progress}%.`);
      await recordTaskActivity(id, actor.id, descriptions.join(' '), timestamp);
    }
    sendJson(response, 200, { task: await populateTaskDetails(publicTask(await taskRowById(id)), id) });
    return;
  }

  const taskReportMatch = /^\/tasks\/([^/]+)\/reports$/.exec(resource);
  if (taskReportMatch && request.method === 'POST') {
    const actor = await requireUser(request);
    const taskId = decodeURIComponent(taskReportMatch[1]);
    const task = await taskRowById(taskId);
    ensureTaskAccess(task, actor);
    const isAssignee = task.assignee_id === actor.id ||
      task.assignee_id === actor.employee_code ||
      task.assignee_employee_code === actor.employee_code ||
      normalizeText(task.assignee_name) === normalizeText(actor.name);
    if (actor.role !== 'ADMIN' && !isAssignee && task.created_by !== actor.id) {
      throw new HttpError(403, 'Chỉ người thực hiện mới có thể gửi báo cáo công việc.');
    }
    const rawBody = await readJson(request);
    const report = validateTaskReport(rawBody, actor.role === 'ADMIN');
    const timestamp = now();
    await db.transaction(async () => {
      await db.prepare(`INSERT INTO task_reports (
        id, task_id, author_id, content, attachments_json, progress, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(randomUUID(), task.id, actor.id, report.content, JSON.stringify(report.attachments), report.progress, report.status, timestamp);
      await db.prepare('UPDATE tasks SET progress = ?, status = ?, updated_at = ? WHERE id = ? OR code = ?')
        .run(report.progress, report.status, timestamp, task.id, task.id);
      await recordTaskActivity(task.id, actor.id, 'Đã gửi báo cáo công việc.', timestamp);
    });
    sendJson(response, 201, { task: await populateTaskDetails(publicTask(await taskRowById(task.id)), task.id) });
    return;
  }

  const checklistMatch = /^\/tasks\/([^/]+)\/checklists\/([^/]+)$/.exec(resource);
  if (checklistMatch && request.method === 'PATCH') {
    const actor = await requireUser(request);
    const taskId = decodeURIComponent(checklistMatch[1]);
    const checklistId = decodeURIComponent(checklistMatch[2]);
    const task = await taskRowById(taskId);
    ensureTaskAccess(task, actor);
    const item = await db.prepare('SELECT * FROM task_checklist_items WHERE id = ? AND (task_id = ? OR task_id = ?)').get(checklistId, task.id, task.code || task.id);
    if (!item) throw new HttpError(404, 'Không tìm thấy hạng mục checklist.');
    const payload = await readJson(request);
    const completed = payload.completed === undefined ? !item.is_completed : Boolean(payload.completed);
    const timestamp = now();
    await db.prepare('UPDATE task_checklist_items SET is_completed = ? WHERE id = ?').run(completed ? 1 : 0, checklistId);
    const totals = await db.prepare(`
      SELECT COUNT(*) AS total, COALESCE(SUM(is_completed), 0) AS completed FROM task_checklist_items WHERE task_id = ? OR task_id = ?
    `).get(task.id, task.code || task.id);
    const progress = totals.total ? Math.round((totals.completed / totals.total) * 100) : task.progress;
    const status = totals.total && totals.completed === totals.total
      ? 'Chờ nghiệm thu'
      : progress > 0 && task.status === 'Chưa bắt đầu'
        ? 'Đang thực hiện'
        : task.status;
    await db.prepare('UPDATE tasks SET progress = ?, status = ?, updated_at = ? WHERE id = ? OR code = ?')
      .run(progress, status, timestamp, task.id, task.id);
    await recordTaskActivity(task.id, actor.id, `${completed ? 'Đã hoàn thành' : 'Đã mở lại'} hạng mục “${item.title}”.`, timestamp);
    sendJson(response, 200, { task: await populateTaskDetails(publicTask(await taskRowById(task.id)), task.id) });
    return;
  }

  const taskCommentMatch = /^\/tasks\/([^/]+)\/comments$/.exec(resource);
  if (taskCommentMatch && request.method === 'POST') {
    const actor = await requireUser(request);
    const taskId = decodeURIComponent(taskCommentMatch[1]);
    const task = await taskRowById(taskId);
    ensureTaskAccess(task, actor);
    const content = requiredText((await readJson(request)).content, 'Nội dung bình luận', 2_000);
    const timestamp = now();
    await db.prepare('INSERT INTO task_comments (id, task_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(randomUUID(), task.id, actor.id, content, timestamp);
    await recordTaskActivity(task.id, actor.id, 'Đã thêm bình luận.', timestamp);
    sendJson(response, 201, { task: await populateTaskDetails(publicTask(await taskRowById(task.id)), task.id) });
    return;
  }

  if (request.method === 'GET' && resource === '/employee-proposals') {
    const actor = await requireUser(request);
    const rows = actor.role === 'ADMIN'
      ? await db.prepare(`
          SELECT p.*, submitter.name AS submitter_name, submitter.employee_code AS submitter_employee_code,
            reviewer.name AS reviewer_name
          FROM employee_proposals p
          JOIN users submitter ON submitter.id = p.submitter_id
          LEFT JOIN users reviewer ON reviewer.id = p.reviewer_id
          ORDER BY CASE p.status WHEN 'Chờ duyệt' THEN 0 ELSE 1 END, p.created_at DESC
        `).all()
      : await db.prepare(`
          SELECT p.*, submitter.name AS submitter_name, submitter.employee_code AS submitter_employee_code,
            reviewer.name AS reviewer_name
          FROM employee_proposals p
          JOIN users submitter ON submitter.id = p.submitter_id
          LEFT JOIN users reviewer ON reviewer.id = p.reviewer_id
          WHERE p.submitter_id = ?
          ORDER BY p.created_at DESC
        `).all(actor.id);
    sendJson(response, 200, { data: rows.map(publicProposal) });
    return;
  }

  if (request.method === 'POST' && resource === '/employee-proposals') {
    const actor = await requireUser(request);
    const proposal = validateEmployeeProposal(await readJson(request));
    const id = randomUUID();
    const timestamp = now();
    const code = await nextUniqueCode('KNG', 'employee_proposals');
    await db.prepare(`INSERT INTO employee_proposals (
      id, code, title, proposal_type, estimated_amount, content, submitter_id,
      status, reviewer_id, review_note, reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Chờ duyệt', NULL, '', NULL, ?, ?)`)
      .run(id, code, proposal.title, proposal.type, proposal.amount, proposal.content, actor.id, timestamp, timestamp);
    sendJson(response, 201, { proposal: publicProposal(await proposalRowById(id)) });
    return;
  }

  const employeeProposalMatch = /^\/employee-proposals\/([^/]+)$/.exec(resource);
  if (employeeProposalMatch && request.method === 'GET') {
    const actor = await requireUser(request);
    const proposal = await proposalRowById(decodeURIComponent(employeeProposalMatch[1]));
    if (!proposal) throw new HttpError(404, 'Không tìm thấy kiến nghị.');
    if (actor.role !== 'ADMIN' && proposal.submitter_id !== actor.id) {
      throw new HttpError(403, 'Bạn không có quyền xem kiến nghị này.');
    }
    sendJson(response, 200, { proposal: publicProposal(proposal) });
    return;
  }

  const employeeProposalReviewMatch = /^\/employee-proposals\/([^/]+)\/review$/.exec(resource);
  if (employeeProposalReviewMatch && request.method === 'PATCH') {
    const actor = await requireAdmin(request);
    const id = decodeURIComponent(employeeProposalReviewMatch[1]);
    const proposal = await proposalRowById(id);
    if (!proposal) throw new HttpError(404, 'Không tìm thấy kiến nghị.');
    if (proposal.status !== 'Chờ duyệt') throw new HttpError(422, 'Kiến nghị này đã được xử lý.');
    const payload = await readJson(request);
    const status = oneOf(payload.status, 'Kết quả tiếp nhận', ['Đã duyệt', 'Từ chối']);
    const reviewNote = optionalText(payload.reviewNote, 'Phản hồi tiếp nhận', 2_000);
    const timestamp = now();
    await db.prepare(`UPDATE employee_proposals
      SET status = ?, reviewer_id = ?, review_note = ?, reviewed_at = ?, updated_at = ?
      WHERE id = ?
    `).run(status, actor.id, reviewNote, timestamp, timestamp, id);
    sendJson(response, 200, { proposal: publicProposal(await proposalRowById(id)) });
    return;
  }

  // ==========================================
  // CONTRACTS API (Admin & Employee Signing)
  // ==========================================
  if (request.method === 'GET' && resource === '/contracts') {
    const actor = await requireUser(request);
    const rows = actor.role === 'ADMIN'
      ? await db.prepare('SELECT * FROM contracts ORDER BY created_at DESC').all()
      : await db.prepare(`
          SELECT * FROM contracts
          WHERE employee_user_id = ? OR employee_code = ? OR employee_name = ? COLLATE NOCASE OR party_b_name = ? COLLATE NOCASE
          ORDER BY created_at DESC
        `).all(actor.id, actor.employee_code || actor.id, actor.name, actor.name);
    sendJson(response, 200, { data: rows.map(r => publicContract(r, actor)) });
    return;
  }

  if (request.method === 'POST' && resource === '/contracts') {
    const actor = await requireAdmin(request);
    const payload = await readJson(request);
    const validated = validateContract(payload);
    const id = randomUUID();
    const timestamp = now();
    let syncedRow;
    await db.transaction(async () => {
    if (db.pool) await db.prepare("SELECT pg_advisory_xact_lock(hashtext('contracts-lifecycle'))").get();
    const code = validated.code || await nextUniqueCode('HD', 'contracts');
    if (await db.prepare('SELECT id FROM contracts WHERE code = ?').get(code)) throw new HttpError(409, 'Mã hợp đồng đã tồn tại.');

    await db.prepare(`INSERT INTO contracts (
      id, code, name, contract_category, contract_template, party_b_type, party_b_name,
      party_b_tax_code, party_b_representative, party_b_position, party_b_id_number,
      party_b_phone, party_b_email, party_b_bank, party_b_address, employee_code,
      employee_name, employee_id_number, employee_phone, employee_email, employee_bank,
      contract_type, position, department, job_level, work_location, start_date, end_date,
      probation_months, contract_value, salary, allowance, stock_shares_percent,
      payment_method, payment_day, working_hours, annual_leave_days, insurance_type,
      nda_clause, non_compete_clause, status, employee_sign_status, employee_sign_date,
      employee_sign_method, employee_cert_name, employee_signed_file_name,
      company_sign_status, company_sign_date, company_sign_method, company_cert_name,
      company_signed_file_name, signer_name, signer_position, note, custom_field_values_json,
      created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`).run(
      id,
      code,
      validated.name,
      validated.contractCategory,
      validated.contractTemplate,
      validated.partyBType,
      validated.partyBName,
      validated.partyBTaxCode,
      validated.partyBRepresentative,
      validated.partyBPosition,
      encryptField(validated.partyBIdNumber, 'contract'),
      encryptField(validated.partyBPhone, 'contract'),
      encryptField(validated.partyBEmail, 'contract'),
      encryptField(validated.partyBBank, 'contract'),
      encryptField(validated.partyBAddress, 'contract'),
      validated.employeeCode,
      validated.employeeName,
      encryptField(validated.employeeIdNumber, 'contract'),
      encryptField(validated.employeePhone, 'contract'),
      encryptField(validated.employeeEmail, 'contract'),
      encryptField(validated.employeeBank, 'contract'),
      validated.contractType,
      validated.position,
      validated.department,
      validated.jobLevel,
      validated.workLocation,
      validated.startDate,
      validated.endDate,
      validated.probationMonths,
      validated.contractValue,
      validated.salary,
      validated.allowance,
      validated.stockSharesPercent,
      validated.paymentMethod,
      validated.paymentDay,
      validated.workingHours,
      validated.annualLeaveDays,
      validated.insuranceType,
      validated.ndaClause,
      validated.nonCompeteClause,
      validated.status,
      validated.employeeSignStatus,
      validated.employeeSignDate,
      validated.employeeSignMethod,
      validated.employeeCertName,
      validated.employeeSignedFileName,
      validated.companySignStatus,
      validated.companySignDate,
      validated.companySignMethod,
      validated.companyCertName,
      validated.companySignedFileName,
      validated.signerName,
      validated.signerPosition,
      validated.note,
      validated.customFieldValuesJson,
      actor.id,
      timestamp,
      timestamp,
    );

    const savedRow = await db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
    await syncContractToFileNodes(savedRow);
    syncedRow = await db.prepare('SELECT * FROM contracts WHERE id = ?').get(id);
    });

    sendJson(response, 201, { contract: publicContract(syncedRow) });
    return;
  }

  const contractMatch = /^\/contracts\/([^/]+)$/.exec(resource);
  if (contractMatch) {
    const contractId = decodeURIComponent(contractMatch[1]);
    const row = await db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
    if (!row) throw new HttpError(404, 'Không tìm thấy hợp đồng.');

    if (request.method === 'GET') {
      const actor = await requireUser(request);
      if (
        actor.role !== 'ADMIN' &&
        row.employee_user_id !== actor.id &&
        row.employee_code !== actor.employee_code &&
        row.employee_name !== actor.name &&
        row.party_b_name !== actor.name
      ) {
        throw new HttpError(404, 'Tệp này không tồn tại.');
      }
      sendJson(response, 200, { contract: publicContract(row) });
      return;
    }

    if (request.method === 'PUT' || request.method === 'PATCH') {
      const actor = await requireAdmin(request);
      const payload = await readJson(request);
      const validated = validateContract(payload);
      const timestamp = now();
      let updatedRow;
      await db.transaction(async () => {
      if (db.pool) await db.prepare("SELECT pg_advisory_xact_lock(hashtext('contracts-lifecycle'))").get();
      await db.prepare(`UPDATE contracts SET
        name = ?, contract_category = ?, contract_template = ?, party_b_type = ?, party_b_name = ?,
        party_b_tax_code = ?, party_b_representative = ?, party_b_position = ?, party_b_id_number = ?,
        party_b_phone = ?, party_b_email = ?, party_b_bank = ?, party_b_address = ?, employee_code = ?,
        employee_name = ?, employee_id_number = ?, employee_phone = ?, employee_email = ?, employee_bank = ?,
        contract_type = ?, position = ?, department = ?, job_level = ?, work_location = ?, start_date = ?, end_date = ?,
        probation_months = ?, contract_value = ?, salary = ?, allowance = ?, stock_shares_percent = ?,
        payment_method = ?, payment_day = ?, working_hours = ?, annual_leave_days = ?, insurance_type = ?,
        nda_clause = ?, non_compete_clause = ?, status = ?, employee_sign_status = ?, employee_sign_date = ?,
        employee_sign_method = ?, employee_cert_name = ?, employee_signed_file_name = ?,
        company_sign_status = ?, company_sign_date = ?, company_sign_method = ?, company_cert_name = ?,
        company_signed_file_name = ?, signer_name = ?, signer_position = ?, note = ?, custom_field_values_json = ?,
        updated_at = ?
        WHERE id = ?
      `).run(
        validated.name,
        validated.contractCategory,
        validated.contractTemplate,
        validated.partyBType,
        validated.partyBName,
        validated.partyBTaxCode,
        validated.partyBRepresentative,
        validated.partyBPosition,
        encryptField(validated.partyBIdNumber, 'contract'),
        encryptField(validated.partyBPhone, 'contract'),
        encryptField(validated.partyBEmail, 'contract'),
        encryptField(validated.partyBBank, 'contract'),
        encryptField(validated.partyBAddress, 'contract'),
        validated.employeeCode,
        validated.employeeName,
        encryptField(validated.employeeIdNumber, 'contract'),
        encryptField(validated.employeePhone, 'contract'),
        encryptField(validated.employeeEmail, 'contract'),
        encryptField(validated.employeeBank, 'contract'),
        validated.contractType,
        validated.position,
        validated.department,
        validated.jobLevel,
        validated.workLocation,
        validated.startDate,
        validated.endDate,
        validated.probationMonths,
        validated.contractValue,
        validated.salary,
        validated.allowance,
        validated.stockSharesPercent,
        validated.paymentMethod,
        validated.paymentDay,
        validated.workingHours,
        validated.annualLeaveDays,
        validated.insuranceType,
        validated.ndaClause,
        validated.nonCompeteClause,
        validated.status,
        validated.employeeSignStatus,
        validated.employeeSignDate,
        validated.employeeSignMethod,
        validated.employeeCertName,
        validated.employeeSignedFileName,
        validated.companySignStatus,
        validated.companySignDate,
        validated.companySignMethod,
        validated.companyCertName,
        validated.companySignedFileName,
        validated.signerName,
        validated.signerPosition,
        validated.note,
        validated.customFieldValuesJson,
        timestamp,
        contractId,
      );

      updatedRow = await db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
      await syncContractToFileNodes(updatedRow);
      updatedRow = await db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
      });
      sendJson(response, 200, { contract: publicContract(updatedRow) });
      return;
    }

    if (request.method === 'DELETE') {
      await requireAdmin(request);
      if (row.file_node_id) {
        await db.prepare('UPDATE file_nodes SET deleted_at = ? WHERE id = ?').run(now(), row.file_node_id);
      }
      await db.prepare('DELETE FROM contracts WHERE id = ?').run(contractId);
      sendJson(response, 200, { deleted: true });
      return;
    }
  }

  const contractSignMatch = /^\/contracts\/([^/]+)\/sign$/.exec(resource);
  if (contractSignMatch && request.method === 'POST') {
    const actor = await requireUser(request);
    const contractId = decodeURIComponent(contractSignMatch[1]);
    const row = await db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
    if (!row) throw new HttpError(404, 'Không tìm thấy hợp đồng.');

    const isTargetEmployee =
      row.employee_user_id === actor.id ||
      row.employee_code === actor.employee_code ||
      row.employee_name === actor.name ||
      row.party_b_name === actor.name;

    if (actor.role !== 'ADMIN' && !isTargetEmployee) {
      throw new HttpError(403, 'Chỉ nhân sự thụ hưởng mới có thể ký hợp đồng này.');
    }

    const payload = await readJson(request);
    const signMethod = payload.signMethod || 'digital';
    const certName = payload.certName || (isTargetEmployee ? `${actor.name} CCCD NEAC Digital ID` : 'Ban Giám Đốc KIYOVN');
    const signedFileName = payload.signedFileName || `${row.code}_Signed_${(row.employee_name || actor.name).replace(/\s+/g, '_')}.pdf`;
    const timestamp = now();

    let newEmpSignStatus = row.employee_sign_status;
    let newEmpSignDate = row.employee_sign_date;
    let newEmpCert = row.employee_cert_name;
    let newEmpFile = row.employee_signed_file_name;

    let newCompSignStatus = row.company_sign_status;
    let newCompSignDate = row.company_sign_date;
    let newCompCert = row.company_cert_name;
    let newCompFile = row.company_signed_file_name;

    if (isTargetEmployee || payload.signAs === 'employee') {
      newEmpSignStatus = 'Đã ký';
      newEmpSignDate = timestamp;
      newEmpCert = certName;
      newEmpFile = signedFileName;
    } else {
      newCompSignStatus = 'Đã ký';
      newCompSignDate = timestamp;
      newCompCert = certName;
      newCompFile = signedFileName;
    }

    const newStatus = (newEmpSignStatus === 'Đã ký' || newCompSignStatus === 'Đã ký') ? 'Còn hiệu lực' : row.status;

    await db.prepare(`UPDATE contracts SET
      employee_sign_status = ?, employee_sign_date = ?, employee_sign_method = ?, employee_cert_name = ?, employee_signed_file_name = ?,
      company_sign_status = ?, company_sign_date = ?, company_sign_method = ?, company_cert_name = ?, company_signed_file_name = ?,
      status = ?, updated_at = ?
      WHERE id = ?
    `).run(
      newEmpSignStatus,
      newEmpSignDate,
      signMethod,
      newEmpCert,
      newEmpFile,
      newCompSignStatus,
      newCompSignDate,
      signMethod,
      newCompCert,
      newCompFile,
      newStatus,
      timestamp,
      contractId,
    );

    const updatedRow = await db.prepare('SELECT * FROM contracts WHERE id = ?').get(contractId);
    await syncContractToFileNodes(updatedRow);
    sendJson(response, 200, { contract: publicContract(updatedRow) });
    return;
  }

  if (resource === '/marketing/onboarding' && ['GET', 'PUT'].includes(request.method)) {
    const actor = await requireAdmin(request);
    if (request.method === 'GET') {
      const stored = await getSystemSetting('marketing_onboarding');
      sendJson(response, 200, { onboarding: stored ? parseJsonObject(stored) : null });
      return;
    }

    const payload = await readJson(request);
    const primaryProduct = oneOf(payload.primaryProduct, 'Sản phẩm marketing', ['email_marketing', 'marketing_automation']);
    const goalsByProduct = {
      email_marketing: ['attract_customers', 'nurture_leads', 'send_email_marketing'],
      marketing_automation: ['collect_leads', 'track_behavior', 'automate_customer_care', 'automate_marketing'],
    };
    if (!Array.isArray(payload.selectedGoals) || payload.selectedGoals.length < 1 || payload.selectedGoals.length > goalsByProduct[primaryProduct].length) {
      throw new HttpError(422, 'Hãy chọn ít nhất một mục tiêu phù hợp với sản phẩm đã chọn.');
    }
    const selectedGoals = payload.selectedGoals.map((goal) => oneOf(goal, 'Mục tiêu marketing', goalsByProduct[primaryProduct]));
    if (new Set(selectedGoals).size !== selectedGoals.length) throw new HttpError(422, 'Mục tiêu marketing không được chọn trùng.');

    let onboarding;
    await db.transaction(async () => {
      if (db.pool) await db.prepare("SELECT pg_advisory_xact_lock(hashtext('marketing-onboarding'))").get();
      const stored = await getSystemSetting('marketing_onboarding');
      const current = stored ? parseJsonObject(stored) : null;
      const timestamp = now();
      onboarding = {
        key: 'primary-goals', primaryProduct, selectedGoals,
        createdAt: current?.createdAt || timestamp, createdBy: current?.createdBy || actor.name,
        updatedAt: timestamp, updatedBy: actor.name,
      };
      await setSystemSetting('marketing_onboarding', JSON.stringify(onboarding));
      await recordAuditEvent(actor.id, 'save', 'marketing_onboarding', onboarding.key, { primaryProduct, selectedGoals });
    });
    sendJson(response, 200, { onboarding });
    return;
  }

  if (resource === '/system/company-profile' && ['GET', 'PUT'].includes(request.method)) {
    const actor = await requireAdmin(request);
    if (request.method === 'GET') { sendJson(response, 200, { profile: await getCompanyProfile() }); return; }
    const payload = await readJson(request);
    let profile;
    await db.transaction(async () => {
      if (db.pool) await db.prepare("SELECT pg_advisory_xact_lock(hashtext('company-profile'))").get();
      const current = await getCompanyProfile();
      if ((current.updatedAt && payload.updatedAt !== current.updatedAt) || (current.revision && payload.revision !== current.revision)) throw new HttpError(409, 'Thông tin công ty đã được thay đổi. Vui lòng tải lại trước khi lưu.');
      profile = {};
      for (const field of ['companyName', 'fullName', 'shortName', 'companyCode', 'taxCode', 'businessType', 'registrationNo', 'registrationIssuer', 'representative', 'representativeTitle', 'address', 'phone', 'fax', 'email', 'website', 'domain', 'bankAccountId']) profile[field] = optionalText(payload[field], 'Thông tin công ty', field === 'address' ? 1000 : 300);
      profile.companyName = requiredText(profile.companyName, 'Tên công ty', 300);
      if (profile.email) profile.email = normalizeEmail(profile.email);
      for (const field of ['establishedDate', 'registrationDate']) profile[field] = payload[field] ? requiredIsoDate(payload[field], 'Ngày đăng ký / thành lập') : '';
      if (profile.website) {
        let website;
        try { website = new URL(profile.website); } catch { throw new HttpError(422, 'Website phải là địa chỉ HTTP hoặc HTTPS hợp lệ.'); }
        if (!['http:', 'https:'].includes(website.protocol) || website.username || website.password) throw new HttpError(422, 'Website phải là địa chỉ HTTP hoặc HTTPS hợp lệ.');
        profile.website = website.href;
      }
      if (profile.domain) {
        let domain;
        try { domain = new URL(`https://${profile.domain}`); } catch { throw new HttpError(422, 'Tên miền không hợp lệ.'); }
        if (!domain.hostname || domain.username || domain.password || domain.pathname !== '/' || domain.search || domain.hash) throw new HttpError(422, 'Chỉ nhập tên miền, không nhập đường dẫn hoặc giao thức.');
        profile.domain = domain.host;
      }
      profile.timezone = oneOf(payload.timezone || 'Asia/Ho_Chi_Minh', 'Múi giờ hiển thị', ['Asia/Ho_Chi_Minh', 'UTC']);
      profile.currency = oneOf(payload.currency || 'VND', 'Tiền tệ hiển thị', ['VND', 'USD']);
      if (profile.bankAccountId && !await db.prepare("SELECT id FROM finance_bank_accounts WHERE id = ? AND status = 'Đang hoạt động'").get(profile.bankAccountId)) throw new HttpError(422, 'Tài khoản ngân hàng không tồn tại hoặc đã ngừng hoạt động.');
      profile.updatedAt = now(); profile.updatedBy = actor.name; profile.revision = Number(current.revision || 0) + 1;
      await db.prepare("INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES ('company_profile', ?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at").run(JSON.stringify(profile), profile.updatedAt);
      await recordAuditEvent(actor.id, 'update', 'company_profile', 'company_profile');
    });
    sendJson(response, 200, { profile }); return;
  }

  if (request.method === 'GET' && resource === '/system/email-config') {
    await requireAdmin(request);
    sendJson(response, 200, { config: await publicEmailConfig() });
    return;
  }

  if (request.method === 'PUT' && resource === '/system/email-config') {
    await requireAdmin(request);
    const config = await saveEmailConfig(await readJson(request));
    sendJson(response, 200, { config });
    return;
  }

  if (request.method === 'POST' && resource === '/system/email-config/test') {
    await requireAdmin(request);
    const payload = await readJson(request);
    const config = await getEmailConfig();
    if (!config.configured) throw new HttpError(422, 'Chưa cấu hình cổng gửi email doanh nghiệp.');
    const recipient = normalizeEmail(payload.recipient || config.senderEmail);
    const subject = 'Email kiểm tra từ KIYOVN Enterprise';
    try {
      await sendSmtpEmail({
        to: recipient,
        subject,
        text: 'Cấu hình SMTP của KIYOVN Enterprise đang hoạt động.',
        html: '<p>Cấu hình SMTP của <strong>KIYOVN Enterprise</strong> đang hoạt động.</p>',
      });
      await logOutboundEmail('smtp_test', recipient, subject, 'sent');
      sendJson(response, 200, { sent: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Không thể gửi email kiểm tra.';
      await logOutboundEmail('smtp_test', recipient, subject, 'failed', reason);
      throw new HttpError(422, reason);
    }
    return;
  }

  if (request.method === 'POST' && resource === '/system/send-email') {
    await requireAdmin(request);
    const payload = await readJson(request);
    const config = await getEmailConfig();
    if (!config.configured) throw new HttpError(422, 'Chưa cấu hình cổng gửi email doanh nghiệp.');

    let recipients = [];
    if (Array.isArray(payload.to)) {
      recipients = payload.to.map((r) => normalizeEmail(r)).filter(Boolean);
    } else if (typeof payload.to === 'string' && payload.to.trim()) {
      recipients = payload.to.split(/[,;\s]+/).map((r) => normalizeEmail(r)).filter(Boolean);
    }

    if (recipients.length === 0) {
      throw new HttpError(422, 'Vui lòng cung cấp ít nhất một địa chỉ email người nhận.');
    }

    const subject = String(payload.subject || 'Thông báo từ KIYOVN Enterprise').trim();
    const textContent = String(payload.content || payload.text || '').trim();
    const category = String(payload.category || 'system_notification');

    let htmlContent = payload.html;
    if (!htmlContent) {
      const safeSubject = escapeHtml(subject);
      const safeBody = escapeHtml(textContent).replace(/\n/g, '<br/>');
      htmlContent = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f8fb;font:14px Arial,sans-serif;color:#1f2937"><main style="max-width:560px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:28px"><h2 style="font-size:18px;margin:0 0 16px;color:#0F172A">${safeSubject}</h2><div style="font-size:14px;line-height:1.6;color:#334155">${safeBody}</div><hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;"/><p style="font-size:12px;color:#94a3b8;margin:0;">Thông báo tự động từ hệ thống KIYOVN Enterprise. Vui lòng không phản hồi email này.</p></main></body></html>`;
    }

    let sentCount = 0;
    const errors = [];

    for (const recipient of recipients) {
      try {
        await sendSmtpEmail({
          to: recipient,
          subject,
          text: textContent,
          html: htmlContent,
        });
        await logOutboundEmail(category, recipient, subject, 'sent');
        sentCount++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Không thể gửi email.';
        await logOutboundEmail(category, recipient, subject, 'failed', errMsg);
        errors.push(`${recipient}: ${errMsg}`);
      }
    }

    if (sentCount === 0 && errors.length > 0) {
      throw new HttpError(422, `Gửi email thất bại: ${errors[0]}`);
    }

    sendJson(response, 200, { sent: true, count: sentCount, total: recipients.length, errors });
    return;
  }

  if (request.method === 'GET' && resource === '/system/notification-templates/account-activation') {
    await requireAdmin(request);
    sendJson(response, 200, { template: await getActivationTemplate(), emailConfigured: await getEmailConfig().configured });
    return;
  }

  if (request.method === 'PUT' && resource === '/system/notification-templates/account-activation') {
    await requireAdmin(request);
    const template = await saveActivationTemplate(await readJson(request));
    sendJson(response, 200, { template });
    return;
  }

  if (request.method === 'GET' && resource === '/employees') {
    const actor = await requireUser(request);
    const rows = await db.prepare(`SELECT u.*, p.phone, p.department, p.position, p.employment_status, p.join_date,
      p.salary_base, p.avatar_url, p.details_json, p.created_at AS profile_created_at,
      p.updated_at AS profile_updated_at
      FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id
      WHERE u.role != 'ADMIN'
      ORDER BY u.created_at DESC`).all();
    sendJson(response, 200, { data: rows.map((r) => serializeEmployeeSummary(r, r, actor)) });
    return;
  }

  if (request.method === 'POST' && resource === '/employees') {
    await requireAdmin(request);
    const result = await createPendingEmployee(await readJson(request));
    sendJson(response, 201, result);
    return;
  }

  if (request.method === 'GET' && resource === '/employees/me') {
    const actor = await requireUser(request);
    await ensureEmployeeProfile(actor);
    sendJson(response, 200, { employee: publicEmployee(await employeeProfileRowByUserId(actor.id)) });
    return;
  }

  if (request.method === 'PATCH' && resource === '/employees/me') {
    const actor = await requireUser(request);
    const payload = await readJson(request);
    const employee = await updateEmployeeProfileRecord(actor.id, payload, { allowIdentityChanges: false });
    sendJson(response, 200, { employee });
    return;
  }

  const employeeMatch = /^\/employees\/([^/]+)$/.exec(resource);
  if (employeeMatch) {
    const employeeId = decodeURIComponent(employeeMatch[1]);
    if (request.method === 'GET') {
      const actor = await requireUser(request);
      if (actor.role !== 'ADMIN' && actor.id !== employeeId) throw new HttpError(403, 'Bạn không có quyền xem hồ sơ nhân sự này.');
      const row = await employeeProfileRowByUserId(employeeId);
      if (!row) throw new HttpError(404, 'Không tìm thấy nhân sự.');
      await ensureEmployeeProfile(row);
      sendJson(response, 200, { employee: publicEmployee(await employeeProfileRowByUserId(employeeId)) });
      return;
    }
    if (request.method === 'PATCH') {
      const actor = await requireUser(request);
      if (actor.role !== 'ADMIN' && actor.id !== employeeId) throw new HttpError(403, 'Bạn không có quyền cập nhật hồ sơ nhân sự này.');
      const employee = await updateEmployeeProfileRecord(employeeId, await readJson(request), { allowIdentityChanges: actor.role === 'ADMIN' });
      sendJson(response, 200, { employee });
      return;
    }
    if (request.method === 'DELETE') {
      const actor = await requireAdmin(request);
      if (actor.id === employeeId) throw new HttpError(422, 'Không thể ngừng tài khoản đang dùng.');
      let employee;
      await db.transaction(async () => {
        await lockUserAdministration(actor);
        const current = await employeeProfileRowByUserId(employeeId);
        if (!current) throw new HttpError(404, 'Không tìm thấy nhân sự.');
        if (current.id === actor.id) throw new HttpError(422, 'Không thể ngừng tài khoản đang dùng.');
        await retainActiveAdministrator(current);
        employee = await updateEmployeeProfileRecord(current.id, { status: 'Đã nghỉ việc' }, { allowIdentityChanges: true });
        await db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?').run(now(), current.id);
        await cleanupEmptyEmployeeWorkspace(current.id);
      });
      sendJson(response, 200, { employee: { ...employee, isActive: false, activationStatus: 'Đã nghỉ việc' } });
      return;
    }
  }

  const employeeActivationMatch = /^\/employees\/([^/]+)\/activation$/.exec(resource);
  if (employeeActivationMatch && request.method === 'POST') {
    await requireAdmin(request);
    const employeeId = decodeURIComponent(employeeActivationMatch[1]);
    const user = (await resolveUser(employeeId)) || (await getUserById(employeeId));
    if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản nhân sự.');
    const recentActivation = await recentPendingActivation(user.id);
    if (recentActivation) {
      sendJson(response, 200, {
        delivery: {
          status: 'recent',
          message: 'Link kích hoạt vừa được gửi. Vui lòng dùng email mới nhất trong hộp thư.',
        },
        expiresAt: recentActivation.expires_at,
      });
      return;
    }
    const activation = await createActivationToken(user.id);
    const config = await getEmailConfig();
    const delivery = config.configured
      ? await sendActivationEmail(user, activation.rawToken)
      : { status: 'not_configured', message: 'Chưa cấu hình cổng gửi email doanh nghiệp.' };
    sendJson(response, 200, { delivery, expiresAt: activation.expiresAt });
    return;
  }

  const employeePasswordMatch = /^\/employees\/([^/]+)\/password$/.exec(resource);
  if (employeePasswordMatch && request.method === 'POST') {
    const actor = await requireUser(request);
    const employeeId = decodeURIComponent(employeePasswordMatch[1]);
    const user = (await resolveUser(employeeId)) || (await getUserById(employeeId));
    if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản nhân sự.');

    if (actor.role !== 'ADMIN' && actor.id !== user.id) {
      throw new HttpError(403, 'Bạn không có quyền đổi mật khẩu cho tài khoản này.');
    }

    const payload = await readJson(request);
    const newPassword = String(payload.password || payload.newPassword || '').trim();
    const confirmPassword = String(payload.confirmPassword || '').trim();

    if (!newPassword) {
      throw new HttpError(422, 'Vui lòng nhập mật khẩu mới.');
    }
    if (newPassword.length < 6 || newPassword.length > 256) {
      throw new HttpError(422, 'Mật khẩu phải dài từ 6 đến 256 ký tự.');
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      throw new HttpError(422, 'Mật khẩu xác nhận không trùng khớp.');
    }

    const newHash = await hashPassword(newPassword);
    const timestamp = now();
    await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, timestamp, user.id);

    sendJson(response, 200, {
      success: true,
      message: `Đã đổi mật khẩu cho nhân sự ${user.name} (${user.employee_code}) thành công.`,
    });
    return;
  }

  if (request.method === 'GET' && resource === '/users') {
    await requireAdmin(request);
    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '20', 10) || 20));
    const total = (await db.prepare('SELECT COUNT(*) AS count FROM users').get())?.count;
    const rows = await db.prepare(`SELECT u.*, p.phone, p.department, p.position, p.employment_status,
      CASE WHEN u.is_active = 0 AND EXISTS(SELECT 1 FROM activation_tokens a WHERE a.user_id = u.id AND a.used_at IS NULL) THEN 1 ELSE 0 END AS activation_pending
      FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id
      ORDER BY u.created_at DESC LIMIT ? OFFSET ?`).all(limit, (page - 1) * limit);
    sendJson(response, 200, { data: rows.map(row => publicUser(row, row)), pagination: { page, limit, total } });
    return;
  }

  if (request.method === 'POST' && resource === '/users') {
    await requireAdmin(request);
    const user = await createUser(await readJson(request));
    sendJson(response, 201, { user });
    return;
  }

  const userMatch = /^\/users\/([^/]+)$/.exec(resource);
  if (userMatch) {
    const id = decodeURIComponent(userMatch[1]);
    if (request.method === 'GET') {
      const actor = await requireUser(request);
      if (actor.role !== 'ADMIN' && actor.id !== id) throw new HttpError(403, 'Bạn không có quyền xem tài khoản này.');
      const user = await getUserById(id);
      if (!user) throw new HttpError(404, 'Không tìm thấy tài khoản.');
      sendJson(response, 200, { user: publicUser(user) });
      return;
    }
    if (request.method === 'PATCH') {
      const actor = await requireAdmin(request);
      const target = await getUserById(id);
      if (!target) throw new HttpError(404, 'Không tìm thấy tài khoản.');
      const payload = await readJson(request);
      const suppliedName = payload.name === undefined && payload.fullName === undefined ? undefined : requiredText(payload.name || payload.fullName, 'Họ tên', 160);
      const suppliedEmail = payload.email === undefined ? undefined : normalizeEmail(payload.email);
      if (payload.role !== undefined && !['ADMIN', 'USER'].includes(payload.role)) throw new HttpError(422, 'Vai trò không hợp lệ.');
      if (payload.isActive !== undefined && typeof payload.isActive !== 'boolean') throw new HttpError(422, 'Trạng thái hoạt động phải là true hoặc false.');
      const suppliedHash = payload.password === undefined ? undefined : await hashPassword(validatePassword(payload.password));
      let updatedUser;
      await db.transaction(async () => {
        await lockUserAdministration(actor);
        const fresh = await getUserById(id);
        if (!fresh) throw new HttpError(404, 'Không tìm thấy tài khoản.');
        const name = suppliedName ?? fresh.name, email = suppliedEmail ?? fresh.email, role = payload.role ?? fresh.role;
        const isActive = payload.isActive === undefined ? fresh.is_active : payload.isActive ? 1 : 0;
        if (actor.id === id && !isActive) throw new HttpError(422, 'Không thể tự vô hiệu hóa tài khoản đang dùng.');
        const existingEmail = await getUserByEmail(email);
        if (existingEmail && existingEmail.id !== id) throw new HttpError(409, 'Email đã tồn tại.');
        if (role !== 'ADMIN' || !isActive) await retainActiveAdministrator(fresh);
        await db.prepare('UPDATE users SET name = ?, email = ?, role = ?, is_active = ?, password_hash = ?, updated_at = ? WHERE id = ?')
          .run(name, email, role, isActive, suppliedHash ?? fresh.password_hash, now(), id);
        const updated = await getUserById(id);
        await ensureEmployeeProfile(updated);
        if (payload.department !== undefined || payload.position !== undefined) await updateEmployeeProfileRecord(id, {
          ...(payload.department !== undefined ? { department: payload.department } : {}),
          ...(payload.position !== undefined ? { position: payload.position } : {}),
        }, { allowIdentityChanges: true });
        updatedUser = await getUserById(id);
        if (updatedUser.is_active) await ensureEmployeeWorkspace(updatedUser);
        else await cleanupEmptyEmployeeWorkspace(id);
      });
      sendJson(response, 200, { user: publicUser(updatedUser, await db.prepare('SELECT * FROM employee_profiles WHERE user_id = ?').get(id)) });
      return;
    }
    if (request.method === 'DELETE') {
      const actor = await requireAdmin(request);
      if (actor.id === id) throw new HttpError(422, 'Không thể tự xóa tài khoản đang dùng.');
      await db.transaction(async () => {
        await lockUserAdministration(actor);
        const target = await getUserById(id);
        if (!target) throw new HttpError(404, 'Không tìm thấy tài khoản.');
        await retainActiveAdministrator(target);
        const businessRecord = await db.prepare("SELECT scope FROM collection_records WHERE owner_id = ? AND scope <> 'admin_sessions' LIMIT 1").get(id);
        if (businessRecord) throw new HttpError(409, 'Tài khoản đang sở hữu hồ sơ nghiệp vụ. Vui lòng khóa tài khoản hoặc ghi nhận nghỉ việc để giữ nguyên dữ liệu.');
        await cleanupEmptyEmployeeWorkspace(id);
        await db.prepare('DELETE FROM users WHERE id = ?').run(id);
      });
      sendJson(response, 200, { deleted: true });
      return;
    }
  }

  // ==========================================
  // DOCUMENT EDITOR SYSTEM HELPERS & ROUTES
  // ==========================================
  const docSseClients = new Map();

  function broadcastDocEvent(docId, event, data) {
    const clients = docSseClients.get(docId);
    if (!clients || clients.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      try {
        client.write(payload);
      } catch {
        clients.delete(client);
      }
    }
  }

  async function documentRowById(id) {
    return await db.prepare(`
      SELECT d.*, owner.name AS owner_name, owner.employee_code AS owner_code
      FROM documents d
      JOIN users owner ON owner.id = d.owner_id
      WHERE d.id = ? AND d.deleted_at IS NULL
    `).get(id);
  }

  async function getUserDocumentRole(user, doc) {
    if (!doc) return null;
    if (user.role === 'ADMIN' || doc.owner_id === user.id) return 'owner';
    const member = await db.prepare('SELECT role FROM document_members WHERE document_id = ? AND user_id = ?').get(doc.id, user.id);
    return member?.role || null;
  }

  const DOC_ROLE_RANKS = { viewer: 1, commenter: 2, editor: 3, owner: 4 };

  async function requireDocumentAccess(user, docId, minRole = 'viewer') {
    const doc = await documentRowById(docId);
    if (!doc) throw new HttpError(404, 'Không tìm thấy tài liệu.');
    const role = await getUserDocumentRole(user, doc);
    if (!role || (DOC_ROLE_RANKS[role] || 0) < (DOC_ROLE_RANKS[minRole] || 1)) {
      throw new HttpError(403, 'Bạn không có quyền thực hiện thao tác này trên tài liệu.');
    }
    return { doc, role };
  }

  function publicDocument(row, userRole = 'viewer') {
    let settings = {};
    try {
      settings = JSON.parse(row.settings_json || '{}');
    } catch {}
    return {
      id: row.id,
      title: row.title,
      ownerId: row.owner_id,
      ownerName: row.owner_name,
      ownerCode: row.owner_code,
      currentRevision: Number(row.current_revision || 1),
      settings,
      userRole,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function publicDocumentComment(row) {
    let anchor = null;
    try {
      anchor = JSON.parse(row.anchor_data || '{}');
    } catch {}
    return {
      id: row.id,
      documentId: row.document_id,
      authorId: row.author_id,
      authorName: row.author_name || '',
      authorCode: row.author_code || '',
      anchor,
      body: row.body,
      resolved: Boolean(row.resolved),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // GET /documents - list user documents
  if (request.method === 'GET' && resource === '/documents') {
    const actor = await requireUser(request);
    const rows = actor.role === 'ADMIN'
      ? await db.prepare(`
          SELECT d.*, owner.name AS owner_name, owner.employee_code AS owner_code
          FROM documents d
          JOIN users owner ON owner.id = d.owner_id
          WHERE d.deleted_at IS NULL
          ORDER BY d.updated_at DESC
        `).all()
      : await db.prepare(`
          SELECT d.*, owner.name AS owner_name, owner.employee_code AS owner_code,
            COALESCE(dm.role, 'owner') AS user_role
          FROM documents d
          JOIN users owner ON owner.id = d.owner_id
          LEFT JOIN document_members dm ON dm.document_id = d.id AND dm.user_id = ?
          WHERE d.deleted_at IS NULL AND (d.owner_id = ? OR dm.user_id = ?)
          ORDER BY d.updated_at DESC
        `).all(actor.id, actor.id, actor.id);

    const result = await Promise.all(rows.map(async (r) => publicDocument(r, await getUserDocumentRole(actor, r))));
    sendJson(response, 200, { data: result });
    return;
  }

  // POST /documents - create document
  if (request.method === 'POST' && resource === '/documents') {
    const actor = await requireUser(request);
    const payload = await readJson(request);
    const id = payload.id && /^[a-zA-Z0-9_-]{1,64}$/.test(payload.id) ? payload.id : randomUUID();
    const title = optionalText(payload.title, 'Tiêu đề', 255) || 'Văn bản chưa đặt tên';
    const settings = payload.settings && typeof payload.settings === 'object' ? payload.settings : {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      pageColor: '#FFFFFF',
    };
    const initialData = payload.initialData ? (typeof payload.initialData === 'string' ? payload.initialData : JSON.stringify(payload.initialData)) : JSON.stringify({
      schemaVersion: 1,
      id,
      title,
      revision: 1,
      settings,
      blocks: [
        {
          id: 'b-init-1',
          type: 'paragraph',
          style: { alignment: 'left', lineHeight: 1.25, spaceBefore: 0, spaceAfter: 6 },
          runs: [{ id: 'r-init-1', text: '', marks: {} }]
        }
      ]
    });

    const timestamp = now();
    await db.transaction(async () => {
      await db.prepare(`INSERT INTO documents (id, owner_id, title, current_revision, settings_json, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?, ?)`).run(id, actor.id, title, JSON.stringify(settings), timestamp, timestamp);

      await db.prepare(`INSERT INTO document_snapshots (id, document_id, revision, data, created_at)
        VALUES (?, ?, 1, ?, ?)`).run(randomUUID(), id, initialData, timestamp);

    });

    const doc = await documentRowById(id);
    sendJson(response, 201, {
      document: publicDocument(doc, 'owner'),
      snapshot: { revision: 1, data: initialData },
    });
    return;
  }

  // GET /documents/:id/events - SSE Stream for realtime sync
  const docSseMatch = /^\/documents\/([^/]+)\/events$/.exec(resource);
  if (docSseMatch && request.method === 'GET') {
    const actor = await requireUser(request);
    const docId = decodeURIComponent(docSseMatch[1]);
    const { doc, role } = await requireDocumentAccess(actor, docId, 'viewer');

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': request.headers.origin || '*',
      'Access-Control-Allow-Headers': 'Authorization',
      'X-Accel-Buffering': 'no',
    });

    if (!docSseClients.has(docId)) {
      docSseClients.set(docId, new Set());
    }
    const clientSet = docSseClients.get(docId);
    clientSet.add(response);

    // Initial greeting
    response.write(`event: connected\ndata: ${JSON.stringify({ userId: actor.id, role, time: Date.now() })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        response.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 20000);

    request.on('close', () => {
      clearInterval(heartbeat);
      clientSet.delete(response);
      if (clientSet.size === 0) docSseClients.delete(docId);
    });
    return;
  }

  // POST /documents/:id/presence - ephemeral presence broadcast
  const docPresenceMatch = /^\/documents\/([^/]+)\/presence$/.exec(resource);
  if (docPresenceMatch && request.method === 'POST') {
    const actor = await requireUser(request);
    const docId = decodeURIComponent(docPresenceMatch[1]);
    await requireDocumentAccess(actor, docId, 'viewer');
    const payload = await readJson(request);

    const presenceData = {
      userId: actor.id,
      name: actor.name,
      employeeCode: actor.employee_code,
      clientId: payload.clientId || 'client',
      color: payload.color || '#0F6CBD',
      selection: payload.selection || null,
      lastActiveAt: Date.now(),
    };

    broadcastDocEvent(docId, 'presence', presenceData);
    sendJson(response, 200, { ok: true });
    return;
  }

  // Document resource matching
  const docItemMatch = /^\/documents\/([^/]+)$/.exec(resource);
  if (docItemMatch) {
    const docId = decodeURIComponent(docItemMatch[1]);

    if (request.method === 'GET') {
      const actor = await requireUser(request);
      const { doc, role } = await requireDocumentAccess(actor, docId, 'viewer');

      // Get latest snapshot
      const snapshotRow = await db.prepare(`
        SELECT * FROM document_snapshots WHERE document_id = ? ORDER BY revision DESC LIMIT 1
      `).get(docId);

      const snapshotRevision = snapshotRow ? Number(snapshotRow.revision) : 0;

      // Get operations after snapshot revision
      const operations = (await db.prepare(`
        SELECT * FROM document_operations WHERE document_id = ? AND revision > ? ORDER BY revision ASC
      `).all(docId, snapshotRevision)).map((op) => ({
        id: op.id,
        revision: Number(op.revision),
        clientId: op.client_id,
        transactionId: op.transaction_id,
        data: op.data,
        createdAt: op.created_at,
      }));

      sendJson(response, 200, {
        document: publicDocument(doc, role),
        snapshot: snapshotRow ? { revision: Number(snapshotRow.revision), data: snapshotRow.data } : null,
        operations,
      });
      return;
    }

    if (request.method === 'PATCH') {
      const actor = await requireUser(request);
      const { doc, role } = await requireDocumentAccess(actor, docId, 'editor');
      const payload = await readJson(request);
      const timestamp = now();

      const newTitle = payload.title !== undefined ? requiredText(payload.title, 'Tiêu đề', 255) : doc.title;
      const newSettings = payload.settings !== undefined ? JSON.stringify(payload.settings) : doc.settings_json;

      await db.prepare(`UPDATE documents SET title = ?, settings_json = ?, updated_at = ? WHERE id = ?`)
        .run(newTitle, newSettings, timestamp, docId);

      const updated = await documentRowById(docId);
      const docData = publicDocument(updated, role);
      broadcastDocEvent(docId, 'metadata_updated', docData);

      sendJson(response, 200, { document: docData });
      return;
    }

    if (request.method === 'DELETE') {
      const actor = await requireUser(request);
      await requireDocumentAccess(actor, docId, 'owner');
      const timestamp = now();
      await db.prepare('UPDATE documents SET deleted_at = ?, updated_at = ? WHERE id = ?').run(timestamp, timestamp, docId);
      sendJson(response, 200, { deleted: true });
      return;
    }
  }

  // POST /documents/:id/operations - batch append operations
  const docOpsMatch = /^\/documents\/([^/]+)\/operations$/.exec(resource);
  if (docOpsMatch && request.method === 'POST') {
    const actor = await requireUser(request);
    const docId = decodeURIComponent(docOpsMatch[1]);
    const { doc } = await requireDocumentAccess(actor, docId, 'editor');
    const payload = await readJson(request);

    const ops = Array.isArray(payload.operations) ? payload.operations : [];
    const appliedOps = [];
    let snapshotSaved = false;
    const timestamp = now();
    let currentRev = Number(doc.current_revision || 1);

    await db.transaction(async () => {
      const latest = await documentRowById(docId);
      const baseRevision = Number(latest.current_revision || 1);
      currentRev = baseRevision;
      for (const op of ops) {
        const opId = randomUUID();
        const txId = String(op.transactionId || randomUUID());
        if (await db.prepare('SELECT id FROM document_operations WHERE document_id = ? AND transaction_id = ?').get(docId, txId)) continue;
        currentRev += 1;
        const clientId = String(op.clientId || actor.id);
        const opData = typeof op.data === 'string' ? op.data : JSON.stringify(op);

        await db.prepare(`INSERT INTO document_operations (id, document_id, revision, client_id, transaction_id, data, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).run(opId, docId, currentRev, clientId, txId, opData, timestamp);
        appliedOps.push(op);
      }

      // If client also submitted an updated snapshot
      if (payload.snapshot && payload.snapshot.data && (!ops.length || appliedOps.length)) {
        const snapData = typeof payload.snapshot.data === 'string' ? payload.snapshot.data : JSON.stringify(payload.snapshot.data);
        await db.prepare(`INSERT INTO document_snapshots (id, document_id, revision, data, created_at)
          VALUES (?, ?, ?, ?, ?) ON CONFLICT(document_id, revision) DO UPDATE SET data = excluded.data`).run(randomUUID(), docId, currentRev, snapData, timestamp);
        snapshotSaved = true;
      }

      const updated = await db.prepare('UPDATE documents SET current_revision = ?, updated_at = ? WHERE id = ? AND current_revision = ?').run(currentRev, timestamp, docId, baseRevision);
      if (!updated.changes) throw new HttpError(409, 'Tài liệu vừa được cập nhật. Vui lòng tải lại và thử lại.');
    });

    const broadcastPayload = {
      revision: currentRev,
      actorId: actor.id,
      operations: appliedOps,
      snapshotRevision: snapshotSaved ? currentRev : undefined,
    };
    broadcastDocEvent(docId, 'operations', broadcastPayload);

    sendJson(response, 200, { success: true, revision: currentRev });
    return;
  }

  // POST /documents/:id/snapshots - save snapshot
  const docSnapMatch = /^\/documents\/([^/]+)\/snapshots$/.exec(resource);
  if (docSnapMatch && request.method === 'POST') {
    const actor = await requireUser(request);
    const docId = decodeURIComponent(docSnapMatch[1]);
    const { doc } = await requireDocumentAccess(actor, docId, 'editor');
    const payload = await readJson(request);
    const revision = Number(payload.revision || doc.current_revision);
    const data = typeof payload.data === 'string' ? payload.data : JSON.stringify(payload.data);
    const timestamp = now();

    await db.prepare(`INSERT INTO document_snapshots (id, document_id, revision, data, created_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(document_id, revision) DO UPDATE SET data = excluded.data`).run(randomUUID(), docId, revision, data, timestamp);

    sendJson(response, 200, { success: true, revision });
    return;
  }

  // GET /documents/:id/history - revisions & snapshot list
  const docHistoryMatch = /^\/documents\/([^/]+)\/history$/.exec(resource);
  if (docHistoryMatch && request.method === 'GET') {
    const actor = await requireUser(request);
    const docId = decodeURIComponent(docHistoryMatch[1]);
    await requireDocumentAccess(actor, docId, 'viewer');

    const snapshots = await db.prepare(`
      SELECT id, revision, created_at FROM document_snapshots
      WHERE document_id = ? ORDER BY revision DESC LIMIT 50
    `).all(docId);

    sendJson(response, 200, { history: snapshots });
    return;
  }

  // GET & POST /documents/:id/comments
  const docCommentsMatch = /^\/documents\/([^/]+)\/comments$/.exec(resource);
  if (docCommentsMatch) {
    const docId = decodeURIComponent(docCommentsMatch[1]);

    if (request.method === 'GET') {
      const actor = await requireUser(request);
      await requireDocumentAccess(actor, docId, 'viewer');

      const rows = await db.prepare(`
        SELECT c.*, u.name AS author_name, u.employee_code AS author_code
        FROM document_comments c
        JOIN users u ON u.id = c.author_id
        WHERE c.document_id = ?
        ORDER BY c.created_at ASC
      `).all(docId);

      sendJson(response, 200, { comments: rows.map(publicDocumentComment) });
      return;
    }

    if (request.method === 'POST') {
      const actor = await requireUser(request);
      await requireDocumentAccess(actor, docId, 'commenter');
      const payload = await readJson(request);
      const body = requiredText(payload.body, 'Nội dung bình luận', 4000);
      const anchorData = payload.anchor ? JSON.stringify(payload.anchor) : '{}';
      const id = randomUUID();
      const timestamp = now();

      await db.prepare(`INSERT INTO document_comments (id, document_id, author_id, anchor_data, body, resolved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?)`).run(id, docId, actor.id, anchorData, body, timestamp, timestamp);

      const createdRow = await db.prepare(`
        SELECT c.*, u.name AS author_name, u.employee_code AS author_code
        FROM document_comments c
        JOIN users u ON u.id = c.author_id
        WHERE c.id = ?
      `).get(id);

      const commentData = publicDocumentComment(createdRow);
      broadcastDocEvent(docId, 'comment_created', commentData);

      sendJson(response, 201, { comment: commentData });
      return;
    }
  }

  // PATCH & DELETE /documents/:id/comments/:commentId
  const docCommentItemMatch = /^\/documents\/([^/]+)\/comments\/([^/]+)$/.exec(resource);
  if (docCommentItemMatch) {
    const docId = decodeURIComponent(docCommentItemMatch[1]);
    const commentId = decodeURIComponent(docCommentItemMatch[2]);

    if (request.method === 'PATCH') {
      const actor = await requireUser(request);
      await requireDocumentAccess(actor, docId, 'commenter');
      const existing = await db.prepare('SELECT * FROM document_comments WHERE id = ? AND document_id = ?').get(commentId, docId);
      if (!existing) throw new HttpError(404, 'Không tìm thấy bình luận.');

      const payload = await readJson(request);
      const timestamp = now();
      const resolved = payload.resolved !== undefined ? (payload.resolved ? 1 : 0) : existing.resolved;
      const body = payload.body !== undefined ? requiredText(payload.body, 'Nội dung bình luận', 4000) : existing.body;

      await db.prepare('UPDATE document_comments SET body = ?, resolved = ?, updated_at = ? WHERE id = ?')
        .run(body, resolved, timestamp, commentId);

      const updatedRow = await db.prepare(`
        SELECT c.*, u.name AS author_name, u.employee_code AS author_code
        FROM document_comments c
        JOIN users u ON u.id = c.author_id
        WHERE c.id = ?
      `).get(commentId);

      const commentData = publicDocumentComment(updatedRow);
      broadcastDocEvent(docId, 'comment_updated', commentData);

      sendJson(response, 200, { comment: commentData });
      return;
    }

    if (request.method === 'DELETE') {
      const actor = await requireUser(request);
      const { role } = await requireDocumentAccess(actor, docId, 'commenter');
      const existing = await db.prepare('SELECT * FROM document_comments WHERE id = ? AND document_id = ?').get(commentId, docId);
      if (!existing) throw new HttpError(404, 'Không tìm thấy bình luận.');

      if (role !== 'owner' && existing.author_id !== actor.id) {
        throw new HttpError(403, 'Bạn chỉ có thể xóa bình luận do chính bạn tạo.');
      }

      await db.prepare('DELETE FROM document_comments WHERE id = ?').run(commentId);
      broadcastDocEvent(docId, 'comment_deleted', { commentId });

      sendJson(response, 200, { deleted: true });
      return;
    }
  }

  // GET /documents/:id/members & POST /documents/:id/share & DELETE /documents/:id/members/:userId
  const docShareMatch = /^\/documents\/([^/]+)\/share$/.exec(resource);
  if (docShareMatch && request.method === 'POST') {
    const actor = await requireUser(request);
    const docId = decodeURIComponent(docShareMatch[1]);
    await requireDocumentAccess(actor, docId, 'owner');
    const payload = await readJson(request);

    let targetUser = null;
    if (payload.userId) targetUser = await getUserById(payload.userId);
    else if (payload.email) targetUser = await getUserByEmail(normalizeEmail(payload.email));

    if (!targetUser) throw new HttpError(404, 'Không tìm thấy người dùng.');
    const role = oneOf(payload.role || 'editor', 'Vai trò chia sẻ', ['editor', 'commenter', 'viewer']);
    const timestamp = now();

    await db.prepare(`INSERT INTO document_members (id, document_id, user_id, role, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(document_id, user_id) DO UPDATE SET role = excluded.role`).run(randomUUID(), docId, targetUser.id, role, timestamp);

    sendJson(response, 200, { success: true, member: { userId: targetUser.id, name: targetUser.name, email: targetUser.email, role } });
    return;
  }

  const docMembersMatch = /^\/documents\/([^/]+)\/members$/.exec(resource);
  if (docMembersMatch && request.method === 'GET') {
    const actor = await requireUser(request);
    const docId = decodeURIComponent(docMembersMatch[1]);
    await requireDocumentAccess(actor, docId, 'viewer');

    const members = await db.prepare(`
      SELECT dm.id, dm.role, dm.created_at, u.id AS user_id, u.name, u.email, u.employee_code
      FROM document_members dm
      JOIN users u ON u.id = dm.user_id
      WHERE dm.document_id = ?
      ORDER BY dm.created_at ASC
    `).all(docId);

    sendJson(response, 200, { members });
    return;
  }

  throw new HttpError(404, `Không tìm thấy API: [${request.method}] ${pathname}`);
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Quản Trị Viên';
  const employeeCode = process.env.SEED_ADMIN_EMPLOYEE_CODE || 'ADMIN-001';
  if (!email || !password) {
    throw new Error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required.');
  }
  const user = await createUser({ email, password, name, employeeCode, role: 'ADMIN' });
  console.log(`Created admin account ${user.email} (${user.employeeCode}).`);
}

async function migrateAttendanceCollections() {
  if (await getSystemSetting('attendance_canonical_scopes_v1')) return;
  let migrated = 0;
  await db.transaction(async () => {
    const sourceRows = await db.prepare("SELECT * FROM collection_records WHERE scope IN ('employee_leaves', 'employee_overtime') ORDER BY updated_at DESC").all();
    for (const row of sourceRows) {
      const scope = row.scope === 'employee_leaves' ? 'leave_requests' : 'attendance_overtime';
      if (await db.prepare('SELECT id FROM collection_records WHERE scope = ? AND record_key = ?').get(scope, row.record_key)) continue;
      const record = parseJsonObject(row.payload_json);
      const owner = await getUserById(row.owner_id);
      let employee = record.employeeId ? await getUserById(record.employeeId) : null;
      if (!employee && (record.empCode || record.employeeCode)) employee = await db.prepare('SELECT * FROM users WHERE employee_code = ?').get(record.empCode || record.employeeCode);
      if (!employee && record.employeeName) {
        const matches = await db.prepare('SELECT * FROM users WHERE name = ?').all(record.employeeName);
        if (matches.length === 1) employee = matches[0];
      }
      if (!employee && owner?.role === 'USER') employee = owner;
      if (employee) { record.employeeId = employee.id; record.employeeName = employee.name; record.empCode = employee.employee_code; }
      record.key = row.record_key;
      if (scope === 'leave_requests') {
        record.startDate = record.startDate || record.fromDate || '';
        record.endDate = record.endDate || record.toDate || '';
        record.leaveType = record.leaveType || record.type || '';
        if (record.daysCount === undefined && record.days !== undefined) record.daysCount = Number(record.days);
        if (record.status === 'Đã phê duyệt') record.status = 'Đã duyệt';
      } else {
        record.otDate = record.otDate || record.date || '';
        if (record.totalHours === undefined && record.hours !== undefined) record.totalHours = Number(record.hours);
        if (!record.timeRange && record.fromTime && record.toTime) record.timeRange = `${record.fromTime} - ${record.toTime}`;
        if (record.status === 'Đã duyệt') record.status = 'Đã duyệt OT';
      }
      await db.prepare('INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(randomUUID(), scope, row.record_key, employee?.id || row.owner_id, JSON.stringify(record), row.created_at, row.updated_at);
      migrated++;
    }
    const canonicalRows = await db.prepare("SELECT * FROM collection_records WHERE scope IN ('leave_requests', 'attendance_overtime')").all();
    for (const row of canonicalRows) {
      const record = parseJsonObject(row.payload_json);
      let employee = record.employeeId ? await getUserById(record.employeeId) : null;
      if (!employee && (record.empCode || record.employeeCode)) employee = await db.prepare('SELECT * FROM users WHERE employee_code = ?').get(record.empCode || record.employeeCode);
      if (!employee && record.employeeName) {
        const matches = await db.prepare('SELECT * FROM users WHERE name = ?').all(record.employeeName);
        if (matches.length === 1) employee = matches[0];
      }
      if (!employee) continue;
      record.employeeId = employee.id;
      const collision = await db.prepare('SELECT id FROM collection_records WHERE scope = ? AND record_key = ? AND owner_id = ? AND id <> ?').get(row.scope, row.record_key, employee.id, row.id);
      if (!collision) await db.prepare('UPDATE collection_records SET owner_id = ?, payload_json = ? WHERE id = ?').run(employee.id, JSON.stringify(record), row.id);
    }
    await setSystemSetting('attendance_canonical_scopes_v1', JSON.stringify({ at: now(), migrated }));
  });
}

await migrateAttendanceCollections();
await ensureAllEmployeeWorkspaces();
if (process.env.SEED_DEMO_DATA === 'true') await seedDefaultContracts();

async function ensureAllContractsSynced() {
  const allContracts = await db.prepare('SELECT * FROM contracts').all();
  for (const c of allContracts) {
    await syncContractToFileNodes(c, { overwrite: false });
  }
}
await ensureAllContractsSynced();

if (process.argv.includes('--seed-admin')) {
  try {
    await seedAdmin();
    await db.close();
    process.exit(0);
  } catch (error) {
    await db.close();
    console.error(error instanceof Error ? error.message : 'Unable to create admin account.');
    process.exit(1);
  }
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error) => {
    if (response.headersSent || response.destroyed) { if (!response.destroyed) response.destroy(); return; }
    const suppliedStatus = error?.statusCode ?? error?.status;
    const status = error instanceof HttpError ? error.status : Number.isInteger(suppliedStatus) && suppliedStatus >= 400 && suppliedStatus < 500 ? suppliedStatus : 500;
    const message = status === 500 ? 'Máy chủ gặp lỗi. Vui lòng thử lại sau.' : error.message;
    if (status === 500) console.error('[500 Error]', error);
    sendJson(response, status, { message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`KIYOVN API listening on http://${HOST}:${PORT}`);
});

process.on('uncaughtException', (err) => {
  console.error('[Server Uncaught Exception]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server Unhandled Rejection]', reason);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(async () => {
    await db.close();
    process.exit(0);
  }));
}
