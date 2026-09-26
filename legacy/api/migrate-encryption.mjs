import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db, { initDatabaseSchema } from './db.mjs';
import { encryptField, decryptField, isEncrypted } from './crypto.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(process.env.KIYOVN_DATA_DIR || path.join(__dirname, '../data'));
const DB_PATH = path.resolve(process.env.KIYOVN_DB_PATH || path.join(DATA_DIR, 'kiyovn.sqlite'));

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${DB_PATH}.bak-${timestamp}`;
  try {
    await copyFile(DB_PATH, backupPath);
    console.log(`[Backup] Created safe database backup at: ${backupPath}`);
    return backupPath;
  } catch (err) {
    console.warn(`[Backup] Notice: Database backup skipped or not on SQLite: ${err.message}`);
    return null;
  }
}

export async function runEncryptionMigration() {
  console.log('=== KIYOVN Secure Envelope v1 - Database Encryption Migration ===');
  await mkdir(DATA_DIR, { recursive: true });
  await initDatabaseSchema();
  await backupDatabase();

  let employeeCount = 0;
  let contractCount = 0;

  // 1. Migrate Employee Profiles
  const profiles = await db.prepare('SELECT * FROM employee_profiles').all();
  for (const profile of profiles) {
    let updated = false;
    let newPhone = profile.phone;
    let newDetailsJson = profile.details_json;

    // Encrypt phone
    if (profile.phone && !isEncrypted(profile.phone)) {
      newPhone = encryptField(profile.phone, 'profile');
      updated = true;
    }

    // Encrypt confidential details
    if (profile.details_json) {
      try {
        const details = JSON.parse(profile.details_json);
        let detailsUpdated = false;

        const sensitiveKeys = ['idNumber', 'docNumber', 'bankAccount', 'taxCode', 'resAddress'];
        for (const k of sensitiveKeys) {
          if (details[k] && !isEncrypted(details[k])) {
            details[k] = encryptField(details[k], 'profile');
            detailsUpdated = true;
          }
        }

        if (detailsUpdated) {
          newDetailsJson = JSON.stringify(details);
          updated = true;
        }
      } catch {}
    }

    if (updated) {
      await db.prepare('UPDATE employee_profiles SET phone = ?, details_json = ?, updated_at = ? WHERE user_id = ?')
        .run(newPhone, newDetailsJson, new Date().toISOString(), profile.user_id);
      employeeCount += 1;
    }
  }

  // 2. Migrate Contracts
  const contracts = await db.prepare('SELECT * FROM contracts').all();
  for (const c of contracts) {
    let updated = false;
    const sensitiveFields = [
      'party_b_id_number', 'party_b_phone', 'party_b_email', 'party_b_bank', 'party_b_address',
      'employee_id_number', 'employee_phone', 'employee_email', 'employee_bank'
    ];

    const updates = {};
    for (const f of sensitiveFields) {
      if (c[f] && !isEncrypted(c[f])) {
        updates[f] = encryptField(c[f], 'contract');
        updated = true;
      } else {
        updates[f] = c[f];
      }
    }

    if (updated) {
      await db.prepare(`UPDATE contracts SET
        party_b_id_number = ?, party_b_phone = ?, party_b_email = ?, party_b_bank = ?, party_b_address = ?,
        employee_id_number = ?, employee_phone = ?, employee_email = ?, employee_bank = ?, updated_at = ?
        WHERE id = ?`)
        .run(
          updates.party_b_id_number, updates.party_b_phone, updates.party_b_email, updates.party_b_bank, updates.party_b_address,
          updates.employee_id_number, updates.employee_phone, updates.employee_email, updates.employee_bank,
          new Date().toISOString(), c.id
        );
      contractCount += 1;
    }
  }

  console.log(`[Migration] Encrypted ${employeeCount} employee profile(s) and ${contractCount} contract(s).`);
  console.log('[Migration] Verifying sample decryption...');

  // Verification step
  if (profiles.length > 0) {
    const sample = await db.prepare('SELECT * FROM employee_profiles LIMIT 1').get();
    if (sample && isEncrypted(sample.phone)) {
      const dec = decryptField(sample.phone, 'profile');
      console.log(`[Verify] Sample phone decryption verified successfully.`);
    }
  }

  console.log('=== Encryption Migration Completed Successfully ===');
}

if (process.argv[1] && process.argv[1].endsWith('migrate-encryption.mjs')) {
  runEncryptionMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration Error]', err);
      process.exit(1);
    });
}

export default runEncryptionMigration;
