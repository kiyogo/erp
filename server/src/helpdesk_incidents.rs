use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use chrono::Utc;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const ACTIVE: &str = "Đang xử lý";
const RESOLVED: &str = "Đã khắc phục";
const SEVERITIES: &[&str] = &[
    "P1 - Khẩn cấp (Toàn hệ thống)",
    "P2 - Cao (Ảnh hưởng dịch vụ)",
    "P3 - Trung bình",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Incident {
    key: String,
    code: String,
    incident_title: String,
    affected_system: String,
    severity: String,
    occurred_at: String,
    resolved_at: Option<String>,
    handler: String,
    root_cause: String,
    status: String,
    created_by: String,
    created_by_name: String,
    updated_at: String,
    legacy_import_status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct IncidentEvent {
    event_type: String,
    actor_id: String,
    actor_name: String,
    from_status: Option<String>,
    to_status: String,
    note: String,
    created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateIncidentInput {
    incident_title: String,
    affected_system: String,
    severity: String,
    handler: String,
    root_cause: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ResolveIncidentInput {
    resolution_note: String,
}

pub(super) async fn list_incidents(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT i.id,i.code,i.incident_title,i.affected_system,i.severity,i.occurred_at,
                    i.resolved_at,i.handler,i.root_cause,i.status,i.created_by_user_id,u.name,i.updated_at,
                    CASE WHEN ir.target_incident_id IS NULL THEN NULL ELSE 'unverified' END
             FROM helpdesk_incidents i JOIN users u ON u.id=i.created_by_user_id
             LEFT JOIN helpdesk_incident_import_rows ir ON ir.target_incident_id=i.id
             ORDER BY i.occurred_at DESC,i.id DESC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], incident_from_row)
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": rows })))
}

pub(super) async fn get_incident(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(incident_id): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let incident = db
        .query_row(
            "SELECT i.id,i.code,i.incident_title,i.affected_system,i.severity,i.occurred_at,
                    i.resolved_at,i.handler,i.root_cause,i.status,i.created_by_user_id,u.name,i.updated_at,
                    CASE WHEN ir.target_incident_id IS NULL THEN NULL ELSE 'unverified' END
             FROM helpdesk_incidents i JOIN users u ON u.id=i.created_by_user_id
             LEFT JOIN helpdesk_incident_import_rows ir ON ir.target_incident_id=i.id WHERE i.id=?1",
            params![incident_id],
            incident_from_row,
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy hồ sơ sự cố."))?;
    let mut statement = db
        .prepare(
            "SELECT e.event_type,e.actor_user_id,u.name,e.from_status,e.to_status,e.note,e.created_at
             FROM helpdesk_incident_events e JOIN users u ON u.id=e.actor_user_id
             WHERE e.incident_id=?1 ORDER BY e.sequence_no",
        )
        .map_err(ApiError::internal)?;
    let events = statement
        .query_map(params![incident_id], |row| {
            Ok(IncidentEvent {
                event_type: row.get(0)?,
                actor_id: row.get(1)?,
                actor_name: row.get(2)?,
                from_status: row.get(3)?,
                to_status: row.get(4)?,
                note: row.get(5)?,
                created_at: row.get(6)?,
            })
        })
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "incident": incident, "events": events })))
}

pub(super) async fn create_incident(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateIncidentInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let (incident_title, affected_system, severity, handler, root_cause) = validate_create(input)?;
    let occurred_at = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let id = Uuid::new_v4().to_string();
    let code = unique_code(&transaction, &occurred_at)?;
    transaction
        .execute(
            "INSERT INTO helpdesk_incidents
             (id,code,incident_title,affected_system,severity,occurred_at,resolved_at,handler,
              root_cause,status,created_by_user_id,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,NULL,?7,?8,?9,?10,?6)",
            params![
                id,
                code,
                incident_title,
                affected_system,
                severity,
                occurred_at,
                handler,
                root_cause,
                ACTIVE,
                actor.id,
            ],
        )
        .map_err(|_| ApiError::conflict("Không thể tạo mã hồ sơ sự cố duy nhất."))?;
    transaction
        .execute(
            "INSERT INTO helpdesk_incident_events
             (incident_id,sequence_no,event_type,actor_user_id,from_status,to_status,note,created_at)
             VALUES (?1,1,'created',?2,NULL,?3,'Hồ sơ sự cố được ghi nhận.',?4)",
            params![id, actor.id, ACTIVE, occurred_at],
        )
        .map_err(ApiError::internal)?;
    let incident = load_incident(&transaction, &id)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "incident": incident }))))
}

