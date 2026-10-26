use axum::{
    Json,
    body::Bytes,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, crm, require_admin};

const FORMAT: &str = "kiyovn-legacy-employee-bank-accounts";
const SCHEMA_VERSION: u32 = 1;
const MAX_RECORDS: usize = 5_000;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const MAX_QUARANTINE_PAGE_SIZE: usize = 200;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BankBundle {
    format: String,
    schema_version: u32,
    batch_id: String,
    source_origin: String,
    exported_at: String,
    accounts: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviewRequest {
    bundle: BankBundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRequest {
    bundle: BankBundle,
    expected_payload_sha256: String,
    confirmation: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportPreview {
    batch_id: String,
    payload_sha256: String,
    confirmation_phrase: String,
    source_records: usize,
    importable_accounts: usize,
    quarantined_records: usize,
    already_imported_records: usize,
    generic_collection_records: usize,
    local_storage_records: usize,
    employee_profile_records: usize,
    can_apply: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    batch_id: String,
    imported_accounts: usize,
    quarantined_records: usize,
    already_imported_records: usize,
    imported_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct QuarantineListQuery {
    #[serde(default = "default_quarantine_page")]
    page: usize,
    #[serde(default = "default_quarantine_page_size")]
    page_size: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct QuarantineItem {
    source_key_sha256: String,
    source_kind: String,
    batch_id: String,
    issue_code: String,
    employee_code: String,
    bank_name: String,
    account_number_masked: String,
    created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct AdoptQuarantineRequest {
    employee_code: String,
    confirmation: String,
    #[serde(default)]
    bank_name: Option<String>,
    #[serde(default)]
    account_number: Option<String>,
    #[serde(default)]
    account_holder: Option<String>,
    #[serde(default)]
    branch: Option<String>,
    #[serde(default)]
    note: Option<String>,
    review_reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DismissQuarantineRequest {
    confirmation: String,
    review_reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct QuarantineReviewResult {
    source_key_sha256: String,
    action: String,
    account_id: Option<String>,
    resolved_at: String,
}

fn default_quarantine_page() -> usize {
    1
}

fn default_quarantine_page_size() -> usize {
    50
}

#[derive(Debug)]
struct SourceRecord {
    source_kind: &'static str,
    stable_key: String,
    raw_record: Value,
    employee_code: String,
    bank_name: String,
    account_number: String,
    account_holder: String,
    branch: String,
    note: String,
    initial_issue: Option<&'static str>,
}

#[derive(Debug)]
struct PlannedRecord {
    source_kind: &'static str,
    source_ref: String,
    source_key_sha256: String,
    raw_record: Value,
    outcome: PlannedOutcome,
}

#[derive(Debug)]
enum PlannedOutcome {
    Import {
        employee_id: String,
        employee_code: String,
        bank_name: String,
        account_number: String,
        account_holder: String,
        branch: String,
        note: String,
    },
    Quarantine(&'static str),
    AlreadyImported,
}

#[derive(Debug)]
struct ImportPlan {
    records: Vec<PlannedRecord>,
    payload_sha256: String,
    importable_accounts: usize,
    quarantined_records: usize,
    already_imported_records: usize,
    generic_collection_records: usize,
    local_storage_records: usize,
    employee_profile_records: usize,
}

pub(super) async fn preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let request: PreviewRequest = parse_body(&body)?;
    validate_bundle(&request.bundle)?;
    let crypto = require_crypto(&state)?;
    let db = state.db.lock().await;
    let plan = build_plan(&db, &request.bundle, crypto)?;
    let source_records = plan.records.len();
    let confirmation_phrase = confirmation_phrase(&request.bundle.batch_id, source_records);
    let can_apply = source_records > plan.already_imported_records
        && (plan.importable_accounts > 0 || plan.quarantined_records > 0);
    Ok(Json(json!({ "preview": ImportPreview {
        batch_id: request.bundle.batch_id,
        payload_sha256: plan.payload_sha256,
        confirmation_phrase,
        source_records,
        importable_accounts: plan.importable_accounts,
        quarantined_records: plan.quarantined_records,
        already_imported_records: plan.already_imported_records,
        generic_collection_records: plan.generic_collection_records,
        local_storage_records: plan.local_storage_records,
        employee_profile_records: plan.employee_profile_records,
        can_apply,
    }})))
}

pub(super) async fn apply(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let request: ApplyRequest = parse_body(&body)?;
    validate_bundle(&request.bundle)?;
    let crypto = require_crypto(&state)?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    transaction
        .execute_batch("PRAGMA defer_foreign_keys=ON;")
        .map_err(ApiError::internal)?;
    let plan = build_plan(&transaction, &request.bundle, crypto)?;
    if request.expected_payload_sha256 != plan.payload_sha256 {
        return Err(ApiError::conflict(
            "Nguồn legacy hoặc danh bạ đã đổi sau khi xem trước. Hãy xem trước lại trước khi áp dụng.",
        ));
    }
    let total_records = plan.records.len();
    let expected_confirmation = confirmation_phrase(&request.bundle.batch_id, total_records);
    if request.confirmation.trim() != expected_confirmation {
        return Err(ApiError::unprocessable(format!(
            "Cụm xác nhận chưa chính xác. Hãy nhập: {expected_confirmation}"
        )));
    }
    let prior_run: Option<String> = transaction
        .query_row(
            "SELECT batch_id FROM employee_bank_import_runs WHERE batch_id=?1",
            params![request.bundle.batch_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    if prior_run.is_some() {
        return Err(ApiError::conflict(
            "Lô nhập ngân hàng này đã được áp dụng trước đó.",
        ));
    }

    let imported_at = chrono::Utc::now().to_rfc3339();
    let mut imported_accounts = 0usize;
    let mut quarantined_records = 0usize;
    let already_imported_records = plan.already_imported_records;
    for record in &plan.records {
        match &record.outcome {
            PlannedOutcome::AlreadyImported => {}
            PlannedOutcome::Quarantine(issue_code) => {
                let encrypted_payload =
                    crm::encrypt_hr_bank_field(&record.raw_record.to_string(), crypto)?;
                transaction
                    .execute(
                        "INSERT INTO employee_bank_import_rows
                         (source_key_sha256, source_kind, batch_id, outcome, issue_code,
                          account_id, legacy_payload_enc, created_at)
                         VALUES (?1,?2,?3,'quarantined',?4,NULL,?5,?6)",
                        params![
                            record.source_key_sha256,
                            record.source_kind,
                            request.bundle.batch_id,
                            issue_code,
                            encrypted_payload,
                            imported_at,
                        ],
                    )
                    .map_err(|_| {
                        ApiError::conflict("Không thể ghi hàng cách ly; giao dịch nhập đã bị hủy.")
                    })?;
                quarantined_records += 1;
            }
            PlannedOutcome::Import {
                employee_id,
                employee_code,
                bank_name,
                account_number,
                account_holder,
                branch,
                note,
            } => {
                let id = Uuid::new_v4().to_string();
                let final_note = if note.is_empty() {
                    format!(
                        "Nhập legacy {}; cần HR rà soát trước khi duyệt.",
                        request.bundle.batch_id
                    )
                } else {
                    format!(
                        "Nhập legacy {}; cần HR rà soát. {note}",
                        request.bundle.batch_id
                    )
                };
                let encrypted_bank = crm::encrypt_hr_bank_field(bank_name, crypto)?;
                let encrypted_number = crm::encrypt_hr_bank_field(account_number, crypto)?;
                let encrypted_holder = crm::encrypt_hr_bank_field(account_holder, crypto)?;
                let encrypted_branch = crm::encrypt_hr_bank_field(branch, crypto)?;
                let encrypted_note = crm::encrypt_hr_bank_field(&final_note, crypto)?;
                let encrypted_payload =
                    crm::encrypt_hr_bank_field(&record.raw_record.to_string(), crypto)?;
                let last_four = account_number
                    .chars()
                    .filter(|character| character.is_ascii_alphanumeric())
                    .rev()
                    .take(4)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<String>();
                transaction
                    .execute(
                        "INSERT INTO employee_bank_accounts
                         (id, employee_user_id, employee_code, bank_name_enc, account_number_enc,
                          account_number_last4, account_holder_enc, branch_enc, note_enc, status,
                          is_primary, rejection_reason_enc, created_at, updated_at)
                         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'Chờ duyệt',0,'',?10,?10)",
                        params![
                            id,
                            employee_id,
                            employee_code,
                            encrypted_bank,
                            encrypted_number,
                            last_four,
                            encrypted_holder,
                            encrypted_branch,
                            encrypted_note,
                            imported_at,
                        ],
                    )
                    .map_err(|_| {
                        ApiError::conflict(
                            "Không thể ghi tài khoản đã đối soát; giao dịch nhập đã bị hủy.",
                        )
                    })?;
                let imported_detail =
                    crm::encrypt_hr_bank_field("legacy_status_and_approval_not_trusted", crypto)?;
                transaction
                    .execute(
                        "INSERT INTO employee_bank_account_events
                        (account_id, sequence_no, event_type, actor_user_id, detail_enc, created_at)
                         VALUES (?1,1,'created',?2,?3,?4)",
                        params![id, actor.id, imported_detail, imported_at],
                    )
                    .map_err(ApiError::internal)?;
                transaction
                    .execute(
                        "INSERT INTO employee_bank_import_rows
                         (source_key_sha256, source_kind, batch_id, outcome, issue_code,
                          account_id, legacy_payload_enc, created_at)
                         VALUES (?1,?2,?3,'imported_unverified','',?4,?5,?6)",
                        params![
                            record.source_key_sha256,
                            record.source_kind,
                            request.bundle.batch_id,
                            id,
                            encrypted_payload,
                            imported_at,
                        ],
                    )
                    .map_err(|_| {
                        ApiError::conflict("Không thể ghi dấu nguồn nhập; giao dịch đã bị hủy.")
                    })?;
                imported_accounts += 1;
            }
        }
        if record.source_kind == "employee_profile"
            && !matches!(&record.outcome, PlannedOutcome::AlreadyImported)
        {
            remove_legacy_profile_bank_fields(&transaction, &record.source_ref, &imported_at)?;
        }
    }
    transaction
        .execute(
            "INSERT INTO employee_bank_import_runs
             (batch_id, actor_user_id, source_origin, exported_at, imported_at,
              payload_sha256, imported_accounts, quarantined_records, already_imported_records)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                request.bundle.batch_id,
                actor.id,
                request.bundle.source_origin,
                request.bundle.exported_at,
                imported_at,
                plan.payload_sha256,
                imported_accounts,
                quarantined_records,
                already_imported_records,
            ],
        )
        .map_err(|_| ApiError::conflict("Không thể ghi audit lô nhập; giao dịch đã bị hủy."))?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "import": ImportResult {
        batch_id: request.bundle.batch_id,
        imported_accounts,
        quarantined_records,
        already_imported_records,
        imported_at,
    }})))
}

pub(super) async fn list_quarantine(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<QuarantineListQuery>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let crypto = require_crypto(&state)?;
    let page = query.page.max(1);
    let page_size = query.page_size.clamp(1, MAX_QUARANTINE_PAGE_SIZE);
    let offset = page.saturating_sub(1).saturating_mul(page_size);
    let db = state.db.lock().await;
    let total: usize = db
        .query_row(
            "SELECT COUNT(*) FROM employee_bank_import_rows r
             LEFT JOIN employee_bank_import_resolutions x
               ON x.source_key_sha256=r.source_key_sha256
             WHERE r.outcome='quarantined' AND x.source_key_sha256 IS NULL",
            [],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    let mut statement = db
        .prepare(
            "SELECT r.source_key_sha256,r.source_kind,r.batch_id,r.issue_code,
                    r.legacy_payload_enc,r.created_at
             FROM employee_bank_import_rows r
             LEFT JOIN employee_bank_import_resolutions x
               ON x.source_key_sha256=r.source_key_sha256
             WHERE r.outcome='quarantined' AND x.source_key_sha256 IS NULL
             ORDER BY r.created_at,r.source_key_sha256 LIMIT ?1 OFFSET ?2",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![page_size as i64, offset as i64], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(ApiError::internal)?;
    let mut items = Vec::new();
    for row in rows {
        let (source_key_sha256, source_kind, batch_id, issue_code, encrypted, created_at) =
            row.map_err(ApiError::internal)?;
        let payload = crm::decrypt_hr_bank_field(&encrypted, Some(crypto))?;
        let fields = archived_source_fields(&source_kind, &payload);
        items.push(QuarantineItem {
            source_key_sha256,
            source_kind,
            batch_id,
            issue_code,
            employee_code: bounded_display_field(&fields.employee_code, 64),
            bank_name: bounded_display_field(&fields.bank_name, 160),
            account_number_masked: mask_account_number(&fields.account_number),
            created_at,
        });
    }
    Ok(Json(json!({
        "data": items,
        "pagination": {
            "page": page,
            "pageSize": page_size,
            "total": total,
            "totalPages": total.div_ceil(page_size),
        }
    })))
}

pub(super) async fn adopt_quarantined(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(source_key_sha256): Path<String>,
    Json(input): Json<AdoptQuarantineRequest>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    validate_source_key(&source_key_sha256)?;
    if input.confirmation.trim() != quarantine_confirmation("ADOPT", &source_key_sha256) {
        return Err(ApiError::unprocessable(
            "Cụm xác nhận nhận bản ghi cách ly chưa chính xác.",
        ));
    }
    let crypto = require_crypto(&state)?;
    let employee_code = required_review_field(input.employee_code, "Mã nhân viên", 64)?;
    let review_reason = required_review_field(input.review_reason, "Lý do rà soát", 1_000)?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let (source_kind, payload) = load_pending_quarantine(&transaction, &source_key_sha256, crypto)?;
    let (employee_id, canonical_employee_code, employee_name) =
        resolve_active_employee(&transaction, &employee_code)?;
    let mut fields = archived_source_fields(&source_kind, &payload);
    merge_override(&mut fields.bank_name, input.bank_name);
    merge_override(&mut fields.account_number, input.account_number);
    merge_override(&mut fields.account_holder, input.account_holder);
    merge_override(&mut fields.branch, input.branch);
    merge_override(&mut fields.note, input.note);

    fields.bank_name = required_review_field(fields.bank_name, "Tên ngân hàng", 160)?;
    fields.account_number = validate_account_number(fields.account_number)?;
    fields.account_holder = if fields.account_holder.trim().is_empty() {
        employee_name
    } else {
        required_review_field(fields.account_holder, "Tên chủ tài khoản", 160)?
    };
    fields.branch = optional_review_field(fields.branch, "Chi nhánh", 160)?;
    fields.note = optional_review_field(fields.note, "Ghi chú", 1_000)?;
    if account_number_exists(&transaction, &employee_id, &fields.account_number, crypto)? {
        return Err(ApiError::conflict(
            "Tài khoản này đã tồn tại cho nhân viên được chọn; hàng cách ly vẫn chưa thay đổi.",
        ));
    }

    let account_id = Uuid::new_v4().to_string();
    let resolved_at = chrono::Utc::now().to_rfc3339();
    let note = if fields.note.is_empty() {
        format!("Đối soát từ quarantine {}.", &source_key_sha256[..12])
    } else {
        format!(
            "Đối soát từ quarantine {}. {}",
            &source_key_sha256[..12],
            fields.note
        )
    };
    let bank_name_enc = crm::encrypt_hr_bank_field(&fields.bank_name, crypto)?;
    let account_number_enc = crm::encrypt_hr_bank_field(&fields.account_number, crypto)?;
    let account_holder_enc = crm::encrypt_hr_bank_field(&fields.account_holder, crypto)?;
    let branch_enc = crm::encrypt_hr_bank_field(&fields.branch, crypto)?;
    let note_enc = crm::encrypt_hr_bank_field(&note, crypto)?;
    let last_four = fields
        .account_number
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<String>();
    transaction
        .execute(
            "INSERT INTO employee_bank_accounts
             (id,employee_user_id,employee_code,bank_name_enc,account_number_enc,
              account_number_last4,account_holder_enc,branch_enc,note_enc,status,
              is_primary,rejection_reason_enc,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,'Chờ duyệt',0,'',?10,?10)",
            params![
                account_id,
                employee_id,
                canonical_employee_code,
                bank_name_enc,
                account_number_enc,
                last_four,
                account_holder_enc,
                branch_enc,
                note_enc,
                resolved_at,
            ],
        )
        .map_err(|_| {
            ApiError::conflict("Không thể tạo tài khoản chờ duyệt; giao dịch đã bị hủy.")
        })?;
    let event_detail = crm::encrypt_hr_bank_field(
        &format!("legacy_quarantine_adopted:{source_key_sha256}"),
        crypto,
    )?;
    transaction
        .execute(
            "INSERT INTO employee_bank_account_events
             (account_id,sequence_no,event_type,actor_user_id,detail_enc,created_at)
             VALUES (?1,1,'created',?2,?3,?4)",
            params![account_id, actor.id, event_detail, resolved_at],
        )
        .map_err(ApiError::internal)?;
    let review_reason_enc = crm::encrypt_hr_bank_field(&review_reason, crypto)?;
    transaction
        .execute(
            "INSERT INTO employee_bank_import_resolutions
             (source_key_sha256,action,actor_user_id,account_id,review_reason_enc,resolved_at)
             VALUES (?1,'adopted',?2,?3,?4,?5)",
            params![
                source_key_sha256,
                actor.id,
                account_id,
                review_reason_enc,
                resolved_at
            ],
        )
        .map_err(|_| {
            ApiError::conflict(
                "Hàng cách ly đã được xử lý đồng thời; không có thay đổi nào được ghi.",
            )
        })?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"review": QuarantineReviewResult {
            source_key_sha256,
            action: "adopted".to_owned(),
            account_id: Some(account_id),
            resolved_at,
        }})),
    ))
}

pub(super) async fn dismiss_quarantined(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(source_key_sha256): Path<String>,
    Json(input): Json<DismissQuarantineRequest>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    validate_source_key(&source_key_sha256)?;
    if input.confirmation.trim() != quarantine_confirmation("DISMISS", &source_key_sha256) {
        return Err(ApiError::unprocessable(
            "Cụm xác nhận loại bản ghi cách ly chưa chính xác.",
        ));
    }
    let crypto = require_crypto(&state)?;
    let review_reason = required_review_field(input.review_reason, "Lý do loại bỏ", 1_000)?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let _ = load_pending_quarantine(&transaction, &source_key_sha256, crypto)?;
    let resolved_at = chrono::Utc::now().to_rfc3339();
    let review_reason_enc = crm::encrypt_hr_bank_field(&review_reason, crypto)?;
    transaction
        .execute(
            "INSERT INTO employee_bank_import_resolutions
             (source_key_sha256,action,actor_user_id,account_id,review_reason_enc,resolved_at)
             VALUES (?1,'dismissed',?2,NULL,?3,?4)",
            params![source_key_sha256, actor.id, review_reason_enc, resolved_at],
        )
        .map_err(|_| {
            ApiError::conflict("Hàng cách ly đã được xử lý; không có thay đổi nào được ghi.")
        })?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({"review": QuarantineReviewResult {
        source_key_sha256,
        action: "dismissed".to_owned(),
        account_id: None,
        resolved_at,
    }})))
}

