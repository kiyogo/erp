use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use chrono::{Datelike, NaiveDate, Utc};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, User, collection_revision, require_admin};

const SCOPE: &str = "asset_depreciations";
const ACTIVE: &str = "Đang trích khấu hao";
const PAUSED: &str = "Tạm dừng trích KH";
const COMPLETED: &str = "Đã trích hết 100%";
const DISPOSED: &str = "Đã thanh lý giảm tài sản";
const METHODS: [&str; 3] = [
    "Đường thẳng (Straight-Line VAS TT45)",
    "Số dư giảm dần có điều chỉnh",
    "Theo sản lượng / Công suất",
];
const COST_ACCOUNTS: [&str; 4] = [
    "Nợ 6421 (CP Quản lý CNTT)",
    "Nợ 6422 (CP Vật liệu & CCDC Văn phòng)",
    "Nợ 641 (CP Bán Hàng)",
    "Nợ 627 (CP Sản xuất chung)",
];
const ASSET_ACCOUNTS: [&str; 2] = [
    "Có 2141 (Hao mòn TSCĐ hữu hình)",
    "Có 2143 (Hao mòn TSCĐ vô hình)",
];
const LEGACY_IMPORT_FORMAT: &str = "kiyovn-legacy-asset-depreciations";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct CreateInput {
    asset_code: String,
    asset_name: String,
    category: String,
    department: String,
    cost_account: String,
    asset_account: String,
    depreciation_method: String,
    original_cost: i64,
    #[serde(default)]
    residual_value: i64,
    life_months: u32,
    start_date: String,
    #[serde(default)]
    notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct RunInput {
    period: String,
}

pub(super) fn install_schema(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS asset_depreciation_runs (
            period TEXT PRIMARY KEY CHECK(length(period) = 7),
            run_id TEXT NOT NULL UNIQUE,
            actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            actor_name TEXT NOT NULL,
            posted_at TEXT NOT NULL,
            total_amount INTEGER NOT NULL CHECK(total_amount >= 0),
            entry_count INTEGER NOT NULL CHECK(entry_count > 0),
            entries_json TEXT NOT NULL
        );
        CREATE TRIGGER IF NOT EXISTS asset_depreciation_runs_no_update
          BEFORE UPDATE ON asset_depreciation_runs
          BEGIN SELECT RAISE(ABORT, 'asset depreciation runs are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS asset_depreciation_runs_no_delete
          BEFORE DELETE ON asset_depreciation_runs
          BEGIN SELECT RAISE(ABORT, 'asset depreciation runs are append-only'); END;",
    )
}

pub(super) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db.transaction().map_err(ApiError::internal)?;
    let data = load_records(&transaction)?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": data, "revision": revision })))
}

pub(super) async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    validate_create(&input)?;
    let key = format!("deprec-{}", Uuid::new_v4());
    let timestamp = Utc::now().to_rfc3339();
    let monthly = rounded_monthly(input.original_cost, input.life_months);
    let yearly = monthly.saturating_mul(12);
    let start = parse_date(&input.start_date)?;
    let end = scheduled_end_date(start, input.life_months);
    let record = json!({
        "key": key,
        "assetCode": input.asset_code.trim(),
        "assetName": input.asset_name.trim(),
        "category": input.category.trim(),
        "department": input.department.trim(),
        "costAccount": input.cost_account,
        "assetAccount": input.asset_account,
        "depreciationMethod": input.depreciation_method,
        "originalCost": input.original_cost,
        "residualValue": input.residual_value,
        "lifeMonths": input.life_months,
        "depreciatedMonths": 0,
        "monthlyDeprec": monthly,
        "yearlyDeprec": yearly,
        "accumulatedDeprec": 0,
        "netBookValue": input.original_cost,
        "startDate": start.format("%Y-%m-%d").to_string(),
        "endDate": end,
        "lastRunDate": "Chưa trích",
        "lastRunPeriod": Value::Null,
        "status": ACTIVE,
        "notes": input.notes.trim(),
        "calculationBasis": "legacy_monthly_rounding_from_original_cost",
        "scheduleList": make_schedule(input.original_cost, input.life_months, 0, start),
        "createdAt": timestamp,
        "createdByUserId": actor.id,
        "createdByName": actor.name,
        "updatedAt": timestamp,
    });
    ensure_record_size(&record)?;

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    ensure_asset_code_available(&transaction, input.asset_code.trim(), None)?;
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
            params![SCOPE, key, record.to_string(), timestamp],
        )
        .map_err(ApiError::internal)?;
    append_audit(
        &transaction,
        &actor,
        &key,
        "asset_depreciation_created",
        json!({"assetCode": input.asset_code.trim(), "monthlyDeprec": monthly}),
        &timestamp,
    )?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "depreciation": record, "revision": revision })),
    ))
}

