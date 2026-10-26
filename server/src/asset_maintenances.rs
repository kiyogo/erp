use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use chrono::{Duration, NaiveDate, Utc};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, User, collection_revision, require_admin};

const SCOPE: &str = "asset_maintenances";
const PLANNED: &str = "Đã lập kế hoạch";
const COMPLETED: &str = "Đã hoàn thành đúng lịch";

const CHECKLIST_ITEMS: [&str; 4] = [
    "Kiểm tra ngoại quan, ốc vít và các điểm tiếp xúc cáp",
    "Vệ sinh bụi bẩn khe thông gió và bộ làm mát",
    "Kiểm tra thông số điện áp, nhiệt độ và công suất tải",
    "Cập nhật bản ghi nhật ký vận hành kỹ thuật",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateMaintenanceInput {
    maint_code: String,
    system_name: String,
    #[serde(default)]
    category: String,
    #[serde(default)]
    asset_codes: String,
    location: String,
    frequency: String,
    maintenance_type: String,
    sla_level: String,
    last_date: String,
    next_date: String,
    responsible_engineer: String,
    #[serde(default)]
    vendor_partner: String,
    #[serde(default)]
    estimated_budget: i64,
    #[serde(default)]
    notes: String,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChecklistTask {
    item: String,
    #[serde(default)]
    done: bool,
    #[serde(default)]
    note: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct PerformMaintenanceInput {
    checklist: Vec<ChecklistTask>,
    health_score: u8,
    actual_cost: i64,
    #[serde(default)]
    notes: String,
}

pub(super) async fn list_maintenances(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db.transaction().map_err(ApiError::internal)?;
    let records = {
        let mut statement = transaction
            .prepare(
                "SELECT record_json FROM collection_records \
                 WHERE scope = ?1 ORDER BY created_at DESC, record_key ASC",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map(params![SCOPE], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(ApiError::internal)?
    };
    let data = records
        .iter()
        .map(|record| serde_json::from_str::<Value>(record).map_err(ApiError::internal))
        .collect::<ApiResult<Vec<_>>>()?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": data, "revision": revision })))
}

pub(super) async fn create_maintenance(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateMaintenanceInput>,
) -> ApiResult<(axum::http::StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    validate_create(&input)?;

    let key = format!("maintenance-{}", Uuid::new_v4());
    let timestamp = Utc::now().to_rfc3339();
    let status = schedule_status(&input.next_date)?;
    let record = json!({
        "key": key,
        "maintCode": input.maint_code.trim(),
        "systemName": input.system_name.trim(),
        "category": input.category.trim(),
        "assetCodes": input.asset_codes.trim(),
        "location": input.location.trim(),
        "frequency": input.frequency.trim(),
        "maintenanceType": input.maintenance_type.trim(),
        "slaLevel": input.sla_level.trim(),
        "lastDate": input.last_date.trim(),
        "nextDate": input.next_date.trim(),
        "responsibleEngineer": input.responsible_engineer.trim(),
        "vendorPartner": input.vendor_partner.trim(),
        "checklist": CHECKLIST_ITEMS.iter().map(|item| json!({ "item": item, "done": false, "note": null })).collect::<Vec<_>>(),
        "estimatedBudget": input.estimated_budget,
        "actualCost": null,
        "status": status,
        "healthScore": null,
        "certificateCode": null,
        "notes": input.notes.trim(),
        "createdAt": timestamp,
        "createdByUserId": actor.id,
        "createdByName": actor.name,
        "updatedAt": timestamp,
    });

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    ensure_code_available(&transaction, input.maint_code.trim())?;
    transaction
        .execute(
            "INSERT INTO collection_records \
             (scope, record_key, record_json, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![SCOPE, key, record.to_string(), timestamp],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                ApiError::conflict("Mã kế hoạch bảo dưỡng đã được sử dụng.")
            } else {
                ApiError::internal(error)
            }
        })?;
    append_audit(
        &transaction,
        &actor,
        &key,
        "asset_maintenance_plan_created",
        json!({ "maintCode": input.maint_code.trim(), "status": status }),
        &timestamp,
    )?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "maintenance": record, "revision": revision })),
    ))
}

