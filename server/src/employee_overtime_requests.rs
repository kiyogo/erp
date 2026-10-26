use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use chrono::{NaiveDate, Utc};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ADMIN_ROLE, ApiError, ApiResult, AppState, authenticated_user, require_admin};

const SELECT_REQUEST: &str = "SELECT r.id, r.code, r.employee_id, r.employee_code_snapshot, \
    r.employee_name_snapshot, r.department_snapshot, r.ot_date, r.requested_hours, r.day_type, \
    r.project, r.reason, r.status, r.reviewer_id, COALESCE(reviewer.name, ''), r.review_note, \
    COALESCE(r.reviewed_at, ''), r.created_at, r.updated_at \
    FROM employee_overtime_requests r LEFT JOIN users reviewer ON reviewer.id = r.reviewer_id";

const DAY_TYPES: &[&str] = &["weekday", "weekend", "holiday"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct EmployeeOvertimeRequest {
    id: String,
    code: String,
    employee_id: String,
    employee_code: String,
    employee_name: String,
    department: String,
    ot_date: String,
    requested_hours: f64,
    day_type: String,
    project: String,
    reason: String,
    status: String,
    reviewer_id: Option<String>,
    reviewer_name: String,
    review_note: String,
    reviewed_at: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateEmployeeOvertimeRequestInput {
    ot_date: String,
    requested_hours: f64,
    day_type: String,
    project: String,
    reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DecideEmployeeOvertimeRequestInput {
    status: String,
    #[serde(default)]
    review_note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EmployeeOvertimeRequestEvent {
    sequence_no: i64,
    event_type: String,
    actor_id: String,
    actor_name: String,
    from_status: Option<String>,
    to_status: String,
    note: String,
    created_at: String,
}

pub(super) async fn list_employee_overtime_requests(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let query = format!(
        "{SELECT_REQUEST} WHERE (?1 = 1 OR r.employee_id = ?2) ORDER BY r.created_at DESC, r.id DESC"
    );
    let mut statement = db.prepare(&query).map_err(ApiError::internal)?;
    let requests = statement
        .query_map(
            params![actor.role == ADMIN_ROLE, actor.id],
            employee_overtime_request_from_sql,
        )
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": requests })))
}

pub(super) async fn create_employee_overtime_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateEmployeeOvertimeRequestInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = authenticated_user(&state, &headers).await?;
    let ot_date = validate_date(&input.ot_date)?;
    let requested_hours = validate_hours(input.requested_hours)?;
    let day_type = validate_day_type(input.day_type)?;
    let project = required_text(input.project, "Dự án/hạng mục", 500)?;
    let reason = required_text(input.reason, "Nội dung công việc", 4_000)?;

    let now = Utc::now();
    let timestamp = now.to_rfc3339();
    let date_code = now.format("%Y%m%d").to_string();
    let id = Uuid::new_v4().to_string();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let employee: Option<(String, String, String)> = transaction
        .query_row(
            "SELECT u.name, p.employee_code, p.department \
             FROM users u JOIN employee_profiles p ON p.user_id = u.id \
             WHERE u.id = ?1 AND u.is_active = 1 \
               AND p.employment_status != 'Đã nghỉ việc'",
            params![actor.id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some((employee_name, employee_code, department)) = employee else {
        return Err(ApiError::conflict(
            "Tài khoản chưa liên kết với hồ sơ nhân viên đang hoạt động.",
        ));
    };
    if employee_name.trim().is_empty() || employee_code.trim().is_empty() {
        return Err(ApiError::conflict(
            "Hồ sơ nhân viên chưa có họ tên hoặc mã nhân viên hợp lệ.",
        ));
    }

    let code = (0..10)
        .find_map(|_| {
            let suffix = Uuid::new_v4().simple().to_string().to_ascii_uppercase();
            let candidate = format!("OT-{date_code}-{}", &suffix[..8]);
            let exists = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM employee_overtime_requests WHERE code = ?1)",
                    params![candidate],
                    |row| row.get::<_, bool>(0),
                )
                .map_err(ApiError::internal);
            match exists {
                Ok(false) => Some(Ok(candidate)),
                Ok(true) => None,
                Err(error) => Some(Err(error)),
            }
        })
        .transpose()?
        .ok_or_else(|| ApiError::internal("Could not generate a unique overtime request code."))?;

    transaction
        .execute(
            "INSERT INTO employee_overtime_requests \
             (id, code, employee_id, employee_code_snapshot, employee_name_snapshot, department_snapshot, \
              ot_date, requested_hours, day_type, project, reason, status, reviewer_id, review_note, \
              reviewed_at, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'Chờ phê duyệt', \
                     NULL, '', NULL, ?12, ?12)",
            params![
                id,
                code,
                actor.id,
                employee_code,
                employee_name,
                department,
                ot_date,
                requested_hours,
                day_type,
                project,
                reason,
                timestamp
            ],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO employee_overtime_request_events \
             (request_id, sequence_no, event_type, actor_id, from_status, to_status, note, created_at) \
             VALUES (?1, 1, 'submitted', ?2, NULL, 'Chờ phê duyệt', '', ?3)",
            params![id, actor.id, timestamp],
        )
        .map_err(ApiError::internal)?;
    let query = format!("{SELECT_REQUEST} WHERE r.id = ?1");
    let request = transaction
        .query_row(&query, params![id], employee_overtime_request_from_sql)
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "request": request }))))
}

