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

use crate::{ApiError, ApiResult, AppState, User, require_admin};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateTransferInput {
    transfer_code: String,
    asset_code: String,
    asset_name: String,
    #[serde(default)]
    category: String,
    serial_no: String,
    #[serde(default)]
    original_price: Option<i64>,
    #[serde(default)]
    net_book_value: Option<i64>,
    from_location: String,
    #[serde(default)]
    from_department: String,
    from_custodian: String,
    to_location: String,
    #[serde(default)]
    to_department: String,
    to_custodian: String,
    carrier_name: String,
    #[serde(default)]
    tracking_code: String,
    #[serde(default)]
    shipping_cost: i64,
    transfer_date: String,
    expected_delivery_date: String,
    reason: String,
    #[serde(default)]
    condition: String,
    #[serde(default)]
    notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RejectTransferInput {
    reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ReceiveTransferInput {
    condition: String,
}

pub(super) async fn list_transfers(
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
                 WHERE scope = 'asset_transfers' ORDER BY created_at DESC, record_key ASC",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(ApiError::internal)?
    };
    let data = raw
        .iter()
        .map(|record| serde_json::from_str::<Value>(record).map_err(ApiError::internal))
        .collect::<ApiResult<Vec<_>>>()?;
    let revision = crate::collection_revision(&transaction, "asset_transfers")?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": data, "revision": revision })))
}

pub(super) async fn create_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateTransferInput>,
) -> ApiResult<(axum::http::StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    validate_create(&input)?;
    let key = format!("transfer-{}", Uuid::new_v4());
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    ensure_transfer_code_available(&transaction, &input.transfer_code, None)?;
    let record = json!({
        "key": key,
        "transferCode": input.transfer_code.trim(),
        "assetCode": input.asset_code.trim(),
        "assetName": input.asset_name.trim(),
        "category": input.category.trim(),
        "serialNo": input.serial_no.trim(),
        "originalPrice": input.original_price,
        "netBookValue": input.net_book_value,
        "fromLocation": input.from_location.trim(),
        "fromDepartment": input.from_department.trim(),
        "fromCustodian": input.from_custodian.trim(),
        "toLocation": input.to_location.trim(),
        "toDepartment": input.to_department.trim(),
        "toCustodian": input.to_custodian.trim(),
        "carrierName": input.carrier_name.trim(),
        "trackingCode": input.tracking_code.trim(),
        "shippingCost": input.shipping_cost,
        "transferDate": input.transfer_date,
        "expectedDeliveryDate": input.expected_delivery_date,
        "reason": input.reason.trim(),
        "condition": input.condition.trim(),
        "notes": input.notes.trim(),
        "status": "Chờ phê duyệt",
        "createdAt": timestamp,
        "createdByUserId": actor.id,
        "createdByName": actor.name,
        "updatedAt": timestamp,
    });
    insert_transfer(&transaction, &record, &timestamp)?;
    append_audit(
        &transaction,
        &actor,
        record["key"].as_str().unwrap_or_default(),
        "asset_transfer_created",
        json!({ "status": "Chờ phê duyệt", "transferCode": input.transfer_code.trim() }),
        &timestamp,
    )?;
    let revision = crate::collection_revision(&transaction, "asset_transfers")?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "transfer": record, "revision": revision })),
    ))
}

pub(super) async fn approve_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    transition_transfer(
        &state,
        &actor,
        &key,
        "Chờ phê duyệt",
        "Đang vận chuyển",
        "asset_transfer_approved",
        |record, timestamp, actor| {
            record["approvedAt"] = json!(timestamp);
            record["approvedByUserId"] = json!(actor.id);
            record["approvedByName"] = json!(actor.name);
            // Keep the legacy display field but derive it from the authenticated actor.
            record["approver"] = json!(actor.name);
        },
    )
    .await
}

pub(super) async fn reject_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
    Json(input): Json<RejectTransferInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let reason = required_text(&input.reason, "Lý do từ chối", 2_000)?;
    transition_transfer(
        &state,
        &actor,
        &key,
        "Chờ phê duyệt",
        "Từ chối điều chuyển",
        "asset_transfer_rejected",
        move |record, timestamp, actor| {
            record["rejectedAt"] = json!(timestamp);
            record["rejectedByUserId"] = json!(actor.id);
            record["rejectedByName"] = json!(actor.name);
            record["rejectionReason"] = json!(reason);
        },
    )
    .await
}

