use crate::{
    api::{ApiClient, ApiTask, EmployeeListResponse, GenericCollectionResponse},
    models::{Employee, Session},
    widgets::{self, Metric, TableColumn, TagTone},
};
use chrono::{Datelike, NaiveDate};
use egui::{Color32, RichText, Ui};
use serde_json::Value;
use std::{collections::BTreeMap, time::Duration};
use web_time::Instant;

const UNKNOWN: &str = "—";
const WRITE_UNAVAILABLE: &str = "Máy chủ chưa trả phiên bản cho danh sách này; thao tác lưu bị khóa để tránh ghi đè. Cần API nghiệp vụ để phê duyệt, tính công và đồng bộ.";
const EXPORT_UNAVAILABLE: &str = "Chưa có API trả tệp báo cáo được máy chủ xác nhận.";

#[derive(Clone, Copy, Default, PartialEq, Eq, Debug)]
enum Page {
    #[default]
    Timesheet,
    Raw,
    Summary,
    Alerts,
    Leaves,
    Plans,
}

impl Page {
    fn for_path(path: &str) -> Option<Self> {
        Some(match path {
            "/admin/attendance/timesheet" | "/admin/attendance/timesheet/detail" => Self::Timesheet,
            "/admin/attendance/timesheet/data" => Self::Raw,
            "/admin/attendance/timesheet/summary" => Self::Summary,
            "/admin/attendance/alerts" => Self::Alerts,
            "/admin/attendance/requests/leaves" => Self::Leaves,
            "/admin/attendance/requests/plans" => Self::Plans,
            _ => return None,
        })
    }

    fn scope(self) -> &'static str {
        match self {
            Self::Raw | Self::Timesheet => "attendance_raw_data",
            Self::Summary => "attendance_timesheet_summary",
            Self::Alerts => "attendance_alerts",
            Self::Leaves => "attendance_leave_summary",
            Self::Plans => "attendance_leave_plans",
        }
    }

    fn action(self) -> &'static str {
        match self {
            Self::Raw => "Đồng bộ máy quét IoT",
            Self::Timesheet => "Xuất Excel",
            Self::Summary => "Điều chỉnh ngày công",
            Self::Alerts => "Ghi nhận cảnh báo mới",
            Self::Leaves => "Điều chỉnh quỹ phép",
            Self::Plans => "Đăng ký kế hoạch nghỉ",
        }
    }

    fn drawer_title(self) -> &'static str {
        match self {
            Self::Raw => "Gói Dữ Liệu Raw Log IoT & AI Inspection",
            Self::Timesheet => "Bảng Chấm Công Chi Tiết & Lịch Sử Điểm Danh",
            Self::Summary => "Chi Tiết Bảng Công Tổng Hợp & Cấu Thành Lương",
            Self::Alerts => "Hồ Sơ Giải Trình Bất Thường & Xử Lý Chuyên Cần",
            Self::Leaves => "Sổ Theo Dõi Quỹ Phép Năm & Lịch Sử Nghỉ Phép",
            Self::Plans => "Kế Hoạch Nghỉ Dài Ngày & Biên Bản Bàn Giao",
        }
    }

    fn form_title(self) -> &'static str {
        match self {
            Self::Summary => "Thêm Hoặc Điều Chỉnh Ngày Công & Giờ Tăng Ca",
            Self::Alerts => "Ghi Nhận Cảnh Báo Chấm Công Bất Thường Mới",
            Self::Leaves => "Điều Chỉnh Hạn Mức Quỹ Phép Năm & Thâm Niên",
            Self::Plans => "Đăng Ký Kế Hoạch Nghỉ Dài Hạn & Phương Án Bàn Giao",
            _ => "Thông tin chấm công",
        }
    }

    fn filters(self) -> (&'static str, Vec<&'static str>) {
        match self {
            Self::Raw => (
                "verifyMode",
                vec![
                    "Tất cả log",
                    "FaceID AI",
                    "Thẻ Từ NFC",
                    "Mobile Geofence GPS",
                    "Vân Tay",
                ],
            ),
            Self::Alerts => (
                "status",
                vec![
                    "Tất cả cảnh báo",
                    "Chờ nhân viên giải trình",
                    "Đã giải trình hợp lệ",
                    "Đã trừ phạt chuyên cần",
                ],
            ),
            Self::Leaves => (
                "status",
                vec![
                    "Tất cả nhân sự",
                    "Còn nhiều phép",
                    "Sắp hết phép",
                    "Đã hết phép",
                ],
            ),
            Self::Plans => (
                "leaveType",
                vec![
                    "Tất cả kế hoạch",
                    "Nghỉ thai sản (6 tháng)",
                    "Nghỉ kết hôn (3 ngày)",
                    "Nghỉ phép năm dài ngày",
                    "Nghỉ việc riêng / Dưỡng sức",
                ],
            ),
            _ => ("department", vec!["Tất cả phòng ban"]),
        }
    }
}

#[derive(Default)]
pub(super) struct AttendanceRecordsView {
    account: String,
    page_kind: Page,
    records: Vec<Value>,
    task: Option<ApiTask<GenericCollectionResponse>>,
    employees: Vec<Employee>,
    employees_task: Option<ApiTask<EmployeeListResponse>>,
    loaded: bool,
    employees_loaded: bool,
    last_loaded: Option<Instant>,
    error: String,
    employees_error: String,
    search: String,
    filter: String,
    month: String,
    page: usize,
    page_size: usize,
    selected: Option<Value>,
    selected_employee: Option<Employee>,
    form_open: bool,
    form: BTreeMap<String, String>,
}

