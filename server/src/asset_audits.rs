use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use chrono::{NaiveDate, Utc};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, User, collection_revision, require_admin};

const SCOPE: &str = "asset_audits";
const IN_PROGRESS: &str = "Đang tiến hành kiểm đếm";
const NEEDS_RECONCILIATION: &str = "Chờ đối soát & Giải trình";
const COMPLETED: &str = "Đã hoàn tất & Khớp 100%";
const SUBMITTED: &str = "Đã trình HĐQT phê duyệt";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateAuditInput {
    audit_code: String,
    audit_name: String,
    audit_type: String,
    scope: String,
    location: String,
    #[serde(default)]
    department: String,
    start_date: String,
    end_date: String,
    auditor_leader: String,
    auditor_members: String,
    #[serde(default)]
    notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct RecordScanInput {
    scan_code: String,
    #[serde(default)]
    damaged: bool,
    #[serde(default)]
    observed_location: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct SubmitResolutionInput {
    proposal: String,
}

#[derive(Debug, Clone)]
struct SnapshotItem {
    asset_key: String,
    code: String,
    barcode: String,
    name: String,
    category: String,
    holder: String,
    location: String,
    department: String,
    original_price: Option<i64>,
    in_scope: bool,
}

pub(super) fn install_schema(db: &Connection) -> rusqlite::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS asset_audit_snapshot_items (
             audit_key TEXT NOT NULL,
             asset_key TEXT NOT NULL,
             code TEXT NOT NULL,
             barcode TEXT NOT NULL,
             name TEXT NOT NULL,
             category TEXT NOT NULL,
             holder TEXT NOT NULL,
             location TEXT NOT NULL,
             department TEXT NOT NULL,
             original_price INTEGER CHECK(original_price IS NULL OR original_price >= 0),
             in_scope INTEGER NOT NULL CHECK(in_scope IN (0,1)),
             PRIMARY KEY(audit_key, asset_key)
         );
         CREATE INDEX IF NOT EXISTS asset_audit_snapshot_lookup_idx
             ON asset_audit_snapshot_items(audit_key, code, barcode);
         CREATE TRIGGER IF NOT EXISTS asset_audit_snapshot_no_update
             BEFORE UPDATE ON asset_audit_snapshot_items
             BEGIN SELECT RAISE(ABORT, 'Asset audit snapshots are immutable'); END;
         CREATE TRIGGER IF NOT EXISTS asset_audit_snapshot_no_delete
             BEFORE DELETE ON asset_audit_snapshot_items
             BEGIN SELECT RAISE(ABORT, 'Asset audit snapshots are immutable'); END;
         CREATE TABLE IF NOT EXISTS asset_audit_scans (
             scan_id INTEGER PRIMARY KEY AUTOINCREMENT,
             audit_key TEXT NOT NULL,
             normalized_code TEXT NOT NULL,
             scan_code TEXT NOT NULL,
             asset_key TEXT,
             code TEXT NOT NULL,
             barcode TEXT NOT NULL,
             name TEXT NOT NULL,
             category TEXT NOT NULL,
             holder TEXT NOT NULL,
             book_location TEXT NOT NULL,
             observed_location TEXT NOT NULL,
             department TEXT NOT NULL,
             original_price INTEGER CHECK(original_price IS NULL OR original_price >= 0),
             audit_status TEXT NOT NULL CHECK(audit_status IN ('Khớp chuẩn','Thừa','Hỏng hóc','Ngoài phạm vi')),
             scanned_by_user_id TEXT NOT NULL,
             scanned_by_name TEXT NOT NULL,
             scanned_at TEXT NOT NULL,
             UNIQUE(audit_key, normalized_code)
         );
         CREATE UNIQUE INDEX IF NOT EXISTS asset_audit_scans_asset_once_idx
             ON asset_audit_scans(audit_key, asset_key) WHERE asset_key IS NOT NULL;
         CREATE INDEX IF NOT EXISTS asset_audit_scans_audit_idx
             ON asset_audit_scans(audit_key, scan_id DESC);
         CREATE TRIGGER IF NOT EXISTS asset_audit_scans_no_update
             BEFORE UPDATE ON asset_audit_scans
             BEGIN SELECT RAISE(ABORT, 'Asset audit scan events are append-only'); END;
         CREATE TRIGGER IF NOT EXISTS asset_audit_scans_no_delete
             BEFORE DELETE ON asset_audit_scans
             BEGIN SELECT RAISE(ABORT, 'Asset audit scan events are append-only'); END;",
    )
}

