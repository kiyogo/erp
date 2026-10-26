use std::time::Duration;

use chrono::NaiveDate;
use egui::{Color32, RichText, Ui};
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, ContractSummary, ContractsResponse, DocumentRecord, DocumentsResponse,
        FileListResponse, FileNode,
    },
    models::{NavGroup, NavItem, Session},
    widgets::{self, Metric, TagTone},
};

const CATEGORIES: &[&str] = &[
    "Quy chế & quyết định",
    "Hợp đồng & pháp lý",
    "Thông báo",
    "Tài liệu cộng tác",
];
const REFRESH: Duration = Duration::from_secs(30);

#[derive(Clone, Debug)]
struct OverviewItem {
    key: String,
    code: String,
    title: String,
    category: &'static str,
    origin: String,
    owner: String,
    owner_role: String,
    issued: Option<NaiveDate>,
    effective: Option<NaiveDate>,
    security: String,
    status: String,
    summary: String,
    revision: Option<i64>,
    verification: String,
}

fn known(value: &str) -> &str {
    if value.trim().is_empty() {
        "Chưa có dữ liệu"
    } else {
        value
    }
}

fn first(values: &[&str]) -> String {
    values
        .iter()
        .find(|value| !value.trim().is_empty())
        .copied()
        .unwrap_or_default()
        .into()
}

fn date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value.split('T').next().unwrap_or_default(), "%Y-%m-%d").ok()
}

fn date_label(value: Option<NaiveDate>) -> String {
    value
        .map(|date| date.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "Chưa có dữ liệu".into())
}

fn category_for_title(title: &str) -> &'static str {
    let title = title.to_lowercase();
    if ["quyết định", "quy chế", "quy che"]
        .iter()
        .any(|word| title.contains(word))
    {
        CATEGORIES[0]
    } else if title.contains("hợp đồng") || title.contains("nda") {
        CATEGORIES[1]
    } else if title.contains("thông báo") {
        CATEGORIES[2]
    } else {
        CATEGORIES[3]
    }
}

impl OverviewItem {
    fn document(item: &DocumentRecord) -> Self {
        let revision = (item.current_revision > 0).then_some(item.current_revision);
        Self {
            key: format!("document:{}", item.id),
            code: item.id.clone(),
            title: item.title.clone(),
            category: category_for_title(&item.title),
            origin: first(&[&item.owner_name, &item.owner_code]),
            owner: first(&[&item.owner_name, &item.owner_code]),
            owner_role: item.user_role.clone(),
            issued: date(&item.created_at),
            effective: date(&item.updated_at).or_else(|| date(&item.created_at)),
            security: item
                .settings
                .get("securityLevel")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .into(),
            status: match revision {
                Some(1) => "Mới tạo",
                Some(_) => "Có nhiều revision",
                None => "Chưa có dữ liệu revision",
            }
            .into(),
            summary: "Tài liệu cộng tác; số revision không phải số tệp đính kèm.".into(),
            revision,
            verification: String::new(),
        }
    }

    fn contract(item: &ContractSummary) -> Self {
        Self {
            key: format!("contract:{}", first(&[&item.id, &item.key, &item.code])),
            code: first(&[&item.code, &item.id]),
            title: item.name.clone(),
            category: CATEGORIES[1],
            origin: first(&[&item.department, &item.contract_category]),
            owner: first(&[
                item.signer_name.as_deref().unwrap_or_default(),
                &item.employee_name,
                &item.party_b_name,
            ]),
            owner_role: item.signer_position.clone().unwrap_or_default(),
            issued: date(&item.created_at).or_else(|| date(&item.start_date)),
            effective: date(&item.start_date).or_else(|| date(&item.updated_at)),
            security: match item.nda_clause {
                Some(true) => "Có điều khoản NDA",
                Some(false) => "Không có điều khoản NDA",
                None => "Chưa có dữ liệu NDA",
            }
            .into(),
            status: item.status.clone(),
            summary: format!(
                "Mẫu: {}. Bên liên quan: {}. Nhân viên: {}; doanh nghiệp: {}.",
                known(&item.contract_template),
                known(&first(&[&item.employee_name, &item.party_b_name])),
                known(&item.employee_sign_status),
                known(&item.company_sign_status)
            ),
            revision: None,
            verification: item.signature_verification_status.clone(),
        }
    }