#[derive(Default)]
struct ArchivedBankFields {
    employee_code: String,
    bank_name: String,
    account_number: String,
    account_holder: String,
    branch: String,
    note: String,
}

fn archived_source_fields(source_kind: &str, payload: &str) -> ArchivedBankFields {
    let Ok(value) = serde_json::from_str::<Value>(payload) else {
        return ArchivedBankFields::default();
    };
    if source_kind == "employee_profile" {
        let bank_fields = value.get("bankFields").cloned().unwrap_or(Value::Null);
        let account_number = first_text_field(&bank_fields, &["bankAccount", "accountNumber"]);
        return ArchivedBankFields {
            employee_code: text_field(&value, "employeeCode"),
            bank_name: text_field(&bank_fields, "bankName"),
            account_number,
            account_holder: text_field(&bank_fields, "accountHolder"),
            branch: text_field(&bank_fields, "branch"),
            note: text_field(&bank_fields, "note"),
        };
    }
    ArchivedBankFields {
        employee_code: text_field(&value, "employeeCode"),
        bank_name: text_field(&value, "bankName"),
        account_number: text_field(&value, "accountNumber"),
        account_holder: text_field(&value, "accountHolder"),
        branch: text_field(&value, "branch"),
        note: text_field(&value, "note"),
    }
}

