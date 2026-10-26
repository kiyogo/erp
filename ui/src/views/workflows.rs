use std::{collections::BTreeSet, time::Duration};

use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, ContractSummary, ContractsResponse, EmployeeProposal,
        EmployeeProposalsResponse, EnterpriseTask, TasksResponse, WorkflowCollectionResponse,
        WorkflowRequest, WorkflowRequestsResponse,
    },
    models::{NavGroup, NavItem, Session},
    views::employees::format_vnd,
    widgets::{self, Metric, TableColumn, TagTone},
};
use egui::{Color32, RichText, Ui};

const OVERVIEW_REFRESH_INTERVAL: Duration = Duration::from_secs(15);
const OVERVIEW_PAGE_SIZE: usize = 5;
const SOURCE_FILTERS: &[&str] = &[
    "Tất cả nguồn",
    "Quy trình nội bộ",
    "Yêu cầu quy trình",
    "Đề xuất nhân sự",
    "Nhiệm vụ",
    "Hợp đồng",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum RecordSource {
    LegacyWorkflow,
    Workflow,
    Proposal,
    Task,
    Contract,
}

impl RecordSource {
    const fn label(self) -> &'static str {
        match self {
            Self::LegacyWorkflow => "Quy trình nội bộ",
            Self::Workflow => "Yêu cầu quy trình",
            Self::Proposal => "Đề xuất nhân sự",
            Self::Task => "Nhiệm vụ",
            Self::Contract => "Hợp đồng",
        }
    }

    const fn nav_item(self) -> Option<NavItem> {
        match self {
            Self::LegacyWorkflow => None,
            Self::Workflow => Some(NavItem::new(
                "wf-requests",
                "Yêu cầu quy trình",
                "/admin/workflows/requests",
                "📨",
                NavGroup::Workflows,
            )),
            Self::Proposal => Some(NavItem::new(
                "hr-proposals",
                "Đề xuất",
                "/admin/hr/proposals",
                "📬",
                NavGroup::Hr,
            )),
            Self::Task => Some(NavItem::new(
                "plan-tasks",
                "Nhiệm vụ",
                "/admin/tasks",
                "✅",
                NavGroup::Plans,
            )),
            Self::Contract => Some(NavItem::new(
                "hr-contracts",
                "Hợp đồng",
                "/admin/hr/contracts",
                "📄",
                NavGroup::Hr,
            )),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum RecordState {
    Pending,
    Completed,
    Rejected,
    Paused,
    #[default]
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct OverviewRecord {
    code: String,
    title: String,
    category: String,
    person: String,
    status: String,
    created_at: String,
    priority: String,
    amount: Option<u64>,
    source: RecordSource,
}

#[derive(Debug, Default, PartialEq, Eq)]
struct OverviewMetrics {
    total: usize,
    pending: usize,
    completed: usize,
    rejected: usize,
    paused: usize,
    other: usize,
}

#[derive(Default)]
pub struct WorkflowsView {
    legacy_workflows: Vec<serde_json::Value>,
    workflow_requests: Vec<WorkflowRequest>,
    employee_proposals: Vec<EmployeeProposal>,
    tasks: Vec<EnterpriseTask>,
    contracts: Vec<ContractSummary>,
    pending_legacy_workflows: Option<ApiTask<WorkflowCollectionResponse>>,
    pending_workflows: Option<ApiTask<WorkflowRequestsResponse>>,
    pending_proposals: Option<ApiTask<EmployeeProposalsResponse>>,
    pending_tasks: Option<ApiTask<TasksResponse>>,
    pending_contracts: Option<ApiTask<ContractsResponse>>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    search: String,
    source_filter: String,
    status_filter: String,
    page: usize,
    page_size: usize,
    selected: Option<OverviewRecord>,
    legacy_workflow_error: String,
    workflow_error: String,
    proposal_error: String,
    task_error: String,
    contract_error: String,
}

impl WorkflowsView {
    fn clear_user_bound_state(&mut self) {
        self.legacy_workflows.clear();
        self.workflow_requests.clear();
        self.employee_proposals.clear();
        self.tasks.clear();
        self.contracts.clear();
        self.pending_legacy_workflows = None;
        self.pending_workflows = None;
        self.pending_proposals = None;
        self.pending_tasks = None;
        self.pending_contracts = None;
        self.last_loaded = None;
        self.needs_reload = true;
        self.search.clear();
        self.source_filter = SOURCE_FILTERS[0].to_owned();
        self.status_filter.clear();
        self.page = 0;
        self.page_size = OVERVIEW_PAGE_SIZE;
        self.selected = None;
        self.legacy_workflow_error.clear();
        self.workflow_error.clear();
        self.proposal_error.clear();
        self.task_error.clear();
        self.contract_error.clear();
    }

    fn any_request_pending(&self) -> bool {
        self.pending_legacy_workflows.is_some()
            || self.pending_workflows.is_some()
            || self.pending_proposals.is_some()
            || self.pending_tasks.is_some()
            || self.pending_contracts.is_some()
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.any_request_pending() {
            self.needs_reload = true;
            return;
        }
        self.pending_legacy_workflows = Some(api.list_workflow_collection_task(session));
        self.pending_workflows = Some(api.list_workflow_requests_task(session));
        self.pending_proposals = Some(api.list_employee_proposals_task(session));
        self.pending_tasks = Some(api.list_tasks_task(session));
        self.pending_contracts = Some(api.list_contracts_task(session));
        self.last_loaded = None;
        self.needs_reload = false;
        self.legacy_workflow_error.clear();
        self.workflow_error.clear();
        self.proposal_error.clear();
        self.task_error.clear();
        self.contract_error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.clear_user_bound_state();
            self.loaded_for = Some(session.user.id.clone());
        }

        if self.needs_reload && !self.any_request_pending() {
            self.request_reload(session, api);
        } else if !self.any_request_pending()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= OVERVIEW_REFRESH_INTERVAL)
        {
            self.request_reload(session, api);
        }

        if let Some(result) = self
            .pending_legacy_workflows
            .as_ref()
            .and_then(ApiClient::poll)
        {
            self.pending_legacy_workflows = None;
            match result {
                Ok(response) => {
                    self.legacy_workflows = response.data;
                    self.legacy_workflow_error.clear();
                }
                Err(error) => self.legacy_workflow_error = error,
            }
        }
        if let Some(result) = self.pending_workflows.as_ref().and_then(ApiClient::poll) {
            self.pending_workflows = None;
            match result {
                Ok(response) => {
                    self.workflow_requests = response.data;
                    self.workflow_error.clear();
                }
                Err(error) => self.workflow_error = error,
            }
        }
        if let Some(result) = self.pending_proposals.as_ref().and_then(ApiClient::poll) {
            self.pending_proposals = None;
            match result {
                Ok(response) => {
                    self.employee_proposals = response.data;
                    self.proposal_error.clear();
                }
                Err(error) => self.proposal_error = error,
            }
        }
        if let Some(result) = self.pending_tasks.as_ref().and_then(ApiClient::poll) {
            self.pending_tasks = None;
            match result {
                Ok(response) => {
                    self.tasks = response.data;
                    self.task_error.clear();
                }
                Err(error) => self.task_error = error,
            }
        }
        if let Some(result) = self.pending_contracts.as_ref().and_then(ApiClient::poll) {
            self.pending_contracts = None;
            match result {
                Ok(response) => {
                    self.contracts = response.data;
                    self.contract_error.clear();
                }
                Err(error) => self.contract_error = error,
            }
        }

        if !self.any_request_pending() && !self.needs_reload {
            self.last_loaded.get_or_insert_with(Instant::now);
        } else {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    fn records(&self) -> Vec<OverviewRecord> {
        let mut records = Vec::with_capacity(
            self.legacy_workflows.len()
                + self.workflow_requests.len()
                + self.employee_proposals.len()
                + self.tasks.len()
                + self.contracts.len(),
        );
        records.extend(self.legacy_workflows.iter().filter_map(|item| {
            let text = |field: &str| {
                item.get(field)
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default()
                    .to_owned()
            };
            let code = text("code");
            let title = text("title");
            if code.is_empty() && title.is_empty() {
                return None;
            }
            Some(OverviewRecord {
                code,
                title,
                category: text("step"),
                person: text("requester"),
                status: text("status"),
                created_at: text("submittedDate"),
                priority: String::new(),
                amount: None,
                source: RecordSource::LegacyWorkflow,
            })
        }));
        records.extend(self.workflow_requests.iter().map(|item| OverviewRecord {
            code: item.code.clone(),
            title: item.workflow_name.clone(),
            category: item.category.clone(),
            person: item.requester.clone(),
            status: item.status.clone(),
            created_at: item.submitted_at.clone(),
            priority: item.priority.clone(),
            amount: Some(item.budget_amount),
            source: RecordSource::Workflow,
        }));
        records.extend(self.employee_proposals.iter().map(|item| OverviewRecord {
            code: item.code.clone(),
            title: item.title.clone(),
            category: item.proposal_type.clone(),
            person: item.employee_name.clone(),
            status: item.status.clone(),
            created_at: if item.created_at.is_empty() {
                item.date.clone()
            } else {
                item.created_at.clone()
            },
            priority: String::new(),
            amount: u64::try_from(item.amount).ok(),
            source: RecordSource::Proposal,
        }));
        records.extend(self.tasks.iter().map(|item| OverviewRecord {
            code: item.task_code.clone(),
            title: item.task_title.clone(),
            category: item.project_name.clone(),
            person: item.assignee.clone(),
            status: item.status.clone(),
            created_at: item.created_at.clone(),
            priority: item.priority.clone(),
            amount: None,
            source: RecordSource::Task,
        }));
        records.extend(self.contracts.iter().map(|item| OverviewRecord {
            code: item.code.clone(),
            title: item.name.clone(),
            category: item.contract_category.clone(),
            person: if item.employee_name.is_empty() {
                item.party_b_name.clone()
            } else {
                item.employee_name.clone()
            },
            status: item.status.clone(),
            created_at: item.created_at.clone(),
            priority: String::new(),
            amount: None,
            source: RecordSource::Contract,
        }));
        records.sort_by(|left, right| right.created_at.cmp(&left.created_at));
        records
    }

    pub fn render_overview(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        nav_change: &mut Option<NavItem>,
    ) {
        self.poll(ctx, session, api);
        let records = self.records();
        let metrics = overview_metrics(&records);
        let statuses = records
            .iter()
            .map(|item| item.status.as_str())
            .filter(|status| !status.is_empty())
            .collect::<BTreeSet<_>>();

        let pending_budget = records
            .iter()
            .filter(|record| state_bucket(record.source, &record.status) == RecordState::Pending)
            .filter_map(|record| record.amount)
            .fold(0_u64, u64::saturating_add);
        let errors = [
            (RecordSource::LegacyWorkflow, &self.legacy_workflow_error),
            (RecordSource::Workflow, &self.workflow_error),
            (RecordSource::Proposal, &self.proposal_error),
            (RecordSource::Task, &self.task_error),
            (RecordSource::Contract, &self.contract_error),
        ];
        let partial =
            self.any_request_pending() || errors.iter().any(|(_, error)| !error.is_empty());
        let unavailable = records.is_empty() && partial;
        widgets::metrics_with_padding(
            ui,
            "workflow-overview.kpi",
            &[
                Metric {
                    label: "Hồ sơ đang chờ xử lý",
                    value: if unavailable {
                        "—".into()
                    } else {
                        format!("{} hồ sơ", metrics.pending)
                    },
                    detail: if partial {
                        "Dữ liệu đang tải hoặc thiếu nguồn"
                    } else {
                        "Tổng hợp theo trạng thái của từng nguồn"
                    },
                    color: if metrics.pending > 0 {
                        Color32::from_rgb(220, 38, 38)
                    } else {
                        Color32::from_rgb(22, 163, 74)
                    },
                    value_size: 24.0,
                },
                Metric {
                    label: "Sắp chạm SLA",
                    value: "Chưa xác định".into(),
                    detail: "Chưa có API đối soát SLA liên phân hệ",
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 24.0,
                },
                Metric {
                    label: "Ngân sách đang chờ phê duyệt",
                    value: if unavailable {
                        "—".into()
                    } else {
                        format!("{} ₫", format_vnd(pending_budget))
                    },
                    detail: "Chỉ tính giá trị được nguồn dữ liệu cung cấp",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 24.0,
                },
                Metric {
                    label: "Đã hoàn tất",
                    value: if unavailable {
                        "—".into()
                    } else {
                        format!("{} hồ sơ", metrics.completed)
                    },
                    detail: "Theo trạng thái của từng nghiệp vụ nguồn",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
            ],
            egui::vec2(18.0, 16.0),
        );
        ui.add_space(16.0);
        if ui.available_width() >= 700.0 && ctx.screen_rect().width() > 992.0 {
            ui.columns(2, |cols| {
                render_sources(&mut cols[0], &records);
                render_signals(&mut cols[1], &metrics, partial);
            });
        } else {
            render_sources(ui, &records);
            ui.add_space(12.0);
            render_signals(ui, &metrics, partial);
        }
        ui.add_space(16.0);
        for (source, error) in errors {
            if !error.is_empty() {
                ui.colored_label(Color32::DARK_RED, format!("{}: {error}", source.label()));
            }
        }
        if self.any_request_pending() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải các nguồn dữ liệu tổng quan…");
            });
        }
        egui::Frame::none()
            .fill(Color32::WHITE)
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0)
            .inner_margin(18.0)
            .show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    ui.vertical(|ui| {
                        ui.label(
                            RichText::new("Danh Sách Hồ Sơ Quy Trình")
                                .size(15.0)
                                .strong(),
                        );
                        ui.small("Luồng tổng hợp từ các phân hệ đang có dữ liệu thật");
                    });
                    if ui.button("Mở danh sách xử lý").clicked() {
                        *nav_change = RecordSource::Workflow.nav_item();
                    }
                    if ui
                        .add_enabled(!self.any_request_pending(), egui::Button::new("Làm mới"))
                        .clicked()
                    {
                        self.needs_reload = true;
                    }
                });
                ui.add_space(14.0);
                let mut changed = false;
                ui.horizontal_wrapped(|ui| {
                    let (rect, _) = ui.allocate_exact_size(
                        egui::vec2(ui.available_width().min(260.0), 32.0),
                        egui::Sense::hover(),
                    );
                    changed |= widgets::search_input(
                        ui,
                        rect,
                        &mut self.search,
                        "Mã, tiêu đề, người liên quan, nhóm",
                    )
                    .changed();
                    widgets::combo_box("overview.source")
                        .selected_text(&self.source_filter)
                        .show_ui(ui, |ui| {
                            for source in SOURCE_FILTERS {
                                changed |= ui
                                    .selectable_value(
                                        &mut self.source_filter,
                                        (*source).into(),
                                        *source,
                                    )
                                    .changed();
                            }
                        });
                    widgets::combo_box("overview.status")
                        .selected_text(if self.status_filter.is_empty() {
                            "Tất cả trạng thái"
                        } else {
                            &self.status_filter
                        })
                        .show_ui(ui, |ui| {
                            changed |= ui
                                .selectable_value(
                                    &mut self.status_filter,
                                    String::new(),
                                    "Tất cả trạng thái",
                                )
                                .changed();
                            for status in &statuses {
                                changed |= ui
                                    .selectable_value(
                                        &mut self.status_filter,
                                        (*status).into(),
                                        *status,
                                    )
                                    .changed();
                            }
                        });
                });
                if changed {
                    self.page = 0;
                }
                let query = self.search.trim().to_lowercase();
                let filtered = records
                    .iter()
                    .filter(|record| {
                        (self.source_filter == SOURCE_FILTERS[0]
                            || self.source_filter == record.source.label())
                            && (self.status_filter.is_empty()
                                || self.status_filter == record.status)
                            && (query.is_empty()
                                || [
                                    &record.code,
                                    &record.title,
                                    &record.category,
                                    &record.person,
                                    &record.status,
                                ]
                                .iter()
                                .any(|value| value.to_lowercase().contains(&query)))
                    })
                    .collect::<Vec<_>>();
                if self.page_size == 0 {
                    self.page_size = OVERVIEW_PAGE_SIZE;
                }
                self.page = self
                    .page
                    .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
                let rows = filtered
                    .iter()
                    .skip(self.page * self.page_size)
                    .take(self.page_size)
                    .collect::<Vec<_>>();
                ui.add_space(12.0);
                widgets::table_with_row_height(
                    ui,
                    "overview.table",
                    &[
                        TableColumn {
                            title: "Mã hồ sơ",
                            width: 160.0,
                        },
                        TableColumn {
                            title: "Tiêu đề & nguồn",
                            width: 380.0,
                        },
                        TableColumn {
                            title: "Tiến độ",
                            width: 180.0,
                        },
                        TableColumn {
                            title: "SLA",
                            width: 140.0,
                        },
                        TableColumn {
                            title: "Trạng thái",
                            width: 150.0,
                        },
                        TableColumn {
                            title: "Thao tác",
                            width: 150.0,
                        },
                    ],
                    rows.len(),
                    96.0,
                    |ui, row, col| {
                        let item = rows[row];
                        match col {
                            0 => {
                                ui.colored_label(crate::theme::PRIMARY, &item.code);
                                ui.small(item.source.label());
                            }
                            1 => {
                                ui.label(&item.title);
                                ui.small(format!(
                                    "Nhóm: {} · Người liên quan: {}",
                                    item.category, item.person
                                ));
                                ui.small(if item.created_at.is_empty() {
                                    "Chưa có ngày tạo".into()
                                } else {
                                    item.created_at.clone()
                                });
                            }
                            2 => {
                                if item.source == RecordSource::Workflow {
                                    if let Some(request) = self
                                        .workflow_requests
                                        .iter()
                                        .find(|request| request.code == item.code)
                                    {
                                        ui.label(format!(
                                            "Bước {}/{}",
                                            request.current_level, request.total_levels
                                        ));
                                        ui.small(&request.role_requirement);
                                    }
                                } else if item.source == RecordSource::Task {
                                    if let Some(task) =
                                        self.tasks.iter().find(|task| task.task_code == item.code)
                                    {
                                        ui.label(format!("{}%", task.progress));
                                        ui.add(
                                            egui::ProgressBar::new(
                                                (task.progress as f32 / 100.0).clamp(0.0, 1.0),
                                            )
                                            .desired_height(6.0),
                                        );
                                    }
                                } else {
                                    ui.small("Chưa có dữ liệu bước duyệt");
                                }
                            }
                            3 => {
                                ui.small("Chưa xác định");
                                ui.small("Chưa có API đối soát");
                            }
                            4 => widgets::tag(
                                ui,
                                &item.status,
                                match state_bucket(item.source, &item.status) {
                                    RecordState::Pending => TagTone::Processing,
                                    RecordState::Completed => TagTone::Success,
                                    RecordState::Rejected => TagTone::Error,
                                    _ => TagTone::Neutral,
                                },
                            ),
                            _ => {
                                ui.horizontal_wrapped(|ui| {
                                    if ui.button("Xem").clicked() {
                                        self.selected = Some((**item).clone());
                                    }
                                    if let Some(target) = item.source.nav_item() {
                                        if ui.button("Mở").clicked() {
                                            *nav_change = Some(target);
                                        }
                                    }
                                });
                            }
                        }
                    },
                );
                ui.add_space(8.0);
                widgets::pagination(
                    ui,
                    "overview.pagination",
                    &mut self.page,
                    filtered.len(),
                    &mut self.page_size,
                );
            });
        ui.add_space(16.0);
        egui::Frame::group(ui.style())
            .inner_margin(18.0)
            .show(ui, |ui| {
                ui.horizontal_wrapped(|ui| {
                    ui.strong("Nhóm Quy Trình Đang Có Dữ Liệu");
                    if ui.link("Xem cấu hình quy trình").clicked() {
                        *nav_change = Some(NavItem::new(
                            "wf-list",
                            "Danh sách quy trình",
                            "/admin/workflows/list",
                            "↗",
                            NavGroup::Workflows,
                        ));
                    }
                });
                ui.add_space(14.0);
                let cards = SOURCE_FILTERS[1..]
                    .iter()
                    .filter_map(|source| {
                        let count = records
                            .iter()
                            .filter(|record| record.source.label() == *source)
                            .count();
                        (count > 0).then_some(Metric {
                            label: source,
                            value: format!("{count} hồ sơ"),
                            detail: "Theo dữ liệu hiện tại",
                            color: crate::theme::PRIMARY,
                            value_size: 20.0,
                        })
                    })
                    .collect::<Vec<_>>();
                if cards.is_empty() {
                    ui.label("Chưa có hồ sơ quy trình để tổng hợp.");
                } else {
                    widgets::metrics_grid(
                        ui,
                        "overview.sources",
                        &cards,
                        egui::vec2(14.0, 14.0),
                        280.0,
                        4.0,
                    );
                }
            });
        if let Some(item) = self.selected.clone() {
            let (_, close) = widgets::drawer(
                ctx,
                "overview.detail",
                "Chi Tiết Hồ Sơ Quy Trình",
                560.0,
                |ui| {
                    ui.colored_label(crate::theme::PRIMARY, &item.code);
                    ui.heading(&item.title);
                    ui.label(format!(
                        "Nguồn: {} · Nhóm: {}",
                        item.source.label(),
                        item.category
                    ));
                    ui.label(format!(
                        "Người liên quan: {} · Ngày tạo: {}",
                        item.person, item.created_at
                    ));
                    ui.label(format!(
                        "Trạng thái: {} · Ưu tiên: {}",
                        item.status,
                        if item.priority.is_empty() {
                            "Chưa cung cấp"
                        } else {
                            &item.priority
                        }
                    ));
                    if let Some(amount) = item.amount {
                        ui.label(format!("Giá trị khai báo: {} ₫", format_vnd(amount)));
                    }
                    ui.add_space(16.0);
                    ui.strong("Lịch sử xử lý");
                    if item.source == RecordSource::Workflow {
                        if let Some(request) = self
                            .workflow_requests
                            .iter()
                            .find(|request| request.code == item.code)
                        {
                            if request.approval_history.is_empty() {
                                ui.label("Chưa có sự kiện xử lý đã lưu.");
                            }
                            for event in &request.approval_history {
                                ui.label(serde_json::to_string_pretty(event).unwrap_or_default());
                            }
                        }
                    } else {
                        ui.label("Mở phân hệ nguồn để xem lịch sử được phép truy cập.");
                    }
                    ui.small("Chưa có dữ liệu xác minh SLA hoặc chữ ký số liên phân hệ.");
                    if let Some(target) = item.source.nav_item() {
                        if ui.button("Mở phân hệ").clicked() {
                            *nav_change = Some(target);
                        }
                    }
                },
            );
            if close {
                self.selected = None;
            }
        }
    }

    pub fn render(&mut self, ui: &mut Ui, _session: &Session, path: &str) {
        ui.vertical(|ui| {
            ui.label(
                RichText::new("CHỨC NĂNG CHƯA CÓ API TƯƠNG ỨNG")
                    .size(11.0)
                    .strong()
                    .color(Color32::from_rgb(180, 83, 9)),
            );
            ui.heading(module_title(path));
            ui.add_space(8.0);
            egui::Frame::group(ui.style()).show(ui, |ui| {
                ui.label("Hiện chưa có dữ liệu hoặc thao tác giả được hiển thị ở đây.");
                ui.label("Các phần chưa có hợp đồng backend được giữ ở trạng thái chưa triển khai thay vì giả lập kết quả.");
            });
        });
    }
}

