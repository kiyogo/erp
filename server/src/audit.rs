use axum::{
    Json,
    body::Bytes,
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
};
use rusqlite::{Connection, params};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, User, authenticated_user, require_admin};

const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_DETAILS_BYTES: usize = 8 * 1024;

pub fn install_schema(db: &Connection) -> anyhow::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS audit_events (
            id TEXT PRIMARY KEY,
            actor_id TEXT,
            action TEXT NOT NULL,
            resource_scope TEXT NOT NULL,
            resource_id TEXT NOT NULL DEFAULT '',
            details_json TEXT NOT NULL DEFAULT '{}',
            created_at TEXT NOT NULL,
            actor_name TEXT NOT NULL DEFAULT '',
            actor_email TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS audit_events_order_idx
            ON audit_events(created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS audit_events_actor_idx
            ON audit_events(actor_id, created_at DESC);
        ",
    )?;

    let mut needs_snapshot_backfill = false;
    for (column, definition) in [
        ("actor_name", "actor_name TEXT NOT NULL DEFAULT ''"),
        ("actor_email", "actor_email TEXT NOT NULL DEFAULT ''"),
    ] {
        let exists: i64 = db.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('audit_events') WHERE name = ?1",
            [column],
            |row| row.get(0),
        )?;
        if exists == 0 {
            db.execute_batch(&format!(
                "ALTER TABLE audit_events ADD COLUMN {definition};"
            ))?;
            needs_snapshot_backfill = true;
        }
    }
    if needs_snapshot_backfill {
        db.execute_batch(
            "UPDATE audit_events
             SET actor_name = COALESCE(NULLIF(actor_name, ''), (SELECT name FROM users WHERE users.id = audit_events.actor_id), ''),
                 actor_email = COALESCE(NULLIF(actor_email, ''), (SELECT email FROM users WHERE users.id = audit_events.actor_id), '')
             WHERE actor_id IS NOT NULL;",
        )?;
    }
    db.execute_batch(
        "DROP TRIGGER IF EXISTS audit_events_no_update;
        CREATE TRIGGER audit_events_no_update
            BEFORE UPDATE ON audit_events
            WHEN NOT (
                OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL
                AND NEW.id IS OLD.id
                AND NEW.action IS OLD.action
                AND NEW.resource_scope IS OLD.resource_scope
                AND NEW.resource_id IS OLD.resource_id
                AND NEW.details_json IS OLD.details_json
                AND NEW.created_at IS OLD.created_at
                AND NEW.actor_name IS OLD.actor_name
                AND NEW.actor_email IS OLD.actor_email
            )
            BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS audit_events_no_delete
            BEFORE DELETE ON audit_events
            BEGIN SELECT RAISE(ABORT, 'audit events are append-only'); END;",
    )?;
    Ok(())
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(super) struct AuditLogsQuery {
    page: Option<usize>,
    limit: Option<usize>,
    search: Option<String>,
    filter: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordAuditEventInput {
    action: String,
    module: Option<String>,
    resource_scope: Option<String>,
    detail: Option<String>,
    resource_id: Option<String>,
    #[serde(default)]
    details: Value,
}

const FILTERED_WHERE: &str = "
    WHERE (?1 = '' OR
           LOWER(a.actor_name) LIKE '%' || LOWER(?1) || '%' OR
           LOWER(a.actor_email) LIKE '%' || LOWER(?1) || '%' OR
           LOWER(a.action) LIKE '%' || LOWER(?1) || '%' OR
           LOWER(a.resource_scope) LIKE '%' || LOWER(?1) || '%' OR
           LOWER(a.resource_id) LIKE '%' || LOWER(?1) || '%' OR
           LOWER(a.details_json) LIKE '%' || LOWER(?1) || '%')
      AND (?2 = 'all'
        OR (?2 = 'sensitive' AND LOWER(a.action) IN ('update','delete','replace_collection','cancel'))
        OR (?2 = 'approve' AND (LOWER(a.action) LIKE '%approv%' OR LOWER(a.action) LIKE '%decision%'))
        OR (?2 = 'create' AND LOWER(a.action) = 'create')
        OR (?2 = 'auth' AND (LOWER(a.action) IN ('login','logout','change_password','password_change')
                            OR LOWER(a.resource_scope) LIKE '%auth%'
                            OR LOWER(a.resource_scope) LIKE '%security%')))
";

pub(super) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuditLogsQuery>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let page = query.page.unwrap_or(1).clamp(1, 1_000_000);
    let limit = query.limit.unwrap_or(50).clamp(1, 500);
    let search = query.search.unwrap_or_default();
    if search.chars().count() > 160 {
        return Err(ApiError::unprocessable(
            "Từ khóa audit không được vượt quá 160 ký tự.",
        ));
    }
    let search = search.trim();
    let filter = query.filter.as_deref().unwrap_or("all").trim();
    if !["all", "sensitive", "approve", "create", "auth"].contains(&filter) {
        return Err(ApiError::unprocessable("Bộ lọc audit không được hỗ trợ."));
    }
    let offset = ((page - 1) as i64).saturating_mul(limit as i64);
    let db = state.db.lock().await;
    let total: i64 = db
        .query_row(
            &format!("SELECT COUNT(*) FROM audit_events a {FILTERED_WHERE}"),
            params![search, filter],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    let mut statement = db
        .prepare(&format!(
            "SELECT a.id,COALESCE(NULLIF(a.actor_name,''),u.name,''),
                    COALESCE(NULLIF(a.actor_email,''),u.email,''),a.action,a.resource_scope,
                    a.resource_id,a.details_json,a.created_at
             FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id {FILTERED_WHERE}
             ORDER BY a.created_at DESC,a.id DESC LIMIT ?3 OFFSET ?4"
        ))
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(
            params![search, filter, limit as i64, offset],
            audit_log_value,
        )
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    let total_pages = if total == 0 {
        0
    } else {
        (total as usize).div_ceil(limit)
    };
    Ok(Json(json!({
        "data": rows,
        "pagination": { "page": page, "limit": limit, "total": total, "totalPages": total_pages }
    })))
}

pub(super) async fn record(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = authenticated_user(&state, &headers).await?;
    if body.len() > MAX_REQUEST_BYTES {
        return Err(ApiError::bad_request("Gói audit vượt quá giới hạn 64 KiB."));
    }
    let input: RecordAuditEventInput = serde_json::from_slice(&body)
        .map_err(|_| ApiError::bad_request("JSON audit không hợp lệ."))?;
    let action = bounded_text(&input.action, "Hành động", 100, false)?;
    let module = input.module.or(input.resource_scope).unwrap_or_default();
    let module = bounded_text(&module, "Phân hệ", 100, true)?;
    let detail = input.detail.or(input.resource_id).unwrap_or_default();
    let detail = bounded_text(&detail, "Chi tiết", 500, true)?;
    let db = state.db.lock().await;
    let event_id = append_event(
        &db,
        &actor,
        &action,
        if module.is_empty() {
            "Hệ thống"
        } else {
            &module
        },
        &detail,
        input.details,
    )?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "recorded": true, "id": event_id })),
    ))
}