impl AttendanceRecordsView {
    fn load(&mut self, session: &Session, api: &ApiClient) {
        if self.task.is_none() {
            self.task = Some(api.list_generic_collection_task(session, self.page_kind.scope()));
        }
        if self.page_kind == Page::Timesheet && self.employees_task.is_none() {
            self.employees_task = Some(api.list_employees_task(session));
        }
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient, kind: Page) {
        let account = format!(
            "{}\n{}\n{}",
            session.endpoint, session.user.id, session.user.role
        );
        if self.account != account || self.page_kind != kind {
            *self = Self {
                account,
                page_kind: kind,
                page_size: 8,
                month: chrono::Utc::now().format("%Y-%m").to_string(),
                ..Default::default()
            };
        }
        if self.task.is_none()
            && self.employees_task.is_none()
            && self
                .last_loaded
                .is_none_or(|last| last.elapsed() >= Duration::from_secs(30))
        {
            self.load(session, api);
        }
        if let Some(result) = self.task.as_ref().and_then(ApiClient::poll) {
            self.task = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.records = response.data;
                    self.loaded = true;
                    self.error.clear();
                }
                Err(error) => {
                    self.loaded = false;
                    self.error = error;
                }
            }
        }
        if let Some(result) = self.employees_task.as_ref().and_then(ApiClient::poll) {
            self.employees_task = None;
            match result {
                Ok(response) => {
                    self.employees = response.data;
                    self.employees_loaded = true;
                    self.employees_error.clear();
                }
                Err(error) => {
                    self.employees_loaded = false;
                    self.employees_error = error;
                }
            }
        }
        ctx.request_repaint_after(if self.task.is_some() || self.employees_task.is_some() {
            Duration::from_millis(100)
        } else {
            Duration::from_secs(30).saturating_sub(
                self.last_loaded
                    .map_or(Duration::ZERO, |last| last.elapsed()),
            )
        });
    }

    pub(super) fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        path: &str,
    ) {
        let Some(kind) = Page::for_path(path) else {
            ui.label("Không tìm thấy trang chấm công.");
            return;
        };
        if session.user.role != "ADMIN" {
            *self = Self::default();
            ui.label("Bạn không có quyền truy cập dữ liệu chấm công.");
            return;
        }
        self.poll(ctx, session, api, kind);
        ui.add_space(8.0);
        self.render_metrics(ui);
        ui.add_space(16.0);
        if kind == Page::Timesheet {
            self.render_timesheet(ui);
        } else {
            self.render_toolbar(ui, session, api);
            ui.add_space(12.0);
            if self.loaded {
                self.render_table(ui);
            }
        }
        if self.task.is_some() || self.employees_task.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải dữ liệu từ máy chủ…");
            });
        }
        for error in [&self.error, &self.employees_error] {
            if !error.is_empty() {
                ui.colored_label(Color32::from_rgb(185, 28, 28), error);
            }
        }
        if kind != Page::Timesheet {
            ui.horizontal_wrapped(|ui| {
                if ui
                    .add_enabled(self.task.is_none(), egui::Button::new("Làm mới"))
                    .clicked()
                {
                    self.load(session, api);
                }
            });
        } else if ui
            .add_enabled(
                self.task.is_none() && self.employees_task.is_none(),
                egui::Button::new("Làm mới"),
            )
            .clicked()
        {
            self.load(session, api);
        }
        self.render_details(ctx);
        if self.form_open {
            self.render_form(ctx);
        }
    }

    fn render_metrics(&self, ui: &mut Ui) {
        let count = |status: &str| {
            self.records
                .iter()
                .filter(|r| text(r, "status") == status)
                .count()
                .to_string()
        };
        let total = self.records.len().to_string();
        let sum = |key| {
            total_number(&self.records, key)
                .map(format_number)
                .unwrap_or_else(|| UNKNOWN.into())
        };
        let (labels, values, details): ([&str; 4], [String; 4], [&str; 4]) = match self.page_kind {
            Page::Raw => (
                [
                    "Tổng bản ghi nhận diện thu thập",
                    "Bản ghi hợp lệ đã ghi nhận công",
                    "Bản ghi trùng lặp (Lọc thông minh)",
                    "Thiết bị IoT kết nối thời gian thực",
                ],
                [
                    total,
                    count("Dữ liệu hợp lệ"),
                    count("Bản ghi trùng lặp (Đã lọc)"),
                    UNKNOWN.into(),
                ],
                [
                    "Bản ghi lưu trên máy chủ",
                    "Theo trạng thái bản ghi nguồn",
                    "Theo trạng thái bản ghi nguồn",
                    "Chưa có API trạng thái gateway",
                ],
            ),
            Page::Summary => (
                [
                    "Tổng ngày công thực tế toàn công ty",
                    "Tổng giờ làm thêm tăng ca (OT)",
                    "Tỷ lệ chuyên cần bình quân",
                    "Chuyển tiếp sang Tính Lương",
                ],
                [
                    sum("actualDays"),
                    total_number(&self.records, "otHoursWeekday")
                        .zip(total_number(&self.records, "otHoursWeekend"))
                        .map(|(a, b)| format_number(a + b))
                        .unwrap_or_else(|| UNKNOWN.into()),
                    average_number(&self.records, "attendanceRate")
                        .map(|n| format!("{}%", format_number(n)))
                        .unwrap_or_else(|| UNKNOWN.into()),
                    UNKNOWN.into(),
                ],
                [
                    "Tổng ngày công từ bảng tổng hợp",
                    "Giờ OT do máy chủ cung cấp",
                    "Trung bình tỷ lệ có trong nguồn",
                    "Chưa có API xác nhận chuyển tính lương",
                ],
            ),
            Page::Alerts => (
                [
                    "Tổng bất thường ghi nhận",
                    "Chờ nhân sự gửi giải trình",
                    "Đã duyệt giải trình hợp lệ",
                    "Đã trừ phạt chuyên cần",
                ],
                [
                    total,
                    count("Chờ nhân viên giải trình"),
                    count("Đã giải trình hợp lệ"),
                    count("Đã trừ phạt chuyên cần"),
                ],
                [
                    "Sự vụ lưu trên máy chủ",
                    "Theo trạng thái hồ sơ",
                    "Theo trạng thái hồ sơ",
                    "Chưa xác nhận hạch toán vào kỳ lương",
                ],
            ),
            Page::Leaves => (
                [
                    "Tổng quỹ phép năm toàn công ty",
                    "Đã sử dụng nghỉ trong năm",
                    "Quỹ phép khả dụng còn lại",
                    "Chính sách phép thâm niên",
                ],
                [
                    sum("totalEntitled"),
                    sum("usedLeaves"),
                    sum("remainingLeaves"),
                    UNKNOWN.into(),
                ],
                [
                    "Quỹ phép từ dữ liệu nguồn",
                    "Ngày phép từ dữ liệu nguồn",
                    "Không tự suy diễn hạn sử dụng",
                    "Chưa có nguồn chính sách được xác nhận",
                ],
            ),
            Page::Plans => (
                [
                    "Tổng kế hoạch nghỉ phép dài hạn",
                    "Kế hoạch đã phê duyệt",
                    "Kế hoạch chờ phê duyệt",
                    "Bảo toàn vận hành hệ thống",
                ],
                [
                    total,
                    count("Đã duyệt kế hoạch"),
                    count("Chờ phê duyệt"),
                    UNKNOWN.into(),
                ],
                [
                    "Kế hoạch lưu trên máy chủ",
                    "Theo trạng thái hồ sơ",
                    "Cần xem phương án bàn giao",
                    "Chưa có nguồn đánh giá mức độ đảm bảo",
                ],
            ),
            Page::Timesheet => (
                [
                    "Số ngày công chuẩn của tháng",
                    "Tỷ lệ ngày công đạt chuẩn",
                    "Lượt nghỉ phép hưởng lương (P)",
                    "Tổng giờ làm thêm dự án (OT)",
                ],
                std::array::from_fn(|_| UNKNOWN.into()),
                [
                    "Chưa có lịch công chuẩn được xác nhận",
                    "Chưa có API công theo ngày",
                    "Chưa có công phép theo tháng",
                    "Chưa có số giờ OT theo tháng",
                ],
            ),
        };
        let colors = [
            crate::theme::PRIMARY,
            Color32::from_rgb(22, 163, 74),
            Color32::from_rgb(217, 119, 6),
            Color32::from_rgb(37, 99, 235),
        ];
        let items = (0..4)
            .map(|i| Metric {
                label: labels[i],
                value: if self.loaded {
                    values[i].clone()
                } else {
                    UNKNOWN.into()
                },
                detail: details[i],
                color: colors[i],
                value_size: 24.0,
            })
            .collect::<Vec<_>>();
        widgets::metrics(ui, "attendance.records.metrics", &items);
    }

    fn render_toolbar(&mut self, ui: &mut Ui, _session: &Session, _api: &ApiClient) {
        let (_, base) = self.page_kind.filters();
        let mut filters = base.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        if self.page_kind == Page::Summary {
            filters.extend(
                self.records
                    .iter()
                    .filter_map(|r| r.get("department").and_then(Value::as_str))
                    .filter(|d| !d.is_empty())
                    .map(str::to_owned),
            );
            filters[1..].sort();
            filters.dedup();
        }
        ui.horizontal_wrapped(|ui| {
            for (i, label) in filters.iter().enumerate() {
                let selected = if i == 0 {
                    self.filter.is_empty()
                } else {
                    self.filter == *label
                };
                if ui
                    .add(
                        egui::Button::new(RichText::new(label).size(12.0).color(if selected {
                            Color32::from_rgb(0, 121, 107)
                        } else {
                            Color32::from_rgb(71, 85, 105)
                        }))
                        .fill(if selected {
                            Color32::from_rgb(224, 242, 241)
                        } else {
                            Color32::WHITE
                        }),
                    )
                    .clicked()
                {
                    self.filter = if i == 0 { String::new() } else { label.clone() };
                    self.page = 0;
                }
            }
        });
        ui.add_space(8.0);
        ui.horizontal_wrapped(|ui| {
            let (rect, _) = ui.allocate_exact_size(
                egui::vec2(280.0_f32.min(ui.available_width()), 32.0),
                egui::Sense::hover(),
            );
            if widgets::search_input(
                ui,
                rect,
                &mut self.search,
                "Tìm theo mã, tên nhân sự, phòng ban…",
            )
            .changed()
            {
                self.page = 0;
            }
            disabled_action(
                ui,
                if self.page_kind == Page::Raw {
                    "Xuất File Log"
                } else {
                    "Xuất Báo Cáo"
                },
                EXPORT_UNAVAILABLE,
            );
            if self.page_kind == Page::Raw {
                disabled_action(
                    ui,
                    self.page_kind.action(),
                    "Chưa có API đồng bộ máy quét IoT.",
                );
            } else if ui.button(self.page_kind.action()).clicked() {
                self.form.clear();
                self.form_open = true;
            }
        });
    }

    fn render_table(&mut self, ui: &mut Ui) {
        let (field, _) = self.page_kind.filters();
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .records
            .iter()
            .filter(|r| record_matches(r, field, &self.filter, &query))
            .cloned()
            .collect::<Vec<_>>();
        self.page_size = self.page_size.max(1);
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let rows = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        let columns = columns(self.page_kind, ui.available_width());
        widgets::table_with_row_height(
            ui,
            "attendance.records.table",
            &columns,
            rows.len(),
            76.0,
            |ui, row, col| {
                let record = rows[row];
                if col + 1 == columns.len() {
                    let label = match self.page_kind {
                        Page::Raw => "Payload",
                        Page::Alerts => "Xử lý",
                        Page::Leaves => "Sổ phép",
                        _ => "Chi tiết",
                    };
                    if ui.button(label).clicked() {
                        self.selected = Some(record.clone());
                    }
                } else {
                    render_cell(ui, self.page_kind, record, col);
                }
            },
        );
        ui.add_space(10.0);
        widgets::pagination(
            ui,
            "attendance.records.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
    }

    fn render_timesheet(&mut self, ui: &mut Ui) {
        ui.horizontal_wrapped(|ui| {
            let (rect, _) = ui.allocate_exact_size(
                egui::vec2(240.0_f32.min(ui.available_width()), 32.0),
                egui::Sense::hover(),
            );
            widgets::search_input(ui, rect, &mut self.search, "Tìm theo tên nhân viên, mã NV…");
            let now = chrono::Utc::now().date_naive();
            widgets::combo_box("attendance.records.month")
                .selected_text(format!("Tháng {}", self.month))
                .show_ui(ui, |ui| {
                    for offset in 0..12 {
                        let index = now.year() * 12 + now.month0() as i32 - offset;
                        let value = format!(
                            "{:04}-{:02}",
                            index.div_euclid(12),
                            index.rem_euclid(12) + 1
                        );
                        ui.selectable_value(&mut self.month, value.clone(), value);
                    }
                });
            widgets::combo_box("attendance.records.department")
                .selected_text(if self.filter.is_empty() {
                    "Tất cả phòng ban"
                } else {
                    &self.filter
                })
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut self.filter, String::new(), "Tất cả phòng ban");
                    let mut departments = self
                        .employees
                        .iter()
                        .map(|e| e.department.as_str())
                        .filter(|d| !d.is_empty())
                        .collect::<Vec<_>>();
                    departments.sort();
                    departments.dedup();
                    for department in departments {
                        ui.selectable_value(&mut self.filter, department.into(), department);
                    }
                });
            disabled_action(ui, "Xuất Excel", EXPORT_UNAVAILABLE);
        });
        ui.add_space(10.0);
        ui.horizontal_wrapped(|ui| {
            for (label, tone) in [
                ("1.0 (Đủ công)", TagTone::Success),
                ("P (Nghỉ phép)", TagTone::Warning),
                ("M (Đi muộn)", TagTone::Warning),
                ("OT (Làm thêm)", TagTone::Processing),
                ("CN (Nghỉ tuần)", TagTone::Neutral),
            ] {
                widgets::tag(ui, label, tone);
            }
            ui.label("— Chưa có dữ liệu công theo ngày");
        });
        ui.add_space(12.0);
        if !self.employees_loaded {
            return;
        }
        let query = self.search.trim().to_lowercase();
        let employees = self
            .employees
            .iter()
            .filter(|e| {
                (self.filter.is_empty() || e.department == self.filter)
                    && (query.is_empty()
                        || format!("{} {} {}", e.name, e.code, e.department)
                            .to_lowercase()
                            .contains(&query))
            })
            .cloned()
            .collect::<Vec<_>>();
        let days = days_in_month(&self.month);
        let labels = (1..=days).map(|d| d.to_string()).collect::<Vec<_>>();
        let mut columns = vec![
            TableColumn {
                title: "Họ tên & Mã nhân sự",
                width: 200.0,
            },
            TableColumn {
                title: "Khối phòng ban",
                width: 160.0,
            },
        ];
        columns.extend(labels.iter().map(|d| TableColumn {
            title: d,
            width: 36.0,
        }));
        columns.extend([
            TableColumn {
                title: "Tổng công",
                width: 90.0,
            },
            TableColumn {
                title: "Chi tiết",
                width: 80.0,
            },
        ]);
        widgets::table_with_row_height(
            ui,
            "attendance.records.matrix",
            &columns,
            employees.len(),
            58.0,
            |ui, row, col| {
                let employee = &employees[row];
                if col == 0 {
                    pair(ui, &employee.name, &format!("Mã: {}", employee.code));
                } else if col == 1 {
                    ui.label(&employee.department);
                } else if col == columns.len() - 1 {
                    if ui.button("Xem").clicked() {
                        self.selected_employee = Some(employee.clone());
                    }
                } else {
                    ui.label(UNKNOWN).on_hover_text(
                        "Máy chủ chưa cung cấp công theo ngày; không suy công từ lượt quẹt thẻ.",
                    );
                }
            },
        );
    }

    fn render_details(&mut self, ctx: &egui::Context) {
        if let Some(employee) = self.selected_employee.clone() {
            let (_, closed) = widgets::drawer(
                ctx,
                "attendance.records.employee",
                Page::Timesheet.drawer_title(),
                580.0,
                |ui| {
                    header(
                        ui,
                        &employee.code,
                        &employee.name,
                        "Chưa có dữ liệu công theo ngày",
                        &format!("{} · {}", employee.position, employee.department),
                    );
                    ui.add_space(16.0);
                    widgets::metrics(
                        ui,
                        "attendance.records.employee.metrics",
                        &[
                            Metric {
                                label: "Tổng ngày công thực tế",
                                value: UNKNOWN.into(),
                                detail: "Chưa có nguồn công theo tháng",
                                color: Color32::from_rgb(22, 163, 74),
                                value_size: 20.0,
                            },
                            Metric {
                                label: "Giờ làm thêm OT tháng",
                                value: UNKNOWN.into(),
                                detail: "Chưa có nguồn OT theo tháng",
                                color: Color32::from_rgb(37, 99, 235),
                                value_size: 20.0,
                            },
                        ],
                    );
                    ui.add_space(16.0);
                    section(ui, "Nhật Ký Điểm Danh Từ Máy Chủ", |ui| {
                        let logs = self
                            .records
                            .iter()
                            .filter(|r| log_belongs_to(r, &employee, &self.month))
                            .collect::<Vec<_>>();
                        if !self.error.is_empty() {
                            ui.colored_label(Color32::DARK_RED, &self.error);
                        } else if !self.loaded {
                            ui.label("Đang tải nhật ký điểm danh…");
                        } else if logs.is_empty() {
                            ui.label("Chưa có nhật ký điểm danh trong tháng đã chọn.");
                        }
                        for log in logs {
                            ui.label(format!(
                                "{} · {} · {}",
                                text(log, "timestamp"),
                                text(log, "terminalName"),
                                text(log, "status")
                            ));
                        }
                    });
                    ui.add_space(16.0);
                    disabled_action(ui, "Xuất Phiếu Chấm Công Cá Nhân (PDF)", EXPORT_UNAVAILABLE);
                },
            );
            if closed {
                self.selected_employee = None;
            }
        }
        let Some(record) = self.selected.clone() else {
            return;
        };
        let kind = self.page_kind;
        let (_, closed) = widgets::drawer(
            ctx,
            "attendance.records.details",
            kind.drawer_title(),
            if kind == Page::Raw { 560.0 } else { 580.0 },
            |ui| {
                let code = match kind {
                    Page::Raw => "logId",
                    Page::Alerts => "alertCode",
                    Page::Plans => "planCode",
                    _ => "employeeCode",
                };
                header(
                    ui,
                    &text(&record, code),
                    &text(&record, "employeeName"),
                    &text(&record, "status"),
                    &format!(
                        "{} · {}",
                        text(&record, "position"),
                        text(&record, "department")
                    ),
                );
                ui.add_space(16.0);
                match kind {
                    Page::Raw => {
                        section(
                            ui,
                            "Thông Số Kỹ Thuật Bản Ghi Nhận Diện",
                            |ui| {
                                fields(
                                    ui,
                                    &record,
                                    &[
                                        ("Thời gian timestamp", "timestamp"),
                                        ("Thiết bị thu thập", "terminalName"),
                                        ("Địa chỉ IP Gateway", "terminalIp"),
                                        ("Mã thẻ NFC / UID", "cardUid"),
                                        ("Phương thức", "verifyMode"),
                                        ("Độ khớp AI Match Score", "matchScore"),
                                        ("Tọa độ GPS", "gpsCoordinates"),
                                        ("Nhiệt độ", "temperature"),
                                    ],
                                )
                            },
                        );
                        section(ui, "RAW JSON GỐC TỪ THIẾT BỊ IOT", |ui| {
                            let payload = record
                                .get("rawPayload")
                                .map(|p| {
                                    p.as_str().map(str::to_owned).unwrap_or_else(|| {
                                        serde_json::to_string_pretty(p).unwrap_or_default()
                                    })
                                })
                                .unwrap_or_else(|| "Chưa có payload từ thiết bị.".into());
                            ui.add(egui::Label::new(RichText::new(payload).monospace()).wrap());
                        });
                        disabled_action(
                            ui,
                            "Ép Đồng Bộ Vào Bảng Chấm Công",
                            "Chưa có API ghi nhận công từ raw log.",
                        );
                    }
                    Page::Summary => {
                        section(ui, "Cấu Thành Ngày Công Tính Lương", |ui| {
                            fields(
                                ui,
                                &record,
                                &[
                                    ("Số ngày công chuẩn", "standardDays"),
                                    ("Số ngày công thực tế", "actualDays"),
                                    ("Nghỉ phép hưởng lương", "paidLeaveDays"),
                                    ("Nghỉ không lương", "unpaidLeaveDays"),
                                    ("Tổng công thanh toán lương", "totalPayDays"),
                                    ("Tỷ lệ chuyên cần (%)", "attendanceRate"),
                                ],
                            )
                        });
                        section(ui, "Tổng Hợp Giờ Làm Thêm Ngoài Giờ", |ui| {
                            fields(
                                ui,
                                &record,
                                &[
                                    ("OT ngày thường (giờ)", "otHoursWeekday"),
                                    ("OT cuối tuần (giờ)", "otHoursWeekend"),
                                ],
                            )
                        });
                        disabled_action(
                            ui,
                            "Khóa Số Liệu & Đẩy Sang Bảng Lương",
                            "Chưa có API khóa kỳ công và chuyển sang bảng lương.",
                        );
                    }
                    Page::Leaves => {
                        section(ui, "Cơ Cấu Hạn Mức Phép Năm", |ui| {
                            fields(
                                ui,
                                &record,
                                &[
                                    ("Phép chuẩn năm", "standardQuota"),
                                    ("Phép thâm niên", "seniorityQuota"),
                                    ("Phép năm trước chuyển tiếp", "carriedOver"),
                                    ("Tổng quỹ phép", "totalEntitled"),
                                    ("Đã nghỉ phép", "usedLeaves"),
                                    ("Tỷ lệ đã dùng (%)", "leaveUsagePct"),
                                    ("Quỹ phép còn lại khả dụng", "remainingLeaves"),
                                ],
                            )
                        });
                        section(ui, "Chính Sách Thanh Toán Phép Tồn", |ui| {
                            ui.label(
                                "— Chưa có nguồn chính sách thanh toán phép tồn được xác nhận.",
                            );
                        });
                        disabled_action(ui, "In Sổ Phép Năm Cá Nhân (PDF)", EXPORT_UNAVAILABLE);
                    }
                    Page::Alerts => {
                        section(ui, "Nội Dung Bất Thường Ghi Nhận", |ui| {
                            fields(
                                ui,
                                &record,
                                &[
                                    ("Loại bất thường", "alertType"),
                                    ("Chi tiết", "details"),
                                    ("Ngày xảy ra", "alertDate"),
                                ],
                            )
                        });
                        section(ui, "Nội Dung Giải Trình Của Nhân Sự", |ui| {
                            fields(
                                ui,
                                &record,
                                &[
                                    ("Giải trình", "explanationText"),
                                    ("Chứng từ đính kèm", "explanationProof"),
                                    ("Số tiền theo hồ sơ", "penaltyAmount"),
                                ],
                            )
                        });
                        if text(&record, "status") == "Chờ nhân viên giải trình" {
                            ui.horizontal_wrapped(|ui| {
                                disabled_action(
                                    ui,
                                    "Trừ Phạt Chuyên Cần",
                                    "Chưa có API xử lý vi phạm được kiểm chứng.",
                                );
                                disabled_action(
                                    ui,
                                    "Chấp Thuận Giải Trình",
                                    "Chưa có API duyệt giải trình và lịch sử xử lý.",
                                );
                            });
                        }
                    }
                    Page::Plans => {
                        section(ui, "Thông Tin Kế Hoạch Nghỉ Phép", |ui| {
                            fields(
                                ui,
                                &record,
                                &[
                                    ("Loại hình kế hoạch", "leaveType"),
                                    ("Từ ngày", "fromDate"),
                                    ("Đến ngày", "toDate"),
                                    ("Số ngày nghỉ", "totalDays"),
                                    ("Cán bộ phê duyệt", "approver"),
                                    ("Chế độ BHXH / Lương theo hồ sơ", "bhxhBenefit"),
                                ],
                            )
                        });
                        section(
                            ui,
                            "Biên Bản Bàn Giao Đầu Việc Tạm Thời",
                            |ui| {
                                fields(
                                    ui,
                                    &record,
                                    &[
                                        ("Người tiếp nhận bàn giao", "handoverPerson"),
                                        ("Nội dung bàn giao", "handoverTasks"),
                                    ],
                                )
                            },
                        );
                        if text(&record, "status") == "Chờ phê duyệt" {
                            disabled_action(
                                ui,
                                "Phê Duyệt Kế Hoạch Nghỉ Dài Ngày",
                                "Chưa có API phê duyệt kế hoạch và lịch sử xử lý.",
                            );
                        }
                    }
                    Page::Timesheet => {}
                }
                ui.collapsing("Dữ liệu đầy đủ từ máy chủ", |ui| {
                    ui.add(
                        egui::Label::new(
                            RichText::new(
                                serde_json::to_string_pretty(&record).unwrap_or_default(),
                            )
                            .monospace(),
                        )
                        .wrap(),
                    );
                });
            },
        );
        if closed {
            self.selected = None;
        }
    }

    fn render_form(&mut self, ctx: &egui::Context) {
        let kind = self.page_kind;
        let (_, closed) = widgets::modal(
            ctx,
            "attendance.records.form",
            kind.form_title(),
            640.0,
            false,
            |ui| {
                ui.colored_label(Color32::from_rgb(180, 83, 9), WRITE_UNAVAILABLE);
                ui.add_space(14.0);
                let groups: Vec<Vec<(&str, &str)>> = match kind {
                    Page::Plans => vec![
                        vec![
                            ("planCode", "Mã kế hoạch"),
                            ("leaveType", "Loại hình nghỉ phép"),
                        ],
                        vec![
                            ("employeeName", "Họ tên nhân sự"),
                            ("department", "Phòng ban trực thuộc"),
                        ],
                        vec![
                            ("fromDate", "Từ ngày"),
                            ("toDate", "Đến ngày"),
                            ("totalDays", "Tổng số ngày"),
                        ],
                        vec![
                            ("handoverPerson", "Nhân sự tiếp nhận bàn giao"),
                            ("approver", "Cán bộ phê duyệt"),
                        ],
                    ],
                    Page::Alerts => vec![
                        vec![
                            ("alertCode", "Mã cảnh báo"),
                            ("alertType", "Loại bất thường"),
                        ],
                        vec![
                            ("employeeName", "Nhân viên vi phạm"),
                            ("department", "Phòng ban trực thuộc"),
                        ],
                        vec![("alertDate", "Ngày ghi nhận")],
                    ],
                    Page::Leaves => vec![
                        vec![
                            ("employeeCode", "Mã nhân viên"),
                            ("department", "Phòng ban trực thuộc"),
                        ],
                        vec![
                            ("employeeName", "Họ tên nhân sự"),
                            ("position", "Chức danh"),
                        ],
                        vec![
                            ("standardQuota", "Phép chuẩn năm"),
                            ("seniorityQuota", "Phép thâm niên"),
                            ("carriedOver", "Tồn năm trước"),
                        ],
                        vec![("usedLeaves", "Số ngày phép đã sử dụng trong năm")],
                    ],
                    _ => vec![
                        vec![
                            ("employeeCode", "Mã nhân viên"),
                            ("department", "Phòng ban trực thuộc"),
                        ],
                        vec![
                            ("employeeName", "Họ tên nhân viên"),
                            ("position", "Vị trí / Chức vụ"),
                        ],
                        vec![
                            ("actualDays", "Công thực tế (ngày)"),
                            ("paidLeaveDays", "Phép hưởng lương (P)"),
                            ("unpaidLeaveDays", "Nghỉ không lương (KL)"),
                        ],
                        vec![
                            ("otHoursWeekday", "Giờ OT ngày thường"),
                            ("otHoursWeekend", "Giờ OT cuối tuần"),
                        ],
                    ],
                };
                ui.add_enabled_ui(false, |ui| {
                    for group in groups {
                        let count = if ui.available_width() < 460.0 {
                            1
                        } else {
                            group.len()
                        };
                        for row in group.chunks(count) {
                            ui.columns(count, |columns| {
                                for (column, (key, label)) in columns.iter_mut().zip(row) {
                                    let value = self.form.entry((*key).into()).or_default();
                                    let id = format!("attendance.records.form.{key}");
                                    if key.ends_with("Date") {
                                        widgets::form_date(column, &id, label, true, value);
                                    } else if *key == "leaveType" {
                                        widgets::form_select(
                                            column,
                                            &id,
                                            label,
                                            true,
                                            value,
                                            &[
                                                "Nghỉ phép năm dài ngày",
                                                "Nghỉ thai sản (6 tháng)",
                                                "Nghỉ kết hôn (3 ngày)",
                                                "Nghỉ việc riêng / Dưỡng sức",
                                            ],
                                        );
                                    } else if *key == "alertType" {
                                        widgets::form_select(
                                            column,
                                            &id,
                                            label,
                                            true,
                                            value,
                                            &[
                                                "Quên chấm công ra về",
                                                "Đi muộn quá 3 lần/tháng",
                                                "Chấm công ngoài Geofence",
                                                "Chấm công trùng lặp thẻ",
                                                "Về sớm không phép",
                                            ],
                                        );
                                    } else {
                                        widgets::form_input(
                                            column, &id, label, true, value, "", false,
                                        );
                                    }
                                }
                            });
                        }
                    }
                    if matches!(kind, Page::Plans | Page::Alerts) {
                        let (key, label) = if kind == Page::Plans {
                            ("handoverTasks", "Nội dung bàn giao công việc chi tiết")
                        } else {
                            ("details", "Chi tiết hiện tượng bất thường")
                        };
                        widgets::form_textarea(
                            ui,
                            "attendance.records.form.notes",
                            label,
                            true,
                            self.form.entry(key.into()).or_default(),
                            "",
                            3,
                        );
                    }
                });
                widgets::action_row(ui, |ui| {
                    disabled_action(
                        ui,
                        match kind {
                            Page::Plans => "Trình kế hoạch phê duyệt",
                            Page::Alerts => "Tạo cảnh báo & Gửi thông báo",
                            Page::Leaves => "Lưu & Cập nhật quỹ phép",
                            _ => "Lưu & Cập nhật ngày công",
                        },
                        WRITE_UNAVAILABLE,
                    );
                });
            },
        );
        if closed {
            self.form_open = false;
        }
    }
}

