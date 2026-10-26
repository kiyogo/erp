use std::time::Duration;
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, EmployeeProposal, EmployeeProposalInput, EmployeeProposalReviewInput,
        EmployeeProposalsResponse,
    },
    models::Session,
};
use egui::{Color32, RichText, Ui};

const CATEGORIES: &[&str] = &[
    "Trang thiết bị & cơ sở vật chất",
    "Chi phí & công tác",
    "Đào tạo & phát triển",
    "Cải tiến quy trình",
    "Phúc lợi & môi trường làm việc",
];
const STATUSES: &[&str] = &["Tất cả", "Chờ duyệt", "Đã duyệt", "Từ chối"];

#[derive(Debug, Default, PartialEq, Eq)]
struct ProposalMetrics {
    total: usize,
    pending: usize,
    approved: usize,
    rejected: usize,
}

pub struct EmployeeProposalsView {
    proposals: Vec<EmployeeProposal>,
    pending_list: Option<ApiTask<EmployeeProposalsResponse>>,
    pending_detail: Option<(String, ApiTask<EmployeeProposal>)>,
    pending_create: Option<ApiTask<EmployeeProposal>>,
    pending_review: Option<(String, ApiTask<EmployeeProposal>)>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    search: String,
    status_filter: String,
    page: usize,
    page_size: usize,
    selected_key: Option<String>,
    selected_proposal: Option<EmployeeProposal>,
    review_note: String,
    create_open: bool,
    title: String,
    proposal_type: String,
    amount: String,
    content: String,
    notice: String,
    error: String,
}

