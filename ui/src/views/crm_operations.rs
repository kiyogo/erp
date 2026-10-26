use std::time::Duration;

use crate::{
    api::{
        ApiClient, ApiTask, CreateCrmCustomerFeedbackInput, CreateCrmSupplierEvaluationInput,
        CrmCustomerFeedback, CrmCustomerFeedbackListResponse, CrmCustomerFeedbackResponse,
        CrmSupplierEvaluation, CrmSupplierEvaluationResponse, CrmSupplierEvaluationsResponse,
    },
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};
use egui::{Color32, Context, RichText, Ui};

const PAGE_SIZE: usize = 8;

#[derive(Default)]
pub struct CrmOperationsView {
    evaluations: SupplierEvaluationsView,
    feedback: CustomerFeedbackView,
}

impl CrmOperationsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &Context,
        session: &Session,
        api: &ApiClient,
        route_path: &str,
    ) {
        if route_path == "/admin/crm/suppliers-eval" {
            self.evaluations.render(ui, ctx, session, api);
        } else {
            self.feedback.render(ui, ctx, session, api);
        }
    }
}

#[derive(Default)]
struct SupplierEvaluationsView {
    rows: Vec<CrmSupplierEvaluation>,
    list_task: Option<ApiTask<CrmSupplierEvaluationsResponse>>,
    create_task: Option<ApiTask<CrmSupplierEvaluationResponse>>,
    loaded_for: Option<String>,
    loading: bool,
    needs_reload: bool,
    form_open: bool,
    form: EvaluationForm,
    search: String,
    tier_filter: String,
    page: usize,
    page_size: usize,
    score_order: String,
    selected_key: Option<String>,
    error: String,
    form_error: String,
    notice: String,
}

#[derive(Clone)]
struct EvaluationForm {
    code: String,
    period: String,
    supplier: String,
    category: String,
    quality: String,
    delivery: String,
    price: String,
    service: String,
    evaluator: String,
    strengths: String,
    weaknesses: String,
    decision: String,
}

impl Default for EvaluationForm {
    fn default() -> Self {
        Self {
            code: String::new(),
            period: String::new(),
            supplier: String::new(),
            category: String::new(),
            quality: String::new(),
            delivery: String::new(),
            price: String::new(),
            service: String::new(),
            evaluator: String::new(),
            strengths: String::new(),
            weaknesses: String::new(),
            decision: String::new(),
        }
    }
}

impl SupplierEvaluationsView {
    fn reset_for_account(&mut self, session: &Session) {
        *self = Self {
            loaded_for: Some(session.user.id.clone()),
            needs_reload: true,
            page_size: PAGE_SIZE,
            tier_filter: "Tất cả".into(),
            form: EvaluationForm {
                evaluator: session.user.name.clone(),
                ..EvaluationForm::default()
            },
            ..Self::default()
        };
    }

