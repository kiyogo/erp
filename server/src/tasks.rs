use axum::{
    Json,
    body::Bytes,
    extract::{Path, State},
    http::{
        HeaderMap, StatusCode,
        header::{CONTENT_LENGTH, CONTENT_TYPE},
    },
    response::Response,
};
use chrono::{NaiveDate, Utc};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::HashSet;
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, User, authenticated_user};

const PRIORITIES: &[&str] = &["Khẩn cấp", "Cao", "Trung bình", "Thấp"];
const MAX_TASK_BATCH_ASSIGNEES: usize = 1_000;
const STATUSES: &[&str] = &[
    "Chưa bắt đầu",
    "Đang thực hiện",
    "Chờ nghiệm thu",
    "Hoàn thành",
    "Tạm dừng",
];
const EMPLOYEE_STATUSES: &[&str] = &[
    "Chưa bắt đầu",
    "Đang thực hiện",
    "Chờ nghiệm thu",
    "Tạm dừng",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TaskChecklistItem {
    key: String,
    title: String,
    completed: bool,
    sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TaskComment {
    key: String,
    content: String,
    author: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TaskActivity {
    key: String,
    content: String,
    actor: String,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TaskReportAttachment {
    id: String,
    key: String,
    name: String,
    #[serde(default)]
    size: i64,
    #[serde(default, rename = "type")]
    attachment_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct TaskReport {
    key: String,
    content: String,
    author: String,
    progress: i64,
    status: String,
    attachments: Vec<TaskReportAttachment>,
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct EnterpriseTask {
    key: String,
    task_code: String,
    task_title: String,
    description: String,
    project_name: String,
    assignee_id: String,
    assignee: String,
    created_by: String,
    priority: String,
    due_date: String,
    progress: i64,
    status: String,
    created_at: String,
    updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    subtasks: Option<Vec<TaskChecklistItem>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    comments: Option<Vec<TaskComment>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    activities: Option<Vec<TaskActivity>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reports: Option<Vec<TaskReport>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskAssignee {
    id: String,
    name: String,
    employee_code: String,
    department: String,
    position: String,
    role: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateTaskInput {
    task_title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    project_name: String,
    #[serde(default)]
    assignee_id: String,
    priority: Option<String>,
    due_date: Option<String>,
    #[serde(default)]
    checklist: Vec<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateTaskBatchInput {
    task_title: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    project_name: String,
    assignee_ids: Vec<String>,
    priority: Option<String>,
    due_date: Option<String>,
    #[serde(default)]
    checklist: Vec<Value>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct UpdateTaskInput {
    task_title: Option<String>,
    description: Option<String>,
    project_name: Option<String>,
    assignee_id: Option<String>,
    priority: Option<String>,
    due_date: Option<String>,
    progress: Option<Value>,
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AddTaskCommentInput {
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateTaskReportInput {
    #[serde(default)]
    content: String,
    progress: Value,
    status: String,
    #[serde(default)]
    attachments: Vec<TaskReportAttachment>,
}

#[derive(Debug, Deserialize)]
pub(super) struct UpdateChecklistInput {
    completed: Option<bool>,
}

struct TaskRow {
    task: EnterpriseTask,
    created_by_id: String,
}

struct TaskActor {
    user: User,
    employee_code: String,
    department: String,
    position: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TaskProjectAssignees {
    name: String,
    assignee_ids: Vec<String>,
}

struct TaskAssignmentOptions {
    assignees: Vec<TaskAssignee>,
    projects: Vec<TaskProjectAssignees>,
}

struct TaskOrgUnit {
    key: String,
    code: String,
    name: String,
    parent_unit: String,
    manager: String,
}

pub(super) async fn list_task_assignees(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = task_actor(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT u.id, u.name, COALESCE(p.employee_code, ''), \
                    COALESCE(p.department, ''), COALESCE(p.position, ''), u.role \
             FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id \
             WHERE u.role != 'ADMIN' AND u.is_active = 1 \
               AND COALESCE(p.employment_status, 'Chính thức') != 'Đã nghỉ việc' \
             ORDER BY u.name COLLATE NOCASE ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| {
            Ok(TaskAssignee {
                id: row.get(0)?,
                name: row.get(1)?,
                employee_code: row.get(2)?,
                department: row.get(3)?,
                position: row.get(4)?,
                role: row.get(5)?,
            })
        })
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    let options = task_assignment_options(&db, &actor, rows)?;
    Ok(Json(
        json!({ "data": options.assignees, "projects": options.projects }),
    ))
}

pub(super) async fn list_tasks(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = task_actor(&state, &headers).await?;
    let db = state.db.lock().await;
    let tasks = read_tasks(&db, &actor)?;
    Ok(Json(json!({ "data": tasks })))
}

pub(super) async fn get_task(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(task_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = task_actor(&state, &headers).await?;
    let db = state.db.lock().await;
    let task = read_task_detail(&db, &task_id)?;
    ensure_task_access(&actor, &task)?;
    Ok(Json(json!({ "task": task.task })))
}

pub(super) async fn create_task(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateTaskInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = task_actor(&state, &headers).await?;
    let title = required_text(input.task_title, "Tên nhiệm vụ", 500)?;
    let description = optional_text(input.description, "Mô tả nhiệm vụ", 4_000)?;
    let project_name = optional_text(input.project_name, "Đơn vị", 200)?;
    let priority = one_of(
        input.priority.unwrap_or_else(|| "Trung bình".to_owned()),
        "Độ ưu tiên",
        PRIORITIES,
    )?;
    let due_date = match input.due_date {
        Some(value) if !value.trim().is_empty() => required_date(value, "Hạn hoàn thành")?,
        _ => (Utc::now() + chrono::Duration::days(7))
            .format("%Y-%m-%d")
            .to_string(),
    };
    if input.checklist.len() > 30 {
        return Err(ApiError::unprocessable("Checklist tối đa 30 hạng mục."));
    }
    let checklist = input
        .checklist
        .into_iter()
        .enumerate()
        .map(|(index, value)| {
            let title = value
                .as_str()
                .map(str::to_owned)
                .or_else(|| {
                    value
                        .get("title")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                })
                .unwrap_or_default();
            required_text(title, &format!("Hạng mục checklist {}", index + 1), 300)
        })
        .collect::<ApiResult<Vec<_>>>()?;

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let assignee = find_assignee(&transaction, &input.assignee_id)?
        .ok_or_else(|| ApiError::unprocessable("Người thực hiện không tồn tại."))?;
    authorize_task_assignment(&transaction, &actor, &project_name, &assignee.0)?;
    let id = Uuid::new_v4().to_string();
    let code = unique_task_code(&transaction)?;
    let timestamp = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO tasks (id, code, title, description, project_name, assignee_id, created_by, priority, due_date, progress, status, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 'Chưa bắt đầu', ?10, ?10)",
            params![id, code, title, description, project_name, assignee.0, actor.user.id, priority, due_date, timestamp],
        )
        .map_err(ApiError::internal)?;
    for (index, item) in checklist.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO task_checklist_items (id, task_id, title, is_completed, sort_order) VALUES (?1, ?2, ?3, 0, ?4)",
                params![Uuid::new_v4().to_string(), id, item, index as i64],
            )
            .map_err(ApiError::internal)?;
    }
    record_activity(
        &transaction,
        &id,
        &actor.user.id,
        &format!("Đã tạo nhiệm vụ \"{title}\" cho {}.", assignee.1),
        &timestamp,
    )?;
    let task = read_task_detail(&transaction, &id)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "task": task.task }))))
}

pub(super) async fn create_task_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateTaskBatchInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = task_actor(&state, &headers).await?;
    if input.assignee_ids.is_empty() {
        return Err(ApiError::unprocessable(
            "Chọn ít nhất một người thực hiện cho lô nhiệm vụ.",
        ));
    }
    if input.assignee_ids.len() > MAX_TASK_BATCH_ASSIGNEES {
        return Err(ApiError::unprocessable(format!(
            "Mỗi lô tối đa {MAX_TASK_BATCH_ASSIGNEES} người thực hiện."
        )));
    }
    let title = required_text(input.task_title, "Tên nhiệm vụ", 500)?;
    let description = optional_text(input.description, "Mô tả nhiệm vụ", 4_000)?;
    let project_name = optional_text(input.project_name, "Đơn vị", 200)?;
    let priority = one_of(
        input.priority.unwrap_or_else(|| "Trung bình".to_owned()),
        "Độ ưu tiên",
        PRIORITIES,
    )?;
    let due_date = match input.due_date {
        Some(value) if !value.trim().is_empty() => required_date(value, "Hạn hoàn thành")?,
        _ => (Utc::now() + chrono::Duration::days(7))
            .format("%Y-%m-%d")
            .to_string(),
    };
    if input.checklist.len() > 30 {
        return Err(ApiError::unprocessable("Checklist tối đa 30 hạng mục."));
    }
    let checklist = input
        .checklist
        .into_iter()
        .enumerate()
        .map(|(index, value)| {
            let title = value
                .as_str()
                .map(str::to_owned)
                .or_else(|| {
                    value
                        .get("title")
                        .and_then(Value::as_str)
                        .map(str::to_owned)
                })
                .unwrap_or_default();
            required_text(title, &format!("Hạng mục checklist {}", index + 1), 300)
        })
        .collect::<ApiResult<Vec<_>>>()?;

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let mut seen_assignees = HashSet::with_capacity(input.assignee_ids.len());
    let mut tasks = Vec::with_capacity(input.assignee_ids.len());
    for requested_assignee in input.assignee_ids {
        let (assignee_id, assignee_name) = find_assignee(&transaction, &requested_assignee)?
            .ok_or_else(|| {
                ApiError::unprocessable(
                    "Một người thực hiện không tồn tại, không hoạt động hoặc đã nghỉ việc.",
                )
            })?;
        if !seen_assignees.insert(assignee_id.clone()) {
            return Err(ApiError::unprocessable(
                "Không thể thêm cùng một người thực hiện nhiều lần trong một lô.",
            ));
        }
        authorize_task_assignment(&transaction, &actor, &project_name, &assignee_id)?;

        let id = Uuid::new_v4().to_string();
        let code = unique_task_code(&transaction)?;
        let timestamp = Utc::now().to_rfc3339();
        transaction
            .execute(
                "INSERT INTO tasks (id, code, title, description, project_name, assignee_id, created_by, priority, due_date, progress, status, created_at, updated_at) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, 'Chưa bắt đầu', ?10, ?10)",
                params![id, code, title, description, project_name, assignee_id, actor.user.id, priority, due_date, timestamp],
            )
            .map_err(ApiError::internal)?;
        for (index, item) in checklist.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO task_checklist_items (id, task_id, title, is_completed, sort_order) VALUES (?1, ?2, ?3, 0, ?4)",
                    params![Uuid::new_v4().to_string(), id, item, index as i64],
                )
                .map_err(ApiError::internal)?;
        }
        record_activity(
            &transaction,
            &id,
            &actor.user.id,
            &format!("Đã tạo nhiệm vụ \"{title}\" cho {assignee_name}."),
            &timestamp,
        )?;
        tasks.push(read_task_detail(&transaction, &id)?.task);
    }
    let count = tasks.len();
    transaction.commit().map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "tasks": tasks, "count": count })),
    ))
}

