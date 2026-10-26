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

const SCOPE: &str = "asset_disposals";
const PENDING: &str = "Chờ hội đồng phê duyệt";
const COMPLETED: &str = "Đã thanh lý & Hoàn tất sổ sách";
const METHODS: [&str; 5] = [
    "Bán đấu giá nội bộ CBNV",
    "Bán thanh lý cho đơn vị thu mua ngoài",
    "Tiêu hủy an toàn (Data Wiping / Shredding)",
    "Tặng / Quyên góp từ thiện",
    "Báo mất / Thất lạc do rủi ro",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateDisposalInput {
    disposal_code: String,
    disposal_method: String,
    disposal_date: String,
    asset_code: String,
    asset_name: String,
    #[serde(default)]
    category: String,
    serial_no: String,
    reason: String,
    original_cost: i64,
    accumulated_depreciation: i64,
    #[serde(default)]
    starting_auction_price: i64,
    #[serde(default)]
    actual_disposal_price: i64,
    #[serde(default)]
    disposal_cost: i64,
    buyer_name: String,
    #[serde(default)]
    buyer_phone: String,
    council_leader: String,
    council_members: String,
    #[serde(default)]
    notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct ApproveDisposalInput {
    actual_disposal_price: i64,
    security_data_wipe_certified: bool,
}

pub(super) async fn list_disposals(
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

pub(super) async fn create_disposal(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateDisposalInput>,
) -> ApiResult<(axum::http::StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    validate_create(&input)?;
    let key = format!("disposal-{}", Uuid::new_v4());
    let timestamp = Utc::now().to_rfc3339();
    let net_book_value = input
        .original_cost
        .saturating_sub(input.accumulated_depreciation)
        .max(0);
    let net_gain_loss = input
        .actual_disposal_price
        .saturating_sub(input.disposal_cost)
        .saturating_sub(net_book_value);
    let record = json!({
        "key": key,
        "disposalCode": input.disposal_code.trim(),
        "assetCode": input.asset_code.trim(),
        "assetName": input.asset_name.trim(),
        "category": input.category.trim(),
        "serialNo": input.serial_no.trim(),
        "disposalMethod": input.disposal_method.trim(),
        "reason": input.reason.trim(),
        "originalCost": input.original_cost,
        "accumulatedDepreciation": input.accumulated_depreciation,
        "netBookValue": net_book_value,
        "startingAuctionPrice": input.starting_auction_price,
        "actualDisposalPrice": input.actual_disposal_price,
        "disposalCost": input.disposal_cost,
        "netGainLoss": net_gain_loss,
        "disposalDate": input.disposal_date.trim(),
        "buyerName": input.buyer_name.trim(),
        "buyerPhone": input.buyer_phone.trim(),
        "councilLeader": input.council_leader.trim(),
        "councilMembers": input.council_members.trim(),
        "securityDataWipeCertified": false,
        "dataWipeOfficer": "",
        "status": PENDING,
        "notes": input.notes.trim(),
        "createdAt": timestamp,
        "createdByUserId": actor.id,
        "createdByName": actor.name,
        "updatedAt": timestamp,
    });
    if record.to_string().len() > 128 * 1024 {
        return Err(ApiError::bad_request(
            "Biên bản thanh lý vượt quá giới hạn 128 KiB.",
        ));
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    ensure_code_available(&transaction, input.disposal_code.trim())?;
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
        "asset_disposal_created",
        json!({ "disposalCode": input.disposal_code.trim(), "assetCode": input.asset_code.trim() }),
        &timestamp,
    )?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "disposal": record, "revision": revision })),
    ))
}

pub(super) async fn approve_disposal(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(key): Path<String>,
    Json(input): Json<ApproveDisposalInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    if input.actual_disposal_price < 0 {
        return Err(ApiError::bad_request("Giá thanh lý không được âm."));
    }
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
        .ok_or_else(|| ApiError::not_found("Biên bản thanh lý không tồn tại."))?;
    let mut record: Value = serde_json::from_str(&raw).map_err(ApiError::internal)?;
    if record.get("status").and_then(Value::as_str) != Some(PENDING) {
        return Err(ApiError::conflict(
            "Chỉ biên bản đang chờ hội đồng phê duyệt mới được quyết toán.",
        ));
    }
    let net_book_value = json_money(record.get("netBookValue")).unwrap_or_else(|| {
        json_money(record.get("originalCost"))
            .unwrap_or_default()
            .saturating_sub(json_money(record.get("accumulatedDepreciation")).unwrap_or_default())
            .max(0)
    });
    let disposal_cost = json_money(record.get("disposalCost")).unwrap_or_default();
    let net_gain_loss = input
        .actual_disposal_price
        .saturating_sub(disposal_cost)
        .saturating_sub(net_book_value);
    let mut events = match record.get("disposalEvents") {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items.clone(),
        Some(_) => {
            return Err(ApiError::bad_request(
                "Lịch sử biên bản thanh lý không hợp lệ.",
            ));
        }
    };
    if events.len() >= 100 {
        return Err(ApiError::bad_request(
            "Biên bản đã đạt giới hạn 100 sự kiện.",
        ));
    }
    let event = json!({
        "type": "settled",
        "verification": if input.security_data_wipe_certified { "user_attested" } else { "not_attested" },
        "actorUserId": actor.id,
        "actorName": actor.name,
        "occurredAt": timestamp,
        "actualDisposalPrice": input.actual_disposal_price,
        "securityDataWipeCertified": input.security_data_wipe_certified,
    });
    events.push(event.clone());
    record["actualDisposalPrice"] = json!(input.actual_disposal_price);
    record["netGainLoss"] = json!(net_gain_loss);
    record["securityDataWipeCertified"] = json!(input.security_data_wipe_certified);
    if input.security_data_wipe_certified {
        record["dataWipeOfficer"] = json!(actor.name);
    }
    record["status"] = json!(COMPLETED);
    record["approvedAt"] = json!(timestamp);
    record["approvedByUserId"] = json!(actor.id);
    record["approvedByName"] = json!(actor.name);
    record["disposalApprovalEvent"] = event;
    record["disposalEvents"] = json!(events);
    record["updatedAt"] = json!(timestamp);
    if record.to_string().len() > 128 * 1024 {
        return Err(ApiError::bad_request(
            "Biên bản thanh lý vượt quá giới hạn 128 KiB.",
        ));
    }
    transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2 \
             WHERE scope = ?3 AND record_key = ?4",
            params![record.to_string(), timestamp, SCOPE, key],
        )
        .map_err(ApiError::internal)?;
    append_audit(
        &transaction,
        &actor,
        &key,
        "asset_disposal_settled",
        json!({
            "disposalCode": record.get("disposalCode"),
            "actualDisposalPrice": input.actual_disposal_price,
            "securityDataWipeCertified": input.security_data_wipe_certified,
        }),
        &timestamp,
    )?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "disposal": record, "revision": revision })))
}

