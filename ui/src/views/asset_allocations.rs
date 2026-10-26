use crate::widgets;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use crate::{
    api::{
        ApiClient, ApiTask, AssetAllocation, AssetAllocationMutationResponse,
        AssetAllocationsResponse, EmployeeListResponse,
    },
    models::{Employee, Session},
};
use egui::{Color32, RichText, Ui};
use serde_json::json;
use web_time::Instant;

const PAGE_SIZE: usize = 8;
const REFRESH_INTERVAL: Duration = Duration::from_secs(30);
static ALLOCATION_SEQUENCE: AtomicU64 = AtomicU64::new(0);
const PURPOSES: &[&str] = &[
    "Cấp phát chính thức cho nhân viên mới",
    "Cấp phát theo dự án ngắn hạn",
    "Thay thế thiết bị bảo hành",
    "Thu hồi do nhân viên nghỉ việc",
    "Thu hồi định kỳ nâng cấp",
    "Thu hồi do chuyển đổi vị trí",
];

#[derive(Default)]
struct AllocationDraft {
    operation_type: String,
    ticket_code: String,
    asset_code: String,
    asset_name: String,
    category: String,
    serial_no: String,
    employee_id: String,
    employee_code: String,
    employee_name: String,
    department: String,
    position: String,
    handover_person: String,
    allocated_date: String,
    expected_return_date: String,
    purpose: String,
    condition: String,
    accessories: String,
    compensation_amount: String,
    notes: String,
}

impl AllocationDraft {
    fn new() -> Self {
        Self {
            operation_type: "Cấp phát".to_owned(),
            allocated_date: chrono::Utc::now().format("%Y-%m-%d").to_string(),
            expected_return_date: "Vô thời hạn (Theo HĐLĐ)".to_owned(),
            purpose: PURPOSES[0].to_owned(),
            compensation_amount: "0".to_owned(),
            ..Self::default()
        }
    }

    fn build(&self, existing: &[AssetAllocation]) -> Result<AssetAllocation, String> {
        for (value, label) in [
            (&self.asset_code, "Mã tài sản"),
            (&self.asset_name, "Tên tài sản"),
            (&self.serial_no, "Số Serial"),
            (&self.employee_code, "Mã nhân viên"),
            (&self.employee_name, "Tên nhân viên"),
            (&self.department, "Phòng ban"),
            (&self.handover_person, "Cán bộ bàn giao"),
            (&self.allocated_date, "Ngày thực hiện"),
            (&self.condition, "Tình trạng thiết bị"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("Vui lòng nhập {label}."));
            }
        }
        if !["Cấp phát", "Thu hồi"].contains(&self.operation_type.as_str()) {
            return Err("Loại nghiệp vụ không hợp lệ.".to_owned());
        }
        let compensation_amount = parse_money(&self.compensation_amount)?;
        let key = format!(
            "alloc-{}-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default(),
            ALLOCATION_SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        let ticket_code = if self.ticket_code.trim().is_empty() {
            let prefix = if self.operation_type == "Cấp phát" {
                "CP"
            } else {
                "TH"
            };
            let generated_suffix = key
                .strip_prefix("alloc-")
                .unwrap_or(key.as_str())
                .replace('-', "");
            format!(
                "{prefix}-{}-{}",
                chrono::Utc::now().format("%Y%m%d"),
                generated_suffix
            )
        } else {
            self.ticket_code.trim().to_owned()
        };
        if existing
            .iter()
            .any(|item| item.ticket_code.eq_ignore_ascii_case(ticket_code.as_str()))
        {
            return Err("Mã biên bản đã tồn tại.".to_owned());
        }
        let status = if self.operation_type == "Cấp phát" {
            "Chờ nhân viên ký xác nhận"
        } else {
            "Chờ xác nhận thu hồi"
        };
        Ok(AssetAllocation {
            key,
            operation_type: self.operation_type.trim().to_owned(),
            ticket_code,
            asset_code: self.asset_code.trim().to_owned(),
            asset_name: self.asset_name.trim().to_owned(),
            category: self.category.trim().to_owned(),
            serial_no: self.serial_no.trim().to_owned(),
            employee_id: (!self.employee_id.trim().is_empty())
                .then(|| self.employee_id.trim().to_owned()),
            employee_code: self.employee_code.trim().to_owned(),
            employee_name: self.employee_name.trim().to_owned(),
            department: self.department.trim().to_owned(),
            position: self.position.trim().to_owned(),
            handover_person: self.handover_person.trim().to_owned(),
            allocated_date: self.allocated_date.trim().to_owned(),
            expected_return_date: self.expected_return_date.trim().to_owned(),
            purpose: self.purpose.trim().to_owned(),
            condition: self.condition.trim().to_owned(),
            accessories: self.accessories.trim().to_owned(),
            compensation_amount: json!(compensation_amount),
            signed_by_receiver: false,
            signed_at: None,
            status: status.to_owned(),
            notes: self.notes.trim().to_owned(),
            received_by_account: false,
            received_at: None,
            received_by_user_id: None,
            received_by_name: None,
            acknowledgement_method: None,
            warehouse_received_at: None,
            warehouse_received_by_user_id: None,
            warehouse_received_by_name: None,
            extra: Default::default(),
        })
    }
}

