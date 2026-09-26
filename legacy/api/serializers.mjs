import { decryptField } from './crypto.mjs';

/**
 * Server-Side Masking Functions
 * Ensures raw confidential data NEVER reaches the client without authorization.
 */
export function maskPhone(phone) {
  if (!phone) return '';
  const clean = String(phone).trim();
  if (clean.length < 7) return clean.replace(/.(?=.{2})/g, '*');
  const start = clean.slice(0, 3);
  const end = clean.slice(-3);
  return `${start}****${end}`;
}

export function maskEmail(email) {
  if (!email || !email.includes('@')) return email || '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  const first = local[0];
  const last = local[local.length - 1];
  return `${first}${'*'.repeat(Math.min(6, Math.max(2, local.length - 2)))}${last}@${domain}`;
}

export function maskBankAccount(account) {
  if (!account) return '';
  const clean = String(account).trim();
  if (clean.length <= 4) return '****';
  return `******${clean.slice(-4)}`;
}

export function maskIdNumber(idNumber) {
  if (!idNumber) return '';
  const clean = String(idNumber).trim();
  if (clean.length <= 6) return '******';
  return `${clean.slice(0, 3)}${'*'.repeat(Math.max(4, clean.length - 6))}${clean.slice(-3)}`;
}

/**
 * Check if the actor has permission to view full confidential details of a user.
 */
export function canViewFullEmployee(actor, targetUserId) {
  if (!actor) return false;
  if (actor.role === 'ADMIN') return true;
  if (actor.id === targetUserId) return true;
  return false;
}

/**
 * Check if the actor has permission to view salary / financial data.
 */
export function canViewSalary(actor, targetUserId) {
  if (!actor) return false;
  if (actor.role === 'ADMIN') return true;
  if (actor.id === targetUserId) return true;
  return false;
}

/**
 * Employee List DTO (Data Minimization)
 * Used by GET /api/v1/employees
 * Strictly returns only the fields needed for the employee table list.
 * Strips out salary, raw details_json, timestamps, activation metadata.
 */
export function serializeEmployeeSummary(userRow, profileRow, actor) {
  if (!userRow) return null;

  const rawPhone = profileRow ? decryptField(profileRow.phone, 'profile') : '';
  const hasFullAccess = canViewFullEmployee(actor, userRow.id);
  const displayPhone = hasFullAccess ? rawPhone : maskPhone(rawPhone);

  const dto = {
    id: userRow.id,
    key: userRow.id,
    employeeCode: userRow.employee_code,
    code: userRow.employee_code,
    name: userRow.name,
    fullName: userRow.name,
    email: userRow.email,
    phone: displayPhone,
    department: profileRow?.department || '',
    position: profileRow?.position || '',
    status: profileRow?.employment_status || 'Chính thức',
    role: userRow.role,
    isActive: Boolean(userRow.is_active),
    avatar: profileRow?.avatar_url || '',
  };

  if (profileRow?.join_date) {
    dto.joinDate = profileRow.join_date;
  }

  return dto;
}

/**
 * Employee Detail DTO
 * Used by GET /api/v1/employees/:id and GET /api/v1/employees/me
 */
export function serializeEmployeeDetail(userRow, profileRow, actor) {
  if (!userRow) return null;

  const isSelfOrAdmin = canViewFullEmployee(actor, userRow.id);
  const rawPhone = profileRow ? decryptField(profileRow.phone, 'profile') : '';
  const rawDetails = profileRow ? parseJsonSafe(profileRow.details_json) : {};

  // Decrypt confidential fields inside details if any
  const decryptedDetails = { ...rawDetails };
  if (decryptedDetails.idNumber) decryptedDetails.idNumber = decryptField(decryptedDetails.idNumber, 'profile');
  if (decryptedDetails.docNumber) decryptedDetails.docNumber = decryptField(decryptedDetails.docNumber, 'profile');
  if (decryptedDetails.bankAccount) decryptedDetails.bankAccount = decryptField(decryptedDetails.bankAccount, 'profile');
  if (decryptedDetails.taxCode) decryptedDetails.taxCode = decryptField(decryptedDetails.taxCode, 'profile');
  if (decryptedDetails.resAddress) decryptedDetails.resAddress = decryptField(decryptedDetails.resAddress, 'profile');

  let rawSalary = profileRow?.salary_base || 0;
  if (typeof rawSalary === 'string') {
    const decryptedSalary = decryptField(rawSalary, 'salary');
    rawSalary = Number(decryptedSalary) || 0;
  }

  const dto = {
    id: userRow.id,
    key: userRow.id,
    userId: userRow.id,
    employeeCode: userRow.employee_code,
    code: userRow.employee_code,
    name: userRow.name,
    fullName: userRow.name,
    email: userRow.email,
    phone: isSelfOrAdmin ? rawPhone : maskPhone(rawPhone),
    department: profileRow?.department || '',
    position: profileRow?.position || '',
    status: profileRow?.employment_status || 'Chính thức',
    joinDate: profileRow?.join_date || '',
    role: userRow.role,
    isActive: Boolean(userRow.is_active),
    avatar: profileRow?.avatar_url || '',
    avatarUrl: profileRow?.avatar_url || '',
  };

  // Only include salary and private profile fields if authorized
  if (canViewSalary(actor, userRow.id)) {
    dto.salaryBase = rawSalary;
  }

  if (isSelfOrAdmin) {
    dto.details = decryptedDetails;
  } else {
    // Sanitized public details for non-admin viewers
    dto.details = {
      workLocation: decryptedDetails.workLocation || '',
      team: decryptedDetails.team || '',
      skills: decryptedDetails.skills || '',
    };
  }

  return dto;
}

