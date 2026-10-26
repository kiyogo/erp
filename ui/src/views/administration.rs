//! Administration destinations from legacy/web/src/modules/admin. UI state is not an ACL.
use std::time::Duration;

use chrono::Utc;
use egui::{Color32, RichText, Ui};
use serde_json::{Value, json};

use crate::{
    api::{
        ActivationEmailTemplateResponse, ApiClient, ApiTask, AuditLogsResponse, ContractsResponse,
        DashboardStats, DocumentsResponse, FileListResponse, GenericCollectionResponse,
        GenericRecordResponse, UsersPage, UsersSummary,
    },
    models::Session,
    widgets::{self, Metric, TableColumn, TagTone},
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Page {
    Overview,
    Roles,
    Permissions,
    Backup,
    Menu,
    System,
}

impl Page {
    fn from_path(path: &str) -> Option<Self> {
        Some(match path.trim_end_matches('/') {
            "/admin/overview" => Self::Overview,
            "/admin/roles" => Self::Roles,
            "/admin/permissions" => Self::Permissions,
            "/admin/backup" => Self::Backup,
            "/admin/drop-menu" => Self::Menu,
            "/admin/system" => Self::System,
            _ => return None,
        })
    }

    fn title(self) -> &'static str {
        match self {
            Self::Overview => "Tổng quan quản trị",
            Self::Roles => "Nhóm quyền & vai trò",
            Self::Permissions => "Phân quyền chức năng",
            Self::Backup => "Sao lưu & phục hồi",
            Self::Menu => "Cấu hình menu thả",
            Self::System => "Cấu hình hệ thống",
        }
    }

    fn subtitle(self) -> &'static str {
        match self {
            Self::Overview => "Tài khoản, tài nguyên và hoạt động gần đây",
            Self::Roles => "Vai trò tài khoản đang được máy chủ hỗ trợ",
            Self::Permissions => "Ma trận chức năng và tình trạng hỗ trợ phân quyền",
            Self::Backup => "Hồ sơ sao lưu và tình trạng hỗ trợ phục hồi",
            Self::Menu => "Danh mục dùng trong các trường chọn của ứng dụng",
            Self::System => "Kết nối máy chủ, email và đăng nhập tập trung",
        }
    }
}

struct ReadState<T> {
    value: Option<T>,
    task: Option<ApiTask<T>>,
    error: String,
    checked_at: Option<String>,
}

impl<T> Default for ReadState<T> {
    fn default() -> Self {
        Self {
            value: None,
            task: None,
            error: String::new(),
            checked_at: None,
        }
    }
}

impl<T> ReadState<T> {
    fn start(&mut self, task: ApiTask<T>) {
        self.task = Some(task);
        self.error.clear();
    }

