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
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    ApiError, ApiResult, AppState, collection_revision, record_key, require_admin,
    validate_asset_item_records,
};

const FORMAT: &str = "kiyovn-legacy-asset-items";
const SCHEMA_VERSION: u32 = 1;
const MAX_RECORDS: usize = 10_000;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const MAX_RECORD_BYTES: usize = 128 * 1024;
const SCOPE: &str = "asset_items";

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyAssetItemsBundle {
    format: String,
    schema_version: u32,
    batch_id: String,
    source_origin: String,
    exported_at: String,
    records: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviewRequest {
    bundle: LegacyAssetItemsBundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRequest {
    bundle: LegacyAssetItemsBundle,
    expected_payload_sha256: String,
    confirmation: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Preview {
    batch_id: String,
    payload_sha256: String,
    confirmation_phrase: String,
    source_records: usize,
    target_records: usize,
    importable_records: usize,
    already_imported_records: usize,
    conflicted_records: usize,
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
        payload_sha256: plan.payload_sha256,
        confirmation_phrase,
        source_records: request.bundle.records.len(),
        target_records: plan.target_records,
        importable_records: plan.importable_records,
        already_imported_records: plan.already_imported_records,
        conflicted_records: plan.conflicted_records,
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
            "Gói nguồn hoặc collection tài sản đã thay đổi kể từ lần xem trước. Hãy xem trước lại.",
        ));
    }
    if batch_already_applied(&transaction, &request.bundle.batch_id)? {
        return Err(ApiError::conflict(
            "Lô nhập này đã được áp dụng trước đó; không thể dùng lại mã lô.",
        ));
    }
    if plan.conflicted_records > 0 {
        return Err(ApiError::conflict(
            "Có khóa tài sản trùng với nội dung khác. Không có bản ghi nào được nhập.",
        ));
    }
    if plan.importable_records == 0 {
        return Err(ApiError::conflict(
            "Không còn tài sản mới để nhập; không có thay đổi nào được thực hiện.",
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
                    "Không thể thêm tài sản do collection đích vừa thay đổi. Không ghi đè dữ liệu.",
                )
            })?;
    }

    let audit_counts = serde_json::to_string(&json!({
        "scope": SCOPE,
        "sourceRecords": request.bundle.records.len(),
        "importedRecords": plan.importable_records,
        "alreadyImportedRecords": plan.already_imported_records,
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

fn validate_bundle(bundle: &LegacyAssetItemsBundle) -> ApiResult<()> {
    if bundle.format != FORMAT || bundle.schema_version != SCHEMA_VERSION {
        return Err(ApiError::unprocessable(
            "Định dạng hoặc phiên bản gói tài sản legacy không được hỗ trợ.",
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
            "Gói tài sản phải có từ 1 đến {MAX_RECORDS} bản ghi."
        )));
    }

    let mut keys = std::collections::HashSet::with_capacity(bundle.records.len());
    for record in &bundle.records {
        let key = validate_record_key(record)?;
        if !keys.insert(key) {
            return Err(ApiError::unprocessable(
                "Gói tài sản chứa khóa bản ghi trùng lặp.",
            ));
        }
        let bytes = serde_json::to_vec(record)
            .map_err(ApiError::internal)?
            .len();
        if bytes > MAX_RECORD_BYTES {
            return Err(ApiError::unprocessable(
                "Một bản ghi tài sản vượt quá giới hạn 128 KiB.",
            ));
        }
    }
    validate_asset_item_records(&bundle.records).map_err(|_| {
        ApiError::unprocessable("Một hoặc nhiều bản ghi không hợp lệ cho collection tài sản.")
    })?;
    let serialized = serde_json::to_vec(bundle).map_err(ApiError::internal)?;
    if serialized.len() > MAX_BODY_BYTES {
        return Err(ApiError::unprocessable(
            "Gói tài sản vượt quá giới hạn 8 MiB.",
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
        .or_else(|| record.get("id").and_then(Value::as_str))
        .or_else(|| record.get("code").and_then(Value::as_str))
        .ok_or_else(|| ApiError::unprocessable("Bản ghi tài sản thiếu key/id/code dạng chuỗi."))?;
    if candidate.is_empty()
        || candidate.trim() != candidate
        || candidate.len() > 160
        || candidate.chars().any(char::is_control)
    {
        return Err(ApiError::unprocessable(
            "Bản ghi tài sản có key/id/code không hợp lệ.",
        ));
    }
    record_key(record).map_err(|_| ApiError::unprocessable("Khóa bản ghi tài sản không hợp lệ."))
}

fn build_plan(db: &Connection, bundle: &LegacyAssetItemsBundle) -> ApiResult<ImportPlan> {
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
    let records = bundle
        .records
        .iter()
        .map(|record| {
            let key = validate_record_key(record)?;
            let outcome = match existing.get(&key) {
                None => {
                    importable_records += 1;
                    Outcome::Import
                }
                Some(existing) if existing == record => {
                    already_imported_records += 1;
                    Outcome::AlreadyImported
                }
                Some(_) => {
                    conflicted_records += 1;
                    Outcome::Conflict
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
    hasher.update(b"kiyovn-asset-items-import-plan-v1\0");
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
    })
}

fn bundle_digest(bundle: &LegacyAssetItemsBundle) -> ApiResult<String> {
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
    format!("NHẬP ASSET_ITEMS {source_records} {batch_id}")
}

#[cfg(test)]
mod tests {
    use super::{LegacyAssetItemsBundle, validate_bundle};
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
            "asset-import-admin",
            "asset-import-admin@example.test",
            "ADMIN",
            &now,
        );
        let employee = user(
            "asset-import-user",
            "asset-import-user@example.test",
            "USER",
            &now,
        );
        for user in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,'test-hash',1,?5,?5)",
                params![user.id, user.email, user.name, user.role, now],
            )
            .expect("insert user");
        }
        let secret = b"asset-import-test-secret-at-least-32-bytes";
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

    fn asset(key: &str, serial: &str) -> Value {
        json!({"key":key,"name":"Fixture asset","serialNumber":serial,"assignedTo":"Fixture user"})
    }

    fn bundle(batch: &str, records: Vec<Value>) -> Value {
        json!({
            "format":"kiyovn-legacy-asset-items",
            "schemaVersion":1,
            "batchId":batch,
            "sourceOrigin":"https://legacy.example.test",
            "exportedAt":"2026-10-08T10:00:00Z",
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

    async fn insert_asset(state: &AppState, key: &str, record: &Value) {
        let db = state.db.lock().await;
        let now = chrono::Utc::now().to_rfc3339();
        db.execute(
            "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('asset_items',?1,?2,?3,?3)",
            params![key, record.to_string(), now],
        )
        .expect("insert fixture asset");
    }

    #[test]
    fn bundle_rejects_invalid_envelope_keys_and_duplicate_records() {
        let batch = "2a2a2a2a-2a2a-42aa-8aaa-2a2a2a2a2a2a";
        let valid: LegacyAssetItemsBundle =
            serde_json::from_value(bundle(batch, vec![asset("asset-1", "SERIAL-PRIVATE")]))
                .expect("bundle DTO");
        assert!(validate_bundle(&valid).is_ok());

        let duplicate: LegacyAssetItemsBundle = serde_json::from_value(bundle(
            batch,
            vec![asset("asset-1", "SERIAL-1"), asset("asset-1", "SERIAL-2")],
        ))
        .expect("duplicate DTO");
        assert!(validate_bundle(&duplicate).is_err());

        let mut padded = asset("asset-1", "SERIAL-1");
        padded["key"] = json!(" asset-1 ");
        let invalid_key: LegacyAssetItemsBundle =
            serde_json::from_value(bundle(batch, vec![padded])).expect("padded DTO");
        assert!(validate_bundle(&invalid_key).is_err());

        let mut unknown = bundle(batch, vec![asset("asset-1", "SERIAL-1")]);
        unknown["unrecognized"] = json!(true);
        assert!(serde_json::from_value::<super::LegacyAssetItemsBundle>(unknown).is_err());
    }

    #[tokio::test]
    async fn preview_is_admin_only_summary_only_and_non_mutating() {
        let (app, state, admin, employee) = fixture();
        let bundle = bundle(
            "2a2a2a2a-2a2a-42aa-8aaa-2a2a2a2a2a2a",
            vec![asset("asset-1", "SERIAL-PRIVATE-1")],
        );
        let denied = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/asset-items/preview",
            &bearer(&state, &employee),
            json!({"bundle":bundle}),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let response = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/asset-items/preview",
            &bearer(&state, &admin),
            json!({"bundle":bundle}),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response_json(response).await;
        assert_eq!(body["preview"]["sourceRecords"], 1);
        assert_eq!(body["preview"]["targetRecords"], 0);
        assert_eq!(body["preview"]["importableRecords"], 1);
        assert_eq!(body["preview"]["conflictedRecords"], 0);
        assert_eq!(body["preview"]["canApply"], true);
        assert!(!body.to_string().contains("SERIAL-PRIVATE-1"));
        assert!(!body.to_string().contains("Fixture user"));

        let db = state.db.lock().await;
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM collection_records WHERE scope = 'asset_items'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .expect("asset count"),
            0
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM legacy_import_runs", [], |row| row
                .get::<_, i64>(0))
                .expect("audit count"),
            0
        );
    }

    #[tokio::test]
    async fn apply_appends_without_overwriting_and_identical_reexport_is_a_noop() {
        let (app, state, admin, _) = fixture();
        let token = bearer(&state, &admin);
        let original = asset("asset-existing", "SERIAL-EXISTING");
        insert_asset(&state, "asset-existing", &original).await;
        let source = bundle(
            "3b3b3b3b-3b3b-43bb-8bbb-3b3b3b3b3b3b",
            vec![original.clone(), asset("asset-new", "SERIAL-NEW")],
        );
        let preview = response_json(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/asset-items/preview",
                &token,
                json!({"bundle":source}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        assert_eq!(preview["sourceRecords"], 2);
        assert_eq!(preview["targetRecords"], 1);
        assert_eq!(preview["importableRecords"], 1);
        assert_eq!(preview["alreadyImportedRecords"], 1);

        let wrong = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/asset-items/apply",
            &token,
            json!({
                "bundle":source,
                "expectedPayloadSha256":preview["payloadSha256"],
                "confirmation":"wrong",
            }),
        )
        .await;
        assert_eq!(wrong.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let imported = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/asset-items/apply",
            &token,
            json!({
                "bundle":source,
                "expectedPayloadSha256":preview["payloadSha256"],
                "confirmation":preview["confirmationPhrase"],
            }),
        )
        .await;
        assert_eq!(imported.status(), StatusCode::CREATED);
        let result = response_json(imported).await;
        assert_eq!(result["import"]["importedRecords"], 1);
        assert_eq!(result["import"]["alreadyImportedRecords"], 1);

        {
            let db = state.db.lock().await;
            let saved_original: String = db
                .query_row(
                    "SELECT record_json FROM collection_records WHERE scope='asset_items' AND record_key='asset-existing'",
                    [],
                    |row| row.get(0),
                )
                .expect("original stays present");
            assert_eq!(
                serde_json::from_str::<Value>(&saved_original).unwrap(),
                original
            );
            let saved_new: String = db
                .query_row(
                    "SELECT record_json FROM collection_records WHERE scope='asset_items' AND record_key='asset-new'",
                    [],
                    |row| row.get(0),
                )
                .expect("new asset appended");
            assert_eq!(
                serde_json::from_str::<Value>(&saved_new).unwrap(),
                asset("asset-new", "SERIAL-NEW")
            );
            assert_eq!(
                db.query_row("SELECT COUNT(*) FROM legacy_import_runs", [], |row| row
                    .get::<_, i64>(0))
                    .expect("single audit row"),
                1
            );
        }

        let reexport = bundle(
            "4c4c4c4c-4c4c-44cc-8ccc-4c4c4c4c4c4c",
            vec![original, asset("asset-new", "SERIAL-NEW")],
        );
        let repeated = response_json(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/asset-items/preview",
                &token,
                json!({"bundle":reexport}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        assert_eq!(repeated["importableRecords"], 0);
        assert_eq!(repeated["alreadyImportedRecords"], 2);
        assert_eq!(repeated["canApply"], false);
    }

    #[tokio::test]
    async fn conflicting_keys_and_stale_preview_never_write_partial_data() {
        let (app, state, admin, _) = fixture();
        let token = bearer(&state, &admin);
        insert_asset(
            &state,
            "asset-conflict",
            &asset("asset-conflict", "SERIAL-TARGET"),
        )
        .await;
        let source = bundle(
            "5d5d5d5d-5d5d-45dd-8ddd-5d5d5d5d5d5d",
            vec![
                asset("asset-conflict", "SERIAL-SOURCE"),
                asset("asset-new", "SERIAL-NEW"),
            ],
        );
        let preview_response = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/asset-items/preview",
            &token,
            json!({"bundle":source}),
        )
        .await;
        let preview = response_json(preview_response).await["preview"].clone();
        assert_eq!(preview["conflictedRecords"], 1);
        assert_eq!(preview["importableRecords"], 1);
        assert_eq!(preview["canApply"], false);
        let blocked = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/asset-items/apply",
            &token,
            json!({
                "bundle":source,
                "expectedPayloadSha256":preview["payloadSha256"],
                "confirmation":preview["confirmationPhrase"],
            }),
        )
        .await;
        assert_eq!(blocked.status(), StatusCode::CONFLICT);

        let new_source = bundle(
            "6e6e6e6e-6e6e-46ee-8eee-6e6e6e6e6e6e",
            vec![asset("asset-stale", "SERIAL-OLD")],
        );
        let stale_preview = response_json(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/asset-items/preview",
                &token,
                json!({"bundle":new_source}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        let changed_source = bundle(
            "6e6e6e6e-6e6e-46ee-8eee-6e6e6e6e6e6e",
            vec![asset("asset-stale", "SERIAL-CHANGED")],
        );
        let stale = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/asset-items/apply",
            &token,
            json!({
                "bundle":changed_source,
                "expectedPayloadSha256":stale_preview["payloadSha256"],
                "confirmation":stale_preview["confirmationPhrase"],
            }),
        )
        .await;
        assert_eq!(stale.status(), StatusCode::CONFLICT);

        let target_stale_source = bundle(
            "7f7f7f7f-7f7f-47ff-8fff-7f7f7f7f7f7f",
            vec![asset("asset-target-stale", "SERIAL-TARGET-STALE")],
        );
        let target_stale_preview = response_json(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/asset-items/preview",
                &token,
                json!({"bundle":target_stale_source}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        insert_asset(
            &state,
            "asset-raced-after-preview",
            &asset("asset-raced-after-preview", "SERIAL-RACE"),
        )
        .await;
        let target_stale = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/asset-items/apply",
            &token,
            json!({
                "bundle":target_stale_source,
                "expectedPayloadSha256":target_stale_preview["payloadSha256"],
                "confirmation":target_stale_preview["confirmationPhrase"],
            }),
        )
        .await;
        assert_eq!(target_stale.status(), StatusCode::CONFLICT);

        let db = state.db.lock().await;
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM collection_records WHERE scope='asset_items'",
                [],
                |row| row.get::<_, i64>(0)
            )
            .expect("no partial inserts"),
            2
        );
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM legacy_import_runs", [], |row| row
                .get::<_, i64>(0))
                .expect("no false audit"),
            0
        );
    }
}