pub(super) async fn list_audits(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db.transaction().map_err(ApiError::internal)?;
    let raw = {
        let mut statement = transaction
            .prepare(
                "SELECT record_json FROM collection_records WHERE scope = ?1 \
                 ORDER BY created_at DESC, record_key ASC",
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
        .map(|record| {
            let mut value = serde_json::from_str::<Value>(record).map_err(ApiError::internal)?;
            if let Some(object) = value.as_object_mut() {
                object.insert("itemsList".to_owned(), json!([]));
                object.insert("missingItems".to_owned(), json!([]));
            }
            Ok(value)
        })
        .collect::<ApiResult<Vec<_>>>()?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": data, "revision": revision })))
}

pub(super) async fn get_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(audit_key): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db.transaction().map_err(ApiError::internal)?;
    let record = load_audit(&transaction, &audit_key)?;
    let audit = enrich_detail(&transaction, record)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "audit": audit })))
}

pub(super) async fn create_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateAuditInput>,
) -> ApiResult<(axum::http::StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    validate_create(&input)?;
    let timestamp = Utc::now().to_rfc3339();
    let audit_key = format!("asset-audit-{}", Uuid::new_v4());
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    ensure_audit_code_available(&transaction, &input.audit_code)?;
    let source_items = read_inventory(&transaction)?;
    let mut snapshot = Vec::with_capacity(source_items.len());
    let mut book_count = 0_i64;
    let mut book_value = 0_i64;
    let mut unvalued_count = 0_i64;
    for item in source_items {
        let in_scope = matches_filter(&item.location, &input.location, true)
            && matches_department(&item.department, &input.department);
        if in_scope {
            book_count = book_count
                .checked_add(1)
                .ok_or_else(|| ApiError::bad_request("Asset count exceeds supported range."))?;
            if let Some(price) = item.original_price {
                book_value = book_value.checked_add(price).ok_or_else(|| {
                    ApiError::bad_request("Snapshot asset value exceeds supported range.")
                })?;
            } else {
                unvalued_count += 1;
            }
        }
        snapshot.push((item, in_scope));
    }
    if book_count == 0 {
        return Err(ApiError::conflict(
            "Không có tài sản trong danh mục khớp bộ lọc địa điểm/phòng ban. Hãy kiểm tra danh mục hoặc phạm vi.",
        ));
    }
    let record = json!({
        "key": audit_key,
        "auditCode": input.audit_code.trim(),
        "auditName": input.audit_name.trim(),
        "auditType": input.audit_type.trim(),
        "scope": input.scope.trim(),
        "location": input.location.trim(),
        "department": input.department.trim(),
        "startDate": input.start_date.trim(),
        "endDate": input.end_date.trim(),
        "auditorLeader": input.auditor_leader.trim(),
        "auditorMembers": input.auditor_members.trim(),
        "bookCount": book_count,
        "actualCount": 0,
        "matchedCount": 0,
        "surplusCount": 0,
        "missingCount": 0,
        "damagedCount": 0,
        "discrepancy": 0,
        "bookValue": book_value,
        "actualValue": 0,
        "diffValue": 0,
        "unvaluedCount": unvalued_count,
        "actualUnvaluedCount": 0,
        "resolutionProposal": "",
        "status": IN_PROGRESS,
        "notes": input.notes.trim(),
        "itemsList": [],
        "missingItems": [],
        "snapshotVersion": 1,
        "createdAt": timestamp,
        "createdByUserId": actor.id,
        "createdByName": actor.name,
        "closedAt": null,
        "closedByUserId": null,
        "closedByName": null,
        "resolutionSubmittedAt": null,
        "resolutionSubmittedByUserId": null,
        "resolutionSubmittedByName": null
    });
    transaction
        .execute(
            "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) \
             VALUES (?1,?2,?3,?4,?4)",
            params![SCOPE, audit_key, record.to_string(), timestamp],
        )
        .map_err(map_unique_error)?;
    for (item, in_scope) in snapshot {
        transaction
            .execute(
                "INSERT INTO asset_audit_snapshot_items \
                 (audit_key,asset_key,code,barcode,name,category,holder,location,department,original_price,in_scope) \
                 VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
                params![
                    audit_key,
                    item.asset_key,
                    item.code,
                    item.barcode,
                    item.name,
                    item.category,
                    item.holder,
                    item.location,
                    item.department,
                    item.original_price,
                    if in_scope { 1_i64 } else { 0_i64 },
                ],
            )
            .map_err(ApiError::internal)?;
    }
    append_audit(
        &transaction,
        &actor,
        &audit_key,
        "asset_audit_created",
        json!({ "auditCode": input.audit_code.trim(), "bookCount": book_count, "bookValue": book_value }),
        &timestamp,
    )?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "audit": record, "revision": revision })),
    ))
}

