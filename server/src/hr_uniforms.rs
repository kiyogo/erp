use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use chrono::Utc;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const PENDING: &str = "Chờ cấp phát";
const DELIVERED: &str = "Đã bàn giao";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct HrUniformRequest {
    key: String,
    code: String,
    employee_id: String,
    employee_name: String,
    emp_code: String,
    department: String,
    item_type: String,
    size: String,
    quantity: i64,
    request_date: String,
    delivery_date: String,
    note: String,
    status: String,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateHrUniformInput {
    employee_code: String,
    item_type: String,
    size: String,
    quantity: i64,
    #[serde(default)]
    note: String,
}

pub(super) async fn list_uniforms(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT record_key, record_json FROM collection_records
             WHERE scope = 'hr_uniforms' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?;
    let uniforms = rows
        .map(|row| {
            let (record_key, serialized) = row.map_err(ApiError::internal)?;
            let mut uniform: HrUniformRequest =
                serde_json::from_str(&serialized).map_err(ApiError::internal)?;
            if uniform.key.trim().is_empty() {
                uniform.key = record_key;
            }
            Ok(uniform)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": uniforms })))
}

pub(super) async fn create_uniform(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateHrUniformInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let mut uniform = validate_input(input)?;
    let timestamp = Utc::now().to_rfc3339();
    uniform.key = Uuid::new_v4().to_string();
    uniform.request_date = Utc::now().format("%Y-%m-%d").to_string();
    uniform.delivery_date.clear();
    uniform.status = PENDING.to_owned();
    uniform
        .extra
        .insert("createdBy".to_owned(), Value::String(actor.id));
    uniform
        .extra
        .insert("createdAt".to_owned(), Value::String(timestamp.clone()));

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let employee = transaction
        .query_row(
            "SELECT p.user_id, p.employee_code, u.name, p.department, p.employment_status
             FROM employee_profiles p JOIN users u ON u.id = p.user_id
             WHERE lower(p.employee_code) = lower(?1) AND u.role != 'ADMIN'",
            params![&uniform.emp_code],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::unprocessable("Mã nhân sự không khớp hồ sơ nhân viên."))?;
    if employee.4 == "Đã nghỉ việc" {
        return Err(ApiError::unprocessable(
            "Không thể tạo phiếu cho nhân sự đã nghỉ việc.",
        ));
    }
    uniform.employee_id = employee.0;
    uniform.emp_code = employee.1;
    uniform.employee_name = employee.2;
    uniform.department = employee.3;

    let existing = {
        let mut statement = transaction
            .prepare("SELECT record_json FROM collection_records WHERE scope = 'hr_uniforms'")
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(ApiError::internal)?
    };
    let mut existing_codes = Vec::with_capacity(existing.len());
    for serialized in existing {
        let current: HrUniformRequest =
            serde_json::from_str(&serialized).map_err(ApiError::internal)?;
        existing_codes.push(current.code);
    }
    let mut code = generated_code();
    for _ in 0..8 {
        if !existing_codes
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(&code))
        {
            break;
        }
        code = generated_code();
    }
    if existing_codes
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(&code))
    {
        return Err(ApiError::conflict(
            "Không thể cấp mã phiếu đồng phục duy nhất; hãy thử lại.",
        ));
    }
    uniform.code = code;

    let serialized = serde_json::to_string(&uniform).map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at)
             VALUES ('hr_uniforms', ?1, ?2, ?3, ?3)",
            params![uniform.key, serialized, timestamp],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "uniform": uniform }))))
}

pub(super) async fn handover_uniform(
    State(state): State<AppState>,
    Path(uniform_key): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let serialized = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = 'hr_uniforms' AND record_key = ?1",
            params![&uniform_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy phiếu đồng phục."))?;
    let mut uniform: HrUniformRequest =
        serde_json::from_str(&serialized).map_err(ApiError::internal)?;
    if uniform.key.trim().is_empty() {
        uniform.key = uniform_key.clone();
    }
    if uniform.status != PENDING {
        return Err(ApiError::conflict(
            "Phiếu không còn ở trạng thái chờ cấp phát.",
        ));
    }
    let now = Utc::now();
    let timestamp = now.to_rfc3339();
    uniform.status = DELIVERED.to_owned();
    uniform.delivery_date = now.format("%Y-%m-%d").to_string();
    uniform
        .extra
        .insert("handedOverBy".to_owned(), Value::String(actor.id));
    uniform
        .extra
        .insert("handedOverAt".to_owned(), Value::String(timestamp.clone()));
    let serialized = serde_json::to_string(&uniform).map_err(ApiError::internal)?;
    transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2
             WHERE scope = 'hr_uniforms' AND record_key = ?3",
            params![serialized, timestamp, uniform_key],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "uniform": uniform })))
}

