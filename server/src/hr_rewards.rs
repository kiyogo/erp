use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use chrono::NaiveDate;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const PENDING: &str = "Chờ duyệt";
const APPROVED: &str = "Đã ký quyết định";
const AWARDED: &str = "Đã trao giải";
const REWARD_TYPES: [&str; 4] = [
    "Tiền mặt & Cúp pha lê",
    "Chuyến du lịch nghỉ dưỡng 5 sao",
    "Cổ phần thưởng ESOP",
    "Bằng khen Ban Giám Đốc",
];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct HrReward {
    key: String,
    reward_code: String,
    recipient_type: String,
    employee_id: String,
    employee_name: String,
    emp_code: String,
    department: String,
    title: String,
    reward_type: String,
    reward_value: i64,
    decision_no: String,
    date: String,
    achievement_summary: String,
    signer_id: String,
    signer_name: String,
    status: String,
    created_by: String,
    created_at: String,
    approval_recorded_by: String,
    approval_recorded_at: String,
    award_recorded_by: String,
    award_recorded_at: String,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateHrRewardInput {
    reward_code: String,
    decision_no: String,
    date: String,
    recipient_type: String,
    #[serde(default)]
    employee_code: String,
    #[serde(default)]
    team_name: String,
    #[serde(default)]
    department: String,
    title: String,
    reward_type: String,
    reward_value: i64,
    #[serde(default)]
    achievement_summary: String,
}

pub(super) async fn list_rewards(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let event_rows = {
        let mut statement = db
            .prepare(
                "SELECT reward_key, event_type, actor_user_id, created_at
                 FROM hr_reward_events ORDER BY reward_key, sequence_no",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(ApiError::internal)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(ApiError::internal)?
    };
    let mut events = BTreeMap::<String, BTreeMap<String, (String, String)>>::new();
    for (reward_key, event_type, actor_id, timestamp) in event_rows {
        events
            .entry(reward_key)
            .or_default()
            .insert(event_type, (actor_id, timestamp));
    }
    let mut statement = db
        .prepare(
            "SELECT record_key, record_json FROM collection_records
             WHERE scope = 'hr_rewards' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?;
    let rewards = rows
        .map(|row| {
            let (record_key, serialized) = row.map_err(ApiError::internal)?;
            let mut reward: HrReward =
                serde_json::from_str(&serialized).map_err(ApiError::internal)?;
            reward.key = record_key.clone();
            reward.approval_recorded_by.clear();
            reward.approval_recorded_at.clear();
            reward.award_recorded_by.clear();
            reward.award_recorded_at.clear();
            if let Some(record_events) = events.get(&record_key) {
                if let Some((actor_id, timestamp)) = record_events.get("approved") {
                    reward.approval_recorded_by = actor_id.clone();
                    reward.approval_recorded_at = timestamp.clone();
                }
                if let Some((actor_id, timestamp)) = record_events.get("awarded") {
                    reward.award_recorded_by = actor_id.clone();
                    reward.award_recorded_at = timestamp.clone();
                }
            }
            Ok(reward)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": rewards })))
}

pub(super) async fn create_reward(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateHrRewardInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let mut reward = validate_input(input)?;
    let now = chrono::Utc::now();
    let timestamp = now.to_rfc3339();
    reward.key = Uuid::new_v4().to_string();
    reward.status = PENDING.to_owned();
    reward.signer_id = actor.id.clone();
    reward.signer_name = actor.name.clone();
    reward.created_by = actor.id;
    reward.created_at = timestamp.clone();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    if reward.recipient_type == "employee" {
        let employee = transaction
            .query_row(
                "SELECT p.user_id, p.employee_code, u.name, p.department, p.employment_status
                 FROM employee_profiles p JOIN users u ON u.id = p.user_id
                 WHERE lower(p.employee_code) = lower(?1) AND u.role != 'ADMIN' AND u.is_active = 1",
                params![reward.emp_code],
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
            .ok_or_else(|| ApiError::unprocessable("Mã nhân viên không khớp hồ sơ HR."))?;
        if employee.4 == "Đã nghỉ việc" || employee.4 == "Chờ kích hoạt" {
            return Err(ApiError::unprocessable(
                "Chỉ nhân viên đang làm việc mới có thể được ghi nhận khen thưởng.",
            ));
        }
        reward.employee_id = employee.0;
        reward.emp_code = employee.1;
        reward.employee_name = employee.2;
        reward.department = employee.3;
    }

    let existing = {
        let mut statement = transaction
            .prepare("SELECT record_json FROM collection_records WHERE scope = 'hr_rewards'")
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(ApiError::internal)?
    };
    for serialized in existing {
        let current: HrReward = serde_json::from_str(&serialized).map_err(ApiError::internal)?;
        if current
            .reward_code
            .eq_ignore_ascii_case(&reward.reward_code)
        {
            return Err(ApiError::conflict("Mã khen thưởng đã tồn tại."));
        }
        if current
            .decision_no
            .eq_ignore_ascii_case(&reward.decision_no)
        {
            return Err(ApiError::conflict("Số quyết định đã tồn tại."));
        }
    }

    let serialized = serde_json::to_string(&reward).map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at)
             VALUES ('hr_rewards', ?1, ?2, ?3, ?3)",
            params![reward.key, serialized, timestamp],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                ApiError::conflict("Mã hồ sơ khen thưởng đã tồn tại.")
            } else {
                ApiError::internal(error)
            }
        })?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "reward": reward }))))
}