pub(super) async fn record_scan(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(audit_key): Path<String>,
    Json(input): Json<RecordScanInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let scan_code = validate_text(&input.scan_code, "scanCode", 128)?;
    let observed_location =
        validate_optional_text(&input.observed_location, "observedLocation", 240)?;
    let normalized_code = scan_code.to_lowercase();
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let mut audit = load_audit(&transaction, &audit_key)?;
    ensure_current_snapshot(&audit)?;
    if string_field(&audit, "status")? != IN_PROGRESS {
        return Err(ApiError::conflict(
            "Đợt kiểm kê đã đóng; không thể ghi thêm mã.",
        ));
    }
    let candidates = find_snapshot_candidates(&transaction, &audit_key, &normalized_code)?;
    if candidates.len() > 1 {
        return Err(ApiError::conflict(
            "Mã này trùng với nhiều tài sản trong snapshot; không thể xác định duy nhất.",
        ));
    }
    let item = candidates.into_iter().next();
    if let Some(item) = &item {
        let scanned: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM asset_audit_scans WHERE audit_key=?1 AND asset_key=?2)",
                params![audit_key, item.asset_key],
                |row| row.get(0),
            )
            .map_err(ApiError::internal)?;
        if scanned {
            return Err(ApiError::conflict(
                "Tài sản này đã được ghi nhận trong đợt kiểm kê.",
            ));
        }
    }
    let in_scope = item.as_ref().is_some_and(|item| item.in_scope);
    let audit_status = match item.as_ref() {
        Some(item) if !item.in_scope => "Ngoài phạm vi",
        Some(_) if input.damaged => "Hỏng hóc",
        Some(_) => "Khớp chuẩn",
        None => "Thừa",
    };
    let (
        asset_key,
        code,
        barcode,
        name,
        category,
        holder,
        book_location,
        department,
        original_price,
    ) = if let Some(item) = item.as_ref() {
        (
            Some(item.asset_key.as_str()),
            item.code.as_str(),
            item.barcode.as_str(),
            item.name.as_str(),
            item.category.as_str(),
            item.holder.as_str(),
            item.location.as_str(),
            item.department.as_str(),
            item.original_price,
        )
    } else {
        (None, scan_code, scan_code, "", "", "", "", "", None)
    };
    transaction
        .execute(
            "INSERT INTO asset_audit_scans \
             (audit_key,normalized_code,scan_code,asset_key,code,barcode,name,category,holder,book_location,observed_location,department,original_price,audit_status,scanned_by_user_id,scanned_by_name,scanned_at) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
            params![
                audit_key,
                normalized_code,
                scan_code,
                asset_key,
                code,
                barcode,
                name,
                category,
                holder,
                book_location,
                observed_location,
                department,
                original_price,
                audit_status,
                actor.id,
                actor.name,
                timestamp,
            ],
        )
        .map_err(map_unique_error)?;
    if in_scope {
        increment_number(&mut audit, "actualCount", 1)?;
        if audit_status == "Khớp chuẩn" {
            increment_number(&mut audit, "matchedCount", 1)?;
        }
        if audit_status == "Hỏng hóc" {
            increment_number(&mut audit, "damagedCount", 1)?;
        }
        if let Some(price) = original_price {
            add_number(&mut audit, "actualValue", price)?;
        } else {
            increment_number(&mut audit, "actualUnvaluedCount", 1)?;
        }
    } else if audit_status == "Thừa" {
        increment_number(&mut audit, "actualCount", 1)?;
        increment_number(&mut audit, "surplusCount", 1)?;
    }
    audit["updatedAt"] = json!(timestamp);
    persist_audit(&transaction, &audit_key, &audit, &timestamp)?;
    append_audit(
        &transaction,
        &actor,
        &audit_key,
        "asset_audit_scan_recorded",
        json!({ "scanCode": scan_code, "auditStatus": audit_status }),
        &timestamp,
    )?;
    let audit = enrich_detail(&transaction, audit)?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "audit": audit, "revision": revision })))
}

