use std::{
    convert::Infallible,
    sync::{Mutex as StdMutex, OnceLock},
    time::Duration,
};

use anyhow::Result;
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
    response::{
        Sse,
        sse::{Event, KeepAlive},
    },
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::{broadcast, mpsc};
use tokio_stream::{StreamExt, wrappers::ReceiverStream};
use uuid::Uuid;

use crate::{ADMIN_ROLE, ApiError, ApiResult, AppState, User, authenticated_user};

const MAX_TITLE_CHARS: usize = 255;
const MAX_DOCUMENT_BYTES: usize = 1024 * 1024;
const MAX_SETTINGS_BYTES: usize = 16 * 1024;
const MAX_OPERATIONS: usize = 200;
const MAX_COMMENT_CHARS: usize = 4000;
const ROLE_VIEWER: &str = "viewer";
const ROLE_COMMENTER: &str = "commenter";
const ROLE_EDITOR: &str = "editor";
const ROLE_OWNER: &str = "owner";

pub(crate) fn install_schema(db: &Connection) -> Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            title TEXT NOT NULL,
            current_revision INTEGER NOT NULL DEFAULT 1,
            settings_json TEXT NOT NULL DEFAULT '{}',
            deleted_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents(owner_id, deleted_at, updated_at DESC);

        CREATE TABLE IF NOT EXISTS document_members (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')),
            created_at TEXT NOT NULL,
            UNIQUE(document_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS document_members_doc_idx ON document_members(document_id);
        CREATE INDEX IF NOT EXISTS document_members_user_idx ON document_members(user_id);

        CREATE TABLE IF NOT EXISTS document_snapshots (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            revision INTEGER NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(document_id, revision)
        );
        CREATE INDEX IF NOT EXISTS document_snapshots_doc_idx ON document_snapshots(document_id, revision DESC);

        CREATE TABLE IF NOT EXISTS document_operations (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            revision INTEGER NOT NULL,
            client_id TEXT NOT NULL,
            transaction_id TEXT NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(document_id, transaction_id)
        );
        CREATE INDEX IF NOT EXISTS document_operations_doc_idx ON document_operations(document_id, revision ASC);

        CREATE TABLE IF NOT EXISTS document_comments (
            id TEXT PRIMARY KEY,
            document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            anchor_data TEXT NOT NULL,
            body TEXT NOT NULL,
            resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS document_comments_doc_idx ON document_comments(document_id, created_at ASC);",
    )?;
    Ok(())
}

#[derive(Clone)]
struct DocumentRow {
    id: String,
    title: String,
    owner_id: String,
    owner_name: String,
    owner_code: String,
    current_revision: i64,
    settings_json: String,
    created_at: String,
    updated_at: String,
}

#[derive(Clone)]
struct DocEvent {
    name: String,
    data: Value,
}

fn event_hub() -> &'static StdMutex<std::collections::HashMap<String, broadcast::Sender<DocEvent>>>
{
    static HUB: OnceLock<StdMutex<std::collections::HashMap<String, broadcast::Sender<DocEvent>>>> =
        OnceLock::new();
    HUB.get_or_init(|| StdMutex::new(std::collections::HashMap::new()))
}

fn broadcast_document_event(document_id: &str, name: &str, data: Value) {
    let sender = {
        let mut hub = event_hub()
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        hub.entry(document_id.to_owned())
            .or_insert_with(|| broadcast::channel(128).0)
            .clone()
    };
    let _ = sender.send(DocEvent {
        name: name.to_owned(),
        data,
    });
}

fn document_event_sender(document_id: &str) -> broadcast::Receiver<DocEvent> {
    let mut hub = event_hub()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    hub.entry(document_id.to_owned())
        .or_insert_with(|| broadcast::channel(128).0)
        .subscribe()
}

fn document_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentRow> {
    Ok(DocumentRow {
        id: row.get(0)?,
        owner_id: row.get(1)?,
        owner_name: row.get(2)?,
        owner_code: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        current_revision: row.get(4)?,
        settings_json: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        title: row.get(8)?,
    })
}

fn document_by_id(db: &Connection, document_id: &str) -> ApiResult<DocumentRow> {
    db.query_row(
        "SELECT d.id, d.owner_id, u.name, p.employee_code, d.current_revision, d.settings_json, d.created_at, d.updated_at, d.title
         FROM documents d JOIN users u ON u.id = d.owner_id
         LEFT JOIN employee_profiles p ON p.user_id = u.id
         WHERE d.id = ?1 AND d.deleted_at IS NULL",
        params![document_id],
        document_from_row,
    )
    .optional()
    .map_err(ApiError::internal)?
    .ok_or_else(|| ApiError::not_found("Không tìm thấy tài liệu."))
}

fn public_document(document: &DocumentRow, role: &str) -> Value {
    let settings =
        serde_json::from_str::<Value>(&document.settings_json).unwrap_or_else(|_| json!({}));
    json!({
        "id": document.id,
        "title": document.title,
        "ownerId": document.owner_id,
        "ownerName": document.owner_name,
        "ownerCode": document.owner_code,
        "currentRevision": document.current_revision,
        "settings": settings,
        "userRole": role,
        "createdAt": document.created_at,
        "updatedAt": document.updated_at
    })
}

fn role_rank(role: &str) -> u8 {
    match role {
        ROLE_VIEWER => 1,
        ROLE_COMMENTER => 2,
        ROLE_EDITOR => 3,
        ROLE_OWNER => 4,
        _ => 0,
    }
}

fn access_role(db: &Connection, document: &DocumentRow, actor: &User) -> ApiResult<Option<String>> {
    if actor.role == ADMIN_ROLE || actor.id == document.owner_id {
        return Ok(Some(ROLE_OWNER.to_owned()));
    }
    db.query_row(
        "SELECT role FROM document_members WHERE document_id = ?1 AND user_id = ?2",
        params![document.id, actor.id],
        |row| row.get(0),
    )
    .optional()
    .map_err(ApiError::internal)
}

fn require_access(
    db: &Connection,
    document_id: &str,
    actor: &User,
    minimum_role: &str,
) -> ApiResult<(DocumentRow, String)> {
    let document = document_by_id(db, document_id)?;
    let role = access_role(db, &document, actor)?
        .ok_or_else(|| ApiError::forbidden("Bạn không có quyền truy cập tài liệu này."))?;
    if role_rank(&role) < role_rank(minimum_role) {
        return Err(ApiError::forbidden(
            "Bạn không có quyền thực hiện thao tác này trên tài liệu.",
        ));
    }
    Ok((document, role))
}

fn validate_title(title: &str) -> ApiResult<String> {
    let title = title.trim();
    if title.is_empty() || title.chars().count() > MAX_TITLE_CHARS {
        return Err(ApiError::unprocessable(
            "Tiêu đề phải có từ 1 đến 255 ký tự.",
        ));
    }
    Ok(title.to_owned())
}

fn settings_value(value: Option<Value>, fallback: Value) -> ApiResult<(Value, String)> {
    let value = value.unwrap_or(fallback);
    if !value.is_object() {
        return Err(ApiError::unprocessable(
            "Cài đặt tài liệu phải là một JSON object.",
        ));
    }
    let serialized = serde_json::to_string(&value).map_err(ApiError::internal)?;
    if serialized.len() > MAX_SETTINGS_BYTES {
        return Err(ApiError::unprocessable(
            "Cài đặt tài liệu vượt quá giới hạn 16 KiB.",
        ));
    }
    Ok((value, serialized))
}

fn document_data(value: &Value) -> ApiResult<String> {
    let serialized = match value {
        Value::String(text) => text.clone(),
        other => serde_json::to_string(other).map_err(ApiError::internal)?,
    };
    if serialized.is_empty() || serialized.len() > MAX_DOCUMENT_BYTES {
        return Err(ApiError::unprocessable(
            "Dữ liệu tài liệu phải có kích thước từ 1 byte đến 1 MiB.",
        ));
    }
    Ok(serialized)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentInput {
    id: Option<String>,
    title: Option<String>,
    settings: Option<Value>,
    initial_data: Option<Value>,
}

pub async fn list_documents(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = if actor.role == ADMIN_ROLE {
        db.prepare(
            "SELECT d.id, d.owner_id, u.name, p.employee_code, d.current_revision, d.settings_json, d.created_at, d.updated_at, d.title
             FROM documents d JOIN users u ON u.id = d.owner_id
             LEFT JOIN employee_profiles p ON p.user_id = u.id
             WHERE d.deleted_at IS NULL ORDER BY d.updated_at DESC",
        )
    } else {
        db.prepare(
            "SELECT d.id, d.owner_id, u.name, p.employee_code, d.current_revision, d.settings_json, d.created_at, d.updated_at, d.title
             FROM documents d JOIN users u ON u.id = d.owner_id
             LEFT JOIN employee_profiles p ON p.user_id = u.id
             LEFT JOIN document_members dm ON dm.document_id = d.id AND dm.user_id = ?1
             WHERE d.deleted_at IS NULL AND (d.owner_id = ?1 OR dm.user_id = ?1)
             ORDER BY d.updated_at DESC",
        )
    }
    .map_err(ApiError::internal)?;
    let rows = if actor.role == ADMIN_ROLE {
        statement.query_map([], document_from_row)
    } else {
        statement.query_map(params![actor.id], document_from_row)
    }
    .map_err(ApiError::internal)?
    .collect::<rusqlite::Result<Vec<_>>>()
    .map_err(ApiError::internal)?;
    let mut data = Vec::with_capacity(rows.len());
    for document in rows {
        let role = access_role(&db, &document, &actor)?.unwrap_or_else(|| ROLE_VIEWER.to_owned());
        data.push(public_document(&document, &role));
    }
    Ok(Json(json!({ "data": data })))
}

pub async fn create_document(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateDocumentInput>,
) -> ApiResult<(axum::http::StatusCode, Json<Value>)> {
    let actor = authenticated_user(&state, &headers).await?;
    let id = input
        .id
        .filter(|id| {
            !id.is_empty()
                && id.len() <= 64
                && id
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
        })
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let title = validate_title(input.title.as_deref().unwrap_or("Văn bản chưa đặt tên"))?;
    let defaults = json!({
        "pageSize": "A4", "orientation": "portrait",
        "margins": {"top": 72, "bottom": 72, "left": 72, "right": 72},
        "pageColor": "#FFFFFF"
    });
    let (settings, settings_json) = settings_value(input.settings, defaults)?;
    let initial_data = if let Some(data) = input.initial_data.as_ref() {
        document_data(data)?
    } else {
        serde_json::to_string(&json!({
            "schemaVersion": 1,
            "id": id,
            "title": title,
            "revision": 1,
            "settings": settings,
            "blocks": [{
                "id": "b-init-1", "type": "paragraph",
                "style": {"alignment": "left", "lineHeight": 1.25, "spaceBefore": 0, "spaceAfter": 6},
                "runs": [{"id": "r-init-1", "text": "", "marks": {}}]
            }]
        })).map_err(ApiError::internal)?
    };
    if initial_data.len() > MAX_DOCUMENT_BYTES {
        return Err(ApiError::unprocessable(
            "Dữ liệu tài liệu vượt quá giới hạn 1 MiB.",
        ));
    }
    let now = chrono::Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let tx = db.transaction().map_err(ApiError::internal)?;
    tx.execute(
        "INSERT INTO documents (id, owner_id, title, current_revision, settings_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, 1, ?4, ?5, ?5)",
        params![id, actor.id, title, settings_json, now],
    ).map_err(ApiError::internal)?;
    tx.execute(
        "INSERT INTO document_snapshots (id, document_id, revision, data, created_at) VALUES (?1, ?2, 1, ?3, ?4)",
        params![Uuid::new_v4().to_string(), id, initial_data, now],
    ).map_err(ApiError::internal)?;
    tx.commit().map_err(ApiError::internal)?;
    let document = document_by_id(&db, &id)?;
    let _ = settings;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({
            "document": public_document(&document, ROLE_OWNER),
            "snapshot": {"revision": 1, "data": initial_data}
        })),
    ))
}

