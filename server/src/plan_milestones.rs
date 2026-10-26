use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::NaiveDate;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const QUARTER_MIN_YEAR: u16 = 2000;
const QUARTER_MAX_YEAR: u16 = 2100;
const IN_PROGRESS: &str = "Đang thực hiện";
const ACHIEVED: &str = "Đã đạt mốc";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StrategicMilestone {
    key: String,
    code: String,
    quarter: String,
    name: String,
    acceptance_criteria: String,
    owner: String,
    deadline: String,
    progress: u8,
    status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateStrategicMilestoneInput {
    code: String,
    quarter: String,
    name: String,
    acceptance_criteria: String,
    owner: String,
    deadline: String,
}

pub(super) async fn list_milestones(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare("SELECT record_json FROM collection_records WHERE scope = 'plan_milestones' ORDER BY created_at DESC, record_key ASC")
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?;
    let milestones = rows
        .map(|row| {
            let serialized = row.map_err(ApiError::internal)?;
            serde_json::from_str::<StrategicMilestone>(&serialized).map_err(ApiError::internal)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": milestones })))
}

pub(super) async fn create_milestone(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(input): Json<CreateStrategicMilestoneInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    require_admin(&state, &headers).await?;
    let code = input.code.trim().to_ascii_uppercase();
    if code.is_empty()
        || code.len() > 64
        || !code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
    {
        return Err(ApiError::unprocessable(
            "Mã mốc chỉ gồm chữ cái, chữ số, dấu gạch ngang hoặc gạch dưới; tối đa 64 ký tự.",
        ));
    }
    let quarter = validate_quarter(input.quarter)?;
    let name = required_text(input.name, "Tên mốc", 160)?;
    let acceptance_criteria =
        required_text(input.acceptance_criteria, "Tiêu chuẩn nghiệm thu", 2_000)?;
    let owner = required_text(input.owner, "Người phụ trách", 160)?;
    let deadline = required_date(input.deadline)?;

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let existing = {
        let mut statement = transaction
            .prepare("SELECT record_json FROM collection_records WHERE scope = 'plan_milestones'")
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?;
        rows.map(|row| row.map_err(ApiError::internal))
            .collect::<ApiResult<Vec<_>>>()?
    };
    let existing = existing
        .iter()
        .map(|serialized| {
            serde_json::from_str::<StrategicMilestone>(serialized).map_err(ApiError::internal)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    if existing
        .iter()
        .any(|item| item.code.eq_ignore_ascii_case(&code))
    {
        return Err(ApiError::conflict("Mã mốc đã tồn tại."));
    }

    let milestone = StrategicMilestone {
        key: Uuid::new_v4().to_string(),
        code,
        quarter,
        name,
        acceptance_criteria,
        owner,
        deadline,
        progress: 0,
        status: IN_PROGRESS.to_owned(),
    };
    let serialized = serde_json::to_string(&milestone).map_err(ApiError::internal)?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES ('plan_milestones', ?1, ?2, ?3, ?3)",
            params![milestone.key, serialized, timestamp],
        )
        .map_err(ApiError::internal)?;
    let value = json!(milestone);
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "milestone": value }))))
}

pub(super) async fn mark_achieved(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Path(milestone_id): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let serialized: Option<String> = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = 'plan_milestones' AND record_key = ?1",
            params![milestone_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(serialized) = serialized else {
        return Err(ApiError::not_found("Không tìm thấy mốc kế hoạch."));
    };
    let mut milestone =
        serde_json::from_str::<StrategicMilestone>(&serialized).map_err(ApiError::internal)?;
    if milestone.key != milestone_id {
        return Err(ApiError::internal(
            "Stored milestone key does not match its database key.",
        ));
    }
    milestone.progress = 100;
    milestone.status = ACHIEVED.to_owned();
    let serialized = serde_json::to_string(&milestone).map_err(ApiError::internal)?;
    let changed = transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = 'plan_milestones' AND record_key = ?3",
            params![serialized, chrono::Utc::now().to_rfc3339(), milestone_id],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::not_found("Không tìm thấy mốc kế hoạch."));
    }
    let value = json!(milestone);
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "milestone": value })))
}