pub(super) async fn close_audit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(audit_key): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let mut audit = load_audit(&transaction, &audit_key)?;
    ensure_current_snapshot(&audit)?;
    if string_field(&audit, "status")? != IN_PROGRESS {
        return Err(ApiError::conflict(
            "Đợt kiểm kê không ở trạng thái đang kiểm đếm.",
        ));
    }
    let missing_count: i64 = transaction
        .query_row(
            "SELECT COUNT(*) FROM asset_audit_snapshot_items b \
             WHERE b.audit_key=?1 AND b.in_scope=1 \
               AND NOT EXISTS (SELECT 1 FROM asset_audit_scans s WHERE s.audit_key=b.audit_key AND s.asset_key=b.asset_key)",
            params![audit_key],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    let book_count = integer_field(&audit, "bookCount")?;
    let actual_count = integer_field(&audit, "actualCount")?;
    let surplus_count = integer_field(&audit, "surplusCount")?;
    let damaged_count = integer_field(&audit, "damagedCount")?;
    let discrepancy = actual_count - book_count;
    let actual_value = integer_field(&audit, "actualValue")?;
    let book_value = integer_field(&audit, "bookValue")?;
    set_number(&mut audit, "missingCount", missing_count)?;
    set_number(&mut audit, "discrepancy", discrepancy)?;
    set_number(&mut audit, "diffValue", actual_value - book_value)?;
    audit["status"] =
        json!(
            if missing_count == 0 && surplus_count == 0 && damaged_count == 0 && discrepancy == 0 {
                COMPLETED
            } else {
                NEEDS_RECONCILIATION
            }
        );
    audit["closedAt"] = json!(timestamp);
    audit["closedByUserId"] = json!(actor.id);
    audit["closedByName"] = json!(actor.name);
    audit["updatedAt"] = json!(timestamp);
    persist_audit(&transaction, &audit_key, &audit, &timestamp)?;
    append_audit(
        &transaction,
        &actor,
        &audit_key,
        "asset_audit_closed",
        json!({ "missingCount": missing_count, "surplusCount": surplus_count, "damagedCount": damaged_count, "discrepancy": discrepancy }),
        &timestamp,
    )?;
    let audit = enrich_detail(&transaction, audit)?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "audit": audit, "revision": revision })))
}

pub(super) async fn submit_resolution(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(audit_key): Path<String>,
    Json(input): Json<SubmitResolutionInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let proposal = validate_text(&input.proposal, "proposal", 5_000)?;
    if proposal.len() < 10 {
        return Err(ApiError::bad_request(
            "Phương án giải trình cần ít nhất 10 ký tự.",
        ));
    }
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let mut audit = load_audit(&transaction, &audit_key)?;
    ensure_current_snapshot(&audit)?;
    if string_field(&audit, "status")? != NEEDS_RECONCILIATION {
        return Err(ApiError::conflict(
            "Chỉ đợt đã đóng và có chênh lệch mới được trình phương án giải trình.",
        ));
    }
    audit["status"] = json!(SUBMITTED);
    audit["resolutionProposal"] = json!(proposal);
    audit["resolutionSubmittedAt"] = json!(timestamp);
    audit["resolutionSubmittedByUserId"] = json!(actor.id);
    audit["resolutionSubmittedByName"] = json!(actor.name);
    audit["updatedAt"] = json!(timestamp);
    persist_audit(&transaction, &audit_key, &audit, &timestamp)?;
    append_audit(
        &transaction,
        &actor,
        &audit_key,
        "asset_audit_resolution_submitted",
        json!({ "proposal": proposal }),
        &timestamp,
    )?;
    let audit = enrich_detail(&transaction, audit)?;
    let revision = collection_revision(&transaction, SCOPE)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "audit": audit, "revision": revision })))
}

