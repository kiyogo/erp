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

pub(super) const PRIORITIES: &[&str] = &["Khẩn cấp", "Cao", "Trung bình", "Thấp"];
pub(super) const NEW: &str = "Mới tạo";
pub(super) const IN_PROGRESS: &str = "Đang xử lý";
pub(super) const COMPLETED: &str = "Đã hoàn thành";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HelpdeskTicket {
    key: String,
    code: String,
    title: String,
    requester: String,
    department: String,
    priority: String,
    status: String,
    created_date: String,
    created_by: String,
    created_by_name: String,
    updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    legacy_import_status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateHelpdeskTicketInput {
    title: String,
    requester: String,
    department: String,
    priority: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UpdateHelpdeskTicketInput {
    status: String,
}

pub(super) async fn list_tickets(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT t.id,t.code,t.title,t.requester,t.department,t.priority,t.status,
                    t.created_at,t.created_by_user_id,u.name,t.updated_at,
                    CASE WHEN i.target_ticket_id IS NULL THEN NULL ELSE 'unverified' END
             FROM helpdesk_tickets t JOIN users u ON u.id=t.created_by_user_id
             LEFT JOIN helpdesk_ticket_import_rows i ON i.target_ticket_id=t.id
             ORDER BY t.created_at DESC,t.id DESC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], ticket_from_row)
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": rows })))
}

pub(super) async fn create_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateHelpdeskTicketInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let (title, requester, department, priority) = validate_create(input)?;
    let timestamp = Utc::now().to_rfc3339();
    let date = Utc::now().format("%Y%m%d").to_string();
    let id = Uuid::new_v4().to_string();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let mut code = None;
    for _ in 0..10 {
        let candidate = format!(
            "TK-{date}-{}",
            Uuid::new_v4().simple().to_string()[..8].to_ascii_uppercase()
        );
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM helpdesk_tickets WHERE code=?1 COLLATE NOCASE)",
                params![candidate],
                |row| row.get(0),
            )
            .map_err(ApiError::internal)?;
        if !exists {
            code = Some(candidate);
            break;
        }
    }
    let code = code.ok_or_else(|| ApiError::conflict("Không thể tạo mã ticket duy nhất."))?;
    transaction
        .execute(
            "INSERT INTO helpdesk_tickets
             (id,code,title,requester,department,priority,status,created_by_user_id,created_at,updated_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)",
            params![id, code, title, requester, department, priority, NEW, actor.id, timestamp],
        )
        .map_err(|_| ApiError::conflict("Mã ticket bị trùng; không có ticket nào được tạo."))?;
    transaction
        .execute(
            "INSERT INTO helpdesk_ticket_events
             (ticket_id,sequence_no,event_type,actor_user_id,from_status,to_status,created_at)
             VALUES (?1,1,'created',?2,NULL,?3,?4)",
            params![id, actor.id, NEW, timestamp],
        )
        .map_err(ApiError::internal)?;
    let ticket = transaction
        .query_row(
            "SELECT t.id,t.code,t.title,t.requester,t.department,t.priority,t.status,
                    t.created_at,t.created_by_user_id,u.name,t.updated_at,
                    CASE WHEN i.target_ticket_id IS NULL THEN NULL ELSE 'unverified' END
             FROM helpdesk_tickets t JOIN users u ON u.id=t.created_by_user_id
             LEFT JOIN helpdesk_ticket_import_rows i ON i.target_ticket_id=t.id WHERE t.id=?1",
            params![id],
            ticket_from_row,
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "ticket": ticket }))))
}

