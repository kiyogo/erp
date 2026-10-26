use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use chrono::{NaiveDate, Utc};
use rusqlite::{TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const SCHEDULED: &str = "Sắp khai giảng";
const MAX_BUDGET: i64 = 1_000_000_000_000;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct TrainingCourse {
    key: String,
    course_code: String,
    course_name: String,
    category: String,
    instructor: String,
    start_date: String,
    end_date: String,
    duration_hours: i64,
    participants_count: i64,
    completion_rate: f64,
    budget: i64,
    location: String,
    status: String,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateTrainingCourseInput {
    #[serde(default)]
    course_code: String,
    course_name: String,
    category: String,
    instructor: String,
    start_date: String,
    end_date: String,
    duration_hours: i64,
    participants_count: i64,
    budget: i64,
    #[serde(default)]
    location: String,
}

pub(super) async fn list_courses(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT record_key, record_json FROM collection_records
             WHERE scope = 'hr_training_courses' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?;
    let courses = rows
        .map(|row| {
            let (record_key, serialized) = row.map_err(ApiError::internal)?;
            let mut course: TrainingCourse =
                serde_json::from_str(&serialized).map_err(ApiError::internal)?;
            if course.key.trim().is_empty() {
                course.key = record_key;
            }
            Ok(course)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": courses })))
}

pub(super) async fn create_course(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateTrainingCourseInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let mut course = validate_input(input)?;
    if course.course_code.is_empty() {
        course.course_code = generated_code();
    }
    course.key = Uuid::new_v4().to_string();
    course.status = SCHEDULED.to_owned();
    course.completion_rate = 0.0;
    course
        .extra
        .insert("createdBy".to_owned(), Value::String(actor.id));
    course.extra.insert(
        "createdAt".to_owned(),
        Value::String(Utc::now().to_rfc3339()),
    );

    let serialized = serde_json::to_string(&course).map_err(ApiError::internal)?;
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let existing = {
        let mut statement = transaction
            .prepare(
                "SELECT record_json FROM collection_records WHERE scope = 'hr_training_courses'",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(ApiError::internal)?
    };
    for serialized_existing in existing {
        let current: TrainingCourse =
            serde_json::from_str(&serialized_existing).map_err(ApiError::internal)?;
        if current
            .course_code
            .eq_ignore_ascii_case(&course.course_code)
        {
            return Err(ApiError::conflict("Mã khóa đào tạo đã được sử dụng."));
        }
    }
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at)
             VALUES ('hr_training_courses', ?1, ?2, ?3, ?3)",
            params![course.key, serialized, timestamp],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                ApiError::conflict("Mã khóa đào tạo đã được sử dụng.")
            } else {
                ApiError::internal(error)
            }
        })?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "course": course }))))
}

fn validate_input(input: CreateTrainingCourseInput) -> ApiResult<TrainingCourse> {
    let course_code = optional_text(input.course_code, "Mã khóa đào tạo", 80)?;
    let course_name = required_text(input.course_name, "Tên khóa đào tạo", 220)?;
    let category = required_text(input.category, "Chuyên ngành", 100)?;
    if ![
        "Bảo mật & Tuân thủ",
        "Công nghệ & Kỹ thuật",
        "Kinh doanh & Kỹ năng mềm",
        "Tài chính & Quản trị",
    ]
    .contains(&category.as_str())
    {
        return Err(ApiError::unprocessable(
            "Chuyên ngành đào tạo không hợp lệ.",
        ));
    }
    let instructor = required_text(input.instructor, "Giảng viên", 180)?;
    let start_date = required_date(input.start_date, "Ngày bắt đầu")?;
    let end_date = required_date(input.end_date, "Ngày kết thúc")?;
    let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
        .map_err(|_| ApiError::internal("validated start date could not be parsed"))?;
    let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
        .map_err(|_| ApiError::internal("validated end date could not be parsed"))?;
    if end < start {
        return Err(ApiError::unprocessable(
            "Ngày kết thúc không được trước ngày bắt đầu.",
        ));
    }
    if !(1..=10_000).contains(&input.duration_hours) {
        return Err(ApiError::unprocessable(
            "Thời lượng phải từ 1 đến 10.000 giờ.",
        ));
    }
    if !(1..=100_000).contains(&input.participants_count) {
        return Err(ApiError::unprocessable(
            "Chỉ tiêu học viên phải từ 1 đến 100.000.",
        ));
    }
    if !(0..=MAX_BUDGET).contains(&input.budget) {
        return Err(ApiError::unprocessable("Kinh phí đào tạo không hợp lệ."));
    }
    Ok(TrainingCourse {
        course_code,
        course_name,
        category,
        instructor,
        start_date,
        end_date,
        duration_hours: input.duration_hours,
        participants_count: input.participants_count,
        budget: input.budget,
        location: optional_text(input.location, "Địa điểm", 240)?,
        ..TrainingCourse::default()
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
            "{field} vượt quá {limit} ký tự."
        )));
    }
    Ok(value)
}