fn validate_create(input: &CreateAuditInput) -> ApiResult<()> {
    for (name, value, maximum) in [
        ("auditCode", input.audit_code.as_str(), 80),
        ("auditName", input.audit_name.as_str(), 240),
        ("scope", input.scope.as_str(), 160),
        ("location", input.location.as_str(), 240),
        ("auditorLeader", input.auditor_leader.as_str(), 160),
        ("auditorMembers", input.auditor_members.as_str(), 800),
    ] {
        validate_text(value, name, maximum)?;
    }
    validate_optional_text(&input.department, "department", 160)?;
    validate_optional_text(&input.notes, "notes", 2_000)?;
    if ![
        "Định kỳ quý/năm",
        "Đột xuất chuyên đề",
        "Bàn giao quản lý kho",
    ]
    .contains(&input.audit_type.trim())
    {
        return Err(ApiError::bad_request("Loại kiểm kê không được hỗ trợ."));
    }
    let start = NaiveDate::parse_from_str(input.start_date.trim(), "%Y-%m-%d")
        .map_err(|_| ApiError::bad_request("Ngày bắt đầu phải theo YYYY-MM-DD."))?;
    let end = NaiveDate::parse_from_str(input.end_date.trim(), "%Y-%m-%d")
        .map_err(|_| ApiError::bad_request("Ngày kết thúc phải theo YYYY-MM-DD."))?;
    if end < start {
        return Err(ApiError::bad_request(
            "Ngày kết thúc không thể trước ngày bắt đầu.",
        ));
    }
    Ok(())
}

fn validate_text<'a>(value: &'a str, field: &str, maximum: usize) -> ApiResult<&'a str> {
    let value = value.trim();
    if value.is_empty() || value.len() > maximum || value.chars().any(char::is_control) {
        return Err(ApiError::bad_request(format!(
            "Trường {field} bắt buộc và tối đa {maximum} byte."
        )));
    }
    Ok(value)
}

fn validate_optional_text<'a>(value: &'a str, field: &str, maximum: usize) -> ApiResult<&'a str> {
    let value = value.trim();
    if value.len() > maximum || value.chars().any(char::is_control) {
        return Err(ApiError::bad_request(format!(
            "Trường {field} tối đa {maximum} byte."
        )));
    }
    Ok(value)
}