pub(super) async fn resolve_incident(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(incident_id): Path<String>,
    Json(input): Json<ResolveIncidentInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let note = bounded_optional(input.resolution_note, "Ghi chú khắc phục", 2_000)?;
    if note.is_empty() {
        return Err(ApiError::unprocessable(
            "Cần ghi chú khắc phục trước khi đóng sự cố.",
        ));
    }
    let now = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let current: Option<String> = transaction
        .query_row(
            "SELECT status FROM helpdesk_incidents WHERE id=?1",
            params![incident_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let current = current.ok_or_else(|| ApiError::not_found("Không tìm thấy hồ sơ sự cố."))?;
    if current != ACTIVE {
        return Err(ApiError::conflict("Sự cố đã được khắc phục trước đó."));
    }
    let sequence: i64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(sequence_no),0)+1 FROM helpdesk_incident_events WHERE incident_id=?1",
            params![incident_id],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "UPDATE helpdesk_incidents SET status=?1,resolved_at=?2,updated_at=?2
             WHERE id=?3 AND status=?4",
            params![RESOLVED, now, incident_id, ACTIVE],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO helpdesk_incident_events
             (incident_id,sequence_no,event_type,actor_user_id,from_status,to_status,note,created_at)
             VALUES (?1,?2,'resolved',?3,?4,?5,?6,?7)",
            params![incident_id, sequence, actor.id, ACTIVE, RESOLVED, note, now],
        )
        .map_err(ApiError::internal)?;
    let incident = load_incident(&transaction, &incident_id)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "incident": incident })))
}

fn validate_create(
    input: CreateIncidentInput,
) -> ApiResult<(String, String, String, String, String)> {
    let incident_title = bounded_required(input.incident_title, "Mô tả sự cố", 240)?;
    let affected_system = bounded_required(input.affected_system, "Hệ thống ảnh hưởng", 200)?;
    let severity = input.severity.trim().to_owned();
    if !SEVERITIES.contains(&severity.as_str()) {
        return Err(ApiError::unprocessable("Mức độ sự cố không hợp lệ."));
    }
    let handler = bounded_required(input.handler, "Người phụ trách khai báo", 160)?;
    let root_cause = bounded_optional(
        input.root_cause.unwrap_or_default(),
        "Nguyên nhân sơ bộ",
        4_000,
    )?;
    Ok((
        incident_title,
        affected_system,
        severity,
        handler,
        root_cause,
    ))
}

fn bounded_required(value: String, label: &str, max: usize) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.is_empty() || value.encode_utf16().count() > max || value.chars().any(char::is_control)
    {
        return Err(ApiError::unprocessable(format!("{label} không hợp lệ.")));
    }
    Ok(value)
}

fn bounded_optional(value: String, label: &str, max: usize) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.encode_utf16().count() > max || value.chars().any(char::is_control) {
        return Err(ApiError::unprocessable(format!("{label} không hợp lệ.")));
    }
    Ok(value)
}

fn unique_code(db: &rusqlite::Connection, timestamp: &str) -> ApiResult<String> {
    let date = chrono::DateTime::parse_from_rfc3339(timestamp)
        .map_err(ApiError::internal)?
        .format("%Y%m%d");
    for _ in 0..10 {
        let candidate = format!(
            "INC-{date}-{}",
            &Uuid::new_v4().simple().to_string()[..8].to_ascii_uppercase()
        );
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM helpdesk_incidents WHERE code=?1 COLLATE NOCASE)",
                params![candidate],
                |row| row.get(0),
            )
            .map_err(ApiError::internal)?;
        if !exists {
            return Ok(candidate);
        }
    }
    Err(ApiError::conflict("Không thể cấp mã sự cố duy nhất."))
}

fn load_incident(db: &rusqlite::Connection, id: &str) -> ApiResult<Incident> {
    db.query_row(
        "SELECT i.id,i.code,i.incident_title,i.affected_system,i.severity,i.occurred_at,
                i.resolved_at,i.handler,i.root_cause,i.status,i.created_by_user_id,u.name,i.updated_at,
                CASE WHEN ir.target_incident_id IS NULL THEN NULL ELSE 'unverified' END
         FROM helpdesk_incidents i JOIN users u ON u.id=i.created_by_user_id
         LEFT JOIN helpdesk_incident_import_rows ir ON ir.target_incident_id=i.id WHERE i.id=?1",
        params![id],
        incident_from_row,
    )
    .map_err(ApiError::internal)
}

fn incident_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Incident> {
    Ok(Incident {
        key: row.get(0)?,
        code: row.get(1)?,
        incident_title: row.get(2)?,
        affected_system: row.get(3)?,
        severity: row.get(4)?,
        occurred_at: row.get(5)?,
        resolved_at: row.get(6)?,
        handler: row.get(7)?,
        root_cause: row.get(8)?,
        status: row.get(9)?,
        created_by: row.get(10)?,
        created_by_name: row.get(11)?,
        updated_at: row.get(12)?,
        legacy_import_status: row.get(13)?,
    })
}