pub(crate) fn append_event(
    db: &Connection,
    actor: &User,
    action: &str,
    module: &str,
    resource_id: &str,
    details: Value,
) -> ApiResult<String> {
    let action = bounded_text(action, "Hành động", 100, false)?;
    let module = bounded_text(module, "Phân hệ", 100, false)?;
    let resource_id = bounded_text(resource_id, "Mã đối tượng", 500, true)?;
    let details = redact_details(details);
    let details_json = serde_json::to_string(&details).map_err(ApiError::internal)?;
    if details_json.len() > MAX_DETAILS_BYTES {
        return Err(ApiError::unprocessable(
            "Chi tiết audit sau khi lọc không được vượt quá 8 KiB.",
        ));
    }
    let id = Uuid::new_v4().to_string();
    db.execute(
        "INSERT INTO audit_events
         (id,actor_id,actor_name,actor_email,action,resource_scope,resource_id,details_json,created_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![
            id,
            actor.id,
            actor.name,
            actor.email,
            action,
            module,
            resource_id,
            details_json,
            chrono::Utc::now().to_rfc3339(),
        ],
    )
    .map_err(ApiError::internal)?;
    Ok(id)
}

pub(crate) fn recent_events(db: &Connection, limit: usize) -> ApiResult<Vec<Value>> {
    let mut statement = db
        .prepare(
            "SELECT a.id,COALESCE(NULLIF(a.actor_name,''),u.name,''),
                    COALESCE(NULLIF(a.actor_email,''),u.email,''),a.action,a.resource_scope,
                    a.resource_id,a.details_json,a.created_at
             FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
             ORDER BY a.created_at DESC,a.id DESC LIMIT ?1",
        )
        .map_err(ApiError::internal)?;
    statement
        .query_map(params![limit.clamp(1, 100) as i64], audit_log_value)
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)
}

