use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use chrono::{Duration, NaiveDate, Utc};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const ONGOING: &str = "Đang hội nhập";
const COMPLETED: &str = "Đã hoàn thành";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct HrOnboardingRecord {
    key: String,
    employee_id: String,
    employee_name: String,
    emp_code: String,
    position: String,
    department: String,
    start_date: String,
    evaluation_date: String,
    mentor_id: String,
    mentor: String,
    mentor_phone: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    progress: Option<i64>,
    current_step: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    laptop_provided: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    email_created: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    contract_signed: Option<bool>,
    status: String,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateHrOnboardingInput {
    employee_code: String,
    mentor_code: String,
    start_date: String,
}

pub(super) async fn list_records(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT record_key, record_json FROM collection_records
             WHERE scope = 'hr_onboarding_tasks' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?;
    let records = rows
        .map(|row| {
            let (record_key, serialized) = row.map_err(ApiError::internal)?;
            let mut record: HrOnboardingRecord =
                serde_json::from_str(&serialized).map_err(ApiError::internal)?;
            if record.key.trim().is_empty() {
                record.key = record_key;
            }
            Ok(record)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": records })))
}

pub(super) async fn create_record(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateHrOnboardingInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let employee_code = required_text(input.employee_code, "Mã nhân sự", 64)?;
    let mentor_code = required_text(input.mentor_code, "Mã mentor", 64)?;
    if employee_code.eq_ignore_ascii_case(&mentor_code) {
        return Err(ApiError::unprocessable(
            "Nhân sự không thể tự làm mentor cho lộ trình của mình.",
        ));
    }
    let start_date = required_date(input.start_date)?;
    let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
        .map_err(|_| ApiError::internal("validated onboarding start date could not be parsed"))?;
    let evaluation_date = (start + Duration::days(60)).format("%Y-%m-%d").to_string();
    let timestamp = Utc::now().to_rfc3339();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let employee = lookup_employee(&transaction, &employee_code)?
        .ok_or_else(|| ApiError::unprocessable("Mã nhân sự không khớp hồ sơ HR."))?;
    if employee.5 == "Đã nghỉ việc" {
        return Err(ApiError::unprocessable(
            "Không thể tạo lộ trình cho nhân sự đã nghỉ việc.",
        ));
    }
    let mentor = lookup_employee(&transaction, &mentor_code)?
        .ok_or_else(|| ApiError::unprocessable("Mã mentor không khớp hồ sơ HR."))?;
    if mentor.5 == "Đã nghỉ việc" {
        return Err(ApiError::unprocessable(
            "Không thể chỉ định nhân sự đã nghỉ việc làm mentor.",
        ));
    }

    let existing = {
        let mut statement = transaction
            .prepare(
                "SELECT record_json FROM collection_records WHERE scope = 'hr_onboarding_tasks'",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(ApiError::internal)?
    };
    for serialized in existing {
        let current: HrOnboardingRecord =
            serde_json::from_str(&serialized).map_err(ApiError::internal)?;
        let same_employee = (!current.employee_id.is_empty() && current.employee_id == employee.0)
            || current.emp_code.eq_ignore_ascii_case(&employee.1);
        if same_employee && current.status != COMPLETED {
            return Err(ApiError::conflict(
                "Nhân sự đã có một lộ trình onboarding chưa hoàn tất.",
            ));
        }
    }

    let record = HrOnboardingRecord {
        key: Uuid::new_v4().to_string(),
        employee_id: employee.0,
        employee_name: employee.2,
        emp_code: employee.1,
        position: employee.3,
        department: employee.4,
        start_date,
        evaluation_date,
        mentor_id: mentor.0,
        mentor: mentor.2,
        mentor_phone: mentor.6,
        progress: None,
        current_step: String::new(),
        laptop_provided: None,
        email_created: None,
        contract_signed: None,
        status: ONGOING.to_owned(),
        extra: BTreeMap::from([
            ("createdBy".to_owned(), Value::String(actor.id)),
            ("createdAt".to_owned(), Value::String(timestamp.clone())),
            ("checklistStateAvailable".to_owned(), Value::Bool(false)),
        ]),
    };
    let serialized = serde_json::to_string(&record).map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at)
             VALUES ('hr_onboarding_tasks', ?1, ?2, ?3, ?3)",
            params![record.key, serialized, timestamp],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                ApiError::conflict("Onboarding record key already exists.")
            } else {
                ApiError::internal(error)
            }
        })?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "record": record }))))
}

fn lookup_employee(
    transaction: &rusqlite::Transaction<'_>,
    employee_code: &str,
) -> ApiResult<Option<(String, String, String, String, String, String, String)>> {
    transaction
        .query_row(
            "SELECT p.user_id, p.employee_code, u.name, p.position, p.department,
                    p.employment_status, p.phone
             FROM employee_profiles p JOIN users u ON u.id = p.user_id
             WHERE lower(p.employee_code) = lower(?1) AND u.role != 'ADMIN'",
            params![employee_code],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            },
        )
        .optional()
        .map_err(ApiError::internal)
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