fn render_sources(ui: &mut Ui, records: &[OverviewRecord]) {
    egui::Frame::group(ui.style())
        .inner_margin(18.0)
        .show(ui, |ui| {
            ui.strong("Phân Bổ Hồ Sơ Theo Nguồn Nghiệp Vụ");
            ui.add_space(14.0);
            if records.is_empty() {
                ui.label("Chưa có hồ sơ quy trình để tổng hợp.");
            }
            for source in &SOURCE_FILTERS[1..] {
                let count = records
                    .iter()
                    .filter(|item| item.source.label() == *source)
                    .count();
                if count == 0 {
                    continue;
                }
                let percent = count as f32 / records.len() as f32;
                ui.label(format!(
                    "{source} · {count} hồ sơ ({:.0}%)",
                    percent * 100.0
                ));
                ui.add(
                    egui::ProgressBar::new(percent)
                        .fill(crate::theme::PRIMARY)
                        .desired_height(6.0),
                );
                ui.add_space(12.0);
            }
        });
}

fn render_signals(ui: &mut Ui, metrics: &OverviewMetrics, partial: bool) {
    egui::Frame::group(ui.style())
        .inner_margin(18.0)
        .show(ui, |ui| {
            ui.strong("Tín Hiệu Vận Hành");
            ui.add_space(14.0);
            for (title, value, tone) in [
                ("Đang xử lý", metrics.pending, TagTone::Processing),
                ("Đã hoàn tất", metrics.completed, TagTone::Success),
                ("Đã từ chối", metrics.rejected, TagTone::Error),
                ("Tạm dừng", metrics.paused, TagTone::Neutral),
                ("Trạng thái khác", metrics.other, TagTone::Neutral),
            ] {
                ui.horizontal_wrapped(|ui| {
                    ui.label(title);
                    widgets::tag(ui, &value.to_string(), tone);
                });
                ui.add_space(10.0);
            }
            ui.small("Sắp chạm SLA: chưa có API đối soát.");
            if partial {
                ui.small("Thống kê chưa đầy đủ do nguồn đang tải hoặc lỗi.");
            }
        });
}