pub(super) async fn receive_transfer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
    Json(input): Json<ReceiveTransferInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let condition = required_text(&input.condition, "Hiện trạng khi nhận", 2_000)?;
    transition_transfer(
        &state,
        &actor,
        &key,
        "Đang vận chuyển",
        "Đã điều chuyển hoàn tất",
        "asset_transfer_receipt_recorded",
        move |record, timestamp, actor| {
            record["receivedDate"] = json!(timestamp);
            record["receiveCondition"] = json!(condition);
            record["receiptRecordedByUserId"] = json!(actor.id);
            record["receiptRecordedByName"] = json!(actor.name);
            record["receiptMethod"] = json!("authenticated_admin_record");
        },
    )
    .await
}

async fn transition_transfer<F>(
    state: &AppState,
    actor: &User,
    key: &str,
    expected_status: &str,
    next_status: &str,
    audit_action: &str,
    decorate: F,
) -> ApiResult<Json<Value>>
where
    F: FnOnce(&mut Value, &str, &User),
{
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let raw = transaction
        .query_row(
            "SELECT record_json FROM collection_records \
             WHERE scope = 'asset_transfers' AND record_key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Asset transfer not found."))?;
    let mut record: Value = serde_json::from_str(&raw).map_err(ApiError::internal)?;
    if !record.is_object() {
        return Err(ApiError::internal(
            "Stored asset transfer is not a JSON object.",
        ));
    }
    let current_status = record
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if current_status != expected_status {
        return Err(ApiError::conflict(format!(
            "Lệnh đang ở trạng thái '{current_status}', không thể chuyển sang '{next_status}'."
        )));
    }
    record["status"] = json!(next_status);
    record["updatedAt"] = json!(timestamp);
    decorate(&mut record, &timestamp, actor);
    let changed = transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2 \
             WHERE scope = 'asset_transfers' AND record_key = ?3",
            params![record.to_string(), timestamp, key],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::not_found("Asset transfer not found."));
    }
    append_audit(
        &transaction,
        actor,
        key,
        audit_action,
        json!({ "fromStatus": expected_status, "toStatus": next_status }),
        &timestamp,
    )?;
    let revision = crate::collection_revision(&transaction, "asset_transfers")?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "transfer": record, "revision": revision })))
}

fn validate_create(input: &CreateTransferInput) -> ApiResult<()> {
    for (value, label, max) in [
        (&input.transfer_code, "Mã điều chuyển", 80),
        (&input.asset_code, "Mã tài sản", 80),
        (&input.asset_name, "Tên tài sản", 240),
        (&input.serial_no, "Số serial", 120),
        (&input.from_location, "Địa điểm gửi", 240),
        (&input.from_custodian, "Người bàn giao", 160),
        (&input.to_location, "Địa điểm nhận", 240),
        (&input.to_custodian, "Người phụ trách nhận", 160),
        (&input.carrier_name, "Đơn vị vận chuyển", 160),
        (&input.reason, "Lý do điều chuyển", 2_000),
    ] {
        required_text(value, label, max)?;
    }
    for (value, label) in [
        (&input.category, "Phân loại"),
        (&input.from_department, "Phòng ban gửi"),
        (&input.to_department, "Phòng ban nhận"),
        (&input.tracking_code, "Mã vận đơn"),
        (&input.condition, "Hiện trạng xuất kho"),
        (&input.notes, "Ghi chú"),
    ] {
        optional_text(value, label, 2_000)?;
    }
    if input
        .from_location
        .trim()
        .eq_ignore_ascii_case(input.to_location.trim())
    {
        return Err(ApiError::bad_request(
            "Địa điểm gửi và nhận phải khác nhau.",
        ));
    }
    if input.shipping_cost < 0
        || input.original_price.is_some_and(|amount| amount < 0)
        || input.net_book_value.is_some_and(|amount| amount < 0)
    {
        return Err(ApiError::bad_request("Giá trị tiền không được âm."));
    }
    if input
        .net_book_value
        .zip(input.original_price)
        .is_some_and(|(net, original)| net > original)
    {
        return Err(ApiError::bad_request(
            "Giá trị còn lại không được lớn hơn nguyên giá.",
        ));
    }
    let sent = parse_date(&input.transfer_date, "Ngày bắt đầu gửi")?;
    let expected = parse_date(&input.expected_delivery_date, "Ngày dự kiến đến")?;
    if expected < sent {
        return Err(ApiError::bad_request(
            "Ngày dự kiến đến không được trước ngày gửi.",
        ));
    }
    Ok(())
}

