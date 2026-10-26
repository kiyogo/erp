use std::time::Duration;

use chrono::{NaiveDate, Utc};
use egui::{Color32, Context, RichText, Ui};

use crate::{
    api::{
        ApiClient, ApiTask, CreateHrEmployeeHistoryInput, HrEmployeeHistoryRecord,
        HrEmployeeHistoryRecordsResponse, HrEmployeeHistoryResponse,
    },
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};

const HISTORY_TYPES: [&str; 5] = [
    "Chức vụ",
    "Thuyên chuyển",
    "Nghỉ việc",
    "Khen thưởng",
    "Kỷ luật sự cố",
];
const PAGE_SIZE: usize = 10;

#[derive(Default)]
pub struct HrEmployeeHistoryView {
    rows: Vec<HrEmployeeHistoryRecord>,
    list_task: Option<ApiTask<HrEmployeeHistoryRecordsResponse>>,
    create_task: Option<ApiTask<HrEmployeeHistoryResponse>>,
    loaded_for: Option<String>,
    needs_reload: bool,
    loading: bool,
    form_open: bool,
    form: HistoryForm,
    search: String,
    selected_type: String,
    selected_key: Option<String>,
    page: usize,
    page_size: usize,
    active_route: String,
    error: String,
    form_error: String,
    notice: String,
}

#[derive(Clone)]
struct HistoryForm {
    employee_code: String,
    history_type: String,
    event_date: String,
    old_value: String,
    new_value: String,
    decision_number: String,
    declared_signer: String,
    note: String,
}

impl Default for HistoryForm {
    fn default() -> Self {
        Self {
            employee_code: String::new(),
            history_type: HISTORY_TYPES[0].to_owned(),
            event_date: Utc::now().date_naive().format("%Y-%m-%d").to_string(),
            old_value: String::new(),
            new_value: String::new(),
            decision_number: String::new(),
            declared_signer: String::new(),
            note: String::new(),
        }
    }
}