fn first_text_field(value: &Value, fields: &[&str]) -> String {
    fields
        .iter()
        .map(|field| text_field(value, field))
        .find(|value| !value.is_empty())
        .unwrap_or_default()
}

fn mask_account_number(value: &str) -> String {
    let significant_characters = value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .count();
    if significant_characters < 4 {
        return "Số tài khoản chưa hợp lệ".to_owned();
    }
    let last_four = value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .rev()
        .take(4)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<String>();
    if last_four.is_empty() {
        "Chưa có số tài khoản".to_owned()
    } else {
        format!("•••• {last_four}")
    }
}

fn bounded_display_field(value: &str, max_chars: usize) -> String {
    value
        .chars()
        .take(max_chars)
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect::<String>()
        .trim()
        .to_owned()
}

fn validate_source_key(source_key_sha256: &str) -> ApiResult<()> {
    if source_key_sha256.len() != 64
        || !source_key_sha256
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(ApiError::bad_request("Mã hàng cách ly không hợp lệ."));
    }
    Ok(())
}

fn quarantine_confirmation(action: &str, source_key_sha256: &str) -> String {
    format!("{action}-{}", &source_key_sha256[..8].to_ascii_uppercase())
}

fn load_pending_quarantine(
    transaction: &rusqlite::Transaction<'_>,
    source_key_sha256: &str,
    crypto: &crm::CrmCrypto,
) -> ApiResult<(String, String)> {
    let row = transaction
        .query_row(
            "SELECT r.source_kind,r.legacy_payload_enc
             FROM employee_bank_import_rows r
             LEFT JOIN employee_bank_import_resolutions x
               ON x.source_key_sha256=r.source_key_sha256
             WHERE r.source_key_sha256=?1 AND r.outcome='quarantined'
               AND x.source_key_sha256 IS NULL",
            params![source_key_sha256],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy hàng cách ly đang chờ xử lý."))?;
    let payload = crm::decrypt_hr_bank_field(&row.1, Some(crypto))?;
    Ok((row.0, payload))
}

fn resolve_active_employee(
    transaction: &rusqlite::Transaction<'_>,
    employee_code: &str,
) -> ApiResult<(String, String, String)> {
    let mut statement = transaction
        .prepare(
            "SELECT p.user_id,p.employee_code,u.name,u.is_active,p.employment_status
             FROM employee_profiles p JOIN users u ON u.id=p.user_id
             WHERE lower(trim(p.employee_code))=lower(trim(?1)) AND u.role!='ADMIN'
             ORDER BY p.user_id",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![employee_code], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, bool>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(ApiError::internal)?;
    let employees = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    if employees.is_empty() {
        return Err(ApiError::unprocessable("Mã nhân viên không khớp hồ sơ HR."));
    }
    if employees.len() != 1 {
        return Err(ApiError::conflict(
            "Mã nhân viên khớp nhiều hồ sơ HR; cần xử lý danh bạ trước.",
        ));
    }
    let (id, code, name, active, status) = employees.into_iter().next().expect("one employee");
    if !active || ["Đã nghỉ việc", "Chờ kích hoạt"].contains(&status.as_str()) {
        return Err(ApiError::unprocessable(
            "Chỉ có thể nhận bản ghi cho nhân viên đang hoạt động.",
        ));
    }
    Ok((id, code, name))
}

fn account_number_exists(
    transaction: &rusqlite::Transaction<'_>,
    employee_id: &str,
    account_number: &str,
    crypto: &crm::CrmCrypto,
) -> ApiResult<bool> {
    let mut statement = transaction
        .prepare("SELECT account_number_enc FROM employee_bank_accounts WHERE employee_user_id=?1")
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![employee_id], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?;
    let candidate = normalize_account_number(account_number);
    for row in rows {
        let encrypted = row.map_err(ApiError::internal)?;
        let existing = crm::decrypt_hr_bank_field(&encrypted, Some(crypto))?;
        if normalize_account_number(&existing) == candidate {
            return Ok(true);
        }
    }
    Ok(false)
}

fn merge_override(target: &mut String, override_value: Option<String>) {
    if let Some(value) = override_value {
        if !value.trim().is_empty() {
            *target = value;
        }
    }
}

fn required_review_field(value: String, label: &str, max_chars: usize) -> ApiResult<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max_chars || value.chars().any(char::is_control)
    {
        return Err(ApiError::unprocessable(format!("{label} không hợp lệ.")));
    }
    Ok(value.to_owned())
}

fn optional_review_field(value: String, label: &str, max_chars: usize) -> ApiResult<String> {
    let value = value.trim();
    if value.chars().count() > max_chars || value.chars().any(char::is_control) {
        return Err(ApiError::unprocessable(format!("{label} không hợp lệ.")));
    }
    Ok(value.to_owned())
}

fn parse_body<T: for<'de> Deserialize<'de>>(body: &[u8]) -> ApiResult<T> {
    if body.len() > MAX_BODY_BYTES {
        return Err(ApiError::bad_request("Tệp nhập vượt quá giới hạn 8 MiB."));
    }
    serde_json::from_slice(body)
        .map_err(|_| ApiError::bad_request("JSON nhập không hợp lệ hoặc không đúng cấu trúc."))
}

fn validate_bundle(bundle: &BankBundle) -> ApiResult<()> {
    if bundle.format != FORMAT || bundle.schema_version != SCHEMA_VERSION {
        return Err(ApiError::unprocessable(
            "Định dạng hoặc phiên bản gói nhập tài khoản ngân hàng không được hỗ trợ.",
        ));
    }
    let batch_id = Uuid::parse_str(&bundle.batch_id)
        .map_err(|_| ApiError::unprocessable("Mã lô nhập phải là UUID hợp lệ."))?;
    if batch_id.to_string() != bundle.batch_id {
        return Err(ApiError::unprocessable(
            "Mã lô nhập phải là UUID chữ thường ở dạng chuẩn.",
        ));
    }
    validate_origin(&bundle.source_origin)?;
    chrono::DateTime::parse_from_rfc3339(&bundle.exported_at)
        .map_err(|_| ApiError::unprocessable("Thời điểm xuất phải là RFC 3339."))?;
    if bundle.accounts.len() > MAX_RECORDS {
        return Err(ApiError::unprocessable(format!(
            "Gói vượt quá giới hạn {MAX_RECORDS} tài khoản."
        )));
    }
    let mut keys = std::collections::HashSet::new();
    for record in &bundle.accounts {
        let key = stable_key(record)?;
        if !keys.insert(key) {
            return Err(ApiError::unprocessable(
                "Gói có khóa bản ghi trùng lặp; hãy xuất lại từ nguồn legacy.",
            ));
        }
        if record.to_string().len() > 64 * 1024 {
            return Err(ApiError::unprocessable(
                "Một bản ghi nguồn vượt quá giới hạn 64 KiB.",
            ));
        }
    }
    Ok(())
}

fn validate_origin(origin: &str) -> ApiResult<()> {
    let Some((scheme, authority)) = origin.split_once("://") else {
        return Err(ApiError::unprocessable("Origin nguồn không hợp lệ."));
    };
    if origin.len() > 256
        || !matches!(scheme, "http" | "https")
        || authority.is_empty()
        || authority.chars().any(|character| {
            character.is_control() || character.is_whitespace() || "/?#@".contains(character)
        })
    {
        return Err(ApiError::unprocessable("Origin nguồn không hợp lệ."));
    }
    Ok(())
}

fn stable_key(record: &Value) -> ApiResult<&str> {
    record
        .get("id")
        .and_then(Value::as_str)
        .or_else(|| record.get("key").and_then(Value::as_str))
        .filter(|key| {
            !key.trim().is_empty()
                && key.trim() == *key
                && key.len() <= 256
                && !key.chars().any(char::is_control)
        })
        .ok_or_else(|| {
            ApiError::unprocessable(
                "Mỗi tài khoản trong gói phải có id hoặc key dạng chuỗi ổn định.",
            )
        })
}

fn require_crypto(state: &AppState) -> ApiResult<&crm::CrmCrypto> {
    state.crm_crypto.as_ref().ok_or_else(|| {
        ApiError::service_unavailable(
            "Chưa cấu hình khóa mã hóa; không thể xem trước hoặc nhập dữ liệu ngân hàng.",
        )
    })
}

fn confirmation_phrase(batch_id: &str, record_count: usize) -> String {
    format!(
        "IMPORT-BANK-{}-{record_count}",
        &batch_id[..8].to_ascii_uppercase()
    )
}

fn build_plan(
    db: &Connection,
    bundle: &BankBundle,
    crypto: &crm::CrmCrypto,
) -> ApiResult<ImportPlan> {
    let mut source_records = collect_database_records(db)?;
    let generic_collection_records = source_records
        .iter()
        .filter(|record| record.source_kind == "generic_collection")
        .count();
    let employee_profile_records = source_records
        .iter()
        .filter(|record| record.source_kind == "employee_profile")
        .count();
    let local_storage_records = bundle.accounts.len();
    for record in &bundle.accounts {
        source_records.push(record_from_value(
            "local_storage",
            stable_key(record)?.to_owned(),
            record.clone(),
        ));
    }
    if source_records.len() > MAX_RECORDS {
        return Err(ApiError::unprocessable(format!(
            "Tổng dữ liệu nguồn vượt quá giới hạn {MAX_RECORDS} bản ghi."
        )));
    }
    if source_records
        .iter()
        .any(|record| record.raw_record.to_string().len() > 64 * 1024)
    {
        return Err(ApiError::unprocessable(
            "Một bản ghi nguồn vượt quá giới hạn 64 KiB; không có dữ liệu nào được nhập.",
        ));
    }

    source_records.sort_by(|left, right| {
        left.source_kind
            .cmp(right.source_kind)
            .then(left.stable_key.cmp(&right.stable_key))
    });
    let mut already_imported = std::collections::HashSet::new();
    {
        let mut statement = db
            .prepare("SELECT source_key_sha256 FROM employee_bank_import_rows")
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?;
        for row in rows {
            already_imported.insert(row.map_err(ApiError::internal)?);
        }
    }

    let mut occupied_accounts = std::collections::HashSet::new();
    {
        let mut statement = db
            .prepare("SELECT employee_user_id, account_number_enc FROM employee_bank_accounts")
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(ApiError::internal)?;
        for row in rows {
            let (employee_id, encrypted_number) = row.map_err(ApiError::internal)?;
            let account_number = crm::decrypt_hr_bank_field(&encrypted_number, Some(crypto))?;
            occupied_accounts.insert((employee_id, normalize_account_number(&account_number)));
        }
    }

    let mut planned = Vec::with_capacity(source_records.len());
    let mut importable_accounts = 0usize;
    let mut quarantined_records = 0usize;
    let mut already_imported_records = 0usize;
    let mut source_fingerprints = Vec::with_capacity(source_records.len());
    for source in source_records {
        let source_key_sha256 = digest_bytes(
            format!(
                "{}\0{}\0{}",
                source.source_kind, bundle.source_origin, source.stable_key
            )
            .as_bytes(),
        );
        let raw_sha256 = digest_bytes(source.raw_record.to_string().as_bytes());
        if already_imported.contains(&source_key_sha256) {
            already_imported_records += 1;
            source_fingerprints.push((
                source_key_sha256.clone(),
                raw_sha256,
                "already_imported".to_owned(),
                String::new(),
            ));
            planned.push(PlannedRecord {
                source_kind: source.source_kind,
                source_ref: source.stable_key,
                source_key_sha256,
                raw_record: source.raw_record,
                outcome: PlannedOutcome::AlreadyImported,
            });
            continue;
        }

        let issue = if let Some(issue) = source.initial_issue {
            Some(issue)
        } else {
            None
        };
        let (employee, issue) = if issue.is_some() {
            (None, issue)
        } else {
            resolve_employee(db, &source.employee_code)?
        };
        let identity_fingerprint = employee
            .as_ref()
            .map(|(id, code, name)| format!("{id}\0{code}\0{name}"))
            .unwrap_or_default();
        let mut issue = issue;
        let employee = employee;
        if issue.is_none() && source.bank_name.trim().is_empty() {
            issue = Some("missing_bank_name");
        }
        if issue.is_none() && source.account_number.trim().is_empty() {
            issue = Some("missing_account_number");
        }
        if issue.is_none() && source.bank_name.trim().len() > 160 {
            issue = Some("bank_name_too_long");
        }
        if issue.is_none() && source.account_holder.trim().len() > 160 {
            issue = Some("account_holder_too_long");
        }
        if issue.is_none() && source.branch.trim().len() > 160 {
            issue = Some("branch_too_long");
        }
        if issue.is_none() && source.note.trim().len() > 1_000 {
            issue = Some("note_too_long");
        }
        if issue.is_none() && validate_account_number(source.account_number.clone()).is_err() {
            issue = Some("invalid_account_number");
        }

        let employee = employee;
        let outcome = if let Some(issue_code) = issue {
            quarantined_records += 1;
            PlannedOutcome::Quarantine(issue_code)
        } else {
            let (employee_id, employee_code, employee_name) =
                employee.expect("resolved when no issue is present");
            let normalized = normalize_account_number(&source.account_number);
            if !occupied_accounts.insert((employee_id.clone(), normalized)) {
                quarantined_records += 1;
                PlannedOutcome::Quarantine("duplicate_employee_account")
            } else {
                importable_accounts += 1;
                PlannedOutcome::Import {
                    employee_id,
                    employee_code,
                    bank_name: source.bank_name.trim().to_owned(),
                    account_number: source.account_number.trim().to_owned(),
                    account_holder: if source.account_holder.trim().is_empty() {
                        employee_name
                    } else {
                        source.account_holder.trim().to_owned()
                    },
                    branch: source.branch.trim().to_owned(),
                    note: source.note.trim().to_owned(),
                }
            }
        };
        let (outcome_name, employee_id) = match &outcome {
            PlannedOutcome::Import { employee_id, .. } => {
                ("imported_unverified", employee_id.clone())
            }
            PlannedOutcome::Quarantine(issue) => (*issue, String::new()),
            PlannedOutcome::AlreadyImported => ("already_imported", String::new()),
        };
        source_fingerprints.push((
            source_key_sha256.clone(),
            raw_sha256,
            outcome_name.to_owned(),
            if identity_fingerprint.is_empty() {
                employee_id
            } else {
                identity_fingerprint
            },
        ));
        planned.push(PlannedRecord {
            source_kind: source.source_kind,
            source_ref: source.stable_key,
            source_key_sha256,
            raw_record: source.raw_record,
            outcome,
        });
    }
    let fingerprint_input = json!({
        "bundle": bundle,
        "databaseSources": source_fingerprints,
        "genericCollectionRecords": generic_collection_records,
        "employeeProfileRecords": employee_profile_records,
    });
    let payload_sha256 = digest_bytes(fingerprint_input.to_string().as_bytes());
    Ok(ImportPlan {
        records: planned,
        payload_sha256,
        importable_accounts,
        quarantined_records,
        already_imported_records,
        generic_collection_records,
        local_storage_records,
        employee_profile_records,
    })
}

fn remove_legacy_profile_bank_fields(
    transaction: &rusqlite::Transaction<'_>,
    user_id: &str,
    updated_at: &str,
) -> ApiResult<()> {
    let details_json: String = transaction
        .query_row(
            "SELECT details_json FROM employee_profiles WHERE user_id=?1",
            params![user_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::conflict("Hồ sơ nguồn đã đổi hoặc không còn tồn tại."))?;
    let mut details = serde_json::from_str::<Value>(&details_json).map_err(ApiError::internal)?;
    crate::strip_employee_bank_account_fields(&mut details);
    transaction
        .execute(
            "UPDATE employee_profiles SET details_json=?1, updated_at=?2 WHERE user_id=?3",
            params![details.to_string(), updated_at, user_id],
        )
        .map_err(ApiError::internal)?;
    Ok(())
}

fn collect_database_records(db: &Connection) -> ApiResult<Vec<SourceRecord>> {
    let mut records = Vec::new();
    {
        let mut statement = db
            .prepare(
                "SELECT record_key, record_json FROM collection_records
                 WHERE scope='employee_bank_accounts' ORDER BY record_key",
            )
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(ApiError::internal)?;
        for row in rows {
            let (key, json_record) = row.map_err(ApiError::internal)?;
            let source = match serde_json::from_str::<Value>(&json_record) {
                Ok(value) => record_from_value("generic_collection", key, value),
                Err(_) => SourceRecord {
                    source_kind: "generic_collection",
                    stable_key: key,
                    raw_record: Value::String(json_record),
                    employee_code: String::new(),
                    bank_name: String::new(),
                    account_number: String::new(),
                    account_holder: String::new(),
                    branch: String::new(),
                    note: String::new(),
                    initial_issue: Some("invalid_legacy_json"),
                },
            };
            records.push(source);
        }
    }
    {
        let mut statement = db
            .prepare(
                "SELECT p.user_id, p.employee_code, u.name, p.details_json
                 FROM employee_profiles p JOIN users u ON u.id=p.user_id
                 WHERE u.role!='ADMIN' ORDER BY p.user_id",
            )
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(ApiError::internal)?;
        for row in rows {
            let (user_id, employee_code, employee_name, details_json) =
                row.map_err(ApiError::internal)?;
            let details = match serde_json::from_str::<Value>(&details_json) {
                Ok(value) => value,
                Err(_) => continue,
            };
            let bank_fields = extract_employee_bank_fields(&details);
            if bank_fields.is_null() {
                continue;
            }
            let bank_name = text_field(&details, "bankName");
            let account_number = {
                let number = text_field(&details, "bankAccount");
                if number.is_empty() {
                    text_field(&details, "accountNumber")
                } else {
                    number
                }
            };
            let raw_record = json!({
                "source": "employee_profile_details",
                "employeeCode": employee_code,
                "bankFields": bank_fields,
            });
            records.push(SourceRecord {
                source_kind: "employee_profile",
                stable_key: user_id,
                raw_record,
                employee_code,
                bank_name,
                account_number,
                account_holder: employee_name,
                branch: String::new(),
                note: "Chuyển từ trường bank trong hồ sơ legacy.".to_owned(),
                initial_issue: None,
            });
        }
    }
    Ok(records)
}

fn record_from_value(source_kind: &'static str, stable_key: String, value: Value) -> SourceRecord {
    SourceRecord {
        source_kind,
        stable_key,
        employee_code: text_field(&value, "employeeCode"),
        bank_name: text_field(&value, "bankName"),
        account_number: text_field(&value, "accountNumber"),
        account_holder: text_field(&value, "accountHolder"),
        branch: text_field(&value, "branch"),
        note: text_field(&value, "note"),
        raw_record: value,
        initial_issue: None,
    }
}

fn text_field(value: &Value, field: &str) -> String {
    value
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_owned()
}

fn extract_employee_bank_fields(value: &Value) -> Value {
    match value {
        Value::Object(fields) => {
            let mut bank_fields = serde_json::Map::new();
            for (key, child) in fields {
                if crate::is_employee_bank_account_field(key) {
                    bank_fields.insert(key.clone(), child.clone());
                } else {
                    let nested = extract_employee_bank_fields(child);
                    if !nested.is_null() {
                        bank_fields.insert(key.clone(), nested);
                    }
                }
            }
            if bank_fields.is_empty() {
                Value::Null
            } else {
                Value::Object(bank_fields)
            }
        }
        Value::Array(items) => {
            let bank_items = items
                .iter()
                .map(extract_employee_bank_fields)
                .filter(|value| !value.is_null())
                .collect::<Vec<_>>();
            if bank_items.is_empty() {
                Value::Null
            } else {
                Value::Array(bank_items)
            }
        }
        _ => Value::Null,
    }
}

fn resolve_employee(
    db: &Connection,
    employee_code: &str,
) -> ApiResult<(Option<(String, String, String)>, Option<&'static str>)> {
    if employee_code.trim().is_empty() {
        return Ok((None, Some("missing_employee_code")));
    }
    let mut statement = db
        .prepare(
            "SELECT p.user_id, p.employee_code, u.name FROM employee_profiles p
             JOIN users u ON u.id=p.user_id
             WHERE lower(trim(p.employee_code))=lower(trim(?1)) AND u.role!='ADMIN'
             ORDER BY p.user_id",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![employee_code], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(ApiError::internal)?;
    let mut employees = Vec::new();
    for row in rows {
        employees.push(row.map_err(ApiError::internal)?);
    }
    match employees.len() {
        0 => Ok((None, Some("unknown_employee_code"))),
        1 => Ok((employees.pop(), None)),
        _ => Ok((None, Some("ambiguous_employee_code"))),
    }
}

fn validate_account_number(value: String) -> ApiResult<String> {
    let value = value.trim();
    let significant_characters = value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .count();
    if value.is_empty()
        || value.len() > 64
        || significant_characters < 4
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b' ' | b'-'))
    {
        return Err(ApiError::unprocessable("Invalid legacy account number."));
    }
    Ok(value.to_owned())
}

fn normalize_account_number(value: &str) -> String {
    value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn digest_bytes(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{Body, to_bytes},
        http::{Method, Request, StatusCode},
    };
    use serde_json::json;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    use crate::User;

    fn fixture(with_key: bool) -> (axum::Router, AppState, User, User) {
        let db = Connection::open_in_memory().expect("bank import test database");
        crate::init_database(&db).expect("initialize bank import test schema");
        let now = chrono::Utc::now().to_rfc3339();
        for (id, email, name, role) in [
            (
                "bank-import-admin",
                "bank-import-admin@test",
                "HR Admin",
                "ADMIN",
            ),
            (
                "bank-import-user",
                "bank-import-user@test",
                "Nguyễn An",
                "USER",
            ),
        ] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, email, name, role, now],
            )
            .expect("insert bank import fixture user");
        }
        db.execute(
            "INSERT INTO employee_profiles (user_id,employee_code,employment_status,details_json,created_at,updated_at)
             VALUES ('bank-import-user','EMP-IMPORT','Chính thức',?1,?2,?2)",
            params![json!({"bankName":"ACB","bankAccount":"008877665544"}).to_string(), now],
        )
        .expect("insert bank import fixture profile");
        db.execute(
            "INSERT INTO collection_records(scope,record_key,record_json,created_at,updated_at)
             VALUES ('employee_bank_accounts','legacy-existing',?1,?2,?2)",
            params![json!({
                "id":"legacy-existing", "employeeCode":"EMP-IMPORT", "employeeName":"Wrong Name",
                "bankName":"Vietcombank", "accountNumber":"001122334455", "accountHolder":"NGUYEN AN",
                "branch":"HCM", "status":"Đã duyệt", "isPrimary":true, "approvedAt":"2000-01-01"
            }).to_string(), now],
        )
        .expect("insert bank import fixture legacy collection row");
        let secret = b"employee-bank-import-test-secret-long-enough";
        let state = AppState {
            db: std::sync::Arc::new(tokio::sync::Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: std::sync::Arc::new(std::path::PathBuf::new()),
            crm_crypto: with_key
                .then(|| crm::CrmCrypto::for_test([0x63; 32], "bank-import-test-v1")),
        };
        let admin = User {
            id: "bank-import-admin".to_owned(),
            email: "bank-import-admin@test".to_owned(),
            name: "HR Admin".to_owned(),
            role: "ADMIN".to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let employee = User {
            id: "bank-import-user".to_owned(),
            email: "bank-import-user@test".to_owned(),
            name: "Nguyễn An".to_owned(),
            role: "USER".to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        };
        (
            crate::router(state.clone(), CorsLayer::new()),
            state,
            admin,
            employee,
        )
    }

    fn bundle() -> Value {
        json!({
            "format":FORMAT,
            "schemaVersion":SCHEMA_VERSION,
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceOrigin":"https://legacy.example.test",
            "exportedAt":"2026-10-08T00:00:00Z",
            "accounts":[
                {"id":"local-valid","employeeCode":"EMP-IMPORT","employeeName":"Spoofed", "bankName":"MB", "accountNumber":"009988776655", "accountHolder":"NGUYEN AN", "status":"Đã duyệt", "isPrimary":true},
                {"id":"local-unknown","employeeCode":"EMP-MISSING","bankName":"ACB", "accountNumber":"111122223333"},
                {"id":"local-duplicate","employeeCode":"EMP-IMPORT","bankName":"ACB", "accountNumber":"0011-2233-4455"}
            ]
        })
    }

    fn bearer(state: &AppState, user: &User) -> String {
        format!(
            "Bearer {}",
            crate::issue_token(state, user).expect("bank import JWT")
        )
    }

    async fn call(
        app: &axum::Router,
        method: Method,
        uri: &str,
        token: &str,
        body: Value,
    ) -> axum::response::Response {
        app.clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("authorization", token)
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .expect("bank import request"),
            )
            .await
            .expect("bank import response")
    }

    async fn json_body(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 256 * 1024)
                .await
                .expect("bank import response body"),
        )
        .expect("bank import response JSON")
    }

    #[tokio::test]
    async fn preview_is_read_only_masks_data_and_reports_import_and_quarantine_counts() {
        let (app, state, admin, employee) = fixture(true);
        let preview = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/employee-bank-accounts/preview",
            &bearer(&state, &admin),
            json!({"bundle":bundle()}),
        )
        .await;
        assert_eq!(preview.status(), StatusCode::OK);
        let response = json_body(preview).await;
        let preview = &response["preview"];
        assert_eq!(preview["sourceRecords"], 5);
        assert_eq!(preview["genericCollectionRecords"], 1);
        assert_eq!(preview["localStorageRecords"], 3);
        assert_eq!(preview["employeeProfileRecords"], 1);
        assert_eq!(preview["importableAccounts"], 3);
        assert_eq!(preview["quarantinedRecords"], 2);
        let response_text = response.to_string();
        for secret in ["001122334455", "008877665544", "009988776655", "Wrong Name"] {
            assert!(!response_text.contains(secret));
        }
        let db = state.db.lock().await;
        let target_count: i64 = db
            .query_row("SELECT COUNT(*) FROM employee_bank_accounts", [], |row| {
                row.get(0)
            })
            .unwrap();
        let import_run_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM employee_bank_import_runs",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(target_count, 0);
        assert_eq!(import_run_count, 0);
        drop(db);
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/employee-bank-accounts/preview",
                &bearer(&state, &employee),
                json!({"bundle":bundle()}),
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn apply_encrypts_rows_resets_untrusted_approval_and_preserves_quarantine() {
        let (app, state, admin, _) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let bundle_value = bundle();
        let preview = json_body(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/employee-bank-accounts/preview",
                &admin_token,
                json!({"bundle":bundle_value.clone()}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        let result = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/employee-bank-accounts/apply",
            &admin_token,
            json!({
                "bundle":bundle_value,
                "expectedPayloadSha256":preview["payloadSha256"],
                "confirmation":preview["confirmationPhrase"],
            }),
        )
        .await;
        assert_eq!(result.status(), StatusCode::OK);
        let imported = json_body(result).await["import"].clone();
        assert_eq!(imported["importedAccounts"], 3);
        assert_eq!(imported["quarantinedRecords"], 2);
        assert_eq!(imported["alreadyImportedRecords"], 0);

        let db = state.db.lock().await;
        let mut statement = db
            .prepare(
                "SELECT employee_user_id,employee_code,bank_name_enc,account_number_enc,
                        account_holder_enc,status,is_primary,note_enc
                 FROM employee_bank_accounts",
            )
            .unwrap();
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, bool>(6)?,
                    row.get::<_, String>(7)?,
                ))
            })
            .unwrap();
        let imported = rows
            .map(|row| row.unwrap())
            .find(|row| {
                crm::decrypt_hr_bank_field(&row.3, state.crm_crypto.as_ref()).unwrap()
                    == "009988776655"
            })
            .expect("local-storage account must be imported");
        let (owner, code, bank, account_number, holder, status, primary, note) = imported;
        assert_eq!(owner, "bank-import-user");
        assert_eq!(code, "EMP-IMPORT");
        assert_eq!(status, "Chờ duyệt");
        assert!(!primary);
        assert!(!account_number.contains("009988776655"));
        assert_ne!(bank, "MB");
        assert_eq!(
            crm::decrypt_hr_bank_field(&bank, state.crm_crypto.as_ref()).unwrap(),
            "MB"
        );
        assert_eq!(
            crm::decrypt_hr_bank_field(&account_number, state.crm_crypto.as_ref()).unwrap(),
            "009988776655"
        );
        assert_eq!(
            crm::decrypt_hr_bank_field(&holder, state.crm_crypto.as_ref()).unwrap(),
            "NGUYEN AN"
        );
        assert!(
            crm::decrypt_hr_bank_field(&note, state.crm_crypto.as_ref())
                .unwrap()
                .contains("cần HR rà soát")
        );
        let event_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM employee_bank_account_events WHERE event_type='created'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let quarantined: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM employee_bank_import_rows WHERE outcome='quarantined'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(event_count, 3);
        assert_eq!(quarantined, 2);
        let mut quarantine_statement = db
            .prepare("SELECT legacy_payload_enc FROM employee_bank_import_rows WHERE outcome='quarantined'")
            .unwrap();
        let quarantined_payloads = quarantine_statement
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(|row| {
                let encrypted = row.unwrap();
                assert!(!encrypted.contains("EMP-MISSING"));
                assert!(!encrypted.contains("111122223333"));
                crm::decrypt_hr_bank_field(&encrypted, state.crm_crypto.as_ref()).unwrap()
            })
            .collect::<Vec<_>>();
        assert!(
            quarantined_payloads
                .iter()
                .any(|payload| payload.contains("EMP-MISSING"))
        );
        let source_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM collection_records WHERE scope='employee_bank_accounts'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let profile_details: String = db
            .query_row(
                "SELECT details_json FROM employee_profiles WHERE user_id='bank-import-user'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(source_count, 1);
        assert!(!profile_details.contains("008877665544"));
        assert!(!profile_details.contains("bankName"));
        let encrypted_profile_source: String = db
            .query_row(
                "SELECT legacy_payload_enc FROM employee_bank_import_rows WHERE source_kind='employee_profile'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let preserved_profile_source =
            crm::decrypt_hr_bank_field(&encrypted_profile_source, state.crm_crypto.as_ref())
                .unwrap();
        assert!(preserved_profile_source.contains("008877665544"));
    }

    #[tokio::test]
    async fn apply_rejects_changed_payload_wrong_confirmation_and_missing_key() {
        let (app, state, admin, _) = fixture(true);
        let token = bearer(&state, &admin);
        let bundle_value = bundle();
        let preview = json_body(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/employee-bank-accounts/preview",
                &token,
                json!({"bundle":bundle_value.clone()}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        let changed_bundle = json!({
            "format":FORMAT,
            "schemaVersion":SCHEMA_VERSION,
            "batchId":"b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            "sourceOrigin":"https://legacy.example.test",
            "exportedAt":"2026-10-08T00:00:00Z",
            "accounts":[{"id":"changed","employeeCode":"EMP-IMPORT","bankName":"ACB","accountNumber":"777788889999"}]
        });
        let changed = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/employee-bank-accounts/apply",
            &token,
            json!({"bundle":changed_bundle,"expectedPayloadSha256":preview["payloadSha256"],"confirmation":preview["confirmationPhrase"]}),
        ).await;
        assert_eq!(changed.status(), StatusCode::CONFLICT);
        let wrong_confirmation = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/employee-bank-accounts/apply",
            &token,
            json!({"bundle":bundle_value,"expectedPayloadSha256":preview["payloadSha256"],"confirmation":"NO"}),
        ).await;
        assert_eq!(
            wrong_confirmation.status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let (no_key_app, no_key_state, no_key_admin, _) = fixture(false);
        assert_eq!(
            call(
                &no_key_app,
                Method::POST,
                "/api/v1/legacy-import/employee-bank-accounts/preview",
                &bearer(&no_key_state, &no_key_admin),
                json!({"bundle":bundle()}),
            )
            .await
            .status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
    }

    #[tokio::test]
    async fn subsequent_export_is_idempotent_and_does_not_recreate_scrubbed_profile_data() {
        let (app, state, admin, _) = fixture(true);
        let token = bearer(&state, &admin);
        let original_bundle = bundle();
        let preview = json_body(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/employee-bank-accounts/preview",
                &token,
                json!({"bundle":original_bundle.clone()}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        let result = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/employee-bank-accounts/apply",
            &token,
            json!({
                "bundle":original_bundle,
                "expectedPayloadSha256":preview["payloadSha256"],
                "confirmation":preview["confirmationPhrase"],
            }),
        )
        .await;
        assert_eq!(result.status(), StatusCode::OK);

        let mut reexport = bundle();
        reexport["batchId"] = json!("4b3df837-6c52-4bd5-83f8-b26e84739ab8");
        let second_preview = json_body(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/employee-bank-accounts/preview",
                &token,
                json!({"bundle":reexport}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        assert_eq!(second_preview["alreadyImportedRecords"], 4);
        assert_eq!(second_preview["importableAccounts"], 0);
        assert_eq!(second_preview["quarantinedRecords"], 0);
        assert!(!second_preview["canApply"].as_bool().unwrap());
        let db = state.db.lock().await;
        let account_count: i64 = db
            .query_row("SELECT COUNT(*) FROM employee_bank_accounts", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(account_count, 3);
    }

    #[tokio::test]
    async fn quarantine_list_masks_data_and_adopt_or_dismiss_is_admin_only_and_append_only() {
        let (app, state, admin, employee) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let bundle_value = bundle();
        let preview = json_body(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/employee-bank-accounts/preview",
                &admin_token,
                json!({"bundle":bundle_value.clone()}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        let applied = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/employee-bank-accounts/apply",
            &admin_token,
            json!({
                "bundle":bundle_value,
                "expectedPayloadSha256":preview["payloadSha256"],
                "confirmation":preview["confirmationPhrase"],
            }),
        )
        .await;
        assert_eq!(applied.status(), StatusCode::OK);

        let uri = "/api/v1/hr/bank-import/quarantine?page=1&pageSize=50";
        assert_eq!(
            call(
                &app,
                Method::GET,
                uri,
                &bearer(&state, &employee),
                json!({})
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        let listed = call(&app, Method::GET, uri, &admin_token, json!({})).await;
        assert_eq!(listed.status(), StatusCode::OK);
        let listed = json_body(listed).await;
        assert_eq!(listed["pagination"]["total"], 2);
        let listed_text = listed.to_string();
        assert!(!listed_text.contains("111122223333"));
        assert!(!listed_text.contains("0011-2233-4455"));
        let quarantined = listed["data"].as_array().unwrap();
        let unknown = quarantined
            .iter()
            .find(|item| item["issueCode"] == "unknown_employee_code")
            .unwrap();
        let unknown_key = unknown["sourceKeySha256"].as_str().unwrap();
        assert_eq!(unknown["accountNumberMasked"], "•••• 3333");
        assert_eq!(
            call(
                &app,
                Method::POST,
                &format!("/api/v1/hr/bank-import/quarantine/{unknown_key}/adopt"),
                &bearer(&state, &employee),
                json!({
                    "employeeCode":"EMP-IMPORT",
                    "confirmation":quarantine_confirmation("ADOPT", unknown_key),
                    "reviewReason":"Không được phép",
                }),
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                Method::POST,
                &format!("/api/v1/hr/bank-import/quarantine/{unknown_key}/dismiss"),
                &bearer(&state, &employee),
                json!({
                    "confirmation":quarantine_confirmation("DISMISS", unknown_key),
                    "reviewReason":"Không được phép",
                }),
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        let duplicate = quarantined
            .iter()
            .find(|item| item["issueCode"] == "duplicate_employee_account")
            .unwrap();
        let duplicate_key = duplicate["sourceKeySha256"].as_str().unwrap();

        let invalid_confirmation = call(
            &app,
            Method::POST,
            &format!("/api/v1/hr/bank-import/quarantine/{unknown_key}/adopt"),
            &admin_token,
            json!({
                "employeeCode":"EMP-IMPORT",
                "confirmation":"NO",
                "reviewReason":"Đối chiếu hồ sơ HR nội bộ",
            }),
        )
        .await;
        assert_eq!(
            invalid_confirmation.status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );

        let duplicate_adoption = call(
            &app,
            Method::POST,
            &format!("/api/v1/hr/bank-import/quarantine/{duplicate_key}/adopt"),
            &admin_token,
            json!({
                "employeeCode":"EMP-IMPORT",
                "confirmation":quarantine_confirmation("ADOPT", duplicate_key),
                "reviewReason":"Đối chiếu phát hiện tài khoản trùng",
            }),
        )
        .await;
        assert_eq!(duplicate_adoption.status(), StatusCode::CONFLICT);

        let adopted = call(
            &app,
            Method::POST,
            &format!("/api/v1/hr/bank-import/quarantine/{unknown_key}/adopt"),
            &admin_token,
            json!({
                "employeeCode":"EMP-IMPORT",
                "confirmation":quarantine_confirmation("ADOPT", unknown_key),
                "reviewReason":"Đối chiếu hồ sơ HR nội bộ",
            }),
        )
        .await;
        assert_eq!(adopted.status(), StatusCode::CREATED);
        let adopted = json_body(adopted).await["review"].clone();
        assert_eq!(adopted["action"], "adopted");
        let adopted_account_id = adopted["accountId"].as_str().unwrap();

        let remaining =
            json_body(call(&app, Method::GET, uri, &admin_token, json!({})).await).await;
        assert_eq!(remaining["pagination"]["total"], 1);
        let adopted_again = call(
            &app,
            Method::POST,
            &format!("/api/v1/hr/bank-import/quarantine/{unknown_key}/adopt"),
            &admin_token,
            json!({
                "employeeCode":"EMP-IMPORT",
                "confirmation":quarantine_confirmation("ADOPT", unknown_key),
                "reviewReason":"Thử xử lý lần hai",
            }),
        )
        .await;
        assert_eq!(adopted_again.status(), StatusCode::NOT_FOUND);

        let dismissed = call(
            &app,
            Method::POST,
            &format!("/api/v1/hr/bank-import/quarantine/{duplicate_key}/dismiss"),
            &admin_token,
            json!({
                "confirmation":quarantine_confirmation("DISMISS", duplicate_key),
                "reviewReason":"Không nhận do trùng tài khoản hiện hữu",
            }),
        )
        .await;
        assert_eq!(dismissed.status(), StatusCode::OK);
        let no_pending =
            json_body(call(&app, Method::GET, uri, &admin_token, json!({})).await).await;
        assert_eq!(no_pending["pagination"]["total"], 0);

        let db = state.db.lock().await;
        let adopted_account: (String, String, String) = db
            .query_row(
                "SELECT employee_user_id,employee_code,status FROM employee_bank_accounts WHERE id=?1",
                params![adopted_account_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(adopted_account.0, "bank-import-user");
        assert_eq!(adopted_account.1, "EMP-IMPORT");
        assert_eq!(adopted_account.2, "Chờ duyệt");
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM employee_bank_accounts", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 4);
        let resolutions: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM employee_bank_import_resolutions",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(resolutions, 2);
        let reasons = db
            .prepare("SELECT review_reason_enc FROM employee_bank_import_resolutions")
            .unwrap()
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .map(|row| row.unwrap())
            .collect::<Vec<_>>();
        assert!(
            reasons
                .iter()
                .all(|reason| !reason.contains("Đối chiếu hồ sơ"))
        );
        assert!(reasons.iter().any(|reason| {
            crm::decrypt_hr_bank_field(reason, state.crm_crypto.as_ref())
                .unwrap()
                .contains("Đối chiếu hồ sơ HR nội bộ")
        }));
        assert!(db
            .execute(
                "UPDATE employee_bank_import_resolutions SET action='dismissed' WHERE source_key_sha256=?1",
                params![unknown_key],
            )
            .is_err());
        assert!(
            db.execute(
                "DELETE FROM employee_bank_import_resolutions WHERE source_key_sha256=?1",
                params![unknown_key],
            )
            .is_err()
        );
    }

    #[test]
    fn archived_profile_source_fields_are_reconstructed_without_exposing_them_in_the_list_dto() {
        let fields = archived_source_fields(
            "employee_profile",
            &json!({
                "employeeCode":"EMP-ARCHIVE",
                "bankFields":{"bankName":"ACB","bankAccount":"123456789012"}
            })
            .to_string(),
        );
        assert_eq!(fields.employee_code, "EMP-ARCHIVE");
        assert_eq!(fields.bank_name, "ACB");
        assert_eq!(fields.account_number, "123456789012");
        assert_eq!(mask_account_number(&fields.account_number), "•••• 9012");
        assert_eq!(mask_account_number("abc"), "Số tài khoản chưa hợp lệ");
        assert_eq!(bounded_display_field("EMP\n-1", 64), "EMP -1");
    }
}
