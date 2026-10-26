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
    r.employee_name_snapshot, r.department_snapshot, r.leave_type, r.start_date, r.end_date, \
    r.days, r.reason, r.handover_person, r.contact_phone, r.status, r.reviewer_id, \
    COALESCE(reviewer.name, ''), r.review_note, COALESCE(r.reviewed_at, ''), r.created_at, r.updated_at \
    FROM employee_leave_requests r LEFT JOIN users reviewer ON reviewer.id = r.reviewer_id";

const ALLOWED_LEAVE_TYPES: &[&str] = &[
    "Nghỉ phép năm",
    "Nghỉ ốm",
    "Nghỉ ốm BHXH",
    "Nghỉ kết hôn",
    "Nghỉ thai sản",
    "Nghỉ việc riêng không lương",
    "Nghỉ việc riêng có lương",
    "Nghỉ không lương",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct EmployeeLeaveRequest {
    id: String,
    code: String,
    employee_id: String,
    employee_code: String,
    employee_name: String,
    department: String,
    leave_type: String,
    start_date: String,
    end_date: String,
    days: f64,
    reason: String,
    handover_person: Option<String>,
    contact_phone: Option<String>,
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
pub(super) struct CreateEmployeeLeaveRequestInput {
    leave_type: String,
    start_date: String,
    end_date: String,
    days: f64,
    reason: String,
    #[serde(default)]
    handover_person: Option<String>,
    #[serde(default)]
    contact_phone: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct DecideEmployeeLeaveRequestInput {
    status: String,
    #[serde(default)]
    review_note: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct EmployeeLeaveRequestEvent {
    sequence_no: i64,
    event_type: String,
    actor_id: String,
    actor_name: String,
    from_status: Option<String>,
    to_status: String,
    note: String,
    created_at: String,
}

pub(super) async fn list_employee_leave_requests(
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
            employee_leave_request_from_sql,
        )
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": requests })))
}

pub(super) async fn create_employee_leave_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateEmployeeLeaveRequestInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = authenticated_user(&state, &headers).await?;
    let leave_type = validate_leave_type(input.leave_type)?;
    let (start_date, end_date) = validate_dates(&input.start_date, &input.end_date)?;
    let days = validate_days(input.days)?;
    let reason = required_text(input.reason, "Lý do nghỉ", 4_000)?;
    let handover_person = optional_text(input.handover_person, "Người bàn giao", 200)?;
    let contact_phone = optional_text(input.contact_phone, "Điện thoại liên hệ", 50)?;

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
            let candidate = format!("NP-{date_code}-{}", &suffix[..8]);
            let exists = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM employee_leave_requests WHERE code = ?1)",
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
        .ok_or_else(|| ApiError::internal("Could not generate a unique leave request code."))?;

    transaction
        .execute(
            "INSERT INTO employee_leave_requests \
             (id, code, employee_id, employee_code_snapshot, employee_name_snapshot, department_snapshot, \
              leave_type, start_date, end_date, days, reason, handover_person, contact_phone, status, \
              reviewer_id, review_note, reviewed_at, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'Chờ duyệt', \
                     NULL, '', NULL, ?14, ?14)",
            params![
                id,
                code,
                actor.id,
                employee_code,
                employee_name,
                department,
                leave_type,
                start_date,
                end_date,
                days,
                reason,
                handover_person,
                contact_phone,
                timestamp
            ],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO employee_leave_request_events \
             (request_id, sequence_no, event_type, actor_id, from_status, to_status, note, created_at) \
             VALUES (?1, 1, 'submitted', ?2, NULL, 'Chờ duyệt', '', ?3)",
            params![id, actor.id, timestamp],
        )
        .map_err(ApiError::internal)?;
    let query = format!("{SELECT_REQUEST} WHERE r.id = ?1");
    let request = transaction
        .query_row(&query, params![id], employee_leave_request_from_sql)
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "request": request }))))
}