pub(super) async fn toggle_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let mut record = load_record(&transaction, &key)?;
    let status = record
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let next = match status.as_str() {
        ACTIVE => PAUSED,
        PAUSED => ACTIVE,
        COMPLETED | DISPOSED => {
            return Err(ApiError::conflict(
                "Không thể thay đổi trạng thái tài sản đã khấu hao hết hoặc đã thanh lý.",
            ));
        }
        _ => return Err(ApiError::conflict("Trạng thái khấu hao không hợp lệ.")),
    };
    record["status"] = json!(next);
    record["updatedAt"] = json!(timestamp);
    transaction
        .execute(
            "UPDATE collection_records SET record_json=?1, updated_at=?2 WHERE scope=?3 AND record_key=?4",
            params![record.to_string(), timestamp, SCOPE, key],
        )
        .map_err(ApiError::internal)?;
    append_audit(
        &transaction,
        &actor,
        &key,
        "asset_depreciation_status_changed",
        json!({"from": status, "to": next}),
        &timestamp,
    )?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(
        json!({ "depreciation": record, "revision": revision }),
    ))
}

pub(super) async fn run_monthly(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<RunInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    parse_period(&input.period)?;
    let current_period = Utc::now().format("%Y-%m").to_string();
    if input.period > current_period {
        return Err(ApiError::unprocessable(
            "Không thể ghi nhận khấu hao cho kỳ tương lai.",
        ));
    }
    let run_id = Uuid::new_v4().to_string();
    let posted_at = Utc::now().to_rfc3339();
    let posting_date = Utc::now().date_naive().format("%Y-%m-%d").to_string();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    if period_exists(&transaction, &input.period)? {
        return Err(ApiError::conflict(
            "Kỳ khấu hao này đã được ghi nhận; không thể chạy lặp.",
        ));
    }

    let records = load_record_pairs(&transaction)?;
    let mut entries = Vec::new();
    let mut total_amount = 0_i64;
    let mut updated_records = Vec::new();
    for (key, mut record) in records {
        if is_unverified_legacy_import(&record) {
            continue;
        }
        if record.get("status").and_then(Value::as_str) != Some(ACTIVE) {
            continue;
        }
        let original = legacy_integer(record.get("originalCost"));
        let accumulated = legacy_integer(record.get("accumulatedDeprec"));
        let monthly = legacy_integer(record.get("monthlyDeprec"));
        let life = legacy_integer(record.get("lifeMonths"));
        let months_posted = legacy_integer(record.get("depreciatedMonths"));
        let start = record
            .get("startDate")
            .and_then(Value::as_str)
            .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());
        if start.is_none()
            || life <= 0
            || life > 1_200
            || original <= 0
            || accumulated < 0
            || accumulated > original
            || monthly < 0
            || months_posted < 0
            || months_posted >= life
        {
            continue;
        }
        let remaining = original.saturating_sub(accumulated).max(0);
        let amount = monthly.min(remaining);
        if amount < 0 {
            continue;
        }
        let next_months = months_posted.saturating_add(1);
        let next_accumulated = accumulated.saturating_add(amount).min(original);
        let next_status = if next_months >= life || next_accumulated >= original {
            COMPLETED
        } else {
            ACTIVE
        };
        let start = start.expect("eligible start date checked above");
        let schedule = make_schedule(original, life as u32, next_months as u32, start);
        let entry = json!({
            "assetKey": key,
            "assetCode": record.get("assetCode").cloned().unwrap_or(Value::Null),
            "assetName": record.get("assetName").cloned().unwrap_or(Value::Null),
            "department": record.get("department").cloned().unwrap_or(Value::Null),
            "debitAccount": record.get("costAccount").cloned().unwrap_or(Value::Null),
            "creditAccount": record.get("assetAccount").cloned().unwrap_or(Value::Null),
            "amount": amount,
            "period": input.period,
            "verification": "server_recorded_subledger",
        });
        total_amount = total_amount
            .checked_add(amount)
            .ok_or_else(|| ApiError::unprocessable("Tổng khấu hao kỳ vượt giới hạn số tiền."))?;
        entries.push(entry);
        record["depreciatedMonths"] = json!(next_months);
        record["accumulatedDeprec"] = json!(next_accumulated);
        record["netBookValue"] = json!(original.saturating_sub(next_accumulated).max(0));
        record["lastRunDate"] = json!(posting_date);
        record["lastRunPeriod"] = json!(input.period);
        record["status"] = json!(next_status);
        record["scheduleList"] = json!(schedule);
        record["updatedAt"] = json!(posted_at);
        ensure_record_size(&record)?;
        updated_records.push((key, record));
    }
    if entries.is_empty() {
        return Err(ApiError::conflict(
            "Không có tài sản đang khấu hao đủ điều kiện cho kỳ này; không tạo bút toán rỗng.",
        ));
    }
    for (key, record) in &updated_records {
        transaction
            .execute(
                "UPDATE collection_records SET record_json=?1, updated_at=?2 WHERE scope=?3 AND record_key=?4",
                params![record.to_string(), posted_at, SCOPE, key],
            )
            .map_err(ApiError::internal)?;
    }
    transaction
        .execute(
            "INSERT INTO asset_depreciation_runs (period, run_id, actor_user_id, actor_name, posted_at, total_amount, entry_count, entries_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![input.period, run_id, actor.id, actor.name, posted_at, total_amount, entries.len(), Value::Array(entries.clone()).to_string()],
        )
        .map_err(|error| {
            if error.sqlite_error_code() == Some(rusqlite::ErrorCode::ConstraintViolation) {
                ApiError::conflict("Kỳ khấu hao vừa được ghi nhận bởi người dùng khác.")
            } else {
                ApiError::internal(error)
            }
        })?;
    append_audit(
        &transaction,
        &actor,
        &input.period,
        "asset_depreciation_period_recorded",
        json!({"runId":run_id,"entryCount":entries.len(),"totalAmount":total_amount,"ledger":"asset_depreciation_subledger"}),
        &posted_at,
    )?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({
            "run": {
                "runId":run_id,
                "period":input.period,
                "postedAt":posted_at,
                "actorUserId":actor.id,
                "actorName":actor.name,
                "entryCount":entries.len(),
                "totalAmount":total_amount,
                "entries":entries,
                "ledger":"asset_depreciation_subledger",
                "financeGeneralLedgerUpdated":false
            },
            "revision":revision
        })),
    ))
}

