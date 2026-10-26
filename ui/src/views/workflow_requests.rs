use std::time::Duration;
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, WorkflowBlueprint, WorkflowRequest, WorkflowRequestDecisionInput,
        WorkflowRequestInput, WorkflowRequestsResponse,
    },
    models::Session,
};
use egui::{Color32, RichText, Ui};

const PRIORITIES: &[&str] = &["Khẩn cấp (P1)", "Cao (P2)", "Bình thường (P3)"];
const STATUS_FILTERS: &[&str] = &[
    "Tất cả trạng thái",
    "Chờ duyệt",
    "Chờ ký số",
    "Yêu cầu bổ sung",
    "Đã từ chối",
    "Đã phê duyệt",
];

pub struct WorkflowRequestsView {
    requests: Vec<WorkflowRequest>,
    blueprints: Vec<WorkflowBlueprint>,
    pending_requests: Option<ApiTask<WorkflowRequestsResponse>>,
    pending_blueprints: Option<ApiTask<crate::api::WorkflowBlueprintsResponse>>,
    pending_create: Option<ApiTask<WorkflowRequest>>,
    pending_decision: Option<(String, ApiTask<WorkflowRequest>)>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    search: String,
    status_filter: String,
    expanded_key: Option<String>,
    create_open: bool,
    code: String,
    workflow_code: String,
    workflow_name: String,
    requester: String,
    department: String,
    summary_details: String,
    budget_amount: String,
    priority: String,
    decision_note: String,
    notice: String,
    error: String,
}