impl HrEmployeeHistoryView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn poll(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            *self = Self {
                loaded_for: Some(session.user.id.clone()),
                needs_reload: true,
                ..Self::default()
            };
        }
        if self.needs_reload && self.list_task.is_none() && self.create_task.is_none() {
            self.loading = true;
            self.error.clear();
            self.list_task = Some(api.list_hr_employee_history_task(session));
            self.needs_reload = false;
        }
        if let Some(result) = self.list_task.as_ref().and_then(ApiClient::poll) {
            self.list_task = None;
            self.loading = false;
            match result {
                Ok(response) => self.rows = response.data,
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.create_task.as_ref().and_then(ApiClient::poll) {
            self.create_task = None;
            match result {
                Ok(response) => {
                    self.notice = format!(
                        "Đã ghi nhận {} cho {}.",
                        response.record.code, response.record.employee_name
                    );
                    self.selected_key = Some(response.record.key);
                    self.form = HistoryForm::default();
                    self.form_open = false;
                    self.form_error.clear();
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }
        if self.list_task.is_some() || self.create_task.is_some() {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &Context,
        session: &Session,
        api: &ApiClient,
        route: &str,
    ) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên HR được xem lịch sử biến động nhân sự.");
            return;
        }
        self.poll(ui, session, api);
        if self.page_size == 0 {
            self.page_size = PAGE_SIZE;
        }
        if self.active_route != route {
            self.active_route = route.to_owned();
            self.page = 0;
            self.selected_key = None;
            if self.create_task.is_none() {
                self.form_open = false;
            }
        }
        let route_type = history_type_for_route(route);
        egui::Frame::none()
            .inner_margin(egui::Margin::symmetric(10.0, 16.0))
            .show(ui, |ui| {
                ui.with_layout(egui::Layout::top_down(egui::Align::Min), |ui| {
                    let known = !self.rows.is_empty() || (!self.loading && self.error.is_empty());
                    let positions = self
                        .rows
                        .iter()
                        .filter(|row| row.history_type == "Chức vụ")
                        .count();
                    widgets::metrics(
                        ui,
                        "hr.history.metrics",
                        &[
                            Metric {
                                label: "Tổng biến động vòng đời nhân sự",
                                value: if known {
                                    format!("{} Bản ghi", self.rows.len())
                                } else {
                                    "—".into()
                                },
                                detail: "Lịch sử thăng tiến, luân chuyển & khen thưởng",
                                color: crate::theme::PRIMARY,
                                value_size: 24.0,
                            },
                            Metric {
                                label: "Bổ nhiệm & Thăng tiến chức vụ",
                                value: if known {
                                    format!("{positions} Bản ghi")
                                } else {
                                    "—".into()
                                },
                                detail: "Nội dung đã ghi nhận, chưa xác minh quyết định",
                                color: Color32::from_rgb(37, 99, 235),
                                value_size: 24.0,
                            },
                            Metric {
                                label: "Hồ sơ xác thực danh tính (eKYC)",
                                value: "Chưa xác định".into(),
                                detail: "Chưa có API hồ sơ eKYC có phân quyền",
                                color: Color32::from_rgb(22, 163, 74),
                                value_size: 24.0,
                            },
                            Metric {
                                label: "Tài khoản ngân hàng nhận lương",
                                value: "Chưa xác định".into(),
                                detail: "Được quản lý ở màn tài khoản ngân hàng",
                                color: Color32::from_rgb(124, 58, 237),
                                value_size: 24.0,
                            },
                        ],
                    );
                    ui.add_space(16.0);
                    let toolbar_layout = if ui.ctx().screen_rect().width() <= 992.0 {
                        egui::Layout::top_down(egui::Align::Min)
                    } else {
                        egui::Layout::left_to_right(egui::Align::Center).with_main_wrap(true)
                    };
                    let toolbar = ui.allocate_ui_with_layout(
                        egui::vec2(ui.available_width(), 32.0),
                        toolbar_layout,
                        |ui| {
                            ui.spacing_mut().item_spacing = egui::vec2(8.0, 10.0);
                            let effective = route_type.unwrap_or(&self.selected_type);
                            let restricted =
                                matches!(effective, "Ngân hàng" | "Xác thực danh tính");
                            let hint = match effective {
                                "Ngân hàng" => {
                                    "Tìm theo tên ngân hàng, STK, chi nhánh, chủ TK..."
                                }
                                "Xác thực danh tính" => {
                                    "Tìm theo tên NV, mã NV, loại giấy tờ, số định danh..."
                                }
                                _ => "Tìm theo tên nhân viên, mã NV, số QĐ, nội dung...",
                            };
                            let (search, _) = ui.allocate_exact_size(
                                egui::vec2(340.0_f32.min(ui.available_width().max(120.0)), 32.0),
                                egui::Sense::hover(),
                            );
                            ui.add_enabled_ui(!restricted, |ui| {
                                if widgets::search_input(ui, search, &mut self.search, hint)
                                    .changed()
                                {
                                    self.page = 0;
                                }
                            });
                            if route_type.is_none() {
                                widgets::combo_box("hr.history.type")
                                    .width(230.0)
                                    .selected_text(if self.selected_type.is_empty() {
                                        "Tất cả biến động"
                                    } else {
                                        &self.selected_type
                                    })
                                    .show_ui(ui, |ui| {
                                        for kind in [
                                            "",
                                            "Chức vụ",
                                            "Thuyên chuyển",
                                            "Khen thưởng",
                                            "Nghỉ việc",
                                            "Kỷ luật sự cố",
                                            "Ngân hàng",
                                            "Xác thực danh tính",
                                        ] {
                                            if ui
                                                .selectable_value(
                                                    &mut self.selected_type,
                                                    kind.to_owned(),
                                                    if kind.is_empty() {
                                                        "Tất cả biến động"
                                                    } else {
                                                        kind
                                                    },
                                                )
                                                .changed()
                                            {
                                                self.page = 0;
                                                self.selected_key = None;
                                            }
                                        }
                                    });
                            }
                            if ui
                                .add_enabled(
                                    !restricted && !self.loading && self.create_task.is_none(),
                                    egui::Button::new("Làm mới"),
                                )
                                .on_disabled_hover_text(
                                    "Chưa có API cho màn này hoặc đang có yêu cầu gửi lên máy chủ.",
                                )
                                .clicked()
                            {
                                self.needs_reload = true;
                            }
                            ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                                .on_disabled_hover_text(
                                    "Chưa có API xuất dữ liệu lịch sử ra Excel.",
                                );
                            let kind = route_type.unwrap_or(&self.selected_type);
                            let label = match kind {
                                "Ngân hàng" => "+ Thêm tài khoản ngân hàng",
                                "Xác thực danh tính" => "Gửi yêu cầu eKYC mới",
                                _ => "+ Ghi nhận biến động mới",
                            };
                            if ui
                                .add_enabled(
                                    !matches!(kind, "Ngân hàng" | "Xác thực danh tính")
                                        && self.create_task.is_none(),
                                    egui::Button::new(RichText::new(label).color(Color32::WHITE))
                                        .fill(crate::theme::PRIMARY),
                                )
                                .on_disabled_hover_text(
                                    "Chưa có API cho thao tác này hoặc đang lưu bản ghi.",
                                )
                                .clicked()
                            {
                                self.form = HistoryForm::default();
                                if HISTORY_TYPES.contains(&kind) {
                                    self.form.history_type = kind.to_owned();
                                }
                                self.form_error.clear();
                                self.selected_key = None;
                                self.form_open = true;
                            }
                        },
                    );
                    crate::visual_test::record("hr.history.toolbar", toolbar.response.rect);
                    #[cfg(test)]
                    ui.ctx().data_mut(|data| {
                        data.insert_temp(
                            egui::Id::new("test.hr.history.toolbar"),
                            toolbar.response.rect,
                        )
                    });
                    ui.add_space(12.0);
                    if !self.notice.is_empty() {
                        ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
                    }
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    }
                    let effective = route_type.unwrap_or(&self.selected_type);
                    if matches!(effective, "Ngân hàng" | "Xác thực danh tính") {
                        render_unavailable(ui, effective);
                        return;
                    }
                    if self.loading {
                        ui.horizontal(|ui| {
                            ui.spinner();
                            ui.label("Đang tải lịch sử nhân sự từ máy chủ...");
                        });
                    }
                    let needle = self.search.trim().to_lowercase();
                    let filtered = self
                        .rows
                        .iter()
                        .filter(|row| {
                            (effective.is_empty() || row.history_type == effective)
                                && (needle.is_empty()
                                    || [
                                        &row.code,
                                        &row.employee_code,
                                        &row.employee_name,
                                        &row.history_type,
                                        &row.decision_number,
                                        &row.old_value,
                                        &row.new_value,
                                        &row.note,
                                    ]
                                    .iter()
                                    .any(|value| value.to_lowercase().contains(&needle)))
                        })
                        .collect::<Vec<_>>();
                    self.page = self
                        .page
                        .min(filtered.len().div_ceil(self.page_size).saturating_sub(1));
                    let rows = filtered
                        .iter()
                        .skip(self.page * self.page_size)
                        .take(self.page_size)
                        .collect::<Vec<_>>();
                    let columns = [
                        TableColumn {
                            title: "Mã hồ sơ",
                            width: 140.0,
                        },
                        TableColumn {
                            title: "Nhân viên",
                            width: 210.0,
                        },
                        TableColumn {
                            title: "Loại biến động",
                            width: 160.0,
                        },
                        TableColumn {
                            title: "Ngày hiệu lực",
                            width: 130.0,
                        },
                        TableColumn {
                            title: "Giá trị cũ",
                            width: 180.0,
                        },
                        TableColumn {
                            title: "Giá trị mới",
                            width: (ui.available_width() - 1220.0).max(200.0),
                        },
                        TableColumn {
                            title: "Số quyết định",
                            width: 150.0,
                        },
                        TableColumn {
                            title: "Người ký khai báo",
                            width: 150.0,
                        },
                        TableColumn {
                            title: "Thao tác",
                            width: 100.0,
                        },
                    ];
                    widgets::table_with_row_height(
                        ui,
                        "hr.history.table",
                        &columns,
                        rows.len(),
                        64.0,
                        |ui, index, col| {
                            let row = rows[index];
                            match col {
                                0 => cell_text(ui, &row.code, true, crate::theme::PRIMARY),
                                1 => {
                                    cell_text(
                                        ui,
                                        &row.employee_name,
                                        true,
                                        Color32::from_rgb(33, 33, 33),
                                    );
                                    cell_text(
                                        ui,
                                        format!("Mã NV: {}", row.employee_code),
                                        false,
                                        Color32::from_rgb(117, 117, 117),
                                    );
                                }
                                2 => widgets::tag(
                                    ui,
                                    present(&row.history_type),
                                    match row.history_type.as_str() {
                                        "Khen thưởng" => TagTone::Success,
                                        "Nghỉ việc" => TagTone::Error,
                                        "Kỷ luật sự cố" => TagTone::Warning,
                                        "Chức vụ" | "Thuyên chuyển" => TagTone::Processing,
                                        _ => TagTone::Neutral,
                                    },
                                ),
                                3 => cell_text(
                                    ui,
                                    &row.event_date,
                                    false,
                                    Color32::from_rgb(33, 33, 33),
                                ),
                                4 => cell_text(
                                    ui,
                                    present(&row.old_value),
                                    false,
                                    Color32::from_rgb(117, 117, 117),
                                ),
                                5 => cell_text(
                                    ui,
                                    present(&row.new_value),
                                    true,
                                    Color32::from_rgb(33, 33, 33),
                                ),
                                6 => cell_text(
                                    ui,
                                    present(&row.decision_number),
                                    false,
                                    Color32::from_rgb(97, 97, 97),
                                ),
                                7 => cell_text(
                                    ui,
                                    present(&row.declared_signer),
                                    false,
                                    Color32::from_rgb(33, 33, 33),
                                ),
                                _ => {
                                    if ui.button("Chi tiết").clicked() {
                                        self.selected_key = Some(row.key.clone());
                                    }
                                }
                            }
                        },
                    );
                    ui.add_space(8.0);
                    let start = if filtered.is_empty() {
                        0
                    } else {
                        self.page * self.page_size + 1
                    };
                    let end = ((self.page + 1) * self.page_size).min(filtered.len());
                    ui.label(
                        RichText::new(format!(
                            "Hiển thị {start}-{end} trên tổng số {} bản ghi",
                            filtered.len()
                        ))
                        .size(13.0)
                        .color(Color32::from_rgb(117, 117, 117)),
                    );
                    widgets::pagination(
                        ui,
                        "hr.history.pagination",
                        &mut self.page,
                        filtered.len(),
                        &mut self.page_size,
                    );
                });
            });
        if let Some(record) = self
            .rows
            .iter()
            .find(|row| self.selected_key.as_deref() == Some(row.key.as_str()))
        {
            let (_, close) = widgets::modal(
                ctx,
                "hr.history.detail",
                "Chi tiết biến động nhân sự",
                640.0,
                false,
                |ui| {
                    ui.add_space(12.0);
                    render_detail(ui, record);
                    ui.add_space(16.0);
                    widgets::action_row(ui, |ui| {
                        if ui.button("Đóng").clicked() {
                            self.selected_key = None;
                        }
                    });
                },
            );
            if close {
                self.selected_key = None;
            }
        }
        if self.form_open {
            self.render_form(ctx, session, api);
        }
    }

    fn render_form(&mut self, ctx: &Context, session: &Session, api: &ApiClient) {
        let busy = self.create_task.is_some();
        let (_, close) = widgets::modal(
            ctx,
            "hr.history.form",
            "Ghi nhận biến động nhân sự mới",
            560.0,
            busy,
            |ui| {
                ui.add_space(12.0);
                widgets::form_input(
                    ui,
                    "history.employee",
                    "Mã nhân viên",
                    true,
                    &mut self.form.employee_code,
                    "",
                    false,
                );
                let columns = widgets::grid_columns(ui.available_width(), 220.0, 12.0, 2);
                ui.columns(columns, |cols| {
                    widgets::form_select(
                        &mut cols[0],
                        "history.type",
                        "Loại biến động",
                        true,
                        &mut self.form.history_type,
                        &HISTORY_TYPES,
                    );
                    widgets::form_date(
                        &mut cols[1 % columns],
                        "history.date",
                        "Ngày hiệu lực",
                        true,
                        &mut self.form.event_date,
                    );
                });
                ui.columns(columns, |cols| {
                    widgets::form_input(
                        &mut cols[0],
                        "history.old",
                        "Giá trị cũ (nếu có)",
                        false,
                        &mut self.form.old_value,
                        "",
                        false,
                    );
                    widgets::form_input(
                        &mut cols[1 % columns],
                        "history.new",
                        "Giá trị mới",
                        true,
                        &mut self.form.new_value,
                        "",
                        false,
                    );
                });
                ui.columns(columns, |cols| {
                    widgets::form_input(
                        &mut cols[0],
                        "history.decision",
                        "Số Quyết định",
                        false,
                        &mut self.form.decision_number,
                        "",
                        false,
                    );
                    widgets::form_input(
                        &mut cols[1 % columns],
                        "history.signer",
                        "Người ký khai báo (chưa xác minh)",
                        false,
                        &mut self.form.declared_signer,
                        "",
                        false,
                    );
                });
                widgets::form_textarea(
                    ui,
                    "history.note",
                    "Ghi chú",
                    false,
                    &mut self.form.note,
                    "",
                    2,
                );
                ui.label("Tên nhân viên, người ghi nhận và thời điểm do máy chủ xác định. Bản ghi chỉ thêm, không tự thay đổi hồ sơ và không chứng minh quyết định đã được phê duyệt.");
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                }
                if busy {
                    ui.spinner();
                }
                ui.add_space(16.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .button(RichText::new("Xác nhận ghi nhận").color(crate::theme::PRIMARY))
                        .clicked()
                    {
                        match self.form.to_input() {
                            Ok(input) => {
                                self.create_task =
                                    Some(api.create_hr_employee_history_task(session, &input));
                                self.form_error.clear();
                            }
                            Err(error) => self.form_error = error,
                        }
                    }
                    if ui.button("Hủy").clicked() {
                        self.form_open = false;
                    }
                });
            },
        );
        if close {
            self.form_open = false;
        }
    }
}