fn columns(kind: Page, width: f32) -> Vec<TableColumn<'static>> {
    let (labels, mut widths): (&[&str], Vec<f32>) = match kind {
        Page::Raw => (
            &[
                "Mã Log & Thời gian chính xác",
                "Thiết bị quẹt thẻ & IP Gateway",
                "Nhân viên nhận diện",
                "Phương thức & Độ tin cậy",
                "Trạng thái xử lý",
                "Thao tác",
            ],
            vec![210.0, 220.0, 200.0, 210.0, 170.0, 100.0],
        ),
        Page::Summary => (
            &[
                "Mã & Họ tên nhân viên",
                "Khối phòng ban",
                "Công chuẩn / Thực tế",
                "Nghỉ phép (P) / Không lương",
                "Giờ làm thêm OT",
                "Tổng công tính lương",
                "Trạng thái",
                "Thao tác",
            ],
            vec![210.0, 200.0, 170.0, 170.0, 180.0, 160.0, 130.0, 110.0],
        ),
        Page::Leaves => (
            &[
                "Mã & Họ tên nhân sự",
                "Khối phòng ban",
                "Phép chuẩn + Thâm niên",
                "Chuyển từ năm trước",
                "Tổng quỹ phép",
                "Đã nghỉ / Tỷ lệ",
                "Phép còn lại khả dụng",
                "Thao tác",
            ],
            vec![210.0, 200.0, 180.0, 150.0, 140.0, 150.0, 160.0, 110.0],
        ),
        Page::Plans => (
            &[
                "Mã kế hoạch & Loại hình nghỉ",
                "Nhân sự đăng ký",
                "Khoảng thời gian & Số ngày",
                "Bàn giao công việc cho",
                "Trạng thái",
                "Thao tác",
            ],
            vec![220.0, 220.0, 230.0, 180.0, 150.0, 110.0],
        ),
        _ => (
            &[
                "Mã & Loại cảnh báo bất thường",
                "Nhân sự & Phòng ban",
                "Chi tiết hiện tượng",
                "Ngày ghi nhận",
                "Trạng thái",
                "Thao tác",
            ],
            vec![230.0, 220.0, 230.0, 120.0, 160.0, 120.0],
        ),
    };
    let spare = (width - 2.0 - widths.iter().sum::<f32>()).max(0.0);
    widths[0] += spare;
    labels
        .iter()
        .zip(widths)
        .map(|(title, width)| TableColumn { title, width })
        .collect()
}