impl Default for WorkflowRequestsView {
    fn default() -> Self {
        Self {
            requests: Vec::new(),
            blueprints: Vec::new(),
            pending_requests: None,
            pending_blueprints: None,
            pending_create: None,
            pending_decision: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: true,
            search: String::new(),
            status_filter: STATUS_FILTERS[0].to_owned(),
            expanded_key: None,
            create_open: false,
            code: String::new(),
            workflow_code: String::new(),
            workflow_name: String::new(),
            requester: String::new(),
            department: String::new(),
            summary_details: String::new(),
            budget_amount: "0".to_owned(),
            priority: PRIORITIES[2].to_owned(),
            decision_note: String::new(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl WorkflowRequestsView {
    fn clear_user_bound_state(&mut self) {
        self.requests.clear();
        self.blueprints.clear();
        self.pending_requests = None;
        self.pending_blueprints = None;
        self.pending_create = None;
        self.pending_decision = None;
        self.last_loaded = None;
        self.needs_reload = true;
        self.search.clear();
        self.status_filter = STATUS_FILTERS[0].to_owned();
        self.expanded_key = None;
        self.create_open = false;
        self.code.clear();
        self.workflow_code.clear();
        self.workflow_name.clear();
        self.requester.clear();
        self.department.clear();
        self.summary_details.clear();
        self.budget_amount = "0".to_owned();
        self.priority = PRIORITIES[2].to_owned();
        self.decision_note.clear();
        self.notice.clear();
        self.error.clear();
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_requests.is_some()
            || self.pending_create.is_some()
            || self.pending_decision.is_some()
        {
            self.needs_reload = true;
            return;
        }
        self.pending_requests = Some(api.list_workflow_requests_task(session));
        self.pending_blueprints = Some(api.list_workflow_blueprints_task(session));
        self.needs_reload = false;
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.clear_user_bound_state();
            self.loaded_for = Some(session.user.id.clone());
        }
        if self.needs_reload
            && self.pending_requests.is_none()
            && self.pending_create.is_none()
            && self.pending_decision.is_none()
        {
            self.request_reload(session, api);
        } else if self.pending_requests.is_none()
            && self.pending_create.is_none()
            && self.pending_decision.is_none()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(15))
        {
            self.request_reload(session, api);
        }

        if let Some(result) = self.pending_requests.as_ref().and_then(ApiClient::poll) {
            self.pending_requests = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.requests = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_blueprints.as_ref().and_then(ApiClient::poll) {
            self.pending_blueprints = None;
            match result {
                Ok(response) => {
                    self.blueprints = response
                        .data
                        .into_iter()
                        .filter(|item| item.status == "Đang áp dụng")
                        .collect();
                    if !self
                        .blueprints
                        .iter()
                        .any(|item| item.workflow_code == self.workflow_code)
                    {
                        self.workflow_code = self
                            .blueprints
                            .first()
                            .map(|item| item.workflow_code.clone())
                            .unwrap_or_default();
                    }
                }
                Err(error) => {
                    if self.error.is_empty() {
                        self.error = error;
                    }
                }
            }
        }
        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(request) => {
                    self.requests.insert(0, request);
                    self.create_open = false;
                    self.code.clear();
                    self.requester.clear();
                    self.department.clear();
                    self.workflow_name.clear();
                    self.summary_details.clear();
                    self.budget_amount = "0".to_owned();
                    self.notice = "Đã lưu yêu cầu và sự kiện gửi lên backend.".to_owned();
                    self.error.clear();
                    self.last_loaded = Some(Instant::now());
                }
                Err(error) => self.error = error,
            }
        }

        let decision_result = self
            .pending_decision
            .as_ref()
            .and_then(|(key, task)| ApiClient::poll(task).map(|result| (key.clone(), result)));
        if let Some((key, result)) = decision_result {
            self.pending_decision = None;
            match result {
                Ok(updated) => {
                    if let Some(current) = self.requests.iter_mut().find(|item| item.key == key) {
                        *current = updated.clone();
                    }
                    self.notice = format!(
                        "Đã lưu quyết định. Trạng thái hiện tại: {}.",
                        updated.status
                    );
                    self.decision_note.clear();
                    self.error.clear();
                    self.last_loaded = Some(Instant::now());
                }
                Err(error) => self.error = error,
            }
        }

        if self.pending_requests.is_some()
            || self.pending_blueprints.is_some()
            || self.pending_create.is_some()
            || self.pending_decision.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::DARK_GREEN, &self.notice);
            ui.add_space(6.0);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
            ui.add_space(6.0);
        }
        let metrics = request_metrics(&self.requests);
        crate::widgets::metrics_with_padding(
            ui,
            "workflow.requests.metrics",
            &[
                crate::widgets::Metric {
                    label: "Hồ sơ đang chờ xử lý",
                    value: format!("{} hồ sơ", metrics.pending),
                    detail: if metrics.pending > 0 {
                        "Đang nằm trong hàng chờ xử lý"
                    } else {
                        "Không có việc tồn đọng"
                    },
                    color: if metrics.pending > 0 {
                        Color32::from_rgb(220, 38, 38)
                    } else {
                        Color32::from_rgb(22, 163, 74)
                    },
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Khẩn cấp P1 đang chờ",
                    value: format!("{} tờ trình P1", metrics.urgent),
                    detail: "Theo mức ưu tiên hồ sơ đã lưu",
                    color: if metrics.urgent > 0 {
                        Color32::from_rgb(217, 119, 6)
                    } else {
                        crate::theme::PRIMARY
                    },
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Tổng ngân sách đang chờ duyệt",
                    value: format_currency(metrics.pending_budget),
                    detail: "Số liệu từ yêu cầu đã lưu",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 22.0,
                },
                crate::widgets::Metric {
                    label: "Đã phê duyệt (tổng)",
                    value: format!("{} hồ sơ", metrics.approved),
                    detail: "Không đồng nghĩa với đã ký số CA",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
            ],
            egui::vec2(16.0, 16.0),
        );
        ui.add_space(16.0);
        let selected = STATUS_FILTERS
            .iter()
            .position(|status| *status == self.status_filter)
            .unwrap_or(0);
        let toolbar = crate::widgets::filter_toolbar(
            ui,
            "workflow.requests",
            STATUS_FILTERS,
            selected,
            &mut self.search,
            "Tìm theo mã yêu cầu, nội dung, người gửi...",
            "+  Tạo yêu cầu trình ký",
            true,
            usize::MAX,
        );
        if let Some(index) = toolbar.selected {
            self.status_filter = STATUS_FILTERS[index].to_owned();
        }
        if toolbar.reload_clicked {
            self.needs_reload = true;
        }
        if toolbar.create_clicked {
            self.create_open = true;
        }
        if self.create_open {
            self.render_create_form(ctx, session, api);
        }
        ui.add_space(14.0);
        let filtered = self
            .requests
            .iter()
            .filter(|request| request_matches(request, &self.search, &self.status_filter))
            .cloned()
            .collect::<Vec<_>>();
        let mut expand = None;
        let columns = [
            crate::widgets::TableColumn {
                title: "Mã hồ sơ & Mức độ",
                width: 170.0,
            },
            crate::widgets::TableColumn {
                title: "Nội dung tờ trình & Phân loại",
                width: (ui.available_width().max(1130.0) - 732.0).max(398.0),
            },
            crate::widgets::TableColumn {
                title: "Cấp duyệt & Hạn SLA",
                width: 180.0,
            },
            crate::widgets::TableColumn {
                title: "Trạng thái",
                width: 160.0,
            },
            crate::widgets::TableColumn {
                title: "Hành động",
                width: 220.0,
            },
        ];
        crate::widgets::table_with_row_height(
            ui,
            "workflow.requests.table",
            &columns,
            filtered.len(),
            112.0,
            |ui, row, column| {
                let request = &filtered[row];
                match column {
                    0 => {
                        ui.label(
                            RichText::new(&request.code)
                                .color(crate::theme::PRIMARY)
                                .size(13.0),
                        );
                        crate::widgets::tag(
                            ui,
                            &request.priority,
                            if request.priority.contains("P1") {
                                crate::widgets::TagTone::Error
                            } else if request.priority.contains("P2") {
                                crate::widgets::TagTone::Warning
                            } else {
                                crate::widgets::TagTone::Processing
                            },
                        );
                        if request.token_required {
                            ui.label(
                                RichText::new("Token PKI")
                                    .size(10.5)
                                    .color(Color32::from_rgb(147, 51, 234)),
                            );
                        }
                    }
                    1 => {
                        ui.label(
                            RichText::new(&request.workflow_name)
                                .size(13.5)
                                .color(Color32::from_rgb(15, 23, 42)),
                        );
                        ui.label(
                            RichText::new(&request.summary_details)
                                .size(12.0)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                        ui.label(
                            RichText::new(format!(
                                "Người gửi: {} ({}) · {}",
                                request.requester, request.department, request.submitted_at
                            ))
                            .size(11.5)
                            .color(Color32::from_rgb(71, 85, 105)),
                        );
                        if request.budget_amount > 0 {
                            ui.label(
                                RichText::new(format!(
                                    "Kinh phí đề xuất: {}",
                                    format_currency(request.budget_amount)
                                ))
                                .size(12.0)
                                .color(Color32::from_rgb(22, 163, 74)),
                            );
                        }
                    }
                    2 => {
                        ui.label(
                            RichText::new(format!(
                                "Cấp {}/{}: {}",
                                request.current_level,
                                request.total_levels,
                                request.role_requirement
                            ))
                            .size(12.0),
                        );
                        ui.label(RichText::new(&request.sla_deadline).size(12.0).color(
                            if request.sla_hours_left <= 2.0 && is_open_request(&request.status) {
                                Color32::from_rgb(220, 38, 38)
                            } else {
                                crate::theme::PRIMARY
                            },
                        ));
                        ui.label(
                            RichText::new(format!("{} tệp đính kèm", request.attachments.len()))
                                .size(11.0)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    3 => crate::widgets::tag(
                        ui,
                        &request.status,
                        match request.status.as_str() {
                            "Đã phê duyệt" => crate::widgets::TagTone::Success,
                            "Yêu cầu bổ sung" => crate::widgets::TagTone::Warning,
                            "Đã từ chối" => crate::widgets::TagTone::Neutral,
                            _ => crate::widgets::TagTone::Error,
                        },
                    ),
                    _ => {
                        if ui
                            .button(if self.expanded_key.as_deref() == Some(&request.key) {
                                "Ẩn"
                            } else {
                                "Xem"
                            })
                            .clicked()
                        {
                            expand = Some(request.key.clone());
                        }
                    }
                }
            },
        );
        ui.add_space(8.0);
        ui.collapsing("Giới hạn tích hợp",|ui|{
            ui.label("Quyết định bước thường được ghi cùng actor/thời điểm; bước yêu cầu PKI bị khóa vì chưa có nhà cung cấp ký số. File đính kèm và quy trình bổ sung/resubmit chưa tích hợp.");
        });
        if let Some(key) = expand {
            self.expanded_key = if self.expanded_key.as_deref() == Some(&key) {
                None
            } else {
                Some(key)
            };
        }
        let expanded_request = self
            .expanded_key
            .as_ref()
            .and_then(|key| self.requests.iter().find(|item| &item.key == key))
            .cloned();
        if let Some(request) = expanded_request {
            ui.add_space(8.0);
            let can_decide = is_open_request(&request.status)
                && !request.token_required
                && request.created_by_user_id != session.user.id
                && self.pending_decision.is_none();
            let mut requested_action = None;
            egui::Frame::group(ui.style()).show(ui, |ui| {
                ui.heading(format!("{} — {}", request.code, request.workflow_name));
                ui.label(format!("Trạng thái: {}", request.status));
                ui.label(format!("Nội dung: {}", request.summary_details));
                ui.label(format!(
                    "Bước hiện tại: {}/{} — {}",
                    request.current_level, request.total_levels, request.role_requirement
                ));
                ui.label(format!(
                    "Hạn SLA: {} (còn {:.2} giờ)",
                    request.sla_deadline, request.sla_hours_left
                ));
                ui.label(format!("Người tạo trên hệ thống: {}", request.created_by_name));
                ui.label(format!("Lịch sử đã ghi: {} sự kiện", request.approval_history.len()));
                for event in &request.approval_history {
                    let action = event
                        .get("action")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("Sự kiện");
                    let actor = event
                        .get("actorName")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("Không rõ người thực hiện");
                    let timestamp = event
                        .get("timestamp")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("Không rõ thời điểm");
                    ui.label(format!("{timestamp} — {actor} — {action}"));
                }
                ui.label(format!("File đính kèm: {}", request.attachments.len()));
                if is_open_request(&request.status) {
                    if request.token_required {
                        ui.colored_label(
                            Color32::from_rgb(146, 64, 14),
                            "Bước này yêu cầu PKI. Không thể duyệt/ký cho đến khi tích hợp nhà cung cấp thật.",
                        );
                    } else if request.created_by_user_id == session.user.id {
                        ui.colored_label(
                            Color32::from_rgb(146, 64, 14),
                            "Người tạo yêu cầu không thể tự quyết định yêu cầu này.",
                        );
                    } else {
                        ui.label("Quyết định thường không tạo chữ ký số; ghi chú là bắt buộc khi từ chối/yêu cầu bổ sung.");
                        ui.add(
                            egui::TextEdit::multiline(&mut self.decision_note)
                                .hint_text("Ghi chú quyết định")
                                .desired_rows(2)
                                .desired_width(f32::INFINITY),
                        );
                        ui.horizontal_wrapped(|ui| {
                            if ui
                                .add_enabled(
                                    can_decide,
                                    egui::Button::new("Phê duyệt bước thường (không ký số)"),
                                )
                                .clicked()
                            {
                                requested_action = Some("approve");
                            }
                            let has_note = !self.decision_note.trim().is_empty();
                            if ui
                                .add_enabled(
                                    can_decide && has_note,
                                    egui::Button::new("Từ chối"),
                                )
                                .clicked()
                            {
                                requested_action = Some("reject");
                            }
                            if ui
                                .add_enabled(
                                    can_decide && has_note,
                                    egui::Button::new("Yêu cầu bổ sung"),
                                )
                                .clicked()
                            {
                                requested_action = Some("return");
                            }
                            if self.pending_decision.is_some() {
                                ui.spinner();
                                ui.label("Đang lưu quyết định…");
                            }
                        });
                    }
                }
            });
            if let Some(action) = requested_action {
                let input = WorkflowRequestDecisionInput {
                    action: action.to_owned(),
                    note: Some(self.decision_note.clone()),
                };
                self.pending_decision = Some((
                    request.key.clone(),
                    api.decide_workflow_request_task(session, &request.key, &input),
                ));
                self.error.clear();
            }
        }
    }

    fn render_create_form(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let busy = self.pending_create.is_some();
        let (_, close) = crate::widgets::modal(
            ctx,
            "workflow.requests.create",
            "Khởi Tạo Hồ Sơ Trình Ký Số Điện Tử",
            760.0,
            busy,
            |ui| {
                ui.add_space(14.0);
                if self.blueprints.is_empty() {
                    ui.label("Cần có ít nhất một mẫu quy trình đang áp dụng để tạo yêu cầu.");
                    ui.add_space(10.0);
                }
                let unit = ((ui.available_width() - 24.0) / 3.2).max(1.0);
                ui.horizontal_top(|ui| {
                    ui.allocate_ui_with_layout(
                        egui::vec2(unit, 62.55),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            crate::widgets::form_input(
                                ui,
                                "request.code",
                                "Mã hồ sơ trình ký",
                                true,
                                &mut self.code,
                                "Ví dụ: WF-2026-0001",
                                false,
                            );
                        },
                    );
                    ui.allocate_ui_with_layout(
                        egui::vec2(unit * 1.2, 62.55),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            crate::widgets::form_field(
                                ui,
                                "request.workflow",
                                "Chọn luồng quy trình áp dụng",
                                self.workflow_code.is_empty(),
                                |ui| {
                                    let selected = self
                                        .blueprints
                                        .iter()
                                        .find(|item| item.workflow_code == self.workflow_code)
                                        .map(|item| {
                                            format!(
                                                "{} — {}",
                                                item.workflow_code, item.workflow_name
                                            )
                                        })
                                        .unwrap_or_else(|| "Chưa có mẫu đang áp dụng".to_owned());
                                    egui::ComboBox::from_id_salt("workflow_request_blueprint")
                                        .width(ui.available_width())
                                        .selected_text(selected)
                                        .show_ui(ui, |ui| {
                                            for item in &self.blueprints {
                                                ui.selectable_value(
                                                    &mut self.workflow_code,
                                                    item.workflow_code.clone(),
                                                    format!(
                                                        "{} — {}",
                                                        item.workflow_code, item.workflow_name
                                                    ),
                                                );
                                            }
                                        });
                                },
                            );
                        },
                    );
                    ui.allocate_ui_with_layout(
                        egui::vec2(unit, 62.55),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            crate::widgets::form_field(
                                ui,
                                "request.priority",
                                "Mức độ ưu tiên",
                                false,
                                |ui| {
                                    egui::ComboBox::from_id_salt("workflow_request_priority")
                                        .width(ui.available_width())
                                        .selected_text(&self.priority)
                                        .show_ui(ui, |ui| {
                                            for priority in PRIORITIES {
                                                ui.selectable_value(
                                                    &mut self.priority,
                                                    (*priority).to_owned(),
                                                    *priority,
                                                );
                                            }
                                        });
                                },
                            );
                        },
                    );
                });
                crate::widgets::form_input(
                    ui,
                    "request.title",
                    "Tiêu đề văn bản / Tờ trình",
                    true,
                    &mut self.workflow_name,
                    "Tên hồ sơ trình duyệt",
                    false,
                );
                let summary_label = ui.label(
                    RichText::new("Nội dung tóm tắt & Sự cần thiết đầu tư")
                        .size(13.5)
                        .line_height(Some(17.55)),
                );
                ui.add_space(3.0);
                ui.add_sized(
                    [ui.available_width(), 52.0],
                    egui::TextEdit::multiline(&mut self.summary_details)
                        .desired_rows(2)
                        .margin(egui::vec2(11.0, 4.0)),
                )
                .labelled_by(summary_label.id);
                ui.add_space(10.0);
                ui.horizontal_top(|ui| {
                    ui.allocate_ui_with_layout(
                        egui::vec2(unit * 1.2, 62.55),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            crate::widgets::form_input(
                                ui,
                                "request.requester",
                                "Người lập tờ trình",
                                true,
                                &mut self.requester,
                                "Nhập người đề xuất...",
                                false,
                            );
                        },
                    );
                    ui.allocate_ui_with_layout(
                        egui::vec2(unit, 62.55),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            crate::widgets::form_input(
                                ui,
                                "request.department",
                                "Đơn vị / Phòng ban",
                                true,
                                &mut self.department,
                                "Nhập phòng ban...",
                                false,
                            );
                        },
                    );
                    ui.allocate_ui_with_layout(
                        egui::vec2(unit, 62.55),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            crate::widgets::form_input(
                                ui,
                                "request.budget",
                                "Dự toán kinh phí (VNĐ)",
                                false,
                                &mut self.budget_amount,
                                "Nhập ngân sách...",
                                false,
                            );
                        },
                    );
                });
                ui.add_space(20.0);
                crate::widgets::action_row(ui, |ui| {
                    let can_submit = self.pending_create.is_none()
                        && self.pending_decision.is_none()
                        && !self.blueprints.is_empty();
                    if ui
                        .add_enabled(
                            can_submit,
                            egui::Button::new(
                                RichText::new("Trình duyệt hồ sơ").color(Color32::WHITE),
                            )
                            .fill(crate::theme::PRIMARY)
                            .min_size(egui::vec2(0.0, 32.0)),
                        )
                        .clicked()
                    {
                        let budget = self
                            .budget_amount
                            .trim()
                            .replace('.', "")
                            .replace(',', "")
                            .parse::<u64>();
                        match budget {
                            Ok(budget_amount) => {
                                let input = WorkflowRequestInput {
                                    code: self.code.clone(),
                                    workflow_code: self.workflow_code.clone(),
                                    workflow_name: self.workflow_name.clone(),
                                    requester: self.requester.clone(),
                                    department: self.department.clone(),
                                    summary_details: self.summary_details.clone(),
                                    budget_amount,
                                    priority: self.priority.clone(),
                                };
                                self.pending_create =
                                    Some(api.create_workflow_request_task(session, &input));
                                self.error.clear();
                            }
                            Err(_) => {
                                self.error =
                                    "Ngân sách phải là số nguyên không âm (VND).".to_owned()
                            }
                        }
                    }
                    if ui
                        .add(egui::Button::new("Hủy bỏ").min_size(egui::vec2(0.0, 32.0)))
                        .clicked()
                    {
                        self.create_open = false;
                    }
                    if self.pending_create.is_some() {
                        ui.label("Đang lưu…");
                    }
                });
            },
        );
        if close {
            self.create_open = false;
        }
        if self.pending_create.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }
}

