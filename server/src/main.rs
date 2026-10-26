use std::{
    collections::{HashMap, HashSet},
    env,
    net::SocketAddr,
    sync::Arc,
};

use anyhow::{Context, Result};
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{DefaultBodyLimit, Path, Query, State},
    http::{
        HeaderMap, HeaderValue, Method, StatusCode,
        header::{AUTHORIZATION, CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_TYPE},
    },
    response::{IntoResponse, Response},
    routing::{any, delete, get, patch, post, put},
};
use chrono::{Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use rand_core::RngCore;
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;
use tower_http::{
    cors::{Any, CorsLayer},
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing::info;
use uuid::Uuid;

mod asset_allocations;
mod asset_audits;
mod asset_depreciations;
mod asset_disposals;
mod asset_maintenances;
mod asset_repairs;
mod asset_transfers;
mod attendance_shift_assignments;
mod audit;
mod chat;
mod contracts;
mod crm;
mod documents;
mod employee_bank_accounts;
mod employee_bank_import;
mod employee_leave_requests;
mod employee_overtime_requests;
mod employee_payslips;
mod employee_proposals;
mod finance;
mod finance_import;
mod helpdesk_incident_import;
mod helpdesk_incidents;
mod helpdesk_ticket_import;
mod helpdesk_tickets;
mod hr_certificates;
mod hr_employee_history;
mod hr_headcount;
mod hr_onboarding;
mod hr_performance_reviews;
mod hr_recruitment;
mod hr_rewards;
mod hr_training;
mod hr_uniforms;
mod legacy_asset_allocations_import;
mod legacy_asset_depreciations_import;
mod legacy_asset_disposals_import;
mod legacy_asset_items_import;
mod legacy_asset_maintenances_import;
mod legacy_asset_transfers_import;
mod legacy_plan_import;
mod legacy_reports_catalog_import;
mod plan_milestones;
mod plan_okrs;
mod plan_progress;
mod plan_reports;
mod plans;
mod tasks;
mod workflows;

const API_PREFIX: &str = "/api/v1";
const ADMIN_ROLE: &str = "ADMIN";

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Connection>>,
    jwt_encoding: EncodingKey,
    jwt_decoding: DecodingKey,
    storage_dir: Arc<std::path::PathBuf>,
    crm_crypto: Option<crm::CrmCrypto>,
}

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    api_version: &'static str,
}

#[derive(Serialize, Deserialize, Clone)]
struct Claims {
    sub: String,
    email: String,
    role: String,
    #[serde(default)]
    sid: Option<String>,
    exp: usize,
    iat: usize,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivationClaims {
    sub: String,
    role: String,
    scope: String,
    activation_id: String,
    exp: usize,
    iat: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct User {
    id: String,
    email: String,
    name: String,
    role: String,
    is_active: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AdminUser {
    #[serde(flatten)]
    user: User,
    employee_code: String,
    phone: String,
    department: String,
    position: String,
    activation_status: String,
}

#[derive(Deserialize)]
struct LoginInput {
    email: String,
    password: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangePasswordInput {
    #[serde(alias = "currentPassword")]
    old_password: String,
    new_password: String,
    confirm_password: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateUserInput {
    email: String,
    #[serde(alias = "fullName")]
    name: String,
    password: String,
    role: String,
    #[serde(alias = "username", alias = "code")]
    employee_code: Option<String>,
    department: Option<String>,
    phone: Option<String>,
    position: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateUserInput {
    name: Option<String>,
    email: Option<String>,
    role: Option<String>,
    is_active: Option<bool>,
    #[serde(alias = "username", alias = "code")]
    employee_code: Option<String>,
    department: Option<String>,
    phone: Option<String>,
    position: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateNotificationInput {
    title: String,
    message: String,
    #[serde(rename = "type")]
    notification_type: Option<String>,
    link: Option<String>,
    user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SystemBroadcast {
    id: String,
    title: String,
    content: String,
    #[serde(rename = "type")]
    broadcast_type: String,
    target_audience: String,
    sender: String,
    created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    scheduled_at: Option<String>,
    channels: Vec<String>,
    #[serde(default)]
    read_count: u64,
    #[serde(default)]
    total_recipients: u64,
    status: String,
    #[serde(flatten)]
    extra: HashMap<String, Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SystemBroadcastInput {
    title: String,
    content: String,
    #[serde(rename = "type")]
    broadcast_type: String,
    target_audience: String,
    channels: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateSystemBroadcastInput {
    title: Option<String>,
    content: Option<String>,
    #[serde(rename = "type")]
    broadcast_type: Option<String>,
    target_audience: Option<String>,
    channels: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivationEmailTemplate {
    subject: String,
    heading: String,
    body: String,
    button_label: String,
    footer: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MeetingRoom {
    key: String,
    name: String,
    location: String,
    capacity: u32,
    #[serde(default)]
    equipment: Vec<String>,
    #[serde(default = "default_meeting_room_status")]
    status: String,
    #[serde(flatten)]
    extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MeetingBooking {
    key: String,
    room_name: String,
    meeting_title: String,
    booker: String,
    date: String,
    time_slot: String,
    participants_count: u32,
    status: String,
    #[serde(flatten)]
    extra: HashMap<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMeetingRoomInput {
    name: String,
    location: String,
    capacity: u32,
    #[serde(default)]
    equipment: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateMeetingBookingInput {
    room_name: String,
    meeting_title: String,
    booker: String,
    date: String,
    time_slot: String,
    participants_count: u32,
}

#[derive(Clone)]
struct NotificationRow {
    id: String,
    user_id: String,
    title: String,
    message: String,
    notification_type: String,
    link: String,
    is_read: bool,
    created_at: String,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UserListQuery {
    page: Option<usize>,
    limit: Option<usize>,
    search: Option<String>,
    filter: Option<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct EmployeeInput {
    name: Option<String>,
    email: Option<String>,
    code: Option<String>,
    employee_code: Option<String>,
    phone: Option<String>,
    address: Option<String>,
    department: Option<String>,
    position: Option<String>,
    status: Option<String>,
    join_date: Option<String>,
    salary_base: Option<i64>,
    avatar: Option<String>,
    details: Option<Value>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivationAuthorizeInput {
    token: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActivationPasswordInput {
    activation_token: String,
    password: String,
    #[serde(default)]
    google_credential: Option<String>,
}

struct EmployeeRow {
    user: User,
    employee_code: String,
    phone: String,
    department: String,
    position: String,
    status: String,
    join_date: String,
    salary_base: i64,
    avatar: String,
    details: Value,
    profile_created_at: String,
    profile_updated_at: String,
}

#[derive(Serialize)]
struct LoginResponse {
    access_token: String,
    token_type: &'static str,
    session_id: String,
    user: User,
}

#[derive(Serialize)]
struct IntrospectionResponse {
    active: bool,
    user: User,
}

#[derive(Deserialize)]
struct StorageModeInput {
    mode: String,
}

#[derive(Deserialize)]
struct ReplaceCollectionInput {
    records: Vec<Value>,
    #[serde(default, rename = "expectedRevision")]
    expected_revision: Option<String>,
}

#[derive(Deserialize)]
struct CreateRecordInput {
    record: Value,
    #[serde(default, rename = "expectedRevision")]
    expected_revision: Option<String>,
}

#[derive(Deserialize)]
struct PatchRecordInput {
    patch: Value,
    #[serde(default, rename = "expectedRevision")]
    expected_revision: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileListQuery {
    parent_id: Option<String>,
    include_hidden: Option<bool>,
    scope: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateFolderInput {
    name: String,
    parent_id: Option<String>,
    origin_module: Option<String>,
}

#[derive(Deserialize)]
struct RenameFileInput {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileShareUpdateInput {
    is_active: Option<bool>,
    regenerate: Option<bool>,
}

#[derive(Clone)]
struct FileShareRow {
    id: String,
    file_id: String,
    token: String,
    is_active: bool,
    created_by: String,
    created_at: String,
    updated_at: String,
}

#[derive(Clone)]
struct FileNodeRow {
    id: String,
    parent_id: Option<String>,
    employee_id: Option<String>,
    owner_id: Option<String>,
    name: String,
    node_type: String,
    mime_type: String,
    size: i64,
    storage_key: Option<String>,
    origin_module: String,
    is_hidden: bool,
    is_system: bool,
    is_protected: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug)]
struct ApiError(StatusCode, String);

impl ApiError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self(StatusCode::BAD_REQUEST, message.into())
    }
    fn conflict(message: impl Into<String>) -> Self {
        Self(StatusCode::CONFLICT, message.into())
    }
    fn unprocessable(message: impl Into<String>) -> Self {
        Self(StatusCode::UNPROCESSABLE_ENTITY, message.into())
    }
    fn unauthorized(message: impl Into<String>) -> Self {
        Self(StatusCode::UNAUTHORIZED, message.into())
    }
    fn forbidden(message: impl Into<String>) -> Self {
        Self(StatusCode::FORBIDDEN, message.into())
    }
    fn not_found(message: impl Into<String>) -> Self {
        Self(StatusCode::NOT_FOUND, message.into())
    }
    fn gone(message: impl Into<String>) -> Self {
        Self(StatusCode::GONE, message.into())
    }
    fn service_unavailable(message: impl Into<String>) -> Self {
        Self(StatusCode::SERVICE_UNAVAILABLE, message.into())
    }
    fn internal(error: impl std::fmt::Display) -> Self {
        Self(StatusCode::INTERNAL_SERVER_ERROR, error.to_string())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1, "message": self.1 }))).into_response()
    }
}

type ApiResult<T> = std::result::Result<T, ApiError>;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter("kiyo_cloud_api=info,tower_http=info")
        .init();
    let secret = jwt_secret()?;
    let db_path =
        env::var("KIYO_API_DB_PATH").unwrap_or_else(|_| "data/kiyo-cloud.sqlite".to_owned());
    if let Some(parent) = std::path::Path::new(&db_path).parent() {
        std::fs::create_dir_all(parent)?;
    }
    let connection = Connection::open(&db_path).context("cannot open Kiyo Cloud database")?;
    init_database(&connection)?;
    bootstrap_admin(&connection)?;
    let storage_dir = env::var("KIYO_API_STORAGE_PATH")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            std::path::Path::new(&db_path)
                .parent()
                .unwrap_or_else(|| std::path::Path::new("data"))
                .join("files")
        });
    std::fs::create_dir_all(&storage_dir).context("cannot create Kiyo file storage directory")?;

    let state = AppState {
        db: Arc::new(Mutex::new(connection)),
        jwt_encoding: EncodingKey::from_secret(secret.as_bytes()),
        jwt_decoding: DecodingKey::from_secret(secret.as_bytes()),
        storage_dir: Arc::new(storage_dir.clone()),
        crm_crypto: crm::load_crypto_from_env(),
    };
    let mut app = router(
        state,
        configured_cors(env::var("KIYO_CORS_ORIGIN").ok().as_deref())?,
    );

    let static_dir = env::var("KIYO_STATIC_DIR")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            if std::path::Path::new("dist").exists() {
                std::path::PathBuf::from("dist")
            } else {
                std::path::PathBuf::from("static")
            }
        });

    if static_dir.exists() && static_dir.join("index.html").exists() {
        info!(path = ?static_dir, "Serving WebAssembly SPA static files");
        let index_file = static_dir.join("index.html");
        let serve_dir = ServeDir::new(&static_dir).fallback(ServeFile::new(index_file));
        app = app.fallback_service(serve_dir);
    }

    let host = env::var("KIYO_API_HOST").unwrap_or_else(|_| "127.0.0.1".to_owned());
    let port = env::var("KIYO_API_PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(3001);
    let address: SocketAddr = format!("{host}:{port}").parse()?;
    info!("============================================================");
    info!("  Kiyo Platform (Self-Hosted All-In-One Server) Started");
    info!("  Web & API Address: http://{address}");
    info!("  Database:          {db_path}");
    info!("  File Storage:      {storage_dir:?}");
    info!("============================================================");
    let listener = tokio::net::TcpListener::bind(address).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

fn configured_cors(origin: Option<&str>) -> Result<CorsLayer> {
    let Some(origin) = origin.map(str::trim).filter(|origin| !origin.is_empty()) else {
        return Ok(CorsLayer::new());
    };
    anyhow::ensure!(
        origin != "*" && (origin.starts_with("http://") || origin.starts_with("https://")),
        "KIYO_CORS_ORIGIN must be one explicit http(s) origin, not a wildcard"
    );
    let authority = origin
        .split_once("://")
        .map(|(_, authority)| authority)
        .unwrap_or_default();
    anyhow::ensure!(
        !authority.is_empty()
            && !authority
                .chars()
                .any(|character| matches!(character, '/' | '?' | '#')),
        "KIYO_CORS_ORIGIN must not contain a path, query, or fragment"
    );
    let origin = HeaderValue::from_str(origin).context("invalid KIYO_CORS_ORIGIN header value")?;
    Ok(CorsLayer::new()
        .allow_origin(origin)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(Any))
}

fn router(state: AppState, cors: CorsLayer) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/api/health", get(health))
        .route(&format!("{API_PREFIX}/health"), get(health))
        .route(
            &format!("{API_PREFIX}/platform/config"),
            get(platform_config),
        )
        .route(&format!("{API_PREFIX}/auth/login"), post(login))
        .route(&format!("{API_PREFIX}/auth/logout"), post(logout))
        .route(&format!("{API_PREFIX}/auth/profile"), get(profile))
        .route(&format!("{API_PREFIX}/auth/introspect"), get(introspect))
        .route(
            &format!("{API_PREFIX}/auth/change-password"),
            post(change_password),
        )
        .route(
            &format!("{API_PREFIX}/dashboard/stats"),
            get(dashboard_stats),
        )
        .route(&format!("{API_PREFIX}/admin/audit-logs"), get(audit::list))
        .route(
            &format!("{API_PREFIX}/audit-events"),
            post(audit::record).layer(DefaultBodyLimit::max(64 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/users"),
            get(list_users).post(create_user),
        )
        .route(
            &format!("{API_PREFIX}/users/{{user_id}}"),
            get(get_user).patch(update_user).delete(delete_user),
        )
        .route(
            &format!("{API_PREFIX}/crm/contacts"),
            get(crm::list_contacts).post(crm::create_contact),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/crm-contacts/preview"),
            post(crm::preview_legacy_contacts_import).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/crm-contacts/apply"),
            post(crm::apply_legacy_contacts_import).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/crm-operations/preview"),
            post(crm::preview_legacy_operations_import)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/crm-operations/apply"),
            post(crm::apply_legacy_operations_import).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/crm/supplier-evaluations"),
            get(crm::list_supplier_evaluations).post(crm::create_supplier_evaluation),
        )
        .route(
            &format!("{API_PREFIX}/crm/feedback"),
            get(crm::list_customer_feedback).post(crm::create_customer_feedback),
        )
        .route(
            &format!("{API_PREFIX}/crm/feedback/{{feedback_key}}/resolve"),
            axum::routing::patch(crm::resolve_customer_feedback),
        )
        .route(
            &format!("{API_PREFIX}/hr/training-courses"),
            get(hr_training::list_courses).post(hr_training::create_course),
        )
        .route(
            &format!("{API_PREFIX}/hr/certificates"),
            get(hr_certificates::list_certificates).post(hr_certificates::create_certificate),
        )
        .route(
            &format!("{API_PREFIX}/hr/uniforms"),
            get(hr_uniforms::list_uniforms).post(hr_uniforms::create_uniform),
        )
        .route(
            &format!("{API_PREFIX}/hr/uniforms/{{uniform_key}}/handover"),
            patch(hr_uniforms::handover_uniform),
        )
        .route(
            &format!("{API_PREFIX}/hr/onboarding"),
            get(hr_onboarding::list_records).post(hr_onboarding::create_record),
        )
        .route(
            &format!("{API_PREFIX}/hr/headcount-quotas"),
            get(hr_headcount::list_quotas).post(hr_headcount::create_quota),
        )
        .route(
            &format!("{API_PREFIX}/hr/recruitment-openings"),
            get(hr_recruitment::list_openings).post(hr_recruitment::create_opening),
        )
        .route(
            &format!("{API_PREFIX}/hr/rewards"),
            get(hr_rewards::list_rewards).post(hr_rewards::create_reward),
        )
        .route(
            &format!("{API_PREFIX}/hr/rewards/{{reward_key}}/approve"),
            patch(hr_rewards::approve_reward),
        )
        .route(
            &format!("{API_PREFIX}/hr/rewards/{{reward_key}}/award"),
            patch(hr_rewards::record_award),
        )
        .route(
            &format!("{API_PREFIX}/hr/performance-reviews"),
            get(hr_performance_reviews::list_reviews).post(hr_performance_reviews::create_review),
        )
        .route(
            &format!("{API_PREFIX}/hr/performance-reviews/{{review_key}}/approve"),
            patch(hr_performance_reviews::approve_review),
        )
        .route(
            &format!("{API_PREFIX}/hr/employee-history"),
            get(hr_employee_history::list_history).post(hr_employee_history::create_history),
        )
        .route(
            &format!("{API_PREFIX}/hr/bank-accounts"),
            get(employee_bank_accounts::list_all_accounts)
                .post(employee_bank_accounts::create_hr_account),
        )
        .route(
            &format!("{API_PREFIX}/hr/bank-accounts/{{account_id}}/approve"),
            patch(employee_bank_accounts::approve_account),
        )
        .route(
            &format!("{API_PREFIX}/hr/bank-accounts/{{account_id}}/reject"),
            patch(employee_bank_accounts::reject_account),
        )
        .route(
            &format!("{API_PREFIX}/hr/bank-accounts/{{account_id}}/retire"),
            patch(employee_bank_accounts::retire_account),
        )
        .route(
            &format!("{API_PREFIX}/employee/bank-accounts"),
            get(employee_bank_accounts::list_my_accounts)
                .post(employee_bank_accounts::create_my_account),
        )
        .route(
            &format!("{API_PREFIX}/admin/sessions"),
            get(list_admin_sessions),
        )
        .route(
            &format!("{API_PREFIX}/admin/sessions/{{session_id}}"),
            delete(revoke_admin_session),
        )
        .route(
            &format!("{API_PREFIX}/employees"),
            get(list_employees).post(create_employee),
        )
        .route(
            &format!("{API_PREFIX}/employees/me"),
            get(my_employee_profile).patch(update_my_employee_profile),
        )
        .route(
            &format!("{API_PREFIX}/employee/payslips"),
            get(employee_payslips::list_my_employee_payslips),
        )
        .route(
            &format!("{API_PREFIX}/employee/asset-allocations"),
            get(asset_allocations::list_my_allocations),
        )
        .route(
            &format!("{API_PREFIX}/employee/asset-allocations/{{allocation_key}}/acknowledge"),
            post(asset_allocations::acknowledge_receipt),
        )
        .route(
            &format!("{API_PREFIX}/assets/allocations/{{allocation_key}}/receive"),
            patch(asset_allocations::confirm_return_to_warehouse),
        )
        .route(
            &format!("{API_PREFIX}/assets/transfers"),
            get(asset_transfers::list_transfers).post(asset_transfers::create_transfer),
        )
        .route(
            &format!("{API_PREFIX}/assets/transfers/{{transfer_key}}/approve"),
            patch(asset_transfers::approve_transfer),
        )
        .route(
            &format!("{API_PREFIX}/assets/transfers/{{transfer_key}}/reject"),
            patch(asset_transfers::reject_transfer),
        )
        .route(
            &format!("{API_PREFIX}/assets/transfers/{{transfer_key}}/receive"),
            patch(asset_transfers::receive_transfer),
        )
        .route(
            &format!("{API_PREFIX}/assets/maintenance"),
            get(asset_maintenances::list_maintenances).post(asset_maintenances::create_maintenance),
        )
        .route(
            &format!("{API_PREFIX}/assets/maintenance/{{maintenance_key}}/perform"),
            post(asset_maintenances::perform_maintenance),
        )
        .route(
            &format!("{API_PREFIX}/assets/repairs"),
            get(asset_repairs::list_repairs).post(asset_repairs::create_repair),
        )
        .route(
            &format!("{API_PREFIX}/assets/repairs/{{repair_key}}/approve"),
            post(asset_repairs::approve_repair),
        )
        .route(
            &format!("{API_PREFIX}/assets/repairs/{{repair_key}}/complete"),
            post(asset_repairs::complete_repair),
        )
        .route(
            &format!("{API_PREFIX}/assets/disposals"),
            get(asset_disposals::list_disposals).post(asset_disposals::create_disposal),
        )
        .route(
            &format!("{API_PREFIX}/assets/disposals/{{disposal_key}}/approve"),
            post(asset_disposals::approve_disposal),
        )
        .route(
            &format!("{API_PREFIX}/assets/depreciations"),
            get(asset_depreciations::list).post(asset_depreciations::create),
        )
        .route(
            &format!("{API_PREFIX}/assets/depreciations/{{depreciation_key}}/toggle-status"),
            post(asset_depreciations::toggle_status),
        )
        .route(
            &format!("{API_PREFIX}/assets/depreciations/run-monthly"),
            post(asset_depreciations::run_monthly),
        )
        .route(
            &format!("{API_PREFIX}/assets/audits"),
            get(asset_audits::list_audits).post(asset_audits::create_audit),
        )
        .route(
            &format!("{API_PREFIX}/assets/audits/{{audit_key}}"),
            get(asset_audits::get_audit),
        )
        .route(
            &format!("{API_PREFIX}/assets/audits/{{audit_key}}/scans"),
            post(asset_audits::record_scan),
        )
        .route(
            &format!("{API_PREFIX}/assets/audits/{{audit_key}}/close"),
            post(asset_audits::close_audit),
        )
        .route(
            &format!("{API_PREFIX}/assets/audits/{{audit_key}}/submit-resolution"),
            post(asset_audits::submit_resolution),
        )
        .route(
            &format!("{API_PREFIX}/employees/{{employee_id}}"),
            get(get_employee)
                .patch(update_employee)
                .delete(retire_employee),
        )
        .route(
            &format!("{API_PREFIX}/employees/{{employee_id}}/activation"),
            post(resend_employee_activation),
        )
        .route(
            &format!("{API_PREFIX}/contracts"),
            get(contracts::list_contracts).post(contracts::create_contract),
        )
        .route(
            &format!("{API_PREFIX}/contracts/{{contract_id}}"),
            get(contracts::get_contract)
                .put(contracts::update_contract)
                .patch(contracts::update_contract)
                .delete(contracts::archive_contract),
        )
        .route(
            &format!("{API_PREFIX}/auth/activation/authorize"),
            post(authorize_activation),
        )
        .route(
            &format!("{API_PREFIX}/auth/activation/set-password"),
            post(set_activation_password),
        )
        .route(
            &format!("{API_PREFIX}/notifications"),
            get(list_notifications)
                .post(create_notification)
                .delete(clear_notifications),
        )
        .route(
            &format!("{API_PREFIX}/notifications/mark-all-read"),
            post(mark_all_notifications_read),
        )
        .route(
            &format!("{API_PREFIX}/notifications/{{notification_id}}/read"),
            patch(mark_notification_read),
        )
        .route(
            &format!("{API_PREFIX}/notifications/{{notification_id}}"),
            delete(delete_notification),
        )
        .route(
            &format!("{API_PREFIX}/system/broadcasts"),
            get(list_system_broadcasts).post(create_system_broadcast),
        )
        .route(
            &format!("{API_PREFIX}/system/broadcasts/{{broadcast_id}}"),
            patch(update_system_broadcast).delete(delete_system_broadcast),
        )
        .route(
            &format!("{API_PREFIX}/system/notification-templates/account-activation"),
            get(get_activation_email_template).put(save_activation_email_template),
        )
        .route(
            &format!("{API_PREFIX}/meeting-rooms"),
            get(list_meeting_rooms),
        )
        .route(
            &format!("{API_PREFIX}/meeting-rooms/rooms"),
            post(create_meeting_room),
        )
        .route(
            &format!("{API_PREFIX}/meeting-rooms/bookings"),
            post(create_meeting_booking),
        )
        .route(
            &format!("{API_PREFIX}/meeting-rooms/bookings/{{booking_key}}"),
            patch(cancel_meeting_booking),
        )
        .route(
            &format!("{API_PREFIX}/tickets"),
            get(helpdesk_tickets::list_tickets).post(helpdesk_tickets::create_ticket),
        )
        .route(
            &format!("{API_PREFIX}/tickets/{{ticket_id}}"),
            patch(helpdesk_tickets::update_ticket),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/helpdesk-tickets/preview"),
            post(helpdesk_ticket_import::preview).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/helpdesk-tickets/apply"),
            post(helpdesk_ticket_import::apply).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/helpdesk-incidents/preview"),
            post(helpdesk_incident_import::preview).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/helpdesk-incidents/apply"),
            post(helpdesk_incident_import::apply).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/tickets/incidents"),
            get(helpdesk_incidents::list_incidents).post(helpdesk_incidents::create_incident),
        )
        .route(
            &format!("{API_PREFIX}/tickets/incidents/{{incident_id}}"),
            get(helpdesk_incidents::get_incident),
        )
        .route(
            &format!("{API_PREFIX}/tickets/incidents/{{incident_id}}/resolve"),
            post(helpdesk_incidents::resolve_incident),
        )
        .route(
            &format!("{API_PREFIX}/workflows/blueprints"),
            get(workflows::list_workflow_blueprints).post(workflows::create_workflow_blueprint),
        )
        .route(
            &format!("{API_PREFIX}/workflows/blueprints/{{workflow_key}}/status"),
            patch(workflows::update_workflow_blueprint_status),
        )
        .route(
            &format!("{API_PREFIX}/workflows/requests"),
            get(workflows::list_workflow_requests).post(workflows::create_workflow_request),
        )
        .route(
            &format!("{API_PREFIX}/workflows/requests/{{request_key}}/decisions"),
            post(workflows::decide_workflow_request),
        )
        .route(
            &format!("{API_PREFIX}/employee-proposals"),
            get(employee_proposals::list_employee_proposals)
                .post(employee_proposals::create_employee_proposal),
        )
        .route(
            &format!("{API_PREFIX}/employee-proposals/{{proposal_id}}"),
            get(employee_proposals::get_employee_proposal),
        )
        .route(
            &format!("{API_PREFIX}/employee-proposals/{{proposal_id}}/review"),
            patch(employee_proposals::review_employee_proposal),
        )
        .route(
            &format!("{API_PREFIX}/leave-requests"),
            get(employee_leave_requests::list_employee_leave_requests)
                .post(employee_leave_requests::create_employee_leave_request),
        )
        .route(
            &format!("{API_PREFIX}/leave-requests/{{request_id}}/decision"),
            patch(employee_leave_requests::decide_employee_leave_request),
        )
        .route(
            &format!("{API_PREFIX}/leave-requests/{{request_id}}/events"),
            get(employee_leave_requests::list_employee_leave_request_events),
        )
        .route(
            &format!("{API_PREFIX}/overtime-requests"),
            get(employee_overtime_requests::list_employee_overtime_requests)
                .post(employee_overtime_requests::create_employee_overtime_request),
        )
        .route(
            &format!("{API_PREFIX}/overtime-requests/{{request_id}}/decision"),
            patch(employee_overtime_requests::decide_employee_overtime_request),
        )
        .route(
            &format!("{API_PREFIX}/overtime-requests/{{request_id}}/events"),
            get(employee_overtime_requests::list_employee_overtime_request_events),
        )
        .route(
            &format!("{API_PREFIX}/attendance/shift-assignments"),
            get(attendance_shift_assignments::list_attendance_shift_assignments)
                .post(attendance_shift_assignments::create_attendance_shift_assignment),
        )
        .route(
            &format!("{API_PREFIX}/attendance/shift-assignments/{{assignment_id}}/events"),
            get(attendance_shift_assignments::list_attendance_shift_assignment_events),
        )
        .route(
            &format!("{API_PREFIX}/tasks/assignees"),
            get(tasks::list_task_assignees),
        )
        .route(
            &format!("{API_PREFIX}/plans"),
            get(plans::list_strategic_plans).post(plans::create_strategic_plan),
        )
        .route(
            &format!("{API_PREFIX}/plans/{{plan_id}}/complete"),
            patch(plans::complete_strategic_plan),
        )
        .route(
            &format!("{API_PREFIX}/plan-milestones"),
            get(plan_milestones::list_milestones).post(plan_milestones::create_milestone),
        )
        .route(
            &format!("{API_PREFIX}/plan-milestones/{{milestone_id}}/achieve"),
            patch(plan_milestones::mark_achieved),
        )
        .route(
            &format!("{API_PREFIX}/plan-progress"),
            get(plan_progress::list_plan_progress),
        )
        .route(
            &format!("{API_PREFIX}/plan-progress/{{progress_id}}"),
            patch(plan_progress::update_plan_progress),
        )
        .route(
            &format!("{API_PREFIX}/plan-reports"),
            get(plan_reports::list_plan_reports).post(plan_reports::create_plan_report),
        )
        .route(
            &format!("{API_PREFIX}/plan-reports/{{report_id}}"),
            put(plan_reports::update_plan_report),
        )
        .route(
            &format!("{API_PREFIX}/plan-okrs"),
            get(plan_okrs::list_okrs).post(plan_okrs::create_okr),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/plan-collections/preview"),
            post(legacy_plan_import::preview).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/plan-collections/apply"),
            post(legacy_plan_import::apply).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/reports-catalog/preview"),
            post(legacy_reports_catalog_import::preview)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/reports-catalog/apply"),
            post(legacy_reports_catalog_import::apply)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-items/preview"),
            post(legacy_asset_items_import::preview).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-items/apply"),
            post(legacy_asset_items_import::apply).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-allocations/preview"),
            post(legacy_asset_allocations_import::preview)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-allocations/apply"),
            post(legacy_asset_allocations_import::apply)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-transfers/preview"),
            post(legacy_asset_transfers_import::preview)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-transfers/apply"),
            post(legacy_asset_transfers_import::apply)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-disposals/preview"),
            post(legacy_asset_disposals_import::preview)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-disposals/apply"),
            post(legacy_asset_disposals_import::apply)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-depreciations/preview"),
            post(legacy_asset_depreciations_import::preview)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-depreciations/apply"),
            post(legacy_asset_depreciations_import::apply)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-maintenances/preview"),
            post(legacy_asset_maintenances_import::preview)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/asset-maintenances/apply"),
            post(legacy_asset_maintenances_import::apply)
                .layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/employee-bank-accounts/preview"),
            post(employee_bank_import::preview).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/employee-bank-accounts/apply"),
            post(employee_bank_import::apply).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/hr/bank-import/quarantine"),
            get(employee_bank_import::list_quarantine),
        )
        .route(
            &format!("{API_PREFIX}/hr/bank-import/quarantine/{{source_key_sha256}}/adopt"),
            post(employee_bank_import::adopt_quarantined),
        )
        .route(
            &format!("{API_PREFIX}/hr/bank-import/quarantine/{{source_key_sha256}}/dismiss"),
            post(employee_bank_import::dismiss_quarantined),
        )
        .route(
            &format!("{API_PREFIX}/tasks"),
            get(tasks::list_tasks).post(tasks::create_task),
        )
        .route(
            &format!("{API_PREFIX}/tasks/batch"),
            post(tasks::create_task_batch),
        )
        .route(
            &format!("{API_PREFIX}/tasks/{{task_id}}"),
            get(tasks::get_task)
                .patch(tasks::update_task)
                .delete(tasks::delete_task),
        )
        .route(
            &format!("{API_PREFIX}/tasks/{{task_id}}/comments"),
            post(tasks::add_task_comment),
        )
        .route(
            &format!("{API_PREFIX}/tasks/{{task_id}}/reports"),
            post(tasks::add_task_report),
        )
        .route(
            &format!("{API_PREFIX}/tasks/{{task_id}}/attachments"),
            post(tasks::upload_task_attachment).layer(DefaultBodyLimit::max(50 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/tasks/{{task_id}}/attachments/{{attachment_id}}"),
            get(tasks::download_task_attachment).delete(tasks::delete_task_attachment),
        )
        .route(
            &format!("{API_PREFIX}/tasks/{{task_id}}/checklists/{{checklist_id}}"),
            patch(tasks::update_task_checklist),
        )
        .route(
            &format!("{API_PREFIX}/chat/channels"),
            get(chat::list_channels),
        )
        .route(&format!("{API_PREFIX}/chat/users"), get(chat::list_users))
        .route(
            &format!("{API_PREFIX}/chat/dms"),
            post(chat::create_direct_message).layer(DefaultBodyLimit::max(64 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/chat/channels/{{channel_id}}/messages"),
            get(chat::list_messages)
                .post(chat::send_message)
                .layer(DefaultBodyLimit::max(256 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/chat/channels/{{channel_id}}/read"),
            post(chat::mark_read),
        )
        .route(
            &format!("{API_PREFIX}/chat/messages/{{message_id}}/reactions"),
            post(chat::toggle_reaction).layer(DefaultBodyLimit::max(64 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/finance/cash-transactions"),
            get(finance::list_cash_transactions)
                .post(finance::create_cash_transaction)
                .layer(DefaultBodyLimit::max(64 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/finance/cash-transactions/{{transaction_id}}"),
            patch(finance::cancel_cash_transaction).layer(DefaultBodyLimit::max(16 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/finance/bank-accounts"),
            get(finance::list_bank_accounts)
                .post(finance::create_bank_account)
                .layer(DefaultBodyLimit::max(64 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/finance/bank-transfers"),
            post(finance::create_bank_transfer).layer(DefaultBodyLimit::max(64 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/finance/preview"),
            post(finance_import::preview).layer(DefaultBodyLimit::max(16 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/legacy-import/finance/apply"),
            post(finance_import::apply).layer(DefaultBodyLimit::max(16 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/documents"),
            get(documents::list_documents)
                .post(documents::create_document)
                .layer(DefaultBodyLimit::max(2 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/documents/{{document_id}}/events"),
            get(documents::document_events),
        )
        .route(
            &format!("{API_PREFIX}/documents/{{document_id}}/presence"),
            post(documents::publish_presence),
        )
        .route(
            &format!("{API_PREFIX}/documents/{{document_id}}/operations"),
            post(documents::save_operations).layer(DefaultBodyLimit::max(2 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/documents/{{document_id}}/snapshots"),
            post(documents::save_snapshot).layer(DefaultBodyLimit::max(2 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/documents/{{document_id}}/history"),
            get(documents::document_history),
        )
        .route(
            &format!("{API_PREFIX}/documents/{{document_id}}/comments"),
            get(documents::list_comments).post(documents::create_comment),
        )
        .route(
            &format!("{API_PREFIX}/documents/{{document_id}}/comments/{{comment_id}}"),
            patch(documents::update_comment).delete(documents::delete_comment),
        )
        .route(
            &format!("{API_PREFIX}/documents/{{document_id}}/share"),
            post(documents::share_document),
        )
        .route(
            &format!("{API_PREFIX}/documents/{{document_id}}/members"),
            get(documents::list_members),
        )
        .route(
            &format!("{API_PREFIX}/documents/{{document_id}}"),
            get(documents::get_document)
                .patch(documents::update_document)
                .delete(documents::delete_document),
        )
        .route(&format!("{API_PREFIX}/files"), get(list_files))
        .route(&format!("{API_PREFIX}/files/folders"), post(create_folder))
        .route(
            &format!("{API_PREFIX}/files/upload"),
            post(upload_file).layer(DefaultBodyLimit::max(50 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/files/share/{{token}}/download"),
            get(download_public_file_share),
        )
        .route(
            &format!("{API_PREFIX}/files/share/{{token}}"),
            get(get_public_file_share),
        )
        .route(
            &format!("{API_PREFIX}/files/{{file_id}}/share"),
            get(get_file_share)
                .post(update_file_share)
                .patch(update_file_share),
        )
        .route(
            &format!("{API_PREFIX}/files/{{file_id}}/download"),
            get(download_file),
        )
        .route(
            &format!("{API_PREFIX}/files/{{file_id}}/content"),
            put(update_file_content).layer(DefaultBodyLimit::max(50 * 1024 * 1024)),
        )
        .route(
            &format!("{API_PREFIX}/files/{{file_id}}"),
            patch(rename_file).delete(delete_file),
        )
        .route(
            &format!("{API_PREFIX}/system/storage-mode"),
            get(get_storage_mode).put(set_storage_mode),
        )
        .route(
            &format!("{API_PREFIX}/collections/{{scope}}"),
            get(list_collection)
                .put(replace_collection)
                .post(create_record),
        )
        .route(
            &format!("{API_PREFIX}/collections/{{scope}}/{{record_key}}"),
            patch(patch_record).delete(delete_record),
        )
        .route(&format!("{API_PREFIX}/{{*rest}}"), any(api_not_found))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        service: "kiyo-server",
        api_version: "v1",
    })
}

async fn api_not_found() -> ApiError {
    ApiError::not_found("API route not found.")
}

async fn platform_config() -> Json<Value> {
    Json(json!({
        "platform": "kiyo", "apiVersion": "v1", "storageModes": ["kiyo_cloud", "self_hosted", "local_admin"],
        "localAdmin": { "cloudIdentityRequired": true, "employeeAccess": false }
    }))
}

async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginInput>,
) -> ApiResult<Json<LoginResponse>> {
    let email = input.email.trim().to_lowercase();
    if email.is_empty() || input.password.is_empty() {
        return Err(ApiError::bad_request("Email and password are required."));
    }
    let row = {
        let db = state.db.lock().await;
        db.query_row("SELECT id, email, name, role, password_hash, is_active, created_at, updated_at FROM users WHERE lower(email) = lower(?1)", params![email], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, String>(4)?, row.get::<_, i64>(5)?, row.get::<_, String>(6)?, row.get::<_, String>(7)?))
        }).optional().map_err(ApiError::internal)?
    };
    let Some((id, email, name, role, password_hash, is_active, created_at, updated_at)) = row
    else {
        return Err(ApiError::unauthorized("Invalid email or password."));
    };
    if is_active == 0 {
        return Err(ApiError::forbidden("This account is inactive."));
    }
    let parsed_hash = PasswordHash::new(&password_hash).map_err(ApiError::internal)?;
    if Argon2::default()
        .verify_password(input.password.as_bytes(), &parsed_hash)
        .is_err()
    {
        return Err(ApiError::unauthorized("Invalid email or password."));
    }
    let user = User {
        id,
        email,
        name,
        role,
        is_active: true,
        created_at,
        updated_at,
    };
    let (session_id, token) = issue_session_token(&state, &user).await?;
    Ok(Json(LoginResponse {
        access_token: token,
        token_type: "Bearer",
        session_id,
        user,
    }))
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let user = authenticated_user(&state, &headers).await?;
    let claims = access_claims(&state, &headers)?;
    let session_id = claims
        .sid
        .as_deref()
        .ok_or_else(|| ApiError::unauthorized("This access token has no revocable session."))?;
    let now = Utc::now().timestamp();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let target_user_id = transaction
        .query_row(
            "SELECT user_id FROM auth_sessions WHERE id = ?1",
            params![&session_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Active session not found."))?;
    let changed = transaction
        .execute(
            "UPDATE auth_sessions SET revoked_at = ?1 WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL",
            params![now, session_id, &user.id],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::unauthorized("Session is no longer active."));
    }
    transaction
        .execute(
            "INSERT INTO auth_session_events (id, actor_user_id, subject_user_id, session_id, event_type, created_at) VALUES (?1, ?2, ?3, ?4, 'logout', ?5)",
            params![Uuid::new_v4().to_string(), &user.id, &target_user_id, session_id, now],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "revoked": true })))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminSessionRecord {
    id: String,
    user_id: String,
    name: String,
    email: String,
    role: String,
    issued_at: String,
    expires_at: String,
    is_current: bool,
}

async fn list_admin_sessions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let current_session_id = access_claims(&state, &headers)?.sid;
    let now = Utc::now().timestamp();
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT s.id, u.id, u.name, u.email, u.role, s.issued_at, s.expires_at
             FROM auth_sessions s JOIN users u ON u.id = s.user_id
             WHERE s.revoked_at IS NULL AND s.expires_at > ?1
             ORDER BY s.issued_at DESC, s.id ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![now], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
            ))
        })
        .map_err(ApiError::internal)?;
    let mut sessions = Vec::new();
    for row in rows {
        let (id, user_id, name, email, role, issued_at, expires_at) =
            row.map_err(ApiError::internal)?;
        let iso_time = |timestamp| {
            chrono::DateTime::<Utc>::from_timestamp(timestamp, 0)
                .map(|time| time.to_rfc3339())
                .unwrap_or_default()
        };
        sessions.push(AdminSessionRecord {
            is_current: current_session_id.as_deref() == Some(id.as_str()),
            id,
            user_id,
            name,
            email,
            role,
            issued_at: iso_time(issued_at),
            expires_at: iso_time(expires_at),
        });
    }
    Ok(Json(json!({ "data": sessions })))
}

async fn revoke_admin_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let current_session_id = access_claims(&state, &headers)?.sid;
    if current_session_id.as_deref() == Some(session_id.as_str()) {
        return Err(ApiError::bad_request(
            "Use the logout action to end the current session.",
        ));
    }
    let now = Utc::now().timestamp();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let target_user_id = transaction
        .query_row(
            "SELECT user_id FROM auth_sessions WHERE id = ?1",
            params![&session_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Active session not found."))?;
    let changed = transaction
        .execute(
            "UPDATE auth_sessions SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL AND expires_at > ?1",
            params![now, &session_id],
        )
        .map_err(ApiError::internal)?;
    if changed != 1 {
        return Err(ApiError::not_found("Active session not found."));
    }
    transaction
        .execute(
            "INSERT INTO auth_session_events (id, actor_user_id, subject_user_id, session_id, event_type, created_at) VALUES (?1, ?2, ?3, ?4, 'admin_revoke', ?5)",
            params![Uuid::new_v4().to_string(), &actor.id, &target_user_id, &session_id, now],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "revoked": true })))
}

async fn profile(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    let user = authenticated_user(&state, &headers).await?;
    Ok(Json(json!({ "user": user })))
}

async fn introspect(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<IntrospectionResponse>> {
    Ok(Json(IntrospectionResponse {
        active: true,
        user: authenticated_user(&state, &headers).await?,
    }))
}

async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ChangePasswordInput>,
) -> ApiResult<Json<Value>> {
    let user = authenticated_user(&state, &headers).await?;
    let claims = access_claims(&state, &headers)?;
    change_password_for_user(&state, &user.id, claims.sid.as_deref(), input).await?;
    Ok(Json(json!({
        "success": true,
        "message": "Đã thay đổi mật khẩu tài khoản thành công."
    })))
}

async fn change_password_for_user(
    state: &AppState,
    user_id: &str,
    current_session_id: Option<&str>,
    input: ChangePasswordInput,
) -> ApiResult<()> {
    if input.old_password.is_empty() {
        return Err(ApiError::unprocessable("Vui lòng nhập mật khẩu hiện tại."));
    }
    if input.new_password.is_empty() {
        return Err(ApiError::unprocessable("Vui lòng nhập mật khẩu mới."));
    }
    let password_length = input.new_password.chars().count();
    if !(12..=256).contains(&password_length) {
        return Err(ApiError::unprocessable(
            "Mật khẩu mới phải dài từ 12 đến 256 ký tự.",
        ));
    }
    if !input.new_password.chars().any(char::is_lowercase)
        || !input.new_password.chars().any(char::is_uppercase)
        || !input.new_password.chars().any(|c| c.is_ascii_digit())
        || !input
            .new_password
            .chars()
            .any(|c| !c.is_alphanumeric() && !c.is_whitespace())
    {
        return Err(ApiError::unprocessable(
            "Mật khẩu mới cần chữ hoa, chữ thường, số và ký tự đặc biệt.",
        ));
    }
    if input
        .confirm_password
        .as_ref()
        .is_some_and(|confirm| confirm != &input.new_password)
    {
        return Err(ApiError::unprocessable(
            "Xác nhận mật khẩu mới không trùng khớp.",
        ));
    }

    let current_hash: String = {
        let db = state.db.lock().await;
        db.query_row(
            "SELECT password_hash FROM users WHERE id = ?1",
            params![user_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Không tìm thấy thông tin tài khoản."))?
    };
    let old_password = input.old_password;
    let new_password = input.new_password;
    let hash_for_verification = current_hash.clone();
    let replacement_hash = tokio::task::spawn_blocking(move || {
        let parsed_hash = PasswordHash::new(&hash_for_verification).map_err(ApiError::internal)?;
        if Argon2::default()
            .verify_password(old_password.as_bytes(), &parsed_hash)
            .is_err()
        {
            return Err(ApiError::bad_request("Mật khẩu hiện tại không chính xác."));
        }
        password_hash(&new_password)
    })
    .await
    .map_err(ApiError::internal)??;
    let now = Utc::now().timestamp();
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let changed = transaction
        .execute(
            "UPDATE users SET password_hash = ?1, updated_at = ?2 WHERE id = ?3 AND password_hash = ?4",
            params![replacement_hash, Utc::now().to_rfc3339(), user_id, current_hash],
        )
        .map_err(ApiError::internal)?;
    if changed == 0 {
        return Err(ApiError::bad_request(
            "Mật khẩu đã thay đổi trong phiên khác. Vui lòng thử lại.",
        ));
    }
    let mut statement = transaction
        .prepare(
            "SELECT id FROM auth_sessions
             WHERE user_id = ?1 AND revoked_at IS NULL AND expires_at > ?2 AND id != ?3",
        )
        .map_err(ApiError::internal)?;
    let sessions = statement
        .query_map(
            params![user_id, now, current_session_id.unwrap_or("")],
            |row| row.get::<_, String>(0),
        )
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    drop(statement);
    for session_id in sessions {
        transaction
            .execute(
                "UPDATE auth_sessions SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL",
                params![now, &session_id],
            )
            .map_err(ApiError::internal)?;
        transaction
            .execute(
                "INSERT INTO auth_session_events (id, actor_user_id, subject_user_id, session_id, event_type, created_at) VALUES (?1, ?2, ?2, ?3, 'password_change', ?4)",
                params![Uuid::new_v4().to_string(), user_id, &session_id, now],
            )
            .map_err(ApiError::internal)?;
    }
    transaction.commit().map_err(ApiError::internal)?;
    Ok(())
}

async fn dashboard_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let current_month = Utc::now().format("%Y-%m").to_string();
    let (
        total_employees,
        active_employees,
        new_employees_this_month,
        monthly_revenue,
        monthly_expense,
    ) = {
        let db = state.db.lock().await;
        let employee_counts = db
            .query_row(
                "SELECT COUNT(*),
                    COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0),
                    COALESCE(SUM(CASE WHEN substr(created_at, 1, 7) = ?1 THEN 1 ELSE 0 END), 0)
             FROM users WHERE role != ?2",
                params![current_month, ADMIN_ROLE],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                    ))
                },
            )
            .map_err(ApiError::internal)?;
        let (revenue, expense) = db
            .query_row(
                "SELECT
                   COALESCE(SUM(CASE WHEN transaction_type = 'Thu' THEN amount ELSE 0 END), 0),
                   COALESCE(SUM(CASE WHEN transaction_type = 'Chi' THEN amount ELSE 0 END), 0)
                 FROM finance_cash_transactions
                 WHERE status = 'Đã hoàn thành'
                   AND (substr(transaction_date, 1, 7) = ?1 OR substr(created_at, 1, 7) = ?1)",
                params![current_month],
                |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
            )
            .map_err(ApiError::internal)?;
        (
            employee_counts.0,
            employee_counts.1,
            employee_counts.2,
            revenue,
            expense,
        )
    };
    let mut pending_workflows = collection_records(&state, "workflows")
        .await?
        .into_iter()
        .filter(|record| {
            record
                .get("status")
                .and_then(Value::as_str)
                .is_some_and(|status| {
                    matches!(status, "Chờ duyệt" | "Đang xử lý" | "Chờ ký số" | "pending")
                })
        })
        .collect::<Vec<_>>();
    let pending_requests = collection_records(&state, "workflow_requests").await?;
    for request in pending_requests.into_iter().filter(|record| {
        record
            .get("status")
            .and_then(Value::as_str)
            .is_some_and(|status| {
                matches!(status, "Chờ duyệt" | "Đang xử lý" | "Chờ ký số" | "pending")
            })
    }) {
        let key = request
            .get("key")
            .and_then(Value::as_str)
            .unwrap_or_default();
        pending_workflows.push(json!({
            "key": key,
            "id": key,
            "code": request.get("code").and_then(Value::as_str).unwrap_or_default(),
            "title": request.get("workflowName").and_then(Value::as_str).unwrap_or_default(),
            "requester": request.get("requester").and_then(Value::as_str).unwrap_or_default(),
            "department": request.get("department").and_then(Value::as_str).unwrap_or_default(),
            "submittedDate": request.get("submittedAt").and_then(Value::as_str).unwrap_or_default(),
            "status": request.get("status").and_then(Value::as_str).unwrap_or_default(),
            "type": request.get("category").and_then(Value::as_str).unwrap_or_default(),
            "amount": request.get("budgetAmount").cloned().unwrap_or(Value::Null),
        }));
    }
    let recent_audit_logs = {
        let db = state.db.lock().await;
        audit::recent_events(&db, 5)?
    };
    Ok(Json(json!({
        "totalUsers": total_employees,
        "activeUsers": active_employees,
        "totalEmployees": total_employees,
        "newEmployeesThisMonth": new_employees_this_month,
        "monthlyRevenue": monthly_revenue,
        "monthlyExpense": monthly_expense,
        "pendingApprovalsCount": pending_workflows.len(),
        "pendingWorkflows": pending_workflows,
        "recentAuditLogs": recent_audit_logs,
        "financialMetricsAvailable": true,
        "auditLogsAvailable": true
    })))
}

async fn list_users(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<UserListQuery>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let page = query.page.unwrap_or(1).clamp(1, 1_000_000);
    let limit = query.limit.unwrap_or(20).clamp(1, 100);
    let offset = (page - 1) * limit;
    let search = query.search.unwrap_or_default();
    let search = search.trim();
    if search.chars().count() > 160 {
        return Err(ApiError::bad_request(
            "User search must be 160 characters or fewer.",
        ));
    }
    let search = search.to_lowercase();
    let filter = query.filter.as_deref().unwrap_or("all").trim();
    if !["all", "active", "locked", "admin", "retired"].contains(&filter) {
        return Err(ApiError::bad_request("Unsupported user list filter."));
    }
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.updated_at,
                    p.employee_code, p.phone, p.department, p.position, p.employment_status
             FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id
             ORDER BY u.created_at DESC, u.id ASC",
        )
        .map_err(ApiError::internal)?;
    let users = statement
        .query_map([], admin_user_from_sql)
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    let summary = json!({
        "total": users.len(),
        "active": users.iter().filter(|user| user.user.is_active).count(),
        "admins": users
            .iter()
            .filter(|user| user.user.role == ADMIN_ROLE)
            .count(),
    });
    let filtered = users
        .into_iter()
        .filter(|user| {
            let filter_matches = match filter {
                "active" => user.user.is_active,
                "locked" => !user.user.is_active,
                "admin" => user.user.role == ADMIN_ROLE,
                "retired" => user.activation_status == "Đã nghỉ việc",
                _ => true,
            };
            let search_matches = search.is_empty()
                || user.user.name.to_lowercase().contains(&search)
                || user.user.email.to_lowercase().contains(&search)
                || user.employee_code.to_lowercase().contains(&search)
                || user.department.to_lowercase().contains(&search)
                || user.position.to_lowercase().contains(&search)
                || user.user.role.to_lowercase().contains(&search);
            filter_matches && search_matches
        })
        .collect::<Vec<_>>();
    let total = filtered.len();
    let users = filtered
        .into_iter()
        .skip(offset)
        .take(limit)
        .collect::<Vec<_>>();
    Ok(Json(json!({
        "data": users,
        "pagination": { "page": page, "limit": limit, "total": total },
        "summary": summary,
    })))
}

async fn get_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let requester = authenticated_user(&state, &headers).await?;
    if requester.role != ADMIN_ROLE && requester.id != user_id {
        return Err(ApiError::forbidden(
            "You cannot view another user's account.",
        ));
    }
    Ok(Json(
        json!({ "user": find_admin_user(&state, &user_id).await? }),
    ))
}

async fn create_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateUserInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    require_admin(&state, &headers).await?;
    let email = normalized_email(Some(&input.email))?;
    let name = required_employee_text(Some(&input.name), "Name", 160)?;
    let role = input.role.trim().to_uppercase();
    if !["ADMIN", "USER"].contains(&role.as_str()) {
        return Err(ApiError::bad_request("Role must be ADMIN or USER."));
    }
    validate_activation_password(&input.password)?;
    let employee_code = input
        .employee_code
        .as_deref()
        .map(|code| required_employee_text(Some(code), "Employee code", 64))
        .transpose()?
        .unwrap_or_else(|| {
            format!(
                "USR-{}",
                &Uuid::new_v4().simple().to_string()[..12].to_ascii_uppercase()
            )
        })
        .to_uppercase();
    let department = optional_employee_text(input.department.as_deref(), 160)?;
    let phone = optional_employee_text(input.phone.as_deref(), 32)?;
    let position = optional_employee_text(input.position.as_deref(), 160)?;
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(input.password.as_bytes(), &salt)
        .map_err(|error| ApiError::internal(error.to_string()))?
        .to_string();
    let user = User {
        id: Uuid::new_v4().to_string(),
        email,
        name: name.to_owned(),
        role,
        is_active: true,
        created_at: Utc::now().to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
    };
    {
        let mut db = state.db.lock().await;
        let transaction = db.transaction().map_err(ApiError::internal)?;
        let duplicate_email: Option<String> = transaction
            .query_row(
                "SELECT id FROM users WHERE lower(email) = lower(?1)",
                params![&user.email],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        if duplicate_email.is_some() {
            return Err(ApiError::conflict("Email already exists."));
        }
        let duplicate_code: Option<String> = transaction
            .query_row(
                "SELECT user_id FROM employee_profiles WHERE lower(employee_code) = lower(?1)",
                params![&employee_code],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        if duplicate_code.is_some() {
            return Err(ApiError::conflict("Employee code already exists."));
        }
        transaction
            .execute(
                "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
                params![
                    &user.id,
                    &user.email,
                    &user.name,
                    &user.role,
                    password_hash,
                    &user.created_at,
                    &user.updated_at
                ],
            )
            .map_err(ApiError::internal)?;
        transaction
            .execute(
                "INSERT INTO employee_profiles (user_id, employee_code, phone, department, position, employment_status, join_date, salary_base, avatar_url, details_json, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'Chính thức', ?6, 0, '', '{}', ?6, ?6)",
                params![
                    &user.id,
                    &employee_code,
                    phone,
                    department,
                    position,
                    &user.created_at
                ],
            )
            .map_err(ApiError::internal)?;
        ensure_employee_workspace_in_db(&transaction, &user, &employee_code)?;
        transaction.commit().map_err(ApiError::internal)?;
    }
    Ok((
        StatusCode::CREATED,
        Json(json!({ "user": find_admin_user(&state, &user.id).await? })),
    ))
}

async fn update_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    Json(input): Json<UpdateUserInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    let current = find_admin_user(&state, &user_id).await?;
    let name = input
        .name
        .as_deref()
        .map(|name| required_employee_text(Some(name), "Name", 160))
        .transpose()?
        .unwrap_or_else(|| current.user.name.clone());
    let email = input
        .email
        .as_deref()
        .map(|email| normalized_email(Some(email)))
        .transpose()?
        .unwrap_or_else(|| current.user.email.clone());
    let role = input
        .role
        .as_deref()
        .map(|role| role.trim().to_uppercase())
        .unwrap_or_else(|| current.user.role.clone());
    if !["ADMIN", "USER"].contains(&role.as_str()) {
        return Err(ApiError::bad_request("Role must be ADMIN or USER."));
    }
    let is_active = input.is_active.unwrap_or(current.user.is_active);
    if actor.id == user_id && !is_active {
        return Err(ApiError::bad_request(
            "You cannot deactivate the account currently in use.",
        ));
    }
    let updated_at = Utc::now().to_rfc3339();
    {
        let mut db = state.db.lock().await;
        let transaction = db.transaction().map_err(ApiError::internal)?;
        let email_owner: Option<String> = transaction
            .query_row(
                "SELECT id FROM users WHERE lower(email) = lower(?1) AND id != ?2",
                params![&email, &user_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        if email_owner.is_some() {
            return Err(ApiError::conflict("Email already exists."));
        }
        if is_active && !current.user.is_active {
            let employment_status: Option<String> = transaction
                .query_row(
                    "SELECT employment_status FROM employee_profiles WHERE user_id = ?1",
                    params![&user_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(ApiError::internal)?;
            if employment_status.as_deref() == Some("Đã nghỉ việc") {
                return Err(ApiError::unprocessable(
                    "A retired employee account cannot be reactivated from user management.",
                ));
            }
            let pending_activation: Option<String> = transaction
                .query_row(
                    "SELECT id FROM activation_tokens
                     WHERE user_id = ?1 AND used_at IS NULL AND expires_at > ?2 LIMIT 1",
                    params![&user_id, Utc::now().to_rfc3339()],
                    |row| row.get(0),
                )
                .optional()
                .map_err(ApiError::internal)?;
            if pending_activation.is_some() {
                return Err(ApiError::unprocessable(
                    "This account must be activated through its one-time activation link.",
                ));
            }
        }
        let profile_exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM employee_profiles WHERE user_id = ?1)",
                params![&user_id],
                |row| row.get(0),
            )
            .map_err(ApiError::internal)?;
        if profile_exists {
            let employee_code = input
                .employee_code
                .as_deref()
                .map(|code| required_employee_text(Some(code), "Employee code", 64))
                .transpose()?
                .unwrap_or_else(|| current.employee_code.clone())
                .to_uppercase();
            let department = input
                .department
                .as_deref()
                .map(|value| optional_employee_text(Some(value), 160))
                .transpose()?
                .unwrap_or_else(|| current.department.clone());
            let phone = input
                .phone
                .as_deref()
                .map(|value| optional_employee_text(Some(value), 32))
                .transpose()?
                .unwrap_or_else(|| current.phone.clone());
            let position = input
                .position
                .as_deref()
                .map(|value| optional_employee_text(Some(value), 160))
                .transpose()?
                .unwrap_or_else(|| current.position.clone());
            let code_owner: Option<String> = transaction
                .query_row(
                    "SELECT user_id FROM employee_profiles WHERE lower(employee_code) = lower(?1) AND user_id != ?2",
                    params![&employee_code, &user_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(ApiError::internal)?;
            if code_owner.is_some() {
                return Err(ApiError::conflict("Employee code already exists."));
            }
            transaction
                .execute(
                    "UPDATE employee_profiles SET employee_code = ?1, phone = ?2, department = ?3, position = ?4, updated_at = ?5 WHERE user_id = ?6",
                    params![employee_code, phone, department, position, &updated_at, &user_id],
                )
                .map_err(ApiError::internal)?;
        }
        transaction
            .execute(
                "UPDATE users SET name = ?1, email = ?2, role = ?3, is_active = ?4, updated_at = ?5 WHERE id = ?6",
                params![name, email, role, is_active as i64, &updated_at, &user_id],
            )
            .map_err(ApiError::internal)?;
        if current.user.is_active && !is_active {
            let revoked_at = Utc::now().timestamp();
            let mut statement = transaction
                .prepare(
                    "SELECT id FROM auth_sessions WHERE user_id = ?1 AND revoked_at IS NULL AND expires_at > ?2",
                )
                .map_err(ApiError::internal)?;
            let sessions = statement
                .query_map(params![&user_id, revoked_at], |row| row.get::<_, String>(0))
                .map_err(ApiError::internal)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(ApiError::internal)?;
            drop(statement);
            for session_id in sessions {
                transaction
                    .execute(
                        "UPDATE auth_sessions SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL",
                        params![revoked_at, &session_id],
                    )
                    .map_err(ApiError::internal)?;
                transaction
                    .execute(
                        "INSERT INTO auth_session_events (id, actor_user_id, subject_user_id, session_id, event_type, created_at) VALUES (?1, ?2, ?3, ?4, 'account_deactivated', ?5)",
                        params![Uuid::new_v4().to_string(), &actor.id, &user_id, &session_id, revoked_at],
                    )
                    .map_err(ApiError::internal)?;
            }
        }
        if profile_exists && is_active {
            let updated_user = User {
                id: user_id.clone(),
                email,
                name,
                role,
                is_active,
                created_at: current.user.created_at.clone(),
                updated_at,
            };
            let code: String = transaction
                .query_row(
                    "SELECT employee_code FROM employee_profiles WHERE user_id = ?1",
                    params![&user_id],
                    |row| row.get(0),
                )
                .map_err(ApiError::internal)?;
            ensure_employee_workspace_in_db(&transaction, &updated_user, &code)?;
        }
        transaction.commit().map_err(ApiError::internal)?;
    }
    Ok(Json(
        json!({ "user": find_admin_user(&state, &user_id).await? }),
    ))
}

async fn delete_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let requester = require_admin(&state, &headers).await?;
    if requester.id == user_id {
        return Err(ApiError::bad_request(
            "You cannot delete the account currently in use.",
        ));
    }
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let has_attendance_request_history: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM employee_leave_requests WHERE employee_id = ?1) \
                OR EXISTS(SELECT 1 FROM employee_overtime_requests WHERE employee_id = ?1) \
                OR EXISTS(SELECT 1 FROM attendance_shift_assignments WHERE employee_id = ?1) \
                OR EXISTS(SELECT 1 FROM attendance_shift_assignment_events WHERE actor_id = ?1)",
            params![&user_id],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    if has_attendance_request_history {
        return Err(ApiError::conflict(
            "This account has attendance request history; retire or deactivate it instead of deleting it.",
        ));
    }
    let mut statement = transaction
        .prepare("SELECT id FROM auth_sessions WHERE user_id = ?1")
        .map_err(ApiError::internal)?;
    let sessions = statement
        .query_map(params![&user_id], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(ApiError::internal)?;
    drop(statement);
    let deleted_at = Utc::now().timestamp();
    for session_id in sessions {
        transaction
            .execute(
                "INSERT INTO auth_session_events (id, actor_user_id, subject_user_id, session_id, event_type, created_at) VALUES (?1, ?2, ?3, ?4, 'account_deleted', ?5)",
                params![Uuid::new_v4().to_string(), &requester.id, &user_id, &session_id, deleted_at],
            )
            .map_err(ApiError::internal)?;
    }
    let deleted = transaction
        .execute("DELETE FROM users WHERE id = ?1", params![user_id])
        .map_err(ApiError::internal)?;
    if deleted == 0 {
        return Err(ApiError::not_found("User not found."));
    }
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "deleted": true })))
}

async fn list_employees(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let employees = all_employees(&state).await?;
    Ok(Json(json!({
        "data": employees.into_iter().map(employee_value).collect::<Vec<_>>()
    })))
}

async fn create_employee(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<EmployeeInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let name = required_employee_text(input.name.as_deref(), "Name", 160)?;
    let email = normalized_email(input.email.as_deref())?;
    let employee_code = required_employee_text(
        input.employee_code.as_deref().or(input.code.as_deref()),
        "Employee code",
        64,
    )?
    .to_uppercase();
    let department = optional_employee_text(input.department.as_deref(), 160)?;
    let position = optional_employee_text(input.position.as_deref(), 160)?;
    let status = employee_status(input.status.as_deref().unwrap_or("Chính thức"))?;
    if status == "Đã nghỉ việc" {
        return Err(ApiError::bad_request(
            "Create the employee first, then use the retirement action to end employment.",
        ));
    }
    let join_date = match input.join_date.as_deref().map(str::trim) {
        Some(value) if !value.is_empty() => normalized_join_date(value)?,
        _ => Utc::now().format("%Y-%m-%d").to_string(),
    };
    let salary_base = input.salary_base.unwrap_or(0);
    if salary_base < 0 {
        return Err(ApiError::bad_request("Salary base cannot be negative."));
    }
    let phone = optional_employee_text(input.phone.as_deref(), 32)?;
    let avatar = optional_employee_text(input.avatar.as_deref(), 20_000)?;
    let mut details = object_value(input.details)?;
    if let Some(address) = input.address.as_deref() {
        set_employee_address(&mut details, address)?;
    }
    ensure_profile_has_no_bank_account_fields(&details)?;
    let now = Utc::now().to_rfc3339();
    let user = User {
        id: Uuid::new_v4().to_string(),
        email,
        name,
        role: "USER".to_owned(),
        is_active: false,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    let temporary_password = format!("pending-{}", Uuid::new_v4());
    let password_hash = password_hash(&temporary_password)?;
    let expires_at = {
        let mut db = state.db.lock().await;
        let transaction = db.transaction().map_err(ApiError::internal)?;
        let duplicate_user: Option<String> = transaction
            .query_row(
                "SELECT id FROM users WHERE lower(email) = lower(?1)",
                params![&user.email],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        if duplicate_user.is_some() {
            return Err(ApiError::conflict("Email already exists."));
        }
        let duplicate_code: Option<String> = transaction
            .query_row(
                "SELECT user_id FROM employee_profiles WHERE lower(employee_code) = lower(?1)",
                params![&employee_code],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        if duplicate_code.is_some() {
            return Err(ApiError::conflict("Employee code already exists."));
        }
        transaction.execute(
            "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, 'USER', ?4, 0, ?5, ?5)",
            params![&user.id, &user.email, &user.name, password_hash, &now],
        ).map_err(ApiError::internal)?;
        transaction.execute(
            "INSERT INTO employee_profiles (user_id, employee_code, phone, department, position, employment_status, join_date, salary_base, avatar_url, details_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)",
            params![&user.id, &employee_code, phone, department, position, status, join_date, salary_base, avatar, details.to_string(), &now],
        ).map_err(ApiError::internal)?;
        ensure_employee_workspace_in_db(&transaction, &user, &employee_code)?;
        let expiration = issue_activation_token(&transaction, &user.id)?;
        transaction.commit().map_err(ApiError::internal)?;
        expiration
    };
    let employee = find_employee(&state, &user.id).await?;
    Ok(Json(json!({
        "employee": employee_value(employee),
        "user": user,
        "delivery": { "status": "not_configured", "message": "Email delivery is not configured on this Kiyo API instance." },
        "expiresAt": expires_at
    })))
}

async fn get_employee(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(employee_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    if actor.role != ADMIN_ROLE && actor.id != employee_id {
        return Err(ApiError::forbidden(
            "You cannot view this employee profile.",
        ));
    }
    Ok(Json(
        json!({ "employee": employee_value(find_employee(&state, &employee_id).await?) }),
    ))
}

async fn my_employee_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    Ok(Json(
        json!({ "employee": employee_value(find_employee(&state, &actor.id).await?) }),
    ))
}

async fn update_employee(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(employee_id): Path<String>,
    Json(input): Json<EmployeeInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    if actor.role != ADMIN_ROLE && actor.id != employee_id {
        return Err(ApiError::forbidden(
            "You cannot update this employee profile.",
        ));
    }
    let employee = apply_employee_update(
        &state,
        &employee_id,
        input,
        actor.role == ADMIN_ROLE,
        &actor.id,
    )
    .await?;
    Ok(Json(json!({ "employee": employee_value(employee) })))
}

async fn update_my_employee_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<EmployeeInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let employee = apply_employee_update(&state, &actor.id, input, false, &actor.id).await?;
    Ok(Json(json!({ "employee": employee_value(employee) })))
}

async fn retire_employee(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(employee_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    if actor.id == employee_id {
        return Err(ApiError::bad_request(
            "You cannot retire the account currently in use.",
        ));
    }
    find_employee(&state, &employee_id).await?;
    let timestamp = Utc::now().to_rfc3339();
    {
        let mut db = state.db.lock().await;
        let transaction = db.transaction().map_err(ApiError::internal)?;
        transaction
            .execute(
                "UPDATE users SET is_active = 0, updated_at = ?1 WHERE id = ?2",
                params![&timestamp, &employee_id],
            )
            .map_err(ApiError::internal)?;
        let revoked_at = Utc::now().timestamp();
        let mut statement = transaction
            .prepare(
                "SELECT id FROM auth_sessions WHERE user_id = ?1 AND revoked_at IS NULL AND expires_at > ?2",
            )
            .map_err(ApiError::internal)?;
        let sessions = statement
            .query_map(params![&employee_id, revoked_at], |row| {
                row.get::<_, String>(0)
            })
            .map_err(ApiError::internal)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(ApiError::internal)?;
        drop(statement);
        for session_id in sessions {
            transaction
                .execute(
                    "UPDATE auth_sessions SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL",
                    params![revoked_at, &session_id],
                )
                .map_err(ApiError::internal)?;
            transaction
                .execute(
                    "INSERT INTO auth_session_events (id, actor_user_id, subject_user_id, session_id, event_type, created_at) VALUES (?1, ?2, ?3, ?4, 'account_deactivated', ?5)",
                    params![Uuid::new_v4().to_string(), &actor.id, &employee_id, &session_id, revoked_at],
                )
                .map_err(ApiError::internal)?;
        }
        transaction.execute("UPDATE employee_profiles SET employment_status = 'Đã nghỉ việc', updated_at = ?1 WHERE user_id = ?2", params![&timestamp, &employee_id]).map_err(ApiError::internal)?;
        transaction
            .execute(
                "UPDATE activation_tokens SET used_at = ?1 WHERE user_id = ?2 AND used_at IS NULL",
                params![&timestamp, &employee_id],
            )
            .map_err(ApiError::internal)?;
        transaction.commit().map_err(ApiError::internal)?;
    }
    Ok(Json(
        json!({ "employee": employee_value(find_employee(&state, &employee_id).await?) }),
    ))
}

async fn resend_employee_activation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(employee_id): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let employee = find_employee(&state, &employee_id).await?;
    if employee.user.is_active {
        return Err(ApiError::bad_request(
            "This account has already been activated.",
        ));
    }
    if employee.status == "Đã nghỉ việc" {
        return Err(ApiError::unprocessable(
            "A retired employee cannot receive a new activation link.",
        ));
    }
    Err(ApiError::service_unavailable(
        "Email delivery is not configured; no new activation link was issued and existing links remain valid.",
    ))
}

async fn authorize_activation(
    State(state): State<AppState>,
    Json(input): Json<ActivationAuthorizeInput>,
) -> ApiResult<Json<Value>> {
    let (activation_id, user_id, expires_at) =
        activation_record(&state, input.token.trim()).await?;
    let user = find_user(&state, &user_id).await?;
    if user.is_active {
        return Err(ApiError::gone("This activation link is no longer valid."));
    }
    if find_employee(&state, &user_id).await?.status == "Đã nghỉ việc" {
        return Err(ApiError::gone(
            "A retired employee account cannot be activated.",
        ));
    }
    let expiration = chrono::DateTime::parse_from_rfc3339(&expires_at)
        .map_err(ApiError::internal)?
        .with_timezone(&Utc);
    let now = Utc::now();
    let activation_token = encode(
        &Header::default(),
        &ActivationClaims {
            sub: user.id.clone(),
            role: user.role.clone(),
            scope: "activation".to_owned(),
            activation_id,
            iat: now.timestamp() as usize,
            exp: expiration.timestamp() as usize,
        },
        &state.jwt_encoding,
    )
    .map_err(ApiError::internal)?;
    Ok(Json(json!({
        "activation_token": activation_token,
        "expires_at": expires_at,
        "user": user
    })))
}

async fn set_activation_password(
    State(state): State<AppState>,
    Json(input): Json<ActivationPasswordInput>,
) -> ApiResult<Json<LoginResponse>> {
    if input.google_credential.is_some() {
        return Err(ApiError::unprocessable(
            "Google account linking is not configured on this Kiyo API instance.",
        ));
    }
    let password = input.password.trim();
    validate_activation_password(password)?;
    let token = input.activation_token.trim();
    let claims = decode::<ActivationClaims>(
        token,
        &state.jwt_decoding,
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| ApiError::unauthorized("Activation session is invalid or expired."))?
    .claims;
    if claims.scope != "activation" {
        return Err(ApiError::unauthorized("Activation session is invalid."));
    }
    let password_hash = password_hash(password)?;
    let now = Utc::now().to_rfc3339();
    let user_id = claims.sub.clone();
    {
        let mut db = state.db.lock().await;
        let transaction = db.transaction().map_err(ApiError::internal)?;
        let activation: Option<(Option<String>, String)> = transaction
            .query_row(
                "SELECT used_at, expires_at FROM activation_tokens WHERE id = ?1 AND user_id = ?2",
                params![claims.activation_id, user_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(ApiError::internal)?;
        let Some((used_at, expires_at)) = activation else {
            return Err(ApiError::gone("Activation link is no longer valid."));
        };
        let expiration = chrono::DateTime::parse_from_rfc3339(&expires_at)
            .map_err(ApiError::internal)?
            .with_timezone(&Utc);
        if used_at.is_some() || expiration <= Utc::now() {
            return Err(ApiError::gone(
                "Activation link has expired or was already used.",
            ));
        }
        let mut user = transaction
            .query_row(
                "SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = ?1",
                params![user_id],
                user_from_sql,
            )
            .optional()
            .map_err(ApiError::internal)?
            .ok_or_else(|| ApiError::gone("Activation account no longer exists."))?;
        if user.is_active {
            return Err(ApiError::gone("This account has already been activated."));
        }
        let employment_status: Option<String> = transaction
            .query_row(
                "SELECT employment_status FROM employee_profiles WHERE user_id = ?1",
                params![&user_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        if employment_status.as_deref() == Some("Đã nghỉ việc") {
            return Err(ApiError::gone(
                "A retired employee account cannot be activated.",
            ));
        }
        user.is_active = true;
        user.updated_at = now.clone();
        transaction
            .execute(
                "UPDATE users SET password_hash = ?1, is_active = 1, updated_at = ?2 WHERE id = ?3",
                params![password_hash, now, user_id],
            )
            .map_err(ApiError::internal)?;
        transaction
            .execute(
                "UPDATE employee_profiles SET employment_status = 'Chính thức', updated_at = ?1 WHERE user_id = ?2 AND (employment_status = 'Chờ kích hoạt' OR employment_status IS NULL)",
                params![now, user_id],
            )
            .map_err(ApiError::internal)?;
        let employee_code: Option<String> = transaction
            .query_row(
                "SELECT employee_code FROM employee_profiles WHERE user_id = ?1",
                params![user_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        if let Some(employee_code) = employee_code {
            ensure_employee_workspace_in_db(&transaction, &user, &employee_code)?;
        }
        transaction
            .execute(
                "UPDATE activation_tokens SET used_at = ?1 WHERE id = ?2 AND used_at IS NULL",
                params![now, claims.activation_id],
            )
            .map_err(ApiError::internal)?;
        transaction.commit().map_err(ApiError::internal)?;
    }
    let user = find_user(&state, &user_id).await?;
    let (session_id, token) = issue_session_token(&state, &user).await?;
    Ok(Json(LoginResponse {
        access_token: token,
        token_type: "Bearer",
        session_id,
        user,
    }))
}

async fn list_system_broadcasts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT record_json FROM collection_records WHERE scope = 'system_broadcasts' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    let records = rows
        .into_iter()
        .map(|row| serde_json::from_str::<Value>(&row).map_err(ApiError::internal))
        .collect::<ApiResult<Vec<_>>>()?;
    Ok(Json(json!({ "data": records })))
}

async fn create_system_broadcast(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<SystemBroadcastInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    let (title, content, broadcast_type, target_audience, channels) =
        validate_system_broadcast_fields(
            input.title,
            input.content,
            input.broadcast_type,
            input.target_audience,
            input.channels,
        )?;
    let timestamp = Utc::now();
    let record = SystemBroadcast {
        id: format!("SYS-NOTIF-{}", Uuid::new_v4()),
        title,
        content,
        broadcast_type,
        target_audience,
        sender: actor.name,
        created_at: timestamp.format("%Y-%m-%d %H:%M").to_string(),
        scheduled_at: None,
        channels,
        read_count: 0,
        total_recipients: 0,
        // Until a delivery adapter exists, new records are drafts, never falsely "sent".
        status: "Nháp".to_owned(),
        extra: HashMap::new(),
    };
    let serialized = serde_json::to_string(&record).map_err(ApiError::internal)?;
    let db = state.db.lock().await;
    db.execute(
        "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES ('system_broadcasts', ?1, ?2, ?3, ?3)",
        params![&record.id, serialized, timestamp.to_rfc3339()],
    )
    .map_err(|error| {
        if error.to_string().contains("UNIQUE") {
            ApiError::conflict("Broadcast ID already exists.")
        } else {
            ApiError::internal(error)
        }
    })?;
    Ok((StatusCode::CREATED, Json(json!({ "record": record }))))
}

async fn update_system_broadcast(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(broadcast_id): Path<String>,
    Json(input): Json<UpdateSystemBroadcastInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let serialized: Option<String> = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = 'system_broadcasts' AND record_key = ?1",
            params![&broadcast_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(serialized) = serialized else {
        return Err(ApiError::not_found("Broadcast not found."));
    };
    let mut record: SystemBroadcast =
        serde_json::from_str(&serialized).map_err(ApiError::internal)?;
    let (title, content, broadcast_type, target_audience, channels) =
        validate_system_broadcast_fields(
            input.title.unwrap_or(record.title),
            input.content.unwrap_or(record.content),
            input.broadcast_type.unwrap_or(record.broadcast_type),
            input.target_audience.unwrap_or(record.target_audience),
            input.channels.unwrap_or(record.channels),
        )?;
    record.title = title;
    record.content = content;
    record.broadcast_type = broadcast_type;
    record.target_audience = target_audience;
    record.channels = channels;
    let updated_json = serde_json::to_string(&record).map_err(ApiError::internal)?;
    let updated_at = Utc::now().to_rfc3339();
    transaction.execute(
        "UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = 'system_broadcasts' AND record_key = ?3",
        params![updated_json, updated_at, &broadcast_id],
    )
    .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "record": record })))
}

async fn delete_system_broadcast(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(broadcast_id): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let deleted = db
        .execute(
            "DELETE FROM collection_records WHERE scope = 'system_broadcasts' AND record_key = ?1",
            params![broadcast_id],
        )
        .map_err(ApiError::internal)?;
    if deleted == 0 {
        return Err(ApiError::not_found("Broadcast not found."));
    }
    Ok(Json(json!({ "deleted": true })))
}

fn validate_system_broadcast_fields(
    title: String,
    content: String,
    broadcast_type: String,
    target_audience: String,
    channels: Vec<String>,
) -> ApiResult<(String, String, String, String, Vec<String>)> {
    let title = title.trim().to_owned();
    let target_audience = target_audience.trim().to_owned();
    if title.is_empty() || title.chars().count() > 200 {
        return Err(ApiError::bad_request(
            "Broadcast title must contain between 1 and 200 characters.",
        ));
    }
    if content.chars().count() > 20_000 {
        return Err(ApiError::bad_request("Broadcast content is too long."));
    }
    if target_audience.is_empty() || target_audience.chars().count() > 1_000 {
        return Err(ApiError::bad_request("Broadcast audience is invalid."));
    }
    if ![
        "info",
        "warning",
        "urgent",
        "cybersecurity",
        "maintenance",
        "regulation",
        "policy",
        "account_activation",
    ]
    .contains(&broadcast_type.as_str())
    {
        return Err(ApiError::bad_request("Broadcast type is invalid."));
    }
    if channels.is_empty()
        || channels.len() > 3
        || channels
            .iter()
            .any(|channel| !["In-app", "Email", "SMS"].contains(&channel.as_str()))
        || channels.iter().collect::<HashSet<_>>().len() != channels.len()
    {
        return Err(ApiError::bad_request("Broadcast channels are invalid."));
    }
    Ok((title, content, broadcast_type, target_audience, channels))
}

async fn list_meeting_rooms(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let db = state.db.lock().await;
    let rooms = read_meeting_room_records(&db)?;
    let bookings = read_meeting_booking_records(&db)?;
    Ok(Json(json!({ "rooms": rooms, "bookings": bookings })))
}

async fn create_meeting_room(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateMeetingRoomInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    require_admin(&state, &headers).await?;
    let name = input.name.trim().to_owned();
    let location = input.location.trim().to_owned();
    let equipment = input
        .equipment
        .into_iter()
        .map(|item| item.trim().to_owned())
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(ApiError::bad_request(
            "Room name must contain between 1 and 120 characters.",
        ));
    }
    if location.is_empty() || location.chars().count() > 200 {
        return Err(ApiError::bad_request(
            "Room location must contain between 1 and 200 characters.",
        ));
    }
    if !(1..=500).contains(&input.capacity) {
        return Err(ApiError::bad_request(
            "Room capacity must be from 1 to 500.",
        ));
    }
    if equipment.len() > 30 || equipment.iter().any(|item| item.chars().count() > 120) {
        return Err(ApiError::bad_request("Room equipment list is invalid."));
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let existing = read_meeting_room_records(&transaction)?;
    if existing
        .iter()
        .any(|room| meeting_room_names_match(&room.name, &name))
    {
        return Err(ApiError::conflict(
            "A meeting room with this name already exists.",
        ));
    }
    let room = MeetingRoom {
        key: format!("ROOM-{}", Uuid::new_v4()),
        name,
        location,
        capacity: input.capacity,
        equipment,
        status: default_meeting_room_status(),
        extra: HashMap::new(),
    };
    let serialized = serde_json::to_string(&room).map_err(ApiError::internal)?;
    let timestamp = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES ('meeting_rooms', ?1, ?2, ?3, ?3)",
            params![&room.key, serialized, timestamp],
        )
        .map_err(|error| {
            if error.to_string().contains("UNIQUE") {
                ApiError::conflict("Meeting room key already exists.")
            } else {
                ApiError::internal(error)
            }
        })?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "room": room }))))
}

async fn create_meeting_booking(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateMeetingBookingInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    require_admin(&state, &headers).await?;
    let room_name = input.room_name.trim().to_owned();
    let meeting_title = input.meeting_title.trim().to_owned();
    let booker = input.booker.trim().to_owned();
    let date = input.date.trim().to_owned();
    let time_slot = input.time_slot.trim().to_owned();
    if room_name.is_empty() || room_name.chars().count() > 120 {
        return Err(ApiError::bad_request("Meeting room is required."));
    }
    if meeting_title.is_empty() || meeting_title.chars().count() > 200 {
        return Err(ApiError::bad_request(
            "Meeting title must contain between 1 and 200 characters.",
        ));
    }
    if booker.is_empty() || booker.chars().count() > 120 {
        return Err(ApiError::bad_request(
            "Booker name must contain between 1 and 120 characters.",
        ));
    }
    chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d")
        .map_err(|_| ApiError::bad_request("Meeting date must use YYYY-MM-DD."))?;
    let requested_interval = parse_meeting_time_slot(&time_slot)?;
    if !(1..=500).contains(&input.participants_count) {
        return Err(ApiError::bad_request(
            "Participant count must be from 1 to 500.",
        ));
    }

    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let rooms = read_meeting_room_records(&transaction)?;
    let room = rooms
        .iter()
        .find(|room| meeting_room_names_match(&room.name, &room_name))
        .ok_or_else(|| ApiError::not_found("Meeting room not found."))?;
    if room.status.eq_ignore_ascii_case("Bảo trì") {
        return Err(ApiError::conflict(
            "This meeting room is under maintenance.",
        ));
    }
    if input.participants_count > room.capacity {
        return Err(ApiError::bad_request(
            "Participant count exceeds the room capacity.",
        ));
    }

    let bookings = read_meeting_booking_records(&transaction)?;
    let mut conflict = false;
    for booking in bookings.iter().filter(|booking| {
        booking.status == "Đã xác nhận"
            && booking.date == date
            && meeting_room_names_match(&booking.room_name, &room.name)
    }) {
        let existing = parse_meeting_time_slot(&booking.time_slot)
            .map_err(|_| ApiError::internal("Stored meeting booking time slot is invalid."))?;
        if intervals_overlap(existing, requested_interval) {
            conflict = true;
            break;
        }
    }
    if conflict {
        return Err(ApiError::conflict(
            "This room already has a confirmed booking during that time.",
        ));
    }

    let booking = MeetingBooking {
        key: format!("BOOKING-{}", Uuid::new_v4()),
        room_name: room.name.clone(),
        meeting_title,
        booker,
        date,
        time_slot,
        participants_count: input.participants_count,
        status: "Đã xác nhận".to_owned(),
        extra: HashMap::new(),
    };
    let serialized = serde_json::to_string(&booking).map_err(ApiError::internal)?;
    let timestamp = Utc::now().to_rfc3339();
    transaction
        .execute(
            "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES ('room_bookings', ?1, ?2, ?3, ?3)",
            params![&booking.key, serialized, timestamp],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((StatusCode::CREATED, Json(json!({ "booking": booking }))))
}

async fn cancel_meeting_booking(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(booking_key): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    let serialized: Option<String> = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = 'room_bookings' AND record_key = ?1",
            params![&booking_key],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(serialized) = serialized else {
        return Err(ApiError::not_found("Meeting booking not found."));
    };
    let mut booking: MeetingBooking =
        serde_json::from_str(&serialized).map_err(ApiError::internal)?;
    if booking.status != "Đã xác nhận" {
        return Err(ApiError::conflict(
            "Only confirmed bookings can be cancelled.",
        ));
    }
    booking.status = "Đã hủy".to_owned();
    let updated = serde_json::to_string(&booking).map_err(ApiError::internal)?;
    transaction
        .execute(
        "UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = 'room_bookings' AND record_key = ?3",
        params![updated, Utc::now().to_rfc3339(), booking_key],
    )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "booking": booking })))
}

fn read_meeting_room_records(db: &Connection) -> ApiResult<Vec<MeetingRoom>> {
    let mut statement = db
        .prepare(
            "SELECT record_json FROM collection_records WHERE scope = 'meeting_rooms' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    rows.into_iter()
        .map(|row| serde_json::from_str::<MeetingRoom>(&row).map_err(ApiError::internal))
        .collect()
}

fn read_meeting_booking_records(db: &Connection) -> ApiResult<Vec<MeetingBooking>> {
    let mut statement = db
        .prepare(
            "SELECT record_json FROM collection_records WHERE scope = 'room_bookings' ORDER BY created_at DESC, record_key ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    rows.into_iter()
        .map(|row| serde_json::from_str::<MeetingBooking>(&row).map_err(ApiError::internal))
        .collect()
}

fn default_meeting_room_status() -> String {
    "Trống".to_owned()
}

fn parse_meeting_time_slot(slot: &str) -> ApiResult<(u16, u16)> {
    fn parse_time(value: &str) -> Option<u16> {
        let (hour, minute) = value.trim().split_once(':')?;
        let hour = hour.parse::<u16>().ok()?;
        let minute = minute.parse::<u16>().ok()?;
        if hour > 23 || minute > 59 {
            return None;
        }
        Some(hour * 60 + minute)
    }
    let (start, end) = slot
        .split_once('-')
        .ok_or_else(|| ApiError::bad_request("Time slot must use HH:MM - HH:MM."))?;
    let start = parse_time(start)
        .ok_or_else(|| ApiError::bad_request("Time slot must use valid 24-hour times."))?;
    let end = parse_time(end)
        .ok_or_else(|| ApiError::bad_request("Time slot must use valid 24-hour times."))?;
    if start >= end {
        return Err(ApiError::bad_request(
            "Meeting end time must be later than its start time.",
        ));
    }
    Ok((start, end))
}

fn intervals_overlap(left: (u16, u16), right: (u16, u16)) -> bool {
    left.0 < right.1 && right.0 < left.1
}

fn meeting_room_names_match(left: &str, right: &str) -> bool {
    left.to_lowercase() == right.to_lowercase()
}

async fn get_activation_email_template(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let template = match read_setting(&state, "activation_email_template").await? {
        Some(serialized) => serde_json::from_str::<ActivationEmailTemplate>(&serialized)
            .map_err(ApiError::internal)?,
        None => default_activation_email_template(),
    };
    // This Rust target has no SMTP adapter. Never imply mail is configured merely
    // because a template exists in settings.
    Ok(Json(
        json!({ "template": template, "emailConfigured": false }),
    ))
}

async fn save_activation_email_template(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ActivationEmailTemplate>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let template = validate_activation_email_template(input)?;
    let serialized = serde_json::to_string(&template).map_err(ApiError::internal)?;
    write_setting(&state, "activation_email_template", &serialized).await?;
    Ok(Json(json!({ "template": template })))
}

fn default_activation_email_template() -> ActivationEmailTemplate {
    ActivationEmailTemplate {
        subject: "Kích hoạt tài khoản KIYOVN Enterprise".to_owned(),
        heading: "Chào mừng bạn đến với KIYOVN".to_owned(),
        body: "Tài khoản công việc của bạn đã sẵn sàng. Vui lòng kích hoạt để đặt mật khẩu và hoàn tất hồ sơ.".to_owned(),
        button_label: "Kích hoạt tài khoản".to_owned(),
        footer: "Liên kết có hiệu lực trong 02 ngày. Nếu bạn yêu cầu gửi lại, chỉ liên kết mới nhất còn hiệu lực.".to_owned(),
    }
}

fn validate_activation_email_template(
    input: ActivationEmailTemplate,
) -> ApiResult<ActivationEmailTemplate> {
    Ok(ActivationEmailTemplate {
        subject: required_template_text(input.subject, "Tiêu đề email", 200)?,
        heading: required_template_text(input.heading, "Tiêu đề thư", 200)?,
        body: required_template_text(input.body, "Nội dung thư", 4_000)?,
        button_label: required_template_text(input.button_label, "Nhãn nút", 100)?,
        footer: required_template_text(input.footer, "Ghi chú cuối thư", 1_000)?,
    })
}

fn required_template_text(value: String, field: &str, max_chars: usize) -> ApiResult<String> {
    let value = value.trim().to_owned();
    if value.is_empty() || value.chars().count() > max_chars {
        return Err(ApiError::bad_request(format!(
            "{field} phải có từ 1 đến {max_chars} ký tự."
        )));
    }
    Ok(value)
}

async fn list_notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let notifications = notification_rows(&db, &actor.id).map_err(ApiError::internal)?;
    Ok(Json(json!({
        "data": notifications.iter().map(notification_value).collect::<Vec<_>>()
    })))
}

async fn create_notification(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateNotificationInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = authenticated_user(&state, &headers).await?;
    let title = required_employee_text(Some(&input.title), "Notification title", 255)?;
    let message = required_employee_text(Some(&input.message), "Notification message", 2000)?;
    let notification_type = optional_employee_text(input.notification_type.as_deref(), 64)?;
    let notification_type = if notification_type.is_empty() {
        "system".to_owned()
    } else {
        notification_type
    };
    let link = optional_employee_text(input.link.as_deref(), 500)?;
    let user_id = if actor.role == ADMIN_ROLE {
        input.user_id.unwrap_or_else(|| actor.id.clone())
    } else {
        actor.id.clone()
    };
    let id = Uuid::new_v4().to_string();
    let created_at = Utc::now().to_rfc3339();
    let notification = NotificationRow {
        id: id.clone(),
        user_id: user_id.clone(),
        title,
        message,
        notification_type,
        link,
        is_read: false,
        created_at,
    };
    let db = state.db.lock().await;
    let user_exists: bool = db
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM users WHERE id = ?1)",
            params![&user_id],
            |row| row.get(0),
        )
        .map_err(ApiError::internal)?;
    if !user_exists {
        return Err(ApiError::not_found("Notification recipient was not found."));
    }
    db.execute(
        "INSERT INTO notifications (id, user_id, title, message, type, link, is_read, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7)",
        params![
            notification.id,
            notification.user_id,
            notification.title,
            notification.message,
            notification.notification_type,
            notification.link,
            notification.created_at,
        ],
    )
    .map_err(ApiError::internal)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "notification": notification_value(&notification) })),
    ))
}

async fn mark_notification_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(notification_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    let updated = db
        .execute(
            "UPDATE notifications SET is_read = 1 WHERE id = ?1 AND user_id = ?2",
            params![&notification_id, &actor.id],
        )
        .map_err(ApiError::internal)?;
    if updated == 0 {
        return Err(ApiError::not_found("Notification was not found."));
    }
    let notification = db
        .query_row(
            "SELECT id, user_id, title, message, type, link, is_read, created_at FROM notifications WHERE id = ?1 AND user_id = ?2",
            params![&notification_id, &actor.id],
            notification_from_sql,
        )
        .map_err(ApiError::internal)?;
    Ok(Json(
        json!({ "notification": notification_value(&notification) }),
    ))
}

async fn mark_all_notifications_read(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    db.execute(
        "UPDATE notifications SET is_read = 1 WHERE user_id = ?1",
        params![&actor.id],
    )
    .map_err(ApiError::internal)?;
    let notifications = notification_rows(&db, &actor.id).map_err(ApiError::internal)?;
    Ok(Json(json!({
        "data": notifications.iter().map(notification_value).collect::<Vec<_>>()
    })))
}

async fn delete_notification(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(notification_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    db.execute(
        "DELETE FROM notifications WHERE id = ?1 AND user_id = ?2",
        params![&notification_id, &actor.id],
    )
    .map_err(ApiError::internal)?;
    Ok(Json(json!({ "deleted": true })))
}

async fn clear_notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let db = state.db.lock().await;
    db.execute(
        "DELETE FROM notifications WHERE user_id = ?1",
        params![&actor.id],
    )
    .map_err(ApiError::internal)?;
    Ok(Json(json!({ "deleted": true })))
}

fn notification_rows(db: &Connection, user_id: &str) -> rusqlite::Result<Vec<NotificationRow>> {
    let mut statement = db.prepare(
        "SELECT id, user_id, title, message, type, link, is_read, created_at FROM notifications WHERE user_id = ?1 ORDER BY created_at DESC LIMIT 100",
    )?;
    let rows = statement.query_map(params![user_id], notification_from_sql)?;
    rows.collect()
}

fn notification_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<NotificationRow> {
    Ok(NotificationRow {
        id: row.get(0)?,
        user_id: row.get(1)?,
        title: row.get(2)?,
        message: row.get(3)?,
        notification_type: row.get(4)?,
        link: row.get(5)?,
        is_read: row.get::<_, i64>(6)? != 0,
        created_at: row.get(7)?,
    })
}

fn notification_value(notification: &NotificationRow) -> Value {
    json!({
        "id": notification.id,
        "key": notification.id,
        "userId": notification.user_id,
        "title": notification.title,
        "message": notification.message,
        "type": notification.notification_type,
        "link": notification.link,
        "read": notification.is_read,
        "unread": !notification.is_read,
        "time": notification_relative_time(&notification.created_at),
        "createdAt": notification.created_at,
    })
}

fn notification_relative_time(created_at: &str) -> String {
    let Ok(created_at) = chrono::DateTime::parse_from_rfc3339(created_at) else {
        return created_at.to_owned();
    };
    let minutes = (Utc::now() - created_at.with_timezone(&Utc))
        .num_minutes()
        .max(0);
    if minutes < 1 {
        "Vừa xong".to_owned()
    } else if minutes < 60 {
        format!("{minutes} phút trước")
    } else if minutes < 24 * 60 {
        format!("{} giờ trước", minutes / 60)
    } else if minutes < 30 * 24 * 60 {
        format!("{} ngày trước", minutes / (24 * 60))
    } else {
        created_at.format("%Y-%m-%d").to_string()
    }
}

async fn list_files(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<FileListQuery>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let employee_scope = query.scope.as_deref() == Some("employee");
    let is_employee_view = employee_scope || actor.role != ADMIN_ROLE;
    let workspace = if query.parent_id.is_none() && is_employee_view {
        Some(ensure_employee_workspace(&state, &actor).await?)
    } else {
        None
    };
    let parent = match query.parent_id.as_deref() {
        Some(parent_id) => require_file_access(&actor, find_file_node(&state, parent_id).await?)?,
        None => match workspace.as_ref() {
            Some(workspace) => workspace.root.clone(),
            None => ensure_staff_root(&state).await?,
        },
    };
    if employee_scope && parent.employee_id.as_deref() != Some(&actor.id) {
        return Err(ApiError::forbidden(
            "You can only view your employee workspace.",
        ));
    }
    if parent.node_type != "dir" {
        return Err(ApiError::bad_request(
            "The requested location is not a folder.",
        ));
    }
    let include_hidden = query.include_hidden.unwrap_or(false);
    let db = state.db.lock().await;
    let mut statement = db.prepare("SELECT id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key, origin_module, is_hidden, is_system, is_protected, created_at, updated_at FROM file_nodes WHERE parent_id = ?1 AND deleted_at IS NULL AND (?2 = 1 OR is_hidden = 0) ORDER BY CASE node_type WHEN 'dir' THEN 0 ELSE 1 END, name COLLATE NOCASE").map_err(ApiError::internal)?;
    let files = statement
        .query_map(
            params![&parent.id, include_hidden as i64],
            file_node_from_sql,
        )
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({
        "data": files.into_iter().map(file_node_value).collect::<Vec<_>>(),
        "context": {
            "parentId": parent.id,
            "isVirtualEmployeeRoot": is_employee_view && query.parent_id.is_none(),
            "rootLabel": workspace.as_ref().map(|item| item.root.name.as_str()).unwrap_or("Nhân Sự"),
            "canShowHidden": true
        }
    })))
}

async fn create_folder(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateFolderInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let parent = match input.parent_id.as_deref() {
        Some(parent_id) => {
            require_directory_write_access(&actor, find_file_node(&state, parent_id).await?)?
        }
        None => default_file_directory(&state, &actor).await?,
    };
    if parent.parent_id.is_none() {
        return Err(ApiError::forbidden(
            "This system root cannot contain user-created folders.",
        ));
    }
    let name = normalized_file_name(&input.name, "Folder name")?;
    let origin_module = optional_employee_text(input.origin_module.as_deref(), 80)?;
    let file = FileNodeRow {
        id: Uuid::new_v4().to_string(),
        parent_id: Some(parent.id.clone()),
        employee_id: parent
            .employee_id
            .clone()
            .or_else(|| Some(actor.id.clone())),
        owner_id: Some(actor.id.clone()),
        name,
        node_type: "dir".to_owned(),
        mime_type: String::new(),
        size: 0,
        storage_key: None,
        origin_module: if origin_module.is_empty() {
            "files".to_owned()
        } else {
            origin_module
        },
        is_hidden: false,
        is_system: false,
        is_protected: false,
        created_at: Utc::now().to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
    };
    let db = state.db.lock().await;
    let duplicate: Option<String> = db
        .query_row(
            "SELECT id FROM file_nodes WHERE parent_id = ?1 AND name = ?2 AND deleted_at IS NULL",
            params![file.parent_id, file.name],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    if duplicate.is_some() {
        return Err(ApiError::bad_request(
            "A folder or file with this name already exists.",
        ));
    }
    insert_file_node(&db, &file)?;
    Ok(Json(json!({ "file": file_node_value(file) })))
}

async fn upload_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    if body.len() > 50 * 1024 * 1024 {
        return Err(ApiError(
            StatusCode::PAYLOAD_TOO_LARGE,
            "The file exceeds the 50 MB limit.".to_owned(),
        ));
    }
    let actor = authenticated_user(&state, &headers).await?;
    let parent_id = header_value(&headers, "x-parent-id");
    let parent = match parent_id.as_deref() {
        Some(parent_id) => {
            require_directory_write_access(&actor, find_file_node(&state, parent_id).await?)?
        }
        None => default_file_directory(&state, &actor).await?,
    };
    if parent.parent_id.is_none() {
        return Err(ApiError::forbidden(
            "Files cannot be saved in this system root.",
        ));
    }
    let raw_name = header_value(&headers, "x-file-name").unwrap_or_default();
    let requested_name = normalized_file_name(&percent_decode(&raw_name), "File name")?;
    let origin_module = header_value(&headers, "x-origin-module")
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "files".to_owned());
    let mime_type = header_value(&headers, "content-type")
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "application/octet-stream".to_owned());
    if origin_module == "employee-files" && !is_allowed_employee_upload(&requested_name, &mime_type)
    {
        return Err(ApiError(
            StatusCode::UNPROCESSABLE_ENTITY,
            "employee/files chỉ cho phép tải lên ảnh, video và tài liệu.".to_owned(),
        ));
    }
    let name = unique_file_name(&state, &parent.id, &requested_name).await?;
    let id = Uuid::new_v4().to_string();
    let storage_key = format!("{id}.bin");
    let storage_path = state.storage_dir.join(&storage_key);
    std::fs::write(&storage_path, &body).map_err(ApiError::internal)?;
    let timestamp = Utc::now().to_rfc3339();
    let file = FileNodeRow {
        id,
        parent_id: Some(parent.id.clone()),
        employee_id: parent
            .employee_id
            .clone()
            .or_else(|| Some(actor.id.clone())),
        owner_id: Some(actor.id.clone()),
        name,
        node_type: "file".to_owned(),
        mime_type,
        size: body.len() as i64,
        storage_key: Some(storage_key),
        origin_module,
        is_hidden: false,
        is_system: false,
        is_protected: false,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    let inserted = {
        let db = state.db.lock().await;
        insert_file_node(&db, &file)
    };
    if let Err(error) = inserted {
        let _ = std::fs::remove_file(storage_path);
        return Err(error);
    }
    Ok(Json(json!({ "file": file_node_value(file) })))
}

async fn rename_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(file_id): Path<String>,
    Json(input): Json<RenameFileInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let node = require_file_access(&actor, find_file_node(&state, &file_id).await?)?;
    if node.is_protected {
        return Err(ApiError::forbidden(
            "Protected system files cannot be renamed.",
        ));
    }
    let name = normalized_file_name(&input.name, "File name")?;
    let timestamp = Utc::now().to_rfc3339();
    let db = state.db.lock().await;
    let duplicate: Option<String> = db.query_row("SELECT id FROM file_nodes WHERE parent_id IS ?1 AND name = ?2 AND id != ?3 AND deleted_at IS NULL", params![node.parent_id, name, file_id], |row| row.get(0)).optional().map_err(ApiError::internal)?;
    if duplicate.is_some() {
        return Err(ApiError::bad_request(
            "A folder or file with this name already exists.",
        ));
    }
    db.execute(
        "UPDATE file_nodes SET name = ?1, updated_at = ?2 WHERE id = ?3",
        params![name, timestamp, file_id],
    )
    .map_err(ApiError::internal)?;
    drop(db);
    Ok(Json(
        json!({ "file": file_node_value(find_file_node(&state, &file_id).await?) }),
    ))
}

async fn delete_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(file_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let node = require_file_access(&actor, find_file_node(&state, &file_id).await?)?;
    if node.is_protected {
        return Err(ApiError::forbidden(
            "Protected system files cannot be deleted.",
        ));
    }
    let db = state.db.lock().await;
    let child: Option<String> = db
        .query_row(
            "SELECT id FROM file_nodes WHERE parent_id = ?1 AND deleted_at IS NULL LIMIT 1",
            params![&node.id],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    if child.is_some() {
        return Err(ApiError::bad_request("Only empty folders can be deleted."));
    }
    let timestamp = Utc::now().to_rfc3339();
    db.execute(
        "UPDATE file_nodes SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
        params![timestamp, &node.id],
    )
    .map_err(ApiError::internal)?;
    Ok(Json(json!({ "deleted": true })))
}

async fn get_file_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(file_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let node = require_file_access(&actor, find_file_node(&state, &file_id).await?)?;
    if node.node_type != "file" {
        return Err(ApiError::unprocessable("Only files can be shared."));
    }
    let db = state.db.lock().await;
    let share = file_share_by_file_id(&db, &node.id).map_err(ApiError::internal)?;
    let file = public_file_node_value(&node);
    let value = match share {
        Some(share) => file_share_value(share, file),
        None => json!({ "share": null, "file": file }),
    };
    Ok(Json(value))
}

async fn update_file_share(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(file_id): Path<String>,
    Json(input): Json<FileShareUpdateInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let node = require_file_access(&actor, find_file_node(&state, &file_id).await?)?;
    if node.node_type != "file" {
        return Err(ApiError::unprocessable("Only files can be shared."));
    }

    let db = state.db.lock().await;
    let existing = file_share_by_file_id(&db, &node.id).map_err(ApiError::internal)?;
    let timestamp = Utc::now().to_rfc3339();
    let is_active = input.is_active.unwrap_or(true);
    let share = if let Some(existing) = existing {
        let token = if input.regenerate.unwrap_or(false) {
            new_file_share_token()
        } else {
            existing.token
        };
        db.execute(
            "UPDATE file_shares SET token = ?1, is_active = ?2, updated_at = ?3 WHERE id = ?4",
            params![token, is_active as i64, timestamp, existing.id],
        )
        .map_err(ApiError::internal)?;
        FileShareRow {
            token,
            is_active,
            updated_at: timestamp,
            ..existing
        }
    } else {
        let share = FileShareRow {
            id: Uuid::new_v4().to_string(),
            file_id: node.id.clone(),
            token: new_file_share_token(),
            is_active,
            created_by: actor.id,
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        db.execute(
            "INSERT INTO file_shares (id, file_id, token, is_active, created_by, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                share.id,
                share.file_id,
                share.token,
                share.is_active as i64,
                share.created_by,
                share.created_at,
                share.updated_at,
            ],
        )
        .map_err(ApiError::internal)?;
        share
    };
    let file = public_file_node_value(&node);
    Ok(Json(file_share_value(share, file)))
}

async fn get_public_file_share(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> ApiResult<Json<Value>> {
    let share = find_file_share_by_token(&state, &token).await?;
    let Some(share) = share.filter(|share| share.is_active) else {
        return Err(ApiError::not_found("Share link is not active."));
    };
    let node = find_file_node(&state, &share.file_id).await?;
    if node.node_type != "file" {
        return Err(ApiError::not_found("Shared file was not found."));
    }
    let file = public_file_node_value(&node);
    Ok(Json(file_share_value(share, file)))
}

async fn download_public_file_share(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> ApiResult<Response> {
    let share = find_file_share_by_token(&state, &token).await?;
    let Some(share) = share.filter(|share| share.is_active) else {
        return Err(ApiError::not_found("Share link is not active."));
    };
    let node = find_file_node(&state, &share.file_id).await?;
    if node.node_type != "file" {
        return Err(ApiError::not_found("Shared file was not found."));
    }
    let storage_key = node
        .storage_key
        .clone()
        .ok_or_else(|| ApiError::not_found("File content was not found."))?;
    let content = std::fs::read(state.storage_dir.join(storage_key))
        .map_err(|_| ApiError::not_found("File content was not found."))?;
    let disposition = format!(
        "inline; filename=\"download\"; filename*=UTF-8''{}",
        percent_encode_filename(&node.name)
    );
    let mut response = Response::new(Body::from(content.clone()));
    *response.status_mut() = StatusCode::OK;
    let response_headers = response.headers_mut();
    response_headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_str(&node.mime_type)
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    response_headers.insert(
        CONTENT_LENGTH,
        HeaderValue::from_str(&content.len().to_string())
            .unwrap_or_else(|_| HeaderValue::from_static("0")),
    );
    response_headers.insert(
        CONTENT_DISPOSITION,
        HeaderValue::from_str(&disposition).unwrap_or_else(|_| HeaderValue::from_static("inline")),
    );
    response_headers.insert(
        "cache-control",
        HeaderValue::from_static("private, max-age=60"),
    );
    response_headers.insert(
        "x-content-type-options",
        HeaderValue::from_static("nosniff"),
    );
    Ok(response)
}

fn file_share_by_file_id(db: &Connection, file_id: &str) -> rusqlite::Result<Option<FileShareRow>> {
    db.query_row(
        "SELECT id, file_id, token, is_active, created_by, created_at, updated_at FROM file_shares WHERE file_id = ?1 ORDER BY updated_at DESC LIMIT 1",
        params![file_id],
        file_share_from_sql,
    )
    .optional()
}

async fn find_file_share_by_token(
    state: &AppState,
    token: &str,
) -> ApiResult<Option<FileShareRow>> {
    if token.is_empty() || token.len() > 160 {
        return Err(ApiError::unprocessable("Share token is invalid."));
    }
    let db = state.db.lock().await;
    db.query_row(
        "SELECT id, file_id, token, is_active, created_by, created_at, updated_at FROM file_shares WHERE token = ?1 LIMIT 1",
        params![token],
        file_share_from_sql,
    )
    .optional()
    .map_err(ApiError::internal)
}

fn file_share_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileShareRow> {
    Ok(FileShareRow {
        id: row.get(0)?,
        file_id: row.get(1)?,
        token: row.get(2)?,
        is_active: row.get::<_, i64>(3)? != 0,
        created_by: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn file_share_value(share: FileShareRow, file: Value) -> Value {
    json!({
        "share": {
            "id": share.id,
            "fileId": share.file_id,
            "token": share.token,
            "isActive": share.is_active,
            "url": format!("/files/share?token={}", share.token),
            "createdAt": share.created_at,
            "updatedAt": share.updated_at,
            "file": file,
        }
    })
}

fn public_file_node_value(node: &FileNodeRow) -> Value {
    json!({
        "id": node.id,
        "name": node.name,
        "type": node.node_type,
        "mime": if node.mime_type.is_empty() { Value::Null } else { json!(node.mime_type) },
        "sizeBytes": node.size,
        "modified": node.updated_at,
        "isProtected": node.is_protected,
    })
}

fn new_file_share_token() -> String {
    let mut bytes = [0_u8; 18];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

async fn download_file(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(file_id): Path<String>,
) -> ApiResult<Response> {
    let actor = authenticated_user(&state, &headers).await?;
    let node = require_file_access(&actor, find_file_node(&state, &file_id).await?)?;
    if node.node_type != "file" {
        return Err(ApiError::bad_request("Only files can be downloaded."));
    }
    let storage_key = node
        .storage_key
        .clone()
        .ok_or_else(|| ApiError::not_found("The file content was not found."))?;
    let content = std::fs::read(state.storage_dir.join(storage_key))
        .map_err(|_| ApiError::not_found("The file content was not found."))?;
    let disposition = format!(
        "attachment; filename=\"download\"; filename*=UTF-8''{}",
        percent_encode_filename(&node.name)
    );
    let mut response = Response::new(Body::from(content.clone()));
    *response.status_mut() = StatusCode::OK;
    let response_headers = response.headers_mut();
    response_headers.insert(
        CONTENT_TYPE,
        HeaderValue::from_str(&node.mime_type)
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    response_headers.insert(
        CONTENT_LENGTH,
        HeaderValue::from_str(&content.len().to_string())
            .unwrap_or_else(|_| HeaderValue::from_static("0")),
    );
    response_headers.insert(
        CONTENT_DISPOSITION,
        HeaderValue::from_str(&disposition)
            .unwrap_or_else(|_| HeaderValue::from_static("attachment")),
    );
    Ok(response)
}

async fn update_file_content(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(file_id): Path<String>,
    body: Bytes,
) -> ApiResult<Json<Value>> {
    if body.len() > 50 * 1024 * 1024 {
        return Err(ApiError(
            StatusCode::PAYLOAD_TOO_LARGE,
            "The file exceeds the 50 MB limit.".to_owned(),
        ));
    }
    let actor = authenticated_user(&state, &headers).await?;
    let node = require_file_access(&actor, find_file_node(&state, &file_id).await?)?;
    if node.node_type != "file" {
        return Err(ApiError::bad_request("Only file contents can be updated."));
    }
    if node.is_protected {
        return Err(ApiError::forbidden(
            "Protected system files cannot be updated.",
        ));
    }
    let storage_key = node
        .storage_key
        .clone()
        .unwrap_or_else(|| format!("{}.bin", node.id));
    std::fs::write(state.storage_dir.join(&storage_key), &body).map_err(ApiError::internal)?;
    let timestamp = Utc::now().to_rfc3339();
    let mime_type = header_value(&headers, "content-type")
        .filter(|value| !value.is_empty())
        .unwrap_or(node.mime_type);
    let db = state.db.lock().await;
    db.execute("UPDATE file_nodes SET storage_key = ?1, size = ?2, mime_type = ?3, updated_at = ?4 WHERE id = ?5", params![storage_key, body.len() as i64, mime_type, timestamp, file_id]).map_err(ApiError::internal)?;
    drop(db);
    Ok(Json(
        json!({ "file": file_node_value(find_file_node(&state, &file_id).await?) }),
    ))
}

struct EmployeeWorkspace {
    root: FileNodeRow,
    system: FileNodeRow,
}

async fn find_file_node(state: &AppState, file_id: &str) -> ApiResult<FileNodeRow> {
    let db = state.db.lock().await;
    db.query_row("SELECT id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key, origin_module, is_hidden, is_system, is_protected, created_at, updated_at FROM file_nodes WHERE id = ?1 AND deleted_at IS NULL", params![file_id], file_node_from_sql)
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("File or folder not found."))
}

fn file_node_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<FileNodeRow> {
    Ok(FileNodeRow {
        id: row.get(0)?,
        parent_id: row.get(1)?,
        employee_id: row.get(2)?,
        owner_id: row.get(3)?,
        name: row.get(4)?,
        node_type: row.get(5)?,
        mime_type: row.get(6)?,
        size: row.get(7)?,
        storage_key: row.get(8)?,
        origin_module: row.get(9)?,
        is_hidden: row.get::<_, i64>(10)? != 0,
        is_system: row.get::<_, i64>(11)? != 0,
        is_protected: row.get::<_, i64>(12)? != 0,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn file_node_value(node: FileNodeRow) -> Value {
    json!({
        "key": node.id, "id": node.id, "parentId": node.parent_id, "employeeId": node.employee_id,
        "name": node.name, "type": node.node_type, "mime": if node.mime_type.is_empty() { Value::Null } else { json!(node.mime_type) },
        "sizeBytes": node.size, "owner": node.owner_id.unwrap_or_default(),
        "group": if node.is_system { "system" } else { "enterprise" },
        "permission": if node.is_protected { "555" } else if node.node_type == "dir" { "755" } else { "644" },
        "modified": node.updated_at, "originModule": node.origin_module, "isHidden": node.is_hidden,
        "isSystem": node.is_system, "isProtected": node.is_protected, "createdAt": node.created_at, "updatedAt": node.updated_at
    })
}

fn require_file_access(user: &User, node: FileNodeRow) -> ApiResult<FileNodeRow> {
    if user.role != ADMIN_ROLE && node.employee_id.as_deref() != Some(&user.id) {
        return Err(ApiError::not_found("File or folder not found."));
    }
    Ok(node)
}

fn require_directory_write_access(user: &User, node: FileNodeRow) -> ApiResult<FileNodeRow> {
    let node = require_file_access(user, node)?;
    if node.node_type != "dir" {
        return Err(ApiError::bad_request(
            "The selected location is not a folder.",
        ));
    }
    Ok(node)
}

async fn ensure_staff_root(state: &AppState) -> ApiResult<FileNodeRow> {
    let db = state.db.lock().await;
    ensure_staff_root_in_db(&db)
}

fn ensure_staff_root_in_db(db: &Connection) -> ApiResult<FileNodeRow> {
    let current = db.query_row("SELECT id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key, origin_module, is_hidden, is_system, is_protected, created_at, updated_at FROM file_nodes WHERE parent_id IS NULL AND name = 'Nhân Sự' AND deleted_at IS NULL LIMIT 1", [], file_node_from_sql).optional().map_err(ApiError::internal)?;
    if let Some(current) = current {
        return Ok(current);
    }
    let timestamp = Utc::now().to_rfc3339();
    let root = FileNodeRow {
        id: Uuid::new_v4().to_string(),
        parent_id: None,
        employee_id: None,
        owner_id: None,
        name: "Nhân Sự".to_owned(),
        node_type: "dir".to_owned(),
        mime_type: String::new(),
        size: 0,
        storage_key: None,
        origin_module: "system".to_owned(),
        is_hidden: false,
        is_system: true,
        is_protected: true,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    insert_file_node(db, &root)?;
    Ok(root)
}

async fn ensure_employee_workspace(state: &AppState, user: &User) -> ApiResult<EmployeeWorkspace> {
    let employee = find_employee(state, &user.id).await?;
    let db = state.db.lock().await;
    ensure_employee_workspace_in_db(&db, user, &employee.employee_code)
}

fn ensure_employee_workspace_in_db(
    db: &Connection,
    user: &User,
    employee_code: &str,
) -> ApiResult<EmployeeWorkspace> {
    let staff_root = ensure_staff_root_in_db(db)?;
    let root_name = format!("{employee_code}-{}", user.name)
        .chars()
        .take(255)
        .collect::<String>();
    let existing_root = db.query_row("SELECT id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key, origin_module, is_hidden, is_system, is_protected, created_at, updated_at FROM file_nodes WHERE employee_id = ?1 AND parent_id = ?2 AND is_system = 1 AND is_protected = 1 AND deleted_at IS NULL LIMIT 1", params![&user.id, &staff_root.id], file_node_from_sql).optional().map_err(ApiError::internal)?;
    let timestamp = Utc::now().to_rfc3339();
    let root = match existing_root {
        Some(mut root) => {
            if root.name != root_name {
                db.execute(
                    "UPDATE file_nodes SET name = ?1, updated_at = ?2 WHERE id = ?3",
                    params![&root_name, &timestamp, &root.id],
                )
                .map_err(ApiError::internal)?;
                root.name = root_name;
                root.updated_at = timestamp.clone();
            }
            root
        }
        None => {
            let root = FileNodeRow {
                id: Uuid::new_v4().to_string(),
                parent_id: Some(staff_root.id.clone()),
                employee_id: Some(user.id.clone()),
                owner_id: Some(user.id.clone()),
                name: root_name,
                node_type: "dir".to_owned(),
                mime_type: String::new(),
                size: 0,
                storage_key: None,
                origin_module: "system".to_owned(),
                is_hidden: false,
                is_system: true,
                is_protected: true,
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
            };
            insert_file_node(db, &root)?;
            root
        }
    };
    let existing_system = db.query_row("SELECT id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key, origin_module, is_hidden, is_system, is_protected, created_at, updated_at FROM file_nodes WHERE parent_id = ?1 AND name = 'System' AND is_system = 1 AND is_protected = 1 AND deleted_at IS NULL LIMIT 1", params![&root.id], file_node_from_sql).optional().map_err(ApiError::internal)?;
    let system = match existing_system {
        Some(system) => system,
        None => {
            let system = FileNodeRow {
                id: Uuid::new_v4().to_string(),
                parent_id: Some(root.id.clone()),
                employee_id: Some(user.id.clone()),
                owner_id: Some(user.id.clone()),
                name: "System".to_owned(),
                node_type: "dir".to_owned(),
                mime_type: String::new(),
                size: 0,
                storage_key: None,
                origin_module: "system".to_owned(),
                is_hidden: false,
                is_system: true,
                is_protected: true,
                created_at: timestamp.clone(),
                updated_at: timestamp,
            };
            insert_file_node(db, &system)?;
            system
        }
    };
    Ok(EmployeeWorkspace { root, system })
}

async fn default_file_directory(state: &AppState, user: &User) -> ApiResult<FileNodeRow> {
    if user.role == ADMIN_ROLE {
        ensure_staff_root(state).await
    } else {
        Ok(ensure_employee_workspace(state, user).await?.system)
    }
}

fn insert_file_node(db: &Connection, node: &FileNodeRow) -> ApiResult<()> {
    db.execute("INSERT INTO file_nodes (id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key, origin_module, is_hidden, is_system, is_protected, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)", params![&node.id, &node.parent_id, &node.employee_id, &node.owner_id, &node.name, &node.node_type, &node.mime_type, node.size, &node.storage_key, &node.origin_module, node.is_hidden as i64, node.is_system as i64, node.is_protected as i64, &node.created_at, &node.updated_at]).map_err(ApiError::internal)?;
    Ok(())
}

async fn unique_file_name(
    state: &AppState,
    parent_id: &str,
    requested_name: &str,
) -> ApiResult<String> {
    let db = state.db.lock().await;
    let exists = |name: &str| -> ApiResult<bool> {
        Ok(db.query_row("SELECT id FROM file_nodes WHERE parent_id = ?1 AND name = ?2 AND deleted_at IS NULL", params![parent_id, name], |row| row.get::<_, String>(0)).optional().map_err(ApiError::internal)?.is_some())
    };
    if !exists(requested_name)? {
        return Ok(requested_name.to_owned());
    }
    let (stem, extension) = match requested_name.rsplit_once('.') {
        Some((stem, extension)) if !stem.is_empty() => (stem, format!(".{extension}")),
        _ => (requested_name, String::new()),
    };
    for counter in 1..10_000 {
        let candidate = format!("{stem} ({counter}){extension}");
        if !exists(&candidate)? {
            return Ok(candidate);
        }
    }
    Err(ApiError::bad_request(
        "Could not create a unique file name.",
    ))
}

fn normalized_file_name(raw: &str, field: &str) -> ApiResult<String> {
    let name = raw.trim();
    if name.is_empty()
        || name.len() > 255
        || name == "."
        || name == ".."
        || name.chars().any(|character| {
            matches!(
                character,
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            )
        })
    {
        return Err(ApiError::bad_request(format!("{field} is invalid.")));
    }
    Ok(name.to_owned())
}

fn is_allowed_employee_upload(name: &str, mime_type: &str) -> bool {
    let lower_mime = mime_type.to_ascii_lowercase();
    if lower_mime.starts_with("image/") || lower_mime.starts_with("video/") {
        return true;
    }
    let lower_name = name.to_ascii_lowercase();
    [
        ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".rtf", ".ppt", ".pptx",
    ]
    .iter()
    .any(|extension| lower_name.ends_with(extension))
}

fn header_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

fn percent_decode(value: &str) -> String {
    let mut bytes = Vec::with_capacity(value.len());
    let source = value.as_bytes();
    let mut index = 0;
    while index < source.len() {
        if source[index] == b'%' && index + 2 < source.len() {
            let hex = |character: u8| match character {
                b'0'..=b'9' => Some(character - b'0'),
                b'a'..=b'f' => Some(character - b'a' + 10),
                b'A'..=b'F' => Some(character - b'A' + 10),
                _ => None,
            };
            if let (Some(high), Some(low)) = (hex(source[index + 1]), hex(source[index + 2])) {
                bytes.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        bytes.push(source[index]);
        index += 1;
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

fn percent_encode_filename(value: &str) -> String {
    value
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'.' | b'-' | b'_' => vec![byte],
            _ => format!("%{byte:02X}").into_bytes(),
        })
        .map(char::from)
        .collect()
}

async fn get_storage_mode(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let mode = read_setting(&state, "storage_mode")
        .await?
        .unwrap_or_else(|| "kiyo_cloud".to_owned());
    Ok(Json(json!({ "mode": mode })))
}

async fn set_storage_mode(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<StorageModeInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    if !["kiyo_cloud", "self_hosted", "local_admin"].contains(&input.mode.as_str()) {
        return Err(ApiError::bad_request("Unsupported storage mode."));
    }
    write_setting(&state, "storage_mode", &input.mode).await?;
    Ok(Json(json!({ "mode": input.mode })))
}

fn collection_uses_revision(scope: &str) -> bool {
    [
        "attendance_shifts",
        "leave_requests",
        "employee_leaves",
        "asset_items",
        "asset_allocations",
        "asset_audits",
        "asset_transfers",
        "asset_maintenances",
        "asset_repairs",
        "asset_disposals",
        "asset_depreciations",
    ]
    .contains(&scope)
}

fn collection_returns_revision(scope: &str) -> bool {
    collection_uses_revision(scope) || scope == "asset_materials"
}

fn checked_expected_revision(value: Option<String>) -> ApiResult<Option<String>> {
    if value.as_deref().is_some_and(|revision| {
        revision.len() != 64 || !revision.bytes().all(|byte| byte.is_ascii_hexdigit())
    }) {
        return Err(ApiError::bad_request("expectedRevision is invalid."));
    }
    Ok(value)
}

fn ensure_expected_collection_revision(
    db: &Connection,
    scope: &str,
    expected_revision: Option<&str>,
) -> ApiResult<()> {
    if let Some(expected_revision) = expected_revision {
        let actual_revision = collection_revision(db, scope)?;
        if actual_revision != expected_revision {
            return Err(ApiError::conflict(
                "Danh sách đã thay đổi kể từ lần tải. Hãy tải lại trước khi lưu.",
            ));
        }
    }
    Ok(())
}

fn asset_material_audit_details(record: &Value, previous: Option<&Value>) -> Value {
    let latest_movement = record
        .get("stockHistory")
        .and_then(Value::as_array)
        .and_then(|history| history.first());
    json!({
        "materialCode": record.get("materialCode").cloned().unwrap_or(Value::Null),
        "materialName": record.get("materialName").cloned().unwrap_or(Value::Null),
        "stockQtyBefore": previous
            .and_then(|value| value.get("stockQty"))
            .cloned()
            .unwrap_or(Value::Null),
        "stockQtyAfter": record.get("stockQty").cloned().unwrap_or(Value::Null),
        "movementType": latest_movement
            .and_then(|value| value.get("type"))
            .cloned()
            .unwrap_or(Value::Null),
        "ticketCode": latest_movement
            .and_then(|value| value.get("ticketCode"))
            .cloned()
            .unwrap_or(Value::Null),
        "movementQty": latest_movement
            .and_then(|value| value.get("qty"))
            .cloned()
            .unwrap_or(Value::Null),
    })
}

fn validate_asset_item_records(records: &[Value]) -> ApiResult<()> {
    if records.len() > 10_000 {
        return Err(ApiError::bad_request(
            "Asset collection exceeds the 10,000-record limit.",
        ));
    }
    let mut keys = HashSet::new();
    for record in records {
        let key = record_key(record)?;
        if !keys.insert(key) {
            return Err(ApiError::bad_request(
                "Asset collection contains duplicate record keys.",
            ));
        }
        if record.to_string().len() > 128 * 1024 {
            return Err(ApiError::bad_request(
                "Asset record exceeds the 128 KiB limit.",
            ));
        }
    }
    Ok(())
}

fn validate_asset_allocation_records(records: &[Value]) -> ApiResult<()> {
    if records.len() > 10_000 {
        return Err(ApiError::bad_request(
            "Asset allocation collection exceeds the 10,000-record limit.",
        ));
    }
    let mut keys = HashSet::new();
    for record in records {
        let key = record_key(record)?;
        if !keys.insert(key) {
            return Err(ApiError::bad_request(
                "Asset allocation collection contains duplicate record keys.",
            ));
        }
        if record.to_string().len() > 128 * 1024 {
            return Err(ApiError::bad_request(
                "Asset allocation record exceeds the 128 KiB limit.",
            ));
        }
    }
    Ok(())
}

async fn list_collection(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(scope): Path<String>,
) -> ApiResult<Json<Value>> {
    if [
        "system_broadcasts",
        "meeting_rooms",
        "room_bookings",
        "tickets",
        "ticket_incidents",
        "workflow_blueprints",
        "workflow_requests",
        "workflow_settings",
        "plan_items",
        "plan_milestones",
        "plan_progress",
        "plan_reports",
        "plan_okrs",
        "attendance_shifts",
        "attendance_shift_assignments",
        "leave_requests",
        "employee_leaves",
        "asset_allocations",
        "asset_audits",
        "asset_transfers",
        "asset_maintenances",
        "asset_repairs",
        "asset_disposals",
        "asset_depreciations",
        "crm_supplier_evaluations",
        "crm_feedback",
        "hr_training_courses",
        "hr_certificates",
        "hr_uniforms",
        "hr_onboarding_tasks",
        "hr_job_openings",
        "hr_headcount_quotas",
        "hr_rewards",
        "hr_performance_reviews",
        "employee_bank_accounts",
        "employee_payslips",
        "contracts",
        "reports_catalog",
        "payroll",
        "insurance_adjustments",
        "insurance_regimes",
    ]
    .contains(&scope.as_str())
    {
        require_admin(&state, &headers).await?;
    } else {
        authenticated_user(&state, &headers).await?;
    }
    validate_scope(&scope)?;
    if [
        "crm_supplier_evaluations",
        "crm_feedback",
        "hr_training_courses",
        "hr_certificates",
        "hr_uniforms",
        "hr_onboarding_tasks",
        "hr_job_openings",
        "hr_headcount_quotas",
        "hr_rewards",
        "hr_performance_reviews",
        "employee_bank_accounts",
        "employee_payslips",
        "contracts",
    ]
    .contains(&scope.as_str())
    {
        return Err(ApiError::bad_request(
            "Use the typed feature API to read this scope.",
        ));
    }
    let mut db = state.db.lock().await;
    let transaction = db.transaction().map_err(ApiError::internal)?;
    let raw_records = {
        let mut statement = transaction
            .prepare(
                "SELECT record_json FROM collection_records WHERE scope = ?1 ORDER BY created_at ASC",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map(params![scope], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(ApiError::internal)?
    };
    let mut records = if collection_returns_revision(&scope) {
        raw_records
            .iter()
            .map(|record| serde_json::from_str::<Value>(record).map_err(ApiError::internal))
            .collect::<ApiResult<Vec<_>>>()?
    } else {
        raw_records
            .iter()
            .filter_map(|record| serde_json::from_str::<Value>(record).ok())
            .collect::<Vec<_>>()
    };
    if scope == "insurance_regimes" {
        for record in &mut records {
            reveal_insurance_bank_account(&state, record)?;
        }
    }
    let total = records.len();
    let revision = if collection_returns_revision(&scope) {
        Some(collection_revision(&transaction, &scope)?)
    } else {
        None
    };
    let mut response = json!(
        { "data": records, "pagination": { "page": 1, "limit": total, "total": total, "totalPages": 1 } }
    );
    if let Some(revision) = revision {
        response["revision"] = json!(revision);
    }
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(response))
}

fn collection_revision(db: &Connection, scope: &str) -> ApiResult<String> {
    let mut statement = db
        .prepare(
            "SELECT record_key, record_json FROM collection_records WHERE scope = ?1 ORDER BY record_key COLLATE BINARY ASC",
        )
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![scope], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?;
    let mut hasher = Sha256::new();
    hasher.update(b"kiyovn-collection-revision-v1\0");
    hasher.update((scope.len() as u64).to_be_bytes());
    hasher.update(scope.as_bytes());
    for row in rows {
        let (key, record_json) = row.map_err(ApiError::internal)?;
        hasher.update((key.len() as u64).to_be_bytes());
        hasher.update(key.as_bytes());
        hasher.update((record_json.len() as u64).to_be_bytes());
        hasher.update(record_json.as_bytes());
    }
    Ok(hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

async fn replace_collection(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(scope): Path<String>,
    Json(input): Json<ReplaceCollectionInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    validate_scope(&scope)?;
    ensure_generic_collection_write_allowed(&scope)?;
    let expected_revision = if collection_uses_revision(&scope) {
        let revision = input
            .expected_revision
            .as_deref()
            .ok_or_else(|| ApiError::bad_request("expectedRevision is required."))?;
        if revision.len() != 64 || !revision.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return Err(ApiError::bad_request("expectedRevision is invalid."));
        }
        Some(revision.to_owned())
    } else {
        None
    };
    if scope == "attendance_shifts" {
        if input.records.len() > 1_000 {
            return Err(ApiError::bad_request(
                "Attendance shift collection exceeds the 1,000-record limit.",
            ));
        }
        let mut keys = HashSet::new();
        for record in &input.records {
            let key = record_key(record)?;
            if !keys.insert(key) {
                return Err(ApiError::bad_request(
                    "Attendance shifts contain duplicate record keys.",
                ));
            }
            validate_attendance_shift(record)?;
        }
    }
    let mut records = input.records;
    if scope == "asset_items" {
        validate_asset_item_records(&records)?;
    }
    if scope == "asset_allocations" {
        validate_asset_allocation_records(&records)?;
    }
    if scope == "business_org_units" {
        validate_org_unit_records(&records)?;
    }
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = if collection_uses_revision(&scope) {
        db.transaction_with_behavior(TransactionBehavior::Immediate)
    } else {
        db.transaction()
    }
    .map_err(ApiError::internal)?;
    if let Some(expected_revision) = expected_revision.as_deref() {
        let actual_revision = collection_revision(&transaction, &scope)?;
        if actual_revision != expected_revision {
            return Err(ApiError::conflict(
                "Danh sách đã thay đổi kể từ lần tải. Hãy tải lại trước khi lưu.",
            ));
        }
    }
    if ["leave_requests", "employee_leaves"].contains(&scope.as_str()) {
        let existing_records = {
            let mut statement = transaction
                .prepare("SELECT record_key, record_json FROM collection_records WHERE scope = ?1")
                .map_err(ApiError::internal)?;
            let rows = statement
                .query_map(params![scope], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(ApiError::internal)?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(ApiError::internal)?
                .into_iter()
                .map(|(key, raw)| {
                    serde_json::from_str::<Value>(&raw)
                        .map(|record| (key, record))
                        .map_err(ApiError::internal)
                })
                .collect::<ApiResult<HashMap<_, _>>>()?
        };
        for record in &mut records {
            let key = record_key(record)?;
            reconcile_leave_request_identity(&transaction, record, existing_records.get(&key))?;
        }
        validate_leave_request_records(&records)?;
    }
    transaction
        .execute(
            "DELETE FROM collection_records WHERE scope = ?1",
            params![scope],
        )
        .map_err(ApiError::internal)?;
    for record in &records {
        let key = record_key(record)?;
        transaction.execute("INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)", params![scope, key, record.to_string(), timestamp]).map_err(ApiError::internal)?;
    }
    if scope == "business_org_units" {
        for record in &records {
            sync_org_unit_manager(&transaction, record, &timestamp)?;
        }
    }
    let revision = if collection_uses_revision(&scope) {
        Some(collection_revision(&transaction, &scope)?)
    } else {
        None
    };
    transaction.commit().map_err(ApiError::internal)?;
    let mut response = json!({ "data": records });
    if let Some(revision) = revision {
        response["revision"] = json!(revision);
    }
    Ok(Json(response))
}

async fn create_record(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(scope): Path<String>,
    Json(input): Json<CreateRecordInput>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let actor = require_admin(&state, &headers).await?;
    validate_scope(&scope)?;
    if ["insurance_adjustments", "insurance_regimes"].contains(&scope.as_str()) {
        return create_insurance_record(&state, &actor, &scope, input.record).await;
    }
    ensure_generic_collection_write_allowed(&scope)?;
    let expected_revision = if scope == "asset_materials" {
        checked_expected_revision(input.expected_revision)?
    } else {
        None
    };
    let mut record = input.record;
    if scope == "attendance_shifts" {
        if let Value::Object(fields) = &mut record {
            fields
                .entry("id".to_owned())
                .or_insert_with(|| Value::String(Uuid::new_v4().to_string()));
        }
        validate_attendance_shift(&record)?;
        if record.to_string().len() > 128 * 1024 {
            return Err(ApiError::bad_request(
                "Attendance shift record exceeds the 128 KiB limit.",
            ));
        }
    }
    let key = record_key(&record)?;
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    if scope == "asset_materials" {
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(ApiError::internal)?;
        ensure_expected_collection_revision(&transaction, &scope, expected_revision.as_deref())?;
        transaction
            .execute(
                "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
                params![scope, key, record.to_string(), timestamp],
            )
            .map_err(|error| {
                if error.to_string().contains("UNIQUE constraint failed") {
                    ApiError::conflict("Collection record key already exists.")
                } else {
                    ApiError::internal(error)
                }
            })?;
        audit::append_event(
            &transaction,
            &actor,
            "create",
            "asset_materials",
            &key,
            asset_material_audit_details(&record, None),
        )?;
        let revision = collection_revision(&transaction, &scope)?;
        transaction.commit().map_err(ApiError::internal)?;
        return Ok((
            StatusCode::CREATED,
            Json(json!({ "record": record, "revision": revision })),
        ));
    }
    if ["leave_requests", "employee_leaves"].contains(&scope.as_str()) {
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(ApiError::internal)?;
        reconcile_leave_request_identity(&transaction, &mut record, None)?;
        validate_leave_request_record(&record)?;
        if record.to_string().len() > 128 * 1024 {
            return Err(ApiError::bad_request(
                "Leave request record exceeds the 128 KiB limit.",
            ));
        }
        let code = leave_request_text(&record, "code", None, 80)?;
        ensure_leave_request_code_available(&transaction, &scope, code, None)?;
        transaction.execute("INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)", params![scope, key, record.to_string(), timestamp]).map_err(|error| {
            if error.to_string().contains("UNIQUE constraint failed") {
                ApiError::conflict("Collection record key already exists.")
            } else {
                ApiError::internal(error)
            }
        })?;
        transaction.commit().map_err(ApiError::internal)?;
        return Ok((StatusCode::CREATED, Json(json!({ "record": record }))));
    }
    db.execute("INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)", params![scope, key, record.to_string(), timestamp]).map_err(|error| {
        if error.to_string().contains("UNIQUE constraint failed") {
            ApiError::conflict("Collection record key already exists.")
        } else {
            ApiError::internal(error)
        }
    })?;
    Ok((StatusCode::CREATED, Json(json!({ "record": record }))))
}

async fn patch_record(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope, record_key_value)): Path<(String, String)>,
    Json(input): Json<PatchRecordInput>,
) -> ApiResult<Json<Value>> {
    let actor = require_admin(&state, &headers).await?;
    validate_scope(&scope)?;
    ensure_generic_collection_write_allowed(&scope)?;
    let expected_revision = if scope == "asset_materials" {
        checked_expected_revision(input.expected_revision)?
    } else {
        None
    };
    let Value::Object(patch) = input.patch else {
        return Err(ApiError::bad_request("Patch must be an object."));
    };
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = if scope == "asset_materials"
        || ["leave_requests", "employee_leaves"].contains(&scope.as_str())
    {
        db.transaction_with_behavior(TransactionBehavior::Immediate)
    } else {
        db.transaction()
    }
    .map_err(ApiError::internal)?;
    if scope == "asset_materials" {
        ensure_expected_collection_revision(&transaction, &scope, expected_revision.as_deref())?;
    }
    let current: Option<String> = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = ?1 AND record_key = ?2",
            params![scope, record_key_value],
            |row| row.get(0),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some(current) = current else {
        return Err(ApiError::not_found("Record not found."));
    };
    let previous_record = serde_json::from_str::<Value>(&current).map_err(ApiError::internal)?;
    let Value::Object(mut record) = previous_record.clone() else {
        return Err(ApiError::internal("Stored record is invalid."));
    };
    record.extend(patch);
    let record = Value::Object(record);
    if scope == "attendance_shifts" {
        validate_attendance_shift(&record)?;
    }
    if ["leave_requests", "employee_leaves"].contains(&scope.as_str()) {
        let current: Value = serde_json::from_str(&current).map_err(ApiError::internal)?;
        let mut record = record;
        reconcile_leave_request_identity(&transaction, &mut record, Some(&current))?;
        validate_leave_request_record(&record)?;
        if record_key(&record)? != record_key_value {
            return Err(ApiError::bad_request(
                "Leave request record keys cannot be changed.",
            ));
        }
        let code = leave_request_text(&record, "code", None, 80)?;
        ensure_leave_request_code_available(&transaction, &scope, code, Some(&record_key_value))?;
        transaction
            .execute("UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = ?3 AND record_key = ?4", params![record.to_string(), timestamp, scope, record_key_value])
            .map_err(ApiError::internal)?;
        transaction.commit().map_err(ApiError::internal)?;
        return Ok(Json(json!({ "record": record })));
    }
    if scope == "asset_materials" {
        if record_key(&record)? != record_key_value {
            return Err(ApiError::bad_request(
                "Asset material record keys cannot be changed.",
            ));
        }
        if record.to_string().len() > 128 * 1024 {
            return Err(ApiError::bad_request(
                "Asset material record exceeds the 128 KiB limit.",
            ));
        }
        transaction
            .execute(
                "UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = ?3 AND record_key = ?4",
                params![record.to_string(), timestamp, scope, record_key_value],
            )
            .map_err(ApiError::internal)?;
        audit::append_event(
            &transaction,
            &actor,
            "update",
            "asset_materials",
            &record_key_value,
            asset_material_audit_details(&record, Some(&previous_record)),
        )?;
        let revision = collection_revision(&transaction, &scope)?;
        transaction.commit().map_err(ApiError::internal)?;
        return Ok(Json(json!({ "record": record, "revision": revision })));
    }
    transaction.execute("UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = ?3 AND record_key = ?4", params![record.to_string(), timestamp, scope, record_key_value]).map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "record": record })))
}

async fn delete_record(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope, record_key_value)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    validate_scope(&scope)?;
    ensure_generic_collection_write_allowed(&scope)?;
    if scope == "business_org_units" {
        return delete_org_unit(&state, &record_key_value).await;
    }
    let db = state.db.lock().await;
    let deleted = db
        .execute(
            "DELETE FROM collection_records WHERE scope = ?1 AND record_key = ?2",
            params![scope, record_key_value],
        )
        .map_err(ApiError::internal)?;
    if deleted == 0 {
        return Err(ApiError::not_found("Record not found."));
    }
    Ok(Json(json!({ "deleted": true })))
}

fn ensure_generic_collection_write_allowed(scope: &str) -> ApiResult<()> {
    if [
        "system_broadcasts",
        "meeting_rooms",
        "room_bookings",
        "asset_transfers",
        "asset_audits",
        "asset_maintenances",
        "asset_repairs",
        "asset_disposals",
        "asset_depreciations",
        "workflow_blueprints",
        "workflow_requests",
        "plan_items",
        "plan_milestones",
        "plan_progress",
        "plan_reports",
        "plan_okrs",
        "attendance_shift_assignments",
        "crm_supplier_evaluations",
        "crm_feedback",
        "hr_training_courses",
        "hr_certificates",
        "hr_uniforms",
        "hr_onboarding_tasks",
        "hr_job_openings",
        "hr_headcount_quotas",
        "hr_rewards",
        "hr_performance_reviews",
        "employee_bank_accounts",
        "tickets",
        "ticket_incidents",
        "employee_payslips",
        "contracts",
        "insurance_adjustments",
        "insurance_regimes",
    ]
    .contains(&scope)
    {
        return Err(ApiError::bad_request(
            "Use the typed feature API; generic writes are disabled for this scope.",
        ));
    }
    Ok(())
}

fn insurance_record_text(
    record: &Value,
    field: &str,
    label: &str,
    max_len: usize,
) -> ApiResult<String> {
    let value = record
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| ApiError::bad_request(format!("{label} is required.")))?;
    if value.chars().count() > max_len {
        return Err(ApiError::bad_request(format!("{label} is too long.")));
    }
    Ok(value.to_owned())
}

fn insurance_record_amount(record: &Value, field: &str, label: &str) -> ApiResult<u64> {
    let value = record
        .get(field)
        .ok_or_else(|| ApiError::bad_request(format!("{label} is required.")))?;
    let amount = value
        .as_u64()
        .or_else(|| {
            value
                .as_str()
                .and_then(|text| text.trim().parse::<u64>().ok())
        })
        .ok_or_else(|| ApiError::bad_request(format!("{label} must be a non-negative integer.")))?;
    if amount > 1_000_000_000_000 {
        return Err(ApiError::bad_request(format!(
            "{label} exceeds the supported limit."
        )));
    }
    Ok(amount)
}

fn validate_insurance_create(scope: &str, record: &mut Value) -> ApiResult<(String, String)> {
    if !record.is_object() {
        return Err(ApiError::bad_request("Insurance record must be an object."));
    }
    let key = record_key(record)?;
    if scope == "insurance_adjustments" {
        let code = insurance_record_text(record, "d02Code", "D02 code", 80)?;
        let adjustment_type = insurance_record_text(record, "adjustType", "Adjustment type", 80)?;
        if ![
            "Báo tăng mới",
            "Báo giảm hẳn",
            "Điều chỉnh tăng lương",
            "Nghỉ thai sản",
            "Nghỉ ốm dài ngày",
        ]
        .contains(&adjustment_type.as_str())
        {
            return Err(ApiError::bad_request("Adjustment type is invalid."));
        }
        insurance_record_text(record, "empName", "Employee name", 180)?;
        insurance_record_text(record, "empCode", "Employee code", 80)?;
        if record.get("oldSalary").is_some() {
            insurance_record_amount(record, "oldSalary", "Old salary")?;
        }
        insurance_record_amount(record, "newSalary", "New salary")?;
        insurance_record_text(record, "effectiveMonth", "Effective month", 80)?;
        insurance_record_text(record, "filingDate", "Filing date", 40)?;
        record["providerSubmissionStatus"] = json!("Chưa gửi · chưa kết nối Cổng eBH");
        record["vssSubmissionStatus"] = json!("Chưa gửi · chưa kết nối Cổng eBH");
        return Ok((key, code));
    }

    let code = insurance_record_text(record, "claimCode", "Claim code", 80)?;
    let regime_type = insurance_record_text(record, "regimeType", "Regime type", 100)?;
    if ![
        "Ốm đau ngắn ngày",
        "Thai sản (6 tháng)",
        "Dưỡng sức sau sinh",
        "Khám thai định kỳ",
    ]
    .contains(&regime_type.as_str())
    {
        return Err(ApiError::bad_request("Regime type is invalid."));
    }
    insurance_record_text(record, "empName", "Employee name", 180)?;
    let leave_days = insurance_record_amount(record, "leaveDays", "Leave days")?;
    if leave_days == 0 {
        return Err(ApiError::bad_request(
            "Leave days must be greater than zero.",
        ));
    }
    insurance_record_amount(record, "calculatedAmount", "Requested benefit amount")?;
    insurance_record_text(record, "bankAccount", "Benefit bank account", 220)?;
    record["approvalStatus"] = json!("Đang thẩm định");
    record["settlementDate"] = json!("Chờ duyệt");
    record["providerSubmissionStatus"] = json!("Chưa gửi · chưa kết nối Cổng eBH");
    record["bankAccountEncryption"] = json!("insurance-domain-v1");
    Ok((key, code))
}

fn reveal_insurance_bank_account(state: &AppState, record: &mut Value) -> ApiResult<()> {
    let Some(account) = record.get("bankAccount").and_then(Value::as_str) else {
        return Ok(());
    };
    if account.starts_with("ENC:") {
        record["bankAccount"] = json!(crm::decrypt_insurance_bank_field(
            account,
            state.crm_crypto.as_ref()
        )?);
    }
    Ok(())
}

fn encrypt_insurance_bank_account(state: &AppState, account: &str) -> ApiResult<String> {
    let crypto = state.crm_crypto.as_ref().ok_or_else(|| {
        ApiError::service_unavailable("Thiếu khóa mã hóa để lưu thông tin tài khoản nhận trợ cấp.")
    })?;
    crm::encrypt_insurance_bank_field(account, crypto)
}

async fn create_insurance_record(
    state: &AppState,
    actor: &User,
    scope: &str,
    mut record: Value,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let (key, code) = validate_insurance_create(scope, &mut record)?;
    let mut public_record = record.clone();
    if scope == "insurance_regimes" {
        let account = insurance_record_text(&record, "bankAccount", "Benefit bank account", 220)?;
        record["bankAccount"] = json!(encrypt_insurance_bank_account(state, &account)?);
        let mut db = state.db.lock().await;
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(ApiError::internal)?;
        ensure_insurance_code_available(&transaction, scope, "claimCode", &code)?;
        let timestamp = Utc::now().to_rfc3339();
        transaction
            .execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?4)",
                params![scope, key, record.to_string(), timestamp],
            )
            .map_err(|error| {
                if error.to_string().contains("UNIQUE constraint failed") {
                    ApiError::conflict("Insurance record key already exists.")
                } else {
                    ApiError::internal(error)
                }
            })?;
        audit::append_event(
            &transaction,
            actor,
            "create",
            "insurance_regimes",
            &key,
            json!({ "claimCode": code, "regimeType": record["regimeType"] }),
        )?;
        transaction.commit().map_err(ApiError::internal)?;
    } else {
        let mut db = state.db.lock().await;
        let transaction = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(ApiError::internal)?;
        ensure_insurance_code_available(&transaction, scope, "d02Code", &code)?;
        let timestamp = Utc::now().to_rfc3339();
        transaction
            .execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?4)",
                params![scope, key, record.to_string(), timestamp],
            )
            .map_err(|error| {
                if error.to_string().contains("UNIQUE constraint failed") {
                    ApiError::conflict("Insurance record key already exists.")
                } else {
                    ApiError::internal(error)
                }
            })?;
        audit::append_event(
            &transaction,
            actor,
            "create",
            "insurance_adjustments",
            &key,
            json!({ "d02Code": code, "adjustType": record["adjustType"], "empCode": record["empCode"] }),
        )?;
        transaction.commit().map_err(ApiError::internal)?;
    }
    reveal_insurance_bank_account(state, &mut public_record)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({ "record": public_record })),
    ))
}

fn ensure_insurance_code_available(
    transaction: &Transaction<'_>,
    scope: &str,
    code_field: &str,
    code: &str,
) -> ApiResult<()> {
    let mut statement = transaction
        .prepare("SELECT record_json FROM collection_records WHERE scope = ?1")
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![scope], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?;
    for raw in rows {
        let raw = raw.map_err(ApiError::internal)?;
        let record = serde_json::from_str::<Value>(&raw).map_err(ApiError::internal)?;
        if record
            .get(code_field)
            .and_then(Value::as_str)
            .is_some_and(|existing| existing.trim().eq_ignore_ascii_case(code.trim()))
        {
            return Err(ApiError::conflict(
                "Insurance business code already exists.",
            ));
        }
    }
    Ok(())
}

fn validate_leave_request_records(records: &[Value]) -> ApiResult<()> {
    if records.len() > 1_000 {
        return Err(ApiError::bad_request(
            "Leave request collection exceeds the 1,000-record limit.",
        ));
    }
    let mut keys = HashSet::new();
    let mut codes = HashSet::new();
    for record in records {
        let key = record_key(record)?;
        if !keys.insert(key) {
            return Err(ApiError::bad_request(
                "Leave requests contain duplicate record keys.",
            ));
        }
        validate_leave_request_record(record)?;
        let code = leave_request_text(record, "code", None, 80)?.to_lowercase();
        if !codes.insert(code) {
            return Err(ApiError::bad_request(
                "Leave requests contain duplicate request codes.",
            ));
        }
        if record.to_string().len() > 128 * 1024 {
            return Err(ApiError::bad_request(
                "Leave request record exceeds the 128 KiB limit.",
            ));
        }
    }
    Ok(())
}

fn ensure_leave_request_code_available(
    db: &Connection,
    scope: &str,
    code: &str,
    except_record_key: Option<&str>,
) -> ApiResult<()> {
    let mut statement = db
        .prepare("SELECT record_key, record_json FROM collection_records WHERE scope = ?1")
        .map_err(ApiError::internal)?;
    let rows = statement
        .query_map(params![scope], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(ApiError::internal)?;
    let normalized_code = code.trim().to_lowercase();
    for row in rows {
        let (existing_key, existing_json) = row.map_err(ApiError::internal)?;
        if except_record_key == Some(existing_key.as_str()) {
            continue;
        }
        let existing: Value = serde_json::from_str(&existing_json).map_err(ApiError::internal)?;
        let Some(existing_code) = existing.get("code").and_then(Value::as_str) else {
            continue;
        };
        if existing_code.trim().to_lowercase() == normalized_code {
            return Err(ApiError::conflict(
                "A leave request with this code already exists.",
            ));
        }
    }
    Ok(())
}

fn reconcile_leave_request_identity(
    db: &Connection,
    record: &mut Value,
    existing: Option<&Value>,
) -> ApiResult<()> {
    let submitted_id = match record.get("employeeId") {
        None | Some(Value::Null) => None,
        Some(Value::String(value)) if !value.trim().is_empty() => Some(value.as_str()),
        Some(_) => {
            return Err(ApiError::bad_request(
                "Leave request employeeId must be a non-empty string.",
            ));
        }
    };

    if let Some(existing) = existing {
        let existing_id = match existing.get("employeeId") {
            None | Some(Value::Null) => None,
            Some(Value::String(value)) if !value.trim().is_empty() => Some(value.as_str()),
            Some(_) => {
                return Err(ApiError::bad_request(
                    "Stored leave request employeeId is invalid.",
                ));
            }
        };
        if existing_id != submitted_id {
            return Err(ApiError::bad_request(
                "Leave request employee identity cannot be added, removed, or changed after creation.",
            ));
        }
        for field in ["employeeName", "employeeCode", "department"] {
            if existing.get(field) != record.get(field) {
                return Err(ApiError::bad_request(format!(
                    "Leave request historical identity field {field} cannot be changed."
                )));
            }
        }
        return Ok(());
    }

    let employee_id = submitted_id.ok_or_else(|| {
        ApiError::bad_request("New leave requests must reference an active HR employeeId.")
    })?;
    let identity: Option<(String, String, String)> = db
        .query_row(
            "SELECT u.name, p.employee_code, p.department
             FROM users u
             JOIN employee_profiles p ON p.user_id = u.id
             WHERE u.id = ?1 AND u.role != 'ADMIN' AND u.is_active = 1
               AND p.employment_status != 'Đã nghỉ việc'
               AND length(trim(u.name)) > 0
               AND length(trim(p.employee_code)) > 0
               AND length(trim(p.department)) > 0",
            params![employee_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some((name, code, department)) = identity else {
        return Err(ApiError::bad_request(
            "Selected employee must have an active, non-retired HR profile with name, employee code, and department.",
        ));
    };
    let Value::Object(fields) = record else {
        return Err(ApiError::bad_request("Leave request must be an object."));
    };
    fields.insert("employeeName".to_owned(), json!(name.trim()));
    fields.insert("employeeCode".to_owned(), json!(code.trim()));
    fields.insert("department".to_owned(), json!(department.trim()));
    Ok(())
}

fn validate_leave_request_record(record: &Value) -> ApiResult<()> {
    record_key(record)?;
    leave_request_text(record, "code", None, 80)?;
    leave_request_text(record, "employeeName", None, 200)?;
    leave_request_text(record, "department", None, 200)?;
    leave_request_text(record, "leaveType", Some("type"), 80)?;
    let start_date = leave_request_text(record, "startDate", Some("fromDate"), 10)?;
    let end_date = leave_request_text(record, "endDate", Some("toDate"), 10)?;
    let start_date = chrono::NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
        .map_err(|_| ApiError::bad_request("Leave request startDate must use YYYY-MM-DD."))?;
    let end_date = chrono::NaiveDate::parse_from_str(end_date, "%Y-%m-%d")
        .map_err(|_| ApiError::bad_request("Leave request endDate must use YYYY-MM-DD."))?;
    if end_date < start_date {
        return Err(ApiError::bad_request(
            "Leave request endDate must not be before startDate.",
        ));
    }
    let days = record
        .get("daysCount")
        .or_else(|| record.get("days"))
        .and_then(|value| {
            value
                .as_f64()
                .or_else(|| value.as_str().and_then(|text| text.parse::<f64>().ok()))
        })
        .ok_or_else(|| ApiError::bad_request("Leave request daysCount must be numeric."))?;
    if !(0.5..=366.0).contains(&days) || (days * 2.0 - (days * 2.0).round()).abs() > f64::EPSILON {
        return Err(ApiError::bad_request(
            "Leave request daysCount must be from 0.5 to 366 in 0.5-day increments.",
        ));
    }
    leave_request_reason(record)?;
    let status = leave_request_text(record, "status", None, 32)?;
    if ![
        "Chờ duyệt",
        "Đang xử lý",
        "Chờ phê duyệt",
        "Đã duyệt",
        "Đã phê duyệt",
        "Từ chối",
    ]
    .contains(&status)
    {
        return Err(ApiError::bad_request(
            "Leave request status is not supported.",
        ));
    }
    for field in ["handoverPerson", "contactPhone"] {
        if let Some(value) = record.get(field) {
            if !value.is_null()
                && (!value.is_string()
                    || value.as_str().is_some_and(|text| {
                        text.chars().count() > 200 || text.chars().any(char::is_control)
                    }))
            {
                return Err(ApiError::bad_request(format!(
                    "Leave request field {field} is invalid."
                )));
            }
        }
    }
    Ok(())
}

fn leave_request_text<'a>(
    record: &'a Value,
    field: &str,
    legacy_field: Option<&str>,
    max_chars: usize,
) -> ApiResult<&'a str> {
    let value = record
        .get(field)
        .filter(|value| {
            !value.is_null() && value.as_str().is_some_and(|text| !text.trim().is_empty())
        })
        .or_else(|| {
            legacy_field.and_then(|legacy_field| {
                record.get(legacy_field).filter(|value| {
                    !value.is_null() && value.as_str().is_some_and(|text| !text.trim().is_empty())
                })
            })
        })
        .and_then(Value::as_str)
        .ok_or_else(|| {
            ApiError::bad_request(format!("Leave request field {field} is required."))
        })?;
    if value.chars().count() > max_chars || value.chars().any(char::is_control) {
        return Err(ApiError::bad_request(format!(
            "Leave request field {field} is invalid."
        )));
    }
    Ok(value.trim())
}

fn leave_request_reason(record: &Value) -> ApiResult<&str> {
    let reason = record
        .get("reason")
        .and_then(Value::as_str)
        .filter(|reason| !reason.trim().is_empty())
        .ok_or_else(|| ApiError::bad_request("Leave request field reason is required."))?;
    if reason.chars().count() > 4_000
        || reason
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err(ApiError::bad_request(
            "Leave request field reason is invalid.",
        ));
    }
    Ok(reason.trim())
}

fn validate_attendance_shift(record: &Value) -> ApiResult<()> {
    attendance_shift_text(record, "key", 160)?;
    attendance_shift_text(record, "shiftCode", 64)?;
    attendance_shift_text(record, "shiftName", 200)?;
    let time_range = attendance_shift_text(record, "timeRange", 32)?;
    let start_time = attendance_shift_text(record, "startTime", 5)?;
    let end_time = attendance_shift_text(record, "endTime", 5)?;
    attendance_shift_text(record, "breakTime", 100)?;
    attendance_shift_text(record, "applicableTo", 250)?;
    let category = attendance_shift_text(record, "shiftCategory", 32)?;
    let status = attendance_shift_text(record, "status", 32)?;

    let (range_start, range_end) = time_range.split_once('-').ok_or_else(|| {
        ApiError::bad_request("Shift timeRange must contain a start and end time.")
    })?;
    let range_start = range_start.trim();
    let range_end = range_end.trim();
    for value in [start_time, end_time, range_start, range_end] {
        chrono::NaiveTime::parse_from_str(value, "%H:%M")
            .map_err(|_| ApiError::bad_request("Shift times must use HH:MM format."))?;
    }
    if !["Hành chính", "Trực kíp", "Ca đêm", "Linh hoạt"].contains(&category) {
        return Err(ApiError::bad_request(
            "Unsupported attendance shift category.",
        ));
    }
    if !["Đang áp dụng", "Tạm ngưng"].contains(&status) {
        return Err(ApiError::bad_request(
            "Unsupported attendance shift status.",
        ));
    }

    let number = |field: &str| -> ApiResult<f64> {
        record
            .get(field)
            .and_then(Value::as_f64)
            .filter(|value| value.is_finite())
            .ok_or_else(|| {
                ApiError::bad_request(format!("Invalid attendance shift field: {field}."))
            })
    };
    let working_hours = number("workingHours")?;
    if !(1.0..=12.0).contains(&working_hours)
        || (working_hours * 2.0 - (working_hours * 2.0).round()).abs() > f64::EPSILON
    {
        return Err(ApiError::bad_request(
            "Shift workingHours must be from 1 to 12 in half-hour increments.",
        ));
    }
    let grace = number("allowGraceMinutes")?;
    if !(0.0..=60.0).contains(&grace) || grace.fract() != 0.0 {
        return Err(ApiError::bad_request(
            "Shift allowGraceMinutes must be an integer from 0 to 60.",
        ));
    }
    let night_allowance = number("nightAllowancePct")?;
    if !(0.0..=100.0).contains(&night_allowance) {
        return Err(ApiError::bad_request(
            "Shift nightAllowancePct must be from 0 to 100.",
        ));
    }
    let work_units = number("workUnits")?;
    let expected_units = if working_hours >= 8.0 {
        if night_allowance > 0.0 { 1.3 } else { 1.0 }
    } else {
        0.5
    };
    if (work_units - expected_units).abs() > 0.000_001 {
        return Err(ApiError::bad_request(
            "Shift workUnits does not match the legacy conversion rule.",
        ));
    }
    Ok(())
}

fn attendance_shift_text<'a>(record: &'a Value, field: &str, maximum: usize) -> ApiResult<&'a str> {
    record
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.len() <= maximum)
        .ok_or_else(|| ApiError::bad_request(format!("Invalid attendance shift field: {field}.")))
}

fn sync_org_unit_manager(
    transaction: &Transaction<'_>,
    record: &Value,
    timestamp: &str,
) -> ApiResult<()> {
    let Some(unit_name) = record.get("name").and_then(Value::as_str).map(str::trim) else {
        return Ok(());
    };
    let Some(manager_value) = record.get("manager").and_then(Value::as_str).map(str::trim) else {
        return Ok(());
    };
    if unit_name.is_empty() || manager_value.is_empty() || manager_value == "Chưa phân công" {
        return Ok(());
    }
    let (manager_name, manager_code) = manager_value
        .rsplit_once('(')
        .filter(|(_, suffix)| suffix.trim_end().ends_with(')'))
        .map(|(name, suffix)| (name.trim(), suffix.trim().trim_end_matches(')').trim()))
        .unwrap_or((manager_value, manager_value));
    let employee = transaction
        .query_row(
            "SELECT u.id, p.department FROM users u JOIN employee_profiles p ON p.user_id = u.id WHERE u.role != 'ADMIN' AND (lower(u.name) = lower(?1) OR lower(p.employee_code) = lower(?2)) LIMIT 1",
            params![manager_name, manager_code],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(ApiError::internal)?;
    let Some((employee_id, current_departments)) = employee else {
        return Ok(());
    };
    if current_departments
        .split(',')
        .any(|department| department.trim().eq_ignore_ascii_case(unit_name))
    {
        return Ok(());
    }
    let next_departments = if current_departments.trim().is_empty() {
        unit_name.to_owned()
    } else {
        format!("{}, {unit_name}", current_departments.trim())
    };
    transaction
        .execute(
            "UPDATE employee_profiles SET department = ?1, updated_at = ?2 WHERE user_id = ?3",
            params![next_departments, timestamp, employee_id],
        )
        .map_err(ApiError::internal)?;
    Ok(())
}

fn validate_org_unit_records(records: &[Value]) -> ApiResult<()> {
    let mut keys = HashSet::new();
    let mut names = HashSet::new();
    let mut codes = HashSet::new();
    let mut parent_by_name = HashMap::new();
    for record in records {
        let key = record_key(record)?;
        if !keys.insert(key) {
            return Err(ApiError::conflict("Duplicate org unit key."));
        }
        let name = record
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|name| !name.is_empty() && name.len() <= 160)
            .ok_or_else(|| ApiError::bad_request("Org unit name is required (max 160 bytes)."))?;
        let code = record
            .get("code")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|code| !code.is_empty() && code.len() <= 64)
            .ok_or_else(|| ApiError::bad_request("Org unit code is required (max 64 bytes)."))?;
        if !names.insert(name.to_lowercase()) {
            return Err(ApiError::conflict("Org unit names must be unique."));
        }
        if !codes.insert(code.to_lowercase()) {
            return Err(ApiError::conflict("Org unit codes must be unique."));
        }
        let parent = record
            .get("parentUnit")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim();
        if parent.len() > 160 {
            return Err(ApiError::bad_request("Parent unit name is too long."));
        }
        parent_by_name.insert(name.to_lowercase(), parent.to_lowercase());
        let status = record
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("Đang hoạt động");
        if !["Đang hoạt động", "Tái cấu trúc", "Tạm ngưng"].contains(&status) {
            return Err(ApiError::bad_request("Unsupported org unit status."));
        }
        for field in ["headcountLimit", "annualBudget", "budgetSpent"] {
            if record
                .get(field)
                .is_some_and(|value| value.as_u64().is_none())
            {
                return Err(ApiError::bad_request(format!(
                    "Org unit field {field} must be a non-negative integer."
                )));
            }
        }
    }

    for name in parent_by_name.keys() {
        let mut current = Some(name.clone());
        let mut visited = HashSet::new();
        while let Some(current_name) = current {
            if !visited.insert(current_name.clone()) {
                return Err(ApiError::bad_request(
                    "Org unit hierarchy cannot contain a cycle.",
                ));
            }
            current = parent_by_name
                .get(&current_name)
                .filter(|parent| !parent.is_empty())
                .filter(|parent| parent_by_name.contains_key(parent.as_str()))
                .cloned();
        }
    }
    Ok(())
}

async fn delete_org_unit(state: &AppState, record_key_value: &str) -> ApiResult<Json<Value>> {
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db.transaction().map_err(ApiError::internal)?;
    let current = transaction
        .query_row(
            "SELECT record_json FROM collection_records WHERE scope = 'business_org_units' AND record_key = ?1",
            params![record_key_value],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Org unit not found."))?;
    let current: Value = serde_json::from_str(&current).map_err(ApiError::internal)?;
    let unit_name = current
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| ApiError::bad_request("Org unit name is missing."))?;

    let child_records = {
        let mut statement = transaction
            .prepare(
                "SELECT record_json FROM collection_records WHERE scope = 'business_org_units'",
            )
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(ApiError::internal)?
            .filter_map(|record| record.ok())
            .filter_map(|record| serde_json::from_str::<Value>(&record).ok())
            .collect::<Vec<_>>()
    };
    if child_records.iter().any(|record| {
        record
            .get("key")
            .or_else(|| record.get("id"))
            .and_then(Value::as_str)
            != Some(record_key_value)
            && record
                .get("parentUnit")
                .and_then(Value::as_str)
                .is_some_and(|parent| parent.trim().eq_ignore_ascii_case(unit_name))
    }) {
        return Err(ApiError::conflict(
            "Move child org units before deleting this unit.",
        ));
    }

    let employee_departments = {
        let mut statement = transaction
            .prepare("SELECT user_id, department FROM employee_profiles")
            .map_err(ApiError::internal)?;
        statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(ApiError::internal)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(ApiError::internal)?
    };
    for (employee_id, departments) in employee_departments {
        let retained = departments
            .split(',')
            .map(str::trim)
            .filter(|department| {
                !department.is_empty() && !department.eq_ignore_ascii_case(unit_name)
            })
            .collect::<Vec<_>>();
        if retained.len()
            != departments
                .split(',')
                .filter(|department| !department.trim().is_empty())
                .count()
        {
            transaction
                .execute(
                    "UPDATE employee_profiles SET department = ?1, updated_at = ?2 WHERE user_id = ?3",
                    params![retained.join(", "), timestamp, employee_id],
                )
                .map_err(ApiError::internal)?;
        }
    }
    transaction
        .execute(
            "DELETE FROM collection_records WHERE scope = 'business_org_units' AND record_key = ?1",
            params![record_key_value],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "deleted": true })))
}

async fn authenticated_user(state: &AppState, headers: &HeaderMap) -> ApiResult<User> {
    let claims = access_claims(state, headers)?;
    let db = state.db.lock().await;
    if let Some(session_id) = claims.sid.as_deref() {
        let now = Utc::now().timestamp();
        let is_active: i64 = db
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM auth_sessions WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL AND expires_at > ?3)",
                params![session_id, &claims.sub, now],
                |row| row.get(0),
            )
            .map_err(ApiError::internal)?;
        if is_active == 0 {
            return Err(ApiError::unauthorized(
                "Session has been revoked or expired.",
            ));
        }
    } else {
        // Unit and API tests use direct JWT fixtures. Production accepts only
        // session-backed tokens issued by login or activation.
        #[cfg(not(test))]
        return Err(ApiError::unauthorized(
            "This access token predates revocable sessions. Please sign in again.",
        ));
    }
    let user = db.query_row("SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = ?1", params![claims.sub], |row| {
        Ok(User { id: row.get(0)?, email: row.get(1)?, name: row.get(2)?, role: row.get(3)?, is_active: row.get::<_, i64>(4)? != 0, created_at: row.get(5)?, updated_at: row.get(6)? })
    }).optional().map_err(ApiError::internal)?.ok_or_else(|| ApiError::unauthorized("Account no longer exists."))?;
    if !user.is_active {
        return Err(ApiError::forbidden("This account is inactive."));
    }
    Ok(user)
}

async fn find_admin_user(state: &AppState, user_id: &str) -> ApiResult<AdminUser> {
    let db = state.db.lock().await;
    db.query_row(
        "SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.updated_at,
                p.employee_code, p.phone, p.department, p.position, p.employment_status
         FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id
         WHERE u.id = ?1",
        params![user_id],
        admin_user_from_sql,
    )
    .optional()
    .map_err(ApiError::internal)?
    .ok_or_else(|| ApiError::not_found("User not found."))
}

fn admin_user_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<AdminUser> {
    let user = User {
        id: row.get(0)?,
        email: row.get(1)?,
        name: row.get(2)?,
        role: row.get(3)?,
        is_active: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    };
    let employee_status: Option<String> = row.get(11)?;
    let activation_status = if user.is_active {
        "Đã kích hoạt"
    } else if employee_status.as_deref() == Some("Chờ kích hoạt") {
        "Chờ kích hoạt"
    } else if employee_status.as_deref() == Some("Đã nghỉ việc") {
        "Đã nghỉ việc"
    } else {
        "Đã khóa"
    };
    Ok(AdminUser {
        user,
        employee_code: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
        phone: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
        department: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
        position: row.get::<_, Option<String>>(10)?.unwrap_or_default(),
        activation_status: activation_status.to_owned(),
    })
}

async fn find_user(state: &AppState, user_id: &str) -> ApiResult<User> {
    let db = state.db.lock().await;
    db.query_row(
        "SELECT id, email, name, role, is_active, created_at, updated_at FROM users WHERE id = ?1",
        params![user_id],
        |row| {
            Ok(User {
                id: row.get(0)?,
                email: row.get(1)?,
                name: row.get(2)?,
                role: row.get(3)?,
                is_active: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )
    .optional()
    .map_err(ApiError::internal)?
    .ok_or_else(|| ApiError::not_found("User not found."))
}

async fn collection_records(state: &AppState, scope: &str) -> ApiResult<Vec<Value>> {
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT record_json FROM collection_records WHERE scope = ?1 ORDER BY created_at ASC",
        )
        .map_err(ApiError::internal)?;
    Ok(statement
        .query_map(params![scope], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .filter_map(|result| result.ok())
        .filter_map(|record| serde_json::from_str::<Value>(&record).ok())
        .collect::<Vec<_>>())
}

async fn all_employees(state: &AppState) -> ApiResult<Vec<EmployeeRow>> {
    let db = state.db.lock().await;
    let mut statement = db.prepare("SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.updated_at, p.employee_code, p.phone, p.department, p.position, p.employment_status, p.join_date, p.salary_base, p.avatar_url, p.details_json, p.created_at, p.updated_at FROM employee_profiles p JOIN users u ON u.id = p.user_id WHERE u.role != 'ADMIN' ORDER BY u.created_at DESC").map_err(ApiError::internal)?;
    statement
        .query_map([], employee_row_from_sql)
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)
}

async fn find_employee(state: &AppState, employee_id: &str) -> ApiResult<EmployeeRow> {
    let db = state.db.lock().await;
    db.query_row("SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.updated_at, p.employee_code, p.phone, p.department, p.position, p.employment_status, p.join_date, p.salary_base, p.avatar_url, p.details_json, p.created_at, p.updated_at FROM employee_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ?1", params![employee_id], employee_row_from_sql)
        .optional()
        .map_err(ApiError::internal)?
        .ok_or_else(|| ApiError::not_found("Employee not found."))
}

fn employee_row_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<EmployeeRow> {
    let details_json: String = row.get(15)?;
    Ok(EmployeeRow {
        user: User {
            id: row.get(0)?,
            email: row.get(1)?,
            name: row.get(2)?,
            role: row.get(3)?,
            is_active: row.get::<_, i64>(4)? != 0,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        },
        employee_code: row.get(7)?,
        phone: row.get(8)?,
        department: row.get(9)?,
        position: row.get(10)?,
        status: row.get(11)?,
        join_date: row.get(12)?,
        salary_base: row.get(13)?,
        avatar: row.get(14)?,
        details: serde_json::from_str(&details_json).unwrap_or_else(|_| json!({})),
        profile_created_at: row.get(16)?,
        profile_updated_at: row.get(17)?,
    })
}

fn user_from_sql(row: &rusqlite::Row<'_>) -> rusqlite::Result<User> {
    Ok(User {
        id: row.get(0)?,
        email: row.get(1)?,
        name: row.get(2)?,
        role: row.get(3)?,
        is_active: row.get::<_, i64>(4)? != 0,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn employee_value(employee: EmployeeRow) -> Value {
    let mut details = employee.details;
    strip_employee_bank_account_fields(&mut details);
    let mut fields = details.as_object().cloned().unwrap_or_default();
    let activation_status = if employee.user.is_active {
        "Đã kích hoạt"
    } else if employee.status == "Đã nghỉ việc" {
        "Đã nghỉ việc"
    } else {
        "Chờ kích hoạt"
    };
    fields.extend(serde_json::Map::from_iter([
        ("key".to_owned(), json!(employee.user.id)),
        ("id".to_owned(), json!(employee.user.id)),
        ("userId".to_owned(), json!(employee.user.id)),
        ("code".to_owned(), json!(employee.employee_code)),
        ("employeeCode".to_owned(), json!(employee.employee_code)),
        ("name".to_owned(), json!(employee.user.name)),
        ("fullName".to_owned(), json!(employee.user.name)),
        ("email".to_owned(), json!(employee.user.email)),
        ("phone".to_owned(), json!(employee.phone)),
        ("department".to_owned(), json!(employee.department)),
        ("position".to_owned(), json!(employee.position)),
        ("status".to_owned(), json!(employee.status)),
        ("joinDate".to_owned(), json!(employee.join_date)),
        ("salaryBase".to_owned(), json!(employee.salary_base)),
        ("avatar".to_owned(), json!(employee.avatar)),
        ("role".to_owned(), json!(employee.user.role)),
        ("isActive".to_owned(), json!(employee.user.is_active)),
        ("activationStatus".to_owned(), json!(activation_status)),
        ("createdAt".to_owned(), json!(employee.profile_created_at)),
        ("updatedAt".to_owned(), json!(employee.profile_updated_at)),
    ]));
    Value::Object(fields)
}

fn is_employee_bank_account_field(field: &str) -> bool {
    let normalized = field
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect::<String>();
    [
        "bankaccount",
        "bankaccounts",
        "bankname",
        "bankstatus",
        "accountnumber",
        "accountholder",
        "bankbranch",
    ]
    .contains(&normalized.as_str())
}

fn strip_employee_bank_account_fields(value: &mut Value) {
    match value {
        Value::Object(fields) => {
            fields.retain(|key, _| !is_employee_bank_account_field(key));
            for child in fields.values_mut() {
                strip_employee_bank_account_fields(child);
            }
        }
        Value::Array(items) => {
            for item in items {
                strip_employee_bank_account_fields(item);
            }
        }
        _ => {}
    }
}

fn has_employee_bank_account_fields(value: &Value) -> bool {
    match value {
        Value::Object(fields) => fields.iter().any(|(key, child)| {
            is_employee_bank_account_field(key) || has_employee_bank_account_fields(child)
        }),
        Value::Array(items) => items.iter().any(has_employee_bank_account_fields),
        _ => false,
    }
}

fn ensure_profile_has_no_bank_account_fields(value: &Value) -> ApiResult<()> {
    if has_employee_bank_account_fields(value) {
        return Err(ApiError::bad_request(
            "Use the protected employee bank-account API for bank details.",
        ));
    }
    Ok(())
}

fn required_employee_text(value: Option<&str>, field: &str, maximum: usize) -> ApiResult<String> {
    let value = value.unwrap_or_default().trim();
    if value.is_empty() || value.len() > maximum {
        return Err(ApiError::bad_request(format!(
            "{field} is required and must be at most {maximum} characters."
        )));
    }
    Ok(value.to_owned())
}

fn optional_employee_text(value: Option<&str>, maximum: usize) -> ApiResult<String> {
    let value = value.unwrap_or_default().trim();
    if value.len() > maximum {
        return Err(ApiError::bad_request(format!(
            "Value must be at most {maximum} characters."
        )));
    }
    Ok(value.to_owned())
}

fn set_employee_address(details: &mut Value, value: &str) -> ApiResult<()> {
    let address = optional_employee_text(Some(value), 512)?;
    let fields = details.as_object_mut().ok_or_else(|| {
        ApiError::bad_request("Employee profile details must be an object to update the address.")
    })?;
    fields.insert("address".to_owned(), json!(address));
    Ok(())
}

fn normalized_email(value: Option<&str>) -> ApiResult<String> {
    let email = value.unwrap_or_default().trim().to_lowercase();
    if email.is_empty() || !email.contains('@') || email.len() > 254 {
        return Err(ApiError::bad_request("A valid email is required."));
    }
    Ok(email)
}

fn employee_status(value: &str) -> ApiResult<String> {
    let value = value.trim();
    if ![
        "Chính thức",
        "Thử việc",
        "Đã nghỉ việc",
        "Nghỉ thai sản",
        "Tạm hoãn",
    ]
    .contains(&value)
    {
        return Err(ApiError::bad_request("Unsupported employee status."));
    }
    Ok(value.to_owned())
}

fn normalized_join_date(value: &str) -> ApiResult<String> {
    chrono::NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d")
        .map(|date| date.format("%Y-%m-%d").to_string())
        .map_err(|_| ApiError::bad_request("Join date must use YYYY-MM-DD format."))
}

fn object_value(value: Option<Value>) -> ApiResult<Value> {
    let value = value.unwrap_or_else(|| json!({}));
    if !value.is_object() {
        return Err(ApiError::bad_request("Employee details must be an object."));
    }
    Ok(value)
}

fn password_hash(password: &str) -> ApiResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|error| ApiError::internal(error.to_string()))
        .map(|hash| hash.to_string())
}

fn validate_activation_password(password: &str) -> ApiResult<()> {
    if !(12..=256).contains(&password.chars().count()) {
        return Err(ApiError::unprocessable(
            "Password must contain between 12 and 256 characters.",
        ));
    }
    if !password.chars().any(char::is_lowercase)
        || !password.chars().any(char::is_uppercase)
        || !password.chars().any(|character| character.is_ascii_digit())
        || !password
            .chars()
            .any(|character| !character.is_alphanumeric() && !character.is_whitespace())
    {
        return Err(ApiError::unprocessable(
            "Password must include upper case, lower case, number and symbol.",
        ));
    }
    Ok(())
}

fn activation_hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}

fn issue_activation_token(db: &Connection, user_id: &str) -> ApiResult<String> {
    let raw = Uuid::new_v4().to_string();
    let issued_at = Utc::now();
    let expires_at = issued_at + Duration::hours(48);
    db.execute(
        "UPDATE activation_tokens SET used_at = ?1 WHERE user_id = ?2 AND used_at IS NULL",
        params![issued_at.to_rfc3339(), user_id],
    )
    .map_err(ApiError::internal)?;
    db.execute(
        "INSERT INTO activation_tokens (id, user_id, token_hash, issued_at, expires_at, used_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL)",
        params![Uuid::new_v4().to_string(), user_id, activation_hash(&raw), issued_at.to_rfc3339(), expires_at.to_rfc3339()],
    ).map_err(ApiError::internal)?;
    Ok(expires_at.to_rfc3339())
}

async fn activation_record(
    state: &AppState,
    raw_token: &str,
) -> ApiResult<(String, String, String)> {
    if raw_token.is_empty() {
        return Err(ApiError::bad_request("Activation token is required."));
    }
    let db = state.db.lock().await;
    let record: Option<(String, String, String)> = db.query_row(
        "SELECT id, user_id, expires_at FROM activation_tokens WHERE token_hash = ?1 AND used_at IS NULL ORDER BY issued_at DESC LIMIT 1",
        params![activation_hash(raw_token)],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ).optional().map_err(ApiError::internal)?;
    let Some((id, user_id, expires_at)) = record else {
        return Err(ApiError::gone(
            "Activation link is invalid or has already been used.",
        ));
    };
    let expires_at = chrono::DateTime::parse_from_rfc3339(&expires_at)
        .map_err(ApiError::internal)?
        .with_timezone(&Utc);
    if expires_at <= Utc::now() {
        return Err(ApiError::gone("Activation link has expired."));
    }
    Ok((id, user_id, expires_at.to_rfc3339()))
}

async fn apply_employee_update(
    state: &AppState,
    employee_id: &str,
    input: EmployeeInput,
    allow_identity_changes: bool,
    actor_user_id: &str,
) -> ApiResult<EmployeeRow> {
    let current = find_employee(state, employee_id).await?;
    let name = if allow_identity_changes {
        match input.name.as_deref() {
            Some(value) => required_employee_text(Some(value), "Name", 160)?,
            None => current.user.name.clone(),
        }
    } else {
        current.user.name.clone()
    };
    let email = if allow_identity_changes {
        match input.email.as_deref() {
            Some(value) => normalized_email(Some(value))?,
            None => current.user.email.clone(),
        }
    } else {
        current.user.email.clone()
    };
    let employee_code = if allow_identity_changes {
        match input.employee_code.as_deref().or(input.code.as_deref()) {
            Some(value) => required_employee_text(Some(value), "Employee code", 64)?.to_uppercase(),
            None => current.employee_code.clone(),
        }
    } else {
        current.employee_code.clone()
    };
    let phone = match input.phone.as_deref() {
        Some(value) => optional_employee_text(Some(value), 32)?,
        None => current.phone.clone(),
    };
    let department = if allow_identity_changes {
        match input.department.as_deref() {
            Some(value) => optional_employee_text(Some(value), 160)?,
            None => current.department.clone(),
        }
    } else {
        current.department.clone()
    };
    let position = if allow_identity_changes {
        match input.position.as_deref() {
            Some(value) => optional_employee_text(Some(value), 160)?,
            None => current.position.clone(),
        }
    } else {
        current.position.clone()
    };
    let status = if allow_identity_changes {
        match input.status.as_deref() {
            Some(value) => employee_status(value)?,
            None => current.status.clone(),
        }
    } else {
        current.status.clone()
    };
    let join_date = if allow_identity_changes {
        match input.join_date {
            Some(value) if value.trim().is_empty() => String::new(),
            Some(value) => normalized_join_date(&value)?,
            None => current.join_date.clone(),
        }
    } else {
        current.join_date.clone()
    };
    let salary_base = if allow_identity_changes {
        input.salary_base.unwrap_or(current.salary_base)
    } else {
        current.salary_base
    };
    if salary_base < 0 {
        return Err(ApiError::bad_request("Salary base cannot be negative."));
    }
    let avatar = match input.avatar.as_deref() {
        Some(value) => optional_employee_text(Some(value), 20_000)?,
        None => current.avatar.clone(),
    };
    let mut details = match input.details {
        Some(value) => {
            let details = object_value(Some(value))?;
            ensure_profile_has_no_bank_account_fields(&details)?;
            details
        }
        None => current.details.clone(),
    };
    if let Some(address) = input.address.as_deref() {
        set_employee_address(&mut details, address)?;
    }
    let timestamp = Utc::now().to_rfc3339();
    {
        let mut db = state.db.lock().await;
        let transaction = db.transaction().map_err(ApiError::internal)?;
        if allow_identity_changes {
            let email_owner: Option<String> = transaction
                .query_row(
                    "SELECT id FROM users WHERE lower(email) = lower(?1) AND id != ?2",
                    params![&email, employee_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(ApiError::internal)?;
            if email_owner.is_some() {
                return Err(ApiError::conflict("Email already exists."));
            }
            let code_owner: Option<String> = transaction
                .query_row(
                    "SELECT user_id FROM employee_profiles WHERE lower(employee_code) = lower(?1) AND user_id != ?2",
                    params![&employee_code, employee_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(ApiError::internal)?;
            if code_owner.is_some() {
                return Err(ApiError::conflict("Employee code already exists."));
            }
        }
        let retired = status == "Đã nghỉ việc";
        transaction.execute(
            "UPDATE users SET name = ?1, email = ?2, is_active = CASE WHEN ?3 = 1 THEN 0 ELSE is_active END, updated_at = ?4 WHERE id = ?5",
            params![name, email, retired as i64, &timestamp, employee_id],
        )
        .map_err(ApiError::internal)?;
        transaction.execute("UPDATE employee_profiles SET employee_code = ?1, phone = ?2, department = ?3, position = ?4, employment_status = ?5, join_date = ?6, salary_base = ?7, avatar_url = ?8, details_json = ?9, updated_at = ?10 WHERE user_id = ?11", params![employee_code, phone, department, position, status, join_date, salary_base, avatar, details.to_string(), timestamp, employee_id]).map_err(ApiError::internal)?;
        if retired {
            let revoked_at = Utc::now().timestamp();
            let mut statement = transaction
                .prepare(
                    "SELECT id FROM auth_sessions WHERE user_id = ?1 AND revoked_at IS NULL AND expires_at > ?2",
                )
                .map_err(ApiError::internal)?;
            let sessions = statement
                .query_map(params![employee_id, revoked_at], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(ApiError::internal)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(ApiError::internal)?;
            drop(statement);
            for session_id in sessions {
                transaction
                    .execute(
                        "UPDATE auth_sessions SET revoked_at = ?1 WHERE id = ?2 AND revoked_at IS NULL",
                        params![revoked_at, &session_id],
                    )
                    .map_err(ApiError::internal)?;
                transaction
                    .execute(
                        "INSERT INTO auth_session_events (id, actor_user_id, subject_user_id, session_id, event_type, created_at) VALUES (?1, ?2, ?3, ?4, 'account_deactivated', ?5)",
                        params![Uuid::new_v4().to_string(), actor_user_id, employee_id, &session_id, revoked_at],
                    )
                    .map_err(ApiError::internal)?;
            }
            transaction
                .execute(
                    "UPDATE activation_tokens SET used_at = ?1 WHERE user_id = ?2 AND used_at IS NULL",
                    params![&timestamp, employee_id],
                )
                .map_err(ApiError::internal)?;
        }
        transaction.commit().map_err(ApiError::internal)?;
    }
    find_employee(state, employee_id).await
}

async fn require_admin(state: &AppState, headers: &HeaderMap) -> ApiResult<User> {
    let user = authenticated_user(state, headers).await?;
    if user.role != ADMIN_ROLE {
        return Err(ApiError::forbidden("Administrator access is required."));
    }
    Ok(user)
}

fn access_claims(state: &AppState, headers: &HeaderMap) -> ApiResult<Claims> {
    let token = bearer_token(headers)?;
    decode::<Claims>(
        token,
        &state.jwt_decoding,
        &Validation::new(Algorithm::HS256),
    )
    .map(|token| token.claims)
    .map_err(|_| ApiError::unauthorized("Invalid or expired access token."))
}

async fn issue_session_token(state: &AppState, user: &User) -> ApiResult<(String, String)> {
    let now = Utc::now();
    let issued_at = now.timestamp();
    let expires_at = (now + Duration::hours(12)).timestamp();
    let session_id = Uuid::new_v4().to_string();
    let claims = Claims {
        sub: user.id.clone(),
        email: user.email.clone(),
        role: user.role.clone(),
        sid: Some(session_id.clone()),
        iat: issued_at as usize,
        exp: expires_at as usize,
    };
    let token =
        encode(&Header::default(), &claims, &state.jwt_encoding).map_err(ApiError::internal)?;
    let mut db = state.db.lock().await;
    let transaction = db
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO auth_sessions (id, user_id, issued_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
            params![&session_id, &user.id, issued_at, expires_at],
        )
        .map_err(ApiError::internal)?;
    transaction
        .execute(
            "INSERT INTO auth_session_events (id, actor_user_id, subject_user_id, session_id, event_type, created_at) VALUES (?1, ?2, ?2, ?3, 'login', ?4)",
            params![Uuid::new_v4().to_string(), &user.id, &session_id, issued_at],
        )
        .map_err(ApiError::internal)?;
    transaction.commit().map_err(ApiError::internal)?;
    Ok((session_id, token))
}

#[cfg(test)]
fn issue_token(state: &AppState, user: &User) -> ApiResult<String> {
    let now = Utc::now();
    let claims = Claims {
        sub: user.id.clone(),
        email: user.email.clone(),
        role: user.role.clone(),
        sid: None,
        iat: now.timestamp() as usize,
        exp: (now + Duration::hours(12)).timestamp() as usize,
    };
    encode(&Header::default(), &claims, &state.jwt_encoding).map_err(ApiError::internal)
}

fn bearer_token(headers: &HeaderMap) -> ApiResult<&str> {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|token| !token.is_empty())
        .ok_or_else(|| ApiError::unauthorized("Bearer token is required."))
}

async fn read_setting(state: &AppState, key: &str) -> ApiResult<Option<String>> {
    let db = state.db.lock().await;
    db.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |row| row.get(0),
    )
    .optional()
    .map_err(ApiError::internal)
}

async fn write_setting(state: &AppState, key: &str, value: &str) -> ApiResult<()> {
    let timestamp = Utc::now().to_rfc3339();
    let db = state.db.lock().await;
    db.execute("INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", params![key, value, timestamp]).map_err(ApiError::internal)?;
    Ok(())
}

fn validate_scope(scope: &str) -> ApiResult<()> {
    if scope.is_empty()
        || scope.len() > 96
        || !scope.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '_' | '-' | '.')
        })
    {
        return Err(ApiError::bad_request("Invalid collection scope."));
    }
    Ok(())
}

fn record_key(record: &Value) -> ApiResult<String> {
    let Value::Object(fields) = record else {
        return Err(ApiError::bad_request("Record must be an object."));
    };
    let key = fields
        .get("key")
        .and_then(Value::as_str)
        .or_else(|| fields.get("id").and_then(Value::as_str))
        .or_else(|| fields.get("code").and_then(Value::as_str))
        .map(str::trim)
        .filter(|value| {
            !value.is_empty() && value.len() <= 160 && !value.chars().any(char::is_control)
        })
        .ok_or_else(|| ApiError::bad_request("Record requires a valid key or id."))?;
    Ok(key.to_owned())
}

fn init_database(db: &Connection) -> Result<()> {
    db.execute_batch("\
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('ADMIN', 'USER')), password_hash TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS auth_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          issued_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL CHECK(expires_at > issued_at),
          revoked_at INTEGER,
          CHECK(revoked_at IS NULL OR revoked_at >= issued_at)
        );
        CREATE INDEX IF NOT EXISTS auth_sessions_user_active_idx
          ON auth_sessions(user_id, revoked_at, expires_at);
        CREATE TABLE IF NOT EXISTS auth_session_events (
          id TEXT PRIMARY KEY,
          actor_user_id TEXT NOT NULL,
          subject_user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          event_type TEXT NOT NULL CHECK(event_type IN ('login', 'logout', 'admin_revoke', 'password_change', 'account_deactivated', 'account_deleted')),
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS auth_session_events_session_idx
          ON auth_session_events(session_id, created_at);
        CREATE TRIGGER IF NOT EXISTS auth_session_events_no_update
          BEFORE UPDATE ON auth_session_events
          BEGIN SELECT RAISE(ABORT, 'auth session events are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS auth_session_events_no_delete
          BEFORE DELETE ON auth_session_events
          BEGIN SELECT RAISE(ABORT, 'auth session events are append-only'); END;
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS collection_records (
          scope TEXT NOT NULL, record_key TEXT NOT NULL, record_json TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(scope, record_key)
        );
        CREATE TABLE IF NOT EXISTS hr_reward_events (
          reward_key TEXT NOT NULL,
          sequence_no INTEGER NOT NULL CHECK(sequence_no > 0),
          event_type TEXT NOT NULL CHECK(event_type IN ('approved', 'awarded')),
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL,
          PRIMARY KEY(reward_key, sequence_no),
          UNIQUE(reward_key, event_type)
        );
        CREATE TRIGGER IF NOT EXISTS hr_reward_events_no_update
          BEFORE UPDATE ON hr_reward_events
          BEGIN SELECT RAISE(ABORT, 'HR reward events are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS hr_reward_events_no_delete
          BEFORE DELETE ON hr_reward_events
          BEGIN SELECT RAISE(ABORT, 'HR reward events are append-only'); END;
        CREATE INDEX IF NOT EXISTS hr_reward_events_reward_idx
          ON hr_reward_events(reward_key, sequence_no);
        CREATE TABLE IF NOT EXISTS hr_performance_review_events (
          review_key TEXT NOT NULL,
          sequence_no INTEGER NOT NULL CHECK(sequence_no > 0),
          event_type TEXT NOT NULL CHECK(event_type IN ('created', 'approved')),
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL,
          PRIMARY KEY(review_key, sequence_no),
          UNIQUE(review_key, event_type)
        );
        CREATE TRIGGER IF NOT EXISTS hr_performance_review_events_no_update
          BEFORE UPDATE ON hr_performance_review_events
          BEGIN SELECT RAISE(ABORT, 'HR performance review events are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS hr_performance_review_events_no_delete
          BEFORE DELETE ON hr_performance_review_events
          BEGIN SELECT RAISE(ABORT, 'HR performance review events are append-only'); END;
        CREATE INDEX IF NOT EXISTS hr_performance_review_events_review_idx
          ON hr_performance_review_events(review_key, sequence_no);
        CREATE TABLE IF NOT EXISTS hr_employee_history (
          history_key TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          employee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          employee_code TEXT NOT NULL,
          history_type TEXT NOT NULL CHECK(history_type IN ('Chức vụ', 'Thuyên chuyển', 'Nghỉ việc', 'Khen thưởng', 'Kỷ luật sự cố')),
          event_date TEXT NOT NULL,
          old_value TEXT NOT NULL DEFAULT '',
          new_value TEXT NOT NULL,
          decision_number TEXT NOT NULL DEFAULT '',
          declared_signer TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL
        );
        CREATE TRIGGER IF NOT EXISTS hr_employee_history_no_update
          BEFORE UPDATE ON hr_employee_history
          BEGIN SELECT RAISE(ABORT, 'HR employee history is append-only'); END;
        CREATE TRIGGER IF NOT EXISTS hr_employee_history_no_delete
          BEFORE DELETE ON hr_employee_history
          BEGIN SELECT RAISE(ABORT, 'HR employee history is append-only'); END;
        CREATE INDEX IF NOT EXISTS hr_employee_history_employee_date_idx
          ON hr_employee_history(employee_user_id, event_date DESC, created_at DESC);
        CREATE TABLE IF NOT EXISTS employee_bank_accounts (
          id TEXT PRIMARY KEY,
          employee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          employee_code TEXT NOT NULL,
          bank_name_enc TEXT NOT NULL,
          account_number_enc TEXT NOT NULL,
          account_number_last4 TEXT NOT NULL,
          account_holder_enc TEXT NOT NULL,
          branch_enc TEXT NOT NULL DEFAULT '',
          note_enc TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL CHECK(status IN ('Chờ duyệt', 'Đã duyệt', 'Từ chối', 'Đã ngừng sử dụng')),
          is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
          rejection_reason_enc TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS employee_bank_accounts_primary_idx
          ON employee_bank_accounts(employee_user_id) WHERE status='Đã duyệt' AND is_primary=1;
        CREATE INDEX IF NOT EXISTS employee_bank_accounts_owner_idx
          ON employee_bank_accounts(employee_user_id, created_at DESC);
        CREATE TRIGGER IF NOT EXISTS employee_bank_accounts_no_delete
          BEFORE DELETE ON employee_bank_accounts
          BEGIN SELECT RAISE(ABORT, 'Bank accounts must be retired, not deleted'); END;
        CREATE TRIGGER IF NOT EXISTS employee_bank_accounts_details_immutable
          BEFORE UPDATE OF employee_user_id, employee_code, bank_name_enc, account_number_enc,
            account_number_last4, account_holder_enc, branch_enc, note_enc, created_at
          ON employee_bank_accounts
          BEGIN SELECT RAISE(ABORT, 'Bank account details are immutable; submit a replacement'); END;
        CREATE TABLE IF NOT EXISTS employee_bank_account_events (
          account_id TEXT NOT NULL REFERENCES employee_bank_accounts(id) ON DELETE RESTRICT,
          sequence_no INTEGER NOT NULL CHECK(sequence_no > 0),
          event_type TEXT NOT NULL CHECK(event_type IN ('created', 'approved', 'rejected', 'retired', 'primary_replaced')),
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          detail_enc TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          PRIMARY KEY(account_id, sequence_no)
        );
        CREATE TRIGGER IF NOT EXISTS employee_bank_account_events_no_update
          BEFORE UPDATE ON employee_bank_account_events
          BEGIN SELECT RAISE(ABORT, 'Bank account events are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS employee_bank_account_events_no_delete
          BEFORE DELETE ON employee_bank_account_events
          BEGIN SELECT RAISE(ABORT, 'Bank account events are append-only'); END;
        CREATE INDEX IF NOT EXISTS employee_bank_account_events_owner_idx
          ON employee_bank_account_events(account_id, sequence_no);
        CREATE TABLE IF NOT EXISTS employee_bank_import_runs (
          batch_id TEXT PRIMARY KEY,
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          source_origin TEXT NOT NULL,
          exported_at TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          imported_accounts INTEGER NOT NULL CHECK(imported_accounts >= 0),
          quarantined_records INTEGER NOT NULL CHECK(quarantined_records >= 0),
          already_imported_records INTEGER NOT NULL CHECK(already_imported_records >= 0)
        );
        CREATE TRIGGER IF NOT EXISTS employee_bank_import_runs_no_update
          BEFORE UPDATE ON employee_bank_import_runs
          BEGIN SELECT RAISE(ABORT, 'Bank import runs are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS employee_bank_import_runs_no_delete
          BEFORE DELETE ON employee_bank_import_runs
          BEGIN SELECT RAISE(ABORT, 'Bank import runs are append-only'); END;
        CREATE TABLE IF NOT EXISTS employee_bank_import_rows (
          source_key_sha256 TEXT PRIMARY KEY,
          source_kind TEXT NOT NULL CHECK(source_kind IN ('generic_collection', 'local_storage', 'employee_profile')),
          batch_id TEXT NOT NULL REFERENCES employee_bank_import_runs(batch_id) ON DELETE RESTRICT,
          outcome TEXT NOT NULL CHECK(outcome IN ('imported_unverified', 'quarantined')),
          issue_code TEXT NOT NULL DEFAULT '',
          account_id TEXT REFERENCES employee_bank_accounts(id) ON DELETE RESTRICT,
          legacy_payload_enc TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS employee_bank_import_rows_batch_idx
          ON employee_bank_import_rows(batch_id, outcome);
        CREATE TRIGGER IF NOT EXISTS employee_bank_import_rows_no_update
          BEFORE UPDATE ON employee_bank_import_rows
          BEGIN SELECT RAISE(ABORT, 'Bank import rows are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS employee_bank_import_rows_no_delete
          BEFORE DELETE ON employee_bank_import_rows
          BEGIN SELECT RAISE(ABORT, 'Bank import rows are append-only'); END;
        CREATE TABLE IF NOT EXISTS employee_bank_import_resolutions (
          source_key_sha256 TEXT PRIMARY KEY REFERENCES employee_bank_import_rows(source_key_sha256) ON DELETE RESTRICT,
          action TEXT NOT NULL CHECK(action IN ('adopted','dismissed')),
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          account_id TEXT REFERENCES employee_bank_accounts(id) ON DELETE RESTRICT,
          review_reason_enc TEXT NOT NULL,
          resolved_at TEXT NOT NULL,
          CHECK((action='adopted' AND account_id IS NOT NULL) OR (action='dismissed' AND account_id IS NULL))
        );
        CREATE TRIGGER IF NOT EXISTS employee_bank_import_resolutions_no_update
          BEFORE UPDATE ON employee_bank_import_resolutions
          BEGIN SELECT RAISE(ABORT, 'Bank import resolutions are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS employee_bank_import_resolutions_no_delete
          BEFORE DELETE ON employee_bank_import_resolutions
          BEGIN SELECT RAISE(ABORT, 'Bank import resolutions are append-only'); END;
        CREATE INDEX IF NOT EXISTS employee_bank_import_resolutions_action_idx
          ON employee_bank_import_resolutions(action, resolved_at DESC);
        CREATE TABLE IF NOT EXISTS crm_contacts (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          contact_type TEXT NOT NULL CHECK (contact_type IN ('customer', 'supplier', 'partner')),
          tax_code TEXT NOT NULL DEFAULT '',
          industry TEXT NOT NULL DEFAULT '',
          contact_person TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          email TEXT NOT NULL DEFAULT '',
          address TEXT NOT NULL DEFAULT '',
          bank_account TEXT NOT NULL DEFAULT '',
          credit_limit INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
          total_value INTEGER NOT NULL DEFAULT 0 CHECK (total_value >= 0),
          debt_balance INTEGER NOT NULL DEFAULT 0 CHECK (debt_balance >= 0),
          tier TEXT NOT NULL DEFAULT 'Tiêu chuẩn',
          account_manager TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Đang hoạt động',
          created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS crm_contacts_type_idx ON crm_contacts(contact_type, created_at DESC);
        CREATE INDEX IF NOT EXISTS crm_contacts_name_idx ON crm_contacts(LOWER(name));
        CREATE INDEX IF NOT EXISTS crm_contacts_code_idx ON crm_contacts(LOWER(code));
        CREATE TABLE IF NOT EXISTS crm_contact_import_runs (
          batch_id TEXT PRIMARY KEY,
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          source_database_id TEXT NOT NULL,
          exported_at TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          imported_records INTEGER NOT NULL CHECK(imported_records > 0),
          already_imported_records INTEGER NOT NULL CHECK(already_imported_records >= 0)
        );
        CREATE TRIGGER IF NOT EXISTS crm_contact_import_runs_no_update
          BEFORE UPDATE ON crm_contact_import_runs
          BEGIN SELECT RAISE(ABORT, 'CRM contact import runs are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS crm_contact_import_runs_no_delete
          BEFORE DELETE ON crm_contact_import_runs
          BEGIN SELECT RAISE(ABORT, 'CRM contact import runs are append-only'); END;
        CREATE TABLE IF NOT EXISTS crm_contact_import_rows (
          source_key_sha256 TEXT PRIMARY KEY,
          source_payload_sha256 TEXT NOT NULL,
          source_contact_id TEXT NOT NULL,
          target_contact_id TEXT NOT NULL REFERENCES crm_contacts(id) ON DELETE RESTRICT,
          batch_id TEXT NOT NULL REFERENCES crm_contact_import_runs(batch_id) ON DELETE RESTRICT,
          legacy_payload_enc TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(target_contact_id)
        );
        CREATE INDEX IF NOT EXISTS crm_contact_import_rows_batch_idx
          ON crm_contact_import_rows(batch_id,source_contact_id);
        CREATE TRIGGER IF NOT EXISTS crm_contact_import_rows_no_update
          BEFORE UPDATE ON crm_contact_import_rows
          BEGIN SELECT RAISE(ABORT, 'CRM contact import rows are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS crm_contact_import_rows_no_delete
          BEFORE DELETE ON crm_contact_import_rows
          BEGIN SELECT RAISE(ABORT, 'CRM contact import rows are append-only'); END;
        CREATE TABLE IF NOT EXISTS crm_legacy_import_runs (
          batch_id TEXT PRIMARY KEY,
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          source_origin TEXT NOT NULL,
          exported_at TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          imported_records INTEGER NOT NULL CHECK(imported_records >= 0),
          already_imported_records INTEGER NOT NULL CHECK(already_imported_records >= 0)
        );
        CREATE TRIGGER IF NOT EXISTS crm_legacy_import_runs_no_update
          BEFORE UPDATE ON crm_legacy_import_runs
          BEGIN SELECT RAISE(ABORT, 'CRM legacy import runs are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS crm_legacy_import_runs_no_delete
          BEFORE DELETE ON crm_legacy_import_runs
          BEGIN SELECT RAISE(ABORT, 'CRM legacy import runs are append-only'); END;
        CREATE TABLE IF NOT EXISTS crm_legacy_import_rows (
          source_key_sha256 TEXT PRIMARY KEY,
          scope TEXT NOT NULL CHECK(scope IN ('crm_supplier_evaluations','crm_feedback')),
          batch_id TEXT NOT NULL REFERENCES crm_legacy_import_runs(batch_id) ON DELETE RESTRICT,
          record_key TEXT NOT NULL,
          source_payload_sha256 TEXT NOT NULL,
          legacy_payload_enc TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(scope,record_key)
        );
        CREATE INDEX IF NOT EXISTS crm_legacy_import_rows_batch_idx
          ON crm_legacy_import_rows(batch_id,scope);
        CREATE TRIGGER IF NOT EXISTS crm_legacy_import_rows_no_update
          BEFORE UPDATE ON crm_legacy_import_rows
          BEGIN SELECT RAISE(ABORT, 'CRM legacy import rows are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS crm_legacy_import_rows_no_delete
          BEFORE DELETE ON crm_legacy_import_rows
          BEGIN SELECT RAISE(ABORT, 'CRM legacy import rows are append-only'); END;
        CREATE TABLE IF NOT EXISTS legacy_import_runs (
          batch_id TEXT PRIMARY KEY,
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          source_origin TEXT NOT NULL,
          exported_at TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          scope_counts_json TEXT NOT NULL
        );
        CREATE TRIGGER IF NOT EXISTS legacy_import_runs_no_update
          BEFORE UPDATE ON legacy_import_runs
          BEGIN SELECT RAISE(ABORT, 'legacy import runs are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS legacy_import_runs_no_delete
          BEFORE DELETE ON legacy_import_runs
          BEGIN SELECT RAISE(ABORT, 'legacy import runs are append-only'); END;
        CREATE TABLE IF NOT EXISTS workflow_request_events (
          request_key TEXT NOT NULL, sequence_no INTEGER NOT NULL CHECK(sequence_no > 0),
          event_json TEXT NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY(request_key, sequence_no)
        );
        CREATE TRIGGER IF NOT EXISTS workflow_request_events_no_update
          BEFORE UPDATE ON workflow_request_events
          BEGIN SELECT RAISE(ABORT, 'workflow request events are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS workflow_request_events_no_delete
          BEFORE DELETE ON workflow_request_events
          BEGIN SELECT RAISE(ABORT, 'workflow request events are append-only'); END;
        CREATE INDEX IF NOT EXISTS workflow_request_events_created_idx
          ON workflow_request_events(request_key, sequence_no);
        CREATE TABLE IF NOT EXISTS employee_profiles (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          employee_code TEXT NOT NULL UNIQUE, phone TEXT NOT NULL DEFAULT '',
          department TEXT NOT NULL DEFAULT '', position TEXT NOT NULL DEFAULT '',
          employment_status TEXT NOT NULL DEFAULT 'Chính thức', join_date TEXT NOT NULL DEFAULT '',
          salary_base INTEGER NOT NULL DEFAULT 0, avatar_url TEXT NOT NULL DEFAULT '',
          details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS employee_profiles_department_idx ON employee_profiles(department, employment_status);
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          project_name TEXT NOT NULL DEFAULT '',
          assignee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          priority TEXT NOT NULL CHECK (priority IN ('Khẩn cấp', 'Cao', 'Trung bình', 'Thấp')),
          due_date TEXT NOT NULL,
          progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
          status TEXT NOT NULL DEFAULT 'Chưa bắt đầu'
            CHECK (status IN ('Chưa bắt đầu', 'Đang thực hiện', 'Chờ nghiệm thu', 'Hoàn thành', 'Tạm dừng')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks(assignee_id, status, due_date);
        CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks(due_date, status);
        CREATE UNIQUE INDEX IF NOT EXISTS tasks_code_lower_idx ON tasks(LOWER(code));
        CREATE TABLE IF NOT EXISTS task_checklist_items (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS task_checklist_items_task_idx ON task_checklist_items(task_id, sort_order);
        CREATE TABLE IF NOT EXISTS task_comments (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments(task_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS task_activities (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS task_activities_task_idx ON task_activities(task_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS task_reports (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          content TEXT NOT NULL DEFAULT '',
          attachments_json TEXT NOT NULL DEFAULT '[]',
          progress INTEGER NOT NULL CHECK (progress >= 0 AND progress <= 100),
          status TEXT NOT NULL CHECK (status IN ('Chưa bắt đầu', 'Đang thực hiện', 'Chờ nghiệm thu', 'Hoàn thành', 'Tạm dừng')),
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS task_reports_task_idx ON task_reports(task_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS task_attachments (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          name TEXT NOT NULL,
          mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
          size INTEGER NOT NULL CHECK (size >= 0 AND size <= 52428800),
          storage_key TEXT NOT NULL UNIQUE,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS task_attachments_task_idx ON task_attachments(task_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS helpdesk_tickets (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          title TEXT NOT NULL,
          requester TEXT NOT NULL,
          department TEXT NOT NULL,
          priority TEXT NOT NULL CHECK(priority IN ('Khẩn cấp','Cao','Trung bình','Thấp')),
          status TEXT NOT NULL DEFAULT 'Mới tạo'
            CHECK(status IN ('Mới tạo','Đang xử lý','Đã hoàn thành')),
          created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS helpdesk_tickets_code_lower_idx
          ON helpdesk_tickets(LOWER(code));
        CREATE INDEX IF NOT EXISTS helpdesk_tickets_status_created_idx
          ON helpdesk_tickets(status, created_at DESC);
        CREATE TRIGGER IF NOT EXISTS helpdesk_tickets_no_delete
          BEFORE DELETE ON helpdesk_tickets
          BEGIN SELECT RAISE(ABORT, 'Helpdesk tickets are retained, not deleted'); END;
        CREATE TABLE IF NOT EXISTS helpdesk_ticket_events (
          ticket_id TEXT NOT NULL REFERENCES helpdesk_tickets(id) ON DELETE RESTRICT,
          sequence_no INTEGER NOT NULL CHECK(sequence_no > 0),
          event_type TEXT NOT NULL CHECK(event_type IN ('created','status_changed')),
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          from_status TEXT,
          to_status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY(ticket_id,sequence_no)
        );
        CREATE TRIGGER IF NOT EXISTS helpdesk_ticket_events_no_update
          BEFORE UPDATE ON helpdesk_ticket_events
          BEGIN SELECT RAISE(ABORT, 'Helpdesk ticket events are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS helpdesk_ticket_events_no_delete
          BEFORE DELETE ON helpdesk_ticket_events
          BEGIN SELECT RAISE(ABORT, 'Helpdesk ticket events are append-only'); END;
        CREATE INDEX IF NOT EXISTS helpdesk_ticket_events_created_idx
          ON helpdesk_ticket_events(ticket_id,sequence_no);
        CREATE TABLE IF NOT EXISTS helpdesk_ticket_import_runs (
          batch_id TEXT PRIMARY KEY,
          source_origin TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          source_records INTEGER NOT NULL CHECK(source_records > 0),
          imported_records INTEGER NOT NULL CHECK(imported_records > 0),
          already_imported_records INTEGER NOT NULL CHECK(already_imported_records >= 0),
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL
        );
        CREATE TRIGGER IF NOT EXISTS helpdesk_ticket_import_runs_no_update
          BEFORE UPDATE ON helpdesk_ticket_import_runs
          BEGIN SELECT RAISE(ABORT, 'Helpdesk ticket import runs are immutable'); END;
        CREATE TRIGGER IF NOT EXISTS helpdesk_ticket_import_runs_no_delete
          BEFORE DELETE ON helpdesk_ticket_import_runs
          BEGIN SELECT RAISE(ABORT, 'Helpdesk ticket import runs are immutable'); END;
        CREATE TABLE IF NOT EXISTS helpdesk_ticket_import_rows (
          source_key_sha256 TEXT PRIMARY KEY,
          source_payload_sha256 TEXT NOT NULL,
          source_ticket_key TEXT NOT NULL,
          target_ticket_id TEXT NOT NULL UNIQUE REFERENCES helpdesk_tickets(id) ON DELETE RESTRICT,
          batch_id TEXT NOT NULL REFERENCES helpdesk_ticket_import_runs(batch_id) ON DELETE RESTRICT,
          imported_at TEXT NOT NULL
        );
        CREATE TRIGGER IF NOT EXISTS helpdesk_ticket_import_rows_no_update
          BEFORE UPDATE ON helpdesk_ticket_import_rows
          BEGIN SELECT RAISE(ABORT, 'Helpdesk ticket import provenance is immutable'); END;
        CREATE TRIGGER IF NOT EXISTS helpdesk_ticket_import_rows_no_delete
          BEFORE DELETE ON helpdesk_ticket_import_rows
          BEGIN SELECT RAISE(ABORT, 'Helpdesk ticket import provenance is immutable'); END;
        CREATE INDEX IF NOT EXISTS helpdesk_ticket_import_rows_target_idx
          ON helpdesk_ticket_import_rows(target_ticket_id);
        CREATE TABLE IF NOT EXISTS helpdesk_incidents (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          incident_title TEXT NOT NULL,
          affected_system TEXT NOT NULL,
          severity TEXT NOT NULL CHECK(severity IN ('P1 - Khẩn cấp (Toàn hệ thống)','P2 - Cao (Ảnh hưởng dịch vụ)','P3 - Trung bình')),
          occurred_at TEXT NOT NULL,
          resolved_at TEXT,
          handler TEXT NOT NULL,
          root_cause TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL CHECK(status IN ('Đang xử lý','Đã khắc phục')),
          created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS helpdesk_incidents_code_lower_idx
          ON helpdesk_incidents(LOWER(code));
        CREATE INDEX IF NOT EXISTS helpdesk_incidents_status_occurred_idx
          ON helpdesk_incidents(status,occurred_at DESC);
        CREATE TRIGGER IF NOT EXISTS helpdesk_incidents_no_delete
          BEFORE DELETE ON helpdesk_incidents
          BEGIN SELECT RAISE(ABORT, 'Helpdesk incidents are retained, not deleted'); END;
        CREATE TABLE IF NOT EXISTS helpdesk_incident_events (
          incident_id TEXT NOT NULL REFERENCES helpdesk_incidents(id) ON DELETE RESTRICT,
          sequence_no INTEGER NOT NULL CHECK(sequence_no > 0),
          event_type TEXT NOT NULL CHECK(event_type IN ('created','resolved')),
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          from_status TEXT,
          to_status TEXT NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          PRIMARY KEY(incident_id,sequence_no)
        );
        CREATE TRIGGER IF NOT EXISTS helpdesk_incident_events_no_update
          BEFORE UPDATE ON helpdesk_incident_events
          BEGIN SELECT RAISE(ABORT, 'Helpdesk incident events are append-only'); END;
        CREATE TRIGGER IF NOT EXISTS helpdesk_incident_events_no_delete
          BEFORE DELETE ON helpdesk_incident_events
          BEGIN SELECT RAISE(ABORT, 'Helpdesk incident events are append-only'); END;
        CREATE TABLE IF NOT EXISTS helpdesk_incident_import_runs (
          batch_id TEXT PRIMARY KEY,
          source_origin TEXT NOT NULL,
          payload_sha256 TEXT NOT NULL,
          source_records INTEGER NOT NULL CHECK(source_records > 0),
          imported_records INTEGER NOT NULL CHECK(imported_records > 0),
          already_imported_records INTEGER NOT NULL CHECK(already_imported_records >= 0),
          actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL
        );
        CREATE TRIGGER IF NOT EXISTS helpdesk_incident_import_runs_no_update
          BEFORE UPDATE ON helpdesk_incident_import_runs
          BEGIN SELECT RAISE(ABORT, 'Helpdesk incident import runs are immutable'); END;
        CREATE TRIGGER IF NOT EXISTS helpdesk_incident_import_runs_no_delete
          BEFORE DELETE ON helpdesk_incident_import_runs
          BEGIN SELECT RAISE(ABORT, 'Helpdesk incident import runs are immutable'); END;
        CREATE TABLE IF NOT EXISTS helpdesk_incident_import_rows (
          source_key_sha256 TEXT PRIMARY KEY,
          source_payload_sha256 TEXT NOT NULL,
          source_incident_key TEXT NOT NULL,
          target_incident_id TEXT NOT NULL UNIQUE REFERENCES helpdesk_incidents(id) ON DELETE RESTRICT,
          batch_id TEXT NOT NULL REFERENCES helpdesk_incident_import_runs(batch_id) ON DELETE RESTRICT,
          imported_at TEXT NOT NULL
        );
        CREATE TRIGGER IF NOT EXISTS helpdesk_incident_import_rows_no_update
          BEFORE UPDATE ON helpdesk_incident_import_rows
          BEGIN SELECT RAISE(ABORT, 'Helpdesk incident import provenance is immutable'); END;
        CREATE TRIGGER IF NOT EXISTS helpdesk_incident_import_rows_no_delete
          BEFORE DELETE ON helpdesk_incident_import_rows
          BEGIN SELECT RAISE(ABORT, 'Helpdesk incident import provenance is immutable'); END;
        CREATE INDEX IF NOT EXISTS helpdesk_incident_import_rows_target_idx
          ON helpdesk_incident_import_rows(target_incident_id);
        CREATE TABLE IF NOT EXISTS employee_proposals (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          proposal_type TEXT NOT NULL,
          estimated_amount INTEGER NOT NULL DEFAULT 0
            CHECK (estimated_amount >= 0 AND estimated_amount <= 1000000000000),
          content TEXT NOT NULL,
          submitter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          status TEXT NOT NULL DEFAULT 'Chờ duyệt'
            CHECK (status IN ('Chờ duyệt', 'Đã duyệt', 'Từ chối')),
          reviewer_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
          review_note TEXT NOT NULL DEFAULT '',
          reviewed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS employee_proposals_submitter_idx
          ON employee_proposals(submitter_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS employee_proposals_status_idx
          ON employee_proposals(status, created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS employee_proposals_code_lower_idx
          ON employee_proposals(LOWER(code));
        CREATE TABLE IF NOT EXISTS notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          message TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'system',
          link TEXT NOT NULL DEFAULT '',
          is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, is_read, created_at DESC);
        CREATE TABLE IF NOT EXISTS file_nodes (
          id TEXT PRIMARY KEY, parent_id TEXT REFERENCES file_nodes(id) ON DELETE RESTRICT,
          employee_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
          owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
          name TEXT NOT NULL, node_type TEXT NOT NULL CHECK(node_type IN ('dir', 'file')),
          mime_type TEXT NOT NULL DEFAULT '', size INTEGER NOT NULL DEFAULT 0,
          storage_key TEXT UNIQUE, origin_module TEXT NOT NULL DEFAULT 'files',
          is_hidden INTEGER NOT NULL DEFAULT 0, is_system INTEGER NOT NULL DEFAULT 0,
          is_protected INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS file_nodes_parent_name_idx ON file_nodes(parent_id, name) WHERE deleted_at IS NULL;
        CREATE INDEX IF NOT EXISTS file_nodes_parent_idx ON file_nodes(parent_id, deleted_at, name);
        CREATE INDEX IF NOT EXISTS file_nodes_employee_idx ON file_nodes(employee_id, deleted_at, created_at DESC);
        CREATE TABLE IF NOT EXISTS file_shares (
          id TEXT PRIMARY KEY,
          file_id TEXT NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
          token TEXT NOT NULL UNIQUE,
          is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
          created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS file_shares_file_idx ON file_shares(file_id);
        CREATE INDEX IF NOT EXISTS file_shares_token_idx ON file_shares(token);
        CREATE TABLE IF NOT EXISTS activation_tokens (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
          used_at TEXT
        );
        CREATE INDEX IF NOT EXISTS activation_tokens_user_idx ON activation_tokens(user_id, issued_at DESC);
    ")?;
    employee_leave_requests::install_schema(db)?;
    employee_overtime_requests::install_schema(db)?;
    audit::install_schema(db)?;
    attendance_shift_assignments::install_schema(db)?;
    documents::install_schema(db)?;
    chat::install_schema(db)?;
    finance::install_schema(db)?;
    finance_import::install_schema(db)?;
    contracts::install_schema(db)?;
    asset_audits::install_schema(db)?;
    asset_depreciations::install_schema(db)?;
    Ok(())
}

fn bootstrap_admin(db: &Connection) -> Result<()> {
    let users: i64 = db.query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))?;
    if users > 0 {
        return Ok(());
    }
    let email =
        env::var("KIYO_BOOTSTRAP_ADMIN_EMAIL").unwrap_or_else(|_| "admin@kiyo.local".to_owned());
    let password = env::var("KIYO_BOOTSTRAP_ADMIN_PASSWORD")
        .context("KIYO_BOOTSTRAP_ADMIN_PASSWORD must be set for the first start")?;
    anyhow::ensure!(
        (12..=256).contains(&password.chars().count()),
        "KIYO_BOOTSTRAP_ADMIN_PASSWORD must contain between 12 and 256 characters"
    );
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|error| anyhow::anyhow!(error.to_string()))?
        .to_string();
    let now = Utc::now().to_rfc3339();
    db.execute("INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)", params![Uuid::new_v4().to_string(), email, "Kiyo Administrator", ADMIN_ROLE, password_hash, now])?;
    Ok(())
}

fn jwt_secret() -> Result<String> {
    let secret = env::var("KIYO_JWT_SECRET").context("KIYO_JWT_SECRET must be set")?;
    anyhow::ensure!(
        secret.len() >= 32,
        "KIYO_JWT_SECRET must be at least 32 characters"
    );
    Ok(secret)
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    info!("Kiyo Server received shutdown signal");
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{
        Request,
        header::{ACCESS_CONTROL_ALLOW_ORIGIN, ORIGIN},
    };
    use tower::ServiceExt;

    fn test_state() -> (AppState, User) {
        let db = Connection::open_in_memory().expect("in-memory SQLite");
        init_database(&db).expect("schema");
        let now = Utc::now().to_rfc3339();
        let user = User {
            id: "employee-1".to_string(),
            email: "employee@example.test".to_string(),
            name: "Employee".to_string(),
            role: "USER".to_string(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now,
        };
        db.execute(
            "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
            params![
                &user.id,
                &user.email,
                &user.name,
                &user.role,
                password_hash("OldPassword-123!").expect("password hash"),
                &user.created_at,
                &user.updated_at,
            ],
        )
        .expect("user insert");
        let secret = b"test-only-secret-at-least-32-characters";
        (
            AppState {
                db: Arc::new(Mutex::new(db)),
                jwt_encoding: EncodingKey::from_secret(secret),
                jwt_decoding: DecodingKey::from_secret(secret),
                storage_dir: Arc::new(std::path::PathBuf::new()),
                crm_crypto: Some(crm::CrmCrypto::for_test([0x42; 32], "v1")),
            },
            user,
        )
    }

    #[tokio::test]
    async fn auth_profile_returns_the_user_envelope_expected_by_legacy_session_restore() {
        let (state, user) = test_state();
        let app = router(state.clone(), CorsLayer::new());
        let bearer = format!("Bearer {}", issue_token(&state, &user).expect("test token"));
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/profile")
                    .header(AUTHORIZATION, bearer)
                    .body(Body::empty())
                    .expect("profile request"),
            )
            .await
            .expect("profile response");

        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 8192)
            .await
            .expect("profile body");
        let payload: Value = serde_json::from_slice(&body).expect("profile JSON");
        assert_eq!(payload["user"]["id"], user.id);
        assert_eq!(payload["user"]["email"], user.email);
        assert_eq!(payload["user"]["name"], user.name);
        assert_eq!(payload["user"]["role"], user.role);
        assert!(payload.get("id").is_none());
    }

    #[test]
    fn employee_profile_api_redacts_and_rejects_plaintext_bank_account_fields() {
        let now = Utc::now().to_rfc3339();
        let employee = EmployeeRow {
            user: User {
                id: "profile-bank-1".to_owned(),
                email: "profile-bank@example.test".to_owned(),
                name: "Employee".to_owned(),
                role: "USER".to_owned(),
                is_active: true,
                created_at: now.clone(),
                updated_at: now.clone(),
            },
            employee_code: "EMP-BANK-1".to_owned(),
            phone: String::new(),
            department: String::new(),
            position: String::new(),
            status: "Chính thức".to_owned(),
            join_date: String::new(),
            salary_base: 0,
            avatar: String::new(),
            details: json!({
                "gender":"Nữ",
                "bankAccount":"123456789",
                "bankAccounts":[{"accountNumber":"987654321","bankName":"VCB"}],
                "nested":{"accountHolder":"Nguyen An","preferredLanguage":"vi"}
            }),
            profile_created_at: now.clone(),
            profile_updated_at: now,
        };
        let public_profile = employee_value(employee);
        assert_eq!(public_profile["gender"], "Nữ");
        assert_eq!(public_profile["nested"]["preferredLanguage"], "vi");
        assert!(public_profile.get("bankAccount").is_none());
        assert!(public_profile.get("bankAccounts").is_none());
        assert!(public_profile.get("accountNumber").is_none());
        assert!(public_profile.get("accountHolder").is_none());
        assert!(ensure_profile_has_no_bank_account_fields(&json!({"bankAccount":"123"})).is_err());
        assert!(
            ensure_profile_has_no_bank_account_fields(&json!({"nested":{"accountNumber":"123"}}))
                .is_err()
        );
        assert!(
            ensure_profile_has_no_bank_account_fields(&json!({"phone":"123","gender":"Nữ"}))
                .is_ok()
        );
    }

    #[tokio::test]
    async fn dashboard_stats_use_real_accounts_and_include_recent_audit_events() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-dashboard-1".to_owned(),
            email: "admin-dashboard@example.test".to_owned(),
            name: "Dashboard Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("AdminPassword-123!").expect("password hash"),
                    &admin.created_at,
                    &admin.updated_at,
                ],
            )
            .expect("admin insert");
            let workflow = json!({"id":"workflow-dashboard-1","status":"Chờ duyệt"});
            db.execute(
                "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES ('workflows', 'workflow-dashboard-1', ?1, ?2, ?2)",
                params![workflow.to_string(), Utc::now().to_rfc3339()],
            )
            .expect("workflow insert");
            audit::append_event(
                &db,
                &admin,
                "create",
                "Kiểm thử",
                "event-dashboard-1",
                json!({}),
            )
            .expect("audit event insert");
        }

        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/dashboard/stats")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("dashboard request"),
            )
            .await
            .expect("dashboard response");
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 16 * 1024)
            .await
            .expect("dashboard response body");
        let stats: Value = serde_json::from_slice(&body).expect("dashboard JSON");
        assert_eq!(stats["totalEmployees"], 1);
        assert_eq!(stats["activeUsers"], 1);
        assert_eq!(stats["newEmployeesThisMonth"], 1);
        assert_eq!(stats["pendingApprovalsCount"], 1);
        assert_eq!(stats["monthlyRevenue"], 0);
        assert_eq!(stats["monthlyExpense"], 0);
        assert_eq!(stats["financialMetricsAvailable"], true);
        assert_eq!(stats["auditLogsAvailable"], true);
        assert!(stats["recentAuditLogs"][0]["id"].is_string());
        assert_eq!(
            stats["recentAuditLogs"][0]["detail"],
            "Đối tượng: event-dashboard-1"
        );
        assert_eq!(
            stats["recentAuditLogs"][0]["user"],
            "Dashboard Admin (admin-dashboard@example.test)"
        );
        assert_eq!(stats["recentAuditLogs"][0]["module"], "Kiểm thử");

        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let forbidden = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/dashboard/stats")
                    .header(AUTHORIZATION, employee_bearer)
                    .body(Body::empty())
                    .expect("employee dashboard request"),
            )
            .await
            .expect("employee dashboard response");
        assert_eq!(forbidden.status(), StatusCode::FORBIDDEN);
    }

    async fn seed_activation_link(
        state: &AppState,
        user: &mut User,
        expires_at: chrono::DateTime<Utc>,
    ) -> String {
        user.is_active = false;
        let raw_token = "test-activation-link-secret".to_owned();
        let db = state.db.lock().await;
        db.execute(
            "UPDATE users SET is_active = 0 WHERE id = ?1",
            params![user.id],
        )
        .expect("deactivate test account");
        db.execute(
            "INSERT INTO employee_profiles (user_id, employee_code, employment_status, created_at, updated_at) VALUES (?1, ?2, 'Chờ kích hoạt', ?3, ?3)",
            params![&user.id, "EMP-ACT-1", &user.created_at],
        )
        .expect("employee profile");
        db.execute(
            "INSERT INTO activation_tokens (id, user_id, token_hash, issued_at, expires_at, used_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL)",
            params![
                "activation-row-1",
                &user.id,
                activation_hash(&raw_token),
                Utc::now().to_rfc3339(),
                expires_at.to_rfc3339(),
            ],
        )
        .expect("activation token");
        raw_token
    }

    fn input(
        old_password: &str,
        new_password: &str,
        confirm_password: &str,
    ) -> ChangePasswordInput {
        ChangePasswordInput {
            old_password: old_password.to_string(),
            new_password: new_password.to_string(),
            confirm_password: Some(confirm_password.to_string()),
        }
    }

    #[tokio::test]
    async fn admin_user_management_is_persisted_paginated_and_permission_checked() {
        let (state, mut employee) = test_state();
        let admin = User {
            id: "admin-1".to_owned(),
            email: "admin@example.test".to_owned(),
            name: "Administrator".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("Admin-Password-456!").expect("password hash"),
                    &admin.created_at,
                    &admin.updated_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );

        let unauthenticated = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/users")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);

        let forbidden = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/users")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(forbidden.status(), StatusCode::FORBIDDEN);

        let create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/users")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "name": "New Employee",
                            "email": "new.employee@example.test",
                            "employeeCode": "NV-0009",
                            "department": "Finance",
                            "position": "Analyst",
                            "password": "KiyoUser-Create-456!",
                            "role": "USER"
                        })
                        .to_string(),
                    ))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(create.status(), StatusCode::CREATED);
        let create_body = axum::body::to_bytes(create.into_body(), 8192)
            .await
            .expect("create response body");
        let created: Value = serde_json::from_slice(&create_body).expect("create JSON");
        let created_id = created["user"]["id"]
            .as_str()
            .expect("created user ID")
            .to_owned();
        assert_eq!(created["user"]["employeeCode"], "NV-0009");
        assert_eq!(created["user"]["department"], "Finance");
        assert_eq!(created["user"]["isActive"], true);

        {
            let db = state.db.lock().await;
            let profile = db
                .query_row(
                    "SELECT department FROM employee_profiles WHERE user_id = ?1",
                    params![&created_id],
                    |row| row.get::<_, String>(0),
                )
                .expect("created profile");
            assert_eq!(profile, "Finance");
            db.execute(
                "UPDATE employee_profiles SET department = 'Phòng Kế toán' WHERE user_id = ?1",
                params![&created_id],
            )
            .expect("set Unicode department for search test");
            let workspace_count: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM file_nodes WHERE employee_id = ?1 AND is_system = 1 AND is_protected = 1",
                    params![&created_id],
                    |row| row.get(0),
                )
                .expect("employee workspace count");
            assert_eq!(workspace_count, 2);
        }

        let list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/users?page=1&limit=2")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(list.status(), StatusCode::OK);
        let list_body = axum::body::to_bytes(list.into_body(), 16384)
            .await
            .expect("list response body");
        let list: Value = serde_json::from_slice(&list_body).expect("list JSON");
        assert_eq!(list["pagination"]["page"], 1);
        assert_eq!(list["pagination"]["limit"], 2);
        assert_eq!(list["pagination"]["total"], 3);
        assert_eq!(list["data"].as_array().expect("user rows").len(), 2);
        assert_eq!(list["summary"]["total"], 3);
        assert_eq!(list["summary"]["admins"], 1);

        let search = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/users?page=1&limit=1&search=NEW%20EMPLOYEE&filter=active")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(search.status(), StatusCode::OK);
        let search_body = axum::body::to_bytes(search.into_body(), 8192)
            .await
            .expect("search response body");
        let search: Value = serde_json::from_slice(&search_body).expect("search JSON");
        assert_eq!(search["pagination"]["total"], 1);
        assert_eq!(search["data"][0]["id"], created_id);
        assert_eq!(search["data"][0]["position"], "Analyst");
        assert_eq!(search["summary"]["total"], 3);

        for term in [
            "new.employee%40example.test",
            "NV-0009",
            "PH%C3%92NG%20K%E1%BA%BE%20TO%C3%81N",
            "ANALYST",
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/users?page=1&limit=20&search={term}"))
                        .header(AUTHORIZATION, &admin_bearer)
                        .body(Body::empty())
                        .expect("request"),
                )
                .await
                .expect("response");
            assert_eq!(response.status(), StatusCode::OK);
            let response_body = axum::body::to_bytes(response.into_body(), 8192)
                .await
                .expect("search response body");
            let response: Value = serde_json::from_slice(&response_body).expect("search JSON");
            assert_eq!(response["pagination"]["total"], 1, "search term: {term}");
            assert_eq!(response["data"][0]["id"], created_id, "search term: {term}");
        }

        let admin_filter = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/users?page=1&limit=20&filter=admin")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(admin_filter.status(), StatusCode::OK);
        let admin_filter_body = axum::body::to_bytes(admin_filter.into_body(), 8192)
            .await
            .expect("admin filter response body");
        let admin_filter: Value =
            serde_json::from_slice(&admin_filter_body).expect("admin filter JSON");
        assert_eq!(admin_filter["pagination"]["total"], 1);
        assert_eq!(admin_filter["data"][0]["id"], admin.id);

        let invalid_filter = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/users?filter=superadmin")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(invalid_filter.status(), StatusCode::BAD_REQUEST);

        let duplicate = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/users")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Duplicate",
                            "email": "NEW.EMPLOYEE@example.test",
                            "employeeCode": "NV-0010",
                            "department": "Finance",
                            "password": "KiyoUser-Create-456!",
                            "role": "USER"
                        })
                        .to_string(),
                    ))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(duplicate.status(), StatusCode::CONFLICT);

        let duplicate_code = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/users")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Duplicate Code",
                            "email": "unique-code@example.test",
                            "employeeCode": "nv-0009",
                            "department": "Finance",
                            "password": "KiyoUser-Create-456!",
                            "role": "USER"
                        })
                        .to_string(),
                    ))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(duplicate_code.status(), StatusCode::CONFLICT);

        for (is_active, expected_status) in [(false, StatusCode::OK), (true, StatusCode::OK)] {
            let updated = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(Method::PATCH)
                        .uri(format!("/api/v1/users/{created_id}"))
                        .header(AUTHORIZATION, &admin_bearer)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(json!({ "isActive": is_active }).to_string()))
                        .expect("request"),
                )
                .await
                .expect("response");
            assert_eq!(updated.status(), expected_status);
            let updated_body = axum::body::to_bytes(updated.into_body(), 8192)
                .await
                .expect("update response body");
            let updated: Value = serde_json::from_slice(&updated_body).expect("update JSON");
            assert_eq!(updated["user"]["isActive"], is_active);
        }

        let _raw_activation =
            seed_activation_link(&state, &mut employee, Utc::now() + Duration::hours(24)).await;
        let bypass_activation = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/users/employee-1")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "isActive": true }).to_string()))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(bypass_activation.status(), StatusCode::UNPROCESSABLE_ENTITY);

        {
            let db = state.db.lock().await;
            db.execute(
                "UPDATE employee_profiles SET employment_status = 'Đã nghỉ việc' WHERE user_id = ?1",
                params!["employee-1"],
            )
            .expect("retire employee profile");
        }
        let retired_unlock = app
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/users/employee-1")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "isActive": true }).to_string()))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(retired_unlock.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn cors_is_same_origin_by_default_and_explicit_when_configured() {
        let (state, _) = test_state();
        let request = || {
            Request::builder()
                .uri("/health")
                .header(ORIGIN, "https://kiyo.example")
                .body(Body::empty())
                .expect("request")
        };
        let same_origin = router(state.clone(), configured_cors(None).expect("default CORS"))
            .oneshot(request())
            .await
            .expect("response");
        assert!(
            same_origin
                .headers()
                .get(ACCESS_CONTROL_ALLOW_ORIGIN)
                .is_none()
        );

        let configured = router(
            state,
            configured_cors(Some("https://kiyo.example")).expect("configured CORS"),
        )
        .oneshot(request())
        .await
        .expect("response");
        assert_eq!(
            configured.headers().get(ACCESS_CONTROL_ALLOW_ORIGIN),
            Some(&HeaderValue::from_static("https://kiyo.example"))
        );
        assert!(configured_cors(Some("*")).is_err());
        assert!(configured_cors(Some("https://kiyo.example/path")).is_err());
    }

    #[tokio::test]
    async fn api_unknown_route_returns_json_not_spa_html() {
        let (state, _) = test_state();
        let app = router(state, CorsLayer::new());
        let known = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/health")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(known.status(), StatusCode::OK);
        let unknown = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/no-such-route")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(unknown.status(), StatusCode::NOT_FOUND);
        let body = axum::body::to_bytes(unknown.into_body(), 4096)
            .await
            .expect("body");
        let body: Value = serde_json::from_slice(&body).expect("JSON error");
        assert_eq!(body["error"], "API route not found.");
    }

    #[tokio::test]
    async fn password_change_requires_auth_and_replaces_credentials() {
        let (state, user) = test_state();
        let unauthorized = change_password(
            State(state.clone()),
            HeaderMap::new(),
            Json(input(
                "OldPassword-123!",
                "NewPassword-123!",
                "NewPassword-123!",
            )),
        )
        .await
        .err()
        .expect("missing bearer token must fail");
        assert_eq!(unauthorized.0, StatusCode::UNAUTHORIZED);

        let token = issue_token(&state, &user).expect("token");
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            format!("Bearer {token}").parse().expect("authorization"),
        );

        let wrong_password = change_password(
            State(state.clone()),
            headers.clone(),
            Json(input("incorrect", "NewPassword-123!", "NewPassword-123!")),
        )
        .await
        .err()
        .expect("incorrect password must fail");
        assert_eq!(wrong_password.0, StatusCode::BAD_REQUEST);

        let mismatch = change_password(
            State(state.clone()),
            headers.clone(),
            Json(input("OldPassword-123!", "NewPassword-123!", "different")),
        )
        .await
        .err()
        .expect("confirmation mismatch must fail");
        assert_eq!(mismatch.0, StatusCode::UNPROCESSABLE_ENTITY);

        let unicode_letter_is_not_a_symbol = change_password(
            State(state.clone()),
            headers.clone(),
            Json(input(
                "OldPassword-123!",
                "NewPassword123é",
                "NewPassword123é",
            )),
        )
        .await
        .err()
        .expect("a letter is not a special character");
        assert_eq!(
            unicode_letter_is_not_a_symbol.0,
            StatusCode::UNPROCESSABLE_ENTITY
        );

        let changed = change_password(
            State(state.clone()),
            headers,
            Json(input(
                "OldPassword-123!",
                "NewPassword-123!",
                "NewPassword-123!",
            )),
        )
        .await
        .expect("password change");
        assert_eq!(changed.0["success"], true);

        let old_login = login(
            State(state.clone()),
            Json(LoginInput {
                email: user.email.clone(),
                password: "OldPassword-123!".to_string(),
            }),
        )
        .await
        .err()
        .expect("old password must stop working");
        assert_eq!(old_login.0, StatusCode::UNAUTHORIZED);

        let new_login = login(
            State(state),
            Json(LoginInput {
                email: user.email,
                password: "NewPassword-123!".to_string(),
            }),
        )
        .await;
        assert!(new_login.is_ok(), "new password must work");
    }

    #[tokio::test]
    async fn password_change_http_contract_uses_bearer_and_camel_case_json() {
        let (state, user) = test_state();
        let app = router(state.clone(), CorsLayer::new());
        let body = json!({
            "oldPassword": "OldPassword-123!",
            "newPassword": "NewPassword-123!",
            "confirmPassword": "NewPassword-123!"
        })
        .to_string();

        let unauthorized = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/change-password")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(body.clone()))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(unauthorized.status(), StatusCode::UNAUTHORIZED);

        let token = issue_token(&state, &user).expect("token");
        let response = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/change-password")
                    .header(CONTENT_TYPE, "application/json")
                    .header(AUTHORIZATION, format!("Bearer {token}"))
                    .body(Body::from(body))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::OK);
        let payload = axum::body::to_bytes(response.into_body(), 4096)
            .await
            .expect("response body");
        let payload: Value = serde_json::from_slice(&payload).expect("JSON response");
        assert_eq!(payload["success"], true);
        assert!(payload["message"].as_str().is_some());
    }

    #[tokio::test]
    async fn activation_http_flow_uses_scoped_session_and_consumes_link_once() {
        let (state, mut user) = test_state();
        let raw_link =
            seed_activation_link(&state, &mut user, Utc::now() + Duration::hours(24)).await;
        let app = router(state.clone(), CorsLayer::new());
        let authorize = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/activation/authorize")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "token": raw_link }).to_string()))
                    .expect("authorize request"),
            )
            .await
            .expect("authorize response");
        assert_eq!(authorize.status(), StatusCode::OK);
        let authorize_body = axum::body::to_bytes(authorize.into_body(), 8192)
            .await
            .expect("authorize body");
        let authorization: Value = serde_json::from_slice(&authorize_body).expect("JSON");
        let scoped_token = authorization["activation_token"]
            .as_str()
            .expect("activation session JWT");
        assert_ne!(scoped_token, raw_link);
        assert_eq!(authorization["user"]["email"], user.email);

        let scoped_token_as_access = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/auth/profile")
                    .header(AUTHORIZATION, format!("Bearer {scoped_token}"))
                    .body(Body::empty())
                    .expect("activation JWT as normal access request"),
            )
            .await
            .expect("activation JWT as normal access response");
        assert_eq!(scoped_token_as_access.status(), StatusCode::UNAUTHORIZED);

        let raw_link_as_session = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/activation/set-password")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "activationToken": raw_link,
                            "password": "NewActivation-123!"
                        })
                        .to_string(),
                    ))
                    .expect("set password request"),
            )
            .await
            .expect("set password response");
        assert_eq!(raw_link_as_session.status(), StatusCode::UNAUTHORIZED);

        let normal_access_token = issue_token(&state, &user).expect("normal access token");
        let normal_token_as_activation = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/activation/set-password")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "activationToken": normal_access_token,
                            "password": "NewActivation-123!"
                        })
                        .to_string(),
                    ))
                    .expect("normal session as activation request"),
            )
            .await
            .expect("normal session as activation response");
        assert_eq!(
            normal_token_as_activation.status(),
            StatusCode::UNAUTHORIZED
        );

        let weak_password = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/activation/set-password")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "activationToken": scoped_token,
                            "password": "short"
                        })
                        .to_string(),
                    ))
                    .expect("weak password request"),
            )
            .await
            .expect("weak password response");
        assert_eq!(weak_password.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let completed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/activation/set-password")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "activationToken": scoped_token,
                            "password": "NewActivation-123!"
                        })
                        .to_string(),
                    ))
                    .expect("valid activation request"),
            )
            .await
            .expect("activation response");
        assert_eq!(completed.status(), StatusCode::OK);
        let completed_body = axum::body::to_bytes(completed.into_body(), 8192)
            .await
            .expect("activation body");
        let completed: Value = serde_json::from_slice(&completed_body).expect("JSON");
        assert!(completed["access_token"].as_str().is_some());
        assert_eq!(completed["user"]["isActive"], true);

        let login_response = login(
            State(state.clone()),
            Json(LoginInput {
                email: user.email.clone(),
                password: "NewActivation-123!".to_owned(),
            }),
        )
        .await;
        assert!(login_response.is_ok(), "activated credentials must work");
        {
            let db = state.db.lock().await;
            let status: String = db
                .query_row(
                    "SELECT employment_status FROM employee_profiles WHERE user_id = ?1",
                    params![user.id],
                    |row| row.get(0),
                )
                .expect("employment status");
            assert_eq!(status, "Chính thức");
            let used_at: Option<String> = db
                .query_row(
                    "SELECT used_at FROM activation_tokens WHERE id = 'activation-row-1'",
                    [],
                    |row| row.get(0),
                )
                .expect("consumed link");
            assert!(used_at.is_some());
        }

        let replay = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/activation/set-password")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "activationToken": scoped_token,
                            "password": "AnotherPassword-456!"
                        })
                        .to_string(),
                    ))
                    .expect("replay request"),
            )
            .await
            .expect("replay response");
        assert_eq!(replay.status(), StatusCode::GONE);
    }

    #[tokio::test]
    async fn activation_rejects_expired_link_with_gone_status() {
        let (state, mut user) = test_state();
        let raw_link =
            seed_activation_link(&state, &mut user, Utc::now() - Duration::minutes(1)).await;
        let response = router(state, CorsLayer::new())
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/activation/authorize")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "token": raw_link }).to_string()))
                    .expect("expired activation request"),
            )
            .await
            .expect("expired activation response");
        assert_eq!(response.status(), StatusCode::GONE);
    }

    #[tokio::test]
    async fn issuing_a_new_activation_revokes_the_previous_link() {
        let (state, mut user) = test_state();
        let old_link =
            seed_activation_link(&state, &mut user, Utc::now() + Duration::hours(24)).await;
        {
            let db = state.db.lock().await;
            issue_activation_token(&db, &user.id).expect("new activation link");
        }
        let response = router(state, CorsLayer::new())
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/activation/authorize")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "token": old_link }).to_string()))
                    .expect("revoked activation request"),
            )
            .await
            .expect("revoked activation response");
        assert_eq!(response.status(), StatusCode::GONE);
    }

    #[tokio::test]
    async fn employee_management_persists_profiles_and_enforces_role_boundaries() {
        let (state, employee) = test_state();
        let now = Utc::now().to_rfc3339();
        let admin = User {
            id: "admin-1".to_owned(),
            email: "admin@example.test".to_owned(),
            name: "Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("AdminPassword-123!").expect("admin password hash"),
                    &now,
                ],
            )
            .expect("admin insert");
            db.execute(
                "INSERT INTO employee_profiles (user_id,employee_code,department,position,employment_status,join_date,salary_base,created_at,updated_at) VALUES (?1,'NV-0001','Operations','Engineer','Chính thức','2020-01-01',12000000,?2,?2)",
                params![&employee.id, &now],
            )
            .expect("employee profile insert");
        }
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let app = router(state.clone(), CorsLayer::new());

        let denied_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/employees")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee list request"),
            )
            .await
            .expect("employee list response");
        assert_eq!(denied_list.status(), StatusCode::FORBIDDEN);

        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/employees")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "code": "nv-0002",
                            "name": "New Employee",
                            "email": "new.employee@example.test",
                            "phone": "0901234567",
                            "status": "Thử việc",
                            "joinDate": "",
                            "salaryBase": 18000000
                        })
                        .to_string(),
                    ))
                    .expect("create employee request"),
            )
            .await
            .expect("create employee response");
        assert_eq!(created.status(), StatusCode::OK);
        let created_body = axum::body::to_bytes(created.into_body(), 8192)
            .await
            .expect("create response body");
        let created: Value = serde_json::from_slice(&created_body).expect("create response JSON");
        let created_id = created["employee"]["id"]
            .as_str()
            .expect("employee ID")
            .to_owned();
        assert_eq!(created["employee"]["code"], "NV-0002");
        assert_eq!(created["employee"]["department"], "");
        assert_eq!(created["employee"]["isActive"], false);
        assert_eq!(created["employee"]["activationStatus"], "Chờ kích hoạt");
        assert_eq!(created["delivery"]["status"], "not_configured");
        {
            let db = state.db.lock().await;
            let workspace_nodes: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM file_nodes WHERE employee_id = ?1 AND is_system = 1 AND is_protected = 1",
                    params![&created_id],
                    |row| row.get(0),
                )
                .expect("employee workspace count");
            assert_eq!(workspace_nodes, 2);
            let activation_count: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM activation_tokens WHERE user_id = ?1 AND used_at IS NULL",
                    params![&created_id],
                    |row| row.get(0),
                )
                .expect("activation token count");
            assert_eq!(activation_count, 1);
        }

        for (code, email, status, join_date) in [
            ("NV-RET", "retired@example.test", "Đã nghỉ việc", ""),
            (
                "NV-DATE",
                "invalid-date@example.test",
                "Thử việc",
                "2026-02-31",
            ),
        ] {
            let rejected = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(Method::POST)
                        .uri("/api/v1/employees")
                        .header(AUTHORIZATION, &admin_bearer)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(
                            json!({
                                "code": code,
                                "name": "Rejected Employee",
                                "email": email,
                                "status": status,
                                "joinDate": join_date
                            })
                            .to_string(),
                        ))
                        .expect("invalid employee request"),
                )
                .await
                .expect("invalid employee response");
            assert_eq!(rejected.status(), StatusCode::BAD_REQUEST);
        }

        let duplicate_code = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/employees")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "code": "nv-0001",
                            "name": "Duplicate Code",
                            "email": "different@example.test"
                        })
                        .to_string(),
                    ))
                    .expect("duplicate employee request"),
            )
            .await
            .expect("duplicate employee response");
        assert_eq!(duplicate_code.status(), StatusCode::CONFLICT);

        let self_profile = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/employees/me")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("self profile get request"),
            )
            .await
            .expect("self profile get response");
        assert_eq!(self_profile.status(), StatusCode::OK);
        let self_profile_body = axum::body::to_bytes(self_profile.into_body(), 8192)
            .await
            .expect("self profile get body");
        let self_profile: Value =
            serde_json::from_slice(&self_profile_body).expect("self profile get JSON");
        assert_eq!(self_profile["employee"]["id"], "employee-1");
        assert_eq!(self_profile["employee"]["code"], "NV-0001");

        let self_update = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/employees/me")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "department": "Unauthorized Department",
                            "position": "Admin",
                            "status": "Đã nghỉ việc",
                            "joinDate": "1999-01-01",
                            "salaryBase": 1,
                            "phone": "0912345678",
                            "address": "  1 Đường Lê Lợi  "
                        })
                        .to_string(),
                    ))
                    .expect("self profile update request"),
            )
            .await
            .expect("self profile update response");
        assert_eq!(self_update.status(), StatusCode::OK);
        let self_body = axum::body::to_bytes(self_update.into_body(), 8192)
            .await
            .expect("self profile body");
        let self_update: Value = serde_json::from_slice(&self_body).expect("self profile JSON");
        assert_eq!(self_update["employee"]["department"], "Operations");
        assert_eq!(self_update["employee"]["position"], "Engineer");
        assert_eq!(self_update["employee"]["status"], "Chính thức");
        assert_eq!(self_update["employee"]["salaryBase"], 12_000_000);
        assert_eq!(self_update["employee"]["phone"], "0912345678");
        assert_eq!(self_update["employee"]["address"], "1 Đường Lê Lợi");

        let oversized_address = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/employees/me")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({ "address": "x".repeat(513) }).to_string(),
                    ))
                    .expect("oversized employee address request"),
            )
            .await
            .expect("oversized employee address response");
        assert_eq!(oversized_address.status(), StatusCode::BAD_REQUEST);

        let reloaded_profile = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/employees/me")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("reloaded employee profile request"),
            )
            .await
            .expect("reloaded employee profile response");
        let reloaded_body = axum::body::to_bytes(reloaded_profile.into_body(), 8192)
            .await
            .expect("reloaded profile body");
        let reloaded: Value = serde_json::from_slice(&reloaded_body).expect("reloaded profile");
        assert_eq!(reloaded["employee"]["address"], "1 Đường Lê Lợi");

        let updated = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/employees/{created_id}"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Updated Employee",
                            "code": "NV-0002",
                            "email": "updated.employee@example.test",
                            "department": "Finance",
                            "position": "Accountant",
                            "status": "Chính thức",
                            "joinDate": "2026-01-01",
                            "salaryBase": 20000000
                        })
                        .to_string(),
                    ))
                    .expect("update employee request"),
            )
            .await
            .expect("update employee response");
        assert_eq!(updated.status(), StatusCode::OK);
        let updated_body = axum::body::to_bytes(updated.into_body(), 8192)
            .await
            .expect("update employee body");
        let updated: Value = serde_json::from_slice(&updated_body).expect("update employee JSON");
        assert_eq!(updated["employee"]["department"], "Finance");
        assert_eq!(updated["employee"]["salaryBase"], 20_000_000);

        let resend_unconfigured = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/employees/{created_id}/activation"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("activation resend request"),
            )
            .await
            .expect("activation resend response");
        assert_eq!(
            resend_unconfigured.status(),
            StatusCode::SERVICE_UNAVAILABLE
        );
        {
            let db = state.db.lock().await;
            let pending_links: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM activation_tokens WHERE user_id = ?1 AND used_at IS NULL",
                    params![&created_id],
                    |row| row.get(0),
                )
                .expect("pending links remain unchanged");
            assert_eq!(pending_links, 1);
        }
        let retired_link = "activation-link-revoked-on-retirement";
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO activation_tokens (id,user_id,token_hash,issued_at,expires_at,used_at) VALUES ('retirement-link',?1,?2,?3,?4,NULL)",
                params![
                    &created_id,
                    activation_hash(retired_link),
                    Utc::now().to_rfc3339(),
                    (Utc::now() + Duration::hours(24)).to_rfc3339(),
                ],
            )
            .expect("seed activation link for retirement");
        }

        let retired = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/employees/{created_id}"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("retire employee request"),
            )
            .await
            .expect("retire employee response");
        assert_eq!(retired.status(), StatusCode::OK);
        let retired_body = axum::body::to_bytes(retired.into_body(), 8192)
            .await
            .expect("retire employee body");
        let retired: Value = serde_json::from_slice(&retired_body).expect("retire employee JSON");
        assert_eq!(retired["employee"]["status"], "Đã nghỉ việc");
        assert_eq!(retired["employee"]["isActive"], false);
        {
            let db = state.db.lock().await;
            let pending_links: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM activation_tokens WHERE user_id = ?1 AND used_at IS NULL",
                    params![&created_id],
                    |row| row.get(0),
                )
                .expect("retired account has no live activation links");
            assert_eq!(pending_links, 0);
        }

        let authorize_retired = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/activation/authorize")
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "token": retired_link }).to_string()))
                    .expect("retired activation authorization request"),
            )
            .await
            .expect("retired activation authorization response");
        assert_eq!(authorize_retired.status(), StatusCode::GONE);

        let resend_retired = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/employees/{created_id}/activation"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("retired activation request"),
            )
            .await
            .expect("retired activation response");
        assert_eq!(resend_retired.status(), StatusCode::UNPROCESSABLE_ENTITY);
    }

    #[tokio::test]
    async fn employee_file_list_and_folder_creation_use_real_workspace() {
        let (state, user) = test_state();
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO employee_profiles (user_id, employee_code, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
                params![&user.id, "EMP001", &user.created_at],
            )
            .expect("employee profile");
        }
        let app = router(state.clone(), CorsLayer::new());
        let bearer = format!("Bearer {}", issue_token(&state, &user).expect("token"));
        let unauthenticated = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/files?scope=employee")
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);
        let first = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/files?scope=employee")
                    .header(AUTHORIZATION, &bearer)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(first.status(), StatusCode::OK);
        let first_body = axum::body::to_bytes(first.into_body(), 8192)
            .await
            .expect("body");
        let first: Value = serde_json::from_slice(&first_body).expect("JSON");
        let root_id = first["context"]["parentId"]
            .as_str()
            .expect("employee root ID");
        assert!(
            first["data"]
                .as_array()
                .expect("file list")
                .iter()
                .any(|file| { file["name"] == "System" && file["type"] == "dir" })
        );
        let system_id = first["data"]
            .as_array()
            .expect("file list")
            .iter()
            .find(|file| file["name"] == "System")
            .and_then(|file| file["id"].as_str())
            .expect("protected system folder ID")
            .to_owned();

        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/files/folders")
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"name":"Hồ sơ","parentId":root_id,"originModule":"files"})
                            .to_string(),
                    ))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(created.status(), StatusCode::OK);
        let created_body = axum::body::to_bytes(created.into_body(), 8192)
            .await
            .expect("body");
        let created: Value = serde_json::from_slice(&created_body).expect("JSON");
        assert_eq!(created["file"]["name"], "Hồ sơ");
        assert_eq!(created["file"]["parentId"], root_id);
        let folder_id = created["file"]["id"].as_str().expect("folder id");

        let renamed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/files/{folder_id}"))
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"name":"Tài liệu"}).to_string()))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(renamed.status(), StatusCode::OK);
        let renamed_body = axum::body::to_bytes(renamed.into_body(), 8192)
            .await
            .expect("body");
        let renamed: Value = serde_json::from_slice(&renamed_body).expect("JSON");
        assert_eq!(renamed["file"]["id"], folder_id);
        assert_eq!(renamed["file"]["name"], "Tài liệu");

        let duplicate_name = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/files/{folder_id}"))
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"name":"System"}).to_string()))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(duplicate_name.status(), StatusCode::BAD_REQUEST);

        let protected_rename = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/files/{system_id}"))
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"name":"System mới"}).to_string()))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(protected_rename.status(), StatusCode::FORBIDDEN);

        let nested = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files?scope=employee&parentId={folder_id}"))
                    .header(AUTHORIZATION, &bearer)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(nested.status(), StatusCode::OK);
        let nested_body = axum::body::to_bytes(nested.into_body(), 8192)
            .await
            .expect("body");
        let nested: Value = serde_json::from_slice(&nested_body).expect("JSON");
        assert_eq!(nested["context"]["parentId"], folder_id);
        assert_eq!(nested["data"], json!([]));

        let other = User {
            id: "employee-2".to_string(),
            email: "other@example.test".to_string(),
            name: "Other Employee".to_string(),
            role: "USER".to_string(),
            is_active: true,
            created_at: user.created_at.clone(),
            updated_at: user.updated_at.clone(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
                params![
                    &other.id,
                    &other.email,
                    &other.name,
                    &other.role,
                    password_hash("OtherPassword-123!").expect("password hash"),
                    &other.created_at,
                    &other.updated_at,
                ],
            )
            .expect("other user insert");
        }
        let other_bearer = format!("Bearer {}", issue_token(&state, &other).expect("token"));
        let cross_user = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files?scope=employee&parentId={folder_id}"))
                    .header(AUTHORIZATION, &other_bearer)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(cross_user.status(), StatusCode::NOT_FOUND);

        let cross_user_rename = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/files/{folder_id}"))
                    .header(AUTHORIZATION, other_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"name":"Xâm phạm"}).to_string()))
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(cross_user_rename.status(), StatusCode::NOT_FOUND);

        let refreshed = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/files?scope=employee")
                    .header(AUTHORIZATION, &bearer)
                    .body(Body::empty())
                    .expect("request"),
            )
            .await
            .expect("response");
        assert_eq!(refreshed.status(), StatusCode::OK);
        let refreshed_body = axum::body::to_bytes(refreshed.into_body(), 8192)
            .await
            .expect("body");
        let refreshed: Value = serde_json::from_slice(&refreshed_body).expect("JSON");
        assert!(
            refreshed["data"]
                .as_array()
                .expect("file list")
                .iter()
                .any(|file| file["name"] == "Tài liệu" && file["type"] == "dir")
        );
    }

    #[tokio::test]
    async fn file_delete_enforces_protection_owner_and_empty_folder_rules() {
        let (state, employee) = test_state();
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO employee_profiles (user_id, employee_code, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
                params![&employee.id, "EMP-FILE-ACL", &employee.created_at],
            )
            .expect("employee profile");
        }
        let admin = User {
            id: "admin-file-acl".to_owned(),
            email: "admin-file-acl@example.test".to_owned(),
            name: "Files Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        let other_employee = User {
            id: "employee-file-acl-other".to_owned(),
            email: "employee-file-acl-other@example.test".to_owned(),
            name: "Other Employee".to_owned(),
            role: "USER".to_owned(),
            is_active: true,
            created_at: employee.created_at.clone(),
            updated_at: employee.updated_at.clone(),
        };
        {
            let db = state.db.lock().await;
            for user in [&admin, &other_employee] {
                db.execute(
                    "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
                    params![
                        &user.id,
                        &user.email,
                        &user.name,
                        &user.role,
                        password_hash("FilesAclPassword-123!").expect("password hash"),
                        &user.created_at,
                        &user.updated_at,
                    ],
                )
                .expect("additional user insert");
            }
        }

        let app = router(state.clone(), CorsLayer::new());
        let employee_bearer = format!("Bearer {}", issue_token(&state, &employee).expect("token"));
        let admin_bearer = format!("Bearer {}", issue_token(&state, &admin).expect("token"));
        let other_bearer = format!(
            "Bearer {}",
            issue_token(&state, &other_employee).expect("token")
        );

        let root = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/files?scope=employee")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee root request"),
            )
            .await
            .expect("employee root response");
        assert_eq!(root.status(), StatusCode::OK);
        let root_body = axum::body::to_bytes(root.into_body(), 8192)
            .await
            .expect("employee root body");
        let root: Value = serde_json::from_slice(&root_body).expect("employee root JSON");
        let root_id = root["context"]["parentId"]
            .as_str()
            .expect("employee root ID")
            .to_owned();
        let protected_system_id = root["data"]
            .as_array()
            .expect("employee root entries")
            .iter()
            .find(|file| file["name"] == "System")
            .and_then(|file| file["id"].as_str())
            .expect("protected system folder ID")
            .to_owned();

        let protected_delete = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/files/{protected_system_id}"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("protected delete request"),
            )
            .await
            .expect("protected delete response");
        assert_eq!(protected_delete.status(), StatusCode::FORBIDDEN);

        let create_folder = |name: &'static str, parent_id: &str| {
            Request::builder()
                .method(Method::POST)
                .uri("/api/v1/files/folders")
                .header(AUTHORIZATION, &employee_bearer)
                .header(CONTENT_TYPE, "application/json")
                .body(Body::from(
                    json!({"name": name, "parentId": parent_id, "originModule": "files"})
                        .to_string(),
                ))
                .expect("create folder request")
        };
        let parent = app
            .clone()
            .oneshot(create_folder("Có tệp con", &root_id))
            .await
            .expect("parent folder response");
        assert_eq!(parent.status(), StatusCode::OK);
        let parent_body = axum::body::to_bytes(parent.into_body(), 8192)
            .await
            .expect("parent folder body");
        let parent: Value = serde_json::from_slice(&parent_body).expect("parent folder JSON");
        let parent_id = parent["file"]["id"]
            .as_str()
            .expect("parent folder ID")
            .to_owned();
        let child = app
            .clone()
            .oneshot(create_folder("Tệp con", &parent_id))
            .await
            .expect("child folder response");
        assert_eq!(child.status(), StatusCode::OK);

        let nonempty_delete = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/files/{parent_id}"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("nonempty folder delete request"),
            )
            .await
            .expect("nonempty folder delete response");
        assert_eq!(nonempty_delete.status(), StatusCode::BAD_REQUEST);

        let cross_user_delete = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/files/{parent_id}"))
                    .header(AUTHORIZATION, &other_bearer)
                    .body(Body::empty())
                    .expect("cross-user delete request"),
            )
            .await
            .expect("cross-user delete response");
        assert_eq!(cross_user_delete.status(), StatusCode::NOT_FOUND);

        let empty_folder = app
            .clone()
            .oneshot(create_folder("Thư mục trống", &root_id))
            .await
            .expect("empty folder response");
        assert_eq!(empty_folder.status(), StatusCode::OK);
        let empty_folder_body = axum::body::to_bytes(empty_folder.into_body(), 8192)
            .await
            .expect("empty folder body");
        let empty_folder: Value =
            serde_json::from_slice(&empty_folder_body).expect("empty folder JSON");
        let empty_folder_id = empty_folder["file"]["id"]
            .as_str()
            .expect("empty folder ID")
            .to_owned();
        let deleted = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/files/{empty_folder_id}"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("empty folder delete request"),
            )
            .await
            .expect("empty folder delete response");
        assert_eq!(deleted.status(), StatusCode::OK);
        let deleted_body = axum::body::to_bytes(deleted.into_body(), 8192)
            .await
            .expect("empty folder delete body");
        let deleted: Value = serde_json::from_slice(&deleted_body).expect("delete JSON");
        assert_eq!(deleted["deleted"], true);
        {
            let db = state.db.lock().await;
            let deleted_at: Option<String> = db
                .query_row(
                    "SELECT deleted_at FROM file_nodes WHERE id = ?1",
                    params![&empty_folder_id],
                    |row| row.get(0),
                )
                .expect("soft-delete timestamp");
            assert!(deleted_at.is_some(), "delete must retain the node record");
        }

        let admin_root_write = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/files/folders")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"name":"Không ghi vào root"}).to_string()))
                    .expect("admin root write request"),
            )
            .await
            .expect("admin root write response");
        assert_eq!(admin_root_write.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn notifications_are_persisted_and_scoped_to_authenticated_users() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-notifications-1".to_owned(),
            email: "admin-notifications@example.test".to_owned(),
            name: "Notification Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("AdminPassword-123!").expect("password hash"),
                    &admin.created_at,
                    &admin.updated_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );

        let unauthenticated = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/notifications")
                    .body(Body::empty())
                    .expect("unauthenticated notifications request"),
            )
            .await
            .expect("unauthenticated notifications response");
        assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);

        let employee_create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/notifications")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "title": "Thông báo riêng",
                            "message": "Không được gửi sang tài khoản khác.",
                            "userId": admin.id,
                            "link": "/employee/files"
                        })
                        .to_string(),
                    ))
                    .expect("employee create notification request"),
            )
            .await
            .expect("employee create notification response");
        assert_eq!(employee_create.status(), StatusCode::CREATED);
        let employee_create: Value = serde_json::from_slice(
            &axum::body::to_bytes(employee_create.into_body(), 8192)
                .await
                .expect("employee notification body"),
        )
        .expect("employee notification JSON");
        let employee_notification_id = employee_create["notification"]["id"]
            .as_str()
            .expect("employee notification ID")
            .to_owned();
        assert_eq!(employee_create["notification"]["userId"], employee.id);
        assert_eq!(
            employee_create["notification"]["key"],
            employee_notification_id
        );
        assert_eq!(employee_create["notification"]["type"], "system");
        assert_eq!(employee_create["notification"]["read"], false);
        assert_eq!(employee_create["notification"]["unread"], true);
        assert_eq!(employee_create["notification"]["link"], "/employee/files");

        let admin_create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/notifications")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "title": "Thông báo gửi nhân viên",
                            "message": "Nội dung từ quản trị viên.",
                            "type": "approval",
                            "userId": employee.id
                        })
                        .to_string(),
                    ))
                    .expect("admin create notification request"),
            )
            .await
            .expect("admin create notification response");
        assert_eq!(admin_create.status(), StatusCode::CREATED);
        let admin_create: Value = serde_json::from_slice(
            &axum::body::to_bytes(admin_create.into_body(), 8192)
                .await
                .expect("admin notification body"),
        )
        .expect("admin notification JSON");
        let admin_notification_id = admin_create["notification"]["id"]
            .as_str()
            .expect("admin notification ID")
            .to_owned();
        assert_eq!(admin_create["notification"]["userId"], employee.id);
        assert_eq!(admin_create["notification"]["type"], "approval");

        let admin_self_create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/notifications")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"title":"Ghi chú admin","message":"Thông báo cá nhân."}).to_string(),
                    ))
                    .expect("admin self notification request"),
            )
            .await
            .expect("admin self notification response");
        assert_eq!(admin_self_create.status(), StatusCode::CREATED);
        let admin_self_create: Value = serde_json::from_slice(
            &axum::body::to_bytes(admin_self_create.into_body(), 8192)
                .await
                .expect("admin self notification body"),
        )
        .expect("admin self notification JSON");
        let admin_self_notification_id = admin_self_create["notification"]["id"]
            .as_str()
            .expect("admin self notification ID")
            .to_owned();

        let employee_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/notifications")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee notifications list request"),
            )
            .await
            .expect("employee notifications list response");
        assert_eq!(employee_list.status(), StatusCode::OK);
        let employee_list: Value = serde_json::from_slice(
            &axum::body::to_bytes(employee_list.into_body(), 16384)
                .await
                .expect("employee notifications list body"),
        )
        .expect("employee notifications list JSON");
        assert_eq!(employee_list["data"].as_array().unwrap().len(), 2);
        assert!(
            employee_list["data"]
                .as_array()
                .unwrap()
                .iter()
                .all(|notification| notification["userId"] == employee.id)
        );
        assert!(
            employee_list["data"]
                .as_array()
                .unwrap()
                .iter()
                .any(|notification| { notification["id"] == admin_notification_id })
        );

        let admin_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/notifications")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin notifications list request"),
            )
            .await
            .expect("admin notifications list response");
        let admin_list: Value = serde_json::from_slice(
            &axum::body::to_bytes(admin_list.into_body(), 16384)
                .await
                .expect("admin notifications list body"),
        )
        .expect("admin notifications list JSON");
        assert_eq!(admin_list["data"].as_array().unwrap().len(), 1);
        assert!(admin_list["data"][0]["userId"] == admin.id);
        assert_eq!(admin_list["data"][0]["id"], admin_self_notification_id);

        let cross_user_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!(
                        "/api/v1/notifications/{employee_notification_id}/read"
                    ))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("cross-user notification read request"),
            )
            .await
            .expect("cross-user notification read response");
        assert_eq!(cross_user_read.status(), StatusCode::NOT_FOUND);

        let mark_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!(
                        "/api/v1/notifications/{employee_notification_id}/read"
                    ))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("mark notification read request"),
            )
            .await
            .expect("mark notification read response");
        assert_eq!(mark_read.status(), StatusCode::OK);
        let mark_read: Value = serde_json::from_slice(
            &axum::body::to_bytes(mark_read.into_body(), 8192)
                .await
                .expect("mark-read body"),
        )
        .expect("mark-read JSON");
        assert_eq!(mark_read["notification"]["read"], true);
        assert_eq!(mark_read["notification"]["unread"], false);

        let mark_all = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/notifications/mark-all-read")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("mark all notifications request"),
            )
            .await
            .expect("mark all notifications response");
        let mark_all: Value = serde_json::from_slice(
            &axum::body::to_bytes(mark_all.into_body(), 16384)
                .await
                .expect("mark all body"),
        )
        .expect("mark all JSON");
        assert_eq!(mark_all["data"].as_array().unwrap().len(), 2);
        assert!(
            mark_all["data"]
                .as_array()
                .unwrap()
                .iter()
                .all(|item| item["read"] == true)
        );

        let admin_after_mark_all = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/notifications")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin list after employee mark-all request"),
            )
            .await
            .expect("admin list after employee mark-all response");
        let admin_after_mark_all: Value = serde_json::from_slice(
            &axum::body::to_bytes(admin_after_mark_all.into_body(), 8192)
                .await
                .expect("admin list after employee mark-all body"),
        )
        .expect("admin list after employee mark-all JSON");
        assert_eq!(admin_after_mark_all["data"][0]["read"], false);

        let delete_own = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/notifications/{employee_notification_id}"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("delete own notification request"),
            )
            .await
            .expect("delete own notification response");
        assert_eq!(delete_own.status(), StatusCode::OK);
        let employee_after_delete = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/notifications")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee list after own delete request"),
            )
            .await
            .expect("employee list after own delete response");
        let employee_after_delete: Value = serde_json::from_slice(
            &axum::body::to_bytes(employee_after_delete.into_body(), 8192)
                .await
                .expect("employee list after own delete body"),
        )
        .expect("employee list after own delete JSON");
        assert_eq!(employee_after_delete["data"].as_array().unwrap().len(), 1);
        assert_eq!(
            employee_after_delete["data"][0]["id"],
            admin_notification_id
        );

        let cross_user_delete = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!(
                        "/api/v1/notifications/{admin_self_notification_id}"
                    ))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("cross-user notification delete request"),
            )
            .await
            .expect("cross-user notification delete response");
        assert_eq!(cross_user_delete.status(), StatusCode::OK);

        let clear_employee = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri("/api/v1/notifications")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("clear employee notifications request"),
            )
            .await
            .expect("clear employee notifications response");
        assert_eq!(clear_employee.status(), StatusCode::OK);

        let employee_after_clear = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/notifications")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee list after clear request"),
            )
            .await
            .expect("employee list after clear response");
        let employee_after_clear: Value = serde_json::from_slice(
            &axum::body::to_bytes(employee_after_clear.into_body(), 8192)
                .await
                .expect("employee list after clear body"),
        )
        .expect("employee list after clear JSON");
        assert!(employee_after_clear["data"].as_array().unwrap().is_empty());

        let admin_after_employee_clear = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/notifications")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin list after employee clear request"),
            )
            .await
            .expect("admin list after employee clear response");
        let admin_after_employee_clear: Value = serde_json::from_slice(
            &axum::body::to_bytes(admin_after_employee_clear.into_body(), 8192)
                .await
                .expect("admin list after employee clear body"),
        )
        .expect("admin list after employee clear JSON");
        assert_eq!(
            admin_after_employee_clear["data"].as_array().unwrap().len(),
            1
        );
    }

    #[tokio::test]
    async fn system_broadcast_drafts_persist_and_are_admin_only() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-broadcasts-1".to_owned(),
            email: "broadcast-admin@example.test".to_owned(),
            name: "Broadcast Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("BroadcastAdminPassword-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let payload = json!({
            "title": "Bảo trì hệ thống",
            "content": "Cổng sẽ bảo trì tối nay.",
            "type": "maintenance",
            "targetAudience": "Tất cả nhân sự",
            "channels": ["In-app", "Email"]
        });

        let employee_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/system/broadcasts")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee broadcast list request"),
            )
            .await
            .expect("employee broadcast list response");
        assert_eq!(employee_list.status(), StatusCode::FORBIDDEN);

        let employee_generic_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/system_broadcasts")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee generic broadcast list request"),
            )
            .await
            .expect("employee generic broadcast list response");
        assert_eq!(employee_generic_list.status(), StatusCode::FORBIDDEN);

        let employee_create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/system/broadcasts")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("employee broadcast create request"),
            )
            .await
            .expect("employee broadcast create response");
        assert_eq!(employee_create.status(), StatusCode::FORBIDDEN);

        let invalid = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/system/broadcasts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "title":"Bad",
                            "content":"Body",
                            "type":"unknown",
                            "targetAudience":"Tất cả nhân sự",
                            "channels":["In-app"]
                        })
                        .to_string(),
                    ))
                    .expect("invalid broadcast request"),
            )
            .await
            .expect("invalid broadcast response");
        assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);

        let invalid_generic = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/collections/system_broadcasts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "record": {
                                "id":"legacy-bypass",
                                "title":"Bad",
                                "content":"Body",
                                "type":"unknown",
                                "targetAudience":"Tất cả nhân sự",
                                "channels":["In-app"],
                                "sender":"Admin",
                                "createdAt":"2026-10-08 09:00",
                                "readCount":0,
                                "totalRecipients":0,
                                "status":"Đã gửi"
                            }
                        })
                        .to_string(),
                    ))
                    .expect("invalid generic broadcast request"),
            )
            .await
            .expect("invalid generic broadcast response");
        assert_eq!(invalid_generic.status(), StatusCode::BAD_REQUEST);

        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/system/broadcasts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("admin broadcast create request"),
            )
            .await
            .expect("admin broadcast create response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let created: Value = serde_json::from_slice(
            &axum::body::to_bytes(created.into_body(), 8192)
                .await
                .expect("created broadcast body"),
        )
        .expect("created broadcast JSON");
        let id = created["record"]["id"]
            .as_str()
            .expect("broadcast ID")
            .to_owned();
        assert_eq!(created["record"]["type"], "maintenance");
        assert_eq!(created["record"]["sender"], "Broadcast Admin");
        assert_eq!(created["record"]["status"], "Nháp");
        assert_eq!(created["record"]["totalRecipients"], 0);

        {
            let db = state.db.lock().await;
            let persisted: String = db
                .query_row(
                    "SELECT record_json FROM collection_records WHERE scope = 'system_broadcasts' AND record_key = ?1",
                    params![&id],
                    |row| row.get(0),
                )
                .expect("persisted broadcast");
            let persisted: Value = serde_json::from_str(&persisted).expect("persisted JSON");
            assert_eq!(persisted["title"], "Bảo trì hệ thống");
            assert_eq!(persisted["status"], "Nháp");
        }

        let updated = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/system/broadcasts/{id}"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({ "title": "Bảo trì đã cập nhật" }).to_string(),
                    ))
                    .expect("broadcast update request"),
            )
            .await
            .expect("broadcast update response");
        assert_eq!(updated.status(), StatusCode::OK);
        let updated: Value = serde_json::from_slice(
            &axum::body::to_bytes(updated.into_body(), 8192)
                .await
                .expect("updated broadcast body"),
        )
        .expect("updated broadcast JSON");
        assert_eq!(updated["record"]["title"], "Bảo trì đã cập nhật");
        assert_eq!(updated["record"]["status"], "Nháp");

        let deleted_by_employee = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/system/broadcasts/{id}"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee broadcast delete request"),
            )
            .await
            .expect("employee broadcast delete response");
        assert_eq!(deleted_by_employee.status(), StatusCode::FORBIDDEN);

        let listed = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/system/broadcasts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin broadcast list request"),
            )
            .await
            .expect("admin broadcast list response");
        assert_eq!(listed.status(), StatusCode::OK);
        let listed: Value = serde_json::from_slice(
            &axum::body::to_bytes(listed.into_body(), 8192)
                .await
                .expect("admin broadcast list body"),
        )
        .expect("admin broadcast list JSON");
        assert_eq!(listed["data"][0]["id"], id);
        assert_eq!(listed["data"][0]["title"], "Bảo trì đã cập nhật");

        let deleted = app
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/system/broadcasts/{id}"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin broadcast delete request"),
            )
            .await
            .expect("admin broadcast delete response");
        assert_eq!(deleted.status(), StatusCode::OK);
        let db = state.db.lock().await;
        let remaining: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM collection_records WHERE scope = 'system_broadcasts' AND record_key = ?1",
                params![id],
                |row| row.get(0),
            )
            .expect("broadcast count after delete");
        assert_eq!(remaining, 0);
    }

    #[tokio::test]
    async fn activation_email_template_is_admin_only_validated_and_persistent() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-template-1".to_owned(),
            email: "template-admin@example.test".to_owned(),
            name: "Template Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("TemplateAdminPassword-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let path = "/api/v1/system/notification-templates/account-activation";

        let employee_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee template GET"),
            )
            .await
            .expect("employee template GET response");
        assert_eq!(employee_read.status(), StatusCode::FORBIDDEN);

        let initial = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin template GET"),
            )
            .await
            .expect("admin template GET response");
        assert_eq!(initial.status(), StatusCode::OK);
        let initial: Value = serde_json::from_slice(
            &axum::body::to_bytes(initial.into_body(), 8192)
                .await
                .expect("initial template body"),
        )
        .expect("initial template JSON");
        assert_eq!(initial["emailConfigured"], false);
        assert_eq!(initial["template"]["buttonLabel"], "Kích hoạt tài khoản");

        let invalid = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri(path)
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "subject":"",
                            "heading":"Chào mừng",
                            "body":"Nội dung",
                            "buttonLabel":"Kích hoạt",
                            "footer":"Liên kết có hiệu lực 02 ngày"
                        })
                        .to_string(),
                    ))
                    .expect("invalid template PUT"),
            )
            .await
            .expect("invalid template PUT response");
        assert_eq!(invalid.status(), StatusCode::BAD_REQUEST);

        let payload = json!({
            "subject":"Kích hoạt KIYOVN",
            "heading":"Chào mừng nhân sự",
            "body":"Mở liên kết để kích hoạt.",
            "buttonLabel":"Bắt đầu",
            "footer":"Liên kết hết hạn sau 02 ngày."
        });
        let employee_write = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri(path)
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("employee template PUT"),
            )
            .await
            .expect("employee template PUT response");
        assert_eq!(employee_write.status(), StatusCode::FORBIDDEN);

        let saved = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri(path)
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("admin template PUT"),
            )
            .await
            .expect("admin template PUT response");
        assert_eq!(saved.status(), StatusCode::OK);

        let reloaded = app
            .oneshot(
                Request::builder()
                    .uri(path)
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("template reload"),
            )
            .await
            .expect("template reload response");
        let reloaded: Value = serde_json::from_slice(
            &axum::body::to_bytes(reloaded.into_body(), 8192)
                .await
                .expect("reloaded template body"),
        )
        .expect("reloaded template JSON");
        assert_eq!(reloaded["template"]["subject"], "Kích hoạt KIYOVN");
        assert_eq!(reloaded["template"]["buttonLabel"], "Bắt đầu");
        assert_eq!(reloaded["emailConfigured"], false);
        let stored = read_setting(&state, "activation_email_template")
            .await
            .expect("template setting read")
            .expect("template setting exists");
        assert!(stored.contains("Kích hoạt KIYOVN"));
    }

    #[tokio::test]
    async fn meeting_rooms_and_bookings_persist_and_reject_conflicts() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-meetings-1".to_owned(),
            email: "meetings-admin@example.test".to_owned(),
            name: "Meeting Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("MeetingAdminPassword-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );

        let employee_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/meeting-rooms")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee meeting room GET"),
            )
            .await
            .expect("employee meeting room response");
        assert_eq!(employee_list.status(), StatusCode::FORBIDDEN);

        let generic_employee_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/room_bookings")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee generic booking GET"),
            )
            .await
            .expect("employee generic booking response");
        assert_eq!(generic_employee_list.status(), StatusCode::FORBIDDEN);

        let room_input = json!({
            "name":"Phòng Tokyo",
            "location":"Tầng 3",
            "capacity":10,
            "equipment":["Smart TV", "Polycom"]
        });
        let employee_room_create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/meeting-rooms/rooms")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(room_input.to_string()))
                    .expect("employee create room request"),
            )
            .await
            .expect("employee create room response");
        assert_eq!(employee_room_create.status(), StatusCode::FORBIDDEN);

        let created_room = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/meeting-rooms/rooms")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(room_input.to_string()))
                    .expect("admin create room request"),
            )
            .await
            .expect("admin create room response");
        assert_eq!(created_room.status(), StatusCode::CREATED);
        let created_room: Value = serde_json::from_slice(
            &axum::body::to_bytes(created_room.into_body(), 8192)
                .await
                .expect("created room body"),
        )
        .expect("created room JSON");
        let room_key = created_room["room"]["key"]
            .as_str()
            .expect("room key")
            .to_owned();
        assert_eq!(created_room["room"]["status"], "Trống");

        let duplicate_room = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/meeting-rooms/rooms")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"name":"PHÒNG TOKYO","location":"Tầng 3","capacity":10,"equipment":[]}).to_string(),
                    ))
                    .expect("duplicate room request"),
            )
            .await
            .expect("duplicate room response");
        assert_eq!(duplicate_room.status(), StatusCode::CONFLICT);

        let booking_input = json!({
            "roomName":"Phòng Tokyo",
            "meetingTitle":"Lập kế hoạch quý",
            "booker":"Nguyễn An",
            "date":"2026-12-01",
            "timeSlot":"09:00 - 10:00",
            "participantsCount":8
        });
        let employee_booking = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/meeting-rooms/bookings")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(booking_input.to_string()))
                    .expect("employee booking request"),
            )
            .await
            .expect("employee booking response");
        assert_eq!(employee_booking.status(), StatusCode::FORBIDDEN);

        let created_booking = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/meeting-rooms/bookings")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(booking_input.to_string()))
                    .expect("admin booking request"),
            )
            .await
            .expect("admin booking response");
        assert_eq!(created_booking.status(), StatusCode::CREATED);
        let created_booking: Value = serde_json::from_slice(
            &axum::body::to_bytes(created_booking.into_body(), 8192)
                .await
                .expect("created booking body"),
        )
        .expect("created booking JSON");
        let booking_key = created_booking["booking"]["key"]
            .as_str()
            .expect("booking key")
            .to_owned();
        assert_eq!(created_booking["booking"]["booker"], "Nguyễn An");
        assert_eq!(created_booking["booking"]["status"], "Đã xác nhận");
        {
            let db = state.db.lock().await;
            let mut stored: Value = db
                .query_row(
                    "SELECT record_json FROM collection_records WHERE scope = 'room_bookings' AND record_key = ?1",
                    params![&booking_key],
                    |row| row.get::<_, String>(0),
                )
                .map(|serialized| serde_json::from_str(&serialized).expect("stored booking JSON"))
                .expect("stored booking row");
            stored["legacyNote"] = json!("keep-this-field");
            db.execute(
                "UPDATE collection_records SET record_json = ?1 WHERE scope = 'room_bookings' AND record_key = ?2",
                params![stored.to_string(), &booking_key],
            )
            .expect("add legacy extension field");
        }

        let overlap = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/meeting-rooms/bookings")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"roomName":"Phòng Tokyo","meetingTitle":"Cuộc họp khác","booker":"Admin","date":"2026-12-01","timeSlot":"09:30 - 10:30","participantsCount":4}).to_string(),
                    ))
                    .expect("overlap booking request"),
            )
            .await
            .expect("overlap booking response");
        assert_eq!(overlap.status(), StatusCode::CONFLICT);

        let over_capacity = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/meeting-rooms/bookings")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"roomName":"Phòng Tokyo","meetingTitle":"Nhóm lớn","booker":"Admin","date":"2026-12-01","timeSlot":"11:00 - 12:00","participantsCount":11}).to_string(),
                    ))
                    .expect("over-capacity booking request"),
            )
            .await
            .expect("over-capacity booking response");
        assert_eq!(over_capacity.status(), StatusCode::BAD_REQUEST);

        let cancelled = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/meeting-rooms/bookings/{booking_key}"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("cancel booking request"),
            )
            .await
            .expect("cancel booking response");
        assert_eq!(cancelled.status(), StatusCode::OK);
        let cancelled: Value = serde_json::from_slice(
            &axum::body::to_bytes(cancelled.into_body(), 8192)
                .await
                .expect("cancelled booking body"),
        )
        .expect("cancelled booking JSON");
        assert_eq!(cancelled["booking"]["status"], "Đã hủy");
        assert_eq!(cancelled["booking"]["legacyNote"], "keep-this-field");

        let rebooked = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/meeting-rooms/bookings")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"roomName":"Phòng Tokyo","meetingTitle":"Lịch thay thế","booker":"Admin","date":"2026-12-01","timeSlot":"09:00 - 10:00","participantsCount":4}).to_string(),
                    ))
                    .expect("rebook after cancellation request"),
            )
            .await
            .expect("rebook after cancellation response");
        assert_eq!(rebooked.status(), StatusCode::CREATED);

        let generic_write = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/collections/meeting_rooms")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"record":{"key":"bypass-1","name":"Bypass","location":"Floor","capacity":1,"equipment":[],"status":"Trống"}}).to_string(),
                    ))
                    .expect("generic room write request"),
            )
            .await
            .expect("generic room write response");
        assert_eq!(generic_write.status(), StatusCode::BAD_REQUEST);

        let listed = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/meeting-rooms")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin room list request"),
            )
            .await
            .expect("admin room list response");
        assert_eq!(listed.status(), StatusCode::OK);
        let listed: Value = serde_json::from_slice(
            &axum::body::to_bytes(listed.into_body(), 16 * 1024)
                .await
                .expect("room list body"),
        )
        .expect("room list JSON");
        assert_eq!(listed["rooms"].as_array().map(|rows| rows.len()), Some(1));
        assert_eq!(listed["rooms"][0]["key"].as_str(), Some(room_key.as_str()));
        let listed_bookings = listed["bookings"].as_array().expect("booking array");
        assert_eq!(listed_bookings.len(), 2);
        assert!(listed_bookings.iter().any(|booking| {
            booking["key"].as_str() == Some(booking_key.as_str())
                && booking["status"].as_str() == Some("Đã hủy")
        }));
        assert!(listed_bookings.iter().any(|booking| {
            booking["meetingTitle"].as_str() == Some("Lịch thay thế")
                && booking["status"].as_str() == Some("Đã xác nhận")
        }));
    }

    #[tokio::test]
    async fn file_upload_download_round_trip_preserves_bytes_and_owner_scope() {
        struct TestStorage(std::path::PathBuf);
        impl Drop for TestStorage {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }

        let (mut state, user) = test_state();
        let storage_path = std::env::temp_dir().join(format!("kiyo-files-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&storage_path).expect("test storage directory");
        let _storage = TestStorage(storage_path.clone());
        *Arc::get_mut(&mut state.storage_dir).expect("unique storage path") = storage_path;
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO employee_profiles (user_id, employee_code, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
                params![&user.id, "EMP-FILE", &user.created_at],
            )
            .expect("employee profile");
        }
        let app = router(state.clone(), CorsLayer::new());
        let bearer = format!("Bearer {}", issue_token(&state, &user).expect("token"));
        let payload = {
            let mut bytes = b"Kiyo upload/download integration test\0\xFF\n".to_vec();
            bytes.resize(3 * 1024 * 1024, 0x5A);
            bytes
        };

        let unauthenticated_upload = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/files/upload")
                    .body(Body::from(payload.to_vec()))
                    .expect("unauthenticated upload request"),
            )
            .await
            .expect("unauthenticated upload response");
        assert_eq!(unauthenticated_upload.status(), StatusCode::UNAUTHORIZED);

        let listing = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/files?scope=employee")
                    .header(AUTHORIZATION, &bearer)
                    .body(Body::empty())
                    .expect("file list request"),
            )
            .await
            .expect("file list response");
        assert_eq!(listing.status(), StatusCode::OK);
        let listing_body = axum::body::to_bytes(listing.into_body(), 8192)
            .await
            .expect("file list body");
        let listing: Value = serde_json::from_slice(&listing_body).expect("file list JSON");
        let parent_id = listing["context"]["parentId"]
            .as_str()
            .expect("employee file directory ID");

        let rejected_upload = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/files/upload")
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/octet-stream")
                    .header("x-file-name", percent_encode_filename("báo cáo.bin"))
                    .header("x-parent-id", parent_id)
                    .header("x-origin-module", "employee-files")
                    .body(Body::from(payload.to_vec()))
                    .expect("disallowed employee upload request"),
            )
            .await
            .expect("disallowed employee upload response");
        assert_eq!(rejected_upload.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let uploaded = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/files/upload")
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/octet-stream")
                    .header("x-file-name", percent_encode_filename("báo cáo.pdf"))
                    .header("x-parent-id", parent_id)
                    .header("x-origin-module", "employee-files")
                    .body(Body::from(payload.to_vec()))
                    .expect("upload request"),
            )
            .await
            .expect("upload response");
        assert_eq!(uploaded.status(), StatusCode::OK);
        let uploaded_body = axum::body::to_bytes(uploaded.into_body(), 8192)
            .await
            .expect("upload response body");
        let uploaded: Value = serde_json::from_slice(&uploaded_body).expect("upload JSON");
        let file = &uploaded["file"];
        assert_eq!(file["name"], "báo cáo.pdf");
        assert_eq!(file["type"], "file");
        assert_eq!(file["mime"], "application/octet-stream");
        assert_eq!(file["sizeBytes"].as_u64(), Some(payload.len() as u64));
        assert_eq!(file["originModule"], "employee-files");
        let file_id = file["id"].as_str().expect("uploaded file ID");

        let downloaded = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files/{file_id}/download"))
                    .header(AUTHORIZATION, &bearer)
                    .body(Body::empty())
                    .expect("download request"),
            )
            .await
            .expect("download response");
        assert_eq!(downloaded.status(), StatusCode::OK);
        assert_eq!(
            downloaded.headers()[CONTENT_TYPE],
            "application/octet-stream"
        );
        let downloaded = axum::body::to_bytes(downloaded.into_body(), 4 * 1024 * 1024)
            .await
            .expect("download body");
        assert_eq!(downloaded.as_ref(), payload);

        let other = User {
            id: "employee-file-other".to_owned(),
            email: "other-file@example.test".to_owned(),
            name: "Other Employee".to_owned(),
            role: "USER".to_owned(),
            is_active: true,
            created_at: user.created_at.clone(),
            updated_at: user.updated_at.clone(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
                params![
                    &other.id,
                    &other.email,
                    &other.name,
                    &other.role,
                    password_hash("OtherPassword-123!").expect("password hash"),
                    &other.created_at,
                    &other.updated_at,
                ],
            )
            .expect("other user insert");
        }
        let other_bearer = format!("Bearer {}", issue_token(&state, &other).expect("token"));
        let cross_user_download = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files/{file_id}/download"))
                    .header(AUTHORIZATION, &other_bearer)
                    .body(Body::empty())
                    .expect("cross-user download request"),
            )
            .await
            .expect("cross-user download response");
        assert_eq!(cross_user_download.status(), StatusCode::NOT_FOUND);

        let replacement_payload = {
            let mut bytes = b"Replaced file content, retained original name\0\xFE".to_vec();
            bytes.resize(3 * 1024 * 1024, 0xA5);
            bytes
        };
        let cross_user_content_update = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri(format!("/api/v1/files/{file_id}/content"))
                    .header(AUTHORIZATION, &other_bearer)
                    .header(CONTENT_TYPE, "text/plain; charset=utf-8")
                    .body(Body::from(replacement_payload.clone()))
                    .expect("cross-user file content update request"),
            )
            .await
            .expect("cross-user file content update response");
        assert_eq!(cross_user_content_update.status(), StatusCode::NOT_FOUND);

        let updated_file = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri(format!("/api/v1/files/{file_id}/content"))
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "text/plain; charset=utf-8")
                    .body(Body::from(replacement_payload.clone()))
                    .expect("file content update request"),
            )
            .await
            .expect("file content update response");
        assert_eq!(updated_file.status(), StatusCode::OK);
        let updated_body = axum::body::to_bytes(updated_file.into_body(), 8192)
            .await
            .expect("updated file response body");
        let updated: Value = serde_json::from_slice(&updated_body).expect("updated file JSON");
        assert_eq!(updated["file"]["id"], file_id);
        assert_eq!(updated["file"]["name"], "báo cáo.pdf");
        assert_eq!(updated["file"]["mime"], "text/plain; charset=utf-8");
        assert_eq!(
            updated["file"]["sizeBytes"].as_u64(),
            Some(replacement_payload.len() as u64)
        );

        let updated_download = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files/{file_id}/download"))
                    .header(AUTHORIZATION, &bearer)
                    .body(Body::empty())
                    .expect("updated file download request"),
            )
            .await
            .expect("updated file download response");
        assert_eq!(updated_download.status(), StatusCode::OK);
        assert_eq!(
            updated_download.headers()[CONTENT_TYPE],
            "text/plain; charset=utf-8"
        );
        let updated_download = axum::body::to_bytes(updated_download.into_body(), 4 * 1024 * 1024)
            .await
            .expect("updated file download body");
        assert_eq!(updated_download.as_ref(), replacement_payload);

        let empty_share = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files/{file_id}/share"))
                    .header(AUTHORIZATION, &bearer)
                    .body(Body::empty())
                    .expect("file share lookup request"),
            )
            .await
            .expect("file share lookup response");
        assert_eq!(empty_share.status(), StatusCode::OK);
        let empty_share_body = axum::body::to_bytes(empty_share.into_body(), 8192)
            .await
            .expect("empty share body");
        let empty_share: Value = serde_json::from_slice(&empty_share_body).expect("share JSON");
        assert!(empty_share["share"].is_null());

        let created_share = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/files/{file_id}/share"))
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"isActive":true}"#))
                    .expect("create file share request"),
            )
            .await
            .expect("create file share response");
        assert_eq!(created_share.status(), StatusCode::OK);
        let created_share_body = axum::body::to_bytes(created_share.into_body(), 8192)
            .await
            .expect("created share body");
        let created_share: Value =
            serde_json::from_slice(&created_share_body).expect("created share JSON");
        let first_token = created_share["share"]["token"]
            .as_str()
            .expect("share token");
        assert_eq!(first_token.len(), 36);
        assert_eq!(
            created_share["share"]["url"],
            format!("/files/share?token={first_token}")
        );

        let public_share = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files/share/{first_token}"))
                    .body(Body::empty())
                    .expect("public file share request"),
            )
            .await
            .expect("public file share response");
        assert_eq!(public_share.status(), StatusCode::OK);
        let public_share_body = axum::body::to_bytes(public_share.into_body(), 8192)
            .await
            .expect("public share body");
        let public_share: Value =
            serde_json::from_slice(&public_share_body).expect("public share JSON");
        assert_eq!(public_share["share"]["file"]["name"], "báo cáo.pdf");

        let public_download = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files/share/{first_token}/download"))
                    .body(Body::empty())
                    .expect("public file download request"),
            )
            .await
            .expect("public file download response");
        assert_eq!(public_download.status(), StatusCode::OK);
        assert_eq!(
            public_download.headers()[CONTENT_TYPE],
            "text/plain; charset=utf-8"
        );
        assert_eq!(
            public_download.headers()["x-content-type-options"],
            "nosniff"
        );
        let public_download = axum::body::to_bytes(public_download.into_body(), 4 * 1024 * 1024)
            .await
            .expect("public download body");
        assert_eq!(public_download.as_ref(), replacement_payload);

        let cross_user_share_update = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/files/{file_id}/share"))
                    .header(AUTHORIZATION, &other_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"isActive":false}"#))
                    .expect("cross-user share update request"),
            )
            .await
            .expect("cross-user share update response");
        assert_eq!(cross_user_share_update.status(), StatusCode::NOT_FOUND);

        let rotated_share = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/files/{file_id}/share"))
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"isActive":true,"regenerate":true}"#))
                    .expect("rotate file share request"),
            )
            .await
            .expect("rotate file share response");
        assert_eq!(rotated_share.status(), StatusCode::OK);
        let rotated_body = axum::body::to_bytes(rotated_share.into_body(), 8192)
            .await
            .expect("rotated share body");
        let rotated: Value = serde_json::from_slice(&rotated_body).expect("rotated share JSON");
        let current_token = rotated["share"]["token"].as_str().expect("current token");
        assert_ne!(current_token, first_token);

        let old_link = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files/share/{first_token}"))
                    .body(Body::empty())
                    .expect("old public share request"),
            )
            .await
            .expect("old public share response");
        assert_eq!(old_link.status(), StatusCode::NOT_FOUND);

        let disabled_share = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/files/{file_id}/share"))
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"isActive":false}"#))
                    .expect("disable file share request"),
            )
            .await
            .expect("disable file share response");
        assert_eq!(disabled_share.status(), StatusCode::OK);

        let inactive_link = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files/share/{current_token}"))
                    .body(Body::empty())
                    .expect("inactive public share request"),
            )
            .await
            .expect("inactive public share response");
        assert_eq!(inactive_link.status(), StatusCode::NOT_FOUND);

        let reenabled_share = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/files/{file_id}/share"))
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"isActive":true}"#))
                    .expect("re-enable file share request"),
            )
            .await
            .expect("re-enable file share response");
        assert_eq!(reenabled_share.status(), StatusCode::OK);

        let stored_path = state.storage_dir.join(format!("{file_id}.bin"));
        assert!(stored_path.is_file(), "uploaded bytes should be persisted");
        assert_eq!(
            std::fs::read(&stored_path).expect("updated stored file bytes"),
            replacement_payload
        );
        let deleted = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/files/{file_id}"))
                    .header(AUTHORIZATION, &bearer)
                    .body(Body::empty())
                    .expect("file delete request"),
            )
            .await
            .expect("file delete response");
        assert_eq!(deleted.status(), StatusCode::OK);
        let deleted_body = axum::body::to_bytes(deleted.into_body(), 8192)
            .await
            .expect("file delete body");
        let deleted: Value = serde_json::from_slice(&deleted_body).expect("delete JSON");
        assert_eq!(deleted["deleted"], true);
        assert!(
            stored_path.is_file(),
            "soft delete must retain stored bytes"
        );

        let hidden_from_download = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files/{file_id}/download"))
                    .header(AUTHORIZATION, &bearer)
                    .body(Body::empty())
                    .expect("deleted file download request"),
            )
            .await
            .expect("deleted file download response");
        assert_eq!(hidden_from_download.status(), StatusCode::NOT_FOUND);

        let deleted_public_share = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files/share/{current_token}"))
                    .body(Body::empty())
                    .expect("deleted public share request"),
            )
            .await
            .expect("deleted public share response");
        assert_eq!(deleted_public_share.status(), StatusCode::NOT_FOUND);

        let refreshed_listing = app
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri(format!("/api/v1/files?scope=employee&parentId={parent_id}"))
                    .header(AUTHORIZATION, &bearer)
                    .body(Body::empty())
                    .expect("post-delete file list request"),
            )
            .await
            .expect("post-delete file list response");
        assert_eq!(refreshed_listing.status(), StatusCode::OK);
        let refreshed_body = axum::body::to_bytes(refreshed_listing.into_body(), 8192)
            .await
            .expect("post-delete file list body");
        let refreshed: Value = serde_json::from_slice(&refreshed_body).expect("file list JSON");
        assert!(
            !refreshed["data"]
                .as_array()
                .expect("file list")
                .iter()
                .any(|entry| entry["id"] == file_id)
        );
    }

    #[tokio::test]
    async fn asset_materials_generic_collection_keeps_legacy_stock_records_persistent() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-materials".to_owned(),
            email: "admin.materials@example.test".to_owned(),
            name: "Materials Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("MaterialsAdmin-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let record = json!({
            "key":"mat-legacy-001",
            "materialCode":"LK-SSD-001",
            "materialName":"Ổ SSD Enterprise",
            "unit":"Ổ",
            "stockQty":5,
            "minThreshold":2,
            "maxThreshold":20,
            "unitPrice":3500000,
            "status":"Đủ tồn kho an toàn",
            "stockHistory":[{"id":"old-1","type":"Nhập kho","qty":5,"legacyHistoryField":"keep"}],
            "legacyMaterialField":{"source":"legacy"}
        });

        let denied = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/collections/asset_materials")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"record":record.clone()}).to_string()))
                    .expect("employee create request"),
            )
            .await
            .expect("employee create response");
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/collections/asset_materials")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"record":record.clone()}).to_string()))
                    .expect("admin create request"),
            )
            .await
            .expect("admin create response");
        assert_eq!(created.status(), StatusCode::CREATED);

        let patched = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/collections/asset_materials/mat-legacy-001")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"patch":{
                            "stockQty":2,
                            "status":"Cảnh báo sắp hết (Dưới mức tối thiểu)",
                            "stockHistory":[
                                {"id":"new-2","type":"Xuất kho thay thế","qty":3},
                                {"id":"old-1","type":"Nhập kho","qty":5,"legacyHistoryField":"keep"}
                            ]
                        }})
                        .to_string(),
                    ))
                    .expect("stock patch request"),
            )
            .await
            .expect("stock patch response");
        assert_eq!(patched.status(), StatusCode::OK);

        let listed = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/asset_materials")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee list request"),
            )
            .await
            .expect("employee list response");
        assert_eq!(listed.status(), StatusCode::OK);
        let listed: Value = serde_json::from_slice(
            &axum::body::to_bytes(listed.into_body(), 16 * 1024)
                .await
                .expect("materials response body"),
        )
        .expect("materials response JSON");
        assert_eq!(listed["data"][0]["stockQty"], 2);
        assert_eq!(listed["data"][0]["legacyMaterialField"]["source"], "legacy");
        assert_eq!(
            listed["data"][0]["stockHistory"][1]["legacyHistoryField"],
            "keep"
        );
        assert_eq!(listed["revision"].as_str().unwrap().len(), 64);
        let db = state.db.lock().await;
        let audit_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM audit_events WHERE resource_scope = 'asset_materials'",
                [],
                |row| row.get(0),
            )
            .expect("material audit count");
        assert_eq!(
            audit_count, 2,
            "legacy POST/PATCH requests are still accepted and audited"
        );
    }

    #[tokio::test]
    async fn asset_material_revision_prevents_stale_stock_overwrite_and_audits_atomically() {
        let (state, _) = test_state();
        let admin = User {
            id: "admin-materials-revision".to_owned(),
            email: "materials.revision@example.test".to_owned(),
            name: "Materials Revision Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("MaterialsRevisionAdmin-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let first_record = json!({
            "key":"mat-revision-001",
            "materialCode":"LK-REV-001",
            "materialName":"SSD revision test",
            "stockQty":5,
            "minThreshold":2,
            "stockHistory":[{"id":"initial","type":"Nhập kho","qty":5}],
            "legacyField":{"preserve":true}
        });
        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/collections/asset_materials")
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"record":first_record}).to_string()))
                    .expect("first material create request"),
            )
            .await
            .expect("first material create response");
        assert_eq!(created.status(), StatusCode::CREATED);

        let first_snapshot = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/asset_materials")
                    .header(AUTHORIZATION, &bearer)
                    .body(Body::empty())
                    .expect("first material list request"),
            )
            .await
            .expect("first material list response");
        let first_snapshot: Value = serde_json::from_slice(
            &axum::body::to_bytes(first_snapshot.into_body(), 16 * 1024)
                .await
                .expect("first material list body"),
        )
        .expect("first material list JSON");
        let stale_revision = first_snapshot["revision"]
            .as_str()
            .expect("asset_materials revision")
            .to_owned();
        assert_eq!(stale_revision.len(), 64);

        let second_created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/collections/asset_materials")
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "record": {
                                "key":"mat-revision-002",
                                "materialCode":"LK-REV-002",
                                "materialName":"Second material",
                                "stockQty":3,
                                "stockHistory":[]
                            },
                            "expectedRevision":stale_revision
                        })
                        .to_string(),
                    ))
                    .expect("revisioned second material create request"),
            )
            .await
            .expect("revisioned second material create response");
        assert_eq!(second_created.status(), StatusCode::CREATED);
        let second_created: Value = serde_json::from_slice(
            &axum::body::to_bytes(second_created.into_body(), 16 * 1024)
                .await
                .expect("second create body"),
        )
        .expect("second create JSON");
        let current_revision = second_created["revision"]
            .as_str()
            .expect("revision on create response")
            .to_owned();
        assert_ne!(current_revision, stale_revision);

        let stale_patch = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/collections/asset_materials/mat-revision-001")
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "patch":{"stockQty":1},
                            "expectedRevision":stale_revision
                        })
                        .to_string(),
                    ))
                    .expect("stale material patch request"),
            )
            .await
            .expect("stale material patch response");
        assert_eq!(stale_patch.status(), StatusCode::CONFLICT);

        let fresh_patch = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/collections/asset_materials/mat-revision-001")
                    .header(AUTHORIZATION, &bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "patch": {
                                "stockQty":4,
                                "stockHistory":[
                                    {"id":"move-1","type":"Xuất kho thay thế","ticketCode":"XK-REV-1","qty":1},
                                    {"id":"initial","type":"Nhập kho","qty":5}
                                ]
                            },
                            "expectedRevision":current_revision
                        })
                        .to_string(),
                    ))
                    .expect("fresh material patch request"),
            )
            .await
            .expect("fresh material patch response");
        assert_eq!(fresh_patch.status(), StatusCode::OK);
        let fresh_patch: Value = serde_json::from_slice(
            &axum::body::to_bytes(fresh_patch.into_body(), 16 * 1024)
                .await
                .expect("fresh patch body"),
        )
        .expect("fresh patch JSON");
        assert_ne!(fresh_patch["revision"], current_revision);
        assert_eq!(fresh_patch["record"]["legacyField"]["preserve"], true);

        let db = state.db.lock().await;
        let mut statement = db
            .prepare(
                "SELECT action, resource_scope, resource_id, details_json FROM audit_events WHERE resource_scope = 'asset_materials' ORDER BY created_at ASC, id ASC",
            )
            .expect("material audit query");
        let events = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .expect("material audit rows")
            .collect::<Result<Vec<_>, _>>()
            .expect("material audit collection");
        assert_eq!(
            events.len(),
            3,
            "the rejected stale patch must not append audit"
        );
        assert_eq!(events[0].0, "create");
        assert_eq!(events[1].0, "create");
        assert_eq!(events[2].0, "update");
        assert_eq!(events[2].1, "asset_materials");
        assert_eq!(events[2].2, "mat-revision-001");
        let details: Value = serde_json::from_str(&events[2].3).expect("update audit details");
        assert_eq!(details["stockQtyBefore"], 5);
        assert_eq!(details["stockQtyAfter"], 4);
        assert_eq!(details["movementType"], "Xuất kho thay thế");
        assert_eq!(details["ticketCode"], "XK-REV-1");
    }

    #[tokio::test]
    async fn asset_collection_is_revisioned_persistent_and_admin_write_only() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-assets".to_owned(),
            email: "admin.assets@example.test".to_owned(),
            name: "Asset Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("AssetsAdmin-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );

        let initial = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/asset_items")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee asset list request"),
            )
            .await
            .expect("employee asset list response");
        assert_eq!(initial.status(), StatusCode::OK);
        let initial: Value = serde_json::from_slice(
            &axum::body::to_bytes(initial.into_body(), 16 * 1024)
                .await
                .expect("initial asset body"),
        )
        .expect("initial asset list JSON");
        let revision = initial["revision"]
            .as_str()
            .expect("initial revision")
            .to_owned();
        assert_eq!(revision.len(), 64);

        let asset = json!({
            "key":"asset-001",
            "code":"TS-001",
            "barcode":"89360010001",
            "name":"Máy tính xách tay",
            "category":"Thiết bị IT",
            "originalPrice":24000000,
            "depreciationMonths":36,
            "accumulatedDepreciation":2000000,
            "netBookValue":22000000,
            "status":"Trong kho",
            "legacyTag":{"source":"localStorage"}
        });

        let missing_revision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/asset_items")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"records":[asset.clone()]}).to_string()))
                    .expect("asset write without revision request"),
            )
            .await
            .expect("asset write without revision response");
        assert_eq!(missing_revision.status(), StatusCode::BAD_REQUEST);

        let saved = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/asset_items")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"records":[asset.clone()],"expectedRevision":revision}).to_string(),
                    ))
                    .expect("asset write request"),
            )
            .await
            .expect("asset write response");
        assert_eq!(saved.status(), StatusCode::OK);

        let persisted = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/asset_items")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("persisted asset list request"),
            )
            .await
            .expect("persisted asset list response");
        assert_eq!(persisted.status(), StatusCode::OK);
        let persisted: Value = serde_json::from_slice(
            &axum::body::to_bytes(persisted.into_body(), 16 * 1024)
                .await
                .expect("persisted asset body"),
        )
        .expect("persisted asset JSON");
        let current_revision = persisted["revision"]
            .as_str()
            .expect("current revision")
            .to_owned();
        assert_eq!(persisted["data"][0]["legacyTag"]["source"], "localStorage");

        let stale_write = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/asset_items")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"records":[],"expectedRevision":revision}).to_string(),
                    ))
                    .expect("stale asset write request"),
            )
            .await
            .expect("stale asset write response");
        assert_eq!(stale_write.status(), StatusCode::CONFLICT);

        let employee_write = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/asset_items")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"records":[],"expectedRevision":current_revision}).to_string(),
                    ))
                    .expect("employee asset write request"),
            )
            .await
            .expect("employee asset write response");
        assert_eq!(employee_write.status(), StatusCode::FORBIDDEN);

        let duplicate_keys = app
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/asset_items")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "records":[asset.clone(), asset],
                            "expectedRevision":current_revision
                        })
                        .to_string(),
                    ))
                    .expect("duplicate asset keys request"),
            )
            .await
            .expect("duplicate asset keys response");
        assert_eq!(duplicate_keys.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn asset_allocations_are_revisioned_scoped_and_acknowledged_by_the_right_actor() {
        let (state, employee) = test_state();
        let now = Utc::now().to_rfc3339();
        let other_employee = User {
            id: "employee-2".to_owned(),
            email: "employee2@example.test".to_owned(),
            name: "Other Employee".to_owned(),
            role: "USER".to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = User {
            id: "admin-asset-allocations".to_owned(),
            email: "admin.asset-allocations@example.test".to_owned(),
            name: "Asset Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) \
                 VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    other_employee.id,
                    other_employee.email,
                    other_employee.name,
                    other_employee.role,
                    password_hash("OtherAssetsUser-123!").expect("other employee password hash"),
                    now,
                ],
            )
            .expect("other employee insert");
            for (user, code) in [(&employee, "EMP-1"), (&other_employee, "EMP-2")] {
                db.execute(
                    "INSERT INTO employee_profiles (user_id,employee_code,department,position,employment_status,created_at,updated_at) \
                     VALUES (?1,?2,'Kỹ thuật','Nhân viên','Chính thức',?3,?3)",
                    params![user.id, code, now],
                )
                .expect("employee profile insert");
            }
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) \
                 VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    admin.id,
                    admin.email,
                    admin.name,
                    admin.role,
                    password_hash("AssetsAdmin-123!").expect("admin password hash"),
                    now,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let other_bearer = format!(
            "Bearer {}",
            issue_token(&state, &other_employee).expect("other employee token")
        );
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );

        let employee_generic_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/asset_allocations")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee generic list request"),
            )
            .await
            .expect("employee generic list response");
        assert_eq!(employee_generic_list.status(), StatusCode::FORBIDDEN);

        let initial = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/asset_allocations")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin allocation list request"),
            )
            .await
            .expect("admin allocation list response");
        assert_eq!(initial.status(), StatusCode::OK);
        let initial: Value = serde_json::from_slice(
            &axum::body::to_bytes(initial.into_body(), 16 * 1024)
                .await
                .expect("initial allocation body"),
        )
        .expect("initial allocation JSON");
        let revision = initial["revision"]
            .as_str()
            .expect("allocation revision")
            .to_owned();
        assert_eq!(revision.len(), 64);

        let issue = json!({
            "key":"allocation-employee-1",
            "type":"Cấp phát",
            "ticketCode":"CP-TEST-001",
            "assetCode":"TS-001",
            "assetName":"Laptop",
            "employeeId":employee.id,
            "employeeCode":"EMP-1",
            "employeeName":"Employee",
            "status":"Chờ nhân viên ký xác nhận",
            "signedByReceiver":false,
            "legacyExtra":{"keep":true}
        });
        let other_issue = json!({
            "key":"allocation-employee-2",
            "type":"Cấp phát",
            "ticketCode":"CP-TEST-002",
            "assetCode":"TS-002",
            "assetName":"Monitor",
            "employeeId":other_employee.id,
            "employeeCode":"EMP-2",
            "employeeName":"Other Employee",
            "status":"Chờ nhân viên ký xác nhận",
            "signedByReceiver":false
        });
        let return_record = json!({
            "key":"allocation-return-1",
            "type":"Thu hồi",
            "ticketCode":"TH-TEST-001",
            "assetCode":"TS-003",
            "assetName":"Keyboard",
            "employeeId":employee.id,
            "employeeCode":"EMP-1",
            "employeeName":"Employee",
            "status":"Chờ xác nhận thu hồi",
            "signedByReceiver":false
        });
        let saved = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/asset_allocations")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "records":[issue.clone(),other_issue,return_record],
                            "expectedRevision":revision
                        })
                        .to_string(),
                    ))
                    .expect("save allocation records request"),
            )
            .await
            .expect("save allocation records response");
        assert_eq!(saved.status(), StatusCode::OK);

        let mine = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/employee/asset-allocations")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee allocation list request"),
            )
            .await
            .expect("employee allocation list response");
        assert_eq!(mine.status(), StatusCode::OK);
        let mine: Value = serde_json::from_slice(
            &axum::body::to_bytes(mine.into_body(), 64 * 1024)
                .await
                .expect("employee allocation body"),
        )
        .expect("employee allocation JSON");
        assert_eq!(mine["data"].as_array().map(Vec::len), Some(2));
        assert!(
            mine["data"]
                .as_array()
                .unwrap()
                .iter()
                .all(|record| { record["employeeCode"] == "EMP-1" })
        );

        let wrong_owner_ack = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/employee/asset-allocations/allocation-employee-1/acknowledge")
                    .header(AUTHORIZATION, &other_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .expect("wrong owner acknowledgement request"),
            )
            .await
            .expect("wrong owner acknowledgement response");
        assert_eq!(wrong_owner_ack.status(), StatusCode::NOT_FOUND);

        let acknowledged = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/employee/asset-allocations/allocation-employee-1/acknowledge")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .expect("employee acknowledgement request"),
            )
            .await
            .expect("employee acknowledgement response");
        assert_eq!(acknowledged.status(), StatusCode::OK);
        let acknowledged: Value = serde_json::from_slice(
            &axum::body::to_bytes(acknowledged.into_body(), 32 * 1024)
                .await
                .expect("acknowledgement body"),
        )
        .expect("acknowledgement JSON");
        assert_eq!(acknowledged["allocation"]["status"], "Đã bàn giao hoàn tất");
        assert_eq!(acknowledged["allocation"]["receivedByAccount"], true);
        assert_eq!(acknowledged["allocation"]["signedByReceiver"], false);
        assert_eq!(acknowledged["allocation"]["legacyExtra"]["keep"], true);

        let signed_again = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/employee/asset-allocations/allocation-employee-1/acknowledge")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .expect("repeat acknowledgement request"),
            )
            .await
            .expect("repeat acknowledgement response");
        assert_eq!(signed_again.status(), StatusCode::CONFLICT);

        let warehouse_receipt = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/assets/allocations/allocation-return-1/receive")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from("{}"))
                    .expect("warehouse receipt request"),
            )
            .await
            .expect("warehouse receipt response");
        assert_eq!(warehouse_receipt.status(), StatusCode::OK);
        let warehouse_receipt: Value = serde_json::from_slice(
            &axum::body::to_bytes(warehouse_receipt.into_body(), 32 * 1024)
                .await
                .expect("warehouse receipt body"),
        )
        .expect("warehouse receipt JSON");
        assert_eq!(
            warehouse_receipt["allocation"]["status"],
            "Đã thu hồi về kho"
        );
        assert_eq!(
            warehouse_receipt["allocation"]["warehouseReceivedByUserId"],
            admin.id
        );
        assert_eq!(warehouse_receipt["allocation"]["signedByReceiver"], false);

        let audit_count: i64 = state
            .db
            .lock()
            .await
            .query_row(
                "SELECT COUNT(*) FROM audit_events WHERE resource_scope = 'asset_allocations'",
                [],
                |row| row.get(0),
            )
            .expect("allocation audit events");
        assert_eq!(audit_count, 2);
    }

    #[tokio::test]
    async fn asset_transfers_use_authenticated_transactional_lifecycle_and_audit() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-asset-transfers".to_owned(),
            email: "admin.asset-transfers@example.test".to_owned(),
            name: "Transfer Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) \
                 VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("TransferAdmin-123!").expect("admin password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin user insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );

        let employee_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/assets/transfers")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee transfer list request"),
            )
            .await
            .expect("employee transfer list response");
        assert_eq!(employee_list.status(), StatusCode::FORBIDDEN);

        let payload = json!({
            "transferCode":"DC-2026-TEST-01",
            "assetCode":"ASSET-01",
            "assetName":"Máy chủ thử nghiệm",
            "category":"Máy chủ",
            "serialNo":"SERIAL-01",
            "originalPrice":null,
            "netBookValue":null,
            "fromLocation":"Hà Nội",
            "fromDepartment":"IT",
            "fromCustodian":"Người bàn giao",
            "toLocation":"TP.HCM",
            "toDepartment":"Operations",
            "toCustodian":"Người phụ trách dự kiến",
            "carrierName":"Nhà vận chuyển thử nghiệm",
            "trackingCode":"",
            "shippingCost":0,
            "transferDate":"2026-10-09",
            "expectedDeliveryDate":"2026-10-10",
            "reason":"Điều chuyển phục vụ vận hành",
            "condition":"Đóng gói nguyên vẹn",
            "notes":""
        });
        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/transfers")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("create transfer request"),
            )
            .await
            .expect("create transfer response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let created: Value = serde_json::from_slice(
            &axum::body::to_bytes(created.into_body(), 32 * 1024)
                .await
                .expect("created transfer body"),
        )
        .expect("created transfer JSON");
        let transfer_key = created["transfer"]["key"]
            .as_str()
            .expect("transfer key")
            .to_owned();
        assert_eq!(created["transfer"]["status"], "Chờ phê duyệt");
        assert_eq!(created["transfer"]["createdByUserId"], admin.id);
        assert!(
            created["revision"]
                .as_str()
                .is_some_and(|value| value.len() == 64)
        );

        let admin_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/assets/transfers")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin transfer list request"),
            )
            .await
            .expect("admin transfer list response");
        assert_eq!(admin_list.status(), StatusCode::OK);
        let admin_list: Value = serde_json::from_slice(
            &axum::body::to_bytes(admin_list.into_body(), 32 * 1024)
                .await
                .expect("admin transfer list body"),
        )
        .expect("admin transfer list JSON");
        assert_eq!(admin_list["data"].as_array().map(Vec::len), Some(1));
        assert_eq!(admin_list["data"][0]["key"], transfer_key);
        assert_eq!(admin_list["revision"], created["revision"]);

        let duplicate = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/transfers")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("duplicate transfer request"),
            )
            .await
            .expect("duplicate transfer response");
        assert_eq!(duplicate.status(), StatusCode::CONFLICT);

        let generic_write = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/asset_transfers")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"records":[],"expectedRevision":""}"#))
                    .expect("generic transfer write request"),
            )
            .await
            .expect("generic transfer write response");
        assert_eq!(generic_write.status(), StatusCode::BAD_REQUEST);

        let employee_approve = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/assets/transfers/{transfer_key}/approve"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee approve request"),
            )
            .await
            .expect("employee approve response");
        assert_eq!(employee_approve.status(), StatusCode::FORBIDDEN);

        let approved = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/assets/transfers/{transfer_key}/approve"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("approve request"),
            )
            .await
            .expect("approve response");
        assert_eq!(approved.status(), StatusCode::OK);
        let approved: Value = serde_json::from_slice(
            &axum::body::to_bytes(approved.into_body(), 32 * 1024)
                .await
                .expect("approved body"),
        )
        .expect("approved JSON");
        assert_eq!(approved["transfer"]["status"], "Đang vận chuyển");
        assert_eq!(approved["transfer"]["approvedByUserId"], admin.id);
        assert_eq!(approved["transfer"]["approver"], admin.name);
        assert!(approved["transfer"]["approvedAt"].as_str().is_some());

        let repeated_approval = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/assets/transfers/{transfer_key}/approve"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("repeat approval request"),
            )
            .await
            .expect("repeat approval response");
        assert_eq!(repeated_approval.status(), StatusCode::CONFLICT);

        let received = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/assets/transfers/{transfer_key}/receive"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        r#"{"condition":"Đã kiểm tra và ghi nhận đủ thiết bị."}"#,
                    ))
                    .expect("receive transfer request"),
            )
            .await
            .expect("receive transfer response");
        assert_eq!(received.status(), StatusCode::OK);
        let received: Value = serde_json::from_slice(
            &axum::body::to_bytes(received.into_body(), 32 * 1024)
                .await
                .expect("received body"),
        )
        .expect("received JSON");
        assert_eq!(received["transfer"]["status"], "Đã điều chuyển hoàn tất");
        assert_eq!(received["transfer"]["receiptRecordedByUserId"], admin.id);
        assert_eq!(
            received["transfer"]["receiptMethod"],
            "authenticated_admin_record"
        );
        assert_eq!(
            received["transfer"]["toCustodian"],
            "Người phụ trách dự kiến"
        );

        let mut rejected_payload = payload;
        rejected_payload["transferCode"] = json!("DC-2026-TEST-02");
        let rejected_create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/transfers")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(rejected_payload.to_string()))
                    .expect("create transfer for rejection"),
            )
            .await
            .expect("create transfer for rejection response");
        assert_eq!(rejected_create.status(), StatusCode::CREATED);
        let rejected_create: Value = serde_json::from_slice(
            &axum::body::to_bytes(rejected_create.into_body(), 32 * 1024)
                .await
                .expect("rejection create body"),
        )
        .expect("rejection create JSON");
        let rejected_key = rejected_create["transfer"]["key"]
            .as_str()
            .expect("rejection transfer key");
        let rejected = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/assets/transfers/{rejected_key}/reject"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"reason":"Chưa có biên bản bàn giao."}"#))
                    .expect("reject transfer request"),
            )
            .await
            .expect("reject transfer response");
        assert_eq!(rejected.status(), StatusCode::OK);
        let rejected: Value = serde_json::from_slice(
            &axum::body::to_bytes(rejected.into_body(), 32 * 1024)
                .await
                .expect("rejected body"),
        )
        .expect("rejected JSON");
        assert_eq!(rejected["transfer"]["status"], "Từ chối điều chuyển");
        assert_eq!(
            rejected["transfer"]["rejectionReason"],
            "Chưa có biên bản bàn giao."
        );

        let audit_count: i64 = state
            .db
            .lock()
            .await
            .query_row(
                "SELECT COUNT(*) FROM audit_events WHERE resource_scope = 'asset_transfers'",
                [],
                |row| row.get(0),
            )
            .expect("asset transfer audit events");
        assert_eq!(audit_count, 5);
    }

    #[tokio::test]
    async fn asset_audits_snapshot_inventory_record_scans_close_and_submit_resolution() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-asset-audits".to_owned(),
            email: "admin.asset-audits@example.test".to_owned(),
            name: "Audit Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) \
                 VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("AuditAdmin-123!").expect("admin password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin user insert");
            let timestamp = Utc::now().to_rfc3339();
            for (key, code, barcode, name, location, department, price) in [
                (
                    "audit-asset-1",
                    "AS-001",
                    "BC-001",
                    "Laptop kiểm toán",
                    "Hà Nội - Tầng 12",
                    "Kỹ thuật",
                    1_000_i64,
                ),
                (
                    "audit-asset-2",
                    "AS-002",
                    "BC-002",
                    "Màn hình kiểm toán",
                    "Hà Nội - Tầng 12",
                    "Tài chính",
                    2_500_i64,
                ),
                (
                    "audit-asset-3",
                    "AS-003",
                    "BC-003",
                    "Thiết bị ngoài phạm vi",
                    "TP.HCM",
                    "Kỹ thuật",
                    5_000_i64,
                ),
            ] {
                let record = json!({
                    "key":key,
                    "code":code,
                    "barcode":barcode,
                    "name":name,
                    "category":"Thiết bị IT",
                    "assignedTo":"Người đang giữ theo sổ",
                    "location":location,
                    "department":department,
                    "originalPrice":price
                });
                db.execute(
                    "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) \
                     VALUES ('asset_items',?1,?2,?3,?3)",
                    params![key, record.to_string(), timestamp],
                )
                .expect("asset inventory fixture");
            }
        }
        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );

        let denied = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/assets/audits")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee audit list request"),
            )
            .await
            .expect("employee audit list response");
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let payload = json!({
            "auditCode":"KK-2026-API-01",
            "auditName":"Kiểm kê thiết bị Hà Nội",
            "auditType":"Định kỳ quý/năm",
            "scope":"Trụ sở Hà Nội",
            "location":"Hà Nội",
            "department":"*",
            "startDate":"2026-10-09",
            "endDate":"2026-10-10",
            "auditorLeader":"Đầu mối đã khai báo",
            "auditorMembers":"Tổ kiểm kê",
            "notes":"Fixture kiểm thử"
        });
        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/audits")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(payload.to_string()))
                    .expect("create asset audit request"),
            )
            .await
            .expect("create asset audit response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let created: Value = serde_json::from_slice(
            &axum::body::to_bytes(created.into_body(), 128 * 1024)
                .await
                .expect("create audit response body"),
        )
        .expect("create audit JSON");
        assert_eq!(created["audit"]["bookCount"], 2);
        assert_eq!(created["audit"]["bookValue"], 3_500);
        assert_eq!(created["audit"]["snapshotVersion"], 1);
        let audit_key = created["audit"]["key"]
            .as_str()
            .expect("audit key")
            .to_owned();

        {
            let db = state.db.lock().await;
            db.execute(
                "UPDATE collection_records SET record_json=json_set(record_json,'$.name','Đã đổi sau snapshot','$.originalPrice',999999) \
                 WHERE scope='asset_items' AND record_key='audit-asset-1'",
                [],
            )
            .expect("mutate live inventory after snapshot");
        }

        let generic_bypass = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/asset_audits")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"records":[],"expectedRevision":""}"#))
                    .expect("generic audit write request"),
            )
            .await
            .expect("generic audit write response");
        assert_eq!(generic_bypass.status(), StatusCode::BAD_REQUEST);

        let scan = |code: &'static str, damaged: bool| json!({ "scanCode": code, "damaged": damaged, "observedLocation": "Hà Nội - Tầng 12" });
        let mut scan_results = Vec::new();
        for (code, damaged) in [
            ("BC-001", false),
            ("AS-002", true),
            ("AS-003", false),
            ("NOT-IN-BOOK", false),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(Method::POST)
                        .uri(format!("/api/v1/assets/audits/{audit_key}/scans"))
                        .header(AUTHORIZATION, &admin_bearer)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(scan(code, damaged).to_string()))
                        .expect("record audit scan request"),
                )
                .await
                .expect("record audit scan response");
            assert_eq!(response.status(), StatusCode::OK);
            let body: Value = serde_json::from_slice(
                &axum::body::to_bytes(response.into_body(), 256 * 1024)
                    .await
                    .expect("scan response body"),
            )
            .expect("scan response JSON");
            scan_results.push(body);
        }
        assert_eq!(scan_results[0]["audit"]["actualValue"], 1_000);
        assert_eq!(
            scan_results[0]["audit"]["itemsList"][0]["name"],
            "Laptop kiểm toán"
        );
        assert_eq!(scan_results[1]["audit"]["damagedCount"], 1);
        assert_eq!(scan_results[2]["audit"]["actualCount"], 2);
        assert_eq!(
            scan_results[2]["audit"]["itemsList"][0]["auditStatus"],
            "Ngoài phạm vi"
        );
        assert_eq!(scan_results[3]["audit"]["surplusCount"], 1);
        assert_eq!(scan_results[3]["audit"]["itemsList"][0]["name"], "");

        let duplicate = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/assets/audits/{audit_key}/scans"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(scan("AS-001", false).to_string()))
                    .expect("duplicate audit scan request"),
            )
            .await
            .expect("duplicate audit scan response");
        assert_eq!(duplicate.status(), StatusCode::CONFLICT);

        let closed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/assets/audits/{audit_key}/close"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("close audit request"),
            )
            .await
            .expect("close audit response");
        assert_eq!(closed.status(), StatusCode::OK);
        let closed: Value = serde_json::from_slice(
            &axum::body::to_bytes(closed.into_body(), 256 * 1024)
                .await
                .expect("closed audit body"),
        )
        .expect("closed audit JSON");
        assert_eq!(closed["audit"]["status"], "Chờ đối soát & Giải trình");
        assert_eq!(closed["audit"]["missingCount"], 0);
        assert_eq!(closed["audit"]["surplusCount"], 1);
        assert_eq!(closed["audit"]["discrepancy"], 1);
        assert_eq!(closed["audit"]["actualValue"], 3_500);
        assert_eq!(closed["audit"]["bookValue"], 3_500);

        let resolution = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/assets/audits/{audit_key}/submit-resolution"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"proposal":"Kiểm tra mã thừa, xác minh nguồn gốc và lập biên bản bổ sung."}).to_string(),
                    ))
                    .expect("submit audit resolution request"),
            )
            .await
            .expect("submit audit resolution response");
        assert_eq!(resolution.status(), StatusCode::OK);
        let resolution: Value = serde_json::from_slice(
            &axum::body::to_bytes(resolution.into_body(), 256 * 1024)
                .await
                .expect("resolution body"),
        )
        .expect("resolution JSON");
        assert_eq!(resolution["audit"]["status"], "Đã trình HĐQT phê duyệt");
        assert_eq!(resolution["audit"]["resolutionSubmittedByUserId"], admin.id);
        assert!(resolution["audit"]["resolutionSubmittedAt"].is_string());

        let after_submit_scan = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/assets/audits/{audit_key}/scans"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(scan("LATE-SCAN", false).to_string()))
                    .expect("scan after closed request"),
            )
            .await
            .expect("scan after closed response");
        assert_eq!(after_submit_scan.status(), StatusCode::CONFLICT);

        let detail = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/assets/audits/{audit_key}"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("audit detail request"),
            )
            .await
            .expect("audit detail response");
        assert_eq!(detail.status(), StatusCode::OK);
        let detail: Value = serde_json::from_slice(
            &axum::body::to_bytes(detail.into_body(), 256 * 1024)
                .await
                .expect("audit detail body"),
        )
        .expect("audit detail JSON");
        assert_eq!(
            detail["audit"]["itemsList"].as_array().map(Vec::len),
            Some(4)
        );
        assert_eq!(
            detail["audit"]["missingItems"].as_array().map(Vec::len),
            Some(0)
        );

        let event_count: i64 = state
            .db
            .lock()
            .await
            .query_row(
                "SELECT COUNT(*) FROM audit_events WHERE resource_scope='asset_audits' AND resource_id=?1",
                params![audit_key],
                |row| row.get(0),
            )
            .expect("audit lifecycle event count");
        assert_eq!(event_count, 7);
    }

    #[tokio::test]
    async fn asset_maintenance_is_admin_only_persistent_and_generic_write_bypasses_are_blocked() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-asset-maintenance".to_owned(),
            email: "maintenance-admin@example.test".to_owned(),
            name: "Maintenance Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("MaintenanceAdmin-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
        }
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let app = router(state.clone(), CorsLayer::new());
        let today = Utc::now().date_naive();
        let input = json!({
            "maintCode":"BD-2026-01",
            "systemName":"Cụm máy chủ ứng dụng",
            "category":"Máy chủ & Hạ tầng IDC",
            "assetCodes":"AS-01, AS-02",
            "location":"Phòng máy chủ tầng 3",
            "frequency":"Hàng quý (3 tháng)",
            "maintenanceType":"Phòng ngừa định kỳ (PM)",
            "slaLevel":"SLA Gold (8h)",
            "lastDate":today.format("%Y-%m-%d").to_string(),
            "nextDate":(today + Duration::days(90)).format("%Y-%m-%d").to_string(),
            "responsibleEngineer":"Kỹ sư hệ thống",
            "vendorPartner":"",
            "estimatedBudget":3500000,
            "notes":"Kế hoạch kiểm tra quý"
        });

        let employee_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/assets/maintenance")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee maintenance list request"),
            )
            .await
            .expect("employee maintenance list response");
        assert_eq!(employee_read.status(), StatusCode::FORBIDDEN);

        let employee_create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/maintenance")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(input.to_string()))
                    .expect("employee maintenance create request"),
            )
            .await
            .expect("employee maintenance create response");
        assert_eq!(employee_create.status(), StatusCode::FORBIDDEN);

        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/maintenance")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(input.to_string()))
                    .expect("admin maintenance create request"),
            )
            .await
            .expect("admin maintenance create response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 32 * 1024)
            .await
            .expect("created maintenance body");
        let created: Value = serde_json::from_slice(&body).expect("created maintenance JSON");
        let record = &created["maintenance"];
        let key = record["key"].as_str().expect("maintenance key").to_owned();
        assert_eq!(record["status"], "Đã lập kế hoạch");
        assert_eq!(record["createdByUserId"], admin.id);
        assert_eq!(record["createdByName"], admin.name);
        assert_eq!(record["healthScore"], Value::Null);
        assert_eq!(record["actualCost"], Value::Null);
        assert_eq!(record["certificateCode"], Value::Null);
        assert!(
            record["checklist"]
                .as_array()
                .unwrap()
                .iter()
                .all(|item| item["done"] == false)
        );
        assert_eq!(created["revision"].as_str().unwrap().len(), 64);

        let duplicate = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/maintenance")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(input.to_string()))
                    .expect("duplicate maintenance request"),
            )
            .await
            .expect("duplicate maintenance response");
        assert_eq!(duplicate.status(), StatusCode::CONFLICT);

        let incomplete = record["checklist"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| {
                json!({
                    "item":item["item"],
                    "done":false,
                    "note":null
                })
            })
            .collect::<Vec<_>>();
        let cannot_finish = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/assets/maintenance/{key}/perform"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "checklist":incomplete,
                            "healthScore":98,
                            "actualCost":2500000,
                            "notes":"Chưa hoàn tất"
                        })
                        .to_string(),
                    ))
                    .expect("incomplete maintenance request"),
            )
            .await
            .expect("incomplete maintenance response");
        assert_eq!(cannot_finish.status(), StatusCode::BAD_REQUEST);

        let complete = record["checklist"]
            .as_array()
            .unwrap()
            .iter()
            .map(|item| {
                json!({
                    "item":item["item"],
                    "done":true,
                    "note":"Đã kiểm tra"
                })
            })
            .collect::<Vec<_>>();
        let performed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/assets/maintenance/{key}/perform"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "checklist":complete,
                            "healthScore":98,
                            "actualCost":2500000,
                            "notes":"Đã hoàn tất công việc"
                        })
                        .to_string(),
                    ))
                    .expect("perform maintenance request"),
            )
            .await
            .expect("perform maintenance response");
        assert_eq!(performed.status(), StatusCode::OK);
        let body = axum::body::to_bytes(performed.into_body(), 32 * 1024)
            .await
            .expect("performed maintenance body");
        let performed: Value = serde_json::from_slice(&body).expect("performed maintenance JSON");
        let record = &performed["maintenance"];
        assert_eq!(record["status"], "Đã hoàn thành đúng lịch");
        assert_eq!(record["healthScore"], 98);
        assert_eq!(record["actualCost"], 2500000);
        assert_eq!(record["performedByUserId"], admin.id);
        assert!(record["performedAt"].as_str().is_some());
        assert_eq!(record["maintenanceHistory"].as_array().unwrap().len(), 1);
        assert_eq!(
            record["maintenanceHistory"][0]["performedByName"],
            admin.name
        );
        assert_eq!(
            record["latestVerifiedPerformance"]["verification"],
            "verified"
        );

        let legacy_collection_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/asset_maintenances")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("legacy collection compatibility read"),
            )
            .await
            .expect("legacy collection compatibility response");
        assert_eq!(legacy_collection_read.status(), StatusCode::OK);

        for (method, uri, body) in [
            (
                Method::POST,
                "/api/v1/collections/asset_maintenances",
                json!({"record":{"key":"bypass-post"}}),
            ),
            (
                Method::PUT,
                "/api/v1/collections/asset_maintenances",
                json!({"records":[]}),
            ),
            (
                Method::PATCH,
                "/api/v1/collections/asset_maintenances/bypass-patch",
                json!({"patch":{"status":"Đã hoàn thành đúng lịch"}}),
            ),
        ] {
            let generic_write = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri(uri)
                        .header(AUTHORIZATION, &admin_bearer)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(body.to_string()))
                        .expect("generic maintenance write request"),
                )
                .await
                .expect("generic maintenance write response");
            assert_eq!(generic_write.status(), StatusCode::BAD_REQUEST);
        }
        let generic_delete = app
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri("/api/v1/collections/asset_maintenances/bypass-delete")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("generic maintenance delete request"),
            )
            .await
            .expect("generic maintenance delete response");
        assert_eq!(generic_delete.status(), StatusCode::BAD_REQUEST);

        let db = state.db.lock().await;
        let event_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM audit_events WHERE resource_scope = 'asset_maintenances' AND resource_id = ?1",
                params![key],
                |row| row.get(0),
            )
            .expect("maintenance audit event count");
        assert_eq!(event_count, 2);
    }

    #[tokio::test]
    async fn asset_repairs_preserve_legacy_collection_and_enforce_audited_lifecycle() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-asset-repairs".to_owned(),
            email: "repairs-admin@example.test".to_owned(),
            name: "Repair Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![&admin.id, &admin.email, &admin.name, &admin.role,
                    password_hash("RepairAdmin-123!").expect("password hash"), &admin.created_at],
            ).expect("insert repairs admin");
            db.execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('asset_repairs','legacy-repair-1',?1,?2,?2)",
                params![json!({"key":"legacy-repair-1","repairCode":"SC-LEGACY-01","assetCode":"IT-LEGACY","status":"Chờ duyệt báo giá","unknownLegacyField":{"kept":true}}).to_string(), Utc::now().to_rfc3339()],
            ).expect("insert legacy repair row");
        }
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let app = router(state.clone(), CorsLayer::new());
        let input = json!({
            "repairCode":"SC-2026-021","assetCode":"TS-IT-002","assetName":"Laptop Dell",
            "category":"Laptop","serialNo":"SN-001","requester":"Nguyễn An","department":"IT",
            "severity":"Cao (P2)","repairUnit":"Trung tâm bảo hành chính hãng","vendor":"Dell Care",
            "vendorContact":"1900","issueDescription":"Màn hình chập chờn","rootCause":"Cáp màn hình",
            "solution":"Thay cáp","replacedParts":"Cáp màn hình","estimatedCost":2500000,
            "costBearing":"Công ty chi trả","startDate":"2026-10-01","expectedEndDate":"2026-10-08",
            "warrantyAfterRepair":"6 tháng","approver":"Quản lý IT","notes":"Phiếu sửa thử"
        });

        let denied = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/assets/repairs")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee list request"),
            )
            .await
            .expect("employee list response");
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/repairs")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(input.to_string()))
                    .expect("create repair request"),
            )
            .await
            .expect("create repair response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 32 * 1024)
            .await
            .expect("created body");
        let created: Value = serde_json::from_slice(&body).expect("created JSON");
        let key = created["repair"]["key"]
            .as_str()
            .expect("repair key")
            .to_owned();
        assert_eq!(created["repair"]["status"], "Chờ duyệt báo giá");
        assert_eq!(created["repair"]["actualCost"], 0);
        assert_eq!(created["repair"]["createdByUserId"], admin.id);

        let approved = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/assets/repairs/{key}/approve"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::from("{}"))
                    .expect("approve repair request"),
            )
            .await
            .expect("approve repair response");
        assert_eq!(approved.status(), StatusCode::OK);
        let body = axum::body::to_bytes(approved.into_body(), 32 * 1024)
            .await
            .expect("approved body");
        let approved: Value = serde_json::from_slice(&body).expect("approved JSON");
        assert_eq!(approved["repair"]["status"], "Đang sửa chữa tại hãng");
        assert_eq!(approved["repair"]["approvedByUserId"], admin.id);

        let completed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/assets/repairs/{key}/complete"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"actualCost":2250000,"notes":"Đã test và bàn giao"}).to_string(),
                    ))
                    .expect("complete repair request"),
            )
            .await
            .expect("complete repair response");
        assert_eq!(completed.status(), StatusCode::OK);
        let body = axum::body::to_bytes(completed.into_body(), 32 * 1024)
            .await
            .expect("completed body");
        let completed: Value = serde_json::from_slice(&body).expect("completed JSON");
        assert_eq!(completed["repair"]["status"], "Đã sửa xong & Bàn giao");
        assert_eq!(completed["repair"]["actualCost"], 2250000);
        assert_eq!(
            completed["repair"]["repairCompletionEvent"]["actorUserId"],
            admin.id
        );
        assert_eq!(
            completed["repair"]["repairCompletionEvent"]["verification"],
            "verified"
        );

        let repeated = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/assets/repairs/{key}/approve"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::from("{}"))
                    .expect("repeat approve request"),
            )
            .await
            .expect("repeat approve response");
        assert_eq!(repeated.status(), StatusCode::CONFLICT);

        let legacy_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/asset_repairs")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("legacy collection read request"),
            )
            .await
            .expect("legacy collection read response");
        assert_eq!(legacy_read.status(), StatusCode::OK);
        let body = axum::body::to_bytes(legacy_read.into_body(), 64 * 1024)
            .await
            .expect("legacy rows body");
        let legacy_rows: Value = serde_json::from_slice(&body).expect("legacy rows JSON");
        let imported = legacy_rows["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["key"] == "legacy-repair-1")
            .expect("preserved legacy repair row");
        assert_eq!(imported["unknownLegacyField"]["kept"], true);

        let bypass = app
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/collections/asset_repairs/legacy-repair-1")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"patch":{"status":"Đã sửa xong & Bàn giao"}}).to_string(),
                    ))
                    .expect("generic write request"),
            )
            .await
            .expect("generic write response");
        assert_eq!(bypass.status(), StatusCode::BAD_REQUEST);

        let db = state.db.lock().await;
        let event_count: i64 = db.query_row(
            "SELECT COUNT(*) FROM audit_events WHERE resource_scope='asset_repairs' AND resource_id=?1",
            params![key], |row| row.get(0),
        ).expect("repair audit event count");
        assert_eq!(event_count, 3);
    }

    #[tokio::test]
    async fn asset_disposals_preserve_legacy_rows_and_enforce_audited_settlement() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-asset-disposals".to_owned(),
            email: "disposals-admin@example.test".to_owned(),
            name: "Disposal Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![&admin.id, &admin.email, &admin.name, &admin.role,
                    password_hash("DisposalAdmin-123!").expect("password hash"), &admin.created_at],
            ).expect("insert disposal admin");
            db.execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('asset_disposals','legacy-disposal-1',?1,?2,?2)",
                params![json!({
                    "key":"legacy-disposal-1","disposalCode":"TL-LEGACY-01",
                    "assetCode":"IT-LEGACY","status":"Chờ hội đồng phê duyệt",
                    "unknownLegacyField":{"kept":true}
                }).to_string(), Utc::now().to_rfc3339()],
            ).expect("insert legacy disposal row");
        }
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let app = router(state.clone(), CorsLayer::new());
        let denied = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/assets/disposals")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee list request"),
            )
            .await
            .expect("employee list response");
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let input = json!({
            "disposalCode":"TL-2026-012",
            "disposalMethod":"Bán thanh lý cho đơn vị thu mua ngoài",
            "disposalDate":"2026-10-09",
            "assetCode":"TS-PC-08","assetName":"Workstation","category":"Máy tính",
            "serialNo":"SN-99281","reason":"Khấu hao hết",
            "originalCost":30000000,"accumulatedDepreciation":28000000,
            "startingAuctionPrice":3000000,"actualDisposalPrice":3500000,"disposalCost":200000,
            "buyerName":"Đơn vị thu mua","buyerPhone":"0900000000",
            "councilLeader":"Chủ tịch","councilMembers":"Thành viên"
        });
        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/disposals")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(input.to_string()))
                    .expect("create disposal request"),
            )
            .await
            .expect("create disposal response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 32 * 1024)
            .await
            .expect("created body");
        let created: Value = serde_json::from_slice(&body).expect("created JSON");
        let key = created["disposal"]["key"]
            .as_str()
            .expect("disposal key")
            .to_owned();
        assert_eq!(created["disposal"]["status"], "Chờ hội đồng phê duyệt");
        assert_eq!(created["disposal"]["netBookValue"], 2_000_000);
        assert_eq!(created["disposal"]["netGainLoss"], 1_300_000);
        assert_eq!(created["disposal"]["securityDataWipeCertified"], false);
        assert_eq!(created["disposal"]["createdByUserId"], admin.id);

        let approved = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/assets/disposals/{key}/approve"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "actualDisposalPrice":3700000,
                            "securityDataWipeCertified":true
                        })
                        .to_string(),
                    ))
                    .expect("approve disposal request"),
            )
            .await
            .expect("approve disposal response");
        assert_eq!(approved.status(), StatusCode::OK);
        let body = axum::body::to_bytes(approved.into_body(), 32 * 1024)
            .await
            .expect("approved body");
        let approved: Value = serde_json::from_slice(&body).expect("approved JSON");
        assert_eq!(
            approved["disposal"]["status"],
            "Đã thanh lý & Hoàn tất sổ sách"
        );
        assert_eq!(approved["disposal"]["netGainLoss"], 1_500_000);
        assert_eq!(approved["disposal"]["approvedByUserId"], admin.id);
        assert_eq!(
            approved["disposal"]["disposalApprovalEvent"]["verification"],
            "user_attested"
        );
        assert_eq!(
            approved["disposal"]["disposalApprovalEvent"]["actorUserId"],
            admin.id
        );

        let repeated = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!("/api/v1/assets/disposals/{key}/approve"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "actualDisposalPrice":3700000,
                            "securityDataWipeCertified":true
                        })
                        .to_string(),
                    ))
                    .expect("repeat approve request"),
            )
            .await
            .expect("repeat approve response");
        assert_eq!(repeated.status(), StatusCode::CONFLICT);

        let legacy_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/asset_disposals")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("legacy collection read request"),
            )
            .await
            .expect("legacy collection read response");
        assert_eq!(legacy_read.status(), StatusCode::OK);
        let body = axum::body::to_bytes(legacy_read.into_body(), 64 * 1024)
            .await
            .expect("legacy rows body");
        let rows: Value = serde_json::from_slice(&body).expect("legacy rows JSON");
        let imported = rows["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["key"] == "legacy-disposal-1")
            .expect("preserved legacy disposal");
        assert_eq!(imported["unknownLegacyField"]["kept"], true);

        let bypass = app
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/collections/asset_disposals/legacy-disposal-1")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"patch":{"status":"Đã thanh lý & Hoàn tất sổ sách"}}).to_string(),
                    ))
                    .expect("generic write request"),
            )
            .await
            .expect("generic write response");
        assert_eq!(bypass.status(), StatusCode::BAD_REQUEST);

        let db = state.db.lock().await;
        let event_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM audit_events WHERE resource_scope='asset_disposals' AND resource_id=?1",
                params![key],
                |row| row.get(0),
            )
            .expect("disposal audit event count");
        assert_eq!(event_count, 2);
    }

    #[tokio::test]
    async fn asset_depreciations_preserve_legacy_rows_and_record_idempotent_monthly_runs() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-asset-depreciations".to_owned(),
            email: "depreciations-admin@example.test".to_owned(),
            name: "Depreciation Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        let period = Utc::now().format("%Y-%m").to_string();
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![&admin.id, &admin.email, &admin.name, &admin.role,
                    password_hash("DepreciationAdmin-123!").expect("password hash"), &admin.created_at],
            ).expect("insert depreciation admin");
            db.execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('asset_depreciations','legacy-deprec-1',?1,?2,?2)",
                params![json!({
                    "key":"legacy-deprec-1","assetCode":"TS-LEGACY-01",
                    "assetName":"Legacy Server","originalCost":1200000,
                    "residualValue":0,"lifeMonths":36,"depreciatedMonths":2,
                    "monthlyDeprec":33333,"accumulatedDeprec":66666,
                    "netBookValue":1133334,"startDate":"2024-01-01",
                    "status":"Tạm dừng trích KH","unknownLegacyField":{"keep":true}
                }).to_string(), Utc::now().to_rfc3339()],
            ).expect("insert legacy depreciation row");
        }
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let app = router(state.clone(), CorsLayer::new());

        let denied = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/assets/depreciations")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee depreciation list request"),
            )
            .await
            .expect("employee depreciation list response");
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let listed = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/assets/depreciations")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin depreciation list request"),
            )
            .await
            .expect("admin depreciation list response");
        assert_eq!(listed.status(), StatusCode::OK);
        let body = axum::body::to_bytes(listed.into_body(), 64 * 1024)
            .await
            .expect("depreciations list body");
        let listed: Value = serde_json::from_slice(&body).expect("depreciations list JSON");
        assert_eq!(
            listed["data"][0]["unknownLegacyField"]["keep"], true,
            "legacy fields must remain unmodified and visible"
        );

        let input = json!({
            "assetCode":"TS-NEW-01","assetName":"New Server",
            "category":"Máy chủ & Hạ tầng IDC","department":"Trung Tâm Dữ Liệu",
            "costAccount":"Nợ 6421 (CP Quản lý CNTT)",
            "assetAccount":"Có 2141 (Hao mòn TSCĐ hữu hình)",
            "depreciationMethod":"Đường thẳng (Straight-Line VAS TT45)",
            "originalCost":100,"residualValue":10,"lifeMonths":3,
            "startDate":format!("{period}-01"),"notes":"Test khấu hao"
        });
        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/depreciations")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(input.to_string()))
                    .expect("create depreciation request"),
            )
            .await
            .expect("create depreciation response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 64 * 1024)
            .await
            .expect("created depreciation body");
        let created: Value = serde_json::from_slice(&body).expect("created depreciation JSON");
        let key = created["depreciation"]["key"]
            .as_str()
            .expect("created depreciation key")
            .to_owned();
        assert_eq!(created["depreciation"]["monthlyDeprec"], 33);
        assert_eq!(
            created["depreciation"]["scheduleList"][2]["monthlyAmount"],
            34
        );
        assert_eq!(created["depreciation"]["netBookValue"], 100);

        for expected_status in ["Tạm dừng trích KH", "Đang trích khấu hao"] {
            let toggled = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(Method::POST)
                        .uri(format!("/api/v1/assets/depreciations/{key}/toggle-status"))
                        .header(AUTHORIZATION, &admin_bearer)
                        .body(Body::from("{}"))
                        .expect("toggle depreciation status request"),
                )
                .await
                .expect("toggle depreciation status response");
            assert_eq!(toggled.status(), StatusCode::OK);
            let body = axum::body::to_bytes(toggled.into_body(), 64 * 1024)
                .await
                .expect("toggled depreciation body");
            let toggled: Value = serde_json::from_slice(&body).expect("toggled depreciation JSON");
            assert_eq!(toggled["depreciation"]["status"], expected_status);
        }

        let run = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/depreciations/run-monthly")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"period":period}).to_string()))
                    .expect("run monthly depreciation request"),
            )
            .await
            .expect("run monthly depreciation response");
        assert_eq!(run.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(run.into_body(), 64 * 1024)
            .await
            .expect("monthly run body");
        let run: Value = serde_json::from_slice(&body).expect("monthly run JSON");
        assert_eq!(run["run"]["entryCount"], 1);
        assert_eq!(run["run"]["totalAmount"], 33);
        assert_eq!(run["run"]["ledger"], "asset_depreciation_subledger");
        assert_eq!(run["run"]["financeGeneralLedgerUpdated"], false);
        assert_eq!(
            run["run"]["entries"][0]["debitAccount"],
            "Nợ 6421 (CP Quản lý CNTT)"
        );

        let repeated = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/depreciations/run-monthly")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"period":period}).to_string()))
                    .expect("repeat monthly run request"),
            )
            .await
            .expect("repeat monthly run response");
        assert_eq!(repeated.status(), StatusCode::CONFLICT);

        let future = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/depreciations/run-monthly")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(r#"{"period":"9999-12"}"#))
                    .expect("future monthly run request"),
            )
            .await
            .expect("future monthly run response");
        assert_eq!(future.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let bypass = app
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/collections/asset_depreciations/legacy-deprec-1")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"patch":{"status":"Đang trích khấu hao"}}).to_string(),
                    ))
                    .expect("generic depreciation write request"),
            )
            .await
            .expect("generic depreciation write response");
        assert_eq!(bypass.status(), StatusCode::BAD_REQUEST);

        let db = state.db.lock().await;
        let run_count: i64 = db
            .query_row("SELECT COUNT(*) FROM asset_depreciation_runs", [], |row| {
                row.get(0)
            })
            .expect("monthly run count");
        assert_eq!(run_count, 1);
        let audit_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM audit_events WHERE resource_scope='asset_depreciations'",
                [],
                |row| row.get(0),
            )
            .expect("depreciation audit count");
        assert_eq!(audit_count, 4);
        assert!(
            db.execute("UPDATE asset_depreciation_runs SET total_amount=0", [])
                .is_err()
        );
        assert!(
            db.execute("DELETE FROM asset_depreciation_runs", [])
                .is_err()
        );
        let legacy_json: String = db
            .query_row(
                "SELECT record_json FROM collection_records WHERE scope='asset_depreciations' AND record_key='legacy-deprec-1'",
                [],
                |row| row.get(0),
            )
            .expect("legacy depreciation still present");
        let legacy: Value = serde_json::from_str(&legacy_json).expect("legacy depreciation JSON");
        assert_eq!(legacy["unknownLegacyField"]["keep"], true);
        assert_eq!(legacy["status"], "Tạm dừng trích KH");
    }

    #[tokio::test]
    async fn legacy_asset_depreciations_import_is_admin_only_append_only_and_replay_safe() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-depreciation-import".to_owned(),
            email: "depreciation-import-admin@example.test".to_owned(),
            name: "Depreciation Import Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![&admin.id, &admin.email, &admin.name, &admin.role,
                    password_hash("DepreciationImportAdmin-123!").expect("password hash"), &admin.created_at],
            ).expect("insert depreciation import admin");
            db.execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('asset_depreciations','preexisting-depreciation',?1,?2,?2)",
                params![json!({"key":"preexisting-depreciation","assetCode":"ASSET-EXISTING","unknownLegacyField":{"kept":true}}).to_string(), Utc::now().to_rfc3339()],
            ).expect("insert preexisting depreciation");
        }
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let app = router(state.clone(), CorsLayer::new());
        let bundle = json!({
            "format":"kiyovn-legacy-asset-depreciations",
            "schemaVersion":1,
            "sourceMode":"browser_cache_fallback",
            "batchId":"323e4567-e89b-12d3-a456-426614174000",
            "sourceOrigin":"https://legacy.example.test",
            "exportedAt":"2026-10-10T10:00:00Z",
            "records":[
                {
                    "key":"legacy-depreciation-import-1","assetCode":"ASSET-OLD-DUP",
                    "assetName":"Synthetic legacy workstation","status":"Đang trích khấu hao",
                    "originalCost":12000000,"residualValue":0,"lifeMonths":12,
                    "depreciatedMonths":1,"monthlyDeprec":1000000,"accumulatedDeprec":1000000,
                    "startDate":"2025-01-01",
                    "scheduleList":[{"month":1,"amount":100000}],
                    "depreciationEvents":[{"actor":"Legacy accountant","posted":true}],
                    "createdByUserId":"old-user","createdByName":"Legacy accountant",
                    "unknownLegacyField":{"kept":true}
                },
                {
                    "key":"legacy-depreciation-import-2","assetCode":"ASSET-OLD-DUP",
                    "assetName":"Synthetic legacy monitor","status":"Tạm dừng trích KH"
                }
            ]
        });

        let denied = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-depreciations/preview")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"bundle":bundle.clone()}).to_string()))
                    .expect("employee preview request"),
            )
            .await
            .expect("employee preview response");
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let preview_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-depreciations/preview")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"bundle":bundle.clone()}).to_string()))
                    .expect("admin preview request"),
            )
            .await
            .expect("admin preview response");
        assert_eq!(preview_response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(preview_response.into_body(), 32 * 1024)
            .await
            .expect("preview body");
        let preview: Value = serde_json::from_slice(&body).expect("preview JSON");
        assert_eq!(preview["preview"]["targetRecords"], 1);
        assert_eq!(preview["preview"]["importableRecords"], 2);
        assert_eq!(preview["preview"]["duplicateAssetCodeRecords"], 1);
        assert_eq!(preview["preview"]["legacyHistoryClaims"], 1);
        assert_eq!(preview["preview"]["canApply"], true);
        let expected_payload_sha256 = preview["preview"]["payloadSha256"]
            .as_str()
            .expect("plan digest")
            .to_owned();
        let confirmation = preview["preview"]["confirmationPhrase"]
            .as_str()
            .expect("confirmation phrase")
            .to_owned();
        let apply_body = json!({
            "bundle":bundle,
            "expectedPayloadSha256":expected_payload_sha256,
            "confirmation":confirmation
        });
        let applied = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-depreciations/apply")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(apply_body.to_string()))
                    .expect("apply request"),
            )
            .await
            .expect("apply response");
        assert_eq!(applied.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(applied.into_body(), 32 * 1024)
            .await
            .expect("apply body");
        let result: Value = serde_json::from_slice(&body).expect("apply JSON");
        assert_eq!(result["import"]["importedRecords"], 2);

        let rows_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/asset_depreciations")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("collection read request"),
            )
            .await
            .expect("collection read response");
        assert_eq!(rows_response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(rows_response.into_body(), 64 * 1024)
            .await
            .expect("collection rows body");
        let rows: Value = serde_json::from_slice(&body).expect("collection rows JSON");
        let imported = rows["data"]
            .as_array()
            .expect("collection array")
            .iter()
            .find(|row| row["key"] == "legacy-depreciation-import-1")
            .expect("imported source row");
        assert_eq!(imported["unknownLegacyField"]["kept"], true);
        assert_eq!(imported["_kiyoLegacyImport"]["verification"], "unverified");
        assert_eq!(
            imported["_kiyoLegacyImport"]["unverifiedClaims"]["scheduleList"][0]["amount"],
            100000
        );
        assert_eq!(
            imported["_kiyoLegacyImport"]["unverifiedClaims"]["createdByName"],
            "Legacy accountant"
        );
        let current_period = Utc::now().format("%Y-%m").to_string();
        let monthly_run = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/assets/depreciations/run-monthly")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"period":current_period}).to_string()))
                    .expect("unverified monthly run request"),
            )
            .await
            .expect("unverified monthly run response");
        assert_eq!(monthly_run.status(), StatusCode::CONFLICT);
        let imported_after_run = state
            .db
            .lock()
            .await
            .query_row(
                "SELECT record_json FROM collection_records WHERE scope='asset_depreciations' AND record_key='legacy-depreciation-import-1'",
                [],
                |row| row.get::<_, String>(0),
            )
            .expect("unverified imported row after run");
        let imported_after_run: Value =
            serde_json::from_str(&imported_after_run).expect("imported row JSON");
        assert_eq!(imported_after_run["depreciatedMonths"], 1);
        assert_eq!(imported_after_run["accumulatedDeprec"], 1_000_000);
        let preexisting = rows["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["key"] == "preexisting-depreciation")
            .expect("preexisting row remains");
        assert_eq!(preexisting["unknownLegacyField"]["kept"], true);

        let replayed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-depreciations/apply")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(apply_body.to_string()))
                    .expect("replay request"),
            )
            .await
            .expect("replay response");
        assert_eq!(replayed.status(), StatusCode::CONFLICT);

        let stale_bundle = json!({
            "format":"kiyovn-legacy-asset-depreciations",
            "schemaVersion":1,
            "sourceMode":"server_collection",
            "batchId":"423e4567-e89b-12d3-a456-426614174000",
            "sourceOrigin":"https://legacy.example.test",
            "exportedAt":"2026-10-10T10:00:00Z",
            "records":[{"key":"legacy-depreciation-stale","assetCode":"ASSET-STALE"}]
        });
        let stale_preview_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-depreciations/preview")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"bundle":stale_bundle.clone()}).to_string(),
                    ))
                    .expect("stale preview request"),
            )
            .await
            .expect("stale preview response");
        assert_eq!(stale_preview_response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(stale_preview_response.into_body(), 32 * 1024)
            .await
            .expect("stale preview body");
        let stale_preview: Value = serde_json::from_slice(&body).expect("stale preview JSON");
        let stale_digest = stale_preview["preview"]["payloadSha256"]
            .as_str()
            .expect("stale plan digest")
            .to_owned();
        let stale_confirmation = stale_preview["preview"]["confirmationPhrase"]
            .as_str()
            .expect("stale confirmation phrase")
            .to_owned();
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('asset_depreciations','concurrent-depreciation',?1,?2,?2)",
                params![json!({"key":"concurrent-depreciation"}).to_string(), Utc::now().to_rfc3339()],
            ).expect("simulate concurrent collection change");
        }
        let stale_apply = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-depreciations/apply")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "bundle":stale_bundle,
                            "expectedPayloadSha256":stale_digest,
                            "confirmation":stale_confirmation
                        })
                        .to_string(),
                    ))
                    .expect("stale apply request"),
            )
            .await
            .expect("stale apply response");
        assert_eq!(stale_apply.status(), StatusCode::CONFLICT);

        let import_runs: i64 = state
            .db
            .lock()
            .await
            .query_row("SELECT COUNT(*) FROM legacy_import_runs", [], |row| {
                row.get(0)
            })
            .expect("import run count");
        assert_eq!(import_runs, 1);
    }

    #[tokio::test]
    async fn legacy_asset_disposals_import_is_admin_only_append_only_and_replay_safe() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-disposal-import".to_owned(),
            email: "disposal-import-admin@example.test".to_owned(),
            name: "Disposal Import Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![&admin.id, &admin.email, &admin.name, &admin.role,
                    password_hash("DisposalImportAdmin-123!").expect("password hash"), &admin.created_at],
            ).expect("insert disposal import admin");
            db.execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('asset_disposals','preexisting-disposal',?1,?2,?2)",
                params![json!({"key":"preexisting-disposal","disposalCode":"TL-EXISTING","unknownLegacyField":{"kept":true}}).to_string(), Utc::now().to_rfc3339()],
            ).expect("insert preexisting disposal");
        }
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let app = router(state.clone(), CorsLayer::new());
        let bundle = json!({
            "format":"kiyovn-legacy-asset-disposals",
            "schemaVersion":1,
            "sourceMode":"browser_cache_fallback",
            "batchId":"123e4567-e89b-12d3-a456-426614174000",
            "sourceOrigin":"https://legacy.example.test",
            "exportedAt":"2026-10-09T10:00:00Z",
            "records":[
                {
                    "key":"legacy-disposal-import-1","disposalCode":"TL-DUP-01",
                    "assetCode":"ASSET-OLD-01","status":"Đã thanh lý & Hoàn tất sổ sách",
                    "securityDataWipeCertified":true,"dataWipeOfficer":"Legacy officer",
                    "approvedAt":"2025-03-01T09:00:00Z","approvedByUserId":"old-user",
                    "approvedByName":"Legacy approver",
                    "disposalApprovalEvent":{"actorUserId":"old-user","verification":"verified"},
                    "unknownLegacyField":{"kept":true}
                },
                {
                    "key":"legacy-disposal-import-2","disposalCode":"TL-DUP-01",
                    "assetCode":"ASSET-OLD-02","status":"Thất lạc",
                    "securityDataWipeCertified":false
                }
            ]
        });

        let denied = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-disposals/preview")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"bundle":bundle.clone()}).to_string()))
                    .expect("employee preview request"),
            )
            .await
            .expect("employee preview response");
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let preview_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-disposals/preview")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"bundle":bundle.clone()}).to_string()))
                    .expect("admin preview request"),
            )
            .await
            .expect("admin preview response");
        assert_eq!(preview_response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(preview_response.into_body(), 32 * 1024)
            .await
            .expect("preview body");
        let preview: Value = serde_json::from_slice(&body).expect("preview JSON");
        assert_eq!(preview["preview"]["targetRecords"], 1);
        assert_eq!(preview["preview"]["importableRecords"], 2);
        assert_eq!(preview["preview"]["legacyWipeClaims"], 1);
        assert_eq!(preview["preview"]["duplicateDisposalCodeRecords"], 1);
        assert_eq!(preview["preview"]["canApply"], true);
        let expected_payload_sha256 = preview["preview"]["payloadSha256"]
            .as_str()
            .expect("plan digest")
            .to_owned();
        let confirmation = preview["preview"]["confirmationPhrase"]
            .as_str()
            .expect("confirmation phrase")
            .to_owned();

        let apply_body = json!({
            "bundle":bundle,
            "expectedPayloadSha256":expected_payload_sha256,
            "confirmation":confirmation
        });
        let applied = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-disposals/apply")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(apply_body.to_string()))
                    .expect("apply request"),
            )
            .await
            .expect("apply response");
        assert_eq!(applied.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(applied.into_body(), 32 * 1024)
            .await
            .expect("apply body");
        let result: Value = serde_json::from_slice(&body).expect("apply JSON");
        assert_eq!(result["import"]["importedRecords"], 2);

        let rows_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/asset_disposals")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("collection read request"),
            )
            .await
            .expect("collection read response");
        assert_eq!(rows_response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(rows_response.into_body(), 64 * 1024)
            .await
            .expect("collection rows body");
        let rows: Value = serde_json::from_slice(&body).expect("collection rows JSON");
        let imported = rows["data"]
            .as_array()
            .expect("collection array")
            .iter()
            .find(|row| row["key"] == "legacy-disposal-import-1")
            .expect("imported source row");
        assert_eq!(imported["unknownLegacyField"]["kept"], true);
        assert_eq!(imported["_kiyoLegacyImport"]["verification"], "unverified");
        assert_eq!(
            imported["_kiyoLegacyImport"]["unverifiedClaims"]["securityDataWipeCertified"],
            true
        );
        assert_eq!(
            imported["_kiyoLegacyImport"]["untrustedSourceFields"]["approvedByName"],
            "Legacy approver"
        );
        assert!(imported.get("approvedByName").is_none());
        let preexisting = rows["data"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["key"] == "preexisting-disposal")
            .expect("preexisting row remains");
        assert_eq!(preexisting["unknownLegacyField"]["kept"], true);

        let replayed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-disposals/apply")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(apply_body.to_string()))
                    .expect("replay request"),
            )
            .await
            .expect("replay response");
        assert_eq!(replayed.status(), StatusCode::CONFLICT);

        let stale_bundle = json!({
            "format":"kiyovn-legacy-asset-disposals","schemaVersion":1,
            "sourceMode":"server_collection","batchId":"223e4567-e89b-12d3-a456-426614174000",
            "sourceOrigin":"https://legacy.example.test","exportedAt":"2026-10-09T10:00:00Z",
            "records":[{"key":"legacy-disposal-stale","disposalCode":"TL-STALE"}]
        });
        let stale_preview_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-disposals/preview")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"bundle":stale_bundle.clone()}).to_string(),
                    ))
                    .expect("stale preview request"),
            )
            .await
            .expect("stale preview response");
        assert_eq!(stale_preview_response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(stale_preview_response.into_body(), 32 * 1024)
            .await
            .expect("stale preview body");
        let stale_preview: Value = serde_json::from_slice(&body).expect("stale preview JSON");
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('asset_disposals','concurrent-disposal',?1,?2,?2)",
                params![json!({"key":"concurrent-disposal"}).to_string(), Utc::now().to_rfc3339()],
            ).expect("simulate collection change");
        }
        let stale_apply = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/legacy-import/asset-disposals/apply")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "bundle":stale_bundle,
                            "expectedPayloadSha256":stale_preview["preview"]["payloadSha256"],
                            "confirmation":stale_preview["preview"]["confirmationPhrase"]
                        })
                        .to_string(),
                    ))
                    .expect("stale apply request"),
            )
            .await
            .expect("stale apply response");
        assert_eq!(stale_apply.status(), StatusCode::CONFLICT);

        let db = state.db.lock().await;
        let runs: i64 = db.query_row(
            "SELECT COUNT(*) FROM legacy_import_runs WHERE batch_id='123e4567-e89b-12d3-a456-426614174000'",
            [], |row| row.get(0),
        ).expect("import run count");
        assert_eq!(runs, 1);
        let stale_count: i64 = db.query_row(
            "SELECT COUNT(*) FROM collection_records WHERE scope='asset_disposals' AND record_key='legacy-disposal-stale'",
            [], |row| row.get(0),
        ).expect("stale record count");
        assert_eq!(stale_count, 0);
    }

    #[tokio::test]
    async fn reports_catalog_collection_is_admin_only_and_persistent() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-reports-catalog".to_owned(),
            email: "admin.reports@example.test".to_owned(),
            name: "Reports Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("ReportsAdmin-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );

        let denied = app
            .clone()
            .oneshot(
                Request::get("/api/v1/collections/reports_catalog")
                    .header(AUTHORIZATION, employee_bearer)
                    .body(Body::empty())
                    .expect("employee reports catalog request"),
            )
            .await
            .expect("employee reports catalog response");
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let report = json!({
            "code":"RP-TEST-01",
            "title":"Báo cáo kiểm thử",
            "type":"Tài chính",
            "author":"Reports Admin",
            "period":"Quý III / 2026",
            "status":"Sẵn sàng"
        });
        let created = app
            .clone()
            .oneshot(
                Request::post("/api/v1/collections/reports_catalog")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"record":report.clone()}).to_string()))
                    .expect("admin create report request"),
            )
            .await
            .expect("admin create report response");
        assert_eq!(created.status(), StatusCode::CREATED);

        let listed = app
            .oneshot(
                Request::get("/api/v1/collections/reports_catalog")
                    .header(AUTHORIZATION, admin_bearer)
                    .body(Body::empty())
                    .expect("admin reports catalog request"),
            )
            .await
            .expect("admin reports catalog response");
        assert_eq!(listed.status(), StatusCode::OK);
        let body = axum::body::to_bytes(listed.into_body(), 16 * 1024)
            .await
            .expect("reports catalog body");
        let payload: Value = serde_json::from_slice(&body).expect("reports catalog JSON");
        assert_eq!(payload["data"], json!([report]));
        assert_eq!(payload["pagination"]["total"], 1);
    }

    #[tokio::test]
    async fn payroll_and_insurance_collections_are_admin_only_and_persistent() {
        let (mut state, employee) = test_state();
        state.crm_crypto = Some(crm::CrmCrypto::for_test([0x52; 32], "insurance-test-v1"));
        let admin = User {
            id: "admin-insurance-collections".to_owned(),
            email: "admin.insurance@example.test".to_owned(),
            name: "Insurance Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("InsuranceAdmin-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
            for scope in ["payroll", "insurance_adjustments", "insurance_regimes"] {
                db.execute(
                    "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES (?1,?2,?3,?4,?4)",
                    params![
                        scope,
                        format!("{scope}-fixture"),
                        json!({"key":format!("{scope}-fixture")}).to_string(),
                        Utc::now().to_rfc3339(),
                    ],
                )
                .expect("restricted collection fixture insert");
            }
        }
        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );

        for scope in ["payroll", "insurance_adjustments", "insurance_regimes"] {
            let denied = app
                .clone()
                .oneshot(
                    Request::get(format!("/api/v1/collections/{scope}"))
                        .header(AUTHORIZATION, &employee_bearer)
                        .body(Body::empty())
                        .expect("employee restricted collection request"),
                )
                .await
                .expect("employee restricted collection response");
            assert_eq!(denied.status(), StatusCode::FORBIDDEN, "scope={scope}");

            let allowed = app
                .clone()
                .oneshot(
                    Request::get(format!("/api/v1/collections/{scope}"))
                        .header(AUTHORIZATION, &admin_bearer)
                        .body(Body::empty())
                        .expect("admin restricted collection request"),
                )
                .await
                .expect("admin restricted collection response");
            assert_eq!(allowed.status(), StatusCode::OK, "scope={scope}");

            let new_record = if scope == "insurance_adjustments" {
                json!({
                    "key": "insurance-adjustment-api-test",
                    "d02Code": "D02-API-TEST",
                    "adjustType": "Báo tăng mới",
                    "empName": "Synthetic Employee",
                    "empCode": "SYN-01",
                    "oldSalary": 0,
                    "newSalary": 12000000,
                    "effectiveMonth": "Tháng 01/2099",
                    "filingDate": "2099-01-01",
                    "vssSubmissionStatus": "Giả trạng thái do client gửi"
                })
            } else if scope == "insurance_regimes" {
                json!({
                    "key": "insurance-regime-api-test",
                    "claimCode": "CD-API-TEST",
                    "empName": "Synthetic Employee",
                    "regimeType": "Ốm đau ngắn ngày",
                    "leaveDays": 3,
                    "calculatedAmount": 2500000,
                    "bankAccount": "123456 - Synthetic Bank",
                    "approvalStatus": "Giả trạng thái do client gửi"
                })
            } else {
                json!({ "key": "payroll-api-test", "month": "2099-01" })
            };

            let denied_write = app
                .clone()
                .oneshot(
                    Request::post(format!("/api/v1/collections/{scope}"))
                        .header(AUTHORIZATION, &employee_bearer)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(json!({ "record": new_record }).to_string()))
                        .expect("employee restricted collection create request"),
                )
                .await
                .expect("employee restricted collection create response");
            assert_eq!(
                denied_write.status(),
                StatusCode::FORBIDDEN,
                "scope={scope}"
            );

            let created = app
                .clone()
                .oneshot(
                    Request::post(format!("/api/v1/collections/{scope}"))
                        .header(AUTHORIZATION, &admin_bearer)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(json!({ "record": new_record }).to_string()))
                        .expect("admin restricted collection create request"),
                )
                .await
                .expect("admin restricted collection create response");
            assert_eq!(created.status(), StatusCode::CREATED, "scope={scope}");

            if ["insurance_adjustments", "insurance_regimes"].contains(&scope) {
                let duplicate = app
                    .clone()
                    .oneshot(
                        Request::post(format!("/api/v1/collections/{scope}"))
                            .header(AUTHORIZATION, &admin_bearer)
                            .header(CONTENT_TYPE, "application/json")
                            .body(Body::from(json!({ "record": new_record }).to_string()))
                            .expect("duplicate Insurance create request"),
                    )
                    .await
                    .expect("duplicate Insurance create response");
                assert_eq!(duplicate.status(), StatusCode::CONFLICT, "scope={scope}");
            }

            let persisted = app
                .clone()
                .oneshot(
                    Request::get(format!("/api/v1/collections/{scope}"))
                        .header(AUTHORIZATION, &admin_bearer)
                        .body(Body::empty())
                        .expect("admin persisted collection read request"),
                )
                .await
                .expect("admin persisted collection read response");
            let body = axum::body::to_bytes(persisted.into_body(), 16 * 1024)
                .await
                .expect("persisted collection response body");
            let payload: Value = serde_json::from_slice(&body).expect("persisted collection JSON");
            assert_eq!(
                payload["data"].as_array().unwrap().len(),
                2,
                "scope={scope}"
            );
            let persisted_record = payload["data"]
                .as_array()
                .unwrap()
                .iter()
                .find(|row| row["key"] == new_record["key"])
                .expect("new insurance record is readable");
            if scope == "insurance_regimes" {
                assert_eq!(persisted_record["bankAccount"], "123456 - Synthetic Bank");
                assert_eq!(persisted_record["approvalStatus"], "Đang thẩm định");
                assert_eq!(persisted_record["settlementDate"], "Chờ duyệt");
                assert_eq!(
                    persisted_record["providerSubmissionStatus"],
                    "Chưa gửi · chưa kết nối Cổng eBH"
                );
                let db = state.db.lock().await;
                let raw: String = db
                    .query_row(
                        "SELECT record_json FROM collection_records WHERE scope='insurance_regimes' AND record_key='insurance-regime-api-test'",
                        [],
                        |row| row.get(0),
                    )
                    .expect("encrypted insurance regime is stored");
                let stored: Value = serde_json::from_str(&raw).expect("stored regime JSON");
                assert!(stored["bankAccount"].as_str().unwrap().starts_with("ENC:"));
                assert_ne!(stored["bankAccount"], "123456 - Synthetic Bank");
            } else if scope == "insurance_adjustments" {
                assert_eq!(persisted_record["d02Code"], "D02-API-TEST");
                assert_eq!(
                    persisted_record["vssSubmissionStatus"],
                    "Chưa gửi · chưa kết nối Cổng eBH"
                );
            } else {
                assert_eq!(persisted_record["month"], "2099-01");
            }
        }

        for scope in ["insurance_adjustments", "insurance_regimes"] {
            let replace = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(Method::PUT)
                        .uri(format!("/api/v1/collections/{scope}"))
                        .header(AUTHORIZATION, &admin_bearer)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(json!({ "records": [] }).to_string()))
                        .expect("generic Insurance replacement request"),
                )
                .await
                .expect("generic Insurance replacement response");
            assert_eq!(replace.status(), StatusCode::BAD_REQUEST, "scope={scope}");

            let patch = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(Method::PATCH)
                        .uri(format!("/api/v1/collections/{scope}/legacy-key"))
                        .header(AUTHORIZATION, &admin_bearer)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(json!({ "patch": {} }).to_string()))
                        .expect("generic Insurance patch request"),
                )
                .await
                .expect("generic Insurance patch response");
            assert_eq!(patch.status(), StatusCode::BAD_REQUEST, "scope={scope}");

            let delete = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(Method::DELETE)
                        .uri(format!("/api/v1/collections/{scope}/legacy-key"))
                        .header(AUTHORIZATION, &admin_bearer)
                        .body(Body::empty())
                        .expect("generic Insurance delete request"),
                )
                .await
                .expect("generic Insurance delete response");
            assert_eq!(delete.status(), StatusCode::BAD_REQUEST, "scope={scope}");
        }

        let mut missing_key_state = state.clone();
        missing_key_state.crm_crypto = None;
        let no_key_app = router(missing_key_state, CorsLayer::new());
        let encrypted_read = no_key_app
            .oneshot(
                Request::get("/api/v1/collections/insurance_regimes")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("encrypted Insurance read without key"),
            )
            .await
            .expect("encrypted Insurance read response");
        assert_eq!(encrypted_read.status(), StatusCode::SERVICE_UNAVAILABLE);

        let db = state.db.lock().await;
        let insurance_events: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM audit_events WHERE resource_scope IN ('insurance_adjustments','insurance_regimes') AND action='create'",
                [],
                |row| row.get(0),
            )
            .expect("Insurance audit event count");
        assert_eq!(insurance_events, 2);
        let regime_details: String = db
            .query_row(
                "SELECT details_json FROM audit_events WHERE resource_scope='insurance_regimes' AND resource_id='insurance-regime-api-test'",
                [],
                |row| row.get(0),
            )
            .expect("Insurance regime audit details");
        let regime_details: Value =
            serde_json::from_str(&regime_details).expect("Insurance regime audit JSON");
        assert_eq!(regime_details["claimCode"], "CD-API-TEST");
        assert!(regime_details.get("bankAccount").is_none());
    }

    #[test]
    fn insurance_benefit_bank_account_requires_an_encryption_key() {
        let (mut state, _) = test_state();
        state.crm_crypto = None;
        let error = encrypt_insurance_bank_account(&state, "123456 - Synthetic Bank")
            .expect_err("missing key must fail closed");
        assert!(error.1.contains("khóa mã hóa"));
    }

    #[tokio::test]
    async fn attendance_shift_collection_is_admin_only_validated_and_persistent() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-attendance-shifts".to_owned(),
            email: "admin.attendance@example.test".to_owned(),
            name: "Attendance Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("AttendanceAdmin-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let shift = json!({
            "key":"shift-1",
            "id":"legacy-row-1",
            "shiftCode":"CA-HC-01",
            "shiftName":"Ca hành chính",
            "timeRange":"08:00 - 17:30",
            "startTime":"08:00",
            "endTime":"17:30",
            "workingHours":8.0,
            "workUnits":1.0,
            "breakTime":"12:00 - 13:30 (1.5h)",
            "applicableTo":"Khối văn phòng",
            "allowGraceMinutes":15,
            "nightAllowancePct":0,
            "shiftCategory":"Hành chính",
            "status":"Đang áp dụng",
            "legacyNote":"preserve this field"
        });
        let initial_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/attendance_shifts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("initial admin list shifts request"),
            )
            .await
            .expect("initial admin list shifts response");
        assert_eq!(initial_list.status(), StatusCode::OK);
        let initial_body = axum::body::to_bytes(initial_list.into_body(), 16 * 1024)
            .await
            .expect("initial attendance shifts body");
        let initial_body: Value =
            serde_json::from_slice(&initial_body).expect("initial attendance shifts JSON");
        let initial_revision = initial_body["revision"]
            .as_str()
            .expect("initial revision")
            .to_owned();
        assert_eq!(initial_revision.len(), 64);

        let missing_revision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/attendance_shifts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"records":[shift.clone()]}).to_string()))
                    .expect("missing revision replacement request"),
            )
            .await
            .expect("missing revision replacement response");
        assert_eq!(missing_revision.status(), StatusCode::BAD_REQUEST);

        let replaced = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/attendance_shifts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "records":[shift.clone()],
                            "expectedRevision":initial_revision.clone()
                        })
                        .to_string(),
                    ))
                    .expect("replace shifts request"),
            )
            .await
            .expect("replace shifts response");
        assert_eq!(replaced.status(), StatusCode::OK);
        let replaced_body = axum::body::to_bytes(replaced.into_body(), 16 * 1024)
            .await
            .expect("replace shifts body");
        let replaced_records: Value =
            serde_json::from_slice(&replaced_body).expect("replaced shifts JSON");
        assert_eq!(replaced_records["data"][0]["key"], "shift-1");
        assert_eq!(
            replaced_records["data"][0]["legacyNote"],
            "preserve this field"
        );
        let current_revision = replaced_records["revision"]
            .as_str()
            .expect("replacement revision")
            .to_owned();
        assert_eq!(current_revision.len(), 64);
        assert_ne!(current_revision, initial_revision);

        let stale_replace = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/attendance_shifts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"records":[],"expectedRevision":initial_body["revision"]})
                            .to_string(),
                    ))
                    .expect("stale replacement request"),
            )
            .await
            .expect("stale replacement response");
        assert_eq!(stale_replace.status(), StatusCode::CONFLICT);

        let duplicate = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/attendance_shifts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "records":[shift.clone(),shift.clone()],
                            "expectedRevision":current_revision
                        })
                        .to_string(),
                    ))
                    .expect("duplicate shift replacement request"),
            )
            .await
            .expect("duplicate shift replacement response");
        assert_eq!(duplicate.status(), StatusCode::BAD_REQUEST);

        let forbidden_replace = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/attendance_shifts")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"records":[]}).to_string()))
                    .expect("employee replace shifts request"),
            )
            .await
            .expect("employee replace shifts response");
        assert_eq!(forbidden_replace.status(), StatusCode::FORBIDDEN);

        let forbidden_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/attendance_shifts")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee list shifts request"),
            )
            .await
            .expect("employee list shifts response");
        assert_eq!(forbidden_list.status(), StatusCode::FORBIDDEN);

        let invalid_shift = json!({ "records": [{
            "key":"shift-invalid",
            "shiftCode":"CA-BAD",
            "shiftName":"Invalid shift",
            "timeRange":"08:00 - 17:30",
            "startTime":"08:00",
            "endTime":"17:30",
            "workingHours":8.0,
            "workUnits":0.5,
            "breakTime":"12:00 - 13:00",
            "applicableTo":"All",
            "allowGraceMinutes":15,
            "nightAllowancePct":0,
            "shiftCategory":"Hành chính",
            "status":"Đang áp dụng"
        }], "expectedRevision": current_revision });
        let rejected_replace = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/attendance_shifts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(invalid_shift.to_string()))
                    .expect("invalid shift replacement request"),
            )
            .await
            .expect("invalid shift replacement response");
        assert_eq!(rejected_replace.status(), StatusCode::BAD_REQUEST);

        let list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/attendance_shifts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin list shifts request"),
            )
            .await
            .expect("admin list shifts response");
        assert_eq!(list.status(), StatusCode::OK);
        let body = axum::body::to_bytes(list.into_body(), 16 * 1024)
            .await
            .expect("attendance shifts body");
        let body: Value = serde_json::from_slice(&body).expect("attendance shifts JSON");
        assert_eq!(body["data"][0]["key"], "shift-1");
        assert_eq!(body["data"][0]["shiftCode"], "CA-HC-01");
        assert_eq!(body["data"][0]["id"], "legacy-row-1");
        assert_eq!(body["data"][0]["legacyNote"], "preserve this field");
        assert_eq!(body["revision"], replaced_records["revision"]);

        {
            let db = state.db.lock().await;
            db.execute(
                "UPDATE collection_records SET record_json = 'not-json' WHERE scope = 'attendance_shifts' AND record_key = 'shift-1'",
                [],
            )
            .expect("corrupt legacy row fixture");
        }
        let unreadable = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/attendance_shifts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("unreadable shift list request"),
            )
            .await
            .expect("unreadable shift list response");
        assert_eq!(unreadable.status(), StatusCode::INTERNAL_SERVER_ERROR);

        let stale_against_corrupt_row = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/attendance_shifts")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "records": [],
                            "expectedRevision": current_revision
                        })
                        .to_string(),
                    ))
                    .expect("stale replacement over unreadable row request"),
            )
            .await
            .expect("stale replacement over unreadable row response");
        assert_eq!(stale_against_corrupt_row.status(), StatusCode::CONFLICT);
        let db = state.db.lock().await;
        let preserved_raw: String = db
            .query_row(
                "SELECT record_json FROM collection_records WHERE scope = 'attendance_shifts' AND record_key = 'shift-1'",
                [],
                |row| row.get(0),
            )
            .expect("corrupt raw row remains preserved");
        assert_eq!(preserved_raw, "not-json");
    }

    #[tokio::test]
    async fn leave_request_collection_is_admin_only_validated_and_persistent() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-leave-requests".to_owned(),
            email: "admin.leave@example.test".to_owned(),
            name: "Leave Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "UPDATE users SET name = 'Nguyễn An' WHERE id = ?1",
                params![&employee.id],
            )
            .expect("employee display name update");
            db.execute(
                "INSERT INTO employee_profiles (user_id, employee_code, department, employment_status, created_at, updated_at) VALUES (?1, 'NV-0001', 'Kỹ thuật', 'Chính thức', ?2, ?2)",
                params![&employee.id, &employee.created_at],
            )
            .expect("active employee profile insert");
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("LeaveAdminPassword-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let request = json!({
            "key":"leave-1",
            "code":"NP-2026-001",
            "employeeId":"employee-1",
            "employeeCode":"forged-code",
            "employeeName":"Forged Name",
            "department":"Forged Department",
            "leaveType":"Nghỉ phép năm",
            "startDate":"2026-10-10",
            "endDate":"2026-10-10",
            "daysCount":0.5,
            "reason":"Việc gia đình\nkhẩn cấp",
            "status":"Chờ duyệt",
            "handoverPerson":"Trần Bình",
            "contactPhone":"0900000000",
            "legacyFlag":"preserve"
        });
        let legacy_alias_request = json!({
            "key":"legacy-leave-1",
            "code":"NP-OLD-001",
            "employeeName":"Lê Bình",
            "department":"Kỹ thuật",
            "type":"Nghỉ ốm BHXH",
            "fromDate":"2026-10-11",
            "toDate":"2026-10-11",
            "days":"0.5",
            "reason":"Khám bệnh",
            "status":"Chờ phê duyệt"
        });
        {
            let db = state.db.lock().await;
            let timestamp = Utc::now().to_rfc3339();
            db.execute(
                "INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES ('leave_requests', 'legacy-leave-1', ?1, ?2, ?2)",
                params![legacy_alias_request.to_string(), timestamp],
            )
            .expect("legacy leave request seed");
        }
        let missing_employee_id = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"record": {
                            "key":"leave-missing-employee",
                            "code":"NP-MISSING-EMPLOYEE",
                            "employeeName":"Typed Name",
                            "department":"Kỹ thuật",
                            "leaveType":"Nghỉ phép năm",
                            "startDate":"2026-10-10",
                            "endDate":"2026-10-10",
                            "daysCount":1,
                            "reason":"Việc riêng",
                            "status":"Chờ duyệt"
                        }})
                        .to_string(),
                    ))
                    .expect("missing employee id create request"),
            )
            .await
            .expect("missing employee id create response");
        assert_eq!(missing_employee_id.status(), StatusCode::BAD_REQUEST);
        let server_derived_post = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"record": {
                            "key":"leave-derived-only",
                            "code":"NP-DERIVED-ONLY",
                            "employeeId":"employee-1",
                            "leaveType":"Nghỉ phép năm",
                            "startDate":"2026-10-10",
                            "endDate":"2026-10-10",
                            "daysCount":1,
                            "reason":"Hồ sơ nhân viên do máy chủ xác định",
                            "status":"Chờ duyệt"
                        }})
                        .to_string(),
                    ))
                    .expect("server-derived identity POST request"),
            )
            .await
            .expect("server-derived identity POST response");
        assert_eq!(server_derived_post.status(), StatusCode::CREATED);
        let derived_body = axum::body::to_bytes(server_derived_post.into_body(), 16 * 1024)
            .await
            .expect("server-derived identity POST body");
        let derived_body: Value =
            serde_json::from_slice(&derived_body).expect("server-derived identity POST JSON");
        assert_eq!(derived_body["record"]["employeeId"], "employee-1");
        assert_eq!(derived_body["record"]["employeeCode"], "NV-0001");
        assert_eq!(derived_body["record"]["employeeName"], "Nguyễn An");
        assert_eq!(derived_body["record"]["department"], "Kỹ thuật");
        let initial_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("initial admin leave request list"),
            )
            .await
            .expect("initial admin leave request list response");
        assert_eq!(initial_list.status(), StatusCode::OK);
        let initial_body = axum::body::to_bytes(initial_list.into_body(), 16 * 1024)
            .await
            .expect("initial leave request list body");
        let initial_body: Value =
            serde_json::from_slice(&initial_body).expect("initial leave request list JSON");
        let initial_revision = initial_body["revision"]
            .as_str()
            .expect("initial leave request revision")
            .to_owned();
        assert_eq!(initial_revision.len(), 64);

        let missing_revision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"records":[request.clone()]}).to_string()))
                    .expect("missing leave revision request"),
            )
            .await
            .expect("missing leave revision response");
        assert_eq!(missing_revision.status(), StatusCode::BAD_REQUEST);

        let saved = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "records":[request.clone(), legacy_alias_request.clone()],
                            "expectedRevision":initial_revision.clone()
                        })
                        .to_string(),
                    ))
                    .expect("save leave request collection"),
            )
            .await
            .expect("saved leave request response");
        assert_eq!(saved.status(), StatusCode::OK);
        let saved_body = axum::body::to_bytes(saved.into_body(), 16 * 1024)
            .await
            .expect("saved leave request body");
        let saved_body: Value =
            serde_json::from_slice(&saved_body).expect("saved leave request JSON");
        let current_revision = saved_body["revision"]
            .as_str()
            .expect("saved leave request revision")
            .to_owned();
        assert_eq!(current_revision.len(), 64);
        assert_ne!(current_revision, initial_revision);
        let canonical_saved = saved_body["data"]
            .as_array()
            .and_then(|records| records.iter().find(|record| record["key"] == "leave-1"))
            .expect("new request in save response");
        assert_eq!(canonical_saved["employeeId"], "employee-1");
        assert_eq!(canonical_saved["employeeCode"], "NV-0001");
        assert_eq!(canonical_saved["employeeName"], "Nguyễn An");
        assert_eq!(canonical_saved["department"], "Kỹ thuật");

        let stale_replace = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "records": [],
                            "expectedRevision": initial_revision
                        })
                        .to_string(),
                    ))
                    .expect("stale leave replacement request"),
            )
            .await
            .expect("stale leave replacement response");
        assert_eq!(stale_replace.status(), StatusCode::CONFLICT);

        let duplicate_key = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "records":[request.clone(), request.clone()],
                            "expectedRevision":current_revision.clone()
                        })
                        .to_string(),
                    ))
                    .expect("duplicate leave key request"),
            )
            .await
            .expect("duplicate leave key response");
        assert_eq!(duplicate_key.status(), StatusCode::BAD_REQUEST);

        let duplicate_code = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"records":[request.clone(), {
                            "key":"leave-2",
                            "code":"np-2026-001",
                            "employeeId":"employee-1",
                            "employeeCode":"NV-0001",
                            "employeeName":"Lê Bình",
                            "department":"Kỹ thuật",
                            "leaveType":"Nghỉ phép năm",
                            "startDate":"2026-10-11",
                            "endDate":"2026-10-11",
                            "daysCount":1,
                            "reason":"Việc riêng",
                            "status":"Chờ duyệt"
                        }], "expectedRevision":current_revision.clone()})
                        .to_string(),
                    ))
                    .expect("duplicate leave code request"),
            )
            .await
            .expect("duplicate leave code response");
        assert_eq!(duplicate_code.status(), StatusCode::BAD_REQUEST);

        let duplicate_code_create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"record": {
                            "key":"leave-duplicate-code",
                            "code":"np-2026-001",
                            "employeeId":"employee-1",
                            "employeeName":"Lê Bình",
                            "department":"Kỹ thuật",
                            "leaveType":"Nghỉ phép năm",
                            "startDate":"2026-10-11",
                            "endDate":"2026-10-11",
                            "daysCount":1,
                            "reason":"Việc riêng",
                            "status":"Chờ duyệt"
                        }})
                        .to_string(),
                    ))
                    .expect("duplicate leave code create request"),
            )
            .await
            .expect("duplicate leave code create response");
        assert_eq!(duplicate_code_create.status(), StatusCode::CONFLICT);

        let duplicate_code_patch = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/collections/leave_requests/legacy-leave-1")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"patch":{"code":"NP-2026-001"}}).to_string(),
                    ))
                    .expect("duplicate leave code patch request"),
            )
            .await
            .expect("duplicate leave code patch response");
        assert_eq!(duplicate_code_patch.status(), StatusCode::CONFLICT);

        let invalid_range = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"records":[{
                            "key":"leave-invalid",
                            "code":"NP-INVALID",
                            "employeeName":"Lê Bình",
                            "department":"Kỹ thuật",
                            "leaveType":"Nghỉ phép năm",
                            "startDate":"2026-10-12",
                            "endDate":"2026-10-11",
                            "daysCount":1,
                            "reason":"Việc riêng",
                            "status":"Chờ duyệt"
                        }], "expectedRevision":current_revision.clone()})
                        .to_string(),
                    ))
                    .expect("invalid leave date request"),
            )
            .await
            .expect("invalid leave date response");
        assert_eq!(invalid_range.status(), StatusCode::BAD_REQUEST);

        for scope in ["leave_requests", "employee_leaves"] {
            let forbidden = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/v1/collections/{scope}"))
                        .header(AUTHORIZATION, &employee_bearer)
                        .body(Body::empty())
                        .expect("employee leave collection request"),
                )
                .await
                .expect("employee leave collection response");
            assert_eq!(forbidden.status(), StatusCode::FORBIDDEN);
        }

        let employee_leaves_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/employee_leaves")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin employee-leaves list"),
            )
            .await
            .expect("admin employee-leaves response");
        assert_eq!(employee_leaves_list.status(), StatusCode::OK);
        let employee_leaves_body =
            axum::body::to_bytes(employee_leaves_list.into_body(), 16 * 1024)
                .await
                .expect("employee-leaves body");
        let employee_leaves_body: Value =
            serde_json::from_slice(&employee_leaves_body).expect("employee-leaves JSON");
        let employee_leaves_revision = employee_leaves_body["revision"]
            .as_str()
            .expect("employee-leaves revision");
        assert_eq!(employee_leaves_revision.len(), 64);
        let missing_employee_leaves_revision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/employee_leaves")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"records": []}).to_string()))
                    .expect("missing employee-leaves revision request"),
            )
            .await
            .expect("missing employee-leaves revision response");
        assert_eq!(
            missing_employee_leaves_revision.status(),
            StatusCode::BAD_REQUEST
        );

        let forbidden_write = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"records":[]}).to_string()))
                    .expect("employee leave write request"),
            )
            .await
            .expect("employee leave write response");
        assert_eq!(forbidden_write.status(), StatusCode::FORBIDDEN);

        let list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/leave_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin leave request list"),
            )
            .await
            .expect("admin leave request list response");
        assert_eq!(list.status(), StatusCode::OK);
        let body = axum::body::to_bytes(list.into_body(), 16 * 1024)
            .await
            .expect("leave request list body");
        let body: Value = serde_json::from_slice(&body).expect("leave request list JSON");
        assert_eq!(body["revision"], current_revision);
        let records = body["data"].as_array().expect("leave request records");
        let canonical = records
            .iter()
            .find(|record| record["code"] == "NP-2026-001")
            .expect("canonical leave record");
        let legacy = records
            .iter()
            .find(|record| record["code"] == "NP-OLD-001")
            .expect("legacy alias leave record");
        assert_eq!(canonical["legacyFlag"], "preserve");
        assert_eq!(canonical["reason"], "Việc gia đình\nkhẩn cấp");
        assert_eq!(legacy["type"], "Nghỉ ốm BHXH");
        assert_eq!(legacy["days"], "0.5");

        let linked_identity_edit = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/collections/leave_requests/leave-1")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"patch":{"employeeName":"Forged Later"}}).to_string(),
                    ))
                    .expect("linked leave identity edit request"),
            )
            .await
            .expect("linked leave identity edit response");
        assert_eq!(linked_identity_edit.status(), StatusCode::BAD_REQUEST);

        let legacy_identity_edit = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/collections/leave_requests/legacy-leave-1")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"patch":{"employeeName":"Forged Legacy"}}).to_string(),
                    ))
                    .expect("legacy leave identity edit request"),
            )
            .await
            .expect("legacy leave identity edit response");
        assert_eq!(legacy_identity_edit.status(), StatusCode::BAD_REQUEST);

        let legacy_status_update = app
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri("/api/v1/collections/leave_requests/legacy-leave-1")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"patch":{"status":"Đang xử lý"}}).to_string(),
                    ))
                    .expect("legacy leave status update request"),
            )
            .await
            .expect("legacy leave status update response");
        assert_eq!(legacy_status_update.status(), StatusCode::OK);
        let updated_legacy = axum::body::to_bytes(legacy_status_update.into_body(), 16 * 1024)
            .await
            .expect("updated legacy leave response body");
        let updated_legacy: Value =
            serde_json::from_slice(&updated_legacy).expect("updated legacy leave response JSON");
        assert_eq!(updated_legacy["record"]["status"], "Đang xử lý");
        assert_eq!(updated_legacy["record"]["type"], "Nghỉ ốm BHXH");
        assert_eq!(updated_legacy["record"]["days"], "0.5");
        assert_eq!(updated_legacy["record"]["employeeName"], "Lê Bình");
    }

    #[tokio::test]
    async fn org_unit_collection_persists_and_restricts_mutations_to_admins() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-org-units".to_owned(),
            email: "admin.org@example.test".to_owned(),
            name: "Org Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO employee_profiles (user_id,employee_code,department,created_at,updated_at) VALUES (?1,'NV-0001','Operations',?2,?2)",
                params![&employee.id, &employee.created_at],
            )
            .expect("employee profile insert");
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("OrgAdminPassword-123!").expect("password hash"),
                    &admin.created_at,
                ],
            )
            .expect("admin insert");
        }
        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let records = json!({
            "records": [{
                "key": "ou-finance",
                "code": "FIN",
                "name": "Tài chính",
                "parentUnit": "Khối vận hành",
                "manager": "Employee",
                "headcountLimit": 12,
                "annualBudget": 1200000000,
                "budgetSpent": 300000000,
                "status": "Đang hoạt động"
            }]
        });
        let cycle = json!({
            "records": [
                {"key":"ou-a","code":"A","name":"A","parentUnit":"B"},
                {"key":"ou-b","code":"B","name":"B","parentUnit":"A"}
            ]
        });
        let rejected_cycle = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/business_org_units")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(cycle.to_string()))
                    .expect("cyclic hierarchy request"),
            )
            .await
            .expect("cyclic hierarchy response");
        assert_eq!(rejected_cycle.status(), StatusCode::BAD_REQUEST);
        let saved = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/business_org_units")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(records.to_string()))
                    .expect("replace units request"),
            )
            .await
            .expect("replace units response");
        assert_eq!(saved.status(), StatusCode::OK);
        {
            let db = state.db.lock().await;
            let department: String = db
                .query_row(
                    "SELECT department FROM employee_profiles WHERE user_id = ?1",
                    params![&employee.id],
                    |row| row.get(0),
                )
                .expect("manager department");
            assert_eq!(department, "Operations, Tài chính");
        }

        let employee_write = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/business_org_units")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(records.to_string()))
                    .expect("non-admin replace request"),
            )
            .await
            .expect("non-admin replace response");
        assert_eq!(employee_write.status(), StatusCode::FORBIDDEN);

        let list = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::GET)
                    .uri("/api/v1/collections/business_org_units")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("list units request"),
            )
            .await
            .expect("list units response");
        assert_eq!(list.status(), StatusCode::OK);
        let body = axum::body::to_bytes(list.into_body(), 8192)
            .await
            .expect("list units body");
        let body: Value = serde_json::from_slice(&body).expect("units response JSON");
        assert_eq!(body["data"][0]["key"], "ou-finance");
        assert_eq!(body["data"][0]["annualBudget"], 1_200_000_000_i64);

        let hierarchy = json!({
            "records": [
                {"key":"ou-finance","code":"FIN","name":"Tài chính","manager":"Employee"},
                {"key":"ou-audit","code":"AUD","name":"Kiểm toán","parentUnit":"Tài chính"}
            ]
        });
        let hierarchy_saved = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/business_org_units")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(hierarchy.to_string()))
                    .expect("save hierarchy request"),
            )
            .await
            .expect("save hierarchy response");
        assert_eq!(hierarchy_saved.status(), StatusCode::OK);
        let parent_delete = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri("/api/v1/collections/business_org_units/ou-finance")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("parent delete request"),
            )
            .await
            .expect("parent delete response");
        assert_eq!(parent_delete.status(), StatusCode::CONFLICT);

        let restore = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/business_org_units")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(records.to_string()))
                    .expect("restore units request"),
            )
            .await
            .expect("restore units response");
        assert_eq!(restore.status(), StatusCode::OK);

        let deleted = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri("/api/v1/collections/business_org_units/ou-finance")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("delete unit request"),
            )
            .await
            .expect("delete unit response");
        assert_eq!(deleted.status(), StatusCode::OK);
        let db = state.db.lock().await;
        let department: String = db
            .query_row(
                "SELECT department FROM employee_profiles WHERE user_id = ?1",
                params![&employee.id],
                |row| row.get(0),
            )
            .expect("employee department after delete");
        assert_eq!(department, "Operations");
    }

    #[tokio::test]
    async fn workflow_blueprints_are_typed_admin_only_and_generic_writes_are_blocked() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-workflows-1".to_owned(),
            email: "workflow-admin@example.test".to_owned(),
            name: "Workflow Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("AdminPassword-123!").expect("password hash"),
                    &admin.created_at,
                    &admin.updated_at,
                ],
            )
            .expect("admin insert");
        }
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let app = router(state.clone(), CorsLayer::new());
        let input = json!({
            "workflowCode":"WF-CUSTOM-01",
            "workflowName":"Đề xuất mua sắm",
            "category":"Mua sắm & Tài sản",
            "description":"Thiết bị văn phòng",
            "scope":"Toàn công ty",
            "totalSteps":3,
            "slaTargetHours":8,
            "applicableBudgetLimit":100000000,
            "version":"v1.0"
        });
        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/workflows/blueprints")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(input.to_string()))
                    .expect("create blueprint request"),
            )
            .await
            .expect("create blueprint response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 16 * 1024)
            .await
            .expect("created blueprint body");
        let created: Value = serde_json::from_slice(&body).expect("created blueprint JSON");
        let blueprint = &created["blueprint"];
        assert_eq!(blueprint["workflowCode"], "WF-CUSTOM-01");
        assert_eq!(blueprint["createdBy"], "Workflow Admin");
        assert_eq!(blueprint["approvalFlow"].as_array().unwrap().len(), 3);
        assert_eq!(blueprint["approvalFlow"][1]["requireTokenPKI"], true);
        assert!(
            blueprint["approvalFlow"][1]
                .get("requireTokenPki")
                .is_none()
        );
        assert_eq!(blueprint["activeInstancesCount"], 0);
        assert_eq!(blueprint["totalCompletedCount"], 0);
        assert_eq!(blueprint["passRate"], 0.0);
        let workflow_key = blueprint["key"].as_str().unwrap().to_owned();

        let mut duplicate_input = input.clone();
        duplicate_input["workflowCode"] = json!("wf-custom-01");
        let duplicate = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/workflows/blueprints")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(duplicate_input.to_string()))
                    .expect("duplicate blueprint request"),
            )
            .await
            .expect("duplicate blueprint response");
        assert_eq!(duplicate.status(), StatusCode::CONFLICT);

        let changed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!(
                        "/api/v1/workflows/blueprints/{workflow_key}/status"
                    ))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "status": "Tạm ngưng" }).to_string()))
                    .expect("status update request"),
            )
            .await
            .expect("status update response");
        assert_eq!(changed.status(), StatusCode::OK);

        let listed = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/workflows/blueprints")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("list blueprints request"),
            )
            .await
            .expect("list blueprints response");
        assert_eq!(listed.status(), StatusCode::OK);
        let body = axum::body::to_bytes(listed.into_body(), 16 * 1024)
            .await
            .expect("listed blueprints body");
        let listed: Value = serde_json::from_slice(&body).expect("listed blueprints JSON");
        assert_eq!(listed["data"][0]["status"], "Tạm ngưng");

        let employee_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/workflows/blueprints")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee blueprint list request"),
            )
            .await
            .expect("employee blueprint list response");
        assert_eq!(employee_read.status(), StatusCode::FORBIDDEN);

        let employee_generic_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/workflow_blueprints")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee generic blueprint list request"),
            )
            .await
            .expect("employee generic blueprint list response");
        assert_eq!(employee_generic_read.status(), StatusCode::FORBIDDEN);

        let admin_settings_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/workflow_settings")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin workflow settings list request"),
            )
            .await
            .expect("admin workflow settings list response");
        assert_eq!(admin_settings_read.status(), StatusCode::OK);

        let employee_settings_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/workflow_settings")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee workflow settings list request"),
            )
            .await
            .expect("employee workflow settings list response");
        assert_eq!(employee_settings_read.status(), StatusCode::FORBIDDEN);

        let generic_write = app
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/collections/workflow_blueprints")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({ "record": { "key": "bypass", "workflowCode": "BYPASS" } })
                            .to_string(),
                    ))
                    .expect("generic blueprint write request"),
            )
            .await
            .expect("generic blueprint write response");
        assert_eq!(generic_write.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn workflow_requests_persist_with_immutable_submission_history_and_admin_access() {
        let (state, employee) = test_state();
        let admin = User {
            id: "admin-workflow-request-1".to_owned(),
            email: "workflow-request-admin@example.test".to_owned(),
            name: "Workflow Request Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        let reviewer = User {
            id: "admin-workflow-reviewer-1".to_owned(),
            email: "workflow-reviewer@example.test".to_owned(),
            name: "Workflow Reviewer".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("AdminPassword-123!").expect("password hash"),
                    &admin.created_at,
                    &admin.updated_at,
                ],
            )
            .expect("admin insert");
            db.execute(
                "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
                params![
                    &reviewer.id,
                    &reviewer.email,
                    &reviewer.name,
                    &reviewer.role,
                    password_hash("ReviewerPassword-123!").expect("reviewer password hash"),
                    &reviewer.created_at,
                    &reviewer.updated_at,
                ],
            )
            .expect("reviewer insert");
        }
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let reviewer_bearer = format!(
            "Bearer {}",
            issue_token(&state, &reviewer).expect("reviewer token")
        );
        let app = router(state.clone(), CorsLayer::new());
        let blueprint_input = json!({
            "workflowCode":"WF-REQUEST-TEST",
            "workflowName":"Đề xuất mua sắm",
            "category":"Mua sắm & Tài sản",
            "description":"Mẫu kiểm thử",
            "scope":"Toàn công ty",
            "totalSteps":2,
            "slaTargetHours":8,
            "applicableBudgetLimit":100000000,
            "version":"v1.0"
        });
        let blueprint = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/workflows/blueprints")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(blueprint_input.to_string()))
                    .expect("blueprint request"),
            )
            .await
            .expect("blueprint response");
        assert_eq!(blueprint.status(), StatusCode::CREATED);

        let request_input = json!({
            "code":"WF-2026-0001",
            "workflowCode":"WF-REQUEST-TEST",
            "workflowName":"Đề xuất thiết bị cho vận hành",
            "requester":"Nguyễn An",
            "department":"Vận hành",
            "summaryDetails":"Mua thiết bị phục vụ công việc",
            "budgetAmount":1250000,
            "priority":"Bình thường (P3)"
        });
        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/workflows/requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(request_input.to_string()))
                    .expect("create workflow request"),
            )
            .await
            .expect("create workflow response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 16 * 1024)
            .await
            .expect("created workflow body");
        let created: Value = serde_json::from_slice(&body).expect("created workflow JSON");
        let record = &created["request"];
        assert_eq!(record["code"], "WF-2026-0001");
        assert_eq!(record["workflowName"], "Đề xuất thiết bị cho vận hành");
        assert_eq!(record["requester"], "Nguyễn An");
        assert_eq!(record["status"], "Chờ duyệt");
        assert_eq!(record["totalLevels"], 2);
        assert_eq!(record["attachments"], json!([]));
        assert_eq!(record["approvalHistory"].as_array().unwrap().len(), 1);
        assert_eq!(record["approvalHistory"][0]["action"], "submitted");
        assert_eq!(
            record["approvalHistory"][0]["actorUserId"].as_str(),
            Some(admin.id.as_str())
        );
        assert_eq!(record["pkiIntegrationAvailable"], false);
        let request_key = record["key"].as_str().expect("request key").to_owned();

        let listed = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/workflows/requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("list workflow requests"),
            )
            .await
            .expect("list workflow response");
        assert_eq!(listed.status(), StatusCode::OK);
        let body = axum::body::to_bytes(listed.into_body(), 16 * 1024)
            .await
            .expect("listed workflow body");
        let listed: Value = serde_json::from_slice(&body).expect("listed workflow JSON");
        assert_eq!(listed["data"].as_array().unwrap().len(), 1);
        assert_eq!(
            listed["data"][0]["approvalHistory"]
                .as_array()
                .unwrap()
                .len(),
            1
        );

        let dashboard = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/dashboard/stats")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("dashboard workflow request"),
            )
            .await
            .expect("dashboard workflow response");
        assert_eq!(dashboard.status(), StatusCode::OK);
        let body = axum::body::to_bytes(dashboard.into_body(), 16 * 1024)
            .await
            .expect("dashboard workflow body");
        let dashboard: Value = serde_json::from_slice(&body).expect("dashboard workflow JSON");
        assert_eq!(dashboard["pendingApprovalsCount"], 1);
        assert_eq!(
            dashboard["pendingWorkflows"][0]["title"],
            "Đề xuất thiết bị cho vận hành"
        );

        let creator_decision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!(
                        "/api/v1/workflows/requests/{request_key}/decisions"
                    ))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "action": "approve" }).to_string()))
                    .expect("creator decision request"),
            )
            .await
            .expect("creator decision response");
        assert_eq!(creator_decision.status(), StatusCode::FORBIDDEN);

        let ordinary_approval = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!(
                        "/api/v1/workflows/requests/{request_key}/decisions"
                    ))
                    .header(AUTHORIZATION, &reviewer_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "action":"approve",
                            "note":"Đã kiểm tra đề xuất cấp 1"
                        })
                        .to_string(),
                    ))
                    .expect("ordinary approval request"),
            )
            .await
            .expect("ordinary approval response");
        assert_eq!(ordinary_approval.status(), StatusCode::OK);
        let body = axum::body::to_bytes(ordinary_approval.into_body(), 16 * 1024)
            .await
            .expect("ordinary approval body");
        let ordinary_approval: Value =
            serde_json::from_slice(&body).expect("ordinary approval JSON");
        let approved_request = &ordinary_approval["request"];
        assert_eq!(approved_request["currentLevel"], 2);
        assert_eq!(approved_request["status"], "Chờ ký số");
        assert_eq!(approved_request["tokenRequired"], true);
        assert_eq!(
            approved_request["approvalHistory"]
                .as_array()
                .unwrap()
                .len(),
            2
        );
        assert_eq!(approved_request["approvalHistory"][1]["level"], 1);
        assert_eq!(
            approved_request["approvalHistory"][1]["signatureStatus"],
            "not_signed"
        );

        let pki_bypass = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!(
                        "/api/v1/workflows/requests/{request_key}/decisions"
                    ))
                    .header(AUTHORIZATION, &reviewer_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "action": "approve" }).to_string()))
                    .expect("PKI step decision request"),
            )
            .await
            .expect("PKI step decision response");
        assert_eq!(pki_bypass.status(), StatusCode::SERVICE_UNAVAILABLE);

        let after_pki_rejection = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/workflows/requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("list requests after blocked PKI step"),
            )
            .await
            .expect("list after blocked PKI step response");
        let body = axum::body::to_bytes(after_pki_rejection.into_body(), 16 * 1024)
            .await
            .expect("list after blocked PKI step body");
        let after_pki_rejection: Value =
            serde_json::from_slice(&body).expect("list after blocked PKI step JSON");
        assert_eq!(after_pki_rejection["data"][0]["status"], "Chờ ký số");
        assert_eq!(
            after_pki_rejection["data"][0]["approvalHistory"]
                .as_array()
                .unwrap()
                .len(),
            2
        );

        let single_step_blueprint = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/workflows/blueprints")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "workflowCode":"WF-REQUEST-ONE-STEP",
                            "workflowName":"Luồng kiểm thử một bước",
                            "category":"Mua sắm & Tài sản",
                            "description":"Mẫu kiểm thử quyết định cuối",
                            "scope":"Toàn công ty",
                            "totalSteps":1,
                            "slaTargetHours":8,
                            "applicableBudgetLimit":100000000,
                            "version":"v1.0"
                        })
                        .to_string(),
                    ))
                    .expect("single-step blueprint request"),
            )
            .await
            .expect("single-step blueprint response");
        assert_eq!(single_step_blueprint.status(), StatusCode::CREATED);
        for (code, action, expected_status, expected_event) in [
            ("WF-2026-0003", "reject", "Đã từ chối", "rejected"),
            ("WF-2026-0004", "return", "Yêu cầu bổ sung", "returned"),
            ("WF-2026-0005", "approve", "Đã phê duyệt", "approved"),
        ] {
            let created = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(Method::POST)
                        .uri("/api/v1/workflows/requests")
                        .header(AUTHORIZATION, &admin_bearer)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(
                            json!({
                                "code":code,
                                "workflowCode":"WF-REQUEST-ONE-STEP",
                                "workflowName":"Hồ sơ kiểm thử quyết định",
                                "requester":"Nguyễn An",
                                "department":"Vận hành",
                                "summaryDetails":"Kiểm tra trạng thái quyết định",
                                "budgetAmount":1250000,
                                "priority":"Bình thường (P3)"
                            })
                            .to_string(),
                        ))
                        .expect("single-step workflow request"),
                )
                .await
                .expect("single-step workflow response");
            assert_eq!(created.status(), StatusCode::CREATED);
            let body = axum::body::to_bytes(created.into_body(), 16 * 1024)
                .await
                .expect("single-step workflow body");
            let created: Value = serde_json::from_slice(&body).expect("single-step workflow JSON");
            let key = created["request"]["key"]
                .as_str()
                .expect("single-step request key")
                .to_owned();
            let decision = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(Method::POST)
                        .uri(format!("/api/v1/workflows/requests/{key}/decisions"))
                        .header(AUTHORIZATION, &reviewer_bearer)
                        .header(CONTENT_TYPE, "application/json")
                        .body(Body::from(
                            json!({ "action":action, "note":"Lý do kiểm thử" }).to_string(),
                        ))
                        .expect("single-step decision request"),
                )
                .await
                .expect("single-step decision response");
            assert_eq!(decision.status(), StatusCode::OK);
            let body = axum::body::to_bytes(decision.into_body(), 16 * 1024)
                .await
                .expect("single-step decision body");
            let decision: Value = serde_json::from_slice(&body).expect("single-step decision JSON");
            assert_eq!(decision["request"]["status"], expected_status);
            assert_eq!(
                decision["request"]["approvalHistory"][1]["action"],
                expected_event
            );
            assert_eq!(
                decision["request"]["approvalHistory"][1]["note"],
                "Lý do kiểm thử"
            );
            assert_eq!(
                decision["request"]["approvalHistory"][1]["signatureStatus"],
                "not_signed"
            );
        }

        let duplicate = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/workflows/requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(request_input.to_string()))
                    .expect("duplicate workflow request"),
            )
            .await
            .expect("duplicate workflow response");
        assert_eq!(duplicate.status(), StatusCode::CONFLICT);

        let over_budget = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/workflows/requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "code":"WF-2026-0002",
                            "workflowCode":"WF-REQUEST-TEST",
                            "workflowName":"Đề xuất vượt hạn mức",
                            "requester":"Nguyễn An",
                            "department":"Vận hành",
                            "summaryDetails":"Vượt hạn mức",
                            "budgetAmount":100000001,
                            "priority":"Bình thường (P3)"
                        })
                        .to_string(),
                    ))
                    .expect("over-budget workflow request"),
            )
            .await
            .expect("over-budget workflow response");
        assert_eq!(over_budget.status(), StatusCode::BAD_REQUEST);

        let employee_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/workflows/requests")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee workflow list"),
            )
            .await
            .expect("employee workflow response");
        assert_eq!(employee_read.status(), StatusCode::FORBIDDEN);

        let employee_create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/workflows/requests")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "code":"WF-USER-0001",
                            "workflowCode":"WF-REQUEST-TEST",
                            "workflowName":"Yêu cầu từ USER",
                            "requester":"Employee",
                            "department":"Vận hành",
                            "summaryDetails":"Không được tạo qua luồng admin",
                            "budgetAmount":0,
                            "priority":"Bình thường (P3)"
                        })
                        .to_string(),
                    ))
                    .expect("employee workflow create"),
            )
            .await
            .expect("employee workflow create response");
        assert_eq!(employee_create.status(), StatusCode::FORBIDDEN);

        let employee_decision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri(format!(
                        "/api/v1/workflows/requests/{request_key}/decisions"
                    ))
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "action": "approve" }).to_string()))
                    .expect("employee workflow decision"),
            )
            .await
            .expect("employee workflow decision response");
        assert_eq!(employee_decision.status(), StatusCode::FORBIDDEN);

        let employee_generic_read = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/collections/workflow_requests")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee generic workflow read"),
            )
            .await
            .expect("employee generic workflow read response");
        assert_eq!(employee_generic_read.status(), StatusCode::FORBIDDEN);

        let generic_write = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/collections/workflow_requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({ "record": { "key": "bypass" } }).to_string(),
                    ))
                    .expect("generic request write"),
            )
            .await
            .expect("generic request write response");
        assert_eq!(generic_write.status(), StatusCode::BAD_REQUEST);

        let db = state.db.lock().await;
        assert!(
            db.execute(
                "UPDATE workflow_request_events SET event_json = '{}' WHERE request_key = ?1",
                params![request_key],
            )
            .is_err()
        );
        assert!(
            db.execute(
                "DELETE FROM workflow_request_events WHERE request_key = ?1",
                params![request_key],
            )
            .is_err()
        );
    }

    #[tokio::test]
    async fn admin_sessions_are_server_backed_revocable_and_role_protected() {
        let (state, employee) = test_state();
        let now = Utc::now().to_rfc3339();
        let admin = User {
            id: "session-admin-1".to_owned(),
            email: "session-admin@example.test".to_owned(),
            name: "Session Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![
                    &admin.id,
                    &admin.email,
                    &admin.name,
                    &admin.role,
                    password_hash("AdminPassword-123!").expect("admin hash"),
                    &now,
                ],
            )
            .expect("admin insert");
        }
        let (admin_session_id, admin_token) = issue_session_token(&state, &admin)
            .await
            .expect("admin server session");
        let (employee_session_id, employee_token) = issue_session_token(&state, &employee)
            .await
            .expect("employee server session");
        let (_, employee_current_token) = issue_session_token(&state, &employee)
            .await
            .expect("employee current session");
        let (employee_other_session_id, employee_other_token) =
            issue_session_token(&state, &employee)
                .await
                .expect("employee other session");
        let admin_bearer = format!("Bearer {admin_token}");
        let employee_bearer = format!("Bearer {employee_token}");
        let employee_current_bearer = format!("Bearer {employee_current_token}");
        let employee_other_bearer = format!("Bearer {employee_other_token}");
        let app = router(state.clone(), CorsLayer::new());

        let listed = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/admin/sessions")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin session listing"),
            )
            .await
            .expect("session listing response");
        assert_eq!(listed.status(), StatusCode::OK);
        let listed_body = axum::body::to_bytes(listed.into_body(), 8192)
            .await
            .expect("session listing body");
        let listed_json: Value =
            serde_json::from_slice(&listed_body).expect("session listing JSON");
        assert_eq!(listed_json["data"].as_array().map(Vec::len), Some(4));
        assert!(
            listed_json["data"]
                .as_array()
                .unwrap()
                .iter()
                .any(|row| { row["id"] == admin_session_id && row["isCurrent"] == true })
        );
        assert!(
            listed_json["data"]
                .as_array()
                .unwrap()
                .iter()
                .any(|row| { row["id"] == employee_session_id && row["isCurrent"] == false })
        );
        assert!(
            listed_json["data"]
                .as_array()
                .unwrap()
                .iter()
                .any(|row| { row["id"] == employee_other_session_id && row["isCurrent"] == false })
        );
        assert!(listed_json["data"][0].get("ip").is_none());

        let active_introspection = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/introspect")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("active session introspection"),
            )
            .await
            .expect("active introspection response");
        assert_eq!(active_introspection.status(), StatusCode::OK);
        let active_body = axum::body::to_bytes(active_introspection.into_body(), 8192)
            .await
            .expect("active introspection body");
        let active_json: Value =
            serde_json::from_slice(&active_body).expect("active introspection JSON");
        assert_eq!(active_json["active"], true);

        let denied = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/admin/sessions")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee session listing"),
            )
            .await
            .expect("employee listing response");
        assert_eq!(denied.status(), StatusCode::FORBIDDEN);

        let self_revoke = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/admin/sessions/{admin_session_id}"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("self revoke"),
            )
            .await
            .expect("self revoke response");
        assert_eq!(self_revoke.status(), StatusCode::BAD_REQUEST);

        let revoked = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/admin/sessions/{employee_session_id}"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin revoke"),
            )
            .await
            .expect("admin revoke response");
        assert_eq!(revoked.status(), StatusCode::OK);

        let rejected_after_revoke = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/introspect")
                    .header(AUTHORIZATION, employee_bearer)
                    .body(Body::empty())
                    .expect("revoked session profile"),
            )
            .await
            .expect("revoked session profile response");
        assert_eq!(rejected_after_revoke.status(), StatusCode::UNAUTHORIZED);

        let password_changed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/change-password")
                    .header(AUTHORIZATION, &employee_current_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "oldPassword": "OldPassword-123!",
                            "newPassword": "NewEmployeePassword-456!",
                            "confirmPassword": "NewEmployeePassword-456!"
                        })
                        .to_string(),
                    ))
                    .expect("password-change request"),
            )
            .await
            .expect("password-change response");
        assert_eq!(password_changed.status(), StatusCode::OK);
        let rejected_after_password_change = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/profile")
                    .header(AUTHORIZATION, employee_other_bearer)
                    .body(Body::empty())
                    .expect("other session after password change"),
            )
            .await
            .expect("other session response");
        assert_eq!(
            rejected_after_password_change.status(),
            StatusCode::UNAUTHORIZED
        );

        let deactivated = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/users/{}", employee.id))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({ "isActive": false }).to_string()))
                    .expect("account deactivation"),
            )
            .await
            .expect("account deactivation response");
        assert_eq!(deactivated.status(), StatusCode::OK);
        let rejected_after_deactivation = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/introspect")
                    .header(AUTHORIZATION, employee_current_bearer)
                    .body(Body::empty())
                    .expect("deactivated session profile"),
            )
            .await
            .expect("deactivated session response");
        assert_eq!(
            rejected_after_deactivation.status(),
            StatusCode::UNAUTHORIZED
        );

        let logged_out = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/auth/logout")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("logout request"),
            )
            .await
            .expect("logout response");
        assert_eq!(logged_out.status(), StatusCode::OK);
        let rejected_after_logout = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/auth/profile")
                    .header(AUTHORIZATION, admin_bearer)
                    .body(Body::empty())
                    .expect("logged out profile"),
            )
            .await
            .expect("logged out profile response");
        assert_eq!(rejected_after_logout.status(), StatusCode::UNAUTHORIZED);

        let db = state.db.lock().await;
        let event_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM auth_session_events WHERE event_type = 'admin_revoke'",
                [],
                |row| row.get(0),
            )
            .expect("admin revoke audit event count");
        assert_eq!(event_count, 1);
        let password_event_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM auth_session_events WHERE event_type = 'password_change'",
                [],
                |row| row.get(0),
            )
            .expect("password-change event count");
        assert_eq!(password_event_count, 1);
        let deactivation_event_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM auth_session_events WHERE event_type = 'account_deactivated'",
                [],
                |row| row.get(0),
            )
            .expect("account-deactivation event count");
        assert_eq!(deactivation_event_count, 1);
        let logout_event_count: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM auth_session_events WHERE event_type = 'logout'",
                [],
                |row| row.get(0),
            )
            .expect("logout event count");
        assert_eq!(logout_event_count, 1);
        assert!(
            db.execute(
                "DELETE FROM auth_session_events WHERE event_type = 'admin_revoke'",
                [],
            )
            .is_err()
        );
    }

    #[tokio::test]
    async fn employee_payslips_are_owner_scoped_unverified_and_generic_access_is_blocked() {
        let (state, employee) = test_state();
        let now = Utc::now().to_rfc3339();
        let other = User {
            id: "payslip-employee-2".to_owned(),
            email: "payslip-employee2@example.test".to_owned(),
            name: "Other Employee".to_owned(),
            role: "USER".to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = User {
            id: "payslip-admin".to_owned(),
            email: "payslip-admin@example.test".to_owned(),
            name: "Payroll Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        {
            let db = state.db.lock().await;
            for user in [&other, &admin] {
                db.execute(
                    "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                    params![&user.id, &user.email, &user.name, &user.role, "test-hash", &now],
                )
                .expect("payslip test user insert");
            }
            for (user, code) in [(&employee, "PAY-EMP-1"), (&other, "PAY-EMP-2")] {
                db.execute(
                    "INSERT INTO employee_profiles (user_id,employee_code,employment_status,created_at,updated_at) VALUES (?1,?2,'Chính thức',?3,?3)",
                    params![&user.id, code, &now],
                )
                .expect("payslip employee profile insert");
            }
            let records = [
                (
                    "payslip-own",
                    json!({
                        "employeeId": employee.id,
                        "month": "2026-08",
                        "basicSalary": 42000000,
                        "allowance": 1000000,
                        "bonusKPI": 2500000,
                        "insuranceDeduction": 4410000,
                        "personalTax": 1200000,
                        "netSalary": 37890000,
                        "status": "Đã thanh toán",
                        "signedStatus": "Đã ký số xác nhận",
                        "bankAccount": "not-for-display"
                    }),
                ),
                (
                    "payslip-other",
                    json!({"userId": other.id, "month":"2026-08", "netSalary":999999999}),
                ),
                (
                    "payslip-unassigned",
                    json!({"month":"2026-07", "netSalary":888888888}),
                ),
                (
                    "payslip-conflicting-owners",
                    json!({"employeeId": employee.id, "userId": other.id, "netSalary":777777777}),
                ),
            ];
            for (key, record) in records {
                db.execute(
                    "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('employee_payslips',?1,?2,?3,?3)",
                    params![key, record.to_string(), &now],
                )
                .expect("payslip source record insert");
            }
        }

        let app = router(state.clone(), CorsLayer::new());
        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee payslip token")
        );
        let other_bearer = format!(
            "Bearer {}",
            issue_token(&state, &other).expect("other payslip token")
        );
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin payslip token")
        );

        let unauthenticated = app
            .clone()
            .oneshot(
                Request::get("/api/v1/employee/payslips")
                    .body(Body::empty())
                    .expect("unauthenticated payslip request"),
            )
            .await
            .expect("unauthenticated payslip response");
        assert_eq!(unauthenticated.status(), StatusCode::UNAUTHORIZED);

        let response = app
            .clone()
            .oneshot(
                Request::get("/api/v1/employee/payslips?page=1&limit=10&search=2026")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("employee payslip request"),
            )
            .await
            .expect("employee payslip response");
        assert_eq!(response.status(), StatusCode::OK);
        let body = axum::body::to_bytes(response.into_body(), 16 * 1024)
            .await
            .expect("employee payslip body");
        let payload: Value = serde_json::from_slice(&body).expect("employee payslip JSON");
        assert_eq!(payload["pagination"]["total"], 1);
        assert_eq!(payload["data"][0]["id"], "payslip-own");
        assert_eq!(payload["data"][0]["dataStatus"], "unverified");
        assert_eq!(payload["data"][0]["basicSalary"], 42_000_000);
        assert!(payload["data"][0].get("signedStatus").is_none());
        assert!(payload["data"][0].get("bankAccount").is_none());

        let unicode_search = app
            .clone()
            .oneshot(
                Request::get("/api/v1/employee/payslips?search=%C4%90%C3%83")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("Vietnamese payslip search"),
            )
            .await
            .expect("Vietnamese payslip search response");
        let unicode_body = axum::body::to_bytes(unicode_search.into_body(), 16 * 1024)
            .await
            .expect("Vietnamese payslip search body");
        let unicode_payload: Value =
            serde_json::from_slice(&unicode_body).expect("Vietnamese search JSON");
        assert_eq!(unicode_payload["pagination"]["total"], 1);

        let other_response = app
            .clone()
            .oneshot(
                Request::get("/api/v1/employee/payslips")
                    .header(AUTHORIZATION, &other_bearer)
                    .body(Body::empty())
                    .expect("other employee payslip request"),
            )
            .await
            .expect("other employee payslip response");
        let other_body = axum::body::to_bytes(other_response.into_body(), 16 * 1024)
            .await
            .expect("other employee payslip body");
        let other_payload: Value = serde_json::from_slice(&other_body).expect("other payslip JSON");
        assert_eq!(other_payload["pagination"]["total"], 1);
        assert_eq!(other_payload["data"][0]["id"], "payslip-other");

        let admin_response = app
            .clone()
            .oneshot(
                Request::get("/api/v1/employee/payslips")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin self-payslip request"),
            )
            .await
            .expect("admin self-payslip response");
        assert_eq!(admin_response.status(), StatusCode::FORBIDDEN);

        let generic_user_read = app
            .clone()
            .oneshot(
                Request::get("/api/v1/collections/employee_payslips")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("generic payslip user read"),
            )
            .await
            .expect("generic payslip user response");
        assert_eq!(generic_user_read.status(), StatusCode::FORBIDDEN);

        let generic_admin_read = app
            .clone()
            .oneshot(
                Request::get("/api/v1/collections/employee_payslips")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("generic payslip admin read"),
            )
            .await
            .expect("generic payslip admin response");
        assert_eq!(generic_admin_read.status(), StatusCode::BAD_REQUEST);

        let generic_write = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/employee_payslips")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"records":[]}).to_string()))
                    .expect("generic payslip write"),
            )
            .await
            .expect("generic payslip write response");
        assert_eq!(generic_write.status(), StatusCode::BAD_REQUEST);

        let bad_pagination = app
            .oneshot(
                Request::get("/api/v1/employee/payslips?page=0&limit=101")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("invalid payslip pagination"),
            )
            .await
            .expect("invalid payslip pagination response");
        assert_eq!(bad_pagination.status(), StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn employee_leave_requests_are_owner_scoped_and_audited() {
        let (state, employee) = test_state();
        let now = Utc::now().to_rfc3339();
        let other = User {
            id: "employee-2".to_owned(),
            email: "employee2@example.test".to_owned(),
            name: "Other Employee".to_owned(),
            role: "USER".to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = User {
            id: "leave-admin".to_owned(),
            email: "leave-admin@example.test".to_owned(),
            name: "Leave Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![&other.id, &other.email, &other.name, &other.role, "test-hash", &now],
            )
            .expect("other employee insert");
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![&admin.id, &admin.email, &admin.name, &admin.role, "test-hash", &now],
            )
            .expect("admin insert");
            db.execute(
                "INSERT INTO employee_profiles (user_id,employee_code,department,employment_status,created_at,updated_at) VALUES (?1,'EMP-001','Kỹ thuật','Chính thức',?2,?2)",
                params![&employee.id, &now],
            )
            .expect("owner employee profile");
        }

        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let other_bearer = format!(
            "Bearer {}",
            issue_token(&state, &other).expect("other token")
        );
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let app = router(state.clone(), CorsLayer::new());

        let spoofed_identity = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/leave-requests")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "leaveType":"Nghỉ phép năm",
                            "startDate":"2026-10-10",
                            "endDate":"2026-10-10",
                            "days":1,
                            "reason":"Việc gia đình",
                            "employeeName":"Admin giả mạo"
                        })
                        .to_string(),
                    ))
                    .expect("spoofed leave request"),
            )
            .await
            .expect("spoofed response");
        assert_eq!(spoofed_identity.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let invalid_days = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/leave-requests")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "leaveType":"Nghỉ phép năm",
                            "startDate":"2026-10-10",
                            "endDate":"2026-10-10",
                            "days":0.75,
                            "reason":"Việc gia đình"
                        })
                        .to_string(),
                    ))
                    .expect("invalid days request"),
            )
            .await
            .expect("invalid days response");
        assert_eq!(invalid_days.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let missing_profile = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/leave-requests")
                    .header(AUTHORIZATION, &other_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "leaveType":"Nghỉ phép năm",
                            "startDate":"2026-10-10",
                            "endDate":"2026-10-10",
                            "days":1,
                            "reason":"Việc gia đình"
                        })
                        .to_string(),
                    ))
                    .expect("missing profile request"),
            )
            .await
            .expect("missing profile response");
        assert_eq!(missing_profile.status(), StatusCode::CONFLICT);

        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/leave-requests")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "leaveType":"Nghỉ phép năm",
                            "startDate":"2026-10-10",
                            "endDate":"2026-10-11",
                            "days":1.5,
                            "reason":"Việc gia đình",
                            "handoverPerson":"Trần Bình",
                            "contactPhone":"0900000000"
                        })
                        .to_string(),
                    ))
                    .expect("create leave request"),
            )
            .await
            .expect("create leave response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 16 * 1024)
            .await
            .expect("created leave body");
        let created: Value = serde_json::from_slice(&body).expect("created leave JSON");
        let record = &created["request"];
        assert_eq!(record["employeeId"], employee.id);
        assert_eq!(record["employeeName"], employee.name);
        assert_eq!(record["employeeCode"], "EMP-001");
        assert_eq!(record["department"], "Kỹ thuật");
        assert_eq!(record["status"], "Chờ duyệt");
        assert_eq!(record["days"], 1.5);
        let request_id = record["id"].as_str().expect("request id").to_owned();

        let own_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/leave-requests")
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("owner list request"),
            )
            .await
            .expect("owner list response");
        let body = axum::body::to_bytes(own_list.into_body(), 16 * 1024)
            .await
            .expect("owner list body");
        let own_list: Value = serde_json::from_slice(&body).expect("owner list JSON");
        assert_eq!(own_list["data"].as_array().unwrap().len(), 1);

        let other_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/leave-requests")
                    .header(AUTHORIZATION, &other_bearer)
                    .body(Body::empty())
                    .expect("other list request"),
            )
            .await
            .expect("other list response");
        let body = axum::body::to_bytes(other_list.into_body(), 16 * 1024)
            .await
            .expect("other list body");
        let other_list: Value = serde_json::from_slice(&body).expect("other list JSON");
        assert_eq!(other_list["data"].as_array().unwrap().len(), 0);

        let admin_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/leave-requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin leave list request"),
            )
            .await
            .expect("admin leave list response");
        let body = axum::body::to_bytes(admin_list.into_body(), 16 * 1024)
            .await
            .expect("admin leave list body");
        let admin_list: Value = serde_json::from_slice(&body).expect("admin leave list JSON");
        assert_eq!(admin_list["data"].as_array().unwrap().len(), 1);

        let other_events = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/leave-requests/{request_id}/events"))
                    .header(AUTHORIZATION, &other_bearer)
                    .body(Body::empty())
                    .expect("other events request"),
            )
            .await
            .expect("other events response");
        assert_eq!(other_events.status(), StatusCode::FORBIDDEN);

        let employee_decision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/leave-requests/{request_id}/decision"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"status":"Đã duyệt"}).to_string()))
                    .expect("employee decision request"),
            )
            .await
            .expect("employee decision response");
        assert_eq!(employee_decision.status(), StatusCode::FORBIDDEN);

        let decision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/leave-requests/{request_id}/decision"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"status":"Đã duyệt","reviewNote":"Đã xác nhận lịch bàn giao."})
                            .to_string(),
                    ))
                    .expect("admin decision request"),
            )
            .await
            .expect("admin decision response");
        assert_eq!(decision.status(), StatusCode::OK);
        let body = axum::body::to_bytes(decision.into_body(), 16 * 1024)
            .await
            .expect("decision body");
        let decision: Value = serde_json::from_slice(&body).expect("decision JSON");
        assert_eq!(decision["request"]["status"], "Đã duyệt");
        assert_eq!(decision["request"]["reviewerId"], admin.id);
        assert_eq!(
            decision["request"]["reviewNote"],
            "Đã xác nhận lịch bàn giao."
        );

        let repeated_decision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/leave-requests/{request_id}/decision"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"status":"Từ chối"}).to_string()))
                    .expect("repeated decision request"),
            )
            .await
            .expect("repeated decision response");
        assert_eq!(repeated_decision.status(), StatusCode::CONFLICT);

        let events = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/leave-requests/{request_id}/events"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("owner events request"),
            )
            .await
            .expect("owner events response");
        let body = axum::body::to_bytes(events.into_body(), 16 * 1024)
            .await
            .expect("owner events body");
        let events: Value = serde_json::from_slice(&body).expect("owner events JSON");
        assert_eq!(events["data"].as_array().unwrap().len(), 2);
        assert_eq!(events["data"][0]["eventType"], "submitted");
        assert_eq!(events["data"][1]["eventType"], "decision");
        assert_eq!(events["data"][1]["actorId"], admin.id);
        assert_eq!(events["data"][1]["toStatus"], "Đã duyệt");

        let delete_with_history = app
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/users/{}", employee.id))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("delete account with leave history"),
            )
            .await
            .expect("delete account response");
        assert_eq!(delete_with_history.status(), StatusCode::CONFLICT);

        let db = state.db.lock().await;
        assert!(
            db.execute(
                "DELETE FROM employee_leave_request_events WHERE request_id = ?1",
                params![request_id],
            )
            .is_err()
        );
    }

    #[tokio::test]
    async fn employee_overtime_requests_are_owner_scoped_and_audited() {
        let (state, employee) = test_state();
        let now = Utc::now().to_rfc3339();
        let other = User {
            id: "overtime-employee-2".to_owned(),
            email: "overtime-employee2@example.test".to_owned(),
            name: "Other Overtime Employee".to_owned(),
            role: "USER".to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = User {
            id: "overtime-admin".to_owned(),
            email: "overtime-admin@example.test".to_owned(),
            name: "Overtime Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![&other.id, &other.email, &other.name, &other.role, "test-hash", &now],
            )
            .expect("other employee insert");
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![&admin.id, &admin.email, &admin.name, &admin.role, "test-hash", &now],
            )
            .expect("admin insert");
            db.execute(
                "INSERT INTO employee_profiles (user_id,employee_code,department,employment_status,created_at,updated_at) VALUES (?1,'OT-EMP-001','Vận hành','Chính thức',?2,?2)",
                params![&employee.id, &now],
            )
            .expect("owner employee profile");
        }

        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let other_bearer = format!(
            "Bearer {}",
            issue_token(&state, &other).expect("other token")
        );
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let app = router(state.clone(), CorsLayer::new());
        let valid_input = json!({
            "otDate":"2026-10-10",
            "requestedHours":2.5,
            "dayType":"weekend",
            "project":"Triển khai phiên bản",
            "reason":"Hoàn tất kiểm thử trước ngày phát hành"
        });

        let spoofed_identity = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/overtime-requests")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "otDate":"2026-10-10",
                            "requestedHours":2,
                            "dayType":"weekday",
                            "project":"Dự án",
                            "reason":"Lý do",
                            "employeeName":"Tên giả mạo"
                        })
                        .to_string(),
                    ))
                    .expect("spoofed overtime request"),
            )
            .await
            .expect("spoofed overtime response");
        assert_eq!(spoofed_identity.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let invalid_hours = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/overtime-requests")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "otDate":"2026-10-10",
                            "requestedHours":1.25,
                            "dayType":"weekday",
                            "project":"Dự án",
                            "reason":"Lý do"
                        })
                        .to_string(),
                    ))
                    .expect("invalid overtime hours request"),
            )
            .await
            .expect("invalid overtime hours response");
        assert_eq!(invalid_hours.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let missing_profile = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/overtime-requests")
                    .header(AUTHORIZATION, &other_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(valid_input.to_string()))
                    .expect("missing employee profile request"),
            )
            .await
            .expect("missing employee profile response");
        assert_eq!(missing_profile.status(), StatusCode::CONFLICT);

        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/overtime-requests")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(valid_input.to_string()))
                    .expect("create overtime request"),
            )
            .await
            .expect("create overtime response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 16 * 1024)
            .await
            .expect("created overtime body");
        let created: Value = serde_json::from_slice(&body).expect("created overtime JSON");
        let record = &created["request"];
        assert_eq!(record["employeeId"], employee.id);
        assert_eq!(record["employeeCode"], "OT-EMP-001");
        assert_eq!(record["employeeName"], employee.name);
        assert_eq!(record["department"], "Vận hành");
        assert_eq!(record["requestedHours"], 2.5);
        assert_eq!(record["dayType"], "weekend");
        assert_eq!(record["status"], "Chờ phê duyệt");
        assert!(record.get("baseHourlyRate").is_none());
        assert!(record.get("estimatedPay").is_none());
        let request_id = record["id"].as_str().expect("request id").to_owned();

        let other_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/overtime-requests")
                    .header(AUTHORIZATION, &other_bearer)
                    .body(Body::empty())
                    .expect("other employee list request"),
            )
            .await
            .expect("other employee list response");
        let body = axum::body::to_bytes(other_list.into_body(), 16 * 1024)
            .await
            .expect("other employee list body");
        let other_list: Value = serde_json::from_slice(&body).expect("other employee list JSON");
        assert_eq!(other_list["data"].as_array().unwrap().len(), 0);

        let admin_list = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/overtime-requests")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin overtime list request"),
            )
            .await
            .expect("admin overtime list response");
        let body = axum::body::to_bytes(admin_list.into_body(), 16 * 1024)
            .await
            .expect("admin overtime list body");
        let admin_list: Value = serde_json::from_slice(&body).expect("admin overtime list JSON");
        assert_eq!(admin_list["data"].as_array().unwrap().len(), 1);

        let other_events = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/overtime-requests/{request_id}/events"))
                    .header(AUTHORIZATION, &other_bearer)
                    .body(Body::empty())
                    .expect("other employee events request"),
            )
            .await
            .expect("other employee events response");
        assert_eq!(other_events.status(), StatusCode::FORBIDDEN);

        let employee_decision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/overtime-requests/{request_id}/decision"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"status":"Đã duyệt OT"}).to_string()))
                    .expect("employee decision request"),
            )
            .await
            .expect("employee decision response");
        assert_eq!(employee_decision.status(), StatusCode::FORBIDDEN);

        let decision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/overtime-requests/{request_id}/decision"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({"status":"Đã duyệt OT","reviewNote":"Đã xác nhận kế hoạch."})
                            .to_string(),
                    ))
                    .expect("admin decision request"),
            )
            .await
            .expect("admin decision response");
        assert_eq!(decision.status(), StatusCode::OK);
        let body = axum::body::to_bytes(decision.into_body(), 16 * 1024)
            .await
            .expect("decision body");
        let decision: Value = serde_json::from_slice(&body).expect("decision JSON");
        assert_eq!(decision["request"]["status"], "Đã duyệt OT");
        assert_eq!(decision["request"]["reviewerId"], admin.id);
        assert_eq!(decision["request"]["reviewNote"], "Đã xác nhận kế hoạch.");

        let repeated_decision = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PATCH)
                    .uri(format!("/api/v1/overtime-requests/{request_id}/decision"))
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"status":"Từ chối"}).to_string()))
                    .expect("repeated decision request"),
            )
            .await
            .expect("repeated decision response");
        assert_eq!(repeated_decision.status(), StatusCode::CONFLICT);

        let events = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/overtime-requests/{request_id}/events"))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("owner events request"),
            )
            .await
            .expect("owner events response");
        let body = axum::body::to_bytes(events.into_body(), 16 * 1024)
            .await
            .expect("owner events body");
        let events: Value = serde_json::from_slice(&body).expect("owner events JSON");
        assert_eq!(events["data"].as_array().unwrap().len(), 2);
        assert_eq!(events["data"][0]["eventType"], "submitted");
        assert_eq!(events["data"][1]["eventType"], "decision");
        assert_eq!(events["data"][1]["actorId"], admin.id);

        let delete_with_history = app
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/users/{}", employee.id))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("delete account with attendance history"),
            )
            .await
            .expect("delete account response");
        assert_eq!(delete_with_history.status(), StatusCode::CONFLICT);

        let db = state.db.lock().await;
        assert!(
            db.execute(
                "DELETE FROM employee_overtime_request_events WHERE request_id = ?1",
                params![request_id],
            )
            .is_err()
        );
    }

    #[tokio::test]
    async fn attendance_shift_assignments_are_admin_only_linked_and_audited() {
        let (state, employee) = test_state();
        let now = Utc::now().to_rfc3339();
        let other = User {
            id: "shift-assignment-user".to_owned(),
            email: "shift-user@example.test".to_owned(),
            name: "Shift User".to_owned(),
            role: "USER".to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let admin = User {
            id: "shift-assignment-admin".to_owned(),
            email: "shift-admin@example.test".to_owned(),
            name: "Shift Admin".to_owned(),
            role: ADMIN_ROLE.to_owned(),
            is_active: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        let active_shift = json!({
            "key":"shift-day-1",
            "shiftCode":"DAY-01",
            "shiftName":"Ca ngày",
            "timeRange":"08:00 - 17:00",
            "startTime":"08:00",
            "endTime":"17:00",
            "workingHours":8.0,
            "workUnits":1.0,
            "breakTime":"12:00 - 13:00",
            "applicableTo":"Tất cả",
            "allowGraceMinutes":15,
            "nightAllowancePct":0.0,
            "shiftCategory":"Hành chính",
            "status":"Đang áp dụng"
        });
        let paused_shift = json!({
            "key":"shift-paused-1",
            "shiftCode":"PAUSED-01",
            "shiftName":"Ca tạm dừng",
            "timeRange":"08:00 - 17:00",
            "startTime":"08:00",
            "endTime":"17:00",
            "workingHours":8.0,
            "workUnits":1.0,
            "breakTime":"12:00 - 13:00",
            "applicableTo":"Tất cả",
            "allowGraceMinutes":15,
            "nightAllowancePct":0.0,
            "shiftCategory":"Hành chính",
            "status":"Tạm ngưng"
        });
        {
            let db = state.db.lock().await;
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![&other.id, &other.email, &other.name, &other.role, "test-hash", &now],
            )
            .expect("other user insert");
            db.execute(
                "INSERT INTO users (id,email,name,role,password_hash,is_active,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,1,?6,?6)",
                params![&admin.id, &admin.email, &admin.name, &admin.role, "test-hash", &now],
            )
            .expect("admin insert");
            db.execute(
                "INSERT INTO employee_profiles (user_id,employee_code,department,position,employment_status,created_at,updated_at) VALUES (?1,'EMP-SHIFT-1','Vận hành','Kỹ thuật viên','Chính thức',?2,?2)",
                params![&employee.id, &now],
            )
            .expect("active employee profile");
            for shift in [&active_shift, &paused_shift] {
                db.execute(
                    "INSERT INTO collection_records (scope,record_key,record_json,created_at,updated_at) VALUES ('attendance_shifts',?1,?2,?3,?3)",
                    params![shift["key"].as_str().unwrap(), shift.to_string(), &now],
                )
                .expect("shift catalog record");
            }
        }

        let employee_bearer = format!(
            "Bearer {}",
            issue_token(&state, &employee).expect("employee token")
        );
        let other_bearer = format!(
            "Bearer {}",
            issue_token(&state, &other).expect("other token")
        );
        let admin_bearer = format!(
            "Bearer {}",
            issue_token(&state, &admin).expect("admin token")
        );
        let app = router(state.clone(), CorsLayer::new());

        for path in [
            "/api/v1/attendance/shift-assignments",
            "/api/v1/collections/attendance_shift_assignments",
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .header(AUTHORIZATION, &other_bearer)
                        .body(Body::empty())
                        .expect("USER shift-assignment read"),
                )
                .await
                .expect("USER read response");
            assert_eq!(response.status(), StatusCode::FORBIDDEN);
        }

        let spoofed = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/attendance/shift-assignments")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "code":"PC-2026-001",
                            "employeeId":employee.id,
                            "employeeName":"Tên do client tự nhập",
                            "shiftKey":"shift-day-1",
                            "effectiveFrom":"2026-10-08",
                            "effectiveTo":"2026-12-31"
                        })
                        .to_string(),
                    ))
                    .expect("spoofed assignment request"),
            )
            .await
            .expect("spoofed assignment response");
        assert_eq!(spoofed.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let base_input = json!({
            "code":"PC-2026-001",
            "employeeId":employee.id,
            "shiftKey":"shift-day-1",
            "effectiveFrom":"2026-10-08",
            "effectiveTo":"2026-12-31"
        });
        let invalid_period = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/attendance/shift-assignments")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "code":"PC-INVALID-DATE",
                            "employeeId":employee.id,
                            "shiftKey":"shift-day-1",
                            "effectiveFrom":"2026-12-31",
                            "effectiveTo":"2026-10-08"
                        })
                        .to_string(),
                    ))
                    .expect("invalid assignment period"),
            )
            .await
            .expect("invalid period response");
        assert_eq!(invalid_period.status(), StatusCode::UNPROCESSABLE_ENTITY);

        let missing_employee = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/attendance/shift-assignments")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "code":"PC-NO-EMPLOYEE",
                            "employeeId":other.id,
                            "shiftKey":"shift-day-1",
                            "effectiveFrom":"2026-10-08",
                            "effectiveTo":"2026-12-31"
                        })
                        .to_string(),
                    ))
                    .expect("employee without profile"),
            )
            .await
            .expect("missing profile response");
        assert_eq!(missing_employee.status(), StatusCode::CONFLICT);

        let paused = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/attendance/shift-assignments")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        json!({
                            "code":"PC-PAUSED-SHIFT",
                            "employeeId":employee.id,
                            "shiftKey":"shift-paused-1",
                            "effectiveFrom":"2026-10-08",
                            "effectiveTo":"2026-12-31"
                        })
                        .to_string(),
                    ))
                    .expect("paused shift request"),
            )
            .await
            .expect("paused shift response");
        assert_eq!(paused.status(), StatusCode::CONFLICT);

        let user_create = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/attendance/shift-assignments")
                    .header(AUTHORIZATION, &employee_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(base_input.to_string()))
                    .expect("USER assignment create"),
            )
            .await
            .expect("USER create response");
        assert_eq!(user_create.status(), StatusCode::FORBIDDEN);

        let created = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/attendance/shift-assignments")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(base_input.to_string()))
                    .expect("create assignment"),
            )
            .await
            .expect("created assignment response");
        assert_eq!(created.status(), StatusCode::CREATED);
        let body = axum::body::to_bytes(created.into_body(), 16 * 1024)
            .await
            .expect("assignment response body");
        let created: Value = serde_json::from_slice(&body).expect("assignment response JSON");
        let assignment = &created["assignment"];
        assert_eq!(assignment["employeeId"], employee.id);
        assert_eq!(assignment["employeeCode"], "EMP-SHIFT-1");
        assert_eq!(assignment["employeeName"], employee.name);
        assert_eq!(assignment["department"], "Vận hành");
        assert_eq!(assignment["position"], "Kỹ thuật viên");
        assert_eq!(assignment["shiftCode"], "DAY-01");
        assert_eq!(assignment["shiftName"], "Ca ngày");
        assert_eq!(assignment["status"], "Đang áp dụng");
        let assignment_id = assignment["id"].as_str().expect("assignment id").to_owned();

        let listed = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/api/v1/attendance/shift-assignments")
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin assignment list"),
            )
            .await
            .expect("assignment list response");
        assert_eq!(listed.status(), StatusCode::OK);
        let body = axum::body::to_bytes(listed.into_body(), 16 * 1024)
            .await
            .expect("assignment list body");
        let listed: Value = serde_json::from_slice(&body).expect("assignment list JSON");
        assert_eq!(listed["data"].as_array().unwrap().len(), 1);
        assert_eq!(listed["data"][0]["id"], assignment_id);

        let duplicate_code = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/api/v1/attendance/shift-assignments")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(base_input.to_string()))
                    .expect("duplicate assignment code"),
            )
            .await
            .expect("duplicate code response");
        assert_eq!(duplicate_code.status(), StatusCode::CONFLICT);

        let user_events = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/v1/attendance/shift-assignments/{assignment_id}/events"
                    ))
                    .header(AUTHORIZATION, &employee_bearer)
                    .body(Body::empty())
                    .expect("USER assignment history"),
            )
            .await
            .expect("USER history response");
        assert_eq!(user_events.status(), StatusCode::FORBIDDEN);

        let admin_events = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/v1/attendance/shift-assignments/{assignment_id}/events"
                    ))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("admin assignment history"),
            )
            .await
            .expect("admin history response");
        assert_eq!(admin_events.status(), StatusCode::OK);
        let body = axum::body::to_bytes(admin_events.into_body(), 16 * 1024)
            .await
            .expect("admin history body");
        let admin_events: Value = serde_json::from_slice(&body).expect("admin history JSON");
        assert_eq!(admin_events["data"].as_array().unwrap().len(), 1);
        assert_eq!(admin_events["data"][0]["eventType"], "created");
        assert_eq!(admin_events["data"][0]["actorName"], admin.name);

        let generic_write = app
            .clone()
            .oneshot(
                Request::builder()
                    .method(Method::PUT)
                    .uri("/api/v1/collections/attendance_shift_assignments")
                    .header(AUTHORIZATION, &admin_bearer)
                    .header(CONTENT_TYPE, "application/json")
                    .body(Body::from(json!({"records":[]}).to_string()))
                    .expect("generic assignment write"),
            )
            .await
            .expect("generic write response");
        assert_eq!(generic_write.status(), StatusCode::BAD_REQUEST);

        let delete_with_assignment = app
            .oneshot(
                Request::builder()
                    .method(Method::DELETE)
                    .uri(format!("/api/v1/users/{}", employee.id))
                    .header(AUTHORIZATION, &admin_bearer)
                    .body(Body::empty())
                    .expect("delete employee with assignment history"),
            )
            .await
            .expect("delete employee response");
        assert_eq!(delete_with_assignment.status(), StatusCode::CONFLICT);

        let db = state.db.lock().await;
        let events: i64 = db
            .query_row(
                "SELECT COUNT(*) FROM attendance_shift_assignment_events WHERE assignment_id = ?1",
                params![assignment_id],
                |row| row.get(0),
            )
            .expect("assignment event count");
        assert_eq!(events, 1);
        assert!(
            db.execute(
                "DELETE FROM attendance_shift_assignment_events WHERE assignment_id = ?1",
                params![assignment_id],
            )
            .is_err()
        );
    }
}
