use super::{ADMIN_ROLE, ApiError, ApiResult, AppState, User, authenticated_user};
use axum::{
    Json,
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
};
use base64::{
    Engine as _,
    engine::general_purpose::{URL_SAFE, URL_SAFE_NO_PAD},
};
use chrono::Utc;
use ring::{
    aead, hkdf,
    rand::{SecureRandom, SystemRandom},
};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, env, path::Path};
use uuid::Uuid;

const MAX_AMOUNT: i64 = 1_000_000_000_000;
const CRM_LEGACY_IMPORT_FORMAT: &str = "kiyovn-legacy-crm-operations";
const CRM_LEGACY_IMPORT_MAX_RECORDS: usize = 5_000;
const CRM_LEGACY_IMPORT_MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const CRM_LEGACY_IMPORT_SCOPES: [&str; 2] = ["crm_supplier_evaluations", "crm_feedback"];
const CRM_CONTACT_IMPORT_FORMAT: &str = "kiyovn-legacy-crm-contacts";
const CRM_CONTACT_IMPORT_MAX_RECORDS: usize = 5_000;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CrmLegacyOperationsBundle {
    format: String,
    schema_version: u32,
    batch_id: String,
    source_origin: String,
    exported_at: String,
    supplier_evaluations: Vec<Value>,
    customer_feedback: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CrmLegacyImportPreviewRequest {
    bundle: CrmLegacyOperationsBundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CrmLegacyImportApplyRequest {
    bundle: CrmLegacyOperationsBundle,
    expected_payload_sha256: String,
    confirmation: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CrmLegacyImportPreview {
    batch_id: String,
    payload_sha256: String,
    confirmation_phrase: String,
    source_records: usize,
    importable_records: usize,
    already_imported_records: usize,
    conflicted_records: usize,
    supplier_evaluation_records: usize,
    customer_feedback_records: usize,
    can_apply: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CrmLegacyImportResult {
    batch_id: String,
    imported_records: usize,
    already_imported_records: usize,
    imported_at: String,
}

#[derive(Debug)]
struct CrmLegacySourceRecord {
    scope: &'static str,
    stable_key: String,
    source_key_sha256: String,
    source_payload_sha256: String,
    raw_record: Value,
    planned_json: Option<String>,
    outcome: CrmLegacyPlanOutcome,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CrmLegacyPlanOutcome {
    Import,
    AlreadyImported,
    Conflict,
}

#[derive(Debug)]
struct CrmLegacyImportPlan {
    records: Vec<CrmLegacySourceRecord>,
    payload_sha256: String,
    importable_records: usize,
    already_imported_records: usize,
    conflicted_records: usize,
    supplier_evaluation_records: usize,
    customer_feedback_records: usize,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CrmLegacyContactsBundle {
    format: String,
    schema_version: u32,
    batch_id: String,
    source_database_id: String,
    exported_at: String,
    contacts: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CrmContactImportPreviewRequest {
    bundle: CrmLegacyContactsBundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CrmContactImportApplyRequest {
    bundle: CrmLegacyContactsBundle,
    expected_payload_sha256: String,
    confirmation: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CrmContactImportPreview {
    batch_id: String,
    source_database_id: String,
    payload_sha256: String,
    confirmation_phrase: String,
    source_records: usize,
    importable_records: usize,
    already_imported_records: usize,
    conflicted_records: usize,
    customer_records: usize,
    supplier_records: usize,
    partner_records: usize,
    can_apply: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CrmContactImportResult {
    batch_id: String,
    imported_records: usize,
    already_imported_records: usize,
    imported_at: String,
}

#[derive(Debug)]
struct CrmContactImportWrite {
    id: String,
    code: String,
    contact: ValidatedContact,
    created_at: String,
    updated_at: String,
}

#[derive(Debug)]
struct CrmContactImportSourceRecord {
    id: String,
    source_key_sha256: String,
    source_payload_sha256: String,
    raw_record: Value,
    planned: Option<CrmContactImportWrite>,
    outcome: CrmLegacyPlanOutcome,
}

#[derive(Debug)]
struct CrmContactImportPlan {
    records: Vec<CrmContactImportSourceRecord>,
    payload_sha256: String,
    importable_records: usize,
    already_imported_records: usize,
    conflicted_records: usize,
    customer_records: usize,
    supplier_records: usize,
    partner_records: usize,
}

#[derive(Clone)]
pub(super) struct CrmCrypto {
    master_key: [u8; 32],
    key_version: String,
}

impl CrmCrypto {
    #[cfg(test)]
    pub(super) fn for_test(master_key: [u8; 32], key_version: &str) -> Self {
        Self {
            master_key,
            key_version: key_version.to_owned(),
        }
    }
}

pub(super) fn load_crypto_from_env() -> Option<CrmCrypto> {
    let master_key = env::var("KIYOVN_MASTER_KEY")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .map(|value| parse_master_key(&value))
        .or_else(|| {
            let data_dir = env::var_os("KIYOVN_DATA_DIR")?;
            let key_path = Path::new(&data_dir).join(".kiyovn-master.key");
            let contents = std::fs::read_to_string(key_path).ok()?;
            parse_hex_key(contents.trim())
        })?;
    let configured_version = env::var("KIYOVN_KEY_VERSION").unwrap_or_default();
    let configured_version = configured_version.trim();
    let key_version = if configured_version.is_empty() {
        "v1".to_owned()
    } else {
        configured_version.to_owned()
    };
    if key_version.is_empty()
        || key_version.len() > 64
        || !key_version
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return None;
    }
    Some(CrmCrypto {
        master_key,
        key_version,
    })
}

fn parse_master_key(value: &str) -> [u8; 32] {
    if let Some(key) = parse_hex_key(value) {
        return key;
    }
    if (43..=44).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b'='))
    {
        let decoded = if value.ends_with('=') {
            URL_SAFE.decode(value).ok()
        } else {
            URL_SAFE_NO_PAD.decode(value).ok()
        };
        if let Some(decoded) = decoded.filter(|bytes| bytes.len() == 32) {
            let mut key = [0; 32];
            key.copy_from_slice(&decoded);
            return key;
        }
    }
    Sha256::digest(value.as_bytes()).into()
}

fn parse_hex_key(value: &str) -> Option<[u8; 32]> {
    if value.len() != 64 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let mut key = [0; 32];
    for (index, chunk) in value.as_bytes().chunks_exact(2).enumerate() {
        let high = (chunk[0] as char).to_digit(16)? as u8;
        let low = (chunk[1] as char).to_digit(16)? as u8;
        key[index] = (high << 4) | low;
    }
    Some(key)
}

#[derive(Debug, Deserialize)]
pub(super) struct ContactQuery {
    #[serde(rename = "type")]
    contact_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateContactInput {
    #[serde(rename = "type")]
    contact_type: Value,
    name: Value,
    #[serde(default)]
    tax_code: Value,
    #[serde(default)]
    industry: Value,
    #[serde(default)]
    contact_person: Value,
    #[serde(default)]
    phone: Value,
    #[serde(default)]
    email: Value,
    #[serde(default)]
    address: Value,
    #[serde(default)]
    bank_account: Value,
    #[serde(default)]
    credit_limit: Value,
    #[serde(default)]
    total_value: Value,
    #[serde(default)]
    debt_balance: Value,
    #[serde(default)]
    tier: Value,
    #[serde(default)]
    account_manager: Value,
    #[serde(default)]
    status: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Contact {
    key: String,
    code: String,
    name: String,
    #[serde(rename = "type")]
    contact_type: String,
    tax_code: String,
    industry: String,
    contact_person: String,
    phone: String,
    email: String,
    address: String,
    bank_account: String,
    credit_limit: i64,
    total_value: i64,
    debt_balance: i64,
    tier: String,
    account_manager: String,
    status: String,
    created_at: String,
    updated_at: String,
    legacy_import_status: Option<String>,
}

#[derive(Debug)]
struct ValidatedContact {
    contact_type: String,
    name: String,
    tax_code: String,
    industry: String,
    contact_person: String,
    phone: String,
    email: String,
    address: String,
    bank_account: String,
    credit_limit: i64,
    total_value: i64,
    debt_balance: i64,
    tier: String,
    account_manager: String,
    status: String,
}

struct StoredContact {
    id: String,
    code: String,
    name: String,
    contact_type: String,
    tax_code: String,
    industry: String,
    contact_person: String,
    phone: String,
    email: String,
    address: String,
    bank_account: String,
    credit_limit: i64,
    total_value: i64,
    debt_balance: i64,
    tier: String,
    account_manager: String,
    status: String,
    created_at: String,
    updated_at: String,
    legacy_import_status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateSupplierEvaluationInput {
    #[serde(default)]
    eval_code: String,
    eval_period: String,
    supplier_name: String,
    #[serde(default)]
    category: String,
    quality_score: i64,
    delivery_score: i64,
    price_score: i64,
    service_score: i64,
    evaluator: String,
    #[serde(default)]
    strengths: String,
    #[serde(default)]
    weaknesses: String,
    #[serde(default)]
    decision: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct SupplierEvaluation {
    key: String,
    eval_code: String,
    supplier_name: String,
    category: String,
    quality_score: i64,
    delivery_score: i64,
    price_score: i64,
    service_score: i64,
    total_score: i64,
    tier: String,
    eval_period: String,
    evaluator: String,
    strengths: String,
    weaknesses: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    decision: Option<String>,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

impl Default for SupplierEvaluation {
    fn default() -> Self {
        Self {
            key: String::new(),
            eval_code: String::new(),
            supplier_name: String::new(),
            category: String::new(),
            quality_score: 0,
            delivery_score: 0,
            price_score: 0,
            service_score: 0,
            total_score: 0,
            tier: String::new(),
            eval_period: String::new(),
            evaluator: String::new(),
            strengths: String::new(),
            weaknesses: String::new(),
            decision: None,
            extra: BTreeMap::new(),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateCustomerFeedbackInput {
    #[serde(default)]
    feedback_code: String,
    client_name: String,
    #[serde(default)]
    contact_person: String,
    #[serde(default)]
    phone: String,
    service_name: String,
    rating: i64,
    content: String,
    priority: String,
    #[serde(default)]
    resolution_action: String,
    assigned_staff: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct CustomerFeedback {
    key: String,
    feedback_code: String,
    client_name: String,
    contact_person: String,
    phone: String,
    service_name: String,
    rating: i64,
    content: String,
    priority: String,
    resolution_action: String,
    assigned_staff: String,
    received_date: String,
    resolved_date: Option<String>,
    status: String,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

impl Default for CustomerFeedback {
    fn default() -> Self {
        Self {
            key: String::new(),
            feedback_code: String::new(),
            client_name: String::new(),
            contact_person: String::new(),
            phone: String::new(),
            service_name: String::new(),
            rating: 0,
            content: String::new(),
            priority: String::new(),
            resolution_action: String::new(),
            assigned_staff: String::new(),
            received_date: String::new(),
            resolved_date: None,
            status: String::new(),
            extra: BTreeMap::new(),
        }
    }
}

pub(super) async fn list_contacts(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ContactQuery>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    if let Some(contact_type) = query.contact_type.as_deref()
        && !is_contact_type(contact_type)
    {
        return Err(ApiError::unprocessable("Loại đối tác không hợp lệ."));
    }

    let db = state.db.lock().await;
    let rows = if let Some(contact_type) = query.contact_type.as_deref() {
        let mut statement = db
            .prepare(
                "SELECT id, code, name, contact_type, tax_code, industry, contact_person,
                        phone, email, address, bank_account, credit_limit, total_value,
                        debt_balance, tier, account_manager, status, created_at, updated_at,
                        CASE WHEN EXISTS(
                            SELECT 1 FROM crm_contact_import_rows i
                            WHERE i.target_contact_id = crm_contacts.id
                        ) THEN 'unverified' ELSE NULL END
                 FROM crm_contacts WHERE contact_type = ?1 ORDER BY created_at DESC",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map(params![contact_type], stored_contact_from_row)
            .map_err(ApiError::internal)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(ApiError::internal)?
    } else {
        let mut statement = db
            .prepare(
                "SELECT id, code, name, contact_type, tax_code, industry, contact_person,
                        phone, email, address, bank_account, credit_limit, total_value,
                        debt_balance, tier, account_manager, status, created_at, updated_at,
                        CASE WHEN EXISTS(
                            SELECT 1 FROM crm_contact_import_rows i
                            WHERE i.target_contact_id = crm_contacts.id
                        ) THEN 'unverified' ELSE NULL END
                 FROM crm_contacts ORDER BY created_at DESC",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map([], stored_contact_from_row)
            .map_err(ApiError::internal)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(ApiError::internal)?
    };
    let contacts = rows
        .into_iter()
        .map(|row| public_contact(row, state.crm_crypto.as_ref()))
        .collect::<ApiResult<Vec<_>>>()?;
    let _ = actor;
    Ok(Json(json!({ "data": contacts })))
}

pub(super) async fn create_contact(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateContactInput>,
) -> ApiResult<(axum::http::StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let contact = validate_contact(input)?;
    let crypto = state.crm_crypto.as_ref().ok_or_else(|| {
        ApiError::service_unavailable(
            "Chưa cấu hình khóa mã hóa CRM; không thể lưu thông tin liên hệ an toàn.",
        )
    })?;
    let now = Utc::now();
    let timestamp = now.to_rfc3339();
    let prefix = match contact.contact_type.as_str() {
        "customer" => "KH",
        "supplier" => "NCC",
        "partner" => "DT",
        _ => unreachable!("validated contact type"),
    };
    let date = now.format("%Y%m%d").to_string();
    let id = Uuid::new_v4().to_string();
    let db = state.db.lock().await;
    let transaction = db.unchecked_transaction().map_err(ApiError::internal)?;
    let mut created = None;
    for _ in 0..10 {
        let suffix = Uuid::new_v4().simple().to_string()[..8].to_ascii_uppercase();
        let code = format!("{prefix}-{date}-{suffix}");
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM crm_contacts WHERE code = ?1)",
                params![code],
                |row| row.get(0),
            )
            .map_err(ApiError::internal)?;
        if exists {
            continue;
        }
        transaction
            .execute(
                "INSERT INTO crm_contacts (
                    id, code, name, contact_type, tax_code, industry, contact_person,
                    phone, email, address, bank_account, credit_limit, total_value,
                    debt_balance, tier, account_manager, status, created_by, created_at, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?19)",
                params![
                    id,
                    code,
                    contact.name,
                    contact.contact_type,
                    contact.tax_code,
                    contact.industry,
                    contact.contact_person,
                    encrypt_field(&contact.phone, crypto)?,
                    encrypt_field(&contact.email, crypto)?,
                    encrypt_field(&contact.address, crypto)?,
                    encrypt_field(&contact.bank_account, crypto)?,
                    contact.credit_limit,
                    contact.total_value,
                    contact.debt_balance,
                    contact.tier,
                    contact.account_manager,
                    contact.status,
                    actor.id,
                    timestamp,
                ],
            )
            .map_err(ApiError::internal)?;
        created = Some(code);
        break;
    }
    let code = created.ok_or_else(|| ApiError::conflict("Không thể tạo mã liên hệ duy nhất."))?;
    let row = transaction
        .query_row(
            "SELECT id, code, name, contact_type, tax_code, industry, contact_person,
                    phone, email, address, bank_account, credit_limit, total_value,
                    debt_balance, tier, account_manager, status, created_at, updated_at,
                    CASE WHEN EXISTS(
                        SELECT 1 FROM crm_contact_import_rows i
                        WHERE i.target_contact_id = crm_contacts.id
                    ) THEN 'unverified' ELSE NULL END
             FROM crm_contacts WHERE id = ?1",
            params![id],
            stored_contact_from_row,
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::internal("CRM contact insert did not persist"))?;
    transaction.commit().map_err(ApiError::internal)?;
    let response = public_contact(row, Some(crypto))?;
    debug_assert_eq!(response.code, code);
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "contact": response })),
    ))
}

pub(super) async fn list_supplier_evaluations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let records = read_crm_scope::<SupplierEvaluation>(&db, "crm_supplier_evaluations")?;
    Ok(Json(json!({ "data": records })))
}

pub(super) async fn create_supplier_evaluation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateSupplierEvaluationInput>,
) -> ApiResult<(axum::http::StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let mut input = input;
    if input.eval_code.trim().is_empty() {
        input.eval_code = generated_crm_code("NCC-DG");
    }
    let mut evaluation = validate_supplier_evaluation(input)?;
    evaluation
        .extra
        .insert("createdBy".to_owned(), Value::String(actor.id));
    evaluation.extra.insert(
        "createdAt".to_owned(),
        Value::String(Utc::now().to_rfc3339()),
    );
    insert_crm_record(
        &state,
        "crm_supplier_evaluations",
        &evaluation.key,
        "evalCode",
        &evaluation.eval_code,
        &evaluation,
    )
    .await?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "evaluation": evaluation })),
    ))
}

pub(super) async fn list_customer_feedback(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let records = read_crm_scope::<CustomerFeedback>(&db, "crm_feedback")?;
    let feedback = records
        .into_iter()
        .map(|record| public_feedback(record, state.crm_crypto.as_ref()))
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": feedback })))
}

pub(super) async fn create_customer_feedback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateCustomerFeedbackInput>,
) -> ApiResult<(axum::http::StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let crypto = state.crm_crypto.as_ref().ok_or_else(|| {
        ApiError::service_unavailable(
            "Chưa cấu hình khóa mã hóa CRM; không thể lưu phản ánh an toàn.",
        )
    })?;
    let mut input = input;
    if input.feedback_code.trim().is_empty() {
        input.feedback_code = generated_crm_code("FB");
    }
    let mut feedback = validate_customer_feedback(input, crypto)?;
    feedback
        .extra
        .insert("createdBy".to_owned(), Value::String(actor.id));
    feedback.extra.insert(
        "createdAt".to_owned(),
        Value::String(Utc::now().to_rfc3339()),
    );
    insert_crm_record(
        &state,
        "crm_feedback",
        &feedback.key,
        "feedbackCode",
        &feedback.feedback_code,
        &feedback,
    )
    .await?;
    let response = public_feedback(feedback, Some(crypto))?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "feedback": response })),
    ))
}

