use axum::{
    Json,
    extract::{Path, State},
};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{ApiError, ApiResult, AppState, require_admin};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlanProgressRecord {
    key: String,
    code: String,
    plan_name: String,
    task_title: String,
    assignee: String,
    due_date: String,
    days_remaining: i64,
    progress_percent: i64,
    weight_percent: i64,
    status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UpdatePlanProgressInput {
    progress_percent: i64,
}

pub(super) async fn list_plan_progress(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare("SELECT record_json FROM collection_records WHERE scope = 'plan_progress' ORDER BY created_at DESC, record_key ASC")
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?;
    let data = rows
        .map(|row| {
            let serialized = row.map_err(ApiError::internal)?;
            serde_json::from_str::<PlanProgressRecord>(&serialized).map_err(ApiError::internal)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": data })))
}

pub(super) async fn update_plan_progress(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Path(progress_id): Path<String>,
    Json(input): Json<UpdatePlanProgressInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    if !(0..=100).contains(&input.progress_percent) {
        return Err(ApiError::unprocessable(
            "Tiến độ phải nằm trong khoảng 0 đến 100% và là số nguyên.",
        ));
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let serialized: Option<String> = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = 'plan_progress' AND record_key = ?1",
            params![progress_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(serialized) = serialized else {
        return Err(ApiError::not_found("Không tìm thấy hạng mục tiến độ."));
    };
    let mut record =
        serde_json::from_str::<PlanProgressRecord>(&serialized).map_err(ApiError::internal)?;
    if record.key != progress_id {
        return Err(ApiError::internal(
            "Stored progress key does not match its database key.",
        ));
    }
    record.progress_percent = input.progress_percent;
    record.status = if input.progress_percent == 100 {
        "Hoàn thành".to_owned()
    } else {
        "Đúng tiến độ".to_owned()
    };
    let serialized = serde_json::to_string(&record).map_err(ApiError::internal)?;
    let changed = transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = 'plan_progress' AND record_key = ?3",
            params![serialized, chrono::Utc::now().to_rfc3339(), progress_id],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::not_found("Không tìm thấy hạng mục tiến độ."));
    }
    let value = json!(record);
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "progress": value })))
}

pub(super) fn validate_import_record(value: &Value) -> ApiResult<()> {
    let progress = serde_json::from_value::<PlanProgressRecord>(value.clone())
        .map_err(|_| ApiError::unprocessable("Invalid legacy progress record."))?;
    if progress.code.trim().is_empty()
        || progress.code.len() > 64
        || progress.code.chars().any(char::is_control)
        || progress.plan_name.trim().is_empty()
        || progress.task_title.trim().is_empty()
        || progress.assignee.trim().is_empty()
        || progress.progress_percent < 0
        || progress.progress_percent > 100
        || progress.weight_percent < 0
        || progress.weight_percent > 100
        || !["Đúng tiến độ", "Chậm tiến độ", "Hoàn thành"].contains(&progress.status.as_str())
    {
        return Err(ApiError::unprocessable("Invalid legacy progress values."));
    }
    let date = chrono::NaiveDate::parse_from_str(&progress.due_date, "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable("Invalid legacy progress due date."))?;
    if date.format("%Y-%m-%d").to_string() != progress.due_date {
        return Err(ApiError::unprocessable("Invalid legacy progress due date."));
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
        let db = Connection::open_in_memory().expect("in-memory plan progress database");
        crate::init_database(&db).expect("initialize plan progress schema");
        let now = chrono::Utc::now().to_rfc3339();
        for (id, role) in [("progress-admin", "ADMIN"), ("progress-user", "USER")] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            ).expect("insert plan progress test user");
        }
        let record = json!({
            "key":"progress-1", "code":"TASK-P-01", "planName":"Nâng cấp nền tảng",
            "taskTitle":"Tối ưu truy vấn", "assignee":"Nguyễn An", "dueDate":"2026-12-20",
            "daysRemaining":10, "progressPercent":65, "weightPercent":25, "status":"Đúng tiến độ"
        });
        db.execute(
            "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('plan_progress','progress-1',?1,?2,?2)",
            params![record.to_string(), now],
        ).expect("insert progress fixture");
        let user = |id: &str, role: &str| crate::User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: id.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = user("progress-admin", "ADMIN");
        let employee = user("progress-user", "USER");
        let secret = b"plan-progress-test-secret-long-enough-for-hmac";
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
            crate::issue_token(state, user).expect("issue progress token")
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
            .oneshot(request.body(body).expect("plan progress request"))
            .await
            .expect("plan progress response")
    }

    #[tokio::test]
    async fn progress_updates_are_persistent_validated_and_admin_only() {
        let (app, state, admin, employee) = test_app();
        let admin_token = bearer(&state, &admin);
        let user_token = bearer(&state, &employee);

        assert_eq!(
            call(&app, "GET", "/api/v1/plan-progress", &user_token, None)
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                "PATCH",
                "/api/v1/plan-progress/progress-1",
                &user_token,
                Some(json!({"progressPercent":80}))
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                "GET",
                "/api/v1/collections/plan_progress",
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
                "/api/v1/collections/plan_progress",
                &admin_token,
                Some(json!({"record":{}}))
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );

        let invalid = call(
            &app,
            "PATCH",
            "/api/v1/plan-progress/progress-1",
            &admin_token,
            Some(json!({"progressPercent":101})),
        )
        .await;
        assert_eq!(invalid.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let negative = call(
            &app,
            "PATCH",
            "/api/v1/plan-progress/progress-1",
            &admin_token,
            Some(json!({"progressPercent":-1})),
        )
        .await;
        assert_eq!(negative.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let completed = call(
            &app,
            "PATCH",
            "/api/v1/plan-progress/progress-1",
            &admin_token,
            Some(json!({"progressPercent":100})),
        )
        .await;
        assert_eq!(completed.status(), StatusCode::OK);
        let body = axum::body::to_bytes(completed.into_body(), 16 * 1024)
            .await
            .expect("updated progress body");
        let completed: Value = serde_json::from_slice(&body).expect("updated progress JSON");
        assert_eq!(completed["progress"]["progressPercent"], 100);
        assert_eq!(completed["progress"]["status"], "Hoàn thành");
        assert_eq!(completed["progress"]["weightPercent"], 25);

        let list = call(&app, "GET", "/api/v1/plan-progress", &admin_token, None).await;
        assert_eq!(list.status(), StatusCode::OK);
        let body = axum::body::to_bytes(list.into_body(), 16 * 1024)
            .await
            .expect("plan progress list body");
        let list: Value = serde_json::from_slice(&body).expect("plan progress list JSON");
        assert_eq!(list["data"][0]["progressPercent"], 100);
        assert_eq!(list["data"][0]["daysRemaining"], 10);
    }
}