pub(super) async fn decide_employee_overtime_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(request_id): Path<String>,
    Json(input): Json<DecideEmployeeOvertimeRequestInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    if !["Đã duyệt OT", "Từ chối"].contains(&input.status.as_str()) {
        return Err(ApiError::unprocessable(
            "Kết quả xử lý đơn OT không hợp lệ.",
        ));
    }
    let review_note = input.review_note.trim().to_owned();
    if review_note.chars().count() > 2_000 {
        return Err(ApiError::unprocessable(
            "Ghi chú xử lý vượt quá 2.000 ký tự.",
        ));
    }
    let timestamp = Utc::now().to_rfc3339();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let current: Option<(String, String)> = transaction
        .query_row(
            "SELECT employee_id, status FROM employee_overtime_requests WHERE id = ?1",
            params![request_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some((employee_id, current_status)) = current else {
        return Err(ApiError::not_found("Không tìm thấy đơn đăng ký OT."));
    };
    if employee_id == actor.id {
        return Err(ApiError::forbidden(
            "Không thể tự duyệt đơn OT của chính mình.",
        ));
    }
    if current_status != "Chờ phê duyệt" {
        return Err(ApiError::conflict("Đơn OT đã được xử lý trước đó."));
    }
    let changed = transaction
        .execute(
            "UPDATE employee_overtime_requests \
             SET status = ?1, reviewer_id = ?2, review_note = ?3, reviewed_at = ?4, updated_at = ?4 \
             WHERE id = ?5 AND status = 'Chờ phê duyệt'",
            params![input.status, actor.id, review_note, timestamp, request_id],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::conflict(
            "Đơn OT vừa được xử lý bởi tài khoản khác.",
        ));
    }
    let sequence_no: i64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM employee_overtime_request_events WHERE request_id = ?1",
            params![request_id],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO employee_overtime_request_events \
             (request_id, sequence_no, event_type, actor_id, from_status, to_status, note, created_at) \
             VALUES (?1, ?2, 'decision', ?3, ?4, ?5, ?6, ?7)",
            params![request_id, sequence_no, actor.id, current_status, input.status, review_note, timestamp],
        )
        .map_err(ApiError::internal)?;
    let query = format!("{SELECT_REQUEST} WHERE r.id = ?1");
    let request = transaction
        .query_row(
            &query,
            params![request_id],
            employee_overtime_request_from_sql,
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "request": request })))
}

