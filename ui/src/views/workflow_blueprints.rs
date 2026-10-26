use std::time::Duration;
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, WorkflowBlueprint, WorkflowBlueprintInput, WorkflowBlueprintsResponse,
    },
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};
use egui::{Color32, RichText, Ui};

const CATEGORIES: &[&str] = &[
    "Mua sắm & Tài sản",
    "Tài chính & Thanh toán",
    "Hợp đồng & Pháp chế",
    "Nhân sự & Phúc lợi",
    "Văn phòng & Hành chính",
    "Vận hành Kỹ thuật & IDC",
];
const STATUSES: &[&str] = &["Tất cả trạng thái", "Đang áp dụng", "Bản nháp", "Tạm ngưng"];

enum PendingMutation {
    Create(ApiTask<WorkflowBlueprint>),
    Status {
        key: String,
        task: ApiTask<WorkflowBlueprint>,
    },
}

enum MutationResult {
    Created(WorkflowBlueprint),
    Status(WorkflowBlueprint),
}

pub struct WorkflowBlueprintsView {
    blueprints: Vec<WorkflowBlueprint>,
    pending_load: Option<ApiTask<WorkflowBlueprintsResponse>>,
    pending_mutation: Option<PendingMutation>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    search: String,
    category_filter: String,
    status_filter: String,
    expanded_key: Option<String>,
    page: usize,
    page_size: usize,
    create_open: bool,
    workflow_code: String,
    workflow_name: String,
    category: String,
    description: String,
    scope: String,
    total_steps: String,
    sla_target_hours: String,
    budget_limit: String,
    version: String,
    notice: String,
    error: String,
}

