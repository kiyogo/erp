use std::time::Duration;

use egui::{Color32, RichText, Ui, Vec2};
use serde_json::Value;

use crate::{
    api::{ApiClient, ApiTask, GenericCollectionResponse},
    models::Session,
    views::employees::format_vnd,
    widgets,
};

const CATEGORIES: &[(&str, &str)] = &[
    ("", "Tất cả giải pháp"),
    ("Hạ tầng Cloud & IDC", "Cloud & IDC"),
    ("Trí tuệ nhân tạo AI", "AI Gateway"),
    ("An ninh mạng & CA", "An Ninh & CA"),
    ("Kênh truyền & Mạng", "Leased Line"),
];
const DURATIONS: &[&str] = &["6 tháng", "12 tháng", "24 tháng", "36 tháng"];

#[derive(Clone, Default)]
struct Service {
    code: String,
    name: String,
    category: String,
    description: String,
    features: Vec<String>,
    specs: Vec<(String, String)>,
    sla_target: String,
    price_monthly: Option<u64>,
    active_contracts: Option<u64>,
    status: String,
}

impl Service {
    fn from_value(value: Value) -> Option<Self> {
        if !value.is_object() {
            return None;
        }
        let text = |key| {
            value
                .get(key)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_owned()
        };
        Some(Self {
            code: text("code"),
            name: text("name"),
            category: text("category"),
            description: text("description"),
            sla_target: text("slaTarget"),
            status: text("status"),
            // Whole VND/counts only; malformed, fractional or out-of-range values remain unknown.
            price_monthly: value.get("priceMonthly").and_then(Value::as_u64),
            active_contracts: value.get("activeContracts").and_then(Value::as_u64),
            features: value
                .get("features")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect(),
            specs: value
                .get("specs")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .filter_map(|spec| {
                    Some((
                        spec.get("label")?.as_str()?.to_owned(),
                        spec.get("value")?.as_str()?.to_owned(),
                    ))
                })
                .collect(),
        })
    }

    fn matches(&self, category: &str, search: &str) -> bool {
        let search = search.trim().to_lowercase();
        (category.is_empty() || self.category == category)
            && (search.is_empty()
                || [&self.name, &self.code, &self.description]
                    .into_iter()
                    .chain(self.features.iter())
                    .any(|value| value.to_lowercase().contains(&search)))
    }
}

#[derive(Default, Debug, PartialEq, Eq)]
struct Totals {
    active: usize,
    sla: usize,
    contracts: Option<u64>,
    mrr: Option<u64>,
}

fn totals(services: &[Service]) -> Totals {
    Totals {
        active: services
            .iter()
            .filter(|item| item.status == "Đang cung cấp")
            .count(),
        sla: services
            .iter()
            .filter(|item| !item.sla_target.trim().is_empty())
            .count(),
        contracts: services
            .iter()
            .try_fold(0_u64, |sum, item| sum.checked_add(item.active_contracts?)),
        mrr: services.iter().try_fold(0_u64, |sum, item| {
            sum.checked_add(item.price_monthly?.checked_mul(item.active_contracts?)?)
        }),
    }
}

#[derive(Default)]
struct Registration {
    contact_person: String,
    phone: String,
    email: String,
    duration: String,
    note: String,
}

#[derive(Default)]
pub struct EnterpriseServicesView {
    loaded_for: Option<String>,
    services: Vec<Service>,
    pending: Option<ApiTask<GenericCollectionResponse>>,
    loaded: bool,
    needs_reload: bool,
    skipped: usize,
    error: String,
    category: String,
    search: String,
    table_mode: bool,
    page: usize,
    page_size: usize,
    selected: Option<Service>,
    registration_open: bool,
    drawer_open: bool,
    registration: Registration,
}

