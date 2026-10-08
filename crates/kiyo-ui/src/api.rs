use crate::models::{AdminUser, Employee, OrgUnit, Session, StorageMode, User};
use ehttp::{Request, Response};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::sync::{Arc, Mutex};

/// A platform-neutral request handle. The UI polls this handle from its egui
/// frame loop, so native and WebAssembly use exactly the same screen code.
pub type ApiTask<T> = Arc<Mutex<Option<Result<T, String>>>>;

#[derive(Clone, Default)]
pub struct ApiClient;

#[derive(Debug, Deserialize)]
struct LoginResponse {
    access_token: String,
    user: User,
}

#[derive(Debug, Deserialize)]
struct ChangePasswordResponse {
    success: bool,
    message: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ActivationAuthorization {
    pub activation_token: String,
    pub expires_at: String,
    pub user: User,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub size_bytes: i64,
    pub modified: String,
    #[serde(default)]
    pub is_protected: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileListContext {
    pub parent_id: String,
    pub root_label: String,
}

#[derive(Debug, Deserialize)]
pub struct FileListResponse {
    pub data: Vec<FileNode>,
    pub context: FileListContext,
}

#[derive(Debug, Deserialize)]
struct CreateFolderResponse {
    file: FileNode,
}

#[derive(Debug, Deserialize)]
struct RenameFileResponse {
    file: FileNode,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UsersPage {
    pub data: Vec<AdminUser>,
    pub pagination: UsersPagination,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UsersPagination {
    pub page: usize,
    pub limit: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardStats {
    pub total_users: usize,
    pub active_users: usize,
    pub total_employees: usize,
    pub new_employees_this_month: usize,
    pub monthly_revenue: i64,
    pub monthly_expense: i64,
    pub pending_approvals_count: usize,
    #[serde(default)]
    pub financial_metrics_available: bool,
    #[serde(default)]
    pub audit_logs_available: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeListResponse {
    pub data: Vec<Employee>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeResponse {
    pub employee: Employee,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmailDelivery {
    pub status: String,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeCreateResponse {
    pub employee: Employee,
    pub delivery: EmailDelivery,
    pub expires_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct EmployeeActivationResponse {
    pub delivery: EmailDelivery,
    #[serde(rename = "expiresAt")]
    pub expires_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OrgUnitsResponse {
    pub data: Vec<OrgUnit>,
}

#[derive(Debug, Deserialize)]
struct DeletedCollectionRecord {
    deleted: bool,
}

#[derive(Debug, Deserialize)]
struct AdminUserResponse {
    user: AdminUser,
}

impl ApiClient {
    pub fn dashboard_stats_task(&self, session: &Session) -> ApiTask<DashboardStats> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/dashboard/stats",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<DashboardStats>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_org_units_task(&self, session: &Session) -> ApiTask<OrgUnitsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/collections/business_org_units",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<OrgUnitsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn replace_org_units_task(
        &self,
        session: &Session,
        units: &[OrgUnit],
    ) -> ApiTask<OrgUnitsResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PUT",
            format!(
                "{}/collections/business_org_units",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "records": units })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<OrgUnitsResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn delete_org_unit_task(&self, session: &Session, key: &str) -> ApiTask<bool> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "DELETE",
            format!(
                "{}/collections/business_org_units/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(key)
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<DeletedCollectionRecord>)
                .map(|response| response.deleted);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_users_task(
        &self,
        session: &Session,
        page: usize,
        limit: usize,
    ) -> ApiTask<UsersPage> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let url = format!(
            "{}/users?page={page}&limit={limit}",
            session.endpoint.trim_end_matches('/')
        );
        let mut request = Request::get(url);
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<UsersPage>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_user_task(
        &self,
        session: &Session,
        name: &str,
        email: &str,
        employee_code: &str,
        department: &str,
        password: &str,
        role: &str,
    ) -> ApiTask<AdminUser> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/users", session.endpoint.trim_end_matches('/')),
            Some(json!({
                "name": name,
                "email": email,
                "employeeCode": employee_code,
                "department": department,
                "password": password,
                "role": role,
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<AdminUserResponse>)
                .map(|payload| payload.user);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn set_user_active_task(
        &self,
        session: &Session,
        user_id: &str,
        is_active: bool,
    ) -> ApiTask<AdminUser> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/users/{user_id}",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "isActive": is_active })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<AdminUserResponse>)
                .map(|payload| payload.user);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_employees_task(&self, session: &Session) -> ApiTask<EmployeeListResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/employees",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeListResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn my_employee_profile_task(&self, session: &Session) -> ApiTask<EmployeeResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = Request::get(format!(
            "{}/employees/me",
            session.endpoint.trim_end_matches('/')
        ));
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        request
            .headers
            .insert("Accept".to_string(), "application/json".to_string());
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn update_my_employee_phone_task(
        &self,
        session: &Session,
        phone: &str,
    ) -> ApiTask<EmployeeResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/employees/me",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({ "phone": phone })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    #[allow(clippy::too_many_arguments)]
    pub fn create_employee_task(
        &self,
        session: &Session,
        code: &str,
        name: &str,
        email: &str,
        phone: &str,
        department: &str,
        position: &str,
        status: &str,
        join_date: &str,
        salary_base: i64,
    ) -> ApiTask<EmployeeCreateResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/employees", session.endpoint.trim_end_matches('/')),
            Some(json!({
                "code": code,
                "name": name,
                "email": email,
                "phone": phone,
                "department": department,
                "position": position,
                "status": status,
                "joinDate": join_date,
                "salaryBase": salary_base,
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeCreateResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_employee_task(
        &self,
        session: &Session,
        employee_id: &str,
        code: &str,
        name: &str,
        email: &str,
        phone: &str,
        department: &str,
        position: &str,
        status: &str,
        join_date: &str,
        salary_base: i64,
    ) -> ApiTask<EmployeeResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/employees/{employee_id}",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "code": code,
                "name": name,
                "email": email,
                "phone": phone,
                "department": department,
                "position": position,
                "status": status,
                "joinDate": join_date,
                "salaryBase": salary_base,
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn retire_employee_task(
        &self,
        session: &Session,
        employee_id: &str,
    ) -> ApiTask<EmployeeResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "DELETE",
            format!(
                "{}/employees/{employee_id}",
                session.endpoint.trim_end_matches('/')
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn resend_employee_activation_task(
        &self,
        session: &Session,
        employee_id: &str,
    ) -> ApiTask<EmployeeActivationResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/employees/{employee_id}/activation",
                session.endpoint.trim_end_matches('/')
            ),
            None,
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<EmployeeActivationResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn login_task(
        &self,
        endpoint: &str,
        email: &str,
        password: &str,
        mode: StorageMode,
    ) -> ApiTask<Session> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let endpoint = endpoint.trim_end_matches('/').to_string();
        let request = json_request(
            "POST",
            format!("{endpoint}/auth/login"),
            Some(json!({
                "email": email.trim(),
                "password": password,
            })),
        );

        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(|response| decode_response::<LoginResponse>(response))
                .map(|payload| Session {
                    token: payload.access_token,
                    user: payload.user,
                    endpoint,
                    mode,
                });
            set_result(&slot, parsed);
        });

        result
    }

    pub fn authorize_activation_task(
        &self,
        endpoint: &str,
        link_token: &str,
    ) -> ApiTask<ActivationAuthorization> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let request = json_request(
            "POST",
            format!(
                "{}/auth/activation/authorize",
                endpoint.trim_end_matches('/')
            ),
            Some(json!({ "token": link_token.trim() })),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<ActivationAuthorization>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn set_activation_password_task(
        &self,
        endpoint: &str,
        activation_token: &str,
        password: &str,
        mode: StorageMode,
    ) -> ApiTask<Session> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let endpoint = endpoint.trim_end_matches('/').to_owned();
        let request = json_request(
            "POST",
            format!("{endpoint}/auth/activation/set-password"),
            Some(json!({
                "activationToken": activation_token,
                "password": password,
            })),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<LoginResponse>)
                .map(|payload| Session {
                    token: payload.access_token,
                    user: payload.user,
                    endpoint,
                    mode,
                });
            set_result(&slot, parsed);
        });
        result
    }

    pub fn health_task(&self, endpoint: &str) -> ApiTask<String> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let request = Request::get(format!("{}/health", endpoint.trim_end_matches('/')));

        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(|response| {
                    if (200..300).contains(&response.status) {
                        Ok("Kết nối máy chủ thành công (200 OK)".to_string())
                    } else {
                        Err(format!("Máy chủ phản hồi mã lỗi: {}", response.status))
                    }
                });
            set_result(&slot, parsed);
        });

        result
    }

    pub fn change_password_task(
        &self,
        session: &Session,
        old_password: &str,
        new_password: &str,
        confirm_password: &str,
    ) -> ApiTask<String> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!(
                "{}/auth/change-password",
                session.endpoint.trim_end_matches('/')
            ),
            Some(json!({
                "oldPassword": old_password,
                "newPassword": new_password,
                "confirmPassword": confirm_password,
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );

        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<ChangePasswordResponse>)
                .and_then(|payload| {
                    if payload.success {
                        Ok(payload.message)
                    } else {
                        Err(payload.message)
                    }
                });
            set_result(&slot, parsed);
        });
        result
    }

    pub fn list_files_task(
        &self,
        session: &Session,
        parent_id: Option<&str>,
        employee_scope: bool,
    ) -> ApiTask<FileListResponse> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut url = format!("{}/files", session.endpoint.trim_end_matches('/'));
        let mut parameters = Vec::new();
        if let Some(parent_id) = parent_id {
            parameters.push(format!("parentId={parent_id}"));
        }
        if employee_scope {
            parameters.push("scope=employee".to_string());
        }
        if !parameters.is_empty() {
            url.push('?');
            url.push_str(&parameters.join("&"));
        }
        let mut request = Request::get(url);
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<FileListResponse>);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn create_folder_task(
        &self,
        session: &Session,
        parent_id: &str,
        name: &str,
    ) -> ApiTask<FileNode> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "POST",
            format!("{}/files/folders", session.endpoint.trim_end_matches('/')),
            Some(json!({
                "name": name,
                "parentId": parent_id,
                "originModule": "files",
            })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<CreateFolderResponse>)
                .map(|payload| payload.file);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn rename_file_task(
        &self,
        session: &Session,
        file_id: &str,
        name: &str,
    ) -> ApiTask<FileNode> {
        let result = Arc::new(Mutex::new(None));
        let slot = Arc::clone(&result);
        let mut request = json_request(
            "PATCH",
            format!(
                "{}/files/{}",
                session.endpoint.trim_end_matches('/'),
                encode_path_segment(file_id)
            ),
            Some(json!({ "name": name })),
        );
        request.headers.insert(
            "Authorization".to_string(),
            format!("Bearer {}", session.token),
        );
        ehttp::fetch(request, move |response| {
            let parsed = response
                .map_err(|error| error.to_string())
                .and_then(decode_response::<RenameFileResponse>)
                .map(|payload| payload.file);
            set_result(&slot, parsed);
        });
        result
    }

    pub fn poll<T>(task: &ApiTask<T>) -> Option<Result<T, String>> {
        task.lock().ok()?.take()
    }
}

fn json_request(method: &str, url: String, body: Option<Value>) -> Request {
    let body_bytes = body
        .map(|value| serde_json::to_vec(&value).unwrap_or_default())
        .unwrap_or_default();

    let mut request = Request::post(url, body_bytes);
    request.method = method.to_owned();
    request
        .headers
        .insert("Accept".to_string(), "application/json".to_string());
    if !request.body.is_empty() {
        request
            .headers
            .insert("Content-Type".to_string(), "application/json".to_string());
    }
    request
}

fn encode_path_segment(value: &str) -> String {
    value
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
                (byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}

fn decode_response<T: DeserializeOwned>(response: Response) -> Result<T, String> {
    if !(200..300).contains(&response.status) {
        let message = serde_json::from_slice::<Value>(&response.bytes)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .or_else(|| value.get("error"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
            })
            .unwrap_or_else(|| format!("Máy chủ phản hồi mã lỗi: {}", response.status));
        return Err(message);
    }

    serde_json::from_slice(&response.bytes)
        .map_err(|error| format!("Phản hồi API không hợp lệ: {error}"))
}

fn set_result<T>(slot: &ApiTask<T>, result: Result<T, String>) {
    if let Ok(mut value) = slot.lock() {
        *value = Some(result);
    }
}

#[cfg(test)]
mod tests {
    use super::{
        ActivationAuthorization, DashboardStats, EmployeeCreateResponse, EmployeeListResponse,
        EmployeeResponse, FileListResponse, OrgUnitsResponse, RenameFileResponse, UsersPage,
        encode_path_segment, json_request,
    };
    use serde_json::json;

    #[test]
    fn file_list_decodes_backend_contract() {
        let payload = r#"{"data":[{"id":"folder-1","name":"System","type":"dir","sizeBytes":0,"modified":"2026-10-08T00:00:00Z","isProtected":true}],"context":{"parentId":"root-1","rootLabel":"Nhân Sự"}}"#;
        let result: FileListResponse = serde_json::from_str(payload).expect("file response");
        assert_eq!(result.context.parent_id, "root-1");
        assert_eq!(result.data[0].node_type, "dir");
        assert!(result.data[0].is_protected);
    }

    #[test]
    fn rename_file_response_decodes_backend_contract() {
        let payload = r#"{"file":{"id":"file-1","name":"Tài liệu","type":"dir","sizeBytes":0,"modified":"2026-10-08T00:00:00Z","isProtected":false}}"#;
        let result: RenameFileResponse = serde_json::from_str(payload).expect("rename response");
        assert_eq!(result.file.id, "file-1");
        assert_eq!(result.file.name, "Tài liệu");
        assert!(!result.file.is_protected);
    }

    #[test]
    fn activation_authorization_decodes_legacy_response_shape() {
        let payload = r#"{"activation_token":"scoped-session","expires_at":"2026-10-10T00:00:00Z","user":{"id":"employee-1","email":"employee@example.test","name":"Employee","role":"USER","isActive":false}}"#;
        let authorization: ActivationAuthorization =
            serde_json::from_str(payload).expect("activation response");
        assert_eq!(authorization.activation_token, "scoped-session");
        assert_eq!(authorization.user.email, "employee@example.test");
        assert!(!authorization.user.is_active);
    }

    #[test]
    fn admin_user_list_decodes_profile_and_pagination_contract() {
        let payload = r#"{"data":[{"id":"user-1","email":"user@example.test","name":"User One","role":"USER","isActive":true,"employeeCode":"NV-0009","department":"Finance","position":"Accountant","activationStatus":"active","createdAt":"2026-10-08T00:00:00Z","updatedAt":"2026-10-08T00:00:00Z"}],"pagination":{"page":1,"limit":20,"total":3}}"#;
        let page: UsersPage = serde_json::from_str(payload).expect("users response");

        assert_eq!(page.data[0].employee_code, "NV-0009");
        assert_eq!(page.data[0].department, "Finance");
        assert_eq!(page.data[0].activation_status, "active");
        assert_eq!(page.pagination.page, 1);
        assert_eq!(page.pagination.limit, 20);
        assert_eq!(page.pagination.total, 3);
    }

    #[test]
    fn dashboard_stats_decode_real_metrics_and_unavailable_sources() {
        let payload = r#"{"totalUsers":2,"activeUsers":1,"totalEmployees":2,"newEmployeesThisMonth":1,"monthlyRevenue":0,"monthlyExpense":0,"pendingApprovalsCount":3,"pendingWorkflows":[],"recentAuditLogs":[],"financialMetricsAvailable":false,"auditLogsAvailable":false}"#;
        let stats: DashboardStats = serde_json::from_str(payload).expect("dashboard stats");

        assert_eq!(stats.total_employees, 2);
        assert_eq!(stats.active_users, 1);
        assert_eq!(stats.pending_approvals_count, 3);
        assert!(!stats.financial_metrics_available);
        assert!(!stats.audit_logs_available);
    }

    #[test]
    fn employee_contract_decodes_legacy_fields_and_non_sent_delivery() {
        let list = r#"{"data":[{"id":"employee-1","key":"employee-1","code":"NV-0001","employeeCode":"NV-0001","name":"Employee One","email":"employee@example.test","phone":"0900000000","department":"Finance","position":"Accountant","status":"Thử việc","joinDate":"2026-10-01","salaryBase":25000000,"role":"USER","isActive":false,"activationStatus":"Chờ kích hoạt"}]}"#;
        let employees: EmployeeListResponse = serde_json::from_str(list).expect("employee list");
        assert_eq!(employees.data[0].code, "NV-0001");
        assert_eq!(employees.data[0].salary_base, 25_000_000);
        assert!(!employees.data[0].is_active);

        let created = r#"{"employee":{"id":"employee-2","code":"NV-0002","name":"Employee Two","email":"two@example.test","status":"Chính thức","salaryBase":0,"isActive":false,"activationStatus":"Chờ kích hoạt"},"delivery":{"status":"not_configured","message":"SMTP is not configured"},"expiresAt":"2026-10-09T00:00:00Z"}"#;
        let created: EmployeeCreateResponse =
            serde_json::from_str(created).expect("employee create response");
        assert_eq!(created.employee.id, "employee-2");
        assert_eq!(created.delivery.status, "not_configured");
        assert_eq!(created.delivery.message.as_deref(), Some("SMTP is not configured"));

        let profile = r#"{"employee":{"id":"employee-1","employeeCode":"NV-0001","name":"Employee One","email":"employee@example.test","phone":"0900000000","department":"Finance","position":"Accountant","status":"Chính thức","joinDate":"2026-01-01","salaryBase":25000000,"isActive":true}}"#;
        let profile: EmployeeResponse = serde_json::from_str(profile).expect("my profile");
        assert_eq!(profile.employee.id, "employee-1");
        assert_eq!(profile.employee.phone, "0900000000");
    }

    #[test]
    fn org_unit_collection_decodes_legacy_camel_case_record() {
        let payload = r#"{"data":[{"id":"org-id","key":"ou-finance","code":"FIN","name":"Tài chính","parentUnit":"Khối vận hành","manager":"Nguyễn An","managerTitle":"Trưởng phòng","managerEmail":"an@example.test","managerPhone":"0900000000","headcountLimit":12,"actualHeadcount":8,"location":"Hà Nội","establishedDate":"2024-01-01","annualBudget":1200000000,"budgetSpent":300000000,"status":"Đang hoạt động"}],"pagination":{"page":1,"limit":1,"total":1}}"#;
        let units: OrgUnitsResponse = serde_json::from_str(payload).expect("org units");
        let unit = &units.data[0];
        assert_eq!(unit.key, "ou-finance");
        assert_eq!(unit.parent_unit, "Khối vận hành");
        assert_eq!(unit.headcount_limit, 12);
        assert_eq!(unit.annual_budget, 1_200_000_000);
        assert_eq!(unit.status, "Đang hoạt động");
        let stored_record = serde_json::to_value(unit).expect("org unit write payload");
        assert_eq!(stored_record["parentUnit"], "Khối vận hành");
        assert!(stored_record.get("actualHeadcount").is_none());
        assert!(stored_record.get("id").is_none());
    }

    #[test]
    fn json_request_preserves_patch_and_delete_methods() {
        assert_eq!(json_request("PATCH", "/users/1".to_owned(), Some(json!({}))).method, "PATCH");
        assert_eq!(json_request("DELETE", "/employees/1".to_owned(), None).method, "DELETE");
        assert_eq!(json_request("PUT", "/collections/business_org_units".to_owned(), Some(json!({ "records": [] }))).method, "PUT");
        assert_eq!(encode_path_segment("unit one/é"), "unit%20one%2F%C3%A9");
    }
}