    fn matches(&self, category: &str, query: &str) -> bool {
        (category.is_empty() || self.category == category)
            && (query.trim().is_empty()
                || [
                    &self.code,
                    &self.title,
                    &self.origin,
                    &self.owner,
                    &self.status,
                ]
                .iter()
                .any(|value| value.to_lowercase().contains(&query.trim().to_lowercase())))
    }
}

#[derive(Default, Debug)]
struct Overview {
    items: Vec<OverviewItem>,
    total: Option<usize>,
    collaborative: Option<usize>,
    pending: Option<usize>,
    signed: Option<usize>,
    active_contracts: Option<usize>,
    root_bytes: Option<u64>,
    root_entries: Option<usize>,
    breakdown: Vec<(&'static str, usize)>,
}

fn aggregate(
    documents: Option<&[DocumentRecord]>,
    contracts: Option<&[ContractSummary]>,
    files: Option<&[FileNode]>,
) -> Overview {
    let mut items = documents
        .unwrap_or_default()
        .iter()
        .map(OverviewItem::document)
        .chain(
            contracts
                .unwrap_or_default()
                .iter()
                .map(OverviewItem::contract),
        )
        .collect::<Vec<_>>();
    items.sort_by(|left, right| {
        right
            .effective
            .cmp(&left.effective)
            .then_with(|| left.key.cmp(&right.key))
    });
    let breakdown = CATEGORIES
        .iter()
        .filter_map(|category| {
            let count = items
                .iter()
                .filter(|item| item.category == *category)
                .count();
            (count > 0).then_some((*category, count))
        })
        .collect();
    Overview {
        total: documents
            .zip(contracts)
            .map(|(docs, contracts)| docs.len() + contracts.len()),
        collaborative: documents.map(<[DocumentRecord]>::len),
        pending: contracts.map(|items| {
            items
                .iter()
                .filter(|item| matches!(item.status.as_str(), "Chờ ký" | "Chờ duyệt"))
                .count()
        }),
        signed: contracts.map(|items| {
            items
                .iter()
                .filter(|item| {
                    item.employee_sign_status == "Đã ký" || item.company_sign_status == "Đã ký"
                })
                .count()
        }),
        active_contracts: contracts.map(|items| {
            items
                .iter()
                .filter(|item| item.status == "Còn hiệu lực")
                .count()
        }),
        root_bytes: files.and_then(|items| {
            items
                .iter()
                .try_fold(0_u64, |total, item| match item.node_type.as_str() {
                    "folder" => Some(total),
                    "file" => total.checked_add(u64::try_from(item.size_bytes).ok()?),
                    _ => None,
                })
        }),
        root_entries: files.map(<[FileNode]>::len),
        items,
        breakdown,
    }
}

fn count_label(value: Option<usize>) -> String {
    value
        .map(|value| value.to_string())
        .unwrap_or_else(|| "—".into())
}

fn storage_label(bytes: Option<u64>) -> String {
    match bytes {
        Some(bytes) if bytes >= 1 << 30 => format!("{:.2} GB", bytes as f64 / (1_u64 << 30) as f64),
        Some(bytes) if bytes >= 1 << 20 => format!("{:.1} MB", bytes as f64 / (1_u64 << 20) as f64),
        Some(bytes) if bytes >= 1 << 10 => format!("{:.1} KB", bytes as f64 / (1_u64 << 10) as f64),
        Some(bytes) => format!("{bytes} B"),
        None => "—".into(),
    }
}

#[derive(Default)]
pub struct DocumentOverviewView {
    account: String,
    documents: Option<Vec<DocumentRecord>>,
    contracts: Option<Vec<ContractSummary>>,
    files: Option<Vec<FileNode>>,
    document_task: Option<ApiTask<DocumentsResponse>>,
    contract_task: Option<ApiTask<ContractsResponse>>,
    file_task: Option<ApiTask<FileListResponse>>,
    errors: [String; 3],
    last_request: Option<Instant>,
    root_label: String,
    search: String,
    category: String,
    selected_key: Option<String>,
    /// The owning app consumes this after render to follow overview shortcuts.
    pub nav_change: Option<NavItem>,
}

impl DocumentOverviewView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn busy(&self) -> bool {
        self.document_task.is_some() || self.contract_task.is_some() || self.file_task.is_some()
    }

