use std::time::Duration;

use egui::{Color32, Context, RichText, Ui};

use crate::{
    api::{
        ApiClient, ApiTask, CreateHrUniformInput, HrUniform, HrUniformResponse, HrUniformsResponse,
    },
    models::Session,
};

const PAGE_SIZE: usize = 8;
const ITEM_TYPES: [&str; 3] = [
    "Áo Polo Doanh Nghiệp KIYOVN",
    "Áo Hoodie & Polo Kỹ Thuật",
    "Áo Sơ Mi & Vest Đồng Phục",
];
const SIZES: [&str; 5] = ["S", "M", "L", "XL", "XXL"];

#[derive(Default)]
pub struct HrUniformsView {
    rows: Vec<HrUniform>,
    list_task: Option<ApiTask<HrUniformsResponse>>,
    create_task: Option<ApiTask<HrUniformResponse>>,
    handover_task: Option<ApiTask<HrUniformResponse>>,
    loaded_for: Option<String>,
    loading: bool,
    needs_reload: bool,
    form_open: bool,
    form: UniformForm,
    search: String,
    status_filter: String,
    selected_key: Option<String>,
    handover_confirm_key: Option<String>,
    page: usize,
    page_size: usize,
    error: String,
    form_error: String,
    notice: String,
}

#[derive(Clone)]
struct UniformForm {
    employee_code: String,
    item_type: String,
    size: String,
    quantity: String,
    note: String,
}

impl Default for UniformForm {
    fn default() -> Self {
        Self {
            employee_code: String::new(),
            item_type: ITEM_TYPES[0].to_owned(),
            size: "L".to_owned(),
            quantity: "2".to_owned(),
            note: String::new(),
        }
    }
}

