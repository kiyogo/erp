use crate::{
    ApiError, ApiResult, AppState,
    helpdesk_tickets::{COMPLETED, IN_PROGRESS, NEW},
    require_admin,
};
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

const FORMAT: &str = "kiyovn-legacy-helpdesk-tickets";
const MAX_RECORDS: usize = 5_000;
const MAX_BODY_BYTES: usize = 8 * 1024 * 1024;
const MAX_RECORD_BYTES: usize = 64 * 1024;
const PRIORITIES: &[&str] = &["Khẩn cấp", "Cao", "Trung bình", "Thấp"];
const FIELDS: &[&str] = &[
    "key",
    "code",
    "title",
    "requester",
    "department",
    "priority",
    "status",
    "createdDate",
];

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyTicketBundle {
    format: String,
    schema_version: u32,
    batch_id: String,
    source_origin: String,
    exported_at: String,
    tickets: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviewRequest {
    bundle: LegacyTicketBundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRequest {
    bundle: LegacyTicketBundle,
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
    ticket_records: usize,
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
struct NormalizedTicket {
    key: String,
    code: String,
    title: String,
    requester: String,
    department: String,
    priority: String,
    status: String,
    created_at: String,
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
struct SourceTicket {
    source_key_sha256: String,
    source_payload_sha256: String,
    ticket: Option<NormalizedTicket>,
    outcome: Outcome,
}

#[derive(Debug)]
struct ImportPlan {
    records: Vec<SourceTicket>,
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
    let source_records = request.bundle.tickets.len();
    let can_apply = plan.conflicted_records == 0 && plan.importable_records > 0;
    Ok(Json(json!({ "preview": Preview {
        batch_id: request.bundle.batch_id.clone(),
        payload_sha256: plan.payload_sha256,
        confirmation_phrase: confirmation_phrase(&request.bundle.batch_id, source_records),
        source_records,
        importable_records: plan.importable_records,
        already_imported_records: plan.already_imported_records,
        conflicted_records: plan.conflicted_records,
        ticket_records: source_records,
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
        confirmation_phrase(&request.bundle.batch_id, request.bundle.tickets.len());
    if request.confirmation != expected_confirmation {
        return Err(ApiError::bad_request(
            "Cụm xác nhận nhập ticket không khớp.",
        ));
    }
    if plan.conflicted_records > 0 {
        return Err(ApiError::conflict(
            "Lô ticket có xung đột; không bản ghi nào được nhập.",
        ));
    }
    if plan.importable_records == 0 {
        return Err(ApiError::conflict(
            "Không có ticket mới để nhập; không phát sinh thay đổi.",
        ));
    }

    transaction
        .execute(
            "INSERT INTO helpdesk_ticket_import_runs
             (batch_id,source_origin,payload_sha256,source_records,imported_records,
              already_imported_records,actor_user_id,created_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            params![
                request.bundle.batch_id,
                request.bundle.source_origin,
                plan.payload_sha256,
                request.bundle.tickets.len() as i64,
                plan.importable_records as i64,
                plan.already_imported_records as i64,
                actor.id,
                imported_at,
            ],
        )
        .map_err(|_| ApiError::conflict("Lô ticket này đã được xử lý; hãy xuất lô mới."))?;

    for record in &plan.records {
        if record.outcome != Outcome::Import {
            continue;
        }
        let ticket = record.ticket.as_ref().ok_or_else(|| {
            ApiError::internal("Ticket import plan is missing a normalized record")
        })?;
        transaction
            .execute(
                "INSERT INTO helpdesk_tickets
                 (id,code,title,requester,department,priority,status,created_by_user_id,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
                params![
                    ticket.key,
                    ticket.code,
                    ticket.title,
                    ticket.requester,
                    ticket.department,
                    ticket.priority,
                    ticket.status,
                    actor.id,
                    ticket.created_at,
                ],
            )
            .map_err(|_| {
                ApiError::conflict("Dữ liệu ticket đích đã thay đổi; toàn bộ transaction đã hủy.")
            })?;
        transaction
            .execute(
                "INSERT INTO helpdesk_ticket_import_rows
                 (source_key_sha256,source_payload_sha256,source_ticket_key,target_ticket_id,batch_id,imported_at)
                 VALUES (?1,?2,?3,?4,?5,?6)",
                params![
                    record.source_key_sha256,
                    record.source_payload_sha256,
                    ticket.key,
                    ticket.key,
                    request.bundle.batch_id,
                    imported_at,
                ],
            )
            .map_err(|_| {
                ApiError::conflict("Ticket nguồn đã được nhập đồng thời; toàn bộ transaction đã hủy.")
            })?;
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
        return Err(ApiError::bad_request("Gói ticket vượt quá giới hạn 8 MiB."));
    }
    serde_json::from_slice(body)
        .map_err(|_| ApiError::bad_request("JSON ticket legacy không hợp lệ hoặc sai cấu trúc."))
}

fn validate_bundle(bundle: &LegacyTicketBundle) -> ApiResult<()> {
    if bundle.format != FORMAT || bundle.schema_version != 1 {
        return Err(ApiError::unprocessable(
            "Định dạng hoặc phiên bản gói ticket legacy không được hỗ trợ.",
        ));
    }
    let batch = Uuid::parse_str(&bundle.batch_id)
        .map_err(|_| ApiError::unprocessable("Mã lô ticket phải là UUID hợp lệ."))?;
    if batch.to_string() != bundle.batch_id {
        return Err(ApiError::unprocessable(
            "Mã lô ticket phải là UUID chữ thường ở dạng chuẩn.",
        ));
    }
    validate_origin(&bundle.source_origin)?;
    chrono::DateTime::parse_from_rfc3339(&bundle.exported_at)
        .map_err(|_| ApiError::unprocessable("Thời điểm xuất ticket phải là RFC 3339."))?;
    if bundle.tickets.is_empty() || bundle.tickets.len() > MAX_RECORDS {
        return Err(ApiError::unprocessable(format!(
            "Gói ticket phải có từ 1 đến {MAX_RECORDS} bản ghi."
        )));
    }
    let serialized = serde_json::to_vec(bundle).map_err(ApiError::internal)?;
    if serialized.len() > MAX_BODY_BYTES {
        return Err(ApiError::bad_request("Gói ticket vượt quá giới hạn 8 MiB."));
    }
    for record in &bundle.tickets {
        if !record.is_object()
            || serde_json::to_vec(record)
                .map_err(ApiError::internal)?
                .len()
                > MAX_RECORD_BYTES
        {
            return Err(ApiError::unprocessable(
                "Mỗi ticket phải là đối tượng JSON không vượt quá 64 KiB.",
            ));
        }
        let key = record
            .get("key")
            .and_then(Value::as_str)
            .filter(|key| valid_stable_key(key))
            .ok_or_else(|| ApiError::unprocessable("Mỗi ticket cần key ổn định hợp lệ."))?;
        let _ = key;
    }
    Ok(())
}

fn build_plan(db: &Connection, bundle: &LegacyTicketBundle) -> ApiResult<ImportPlan> {
    let mut key_counts = HashMap::<String, usize>::new();
    let mut parsed = Vec::with_capacity(bundle.tickets.len());
    for raw in &bundle.tickets {
        let key = raw["key"]
            .as_str()
            .expect("validated stable key")
            .to_owned();
        *key_counts.entry(key.clone()).or_default() += 1;
        let raw_json = serde_json::to_vec(raw).map_err(ApiError::internal)?;
        let payload_hash = sha256_hex(&raw_json);
        parsed.push((key, payload_hash, normalize_ticket(raw)));
    }
    let mut code_counts = HashMap::<String, usize>::new();
    for (_, _, ticket) in &parsed {
        if let Some(ticket) = ticket {
            *code_counts.entry(ticket.code.to_lowercase()).or_default() += 1;
        }
    }

    let mut records = Vec::with_capacity(parsed.len());
    let mut importable_records = 0;
    let mut already_imported_records = 0;
    let mut conflicted_records = 0;
    for (key, payload_hash, ticket) in parsed {
        let source_key_hash =
            sha256_hex(format!("{}\0tickets\0{key}", bundle.source_origin).as_bytes());
        let outcome = if key_counts.get(&key).copied().unwrap_or_default() != 1
            || ticket.as_ref().is_none_or(|ticket| {
                code_counts.get(&ticket.code.to_lowercase()).copied().unwrap_or_default() != 1
            })
        {
            Outcome::Conflict
        } else if let Some(existing_hash) = db
            .query_row(
                "SELECT source_payload_sha256 FROM helpdesk_ticket_import_rows WHERE source_key_sha256=?1",
                params![source_key_hash],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(ApiError::internal)?
        {
            if existing_hash == payload_hash { Outcome::AlreadyImported } else { Outcome::Conflict }
        } else if let Some(ticket) = ticket.as_ref() {
            let id_exists: bool = db
                .query_row("SELECT EXISTS(SELECT 1 FROM helpdesk_tickets WHERE id=?1)", params![ticket.key], |row| row.get(0))
                .map_err(ApiError::internal)?;
            let code_exists: bool = db
                .query_row("SELECT EXISTS(SELECT 1 FROM helpdesk_tickets WHERE code=?1 COLLATE NOCASE)", params![ticket.code], |row| row.get(0))
                .map_err(ApiError::internal)?;
            if id_exists || code_exists { Outcome::Conflict } else { Outcome::Import }
        } else {
            Outcome::Conflict
        };
        match outcome {
            Outcome::Import => importable_records += 1,
            Outcome::AlreadyImported => already_imported_records += 1,
            Outcome::Conflict => conflicted_records += 1,
        }
        records.push(SourceTicket {
            source_key_sha256: source_key_hash,
            source_payload_sha256: payload_hash,
            ticket,
            outcome,
        });
    }

    let bundle_json = serde_json::to_vec(bundle).map_err(ApiError::internal)?;
    let mut digest = Sha256::new();
    digest.update(b"kiyovn-helpdesk-import-plan-v1\0");
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

fn normalize_ticket(raw: &Value) -> Option<NormalizedTicket> {
    let object = raw.as_object()?;
    if object.keys().any(|key| !FIELDS.contains(&key.as_str())) {
        return None;
    }
    let key = raw.get("key")?.as_str()?;
    if !valid_stable_key(key) {
        return None;
    }
    let code = required_text(raw, "code", 80)?;
    let title = required_text(raw, "title", 200)?;
    let requester = required_text(raw, "requester", 160)?;
    let department = required_text(raw, "department", 160)?;
    let priority = required_text(raw, "priority", 40)?;
    if !PRIORITIES.contains(&priority.as_str()) {
        return None;
    }
    let status = required_text(raw, "status", 40)?;
    if ![NEW, IN_PROGRESS, COMPLETED].contains(&status.as_str()) {
        return None;
    }
    let created_at = required_text(raw, "createdDate", 100)?;
    Some(NormalizedTicket {
        key: key.to_owned(),
        code,
        title,
        requester,
        department,
        priority,
        status,
        created_at,
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

fn valid_stable_key(key: &str) -> bool {
    !key.is_empty() && key.trim() == key && key.len() <= 256 && !key.chars().any(char::is_control)
}

fn validate_origin(origin: &str) -> ApiResult<()> {
    let Some((scheme, authority)) = origin.split_once("://") else {
        return Err(ApiError::unprocessable("Origin nguồn ticket không hợp lệ."));
    };
    if origin.len() > 256
        || !matches!(scheme, "http" | "https")
        || authority.is_empty()
        || authority.chars().any(|character| {
            character.is_control() || character.is_whitespace() || "/?#@".contains(character)
        })
    {
        return Err(ApiError::unprocessable("Origin nguồn ticket không hợp lệ."));
    }
    Ok(())
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn confirmation_phrase(batch_id: &str, source_records: usize) -> String {
    format!(
        "IMPORT-TICKETS-{}-{source_records}",
        &batch_id[..8].to_ascii_uppercase()
    )
}

#[cfg(test)]
mod tests {
    use super::{LegacyTicketBundle, PreviewRequest, normalize_ticket};
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
            "ticket-import-admin",
            "ticket-import-admin@example.test",
            "ADMIN",
            &now,
        );
        let employee = user(
            "ticket-import-user",
            "ticket-import-user@example.test",
            "USER",
            &now,
        );
        for user in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,'test-hash',1,?5,?5)",
                params![user.id,user.email,user.name,user.role,now],
            ).expect("insert user");
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

    fn bearer(state: &AppState, user: &User) -> String {
        format!("Bearer {}", issue_token(state, user).expect("JWT"))
    }

    fn bundle(batch: &str, tickets: Vec<Value>) -> Value {
        json!({
            "format":"kiyovn-legacy-helpdesk-tickets",
            "schemaVersion":1,
            "batchId":batch,
            "sourceOrigin":"https://legacy.example.test",
            "exportedAt":"2026-10-08T10:00:00Z",
            "tickets":tickets,
        })
    }

    fn ticket(key: &str, code: &str) -> Value {
        json!({"key":key,"code":code,"title":"Fixture title","requester":"Fixture requester","department":"IT","priority":"Cao","status":"Đang xử lý","createdDate":"2025-03-04 09:10"})
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
    fn importer_rejects_unknown_fields_and_unverified_business_values() {
        let mut raw = ticket("legacy-ticket", "TK-OLD-1");
        raw["slaVerified"] = json!(true);
        assert!(normalize_ticket(&raw).is_none());
        let mut raw = ticket("legacy-ticket", "TK-OLD-1");
        raw["priority"] = json!("Urgent");
        assert!(normalize_ticket(&raw).is_none());
        let parsed: LegacyTicketBundle = serde_json::from_value(bundle(
            "2a2a2a2a-2a2a-42aa-8aaa-2a2a2a2a2a2a",
            vec![ticket("legacy-ticket", "TK-OLD-1")],
        ))
        .expect("bundle DTO");
        let _: PreviewRequest =
            serde_json::from_value(json!({"bundle":parsed})).expect("preview request DTO");
    }

    #[tokio::test]
    async fn preview_is_admin_only_summary_only_and_non_mutating() {
        let (app, state, admin, employee) = fixture();
        let bundle = bundle(
            "2a2a2a2a-2a2a-42aa-8aaa-2a2a2a2a2a2a",
            vec![ticket("legacy-1", "TK-OLD-1")],
        );
        let denied = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-tickets/preview",
            &bearer(&state, &employee),
            json!({"bundle":bundle}),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
        let response = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-tickets/preview",
            &bearer(&state, &admin),
            json!({"bundle":bundle}),
        )
        .await;
        assert_eq!(response.status(), StatusCode::OK);
        let body = response_json(response).await;
        assert_eq!(body["preview"]["sourceRecords"], 1);
        assert_eq!(body["preview"]["importableRecords"], 1);
        assert_eq!(body["preview"]["conflictedRecords"], 0);
        assert!(body.to_string().contains("Fixture requester") == false);
        let db = state.db.lock().await;
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM helpdesk_tickets", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM helpdesk_ticket_import_runs",
                [],
                |row| row.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn apply_preserves_ticket_identity_and_reexport_is_idempotent() {
        let (app, state, admin, _) = fixture();
        let token = bearer(&state, &admin);
        let first = bundle(
            "2a2a2a2a-2a2a-42aa-8aaa-2a2a2a2a2a2a",
            vec![ticket("legacy-1", "TK-OLD-1")],
        );
        let preview = response_json(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/helpdesk-tickets/preview",
                &token,
                json!({"bundle":first}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        let wrong = call(&app, Method::POST, "/api/v1/legacy-import/helpdesk-tickets/apply", &token, json!({"bundle":first,"expectedPayloadSha256":preview["payloadSha256"],"confirmation":"wrong"})).await;
        assert_eq!(wrong.status(), StatusCode::BAD_REQUEST);
        let mut stale = first.clone();
        stale["tickets"][0]["title"] = json!("Source changed after preview");
        let stale = call(&app, Method::POST, "/api/v1/legacy-import/helpdesk-tickets/apply", &token, json!({"bundle":stale,"expectedPayloadSha256":preview["payloadSha256"],"confirmation":preview["confirmationPhrase"]})).await;
        assert_eq!(stale.status(), StatusCode::CONFLICT);
        let applied = call(&app, Method::POST, "/api/v1/legacy-import/helpdesk-tickets/apply", &token, json!({"bundle":first,"expectedPayloadSha256":preview["payloadSha256"],"confirmation":preview["confirmationPhrase"]})).await;
        assert_eq!(applied.status(), StatusCode::CREATED);
        assert_eq!(response_json(applied).await["import"]["importedRecords"], 1);
        let listed =
            response_json(call(&app, Method::GET, "/api/v1/tickets", &token, json!({})).await)
                .await;
        assert_eq!(listed["data"][0]["key"], "legacy-1");
        assert_eq!(listed["data"][0]["code"], "TK-OLD-1");
        assert_eq!(listed["data"][0]["createdDate"], "2025-03-04 09:10");
        assert_eq!(listed["data"][0]["status"], "Đang xử lý");
        assert_eq!(listed["data"][0]["createdBy"], admin.id);
        assert_eq!(listed["data"][0]["legacyImportStatus"], "unverified");

        let reexport = bundle(
            "3b3b3b3b-3b3b-43bb-8bbb-3b3b3b3b3b3b",
            vec![ticket("legacy-1", "TK-OLD-1")],
        );
        let preview = response_json(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/helpdesk-tickets/preview",
                &token,
                json!({"bundle":reexport}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        assert_eq!(preview["alreadyImportedRecords"], 1);
        assert_eq!(preview["importableRecords"], 0);
        assert_eq!(preview["canApply"], false);
        let changed = bundle(
            "4c4c4c4c-4c4c-44cc-8ccc-4c4c4c4c4c4c",
            vec![{
                let mut item = ticket("legacy-1", "TK-OLD-1");
                item["title"] = json!("Changed source content");
                item
            }],
        );
        let preview = response_json(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/helpdesk-tickets/preview",
                &token,
                json!({"bundle":changed}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        assert_eq!(preview["conflictedRecords"], 1);
    }

    #[tokio::test]
    async fn target_collision_blocks_entire_ticket_batch() {
        let (app, state, admin, _) = fixture();
        let token = bearer(&state, &admin);
        let created = call(
            &app,
            Method::POST,
            "/api/v1/tickets",
            &token,
            json!({"title":"Existing","requester":"A","department":"IT","priority":"Thấp"}),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let existing = response_json(created).await["ticket"]["code"]
            .as_str()
            .unwrap()
            .to_owned();
        let batch = bundle(
            "5d5d5d5d-5d5d-45dd-8ddd-5d5d5d5d5d5d",
            vec![
                ticket("legacy-1", "TK-NEW-1"),
                ticket("legacy-2", &existing),
            ],
        );
        let preview = response_json(
            call(
                &app,
                Method::POST,
                "/api/v1/legacy-import/helpdesk-tickets/preview",
                &token,
                json!({"bundle":batch}),
            )
            .await,
        )
        .await["preview"]
            .clone();
        assert_eq!(preview["importableRecords"], 1);
        assert_eq!(preview["conflictedRecords"], 1);
        assert_eq!(preview["canApply"], false);
        let rejected = call(
            &app,
            Method::POST,
            "/api/v1/legacy-import/helpdesk-tickets/apply",
            &token,
            json!({
                "bundle":batch,
                "expectedPayloadSha256":preview["payloadSha256"],
                "confirmation":preview["confirmationPhrase"]
            }),
        )
        .await;
        assert_eq!(rejected.status(), StatusCode::CONFLICT);
        let db = state.db.lock().await;
        assert_eq!(
            db.query_row("SELECT COUNT(*) FROM helpdesk_tickets", [], |row| row
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
    }
}