pub struct AssetAllocationsView {
    allocations: Vec<AssetAllocation>,
    revision: String,
    employees: Vec<Employee>,
    pending_load: Option<ApiTask<AssetAllocationsResponse>>,
    pending_employees: Option<ApiTask<EmployeeListResponse>>,
    pending_save: Option<ApiTask<AssetAllocationsResponse>>,
    pending_acknowledgement: Option<ApiTask<AssetAllocationMutationResponse>>,
    pending_warehouse_receipt: Option<ApiTask<AssetAllocationMutationResponse>>,
    loaded_for: Option<String>,
    data_loaded: bool,
    needs_reload: bool,
    last_loaded: Option<Instant>,
    search: String,
    type_filter: String,
    status_filter: String,
    page: usize,
    page_size: usize,
    form_open: bool,
    draft: AllocationDraft,
    selected_key: Option<String>,
    confirm_acknowledgement_key: Option<String>,
    confirm_warehouse_receipt_key: Option<String>,
    acknowledgement_checked: bool,
    conflicted: bool,
    notice: String,
    error: String,
}

impl Default for AssetAllocationsView {
    fn default() -> Self {
        Self {
            allocations: Vec::new(),
            revision: String::new(),
            employees: Vec::new(),
            pending_load: None,
            pending_employees: None,
            pending_save: None,
            pending_acknowledgement: None,
            pending_warehouse_receipt: None,
            loaded_for: None,
            data_loaded: false,
            needs_reload: true,
            last_loaded: None,
            search: String::new(),
            type_filter: "Tất cả".to_owned(),
            status_filter: "Tất cả".to_owned(),
            page: 0,
            page_size: PAGE_SIZE,
            form_open: false,
            draft: AllocationDraft::new(),
            selected_key: None,
            confirm_acknowledgement_key: None,
            confirm_warehouse_receipt_key: None,
            acknowledgement_checked: false,
            conflicted: false,
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl AssetAllocationsView {
    fn is_admin(session: &Session) -> bool {
        session.user.role == "ADMIN"
    }

    fn is_busy(&self) -> bool {
        self.pending_load.is_some()
            || self.pending_employees.is_some()
            || self.pending_save.is_some()
            || self.pending_acknowledgement.is_some()
            || self.pending_warehouse_receipt.is_some()
    }

    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.is_busy() {
            self.needs_reload = true;
            return;
        }
        self.pending_load = Some(if Self::is_admin(session) {
            api.list_asset_allocations_task(session)
        } else {
            api.list_my_asset_allocations_task(session)
        });
        if Self::is_admin(session) && self.employees.is_empty() {
            self.pending_employees = Some(api.list_employees_task(session));
        }
        self.needs_reload = false;
        self.error.clear();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            *self = Self::default();
            self.loaded_for = Some(session.user.id.clone());
        }
        if self.needs_reload && !self.is_busy() {
            self.request_reload(session, api);
        } else if !self.is_busy()
            && self
                .last_loaded
                .is_none_or(|last_loaded| last_loaded.elapsed() >= REFRESH_INTERVAL)
        {
            self.request_reload(session, api);
        }

        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    let mut allocations = response.data;
                    normalize_allocation_keys(&mut allocations);
                    self.allocations = allocations;
                    self.revision = response.revision;
                    self.data_loaded = true;
                    self.error.clear();
                }
                Err(error) => {
                    self.data_loaded = false;
                    self.error = error;
                }
            }
        }
        if let Some(result) = self.pending_employees.as_ref().and_then(ApiClient::poll) {
            self.pending_employees = None;
            match result {
                Ok(response) => {
                    self.employees = response
                        .data
                        .into_iter()
                        .filter(|employee| employee.is_active && employee.status != "Đã nghỉ việc")
                        .collect();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_save.as_ref().and_then(ApiClient::poll) {
            self.pending_save = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    let mut allocations = response.data;
                    normalize_allocation_keys(&mut allocations);
                    self.allocations = allocations;
                    self.revision = response.revision;
                    self.data_loaded = true;
                    self.notice = "Đã lưu biên bản cấp phát/thu hồi.".to_owned();
                    self.form_open = false;
                    self.draft = AllocationDraft::new();
                    self.conflicted = false;
                }
                Err(error) => {
                    self.notice.clear();
                    if error.contains("thay đổi") || error.contains("changed") {
                        self.conflicted = true;
                        self.needs_reload = true;
                    }
                    self.error = error;
                }
            }
        }
        if let Some(result) = self
            .pending_acknowledgement
            .as_ref()
            .and_then(ApiClient::poll)
        {
            self.pending_acknowledgement = None;
            match result {
                Ok(response) => {
                    self.upsert(response.allocation);
                    self.confirm_acknowledgement_key = None;
                    self.acknowledgement_checked = false;
                    self.notice =
                        "Đã ghi nhận xác nhận tiếp nhận từ tài khoản nhân viên.".to_owned();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self
            .pending_warehouse_receipt
            .as_ref()
            .and_then(ApiClient::poll)
        {
            self.pending_warehouse_receipt = None;
            match result {
                Ok(response) => {
                    self.upsert(response.allocation);
                    self.confirm_warehouse_receipt_key = None;
                    self.notice = "Đã ghi nhận ADMIN xác nhận tài sản về kho.".to_owned();
                }
                Err(error) => self.error = error,
            }
        }
        if self.is_busy() {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(last_loaded) = self.last_loaded {
            ctx.request_repaint_after(REFRESH_INTERVAL.saturating_sub(last_loaded.elapsed()));
        }
    }

    fn upsert(&mut self, allocation: AssetAllocation) {
        let mut allocation = allocation;
        normalize_allocation_keys(std::slice::from_mut(&mut allocation));
        if let Some(existing) = self
            .allocations
            .iter_mut()
            .find(|current| current.key == allocation.key)
        {
            *existing = allocation;
        } else {
            self.allocations.push(allocation);
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.poll(ctx, session, api);
        let is_admin = Self::is_admin(session);
        let busy = self.is_busy();

        if !self.notice.is_empty() {
            ui.add_space(6.0);
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
        }
        if !self.error.is_empty() {
            ui.add_space(6.0);
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        if self.conflicted {
            ui.colored_label(
                Color32::from_rgb(180, 83, 9),
                "Dữ liệu đã đổi ở nơi khác; đã tải lại danh sách. Vui lòng kiểm tra và thao tác lại.",
            );
        }
        if !is_admin {
            ui.add_space(6.0);
            ui.colored_label(
                Color32::from_rgb(71, 85, 105),
                "Xác nhận bằng tài khoản chỉ ghi nhận đã tiếp nhận; đây không phải chữ ký số.",
            );
        }

        if self.data_loaded {
            let pending = self
                .allocations
                .iter()
                .filter(|item| {
                    matches!(
                        item.status.as_str(),
                        "Chờ nhân viên ký xác nhận" | "Chờ xác nhận thu hồi"
                    )
                })
                .count();
            let active = self
                .allocations
                .iter()
                .filter(|item| {
                    item.operation_type == "Cấp phát" && item.status == "Đã bàn giao hoàn tất"
                })
                .count();
            let returned = self
                .allocations
                .iter()
                .filter(|item| {
                    item.operation_type == "Thu hồi" && item.status == "Đã thu hồi về kho"
                })
                .count();
            ui.add_space(10.0);
            widgets::metrics_grid(
                ui,
                "asset-allocations.metrics",
                &[
                    widgets::Metric {
                        label: "Tổng biên bản",
                        value: if self.data_loaded {
                            (self.allocations.len()).to_string()
                        } else {
                            "—".to_owned()
                        },
                        detail: "Cấp phát & thu hồi thiết bị",
                        color: Color32::from_rgb(0, 150, 136),
                        value_size: 22.0,
                    },
                    widgets::Metric {
                        label: "Cấp phát đang hiệu lực",
                        value: if self.data_loaded {
                            (active).to_string()
                        } else {
                            "—".to_owned()
                        },
                        detail: "Theo trạng thái máy chủ",
                        color: Color32::from_rgb(22, 163, 74),
                        value_size: 22.0,
                    },
                    widgets::Metric {
                        label: "Chờ xác nhận",
                        value: if self.data_loaded {
                            (pending).to_string()
                        } else {
                            "—".to_owned()
                        },
                        detail: "Xác nhận qua tài khoản",
                        color: Color32::from_rgb(217, 119, 6),
                        value_size: 22.0,
                    },
                    widgets::Metric {
                        label: "Đã nhập kho",
                        value: if self.data_loaded {
                            (returned).to_string()
                        } else {
                            "—".to_owned()
                        },
                        detail: "Đã ghi nhận nhập kho",
                        color: Color32::from_rgb(37, 99, 235),
                        value_size: 22.0,
                    },
                ],
                egui::vec2(16.0, 16.0),
                240.0,
                4.0,
            );
        } else if busy {
            ui.add_space(12.0);
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải biên bản tài sản…");
            });
        }

        if self.form_open && is_admin {
            self.render_form(ui, session, api, busy);
        }
        self.render_filters(ui);
        ui.horizontal_wrapped(|ui| {
            if ui
                .add_enabled(!busy, egui::Button::new("Làm mới"))
                .clicked()
            {
                self.needs_reload = true;
            }
            if is_admin
                && ui
                    .add_enabled(
                        !busy && self.data_loaded && !self.revision.is_empty(),
                        egui::Button::new(
                            RichText::new("+ Lập phiếu Cấp phát / Thu hồi")
                                .strong()
                                .color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgb(0, 150, 136)),
                    )
                    .clicked()
            {
                self.draft = AllocationDraft::new();
                self.form_open = true;
                self.error.clear();
            }

            ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                .on_hover_text("Chưa có chức năng tạo tệp Excel cho nghiệp vụ này.");
        });
        self.render_table(ui, is_admin, busy);
        self.render_detail(ctx);
        self.render_confirmation_windows(ctx, session, api, busy);
    }

    fn render_form(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient, busy: bool) {
        ui.add_space(8.0);
        let ctx = ui.ctx().clone();
        let (_, closed) = widgets::modal(
            &ctx,
            "asset-allocations.create",
            "Lập Biên Bản Cấp Phát Hoặc Thu Hồi Tài Sản",
            740.0,
            busy,
            |ui| {
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    ui.add_space(8.0);
                }

                ui.label("Mã biên bản có thể để trống để hệ thống tạo mã duy nhất.");
                ui.add_space(6.0);
                ui.horizontal_wrapped(|ui| {
                    ui.label("Loại nghiệp vụ:");
                    widgets::combo_box("asset_allocation_draft_type")
                        .selected_text(&self.draft.operation_type)
                        .show_ui(ui, |ui| {
                            ui.selectable_value(
                                &mut self.draft.operation_type,
                                "Cấp phát".to_owned(),
                                "Cấp phát cho nhân viên",
                            );
                            ui.selectable_value(
                                &mut self.draft.operation_type,
                                "Thu hồi".to_owned(),
                                "Thu hồi về kho",
                            );
                        });
                    ui.label("Mục đích:");
                    widgets::combo_box("asset_allocation_draft_purpose")
                        .selected_text(&self.draft.purpose)
                        .show_ui(ui, |ui| {
                            for purpose in PURPOSES {
                                ui.selectable_value(
                                    &mut self.draft.purpose,
                                    (*purpose).to_owned(),
                                    *purpose,
                                );
                            }
                        });
                });
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |columns| {
                        let column_count = columns.len();
                        text_field(
                            &mut columns[0 % column_count],
                            "Mã biên bản",
                            &mut self.draft.ticket_code,
                        );
                        text_field(
                            &mut columns[1 % column_count],
                            "Mã tài sản",
                            &mut self.draft.asset_code,
                        );
                        text_field(
                            &mut columns[2 % column_count],
                            "Tên tài sản",
                            &mut self.draft.asset_name,
                        );
                    },
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |columns| {
                        let column_count = columns.len();
                        text_field(
                            &mut columns[0 % column_count],
                            "Phân loại",
                            &mut self.draft.category,
                        );
                        text_field(
                            &mut columns[1 % column_count],
                            "Số Serial / Service Tag",
                            &mut self.draft.serial_no,
                        );
                        text_field(
                            &mut columns[2 % column_count],
                            "Mã nhân viên",
                            &mut self.draft.employee_code,
                        );
                    },
                );
                if !self.employees.is_empty() {
                    let mut selected_id = self.draft.employee_id.clone();
                    ui.horizontal(|ui| {
                        ui.label("Chọn hồ sơ nhân viên (nếu đã có tài khoản):");
                        widgets::combo_box("asset_allocation_employee")
                            .selected_text(
                                self.employees
                                    .iter()
                                    .find(|employee| employee.id == selected_id)
                                    .map(|employee| {
                                        format!("{} · {}", employee.code, employee.name)
                                    })
                                    .unwrap_or_else(|| "Nhập mã nhân viên thủ công".to_owned()),
                            )
                            .show_ui(ui, |ui| {
                                ui.selectable_value(
                                    &mut selected_id,
                                    String::new(),
                                    "Nhập mã nhân viên thủ công",
                                );
                                for employee in &self.employees {
                                    ui.selectable_value(
                                        &mut selected_id,
                                        employee.id.clone(),
                                        format!("{} · {}", employee.code, employee.name),
                                    );
                                }
                            });
                    });
                    if selected_id != self.draft.employee_id {
                        self.draft.employee_id = selected_id.clone();
                        if let Some(employee) = self
                            .employees
                            .iter()
                            .find(|employee| employee.id == selected_id)
                        {
                            self.draft.employee_code = employee.code.clone();
                            self.draft.employee_name = employee.name.clone();
                            self.draft.department = employee.department.clone();
                            self.draft.position = employee.position.clone();
                        }
                    }
                }
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |columns| {
                        let column_count = columns.len();
                        text_field(
                            &mut columns[0 % column_count],
                            "Tên nhân viên",
                            &mut self.draft.employee_name,
                        );
                        text_field(
                            &mut columns[1 % column_count],
                            "Phòng ban",
                            &mut self.draft.department,
                        );
                        text_field(
                            &mut columns[2 % column_count],
                            "Chức vụ",
                            &mut self.draft.position,
                        );
                    },
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        3
                    },
                    |columns| {
                        let column_count = columns.len();
                        text_field(
                            &mut columns[0 % column_count],
                            "Cán bộ bàn giao",
                            &mut self.draft.handover_person,
                        );
                        text_field(
                            &mut columns[1 % column_count],
                            "Ngày thực hiện (YYYY-MM-DD)",
                            &mut self.draft.allocated_date,
                        );
                        text_field(
                            &mut columns[2 % column_count],
                            "Hạn trả dự kiến",
                            &mut self.draft.expected_return_date,
                        );
                    },
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        2
                    },
                    |columns| {
                        let column_count = columns.len();
                        text_field(
                            &mut columns[0 % column_count],
                            "Tình trạng kỹ thuật / ngoại quan",
                            &mut self.draft.condition,
                        );
                        text_field(
                            &mut columns[1 % column_count],
                            "Phụ kiện đi kèm",
                            &mut self.draft.accessories,
                        );
                    },
                );
                ui.columns(
                    if ui.ctx().screen_rect().width() <= 992.0 {
                        1
                    } else {
                        2
                    },
                    |columns| {
                        let column_count = columns.len();
                        text_field(
                            &mut columns[0 % column_count],
                            "Bồi thường (VND, nếu có)",
                            &mut self.draft.compensation_amount,
                        );
                        text_field(
                            &mut columns[1 % column_count],
                            "Ghi chú",
                            &mut self.draft.notes,
                        );
                    },
                );
                ui.horizontal(|ui| {
                    if ui.add_enabled(!busy, egui::Button::new("Hủy")).clicked() {
                        self.form_open = false;
                        self.error.clear();
                    }
                    if ui
                        .add_enabled(
                            !busy && !self.revision.is_empty(),
                            egui::Button::new("Lưu biên bản").fill(Color32::from_rgb(0, 150, 136)),
                        )
                        .clicked()
                    {
                        match self.draft.build(&self.allocations) {
                            Ok(record) => {
                                let mut next = self.allocations.clone();
                                next.push(record);
                                self.pending_save = Some(api.replace_asset_allocations_task(
                                    session,
                                    &next,
                                    &self.revision,
                                ));
                                self.error.clear();
                            }
                            Err(error) => self.error = error,
                        }
                    }
                });
            },
        );
        if closed {
            self.form_open = false;
        }
    }

    fn render_filters(&mut self, ui: &mut Ui) {
        ui.add_space(8.0);
        ui.horizontal_wrapped(|ui| {
            ui.label("Tìm:");
            {
                let (rect, _) = ui.allocate_exact_size(
                    egui::vec2(300.0_f32.min(ui.available_width()), 32.0),
                    egui::Sense::hover(),
                );
                widgets::search_input(
                    ui,
                    rect,
                    &mut self.search,
                    "Mã phiếu, tài sản, Serial, nhân viên, phòng ban",
                )
            };
            ui.label("Loại:");
            widgets::combo_box("asset_allocation_type_filter")
                .selected_text(&self.type_filter)
                .show_ui(ui, |ui| {
                    for item in ["Tất cả", "Cấp phát", "Thu hồi"] {
                        ui.selectable_value(&mut self.type_filter, item.to_owned(), item);
                    }
                });
            ui.label("Trạng thái:");
            widgets::combo_box("asset_allocation_status_filter")
                .selected_text(&self.status_filter)
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut self.status_filter, "Tất cả".to_owned(), "Tất cả");
                    let mut statuses = self
                        .allocations
                        .iter()
                        .map(|item| item.status.as_str())
                        .filter(|status| !status.trim().is_empty())
                        .collect::<Vec<_>>();
                    statuses.sort_unstable();
                    statuses.dedup();
                    for status in statuses {
                        ui.selectable_value(&mut self.status_filter, status.to_owned(), status);
                    }
                });
        });
    }

    fn render_table(&mut self, ui: &mut Ui, is_admin: bool, busy: bool) {
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .allocations
            .iter()
            .filter(|item| {
                let matches_search = query.is_empty()
                    || [
                        item.ticket_code.as_str(),
                        item.asset_code.as_str(),
                        item.asset_name.as_str(),
                        item.serial_no.as_str(),
                        item.employee_code.as_str(),
                        item.employee_name.as_str(),
                        item.department.as_str(),
                    ]
                    .iter()
                    .any(|field| field.to_lowercase().contains(&query));
                matches_search
                    && (self.type_filter == "Tất cả" || self.type_filter == item.operation_type)
                    && (self.status_filter == "Tất cả" || self.status_filter == item.status)
            })
            .collect::<Vec<_>>();
        let pages = filtered.len().div_ceil(self.page_size).max(1);
        self.page = self.page.min(pages - 1);
        let start = self.page * self.page_size;
        let end = (start + self.page_size).min(filtered.len());

        widgets::table(
            ui,
            "asset-allocations.table",
            &[
                widgets::TableColumn {
                    title: "Mã biên bản & Loại",
                    width: 170.0,
                },
                widgets::TableColumn {
                    title: "Thiết bị & Số Serial",
                    width: 280.0,
                },
                widgets::TableColumn {
                    title: "Cán bộ nhận / bàn giao",
                    width: 230.0,
                },
                widgets::TableColumn {
                    title: "Ngày thực hiện",
                    width: 120.0,
                },
                widgets::TableColumn {
                    title: "Tình trạng thiết bị",
                    width: 190.0,
                },
                widgets::TableColumn {
                    title: "Trạng thái & Xác nhận",
                    width: 240.0,
                },
                widgets::TableColumn {
                    title: "Thao tác",
                    width: 200.0,
                },
            ],
            end.saturating_sub(start),
            |ui, row, column| {
                let item = filtered[start + row];
                match column {
                    0 => {
                        ui.label(RichText::new(&item.ticket_code).strong().color(
                            if item.operation_type == "Cấp phát" {
                                Color32::from_rgb(0, 150, 136)
                            } else {
                                Color32::from_rgb(37, 99, 235)
                            },
                        ));
                        widgets::tag(
                            ui,
                            &item.operation_type,
                            if item.operation_type == "Cấp phát" {
                                widgets::TagTone::Cyan
                            } else {
                                widgets::TagTone::Processing
                            },
                        );
                    }
                    1 => {
                        ui.strong(&item.asset_name);
                        ui.small(format!(
                            "Mã TS: {} · Serial: {}",
                            item.asset_code, item.serial_no
                        ));
                    }
                    2 => {
                        ui.strong(&item.employee_name);
                        ui.small(format!("{} · {}", item.position, item.department));
                        ui.small(&item.employee_code);
                    }
                    3 => {
                        ui.label(&item.allocated_date);
                    }
                    4 => {
                        ui.label(&item.condition);
                    }
                    5 => {
                        widgets::tag(
                            ui,
                            &item.status,
                            if item.status.starts_with("Chờ") {
                                widgets::TagTone::Warning
                            } else {
                                widgets::TagTone::Success
                            },
                        );
                        ui.small(receipt_label(item));
                    }
                    6 => {
                        ui.horizontal_wrapped(|ui| {
                            if ui.button("Xem").clicked() {
                                self.selected_key = Some(item.key.clone());
                            }
                            if !is_admin
                                && item.operation_type == "Cấp phát"
                                && item.status == "Chờ nhân viên ký xác nhận"
                            {
                                if ui
                                    .add_enabled(!busy, egui::Button::new("Xác nhận đã nhận"))
                                    .clicked()
                                {
                                    self.confirm_acknowledgement_key = Some(item.key.clone());
                                    self.acknowledgement_checked = false;
                                }
                            }
                            if is_admin
                                && item.operation_type == "Thu hồi"
                                && item.status == "Chờ xác nhận thu hồi"
                            {
                                if ui
                                    .add_enabled(!busy, egui::Button::new("Xác nhận nhập kho"))
                                    .clicked()
                                {
                                    self.confirm_warehouse_receipt_key = Some(item.key.clone());
                                }
                            }
                        });
                    }
                    _ => {}
                }
            },
        );
        ui.add_space(12.0);
        widgets::pagination(
            ui,
            "asset-allocations.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
    }

    fn render_detail(&mut self, ctx: &egui::Context) {
        let Some(item) = self
            .selected_key
            .as_deref()
            .and_then(|key| self.allocations.iter().find(|item| item.key == key))
            .cloned()
        else {
            return;
        };
        let (_, closed) = widgets::drawer(
            ctx,
            "asset-allocations.detail",
            "Biên Bản Bàn Giao Tài Sản & Cam Kết Sử Dụng",
            600.0,
            |ui| {
                ui.heading(format!(
                    "Biên bản {} · {}",
                    item.ticket_code, item.operation_type
                ));
                ui.horizontal_wrapped(|ui| {
                    ui.label(format!(
                        "Tài sản: {} ({})",
                        item.asset_name, item.asset_code
                    ));
                    ui.label(format!("Serial: {}", item.serial_no));
                    ui.label(format!("Phân loại: {}", item.category));
                });
                ui.horizontal_wrapped(|ui| {
                    ui.label(format!(
                        "Nhân viên: {} ({})",
                        item.employee_name, item.employee_code
                    ));
                    ui.label(format!("{} · {}", item.position, item.department));
                    ui.label(format!("Người bàn giao: {}", item.handover_person));
                });
                ui.horizontal_wrapped(|ui| {
                    ui.label(format!("Ngày: {}", item.allocated_date));
                    ui.label(format!("Hạn trả: {}", item.expected_return_date));
                    ui.label(format!("Mục đích: {}", item.purpose));
                });
                ui.label(format!("Tình trạng: {}", item.condition));
                ui.label(format!("Phụ kiện: {}", item.accessories));
                ui.label(format!("Bồi thường: {} VND", item.compensation_amount));
                if !item.notes.is_empty() {
                    ui.label(format!("Ghi chú: {}", item.notes));
                }
                ui.separator();
                ui.label(receipt_label(&item));
                if item.signed_by_receiver && !item.received_by_account {
                    ui.colored_label(
                    Color32::from_rgb(180, 83, 9),
                    format!(
                        "Bản ghi legacy có cờ ký{}; hệ thống Rust không có bằng chứng xác minh chữ ký.",
                        item.signed_at
                            .as_deref()
                            .map(|date| format!(" tại {date}"))
                            .unwrap_or_default()
                    ),
                );
                }
                if let Some(received_at) = item.warehouse_received_at.as_deref() {
                    ui.label(format!(
                        "Kho xác nhận bởi {} lúc {}.",
                        item.warehouse_received_by_name
                            .as_deref()
                            .unwrap_or("ADMIN"),
                        received_at
                    ));
                }
                ui.add_enabled(false, egui::Button::new("In biên bản bàn giao (PDF)"))
                    .on_hover_text("Chưa có chức năng tạo PDF biên bản bàn giao.");
            },
        );
        if closed {
            self.selected_key = None;
        }
    }

    fn render_confirmation_windows(
        &mut self,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        busy: bool,
    ) {
        if let Some(key) = self.confirm_acknowledgement_key.clone() {
            let item = self.allocations.iter().find(|item| item.key == key);
            let mut open = true;
            let (_, closed) = widgets::modal(
                ctx,
                "asset-allocations-0",
                "Xác nhận tiếp nhận tài sản",
                480.0,
                busy,
                |ui| {
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                        ui.add_space(8.0);
                    }

                    if let Some(item) = item {
                        ui.label(format!(
                            "Bạn xác nhận đã nhận {} ({}) theo biên bản {}?",
                            item.asset_name, item.asset_code, item.ticket_code
                        ));
                        ui.add_space(6.0);
                        ui.checkbox(
                            &mut self.acknowledgement_checked,
                            "Tôi đã kiểm tra tài sản và phụ kiện theo biên bản.",
                        );
                        ui.small("Đây là xác nhận tiếp nhận bằng tài khoản; không phải chữ ký số.");
                        ui.horizontal(|ui| {
                            if ui.button("Hủy").clicked() {
                                self.confirm_acknowledgement_key = None;
                            }
                            if ui
                                .add_enabled(
                                    self.acknowledgement_checked && !busy,
                                    egui::Button::new("Ghi nhận đã nhận")
                                        .fill(Color32::from_rgb(0, 150, 136)),
                                )
                                .clicked()
                            {
                                self.pending_acknowledgement =
                                    Some(api.acknowledge_asset_receipt_task(session, &key));
                                self.error.clear();
                            }
                        });
                    } else {
                        ui.label("Biên bản không còn trong danh sách hiện tại.");
                    }
                },
            );
            open &= !closed;
            if !open {
                self.confirm_acknowledgement_key = None;
                self.acknowledgement_checked = false;
            }
        }
        if let Some(key) = self.confirm_warehouse_receipt_key.clone() {
            let item = self.allocations.iter().find(|item| item.key == key);
            let mut open = true;
            let (_, closed) = widgets::modal(
                ctx,
                "asset-allocations-1",
                "Xác nhận nhập kho",
                480.0,
                busy,
                |ui| {
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                        ui.add_space(8.0);
                    }

                    if let Some(item) = item {
                        ui.label(format!(
                            "Xác nhận đã tiếp nhận {} ({}) từ {} theo phiếu {}.",
                            item.asset_name, item.asset_code, item.employee_name, item.ticket_code
                        ));
                        ui.small("Thao tác được ghi vào audit log; không đánh dấu chữ ký số của nhân viên.");
                        ui.horizontal(|ui| {
                            if ui.button("Hủy").clicked() {
                                self.confirm_warehouse_receipt_key = None;
                            }
                            if ui
                                .add_enabled(
                                    !busy,
                                    egui::Button::new("Xác nhận đã nhập kho")
                                        .fill(Color32::from_rgb(0, 150, 136)),
                                )
                                .clicked()
                            {
                                self.pending_warehouse_receipt =
                                    Some(api.confirm_asset_return_to_warehouse_task(session, &key));
                                self.error.clear();
                            }
                        });
                    } else {
                        ui.label("Biên bản không còn trong danh sách hiện tại.");
                    }
                },
            );
            open &= !closed;
            if !open {
                self.confirm_warehouse_receipt_key = None;
            }
        }
    }
}