fn validate_quarter(value: String) -> ApiResult<String> {
    let value = value.trim().to_owned();
    let Some((quarter, year)) = value.split_once('/') else {
        return Err(ApiError::unprocessable(
            "Kỳ kế hoạch phải có định dạng Q1/YYYY đến Q4/YYYY.",
        ));
    };
    let valid_quarter = matches!(quarter, "Q1" | "Q2" | "Q3" | "Q4");
    let valid_year = year
        .parse::<u16>()
        .is_ok_and(|year| (QUARTER_MIN_YEAR..=QUARTER_MAX_YEAR).contains(&year));
    if !valid_quarter || !valid_year || year.len() != 4 {
        return Err(ApiError::unprocessable(
            "Kỳ kế hoạch phải có định dạng Q1/YYYY đến Q4/YYYY.",
        ));
    }
    Ok(value)
}

fn required_text(value: String, field: &str, max_length: usize) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.is_empty()
        || value.encode_utf16().count() > max_length
        || value.chars().any(char::is_control)
    {
        return Err(ApiError::unprocessable(format!(
            "{field} không hợp lệ hoặc vượt quá {max_length} ký tự."
        )));
    }
    Ok(value)
}

fn required_date(value: String) -> ApiResult<String> {
    let value = value.trim().to_owned();
    let date = NaiveDate::parse_from_str(&value, "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable("Hạn mốc phải có định dạng YYYY-MM-DD."))?;
    if date.format("%Y-%m-%d").to_string() != value {
        return Err(ApiError::unprocessable(
            "Hạn mốc phải có định dạng YYYY-MM-DD.",
        ));
    }
    Ok(value)
}

pub(super) fn validate_import_record(value: &Value) -> ApiResult<()> {
    let milestone = serde_json::from_value::<StrategicMilestone>(value.clone())
        .map_err(|_| ApiError::unprocessable("Invalid legacy milestone record."))?;
    let code = milestone.code.trim().to_ascii_uppercase();
    if code.is_empty()
        || code.len() > 64
        || !code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
    {
        return Err(ApiError::unprocessable("Invalid legacy milestone code."));
    }
    validate_quarter(milestone.quarter.clone())?;
    required_text(milestone.name, "Tên mốc", 160)?;
    required_text(
        milestone.acceptance_criteria,
        "Tiêu chuẩn nghiệm thu",
        2_000,
    )?;
    required_text(milestone.owner, "Người phụ trách", 160)?;
    required_date(milestone.deadline)?;
    if milestone.progress > 100
        || ![IN_PROGRESS, ACHIEVED, "Chưa bắt đầu"].contains(&milestone.status.as_str())
    {
        return Err(ApiError::unprocessable(
            "Invalid legacy milestone progress or status.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use rusqlite::Connection;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn test_app() -> (axum::Router, crate::AppState, crate::User, crate::User) {
        let db = Connection::open_in_memory().expect("in-memory milestone database");
        crate::init_database(&db).expect("initialize milestone schema");
        let now = chrono::Utc::now().to_rfc3339();
        for (id, role) in [("milestone-admin", "ADMIN"), ("milestone-user", "USER")] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            ).expect("insert milestone test user");
        }
        let user = |id: &str, role: &str| crate::User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: id.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = user("milestone-admin", "ADMIN");
        let employee = user("milestone-user", "USER");
        let secret = b"milestone-test-secret-that-is-long-enough-32-bytes";
        let state = crate::AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: None,
        };
        let app = crate::router(state.clone(), CorsLayer::new());
        (app, state, admin, employee)
    }

    fn bearer(state: &crate::AppState, user: &crate::User) -> String {
        format!(
            "Bearer {}",
            crate::issue_token(state, user).expect("issue milestone token")
        )
    }

    async fn call(
        app: &axum::Router,
        method: &str,
        uri: &str,
        auth: &str,
        payload: Option<Value>,
    ) -> axum::response::Response {
        let mut request = Request::builder()
            .method(method)
            .uri(uri)
            .header("Authorization", auth);
        let body = match payload {
            Some(value) => {
                request = request.header("Content-Type", "application/json");
                Body::from(value.to_string())
            }
            None => Body::empty(),
        };
        app.clone()
            .oneshot(request.body(body).expect("milestone request"))
            .await
            .expect("milestone response")
    }

    fn input(code: &str) -> Value {
        json!({
            "code": code, "quarter": "Q4/2026", "name": "Hoàn tất kiểm thử tải",
            "acceptanceCriteria": "Đạt 50.000 CCU trong 30 phút", "owner": "Khối Kỹ thuật",
            "deadline": "2026-12-31"
        })
    }

    #[tokio::test]
    async fn milestone_lifecycle_is_persistent_and_admin_scoped() {
        let (app, state, admin, employee) = test_app();
        let admin_token = bearer(&state, &admin);
        let user_token = bearer(&state, &employee);

        assert_eq!(
            call(&app, "GET", "/api/v1/plan-milestones", &user_token, None)
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/plan-milestones",
                &user_token,
                Some(input("MLS-Q4-01"))
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                "GET",
                "/api/v1/collections/plan_milestones",
                &user_token,
                None
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/collections/plan_milestones",
                &admin_token,
                Some(json!({"record": input("BYPASS")}))
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );

        let created = call(
            &app,
            "POST",
            "/api/v1/plan-milestones",
            &admin_token,
            Some(input("mls-q4-01")),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 16 * 1024)
            .await
            .expect("created milestone body");
        let created: Value = serde_json::from_slice(&body).expect("created milestone JSON");
        let key = created["milestone"]["key"]
            .as_str()
            .expect("milestone key")
            .to_owned();
        assert_eq!(created["milestone"]["code"], "MLS-Q4-01");
        assert_eq!(created["milestone"]["status"], IN_PROGRESS);
        assert_eq!(created["milestone"]["progress"], 0);

        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/plan-milestones",
                &admin_token,
                Some(input("MLS-Q4-01"))
            )
            .await
            .status(),
            StatusCode::CONFLICT
        );
        let invalid = call(&app, "POST", "/api/v1/plan-milestones", &admin_token, Some(json!({
            "code":"MLS-BAD", "quarter":"Q5/2026", "name":"Bad", "acceptanceCriteria":"Criteria",
            "owner":"Owner", "deadline":"2026-12-31"
        }))).await;
        assert_eq!(invalid.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let invalid_deadline = call(&app, "POST", "/api/v1/plan-milestones", &admin_token, Some(json!({
            "code":"MLS-BAD-DATE", "quarter":"Q4/2026", "name":"Bad", "acceptanceCriteria":"Criteria",
            "owner":"Owner", "deadline":"2026-02-30"
        }))).await;
        assert_eq!(invalid_deadline.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let completed = call(
            &app,
            "PATCH",
            &format!("/api/v1/plan-milestones/{key}/achieve"),
            &admin_token,
            None,
        )
        .await;
        assert_eq!(completed.status(), StatusCode::OK);
        let body = axum::body::to_bytes(completed.into_body(), 16 * 1024)
            .await
            .expect("achieved milestone body");
        let completed: Value = serde_json::from_slice(&body).expect("achieved milestone JSON");
        assert_eq!(completed["milestone"]["status"], ACHIEVED);
        assert_eq!(completed["milestone"]["progress"], 100);

        let list = call(&app, "GET", "/api/v1/plan-milestones", &admin_token, None).await;
        assert_eq!(list.status(), StatusCode::OK);
        let body = axum::body::to_bytes(list.into_body(), 16 * 1024)
            .await
            .expect("milestone list body");
        let list: Value = serde_json::from_slice(&body).expect("milestone list JSON");
        assert_eq!(list["data"].as_array().unwrap().len(), 1);
        assert_eq!(list["data"][0]["status"], ACHIEVED);
    }
}
