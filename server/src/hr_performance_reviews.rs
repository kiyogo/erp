use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const PENDING: &str = "Chờ phê duyệt điểm";
const APPROVED: &str = "Đã hoàn tất đánh giá";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
struct PerformanceReview {
    key: String,
    code: String,
    employee_id: String,
    employee_name: String,
    emp_code: String,
    department: String,
    position: String,
    period: String,
    self_score: i64,
    manager_score: i64,
    grade: String,
    kpi_bonus: i64,
    evaluator_id: String,
    evaluator: String,
    manager_comment: String,
    status: String,
    created_by: String,
    created_at: String,
    approval_recorded_by: String,
    approval_recorded_at: String,
    workflow_verified: bool,
    #[serde(flatten)]
    extra: BTreeMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreatePerformanceReviewInput {
    code: String,
    employee_code: String,
    period: String,
    self_score: i64,
    manager_score: i64,
    kpi_bonus: i64,
    #[serde(default)]
    manager_comment: String,
}

pub(super) async fn list_reviews(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let event_rows = {
        let mut statement = db
            .prepare(
                "SELECT review_key, event_type, actor_user_id, created_at
                 FROM hr_performance_review_events ORDER BY review_key, sequence_no",
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
    for (key, event_type, actor_id, timestamp) in event_rows {
        events
            .entry(key)
            .or_default()
            .insert(event_type, (actor_id, timestamp));
    }

    let mut statement = db
        .prepare(
            "SELECT record_key, record_json FROM collection_records
             WHERE scope = 'hr_performance_reviews' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?;
    let reviews = rows
        .map(|row| {
            let (record_key, serialized) = row.map_err(ApiError::internal)?;
            let mut review: PerformanceReview =
                serde_json::from_str(&serialized).map_err(ApiError::internal)?;
            review.key = record_key.clone();
            review.workflow_verified = false;
            review.created_by.clear();
            review.created_at.clear();
            review.approval_recorded_by.clear();
            review.approval_recorded_at.clear();
            if let Some(record_events) = events.get(&record_key) {
                if let Some((actor_id, timestamp)) = record_events.get("created") {
                    review.created_by = actor_id.clone();
                    review.created_at = timestamp.clone();
                    review.workflow_verified = true;
                }
                if let Some((actor_id, timestamp)) = record_events.get("approved") {
                    review.approval_recorded_by = actor_id.clone();
                    review.approval_recorded_at = timestamp.clone();
                    review.status = APPROVED.to_owned();
                    review.workflow_verified = true;
                }
            }
            Ok(review)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": reviews })))
}

pub(super) async fn create_review(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreatePerformanceReviewInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let mut review = validate_input(input)?;
    review.key = Uuid::new_v4().to_string();
    review.status = PENDING.to_owned();
    review.evaluator_id = actor.id.clone();
    review.evaluator = actor.name.clone();
    review.created_by = actor.id.clone();
    review.created_at = chrono::Utc::now().to_rfc3339();
    review.workflow_verified = true;

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let employee = transaction
        .query_row(
            "SELECT p.user_id, p.employee_code, u.name, p.department, p.position, p.employment_status
             FROM employee_profiles p JOIN users u ON u.id = p.user_id
             WHERE lower(p.employee_code) = lower(?1) AND u.role != 'ADMIN' AND u.is_active = 1",
            params![review.emp_code],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::unprocessable("Mã nhân viên không khớp hồ sơ HR đang hoạt động."))?;
    if employee.5 == "Đã nghỉ việc" || employee.5 == "Chờ kích hoạt" {
        return Err(ApiError::unprocessable(
            "Chỉ nhân viên đang làm việc mới có thể được đánh giá.",
        ));
    }
    review.employee_id = employee.0;
    review.emp_code = employee.1;
    review.employee_name = employee.2;
    review.department = employee.3;
    review.position = employee.4;

    let duplicate = transaction
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM collection_records
               WHERE scope = 'hr_performance_reviews'
                 AND lower(json_extract(record_json, '$.code')) = lower(?1)
             )",
            params![review.code],
            |row| row.get::<_, bool>(0),
        )
        .map_err(ApiError::internal)?;
    if duplicate {
        return Err(ApiError::conflict("Mã phiếu đánh giá đã tồn tại."));
    }

    let timestamp = review.created_at.clone();
    let serialized = serde_json::to_string(&review).map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at)
             VALUES ('hr_performance_reviews', ?1, ?2, ?3, ?3)",
            params![review.key, serialized, timestamp],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO hr_performance_review_events (review_key, sequence_no, event_type, actor_user_id, created_at)
             VALUES (?1, 1, 'created', ?2, ?3)",
            params![review.key, actor.id, timestamp],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "review": review }))))
}

