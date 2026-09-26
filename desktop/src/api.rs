use crate::models::{Session, StorageMode, User};
use serde_json::Value;
use std::time::Duration;

pub struct ApiClient {
    client: reqwest::blocking::Client,
}

impl Default for ApiClient {
    fn default() -> Self {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .unwrap_or_default();
        Self { client }
    }
}

impl ApiClient {
    pub fn login(
        &self,
        endpoint: &str,
        email: &str,
        password: &str,
        mode: StorageMode,
    ) -> Result<Session, String> {
        let url = format!("{}/auth/login", endpoint.trim_end_matches('/'));
        let body = serde_json::json!({
            "email": email,
            "password": password
        });

        match self.client.post(&url).json(&body).send() {
            Ok(res) => {
                if res.status().is_success() {
                    let val: Value = res.json().map_err(|e| e.to_string())?;
                    let token = val["data"]["token"].as_str().unwrap_or("").to_string();
                    let user_val = &val["data"]["user"];
                    let user = User {
                        id: user_val["id"].as_str().unwrap_or("").to_string(),
                        email: user_val["email"].as_str().unwrap_or("").to_string(),
                        name: user_val["name"].as_str().unwrap_or("").to_string(),
                        role: user_val["role"].as_str().unwrap_or("USER").to_string(),
                        is_active: user_val["isActive"].as_bool().unwrap_or(true),
                    };
                    Ok(Session {
                        token,
                        user,
                        endpoint: endpoint.to_string(),
                        mode,
                    })
                } else {
                    let err_val: Result<Value, _> = res.json();
                    let msg = err_val.ok()
                        .and_then(|v| v["error"].as_str().map(|s| s.to_string()))
                        .unwrap_or_else(|| "Đăng nhập không thành công. Vui lòng kiểm tra lại tài khoản hoặc mật khẩu.".to_string());
                    Err(msg)
                }
            }
            Err(err) => Err(format!("Lỗi kết nối máy chủ API ({}): {}", endpoint, err)),
        }
    }

    pub fn get_collection(&self, session: &Session, scope: &str) -> Result<Vec<Value>, String> {
        let url = format!(
            "{}/collections/{}",
            session.endpoint.trim_end_matches('/'),
            scope
        );
        let res = self
            .client
            .get(&url)
            .bearer_auth(&session.token)
            .send()
            .map_err(|e| e.to_string())?;

        if res.status().is_success() {
            let val: Value = res.json().map_err(|e| e.to_string())?;
            if let Some(arr) = val["data"].as_array() {
                Ok(arr.clone())
            } else {
                Ok(Vec::new())
            }
        } else {
            Err(format!("Không thể tải danh sách {}", scope))
        }
    }

    pub fn create_record(
        &self,
        session: &Session,
        scope: &str,
        data: Value,
    ) -> Result<Value, String> {
        let url = format!(
            "{}/collections/{}",
            session.endpoint.trim_end_matches('/'),
            scope
        );
        let res = self
            .client
            .post(&url)
            .bearer_auth(&session.token)
            .json(&data)
            .send()
            .map_err(|e| e.to_string())?;

        if res.status().is_success() {
            let val: Value = res.json().map_err(|e| e.to_string())?;
            Ok(val["data"].clone())
        } else {
            Err(format!("Không thể tạo bản ghi trong {}", scope))
        }
    }

    pub fn delete_record(&self, session: &Session, scope: &str, id: &str) -> Result<(), String> {
        let url = format!(
            "{}/collections/{}/{}",
            session.endpoint.trim_end_matches('/'),
            scope,
            id
        );
        let res = self
            .client
            .delete(&url)
            .bearer_auth(&session.token)
            .send()
            .map_err(|e| e.to_string())?;

        if res.status().is_success() {
            Ok(())
        } else {
            Err(format!("Không thể xóa bản ghi {}", id))
        }
    }

    pub fn test_connection(&self, endpoint: &str) -> Result<String, String> {
        let url = format!("{}/health", endpoint.trim_end_matches('/'));
        let res = self.client.get(&url).send().map_err(|e| e.to_string())?;
        if res.status().is_success() {
            Ok("Kết nối máy chủ thành công (200 OK)".to_string())
        } else {
            Err(format!("Máy chủ phản hồi mã lỗi: {}", res.status()))
        }
    }
}