pub(super) async fn list_employee_overtime_request_events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(request_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let owner_id: Option<String> = db
        .query_row(
            "SELECT employee_id FROM employee_overtime_requests WHERE id = ?1",
            params![request_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(owner_id) = owner_id else {
        return Err(ApiError::not_found("Không tìm thấy đơn đăng ký OT."));
    };
    if actor.role != ADMIN_ROLE && actor.id != owner_id {
        return Err(ApiError::forbidden(
            "Bạn không có quyền xem lịch sử đơn OT này.",
        ));
    }
    let mut statement = db
        .prepare(
            "SELECT e.sequence_no, e.event_type, e.actor_id, u.name, e.from_status, \
                    e.to_status, e.note, e.created_at \
             FROM employee_overtime_request_events e JOIN users u ON u.id = e.actor_id \
             WHERE e.request_id = ?1 ORDER BY e.sequence_no ASC",
        )
        .map_err(ApiError::internal)?;
    let events = statement
        .query_map(params![request_id], |row| {
            Ok(EmployeeOvertimeRequestEvent {
                sequence_no: row.get(0)?,
                event_type: row.get(1)?,
                actor_id: row.get(2)?,
                actor_name: row.get(3)?,
                from_status: row.get(4)?,
                to_status: row.get(5)?,
                note: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": events })))
}

fn employee_overtime_request_from_sql(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<EmployeeOvertimeRequest> {
    Ok(EmployeeOvertimeRequest {
        id: row.get(0)?,
        code: row.get(1)?,
        employee_id: row.get(2)?,
        employee_code: row.get(3)?,
        employee_name: row.get(4)?,
        department: row.get(5)?,
        ot_date: row.get(6)?,
        requested_hours: row.get(7)?,
        day_type: row.get(8)?,
        project: row.get(9)?,
        reason: row.get(10)?,
        status: row.get(11)?,
        reviewer_id: row.get(12)?,
        reviewer_name: row.get(13)?,
        review_note: row.get(14)?,
        reviewed_at: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

fn validate_date(value: &str) -> ApiResult<String> {
    let date = NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable("Ngày OT phải có định dạng YYYY-MM-DD."))?;
    Ok(date.to_string())
}

fn validate_hours(hours: f64) -> ApiResult<f64> {
    let fraction = hours.fract();
    if !hours.is_finite() || hours < 0.5 || (fraction != 0.0 && fraction != 0.5) {
        return Err(ApiError::unprocessable(
            "Số giờ OT phải tối thiểu 0,5 giờ và theo bước 0,5.",
        ));
    }
    Ok(hours)
}

fn validate_day_type(value: String) -> ApiResult<String> {
    let value = value.trim();
    if !DAY_TYPES.contains(&value) {
        return Err(ApiError::unprocessable("Phân loại ngày OT không hợp lệ."));
    }
    Ok(value.to_owned())
}

fn required_text(value: String, label: &str, max_chars: usize) -> ApiResult<String> {
    let value = value.trim();
    let length = value.chars().count();
    if length == 0 || length > max_chars {
        return Err(ApiError::unprocessable(format!(
            "{label} không được để trống và tối đa {max_chars} ký tự."
        )));
    }
    Ok(value.to_owned())
}

pub(super) fn install_schema(db: &rusqlite::Connection) -> Result<(), rusqlite::Error> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS employee_overtime_requests (
           id TEXT PRIMARY KEY,
           code TEXT NOT NULL UNIQUE,
           employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
           employee_code_snapshot TEXT NOT NULL,
           employee_name_snapshot TEXT NOT NULL,
           department_snapshot TEXT NOT NULL,
           ot_date TEXT NOT NULL,
           requested_hours REAL NOT NULL CHECK (
             requested_hours >= 0.5
             AND ABS(requested_hours - CAST(requested_hours AS INTEGER)) IN (0.0, 0.5)
           ),
           day_type TEXT NOT NULL CHECK (day_type IN ('weekday', 'weekend', 'holiday')),
           project TEXT NOT NULL,
           reason TEXT NOT NULL,
           status TEXT NOT NULL DEFAULT 'Chờ phê duyệt'
             CHECK (status IN ('Chờ phê duyệt', 'Đã duyệt OT', 'Từ chối')),
           reviewer_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
           review_note TEXT NOT NULL DEFAULT '',
           reviewed_at TEXT,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL,
           CHECK (length(ot_date) = 10)
         );
         CREATE INDEX IF NOT EXISTS employee_overtime_requests_owner_idx
           ON employee_overtime_requests(employee_id, created_at DESC);
         CREATE INDEX IF NOT EXISTS employee_overtime_requests_status_idx
           ON employee_overtime_requests(status, created_at DESC);
         CREATE TABLE IF NOT EXISTS employee_overtime_request_events (
           request_id TEXT NOT NULL REFERENCES employee_overtime_requests(id) ON DELETE RESTRICT,
           sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
           event_type TEXT NOT NULL CHECK (event_type IN ('submitted', 'decision')),
           actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
           from_status TEXT,
           to_status TEXT NOT NULL,
           note TEXT NOT NULL DEFAULT '',
           created_at TEXT NOT NULL,
           PRIMARY KEY (request_id, sequence_no)
         );
         CREATE TRIGGER IF NOT EXISTS employee_overtime_request_events_no_update
           BEFORE UPDATE ON employee_overtime_request_events
           BEGIN SELECT RAISE(ABORT, 'employee overtime request events are append-only'); END;
         CREATE TRIGGER IF NOT EXISTS employee_overtime_request_events_no_delete
           BEFORE DELETE ON employee_overtime_request_events
           BEGIN SELECT RAISE(ABORT, 'employee overtime request events are append-only'); END;",
    )
}

#[cfg(test)]
mod tests {
    use super::{validate_date, validate_day_type, validate_hours};

    #[test]
    fn overtime_validation_accepts_legacy_day_categories_and_half_hours() {
        assert_eq!(validate_hours(2.5).expect("valid half hour"), 2.5);
        assert_eq!(
            validate_hours(24.5).expect("legacy form has no upper bound"),
            24.5
        );
        assert_eq!(validate_date("2026-10-08").expect("ISO date"), "2026-10-08");
        assert_eq!(
            validate_day_type("weekend".to_owned()).expect("weekend category"),
            "weekend"
        );
    }

    #[test]
    fn overtime_validation_rejects_invalid_hours_date_and_category() {
        assert!(validate_hours(0.25).is_err());
        assert!(validate_hours(1.25).is_err());
        assert!(validate_hours(f64::INFINITY).is_err());
        assert!(validate_date("08-10-2026").is_err());
        assert!(validate_day_type("workday".to_owned()).is_err());
    }
}
