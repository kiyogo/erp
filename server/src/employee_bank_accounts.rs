use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use rusqlite::{OptionalExtension, Transaction, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, User, authenticated_user, crm, require_admin};

const PENDING: &str = "Chờ duyệt";
const APPROVED: &str = "Đã duyệt";
const REJECTED: &str = "Từ chối";
const RETIRED: &str = "Đã ngừng sử dụng";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct EmployeeBankAccount {
    pub id: String,
    pub employee_id: String,
    pub employee_code: String,
    pub employee_name: String,
    pub bank_name: String,
    pub account_number: String,
    pub account_holder: String,
    pub branch: String,
    pub status: String,
    pub is_primary: bool,
    pub note: String,
    pub created_at: String,
    pub updated_at: String,
    pub approved_by: String,
    pub approved_at: String,
    pub rejection_reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateEmployeeBankAccountInput {
    bank_name: String,
    account_number: String,
    account_holder: String,
    #[serde(default)]
    branch: String,
    #[serde(default)]
    is_primary: bool,
    #[serde(default)]
    note: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateHrBankAccountInput {
    employee_code: String,
    #[serde(flatten)]
    account: CreateEmployeeBankAccountInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RejectEmployeeBankAccountInput {
    reason: String,
}

pub(super) async fn list_my_accounts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let user = authenticated_user(&state, &headers).await?;
    if user.role == "ADMIN" {
        return Err(ApiError::forbidden(
            "Dùng API HR để xem tài khoản ngân hàng.",
        ));
    }
    let db = state.db.lock().await;
    let employee_code = db
        .query_row(
            "SELECT employee_code FROM employee_profiles WHERE user_id = ?1",
            params![user.id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::forbidden("Tài khoản chưa liên kết hồ sơ HR."))?;
    let records = load_accounts(
        &db,
        "WHERE a.employee_user_id = ?1",
        params![user.id],
        state.crm_crypto.as_ref(),
    )?;
    Ok(Json(
        json!({ "data": records, "employeeCode": employee_code }),
    ))
}

pub(super) async fn create_my_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateEmployeeBankAccountInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = authenticated_user(&state, &headers).await?;
    if actor.role == "ADMIN" {
        return Err(ApiError::forbidden(
            "Dùng API HR để tạo tài khoản cho nhân viên.",
        ));
    }
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let employee = transaction
        .query_row(
            "SELECT p.employee_code, u.name, u.is_active, p.employment_status
         FROM employee_profiles p JOIN users u ON u.id=p.user_id WHERE p.user_id=?1",
            params![actor.id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, bool>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::forbidden("Tài khoản chưa liên kết hồ sơ HR."))?;
    ensure_employee_can_submit(employee.2, &employee.3)?;
    let account = create_account(
        &state,
        &transaction,
        &actor,
        &actor.id,
        &employee.0,
        &employee.1,
        input,
    )?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "account": account }))))
}

pub(super) async fn list_all_accounts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let records = load_accounts(&db, "", [], state.crm_crypto.as_ref())?;
    Ok(Json(json!({ "data": records })))
}

pub(super) async fn create_hr_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateHrBankAccountInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let employee_code = required_text(input.employee_code, "Mã nhân viên", 80)?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let employee = find_employee_by_code(&transaction, &employee_code)?;
    let account = create_account(
        &state,
        &transaction,
        &actor,
        &employee.0,
        &employee.1,
        &employee.2,
        input.account,
    )?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "account": account }))))
}

pub(super) async fn approve_account(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    transition_account(&state, &account_id, &actor, APPROVED, "approved", "").await
}

pub(super) async fn reject_account(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
    headers: HeaderMap,
    Json(input): Json<RejectEmployeeBankAccountInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let reason = required_text(input.reason, "Lý do từ chối", 1_000)?;
    transition_account(&state, &account_id, &actor, REJECTED, "rejected", &reason).await
}

pub(super) async fn retire_account(
    State(state): State<AppState>,
    Path(account_id): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    transition_account(&state, &account_id, &actor, RETIRED, "retired", "").await
}