pub(super) async fn resolve_customer_feedback(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(feedback_key): axum::extract::Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let crypto = state.crm_crypto.as_ref().ok_or_else(|| {
        ApiError::service_unavailable(
            "Chưa cấu hình khóa mã hóa CRM; không thể xử lý phản ánh an toàn.",
        )
    })?;
    if feedback_key.trim().is_empty() || feedback_key.len() > 160 {
        return Err(ApiError::bad_request("Mã phản ánh không hợp lệ."));
    }
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let stored: Option<String> = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = 'crm_feedback' AND record_key = ?1",
            params![feedback_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(stored) = stored else {
        return Err(ApiError::not_found("Không tìm thấy phản ánh khách hàng."));
    };
    let mut feedback: CustomerFeedback =
        serde_json::from_str(&stored).map_err(ApiError::internal)?;
    if feedback.status != "Đang xử lý" {
        return Err(ApiError::conflict("Phản ánh đã được giải quyết trước đó."));
    }
    feedback.status = "Đã giải quyết thỏa đáng".to_owned();
    feedback.resolved_date = Some(Utc::now().format("%Y-%m-%d").to_string());
    feedback
        .extra
        .insert("resolvedBy".to_owned(), Value::String(actor.id));
    feedback.extra.insert(
        "resolvedAt".to_owned(),
        Value::String(Utc::now().to_rfc3339()),
    );
    let updated = serde_json::to_string(&feedback).map_err(ApiError::internal)?;
    let changed = transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = 'crm_feedback' AND record_key = ?3",
            params![updated, Utc::now().to_rfc3339(), feedback_key],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::not_found("Không tìm thấy phản ánh khách hàng."));
    }
    transaction.commit().map_err(ApiError::internal)?;
    let feedback = public_feedback(feedback, Some(crypto))?;
    Ok(Json(json!({ "feedback": feedback })))
}

pub(super) async fn preview_legacy_operations_import(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let request: CrmLegacyImportPreviewRequest = parse_crm_legacy_import_request(&body)?;
    validate_crm_legacy_bundle(&request.bundle)?;
    let crypto = require_crm_crypto(&state)?;
    let db = state.db.lock().await;
    let plan = build_crm_legacy_import_plan(&db, &request.bundle, crypto)?;
    let source_records = plan.records.len();
    let confirmation_phrase =
        crm_legacy_confirmation_phrase(&request.bundle.batch_id, source_records);
    let can_apply = plan.importable_records > 0 && plan.conflicted_records == 0;
    Ok(Json(json!({ "preview": CrmLegacyImportPreview {
        batch_id: request.bundle.batch_id,
        payload_sha256: plan.payload_sha256,
        confirmation_phrase,
        source_records,
        importable_records: plan.importable_records,
        already_imported_records: plan.already_imported_records,
        conflicted_records: plan.conflicted_records,
        supplier_evaluation_records: plan.supplier_evaluation_records,
        customer_feedback_records: plan.customer_feedback_records,
        can_apply,
    }})))
}

pub(super) async fn apply_legacy_operations_import(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let request: CrmLegacyImportApplyRequest = parse_crm_legacy_import_request(&body)?;
    validate_crm_legacy_bundle(&request.bundle)?;
    let crypto = require_crm_crypto(&state)?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let plan = build_crm_legacy_import_plan(&transaction, &request.bundle, crypto)?;
    if request.expected_payload_sha256 != plan.payload_sha256 {
        return Err(ApiError::conflict(
            "Gói legacy hoặc dữ liệu đích đã đổi sau khi xem trước. Hãy xem trước lại trước khi áp dụng.",
        ));
    }
    let source_records = plan.records.len();
    let expected_confirmation =
        crm_legacy_confirmation_phrase(&request.bundle.batch_id, source_records);
    if request.confirmation.trim() != expected_confirmation {
        return Err(ApiError::unprocessable(format!(
            "Cụm xác nhận chưa chính xác. Hãy nhập: {expected_confirmation}"
        )));
    }
    if plan.importable_records == 0 || plan.conflicted_records > 0 {
        return Err(ApiError::conflict(
            "Lô có xung đột hoặc không còn bản ghi mới để nhập. Không có dữ liệu nào được ghi.",
        ));
    }
    let prior_run: Option<String> = transaction
        .query_row(
            "SELECT batch_id FROM crm_legacy_import_runs WHERE batch_id=?1",
            params![request.bundle.batch_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    if prior_run.is_some() {
        return Err(ApiError::conflict("Lô CRM này đã được áp dụng trước đó."));
    }

    let imported_at = Utc::now().to_rfc3339();
    // Create the parent audit row first because each imported provenance row has a
    // restrictive foreign key to this batch. The surrounding transaction keeps
    // the audit and all target writes atomic.
    transaction
        .execute(
            "INSERT INTO crm_legacy_import_runs
             (batch_id,actor_user_id,source_origin,exported_at,imported_at,payload_sha256,
              imported_records,already_imported_records)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                request.bundle.batch_id,
                actor.id,
                request.bundle.source_origin,
                request.bundle.exported_at,
                imported_at,
                plan.payload_sha256,
                plan.importable_records,
                plan.already_imported_records,
            ],
        )
        .map_err(|_| ApiError::conflict("Không thể ghi audit lô CRM; giao dịch đã bị hủy."))?;

    for record in &plan.records {
        if record.outcome != CrmLegacyPlanOutcome::Import {
            continue;
        }
        let normalized_source = record
            .planned_json
            .as_deref()
            .ok_or_else(|| ApiError::internal("CRM import plan is missing normalized record"))?;
        let mut normalized_value: Value =
            serde_json::from_str(normalized_source).map_err(ApiError::internal)?;
        if let Some(fields) = normalized_value.as_object_mut() {
            fields.insert("createdBy".to_owned(), Value::String(actor.id.clone()));
            fields.insert("createdAt".to_owned(), Value::String(imported_at.clone()));
            fields.insert("updatedAt".to_owned(), Value::String(imported_at.clone()));
            fields.insert(
                "legacyImportedBy".to_owned(),
                Value::String(actor.id.clone()),
            );
            fields.insert(
                "legacyImportedAt".to_owned(),
                Value::String(imported_at.clone()),
            );
        }
        let normalized_json =
            serde_json::to_string(&normalized_value).map_err(ApiError::internal)?;
        let encrypted_source = encrypt_field(&record.raw_record.to_string(), crypto)?;
        transaction
            .execute(
                "INSERT INTO collection_records(scope,record_key,record_json,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?4)",
                params![
                    record.scope,
                    record.stable_key,
                    normalized_json,
                    imported_at
                ],
            )
            .map_err(|_| {
                ApiError::conflict(
                    "Scope CRM đích đã đổi trong lúc nhập; toàn bộ giao dịch đã bị hủy.",
                )
            })?;
        transaction
            .execute(
                "INSERT INTO crm_legacy_import_rows
                 (source_key_sha256,scope,batch_id,record_key,source_payload_sha256,
                  legacy_payload_enc,created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![
                    record.source_key_sha256,
                    record.scope,
                    request.bundle.batch_id,
                    record.stable_key,
                    record.source_payload_sha256,
                    encrypted_source,
                    imported_at,
                ],
            )
            .map_err(|_| {
                ApiError::conflict("Nguồn CRM đã được nhập đồng thời; toàn bộ giao dịch đã bị hủy.")
            })?;
    }

    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "import": CrmLegacyImportResult {
            batch_id: request.bundle.batch_id,
            imported_records: plan.importable_records,
            already_imported_records: plan.already_imported_records,
            imported_at,
        }})),
    ))
}

pub(super) async fn preview_legacy_contacts_import(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let request: CrmContactImportPreviewRequest = parse_crm_legacy_import_request(&body)?;
    validate_crm_contacts_bundle(&request.bundle)?;
    let crypto = require_crm_crypto(&state)?;
    let db = state.db.lock().await;
    let plan = build_crm_contact_import_plan(&db, &request.bundle, crypto)?;
    let source_records = plan.records.len();
    let can_apply = plan.importable_records > 0 && plan.conflicted_records == 0;
    let confirmation_phrase =
        crm_contact_import_confirmation_phrase(&request.bundle.batch_id, source_records);
    Ok(Json(json!({ "preview": CrmContactImportPreview {
        batch_id: request.bundle.batch_id,
        source_database_id: request.bundle.source_database_id,
        payload_sha256: plan.payload_sha256,
        confirmation_phrase,
        source_records,
        importable_records: plan.importable_records,
        already_imported_records: plan.already_imported_records,
        conflicted_records: plan.conflicted_records,
        customer_records: plan.customer_records,
        supplier_records: plan.supplier_records,
        partner_records: plan.partner_records,
        can_apply,
    }})))
}

pub(super) async fn apply_legacy_contacts_import(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let request: CrmContactImportApplyRequest = parse_crm_legacy_import_request(&body)?;
    validate_crm_contacts_bundle(&request.bundle)?;
    let crypto = require_crm_crypto(&state)?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let plan = build_crm_contact_import_plan(&transaction, &request.bundle, crypto)?;
    if request.expected_payload_sha256 != plan.payload_sha256 {
        return Err(ApiError::conflict(
            "Gói contacts legacy hoặc danh bạ đích đã đổi sau khi xem trước. Hãy xem trước lại.",
        ));
    }
    let source_records = plan.records.len();
    let expected_confirmation =
        crm_contact_import_confirmation_phrase(&request.bundle.batch_id, source_records);
    if request.confirmation.trim() != expected_confirmation {
        return Err(ApiError::unprocessable(format!(
            "Cụm xác nhận chưa chính xác. Hãy nhập: {expected_confirmation}"
        )));
    }
    if plan.importable_records == 0 || plan.conflicted_records > 0 {
        return Err(ApiError::conflict(
            "Lô contacts có xung đột hoặc không còn dữ liệu mới. Không có liên hệ nào được ghi.",
        ));
    }
    let prior_run: Option<String> = transaction
        .query_row(
            "SELECT batch_id FROM crm_contact_import_runs WHERE batch_id=?1",
            params![request.bundle.batch_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    if prior_run.is_some() {
        return Err(ApiError::conflict(
            "Lô contacts CRM đã được áp dụng trước đó.",
        ));
    }

    let imported_at = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO crm_contact_import_runs
             (batch_id,actor_user_id,source_database_id,exported_at,imported_at,payload_sha256,
              imported_records,already_imported_records)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                request.bundle.batch_id,
                actor.id,
                request.bundle.source_database_id,
                request.bundle.exported_at,
                imported_at,
                plan.payload_sha256,
                plan.importable_records,
                plan.already_imported_records,
            ],
        )
        .map_err(|_| ApiError::conflict("Không thể ghi audit lô contacts; transaction đã hủy."))?;

    for source in &plan.records {
        if source.outcome != CrmLegacyPlanOutcome::Import {
            continue;
        }
        let planned = source
            .planned
            .as_ref()
            .ok_or_else(|| ApiError::internal("CRM contact import plan is missing a row"))?;
        let archived_source = encrypt_field(&source.raw_record.to_string(), crypto)?;
        transaction
            .execute(
                "INSERT INTO crm_contacts (
                    id,code,name,contact_type,tax_code,industry,contact_person,phone,email,address,
                    bank_account,credit_limit,total_value,debt_balance,tier,account_manager,status,
                    created_by,created_at,updated_at
                 ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)",
                params![
                    planned.id,
                    planned.code,
                    planned.contact.name,
                    planned.contact.contact_type,
                    planned.contact.tax_code,
                    planned.contact.industry,
                    planned.contact.contact_person,
                    encrypt_field(&planned.contact.phone, crypto)?,
                    encrypt_field(&planned.contact.email, crypto)?,
                    encrypt_field(&planned.contact.address, crypto)?,
                    encrypt_field(&planned.contact.bank_account, crypto)?,
                    planned.contact.credit_limit,
                    planned.contact.total_value,
                    planned.contact.debt_balance,
                    planned.contact.tier,
                    planned.contact.account_manager,
                    planned.contact.status,
                    actor.id,
                    planned.created_at,
                    planned.updated_at,
                ],
            )
            .map_err(|_| {
                ApiError::conflict(
                    "Danh bạ CRM đích đã đổi trong lúc nhập; toàn bộ transaction đã hủy.",
                )
            })?;
        transaction
            .execute(
                "INSERT INTO crm_contact_import_rows
                 (source_key_sha256,source_payload_sha256,source_contact_id,target_contact_id,
                  batch_id,legacy_payload_enc,created_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![
                    source.source_key_sha256,
                    source.source_payload_sha256,
                    source.id,
                    planned.id,
                    request.bundle.batch_id,
                    archived_source,
                    imported_at,
                ],
            )
            .map_err(|_| {
                ApiError::conflict(
                    "Nguồn contact CRM đã được nhập đồng thời; toàn bộ transaction đã hủy.",
                )
            })?;
    }

    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "import": CrmContactImportResult {
            batch_id: request.bundle.batch_id,
            imported_records: plan.importable_records,
            already_imported_records: plan.already_imported_records,
            imported_at,
        }})),
    ))
}