fn read_inventory(transaction: &Transaction<'_>) -> ApiResult<Vec<SnapshotItem>> {
    let raw = {
        let mut statement = transaction
            .prepare(
                "SELECT record_key,record_json FROM collection_records \
                 WHERE scope='asset_items' ORDER BY record_key COLLATE BINARY",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(ApiError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(ApiError::internal)?
    };
    if raw.len() > 10_000 {
        return Err(ApiError::bad_request(
            "Danh mục tài sản vượt giới hạn snapshot 10.000 bản ghi.",
        ));
    }
    raw.into_iter()
        .map(|(asset_key, raw)| {
            let value = serde_json::from_str::<Value>(&raw).map_err(ApiError::internal)?;
            Ok(SnapshotItem {
                asset_key,
                code: text_value(&value, "code").unwrap_or_default().to_owned(),
                barcode: text_value(&value, "barcode").unwrap_or_default().to_owned(),
                name: text_value(&value, "name").unwrap_or_default().to_owned(),
                category: text_value(&value, "category")
                    .unwrap_or_default()
                    .to_owned(),
                holder: text_value(&value, "assignedTo")
                    .unwrap_or_default()
                    .to_owned(),
                location: text_value(&value, "location")
                    .unwrap_or_default()
                    .to_owned(),
                department: text_value(&value, "department")
                    .unwrap_or_default()
                    .to_owned(),
                original_price: parse_amount(value.get("originalPrice")),
                in_scope: false,
            })
        })
        .collect()
}

fn parse_amount(value: Option<&Value>) -> Option<i64> {
    let value = value?;
    if let Some(amount) = value.as_i64() {
        return (amount >= 0).then_some(amount);
    }
    let text = value.as_str()?.trim();
    if text.is_empty() {
        return None;
    }
    if let Ok(amount) = text.parse::<i64>() {
        return (amount >= 0).then_some(amount);
    }
    let groups = text.split(['.', ',']).collect::<Vec<_>>();
    if groups.len() > 1
        && groups[0].chars().all(|ch| ch.is_ascii_digit())
        && groups[1..]
            .iter()
            .all(|group| group.len() == 3 && group.chars().all(|ch| ch.is_ascii_digit()))
    {
        return groups.concat().parse::<i64>().ok();
    }
    None
}

fn matches_filter(value: &str, filter: &str, substring: bool) -> bool {
    let filter = filter.trim();
    if filter.is_empty() || filter == "*" || filter.eq_ignore_ascii_case("tất cả") {
        return true;
    }
    let value = value.trim();
    if substring {
        value.to_lowercase().contains(&filter.to_lowercase())
    } else {
        value.eq_ignore_ascii_case(filter)
    }
}

fn matches_department(value: &str, filter: &str) -> bool {
    let filter = filter.trim();
    if filter.is_empty() || filter == "*" || filter.eq_ignore_ascii_case("tất cả") {
        return true;
    }
    value
        .split(',')
        .any(|part| part.trim().eq_ignore_ascii_case(filter))
}

fn ensure_audit_code_available(transaction: &Transaction<'_>, audit_code: &str) -> ApiResult<()> {
    let codes = {
        let mut statement = transaction
            .prepare("SELECT record_json FROM collection_records WHERE scope=?1")
            .map_err(ApiError::internal)?;
        statement
            .query_map(params![SCOPE], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(ApiError::internal)?
    };
    let expected = audit_code.trim();
    for raw in codes {
        let record: Value = serde_json::from_str(&raw).map_err(ApiError::internal)?;
        if text_value(&record, "auditCode").is_some_and(|code| code.eq_ignore_ascii_case(expected))
        {
            return Err(ApiError::conflict("Mã đợt kiểm kê đã tồn tại."));
        }
    }
    Ok(())
}

fn find_snapshot_candidates(
    transaction: &Transaction<'_>,
    audit_key: &str,
    normalized_code: &str,
) -> ApiResult<Vec<SnapshotItem>> {
    let mut statement = transaction
        .prepare(
            "SELECT asset_key,code,barcode,name,category,holder,location,department,original_price,in_scope \
             FROM asset_audit_snapshot_items WHERE audit_key=?1 \
               AND (lower(trim(code))=?2 OR lower(trim(barcode))=?2 OR lower(asset_key)=?2) \
             ORDER BY asset_key",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![audit_key, normalized_code], |row| {
            Ok(SnapshotItem {
                asset_key: row.get(0)?,
                code: row.get(1)?,
                barcode: row.get(2)?,
                name: row.get(3)?,
                category: row.get(4)?,
                holder: row.get(5)?,
                location: row.get(6)?,
                department: row.get(7)?,
                original_price: row.get(8)?,
                in_scope: row.get::<_, i64>(9)? == 1,
            })
        })
        .map_err(ApiError::internal)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)
}

fn load_audit(transaction: &Transaction<'_>, audit_key: &str) -> ApiResult<Value> {
    let raw = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope=?1 AND record_key=?2",
            params![SCOPE, audit_key],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Asset audit was not found."))?;
    serde_json::from_str(&raw).map_err(ApiError::internal)
}

fn persist_audit(
    transaction: &Transaction<'_>,
    audit_key: &str,
    record: &Value,
    timestamp: &str,
) -> ApiResult<()> {
    let changed = transaction
        .execute(
            "UPDATE collection_records SET record_json=?1,updated_at=?2 \
             WHERE scope=?3 AND record_key=?4",
            params![record.to_string(), timestamp, SCOPE, audit_key],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::not_found("Asset audit was not found."));
    }
    Ok(())
}

fn ensure_current_snapshot(record: &Value) -> ApiResult<()> {
    if record.get("snapshotVersion").and_then(Value::as_i64) != Some(1) {
        return Err(ApiError::conflict(
            "Đợt legacy chưa có snapshot danh mục bất biến; chỉ xem dữ liệu, không thể quét hoặc xử lý ở đây.",
        ));
    }
    Ok(())
}

fn enrich_detail(transaction: &Transaction<'_>, mut record: Value) -> ApiResult<Value> {
    if record.get("snapshotVersion").and_then(Value::as_i64) != Some(1) {
        return Ok(record);
    }
    let audit_key = string_field(&record, "key")?.to_owned();
    let scans = {
        let mut statement = transaction
            .prepare(
                "SELECT code,barcode,name,category,holder,observed_location,book_location,department, \
                        audit_status,scan_code,asset_key,original_price,scanned_at,scanned_by_user_id,scanned_by_name \
                 FROM asset_audit_scans WHERE audit_key=?1 ORDER BY scan_id DESC LIMIT 10000",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map(params![audit_key], |row| {
                Ok(json!({
                    "code": row.get::<_, String>(0)?,
                    "barcode": row.get::<_, String>(1)?,
                    "name": row.get::<_, String>(2)?,
                    "category": row.get::<_, String>(3)?,
                    "holder": row.get::<_, String>(4)?,
                    "location": row.get::<_, String>(5)?,
                    "bookLocation": row.get::<_, String>(6)?,
                    "department": row.get::<_, String>(7)?,
                    "auditStatus": row.get::<_, String>(8)?,
                    "scanCode": row.get::<_, String>(9)?,
                    "assetKey": row.get::<_, Option<String>>(10)?,
                    "originalPrice": row.get::<_, Option<i64>>(11)?,
                    "scannedAt": row.get::<_, String>(12)?,
                    "scannedByUserId": row.get::<_, String>(13)?,
                    "scannedByName": row.get::<_, String>(14)?
                }))
            })
            .map_err(ApiError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(ApiError::internal)?
    };
    let missing_items = if record.get("closedAt").is_some_and(|value| !value.is_null()) {
        let mut statement = transaction
            .prepare(
                "SELECT b.asset_key,b.code,b.barcode,b.name,b.category,b.holder,b.location,b.department,b.original_price \
                 FROM asset_audit_snapshot_items b WHERE b.audit_key=?1 AND b.in_scope=1 \
                   AND NOT EXISTS (SELECT 1 FROM asset_audit_scans s WHERE s.audit_key=b.audit_key AND s.asset_key=b.asset_key) \
                 ORDER BY b.code,b.asset_key LIMIT 10000",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map(params![audit_key], |row| {
                Ok(json!({
                    "assetKey": row.get::<_, String>(0)?,
                    "code": row.get::<_, String>(1)?,
                    "barcode": row.get::<_, String>(2)?,
                    "name": row.get::<_, String>(3)?,
                    "category": row.get::<_, String>(4)?,
                    "holder": row.get::<_, String>(5)?,
                    "location": row.get::<_, String>(6)?,
                    "department": row.get::<_, String>(7)?,
                    "originalPrice": row.get::<_, Option<i64>>(8)?,
                    "auditStatus": "Thiếu hụt"
                }))
            })
            .map_err(ApiError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(ApiError::internal)?
    } else {
        Vec::new()
    };
    record["itemsList"] = json!(scans);
    record["missingItems"] = json!(missing_items);
    Ok(record)
}

fn append_audit(
    transaction: &Transaction<'_>,
    actor: &User,
    audit_key: &str,
    action: &str,
    details: Value,
    timestamp: &str,
) -> ApiResult<()> {
    transaction
        .execute(
            "INSERT INTO audit_events \
             (id,actor_id,action,resource_scope,resource_id,details_json,created_at,actor_name,actor_email) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                Uuid::new_v4().to_string(),
                actor.id,
                action,
                SCOPE,
                audit_key,
                details.to_string(),
                timestamp,
                actor.name,
                actor.email,
            ],
        )
        .map_err(ApiError::internal)?;
    Ok(())
}

fn map_unique_error(error: rusqlite::Error) -> ApiError {
    let message = error.to_string().to_lowercase();
    if message.contains("unique constraint") || message.contains("primary key") {
        ApiError::conflict("Mã tài sản hoặc mã quét đã được ghi nhận trong đợt này.")
    } else {
        ApiError::internal(error)
    }
}

fn text_value<'a>(record: &'a Value, field: &str) -> Option<&'a str> {
    record.get(field).and_then(Value::as_str)
}

fn string_field<'a>(record: &'a Value, field: &str) -> ApiResult<&'a str> {
    text_value(record, field).ok_or_else(|| ApiError::internal(format!("Missing {field}.")))
}

