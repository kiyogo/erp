use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::NaiveDate;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const PRIORITIES: &[&str] = &["Chiến lược cấp 1", "Trọng điểm cấp 2", "Thường xuyên"];
const ACTIVE: &str = "Đang triển khai";
const COMPLETE: &str = "Đã hoàn thành";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StrategicPlan {
    key: String,
    code: String,
    name: String,
    department: String,
    start_date: String,
    end_date: String,
    budget: i64,
    manager: String,
    priority: String,
    status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateStrategicPlanInput {
    code: String,
    name: String,
    department: String,
    start_date: String,
    end_date: String,
    budget: i64,
    manager: String,
    priority: String,
}

pub(super) async fn list_strategic_plans(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    Ok(Json(json!({ "data": read_plans(&db)? })))
}

pub(super) async fn create_strategic_plan(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(input): Json<CreateStrategicPlanInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    require_admin(&state, &headers).await?;
    let code = input.code.trim().to_ascii_uppercase();
    let name = required_text(input.name, "Tên kế hoạch", 160)?;
    let department = required_text(input.department, "Khối phụ trách", 160)?;
    let manager = required_text(input.manager, "Chủ nhiệm kế hoạch", 160)?;
    let start_date = required_date(input.start_date, "Ngày bắt đầu")?;
    let end_date = required_date(input.end_date, "Ngày kết thúc")?;
    if end_date < start_date {
        return Err(ApiError::unprocessable(
            "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.",
        ));
    }
    if input.budget < 0 || input.budget > 1_000_000_000_000 {
        return Err(ApiError::unprocessable(
            "Ngân sách phải nằm trong khoảng 0 đến 1.000.000.000.000 VNĐ.",
        ));
    }
    if !PRIORITIES.contains(&input.priority.as_str()) {
        return Err(ApiError::unprocessable("Cấp độ ưu tiên không hợp lệ."));
    }
    if code.is_empty()
        || code.len() > 64
        || !code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
    {
        return Err(ApiError::unprocessable(
            "Mã kế hoạch chỉ gồm chữ cái, chữ số, dấu gạch ngang hoặc gạch dưới; tối đa 64 ký tự.",
        ));
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let existing_codes = {
        let mut statement = transaction
            .prepare("SELECT record_json FROM collection_records WHERE scope = 'plan_items'")
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?;
        rows.map(|row| row.map_err(ApiError::internal))
            .collect::<ApiResult<Vec<_>>>()?
    };
    let duplicate = existing_codes.iter().any(|serialized| {
        serde_json::from_str::<StrategicPlan>(serialized)
            .is_ok_and(|plan| plan.code.eq_ignore_ascii_case(&code))
    });
    if duplicate {
        return Err(ApiError::conflict("Mã kế hoạch đã tồn tại."));
    }
    let plan = StrategicPlan {
        key: Uuid::new_v4().to_string(),
        code,
        name,
        department,
        start_date,
        end_date,
        budget: input.budget,
        manager,
        priority: input.priority,
        status: ACTIVE.to_owned(),
    };
    let serialized = serde_json::to_string(&plan).map_err(ApiError::internal)?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES ('plan_items', ?1, ?2, ?3, ?3)",
            params![plan.key, serialized, timestamp],
        )
        .map_err(ApiError::internal)?;
    let record = json!(plan);
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "plan": record }))))
}

pub(super) async fn complete_strategic_plan(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Path(plan_id): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let serialized: Option<String> = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = 'plan_items' AND record_key = ?1",
            params![plan_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(serialized) = serialized else {
        return Err(ApiError::not_found("Không tìm thấy kế hoạch."));
    };
    let mut plan =
        serde_json::from_str::<StrategicPlan>(&serialized).map_err(ApiError::internal)?;
    if plan.key != plan_id {
        return Err(ApiError::internal(
            "Stored plan key does not match its database key.",
        ));
    }
    plan.status = COMPLETE.to_owned();
    let serialized = serde_json::to_string(&plan).map_err(ApiError::internal)?;
    let changed = transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = 'plan_items' AND record_key = ?3",
            params![serialized, chrono::Utc::now().to_rfc3339(), plan_id],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::not_found("Không tìm thấy kế hoạch."));
    }
    let value = json!(plan);
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "plan": value })))
}