impl Default for WorkflowBlueprintsView {
    fn default() -> Self {
        Self {
            blueprints: Vec::new(),
            pending_load: None,
            pending_mutation: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: true,
            search: String::new(),
            category_filter: "Tất cả phân nhóm".to_owned(),
            status_filter: STATUSES[0].to_owned(),
            expanded_key: None,
            page: 0,
            page_size: 8,
            create_open: false,
            workflow_code: "WF-CUSTOM-01".to_owned(),
            workflow_name: String::new(),
            category: CATEGORIES[0].to_owned(),
            description: String::new(),
            scope: "Toàn công ty".to_owned(),
            total_steps: "3".to_owned(),
            sla_target_hours: "4".to_owned(),
            budget_limit: "0".to_owned(),
            version: "v1.0".to_owned(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl WorkflowBlueprintsView {
    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_load.is_some() || self.pending_mutation.is_some() {
            self.needs_reload = true;
            return;
        }
        self.pending_load = Some(api.list_workflow_blueprints_task(session));
        self.needs_reload = false;
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.blueprints.clear();
            self.pending_load = None;
            self.pending_mutation = None;
            self.loaded_for = Some(session.user.id.clone());
            self.last_loaded = None;
            self.needs_reload = true;
            self.notice.clear();
            self.error.clear();
            self.create_open = false;
            self.expanded_key = None;
            self.page = 0;
            self.search.clear();
            self.workflow_name.clear();
            self.description.clear();
        }
        if self.needs_reload && self.pending_load.is_none() && self.pending_mutation.is_none() {
            self.request_reload(session, api);
        } else if self.pending_load.is_none()
            && self.pending_mutation.is_none()
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
                    self.blueprints = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }

        let mutation_result = self
            .pending_mutation
            .as_ref()
            .and_then(|pending| match pending {
                PendingMutation::Create(task) => {
                    ApiClient::poll(task).map(|result| result.map(MutationResult::Created))
                }
                PendingMutation::Status { task, .. } => {
                    ApiClient::poll(task).map(|result| result.map(MutationResult::Status))
                }
            });
        if let Some(result) = mutation_result {
            let pending = self
                .pending_mutation
                .take()
                .expect("workflow mutation exists");
            match (pending, result) {
                (PendingMutation::Create(_), Ok(MutationResult::Created(blueprint))) => {
                    self.blueprints.insert(0, blueprint);
                    self.create_open = false;
                    self.workflow_name.clear();
                    self.description.clear();
                    self.workflow_code = format!("WF-CUSTOM-{:02}", self.blueprints.len() + 1);
                    self.notice =
                        "Đã lưu mẫu quy trình. Hiện chưa có bộ máy tạo/chuyển phiếu.".to_owned();
                    self.error.clear();
                }
                (PendingMutation::Status { key, .. }, Ok(MutationResult::Status(updated))) => {
                    if let Some(current) = self.blueprints.iter_mut().find(|item| item.key == key) {
                        *current = updated;
                    }
                    self.notice = "Đã cập nhật trạng thái mẫu quy trình.".to_owned();
                    self.error.clear();
                }
                (_, Ok(_)) => self.error = "Phản hồi API mẫu quy trình không hợp lệ.".to_owned(),
                (_, Err(error)) => self.error = error,
            }
        }
        if self.pending_load.is_some() || self.pending_mutation.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let active = self
            .blueprints
            .iter()
            .filter(|item| item.status == "Đang áp dụng")
            .count();
        let average_sla = if self.blueprints.is_empty() {
            "—".into()
        } else {
            format!(
                "{:.1} Giờ / Quy trình",
                self.blueprints
                    .iter()
                    .map(|item| f64::from(item.sla_target_hours))
                    .sum::<f64>()
                    / self.blueprints.len() as f64
            )
        };
        let unknown =
            self.blueprints.is_empty() && (self.pending_load.is_some() || !self.error.is_empty());
        widgets::metrics_with_padding(
            ui,
            "blueprints.kpi",
            &[
                Metric {
                    label: "Quy trình nghiệp vụ số hóa",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{} quy trình chuẩn", self.blueprints.len())
                    },
                    detail: "Danh mục cấu hình đã lưu",
                    color: crate::theme::PRIMARY,
                    value_size: 22.0,
                },
                Metric {
                    label: "Trạng thái đang kích hoạt",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{active}/{} luồng hoạt động", self.blueprints.len())
                    },
                    detail: "Trạng thái mẫu; chưa tự động chuyển hồ sơ",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 22.0,
                },
                Metric {
                    label: "Tổng lượt xử lý hoàn tất",
                    value: "Chưa xác định".into(),
                    detail: "Chưa có thống kê thực thi workflow",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 22.0,
                },
                Metric {
                    label: "Cam kết thời gian chuẩn (SLA Target)",
                    value: average_sla,
                    detail: "Mục tiêu cấu hình, chưa có giám sát SLA",
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 22.0,
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
                "Tìm theo mã quy trình, tên, phân nhóm, người tạo...",
            )
            .changed()
            {
                self.page = 0;
            }
            widgets::combo_box("blueprints.category")
                .width(230.0)
                .selected_text(&self.category_filter)
                .show_ui(ui, |ui| {
                    if ui
                        .selectable_value(
                            &mut self.category_filter,
                            "Tất cả phân nhóm".into(),
                            "Tất cả phân nhóm",
                        )
                        .changed()
                    {
                        self.page = 0;
                    }
                    let mut categories = CATEGORIES
                        .iter()
                        .map(|category| (*category).to_owned())
                        .collect::<Vec<_>>();
                    for item in &self.blueprints {
                        if !categories.contains(&item.category) {
                            categories.push(item.category.clone());
                        }
                    }
                    for category in categories {
                        if ui
                            .selectable_value(&mut self.category_filter, category.clone(), category)
                            .changed()
                        {
                            self.page = 0;
                        }
                    }
                });
            widgets::combo_box("blueprints.status")
                .width(170.0)
                .selected_text(&self.status_filter)
                .show_ui(ui, |ui| {
                    for status in STATUSES {
                        if ui
                            .selectable_value(&mut self.status_filter, (*status).into(), *status)
                            .changed()
                        {
                            self.page = 0;
                        }
                    }
                });
            ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                .on_disabled_hover_text("Chưa có bộ tạo tệp.");
            if ui
                .add_enabled(
                    self.pending_load.is_none() && self.pending_mutation.is_none(),
                    egui::Button::new("Làm mới"),
                )
                .clicked()
            {
                self.needs_reload = true;
            }
            if ui
                .add_enabled(
                    self.pending_mutation.is_none(),
                    egui::Button::new("Thiết kế quy trình mới").fill(crate::theme::PRIMARY),
                )
                .clicked()
            {
                self.create_open = true;
            }
        });
        ui.add_space(12.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::DARK_GREEN, &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        if self.pending_load.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải danh mục quy trình…");
            });
        }
        let visible = self
            .blueprints
            .iter()
            .filter(|item| {
                blueprint_matches(
                    item,
                    &self.search,
                    &self.category_filter,
                    &self.status_filter,
                )
            })
            .cloned()
            .collect::<Vec<_>>();
        self.page = self
            .page
            .min(visible.len().div_ceil(self.page_size).max(1) - 1);
        let rows = visible
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        let mut status_change = None;
        widgets::table_with_row_height(
            ui,
            "blueprints.table",
            &[
                TableColumn {
                    title: "Mã & Phân nhóm",
                    width: 180.0,
                },
                TableColumn {
                    title: "Tên quy trình & Mô tả luồng",
                    width: 360.0,
                },
                TableColumn {
                    title: "Số cấp duyệt & SLA",
                    width: 190.0,
                },
                TableColumn {
                    title: "Lượt chạy & Tỷ lệ duyệt",
                    width: 170.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 140.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 200.0,
                },
            ],
            rows.len(),
            96.0,
            |ui, row, col| {
                let item = rows[row];
                match col {
                    0 => {
                        ui.colored_label(crate::theme::PRIMARY, &item.workflow_code);
                        widgets::tag(ui, &item.category, TagTone::Cyan);
                        ui.small(&item.version);
                    }
                    1 => {
                        ui.label(&item.workflow_name);
                        ui.small(&item.description);
                        ui.label(
                            RichText::new(format!(
                                "Phạm vi: {} · Người thiết kế: {}",
                                item.scope, item.created_by
                            ))
                            .size(11.5)
                            .color(Color32::from_rgb(37, 99, 235)),
                        );
                    }
                    2 => {
                        ui.label(format!("{} Cấp phê duyệt", item.total_steps));
                        ui.colored_label(
                            Color32::from_rgb(217, 119, 6),
                            format!("SLA mục tiêu: ≤ {} Giờ", item.sla_target_hours),
                        );
                        ui.small(if item.applicable_budget_limit > 0 {
                            format!(
                                "Hạn mức: ≤ {} ₫",
                                crate::views::employees::format_vnd(item.applicable_budget_limit)
                            )
                        } else {
                            "Hạn mức: không giới hạn".into()
                        });
                    }
                    3 => {
                        ui.label("Chưa xác định");
                        ui.small("Chưa có API thống kê thực thi");
                    }
                    4 => widgets::tag(
                        ui,
                        &item.status,
                        match item.status.as_str() {
                            "Đang áp dụng" => TagTone::Success,
                            "Bản nháp" => TagTone::Warning,
                            _ => TagTone::Neutral,
                        },
                    ),
                    _ => {
                        ui.horizontal_wrapped(|ui| {
                            if ui.button("Xem luồng").clicked() {
                                self.expanded_key = Some(item.key.clone());
                            }
                            if ui
                                .add_enabled(
                                    self.pending_mutation.is_none() && self.pending_load.is_none(),
                                    egui::Button::new(if item.status == "Đang áp dụng" {
                                        "Tạm ngưng"
                                    } else {
                                        "Áp dụng mẫu"
                                    }),
                                )
                                .clicked()
                            {
                                status_change = Some((
                                    item.key.clone(),
                                    if item.status == "Đang áp dụng" {
                                        "Tạm ngưng".to_owned()
                                    } else {
                                        "Đang áp dụng".to_owned()
                                    },
                                ));
                            }
                        });
                    }
                }
            },
        );
        ui.add_space(8.0);
        widgets::pagination(
            ui,
            "blueprints.pagination",
            &mut self.page,
            visible.len(),
            &mut self.page_size,
        );
        if let Some((key, status)) = status_change {
            self.error.clear();
            self.pending_mutation = Some(PendingMutation::Status {
                task: api.update_workflow_blueprint_status_task(session, &key, &status),
                key,
            });
        }
        if let Some(item) = self
            .blueprints
            .iter()
            .find(|item| self.expanded_key.as_deref() == Some(item.key.as_str()))
            .cloned()
        {
            let (_, close) = widgets::drawer(
                ctx,
                "blueprints.detail",
                "Sơ Đồ Luồng & Cấu Hình Quy Trình",
                680.0,
                |ui| {
                    egui::Frame::none()
                        .fill(Color32::from_rgb(248, 250, 252))
                        .rounding(8.0)
                        .inner_margin(16.0)
                        .show(ui, |ui| {
                            ui.colored_label(crate::theme::PRIMARY, &item.workflow_code);
                            ui.label(RichText::new(&item.workflow_name).size(17.0).strong());
                            ui.label(&item.description);
                            ui.small(format!(
                                "{} · {} · {}",
                                item.category, item.scope, item.version
                            ));
                            widgets::tag(
                                ui,
                                &item.status,
                                if item.status == "Đang áp dụng" {
                                    TagTone::Success
                                } else {
                                    TagTone::Neutral
                                },
                            );
                        });
                    ui.add_space(16.0);
                    ui.strong("Cấu hình các cấp duyệt");
                    if item.approval_flow.is_empty() {
                        ui.label("Chưa có cấu hình cấp duyệt.");
                    }
                    for step in &item.approval_flow {
                        egui::Frame::group(ui.style())
                            .inner_margin(12.0)
                            .show(ui, |ui| {
                                ui.colored_label(
                                    crate::theme::PRIMARY,
                                    format!("Cấp {} · {}", step.level, step.role_name),
                                );
                                ui.label(format!(
                                    "Người duyệt mặc định: {}",
                                    step.default_approver
                                ));
                                ui.label(format!(
                                    "SLA cấu hình: {} giờ · {}",
                                    step.sla_hours,
                                    if step.can_reject {
                                        "Có thể từ chối"
                                    } else {
                                        "Không thể từ chối"
                                    }
                                ));
                                ui.small(format!(
                                    "Yêu cầu Token PKI: {} · Chưa xác minh chữ ký",
                                    if step.require_token_pki {
                                        "Có"
                                    } else {
                                        "Không"
                                    }
                                ));
                            });
                        ui.add_space(10.0);
                    }
                    ui.strong("Trường biểu mẫu");
                    widgets::table_with_row_height(
                        ui,
                        "blueprints.fields",
                        &[
                            TableColumn {
                                title: "Tên trường",
                                width: 150.0,
                            },
                            TableColumn {
                                title: "Nhãn hiển thị",
                                width: 190.0,
                            },
                            TableColumn {
                                title: "Kiểu dữ liệu",
                                width: 130.0,
                            },
                            TableColumn {
                                title: "Bắt buộc",
                                width: 85.0,
                            },
                        ],
                        item.form_fields.len(),
                        44.0,
                        |ui, row, col| {
                            let field = &item.form_fields[row];
                            ui.label(match col {
                                0 => field.field_name.as_str(),
                                1 => &field.label,
                                2 => &field.field_type,
                                _ => {
                                    if field.required {
                                        "Có"
                                    } else {
                                        "Không"
                                    }
                                }
                            });
                        },
                    );
                    ui.add_space(16.0);
                    ui.horizontal_wrapped(|ui| {
                        ui.add_enabled(false, egui::Button::new("Xuất BPMN"))
                            .on_disabled_hover_text("Chưa có bộ xuất BPMN.");
                        ui.add_enabled(false, egui::Button::new("In Sơ Đồ (A4)"))
                            .on_disabled_hover_text("Chưa có bộ tạo tài liệu.");
                        ui.add_enabled(false, egui::Button::new("Chạy thử quy trình"))
                            .on_disabled_hover_text("Chưa có bộ máy thực thi.");
                    });
                },
            );
            if close {
                self.expanded_key = None;
            }
        }
        if self.create_open {
            self.render_create_dialog(ctx, session, api);
        }
    }

    fn render_create_dialog(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let (_, close) = widgets::modal(
            ctx,
            "blueprints.create",
            "Thiết Kế & Định Nghĩa Luồng Quy Trình Số Mới",
            680.0,
            self.pending_mutation.is_some(),
            |ui| {
                ui.add_space(14.0);
                widgets::form_input(
                    ui,
                    "blueprint.code",
                    "Mã quy trình",
                    true,
                    &mut self.workflow_code,
                    "",
                    false,
                );
                widgets::form_select(
                    ui,
                    "blueprint.category",
                    "Phân nhóm nghiệp vụ",
                    true,
                    &mut self.category,
                    CATEGORIES,
                );
                widgets::form_input(
                    ui,
                    "blueprint.name",
                    "Tên quy trình nghiệp vụ",
                    true,
                    &mut self.workflow_name,
                    "",
                    false,
                );
                widgets::form_textarea(
                    ui,
                    "blueprint.description",
                    "Mục đích & Phạm vi áp dụng chi tiết",
                    true,
                    &mut self.description,
                    "",
                    3,
                );
                widgets::form_input(
                    ui,
                    "blueprint.scope",
                    "Phạm vi phòng ban áp dụng",
                    true,
                    &mut self.scope,
                    "",
                    false,
                );
                if ui.available_width() >= 420.0 {
                    ui.columns(2, |cols| {
                        widgets::form_input(
                            &mut cols[0],
                            "blueprint.steps",
                            "Số cấp phê duyệt",
                            true,
                            &mut self.total_steps,
                            "",
                            false,
                        );
                        widgets::form_input(
                            &mut cols[1],
                            "blueprint.sla",
                            "Cam kết SLA toàn quy trình (Giờ)",
                            true,
                            &mut self.sla_target_hours,
                            "",
                            false,
                        );
                    });
                } else {
                    widgets::form_input(
                        ui,
                        "blueprint.steps",
                        "Số cấp phê duyệt",
                        true,
                        &mut self.total_steps,
                        "",
                        false,
                    );
                    widgets::form_input(
                        ui,
                        "blueprint.sla",
                        "Cam kết SLA toàn quy trình (Giờ)",
                        true,
                        &mut self.sla_target_hours,
                        "",
                        false,
                    );
                }
                widgets::form_input(
                    ui,
                    "blueprint.budget",
                    "Hạn mức kinh phí tối đa (VNĐ, 0 = không giới hạn)",
                    true,
                    &mut self.budget_limit,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "blueprint.version",
                    "Phiên bản quy trình",
                    true,
                    &mut self.version,
                    "",
                    false,
                );
                ui.small(format!("Người phụ trách thiết kế: {}", session.user.name));
                ui.small("Mẫu cấu hình chưa có thực thi, thông báo hoặc ký PKI.");
                if !self.error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.error);
                }
                let parsed = self.create_input();
                if let Err(error) = &parsed {
                    ui.colored_label(Color32::DARK_RED, error);
                }
                ui.add_space(18.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(
                            parsed.is_ok(),
                            egui::Button::new("Lưu mẫu").fill(crate::theme::PRIMARY),
                        )
                        .clicked()
                    {
                        if let Ok(input) = parsed {
                            self.pending_mutation = Some(PendingMutation::Create(
                                api.create_workflow_blueprint_task(session, &input),
                            ));
                            self.error.clear();
                        }
                    }
                    if ui.button("Hủy").clicked() {
                        self.create_open = false;
                    }
                });
            },
        );
        if close {
            self.create_open = false;
        }
    }

    fn create_input(&self) -> Result<WorkflowBlueprintInput, String> {
        if [
            &self.workflow_code,
            &self.workflow_name,
            &self.description,
            &self.scope,
            &self.version,
        ]
        .iter()
        .any(|value| value.trim().is_empty())
            || !CATEGORIES.contains(&self.category.as_str())
        {
            return Err("Nhập đầy đủ thông tin mẫu quy trình.".into());
        }
        let total_steps = self
            .total_steps
            .trim()
            .parse::<u32>()
            .map_err(|_| "Số cấp duyệt phải là số nguyên dương.")?;
        let sla_target_hours = self
            .sla_target_hours
            .trim()
            .parse::<u32>()
            .map_err(|_| "SLA phải là số giờ nguyên dương.")?;
        let applicable_budget_limit = self
            .budget_limit
            .trim()
            .parse::<u64>()
            .map_err(|_| "Hạn mức phải là số nguyên không âm.")?;
        if total_steps == 0 || sla_target_hours == 0 {
            return Err("Số cấp duyệt và SLA phải lớn hơn 0.".into());
        }
        Ok(WorkflowBlueprintInput {
            workflow_code: self.workflow_code.trim().into(),
            workflow_name: self.workflow_name.trim().into(),
            category: self.category.clone(),
            description: self.description.trim().into(),
            scope: self.scope.trim().into(),
            total_steps,
            sla_target_hours,
            applicable_budget_limit,
            version: self.version.trim().into(),
        })
    }
}

