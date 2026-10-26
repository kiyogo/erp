use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use chrono::{NaiveDate, Utc};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const MAX_EXAM_FEE: i64 = 1_000_000_000_000;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct HrCertificate {
    key: String,
    cert_code: String,
    cert_name: String,
    employee_id: String,
    employee_name: String,
    emp_code: String,
    department: String,
    issuing_org: String,
    issue_date: String,
    expire_date: String,
    credential_id: String,
    verification_url: String,
    company_sponsored: bool,
    exam_fee: i64,
    status: String,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateHrCertificateInput {
    #[serde(default)]
    cert_code: String,
    cert_name: String,
    employee_code: String,
    issuing_org: String,
    issue_date: String,
    expire_date: String,
    credential_id: String,
    #[serde(default)]
    verification_url: String,
    #[serde(default)]
    company_sponsored: bool,
    #[serde(default)]
    exam_fee: i64,
}

pub(super) async fn list_certificates(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT record_key, record_json FROM collection_records
             WHERE scope = 'hr_certificates' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?;
    let today = Utc::now().date_naive();
    let certificates = rows
        .map(|row| {
            let (record_key, serialized) = row.map_err(ApiError::internal)?;
            let mut certificate: HrCertificate =
                serde_json::from_str(&serialized).map_err(ApiError::internal)?;
            if certificate.key.trim().is_empty() {
                certificate.key = record_key;
            }
            certificate.status = status_at(&certificate.expire_date, today);
            Ok(certificate)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": certificates })))
}

pub(super) async fn create_certificate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateHrCertificateInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let mut certificate = validate_input(input)?;
    if certificate.cert_code.is_empty() {
        certificate.cert_code = generated_code();
    }
    certificate.key = Uuid::new_v4().to_string();

    let timestamp = Utc::now().to_rfc3339();
    let today = Utc::now().date_naive();
    certificate.status = status_at(&certificate.expire_date, today);
    certificate
        .extra
        .insert("createdBy".to_owned(), Value::String(actor.id));
    certificate
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
            params![&certificate.emp_code],
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
            "Không thể khai báo chứng chỉ cho nhân sự đã nghỉ việc.",
        ));
    }
    certificate.employee_id = employee.0;
    certificate.emp_code = employee.1;
    certificate.employee_name = employee.2;
    certificate.department = employee.3;

    let existing = {
        let mut statement = transaction
            .prepare("SELECT record_json FROM collection_records WHERE scope = 'hr_certificates'")
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(ApiError::internal)?
    };
    for serialized in existing {
        let current: HrCertificate =
            serde_json::from_str(&serialized).map_err(ApiError::internal)?;
        if current
            .cert_code
            .eq_ignore_ascii_case(&certificate.cert_code)
        {
            return Err(ApiError::conflict("Mã chứng chỉ đã được sử dụng."));
        }
    }

    let serialized = serde_json::to_string(&certificate).map_err(ApiError::internal)?;
    if serialized.len() > 64 * 1024 {
        return Err(ApiError::bad_request(
            "Hồ sơ chứng chỉ vượt quá giới hạn 64 KiB.",
        ));
    }
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at)
             VALUES ('hr_certificates', ?1, ?2, ?3, ?3)",
            params![certificate.key, serialized, timestamp],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                ApiError::conflict("Mã chứng chỉ đã được sử dụng.")
            } else {
                ApiError::internal(error)
            }
        })?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "certificate": certificate })),
    ))
}

