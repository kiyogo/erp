use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use chrono::Utc;
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ADMIN_ROLE, ApiError, ApiResult, AppState, User, authenticated_user, require_admin};

pub(super) async fn list_my_allocations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let employee_code = employee_code(&db, &actor)?;
    let mut statement = db
        .prepare(
            "SELECT record_json FROM collection_records \
             WHERE scope = 'asset_allocations' ORDER BY created_at ASC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let records = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    let allocations = records
        .iter()
        .map(|record| serde_json::from_str::<Value>(record).map_err(ApiError::internal))
        .collect::<ApiResult<Vec<_>>>()?
        .into_iter()
        .filter(|record| allocation_belongs_to(record, &actor, &employee_code))
        .collect::<Vec<_>>();
    Ok(Json(json!({ "data": allocations })))
}

pub(super) async fn acknowledge_receipt(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(allocation_key): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    if actor.role == ADMIN_ROLE {
        return Err(ApiError::forbidden(
            "Only the assigned employee can acknowledge receipt.",
        ));
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let code = employee_code(&transaction, &actor)?;
    let raw_record = transaction
        .query_row(
            "SELECT record_json FROM collection_records \
             WHERE scope = 'asset_allocations' AND record_key = ?1",
            params![allocation_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Asset allocation not found."))?;
    let mut record: Value = serde_json::from_str(&raw_record).map_err(ApiError::internal)?;
    if !allocation_belongs_to(&record, &actor, &code) {
        return Err(ApiError::not_found("Asset allocation not found."));
    }
    let fields = record
        .as_object_mut()
        .ok_or_else(|| ApiError::bad_request("Asset allocation must be an object."))?;
    if fields.get("type").and_then(Value::as_str) != Some("Cấp phát") {
        return Err(ApiError::bad_request(
            "Only an assigned asset handover can be acknowledged here.",
        ));
    }
    if fields.get("status").and_then(Value::as_str) != Some("Chờ nhân viên ký xác nhận")
        || fields
            .get("receivedByAccount")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        || fields
            .get("signedByReceiver")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return Err(ApiError::conflict(
            "Allocation is no longer awaiting an employee receipt acknowledgement.",
        ));
    }

    let previous_status = fields
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let timestamp = Utc::now().to_rfc3339();
    fields.insert("status".to_owned(), json!("Đã bàn giao hoàn tất"));
    fields.insert("receivedByAccount".to_owned(), json!(true));
    fields.insert("receivedAt".to_owned(), json!(timestamp));
    fields.insert("receivedByUserId".to_owned(), json!(actor.id));
    fields.insert("receivedByName".to_owned(), json!(actor.name));
    fields.insert(
        "acknowledgementMethod".to_owned(),
        json!("authenticated_employee_account"),
    );
    // Deliberately do not set legacy signedByReceiver/signedAt: an account
    // acknowledgement is not a digital signature.
    persist_allocation_and_audit(
        &transaction,
        &actor,
        &allocation_key,
        &mut record,
        &previous_status,
        "Đã bàn giao hoàn tất",
        "employee_asset_receipt_acknowledged",
        &timestamp,
    )?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "allocation": record })))
}

pub(super) async fn confirm_return_to_warehouse(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(allocation_key): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let raw_record = transaction
        .query_row(
            "SELECT record_json FROM collection_records \
             WHERE scope = 'asset_allocations' AND record_key = ?1",
            params![allocation_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Asset allocation not found."))?;
    let mut record: Value = serde_json::from_str(&raw_record).map_err(ApiError::internal)?;
    let fields = record
        .as_object_mut()
        .ok_or_else(|| ApiError::bad_request("Asset allocation must be an object."))?;
    if fields.get("type").and_then(Value::as_str) != Some("Thu hồi") {
        return Err(ApiError::bad_request(
            "Only a return record can be received into the warehouse.",
        ));
    }
    if fields.get("status").and_then(Value::as_str) != Some("Chờ xác nhận thu hồi") {
        return Err(ApiError::conflict(
            "Return record is no longer awaiting warehouse receipt.",
        ));
    }
    let previous_status = "Chờ xác nhận thu hồi".to_owned();
    let timestamp = Utc::now().to_rfc3339();
    fields.insert("status".to_owned(), json!("Đã thu hồi về kho"));
    fields.insert("warehouseReceivedAt".to_owned(), json!(timestamp));
    fields.insert("warehouseReceivedByUserId".to_owned(), json!(actor.id));
    fields.insert("warehouseReceivedByName".to_owned(), json!(actor.name));
    persist_allocation_and_audit(
        &transaction,
        &actor,
        &allocation_key,
        &mut record,
        &previous_status,
        "Đã thu hồi về kho",
        "asset_return_received_into_warehouse",
        &timestamp,
    )?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "allocation": record })))
}

fn employee_code(db: &rusqlite::Connection, actor: &User) -> ApiResult<String> {
    let identity = db
        .query_row(
            "SELECT p.employee_code FROM employee_profiles p \
             JOIN users u ON u.id = p.user_id \
             WHERE p.user_id = ?1 AND u.is_active = 1 \
               AND p.employment_status != 'Đã nghỉ việc'",
            params![actor.id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    identity
        .map(|code| code.trim().to_owned())
        .filter(|code| !code.is_empty())
        .ok_or_else(|| {
            ApiError::conflict("Tài khoản chưa liên kết hồ sơ nhân viên đang hoạt động.")
        })
}

fn allocation_belongs_to(record: &Value, actor: &User, employee_code: &str) -> bool {
    let employee_id = record
        .get("employeeId")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty());
    let record_code = record
        .get("employeeCode")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty());
    if employee_id.is_none() && record_code.is_none() {
        return false;
    }
    employee_id.is_none_or(|id| id == actor.id)
        && record_code.is_none_or(|code| code.eq_ignore_ascii_case(employee_code))
        && (employee_id == Some(actor.id.as_str())
            || record_code.is_some_and(|code| code.eq_ignore_ascii_case(employee_code)))
}

#[allow(clippy::too_many_arguments)]
fn persist_allocation_and_audit(
    transaction: &rusqlite::Transaction<'_>,
    actor: &User,
    allocation_key: &str,
    record: &mut Value,
    previous_status: &str,
    next_status: &str,
    action: &str,
    timestamp: &str,
) -> ApiResult<()> {
    if let Some(fields) = record.as_object_mut() {
        fields.insert("updatedAt".to_owned(), json!(timestamp));
    }
    let changed = transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2 \
             WHERE scope = 'asset_allocations' AND record_key = ?3",
            params![record.to_string(), timestamp, allocation_key],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::not_found("Asset allocation not found."));
    }
    let details = json!({
        "fromStatus": previous_status,
        "toStatus": next_status,
        "acknowledgementMethod": record.get("acknowledgementMethod"),
    });
    transaction
        .execute(
            "INSERT INTO audit_events \
             (id, actor_id, action, resource_scope, resource_id, details_json, created_at, actor_name, actor_email) \
             VALUES (?1, ?2, ?3, 'asset_allocations', ?4, ?5, ?6, ?7, ?8)",
            params![
                Uuid::new_v4().to_string(),
                actor.id,
                action,
                allocation_key,
                details.to_string(),
                timestamp,
                actor.name,
                actor.email,
            ],
        )
        .map_err(ApiError::internal)?;
    Ok(())
}
