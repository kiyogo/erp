use axum::{Json, body::Bytes, extract::State, http::StatusCode};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, User, collection_revision, record_key, require_admin};

const FORMAT: &str = "kiyovn-legacy-asset-depreciations";
const VERSION: u32 = 1;
const SCOPE: &str = "asset_depreciations";
const MARKER: &str = "_kiyoLegacyImport";
const MAX_RECORDS: usize = 10_000;
const MAX_BODY: usize = 8 * 1024 * 1024;
const MAX_RECORD: usize = 128 * 1024;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Bundle {
    format: String,
    schema_version: u32,
    source_mode: String,
    batch_id: String,
    source_origin: String,
    exported_at: String,
    records: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviewRequest {
    bundle: Bundle,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ApplyRequest {
    bundle: Bundle,
    expected_payload_sha256: String,
    confirmation: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Preview {
    batch_id: String,
    source_mode: String,
    payload_sha256: String,
    confirmation_phrase: String,
    source_records: usize,
    target_records: usize,
    importable_records: usize,
    already_imported_records: usize,
    conflicted_records: usize,
    duplicate_asset_code_records: usize,
    legacy_history_claims: usize,
    batch_already_applied: bool,
    can_apply: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    batch_id: String,
    imported_records: usize,
    already_imported_records: usize,
    imported_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Outcome {
    Import,
    AlreadyImported,
    Conflict,
}

struct PlannedRecord {
    key: String,
    record: Value,
    outcome: Outcome,
}

struct Plan {
    records: Vec<PlannedRecord>,
    payload_sha256: String,
    target_records: usize,
    importable: usize,
    already_imported: usize,
    conflicts: usize,
    duplicate_asset_codes: usize,
    history_claims: usize,
}

pub(super) async fn preview(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let request: PreviewRequest = parse(&body)?;
    validate_bundle(&request.bundle)?;
    let db = state.db.lock().await;
    let plan = build_plan(&db, &request.bundle)?;
    let batch_already_applied = batch_applied(&db, &request.bundle.batch_id)?;
    let can_apply = !batch_already_applied && plan.conflicts == 0 && plan.importable > 0;
    Ok(Json(json!({ "preview": Preview {
        batch_id: request.bundle.batch_id.clone(),
        source_mode: request.bundle.source_mode.clone(),
        payload_sha256: plan.payload_sha256,
        confirmation_phrase: confirmation(&request.bundle.batch_id, request.bundle.records.len()),
        source_records: request.bundle.records.len(),
        target_records: plan.target_records,
        importable_records: plan.importable,
        already_imported_records: plan.already_imported,
        conflicted_records: plan.conflicts,
        duplicate_asset_code_records: plan.duplicate_asset_codes,
        legacy_history_claims: plan.history_claims,
        batch_already_applied,
        can_apply,
    }})))
}

pub(super) async fn apply(
    State(state): State<AppState>,
    headers: axum::http::HeaderMap,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let request: ApplyRequest = parse(&body)?;
    validate_bundle(&request.bundle)?;
    let expected_confirmation =
        confirmation(&request.bundle.batch_id, request.bundle.records.len());
    if request.confirmation != expected_confirmation {
        return Err(ApiError::unprocessable(format!(
            "Cụm xác nhận chưa chính xác. Hãy nhập: {expected_confirmation}"
        )));
    }
    if request.expected_payload_sha256.len() != 64
        || !request
            .expected_payload_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(ApiError::bad_request("SHA-256 xem trước không hợp lệ."));
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let plan = build_plan(&transaction, &request.bundle)?;
    if request.expected_payload_sha256 != plan.payload_sha256 {
        return Err(ApiError::conflict(
            "Gói nguồn hoặc collection asset_depreciations đã thay đổi kể từ lần xem trước. Hãy xem trước lại.",
        ));
    }
    if batch_applied(&transaction, &request.bundle.batch_id)? {
        return Err(ApiError::conflict(
            "Lô nhập này đã được áp dụng; không thể dùng lại mã lô.",
        ));
    }
    if plan.conflicts > 0 {
        return Err(ApiError::conflict(
            "Có khóa bản ghi trùng với dữ liệu khác. Không có bản ghi nào được nhập.",
        ));
    }
    if plan.importable == 0 {
        return Err(ApiError::conflict("Không còn bản ghi mới để nhập."));
    }
    let imported_at = chrono::Utc::now().to_rfc3339();
    for planned in &plan.records {
        if planned.outcome != Outcome::Import {
            continue;
        }
        transaction
            .execute(
                "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
                params![SCOPE, planned.key, planned.record.to_string(), imported_at],
            )
            .map_err(|_| ApiError::conflict("Collection đích vừa thay đổi; không ghi đè dữ liệu."))?;
    }
    let counts = json!({
        "scope": SCOPE,
        "sourceMode": request.bundle.source_mode,
        "sourceRecords": request.bundle.records.len(),
        "importedRecords": plan.importable,
        "alreadyImportedRecords": plan.already_imported,
        "duplicateAssetCodeRecords": plan.duplicate_asset_codes,
        "legacyHistoryClaims": plan.history_claims,
    });
    transaction
        .execute(
            "INSERT INTO legacy_import_runs (batch_id, actor_user_id, source_origin, exported_at, imported_at, payload_sha256, scope_counts_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                request.bundle.batch_id,
                actor.id,
                request.bundle.source_origin,
                request.bundle.exported_at,
                imported_at,
                digest(&request.bundle)?,
                counts.to_string(),
            ],
        )
        .map_err(|_| ApiError::conflict("Mã lô nhập đã được sử dụng."))?;
    append_audit(
        &transaction,
        &actor,
        &request.bundle.batch_id,
        plan.importable,
        &imported_at,
    )?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "import": ImportResult {
            batch_id: request.bundle.batch_id,
            imported_records: plan.importable,
            already_imported_records: plan.already_imported,
            imported_at,
        }})),
    ))
}