    fn load(&mut self, session: &Session, api: &ApiClient) {
        if self.busy() {
            return;
        }
        self.document_task = Some(api.list_documents_task(session));
        self.contract_task = Some(api.list_contracts_task(session));
        self.file_task = Some(api.list_files_task(session, None, false));
        self.last_request = Some(Instant::now());
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if let Some(result) = self.document_task.as_ref().and_then(ApiClient::poll) {
            self.document_task = None;
            match result {
                Ok(response) => {
                    self.documents = Some(response.data);
                    self.errors[0].clear();
                }
                Err(error) => self.errors[0] = error,
            }
        }
        if let Some(result) = self.contract_task.as_ref().and_then(ApiClient::poll) {
            self.contract_task = None;
            match result {
                Ok(response) => {
                    self.contracts = Some(response.data);
                    self.errors[1].clear();
                }
                Err(error) => self.errors[1] = error,
            }
        }
        if let Some(result) = self.file_task.as_ref().and_then(ApiClient::poll) {
            self.file_task = None;
            match result {
                Ok(response) => {
                    self.files = Some(response.data);
                    self.root_label = response.context.root_label;
                    self.errors[2].clear();
                }
                Err(error) => self.errors[2] = error,
            }
        }
        if !self.busy()
            && self
                .last_request
                .is_none_or(|last| last.elapsed() >= REFRESH)
        {
            self.load(session, api);
        }
        ctx.request_repaint_after(if self.busy() {
            Duration::from_millis(80)
        } else {
            REFRESH
        });
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            self.reset();
            ui.label("Bạn không có quyền xem tổng quan tài liệu quản trị.");
            return;
        }
        let account = format!(
            "{}\n{}\n{}",
            session.endpoint, session.user.id, session.session_id
        );
        if self.account != account {
            self.reset();
            self.account = account;
        }
        self.poll(ctx, session, api);
        if self.render_content(ui) {
            self.load(session, api);
        }
        let overview = self.overview();
        self.render_detail(ctx, &overview.items);
    }

    fn overview(&self) -> Overview {
        aggregate(
            self.documents.as_deref(),
            self.contracts.as_deref(),
            self.files.as_deref(),
        )
    }

    fn request_navigation(&mut self, path: &'static str, title: &'static str) {
        self.nav_change = Some(NavItem::new(
            "document-overview-shortcut",
            title,
            path,
            "📄",
            NavGroup::Documents,
        ));
    }

    fn render_content(&mut self, ui: &mut Ui) -> bool {
        let overview = self.overview();
        ui.add_space(8.0);
        let root_detail = format!(
            "{} mục ở gốc {}; không gồm thư mục con",
            count_label(overview.root_entries),
            known(&self.root_label)
        );
        let labels = [
            "Tổng hồ sơ tài liệu",
            "Tài liệu cộng tác",
            "Hồ sơ chờ ký hoặc chờ duyệt",
            "Dung lượng tệp đang thấy ở kho gốc",
        ];
        let values = [
            count_label(overview.total),
            count_label(overview.collaborative),
            count_label(overview.pending),
            storage_label(overview.root_bytes),
        ];
        let details = [
            "Gồm tài liệu cộng tác và hợp đồng",
            "Từ danh sách tài liệu được cấp quyền",
            "Theo trạng thái hợp đồng đã lưu",
            root_detail.as_str(),
        ];
        let colors = [
            crate::theme::PRIMARY,
            Color32::from_rgb(37, 99, 235),
            Color32::from_rgb(217, 119, 6),
            Color32::from_rgb(22, 163, 74),
        ];
        let metrics = (0..4)
            .map(|index| Metric {
                label: labels[index],
                value: values[index].clone(),
                detail: details[index],
                color: colors[index],
                value_size: 24.0,
            })
            .collect::<Vec<_>>();
        widgets::metrics_with_padding(
            ui,
            "document.overview.metrics",
            &metrics,
            egui::vec2(18.0, 16.0),
        );
        ui.add_space(16.0);
        egui::Frame::group(ui.style()).inner_margin(16.0).show(ui, |ui| {
            ui.add(egui::Label::new(RichText::new(format!("Tình trạng hồ sơ đang hiển thị · {}", chrono::Utc::now().format("%Y-%m-%d"))).strong()).wrap());
            ui.add(egui::Label::new(format!("{} hợp đồng có ít nhất một bên ở trạng thái đã ký. Trạng thái lưu trong hồ sơ không xác nhận chứng thư CA.", count_label(overview.signed))).wrap());
            if let Some((signed, total)) = overview.signed.zip(overview.total) {
                ui.add(egui::ProgressBar::new(if total == 0 { 0.0 } else { signed as f32 / total as f32 })
                    .text("Hồ sơ có trạng thái ký / tổng hồ sơ").desired_width(ui.available_width()));
            }
            ui.horizontal_wrapped(|ui| {
                if ui.button("Thiết lập tài liệu").clicked() { self.request_navigation("/admin/documents/settings", "Thiết lập tài liệu"); }
            });
        });
        ui.add_space(12.0);
        let (rect, _) = ui.allocate_exact_size(
            egui::vec2(ui.available_width().min(380.0), 32.0),
            egui::Sense::hover(),
        );
        widgets::search_input(
            ui,
            rect,
            &mut self.search,
            "Tìm mã, tiêu đề, đơn vị, người phụ trách...",
        );
        ui.add_space(10.0);
        ui.horizontal_wrapped(|ui| {
            for category in std::iter::once("").chain(CATEGORIES.iter().copied()) {
                if ui
                    .selectable_label(
                        self.category == category,
                        if category.is_empty() {
                            "Tất cả hồ sơ"
                        } else {
                            category
                        },
                    )
                    .clicked()
                {
                    self.category = category.into();
                }
            }
        });
        let mut reload = false;
        ui.horizontal_wrapped(|ui| {
            reload = ui
                .add_enabled(!self.busy(), egui::Button::new("Làm mới"))
                .clicked();
        });
        if self.busy() {
            ui.spinner();
        }
        for (index, error) in self.errors.iter().enumerate() {
            if !error.is_empty() {
                ui.add(
                    egui::Label::new(
                        RichText::new(format!(
                            "{}: {error}",
                            ["Tài liệu cộng tác", "Hợp đồng", "Kho tệp gốc"][index]
                        ))
                        .color(Color32::from_rgb(185, 28, 28)),
                    )
                    .wrap(),
                );
            }
        }
        if overview.total.is_none() || self.errors.iter().any(|error| !error.is_empty()) {
            ui.label("Tổng hợp chưa đầy đủ. Các nguồn đã tải vẫn được giữ; chỉ số thiếu nguồn hiển thị —.");
        }
        ui.add_space(16.0);
        if ui.available_width() >= 800.0 && ui.ctx().screen_rect().width() > 992.0 {
            let left = (ui.available_width() - 16.0) * 1.4 / 2.4;
            let right = ui.available_width() - 16.0 - left;
            ui.horizontal_top(|ui| {
                ui.spacing_mut().item_spacing.x = 16.0;
                ui.allocate_ui_with_layout(
                    egui::vec2(left, 0.0),
                    egui::Layout::top_down(egui::Align::Min),
                    |ui| self.render_recent(ui, &overview),
                );
                ui.allocate_ui_with_layout(
                    egui::vec2(right, 0.0),
                    egui::Layout::top_down(egui::Align::Min),
                    |ui| self.render_breakdown(ui, &overview),
                );
            });
        } else {
            self.render_recent(ui, &overview);
            ui.add_space(16.0);
            self.render_breakdown(ui, &overview);
        }
        reload
    }

    fn render_recent(&mut self, ui: &mut Ui, overview: &Overview) {
        egui::Frame::group(ui.style())
            .inner_margin(16.0)
            .show(ui, |ui| {
                ui.label(RichText::new("Hồ Sơ Gần Đây").strong().size(15.0));
                ui.horizontal_wrapped(|ui| {
                    if ui.button("Vào sổ").clicked() {
                        self.request_navigation("/admin/documents/archives", "Văn thư");
                    }
                    if ui.button("Xem tất cả").clicked() {
                        self.request_navigation("/admin/documents/list", "Tài liệu");
                    }
                });
                ui.add_space(12.0);
                let filtered = overview
                    .items
                    .iter()
                    .filter(|item| item.matches(&self.category, &self.search))
                    .collect::<Vec<_>>();
                if filtered.is_empty() {
                    ui.label(if overview.total == Some(0) {
                        "Chưa có văn bản hoặc hợp đồng để hiển thị."
                    } else {
                        "Chưa có hồ sơ phù hợp từ các nguồn đã tải."
                    });
                }
                for item in filtered.iter().take(8) {
                    egui::Frame::group(ui.style())
                        .fill(Color32::from_rgb(248, 250, 252))
                        .inner_margin(12.0)
                        .show(ui, |ui| {
                            ui.add(
                                egui::Label::new(
                                    RichText::new(known(&item.code))
                                        .strong()
                                        .color(crate::theme::PRIMARY),
                                )
                                .wrap(),
                            );
                            widgets::tag(ui, item.category, TagTone::Cyan);
                            ui.add(
                                egui::Label::new(RichText::new(known(&item.title)).strong()).wrap(),
                            );
                            ui.add(
                                egui::Label::new(format!(
                                    "Nguồn: {} · Phụ trách: {} ({})",
                                    known(&item.origin),
                                    known(&item.owner),
                                    date_label(item.issued)
                                ))
                                .wrap(),
                            );
                            ui.add(
                                egui::Label::new(format!("Trạng thái: {}", known(&item.status)))
                                    .wrap(),
                            );
                            ui.add(
                                egui::Label::new(format!(
                                    "Bảo mật / NDA khai báo: {}",
                                    known(&item.security)
                                ))
                                .wrap(),
                            );
                            if ui.button("Xem").clicked() {
                                self.selected_key = Some(item.key.clone());
                            }
                        });
                    ui.add_space(10.0);
                }
                if filtered.len() > 8 {
                    ui.label(format!(
                        "Hiển thị 8 / {} hồ sơ phù hợp, theo ngày cập nhật / hiệu lực.",
                        filtered.len()
                    ));
                }
            });
    }

    fn render_breakdown(&mut self, ui: &mut Ui, overview: &Overview) {
        egui::Frame::group(ui.style())
            .inner_margin(16.0)
            .show(ui, |ui| {
                ui.add(
                    egui::Label::new(RichText::new("Phân Bổ Theo Loại Hồ Sơ").strong().size(15.0))
                        .wrap(),
                );
                ui.small("Tài liệu phân loại theo tên; hợp đồng theo nguồn hồ sơ.");
                if overview.total.is_none() {
                    ui.label("Phân bổ từ những nguồn đã tải, chưa phải toàn bộ hồ sơ.");
                }
                if overview.breakdown.is_empty() {
                    ui.label("Chưa có loại hồ sơ nào để tổng hợp.");
                }
                for (index, (category, count)) in overview.breakdown.iter().enumerate() {
                    let ratio = *count as f32 / overview.items.len().max(1) as f32;
                    ui.add_space(12.0);
                    ui.label(*category);
                    ui.label(format!("{count} hồ sơ ({:.0}%)", ratio * 100.0));
                    ui.add(
                        egui::ProgressBar::new(ratio)
                            .fill(
                                [
                                    crate::theme::PRIMARY,
                                    Color32::from_rgb(37, 99, 235),
                                    Color32::from_rgb(124, 58, 237),
                                    Color32::from_rgb(217, 119, 6),
                                ][index % 4],
                            )
                            .desired_width(ui.available_width()),
                    );
                }
                ui.add_space(20.0);
                ui.separator();
                ui.add(
                    egui::Label::new(format!(
                        "Hợp đồng có trạng thái còn hiệu lực: {}",
                        count_label(overview.active_contracts)
                    ))
                    .wrap(),
                );
                ui.small("Theo trạng thái đã lưu; chưa đối soát hiệu lực pháp lý hoặc CA.");
                ui.horizontal_wrapped(|ui| {
                    ui.add_enabled(false, egui::Button::new("Xuất báo cáo"))
                        .on_disabled_hover_text(
                            "Chưa có tệp báo cáo được tạo bởi dịch vụ xuất tài liệu.",
                        );
                    if ui.button("Thiết lập").clicked() {
                        self.request_navigation("/admin/documents/settings", "Thiết lập tài liệu");
                    }
                });
            });
    }

    fn render_detail(&mut self, ctx: &egui::Context, items: &[OverviewItem]) {
        let Some(key) = self.selected_key.as_deref() else {
            return;
        };
        let Some(item) = items.iter().find(|item| item.key == key) else {
            self.selected_key = None;
            return;
        };
        let (_, closed) = widgets::drawer(
            ctx,
            "document.overview.detail",
            "Chi tiết hồ sơ tài liệu",
            640.0,
            |ui| {
                ui.add(
                    egui::Label::new(RichText::new(known(&item.title)).strong().size(17.0)).wrap(),
                );
                for (label, value) in [
                    ("Số / ký hiệu", known(&item.code)),
                    ("Phân loại", item.category),
                    ("Nguồn / đơn vị", known(&item.origin)),
                    ("Người phụ trách", known(&item.owner)),
                    ("Vai trò khai báo", known(&item.owner_role)),
                    ("Trạng thái", known(&item.status)),
                    ("Bảo mật / NDA khai báo", known(&item.security)),
                    ("Tóm tắt", &item.summary),
                ] {
                    ui.add_space(10.0);
                    ui.label(RichText::new(label).strong());
                    ui.add(egui::Label::new(value).wrap());
                }
                ui.label(format!("Ngày tạo / ban hành: {}", date_label(item.issued)));
                ui.label(format!(
                    "Ngày hiệu lực / cập nhật: {}",
                    date_label(item.effective)
                ));
                if let Some(revision) = item.revision {
                    ui.label(format!("Revision hiện tại: {revision}"));
                }
                if !item.verification.is_empty() {
                    ui.add(
                        egui::Label::new(format!(
                            "Trạng thái xác minh trong hồ sơ: {}",
                            item.verification
                        ))
                        .wrap(),
                    );
                }
                ui.add_space(12.0);
                ui.strong("Tệp liên quan");
                ui.label("Chưa có tệp đính kèm được xác nhận trong nguồn tóm tắt này.");
                ui.add_enabled(false, egui::Button::new("Tải tệp"))
                    .on_disabled_hover_text(
                        "Không tự suy ra tên, nội dung hoặc số tệp từ tiêu đề / revision.",
                    );
            },
        );
        if closed {
            self.selected_key = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(role: &str) -> Session {
        Session {
            token: String::new(),
            session_id: "test".into(),
            endpoint: "http://invalid".into(),
            mode: crate::models::StorageMode::KiyoCloud,
            user: crate::models::User {
                id: "test".into(),
                email: String::new(),
                name: String::new(),
                role: role.into(),
                is_active: true,
            },
        }
    }

    fn document(title: &str, updated: &str) -> DocumentRecord {
        DocumentRecord {
            id: "same-id".into(),
            title: title.into(),
            owner_id: "owner".into(),
            owner_name: "Người phụ trách".into(),
            owner_code: "NV-1".into(),
            current_revision: 8,
            settings: serde_json::json!({}),
            user_role: "owner".into(),
            created_at: "2026-01-01T10:00:00Z".into(),
            updated_at: updated.into(),
        }
    }

    fn contract() -> ContractSummary {
        ContractSummary {
            id: "same-id".into(),
            code: "HD-1".into(),
            name: "Hợp đồng".into(),
            status: "Chờ ký".into(),
            employee_sign_status: "Đã ký".into(),
            company_sign_status: "Đã ký".into(),
            start_date: "2026-02-01".into(),
            ..Default::default()
        }
    }

    fn file(kind: &str, bytes: i64) -> FileNode {
        FileNode {
            id: "f".into(),
            name: "Tệp".into(),
            node_type: kind.into(),
            mime_type: None,
            size_bytes: bytes,
            modified: String::new(),
            is_protected: false,
        }
    }

    #[test]
    fn aggregation_keeps_sources_distinct_and_signatures_are_counted_once() {
        let overview = aggregate(
            Some(&[document("Quy chế", "2026-03-01T12:00:00Z")]),
            Some(&[contract()]),
            Some(&[file("file", 1024), file("folder", 999999)]),
        );
        assert_eq!(overview.total, Some(2));
        assert_eq!(overview.pending, Some(1));
        assert_eq!(overview.signed, Some(1));
        assert_eq!(overview.root_bytes, Some(1024));
        assert_eq!(overview.root_entries, Some(2));
        assert_ne!(overview.items[0].key, overview.items[1].key);
        assert_eq!(overview.items[0].revision, Some(8));
        assert_eq!(
            overview.breakdown,
            vec![(CATEGORIES[0], 1), (CATEGORIES[1], 1)]
        );
        assert_eq!(storage_label(overview.root_bytes), "1.0 KB");
        assert!(overview.items[0].security.is_empty());
        assert!(overview.items[0].matches(CATEGORIES[0], "NGƯỜI PHỤ TRÁCH"));
    }

    #[test]
    fn missing_sources_are_unknown_and_invalid_storage_is_not_zero() {
        let partial = aggregate(None, Some(&[contract()]), None);
        assert_eq!(partial.total, None);
        assert_eq!(partial.signed, Some(1));
        assert_eq!(partial.items.len(), 1);
        assert_eq!(partial.root_bytes, None);
        assert_eq!(aggregate(Some(&[]), Some(&[]), Some(&[])).total, Some(0));
        assert_eq!(
            aggregate(None, None, Some(&[file("file", -1)])).root_bytes,
            None
        );
        assert_eq!(
            aggregate(
                None,
                None,
                Some(&[
                    file("file", i64::MAX),
                    file("file", i64::MAX),
                    file("file", i64::MAX)
                ])
            )
            .root_bytes,
            None
        );
        assert_eq!(date("2026-02-30"), None);
        assert_eq!(category_for_title("QUYẾT ĐỊNH bổ nhiệm"), CATEGORIES[0]);
        assert_eq!(category_for_title("Thông báo nghỉ"), CATEGORIES[2]);
        assert_eq!(category_for_title("Ghi chú dự án"), CATEGORIES[3]);
    }

    #[test]
    fn sorting_uses_valid_effective_dates_and_search_keeps_category_filter() {
        let mut older = document("Thông báo", "bad date");
        older.id = "older".into();
        let overview = aggregate(
            Some(&[older, document("NDA dự án", "2026-10-25T12:00:00Z")]),
            Some(&[contract()]),
            None,
        );
        assert_eq!(overview.items[0].title, "NDA dự án");
        assert_eq!(overview.items[2].title, "Thông báo");
        assert!(overview.items[0].matches(CATEGORIES[1], "nda"));
        assert!(!overview.items[0].matches(CATEGORIES[2], "nda"));
    }

    #[test]
    fn account_reset_removes_private_data_and_pending_navigation() {
        let mut view = DocumentOverviewView {
            documents: Some(vec![document("Private", "")]),
            selected_key: Some("private".into()),
            ..Default::default()
        };
        view.request_navigation("/admin/documents/archives", "Văn thư");
        view.reset();
        assert!(view.documents.is_none() && view.contracts.is_none() && view.files.is_none());
        assert!(view.selected_key.is_none() && view.nav_change.is_none());
    }

    #[test]
    fn source_failures_keep_successful_data_and_previous_snapshots() {
        use std::sync::{Arc, Mutex};
        for previous in [None, Some(vec![contract()])] {
            let expected_total = previous.as_ref().map(|items| items.len() + 1);
            let mut view = DocumentOverviewView {
                contracts: previous,
                last_request: Some(Instant::now()),
                document_task: Some(Arc::new(Mutex::new(Some(Ok(DocumentsResponse {
                    data: vec![document("New document", "2026-10-25")],
                }))))),
                contract_task: Some(Arc::new(Mutex::new(Some(Err(
                    "Không tải được hợp đồng".into()
                ))))),
                ..Default::default()
            };
            view.poll(
                &egui::Context::default(),
                &session("ADMIN"),
                &ApiClient::default(),
            );
            assert_eq!(view.overview().collaborative, Some(1));
            assert_eq!(view.overview().total, expected_total);
            assert_eq!(view.errors[1], "Không tải được hợp đồng");
            assert!(!view.busy());
        }
    }

    #[test]
    fn employee_access_clears_private_data_without_fetching() {
        let mut view = DocumentOverviewView {
            documents: Some(vec![document("Private", "")]),
            ..Default::default()
        };
        let ctx = egui::Context::default();
        let _ = ctx.run(Default::default(), |ctx| {
            egui::CentralPanel::default().show(ctx, |ui| {
                view.render(ui, ctx, &session("USER"), &ApiClient::default());
            });
        });
        assert!(view.documents.is_none() && !view.busy());
    }

    #[test]
    fn overview_cards_breakdown_and_drawer_fit_responsive_widths() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            let long = "Hồ sơ có tiêu đề và tên đơn vị rất dài ".repeat(10);
            let mut record = document(&long, "2026-10-25");
            record.owner_name = long.clone();
            record.settings = serde_json::json!({"securityLevel":long});
            let mut view = DocumentOverviewView {
                documents: Some(vec![record]),
                contracts: Some(vec![contract()]),
                files: Some(vec![]),
                root_label: long,
                ..Default::default()
            };
            for _ in 0..2 {
                let _ = ctx.run(
                    egui::RawInput {
                        screen_rect: Some(egui::Rect::from_min_size(
                            egui::Pos2::ZERO,
                            egui::vec2(width, 1000.0),
                        )),
                        ..Default::default()
                    },
                    |ctx| {
                        egui::CentralPanel::default().show(ctx, |ui| {
                            let right = ui.max_rect().right();
                            view.render_content(ui);
                            assert!(
                                ui.min_rect().right() <= right + 1.0,
                                "overflow at {width}: {:?}",
                                ui.min_rect()
                            );
                        });
                        view.selected_key = Some("document:same-id".into());
                        let overview = view.overview();
                        view.render_detail(ctx, &overview.items);
                    },
                );
            }
            let drawer = ctx
                .memory(|memory| {
                    memory.area_rect(egui::Id::new(("document.overview.detail", "drawer")))
                })
                .expect("detail drawer must mount");
            assert!(drawer.width() <= width && drawer.right() <= width + 1.0);
        }
    }
}