pub async fn get_document(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let (document, role) = require_access(&db, &document_id, &actor, ROLE_VIEWER)?;
    let snapshot = db.query_row(
        "SELECT revision, data FROM document_snapshots WHERE document_id = ?1 ORDER BY revision DESC LIMIT 1",
        params![document_id],
        |row| Ok(json!({"revision": row.get::<_, i64>(0)?, "data": row.get::<_, String>(1)?})),
    ).optional().map_err(ApiError::internal)?;
    let snapshot_revision = snapshot
        .as_ref()
        .and_then(|value| value["revision"].as_i64())
        .unwrap_or(0);
    let mut statement = db.prepare(
        "SELECT id, revision, client_id, transaction_id, data, created_at FROM document_operations
         WHERE document_id = ?1 AND revision > ?2 ORDER BY revision ASC",
    ).map_err(ApiError::internal)?;
    let operations = statement
        .query_map(params![document_id, snapshot_revision], |row| {
            Ok(json!({
                "id": row.get::<_, String>(0)?, "revision": row.get::<_, i64>(1)?,
                "clientId": row.get::<_, String>(2)?, "transactionId": row.get::<_, String>(3)?,
                "data": row.get::<_, String>(4)?, "createdAt": row.get::<_, String>(5)?
            }))
        })
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    Ok(Json(
        json!({ "document": public_document(&document, &role), "snapshot": snapshot, "operations": operations }),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocumentInput {
    title: Option<String>,
    settings: Option<Value>,
    expected_revision: Option<i64>,
    snapshot: Option<Value>,
}

pub async fn update_document(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
    Json(input): Json<UpdateDocumentInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let (document, role) = require_access(&db, &document_id, &actor, ROLE_EDITOR)?;
    let title = input
        .title
        .as_deref()
        .map(validate_title)
        .transpose()?
        .unwrap_or_else(|| document.title.clone());
    let settings_json = if let Some(settings) = input.settings {
        settings_value(Some(settings), json!({}))?.1
    } else {
        document.settings_json.clone()
    };
    let next_revision = if input.snapshot.is_some() {
        let expected_revision = input.expected_revision.ok_or_else(|| {
            ApiError::bad_request("expectedRevision is required when saving a document snapshot.")
        })?;
        if expected_revision != document.current_revision {
            return Err(ApiError::conflict(format!(
                "Tài liệu đã được cập nhật lên phiên bản {}. Hãy tải lại trước khi lưu.",
                document.current_revision
            )));
        }
        Some(
            document
                .current_revision
                .checked_add(1)
                .ok_or_else(|| ApiError::conflict("Document revision limit has been reached."))?,
        )
    } else {
        None
    };
    let snapshot_data = input
        .snapshot
        .as_ref()
        .zip(next_revision)
        .map(|(snapshot, revision)| versioned_document_data(snapshot, revision))
        .transpose()?;
    let now = chrono::Utc::now().to_rfc3339();
    let tx = db.transaction().map_err(ApiError::internal)?;
    tx.execute(
        "UPDATE documents SET title = ?1, settings_json = ?2, current_revision = ?3, updated_at = ?4 WHERE id = ?5",
        params![title, settings_json, next_revision.unwrap_or(document.current_revision), now, document_id],
    )
    .map_err(ApiError::internal)?;
    if let Some(snapshot_data) = snapshot_data.as_deref() {
        tx.execute(
            "INSERT INTO document_snapshots (id, document_id, revision, data, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                Uuid::new_v4().to_string(),
                document_id,
                next_revision,
                snapshot_data,
                now
            ],
        )
        .map_err(ApiError::internal)?;
    }
    tx.commit().map_err(ApiError::internal)?;
    let updated = document_by_id(&db, &document_id)?;
    let public = public_document(&updated, &role);
    broadcast_document_event(&document_id, "metadata_updated", public.clone());
    Ok(Json(json!({
        "document": public,
        "snapshotSaved": snapshot_data.is_some(),
        "revision": updated.current_revision
    })))
}

fn versioned_document_data(value: &Value, revision: i64) -> ApiResult<String> {
    let mut parsed = match value {
        Value::Object(_) => Some(value.clone()),
        Value::String(raw) => serde_json::from_str::<Value>(raw)
            .ok()
            .filter(Value::is_object),
        _ => None,
    };
    if let Some(Value::Object(snapshot)) = parsed.as_mut() {
        snapshot.insert("revision".to_owned(), json!(revision));
        document_data(&Value::Object(snapshot.clone()))
    } else {
        document_data(value)
    }
}

pub async fn delete_document(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    require_access(&db, &document_id, &actor, ROLE_OWNER)?;
    let now = chrono::Utc::now().to_rfc3339();
    db.execute("UPDATE documents SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2 AND deleted_at IS NULL", params![now, document_id]).map_err(ApiError::internal)?;
    Ok(Json(json!({ "deleted": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationsInput {
    #[serde(default)]
    operations: Vec<Value>,
    snapshot: Option<SnapshotInput>,
}

#[derive(Deserialize)]
pub struct SnapshotInput {
    data: Value,
}

pub async fn save_operations(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
    Json(input): Json<OperationsInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    if input.operations.len() > MAX_OPERATIONS {
        return Err(ApiError::unprocessable("Một lần lưu tối đa 200 thao tác."));
    }
    let encoded_size = serde_json::to_vec(&input.operations)
        .map_err(ApiError::internal)?
        .len();
    if encoded_size > MAX_DOCUMENT_BYTES {
        return Err(ApiError::unprocessable(
            "Lô thao tác vượt quá giới hạn 1 MiB.",
        ));
    }
    let mut db = state.db.lock().await;
    let (document, _) = require_access(&db, &document_id, &actor, ROLE_EDITOR)?;
    let tx = db.transaction().map_err(ApiError::internal)?;
    let mut revision = document.current_revision;
    let now = chrono::Utc::now().to_rfc3339();
    let snapshot_submitted = input.snapshot.is_some();
    for op in &input.operations {
        if !op.is_object() {
            return Err(ApiError::unprocessable(
                "Mỗi thao tác phải là một JSON object.",
            ));
        }
        let transaction_id = op
            .get("transactionId")
            .and_then(Value::as_str)
            .filter(|v| !v.trim().is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let client_id = op
            .get("clientId")
            .and_then(Value::as_str)
            .filter(|v| !v.trim().is_empty())
            .unwrap_or(&actor.id);
        if transaction_id.len() > 128 || client_id.len() > 128 {
            return Err(ApiError::unprocessable(
                "transactionId và clientId tối đa 128 byte.",
            ));
        }
        let data_value = op.get("data").unwrap_or(op);
        let data = document_data(data_value)?;
        let candidate = revision + 1;
        let changed = tx.execute(
            "INSERT OR IGNORE INTO document_operations (id, document_id, revision, client_id, transaction_id, data, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![Uuid::new_v4().to_string(), document_id, candidate, client_id, transaction_id, data, now],
        ).map_err(ApiError::internal)?;
        if changed > 0 {
            revision = candidate;
        }
    }
    if let Some(snapshot) = input.snapshot {
        let data = document_data(&snapshot.data)?;
        tx.execute(
            "INSERT INTO document_snapshots (id, document_id, revision, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(document_id, revision) DO UPDATE SET data = excluded.data, created_at = excluded.created_at",
            params![Uuid::new_v4().to_string(), document_id, revision, data, now],
        ).map_err(ApiError::internal)?;
    }
    tx.execute(
        "UPDATE documents SET current_revision = ?1, updated_at = ?2 WHERE id = ?3",
        params![revision, now, document_id],
    )
    .map_err(ApiError::internal)?;
    tx.commit().map_err(ApiError::internal)?;
    broadcast_document_event(
        &document_id,
        "operations",
        json!({
            "revision": revision, "actorId": actor.id, "operations": input.operations,
            "snapshotRevision": snapshot_submitted.then_some(revision)
        }),
    );
    Ok(Json(json!({ "success": true, "revision": revision })))
}

#[derive(Deserialize)]
pub struct SaveSnapshotInput {
    revision: Option<i64>,
    data: Value,
}

pub async fn save_snapshot(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
    Json(input): Json<SaveSnapshotInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let (document, _) = require_access(&db, &document_id, &actor, ROLE_EDITOR)?;
    let revision = input.revision.unwrap_or(document.current_revision);
    if revision < 1 || revision > document.current_revision {
        return Err(ApiError::unprocessable("Phiên bản snapshot không hợp lệ."));
    }
    let data = document_data(&input.data)?;
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "INSERT INTO document_snapshots (id, document_id, revision, data, created_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(document_id, revision) DO UPDATE SET data = excluded.data, created_at = excluded.created_at",
        params![Uuid::new_v4().to_string(), document_id, revision, data, now],
    ).map_err(ApiError::internal)?;
    Ok(Json(json!({ "success": true, "revision": revision })))
}

pub async fn document_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    require_access(&db, &document_id, &actor, ROLE_VIEWER)?;
    let mut statement = db.prepare("SELECT id, revision, created_at FROM document_snapshots WHERE document_id = ?1 ORDER BY revision DESC LIMIT 50").map_err(ApiError::internal)?;
    let history = statement.query_map(params![document_id], |row| Ok(json!({"id": row.get::<_, String>(0)?, "revision": row.get::<_, i64>(1)?, "created_at": row.get::<_, String>(2)?})))
        .map_err(ApiError::internal)?.collect::<rusqlite::Result<Vec<_>>>().map_err(ApiError::internal)?;
    Ok(Json(json!({ "history": history })))
}

pub async fn document_events(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
) -> ApiResult<Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let (_, role) = require_access(&db, &document_id, &actor, ROLE_VIEWER)?;
    drop(db);
    let mut receiver = document_event_sender(&document_id);
    let (sender, stream_receiver) = mpsc::channel(16);
    let connected =
        json!({ "userId": actor.id, "role": role, "time": chrono::Utc::now().timestamp_millis() });
    tokio::spawn(async move {
        let _ = sender
            .send(Ok(Event::default()
                .event("connected")
                .data(connected.to_string())))
            .await;
        loop {
            match receiver.recv().await {
                Ok(message) => {
                    let event = Event::default()
                        .event(message.name)
                        .data(message.data.to_string());
                    if sender.send(Ok(event)).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });
    let stream = ReceiverStream::new(stream_receiver).map(|item| item);
    Ok(Sse::new(stream).keep_alive(
        KeepAlive::new()
            .interval(Duration::from_secs(20))
            .text("keepalive"),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceInput {
    client_id: Option<String>,
    color: Option<String>,
    selection: Option<Value>,
}

pub async fn publish_presence(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
    Json(input): Json<PresenceInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    require_access(&db, &document_id, &actor, ROLE_VIEWER)?;
    let employee_code: String = db
        .query_row(
            "SELECT COALESCE(employee_code, '') FROM employee_profiles WHERE user_id = ?1",
            params![actor.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .unwrap_or_default();
    drop(db);
    let client_id = input
        .client_id
        .filter(|id| id.len() <= 128)
        .unwrap_or_else(|| "client".to_owned());
    let color = input
        .color
        .filter(|color| color.len() <= 32)
        .unwrap_or_else(|| "#0F6CBD".to_owned());
    broadcast_document_event(
        &document_id,
        "presence",
        json!({
            "userId": actor.id, "name": actor.name, "employeeCode": employee_code,
            "clientId": client_id, "color": color, "selection": input.selection,
            "lastActiveAt": chrono::Utc::now().timestamp_millis()
        }),
    );
    Ok(Json(json!({ "ok": true })))
}

fn public_comment(db: &Connection, comment_id: &str) -> ApiResult<Value> {
    db.query_row(
        "SELECT c.id, c.document_id, c.author_id, u.name, COALESCE(p.employee_code, ''), c.anchor_data, c.body, c.resolved, c.created_at, c.updated_at
         FROM document_comments c JOIN users u ON u.id = c.author_id LEFT JOIN employee_profiles p ON p.user_id = u.id WHERE c.id = ?1",
        params![comment_id],
        |row| {
            let anchor_text: String = row.get(5)?;
            let anchor = serde_json::from_str::<Value>(&anchor_text).unwrap_or(Value::Null);
            Ok(json!({
                "id": row.get::<_, String>(0)?, "documentId": row.get::<_, String>(1)?,
                "authorId": row.get::<_, String>(2)?, "authorName": row.get::<_, String>(3)?,
                "authorCode": row.get::<_, String>(4)?, "anchor": anchor,
                "body": row.get::<_, String>(6)?, "resolved": row.get::<_, i64>(7)? != 0,
                "createdAt": row.get::<_, String>(8)?, "updatedAt": row.get::<_, String>(9)?
            }))
        },
    ).optional().map_err(ApiError::internal)?.ok_or_else(|| ApiError::not_found("Không tìm thấy bình luận."))
}

pub async fn list_comments(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    require_access(&db, &document_id, &actor, ROLE_VIEWER)?;
    let mut statement = db
        .prepare("SELECT id FROM document_comments WHERE document_id = ?1 ORDER BY created_at ASC")
        .map_err(ApiError::internal)?;
    let ids = statement
        .query_map(params![document_id], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    let comments = ids
        .iter()
        .map(|id| public_comment(&db, id))
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "comments": comments })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCommentInput {
    body: String,
    anchor: Option<Value>,
}

pub async fn create_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
    Json(input): Json<CreateCommentInput>,
) -> ApiResult<(axum::http::StatusCode, Json<Value>)> {
    let actor = authenticated_user(&state, &headers).await?;
    let body = input.body.trim();
    if body.is_empty() || body.chars().count() > MAX_COMMENT_CHARS {
        return Err(ApiError::unprocessable(
            "Nội dung bình luận phải có từ 1 đến 4000 ký tự.",
        ));
    }
    let anchor = input.anchor.unwrap_or_else(|| json!({}));
    let anchor_json = serde_json::to_string(&anchor).map_err(ApiError::internal)?;
    if anchor_json.len() > MAX_SETTINGS_BYTES {
        return Err(ApiError::unprocessable(
            "Vị trí bình luận vượt quá giới hạn 16 KiB.",
        ));
    }
    let db = state.db.lock().await;
    require_access(&db, &document_id, &actor, ROLE_COMMENTER)?;
    let id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    db.execute("INSERT INTO document_comments (id, document_id, author_id, anchor_data, body, resolved, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)", params![id, document_id, actor.id, anchor_json, body, now]).map_err(ApiError::internal)?;
    let comment = public_comment(&db, &id)?;
    broadcast_document_event(&document_id, "comment_created", comment.clone());
    Ok((
        axum::http::StatusCode::CREATED,
        Json(json!({ "comment": comment })),
    ))
}

#[derive(Deserialize)]
pub struct UpdateCommentInput {
    body: Option<String>,
    resolved: Option<bool>,
}

pub async fn update_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((document_id, comment_id)): Path<(String, String)>,
    Json(input): Json<UpdateCommentInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    require_access(&db, &document_id, &actor, ROLE_COMMENTER)?;
    let existing = db
        .query_row(
            "SELECT body, resolved FROM document_comments WHERE id = ?1 AND document_id = ?2",
            params![comment_id, document_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy bình luận."))?;
    let body = if let Some(body) = input.body {
        let trimmed = body.trim();
        if trimmed.is_empty() || trimmed.chars().count() > MAX_COMMENT_CHARS {
            return Err(ApiError::unprocessable(
                "Nội dung bình luận phải có từ 1 đến 4000 ký tự.",
            ));
        }
        trimmed.to_owned()
    } else {
        existing.0
    };
    let resolved = input.resolved.map(i64::from).unwrap_or(existing.1);
    let now = chrono::Utc::now().to_rfc3339();
    db.execute(
        "UPDATE document_comments SET body = ?1, resolved = ?2, updated_at = ?3 WHERE id = ?4",
        params![body, resolved, now, comment_id],
    )
    .map_err(ApiError::internal)?;
    let comment = public_comment(&db, &comment_id)?;
    broadcast_document_event(&document_id, "comment_updated", comment.clone());
    Ok(Json(json!({ "comment": comment })))
}

pub async fn delete_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((document_id, comment_id)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let (_, role) = require_access(&db, &document_id, &actor, ROLE_COMMENTER)?;
    let author_id: String = db
        .query_row(
            "SELECT author_id FROM document_comments WHERE id = ?1 AND document_id = ?2",
            params![comment_id, document_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy bình luận."))?;
    if role != ROLE_OWNER && author_id != actor.id {
        return Err(ApiError::forbidden(
            "Bạn chỉ có thể xóa bình luận do chính bạn tạo.",
        ));
    }
    db.execute(
        "DELETE FROM document_comments WHERE id = ?1",
        params![comment_id],
    )
    .map_err(ApiError::internal)?;
    broadcast_document_event(
        &document_id,
        "comment_deleted",
        json!({ "commentId": comment_id }),
    );
    Ok(Json(json!({ "deleted": true })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShareDocumentInput {
    user_id: Option<String>,
    email: Option<String>,
    role: Option<String>,
}

pub async fn share_document(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
    Json(input): Json<ShareDocumentInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    require_access(&db, &document_id, &actor, ROLE_OWNER)?;
    let role = input.role.as_deref().unwrap_or(ROLE_EDITOR);
    if ![ROLE_EDITOR, ROLE_COMMENTER, ROLE_VIEWER].contains(&role) {
        return Err(ApiError::unprocessable("Vai trò chia sẻ không hợp lệ."));
    }
    let target = if let Some(user_id) = input.user_id {
        db.query_row(
            "SELECT id, name, email FROM users WHERE id = ?1 AND is_active = 1",
            params![user_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(ApiError::internal)?
    } else if let Some(email) = input.email {
        db.query_row(
            "SELECT id, name, email FROM users WHERE lower(email) = lower(?1) AND is_active = 1",
            params![email.trim()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(ApiError::internal)?
    } else {
        None
    }
    .ok_or_else(|| ApiError::not_found("Không tìm thấy người dùng."))?;
    if target.0 == actor.id {
        return Err(ApiError::unprocessable(
            "Không thể chia sẻ tài liệu cho chính mình.",
        ));
    }
    let now = chrono::Utc::now().to_rfc3339();
    db.execute("INSERT INTO document_members (id, document_id, user_id, role, created_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(document_id, user_id) DO UPDATE SET role = excluded.role", params![Uuid::new_v4().to_string(), document_id, target.0, role, now]).map_err(ApiError::internal)?;
    Ok(Json(
        json!({ "success": true, "member": {"userId": target.0, "name": target.1, "email": target.2, "role": role} }),
    ))
}

pub async fn list_members(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(document_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    require_access(&db, &document_id, &actor, ROLE_VIEWER)?;
    let mut statement = db.prepare(
        "SELECT dm.id, dm.role, dm.created_at, u.id, u.name, u.email, COALESCE(p.employee_code, '')
         FROM document_members dm JOIN users u ON u.id = dm.user_id LEFT JOIN employee_profiles p ON p.user_id = u.id
         WHERE dm.document_id = ?1 ORDER BY dm.created_at ASC",
    ).map_err(ApiError::internal)?;
    let members = statement.query_map(params![document_id], |row| Ok(json!({
        "id": row.get::<_, String>(0)?, "role": row.get::<_, String>(1)?, "created_at": row.get::<_, String>(2)?,
        "user_id": row.get::<_, String>(3)?, "name": row.get::<_, String>(4)?, "email": row.get::<_, String>(5)?,
        "employee_code": row.get::<_, String>(6)?
    }))).map_err(ApiError::internal)?.collect::<rusqlite::Result<Vec<_>>>().map_err(ApiError::internal)?;
    Ok(Json(json!({ "members": members })))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderValue, StatusCode, header::AUTHORIZATION};
    use jsonwebtoken::{DecodingKey, EncodingKey};
    use rusqlite::Connection;
    use std::{path::PathBuf, sync::Arc};
    use tokio::sync::Mutex;

    fn setup() -> (AppState, User, User) {
        let db = Connection::open_in_memory().unwrap();
        crate::init_database(&db).unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        let owner = test_user("owner", "Owner", "USER", &now);
        let member = test_user("member", "Member", "USER", &now);
        for user in [&owner, &member] {
            db.execute(
                "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 'test', 1, ?5, ?5)",
                params![user.id, user.email, user.name, user.role, now],
            ).unwrap();
        }
        let secret = b"document-route-test-secret-long-enough";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: EncodingKey::from_secret(secret),
            jwt_decoding: DecodingKey::from_secret(secret),
            storage_dir: Arc::new(PathBuf::from("test-storage")),
            crm_crypto: None,
        };
        (state, owner, member)
    }

    fn test_user(id: &str, name: &str, role: &str, now: &str) -> User {
        User {
            id: id.to_owned(),
            email: format!("{id}@example.test"),
            name: name.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.to_owned(),
            updated_at: now.to_owned(),
        }
    }

    fn headers(state: &AppState, user: &User) -> HeaderMap {
        let token = crate::issue_token(state, user).unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        headers
    }

    fn document_id(response: &(StatusCode, Json<Value>)) -> String {
        response.1.0["document"]["id"].as_str().unwrap().to_owned()
    }

    #[tokio::test]
    async fn shared_document_enforces_roles_and_operation_ids_are_idempotent() {
        let (state, owner, member) = setup();
        let created = create_document(
            State(state.clone()),
            headers(&state, &owner),
            Json(CreateDocumentInput {
                id: None,
                title: Some("Biên bản".into()),
                settings: None,
                initial_data: None,
            }),
        )
        .await
        .unwrap();
        let document_id = document_id(&created);

        let _shared = share_document(
            State(state.clone()),
            headers(&state, &owner),
            Path(document_id.clone()),
            Json(ShareDocumentInput {
                user_id: Some(member.id.clone()),
                email: None,
                role: Some(ROLE_VIEWER.into()),
            }),
        )
        .await
        .unwrap();

        let forbidden = save_operations(
            State(state.clone()),
            headers(&state, &member),
            Path(document_id.clone()),
            Json(OperationsInput {
                operations: vec![json!({"transactionId": "forbidden", "data": "x"})],
                snapshot: None,
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(forbidden.0, StatusCode::FORBIDDEN);

        let operation = json!({"transactionId": "client-tx-1", "clientId": "editor-tab", "data": {"insert": "hello"}});
        for _ in 0..2 {
            let saved = save_operations(
                State(state.clone()),
                headers(&state, &owner),
                Path(document_id.clone()),
                Json(OperationsInput {
                    operations: vec![operation.clone()],
                    snapshot: None,
                }),
            )
            .await
            .unwrap();
            assert_eq!(saved.0["revision"], 2);
        }

        let state_a = state.clone();
        let state_b = state.clone();
        let owner_a = owner.clone();
        let owner_b = owner.clone();
        let document_a = document_id.clone();
        let document_b = document_id.clone();
        let (saved_a, saved_b) = tokio::join!(
            save_operations(
                State(state_a.clone()),
                headers(&state_a, &owner_a),
                Path(document_a),
                Json(OperationsInput {
                    operations: vec![json!({"transactionId": "client-tx-2", "data": "second"})],
                    snapshot: None,
                }),
            ),
            save_operations(
                State(state_b.clone()),
                headers(&state_b, &owner_b),
                Path(document_b),
                Json(OperationsInput {
                    operations: vec![json!({"transactionId": "client-tx-3", "data": "third"})],
                    snapshot: None,
                }),
            ),
        );
        let revision_a = saved_a.unwrap().0["revision"].as_i64().unwrap();
        let revision_b = saved_b.unwrap().0["revision"].as_i64().unwrap();
        let mut revisions = vec![revision_a, revision_b];
        revisions.sort_unstable();
        assert_eq!(revisions, vec![3, 4]);

        let db = state.db.lock().await;
        let (revision, operation_count): (i64, i64) = db.query_row(
            "SELECT d.current_revision, (SELECT COUNT(*) FROM document_operations o WHERE o.document_id = d.id)
             FROM documents d WHERE d.id = ?1",
            params![document_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).unwrap();
        assert_eq!((revision, operation_count), (4, 3));
    }

    #[tokio::test]
    async fn commenter_can_post_comment_but_viewer_cannot() {
        let (state, owner, member) = setup();
        let created = create_document(
            State(state.clone()),
            headers(&state, &owner),
            Json(CreateDocumentInput {
                id: None,
                title: None,
                settings: None,
                initial_data: None,
            }),
        )
        .await
        .unwrap();
        let document_id = document_id(&created);
        let _shared = share_document(
            State(state.clone()),
            headers(&state, &owner),
            Path(document_id.clone()),
            Json(ShareDocumentInput {
                user_id: Some(member.id.clone()),
                email: None,
                role: Some(ROLE_COMMENTER.into()),
            }),
        )
        .await
        .unwrap();
        let created_comment = create_comment(
            State(state.clone()),
            headers(&state, &member),
            Path(document_id.clone()),
            Json(CreateCommentInput {
                body: "Cần xem lại".into(),
                anchor: Some(json!({"blockId": "b1"})),
            }),
        )
        .await
        .unwrap();
        assert_eq!(created_comment.0, StatusCode::CREATED);
        assert_eq!(created_comment.1.0["comment"]["authorId"], member.id);
        let comments = list_comments(
            State(state.clone()),
            headers(&state, &member),
            Path(document_id),
        )
        .await
        .unwrap();
        assert_eq!(comments.0["comments"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn metadata_and_snapshot_save_commit_atomically() {
        let (state, owner, _) = setup();
        let created = create_document(
            State(state.clone()),
            headers(&state, &owner),
            Json(CreateDocumentInput {
                id: None,
                title: Some("Before".into()),
                settings: None,
                initial_data: None,
            }),
        )
        .await
        .unwrap();
        let document_id = document_id(&created);

        let rejected = update_document(
            State(state.clone()),
            headers(&state, &owner),
            Path(document_id.clone()),
            Json(UpdateDocumentInput {
                title: Some("After".into()),
                settings: None,
                expected_revision: Some(1),
                snapshot: Some(Value::String(String::new())),
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(rejected.0, StatusCode::UNPROCESSABLE_ENTITY);
        {
            let db = state.db.lock().await;
            let title: String = db
                .query_row(
                    "SELECT title FROM documents WHERE id = ?1",
                    params![document_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(title, "Before");
        }

        let saved = update_document(
            State(state.clone()),
            headers(&state, &owner),
            Path(document_id.clone()),
            Json(UpdateDocumentInput {
                title: Some("After".into()),
                settings: None,
                expected_revision: Some(1),
                snapshot: Some(json!({"blocks": []})),
            }),
        )
        .await
        .unwrap();
        assert_eq!(saved.0["snapshotSaved"], true);
        assert_eq!(saved.0["document"]["title"], "After");
        let db = state.db.lock().await;
        let (title, current_revision, snapshot_count): (String, i64, i64) = db
            .query_row(
                "SELECT d.title, d.current_revision,
                        (SELECT COUNT(*) FROM document_snapshots s WHERE s.document_id = d.id)
                 FROM documents d WHERE d.id = ?1",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(
            (title.as_str(), current_revision, snapshot_count),
            ("After", 2, 2)
        );
        let newest_snapshot: String = db
            .query_row(
                "SELECT data FROM document_snapshots WHERE document_id = ?1 AND revision = 2",
                params![document_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            serde_json::from_str::<Value>(&newest_snapshot).unwrap()["revision"],
            2
        );
    }

    #[tokio::test]
    async fn document_snapshot_save_rejects_stale_revision_without_mutation() {
        let (state, owner, _) = setup();
        let created = create_document(
            State(state.clone()),
            headers(&state, &owner),
            Json(CreateDocumentInput {
                id: None,
                title: Some("Before".into()),
                settings: None,
                initial_data: None,
            }),
        )
        .await
        .unwrap();
        let document_id = document_id(&created);

        let missing_revision = update_document(
            State(state.clone()),
            headers(&state, &owner),
            Path(document_id.clone()),
            Json(UpdateDocumentInput {
                title: Some("Unversioned save".into()),
                settings: None,
                expected_revision: None,
                snapshot: Some(json!({"blocks": []})),
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(missing_revision.0, StatusCode::BAD_REQUEST);

        let first_save = update_document(
            State(state.clone()),
            headers(&state, &owner),
            Path(document_id.clone()),
            Json(UpdateDocumentInput {
                title: Some("First save".into()),
                settings: None,
                expected_revision: Some(1),
                snapshot: Some(json!({"title": "First save", "blocks": []})),
            }),
        )
        .await
        .unwrap();
        assert_eq!(first_save.0["revision"], 2);

        let stale = update_document(
            State(state.clone()),
            headers(&state, &owner),
            Path(document_id.clone()),
            Json(UpdateDocumentInput {
                title: Some("Stale overwrite".into()),
                settings: None,
                expected_revision: Some(1),
                snapshot: Some(json!({"title": "Stale overwrite", "blocks": []})),
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(stale.0, StatusCode::CONFLICT);

        let db = state.db.lock().await;
        let (title, revision, snapshots): (String, i64, i64) = db
            .query_row(
                "SELECT d.title, d.current_revision,
                        (SELECT COUNT(*) FROM document_snapshots s WHERE s.document_id = d.id)
                 FROM documents d WHERE d.id = ?1",
                params![document_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!((title.as_str(), revision, snapshots), ("First save", 2, 2));
    }
}