fn render_cell(ui: &mut Ui, kind: Page, r: &Value, col: usize) {
    match (kind, col) {
        (Page::Raw, 0) => pair(ui, &text(r, "logId"), &text(r, "timestamp")),
        (Page::Raw, 1) => pair(
            ui,
            &text(r, "terminalName"),
            &format!(
                "IP: {} · UID: {}",
                text(r, "terminalIp"),
                text(r, "cardUid")
            ),
        ),
        (Page::Raw, 2) | (Page::Alerts, 1) | (Page::Plans, 1) => pair(
            ui,
            &text(r, "employeeName"),
            &format!(
                "{} · {}",
                text(
                    r,
                    if kind == Page::Raw {
                        "employeeCode"
                    } else {
                        "empCode"
                    }
                ),
                text(r, "department")
            ),
        ),
        (Page::Raw, 3) => pair(
            ui,
            &text(r, "verifyMode"),
            &format!("Khớp: {}%", text(r, "matchScore")),
        ),
        (Page::Raw, 4) | (Page::Alerts, 4) | (Page::Plans, 4) | (Page::Summary, 6) => {
            let status = text(r, "status");
            widgets::tag(ui, &status, tone(&status));
        }
        (Page::Summary | Page::Leaves, 0) => pair(
            ui,
            &text(r, "employeeName"),
            &format!("Mã: {} · {}", text(r, "employeeCode"), text(r, "position")),
        ),
        (Page::Summary | Page::Leaves, 1) => {
            ui.label(text(r, "department"));
        }
        (Page::Summary, 2) => pair(
            ui,
            &format!("Chuẩn: {} ngày", text(r, "standardDays")),
            &format!("Thực tế: {} ngày", text(r, "actualDays")),
        ),
        (Page::Summary, 3) => pair(
            ui,
            &format!("{} Phép năm (P)", text(r, "paidLeaveDays")),
            &format!("{} Không lương", text(r, "unpaidLeaveDays")),
        ),
        (Page::Summary, 4) => pair(
            ui,
            &format!("{}h ngày thường", text(r, "otHoursWeekday")),
            &format!("{}h cuối tuần", text(r, "otHoursWeekend")),
        ),
        (Page::Summary, 5) => pair(
            ui,
            &format!(
                "{} / {} Công",
                text(r, "totalPayDays"),
                text(r, "standardDays")
            ),
            &format!("{}% Chuyên cần", text(r, "attendanceRate")),
        ),
        (Page::Leaves, 2) => pair(
            ui,
            &format!("{} ngày chuẩn", text(r, "standardQuota")),
            &format!("+ {} ngày thâm niên", text(r, "seniorityQuota")),
        ),
        (Page::Leaves, 3) => {
            ui.label(format!("{} ngày tồn cũ", text(r, "carriedOver")));
        }
        (Page::Leaves, 4) => {
            ui.label(
                RichText::new(format!("{} ngày", text(r, "totalEntitled")))
                    .strong()
                    .color(Color32::from_rgb(37, 99, 235)),
            );
        }
        (Page::Leaves, 5) => pair(
            ui,
            &format!("{} ngày", text(r, "usedLeaves")),
            &format!("Đã dùng {}%", text(r, "leaveUsagePct")),
        ),
        (Page::Leaves, 6) => {
            ui.label(RichText::new(format!("{} Ngày phép", text(r, "remainingLeaves"))).strong());
            let status = text(r, "status");
            widgets::tag(ui, &status, tone(&status));
        }
        (Page::Plans, 0) => pair(
            ui,
            &text(r, "leaveType"),
            &format!("Mã: {}", text(r, "planCode")),
        ),
        (Page::Plans, 2) => pair(
            ui,
            &format!("{} → {}", text(r, "fromDate"), text(r, "toDate")),
            &format!("Tổng cộng: {} ngày nghỉ", text(r, "totalDays")),
        ),
        (Page::Plans, 3) => pair(
            ui,
            &text(r, "handoverPerson"),
            &format!("Duyệt: {}", text(r, "approver")),
        ),
        (Page::Alerts, 0) => pair(
            ui,
            &text(r, "alertType"),
            &format!("Mã sự vụ: {}", text(r, "alertCode")),
        ),
        (Page::Alerts, 2) => {
            ui.add(egui::Label::new(RichText::new(text(r, "details")).size(12.0)).truncate())
                .on_hover_text(text(r, "details"));
        }
        (Page::Alerts, 3) => {
            ui.label(text(r, "alertDate"));
        }
        _ => {
            ui.label(UNKNOWN);
        }
    }
}