fn required_text(value: &str, label: &str, max_chars: usize) -> ApiResult<String> {
    let value = value.trim();
    if value.is_empty() {
        return Err(ApiError::bad_request(format!(
            "{label} không được để trống."
        )));
    }
    if value.chars().count() > max_chars {
        return Err(ApiError::bad_request(format!(
            "{label} vượt quá {max_chars} ký tự."
        )));
    }
    Ok(value.to_owned())
}

fn optional_text(value: &str, label: &str, max_chars: usize) -> ApiResult<()> {
    if value.trim().chars().count() > max_chars {
        return Err(ApiError::bad_request(format!(
            "{label} vượt quá {max_chars} ký tự."
        )));
    }
    Ok(())
}

fn parse_date(value: &str, label: &str) -> ApiResult<NaiveDate> {
    NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map_err(|_| ApiError::bad_request(format!("{label} phải đúng định dạng YYYY-MM-DD.")))
}

fn ensure_transfer_code_available(
    db: &rusqlite::Connection,
    transfer_code: &str,
    except_key: Option<&str>,
) -> ApiResult<()> {
    let exists = db
        .query_row(
            "SELECT 1 FROM collection_records \
             WHERE scope = 'asset_transfers' \
               AND lower(json_extract(record_json, '$.transferCode')) = lower(?1) \
               AND (?2 IS NULL OR record_key != ?2) LIMIT 1",
            params![transfer_code.trim(), except_key],
            |_| Ok(()),
        )
        .optional()
        .map_err(ApiError::internal)?
        .is_some();
    if exists {
        return Err(ApiError::conflict("Mã điều chuyển đã được sử dụng."));
    }
    Ok(())
}

fn insert_transfer(
    transaction: &rusqlite::Transaction<'_>,
    record: &Value,
    timestamp: &str,
) -> ApiResult<()> {
    let key = record
        .get("key")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::internal("Missing transfer key."))?;
    transaction
        .execute(
            "INSERT INTO collection_records \
             (scope, record_key, record_json, created_at, updated_at) \
             VALUES ('asset_transfers', ?1, ?2, ?3, ?3)",
            params![key, record.to_string(), timestamp],
        )
        .map_err(ApiError::internal)?;
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
             VALUES (?1, ?2, ?3, 'asset_transfers', ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                actor.id,
                action,
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

    fn valid_input() -> CreateTransferInput {
        CreateTransferInput {
            transfer_code: " DC-2026-01 ".to_owned(),
            asset_code: " AS-001 ".to_owned(),
            asset_name: "Máy chủ".to_owned(),
            category: String::new(),
            serial_no: "SER-1".to_owned(),
            original_price: None,
            net_book_value: None,
            from_location: "Hà Nội".to_owned(),
            from_department: String::new(),
            from_custodian: "Người gửi".to_owned(),
            to_location: "TP.HCM".to_owned(),
            to_department: String::new(),
            to_custodian: "Người phụ trách".to_owned(),
            carrier_name: "Đơn vị vận chuyển".to_owned(),
            tracking_code: String::new(),
            shipping_cost: 0,
            transfer_date: "2026-10-09".to_owned(),
            expected_delivery_date: "2026-10-10".to_owned(),
            reason: "Phục vụ vận hành".to_owned(),
            condition: String::new(),
            notes: String::new(),
        }
    }

    #[test]
    fn transfer_validation_accepts_unknown_legacy_financial_values() {
        assert!(validate_create(&valid_input()).is_ok());
    }

    #[test]
    fn transfer_validation_rejects_same_location_and_negative_cost() {
        let mut input = valid_input();
        input.to_location = input.from_location.clone();
        assert!(validate_create(&input).is_err());

        let mut input = valid_input();
        input.shipping_cost = -1;
        assert!(validate_create(&input).is_err());
    }

    #[test]
    fn transfer_validation_rejects_invalid_or_reversed_dates_and_values() {
        let mut input = valid_input();
        input.transfer_date = "09/10/2026".to_owned();
        assert!(validate_create(&input).is_err());

        let mut input = valid_input();
        input.expected_delivery_date = "2026-10-08".to_owned();
        assert!(validate_create(&input).is_err());

        let mut input = valid_input();
        input.original_price = Some(10);
        input.net_book_value = Some(11);
        assert!(validate_create(&input).is_err());
    }
}