pub(super) async fn approve_reward(
    State(state): State<AppState>,
    Path(reward_key): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    transition_reward(&state, &reward_key, actor.id, APPROVED).await
}

pub(super) async fn record_award(
    State(state): State<AppState>,
    Path(reward_key): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    transition_reward(&state, &reward_key, actor.id, AWARDED).await
}

async fn transition_reward(
    state: &AppState,
    reward_key: &str,
    actor_id: String,
    target: &str,
) -> ApiResult<Json<Value>> {
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let serialized = transaction
        .query_row(
            "SELECT record_json FROM collection_records
             WHERE scope = 'hr_rewards' AND record_key = ?1",
            params![reward_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy quyết định khen thưởng."))?;
    let mut reward: HrReward = serde_json::from_str(&serialized).map_err(ApiError::internal)?;
    if reward.key.trim().is_empty() {
        reward.key = reward_key.to_owned();
    }
    let expected = if target == APPROVED {
        PENDING
    } else {
        APPROVED
    };
    if reward.status != expected {
        return Err(ApiError::conflict(if target == APPROVED {
            "Chỉ quyết định đang chờ duyệt mới có thể được ghi nhận duyệt."
        } else {
            "Cần ghi nhận duyệt trước khi ghi nhận trao thưởng."
        }));
    }
    if target == AWARDED {
        let has_approval_event = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM hr_reward_events
                 WHERE reward_key = ?1 AND event_type = 'approved')",
                params![reward_key],
                |row| row.get::<_, bool>(0),
            )
            .map_err(ApiError::internal)?;
        if !has_approval_event {
            return Err(ApiError::conflict(
                "Trạng thái duyệt cũ chưa có dấu vết xác minh; cần rà soát trước khi ghi nhận trao thưởng.",
            ));
        }
    }
    let timestamp = chrono::Utc::now().to_rfc3339();
    reward.status = target.to_owned();
    if target == APPROVED {
        reward.approval_recorded_by = actor_id.clone();
        reward.approval_recorded_at = timestamp.clone();
    } else {
        reward.award_recorded_by = actor_id.clone();
        reward.award_recorded_at = timestamp.clone();
    }
    reward
        .extra
        .insert("updatedAt".to_owned(), Value::String(timestamp.clone()));
    let updated = serde_json::to_string(&reward).map_err(ApiError::internal)?;
    transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2
             WHERE scope = 'hr_rewards' AND record_key = ?3",
            params![updated, timestamp, reward_key],
        )
        .map_err(ApiError::internal)?;
    let (event_type, sequence_no) = if target == APPROVED {
        ("approved", 1)
    } else {
        ("awarded", 2)
    };
    transaction
        .execute(
            "INSERT INTO hr_reward_events (reward_key, sequence_no, event_type, actor_user_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![reward_key, sequence_no, event_type, actor_id, timestamp],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "reward": reward })))
}

