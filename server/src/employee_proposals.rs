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

use crate::{ADMIN_ROLE, ApiError, ApiResult, AppState, User, authenticated_user, require_admin};

const SELECT_PROPOSAL: &str = "SELECT p.id, p.code, p.title, p.proposal_type, p.estimated_amount, \
    p.content, p.submitter_id, submitter.name, COALESCE(profile.employee_code, ''), p.status, \
    COALESCE(reviewer.name, ''), p.review_note, COALESCE(p.reviewed_at, ''), p.created_at, p.updated_at \
    FROM employee_proposals p \
    JOIN users submitter ON submitter.id = p.submitter_id \
    LEFT JOIN employee_profiles profile ON profile.user_id = submitter.id \
    LEFT JOIN users reviewer ON reviewer.id = p.reviewer_id";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct EmployeeProposal {
    key: String,
    code: String,
    title: String,
    #[serde(rename = "type")]
    proposal_type: String,
    amount: i64,
    content: String,
    submitter_id: String,
    employee_name: String,
    employee_code: String,
    status: String,
    approver: String,
    review_note: String,
    reviewed_at: String,
    date: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateEmployeeProposalInput {
    title: String,
    #[serde(rename = "type")]
    proposal_type: String,
    #[serde(default)]
    amount: Value,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ReviewEmployeeProposalInput {
    status: String,
    #[serde(default)]
    review_note: Option<String>,
}

pub(super) async fn list_employee_proposals(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let query = format!(
        "{SELECT_PROPOSAL} WHERE (?1 = 1 OR p.submitter_id = ?2) ORDER BY p.created_at DESC, p.id DESC"
    );
    let mut statement = db.prepare(&query).map_err(ApiError::internal)?;
    let proposals = statement
        .query_map(
            params![actor.role == ADMIN_ROLE, actor.id],
            employee_proposal_from_sql,
        )
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": proposals })))
}

pub(super) async fn get_employee_proposal(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(proposal_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let query = format!("{SELECT_PROPOSAL} WHERE p.id = ?1");
    let proposal = db
        .query_row(&query, params![proposal_id], employee_proposal_from_sql)
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy kiến nghị."))?;
    ensure_can_view(&actor, &proposal)?;
    Ok(Json(json!({ "proposal": proposal })))
}

pub(super) async fn create_employee_proposal(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateEmployeeProposalInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = authenticated_user(&state, &headers).await?;
    let title = required_text(input.title, "Tiêu đề kiến nghị", 500)?;
    let proposal_type = required_text(input.proposal_type, "Hạng mục kiến nghị", 160)?;
    let content = required_text(input.content, "Nội dung kiến nghị", 4_000)?;
    let amount = validate_amount(&input.amount)?;
    let now = Utc::now();
    let timestamp = now.to_rfc3339();
    let date_code = now.format("%Y%m%d").to_string();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let code = (0..10)
        .find_map(|_| {
            let suffix = Uuid::new_v4().simple().to_string().to_ascii_uppercase();
            let candidate = format!("KNG-{date_code}-{}", &suffix[..8]);
            let exists = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM employee_proposals WHERE code = ?1)",
                    params![candidate],
                    |row| row.get::<_, bool>(0),
                )
                .map_err(ApiError::internal);
            match exists {
                Ok(false) => Some(Ok(candidate)),
                Ok(true) => None,
                Err(error) => Some(Err(error)),
            }
        })
        .transpose()?
        .ok_or_else(|| ApiError::internal("Could not generate a unique proposal code."))?;
    let id = Uuid::new_v4().to_string();
    transaction
        .execute(
            "INSERT INTO employee_proposals \
             (id, code, title, proposal_type, estimated_amount, content, submitter_id, \
              status, reviewer_id, review_note, reviewed_at, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'Chờ duyệt', NULL, '', NULL, ?8, ?8)",
            params![
                id,
                code,
                title,
                proposal_type,
                amount,
                content,
                actor.id,
                timestamp
            ],
        )
        .map_err(ApiError::internal)?;
    let query = format!("{SELECT_PROPOSAL} WHERE p.id = ?1");
    let proposal = transaction
        .query_row(&query, params![id], employee_proposal_from_sql)
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "proposal": proposal }))))
}