pub(super) async fn decide_employee_leave_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(request_id): Path<String>,
    Json(input): Json<DecideEmployeeLeaveRequestInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    if !["Đã duyệt", "Từ chối"].contains(&input.status.as_str()) {
        return Err(ApiError::unprocessable("Kết quả phê duyệt không hợp lệ."));
    }
    let review_note = input.review_note.trim().to_owned();
    if review_note.chars().count() > 2_000 {
        return Err(ApiError::unprocessable(
            "Ghi chú phê duyệt vượt quá 2.000 ký tự.",
        ));
    }
    let timestamp = Utc::now().to_rfc3339();

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let current: Option<(String, String)> = transaction
        .query_row(
            "SELECT employee_id, status FROM employee_leave_requests WHERE id = ?1",
            params![request_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some((employee_id, current_status)) = current else {
        return Err(ApiError::not_found("Không tìm thấy đơn nghỉ phép."));
    };
    if employee_id == actor.id {
        return Err(ApiError::forbidden(
            "Không thể tự phê duyệt đơn nghỉ của chính mình.",
        ));
    }
    if current_status != "Chờ duyệt" {
        return Err(ApiError::conflict("Đơn nghỉ phép đã được xử lý trước đó."));
    }
    let changed = transaction
        .execute(
            "UPDATE employee_leave_requests \
             SET status = ?1, reviewer_id = ?2, review_note = ?3, reviewed_at = ?4, updated_at = ?4 \
             WHERE id = ?5 AND status = 'Chờ duyệt'",
            params![input.status, actor.id, review_note, timestamp, request_id],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::conflict(
            "Đơn nghỉ phép vừa được xử lý bởi tài khoản khác.",
        ));
    }
    let sequence_no: i64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM employee_leave_request_events WHERE request_id = ?1",
            params![request_id],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO employee_leave_request_events \
             (request_id, sequence_no, event_type, actor_id, from_status, to_status, note, created_at) \
             VALUES (?1, ?2, 'decision', ?3, ?4, ?5, ?6, ?7)",
            params![request_id, sequence_no, actor.id, current_status, input.status, review_note, timestamp],
        )
        .map_err(ApiError::internal)?;
    let query = format!("{SELECT_REQUEST} WHERE r.id = ?1");
    let request = transaction
        .query_row(&query, params![request_id], employee_leave_request_from_sql)
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "request": request })))
}