fn text_field(ui: &mut Ui, label: &str, value: &mut String) {
    if label.starts_with("Ngày") {
        widgets::form_date(ui, label, label, true, value);
    } else {
        widgets::form_input(ui, label, label, false, value, "", false);
    }
}

fn normalize_allocation_keys(allocations: &mut [AssetAllocation]) {
    for allocation in allocations {
        if allocation.key.trim().is_empty() {
            allocation.key = allocation
                .extra
                .get("id")
                .and_then(serde_json::Value::as_str)
                .filter(|id| !id.trim().is_empty())
                .or_else(|| {
                    allocation
                        .extra
                        .get("key")
                        .and_then(serde_json::Value::as_str)
                        .filter(|key| !key.trim().is_empty())
                })
                .or_else(|| {
                    (!allocation.ticket_code.trim().is_empty())
                        .then_some(allocation.ticket_code.as_str())
                })
                .unwrap_or_default()
                .to_owned();
        }
    }
}

fn receipt_label(item: &AssetAllocation) -> String {
    if item.received_by_account {
        format!(
            "Đã xác nhận qua tài khoản{}{}",
            item.received_by_name
                .as_deref()
                .map(|name| format!(" · {name}"))
                .unwrap_or_default(),
            item.received_at
                .as_deref()
                .map(|date| format!(" · {date}"))
                .unwrap_or_default()
        )
    } else if item.signed_by_receiver {
        "Legacy có cờ ký; chưa xác minh chữ ký".to_owned()
    } else if item.operation_type == "Thu hồi" && item.warehouse_received_at.is_some() {
        "Đã xác nhận nhập kho".to_owned()
    } else if item.status.starts_with("Chờ") {
        "Đang chờ xác nhận".to_owned()
    } else {
        "Chưa ghi nhận xác nhận tiếp nhận".to_owned()
    }
}