pub(super) async fn review_employee_proposal(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(proposal_id): Path<String>,
    Json(input): Json<ReviewEmployeeProposalInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    if !["Đã duyệt", "Từ chối"].contains(&input.status.as_str()) {
        return Err(ApiError::unprocessable("Kết quả tiếp nhận không hợp lệ."));
    }
    let review_note = input.review_note.unwrap_or_default().trim().to_owned();
    if review_note.chars().count() > 2_000 {
        return Err(ApiError::unprocessable(
            "Phản hồi tiếp nhận vượt quá độ dài cho phép.",
        ));
    }
    let reviewed_at = Utc::now().to_rfc3339();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let current_status: Option<String> = transaction
        .query_row(
            "SELECT status FROM employee_proposals WHERE id = ?1",
            params![proposal_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(current_status) = current_status else {
        return Err(ApiError::not_found("Không tìm thấy kiến nghị."));
    };
    if current_status != "Chờ duyệt" {
        return Err(ApiError::unprocessable("Kiến nghị này đã được xử lý."));
    }
    let changed = transaction
        .execute(
            "UPDATE employee_proposals \
             SET status = ?1, reviewer_id = ?2, review_note = ?3, reviewed_at = ?4, updated_at = ?4 \
             WHERE id = ?5 AND status = 'Chờ duyệt'",
            params![input.status, actor.id, review_note, reviewed_at, proposal_id],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::unprocessable("Kiến nghị này đã được xử lý."));
    }
    let query = format!("{SELECT_PROPOSAL} WHERE p.id = ?1");
    let proposal = transaction
        .query_row(&query, params![proposal_id], employee_proposal_from_sql)
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "proposal": proposal })))
}

fn ensure_can_view(actor: &User, proposal: &EmployeeProposal) -> ApiResult<()> {
    if actor.role != ADMIN_ROLE && actor.id != proposal.submitter_id {
        return Err(ApiError::forbidden("Bạn không có quyền xem kiến nghị này."));
    }
    Ok(())
}

fn required_text(value: String, field: &str, max_length: usize) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.is_empty() {
        return Err(ApiError::unprocessable(format!("{field} là bắt buộc.")));
    }
    if value.encode_utf16().count() > max_length {
        return Err(ApiError::unprocessable(format!(
            "{field} vượt quá độ dài cho phép."
        )));
    }
    Ok(value)
}

fn validate_amount(value: &Value) -> ApiResult<i64> {
    let amount = match value {
        Value::Null => 0.0,
        Value::String(value) if value.trim().is_empty() => 0.0,
        Value::String(value) => value.trim().parse::<f64>().map_err(|_| invalid_amount())?,
        Value::Number(value) => value.as_f64().ok_or_else(invalid_amount)?,
        _ => {
            return Err(invalid_amount());
        }
    };
    if !amount.is_finite()
        || amount.fract() != 0.0
        || !(0.0..=1_000_000_000_000.0).contains(&amount)
    {
        return Err(invalid_amount());
    }
    Ok(amount as i64)
}

fn invalid_amount() -> ApiError {
    ApiError::unprocessable("Dự toán kinh phí phải là số nguyên không âm hợp lệ.")
}

