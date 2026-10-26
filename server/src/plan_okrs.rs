use axum::{Json, extract::State, http::StatusCode};
use chrono::NaiveDate;
use rusqlite::{TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const PILLARS: &[&str] = &[
    "Tăng trưởng Doanh thu",
    "Hạ tầng Công nghệ & AI",
    "Tuân thủ An ninh & ISO",
    "Mở rộng Thị phần B2B",
];
const IN_PROGRESS: &str = "Đang đúng tiến độ";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StrategicOkr {
    key: String,
    okr_code: String,
    title: String,
    pillar: String,
    owner: String,
    target_metric: String,
    progress_pct: f64,
    deadline: String,
    status: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateStrategicOkrInput {
    okr_code: String,
    title: String,
    pillar: String,
    owner: String,
    target_metric: String,
    progress_pct: f64,
    deadline: String,
}

pub(super) async fn list_okrs(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare("SELECT record_json FROM collection_records WHERE scope = 'plan_okrs' ORDER BY created_at DESC, record_key ASC")
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?;
    let okrs = rows
        .map(|row| {
            let serialized = row.map_err(ApiError::internal)?;
            serde_json::from_str::<StrategicOkr>(&serialized).map_err(ApiError::internal)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": okrs })))
}

pub(super) async fn create_okr(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(input): Json<CreateStrategicOkrInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    require_admin(&state, &headers).await?;
    let okr_code = input.okr_code.trim().to_ascii_uppercase();
    if okr_code.is_empty()
        || okr_code.len() > 64
        || !okr_code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
    {
        return Err(ApiError::unprocessable(
            "Mã OKR chỉ gồm chữ cái, chữ số, dấu gạch ngang hoặc gạch dưới; tối đa 64 ký tự.",
        ));
    }
    let title = required_text(input.title, "Tiêu đề mục tiêu", 200)?;
    let pillar = input.pillar.trim().to_owned();
    if !PILLARS.contains(&pillar.as_str()) {
        return Err(ApiError::unprocessable("Trụ cột chiến lược không hợp lệ."));
    }
    let owner = required_text(input.owner, "Người phụ trách", 160)?;
    let target_metric = required_text(input.target_metric, "Chỉ số kết quả", 500)?;
    if !input.progress_pct.is_finite() || !(0.0..=100.0).contains(&input.progress_pct) {
        return Err(ApiError::unprocessable(
            "Tiến độ phải là số hữu hạn trong khoảng 0 đến 100.",
        ));
    }
    let deadline = required_date(input.deadline)?;

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let existing = {
        let mut statement = transaction
            .prepare("SELECT record_json FROM collection_records WHERE scope = 'plan_okrs'")
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
            serde_json::from_str::<StrategicOkr>(serialized).map_err(ApiError::internal)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    if existing
        .iter()
        .any(|okr| okr.okr_code.eq_ignore_ascii_case(&okr_code))
    {
        return Err(ApiError::conflict("Mã OKR đã tồn tại."));
    }

    let okr = StrategicOkr {
        key: Uuid::new_v4().to_string(),
        okr_code,
        title,
        pillar,
        owner,
        target_metric,
        progress_pct: input.progress_pct,
        deadline,
        status: IN_PROGRESS.to_owned(),
    };
    let serialized = serde_json::to_string(&okr).map_err(ApiError::internal)?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES ('plan_okrs', ?1, ?2, ?3, ?3)",
            params![okr.key, serialized, timestamp],
        )
        .map_err(ApiError::internal)?;
    let value = json!(okr);
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "okr": value }))))
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
        .map_err(|_| ApiError::unprocessable("Hạn chót phải có định dạng YYYY-MM-DD."))?;
    if date.format("%Y-%m-%d").to_string() != value {
        return Err(ApiError::unprocessable(
            "Hạn chót phải có định dạng YYYY-MM-DD.",
        ));
    }
    Ok(value)
}

