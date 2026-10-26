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

const FORMAT: &str = "kiyovn-legacy-asset-maintenances";
const SCHEMA_VERSION: u32 = 1;
const MAX_RECORDS: usize = 10_000;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const MAX_RECORD_BYTES: usize = 128 * 1024;
const SCOPE: &str = "asset_maintenances";
const IMPORT_MARKER: &str = "_kiyoLegacyImport";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyAssetMaintenancesBundle {
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
    bundle: LegacyAssetMaintenancesBundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRequest {
    bundle: LegacyAssetMaintenancesBundle,
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
    duplicate_maintenance_codes: usize,
    legacy_completion_claims: usize,
    legacy_certificate_claims: usize,
    legacy_completed_checklist_records: usize,
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
    duplicate_maintenance_codes: usize,
    legacy_completion_claims: usize,
    legacy_certificate_claims: usize,
    legacy_completed_checklist_records: usize,
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
        duplicate_maintenance_codes: plan.duplicate_maintenance_codes,
        legacy_completion_claims: plan.legacy_completion_claims,
        legacy_certificate_claims: plan.legacy_certificate_claims,
        legacy_completed_checklist_records: plan.legacy_completed_checklist_records,
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
            "Gói nguồn hoặc collection bảo dưỡng đã thay đổi kể từ lần xem trước. Hãy xem trước lại.",
        ));
    }
    if batch_already_applied(&transaction, &request.bundle.batch_id)? {
        return Err(ApiError::conflict(
            "Lô nhập này đã được áp dụng trước đó; không thể dùng lại mã lô.",
        ));
    }
    if plan.conflicted_records > 0 {
        return Err(ApiError::conflict(
            "Có key bảo dưỡng trùng với nội dung khác. Không có bản ghi nào được nhập.",
        ));
    }
    if plan.importable_records == 0 {
        return Err(ApiError::conflict(
            "Không còn kế hoạch mới để nhập; không có thay đổi nào được thực hiện.",
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
                    "Không thể thêm kế hoạch do collection đích vừa thay đổi. Không ghi đè dữ liệu.",
                )
            })?;
    }

    let audit_counts = serde_json::to_string(&json!({
        "scope": SCOPE,
        "sourceMode": request.bundle.source_mode,
        "sourceRecords": request.bundle.records.len(),
        "importedRecords": plan.importable_records,
        "alreadyImportedRecords": plan.already_imported_records,
        "duplicateMaintenanceCodes": plan.duplicate_maintenance_codes,
        "legacyCompletionClaims": plan.legacy_completion_claims,
        "legacyCertificateClaims": plan.legacy_certificate_claims,
        "legacyCompletedChecklistRecords": plan.legacy_completed_checklist_records,
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
    transaction
        .execute(
            "INSERT INTO audit_events (id, actor_id, action, resource_scope, resource_id, details_json, created_at, actor_name, actor_email) VALUES (?1, ?2, 'legacy_asset_maintenances_imported', ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                actor.id,
                SCOPE,
                request.bundle.batch_id,
                audit_counts,
                imported_at,
                actor.name,
                actor.email,
            ],
        )
        .map_err(ApiError::internal)?;
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

fn validate_bundle(bundle: &LegacyAssetMaintenancesBundle) -> ApiResult<()> {
    if bundle.format != FORMAT || bundle.schema_version != SCHEMA_VERSION {
        return Err(ApiError::unprocessable(
            "Định dạng hoặc phiên bản gói bảo dưỡng legacy không được hỗ trợ.",
        ));
    }
    if !matches!(
        bundle.source_mode.as_str(),
        "server_collection" | "browser_cache_fallback"
    ) {
        return Err(ApiError::unprocessable(
            "Nguồn dữ liệu bảo dưỡng không hợp lệ.",
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
            "Gói bảo dưỡng phải có từ 1 đến {MAX_RECORDS} bản ghi."
        )));
    }
    let mut keys = HashSet::with_capacity(bundle.records.len());
    for record in &bundle.records {
        let key = validate_record_key(record)?;
        if !keys.insert(key) {
            return Err(ApiError::unprocessable(
                "Gói bảo dưỡng chứa key bản ghi trùng lặp.",
            ));
        }
        let bytes = serde_json::to_vec(record)
            .map_err(ApiError::internal)?
            .len();
        if bytes > MAX_RECORD_BYTES {
            return Err(ApiError::unprocessable(
                "Một kế hoạch bảo dưỡng vượt quá 128 KiB.",
            ));
        }
    }
    if serde_json::to_vec(bundle)
        .map_err(ApiError::internal)?
        .len()
        > MAX_BODY_BYTES
    {
        return Err(ApiError::unprocessable(
            "Gói bảo dưỡng vượt quá giới hạn 8 MiB.",
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
    if !record.is_object() {
        return Err(ApiError::unprocessable(
            "Kế hoạch bảo dưỡng phải là đối tượng JSON.",
        ));
    }
    let candidate = record
        .get("key")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::unprocessable("Kế hoạch bảo dưỡng thiếu key dạng chuỗi."))?;
    if candidate.is_empty()
        || candidate.trim() != candidate
        || candidate.len() > 160
        || candidate.chars().any(char::is_control)
    {
        return Err(ApiError::unprocessable(
            "Kế hoạch bảo dưỡng có key không hợp lệ.",
        ));
    }
    if record.get(IMPORT_MARKER).is_some() {
        return Err(ApiError::unprocessable(
            "Nguồn chứa trường dành riêng cho dấu nhập Rust; từ chối ghi đè metadata.",
        ));
    }
    record_key(record).map_err(|_| ApiError::unprocessable("Key kế hoạch bảo dưỡng không hợp lệ."))
}

fn build_plan(db: &Connection, bundle: &LegacyAssetMaintenancesBundle) -> ApiResult<ImportPlan> {
    let existing = {
        let mut statement = db
            .prepare("SELECT record_key, record_json FROM collection_records WHERE scope = ?1 ORDER BY record_key COLLATE BINARY ASC")
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map(params![SCOPE], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(ApiError::internal)?;
        rows.map(|row| {
            let (key, raw) = row.map_err(ApiError::internal)?;
            Ok((
                key,
                serde_json::from_str::<Value>(&raw).map_err(ApiError::internal)?,
            ))
        })
        .collect::<ApiResult<HashMap<_, _>>>()?
    };

    let mut importable_records = 0;
    let mut already_imported_records = 0;
    let mut conflicted_records = 0;
    let mut completion_claims = 0;
    let mut certificate_claims = 0;
    let mut completed_checklist_records = 0;
    let mut codes: HashMap<String, usize> = HashMap::new();
    let mut duplicate_maintenance_codes = 0;
    let records = bundle
        .records
        .iter()
        .map(|source| {
            let key = validate_record_key(source)?;
            let status = source
                .get("status")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if status == "Đã hoàn thành đúng lịch" || has_nonempty_string(source, "performedAt")
            {
                completion_claims += 1;
            }
            if has_nonempty_string(source, "certificateCode") {
                certificate_claims += 1;
            }
            if source
                .get("checklist")
                .and_then(Value::as_array)
                .is_some_and(|items| {
                    !items.is_empty()
                        && items
                            .iter()
                            .all(|item| item.get("done").and_then(Value::as_bool) == Some(true))
                })
            {
                completed_checklist_records += 1;
            }
            if let Some(code) = source
                .get("maintCode")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|code| !code.is_empty())
            {
                let count = codes.entry(code.to_lowercase()).or_default();
                if *count > 0 {
                    duplicate_maintenance_codes += 1;
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
    hasher.update(b"kiyovn-asset-maintenances-import-plan-v1\0");
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
        duplicate_maintenance_codes,
        legacy_completion_claims: completion_claims,
        legacy_certificate_claims: certificate_claims,
        legacy_completed_checklist_records: completed_checklist_records,
    })
}

fn has_nonempty_string(record: &Value, field: &str) -> bool {
    record
        .get(field)
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty())
}

fn record_with_import_marker(source: &Value, bundle: &LegacyAssetMaintenancesBundle) -> Value {
    let mut record = source.clone();
    record[IMPORT_MARKER] = json!({
        "format": FORMAT,
        "batchId": bundle.batch_id,
        "sourceMode": bundle.source_mode,
        "verification": "unverified",
        "sourceOrigin": bundle.source_origin,
        "exportedAt": bundle.exported_at,
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
        || marker.get("sourceOrigin").and_then(Value::as_str).is_none()
        || marker.get("exportedAt").and_then(Value::as_str).is_none()
    {
        return false;
    }
    let mut unmarked = existing.clone();
    let Some(fields) = unmarked.as_object_mut() else {
        return false;
    };
    fields.remove(IMPORT_MARKER);
    &unmarked == source
}

fn bundle_digest(bundle: &LegacyAssetMaintenancesBundle) -> ApiResult<String> {
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
    format!("NHẬP ASSET_MAINTENANCES {source_records} {batch_id}")
}

#[cfg(test)]
mod tests {
    use super::{LegacyAssetMaintenancesBundle, record_with_import_marker, validate_bundle};
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
        let admin = user(
            "maintenance-import-admin",
            "admin@example.test",
            "ADMIN",
            &now,
        );
        let employee = user("maintenance-import-user", "user@example.test", "USER", &now);
        for user in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test-hash',1,?5,?5)",
                params![user.id, user.email, user.name, user.role, now],
            ).expect("insert user");
        }
        let secret = b"maintenance-import-test-secret-at-least-32-bytes";
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

    fn maintenance(key: &str, code: &str) -> Value {
        json!({
            "key":key,
            "maintCode":code,
            "systemName":"Synthetic server",
            "category":"IDC",
            "assetCodes":"AS-01",
            "location":"Synthetic room",
            "frequency":"Hàng quý (3 tháng)",
            "maintenanceType":"Phòng ngừa định kỳ (PM)",
            "slaLevel":"SLA Gold (8h)",
            "lastDate":"2026-10-01",
            "nextDate":"2027-01-01",
            "responsibleEngineer":"Synthetic engineer",
            "vendorPartner":"Synthetic vendor",
            "checklist":[{"item":"Synthetic inspection","done":true,"note":"Claimed"}],
            "estimatedBudget":3500000,
            "actualCost":2000000,
            "status":"Đã hoàn thành đúng lịch",
            "healthScore":98,
            "certificateCode":"CERT-UNVERIFIED-1",
            "performedAt":"2026-10-02T10:00:00Z",
            "performedByUserId":"legacy-claimed-id",
            "performedByName":"Legacy claimed engineer",
            "notes":"Synthetic legacy note",
            "extension":{"preserve":true}
        })
    }

    fn bundle(batch: &str, records: Vec<Value>) -> Value {
        json!({
            "format":"kiyovn-legacy-asset-maintenances",
            "schemaVersion":1,
            "sourceMode":"server_collection",
            "batchId":batch,
            "sourceOrigin":"https://legacy.example.test",
            "exportedAt":"2026-10-09T10:00:00Z",
            "records":records
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
    fn maintenance_bundle_rejects_bad_source_duplicate_key_and_reserved_marker() {
        let batch = "2a2a2a2a-2a2a-42aa-8aaa-2a2a2a2a2a2a";
        let valid: LegacyAssetMaintenancesBundle = serde_json::from_value(bundle(
            batch,
            vec![maintenance("legacy-maintenance-1", "BD-1")],
        ))
        .expect("valid bundle DTO");
        assert!(validate_bundle(&valid).is_ok());

        let mut wrong_source = bundle(batch, vec![maintenance("legacy-maintenance-1", "BD-1")]);
        wrong_source["sourceMode"] = json!("untrusted");
        let parsed: LegacyAssetMaintenancesBundle =
            serde_json::from_value(wrong_source).expect("DTO");
        assert!(validate_bundle(&parsed).is_err());

        let duplicate = bundle(
            batch,
            vec![
                maintenance("same-key", "BD-1"),
                maintenance("same-key", "BD-2"),
            ],
        );
        let parsed: LegacyAssetMaintenancesBundle = serde_json::from_value(duplicate).expect("DTO");
        assert!(validate_bundle(&parsed).is_err());

        let mut reserved = maintenance("legacy-maintenance-2", "BD-2");
        reserved["_kiyoLegacyImport"] = json!({"verification":"verified"});
        let parsed: LegacyAssetMaintenancesBundle =
            serde_json::from_value(bundle(batch, vec![reserved])).expect("DTO");
        assert!(validate_bundle(&parsed).is_err());
    }

    #[test]
    fn imported_maintenance_keeps_source_fields_and_marks_all_legacy_claims_unverified() {
        let source = maintenance("legacy-maintenance-1", "BD-1");
        let bundle: LegacyAssetMaintenancesBundle = serde_json::from_value(bundle(
            "2a2a2a2a-2a2a-42aa-8aaa-2a2a2a2a2a2a",
            vec![source.clone()],
        ))
        .expect("bundle");
        let imported = record_with_import_marker(&source, &bundle);
        assert_eq!(imported["performedByUserId"], "legacy-claimed-id");
        assert_eq!(imported["healthScore"], 98);
        assert_eq!(imported["certificateCode"], "CERT-UNVERIFIED-1");
        assert_eq!(imported["extension"]["preserve"], true);
        assert_eq!(imported["_kiyoLegacyImport"]["verification"], "unverified");
        assert_eq!(
            imported["_kiyoLegacyImport"]["sourceMode"],
            "server_collection"
        );
    }

    #[tokio::test]
    async fn preview_apply_is_admin_only_append_only_and_reports_unverified_history_claims() {
        let (app, state, admin, employee) = fixture();
        let source = bundle(
            "3b3b3b3b-3b3b-43bb-8bbb-3b3b3b3b3b3b",
            vec![
                maintenance("legacy-maintenance-1", "BD-DUP"),
                maintenance("legacy-maintenance-2", "bd-dup"),
            ],
        );
        let uri = "/api/v1/legacy-import/asset-maintenances/preview";
        let denied = call(
            &app,
            Method::POST,
            uri,
            &bearer(&state, &employee),
            json!({"bundle":source}),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let preview_response = call(
            &app,
            Method::POST,
            uri,
            &bearer(&state, &admin),
            json!({"bundle":source}),
        )
        .await;
        assert_eq!(preview_response.status(), StatusCode::OK);
        let preview_json = response_json(preview_response).await;
        let preview = &preview_json["preview"];
        assert_eq!(preview["sourceRecords"], 2);
        assert_eq!(preview["importableRecords"], 2);
        assert_eq!(preview["duplicateMaintenanceCodes"], 1);
        assert_eq!(preview["legacyCompletionClaims"], 2);
        assert_eq!(preview["legacyCertificateClaims"], 2);
        assert_eq!(preview["legacyCompletedChecklistRecords"], 2);
        assert_eq!(preview["canApply"], true);
        assert!(preview.get("records").is_none());

        let mut apply = json!({
            "bundle":source,
            "expectedPayloadSha256":preview["payloadSha256"],
            "confirmation":preview["confirmationPhrase"]
        });
        let applied = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/asset-maintenances/apply",
            &bearer(&state, &admin),
            apply.clone(),
        )
        .await;
        assert_eq!(applied.status(), StatusCode::CREATED);
        let result = response_json(applied).await;
        assert_eq!(result["import"]["importedRecords"], 2);

        let listed = call(
            &app,
            Method::GET,
            "/api/v1/assets/maintenance",
            &bearer(&state, &admin),
            json!({}),
        )
        .await;
        assert_eq!(listed.status(), StatusCode::OK);
        let listed = response_json(listed).await;
        assert_eq!(listed["data"].as_array().unwrap().len(), 2);
        let imported = &listed["data"][0];
        assert_eq!(imported["_kiyoLegacyImport"]["verification"], "unverified");
        assert_eq!(imported["performedByName"], "Legacy claimed engineer");
        assert_eq!(imported["maintenanceHistory"].is_array(), false);
        assert_eq!(imported["extension"]["preserve"], true);

        let replay = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/asset-maintenances/apply",
            &bearer(&state, &admin),
            apply.clone(),
        )
        .await;
        assert_eq!(replay.status(), StatusCode::CONFLICT);

        apply["confirmation"] = json!("wrong confirmation");
        let invalid_confirmation = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/asset-maintenances/apply",
            &bearer(&state, &admin),
            apply,
        )
        .await;
        assert_eq!(
            invalid_confirmation.status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
}