fn request_matches(request: &WorkflowRequest, search: &str, status: &str) -> bool {
    let status_match = status == "Tất cả trạng thái" || request.status == status;
    if !status_match {
        return false;
    }
    let search = search.trim().to_lowercase();
    search.is_empty()
        || [
            request.code.as_str(),
            request.workflow_name.as_str(),
            request.workflow_code.as_str(),
            request.requester.as_str(),
            request.department.as_str(),
            request.summary_details.as_str(),
        ]
        .iter()
        .any(|field| field.to_lowercase().contains(&search))
}

fn is_open_request(status: &str) -> bool {
    matches!(status, "Chờ duyệt" | "Đang xử lý" | "Chờ ký số")
}

#[derive(Debug, Default, PartialEq, Eq)]
struct RequestMetrics {
    pending: usize,
    urgent: usize,
    pending_budget: u64,
    approved: usize,
}

fn request_metrics(requests: &[WorkflowRequest]) -> RequestMetrics {
    let mut metrics = RequestMetrics::default();
    for request in requests {
        if is_open_request(&request.status) {
            metrics.pending += 1;
            if request.priority == PRIORITIES[0] {
                metrics.urgent += 1;
            }
            metrics.pending_budget = metrics.pending_budget.saturating_add(request.budget_amount);
        } else if request.status == "Đã phê duyệt" {
            metrics.approved += 1;
        }
    }
    metrics
}