pub(super) fn validate_import_record(value: &Value) -> ApiResult<()> {
    let okr = serde_json::from_value::<StrategicOkr>(value.clone())
        .map_err(|_| ApiError::unprocessable("Invalid legacy OKR record."))?;
    let code = okr.okr_code.trim().to_ascii_uppercase();
    if code.is_empty()
        || code.len() > 64
        || !code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
    {
        return Err(ApiError::unprocessable("Invalid legacy OKR code."));
    }
    required_text(okr.title, "Tiêu đề mục tiêu", 200)?;
    if !PILLARS.contains(&okr.pillar.as_str()) {
        return Err(ApiError::unprocessable("Invalid legacy OKR pillar."));
    }
    required_text(okr.owner, "Người phụ trách", 160)?;
    required_text(okr.target_metric, "Chỉ số kết quả", 500)?;
    if !okr.progress_pct.is_finite() || !(0.0..=100.0).contains(&okr.progress_pct) {
        return Err(ApiError::unprocessable("Invalid legacy OKR progress."));
    }
    required_date(okr.deadline)?;
    if ![IN_PROGRESS, "Hoàn thành vượt chỉ tiêu", "Cần tăng tốc"].contains(&okr.status.as_str())
    {
        return Err(ApiError::unprocessable("Invalid legacy OKR status."));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use rusqlite::Connection;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn test_app() -> (axum::Router, AppState, crate::User, crate::User) {
        let db = Connection::open_in_memory().expect("in-memory OKR database");
        crate::init_database(&db).expect("initialize OKR schema");
        let now = chrono::Utc::now().to_rfc3339();
        for (id, role) in [("okr-admin", "ADMIN"), ("okr-user", "USER")] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            ).expect("insert OKR test user");
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
        let admin = user("okr-admin", "ADMIN");
        let employee = user("okr-user", "USER");
        let secret = b"strategic-okr-test-secret-long-enough-for-hmac";
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
            crate::issue_token(state, user).expect("issue OKR test token")
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
            .oneshot(request.body(body).expect("OKR request"))
            .await
            .expect("OKR response")
    }

    fn input(code: &str, progress: f64) -> Value {
        json!({
            "okrCode": code,
            "title": "Mở rộng hạ tầng chiến lược",
            "pillar": "Hạ tầng Công nghệ & AI",
            "owner": "Người phụ trách",
            "targetMetric": "Mở rộng thêm 12 rack IDC",
            "progressPct": progress,
            "deadline": "2026-12-31"
        })
    }

    #[tokio::test]
    async fn okr_list_and_create_are_persistent_and_admin_scoped() {
        let (app, state, admin, employee) = test_app();
        let admin_token = bearer(&state, &admin);
        let user_token = bearer(&state, &employee);
        assert_eq!(
            call(&app, "GET", "/api/v1/plan-okrs", &user_token, None)
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/plan-okrs",
                &user_token,
                Some(input("OKR-26-1", 50.0))
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                "GET",
                "/api/v1/collections/plan_okrs",
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
                "/api/v1/collections/plan_okrs",
                &admin_token,
                Some(json!({"record":{}}))
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );

        let created = call(
            &app,
            "POST",
            "/api/v1/plan-okrs",
            &admin_token,
            Some(input("okr-2026-01", 0.0)),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 16 * 1024)
            .await
            .expect("created OKR body");
        let created: Value = serde_json::from_slice(&body).expect("created OKR JSON");
        let key = created["okr"]["key"].as_str().expect("OKR key").to_owned();
        assert_eq!(created["okr"]["okrCode"], "OKR-2026-01");
        assert_eq!(created["okr"]["progressPct"], 0.0);
        assert_eq!(created["okr"]["status"], IN_PROGRESS);

        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/plan-okrs",
                &admin_token,
                Some(input("OKR-2026-01", 50.0))
            )
            .await
            .status(),
            StatusCode::CONFLICT
        );
        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/plan-okrs",
                &admin_token,
                Some(input("OKR-BAD", 100.1))
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let bad_pillar = call(
            &app,
            "POST",
            "/api/v1/plan-okrs",
            &admin_token,
            Some(json!({
                "okrCode":"OKR-BAD-PILLAR", "title":"Goal", "pillar":"Fake pillar", "owner":"Owner",
                "targetMetric":"Metric", "progressPct":50, "deadline":"2026-12-31"
            })),
        )
        .await;
        assert_eq!(bad_pillar.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let bad_date = call(&app, "POST", "/api/v1/plan-okrs", &admin_token, Some(json!({
            "okrCode":"OKR-BAD-DATE", "title":"Goal", "pillar":"Hạ tầng Công nghệ & AI", "owner":"Owner",
            "targetMetric":"Metric", "progressPct":50, "deadline":"2026-02-30"
        }))).await;
        assert_eq!(bad_date.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let listed = call(&app, "GET", "/api/v1/plan-okrs", &admin_token, None).await;
        assert_eq!(listed.status(), StatusCode::OK);
        let body = axum::body::to_bytes(listed.into_body(), 16 * 1024)
            .await
            .expect("listed OKR body");
        let listed: Value = serde_json::from_slice(&body).expect("listed OKR JSON");
        assert_eq!(listed["data"].as_array().unwrap().len(), 1);
        assert_eq!(listed["data"][0]["key"], key);
    }
}
