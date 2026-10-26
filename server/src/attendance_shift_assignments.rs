use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
};
use chrono::NaiveDate;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ADMIN_ROLE, ApiError, ApiResult, AppState, require_admin};

const SELECT_ASSIGNMENT: &str = "SELECT id, code, employee_id, employee_code_snapshot, \
    employee_name_snapshot, department_snapshot, position_snapshot, shift_key, \
    shift_code_snapshot, shift_name_snapshot, time_range_snapshot, working_hours_snapshot, \
    work_units_snapshot, effective_from, effective_to, status, created_by, created_at, updated_at \
    FROM attendance_shift_assignments";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AttendanceShiftAssignment {
    id: String,
    code: String,
    employee_id: String,
    employee_code: String,
    employee_name: String,
    department: String,
    position: String,
    shift_key: String,
    shift_code: String,
    shift_name: String,
    time_range: String,
    working_hours: f64,
    work_units: f64,
    effective_from: String,
    effective_to: String,
    status: String,
    created_by: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateAttendanceShiftAssignmentInput {
    code: String,
    employee_id: String,
    shift_key: String,
    effective_from: String,
    effective_to: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AttendanceShiftAssignmentEvent {
    sequence_no: i64,
    event_type: String,
    actor_id: String,
    actor_name: String,
    from_status: Option<String>,
    to_status: String,
    note: String,
    created_at: String,
}

pub(super) async fn list_attendance_shift_assignments(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let query =
        format!("{SELECT_ASSIGNMENT} ORDER BY effective_from DESC, created_at DESC, id DESC");
    let mut statement = db.prepare(&query).map_err(ApiError::internal)?;
    let assignments = statement
        .query_map([], attendance_shift_assignment_from_sql)
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": assignments })))
}

pub(super) async fn create_attendance_shift_assignment(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Json(input): Json<CreateAttendanceShiftAssignmentInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let code = validate_code(input.code)?;
    let employee_id = required_text(input.employee_id, "Nhân viên", 160)?;
    let shift_key = required_text(input.shift_key, "Ca làm việc", 160)?;
    let effective_from = validate_date(input.effective_from, "Ngày bắt đầu")?;
    let effective_to = validate_date(input.effective_to, "Ngày kết thúc")?;
    if effective_to < effective_from {
        return Err(ApiError::unprocessable(
            "Ngày kết thúc phân ca không được trước ngày bắt đầu.",
        ));
    }

    let id = Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;

    let employee: Option<(String, String, String, String)> = transaction
        .query_row(
            "SELECT u.name, p.employee_code, p.department, p.position \
             FROM users u JOIN employee_profiles p ON p.user_id = u.id \
             WHERE u.id = ?1 AND u.role != ?2 AND u.is_active = 1 \
               AND p.employment_status != 'Đã nghỉ việc'",
            params![employee_id, ADMIN_ROLE],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some((employee_name, employee_code, department, position)) = employee else {
        return Err(ApiError::conflict(
            "Chỉ có thể phân ca cho tài khoản nhân viên đang hoạt động và đã liên kết hồ sơ HR.",
        ));
    };
    if employee_name.trim().is_empty() || employee_code.trim().is_empty() {
        return Err(ApiError::conflict(
            "Hồ sơ nhân viên chưa có họ tên hoặc mã nhân viên hợp lệ.",
        ));
    }

    let shift_json: Option<String> = transaction
        .query_row(
            "SELECT record_json FROM collection_records \
             WHERE scope = 'attendance_shifts' AND record_key = ?1",
            params![shift_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(shift_json) = shift_json else {
        return Err(ApiError::conflict("Ca làm việc đã chọn không còn tồn tại."));
    };
    let shift: Value = serde_json::from_str(&shift_json).map_err(ApiError::internal)?;
    crate::validate_attendance_shift(&shift)
        .map_err(|_| ApiError::conflict("Danh mục ca được chọn không hợp lệ."))?;
    if shift.get("key").and_then(Value::as_str) != Some(shift_key.as_str()) {
        return Err(ApiError::conflict(
            "Khóa ca trong danh mục không khớp với lịch phân ca.",
        ));
    }
    if shift.get("status").and_then(Value::as_str) != Some("Đang áp dụng") {
        return Err(ApiError::conflict(
            "Chỉ có thể phân công ca đang được áp dụng.",
        ));
    }
    let shift_code = shift_text(&shift, "shiftCode", 64)?;
    let shift_name = shift_text(&shift, "shiftName", 200)?;
    let time_range = shift_text(&shift, "timeRange", 32)?;
    let working_hours = shift_number(&shift, "workingHours")?;
    let work_units = shift_number(&shift, "workUnits")?;

    let duplicate_code: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM attendance_shift_assignments WHERE lower(code) = lower(?1))",
            params![code],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    if duplicate_code {
        return Err(ApiError::conflict("Mã phân ca đã tồn tại."));
    }

    transaction
        .execute(
            "INSERT INTO attendance_shift_assignments \
             (id, code, employee_id, employee_code_snapshot, employee_name_snapshot, \
              department_snapshot, position_snapshot, shift_key, shift_code_snapshot, \
              shift_name_snapshot, time_range_snapshot, working_hours_snapshot, work_units_snapshot, \
              effective_from, effective_to, status, created_by, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, \
                     'Đang áp dụng', ?16, ?17, ?17)",
            params![
                id,
                code,
                employee_id,
                employee_code,
                employee_name,
                department,
                position,
                shift_key,
                shift_code,
                shift_name,
                time_range,
                working_hours,
                work_units,
                effective_from,
                effective_to,
                actor.id,
                timestamp
            ],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                ApiError::conflict("Mã phân ca đã tồn tại.")
            } else {
                ApiError::internal(error)
            }
        })?;
    transaction
        .execute(
            "INSERT INTO attendance_shift_assignment_events \
             (assignment_id, sequence_no, event_type, actor_id, from_status, to_status, note, created_at) \
             VALUES (?1, 1, 'created', ?2, NULL, 'Đang áp dụng', '', ?3)",
            params![id, actor.id, timestamp],
        )
        .map_err(ApiError::internal)?;

    let query = format!("{SELECT_ASSIGNMENT} WHERE id = ?1");
    let assignment = transaction
        .query_row(&query, params![id], attendance_shift_assignment_from_sql)
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "assignment": assignment })),
    ))
}