fn text(record: &Value, key: &str) -> String {
    match record.get(key) {
        Some(Value::String(s)) if !s.trim().is_empty() => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        _ => UNKNOWN.into(),
    }
}

fn total_number(records: &[Value], key: &str) -> Option<f64> {
    records.iter().try_fold(0.0, |total, r| {
        let n = r.get(key)?.as_f64()?;
        let next = total + n;
        (n.is_finite() && next.is_finite()).then_some(next)
    })
}

fn average_number(records: &[Value], key: &str) -> Option<f64> {
    if records.is_empty() {
        None
    } else {
        total_number(records, key).map(|total| total / records.len() as f64)
    }
}

fn format_number(n: f64) -> String {
    if n.fract() == 0.0 {
        format!("{n:.0}")
    } else {
        format!("{n:.1}")
    }
}

fn record_matches(r: &Value, field: &str, filter: &str, query: &str) -> bool {
    (filter.is_empty() || r.get(field).and_then(Value::as_str) == Some(filter))
        && (query.is_empty()
            || r.as_object().is_some_and(|fields| {
                fields
                    .values()
                    .any(|v| v.as_str().is_some_and(|s| s.to_lowercase().contains(query)))
            }))
}

fn days_in_month(month: &str) -> u32 {
    let Some(first) = NaiveDate::parse_from_str(&format!("{month}-01"), "%Y-%m-%d").ok() else {
        return 0;
    };
    let Some(next) = first.checked_add_months(chrono::Months::new(1)) else {
        return 0;
    };
    (next - first).num_days() as u32
}