fn parse<T: for<'de> Deserialize<'de>>(body: &[u8]) -> ApiResult<T> {
    if body.len() > MAX_BODY {
        return Err(ApiError::bad_request("Tệp nhập vượt quá giới hạn 8 MiB."));
    }
    serde_json::from_slice(body)
        .map_err(|_| ApiError::bad_request("JSON nhập không hợp lệ hoặc sai cấu trúc."))
}

fn validate_bundle(bundle: &Bundle) -> ApiResult<()> {
    if bundle.format != FORMAT || bundle.schema_version != VERSION {
        return Err(ApiError::unprocessable(
            "Định dạng/phiên bản gói asset_depreciations không hợp lệ.",
        ));
    }
    if !matches!(
        bundle.source_mode.as_str(),
        "server_collection" | "browser_cache_fallback"
    ) {
        return Err(ApiError::unprocessable("Nguồn gói nhập không hợp lệ."));
    }
    let id = Uuid::parse_str(&bundle.batch_id)
        .map_err(|_| ApiError::unprocessable("batchId phải là UUID hợp lệ."))?;
    if id.to_string() != bundle.batch_id {
        return Err(ApiError::unprocessable(
            "batchId phải là UUID chữ thường dạng chuẩn.",
        ));
    }
    validate_origin(&bundle.source_origin)?;
    chrono::DateTime::parse_from_rfc3339(&bundle.exported_at)
        .map_err(|_| ApiError::unprocessable("exportedAt phải là RFC 3339."))?;
    if bundle.records.is_empty() || bundle.records.len() > MAX_RECORDS {
        return Err(ApiError::unprocessable(format!(
            "Gói phải có 1–{MAX_RECORDS} bản ghi."
        )));
    }
    let mut keys = HashSet::with_capacity(bundle.records.len());
    for record in &bundle.records {
        let key = validate_key(record)?;
        if !keys.insert(key) {
            return Err(ApiError::unprocessable("Gói chứa khóa bản ghi trùng lặp."));
        }
        if serde_json::to_vec(record)
            .map_err(ApiError::internal)?
            .len()
            > MAX_RECORD
        {
            return Err(ApiError::unprocessable("Một bản ghi vượt quá 128 KiB."));
        }
    }
    if serde_json::to_vec(bundle)
        .map_err(ApiError::internal)?
        .len()
        > MAX_BODY
    {
        return Err(ApiError::unprocessable("Gói vượt quá giới hạn 8 MiB."));
    }
    Ok(())
}

