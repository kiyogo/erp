use std::{env, net::SocketAddr, sync::Arc};

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
    routing::{get, patch, post, put},
};
use chrono::{Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use rand::Rng;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;
use tower_http::{
    cors::{Any, CorsLayer},
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing::{info, warn};
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

#[derive(Deserialize)]
struct LoginInput {
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct CreateUserInput {
    email: String,
    name: String,
    password: String,
    role: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateUserInput {
    name: Option<String>,
    role: Option<String>,
    is_active: Option<bool>,
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
    fn unauthorized(message: impl Into<String>) -> Self {
        Self(StatusCode::UNAUTHORIZED, message.into())
    }
    fn forbidden(message: impl Into<String>) -> Self {
        Self(StatusCode::FORBIDDEN, message.into())
    }
    fn not_found(message: impl Into<String>) -> Self {
        Self(StatusCode::NOT_FOUND, message.into())
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

    let secret = jwt_secret()?;
    let state = AppState {
        db: Arc::new(Mutex::new(connection)),
        jwt_encoding: EncodingKey::from_secret(secret.as_bytes()),
        jwt_decoding: DecodingKey::from_secret(secret.as_bytes()),
        storage_dir: Arc::new(storage_dir.clone()),
    };
    let mut app = router(state);

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
        let serve_dir = ServeDir::new(&static_dir).not_found_service(ServeFile::new(index_file));
        app = app.fallback_service(serve_dir);
    }

    let host = env::var("KIYO_API_HOST").unwrap_or_else(|_| "0.0.0.0".to_owned());
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

fn router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(Any);
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

async fn dashboard_stats(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let users = all_users(&state).await?;
    let active_users = users.iter().filter(|user| user.is_active).count();
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
        "totalUsers": users.len(),
        "activeUsers": active_users,
        "totalEmployees": users.len(),
        "newEmployeesThisMonth": 0,
        "monthlyRevenue": 0,
        "monthlyExpense": 0,
        "pendingApprovalsCount": pending_workflows.len(),
        "pendingWorkflows": pending_workflows,
        "recentAuditLogs": []
    })))
}

async fn list_users(State(state): State<AppState>, headers: HeaderMap) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    Ok(Json(json!({ "data": all_users(&state).await? })))
}

async fn get_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    Ok(Json(json!({ "user": find_user(&state, &user_id).await? })))
}

async fn create_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<CreateUserInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let email = input.email.trim().to_lowercase();
    let name = input.name.trim();
    let role = input.role.trim().to_uppercase();
    if email.is_empty() || !email.contains('@') || name.is_empty() {
        return Err(ApiError::bad_request(
            "A valid email and name are required.",
        ));
    }
    if !["ADMIN", "USER"].contains(&role.as_str()) {
        return Err(ApiError::bad_request("Role must be ADMIN or USER."));
    }
    if input.password.len() < 12 {
        return Err(ApiError::bad_request(
            "Password must be at least 12 characters.",
        ));
    }
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
    let db = state.db.lock().await;
    db.execute(
        "INSERT INTO users (id, email, name, role, password_hash, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?7)",
        params![&user.id, &user.email, &user.name, &user.role, password_hash, &user.created_at, &user.updated_at],
    ).map_err(|error| ApiError::bad_request(format!("Could not create user: {error}")))?;
    Ok(Json(json!({ "user": user })))
}