fn log_belongs_to(r: &Value, e: &Employee, month: &str) -> bool {
    let matches_id = r
        .get("employeeId")
        .and_then(Value::as_str)
        .is_some_and(|id| !id.is_empty() && id == e.id);
    let matches_code = r
        .get("employeeCode")
        .and_then(Value::as_str)
        .is_some_and(|code| !e.code.trim().is_empty() && code == e.code);
    let date = r
        .get("timestamp")
        .and_then(Value::as_str)
        .and_then(|s| s.get(..10))
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
    (matches_id || matches_code) && date.is_some_and(|d| d.format("%Y-%m").to_string() == month)
}

fn tone(status: &str) -> TagTone {
    match status {
        "Dữ liệu hợp lệ"
        | "Đã khóa công"
        | "Đã giải trình hợp lệ"
        | "Còn nhiều phép"
        | "Đã duyệt kế hoạch" => TagTone::Success,
        "Đã trừ phạt chuyên cần" | "Đã hết phép" | "Từ chối" => TagTone::Error,
        "Chờ đối soát"
        | "Cần kiểm tra"
        | "Chờ nhân viên giải trình"
        | "Chờ phê duyệt"
        | "Sắp hết phép" => TagTone::Warning,
        _ => TagTone::Neutral,
    }
}

