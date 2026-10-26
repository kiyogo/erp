use axum::{Json, body::Bytes, extract::State, http::HeaderMap};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const FORMAT: &str = "kiyovn-legacy-plan-collections";
const SCHEMA_VERSION: u32 = 1;
const MAX_RECORDS: usize = 5_000;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const SUPPORTED_SCOPES: &[&str] = &[
    "plan_items",
    "plan_milestones",
    "plan_progress",
    "plan_reports",
    "plan_okrs",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImportRequest {
    bundle: LegacyPlanBundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRequest {
    bundle: LegacyPlanBundle,
    expected_payload_sha256: String,
    confirmation: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyPlanBundle {
    format: String,
    schema_version: u32,
    batch_id: String,
    source_origin: String,
    exported_at: String,
    collections: Vec<LegacyCollection>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct LegacyCollection {
    scope: String,
    records: Vec<Value>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScopePreview {
    scope: String,
    source_records: usize,
    target_records: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportPreview {
    batch_id: String,
    total_records: usize,
    payload_sha256: String,
    confirmation_phrase: String,
    can_apply: bool,
    collections: Vec<ScopePreview>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    batch_id: String,
    imported_records: usize,
    imported_at: String,
    collections: Vec<ScopePreview>,
}

pub(super) async fn preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let request: ImportRequest = parse_request(&body)?;
    let total_records = validate_bundle(&request.bundle)?;
    let payload_sha256 = digest(&request.bundle)?;
    let db = state.db.lock().await;
    let collections = scope_preview(&db, &request.bundle.collections)?;
    let confirmation_phrase = confirmation_phrase(&request.bundle.batch_id, total_records);
    let can_apply = collections.iter().all(|scope| scope.target_records == 0);
    Ok(Json(json!({ "preview": ImportPreview {
        batch_id: request.bundle.batch_id,
        total_records,
        payload_sha256,
        confirmation_phrase,
        can_apply,
        collections,
    }})))
}

pub(super) async fn apply(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let request: ApplyRequest = parse_request(&body)?;
    let total_records = validate_bundle(&request.bundle)?;
    let actual_digest = digest(&request.bundle)?;
    if request.expected_payload_sha256 != actual_digest {
        return Err(ApiError::conflict(
            "Tệp nhập đã thay đổi sau khi xem trước. Hãy xem trước lại trước khi áp dụng.",
        ));
    }
    let expected_confirmation = confirmation_phrase(&request.bundle.batch_id, total_records);
    if request.confirmation.trim() != expected_confirmation {
        return Err(ApiError::unprocessable(format!(
            "Cụm xác nhận chưa chính xác. Hãy nhập: {expected_confirmation}"
        )));
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let prior_run: Option<String> = transaction
        .query_row(
            "SELECT batch_id FROM legacy_import_runs WHERE batch_id = ?1",
            params![request.bundle.batch_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    if prior_run.is_some() {
        return Err(ApiError::conflict(
            "Lô nhập này đã được áp dụng trước đó; không thể nhập lại.",
        ));
    }

    let collections = scope_preview(&transaction, &request.bundle.collections)?;
    if let Some(scope) = collections.iter().find(|scope| scope.target_records != 0) {
        return Err(ApiError::conflict(format!(
            "Scope đích '{}' đã có {} bản ghi. Không ghi đè hoặc trộn dữ liệu; hãy nhập vào cơ sở dữ liệu đích trống.",
            scope.scope, scope.target_records
        )));
    }

    let imported_at = chrono::Utc::now().to_rfc3339();
    for collection in &request.bundle.collections {
        for record in &collection.records {
            let key = record
                .get("key")
                .and_then(Value::as_str)
                .expect("validated record key");
            let serialized = serde_json::to_string(record).map_err(ApiError::internal)?;
            transaction
                .execute(
                    "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
                    params![collection.scope, key, serialized, imported_at],
                )
                .map_err(|error| {
                    ApiError::conflict(format!("Không thể nhập bản ghi trong '{}': {error}", collection.scope))
                })?;
        }
    }

    let counts = serde_json::to_string(
        &collections
            .iter()
            .map(|scope| (&scope.scope, scope.source_records))
            .collect::<Vec<_>>(),
    )
    .map_err(ApiError::internal)?;
    let imported_collections = collections
        .iter()
        .map(|scope| ScopePreview {
            scope: scope.scope.clone(),
            source_records: scope.source_records,
            target_records: scope.source_records,
        })
        .collect::<Vec<_>>();
    transaction
        .execute(
            "INSERT INTO legacy_import_runs (batch_id, actor_user_id, source_origin, exported_at, imported_at, payload_sha256, scope_counts_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                request.bundle.batch_id,
                actor.id,
                request.bundle.source_origin,
                request.bundle.exported_at,
                imported_at,
                actual_digest,
                counts,
            ],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;

    Ok(Json(json!({ "import": ImportResult {
        batch_id: request.bundle.batch_id,
        imported_records: total_records,
        imported_at,
        collections: imported_collections,
    }})))
}

fn parse_request<T: for<'de> Deserialize<'de>>(body: &[u8]) -> ApiResult<T> {
    if body.len() > MAX_BODY_BYTES {
        return Err(ApiError::bad_request("Tệp nhập vượt quá giới hạn 8 MiB."));
    }
    serde_json::from_slice(body)
        .map_err(|_| ApiError::bad_request("JSON nhập không hợp lệ hoặc không đúng cấu trúc."))
}

fn validate_bundle(bundle: &LegacyPlanBundle) -> ApiResult<usize> {
    if bundle.format != FORMAT || bundle.schema_version != SCHEMA_VERSION {
        return Err(ApiError::unprocessable(
            "Định dạng hoặc phiên bản gói legacy không được hỗ trợ.",
        ));
    }
    let batch_id = Uuid::parse_str(&bundle.batch_id)
        .map_err(|_| ApiError::unprocessable("Mã lô nhập phải là UUID hợp lệ."))?;
    if batch_id.to_string() != bundle.batch_id {
        return Err(ApiError::unprocessable(
            "Mã lô nhập phải là UUID chữ thường ở dạng chuẩn.",
        ));
    }
    let Some((origin_scheme, origin_authority)) = bundle.source_origin.split_once("://") else {
        return Err(ApiError::unprocessable("Origin nguồn không hợp lệ."));
    };
    if bundle.source_origin.len() > 256
        || !matches!(origin_scheme, "http" | "https")
        || origin_authority.is_empty()
        || origin_authority.chars().any(|character| {
            character.is_control() || character.is_whitespace() || "/?#@".contains(character)
        })
    {
        return Err(ApiError::unprocessable("Origin nguồn không hợp lệ."));
    }
    chrono::DateTime::parse_from_rfc3339(&bundle.exported_at)
        .map_err(|_| ApiError::unprocessable("Thời điểm xuất dữ liệu phải là RFC 3339."))?;
    if bundle.collections.is_empty() || bundle.collections.len() > SUPPORTED_SCOPES.len() {
        return Err(ApiError::unprocessable(
            "Gói nhập phải chứa từ 1 đến 5 collection được hỗ trợ.",
        ));
    }

    let mut seen_scopes = std::collections::HashSet::new();
    let mut total_records = 0usize;
    for collection in &bundle.collections {
        if !SUPPORTED_SCOPES.contains(&collection.scope.as_str()) {
            return Err(ApiError::unprocessable(format!(
                "Collection '{}' chưa được cho phép nhập.",
                collection.scope
            )));
        }
        if !seen_scopes.insert(collection.scope.as_str()) {
            return Err(ApiError::unprocessable(format!(
                "Scope '{}' xuất hiện nhiều lần trong gói nhập.",
                collection.scope
            )));
        }
        if collection.records.is_empty() {
            return Err(ApiError::unprocessable(format!(
                "Collection '{}' rỗng; hãy bỏ collection này khỏi gói xuất.",
                collection.scope
            )));
        }
        total_records = total_records
            .checked_add(collection.records.len())
            .ok_or_else(|| ApiError::unprocessable("Số lượng bản ghi không hợp lệ."))?;
        if total_records > MAX_RECORDS {
            return Err(ApiError::unprocessable(format!(
                "Gói nhập vượt quá giới hạn {MAX_RECORDS} bản ghi."
            )));
        }
        let mut seen_keys = std::collections::HashSet::new();
        for record in &collection.records {
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
                        "Mỗi bản ghi trong '{}' phải có key dạng chuỗi hợp lệ.",
                        collection.scope
                    ))
                })?;
            if !seen_keys.insert(key) {
                return Err(ApiError::unprocessable(format!(
                    "Collection '{}' có key trùng lặp '{}'.",
                    collection.scope, key
                )));
            }
            validate_record(&collection.scope, record).map_err(|_| {
                ApiError::unprocessable(format!(
                    "Bản ghi '{}' trong '{}' không khớp schema hoặc quy tắc nghiệp vụ hiện tại.",
                    key, collection.scope
                ))
            })?;
        }
    }
    Ok(total_records)
}

fn validate_record(scope: &str, record: &Value) -> ApiResult<()> {
    match scope {
        "plan_items" => crate::plans::validate_import_record(record),
        "plan_milestones" => crate::plan_milestones::validate_import_record(record),
        "plan_progress" => crate::plan_progress::validate_import_record(record),
        "plan_reports" => crate::plan_reports::validate_import_record(record),
        "plan_okrs" => crate::plan_okrs::validate_import_record(record),
        _ => Err(ApiError::unprocessable("Collection chưa được hỗ trợ.")),
    }
}

fn scope_preview(
    db: &rusqlite::Connection,
    collections: &[LegacyCollection],
) -> ApiResult<Vec<ScopePreview>> {
    collections
        .iter()
        .map(|collection| {
            let count: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM collection_records WHERE scope = ?1",
                    params![collection.scope],
                    |row| row.get(0),
                )
                .map_err(ApiError::internal)?;
            Ok(ScopePreview {
                scope: collection.scope.clone(),
                source_records: collection.records.len(),
                target_records: usize::try_from(count).map_err(ApiError::internal)?,
            })
        })
        .collect()
}

fn digest(bundle: &LegacyPlanBundle) -> ApiResult<String> {
    let canonical = serde_json::to_vec(bundle).map_err(ApiError::internal)?;
    Ok(format!("{:x}", Sha256::digest(canonical)))
}

fn confirmation_phrase(batch_id: &str, total_records: usize) -> String {
    format!("NHẬP {total_records} {batch_id}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::User;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use rusqlite::Connection;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn fixture() -> (axum::Router, AppState, User, User) {
        let db = Connection::open_in_memory().expect("in-memory legacy import database");
        crate::init_database(&db).expect("initialize legacy import schema");
        let now = chrono::Utc::now().to_rfc3339();
        for (id, role) in [("import-admin", "ADMIN"), ("import-user", "USER")] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            ).expect("insert import test user");
        }
        let user = |id: &str, role: &str| User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: id.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = user("import-admin", "ADMIN");
        let employee = user("import-user", "USER");
        let secret = b"legacy-import-test-secret-long-enough-for-hmac";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: None,
        };
        (
            crate::router(state.clone(), CorsLayer::new()),
            state,
            admin,
            employee,
        )
    }

    fn bearer(state: &AppState, user: &User) -> String {
        format!(
            "Bearer {}",
            crate::issue_token(state, user).expect("issue import test token")
        )
    }

    fn bundle() -> Value {
        json!({
            "format": FORMAT,
            "schemaVersion": SCHEMA_VERSION,
            "batchId": "a82c8760-07b5-4c6b-9fea-14697ab5caa6",
            "sourceOrigin": "https://legacy.example.test",
            "exportedAt": "2026-10-08T00:00:00.000Z",
            "collections": [{
                "scope": "plan_okrs",
                "records": [{
                    "key": "legacy-okr-1", "okrCode": "LEG-01", "title": "Nâng cấp nền tảng",
                    "pillar": "Hạ tầng Công nghệ & AI", "owner": "Nguyễn An",
                    "targetMetric": "99.9% uptime", "progressPct": 25.0,
                    "deadline": "2026-12-31", "status": "Đang đúng tiến độ", "legacyExtra": true
                }]
            }]
        })
    }

    async fn call(
        app: &axum::Router,
        method: &str,
        uri: &str,
        auth: &str,
        payload: Value,
    ) -> axum::response::Response {
        app.clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("Authorization", auth)
                    .header("Content-Type", "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("legacy import request"),
            )
            .await
            .expect("legacy import response")
    }

    #[tokio::test]
    async fn preview_is_read_only_and_apply_preserves_legacy_payload() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let request = json!({ "bundle": bundle() });
        let denied = call(
            &app,
            "POST",
            "/api/v1/legacy-import/plan-collections/preview",
            &employee_token,
            request.clone(),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
        let denied_apply = call(
            &app,
            "POST",
            "/api/v1/legacy-import/plan-collections/apply",
            &employee_token,
            request.clone(),
        )
        .await;
        assert_eq!(denied_apply.status(), StatusCode::FORBIDDEN);

        let preview = call(
            &app,
            "POST",
            "/api/v1/legacy-import/plan-collections/preview",
            &admin_token,
            request.clone(),
        )
        .await;
        assert_eq!(preview.status(), StatusCode::OK);
        let body = axum::body::to_bytes(preview.into_body(), 32 * 1024)
            .await
            .expect("preview response");
        let preview: Value = serde_json::from_slice(&body).expect("preview JSON");
        assert_eq!(preview["preview"]["totalRecords"], 1);
        assert_eq!(preview["preview"]["canApply"], true);
        assert_eq!(preview["preview"]["collections"][0]["targetRecords"], 0);
        {
            let db = state.db.lock().await;
            let count: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM collection_records WHERE scope = 'plan_okrs'",
                    [],
                    |row| row.get(0),
                )
                .expect("read after preview");
            assert_eq!(count, 0);
        }

        let mut apply = json!({
            "bundle": bundle(),
            "expectedPayloadSha256": preview["preview"]["payloadSha256"],
            "confirmation": preview["preview"]["confirmationPhrase"],
        });
        let response = call(
            &app,
            "POST",
            "/api/v1/legacy-import/plan-collections/apply",
            &admin_token,
            apply.clone(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let response = axum::body::to_bytes(response.into_body(), 32 * 1024)
            .await
            .expect("apply response");
        let response: Value = serde_json::from_slice(&response).expect("apply JSON");
        assert_eq!(response["import"]["importedRecords"], 1);
        assert_eq!(response["import"]["collections"][0]["targetRecords"], 1);
        {
            let db = state.db.lock().await;
            let stored: String = db.query_row("SELECT record_json FROM collection_records WHERE scope = 'plan_okrs' AND record_key = 'legacy-okr-1'", [], |row| row.get(0)).expect("read imported record");
            let stored: Value = serde_json::from_str(&stored).expect("stored record JSON");
            assert_eq!(stored["legacyExtra"], true);
            assert_eq!(stored["key"], "legacy-okr-1");
            let audit_count: i64 = db
                .query_row("SELECT COUNT(*) FROM legacy_import_runs", [], |row| {
                    row.get(0)
                })
                .expect("read import audit");
            assert_eq!(audit_count, 1);
            assert!(
                db.execute(
                    "UPDATE legacy_import_runs SET source_origin = 'https://changed.test'",
                    []
                )
                .is_err()
            );
            assert!(db.execute("DELETE FROM legacy_import_runs", []).is_err());
        }

        apply["confirmation"] = json!("NHẬP 1 a82c8760-07b5-4c6b-9fea-14697ab5caa6");
        let replay = call(
            &app,
            "POST",
            "/api/v1/legacy-import/plan-collections/apply",
            &admin_token,
            apply,
        )
        .await;
        assert_eq!(replay.status(), StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn apply_rejects_unknown_scope_and_nonempty_targets_without_partial_writes() {
        let (app, state, admin, _) = fixture();
        let token = bearer(&state, &admin);
        let mut invalid = bundle();
        invalid["collections"][0]["scope"] = json!("admin_sessions");
        let preview = call(
            &app,
            "POST",
            "/api/v1/legacy-import/plan-collections/preview",
            &token,
            json!({"bundle": invalid}),
        )
        .await;
        assert_eq!(preview.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let mut invalid_record = bundle();
        invalid_record["collections"][0]["records"][0]["progressPct"] = json!(101.0);
        let preview = call(
            &app,
            "POST",
            "/api/v1/legacy-import/plan-collections/preview",
            &token,
            json!({"bundle": invalid_record}),
        )
        .await;
        assert_eq!(preview.status(), StatusCode::UNPROCESSABLE_ENTITY);

        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('plan_okrs','already-here','{}','now','now')",
                [],
            ).expect("insert existing target row");
        }
        let bundle_value = bundle();
        let raw = json!({"bundle": bundle_value});
        let preview_response = call(
            &app,
            "POST",
            "/api/v1/legacy-import/plan-collections/preview",
            &token,
            raw.clone(),
        )
        .await;
        assert_eq!(preview_response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(preview_response.into_body(), 32 * 1024)
            .await
            .expect("preview response");
        let preview: Value = serde_json::from_slice(&bytes).expect("preview JSON");
        assert_eq!(preview["preview"]["canApply"], false);
        let apply = json!({
            "bundle": raw["bundle"],
            "expectedPayloadSha256": preview["preview"]["payloadSha256"],
            "confirmation": preview["preview"]["confirmationPhrase"],
        });
        let response = call(
            &app,
            "POST",
            "/api/v1/legacy-import/plan-collections/apply",
            &token,
            apply,
        )
        .await;
        assert_eq!(response.status(), StatusCode::CONFLICT);
        let db = state.db.lock().await;
        let imported: i64 = db.query_row("SELECT COUNT(*) FROM collection_records WHERE scope = 'plan_okrs' AND record_key = 'legacy-okr-1'", [], |row| row.get(0)).expect("count imported records");
        assert_eq!(imported, 0);
    }
}