pub(super) async fn update_ticket(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(ticket_id): Path<String>,
    Json(input): Json<UpdateHelpdeskTicketInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    if ![NEW, IN_PROGRESS, COMPLETED].contains(&input.status.as_str()) {
        return Err(ApiError::unprocessable("Trạng thái ticket không hợp lệ."));
    }
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let current: Option<String> = transaction
        .query_row(
            "SELECT status FROM helpdesk_tickets WHERE id=?1",
            params![ticket_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let current = current.ok_or_else(|| ApiError::not_found("Không tìm thấy ticket."))?;
    if !valid_transition(&current, &input.status) {
        return Err(ApiError::conflict(
            "Chuyển trạng thái ticket không hợp lệ hoặc ticket đã đóng.",
        ));
    }
    let sequence: i64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(sequence_no),0)+1 FROM helpdesk_ticket_events WHERE ticket_id=?1",
            params![ticket_id],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "UPDATE helpdesk_tickets SET status=?1,updated_at=?2 WHERE id=?3 AND status=?4",
            params![input.status, timestamp, ticket_id, current],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO helpdesk_ticket_events
             (ticket_id,sequence_no,event_type,actor_user_id,from_status,to_status,created_at)
             VALUES (?1,?2,'status_changed',?3,?4,?5,?6)",
            params![
                ticket_id,
                sequence,
                actor.id,
                current,
                input.status,
                timestamp
            ],
        )
        .map_err(ApiError::internal)?;
    let ticket = transaction
        .query_row(
            "SELECT t.id,t.code,t.title,t.requester,t.department,t.priority,t.status,
                    t.created_at,t.created_by_user_id,u.name,t.updated_at,
                    CASE WHEN i.target_ticket_id IS NULL THEN NULL ELSE 'unverified' END
             FROM helpdesk_tickets t JOIN users u ON u.id=t.created_by_user_id
             LEFT JOIN helpdesk_ticket_import_rows i ON i.target_ticket_id=t.id WHERE t.id=?1",
            params![ticket_id],
            ticket_from_row,
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "ticket": ticket })))
}

fn validate_create(
    input: CreateHelpdeskTicketInput,
) -> ApiResult<(String, String, String, String)> {
    let title = bounded_required(input.title, "Tiêu đề", 200)?;
    let requester = bounded_required(input.requester, "Người yêu cầu", 160)?;
    let department = bounded_required(input.department, "Phòng ban", 160)?;
    let priority = input.priority.trim().to_owned();
    if !PRIORITIES.contains(&priority.as_str()) {
        return Err(ApiError::unprocessable(
            "Mức độ ưu tiên ticket không hợp lệ.",
        ));
    }
    Ok((title, requester, department, priority))
}

fn bounded_required(value: String, label: &str, max: usize) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.is_empty() || value.encode_utf16().count() > max || value.chars().any(char::is_control)
    {
        return Err(ApiError::unprocessable(format!("{label} không hợp lệ.")));
    }
    Ok(value)
}

fn valid_transition(current: &str, next: &str) -> bool {
    matches!(
        (current, next),
        (NEW, IN_PROGRESS | COMPLETED) | (IN_PROGRESS, COMPLETED)
    )
}

fn ticket_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<HelpdeskTicket> {
    Ok(HelpdeskTicket {
        key: row.get(0)?,
        code: row.get(1)?,
        title: row.get(2)?,
        requester: row.get(3)?,
        department: row.get(4)?,
        priority: row.get(5)?,
        status: row.get(6)?,
        created_date: row.get(7)?,
        created_by: row.get(8)?,
        created_by_name: row.get(9)?,
        updated_at: row.get(10)?,
        legacy_import_status: row.get(11)?,
    })
}

#[cfg(test)]
mod tests {
    use super::{CreateHelpdeskTicketInput, bounded_required, valid_transition, validate_create};
    use crate::{AppState, User, init_database, issue_token, router};
    use axum::{
        Router,
        body::{Body, to_bytes},
        http::{Method, Request, StatusCode},
        response::Response,
    };
    use rusqlite::{Connection, params};
    use serde_json::json;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;