fn require_crm_crypto(state: &AppState) -> ApiResult<&CrmCrypto> {
    state.crm_crypto.as_ref().ok_or_else(|| {
        ApiError::service_unavailable(
            "Chưa cấu hình khóa mã hóa CRM; không thể xem trước hoặc nhập dữ liệu nhạy cảm.",
        )
    })
}

fn parse_crm_legacy_import_request<T: for<'de> Deserialize<'de>>(body: &[u8]) -> ApiResult<T> {
    if body.len() > CRM_LEGACY_IMPORT_MAX_BODY_BYTES {
        return Err(ApiError::bad_request(
            "Tệp nhập CRM vượt quá giới hạn 8 MiB.",
        ));
    }
    serde_json::from_slice(body)
        .map_err(|_| ApiError::bad_request("JSON nhập CRM không hợp lệ hoặc không đúng cấu trúc."))
}

fn validate_crm_legacy_bundle(bundle: &CrmLegacyOperationsBundle) -> ApiResult<usize> {
    if bundle.format != CRM_LEGACY_IMPORT_FORMAT || bundle.schema_version != 1 {
        return Err(ApiError::unprocessable(
            "Định dạng hoặc phiên bản gói CRM legacy không được hỗ trợ.",
        ));
    }
    let batch_id = Uuid::parse_str(&bundle.batch_id)
        .map_err(|_| ApiError::unprocessable("Mã lô nhập phải là UUID hợp lệ."))?;
    if batch_id.to_string() != bundle.batch_id {
        return Err(ApiError::unprocessable(
            "Mã lô nhập phải là UUID chữ thường ở dạng chuẩn.",
        ));
    }
    validate_crm_import_origin(&bundle.source_origin)?;
    chrono::DateTime::parse_from_rfc3339(&bundle.exported_at)
        .map_err(|_| ApiError::unprocessable("Thời điểm xuất phải là RFC 3339."))?;
    let total = bundle
        .supplier_evaluations
        .len()
        .checked_add(bundle.customer_feedback.len())
        .filter(|total| *total > 0 && *total <= CRM_LEGACY_IMPORT_MAX_RECORDS)
        .ok_or_else(|| {
            ApiError::unprocessable(format!(
                "Gói phải có từ 1 đến {CRM_LEGACY_IMPORT_MAX_RECORDS} bản ghi CRM."
            ))
        })?;
    for (scope, records) in [
        (CRM_LEGACY_IMPORT_SCOPES[0], &bundle.supplier_evaluations),
        (CRM_LEGACY_IMPORT_SCOPES[1], &bundle.customer_feedback),
    ] {
        let mut keys = std::collections::HashSet::new();
        for record in records {
            if !record.is_object() || record.to_string().len() > 64 * 1024 {
                return Err(ApiError::unprocessable(
                    "Một bản ghi CRM không hợp lệ hoặc vượt quá 64 KiB.",
                ));
            }
            let key = record
                .get("key")
                .and_then(Value::as_str)
                .filter(|key| {
                    !key.is_empty()
                        && key.trim() == *key
                        && key.len() <= 256
                        && !key.chars().any(char::is_control)
                })
                .ok_or_else(|| {
                    ApiError::unprocessable(format!(
                        "Mỗi bản ghi trong '{scope}' phải có key dạng chuỗi ổn định."
                    ))
                })?;
            if !keys.insert(key) {
                return Err(ApiError::unprocessable(format!(
                    "Collection '{scope}' có key trùng lặp."
                )));
            }
        }
    }
    Ok(total)
}

fn validate_crm_import_origin(origin: &str) -> ApiResult<()> {
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

fn validate_crm_contacts_bundle(bundle: &CrmLegacyContactsBundle) -> ApiResult<()> {
    if bundle.format != CRM_CONTACT_IMPORT_FORMAT || bundle.schema_version != 1 {
        return Err(ApiError::unprocessable(
            "Định dạng hoặc phiên bản gói contacts legacy không được hỗ trợ.",
        ));
    }
    let batch_id = Uuid::parse_str(&bundle.batch_id)
        .map_err(|_| ApiError::unprocessable("Mã lô contacts phải là UUID hợp lệ."))?;
    if batch_id.to_string() != bundle.batch_id {
        return Err(ApiError::unprocessable(
            "Mã lô contacts phải là UUID chữ thường ở dạng chuẩn.",
        ));
    }
    if bundle.source_database_id.is_empty()
        || bundle.source_database_id.len() > 64
        || !bundle
            .source_database_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return Err(ApiError::unprocessable(
            "sourceDatabaseId chỉ được dùng chữ ASCII, số, dấu chấm, gạch ngang hoặc gạch dưới.",
        ));
    }
    chrono::DateTime::parse_from_rfc3339(&bundle.exported_at)
        .map_err(|_| ApiError::unprocessable("Thời điểm xuất phải là RFC 3339."))?;
    if bundle.contacts.is_empty() || bundle.contacts.len() > CRM_CONTACT_IMPORT_MAX_RECORDS {
        return Err(ApiError::unprocessable(format!(
            "Gói phải có từ 1 đến {CRM_CONTACT_IMPORT_MAX_RECORDS} liên hệ CRM."
        )));
    }
    let mut ids = std::collections::HashSet::new();
    for record in &bundle.contacts {
        if !record.is_object() || record.to_string().len() > 64 * 1024 {
            return Err(ApiError::unprocessable(
                "Một liên hệ CRM không hợp lệ hoặc vượt quá 64 KiB.",
            ));
        }
        let id = record
            .get("id")
            .and_then(Value::as_str)
            .filter(|id| {
                !id.is_empty()
                    && id.trim() == *id
                    && id.len() <= 256
                    && !id.chars().any(char::is_control)
            })
            .ok_or_else(|| {
                ApiError::unprocessable(
                    "Mỗi contact cần có id ổn định dạng chuỗi để bảo toàn khóa legacy.",
                )
            })?;
        if !ids.insert(id) {
            return Err(ApiError::unprocessable(
                "Gói contacts có id trùng lặp; chưa ghi dữ liệu.",
            ));
        }
    }
    Ok(())
}

fn crm_contact_import_confirmation_phrase(batch_id: &str, record_count: usize) -> String {
    format!(
        "IMPORT-CRM-CONTACTS-{}-{record_count}",
        &batch_id[..8].to_ascii_uppercase()
    )
}

fn build_crm_contact_import_plan(
    db: &rusqlite::Connection,
    bundle: &CrmLegacyContactsBundle,
    crypto: &CrmCrypto,
) -> ApiResult<CrmContactImportPlan> {
    let mut imported_sources = std::collections::HashMap::<String, (String, String)>::new();
    {
        let mut statement = db
            .prepare(
                "SELECT source_key_sha256,source_payload_sha256,target_contact_id
                 FROM crm_contact_import_rows",
            )
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(ApiError::internal)?;
        for row in rows {
            let (source_key, payload_hash, target_id) = row.map_err(ApiError::internal)?;
            imported_sources.insert(source_key, (payload_hash, target_id));
        }
    }

    let mut target_ids = std::collections::HashSet::<String>::new();
    let mut target_codes = std::collections::HashSet::<String>::new();
    let mut target_fingerprints = Vec::<(String, String, String)>::new();
    {
        let mut statement = db
            .prepare(
                "SELECT id,code,name,contact_type,tax_code,industry,contact_person,phone,email,
                        address,bank_account,credit_limit,total_value,debt_balance,tier,
                        account_manager,status,created_at,updated_at
                 FROM crm_contacts ORDER BY id",
            )
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| {
                let fingerprint = json!([
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, String>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, String>(10)?,
                    row.get::<_, i64>(11)?,
                    row.get::<_, i64>(12)?,
                    row.get::<_, i64>(13)?,
                    row.get::<_, String>(14)?,
                    row.get::<_, String>(15)?,
                    row.get::<_, String>(16)?,
                    row.get::<_, String>(17)?,
                    row.get::<_, String>(18)?,
                ]);
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    fingerprint,
                ))
            })
            .map_err(ApiError::internal)?;
        for row in rows {
            let (id, code, fingerprint) = row.map_err(ApiError::internal)?;
            target_ids.insert(id.clone());
            target_codes.insert(code.to_lowercase());
            target_fingerprints.push((
                id,
                code.to_lowercase(),
                digest_bytes(&serde_json::to_vec(&fingerprint).map_err(ApiError::internal)?),
            ));
        }
    }

    let mut contacts = bundle.contacts.iter().collect::<Vec<_>>();
    contacts.sort_by(|left, right| {
        left.get("id")
            .and_then(Value::as_str)
            .cmp(&right.get("id").and_then(Value::as_str))
    });
    let mut records = Vec::with_capacity(contacts.len());
    let mut importable_records = 0;
    let mut already_imported_records = 0;
    let mut conflicted_records = 0;
    let mut customer_records = 0;
    let mut supplier_records = 0;
    let mut partner_records = 0;
    let mut outcome_fingerprints = Vec::with_capacity(contacts.len());
    for raw_record in contacts {
        let id = raw_record
            .get("id")
            .and_then(Value::as_str)
            .expect("validated legacy CRM contact id")
            .to_owned();
        match raw_record.get("type").and_then(Value::as_str) {
            Some("customer") => customer_records += 1,
            Some("supplier") => supplier_records += 1,
            Some("partner") => partner_records += 1,
            _ => {}
        }
        let source_key_sha256 =
            digest_bytes(format!("{}\0{}", bundle.source_database_id, id).as_bytes());
        let raw_json = serde_json::to_string(raw_record).map_err(ApiError::internal)?;
        let source_payload_sha256 = digest_bytes(raw_json.as_bytes());
        let (planned, outcome) =
            if let Some((previous_payload, target_id)) = imported_sources.get(&source_key_sha256) {
                if previous_payload == &source_payload_sha256 && target_ids.contains(target_id) {
                    (None, CrmLegacyPlanOutcome::AlreadyImported)
                } else {
                    (None, CrmLegacyPlanOutcome::Conflict)
                }
            } else {
                match normalize_crm_contact_import(raw_record, crypto) {
                    Ok(planned) => {
                        let code_key = planned.code.to_lowercase();
                        if target_ids.contains(&planned.id) || target_codes.contains(&code_key) {
                            (Some(planned), CrmLegacyPlanOutcome::Conflict)
                        } else {
                            target_ids.insert(planned.id.clone());
                            target_codes.insert(code_key);
                            (Some(planned), CrmLegacyPlanOutcome::Import)
                        }
                    }
                    Err(_) => (None, CrmLegacyPlanOutcome::Conflict),
                }
            };
        match outcome {
            CrmLegacyPlanOutcome::Import => importable_records += 1,
            CrmLegacyPlanOutcome::AlreadyImported => already_imported_records += 1,
            CrmLegacyPlanOutcome::Conflict => conflicted_records += 1,
        }
        let planned_code = planned
            .as_ref()
            .map(|record| record.code.clone())
            .unwrap_or_default();
        outcome_fingerprints.push((
            source_key_sha256.clone(),
            source_payload_sha256.clone(),
            format!("{outcome:?}"),
            planned_code,
        ));
        records.push(CrmContactImportSourceRecord {
            id,
            source_key_sha256,
            source_payload_sha256,
            raw_record: raw_record.clone(),
            planned,
            outcome,
        });
    }
    let fingerprint = json!({
        "bundle": bundle,
        "targetContacts": target_fingerprints,
        "sourceOutcomes": outcome_fingerprints,
    });
    Ok(CrmContactImportPlan {
        records,
        payload_sha256: digest_bytes(
            &serde_json::to_vec(&fingerprint).map_err(ApiError::internal)?,
        ),
        importable_records,
        already_imported_records,
        conflicted_records,
        customer_records,
        supplier_records,
        partner_records,
    })
}

fn normalize_crm_contact_import(
    raw: &Value,
    crypto: &CrmCrypto,
) -> ApiResult<CrmContactImportWrite> {
    let id = raw
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| {
            !id.is_empty()
                && id.trim() == *id
                && id.len() <= 256
                && !id.chars().any(char::is_control)
        })
        .ok_or_else(|| ApiError::unprocessable("Legacy contact id is invalid."))?
        .to_owned();
    let code = required_text(raw.get("code").unwrap_or(&Value::Null), "Mã đối tác", 80)?;
    let created_at = legacy_contact_timestamp(raw, "createdAt")?;
    let updated_at = legacy_contact_timestamp(raw, "updatedAt")?;
    let decrypted_field = |field: &str| -> ApiResult<String> {
        let stored = raw.get(field).and_then(Value::as_str).unwrap_or_default();
        decrypt_field(stored, Some(crypto))
    };
    let input = CreateContactInput {
        contact_type: raw.get("type").cloned().unwrap_or(Value::Null),
        name: raw.get("name").cloned().unwrap_or(Value::Null),
        tax_code: raw.get("taxCode").cloned().unwrap_or(Value::Null),
        industry: raw.get("industry").cloned().unwrap_or(Value::Null),
        contact_person: raw.get("contactPerson").cloned().unwrap_or(Value::Null),
        phone: Value::String(decrypted_field("phone")?),
        email: Value::String(decrypted_field("email")?),
        address: Value::String(decrypted_field("address")?),
        bank_account: Value::String(decrypted_field("bankAccount")?),
        credit_limit: raw.get("creditLimit").cloned().unwrap_or(Value::Null),
        total_value: raw.get("totalValue").cloned().unwrap_or(Value::Null),
        debt_balance: raw.get("debtBalance").cloned().unwrap_or(Value::Null),
        tier: raw.get("tier").cloned().unwrap_or(Value::Null),
        account_manager: raw.get("accountManager").cloned().unwrap_or(Value::Null),
        status: raw.get("status").cloned().unwrap_or(Value::Null),
    };
    Ok(CrmContactImportWrite {
        id,
        code,
        contact: validate_contact(input)?,
        created_at,
        updated_at,
    })
}