pub(super) async fn approve_review(
    State(state): State<AppState>,
    Path(review_key): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let serialized = transaction
        .query_row(
            "SELECT record_json FROM collection_records
             WHERE scope = 'hr_performance_reviews' AND record_key = ?1",
            params![review_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy phiếu đánh giá."))?;
    let mut review: PerformanceReview =
        serde_json::from_str(&serialized).map_err(ApiError::internal)?;
    review.key = review_key.clone();
    let has_create_event = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM hr_performance_review_events
             WHERE review_key = ?1 AND event_type = 'created')",
            params![review_key],
            |row| row.get::<_, bool>(0),
        )
        .map_err(ApiError::internal)?;
    if !has_create_event {
        return Err(ApiError::conflict(
            "Phiếu kế thừa chưa có nguồn tạo được kiểm chứng; cần rà soát/import an toàn trước khi duyệt.",
        ));
    }
    if review.status != PENDING {
        return Err(ApiError::conflict(
            "Chỉ phiếu đang chờ duyệt mới có thể được ghi nhận hoàn tất.",
        ));
    }
    let timestamp = chrono::Utc::now().to_rfc3339();
    review.status = APPROVED.to_owned();
    review.approval_recorded_by = actor.id.clone();
    review.approval_recorded_at = timestamp.clone();
    review.workflow_verified = true;
    review
        .extra
        .insert("updatedAt".to_owned(), Value::String(timestamp.clone()));
    let updated = serde_json::to_string(&review).map_err(ApiError::internal)?;
    transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2
             WHERE scope = 'hr_performance_reviews' AND record_key = ?3",
            params![updated, timestamp, review_key],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO hr_performance_review_events (review_key, sequence_no, event_type, actor_user_id, created_at)
             VALUES (?1, 2, 'approved', ?2, ?3)",
            params![review_key, actor.id, timestamp],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "review": review })))
}

fn validate_input(input: CreatePerformanceReviewInput) -> ApiResult<PerformanceReview> {
    let code = required_text(input.code, "Mã phiếu", 80)?;
    let employee_code = required_text(input.employee_code, "Mã nhân viên", 64)?;
    let period = required_text(input.period, "Kỳ đánh giá", 80)?;
    if !(1..=100).contains(&input.self_score) || !(1..=100).contains(&input.manager_score) {
        return Err(ApiError::unprocessable(
            "Điểm tự chấm và điểm quản lý phải từ 1 đến 100.",
        ));
    }
    if !(0..=1_000_000_000_000_000).contains(&input.kpi_bonus) {
        return Err(ApiError::unprocessable(
            "Mức thưởng đề xuất phải là số nguyên không âm hợp lệ.",
        ));
    }
    let grade = grade_for(input.manager_score).to_owned();
    Ok(PerformanceReview {
        code,
        emp_code: employee_code,
        period,
        self_score: input.self_score,
        manager_score: input.manager_score,
        grade,
        kpi_bonus: input.kpi_bonus,
        manager_comment: optional_text(input.manager_comment, "Nhận xét", 4_000)?,
        status: PENDING.to_owned(),
        ..PerformanceReview::default()
    })
}