fn overview_metrics(records: &[OverviewRecord]) -> OverviewMetrics {
    let mut metrics = OverviewMetrics {
        total: records.len(),
        ..OverviewMetrics::default()
    };
    for item in records {
        match state_bucket(item.source, &item.status) {
            RecordState::Pending => metrics.pending += 1,
            RecordState::Completed => metrics.completed += 1,
            RecordState::Rejected => metrics.rejected += 1,
            RecordState::Paused => metrics.paused += 1,
            RecordState::Other => metrics.other += 1,
        }
    }
    metrics
}

fn state_bucket(source: RecordSource, status: &str) -> RecordState {
    match (source, status) {
        (RecordSource::LegacyWorkflow, "Đang xử lý" | "Chờ ký số" | "pending")
        | (RecordSource::Workflow, "Chờ duyệt" | "Yêu cầu bổ sung" | "Chờ ký số")
        | (RecordSource::Proposal, "Chờ duyệt")
        | (RecordSource::Contract, "Chờ ký" | "Chờ duyệt")
        | (RecordSource::Task, "Chưa bắt đầu" | "Đang thực hiện" | "Chờ nghiệm thu") => {
            RecordState::Pending
        }
        (RecordSource::LegacyWorkflow, "Đã phê duyệt")
        | (RecordSource::Workflow, "Đã phê duyệt")
        | (RecordSource::Proposal, "Đã duyệt")
        | (RecordSource::Task, "Hoàn thành") => RecordState::Completed,
        (RecordSource::LegacyWorkflow, "Bị từ chối")
        | (RecordSource::Workflow, "Đã từ chối")
        | (RecordSource::Proposal, "Từ chối") => RecordState::Rejected,
        (RecordSource::Task, "Tạm dừng") => RecordState::Paused,
        _ => RecordState::Other,
    }
}