fn required_date(value: String, field: &str) -> ApiResult<String> {
    let value = value.trim().to_owned();
    let parsed = NaiveDate::parse_from_str(&value, "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable(format!("{field} phải có định dạng YYYY-MM-DD.")))?;
    if parsed.format("%Y-%m-%d").to_string() != value {
        return Err(ApiError::unprocessable(format!(
            "{field} phải có định dạng YYYY-MM-DD."
        )));
    }
    Ok(value)
}

fn generated_code() -> String {
    let date = Utc::now().format("%Y%m%d");
    let suffix = Uuid::new_v4().simple().to_string()[..8].to_ascii_uppercase();
    format!("DT-{date}-{suffix}")
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
        let db = Connection::open_in_memory().expect("training in-memory database");
        crate::init_database(&db).expect("initialize training database");
        let now = Utc::now().to_rfc3339();
        for (id, role) in [("training-admin", "ADMIN"), ("training-user", "USER")] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            ).expect("insert training test account");
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
        let admin = make_user("training-admin", "ADMIN");
        let employee = make_user("training-user", "USER");
        let secret = b"training-test-secret-long-enough-for-a-token";
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
            crate::issue_token(state, user).expect("training test JWT")
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
                    .expect("training request"),
            )
            .await
            .expect("training response")
    }

    async fn json_body(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 64 * 1024)
                .await
                .expect("body"),
        )
        .expect("JSON")
    }

    fn payload(code: &str) -> Value {
        json!({
            "courseCode":code,"courseName":"Bảo mật ứng dụng","category":"Bảo mật & Tuân thủ",
            "instructor":"Đội an toàn thông tin","startDate":"2026-11-01","endDate":"2026-11-02",
            "durationHours":8,"participantsCount":24,"budget":12000000,"location":"Phòng đào tạo"
        })
    }

    #[tokio::test]
    async fn training_courses_are_admin_only_validated_persistent_and_not_generic_writable() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/training-courses",
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
                "/api/v1/hr/training-courses",
                &employee_token,
                payload("DT-01")
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/collections/hr_training_courses",
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
                "/api/v1/collections/hr_training_courses",
                &admin_token,
                json!({"record":payload("BYPASS")})
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );

        let created = call(
            &app,
            Method::POST,
            "/api/v1/hr/training-courses",
            &admin_token,
            payload("DT-2026/01"),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let created_json = json_body(created).await;
        let course = &created_json["course"];
        assert_eq!(course["courseCode"], "DT-2026/01");
        assert_eq!(course["status"], SCHEDULED);
        assert_eq!(course["completionRate"], 0.0);
        assert_eq!(course["participantsCount"], 24);
        assert_eq!(course["createdBy"], admin.id);
        let key = course["key"].as_str().expect("course key").to_owned();

        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/training-courses",
                &admin_token,
                payload("dt-2026/01")
            )
            .await
            .status(),
            StatusCode::CONFLICT
        );
        let generated = call(
            &app,
            Method::POST,
            "/api/v1/hr/training-courses",
            &admin_token,
            payload(""),
        )
        .await;
        assert_eq!(generated.status(), StatusCode::CREATED);
        let generated_json = json_body(generated).await;
        assert!(
            generated_json["course"]["courseCode"]
                .as_str()
                .is_some_and(|code| code.starts_with("DT-"))
        );
        let invalid_dates = json!({"courseCode":"DT-BAD","courseName":"Course","category":"Bảo mật & Tuân thủ","instructor":"Trainer","startDate":"2026-11-02","endDate":"2026-11-01","durationHours":8,"participantsCount":2,"budget":0});
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/training-courses",
                &admin_token,
                invalid_dates
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );

        let list = call(
            &app,
            Method::GET,
            "/api/v1/hr/training-courses",
            &admin_token,
            json!({}),
        )
        .await;
        assert_eq!(list.status(), StatusCode::OK);
        let listed = json_body(list).await;
        assert_eq!(listed["data"].as_array().unwrap().len(), 2);
        let original = listed["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["key"] == key)
            .expect("original course in list");
        assert_eq!(original["courseName"], "Bảo mật ứng dụng");
    }
}