#[cfg(test)]
mod tests {
    use super::{CreateIncidentInput, bounded_required, validate_create};
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
        for user in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,'test-hash',1,?5,?5)",
                params![user.id,user.email,user.name,user.role,now],
            ).expect("insert user");
        }
        let secret = b"incident-test-secret-at-least-32-bytes-long";
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

    fn input() -> Value {
        json!({"incidentTitle":"Synthetic outage","affectedSystem":"Auth cluster","severity":"P1 - Khẩn cấp (Toàn hệ thống)","handler":"On-call lead","rootCause":"Preliminary report"})
    }

    #[test]
    fn incident_form_requires_supported_inputs_and_does_not_accept_client_state() {
        let mut value: CreateIncidentInput = serde_json::from_value(input()).expect("create input");
        let normalized = validate_create(value).expect("valid source fields");
        assert_eq!(normalized.0, "Synthetic outage");
        value = serde_json::from_value(input()).expect("create input");
        value.severity = "P0 - guessed".to_owned();
        assert!(validate_create(value).is_err());
        assert!(bounded_required("\n".to_owned(), "title", 10).is_err());
        let payload = input();
        assert!(payload.get("status").is_none());
        assert!(payload.get("downtimeMinutes").is_none());
        assert!(payload.get("timeline").is_none());
        assert!(payload.get("actionItems").is_none());
    }

    #[tokio::test]
    async fn incident_lifecycle_is_admin_only_persistent_and_event_audited() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let denied = call(
            &app,
            Method::GET,
            "/api/v1/tickets/incidents",
            &employee_token,
            json!({}),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
        let legacy_denied = call(
            &app,
            Method::GET,
            "/api/v1/collections/ticket_incidents",
            &employee_token,
            json!({}),
        )
        .await;
        assert_eq!(legacy_denied.status(), StatusCode::FORBIDDEN);
        let legacy_read = call(
            &app,
            Method::GET,
            "/api/v1/collections/ticket_incidents",
            &bearer(&state, &admin),
            json!({}),
        )
        .await;
        assert_eq!(legacy_read.status(), StatusCode::OK);
        let legacy_write = call(
            &app,
            Method::PUT,
            "/api/v1/collections/ticket_incidents",
            &admin_token,
            json!({ "records": [] }),
        )
        .await;
        assert_eq!(legacy_write.status(), StatusCode::BAD_REQUEST);
        let created = call(
            &app,
            Method::POST,
            "/api/v1/tickets/incidents",
            &admin_token,
            input(),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let incident = response_json(created).await["incident"].clone();
        let id = incident["key"].as_str().unwrap().to_owned();
        assert!(incident["code"].as_str().unwrap().starts_with("INC-"));
        assert_eq!(incident["status"], "Đang xử lý");
        assert_eq!(incident["resolvedAt"], Value::Null);
        assert_eq!(incident["createdBy"], admin.id);
        assert!(
            !incident
                .as_object()
                .unwrap()
                .contains_key("downtimeMinutes")
        );

        let bad_resolve = call(
            &app,
            Method::POST,
            &format!("/api/v1/tickets/incidents/{id}/resolve"),
            &admin_token,
            json!({"resolutionNote":""}),
        )
        .await;
        assert_eq!(bad_resolve.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let resolved = call(
            &app,
            Method::POST,
            &format!("/api/v1/tickets/incidents/{id}/resolve"),
            &admin_token,
            json!({"resolutionNote":"Service restored; monitoring continues."}),
        )
        .await;
        assert_eq!(resolved.status(), StatusCode::OK);
        assert_eq!(
            response_json(resolved).await["incident"]["status"],
            "Đã khắc phục"
        );
        let repeated = call(
            &app,
            Method::POST,
            &format!("/api/v1/tickets/incidents/{id}/resolve"),
            &admin_token,
            json!({"resolutionNote":"repeat"}),
        )
        .await;
        assert_eq!(repeated.status(), StatusCode::CONFLICT);

        let detail = response_json(
            call(
                &app,
                Method::GET,
                &format!("/api/v1/tickets/incidents/{id}"),
                &admin_token,
                json!({}),
            )
            .await,
        )
        .await;
        assert_eq!(detail["events"].as_array().unwrap().len(), 2);
        assert_eq!(detail["events"][1]["actorId"], admin.id);
        assert_eq!(
            detail["events"][1]["note"],
            "Service restored; monitoring continues."
        );
        let db = state.db.lock().await;
        assert!(
            db.execute("DELETE FROM helpdesk_incident_events", [])
                .is_err()
        );
    }
}