impl HistoryForm {
    fn to_input(&self) -> Result<CreateHrEmployeeHistoryInput, String> {
        if self.employee_code.trim().is_empty() || self.new_value.trim().is_empty() {
            return Err("Cần nhập mã nhân viên và giá trị mới.".to_owned());
        }
        if !HISTORY_TYPES.contains(&self.history_type.as_str()) {
            return Err("Loại biến động không hợp lệ.".to_owned());
        }
        if NaiveDate::parse_from_str(self.event_date.trim(), "%Y-%m-%d").is_err() {
            return Err("Ngày hiệu lực cần theo định dạng YYYY-MM-DD hợp lệ.".to_owned());
        }
        Ok(CreateHrEmployeeHistoryInput {
            employee_code: self.employee_code.trim().to_owned(),
            history_type: self.history_type.clone(),
            event_date: self.event_date.trim().to_owned(),
            old_value: self.old_value.trim().to_owned(),
            new_value: self.new_value.trim().to_owned(),
            decision_number: self.decision_number.trim().to_owned(),
            declared_signer: self.declared_signer.trim().to_owned(),
            note: self.note.trim().to_owned(),
        })
    }
}

fn render_unavailable(ui: &mut Ui, kind: &str) {
    let identity = kind == "Xác thực danh tính";
    ui.colored_label(Color32::from_rgb(146,64,14),if identity {
        "Chưa xác định: chưa có API hồ sơ eKYC có phân quyền, ảnh CCCD hoặc sinh trắc học. Không suy ra xác thực từ lịch sử nhân sự."
    } else {
        "Mở mục Tài khoản ngân hàng trong điều hướng để dùng luồng API có phân quyền. Bộ lọc này chưa liên kết với màn tài khoản ngân hàng."
    });
    let columns = if identity {
        vec![
            TableColumn {
                title: "Mã & Họ tên Nhân sự",
                width: 220.0,
            },
            TableColumn {
                title: "Loại hình xác thực",
                width: 210.0,
            },
            TableColumn {
                title: "Thời gian xác thực",
                width: 170.0,
            },
            TableColumn {
                title: "Đơn vị / Phương thức xác minh",
                width: 230.0,
            },
            TableColumn {
                title: "Trạng thái",
                width: 140.0,
            },
            TableColumn {
                title: "Thao tác",
                width: 260.0,
            },
        ]
    } else {
        vec![
            TableColumn {
                title: "Nhân sự liên kết",
                width: 220.0,
            },
            TableColumn {
                title: "Thông tin Ngân hàng & STK",
                width: 240.0,
            },
            TableColumn {
                title: "Chi nhánh & Ghi chú",
                width: 200.0,
            },
            TableColumn {
                title: "Mặc định nhận lương",
                width: 140.0,
            },
            TableColumn {
                title: "Trạng thái",
                width: 130.0,
            },
            TableColumn {
                title: "Thao tác",
                width: 190.0,
            },
        ]
    };
    widgets::table(
        ui,
        if identity {
            "hr.history.identity.table"
        } else {
            "hr.history.bank.table"
        },
        &columns,
        0,
        |_, _, _| {},
    );
    if identity {
        ui.horizontal_wrapped(|ui| {
            for action in ["CCCD", "Video", "Thông tin"] {
                ui.add_enabled(false, egui::Button::new(action))
                    .on_disabled_hover_text("Chưa có API hồ sơ eKYC có phân quyền.");
            }
        });
    }
}

