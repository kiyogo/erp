use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use chrono::{NaiveDate, Utc};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, User, collection_revision, require_admin};

const SCOPE: &str = "asset_repairs";
const PENDING: &str = "Chờ duyệt báo giá";
const IN_PROGRESS: &str = "Đang sửa chữa tại hãng";
const COMPLETED: &str = "Đã sửa xong & Bàn giao";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateRepairInput {
    repair_code: String,
    asset_code: String,
    asset_name: String,
    #[serde(default)]
    category: String,
    serial_no: String,
    requester: String,
    department: String,
    severity: String,
    repair_unit: String,
    vendor: String,
    #[serde(default)]
    vendor_contact: String,
    issue_description: String,
    #[serde(default)]
    root_cause: String,
    #[serde(default)]
    solution: String,
    #[serde(default)]
    replaced_parts: String,
    estimated_cost: i64,
    #[serde(default)]
    cost_bearing: String,
    start_date: String,
    expected_end_date: String,
    #[serde(default)]
    warranty_after_repair: String,
    approver: String,
    #[serde(default)]
    notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CompleteRepairInput {
    actual_cost: i64,
    notes: String,
}

pub(super) async fn list_repairs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db.transaction().map_err(ApiError::internal)?;
    let raw = {
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
    let data = raw
        .iter()
        .map(|record| serde_json::from_str::<Value>(record).map_err(ApiError::internal))
        .collect::<ApiResult<Vec<_>>>()?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": data, "revision": revision })))
}

pub(super) async fn create_repair(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateRepairInput>,
) -> ApiResult<(axum::http::StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    validate_create(&input)?;
    let key = format!("repair-{}", Uuid::new_v4());
    let timestamp = Utc::now().to_rfc3339();
    let record = json!({
        "key": key,
        "repairCode": input.repair_code.trim(),
        "assetCode": input.asset_code.trim(),
        "assetName": input.asset_name.trim(),
        "category": input.category.trim(),
        "serialNo": input.serial_no.trim(),
        "requester": input.requester.trim(),
        "department": input.department.trim(),
        "severity": input.severity.trim(),
        "repairUnit": input.repair_unit.trim(),
        "vendor": input.vendor.trim(),
        "vendorContact": input.vendor_contact.trim(),
        "issueDescription": input.issue_description.trim(),
        "rootCause": input.root_cause.trim(),
        "solution": input.solution.trim(),
        "replacedParts": input.replaced_parts.trim(),
        "estimatedCost": input.estimated_cost,
        "actualCost": 0,
        "costBearing": input.cost_bearing.trim(),
        "startDate": input.start_date.trim(),
        "expectedEndDate": input.expected_end_date.trim(),
        "completedDate": null,
        "warrantyAfterRepair": input.warranty_after_repair.trim(),
        "status": PENDING,
        "approver": input.approver.trim(),
        "approvedAt": null,
        "notes": input.notes.trim(),
        "createdAt": timestamp,
        "createdByUserId": actor.id,
        "createdByName": actor.name,
        "updatedAt": timestamp,
    });
    if record.to_string().len() > 128 * 1024 {
        return Err(ApiError::bad_request(
            "Phiếu sửa chữa vượt quá giới hạn 128 KiB.",
        ));
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    ensure_code_available(&transaction, input.repair_code.trim())?;
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![SCOPE, key, record.to_string(), timestamp],
        )
        .map_err(ApiError::internal)?;
    append_audit(
        &transaction,
        &actor,
        &key,
        "asset_repair_created",
        json!({ "repairCode": input.repair_code.trim(), "assetCode": input.asset_code.trim() }),
        &timestamp,
    )?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "repair": record, "revision": revision })),
    ))
}

pub(super) async fn approve_repair(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
) -> ApiResult<Json<Value>> {
    transition_repair(&state, &headers, &key, RepairTransition::Approve, None).await
}

pub(super) async fn complete_repair(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
    Json(input): Json<CompleteRepairInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    validate_text(&input.notes, "Biên bản nghiệm thu", 4_000, true)?;
    if input.actual_cost < 0 {
        return Err(ApiError::bad_request("Chi phí thực tế không được âm."));
    }
    transition_repair(
        &state,
        &headers,
        &key,
        RepairTransition::Complete,
        Some(input),
    )
    .await
}

#[derive(Clone, Copy)]
enum RepairTransition {
    Approve,
    Complete,
}

