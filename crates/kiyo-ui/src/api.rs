use crate::models::{Session, StorageMode, User};
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

impl ApiClient {
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

    pub fn poll<T>(task: &ApiTask<T>) -> Option<Result<T, String>> {
        task.lock().ok()?.take()
    }
}

fn json_request(_method: &str, url: String, body: Option<Value>) -> Request {
    let body_bytes = body
        .map(|value| serde_json::to_vec(&value).unwrap_or_default())
        .unwrap_or_default();

    let mut request = Request::post(url, body_bytes);
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