fn validate_create(input: &CreateDisposalInput) -> ApiResult<()> {
    for (value, label, max) in [
        (&input.disposal_code, "Mã biên bản", 80),
        (&input.asset_code, "Mã tài sản", 100),
        (&input.asset_name, "Tên tài sản", 240),
        (&input.serial_no, "Số serial / tag", 120),
        (&input.reason, "Lý do thanh lý", 4_000),
        (&input.buyer_name, "Bên mua / đơn vị tiếp nhận", 240),
        (&input.council_leader, "Chủ tịch hội đồng", 200),
        (&input.council_members, "Thành viên hội đồng", 2_000),
    ] {
        validate_text(value, label, max, true)?;
    }
    for (value, label, max) in [
        (&input.category, "Chủng loại", 160),
        (&input.buyer_phone, "Số điện thoại bên mua", 60),
        (&input.notes, "Ghi chú", 4_000),
    ] {
        validate_text(value, label, max, false)?;
    }
    if !METHODS.contains(&input.disposal_method.trim()) {
        return Err(ApiError::bad_request("Hình thức thanh lý không hợp lệ."));
    }
    parse_date(&input.disposal_date, "Ngày thực hiện")?;
    for (value, label) in [
        (input.original_cost, "Nguyên giá"),
        (input.accumulated_depreciation, "Khấu hao lũy kế"),
        (input.starting_auction_price, "Giá khởi điểm"),
        (input.actual_disposal_price, "Giá thanh lý"),
        (input.disposal_cost, "Chi phí thanh lý"),
    ] {
        if value < 0 {
            return Err(ApiError::bad_request(format!("{label} không được âm.")));
        }
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

fn json_money(value: Option<&Value>) -> Option<i64> {
    let value = value?;
    if let Some(amount) = value.as_i64() {
        return Some(amount);
    }
    if let Some(amount) = value.as_f64() {
        if amount.is_finite() && amount >= i64::MIN as f64 && amount <= i64::MAX as f64 {
            return Some(amount.round() as i64);
        }
    }
    value.as_str().and_then(|text| {
        text.trim()
            .chars()
            .filter(|character| !matches!(character, '.' | ',' | ' ' | '\u{00a0}'))
            .collect::<String>()
            .parse::<i64>()
            .ok()
    })
}

fn ensure_code_available(db: &rusqlite::Connection, code: &str) -> ApiResult<()> {
    let exists = db
        .query_row(
            "SELECT 1 FROM collection_records WHERE scope = ?1 \
             AND lower(json_extract(record_json, '$.disposalCode')) = lower(?2) LIMIT 1",
            params![SCOPE, code.trim()],
            |_| Ok(()),
        )
        .optional()
        .map_err(ApiError::internal)?
        .is_some();
    if exists {
        return Err(ApiError::conflict("Mã biên bản thanh lý đã được sử dụng."));
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

    fn input() -> CreateDisposalInput {
        CreateDisposalInput {
            disposal_code: "TL-2026-012".into(),
            disposal_method: METHODS[1].into(),
            disposal_date: "2026-10-09".into(),
            asset_code: "TS-PC-08".into(),
            asset_name: "Workstation".into(),
            category: "Máy tính".into(),
            serial_no: "SN-99281".into(),
            reason: "Khấu hao hết".into(),
            original_cost: 30_000_000,
            accumulated_depreciation: 28_000_000,
            starting_auction_price: 3_000_000,
            actual_disposal_price: 3_500_000,
            disposal_cost: 200_000,
            buyer_name: "Đơn vị thu mua".into(),
            buyer_phone: "0900000000".into(),
            council_leader: "Chủ tịch".into(),
            council_members: "Thành viên".into(),
            notes: String::new(),
        }
    }

    #[test]
    fn validates_legacy_disposal_choices_date_and_money() {
        assert!(validate_create(&input()).is_ok());
        let mut invalid = input();
        invalid.disposal_method = "Unknown method".into();
        assert!(validate_create(&invalid).is_err());
        let mut invalid = input();
        invalid.disposal_date = "2026-02-30".into();
        assert!(validate_create(&invalid).is_err());
        let mut invalid = input();
        invalid.accumulated_depreciation = -1;
        assert!(validate_create(&invalid).is_err());
    }
}
