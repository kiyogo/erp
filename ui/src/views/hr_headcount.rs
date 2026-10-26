use std::time::Duration;

use egui::{Color32, Context, RichText, Ui};

use crate::{
    api::{
        ApiClient, ApiTask, CreateHrHeadcountQuotaInput, HrHeadcountQuota,
        HrHeadcountQuotaResponse, HrHeadcountQuotasResponse,
    },
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};

const PAGE_SIZE: usize = 8;
const STATUSES: [&str; 4] = ["Tất cả", "Thiếu nhân sự", "Đủ định biên", "Vượt định biên"];

#[derive(Default)]
pub struct HrHeadcountView {
    rows: Vec<HrHeadcountQuota>,
    list_task: Option<ApiTask<HrHeadcountQuotasResponse>>,
    create_task: Option<ApiTask<HrHeadcountQuotaResponse>>,
    loaded_for: Option<String>,
    loading: bool,
    needs_reload: bool,
    form_open: bool,
    form: QuotaForm,
    search: String,
    status_filter: String,
    selected_key: Option<String>,
    page: usize,
    page_size: usize,
    error: String,
    form_error: String,
    notice: String,
}

#[derive(Clone, Default)]
struct QuotaForm {
    department: String,
    position: String,
    position_code: String,
    quota: String,
    salary_budget: String,
    level_distribution: String,
}