fn validate_input(input: CreateHrRewardInput) -> ApiResult<HrReward> {
    let reward_code = required_text(input.reward_code, "Mã khen thưởng", 80)?;
    let decision_no = required_text(input.decision_no, "Số quyết định", 100)?;
    let title = required_text(input.title, "Danh hiệu", 180)?;
    let event_date = required_date(input.date)?;
    if !REWARD_TYPES.contains(&input.reward_type.as_str()) {
        return Err(ApiError::unprocessable(
            "Hình thức khen thưởng không hợp lệ.",
        ));
    }
    if !(0..=1_000_000_000_000_000).contains(&input.reward_value) {
        return Err(ApiError::unprocessable(
            "Giá trị quy đổi khai báo không hợp lệ.",
        ));
    }
    let recipient_type = required_text(input.recipient_type, "Đối tượng nhận", 16)?;
    let (employee_code, employee_name, department) = match recipient_type.as_str() {
        "employee" => (
            required_text(input.employee_code, "Mã nhân viên", 64)?,
            String::new(),
            String::new(),
        ),
        "team" => (
            String::new(),
            required_text(input.team_name, "Tên tập thể", 180)?,
            required_text(input.department, "Phòng ban", 120)?,
        ),
        _ => {
            return Err(ApiError::unprocessable(
                "Đối tượng nhận phải là nhân viên hoặc tập thể.",
            ));
        }
    };
    Ok(HrReward {
        reward_code,
        decision_no,
        date: event_date,
        recipient_type,
        emp_code: employee_code,
        employee_name,
        department,
        title,
        reward_type: input.reward_type,
        reward_value: input.reward_value,
        achievement_summary: optional_text(input.achievement_summary, "Thành tích", 4_000)?,
        status: PENDING.to_owned(),
        ..HrReward::default()
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
        .map_err(|_| ApiError::unprocessable("Ngày quyết định phải theo định dạng YYYY-MM-DD."))?;
    if parsed.format("%Y-%m-%d").to_string() != value {
        return Err(ApiError::unprocessable("Ngày quyết định không hợp lệ."));
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
        let db = Connection::open_in_memory().expect("rewards in-memory database");
        crate::init_database(&db).expect("initialize rewards database");
        let now = chrono::Utc::now().to_rfc3339();
        for (id, role, name) in [
            ("rewards-admin", "ADMIN", "HR Admin"),
            ("rewards-employee", "USER", "Nguyễn An"),
            ("rewards-inactive", "USER", "Tạm khóa"),
        ] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), name, role, now],
            ).expect("insert rewards test user");
        }
        db.execute(
            "INSERT INTO employee_profiles (user_id,employee_code,department,position,employment_status,created_at,updated_at)
             VALUES ('rewards-employee','EMP-R-1','Kỹ thuật','Kỹ sư','Chính thức',?1,?1)",
            params![now],
        ).expect("insert rewards employee profile");
        db.execute(
            "INSERT INTO employee_profiles (user_id,employee_code,department,position,employment_status,created_at,updated_at)
             VALUES ('rewards-inactive','EMP-R-INACTIVE','Kỹ thuật','Kỹ sư','Chính thức',?1,?1)",
            params![now],
        ).expect("insert inactive rewards employee profile");
        db.execute(
            "UPDATE users SET is_active = 0 WHERE id = 'rewards-inactive'",
            [],
        )
        .expect("deactivate rewards test user");
        let make_user = |id: &str, role: &str, name: &str| User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: name.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = make_user("rewards-admin", "ADMIN", "HR Admin");
        let employee = make_user("rewards-employee", "USER", "Nguyễn An");
        let secret = b"rewards-test-secret-long-enough-for-a-token";
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
            crate::issue_token(state, user).expect("rewards JWT")
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
                    .expect("rewards request"),
            )
            .await
            .expect("rewards response")
    }
    async fn json_body(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 64 * 1024)
                .await
                .expect("body"),
        )
        .expect("JSON")
    }
    fn employee_payload() -> Value {
        json!({
            "rewardCode":"KT-2026/001","decisionNo":"QD-2026/001","date":"2026-10-08",
            "recipientType":"employee","employeeCode":"EMP-R-1","teamName":"ignored",
            "department":"spoofed","employeeName":"spoofed","title":"Đóng góp kỹ thuật",
            "rewardType":"Tiền mặt & Cúp pha lê","rewardValue":15000000,
            "achievementSummary":"Hoàn thành mục tiêu quý"
        })
    }

    #[tokio::test]
    async fn rewards_are_admin_only_typed_persistent_and_server_linked() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/rewards",
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
                "/api/v1/collections/hr_rewards",
                &admin_token,
                json!({"record":{}})
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/collections/hr_rewards",
                &admin_token,
                json!({})
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );

        let created = call(
            &app,
            Method::POST,
            "/api/v1/hr/rewards",
            &admin_token,
            employee_payload(),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let created = json_body(created).await;
        let reward = &created["reward"];
        assert_eq!(reward["employeeId"], "rewards-employee");
        assert_eq!(reward["employeeName"], "Nguyễn An");
        assert_eq!(reward["empCode"], "EMP-R-1");
        assert_eq!(reward["department"], "Kỹ thuật");
        assert_eq!(reward["signerName"], "HR Admin");
        assert_eq!(reward["createdBy"], admin.id);
        assert_eq!(reward["status"], PENDING);
        assert_eq!(reward["rewardValue"], 15000000);
        assert_eq!(reward["awardRecordedAt"], "");

        let duplicate = call(
            &app,
            Method::POST,
            "/api/v1/hr/rewards",
            &admin_token,
            employee_payload(),
        )
        .await;
        assert_eq!(duplicate.status(), StatusCode::CONFLICT);
        let missing_employee = call(&app, Method::POST, "/api/v1/hr/rewards", &admin_token, {
            let mut input = employee_payload();
            input["employeeCode"] = json!("UNKNOWN");
            input
        })
        .await;
        assert_eq!(missing_employee.status(), StatusCode::UNPROCESSABLE_ENTITY);
        let duplicate_decision = call(&app, Method::POST, "/api/v1/hr/rewards", &admin_token, {
            let mut input = employee_payload();
            input["rewardCode"] = json!("KT-2026/002");
            input
        })
        .await;
        assert_eq!(duplicate_decision.status(), StatusCode::CONFLICT);
        let inactive_employee = call(&app, Method::POST, "/api/v1/hr/rewards", &admin_token, {
            let mut input = employee_payload();
            input["rewardCode"] = json!("KT-2026/003");
            input["decisionNo"] = json!("QD-2026/003");
            input["employeeCode"] = json!("EMP-R-INACTIVE");
            input
        })
        .await;
        assert_eq!(inactive_employee.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn reward_transitions_are_ordered_persistent_admin_only_and_one_time() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let legacy_reward = HrReward {
            key: "legacy-reward".to_owned(),
            reward_code: "LEGACY-1".to_owned(),
            decision_no: "LEGACY-QD-1".to_owned(),
            status: APPROVED.to_owned(),
            approval_recorded_by: "forged-admin".to_owned(),
            approval_recorded_at: "2026-01-01T00:00:00Z".to_owned(),
            ..HrReward::default()
        };
        state
            .db
            .lock()
            .await
            .execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('hr_rewards',?1,?2,'2026-01-01','2026-01-01')",
                params![legacy_reward.key, serde_json::to_string(&legacy_reward).unwrap()],
            )
            .unwrap();
        assert_eq!(
            call(
                &app,
                Method::PATCH,
                "/api/v1/hr/rewards/legacy-reward/award",
                &admin_token,
                json!({}),
            )
            .await
            .status(),
            StatusCode::CONFLICT
        );
        let legacy_list = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/rewards",
                &admin_token,
                json!({}),
            )
            .await,
        )
        .await;
        let legacy_row = legacy_list["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["key"] == "legacy-reward")
            .unwrap();
        assert_eq!(legacy_row["approvalRecordedBy"], "");
        assert_eq!(legacy_row["approvalRecordedAt"], "");
        let created = json_body(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/rewards",
                &admin_token,
                employee_payload(),
            )
            .await,
        )
        .await;
        let key = created["reward"]["key"].as_str().unwrap();
        let award_path = format!("/api/v1/hr/rewards/{key}/award");
        let approve_path = format!("/api/v1/hr/rewards/{key}/approve");
        assert_eq!(
            call(&app, Method::PATCH, &award_path, &admin_token, json!({}))
                .await
                .status(),
            StatusCode::CONFLICT
        );
        assert_eq!(
            call(
                &app,
                Method::PATCH,
                &approve_path,
                &employee_token,
                json!({})
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        let approved = call(&app, Method::PATCH, &approve_path, &admin_token, json!({})).await;
        assert_eq!(approved.status(), StatusCode::OK);
        let approved = json_body(approved).await;
        assert_eq!(approved["reward"]["status"], APPROVED);
        assert_eq!(approved["reward"]["approvalRecordedBy"], admin.id);
        assert!(approved["reward"]["approvalRecordedAt"].as_str().is_some());
        assert_eq!(
            call(&app, Method::PATCH, &approve_path, &admin_token, json!({}))
                .await
                .status(),
            StatusCode::CONFLICT
        );
        let awarded = call(&app, Method::PATCH, &award_path, &admin_token, json!({})).await;
        assert_eq!(awarded.status(), StatusCode::OK);
        let awarded = json_body(awarded).await;
        assert_eq!(awarded["reward"]["status"], AWARDED);
        assert_eq!(awarded["reward"]["awardRecordedBy"], admin.id);
        assert!(awarded["reward"]["awardRecordedAt"].as_str().is_some());
        let db = state.db.lock().await;
        let event_rows = db
            .prepare(
                "SELECT sequence_no, event_type, actor_user_id FROM hr_reward_events
                 WHERE reward_key = ?1 ORDER BY sequence_no",
            )
            .unwrap()
            .query_map(params![key], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .unwrap()
            .collect::<rusqlite::Result<Vec<_>>>()
            .unwrap();
        assert_eq!(
            event_rows,
            vec![
                (1, "approved".to_owned(), admin.id.clone()),
                (2, "awarded".to_owned(), admin.id.clone()),
            ]
        );
        assert!(
            db.execute(
                "UPDATE hr_reward_events SET actor_user_id = 'forged' WHERE reward_key = ?1",
                params![key],
            )
            .is_err()
        );
        assert!(
            db.execute(
                "DELETE FROM hr_reward_events WHERE reward_key = ?1",
                params![key],
            )
            .is_err()
        );
        drop(db);
        assert_eq!(
            call(&app, Method::PATCH, &award_path, &admin_token, json!({}))
                .await
                .status(),
            StatusCode::CONFLICT
        );
        let listed = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/rewards",
                &admin_token,
                json!({}),
            )
            .await,
        )
        .await;
        assert_eq!(listed["data"][0]["status"], AWARDED);
        assert_eq!(listed["data"][0]["approvalRecordedBy"], admin.id);
        assert_eq!(listed["data"][0]["awardRecordedBy"], admin.id);
    }

    #[tokio::test]
    async fn team_rewards_and_invalid_reward_fields_are_supported_or_rejected_explicitly() {
        let (app, state, admin, _) = fixture();
        let token = bearer(&state, &admin);
        let mut team = employee_payload();
        team["rewardCode"] = json!("KT-TEAM-1");
        team["decisionNo"] = json!("QD-TEAM-1");
        team["recipientType"] = json!("team");
        team["teamName"] = json!("Nhóm nền tảng");
        team["department"] = json!("Kỹ thuật");
        let created = call(&app, Method::POST, "/api/v1/hr/rewards", &token, team).await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let created = json_body(created).await;
        assert_eq!(created["reward"]["recipientType"], "team");
        assert_eq!(created["reward"]["employeeName"], "Nhóm nền tảng");
        assert!(created["reward"]["employeeId"].as_str().unwrap().is_empty());

        let mut bad = employee_payload();
        bad["rewardCode"] = json!("KT-BAD-1");
        bad["decisionNo"] = json!("QD-BAD-1");
        bad["rewardValue"] = json!(-1);
        assert_eq!(
            call(&app, Method::POST, "/api/v1/hr/rewards", &token, bad)
                .await
                .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let mut bad = employee_payload();
        bad["rewardCode"] = json!("KT-BAD-2");
        bad["decisionNo"] = json!("QD-BAD-2");
        bad["date"] = json!("2026-02-30");
        assert_eq!(
            call(&app, Method::POST, "/api/v1/hr/rewards", &token, bad)
                .await
                .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
}
