use std::time::Duration;
use web_time::Instant;

use crate::{
    api::{ApiClient, ApiTask, WorkflowRequest, WorkflowRequestsResponse},
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};
use egui::{Color32, Ui};

#[derive(Clone)]
struct HistoryEntry {
    request_code: String,
    request_title: String,
    action: String,
    signature_status: String,
    actor: String,
    timestamp: String,
    note: String,
    evidence: serde_json::Value,
}

pub struct WorkflowHistoryView {
    requests: Vec<WorkflowRequest>,
    pending_load: Option<ApiTask<WorkflowRequestsResponse>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    search: String,
    decision_filter: String,
    page: usize,
    page_size: usize,
    selected: Option<HistoryEntry>,
    error: String,
}

impl Default for WorkflowHistoryView {
    fn default() -> Self {
        Self {
            requests: Vec::new(),
            pending_load: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: true,
            search: String::new(),
            decision_filter: String::new(),
            page: 0,
            page_size: 8,
            selected: None,
            error: String::new(),
        }
    }
}

impl WorkflowHistoryView {
    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_load.is_some() {
            self.needs_reload = true;
            return;
        }
        self.pending_load = Some(api.list_workflow_requests_task(session));
        self.needs_reload = false;
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.requests.clear();
            self.pending_load = None;
            self.loaded_for = Some(session.user.id.clone());
            self.last_loaded = None;
            self.needs_reload = true;
            self.error.clear();
            self.search.clear();
            self.decision_filter.clear();
            self.page = 0;
            self.selected = None;
        }
        if self.needs_reload && self.pending_load.is_none() {
            self.request_reload(session, api);
        } else if self.pending_load.is_none()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(15))
        {
            self.request_reload(session, api);
        }

        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.requests = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if self.pending_load.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let entries = history_entries(&self.requests);
        let approved = entries
            .iter()
            .filter(|entry| entry.action == "approved")
            .count();
        let rejected = entries
            .iter()
            .filter(|entry| entry.action == "rejected" || entry.action == "returned")
            .count();
        let unknown =
            self.requests.is_empty() && (self.pending_load.is_some() || !self.error.is_empty());
        widgets::metrics_with_padding(
            ui,
            "history.kpi",
            &[
                Metric {
                    label: "Nhật ký kiểm toán lưu vết (Audit Trail)",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{} sự kiện", entries.len())
                    },
                    detail: "Sự kiện đã lưu trong hồ sơ quy trình",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                Metric {
                    label: "Chứng thư số CA hợp lệ",
                    value: "Chưa xác minh".into(),
                    detail: "Chưa kết nối PKI/TSA",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                Metric {
                    label: "Giao dịch phê duyệt thành công",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{approved} phê duyệt")
                    },
                    detail: "Quyết định đã lưu, không xác nhận chữ ký số",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 24.0,
                },
                Metric {
                    label: "Giao dịch từ chối / Bổ sung",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{rejected} trường hợp")
                    },
                    detail: "Theo sự kiện từ chối và yêu cầu bổ sung",
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 24.0,
                },
            ],
            egui::vec2(16.0, 16.0),
        );
        ui.add_space(16.0);
        ui.horizontal_wrapped(|ui| {
            let (rect, _) = ui.allocate_exact_size(
                egui::vec2(ui.available_width().min(340.0), 32.0),
                egui::Sense::hover(),
            );
            if widgets::search_input(
                ui,
                rect,
                &mut self.search,
                "Tìm theo mã hồ sơ, quy trình, người thực hiện, nội dung...",
            )
            .changed()
            {
                self.page = 0;
            }
            widgets::combo_box("history.decision")
                .width(180.0)
                .selected_text(match self.decision_filter.as_str() {
                    "approved" => "Đã phê duyệt",
                    "rejected" => "Từ chối",
                    "returned" => "Yêu cầu bổ sung",
                    "submitted" => "Đã gửi yêu cầu",
                    _ => "Tất cả quyết định",
                })
                .show_ui(ui, |ui| {
                    for (value, label) in [
                        ("", "Tất cả quyết định"),
                        ("approved", "Đã phê duyệt"),
                        ("rejected", "Từ chối"),
                        ("returned", "Yêu cầu bổ sung"),
                        ("submitted", "Đã gửi yêu cầu"),
                    ] {
                        if ui
                            .selectable_value(&mut self.decision_filter, value.into(), label)
                            .changed()
                        {
                            self.page = 0;
                        }
                    }
                });
            ui.add_enabled_ui(false, |ui| {
                widgets::combo_box("history.ca")
                    .width(180.0)
                    .selected_text("CA chưa kết nối")
                    .show_ui(ui, |_| {});
            })
            .response
            .on_disabled_hover_text("Chưa có API chứng thư số và nhà cung cấp CA.");
            ui.add_enabled(false, egui::Button::new("Xuất Báo Cáo Kiểm Toán"))
                .on_disabled_hover_text("Chưa có bộ tạo PDF/Excel.");
            if ui
                .add_enabled(self.pending_load.is_none(), egui::Button::new("Làm mới"))
                .clicked()
            {
                self.needs_reload = true;
            }
        });
        ui.add_space(14.0);
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        if self.pending_load.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải lịch sử xử lý…");
            });
        }
        let filtered = entries
            .iter()
            .filter(|entry| {
                history_matches(entry, &self.search)
                    && (self.decision_filter.is_empty() || entry.action == self.decision_filter)
            })
            .collect::<Vec<_>>();
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let rows = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        widgets::table_with_row_height(
            ui,
            "history.table",
            &[
                TableColumn {
                    title: "Mã Audit & Hồ sơ",
                    width: 170.0,
                },
                TableColumn {
                    title: "Quy trình, Cấp duyệt & Ý kiến chỉ đạo",
                    width: 360.0,
                },
                TableColumn {
                    title: "Người ký & Quyết định",
                    width: 190.0,
                },
                TableColumn {
                    title: "Thời gian & Địa chỉ IP",
                    width: 190.0,
                },
                TableColumn {
                    title: "Chứng thư số Token CA",
                    width: 180.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 140.0,
                },
            ],
            rows.len(),
            104.0,
            |ui, row, col| {
                let entry = rows[row];
                match col {
                    0 => {
                        ui.colored_label(crate::theme::PRIMARY, &entry.request_code);
                        ui.small("Mã audit: chưa cung cấp");
                    }
                    1 => {
                        ui.label(&entry.request_title);
                        ui.small(
                            entry
                                .evidence
                                .get("stepName")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or("Cấp duyệt: chưa cung cấp"),
                        );
                        ui.small(if entry.note.is_empty() {
                            "—"
                        } else {
                            &entry.note
                        });
                    }
                    2 => {
                        ui.label(&entry.actor);
                        widgets::tag(
                            ui,
                            event_label(&entry.action, &entry.signature_status),
                            match entry.action.as_str() {
                                "approved" => TagTone::Success,
                                "rejected" => TagTone::Error,
                                "returned" => TagTone::Warning,
                                _ => TagTone::Neutral,
                            },
                        );
                    }
                    3 => {
                        ui.label(&entry.timestamp);
                        ui.small(
                            entry
                                .evidence
                                .get("ipAddress")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or("IP: chưa cung cấp"),
                        );
                        ui.small(
                            entry
                                .evidence
                                .get("deviceInfo")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or("Thiết bị: chưa cung cấp"),
                        );
                    }
                    4 => {
                        ui.label(signature_label(&entry.signature_status));
                        ui.small("CA / SHA-256: chưa xác minh");
                    }
                    _ => {
                        if ui.button("Chi tiết").clicked() {
                            self.selected = Some((**entry).clone());
                        }
                        ui.add_enabled(false, egui::Button::new("Xác minh"))
                            .on_disabled_hover_text("Chưa có dịch vụ xác minh PKI/TSA.");
                    }
                }
            },
        );
        ui.add_space(8.0);
        widgets::pagination(
            ui,
            "history.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
        if let Some(entry) = self.selected.clone() {
            let (_, close) = widgets::drawer(
                ctx,
                "history.detail",
                "Bằng Chứng Xử Lý & Thông Tin Kiểm Toán",
                680.0,
                |ui| {
                    egui::Frame::none()
                        .fill(Color32::from_rgb(248, 250, 252))
                        .rounding(8.0)
                        .inner_margin(14.0)
                        .show(ui, |ui| {
                            ui.colored_label(
                                crate::theme::PRIMARY,
                                format!("HỒ SƠ: {}", entry.request_code),
                            );
                            ui.heading(&entry.request_title);
                            ui.label(event_label(&entry.action, &entry.signature_status));
                        });
                    ui.add_space(16.0);
                    egui::Frame::group(ui.style()).inner_margin(16.0).show(ui, |ui| {
                    ui.strong("Thông tin chữ ký điện tử");
                    ui.label(format!("Người thực hiện: {}", entry.actor));
                    ui.label(format!("Thời điểm sự kiện: {}", entry.timestamp));
                    ui.label(format!("Trạng thái chữ ký: {}", signature_label(&entry.signature_status)));
                    ui.label("Chứng thư CA, dấu thời gian TSA và tính toàn vẹn SHA-256: chưa xác minh.");
                });
                    ui.add_space(16.0);
                    ui.strong("Ý kiến / Ghi chú");
                    ui.label(if entry.note.is_empty() {
                        "—"
                    } else {
                        &entry.note
                    });
                    ui.collapsing("Dữ liệu sự kiện đã lưu", |ui| {
                        ui.label(serde_json::to_string_pretty(&entry.evidence).unwrap_or_default());
                    });
                    ui.horizontal_wrapped(|ui| {
                        ui.add_enabled(false, egui::Button::new("Xác minh tính toàn vẹn"))
                            .on_disabled_hover_text("Chưa kết nối PKI/TSA.");
                        ui.add_enabled(false, egui::Button::new("In Chứng Nhận (A4)"))
                            .on_disabled_hover_text("Chưa có bộ tạo tài liệu.");
                        ui.add_enabled(false, egui::Button::new("Xuất PDF"))
                            .on_disabled_hover_text("Chưa có bộ tạo PDF.");
                    });
                },
            );
            if close {
                self.selected = None;
            }
        }
    }
}