impl HrUniformsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn reset_for_account(&mut self, session: &Session) {
        *self = Self {
            loaded_for: Some(session.user.id.clone()),
            needs_reload: true,
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
            && self.handover_task.is_none()
        {
            self.loading = true;
            self.error.clear();
            self.list_task = Some(api.list_hr_uniforms_task(session));
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
                    self.notice = format!("Đã tạo phiếu {}.", response.uniform.code);
                    self.form_open = false;
                    self.form = UniformForm::default();
                    self.form_error.clear();
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }
        if let Some(result) = self.handover_task.as_ref().and_then(ApiClient::poll) {
            self.handover_task = None;
            match result {
                Ok(response) => {
                    self.notice = format!("Đã ghi nhận bàn giao phiếu {}.", response.uniform.code);
                    self.handover_confirm_key = None;
                    self.needs_reload = true;
                }
                Err(error) => self.error = error,
            }
        }
        if self.list_task.is_some() || self.create_task.is_some() || self.handover_task.is_some() {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên Nhân sự mới được quản lý phiếu đồng phục.");
            return;
        }
        self.poll(ui, session, api);
        let delivered = self
            .rows
            .iter()
            .filter(|r| r.status == "Đã bàn giao")
            .count();
        let pending = self
            .rows
            .iter()
            .filter(|r| r.status == "Chờ cấp phát")
            .count();
        let total = self
            .rows
            .iter()
            .fold(0_i64, |sum, r| sum.saturating_add(r.quantity));
        let known = !self.loading && self.error.is_empty();
        crate::widgets::metrics(
            ui,
            "hr.uniforms.metrics",
            &[
                crate::widgets::Metric {
                    label: "Tổng trang phục đăng ký cấp phát",
                    value: if known {
                        format!("{total} Bộ trang phục")
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Số lượng trên các phiếu đã lưu",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Đã bàn giao cho nhân viên",
                    value: if known {
                        format!("{delivered} Phiếu")
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Theo trạng thái ghi nhận",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Đang chờ bàn giao / May đo",
                    value: if known {
                        format!("{pending} Phiếu cấp")
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Chưa xác định lịch giao thực tế",
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Tồn kho đồng phục dự phòng",
                    value: "Chưa xác định".into(),
                    detail: "Chưa có API theo dõi tồn kho",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let tabs = ["Tất cả phiếu", "Đã bàn giao", "Chờ cấp phát"];
        let selected = tabs
            .iter()
            .position(|s| *s == self.status_filter)
            .unwrap_or(0);
        let toolbar = super::hr_training::collection_toolbar(
            ui,
            "hr.uniforms",
            &tabs,
            selected,
            &mut self.search,
            "Tìm theo tên nhân viên, phòng ban, loại đồng phục...",
            "+ Đăng ký cấp đồng phục",
            "Xuất Excel",
            "Chưa có API xuất danh sách cấp phát.",
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
        if toolbar.create_clicked && self.create_task.is_none() && self.handover_task.is_none() {
            self.form = UniformForm::default();
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
                ui.label("Đang tải phiếu cấp phát...");
            });
        }
        let needle = self.search.trim().to_lowercase();
        let visible = self
            .rows
            .iter()
            .filter(|r| {
                (self.status_filter.is_empty() || self.status_filter == r.status)
                    && (needle.is_empty()
                        || [
                            &r.code,
                            &r.employee_name,
                            &r.emp_code,
                            &r.department,
                            &r.item_type,
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
        let flex = ((ui.available_width() - 770.0) / 2.0).max(220.0);
        let columns = [
            crate::widgets::TableColumn {
                title: "Mã phiếu",
                width: 140.0,
            },
            crate::widgets::TableColumn {
                title: "Nhân sự tiếp nhận",
                width: flex,
            },
            crate::widgets::TableColumn {
                title: "Loại trang phục",
                width: flex,
            },
            crate::widgets::TableColumn {
                title: "Kích cỡ & Số lượng",
                width: 160.0,
            },
            crate::widgets::TableColumn {
                title: "Ngày yêu cầu & Bàn giao",
                width: 180.0,
            },
            crate::widgets::TableColumn {
                title: "Trạng thái",
                width: 140.0,
            },
            crate::widgets::TableColumn {
                title: "Thao tác",
                width: 150.0,
            },
        ];
        ui.add_space(12.0);
        crate::widgets::table(
            ui,
            "hr.uniforms.table",
            &columns,
            page.len(),
            |ui, row, col| {
                let r = page[row];
                match col {
                    0 => {
                        ui.label(RichText::new(&r.code).strong().color(crate::theme::PRIMARY));
                    }
                    1 => {
                        ui.label(RichText::new(&r.employee_name).size(13.0).strong());
                        ui.label(
                            RichText::new(format!("Mã: {} · {}", r.emp_code, r.department))
                                .size(11.5)
                                .color(Color32::from_rgb(37, 99, 235)),
                        );
                    }
                    2 => {
                        ui.label(RichText::new(&r.item_type).strong());
                    }
                    3 => {
                        ui.colored_label(
                            Color32::from_rgb(37, 99, 235),
                            format!("Size {}", r.size),
                        );
                        ui.label(format!("{} Bộ", r.quantity));
                    }
                    4 => {
                        ui.label(RichText::new(&r.request_date).size(12.0).strong());
                        ui.label(
                            RichText::new(format!(
                                "Bàn giao: {}",
                                if r.delivery_date.is_empty() {
                                    "Chưa ghi nhận"
                                } else {
                                    &r.delivery_date
                                }
                            ))
                            .size(11.0)
                            .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    5 => {
                        crate::widgets::tag(
                            ui,
                            &r.status,
                            match r.status.as_str() {
                                "Đã bàn giao" => crate::widgets::TagTone::Success,
                                "Chờ cấp phát" => crate::widgets::TagTone::Warning,
                                _ => crate::widgets::TagTone::Neutral,
                            },
                        );
                    }
                    _ => {
                        ui.horizontal_wrapped(|ui| {
                            if ui.button("Chi tiết").clicked() {
                                self.selected_key = Some(r.key.clone());
                            }
                            if r.status == "Chờ cấp phát"
                                && ui
                                    .add_enabled(
                                        self.handover_task.is_none(),
                                        egui::Button::new("Giao đồ"),
                                    )
                                    .clicked()
                            {
                                self.handover_confirm_key = Some(r.key.clone());
                            }
                        });
                    }
                }
            },
        );
        ui.add_space(16.0);
        crate::widgets::pagination(
            ui,
            "hr.uniforms.pages",
            &mut self.page,
            visible.len(),
            &mut self.page_size,
        );
        if let Some(r) = self
            .rows
            .iter()
            .find(|r| self.selected_key.as_deref() == Some(&r.key))
        {
            let (_, closed) = crate::widgets::drawer(
                ctx,
                "hr.uniforms.detail",
                "Chi Tiết Phiếu Cấp Đồng Phục & Biên Bản Bàn Giao",
                540.0,
                |ui| {
                    ui.spacing_mut().item_spacing.y = 16.0;
                    egui::Frame::none()
                        .fill(Color32::from_rgb(248, 250, 252))
                        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                        .rounding(8.0)
                        .inner_margin(16.0)
                        .show(ui, |ui| {
                            ui.colored_label(crate::theme::PRIMARY, &r.code);
                            ui.label(RichText::new(&r.employee_name).size(17.0).strong());
                            ui.label(format!(
                                "Phòng ban: {} · Mã: {} · {}",
                                r.department, r.emp_code, r.status
                            ));
                        });
                    egui::Frame::group(ui.style())
                        .inner_margin(14.0)
                        .show(ui, |ui| {
                            ui.strong("Thông Tin Trang Phục Đăng Ký");
                            ui.label(format!("Loại trang phục: {}", r.item_type));
                            ui.label(format!("Kích cỡ: {} · Số lượng: {} Bộ", r.size, r.quantity));
                            ui.label(format!("Ngày lập phiếu yêu cầu: {}", r.request_date));
                            ui.label(format!(
                                "Ngày bàn giao thực tế: {}",
                                if r.delivery_date.is_empty() {
                                    "Chưa ghi nhận"
                                } else {
                                    &r.delivery_date
                                }
                            ));
                            if !r.note.is_empty() {
                                ui.label(format!("Ghi chú: {}", r.note));
                            }
                        });
                    egui::Frame::group(ui.style())
                        .inner_margin(14.0)
                        .fill(Color32::from_rgb(240, 253, 244))
                        .show(ui, |ui| {
                            ui.strong("Xác Nhận Của Người Nhận");
                            if let Some(signature) = r
                                .extra
                                .get("receiverSign")
                                .and_then(|v| v.as_str())
                                .filter(|v| !v.is_empty())
                            {
                                ui.label(format!("Nội dung ký nhận kế thừa: {signature}"));
                                ui.label("Chưa xác minh chữ ký người nhận.");
                            } else {
                                ui.label("Chưa có chữ ký của người nhận.");
                            }
                            if let Some(actor) =
                                r.extra.get("handedOverBy").and_then(|v| v.as_str())
                            {
                                ui.label(format!(
                                    "Bàn giao được ghi nhận bởi tài khoản quản trị {actor}."
                                ));
                            }
                        });
                    if r.status == "Chờ cấp phát"
                        && ui
                            .add_enabled(
                                self.handover_task.is_none(),
                                egui::Button::new("Xác Nhận Bàn Giao Đồng Phục Ngay")
                                    .fill(crate::theme::PRIMARY),
                            )
                            .clicked()
                    {
                        self.handover_confirm_key = Some(r.key.clone());
                    }
                },
            );
            if closed {
                self.selected_key = None;
            }
        }
        if self.form_open {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "hr.uniforms.create",
                "Đăng Ký Cấp Phát Đồng Phục Doanh Nghiệp Mới",
                560.0,
                self.create_task.is_some(),
                |ui| self.render_form(ui, session, api),
            );
            if closed {
                self.form_open = false;
            }
        }
        if let Some(key) = self.handover_confirm_key.clone() {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "hr.uniforms.confirm",
                "Xác nhận đã bàn giao",
                460.0,
                self.handover_task.is_some(),
                |ui| {
                    ui.label("Chỉ xác nhận nếu việc giao đồng phục đã diễn ra thực tế.");
                    ui.label("Thao tác lưu tài khoản quản trị và thời điểm; không tạo chữ ký người nhận.");
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    }
                    ui.add_space(18.0);
                    crate::widgets::action_row(ui, |ui| {
                        if ui
                            .add_enabled(
                                self.handover_task.is_none(),
                                egui::Button::new("Đã bàn giao"),
                            )
                            .clicked()
                        {
                            self.error.clear();
                            self.handover_task = Some(api.handover_hr_uniform_task(session, &key));
                        }
                        if ui
                            .add_enabled(self.handover_task.is_none(), egui::Button::new("Hủy"))
                            .clicked()
                        {
                            self.handover_confirm_key = None;
                        }
                    });
                },
            );
            if closed {
                self.handover_confirm_key = None;
            }
        }
    }

    fn render_form(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        ui.add_space(14.0);
        ui.label("Mã phiếu và thông tin nhân sự được máy chủ cấp/tra cứu từ hồ sơ HR.");
        crate::widgets::form_input(
            ui,
            "uniform.employee",
            "Mã nhân sự tiếp nhận",
            true,
            &mut self.form.employee_code,
            "",
            false,
        );
        crate::widgets::form_select(
            ui,
            "uniform.type",
            "Loại đồng phục",
            true,
            &mut self.form.item_type,
            &ITEM_TYPES,
        );
        let cols = if ui.available_width() < 400.0 { 1 } else { 2 };
        ui.columns(cols, |c| {
            crate::widgets::form_select(
                &mut c[0],
                "uniform.size",
                "Kích cỡ (Size)",
                true,
                &mut self.form.size,
                &SIZES,
            );
            crate::widgets::form_input(
                &mut c[cols - 1],
                "uniform.quantity",
                "Số lượng cấp (1–5 Bộ)",
                true,
                &mut self.form.quantity,
                "",
                false,
            );
        });
        crate::widgets::form_textarea(
            ui,
            "uniform.note",
            "Ghi chú cấp phát",
            false,
            &mut self.form.note,
            "",
            2,
        );
        if !self.form_error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
        }
        ui.add_space(18.0);
        crate::widgets::action_row(ui, |ui| {
            if ui
                .add_enabled(
                    self.create_task.is_none(),
                    egui::Button::new("Tạo phiếu cấp phát").fill(crate::theme::PRIMARY),
                )
                .clicked()
            {
                match self.form.to_input() {
                    Ok(input) => {
                        self.create_task = Some(api.create_hr_uniform_task(session, &input));
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

impl UniformForm {
    fn to_input(&self) -> Result<CreateHrUniformInput, String> {
        if self.employee_code.trim().is_empty() {
            return Err("Mã nhân sự là bắt buộc.".to_owned());
        }
        let quantity = self
            .quantity
            .trim()
            .parse::<i64>()
            .map_err(|_| "Số lượng phải là số nguyên.".to_owned())?;
        if !(1..=5).contains(&quantity) {
            return Err("Số lượng phải từ 1 đến 5 bộ.".to_owned());
        }
        if !ITEM_TYPES.contains(&self.item_type.as_str()) || !SIZES.contains(&self.size.as_str()) {
            return Err("Loại đồng phục hoặc kích cỡ không hợp lệ.".to_owned());
        }
        Ok(CreateHrUniformInput {
            employee_code: self.employee_code.trim().to_owned(),
            item_type: self.item_type.clone(),
            size: self.size.clone(),
            quantity,
            note: self.note.trim().to_owned(),
        })
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn legacy_form_footer_fits_mobile_tablet_and_desktop() {
        let mut view = HrUniformsView::default();
        crate::views::hr_training::assert_form_fits(|ui, session, api| {
            view.render_form(ui, session, api)
        });
    }
    use super::*;

    fn valid_form() -> UniformForm {
        UniformForm {
            employee_code: "EMP-001".to_owned(),
            item_type: ITEM_TYPES[0].to_owned(),
            size: "L".to_owned(),
            quantity: "2".to_owned(),
            note: "Cấp mới".to_owned(),
        }
    }

    #[test]
    fn uniform_form_validates_and_sends_only_directory_code_and_issue_fields() {
        let input = valid_form().to_input().expect("valid uniform form");
        assert_eq!(input.employee_code, "EMP-001");
        assert_eq!(input.quantity, 2);
        assert_eq!(input.size, "L");
        let wire = serde_json::to_value(input).expect("uniform wire JSON");
        assert_eq!(wire["employeeCode"], "EMP-001");
        assert!(wire.get("employeeName").is_none());
        assert!(wire.get("department").is_none());
        assert!(wire.get("code").is_none());
    }

    #[test]
    fn uniform_form_rejects_unknown_types_sizes_and_quantities() {
        let mut too_many = valid_form();
        too_many.quantity = "6".to_owned();
        assert!(too_many.to_input().is_err());
        let mut unknown_size = valid_form();
        unknown_size.size = "XXXL".to_owned();
        assert!(unknown_size.to_input().is_err());
        let mut missing_employee = valid_form();
        missing_employee.employee_code.clear();
        assert!(missing_employee.to_input().is_err());
    }

    #[test]
    fn uniform_dto_keeps_unknown_legacy_fields() {
        let uniform: HrUniform = serde_json::from_value(serde_json::json!({
            "key":"uniform-1","code":"DP-01","employeeName":"An",
            "empCode":"EMP-001","itemType":"Áo Polo Doanh Nghiệp KIYOVN",
            "size":"L","quantity":2,"requestDate":"2026-10-08",
            "status":"Chờ cấp phát","legacyFlag":true
        }))
        .expect("uniform DTO");
        assert_eq!(uniform.code, "DP-01");
        assert_eq!(uniform.extra["legacyFlag"], true);
    }
}
