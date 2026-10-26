use std::time::Duration;

use egui::{Color32, Context, RichText, Ui};

use crate::{
    api::{
        ApiClient, ApiTask, CreateHrPerformanceReviewInput, HrPerformanceReview,
        HrPerformanceReviewResponse, HrPerformanceReviewsResponse,
    },
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};

const PAGE_SIZE: usize = 8;
const PENDING: &str = "Chờ phê duyệt điểm";
const APPROVED: &str = "Đã hoàn tất đánh giá";

#[derive(Default)]
pub struct HrPerformanceReviewsView {
    rows: Vec<HrPerformanceReview>,
    list_task: Option<ApiTask<HrPerformanceReviewsResponse>>,
    create_task: Option<ApiTask<HrPerformanceReviewResponse>>,
    approve_task: Option<ApiTask<HrPerformanceReviewResponse>>,
    loaded_for: Option<String>,
    loading: bool,
    needs_reload: bool,
    form_open: bool,
    form: ReviewForm,
    search: String,
    status_filter: String,
    selected_key: Option<String>,
    confirm_key: Option<String>,
    page: usize,
    page_size: usize,
    error: String,
    form_error: String,
    notice: String,
}

#[derive(Clone)]
struct ReviewForm {
    code: String,
    employee_code: String,
    period: String,
    self_score: String,
    manager_score: String,
    kpi_bonus: String,
    manager_comment: String,
}

impl Default for ReviewForm {
    fn default() -> Self {
        Self {
            code: String::new(),
            employee_code: String::new(),
            period: String::new(),
            self_score: String::new(),
            manager_score: String::new(),
            kpi_bonus: "0".to_owned(),
            manager_comment: String::new(),
        }
    }
}

