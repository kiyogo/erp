use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const MAX_AMOUNT: i64 = 1_000_000_000_000;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlanReport {
    key: String,
    #[serde(default = "unknown_legacy_period")]
    period: String,
    department: String,
    leader: String,
    total_plans: i64,
    completed_plans: i64,
    approved_budget: i64,
    actual_spent: i64,
    variance: i64,
    kpi_score: f64,
    evaluation: String,
    #[serde(default)]
    projects: Vec<Value>,
    #[serde(default)]
    created_by_user_id: String,
    #[serde(default)]
    created_by_name: String,
    #[serde(default)]
    created_at: String,
    #[serde(default)]
    updated_by_user_id: String,
    #[serde(default)]
    updated_by_name: String,
    #[serde(default)]
    updated_at: String,
}

fn unknown_legacy_period() -> String {
    "Chưa xác định kỳ".to_owned()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PlanReportWriteInput {
    period: String,
    department: String,
    leader: String,
    total_plans: i64,
    completed_plans: i64,
    approved_budget: i64,
    actual_spent: i64,
    kpi_score: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PlanReportQuery {
    period: Option<String>,
}

struct ValidatedReport {
    period: String,
    department: String,
    leader: String,
    total_plans: i64,
    completed_plans: i64,
    approved_budget: i64,
    actual_spent: i64,
    kpi_score: f64,
    variance: i64,
    evaluation: String,
}

pub(super) async fn list_plan_reports(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Query(query): Query<PlanReportQuery>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let period = query.period.map(validate_period).transpose()?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare("SELECT record_json FROM collection_records WHERE scope = 'plan_reports' ORDER BY created_at DESC, record_key ASC")
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?;
    let reports = rows
        .map(|row| {
            let serialized = row.map_err(ApiError::internal)?;
            serde_json::from_str::<PlanReport>(&serialized).map_err(ApiError::internal)
        })
        .collect::<ApiResult<Vec<_>>>()?
        .into_iter()
        .filter(|report| {
            period
                .as_ref()
                .map_or(true, |period| report.period == *period)
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({ "data": reports })))
}

pub(super) async fn create_plan_report(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(input): Json<PlanReportWriteInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let input = validate_input(input)?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let timestamp = chrono::Utc::now().to_rfc3339();
    let report = PlanReport {
        key: Uuid::new_v4().to_string(),
        period: input.period,
        department: input.department,
        leader: input.leader,
        total_plans: input.total_plans,
        completed_plans: input.completed_plans,
        approved_budget: input.approved_budget,
        actual_spent: input.actual_spent,
        variance: input.variance,
        kpi_score: input.kpi_score,
        evaluation: input.evaluation,
        projects: Vec::new(),
        created_by_user_id: actor.id.clone(),
        created_by_name: actor.name.clone(),
        created_at: timestamp.clone(),
        updated_by_user_id: actor.id,
        updated_by_name: actor.name,
        updated_at: timestamp.clone(),
    };
    persist_report(&transaction, &report, &timestamp, true)?;
    let value = json!(report);
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "report": value }))))
}

pub(super) async fn update_plan_report(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Path(report_id): Path<String>,
    Json(input): Json<PlanReportWriteInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let input = validate_input(input)?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let serialized: Option<String> = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = 'plan_reports' AND record_key = ?1",
            params![report_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(serialized) = serialized else {
        return Err(ApiError::not_found("Không tìm thấy báo cáo kế hoạch."));
    };
    let mut report = serde_json::from_str::<PlanReport>(&serialized).map_err(ApiError::internal)?;
    if report.key != report_id {
        return Err(ApiError::internal(
            "Stored report key does not match its database key.",
        ));
    }
    report.period = input.period;
    report.department = input.department;
    report.leader = input.leader;
    report.total_plans = input.total_plans;
    report.completed_plans = input.completed_plans;
    report.approved_budget = input.approved_budget;
    report.actual_spent = input.actual_spent;
    report.variance = input.variance;
    report.kpi_score = input.kpi_score;
    report.evaluation = input.evaluation;
    report.updated_by_user_id = actor.id;
    report.updated_by_name = actor.name;
    report.updated_at = chrono::Utc::now().to_rfc3339();
    let timestamp = report.updated_at.clone();
    persist_report(&transaction, &report, &timestamp, false)?;
    let value = json!(report);
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "report": value })))
}

