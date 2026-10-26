//! Small platform adapter for selecting and saving file bytes.
//!
//! Screens use these tasks on both native and WebAssembly builds, keeping
//! platform dialogs out of the shared UI and network client.

use crate::api::ApiTask;
use std::sync::{Arc, Mutex};

pub const MAX_FILE_SIZE: usize = 50 * 1024 * 1024;

#[derive(Debug)]
pub struct PickedFile {
    pub name: String,
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

pub fn pick_upload_file_task() -> ApiTask<Option<PickedFile>> {
    let task = Arc::new(Mutex::new(None));
    let result = Arc::clone(&task);

    #[cfg(not(target_arch = "wasm32"))]
    {
        match rfd::FileDialog::new()
            .set_title("Chọn tệp để tải lên")
            .pick_file()
        {
            Some(path) => {
                std::thread::spawn(move || {
                    let picked = read_native_file(&path).map(Some);
                    set_result(&result, picked);
                });
            }
            None => set_result(&result, Ok(None)),
        }
    }

    #[cfg(target_arch = "wasm32")]
    wasm_bindgen_futures::spawn_local(async move {
        let picked = match rfd::AsyncFileDialog::new().pick_file().await {
            Some(file) => {
                let name = file.file_name();
                if file.inner().size() > MAX_FILE_SIZE as f64 {
                    Err("Tệp vượt quá giới hạn 50 MB.".to_owned())
                } else {
                    let mime_type = mime_guess::from_path(&name)
                        .first_or_octet_stream()
                        .essence_str()
                        .to_owned();
                    let bytes = file.read().await;
                    if bytes.len() > MAX_FILE_SIZE {
                        Err("Tệp vượt quá giới hạn 50 MB.".to_owned())
                    } else {
                        Ok(Some(PickedFile {
                            name,
                            mime_type,
                            bytes,
                        }))
                    }
                }
            }
            None => Ok(None),
        };
        set_result(&result, picked);
    });

    task
}

pub fn save_download_task(file_name: String, bytes: Vec<u8>) -> ApiTask<bool> {
    let task = Arc::new(Mutex::new(None));
    let result = Arc::clone(&task);

    #[cfg(not(target_arch = "wasm32"))]
    {
        match rfd::FileDialog::new()
            .set_title("Lưu tệp đã tải xuống")
            .set_file_name(file_name.clone())
            .save_file()
        {
            Some(path) => {
                std::thread::spawn(move || {
                    set_result(
                        &result,
                        std::fs::write(path, bytes)
                            .map(|()| true)
                            .map_err(|error| format!("Không thể lưu tệp: {error}")),
                    );
                });
            }
            None => set_result(&result, Ok(false)),
        }
    }

    #[cfg(target_arch = "wasm32")]
    wasm_bindgen_futures::spawn_local(async move {
        let saved = match rfd::AsyncFileDialog::new()
            .set_file_name(file_name.clone())
            .save_file()
            .await
        {
            Some(file) => file
                .write(&bytes)
                .await
                .map(|()| true)
                .map_err(|error| format!("Không thể lưu tệp: {error}")),
            None => Ok(false),
        };
        set_result(&result, saved);
    });

    task
}

#[cfg(not(target_arch = "wasm32"))]
fn read_native_file(path: &std::path::Path) -> Result<PickedFile, String> {
    use std::io::Read;

    let metadata =
        std::fs::metadata(path).map_err(|error| format!("Không thể đọc thông tin tệp: {error}"))?;
    if metadata.len() > MAX_FILE_SIZE as u64 {
        return Err("Tệp vượt quá giới hạn 50 MB.".to_owned());
    }
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Không xác định được tên tệp.".to_owned())?;
    let mime_type = mime_guess::from_path(path)
        .first_or_octet_stream()
        .essence_str()
        .to_owned();
    let mut bytes = Vec::with_capacity(metadata.len().min(MAX_FILE_SIZE as u64 + 1) as usize);
    std::fs::File::open(path)
        .and_then(|file| file.take(MAX_FILE_SIZE as u64 + 1).read_to_end(&mut bytes))
        .map_err(|error| format!("Không thể đọc tệp: {error}"))?;
    if bytes.len() > MAX_FILE_SIZE {
        return Err("Tệp vượt quá giới hạn 50 MB.".to_owned());
    }
    Ok(PickedFile {
        name,
        mime_type,
        bytes,
    })
}

fn set_result<T>(task: &ApiTask<T>, result: Result<T, String>) {
    if let Ok(mut slot) = task.lock() {
        *slot = Some(result);
    }
}