pub(super) async fn perform_maintenance(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
    Json(input): Json<PerformMaintenanceInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    validate_performance(&input)?;
    let timestamp = Utc::now();
    let performed_date = timestamp.date_naive();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let raw = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = ?1 AND record_key = ?2",
            params![SCOPE, key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Kế hoạch bảo dưỡng không tồn tại."))?;
    let mut record: Value = serde_json::from_str(&raw).map_err(ApiError::internal)?;
    let expected_checklist = record
        .get("checklist")
        .cloned()
        .and_then(|value| serde_json::from_value::<Vec<ChecklistTask>>(value).ok())
        .ok_or_else(|| ApiError::bad_request("Checklist của kế hoạch không hợp lệ."))?;
    if expected_checklist.len() != input.checklist.len()
        || expected_checklist
            .iter()
            .zip(&input.checklist)
            .any(|(expected, submitted)| expected.item != submitted.item)
    {
        return Err(ApiError::bad_request(
            "Checklist phải khớp chính xác với kế hoạch đã lưu.",
        ));
    }
    if input.checklist.iter().any(|item| !item.done) {
        return Err(ApiError::bad_request(
            "Chỉ có thể xác nhận hoàn thành khi mọi hạng mục checklist đã hoàn tất.",
        ));
    }
    let frequency = record
        .get("frequency")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::bad_request("Tần suất bảo dưỡng của kế hoạch không hợp lệ."))?;
    let next_date = performed_date
        .checked_add_signed(Duration::days(frequency_days(frequency)?))
        .ok_or_else(|| ApiError::bad_request("Ngày bảo dưỡng tiếp theo vượt giới hạn."))?;
    let performed_at = timestamp.to_rfc3339();
    let history_entry = json!({
        "performedAt": performed_at,
        "performedByUserId": actor.id,
        "performedByName": actor.name,
        "verification": "verified",
        "healthScore": input.health_score,
        "actualCost": input.actual_cost,
        "checklist": input.checklist,
        "notes": input.notes.trim(),
    });
    let mut history = match record.get("maintenanceHistory") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items.clone(),
        Some(_) => {
            return Err(ApiError::bad_request(
                "Lịch sử bảo dưỡng hiện có không hợp lệ; cần rà soát dữ liệu trước khi ghi.",
            ));
        }
    };
    if history.len() >= 1_000 {
        return Err(ApiError::bad_request(
            "Kế hoạch đã đạt giới hạn 1.000 lần ghi nhận bảo dưỡng.",
        ));
    }
    history.push(history_entry.clone());
    record["lastDate"] = json!(performed_date.format("%Y-%m-%d").to_string());
    record["nextDate"] = json!(next_date.format("%Y-%m-%d").to_string());
    record["status"] = json!(COMPLETED);
    record["checklist"] = json!(input.checklist);
    record["healthScore"] = json!(input.health_score);
    record["actualCost"] = json!(input.actual_cost);
    record["performedAt"] = json!(performed_at);
    record["performedByUserId"] = json!(actor.id);
    record["performedByName"] = json!(actor.name);
    record["maintenanceHistory"] = json!(history);
    record["latestVerifiedPerformance"] = history_entry;
    record["updatedAt"] = json!(timestamp.to_rfc3339());
    if !input.notes.trim().is_empty() {
        let old_notes = record
            .get("notes")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let separator = if old_notes.trim().is_empty() {
            ""
        } else {
            "\n"
        };
        record["notes"] = json!(format!("{old_notes}{separator}{}", input.notes.trim()));
    }
    if record.to_string().len() > 128 * 1024 {
        return Err(ApiError::bad_request(
            "Bản ghi bảo dưỡng vượt quá giới hạn 128 KiB.",
        ));
    }
    transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2 \
             WHERE scope = ?3 AND record_key = ?4",
            params![record.to_string(), timestamp.to_rfc3339(), SCOPE, key],
        )
        .map_err(ApiError::internal)?;
    append_audit(
        &transaction,
        &actor,
        &key,
        "asset_maintenance_performed",
        json!({
            "maintCode": record.get("maintCode"),
            "healthScore": input.health_score,
            "actualCost": input.actual_cost,
            "checklistCount": input.checklist.len(),
        }),
        &timestamp.to_rfc3339(),
    )?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "maintenance": record, "revision": revision })))
}