impl HrPerformanceReviewsView {
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
        if self.needs_reload
            && self.list_task.is_none()
            && self.create_task.is_none()
            && self.approve_task.is_none()
        {
            self.loading = true;
            self.error.clear();
            self.list_task = Some(api.list_hr_performance_reviews_task(session));
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
                        "Đã lập phiếu {} ở trạng thái chờ duyệt.",
                        response.review.code
                    );
                    self.selected_key = Some(response.review.key);
                    self.form_open = false;
                    self.form = ReviewForm::default();
                    self.form_error.clear();
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }
        if let Some(result) = self.approve_task.as_ref().and_then(ApiClient::poll) {
            self.approve_task = None;
            match result {
                Ok(response) => {
                    self.notice = format!("Đã ghi nhận hoàn tất phiếu {}.", response.review.code);
                    self.selected_key = Some(response.review.key);
                    self.confirm_key = None;
                    self.needs_reload = true;
                }
                Err(error) => self.error = error,
            }
        }
        if self.list_task.is_some() || self.create_task.is_some() || self.approve_task.is_some() {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên Nhân sự được xem và quản lý phiếu đánh giá.");
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
                let verified = self
                    .rows
                    .iter()
                    .filter(|row| row.workflow_verified)
                    .collect::<Vec<_>>();
                let excellent = verified
                    .iter()
                    .filter(|row| row.grade.starts_with("A+"))
                    .count();
                let bonus = verified.iter().map(|row| row.kpi_bonus).sum::<i64>();
                let completed = verified.iter().filter(|row| review_completed(row)).count();
                let average = if verified.is_empty() {
                    "Chưa xác định".to_owned()
                } else {
                    format!(
                        "{:.1} / 100 Điểm",
                        verified
                            .iter()
                            .map(|row| row.manager_score as f64)
                            .sum::<f64>()
                            / verified.len() as f64
                    )
                };
                widgets::metrics(
                    ui,
                    "hr.performance.metrics",
                    &[
                        Metric {
                            label: "Nhân sự đạt loại A+ (Xuất sắc)",
                            value: if known {
                                format!("{excellent} Phiếu có nguồn")
                            } else {
                                "—".into()
                            },
                            detail: "Chỉ tính phiếu có sự kiện máy chủ",
                            color: Color32::from_rgb(217, 119, 6),
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Tổng quỹ thưởng hiệu suất KPI đề xuất",
                            value: if known {
                                format_money(bonus)
                            } else {
                                "—".into()
                            },
                            detail: "Chưa phải khoản chi trả lương/thưởng",
                            color: Color32::from_rgb(22, 163, 74),
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Điểm đánh giá trung bình các phiếu có nguồn",
                            value: average,
                            detail: "Điểm quản lý khai báo trên phiếu",
                            color: crate::theme::PRIMARY,
                            value_size: 24.0,
                        },
                        Metric {
                            label: "Tiến độ hoàn tất đánh giá KPI",
                            value: if verified.is_empty() {
                                "Chưa xác định".into()
                            } else {
                                format!(
                                    "{:.0}% Hoàn thành",
                                    completed as f64 / verified.len() as f64 * 100.0
                                )
                            },
                            detail: "Phiếu hoàn tất có dấu vết tài khoản",
                            color: Color32::from_rgb(37, 99, 235),
                            value_size: 24.0,
                        },
                    ],
                );
                ui.add_space(16.0);
                ui.horizontal_wrapped(|ui| {
                    ui.spacing_mut().item_spacing = egui::vec2(6.0, 10.0);
                    for (filter, label) in [
                        ("Tất cả", "Tất cả đánh giá"),
                        ("A+", "A+ Xuất sắc"),
                        ("A (Tốt)", "A Tốt"),
                        ("Chờ duyệt", "Chờ duyệt"),
                        ("Đã hoàn tất", "Đã hoàn tất"),
                        ("Legacy", "Legacy chưa xác minh"),
                    ] {
                        let active = self.status_filter == filter;
                        if ui
                            .add(
                                egui::Button::new(RichText::new(label).size(13.0).color(
                                    if active {
                                        crate::theme::PRIMARY_ACTIVE
                                    } else {
                                        Color32::from_rgb(71, 85, 105)
                                    },
                                ))
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
                            self.status_filter = filter.to_owned();
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
                        "Tìm theo mã phiếu, tên nhân viên, phòng ban...",
                    )
                    .changed()
                    {
                        self.page = 0;
                    }
                    ui.add_enabled(false, egui::Button::new("Xuất Báo Cáo"))
                        .on_disabled_hover_text("Chưa có API xuất bảng tổng hợp KPI.");
                    if ui
                        .add_enabled(!self.loading, egui::Button::new("Làm mới"))
                        .clicked()
                    {
                        self.needs_reload = true;
                    }
                    if ui
                        .add_enabled(
                            self.create_task.is_none() && self.approve_task.is_none(),
                            egui::Button::new(
                                RichText::new("+ Lập phiếu đánh giá").color(Color32::WHITE),
                            )
                            .fill(crate::theme::PRIMARY),
                        )
                        .clicked()
                    {
                        self.form = ReviewForm::default();
                        self.form_error.clear();
                        self.selected_key = None;
                        self.confirm_key = None;
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
                        ui.label("Đang tải phiếu đánh giá từ máy chủ...");
                    });
                }
                let needle = self.search.trim().to_lowercase();
                let visible = self
                    .rows
                    .iter()
                    .filter(|review| {
                        (needle.is_empty()
                            || [
                                &review.code,
                                &review.employee_name,
                                &review.emp_code,
                                &review.department,
                                &review.position,
                                &review.period,
                                &review.evaluator,
                            ]
                            .iter()
                            .any(|value| value.to_lowercase().contains(&needle)))
                            && review_matches(review, &self.status_filter)
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
                        title: "Mã phiếu & Nhân viên",
                        width: (ui.available_width() - 940.0).max(300.0),
                    },
                    TableColumn {
                        title: "Kỳ đánh giá",
                        width: 140.0,
                    },
                    TableColumn {
                        title: "Điểm tự chấm / Quản lý",
                        width: 200.0,
                    },
                    TableColumn {
                        title: "Xếp loại KPI",
                        width: 150.0,
                    },
                    TableColumn {
                        title: "Thưởng hiệu suất",
                        width: 160.0,
                    },
                    TableColumn {
                        title: "Trạng thái",
                        width: 150.0,
                    },
                    TableColumn {
                        title: "Thao tác",
                        width: 140.0,
                    },
                ];
                widgets::table(
                    ui,
                    "hr.performance.table",
                    &columns,
                    rows.len(),
                    |ui, index, col| {
                        let row = rows[index];
                        match col {
                            0 => {
                                cell_text(
                                    ui,
                                    &row.employee_name,
                                    true,
                                    Color32::from_rgb(15, 23, 42),
                                );
                                cell_text(
                                    ui,
                                    format!(
                                        "Mã: {} · {} ({})",
                                        row.code, row.position, row.department
                                    ),
                                    false,
                                    crate::theme::PRIMARY,
                                );
                            }
                            1 => {
                                ui.add(
                                    egui::Label::new(
                                        RichText::new(present(&row.period))
                                            .color(Color32::from_rgb(37, 99, 235)),
                                    )
                                    .truncate(),
                                )
                                .on_hover_text(&row.period);
                            }
                            2 => {
                                cell_text(
                                    ui,
                                    format!("Tự: {}đ · QL: {}đ", row.self_score, row.manager_score),
                                    false,
                                    crate::theme::PRIMARY,
                                );
                                if row.workflow_verified {
                                    ui.add(
                                        egui::ProgressBar::new(
                                            (row.manager_score as f32 / 100.0).clamp(0.0, 1.0),
                                        )
                                        .desired_height(6.0)
                                        .fill(crate::theme::PRIMARY),
                                    );
                                } else {
                                    cell_text(
                                        ui,
                                        "Legacy chưa xác minh",
                                        false,
                                        Color32::from_rgb(146, 64, 14),
                                    );
                                }
                            }
                            3 => {
                                if row.workflow_verified {
                                    widgets::tag(
                                        ui,
                                        present(&row.grade),
                                        if row.grade.starts_with("A+") {
                                            TagTone::Warning
                                        } else if row.grade.starts_with('A') {
                                            TagTone::Success
                                        } else if row.grade.starts_with('B') {
                                            TagTone::Processing
                                        } else {
                                            TagTone::Neutral
                                        },
                                    );
                                } else {
                                    cell_text(
                                        ui,
                                        grade_label(row),
                                        false,
                                        Color32::from_rgb(146, 64, 14),
                                    );
                                }
                            }
                            4 => {
                                cell_text(
                                    ui,
                                    format_money(row.kpi_bonus),
                                    true,
                                    Color32::from_rgb(22, 163, 74),
                                );
                                cell_text(
                                    ui,
                                    "Đề xuất · chưa chi trả",
                                    false,
                                    Color32::from_rgb(100, 116, 139),
                                );
                            }
                            5 => {
                                if row.workflow_verified
                                    && (row.status == PENDING || review_completed(row))
                                {
                                    widgets::tag(
                                        ui,
                                        &row.status,
                                        if review_completed(row) {
                                            TagTone::Success
                                        } else {
                                            TagTone::Warning
                                        },
                                    );
                                } else {
                                    cell_text(
                                        ui,
                                        status_label(row),
                                        false,
                                        Color32::from_rgb(146, 64, 14),
                                    );
                                }
                            }
                            _ => {
                                if ui.button("Chi tiết").clicked() {
                                    self.selected_key = Some(row.key.clone());
                                }
                                if row.workflow_verified
                                    && row.status == PENDING
                                    && ui
                                        .add_enabled(
                                            self.approve_task.is_none()
                                                && self.create_task.is_none(),
                                            egui::Button::new("Duyệt"),
                                        )
                                        .clicked()
                                {
                                    self.selected_key = Some(row.key.clone());
                                    self.confirm_key = Some(row.key.clone());
                                }
                            }
                        }
                    },
                );
                ui.add_space(8.0);
                widgets::pagination(
                    ui,
                    "hr.performance.pagination",
                    &mut self.page,
                    visible.len(),
                    &mut self.page_size,
                );
            });
        if let Some(review) = self
            .rows
            .iter()
            .find(|row| self.selected_key.as_deref() == Some(row.key.as_str()))
            .cloned()
        {
            let (_, close) = widgets::drawer(
                ctx,
                "hr.performance.detail",
                "Bảng Điểm Đánh Giá Hiệu Suất & Nhận Xét Lãnh Đạo",
                600.0,
                |ui| self.render_detail(ui, &review),
            );
            if close {
                self.selected_key = None;
                if self.approve_task.is_none() {
                    self.confirm_key = None;
                }
            }
        }
        if self.form_open {
            self.render_form(ctx, session, api);
        }
        if let Some(review) = self
            .rows
            .iter()
            .find(|row| self.confirm_key.as_deref() == Some(row.key.as_str()))
            .cloned()
        {
            let busy = self.approve_task.is_some();
            let (_, close) = widgets::modal(
                ctx,
                "hr.performance.confirm",
                "Xác nhận hoàn tất đánh giá",
                560.0,
                busy,
                |ui| {
                    ui.label(format!("{} · {}", review.code, review.employee_name));
                    ui.label("Hệ thống lưu tài khoản và thời điểm hoàn tất. Thao tác không chuyển tiền, không tạo phiếu lương và không xác nhận thưởng đã chi.");
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    }
                    if busy {
                        ui.spinner();
                    }
                    ui.add_space(18.0);
                    widgets::action_row(ui, |ui| {
                        if ui
                            .add_enabled(
                                review.workflow_verified && review.status == PENDING,
                                egui::Button::new("Xác nhận hoàn tất"),
                            )
                            .clicked()
                        {
                            self.approve_task =
                                Some(api.approve_hr_performance_review_task(session, &review.key));
                            self.error.clear();
                        }
                        if ui.button("Hủy").clicked() {
                            self.confirm_key = None;
                        }
                    });
                },
            );
            if close {
                self.confirm_key = None;
            }
        }
    }

    fn render_detail(&mut self, ui: &mut Ui, review: &HrPerformanceReview) {
        detail_card(ui, true, |ui| {
            ui.colored_label(crate::theme::PRIMARY, RichText::new(&review.code).strong());
            ui.label(RichText::new(&review.employee_name).size(17.0).strong());
            ui.label(format!(
                "Mã NV: {} · Chức danh: {} · Phòng ban: {}",
                review.emp_code, review.position, review.department
            ));
            ui.label(format!(
                "Kỳ: {} · {}",
                present(&review.period),
                status_label(review)
            ));
        });
        if !review.workflow_verified {
            ui.colored_label(Color32::from_rgb(146,64,14),"Phiếu legacy chưa có sự kiện tạo trên máy chủ. Điểm, xếp loại và trạng thái chưa được xác minh; cần rà soát/import an toàn trước khi duyệt.");
        }
        ui.add_space(16.0);
        detail_card(ui, false, |ui| {
            ui.strong("Điểm Đánh Giá 3 Trụ Cột Năng Lực:");
            for label in [
                "1. Năng suất & Chất lượng công việc",
                "2. Tác phong, Kỷ luật & Tiến độ",
                "3. Sáng tạo, Cải tiến & Văn hóa",
            ] {
                ui.label(label);
                ui.label(
                    RichText::new("Chưa xác định · API chưa cung cấp điểm và trọng số")
                        .size(11.5)
                        .color(Color32::from_rgb(100, 116, 139)),
                );
            }
        });
        ui.add_space(16.0);
        detail_card(ui, true, |ui| {
            ui.label(format!(
                "Tổng điểm Quản lý khai báo: {} / 100 Điểm",
                review.manager_score
            ));
            ui.label(format!("Điểm tự chấm: {} / 100", review.self_score));
            ui.label(format!("Xếp loại: {}", grade_label(review)));
            ui.colored_label(
                Color32::from_rgb(22, 163, 74),
                RichText::new(format!(
                    "Thưởng KPI đề xuất: {}",
                    format_money(review.kpi_bonus)
                ))
                .size(20.0)
                .strong(),
            );
            ui.label("Chưa xác nhận phê duyệt chi trả.");
        });
        ui.add_space(16.0);
        detail_card(ui, false, |ui| {
            ui.strong(format!("Nhận xét từ {}:", present(&review.evaluator)));
            ui.label(present(&review.manager_comment));
            ui.label(format!(
                "Người lập phiếu: {} · {}",
                present(&review.created_by),
                present(&review.created_at)
            ));
            if !review.approval_recorded_at.trim().is_empty() {
                ui.label(format!(
                    "Ghi nhận hoàn tất bởi tài khoản {} lúc {}.",
                    present(&review.approval_recorded_by),
                    review.approval_recorded_at
                ));
            }
        });
        ui.add_space(16.0);
        if review.workflow_verified && review.status == PENDING {
            if ui
                .add_enabled(
                    self.approve_task.is_none() && self.create_task.is_none(),
                    egui::Button::new("Ghi nhận hoàn tất đánh giá"),
                )
                .clicked()
            {
                self.confirm_key = Some(review.key.clone());
            }
        } else if !review.workflow_verified {
            ui.add_enabled(false, egui::Button::new("Ghi nhận hoàn tất đánh giá"))
                .on_disabled_hover_text("Phiếu legacy chưa có nguồn kiểm chứng trên máy chủ.");
        }
        ui.add_enabled(false, egui::Button::new("Chuyển Kế Toán Chi Thưởng"))
            .on_disabled_hover_text("Chưa có luồng phê duyệt và chi trả thưởng.");
    }

    fn render_form(&mut self, ctx: &Context, session: &Session, api: &ApiClient) {
        let busy = self.create_task.is_some();
        let (_, close) = widgets::modal(
            ctx,
            "hr.performance.form",
            "Lập Phiếu Đánh Giá Hiệu Suất & Thưởng KPI Mới",
            640.0,
            busy,
            |ui| {
                ui.add_space(14.0);
                let columns = widgets::grid_columns(ui.available_width(), 220.0, 12.0, 2);
                ui.columns(columns, |cols| {
                    widgets::form_input(
                        &mut cols[0],
                        "performance.code",
                        "Mã phiếu",
                        true,
                        &mut self.form.code,
                        "",
                        false,
                    );
                    widgets::form_input(
                        &mut cols[1 % columns],
                        "performance.period",
                        "Kỳ đánh giá",
                        true,
                        &mut self.form.period,
                        "",
                        false,
                    );
                });
                widgets::form_input(
                    ui,
                    "performance.employee",
                    "Mã nhân viên được đánh giá",
                    true,
                    &mut self.form.employee_code,
                    "",
                    false,
                );
                let columns = widgets::grid_columns(ui.available_width(), 165.0, 12.0, 3);
                ui.columns(columns, |cols| {
                    widgets::form_input(
                        &mut cols[0],
                        "performance.self",
                        "Điểm Tự chấm (1–100)",
                        true,
                        &mut self.form.self_score,
                        "",
                        false,
                    );
                    widgets::form_input(
                        &mut cols[1 % columns],
                        "performance.manager",
                        "Điểm Quản lý chấm (1–100)",
                        true,
                        &mut self.form.manager_score,
                        "",
                        false,
                    );
                    widgets::form_input(
                        &mut cols[2 % columns],
                        "performance.bonus",
                        "Mức thưởng KPI đề xuất (₫)",
                        false,
                        &mut self.form.kpi_bonus,
                        "",
                        false,
                    );
                });
                widgets::form_textarea(
                    ui,
                    "performance.comment",
                    "Nhận xét của Quản lý",
                    false,
                    &mut self.form.manager_comment,
                    "",
                    2,
                );
                ui.label("Nhân viên, phòng ban, chức danh, người lập và xếp loại do máy chủ xác định. Mức thưởng chỉ là đề xuất; chưa có dữ liệu ba trụ cột hoặc khoản chi trả.");
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                }
                if busy {
                    ui.spinner();
                }
                ui.add_space(18.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .button(RichText::new("Lưu đánh giá").color(crate::theme::PRIMARY))
                        .clicked()
                    {
                        match self.form.to_input() {
                            Ok(input) => {
                                self.create_task =
                                    Some(api.create_hr_performance_review_task(session, &input));
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

impl ReviewForm {
    fn to_input(&self) -> Result<CreateHrPerformanceReviewInput, String> {
        for (label, value) in [
            ("Mã phiếu", self.code.trim()),
            ("Mã nhân viên HR", self.employee_code.trim()),
            ("Kỳ đánh giá", self.period.trim()),
        ] {
            if value.is_empty() {
                return Err(format!("{label} là bắt buộc."));
            }
        }
        let self_score = parse_score(&self.self_score, "Điểm tự chấm")?;
        let manager_score = parse_score(&self.manager_score, "Điểm quản lý")?;
        let kpi_bonus = self
            .kpi_bonus
            .trim()
            .parse::<i64>()
            .ok()
            .filter(|value| (0..=1_000_000_000_000_000).contains(value))
            .ok_or_else(|| "Mức thưởng đề xuất phải là số nguyên không âm hợp lệ.".to_owned())?;
        Ok(CreateHrPerformanceReviewInput {
            code: self.code.trim().to_owned(),
            employee_code: self.employee_code.trim().to_owned(),
            period: self.period.trim().to_owned(),
            self_score,
            manager_score,
            kpi_bonus,
            manager_comment: self.manager_comment.trim().to_owned(),
        })
    }
}

fn parse_score(value: &str, field: &str) -> Result<i64, String> {
    value
        .trim()
        .parse::<i64>()
        .ok()
        .filter(|score| (1..=100).contains(score))
        .ok_or_else(|| format!("{field} phải là số nguyên từ 1 đến 100."))
}

fn review_completed(review: &HrPerformanceReview) -> bool {
    review.workflow_verified
        && review.status == APPROVED
        && !review.approval_recorded_at.trim().is_empty()
}

fn review_matches(review: &HrPerformanceReview, filter: &str) -> bool {
    match filter {
        "A+" => review.workflow_verified && review.grade.starts_with("A+"),
        "A (Tốt)" => review.workflow_verified && review.grade == "A (Tốt)",
        "Chờ duyệt" => review.workflow_verified && review.status == PENDING,
        "Đã hoàn tất" => review_completed(review),
        "Legacy" => !review.workflow_verified,
        _ => true,
    }
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

fn status_label(review: &HrPerformanceReview) -> String {
    match review.status.as_str() {
        PENDING if !review.workflow_verified => "Legacy · chờ duyệt (chưa xác minh)".to_owned(),
        APPROVED if review.approval_recorded_at.trim().is_empty() => {
            "Legacy · hoàn tất (chưa xác minh)".to_owned()
        }
        other if !review.workflow_verified => format!("Legacy · {other} (chưa xác minh)"),
        other => other.to_owned(),
    }
}

fn grade_label(review: &HrPerformanceReview) -> String {
    if review.workflow_verified {
        review.grade.clone()
    } else if review.grade.trim().is_empty() {
        "Chưa xác minh".to_owned()
    } else {
        format!("{} · legacy chưa xác minh", review.grade)
    }
}

fn present(value: &str) -> &str {
    if value.trim().is_empty() {
        "Chưa có"
    } else {
        value
    }
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
                let mut view = HrPerformanceReviewsView {
                    loaded_for: Some(session.user.id.clone()),
                    page: 99,
                    ..Default::default()
                };
                if (1..=3).contains(&state) {
                    view.rows.push(HrPerformanceReview {
                        key: "layout-row".into(),
                        code: "DG-1".into(),
                        employee_name: long.clone(),
                        emp_code: "EMP-1".into(),
                        department: long.clone(),
                        position: long.clone(),
                        period: long.clone(),
                        grade: "A+ (Xuất sắc)".into(),
                        status: PENDING.into(),
                        workflow_verified: true,
                        manager_score: 96,
                        self_score: 90,
                        ..Default::default()
                    });
                }
                if state == 2 {
                    view.selected_key = Some("layout-row".into());
                }
                if state == 3 {
                    view.form_open = true;
                    view.form = review_form();
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
    fn grade_and_completion_filters_require_workflow_evidence() {
        let mut review = HrPerformanceReview {
            grade: "A+ (Xuất sắc)".into(),
            status: APPROVED.into(),
            ..Default::default()
        };
        assert!(review_matches(&review, "Tất cả"));
        assert!(review_matches(&review, "Legacy"));
        assert!(!review_matches(&review, "A+"));
        assert!(!review_matches(&review, "Đã hoàn tất"));
        review.workflow_verified = true;
        assert!(review_matches(&review, "A+"));
        assert!(!review_matches(&review, "A (Tốt)"));
        assert!(!review_matches(&review, "Đã hoàn tất"));
        review.approval_recorded_at = "2026-10-24T00:00:00Z".into();
        assert!(review_matches(&review, "Đã hoàn tất"));
        review.status = PENDING.into();
        assert!(review_matches(&review, "Chờ duyệt"));
        assert!(!review_matches(&review, "Đã hoàn tất"));
    }

    fn review_form() -> ReviewForm {
        ReviewForm {
            code: "DG-2026-Q3-001".into(),
            employee_code: "EMP-001".into(),
            period: "Quý III / 2026".into(),
            self_score: "91".into(),
            manager_score: "96".into(),
            kpi_bonus: "12000000".into(),
            manager_comment: "Đạt mục tiêu".into(),
        }
    }

    #[test]
    fn review_form_sends_only_supported_inputs() {
        let payload = serde_json::to_value(review_form().to_input().unwrap()).unwrap();
        assert_eq!(payload["employeeCode"], "EMP-001");
        assert_eq!(payload["selfScore"], 91);
        assert_eq!(payload["managerScore"], 96);
        assert_eq!(payload["kpiBonus"], 12000000);
        assert!(payload.get("employeeName").is_none());
        assert!(payload.get("department").is_none());
        assert!(payload.get("grade").is_none());
        assert!(payload.get("status").is_none());
        assert!(payload.get("productivityScore").is_none());
        assert!(payload.get("evaluator").is_none());
    }

    #[test]
    fn review_form_validates_required_fields_scores_and_proposed_bonus() {
        let mut form = review_form();
        form.employee_code.clear();
        assert!(form.to_input().is_err());
        let mut form = review_form();
        form.manager_score = "101".into();
        assert!(form.to_input().is_err());
        let mut form = review_form();
        form.self_score = "0".into();
        assert!(form.to_input().is_err());
        let mut form = review_form();
        form.kpi_bonus = "-1".into();
        assert!(form.to_input().is_err());
    }

    #[test]
    fn legacy_reviews_are_not_shown_as_verified_or_actionable() {
        let review = HrPerformanceReview {
            status: APPROVED.to_owned(),
            grade: "A+ (Xuất sắc)".to_owned(),
            ..HrPerformanceReview::default()
        };
        assert_eq!(status_label(&review), "Legacy · hoàn tất (chưa xác minh)");
        assert_eq!(grade_label(&review), "A+ (Xuất sắc) · legacy chưa xác minh");
    }
}