fn validate_input(input: PlanReportWriteInput) -> ApiResult<ValidatedReport> {
    let period = validate_period(input.period)?;
    let department = required_text(input.department, "Tên khối / đơn vị", 160)?;
    let leader = required_text(input.leader, "Lãnh đạo phụ trách", 160)?;
    if input.total_plans < 1 || input.total_plans > 1_000_000 {
        return Err(ApiError::unprocessable(
            "Tổng kế hoạch phải từ 1 đến 1.000.000.",
        ));
    }
    if input.completed_plans < 0 || input.completed_plans > input.total_plans {
        return Err(ApiError::unprocessable(
            "Số kế hoạch hoàn thành phải nằm trong khoảng 0 đến tổng kế hoạch.",
        ));
    }
    if !(0..=MAX_AMOUNT).contains(&input.approved_budget)
        || !(0..=MAX_AMOUNT).contains(&input.actual_spent)
    {
        return Err(ApiError::unprocessable(
            "Ngân sách và chi phí phải nằm trong khoảng 0 đến 1.000.000.000.000 VNĐ.",
        ));
    }
    if !input.kpi_score.is_finite() || !(0.0..=100.0).contains(&input.kpi_score) {
        return Err(ApiError::unprocessable(
            "Điểm KPI phải là số hữu hạn trong khoảng 0 đến 100.",
        ));
    }
    let variance = input.actual_spent - input.approved_budget;
    let evaluation = if input.kpi_score >= 95.0 {
        "Xuất sắc"
    } else {
        "Đạt yêu cầu"
    }
    .to_owned();
    Ok(ValidatedReport {
        period,
        department,
        leader,
        total_plans: input.total_plans,
        completed_plans: input.completed_plans,
        approved_budget: input.approved_budget,
        actual_spent: input.actual_spent,
        kpi_score: input.kpi_score,
        variance,
        evaluation,
    })
}

fn validate_period(value: String) -> ApiResult<String> {
    let value = value.trim().to_owned();
    let year = if value.len() == 4 && value.bytes().all(|byte| byte.is_ascii_digit()) {
        value.as_str()
    } else {
        let Some((quarter, year)) = value.split_once('/') else {
            return Err(ApiError::unprocessable(
                "Kỳ báo cáo phải là YYYY hoặc Q1/YYYY đến Q4/YYYY.",
            ));
        };
        if !matches!(quarter, "Q1" | "Q2" | "Q3" | "Q4") {
            return Err(ApiError::unprocessable(
                "Kỳ báo cáo phải là YYYY hoặc Q1/YYYY đến Q4/YYYY.",
            ));
        }
        year
    };
    if year.len() != 4
        || !year
            .parse::<u16>()
            .is_ok_and(|year| (2000..=2100).contains(&year))
    {
        return Err(ApiError::unprocessable(
            "Kỳ báo cáo phải là YYYY hoặc Q1/YYYY đến Q4/YYYY.",
        ));
    }
    Ok(value)
}

fn required_text(value: String, field: &str, max_length: usize) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.is_empty()
        || value.encode_utf16().count() > max_length
        || value.chars().any(char::is_control)
    {
        return Err(ApiError::unprocessable(format!(
            "{field} không hợp lệ hoặc vượt quá {max_length} ký tự."
        )));
    }
    Ok(value)
}

fn persist_report(
    transaction: &rusqlite::Transaction<'_>,
    report: &PlanReport,
    timestamp: &str,
    insert: bool,
) -> ApiResult<()> {
    let serialized = serde_json::to_string(report).map_err(ApiError::internal)?;
    let changed = if insert {
        transaction
            .execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('plan_reports',?1,?2,?3,?3)",
                params![report.key, serialized, timestamp],
            )
            .map_err(ApiError::internal)?
    } else {
        transaction
            .execute(
                "UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = 'plan_reports' AND record_key = ?3",
                params![serialized, timestamp, report.key],
            )
            .map_err(ApiError::internal)?
    };
    if changed != 1 {
        return Err(ApiError::internal(
            "Report persistence did not affect exactly one record.",
        ));
    }
    Ok(())
}