/**
 * User Profile DTO for Authenticated User (/auth/profile)
 */
export function serializeUserProfile(userRow, profileRow) {
  if (!userRow) return null;
  const rawDetails = profileRow ? parseJsonSafe(profileRow.details_json) : {};
  const rawPhone = profileRow ? decryptField(profileRow.phone, 'profile') : '';

  const onboardingCompleted = Boolean(
    userRow.role === 'ADMIN' ||
    userRow.onboarding_completed ||
    rawDetails.onboardingCompleted ||
    rawDetails.onboardingDone ||
    (profileRow && (profileRow.phone || profileRow.avatar_url || rawDetails.resAddress || rawDetails.docNumber || rawDetails.idNumber))
  );

  return {
    id: userRow.id,
    email: userRow.email,
    name: userRow.name,
    fullName: userRow.name,
    employeeCode: userRow.employee_code,
    role: userRow.role,
    isActive: Boolean(userRow.is_active),
    phone: rawPhone,
    department: profileRow?.department || '',
    position: profileRow?.position || '',
    status: profileRow?.employment_status || 'Chính thức',
    joinDate: profileRow?.join_date || '',
    avatarUrl: profileRow?.avatar_url || '',
    onboardingCompleted,
    details: rawDetails,
  };
}

/**
 * Contract DTO
 */
export function serializeContract(row, actor) {
  if (!row) return null;
  const isFull = actor?.role === 'ADMIN' || actor?.id === row.employee_user_id;

  const decrypted = {
    ...row,
    party_b_id_number: decryptField(row.party_b_id_number, 'contract'),
    party_b_phone: decryptField(row.party_b_phone, 'contract'),
    party_b_email: decryptField(row.party_b_email, 'contract'),
    party_b_bank: decryptField(row.party_b_bank, 'contract'),
    party_b_address: decryptField(row.party_b_address, 'contract'),
    employee_id_number: decryptField(row.employee_id_number, 'contract'),
    employee_phone: decryptField(row.employee_phone, 'contract'),
    employee_email: decryptField(row.employee_email, 'contract'),
    employee_bank: decryptField(row.employee_bank, 'contract'),
  };

  if (!isFull) {
    decrypted.party_b_id_number = maskIdNumber(decrypted.party_b_id_number);
    decrypted.party_b_phone = maskPhone(decrypted.party_b_phone);
    decrypted.party_b_email = maskEmail(decrypted.party_b_email);
    decrypted.party_b_bank = maskBankAccount(decrypted.party_b_bank);
    decrypted.employee_id_number = maskIdNumber(decrypted.employee_id_number);
    decrypted.employee_phone = maskPhone(decrypted.employee_phone);
    decrypted.employee_email = maskEmail(decrypted.employee_email);
    decrypted.employee_bank = maskBankAccount(decrypted.employee_bank);
  }

  return decrypted;
}

/**
 * Collection Record DTO (for /collections/:scope)
 * Strips internal technical metadata, ensuring clean data delivery.
 */
export function serializeCollectionRecord(row, _actor) {
  if (!row) return null;
  const payload = parseJsonSafe(row.payload_json);
  if (typeof payload === 'object' && payload !== null) {
    return {
      ...payload,
      key: payload.key || row.record_key,
      id: payload.id || row.id,
    };
  }
  return {
    id: row.id,
    key: row.record_key,
    value: payload,
  };
}

function parseJsonSafe(str) {
  if (!str) return {};
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

export default {
  maskPhone,
  maskEmail,
  maskBankAccount,
  maskIdNumber,
  serializeEmployeeSummary,
  serializeEmployeeDetail,
  serializeUserProfile,
  serializeContract,
  serializeCollectionRecord,
};