impl HrHeadcountView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn reset_for_account(&mut self, session: &Session) {
        *self = Self {
            loaded_for: Some(session.user.id.clone()),
            needs_reload: true,
            status_filter: "Tất cả".to_owned(),
            ..Self::default()
        };
    }

    fn poll(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.reset_for_account(session);
        }
        if self.needs_reload && self.list_task.is_none() && self.create_task.is_none() {
            self.loading = true;
            self.error.clear();
            self.list_task = Some(api.list_hr_headcount_quotas_task(session));
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
                    self.notice = format!("Đã lưu định biên {}.", response.quota.position_code);
                    self.form_open = false;
                    self.form = QuotaForm::default();
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

    pub fn render(&mut self, ui: &mut Ui, ctx: &Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên Nhân sự mới được quản lý định biên.");
            return;
        }
        self.poll(ui, session, api);
        if self.page_size == 0 {
            self.page_size = PAGE_SIZE;
        }
        egui::Frame::none()
            .inner_margin(egui::Margin::symmetric(10.0, 16.0))
            .show(ui, |ui| {
                let known = !self.rows.is_empty() || (!self.loading && self.error.is_empty());
                let total_quota = self.rows.iter().map(|row| row.quota).sum::<i64>();
                let total_actual = self.rows.iter().map(|row| row.actual).sum::<i64>();
                let total_vacancies = self.rows.iter().map(|row| row.vacancies).sum::<i64>();
                let total_budget = self.rows.iter().map(|row| row.salary_budget).sum::<i64>();
                widgets::metrics(
                    ui,
                    "hr.headcount.metrics",
                    &[
                        Metric {
                            label: "Tổng chỉ tiêu định biên kế hoạch",
                            value: if known {
                                format!("{total_quota} Vị trí chỉ tiêu")
                            } else {
                                "—".into()
                            },
                            detail: "Chưa có luồng phê duyệt định biên",
                            color: crate::theme::PRIMARY,
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Nhân sự khớp từng định biên",
                            value: if known {
                                format!("{total_actual} CBNV")
                            } else {
                                "—".into()
                            },
                            detail: "Đối chiếu phòng ban, chức danh trong HR",
                            color: Color32::from_rgb(37, 99, 235),
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Vị trí trống cần tuyển bổ sung",
                            value: if known {
                                format!("+{total_vacancies} Nhân sự")
                            } else {
                                "—".into()
                            },
                            detail: "Còn thiếu theo các dòng định biên",
                            color: Color32::from_rgb(220, 38, 38),
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Tổng quỹ lương định biên / tháng",
                            value: if known {
                                format!("{:.2} Tỷ VNĐ", total_budget as f64 / 1_000_000_000.0)
                            } else {
                                "—".into()
                            },
                            detail: "Ngân sách kế hoạch do người lập khai báo",
                            color: Color32::from_rgb(22, 163, 74),
                            value_size: 24.0,
                        },
                    ],
                );
                ui.add_space(16.0);
                ui.horizontal_wrapped(|ui| {
                    ui.spacing_mut().item_spacing = egui::vec2(6.0, 10.0);
                    for status in STATUSES {
                        let active = self.status_filter == status;
                        if ui
                            .add(
                                egui::Button::new(
                                    RichText::new(if status == "Tất cả" {
                                        "Tất cả định biên"
                                    } else {
                                        status
                                    })
                                    .size(13.0)
                                    .color(if active {
                                        crate::theme::PRIMARY_ACTIVE
                                    } else {
                                        Color32::from_rgb(71, 85, 105)
                                    }),
                                )
                                .fill(if active {
                                    Color32::from_rgb(224, 242, 241)
                                } else {
                                    Color32::WHITE
                                })
                                .stroke(egui::Stroke::new(
                                    1.0,
                                    if active {
                                        crate::theme::PRIMARY
                                    } else {
                                        Color32::from_rgb(203, 213, 225)
                                    },
                                ))
                                .min_size(egui::vec2(0.0, 28.0)),
                            )
                            .clicked()
                        {
                            self.status_filter = status.to_owned();
                            self.page = 0;
                        }
                    }
                    let (search, _) = ui.allocate_exact_size(
                        egui::vec2(280.0_f32.min(ui.available_width().max(120.0)), 32.0),
                        egui::Sense::hover(),
                    );
                    if widgets::search_input(
                        ui,
                        search,
                        &mut self.search,
                        "Tìm theo phòng ban, chức danh, mã...",
                    )
                    .changed()
                    {
                        self.page = 0;
                    }
                    ui.add_enabled(false, egui::Button::new("Xuất Báo Cáo"))
                        .on_disabled_hover_text("Chưa có API xuất kế hoạch định biên.");
                    if ui
                        .add_enabled(!self.loading, egui::Button::new("Làm mới"))
                        .clicked()
                    {
                        self.needs_reload = true;
                    }
                    if ui
                        .add_enabled(
                            self.create_task.is_none(),
                            egui::Button::new(
                                RichText::new("+ Lập định biên mới").color(Color32::WHITE),
                            )
                            .fill(crate::theme::PRIMARY),
                        )
                        .clicked()
                    {
                        self.form = QuotaForm::default();
                        self.form_error.clear();
                        self.selected_key = None;
                        self.form_open = true;
                    }
                });
                ui.add_space(12.0);
                if !self.notice.is_empty() {
                    ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
                }
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                }
                if self.loading {
                    ui.horizontal(|ui| {
                        ui.spinner();
                        ui.label("Đang tải định biên từ máy chủ...");
                    });
                }
                let needle = self.search.trim().to_lowercase();
                let visible = self
                    .rows
                    .iter()
                    .filter(|row| {
                        (needle.is_empty()
                            || [&row.department, &row.position, &row.position_code]
                                .iter()
                                .any(|value| value.to_lowercase().contains(&needle)))
                            && (self.status_filter.is_empty()
                                || self.status_filter == "Tất cả"
                                || row.status == self.status_filter)
                    })
                    .collect::<Vec<_>>();
                self.page = self
                    .page
                    .min(visible.len().div_ceil(self.page_size).saturating_sub(1));
                let rows = visible
                    .iter()
                    .skip(self.page * self.page_size)
                    .take(self.page_size)
                    .collect::<Vec<_>>();
                let columns = [
                    TableColumn {
                        title: "Khối phòng ban & Vị trí chức danh",
                        width: (ui.available_width() - 790.0).max(300.0),
                    },
                    TableColumn {
                        title: "Chỉ tiêu / Thực tế",
                        width: 170.0,
                    },
                    TableColumn {
                        title: "Tỷ lệ lấp đầy định biên",
                        width: 180.0,
                    },
                    TableColumn {
                        title: "Quỹ lương định biên",
                        width: 170.0,
                    },
                    TableColumn {
                        title: "Trạng thái",
                        width: 140.0,
                    },
                    TableColumn {
                        title: "Thao tác",
                        width: 130.0,
                    },
                ];
                widgets::table(
                    ui,
                    "hr.headcount.table",
                    &columns,
                    rows.len(),
                    |ui, index, col| {
                        let row = rows[index];
                        match col {
                            0 => {
                                cell_text(ui, &row.position, true, Color32::from_rgb(15, 23, 42));
                                cell_text(
                                    ui,
                                    format!("Mã: {} · {}", row.position_code, row.department),
                                    false,
                                    crate::theme::PRIMARY,
                                );
                            }
                            1 => {
                                cell_text(
                                    ui,
                                    format!("{} / {} người", row.actual, row.quota),
                                    true,
                                    Color32::from_rgb(15, 23, 42),
                                );
                                cell_text(
                                    ui,
                                    if row.vacancies > 0 {
                                        format!("Thiếu +{} nhân sự", row.vacancies)
                                    } else {
                                        present(&row.status).to_owned()
                                    },
                                    false,
                                    if row.vacancies > 0 {
                                        Color32::from_rgb(220, 38, 38)
                                    } else {
                                        Color32::from_rgb(22, 163, 74)
                                    },
                                );
                            }
                            2 => {
                                if let Some(percent) = fill_rate(row.actual, row.quota) {
                                    cell_text(
                                        ui,
                                        format!("Lấp đầy: {percent:.0}%"),
                                        false,
                                        crate::theme::PRIMARY,
                                    );
                                    ui.add(
                                        egui::ProgressBar::new(
                                            (percent / 100.0).clamp(0.0, 1.0) as f32
                                        )
                                        .desired_height(6.0)
                                        .fill(
                                            if percent >= 100.0 {
                                                Color32::from_rgb(22, 163, 74)
                                            } else {
                                                crate::theme::PRIMARY
                                            },
                                        ),
                                    );
                                } else {
                                    cell_text(
                                        ui,
                                        "Chưa xác định",
                                        false,
                                        Color32::from_rgb(100, 116, 139),
                                    );
                                }
                            }
                            3 => cell_text(
                                ui,
                                format_money(row.salary_budget),
                                true,
                                Color32::from_rgb(22, 163, 74),
                            ),
                            4 => widgets::tag(
                                ui,
                                present(&row.status),
                                match row.status.as_str() {
                                    "Đủ định biên" => TagTone::Success,
                                    "Thiếu nhân sự" => TagTone::Error,
                                    "Vượt định biên" => TagTone::Warning,
                                    _ => TagTone::Neutral,
                                },
                            ),
                            _ => {
                                if ui.button("Cơ cấu").clicked() {
                                    self.selected_key = Some(row.key.clone());
                                }
                            }
                        }
                    },
                );
                ui.add_space(8.0);
                widgets::pagination(
                    ui,
                    "hr.headcount.pagination",
                    &mut self.page,
                    visible.len(),
                    &mut self.page_size,
                );
            });
        if let Some(row) = self
            .rows
            .iter()
            .find(|row| self.selected_key.as_deref() == Some(row.key.as_str()))
        {
            let (_, close) = widgets::drawer(
                ctx,
                "hr.headcount.detail",
                "Chi Tiết Cơ Cấu Định Biên & Quỹ Lương Vị Trí",
                580.0,
                |ui| {
                    detail_card(ui, true, |ui| {
                        ui.colored_label(
                            crate::theme::PRIMARY,
                            RichText::new(&row.position_code).strong(),
                        );
                        ui.label(RichText::new(&row.position).size(16.0).strong());
                        ui.label(format!(
                            "Khối: {} · {}",
                            row.department,
                            present(&row.status)
                        ));
                    });
                    ui.add_space(16.0);
                    detail_card(ui, false, |ui| {
                        ui.strong("Chỉ Số Định Biên & Nhu Cầu Tuyển Dụng:");
                        ui.label(format!(
                            "Chỉ tiêu định biên kế hoạch: {} Nhân sự",
                            row.quota
                        ));
                        ui.label(format!("Thực tế khớp hồ sơ HR: {} Nhân sự", row.actual));
                        ui.label(format!("Số lượng còn thiếu: {} Vị trí", row.vacancies));
                        ui.label(format!(
                            "Tỷ lệ lấp đầy: {}",
                            fill_rate(row.actual, row.quota)
                                .map(|value| format!("{value:.0}%"))
                                .unwrap_or_else(|| "Chưa xác định".into())
                        ));
                        ui.colored_label(
                            Color32::from_rgb(22, 163, 74),
                            format!(
                                "Tổng quỹ lương kế hoạch: {}/tháng",
                                format_money(row.salary_budget)
                            ),
                        );
                        ui.label("Ngân sách do người lập khai báo; chưa có luồng phê duyệt. Số thực tế do máy chủ đối chiếu nhân sự đang hoạt động với đúng phòng ban và chức danh.");
                    });
                    ui.add_space(16.0);
                    detail_card(ui, false, |ui| {
                        ui.strong("Cơ Cấu Phân Bổ Cấp Bậc Chuyên Môn:");
                        ui.label(present(&row.level_distribution));
                        ui.label(format!(
                            "Người lập: {} · {}",
                            present(&row.created_by),
                            present(&row.created_at)
                        ));
                    });
                    ui.add_space(16.0);
                    if row.vacancies > 0 {
                        ui.add_enabled(
                            false,
                            egui::Button::new("Mở Đăng Tin Tuyển Dụng Vị Trí Này"),
                        )
                        .on_disabled_hover_text(
                            "Chưa có luồng liên kết định biên với yêu cầu tuyển dụng.",
                        );
                        ui.label("Chưa có luồng liên kết định biên với yêu cầu tuyển dụng.");
                    }
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
            "hr.headcount.form",
            "Thiết Lập Chỉ Tiêu Định Biên Vị Trí Mới",
            640.0,
            busy,
            |ui| {
                ui.add_space(14.0);
                let columns = widgets::grid_columns(ui.available_width(), 220.0, 12.0, 2);
                ui.columns(columns, |cols| {
                    widgets::form_input(
                        &mut cols[0],
                        "headcount.department",
                        "Phòng ban trực thuộc",
                        true,
                        &mut self.form.department,
                        "",
                        false,
                    );
                    widgets::form_input(
                        &mut cols[1 % columns],
                        "headcount.code",
                        "Mã vị trí định biên",
                        true,
                        &mut self.form.position_code,
                        "",
                        false,
                    );
                });
                widgets::form_input(
                    ui,
                    "headcount.position",
                    "Tên vị trí / Chức danh công việc",
                    true,
                    &mut self.form.position,
                    "",
                    false,
                );
                ui.columns(columns, |cols| {
                    widgets::form_input(
                        &mut cols[0],
                        "headcount.quota",
                        "Chỉ tiêu định biên (1–5.000)",
                        true,
                        &mut self.form.quota,
                        "",
                        false,
                    );
                    widgets::form_input(
                        &mut cols[1 % columns],
                        "headcount.budget",
                        "Ngân sách quỹ lương / tháng (₫)",
                        true,
                        &mut self.form.salary_budget,
                        "",
                        false,
                    );
                });
                widgets::form_textarea(
                    ui,
                    "headcount.distribution",
                    "Cơ cấu phân bổ cấp bậc",
                    false,
                    &mut self.form.level_distribution,
                    "",
                    2,
                );
                ui.label("Hiện diện thực tế và trạng thái được máy chủ đối chiếu từ hồ sơ HR. Ngân sách là số kế hoạch, chưa thể hiện phê duyệt.");
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                }
                if busy {
                    ui.spinner();
                }
                ui.add_space(18.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .button(RichText::new("Lưu định biên vị trí").color(crate::theme::PRIMARY))
                        .clicked()
                    {
                        match self.form.to_input() {
                            Ok(input) => {
                                self.create_task =
                                    Some(api.create_hr_headcount_quota_task(session, &input));
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

impl QuotaForm {
    fn to_input(&self) -> Result<CreateHrHeadcountQuotaInput, String> {
        for (label, value) in [
            ("Phòng ban", self.department.trim()),
            ("Chức danh", self.position.trim()),
            ("Mã vị trí", self.position_code.trim()),
        ] {
            if value.is_empty() {
                return Err(format!("{label} là bắt buộc."));
            }
        }
        let quota = self
            .quota
            .trim()
            .parse::<i64>()
            .ok()
            .filter(|n| (1..=5_000).contains(n))
            .ok_or_else(|| "Quota phải là số nguyên từ 1 đến 5.000.".to_owned())?;
        let salary_budget = self
            .salary_budget
            .trim()
            .parse::<i64>()
            .ok()
            .filter(|n| (0..=1_000_000_000_000_000).contains(n))
            .ok_or_else(|| "Ngân sách kế hoạch phải là số nguyên không âm hợp lệ.".to_owned())?;
        Ok(CreateHrHeadcountQuotaInput {
            department: self.department.trim().to_owned(),
            position: self.position.trim().to_owned(),
            position_code: self.position_code.trim().to_owned(),
            quota,
            salary_budget,
            level_distribution: self.level_distribution.trim().to_owned(),
        })
    }
}

fn fill_rate(actual: i64, quota: i64) -> Option<f64> {
    (quota > 0 && actual >= 0).then(|| actual as f64 / quota as f64 * 100.0)
}

fn cell_text(ui: &mut Ui, text: impl Into<String>, strong: bool, color: Color32) {
    let text = text.into();
    let rich = RichText::new(&text)
        .size(if strong { 13.5 } else { 11.5 })
        .color(color);
    ui.add(egui::Label::new(if strong { rich.strong() } else { rich }).truncate())
        .on_hover_text(text);
}

fn detail_card(ui: &mut Ui, summary: bool, contents: impl FnOnce(&mut Ui)) {
    egui::Frame::none()
        .fill(if summary {
            Color32::from_rgb(248, 250, 252)
        } else {
            Color32::WHITE
        })
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
        .rounding(8.0)
        .inner_margin(if summary { 16.0 } else { 14.0 })
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.spacing_mut().item_spacing = egui::vec2(8.0, 6.0);
            contents(ui);
        });
}

fn format_money(value: i64) -> String {
    let digits = value.to_string();
    let mut grouped = String::new();
    for (index, character) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(character);
    }
    format!("{grouped} ₫")
}

fn present(value: &str) -> &str {
    if value.trim().is_empty() {
        "Chưa khai báo"
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
                let mut view = HrHeadcountView {
                    loaded_for: Some(session.user.id.clone()),
                    page: 99,
                    ..Default::default()
                };
                if (1..=3).contains(&state) {
                    view.rows.push(HrHeadcountQuota {
                        key: "layout-row".into(),
                        position: long.clone(),
                        position_code: "POS-1".into(),
                        department: long.clone(),
                        actual: 12,
                        quota: 10,
                        status: "Vượt định biên".into(),
                        ..Default::default()
                    });
                }
                if state == 2 {
                    view.selected_key = Some("layout-row".into());
                }
                if state == 3 {
                    view.form_open = true;
                    view.form = form();
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
                                view.render(ui,ctx,&session,&ApiClient);
                                assert!(ui.min_rect().right() <= right + 1.0, "page overflow at width {width}, state {state}: {:?}, limit {right}",ui.min_rect());
                            });
                        });
                    });
                }
                assert_eq!(view.page, 0);
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
    fn fill_rate_distinguishes_over_quota_from_missing_or_invalid_quota() {
        assert_eq!(fill_rate(0, 10), Some(0.0));
        assert_eq!(fill_rate(12, 10), Some(120.0));
        assert_eq!(fill_rate(1, 0), None);
        assert_eq!(fill_rate(-1, 10), None);
    }

    fn form() -> QuotaForm {
        QuotaForm {
            department: "Kỹ thuật".into(),
            position: "Kỹ sư Rust".into(),
            position_code: "POS-RUST-1".into(),
            quota: "3".into(),
            salary_budget: "120000000".into(),
            level_distribution: "1 Lead".into(),
        }
    }

    #[test]
    fn quota_form_sends_only_planning_inputs() {
        let input = form().to_input().unwrap();
        let wire = serde_json::to_value(input).unwrap();
        assert_eq!(wire["salaryBudget"], 120000000);
        assert!(wire.get("actual").is_none());
        assert!(wire.get("status").is_none());
        assert!(wire.get("vacancies").is_none());
    }

    #[test]
    fn quota_form_rejects_missing_and_out_of_range_values() {
        let mut invalid = form();
        invalid.position_code.clear();
        assert!(invalid.to_input().is_err());
        let mut invalid = form();
        invalid.quota = "0".into();
        assert!(invalid.to_input().is_err());
        let mut invalid = form();
        invalid.salary_budget = "-1".into();
        assert!(invalid.to_input().is_err());
    }
}