fn validate_create(input: &CreateMaintenanceInput) -> ApiResult<()> {
    for (value, label, maximum) in [
        (&input.maint_code, "Mã kế hoạch", 80),
        (&input.system_name, "Tên hệ thống", 240),
        (&input.location, "Vị trí", 240),
        (&input.responsible_engineer, "Kỹ sư phụ trách", 160),
    ] {
        required_text(value, label, maximum)?;
    }
    for (value, label, maximum) in [
        (&input.category, "Chủng loại", 160),
        (&input.asset_codes, "Mã tài sản liên kết", 2_000),
        (&input.maintenance_type, "Loại bảo dưỡng", 160),
        (&input.sla_level, "Cấp độ SLA", 80),
        (&input.vendor_partner, "Đối tác kỹ thuật", 200),
        (&input.notes, "Ghi chú", 4_000),
    ] {
        optional_text(value, label, maximum)?;
    }
    if ![
        "Hàng tháng",
        "Hàng quý (3 tháng)",
        "Định kỳ 6 tháng",
        "Hàng năm",
    ]
    .contains(&input.frequency.trim())
    {
        return Err(ApiError::bad_request("Tần suất bảo dưỡng không hợp lệ."));
    }
    if ![
        "Phòng ngừa định kỳ (PM)",
        "Kiểm định an toàn PCCC & Điện",
        "Nâng cấp bảo trì Firmware / Patch OS",
    ]
    .contains(&input.maintenance_type.trim())
    {
        return Err(ApiError::bad_request("Loại bảo dưỡng không hợp lệ."));
    }
    if !["SLA Platinum (4h)", "SLA Gold (8h)", "SLA Standard (24h)"]
        .contains(&input.sla_level.trim())
    {
        return Err(ApiError::bad_request("Cấp độ SLA không hợp lệ."));
    }
    if input.estimated_budget < 0 {
        return Err(ApiError::bad_request("Dự toán không được âm."));
    }
    let last = parse_date(&input.last_date, "Ngày bảo dưỡng gần nhất")?;
    let next = parse_date(&input.next_date, "Ngày bảo dưỡng tiếp theo")?;
    if next < last {
        return Err(ApiError::bad_request(
            "Ngày bảo dưỡng tiếp theo không được trước ngày gần nhất.",
        ));
    }
    Ok(())
}

fn validate_performance(input: &PerformMaintenanceInput) -> ApiResult<()> {
    if input.health_score > 100 {
        return Err(ApiError::bad_request(
            "Điểm sức khỏe phải trong khoảng 0–100.",
        ));
    }
    if input.actual_cost < 0 {
        return Err(ApiError::bad_request("Chi phí thực tế không được âm."));
    }
    if input.checklist.is_empty() || input.checklist.len() > 100 {
        return Err(ApiError::bad_request(
            "Checklist phải có từ 1 đến 100 hạng mục.",
        ));
    }
    for task in &input.checklist {
        required_text(&task.item, "Hạng mục checklist", 240)?;
        if let Some(note) = task.note.as_deref() {
            optional_text(note, "Ghi chú checklist", 1_000)?;
        }
    }
    optional_text(&input.notes, "Ghi chú thực hiện", 4_000)?;
    Ok(())
}

fn required_text(value: &str, label: &str, maximum: usize) -> ApiResult<()> {
    let value = value.trim();
    if value.is_empty() {
        return Err(ApiError::bad_request(format!(
            "{label} không được để trống."
        )));
    }
    if value.chars().count() > maximum {
        return Err(ApiError::bad_request(format!(
            "{label} vượt quá {maximum} ký tự."
        )));
    }
    Ok(())
}

fn optional_text(value: &str, label: &str, maximum: usize) -> ApiResult<()> {
    if value.trim().chars().count() > maximum {
        return Err(ApiError::bad_request(format!(
            "{label} vượt quá {maximum} ký tự."
        )));
    }
    Ok(())
}

fn parse_date(value: &str, label: &str) -> ApiResult<NaiveDate> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| ApiError::bad_request(format!("{label} phải đúng định dạng YYYY-MM-DD.")))
}

fn frequency_days(frequency: &str) -> ApiResult<i64> {
    match frequency {
        "Hàng tháng" => Ok(30),
        "Hàng quý (3 tháng)" => Ok(90),
        "Định kỳ 6 tháng" => Ok(180),
        "Hàng năm" => Ok(365),
        _ => Err(ApiError::bad_request("Tần suất bảo dưỡng không hợp lệ.")),
    }
}

fn schedule_status(next_date: &str) -> ApiResult<&'static str> {
    let next = parse_date(next_date, "Ngày bảo dưỡng tiếp theo")?;
    let today = Utc::now().date_naive();
    if next < today {
        Ok("Quá hạn bảo dưỡng")
    } else if next <= today + Duration::days(7) {
        Ok("Sắp đến hạn (Trong 7 ngày)")
    } else {
        Ok(PLANNED)
    }
}

fn ensure_code_available(db: &rusqlite::Connection, maint_code: &str) -> ApiResult<()> {
    let exists = db
        .query_row(
            "SELECT 1 FROM collection_records WHERE scope = ?1 \
             AND lower(json_extract(record_json, '$.maintCode')) = lower(?2) LIMIT 1",
            params![SCOPE, maint_code.trim()],
            |_| Ok(()),
        )
        .optional()
        .map_err(ApiError::internal)?
        .is_some();
    if exists {
        return Err(ApiError::conflict("Mã kế hoạch bảo dưỡng đã được sử dụng."));
    }
    Ok(())
}

