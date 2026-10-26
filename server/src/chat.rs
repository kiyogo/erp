use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, params};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ADMIN_ROLE, ApiError, ApiResult, AppState, User, authenticated_user};

const DEFAULT_CHANNELS: &[(&str, &str, &str, &str, &str, bool)] = &[
    (
        "1343452674535718912",
        "chung",
        "TEXT",
        "KÊNH VĂN BẢN",
        "Kênh trao đổi công việc và thảo luận chung toàn công ty",
        false,
    ),
    (
        "1343452674535718913",
        "thông-báo-chung",
        "ANNOUNCEMENT",
        "THÔNG BÁO",
        "Kênh thông báo chính thức từ Ban Giám Đốc",
        true,
    ),
    (
        "1343452674535718914",
        "kỹ-thuật-dev",
        "TEXT",
        "KÊNH VĂN BẢN",
        "Thảo luận kỹ thuật, kiến trúc hệ thống và phát triển phần mềm",
        false,
    ),
    (
        "1343452674535718915",
        "kinh-doanh-sale",
        "TEXT",
        "KÊNH VĂN BẢN",
        "Kênh khối kinh doanh và chăm sóc khách hàng",
        false,
    ),
    (
        "1343452674535718916",
        "Phòng Họp Voice 1",
        "VOICE",
        "KÊNH THOẠI",
        "Phòng họp trực tuyến 1",
        false,
    ),
    (
        "1343452674535718917",
        "Phòng Họp Voice 2",
        "VOICE",
        "KÊNH THOẠI",
        "Phòng họp trực tuyến 2",
        false,
    ),
];

#[derive(Clone)]
struct ChannelRow {
    id: String,
    channel_type: String,
    visibility: String,
    name: String,
    kind: String,
    category: String,
    topic: String,
    locked: bool,
    created_by: Option<String>,
    created_at: String,
    updated_at: String,
}

pub fn install_schema(db: &Connection) -> anyhow::Result<()> {
    db.execute_batch(
        "CREATE TABLE IF NOT EXISTS chat_channels (
            id TEXT PRIMARY KEY,
            channel_type TEXT NOT NULL CHECK(channel_type IN ('COMPANY','DM','GROUP_DM')),
            visibility TEXT NOT NULL CHECK(visibility IN ('PUBLIC','PRIVATE')),
            name TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('TEXT','VOICE','ANNOUNCEMENT')),
            category TEXT NOT NULL DEFAULT '',
            topic TEXT NOT NULL DEFAULT '',
            locked INTEGER NOT NULL DEFAULT 0 CHECK(locked IN (0,1)),
            status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','ARCHIVED')),
            thread_key TEXT UNIQUE,
            created_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS chat_channels_status_idx ON chat_channels(status, category, name);
        CREATE TABLE IF NOT EXISTS chat_channel_members (
            channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL DEFAULT 'MEMBER' CHECK(role IN ('OWNER','ADMIN','MEMBER')),
            joined_at TEXT NOT NULL,
            PRIMARY KEY(channel_id,user_id)
        );
        CREATE INDEX IF NOT EXISTS chat_channel_members_user_idx ON chat_channel_members(user_id, channel_id);
        CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
            author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            content TEXT NOT NULL,
            reply_to_id TEXT REFERENCES chat_messages(id) ON DELETE SET NULL,
            attachments_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            edited_at TEXT,
            recalled_at TEXT
        );
        CREATE INDEX IF NOT EXISTS chat_messages_channel_created_idx ON chat_messages(channel_id, created_at DESC, id DESC);
        CREATE TABLE IF NOT EXISTS chat_reactions (
            id TEXT PRIMARY KEY,
            message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            emoji TEXT NOT NULL,
            created_at TEXT NOT NULL,
            UNIQUE(message_id,user_id,emoji)
        );
        CREATE INDEX IF NOT EXISTS chat_reactions_message_idx ON chat_reactions(message_id, created_at);
        CREATE TABLE IF NOT EXISTS chat_channel_read_states (
            channel_id TEXT NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            last_read_at TEXT NOT NULL,
            PRIMARY KEY(channel_id,user_id)
        );",
    )?;
    let now = Utc::now().to_rfc3339();
    for (id, name, kind, category, topic, locked) in DEFAULT_CHANNELS {
        db.execute(
            "INSERT OR IGNORE INTO chat_channels
                (id,channel_type,visibility,name,kind,category,topic,locked,status,created_at,updated_at)
             VALUES (?1,'COMPANY','PUBLIC',?2,?3,?4,?5,?6,'ACTIVE',?7,?7)",
            params![id, name, kind, category, topic, if *locked { 1_i64 } else { 0_i64 }, now],
        )?;
    }
    Ok(())
}

