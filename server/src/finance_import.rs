use axum::{
    Json,
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use chrono::{NaiveDate, Utc};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const FORMAT: &str = "kiyovn-legacy-finance";
const MAX_RECORDS: usize = 10_000;
const MAX_BODY_BYTES: usize = 16 * 1024 * 1024;

pub fn install_schema(db: &Connection) -> anyhow::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS finance_legacy_import_runs (
            batch_id TEXT PRIMARY KEY,
            actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            source_database_id TEXT NOT NULL,
            exported_at TEXT NOT NULL,
            imported_at TEXT NOT NULL,
            payload_sha256 TEXT NOT NULL,
            source_records INTEGER NOT NULL CHECK (source_records > 0),
            imported_records INTEGER NOT NULL CHECK (imported_records >= 0),
            already_imported_records INTEGER NOT NULL CHECK (already_imported_records >= 0),
            imported_accounts INTEGER NOT NULL CHECK (imported_accounts >= 0),
            imported_cash_transactions INTEGER NOT NULL CHECK (imported_cash_transactions >= 0)
        );
        CREATE TABLE IF NOT EXISTS finance_legacy_import_rows (
            source_key_sha256 TEXT PRIMARY KEY,
            source_payload_sha256 TEXT NOT NULL,
            source_table TEXT NOT NULL CHECK (source_table IN ('finance_bank_accounts','finance_cash_transactions')),
            source_record_id TEXT NOT NULL,
            target_record_id TEXT NOT NULL,
            batch_id TEXT NOT NULL REFERENCES finance_legacy_import_runs(batch_id) ON DELETE RESTRICT,
            legacy_payload_enc TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(batch_id, source_table, source_record_id)
        );
        CREATE INDEX IF NOT EXISTS finance_legacy_import_rows_table_idx
            ON finance_legacy_import_rows(source_table, source_record_id);
        CREATE TRIGGER IF NOT EXISTS finance_legacy_import_runs_no_update
            BEFORE UPDATE ON finance_legacy_import_runs
            BEGIN SELECT RAISE(ABORT, 'finance legacy import runs are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS finance_legacy_import_runs_no_delete
            BEFORE DELETE ON finance_legacy_import_runs
            BEGIN SELECT RAISE(ABORT, 'finance legacy import runs are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS finance_legacy_import_rows_no_update
            BEFORE UPDATE ON finance_legacy_import_rows
            BEGIN SELECT RAISE(ABORT, 'finance legacy import rows are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS finance_legacy_import_rows_no_delete
            BEFORE DELETE ON finance_legacy_import_rows
            BEGIN SELECT RAISE(ABORT, 'finance legacy import rows are append-only'); END;",
    )?;
    Ok(())
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FinanceBundle {
    format: String,
    schema_version: u32,
    batch_id: String,
    source_database_id: String,
    exported_at: String,
    accounts: Vec<LegacyBankAccount>,
    cash_transactions: Vec<LegacyCashTransaction>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyBankAccount {
    key: String,
    bank_name: String,
    account_number: String,
    account_holder: String,
    branch: String,
    balance: i64,
    status: String,
    created_by: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyCashTransaction {
    key: String,
    code: String,
    #[serde(rename = "type")]
    transaction_type: String,
    source: String,
    category: String,
    amount: i64,
    date: String,
    recipient_or_payer: String,
    account: String,
    status: String,
    note: String,
    department: Option<String>,
    employee_code: Option<String>,
    created_by: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviewRequest {
    bundle: FinanceBundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRequest {
    bundle: FinanceBundle,
    expected_payload_sha256: String,
    confirmation: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportPreview {
    batch_id: String,
    source_database_id: String,
    payload_sha256: String,
    confirmation_phrase: String,
    source_records: usize,
    importable_records: usize,
    already_imported_records: usize,
    conflicted_records: usize,
    account_records: usize,
    cash_transaction_records: usize,
    importable_accounts: usize,
    already_imported_accounts: usize,
    conflicted_accounts: usize,
    importable_cash_transactions: usize,
    already_imported_cash_transactions: usize,
    conflicted_cash_transactions: usize,
    can_apply: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    batch_id: String,
    source_records: usize,
    imported_records: usize,
    already_imported_records: usize,
    imported_accounts: usize,
    imported_cash_transactions: usize,
    imported_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
enum Outcome {
    Import,
    AlreadyImported,
    Conflict,
}

struct PlannedAccount {
    record: LegacyBankAccount,
    plaintext_account_number: String,
    source_key_sha256: String,
    source_payload_sha256: String,
    outcome: Outcome,
}

struct PlannedCashTransaction {
    record: LegacyCashTransaction,
    source_key_sha256: String,
    source_payload_sha256: String,
    outcome: Outcome,
}

struct ImportPlan {
    accounts: Vec<PlannedAccount>,
    cash_transactions: Vec<PlannedCashTransaction>,
    payload_sha256: String,
    imported_records: usize,
    already_imported_records: usize,
    conflicted_records: usize,
    imported_accounts: usize,
    already_imported_accounts: usize,
    conflicted_accounts: usize,
    imported_cash_transactions: usize,
    already_imported_cash_transactions: usize,
    conflicted_cash_transactions: usize,
}

impl ImportPlan {
    fn preview(&self, bundle: &FinanceBundle) -> ImportPreview {
        let source_records = self.accounts.len() + self.cash_transactions.len();
        let conflicted_records = self.conflicted_records;
        ImportPreview {
            batch_id: bundle.batch_id.clone(),
            source_database_id: bundle.source_database_id.clone(),
            payload_sha256: self.payload_sha256.clone(),
            confirmation_phrase: confirmation_phrase(&bundle.batch_id, source_records),
            source_records,
            importable_records: self.imported_records,
            already_imported_records: self.already_imported_records,
            conflicted_records,
            account_records: self.accounts.len(),
            cash_transaction_records: self.cash_transactions.len(),
            importable_accounts: self.imported_accounts,
            already_imported_accounts: self.already_imported_accounts,
            conflicted_accounts: self.conflicted_accounts,
            importable_cash_transactions: self.imported_cash_transactions,
            already_imported_cash_transactions: self.already_imported_cash_transactions,
            conflicted_cash_transactions: self.conflicted_cash_transactions,
            can_apply: self.imported_records > 0 && conflicted_records == 0,
        }
    }
}

pub(super) async fn preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let request: PreviewRequest = parse_request(&body)?;
    validate_bundle(&request.bundle)?;
    let crypto = require_crypto(&state)?;
    let db = state.db.lock().await;
    let plan = build_plan(&db, &request.bundle, crypto)?;
    Ok(Json(json!({ "preview": plan.preview(&request.bundle) })))
}

pub(super) async fn apply(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let request: ApplyRequest = parse_request(&body)?;
    validate_bundle(&request.bundle)?;
    let crypto = require_crypto(&state)?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let plan = build_plan(&transaction, &request.bundle, crypto)?;
    if request.expected_payload_sha256 != plan.payload_sha256 {
        return Err(ApiError::conflict(
            "Gói finance legacy hoặc dữ liệu đích đã đổi sau khi xem trước. Hãy xem trước lại.",
        ));
    }
    let preview = plan.preview(&request.bundle);
    if request.confirmation.trim() != preview.confirmation_phrase {
        return Err(ApiError::unprocessable(format!(
            "Cụm xác nhận chưa chính xác. Hãy nhập: {}",
            preview.confirmation_phrase
        )));
    }
    if !preview.can_apply {
        return Err(ApiError::conflict(
            "Gói finance có xung đột hoặc không còn bản ghi mới. Không có dữ liệu nào được ghi.",
        ));
    }
    let prior_batch: Option<String> = transaction
        .query_row(
            "SELECT batch_id FROM finance_legacy_import_runs WHERE batch_id=?1",
            params![request.bundle.batch_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    if prior_batch.is_some() {
        return Err(ApiError::conflict(
            "Lô finance legacy này đã được áp dụng trước đó.",
        ));
    }

    let imported_at = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO finance_legacy_import_runs
             (batch_id,actor_user_id,source_database_id,exported_at,imported_at,payload_sha256,
              source_records,imported_records,already_imported_records,imported_accounts,
              imported_cash_transactions)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                request.bundle.batch_id,
                actor.id,
                request.bundle.source_database_id,
                request.bundle.exported_at,
                imported_at,
                plan.payload_sha256,
                preview.source_records,
                plan.imported_records,
                plan.already_imported_records,
                plan.imported_accounts,
                plan.imported_cash_transactions,
            ],
        )
        .map_err(|_| ApiError::conflict("Không thể ghi audit lô finance; transaction đã hủy."))?;

    for planned in &plan.accounts {
        if planned.outcome != Outcome::Import {
            continue;
        }
        let source = &planned.record;
        let encrypted_account_number =
            crate::crm::encrypt_finance_field(&planned.plaintext_account_number, crypto)?;
        transaction
            .execute(
                "INSERT INTO finance_bank_accounts
                 (id,bank_name,account_number,account_holder,branch,opening_balance,status,
                  created_by,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
                params![
                    source.key,
                    source.bank_name,
                    encrypted_account_number,
                    source.account_holder,
                    source.branch,
                    source.balance,
                    source.status,
                    actor.id,
                    source.created_at,
                    source.updated_at,
                ],
            )
            .map_err(|_| {
                ApiError::conflict(
                    "Tài khoản ngân hàng đích đã đổi trong lúc nhập; toàn bộ transaction đã hủy.",
                )
            })?;
        archive_imported_row(
            &transaction,
            "finance_bank_accounts",
            &source.key,
            &planned.source_key_sha256,
            &planned.source_payload_sha256,
            &request.bundle.batch_id,
            &serde_json::to_string(source).map_err(ApiError::internal)?,
            &imported_at,
            crypto,
        )?;
    }

    for planned in &plan.cash_transactions {
        if planned.outcome != Outcome::Import {
            continue;
        }
        let source = &planned.record;
        transaction
            .execute(
                "INSERT INTO finance_cash_transactions
                 (id,code,transaction_type,source,category,amount,transaction_date,counterparty,
                  account_name,status,note,department,employee_code,created_by,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)",
                params![
                    source.key,
                    source.code,
                    source.transaction_type,
                    source.source,
                    source.category,
                    source.amount,
                    source.date,
                    source.recipient_or_payer,
                    source.account,
                    source.status,
                    source.note,
                    source.department.as_deref().filter(|value| !value.is_empty()),
                    source.employee_code.as_deref().filter(|value| !value.is_empty()),
                    actor.id,
                    source.created_at,
                    source.updated_at,
                ],
            )
            .map_err(|_| {
                ApiError::conflict(
                    "Phiếu thu chi đích đã đổi trong lúc nhập; toàn bộ transaction đã hủy.",
                )
            })?;
        archive_imported_row(
            &transaction,
            "finance_cash_transactions",
            &source.key,
            &planned.source_key_sha256,
            &planned.source_payload_sha256,
            &request.bundle.batch_id,
            &serde_json::to_string(source).map_err(ApiError::internal)?,
            &imported_at,
            crypto,
        )?;
    }

    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "import": ImportResult {
            batch_id: request.bundle.batch_id,
            source_records: preview.source_records,
            imported_records: plan.imported_records,
            already_imported_records: plan.already_imported_records,
            imported_accounts: plan.imported_accounts,
            imported_cash_transactions: plan.imported_cash_transactions,
            imported_at,
        }})),
    ))
}

fn archive_imported_row(
    transaction: &rusqlite::Transaction<'_>,
    source_table: &str,
    source_record_id: &str,
    source_key_sha256: &str,
    source_payload_sha256: &str,
    batch_id: &str,
    legacy_payload: &str,
    imported_at: &str,
    crypto: &crate::crm::CrmCrypto,
) -> ApiResult<()> {
    let encrypted_payload = crate::crm::encrypt_finance_field(legacy_payload, crypto)?;
    transaction
        .execute(
            "INSERT INTO finance_legacy_import_rows
             (source_key_sha256,source_payload_sha256,source_table,source_record_id,
              target_record_id,batch_id,legacy_payload_enc,created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                source_key_sha256,
                source_payload_sha256,
                source_table,
                source_record_id,
                source_record_id,
                batch_id,
                encrypted_payload,
                imported_at,
            ],
        )
        .map_err(|_| {
            ApiError::conflict("Nguồn finance đã được nhập đồng thời; toàn bộ transaction đã hủy.")
        })?;
    Ok(())
}

fn parse_request<T: DeserializeOwned>(body: &[u8]) -> ApiResult<T> {
    if body.len() > MAX_BODY_BYTES {
        return Err(ApiError::bad_request(
            "Gói finance legacy vượt quá giới hạn 16 MiB.",
        ));
    }
    serde_json::from_slice(body)
        .map_err(|_| ApiError::bad_request("JSON finance legacy không hợp lệ hoặc sai cấu trúc."))
}

fn validate_bundle(bundle: &FinanceBundle) -> ApiResult<usize> {
    if bundle.format != FORMAT || bundle.schema_version != 1 {
        return Err(ApiError::unprocessable(
            "Định dạng hoặc phiên bản gói finance legacy không được hỗ trợ.",
        ));
    }
    let batch_id = Uuid::parse_str(&bundle.batch_id)
        .map_err(|_| ApiError::unprocessable("Mã lô finance phải là UUID hợp lệ."))?;
    if batch_id.to_string() != bundle.batch_id {
        return Err(ApiError::unprocessable(
            "Mã lô finance phải là UUID chữ thường dạng chuẩn.",
        ));
    }
    if !valid_source_id(&bundle.source_database_id) {
        return Err(ApiError::unprocessable(
            "sourceDatabaseId chỉ được dùng chữ ASCII, số, dấu chấm, gạch ngang hoặc gạch dưới.",
        ));
    }
    chrono::DateTime::parse_from_rfc3339(&bundle.exported_at)
        .map_err(|_| ApiError::unprocessable("Thời điểm xuất phải là RFC 3339."))?;
    let total = bundle
        .accounts
        .len()
        .checked_add(bundle.cash_transactions.len())
        .filter(|total| *total > 0 && *total <= MAX_RECORDS)
        .ok_or_else(|| {
            ApiError::unprocessable(format!(
                "Gói phải có từ 1 đến {MAX_RECORDS} tài khoản/phiếu finance."
            ))
        })?;

    let mut account_keys = HashSet::new();
    for record in &bundle.accounts {
        validate_record_size(record)?;
        validate_stable_key(&record.key, "tài khoản")?;
        if !account_keys.insert(record.key.as_str()) {
            return Err(ApiError::unprocessable(
                "Gói finance có tài khoản ngân hàng trùng ID.",
            ));
        }
        required_legacy_text(&record.bank_name, "Tên ngân hàng", 200)?;
        if record.account_number.len() > 16 * 1024 {
            return Err(ApiError::unprocessable(
                "Số tài khoản trong gói finance vượt quá kích thước cho phép.",
            ));
        }
        required_legacy_text(&record.account_holder, "Chủ tài khoản", 200)?;
        optional_legacy_text(&record.branch, "Chi nhánh", 200)?;
        if !(0..=1_000_000_000_000).contains(&record.balance) {
            return Err(ApiError::unprocessable(
                "Số dư đầu kỳ legacy nằm ngoài miền số được hỗ trợ.",
            ));
        }
        required_legacy_text(&record.status, "Trạng thái tài khoản", 80)?;
        validate_stable_key(&record.created_by, "người tạo tài khoản")?;
        validate_timestamp(&record.created_at)?;
        validate_timestamp(&record.updated_at)?;
    }

    let mut cash_keys = HashSet::new();
    let mut cash_codes = HashSet::new();
    for record in &bundle.cash_transactions {
        validate_record_size(record)?;
        validate_stable_key(&record.key, "phiếu thu chi")?;
        if !cash_keys.insert(record.key.as_str()) {
            return Err(ApiError::unprocessable("Gói finance có phiếu trùng ID."));
        }
        let code = required_legacy_text(&record.code, "Mã phiếu", 128)?;
        if !cash_codes.insert(code.to_lowercase()) {
            return Err(ApiError::unprocessable("Gói finance có mã phiếu trùng."));
        }
        if !matches!(record.transaction_type.as_str(), "Thu" | "Chi")
            || !matches!(record.source.as_str(), "bank" | "petty")
            || !matches!(
                record.status.as_str(),
                "Đã hoàn thành" | "Chờ duyệt" | "Đã hủy"
            )
        {
            return Err(ApiError::unprocessable(
                "Phiếu finance có loại, nguồn hoặc trạng thái không được hỗ trợ.",
            ));
        }
        required_legacy_text(&record.category, "Nội dung thu chi", 500)?;
        if !(1..=1_000_000_000_000).contains(&record.amount) {
            return Err(ApiError::unprocessable(
                "Số tiền phiếu legacy không hợp lệ.",
            ));
        }
        let parsed_date = NaiveDate::parse_from_str(&record.date, "%Y-%m-%d")
            .map_err(|_| ApiError::unprocessable("Ngày phiếu legacy không hợp lệ."))?;
        if parsed_date.format("%Y-%m-%d").to_string() != record.date {
            return Err(ApiError::unprocessable(
                "Ngày phiếu legacy phải có định dạng ISO YYYY-MM-DD.",
            ));
        }
        required_legacy_text(&record.recipient_or_payer, "Đối tác hoặc người nhận", 200)?;
        required_legacy_text(&record.account, "Tài khoản hoặc quỹ", 200)?;
        optional_legacy_text(&record.note, "Ghi chú", 2_000)?;
        if let Some(department) = &record.department {
            optional_legacy_text(department, "Phòng ban", 160)?;
        }
        if let Some(employee_code) = &record.employee_code {
            optional_legacy_text(employee_code, "Mã nhân viên", 64)?;
        }
        validate_stable_key(&record.created_by, "người tạo phiếu")?;
        validate_timestamp(&record.created_at)?;
        validate_timestamp(&record.updated_at)?;
    }
    Ok(total)
}

fn validate_record_size<T: Serialize>(record: &T) -> ApiResult<()> {
    let size = serde_json::to_vec(record)
        .map_err(ApiError::internal)?
        .len();
    if size > 64 * 1024 {
        return Err(ApiError::unprocessable(
            "Một bản ghi finance legacy vượt quá giới hạn 64 KiB.",
        ));
    }
    Ok(())
}

fn validate_stable_key(value: &str, label: &str) -> ApiResult<()> {
    if value.is_empty()
        || value.trim() != value
        || value.len() > 256
        || value.chars().any(char::is_control)
    {
        return Err(ApiError::unprocessable(format!(
            "ID {label} legacy không hợp lệ."
        )));
    }
    Ok(())
}

fn required_legacy_text<'a>(value: &'a str, label: &str, maximum: usize) -> ApiResult<&'a str> {
    if value.trim().is_empty() || value.chars().count() > maximum {
        return Err(ApiError::unprocessable(format!(
            "{label} legacy rỗng hoặc vượt quá giới hạn."
        )));
    }
    Ok(value)
}

fn optional_legacy_text<'a>(value: &'a str, label: &str, maximum: usize) -> ApiResult<&'a str> {
    if value.chars().count() > maximum {
        return Err(ApiError::unprocessable(format!(
            "{label} legacy vượt quá giới hạn."
        )));
    }
    Ok(value)
}