pub(super) async fn list_attendance_shift_assignment_events(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    Path(assignment_id): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM attendance_shift_assignments WHERE id = ?1)",
            params![assignment_id],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    if !exists {
        return Err(ApiError::not_found("Không tìm thấy lịch phân ca."));
    }
    let mut statement = db
        .prepare(
            "SELECT e.sequence_no, e.event_type, e.actor_id, u.name, e.from_status, \
                    e.to_status, e.note, e.created_at \
             FROM attendance_shift_assignment_events e JOIN users u ON u.id = e.actor_id \
             WHERE e.assignment_id = ?1 ORDER BY e.sequence_no ASC",
        )
        .map_err(ApiError::internal)?;
    let events = statement
        .query_map(params![assignment_id], |row| {
            Ok(AttendanceShiftAssignmentEvent {
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

fn attendance_shift_assignment_from_sql(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<AttendanceShiftAssignment> {
    Ok(AttendanceShiftAssignment {
        id: row.get(0)?,
        code: row.get(1)?,
        employee_id: row.get(2)?,
        employee_code: row.get(3)?,
        employee_name: row.get(4)?,
        department: row.get(5)?,
        position: row.get(6)?,
        shift_key: row.get(7)?,
        shift_code: row.get(8)?,
        shift_name: row.get(9)?,
        time_range: row.get(10)?,
        working_hours: row.get(11)?,
        work_units: row.get(12)?,
        effective_from: row.get(13)?,
        effective_to: row.get(14)?,
        status: row.get(15)?,
        created_by: row.get(16)?,
        created_at: row.get(17)?,
        updated_at: row.get(18)?,
    })
}

fn validate_code(value: String) -> ApiResult<String> {
    let code = required_text(value, "Mã phân ca", 64)?.to_ascii_uppercase();
    if !code
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(ApiError::unprocessable(
            "Mã phân ca chỉ được chứa chữ Latin, số, dấu gạch ngang hoặc gạch dưới.",
        ));
    }
    Ok(code)
}

fn required_text(value: String, label: &str, maximum: usize) -> ApiResult<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > maximum || value.chars().any(char::is_control) {
        return Err(ApiError::unprocessable(format!(
            "{label} không được để trống và tối đa {maximum} ký tự."
        )));
    }
    Ok(value.to_owned())
}

fn validate_date(value: String, label: &str) -> ApiResult<String> {
    let date = NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable(format!("{label} phải có định dạng YYYY-MM-DD.")))?;
    Ok(date.to_string())
}

fn shift_text(record: &Value, field: &str, maximum: usize) -> ApiResult<String> {
    record
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.chars().count() <= maximum)
        .map(ToOwned::to_owned)
        .ok_or_else(|| ApiError::conflict(format!("Thông tin ca {field} không hợp lệ.")))
}

fn shift_number(record: &Value, field: &str) -> ApiResult<f64> {
    record
        .get(field)
        .and_then(Value::as_f64)
        .filter(|value| value.is_finite())
        .ok_or_else(|| ApiError::conflict(format!("Thông tin ca {field} không hợp lệ.")))
}

pub(super) fn install_schema(db: &rusqlite::Connection) -> Result<(), rusqlite::Error> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS attendance_shift_assignments (
           id TEXT PRIMARY KEY,
           code TEXT NOT NULL,
           employee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
           employee_code_snapshot TEXT NOT NULL,
           employee_name_snapshot TEXT NOT NULL,
           department_snapshot TEXT NOT NULL,
           position_snapshot TEXT NOT NULL,
           shift_key TEXT NOT NULL,
           shift_code_snapshot TEXT NOT NULL,
           shift_name_snapshot TEXT NOT NULL,
           time_range_snapshot TEXT NOT NULL,
           working_hours_snapshot REAL NOT NULL CHECK (working_hours_snapshot > 0),
           work_units_snapshot REAL NOT NULL CHECK (work_units_snapshot >= 0),
           effective_from TEXT NOT NULL CHECK (length(effective_from) = 10),
           effective_to TEXT NOT NULL CHECK (length(effective_to) = 10),
           status TEXT NOT NULL DEFAULT 'Đang áp dụng'
             CHECK (status IN ('Đang áp dụng', 'Đã kết thúc')),
           created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
           created_at TEXT NOT NULL,
           updated_at TEXT NOT NULL,
           CHECK (effective_to >= effective_from)
         );
         CREATE UNIQUE INDEX IF NOT EXISTS attendance_shift_assignments_code_lower_idx
           ON attendance_shift_assignments(LOWER(code));
         CREATE INDEX IF NOT EXISTS attendance_shift_assignments_employee_idx
           ON attendance_shift_assignments(employee_id, effective_from DESC);
         CREATE INDEX IF NOT EXISTS attendance_shift_assignments_status_idx
           ON attendance_shift_assignments(status, effective_from DESC);
         CREATE TABLE IF NOT EXISTS attendance_shift_assignment_events (
           assignment_id TEXT NOT NULL REFERENCES attendance_shift_assignments(id) ON DELETE RESTRICT,
           sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
           event_type TEXT NOT NULL CHECK (event_type IN ('created', 'ended')),
           actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
           from_status TEXT,
           to_status TEXT NOT NULL,
           note TEXT NOT NULL DEFAULT '',
           created_at TEXT NOT NULL,
           PRIMARY KEY (assignment_id, sequence_no)
         );
         CREATE TRIGGER IF NOT EXISTS attendance_shift_assignment_events_no_update
           BEFORE UPDATE ON attendance_shift_assignment_events
           BEGIN SELECT RAISE(ABORT, 'attendance shift assignment events are append-only'); END;
         CREATE TRIGGER IF NOT EXISTS attendance_shift_assignment_events_no_delete
           BEFORE DELETE ON attendance_shift_assignment_events
           BEGIN SELECT RAISE(ABORT, 'attendance shift assignment events are append-only'); END;",
    )
}

#[cfg(test)]
mod tests {
    use super::{validate_code, validate_date};

    #[test]
    fn assignment_validation_normalizes_codes_and_dates() {
        assert_eq!(
            validate_code("pc-2026-001".to_owned()).expect("valid assignment code"),
            "PC-2026-001"
        );
        assert_eq!(
            validate_date("2026-10-08".to_owned(), "Ngày bắt đầu").expect("ISO date"),
            "2026-10-08"
        );
    }

    #[test]
    fn assignment_validation_rejects_invalid_code_and_date() {
        assert!(validate_code("PC 001".to_owned()).is_err());
        assert!(validate_date("08/10/2026".to_owned(), "Ngày bắt đầu").is_err());
    }
}