async fn transition_repair(
    state: &AppState,
    headers: &HeaderMap,
    key: &str,
    action: RepairTransition,
    completion: Option<CompleteRepairInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(state, headers).await?;
    let timestamp = Utc::now().to_rfc3339();
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
        .ok_or_else(|| ApiError::not_found("Phiếu sửa chữa không tồn tại."))?;
    let mut record: Value = serde_json::from_str(&raw).map_err(ApiError::internal)?;
    match action {
        RepairTransition::Approve => {
            if record.get("status").and_then(Value::as_str) != Some(PENDING) {
                return Err(ApiError::conflict(
                    "Chỉ phiếu đang chờ duyệt báo giá mới được phê duyệt.",
                ));
            }
            record["status"] = json!(IN_PROGRESS);
            record["approvedAt"] = json!(timestamp);
            record["approvedByUserId"] = json!(actor.id);
            record["approvedByName"] = json!(actor.name);
        }
        RepairTransition::Complete => {
            if record.get("status").and_then(Value::as_str) != Some(IN_PROGRESS) {
                return Err(ApiError::conflict(
                    "Chỉ phiếu đang sửa chữa mới được nghiệm thu.",
                ));
            }
            let input =
                completion.ok_or_else(|| ApiError::bad_request("Thiếu dữ liệu nghiệm thu."))?;
            let mut history = match record.get("repairEvents") {
                None | Some(Value::Null) => Vec::new(),
                Some(Value::Array(items)) => items.clone(),
                Some(_) => {
                    return Err(ApiError::bad_request(
                        "Lịch sử phiếu sửa chữa không hợp lệ.",
                    ));
                }
            };
            if history.len() >= 100 {
                return Err(ApiError::bad_request("Phiếu đã đạt giới hạn 100 sự kiện."));
            }
            let event = json!({
                "type": "completed",
                "verification": "verified",
                "actorUserId": actor.id,
                "actorName": actor.name,
                "occurredAt": timestamp,
                "actualCost": input.actual_cost,
                "notes": input.notes.trim(),
            });
            history.push(event.clone());
            record["status"] = json!(COMPLETED);
            record["actualCost"] = json!(input.actual_cost);
            record["completedDate"] = json!(timestamp);
            record["completedByUserId"] = json!(actor.id);
            record["completedByName"] = json!(actor.name);
            record["repairCompletionEvent"] = event;
            record["repairEvents"] = json!(history);
            let old_notes = record
                .get("notes")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let separator = if old_notes.trim().is_empty() {
                ""
            } else {
                "\n"
            };
            record["notes"] = json!(format!(
                "{old_notes}{separator}[Nghiệm thu: {}]",
                input.notes.trim()
            ));
        }
    }
    record["updatedAt"] = json!(timestamp);
    if record.to_string().len() > 128 * 1024 {
        return Err(ApiError::bad_request(
            "Phiếu sửa chữa vượt quá giới hạn 128 KiB.",
        ));
    }
    transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2 \
             WHERE scope = ?3 AND record_key = ?4",
            params![record.to_string(), timestamp, SCOPE, key],
        )
        .map_err(ApiError::internal)?;
    let (audit_action, details) = match action {
        RepairTransition::Approve => (
            "asset_repair_quote_approved",
            json!({ "repairCode": record.get("repairCode"), "estimatedCost": record.get("estimatedCost") }),
        ),
        RepairTransition::Complete => (
            "asset_repair_completed",
            json!({ "repairCode": record.get("repairCode"), "actualCost": record.get("actualCost") }),
        ),
    };
    append_audit(&transaction, &actor, key, audit_action, details, &timestamp)?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "repair": record, "revision": revision })))
}