async fn transition_account(
    state: &AppState,
    account_id: &str,
    actor: &User,
    new_status: &str,
    event_type: &str,
    reason: &str,
) -> ApiResult<Json<Value>> {
    let crypto = state.crm_crypto.as_ref().ok_or_else(|| {
        ApiError::service_unavailable("Chưa cấu hình khóa mã hóa dữ liệu tài khoản ngân hàng.")
    })?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let (owner_id, status, is_primary): (String, String, bool) = transaction
        .query_row(
            "SELECT employee_user_id, status, is_primary FROM employee_bank_accounts WHERE id=?1",
            params![account_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy tài khoản ngân hàng."))?;
    if status != PENDING && !(new_status == RETIRED && status != RETIRED) {
        return Err(ApiError::conflict(
            "Tài khoản không còn ở trạng thái cho phép thao tác này.",
        ));
    }
    let timestamp = chrono::Utc::now().to_rfc3339();
    if new_status == APPROVED && is_primary {
        let previous = {
            let mut statement = transaction.prepare(
                "SELECT id FROM employee_bank_accounts WHERE employee_user_id=?1 AND status=?2 AND is_primary=1 AND id!=?3"
            ).map_err(ApiError::internal)?;
            statement
                .query_map(params![owner_id, APPROVED, account_id], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(ApiError::internal)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(ApiError::internal)?
        };
        for previous_id in previous {
            transaction
                .execute(
                    "UPDATE employee_bank_accounts SET is_primary=0, updated_at=?2 WHERE id=?1",
                    params![previous_id, timestamp],
                )
                .map_err(ApiError::internal)?;
            append_event(
                &transaction,
                &previous_id,
                "primary_replaced",
                &actor.id,
                &timestamp,
                "",
            )?;
        }
    }
    let encrypted_reason = if reason.trim().is_empty() {
        String::new()
    } else {
        crm::encrypt_hr_bank_field(reason.trim(), crypto)?
    };
    transaction
        .execute(
            "UPDATE employee_bank_accounts SET status=?2, rejection_reason_enc=?3,
            is_primary=CASE WHEN ?2=?4 OR ?2=?5 THEN is_primary ELSE 0 END, updated_at=?6 WHERE id=?1",
            params![account_id, new_status, encrypted_reason, RETIRED, APPROVED, timestamp],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                ApiError::conflict("Nhân viên đã có tài khoản chính khác.")
            } else {
                ApiError::internal(error)
            }
        })?;
    append_event(
        &transaction,
        account_id,
        event_type,
        &actor.id,
        &timestamp,
        &encrypted_reason,
    )?;
    let account = load_accounts(
        &transaction,
        "WHERE a.id=?1",
        params![account_id],
        Some(crypto),
    )?
    .into_iter()
    .next()
    .ok_or_else(|| ApiError::not_found("Không tìm thấy tài khoản ngân hàng."))?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "account": account })))
}