fn cell_text(ui: &mut Ui, text: impl Into<String>, strong: bool, color: Color32) {
    let text = text.into();
    let rich = RichText::new(&text)
        .size(if strong { 13.0 } else { 12.0 })
        .color(color);
    ui.add(egui::Label::new(if strong { rich.strong() } else { rich }).truncate())
        .on_hover_text(text);
}

fn history_type_for_route(route: &str) -> Option<&'static str> {
    match route.rsplit('/').next()? {
        "position" => Some("Chức vụ"),
        "transfer" => Some("Thuyên chuyển"),
        "resignation" => Some("Nghỉ việc"),
        "reward" => Some("Khen thưởng"),
        "discipline" => Some("Kỷ luật sự cố"),
        "bank" => Some("Ngân hàng"),
        "identity" => Some("Xác thực danh tính"),
        _ => None,
    }
}

fn render_detail(ui: &mut Ui, row: &HrEmployeeHistoryRecord) {
    ui.spacing_mut().item_spacing.y = 8.0;
    ui.label(
        RichText::new(format!("{} · {}", row.code, row.employee_name))
            .size(17.0)
            .strong(),
    );
    ui.label(format!(
        "{} · {} · ngày hiệu lực {}",
        row.employee_code, row.history_type, row.event_date
    ));
    ui.label(format!(
        "Thay đổi: {} → {}",
        present(&row.old_value),
        row.new_value
    ));
    ui.label(format!(
        "Số quyết định khai báo: {}",
        present(&row.decision_number)
    ));
    ui.label(format!(
        "Người ký khai báo (chưa xác minh): {}",
        present(&row.declared_signer)
    ));
    ui.label(format!("Ghi chú: {}", present(&row.note)));
    ui.label(format!("Được ghi nhận bởi {} ({}) lúc {}. Đây là dấu vết tài khoản thao tác, không xác nhận tính hợp lệ của quyết định.", row.recorded_by_name, row.recorded_by, row.recorded_at));
}