fn legacy_contact_timestamp(raw: &Value, field: &str) -> ApiResult<String> {
    let value = raw
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty() && value.len() <= 64)
        .ok_or_else(|| ApiError::unprocessable("Legacy contact timestamp is invalid."))?;
    chrono::DateTime::parse_from_rfc3339(value)
        .map_err(|_| ApiError::unprocessable("Legacy contact timestamp is invalid."))?;
    Ok(value.to_owned())
}

fn build_crm_legacy_import_plan(
    db: &rusqlite::Connection,
    bundle: &CrmLegacyOperationsBundle,
    crypto: &CrmCrypto,
) -> ApiResult<CrmLegacyImportPlan> {
    let mut sources =
        Vec::with_capacity(bundle.supplier_evaluations.len() + bundle.customer_feedback.len());
    for raw_record in &bundle.supplier_evaluations {
        sources.push((CRM_LEGACY_IMPORT_SCOPES[0], raw_record));
    }
    for raw_record in &bundle.customer_feedback {
        sources.push((CRM_LEGACY_IMPORT_SCOPES[1], raw_record));
    }
    sources.sort_by(|(left_scope, left), (right_scope, right)| {
        left_scope.cmp(right_scope).then_with(|| {
            left.get("key")
                .and_then(Value::as_str)
                .cmp(&right.get("key").and_then(Value::as_str))
        })
    });

    let mut imported_sources = std::collections::HashMap::<String, String>::new();
    {
        let mut statement = db
            .prepare("SELECT source_key_sha256,source_payload_sha256 FROM crm_legacy_import_rows")
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(ApiError::internal)?;
        for row in rows {
            let (key, payload) = row.map_err(ApiError::internal)?;
            imported_sources.insert(key, payload);
        }
    }

    let mut target_keys = std::collections::HashSet::<(String, String)>::new();
    let mut target_codes =
        std::collections::HashMap::<String, std::collections::HashSet<String>>::new();
    let mut target_fingerprints = Vec::<(String, String, String)>::new();
    for scope in CRM_LEGACY_IMPORT_SCOPES {
        let mut statement = db
            .prepare(
                "SELECT record_key,record_json FROM collection_records WHERE scope=?1 ORDER BY record_key",
            )
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map(params![scope], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(ApiError::internal)?;
        for row in rows {
            let (key, serialized) = row.map_err(ApiError::internal)?;
            let value: Value = serde_json::from_str(&serialized).map_err(ApiError::internal)?;
            target_keys.insert((scope.to_owned(), key.clone()));
            if let Some(code) = legacy_code_field(scope)
                .and_then(|field| value.get(field))
                .and_then(Value::as_str)
                .filter(|code| !code.trim().is_empty())
            {
                target_codes
                    .entry(scope.to_owned())
                    .or_default()
                    .insert(code.trim().to_lowercase());
            }
            target_fingerprints.push((scope.to_owned(), key, digest_bytes(serialized.as_bytes())));
        }
    }

    let mut records = Vec::with_capacity(sources.len());
    let mut importable_records = 0usize;
    let mut already_imported_records = 0usize;
    let mut conflicted_records = 0usize;
    let mut seen_codes =
        std::collections::HashMap::<String, std::collections::HashSet<String>>::new();
    let mut outcome_fingerprints = Vec::with_capacity(sources.len());
    for (scope, raw_record) in sources {
        let stable_key = raw_record
            .get("key")
            .and_then(Value::as_str)
            .expect("validated CRM legacy key")
            .to_owned();
        let source_key_sha256 =
            digest_bytes(format!("{scope}\0{}\0{stable_key}", bundle.source_origin).as_bytes());
        let raw_json = serde_json::to_string(raw_record).map_err(ApiError::internal)?;
        let source_payload_sha256 = digest_bytes(raw_json.as_bytes());
        let mut planned_json = None;
        let mut planned_code = None;
        let mut outcome = if let Some(previous_payload) = imported_sources.get(&source_key_sha256) {
            if previous_payload == &source_payload_sha256 {
                CrmLegacyPlanOutcome::AlreadyImported
            } else {
                CrmLegacyPlanOutcome::Conflict
            }
        } else {
            match normalize_crm_legacy_record(scope, raw_record, &source_key_sha256, crypto) {
                Ok((record_key, code, normalized_json)) => {
                    planned_json = Some(normalized_json);
                    planned_code = Some(code);
                    if target_keys.contains(&(scope.to_owned(), record_key)) {
                        CrmLegacyPlanOutcome::Conflict
                    } else {
                        CrmLegacyPlanOutcome::Import
                    }
                }
                Err(_) => CrmLegacyPlanOutcome::Conflict,
            }
        };
        if outcome == CrmLegacyPlanOutcome::Import {
            let code = planned_code.as_deref().expect("normalized CRM code");
            let existing_codes = target_codes.entry(scope.to_owned()).or_default();
            let batch_codes = seen_codes.entry(scope.to_owned()).or_default();
            let normalized_code = code.to_lowercase();
            if existing_codes.contains(&normalized_code)
                || !batch_codes.insert(normalized_code.clone())
            {
                outcome = CrmLegacyPlanOutcome::Conflict;
            } else {
                existing_codes.insert(normalized_code);
            }
        }
        match outcome {
            CrmLegacyPlanOutcome::Import => importable_records += 1,
            CrmLegacyPlanOutcome::AlreadyImported => already_imported_records += 1,
            CrmLegacyPlanOutcome::Conflict => conflicted_records += 1,
        }
        outcome_fingerprints.push((
            source_key_sha256.clone(),
            source_payload_sha256.clone(),
            format!("{outcome:?}"),
            planned_code.unwrap_or_default(),
        ));
        records.push(CrmLegacySourceRecord {
            scope,
            stable_key,
            source_key_sha256,
            source_payload_sha256,
            raw_record: raw_record.clone(),
            planned_json,
            outcome,
        });
    }
    let fingerprint = json!({
        "bundle": bundle,
        "targetRecords": target_fingerprints,
        "sourceOutcomes": outcome_fingerprints,
    });
    Ok(CrmLegacyImportPlan {
        records,
        payload_sha256: digest_bytes(
            &serde_json::to_vec(&fingerprint).map_err(ApiError::internal)?,
        ),
        importable_records,
        already_imported_records,
        conflicted_records,
        supplier_evaluation_records: bundle.supplier_evaluations.len(),
        customer_feedback_records: bundle.customer_feedback.len(),
    })
}

fn normalize_crm_legacy_record(
    scope: &str,
    raw: &Value,
    source_key_sha256: &str,
    crypto: &CrmCrypto,
) -> ApiResult<(String, String, String)> {
    let key = raw
        .get("key")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::unprocessable("Legacy CRM key is missing."))?
        .to_owned();
    let code_field = legacy_code_field(scope)
        .ok_or_else(|| ApiError::unprocessable("Unsupported CRM legacy scope."))?;
    let existing_code = json_text(raw, code_field);
    let generated_code = match scope {
        "crm_supplier_evaluations" => format!("NCC-DG-LEGACY-{}", &source_key_sha256[..12]),
        "crm_feedback" => format!("FB-LEGACY-{}", &source_key_sha256[..12]),
        _ => return Err(ApiError::unprocessable("Unsupported CRM legacy scope.")),
    };
    let code = if existing_code.trim().is_empty() {
        generated_code
    } else {
        existing_code
    };
    let (mut normalized, mut ignored_fields) = if scope == "crm_supplier_evaluations" {
        let input = CreateSupplierEvaluationInput {
            eval_code: code.clone(),
            eval_period: json_text(raw, "evalPeriod"),
            supplier_name: json_text(raw, "supplierName"),
            category: json_text(raw, "category"),
            quality_score: json_integer(raw, "qualityScore")?,
            delivery_score: json_integer(raw, "deliveryScore")?,
            price_score: json_integer(raw, "priceScore")?,
            service_score: json_integer(raw, "serviceScore")?,
            evaluator: json_text(raw, "evaluator"),
            strengths: json_text(raw, "strengths"),
            weaknesses: json_text(raw, "weaknesses"),
            decision: raw
                .get("decision")
                .and_then(Value::as_str)
                .map(str::to_owned),
        };
        let mut evaluation = validate_supplier_evaluation(input)?;
        evaluation.key = key.clone();
        let ignored = legacy_extra_fields(
            raw,
            &[
                "key",
                "evalCode",
                "supplierName",
                "category",
                "qualityScore",
                "deliveryScore",
                "priceScore",
                "serviceScore",
                "totalScore",
                "tier",
                "evalPeriod",
                "evaluator",
                "strengths",
                "weaknesses",
                "decision",
                "createdBy",
                "createdAt",
                "updatedAt",
                "updatedBy",
            ],
        );
        (
            serde_json::to_value(evaluation).map_err(ApiError::internal)?,
            ignored,
        )
    } else {
        let input = CreateCustomerFeedbackInput {
            feedback_code: code.clone(),
            client_name: json_text(raw, "clientName"),
            contact_person: json_text(raw, "contactPerson"),
            phone: json_text(raw, "phone"),
            service_name: json_text(raw, "serviceName"),
            rating: json_integer(raw, "rating")?,
            content: json_text(raw, "content"),
            priority: json_text(raw, "priority"),
            resolution_action: json_text(raw, "resolutionAction"),
            assigned_staff: json_text(raw, "assignedStaff"),
        };
        let mut feedback = validate_customer_feedback(input, crypto)?;
        feedback.key = key.clone();
        feedback.received_date = raw
            .get("receivedDate")
            .and_then(Value::as_str)
            .filter(|date| chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_ok())
            .unwrap_or_default()
            .to_owned();
        // Legacy browser status, resolver and resolution time are retained only in encrypted source.
        feedback.status = "Đang xử lý".to_owned();
        feedback.resolved_date = None;
        let ignored = legacy_extra_fields(
            raw,
            &[
                "key",
                "feedbackCode",
                "clientName",
                "contactPerson",
                "phone",
                "serviceName",
                "rating",
                "content",
                "priority",
                "resolutionAction",
                "assignedStaff",
                "receivedDate",
                "resolvedDate",
                "status",
                "resolvedBy",
                "resolvedAt",
                "createdBy",
                "createdAt",
                "updatedAt",
                "updatedBy",
            ],
        );
        (
            serde_json::to_value(feedback).map_err(ApiError::internal)?,
            ignored,
        )
    };
    if let Some(extra) = normalized.as_object_mut() {
        for (field, value) in std::mem::take(&mut ignored_fields) {
            extra.entry(field).or_insert(value);
        }
        extra.insert(
            "legacyImportStatus".to_owned(),
            Value::String("unverified".to_owned()),
        );
        extra.insert(
            "legacySourceKeySha256".to_owned(),
            Value::String(source_key_sha256.to_owned()),
        );
    }
    Ok((
        key,
        code,
        serde_json::to_string(&normalized).map_err(ApiError::internal)?,
    ))
}

fn legacy_extra_fields(raw: &Value, known_fields: &[&str]) -> BTreeMap<String, Value> {
    let mut extra = raw
        .as_object()
        .map(|fields| {
            fields
                .iter()
                .filter(|(key, _)| !known_fields.contains(&key.as_str()))
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect::<BTreeMap<_, _>>()
        })
        .unwrap_or_default();
    // Source-side audit claims are intentionally not carried into active typed fields.
    for untrusted in ["approvedBy", "approvedAt", "signerName", "signedDate"] {
        extra.remove(untrusted);
    }
    extra
}

fn legacy_code_field(scope: &str) -> Option<&'static str> {
    match scope {
        "crm_supplier_evaluations" => Some("evalCode"),
        "crm_feedback" => Some("feedbackCode"),
        _ => None,
    }
}

fn json_text(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_owned()
}

fn json_integer(value: &Value, key: &str) -> ApiResult<i64> {
    value
        .get(key)
        .and_then(|value| {
            value.as_i64().or_else(|| {
                value
                    .as_str()
                    .and_then(|text| text.trim().parse::<i64>().ok())
            })
        })
        .ok_or_else(|| ApiError::unprocessable("Legacy CRM numeric field is invalid."))
}