fn audit_log_value(row: &rusqlite::Row<'_>) -> rusqlite::Result<Value> {
    let id: String = row.get(0)?;
    let actor_name: String = row.get(1)?;
    let actor_email: String = row.get(2)?;
    let action: String = row.get(3)?;
    let module: String = row.get(4)?;
    let resource_id: String = row.get(5)?;
    let details_json: String = row.get(6)?;
    let created_at: String = row.get(7)?;
    let user = if actor_name.is_empty() {
        if actor_email.is_empty() {
            "Hệ thống".to_owned()
        } else {
            actor_email
        }
    } else if actor_email.is_empty() {
        actor_name
    } else {
        format!("{actor_name} ({actor_email})")
    };
    let timestamp = created_at
        .replace('T', " ")
        .chars()
        .take(19)
        .collect::<String>();
    let mut detail_parts = Vec::new();
    if !resource_id.is_empty() {
        detail_parts.push(format!("Đối tượng: {resource_id}"));
    }
    let details = serde_json::from_str::<Value>(&details_json)
        .map(redact_details)
        .unwrap_or_else(|_| json!({}));
    if details != json!({}) {
        detail_parts.push(details.to_string());
    }
    let detail = if detail_parts.is_empty() {
        "—".to_owned()
    } else {
        detail_parts.join(" · ")
    };
    Ok(json!({
        "key": id,
        "id": id,
        "timestamp": timestamp,
        "user": user,
        "action": action,
        "module": module,
        "detail": detail,
    }))
}

fn bounded_text(value: &str, label: &str, max: usize, allow_empty: bool) -> ApiResult<String> {
    let value = value.trim();
    if (!allow_empty && value.is_empty())
        || value.chars().count() > max
        || value.chars().any(char::is_control)
    {
        return Err(ApiError::unprocessable(format!(
            "{label} audit không hợp lệ."
        )));
    }
    Ok(value.to_owned())
}

fn redact_details(mut details: Value) -> Value {
    if !details.is_object() {
        return json!({});
    }
    redact_value(&mut details);
    details
}