fn validate_timestamp(value: &str) -> ApiResult<()> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|_| ())
        .map_err(|_| ApiError::unprocessable("Ngày tạo/cập nhật trong gói finance không hợp lệ."))
}

fn valid_source_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn confirmation_phrase(batch_id: &str, record_count: usize) -> String {
    format!(
        "IMPORT-FINANCE-{}-{record_count}",
        &batch_id[..8].to_ascii_uppercase()
    )
}

fn require_crypto(state: &AppState) -> ApiResult<&crate::crm::CrmCrypto> {
    state.crm_crypto.as_ref().ok_or_else(|| {
        ApiError::service_unavailable(
            "Chưa cấu hình khóa finance; không thể xem trước hoặc nhập dữ liệu nhạy cảm.",
        )
    })
}

fn digest_bytes(value: &[u8]) -> String {
    format!("{:x}", Sha256::digest(value))
}

fn build_plan(
    db: &Connection,
    bundle: &FinanceBundle,
    crypto: &crate::crm::CrmCrypto,
) -> ApiResult<ImportPlan> {
    let mut prior_sources = HashMap::<String, String>::new();
    let mut source_fingerprints = Vec::new();
    {
        let mut statement = db
            .prepare(
                "SELECT source_key_sha256,source_payload_sha256 FROM finance_legacy_import_rows
                 ORDER BY source_key_sha256",
            )
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(ApiError::internal)?;
        for row in rows {
            let (key_hash, payload_hash) = row.map_err(ApiError::internal)?;
            source_fingerprints.push((key_hash.clone(), payload_hash.clone()));
            prior_sources.insert(key_hash, payload_hash);
        }
    }

    let mut target_account_ids = HashSet::new();
    let mut target_account_numbers = HashSet::new();
    let mut target_account_fingerprints = Vec::new();
    {
        let mut statement = db
            .prepare(
                "SELECT id,bank_name,account_number,account_holder,branch,opening_balance,status,
                        created_by,created_at,updated_at
                 FROM finance_bank_accounts ORDER BY id",
            )
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                ))
            })
            .map_err(ApiError::internal)?;
        for row in rows {
            let row = row.map_err(ApiError::internal)?;
            target_account_ids.insert(row.0.clone());
            target_account_numbers.insert(crate::crm::decrypt_finance_field(&row.2, Some(crypto))?);
            target_account_fingerprints.push(row);
        }
    }

    let mut target_cash_ids = HashSet::new();
    let mut target_cash_codes = HashSet::new();
    let mut target_cash_fingerprints = Vec::new();
    {
        let mut statement = db
            .prepare(
                "SELECT id,code,transaction_type,source,category,amount,transaction_date,
                        counterparty,account_name,status,note,department,employee_code,created_by,
                        created_at,updated_at
                 FROM finance_cash_transactions ORDER BY id",
            )
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<String>>(12)?,
                    row.get::<_, String>(13)?,
                    row.get::<_, String>(14)?,
                    row.get::<_, String>(15)?,
                ))
            })
            .map_err(ApiError::internal)?;
        for row in rows {
            let row = row.map_err(ApiError::internal)?;
            target_cash_ids.insert(row.0.clone());
            target_cash_codes.insert(row.1.to_lowercase());
            target_cash_fingerprints.push(row);
        }
    }

    let mut batch_account_ids = HashSet::<String>::new();
    let mut batch_account_numbers = HashSet::<String>::new();
    let mut accounts = Vec::with_capacity(bundle.accounts.len());
    let mut account_outcomes = Vec::new();
    for record in &bundle.accounts {
        let raw_json = serde_json::to_vec(record).map_err(ApiError::internal)?;
        let source_payload_sha256 = digest_bytes(&raw_json);
        let source_key_sha256 = digest_bytes(
            format!(
                "{}\0finance_bank_accounts\0{}",
                bundle.source_database_id, record.key
            )
            .as_bytes(),
        );
        let plaintext_account_number =
            crate::crm::decrypt_finance_field(&record.account_number, Some(crypto))?;
        if plaintext_account_number.trim().is_empty()
            || plaintext_account_number.chars().count() > 64
        {
            return Err(ApiError::unprocessable(
                "Số tài khoản legacy rỗng hoặc vượt quá giới hạn.",
            ));
        }
        let prior = prior_sources.get(&source_key_sha256);
        let outcome = if let Some(prior_payload) = prior {
            if prior_payload == &source_payload_sha256 {
                Outcome::AlreadyImported
            } else {
                Outcome::Conflict
            }
        } else if target_account_ids.contains(&record.key)
            || target_account_numbers.contains(&plaintext_account_number)
            || !batch_account_ids.insert(record.key.clone())
            || !batch_account_numbers.insert(plaintext_account_number.clone())
        {
            Outcome::Conflict
        } else {
            target_account_ids.insert(record.key.clone());
            target_account_numbers.insert(plaintext_account_number.clone());
            Outcome::Import
        };
        account_outcomes.push((
            source_key_sha256.clone(),
            source_payload_sha256.clone(),
            outcome,
        ));
        accounts.push(PlannedAccount {
            record: LegacyBankAccount {
                key: record.key.clone(),
                bank_name: record.bank_name.clone(),
                account_number: record.account_number.clone(),
                account_holder: record.account_holder.clone(),
                branch: record.branch.clone(),
                balance: record.balance,
                status: record.status.clone(),
                created_by: record.created_by.clone(),
                created_at: record.created_at.clone(),
                updated_at: record.updated_at.clone(),
            },
            plaintext_account_number,
            source_key_sha256,
            source_payload_sha256,
            outcome,
        });
    }

    let mut batch_cash_ids = HashSet::<String>::new();
    let mut batch_cash_codes = HashSet::<String>::new();
    let mut cash_transactions = Vec::with_capacity(bundle.cash_transactions.len());
    let mut cash_outcomes = Vec::new();
    for record in &bundle.cash_transactions {
        let raw_json = serde_json::to_vec(record).map_err(ApiError::internal)?;
        let source_payload_sha256 = digest_bytes(&raw_json);
        let source_key_sha256 = digest_bytes(
            format!(
                "{}\0finance_cash_transactions\0{}",
                bundle.source_database_id, record.key
            )
            .as_bytes(),
        );
        let prior = prior_sources.get(&source_key_sha256);
        let outcome = if let Some(prior_payload) = prior {
            if prior_payload == &source_payload_sha256 {
                Outcome::AlreadyImported
            } else {
                Outcome::Conflict
            }
        } else if target_cash_ids.contains(&record.key)
            || target_cash_codes.contains(&record.code.to_lowercase())
            || !batch_cash_ids.insert(record.key.clone())
            || !batch_cash_codes.insert(record.code.to_lowercase())
        {
            Outcome::Conflict
        } else {
            target_cash_ids.insert(record.key.clone());
            target_cash_codes.insert(record.code.to_lowercase());
            Outcome::Import
        };
        cash_outcomes.push((
            source_key_sha256.clone(),
            source_payload_sha256.clone(),
            outcome,
        ));
        cash_transactions.push(PlannedCashTransaction {
            record: LegacyCashTransaction {
                key: record.key.clone(),
                code: record.code.clone(),
                transaction_type: record.transaction_type.clone(),
                source: record.source.clone(),
                category: record.category.clone(),
                amount: record.amount,
                date: record.date.clone(),
                recipient_or_payer: record.recipient_or_payer.clone(),
                account: record.account.clone(),
                status: record.status.clone(),
                note: record.note.clone(),
                department: record.department.clone(),
                employee_code: record.employee_code.clone(),
                created_by: record.created_by.clone(),
                created_at: record.created_at.clone(),
                updated_at: record.updated_at.clone(),
            },
            source_key_sha256,
            source_payload_sha256,
            outcome,
        });
    }

    let count = |outcome| {
        accounts
            .iter()
            .filter(|record| record.outcome == outcome)
            .count()
    };
    let account_importable = count(Outcome::Import);
    let account_already = count(Outcome::AlreadyImported);
    let account_conflicted = count(Outcome::Conflict);
    let cash_importable = cash_transactions
        .iter()
        .filter(|record| record.outcome == Outcome::Import)
        .count();
    let cash_already = cash_transactions
        .iter()
        .filter(|record| record.outcome == Outcome::AlreadyImported)
        .count();
    let cash_conflicted = cash_transactions
        .iter()
        .filter(|record| record.outcome == Outcome::Conflict)
        .count();

    let fingerprint = json!({
        "bundle": bundle,
        "targetAccounts": target_account_fingerprints,
        "targetCashTransactions": target_cash_fingerprints,
        "priorSources": source_fingerprints,
        "accountOutcomes": account_outcomes,
        "cashOutcomes": cash_outcomes,
    });
    let payload_sha256 =
        digest_bytes(&serde_json::to_vec(&fingerprint).map_err(ApiError::internal)?);
    Ok(ImportPlan {
        accounts,
        cash_transactions,
        payload_sha256,
        imported_records: account_importable + cash_importable,
        already_imported_records: account_already + cash_already,
        conflicted_records: account_conflicted + cash_conflicted,
        imported_accounts: account_importable,
        already_imported_accounts: account_already,
        conflicted_accounts: account_conflicted,
        imported_cash_transactions: cash_importable,
        already_imported_cash_transactions: cash_already,
        conflicted_cash_transactions: cash_conflicted,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, header::AUTHORIZATION},
    };
    use jsonwebtoken::{DecodingKey, EncodingKey};
    use std::{path::PathBuf, sync::Arc};
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    use crate::{ADMIN_ROLE, AppState, User};

    fn setup(with_crypto: bool) -> (AppState, User, User) {
        let db = Connection::open_in_memory().unwrap();
        crate::init_database(&db).unwrap();
        let now = Utc::now().to_rfc3339();
        let admin = test_user("finance-import-admin", ADMIN_ROLE, &now);
        let employee = test_user("finance-import-user", "USER", &now);
        for user in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at)
                 VALUES (?1,?2,?2,?3,'unused',1,?4,?4)",
                params![user.id, user.email, user.role, now],
            )
            .unwrap();
        }
        let secret = b"finance-import-route-test-secret-long-enough";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: EncodingKey::from_secret(secret),
            jwt_decoding: DecodingKey::from_secret(secret),
            storage_dir: Arc::new(PathBuf::from("test-storage")),
            crm_crypto: with_crypto.then(|| crate::crm::CrmCrypto::for_test([0x42; 32], "v1")),
        };
        (state, admin, employee)
    }

    fn test_user(id: &str, role: &str, now: &str) -> User {
        User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: format!("{id} User"),
            role: role.to_owned(),
            is_active: true,
            created_at: now.to_owned(),
            updated_at: now.to_owned(),
        }
    }

    fn bearer(state: &AppState, user: &User) -> String {
        format!("Bearer {}", crate::issue_token(state, user).unwrap())
    }

    fn sample_bundle(crypto: &crate::crm::CrmCrypto) -> FinanceBundle {
        let now = Utc::now().to_rfc3339();
        FinanceBundle {
            format: FORMAT.to_owned(),
            schema_version: 1,
            batch_id: Uuid::new_v4().to_string(),
            source_database_id: "approved-copy-2026-10".to_owned(),
            exported_at: now.clone(),
            accounts: vec![LegacyBankAccount {
                key: "legacy-bank-1".to_owned(),
                bank_name: "Ngân hàng A".to_owned(),
                account_number: crate::crm::encrypt_finance_field("0012345678", crypto).unwrap(),
                account_holder: "NGUYEN VAN A".to_owned(),
                branch: "Hà Nội".to_owned(),
                balance: 100_000_000,
                status: "Đang hoạt động".to_owned(),
                created_by: "source-admin-id".to_owned(),
                created_at: now.clone(),
                updated_at: now.clone(),
            }],
            cash_transactions: vec![LegacyCashTransaction {
                key: "legacy-cash-1".to_owned(),
                code: "PT-LEGACY-001".to_owned(),
                transaction_type: "Thu".to_owned(),
                source: "bank".to_owned(),
                category: "Thu tiền hợp đồng".to_owned(),
                amount: 1_250_000,
                date: Utc::now().format("%Y-%m-%d").to_string(),
                recipient_or_payer: "Khách hàng A".to_owned(),
                account: "Ngân hàng A".to_owned(),
                status: "Đã hoàn thành".to_owned(),
                note: "Phiếu legacy".to_owned(),
                department: Some("Tài chính".to_owned()),
                employee_code: Some("EMP-01".to_owned()),
                created_by: "source-admin-id".to_owned(),
                created_at: now.clone(),
                updated_at: now,
            }],
        }
    }

    fn request(path: &str, state: &AppState, user: &User, body: Value) -> Request<Body> {
        Request::post(path)
            .header(AUTHORIZATION, bearer(state, user))
            .header("content-type", "application/json")
            .body(Body::from(body.to_string()))
            .unwrap()
    }

    async fn response_json(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &axum::body::to_bytes(response.into_body(), MAX_BODY_BYTES)
                .await
                .unwrap(),
        )
        .unwrap()
    }

    async fn preview(
        app: &axum::Router,
        state: &AppState,
        admin: &User,
        bundle: &FinanceBundle,
    ) -> (Value, ImportPreview) {
        let response = app
            .clone()
            .oneshot(request(
                "/api/v1/legacy-import/finance/preview",
                state,
                admin,
                json!({"bundle": bundle}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let value = response_json(response).await;
        let preview: ImportPreview = serde_json::from_value(value["preview"].clone()).unwrap();
        (value, preview)
    }

    #[tokio::test]
    async fn finance_import_preview_is_admin_only_summary_only_and_non_mutating() {
        let (state, admin, employee) = setup(true);
        let crypto = state.crm_crypto.as_ref().unwrap().clone();
        let bundle = sample_bundle(&crypto);
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let forbidden = app
            .clone()
            .oneshot(request(
                "/api/v1/legacy-import/finance/preview",
                &state,
                &employee,
                json!({"bundle": bundle}),
            ))
            .await
            .unwrap();
        assert_eq!(forbidden.status(), StatusCode::FORBIDDEN);
        let forbidden_apply = app
            .clone()
            .oneshot(request(
                "/api/v1/legacy-import/finance/apply",
                &state,
                &employee,
                json!({
                    "bundle": bundle,
                    "expectedPayloadSha256": "not-used",
                    "confirmation": "not-used"
                }),
            ))
            .await
            .unwrap();
        assert_eq!(forbidden_apply.status(), StatusCode::FORBIDDEN);

        let (body, preview) = preview(&app, &state, &admin, &bundle).await;
        assert_eq!(preview.source_records, 2);
        assert_eq!(preview.importable_accounts, 1);
        assert_eq!(preview.importable_cash_transactions, 1);
        assert!(preview.can_apply);
        let serialized = body.to_string();
        assert!(!serialized.contains("0012345678"));
        assert!(!serialized.contains("Khách hàng A"));
        let db = state.db.lock().await;
        let account_count: i64 = db
            .query_row("SELECT COUNT(*) FROM finance_bank_accounts", [], |row| {
                row.get(0)
            })
            .unwrap();
        let cash_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM finance_cash_transactions",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let run_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM finance_legacy_import_runs",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!((account_count, cash_count, run_count), (0, 0, 0));
    }

    #[tokio::test]
    async fn finance_import_apply_preserves_rows_encrypts_accounts_and_replays_idempotently() {
        let (state, admin, _) = setup(true);
        let crypto = state.crm_crypto.as_ref().unwrap().clone();
        let bundle = sample_bundle(&crypto);
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let (_, preview_result) = preview(&app, &state, &admin, &bundle).await;
        let apply_body = json!({
            "bundle": bundle,
            "expectedPayloadSha256": preview_result.payload_sha256,
            "confirmation": preview_result.confirmation_phrase
        });
        let applied = app
            .clone()
            .oneshot(request(
                "/api/v1/legacy-import/finance/apply",
                &state,
                &admin,
                apply_body.clone(),
            ))
            .await
            .unwrap();
        assert_eq!(applied.status(), StatusCode::CREATED);
        let result = response_json(applied).await;
        assert_eq!(result["import"]["importedRecords"], 2);
        assert_eq!(result["import"]["importedAccounts"], 1);
        assert_eq!(result["import"]["importedCashTransactions"], 1);

        let db = state.db.lock().await;
        let account: (String, String, String, String, i64) = db
            .query_row(
                "SELECT id,account_number,created_by,created_at,opening_balance
                 FROM finance_bank_accounts WHERE id='legacy-bank-1'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .unwrap();
        assert!(account.1.starts_with("ENC:{"));
        assert!(!account.1.contains("0012345678"));
        assert_eq!(account.2, admin.id);
        assert_eq!(account.3, bundle.exported_at); // Legacy creation timestamps are preserved.
        assert_eq!(account.4, 100_000_000);
        assert_eq!(
            crate::crm::decrypt_finance_field(&account.1, state.crm_crypto.as_ref()).unwrap(),
            "0012345678"
        );
        let cash: (String, String, String, String, i64, String) = db
            .query_row(
                "SELECT id,code,created_by,transaction_date,amount,created_at
                 FROM finance_cash_transactions WHERE id='legacy-cash-1'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(cash.0, "legacy-cash-1");
        assert_eq!(cash.1, "PT-LEGACY-001");
        assert_eq!(cash.2, admin.id);
        assert_eq!(cash.4, 1_250_000);
        assert_eq!(cash.5, bundle.cash_transactions[0].created_at);
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM finance_legacy_import_rows",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            2
        );
        drop(db);

        let second_bundle = bundle.clone();
        let (_, second_preview) = preview(&app, &state, &admin, &second_bundle).await;
        assert_eq!(second_preview.already_imported_records, 2);
        assert!(!second_preview.can_apply);
    }

    #[tokio::test]
    async fn finance_import_rejects_stale_target_fingerprint_without_writing_bundle_rows() {
        let (state, admin, _) = setup(true);
        let crypto = state.crm_crypto.as_ref().unwrap().clone();
        let bundle = sample_bundle(&crypto);
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let (_, preview_result) = preview(&app, &state, &admin, &bundle).await;
        {
            let db = state.db.lock().await;
            let encrypted_number =
                crate::crm::encrypt_finance_field("unrelated-account-123", &crypto).unwrap();
            let now = Utc::now().to_rfc3339();
            db.execute(
                "INSERT INTO finance_bank_accounts
                 (id,bank_name,account_number,account_holder,branch,opening_balance,status,
                  created_by,created_at,updated_at)
                 VALUES ('concurrent-account','Bank',?1,'Holder','',0,'Đang hoạt động',?2,?3,?3)",
                params![encrypted_number, admin.id, now],
            )
            .unwrap();
        }
        let response = app
            .oneshot(request(
                "/api/v1/legacy-import/finance/apply",
                &state,
                &admin,
                json!({
                    "bundle": bundle,
                    "expectedPayloadSha256": preview_result.payload_sha256,
                    "confirmation": preview_result.confirmation_phrase
                }),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::CONFLICT);
        let db = state.db.lock().await;
        let account_count: i64 = db
            .query_row("SELECT COUNT(*) FROM finance_bank_accounts", [], |row| {
                row.get(0)
            })
            .unwrap();
        let cash_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM finance_cash_transactions",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let audit_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM finance_legacy_import_runs",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!((account_count, cash_count, audit_count), (1, 0, 0));
    }

    #[tokio::test]
    async fn finance_import_any_insert_failure_rolls_back_all_rows() {
        let (state, admin, _) = setup(true);
        let crypto = state.crm_crypto.as_ref().unwrap().clone();
        let bundle = sample_bundle(&crypto);
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let (_, preview_result) = preview(&app, &state, &admin, &bundle).await;
        {
            let db = state.db.lock().await;
            db.execute_batch(
                "CREATE TRIGGER fail_import_cash
                 BEFORE INSERT ON finance_cash_transactions
                 WHEN NEW.id='legacy-cash-1'
                 BEGIN SELECT RAISE(ABORT, 'forced finance import failure'); END;",
            )
            .unwrap();
        }
        let failed = app
            .clone()
            .oneshot(request(
                "/api/v1/legacy-import/finance/apply",
                &state,
                &admin,
                json!({
                    "bundle": bundle,
                    "expectedPayloadSha256": preview_result.payload_sha256,
                    "confirmation": preview_result.confirmation_phrase
                }),
            ))
            .await
            .unwrap();
        assert_eq!(failed.status(), StatusCode::CONFLICT);
        let db = state.db.lock().await;
        for table in [
            "finance_bank_accounts",
            "finance_cash_transactions",
            "finance_legacy_import_runs",
            "finance_legacy_import_rows",
        ] {
            let count: i64 = db
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                    row.get(0)
                })
                .unwrap();
            assert_eq!(count, 0, "atomic rollback of {table}");
        }
    }

    #[test]
    fn finance_import_validation_rejects_bad_ids_dates_and_unsupported_status() {
        let crypto = crate::crm::CrmCrypto::for_test([0x42; 32], "v1");
        let mut bundle = sample_bundle(&crypto);
        bundle.cash_transactions[0].date = "2026-02-30".to_owned();
        assert_eq!(
            validate_bundle(&bundle).unwrap_err().0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
        bundle.cash_transactions[0].date = Utc::now().format("%Y-%m-%d").to_string();
        bundle.source_database_id = "..invalid-prefix".to_owned();
        assert_eq!(
            validate_bundle(&bundle).unwrap_err().0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
        bundle.source_database_id = "valid-source".to_owned();
        bundle.cash_transactions[0].date = "2026-1-2".to_owned();
        assert_eq!(
            validate_bundle(&bundle).unwrap_err().0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
        bundle.cash_transactions[0].date = Utc::now().format("%Y-%m-%d").to_string();
        bundle.cash_transactions[0].status = "Đang xử lý".to_owned();
        assert_eq!(
            validate_bundle(&bundle).unwrap_err().0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }

    #[tokio::test]
    async fn finance_import_fails_closed_without_encryption_key() {
        let (state, admin, _) = setup(false);
        let bundle = sample_bundle(&crate::crm::CrmCrypto::for_test([0x42; 32], "v1"));
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let response = app
            .oneshot(request(
                "/api/v1/legacy-import/finance/preview",
                &state,
                &admin,
                json!({"bundle": bundle}),
            ))
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    }
}