fn format_currency(value: u64) -> String {
    let digits = value.to_string();
    let mut output = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            output.push('.');
        }
        output.push(digit);
    }
    format!("{output} ₫")
}

#[cfg(test)]
mod tests {
    use super::{
        RequestMetrics, WorkflowRequestsView, format_currency, is_open_request, request_matches,
        request_metrics,
    };
    use crate::api::WorkflowRequest;

    fn sample() -> WorkflowRequest {
        WorkflowRequest {
            key: "req-1".to_owned(),
            code: "WF-2026-0001".to_owned(),
            workflow_name: "Mua sắm".to_owned(),
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
            approval_history: Vec::new(),
            pki_integration_available: false,
        }
    }

    #[test]
    fn request_filters_search_visible_fields_and_status() {
        let request = sample();
        assert!(request_matches(&request, "nguyễn", "Tất cả trạng thái"));
        assert!(request_matches(&request, "mua thiết bị", "Chờ duyệt"));
        assert!(!request_matches(&request, "nguyễn", "Đã duyệt"));
        assert!(!request_matches(&request, "không có", "Tất cả trạng thái"));
        assert!(is_open_request("Chờ ký số"));
        assert!(!is_open_request("Đã phê duyệt"));
    }

    #[test]
    fn request_view_starts_without_fake_records_and_currency_is_vietnamese() {
        assert!(WorkflowRequestsView::default().requests.is_empty());
        assert_eq!(format_currency(1_250_000), "1.250.000 ₫");
    }