pub(super) async fn update_task(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(task_id): Path<String>,
    Json(input): Json<UpdateTaskInput>,
) -> ApiResult<Json<Value>> {
    let actor = task_actor(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let current = read_task_detail(&transaction, &task_id)?;
    ensure_task_access(&actor, &current)?;
    let is_admin = actor.user.role == "ADMIN";
    if !is_admin
        && current.task.assignee_id != actor.user.id
        && current.task.assignee_id != actor.employee_code
    {
        return Err(ApiError::forbidden(
            "Chỉ người thực hiện mới có thể cập nhật tiến độ nhiệm vụ.",
        ));
    }
    if !is_admin
        && (input.task_title.is_some()
            || input.description.is_some()
            || input.project_name.is_some()
            || input.assignee_id.is_some()
            || input.priority.is_some()
            || input.due_date.is_some())
    {
        return Err(ApiError::forbidden(
            "Nhân viên chỉ được cập nhật tiến độ và trạng thái nhiệm vụ của mình.",
        ));
    }

    let title = match input.task_title {
        Some(value) if is_admin => required_text(value, "Tên nhiệm vụ", 500)?,
        _ => current.task.task_title.clone(),
    };
    let description = match input.description {
        Some(value) if is_admin => optional_text(value, "Mô tả nhiệm vụ", 4_000)?,
        _ => current.task.description.clone(),
    };
    let project_name = match input.project_name {
        Some(value) if is_admin => optional_text(value, "Đơn vị", 200)?,
        _ => current.task.project_name.clone(),
    };
    let priority = match input.priority {
        Some(value) if is_admin => one_of(value, "Độ ưu tiên", PRIORITIES)?,
        _ => current.task.priority.clone(),
    };
    let due_date = match input.due_date {
        Some(value) if is_admin => required_date(value, "Hạn hoàn thành")?,
        _ => current.task.due_date.clone(),
    };
    let assignee_id = match input.assignee_id {
        Some(value) if is_admin => find_assignee(&transaction, &value)?
            .map(|assignee| assignee.0)
            .ok_or_else(|| ApiError::unprocessable("Người thực hiện không tồn tại."))?,
        _ => current.task.assignee_id.clone(),
    };
    let progress = match input.progress {
        Some(value) => validate_progress(&value)?,
        None => current.task.progress,
    };
    let status = match input.status {
        Some(value) => one_of(
            value,
            "Trạng thái",
            if is_admin {
                STATUSES
            } else {
                EMPLOYEE_STATUSES
            },
        )?,
        None => current.task.status.clone(),
    };
    let timestamp = Utc::now().to_rfc3339();
    transaction
        .execute(
            "UPDATE tasks SET title = ?1, description = ?2, project_name = ?3, assignee_id = ?4, priority = ?5, due_date = ?6, progress = ?7, status = ?8, updated_at = ?9 WHERE id = ?10",
            params![title, description, project_name, assignee_id, priority, due_date, progress, status, timestamp, current.task.key],
        )
        .map_err(ApiError::internal)?;
    if status != current.task.status || progress != current.task.progress {
        let mut changes = Vec::new();
        if status != current.task.status {
            changes.push(format!("Đã đổi trạng thái thành {status}."));
        }
        if progress != current.task.progress {
            changes.push(format!("Đã cập nhật tiến độ {progress}%."));
        }
        record_activity(
            &transaction,
            &current.task.key,
            &actor.user.id,
            &changes.join(" "),
            &timestamp,
        )?;
    }
    let updated = read_task_detail(&transaction, &current.task.key)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "task": updated.task })))
}

pub(super) async fn delete_task(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(task_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = task_actor(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let current = read_task_detail(&transaction, &task_id)?;
    ensure_task_access(&actor, &current)?;
    if actor.user.role != "ADMIN" {
        return Err(ApiError::forbidden(
            "Chỉ Quản trị viên mới có quyền xóa nhiệm vụ.",
        ));
    }
    let storage_keys = {
        let mut statement = transaction
            .prepare("SELECT storage_key FROM task_attachments WHERE task_id = ?1")
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map(params![current.task.key], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(ApiError::internal)?
    };
    transaction
        .execute("DELETE FROM tasks WHERE id = ?1", params![current.task.key])
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    for storage_key in storage_keys {
        let _ = std::fs::remove_file(state.storage_dir.join(storage_key));
    }
    Ok(Json(json!({ "deleted": true })))
}

pub(super) async fn add_task_comment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(task_id): Path<String>,
    Json(input): Json<AddTaskCommentInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = task_actor(&state, &headers).await?;
    let content = required_text(input.content, "Nội dung bình luận", 2_000)?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let task = read_task_detail(&transaction, &task_id)?;
    ensure_task_access(&actor, &task)?;
    let timestamp = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO task_comments (id, task_id, author_id, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![Uuid::new_v4().to_string(), task.task.key, actor.user.id, content, timestamp],
        )
        .map_err(ApiError::internal)?;
    record_activity(
        &transaction,
        &task.task.key,
        &actor.user.id,
        "Đã thêm bình luận.",
        &timestamp,
    )?;
    let updated = read_task_detail(&transaction, &task.task.key)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "task": updated.task }))))
}