fn validate_origin(origin: &str) -> ApiResult<()> {
    let Some((scheme, authority)) = origin.split_once("://") else {
        return Err(ApiError::unprocessable("Origin nguồn không hợp lệ."));
    };
    if origin.len() > 256
        || !matches!(scheme, "http" | "https")
        || authority.is_empty()
        || authority
            .chars()
            .any(|c| c.is_control() || c.is_whitespace() || "/?#@".contains(c))
    {
        return Err(ApiError::unprocessable("Origin nguồn không hợp lệ."));
    }
    Ok(())
}

fn validate_key(record: &Value) -> ApiResult<String> {
    if !record.is_object() {
        return Err(ApiError::unprocessable("Bản ghi phải là đối tượng JSON."));
    }
    if record.get(MARKER).is_some() {
        return Err(ApiError::unprocessable(
            "Nguồn chứa metadata dành riêng của Rust.",
        ));
    }
    let key = record
        .get("key")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::unprocessable("Bản ghi thiếu key dạng chuỗi."))?;
    if key.trim() != key || key.is_empty() || key.len() > 160 || key.chars().any(char::is_control) {
        return Err(ApiError::unprocessable("Key bản ghi không hợp lệ."));
    }
    record_key(record).map_err(|_| ApiError::unprocessable("Key bản ghi không hợp lệ."))
}

fn build_plan(db: &Connection, bundle: &Bundle) -> ApiResult<Plan> {
    let existing = {
        let mut statement = db.prepare(
            "SELECT record_key, record_json FROM collection_records WHERE scope=?1 ORDER BY record_key COLLATE BINARY ASC",
        ).map_err(ApiError::internal)?;
        statement
            .query_map(params![SCOPE], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(ApiError::internal)?
            .map(|row| {
                let (key, raw) = row.map_err(ApiError::internal)?;
                Ok((
                    key,
                    serde_json::from_str::<Value>(&raw).map_err(ApiError::internal)?,
                ))
            })
            .collect::<ApiResult<HashMap<_, _>>>()?
    };
    let mut importable = 0;
    let mut already_imported = 0;
    let mut conflicts = 0;
    let mut duplicate_asset_codes = 0;
    let mut history_claims = 0;
    let mut asset_codes = HashMap::<String, usize>::new();
    let mut records = Vec::with_capacity(bundle.records.len());
    for source in &bundle.records {
        let key = validate_key(source)?;
        if source.get("scheduleList").is_some() || source.get("depreciationEvents").is_some() {
            history_claims += 1;
        }
        if let Some(code) = source
            .get("assetCode")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|code| !code.is_empty())
        {
            let count = asset_codes.entry(code.to_lowercase()).or_default();
            if *count > 0 {
                duplicate_asset_codes += 1;
            }
            *count += 1;
        }
        let outcome = match existing.get(&key) {
            None => {
                importable += 1;
                Outcome::Import
            }
            Some(current) if same_legacy(current, source) => {
                already_imported += 1;
                Outcome::AlreadyImported
            }
            Some(_) => {
                conflicts += 1;
                Outcome::Conflict
            }
        };
        records.push(PlannedRecord {
            key,
            record: if outcome == Outcome::Import {
                marked(source, bundle)
            } else {
                source.clone()
            },
            outcome,
        });
    }
    let bundle_hash = digest(bundle)?;
    let revision = collection_revision(db, SCOPE)?;
    let mut hasher = Sha256::new();
    hasher.update(b"kiyovn-asset-depreciations-import-plan-v1\0");
    hasher.update(bundle_hash.as_bytes());
    hasher.update(b"\0");
    hasher.update(revision.as_bytes());
    Ok(Plan {
        records,
        payload_sha256: hex(hasher.finalize().as_slice()),
        target_records: existing.len(),
        importable,
        already_imported,
        conflicts,
        duplicate_asset_codes,
        history_claims,
    })
}

fn marked(source: &Value, bundle: &Bundle) -> Value {
    let mut record = source.clone();
    record[MARKER] = json!({
        "format": FORMAT,
        "batchId": bundle.batch_id,
        "sourceMode": bundle.source_mode,
        "sourceOrigin": bundle.source_origin,
        "exportedAt": bundle.exported_at,
        "verification": "unverified",
        "unverifiedClaims": {
            "status": source.get("status"),
            "depreciatedMonths": source.get("depreciatedMonths"),
            "accumulatedDeprec": source.get("accumulatedDeprec"),
            "scheduleList": source.get("scheduleList"),
            "depreciationEvents": source.get("depreciationEvents"),
            "createdByUserId": source.get("createdByUserId"),
            "createdByName": source.get("createdByName"),
        }
    });
    record
}

