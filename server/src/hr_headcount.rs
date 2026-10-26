use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use rusqlite::{TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct HeadcountQuota {
    key: String,
    department: String,
    position: String,
    position_code: String,
    quota: i64,
    actual: i64,
    vacancies: i64,
    salary_budget: i64,
    level_distribution: String,
    status: String,
    created_by: String,
    created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateHeadcountQuotaInput {
    department: String,
    position: String,
    position_code: String,
    quota: i64,
    salary_budget: i64,
    #[serde(default)]
    level_distribution: String,
}

pub(super) async fn list_quotas(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let active_positions = load_active_hr_positions(&db)?;
    let mut statement = db
        .prepare(
            "SELECT record_key, record_json FROM collection_records
         WHERE scope = 'hr_headcount_quotas' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?;
    let mut quotas = Vec::new();
    for row in rows {
        let (key, data) = row.map_err(ApiError::internal)?;
        let mut quota: HeadcountQuota = serde_json::from_str(&data).map_err(ApiError::internal)?;
        if quota.key.trim().is_empty() {
            quota.key = key;
        }
        derive_headcount(&active_positions, &mut quota);
        quotas.push(quota);
    }
    Ok(Json(json!({ "data": quotas })))
}

pub(super) async fn create_quota(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateHeadcountQuotaInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let mut quota = validate(input)?;
    quota.key = Uuid::new_v4().to_string();
    quota.created_by = actor.id;
    let timestamp = chrono::Utc::now().to_rfc3339();
    quota.created_at = timestamp.clone();

    let mut db = state.db.lock().await;
    let tx = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let existing =
        {
            let mut statement = tx.prepare(
            "SELECT record_json FROM collection_records WHERE scope = 'hr_headcount_quotas'",
        ).map_err(ApiError::internal)?;
            statement
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(ApiError::internal)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(ApiError::internal)?
        };
    for row in existing {
        let current: HeadcountQuota = serde_json::from_str(&row).map_err(ApiError::internal)?;
        if current
            .position_code
            .eq_ignore_ascii_case(&quota.position_code)
        {
            return Err(ApiError::conflict("Mã vị trí định biên đã tồn tại."));
        }
    }
    let active_positions = load_active_hr_positions(&tx)?;
    derive_headcount(&active_positions, &mut quota);
    let data = serde_json::to_string(&quota).map_err(ApiError::internal)?;
    tx.execute(
        "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at)
         VALUES ('hr_headcount_quotas', ?1, ?2, ?3, ?3)",
        params![quota.key, data, timestamp],
    )
    .map_err(ApiError::internal)?;
    tx.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "quota": quota }))))
}

fn validate(input: CreateHeadcountQuotaInput) -> ApiResult<HeadcountQuota> {
    let department = required_text(input.department, "Phòng ban", 120)?;
    let position = required_text(input.position, "Chức danh", 160)?;
    let position_code = required_text(input.position_code, "Mã vị trí", 64)?;
    if !(1..=5_000).contains(&input.quota) {
        return Err(ApiError::unprocessable(
            "Chỉ tiêu định biên phải từ 1 đến 5.000.",
        ));
    }
    if !(0..=1_000_000_000_000_000).contains(&input.salary_budget) {
        return Err(ApiError::unprocessable("Ngân sách kế hoạch không hợp lệ."));
    }
    let level_distribution = optional_text(input.level_distribution, "Cơ cấu cấp bậc", 1_000)?;
    Ok(HeadcountQuota {
        department,
        position,
        position_code,
        quota: input.quota,
        salary_budget: input.salary_budget,
        level_distribution,
        ..HeadcountQuota::default()
    })
}

fn load_active_hr_positions(db: &rusqlite::Connection) -> ApiResult<Vec<(String, String)>> {
    let mut statement = db.prepare(
        "SELECT p.department, p.position FROM employee_profiles p JOIN users u ON u.id = p.user_id
         WHERE u.role != 'ADMIN' AND u.is_active = 1
           AND p.employment_status NOT IN ('Đã nghỉ việc', 'Chờ kích hoạt')",
    ).map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .map_err(ApiError::internal)?;
    rows.map(|row| row.map_err(ApiError::internal)).collect()
}