    fn fixture() -> (Router, AppState, User, User) {
        let db = Connection::open_in_memory().expect("test DB");
        init_database(&db).expect("initialize schema");
        let now = chrono::Utc::now().to_rfc3339();
        let admin = test_user("ticket-admin", "ticket-admin@example.test", "ADMIN", &now);
        let employee = test_user("ticket-user", "ticket-user@example.test", "USER", &now);
        for user in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,'test-hash',1,?5,?5)",
                params![user.id,user.email,user.name,user.role,now],
            )
            .expect("insert test user");
        }
        let secret = b"helpdesk-test-secret-at-least-32-bytes";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: None,
        };
        let app = router(state.clone(), tower_http::cors::CorsLayer::new());
        (app, state, admin, employee)
    }

    fn test_user(id: &str, email: &str, role: &str, now: &str) -> User {
        User {
            id: id.to_owned(),
            email: email.to_owned(),
            name: format!("Test {role}"),
            role: role.to_owned(),
            is_active: true,
            created_at: now.to_owned(),
            updated_at: now.to_owned(),
        }
    }

    fn bearer(state: &AppState, user: &User) -> String {
        format!("Bearer {}", issue_token(state, user).expect("JWT"))
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
                .expect("body"),
        )
        .expect("JSON")
    }

    #[test]
    fn helpdesk_validation_and_state_machine_are_bounded() {
        let valid = CreateHelpdeskTicketInput {
            title: "  Network access  ".to_owned(),
            requester: "Employee Name".to_owned(),
            department: "IT".to_owned(),
            priority: "Cao".to_owned(),
        };
        let normalized = validate_create(valid).expect("valid ticket");
        assert_eq!(normalized.0, "Network access");
        assert_eq!(normalized.3, "Cao");
        assert!(bounded_required("\n".to_owned(), "title", 20).is_err());
        assert!(!valid_transition("Đã hoàn thành", "Đang xử lý"));
        assert!(valid_transition("Mới tạo", "Đang xử lý"));
        assert!(valid_transition("Mới tạo", "Đã hoàn thành"));
        assert!(valid_transition("Đang xử lý", "Đã hoàn thành"));
    }

    #[tokio::test]
    async fn tickets_are_admin_only_persistent_and_event_audited() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let denied = call(
            &app,
            Method::GET,
            "/api/v1/tickets",
            &employee_token,
            json!({}),
        )
        .await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
        let generic_write = call(
            &app,
            Method::PUT,
            "/api/v1/collections/tickets",
            &admin_token,
            json!({ "records": [] }),
        )
        .await;
        assert_eq!(generic_write.status(), StatusCode::BAD_REQUEST);

        let created = call(
            &app,
            Method::POST,
            "/api/v1/tickets",
            &admin_token,
            json!({
                "title":"Fixture ticket",
                "requester":"Fixture requester",
                "department":"IT",
                "priority":"Cao",
                "code":"CLIENT-FABRICATED",
                "status":"Đã hoàn thành"
            }),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = response_json(created).await;
        let ticket_id = body["ticket"]["key"].as_str().unwrap().to_owned();
        assert!(body["ticket"]["code"].as_str().unwrap().starts_with("TK-"));
        assert_eq!(body["ticket"]["status"], "Mới tạo");
        assert_eq!(body["ticket"]["createdBy"], admin.id);
        assert_ne!(body["ticket"]["code"], "CLIENT-FABRICATED");

        for (status, expected) in [
            ("Đang xử lý", StatusCode::OK),
            ("Đã hoàn thành", StatusCode::OK),
        ] {
            let updated = call(
                &app,
                Method::PATCH,
                &format!("/api/v1/tickets/{ticket_id}"),
                &admin_token,
                json!({ "status": status }),
            )
            .await;
            assert_eq!(updated.status(), expected);
            assert_eq!(response_json(updated).await["ticket"]["status"], status);
        }
        let repeated = call(
            &app,
            Method::PATCH,
            &format!("/api/v1/tickets/{ticket_id}"),
            &admin_token,
            json!({ "status": "Đang xử lý" }),
        )
        .await;
        assert_eq!(repeated.status(), StatusCode::CONFLICT);

        let listed = call(
            &app,
            Method::GET,
            "/api/v1/tickets",
            &admin_token,
            json!({}),
        )
        .await;
        let listed = response_json(listed).await;
        assert_eq!(listed["data"][0]["key"], ticket_id);
        assert_eq!(listed["data"][0]["createdByName"], admin.name);
        let db = state.db.lock().await;
        assert_eq!(
            db.query_row(
                "SELECT COUNT(*) FROM helpdesk_ticket_events WHERE ticket_id=?1",
                params![ticket_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap(),
            3
        );
        assert!(
            db.execute("DELETE FROM helpdesk_ticket_events", [])
                .is_err()
        );
    }
}
