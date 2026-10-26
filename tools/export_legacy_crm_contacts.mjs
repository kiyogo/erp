#!/usr/bin/env node
// Read-only SQLite exporter for legacy crm_contacts.
// It exports the four PII columns as their existing CRM ciphertext envelopes;
// it never reads application credentials, decrypts fields, writes the source DB,
// or logs contact records. Run only against a disposable/approved source copy.
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const FORMAT = "kiyovn-legacy-crm-contacts";
const MAX_RECORDS = 5_000;
const MAX_BYTES = 7 * 1024 * 1024;
const REQUIRED_COLUMNS = [
  "id", "code", "name", "contact_type", "tax_code", "industry", "contact_person",
  "phone", "email", "address", "bank_account", "credit_limit", "total_value",
  "debt_balance", "tier", "account_manager", "status", "created_by", "created_at",
  "updated_at",
];

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!["--source", "--source-id", "--output"].includes(flag)) {
      throw new Error(`Tùy chọn không được hỗ trợ: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Thiếu giá trị cho ${flag}.`);
    if (options[flag]) throw new Error(`Không được lặp tùy chọn ${flag}.`);
    options[flag] = value;
    index += 1;
  }
  if (!options["--source"] || !options["--source-id"]) {
    throw new Error("Cách dùng: node tools/export_legacy_crm_contacts.mjs --source <SQLite-copy> --source-id <stable-id> [--output <new-json-file>]");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(options["--source-id"])) {
    throw new Error("--source-id chỉ được dùng chữ ASCII, số, dấu chấm, gạch ngang hoặc gạch dưới (tối đa 64 ký tự).");
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourcePath = path.resolve(options["--source"]);
  const outputPath = path.resolve(options["--output"] ||
    `kiyovn-legacy-crm-contacts-${new Date().toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error("Không tìm thấy tệp SQLite nguồn; không tạo gói.");
  }
  if (sourcePath === outputPath) throw new Error("Tệp xuất không được trùng với database nguồn.");

  const db = new DatabaseSync(sourcePath, { readOnly: true });
  let outputCreated = false;
  try {
    db.exec("PRAGMA query_only=ON; BEGIN;");
    const table = db.prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='crm_contacts'",
    ).get();
    if (!table) throw new Error("Database không có bảng crm_contacts; chưa tạo gói.");

    const actualColumns = new Set(db.prepare("PRAGMA table_info(crm_contacts)").all().map((row) => row.name));
    const missing = REQUIRED_COLUMNS.filter((column) => !actualColumns.has(column));
    if (missing.length) throw new Error("Schema crm_contacts không khớp phiên bản được hỗ trợ; chưa tạo gói.");

    const count = db.prepare("SELECT COUNT(*) AS total FROM crm_contacts").get().total;
    if (!Number.isSafeInteger(count) || count < 1 || count > MAX_RECORDS) {
      throw new Error(`Số liên hệ phải nằm trong 1..${MAX_RECORDS}; không có dữ liệu nào được xuất.`);
    }

    const rows = db.prepare(`
      SELECT id,code,name,contact_type,tax_code,industry,contact_person,phone,email,address,
             bank_account,credit_limit,total_value,debt_balance,tier,account_manager,status,
             created_by,created_at,updated_at
      FROM crm_contacts ORDER BY id
    `).all();
    if (rows.length !== count) throw new Error("Số dòng thay đổi trong lúc export; hãy tạo snapshot DB rồi thử lại.");

    const ids = new Set();
    const contacts = rows.map((row) => {
      if (typeof row.id !== "string" || !row.id.trim() || ids.has(row.id)) {
        throw new Error("Database có contact id rỗng hoặc trùng; chưa tạo gói.");
      }
      ids.add(row.id);
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        type: row.contact_type,
        taxCode: row.tax_code,
        industry: row.industry,
        contactPerson: row.contact_person,
        phone: row.phone,
        email: row.email,
        address: row.address,
        bankAccount: row.bank_account,
        creditLimit: row.credit_limit,
        totalValue: row.total_value,
        debtBalance: row.debt_balance,
        tier: row.tier,
        accountManager: row.account_manager,
        status: row.status,
        createdBy: row.created_by,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    const bundle = {
      format: FORMAT,
      schemaVersion: 1,
      batchId: randomUUID(),
      sourceDatabaseId: options["--source-id"],
      exportedAt: new Date().toISOString(),
      contacts,
    };
    const json = `${JSON.stringify(bundle, null, 2)}\n`;
    const bytes = Buffer.byteLength(json, "utf8");
    if (bytes > MAX_BYTES) throw new Error("Gói xuất vượt quá 7 MiB; chưa tạo tệp.");

    fs.writeFileSync(outputPath, json, { encoding: "utf8", flag: "wx", mode: 0o600 });
    outputCreated = true;
    db.exec("ROLLBACK;");
    db.close();
    console.warn("Đã xuất contacts bằng database chỉ-đọc; không sửa DB nguồn. Tệp chứa dữ liệu liên hệ/kinh doanh, phải giữ trong đường dẫn được phê duyệt. Phone/email/address/bankAccount được giữ nguyên dưới dạng ciphertext legacy.", {
      sourceDatabaseId: bundle.sourceDatabaseId,
      batchId: bundle.batchId,
      contacts: contacts.length,
      bytes,
    });
  } catch (error) {
    try { db.exec("ROLLBACK;"); } catch {}
    try { db.close(); } catch {}
    if (outputCreated) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    throw error;
  }
}

try {
  main();
} catch (error) {
  console.error(`Export CRM contacts thất bại: ${error.message}`);
  process.exitCode = 1;
}