fn redact_value(value: &mut Value) {
    match value {
        Value::Object(object) => {
            for (key, value) in object.iter_mut() {
                let normalized = key.to_ascii_lowercase().replace(['_', '-'], "");
                if [
                    "password",
                    "secret",
                    "token",
                    "authorization",
                    "credential",
                    "accountnumber",
                    "bankaccount",
                    "privatekey",
                ]
                .iter()
                .any(|sensitive| normalized.contains(sensitive))
                {
                    *value = Value::String("[đã ẩn]".to_owned());
                } else {
                    redact_value(value);
                }
            }
        }
        Value::Array(values) => values.iter_mut().for_each(redact_value),
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use jsonwebtoken::{DecodingKey, EncodingKey};
    use rusqlite::TransactionBehavior;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn setup() -> (AppState, User, User) {
        let db = Connection::open_in_memory().unwrap();
        crate::init_database(&db).unwrap();
        let timestamp = chrono::Utc::now().to_rfc3339();
        let admin = test_user("audit-admin", "ADMIN", &timestamp);
        let user = test_user("audit-user", "USER", &timestamp);
        for actor in [&admin, &user] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at)
                 VALUES (?1,?2,?3,?4,'unused',1,?5,?5)",
                params![actor.id, actor.email, actor.name, actor.role, timestamp],
            )
            .unwrap();
        }
        let secret = b"audit-route-test-secret-at-least-32-bytes";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: EncodingKey::from_secret(secret),
            jwt_decoding: DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: None,
        };
        (state, admin, user)
    }

    fn test_user(id: &str, role: &str, timestamp: &str) -> User {
        User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: format!("{id} name"),
            role: role.to_owned(),
            is_active: true,
            created_at: timestamp.to_owned(),
            updated_at: timestamp.to_owned(),
        }
    }

    fn request(path: &str, state: &AppState, actor: &User, body: Option<Value>) -> Request<Body> {
        let mut builder = Request::builder()
            .uri(path)
            .header("content-type", "application/json");
        if let Ok(token) = crate::issue_token(state, actor) {
            builder = builder.header(axum::http::header::AUTHORIZATION, format!("Bearer {token}"));
        }
        builder
            .method(if body.is_some() { "POST" } else { "GET" })
            .body(Body::from(
                body.map_or_else(String::new, |body| body.to_string()),
            ))
            .unwrap()
    }

    async fn response_json(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &axum::body::to_bytes(response.into_body(), MAX_REQUEST_BYTES)
                .await
                .unwrap(),
        )
        .unwrap()
    }

    #[tokio::test]
    async fn audit_api_records_redacted_events_lists_admin_only_and_is_append_only() {
        let (state, admin, user) = setup();
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let recorded = app
            .clone()
            .oneshot(request(
                "/api/v1/audit-events",
                &state,
                &user,
                Some(json!({
                    "action":"update",
                    "module":"HR",
                    "detail":"Profile updated",
                    "details":{"profile":{"name":"Test","access_token":"do-not-store"}}
                })),
            ))
            .await
            .unwrap();
        assert_eq!(recorded.status(), StatusCode::CREATED);
        let recorded_body = response_json(recorded).await;
        assert_eq!(recorded_body["recorded"], true);
        let id = recorded_body["id"].as_str().unwrap().to_owned();

        let listed = app
            .clone()
            .oneshot(request(
                "/api/v1/admin/audit-logs?page=1&limit=8&filter=sensitive&search=profile",
                &state,
                &admin,
                None,
            ))
            .await
            .unwrap();
        assert_eq!(listed.status(), StatusCode::OK);
        let body = response_json(listed).await;
        assert_eq!(body["pagination"]["total"], 1);
        assert_eq!(body["pagination"]["limit"], 8);
        assert_eq!(body["data"][0]["id"], id);
        assert_eq!(
            body["data"][0]["user"],
            "audit-user name (audit-user@example.test)"
        );
        assert!(body.to_string().contains("[đã ẩn]"));
        assert!(!body.to_string().contains("do-not-store"));
        assert!(body["data"][0].get("ipAddress").is_none());
        assert!(body["data"][0].get("hashSha256").is_none());

        let forbidden = app
            .clone()
            .oneshot(request("/api/v1/admin/audit-logs", &state, &user, None))
            .await
            .unwrap();
        assert_eq!(forbidden.status(), StatusCode::FORBIDDEN);

        let db = state.db.lock().await;
        assert!(
            db.execute(
                "UPDATE audit_events SET action='tampered' WHERE id=?1",
                params![id]
            )
            .is_err()
        );
        assert!(
            db.execute("DELETE FROM audit_events WHERE id=?1", params![id])
                .is_err()
        );
    }

    #[tokio::test]
    async fn audit_api_validates_filters_payload_size_and_rejects_unauthenticated_events() {
        let (state, admin, _) = setup();
        let app = crate::router(state.clone(), CorsLayer::permissive());
        let unsupported = app
            .clone()
            .oneshot(request(
                "/api/v1/admin/audit-logs?filter=forensic",
                &state,
                &admin,
                None,
            ))
            .await
            .unwrap();
        assert_eq!(unsupported.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let unauthenticated = app
            .clone()
            .oneshot(
                Request::post("/api/v1/audit-events")
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"action":"create"}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);

        let oversized = app
            .oneshot(request(
                "/api/v1/audit-events",
                &state,
                &admin,
                Some(json!({
                    "action":"create",
                    "details":{"payload":"x".repeat(MAX_DETAILS_BYTES + 1)}
                })),
            ))
            .await
            .unwrap();
        assert_eq!(oversized.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let count: i64 = state
            .db
            .lock()
            .await
            .query_row("SELECT COUNT(*) FROM audit_events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn audit_event_append_is_atomic_when_part_of_a_domain_transaction() {
        let (state, admin, _) = setup();
        let mut db = state.db.blocking_lock();
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .unwrap();
        append_event(
            &transaction,
            &admin,
            "create",
            "Tài chính",
            "finance-record-1",
            json!({"accountNumber":"123456"}),
        )
        .unwrap();
        drop(transaction);
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM audit_events", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn legacy_audit_schema_is_extended_idempotently_and_old_details_are_redacted() {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL);
             INSERT INTO users (id,name,email) VALUES ('legacy-user','Legacy User','legacy@example.test');
             CREATE TABLE audit_events (
                 id TEXT PRIMARY KEY,
                 actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
                 action TEXT NOT NULL,
                 resource_scope TEXT NOT NULL,
                 resource_id TEXT NOT NULL DEFAULT '',
                 details_json TEXT NOT NULL DEFAULT '{}',
                 created_at TEXT NOT NULL
             );
             INSERT INTO audit_events (id,actor_id,action,resource_scope,resource_id,details_json,created_at)
             VALUES ('legacy-event','legacy-user','update','users','legacy-user',
                     '{\"access_token\":\"legacy-secret\",\"safe\":\"visible\"}',
                     '2026-01-02T03:04:05Z');",
        )
        .unwrap();

        install_schema(&db).unwrap();
        install_schema(&db).unwrap();
        let event: Value = db
            .query_row(
                "SELECT a.id,COALESCE(NULLIF(a.actor_name,''),u.name,''),
                        COALESCE(NULLIF(a.actor_email,''),u.email,''),a.action,a.resource_scope,
                        a.resource_id,a.details_json,a.created_at
                 FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id",
                [],
                audit_log_value,
            )
            .unwrap();
        assert_eq!(event["user"], "Legacy User (legacy@example.test)");
        assert!(event["detail"].as_str().unwrap().contains("[đã ẩn]"));
        assert!(event["detail"].as_str().unwrap().contains("visible"));
        assert!(!event["detail"].as_str().unwrap().contains("legacy-secret"));

        db.execute("DELETE FROM users WHERE id='legacy-user'", [])
            .unwrap();
        let actor_snapshot: (Option<String>, String, String) = db
            .query_row(
                "SELECT actor_id,actor_name,actor_email FROM audit_events WHERE id='legacy-event'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(actor_snapshot.0, None);
        assert_eq!(actor_snapshot.1, "Legacy User");
        assert_eq!(actor_snapshot.2, "legacy@example.test");
    }
}