fn digest_bytes(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn crm_legacy_confirmation_phrase(batch_id: &str, record_count: usize) -> String {
    format!(
        "IMPORT-CRM-{}-{record_count}",
        &batch_id[..8].to_ascii_uppercase()
    )
}

fn validate_supplier_evaluation(
    input: CreateSupplierEvaluationInput,
) -> ApiResult<SupplierEvaluation> {
    for (value, field, limit) in [
        (&input.eval_period, "Kỳ đánh giá", 120),
        (&input.supplier_name, "Nhà cung cấp", 200),
        (&input.evaluator, "Cán bộ đánh giá", 160),
    ] {
        validate_required_text(value, field, limit)?;
    }
    if input.eval_code.trim().encode_utf16().count() > 80 {
        return Err(ApiError::unprocessable(
            "Mã đánh giá vượt quá độ dài cho phép.",
        ));
    }
    for (value, field, limit) in [
        (&input.strengths, "Ưu điểm", 4_000),
        (&input.weaknesses, "Điểm cần cải thiện", 4_000),
    ] {
        if value.trim().encode_utf16().count() > limit {
            return Err(ApiError::unprocessable(format!(
                "{field} vượt quá độ dài cho phép."
            )));
        }
    }
    if input.category.trim().encode_utf16().count() > 200 {
        return Err(ApiError::unprocessable(
            "Lĩnh vực cung ứng vượt quá độ dài cho phép.",
        ));
    }
    for (score, label, maximum) in [
        (input.quality_score, "Chất lượng", 40),
        (input.delivery_score, "Tiến độ giao hàng", 30),
        (input.price_score, "Giá cả", 20),
        (input.service_score, "Dịch vụ", 10),
    ] {
        if !(0..=maximum).contains(&score) {
            return Err(ApiError::unprocessable(format!(
                "Điểm {label} phải nằm trong khoảng 0 đến {maximum}."
            )));
        }
    }
    let total_score =
        input.quality_score + input.delivery_score + input.price_score + input.service_score;
    let tier = if total_score >= 90 {
        "Hạng A (Chiến lược)"
    } else if total_score < 75 {
        "Hạng C (Cần cải thiện)"
    } else {
        "Hạng B (Đạt chuẩn)"
    }
    .to_owned();
    const DECISIONS: [&str; 4] = [
        "Duy trì đối tác chiến lược",
        "Gia hạn hợp đồng & đàm phán giá",
        "Yêu cầu khắc phục SLA trong 30 ngày",
        "Chấm dứt hợp tác",
    ];
    let decision = input.decision.filter(|value| !value.trim().is_empty());
    if decision
        .as_deref()
        .is_some_and(|value| !DECISIONS.contains(&value))
    {
        return Err(ApiError::unprocessable("Kết luận đánh giá không hợp lệ."));
    }
    let decision = decision.or_else(|| {
        Some(if total_score >= 90 {
            DECISIONS[0].to_owned()
        } else {
            DECISIONS[1].to_owned()
        })
    });
    Ok(SupplierEvaluation {
        key: Uuid::new_v4().to_string(),
        eval_code: input.eval_code.trim().to_owned(),
        supplier_name: input.supplier_name.trim().to_owned(),
        category: if input.category.trim().is_empty() {
            "Đường truyền & Hạ tầng Cloud".to_owned()
        } else {
            input.category.trim().to_owned()
        },
        quality_score: input.quality_score,
        delivery_score: input.delivery_score,
        price_score: input.price_score,
        service_score: input.service_score,
        total_score,
        tier,
        eval_period: input.eval_period.trim().to_owned(),
        evaluator: input.evaluator.trim().to_owned(),
        strengths: input.strengths.trim().to_owned(),
        weaknesses: input.weaknesses.trim().to_owned(),
        decision,
        extra: BTreeMap::new(),
    })
}

fn validate_customer_feedback(
    input: CreateCustomerFeedbackInput,
    crypto: &CrmCrypto,
) -> ApiResult<CustomerFeedback> {
    for (value, field, limit) in [
        (&input.client_name, "Tên khách hàng/đối tác", 220),
        (&input.contact_person, "Người phản ánh", 200),
        (&input.phone, "Số điện thoại", 32),
        (&input.service_name, "Dịch vụ liên quan", 220),
        (&input.content, "Nội dung phản ánh", 4_000),
        (&input.assigned_staff, "Cán bộ phụ trách", 160),
        (&input.resolution_action, "Biện pháp xử lý", 1_000),
    ] {
        if value.trim().encode_utf16().count() > limit {
            return Err(ApiError::unprocessable(format!(
                "{field} vượt quá độ dài cho phép."
            )));
        }
    }
    if input.feedback_code.trim().encode_utf16().count() > 80 {
        return Err(ApiError::unprocessable(
            "Mã phản ánh vượt quá độ dài cho phép.",
        ));
    }
    validate_required_text(&input.client_name, "Tên khách hàng/đối tác", 220)?;
    validate_required_text(&input.service_name, "Dịch vụ liên quan", 220)?;
    validate_required_text(&input.content, "Nội dung phản ánh", 4_000)?;
    validate_required_text(&input.assigned_staff, "Cán bộ phụ trách", 160)?;
    if !(1..=5).contains(&input.rating) {
        return Err(ApiError::unprocessable("Điểm hài lòng phải từ 1 đến 5."));
    }
    if !["Khẩn cấp", "Cao", "Trung bình"].contains(&input.priority.as_str()) {
        return Err(ApiError::unprocessable("Mức độ ưu tiên không hợp lệ."));
    }
    let phone = encrypt_field(input.phone.trim(), crypto)?;
    Ok(CustomerFeedback {
        key: Uuid::new_v4().to_string(),
        feedback_code: input.feedback_code.trim().to_owned(),
        client_name: input.client_name.trim().to_owned(),
        contact_person: input.contact_person.trim().to_owned(),
        phone,
        service_name: input.service_name.trim().to_owned(),
        rating: input.rating,
        content: input.content.trim().to_owned(),
        priority: input.priority,
        resolution_action: input.resolution_action.trim().to_owned(),
        assigned_staff: input.assigned_staff.trim().to_owned(),
        received_date: Utc::now().format("%Y-%m-%d").to_string(),
        resolved_date: None,
        status: "Đang xử lý".to_owned(),
        extra: BTreeMap::new(),
    })
}

fn validate_required_text(value: &str, field: &str, limit: usize) -> ApiResult<()> {
    if value.trim().is_empty() {
        return Err(ApiError::unprocessable(format!("{field} là bắt buộc.")));
    }
    if value.trim().encode_utf16().count() > limit {
        return Err(ApiError::unprocessable(format!(
            "{field} vượt quá độ dài cho phép."
        )));
    }
    Ok(())
}

fn generated_crm_code(prefix: &str) -> String {
    let date = Utc::now().format("%Y%m%d");
    let suffix = Uuid::new_v4().simple().to_string()[..8].to_ascii_uppercase();
    format!("{prefix}-{date}-{suffix}")
}

fn public_feedback(
    mut feedback: CustomerFeedback,
    crypto: Option<&CrmCrypto>,
) -> ApiResult<CustomerFeedback> {
    feedback.phone = decrypt_field(&feedback.phone, crypto)?;
    Ok(feedback)
}

fn read_crm_scope<T: DeserializeOwned>(
    db: &rusqlite::Connection,
    scope: &str,
) -> ApiResult<Vec<T>> {
    let mut statement = db
        .prepare("SELECT record_json FROM collection_records WHERE scope = ?1 ORDER BY created_at DESC, record_key ASC")
        .map_err(ApiError::internal)?;
    let records = statement
        .query_map(params![scope], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    records
        .into_iter()
        .map(|record| serde_json::from_str(&record).map_err(ApiError::internal))
        .collect()
}

async fn insert_crm_record<T: Serialize>(
    state: &AppState,
    scope: &str,
    key: &str,
    code_field: &str,
    code: &str,
    record: &T,
) -> ApiResult<()> {
    let serialized = serde_json::to_string(record).map_err(ApiError::internal)?;
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let records = {
        let mut statement = transaction
            .prepare("SELECT record_json FROM collection_records WHERE scope = ?1")
            .map_err(ApiError::internal)?;
        statement
            .query_map(params![scope], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(ApiError::internal)?
    };
    for current in records {
        let current: Value = serde_json::from_str(&current).map_err(ApiError::internal)?;
        if current
            .get(code_field)
            .and_then(Value::as_str)
            .is_some_and(|existing| existing.eq_ignore_ascii_case(code))
        {
            return Err(ApiError::conflict("Mã bản ghi đã được sử dụng."));
        }
    }
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
            params![scope, key, serialized, timestamp],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                ApiError::conflict("Mã bản ghi đã được sử dụng.")
            } else {
                ApiError::internal(error)
            }
        })?;
    transaction.commit().map_err(ApiError::internal)
}

async fn require_admin(state: &AppState, headers: &HeaderMap) -> ApiResult<User> {
    let actor = authenticated_user(state, headers).await?;
    if actor.role != ADMIN_ROLE {
        return Err(ApiError::forbidden(
            "Bạn không có quyền truy cập dữ liệu CRM.",
        ));
    }
    Ok(actor)
}

fn is_contact_type(value: &str) -> bool {
    matches!(value, "customer" | "supplier" | "partner")
}

fn validate_contact(input: CreateContactInput) -> ApiResult<ValidatedContact> {
    let contact_type = input
        .contact_type
        .as_str()
        .filter(|value| is_contact_type(value))
        .ok_or_else(|| ApiError::unprocessable("Loại đối tác không hợp lệ."))?
        .to_owned();
    let name = required_text(&input.name, "Tên đối tác", 220)?;
    let email = optional_text(&input.email, "Email", 254)?;
    if !email.is_empty() && !valid_email(&email) {
        return Err(ApiError::unprocessable(
            "Email liên hệ không đúng định dạng.",
        ));
    }
    Ok(ValidatedContact {
        contact_type,
        name,
        tax_code: optional_text(&input.tax_code, "Mã số thuế", 32)?,
        industry: optional_text(&input.industry, "Ngành nghề", 220)?,
        contact_person: optional_text(&input.contact_person, "Người liên hệ", 200)?,
        phone: optional_text(&input.phone, "Số điện thoại", 32)?,
        email,
        address: optional_text(&input.address, "Địa chỉ", 500)?,
        bank_account: optional_text(&input.bank_account, "Tài khoản ngân hàng", 220)?,
        credit_limit: optional_amount(&input.credit_limit, "Hạn mức tín dụng")?,
        total_value: optional_amount(&input.total_value, "Giá trị giao dịch")?,
        debt_balance: optional_amount(&input.debt_balance, "Công nợ")?,
        tier: {
            let tier = optional_text(&input.tier, "Hạng đối tác", 80)?;
            if tier.is_empty() {
                "Tiêu chuẩn".to_owned()
            } else {
                tier
            }
        },
        account_manager: optional_text(&input.account_manager, "Người phụ trách", 160)?,
        status: {
            let status = optional_text(&input.status, "Trạng thái", 80)?;
            if status.is_empty() {
                "Đang hoạt động".to_owned()
            } else {
                status
            }
        },
    })
}

fn required_text(value: &Value, field: &str, max_length: usize) -> ApiResult<String> {
    let text = js_text(value).trim().to_owned();
    if text.is_empty() {
        return Err(ApiError::unprocessable(format!("{field} là bắt buộc.")));
    }
    if text.encode_utf16().count() > max_length {
        return Err(ApiError::unprocessable(format!(
            "{field} vượt quá độ dài cho phép."
        )));
    }
    Ok(text)
}

fn optional_text(value: &Value, field: &str, max_length: usize) -> ApiResult<String> {
    if value.is_null() {
        return Ok(String::new());
    }
    let text = match value {
        Value::Array(items) => items
            .iter()
            .filter(|item| {
                !item.is_null()
                    && *item != &Value::Bool(false)
                    && *item != &json!(0)
                    && *item != &json!("")
            })
            .map(js_text)
            .collect::<Vec<_>>()
            .join(", ")
            .trim()
            .to_owned(),
        _ => js_text(value).trim().to_owned(),
    };
    if text.encode_utf16().count() > max_length {
        return Err(ApiError::unprocessable(format!(
            "{field} vượt quá độ dài cho phép."
        )));
    }
    Ok(text)
}