pub(super) async fn list_employee_leave_request_events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(request_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let owner_id: Option<String> = db
        .query_row(
            "SELECT employee_id FROM employee_leave_requests WHERE id = ?1",
            params![request_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(owner_id) = owner_id else {
        return Err(ApiError::not_found("Không tìm thấy đơn nghỉ phép."));
    };
    if actor.role != ADMIN_ROLE && actor.id != owner_id {
        return Err(ApiError::forbidden(
            "Bạn không có quyền xem lịch sử đơn nghỉ này.",
        ));
    }
    let mut statement = db
        .prepare(
            "SELECT e.sequence_no, e.event_type, e.actor_id, u.name, e.from_status, \
                    e.to_status, e.note, e.created_at \
             FROM employee_leave_request_events e JOIN users u ON u.id = e.actor_id \
             WHERE e.request_id = ?1 ORDER BY e.sequence_no ASC",
        )
        .map_err(ApiError::internal)?;
    let events = statement
        .query_map(params![request_id], |row| {
            Ok(EmployeeLeaveRequestEvent {
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

fn employee_leave_request_from_sql(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<EmployeeLeaveRequest> {
    Ok(EmployeeLeaveRequest {
        id: row.get(0)?,
        code: row.get(1)?,
        employee_id: row.get(2)?,
        employee_code: row.get(3)?,
        employee_name: row.get(4)?,
        department: row.get(5)?,
        leave_type: row.get(6)?,
        start_date: row.get(7)?,
        end_date: row.get(8)?,
        days: row.get(9)?,
        reason: row.get(10)?,
        handover_person: row.get(11)?,
        contact_phone: row.get(12)?,
        status: row.get(13)?,
        reviewer_id: row.get(14)?,
        reviewer_name: row.get(15)?,
        review_note: row.get(16)?,
        reviewed_at: row.get(17)?,
        created_at: row.get(18)?,
        updated_at: row.get(19)?,
    })
}

fn validate_leave_type(value: String) -> ApiResult<String> {
    let value = value.trim();
    if !ALLOWED_LEAVE_TYPES.contains(&value) {
        return Err(ApiError::unprocessable("Loại nghỉ phép không hợp lệ."));
    }
    Ok(value.to_owned())
}

fn validate_dates(start: &str, end: &str) -> ApiResult<(String, String)> {
    let start_date = NaiveDate::parse_from_str(start.trim(), "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable("Ngày bắt đầu phải có định dạng YYYY-MM-DD."))?;
    let end_date = NaiveDate::parse_from_str(end.trim(), "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable("Ngày kết thúc phải có định dạng YYYY-MM-DD."))?;
    if end_date < start_date {
        return Err(ApiError::unprocessable(
            "Ngày kết thúc không được trước ngày bắt đầu.",
        ));
    }
    Ok((start_date.to_string(), end_date.to_string()))
}

fn validate_days(days: f64) -> ApiResult<f64> {
    if !days.is_finite()
        || !(0.5..=366.0).contains(&days)
        || (days * 2.0 - (days * 2.0).round()).abs() > f64::EPSILON
    {
        return Err(ApiError::unprocessable(
            "Số ngày nghỉ phải từ 0,5 đến 366 và theo bước 0,5.",
        ));
    }
    Ok(days)
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

fn optional_text(
    value: Option<String>,
    label: &str,
    max_chars: usize,
) -> ApiResult<Option<String>> {
    value
        .map(|value| {
            let value = value.trim();
            if value.chars().count() > max_chars {
                return Err(ApiError::unprocessable(format!(
                    "{label} vượt quá {max_chars} ký tự."
                )));
            }
            Ok((!value.is_empty()).then(|| value.to_owned()))
        })
        .transpose()
        .map(Option::flatten)
}

pub(super) fn install_schema(db: &rusqlite::Connection) -> Result<(), rusqlite::Error> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS employee_leave_requests (
           id TEXT PRIMARY KEY,
           code TEXT NOT NULL UNIQUE,
           employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
           employee_code_snapshot TEXT NOT NULL,
           employee_name_snapshot TEXT NOT NULL,
           department_snapshot TEXT NOT NULL,
           leave_type TEXT NOT NULL,
           start_date TEXT NOT NULL,
           end_date TEXT NOT NULL,
           days REAL NOT NULL CHECK (
             days >= 0.5 AND days <= 366.0
             AND ABS(days * 2.0 - ROUND(days * 2.0)) < 0.0000001
           ),
           reason TEXT NOT NULL,
           handover_person TEXT,
           contact_phone TEXT,
           status TEXT NOT NULL DEFAULT 'Chờ duyệt'
             CHECK (status IN ('Chờ duyệt', 'Đã duyệt', 'Từ chối')),
           reviewer_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
           review_note TEXT NOT NULL DEFAULT '',
           reviewed_at TEXT,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL,
           CHECK (end_date >= start_date)
         );
         CREATE INDEX IF NOT EXISTS employee_leave_requests_owner_idx
           ON employee_leave_requests(employee_id, created_at DESC);
         CREATE INDEX IF NOT EXISTS employee_leave_requests_status_idx
           ON employee_leave_requests(status, created_at DESC);
         CREATE TABLE IF NOT EXISTS employee_leave_request_events (
           request_id TEXT NOT NULL REFERENCES employee_leave_requests(id) ON DELETE RESTRICT,
           sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
           event_type TEXT NOT NULL CHECK (event_type IN ('submitted', 'decision')),
           actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
           from_status TEXT,
           to_status TEXT NOT NULL,
           note TEXT NOT NULL DEFAULT '',
           created_at TEXT NOT NULL,
           PRIMARY KEY (request_id, sequence_no)
         );
         CREATE TRIGGER IF NOT EXISTS employee_leave_request_events_no_update
           BEFORE UPDATE ON employee_leave_request_events
           BEGIN SELECT RAISE(ABORT, 'employee leave request events are append-only'); END;
         CREATE TRIGGER IF NOT EXISTS employee_leave_request_events_no_delete
           BEFORE DELETE ON employee_leave_request_events
           BEGIN SELECT RAISE(ABORT, 'employee leave request events are append-only'); END;",
    )
}

#[cfg(test)]
mod tests {
    use super::{validate_dates, validate_days, validate_leave_type};

    #[test]
    fn leave_validation_accepts_supported_half_day_ranges() {
        assert_eq!(validate_days(0.5).expect("half day"), 0.5);
        assert_eq!(
            validate_dates("2026-10-08", "2026-10-10").expect("valid range"),
            ("2026-10-08".to_owned(), "2026-10-10".to_owned())
        );
        assert_eq!(
            validate_leave_type(" Nghỉ phép năm ".to_owned()).expect("supported type"),
            "Nghỉ phép năm"
        );
    }

    #[test]
    fn leave_validation_rejects_invalid_range_fraction_and_type() {
        assert!(validate_days(0.75).is_err());
        assert!(validate_days(f64::NAN).is_err());
        assert!(validate_dates("2026-10-11", "2026-10-10").is_err());
        assert!(validate_dates("10/10/2026", "2026-10-10").is_err());
        assert!(validate_leave_type("Khác".to_owned()).is_err());
    }
}