impl Default for EmployeeProposalsView {
    fn default() -> Self {
        Self {
            proposals: Vec::new(),
            pending_list: None,
            pending_detail: None,
            pending_create: None,
            pending_review: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: true,
            search: String::new(),
            status_filter: STATUSES[0].to_owned(),
            page: 0,
            page_size: 8,
            selected_key: None,
            selected_proposal: None,
            review_note: String::new(),
            create_open: false,
            title: String::new(),
            proposal_type: CATEGORIES[0].to_owned(),
            amount: "0".to_owned(),
            content: String::new(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl EmployeeProposalsView {
    fn clear_user_state(&mut self) {
        self.proposals.clear();
        self.pending_list = None;
        self.pending_detail = None;
        self.pending_create = None;
        self.pending_review = None;
        self.last_loaded = None;
        self.needs_reload = true;
        self.search.clear();
        self.status_filter = STATUSES[0].to_owned();
        self.page = 0;
        self.page_size = 8;
        self.selected_key = None;
        self.selected_proposal = None;
        self.review_note.clear();
        self.create_open = false;
        self.title.clear();
        self.proposal_type = CATEGORIES[0].to_owned();
        self.amount = "0".to_owned();
        self.content.clear();
        self.notice.clear();
        self.error.clear();
    }

    pub fn reset(&mut self) {
        self.clear_user_state();
        self.loaded_for = None;
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_create.is_some() || self.pending_review.is_some() {
            self.needs_reload = true;
            return;
        }
        self.pending_list = Some(api.list_employee_proposals_task(session));
        self.needs_reload = false;
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.clear_user_state();
            self.loaded_for = Some(session.user.id.clone());
        }
        if self.needs_reload
            && self.pending_list.is_none()
            && self.pending_create.is_none()
            && self.pending_review.is_none()
        {
            self.request_reload(session, api);
        } else if self.pending_list.is_none()
            && self.pending_create.is_none()
            && self.pending_review.is_none()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(20))
        {
            self.request_reload(session, api);
        }

        if let Some(result) = self.pending_list.as_ref().and_then(ApiClient::poll) {
            self.pending_list = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.proposals = response.data;
                    self.error.clear();
                    if let Some(key) = self.selected_key.as_deref() {
                        self.selected_proposal = self
                            .proposals
                            .iter()
                            .find(|proposal| proposal.key == key)
                            .cloned();
                    }
                }
                Err(error) => self.error = error,
            }
        }

        let detail_result = self
            .pending_detail
            .as_ref()
            .and_then(|(key, task)| ApiClient::poll(task).map(|result| (key.clone(), result)));
        if let Some((key, result)) = detail_result {
            self.pending_detail = None;
            match result {
                Ok(proposal) if self.selected_key.as_deref() == Some(key.as_str()) => {
                    self.selected_proposal = Some(proposal);
                    self.error.clear();
                }
                Ok(_) => {}
                Err(error) => self.error = error,
            }
        }

        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(proposal) => {
                    self.proposals.retain(|item| item.key != proposal.key);
                    self.proposals.insert(0, proposal.clone());
                    self.selected_key = Some(proposal.key.clone());
                    self.selected_proposal = Some(proposal);
                    self.create_open = false;
                    self.title.clear();
                    self.proposal_type = CATEGORIES[0].to_owned();
                    self.amount = "0".to_owned();
                    self.content.clear();
                    self.notice = "Đã lưu kiến nghị trên backend.".to_owned();
                    self.error.clear();
                    self.last_loaded = Some(Instant::now());
                }
                Err(error) => self.error = error,
            }
        }

        let review_result = self
            .pending_review
            .as_ref()
            .and_then(|(key, task)| ApiClient::poll(task).map(|result| (key.clone(), result)));
        if let Some((key, result)) = review_result {
            self.pending_review = None;
            match result {
                Ok(proposal) => {
                    self.proposals.retain(|item| item.key != proposal.key);
                    self.proposals.insert(0, proposal.clone());
                    if self.selected_key.as_deref() == Some(key.as_str()) {
                        self.selected_proposal = Some(proposal.clone());
                    }
                    self.review_note.clear();
                    self.notice = format!(
                        "Đã lưu kết quả {} cho kiến nghị {}.",
                        proposal.status, proposal.code
                    );
                    self.error.clear();
                    self.last_loaded = Some(Instant::now());
                }
                Err(error) => self.error = error,
            }
        }

        if self.pending_list.is_some()
            || self.pending_detail.is_some()
            || self.pending_create.is_some()
            || self.pending_review.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        admin_mode: bool,
    ) {
        self.poll(ctx, session, api);
        let admin_mode = admin_mode && session.user.role == "ADMIN";
        let metrics = proposal_metrics(&self.proposals);
        let known = self.pending_list.is_none() && self.error.is_empty();
        crate::widgets::metrics_grid(
            ui,
            "employee.proposals.metrics",
            &[
                crate::widgets::Metric {
                    label: if admin_mode {
                        "Tổng kiến nghị nhận được"
                    } else {
                        "Tổng kiến nghị"
                    },
                    value: if known {
                        format!("{} hồ sơ", metrics.total)
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "",
                    color: crate::theme::PRIMARY,
                    value_size: 23.0,
                },
                crate::widgets::Metric {
                    label: "Chờ tiếp nhận",
                    value: if known {
                        format!("{} hồ sơ", metrics.pending)
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "",
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 23.0,
                },
                crate::widgets::Metric {
                    label: if admin_mode {
                        "Đã phê duyệt"
                    } else {
                        "Đã được duyệt"
                    },
                    value: if known {
                        format!("{} hồ sơ", metrics.approved)
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 23.0,
                },
                crate::widgets::Metric {
                    label: if admin_mode {
                        "Đã từ chối"
                    } else {
                        "Không được duyệt"
                    },
                    value: if known {
                        format!("{} hồ sơ", metrics.rejected)
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "",
                    color: Color32::from_rgb(220, 38, 38),
                    value_size: 23.0,
                },
            ],
            egui::vec2(18.0, 14.0),
            200.0,
            5.0,
        );
        ui.add_space(16.0);
        ui.horizontal_wrapped(|ui| {
            ui.spacing_mut().item_spacing = egui::vec2(6.0, 10.0);
            for (i, label) in ["Tất cả", "Chờ tiếp nhận", "Đã duyệt", "Từ chối"]
                .iter()
                .enumerate()
            {
                let active = self.status_filter == STATUSES[i];
                if ui
                    .add(
                        egui::Button::new(RichText::new(*label).size(13.0).color(if active {
                            crate::theme::PRIMARY_ACTIVE
                        } else {
                            Color32::from_rgb(71, 85, 105)
                        }))
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
                        )),
                    )
                    .clicked()
                {
                    self.status_filter = STATUSES[i].into();
                    self.page = 0;
                }
            }
            let width = ui
                .available_width()
                .min(if admin_mode { 260.0 } else { 250.0 })
                .max(120.0);
            let (rect, _) = ui.allocate_exact_size(egui::vec2(width, 32.0), egui::Sense::hover());
            if crate::widgets::search_input(
                ui,
                rect,
                &mut self.search,
                if admin_mode {
                    "Mã, nhân viên, nội dung..."
                } else {
                    "Mã hoặc nội dung kiến nghị..."
                },
            )
            .changed()
            {
                self.page = 0;
            }
            if ui
                .add_enabled(self.pending_list.is_none(), egui::Button::new("Làm mới"))
                .clicked()
            {
                self.needs_reload = true;
            }
            if !admin_mode
                && ui
                    .add_enabled(
                        self.pending_create.is_none(),
                        egui::Button::new("+ Gửi kiến nghị").fill(crate::theme::PRIMARY),
                    )
                    .clicked()
            {
                self.create_open = true;
            }
        });
        if !self.notice.is_empty() {
            ui.colored_label(Color32::DARK_GREEN, &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        if self.pending_list.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải kiến nghị...");
            });
        }
        let filtered = self
            .proposals
            .iter()
            .filter(|p| proposal_matches(p, &self.search, &self.status_filter))
            .collect::<Vec<_>>();
        self.page_size = self.page_size.max(8);
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let page = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        let mut columns = vec![
            crate::widgets::TableColumn {
                title: if admin_mode {
                    "Mã hồ sơ"
                } else {
                    "Mã kiến nghị"
                },
                width: 165.0,
            },
            crate::widgets::TableColumn {
                title: "Nội dung kiến nghị",
                width: (ui.available_width() - if admin_mode { 892.0 } else { 650.0 }).max(250.0),
            },
        ];
        if admin_mode {
            columns.push(crate::widgets::TableColumn {
                title: "Nhân viên gửi",
                width: 180.0,
            });
        }
        columns.extend([
            crate::widgets::TableColumn {
                title: "Dự toán",
                width: 135.0,
            },
            crate::widgets::TableColumn {
                title: "Ngày gửi",
                width: if admin_mode { 112.0 } else { 115.0 },
            },
            crate::widgets::TableColumn {
                title: "Trạng thái",
                width: 125.0,
            },
            crate::widgets::TableColumn {
                title: "Thao tác",
                width: if admin_mode { 175.0 } else { 110.0 },
            },
        ]);
        let mut open_detail = None;
        let mut quick_review = None;
        ui.add_space(12.0);
        crate::widgets::table(
            ui,
            "employee.proposals.table",
            &columns,
            page.len(),
            |ui, row, col| {
                let p = page[row];
                let col = if !admin_mode && col >= 2 {
                    col + 1
                } else {
                    col
                };
                match col {
                    0 => {
                        ui.label(
                            RichText::new(&p.code)
                                .monospace()
                                .strong()
                                .color(crate::theme::PRIMARY),
                        );
                    }
                    1 => {
                        ui.label(RichText::new(&p.title).strong());
                        ui.label(
                            RichText::new(&p.proposal_type)
                                .size(12.0)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    2 => {
                        ui.label(RichText::new(&p.employee_name).strong());
                        ui.label(
                            RichText::new(&p.employee_code)
                                .size(11.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    3 => {
                        ui.label(
                            RichText::new(format_amount(p.amount))
                                .size(12.5)
                                .strong()
                                .color(Color32::from_rgb(22, 163, 74)),
                        );
                    }
                    4 => {
                        ui.label(
                            RichText::new(&p.date)
                                .size(12.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    5 => {
                        crate::widgets::tag(
                            ui,
                            &p.status,
                            match p.status.as_str() {
                                "Đã duyệt" => crate::widgets::TagTone::Success,
                                "Từ chối" => crate::widgets::TagTone::Error,
                                _ => crate::widgets::TagTone::Warning,
                            },
                        );
                    }
                    _ => {
                        ui.horizontal_wrapped(|ui| {
                            if ui.button("Chi tiết").clicked() {
                                open_detail = Some(p.key.clone());
                            }
                            if admin_mode && p.status == "Chờ duyệt" {
                                for (label, status, note) in [
                                    ("Duyệt", "Đã duyệt", "Phê duyệt nhanh"),
                                    ("Từ chối", "Từ chối", "Từ chối nhanh"),
                                ] {
                                    if ui
                                        .add_enabled(
                                            self.pending_review.is_none(),
                                            egui::Button::new(label),
                                        )
                                        .clicked()
                                    {
                                        quick_review = Some((
                                            p.key.clone(),
                                            status.to_owned(),
                                            note.to_owned(),
                                        ));
                                    }
                                }
                            }
                        });
                    }
                }
            },
        );
        ui.add_space(16.0);
        crate::widgets::pagination(
            ui,
            "employee.proposals.pages",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
        if let Some(key) = open_detail {
            self.selected_key = Some(key.clone());
            self.selected_proposal = self.proposals.iter().find(|p| p.key == key).cloned();
            self.review_note.clear();
            self.pending_detail =
                Some((key.clone(), api.get_employee_proposal_task(session, &key)));
            self.error.clear();
        }
        if let Some((key, status, note)) = quick_review {
            self.start_review(session, api, key, status, note);
        }
        if let Some(proposal) = self.selected_proposal.clone() {
            let (_, closed) = crate::widgets::drawer(
                ctx,
                "employee.proposals.detail",
                if admin_mode {
                    "Tiếp nhận kiến nghị nhân viên"
                } else {
                    "Chi tiết kiến nghị"
                },
                if admin_mode { 600.0 } else { 560.0 },
                |ui| self.render_detail(ui, ctx, session, api, admin_mode, proposal),
            );
            if closed {
                self.selected_key = None;
                self.selected_proposal = None;
                self.pending_detail = None;
                self.review_note.clear();
            }
        }
        if self.create_open && !admin_mode {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "employee.proposals.create",
                "Gửi kiến nghị mới",
                580.0,
                self.pending_create.is_some(),
                |ui| self.render_create_form(ui, ctx, session, api),
            );
            if closed {
                self.create_open = false;
            }
        }
    }

    fn render_create_form(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
    ) {
        ui.add_space(14.0);
        crate::widgets::form_input(
            ui,
            "proposal.title",
            "Tiêu đề kiến nghị",
            true,
            &mut self.title,
            "Tóm tắt ngắn gọn nội dung cần đề xuất",
            false,
        );
        crate::widgets::form_select(
            ui,
            "proposal.type",
            "Hạng mục",
            true,
            &mut self.proposal_type,
            CATEGORIES,
        );
        crate::widgets::form_input(
            ui,
            "proposal.amount",
            "Dự toán kinh phí (VNĐ)",
            false,
            &mut self.amount,
            "Để trống nếu không phát sinh kinh phí",
            false,
        );
        crate::widgets::form_textarea(
            ui,
            "proposal.content",
            "Nội dung và hiệu quả mong đợi",
            true,
            &mut self.content,
            "Mô tả rõ hiện trạng, đề xuất và lợi ích mang lại...",
            5,
        );
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        crate::widgets::action_row(ui, |ui| {
            let enabled = self.pending_create.is_none();
            if ui
                .add_enabled(
                    enabled,
                    egui::Button::new("Gửi kiến nghị").fill(crate::theme::PRIMARY),
                )
                .clicked()
            {
                match validate_form(
                    &self.title,
                    &self.proposal_type,
                    &self.amount,
                    &self.content,
                ) {
                    Ok(amount) => {
                        let input = EmployeeProposalInput {
                            title: self.title.trim().into(),
                            proposal_type: self.proposal_type.clone(),
                            amount,
                            content: self.content.trim().into(),
                        };
                        self.pending_create =
                            Some(api.create_employee_proposal_task(session, &input));
                        self.error.clear();
                    }
                    Err(error) => self.error = error,
                }
            }
            if ui.add_enabled(enabled, egui::Button::new("Hủy")).clicked() {
                self.create_open = false;
            }
        });
        if self.pending_create.is_some() {
            ui.spinner();
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    fn render_detail(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        admin_mode: bool,
        proposal: EmployeeProposal,
    ) {
        ui.spacing_mut().item_spacing.y = 15.0;
        if self.pending_detail.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải chi tiết kiến nghị...");
            });
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        egui::Frame::none()
            .fill(Color32::from_rgb(248, 250, 252))
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0)
            .inner_margin(16.0)
            .show(ui, |ui| {
                ui.colored_label(crate::theme::PRIMARY, &proposal.code);
                ui.label(RichText::new(&proposal.title).size(17.0).strong());
                ui.label(if admin_mode {
                    format!(
                        "{} · {} · Gửi ngày {}",
                        proposal.employee_name, proposal.employee_code, proposal.date
                    )
                } else {
                    format!("{} · Gửi ngày {}", proposal.proposal_type, proposal.date)
                });
            });
        egui::Frame::group(ui.style())
            .inner_margin(14.0)
            .show(ui, |ui| {
                ui.strong(&proposal.proposal_type);
                ui.colored_label(
                    Color32::from_rgb(22, 163, 74),
                    format!("Dự toán: {}", format_amount(proposal.amount)),
                );
                ui.label(
                    RichText::new("Nội dung nhân viên gửi")
                        .size(12.0)
                        .color(Color32::from_rgb(100, 116, 139)),
                );
                ui.label(&proposal.content);
            });
        let mut review_action = None;
        egui::Frame::group(ui.style())
            .inner_margin(14.0)
            .show(ui, |ui| {
                if admin_mode && proposal.status == "Chờ duyệt" {
                    crate::widgets::form_textarea(
                        ui,
                        "proposal.review",
                        "Phản hồi tiếp nhận",
                        false,
                        &mut self.review_note,
                        "Nêu quyết định, điều kiện thực hiện hoặc lý do từ chối...",
                        4,
                    );
                    ui.horizontal_wrapped(|ui| {
                        for (label, status) in [("Phê duyệt", "Đã duyệt"), ("Từ chối", "Từ chối")]
                        {
                            if ui
                                .add_enabled(
                                    self.pending_review.is_none() && self.pending_detail.is_none(),
                                    egui::Button::new(label),
                                )
                                .clicked()
                            {
                                review_action = Some(status);
                            }
                        }
                        if self.pending_review.is_some() {
                            ui.spinner();
                            ui.label("Đang lưu kết quả...");
                        }
                    });
                } else {
                    ui.strong(if admin_mode {
                        "Kết quả đã gửi"
                    } else {
                        "Kết quả tiếp nhận"
                    });
                    crate::widgets::tag(
                        ui,
                        &proposal.status,
                        match proposal.status.as_str() {
                            "Đã duyệt" => crate::widgets::TagTone::Success,
                            "Từ chối" => crate::widgets::TagTone::Error,
                            _ => crate::widgets::TagTone::Warning,
                        },
                    );
                    if !proposal.approver.is_empty() {
                        ui.label(format!("Người xử lý: {}", proposal.approver));
                    }
                    if !proposal.review_note.is_empty() {
                        ui.label(&proposal.review_note);
                    }
                    if proposal.status == "Chờ duyệt" {
                        ui.colored_label(
                            status_color(&proposal.status),
                            "Kiến nghị đã được gửi và đang chờ quản trị tiếp nhận.",
                        );
                    }
                }
            });
        if let Some(status) = review_action {
            self.start_review(
                session,
                api,
                proposal.key,
                status.into(),
                self.review_note.clone(),
            );
        }
        if self.pending_detail.is_some() || self.pending_review.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    fn start_review(
        &mut self,
        session: &Session,
        api: &ApiClient,
        key: String,
        status: String,
        review_note: String,
    ) {
        if self.pending_review.is_some() {
            return;
        }
        let input = EmployeeProposalReviewInput {
            status,
            review_note,
        };
        self.pending_review = Some((
            key.clone(),
            api.review_employee_proposal_task(session, &key, &input),
        ));
        self.error.clear();
    }
}

fn proposal_metrics(proposals: &[EmployeeProposal]) -> ProposalMetrics {
    let mut metrics = ProposalMetrics {
        total: proposals.len(),
        ..ProposalMetrics::default()
    };
    for proposal in proposals {
        match proposal.status.as_str() {
            "Chờ duyệt" => metrics.pending += 1,
            "Đã duyệt" => metrics.approved += 1,
            "Từ chối" => metrics.rejected += 1,
            _ => {}
        }
    }
    metrics
}

fn proposal_matches(proposal: &EmployeeProposal, search: &str, status: &str) -> bool {
    if status != "Tất cả" && proposal.status != status {
        return false;
    }
    let search = search.trim().to_lowercase();
    search.is_empty()
        || [
            proposal.code.as_str(),
            proposal.title.as_str(),
            proposal.proposal_type.as_str(),
            proposal.employee_name.as_str(),
            proposal.employee_code.as_str(),
        ]
        .iter()
        .any(|value| value.to_lowercase().contains(&search))
}

fn validate_form(
    title: &str,
    proposal_type: &str,
    amount: &str,
    content: &str,
) -> Result<i64, String> {
    if title.trim().is_empty() || title.trim().encode_utf16().count() > 500 {
        return Err("Tiêu đề phải có từ 1 đến 500 ký tự.".to_owned());
    }
    if !CATEGORIES.contains(&proposal_type) {
        return Err("Hạng mục kiến nghị không hợp lệ.".to_owned());
    }
    if content.trim().is_empty() || content.trim().encode_utf16().count() > 4_000 {
        return Err("Nội dung phải có từ 1 đến 4000 ký tự.".to_owned());
    }
    let amount = parse_grouped_integer(amount)?;
    if !(0..=1_000_000_000_000).contains(&amount) {
        return Err("Dự toán phải nằm trong khoảng 0–1.000.000.000.000 VND.".to_owned());
    }
    Ok(amount)
}

fn parse_grouped_integer(value: &str) -> Result<i64, String> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(0);
    }
    let separator = if value.contains('.') {
        Some('.')
    } else if value.contains(',') {
        Some(',')
    } else {
        None
    };
    let normalized = if let Some(separator) = separator {
        let groups = value.split(separator).collect::<Vec<_>>();
        let first_is_valid = groups.first().is_some_and(|group| {
            (1..=3).contains(&group.len()) && group.bytes().all(|b| b.is_ascii_digit())
        });
        if !first_is_valid
            || groups
                .iter()
                .skip(1)
                .any(|group| group.len() != 3 || !group.bytes().all(|b| b.is_ascii_digit()))
        {
            return Err("Dự toán phải là số nguyên không âm hợp lệ.".to_owned());
        }
        groups.concat()
    } else {
        if !value.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err("Dự toán phải là số nguyên không âm hợp lệ.".to_owned());
        }
        value.to_owned()
    };
    normalized
        .parse::<i64>()
        .map_err(|_| "Dự toán phải là số nguyên không âm hợp lệ.".to_owned())
}

fn status_color(status: &str) -> Color32 {
    match status {
        "Đã duyệt" => Color32::from_rgb(22, 163, 74),
        "Từ chối" => Color32::from_rgb(220, 38, 38),
        _ => Color32::from_rgb(217, 119, 6),
    }
}

fn format_amount(amount: i64) -> String {
    if amount == 0 {
        return "Không yêu cầu".to_owned();
    }
    let digits = amount.to_string();
    let mut grouped = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(digit);
    }
    format!("{grouped} ₫")
}

#[cfg(test)]
mod tests {

    #[test]
    fn legacy_form_footer_fits_mobile_tablet_and_desktop() {
        let mut view = EmployeeProposalsView::default();
        crate::views::hr_training::assert_form_fits(|ui, session, api| {
            view.render_create_form(ui, &ui.ctx().clone(), session, api)
        });
    }
    use super::{
        CATEGORIES, EmployeeProposalsView, ProposalMetrics, format_amount, proposal_matches,
        proposal_metrics, validate_form,
    };
    use crate::api::EmployeeProposal;

    fn sample(status: &str, amount: i64) -> EmployeeProposal {
        EmployeeProposal {
            key: "proposal-1".to_owned(),
            code: "KNG-20261008-A1B2C3D4".to_owned(),
            title: "Cải tiến quy trình".to_owned(),
            proposal_type: CATEGORIES[3].to_owned(),
            amount,
            content: "Chuẩn hóa luồng tiếp nhận.".to_owned(),
            submitter_id: "user-1".to_owned(),
            employee_name: "Nguyễn An".to_owned(),
            employee_code: "NV-1001".to_owned(),
            status: status.to_owned(),
            approver: String::new(),
            review_note: String::new(),
            reviewed_at: String::new(),
            date: "2026-10-08".to_owned(),
            created_at: "2026-10-08T09:00:00Z".to_owned(),
            updated_at: "2026-10-08T09:00:00Z".to_owned(),
        }
    }

    #[test]
    fn proposal_metrics_and_search_use_loaded_records() {
        let proposals = [
            sample("Chờ duyệt", 1_250_000),
            sample("Đã duyệt", 0),
            sample("Từ chối", 5_000),
        ];
        assert_eq!(
            proposal_metrics(&proposals),
            ProposalMetrics {
                total: 3,
                pending: 1,
                approved: 1,
                rejected: 1,
            }
        );
        assert!(proposal_matches(&proposals[0], "nguyễn", "Tất cả"));
        assert!(proposal_matches(&proposals[0], "cải tiến", "Chờ duyệt"));
        assert!(!proposal_matches(&proposals[0], "không có", "Tất cả"));
        assert!(!proposal_matches(&proposals[0], "cải tiến", "Đã duyệt"));
    }

    #[test]
    fn proposal_form_validation_and_amount_format_match_contract() {
        assert_eq!(format_amount(1_250_000), "1.250.000 ₫");
        assert_eq!(format_amount(0), "Không yêu cầu");
        assert_eq!(
            validate_form("Tiêu đề", CATEGORIES[3], "1.250.000", "Nội dung"),
            Ok(1_250_000)
        );
        assert!(validate_form("Tiêu đề", CATEGORIES[3], "1,5", "Nội dung").is_err());
        assert!(validate_form("", CATEGORIES[3], "0", "Nội dung").is_err());
        assert!(validate_form("Tiêu đề", "Không hợp lệ", "0", "Nội dung").is_err());
        assert!(validate_form("Tiêu đề", CATEGORIES[3], "-1", "Nội dung").is_err());
    }

    #[test]
    fn proposal_view_starts_empty_and_clears_private_state_on_account_switch() {
        let mut view = EmployeeProposalsView::default();
        assert!(view.proposals.is_empty());
        view.search = "private search".to_owned();
        view.title = "Private draft".to_owned();
        view.content = "Private details".to_owned();
        view.review_note = "Private review".to_owned();
        view.proposals.push(sample("Chờ duyệt", 100));
        view.selected_proposal = Some(sample("Chờ duyệt", 100));

        view.clear_user_state();

        assert!(view.proposals.is_empty());
        assert!(view.selected_proposal.is_none());
        assert!(view.search.is_empty());
        assert!(view.title.is_empty());
        assert!(view.content.is_empty());
        assert!(view.review_note.is_empty());
        assert!(view.needs_reload);
    }
}