    fn poll(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(&session.user.id) {
            self.reset_for_account(session);
        }
        if self.needs_reload && self.list_task.is_none() && self.create_task.is_none() {
            self.loading = true;
            self.error.clear();
            self.list_task = Some(api.list_crm_supplier_evaluations_task(session));
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
                    self.notice = format!("Đã tạo đánh giá {}.", response.evaluation.eval_code);
                    self.form_open = false;
                    self.form = EvaluationForm {
                        evaluator: session.user.name.clone(),
                        ..EvaluationForm::default()
                    };
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }
        if self.list_task.is_some() || self.create_task.is_some() {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    fn render(&mut self, ui: &mut Ui, ctx: &Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên mới được xem đánh giá nhà cung cấp.");
            return;
        }
        self.poll(ui, session, api);
        let unknown = self.rows.is_empty() && (self.loading || !self.error.is_empty());
        let average = if self.rows.is_empty() {
            "—".into()
        } else {
            format!(
                "{:.1} / 100",
                self.rows
                    .iter()
                    .map(|row| row.total_score as f64)
                    .sum::<f64>()
                    / self.rows.len() as f64
            )
        };
        let count = |prefix: &str| {
            if unknown {
                "—".into()
            } else {
                format!(
                    "{} đối tác",
                    self.rows
                        .iter()
                        .filter(|row| row.tier.starts_with(prefix))
                        .count()
                )
            }
        };
        widgets::metrics(
            ui,
            "supplier-evaluations.kpi",
            &[
                Metric {
                    label: "Nhà cung cấp Hạng A (Chiến lược)",
                    value: count("Hạng A"),
                    detail: "Đạt từ 90 đến 100 điểm đánh giá",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                Metric {
                    label: "Nhà cung cấp Hạng B (Đạt chuẩn)",
                    value: count("Hạng B"),
                    detail: "Đạt từ 75 đến 89 điểm đánh giá",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 24.0,
                },
                Metric {
                    label: "Cần cải thiện / Giám sát SLA",
                    value: count("Hạng C"),
                    detail: "Dưới 75 điểm; chưa có giám sát SLA tự động",
                    color: Color32::from_rgb(220, 38, 38),
                    value_size: 24.0,
                },
                Metric {
                    label: "Điểm bình quân hệ thống NCC",
                    value: average,
                    detail: "Theo điểm đánh giá đã lưu",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let tiers = [
            "Tất cả",
            "Hạng A (Chiến lược)",
            "Hạng B (Đạt chuẩn)",
            "Hạng C (Cần cải thiện)",
        ];
        let toolbar = widgets::filter_toolbar_with_more(
            ui,
            "supplier-evaluations",
            &["Tất cả đánh giá", tiers[1], tiers[2], tiers[3]],
            tiers
                .iter()
                .position(|tier| *tier == self.tier_filter)
                .unwrap_or(0),
            &mut self.search,
            "Tìm theo mã, NCC, lĩnh vực, người đánh giá...",
            "Lập bảng đánh giá NCC",
            false,
            usize::MAX,
            |ui| {
                ui.add_enabled(false, egui::Button::new("Xuất Báo Cáo"))
                    .on_disabled_hover_text("Chưa có bộ tạo báo cáo Excel.");
            },
        );
        if let Some(index) = toolbar.selected {
            self.tier_filter = tiers[index].into();
            self.page = 0;
        }
        if toolbar.search_changed {
            self.page = 0;
        }
        if toolbar.reload_clicked {
            self.needs_reload = true;
        }
        if toolbar.create_clicked && self.create_task.is_none() {
            self.form = EvaluationForm {
                evaluator: session.user.name.clone(),
                ..Default::default()
            };
            self.form_error.clear();
            self.form_open = true;
        }
        ui.add_space(8.0);
        widgets::combo_box("supplier-evaluations.order")
            .selected_text(if self.score_order.is_empty() {
                "Thứ tự ban đầu"
            } else {
                &self.score_order
            })
            .show_ui(ui, |ui| {
                for order in ["Thứ tự ban đầu", "Điểm tăng dần", "Điểm giảm dần"]
                {
                    if ui
                        .selectable_value(&mut self.score_order, order.into(), order)
                        .changed()
                    {
                        self.page = 0;
                    }
                }
            });
        ui.add_space(12.0);
        show_messages(ui, &self.notice, &self.error);
        if self.loading {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải đánh giá…");
            });
        }
        let query = self.search.trim().to_lowercase();
        let mut filtered = self
            .rows
            .iter()
            .filter(|row| {
                (self.tier_filter.is_empty()
                    || self.tier_filter == "Tất cả"
                    || self.tier_filter == row.tier)
                    && (query.is_empty()
                        || [
                            &row.eval_code,
                            &row.supplier_name,
                            &row.category,
                            &row.evaluator,
                        ]
                        .iter()
                        .any(|value| value.to_lowercase().contains(&query)))
            })
            .cloned()
            .collect::<Vec<_>>();
        if self.score_order == "Điểm tăng dần" {
            filtered.sort_by_key(|row| row.total_score);
        }
        if self.score_order == "Điểm giảm dần" {
            filtered.sort_by(|left, right| right.total_score.cmp(&left.total_score));
        }
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let rows = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        widgets::table(
            ui,
            "supplier-evaluations.table",
            &[
                TableColumn {
                    title: "Mã đánh giá & Kỳ",
                    width: 170.0,
                },
                TableColumn {
                    title: "Tên Nhà Cung Cấp & Lĩnh vực",
                    width: 280.0,
                },
                TableColumn {
                    title: "Chi tiết điểm (CL / TĐ / Giá / DV)",
                    width: 250.0,
                },
                TableColumn {
                    title: "Tổng điểm",
                    width: 120.0,
                },
                TableColumn {
                    title: "Phân hạng",
                    width: 185.0,
                },
                TableColumn {
                    title: "Người đánh giá",
                    width: 180.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 110.0,
                },
            ],
            rows.len(),
            |ui, row, col| {
                let item = rows[row];
                match col {
                    0 => {
                        ui.colored_label(crate::theme::PRIMARY, &item.eval_code);
                        ui.small(&item.eval_period);
                        if is_legacy_unverified(&item.extra) {
                            ui.small("Legacy · cần đối chiếu");
                        }
                    }
                    1 => {
                        ui.label(&item.supplier_name);
                        ui.small(format!("Lĩnh vực: {}", item.category));
                    }
                    2 => {
                        ui.small(format!(
                            "CL: {}/40 · TĐ: {}/30",
                            item.quality_score, item.delivery_score
                        ));
                        ui.small(format!(
                            "Giá: {}/20 · DV: {}/10",
                            item.price_score, item.service_score
                        ));
                    }
                    3 => {
                        ui.colored_label(
                            if item.total_score >= 90 {
                                Color32::from_rgb(22, 163, 74)
                            } else {
                                Color32::from_rgb(37, 99, 235)
                            },
                            format!("{} / 100 đ", item.total_score),
                        );
                    }
                    4 => widgets::tag(
                        ui,
                        &item.tier,
                        if item.tier.starts_with("Hạng A") {
                            TagTone::Success
                        } else if item.tier.starts_with("Hạng B") {
                            TagTone::Processing
                        } else if item.tier.starts_with("Hạng C") {
                            TagTone::Error
                        } else {
                            TagTone::Neutral
                        },
                    ),
                    5 => {
                        ui.label(&item.evaluator);
                    }
                    _ => {
                        if ui.button("Chi tiết").clicked() {
                            self.selected_key = Some(item.key.clone());
                        }
                    }
                }
            },
        );
        ui.add_space(8.0);
        widgets::pagination(
            ui,
            "supplier-evaluations.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
        if let Some(row) = self
            .rows
            .iter()
            .find(|row| self.selected_key.as_deref() == Some(row.key.as_str()))
            .cloned()
        {
            let (_, close) = widgets::drawer(
                ctx,
                "supplier-evaluations.detail",
                "Hồ Sơ Đánh Giá Năng Lực Nhà Cung Cấp",
                620.0,
                |ui| {
                    egui::Frame::none()
                        .fill(Color32::from_rgb(248, 250, 252))
                        .rounding(8.0)
                        .inner_margin(16.0)
                        .show(ui, |ui| {
                            ui.colored_label(
                                crate::theme::PRIMARY,
                                format!("MÃ ĐÁNH GIÁ: {}", row.eval_code),
                            );
                            ui.label(RichText::new(&row.supplier_name).size(17.0).strong());
                            ui.small(format!(
                                "{} · Kỳ: {} · Người đánh giá: {}",
                                row.category, row.eval_period, row.evaluator
                            ));
                        });
                    ui.add_space(16.0);
                    if is_legacy_unverified(&row.extra) {
                        ui.colored_label(
                            Color32::from_rgb(180, 83, 9),
                            "Dữ liệu legacy cần đối chiếu; điểm và hạng được máy chủ tính lại.",
                        );
                    }
                    ui.heading(format!("{} / 100 điểm", row.total_score));
                    widgets::tag(
                        ui,
                        &row.tier,
                        if row.tier.starts_with("Hạng A") {
                            TagTone::Success
                        } else {
                            TagTone::Processing
                        },
                    );
                    for (label, score, max) in [
                        ("Chất lượng", row.quality_score, 40),
                        ("Tiến độ giao hàng", row.delivery_score, 30),
                        ("Giá cả", row.price_score, 20),
                        ("Dịch vụ", row.service_score, 10),
                    ] {
                        ui.label(format!("{label}: {score} / {max}"));
                        ui.add(
                            egui::ProgressBar::new((score as f32 / max as f32).clamp(0.0, 1.0))
                                .fill(crate::theme::PRIMARY)
                                .desired_height(6.0),
                        );
                        ui.add_space(8.0);
                    }
                    ui.strong("Ưu điểm");
                    ui.label(if row.strengths.is_empty() {
                        "—"
                    } else {
                        &row.strengths
                    });
                    ui.strong("Điểm cần cải thiện");
                    ui.label(if row.weaknesses.is_empty() {
                        "—"
                    } else {
                        &row.weaknesses
                    });
                    ui.strong("Kết luận");
                    ui.label(row.decision.as_deref().unwrap_or("Chưa có kết luận"));
                    if !row.extra.is_empty() {
                        ui.collapsing("Thông tin bổ sung", |ui| {
                            ui.label(serde_json::to_string_pretty(&row.extra).unwrap_or_default());
                        });
                    }
                    ui.add_space(16.0);
                    ui.add_enabled(false, egui::Button::new("In Báo Cáo (A4)"))
                        .on_disabled_hover_text("Chưa có bộ tạo biên bản đánh giá.");
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
        let (_, close) = widgets::modal(
            ctx,
            "supplier-evaluations.create",
            "Lập Bảng Đánh Giá Năng Lực Nhà Cung Cấp",
            620.0,
            self.create_task.is_some(),
            |ui| {
                ui.add_space(14.0);
                if ui.available_width() >= 420.0 {
                    ui.columns(2, |cols| {
                        widgets::form_input(
                            &mut cols[0],
                            "evaluation.code",
                            "Mã đánh giá",
                            false,
                            &mut self.form.code,
                            "Để trống để máy chủ cấp mã",
                            false,
                        );
                        widgets::form_input(
                            &mut cols[1],
                            "evaluation.period",
                            "Kỳ đánh giá",
                            true,
                            &mut self.form.period,
                            "",
                            false,
                        );
                    });
                } else {
                    widgets::form_input(
                        ui,
                        "evaluation.code",
                        "Mã đánh giá",
                        false,
                        &mut self.form.code,
                        "Để trống để máy chủ cấp mã",
                        false,
                    );
                    widgets::form_input(
                        ui,
                        "evaluation.period",
                        "Kỳ đánh giá",
                        true,
                        &mut self.form.period,
                        "",
                        false,
                    );
                }
                widgets::form_input(
                    ui,
                    "evaluation.supplier",
                    "Tên Nhà Cung Cấp",
                    true,
                    &mut self.form.supplier,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "evaluation.category",
                    "Lĩnh vực",
                    true,
                    &mut self.form.category,
                    "",
                    false,
                );
                if ui.available_width() >= 420.0 {
                    ui.columns(2, |cols| {
                        score_text(&mut cols[0], "Chất lượng /40", &mut self.form.quality);
                        score_text(&mut cols[1], "Giao hàng /30", &mut self.form.delivery);
                        score_text(&mut cols[0], "Giá /20", &mut self.form.price);
                        score_text(&mut cols[1], "Dịch vụ /10", &mut self.form.service);
                    });
                } else {
                    score_text(ui, "Chất lượng /40", &mut self.form.quality);
                    score_text(ui, "Giao hàng /30", &mut self.form.delivery);
                    score_text(ui, "Giá /20", &mut self.form.price);
                    score_text(ui, "Dịch vụ /10", &mut self.form.service);
                }
                widgets::form_input(
                    ui,
                    "evaluation.evaluator",
                    "Người đánh giá",
                    true,
                    &mut self.form.evaluator,
                    "",
                    false,
                );
                widgets::form_textarea(
                    ui,
                    "evaluation.strengths",
                    "Ưu điểm",
                    false,
                    &mut self.form.strengths,
                    "",
                    2,
                );
                widgets::form_textarea(
                    ui,
                    "evaluation.weaknesses",
                    "Điểm cần cải thiện",
                    false,
                    &mut self.form.weaknesses,
                    "",
                    2,
                );
                widgets::form_field(ui, "evaluation.decision", "Kết luận", false, |ui| {
                    widgets::combo_box("evaluation.decision.select")
                        .width(ui.available_width())
                        .selected_text(if self.form.decision.is_empty() {
                            "Tự xác định theo điểm"
                        } else {
                            &self.form.decision
                        })
                        .show_ui(ui, |ui| {
                            ui.selectable_value(
                                &mut self.form.decision,
                                String::new(),
                                "Tự xác định theo điểm",
                            );
                            for value in [
                                "Duy trì đối tác chiến lược",
                                "Gia hạn hợp đồng & đàm phán giá",
                                "Yêu cầu khắc phục SLA trong 30 ngày",
                                "Chấm dứt hợp tác",
                            ] {
                                ui.selectable_value(&mut self.form.decision, value.into(), value);
                            }
                        });
                });
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.form_error);
                }
                ui.add_space(18.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(
                            self.list_task.is_none(),
                            egui::Button::new("Lưu đánh giá").fill(crate::theme::PRIMARY),
                        )
                        .clicked()
                    {
                        match self.form.to_input() {
                            Ok(input) => {
                                self.create_task =
                                    Some(api.create_crm_supplier_evaluation_task(session, &input));
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

impl EvaluationForm {
    fn to_input(&self) -> Result<CreateCrmSupplierEvaluationInput, String> {
        let supplier = self.supplier.trim();
        let period = self.period.trim();
        let evaluator = self.evaluator.trim();
        if supplier.is_empty()
            || period.is_empty()
            || evaluator.is_empty()
            || self.category.trim().is_empty()
        {
            return Err(
                "Nhà cung cấp, lĩnh vực, kỳ đánh giá và người đánh giá là bắt buộc.".to_owned(),
            );
        }
        Ok(CreateCrmSupplierEvaluationInput {
            eval_code: self.code.trim().to_owned(),
            eval_period: period.to_owned(),
            supplier_name: supplier.to_owned(),
            category: self.category.trim().to_owned(),
            quality_score: parse_score(&self.quality, 40, "Chất lượng")?,
            delivery_score: parse_score(&self.delivery, 30, "Tiến độ giao hàng")?,
            price_score: parse_score(&self.price, 20, "Giá cả")?,
            service_score: parse_score(&self.service, 10, "Dịch vụ")?,
            evaluator: evaluator.to_owned(),
            strengths: self.strengths.trim().to_owned(),
            weaknesses: self.weaknesses.trim().to_owned(),
            decision: (!self.decision.is_empty()).then(|| self.decision.clone()),
        })
    }
}

#[derive(Default)]
struct CustomerFeedbackView {
    rows: Vec<CrmCustomerFeedback>,
    list_task: Option<ApiTask<CrmCustomerFeedbackListResponse>>,
    create_task: Option<ApiTask<CrmCustomerFeedbackResponse>>,
    resolve_task: Option<ApiTask<CrmCustomerFeedbackResponse>>,
    loaded_for: Option<String>,
    loading: bool,
    needs_reload: bool,
    form_open: bool,
    form: FeedbackForm,
    search: String,
    filter: String,
    page: usize,
    page_size: usize,
    score_order: String,
    selected_key: Option<String>,
    error: String,
    form_error: String,
    notice: String,
}

#[derive(Clone)]
struct FeedbackForm {
    code: String,
    client: String,
    contact: String,
    phone: String,
    service: String,
    rating: i32,
    content: String,
    priority: String,
    action: String,
    assigned: String,
}

impl Default for FeedbackForm {
    fn default() -> Self {
        Self {
            code: String::new(),
            client: String::new(),
            contact: String::new(),
            phone: String::new(),
            service: String::new(),
            rating: 0,
            content: String::new(),
            priority: "Trung bình".to_owned(),
            action: String::new(),
            assigned: String::new(),
        }
    }
}

impl CustomerFeedbackView {
    fn reset_for_account(&mut self, session: &Session) {
        *self = Self {
            loaded_for: Some(session.user.id.clone()),
            needs_reload: true,
            page_size: PAGE_SIZE,
            form: FeedbackForm {
                assigned: session.user.name.clone(),
                ..FeedbackForm::default()
            },
            ..Self::default()
        };
    }

    fn poll(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(&session.user.id) {
            self.reset_for_account(session);
        }
        if self.needs_reload
            && self.list_task.is_none()
            && self.create_task.is_none()
            && self.resolve_task.is_none()
        {
            self.loading = true;
            self.error.clear();
            self.list_task = Some(api.list_crm_feedback_task(session));
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
                    self.notice =
                        format!("Đã ghi nhận phản ánh {}.", response.feedback.feedback_code);
                    self.form_open = false;
                    self.form = FeedbackForm {
                        assigned: session.user.name.clone(),
                        ..FeedbackForm::default()
                    };
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }
        if let Some(result) = self.resolve_task.as_ref().and_then(ApiClient::poll) {
            self.resolve_task = None;
            match result {
                Ok(response) => {
                    self.notice =
                        format!("Đã cập nhật phản ánh {}.", response.feedback.feedback_code);
                    if let Some(row) = self
                        .rows
                        .iter_mut()
                        .find(|row| row.key == response.feedback.key)
                    {
                        *row = response.feedback;
                    }
                }
                Err(error) => self.error = error,
            }
        }
        if self.list_task.is_some() || self.create_task.is_some() || self.resolve_task.is_some() {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    fn render(&mut self, ui: &mut Ui, ctx: &Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên mới được xem phản hồi khách hàng.");
            return;
        }
        self.poll(ui, session, api);
        let total = self.rows.len();
        let resolved = self
            .rows
            .iter()
            .filter(|row| row.status == "Đã giải quyết thỏa đáng")
            .count();
        let running = self
            .rows
            .iter()
            .filter(|row| row.status == "Đang xử lý")
            .count();
        let urgent = self
            .rows
            .iter()
            .filter(|row| row.priority == "Khẩn cấp")
            .count();
        let average = if total == 0 {
            "—".into()
        } else {
            format!(
                "{:.1} / 5.0 sao",
                self.rows.iter().map(|row| row.rating as f64).sum::<f64>() / total as f64
            )
        };
        let resolved_detail = format!("{resolved} / {total} vụ việc đã đóng hồ sơ");
        let unknown = total == 0 && (self.loading || !self.error.is_empty());
        widgets::metrics(
            ui,
            "customer-feedback.kpi",
            &[
                Metric {
                    label: "Chỉ số hài lòng khách hàng (CSAT)",
                    value: average,
                    detail: "Theo đánh giá khách hàng đã ghi nhận",
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 24.0,
                },
                Metric {
                    label: "Tỷ lệ giải quyết thỏa đáng",
                    value: if total == 0 {
                        "—".into()
                    } else {
                        format!("{:.0}% hoàn thành", resolved as f64 * 100.0 / total as f64)
                    },
                    detail: &resolved_detail,
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                Metric {
                    label: "Vụ việc đang theo dõi & xử lý",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{running} sự vụ")
                    },
                    detail: "Chưa có API đo thời gian phản hồi",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 24.0,
                },
                Metric {
                    label: "Sự cố mức độ Khẩn cấp",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("{urgent} vụ việc")
                    },
                    detail: "Theo mức ưu tiên đã lưu, chưa đối soát quá hạn",
                    color: Color32::from_rgb(220, 38, 38),
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let filters = ["Tất cả", "5 sao", "Đang xử lý", "Khẩn cấp"];
        let toolbar = widgets::filter_toolbar_with_more(
            ui,
            "customer-feedback",
            &[
                "Tất cả phản ánh",
                "5 Sao (Rất hài lòng)",
                "Đang xử lý",
                "Khẩn cấp",
            ],
            filters
                .iter()
                .position(|filter| *filter == self.filter)
                .unwrap_or(0),
            &mut self.search,
            "Tìm theo mã, khách hàng, dịch vụ, nội dung...",
            "Ghi nhận phản ánh mới",
            false,
            usize::MAX,
            |ui| {
                ui.add_enabled(false, egui::Button::new("Xuất Báo Cáo"))
                    .on_disabled_hover_text("Chưa có bộ tạo báo cáo khảo sát CSAT.");
            },
        );
        if let Some(index) = toolbar.selected {
            self.filter = filters[index].into();
            self.page = 0;
        }
        if toolbar.search_changed {
            self.page = 0;
        }
        if toolbar.reload_clicked {
            self.needs_reload = true;
        }
        if toolbar.create_clicked && self.create_task.is_none() {
            self.form = FeedbackForm {
                assigned: session.user.name.clone(),
                ..Default::default()
            };
            self.form_error.clear();
            self.form_open = true;
        }
        ui.add_space(8.0);
        widgets::combo_box("customer-feedback.order")
            .selected_text(if self.score_order.is_empty() {
                "Thứ tự ban đầu"
            } else {
                &self.score_order
            })
            .show_ui(ui, |ui| {
                for order in ["Thứ tự ban đầu", "Đánh giá tăng dần", "Đánh giá giảm dần"]
                {
                    if ui
                        .selectable_value(&mut self.score_order, order.into(), order)
                        .changed()
                    {
                        self.page = 0;
                    }
                }
            });
        ui.add_space(12.0);
        show_messages(ui, &self.notice, &self.error);
        if self.loading {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải phản hồi…");
            });
        }
        let query = self.search.trim().to_lowercase();
        let mut filtered = self
            .rows
            .iter()
            .filter(|row| {
                (query.is_empty()
                    || [
                        &row.feedback_code,
                        &row.client_name,
                        &row.service_name,
                        &row.content,
                        &row.assigned_staff,
                    ]
                    .iter()
                    .any(|value| value.to_lowercase().contains(&query)))
                    && match self.filter.as_str() {
                        "5 sao" => row.rating == 5,
                        "Đang xử lý" => row.status == "Đang xử lý",
                        "Khẩn cấp" => row.priority == "Khẩn cấp",
                        _ => true,
                    }
            })
            .cloned()
            .collect::<Vec<_>>();
        if self.score_order == "Đánh giá tăng dần" {
            filtered.sort_by_key(|row| row.rating);
        }
        if self.score_order == "Đánh giá giảm dần" {
            filtered.sort_by(|left, right| right.rating.cmp(&left.rating));
        }
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let rows = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        widgets::table(
            ui,
            "customer-feedback.table",
            &[
                TableColumn {
                    title: "Mã phản ánh & Ngày nhận",
                    width: 190.0,
                },
                TableColumn {
                    title: "Khách hàng & Dịch vụ",
                    width: 290.0,
                },
                TableColumn {
                    title: "Đánh giá CSAT",
                    width: 140.0,
                },
                TableColumn {
                    title: "Mức độ ưu tiên",
                    width: 120.0,
                },
                TableColumn {
                    title: "Cán bộ xử lý",
                    width: 180.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 185.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 180.0,
                },
            ],
            rows.len(),
            |ui, row, col| {
                let item = rows[row];
                match col {
                    0 => {
                        ui.colored_label(crate::theme::PRIMARY, &item.feedback_code);
                        ui.small(&item.received_date);
                        if is_legacy_unverified(&item.extra) {
                            ui.small("Legacy · cần đối chiếu");
                        }
                    }
                    1 => {
                        ui.label(&item.client_name);
                        ui.colored_label(
                            Color32::from_rgb(37, 99, 235),
                            format!("Dịch vụ: {}", item.service_name),
                        );
                    }
                    2 => {
                        ui.colored_label(
                            Color32::from_rgb(245, 158, 11),
                            format!(
                                "{} ({}/5)",
                                "★".repeat(item.rating.clamp(0, 5) as usize),
                                item.rating
                            ),
                        );
                    }
                    3 => widgets::tag(
                        ui,
                        &item.priority,
                        match item.priority.as_str() {
                            "Khẩn cấp" => TagTone::Error,
                            "Cao" => TagTone::Warning,
                            "Trung bình" => TagTone::Processing,
                            _ => TagTone::Neutral,
                        },
                    ),
                    4 => {
                        ui.label(&item.assigned_staff);
                    }
                    5 => widgets::tag(
                        ui,
                        &item.status,
                        match item.status.as_str() {
                            "Đã giải quyết thỏa đáng" => TagTone::Success,
                            "Đang xử lý" => TagTone::Warning,
                            _ => TagTone::Neutral,
                        },
                    ),
                    _ => {
                        ui.horizontal(|ui| {
                            if ui.button("Chi tiết").clicked() {
                                self.selected_key = Some(item.key.clone());
                            }
                            if item.status == "Đang xử lý"
                                && ui
                                    .add_enabled(
                                        self.resolve_task.is_none() && self.list_task.is_none(),
                                        egui::Button::new("Xong"),
                                    )
                                    .clicked()
                            {
                                self.resolve_task =
                                    Some(api.resolve_crm_feedback_task(session, &item.key));
                            }
                        });
                    }
                }
            },
        );
        ui.add_space(8.0);
        widgets::pagination(
            ui,
            "customer-feedback.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
        if let Some(row) = self
            .rows
            .iter()
            .find(|row| self.selected_key.as_deref() == Some(row.key.as_str()))
            .cloned()
        {
            let (_, close) = widgets::drawer(
                ctx,
                "customer-feedback.detail",
                "Biên Bản Tiếp Nhận & Xử Lý Ý Kiến Khách Hàng (CSAT)",
                580.0,
                |ui| {
                    egui::Frame::none()
                        .fill(Color32::from_rgb(248, 250, 252))
                        .rounding(8.0)
                        .inner_margin(16.0)
                        .show(ui, |ui| {
                            ui.colored_label(
                                crate::theme::PRIMARY,
                                format!("MÃ VỤ VIỆC: {}", row.feedback_code),
                            );
                            ui.label(RichText::new(&row.client_name).size(17.0).strong());
                            ui.small(format!(
                                "Người gửi: {} ({}) · Ngày: {}",
                                if row.contact_person.is_empty() {
                                    "—"
                                } else {
                                    &row.contact_person
                                },
                                if row.phone.is_empty() {
                                    "—"
                                } else {
                                    &row.phone
                                },
                                row.received_date
                            ));
                        });
                    ui.add_space(16.0);
                    if is_legacy_unverified(&row.extra) {
                        ui.colored_label(
                            Color32::from_rgb(180, 83, 9),
                            "Dữ liệu legacy chưa xác minh, được đưa về hàng đợi xử lý mới.",
                        );
                    }
                    egui::Frame::group(ui.style())
                        .inner_margin(14.0)
                        .show(ui, |ui| {
                            ui.strong("Đánh Giá Hài Lòng Khách Hàng (CSAT)");
                            ui.colored_label(
                                Color32::from_rgb(245, 158, 11),
                                format!("{} / 5 điểm", row.rating),
                            );
                            ui.label(format!(
                                "Dịch vụ liên quan: {} · Độ ưu tiên: {}",
                                row.service_name, row.priority
                            ));
                            ui.label(&row.status);
                        });
                    ui.add_space(16.0);
                    egui::Frame::group(ui.style())
                        .inner_margin(14.0)
                        .show(ui, |ui| {
                            ui.strong("Chi Tiết Nội Dung Ý Kiến Khách Hàng");
                            ui.label(&row.content);
                        });
                    ui.add_space(16.0);
                    egui::Frame::group(ui.style())
                        .inner_margin(14.0)
                        .show(ui, |ui| {
                            ui.strong("Biện Pháp Khắc Phục & Cam Kết Chất Lượng");
                            ui.label(if row.resolution_action.is_empty() {
                                "Chưa ghi nhận biện pháp"
                            } else {
                                &row.resolution_action
                            });
                            ui.label(format!("Cán bộ phụ trách: {}", row.assigned_staff));
                            if let Some(date) = &row.resolved_date {
                                ui.label(format!("Ngày đóng hồ sơ: {date}"));
                            }
                        });
                    show_messages(ui, &self.notice, &self.error);
                    ui.add_space(16.0);
                    ui.horizontal_wrapped(|ui| {
                        if row.status == "Đang xử lý"
                            && ui
                                .add_enabled(
                                    self.resolve_task.is_none() && self.list_task.is_none(),
                                    egui::Button::new("Đánh dấu đã xử lý & Đóng hồ sơ"),
                                )
                                .clicked()
                        {
                            self.resolve_task =
                                Some(api.resolve_crm_feedback_task(session, &row.key));
                        }
                        ui.add_enabled(false, egui::Button::new("In Biên Bản (A4)"))
                            .on_disabled_hover_text("Chưa có bộ tạo biên bản.");
                    });
                    if !row.extra.is_empty() {
                        ui.collapsing("Thông tin bổ sung", |ui| {
                            ui.label(serde_json::to_string_pretty(&row.extra).unwrap_or_default());
                        });
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
        let (_, close) = widgets::modal(
            ctx,
            "customer-feedback.create",
            "Ghi Nhận Phản Ánh & Khiếu Nại Khách Hàng",
            620.0,
            self.create_task.is_some(),
            |ui| {
                ui.add_space(14.0);
                widgets::form_input(
                    ui,
                    "feedback.code",
                    "Mã phản hồi",
                    false,
                    &mut self.form.code,
                    "Để trống để máy chủ cấp mã",
                    false,
                );
                widgets::form_field(ui, "feedback.rating", "Đánh giá sao CSAT", true, |ui| {
                    widgets::combo_box("feedback.rating.select")
                        .width(ui.available_width())
                        .selected_text(if self.form.rating == 0 {
                            "Chọn đánh giá".into()
                        } else {
                            format!("{} / 5 sao", self.form.rating)
                        })
                        .show_ui(ui, |ui| {
                            for rating in (1..=5).rev() {
                                ui.selectable_value(
                                    &mut self.form.rating,
                                    rating,
                                    format!("{rating} sao"),
                                );
                            }
                        });
                });
                widgets::form_input(
                    ui,
                    "feedback.client",
                    "Tên Đối tác / Khách hàng",
                    true,
                    &mut self.form.client,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "feedback.contact",
                    "Người phản ánh",
                    false,
                    &mut self.form.contact,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "feedback.phone",
                    "Điện thoại",
                    false,
                    &mut self.form.phone,
                    "",
                    false,
                );
                widgets::form_input(
                    ui,
                    "feedback.service",
                    "Dịch vụ liên quan",
                    true,
                    &mut self.form.service,
                    "",
                    false,
                );
                widgets::form_textarea(
                    ui,
                    "feedback.content",
                    "Nội dung ý kiến phản ánh",
                    true,
                    &mut self.form.content,
                    "Chi tiết phản ánh, khiếu nại hoặc góp ý của khách hàng...",
                    3,
                );
                widgets::form_select(
                    ui,
                    "feedback.priority",
                    "Độ ưu tiên",
                    true,
                    &mut self.form.priority,
                    &["Khẩn cấp", "Cao", "Trung bình"],
                );
                widgets::form_input(
                    ui,
                    "feedback.assigned",
                    "Cán bộ phụ trách xử lý",
                    true,
                    &mut self.form.assigned,
                    "",
                    false,
                );
                widgets::form_textarea(
                    ui,
                    "feedback.action",
                    "Biện pháp xử lý & Cam kết khắc phục",
                    false,
                    &mut self.form.action,
                    "",
                    2,
                );
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.form_error);
                }
                ui.add_space(18.0);
                widgets::action_row(ui, |ui| {
                    if ui
                        .add_enabled(
                            self.list_task.is_none() && self.resolve_task.is_none(),
                            egui::Button::new("Tiếp nhận ý kiến").fill(crate::theme::PRIMARY),
                        )
                        .clicked()
                    {
                        match self.form.to_input() {
                            Ok(input) => {
                                self.create_task =
                                    Some(api.create_crm_feedback_task(session, &input));
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

impl FeedbackForm {
    fn to_input(&self) -> Result<CreateCrmCustomerFeedbackInput, String> {
        if self.client.trim().is_empty()
            || self.service.trim().is_empty()
            || self.content.trim().is_empty()
            || self.assigned.trim().is_empty()
        {
            return Err(
                "Khách hàng, dịch vụ, nội dung và cán bộ phụ trách là bắt buộc.".to_owned(),
            );
        }
        if !(1..=5).contains(&self.rating) {
            return Err("Chọn đánh giá từ 1 đến 5 sao.".into());
        }
        if !["Khẩn cấp", "Cao", "Trung bình"].contains(&self.priority.as_str()) {
            return Err("Chọn mức độ ưu tiên hợp lệ.".into());
        }
        Ok(CreateCrmCustomerFeedbackInput {
            feedback_code: self.code.trim().to_owned(),
            client_name: self.client.trim().to_owned(),
            contact_person: self.contact.trim().to_owned(),
            phone: self.phone.trim().to_owned(),
            service_name: self.service.trim().to_owned(),
            rating: i64::from(self.rating),
            content: self.content.trim().to_owned(),
            priority: self.priority.clone(),
            resolution_action: self.action.trim().to_owned(),
            assigned_staff: self.assigned.trim().to_owned(),
        })
    }
}

fn score_text(ui: &mut Ui, label: &str, value: &mut String) {
    widgets::form_input(ui, label, label, true, value, "", false);
}

fn parse_score(value: &str, max: i64, label: &str) -> Result<i64, String> {
    let score = value
        .trim()
        .parse::<i64>()
        .map_err(|_| format!("Điểm {label} phải là số nguyên."))?;
    if !(0..=max).contains(&score) {
        return Err(format!("Điểm {label} phải nằm trong khoảng 0 đến {max}."));
    }
    Ok(score)
}

fn is_legacy_unverified(extra: &std::collections::BTreeMap<String, serde_json::Value>) -> bool {
    extra
        .get("legacyImportStatus")
        .and_then(serde_json::Value::as_str)
        == Some("unverified")
}

fn show_messages(ui: &mut Ui, notice: &str, error: &str) {
    if !notice.is_empty() {
        ui.colored_label(Color32::from_rgb(22, 101, 52), notice);
    }
    if !error.is_empty() {
        ui.colored_label(Color32::from_rgb(185, 28, 28), error);
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn evaluation_requires_explicit_scores_and_enforces_each_maximum() {
        let mut form = EvaluationForm {
            supplier: "Nhà cung cấp".into(),
            period: "Q4/2026".into(),
            evaluator: "Người đánh giá".into(),
            category: "Hạ tầng".into(),
            ..Default::default()
        };
        assert!(form.to_input().is_err());
        form.quality = "40".into();
        form.delivery = "30".into();
        form.price = "20".into();
        form.service = "10".into();
        let input = form.to_input().unwrap();
        assert_eq!(
            input.quality_score + input.delivery_score + input.price_score + input.service_score,
            100
        );
        assert!(input.decision.is_none());
        form.quality = "41".into();
        assert!(form.to_input().is_err());
        assert!(parse_score("-1", 40, "Chất lượng").is_err());
        assert!(parse_score("3.5", 40, "Chất lượng").is_err());
    }

    #[test]
    fn feedback_requires_a_rating_and_keeps_optional_contact_blank() {
        let mut form = FeedbackForm {
            client: "Khách hàng".into(),
            service: "Dịch vụ".into(),
            content: "Góp ý".into(),
            assigned: "Người xử lý".into(),
            ..Default::default()
        };
        assert!(form.to_input().is_err());
        form.rating = 1;
        let input = form.to_input().unwrap();
        assert_eq!(input.rating, 1);
        assert!(input.contact_person.is_empty() && input.phone.is_empty());
        form.rating = 6;
        assert!(form.to_input().is_err());
        form.rating = 5;
        form.priority = "Lạ".into();
        assert!(form.to_input().is_err());
    }

    #[test]
    fn account_reset_clears_records_details_and_unsaved_forms() {
        let session: Session = serde_json::from_value(serde_json::json!({
            "token": "test", "session_id":"reset-test", "user": {"id":"user-b", "name":"Người B", "email":"reset@example.invalid", "role":"ADMIN"},
            "endpoint":"http://127.0.0.1:9", "mode":"local_admin"
        })).unwrap();
        let mut evaluations = SupplierEvaluationsView::default();
        evaluations.search = "Riêng tư".into();
        evaluations.form.supplier = "Bản nháp".into();
        evaluations.selected_key = Some("old".into());
        evaluations.reset_for_account(&session);
        assert!(
            evaluations.rows.is_empty()
                && evaluations.search.is_empty()
                && evaluations.form.supplier.is_empty()
        );
        assert!(evaluations.selected_key.is_none());
        assert_eq!(evaluations.form.evaluator, session.user.name);
        assert_eq!(evaluations.tier_filter, "Tất cả");
        let mut feedback = CustomerFeedbackView::default();
        feedback.form.content = "Bản nháp".into();
        feedback.selected_key = Some("old".into());
        feedback.reset_for_account(&session);
        assert!(feedback.form.content.is_empty() && feedback.selected_key.is_none());
        assert_eq!(feedback.form.assigned, session.user.name);
    }
}