fn history_entries(requests: &[WorkflowRequest]) -> Vec<HistoryEntry> {
    requests
        .iter()
        .flat_map(|request| {
            request
                .approval_history
                .iter()
                .map(move |event| HistoryEntry {
                    request_code: request.code.clone(),
                    request_title: request.workflow_name.clone(),
                    action: event
                        .get("action")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("unknown")
                        .to_owned(),
                    signature_status: event
                        .get("signatureStatus")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("unknown")
                        .to_owned(),
                    actor: event
                        .get("actorName")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("Không rõ người thực hiện")
                        .to_owned(),
                    timestamp: event
                        .get("timestamp")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("Không rõ thời điểm")
                        .to_owned(),
                    evidence: event.clone(),
                    note: event
                        .get("note")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or_default()
                        .to_owned(),
                })
        })
        .collect()
}

fn history_matches(entry: &HistoryEntry, search: &str) -> bool {
    let search = search.trim().to_lowercase();
    search.is_empty()
        || [
            entry.request_code.as_str(),
            entry.request_title.as_str(),
            entry.action.as_str(),
            entry.actor.as_str(),
            entry.note.as_str(),
        ]
        .iter()
        .any(|field| field.to_lowercase().contains(&search))
}

fn event_label<'a>(action: &'a str, signature_status: &str) -> &'a str {
    match action {
        "submitted" => "Đã gửi yêu cầu",
        "approved" if signature_status == "not_signed" => "Đã duyệt bước thường",
        "approved" => "Đã duyệt",
        "rejected" => "Đã từ chối",
        "returned" => "Yêu cầu bổ sung",
        _ => action,
    }
}