fn same_legacy(existing: &Value, source: &Value) -> bool {
    let Some(marker) = existing.get(MARKER).and_then(Value::as_object) else {
        return false;
    };
    if marker.get("format").and_then(Value::as_str) != Some(FORMAT)
        || marker.get("verification").and_then(Value::as_str) != Some("unverified")
    {
        return false;
    }
    let mut without_marker = existing.clone();
    without_marker
        .as_object_mut()
        .is_some_and(|object| object.remove(MARKER).is_some())
        && &without_marker == source
}

fn digest(bundle: &Bundle) -> ApiResult<String> {
    Ok(hex(Sha256::digest(
        serde_json::to_vec(bundle).map_err(ApiError::internal)?,
    )
    .as_slice()))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn batch_applied(db: &Connection, id: &str) -> ApiResult<bool> {
    db.query_row(
        "SELECT 1 FROM legacy_import_runs WHERE batch_id=?1",
        params![id],
        |_| Ok(()),
    )
    .optional()
    .map(|result| result.is_some())
    .map_err(ApiError::internal)
}

fn confirmation(id: &str, count: usize) -> String {
    format!("NHẬP ASSET_DEPRECIATIONS {count} {id}")
}

fn append_audit(
    tx: &rusqlite::Transaction<'_>,
    actor: &User,
    batch_id: &str,
    imported: usize,
    at: &str,
) -> ApiResult<()> {
    tx.execute(
        "INSERT INTO audit_events (id, actor_id, action, resource_scope, resource_id, details_json, created_at, actor_name, actor_email) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        params![Uuid::new_v4().to_string(), actor.id, "legacy_asset_depreciations_imported", "legacy_import_runs", batch_id, json!({"scope":SCOPE,"importedRecords":imported}).to_string(), at, actor.name, actor.email],
    )
    .map_err(ApiError::internal)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bundle(records: Vec<Value>) -> Bundle {
        Bundle {
            format: FORMAT.to_owned(),
            schema_version: VERSION,
            source_mode: "browser_cache_fallback".to_owned(),
            batch_id: "123e4567-e89b-12d3-a456-426614174000".to_owned(),
            source_origin: "https://legacy.example.test".to_owned(),
            exported_at: "2026-10-10T10:00:00Z".to_owned(),
            records,
        }
    }

    #[test]
    fn validates_stable_keys_and_rejects_duplicate_or_reserved_source_keys() {
        let row = json!({"key":"dep-1","assetCode":"TS-1"});
        assert!(validate_bundle(&bundle(vec![row.clone()])).is_ok());
        assert!(validate_bundle(&bundle(vec![row.clone(), row])).is_err());
        assert!(
            validate_bundle(&bundle(vec![json!({"key":"dep-2","_kiyoLegacyImport":{}})])).is_err()
        );
    }

    #[test]
    fn import_marker_preserves_the_exact_legacy_row_and_marks_history_unverified() {
        let source = json!({
            "key":"dep-1","assetCode":"TS-1","status":"Đang trích khấu hao",
            "scheduleList":[{"posted":true}],"depreciationEvents":[{"actor":"legacy"}],
            "createdByUserId":"legacy-user","unknownField":{"preserve":true}
        });
        let marked = marked(&source, &bundle(vec![source.clone()]));
        assert_eq!(marked["unknownField"]["preserve"], true);
        assert_eq!(marked["_kiyoLegacyImport"]["verification"], "unverified");
        assert_eq!(
            marked["_kiyoLegacyImport"]["unverifiedClaims"]["scheduleList"][0]["posted"],
            true
        );
        assert!(same_legacy(&marked, &source));
    }

    #[test]
    fn confirmation_phrase_is_bound_to_scope_batch_and_record_count() {
        assert_eq!(
            confirmation("123e4567-e89b-12d3-a456-426614174000", 2),
            "NHẬP ASSET_DEPRECIATIONS 2 123e4567-e89b-12d3-a456-426614174000"
        );
    }
}
