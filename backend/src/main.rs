use std::{
    collections::{HashMap, HashSet},
    env, net::SocketAddr, sync::Arc,
};

use anyhow::{Context, Result};
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use axum::{
    Json, Router,
    body::{Body, Bytes},
    extract::{Path, Query, State},
    http::{
        HeaderMap, HeaderValue, Method, StatusCode,
        header::{AUTHORIZATION, CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_TYPE},
    },
    response::{IntoResponse, Response},
    routing::{any, get, patch, post, put},
};
use chrono::{Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use rusqlite::{Connection, OptionalExtension, Transaction, params};
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

const API_PREFIX: &str = "/api/v1";
const ADMIN_ROLE: &str = "ADMIN";

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Connection>>,
    jwt_encoding: EncodingKey,
    jwt_decoding: DecodingKey,
    storage_dir: Arc<std::path::PathBuf>,
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

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct UserListQuery {
    page: Option<usize>,
    limit: Option<usize>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct EmployeeInput {
    name: Option<String>,
    email: Option<String>,
    code: Option<String>,
    employee_code: Option<String>,
    phone: Option<String>,
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
}

#[derive(Deserialize)]
struct CreateRecordInput {
    record: Value,
}

#[derive(Deserialize)]
struct PatchRecordInput {
    patch: Value,
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
        .route(
            &format!("{API_PREFIX}/users"),
            get(list_users).post(create_user),
        )
        .route(
            &format!("{API_PREFIX}/users/{{user_id}}"),
            get(get_user).patch(update_user).delete(delete_user),
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
            &format!("{API_PREFIX}/auth/activation/authorize"),
            post(authorize_activation),
        )
        .route(
            &format!("{API_PREFIX}/auth/activation/set-password"),
            post(set_activation_password),
        )
        .route(&format!("{API_PREFIX}/files"), get(list_files))
        .route(&format!("{API_PREFIX}/files/folders"), post(create_folder))
        .route(&format!("{API_PREFIX}/files/upload"), post(upload_file))
        .route(
            &format!("{API_PREFIX}/files/{{file_id}}/download"),
            get(download_file),
        )
        .route(
            &format!("{API_PREFIX}/files/{{file_id}}/content"),
            put(update_file_content),
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
    let token = issue_token(&state, &user)?;
    Ok(Json(LoginResponse {
        access_token: token,
        token_type: "Bearer",
        user,
    }))
}

async fn profile(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<User>> {
    Ok(Json(authenticated_user(&state, &headers).await?))
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
    change_password_for_user(&state, &user.id, input).await?;
    Ok(Json(json!({
        "success": true,
        "message": "Đã thay đổi mật khẩu tài khoản thành công."
    })))
}

async fn change_password_for_user(
    state: &AppState,
    user_id: &str,
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
    let db = state.db.lock().await;
    let changed = db
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
    Ok(())
}

async fn dashboard_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let current_month = Utc::now().format("%Y-%m").to_string();
    let (total_employees, active_employees, new_employees_this_month) = {
        let db = state.db.lock().await;
        db.query_row(
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
        .map_err(ApiError::internal)?
    };
    let pending_workflows = collection_records(&state, "workflows").await?;
    let pending_workflows = pending_workflows
        .into_iter()
        .filter(|record| {
            record
                .get("status")
                .and_then(Value::as_str)
                .is_some_and(|status| matches!(status, "Chờ duyệt" | "Đang xử lý" | "pending"))
        })
        .collect::<Vec<_>>();
    Ok(Json(json!({
        "totalUsers": total_employees,
        "activeUsers": active_employees,
        "totalEmployees": total_employees,
        "newEmployeesThisMonth": new_employees_this_month,
        "monthlyRevenue": 0,
        "monthlyExpense": 0,
        "pendingApprovalsCount": pending_workflows.len(),
        "pendingWorkflows": pending_workflows,
        "recentAuditLogs": [],
        "financialMetricsAvailable": false,
        "auditLogsAvailable": false
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
    let db = state.db.lock().await;
    let total: i64 = db
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .map_err(ApiError::internal)?;
    let mut statement = db
        .prepare(
            "SELECT u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.updated_at,
                    p.employee_code, p.phone, p.department, p.position, p.employment_status
             FROM users u LEFT JOIN employee_profiles p ON p.user_id = u.id
             ORDER BY u.created_at DESC, u.id ASC LIMIT ?1 OFFSET ?2",
        )
        .map_err(ApiError::internal)?;
    let users = statement
        .query_map(params![limit as i64, offset as i64], admin_user_from_sql)
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    Ok(Json(json!({
        "data": users,
        "pagination": { "page": page, "limit": limit, "total": total }
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
    Ok(Json(json!({ "user": find_admin_user(&state, &user_id).await? })))
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
    Ok(Json(json!({ "user": find_admin_user(&state, &user_id).await? })))
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
    let db = state.db.lock().await;
    let deleted = db
        .execute("DELETE FROM users WHERE id = ?1", params![user_id])
        .map_err(ApiError::internal)?;
    if deleted == 0 {
        return Err(ApiError::not_found("User not found."));
    }
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
    let details = object_value(input.details)?;
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
    let employee =
        apply_employee_update(&state, &employee_id, input, actor.role == ADMIN_ROLE).await?;
    Ok(Json(json!({ "employee": employee_value(employee) })))
}

async fn update_my_employee_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<EmployeeInput>,
) -> ApiResult<Json<Value>> {
    let actor = authenticated_user(&state, &headers).await?;
    let employee = apply_employee_update(&state, &actor.id, input, false).await?;
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
        transaction.execute(
            "UPDATE users SET is_active = 0, updated_at = ?1 WHERE id = ?2",
            params![&timestamp, &employee_id],
        )
        .map_err(ApiError::internal)?;
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
    let token = issue_token(&state, &user)?;
    Ok(Json(LoginResponse {
        access_token: token,
        token_type: "Bearer",
        user,
    }))
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
        mime_type: header_value(&headers, "content-type")
            .unwrap_or_else(|| "application/octet-stream".to_owned()),
        size: body.len() as i64,
        storage_key: Some(storage_key),
        origin_module: header_value(&headers, "x-origin-module")
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "files".to_owned()),
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
    drop(db);
    if let Some(storage_key) = node.storage_key {
        let _ = std::fs::remove_file(state.storage_dir.join(storage_key));
    }
    Ok(Json(json!({ "deleted": true })))
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

async fn list_collection(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(scope): Path<String>,
) -> ApiResult<Json<Value>> {
    authenticated_user(&state, &headers).await?;
    validate_scope(&scope)?;
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT record_json FROM collection_records WHERE scope = ?1 ORDER BY created_at ASC",
        )
        .map_err(ApiError::internal)?;
    let records = statement
        .query_map(params![scope], |row| row.get::<_, String>(0))
        .map_err(ApiError::internal)?
        .filter_map(|result| result.ok())
        .filter_map(|record| serde_json::from_str::<Value>(&record).ok())
        .collect::<Vec<_>>();
    let total = records.len();
    Ok(Json(
        json!({ "data": records, "pagination": { "page": 1, "limit": total, "total": total, "totalPages": 1 } }),
    ))
}

async fn replace_collection(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(scope): Path<String>,
    Json(input): Json<ReplaceCollectionInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    validate_scope(&scope)?;
    if scope == "business_org_units" {
        validate_org_unit_records(&input.records)?;
    }
    let timestamp = Utc::now().to_rfc3339();
    let mut db = state.db.lock().await;
    let transaction = db.transaction().map_err(ApiError::internal)?;
    transaction
        .execute(
            "DELETE FROM collection_records WHERE scope = ?1",
            params![scope],
        )
        .map_err(ApiError::internal)?;
    for record in &input.records {
        let key = record_key(record)?;
        transaction.execute("INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)", params![scope, key, record.to_string(), timestamp]).map_err(ApiError::internal)?;
    }
    if scope == "business_org_units" {
        for record in &input.records {
            sync_org_unit_manager(&transaction, record, &timestamp)?;
        }
    }
    transaction.commit().map_err(ApiError::internal)?;
    Ok(Json(json!({ "data": input.records })))
}

async fn create_record(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(scope): Path<String>,
    Json(input): Json<CreateRecordInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    validate_scope(&scope)?;
    let key = record_key(&input.record)?;
    let timestamp = Utc::now().to_rfc3339();
    let db = state.db.lock().await;
    db.execute("INSERT INTO collection_records (scope, record_key, record_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)", params![scope, key, input.record.to_string(), timestamp]).map_err(|error| ApiError::bad_request(format!("Could not create record: {error}")))?;
    Ok(Json(json!({ "record": input.record })))
}

async fn patch_record(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope, record_key_value)): Path<(String, String)>,
    Json(input): Json<PatchRecordInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    validate_scope(&scope)?;
    let Value::Object(patch) = input.patch else {
        return Err(ApiError::bad_request("Patch must be an object."));
    };
    let timestamp = Utc::now().to_rfc3339();
    let db = state.db.lock().await;
    let current: Option<String> = db
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
    let Value::Object(mut record) =
        serde_json::from_str::<Value>(&current).map_err(ApiError::internal)?
    else {
        return Err(ApiError::internal("Stored record is invalid."));
    };
    record.extend(patch);
    let record = Value::Object(record);
    db.execute("UPDATE collection_records SET record_json = ?1, updated_at = ?2 WHERE scope = ?3 AND record_key = ?4", params![record.to_string(), timestamp, scope, record_key_value]).map_err(ApiError::internal)?;
    Ok(Json(json!({ "record": record })))
}

async fn delete_record(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((scope, record_key_value)): Path<(String, String)>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    validate_scope(&scope)?;
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
        .map(|(name, suffix)| {
            (
                name.trim(),
                suffix.trim().trim_end_matches(')').trim(),
            )
        })
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
            if record.get(field).is_some_and(|value| value.as_u64().is_none()) {
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
                return Err(ApiError::bad_request("Org unit hierarchy cannot contain a cycle."));
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
            .prepare("SELECT record_json FROM collection_records WHERE scope = 'business_org_units'")
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
        if retained.len() != departments.split(',').filter(|department| !department.trim().is_empty()).count() {
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
    let token = bearer_token(headers)?;
    let claims = decode::<Claims>(
        token,
        &state.jwt_decoding,
        &Validation::new(Algorithm::HS256),
    )
    .map_err(|_| ApiError::unauthorized("Invalid or expired access token."))?
    .claims;
    let db = state.db.lock().await;
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
    let mut fields = employee.details.as_object().cloned().unwrap_or_default();
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
    let details = match input.details {
        Some(value) => object_value(Some(value))?,
        None => current.details.clone(),
    };
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

fn issue_token(state: &AppState, user: &User) -> ApiResult<String> {
    let now = Utc::now();
    let claims = Claims {
        sub: user.id.clone(),
        email: user.email.clone(),
        role: user.role.clone(),
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
    fields
        .get("id")
        .or_else(|| fields.get("key"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| ApiError::bad_request("Record requires a non-empty id or key."))
}

fn init_database(db: &Connection) -> Result<()> {
    db.execute_batch("\
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('ADMIN', 'USER')), password_hash TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS collection_records (
          scope TEXT NOT NULL, record_key TEXT NOT NULL, record_json TEXT NOT NULL,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(scope, record_key)
        );
        CREATE TABLE IF NOT EXISTS employee_profiles (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          employee_code TEXT NOT NULL UNIQUE, phone TEXT NOT NULL DEFAULT '',
          department TEXT NOT NULL DEFAULT '', position TEXT NOT NULL DEFAULT '',
          employment_status TEXT NOT NULL DEFAULT 'Chính thức', join_date TEXT NOT NULL DEFAULT '',
          salary_base INTEGER NOT NULL DEFAULT 0, avatar_url TEXT NOT NULL DEFAULT '',
          details_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS employee_profiles_department_idx ON employee_profiles(department, employment_status);
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
        CREATE TABLE IF NOT EXISTS activation_tokens (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE, issued_at TEXT NOT NULL, expires_at TEXT NOT NULL,
          used_at TEXT
        );
        CREATE INDEX IF NOT EXISTS activation_tokens_user_idx ON activation_tokens(user_id, issued_at DESC);
    ")?;
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
            },
            user,
        )
    }

    #[tokio::test]
    async fn dashboard_stats_use_real_accounts_and_mark_unavailable_sources() {
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
        }

        let app = router(state.clone(), CorsLayer::new());
        let admin_bearer = format!("Bearer {}", issue_token(&state, &admin).expect("admin token"));
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
        assert_eq!(stats["financialMetricsAvailable"], false);
        assert_eq!(stats["auditLogsAvailable"], false);
        assert_eq!(stats["recentAuditLogs"], json!([]));

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
        let admin_bearer = format!("Bearer {}", issue_token(&state, &admin).expect("admin token"));
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

        let _raw_activation = seed_activation_link(
            &state,
            &mut employee,
            Utc::now() + Duration::hours(24),
        )
        .await;
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
        let admin_bearer = format!("Bearer {}", issue_token(&state, &admin).expect("admin token"));
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
            ("NV-DATE", "invalid-date@example.test", "Thử việc", "2026-02-31"),
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
                            "details": {"bankAccount": "pending-approval"}
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
        assert_eq!(resend_unconfigured.status(), StatusCode::SERVICE_UNAVAILABLE);
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
        let admin_bearer = format!("Bearer {}", issue_token(&state, &admin).expect("admin token"));
        let employee_bearer =
            format!("Bearer {}", issue_token(&state, &employee).expect("employee token"));
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
}
