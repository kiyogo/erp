use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use chrono::NaiveDate;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const HISTORY_TYPES: [&str; 5] = [
    "Chức vụ",
    "Thuyên chuyển",
    "Nghỉ việc",
    "Khen thưởng",
    "Kỷ luật sự cố",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct EmployeeHistoryRecord {
    pub key: String,
    pub code: String,
    pub employee_id: String,
    pub employee_code: String,
    pub employee_name: String,
    #[serde(rename = "type")]
    pub history_type: String,
    pub event_date: String,
    pub old_value: String,
    pub new_value: String,
    pub decision_number: String,
    pub declared_signer: String,
    pub note: String,
    pub recorded_by: String,
    pub recorded_by_name: String,
    pub recorded_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateEmployeeHistoryInput {
    employee_code: String,
    #[serde(rename = "type")]
    history_type: String,
    event_date: String,
    #[serde(default)]
    old_value: String,
    new_value: String,
    #[serde(default)]
    decision_number: String,
    #[serde(default)]
    declared_signer: String,
    #[serde(default)]
    note: String,
}

pub(super) async fn list_history(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT h.history_key, h.code, h.employee_user_id, h.employee_code, employee.name,
                h.history_type, h.event_date, h.old_value, h.new_value, h.decision_number,
                h.declared_signer, h.note, h.actor_user_id, actor.name, h.created_at
         FROM hr_employee_history h
         JOIN users employee ON employee.id = h.employee_user_id
         JOIN users actor ON actor.id = h.actor_user_id
         ORDER BY h.event_date DESC, h.created_at DESC, h.history_key DESC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok(EmployeeHistoryRecord {
                key: row.get(0)?,
                code: row.get(1)?,
                employee_id: row.get(2)?,
                employee_code: row.get(3)?,
                employee_name: row.get(4)?,
                history_type: row.get(5)?,
                event_date: row.get(6)?,
                old_value: row.get(7)?,
                new_value: row.get(8)?,
                decision_number: row.get(9)?,
                declared_signer: row.get(10)?,
                note: row.get(11)?,
                recorded_by: row.get(12)?,
                recorded_by_name: row.get(13)?,
                recorded_at: row.get(14)?,
            })
        })
        .map_err(ApiError::internal)?;
    let records = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": records })))
}

pub(super) async fn create_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateEmployeeHistoryInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let employee_code = required_text(input.employee_code, "Mã nhân viên", 80)?;
    let history_type = required_text(input.history_type, "Loại biến động", 80)?;
    if !HISTORY_TYPES.contains(&history_type.as_str()) {
        return Err(ApiError::unprocessable("Loại biến động không hợp lệ."));
    }
    let event_date = required_text(input.event_date, "Ngày hiệu lực", 10)?;
    NaiveDate::parse_from_str(&event_date, "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable("Ngày hiệu lực phải theo định dạng YYYY-MM-DD."))?;
    let old_value = optional_text(input.old_value, "Giá trị cũ", 1_000)?;
    let new_value = required_text(input.new_value, "Giá trị mới", 1_000)?;
    let decision_number = optional_text(input.decision_number, "Số quyết định", 120)?;
    let declared_signer = optional_text(input.declared_signer, "Người ký khai báo", 160)?;
    let note = optional_text(input.note, "Ghi chú", 4_000)?;
    let key = Uuid::new_v4().to_string();
    let code = format!("LS-{}", &key[..8].to_uppercase());
    let timestamp = chrono::Utc::now().to_rfc3339();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let employee = transaction
        .query_row(
            "SELECT p.user_id, p.employee_code, u.name, p.employment_status
         FROM employee_profiles p JOIN users u ON u.id = p.user_id
         WHERE lower(p.employee_code) = lower(?1) AND u.role != 'ADMIN'",
            params![employee_code],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::unprocessable("Mã nhân viên không khớp hồ sơ HR."))?;
    if employee.3 == "Chờ kích hoạt" && history_type != "Nghỉ việc" {
        return Err(ApiError::unprocessable(
            "Hồ sơ nhân viên chưa được kích hoạt.",
        ));
    }
    transaction
        .execute(
            "INSERT INTO hr_employee_history
         (history_key, code, employee_user_id, employee_code, history_type, event_date,
          old_value, new_value, decision_number, declared_signer, note, actor_user_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                key,
                code,
                employee.0,
                employee.1,
                history_type,
                event_date,
                old_value,
                new_value,
                decision_number,
                declared_signer,
                note,
                actor.id,
                timestamp
            ],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "record": EmployeeHistoryRecord {
            key, code, employee_id: employee.0, employee_code: employee.1,
            employee_name: employee.2, history_type, event_date, old_value, new_value,
            decision_number, declared_signer, note, recorded_by: actor.id,
            recorded_by_name: actor.name, recorded_at: timestamp,
        }})),
    ))
}