fn required_date(value: String) -> ApiResult<String> {
    let value = value.trim().to_owned();
    let parsed = NaiveDate::parse_from_str(&value, "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable("Ngày bắt đầu phải theo định dạng YYYY-MM-DD."))?;
    if parsed.format("%Y-%m-%d").to_string() != value {
        return Err(ApiError::unprocessable(
            "Ngày bắt đầu phải theo định dạng YYYY-MM-DD.",
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
        let db = Connection::open_in_memory().expect("onboarding in-memory database");
        crate::init_database(&db).expect("initialize onboarding database");
        let now = Utc::now().to_rfc3339();
        for (id, role) in [
            ("onboarding-admin", "ADMIN"),
            ("onboarding-employee", "USER"),
            ("onboarding-mentor", "USER"),
        ] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            )
            .expect("insert onboarding test account");
        }
        db.execute(
            "INSERT INTO employee_profiles (user_id,employee_code,phone,department,position,employment_status,created_at,updated_at)
             VALUES ('onboarding-employee','EMP-NEW-1','0912000001','Kỹ thuật','Kỹ sư mới','Chờ kích hoạt',?1,?1),
                    ('onboarding-mentor','EMP-MENTOR-1','0912000002','Kỹ thuật','Kỹ sư trưởng','Chính thức',?1,?1)",
            params![now],
        )
        .expect("insert onboarding HR profiles");
        let make_user = |id: &str, role: &str| User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: id.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = make_user("onboarding-admin", "ADMIN");
        let employee = make_user("onboarding-employee", "USER");
        let secret = b"onboarding-test-secret-long-enough-for-a-token";
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
            crate::issue_token(state, user).expect("onboarding test JWT")
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
                    .expect("onboarding request"),
            )
            .await
            .expect("onboarding response")
    }

    async fn json_body(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 64 * 1024)
                .await
                .expect("onboarding response body"),
        )
        .expect("onboarding JSON")
    }

    fn payload(employee_code: &str, mentor_code: &str) -> Value {
        json!({
            "employeeCode":employee_code,"mentorCode":mentor_code,"startDate":"2026-10-01"
        })
    }

    #[tokio::test]
    async fn onboarding_is_admin_only_linked_persistent_and_does_not_fabricate_checklist_state() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/onboarding",
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
                "/api/v1/hr/onboarding",
                &employee_token,
                payload("EMP-NEW-1", "EMP-MENTOR-1")
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/collections/hr_onboarding_tasks",
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
                "/api/v1/collections/hr_onboarding_tasks",
                &admin_token,
                json!({"record":payload("EMP-NEW-1", "EMP-MENTOR-1")})
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );

        let created = call(
            &app,
            Method::POST,
            "/api/v1/hr/onboarding",
            &admin_token,
            payload("EMP-NEW-1", "EMP-MENTOR-1"),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let created = json_body(created).await;
        let record = &created["record"];
        assert_eq!(record["employeeId"], "onboarding-employee");
        assert_eq!(record["employeeName"], "onboarding-employee");
        assert_eq!(record["empCode"], "EMP-NEW-1");
        assert_eq!(record["position"], "Kỹ sư mới");
        assert_eq!(record["department"], "Kỹ thuật");
        assert_eq!(record["mentorId"], "onboarding-mentor");
        assert_eq!(record["mentor"], "onboarding-mentor");
        assert_eq!(record["mentorPhone"], "0912000002");
        assert_eq!(record["evaluationDate"], "2026-11-30");
        assert_eq!(record["status"], ONGOING);
        assert_eq!(record["checklistStateAvailable"], false);
        assert!(record.get("progress").is_none());
        assert!(record.get("laptopProvided").is_none());
        assert!(record.get("emailCreated").is_none());
        assert!(record.get("contractSigned").is_none());
        assert_eq!(record["createdBy"], admin.id);
        let key = record["key"].as_str().expect("onboarding key");

        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/onboarding",
                &admin_token,
                payload("emp-new-1", "EMP-MENTOR-1")
            )
            .await
            .status(),
            StatusCode::CONFLICT
        );
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/onboarding",
                &admin_token,
                payload("MISSING", "EMP-MENTOR-1")
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/onboarding",
                &admin_token,
                payload("EMP-NEW-1", "EMP-NEW-1")
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let mut invalid_date = payload("EMP-NEW-1", "EMP-MENTOR-1");
        invalid_date["startDate"] = json!("2026-02-30");
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/onboarding",
                &admin_token,
                invalid_date
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );

        let listed = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/onboarding",
                &admin_token,
                json!({}),
            )
            .await,
        )
        .await;
        assert_eq!(listed["data"].as_array().unwrap().len(), 1);
        assert_eq!(listed["data"][0]["key"], key);
    }
}