fn validate_input(input: CreateHrUniformInput) -> ApiResult<HrUniformRequest> {
    let emp_code = required_text(input.employee_code, "Mã nhân sự", 64)?;
    let item_type = required_text(input.item_type, "Loại đồng phục", 120)?;
    if ![
        "Áo Polo Doanh Nghiệp KIYOVN",
        "Áo Hoodie & Polo Kỹ Thuật",
        "Áo Sơ Mi & Vest Đồng Phục",
    ]
    .contains(&item_type.as_str())
    {
        return Err(ApiError::unprocessable("Loại đồng phục không hợp lệ."));
    }
    let size = required_text(input.size, "Kích cỡ", 8)?;
    if !["S", "M", "L", "XL", "XXL"].contains(&size.as_str()) {
        return Err(ApiError::unprocessable("Kích cỡ đồng phục không hợp lệ."));
    }
    if !(1..=5).contains(&input.quantity) {
        return Err(ApiError::unprocessable(
            "Số lượng cấp phát phải từ 1 đến 5 bộ.",
        ));
    }
    let note = optional_text(input.note, "Ghi chú", 500)?;
    Ok(HrUniformRequest {
        emp_code,
        item_type,
        size,
        quantity: input.quantity,
        note,
        ..HrUniformRequest::default()
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

fn generated_code() -> String {
    let date = Utc::now().format("%Y%m%d");
    let suffix = Uuid::new_v4().simple().to_string()[..8].to_ascii_uppercase();
    format!("DP-{date}-{suffix}")
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
        let db = Connection::open_in_memory().expect("uniforms in-memory database");
        crate::init_database(&db).expect("initialize uniforms database");
        let now = Utc::now().to_rfc3339();
        for (id, role) in [("uniform-admin", "ADMIN"), ("uniform-user", "USER")] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            )
            .expect("insert uniforms test account");
        }
        db.execute(
            "INSERT INTO employee_profiles (user_id, employee_code, department, employment_status, created_at, updated_at)
             VALUES ('uniform-user', 'EMP-001', 'Kỹ thuật', 'Chính thức', ?1, ?1)",
            params![now],
        )
        .expect("insert uniform employee profile");
        let make_user = |id: &str, role: &str| User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: id.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = make_user("uniform-admin", "ADMIN");
        let employee = make_user("uniform-user", "USER");
        let secret = b"uniform-test-secret-long-enough-for-a-token";
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
            crate::issue_token(state, user).expect("uniform test JWT")
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
                    .expect("uniform request"),
            )
            .await
            .expect("uniform response")
    }

    async fn json_body(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 64 * 1024)
                .await
                .expect("uniform response body"),
        )
        .expect("uniform JSON")
    }

    fn payload() -> Value {
        json!({
            "employeeCode":"EMP-001","itemType":"Áo Polo Doanh Nghiệp KIYOVN",
            "size":"L","quantity":2,"note":"Cấp mới"
        })
    }

    #[tokio::test]
    async fn uniform_requests_link_hr_records_and_handover_once_under_admin_scope() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/uniforms",
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
                Method::GET,
                "/api/v1/collections/hr_uniforms",
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
                Method::PATCH,
                "/api/v1/collections/hr_uniforms/old-key",
                &admin_token,
                json!({"patch":{"status":"Đã bàn giao"}})
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );

        let created = call(
            &app,
            Method::POST,
            "/api/v1/hr/uniforms",
            &admin_token,
            payload(),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let created = json_body(created).await;
        let uniform = &created["uniform"];
        assert_eq!(uniform["status"], PENDING);
        assert_eq!(uniform["employeeName"], "uniform-user");
        assert_eq!(uniform["empCode"], "EMP-001");
        assert_eq!(uniform["department"], "Kỹ thuật");
        assert_eq!(uniform["employeeId"], "uniform-user");
        assert!(uniform["requestDate"].as_str().is_some());
        assert_eq!(uniform["deliveryDate"], "");
        assert!(uniform["code"].as_str().unwrap().starts_with("DP-"));
        let key = uniform["key"].as_str().expect("uniform key");

        let mut invalid_quantity = payload();
        invalid_quantity["quantity"] = json!(6);
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/uniforms",
                &admin_token,
                invalid_quantity
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let mut fake_employee = payload();
        fake_employee["employeeCode"] = json!("FAKE-999");
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/uniforms",
                &admin_token,
                fake_employee
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );

        let route = format!("/api/v1/hr/uniforms/{key}/handover");
        assert_eq!(
            call(&app, Method::PATCH, &route, &employee_token, json!({}))
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
        let handed_over = call(&app, Method::PATCH, &route, &admin_token, json!({})).await;
        assert_eq!(handed_over.status(), StatusCode::OK);
        let handed_over = json_body(handed_over).await;
        assert_eq!(handed_over["uniform"]["status"], DELIVERED);
        assert_eq!(handed_over["uniform"]["handedOverBy"], admin.id);
        assert!(handed_over["uniform"]["handedOverAt"].as_str().is_some());
        assert!(handed_over["uniform"]["deliveryDate"].as_str().is_some());
        assert!(handed_over["uniform"].get("receiverSign").is_none());
        assert_eq!(
            call(&app, Method::PATCH, &route, &admin_token, json!({}))
                .await
                .status(),
            StatusCode::CONFLICT
        );
        let listed = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/uniforms",
                &admin_token,
                json!({}),
            )
            .await,
        )
        .await;
        assert_eq!(listed["data"][0]["status"], DELIVERED);
    }
}