fn pair(ui: &mut Ui, title: &str, subtitle: &str) {
    ui.add(egui::Label::new(RichText::new(title).size(13.0).strong()).truncate())
        .on_hover_text(title);
    ui.add(
        egui::Label::new(
            RichText::new(subtitle)
                .size(11.5)
                .color(Color32::from_rgb(100, 116, 139)),
        )
        .truncate(),
    )
    .on_hover_text(subtitle);
}

fn header(ui: &mut Ui, code: &str, name: &str, status: &str, subtitle: &str) {
    egui::Frame::none()
        .fill(Color32::from_rgb(248, 250, 252))
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
        .rounding(8.0)
        .inner_margin(16.0)
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.label(
                RichText::new(code)
                    .size(13.0)
                    .strong()
                    .color(crate::theme::PRIMARY),
            );
            ui.label(RichText::new(name).size(17.0).strong());
            widgets::tag(ui, status, tone(status));
            ui.label(
                RichText::new(subtitle)
                    .size(12.0)
                    .color(Color32::from_rgb(100, 116, 139)),
            );
        });
}

fn section(ui: &mut Ui, title: &str, body: impl FnOnce(&mut Ui)) {
    egui::Frame::none()
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
        .rounding(8.0)
        .inner_margin(14.0)
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.label(RichText::new(title).size(13.0).strong());
            ui.add_space(10.0);
            body(ui);
        });
    ui.add_space(16.0);
}