fn channel_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ChannelRow> {
    Ok(ChannelRow {
        id: row.get(0)?,
        channel_type: row.get(1)?,
        visibility: row.get(2)?,
        name: row.get(3)?,
        kind: row.get(4)?,
        category: row.get(5)?,
        topic: row.get(6)?,
        locked: row.get::<_, i64>(7)? != 0,
        created_by: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

fn channel_by_id(db: &Connection, channel_id: &str) -> ApiResult<ChannelRow> {
    db.query_row(
        "SELECT id,channel_type,visibility,name,kind,category,topic,locked,created_by_user_id,created_at,updated_at
         FROM chat_channels WHERE id = ?1 AND status = 'ACTIVE'",
        params![channel_id],
        channel_from_row,
    )
    .optional()
    .map_err(ApiError::internal)?
    .ok_or_else(|| ApiError::not_found("Không tìm thấy kênh chat."))
}

fn require_channel_access(
    db: &Connection,
    channel: &ChannelRow,
    actor: &User,
) -> ApiResult<String> {
    if channel.visibility == "PUBLIC" {
        return Ok(if actor.role == ADMIN_ROLE {
            "ADMIN".to_owned()
        } else {
            "MEMBER".to_owned()
        });
    }
    db.query_row(
        "SELECT role FROM chat_channel_members WHERE channel_id = ?1 AND user_id = ?2",
        params![channel.id, actor.id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(ApiError::internal)?
    .ok_or_else(|| ApiError::not_found("Không tìm thấy kênh chat."))
}

fn public_user(db: &Connection, user_id: &str) -> ApiResult<Value> {
    db.query_row(
        "SELECT u.id,u.email,u.name,COALESCE(p.avatar_url,''),COALESCE(p.position,''),COALESCE(p.department,'')
         FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id
         WHERE u.id = ?1 AND u.is_active = 1",
        params![user_id],
        |row| {
            let id: String = row.get(0)?;
            let email: String = row.get(1)?;
            let name: String = row.get(2)?;
            let avatar: String = row.get(3)?;
            let position: String = row.get(4)?;
            let department: String = row.get(5)?;
            Ok(json!({
                "id": id,
                "email": email,
                "profile": {"fullName": name, "avatarUrl": avatar, "title": position},
                "employee": {"title": position, "department": {"name": department}}
            }))
        },
    )
    .optional()
    .map_err(ApiError::internal)?
    .ok_or_else(|| ApiError::not_found("Không tìm thấy người dùng chat."))
}

fn message_by_id(db: &Connection, message_id: &str) -> ApiResult<Value> {
    db.query_row(
        "SELECT m.id,m.channel_id,m.author_user_id,m.content,m.reply_to_id,m.attachments_json,
                m.created_at,m.updated_at,m.edited_at,m.recalled_at
         FROM chat_messages m WHERE m.id = ?1",
        params![message_id],
        |row| {
            let id: String = row.get(0)?;
            let channel_id: String = row.get(1)?;
            let user_id: String = row.get(2)?;
            let content: String = row.get(3)?;
            let reply_to_id: Option<String> = row.get(4)?;
            let attachments_json: String = row.get(5)?;
            let created_at: String = row.get(6)?;
            let updated_at: String = row.get(7)?;
            let edited_at: Option<String> = row.get(8)?;
            let recalled_at: Option<String> = row.get(9)?;
            Ok((
                id,
                channel_id,
                user_id,
                content,
                reply_to_id,
                attachments_json,
                created_at,
                updated_at,
                edited_at,
                recalled_at,
            ))
        },
    )
    .optional()
    .map_err(ApiError::internal)?
    .map(|(id, channel_id, user_id, content, reply_to_id, attachments_json, created_at, updated_at, edited_at, recalled_at)| {
        let user = public_user(db, &user_id)?;
        let mut statement = db.prepare(
            "SELECT id,message_id,user_id,emoji,created_at FROM chat_reactions WHERE message_id = ?1 ORDER BY created_at,id",
        ).map_err(ApiError::internal)?;
        let reactions = statement.query_map(params![id], |row| Ok(json!({
            "id": row.get::<_,String>(0)?, "messageId": row.get::<_,String>(1)?,
            "userId": row.get::<_,String>(2)?, "emoji": row.get::<_,String>(3)?,
            "createdAt": row.get::<_,String>(4)?
        }))).map_err(ApiError::internal)?.collect::<rusqlite::Result<Vec<_>>>().map_err(ApiError::internal)?;
        let attachments = serde_json::from_str::<Value>(&attachments_json).unwrap_or_else(|_| json!([]));
        Ok(json!({
            "id": id, "channelId": channel_id, "userId": user_id, "content": content,
            "replyToId": reply_to_id, "attachments": attachments, "editedAt": edited_at,
            "recalledAt": recalled_at, "deletedAt": Value::Null, "createdAt": created_at,
            "updatedAt": updated_at, "user": user, "reactions": reactions
        }))
    })
    .transpose()?
    .ok_or_else(|| ApiError::not_found("Không tìm thấy tin nhắn."))
}

fn channel_summary(db: &Connection, channel: &ChannelRow, actor: &User) -> ApiResult<Value> {
    let membership = if channel.visibility == "PRIVATE" {
        db.query_row(
            "SELECT role FROM chat_channel_members WHERE channel_id = ?1 AND user_id = ?2",
            params![channel.id, actor.id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .map(|role| json!({"role": role, "isPinned": false, "lastReadAt": Value::Null}))
    } else {
        Some(json!({
            "role": if actor.role == ADMIN_ROLE {"ADMIN"} else {"MEMBER"},
            "isPinned": false,
            "lastReadAt": Value::Null
        }))
    };
    let name =
        if channel.channel_type == "DM" || channel.channel_type == "GROUP_DM" {
            let mut stmt = db.prepare(
            "SELECT u.id,u.name FROM chat_channel_members cm JOIN users u ON u.id = cm.user_id
             WHERE cm.channel_id = ?1 ORDER BY cm.joined_at,u.name",
        ).map_err(ApiError::internal)?;
            let members = stmt
                .query_map(params![channel.id], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(ApiError::internal)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(ApiError::internal)?;
            if channel.channel_type == "DM" {
                members
                    .iter()
                    .find(|(id, _)| id != &actor.id)
                    .map(|(_, name)| name.clone())
                    .unwrap_or_else(|| channel.name.clone())
            } else {
                members
                    .iter()
                    .filter(|(id, _)| id != &actor.id)
                    .map(|(_, name)| name.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            }
        } else {
            channel.name.clone()
        };
    let read_at: Option<String> = db.query_row(
        "SELECT last_read_at FROM chat_channel_read_states WHERE channel_id = ?1 AND user_id = ?2",
        params![channel.id, actor.id],
        |row| row.get(0),
    ).optional().map_err(ApiError::internal)?;
    let unread: i64 = db.query_row(
        "SELECT COUNT(*) FROM chat_messages WHERE channel_id = ?1 AND author_user_id <> ?2 AND (?3 IS NULL OR created_at > ?3)",
        params![channel.id, actor.id, read_at],
        |row| row.get(0),
    ).map_err(ApiError::internal)?;
    let last_message_id: Option<String> = db.query_row(
        "SELECT id FROM chat_messages WHERE channel_id = ?1 ORDER BY created_at DESC,id DESC LIMIT 1",
        params![channel.id],
        |row| row.get(0),
    ).optional().map_err(ApiError::internal)?;
    let last_message = last_message_id
        .map(|id| message_by_id(db, &id))
        .transpose()?;
    Ok(json!({
        "id": channel.id,
        "companyId": "kiyovn",
        "type": channel.channel_type,
        "visibility": channel.visibility,
        "name": name,
        "description": channel.topic,
        "status": "ACTIVE",
        "createdById": channel.created_by,
        "createdAt": channel.created_at,
        "updatedAt": channel.updated_at,
        "kind": channel.kind,
        "category": channel.category,
        "topic": channel.topic,
        "locked": channel.locked,
        "membership": membership,
        "unreadCount": unread,
        "lastMessage": last_message
    }))
}

pub async fn list_channels(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db.prepare(
        "SELECT id,channel_type,visibility,name,kind,category,topic,locked,created_by_user_id,created_at,updated_at
         FROM chat_channels c WHERE status = 'ACTIVE' AND (
           visibility = 'PUBLIC' OR EXISTS(SELECT 1 FROM chat_channel_members cm WHERE cm.channel_id = c.id AND cm.user_id = ?1)
         ) ORDER BY CASE WHEN channel_type = 'COMPANY' THEN 0 ELSE 1 END, category, name",
    ).map_err(ApiError::internal)?;
    let channels = statement
        .query_map(params![actor.id], channel_from_row)
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    let result = channels
        .iter()
        .map(|channel| channel_summary(&db, channel, &actor))
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({"data": result})))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MessagePageQuery {
    before: Option<String>,
    limit: Option<usize>,
}

pub async fn list_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<String>,
    Query(query): Query<MessagePageQuery>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let channel = channel_by_id(&db, &channel_id)?;
    require_channel_access(&db, &channel, &actor)?;
    let limit = query.limit.unwrap_or(100).clamp(1, 100);
    let mut statement = db
        .prepare(
            "SELECT id,created_at FROM chat_messages WHERE channel_id = ?1 AND (
           ?2 IS NULL OR (created_at,id) < (
             SELECT created_at,id FROM chat_messages WHERE id = ?2 AND channel_id = ?1
           )
         )
         ORDER BY created_at DESC,id DESC LIMIT ?3",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![channel_id, query.before, limit as i64 + 1], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    let has_more = rows.len() > limit;
    let mut rows = rows.into_iter().take(limit).collect::<Vec<_>>();
    let next_cursor = rows.last().map(|(id, _)| id.clone());
    rows.reverse();
    let messages = rows
        .iter()
        .map(|(id, _)| message_by_id(&db, id))
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(
        json!({"data": messages, "pagination": {"hasMore": has_more, "nextCursor": next_cursor}}),
    ))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateMessageInput {
    content: String,
    reply_to_id: Option<String>,
    #[serde(default)]
    attachments: Vec<Value>,
}

pub async fn send_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<String>,
    Json(input): Json<CreateMessageInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let content = input.content.trim();
    if content.is_empty() || content.chars().count() > 20_000 {
        return Err(ApiError::unprocessable(
            "Tin nhắn phải có từ 1 đến 20.000 ký tự.",
        ));
    }
    if !input.attachments.is_empty() {
        return Err(ApiError::unprocessable(
            "Upload tệp đính kèm chat chưa được kết nối với kho tệp Rust.",
        ));
    }
    let db = state.db.lock().await;
    let channel = channel_by_id(&db, &channel_id)?;
    require_channel_access(&db, &channel, &actor)?;
    if channel.locked && actor.role != ADMIN_ROLE {
        return Err(ApiError::forbidden(
            "Kênh thông báo chỉ cho quản trị viên gửi tin.",
        ));
    }
    if let Some(reply_to_id) = input.reply_to_id.as_deref() {
        let reply_channel: Option<String> = db
            .query_row(
                "SELECT channel_id FROM chat_messages WHERE id = ?1",
                params![reply_to_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        if reply_channel.as_deref() != Some(channel_id.as_str()) {
            return Err(ApiError::unprocessable(
                "Tin nhắn trả lời phải thuộc cùng kênh.",
            ));
        }
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    db.execute(
        "INSERT INTO chat_messages (id,channel_id,author_user_id,content,reply_to_id,attachments_json,created_at,updated_at)
         VALUES (?1,?2,?3,?4,?5,'[]',?6,?6)",
        params![id, channel_id, actor.id, content, input.reply_to_id, now],
    ).map_err(ApiError::internal)?;
    let message = message_by_id(&db, &id)?;
    Ok(Json(json!({"success": true, "data": message})))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ToggleReactionInput {
    emoji: String,
}

pub async fn toggle_reaction(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(message_id): Path<String>,
    Json(input): Json<ToggleReactionInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let emoji = input.emoji.trim();
    if emoji.is_empty() || emoji.chars().count() > 32 {
        return Err(ApiError::unprocessable("Biểu tượng cảm xúc không hợp lệ."));
    }
    let db = state.db.lock().await;
    let channel_id: Option<String> = db
        .query_row(
            "SELECT channel_id FROM chat_messages WHERE id = ?1",
            params![message_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let channel_id = channel_id.ok_or_else(|| ApiError::not_found("Không tìm thấy tin nhắn."))?;
    let channel = channel_by_id(&db, &channel_id)?;
    require_channel_access(&db, &channel, &actor)?;
    let existing: Option<String> = db
        .query_row(
            "SELECT id FROM chat_reactions WHERE message_id = ?1 AND user_id = ?2 AND emoji = ?3",
            params![message_id, actor.id, emoji],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    if let Some(id) = existing {
        db.execute("DELETE FROM chat_reactions WHERE id = ?1", params![id])
            .map_err(ApiError::internal)?;
    } else {
        db.execute(
            "INSERT INTO chat_reactions (id,message_id,user_id,emoji,created_at) VALUES (?1,?2,?3,?4,?5)",
            params![Uuid::new_v4().to_string(), message_id, actor.id, emoji, Utc::now().to_rfc3339()],
        ).map_err(ApiError::internal)?;
    }
    let message = message_by_id(&db, &message_id)?;
    Ok(Json(json!({"success": true, "data": message})))
}

pub async fn mark_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let channel = channel_by_id(&db, &channel_id)?;
    require_channel_access(&db, &channel, &actor)?;
    db.execute(
        "INSERT INTO chat_channel_read_states (channel_id,user_id,last_read_at) VALUES (?1,?2,?3)
         ON CONFLICT(channel_id,user_id) DO UPDATE SET last_read_at = excluded.last_read_at",
        params![channel_id, actor.id, Utc::now().to_rfc3339()],
    )
    .map_err(ApiError::internal)?;
    Ok(Json(json!({"success": true})))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDirectMessageInput {
    user_ids: Vec<String>,
}

pub async fn create_direct_message(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateDirectMessageInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let mut participants = input
        .user_ids
        .into_iter()
        .filter(|id| id != &actor.id)
        .collect::<Vec<_>>();
    participants.sort();
    participants.dedup();
    if participants.is_empty() || participants.len() > 49 {
        return Err(ApiError::unprocessable(
            "Chọn từ 1 đến 49 người nhận khác nhau.",
        ));
    }
    participants.push(actor.id.clone());
    participants.sort();
    let db = state.db.lock().await;
    let mut names = Vec::with_capacity(participants.len());
    for user_id in &participants {
        let user: Option<String> = db
            .query_row(
                "SELECT name FROM users WHERE id = ?1 AND is_active = 1",
                params![user_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        names.push(user.ok_or_else(|| {
            ApiError::not_found("Không tìm thấy người nhận chat đang hoạt động.")
        })?);
    }
    let thread_key = participants.join("\u{1f}");
    let now = Utc::now().to_rfc3339();
    let tx = db.unchecked_transaction().map_err(ApiError::internal)?;
    tx.execute(
        "INSERT OR IGNORE INTO chat_channels
            (id,channel_type,visibility,name,kind,category,topic,locked,status,thread_key,created_by_user_id,created_at,updated_at)
         VALUES (?1,?2,'PRIVATE',?3,'TEXT','TIN NHẮN','',0,'ACTIVE',?4,?5,?6,?6)",
        params![
            Uuid::new_v4().to_string(),
            if participants.len() == 2 { "DM" } else { "GROUP_DM" },
            names.join(", "),
            thread_key,
            actor.id,
            now
        ],
    ).map_err(ApiError::internal)?;
    let channel_id: String = tx
        .query_row(
            "SELECT id FROM chat_channels WHERE thread_key = ?1",
            params![thread_key],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    for user_id in &participants {
        tx.execute(
            "INSERT OR IGNORE INTO chat_channel_members (channel_id,user_id,role,joined_at) VALUES (?1,?2,?3,?4)",
            params![channel_id, user_id, if user_id == &actor.id {"OWNER"} else {"MEMBER"}, now],
        ).map_err(ApiError::internal)?;
    }
    tx.commit().map_err(ApiError::internal)?;
    let channel = channel_by_id(&db, &channel_id)?;
    let summary = channel_summary(&db, &channel, &actor)?;
    Ok(Json(json!({"success": true, "data": summary})))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatUserQuery {
    search: Option<String>,
}

pub async fn list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ChatUserQuery>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let search = query.search.unwrap_or_default().trim().to_lowercase();
    let db = state.db.lock().await;
    let mut statement = db.prepare(
        "SELECT u.id,u.name,u.email,COALESCE(p.employee_code,''),COALESCE(p.department,''),COALESCE(p.position,'')
         FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id
         WHERE u.is_active = 1 AND u.id <> ?1 AND (
           ?2 = '' OR lower(u.name) LIKE '%' || ?2 || '%' OR lower(u.email) LIKE '%' || ?2 || '%' OR lower(p.employee_code) LIKE '%' || ?2 || '%'
         ) ORDER BY u.name LIMIT 50",
    ).map_err(ApiError::internal)?;
    let rows = statement.query_map(params![actor.id, search], |row| Ok(json!({
        "id": row.get::<_,String>(0)?, "name": row.get::<_,String>(1)?, "email": row.get::<_,String>(2)?,
        "employeeCode": row.get::<_,String>(3)?, "department": row.get::<_,String>(4)?, "position": row.get::<_,String>(5)?
    }))).map_err(ApiError::internal)?.collect::<rusqlite::Result<Vec<_>>>().map_err(ApiError::internal)?;
    Ok(Json(json!({"data": rows})))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{StatusCode, header::AUTHORIZATION};
    use jsonwebtoken::{DecodingKey, EncodingKey};
    use std::{path::PathBuf, sync::Arc};
    use tokio::sync::Mutex;

    fn setup() -> (AppState, User, User) {
        let db = Connection::open_in_memory().unwrap();
        crate::init_database(&db).unwrap();
        let now = Utc::now().to_rfc3339();
        let admin = test_user("chat-admin", "Chat Admin", "ADMIN", &now);
        let employee = test_user("chat-employee", "Chat Employee", "USER", &now);
        for user in [&admin, &employee] {
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'unused',1,?5,?5)",
                params![user.id, user.email, user.name, user.role, now],
            ).unwrap();
        }
        db.execute(
            "INSERT INTO employee_profiles (user_id,employee_code,department,position,created_at,updated_at)
             VALUES (?1,'EMP-CHAT','Kỹ thuật','Kỹ sư',?2,?2)",
            params![employee.id, now],
        ).unwrap();
        let secret = b"chat-route-test-secret-long-enough";
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: EncodingKey::from_secret(secret),
            jwt_decoding: DecodingKey::from_secret(secret),
            storage_dir: Arc::new(PathBuf::from("test-storage")),
            crm_crypto: None,
        };
        (state, admin, employee)
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
        headers.insert(AUTHORIZATION, format!("Bearer {token}").parse().unwrap());
        headers
    }

    #[tokio::test]
    async fn chat_messages_are_persistent_authenticated_and_announcement_is_admin_only() {
        let (state, admin, employee) = setup();
        let anonymous = list_channels(State(state.clone()), HeaderMap::new())
            .await
            .unwrap_err();
        assert_eq!(anonymous.0, StatusCode::UNAUTHORIZED);

        let channels = list_channels(State(state.clone()), headers(&state, &employee))
            .await
            .unwrap();
        assert_eq!(
            channels.0["data"].as_array().unwrap().len(),
            DEFAULT_CHANNELS.len()
        );
        assert!(
            channels.0["data"]
                .as_array()
                .unwrap()
                .iter()
                .any(|channel| channel["id"] == "1343452674535718912")
        );

        let sent = send_message(
            State(state.clone()),
            headers(&state, &employee),
            Path("1343452674535718912".to_owned()),
            Json(CreateMessageInput {
                content: "  Xin chào 👋  ".to_owned(),
                reply_to_id: None,
                attachments: vec![],
            }),
        )
        .await
        .unwrap();
        let message_id = sent.0["data"]["id"].as_str().unwrap().to_owned();
        assert_eq!(sent.0["data"]["content"], "Xin chào 👋");
        assert_eq!(
            sent.0["data"]["user"]["profile"]["fullName"],
            "Chat Employee"
        );
        assert_eq!(
            sent.0["data"]["user"]["employee"]["department"]["name"],
            "Kỹ thuật"
        );

        let forbidden = send_message(
            State(state.clone()),
            headers(&state, &employee),
            Path("1343452674535718913".to_owned()),
            Json(CreateMessageInput {
                content: "Thông báo giả".to_owned(),
                reply_to_id: None,
                attachments: vec![],
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(forbidden.0, StatusCode::FORBIDDEN);

        let admin_post = send_message(
            State(state.clone()),
            headers(&state, &admin),
            Path("1343452674535718913".to_owned()),
            Json(CreateMessageInput {
                content: "Thông báo chính thức".to_owned(),
                reply_to_id: None,
                attachments: vec![],
            }),
        )
        .await
        .unwrap();
        assert_eq!(admin_post.0["data"]["channelId"], "1343452674535718913");

        let messages = list_messages(
            State(state.clone()),
            headers(&state, &employee),
            Path("1343452674535718912".to_owned()),
            Query(MessagePageQuery::default()),
        )
        .await
        .unwrap();
        assert_eq!(messages.0["data"].as_array().unwrap().len(), 1);
        assert_eq!(messages.0["data"][0]["id"], message_id);
    }

    #[tokio::test]
    async fn message_cursor_pages_stably_when_messages_share_a_timestamp() {
        let (state, _admin, employee) = setup();
        {
            let db = state.db.lock().await;
            let timestamp = "2026-10-08T10:00:00Z";
            for id in ["chat-page-a", "chat-page-b"] {
                db.execute(
                    "INSERT INTO chat_messages (id,channel_id,author_user_id,content,created_at,updated_at)
                     VALUES (?1,'1343452674535718912',?2,?3,?4,?4)",
                    params![id, employee.id, id, timestamp],
                )
                .unwrap();
            }
        }

        let first_page = list_messages(
            State(state.clone()),
            headers(&state, &employee),
            Path("1343452674535718912".to_owned()),
            Query(MessagePageQuery {
                before: None,
                limit: Some(1),
            }),
        )
        .await
        .unwrap();
        assert_eq!(first_page.0["data"][0]["id"], "chat-page-b");
        assert_eq!(first_page.0["pagination"]["nextCursor"], "chat-page-b");
        assert_eq!(first_page.0["pagination"]["hasMore"], true);

        let second_page = list_messages(
            State(state.clone()),
            headers(&state, &employee),
            Path("1343452674535718912".to_owned()),
            Query(MessagePageQuery {
                before: Some("chat-page-b".to_owned()),
                limit: Some(1),
            }),
        )
        .await
        .unwrap();
        assert_eq!(second_page.0["data"][0]["id"], "chat-page-a");
        assert_eq!(second_page.0["pagination"]["hasMore"], false);
    }

    #[tokio::test]
    async fn chat_reactions_replies_read_state_and_private_dm_scope_persist() {
        let (state, _admin, employee) = setup();
        let second = {
            let db = state.db.lock().await;
            let now = Utc::now().to_rfc3339();
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES ('chat-peer','peer@example.test','Chat Peer','USER','unused',1,?1,?1)",
                params![now],
            ).unwrap();
            User {
                id: "chat-peer".into(),
                email: "peer@example.test".into(),
                name: "Chat Peer".into(),
                role: "USER".into(),
                is_active: true,
                created_at: now.clone(),
                updated_at: now,
            }
        };
        let sent = send_message(
            State(state.clone()),
            headers(&state, &employee),
            Path("1343452674535718912".to_owned()),
            Json(CreateMessageInput {
                content: "Parent message".into(),
                reply_to_id: None,
                attachments: vec![],
            }),
        )
        .await
        .unwrap();
        let parent_id = sent.0["data"]["id"].as_str().unwrap().to_owned();
        let reply = send_message(
            State(state.clone()),
            headers(&state, &second),
            Path("1343452674535718912".to_owned()),
            Json(CreateMessageInput {
                content: "Reply".into(),
                reply_to_id: Some(parent_id.clone()),
                attachments: vec![],
            }),
        )
        .await
        .unwrap();
        assert_eq!(reply.0["data"]["replyToId"], parent_id);

        let reaction = toggle_reaction(
            State(state.clone()),
            headers(&state, &second),
            Path(parent_id.clone()),
            Json(ToggleReactionInput {
                emoji: "👍".into()
            }),
        )
        .await
        .unwrap();
        assert_eq!(reaction.0["data"]["reactions"].as_array().unwrap().len(), 1);
        let removed = toggle_reaction(
            State(state.clone()),
            headers(&state, &second),
            Path(parent_id.clone()),
            Json(ToggleReactionInput {
                emoji: "👍".into()
            }),
        )
        .await
        .unwrap();
        assert!(
            removed.0["data"]["reactions"]
                .as_array()
                .unwrap()
                .is_empty()
        );

        let dm = create_direct_message(
            State(state.clone()),
            headers(&state, &employee),
            Json(CreateDirectMessageInput {
                user_ids: vec![second.id.clone()],
            }),
        )
        .await
        .unwrap();
        let dm_id = dm.0["data"]["id"].as_str().unwrap().to_owned();
        assert_eq!(dm.0["data"]["type"], "DM");
        assert_eq!(dm.0["data"]["name"], "Chat Peer");
        let peer_channels = list_channels(State(state.clone()), headers(&state, &second))
            .await
            .unwrap();
        assert!(
            peer_channels.0["data"]
                .as_array()
                .unwrap()
                .iter()
                .any(|channel| channel["id"] == dm_id)
        );

        let _ = mark_read(
            State(state.clone()),
            headers(&state, &employee),
            Path("1343452674535718912".to_owned()),
        )
        .await
        .unwrap();
        let channels = list_channels(State(state.clone()), headers(&state, &employee))
            .await
            .unwrap();
        let general = channels.0["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|channel| channel["id"] == "1343452674535718912")
            .unwrap();
        assert_eq!(general["unreadCount"], 0);

        let outsider = test_user(
            "chat-outsider",
            "Outsider",
            "USER",
            &Utc::now().to_rfc3339(),
        );
        {
            let db = state.db.lock().await;
            db.execute("INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,'USER','unused',1,?4,?4)", params![outsider.id, outsider.email, outsider.name, outsider.created_at]).unwrap();
        }
        let denied = list_messages(
            State(state.clone()),
            headers(&state, &outsider),
            Path(dm_id),
            Query(MessagePageQuery::default()),
        )
        .await
        .unwrap_err();
        assert_eq!(denied.0, StatusCode::NOT_FOUND);
    }
}