fn append_audit(
    transaction: &rusqlite::Transaction<'_>,
    actor: &User,
    key: &str,
    action: &str,
    details: Value,
    timestamp: &str,
) -> ApiResult<()> {
    transaction
        .execute(
            "INSERT INTO audit_events \
             (id, actor_id, action, resource_scope, resource_id, details_json, created_at, actor_name, actor_email) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                Uuid::new_v4().to_string(),
                actor.id,
                action,
                SCOPE,
                key,
                details.to_string(),
                timestamp,
                actor.name,
                actor.email,
            ],
        )
        .map_err(ApiError::internal)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_input() -> CreateMaintenanceInput {
        CreateMaintenanceInput {
            maint_code: " BD-2026-01 ".to_owned(),
            system_name: " Máy chủ ứng dụng ".to_owned(),
            category: "Máy chủ & Hạ tầng IDC".to_owned(),
            asset_codes: "AS-01, AS-02".to_owned(),
            location: "Phòng máy chủ".to_owned(),
            frequency: "Hàng quý (3 tháng)".to_owned(),
            maintenance_type: "Phòng ngừa định kỳ (PM)".to_owned(),
            sla_level: "SLA Gold (8h)".to_owned(),
            last_date: "2026-10-01".to_owned(),
            next_date: "2027-01-01".to_owned(),
            responsible_engineer: "Kỹ sư hệ thống".to_owned(),
            vendor_partner: "".to_owned(),
            estimated_budget: 3_500_000,
            notes: String::new(),
        }
    }

    #[test]
    fn maintenance_create_validation_accepts_legacy_form_contract() {
        assert!(validate_create(&valid_input()).is_ok());
    }

    #[test]
    fn maintenance_create_validation_rejects_bad_frequency_dates_money_and_required_text() {
        let mut input = valid_input();
        input.frequency = "Mỗi tuần".to_owned();
        assert!(validate_create(&input).is_err());

        let mut input = valid_input();
        input.next_date = "2026-09-30".to_owned();
        assert!(validate_create(&input).is_err());

        let mut input = valid_input();
        input.estimated_budget = -1;
        assert!(validate_create(&input).is_err());

        let mut input = valid_input();
        input.system_name.clear();
        assert!(validate_create(&input).is_err());
    }

    #[test]
    fn maintenance_status_uses_due_date_without_marking_new_plan_complete() {
        let today = Utc::now().date_naive();
        assert_eq!(
            schedule_status(&(today + Duration::days(30)).format("%Y-%m-%d").to_string()).unwrap(),
            PLANNED
        );
        assert_eq!(
            schedule_status(&(today + Duration::days(3)).format("%Y-%m-%d").to_string()).unwrap(),
            "Sắp đến hạn (Trong 7 ngày)"
        );
        assert_eq!(
            schedule_status(&(today - Duration::days(1)).format("%Y-%m-%d").to_string()).unwrap(),
            "Quá hạn bảo dưỡng"
        );
    }

    #[test]
    fn maintenance_frequency_maps_to_legacy_recurrence_intervals() {
        assert_eq!(frequency_days("Hàng tháng").unwrap(), 30);
        assert_eq!(frequency_days("Hàng quý (3 tháng)").unwrap(), 90);
        assert_eq!(frequency_days("Định kỳ 6 tháng").unwrap(), 180);
        assert_eq!(frequency_days("Hàng năm").unwrap(), 365);
        assert!(frequency_days("Không xác định").is_err());
    }

    #[test]
    fn performance_requires_nonnegative_cost_and_matching_complete_checklist() {
        let input = PerformMaintenanceInput {
            checklist: CHECKLIST_ITEMS
                .iter()
                .map(|item| ChecklistTask {
                    item: (*item).to_owned(),
                    done: true,
                    note: None,
                })
                .collect(),
            health_score: 98,
            actual_cost: 2_000_000,
            notes: "Đã kiểm tra".to_owned(),
        };
        assert!(validate_performance(&input).is_ok());
        assert!(input.checklist.iter().all(|task| task.done));

        let mut incomplete = input;
        incomplete.checklist[0].done = false;
        assert!(incomplete.checklist.iter().any(|task| !task.done));
        let mut negative_cost = valid_performance();
        negative_cost.actual_cost = -1;
        assert!(validate_performance(&negative_cost).is_err());
        let mut out_of_range_score = valid_performance();
        out_of_range_score.health_score = 101;
        assert!(validate_performance(&out_of_range_score).is_err());
        let mut no_checklist = valid_performance();
        no_checklist.checklist.clear();
        assert!(validate_performance(&no_checklist).is_err());
    }

    fn valid_performance() -> PerformMaintenanceInput {
        PerformMaintenanceInput {
            checklist: CHECKLIST_ITEMS
                .iter()
                .map(|item| ChecklistTask {
                    item: (*item).to_owned(),
                    done: true,
                    note: None,
                })
                .collect(),
            health_score: 98,
            actual_cost: 2_000_000,
            notes: String::new(),
        }
    }
}