fn module_title(path: &str) -> &str {
    match path {
        "/admin/workflows/overview" => "Tổng quan quy trình",
        "/admin/workflows/requests" => "Yêu cầu quy trình",
        "/admin/workflows/history" => "Lịch sử xử lý",
        "/admin/workflows/settings" => "Thiết lập quy trình",
        "/employee/tasks" => "Nhiệm vụ của tôi",
        "/employee/proposals" => "Kiến nghị của tôi",
        "/admin/services" => "Dịch vụ",
        "/admin/tickets" => "Phiếu hỗ trợ",
        "/admin/plans" => "Kế hoạch",
        "/admin/reports" => "Báo cáo",
        _ => "Chức năng đang được chuyển đổi",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(source: RecordSource, status: &str) -> OverviewRecord {
        OverviewRecord {
            code: "CODE-1".to_owned(),
            title: "Hồ sơ thử nghiệm".to_owned(),
            category: "Nhóm thử nghiệm".to_owned(),
            person: "Người thử nghiệm".to_owned(),
            status: status.to_owned(),
            created_at: "2026-10-09T08:00:00Z".to_owned(),
            priority: String::new(),
            amount: None,
            source,
        }
    }

    #[test]
    fn overview_status_buckets_only_known_domain_statuses() {
        assert_eq!(
            state_bucket(RecordSource::LegacyWorkflow, "Đang xử lý"),
            RecordState::Pending
        );
        assert_eq!(
            state_bucket(RecordSource::LegacyWorkflow, "Đã phê duyệt"),
            RecordState::Completed
        );
        assert_eq!(
            state_bucket(RecordSource::LegacyWorkflow, "Bị từ chối"),
            RecordState::Rejected
        );
        assert_eq!(
            state_bucket(RecordSource::Workflow, "Chờ duyệt"),
            RecordState::Pending
        );
        assert_eq!(
            state_bucket(RecordSource::Proposal, "Đã duyệt"),
            RecordState::Completed
        );
        assert_eq!(
            state_bucket(RecordSource::Task, "Tạm dừng"),
            RecordState::Paused
        );
        assert_eq!(
            state_bucket(RecordSource::Workflow, "Đang xử lý"),
            RecordState::Other
        );
        assert_eq!(
            state_bucket(RecordSource::Task, "Đã từ chối"),
            RecordState::Other
        );
    }

    #[test]
    fn overview_metrics_keep_paused_and_unrecognized_states_separate() {
        let records = [
            record(RecordSource::Workflow, "Chờ duyệt"),
            record(RecordSource::Task, "Hoàn thành"),
            record(RecordSource::Task, "Tạm dừng"),
            record(RecordSource::Workflow, "Legacy status"),
        ];
        assert_eq!(
            overview_metrics(&records),
            OverviewMetrics {
                total: 4,
                pending: 1,
                completed: 1,
                rejected: 0,
                paused: 1,
                other: 1,
            }
        );
    }

    #[test]
    fn overview_source_navigation_targets_real_migrated_screens() {
        assert_eq!(
            RecordSource::Workflow
                .nav_item()
                .expect("workflow nav")
                .path,
            "/admin/workflows/requests"
        );
        assert_eq!(
            RecordSource::Proposal
                .nav_item()
                .expect("proposal nav")
                .path,
            "/admin/hr/proposals"
        );
        assert_eq!(
            RecordSource::Task.nav_item().expect("task nav").path,
            "/admin/tasks"
        );
        assert_eq!(
            RecordSource::Contract
                .nav_item()
                .expect("contract nav")
                .path,
            "/admin/hr/contracts"
        );
        assert!(RecordSource::LegacyWorkflow.nav_item().is_none());
    }

    #[test]
    fn legacy_workflow_collection_records_use_only_legacy_fields() {
        let view = WorkflowsView {
            legacy_workflows: vec![serde_json::json!({
                "key":"wf-1",
                "code":"WF-1",
                "title":"Mua thiết bị",
                "requester":"Nguyễn An",
                "department":"Vận hành",
                "step":"Trưởng bộ phận",
                "currentApprover":"Trưởng phòng",
                "submittedDate":"2026-10-09",
                "status":"Đang xử lý",
                "slaRemainingHours":0,
                "signatureVerified":true
            })],
            ..WorkflowsView::default()
        };
        let records = view.records();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].code, "WF-1");
        assert_eq!(records[0].title, "Mua thiết bị");
        assert_eq!(records[0].status, "Đang xử lý");
        assert_eq!(records[0].amount, None);
        assert_eq!(records[0].source, RecordSource::LegacyWorkflow);
        assert_eq!(
            state_bucket(records[0].source, &records[0].status),
            RecordState::Pending
        );
    }

    #[test]
    fn contract_overview_uses_only_the_safe_summary_projection() {
        let view = WorkflowsView {
            contracts: vec![ContractSummary {
                key: "contract-1".to_owned(),
                id: "contract-1".to_owned(),
                code: "HD-001".to_owned(),
                name: "Hợp đồng lao động".to_owned(),
                contract_category: "labor".to_owned(),
                contract_template: "Mẫu".to_owned(),
                party_b_type: "employee".to_owned(),
                party_b_name: "Nguyễn An".to_owned(),
                employee_code: "EMP-001".to_owned(),
                employee_name: "Nguyễn An".to_owned(),
                contract_type: "Hợp đồng lao động".to_owned(),
                position: "Kỹ sư".to_owned(),
                department: "R&D".to_owned(),
                start_date: "2026-01-01".to_owned(),
                end_date: "2026-12-31".to_owned(),
                status: "Chờ ký".to_owned(),
                employee_sign_status: "Chưa ký".to_owned(),
                employee_sign_date: None,
                company_sign_status: "Chưa ký".to_owned(),
                company_sign_date: None,
                signature_verification_status: "unverified".to_owned(),
                created_at: "2026-10-09T08:00:00Z".to_owned(),
                updated_at: "2026-10-09T08:00:00Z".to_owned(),
                ..ContractSummary::default()
            }],
            ..WorkflowsView::default()
        };
        let records = view.records();
        assert_eq!(records.len(), 1);
        assert_eq!(records[0].source, RecordSource::Contract);
        assert_eq!(records[0].status, "Chờ ký");
        assert_eq!(
            state_bucket(records[0].source, &records[0].status),
            RecordState::Pending
        );
        assert_eq!(records[0].amount, None);
    }
}
