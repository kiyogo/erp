use axum::{
    Json,
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, collection_revision, record_key, require_admin};

const FORMAT: &str = "kiyovn-legacy-asset-transfers";
const SCHEMA_VERSION: u32 = 1;
const MAX_RECORDS: usize = 10_000;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const MAX_RECORD_BYTES: usize = 128 * 1024;
const SCOPE: &str = "asset_transfers";
const IMPORT_MARKER: &str = "_kiyoLegacyImport";
const UNTRUSTED_ACTOR_FIELDS: &[&str] = &[
    "createdByUserId",
    "createdByName",
    "approvedByUserId",
    "approvedByName",
    "receiptRecordedByUserId",
    "receiptRecordedByName",
    "receiptMethod",
    "rejectedAt",
    "rejectedByUserId",
    "rejectedByName",
];

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyAssetTransfersBundle {
    format: String,
    schema_version: u32,
    source_mode: String,
    batch_id: String,
    source_origin: String,
    exported_at: String,
    records: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviewRequest {
    bundle: LegacyAssetTransfersBundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRequest {
    bundle: LegacyAssetTransfersBundle,
    expected_payload_sha256: String,
    confirmation: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Preview {
    batch_id: String,
    source_mode: String,
    payload_sha256: String,
    confirmation_phrase: String,
    source_records: usize,
    target_records: usize,
    importable_records: usize,
    already_imported_records: usize,
    conflicted_records: usize,
    legacy_approval_claims: usize,
    legacy_receipt_claims: usize,
    duplicate_transfer_code_records: usize,
    batch_already_applied: bool,
    can_apply: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    batch_id: String,
    imported_records: usize,
    already_imported_records: usize,
    imported_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Outcome {
    Import,
    AlreadyImported,
    Conflict,
}

#[derive(Debug)]
struct PlannedRecord {
    key: String,
    record: Value,
    outcome: Outcome,
}

#[derive(Debug)]
struct ImportPlan {
    records: Vec<PlannedRecord>,
    payload_sha256: String,
    target_records: usize,
    importable_records: usize,
    already_imported_records: usize,
    conflicted_records: usize,
    legacy_approval_claims: usize,
    legacy_receipt_claims: usize,
    duplicate_transfer_code_records: usize,
}

pub(super) async fn preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let request: PreviewRequest = parse_request(&body)?;
    validate_bundle(&request.bundle)?;

    let db = state.db.lock().await;
    let plan = build_plan(&db, &request.bundle)?;
    let batch_already_applied = batch_already_applied(&db, &request.bundle.batch_id)?;
    let can_apply =
        !batch_already_applied && plan.conflicted_records == 0 && plan.importable_records > 0;
    let confirmation_phrase =
        confirmation_phrase(&request.bundle.batch_id, request.bundle.records.len());
    Ok(Json(json!({ "preview": Preview {
        batch_id: request.bundle.batch_id.clone(),
        source_mode: request.bundle.source_mode.clone(),
        payload_sha256: plan.payload_sha256,
        confirmation_phrase,
        source_records: request.bundle.records.len(),
        target_records: plan.target_records,
        importable_records: plan.importable_records,
        already_imported_records: plan.already_imported_records,
        conflicted_records: plan.conflicted_records,
        legacy_approval_claims: plan.legacy_approval_claims,
        legacy_receipt_claims: plan.legacy_receipt_claims,
        duplicate_transfer_code_records: plan.duplicate_transfer_code_records,
        batch_already_applied,
        can_apply,
    }})))
}

pub(super) async fn apply(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let request: ApplyRequest = parse_request(&body)?;
    validate_bundle(&request.bundle)?;

    let expected_confirmation =
        confirmation_phrase(&request.bundle.batch_id, request.bundle.records.len());
    if request.confirmation != expected_confirmation {
        return Err(ApiError::unprocessable(format!(
            "Cụm xác nhận chưa chính xác. Hãy nhập: {expected_confirmation}"
        )));
    }
    if request.expected_payload_sha256.len() != 64
        || !request
            .expected_payload_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(ApiError::bad_request("SHA-256 xem trước không hợp lệ."));
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let plan = build_plan(&transaction, &request.bundle)?;
    if request.expected_payload_sha256 != plan.payload_sha256 {
        return Err(ApiError::conflict(
            "Gói nguồn hoặc collection điều chuyển đã thay đổi kể từ lần xem trước. Hãy xem trước lại.",
        ));
    }
    if batch_already_applied(&transaction, &request.bundle.batch_id)? {
        return Err(ApiError::conflict(
            "Lô nhập này đã được áp dụng trước đó; không thể dùng lại mã lô.",
        ));
    }
    if plan.conflicted_records > 0 {
        return Err(ApiError::conflict(
            "Có khóa điều chuyển trùng với nội dung khác. Không có bản ghi nào được nhập.",
        ));
    }
    if plan.importable_records == 0 {
        return Err(ApiError::conflict(
            "Không còn lệnh điều chuyển mới để nhập; không có thay đổi nào được thực hiện.",
        ));
    }

    let imported_at = chrono::Utc::now().to_rfc3339();
    for planned in &plan.records {
        if planned.outcome != Outcome::Import {
            continue;
        }
        let serialized = serde_json::to_string(&planned.record).map_err(ApiError::internal)?;
        transaction
            .execute(
                "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
                params![SCOPE, planned.key, serialized, imported_at],
            )
            .map_err(|_| {
                ApiError::conflict(
                    "Không thể thêm lệnh do collection đích vừa thay đổi. Không ghi đè dữ liệu.",
                )
            })?;
    }

    let audit_counts = serde_json::to_string(&json!({
        "scope": SCOPE,
        "sourceMode": request.bundle.source_mode,
        "sourceRecords": request.bundle.records.len(),
        "importedRecords": plan.importable_records,
        "alreadyImportedRecords": plan.already_imported_records,
        "legacyApprovalClaims": plan.legacy_approval_claims,
        "legacyReceiptClaims": plan.legacy_receipt_claims,
        "duplicateTransferCodeRecords": plan.duplicate_transfer_code_records,
    }))
    .map_err(ApiError::internal)?;
    let bundle_sha256 = bundle_digest(&request.bundle)?;
    transaction
        .execute(
            "INSERT INTO legacy_import_runs (batch_id, actor_user_id, source_origin, exported_at, imported_at, payload_sha256, scope_counts_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                request.bundle.batch_id,
                actor.id,
                request.bundle.source_origin,
                request.bundle.exported_at,
                imported_at,
                bundle_sha256,
                audit_counts,
            ],
        )
        .map_err(|_| ApiError::conflict("Mã lô nhập đã được sử dụng."))?;
    transaction.commit().map_err(ApiError::internal)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({ "import": ImportResult {
            batch_id: request.bundle.batch_id,
            imported_records: plan.importable_records,
            already_imported_records: plan.already_imported_records,
            imported_at,
        }})),
    ))
}