    fn poll(&mut self) {
        if let Some(result) = self.task.as_ref().and_then(ApiClient::poll) {
            self.task = None;
            self.checked_at = Some(Utc::now().format("%d/%m/%Y %H:%M UTC").to_string());
            match result {
                Ok(value) => {
                    self.value = Some(value);
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
    }

    fn status(&self, ui: &mut Ui, label: &str) {
        if self.task.is_some() {
            ui.horizontal_wrapped(|ui| {
                ui.spinner();
                ui.label(format!("Đang tải {label}…"));
            });
        }
        if !self.error.is_empty() {
            ui.add(
                egui::Label::new(
                    RichText::new(format!("{label}: {}", self.error))
                        .color(ui.visuals().error_fg_color),
                )
                .wrap(),
            );
            if self.value.is_some() {
                ui.weak("Đang hiển thị dữ liệu của lần tải trước. Chọn Làm mới để thử lại.");
            }
        }
    }
}

const MENU_GROUPS: &[(&str, &str)] = &[
    ("positions", "Chức danh đảm nhiệm"),
    ("work_statuses", "Trạng thái làm việc"),
    ("contract_types", "Phân loại hợp đồng"),
    ("leave_types", "Loại nghỉ phép"),
    ("academic_levels", "Trình độ học vấn"),
    ("job_ranks", "Cấp bậc nhân sự"),
    ("asset_categories", "Phân loại tài sản"),
];

const PERMISSION_MODULES: &[(&str, &str)] = &[
    ("Bảng điều khiển & Giám sát", "Tổng quan"),
    ("Nhân sự, Hồ sơ & Hợp đồng", "Vận hành"),
    ("Tài chính, Thu chi & Dòng tiền", "Tài chính"),
    ("Bảo hiểm xã hội & Phúc lợi", "Nhân sự"),
    ("Tài sản & Kho linh kiện", "Kho vận"),
    ("Quy trình trình ký điện tử", "Văn thư"),
    ("Văn thư & Chữ ký số", "Pháp lý"),
    ("Kế hoạch & Nhiệm vụ", "Kế hoạch"),
    ("Quản trị hệ thống & Kiểm toán", "Hạ tầng"),
];

#[derive(Default)]
struct MenuDraft {
    key: Option<String>,
    name: String,
    code: String,
    description: String,
    color: String,
    order: String,
    active: bool,
}

impl MenuDraft {
    fn patch(&self) -> Result<Value, String> {
        if self.name.trim().is_empty() {
            return Err("Vui lòng nhập tên mục danh mục.".into());
        }
        let order = self
            .order
            .trim()
            .parse::<u32>()
            .ok()
            .filter(|order| *order > 0)
            .ok_or("Thứ tự phải là số nguyên dương.")?;
        if parse_color(&self.color).is_none() {
            return Err("Màu sắc phải có dạng #RRGGBB.".into());
        }
        Ok(json!({
            "name": self.name.trim(), "code": self.code.trim(), "description": self.description.trim(),
            "color": self.color.trim(), "order": order, "isActive": self.active
        }))
    }
}

#[derive(Default)]
pub struct AdministrationView {
    identity: Option<(String, String, String)>,
    page: Option<Page>,
    users: ReadState<UsersPage>,
    stats: ReadState<DashboardStats>,
    documents: ReadState<DocumentsResponse>,
    contracts: ReadState<ContractsResponse>,
    files: ReadState<FileListResponse>,
    audit: ReadState<AuditLogsResponse>,
    email: ReadState<ActivationEmailTemplateResponse>,
    health: ReadState<String>,
    backups: ReadState<GenericCollectionResponse>,
    menu: ReadState<GenericCollectionResponse>,
    search: String,
    selected_role: usize,
    role_filter: usize,
    menu_group: usize,
    backup_filter: usize,
    table_page: usize,
    table_size: usize,
    menu_draft: Option<MenuDraft>,
    menu_save: Option<ApiTask<GenericRecordResponse>>,
    menu_error: String,
    menu_notice: String,
}

impl AdministrationView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn loading(&self) -> bool {
        self.users.task.is_some()
            || self.stats.task.is_some()
            || self.documents.task.is_some()
            || self.contracts.task.is_some()
            || self.files.task.is_some()
            || self.audit.task.is_some()
            || self.email.task.is_some()
            || self.health.task.is_some()
            || self.backups.task.is_some()
            || self.menu.task.is_some()
            || self.menu_save.is_some()
    }

    fn reload(&mut self, page: Page, session: &Session, api: &ApiClient) {
        match page {
            Page::Overview => {
                self.users
                    .start(api.list_users_task(session, 1, 1, "", "all"));
                self.stats.start(api.dashboard_stats_task(session));
                self.documents.start(api.list_documents_task(session));
                self.contracts.start(api.list_contracts_task(session));
                self.files.start(api.list_files_task(session, None, false));
                self.audit
                    .start(api.list_admin_audit_logs_task(session, 1, 20, "all", ""));
                self.email
                    .start(api.get_activation_email_template_task(session));
            }
            Page::Roles | Page::Permissions => self
                .users
                .start(api.list_users_task(session, 1, 1, "", "all")),
            Page::Backup => self
                .backups
                .start(api.list_generic_collection_task(session, "admin_backups")),
            Page::Menu => self.menu.start(api.list_generic_collection_task(
                session,
                &format!("dropdown_{}", MENU_GROUPS[self.menu_group].0),
            )),
            Page::System => {
                self.email
                    .start(api.get_activation_email_template_task(session));
                self.health.start(api.health_task(&session.endpoint));
            }
        }
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        self.users.poll();
        self.stats.poll();
        self.documents.poll();
        self.contracts.poll();
        self.files.poll();
        self.audit.poll();
        self.email.poll();
        self.health.poll();
        self.backups.poll();
        self.menu.poll();
        if let Some(result) = self.menu_save.as_ref().and_then(ApiClient::poll) {
            self.menu_save = None;
            match result {
                Ok(response) if response.record.is_object() => {
                    self.menu_draft = None;
                    self.menu_notice = "Đã lưu mục danh mục trên máy chủ.".into();
                    self.menu_error.clear();
                    self.reload(Page::Menu, session, api);
                }
                Ok(_) => self.menu_error = "Máy chủ không trả về mục danh mục đã lưu.".into(),
                Err(error) => self.menu_error = error,
            }
        }
        if self.loading() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        path: &str,
    ) {
        if session.user.role != "ADMIN" {
            self.reset();
            ui.heading("Không đủ quyền");
            ui.add(
                egui::Label::new("Chỉ quản trị viên được truy cập các trang quản trị hệ thống.")
                    .wrap(),
            );
            return;
        }
        let identity = (
            session.user.id.clone(),
            session.endpoint.clone(),
            session.session_id.clone(),
        );
        if self.identity.as_ref() != Some(&identity) {
            self.reset();
            self.identity = Some(identity);
        }
        let Some(page) = Page::from_path(path) else {
            ui.heading("Trang quản trị chưa được hỗ trợ");
            ui.label("Chọn một trang quản trị trong thanh điều hướng.");
            return;
        };
        if self.page != Some(page) {
            self.page = Some(page);
            self.search.clear();
            self.table_page = 0;
            self.table_size = 8;
            // Keep an in-flight menu mutation attached to its original form/group across routes.
            if self.menu_save.is_none() {
                self.menu_draft = None;
            }
            self.reload(page, session, api);
        }
        self.poll(ctx, session, api);
        if widgets::page_header(
            ui,
            "administration",
            page.title(),
            page.subtitle(),
            !self.loading() && self.menu_draft.is_none(),
        ) {
            self.reload(page, session, api);
        }
        ui.add_space(12.0);
        let height = (ui.clip_rect().bottom() - ui.cursor().top() - 2.0).max(80.0);
        let body = egui::ScrollArea::vertical()
            .id_salt(("administration", path))
            .max_height(height)
            .auto_shrink([false, false])
            .show(ui, |ui| {
                ui.style_mut().wrap_mode = Some(egui::TextWrapMode::Wrap);
                match page {
                    Page::Overview => self.render_overview(ui),
                    Page::Roles => self.render_roles(ui),
                    Page::Permissions => self.render_permissions(ui),
                    Page::Backup => self.render_backup(ui),
                    Page::Menu => self.render_menu(ui, session, api),
                    Page::System => self.render_system(ui, session),
                }
            });
        crate::visual_test::record("administration.body", body.inner_rect);
        if page == Page::Menu {
            self.render_menu_dialog(ctx, session, api);
        }
    }

    fn summary(&self) -> Option<UsersSummary> {
        self.users
            .value
            .as_ref()
            .and_then(|users| users.summary)
            .filter(|summary| summary.admins <= summary.total && summary.active <= summary.total)
    }

    fn render_overview(&self, ui: &mut Ui) {
        self.users.status(ui, "Tài khoản");
        self.stats.status(ui, "Chỉ số điều hành");
        let summary = self.summary();
        let stats = self.stats.value.as_ref();
        widgets::metrics(
            ui,
            "administration.overview.metrics",
            &[
                metric(
                    "Tài khoản hệ thống",
                    number(summary.map(|value| value.total)),
                    "Tổng số tài khoản từ máy chủ",
                ),
                metric(
                    "Đang hoạt động",
                    number(summary.map(|value| value.active)),
                    "Theo trạng thái tài khoản",
                ),
                metric(
                    "Hồ sơ chờ duyệt",
                    number(stats.map(|value| value.pending_approvals_count)),
                    "Theo bảng điều hành",
                ),
                metric(
                    "Doanh thu tháng",
                    stats
                        .filter(|stats| stats.financial_metrics_available)
                        .map_or("—".into(), |stats| format!("{} ₫", stats.monthly_revenue)),
                    "Chỉ hiển thị khi có số liệu tài chính",
                ),
            ],
        );
        ui.add_space(12.0);
        self.documents.status(ui, "Tài liệu");
        self.contracts.status(ui, "Hợp đồng");
        self.files.status(ui, "Kho tệp");
        self.email.status(ui, "Email");
        let signed = self.contracts.value.as_ref().map(|contracts| {
            contracts
                .data
                .iter()
                .filter(|contract| {
                    contract.company_sign_status == "Đã ký"
                        || contract.employee_sign_status == "Đã ký"
                })
                .count()
        });
        widgets::metrics(
            ui,
            "administration.overview.resources",
            &[
                metric(
                    "Tài liệu cộng tác",
                    number(self.documents.value.as_ref().map(|docs| docs.data.len())),
                    "Tài liệu bạn có quyền truy cập",
                ),
                metric(
                    "Kho tệp hiện thấy",
                    number(self.files.value.as_ref().map(|files| files.data.len())),
                    "Số mục tại thư mục gốc, không đệ quy",
                ),
                metric(
                    "Hợp đồng có xác nhận ký",
                    number(signed),
                    "Theo trạng thái chữ ký đã lưu",
                ),
                metric(
                    "Cổng email",
                    self.email
                        .value
                        .as_ref()
                        .map_or("—", |email| {
                            if email.email_configured {
                                "Đã cấu hình"
                            } else {
                                "Chưa cấu hình"
                            }
                        })
                        .into(),
                    "Không thay thế kiểm tra gửi email",
                ),
            ],
        );
        ui.add_space(12.0);
        ui.strong("Nhật ký kiểm toán gần đây");
        self.audit.status(ui, "Nhật ký kiểm toán");
        if let Some(audit) = &self.audit.value {
            if audit.data.is_empty() {
                ui.label("Chưa có nhật ký kiểm toán.");
            }
            for entry in audit.data.iter().take(8) {
                ui.group(|ui| {
                    ui.set_width(ui.available_width());
                    ui.add(egui::Label::new(RichText::new(&entry.action).strong()).wrap());
                    ui.label(format!(
                        "{} · {} · {}",
                        entry.user, entry.timestamp, entry.module
                    ));
                    ui.add(egui::Label::new(&entry.detail).wrap());
                });
            }
            ui.weak(format!(
                "Hiển thị tối đa 8 trong {} bản ghi vừa tải; tổng {} bản ghi.",
                audit.data.len(),
                audit.pagination.total
            ));
        }
        ui.horizontal_wrapped(|ui| {
            unavailable(
                ui,
                "Xuất báo cáo",
                "Xuất báo cáo quản trị chưa được hỗ trợ.",
            );
        });
    }

    fn render_roles(&mut self, ui: &mut Ui) {
        self.users.status(ui, "Thống kê tài khoản");
        let summary = self.summary();
        widgets::metrics(
            ui,
            "administration.roles.metrics",
            &[
                metric(
                    "Vai trò tài khoản hỗ trợ",
                    "2".into(),
                    "ADMIN và USER theo mô hình máy chủ",
                ),
                metric(
                    "Tài khoản quản trị",
                    number(summary.map(|value| value.admins)),
                    "Số tài khoản mang vai trò ADMIN",
                ),
                metric(
                    "Tài khoản nhân viên",
                    number(summary.map(|value| value.total - value.admins)),
                    "Số tài khoản mang vai trò USER",
                ),
            ],
        );
        ui.add_space(12.0);
        ui.horizontal_wrapped(|ui| {
            for (index, label) in ["Tất cả vai trò", "Quản trị", "Nhân viên"]
                .iter()
                .enumerate()
            {
                ui.selectable_value(&mut self.role_filter, index, *label);
            }
        });
        search(
            ui,
            &mut self.search,
            "Tìm mã hoặc tên vai trò…",
            &mut self.table_page,
        );
        ui.horizontal_wrapped(|ui| {
            unavailable(
                ui,
                "Thêm vai trò mới",
                "Máy chủ chỉ hỗ trợ ADMIN và USER; chưa có API vai trò tùy chỉnh.",
            );
            unavailable(ui, "Xuất Excel", "Xuất danh mục vai trò chưa được hỗ trợ.");
        });
        ui.weak("Các vai trò trên tài khoản được thực thi bởi máy chủ. Chưa hỗ trợ nhóm quyền tùy chỉnh.");
        let rows: Vec<_> = [
            ("ADMIN", "Quản trị viên", summary.map(|value| value.admins)),
            (
                "USER",
                "Nhân viên",
                summary.map(|value| value.total - value.admins),
            ),
        ]
        .into_iter()
        .enumerate()
        .filter(|(index, (code, name, _))| {
            (self.role_filter == 0 || self.role_filter == index + 1)
                && format!("{code} {name}")
                    .to_lowercase()
                    .contains(&self.search.trim().to_lowercase())
        })
        .collect();
        widgets::table(
            ui,
            "administration.roles.table",
            &[
                TableColumn {
                    title: "Mã vai trò",
                    width: 130.0,
                },
                TableColumn {
                    title: "Tên vai trò",
                    width: 190.0,
                },
                TableColumn {
                    title: "Số tài khoản",
                    width: 145.0,
                },
                TableColumn {
                    title: "Phạm vi",
                    width: 330.0,
                },
            ],
            rows.len(),
            |ui, row, col| {
                let (_, (code, name, count)) = rows[row];
                match col {
                    0 => {
                        ui.strong(code);
                    }
                    1 => {
                        ui.label(name);
                    }
                    2 => {
                        ui.label(number(count));
                    }
                    _ => {
                        ui.label(if code == "ADMIN" {
                            "Các API quản trị yêu cầu vai trò ADMIN."
                        } else {
                            "Quyền theo từng API, tài nguyên và chủ sở hữu."
                        });
                    }
                }
            },
        );
        if rows.is_empty() {
            ui.label("Không tìm thấy vai trò phù hợp.");
        }
    }

    fn render_permissions(&mut self, ui: &mut Ui) {
        self.users.status(ui, "Thống kê tài khoản");
        ui.horizontal_wrapped(|ui| {
            ui.label("Vai trò đang xem:");
            widgets::combo_box("administration.permission-role")
                .width(140.0)
                .selected_text(["ADMIN", "USER"][self.selected_role])
                .show_ui(ui, |ui| {
                    ui.selectable_value(&mut self.selected_role, 0, "ADMIN");
                    ui.selectable_value(&mut self.selected_role, 1, "USER");
                });
        });
        ui.group(|ui| {
            ui.set_width(ui.available_width());
            ui.strong("Chưa có API đọc hoặc lưu ma trận phân quyền");
            ui.label("Dấu — nghĩa là chưa có dữ liệu quyền từ máy chủ. Không thể suy ra quyền đã cấp hoặc bị từ chối từ bảng này.");
            ui.weak("Các kiểm tra vai trò và quyền tài nguyên hiện có vẫn do máy chủ thực thi.");
        });
        ui.horizontal_wrapped(|ui| {
            for label in [
                "Cấp toàn quyền",
                "Chỉ xem",
                "In ma trận",
                "Lưu ma trận phân quyền",
            ] {
                unavailable(
                    ui,
                    label,
                    "Chưa có API cấu hình ma trận quyền. Không có thay đổi quyền nào được gửi.",
                );
            }
        });
        widgets::table(
            ui,
            "administration.permissions.table",
            &[
                TableColumn {
                    title: "Phân hệ chức năng",
                    width: 300.0,
                },
                TableColumn {
                    title: "Xem",
                    width: 90.0,
                },
                TableColumn {
                    title: "Thêm mới",
                    width: 100.0,
                },
                TableColumn {
                    title: "Chỉnh sửa",
                    width: 110.0,
                },
                TableColumn {
                    title: "Xóa",
                    width: 90.0,
                },
                TableColumn {
                    title: "Ký duyệt",
                    width: 110.0,
                },
                TableColumn {
                    title: "Xuất tệp",
                    width: 100.0,
                },
            ],
            PERMISSION_MODULES.len(),
            |ui, row, col| {
                if col == 0 {
                    ui.strong(PERMISSION_MODULES[row].0);
                    ui.small(PERMISSION_MODULES[row].1);
                } else {
                    ui.label("—")
                        .on_hover_text("Chưa có dữ liệu quyền từ máy chủ.");
                }
            },
        );
    }

    fn render_backup(&mut self, ui: &mut Ui) {
        self.backups.status(ui, "Hồ sơ sao lưu");
        ui.group(|ui| {
            ui.set_width(ui.available_width());
            ui.strong("Chưa có dịch vụ tạo và khôi phục bản sao lưu");
            ui.label("Danh sách dưới đây chỉ là hồ sơ lưu trên máy chủ. Chưa xác minh tệp sao lưu, checksum, lịch tự động hoặc thời gian phục hồi.");
        });
        ui.horizontal_wrapped(|ui| {
            for label in [
                "Tạo Snapshot thủ công",
                "Tải tệp sao lưu",
                "Khôi phục",
                "Lập lịch sao lưu",
            ] {
                unavailable(
                    ui,
                    label,
                    "Máy chủ chưa cung cấp API thực hiện thao tác sao lưu này.",
                );
            }
        });
        ui.horizontal_wrapped(|ui| {
            for (index, label) in [
                "Tất cả bản lưu",
                "Full System",
                "Database",
                "Storage Blob",
                "Auto Daily",
            ]
            .iter()
            .enumerate()
            {
                if ui
                    .selectable_value(&mut self.backup_filter, index, *label)
                    .changed()
                {
                    self.table_page = 0;
                }
            }
        });
        search(
            ui,
            &mut self.search,
            "Tìm mã, tên hoặc người tạo…",
            &mut self.table_page,
        );
        let types = ["", "Full System", "Database", "Storage Blob", "Auto Daily"];
        let rows: Vec<_> = self
            .backups
            .value
            .as_ref()
            .into_iter()
            .flat_map(|value| &value.data)
            .filter(|row| {
                row.is_object()
                    && (self.backup_filter == 0 || text(row, "type") == types[self.backup_filter])
                    && matches_search(row, &["code", "name", "creator"], &self.search)
            })
            .collect();
        let range = page_range(&mut self.table_page, self.table_size, rows.len());
        widgets::table(
            ui,
            "administration.backups.table",
            &[
                TableColumn {
                    title: "Mã Snapshot & Thời điểm",
                    width: 210.0,
                },
                TableColumn {
                    title: "Tên & Loại",
                    width: 290.0,
                },
                TableColumn {
                    title: "Dung lượng khai báo",
                    width: 150.0,
                },
                TableColumn {
                    title: "Người tạo",
                    width: 170.0,
                },
                TableColumn {
                    title: "Kiểm chứng tệp",
                    width: 170.0,
                },
            ],
            range.len(),
            |ui, row, col| {
                let record = rows[range.start + row];
                match col {
                    0 => {
                        ui.strong(text(record, "code"));
                        ui.small(text(record, "createdAt"));
                    }
                    1 => {
                        ui.add(egui::Label::new(text(record, "name")).truncate())
                            .on_hover_text(text(record, "name"));
                        ui.small(text(record, "type"));
                    }
                    2 => {
                        ui.label(text(record, "size"));
                    }
                    3 => {
                        ui.label(text(record, "creator"));
                    }
                    _ => widgets::tag(ui, "Chưa kiểm chứng", TagTone::Warning),
                }
            },
        );
        if rows.is_empty() && self.backups.task.is_none() && self.backups.error.is_empty() {
            ui.label("Không có hồ sơ sao lưu phù hợp từ máy chủ.");
        }
        ui.small(format!(
            "{} hồ sơ phù hợp; không phải số bản sao lưu đã kiểm chứng.",
            rows.len()
        ));
        widgets::pagination(
            ui,
            "administration.backup.pagination",
            &mut self.table_page,
            rows.len(),
            &mut self.table_size,
        );
    }

    fn render_menu(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        let before = self.menu_group;
        ui.add_enabled_ui(
            self.menu_draft.is_none() && self.menu_save.is_none(),
            |ui| {
                ui.horizontal_wrapped(|ui| {
                    for (index, (_, name)) in MENU_GROUPS.iter().enumerate() {
                        ui.selectable_value(&mut self.menu_group, index, *name);
                    }
                });
            },
        );
        if self.menu_group != before {
            self.menu = ReadState::default();
            self.search.clear();
            self.table_page = 0;
            self.menu_notice.clear();
            self.reload(Page::Menu, session, api);
        }
        ui.separator();
        ui.strong(MENU_GROUPS[self.menu_group].1);
        ui.weak("Thêm và chỉnh sửa được lưu trên máy chủ. Xóa mục và khôi phục mặc định chưa được hỗ trợ trên trang này.");
        self.menu.status(ui, "Danh mục");
        if !self.menu_notice.is_empty() {
            ui.label(&self.menu_notice);
        }
        search(
            ui,
            &mut self.search,
            "Tìm tên, mã hoặc mô tả…",
            &mut self.table_page,
        );
        ui.horizontal_wrapped(|ui| {
            if ui
                .add_enabled(
                    self.menu.value.is_some()
                        && self.menu.task.is_none()
                        && self.menu_save.is_none(),
                    egui::Button::new("＋ Thêm mới"),
                )
                .clicked()
            {
                self.menu_draft = Some(MenuDraft {
                    color: "#009688".into(),
                    order: "1".into(),
                    active: true,
                    ..Default::default()
                });
                self.menu_error.clear();
            }
            unavailable(
                ui,
                "Khôi phục mặc định",
                "Chưa có API khôi phục danh mục mặc định.",
            );
        });
        let mut rows: Vec<_> = self
            .menu
            .value
            .as_ref()
            .into_iter()
            .flat_map(|value| &value.data)
            .filter(|row| {
                row.is_object()
                    && matches_search(row, &["name", "code", "description"], &self.search)
            })
            .collect();
        rows.sort_by_key(|row| row.get("order").and_then(Value::as_u64).unwrap_or(u64::MAX));
        let range = page_range(&mut self.table_page, self.table_size, rows.len());
        let mut edit = None;
        widgets::table(
            ui,
            "administration.menu.table",
            &[
                TableColumn {
                    title: "Tên mục hiển thị",
                    width: 240.0,
                },
                TableColumn {
                    title: "Mã định danh",
                    width: 150.0,
                },
                TableColumn {
                    title: "Mô tả",
                    width: 250.0,
                },
                TableColumn {
                    title: "Thứ tự",
                    width: 90.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 145.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 160.0,
                },
            ],
            range.len(),
            |ui, row, col| {
                let record = rows[range.start + row];
                match col {
                    0 => {
                        ui.horizontal(|ui| {
                            let (swatch, _) = ui
                                .allocate_exact_size(egui::Vec2::splat(12.0), egui::Sense::hover());
                            ui.painter().circle_filled(
                                swatch.center(),
                                5.0,
                                parse_color(text(record, "color"))
                                    .unwrap_or(ui.visuals().text_color()),
                            );
                            ui.add(
                                egui::Label::new(RichText::new(text(record, "name")).strong())
                                    .truncate(),
                            )
                            .on_hover_text(text(record, "name"));
                        });
                    }
                    1 => {
                        ui.label(text(record, "code"));
                    }
                    2 => {
                        ui.add(egui::Label::new(text(record, "description")).truncate())
                            .on_hover_text(text(record, "description"));
                    }
                    3 => {
                        ui.label(record.get("order").map_or("—".into(), Value::to_string));
                    }
                    4 => {
                        ui.label(match record.get("isActive").and_then(Value::as_bool) {
                            Some(true) => "Hoạt động",
                            Some(false) => "Tạm tắt",
                            None => "Chưa khai báo",
                        });
                    }
                    _ => {
                        if ui
                            .add_enabled(
                                record_key(record).is_some() && self.menu_save.is_none(),
                                egui::Button::new("Chỉnh sửa").small(),
                            )
                            .clicked()
                        {
                            edit = Some(record.clone());
                        }
                        unavailable(
                            ui,
                            "Xóa",
                            "Xóa mục danh mục chưa được nối trong API client.",
                        );
                    }
                }
            },
        );
        if let Some(record) = edit {
            self.menu_draft = Some(MenuDraft {
                key: record_key(&record).map(str::to_owned),
                name: text(&record, "name").into(),
                code: record
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                description: record
                    .get("description")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .into(),
                color: record
                    .get("color")
                    .and_then(Value::as_str)
                    .unwrap_or("#009688")
                    .into(),
                order: record
                    .get("order")
                    .and_then(Value::as_u64)
                    .unwrap_or(1)
                    .to_string(),
                active: record
                    .get("isActive")
                    .and_then(Value::as_bool)
                    .unwrap_or(true),
            });
            self.menu_error.clear();
        }
        if rows.is_empty() && self.menu.task.is_none() && self.menu.error.is_empty() {
            ui.label("Không có mục danh mục phù hợp trên máy chủ.");
        }
        ui.small(format!("{} mục phù hợp", rows.len()));
        widgets::pagination(
            ui,
            "administration.menu.pagination",
            &mut self.table_page,
            rows.len(),
            &mut self.table_size,
        );
    }

    fn render_menu_dialog(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let Some(draft) = &mut self.menu_draft else {
            return;
        };
        let mut save = false;
        let mut cancel = false;
        let busy = self.menu_save.is_some();
        let (_, closed) = widgets::modal(
            ctx,
            "administration.menu.edit",
            "Mục danh mục",
            520.0,
            busy,
            |ui| {
                ui.label(MENU_GROUPS[self.menu_group].1);
                for (label, value) in [
                    ("Tên mục *", &mut draft.name),
                    ("Mã định danh", &mut draft.code),
                    ("Mô tả", &mut draft.description),
                    ("Màu sắc (#RRGGBB) *", &mut draft.color),
                    ("Thứ tự *", &mut draft.order),
                ] {
                    ui.label(label);
                    ui.add(egui::TextEdit::singleline(value).desired_width(ui.available_width()));
                    ui.add_space(8.0);
                }
                ui.checkbox(&mut draft.active, "Hoạt động");
                if !self.menu_error.is_empty() {
                    ui.colored_label(ui.visuals().error_fg_color, &self.menu_error);
                }
                ui.add_space(12.0);
                ui.horizontal_wrapped(|ui| {
                    cancel = ui.button("Hủy").clicked();
                    save = ui.button("Lưu danh mục").clicked();
                });
            },
        );
        if busy {
            ctx.request_repaint_after(Duration::from_millis(100));
        } else if cancel || closed {
            self.menu_draft = None;
        } else if save {
            match draft.patch() {
                Err(error) => self.menu_error = error,
                Ok(mut patch) => {
                    let scope = format!("dropdown_{}", MENU_GROUPS[self.menu_group].0);
                    let revision = self
                        .menu
                        .value
                        .as_ref()
                        .map(|value| value.revision.as_str())
                        .filter(|revision| !revision.is_empty());
                    self.menu_save = Some(if let Some(key) = &draft.key {
                        api.patch_generic_collection_record_task(
                            session, &scope, key, &patch, revision,
                        )
                    } else {
                        patch["id"] = json!(format!(
                            "opt-{}-{}",
                            MENU_GROUPS[self.menu_group].0,
                            Utc::now().timestamp_micros()
                        ));
                        api.create_generic_collection_record_task(session, &scope, &patch, revision)
                    });
                    self.menu_error.clear();
                    self.menu_notice.clear();
                }
            }
        }
    }

    fn render_system(&self, ui: &mut Ui, session: &Session) {
        ui.group(|ui| {
            ui.set_width(ui.available_width());
            ui.strong("Kết nối API");
            ui.add(egui::Label::new(&session.endpoint).wrap());
            self.health.status(ui, "Kiểm tra kết nối");
            if self.health.value.is_some() && self.health.error.is_empty() { ui.label("Lần kiểm tra nhận phản hồi HTTP thành công."); }
            if let Some(at) = &self.health.checked_at { ui.small(format!("Lần kiểm tra: {at}")); }
            ui.weak("Kiểm tra kết nối không xác nhận tình trạng cơ sở dữ liệu, sao lưu, CPU hoặc bộ nhớ.");
        });
        ui.add_space(12.0);
        ui.group(|ui| {
            ui.set_width(ui.available_width());
            ui.strong("Cổng gửi email doanh nghiệp");
            self.email.status(ui, "Trạng thái cấu hình email");
            ui.label(self.email.value.as_ref().map_or(
                "Chưa có trạng thái cấu hình email từ máy chủ.",
                |email| {
                    if email.email_configured {
                        "Máy chủ báo đã cấu hình email."
                    } else {
                        "Máy chủ báo chưa cấu hình email."
                    }
                },
            ));
            ui.weak("Chưa có API đọc/lưu thông số SMTP hoặc gửi email thử trên trang này.");
            for label in [
                "Máy chủ SMTP",
                "Cổng SMTP",
                "Email người gửi",
                "Tên người gửi",
                "Tài khoản SMTP",
                "Mật khẩu ứng dụng",
                "Bảo mật kết nối",
                "Địa chỉ cổng nhân viên",
            ] {
                readonly_field(ui, label);
            }
            ui.horizontal_wrapped(|ui| {
                unavailable(ui, "Gửi thử email", "API gửi thử email chưa được hỗ trợ.");
                unavailable(
                    ui,
                    "Lưu cấu hình email",
                    "API cấu hình SMTP chưa được hỗ trợ.",
                );
            });
        });
        ui.add_space(12.0);
        ui.group(|ui| {
            ui.set_width(ui.available_width());
            ui.strong("Đăng nhập Google SSO");
            widgets::tag(ui, "Chưa hỗ trợ", TagTone::Warning);
            ui.label("Chưa có API cấu hình hoặc kiểm tra Google OAuth. Không có thông tin kết nối đã xác thực để hiển thị.");
            for label in ["Google Client ID", "Client Secret", "Redirect URI", "Tên miền Workspace", "Chế độ xác thực"] { readonly_field(ui, label); }
            ui.horizontal_wrapped(|ui| {
                unavailable(ui, "Kiểm tra Google OAuth", "Chưa có API kiểm tra kết nối Google.");
                unavailable(ui, "Lưu cấu hình Google SSO", "Chưa có API lưu cấu hình Google.");
            });
        });
    }
}

fn metric<'a>(label: &'a str, value: String, detail: &'a str) -> Metric<'a> {
    Metric {
        label,
        value,
        detail,
        color: crate::theme::PRIMARY,
        value_size: 22.0,
    }
}

fn number(value: Option<usize>) -> String {
    value.map_or("—".into(), |value| value.to_string())
}

fn unavailable(ui: &mut Ui, label: &str, reason: &str) {
    ui.add_enabled(false, egui::Button::new(label).wrap())
        .on_disabled_hover_text(reason);
}

fn readonly_field(ui: &mut Ui, label: &str) {
    let response = ui.label(label);
    let mut value = String::new();
    ui.add_enabled(
        false,
        egui::TextEdit::singleline(&mut value)
            .hint_text("Chưa có API cấu hình")
            .desired_width(ui.available_width()),
    )
    .labelled_by(response.id);
}

fn search(ui: &mut Ui, value: &mut String, hint: &str, page: &mut usize) {
    if ui
        .add(
            egui::TextEdit::singleline(value)
                .hint_text(hint)
                .desired_width(360.0_f32.min(ui.available_width())),
        )
        .changed()
    {
        *page = 0;
    }
}

fn text<'a>(record: &'a Value, key: &str) -> &'a str {
    record.get(key).and_then(Value::as_str).unwrap_or("—")
}