pub(super) async fn add_task_report(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(task_id): Path<String>,
    Json(input): Json<CreateTaskReportInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = task_actor(&state, &headers).await?;
    if input.attachments.len() > 10 {
        return Err(ApiError::unprocessable(
            "Tối đa 10 tệp đính kèm cho một báo cáo.",
        ));
    }
    let mut attachments = Vec::with_capacity(input.attachments.len());
    for (index, file) in input.attachments.into_iter().enumerate() {
        attachments.push(TaskReportAttachment {
            id: required_text(file.id, &format!("Tệp đính kèm {}", index + 1), 128)?,
            key: required_text(file.key, &format!("Tệp đính kèm {}", index + 1), 256)?,
            name: required_text(file.name, &format!("Tệp đính kèm {}", index + 1), 255)?,
            size: if file.size < 0 {
                return Err(ApiError::unprocessable("Dung lượng tệp không hợp lệ."));
            } else {
                file.size
            },
            attachment_type: optional_text(
                file.attachment_type,
                &format!("Loại tệp {}", index + 1),
                120,
            )?,
        });
    }
    let content = optional_text(input.content, "Nội dung báo cáo", 4_000)?;
    if content.is_empty() && attachments.is_empty() {
        return Err(ApiError::unprocessable(
            "Vui lòng nhập nội dung báo cáo hoặc đính kèm tệp.",
        ));
    }
    let progress = validate_progress(&input.progress)?;
    let is_admin = actor.user.role == "ADMIN";
    let mut status = input.status;
    if !is_admin && status == "Hoàn thành" {
        status = "Chờ nghiệm thu".to_owned();
    }
    status = one_of(
        status,
        "Trạng thái",
        if is_admin {
            STATUSES
        } else {
            EMPLOYEE_STATUSES
        },
    )?;
    if status == "Chờ nghiệm thu" && progress < 100 {
        status = if progress > 0 {
            "Đang thực hiện"
        } else {
            "Chưa bắt đầu"
        }
        .to_owned();
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let task = read_task_detail(&transaction, &task_id)?;
    ensure_task_access(&actor, &task)?;
    if !is_admin
        && task.task.assignee_id != actor.user.id
        && task.task.assignee_id != actor.employee_code
        && task.created_by_id != actor.user.id
    {
        return Err(ApiError::forbidden(
            "Chỉ người thực hiện mới có thể gửi báo cáo công việc.",
        ));
    }
    for attachment in &attachments {
        let stored: Option<(String, i64, String)> = transaction
            .query_row(
                "SELECT name, size, mime_type FROM task_attachments WHERE id = ?1 AND task_id = ?2",
                params![attachment.id, task.task.key],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()
            .map_err(ApiError::internal)?;
        let Some((name, size, mime_type)) = stored else {
            return Err(ApiError::unprocessable(
                "Tệp đính kèm chưa được tải lên cho nhiệm vụ này.",
            ));
        };
        if attachment.key != attachment.id
            || attachment.name != name
            || attachment.size != size
            || attachment.attachment_type != mime_type
        {
            return Err(ApiError::unprocessable(
                "Thông tin tệp đính kèm không khớp với tệp đã tải lên.",
            ));
        }
    }
    let timestamp = Utc::now().to_rfc3339();
    let attachments_json = serde_json::to_string(&attachments).map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO task_reports (id, task_id, author_id, content, attachments_json, progress, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![Uuid::new_v4().to_string(), task.task.key, actor.user.id, content, attachments_json, progress, status, timestamp],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "UPDATE tasks SET progress = ?1, status = ?2, updated_at = ?3 WHERE id = ?4",
            params![progress, status, timestamp, task.task.key],
        )
        .map_err(ApiError::internal)?;
    record_activity(
        &transaction,
        &task.task.key,
        &actor.user.id,
        "Đã gửi báo cáo công việc.",
        &timestamp,
    )?;
    let updated = read_task_detail(&transaction, &task.task.key)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "task": updated.task }))))
}

pub(super) async fn upload_task_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(task_id): Path<String>,
    body: Bytes,
) -> ApiResult<(StatusCode, Json<Value>)> {
    if body.len() > 50 * 1024 * 1024 {
        return Err(ApiError(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Tệp vượt quá giới hạn 50 MB.".to_owned(),
        ));
    }
    let actor = task_actor(&state, &headers).await?;
    let encoded_name = headers
        .get("x-file-name")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let name = decode_task_file_name(encoded_name)?;
    let mime_type = headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("application/octet-stream")
        .to_owned();
    if mime_type.len() > 120 || mime_type.chars().any(char::is_control) {
        return Err(ApiError::unprocessable("Loại nội dung tệp không hợp lệ."));
    }

    let id = Uuid::new_v4().to_string();
    let storage_key = format!("task-{id}.bin");
    let storage_path = state.storage_dir.join(&storage_key);
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let task = read_task_detail(&transaction, &task_id)?;
    ensure_task_access(&actor, &task)?;
    std::fs::write(&storage_path, &body).map_err(ApiError::internal)?;
    let inserted = transaction.execute(
        "INSERT INTO task_attachments (id, task_id, uploader_id, name, mime_type, size, storage_key, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, task.task.key, actor.user.id, name, mime_type, body.len() as i64, storage_key, timestamp],
    );
    if let Err(error) = inserted {
        let _ = std::fs::remove_file(&storage_path);
        return Err(ApiError::internal(error));
    }
    if let Err(error) = transaction.commit() {
        let _ = std::fs::remove_file(&storage_path);
        return Err(ApiError::internal(error));
    }
    Ok((
        StatusCode::CREATED,
        Json(json!({ "attachment": {
            "id": id,
            "key": id,
            "name": name,
            "size": body.len(),
            "type": mime_type,
        }})),
    ))
}