fn load_records(db: &Connection) -> ApiResult<Vec<Value>> {
    Ok(load_record_pairs(db)?
        .into_iter()
        .map(|(_, record)| record)
        .collect())
}

fn load_record_pairs(db: &Connection) -> ApiResult<Vec<(String, Value)>> {
    let mut statement = db
        .prepare("SELECT record_key, record_json FROM collection_records WHERE scope=?1 ORDER BY created_at DESC, record_key ASC")
        .map_err(ApiError::internal)?;
    statement
        .query_map(params![SCOPE], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?
        .map(|row| {
            let (key, record) = row.map_err(ApiError::internal)?;
            Ok((
                key,
                serde_json::from_str(&record).map_err(ApiError::internal)?,
            ))
        })
        .collect()
}

fn load_record(db: &Connection, key: &str) -> ApiResult<Value> {
    let raw = db
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope=?1 AND record_key=?2",
            params![SCOPE, key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Depreciation record not found."))?;
    serde_json::from_str(&raw).map_err(ApiError::internal)
}

fn ensure_asset_code_available(
    tx: &Transaction<'_>,
    asset_code: &str,
    exclude_key: Option<&str>,
) -> ApiResult<()> {
    let mut statement = tx
        .prepare("SELECT record_key, record_json FROM collection_records WHERE scope=?1")
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![SCOPE], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?;
    for row in rows {
        let (key, raw) = row.map_err(ApiError::internal)?;
        if exclude_key == Some(key.as_str()) {
            continue;
        }
        let record: Value = serde_json::from_str(&raw).map_err(ApiError::internal)?;
        if record
            .get("assetCode")
            .and_then(Value::as_str)
            .is_some_and(|existing| existing.eq_ignore_ascii_case(asset_code))
        {
            return Err(ApiError::conflict(
                "Tài sản này đã có một cấu hình khấu hao trong danh sách.",
            ));
        }
    }
    Ok(())
}

fn validate_create(input: &CreateInput) -> ApiResult<()> {
    for (value, name, max) in [
        (&input.asset_code, "Mã tài sản", 120),
        (&input.asset_name, "Tên tài sản", 240),
        (&input.category, "Nhóm tài sản", 160),
        (&input.department, "Phòng ban", 160),
    ] {
        if value.trim().is_empty()
            || value.trim().len() > max
            || value.chars().any(char::is_control)
        {
            return Err(ApiError::unprocessable(format!("{name} không hợp lệ.")));
        }
    }
    if !METHODS.contains(&input.depreciation_method.as_str()) {
        return Err(ApiError::unprocessable(
            "Phương pháp khấu hao không hợp lệ.",
        ));
    }
    if !COST_ACCOUNTS.contains(&input.cost_account.as_str()) {
        return Err(ApiError::unprocessable(
            "Tài khoản chi phí khấu hao không hợp lệ.",
        ));
    }
    if !ASSET_ACCOUNTS.contains(&input.asset_account.as_str()) {
        return Err(ApiError::unprocessable("Tài khoản hao mòn không hợp lệ."));
    }
    if input.original_cost <= 0
        || input.residual_value < 0
        || input.residual_value > input.original_cost
    {
        return Err(ApiError::unprocessable(
            "Nguyên giá hoặc giá trị thanh lý ước tính không hợp lệ.",
        ));
    }
    if !(1..=120).contains(&input.life_months) {
        return Err(ApiError::unprocessable(
            "Thời gian trích khấu hao phải từ 1 đến 120 tháng.",
        ));
    }
    parse_date(&input.start_date)?;
    if input.notes.len() > 8_000 || input.notes.chars().any(char::is_control) {
        return Err(ApiError::unprocessable("Ghi chú khấu hao không hợp lệ."));
    }
    Ok(())
}

fn parse_date(value: &str) -> ApiResult<NaiveDate> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable("Ngày bắt đầu phải có định dạng YYYY-MM-DD."))
}