fn derive_headcount(active_positions: &[(String, String)], quota: &mut HeadcountQuota) {
    let department = quota.department.trim().to_lowercase();
    let position = quota.position.trim().to_lowercase();
    quota.actual = active_positions
        .iter()
        .filter(|(employee_department, employee_position)| {
            employee_department.trim().to_lowercase() == department
                && employee_position.trim().to_lowercase() == position
        })
        .count() as i64;
    quota.vacancies = (quota.quota - quota.actual).max(0);
    quota.status = if quota.actual < quota.quota {
        "Thiếu nhân sự"
    } else if quota.actual == quota.quota {
        "Đủ định biên"
    } else {
        "Vượt định biên"
    }
    .to_owned();
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
        let db = Connection::open_in_memory().unwrap();
        crate::init_database(&db).unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        for (id, role) in [
            ("quota-admin", "ADMIN"),
            ("quota-user", "USER"),
            ("quota-retired", "USER"),
            ("quota-pending", "USER"),
        ] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            ).unwrap();
        }
        db.execute(
            "INSERT INTO employee_profiles (user_id,employee_code,department,position,employment_status,created_at,updated_at)
             VALUES ('quota-user','EMP-Q','Kỹ thuật','Kỹ sư Rust','Chính thức',?1,?1)",
            params![now],
        ).unwrap();
        db.execute(
            "INSERT INTO employee_profiles (user_id,employee_code,department,position,employment_status,created_at,updated_at)
             VALUES ('quota-retired','EMP-RET','Kỹ thuật','Kỹ sư Rust','Đã nghỉ việc',?1,?1),
                    ('quota-pending','EMP-PEND','Kỹ thuật','Kỹ sư Rust','Chờ kích hoạt',?1,?1)",
            params![now],
        ).unwrap();
        let user = |id: &str, role: &str| User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: id.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = user("quota-admin", "ADMIN");
        let employee = user("quota-user", "USER");
        let secret = b"headcount-test-secret-long-enough";
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
    fn token(state: &AppState, user: &User) -> String {
        format!("Bearer {}", crate::issue_token(state, user).unwrap())
    }
    async fn call(
        app: &axum::Router,
        method: Method,
        path: &str,
        bearer: &str,
        body: Value,
    ) -> axum::response::Response {
        app.clone()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(path)
                    .header("authorization", bearer)
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap()
    }
    async fn json_body(response: axum::response::Response) -> Value {
        serde_json::from_slice(&to_bytes(response.into_body(), 64 * 1024).await.unwrap()).unwrap()
    }
    fn input(code: &str) -> Value {
        json!({"department":"Kỹ thuật","position":"Kỹ sư Rust","positionCode":code,
            "quota":3,"salaryBudget":120000000,"levelDistribution":"1 Lead, 2 Senior"})
    }

    #[tokio::test]
    async fn headcount_derives_real_employee_count_and_blocks_generic_access() {
        let (app, state, admin, employee) = fixture();
        let admin_token = token(&state, &admin);
        let user_token = token(&state, &employee);
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/headcount-quotas",
                &user_token,
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
                "/api/v1/collections/hr_headcount_quotas",
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
                "/api/v1/collections/hr_headcount_quotas",
                &admin_token,
                json!({"record": input("BYPASS")})
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );
        let mut submitted = input("POS-RUST-1");
        submitted["department"] = json!("KỸ THUẬT");
        submitted["position"] = json!("KỸ SƯ RUST");
        submitted["actual"] = json!(999);
        submitted["status"] = json!("Đủ định biên");
        submitted["key"] = json!("client-key");
        let response = call(
            &app,
            Method::POST,
            "/api/v1/hr/headcount-quotas",
            &admin_token,
            submitted,
        )
        .await;
        assert_eq!(response.status(), StatusCode::CREATED);
        let created = json_body(response).await;
        assert_ne!(created["quota"]["key"], "client-key");
        assert_eq!(created["quota"]["actual"], 1);
        assert_eq!(created["quota"]["vacancies"], 2);
        assert_eq!(created["quota"]["status"], "Thiếu nhân sự");
        assert_eq!(created["quota"]["createdBy"], admin.id);
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/headcount-quotas",
                &admin_token,
                input("pos-rust-1")
            )
            .await
            .status(),
            StatusCode::CONFLICT
        );
        let list = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/headcount-quotas",
                &admin_token,
                json!({}),
            )
            .await,
        )
        .await;
        assert_eq!(list["data"][0]["actual"], 1);
    }

    #[tokio::test]
    async fn headcount_rejects_invalid_quota_and_budget() {
        let (app, state, admin, _) = fixture();
        let bearer = token(&state, &admin);
        let mut bad = input("POS-BAD");
        bad["quota"] = json!(0);
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/headcount-quotas",
                &bearer,
                bad
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let mut bad = input("POS-BAD");
        bad["salaryBudget"] = json!(-1);
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/headcount-quotas",
                &bearer,
                bad
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
}
