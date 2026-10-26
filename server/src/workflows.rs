use std::collections::HashMap;

use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
};
use chrono::Utc;
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use super::{ApiError, ApiResult, AppState, require_admin};

mod requests;
pub(super) use requests::{
    create_workflow_request, decide_workflow_request, list_workflow_requests,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApprovalStepDefinition {
    level: u32,
    role_name: String,
    default_approver: String,
    sla_hours: u32,
    can_reject: bool,
    #[serde(rename = "requireTokenPKI")]
    require_token_pki: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowFieldDefinition {
    field_name: String,
    label: String,
    #[serde(rename = "type")]
    field_type: String,
    required: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowBlueprint {
    key: String,
    workflow_code: String,
    workflow_name: String,
    category: String,
    description: String,
    scope: String,
    total_steps: u32,
    sla_target_hours: u32,
    applicable_budget_limit: u64,
    approval_flow: Vec<ApprovalStepDefinition>,
    form_fields: Vec<WorkflowFieldDefinition>,
    #[serde(default)]
    active_instances_count: u64,
    #[serde(default)]
    total_completed_count: u64,
    #[serde(default)]
    pass_rate: f64,
    status: String,
    version: String,
    created_by: String,
    #[serde(flatten)]
    extra: HashMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct CreateWorkflowBlueprintInput {
    workflow_code: String,
    workflow_name: String,
    category: String,
    description: String,
    scope: String,
    total_steps: u32,
    sla_target_hours: u32,
    applicable_budget_limit: u64,
    version: String,
}

#[derive(Debug, Deserialize)]
pub(super) struct WorkflowBlueprintStatusInput {
    status: String,
}

pub(super) async fn list_workflow_blueprints(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let blueprints = read_workflow_blueprints(&db)?;
    Ok(Json(json!({ "data": blueprints })))
}

pub(super) async fn create_workflow_blueprint(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateWorkflowBlueprintInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let workflow_code = input.workflow_code.trim().to_ascii_uppercase();
    let workflow_name = input.workflow_name.trim().to_owned();
    let category = input.category.trim().to_owned();
    let description = input.description.trim().to_owned();
    let scope = input.scope.trim().to_owned();
    let version = input.version.trim().to_owned();
    if workflow_code.is_empty()
        || workflow_code.len() > 64
        || !workflow_code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || b"-_".contains(&byte))
    {
        return Err(ApiError::bad_request(
            "Workflow code must contain 1-64 ASCII letters, digits, hyphens or underscores.",
        ));
    }
    if workflow_name.is_empty() || workflow_name.chars().count() > 160 {
        return Err(ApiError::bad_request(
            "Workflow name must contain between 1 and 160 characters.",
        ));
    }
    if ![
        "Mua sắm & Tài sản",
        "Tài chính & Thanh toán",
        "Hợp đồng & Pháp chế",
        "Nhân sự & Phúc lợi",
        "Văn phòng & Hành chính",
        "Vận hành Kỹ thuật & IDC",
    ]
    .contains(&category.as_str())
    {
        return Err(ApiError::bad_request("Workflow category is invalid."));
    }
    if description.chars().count() > 2_000
        || scope.is_empty()
        || scope.chars().count() > 120
        || version.is_empty()
        || version.chars().count() > 32
    {
        return Err(ApiError::bad_request(
            "Workflow description, scope or version is invalid.",
        ));
    }
    if !(1..=12).contains(&input.total_steps) {
        return Err(ApiError::bad_request(
            "Workflow must have from 1 to 12 approval steps.",
        ));
    }
    if !(1..=720).contains(&input.sla_target_hours) {
        return Err(ApiError::bad_request(
            "Workflow SLA must be from 1 to 720 hours.",
        ));
    }

    let per_step_sla =
        ((input.sla_target_hours + input.total_steps / 2) / input.total_steps).max(1);
    let approval_flow = (1..=input.total_steps)
        .map(|level| ApprovalStepDefinition {
            level,
            role_name: if level == 1 {
                "Trưởng bộ phận phê duyệt".to_owned()
            } else if level == input.total_steps {
                "Tổng Giám Đốc ký số".to_owned()
            } else {
                "Kế toán trưởng / Giám đốc khối".to_owned()
            },
            default_approver: if level == input.total_steps {
                "Ban Lãnh Đạo".to_owned()
            } else {
                "Cán bộ phụ trách".to_owned()
            },
            sla_hours: per_step_sla,
            can_reject: true,
            require_token_pki: level >= 2,
        })
        .collect();
    let blueprint = WorkflowBlueprint {
        key: format!("WF-BP-{}", Uuid::new_v4()),
        workflow_code,
        workflow_name,
        category,
        description,
        scope,
        total_steps: input.total_steps,
        sla_target_hours: input.sla_target_hours,
        applicable_budget_limit: input.applicable_budget_limit,
        approval_flow,
        form_fields: vec![
            WorkflowFieldDefinition {
                field_name: "title".to_owned(),
                label: "Tiêu đề đề xuất".to_owned(),
                field_type: "Văn bản".to_owned(),
                required: true,
            },
            WorkflowFieldDefinition {
                field_name: "content".to_owned(),
                label: "Nội dung chi tiết".to_owned(),
                field_type: "Văn bản dài".to_owned(),
                required: true,
            },
            WorkflowFieldDefinition {
                field_name: "attachments".to_owned(),
                label: "Tài liệu đính kèm".to_owned(),
                field_type: "Tệp PDF".to_owned(),
                required: false,
            },
        ],
        active_instances_count: 0,
        total_completed_count: 0,
        pass_rate: 0.0,
        status: "Đang áp dụng".to_owned(),
        version,
        created_by: actor.name,
        extra: HashMap::new(),
    };

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    if read_workflow_blueprints(&transaction)?
        .iter()
        .any(|existing| {
            existing
                .workflow_code
                .eq_ignore_ascii_case(&blueprint.workflow_code)
        })
    {
        return Err(ApiError::conflict("Workflow code already exists."));
    }
    let serialized = serde_json::to_string(&blueprint).map_err(ApiError::internal)?;
    let timestamp = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES ('workflow_blueprints', ?1, ?2, ?3, ?3)",
            params![&blueprint.key, serialized, timestamp],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "blueprint": blueprint }))))
}