    #[test]
    fn request_metrics_are_derived_from_real_status_priority_and_budget_fields() {
        let mut pending_p1 = sample();
        pending_p1.priority = "Khẩn cấp (P1)".to_owned();
        pending_p1.budget_amount = 10_000;

        let mut pending_p2 = sample();
        pending_p2.status = "Chờ ký số".to_owned();
        pending_p2.priority = "Cao (P2)".to_owned();
        pending_p2.budget_amount = 20_000;

        let mut approved = sample();
        approved.status = "Đã phê duyệt".to_owned();

        let mut returned = sample();
        returned.status = "Yêu cầu bổ sung".to_owned();

        assert_eq!(
            request_metrics(&[pending_p1, pending_p2, approved, returned]),
            RequestMetrics {
                pending: 2,
                urgent: 1,
                pending_budget: 30_000,
                approved: 1,
            }
        );
    }

    #[test]
    fn switching_accounts_clears_loaded_records_and_unsaved_request_state() {
        let mut view = WorkflowRequestsView::default();
        view.search = "confidential search".to_owned();
        view.status_filter = "Chờ ký số".to_owned();
        view.expanded_key = Some("request-from-previous-user".to_owned());
        view.create_open = true;
        view.code = "WF-PRIVATE-01".to_owned();
        view.workflow_name = "Private request title".to_owned();
        view.requester = "Private requester".to_owned();
        view.department = "Private department".to_owned();
        view.summary_details = "Private draft details".to_owned();
        view.decision_note = "Private decision note".to_owned();
        view.notice = "Previous account notice".to_owned();
        view.requests.push(sample());

        view.clear_user_bound_state();

        assert!(view.requests.is_empty());
        assert!(view.search.is_empty());
        assert_eq!(view.status_filter, "Tất cả trạng thái");
        assert!(view.expanded_key.is_none());
        assert!(!view.create_open);
        assert!(view.code.is_empty());
        assert!(view.workflow_name.is_empty());
        assert!(view.requester.is_empty());
        assert!(view.department.is_empty());
        assert!(view.summary_details.is_empty());
        assert!(view.decision_note.is_empty());
        assert_eq!(view.budget_amount, "0");
        assert_eq!(view.priority, "Bình thường (P3)");
        assert!(view.notice.is_empty());
        assert!(view.error.is_empty());
        assert!(view.needs_reload);
    }
}
