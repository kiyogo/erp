use crate::{ApiError, ApiResult, AppState, require_admin};
use axum::{
    Json,
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use uuid::Uuid;

const FORMAT: &str = "kiyovn-legacy-helpdesk-incidents";
const MAX_RECORDS: usize = 5_000;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const MAX_RECORD_BYTES: usize = 64 * 1024;
const ACTIVE: &str = "Đang xử lý";
const SEVERITIES: &[&str] = &[
    "P1 - Khẩn cấp (Toàn hệ thống)",
    "P2 - Cao (Ảnh hưởng dịch vụ)",
    "P3 - Trung bình",
];
const FIELDS: &[&str] = &[
    "key",
    "code",
    "incidentTitle",
    "affectedSystem",
    "severity",
    "occurredAt",
    "resolvedAt",
    "handler",
    "downtimeMinutes",
    "rootCause",
    "timeline",
    "actionItems",
    "status",
];

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyIncidentBundle {
    format: String,
    schema_version: u32,
    batch_id: String,
    source_origin: String,
    exported_at: String,
    incidents: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviewRequest {
    bundle: LegacyIncidentBundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRequest {
    bundle: LegacyIncidentBundle,
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
    importable_records: usize,
    already_imported_records: usize,
    conflicted_records: usize,
    incident_records: usize,
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

#[derive(Debug)]
struct NormalizedIncident {
    key: String,
    code: String,
    incident_title: String,
    affected_system: String,
    severity: String,
    occurred_at: String,
    handler: String,
    root_cause: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Outcome {
    Import,
    AlreadyImported,
    Conflict,
}

impl Outcome {
    fn tag(self) -> u8 {
        match self {
            Self::Import => 1,
            Self::AlreadyImported => 2,
            Self::Conflict => 3,
        }
    }
}

#[derive(Debug)]
struct SourceIncident {
    source_key_sha256: String,
    source_payload_sha256: String,
    incident: Option<NormalizedIncident>,
    outcome: Outcome,
}

#[derive(Debug)]
struct ImportPlan {
    records: Vec<SourceIncident>,
    payload_sha256: String,
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
    let source_records = request.bundle.incidents.len();
    let can_apply = plan.conflicted_records == 0 && plan.importable_records > 0;
    Ok(Json(json!({ "preview": Preview {
        batch_id: request.bundle.batch_id.clone(),
        payload_sha256: plan.payload_sha256,
        confirmation_phrase: confirmation_phrase(&request.bundle.batch_id, source_records),
        source_records,
        importable_records: plan.importable_records,
        already_imported_records: plan.already_imported_records,
        conflicted_records: plan.conflicted_records,
        incident_records: source_records,
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
    let imported_at = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let plan = build_plan(&transaction, &request.bundle)?;
    if request.expected_payload_sha256 != plan.payload_sha256 {
        return Err(ApiError::conflict(
            "Dữ liệu nguồn hoặc trạng thái đích đã thay đổi; hãy xem trước lại.",
        ));
    }
    let expected_confirmation =
        confirmation_phrase(&request.bundle.batch_id, request.bundle.incidents.len());
    if request.confirmation != expected_confirmation {
        return Err(ApiError::bad_request(
            "Cụm xác nhận nhập hồ sơ sự cố không khớp.",
        ));
    }
    if plan.conflicted_records > 0 {
        return Err(ApiError::conflict(
            "Lô sự cố có xung đột hoặc dữ liệu chưa hỗ trợ; không bản ghi nào được nhập.",
        ));
    }
    if plan.importable_records == 0 {
        return Err(ApiError::conflict(
            "Không có hồ sơ sự cố mới để nhập; không phát sinh thay đổi.",
        ));
    }

    transaction
        .execute(
            "INSERT INTO helpdesk_incident_import_runs
             (batch_id,source_origin,payload_sha256,source_records,imported_records,
              already_imported_records,actor_user_id,created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                request.bundle.batch_id,
                request.bundle.source_origin,
                plan.payload_sha256,
                request.bundle.incidents.len() as i64,
                plan.importable_records as i64,
                plan.already_imported_records as i64,
                actor.id,
                imported_at,
            ],
        )
        .map_err(|_| ApiError::conflict("Lô sự cố này đã được xử lý; hãy xuất lô mới."))?;

    for record in &plan.records {
        if record.outcome != Outcome::Import {
            continue;
        }
        let incident = record.incident.as_ref().ok_or_else(|| {
            ApiError::internal("Incident import plan is missing a normalized record")
        })?;
        transaction
            .execute(
                "INSERT INTO helpdesk_incidents
                 (id,code,incident_title,affected_system,severity,occurred_at,resolved_at,handler,
                  root_cause,status,created_by_user_id,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,NULL,?7,?8,?9,?10,?11)",
                params![
                    incident.key,
                    incident.code,
                    incident.incident_title,
                    incident.affected_system,
                    incident.severity,
                    incident.occurred_at,
                    incident.handler,
                    incident.root_cause,
                    ACTIVE,
                    actor.id,
                    imported_at,
                ],
            )
            .map_err(|_| {
                ApiError::conflict("Dữ liệu sự cố đích đã thay đổi; toàn bộ transaction đã hủy.")
            })?;
        transaction
            .execute(
                "INSERT INTO helpdesk_incident_import_rows
                 (source_key_sha256,source_payload_sha256,source_incident_key,target_incident_id,
                  batch_id,imported_at)
                 VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    record.source_key_sha256,
                    record.source_payload_sha256,
                    incident.key,
                    incident.key,
                    request.bundle.batch_id,
                    imported_at,
                ],
            )
            .map_err(|_| {
                ApiError::conflict("Hồ sơ sự cố nguồn đã được nhập đồng thời; transaction đã hủy.")
            })?;
        transaction
            .execute(
                "INSERT INTO helpdesk_incident_events
                 (incident_id,sequence_no,event_type,actor_user_id,from_status,to_status,note,created_at)
                 VALUES (?1,1,'created',?2,NULL,?3,?4,?5)",
                params![
                    incident.key,
                    actor.id,
                    ACTIVE,
                    "Đã nhập trường mô tả từ nguồn legacy. Trạng thái, thời điểm khắc phục, RCA, timeline, CAPA và downtime nguồn chưa được xác minh.",
                    imported_at,
                ],
            )
            .map_err(ApiError::internal)?;
    }
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
        return Err(ApiError::bad_request("Gói sự cố vượt quá giới hạn 8 MiB."));
    }
    serde_json::from_slice(body)
        .map_err(|_| ApiError::bad_request("JSON sự cố legacy không hợp lệ hoặc sai cấu trúc."))
}

fn validate_bundle(bundle: &LegacyIncidentBundle) -> ApiResult<()> {
    if bundle.format != FORMAT || bundle.schema_version != 1 {
        return Err(ApiError::unprocessable(
            "Định dạng hoặc phiên bản gói sự cố legacy không được hỗ trợ.",
        ));
    }
    let batch = Uuid::parse_str(&bundle.batch_id)
        .map_err(|_| ApiError::unprocessable("Mã lô sự cố phải là UUID hợp lệ."))?;
    if batch.to_string() != bundle.batch_id {
        return Err(ApiError::unprocessable(
            "Mã lô sự cố phải là UUID chữ thường ở dạng chuẩn.",
        ));
    }
    validate_origin(&bundle.source_origin)?;
    chrono::DateTime::parse_from_rfc3339(&bundle.exported_at)
        .map_err(|_| ApiError::unprocessable("Thời điểm xuất sự cố phải là RFC 3339."))?;
    if bundle.incidents.is_empty() || bundle.incidents.len() > MAX_RECORDS {
        return Err(ApiError::unprocessable(format!(
            "Gói sự cố phải có từ 1 đến {MAX_RECORDS} bản ghi."
        )));
    }
    let serialized = serde_json::to_vec(bundle).map_err(ApiError::internal)?;
    if serialized.len() > MAX_BODY_BYTES {
        return Err(ApiError::bad_request("Gói sự cố vượt quá giới hạn 8 MiB."));
    }
    for record in &bundle.incidents {
        if !record.is_object()
            || serde_json::to_vec(record)
                .map_err(ApiError::internal)?
                .len()
                > MAX_RECORD_BYTES
        {
            return Err(ApiError::unprocessable(
                "Mỗi hồ sơ sự cố phải là đối tượng JSON không vượt quá 64 KiB.",
            ));
        }
        let key = record
            .get("key")
            .and_then(Value::as_str)
            .filter(|key| valid_stable_key(key))
            .ok_or_else(|| ApiError::unprocessable("Mỗi sự cố cần key ổn định hợp lệ."))?;
        let _ = key;
    }
    Ok(())
}

fn build_plan(db: &Connection, bundle: &LegacyIncidentBundle) -> ApiResult<ImportPlan> {
    let mut key_counts = HashMap::<String, usize>::new();
    let mut parsed = Vec::with_capacity(bundle.incidents.len());
    for raw in &bundle.incidents {
        let key = raw["key"]
            .as_str()
            .expect("validated stable key")
            .to_owned();
        *key_counts.entry(key.clone()).or_default() += 1;
        let raw_json = serde_json::to_vec(raw).map_err(ApiError::internal)?;
        let payload_hash = sha256_hex(&raw_json);
        parsed.push((key, payload_hash, normalize_incident(raw)));
    }
    let mut code_counts = HashMap::<String, usize>::new();
    for (_, _, incident) in &parsed {
        if let Some(incident) = incident {
            *code_counts.entry(incident.code.to_lowercase()).or_default() += 1;
        }
    }

    let mut records = Vec::with_capacity(parsed.len());
    let mut importable_records = 0;
    let mut already_imported_records = 0;
    let mut conflicted_records = 0;
    for (key, payload_hash, incident) in parsed {
        let source_key_hash =
            sha256_hex(format!("{}\0ticket_incidents\0{key}", bundle.source_origin).as_bytes());
        let outcome = if key_counts.get(&key).copied().unwrap_or_default() != 1
            || incident.as_ref().is_none_or(|incident| {
                code_counts
                    .get(&incident.code.to_lowercase())
                    .copied()
                    .unwrap_or_default()
                    != 1
            })
        {
            Outcome::Conflict
        } else if let Some(existing_hash) = db
            .query_row(
                "SELECT source_payload_sha256 FROM helpdesk_incident_import_rows WHERE source_key_sha256=?1",
                params![source_key_hash],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(ApiError::internal)?
        {
            if existing_hash == payload_hash {
                Outcome::AlreadyImported
            } else {
                Outcome::Conflict
            }
        } else if let Some(incident) = incident.as_ref() {
            let id_exists: bool = db
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM helpdesk_incidents WHERE id=?1)",
                    params![incident.key],
                    |row| row.get(0),
                )
                .map_err(ApiError::internal)?;
            let code_exists: bool = db
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM helpdesk_incidents WHERE code=?1 COLLATE NOCASE)",
                    params![incident.code],
                    |row| row.get(0),
                )
                .map_err(ApiError::internal)?;
            if id_exists || code_exists {
                Outcome::Conflict
            } else {
                Outcome::Import
            }
        } else {
            Outcome::Conflict
        };
        match outcome {
            Outcome::Import => importable_records += 1,
            Outcome::AlreadyImported => already_imported_records += 1,
            Outcome::Conflict => conflicted_records += 1,
        }
        records.push(SourceIncident {
            source_key_sha256: source_key_hash,
            source_payload_sha256: payload_hash,
            incident,
            outcome,
        });
    }

    let bundle_json = serde_json::to_vec(bundle).map_err(ApiError::internal)?;
    let mut digest = Sha256::new();
    digest.update(b"kiyovn-helpdesk-incident-import-plan-v1\0");
    digest.update(bundle_json);
    for record in &records {
        digest.update(record.source_key_sha256.as_bytes());
        digest.update(record.source_payload_sha256.as_bytes());
        digest.update([record.outcome.tag()]);
    }
    let payload_sha256 = format!("{:x}", digest.finalize());
    Ok(ImportPlan {
        records,
        payload_sha256,
        importable_records,
        already_imported_records,
        conflicted_records,
    })
}

fn normalize_incident(raw: &Value) -> Option<NormalizedIncident> {
    let object = raw.as_object()?;
    if object.keys().any(|key| !FIELDS.contains(&key.as_str())) {
        return None;
    }
    let key = raw.get("key")?.as_str()?;
    if !valid_stable_key(key) {
        return None;
    }
    let code = required_text(raw, "code", 80)?;
    let incident_title = required_text(raw, "incidentTitle", 240)?;
    let affected_system = required_text(raw, "affectedSystem", 200)?;
    let severity = required_text(raw, "severity", 80)?;
    if !SEVERITIES.contains(&severity.as_str()) {
        return None;
    }
    let occurred_at = required_text(raw, "occurredAt", 100)?;
    let handler = required_text(raw, "handler", 160)?;
    let root_cause = optional_text(raw, "rootCause", 4_000)?;
    Some(NormalizedIncident {
        key: key.to_owned(),
        code,
        incident_title,
        affected_system,
        severity,
        occurred_at,
        handler,
        root_cause,
    })
}

fn required_text(raw: &Value, field: &str, max_chars: usize) -> Option<String> {
    let value = raw.get(field)?.as_str()?.trim();
    if value.is_empty()
        || value.encode_utf16().count() > max_chars
        || value.chars().any(char::is_control)
    {
        return None;
    }
    Some(value.to_owned())
}

fn optional_text(raw: &Value, field: &str, max_chars: usize) -> Option<String> {
    match raw.get(field) {
        None | Some(Value::Null) => Some(String::new()),
        Some(Value::String(value)) => {
            let value = value.trim();
            if value.encode_utf16().count() > max_chars || value.chars().any(char::is_control) {
                None
            } else {
                Some(value.to_owned())
            }
        }
        Some(_) => None,
    }
}

fn valid_stable_key(key: &str) -> bool {
    !key.is_empty() && key.trim() == key && key.len() <= 256 && !key.chars().any(char::is_control)
}

fn validate_origin(origin: &str) -> ApiResult<()> {
    let Some((scheme, authority)) = origin.split_once("://") else {
        return Err(ApiError::unprocessable("Origin nguồn sự cố không hợp lệ."));
    };
    if origin.len() > 256
        || !matches!(scheme, "http" | "https")
        || authority.is_empty()
        || authority.chars().any(|character| {
            character.is_control() || character.is_whitespace() || "/?#@".contains(character)
        })
    {
        return Err(ApiError::unprocessable("Origin nguồn sự cố không hợp lệ."));
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn confirmation_phrase(batch_id: &str, source_records: usize) -> String {
    format!(
        "IMPORT-INCIDENTS-{}-{source_records}",
        &batch_id[..8].to_ascii_uppercase()
    )
}

#[cfg(test)]
mod tests {
    use super::{LegacyIncidentBundle, PreviewRequest, normalize_incident};
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
            "incident-admin",
            "incident-admin@example.test",
            "ADMIN",
            &now,
        );
        let employee = user("incident-user", "incident-user@example.test", "USER", &now);
        for account in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,'test-hash',1,?5,?5)",
                params![account.id, account.email, account.name, account.role, now],
            ).expect("insert fixture user");
        }
        let secret = b"helpdesk-import-test-secret-at-least-32-bytes";
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

    fn bearer(state: &AppState, account: &User) -> String {
        format!("Bearer {}", issue_token(state, account).expect("token"))
    }

    fn bundle(batch: &str, incidents: Vec<Value>) -> Value {
        json!({
            "format":"kiyovn-legacy-helpdesk-incidents",
            "schemaVersion":1,
            "batchId":batch,
            "sourceOrigin":"https://legacy.example.test",
            "exportedAt":"2026-10-08T00:00:00Z",
            "incidents":incidents
        })
    }

    fn incident(key: &str, code: &str) -> Value {
        json!({
            "key":key,
            "code":code,
            "incidentTitle":"Auth gateway interruption",
            "affectedSystem":"Identity service",
            "severity":"P1 - Khẩn cấp (Toàn hệ thống)",
            "occurredAt":"2026-10-01 09:10",
            "resolvedAt":"2026-10-01 09:28",
            "handler":"On-call lead",
            "downtimeMinutes":18,
            "rootCause":"Preliminary network analysis",
            "timeline":[{"time":"09:10","action":"Synthetic old entry"}],
            "actionItems":[{"task":"Legacy suggested action","status":"Đang triển khai"}],
            "status":"Đã xử lý & Hoàn tất RCA"
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
                    .body(Body::from(serde_json::to_vec(&body).expect("request JSON")))
                    .expect("request"),
            )
            .await
            .expect("response")
    }

    async fn response_json(response: Response) -> Value {
        let bytes = to_bytes(response.into_body(), 1024 * 1024)
            .await
            .expect("body");
        serde_json::from_slice(&bytes).expect("JSON response")
    }

    #[test]
    fn normalize_incident_preserves_supported_descriptive_fields_only() {
        let raw = incident("legacy-incident-1", "INC-2026-001");
        let normalized = normalize_incident(&raw).expect("valid incident");
        assert_eq!(normalized.key, "legacy-incident-1");
        assert_eq!(normalized.code, "INC-2026-001");
        assert_eq!(normalized.occurred_at, "2026-10-01 09:10");
        assert_eq!(normalized.root_cause, "Preliminary network analysis");

        let mut unsupported = raw.clone();
        unsupported["unknownField"] = json!("not silently dropped");
        assert!(normalize_incident(&unsupported).is_none());
        let mut invalid = raw;
        invalid["severity"] = json!("P0 - guessed");
        assert!(normalize_incident(&invalid).is_none());
    }

    #[tokio::test]
    async fn preview_is_admin_only_summary_only_and_does_not_mutate_targets() {
        let (app, state, admin, employee) = fixture();
        let body = bundle(
            "b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            vec![incident("legacy-incident-1", "INC-OLD-001")],
        );
        let denied = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-incidents/preview",
            &bearer(&state, &employee),
            json!({ "bundle": body }),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let response = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-incidents/preview",
            &bearer(&state, &admin),
            json!({ "bundle": body }),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let payload = response_json(response).await;
        assert_eq!(payload["preview"]["sourceRecords"], 1);
        assert_eq!(payload["preview"]["importableRecords"], 1);
        assert_eq!(payload["preview"]["conflictedRecords"], 0);
        assert!(payload["preview"]["canApply"].as_bool().unwrap());
        let serialized = payload.to_string();
        assert!(!serialized.contains("Auth gateway interruption"));
        assert!(!serialized.contains("On-call lead"));
        let db = state.db.lock().await;
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM helpdesk_incidents", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
    }

    #[tokio::test]
    async fn apply_preserves_source_identity_but_resets_unverified_resolution_claims() {
        let (app, state, admin, _) = fixture();
        let admin_token = bearer(&state, &admin);
        let source = incident("legacy-incident-1", "INC-OLD-001");
        let body = bundle("b213fbf9-e6d3-4b07-bde2-a7b2881c7048", vec![source.clone()]);
        let legacy_row = source.to_string();
        state
            .db
            .lock()
            .await
            .execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at)
                 VALUES ('ticket_incidents',?1,?2,'legacy-time','legacy-time')",
                params![source["key"].as_str().unwrap(), legacy_row],
            )
            .expect("seed read-only legacy record");
        let preview = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-incidents/preview",
            &admin_token,
            json!({ "bundle": body }),
        )
        .await;
        let preview = response_json(preview).await["preview"].clone();

        let mut altered = source.clone();
        altered["incidentTitle"] = json!("Changed after preview");
        let stale = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-incidents/apply",
            &admin_token,
            json!({
                "bundle":bundle("b213fbf9-e6d3-4b07-bde2-a7b2881c7048", vec![altered]),
                "expectedPayloadSha256":preview["payloadSha256"],
                "confirmation":preview["confirmationPhrase"]
            }),
        )
        .await;
        assert_eq!(stale.status(), StatusCode::CONFLICT);
        let count: i64 = state
            .db
            .lock()
            .await
            .query_row("SELECT COUNT(*) FROM helpdesk_incidents", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);

        let apply = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-incidents/apply",
            &admin_token,
            json!({
                "bundle": body,
                "expectedPayloadSha256":preview["payloadSha256"],
                "confirmation":preview["confirmationPhrase"]
            }),
        )
        .await;
        assert_eq!(apply.status(), StatusCode::CREATED);
        assert_eq!(response_json(apply).await["import"]["importedRecords"], 1);

        let read = call(
            &app,
            Method::GET,
            "/api/v1/tickets/incidents/legacy-incident-1",
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(read.status(), StatusCode::OK);
        let detail = response_json(read).await;
        assert_eq!(detail["incident"]["key"], "legacy-incident-1");
        assert_eq!(detail["incident"]["code"], "INC-OLD-001");
        assert_eq!(detail["incident"]["occurredAt"], "2026-10-01 09:10");
        assert_eq!(detail["incident"]["status"], "Đang xử lý");
        assert_eq!(detail["incident"]["resolvedAt"], Value::Null);
        assert_eq!(detail["incident"]["legacyImportStatus"], "unverified");
        assert_eq!(detail["events"].as_array().unwrap().len(), 1);
        assert!(
            detail["events"][0]["note"]
                .as_str()
                .unwrap()
                .contains("chưa được xác minh")
        );
        assert_ne!(detail["events"][0]["createdAt"], source["occurredAt"]);

        let persisted_legacy: String = state
            .db
            .lock()
            .await
            .query_row(
                "SELECT record_json FROM collection_records WHERE scope='ticket_incidents' AND record_key=?1",
                params![source["key"].as_str().unwrap()],
                |row| row.get(0),
            )
            .expect("original generic legacy data remains");
        assert_eq!(persisted_legacy, source.to_string());

        let again = bundle("f213fbf9-e6d3-4b07-bde2-a7b2881c7048", vec![source.clone()]);
        let again = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-incidents/preview",
            &admin_token,
            json!({ "bundle": again }),
        )
        .await;
        let again = response_json(again).await["preview"].clone();
        assert_eq!(again["alreadyImportedRecords"], 1);
        assert_eq!(again["importableRecords"], 0);
        assert!(!again["canApply"].as_bool().unwrap());

        let mut changed = source;
        changed["status"] = json!("Đang xử lý khẩn cấp");
        let changed = bundle("a213fbf9-e6d3-4b07-bde2-a7b2881c7048", vec![changed]);
        let changed = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-incidents/preview",
            &admin_token,
            json!({ "bundle": changed }),
        )
        .await;
        assert_eq!(
            response_json(changed).await["preview"]["conflictedRecords"],
            1
        );
    }

    #[tokio::test]
    async fn bad_confirmation_and_code_collision_never_partially_import() {
        let (app, state, admin, _) = fixture();
        let token = bearer(&state, &admin);
        let body = bundle(
            "b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            vec![
                incident("legacy-incident-1", "INC-DUPLICATE"),
                incident("legacy-incident-2", "INC-DUPLICATE"),
            ],
        );
        let preview = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-incidents/preview",
            &token,
            json!({ "bundle": body }),
        )
        .await;
        let preview = response_json(preview).await["preview"].clone();
        assert_eq!(preview["conflictedRecords"], 2);
        assert!(!preview["canApply"].as_bool().unwrap());

        let db = state.db.lock().await;
        let incident_count: i64 = db
            .query_row("SELECT COUNT(*) FROM helpdesk_incidents", [], |row| {
                row.get(0)
            })
            .unwrap();
        let run_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM helpdesk_incident_import_runs",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(incident_count, 0);
        assert_eq!(run_count, 0);
        drop(db);

        let valid = bundle(
            "f213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            vec![incident("legacy-incident-3", "INC-VALID-003")],
        );
        let preview = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-incidents/preview",
            &token,
            json!({ "bundle": valid }),
        )
        .await;
        let preview = response_json(preview).await["preview"].clone();
        let rejected = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-incidents/apply",
            &token,
            json!({
                "bundle": valid,
                "expectedPayloadSha256":preview["payloadSha256"],
                "confirmation":"wrong"
            }),
        )
        .await;
        assert_eq!(rejected.status(), StatusCode::BAD_REQUEST);
        let db = state.db.lock().await;
        let incident_count: i64 = db
            .query_row("SELECT COUNT(*) FROM helpdesk_incidents", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(incident_count, 0);
    }

    #[test]
    fn request_shape_rejects_extra_envelope_fields() {
        let bundle = bundle(
            "b213fbf9-e6d3-4b07-bde2-a7b2881c7048",
            vec![incident("legacy-incident-1", "INC-OLD-001")],
        );
        let mut body = json!({ "bundle":bundle.clone() });
        body["unexpected"] = json!(true);
        assert!(serde_json::from_value::<PreviewRequest>(body).is_err());
        let parsed: LegacyIncidentBundle = serde_json::from_value(bundle).expect("bundle");
        assert_eq!(parsed.incidents.len(), 1);
    }
}