pub(super) fn validate_import_record(value: &Value) -> ApiResult<()> {
    let report = serde_json::from_value::<PlanReport>(value.clone())
        .map_err(|_| ApiError::unprocessable("Invalid legacy plan report record."))?;
    if value.get("period").is_some() {
        validate_period(report.period.clone())?;
    }
    required_text(report.department, "Tên khối / đơn vị", 160)?;
    required_text(report.leader, "Lãnh đạo phụ trách", 160)?;
    if report.total_plans < 1
        || report.completed_plans < 0
        || report.completed_plans > report.total_plans
        || !(0..=MAX_AMOUNT).contains(&report.approved_budget)
        || !(0..=MAX_AMOUNT).contains(&report.actual_spent)
        || !report.kpi_score.is_finite()
        || !(0.0..=100.0).contains(&report.kpi_score)
        || report.projects.iter().any(|project| !project.is_object())
    {
        return Err(ApiError::unprocessable(
            "Invalid legacy report totals or projects.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::User;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use rusqlite::Connection;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn test_app() -> (axum::Router, AppState, User, User) {
        let db = Connection::open_in_memory().expect("in-memory plan reports database");
        crate::init_database(&db).expect("initialize plan reports schema");
        let now = chrono::Utc::now().to_rfc3339();
        for (id, role) in [("reports-admin", "ADMIN"), ("reports-user", "USER")] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test',1,?5,?5)",
                params![id, format!("{id}@example.test"), id, role, now],
            ).expect("insert plan reports test user");
        }
        let user = |id: &str, role: &str| User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: id.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = user("reports-admin", "ADMIN");
        let employee = user("reports-user", "USER");
        let secret = b"plan-reports-test-secret-long-enough-for-hmac";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(std::path::PathBuf::new()),
            crm_crypto: None,
        };
        let app = crate::router(state.clone(), CorsLayer::new());
        (app, state, admin, employee)
    }

    fn bearer(state: &AppState, user: &User) -> String {
        format!(
            "Bearer {}",
            crate::issue_token(state, user).expect("issue plan report token")
        )
    }

    async fn call(
        app: &axum::Router,
        method: &str,
        uri: &str,
        auth: &str,
        payload: Option<Value>,
    ) -> axum::response::Response {
        let mut request = Request::builder()
            .method(method)
            .uri(uri)
            .header("Authorization", auth);
        let body = match payload {
            Some(value) => {
                request = request.header("Content-Type", "application/json");
                Body::from(value.to_string())
            }
            None => Body::empty(),
        };
        app.clone()
            .oneshot(request.body(body).expect("plan report request"))
            .await
            .expect("plan report response")
    }

    fn input(period: &str, department: &str, actual_spent: i64, kpi_score: f64) -> Value {
        json!({
            "period":period, "department":department, "leader":"Nguyễn An",
            "totalPlans":4, "completedPlans":3, "approvedBudget":1_000_000_000_i64,
            "actualSpent":actual_spent, "kpiScore":kpi_score
        })
    }

    #[tokio::test]
    async fn reports_persist_and_legacy_rows_remain_readable_with_admin_controls() {
        let (app, state, admin, employee) = test_app();
        let admin_token = bearer(&state, &admin);
        let user_token = bearer(&state, &employee);
        assert_eq!(
            call(
                &app,
                "GET",
                "/api/v1/plan-reports?period=Q3%2F2026",
                &user_token,
                None
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                "GET",
                "/api/v1/collections/plan_reports",
                &user_token,
                None
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
        assert_eq!(
            call(
                &app,
                "POST",
                "/api/v1/collections/plan_reports",
                &admin_token,
                Some(json!({"record":{}}))
            )
            .await
            .status(),
            StatusCode::BAD_REQUEST
        );

        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('plan_reports','legacy-report',?1,'2026-01-01','2026-01-01')",
                params![json!({
                    "key":"legacy-report", "department":"Đơn vị lịch sử", "leader":"Lãnh đạo",
                    "totalPlans":2, "completedPlans":1, "approvedBudget":100, "actualSpent":90,
                    "variance":-10, "kpiScore":92, "evaluation":"Đạt yêu cầu",
                    "projects":[{"code":"legacy-project","name":"Dữ liệu cũ"}]
                }).to_string()],
            ).expect("insert legacy report shape");
        }

        let created = call(
            &app,
            "POST",
            "/api/v1/plan-reports",
            &admin_token,
            Some(input("Q3/2026", "Khối Kỹ thuật", 950_000_000, 96.5)),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 16 * 1024)
            .await
            .expect("created report body");
        let created: Value = serde_json::from_slice(&body).expect("created report JSON");
        let key = created["report"]["key"]
            .as_str()
            .expect("report key")
            .to_owned();
        assert_eq!(created["report"]["variance"], -50_000_000);
        assert_eq!(created["report"]["evaluation"], "Xuất sắc");

        let duplicate_unit_report = call(
            &app,
            "POST",
            "/api/v1/plan-reports",
            &admin_token,
            Some(input("Q3/2026", "Khối Kỹ thuật", 900_000_000, 90.0)),
        )
        .await;
        assert_eq!(duplicate_unit_report.status(), StatusCode::CREATED);
        let invalid = call(
            &app,
            "POST",
            "/api/v1/plan-reports",
            &admin_token,
            Some(json!({
                "period":"Q3/2026", "department":"Khối khác", "leader":"Leader", "totalPlans":2,
                "completedPlans":3, "approvedBudget":100, "actualSpent":90, "kpiScore":95
            })),
        )
        .await;
        assert_eq!(invalid.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let updated = call(
            &app,
            "PUT",
            &format!("/api/v1/plan-reports/{key}"),
            &admin_token,
            Some(input("2026", "Khối Kỹ thuật", 1_050_000_000, 89.0)),
        )
        .await;
        assert_eq!(updated.status(), StatusCode::OK);
        let body = axum::body::to_bytes(updated.into_body(), 16 * 1024)
            .await
            .expect("updated report body");
        let updated: Value = serde_json::from_slice(&body).expect("updated report JSON");
        assert_eq!(updated["report"]["period"], "2026");
        assert_eq!(updated["report"]["variance"], 50_000_000);
        assert_eq!(updated["report"]["evaluation"], "Đạt yêu cầu");

        let list = call(
            &app,
            "GET",
            "/api/v1/plan-reports?period=2026",
            &admin_token,
            None,
        )
        .await;
        assert_eq!(list.status(), StatusCode::OK);
        let body = axum::body::to_bytes(list.into_body(), 16 * 1024)
            .await
            .expect("report list body");
        let list: Value = serde_json::from_slice(&body).expect("report list JSON");
        assert_eq!(list["data"].as_array().unwrap().len(), 1);
        assert_eq!(
            list["data"]
                .as_array()
                .unwrap()
                .iter()
                .find(|report| report["key"] == key)
                .unwrap()["updatedByUserId"],
            "reports-admin"
        );

        let all_before_legacy_edit =
            call(&app, "GET", "/api/v1/plan-reports", &admin_token, None).await;
        let body = axum::body::to_bytes(all_before_legacy_edit.into_body(), 16 * 1024)
            .await
            .expect("legacy reports body");
        let all_before_legacy_edit: Value =
            serde_json::from_slice(&body).expect("legacy reports JSON");
        let legacy_before_edit = all_before_legacy_edit["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|report| report["key"] == "legacy-report")
            .unwrap();
        assert_eq!(legacy_before_edit["period"], "Chưa xác định kỳ");
        assert_eq!(legacy_before_edit["projects"][0]["code"], "legacy-project");

        let legacy_update = call(
            &app,
            "PUT",
            "/api/v1/plan-reports/legacy-report",
            &admin_token,
            Some(input("2025", "Đơn vị lịch sử", 90, 92.0)),
        )
        .await;
        assert_eq!(legacy_update.status(), StatusCode::OK);
        let body = axum::body::to_bytes(legacy_update.into_body(), 16 * 1024)
            .await
            .expect("legacy update body");
        let legacy_update: Value = serde_json::from_slice(&body).expect("legacy update JSON");
        assert_eq!(
            legacy_update["report"]["projects"][0]["code"],
            "legacy-project"
        );

        let all = call(&app, "GET", "/api/v1/plan-reports", &admin_token, None).await;
        assert_eq!(all.status(), StatusCode::OK);
        let body = axum::body::to_bytes(all.into_body(), 16 * 1024)
            .await
            .expect("all reports body");
        let all: Value = serde_json::from_slice(&body).expect("all reports JSON");
        let legacy = all["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|report| report["key"] == "legacy-report")
            .unwrap();
        assert_eq!(legacy["period"], "2025");
        assert_eq!(legacy["projects"][0]["code"], "legacy-project");
    }
}