fn grade_for(score: i64) -> &'static str {
    match score {
        95..=100 => "A+ (Xuất sắc)",
        85..=94 => "A (Tốt)",
        70..=84 => "B (Đạt)",
        _ => "C (Cần cải thiện)",
    }
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
        let db = Connection::open_in_memory().expect("performance review in-memory DB");
        crate::init_database(&db).expect("initialize performance review DB");
        let now = chrono::Utc::now().to_rfc3339();
        for (id, role, name) in [
            ("review-admin", "ADMIN", "HR Admin"),
            ("review-employee", "USER", "Nguyễn An"),
            ("review-inactive", "USER", "Inactive employee"),
        ] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), name, role, now],
            )
            .expect("insert performance review test user");
        }
        db.execute(
            "INSERT INTO employee_profiles (user_id,employee_code,department,position,employment_status,created_at,updated_at)
             VALUES ('review-employee','EMP-REV-1','Kỹ thuật','Kỹ sư Rust','Chính thức',?1,?1),
                    ('review-inactive','EMP-REV-X','Kỹ thuật','Kỹ sư Rust','Chính thức',?1,?1)",
            params![now],
        )
        .expect("insert performance review HR profiles");
        db.execute(
            "UPDATE users SET is_active = 0 WHERE id = 'review-inactive'",
            [],
        )
        .expect("deactivate performance review test employee");
        let make_user = |id: &str, role: &str, name: &str| User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: name.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = make_user("review-admin", "ADMIN", "HR Admin");
        let employee = make_user("review-employee", "USER", "Nguyễn An");
        let secret = b"performance-review-test-secret-long-enough";
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
            crate::issue_token(state, user).expect("review JWT")
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
                    .expect("performance review request"),
            )
            .await
            .expect("performance review response")
    }

    async fn json_body(response: axum::response::Response) -> Value {
        serde_json::from_slice(
            &to_bytes(response.into_body(), 64 * 1024)
                .await
                .expect("performance review body"),
        )
        .expect("performance review JSON")
    }

    fn payload() -> Value {
        json!({
            "code":"DG-2026-Q3-001","employeeCode":"EMP-REV-1","period":"Quý III / 2026",
            "selfScore":91,"managerScore":96,"kpiBonus":12000000,"managerComment":"Đạt mục tiêu quý",
            "employeeName":"Spoofed Name","department":"Spoofed department","position":"Spoofed position",
            "grade":"B (Đạt)","status":"Đã hoàn tất đánh giá","productivityScore":60,
            "evaluator":"Spoofed evaluator","createdBy":"spoofed","workflowVerified":true
        })
    }

    #[tokio::test]
    async fn reviews_are_admin_only_typed_persistent_and_server_linked() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        assert_eq!(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/performance-reviews",
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
                "/api/v1/collections/hr_performance_reviews",
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
                "/api/v1/collections/hr_performance_reviews",
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
            "/api/v1/hr/performance-reviews",
            &admin_token,
            payload(),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let created = json_body(created).await;
        let review = &created["review"];
        assert_eq!(review["employeeId"], "review-employee");
        assert_eq!(review["employeeName"], "Nguyễn An");
        assert_eq!(review["empCode"], "EMP-REV-1");
        assert_eq!(review["department"], "Kỹ thuật");
        assert_eq!(review["position"], "Kỹ sư Rust");
        assert_eq!(review["grade"], "A+ (Xuất sắc)");
        assert_eq!(review["evaluator"], "HR Admin");
        assert_eq!(review["createdBy"], admin.id);
        assert_eq!(review["status"], PENDING);
        assert_eq!(review["workflowVerified"], true);
        assert!(review.get("productivityScore").is_none());

        let duplicate = call(
            &app,
            Method::POST,
            "/api/v1/hr/performance-reviews",
            &admin_token,
            payload(),
        )
        .await;
        assert_eq!(duplicate.status(), StatusCode::CONFLICT);
        let mut invalid = payload();
        invalid["code"] = json!("DG-BAD-SCORE");
        invalid["managerScore"] = json!(101);
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/performance-reviews",
                &admin_token,
                invalid
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        let mut inactive = payload();
        inactive["code"] = json!("DG-INACTIVE");
        inactive["employeeCode"] = json!("EMP-REV-X");
        assert_eq!(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/performance-reviews",
                &admin_token,
                inactive
            )
            .await
            .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }

    #[tokio::test]
    async fn review_approval_is_one_time_event_backed_and_cannot_trust_legacy_fields() {
        let (app, state, admin, employee) = fixture();
        let admin_token = bearer(&state, &admin);
        let employee_token = bearer(&state, &employee);
        let legacy = PerformanceReview {
            key: "legacy-review".to_owned(),
            code: "LEGACY-REVIEW".to_owned(),
            status: APPROVED.to_owned(),
            created_by: "forged-actor".to_owned(),
            created_at: "2026-01-01T00:00:00Z".to_owned(),
            approval_recorded_by: "forged-approver".to_owned(),
            approval_recorded_at: "2026-01-02T00:00:00Z".to_owned(),
            workflow_verified: true,
            ..PerformanceReview::default()
        };
        state.db.lock().await.execute(
            "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('hr_performance_reviews',?1,?2,'2026-01-01','2026-01-01')",
            params![legacy.key, serde_json::to_string(&legacy).unwrap()],
        ).unwrap();
        assert_eq!(
            call(
                &app,
                Method::PATCH,
                "/api/v1/hr/performance-reviews/legacy-review/approve",
                &admin_token,
                json!({})
            )
            .await
            .status(),
            StatusCode::CONFLICT
        );
        let legacy_list = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/performance-reviews",
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
            .find(|row| row["key"] == "legacy-review")
            .unwrap();
        assert_eq!(legacy_row["workflowVerified"], false);
        assert_eq!(legacy_row["createdBy"], "");
        assert_eq!(legacy_row["approvalRecordedBy"], "");

        let created = json_body(
            call(
                &app,
                Method::POST,
                "/api/v1/hr/performance-reviews",
                &admin_token,
                payload(),
            )
            .await,
        )
        .await;
        let key = created["review"]["key"].as_str().unwrap();
        let approve_uri = format!("/api/v1/hr/performance-reviews/{key}/approve");
        assert_eq!(
            call(
                &app,
                Method::PATCH,
                &approve_uri,
                &employee_token,
                json!({})
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        let approved = call(&app, Method::PATCH, &approve_uri, &admin_token, json!({})).await;
        assert_eq!(approved.status(), StatusCode::OK);
        let approved = json_body(approved).await;
        assert_eq!(approved["review"]["status"], APPROVED);
        assert_eq!(approved["review"]["approvalRecordedBy"], admin.id);
        assert!(approved["review"]["approvalRecordedAt"].as_str().is_some());
        assert_eq!(
            call(&app, Method::PATCH, &approve_uri, &admin_token, json!({}))
                .await
                .status(),
            StatusCode::CONFLICT
        );
        let listed = json_body(
            call(
                &app,
                Method::GET,
                "/api/v1/hr/performance-reviews",
                &admin_token,
                json!({}),
            )
            .await,
        )
        .await;
        let row = listed["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["key"] == key)
            .unwrap();
        assert_eq!(row["approvalRecordedBy"], admin.id);
        assert_eq!(row["workflowVerified"], true);
        let db = state.db.lock().await;
        let event_types = db.prepare(
            "SELECT event_type FROM hr_performance_review_events WHERE review_key = ?1 ORDER BY sequence_no",
        ).unwrap().query_map(params![key], |row| row.get::<_, String>(0)).unwrap()
            .collect::<rusqlite::Result<Vec<_>>>().unwrap();
        assert_eq!(
            event_types,
            vec!["created".to_owned(), "approved".to_owned()]
        );
        assert!(
            db.execute(
                "DELETE FROM hr_performance_review_events WHERE review_key = ?1",
                params![key]
            )
            .is_err()
        );
    }

    #[test]
    fn performance_grade_boundaries_and_validation_are_deterministic() {
        assert_eq!(grade_for(95), "A+ (Xuất sắc)");
        assert_eq!(grade_for(85), "A (Tốt)");
        assert_eq!(grade_for(70), "B (Đạt)");
        assert_eq!(grade_for(69), "C (Cần cải thiện)");
        assert!(
            validate_input(CreatePerformanceReviewInput {
                code: "R-1".into(),
                employee_code: "E-1".into(),
                period: "Q1".into(),
                self_score: 0,
                manager_score: 80,
                kpi_bonus: 0,
                manager_comment: String::new(),
            })
            .is_err()
        );
        assert!(
            validate_input(CreatePerformanceReviewInput {
                code: "R-1".into(),
                employee_code: "E-1".into(),
                period: "Q1".into(),
                self_score: 80,
                manager_score: 80,
                kpi_bonus: -1,
                manager_comment: String::new(),
            })
            .is_err()
        );
    }
}