pub(super) async fn download_task_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((task_id, attachment_id)): Path<(String, String)>,
) -> ApiResult<Response> {
    let actor = task_actor(&state, &headers).await?;
    let db = state.db.lock().await;
    let task = read_task_detail(&db, &task_id)?;
    ensure_task_access(&actor, &task)?;
    let attachment: Option<(String, String, i64)> = db
        .query_row(
            "SELECT storage_key, mime_type, size FROM task_attachments WHERE id = ?1 AND task_id = ?2",
            params![attachment_id, task.task.key],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some((storage_key, mime_type, expected_size)) = attachment else {
        return Err(ApiError::not_found("Không tìm thấy tệp đính kèm."));
    };
    drop(db);
    let content = std::fs::read(state.storage_dir.join(storage_key))
        .map_err(|_| ApiError::not_found("Nội dung tệp không còn tồn tại."))?;
    if content.len() as i64 != expected_size {
        return Err(ApiError::internal("Kích thước tệp lưu trữ không khớp."));
    }
    let mut response = Response::new(axum::body::Body::from(content));
    response.headers_mut().insert(
        CONTENT_TYPE,
        mime_type
            .parse()
            .unwrap_or_else(|_| "application/octet-stream".parse().expect("static header")),
    );
    response.headers_mut().insert(
        CONTENT_LENGTH,
        expected_size
            .to_string()
            .parse()
            .map_err(ApiError::internal)?,
    );
    Ok(response)
}

pub(super) async fn delete_task_attachment(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((task_id, attachment_id)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    let actor = task_actor(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let task = read_task_detail(&transaction, &task_id)?;
    ensure_task_access(&actor, &task)?;
    let attachment: Option<String> = transaction
        .query_row(
            "SELECT storage_key FROM task_attachments WHERE id = ?1 AND task_id = ?2",
            params![attachment_id, task.task.key],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(storage_key) = attachment else {
        return Err(ApiError::not_found("Không tìm thấy tệp đính kèm."));
    };
    let serialized_reports = {
        let mut statement = transaction
            .prepare("SELECT attachments_json FROM task_reports WHERE task_id IN (?1, ?2)")
            .map_err(ApiError::internal)?;
        let rows = statement
            .query_map(params![task.task.key, task.task.task_code], |row| {
                row.get::<_, String>(0)
            })
            .map_err(ApiError::internal)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(ApiError::internal)?
    };
    let is_referenced = serialized_reports.iter().any(|serialized| {
        serde_json::from_str::<Vec<TaskReportAttachment>>(serialized)
            .is_ok_and(|attachments| attachments.iter().any(|item| item.id == attachment_id))
    });
    if is_referenced {
        return Err(ApiError::conflict(
            "Tệp đã được gắn vào báo cáo và không thể xóa.",
        ));
    }
    transaction
        .execute(
            "DELETE FROM task_attachments WHERE id = ?1 AND task_id = ?2",
            params![attachment_id, task.task.key],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    let _ = std::fs::remove_file(state.storage_dir.join(storage_key));
    Ok(Json(json!({ "deleted": true })))
}

fn decode_task_file_name(encoded: &str) -> ApiResult<String> {
    let bytes = encoded.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err(ApiError::unprocessable("Tên tệp không hợp lệ."));
            }
            let hex =
                std::str::from_utf8(&bytes[index + 1..index + 3]).map_err(ApiError::internal)?;
            let byte = u8::from_str_radix(hex, 16).map_err(ApiError::internal)?;
            decoded.push(byte);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    let decoded = String::from_utf8(decoded).map_err(ApiError::internal)?;
    let name = decoded
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or_default()
        .trim();
    if name.is_empty()
        || name.chars().count() > 255
        || name.chars().any(char::is_control)
        || name == "."
        || name == ".."
    {
        return Err(ApiError::unprocessable("Tên tệp không hợp lệ."));
    }
    Ok(name.to_owned())
}

pub(super) async fn update_task_checklist(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((task_id, checklist_id)): Path<(String, String)>,
    Json(input): Json<UpdateChecklistInput>,
) -> ApiResult<Json<Value>> {
    let actor = task_actor(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let task = read_task_detail(&transaction, &task_id)?;
    ensure_task_access(&actor, &task)?;
    let item: Option<(String, bool)> = transaction
        .query_row(
            "SELECT title, is_completed FROM task_checklist_items WHERE id = ?1 AND task_id = ?2",
            params![checklist_id, task.task.key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some((title, was_completed)) = item else {
        return Err(ApiError::not_found("Không tìm thấy hạng mục checklist."));
    };
    let completed = input.completed.unwrap_or(!was_completed);
    transaction
        .execute(
            "UPDATE task_checklist_items SET is_completed = ?1 WHERE id = ?2",
            params![completed, checklist_id],
        )
        .map_err(ApiError::internal)?;
    let (total, completed_count): (i64, i64) = transaction
        .query_row(
            "SELECT COUNT(*), COALESCE(SUM(is_completed), 0) FROM task_checklist_items WHERE task_id = ?1",
            params![task.task.key],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(ApiError::internal)?;
    let progress = if total > 0 {
        ((completed_count * 100 + total / 2) / total) as i64
    } else {
        task.task.progress
    };
    let status = if total > 0 && completed_count == total {
        "Chờ nghiệm thu"
    } else if progress > 0 && task.task.status == "Chưa bắt đầu" {
        "Đang thực hiện"
    } else {
        &task.task.status
    };
    let timestamp = Utc::now().to_rfc3339();
    transaction
        .execute(
            "UPDATE tasks SET progress = ?1, status = ?2, updated_at = ?3 WHERE id = ?4",
            params![progress, status, timestamp, task.task.key],
        )
        .map_err(ApiError::internal)?;
    record_activity(
        &transaction,
        &task.task.key,
        &actor.user.id,
        &format!(
            "{} hạng mục checklist “{title}”.",
            if completed {
                "Đã hoàn thành"
            } else {
                "Đã mở lại"
            }
        ),
        &timestamp,
    )?;
    let updated = read_task_detail(&transaction, &task.task.key)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "task": updated.task })))
}

fn read_active_task_assignees(db: &Connection) -> ApiResult<Vec<TaskAssignee>> {
    let mut statement = db
        .prepare(
            "SELECT u.id, u.name, COALESCE(p.employee_code, ''), \
                    COALESCE(p.department, ''), COALESCE(p.position, ''), u.role \
             FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id \
             WHERE u.role != 'ADMIN' AND u.is_active = 1 \
               AND COALESCE(p.employment_status, 'Chính thức') != 'Đã nghỉ việc' \
             ORDER BY u.name COLLATE NOCASE ASC, u.id ASC",
        )
        .map_err(ApiError::internal)?;
    statement
        .query_map([], |row| {
            Ok(TaskAssignee {
                id: row.get(0)?,
                name: row.get(1)?,
                employee_code: row.get(2)?,
                department: row.get(3)?,
                position: row.get(4)?,
                role: row.get(5)?,
            })
        })
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)
}

fn task_assignment_options(
    db: &Connection,
    actor: &TaskActor,
    all_assignees: Vec<TaskAssignee>,
) -> ApiResult<TaskAssignmentOptions> {
    if actor.user.role == "ADMIN" {
        return Ok(TaskAssignmentOptions {
            assignees: all_assignees,
            projects: Vec::new(),
        });
    }

    let raw_units = {
        let mut statement = db
            .prepare(
                "SELECT record_json FROM collection_records WHERE scope = 'business_org_units'",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(ApiError::internal)?
    };
    let units = raw_units
        .into_iter()
        .filter_map(|serialized| serde_json::from_str::<Value>(&serialized).ok())
        .filter_map(|record| {
            let name = record.get("name")?.as_str()?.trim().to_owned();
            if name.is_empty() || record.get("status").and_then(Value::as_str) == Some("Tạm ngưng")
            {
                return None;
            }
            Some(TaskOrgUnit {
                key: record
                    .get("key")
                    .or_else(|| record.get("id"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim()
                    .to_owned(),
                code: record
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim()
                    .to_owned(),
                name,
                parent_unit: record
                    .get("parentUnit")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim()
                    .to_owned(),
                manager: record
                    .get("manager")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .trim()
                    .to_owned(),
            })
        })
        .collect::<Vec<_>>();

    let mut projects = Vec::new();
    for department in department_values(&actor.department) {
        let term = normalize_scope_value(&department);
        let assignee_ids = all_assignees
            .iter()
            .filter(|person| {
                department_values(&person.department)
                    .iter()
                    .any(|value| normalize_scope_value(value) == term)
            })
            .map(|person| person.id.clone())
            .collect();
        add_task_project(&mut projects, &department, assignee_ids);
    }

    let direct_units = units
        .iter()
        .filter(|unit| actor_manages_task_unit(actor, unit))
        .collect::<Vec<_>>();
    let direct_aliases = direct_units
        .iter()
        .flat_map(|unit| task_unit_aliases(unit))
        .collect::<HashSet<_>>();
    for unit in &direct_units {
        let aliases = task_unit_aliases(unit);
        let assignee_ids = all_assignees
            .iter()
            .filter(|person| person_matches_unit_terms(person, &aliases))
            .map(|person| person.id.clone())
            .collect();
        add_task_project(&mut projects, &unit.name, assignee_ids);
    }

    for unit in units.iter().filter(|unit| {
        !unit.parent_unit.is_empty()
            && direct_aliases.contains(&normalize_scope_value(&unit.parent_unit))
    }) {
        let Some(manager_id) = resolve_task_unit_manager(&unit.manager, &all_assignees) else {
            continue;
        };
        let assignee_ids = if manager_id == actor.user.id {
            let aliases = task_unit_aliases(unit);
            all_assignees
                .iter()
                .filter(|person| person_matches_unit_terms(person, &aliases))
                .map(|person| person.id.clone())
                .collect()
        } else {
            vec![manager_id]
        };
        add_task_project(&mut projects, &unit.name, assignee_ids);
    }

    let mut permitted_ids = projects
        .iter()
        .flat_map(|project| project.assignee_ids.iter().cloned())
        .collect::<HashSet<_>>();
    permitted_ids.insert(actor.user.id.clone());
    let assignees = all_assignees
        .into_iter()
        .filter(|person| permitted_ids.contains(&person.id))
        .collect();
    Ok(TaskAssignmentOptions {
        assignees,
        projects,
    })
}

fn authorize_task_assignment(
    db: &Connection,
    actor: &TaskActor,
    project_name: &str,
    assignee_id: &str,
) -> ApiResult<()> {
    if actor.user.role == "ADMIN" {
        return Ok(());
    }
    let options = task_assignment_options(db, actor, read_active_task_assignees(db)?)?;
    if !options
        .assignees
        .iter()
        .any(|person| person.id == assignee_id)
    {
        return Err(ApiError::forbidden(
            "Bạn chỉ có thể giao nhiệm vụ cho chính mình hoặc nhân sự trong phạm vi đơn vị được quản lý.",
        ));
    }
    if project_name.trim().is_empty() {
        return Ok(());
    }
    let project = options.projects.iter().find(|project| {
        normalize_scope_value(&project.name) == normalize_scope_value(project_name)
    });
    let Some(project) = project else {
        return Err(ApiError::forbidden(
            "Đơn vị/dự án nằm ngoài phạm vi bạn được phép giao nhiệm vụ.",
        ));
    };
    if !project.assignee_ids.iter().any(|id| id == assignee_id) {
        return Err(ApiError::forbidden(
            "Người thực hiện không thuộc phạm vi của đơn vị đã chọn.",
        ));
    }
    Ok(())
}

fn actor_manages_task_unit(actor: &TaskActor, unit: &TaskOrgUnit) -> bool {
    if task_manager_matches_actor(&unit.manager, actor) {
        return true;
    }
    let position = normalize_scope_value(&actor.position);
    let has_management_title = ["trưởng", "giám đốc", "quản lý", "lead", "head"]
        .iter()
        .any(|keyword| position.contains(keyword));
    has_management_title
        && department_values(&actor.department)
            .iter()
            .map(|value| normalize_scope_value(value))
            .any(|department| task_unit_aliases(unit).contains(&department))
}

fn task_manager_matches_actor(manager: &str, actor: &TaskActor) -> bool {
    let manager_values = task_manager_values(manager);
    [
        actor.user.id.as_str(),
        actor.employee_code.as_str(),
        actor.user.name.as_str(),
    ]
    .iter()
    .map(|value| normalize_scope_value(value))
    .filter(|value| !value.is_empty())
    .any(|identity| manager_values.contains(&identity))
}

fn task_manager_values(manager: &str) -> HashSet<String> {
    let mut values = HashSet::new();
    let whole = normalize_scope_value(manager);
    if !whole.is_empty() {
        values.insert(whole);
    }
    if let Some((name, suffix)) = manager.rsplit_once('(') {
        if let Some(code) = suffix.trim().strip_suffix(')') {
            let name = normalize_scope_value(name);
            let code = normalize_scope_value(code);
            if !name.is_empty() {
                values.insert(name);
            }
            if !code.is_empty() {
                values.insert(code);
            }
        }
    }
    values
}

fn resolve_task_unit_manager(manager: &str, assignees: &[TaskAssignee]) -> Option<String> {
    let manager_values = task_manager_values(manager);
    if manager_values.is_empty() || manager_values.contains("chưa phân công") {
        return None;
    }
    let matches = assignees
        .iter()
        .filter(|person| {
            [
                person.id.as_str(),
                person.employee_code.as_str(),
                person.name.as_str(),
            ]
            .iter()
            .map(|value| normalize_scope_value(value))
            .any(|identity| !identity.is_empty() && manager_values.contains(&identity))
        })
        .map(|person| person.id.clone())
        .collect::<HashSet<_>>();
    (matches.len() == 1).then(|| matches.into_iter().next().expect("one task manager"))
}

fn task_unit_aliases(unit: &TaskOrgUnit) -> Vec<String> {
    [&unit.name, &unit.code, &unit.key]
        .iter()
        .map(|value| normalize_scope_value(value))
        .filter(|value| !value.is_empty())
        .collect()
}

fn person_matches_unit_terms(person: &TaskAssignee, terms: &[String]) -> bool {
    department_values(&person.department)
        .iter()
        .map(|value| normalize_scope_value(value))
        .any(|department| terms.contains(&department))
}

fn department_values(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|department| !department.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

fn normalize_scope_value(value: &str) -> String {
    value.trim().to_lowercase()
}

fn add_task_project(projects: &mut Vec<TaskProjectAssignees>, name: &str, ids: Vec<String>) {
    let name = name.trim();
    if name.is_empty() {
        return;
    }
    let mut ids = ids
        .into_iter()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    ids.sort();
    if ids.is_empty() {
        return;
    }
    if let Some(project) = projects
        .iter_mut()
        .find(|project| normalize_scope_value(&project.name) == normalize_scope_value(name))
    {
        project.assignee_ids.extend(ids);
        project.assignee_ids.sort();
        project.assignee_ids.dedup();
    } else {
        projects.push(TaskProjectAssignees {
            name: name.to_owned(),
            assignee_ids: ids,
        });
    }
}

async fn task_actor(state: &AppState, headers: &HeaderMap) -> ApiResult<TaskActor> {
    let user = authenticated_user(state, headers).await?;
    let db = state.db.lock().await;
    let profile = db
        .query_row(
            "SELECT COALESCE(employee_code, ''), COALESCE(department, ''), COALESCE(position, '') \
             FROM employee_profiles WHERE user_id = ?1",
            params![user.id],
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
        .unwrap_or_default();
    Ok(TaskActor {
        user,
        employee_code: profile.0,
        department: profile.1,
        position: profile.2,
    })
}

fn read_tasks(db: &Connection, actor: &TaskActor) -> ApiResult<Vec<EnterpriseTask>> {
    let sql = if actor.user.role == "ADMIN" {
        "SELECT t.id, t.code, t.title, t.description, t.project_name, t.assignee_id, \
                COALESCE(a.name, 'Người thực hiện'), \
                COALESCE(ap.employee_code, t.assignee_id), COALESCE(c.name, 'Hệ thống'), \
                t.priority, t.due_date, t.progress, t.status, t.created_at, t.updated_at \
         FROM tasks t \
         LEFT JOIN users a ON (a.id = t.assignee_id OR t.assignee_id = (SELECT employee_code FROM employee_profiles WHERE user_id = a.id)) \
         LEFT JOIN employee_profiles ap ON ap.user_id = a.id \
         LEFT JOIN users c ON c.id = t.created_by \
         LEFT JOIN employee_profiles cp ON cp.user_id = c.id \
         ORDER BY t.created_at DESC, t.id DESC"
    } else {
        "SELECT t.id, t.code, t.title, t.description, t.project_name, t.assignee_id, \
                COALESCE(a.name, 'Người thực hiện'), \
                COALESCE(ap.employee_code, t.assignee_id), COALESCE(c.name, 'Hệ thống'), \
                t.priority, t.due_date, t.progress, t.status, t.created_at, t.updated_at \
         FROM tasks t \
         LEFT JOIN users a ON (a.id = t.assignee_id OR t.assignee_id = (SELECT employee_code FROM employee_profiles WHERE user_id = a.id)) \
         LEFT JOIN employee_profiles ap ON ap.user_id = a.id \
         LEFT JOIN users c ON c.id = t.created_by \
         LEFT JOIN employee_profiles cp ON cp.user_id = c.id \
         WHERE t.assignee_id IN (?1, ?2) OR t.created_by IN (?1, ?2) \
         ORDER BY t.created_at DESC, t.id DESC"
    };
    let mut statement = db.prepare(sql).map_err(ApiError::internal)?;
    let mapper = |row: &rusqlite::Row<'_>| task_from_row(row);
    let rows = if actor.user.role == "ADMIN" {
        statement
            .query_map([], mapper)
            .map_err(ApiError::internal)?
    } else {
        statement
            .query_map(params![actor.user.id, actor.employee_code], mapper)
            .map_err(ApiError::internal)?
    };
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)
}

fn read_task_detail(db: &Connection, id_or_code: &str) -> ApiResult<TaskRow> {
    let mut task = db
        .query_row(
            "SELECT t.id, t.code, t.title, t.description, t.project_name, t.assignee_id, \
                    COALESCE(a.name, 'Người thực hiện'), COALESCE(ap.employee_code, t.assignee_id), \
                    COALESCE(c.name, 'Hệ thống'), t.priority, t.due_date, t.progress, t.status, \
                    t.created_at, t.updated_at, t.created_by \
             FROM tasks t \
             LEFT JOIN users a ON (a.id = t.assignee_id OR t.assignee_id = (SELECT employee_code FROM employee_profiles WHERE user_id = a.id)) \
             LEFT JOIN employee_profiles ap ON ap.user_id = a.id \
             LEFT JOIN users c ON c.id = t.created_by \
             LEFT JOIN employee_profiles cp ON cp.user_id = c.id \
             WHERE t.id = ?1 OR t.code = ?1 LIMIT 1",
            params![id_or_code],
            |row| {
                Ok((
                    task_from_row(row)?,
                    row.get::<_, String>(15)?,
                ))
            },
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy nhiệm vụ."))?;
    let task_id = task.0.key.clone();
    let code = task.0.task_code.clone();
    let subtasks = read_children(db, &task_id, |db| {
        let mut stmt = db.prepare("SELECT id, title, is_completed, sort_order FROM task_checklist_items WHERE task_id IN (?1, ?2) ORDER BY sort_order ASC, id ASC")?;
        let rows = stmt.query_map(params![task_id, code], |row| {
            Ok(TaskChecklistItem {
                key: row.get(0)?,
                title: row.get(1)?,
                completed: row.get(2)?,
                sort_order: row.get(3)?,
            })
        })?;
        rows.collect()
    })?;
    let comments = read_children(db, &task_id, |db| {
        let mut stmt = db.prepare("SELECT c.id, c.content, u.name, c.created_at FROM task_comments c JOIN users u ON u.id = c.author_id WHERE c.task_id IN (?1, ?2) ORDER BY c.created_at DESC, c.id DESC")?;
        let rows = stmt.query_map(params![task_id, code], |row| {
            Ok(TaskComment {
                key: row.get(0)?,
                content: row.get(1)?,
                author: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        rows.collect()
    })?;
    let activities = read_children(db, &task_id, |db| {
        let mut stmt = db.prepare("SELECT a.id, a.content, u.name, a.created_at FROM task_activities a JOIN users u ON u.id = a.actor_id WHERE a.task_id IN (?1, ?2) ORDER BY a.created_at DESC, a.id DESC")?;
        let rows = stmt.query_map(params![task_id, code], |row| {
            Ok(TaskActivity {
                key: row.get(0)?,
                content: row.get(1)?,
                actor: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        rows.collect()
    })?;
    let reports = read_children(db, &task_id, |db| {
        let mut stmt = db.prepare("SELECT r.id, r.content, u.name, r.progress, r.status, r.attachments_json, r.created_at FROM task_reports r JOIN users u ON u.id = r.author_id WHERE r.task_id IN (?1, ?2) ORDER BY r.created_at DESC, r.id DESC")?;
        let rows = stmt.query_map(params![task_id, code], |row| {
            let serialized: String = row.get(5)?;
            let attachments =
                serde_json::from_str::<Vec<TaskReportAttachment>>(&serialized).unwrap_or_default();
            Ok(TaskReport {
                key: row.get(0)?,
                content: row.get(1)?,
                author: row.get(2)?,
                progress: row.get(3)?,
                status: row.get(4)?,
                attachments,
                created_at: row.get(6)?,
            })
        })?;
        rows.collect()
    })?;
    task.0.subtasks = Some(subtasks);
    task.0.comments = Some(comments);
    task.0.activities = Some(activities);
    task.0.reports = Some(reports);
    Ok(TaskRow {
        task: task.0,
        created_by_id: task.1,
    })
}

fn read_children<T>(
    _db: &Connection,
    _task_id: &str,
    read: impl FnOnce(&Connection) -> rusqlite::Result<Vec<T>>,
) -> ApiResult<Vec<T>> {
    // Kept as a small adapter so each child query can retain its own row mapper.
    read(_db).map_err(ApiError::internal)
}

fn task_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<EnterpriseTask> {
    Ok(EnterpriseTask {
        key: row.get(0)?,
        task_code: row.get(1)?,
        task_title: row.get(2)?,
        description: row.get(3)?,
        project_name: row.get(4)?,
        assignee_id: row.get(5)?,
        assignee: format!(
            "{} ({})",
            row.get::<_, String>(6)?,
            row.get::<_, String>(7)?
        ),
        created_by: row.get(8)?,
        priority: row.get(9)?,
        due_date: row.get(10)?,
        progress: row.get(11)?,
        status: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
        subtasks: None,
        comments: None,
        activities: None,
        reports: None,
    })
}

fn ensure_task_access(actor: &TaskActor, task: &TaskRow) -> ApiResult<()> {
    if actor.user.role != "ADMIN"
        && task.task.assignee_id != actor.user.id
        && task.task.assignee_id != actor.employee_code
        && task.created_by_id != actor.user.id
        && task.created_by_id != actor.employee_code
    {
        return Err(ApiError::forbidden(
            "Bạn không có quyền thao tác nhiệm vụ này.",
        ));
    }
    Ok(())
}

fn find_assignee(db: &Connection, identifier: &str) -> ApiResult<Option<(String, String)>> {
    let identifier = identifier.trim();
    let row = db
        .query_row(
            "SELECT u.id, u.name FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id \
             WHERE u.role != 'ADMIN' AND u.is_active = 1 \
               AND COALESCE(p.employment_status, 'Chính thức') != 'Đã nghỉ việc' \
               AND (u.id = ?1 OR LOWER(COALESCE(p.employee_code, '')) = LOWER(?1)) \
             ORDER BY CASE WHEN u.id = ?1 THEN 0 ELSE 1 END LIMIT 1",
            params![identifier],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(ApiError::internal)?;
    Ok(row)
}

fn unique_task_code(db: &Connection) -> ApiResult<String> {
    let date = Utc::now().format("%Y%m%d").to_string();
    for _ in 0..10 {
        let suffix = Uuid::new_v4().simple().to_string().to_ascii_uppercase();
        let candidate = format!("TASK-{date}-{}", &suffix[..8]);
        let exists: bool = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM tasks WHERE LOWER(code) = LOWER(?1))",
                params![candidate],
                |row| row.get(0),
            )
            .map_err(ApiError::internal)?;
        if !exists {
            return Ok(candidate);
        }
    }
    Err(ApiError::internal("Could not generate a unique task code."))
}

fn record_activity(
    db: &Connection,
    task_id: &str,
    actor_id: &str,
    content: &str,
    timestamp: &str,
) -> ApiResult<()> {
    db.execute(
        "INSERT INTO task_activities (id, task_id, actor_id, content, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![Uuid::new_v4().to_string(), task_id, actor_id, content, timestamp],
    )
    .map_err(ApiError::internal)?;
    Ok(())
}

fn required_text(value: String, field: &str, max_length: usize) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.is_empty() || value.encode_utf16().count() > max_length {
        return Err(ApiError::unprocessable(format!("{field} không hợp lệ.")));
    }
    Ok(value)
}

fn optional_text(value: String, field: &str, max_length: usize) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.encode_utf16().count() > max_length {
        return Err(ApiError::unprocessable(format!(
            "{field} vượt quá độ dài cho phép."
        )));
    }
    Ok(value)
}

fn one_of(value: String, field: &str, allowed: &[&str]) -> ApiResult<String> {
    if !allowed.contains(&value.as_str()) {
        return Err(ApiError::unprocessable(format!("{field} không hợp lệ.")));
    }
    Ok(value)
}

fn required_date(value: String, field: &str) -> ApiResult<String> {
    let value = value.trim().to_owned();
    let parsed = NaiveDate::parse_from_str(&value, "%Y-%m-%d")
        .map_err(|_| ApiError::unprocessable(format!("{field} phải có định dạng YYYY-MM-DD.")))?;
    if parsed.format("%Y-%m-%d").to_string() != value {
        return Err(ApiError::unprocessable(format!(
            "{field} phải có định dạng YYYY-MM-DD."
        )));
    }
    Ok(value)
}

fn validate_progress(value: &Value) -> ApiResult<i64> {
    let progress = match value {
        Value::Number(number) => number.as_i64(),
        Value::String(string) => string.trim().parse::<i64>().ok(),
        _ => None,
    }
    .filter(|progress| (0..=100).contains(progress))
    .ok_or_else(|| ApiError::unprocessable("Tiến độ phải là số nguyên từ 0 đến 100."))?;
    Ok(progress)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use rusqlite::Connection;
    use std::sync::Arc;
    use tokio::sync::Mutex;
    use tower::ServiceExt;
    use tower_http::cors::CorsLayer;

    fn insert_user(db: &Connection, id: &str, role: &str, employee_code: Option<&str>) -> User {
        let now = Utc::now().to_rfc3339();
        let email = format!("{id}@example.test");
        let name = if role == "ADMIN" { "Task Admin" } else { id };
        db.execute(
            "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,'test-hash',1,?5,?5)",
            params![id, email, name, role, now],
        ).expect("insert task test user");
        if let Some(code) = employee_code {
            db.execute(
                "INSERT INTO employee_profiles (user_id,employee_code,created_at,updated_at) VALUES (?1,?2,?3,?3)",
                params![id, code, now],
            ).expect("insert task test profile");
        }
        User {
            id: id.to_owned(),
            email,
            name: name.to_owned(),
            role: role.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        }
    }

    fn test_app() -> (axum::Router, AppState, User, User, User) {
        let db = Connection::open_in_memory().expect("in-memory SQLite");
        crate::init_database(&db).expect("initialize schema");
        let employee = insert_user(&db, "task-employee-1", "USER", Some("NV-TASK-01"));
        let other = insert_user(&db, "task-employee-2", "USER", Some("NV-TASK-02"));
        let admin = insert_user(&db, "task-admin-1", "ADMIN", None);
        let now = Utc::now().to_rfc3339();
        db.execute(
            "UPDATE employee_profiles SET department = 'Operations', position = 'Engineer' WHERE user_id = ?1",
            params![employee.id],
        )
        .expect("employee task department");
        db.execute(
            "UPDATE employee_profiles SET department = 'Finance', position = 'Manager' WHERE user_id = ?1",
            params![other.id],
        )
        .expect("manager task department");
        db.execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES ('business_org_units', 'unit-operations', ?1, ?2, ?2)",
            params![
                json!({
                    "key":"unit-operations",
                    "code":"OPS",
                    "name":"Operations",
                    "parentUnit":"",
                    "manager":other.id,
                    "status":"Đang hoạt động"
                }).to_string(),
                now,
            ],
        )
        .expect("manager unit scope");
        let secret = b"task-test-secret-that-is-long-enough-32-bytes";
        let storage_dir = std::env::temp_dir().join(format!("kiyo-task-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&storage_dir).expect("create task attachment test storage");
        let state = AppState {
            db: Arc::new(Mutex::new(db)),
            jwt_encoding: jsonwebtoken::EncodingKey::from_secret(secret),
            jwt_decoding: jsonwebtoken::DecodingKey::from_secret(secret),
            storage_dir: Arc::new(storage_dir),
            crm_crypto: None,
        };
        let app = crate::router(state.clone(), CorsLayer::new());
        (app, state, employee, other, admin)
    }

    fn token(state: &AppState, user: &User) -> String {
        format!("Bearer {}", crate::issue_token(state, user).expect("JWT"))
    }

    async fn call(
        app: &axum::Router,
        method: &str,
        uri: &str,
        bearer: Option<&str>,
        payload: Option<Value>,
    ) -> axum::response::Response {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(bearer) = bearer {
            builder = builder.header("Authorization", bearer);
        }
        let body = match payload {
            Some(payload) => {
                builder = builder.header("Content-Type", "application/json");
                Body::from(payload.to_string())
            }
            None => Body::empty(),
        };
        app.clone()
            .oneshot(builder.body(body).expect("task HTTP request"))
            .await
            .expect("task HTTP response")
    }

    #[tokio::test]
    async fn task_batch_creation_is_scoped_atomic_and_creates_one_record_per_assignee() {
        let (app, state, employee, manager, admin) = test_app();
        let employee_token = token(&state, &employee);
        let manager_token = token(&state, &manager);
        let admin_token = token(&state, &admin);
        let make_input = |assignee_ids: Vec<String>| {
            json!({
                "taskTitle":"Chuẩn hóa quy trình bàn giao",
                "description":"Tài liệu dùng chung cho từng người thực hiện.",
                "projectName":"",
                "assigneeIds":assignee_ids,
                "priority":"Cao",
                "dueDate":"2026-10-15",
                "checklist":["Rà soát tài liệu"]
            })
        };

        let unauthorized_batch = call(
            &app,
            "POST",
            "/api/v1/tasks/batch",
            Some(&employee_token),
            Some(make_input(vec![employee.id.clone(), manager.id.clone()])),
        )
        .await;
        assert_eq!(unauthorized_batch.status(), StatusCode::FORBIDDEN);
        {
            let db = state.db.lock().await;
            let count: i64 = db
                .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
                .expect("no partial tasks after scope denial");
            assert_eq!(count, 0);
        }

        let duplicate_batch = call(
            &app,
            "POST",
            "/api/v1/tasks/batch",
            Some(&manager_token),
            Some(make_input(vec![
                employee.id.clone(),
                "NV-TASK-01".to_owned(),
            ])),
        )
        .await;
        assert_eq!(duplicate_batch.status(), StatusCode::UNPROCESSABLE_ENTITY);
        {
            let db = state.db.lock().await;
            let count: i64 = db
                .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
                .expect("duplicate batch rolls back");
            assert_eq!(count, 0);
        }

        let created = call(
            &app,
            "POST",
            "/api/v1/tasks/batch",
            Some(&manager_token),
            Some(make_input(vec![employee.id.clone(), manager.id.clone()])),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 64 * 1024)
            .await
            .expect("batch task response body");
        let response: Value = serde_json::from_slice(&body).expect("batch task response JSON");
        assert_eq!(response["count"], 2);
        assert_eq!(response["tasks"].as_array().unwrap().len(), 2);
        let assignee_ids = response["tasks"]
            .as_array()
            .unwrap()
            .iter()
            .map(|task| task["assigneeId"].as_str().unwrap().to_owned())
            .collect::<HashSet<_>>();
        assert_eq!(
            assignee_ids,
            HashSet::from([employee.id.clone(), manager.id.clone()])
        );
        let codes = response["tasks"]
            .as_array()
            .unwrap()
            .iter()
            .map(|task| task["taskCode"].as_str().unwrap().to_owned())
            .collect::<HashSet<_>>();
        assert_eq!(codes.len(), 2);

        let admin_batch = call(
            &app,
            "POST",
            "/api/v1/tasks/batch",
            Some(&admin_token),
            Some(make_input(vec![employee.id.clone(), manager.id.clone()])),
        )
        .await;
        assert_eq!(admin_batch.status(), StatusCode::CREATED);
        let db = state.db.lock().await;
        let (task_count, checklist_count, activity_count): (i64, i64, i64) = db
            .query_row(
                "SELECT (SELECT COUNT(*) FROM tasks), (SELECT COUNT(*) FROM task_checklist_items), (SELECT COUNT(*) FROM task_activities)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("batch rows and child rows persisted");
        assert_eq!(task_count, 4);
        assert_eq!(checklist_count, 4);
        assert_eq!(activity_count, 4);
        drop(db);
        std::fs::remove_dir_all(&*state.storage_dir).expect("remove batch task test storage");
    }

    #[tokio::test]
    async fn manager_scope_limits_child_unit_to_its_configured_manager() {
        let (_app, state, _employee, parent_manager, _admin) = test_app();
        let db = state.db.lock().await;
        let child_manager = insert_user(&db, "task-child-manager", "USER", Some("NV-CHILD-MGR"));
        let child_worker = insert_user(&db, "task-child-worker", "USER", Some("NV-CHILD-WORKER"));
        db.execute(
            "UPDATE employee_profiles SET department = 'Field Operations', position = 'Team Lead' WHERE user_id = ?1",
            params![child_manager.id],
        )
        .expect("child manager profile");
        db.execute(
            "UPDATE employee_profiles SET department = 'Field Operations', position = 'Engineer' WHERE user_id = ?1",
            params![child_worker.id],
        )
        .expect("child worker profile");
        let now = Utc::now().to_rfc3339();
        db.execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES ('business_org_units', 'unit-field-operations', ?1, ?2, ?2)",
            params![
                json!({
                    "key":"unit-field-operations",
                    "code":"FIELD-OPS",
                    "name":"Field Operations",
                    "parentUnit":"Operations",
                    "manager":child_manager.id,
                    "status":"Đang hoạt động"
                }).to_string(),
                now,
            ],
        )
        .expect("child unit record");

        let actor = TaskActor {
            user: parent_manager,
            employee_code: "NV-TASK-02".to_owned(),
            department: "Finance".to_owned(),
            position: "Manager".to_owned(),
        };
        let options =
            task_assignment_options(&db, &actor, read_active_task_assignees(&db).unwrap()).unwrap();
        let child_project = options
            .projects
            .iter()
            .find(|project| project.name == "Field Operations")
            .expect("child unit assignment option");
        assert_eq!(child_project.assignee_ids, vec![child_manager.id]);
        assert!(!child_project.assignee_ids.contains(&child_worker.id));
        drop(db);
        std::fs::remove_dir_all(&*state.storage_dir).expect("remove child-scope test storage");
    }

    #[test]
    fn validates_task_date_progress_and_status_contracts() {
        assert_eq!(
            required_date("2026-10-08".to_owned(), "due").unwrap(),
            "2026-10-08"
        );
        assert!(required_date("2026-02-30".to_owned(), "due").is_err());
        assert_eq!(validate_progress(&json!(100)).unwrap(), 100);
        assert!(validate_progress(&json!(101)).is_err());
        assert!(validate_progress(&json!(1.5)).is_err());
        assert!(one_of("Khẩn cấp".to_owned(), "priority", PRIORITIES).is_ok());
        assert!(one_of("unknown".to_owned(), "priority", PRIORITIES).is_err());
        assert_eq!(
            decode_task_file_name("B%C3%A1o-c%C3%A1o.pdf").unwrap(),
            "Báo-cáo.pdf"
        );
        assert!(decode_task_file_name("%00bad.txt").is_err());
    }

    #[tokio::test]
    async fn task_lifecycle_persists_and_enforces_assignment_permissions() {
        let (app, state, employee, other, admin) = test_app();
        let admin_token = token(&state, &admin);
        let employee_token = token(&state, &employee);
        let other_token = token(&state, &other);

        let employee_assignees = call(
            &app,
            "GET",
            "/api/v1/tasks/assignees",
            Some(&employee_token),
            None,
        )
        .await;
        assert_eq!(employee_assignees.status(), StatusCode::OK);
        let body = axum::body::to_bytes(employee_assignees.into_body(), 8 * 1024)
            .await
            .expect("scoped employee options");
        let employee_options: Value = serde_json::from_slice(&body).expect("employee options JSON");
        assert_eq!(employee_options["data"].as_array().unwrap().len(), 1);
        assert_eq!(employee_options["data"][0]["id"], employee.id);

        let manager_assignees = call(
            &app,
            "GET",
            "/api/v1/tasks/assignees",
            Some(&other_token),
            None,
        )
        .await;
        assert_eq!(manager_assignees.status(), StatusCode::OK);
        let body = axum::body::to_bytes(manager_assignees.into_body(), 8 * 1024)
            .await
            .expect("manager options");
        let manager_options: Value = serde_json::from_slice(&body).expect("manager options JSON");
        assert_eq!(manager_options["data"].as_array().unwrap().len(), 2);
        assert_eq!(manager_options["projects"][0]["name"], "Finance");
        let operations = manager_options["projects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|project| project["name"] == "Operations")
            .expect("managed unit project option");
        assert_eq!(operations["assigneeIds"].as_array().unwrap().len(), 1);
        assert_eq!(operations["assigneeIds"][0], employee.id);

        let employee_create = call(
            &app,
            "POST",
            "/api/v1/tasks",
            Some(&employee_token),
            Some(json!({"taskTitle":"Không được giao chéo đơn vị","projectName":"Finance","assigneeId":other.id,"dueDate":"2026-10-15"})),
        ).await;
        assert_eq!(employee_create.status(), StatusCode::FORBIDDEN);

        let manager_create = call(
            &app,
            "POST",
            "/api/v1/tasks",
            Some(&other_token),
            Some(json!({
                "taskTitle":"Nhiệm vụ trong đơn vị quản lý",
                "projectName":"Operations",
                "assigneeId":employee.id,
                "dueDate":"2026-10-15"
            })),
        )
        .await;
        assert_eq!(manager_create.status(), StatusCode::CREATED);

        let created = call(
            &app,
            "POST",
            "/api/v1/tasks",
            Some(&admin_token),
            Some(json!({
                "taskTitle":"Chuẩn hóa quy trình tiếp nhận",
                "description":"Hoàn thiện checklist và ghi nhận kết quả.",
                "projectName":"Vận hành",
                "assigneeId":employee.id,
                "priority":"Cao",
                "dueDate":"2026-10-15",
                "checklist":["Rà soát quy trình","Kiểm tra với nhóm"]
            })),
        )
        .await;
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 32 * 1024)
            .await
            .expect("created task body");
        let created: Value = serde_json::from_slice(&body).expect("created task JSON");
        let task_id = created["task"]["key"]
            .as_str()
            .expect("task key")
            .to_owned();
        let checklist_id = created["task"]["subtasks"][0]["key"]
            .as_str()
            .expect("checklist key")
            .to_owned();
        assert!(
            created["task"]["taskCode"]
                .as_str()
                .unwrap()
                .starts_with("TASK-")
        );
        assert_eq!(created["task"]["assigneeId"], employee.id);
        assert_eq!(created["task"]["subtasks"].as_array().unwrap().len(), 2);
        assert_eq!(created["task"]["activities"].as_array().unwrap().len(), 1);

        let employee_list = call(&app, "GET", "/api/v1/tasks", Some(&employee_token), None).await;
        let body = axum::body::to_bytes(employee_list.into_body(), 16 * 1024)
            .await
            .expect("employee task list");
        let employee_list: Value = serde_json::from_slice(&body).expect("employee task JSON");
        assert_eq!(employee_list["data"].as_array().unwrap().len(), 2);

        let own_detail = call(
            &app,
            "GET",
            &format!("/api/v1/tasks/{task_id}"),
            Some(&employee_token),
            None,
        )
        .await;
        assert_eq!(own_detail.status(), StatusCode::OK);
        let cross_detail = call(
            &app,
            "GET",
            &format!("/api/v1/tasks/{task_id}"),
            Some(&other_token),
            None,
        )
        .await;
        assert_eq!(cross_detail.status(), StatusCode::FORBIDDEN);

        let employee_delete = call(
            &app,
            "DELETE",
            &format!("/api/v1/tasks/{task_id}"),
            Some(&employee_token),
            None,
        )
        .await;
        assert_eq!(employee_delete.status(), StatusCode::FORBIDDEN);

        let forbidden_edit = call(
            &app,
            "PATCH",
            &format!("/api/v1/tasks/{task_id}"),
            Some(&employee_token),
            Some(json!({"taskTitle":"Không được sửa tiêu đề"})),
        )
        .await;
        assert_eq!(forbidden_edit.status(), StatusCode::FORBIDDEN);

        let admin_edit = call(
            &app,
            "PATCH",
            &format!("/api/v1/tasks/{task_id}"),
            Some(&admin_token),
            Some(json!({
                "taskTitle":"Chuẩn hóa quy trình tiếp nhận — bản cập nhật",
                "description":"Đã cập nhật mô tả.",
                "projectName":"Vận hành nội bộ",
                "assigneeId":employee.id,
                "priority":"Khẩn cấp",
                "dueDate":"2026-10-20",
                "progress":10,
                "status":"Đang thực hiện"
            })),
        )
        .await;
        assert_eq!(admin_edit.status(), StatusCode::OK);
        let body = axum::body::to_bytes(admin_edit.into_body(), 16 * 1024)
            .await
            .expect("admin-edited task body");
        let admin_edit: Value = serde_json::from_slice(&body).expect("admin-edited task JSON");
        assert_eq!(
            admin_edit["task"]["taskTitle"],
            "Chuẩn hóa quy trình tiếp nhận — bản cập nhật"
        );
        assert_eq!(admin_edit["task"]["priority"], "Khẩn cấp");
        assert_eq!(admin_edit["task"]["progress"], 10);

        let progress = call(
            &app,
            "PATCH",
            &format!("/api/v1/tasks/{task_id}"),
            Some(&employee_token),
            Some(json!({"progress":35,"status":"Đang thực hiện"})),
        )
        .await;
        assert_eq!(progress.status(), StatusCode::OK);

        let attachment_bytes = b"task report attachment bytes".to_vec();
        let unauthorized_upload = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/tasks/{task_id}/attachments"))
                    .header("Authorization", &other_token)
                    .header("Content-Type", "application/pdf")
                    .header("X-File-Name", "forbidden.pdf")
                    .body(Body::from(attachment_bytes.clone()))
                    .expect("unauthorized task attachment request"),
            )
            .await
            .expect("unauthorized task attachment response");
        assert_eq!(unauthorized_upload.status(), StatusCode::FORBIDDEN);
        let upload = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/tasks/{task_id}/attachments"))
                    .header("Authorization", &employee_token)
                    .header("Content-Type", "application/pdf")
                    .header("X-File-Name", "weekly-report.pdf")
                    .body(Body::from(attachment_bytes.clone()))
                    .expect("task attachment upload request"),
            )
            .await
            .expect("task attachment upload response");
        assert_eq!(upload.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(upload.into_body(), 8 * 1024)
            .await
            .expect("uploaded attachment body");
        let upload_json: Value = serde_json::from_slice(&body).expect("uploaded attachment JSON");
        let attachment_id = upload_json["attachment"]["id"]
            .as_str()
            .expect("attachment id")
            .to_owned();
        assert_eq!(upload_json["attachment"]["name"], "weekly-report.pdf");
        let storage_key: String = state
            .db
            .lock()
            .await
            .query_row(
                "SELECT storage_key FROM task_attachments WHERE id = ?1",
                params![attachment_id],
                |row| row.get(0),
            )
            .expect("stored task attachment key");

        let transient_upload = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/tasks/{task_id}/attachments"))
                    .header("Authorization", &employee_token)
                    .header("Content-Type", "text/plain")
                    .header("X-File-Name", "draft.txt")
                    .body(Body::from("temporary draft"))
                    .expect("transient attachment request"),
            )
            .await
            .expect("transient attachment response");
        assert_eq!(transient_upload.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(transient_upload.into_body(), 8 * 1024)
            .await
            .expect("transient upload body");
        let transient_json: Value = serde_json::from_slice(&body).expect("transient upload JSON");
        let transient_id = transient_json["attachment"]["id"]
            .as_str()
            .expect("transient attachment id");
        let transient_key: String = state
            .db
            .lock()
            .await
            .query_row(
                "SELECT storage_key FROM task_attachments WHERE id = ?1",
                params![transient_id],
                |row| row.get(0),
            )
            .expect("transient storage key");
        let discarded = call(
            &app,
            "DELETE",
            &format!("/api/v1/tasks/{task_id}/attachments/{transient_id}"),
            Some(&employee_token),
            None,
        )
        .await;
        assert_eq!(discarded.status(), StatusCode::OK);
        assert!(
            !state.storage_dir.join(transient_key).exists(),
            "discarding draft removes its bytes"
        );

        let unauthorized_download = call(
            &app,
            "GET",
            &format!("/api/v1/tasks/{task_id}/attachments/{attachment_id}"),
            Some(&other_token),
            None,
        )
        .await;
        assert_eq!(unauthorized_download.status(), StatusCode::FORBIDDEN);
        let downloaded = call(
            &app,
            "GET",
            &format!("/api/v1/tasks/{task_id}/attachments/{attachment_id}"),
            Some(&employee_token),
            None,
        )
        .await;
        assert_eq!(downloaded.status(), StatusCode::OK);
        assert_eq!(
            axum::body::to_bytes(downloaded.into_body(), 1024)
                .await
                .unwrap()
                .as_ref(),
            attachment_bytes.as_slice()
        );

        let mut forged_attachment = upload_json["attachment"].clone();
        forged_attachment["name"] = json!("other.pdf");
        let forged_report = call(
            &app,
            "POST",
            &format!("/api/v1/tasks/{task_id}/reports"),
            Some(&employee_token),
            Some(json!({"content":"metadata mismatch","progress":40,"status":"Đang thực hiện","attachments":[forged_attachment]})),
        ).await;
        assert_eq!(forged_report.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let comment = call(
            &app,
            "POST",
            &format!("/api/v1/tasks/{task_id}/comments"),
            Some(&employee_token),
            Some(json!({"content":"Đã hoàn tất bước đầu."})),
        )
        .await;
        assert_eq!(comment.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(comment.into_body(), 24 * 1024)
            .await
            .expect("commented task");
        let comment: Value = serde_json::from_slice(&body).expect("comment task JSON");
        assert_eq!(
            comment["task"]["comments"][0]["content"],
            "Đã hoàn tất bước đầu."
        );

        let report = call(
            &app,
            "POST",
            &format!("/api/v1/tasks/{task_id}/reports"),
            Some(&employee_token),
            Some(json!({"content":"Đã hoàn tất toàn bộ checklist.","progress":100,"status":"Hoàn thành","attachments":[upload_json["attachment"].clone()]})),
        ).await;
        assert_eq!(report.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(report.into_body(), 24 * 1024)
            .await
            .expect("reported task");
        let report: Value = serde_json::from_slice(&body).expect("report task JSON");
        assert_eq!(report["task"]["status"], "Chờ nghiệm thu");
        assert_eq!(report["task"]["reports"][0]["progress"], 100);

        let referenced_delete = call(
            &app,
            "DELETE",
            &format!("/api/v1/tasks/{task_id}/attachments/{attachment_id}"),
            Some(&employee_token),
            None,
        )
        .await;
        assert_eq!(referenced_delete.status(), StatusCode::CONFLICT);

        let checklist = call(
            &app,
            "PATCH",
            &format!("/api/v1/tasks/{task_id}/checklists/{checklist_id}"),
            Some(&employee_token),
            Some(json!({"completed":true})),
        )
        .await;
        assert_eq!(checklist.status(), StatusCode::OK);

        let admin_list = call(&app, "GET", "/api/v1/tasks", Some(&admin_token), None).await;
        let body = axum::body::to_bytes(admin_list.into_body(), 16 * 1024)
            .await
            .expect("admin task list");
        let admin_list: Value = serde_json::from_slice(&body).expect("admin task JSON");
        assert_eq!(admin_list["data"].as_array().unwrap().len(), 2);

        let delete = call(
            &app,
            "DELETE",
            &format!("/api/v1/tasks/{task_id}"),
            Some(&admin_token),
            None,
        )
        .await;
        assert_eq!(delete.status(), StatusCode::OK);
        assert!(
            !state.storage_dir.join(storage_key).exists(),
            "deleting task removes attachment bytes"
        );
        let missing = call(
            &app,
            "GET",
            &format!("/api/v1/tasks/{task_id}"),
            Some(&admin_token),
            None,
        )
        .await;
        assert_eq!(missing.status(), StatusCode::NOT_FOUND);
        std::fs::remove_dir_all(&*state.storage_dir).expect("remove task attachment test storage");
    }
}
