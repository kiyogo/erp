use std::time::Duration;

use chrono::Utc;
use egui::{Color32, Context, RichText, Ui};

use crate::{
    api::{ApiClient, ApiTask, CreateHrRewardInput, HrReward, HrRewardResponse, HrRewardsResponse},
    models::Session,
};

const PAGE_SIZE: usize = 8;
const PENDING: &str = "Chờ duyệt";
const APPROVED: &str = "Đã ký quyết định";
const AWARDED: &str = "Đã trao giải";
const REWARD_TYPES: [&str; 4] = [
    "Tiền mặt & Cúp pha lê",
    "Chuyến du lịch nghỉ dưỡng 5 sao",
    "Cổ phần thưởng ESOP",
    "Bằng khen Ban Giám Đốc",
];

#[derive(Default)]
pub struct HrRewardsView {
    rows: Vec<HrReward>,
    list_task: Option<ApiTask<HrRewardsResponse>>,
    create_task: Option<ApiTask<HrRewardResponse>>,
    transition_task: Option<ApiTask<HrRewardResponse>>,
    transition_kind: Option<RewardTransition>,
    loaded_for: Option<String>,
    loading: bool,
    needs_reload: bool,
    form_open: bool,
    form: RewardForm,
    search: String,
    status_filter: String,
    selected_key: Option<String>,
    confirm_action: Option<(String, RewardTransition)>,
    page: usize,
    page_size: usize,
    error: String,
    form_error: String,
    notice: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RewardTransition {
    Approve,
    Award,
}

#[derive(Clone)]
struct RewardForm {
    reward_code: String,
    decision_no: String,
    date: String,
    recipient_type: String,
    employee_code: String,
    team_name: String,
    department: String,
    title: String,
    reward_type: String,
    reward_value: String,
    achievement_summary: String,
}

impl Default for RewardForm {
    fn default() -> Self {
        Self {
            reward_code: String::new(),
            decision_no: String::new(),
            date: Utc::now().date_naive().format("%Y-%m-%d").to_string(),
            recipient_type: "employee".to_owned(),
            employee_code: String::new(),
            team_name: String::new(),
            department: String::new(),
            title: String::new(),
            reward_type: REWARD_TYPES[0].to_owned(),
            reward_value: "0".to_owned(),
            achievement_summary: String::new(),
        }
    }
}

impl HrRewardsView {
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
            && self.transition_task.is_none()
        {
            self.loading = true;
            self.error.clear();
            self.list_task = Some(api.list_hr_rewards_task(session));
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
                    self.notice = format!("Đã lập hồ sơ {}.", response.reward.reward_code);
                    self.selected_key = Some(response.reward.key);
                    self.form_open = false;
                    self.form = RewardForm::default();
                    self.form_error.clear();
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }
        if let Some(result) = self.transition_task.as_ref().and_then(ApiClient::poll) {
            self.transition_task = None;
            match result {
                Ok(response) => {
                    self.notice = match self.transition_kind.take() {
                        Some(RewardTransition::Approve) => {
                            format!("Đã ghi nhận duyệt {}.", response.reward.reward_code)
                        }
                        Some(RewardTransition::Award) => {
                            format!("Đã ghi nhận trao thưởng {}.", response.reward.reward_code)
                        }
                        None => "Đã cập nhật hồ sơ khen thưởng.".to_owned(),
                    };
                    self.selected_key = Some(response.reward.key);
                    self.confirm_action = None;
                    self.needs_reload = true;
                }
                Err(error) => {
                    self.transition_kind = None;
                    self.error = error;
                }
            }
        }
        if self.list_task.is_some() || self.create_task.is_some() || self.transition_task.is_some()
        {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên được xem và quản lý hồ sơ khen thưởng.");
            return;
        }
        self.poll(ui, session, api);
        let known = !self.loading && self.error.is_empty();
        let total = self
            .rows
            .iter()
            .fold(0_i64, |sum, r| sum.saturating_add(r.reward_value));
        let awarded = self
            .rows
            .iter()
            .filter(|r| {
                r.status == AWARDED
                    && !r.approval_recorded_at.trim().is_empty()
                    && !r.award_recorded_at.trim().is_empty()
            })
            .count();
        crate::widgets::metrics(
            ui,
            "hr.rewards.metrics",
            &[
                crate::widgets::Metric {
                    label: "Tổng quỹ vinh danh & khen thưởng",
                    value: if known {
                        format_money(total)
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Tổng giá trị quy đổi khai báo",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Cá nhân & Tập thể được vinh danh",
                    value: if known {
                        format!("{} Quyết định", self.rows.len())
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Theo hồ sơ khen thưởng",
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Tiến độ trao thưởng vinh danh",
                    value: if known {
                        format!("{awarded} / {} Đã ghi nhận", self.rows.len())
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Có dấu vết ghi nhận trên máy chủ",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Chỉ số hài lòng gắn kết nhân sự (eNPS)",
                    value: "Chưa xác định".into(),
                    detail: "Chưa có API kết quả khảo sát",
                    color: Color32::from_rgb(124, 58, 237),
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let tabs = ["Tất cả vinh danh", "Đã trao giải", "Chờ trao giải"];
        let selected = tabs
            .iter()
            .position(|s| *s == self.status_filter)
            .unwrap_or(0);
        let toolbar = super::hr_training::collection_toolbar(
            ui,
            "hr.rewards",
            &tabs,
            selected,
            &mut self.search,
            "Tìm theo mã, tên nhân sự, danh hiệu...",
            "+ Quyết định khen thưởng",
            "Xuất Sổ Vàng",
            "Chưa có API xuất sổ vàng.",
        );
        if let Some(i) = toolbar.selected {
            self.status_filter = if i == 0 {
                String::new()
            } else {
                tabs[i].into()
            };
            self.page = 0;
        }
        if toolbar.search_changed {
            self.page = 0;
        }
        if toolbar.reload_clicked {
            self.needs_reload = true;
        }
        if toolbar.create_clicked && self.create_task.is_none() && self.transition_task.is_none() {
            self.form = RewardForm::default();
            self.form_error.clear();
            self.form_open = true;
        }
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        if self.loading {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải hồ sơ khen thưởng...");
            });
        }
        let needle = self.search.trim().to_lowercase();
        let visible = self
            .rows
            .iter()
            .filter(|r| {
                reward_status_matches(&self.status_filter, &r.status)
                    && (needle.is_empty()
                        || [
                            &r.reward_code,
                            &r.decision_no,
                            &r.employee_name,
                            &r.emp_code,
                            &r.department,
                            &r.title,
                        ]
                        .iter()
                        .any(|v| v.to_lowercase().contains(&needle)))
            })
            .collect::<Vec<_>>();
        self.page_size = self.page_size.max(PAGE_SIZE);
        self.page = self
            .page
            .min(visible.len().div_ceil(self.page_size).max(1) - 1);
        let page = visible
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        ui.add_space(12.0);
        let flex = ((ui.available_width() - 600.0) / 2.0).max(260.0);
        let columns = [
            crate::widgets::TableColumn {
                title: "Mã & Nhân sự được vinh danh",
                width: flex,
            },
            crate::widgets::TableColumn {
                title: "Danh hiệu vinh danh & Quyết định",
                width: flex,
            },
            crate::widgets::TableColumn {
                title: "Hình thức & Giá trị thưởng",
                width: 230.0,
            },
            crate::widgets::TableColumn {
                title: "Trạng thái",
                width: 170.0,
            },
            crate::widgets::TableColumn {
                title: "Thao tác",
                width: 200.0,
            },
        ];
        crate::widgets::table(
            ui,
            "hr.rewards.table",
            &columns,
            page.len(),
            |ui, row, col| {
                let r = page[row];
                match col {
                    0 => {
                        ui.label(RichText::new(&r.employee_name).size(13.5).strong());
                        ui.label(
                            RichText::new(format!("Mã: {} · {}", r.reward_code, r.department))
                                .size(11.5)
                                .color(crate::theme::PRIMARY),
                        );
                    }
                    1 => {
                        ui.label(
                            RichText::new(&r.title)
                                .size(13.0)
                                .strong()
                                .color(Color32::from_rgb(180, 83, 9)),
                        );
                        ui.label(
                            RichText::new(format!("{} · Ngày ban hành: {}", r.decision_no, r.date))
                                .size(11.5)
                                .color(Color32::from_rgb(37, 99, 235)),
                        );
                    }
                    2 => {
                        ui.label(
                            RichText::new(format_money(r.reward_value))
                                .size(13.0)
                                .strong()
                                .color(Color32::from_rgb(22, 163, 74)),
                        );
                        ui.label(
                            RichText::new(&r.reward_type)
                                .size(11.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    3 => {
                        let label = status_label(r);
                        let unverified = label.starts_with("Chưa xác minh");
                        crate::widgets::tag(
                            ui,
                            if unverified { &r.status } else { &label },
                            if unverified {
                                crate::widgets::TagTone::Warning
                            } else {
                                match r.status.as_str() {
                                    PENDING => crate::widgets::TagTone::Warning,
                                    APPROVED => crate::widgets::TagTone::Processing,
                                    AWARDED => crate::widgets::TagTone::Success,
                                    _ => crate::widgets::TagTone::Neutral,
                                }
                            },
                        );
                        if unverified {
                            ui.label(
                                RichText::new("Chưa xác minh")
                                    .size(11.5)
                                    .color(Color32::from_rgb(146, 64, 14)),
                            );
                        }
                    }
                    _ => {
                        ui.horizontal_wrapped(|ui| {
                            if ui.button("Bằng khen").clicked() {
                                self.selected_key = Some(r.key.clone());
                            }
                            let action = if r.status == PENDING {
                                Some((RewardTransition::Approve, "Duyệt"))
                            } else if r.status == APPROVED
                                && !r.approval_recorded_at.trim().is_empty()
                            {
                                Some((RewardTransition::Award, "Trao giải"))
                            } else {
                                None
                            };
                            if let Some((action, label)) = action {
                                if ui
                                    .add_enabled(
                                        self.transition_task.is_none(),
                                        egui::Button::new(label),
                                    )
                                    .clicked()
                                {
                                    self.selected_key = Some(r.key.clone());
                                    self.confirm_action = Some((r.key.clone(), action));
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
            "hr.rewards.pages",
            &mut self.page,
            visible.len(),
            &mut self.page_size,
        );
        if let Some(reward) = self
            .rows
            .iter()
            .find(|r| self.selected_key.as_deref() == Some(&r.key))
            .cloned()
        {
            let (_, closed) = crate::widgets::drawer(
                ctx,
                "hr.rewards.detail",
                "Hồ Sơ Quyết Định Vinh Danh & Bằng Khen Danh Dự",
                580.0,
                |ui| {
                    self.render_detail(ui, session, api, &reward);
                    ui.add_enabled(false, egui::Button::new("In Bằng Khen (PDF)"))
                        .on_disabled_hover_text("Chưa có API tạo bằng khen PDF.");
                    ui.label("Ghi nhận nghiệp vụ không phải chữ ký số hoặc chứng từ thanh toán.");
                },
            );
            if closed && self.transition_task.is_none() {
                self.selected_key = None;
                self.confirm_action = None;
            }
        }
        if self.form_open {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "hr.rewards.create",
                "Ban Hành Quyết Định Vinh Danh & Khen Thưởng Mới",
                640.0,
                self.create_task.is_some(),
                |ui| self.render_form(ui, session, api),
            );
            if closed {
                self.form_open = false;
            }
        }
    }

    fn render_detail(
        &mut self,
        ui: &mut Ui,
        session: &Session,
        api: &ApiClient,
        reward: &HrReward,
    ) {
        ui.spacing_mut().item_spacing.y = 16.0;
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        egui::Frame::none()
            .fill(Color32::from_rgb(255, 251, 235))
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(252, 211, 77)))
            .rounding(8.0)
            .inner_margin(18.0)
            .show(ui, |ui| {
                ui.colored_label(Color32::from_rgb(180, 83, 9), &reward.decision_no);
                ui.label(
                    RichText::new(&reward.title)
                        .size(18.0)
                        .strong()
                        .color(Color32::from_rgb(120, 53, 15)),
                );
                ui.label(format!(
                    "Vinh danh: {} ({})",
                    reward.employee_name, reward.department
                ));
            });
        ui.label(format!(
            "Quyết định {} · {} · {}",
            reward.decision_no,
            reward.date,
            status_label(reward)
        ));
        let recipient_type = recipient_label(reward);
        ui.label(format!(
            "{recipient_type}: {} · Mã {} · {}",
            reward.employee_name,
            present(&reward.emp_code),
            reward.department
        ));
        ui.label(format!(
            "Hình thức: {} · Giá trị quy đổi khai báo: {}",
            reward.reward_type,
            format_money(reward.reward_value)
        ));
        ui.label(format!(
            "Thành tích: {}",
            present(&reward.achievement_summary)
        ));
        ui.label(format!(
            "Người lập: {} · Tạo lúc: {}",
            present(&reward.signer_name),
            present(&reward.created_at)
        ));
        if !reward.approval_recorded_at.is_empty() {
            ui.label(format!(
                "Ghi nhận duyệt bởi tài khoản {} lúc {} (không phải chữ ký số).",
                present(&reward.approval_recorded_by),
                reward.approval_recorded_at
            ));
        }
        if !reward.award_recorded_at.is_empty() {
            ui.label(format!(
                "Ghi nhận trao thưởng bởi tài khoản {} lúc {} (không xác nhận thanh toán/đã nhận).",
                present(&reward.award_recorded_by),
                reward.award_recorded_at
            ));
        }

        let can_approve = reward.status == PENDING;
        let can_record_award =
            reward.status == APPROVED && !reward.approval_recorded_at.trim().is_empty();
        if can_approve || can_record_award {
            ui.horizontal(|ui| {
                let (action, label) = if can_approve {
                    (RewardTransition::Approve, "Ghi nhận đã duyệt")
                } else {
                    (RewardTransition::Award, "Ghi nhận đã trao thưởng")
                };
                if ui
                    .add_enabled(self.transition_task.is_none(), egui::Button::new(label))
                    .clicked()
                {
                    self.confirm_action = Some((reward.key.clone(), action));
                }
            });
        } else if reward.status == APPROVED {
            ui.colored_label(
                Color32::from_rgb(146, 64, 14),
                "Hồ sơ cũ ghi đã duyệt nhưng thiếu actor/thời điểm; cần rà soát thủ công trước khi tiếp tục.",
            );
        } else if reward.status == AWARDED && reward.award_recorded_at.trim().is_empty() {
            ui.colored_label(
                Color32::from_rgb(146, 64, 14),
                "Trạng thái trao thưởng kế thừa chưa có dấu vết xác minh; không tính là đã xác nhận.",
            );
        }
        if let Some((key, action)) = self.confirm_action.clone() {
            if key == reward.key {
                egui::Frame::group(ui.style()).show(ui, |ui| {
                    match action {
                        RewardTransition::Approve => {
                            ui.label("Xác nhận ghi nhận quyết định này đã được duyệt. Hệ thống lưu tài khoản và thời điểm, không tạo chữ ký số.");
                        }
                        RewardTransition::Award => {
                            ui.label("Xác nhận ghi nhận nghiệp vụ đã trao thưởng. Thao tác này không phải chứng từ thanh toán hoặc xác nhận người nhận đã nhận thưởng.");
                        }
                    }
                    ui.horizontal(|ui| {
                        if ui
                            .add_enabled(
                                self.transition_task.is_none(),
                                egui::Button::new("Xác nhận ghi nhận"),
                            )
                            .clicked()
                        {
                            self.transition_kind = Some(action);
                            self.transition_task = Some(match action {
                                RewardTransition::Approve => {
                                    api.approve_hr_reward_task(session, &key)
                                }
                                RewardTransition::Award => {
                                    api.record_hr_reward_award_task(session, &key)
                                }
                            });
                            self.error.clear();
                        }
                        if ui
                            .add_enabled(self.transition_task.is_none(), egui::Button::new("Hủy"))
                            .clicked()
                        {
                            self.confirm_action = None;
                        }
                    });
                });
            }
        }
    }

    fn render_form(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        ui.add_space(14.0);
        let cols = if ui.available_width() < 480.0 { 1 } else { 3 };
        ui.columns(cols, |c| {
            crate::widgets::form_input(
                &mut c[0],
                "reward.code",
                "Mã khen thưởng",
                true,
                &mut self.form.reward_code,
                "",
                false,
            );
            crate::widgets::form_input(
                &mut c[if cols == 1 { 0 } else { 1 }],
                "reward.decision",
                "Số quyết định BGD",
                true,
                &mut self.form.decision_no,
                "",
                false,
            );
            crate::widgets::form_date(
                &mut c[cols - 1],
                "reward.date",
                "Ngày quyết định",
                true,
                &mut self.form.date,
            );
        });
        crate::widgets::form_field(
            ui,
            "reward.recipient",
            "Đối tượng nhận",
            true,
            |ui| {
                crate::widgets::combo_box("reward.recipient.select")
                    .width(ui.available_width())
                    .selected_text(if self.form.recipient_type == "team" {
                        "Tập thể"
                    } else {
                        "Nhân viên"
                    })
                    .show_ui(ui, |ui| {
                        ui.selectable_value(
                            &mut self.form.recipient_type,
                            "employee".into(),
                            "Nhân viên",
                        );
                        ui.selectable_value(
                            &mut self.form.recipient_type,
                            "team".into(),
                            "Tập thể",
                        );
                    });
            },
        );
        if self.form.recipient_type == "employee" {
            crate::widgets::form_input(
                ui,
                "reward.employee",
                "Mã nhân viên HR",
                true,
                &mut self.form.employee_code,
                "Tra cứu tên và phòng ban từ hồ sơ HR",
                false,
            );
        } else {
            let cols = if cols == 1 { 1 } else { 2 };
            ui.columns(cols, |c| {
                crate::widgets::form_input(
                    &mut c[0],
                    "reward.team",
                    "Tên tập thể",
                    true,
                    &mut self.form.team_name,
                    "",
                    false,
                );
                crate::widgets::form_input(
                    &mut c[cols - 1],
                    "reward.department",
                    "Phòng ban trực thuộc",
                    true,
                    &mut self.form.department,
                    "",
                    false,
                );
            });
        }
        crate::widgets::form_input(
            ui,
            "reward.title",
            "Danh hiệu vinh danh",
            true,
            &mut self.form.title,
            "",
            false,
        );
        let cols = if cols == 1 { 1 } else { 2 };
        ui.columns(cols, |c| {
            crate::widgets::form_select(
                &mut c[0],
                "reward.type",
                "Hình thức khen thưởng",
                true,
                &mut self.form.reward_type,
                &REWARD_TYPES,
            );
            crate::widgets::form_input(
                &mut c[cols - 1],
                "reward.value",
                "Giá trị phần thưởng (VNĐ)",
                true,
                &mut self.form.reward_value,
                "",
                false,
            );
        });
        crate::widgets::form_textarea(
            ui,
            "reward.achievement",
            "Tóm tắt thành tích đóng góp nổi bật",
            false,
            &mut self.form.achievement_summary,
            "",
            2,
        );
        ui.label("Giá trị quy đổi là thông tin khai báo, chưa xác nhận đã chi.");
        if !self.form_error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
        }
        ui.add_space(18.0);
        crate::widgets::action_row(ui, |ui| {
            if ui
                .add_enabled(
                    self.create_task.is_none(),
                    egui::Button::new("Lưu hồ sơ chờ duyệt").fill(crate::theme::PRIMARY),
                )
                .clicked()
            {
                match self.form.to_input() {
                    Ok(input) => {
                        self.create_task = Some(api.create_hr_reward_task(session, &input));
                        self.form_error.clear();
                    }
                    Err(error) => self.form_error = error,
                }
            }
            if ui
                .add_enabled(self.create_task.is_none(), egui::Button::new("Hủy"))
                .clicked()
            {
                self.form_open = false;
            }
        });
    }
}

impl RewardForm {
    fn to_input(&self) -> Result<CreateHrRewardInput, String> {
        for (label, value) in [
            ("Mã khen thưởng", self.reward_code.trim()),
            ("Số quyết định", self.decision_no.trim()),
            ("Danh hiệu", self.title.trim()),
        ] {
            if value.is_empty() {
                return Err(format!("{label} là bắt buộc."));
            }
        }
        if chrono::NaiveDate::parse_from_str(self.date.trim(), "%Y-%m-%d").is_err() {
            return Err(
                "Ngày quyết định phải là ngày hợp lệ theo định dạng YYYY-MM-DD.".to_owned(),
            );
        }
        let (employee_code, team_name, department) = match self.recipient_type.as_str() {
            "employee" if !self.employee_code.trim().is_empty() => (
                self.employee_code.trim().to_owned(),
                String::new(),
                String::new(),
            ),
            "employee" => return Err("Mã nhân viên HR là bắt buộc.".to_owned()),
            "team" if !self.team_name.trim().is_empty() && !self.department.trim().is_empty() => (
                String::new(),
                self.team_name.trim().to_owned(),
                self.department.trim().to_owned(),
            ),
            "team" => return Err("Tên tập thể và phòng ban là bắt buộc.".to_owned()),
            _ => return Err("Đối tượng nhận không hợp lệ.".to_owned()),
        };
        if !REWARD_TYPES.contains(&self.reward_type.as_str()) {
            return Err("Hình thức khen thưởng không hợp lệ.".to_owned());
        }
        let reward_value = self
            .reward_value
            .trim()
            .parse::<i64>()
            .ok()
            .filter(|value| (0..=1_000_000_000_000_000).contains(value))
            .ok_or_else(|| "Giá trị quy đổi phải là số nguyên không âm hợp lệ.".to_owned())?;
        Ok(CreateHrRewardInput {
            reward_code: self.reward_code.trim().to_owned(),
            decision_no: self.decision_no.trim().to_owned(),
            date: self.date.trim().to_owned(),
            recipient_type: self.recipient_type.clone(),
            employee_code,
            team_name,
            department,
            title: self.title.trim().to_owned(),
            reward_type: self.reward_type.clone(),
            reward_value,
            achievement_summary: self.achievement_summary.trim().to_owned(),
        })
    }
}

fn reward_status_matches(selected: &str, status: &str) -> bool {
    match selected {
        "Đã trao giải" => matches!(status, "Đã trao giải" | "Đã trao thưởng"),
        "Chờ trao giải" => matches!(
            status,
            "Chờ duyệt" | "Đã ký quyết định" | "Chờ trao thưởng trong lễ vinh danh"
        ),
        "" | "Tất cả" => true,
        _ => selected == status,
    }
}

fn status_label(reward: &HrReward) -> String {
    match reward.status.as_str() {
        PENDING => PENDING.to_owned(),
        APPROVED if reward.approval_recorded_at.trim().is_empty() => {
            "Chưa xác minh · Đã ký quyết định".to_owned()
        }
        APPROVED => "Đã ghi nhận duyệt".to_owned(),
        AWARDED
            if reward.approval_recorded_at.trim().is_empty()
                || reward.award_recorded_at.trim().is_empty() =>
        {
            "Chưa xác minh · Đã trao giải".to_owned()
        }
        AWARDED => "Đã ghi nhận trao thưởng".to_owned(),
        other => other.to_owned(),
    }
}

fn recipient_label(reward: &HrReward) -> &'static str {
    match reward.recipient_type.as_str() {
        "employee" => "Nhân viên",
        "team" => "Tập thể",
        _ => "Người nhận cũ · chưa xác minh",
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

    #[test]
    fn legacy_form_footer_fits_mobile_tablet_and_desktop() {
        let mut view = HrRewardsView::default();
        crate::views::hr_training::assert_form_fits(|ui, session, api| {
            view.render_form(ui, session, api)
        });
    }
    use super::*;

    #[test]
    fn reward_tabs_include_legacy_status_aliases_without_marking_them_verified() {
        assert!(reward_status_matches("Đã trao giải", "Đã trao thưởng"));
        assert!(reward_status_matches(
            "Chờ trao giải",
            "Chờ trao thưởng trong lễ vinh danh"
        ));
        assert!(reward_status_matches("Chờ trao giải", PENDING));
        assert!(!reward_status_matches("Đã trao giải", PENDING));
        assert!(reward_status_matches("", "Trạng thái kế thừa"));
    }

    fn reward_form() -> RewardForm {
        RewardForm {
            reward_code: "RW-2026-001".into(),
            decision_no: "QD-2026-001".into(),
            date: "2026-10-08".into(),
            recipient_type: "employee".into(),
            employee_code: "EMP-01".into(),
            team_name: String::new(),
            department: String::new(),
            title: "Đóng góp nổi bật".into(),
            reward_type: REWARD_TYPES[0].into(),
            reward_value: "15000000".into(),
            achievement_summary: "Hoàn thành mục tiêu".into(),
        }
    }

    #[test]
    fn employee_input_only_sends_hr_code_not_spoofable_profile_fields() {
        let value = serde_json::to_value(reward_form().to_input().unwrap()).unwrap();
        assert_eq!(value["employeeCode"], "EMP-01");
        assert!(value["teamName"].as_str().unwrap().is_empty());
        assert!(value.get("employeeName").is_none());
        assert!(value.get("employeeId").is_none());
        assert!(value.get("status").is_none());
    }

    #[test]
    fn team_recipient_requires_team_and_department_and_omits_employee_code() {
        let mut form = reward_form();
        form.recipient_type = "team".into();
        form.employee_code.clear();
        form.team_name = "Nhóm nền tảng".into();
        form.department = "Kỹ thuật".into();
        let value = serde_json::to_value(form.to_input().unwrap()).unwrap();
        assert_eq!(value["recipientType"], "team");
        assert_eq!(value["teamName"], "Nhóm nền tảng");
        assert_eq!(value["department"], "Kỹ thuật");
        assert!(value["employeeCode"].as_str().unwrap().is_empty());
    }

    #[test]
    fn form_rejects_missing_recipient_bad_date_and_invalid_value() {
        let mut form = reward_form();
        form.employee_code.clear();
        assert!(form.to_input().is_err());
        let mut form = reward_form();
        form.date = "2026-02-30".into();
        assert!(form.to_input().is_err());
        let mut form = reward_form();
        form.reward_value = "-1".into();
        assert!(form.to_input().is_err());
    }

    #[test]
    fn legacy_status_without_server_audit_is_never_presented_as_verified() {
        let mut reward = HrReward {
            status: APPROVED.to_owned(),
            ..HrReward::default()
        };
        assert_eq!(status_label(&reward), "Chưa xác minh · Đã ký quyết định");
        assert_eq!(recipient_label(&reward), "Người nhận cũ · chưa xác minh");
        reward.approval_recorded_at = "2026-10-08T10:00:00Z".to_owned();
        assert_eq!(status_label(&reward), "Đã ghi nhận duyệt");
        reward.status = AWARDED.to_owned();
        assert_eq!(status_label(&reward), "Chưa xác minh · Đã trao giải");
        reward.award_recorded_at = "2026-10-08T10:05:00Z".to_owned();
        assert_eq!(status_label(&reward), "Đã ghi nhận trao thưởng");
    }
}