fn blueprint_matches(item: &WorkflowBlueprint, search: &str, category: &str, status: &str) -> bool {
    let query = search.trim().to_lowercase();
    let matches_search = query.is_empty()
        || [
            item.workflow_code.as_str(),
            item.workflow_name.as_str(),
            item.description.as_str(),
            item.category.as_str(),
            item.created_by.as_str(),
        ]
        .iter()
        .any(|text| text.to_lowercase().contains(&query));
    matches_search
        && (category == "Tất cả phân nhóm" || item.category == category)
        && (status == "Tất cả trạng thái" || item.status == status)
}

#[cfg(test)]
mod tests {
    use super::{WorkflowBlueprintsView, blueprint_matches};
    use crate::api::{ApprovalStepDefinition, WorkflowBlueprint, WorkflowFieldDefinition};

    fn sample() -> WorkflowBlueprint {
        WorkflowBlueprint {
            key: "WF-BP-1".to_owned(),
            workflow_code: "WF-TEST".to_owned(),
            workflow_name: "Đề xuất mua sắm".to_owned(),
            category: "Mua sắm & Tài sản".to_owned(),
            description: "Thiết bị văn phòng".to_owned(),
            scope: "Toàn công ty".to_owned(),
            total_steps: 2,
            sla_target_hours: 8,
            applicable_budget_limit: 0,
            approval_flow: vec![ApprovalStepDefinition {
                level: 1,
                role_name: "Trưởng bộ phận".to_owned(),
                default_approver: "Cán bộ phụ trách".to_owned(),
                sla_hours: 4,
                can_reject: true,
                require_token_pki: false,
            }],
            form_fields: vec![WorkflowFieldDefinition {
                field_name: "title".to_owned(),
                label: "Tiêu đề".to_owned(),
                field_type: "Văn bản".to_owned(),
                required: true,
            }],
            active_instances_count: 0,
            total_completed_count: 0,
            pass_rate: 0.0,
            status: "Đang áp dụng".to_owned(),
            version: "v1.0".to_owned(),
            created_by: "Admin".to_owned(),
        }
    }