fn employee_proposal_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<EmployeeProposal> {
    let created_at: String = row.get(13)?;
    Ok(EmployeeProposal {
        key: row.get(0)?,
        code: row.get(1)?,
        title: row.get(2)?,
        proposal_type: row.get(3)?,
        amount: row.get(4)?,
        content: row.get(5)?,
        submitter_id: row.get(6)?,
        employee_name: row.get(7)?,
        employee_code: row.get(8)?,
        status: row.get(9)?,
        approver: row.get(10)?,
        review_note: row.get(11)?,
        reviewed_at: row.get(12)?,
        date: created_at.chars().take(10).collect(),
        created_at,
        updated_at: row.get(14)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{
            Method, Request, StatusCode,
            header::{AUTHORIZATION, CONTENT_TYPE},
        },
    };
    use rusqlite::Connection;
    use serde_json::json;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn insert_test_user(
        db: &Connection,
        id: &str,
        email: &str,
        name: &str,
        role: &str,
        employee_code: Option<&str>,
    ) -> User {
        let timestamp = Utc::now().to_rfc3339();
        db.execute(
            "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, 'test-only-hash', 1, ?5, ?5)",
            params![id, email, name, role, timestamp],
        )
        .expect("test user insert");
        if let Some(employee_code) = employee_code {
            db.execute(
                "INSERT INTO employee_profiles (user_id, employee_code, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?3)",
                params![id, employee_code, timestamp],
            )
            .expect("test profile insert");
        }
        User {
            id: id.to_owned(),
            email: email.to_owned(),
            name: name.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        }
    }

    fn test_app() -> (axum::Router, AppState, User, User, User) {
        let db = Connection::open_in_memory().expect("in-memory SQLite");
        crate::init_database(&db).expect("initialize schema");
        let employee = insert_test_user(
            &db,
            "proposal-employee-1",
            "proposal-employee-1@example.test",
            "Nguyễn An",
            "USER",
            Some("NV-1001"),
        );
        let other_employee = insert_test_user(
            &db,
            "proposal-employee-2",
            "proposal-employee-2@example.test",
            "Trần Bình",
            "USER",
            Some("NV-1002"),
        );
        let admin = insert_test_user(
            &db,
            "proposal-admin-1",
            "proposal-admin-1@example.test",
            "HR Admin",
            ADMIN_ROLE,
            None,
        );
        let secret = b"employee-proposals-test-secret-at-least-32-bytes";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: None,
        };
        let app = crate::router(state.clone(), CorsLayer::new());
        (app, state, employee, other_employee, admin)
    }

    fn bearer(state: &AppState, user: &User) -> String {
        format!("Bearer {}", crate::issue_token(state, user).expect("JWT"))
    }

    #[tokio::test]
    async fn employee_proposals_persist_and_enforce_owner_and_admin_boundaries() {
        let (app, state, employee, other_employee, admin) = test_app();
        let employee_bearer = bearer(&state, &employee);
        let other_bearer = bearer(&state, &other_employee);
        let admin_bearer = bearer(&state, &admin);

        let anonymous_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/employee-proposals")
                    .body(Body::empty())
                    .expect("anonymous proposal list"),
            )
            .await
            .expect("anonymous proposal list response");
        assert_eq!(anonymous_list.status(), StatusCode::UNAUTHORIZED);

        let first = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/employee-proposals")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "title":"Cải tiến quy trình tiếp nhận",
                            "type":"Cải tiến quy trình",
                            "amount":"1250000",
                            "content":"Đề xuất chuẩn hóa luồng tiếp nhận và giảm thời gian xử lý."
                        })
                        .to_string(),
                    ))
                    .expect("create proposal request"),
            )
            .await
            .expect("create proposal response");
        assert_eq!(first.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(first.into_body(), 16 * 1024)
            .await
            .expect("created proposal body");
        let first: serde_json::Value =
            serde_json::from_slice(&body).expect("created proposal JSON");
        let first_id = first["proposal"]["key"]
            .as_str()
            .expect("proposal key")
            .to_owned();
        assert_eq!(first["proposal"]["type"], "Cải tiến quy trình");
        assert_eq!(first["proposal"]["amount"], 1_250_000);
        assert_eq!(first["proposal"]["submitterId"], employee.id);
        assert_eq!(first["proposal"]["employeeName"], "Nguyễn An");
        assert_eq!(first["proposal"]["employeeCode"], "NV-1001");
        assert_eq!(first["proposal"]["status"], "Chờ duyệt");
        assert!(
            first["proposal"]["code"]
                .as_str()
                .unwrap()
                .starts_with("KNG-")
        );

        let second = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/employee-proposals")
                    .header(AUTHORIZATION, &other_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "title":"Mua thiết bị làm việc",
                            "type":"Trang thiết bị & cơ sở vật chất",
                            "amount":0,
                            "content":"Không phát sinh dự toán kinh phí."
                        })
                        .to_string(),
                    ))
                    .expect("other proposal request"),
            )
            .await
            .expect("other proposal response");
        assert_eq!(second.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(second.into_body(), 16 * 1024)
            .await
            .expect("other proposal body");
        let second: serde_json::Value = serde_json::from_slice(&body).expect("other proposal JSON");
        let second_id = second["proposal"]["key"]
            .as_str()
            .expect("other proposal key")
            .to_owned();

        let own_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/employee-proposals")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee proposal list"),
            )
            .await
            .expect("employee proposal list response");
        let body = axum::body::to_bytes(own_list.into_body(), 16 * 1024)
            .await
            .expect("employee list body");
        let own_list: serde_json::Value =
            serde_json::from_slice(&body).expect("employee list JSON");
        assert_eq!(own_list["data"].as_array().unwrap().len(), 1);
        assert_eq!(own_list["data"][0]["key"], first_id);

        let cross_user_detail = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/employee-proposals/{second_id}"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("cross-user detail request"),
            )
            .await
            .expect("cross-user detail response");
        assert_eq!(cross_user_detail.status(), StatusCode::FORBIDDEN);

        let user_review = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/employee-proposals/{first_id}/review"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "status":"Đã duyệt" }).to_string()))
                    .expect("user review request"),
            )
            .await
            .expect("user review response");
        assert_eq!(user_review.status(), StatusCode::FORBIDDEN);

        let review = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/employee-proposals/{first_id}/review"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({ "status":"Từ chối", "reviewNote":"Cần bổ sung phân tích chi phí." })
                            .to_string(),
                    ))
                    .expect("admin review request"),
            )
            .await
            .expect("admin review response");
        assert_eq!(review.status(), StatusCode::OK);
        let body = axum::body::to_bytes(review.into_body(), 16 * 1024)
            .await
            .expect("admin review body");
        let review: serde_json::Value = serde_json::from_slice(&body).expect("admin review JSON");
        assert_eq!(review["proposal"]["status"], "Từ chối");
        assert_eq!(review["proposal"]["approver"], "HR Admin");
        assert_eq!(
            review["proposal"]["reviewNote"],
            "Cần bổ sung phân tích chi phí."
        );
        assert!(
            !review["proposal"]["reviewedAt"]
                .as_str()
                .unwrap()
                .is_empty()
        );

        let approval = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/employee-proposals/{second_id}/review"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "status":"Đã duyệt" }).to_string()))
                    .expect("admin approval request"),
            )
            .await
            .expect("admin approval response");
        assert_eq!(approval.status(), StatusCode::OK);
        let body = axum::body::to_bytes(approval.into_body(), 16 * 1024)
            .await
            .expect("admin approval body");
        let approval: serde_json::Value =
            serde_json::from_slice(&body).expect("admin approval JSON");
        assert_eq!(approval["proposal"]["status"], "Đã duyệt");
        assert_eq!(approval["proposal"]["reviewNote"], "");

        let duplicate_review = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/employee-proposals/{first_id}/review"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "status":"Đã duyệt" }).to_string()))
                    .expect("duplicate review request"),
            )
            .await
            .expect("duplicate review response");
        assert_eq!(duplicate_review.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let admin_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/employee-proposals")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin proposal list"),
            )
            .await
            .expect("admin proposal list response");
        let body = axum::body::to_bytes(admin_list.into_body(), 16 * 1024)
            .await
            .expect("admin list body");
        let admin_list: serde_json::Value = serde_json::from_slice(&body).expect("admin list JSON");
        assert_eq!(admin_list["data"].as_array().unwrap().len(), 2);

        let invalid_amount = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/employee-proposals")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "title":"Invalid amount",
                            "type":"Cải tiến",
                            "amount":-1,
                            "content":"Invalid amount must be rejected."
                        })
                        .to_string(),
                    ))
                    .expect("invalid amount request"),
            )
            .await
            .expect("invalid amount response");
        assert_eq!(invalid_amount.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let persisted_status: String = state
            .db
            .lock()
            .await
            .query_row(
                "SELECT status FROM employee_proposals WHERE id = ?1",
                params![first_id],
                |row| row.get(0),
            )
            .expect("persisted review status");
        assert_eq!(persisted_status, "Từ chối");
    }
}