fn parse_money(value: &str) -> Result<u64, String> {
    let compact = value
        .trim()
        .chars()
        .filter(|character| !matches!(character, '.' | ',' | ' ' | '_'))
        .collect::<String>();
    if compact.is_empty() {
        return Ok(0);
    }
    if !compact.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("Số tiền bồi thường phải là số nguyên VND không âm.".to_owned());
    }
    compact
        .parse::<u64>()
        .map_err(|_| "Số tiền bồi thường vượt giới hạn.".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn new_issue_waits_for_real_employee_account_acknowledgement() {
        let mut draft = AllocationDraft::new();
        draft.asset_code = "TS-100".to_owned();
        draft.asset_name = "Laptop".to_owned();
        draft.serial_no = "SN-100".to_owned();
        draft.employee_code = "EMP-100".to_owned();
        draft.employee_name = "Nguyễn An".to_owned();
        draft.department = "Kỹ thuật".to_owned();
        draft.handover_person = "Lê Bình".to_owned();
        draft.condition = "Hoạt động tốt".to_owned();

        let allocation = draft.build(&[]).expect("valid issue record");

        assert_eq!(allocation.status, "Chờ nhân viên ký xác nhận");
        assert!(!allocation.signed_by_receiver);
        assert!(!allocation.received_by_account);
        assert!(allocation.signed_at.is_none());
        assert!(allocation.ticket_code.starts_with("CP-"));
    }

    #[test]
    fn return_record_is_not_claimed_as_received_until_admin_confirms_it() {
        let mut draft = AllocationDraft::new();
        draft.operation_type = "Thu hồi".to_owned();
        draft.asset_code = "TS-100".to_owned();
        draft.asset_name = "Laptop".to_owned();
        draft.serial_no = "SN-100".to_owned();
        draft.employee_code = "EMP-100".to_owned();
        draft.employee_name = "Nguyễn An".to_owned();
        draft.department = "Kỹ thuật".to_owned();
        draft.handover_person = "Lê Bình".to_owned();
        draft.condition = "Đang kiểm tra".to_owned();

        let allocation = draft.build(&[]).expect("valid return record");

        assert_eq!(allocation.status, "Chờ xác nhận thu hồi");
        assert!(!allocation.signed_by_receiver);
        assert!(allocation.warehouse_received_at.is_none());
        assert!(allocation.ticket_code.starts_with("TH-"));
    }

    #[test]
    fn draft_validates_required_fields_money_and_duplicate_ticket_codes() {
        let mut draft = AllocationDraft::new();
        assert!(draft.build(&[]).is_err());
        draft.asset_code = "TS-100".to_owned();
        draft.asset_name = "Laptop".to_owned();
        draft.serial_no = "SN-100".to_owned();
        draft.employee_code = "EMP-100".to_owned();
        draft.employee_name = "Nguyễn An".to_owned();
        draft.department = "Kỹ thuật".to_owned();
        draft.handover_person = "Lê Bình".to_owned();
        draft.condition = "Hoạt động tốt".to_owned();
        draft.ticket_code = "CP-DUP".to_owned();
        assert!(
            draft
                .build(&[AssetAllocation {
                    ticket_code: "cp-dup".to_owned(),
                    ..Default::default()
                }])
                .is_err()
        );
        draft.ticket_code.clear();
        draft.compensation_amount = "-500".to_owned();
        assert!(draft.build(&[]).is_err());
    }

    #[test]
    fn receipt_labels_distinguish_legacy_signature_flags_from_verified_account_receipts() {
        let legacy = AssetAllocation {
            signed_by_receiver: true,
            ..Default::default()
        };
        assert!(receipt_label(&legacy).contains("chưa xác minh"));
        let acknowledged = AssetAllocation {
            received_by_account: true,
            received_by_name: Some("Nguyễn An".to_owned()),
            received_at: Some("2026-10-09T00:00:00Z".to_owned()),
            ..Default::default()
        };
        assert!(receipt_label(&acknowledged).contains("Nguyễn An"));
        assert_eq!(parse_money("1.250.000"), Ok(1_250_000));
        assert_eq!(parse_money(""), Ok(0));
        assert!(parse_money("12.5x").is_err());
        assert_eq!(json!(1_250_000).as_u64(), Some(1_250_000));
    }
}