fn validate_input(input: CreateHrCertificateInput) -> ApiResult<HrCertificate> {
    let cert_code = optional_text(input.cert_code, "Mã chứng chỉ", 80)?;
    let cert_name = required_text(input.cert_name, "Tên chứng chỉ", 220)?;
    let emp_code = required_text(input.employee_code, "Mã nhân sự", 64)?;
    let issuing_org = required_text(input.issuing_org, "Tổ chức cấp", 180)?;
    let issue_date = required_date(input.issue_date, "Ngày cấp")?;
    let expire_date = required_date(input.expire_date, "Ngày hết hạn")?;
    let issue = NaiveDate::parse_from_str(&issue_date, "%Y-%m-%d")
        .map_err(|_| ApiError::internal("validated issue date could not be parsed"))?;
    let expire = NaiveDate::parse_from_str(&expire_date, "%Y-%m-%d")
        .map_err(|_| ApiError::internal("validated expiration date could not be parsed"))?;
    if expire < issue {
        return Err(ApiError::unprocessable(
            "Ngày hết hạn không được trước ngày cấp.",
        ));
    }
    let credential_id = required_text(input.credential_id, "Credential ID", 180)?;
    let verification_url = optional_https_url(input.verification_url)?;
    if !(0..=MAX_EXAM_FEE).contains(&input.exam_fee) {
        return Err(ApiError::unprocessable("Lệ phí thi không hợp lệ."));
    }
    if !input.company_sponsored && input.exam_fee != 0 {
        return Err(ApiError::unprocessable(
            "Chỉ nhập lệ phí khi công ty tài trợ chứng chỉ.",
        ));
    }
    Ok(HrCertificate {
        cert_code,
        cert_name,
        emp_code,
        issuing_org,
        issue_date,
        expire_date,
        credential_id,
        verification_url,
        company_sponsored: input.company_sponsored,
        exam_fee: input.exam_fee,
        ..HrCertificate::default()
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

fn optional_https_url(value: String) -> ApiResult<String> {
    let value = optional_text(value, "Liên kết xác thực", 2_048)?;
    if value.is_empty() {
        return Ok(value);
    }
    let Some(authority) = value.strip_prefix("https://") else {
        return Err(ApiError::unprocessable(
            "Liên kết xác thực phải dùng HTTPS.",
        ));
    };
    let authority = authority.split(['/', '?', '#']).next().unwrap_or_default();
    if authority.is_empty() || authority.contains('@') || authority.chars().any(char::is_whitespace)
    {
        return Err(ApiError::unprocessable("Liên kết xác thực không hợp lệ."));
    }
    Ok(value)
}

fn status_at(expire_date: &str, today: NaiveDate) -> String {
    let Ok(expiration) = NaiveDate::parse_from_str(expire_date, "%Y-%m-%d") else {
        return "Không xác định".to_owned();
    };
    let remaining_days = (expiration - today).num_days();
    if remaining_days < 0 {
        "Hết hiệu lực".to_owned()
    } else if remaining_days <= 90 {
        "Sắp hết hạn".to_owned()
    } else {
        "Còn hiệu lực".to_owned()
    }
}

fn generated_code() -> String {
    let date = Utc::now().format("%Y%m%d");
    let suffix = Uuid::new_v4().simple().to_string()[..8].to_ascii_uppercase();
    format!("CC-{date}-{suffix}")
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
        let db = Connection::open_in_memory().expect("certificates in-memory database");
        crate::init_database(&db).expect("initialize certificates database");
        let now = Utc::now().to_rfc3339();
        for (id, role) in [("certificate-admin", "ADMIN"), ("certificate-user", "USER")] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            )
            .expect("insert certificate test account");
        }
        db.execute(
            "INSERT INTO employee_profiles (user_id, employee_code, department, employment_status, created_at, updated_at)
             VALUES ('certificate-user', 'EMP-001', 'Kỹ thuật', 'Chính thức', ?1, ?1)",
            params![now],
        )
        .expect("insert certificate employee profile");
        let make_user = |id: &str, role: &str| User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: id.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = make_user("certificate-admin", "ADMIN");
        let employee = make_user("certificate-user", "USER");
        let secret = b"certificate-test-secret-long-enough-for-a-token";
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
            crate::issue_token(state, user).expect("certificate test JWT")
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
                    .expect("certificate request"),
            )
            .await
            .expect("certificate response")
    }

    async fn json_body(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 64 * 1024)
                .await
                .expect("response body"),
        )
        .expect("JSON body")
    }

    fn payload(code: &str) -> Value {
        json!({
            "certCode":code,"certName":"AWS Certified Solutions Architect",
            "employeeCode":"EMP-001","issuingOrg":"Amazon Web Services",
            "issueDate":"2025-01-01","expireDate":"2099-01-01",
            "credentialId":"AWS-12345","verificationUrl":"https://example.com/verify/12345",
            "companySponsored":true,"examFee":8000000
        })
    }

    #[tokio::test]
    async fn certificates_are_admin_only_linked_persistent_and_not_generic_writable() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        for (method, uri, body) in [
            (Method::GET, "/api/v1/hr/certificates", json!({})),
            (
                Method::POST,
                "/api/v1/hr/certificates",
                payload("CERT-USER"),
            ),
        ] {
            assert_eq!(
                call(&app, method, uri, &employee_token, body)
                    .await
                    .status(),
                StatusCode::FORBIDDEN
            );
        }
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/collections/hr_certificates",
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
                "/api/v1/collections/hr_certificates",
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
            "/api/v1/hr/certificates",
            &admin_token,
            payload("CERT-2026-01"),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let created = json_body(created).await;
        let certificate = &created["certificate"];
        assert_eq!(certificate["certCode"], "CERT-2026-01");
        assert_eq!(certificate["employeeName"], "certificate-user");
        assert_eq!(certificate["empCode"], "EMP-001");
        assert_eq!(certificate["department"], "Kỹ thuật");
        assert_eq!(certificate["employeeId"], "certificate-user");
        assert_eq!(certificate["status"], "Còn hiệu lực");
        assert_eq!(certificate["createdBy"], admin.id);
        let key = certificate["key"].as_str().expect("certificate key");

        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/certificates",
                &admin_token,
                payload("cert-2026-01")
            )
            .await
            .status(),
            StatusCode::CONFLICT
        );
        let generated = call(
            &app,
            Method::POST,
            "/api/v1/hr/certificates",
            &admin_token,
            payload(""),
        )
        .await;
        assert_eq!(generated.status(), StatusCode::CREATED);
        let generated = json_body(generated).await;
        assert!(
            generated["certificate"]["certCode"]
                .as_str()
                .is_some_and(|code| code.starts_with("CC-"))
        );

        let mut invalid = payload("CERT-BAD-DATE");
        invalid["expireDate"] = json!("2024-12-31");
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/certificates",
                &admin_token,
                invalid
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let mut unknown_employee = payload("CERT-BAD-EMPLOYEE");
        unknown_employee["employeeCode"] = json!("FAKE-999");
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/certificates",
                &admin_token,
                unknown_employee
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let mut insecure_url = payload("CERT-BAD-URL");
        insecure_url["verificationUrl"] = json!("javascript:alert(1)");
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/certificates",
                &admin_token,
                insecure_url
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );

        let listed = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/certificates",
                &admin_token,
                json!({}),
            )
            .await,
        )
        .await;
        assert_eq!(listed["data"].as_array().unwrap().len(), 2);
        assert!(
            listed["data"]
                .as_array()
                .unwrap()
                .iter()
                .any(|item| item["key"] == key)
        );
    }

    #[test]
    fn certificate_status_is_derived_from_expiration_date() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 8).expect("test date");
        assert_eq!(status_at("2026-10-07", today), "Hết hiệu lực");
        assert_eq!(status_at("2026-10-08", today), "Sắp hết hạn");
        assert_eq!(status_at("2027-01-06", today), "Sắp hết hạn");
        assert_eq!(status_at("2027-01-07", today), "Còn hiệu lực");
        assert_eq!(status_at("not-a-date", today), "Không xác định");
    }
}