fn create_account(
    state: &AppState,
    transaction: &Transaction<'_>,
    actor: &User,
    employee_id: &str,
    employee_code: &str,
    employee_name: &str,
    input: CreateEmployeeBankAccountInput,
) -> ApiResult<EmployeeBankAccount> {
    let bank_name = required_text(input.bank_name, "Tên ngân hàng", 160)?;
    let account_number = validate_account_number(input.account_number)?;
    let account_holder = required_text(input.account_holder, "Tên chủ tài khoản", 160)?;
    let branch = optional_text(input.branch, "Chi nhánh", 160)?;
    let note = optional_text(input.note, "Ghi chú", 1_000)?;
    let crypto = state.crm_crypto.as_ref().ok_or_else(|| {
        ApiError::service_unavailable("Chưa cấu hình khóa mã hóa dữ liệu tài khoản ngân hàng.")
    })?;
    let bank_name_enc = crm::encrypt_hr_bank_field(&bank_name, crypto)?;
    let account_number_enc = crm::encrypt_hr_bank_field(&account_number, crypto)?;
    let account_holder_enc = crm::encrypt_hr_bank_field(&account_holder, crypto)?;
    let branch_enc = crm::encrypt_hr_bank_field(&branch, crypto)?;
    let note_enc = crm::encrypt_hr_bank_field(&note, crypto)?;
    let id = Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().to_rfc3339();
    transaction.execute(
        "INSERT INTO employee_bank_accounts
         (id, employee_user_id, employee_code, bank_name_enc, account_number_enc, account_number_last4,
          account_holder_enc, branch_enc, note_enc, status, is_primary, rejection_reason_enc, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,'',?12,?12)",
        params![id, employee_id, employee_code, bank_name_enc, account_number_enc,
            account_number.chars().filter(|character| character.is_ascii_alphanumeric()).rev().take(4).collect::<String>().chars().rev().collect::<String>(),
            account_holder_enc, branch_enc, note_enc, PENDING, input.is_primary, timestamp],
    ).map_err(ApiError::internal)?;
    append_event(transaction, &id, "created", &actor.id, &timestamp, "")?;
    Ok(EmployeeBankAccount {
        id,
        employee_id: employee_id.to_owned(),
        employee_code: employee_code.to_owned(),
        employee_name: employee_name.to_owned(),
        bank_name,
        account_number,
        account_holder,
        branch,
        status: PENDING.to_owned(),
        is_primary: input.is_primary,
        note,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        approved_by: String::new(),
        approved_at: String::new(),
        rejection_reason: String::new(),
    })
}

fn find_employee_by_code(
    transaction: &Transaction<'_>,
    employee_code: &str,
) -> ApiResult<(String, String, String)> {
    let employee = transaction
        .query_row(
            "SELECT p.user_id, p.employee_code, u.name, u.is_active, p.employment_status
            FROM employee_profiles p JOIN users u ON u.id=p.user_id
            WHERE lower(p.employee_code)=lower(?1) AND u.role!='ADMIN'",
            params![employee_code],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, bool>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::unprocessable("Mã nhân viên không khớp hồ sơ HR."))?;
    ensure_employee_can_submit(employee.3, &employee.4)?;
    Ok((employee.0, employee.1, employee.2))
}

fn ensure_employee_can_submit(is_active: bool, employment_status: &str) -> ApiResult<()> {
    if !is_active || ["Đã nghỉ việc", "Chờ kích hoạt"].contains(&employment_status) {
        return Err(ApiError::forbidden(
            "Chỉ nhân viên đang hoạt động mới có thể gửi tài khoản ngân hàng.",
        ));
    }
    Ok(())
}

fn load_accounts<P: rusqlite::Params>(
    db: &rusqlite::Connection,
    where_clause: &str,
    parameters: P,
    crypto: Option<&crm::CrmCrypto>,
) -> ApiResult<Vec<EmployeeBankAccount>> {
    let query = format!(
        "SELECT a.id, a.employee_user_id, a.employee_code, u.name, a.bank_name_enc,
                a.account_number_enc, a.account_holder_enc, a.branch_enc, a.status,
                a.is_primary, a.note_enc, a.created_at, a.updated_at,
                COALESCE((SELECT actor.name FROM employee_bank_account_events e JOIN users actor ON actor.id=e.actor_user_id WHERE e.account_id=a.id AND e.event_type='approved' ORDER BY e.sequence_no DESC LIMIT 1), ''),
                COALESCE((SELECT e.created_at FROM employee_bank_account_events e WHERE e.account_id=a.id AND e.event_type='approved' ORDER BY e.sequence_no DESC LIMIT 1), ''),
                a.rejection_reason_enc
         FROM employee_bank_accounts a JOIN users u ON u.id=a.employee_user_id {where_clause}
         ORDER BY a.created_at DESC, a.id DESC"
    );
    let mut statement = db.prepare(&query).map_err(ApiError::internal)?;
    let rows = statement
        .query_map(parameters, |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, bool>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, String>(12)?,
                row.get::<_, String>(13)?,
                row.get::<_, String>(14)?,
                row.get::<_, String>(15)?,
            ))
        })
        .map_err(ApiError::internal)?;
    let rows = rows
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    rows.into_iter()
        .map(|row| {
            Ok(EmployeeBankAccount {
                id: row.0,
                employee_id: row.1,
                employee_code: row.2,
                employee_name: row.3,
                bank_name: crm::decrypt_hr_bank_field(&row.4, crypto)?,
                account_number: crm::decrypt_hr_bank_field(&row.5, crypto)?,
                account_holder: crm::decrypt_hr_bank_field(&row.6, crypto)?,
                branch: crm::decrypt_hr_bank_field(&row.7, crypto)?,
                status: row.8,
                is_primary: row.9,
                note: crm::decrypt_hr_bank_field(&row.10, crypto)?,
                created_at: row.11,
                updated_at: row.12,
                approved_by: row.13,
                approved_at: row.14,
                rejection_reason: crm::decrypt_hr_bank_field(&row.15, crypto)?,
            })
        })
        .collect()
}