async fn update_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(user_id): Path<String>,
    Json(input): Json<UpdateUserInput>,
) -> ApiResult<Json<Value>> {
    require_admin(&state, &headers).await?;
    let current = find_user(&state, &user_id).await?;
    let name = input
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(&current.name)
        .to_owned();
    let role = input
        .role
        .as_deref()
        .map(|role| role.trim().to_uppercase())
        .unwrap_or_else(|| current.role.clone());
    if !["ADMIN", "USER"].contains(&role.as_str()) {
        return Err(ApiError::bad_request("Role must be ADMIN or USER."));
    }
    let is_active = input.is_active.unwrap_or(current.is_active);
    let updated_at = Utc::now().to_rfc3339();
    let db = state.db.lock().await;
    db.execute(
        "UPDATE users SET name = ?1, role = ?2, is_active = ?3, updated_at = ?4 WHERE id = ?5",
        params![name, role, is_active as i64, updated_at, user_id],
    )
    .map_err(ApiError::internal)?;
    drop(db);
    Ok(Json(json!({ "user": find_user(&state, &user_id).await? })))
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
    let department = required_employee_text(input.department.as_deref(), "Department", 160)?;
    let position = required_employee_text(input.position.as_deref(), "Position", 160)?;
    let status = employee_status(input.status.as_deref().unwrap_or("Chính thức"))?;
    let join_date = input
        .join_date
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| Utc::now().format("%Y-%m-%d").to_string());
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
            return Err(ApiError::bad_request("Email already exists."));
        }
        let duplicate_code: Option<String> = transaction
            .query_row(
                "SELECT user_id FROM employee_profiles WHERE employee_code = ?1",
                params![&employee_code],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        if duplicate_code.is_some() {
            return Err(ApiError::bad_request("Employee code already exists."));
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
    let db = state.db.lock().await;
    db.execute(
        "UPDATE users SET is_active = 0, updated_at = ?1 WHERE id = ?2",
        params![timestamp, employee_id],
    )
    .map_err(ApiError::internal)?;
    db.execute("UPDATE employee_profiles SET employment_status = 'Đã nghỉ việc', updated_at = ?1 WHERE user_id = ?2", params![timestamp, employee_id]).map_err(ApiError::internal)?;
    drop(db);
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
    let expires_at = {
        let db = state.db.lock().await;
        issue_activation_token(&db, &employee_id)?
    };
    Ok(Json(json!({
        "delivery": { "status": "not_configured", "message": "Email delivery is not configured on this Kiyo API instance." },
        "expiresAt": expires_at
    })))
}

async fn authorize_activation(
    State(state): State<AppState>,
    Json(input): Json<ActivationAuthorizeInput>,
) -> ApiResult<Json<Value>> {
    let (user_id, expires_at) = activation_record(&state, input.token.trim()).await?;
    let user = find_user(&state, &user_id).await?;
    Ok(Json(json!({
        "activation_token": input.token.trim(),
        "expires_at": expires_at,
        "user": user
    })))
}

async fn set_activation_password(
    State(state): State<AppState>,
    Json(input): Json<ActivationPasswordInput>,
) -> ApiResult<Json<LoginResponse>> {
    validate_activation_password(&input.password)?;
    let token = input.activation_token.trim();
    let user_id = activation_user_id(&state, token).await?;
    let password_hash = password_hash(&input.password)?;
    let now = Utc::now().to_rfc3339();
    let token_hash = activation_hash(token);
    {
        let db = state.db.lock().await;
        db.execute(
            "UPDATE users SET password_hash = ?1, is_active = 1, updated_at = ?2 WHERE id = ?3",
            params![password_hash, now, user_id],
        )
        .map_err(ApiError::internal)?;
        db.execute(
            "UPDATE activation_tokens SET used_at = ?1 WHERE token_hash = ?2",
            params![now, token_hash],
        )
        .map_err(ApiError::internal)?;
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

async fn all_users(state: &AppState) -> ApiResult<Vec<User>> {
    let db = state.db.lock().await;
    let mut statement = db
        .prepare(
            "SELECT id, email, name, role, is_active, created_at, updated_at FROM users ORDER BY created_at ASC",
        )
        .map_err(ApiError::internal)?;
    statement
        .query_map([], |row| {
            Ok(User {
                id: row.get(0)?,
                email: row.get(1)?,
                name: row.get(2)?,
                role: row.get(3)?,
                is_active: row.get::<_, i64>(4)? != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(ApiError::internal)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)
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
    if !["Chính thức", "Thử việc", "Đã nghỉ việc"].contains(&value) {
        return Err(ApiError::bad_request("Unsupported employee status."));
    }
    Ok(value.to_owned())
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
    if password.len() < 12 || password.len() > 256 {
        return Err(ApiError::bad_request(
            "Password must contain between 12 and 256 characters.",
        ));
    }
    if !password.chars().any(char::is_lowercase)
        || !password.chars().any(char::is_uppercase)
        || !password.chars().any(|character| character.is_ascii_digit())
        || !password
            .chars()
            .any(|character| !character.is_ascii_alphanumeric())
    {
        return Err(ApiError::bad_request(
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
        "INSERT INTO activation_tokens (id, user_id, token_hash, issued_at, expires_at, used_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL)",
        params![Uuid::new_v4().to_string(), user_id, activation_hash(&raw), issued_at.to_rfc3339(), expires_at.to_rfc3339()],
    ).map_err(ApiError::internal)?;
    Ok(expires_at.to_rfc3339())
}

async fn activation_user_id(state: &AppState, raw_token: &str) -> ApiResult<String> {
    Ok(activation_record(state, raw_token).await?.0)
}

async fn activation_record(state: &AppState, raw_token: &str) -> ApiResult<(String, String)> {
    if raw_token.is_empty() {
        return Err(ApiError::bad_request("Activation token is required."));
    }
    let db = state.db.lock().await;
    let record: Option<(String, String)> = db.query_row(
        "SELECT user_id, expires_at FROM activation_tokens WHERE token_hash = ?1 AND used_at IS NULL ORDER BY issued_at DESC LIMIT 1",
        params![activation_hash(raw_token)],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional().map_err(ApiError::internal)?;
    let Some((user_id, expires_at)) = record else {
        return Err(ApiError::unauthorized("Activation token is invalid."));
    };
    let expires_at = chrono::DateTime::parse_from_rfc3339(&expires_at)
        .map_err(ApiError::internal)?
        .with_timezone(&Utc);
    if expires_at <= Utc::now() {
        return Err(ApiError::unauthorized("Activation token has expired."));
    }
    Ok((user_id, expires_at.to_rfc3339()))
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
    let department = match input.department.as_deref() {
        Some(value) => optional_employee_text(Some(value), 160)?,
        None => current.department.clone(),
    };
    let position = match input.position.as_deref() {
        Some(value) => optional_employee_text(Some(value), 160)?,
        None => current.position.clone(),
    };
    let status = match input.status.as_deref() {
        Some(value) => employee_status(value)?,
        None => current.status.clone(),
    };
    let join_date = input.join_date.unwrap_or(current.join_date.clone());
    let salary_base = input.salary_base.unwrap_or(current.salary_base);
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
    let db = state.db.lock().await;
    if allow_identity_changes {
        let email_owner: Option<String> = db
            .query_row(
                "SELECT id FROM users WHERE lower(email) = lower(?1) AND id != ?2",
                params![&email, employee_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        if email_owner.is_some() {
            return Err(ApiError::bad_request("Email already exists."));
        }
        let code_owner: Option<String> = db
            .query_row(
                "SELECT user_id FROM employee_profiles WHERE employee_code = ?1 AND user_id != ?2",
                params![&employee_code, employee_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(ApiError::internal)?;
        if code_owner.is_some() {
            return Err(ApiError::bad_request("Employee code already exists."));
        }
    }
    db.execute(
        "UPDATE users SET name = ?1, email = ?2, updated_at = ?3 WHERE id = ?4",
        params![name, email, timestamp, employee_id],
    )
    .map_err(ApiError::internal)?;
    db.execute("UPDATE employee_profiles SET employee_code = ?1, phone = ?2, department = ?3, position = ?4, employment_status = ?5, join_date = ?6, salary_base = ?7, avatar_url = ?8, details_json = ?9, updated_at = ?10 WHERE user_id = ?11", params![employee_code, phone, department, position, status, join_date, salary_base, avatar, details.to_string(), timestamp, employee_id]).map_err(ApiError::internal)?;
    drop(db);
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
    let password = match env::var("KIYO_BOOTSTRAP_ADMIN_PASSWORD") {
        Ok(value) if value.len() >= 12 => value,
        _ if cfg!(debug_assertions) => {
            let generated = format!("KiyoDev-{}", rand::rng().random_range(100000..999999));
            warn!(email = %email, password = %generated, "Development bootstrap administrator was created. Set KIYO_BOOTSTRAP_ADMIN_PASSWORD before production.");
            generated
        }
        _ => anyhow::bail!(
            "KIYO_BOOTSTRAP_ADMIN_PASSWORD must be set and at least 12 characters for the first production start"
        ),
    };
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
    match env::var("KIYO_JWT_SECRET") {
        Ok(value) if value.len() >= 32 => Ok(value),
        _ if cfg!(debug_assertions) => {
            Ok("development-only-kiyo-jwt-secret-must-never-be-deployed".to_owned())
        }
        _ => anyhow::bail!("KIYO_JWT_SECRET must be at least 32 characters in production"),
    }
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    info!("Kiyo Server received shutdown signal");
}