fn parse_request<T: for<'de> Deserialize<'de>>(body: &[u8]) -> ApiResult<T> {
    if body.len() > MAX_BODY_BYTES {
        return Err(ApiError::bad_request("Tệp nhập vượt quá giới hạn 8 MiB."));
    }
    serde_json::from_slice(body)
        .map_err(|_| ApiError::bad_request("JSON nhập không hợp lệ hoặc không đúng cấu trúc."))
}

fn validate_bundle(bundle: &LegacyAssetTransfersBundle) -> ApiResult<()> {
    if bundle.format != FORMAT || bundle.schema_version != SCHEMA_VERSION {
        return Err(ApiError::unprocessable(
            "Định dạng hoặc phiên bản gói điều chuyển legacy không được hỗ trợ.",
        ));
    }
    if !matches!(
        bundle.source_mode.as_str(),
        "server_collection" | "browser_cache_fallback"
    ) {
        return Err(ApiError::unprocessable(
            "Nguồn dữ liệu điều chuyển không hợp lệ.",
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
        .map_err(|_| ApiError::unprocessable("Thời điểm xuất dữ liệu phải là RFC 3339."))?;
    if bundle.records.is_empty() || bundle.records.len() > MAX_RECORDS {
        return Err(ApiError::unprocessable(format!(
            "Gói điều chuyển phải có từ 1 đến {MAX_RECORDS} bản ghi."
        )));
    }

    let mut keys = HashSet::with_capacity(bundle.records.len());
    for record in &bundle.records {
        let key = validate_record_key(record)?;
        if !keys.insert(key) {
            return Err(ApiError::unprocessable(
                "Gói điều chuyển chứa khóa bản ghi trùng lặp.",
            ));
        }
        let bytes = serde_json::to_vec(record)
            .map_err(ApiError::internal)?
            .len();
        if bytes > MAX_RECORD_BYTES {
            return Err(ApiError::unprocessable(
                "Một lệnh điều chuyển vượt quá giới hạn 128 KiB.",
            ));
        }
    }
    let serialized = serde_json::to_vec(bundle).map_err(ApiError::internal)?;
    if serialized.len() > MAX_BODY_BYTES {
        return Err(ApiError::unprocessable(
            "Gói điều chuyển vượt quá giới hạn 8 MiB.",
        ));
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

fn validate_record_key(record: &Value) -> ApiResult<String> {
    let candidate = record
        .get("key")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::unprocessable("Lệnh điều chuyển thiếu key dạng chuỗi."))?;
    if candidate.is_empty()
        || candidate.trim() != candidate
        || candidate.len() > 160
        || candidate.chars().any(char::is_control)
    {
        return Err(ApiError::unprocessable(
            "Lệnh điều chuyển có key không hợp lệ.",
        ));
    }
    if !record.is_object() {
        return Err(ApiError::unprocessable(
            "Lệnh điều chuyển phải là một đối tượng JSON.",
        ));
    }
    if record.get(IMPORT_MARKER).is_some() {
        return Err(ApiError::unprocessable(
            "Nguồn chứa trường dành riêng cho dấu nhập Rust; từ chối ghi đè metadata.",
        ));
    }
    record_key(record).map_err(|_| ApiError::unprocessable("Khóa lệnh điều chuyển không hợp lệ."))
}

fn build_plan(db: &Connection, bundle: &LegacyAssetTransfersBundle) -> ApiResult<ImportPlan> {
    let existing = {
        let mut statement = db
            .prepare(
                "SELECT record_key, record_json FROM collection_records WHERE scope = ?1 ORDER BY record_key COLLATE BINARY ASC",
            )
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map(params![SCOPE], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(ApiError::internal)?;
        rows.map(|row| {
            let (key, raw) = row.map_err(ApiError::internal)?;
            let record = serde_json::from_str::<Value>(&raw).map_err(ApiError::internal)?;
            Ok((key, record))
        })
        .collect::<ApiResult<HashMap<_, _>>>()?
    };

    let mut importable_records = 0;
    let mut already_imported_records = 0;
    let mut conflicted_records = 0;
    let mut legacy_approval_claims = 0;
    let mut legacy_receipt_claims = 0;
    let mut transfer_codes: HashMap<String, usize> = HashMap::new();
    let mut duplicate_transfer_code_records = 0;
    let records = bundle
        .records
        .iter()
        .map(|source| {
            let key = validate_record_key(source)?;
            let status = source
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let approval_timestamp = has_nonempty_string(source, "approvedAt");
            if approval_timestamp
                || matches!(
                    status,
                    "Đang vận chuyển" | "Đã điều chuyển hoàn tất" | "Từ chối điều chuyển"
                )
            {
                legacy_approval_claims += 1;
            }
            if has_nonempty_string(source, "receivedDate") || status == "Đã điều chuyển hoàn tất"
            {
                legacy_receipt_claims += 1;
            }
            if let Some(code) = source
                .get("transferCode")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|code| !code.is_empty())
            {
                let count = transfer_codes.entry(code.to_lowercase()).or_default();
                if *count > 0 {
                    duplicate_transfer_code_records += 1;
                }
                *count += 1;
            }

            let outcome = match existing.get(&key) {
                None => {
                    importable_records += 1;
                    Outcome::Import
                }
                Some(existing) if same_legacy_record(existing, source) => {
                    already_imported_records += 1;
                    Outcome::AlreadyImported
                }
                Some(_) => {
                    conflicted_records += 1;
                    Outcome::Conflict
                }
            };
            let record = if outcome == Outcome::Import {
                record_with_import_marker(source, bundle)
            } else {
                source.clone()
            };
            Ok(PlannedRecord {
                key,
                record,
                outcome,
            })
        })
        .collect::<ApiResult<Vec<_>>>()?;

    let bundle_sha256 = bundle_digest(bundle)?;
    let revision = collection_revision(db, SCOPE)?;
    let mut hasher = Sha256::new();
    hasher.update(b"kiyovn-asset-transfers-import-plan-v1\0");
    hasher.update(bundle_sha256.as_bytes());
    hasher.update(b"\0");
    hasher.update(revision.as_bytes());
    let payload_sha256 = hex_digest(hasher.finalize().as_slice());

    Ok(ImportPlan {
        records,
        payload_sha256,
        target_records: existing.len(),
        importable_records,
        already_imported_records,
        conflicted_records,
        legacy_approval_claims,
        legacy_receipt_claims,
        duplicate_transfer_code_records,
    })
}

fn has_nonempty_string(record: &Value, field: &str) -> bool {
    record
        .get(field)
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty())
}

fn record_with_import_marker(source: &Value, bundle: &LegacyAssetTransfersBundle) -> Value {
    let mut record = source.clone();
    let mut untrusted_source_fields = serde_json::Map::new();
    let fields = record
        .as_object_mut()
        .expect("validated transfer record is an object");
    for field in UNTRUSTED_ACTOR_FIELDS {
        if let Some(value) = fields.remove(*field) {
            untrusted_source_fields.insert((*field).to_owned(), value);
        }
    }
    record[IMPORT_MARKER] = json!({
        "format": FORMAT,
        "batchId": bundle.batch_id,
        "sourceMode": bundle.source_mode,
        "verification": "unverified",
        "untrustedSourceFields": untrusted_source_fields,
    });
    record
}

fn same_legacy_record(existing: &Value, source: &Value) -> bool {
    let Some(marker) = existing.get(IMPORT_MARKER).and_then(Value::as_object) else {
        return false;
    };
    if marker.get("format").and_then(Value::as_str) != Some(FORMAT)
        || marker.get("verification").and_then(Value::as_str) != Some("unverified")
        || marker.get("batchId").and_then(Value::as_str).is_none()
        || !matches!(
            marker.get("sourceMode").and_then(Value::as_str),
            Some("server_collection" | "browser_cache_fallback")
        )
    {
        return false;
    }
    let Some(untrusted_source_fields) = marker
        .get("untrustedSourceFields")
        .and_then(Value::as_object)
    else {
        return false;
    };
    if untrusted_source_fields
        .keys()
        .any(|field| !UNTRUSTED_ACTOR_FIELDS.contains(&field.as_str()))
    {
        return false;
    }
    let mut unmarked = existing.clone();
    let Some(fields) = unmarked.as_object_mut() else {
        return false;
    };
    fields.remove(IMPORT_MARKER);
    for (field, value) in untrusted_source_fields {
        if fields.insert(field.clone(), value.clone()).is_some() {
            return false;
        }
    }
    &unmarked == source
}

fn bundle_digest(bundle: &LegacyAssetTransfersBundle) -> ApiResult<String> {
    let bytes = serde_json::to_vec(bundle).map_err(ApiError::internal)?;
    Ok(hex_digest(Sha256::digest(bytes).as_slice()))
}

fn hex_digest(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn batch_already_applied(db: &Connection, batch_id: &str) -> ApiResult<bool> {
    db.query_row(
        "SELECT 1 FROM legacy_import_runs WHERE batch_id = ?1",
        params![batch_id],
        |_| Ok(()),
    )
    .optional()
    .map(|found| found.is_some())
    .map_err(ApiError::internal)
}

fn confirmation_phrase(batch_id: &str, source_records: usize) -> String {
    format!("NHẬP ASSET_TRANSFERS {source_records} {batch_id}")
}

#[cfg(test)]
mod tests {
    use super::{LegacyAssetTransfersBundle, record_with_import_marker, validate_bundle};
    use crate::{AppState, User, init_database, issue_token, router};
    use axum::{
        Router,
        body::{Body, to_bytes},
        http::{Method, Request, StatusCode},
        response::Response,
    };
    use rusqlite::{Connection, params};
    use serde_json::{Value, json};
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;

    fn fixture() -> (Router, AppState, User, User) {
        let db = Connection::open_in_memory().expect("test DB");
        init_database(&db).expect("schema");
        let now = chrono::Utc::now().to_rfc3339();
        let admin = user("transfer-import-admin", "admin@example.test", "ADMIN", &now);
        let employee = user("transfer-import-user", "user@example.test", "USER", &now);
        for user in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test-hash',1,?5,?5)",
                params![user.id, user.email, user.name, user.role, now],
            ).expect("insert user");
        }
        let secret = b"asset-transfer-import-test-secret-at-least-32-bytes";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: None,
        };
        (
            router(state.clone(), tower_http::cors::CorsLayer::new()),
            state,
            admin,
            employee,
        )
    }

    fn user(id: &str, email: &str, role: &str, now: &str) -> User {
        User {
            id: id.into(),
            email: email.into(),
            name: format!("Test {role}"),
            role: role.into(),
            is_active: true,
            created_at: now.into(),
            updated_at: now.into(),
        }
    }

    fn bearer(state: &AppState, user: &User) -> String {
        format!("Bearer {}", issue_token(state, user).expect("JWT"))
    }

    fn transfer(key: &str, code: &str, status: &str) -> Value {
        json!({
            "key": key, "transferCode": code, "assetCode": "ASSET-PRIVATE-01",
            "assetName": "Synthetic laptop", "category": "IT", "serialNo": "SERIAL-PRIVATE-01",
            "originalPrice": 30000000, "netBookValue": 25000000,
            "fromLocation": "Kho A", "fromDepartment": "IT", "fromCustodian": "Synthetic sender",
            "toLocation": "Kho B", "toDepartment": "Finance", "toCustodian": "Synthetic receiver",
            "carrierName": "Synthetic carrier", "trackingCode": "TRACK-PRIVATE-1", "shippingCost": 50000,
            "transferDate": "2026-10-08", "expectedDeliveryDate": "2026-10-09",
            "receivedDate": if status == "Đã điều chuyển hoàn tất" { Some("2026-10-09 09:00") } else { None },
            "reason": "Synthetic legacy reason", "approver": "Legacy free text",
            "approvedAt": if status == "Chờ phê duyệt" { None } else { Some("2026-10-08 15:00") },
            "createdByUserId": "legacy-untrusted-created-id", "createdByName": "Legacy claimed creator",
            "approvedByUserId": "legacy-untrusted-approver-id", "approvedByName": "Legacy claimed approver",
            "receiptRecordedByUserId": "legacy-untrusted-receiver-id", "receiptRecordedByName": "Legacy claimed receiver",
            "receiptMethod": "authenticated_admin_record", "rejectedAt": "legacy-untrusted-time",
            "rejectedByUserId": "legacy-untrusted-rejector-id", "rejectedByName": "Legacy claimed rejector",
            "status": status, "condition": "Synthetic packaged condition",
            "receiveCondition": if status == "Đã điều chuyển hoàn tất" { Some("Synthetic received condition") } else { None },
            "notes": "Synthetic internal note", "legacyExtension": { "preserve": true }
        })
    }

    fn bundle(batch: &str, records: Vec<Value>) -> Value {
        json!({
            "format":"kiyovn-legacy-asset-transfers", "schemaVersion":1,
            "sourceMode":"server_collection", "batchId":batch,
            "sourceOrigin":"https://legacy.example.test", "exportedAt":"2026-10-09T10:00:00Z",
            "records":records,
        })
    }

    async fn call(app: &Router, method: Method, uri: &str, token: &str, body: Value) -> Response {
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

    async fn response_json(response: Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 1024 * 1024)
                .await
                .expect("body"),
        )
        .expect("JSON")
    }

    #[test]
    fn bundle_rejects_invalid_source_mode_duplicate_keys_and_reserved_marker() {
        let batch = "2a2a2a2a-2a2a-42aa-8aaa-2a2a2a2a2a2a";
        let valid: LegacyAssetTransfersBundle = serde_json::from_value(bundle(
            batch,
            vec![transfer(
                "legacy-transfer-1",
                "DC-1",
                "Đã điều chuyển hoàn tất",
            )],
        ))
        .expect("bundle DTO");
        assert!(validate_bundle(&valid).is_ok());

        let mut wrong_source = bundle(
            batch,
            vec![transfer("legacy-transfer-1", "DC-1", "Chờ phê duyệt")],
        );
        wrong_source["sourceMode"] = json!("untrusted");
        let parsed: LegacyAssetTransfersBundle = serde_json::from_value(wrong_source).expect("DTO");
        assert!(validate_bundle(&parsed).is_err());

        let duplicate = bundle(
            batch,
            vec![
                transfer("legacy-transfer-1", "DC-1", "Chờ phê duyệt"),
                transfer("legacy-transfer-1", "DC-2", "Chờ phê duyệt"),
            ],
        );
        let parsed: LegacyAssetTransfersBundle = serde_json::from_value(duplicate).expect("DTO");
        assert!(validate_bundle(&parsed).is_err());

        let mut reserved = transfer("legacy-transfer-2", "DC-2", "Chờ phê duyệt");
        reserved["_kiyoLegacyImport"] = json!({"verification":"verified"});
        let parsed: LegacyAssetTransfersBundle =
            serde_json::from_value(bundle(batch, vec![reserved])).expect("DTO");
        assert!(validate_bundle(&parsed).is_err());
    }

    #[tokio::test]
    async fn preview_is_admin_only_summary_only_and_counts_unverified_claims_and_duplicate_codes() {
        let (app, state, admin, employee) = fixture();
        let source = bundle(
            "3b3b3b3b-3b3b-43bb-8bbb-3b3b3b3b3b3b",
            vec![
                transfer("legacy-transfer-1", "DC-DUP", "Đã điều chuyển hoàn tất"),
                transfer("legacy-transfer-2", "dc-dup", "Đang vận chuyển"),
            ],
        );
        let uri = "/api/v1/legacy-import/asset-transfers/preview";
        let denied = call(
            &app,
            Method::POST,
            uri,
            &bearer(&state, &employee),
            json!({"bundle":source}),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
        let response = call(
            &app,
            Method::POST,
            uri,
            &bearer(&state, &admin),
            json!({"bundle":source}),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response_json(response).await;
        let preview = &body["preview"];
        assert_eq!(preview["sourceRecords"], 2);
        assert_eq!(preview["importableRecords"], 2);
        assert_eq!(preview["legacyApprovalClaims"], 2);
        assert_eq!(preview["legacyReceiptClaims"], 1);
        assert_eq!(preview["duplicateTransferCodeRecords"], 1);
        assert_eq!(
            preview["canApply"], true,
            "duplicate legacy business codes are preserved, not blocked"
        );
        assert!(!body.to_string().contains("SERIAL-PRIVATE-01"));
        assert!(!body.to_string().contains("Synthetic receiver"));

        let db = state.db.lock().await;
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM collection_records WHERE scope='asset_transfers'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .expect("count"),
            0
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM legacy_import_runs", [], |row| row
                .get::<_, i64>(0))
                .expect("run count"),
            0
        );
    }

    #[tokio::test]
    async fn apply_appends_exact_source_fields_and_unverified_marker_without_overwriting() {
        let (app, state, admin, _) = fixture();
        let token = bearer(&state, &admin);
        let original = transfer("legacy-existing", "DC-EXISTING", "Chờ phê duyệt");
        let earlier_bundle: LegacyAssetTransfersBundle = serde_json::from_value(bundle(
            "11111111-1111-4111-8111-111111111111",
            vec![original.clone()],
        ))
        .expect("earlier imported bundle");
        let previously_imported = record_with_import_marker(&original, &earlier_bundle);
        {
            let db = state.db.lock().await;
            db.execute("INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('asset_transfers','legacy-existing',?1,'2026-10-01','2026-10-01')", params![previously_imported.to_string()]).expect("seed existing");
        }
        let source = bundle(
            "4c4c4c4c-4c4c-44cc-8ccc-4c4c4c4c4c4c",
            vec![
                original.clone(),
                transfer("legacy-new", "DC-NEW", "Đã điều chuyển hoàn tất"),
            ],
        );
        let preview = response_json(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/asset-transfers/preview",
                &token,
                json!({"bundle":source}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        assert_eq!(preview["importableRecords"], 1);
        assert_eq!(preview["alreadyImportedRecords"], 1);
        let applied = call(&app, Method::POST, "/api/v1/legacy-import/asset-transfers/apply", &token, json!({
            "bundle":source, "expectedPayloadSha256":preview["payloadSha256"], "confirmation":preview["confirmationPhrase"],
        })).await;
        assert_eq!(applied.status(), StatusCode::CREATED);
        let result = response_json(applied).await;
        assert_eq!(result["import"]["importedRecords"], 1);
        assert_eq!(result["import"]["alreadyImportedRecords"], 1);

        let db = state.db.lock().await;
        let saved: String = db.query_row("SELECT record_json FROM collection_records WHERE scope='asset_transfers' AND record_key='legacy-new'", [], |row| row.get(0)).expect("imported record");
        let saved: Value = serde_json::from_str(&saved).expect("JSON");
        let imported_bundle: LegacyAssetTransfersBundle =
            serde_json::from_value(source.clone()).expect("imported bundle");
        let expected = record_with_import_marker(&imported_bundle.records[1], &imported_bundle);
        let marker = saved.get("_kiyoLegacyImport").expect("marker");
        assert_eq!(marker["format"], "kiyovn-legacy-asset-transfers");
        assert_eq!(marker["verification"], "unverified");
        assert_eq!(marker["sourceMode"], "server_collection");
        assert_eq!(
            saved, expected,
            "all legacy fields including unknown extension survive"
        );
        assert!(saved.get("approvedByUserId").is_none());
        assert_eq!(
            marker["untrustedSourceFields"]["approvedByUserId"],
            "legacy-untrusted-approver-id"
        );
        assert_eq!(
            marker["untrustedSourceFields"]["receiptMethod"],
            "authenticated_admin_record"
        );
        assert_eq!(db.query_row("SELECT record_json FROM collection_records WHERE scope='asset_transfers' AND record_key='legacy-existing'", [], |row| row.get::<_, String>(0)).expect("untouched"), previously_imported.to_string());
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM legacy_import_runs", [], |row| row
                .get::<_, i64>(0))
                .expect("audit run"),
            1
        );
    }

    #[tokio::test]
    async fn conflicts_stale_preview_and_wrong_confirmation_do_not_partially_apply() {
        let (app, state, admin, _) = fixture();
        let token = bearer(&state, &admin);
        let collision = transfer("transfer-collision", "DC-EXISTING", "Chờ phê duyệt");
        {
            let db = state.db.lock().await;
            db.execute("INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('asset_transfers','transfer-collision',?1,'2026-10-01','2026-10-01')", params![collision.to_string()]).expect("seed collision");
        }
        let conflicting = bundle(
            "5d5d5d5d-5d5d-45dd-8ddd-5d5d5d5d5d5d",
            vec![transfer("transfer-collision", "DIFFERENT", "Chờ phê duyệt")],
        );
        let preview = response_json(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/asset-transfers/preview",
                &token,
                json!({"bundle":conflicting}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        assert_eq!(preview["conflictedRecords"], 1);
        assert_eq!(preview["canApply"], false);

        let stale = bundle(
            "6e6e6e6e-6e6e-46ee-8eee-6e6e6e6e6e6e",
            vec![transfer("transfer-new", "DC-NEW", "Chờ phê duyệt")],
        );
        let stale_preview = response_json(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/asset-transfers/preview",
                &token,
                json!({"bundle":stale}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        {
            let db = state.db.lock().await;
            db.execute("INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('asset_transfers','unrelated-rust-record','{}','2026-10-01','2026-10-01')", []).expect("change revision");
        }
        let response = call(&app, Method::POST, "/api/v1/legacy-import/asset-transfers/apply", &token, json!({
            "bundle":stale, "expectedPayloadSha256":stale_preview["payloadSha256"], "confirmation":stale_preview["confirmationPhrase"],
        })).await;
        assert_eq!(response.status(), StatusCode::CONFLICT);
        let body = response_json(response).await;
        assert!(
            body["message"]
                .as_str()
                .unwrap_or_default()
                .contains("đã thay đổi")
        );

        let db = state.db.lock().await;
        assert_eq!(db.query_row("SELECT COUNT(*) FROM collection_records WHERE scope='asset_transfers' AND record_key='transfer-new'", [], |row| row.get::<_, i64>(0)).expect("no partial insert"), 0);
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM legacy_import_runs", [], |row| row
                .get::<_, i64>(0))
                .expect("no audit run"),
            0
        );
    }

    #[test]
    fn imported_record_marker_does_not_mutate_legacy_business_fields() {
        let parsed: LegacyAssetTransfersBundle = serde_json::from_value(bundle(
            "7f7f7f7f-7f7f-47ff-8fff-7f7f7f7f7f7f",
            vec![transfer("transfer-marker", "DC-1", "Đang vận chuyển")],
        ))
        .expect("bundle");
        let original = parsed.records[0].clone();
        let stored = record_with_import_marker(&original, &parsed);
        assert_eq!(stored["transferCode"], original["transferCode"]);
        assert_eq!(stored["status"], original["status"]);
        assert_eq!(stored["approvedAt"], original["approvedAt"]);
        assert_eq!(stored["_kiyoLegacyImport"]["verification"], "unverified");
        assert!(stored.get("approvedByUserId").is_none());
        assert_eq!(
            stored["_kiyoLegacyImport"]["untrustedSourceFields"]["approvedByUserId"],
            "legacy-untrusted-approver-id"
        );
        assert_eq!(
            stored["_kiyoLegacyImport"]["untrustedSourceFields"]["receiptMethod"],
            "authenticated_admin_record"
        );
    }
}