fn js_text(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::String(value) => value.clone(),
        Value::Array(items) => items
            .iter()
            .map(|item| {
                if item.is_null() {
                    String::new()
                } else {
                    js_text(item)
                }
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_owned(),
    }
}

fn optional_amount(value: &Value, field: &str) -> ApiResult<i64> {
    if value.is_null() || value == "" {
        return Ok(0);
    }
    let amount = match value {
        Value::Number(number) => number.as_f64(),
        _ => {
            let text = js_text(value);
            let text = text.trim();
            if text.is_empty() {
                Some(0.0)
            } else {
                text.parse::<f64>().ok()
            }
        }
    };
    let Some(amount) = amount.filter(|amount| amount.is_finite()) else {
        return Err(ApiError::unprocessable(format!(
            "{field} phải là số nguyên không âm hợp lệ."
        )));
    };
    if amount.fract() != 0.0 || !(0.0..=MAX_AMOUNT as f64).contains(&amount) {
        return Err(ApiError::unprocessable(format!(
            "{field} phải là số nguyên không âm hợp lệ."
        )));
    }
    Ok(amount as i64)
}

fn valid_email(value: &str) -> bool {
    let Some((local, domain)) = value.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && !domain.is_empty()
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && domain.contains('.')
        && !value.chars().any(char::is_whitespace)
        && value.matches('@').count() == 1
}

fn stored_contact_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<StoredContact> {
    Ok(StoredContact {
        id: row.get(0)?,
        code: row.get(1)?,
        name: row.get(2)?,
        contact_type: row.get(3)?,
        tax_code: row.get(4)?,
        industry: row.get(5)?,
        contact_person: row.get(6)?,
        phone: row.get(7)?,
        email: row.get(8)?,
        address: row.get(9)?,
        bank_account: row.get(10)?,
        credit_limit: row.get(11)?,
        total_value: row.get(12)?,
        debt_balance: row.get(13)?,
        tier: row.get(14)?,
        account_manager: row.get(15)?,
        status: row.get(16)?,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
        legacy_import_status: row.get(19)?,
    })
}

fn public_contact(row: StoredContact, crypto: Option<&CrmCrypto>) -> ApiResult<Contact> {
    Ok(Contact {
        key: row.id,
        code: row.code,
        name: row.name,
        contact_type: row.contact_type,
        tax_code: row.tax_code,
        industry: row.industry,
        contact_person: row.contact_person,
        phone: decrypt_field(&row.phone, crypto)?,
        email: decrypt_field(&row.email, crypto)?,
        address: decrypt_field(&row.address, crypto)?,
        bank_account: decrypt_field(&row.bank_account, crypto)?,
        credit_limit: row.credit_limit,
        total_value: row.total_value,
        debt_balance: row.debt_balance,
        tier: row.tier,
        account_manager: row.account_manager,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        legacy_import_status: row.legacy_import_status,
    })
}

#[derive(Serialize, Deserialize)]
struct Envelope {
    v: u8,
    kid: String,
    alg: String,
    iv: String,
    ciphertext: String,
    tag: String,
}

fn derive_domain_key(crypto: &CrmCrypto, version: &str, domain: &str) -> ApiResult<[u8; 32]> {
    let salt = format!("kiyovn-salt-{version}");
    let info = format!("KIYOVN-Secure-Envelope-{domain}-data-{version}");
    let salt = hkdf::Salt::new(hkdf::HKDF_SHA256, salt.as_bytes());
    let prk = salt.extract(&crypto.master_key);
    let info = [info.as_bytes()];
    let okm = prk
        .expand(&info, hkdf::HKDF_SHA256)
        .map_err(|_| ApiError::internal("Unable to derive CRM encryption key"))?;
    let mut key = [0; 32];
    okm.fill(&mut key)
        .map_err(|_| ApiError::internal("Unable to derive CRM encryption key"))?;
    Ok(key)
}

fn encrypt_field(value: &str, crypto: &CrmCrypto) -> ApiResult<String> {
    encrypt_field_for_domain(value, crypto, "crm")
}

pub(super) fn encrypt_hr_bank_field(value: &str, crypto: &CrmCrypto) -> ApiResult<String> {
    encrypt_field_for_domain(value, crypto, "hr-bank")
}

pub(super) fn encrypt_finance_field(value: &str, crypto: &CrmCrypto) -> ApiResult<String> {
    encrypt_field_for_domain(value, crypto, "finance")
}

pub(super) fn encrypt_contract_field(value: &str, crypto: &CrmCrypto) -> ApiResult<String> {
    encrypt_field_for_domain(value, crypto, "contract")
}

pub(super) fn encrypt_insurance_bank_field(value: &str, crypto: &CrmCrypto) -> ApiResult<String> {
    encrypt_field_for_domain(value, crypto, "insurance")
}

fn encrypt_field_for_domain(value: &str, crypto: &CrmCrypto, domain: &str) -> ApiResult<String> {
    if value.is_empty() {
        return Ok(String::new());
    }
    let key = derive_domain_key(crypto, &crypto.key_version, domain)?;
    let unbound = aead::UnboundKey::new(&aead::AES_256_GCM, &key)
        .map_err(|_| ApiError::internal("Unable to initialize CRM encryption"))?;
    let key = aead::LessSafeKey::new(unbound);
    let mut iv = [0u8; 12];
    SystemRandom::new()
        .fill(&mut iv)
        .map_err(|_| ApiError::internal("Unable to generate CRM encryption nonce"))?;
    let nonce = aead::Nonce::assume_unique_for_key(iv);
    let mut ciphertext = value.as_bytes().to_vec();
    key.seal_in_place_append_tag(nonce, aead::Aad::empty(), &mut ciphertext)
        .map_err(|_| ApiError::internal("Unable to encrypt CRM field"))?;
    let split_at = ciphertext.len() - aead::AES_256_GCM.tag_len();
    let tag = ciphertext.split_off(split_at);
    let envelope = Envelope {
        v: 1,
        kid: format!("{domain}-{}", crypto.key_version),
        alg: "A256GCM".to_owned(),
        iv: URL_SAFE_NO_PAD.encode(iv),
        ciphertext: URL_SAFE_NO_PAD.encode(ciphertext),
        tag: URL_SAFE_NO_PAD.encode(tag),
    };
    let serialized = serde_json::to_string(&envelope).map_err(ApiError::internal)?;
    Ok(format!("ENC:{serialized}"))
}

fn decrypt_field(value: &str, crypto: Option<&CrmCrypto>) -> ApiResult<String> {
    decrypt_field_for_domain(value, crypto, "crm", false)
}

pub(super) fn decrypt_hr_bank_field(value: &str, crypto: Option<&CrmCrypto>) -> ApiResult<String> {
    decrypt_field_for_domain(value, crypto, "hr-bank", true)
}

pub(super) fn decrypt_finance_field(value: &str, crypto: Option<&CrmCrypto>) -> ApiResult<String> {
    decrypt_field_for_domain(value, crypto, "finance", false)
}

pub(super) fn decrypt_contract_field(value: &str, crypto: Option<&CrmCrypto>) -> ApiResult<String> {
    decrypt_field_for_domain(value, crypto, "contract", false)
}

pub(super) fn decrypt_insurance_bank_field(
    value: &str,
    crypto: Option<&CrmCrypto>,
) -> ApiResult<String> {
    decrypt_field_for_domain(value, crypto, "insurance", false)
}

fn decrypt_field_for_domain(
    value: &str,
    crypto: Option<&CrmCrypto>,
    domain: &str,
    require_envelope: bool,
) -> ApiResult<String> {
    if !is_envelope(value) {
        if require_envelope && !value.is_empty() {
            return Err(ApiError::internal(
                "HR bank account data is not encrypted; refusing plaintext fallback.",
            ));
        }
        return Ok(value.to_owned());
    }
    let crypto = crypto.ok_or_else(|| {
        ApiError::service_unavailable(
            "Thiếu khóa mã hóa cần thiết để đọc dữ liệu nhạy cảm đã mã hóa.",
        )
    })?;
    let raw = value.strip_prefix("ENC:").unwrap_or(value);
    let envelope: Envelope = serde_json::from_str(raw)
        .map_err(|_| ApiError::internal("CRM contact encryption envelope is invalid"))?;
    let domain_prefix = format!("{domain}-");
    let version = envelope
        .kid
        .strip_prefix(&domain_prefix)
        .filter(|version| {
            !version.is_empty()
                && version
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        })
        .ok_or_else(|| ApiError::internal("Sensitive-data encryption key identifier is invalid"))?;
    if envelope.v != 1 || envelope.alg != "A256GCM" {
        return Err(ApiError::internal(
            "Unsupported sensitive-data encryption envelope",
        ));
    }
    let iv = decode_base64url(&envelope.iv)
        .filter(|value| value.len() == 12)
        .ok_or_else(|| ApiError::internal("CRM contact encryption nonce is invalid"))?;
    let ciphertext = decode_base64url(&envelope.ciphertext)
        .ok_or_else(|| ApiError::internal("CRM contact ciphertext is invalid"))?;
    let tag = decode_base64url(&envelope.tag)
        .filter(|value| value.len() == aead::AES_256_GCM.tag_len())
        .ok_or_else(|| ApiError::internal("CRM contact authentication tag is invalid"))?;
    let key_bytes = derive_domain_key(crypto, version, domain)?;
    let unbound = aead::UnboundKey::new(&aead::AES_256_GCM, &key_bytes)
        .map_err(|_| ApiError::internal("Unable to initialize CRM decryption"))?;
    let key = aead::LessSafeKey::new(unbound);
    let nonce_array: [u8; 12] = iv
        .try_into()
        .map_err(|_| ApiError::internal("CRM contact encryption nonce is invalid"))?;
    let nonce = aead::Nonce::assume_unique_for_key(nonce_array);
    let mut in_out = ciphertext;
    in_out.extend_from_slice(&tag);
    let plaintext = key
        .open_in_place(nonce, aead::Aad::empty(), &mut in_out)
        .map_err(|_| ApiError::internal("CRM contact data failed authentication"))?;
    String::from_utf8(plaintext.to_vec())
        .map_err(|_| ApiError::internal("CRM contact plaintext is not valid UTF-8"))
}

fn is_envelope(value: &str) -> bool {
    value.starts_with("ENC:{\"v\":1,\"kid\":")
        || (value.starts_with("{\"v\":1,\"kid\":") && value.contains("\"alg\":\"A256GCM\""))
}

fn decode_base64url(value: &str) -> Option<Vec<u8>> {
    URL_SAFE_NO_PAD
        .decode(value)
        .or_else(|_| URL_SAFE.decode(value))
        .ok()
}

#[cfg(test)]
mod tests {
    use super::{
        CrmCrypto, decrypt_contract_field, decrypt_field, decrypt_finance_field,
        decrypt_hr_bank_field, encrypt_contract_field, encrypt_field, encrypt_finance_field,
        encrypt_hr_bank_field, parse_master_key, validate_contact,
    };
    use crate::{AppState, User, init_database, issue_token, router};
    use axum::{
        Router,
        body::{Body, to_bytes},
        http::{Method, Request, StatusCode},
        response::Response,
    };
    use rusqlite::{Connection, params};
    use serde_json::json;
    use sha2::Digest as _;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;

    fn fixture(with_key: bool) -> (Router, AppState, User, User) {
        let db = Connection::open_in_memory().expect("in-memory CRM database");
        init_database(&db).expect("initialize CRM schema");
        let now = chrono::Utc::now().to_rfc3339();
        let admin = User {
            id: "crm-admin".to_owned(),
            email: "crm-admin@example.test".to_owned(),
            name: "CRM Admin".to_owned(),
            role: "ADMIN".to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let employee = User {
            id: "crm-user".to_owned(),
            email: "crm-user@example.test".to_owned(),
            name: "CRM Employee".to_owned(),
            role: "USER".to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        for user in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'test-hash', 1, ?5, ?5)",
                params![user.id, user.email, user.name, user.role, now],
            )
            .expect("insert CRM test account");
        }
        let secret = b"crm-test-secret-with-at-least-32-bytes";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: with_key.then(|| CrmCrypto::for_test([0x42; 32], "v1")),
        };
        let app = router(state.clone(), tower_http::cors::CorsLayer::new());
        (app, state, admin, employee)
    }

    fn bearer(state: &AppState, user: &User) -> String {
        format!("Bearer {}", issue_token(state, user).expect("test JWT"))
    }

    async fn call(
        app: &Router,
        method: Method,
        uri: &str,
        token: &str,
        body: serde_json::Value,
    ) -> Response {
        app.clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("authorization", token)
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .expect("request"),
            )
            .await
            .expect("response")
    }

    async fn response_json(response: Response) -> serde_json::Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), usize::MAX)
                .await
                .expect("response body"),
        )
        .expect("JSON response")
    }

    #[test]
    fn key_parser_matches_legacy_hex_base64url_and_hashed_fallback() {
        let expected = [0x42; 32];
        let hex = "42".repeat(32);
        assert_eq!(parse_master_key(&hex), expected);
        assert_eq!(
            parse_master_key("QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI"),
            expected
        );
        let expected_digest: [u8; 32] = sha2::Sha256::digest(b"test-key").into();
        assert_eq!(parse_master_key("test-key"), expected_digest);
    }

    #[test]
    fn crm_encryption_round_trips_empty_and_non_empty_fields() {
        let crypto = CrmCrypto::for_test([0x42; 32], "v1");
        for value in ["", "0900 123 456", "crm@example.test"] {
            let encrypted = encrypt_field(value, &crypto).expect("encrypt CRM field");
            if value.is_empty() {
                assert_eq!(encrypted, value);
            } else {
                assert!(encrypted.starts_with("ENC:{\"v\":1,"));
                assert!(!encrypted.contains(value));
            }
            assert_eq!(
                decrypt_field(&encrypted, Some(&crypto)).expect("decrypt"),
                value
            );
        }
    }

    #[test]
    fn decrypts_fixed_node_crypto_legacy_envelope() {
        let crypto = CrmCrypto::for_test([0x42; 32], "v1");
        let legacy_envelope = "ENC:{\"v\":1,\"kid\":\"crm-v1\",\"alg\":\"A256GCM\",\"iv\":\"ERERERERERERERER\",\"ciphertext\":\"819Q7SRBFc7p62qUM3h6cg\",\"tag\":\"aVwLjcY-RBebnT1jMMrxCw\"}";
        assert_eq!(
            decrypt_field(legacy_envelope, Some(&crypto)).expect("legacy ciphertext"),
            "crm@example.test"
        );
    }

    #[test]
    fn finance_bank_ciphertext_is_compatible_with_legacy_node_envelopes() {
        let crypto = CrmCrypto::for_test([0x42; 32], "v1");
        let legacy_envelope = "ENC:{\"v\":1,\"kid\":\"finance-v1\",\"alg\":\"A256GCM\",\"iv\":\"GB8cb3bzMY96JiWx\",\"ciphertext\":\"v0_QNA69k9N0Sw\",\"tag\":\"9wYWzmOmCzeCT6wGflBm0A\"}";
        assert_eq!(
            decrypt_finance_field(legacy_envelope, Some(&crypto)).expect("Node finance envelope"),
            "0123456789"
        );

        let rust_envelope = encrypt_finance_field("0123456789", &crypto).expect("Rust envelope");
        assert_eq!(
            decrypt_finance_field(&rust_envelope, Some(&crypto)).expect("Rust finance envelope"),
            "0123456789"
        );
        assert!(rust_envelope.starts_with("ENC:{\"v\":1,\"kid\":\"finance-v1\""));
        assert!(!rust_envelope.contains("0123456789"));
    }

    #[test]
    fn contract_envelopes_are_compatible_with_legacy_node_crypto() {
        let crypto = CrmCrypto::for_test([0x42; 32], "v1");
        let node_envelope = "ENC:{\"v\":1,\"kid\":\"contract-v1\",\"alg\":\"A256GCM\",\"iv\":\"P9r_tTaQG3VXYYjg\",\"ciphertext\":\"FBip2SDv\",\"tag\":\"QtynJhCxGDedNWnjJEfoVg\"}";
        assert_eq!(
            decrypt_contract_field(node_envelope, Some(&crypto)).expect("decrypt Node contract"),
            "123-45"
        );

        let rust_envelope = encrypt_contract_field("123-45", &crypto).expect("encrypt contract");
        assert!(rust_envelope.starts_with("ENC:{\"v\":1,\"kid\":\"contract-v1\""));
        assert!(!rust_envelope.contains("123-45"));
        assert_eq!(
            decrypt_contract_field(&rust_envelope, Some(&crypto)).expect("decrypt Rust contract"),
            "123-45"
        );
        assert_eq!(
            decrypt_contract_field(&rust_envelope, None).unwrap_err().0,
            axum::http::StatusCode::SERVICE_UNAVAILABLE
        );
        assert_ne!(
            rust_envelope,
            encrypt_field("123-45", &crypto).expect("encrypt CRM domain")
        );
    }

    #[test]
    fn hr_bank_envelopes_are_domain_separated_and_reject_plaintext_fallback() {
        let crypto = CrmCrypto::for_test([0x71; 32], "test-v1");
        let value = "1234567890123456";
        let bank = encrypt_hr_bank_field(value, &crypto).expect("HR bank encryption");
        let crm = encrypt_field(value, &crypto).expect("CRM encryption");
        assert!(bank.starts_with("ENC:{\"v\":1,\"kid\":\"hr-bank-test-v1\""));
        assert!(crm.starts_with("ENC:{\"v\":1,\"kid\":\"crm-test-v1\""));
        assert_ne!(bank, crm);
        assert!(!bank.contains(value));
        assert_eq!(decrypt_hr_bank_field(&bank, Some(&crypto)).unwrap(), value);
        assert!(decrypt_field(&bank, Some(&crypto)).is_err());
        assert!(decrypt_hr_bank_field(&crm, Some(&crypto)).is_err());
        assert!(decrypt_hr_bank_field("plaintext-account", Some(&crypto)).is_err());
    }

    #[test]
    fn contact_validation_matches_legacy_defaults_and_limits() {
        let contact = validate_contact(serde_json::from_value(json!({
            "type":"partner", "name":"  Company  ", "email":"crm@example.test", "creditLimit":"1000"
        })).expect("input"))
        .expect("validated contact");
        assert_eq!(contact.name, "Company");
        assert_eq!(contact.tier, "Tiêu chuẩn");
        assert_eq!(contact.status, "Đang hoạt động");
        assert_eq!(contact.credit_limit, 1000);
        let invalid_email = validate_contact(
            serde_json::from_value(json!({
                "type":"customer", "name":"Company", "email":"not-an-email"
            }))
            .expect("input"),
        );
        assert!(invalid_email.is_err());
    }

    #[tokio::test]
    async fn crm_http_contract_enforces_admin_encrypts_pii_and_persists_contacts() {
        let (app, state, admin, employee) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let input = json!({
            "code":"CLIENT-CODE-MUST-BE-IGNORED",
            "type":"customer",
            "name":"Công ty CRM",
            "taxCode":"TAX-01",
            "industry":"Phần mềm",
            "contactPerson":"Nguyễn An",
            "phone":"0900123456",
            "email":"crm@example.test",
            "address":"Số 1, Hà Nội",
            "bankAccount":"123456789",
            "creditLimit":500000,
            "totalValue":1500000,
            "debtBalance":250000
        });

        let denied_get = call(
            &app,
            Method::GET,
            "/api/v1/crm/contacts",
            &employee_token,
            json!({}),
        )
        .await;
        assert_eq!(denied_get.status(), StatusCode::FORBIDDEN);
        let denied_create = call(
            &app,
            Method::POST,
            "/api/v1/crm/contacts",
            &employee_token,
            input.clone(),
        )
        .await;
        assert_eq!(denied_create.status(), StatusCode::FORBIDDEN);

        let empty = call(
            &app,
            Method::GET,
            "/api/v1/crm/contacts",
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(empty.status(), StatusCode::OK);
        assert_eq!(response_json(empty).await["data"], json!([]));

        let created = call(
            &app,
            Method::POST,
            "/api/v1/crm/contacts",
            &admin_token,
            input,
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let created_json = response_json(created).await;
        let contact = &created_json["contact"];
        assert_eq!(contact["name"], "Công ty CRM");
        assert_eq!(contact["type"], "customer");
        assert_eq!(contact["phone"], "0900123456");
        assert_eq!(contact["email"], "crm@example.test");
        assert_eq!(contact["address"], "Số 1, Hà Nội");
        assert_eq!(contact["bankAccount"], "123456789");
        assert_eq!(contact["creditLimit"], 500000);
        assert_ne!(contact["code"], "CLIENT-CODE-MUST-BE-IGNORED");
        let code = contact["code"].as_str().expect("generated code");
        let segments = code.split('-').collect::<Vec<_>>();
        assert_eq!(segments.len(), 3);
        assert_eq!(segments[0], "KH");
        assert_eq!(segments[1].len(), 8);
        assert_eq!(segments[2].len(), 8);

        {
            let db = state.db.lock().await;
            let stored: (String, String, String, String) = db
                .query_row(
                    "SELECT phone, email, address, bank_account FROM crm_contacts WHERE id = ?1",
                    params![contact["key"].as_str().expect("contact key")],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .expect("stored CRM PII");
            for value in [&stored.0, &stored.1, &stored.2, &stored.3] {
                assert!(value.starts_with("ENC:{\"v\":1,"));
            }
            assert!(!stored.0.contains("0900123456"));
            assert!(!stored.1.contains("crm@example.test"));
            assert!(!stored.2.contains("Số 1, Hà Nội"));
            assert!(!stored.3.contains("123456789"));
        }

        let persisted = call(
            &app,
            Method::GET,
            "/api/v1/crm/contacts?type=customer",
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(persisted.status(), StatusCode::OK);
        let persisted_json = response_json(persisted).await;
        assert_eq!(persisted_json["data"].as_array().unwrap().len(), 1);
        assert_eq!(persisted_json["data"][0]["email"], "crm@example.test");

        let other_type = call(
            &app,
            Method::GET,
            "/api/v1/crm/contacts?type=supplier",
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(response_json(other_type).await["data"], json!([]));
        let invalid_type = call(
            &app,
            Method::GET,
            "/api/v1/crm/contacts?type=unknown",
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(invalid_type.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn crm_http_validation_and_missing_key_fail_closed_without_writes() {
        let (app, state, admin, _) = fixture(false);
        let admin_token = bearer(&state, &admin);
        let base = json!({"type":"partner", "name":"Partner"});
        for patch in [
            json!({"type":"unknown"}),
            json!({"email":"invalid"}),
            json!({"creditLimit":-1}),
            json!({"totalValue":1.5}),
            json!({"debtBalance":1000000000001_i64}),
        ] {
            let mut input = base.clone();
            for (key, value) in patch.as_object().unwrap() {
                input[key] = value.clone();
            }
            let response = call(
                &app,
                Method::POST,
                "/api/v1/crm/contacts",
                &admin_token,
                input,
            )
            .await;
            assert_eq!(response.status(), StatusCode::UNPROCESSABLE_ENTITY);
        }
        let unavailable = call(
            &app,
            Method::POST,
            "/api/v1/crm/contacts",
            &admin_token,
            base,
        )
        .await;
        assert_eq!(unavailable.status(), StatusCode::SERVICE_UNAVAILABLE);
        let db = state.db.lock().await;
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM crm_contacts", [], |row| row.get(0))
            .expect("CRM count");
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn crm_read_does_not_return_ciphertext_when_key_is_missing_or_data_is_corrupt() {
        let (app, state, admin, _) = fixture(false);
        let admin_token = bearer(&state, &admin);
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO crm_contacts (id, code, name, contact_type, phone, created_by, created_at, updated_at) VALUES ('crm-encrypted', 'KH-OLD', 'Encrypted', 'customer', 'ENC:{\"v\":1,\"kid\":\"crm-v1\",\"alg\":\"A256GCM\",\"iv\":\"AAAAAAAAAAAAAAAA\",\"ciphertext\":\"AA\",\"tag\":\"AAAAAAAAAAAAAAAAAAAAAA\"}', ?1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                params![admin.id],
            )
            .expect("insert encrypted legacy row");
        }
        let unavailable = call(
            &app,
            Method::GET,
            "/api/v1/crm/contacts",
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(unavailable.status(), StatusCode::SERVICE_UNAVAILABLE);

        let (keyed_app, keyed_state, keyed_admin, _) = fixture(true);
        let other_crypto = CrmCrypto::for_test([0x43; 32], "v1");
        let corrupt = encrypt_field("secret value", &other_crypto).expect("encrypted fixture");
        {
            let db = keyed_state.db.lock().await;
            db.execute(
                "INSERT INTO crm_contacts (id, code, name, contact_type, phone, created_by, created_at, updated_at) VALUES ('crm-corrupt', 'KH-CORRUPT', 'Corrupt', 'customer', ?1, ?2, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
                params![corrupt, keyed_admin.id],
            )
            .expect("insert corrupt CRM ciphertext");
        }
        let keyed_token = bearer(&keyed_state, &keyed_admin);
        let corrupt_response = call(
            &keyed_app,
            Method::GET,
            "/api/v1/crm/contacts",
            &keyed_token,
            json!({}),
        )
        .await;
        assert_eq!(corrupt_response.status(), StatusCode::INTERNAL_SERVER_ERROR);
    }

    #[tokio::test]
    async fn supplier_evaluations_and_customer_feedback_use_typed_admin_contracts() {
        let (app, state, admin, employee) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let evaluation_input = json!({
            "evalCode":"NCC-DG-2026-01",
            "evalPeriod":"Quý III / 2026",
            "supplierName":"Nhà cung cấp A",
            "qualityScore":40,
            "deliveryScore":28,
            "priceScore":18,
            "serviceScore":9,
            "evaluator":"Quản trị viên"
        });

        let denied = call(
            &app,
            Method::GET,
            "/api/v1/crm/supplier-evaluations",
            &employee_token,
            json!({}),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let created_evaluation = call(
            &app,
            Method::POST,
            "/api/v1/crm/supplier-evaluations",
            &admin_token,
            evaluation_input.clone(),
        )
        .await;
        assert_eq!(created_evaluation.status(), StatusCode::CREATED);
        let evaluation = response_json(created_evaluation).await["evaluation"].clone();
        assert_eq!(evaluation["totalScore"], 95);
        assert_eq!(evaluation["tier"], "Hạng A (Chiến lược)");
        assert_eq!(evaluation["category"], "Đường truyền & Hạ tầng Cloud");
        assert_eq!(evaluation["createdBy"], admin.id);
        assert!(evaluation["createdAt"].as_str().is_some());
        assert!(
            evaluation["key"]
                .as_str()
                .is_some_and(|key| !key.is_empty())
        );

        let duplicate = call(
            &app,
            Method::POST,
            "/api/v1/crm/supplier-evaluations",
            &admin_token,
            evaluation_input,
        )
        .await;
        assert_eq!(duplicate.status(), StatusCode::CONFLICT);

        let feedback_input = json!({
            "clientName":"Công ty Khách hàng",
            "contactPerson":"Nguyễn An",
            "phone":"0900123456",
            "serviceName":"Cloud",
            "rating":4,
            "content":"Cần cải thiện thời gian phản hồi.",
            "priority":"Cao",
            "assignedStaff":"Nhân viên CRM"
        });
        let created_feedback = call(
            &app,
            Method::POST,
            "/api/v1/crm/feedback",
            &admin_token,
            feedback_input.clone(),
        )
        .await;
        assert_eq!(created_feedback.status(), StatusCode::CREATED);
        let feedback = response_json(created_feedback).await["feedback"].clone();
        assert!(
            feedback["feedbackCode"]
                .as_str()
                .unwrap()
                .starts_with("FB-")
        );
        assert_eq!(feedback["phone"], "0900123456");
        assert_eq!(feedback["status"], "Đang xử lý");
        assert_eq!(feedback["createdBy"], admin.id);
        let feedback_key = feedback["key"].as_str().unwrap();

        {
            let db = state.db.lock().await;
            let stored: String = db
                .query_row(
                    "SELECT record_json FROM collection_records WHERE scope = 'crm_feedback' AND record_key = ?1",
                    params![feedback_key],
                    |row| row.get(0),
                )
                .expect("stored feedback");
            assert!(stored.contains("ENC:{\\\"v\\\":1,"));
            assert!(!stored.contains("0900123456"));
        }

        let generic_read = call(
            &app,
            Method::GET,
            "/api/v1/collections/crm_feedback",
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(generic_read.status(), StatusCode::BAD_REQUEST);
        let generic_write = call(
            &app,
            Method::POST,
            "/api/v1/collections/crm_feedback",
            &admin_token,
            json!({"record":{"key":"raw"}}),
        )
        .await;
        assert_eq!(generic_write.status(), StatusCode::BAD_REQUEST);

        let resolved = call(
            &app,
            Method::PATCH,
            &format!("/api/v1/crm/feedback/{feedback_key}/resolve"),
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(resolved.status(), StatusCode::OK);
        let resolved_json = response_json(resolved).await;
        assert_eq!(
            resolved_json["feedback"]["status"],
            "Đã giải quyết thỏa đáng"
        );
        assert_eq!(resolved_json["feedback"]["phone"], "0900123456");
        assert_eq!(resolved_json["feedback"]["resolvedBy"], admin.id);
        assert!(resolved_json["feedback"]["resolvedAt"].as_str().is_some());

        let repeated = call(
            &app,
            Method::PATCH,
            &format!("/api/v1/crm/feedback/{feedback_key}/resolve"),
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(repeated.status(), StatusCode::CONFLICT);

        let feedback_list = call(
            &app,
            Method::GET,
            "/api/v1/crm/feedback",
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(
            response_json(feedback_list).await["data"][0]["status"],
            "Đã giải quyết thỏa đáng"
        );
    }

    fn legacy_crm_bundle() -> serde_json::Value {
        json!({
            "format":"kiyovn-legacy-crm-operations",
            "schemaVersion":1,
            "batchId":"a82c8760-07b5-4c6b-9fea-14697ab5caa6",
            "sourceOrigin":"https://legacy.example.test",
            "exportedAt":"2026-10-08T00:00:00Z",
            "supplierEvaluations":[{
                "key":"legacy-eval-1",
                "evalCode":"NCC-DG-OLD-1",
                "evalPeriod":"Quý III / 2026",
                "supplierName":"Fixture Supplier",
                "category":"Cloud",
                "qualityScore":36,
                "deliveryScore":28,
                "priceScore":18,
                "serviceScore":9,
                "totalScore":1000,
                "tier":"CLIENT-FABRICATED",
                "evaluator":"Fixture Evaluator",
                "strengths":"Fixture strength",
                "weaknesses":"Fixture weakness",
                "decision":"Duy trì đối tác chiến lược",
                "legacyTag":"preserved-fixture"
            }],
            "customerFeedback":[{
                "key":"legacy-feedback-1",
                "feedbackCode":"FB-OLD-1",
                "clientName":"Fixture Client",
                "contactPerson":"Fixture Contact",
                "phone":"0900000000",
                "serviceName":"Fixture Service",
                "rating":4,
                "content":"Synthetic customer feedback body",
                "priority":"Cao",
                "resolutionAction":"Old local action",
                "assignedStaff":"Fixture Staff",
                "receivedDate":"2026-09-20",
                "resolvedDate":"2026-09-21",
                "status":"Đã giải quyết thỏa đáng",
                "resolvedBy":"legacy-user-claimed",
                "resolvedAt":"2026-09-21T12:00:00Z"
            }]
        })
    }

    fn legacy_crm_contacts_bundle(crypto: &CrmCrypto) -> serde_json::Value {
        let contact = |id: &str, code: &str, contact_type: &str, name: &str, phone: &str| {
            json!({
                "id": id,
                "code": code,
                "name": name,
                "type": contact_type,
                "taxCode": "SYNTHETIC-TAX",
                "industry": "Fixture industry",
                "contactPerson": "Fixture Contact",
                "phone": encrypt_field(phone, crypto).expect("source phone encryption"),
                "email": encrypt_field("synthetic@example.test", crypto).expect("source email encryption"),
                "address": encrypt_field("Fixture address", crypto).expect("source address encryption"),
                "bankAccount": encrypt_field("000111222", crypto).expect("source bank encryption"),
                "creditLimit": 1200,
                "totalValue": 3000,
                "debtBalance": 400,
                "tier": "Hạng thử nghiệm",
                "accountManager": "Fixture Manager",
                "status": "Đang hoạt động",
                "createdBy": "untrusted-legacy-user",
                "createdAt": "2026-09-01T10:00:00Z",
                "updatedAt": "2026-09-02T11:00:00Z"
            })
        };
        json!({
            "format": "kiyovn-legacy-crm-contacts",
            "schemaVersion": 1,
            "batchId": "f2c03560-587e-4881-b342-f09be4e1b123",
            "sourceDatabaseId": "legacy-fixture-v1",
            "exportedAt": "2026-10-08T00:00:00Z",
            "contacts": [
                contact("legacy-contact-1", "KH-LEGACY-001", "customer", "Fixture Customer", "0900000001"),
                contact("legacy-contact-2", "NCC-LEGACY-002", "supplier", "Fixture Supplier", "0900000002")
            ]
        })
    }

    #[tokio::test]
    async fn crm_legacy_import_preview_is_admin_only_pii_free_and_read_only() {
        let (app, state, admin, employee) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let bundle = legacy_crm_bundle();

        let denied = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-operations/preview",
            &employee_token,
            json!({ "bundle": bundle }),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let preview = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-operations/preview",
            &admin_token,
            json!({ "bundle": bundle }),
        )
        .await;
        assert_eq!(preview.status(), StatusCode::OK);
        let body = response_json(preview).await;
        assert_eq!(body["preview"]["sourceRecords"], 2);
        assert_eq!(body["preview"]["importableRecords"], 2);
        assert_eq!(body["preview"]["supplierEvaluationRecords"], 1);
        assert_eq!(body["preview"]["customerFeedbackRecords"], 1);
        assert_eq!(body["preview"]["canApply"], true);
        let serialized = body.to_string();
        for sensitive in [
            "0900000000",
            "Synthetic customer feedback body",
            "Fixture Contact",
        ] {
            assert!(!serialized.contains(sensitive));
        }

        let db = state.db.lock().await;
        let target_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM collection_records WHERE scope IN ('crm_supplier_evaluations','crm_feedback')",
                [],
                |row| row.get(0),
            )
            .expect("target count");
        let run_count: i64 = db
            .query_row("SELECT COUNT(*) FROM crm_legacy_import_runs", [], |row| {
                row.get(0)
            })
            .expect("import run count");
        assert_eq!(target_count, 0);
        assert_eq!(run_count, 0);

        let (unkeyed_app, unkeyed_state, unkeyed_admin, _) = fixture(false);
        let unavailable = call(
            &unkeyed_app,
            Method::POST,
            "/api/v1/legacy-import/crm-operations/preview",
            &bearer(&unkeyed_state, &unkeyed_admin),
            json!({ "bundle": legacy_crm_bundle() }),
        )
        .await;
        assert_eq!(unavailable.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn crm_contact_import_is_admin_only_encrypted_atomic_and_idempotent() {
        let (app, state, admin, employee) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let crypto = state.crm_crypto.as_ref().expect("test CRM key");
        let bundle = legacy_crm_contacts_bundle(crypto);

        let denied = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-contacts/preview",
            &employee_token,
            json!({ "bundle": bundle }),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let preview = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-contacts/preview",
            &admin_token,
            json!({ "bundle": bundle }),
        )
        .await;
        assert_eq!(preview.status(), StatusCode::OK);
        let body = response_json(preview).await;
        assert_eq!(body["preview"]["sourceRecords"], 2);
        assert_eq!(body["preview"]["customerRecords"], 1);
        assert_eq!(body["preview"]["supplierRecords"], 1);
        assert_eq!(body["preview"]["importableRecords"], 2);
        assert_eq!(body["preview"]["canApply"], true);
        for sensitive in ["Fixture Customer", "Fixture Contact", "0900000001"] {
            assert!(!body.to_string().contains(sensitive));
        }
        let digest = body["preview"]["payloadSha256"]
            .as_str()
            .expect("preview digest")
            .to_owned();
        let phrase = body["preview"]["confirmationPhrase"]
            .as_str()
            .expect("confirmation")
            .to_owned();

        {
            let db = state.db.lock().await;
            assert_eq!(
                db.query_row("SELECT COUNT(*) FROM crm_contacts", [], |row| row
                    .get::<_, i64>(0))
                    .unwrap(),
                0
            );
            assert_eq!(
                db.query_row("SELECT COUNT(*) FROM crm_contact_import_runs", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
                0
            );
        }

        let wrong_confirmation = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-contacts/apply",
            &admin_token,
            json!({
                "bundle": bundle,
                "expectedPayloadSha256": digest,
                "confirmation": "wrong",
            }),
        )
        .await;
        assert_eq!(
            wrong_confirmation.status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );

        let mut changed_after_preview = bundle.clone();
        changed_after_preview["contacts"][0]["name"] = json!("Stale preview fixture");
        let stale = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-contacts/apply",
            &admin_token,
            json!({
                "bundle": changed_after_preview,
                "expectedPayloadSha256": digest,
                "confirmation": phrase,
            }),
        )
        .await;
        assert_eq!(stale.status(), StatusCode::CONFLICT);

        let applied = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-contacts/apply",
            &admin_token,
            json!({
                "bundle": bundle,
                "expectedPayloadSha256": digest,
                "confirmation": phrase,
            }),
        )
        .await;
        assert_eq!(applied.status(), StatusCode::CREATED);
        let applied_body = response_json(applied).await;
        assert_eq!(applied_body["import"]["importedRecords"], 2);
        assert!(!applied_body.to_string().contains("0900000001"));

        {
            let db = state.db.lock().await;
            let (creator, phone, email, address, bank): (String, String, String, String, String) = db
                .query_row(
                    "SELECT created_by,phone,email,address,bank_account FROM crm_contacts WHERE id='legacy-contact-1'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
                )
                .expect("stored imported contact");
            assert_eq!(creator, admin.id);
            for (ciphertext, plaintext) in [
                (&phone, "0900000001"),
                (&email, "synthetic@example.test"),
                (&address, "Fixture address"),
                (&bank, "000111222"),
            ] {
                assert!(ciphertext.starts_with("ENC:{\"v\":1,"));
                assert!(!ciphertext.contains(plaintext));
                assert_eq!(decrypt_field(ciphertext, Some(crypto)).unwrap(), plaintext);
            }
            let archive: String = db
                .query_row(
                    "SELECT legacy_payload_enc FROM crm_contact_import_rows WHERE source_contact_id='legacy-contact-1'",
                    [],
                    |row| row.get(0),
                )
                .expect("encrypted source archive");
            assert!(archive.starts_with("ENC:{\"v\":1,"));
            assert!(!archive.contains("0900000001"));
            let archived = decrypt_field(&archive, Some(crypto)).unwrap();
            let archived: serde_json::Value = serde_json::from_str(&archived).unwrap();
            assert!(!archived.to_string().contains("0900000001"));
            assert_eq!(
                decrypt_field(archived["phone"].as_str().unwrap(), Some(crypto)).unwrap(),
                "0900000001"
            );
            assert_eq!(archived["createdBy"], "untrusted-legacy-user");
            assert_eq!(
                db.query_row("SELECT COUNT(*) FROM crm_contact_import_runs", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
                1
            );
        }

        let contacts = call(
            &app,
            Method::GET,
            "/api/v1/crm/contacts",
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(contacts.status(), StatusCode::OK);
        let contacts = response_json(contacts).await;
        let customer = contacts["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|contact| contact["key"] == "legacy-contact-1")
            .expect("imported contact in list");
        assert_eq!(customer["code"], "KH-LEGACY-001");
        assert_eq!(customer["createdAt"], "2026-09-01T10:00:00Z");
        assert_eq!(customer["updatedAt"], "2026-09-02T11:00:00Z");
        assert_eq!(customer["phone"], "0900000001");
        assert_eq!(customer["legacyImportStatus"], "unverified");

        let mut reexport = bundle.clone();
        reexport["batchId"] = json!("f6dd5f79-f93b-4c0f-88fc-b8a4873bbd04");
        reexport["exportedAt"] = json!("2026-10-09T00:00:00Z");
        let replay = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-contacts/preview",
            &admin_token,
            json!({ "bundle": reexport }),
        )
        .await;
        let replay = response_json(replay).await;
        assert_eq!(replay["preview"]["alreadyImportedRecords"], 2);
        assert_eq!(replay["preview"]["importableRecords"], 0);
        assert_eq!(replay["preview"]["conflictedRecords"], 0);

        let mut changed = reexport;
        changed["contacts"][0]["name"] = json!("Changed fixture source");
        let changed = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-contacts/preview",
            &admin_token,
            json!({ "bundle": changed }),
        )
        .await;
        let changed = response_json(changed).await;
        assert_eq!(changed["preview"]["conflictedRecords"], 1);
        assert_eq!(changed["preview"]["alreadyImportedRecords"], 1);

        let (collision_app, collision_state, collision_admin, _) = fixture(true);
        let collision_token = bearer(&collision_state, &collision_admin);
        {
            let db = collision_state.db.lock().await;
            db.execute(
                "INSERT INTO crm_contacts (id,code,name,contact_type,created_by,created_at,updated_at)
                 VALUES ('legacy-contact-2','NCC-LEGACY-002','Existing target','supplier',?1,
                         '2026-09-01T00:00:00Z','2026-09-01T00:00:00Z')",
                params![collision_admin.id],
            )
            .expect("insert target collision fixture");
        }
        let collision_crypto = collision_state.crm_crypto.as_ref().unwrap();
        let collision_bundle = legacy_crm_contacts_bundle(collision_crypto);
        let collision_preview = call(
            &collision_app,
            Method::POST,
            "/api/v1/legacy-import/crm-contacts/preview",
            &collision_token,
            json!({ "bundle": collision_bundle }),
        )
        .await;
        let collision_preview = response_json(collision_preview).await;
        assert_eq!(collision_preview["preview"]["importableRecords"], 1);
        assert_eq!(collision_preview["preview"]["conflictedRecords"], 1);
        let collision_apply = call(
            &collision_app,
            Method::POST,
            "/api/v1/legacy-import/crm-contacts/apply",
            &collision_token,
            json!({
                "bundle": collision_bundle,
                "expectedPayloadSha256": collision_preview["preview"]["payloadSha256"],
                "confirmation": collision_preview["preview"]["confirmationPhrase"],
            }),
        )
        .await;
        assert_eq!(collision_apply.status(), StatusCode::CONFLICT);
        let collision_db = collision_state.db.lock().await;
        assert_eq!(
            collision_db
                .query_row("SELECT COUNT(*) FROM crm_contacts", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1,
            "one conflict must prevent importing every row in the batch"
        );
        assert_eq!(
            collision_db
                .query_row("SELECT COUNT(*) FROM crm_contact_import_runs", [], |row| {
                    row.get::<_, i64>(0)
                })
                .unwrap(),
            0
        );

        let (unkeyed_app, unkeyed_state, unkeyed_admin, _) = fixture(false);
        let unkeyed_crypto = CrmCrypto::for_test([0x42; 32], "v1");
        let unavailable = call(
            &unkeyed_app,
            Method::POST,
            "/api/v1/legacy-import/crm-contacts/preview",
            &bearer(&unkeyed_state, &unkeyed_admin),
            json!({ "bundle": legacy_crm_contacts_bundle(&unkeyed_crypto) }),
        )
        .await;
        assert_eq!(unavailable.status(), StatusCode::SERVICE_UNAVAILABLE);
    }

    #[tokio::test]
    async fn crm_legacy_import_recalculates_and_encrypts_with_idempotent_reexport() {
        let (app, state, admin, employee) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let bundle = legacy_crm_bundle();

        let preview = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-operations/preview",
            &admin_token,
            json!({ "bundle": bundle }),
        )
        .await;
        let preview_status = preview.status();
        let preview_body = response_json(preview).await;
        assert_eq!(preview_status, StatusCode::OK);
        let digest = preview_body["preview"]["payloadSha256"]
            .as_str()
            .expect("preview digest")
            .to_owned();
        let phrase = preview_body["preview"]["confirmationPhrase"]
            .as_str()
            .expect("confirmation phrase")
            .to_owned();

        let denied = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-operations/apply",
            &employee_token,
            json!({
                "bundle": bundle,
                "expectedPayloadSha256": digest,
                "confirmation": phrase,
            }),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let incorrect_confirmation = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-operations/apply",
            &admin_token,
            json!({
                "bundle": bundle,
                "expectedPayloadSha256": digest,
                "confirmation": "wrong",
            }),
        )
        .await;
        assert_eq!(
            incorrect_confirmation.status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );

        let applied = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-operations/apply",
            &admin_token,
            json!({
                "bundle": bundle,
                "expectedPayloadSha256": digest,
                "confirmation": phrase,
            }),
        )
        .await;
        assert_eq!(applied.status(), StatusCode::CREATED);
        let applied_body = response_json(applied).await;
        assert_eq!(applied_body["import"]["importedRecords"], 2);
        assert!(!applied_body.to_string().contains("0900000000"));

        {
            let db = state.db.lock().await;
            let evaluation: String = db
                .query_row(
                    "SELECT record_json FROM collection_records WHERE scope='crm_supplier_evaluations' AND record_key='legacy-eval-1'",
                    [],
                    |row| row.get(0),
                )
                .expect("persisted imported evaluation");
            let evaluation: serde_json::Value = serde_json::from_str(&evaluation).unwrap();
            assert_eq!(evaluation["totalScore"], 91);
            assert_eq!(evaluation["tier"], "Hạng A (Chiến lược)");
            assert_eq!(evaluation["legacyImportStatus"], "unverified");
            assert_eq!(evaluation["legacyTag"], "preserved-fixture");
            assert_eq!(evaluation["createdBy"], admin.id);
            assert_eq!(evaluation["legacyImportedBy"], admin.id);

            let feedback: String = db
                .query_row(
                    "SELECT record_json FROM collection_records WHERE scope='crm_feedback' AND record_key='legacy-feedback-1'",
                    [],
                    |row| row.get(0),
                )
                .expect("persisted imported feedback");
            let feedback: serde_json::Value = serde_json::from_str(&feedback).unwrap();
            let encrypted_phone = feedback["phone"].as_str().expect("stored encrypted phone");
            assert!(encrypted_phone.starts_with("ENC:{\"v\":1,"));
            assert!(!encrypted_phone.contains("0900000000"));
            assert_eq!(feedback["status"], "Đang xử lý");
            assert!(feedback["resolvedDate"].is_null());
            assert!(feedback.get("resolvedBy").is_none());
            assert!(feedback.get("resolvedAt").is_none());
            assert_eq!(feedback["legacyImportStatus"], "unverified");

            let encrypted_archive: String = db
                .query_row(
                    "SELECT legacy_payload_enc FROM crm_legacy_import_rows WHERE scope='crm_feedback'",
                    [],
                    |row| row.get(0),
                )
                .expect("encrypted feedback source archive");
            assert!(encrypted_archive.starts_with("ENC:{\"v\":1,"));
            assert!(!encrypted_archive.contains("0900000000"));
            let archived = decrypt_field(&encrypted_archive, state.crm_crypto.as_ref())
                .expect("decrypt source archive for test assertion");
            assert!(archived.contains("0900000000"));
            assert_eq!(
                db.query_row("SELECT COUNT(*) FROM crm_legacy_import_runs", [], |row| row
                    .get::<_, i64>(0))
                    .unwrap(),
                1
            );
        }

        let mut reexport = bundle.clone();
        reexport["batchId"] = json!("b213fbf9-e6d3-4b07-bde2-a7b2881c7048");
        reexport["exportedAt"] = json!("2026-10-09T00:00:00Z");
        let replay = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-operations/preview",
            &admin_token,
            json!({ "bundle": reexport }),
        )
        .await;
        let replay_body = response_json(replay).await;
        assert_eq!(replay_body["preview"]["alreadyImportedRecords"], 2);
        assert_eq!(replay_body["preview"]["importableRecords"], 0);
        assert_eq!(replay_body["preview"]["conflictedRecords"], 0);
        assert_eq!(replay_body["preview"]["canApply"], false);

        let mut changed_reexport = reexport;
        changed_reexport["supplierEvaluations"][0]["strengths"] = json!("Changed legacy source");
        let changed = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-operations/preview",
            &admin_token,
            json!({ "bundle": changed_reexport }),
        )
        .await;
        let changed_body = response_json(changed).await;
        assert_eq!(changed_body["preview"]["conflictedRecords"], 1);
        assert_eq!(changed_body["preview"]["canApply"], false);
    }

    #[tokio::test]
    async fn crm_legacy_import_stale_digest_and_bad_records_leave_no_partial_writes() {
        let (app, state, admin, _) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let bundle = legacy_crm_bundle();
        let preview = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-operations/preview",
            &admin_token,
            json!({ "bundle": bundle }),
        )
        .await;
        let preview_json = response_json(preview).await;
        let phrase = preview_json["preview"]["confirmationPhrase"]
            .as_str()
            .unwrap();

        let mut changed = bundle;
        changed["customerFeedback"][0]["content"] = json!("Changed after preview");
        let stale = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/crm-operations/apply",
            &admin_token,
            json!({
                "bundle": changed,
                "expectedPayloadSha256": preview_json["preview"]["payloadSha256"],
                "confirmation": phrase,
            }),
        )
        .await;
        assert_eq!(stale.status(), StatusCode::CONFLICT);

        let db = state.db.lock().await;
        let target_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM collection_records WHERE scope IN ('crm_supplier_evaluations','crm_feedback')",
                [],
                |row| row.get(0),
            )
            .expect("target count after stale apply");
        let run_count: i64 = db
            .query_row("SELECT COUNT(*) FROM crm_legacy_import_runs", [], |row| {
                row.get(0)
            })
            .expect("run count after stale apply");
        assert_eq!(target_count, 0);
        assert_eq!(run_count, 0);
    }
}