    #[test]
    fn blueprint_view_starts_empty_instead_of_showing_demo_requests() {
        assert!(WorkflowBlueprintsView::default().blueprints.is_empty());
    }

    #[test]
    fn blueprint_filters_match_search_category_and_status() {
        let item = sample();
        assert!(blueprint_matches(
            &item,
            "mua sắm",
            "Tất cả phân nhóm",
            "Tất cả trạng thái"
        ));
        assert!(!blueprint_matches(
            &item,
            "",
            "Tài chính & Thanh toán",
            "Tất cả trạng thái"
        ));
        assert!(!blueprint_matches(
            &item,
            "",
            "Tất cả phân nhóm",
            "Tạm ngưng"
        ));
    }
    #[test]
    fn create_requires_real_fields_and_positive_steps_and_sla() {
        let mut view = WorkflowBlueprintsView::default();
        assert!(view.create_input().is_err());
        view.workflow_name = "Luồng mua hàng".into();
        view.description = "Phạm vi áp dụng".into();
        assert!(view.create_input().is_ok());
        view.total_steps = "0".into();
        assert!(view.create_input().is_err());
        view.total_steps = "3".into();
        view.sla_target_hours = "0".into();
        assert!(view.create_input().is_err());
        view.sla_target_hours = "4".into();
        view.budget_limit = "-1".into();
        assert!(view.create_input().is_err());
    }
}
