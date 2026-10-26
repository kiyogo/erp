use axum::{
    Json,
    extract::State,
    http::{HeaderMap, StatusCode},
};
use chrono::{Duration, Utc};
use rusqlite::{OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{ApiError, ApiResult, AppState, require_admin};

const REQUEST_SCOPE: &str = "workflow_requests";
const PRIORITIES: &[&str] = &["Khẩn cấp (P1)", "Cao (P2)", "Bình thường (P3)"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowRequestRecord {
    key: String,
    code: String,
    workflow_name: String,
    workflow_code: String,
    category: String,
    requester: String,
    department: String,
    current_level: u32,
    total_levels: u32,
    role_requirement: String,
    budget_amount: u64,
    submitted_at: String,
    sla_deadline: String,
    priority: String,
    status: String,
    summary_details: String,
    token_required: bool,
    attachments: Vec<Value>,
    approval_notes: Option<String>,
    created_by_user_id: String,
    created_by_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CreateWorkflowRequestInput {
    code: String,
    workflow_code: String,
    workflow_name: String,
    requester: String,
    department: String,
    summary_details: String,
    budget_amount: u64,
    priority: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkflowRequestDecisionInput {
    action: String,
    note: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowRequestEvent {
    key: String,
    action: &'static str,
    signature_status: &'static str,
    actor_user_id: String,
    actor_name: String,
    timestamp: String,
    level: u32,
    note: Option<String>,
}

pub(crate) async fn list_workflow_requests(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT record_json FROM collection_records \
             WHERE scope = ?1 ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let serialized = statement
        .query_map(params![REQUEST_SCOPE], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    drop(statement);

    let mut events_by_request = std::collections::HashMap::<String, Vec<Value>>::new();
    let mut statement = db
        .prepare(
            "SELECT request_key, event_json FROM workflow_request_events ORDER BY request_key, sequence_no",
        )
        .map_err(ApiError::internal)?;
    let events = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    for (request_key, event_json) in events {
        let event = serde_json::from_str::<Value>(&event_json).map_err(ApiError::internal)?;
        events_by_request
            .entry(request_key)
            .or_default()
            .push(event);
    }

    let now = Utc::now();
    let mut data = Vec::with_capacity(serialized.len());
    for record_json in serialized {
        let record: WorkflowRequestRecord =
            serde_json::from_str(&record_json).map_err(ApiError::internal)?;
        let deadline = chrono::DateTime::parse_from_rfc3339(&record.sla_deadline)
            .map_err(ApiError::internal)?
            .with_timezone(&Utc);
        let minutes_left = deadline.signed_duration_since(now).num_minutes();
        let mut value = serde_json::to_value(record.clone()).map_err(ApiError::internal)?;
        let object = value
            .as_object_mut()
            .ok_or_else(|| ApiError::internal("Stored workflow request is invalid."))?;
        object.insert(
            "slaHoursLeft".to_owned(),
            json!((minutes_left as f64 / 60.0 * 100.0).round() / 100.0),
        );
        object.insert(
            "approvalHistory".to_owned(),
            json!(events_by_request.remove(&record.key).unwrap_or_default()),
        );
        object.insert("pkiIntegrationAvailable".to_owned(), json!(false));
        data.push(value);
    }

    let total = data.len();
    Ok(Json(json!({
        "data": data,
        "pagination": { "page": 1, "limit": total, "total": total, "totalPages": 1 }
    })))
}

pub(crate) async fn create_workflow_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateWorkflowRequestInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let code = input.code.trim().to_ascii_uppercase();
    let workflow_name = input.workflow_name.trim().to_owned();
    let requester = input.requester.trim().to_owned();
    let department = input.department.trim().to_owned();
    let summary_details = input.summary_details.trim().to_owned();
    let workflow_code = input.workflow_code.trim().to_ascii_uppercase();

    if code.is_empty()
        || code.len() > 64
        || !code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
    {
        return Err(ApiError::bad_request(
            "Request code must contain 1-64 ASCII letters, digits, hyphens or underscores.",
        ));
    }
    if workflow_code.is_empty() || workflow_code.len() > 64 {
        return Err(ApiError::bad_request("Workflow code is invalid."));
    }
    if requester.is_empty() || requester.chars().count() > 160 {
        return Err(ApiError::bad_request(
            "Requester must contain 1-160 characters.",
        ));
    }
    if workflow_name.is_empty() || workflow_name.chars().count() > 240 {
        return Err(ApiError::bad_request(
            "Request title must contain 1-240 characters.",
        ));
    }
    if department.is_empty() || department.chars().count() > 160 {
        return Err(ApiError::bad_request(
            "Department must contain 1-160 characters.",
        ));
    }
    if summary_details.is_empty() || summary_details.chars().count() > 10_000 {
        return Err(ApiError::bad_request(
            "Request details must contain 1-10000 characters.",
        ));
    }
    if !PRIORITIES.contains(&input.priority.as_str()) {
        return Err(ApiError::bad_request("Request priority is invalid."));
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let blueprint = super::read_workflow_blueprints(&transaction)?
        .into_iter()
        .find(|blueprint| {
            blueprint.workflow_code.eq_ignore_ascii_case(&workflow_code)
                && blueprint.status == "Đang áp dụng"
        })
        .ok_or_else(|| ApiError::bad_request("An active workflow blueprint is required."))?;
    if blueprint.applicable_budget_limit > 0
        && input.budget_amount > blueprint.applicable_budget_limit
    {
        return Err(ApiError::bad_request(
            "Budget exceeds the active workflow blueprint limit.",
        ));
    }

    let mut statement = transaction
        .prepare("SELECT record_json FROM collection_records WHERE scope = ?1")
        .map_err(ApiError::internal)?;
    let existing = statement
        .query_map(params![REQUEST_SCOPE], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    drop(statement);
    let mut duplicate = false;
    for serialized in existing {
        let record: WorkflowRequestRecord =
            serde_json::from_str(&serialized).map_err(ApiError::internal)?;
        if record.code.eq_ignore_ascii_case(&code) {
            duplicate = true;
            break;
        }
    }
    if duplicate {
        return Err(ApiError::conflict("Request code already exists."));
    }

    let first_step = blueprint
        .approval_flow
        .iter()
        .find(|step| step.level == 1)
        .ok_or_else(|| ApiError::bad_request("Workflow blueprint has no first approval step."))?;
    let submitted = Utc::now();
    let submitted_at = submitted.to_rfc3339();
    let sla_deadline =
        (submitted + Duration::hours(i64::from(blueprint.sla_target_hours))).to_rfc3339();
    let record = WorkflowRequestRecord {
        key: format!("WF-REQ-{}", Uuid::new_v4()),
        code,
        workflow_name,
        workflow_code: blueprint.workflow_code,
        category: blueprint.category,
        requester,
        department,
        current_level: 1,
        total_levels: blueprint.total_steps,
        role_requirement: first_step.role_name.clone(),
        budget_amount: input.budget_amount,
        submitted_at: submitted_at.clone(),
        sla_deadline,
        priority: input.priority,
        status: "Chờ duyệt".to_owned(),
        summary_details,
        token_required: first_step.require_token_pki,
        attachments: Vec::new(),
        approval_notes: None,
        created_by_user_id: actor.id.clone(),
        created_by_name: actor.name.clone(),
    };
    let event = WorkflowRequestEvent {
        key: format!("WF-EVENT-{}", Uuid::new_v4()),
        action: "submitted",
        signature_status: "not_applicable",
        actor_user_id: actor.id,
        actor_name: actor.name,
        timestamp: submitted_at.clone(),
        level: 0,
        note: None,
    };
    let record_json = serde_json::to_string(&record).map_err(ApiError::internal)?;
    let event_json = serde_json::to_string(&event).map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO collection_records \
             (scope, record_key, record_json, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![REQUEST_SCOPE, &record.key, record_json, &submitted_at],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO workflow_request_events \
             (request_key, sequence_no, event_json, created_at) \
             VALUES (?1, 1, ?2, ?3)",
            params![&record.key, event_json, &submitted_at],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;

    let mut response = serde_json::to_value(&record).map_err(ApiError::internal)?;
    let object = response
        .as_object_mut()
        .ok_or_else(|| ApiError::internal("Created workflow request is invalid."))?;
    object.insert("slaHoursLeft".to_owned(), json!(blueprint.sla_target_hours));
    object.insert("approvalHistory".to_owned(), json!([event]));
    object.insert("pkiIntegrationAvailable".to_owned(), json!(false));
    Ok((StatusCode::CREATED, Json(json!({ "request": response }))))
}

pub(crate) async fn decide_workflow_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(request_key): axum::extract::Path<String>,
    Json(input): Json<WorkflowRequestDecisionInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let action = input.action.trim().to_ascii_lowercase();
    if !["approve", "reject", "return"].contains(&action.as_str()) {
        return Err(ApiError::bad_request(
            "Decision action must be approve, reject or return.",
        ));
    }
    let note = input.note.unwrap_or_default().trim().to_owned();
    if note.chars().count() > 2_000 {
        return Err(ApiError::bad_request(
            "Decision note cannot exceed 2000 characters.",
        ));
    }
    if action != "approve" && note.is_empty() {
        return Err(ApiError::bad_request(
            "A reason is required when rejecting or requesting changes.",
        ));
    }
    let note = (!note.is_empty()).then_some(note);

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let serialized: Option<String> = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = ?1 AND record_key = ?2",
            params![REQUEST_SCOPE, &request_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(serialized) = serialized else {
        return Err(ApiError::not_found("Workflow request not found."));
    };
    let mut record: WorkflowRequestRecord =
        serde_json::from_str(&serialized).map_err(ApiError::internal)?;
    if record.created_by_user_id == actor.id {
        return Err(ApiError::forbidden(
            "The request creator cannot make a decision on the same request.",
        ));
    }
    if !["Chờ duyệt", "Đang xử lý", "Chờ ký số"].contains(&record.status.as_str()) {
        return Err(ApiError::conflict(
            "Workflow request is not awaiting a decision.",
        ));
    }
    if record.current_level == 0 || record.current_level > record.total_levels {
        return Err(ApiError::internal(
            "Stored workflow request level is invalid.",
        ));
    }

    let blueprint = super::read_workflow_blueprints(&transaction)?
        .into_iter()
        .find(|item| {
            item.workflow_code
                .eq_ignore_ascii_case(&record.workflow_code)
        })
        .ok_or_else(|| ApiError::internal("Request workflow blueprint is missing."))?;
    let current_step = blueprint
        .approval_flow
        .iter()
        .find(|step| step.level == record.current_level)
        .ok_or_else(|| ApiError::internal("Request approval step is missing."))?;
    if current_step.require_token_pki || record.token_required {
        return Err(ApiError::service_unavailable(
            "This approval step requires PKI, but no signing provider is configured. The decision was not recorded.",
        ));
    }

    let decided_level = record.current_level;
    let decided_at = Utc::now().to_rfc3339();
    let action_name = match action.as_str() {
        "approve" => {
            if record.current_level == record.total_levels {
                record.status = "Đã phê duyệt".to_owned();
            } else {
                let next_level = record.current_level + 1;
                let next_step = blueprint
                    .approval_flow
                    .iter()
                    .find(|step| step.level == next_level)
                    .ok_or_else(|| ApiError::internal("Next workflow approval step is missing."))?;
                record.current_level = next_level;
                record.role_requirement = next_step.role_name.clone();
                record.token_required = next_step.require_token_pki;
                record.status = if next_step.require_token_pki {
                    "Chờ ký số".to_owned()
                } else {
                    "Chờ duyệt".to_owned()
                };
            }
            "approved"
        }
        "reject" => {
            record.status = "Đã từ chối".to_owned();
            "rejected"
        }
        "return" => {
            record.status = "Yêu cầu bổ sung".to_owned();
            "returned"
        }
        _ => unreachable!("decision action was validated"),
    };
    record.approval_notes = note.clone();
    let event = WorkflowRequestEvent {
        key: format!("WF-EVENT-{}", Uuid::new_v4()),
        action: action_name,
        signature_status: "not_signed",
        actor_user_id: actor.id,
        actor_name: actor.name,
        timestamp: decided_at.clone(),
        level: decided_level,
        note,
    };
    let event_json = serde_json::to_string(&event).map_err(ApiError::internal)?;
    let record_json = serde_json::to_string(&record).map_err(ApiError::internal)?;
    let next_sequence: i64 = transaction
        .query_row(
            "SELECT COALESCE(MAX(sequence_no), 0) + 1 FROM workflow_request_events WHERE request_key = ?1",
            params![&request_key],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = ?3 AND record_key = ?4",
            params![&record_json, &decided_at, REQUEST_SCOPE, &request_key],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO workflow_request_events \
             (request_key, sequence_no, event_json, created_at) VALUES (?1, ?2, ?3, ?4)",
            params![&request_key, next_sequence, event_json, &decided_at],
        )
        .map_err(ApiError::internal)?;

    let mut history_statement = transaction
        .prepare(
            "SELECT event_json FROM workflow_request_events WHERE request_key = ?1 ORDER BY sequence_no",
        )
        .map_err(ApiError::internal)?;
    let history_json = history_statement
        .query_map(params![&request_key], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    drop(history_statement);
    let history = history_json
        .into_iter()
        .map(|value| serde_json::from_str::<Value>(&value).map_err(ApiError::internal))
        .collect::<ApiResult<Vec<_>>>()?;

    let mut response = serde_json::to_value(&record).map_err(ApiError::internal)?;
    let object = response
        .as_object_mut()
        .ok_or_else(|| ApiError::internal("Updated workflow request is invalid."))?;
    let deadline = chrono::DateTime::parse_from_rfc3339(&record.sla_deadline)
        .map_err(ApiError::internal)?
        .with_timezone(&Utc);
    let hours_left = deadline.signed_duration_since(Utc::now()).num_minutes() as f64 / 60.0;
    object.insert(
        "slaHoursLeft".to_owned(),
        json!((hours_left * 100.0).round() / 100.0),
    );
    object.insert("approvalHistory".to_owned(), json!(history));
    object.insert("pkiIntegrationAvailable".to_owned(), json!(false));
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "request": response })))
}