fn required_text(value: String, label: &str, max: usize) -> ApiResult<String> {
    let value = value.trim();
    if value.is_empty() || value.len() > max {
        return Err(ApiError::unprocessable(format!("{label} không hợp lệ.")));
    }
    Ok(value.to_owned())
}

fn optional_text(value: String, label: &str, max: usize) -> ApiResult<String> {
    let value = value.trim();
    if value.len() > max {
        return Err(ApiError::unprocessable(format!("{label} quá dài.")));
    }
    Ok(value.to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::User;
    use axum::{
        body::{Body, to_bytes},
        http::{Method, Request},
    };
    use rusqlite::{Connection, params};
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn fixture() -> (axum::Router, AppState, User, User) {
        let db = Connection::open_in_memory().expect("history in-memory DB");
        crate::init_database(&db).expect("initialize history DB");
        let now = chrono::Utc::now().to_rfc3339();
        for (id, role, name) in [
            ("history-admin", "ADMIN", "HR Admin"),
            ("history-employee", "USER", "Nguyễn An"),
            ("history-pending", "USER", "Pending Person"),
        ] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), name, role, now],
            ).expect("insert history test user");
        }
        db.execute(
            "INSERT INTO employee_profiles (user_id,employee_code,department,position,employment_status,created_at,updated_at)
             VALUES ('history-employee','EMP-HIST-1','Kỹ thuật','Kỹ sư','Chính thức',?1,?1),
                    ('history-pending','EMP-HIST-P','Kỹ thuật','Kỹ sư','Chờ kích hoạt',?1,?1)",
            params![now],
        ).expect("insert HR profiles");
        let make_user = |id: &str, role: &str, name: &str| User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: name.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = make_user("history-admin", "ADMIN", "HR Admin");
        let employee = make_user("history-employee", "USER", "Nguyễn An");
        let secret = b"employee-history-test-secret-long-enough";
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
            crate::issue_token(state, user).expect("history JWT")
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
                    .expect("history request"),
            )
            .await
            .expect("history response")
    }

    async fn json_body(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 64 * 1024)
                .await
                .expect("history body"),
        )
        .expect("history JSON")
    }

    fn payload() -> Value {
        json!({
            "employeeCode":"EMP-HIST-1", "type":"Thuyên chuyển", "eventDate":"2026-04-01",
            "oldValue":"Kỹ thuật", "newValue":"Sản phẩm", "decisionNumber":"QD-2026-01",
            "declaredSigner":"Ban Giám đốc", "note":"Điều chuyển theo thông báo"
        })
    }

    #[tokio::test]
    async fn history_is_admin_only_and_binds_employee_and_actor_to_database_identity() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/employee-history",
                &employee_token,
                json!({})
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        let mut forged = payload();
        forged["employeeName"] = json!("Forged Name");
        forged["recordedBy"] = json!("forged-actor");
        forged["recordedAt"] = json!("1900-01-01");
        let response = call(
            &app,
            Method::POST,
            "/api/v1/hr/employee-history",
            &admin_token,
            forged,
        )
        .await;
        assert_eq!(response.status(), StatusCode::CREATED);
        let created = json_body(response).await;
        let row = &created["record"];
        assert_eq!(row["employeeId"], "history-employee");
        assert_eq!(row["employeeName"], "Nguyễn An");
        assert_eq!(row["employeeCode"], "EMP-HIST-1");
        assert_eq!(row["recordedBy"], admin.id);
        assert_eq!(row["recordedByName"], admin.name);
        assert_ne!(row["recordedAt"], "1900-01-01");

        let listed = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/employee-history",
                &admin_token,
                json!({}),
            )
            .await,
        )
        .await;
        assert_eq!(listed["data"].as_array().unwrap().len(), 1);
        assert_eq!(listed["data"][0]["code"], row["code"]);
        let db = state.db.lock().await;
        assert!(
            db.execute(
                "DELETE FROM hr_employee_history WHERE history_key = ?1",
                params![row["key"].as_str().unwrap()]
            )
            .is_err()
        );
    }

    #[tokio::test]
    async fn history_rejects_unknown_employee_invalid_category_and_bad_date() {
        let (app, state, admin, _) = fixture();
        let token = bearer(&state, &admin);
        for (field, value) in [
            ("employeeCode", json!("NO-SUCH-EMPLOYEE")),
            ("type", json!("Xác thực danh tính")),
            ("eventDate", json!("01/04/2026")),
            ("newValue", json!("  ")),
            ("employeeCode", json!("EMP-HIST-P")),
        ] {
            let mut input = payload();
            input[field] = value;
            assert_eq!(
                call(
                    &app,
                    Method::POST,
                    "/api/v1/hr/employee-history",
                    &token,
                    input
                )
                .await
                .status(),
                StatusCode::UNPROCESSABLE_ENTITY,
                "field {field}"
            );
        }
    }
}