fn fields(ui: &mut Ui, r: &Value, fields: &[(&str, &str)]) {
    for (label, key) in fields {
        ui.horizontal_wrapped(|ui| {
            ui.label(
                RichText::new(*label)
                    .size(12.5)
                    .color(Color32::from_rgb(100, 116, 139)),
            );
            ui.label(RichText::new(text(r, key)).size(12.5).strong());
        });
        ui.add_space(8.0);
    }
}

fn disabled_action(ui: &mut Ui, label: &str, reason: &str) {
    ui.add_enabled(false, egui::Button::new(label))
        .on_disabled_hover_text(reason);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn every_assigned_route_has_the_legacy_scope() {
        for (path, kind) in [
            ("timesheet", Page::Timesheet),
            ("timesheet/detail", Page::Timesheet),
            ("timesheet/data", Page::Raw),
            ("timesheet/summary", Page::Summary),
            ("alerts", Page::Alerts),
            ("requests/leaves", Page::Leaves),
            ("requests/plans", Page::Plans),
        ] {
            assert_eq!(
                Page::for_path(&format!("/admin/attendance/{path}")),
                Some(kind)
            );
        }
        assert_eq!(Page::Leaves.scope(), "attendance_leave_summary");
        assert!(Page::for_path("/admin/attendance/other").is_none());
    }

    #[test]
    fn metrics_preserve_missing_values_instead_of_fabricating_zero() {
        assert_eq!(total_number(&[], "days"), Some(0.0));
        assert_eq!(average_number(&[], "days"), None);
        assert_eq!(
            total_number(&[json!({"days":2.5}), json!({"days":1})], "days"),
            Some(3.5)
        );
        assert_eq!(
            total_number(&[json!({"days":2.5}), json!({})], "days"),
            None
        );
        assert_eq!(total_number(&[json!({"days":"unknown"})], "days"), None);
        assert_eq!(text(&json!({"zero":0}), "zero"), "0");
        assert_eq!(text(&json!({"days":null}), "days"), UNKNOWN);
    }

    #[test]
    fn calendar_uses_real_month_lengths_without_generating_attendance() {
        assert_eq!(days_in_month("2024-02"), 29);
        assert_eq!(days_in_month("2026-02"), 28);
        assert_eq!(days_in_month("2026-04"), 30);
        assert_eq!(days_in_month("2026-10"), 31);
        assert_eq!(days_in_month("invalid"), 0);
    }

    #[test]
    fn raw_logs_require_canonical_identity_and_valid_selected_month() {
        let e: Employee =
            serde_json::from_value(json!({"id":"emp-1","name":"Same name","code":"NV01"})).unwrap();
        assert!(log_belongs_to(
            &json!({"employeeCode":"NV01","timestamp":"2026-10-24T08:00:00+07:00"}),
            &e,
            "2026-10"
        ));
        assert!(!log_belongs_to(
            &json!({"employeeName":"Same name","timestamp":"2026-10-24"}),
            &e,
            "2026-10"
        ));
        assert!(!log_belongs_to(
            &json!({"employeeId":"emp-1","timestamp":"2026-02-30"}),
            &e,
            "2026-02"
        ));
        assert!(!log_belongs_to(
            &json!({"employeeId":"emp-1","timestamp":"2026-09-24"}),
            &e,
            "2026-10"
        ));
    }

    #[test]
    fn filters_search_real_fields_without_mutating_unknown_fields() {
        let record =
            json!({"status":"Chờ phê duyệt","employeeName":"Nguyễn An","custom":{"keep":true}});
        assert!(record_matches(&record, "status", "Chờ phê duyệt", "nguyễn"));
        assert!(!record_matches(&record, "status", "Đã duyệt", "nguyễn"));
        assert_eq!(record["custom"], json!({"keep":true}));
    }
}