fn record_key(record: &Value) -> Option<&str> {
    ["key", "id", "code"].iter().find_map(|key| {
        record
            .get(*key)
            .and_then(Value::as_str)
            .filter(|key| !key.trim().is_empty())
    })
}

fn matches_search(record: &Value, fields: &[&str], query: &str) -> bool {
    let query = query.trim().to_lowercase();
    fields
        .iter()
        .any(|key| text(record, key).to_lowercase().contains(&query))
}

fn page_range(page: &mut usize, page_size: usize, count: usize) -> std::ops::Range<usize> {
    let page_size = page_size.max(1);
    *page = (*page).min(count.div_ceil(page_size).saturating_sub(1));
    let start = *page * page_size;
    start..(start + page_size).min(count)
}

fn parse_color(value: &str) -> Option<Color32> {
    let hex = value.trim().strip_prefix('#')?;
    if hex.len() != 6 || !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let value = u32::from_str_radix(hex, 16).ok()?;
    Some(Color32::from_rgb(
        (value >> 16) as u8,
        (value >> 8) as u8,
        value as u8,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROUTES: [&str; 6] = [
        "/admin/overview",
        "/admin/roles",
        "/admin/permissions",
        "/admin/backup",
        "/admin/drop-menu",
        "/admin/system",
    ];

    fn session() -> Session {
        serde_json::from_value(json!({
            "user": {"id": "admin", "email": "admin@example.test", "name": "Admin", "role": "ADMIN", "isActive": true},
            "endpoint": "http://127.0.0.1:1/api/v1", "session_id": "test", "token": "test", "mode": "local_admin"
        })).unwrap()
    }

    fn fixture(page: Page, session: &Session) -> AdministrationView {
        let mut view = AdministrationView {
            identity: Some((
                session.user.id.clone(),
                session.endpoint.clone(),
                session.session_id.clone(),
            )),
            page: Some(page),
            table_size: 8,
            ..Default::default()
        };
        view.users.value = Some(
            serde_json::from_value(json!({
                "data": [], "pagination": {"page": 1, "limit": 1, "total": 200},
                "summary": {"total": 200, "admins": 5, "active": 150}
            }))
            .unwrap(),
        );
        view.backups.value = Some(GenericCollectionResponse {
            data: vec![
                json!({"code": "SNAP-test", "name": "Hồ sơ mẫu từ máy chủ", "type": "Database", "size": "14 GB", "creator": "Admin", "createdAt": "2026-10-25", "status": "Toàn vẹn 100%"}),
            ],
            ..Default::default()
        });
        view.menu.value = Some(GenericCollectionResponse { data: (0..30).map(|index| json!({
            "id": format!("position-{index}"), "name": "Chức danh có tên dài cần xuống dòng ".repeat(4),
            "code": format!("POS-{index}"), "description": "Mô tả công việc ".repeat(20),
            "color": "#009688", "order": index + 1, "isActive": true
        })).collect(), ..Default::default() });
        view
    }

    fn shape_text(shape: &egui::epaint::Shape, output: &mut String) {
        match shape {
            egui::epaint::Shape::Text(text) => {
                output.push_str(&text.galley.job.text);
                output.push('\n');
            }
            egui::epaint::Shape::Vec(shapes) => {
                for shape in shapes {
                    shape_text(shape, output);
                }
            }
            _ => {}
        }
    }

    fn frame(
        view: &mut AdministrationView,
        session: &Session,
        path: &str,
        width: f32,
        ctx: &egui::Context,
    ) -> String {
        let output = ctx.run(
            egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(
                    egui::Pos2::ZERO,
                    egui::vec2(width, 844.0),
                )),
                ..Default::default()
            },
            |ctx| {
                egui::CentralPanel::default().show(ctx, |ui| {
                    egui::ScrollArea::vertical().show(ui, |ui| {
                        let clip = ui.clip_rect();
                        view.render(ui, ctx, session, &ApiClient::default(), path);
                        assert!(
                            ui.min_rect().right() <= clip.right() + 1.0,
                            "{path} width {width}: {:?} vs {clip:?}",
                            ui.min_rect()
                        );
                        assert!(
                            ui.min_rect().bottom() <= clip.bottom() + 1.0,
                            "{path} width {width}: {:?} vs {clip:?}",
                            ui.min_rect()
                        );
                    });
                });
            },
        );
        let mut text = String::new();
        for shape in &output.shapes {
            shape_text(&shape.shape, &mut text);
        }
        text
    }

    #[test]
    fn route_pages_have_distinct_source_backed_content_and_fit_four_viewports() {
        let session = session();
        let markers = [
            "Tài khoản hệ thống",
            "Vai trò tài khoản hỗ trợ",
            "Chưa có API đọc hoặc lưu ma trận phân quyền",
            "Chưa kiểm chứng",
            "Chức danh đảm nhiệm",
            "Cổng gửi email doanh nghiệp",
        ];
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let mut outputs = Vec::new();
            for (path, marker) in ROUTES.into_iter().zip(markers) {
                let ctx = egui::Context::default();
                crate::native_text::setup_fonts(&ctx);
                let mut view = fixture(Page::from_path(path).unwrap(), &session);
                let mut output = String::new();
                for _ in 0..3 {
                    output = frame(&mut view, &session, path, width, &ctx);
                }
                assert!(
                    output.contains(marker),
                    "{path}: missing {marker}: {output}"
                );
                assert!(!output.contains("API & Lưu trữ"));
                assert!(!output.contains("Toàn vẹn 100%"));
                assert!(!output.contains("ROLE_SUPER_ADMIN"));
                outputs.push(output);
                assert!(!view.loading(), "Fixtures must not issue network requests");
            }
            for left in 0..outputs.len() {
                for right in left + 1..outputs.len() {
                    assert_ne!(outputs[left], outputs[right]);
                }
            }
        }
    }

    #[test]
    fn loading_and_failed_requests_keep_layout_bounded_and_do_not_claim_success() {
        let session = session();
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            let mut view = fixture(Page::System, &session);
            view.health.task = Some(std::sync::Arc::new(std::sync::Mutex::new(None)));
            view.email.error = "Không thể đọc cấu hình máy chủ. ".repeat(20);
            let output = frame(&mut view, &session, "/admin/system", width, &ctx);
            assert!(output.contains("Đang tải Kiểm tra kết nối"));
            assert!(!output.contains("nhận phản hồi HTTP thành công"));
        }
    }

    #[test]
    fn admin_acl_denies_render_and_clears_cached_data_before_any_requests() {
        let mut session = session();
        let mut view = fixture(Page::Backup, &session);
        session.user.role = "USER".into();
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        let output = frame(&mut view, &session, "/admin/backup", 320.0, &ctx);
        assert!(output.contains("Không đủ quyền"));
        assert!(!output.contains("SNAP-test"));
        assert!(view.backups.value.is_none());
        assert!(view.identity.is_none());
        assert!(!view.loading());
    }

    #[test]
    fn route_matching_is_exact_and_does_not_swallow_other_admin_pages() {
        for path in ROUTES {
            assert_eq!(Page::from_path(path), Page::from_path(&format!("{path}/")));
        }
        for path in [
            "/admin/users",
            "/admin/sessions",
            "/admin/system/notifications",
            "/admin/system/migration",
            "/admin/settings",
            "/employee/system",
        ] {
            assert_eq!(Page::from_path(path), None);
        }
    }

    #[test]
    fn totals_use_server_summary_and_never_count_a_partial_user_page() {
        let session = session();
        let mut view = fixture(Page::Roles, &session);
        assert!(view.users.value.as_ref().unwrap().data.is_empty());
        assert_eq!(view.summary().unwrap().total, 200);
        view.users.value.as_mut().unwrap().summary = None;
        assert_eq!(view.summary(), None);
        view.users.value.as_mut().unwrap().summary = Some(UsersSummary {
            total: 1,
            admins: 2,
            active: 1,
        });
        assert_eq!(view.summary(), None);
    }

    #[test]
    fn failed_refresh_retains_the_last_value_but_preserves_the_error() {
        let mut state = ReadState::<String>::default();
        state.value = Some("Previous response".into());
        state.start(std::sync::Arc::new(std::sync::Mutex::new(Some(Err(
            "HTTP 503".into(),
        )))));
        state.poll();
        assert_eq!(state.value.as_deref(), Some("Previous response"));
        assert_eq!(state.error, "HTTP 503");
        assert!(state.task.is_none());
        assert!(state.checked_at.is_some());
    }

    #[test]
    fn menu_patch_validates_fields_without_changing_identity_or_unknown_metadata() {
        let mut draft = MenuDraft {
            key: Some("existing-id".into()),
            name: "  Kỹ sư  ".into(),
            order: "2".into(),
            color: "#009688".into(),
            active: true,
            ..Default::default()
        };
        let patch = draft.patch().unwrap();
        assert_eq!(patch["name"], "Kỹ sư");
        assert_eq!(patch["order"], 2);
        assert!(patch.get("id").is_none() && patch.get("key").is_none());
        draft.name.clear();
        assert!(draft.patch().is_err());
        draft.name = "Kỹ sư".into();
        draft.order = "0".into();
        assert!(draft.patch().is_err());
        draft.order = "-2".into();
        assert!(draft.patch().is_err());
        draft.order = "2".into();
        draft.color = "#+12345".into();
        assert!(draft.patch().is_err());
        draft.color = "#ff00CC".into();
        assert!(draft.patch().is_ok());
        assert_eq!(record_key(&json!({"key": "key", "id": "id"})), Some("key"));
    }

    #[test]
    fn filtering_pagination_and_reset_drop_stale_selection_and_pending_state() {
        let mut page = usize::MAX;
        assert_eq!(page_range(&mut page, 8, 17), 16..17);
        assert_eq!(page_range(&mut page, 8, 0), 0..0);
        assert!(matches_search(
            &json!({"name": "Kỹ sư", "code": "ENG"}),
            &["name", "code"],
            " eng "
        ));
        let mut view = fixture(Page::Menu, &session());
        view.menu_draft = Some(MenuDraft::default());
        view.reset();
        assert!(view.page.is_none() && view.menu.value.is_none() && view.menu_draft.is_none());
        assert!(!view.loading());
    }
}