fn read_plans(db: &Connection) -> ApiResult<Vec<StrategicPlan>> {
    let mut statement = db
        .prepare("SELECT record_json FROM collection_records WHERE scope = 'plan_items' ORDER BY created_at DESC, record_key ASC")
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?;
    rows.map(|row| {
        let serialized = row.map_err(ApiError::internal)?;
        serde_json::from_str::<StrategicPlan>(&serialized).map_err(ApiError::internal)
    })
    .collect()
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

fn required_date(value: String, field: &str) -> ApiResult<String> {
    let value = value.trim().to_owned();
    let date = NaiveDate::parse_from_str(&value, "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable(format!("{field} phải có định dạng YYYY-MM-DD.")))?;
    if date.format("%Y-%m-%d").to_string() != value {
        return Err(ApiError::unprocessable(format!(
            "{field} phải có định dạng YYYY-MM-DD."
        )));
    }
    Ok(value)
}

pub(super) fn validate_import_record(value: &Value) -> ApiResult<()> {
    let plan = serde_json::from_value::<StrategicPlan>(value.clone())
        .map_err(|_| ApiError::unprocessable("Invalid legacy plan record."))?;
    let code = plan.code.trim().to_ascii_uppercase();
    if code.is_empty()
        || code.len() > 64
        || !code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
    {
        return Err(ApiError::unprocessable("Invalid legacy plan code."));
    }
    required_text(plan.name, "Tên kế hoạch", 160)?;
    required_text(plan.department, "Khối phụ trách", 160)?;
    required_text(plan.manager, "Chủ nhiệm kế hoạch", 160)?;
    required_date(plan.start_date.clone(), "Ngày bắt đầu")?;
    required_date(plan.end_date.clone(), "Ngày kết thúc")?;
    if plan.end_date < plan.start_date || !(0..=1_000_000_000_000).contains(&plan.budget) {
        return Err(ApiError::unprocessable(
            "Invalid legacy plan date or budget.",
        ));
    }
    if !PRIORITIES.contains(&plan.priority.as_str())
        || ![ACTIVE, "Đã phê duyệt", COMPLETE].contains(&plan.status.as_str())
    {
        return Err(ApiError::unprocessable(
            "Invalid legacy plan status or priority.",
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

    fn test_app() -> (axum::Router, AppState, crate::User, crate::User) {
        let db = Connection::open_in_memory().expect("in-memory plans database");
        crate::init_database(&db).expect("initialize plans schema");
        let now = chrono::Utc::now().to_rfc3339();
        for (id, role) in [("plan-admin", "ADMIN"), ("plan-user", "USER")] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            ).expect("insert plans test user");
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
        let admin = user("plan-admin", "ADMIN");
        let employee = user("plan-user", "USER");
        let secret = b"plans-test-secret-that-is-long-enough-32-bytes";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: None,
        };
        let app = crate::router(state.clone(), CorsLayer::new());
        (app, state, admin, employee)
    }

    fn bearer(state: &AppState, user: &crate::User) -> String {
        format!(
            "Bearer {}",
            crate::issue_token(state, user).expect("issue plan test token")
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
            .oneshot(request.body(body).expect("plans request"))
            .await
            .expect("plans response")
    }

    fn input(code: &str) -> Value {
        json!({
            "code": code, "name": "Mở rộng hạ tầng",
            "department": "Khối Kỹ thuật", "startDate": "2026-09-01", "endDate": "2026-12-31",
            "budget": 1_500_000_000_i64, "manager": "Người phụ trách", "priority": "Chiến lược cấp 1"
        })
    }

    #[tokio::test]
    async fn plan_lifecycle_is_persistent_and_admin_scoped() {
        let (app, state, admin, employee) = test_app();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);

        let denied = call(&app, "GET", "/api/v1/plans", &employee_token, None).await;
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);
        let employee_create = call(
            &app,
            "POST",
            "/api/v1/plans",
            &employee_token,
            Some(input("KH-01")),
        )
        .await;
        assert_eq!(employee_create.status(), StatusCode::FORBIDDEN);
        let generic_write = call(
            &app,
            "POST",
            "/api/v1/collections/plan_items",
            &admin_token,
            Some(json!({"record": input("BYPASS")})),
        )
        .await;
        assert_eq!(generic_write.status(), StatusCode::BAD_REQUEST);
        let generic_read = call(
            &app,
            "GET",
            "/api/v1/collections/plan_items",
            &employee_token,
            None,
        )
        .await;
        assert_eq!(generic_read.status(), StatusCode::FORBIDDEN);

        let created = call(
            &app,
            "POST",
            "/api/v1/plans",
            &admin_token,
            Some(input("kh-2026-01")),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 16 * 1024)
            .await
            .expect("created plan body");
        let created: Value = serde_json::from_slice(&body).expect("created plan JSON");
        let key = created["plan"]["key"]
            .as_str()
            .expect("plan key")
            .to_owned();
        assert_eq!(created["plan"]["code"], "KH-2026-01");
        assert_eq!(created["plan"]["status"], ACTIVE);

        let duplicate = call(
            &app,
            "POST",
            "/api/v1/plans",
            &admin_token,
            Some(input("KH-2026-01")),
        )
        .await;
        assert_eq!(duplicate.status(), StatusCode::CONFLICT);
        let invalid_dates = call(&app, "POST", "/api/v1/plans", &admin_token, Some(json!({
            "code":"KH-BAD", "name":"Bad", "department":"IT", "startDate":"2026-12-31", "endDate":"2026-01-01",
            "budget":0, "manager":"Owner", "priority":"Thường xuyên"
        }))).await;
        assert_eq!(invalid_dates.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let completed = call(
            &app,
            "PATCH",
            &format!("/api/v1/plans/{key}/complete"),
            &admin_token,
            None,
        )
        .await;
        assert_eq!(completed.status(), StatusCode::OK);
        let body = axum::body::to_bytes(completed.into_body(), 16 * 1024)
            .await
            .expect("completed plan body");
        let completed: Value = serde_json::from_slice(&body).expect("completed plan JSON");
        assert_eq!(completed["plan"]["status"], COMPLETE);

        let list = call(&app, "GET", "/api/v1/plans", &admin_token, None).await;
        assert_eq!(list.status(), StatusCode::OK);
        let body = axum::body::to_bytes(list.into_body(), 16 * 1024)
            .await
            .expect("plan list body");
        let list: Value = serde_json::from_slice(&body).expect("plan list JSON");
        assert_eq!(list["data"].as_array().unwrap().len(), 1);
        assert_eq!(list["data"][0]["status"], COMPLETE);
    }
}