fn validate_create(input: &CreateRepairInput) -> ApiResult<()> {
    for (value, label, max) in [
        (&input.repair_code, "Mã phiếu sửa", 80),
        (&input.asset_code, "Mã tài sản", 100),
        (&input.asset_name, "Tên tài sản", 240),
        (&input.serial_no, "Số serial", 120),
        (&input.requester, "Người báo hỏng", 160),
        (&input.department, "Phòng ban", 160),
        (&input.vendor, "Đơn vị sửa chữa", 200),
        (&input.issue_description, "Mô tả sự cố", 4_000),
        (&input.approver, "Cán bộ duyệt chi", 160),
    ] {
        validate_text(value, label, max, true)?;
    }
    for (value, label, max) in [
        (&input.category, "Chủng loại", 160),
        (&input.vendor_contact, "Liên hệ nhà cung cấp", 200),
        (&input.root_cause, "Nguyên nhân sơ bộ", 2_000),
        (&input.solution, "Phương án khắc phục", 2_000),
        (&input.replaced_parts, "Linh kiện thay thế", 2_000),
        (&input.cost_bearing, "Nguồn kinh phí", 80),
        (&input.warranty_after_repair, "Bảo hành sau sửa", 240),
        (&input.notes, "Ghi chú", 4_000),
    ] {
        validate_text(value, label, max, false)?;
    }
    if !["Khẩn cấp (P1)", "Cao (P2)", "Trung bình (P3)", "Thấp (P4)"]
        .contains(&input.severity.trim())
    {
        return Err(ApiError::bad_request("Mức độ sự cố không hợp lệ."));
    }
    if ![
        "Nội bộ IT Cty",
        "Trung tâm bảo hành chính hãng",
        "Đơn vị dịch vụ ngoài (3rd Party)",
    ]
    .contains(&input.repair_unit.trim())
    {
        return Err(ApiError::bad_request("Hình thức sửa chữa không hợp lệ."));
    }
    if ![
        "Bảo hành miễn phí hãng",
        "Công ty chi trả",
        "Bảo hiểm chi trả",
        "Cá nhân bồi thường",
    ]
    .contains(&input.cost_bearing.trim())
    {
        return Err(ApiError::bad_request("Nguồn kinh phí không hợp lệ."));
    }
    if input.estimated_cost < 0 {
        return Err(ApiError::bad_request("Chi phí dự toán không được âm."));
    }
    let start = parse_date(&input.start_date, "Ngày gửi máy")?;
    let expected = parse_date(&input.expected_end_date, "Ngày dự kiến hoàn thành")?;
    if expected < start {
        return Err(ApiError::bad_request(
            "Ngày dự kiến hoàn thành không được trước ngày gửi máy.",
        ));
    }
    Ok(())
}

fn parse_date(value: &str, label: &str) -> ApiResult<NaiveDate> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| ApiError::bad_request(format!("{label} phải đúng định dạng YYYY-MM-DD.")))
}

fn validate_text(value: &str, label: &str, max: usize, required: bool) -> ApiResult<()> {
    let value = value.trim();
    if required && value.is_empty() {
        return Err(ApiError::bad_request(format!(
            "{label} không được để trống."
        )));
    }
    if value.chars().count() > max {
        return Err(ApiError::bad_request(format!(
            "{label} vượt quá {max} ký tự."
        )));
    }
    Ok(())
}

fn ensure_code_available(db: &rusqlite::Connection, repair_code: &str) -> ApiResult<()> {
    let exists = db
        .query_row(
            "SELECT 1 FROM collection_records WHERE scope = ?1 \
             AND lower(json_extract(record_json, '$.repairCode')) = lower(?2) LIMIT 1",
            params![SCOPE, repair_code.trim()],
            |_| Ok(()),
        )
        .optional()
        .map_err(ApiError::internal)?
        .is_some();
    if exists {
        return Err(ApiError::conflict("Mã phiếu sửa chữa đã được sử dụng."));
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
                Uuid::new_v4().to_string(), actor.id, action, SCOPE, key,
                details.to_string(), timestamp, actor.name, actor.email,
            ],
        )
        .map_err(ApiError::internal)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_repair_choices_dates_and_money() {
        let valid = CreateRepairInput {
            repair_code: "SC-2026-01".into(),
            asset_code: "IT-01".into(),
            asset_name: "Laptop".into(),
            category: "Máy tính".into(),
            serial_no: "SN-1".into(),
            requester: "Nguyễn An".into(),
            department: "IT".into(),
            severity: "Cao (P2)".into(),
            repair_unit: "Trung tâm bảo hành chính hãng".into(),
            vendor: "Vendor".into(),
            vendor_contact: String::new(),
            issue_description: "Không khởi động".into(),
            root_cause: String::new(),
            solution: String::new(),
            replaced_parts: String::new(),
            estimated_cost: 2_000_000,
            cost_bearing: "Công ty chi trả".into(),
            start_date: "2026-10-01".into(),
            expected_end_date: "2026-10-08".into(),
            warranty_after_repair: String::new(),
            approver: "Quản lý IT".into(),
            notes: String::new(),
        };
        assert!(validate_create(&valid).is_ok());
        let mut invalid = valid;
        invalid.estimated_cost = -1;
        assert!(validate_create(&invalid).is_err());
    }
}
