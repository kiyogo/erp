use std::collections::HashMap;

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
use uuid::Uuid;

use crate::{
    ApiError, ApiResult, AppState, User, audit, collection_revision, record_key, require_admin,
};

const FORMAT: &str = "kiyovn-legacy-reports-catalog";
const SCHEMA_VERSION: u32 = 1;
const SCOPE: &str = "reports_catalog";
const MAX_RECORDS: usize = 10_000;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const MAX_RECORD_BYTES: usize = 128 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReportsCatalogBundle {
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
    bundle: ReportsCatalogBundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRequest {
    bundle: ReportsCatalogBundle,
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
    identical_records: usize,
    conflicting_records: usize,
    batch_already_applied: bool,
    can_apply: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    batch_id: String,
    imported_records: usize,
    identical_records: usize,
    imported_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RecordOutcome {
    Insert,
    Identical,
    Conflict,
}

#[derive(Debug)]
struct PlannedRecord {
    key: String,
    record: Value,
    outcome: RecordOutcome,
}

#[derive(Debug)]
struct ImportPlan {
    records: Vec<PlannedRecord>,
    payload_sha256: String,
    target_records: usize,
    importable_records: usize,
    identical_records: usize,
    conflicting_records: usize,
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
        !batch_already_applied && plan.conflicting_records == 0 && plan.importable_records > 0;
    let confirmation_phrase =
        confirmation_phrase(&request.bundle.batch_id, request.bundle.records.len());
    Ok(Json(json!({"preview": Preview {
        batch_id: request.bundle.batch_id,
        source_mode: request.bundle.source_mode,
        payload_sha256: plan.payload_sha256,
        confirmation_phrase,
        source_records: request.bundle.records.len(),
        target_records: plan.target_records,
        importable_records: plan.importable_records,
        identical_records: plan.identical_records,
        conflicting_records: plan.conflicting_records,
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
    if request.confirmation
        != confirmation_phrase(&request.bundle.batch_id, request.bundle.records.len())
    {
        return Err(ApiError::unprocessable(
            "Cụm xác nhận nhập báo cáo chưa chính xác.",
        ));
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
            "Gói nguồn hoặc reports_catalog đã thay đổi kể từ lần xem trước; hãy xem trước lại.",
        ));
    }
    if batch_already_applied(&transaction, &request.bundle.batch_id)? {
        return Err(ApiError::conflict(
            "Lô nhập này đã được áp dụng trước đó; không thể nhập lại.",
        ));
    }
    if plan.conflicting_records > 0 {
        return Err(ApiError::conflict(
            "Có key báo cáo đã tồn tại với nội dung khác; không có bản ghi nào được nhập.",
        ));
    }
    if plan.importable_records == 0 {
        return Err(ApiError::conflict(
            "Không còn báo cáo mới để nhập; không có thay đổi nào được thực hiện.",
        ));
    }

    let imported_at = chrono::Utc::now().to_rfc3339();
    for planned in &plan.records {
        if planned.outcome != RecordOutcome::Insert {
            continue;
        }
        let serialized = serde_json::to_string(&planned.record).map_err(ApiError::internal)?;
        transaction.execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
            params![SCOPE, planned.key, serialized, imported_at],
        ).map_err(|_| ApiError::conflict("Danh mục báo cáo vừa thay đổi; không có bản ghi nào được nhập."))?;
    }

    let audit_counts = json!({
        "sourceMode": request.bundle.source_mode,
        "sourceRecords": request.bundle.records.len(),
        "importedRecords": plan.importable_records,
        "identicalRecords": plan.identical_records,
        "sourceOrigin": request.bundle.source_origin,
    });
    let serialized_counts = serde_json::to_string(&audit_counts).map_err(ApiError::internal)?;
    let payload_sha256 = bundle_digest(&request.bundle)?;
    transaction.execute(
        "INSERT INTO legacy_import_runs (batch_id, actor_user_id, source_origin, exported_at, imported_at, payload_sha256, scope_counts_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            request.bundle.batch_id,
            actor.id,
            request.bundle.source_origin,
            request.bundle.exported_at,
            imported_at,
            payload_sha256,
            serialized_counts,
        ],
    ).map_err(|_| ApiError::conflict("Mã lô nhập đã được sử dụng."))?;
    audit::append_event(
        &transaction,
        &actor,
        "legacy_import",
        SCOPE,
        &request.bundle.batch_id,
        json!({
            "sourceRecords": request.bundle.records.len(),
            "importedRecords": plan.importable_records,
            "identicalRecords": plan.identical_records,
        }),
    )?;
    transaction.commit().map_err(ApiError::internal)?;

    Ok((
        StatusCode::CREATED,
        Json(json!({"import": ImportResult {
            batch_id: request.bundle.batch_id,
            imported_records: plan.importable_records,
            identical_records: plan.identical_records,
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

fn validate_bundle(bundle: &ReportsCatalogBundle) -> ApiResult<()> {
    if bundle.format != FORMAT || bundle.schema_version != SCHEMA_VERSION {
        return Err(ApiError::unprocessable(
            "Định dạng hoặc phiên bản gói reports_catalog không được hỗ trợ.",
        ));
    }
    if !matches!(
        bundle.source_mode.as_str(),
        "server_collection" | "browser_cache_fallback"
    ) {
        return Err(ApiError::unprocessable(
            "sourceMode của gói báo cáo không được hỗ trợ.",
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
            "Gói báo cáo phải có từ 1 đến {MAX_RECORDS} bản ghi."
        )));
    }

    let mut keys = std::collections::HashSet::with_capacity(bundle.records.len());
    for record in &bundle.records {
        let key = validate_record_key(record)?;
        if !keys.insert(key) {
            return Err(ApiError::unprocessable(
                "Gói reports_catalog chứa key trùng lặp.",
            ));
        }
        let bytes = serde_json::to_vec(record)
            .map_err(ApiError::internal)?
            .len();
        if bytes > MAX_RECORD_BYTES {
            return Err(ApiError::unprocessable(
                "Một báo cáo vượt quá giới hạn 128 KiB.",
            ));
        }
    }
    let serialized = serde_json::to_vec(bundle).map_err(ApiError::internal)?;
    if serialized.len() > MAX_BODY_BYTES {
        return Err(ApiError::unprocessable(
            "Gói reports_catalog vượt quá giới hạn 8 MiB.",
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
            "Mỗi báo cáo phải là một đối tượng JSON.",
        ));
    }
    record_key(record).map_err(|_| ApiError::unprocessable("Báo cáo thiếu key/id/code hợp lệ."))
}

fn build_plan(db: &Connection, bundle: &ReportsCatalogBundle) -> ApiResult<ImportPlan> {
    let existing = {
        let mut statement = db.prepare(
            "SELECT record_key, record_json FROM collection_records WHERE scope = ?1 ORDER BY record_key COLLATE BINARY ASC",
        ).map_err(ApiError::internal)?;
        statement
            .query_map(params![SCOPE], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(ApiError::internal)?
            .map(|row| {
                let (key, raw) = row.map_err(ApiError::internal)?;
                let record = serde_json::from_str::<Value>(&raw).map_err(ApiError::internal)?;
                Ok((key, record))
            })
            .collect::<ApiResult<HashMap<_, _>>>()?
    };

    let mut importable_records = 0;
    let mut identical_records = 0;
    let mut conflicting_records = 0;
    let records = bundle
        .records
        .iter()
        .map(|record| {
            let key = validate_record_key(record)?;
            let outcome = match existing.get(&key) {
                None => {
                    importable_records += 1;
                    RecordOutcome::Insert
                }
                Some(old) if old == record => {
                    identical_records += 1;
                    RecordOutcome::Identical
                }
                Some(_) => {
                    conflicting_records += 1;
                    RecordOutcome::Conflict
                }
            };
            Ok(PlannedRecord {
                key,
                record: record.clone(),
                outcome,
            })
        })
        .collect::<ApiResult<Vec<_>>>()?;

    let bundle_sha256 = bundle_digest(bundle)?;
    let revision = collection_revision(db, SCOPE)?;
    let mut hasher = Sha256::new();
    hasher.update(b"kiyovn-reports-catalog-import-plan-v1\0");
    hasher.update(bundle_sha256.as_bytes());
    hasher.update(b"\0");
    hasher.update(revision.as_bytes());
    let payload_sha256 = hex_digest(&hasher.finalize());

    Ok(ImportPlan {
        records,
        payload_sha256,
        target_records: existing.len(),
        importable_records,
        identical_records,
        conflicting_records,
    })
}

fn bundle_digest(bundle: &ReportsCatalogBundle) -> ApiResult<String> {
    let bytes = serde_json::to_vec(bundle).map_err(ApiError::internal)?;
    Ok(hex_digest(&Sha256::digest(bytes)))
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
    format!("NHẬP REPORTS_CATALOG {source_records} {batch_id}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{AppState, init_database, issue_token, router};
    use axum::{
        Router,
        body::{Body, to_bytes},
        http::{Request, StatusCode},
    };
    use rusqlite::{Connection, params};
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn fixture() -> (Router, AppState, User, User) {
        let db = Connection::open_in_memory().expect("test DB");
        init_database(&db).expect("schema");
        let now = chrono::Utc::now().to_rfc3339();
        let admin = test_user("reports-import-admin", "ADMIN", &now);
        let employee = test_user("reports-import-user", "USER", &now);
        for user in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![user.id, user.email, user.name, user.role, now],
            ).expect("insert user");
        }
        let secret = b"reports-import-test-secret-at-least-32-bytes";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: Some(crate::crm::CrmCrypto::for_test([0x43; 32], "v1")),
        };
        let app = router(state.clone(), CorsLayer::new());
        (app, state, admin, employee)
    }

    fn test_user(id: &str, role: &str, now: &str) -> User {
        User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: id.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.to_owned(),
            updated_at: now.to_owned(),
        }
    }

    fn token(state: &AppState, user: &User) -> String {
        format!("Bearer {}", issue_token(state, user).expect("JWT"))
    }

    fn bundle(records: Vec<Value>, batch_id: &str) -> ReportsCatalogBundle {
        ReportsCatalogBundle {
            format: FORMAT.to_owned(),
            schema_version: SCHEMA_VERSION,
            source_mode: "browser_cache_fallback".to_owned(),
            batch_id: batch_id.to_owned(),
            source_origin: "https://legacy.example.test".to_owned(),
            exported_at: chrono::Utc::now().to_rfc3339(),
            records,
        }
    }

    async fn send(
        app: &Router,
        method: &str,
        path: &str,
        bearer: &str,
        body: Value,
    ) -> axum::response::Response {
        app.clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(path)
                    .header("Authorization", bearer)
                    .header("Content-Type", "application/json")
                    .body(Body::from(body.to_string()))
                    .expect("request"),
            )
            .await
            .expect("response")
    }

    async fn json_body(response: axum::response::Response) -> Value {
        let bytes = to_bytes(response.into_body(), 1024 * 1024)
            .await
            .expect("body");
        serde_json::from_slice(&bytes).expect("JSON")
    }

    #[tokio::test]
    async fn import_requires_admin_and_appends_atomically_with_audit_and_replay_protection() {
        let (app, state, admin, employee) = fixture();
        let admin_token = token(&state, &admin);
        let employee_token = token(&state, &employee);
        let report = json!({
            "key":"1791500000000",
            "code":"RP-LEGACY-01",
            "title":"Synthetic report",
            "type":"Tài chính",
            "unknownLegacyField":{"kept":true}
        });
        let batch_id = "3b3b3b3b-3b3b-43bb-8bbb-3b3b3b3b3b3b";
        let source = bundle(vec![report.clone()], batch_id);
        let bundle_json = serde_json::to_value(&source).expect("bundle JSON");

        let denied = send(
            &app,
            "POST",
            "/api/v1/legacy-import/reports-catalog/preview",
            &employee_token,
            json!({"bundle":bundle_json}),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let preview_response = send(
            &app,
            "POST",
            "/api/v1/legacy-import/reports-catalog/preview",
            &admin_token,
            json!({"bundle":bundle_json}),
        )
        .await;
        assert_eq!(preview_response.status(), StatusCode::OK);
        let preview_body = json_body(preview_response).await;
        let preview = &preview_body["preview"];
        assert_eq!(preview["canApply"], true);
        assert_eq!(preview["sourceRecords"], 1);
        assert_eq!(preview["targetRecords"], 0);
        assert_eq!(preview["importableRecords"], 1);
        assert_eq!(preview["conflictingRecords"], 0);

        let apply_payload = json!({
            "bundle": bundle_json,
            "expectedPayloadSha256": preview["payloadSha256"],
            "confirmation": preview["confirmationPhrase"],
        });
        let applied = send(
            &app,
            "POST",
            "/api/v1/legacy-import/reports-catalog/apply",
            &admin_token,
            apply_payload.clone(),
        )
        .await;
        assert_eq!(applied.status(), StatusCode::CREATED);
        let result = json_body(applied).await;
        assert_eq!(result["import"]["importedRecords"], 1);
        assert_eq!(result["import"]["identicalRecords"], 0);

        {
            let db = state.db.lock().await;
            let stored: String = db.query_row(
                "SELECT record_json FROM collection_records WHERE scope = ?1 AND record_key = ?2",
                params![SCOPE, "1791500000000"],
                |row| row.get(0),
            ).expect("stored report");
            assert_eq!(
                serde_json::from_str::<Value>(&stored).expect("stored JSON"),
                report
            );
            let runs: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM legacy_import_runs WHERE batch_id = ?1",
                    params![batch_id],
                    |row| row.get(0),
                )
                .expect("run count");
            assert_eq!(runs, 1);
            let audits: i64 = db.query_row("SELECT COUNT(*) FROM audit_events WHERE resource_scope = ?1 AND resource_id = ?2", params![SCOPE, batch_id], |row| row.get(0)).expect("audit count");
            assert_eq!(audits, 1);
        }

        let replay = send(
            &app,
            "POST",
            "/api/v1/legacy-import/reports-catalog/apply",
            &admin_token,
            apply_payload,
        )
        .await;
        assert_eq!(replay.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn preview_skips_identical_records_and_blocks_different_content_for_same_key() {
        let (app, state, admin, _) = fixture();
        let bearer = token(&state, &admin);
        let original = json!({"key":"report-key-1","code":"RP-1","title":"Original"});
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
                params![SCOPE, "report-key-1", original.to_string(), chrono::Utc::now().to_rfc3339()],
            ).expect("seed report");
        }

        let identical = bundle(
            vec![original.clone()],
            "4c4c4c4c-4c4c-44cc-8ccc-4c4c4c4c4c4c",
        );
        let response = send(
            &app,
            "POST",
            "/api/v1/legacy-import/reports-catalog/preview",
            &bearer,
            json!({"bundle":identical}),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let preview = json_body(response).await["preview"].clone();
        assert_eq!(preview["canApply"], false);
        assert_eq!(preview["identicalRecords"], 1);
        assert_eq!(preview["importableRecords"], 0);
        assert_eq!(preview["targetRecords"], 1);

        let conflicting = bundle(
            vec![json!({"key":"report-key-1","code":"RP-1","title":"Different"})],
            "5d5d5d5d-5d5d-45dd-8ddd-5d5d5d5d5d5d",
        );
        let response = send(
            &app,
            "POST",
            "/api/v1/legacy-import/reports-catalog/preview",
            &bearer,
            json!({"bundle":conflicting}),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let preview = json_body(response).await["preview"].clone();
        assert_eq!(preview["canApply"], false);
        assert_eq!(preview["conflictingRecords"], 1);
        assert_eq!(preview["importableRecords"], 0);
    }

    #[tokio::test]
    async fn apply_rejects_stale_target_revision_and_invalid_bundle_keys() {
        let (app, state, admin, _) = fixture();
        let bearer = token(&state, &admin);
        let report = json!({"key":"report-key-stale","title":"Synthetic"});
        let source = bundle(vec![report.clone()], "6e6e6e6e-6e6e-46ee-8eee-6e6e6e6e6e6e");
        let bundle_json = serde_json::to_value(&source).expect("bundle JSON");
        let preview_response = send(
            &app,
            "POST",
            "/api/v1/legacy-import/reports-catalog/preview",
            &bearer,
            json!({"bundle":bundle_json}),
        )
        .await;
        let preview = json_body(preview_response).await["preview"].clone();
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
                params![SCOPE, "concurrent-report", json!({"key":"concurrent-report"}).to_string(), chrono::Utc::now().to_rfc3339()],
            ).expect("simulate target change");
        }
        let stale = send(
            &app,
            "POST",
            "/api/v1/legacy-import/reports-catalog/apply",
            &bearer,
            json!({
                "bundle":bundle_json,
                "expectedPayloadSha256":preview["payloadSha256"],
                "confirmation":preview["confirmationPhrase"],
            }),
        )
        .await;
        assert_eq!(stale.status(), StatusCode::CONFLICT);
        let db = state.db.lock().await;
        let imported: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM collection_records WHERE scope = ?1 AND record_key = ?2",
                params![SCOPE, "report-key-stale"],
                |row| row.get(0),
            )
            .expect("import count");
        assert_eq!(imported, 0);
        drop(db);

        let malformed = bundle(
            vec![json!({"title":"No identity"})],
            "7f7f7f7f-7f7f-47ff-8fff-7f7f7f7f7f7f",
        );
        assert!(validate_bundle(&malformed).is_err());
    }
}