fn present(value: &str) -> &str {
    if value.trim().is_empty() {
        "—"
    } else {
        value
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_page_contains_long_rows_and_controls_at_desktop_and_mobile_widths() {
        let session: Session = serde_json::from_value(serde_json::json!({
            "token": "", "session_id": "layout-fixture",
            "user": { "id": "layout-fixture", "email": "layout@example.invalid", "name": "Layout", "role": "ADMIN" },
            "endpoint": "http://127.0.0.1:9", "mode": "local_admin"
        })).unwrap();
        let long = "Nội dung dài cần giữ đầy đủ trong phần chi tiết ".repeat(12);
        for width in [1440.0, 768.0, 390.0] {
            let ctx = Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            for state in 0..6 {
                let mut view = HrEmployeeHistoryView {
                    loaded_for: Some(session.user.id.clone()),
                    active_route: "/admin/hr/history".into(),
                    page: 99,
                    ..Default::default()
                };
                if (1..=3).contains(&state) {
                    view.rows.push(HrEmployeeHistoryRecord {
                        key: "layout-row".into(),
                        code: "LS-1".into(),
                        employee_name: long.clone(),
                        employee_code: "EMP-1".into(),
                        history_type: "Chức vụ".into(),
                        new_value: long.clone(),
                        old_value: long.clone(),
                        declared_signer: long.clone(),
                        note: long.clone(),
                        ..Default::default()
                    });
                }
                if state == 2 {
                    view.selected_key = Some("layout-row".into());
                }
                if state == 3 {
                    view.form_open = true;
                    view.form = HistoryForm {
                        employee_code: "EMP-1".into(),
                        new_value: long.clone(),
                        ..Default::default()
                    };
                }
                view.loading = state == 4;
                if state == 5 {
                    view.error = "Máy chủ chưa sẵn sàng".into();
                }
                for _ in 0..3 {
                    let _ = ctx.run(egui::RawInput {
                        screen_rect: Some(egui::Rect::from_min_size(egui::Pos2::ZERO,egui::vec2(width,900.0))),
                        ..Default::default()
                    }, |ctx| {
                        egui::CentralPanel::default().show(ctx, |ui| {
                            egui::ScrollArea::vertical().show(ui, |ui| {
                                let right = ui.max_rect().right();
                                view.render(ui,ctx,&session,&ApiClient, "/admin/hr/history");
                                assert!(ui.min_rect().right() <= right + 1.0, "page overflow at width {width}, state {state}: {:?}, limit {right}",ui.min_rect());
                            });
                        });
                    });
                }
                assert_eq!(view.page, 0);
                let toolbar = ctx
                    .data(|data| {
                        data.get_temp::<egui::Rect>(egui::Id::new("test.hr.history.toolbar"))
                    })
                    .unwrap();
                assert!(
                    toolbar.height() <= if width > 992.0 { 90.0 } else { 260.0 },
                    "toolbar must not consume the page height at {width}: {toolbar:?}"
                );
                assert!(
                    view.list_task.is_none(),
                    "layout tests must not call the API"
                );
                if state == 3 {
                    let (footer, clip) = ctx
                        .data(|data| {
                            data.get_temp::<(egui::Rect, egui::Rect)>(egui::Id::new(
                                "test.footer.bounds",
                            ))
                        })
                        .expect("form footer");
                    assert!(
                        footer.right() <= clip.right() + 1.0
                            && footer.bottom() <= clip.bottom() + 1.0,
                        "form footer clipped at {width}: {footer:?}, {clip:?}"
                    );
                }
            }
        }
    }

    #[test]
    fn sensitive_history_routes_never_fall_through_to_general_history() {
        assert_eq!(
            history_type_for_route("/admin/hr/history/identity"),
            Some("Xác thực danh tính")
        );
        assert_eq!(
            history_type_for_route("/admin/hr/history/bank"),
            Some("Ngân hàng")
        );
    }

    #[test]
    fn history_form_rejects_invalid_dates_and_sensitive_record_types() {
        let mut form = HistoryForm {
            employee_code: "EMP-1".into(),
            new_value: "Trưởng nhóm".into(),
            ..Default::default()
        };
        assert!(form.to_input().is_ok());
        form.event_date = "2026-02-30".into();
        assert!(form.to_input().is_err());
        form.event_date = "2026-10-24".into();
        form.history_type = "Xác thực danh tính".into();
        assert!(form.to_input().is_err());
    }

    #[test]
    fn history_routes_filter_only_their_category() {
        assert_eq!(
            history_type_for_route("/admin/hr/history/position"),
            Some("Chức vụ")
        );
        assert_eq!(
            history_type_for_route("/admin/hr/history/transfer"),
            Some("Thuyên chuyển")
        );
        assert_eq!(
            history_type_for_route("/admin/hr/history/resignation"),
            Some("Nghỉ việc")
        );
        assert_eq!(
            history_type_for_route("/admin/hr/history/reward"),
            Some("Khen thưởng")
        );
        assert_eq!(
            history_type_for_route("/admin/hr/history/discipline"),
            Some("Kỷ luật sự cố")
        );
        assert_eq!(history_type_for_route("/admin/hr/history"), None);
    }

    #[test]
    fn empty_optional_fields_render_as_placeholders_and_form_date_is_iso() {
        assert_eq!(present("  "), "—");
        assert_eq!(present("QĐ-1"), "QĐ-1");
        assert_eq!(HistoryForm::default().event_date.len(), 10);
        assert!(HistoryForm::default().event_date.contains('-'));
    }

    #[test]
    fn create_payload_uses_legacy_type_field_and_does_not_send_actor_identity() {
        let payload = serde_json::to_value(CreateHrEmployeeHistoryInput {
            employee_code: "EMP-1".to_owned(),
            history_type: "Chức vụ".to_owned(),
            event_date: "2026-10-08".to_owned(),
            old_value: String::new(),
            new_value: "Trưởng nhóm".to_owned(),
            decision_number: String::new(),
            declared_signer: "Ban Giám đốc".to_owned(),
            note: String::new(),
        })
        .unwrap();
        assert_eq!(payload["type"], "Chức vụ");
        assert_eq!(payload["employeeCode"], "EMP-1");
        assert!(payload.get("historyType").is_none());
        assert!(payload.get("recordedBy").is_none());
        assert!(payload.get("employeeName").is_none());
    }
}