fn signature_label(signature_status: &str) -> &str {
    match signature_status {
        "not_applicable" => "Không áp dụng",
        "not_signed" => "Không ký số",
        _ => "Chưa xác minh",
    }
}

#[cfg(test)]
mod tests {
    use super::{
        HistoryEntry, WorkflowHistoryView, event_label, history_entries, history_matches,
        signature_label,
    };
    use crate::api::WorkflowRequest;
    use serde_json::json;

    fn sample() -> WorkflowRequest {
        WorkflowRequest {
            key: "request-1".to_owned(),
            code: "WF-2026-0001".to_owned(),
            workflow_name: "Đề xuất thiết bị".to_owned(),
            workflow_code: "WF-PURCHASE".to_owned(),
            category: "Mua sắm & Tài sản".to_owned(),
            requester: "Nguyễn An".to_owned(),
            department: "Vận hành".to_owned(),
            current_level: 1,
            total_levels: 2,
            role_requirement: "Quản lý".to_owned(),
            budget_amount: 1_250_000,
            submitted_at: "2026-10-08T00:00:00Z".to_owned(),
            sla_deadline: "2026-10-08T08:00:00Z".to_owned(),
            sla_hours_left: 8.0,
            priority: "Bình thường (P3)".to_owned(),
            status: "Chờ duyệt".to_owned(),
            summary_details: "Mua thiết bị".to_owned(),
            token_required: false,
            attachments: Vec::new(),
            approval_notes: None,
            created_by_user_id: "admin-1".to_owned(),
            created_by_name: "Admin".to_owned(),
            approval_history: vec![json!({
                "action":"submitted",
                "signatureStatus":"not_applicable",
                "actorName":"Admin",
                "timestamp":"2026-10-08T00:00:00Z",
                "note":null
            })],
            pki_integration_available: false,
        }
    }

    #[test]
    fn history_view_only_flattens_persisted_events_and_filters_them() {
        let entries = history_entries(&[sample()]);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].action, "submitted");
        assert_eq!(entries[0].actor, "Admin");
        assert!(history_matches(&entries[0], "WF-2026"));
        assert!(!history_matches(&entries[0], "not present"));
        assert_eq!(event_label("submitted", "not_applicable"), "Đã gửi yêu cầu");
        assert_eq!(signature_label("not_signed"), "Không ký số");
    }

    #[test]
    fn history_empty_state_has_no_seeded_entries() {
        assert!(history_entries(&[]).is_empty());
        assert_eq!(WorkflowHistoryView::default().requests.len(), 0);
        assert!(!history_matches(
            &HistoryEntry {
                request_code: String::new(),
                request_title: String::new(),
                action: String::new(),
                signature_status: String::new(),
                actor: String::new(),
                timestamp: String::new(),
                note: String::new(),
                evidence: serde_json::Value::Null,
            },
            "anything"
        ));
    }
}