pub(super) async fn update_workflow_blueprint_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(workflow_key): Path<String>,
    Json(input): Json<WorkflowBlueprintStatusInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    if !["Đang áp dụng", "Bản nháp", "Tạm ngưng"].contains(&input.status.as_str()) {
        return Err(ApiError::bad_request(
            "Workflow blueprint status is invalid.",
        ));
    }
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let serialized: Option<String> = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = 'workflow_blueprints' AND record_key = ?1",
            params![&workflow_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(serialized) = serialized else {
        return Err(ApiError::not_found("Workflow blueprint not found."));
    };
    let mut blueprint: WorkflowBlueprint =
        serde_json::from_str(&serialized).map_err(ApiError::internal)?;
    blueprint.status = input.status;
    let updated = serde_json::to_string(&blueprint).map_err(ApiError::internal)?;
    transaction
        .execute(
            "UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = 'workflow_blueprints' AND record_key = ?3",
            params![updated, Utc::now().to_rfc3339(), workflow_key],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "blueprint": blueprint })))
}

fn read_workflow_blueprints(db: &Connection) -> ApiResult<Vec<WorkflowBlueprint>> {
    let mut statement = db
        .prepare(
            "SELECT record_json FROM collection_records WHERE scope = 'workflow_blueprints' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    rows.into_iter()
        .map(|row| serde_json::from_str::<WorkflowBlueprint>(&row).map_err(ApiError::internal))
        .collect()
}
