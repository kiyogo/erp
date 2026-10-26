use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use chrono::{NaiveDate, Utc};
use rusqlite::{TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const ACTIVE: &str = "Đang tuyển dụng";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct HrJobOpening {
    key: String,
    job_code: String,
    title: String,
    department: String,
    level: String,
    headcount_needed: i64,
    salary_range: String,
    deadline: String,
    recruiter: String,
    experience_req: String,
    status: String,
    created_by: String,
    created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateHrJobOpeningInput {
    job_code: String,
    title: String,
    department: String,
    level: String,
    headcount_needed: i64,
    #[serde(default)]
    salary_range: String,
    deadline: String,
    #[serde(default)]
    recruiter: String,
    #[serde(default)]
    experience_req: String,
}

pub(super) async fn list_openings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT record_key, record_json FROM collection_records
             WHERE scope = 'hr_job_openings' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?;
    let openings = rows
        .map(|row| {
            let (record_key, serialized) = row.map_err(ApiError::internal)?;
            let mut opening: HrJobOpening =
                serde_json::from_str(&serialized).map_err(ApiError::internal)?;
            if opening.key.trim().is_empty() {
                opening.key = record_key;
            }
            Ok(opening)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": openings })))
}

pub(super) async fn create_opening(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateHrJobOpeningInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let mut opening = validate_input(input)?;
    let timestamp = Utc::now().to_rfc3339();
    opening.key = Uuid::new_v4().to_string();
    opening.status = ACTIVE.to_owned();
    opening.created_by = actor.id;
    opening.created_at = timestamp.clone();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let existing = {
        let mut statement = transaction
            .prepare("SELECT record_json FROM collection_records WHERE scope = 'hr_job_openings'")
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(ApiError::internal)?
    };
    for serialized in existing {
        let current: HrJobOpening =
            serde_json::from_str(&serialized).map_err(ApiError::internal)?;
        if current.job_code.eq_ignore_ascii_case(&opening.job_code) {
            return Err(ApiError::conflict("Mã vị trí tuyển dụng đã tồn tại."));
        }
    }

    let serialized = serde_json::to_string(&opening).map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at)
             VALUES ('hr_job_openings', ?1, ?2, ?3, ?3)",
            params![opening.key, serialized, timestamp],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                ApiError::conflict("Mã hồ sơ tuyển dụng đã tồn tại.")
            } else {
                ApiError::internal(error)
            }
        })?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "opening": opening }))))
}

fn validate_input(input: CreateHrJobOpeningInput) -> ApiResult<HrJobOpening> {
    let job_code = required_text(input.job_code, "Mã vị trí", 64)?;
    let title = required_text(input.title, "Chức danh", 160)?;
    let department = required_text(input.department, "Phòng ban", 120)?;
    let level = required_text(input.level, "Cấp bậc", 32)?;
    if !["Fresher", "Junior", "Senior", "Lead", "Manager"].contains(&level.as_str()) {
        return Err(ApiError::unprocessable("Cấp bậc tuyển dụng không hợp lệ."));
    }
    if !(1..=500).contains(&input.headcount_needed) {
        return Err(ApiError::unprocessable(
            "Chỉ tiêu tuyển dụng phải từ 1 đến 500.",
        ));
    }
    let deadline = required_date(input.deadline)?;
    Ok(HrJobOpening {
        job_code,
        title,
        department,
        level,
        headcount_needed: input.headcount_needed,
        salary_range: optional_text(input.salary_range, "Khung lương", 120)?,
        deadline,
        recruiter: optional_text(input.recruiter, "HR phụ trách", 120)?,
        experience_req: optional_text(input.experience_req, "Yêu cầu kinh nghiệm", 2_000)?,
        ..HrJobOpening::default()
    })
}

fn required_text(value: String, field: &str, limit: usize) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.is_empty()
        || value.encode_utf16().count() > limit
        || value.chars().any(char::is_control)
    {
        return Err(ApiError::unprocessable(format!(
            "{field} không hợp lệ hoặc vượt quá {limit} ký tự."
        )));
    }
    Ok(value)
}

fn optional_text(value: String, field: &str, limit: usize) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.encode_utf16().count() > limit || value.chars().any(char::is_control) {
        return Err(ApiError::unprocessable(format!(
            "{field} không hợp lệ hoặc vượt quá {limit} ký tự."
        )));
    }
    Ok(value)
}