impl EnterpriseServicesView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let account = format!(
            "{}:{}:{}",
            session.endpoint, session.user.id, session.session_id
        );
        if self.loaded_for.as_deref() != Some(account.as_str()) {
            *self = Self {
                loaded_for: Some(account),
                needs_reload: true,
                page_size: 8,
                ..Self::default()
            };
        }
        if self.needs_reload && self.pending.is_none() {
            self.pending = Some(api.list_generic_collection_task(session, "enterprise_services"));
            self.needs_reload = false;
        }
        if let Some(result) = self.pending.as_ref().and_then(ApiClient::poll) {
            self.pending = None;
            match result {
                Ok(response) => {
                    let count = response.data.len();
                    self.services = response
                        .data
                        .into_iter()
                        .filter_map(Service::from_value)
                        .collect();
                    self.skipped = count - self.services.len();
                    self.loaded = true;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if self.pending.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            self.reset();
            ui.heading("Không đủ quyền");
            ui.label("Danh mục dịch vụ doanh nghiệp chỉ dành cho ADMIN.");
            return;
        }
        self.poll(ctx, session, api);
        self.render_catalogue(ui);
        self.render_drawer(ctx);
        self.render_registration(ctx);
    }

    fn render_catalogue(&mut self, ui: &mut Ui) {
        ui.spacing_mut().item_spacing.y = 8.0;
        ui.add_space(8.0);
        self.render_metrics(ui);
        ui.add_space(8.0);
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
        }
        if self.skipped > 0 {
            ui.colored_label(Color32::from_rgb(180, 83, 9), format!("Bỏ qua {} bản ghi không phải đối tượng dịch vụ; tổng hợp chỉ tính bản ghi đọc được.", self.skipped));
        }
        ui.add_enabled_ui(!self.drawer_open && !self.registration_open, |ui| {
            ui.horizontal_wrapped(|ui| {
                for (category, label) in CATEGORIES {
                    let selected = self.category == *category;
                    let response = ui.add(
                        egui::Button::new(RichText::new(*label).color(if selected {
                            crate::theme::PRIMARY_ACTIVE
                        } else {
                            Color32::from_rgb(71, 85, 105)
                        }))
                        .fill(if selected {
                            Color32::from_rgb(224, 242, 241)
                        } else {
                            Color32::WHITE
                        })
                        .stroke(egui::Stroke::new(
                            1.0,
                            if selected {
                                crate::theme::PRIMARY
                            } else {
                                Color32::from_rgb(203, 213, 225)
                            },
                        )),
                    );
                    if response.clicked() {
                        self.category = (*category).to_owned();
                        self.page = 0;
                    }
                }
            });
            let (search_rect, _) = ui.allocate_exact_size(
                Vec2::new(ui.available_width().min(360.0), 32.0),
                egui::Sense::hover(),
            );
            if widgets::search_input(
                ui,
                search_rect,
                &mut self.search,
                "Tìm tên dịch vụ, mã, tính năng...",
            )
            .changed()
            {
                self.page = 0;
            }
            ui.horizontal_wrapped(|ui| {
                ui.selectable_value(&mut self.table_mode, false, "Lưới");
                ui.selectable_value(&mut self.table_mode, true, "Bảng");
                if ui
                    .add_enabled(self.pending.is_none(), egui::Button::new("Làm mới"))
                    .clicked()
                {
                    self.needs_reload = true;
                }
                ui.add_enabled(false, egui::Button::new("Xuất báo cáo"))
                    .on_hover_text("Chưa có dịch vụ xuất báo cáo.");
            });
        });
        ui.add_space(6.0);
        if self.pending.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải dữ liệu dịch vụ…");
            });
        }
        let visible = self
            .services
            .iter()
            .enumerate()
            .filter(|(_, service)| service.matches(&self.category, &self.search))
            .map(|(index, _)| index)
            .collect::<Vec<_>>();
        let size = self.page_size.max(1);
        self.page = self.page.min(visible.len().div_ceil(size).max(1) - 1);
        let shown = visible
            .iter()
            .skip(self.page * size)
            .take(size)
            .copied()
            .collect::<Vec<_>>();
        let mut action = None;
        ui.add_enabled_ui(!self.drawer_open && !self.registration_open, |ui| {
            if self.table_mode {
                action = self.render_table(ui, &shown);
            } else if shown.is_empty() {
                egui::Frame::group(ui.style())
                    .inner_margin(24.0)
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.label(if !self.loaded {
                            "Chưa tải được danh mục dịch vụ."
                        } else if self.services.is_empty() {
                            "Chưa có dữ liệu dịch vụ doanh nghiệp để hiển thị."
                        } else {
                            "Không tìm thấy dịch vụ phù hợp."
                        });
                    });
            } else {
                action = self.render_grid(ui, &shown);
            }
            ui.add_space(12.0);
            self.page_size = size;
            widgets::pagination(
                ui,
                "services.pagination",
                &mut self.page,
                visible.len(),
                &mut self.page_size,
            );
        });
        if let Some((index, register)) = action {
            self.selected = Some(self.services[index].clone());
            if register {
                self.begin_registration();
            } else {
                self.drawer_open = true;
            }
        }
    }

    fn render_metrics(&self, ui: &mut Ui) {
        let totals = totals(&self.services);
        let contracts = totals
            .contracts
            .map(|count| format!("{count} hợp đồng dịch vụ đang được ghi nhận"))
            .unwrap_or_else(|| "Hợp đồng: chưa đủ dữ liệu để tổng hợp".to_owned());
        let count = |value: usize| {
            if self.loaded {
                value.to_string()
            } else {
                "—".to_owned()
            }
        };
        widgets::metrics(
            ui,
            "services.metrics",
            &[
                widgets::Metric {
                    label: "Gói giải pháp doanh nghiệp",
                    value: count(self.services.len()),
                    detail: "Chỉ hiển thị dịch vụ có dữ liệu thực tế",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                widgets::Metric {
                    label: "Dịch vụ đang hoạt động",
                    value: count(totals.active),
                    detail: &contracts,
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 24.0,
                },
                widgets::Metric {
                    label: "Chỉ số SLA được khai báo",
                    value: count(totals.sla),
                    detail: "Mức cam kết khai báo, chưa phải SLA đo lường",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                widgets::Metric {
                    label: "Doanh thu dịch vụ định kỳ (MRR)",
                    value: if self.loaded {
                        price(totals.mrr)
                    } else {
                        "—".to_owned()
                    },
                    detail: "Đơn giá × hợp đồng; cần đủ dữ liệu toàn danh mục",
                    color: Color32::from_rgb(124, 58, 237),
                    value_size: 24.0,
                },
            ],
        );
    }

    fn render_grid(&self, ui: &mut Ui, shown: &[usize]) -> Option<(usize, bool)> {
        let gap = 16.0;
        let columns = widgets::grid_columns(ui.available_width(), 350.0, gap, shown.len());
        let width = ((ui.available_width() - gap * (columns - 1) as f32) / columns as f32).max(1.0);
        let mut action = None;
        for row in shown.chunks(columns) {
            ui.with_layout(egui::Layout::left_to_right(egui::Align::Min), |ui| {
                ui.spacing_mut().item_spacing.x = gap;
                for &index in row {
                    ui.allocate_ui_with_layout(
                        Vec2::new(width, 0.0),
                        egui::Layout::top_down(egui::Align::Min),
                        |ui| {
                            let service = &self.services[index];
                            let card = egui::Frame::none()
                                .fill(Color32::WHITE)
                                .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                                .rounding(8.0)
                                .inner_margin(20.0)
                                .show(ui, |ui| {
                                    ui.set_width((width - 42.0).max(1.0));
                                    ui.add(
                                        egui::Label::new(
                                            RichText::new(known(&service.status))
                                                .color(status_color(&service.status)),
                                        )
                                        .wrap(),
                                    );
                                    ui.add(
                                        egui::Label::new(
                                            RichText::new(known(&service.name)).size(16.0).strong(),
                                        )
                                        .wrap(),
                                    );
                                    ui.add(
                                        egui::Label::new(
                                            RichText::new(format!(
                                                "{} · {}",
                                                known(&service.code),
                                                known(&service.category)
                                            ))
                                            .size(11.5)
                                            .color(crate::theme::PRIMARY),
                                        )
                                        .wrap(),
                                    );
                                    ui.add(egui::Label::new(known(&service.description)).wrap());
                                    for feature in &service.features {
                                        ui.add(egui::Label::new(format!("• {feature}")).wrap());
                                    }
                                    ui.separator();
                                    ui.small("Đơn giá thuê tháng:");
                                    ui.label(
                                        RichText::new(price(service.price_monthly))
                                            .strong()
                                            .color(Color32::from_rgb(22, 163, 74)),
                                    );
                                    ui.horizontal_wrapped(|ui| {
                                        if ui.button("Thông số").clicked() {
                                            action = Some((index, false));
                                        }
                                        if ui
                                            .add(
                                                egui::Button::new(
                                                    RichText::new("Đăng ký").color(Color32::WHITE),
                                                )
                                                .fill(crate::theme::PRIMARY),
                                            )
                                            .clicked()
                                        {
                                            action = Some((index, true));
                                        }
                                    });
                                });
                            crate::visual_test::record(
                                &format!("services.card.{index}"),
                                card.response.rect,
                            );
                            #[cfg(test)]
                            ui.ctx().data_mut(|data| {
                                data.insert_temp(
                                    egui::Id::new(("services.card.bounds", index)),
                                    (card.response.rect, width),
                                )
                            });
                        },
                    );
                }
            });
            ui.add_space(gap);
        }
        action
    }

    fn render_table(&self, ui: &mut Ui, shown: &[usize]) -> Option<(usize, bool)> {
        let columns = [
            widgets::TableColumn {
                title: "Mã & Tên dịch vụ",
                width: 340.0,
            },
            widgets::TableColumn {
                title: "Cam kết SLA",
                width: 160.0,
            },
            widgets::TableColumn {
                title: "Đơn giá thuê / Tháng",
                width: 190.0,
            },
            widgets::TableColumn {
                title: "Hợp đồng hoạt động",
                width: 170.0,
            },
            widgets::TableColumn {
                title: "Trạng thái",
                width: 180.0,
            },
            widgets::TableColumn {
                title: "Thao tác",
                width: 120.0,
            },
        ];
        let mut action = None;
        widgets::table_with_row_height(
            ui,
            "services.table",
            &columns,
            shown.len(),
            100.0,
            |ui, row, col| {
                let index = shown[row];
                let service = &self.services[index];
                match col {
                    0 => {
                        ui.add(
                            egui::Label::new(RichText::new(known(&service.name)).strong())
                                .truncate(),
                        )
                        .on_hover_text(&service.name);
                        ui.add(
                            egui::Label::new(
                                RichText::new(format!(
                                    "{} · {}",
                                    known(&service.code),
                                    known(&service.category)
                                ))
                                .size(11.5)
                                .color(crate::theme::PRIMARY),
                            )
                            .truncate(),
                        )
                        .on_hover_text(&service.category);
                    }
                    1 => {
                        ui.add(egui::Label::new(known(&service.sla_target)).truncate())
                            .on_hover_text(&service.sla_target);
                    }
                    2 => {
                        ui.label(
                            RichText::new(price(service.price_monthly))
                                .color(Color32::from_rgb(22, 163, 74)),
                        );
                    }
                    3 => {
                        ui.label(
                            service
                                .active_contracts
                                .map(|count| format!("{count} doanh nghiệp"))
                                .unwrap_or_else(|| "Chưa có dữ liệu".to_owned()),
                        );
                    }
                    4 => {
                        ui.label(
                            RichText::new(known(&service.status))
                                .color(status_color(&service.status)),
                        );
                    }
                    _ => {
                        if ui.button("Thông số").clicked() {
                            action = Some((index, false));
                        }
                        if ui.button("Đăng ký").clicked() {
                            action = Some((index, true));
                        }
                    }
                }
            },
        );
        action
    }

    fn begin_registration(&mut self) {
        self.drawer_open = false;
        self.registration_open = true;
        self.registration = Registration {
            duration: "12 tháng".to_owned(),
            ..Registration::default()
        };
    }

    fn render_drawer(&mut self, ctx: &egui::Context) {
        if !self.drawer_open {
            return;
        }
        let Some(service) = self.selected.as_ref() else {
            self.drawer_open = false;
            return;
        };
        let mut register = false;
        let (_, close) = widgets::drawer(
            ctx,
            "services.specs",
            "Thông số kỹ thuật & Cam kết chất lượng (SLA)",
            600.0,
            |ui| {
                ui.spacing_mut().item_spacing.y = 12.0;
                ui.label(
                    RichText::new(known(&service.code))
                        .strong()
                        .color(crate::theme::PRIMARY),
                );
                ui.add(
                    egui::Label::new(RichText::new(known(&service.name)).strong().size(17.0))
                        .wrap(),
                );
                ui.label(format!("Phân loại: {}", known(&service.category)));
                ui.label(format!("SLA khai báo: {}", known(&service.sla_target)));
                ui.small("Cam kết khai báo chưa phải kết quả đo lường SLA.");
                ui.separator();
                ui.label(RichText::new("Thông số phần cứng & Cấu hình triển khai").strong());
                if service.specs.is_empty() {
                    ui.label("Chưa có dữ liệu thông số kỹ thuật.");
                }
                for (label, value) in &service.specs {
                    ui.add(egui::Label::new(format!("{}:", known(label))).wrap());
                    ui.add(egui::Label::new(RichText::new(known(value)).strong()).wrap());
                }
                ui.separator();
                ui.label(format!(
                    "Đơn giá thuê định kỳ: {} / tháng",
                    price(service.price_monthly)
                ));
                ui.label(format!(
                    "Hợp đồng hoạt động: {}",
                    service
                        .active_contracts
                        .map(|count| count.to_string())
                        .unwrap_or_else(|| "Chưa có dữ liệu".to_owned())
                ));
                register = ui.button("Đăng ký gói dịch vụ này").clicked();
            },
        );
        if close {
            self.drawer_open = false;
        }
        if register {
            self.begin_registration();
        }
    }

    fn render_registration(&mut self, ctx: &egui::Context) {
        if !self.registration_open {
            return;
        }
        let mut cancel = false;
        let (_, close) = widgets::modal(
            ctx,
            "services.register",
            "Đăng ký khởi tạo dịch vụ",
            560.0,
            false,
            |ui| {
                if let Some(service) = &self.selected {
                    ui.add(egui::Label::new(RichText::new(known(&service.name)).strong()).wrap());
                    ui.label(format!("Mã dịch vụ: {}", known(&service.code)));
                }
                ui.colored_label(Color32::from_rgb(180, 83, 9), "Chưa có dịch vụ tiếp nhận đăng ký / tạo hợp đồng. Biểu mẫu chỉ là bản nháp trong phiên; chưa gửi hoặc lưu lên máy chủ.");
                ui.add_space(14.0);
                widgets::form_input(
                    ui,
                    "services.contact",
                    "Người đại diện doanh nghiệp",
                    true,
                    &mut self.registration.contact_person,
                    "Họ tên người đại diện",
                    false,
                );
                widgets::form_input(
                    ui,
                    "services.phone",
                    "Số điện thoại liên hệ",
                    true,
                    &mut self.registration.phone,
                    "0912 888 999",
                    false,
                );
                widgets::form_input(
                    ui,
                    "services.email",
                    "Email công việc",
                    true,
                    &mut self.registration.email,
                    "ceo@doanhnghiep.com",
                    false,
                );
                widgets::form_select(
                    ui,
                    "services.duration",
                    "Thời hạn hợp đồng dự kiến",
                    false,
                    &mut self.registration.duration,
                    DURATIONS,
                );
                widgets::form_textarea(
                    ui,
                    "services.note",
                    "Ghi chú yêu cầu kiến trúc hoặc dung lượng",
                    false,
                    &mut self.registration.note,
                    "Địa chỉ IP, RAM, băng thông...",
                    2,
                );
                ui.small("Chưa có chính sách chiết khấu được xác nhận từ máy chủ.");
                widgets::action_row(ui, |ui| {
                    ui.add_enabled(false, egui::Button::new("Xác nhận khởi tạo"))
                        .on_hover_text("Chưa có API tiếp nhận đăng ký dịch vụ.");
                    cancel = ui.button("Hủy").clicked();
                });
            },
        );
        if close || cancel {
            self.registration_open = false;
            self.registration = Registration::default();
        }
    }
}

fn known(value: &str) -> &str {
    if value.trim().is_empty() {
        "Chưa có dữ liệu"
    } else {
        value
    }
}

fn price(value: Option<u64>) -> String {
    value
        .map(|value| format!("{} ₫", format_vnd(value)))
        .unwrap_or_else(|| "Chưa có dữ liệu".to_owned())
}

fn status_color(status: &str) -> Color32 {
    match status {
        "Đang cung cấp" => Color32::from_rgb(22, 163, 74),
        "Bảo trì nâng cấp" => Color32::from_rgb(217, 119, 6),
        "Thử nghiệm Beta" => Color32::from_rgb(37, 99, 235),
        _ => Color32::from_rgb(100, 116, 139),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn service_totals_distinguish_empty_from_missing_prices_and_overflow() {
        assert_eq!(totals(&[]).mrr, Some(0));
        let item=Service::from_value(serde_json::json!({"name":"Cloud","category":"Hạ tầng Cloud & IDC","features":["Lưu trữ"],"priceMonthly":1000,"activeContracts":3,"status":"Đang cung cấp"})).unwrap();
        assert_eq!(totals(std::slice::from_ref(&item)).mrr, Some(3000));
        assert!(item.matches("Hạ tầng Cloud & IDC", "LƯU TRỮ"));
        assert!(!item.matches("Trí tuệ nhân tạo AI", ""));
        let mut missing = item.clone();
        missing.price_monthly = None;
        assert_eq!(totals(&[item.clone(), missing]).mrr, None);
        let mut overflow = item;
        overflow.price_monthly = Some(u64::MAX);
        assert_eq!(totals(&[overflow]).mrr, None);
    }
    #[test]
    fn service_catalogue_contains_long_records_in_grid_and_table() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            for table_mode in [false, true] {
                let ctx = egui::Context::default();
                crate::native_text::setup_fonts(&ctx);
                crate::native_text::setup_style(&ctx);
                let long = "Dịch vụ có tên và tính năng dài ".repeat(8);
                let mut view = EnterpriseServicesView {
                    loaded: true,
                    page_size: 8,
                    table_mode,
                    services: vec![Service {
                        name: long.clone(),
                        description: long.clone(),
                        category: long.clone(),
                        features: vec![long.clone()],
                        code: long,
                        ..Default::default()
                    }],
                    ..Default::default()
                };
                let _ = ctx.run(
                    egui::RawInput {
                        screen_rect: Some(egui::Rect::from_min_size(
                            egui::Pos2::ZERO,
                            egui::vec2(width, 900.0),
                        )),
                        ..Default::default()
                    },
                    |ctx| {
                        egui::CentralPanel::default().show(ctx, |ui| {
                            let right = ui.max_rect().right();
                            view.render_catalogue(ui);
                            assert!(
                                ui.min_rect().right() <= right + 1.0,
                                "service overflow at {width}, table {table_mode}: {:?}",
                                ui.min_rect()
                            );
                        });
                    },
                );
            }
        }
    }
}