fn append_event(
    transaction: &Transaction<'_>,
    account_id: &str,
    event_type: &str,
    actor_user_id: &str,
    created_at: &str,
    detail_enc: &str,
) -> ApiResult<()> {
    let next_sequence: i64 = transaction.query_row(
        "SELECT COALESCE(MAX(sequence_no),0)+1 FROM employee_bank_account_events WHERE account_id=?1",
        params![account_id], |row| row.get(0),
    ).map_err(ApiError::internal)?;
    transaction.execute(
        "INSERT INTO employee_bank_account_events(account_id,sequence_no,event_type,actor_user_id,detail_enc,created_at)
         VALUES (?1,?2,?3,?4,?5,?6)",
        params![account_id, next_sequence, event_type, actor_user_id, detail_enc, created_at],
    ).map_err(ApiError::internal)?;
    Ok(())
}

fn validate_account_number(value: String) -> ApiResult<String> {
    let value = required_text(value, "Số tài khoản", 64)?;
    let significant_characters = value
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .count();
    if significant_characters < 4
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b' ' | b'-'))
    {
        return Err(ApiError::unprocessable(
            "Số tài khoản cần ít nhất 4 ký tự chữ/số.",
        ));
    }
    Ok(value)
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
    use axum::{
        body::{Body, to_bytes},
        http::{Method, Request},
    };
    use rusqlite::{Connection, params};
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn fixture(with_key: bool) -> (axum::Router, AppState, User, User, User) {
        let db = Connection::open_in_memory().expect("bank account in-memory DB");
        crate::init_database(&db).expect("initialize bank account DB");
        let now = chrono::Utc::now().to_rfc3339();
        for (id, role, name) in [
            ("bank-admin", "ADMIN", "HR Admin"),
            ("bank-owner", "USER", "Nguyễn An"),
            ("bank-other", "USER", "Trần Bình"),
            ("bank-inactive", "USER", "Inactive"),
        ] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), name, role, now],
            ).expect("insert bank account test user");
        }
        db.execute(
            "INSERT INTO employee_profiles (user_id,employee_code,department,position,employment_status,created_at,updated_at)
             VALUES ('bank-owner','EMP-BANK-1','Kỹ thuật','Kỹ sư','Chính thức',?1,?1),
                    ('bank-other','EMP-BANK-2','Kỹ thuật','Kỹ sư','Chính thức',?1,?1),
                    ('bank-inactive','EMP-BANK-X','Kỹ thuật','Kỹ sư','Chính thức',?1,?1)",
            params![now],
        ).expect("insert bank account HR profiles");
        db.execute("UPDATE users SET is_active=0 WHERE id='bank-inactive'", [])
            .expect("deactivate bank account fixture");
        let make_user = |id: &str, role: &str, name: &str, is_active: bool| User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: name.to_owned(),
            role: role.to_owned(),
            is_active,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = make_user("bank-admin", "ADMIN", "HR Admin", true);
        let employee = make_user("bank-owner", "USER", "Nguyễn An", true);
        let other = make_user("bank-other", "USER", "Trần Bình", true);
        let secret = b"employee-bank-test-secret-long-enough";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: with_key.then(|| crm::CrmCrypto::for_test([0x52; 32], "bank-test-v1")),
        };
        (
            crate::router(state.clone(), CorsLayer::new()),
            state,
            admin,
            employee,
            other,
        )
    }

    fn bearer(state: &AppState, user: &User) -> String {
        format!(
            "Bearer {}",
            crate::issue_token(state, user).expect("bank account JWT")
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
                    .expect("bank account request"),
            )
            .await
            .expect("bank account response")
    }

    async fn json_body(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 64 * 1024)
                .await
                .expect("bank account body"),
        )
        .expect("bank account JSON")
    }

    fn payload(account_number: &str, is_primary: bool) -> Value {
        json!({
            "bankName":"Vietcombank", "accountNumber":account_number,
            "accountHolder":"NGUYEN AN", "branch":"Ho Chi Minh",
            "isPrimary":is_primary, "note":"salary account"
        })
    }

    #[tokio::test]
    async fn bank_accounts_are_encrypted_owner_scoped_and_generic_bypass_is_blocked() {
        let (app, state, admin, employee, other) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let owner_token = bearer(&state, &employee);
        let other_token = bearer(&state, &other);
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/bank-accounts",
                &owner_token,
                json!({})
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        let mut input = payload("001234567890", true);
        input["employeeCode"] = json!("EMP-BANK-2");
        input["employeeName"] = json!("Forged employee");
        input["status"] = json!(APPROVED);
        let response = call(
            &app,
            Method::POST,
            "/api/v1/employee/bank-accounts",
            &owner_token,
            input,
        )
        .await;
        assert_eq!(response.status(), StatusCode::CREATED);
        let created = json_body(response).await;
        let account = &created["account"];
        assert_eq!(account["employeeId"], "bank-owner");
        assert_eq!(account["employeeCode"], "EMP-BANK-1");
        assert_eq!(account["employeeName"], "Nguyễn An");
        assert_eq!(account["status"], PENDING);
        assert_eq!(account["accountNumber"], "001234567890");
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/employee/bank-accounts",
                &other_token,
                json!({})
            )
            .await
            .status(),
            StatusCode::OK
        );
        let other_list = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/employee/bank-accounts",
                &other_token,
                json!({}),
            )
            .await,
        )
        .await;
        assert!(other_list["data"].as_array().unwrap().is_empty());
        let admin_list = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/bank-accounts",
                &admin_token,
                json!({}),
            )
            .await,
        )
        .await;
        assert_eq!(admin_list["data"][0]["accountNumber"], "001234567890");

        let db = state.db.lock().await;
        let stored: (String, String, String) = db.query_row(
            "SELECT bank_name_enc,account_number_enc,account_holder_enc FROM employee_bank_accounts WHERE id=?1",
            params![account["id"].as_str().unwrap()],
            |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?)),
        ).unwrap();
        assert!(
            stored
                .0
                .starts_with("ENC:{\"v\":1,\"kid\":\"hr-bank-bank-test-v1\"")
        );
        assert!(!stored.1.contains("001234567890"));
        assert!(!stored.2.contains("NGUYEN AN"));
        drop(db);
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/collections/employee_bank_accounts",
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
                Method::PUT,
                "/api/v1/collections/employee_bank_accounts",
                &admin_token,
                json!({"records":[]})
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );
    }

    #[tokio::test]
    async fn hr_bank_account_create_links_only_active_directory_profiles() {
        let (app, state, admin, employee, _) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let user_token = bearer(&state, &employee);
        let mut admin_payload = payload("334455667788", true);
        admin_payload["employeeCode"] = json!("EMP-BANK-2");
        admin_payload["status"] = json!(APPROVED);
        admin_payload["employeeName"] = json!("Forged name");
        let created = call(
            &app,
            Method::POST,
            "/api/v1/hr/bank-accounts",
            &admin_token,
            admin_payload,
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let account = json_body(created).await["account"].clone();
        assert_eq!(account["employeeId"], "bank-other");
        assert_eq!(account["employeeCode"], "EMP-BANK-2");
        assert_eq!(account["employeeName"], "Trần Bình");
        assert_eq!(account["status"], PENDING);
        let mut unauthorized = payload("111122223333", true);
        unauthorized["employeeCode"] = json!("EMP-BANK-2");
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/bank-accounts",
                &user_token,
                unauthorized
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );

        let mut unknown = payload("123456789012", true);
        unknown["employeeCode"] = json!("EMP-MISSING");
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/bank-accounts",
                &admin_token,
                unknown
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let mut inactive = payload("123456789012", true);
        inactive["employeeCode"] = json!("EMP-BANK-X");
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/bank-accounts",
                &admin_token,
                inactive
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
    }

    #[tokio::test]
    async fn bank_account_approval_is_one_time_primary_is_unique_and_retirement_is_audited() {
        let (app, state, admin, employee, _) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let owner_token = bearer(&state, &employee);
        let first = json_body(
            call(
                &app,
                Method::POST,
                "/api/v1/employee/bank-accounts",
                &owner_token,
                payload("111122223333", true),
            )
            .await,
        )
        .await;
        let first_id = first["account"]["id"].as_str().unwrap().to_owned();
        let approve_uri = format!("/api/v1/hr/bank-accounts/{first_id}/approve");
        let approved =
            json_body(call(&app, Method::PATCH, &approve_uri, &admin_token, json!({})).await).await;
        assert_eq!(approved["account"]["status"], APPROVED);
        assert_eq!(approved["account"]["approvedBy"], admin.name);
        assert!(
            approved["account"]["approvedAt"]
                .as_str()
                .is_some_and(|value| !value.is_empty())
        );
        assert_eq!(
            call(&app, Method::PATCH, &approve_uri, &admin_token, json!({}))
                .await
                .status(),
            StatusCode::CONFLICT
        );

        let second = json_body(
            call(
                &app,
                Method::POST,
                "/api/v1/employee/bank-accounts",
                &owner_token,
                payload("444455556666", true),
            )
            .await,
        )
        .await;
        let second_id = second["account"]["id"].as_str().unwrap().to_owned();
        let second_uri = format!("/api/v1/hr/bank-accounts/{second_id}/approve");
        let approved_second =
            json_body(call(&app, Method::PATCH, &second_uri, &admin_token, json!({})).await).await;
        assert_eq!(approved_second["account"]["isPrimary"], true);
        let list = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/bank-accounts",
                &admin_token,
                json!({}),
            )
            .await,
        )
        .await;
        let first_row = list["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["id"] == first_id)
            .unwrap();
        assert_eq!(first_row["isPrimary"], false);
        let db = state.db.lock().await;
        let primary_count: i64 = db.query_row("SELECT COUNT(*) FROM employee_bank_accounts WHERE employee_user_id='bank-owner' AND status=?1 AND is_primary=1", params![APPROVED], |row| row.get(0)).unwrap();
        assert_eq!(primary_count, 1);
        let events = db.prepare("SELECT event_type,actor_user_id FROM employee_bank_account_events WHERE account_id=?1 ORDER BY sequence_no").unwrap()
            .query_map(params![first_id], |row| Ok((row.get::<_,String>(0)?,row.get::<_,String>(1)?))).unwrap()
            .collect::<rusqlite::Result<Vec<_>>>().unwrap();
        assert_eq!(
            events,
            vec![
                ("created".to_owned(), "bank-owner".to_owned()),
                ("approved".to_owned(), "bank-admin".to_owned()),
                ("primary_replaced".to_owned(), "bank-admin".to_owned())
            ]
        );
        assert!(
            db.execute(
                "DELETE FROM employee_bank_accounts WHERE id=?1",
                params![first_id]
            )
            .is_err()
        );
        assert!(
            db.execute(
                "UPDATE employee_bank_accounts SET account_number_enc='plaintext' WHERE id=?1",
                params![first_id]
            )
            .is_err()
        );
        drop(db);
        let retire_uri = format!("/api/v1/hr/bank-accounts/{first_id}/retire");
        assert_eq!(
            call(&app, Method::PATCH, &retire_uri, &admin_token, json!({}))
                .await
                .status(),
            StatusCode::OK
        );
        let db = state.db.lock().await;
        assert!(
            db.execute(
                "DELETE FROM employee_bank_account_events WHERE account_id=?1",
                params![first_id]
            )
            .is_err()
        );
    }

    #[tokio::test]
    async fn bank_account_rejection_and_missing_key_fail_closed() {
        let (app, state, admin, employee, _) = fixture(true);
        let admin_token = bearer(&state, &admin);
        let owner_token = bearer(&state, &employee);
        let created = json_body(
            call(
                &app,
                Method::POST,
                "/api/v1/employee/bank-accounts",
                &owner_token,
                payload("987654321", false),
            )
            .await,
        )
        .await;
        let id = created["account"]["id"].as_str().unwrap();
        let reject_uri = format!("/api/v1/hr/bank-accounts/{id}/reject");
        let rejected = json_body(
            call(
                &app,
                Method::PATCH,
                &reject_uri,
                &admin_token,
                json!({"reason":"Sai tên chủ tài khoản"}),
            )
            .await,
        )
        .await;
        assert_eq!(rejected["account"]["status"], REJECTED);
        assert_eq!(
            rejected["account"]["rejectionReason"],
            "Sai tên chủ tài khoản"
        );
        assert_eq!(
            call(
                &app,
                Method::PATCH,
                &reject_uri,
                &admin_token,
                json!({"reason":"thử lại"})
            )
            .await
            .status(),
            StatusCode::CONFLICT
        );

        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/employee/bank-accounts",
                &owner_token,
                payload("----", true),
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );

        let (no_key_app, no_key_state, no_key_admin, no_key_employee, _) = fixture(false);
        let no_key_token = bearer(&no_key_state, &no_key_employee);
        let no_key_admin_token = bearer(&no_key_state, &no_key_admin);
        assert_eq!(
            call(
                &no_key_app,
                Method::POST,
                "/api/v1/employee/bank-accounts",
                &no_key_token,
                payload("123456789", true)
            )
            .await
            .status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        let db = no_key_state.db.lock().await;
        let count: i64 = db
            .query_row("SELECT COUNT(*) FROM employee_bank_accounts", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 0);
        drop(db);

        let crypto = crm::CrmCrypto::for_test([0x52; 32], "bank-test-v1");
        let account_id = "bank-legacy-encrypted-fixture";
        let db = no_key_state.db.lock().await;
        db.execute(
            "INSERT INTO employee_bank_accounts
             (id,employee_user_id,employee_code,bank_name_enc,account_number_enc,account_number_last4,
              account_holder_enc,status,is_primary,created_at,updated_at)
             VALUES (?1,'bank-owner','EMP-BANK-1',?2,?3,'6789',?4,?5,1,'2026-01-01','2026-01-01')",
            params![
                account_id,
                crm::encrypt_hr_bank_field("VCB", &crypto).unwrap(),
                crm::encrypt_hr_bank_field("123456789", &crypto).unwrap(),
                crm::encrypt_hr_bank_field("NGUYEN AN", &crypto).unwrap(),
                PENDING,
            ],
        )
        .unwrap();
        db.execute(
            "INSERT INTO employee_bank_account_events(account_id,sequence_no,event_type,actor_user_id,created_at)
             VALUES (?1,1,'created','bank-admin','2026-01-01')",
            params![account_id],
        )
        .unwrap();
        drop(db);
        let approve_uri = format!("/api/v1/hr/bank-accounts/{account_id}/approve");
        assert_eq!(
            call(
                &no_key_app,
                Method::PATCH,
                &approve_uri,
                &no_key_admin_token,
                json!({})
            )
            .await
            .status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        let db = no_key_state.db.lock().await;
        let status: String = db
            .query_row(
                "SELECT status FROM employee_bank_accounts WHERE id=?1",
                params![account_id],
                |row| row.get(0),
            )
            .unwrap();
        let event_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM employee_bank_account_events WHERE account_id=?1",
                params![account_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status, PENDING);
        assert_eq!(event_count, 1);
    }
}