fn required_date(value: String) -> ApiResult<String> {
    let value = value.trim().to_owned();
    let parsed = NaiveDate::parse_from_str(&value, "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable("Hạn tuyển dụng cần theo định dạng YYYY-MM-DD."))?;
    if parsed.format("%Y-%m-%d").to_string() != value {
        return Err(ApiError::unprocessable(
            "Hạn tuyển dụng cần theo định dạng YYYY-MM-DD.",
        ));
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::User;
    use axum::{
        body::{Body, to_bytes},
        http::{Method, Request},
    };
    use rusqlite::Connection;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn fixture() -> (axum::Router, AppState, User, User) {
        let db = Connection::open_in_memory().expect("recruitment in-memory database");
        crate::init_database(&db).expect("initialize recruitment database");
        let now = Utc::now().to_rfc3339();
        for (id, role) in [
            ("recruitment-admin", "ADMIN"),
            ("recruitment-employee", "USER"),
        ] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            )
            .expect("insert recruitment test account");
        }
        let make_user = |id: &str, role: &str| User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: id.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = make_user("recruitment-admin", "ADMIN");
        let employee = make_user("recruitment-employee", "USER");
        let secret = b"recruitment-test-secret-long-enough-for-a-token";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: None,
        };
        (
            crate::router(state.clone(), CorsLayer::new()),
            state,
            admin,
            employee,
        )
    }

    fn bearer(state: &AppState, user: &User) -> String {
        format!(
            "Bearer {}",
            crate::issue_token(state, user).expect("recruitment test JWT")
        )
    }

    async fn call(
        app: &axum::Router,
        method: Method,
        uri: &str,
        token: &str,
        body: Value,
    ) -> axum::response::Response {
        app.clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("authorization", token)
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .expect("recruitment request"),
            )
            .await
            .expect("recruitment response")
    }

    async fn json_body(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 64 * 1024)
                .await
                .expect("recruitment response body"),
        )
        .expect("recruitment JSON")
    }

    fn payload(code: &str) -> Value {
        json!({
            "jobCode":code,"title":"Kỹ sư Rust","department":"Kỹ thuật",
            "level":"Senior","headcountNeeded":2,"salaryRange":"25 - 40 triệu",
            "deadline":"2026-12-01","recruiter":"HR Team","experienceReq":"Rust, SQL"
        })
    }

    #[tokio::test]
    async fn recruitment_openings_are_admin_only_typed_and_persist_without_fake_pipeline_counts() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/recruitment-openings",
                &employee_token,
                json!({})
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/recruitment-openings",
                &employee_token,
                payload("TD-2026/001")
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/collections/hr_job_openings",
                &admin_token,
                json!({})
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/collections/hr_job_openings",
                &admin_token,
                json!({"record":payload("BYPASS")})
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );

        let mut submitted = payload("TD-2026/001");
        submitted["key"] = json!("client-chosen-key");
        submitted["status"] = json!("Đã đóng (Đủ định biên)");
        submitted["candidatesApplied"] = json!(200);
        submitted["interviewedCount"] = json!(100);
        submitted["offeredCount"] = json!(2);
        let created = call(
            &app,
            Method::POST,
            "/api/v1/hr/recruitment-openings",
            &admin_token,
            submitted,
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let created = json_body(created).await;
        let opening = &created["opening"];
        assert_ne!(opening["key"], "client-chosen-key");
        assert_eq!(opening["status"], ACTIVE);
        assert_eq!(opening["createdBy"], admin.id);
        assert_eq!(opening["headcountNeeded"], 2);
        assert!(opening.get("candidatesApplied").is_none());
        assert!(opening.get("interviewedCount").is_none());
        assert!(opening.get("offeredCount").is_none());

        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/recruitment-openings",
                &admin_token,
                payload("td-2026/001")
            )
            .await
            .status(),
            StatusCode::CONFLICT
        );
        let listed = call(
            &app,
            Method::GET,
            "/api/v1/hr/recruitment-openings",
            &admin_token,
            json!({}),
        )
        .await;
        let listed = json_body(listed).await;
        assert_eq!(listed["data"].as_array().unwrap().len(), 1);
        assert!(listed["data"][0].get("candidatesApplied").is_none());
    }

    #[tokio::test]
    async fn recruitment_create_rejects_invalid_fields() {
        let (app, state, admin, _) = fixture();
        let token = bearer(&state, &admin);
        let mut bad = payload("TD-INVALID");
        bad["level"] = json!("Intern");
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/recruitment-openings",
                &token,
                bad
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let mut bad = payload("TD-INVALID");
        bad["headcountNeeded"] = json!(0);
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/recruitment-openings",
                &token,
                bad
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let mut bad = payload("TD-INVALID");
        bad["deadline"] = json!("2026-02-30");
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/recruitment-openings",
                &token,
                bad
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
}