fn integer_field(record: &Value, field: &str) -> ApiResult<i64> {
    record
        .get(field)
        .and_then(Value::as_i64)
        .ok_or_else(|| ApiError::internal(format!("Invalid {field}.")))
}

fn set_number(record: &mut Value, field: &str, value: i64) -> ApiResult<()> {
    let object = record
        .as_object_mut()
        .ok_or_else(|| ApiError::internal("Asset audit record is not an object."))?;
    object.insert(field.to_owned(), json!(value));
    Ok(())
}

fn increment_number(record: &mut Value, field: &str, delta: i64) -> ApiResult<()> {
    let next = integer_field(record, field)?
        .checked_add(delta)
        .ok_or_else(|| ApiError::bad_request("Asset audit count exceeds supported range."))?;
    set_number(record, field, next)
}

fn add_number(record: &mut Value, field: &str, delta: i64) -> ApiResult<()> {
    let next = integer_field(record, field)?
        .checked_add(delta)
        .ok_or_else(|| ApiError::bad_request("Asset audit amount exceeds supported range."))?;
    set_number(record, field, next)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_input() -> CreateAuditInput {
        CreateAuditInput {
            audit_code: "KK-2026-01".to_owned(),
            audit_name: "Kiểm kê thiết bị văn phòng".to_owned(),
            audit_type: "Định kỳ quý/năm".to_owned(),
            scope: "Toàn công ty".to_owned(),
            location: "*".to_owned(),
            department: "".to_owned(),
            start_date: "2026-10-09".to_owned(),
            end_date: "2026-10-10".to_owned(),
            auditor_leader: "Người phụ trách khai báo".to_owned(),
            auditor_members: "Tổ kiểm kê".to_owned(),
            notes: String::new(),
        }
    }

    #[test]
    fn audit_validation_checks_type_date_order_and_text_bounds() {
        assert!(validate_create(&create_input()).is_ok());
        let mut input = create_input();
        input.audit_type = "Tự động duyệt".to_owned();
        assert!(validate_create(&input).is_err());
        let mut input = create_input();
        input.end_date = "2026-10-08".to_owned();
        assert!(validate_create(&input).is_err());
        let mut input = create_input();
        input.audit_code = "  ".to_owned();
        assert!(validate_create(&input).is_err());
    }

    #[test]
    fn audit_filters_use_location_substring_and_department_membership() {
        assert!(matches_filter(
            "Tòa nhà Keangnam - Tầng 12",
            "Keangnam",
            true
        ));
        assert!(matches_filter("TP.HCM", "*", true));
        assert!(matches_department("Kỹ thuật, Vận hành", "Vận hành"));
        assert!(!matches_department("Kỹ thuật", "Vận hành"));
    }

    #[test]
    fn audit_money_parser_accepts_integers_and_vietnamese_grouping_only() {
        assert_eq!(parse_amount(Some(&json!(1_200_000))), Some(1_200_000));
        assert_eq!(parse_amount(Some(&json!("1.200.000"))), Some(1_200_000));
        assert_eq!(parse_amount(Some(&json!("1,200,000"))), Some(1_200_000));
        assert_eq!(parse_amount(Some(&json!("1.25"))), None);
        assert_eq!(parse_amount(Some(&json!(-1))), None);
    }
}