fn parse_period(value: &str) -> ApiResult<NaiveDate> {
    let date = NaiveDate::parse_from_str(&format!("{value}-01"), "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable("Kỳ khấu hao phải có định dạng YYYY-MM."))?;
    if date.format("%Y-%m").to_string() != value {
        return Err(ApiError::unprocessable(
            "Kỳ khấu hao phải có định dạng YYYY-MM.",
        ));
    }
    Ok(date)
}

fn scheduled_end_date(start: NaiveDate, life_months: u32) -> String {
    let month_index = start.month0() + life_months;
    let year = start.year() + (month_index / 12) as i32;
    let month = month_index % 12 + 1;
    format!("{year}-{month:02}-01")
}

fn rounded_monthly(original: i64, life_months: u32) -> i64 {
    let divisor = i64::from(life_months);
    let quotient = original / divisor;
    let remainder = original % divisor;
    quotient + i64::from(remainder * 2 >= divisor)
}

fn make_schedule(
    original: i64,
    life_months: u32,
    depreciated_months: u32,
    start: NaiveDate,
) -> Vec<Value> {
    let monthly = rounded_monthly(original, life_months);
    (1..=life_months)
        .map(|month_number| {
            let offset = start.month0() + month_number - 1;
            let year = start.year() + (offset / 12) as i32;
            let month = offset % 12 + 1;
            let accumulated = monthly
                .saturating_mul(i64::from(month_number))
                .min(original);
            let month_amount = if month_number == life_months {
                original.saturating_sub(monthly.saturating_mul(i64::from(life_months - 1)))
            } else {
                monthly
            };
            json!({
                "period":format!("{month:02}/{year}"),
                "monthNumber":month_number,
                "monthlyAmount":month_amount,
                "accumulatedAmount":accumulated,
                "remainingAmount":original.saturating_sub(accumulated).max(0),
                "posted":month_number <= depreciated_months
            })
        })
        .collect()
}

fn legacy_integer(value: Option<&Value>) -> i64 {
    match value {
        Some(Value::Number(value)) => value.as_i64().unwrap_or(0),
        Some(Value::String(value)) => value
            .chars()
            .filter(|character| character.is_ascii_digit() || *character == '-')
            .collect::<String>()
            .parse()
            .unwrap_or(0),
        _ => 0,
    }
}

fn ensure_record_size(record: &Value) -> ApiResult<()> {
    if record.to_string().len() > 128 * 1024 {
        return Err(ApiError::unprocessable(
            "Biên bản khấu hao vượt quá giới hạn 128 KiB.",
        ));
    }
    Ok(())
}

fn period_exists(db: &Connection, period: &str) -> ApiResult<bool> {
    db.query_row(
        "SELECT 1 FROM asset_depreciation_runs WHERE period=?1",
        params![period],
        |_| Ok(()),
    )
    .optional()
    .map(|value| value.is_some())
    .map_err(ApiError::internal)
}

fn is_unverified_legacy_import(record: &Value) -> bool {
    record
        .get("_kiyoLegacyImport")
        .and_then(Value::as_object)
        .is_some_and(|marker| {
            marker.get("format").and_then(Value::as_str) == Some(LEGACY_IMPORT_FORMAT)
                && marker.get("verification").and_then(Value::as_str) == Some("unverified")
        })
}

fn append_audit(
    tx: &Transaction<'_>,
    actor: &User,
    resource_id: &str,
    action: &str,
    details: Value,
    at: &str,
) -> ApiResult<()> {
    tx.execute(
        "INSERT INTO audit_events (id, actor_id, action, resource_scope, resource_id, details_json, created_at, actor_name, actor_email) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![Uuid::new_v4().to_string(), actor.id, action, SCOPE, resource_id, details.to_string(), at, actor.name, actor.email],
    )
    .map_err(ApiError::internal)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn straight_line_rounding_and_final_period_reconcile_to_original_cost() {
        let start = NaiveDate::from_ymd_opt(2026, 1, 15).expect("date");
        let rows = make_schedule(100, 3, 0, start);
        assert_eq!(rounded_monthly(100, 3), 33);
        assert_eq!(rows[0]["monthlyAmount"], 33);
        assert_eq!(rows[2]["monthlyAmount"], 34);
        assert_eq!(rows[2]["accumulatedAmount"], 99);
        assert_eq!(rows[2]["period"], "03/2026");
        assert_eq!(scheduled_end_date(start, 36), "2029-01-01");
    }

    #[test]
    fn monthly_rounding_matches_javascript_half_up_and_caps_tiny_costs() {
        assert_eq!(rounded_monthly(5, 2), 3);
        assert_eq!(rounded_monthly(1, 36), 0);
        let start = NaiveDate::from_ymd_opt(2026, 12, 1).expect("date");
        let rows = make_schedule(1, 36, 1, start);
        assert_eq!(rows[0]["period"], "12/2026");
        assert_eq!(rows[1]["period"], "01/2027");
        assert_eq!(rows[35]["monthlyAmount"], 1);
    }

    #[test]
    fn period_and_legacy_money_parsing_fail_closed_on_invalid_dates() {
        assert_eq!(parse_period("2026-09").expect("valid period").month(), 9);
        assert!(parse_period("2026-13").is_err());
        assert_eq!(legacy_integer(Some(&json!("1.234.567"))), 1_234_567);
        assert_eq!(legacy_integer(Some(&json!("-2,500"))), -2_500);
    }

    #[test]
    fn create_validation_keeps_legacy_account_choice_and_month_limit() {
        let input = CreateInput {
            asset_code: "TS-01".to_owned(),
            asset_name: "Máy chủ".to_owned(),
            category: "Máy chủ & Hạ tầng IDC".to_owned(),
            department: "Trung tâm dữ liệu".to_owned(),
            cost_account: "Nợ 6422 (CP Vật liệu & CCDC Văn phòng)".to_owned(),
            asset_account: ASSET_ACCOUNTS[0].to_owned(),
            depreciation_method: METHODS[0].to_owned(),
            original_cost: 100,
            residual_value: 10,
            life_months: 120,
            start_date: "2026-01-01".to_owned(),
            notes: String::new(),
        };
        assert!(validate_create(&input).is_ok());
        let mut over_limit = input;
        over_limit.life_months = 121;
        assert!(validate_create(&over_limit).is_err());
    }
}
