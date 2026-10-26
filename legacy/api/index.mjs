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

function publicFinanceDocument(row) {
  return {
    key: row.id,
    code: row.code,
    documentType: row.document_type,
    subtype: row.subtype,
    partnerName: row.partner_name,
    description: row.description,
    amount: row.amount,
    paidAmount: row.paid_amount,
    remainingAmount: Math.max(0, row.amount - row.paid_amount),
    documentDate: row.document_date,
    dueDate: row.due_date || '',
    status: row.status,
    taxCode: row.tax_code,
    vatRate: row.vat_rate,
    vatAmount: row.vat_amount,
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

function requiredIsoDate(value, field) {
  const date = requiredText(value, field, 10);
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new HttpError(422, `${field} không đúng định dạng YYYY-MM-DD.`);
  }
  return date;
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
  'tickets.requests',
  'leave_requests',
  'attendance_overtime',
  'attendance_leave_summary',
  'attendance_explanations',
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

async function requireCollectionActor(request, scope) {
  const actor = await requireUser(request);
  if (actor.role !== 'ADMIN' && !canUseCollectionAsUser(scope)) {
    throw new HttpError(403, 'Bạn không có quyền truy cập dữ liệu quản trị này.');
  }
  if (actor.role !== 'ADMIN' && ['hr_job_openings', 'hr_recruitment_candidates', 'hr_onboarding_tasks', 'hr_employee_history', 'hr_rewards', 'hr_performance_reviews'].includes(scope)) {
    throw new HttpError(403, 'Chỉ quản trị viên được quản lý tuyển dụng.');
  }
  if (actor.role !== 'ADMIN' && scope === 'attendance_leave_summary' && request.method !== 'GET') throw new HttpError(403, 'Chỉ quản trị viên được điều chỉnh số dư phép.');
  if (scope === 'employee_timesheets' && request.method !== 'GET') throw new HttpError(405, 'Vui lòng chấm công qua chức năng ghi nhận giờ vào/ra.');
  if (request.method === 'PUT' && ['leave_requests', 'attendance_overtime', 'hr_recruitment_candidates', 'hr_employee_history', 'hr_rewards', 'hr_performance_reviews', 'enterprise_documents', 'doc_archives'].includes(scope)) {
    throw new HttpError(405, 'Vui lòng tạo hoặc cập nhật từng bản ghi để giữ lịch sử và quyền phê duyệt.');
  }
  return actor;
}

async function normalizeCollectionRecord(value, scope, actor, current = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(422, 'Bản ghi phải là một đối tượng JSON.');
  }
  const record = { ...value };
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
    record.date = requiredIsoDate(record.date, 'Ngày giải trình');
    record.reason = requiredText(record.reason, 'Lý do giải trình', 4000);
    record.employeeId = current?.employeeId || actor.id;
    record.employeeName = current?.employeeName || actor.name;
    record.status = oneOf(record.status || 'Chờ duyệt', 'Trạng thái giải trình', ['Chờ duyệt', 'Đã duyệt', 'Từ chối']);
    if (!current && record.status !== 'Chờ duyệt') throw new HttpError(422, 'Giải trình mới phải chờ duyệt.');
    if (actor.role !== 'ADMIN' && record.status !== 'Chờ duyệt') throw new HttpError(403, 'Chỉ quản trị viên được duyệt giải trình.');
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
    record.status = oneOf(record.status || 'Đang tuyển dụng', 'Trạng thái tuyển dụng', ['Đang tuyển dụng', 'Tạm dừng', 'Đã đóng (Đủ định biên)', 'Đã đủ chỉ tiêu']);
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
  if (scope === 'attendance_raw_data') record.status = oneOf(record.status || 'Cần kiểm tra', 'Trạng thái dữ liệu chấm công', ['Dữ liệu hợp lệ', 'Bản ghi trùng lặp (Đã lọc)', 'Cần kiểm tra']);
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
  if (record && row.scope === 'employee_timesheets') return { ...record, employeeId: row.owner_id };
  return record;
}

async function recordAuditEvent(actorId, action, scope, resourceId = '', details = {}) {
  const serialized = JSON.stringify(details && typeof details === 'object' && !Array.isArray(details) ? details : {});
  await db.prepare(`INSERT INTO audit_events (id, actor_id, action, resource_scope, resource_id, details_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(randomUUID(), actorId || null, requiredText(action, 'Hành động', 120), normalizeCollectionScope(scope), String(resourceId || '').slice(0, 160), serialized.slice(0, 8_192), now());
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

  if ((collectionMatch || collectionRecordMatch) && !['GET', 'HEAD'].includes(request.method)
    && normalizeCollectionScope(decodeURIComponent((collectionMatch || collectionRecordMatch)[1])) === 'finance_internal_transfers') {
    await requireAdmin(request);
    throw new HttpError(409, 'Lệnh điều chuyển phải được ghi hoặc hủy qua API điều chuyển để bảo toàn sổ quỹ.');
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
    ]);
    if (actor.role !== 'ADMIN' && scope === 'attendance_leave_summary') {
      where.push("(owner_id = ? OR json_extract(payload_json, '$.employeeId') = ?)");
      parameters.push(actor.id, actor.id);
    } else if (actor.role !== 'ADMIN' && !SHARED_READ_SCOPES.has(scope) && !scope.startsWith('business_') && !scope.startsWith('dropdown_')) {
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
        item = await normalizeCollectionRecord(payload.record, scope, actor);
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
    ]);
    const isShared = actor.role === 'ADMIN' || (request.method === 'GET' && (SHARED_READ_SCOPES.has(scope) || scope.startsWith('business_') || scope.startsWith('dropdown_')));
    const ownershipSql = isShared ? '' : ' AND owner_id = ?';
    const ownershipParams = isShared ? [] : [actor.id];
    const existing = await db.prepare(`SELECT * FROM collection_records WHERE scope = ? AND record_key = ?${ownershipSql} ORDER BY updated_at DESC LIMIT 1`)
      .get(scope, recordKey, ...ownershipParams);
    if (!existing) throw new HttpError(404, 'Không tìm thấy bản ghi.');

    if (request.method === 'PATCH') {
      const payload = await readJson(request, 256 * 1024);
      const patch = payload.patch;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new HttpError(422, 'Dữ liệu cập nhật không hợp lệ.');
      await db.transaction(async () => {
        if (db.pool) await db.query('SELECT pg_advisory_xact_lock(hashtext(?))', [scope]);
        const fresh = await db.prepare('SELECT * FROM collection_records WHERE id = ?').get(existing.id);
        if (!fresh) throw new HttpError(404, 'Không tìm thấy bản ghi.');
        const current = publicCollectionRecord(fresh) || {};
        const item = await normalizeCollectionRecord({ ...current, ...patch, key: current.key ?? recordKey }, scope, actor, current);
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
        if (['leave_requests', 'attendance_overtime', 'hr_rewards', 'hr_performance_reviews'].includes(scope)) {
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
    const node = requireFileAccess(actor, await fileNodeById(decodeURIComponent(fileDownloadMatch[1])));
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
    sendJson(response, 200, { data: rows.map(publicFinanceDocument) });
    return;
  }

  if (request.method === 'POST' && resource === '/finance/documents') {
    const actor = await requireAdmin(request);
    const document = validateFinanceDocument(await readJson(request));
    document.code = await nextUniqueCode(document.documentType === 'sale' ? 'SALE' : document.documentType === 'purchase' ? 'PUR' : 'INV', 'finance_documents');
    const id = randomUUID();
    const timestamp = now();
    const insertDocument = await db.prepare(`INSERT INTO finance_documents (
      id, document_type, code, subtype, partner_name, description, amount, paid_amount,
      document_date, due_date, status, tax_code, vat_rate, vat_amount, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    await db.transaction(async () => {
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
      await insertAutomaticCashTransaction(document, actor.id, timestamp);
    });
    sendJson(response, 201, { document: publicFinanceDocument(await db.prepare('SELECT * FROM finance_documents WHERE id = ?').get(id)) });
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
      totalAmount: row.total_amount,
      paidAmount: row.paid_amount,
      remainingAmount: Math.max(0, row.total_amount - row.paid_amount),
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
