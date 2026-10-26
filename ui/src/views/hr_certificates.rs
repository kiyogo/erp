use std::time::Duration;

use chrono::NaiveDate;
use egui::{Color32, Context, RichText, Ui};

use crate::{
    api::{
        ApiClient, ApiTask, CreateHrCertificateInput, HrCertificate, HrCertificateResponse,
        HrCertificatesResponse,
    },
    models::Session,
};

const PAGE_SIZE: usize = 8;

#[derive(Default)]
pub struct HrCertificatesView {
    rows: Vec<HrCertificate>,
    list_task: Option<ApiTask<HrCertificatesResponse>>,
    create_task: Option<ApiTask<HrCertificateResponse>>,
    loaded_for: Option<String>,
    loading: bool,
    needs_reload: bool,
    form_open: bool,
    form: CertificateForm,
    search: String,
    status_filter: String,
    selected_key: Option<String>,
    page: usize,
    page_size: usize,
    error: String,
    form_error: String,
    notice: String,
}

#[derive(Clone)]
struct CertificateForm {
    code: String,
    name: String,
    employee_code: String,
    issuing_org: String,
    issue_date: String,
    expire_date: String,
    credential_id: String,
    verification_url: String,
    company_sponsored: bool,
    exam_fee: String,
}

impl Default for CertificateForm {
    fn default() -> Self {
        Self {
            code: String::new(),
            name: String::new(),
            employee_code: String::new(),
            issuing_org: String::new(),
            issue_date: String::new(),
            expire_date: String::new(),
            credential_id: String::new(),
            verification_url: String::new(),
            company_sponsored: false,
            exam_fee: "0".to_owned(),
        }
    }
}

impl HrCertificatesView {
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
        if self.needs_reload && self.list_task.is_none() && self.create_task.is_none() {
            self.loading = true;
            self.error.clear();
            self.list_task = Some(api.list_hr_certificates_task(session));
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
                    self.notice = format!("Đã lưu hồ sơ {}.", response.certificate.cert_code);
                    self.form_open = false;
                    self.form = CertificateForm::default();
                    self.form_error.clear();
                    self.needs_reload = true;
                }
                Err(error) => self.form_error = error,
            }
        }
        if self.list_task.is_some() || self.create_task.is_some() {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Chỉ quản trị viên Nhân sự mới được quản lý chứng chỉ.");
            return;
        }
        self.poll(ui, session, api);
        let active = self
            .rows
            .iter()
            .filter(|r| r.status == "Còn hiệu lực")
            .count();
        let expiring = self
            .rows
            .iter()
            .filter(|r| r.status == "Sắp hết hạn")
            .count();
        let total = self
            .rows
            .iter()
            .filter(|r| r.company_sponsored)
            .fold(0_i64, |sum, r| sum.saturating_add(r.exam_fee));
        let known = !self.loading && self.error.is_empty();
        crate::widgets::metrics(
            ui,
            "hr.certificates.metrics",
            &[
                crate::widgets::Metric {
                    label: "Chứng chỉ quốc tế sở hữu",
                    value: if known {
                        format!("{} Chứng chỉ", self.rows.len())
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Hồ sơ đã khai báo",
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Đang còn hiệu lực chuẩn",
                    value: if known {
                        format!("{active} / {} Văn bằng", self.rows.len())
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Theo thời hạn trong hồ sơ",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Sắp hết hạn trong 90 ngày",
                    value: if known {
                        format!("{expiring} Chứng chỉ")
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Chưa ghi nhận kinh phí gia hạn",
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Tổng ngân sách công ty tài trợ thi",
                    value: if known {
                        format!("{:.1} Triệu ₫", total as f64 / 1_000_000.0)
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Chi phí tài trợ đã khai báo",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let tabs = [
            "Tất cả chứng chỉ",
            "Còn hiệu lực",
            "Sắp hết hạn",
            "Hết hiệu lực",
        ];
        let selected = tabs
            .iter()
            .position(|s| *s == self.status_filter)
            .unwrap_or(0);
        let toolbar = super::hr_training::collection_toolbar(
            ui,
            "hr.certificates",
            &tabs,
            selected,
            &mut self.search,
            "Tìm theo tên chứng chỉ, nhân sự, tổ chức...",
            "+ Khai báo chứng chỉ mới",
            "Xuất Báo Cáo",
            "Chưa có API xuất hồ sơ chứng chỉ.",
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
        if toolbar.create_clicked && self.create_task.is_none() {
            self.form = CertificateForm::default();
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
                ui.label("Đang tải hồ sơ chứng chỉ...");
            });
        }
        let needle = self.search.trim().to_lowercase();
        let visible = self
            .rows
            .iter()
            .filter(|r| {
                status_matches(&self.status_filter, &r.status)
                    && (needle.is_empty()
                        || [
                            &r.cert_code,
                            &r.cert_name,
                            &r.employee_name,
                            &r.emp_code,
                            &r.department,
                            &r.issuing_org,
                            &r.credential_id,
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
        let columns = [
            crate::widgets::TableColumn {
                title: "Mã & Tên chứng chỉ quốc tế",
                width: (ui.available_width() - 830.0).max(300.0),
            },
            crate::widgets::TableColumn {
                title: "Tổ chức cấp chứng chỉ",
                width: 220.0,
            },
            crate::widgets::TableColumn {
                title: "Nhân sự sở hữu",
                width: 190.0,
            },
            crate::widgets::TableColumn {
                title: "Thời hạn hiệu lực",
                width: 170.0,
            },
            crate::widgets::TableColumn {
                title: "Trạng thái",
                width: 130.0,
            },
            crate::widgets::TableColumn {
                title: "Thao tác",
                width: 120.0,
            },
        ];
        crate::widgets::table(
            ui,
            "hr.certificates.table",
            &columns,
            page.len(),
            |ui, row, col| {
                let r = page[row];
                match col {
                    0 => {
                        ui.label(RichText::new(&r.cert_name).size(13.5).strong());
                        ui.label(
                            RichText::new(format!("Mã: {} · ID: {}", r.cert_code, r.credential_id))
                                .size(11.5)
                                .color(crate::theme::PRIMARY),
                        );
                    }
                    1 => {
                        ui.label(
                            RichText::new(&r.issuing_org)
                                .size(12.0)
                                .strong()
                                .color(Color32::from_rgb(37, 99, 235)),
                        );
                    }
                    2 => {
                        ui.label(RichText::new(&r.employee_name).size(13.0).strong());
                        ui.label(
                            RichText::new(format!("Mã: {} · {}", r.emp_code, r.department))
                                .size(11.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    3 => {
                        ui.label(RichText::new(format!("Cấp: {}", r.issue_date)).size(11.5));
                        ui.label(
                            RichText::new(format!("Hết hạn: {}", r.expire_date))
                                .size(11.5)
                                .strong(),
                        );
                    }
                    4 => {
                        crate::widgets::tag(
                            ui,
                            &r.status,
                            match r.status.as_str() {
                                "Còn hiệu lực" => crate::widgets::TagTone::Success,
                                "Sắp hết hạn" => crate::widgets::TagTone::Warning,
                                "Hết hiệu lực" => crate::widgets::TagTone::Error,
                                _ => crate::widgets::TagTone::Neutral,
                            },
                        );
                    }
                    _ => {
                        if ui.button("Văn bằng").clicked() {
                            self.selected_key = Some(r.key.clone());
                        }
                    }
                }
            },
        );
        ui.add_space(16.0);
        crate::widgets::pagination(
            ui,
            "hr.certificates.pages",
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
                "hr.certificates.detail",
                "Hồ Sơ Văn Bằng & Chứng Chỉ Số Quốc Tế",
                580.0,
                |ui| {
                    ui.spacing_mut().item_spacing.y = 16.0;
                    egui::Frame::none()
                        .fill(Color32::from_rgb(248, 250, 252))
                        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                        .rounding(8.0)
                        .inner_margin(18.0)
                        .show(ui, |ui| {
                            ui.colored_label(crate::theme::PRIMARY, &r.cert_code);
                            ui.label(RichText::new(&r.cert_name).size(16.0).strong());
                            ui.label(format!("Tổ chức cấp: {} · {}", r.issuing_org, r.status));
                        });
                    egui::Frame::group(ui.style())
                        .inner_margin(14.0)
                        .show(ui, |ui| {
                            ui.strong("Thông Tin Xác Thực Văn Bằng");
                            ui.label(format!(
                                "Nhân sự sở hữu: {} ({}) · {}",
                                r.employee_name, r.emp_code, r.department
                            ));
                            ui.label(format!(
                                "Số hiệu chứng chỉ (Credential ID): {}",
                                r.credential_id
                            ));
                            ui.label(format!(
                                "Thời hạn hiệu lực: {} → {}",
                                r.issue_date, r.expire_date
                            ));
                            ui.label(format!(
                                "Kinh phí công ty tài trợ đã khai báo: {}",
                                if r.company_sponsored {
                                    format_vnd(r.exam_fee)
                                } else {
                                    "Không tài trợ".into()
                                }
                            ));
                        });
                    let safe_url = r.verification_url.starts_with("https://")
                        && !r.verification_url.chars().any(char::is_whitespace);
                    if !r.verification_url.is_empty() {
                        egui::Frame::group(ui.style())
                            .fill(Color32::from_rgb(239, 246, 255))
                            .inner_margin(14.0)
                            .show(ui, |ui| {
                                ui.strong("Liên Kết Xác Thực Điện Tử Quốc Tế");
                                if safe_url {
                                    ui.hyperlink_to(&r.verification_url, &r.verification_url);
                                } else {
                                    ui.label("Liên kết trong hồ sơ không phải HTTPS hợp lệ.");
                                }
                            });
                    }
                    ui.label(
                        "Chưa kết nối xác minh với nhà phát hành; trạng thái theo hạn khai báo.",
                    );
                    ui.horizontal_wrapped(|ui| {
                        if ui
                            .add_enabled(safe_url, egui::Button::new("Sao Chép Link Xác Thực"))
                            .clicked()
                        {
                            ctx.copy_text(r.verification_url.clone());
                        }
                        ui.add_enabled(false, egui::Button::new("Cấp Kinh Phí Thi Gia Hạn"))
                            .on_disabled_hover_text("Chưa có API kinh phí gia hạn.");
                    });
                },
            );
            if closed {
                self.selected_key = None;
            }
        }
        if self.form_open {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "hr.certificates.create",
                "Khai Báo & Đăng Ký Chứng Chỉ Chuyên Môn Quốc Tế",
                640.0,
                self.create_task.is_some(),
                |ui| self.render_form(ui, session, api),
            );
            if closed {
                self.form_open = false;
            }
        }
    }

    fn render_form(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        ui.add_space(14.0);
        ui.label("Mã hồ sơ có thể để trống; nhân sự được tra cứu theo mã HR.");
        let cols = if ui.available_width() < 480.0 { 1 } else { 2 };
        ui.columns(cols, |c| {
            crate::widgets::form_input(
                &mut c[0],
                "cert.code",
                "Mã chứng chỉ",
                false,
                &mut self.form.code,
                "",
                false,
            );
            crate::widgets::form_input(
                &mut c[cols - 1],
                "cert.org",
                "Tổ chức cấp chứng chỉ",
                true,
                &mut self.form.issuing_org,
                "",
                false,
            );
        });
        crate::widgets::form_input(
            ui,
            "cert.name",
            "Tên văn bằng / Chứng chỉ chuyên môn",
            true,
            &mut self.form.name,
            "",
            false,
        );
        crate::widgets::form_input(
            ui,
            "cert.employee",
            "Mã nhân sự sở hữu",
            true,
            &mut self.form.employee_code,
            "Tra cứu tên và phòng ban từ hồ sơ HR",
            false,
        );
        let dates = if cols == 1 { 1 } else { 3 };
        ui.columns(dates, |c| {
            crate::widgets::form_input(
                &mut c[0],
                "cert.credential",
                "Credential ID / Số hiệu",
                true,
                &mut self.form.credential_id,
                "",
                false,
            );
            crate::widgets::form_date(
                &mut c[if dates == 1 { 0 } else { 1 }],
                "cert.issue",
                "Ngày cấp",
                true,
                &mut self.form.issue_date,
            );
            crate::widgets::form_date(
                &mut c[dates - 1],
                "cert.expire",
                "Ngày hết hạn",
                true,
                &mut self.form.expire_date,
            );
        });
        ui.checkbox(
            &mut self.form.company_sponsored,
            "Công ty tài trợ lệ phí thi",
        );
        ui.columns(cols, |c| {
            c[0].add_enabled_ui(self.form.company_sponsored, |ui| {
                crate::widgets::form_input(
                    ui,
                    "cert.fee",
                    "Lệ phí thi được công ty tài trợ (VNĐ)",
                    false,
                    &mut self.form.exam_fee,
                    "",
                    false,
                )
            });
            crate::widgets::form_input(
                &mut c[cols - 1],
                "cert.url",
                "Đường link xác thực trực tuyến",
                false,
                &mut self.form.verification_url,
                "https://",
                false,
            );
        });
        if !self.form_error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
        }
        ui.add_space(18.0);
        crate::widgets::action_row(ui, |ui| {
            if ui
                .add_enabled(
                    self.create_task.is_none(),
                    egui::Button::new("Lưu hồ sơ chứng chỉ").fill(crate::theme::PRIMARY),
                )
                .clicked()
            {
                match self.form.to_input() {
                    Ok(input) => {
                        self.create_task = Some(api.create_hr_certificate_task(session, &input));
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

impl CertificateForm {
    fn to_input(&self) -> Result<CreateHrCertificateInput, String> {
        for (value, field) in [
            (&self.name, "Tên chứng chỉ"),
            (&self.employee_code, "Mã nhân sự"),
            (&self.issuing_org, "Tổ chức cấp"),
            (&self.issue_date, "Ngày cấp"),
            (&self.expire_date, "Ngày hết hạn"),
            (&self.credential_id, "Credential ID"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{field} là bắt buộc."));
            }
        }
        let issue = NaiveDate::parse_from_str(self.issue_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày cấp cần theo định dạng YYYY-MM-DD.".to_owned())?;
        let expire = NaiveDate::parse_from_str(self.expire_date.trim(), "%Y-%m-%d")
            .map_err(|_| "Ngày hết hạn cần theo định dạng YYYY-MM-DD.".to_owned())?;
        if expire < issue {
            return Err("Ngày hết hạn không được trước ngày cấp.".to_owned());
        }
        let verification_url = self.verification_url.trim();
        if !verification_url.is_empty()
            && (!verification_url.starts_with("https://")
                || verification_url.chars().any(char::is_whitespace))
        {
            return Err("Liên kết xác thực phải là URL HTTPS hợp lệ.".to_owned());
        }
        let exam_fee = if self.company_sponsored {
            parse_integer(&self.exam_fee, "Lệ phí thi", 0, 1_000_000_000_000)?
        } else {
            0
        };
        Ok(CreateHrCertificateInput {
            cert_code: self.code.trim().to_owned(),
            cert_name: self.name.trim().to_owned(),
            employee_code: self.employee_code.trim().to_owned(),
            issuing_org: self.issuing_org.trim().to_owned(),
            issue_date: self.issue_date.trim().to_owned(),
            expire_date: self.expire_date.trim().to_owned(),
            credential_id: self.credential_id.trim().to_owned(),
            verification_url: verification_url.to_owned(),
            company_sponsored: self.company_sponsored,
            exam_fee,
        })
    }
}

fn parse_integer(value: &str, field: &str, min: i64, max: i64) -> Result<i64, String> {
    let value = value.trim().replace(',', "");
    let parsed = value
        .parse::<i64>()
        .map_err(|_| format!("{field} phải là số nguyên."))?;
    if !(min..=max).contains(&parsed) {
        return Err(format!("{field} phải từ {min} đến {max}."));
    }
    Ok(parsed)
}

fn format_vnd(amount: i64) -> String {
    let digits = amount.to_string();
    let mut grouped = String::with_capacity(digits.len() + digits.len() / 3);
    for (index, character) in digits.chars().enumerate() {
        if index > 0 && (digits.len() - index) % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(character);
    }
    format!("{grouped} ₫")
}

fn status_matches(selected: &str, current: &str) -> bool {
    selected.is_empty() || selected == "Tất cả" || selected == current
}

#[cfg(test)]
mod tests {

    #[test]
    fn legacy_form_footer_fits_mobile_tablet_and_desktop() {
        let mut view = HrCertificatesView::default();
        crate::views::hr_training::assert_form_fits(|ui, session, api| {
            view.render_form(ui, session, api)
        });
    }
    use super::*;

    fn valid_form() -> CertificateForm {
        CertificateForm {
            code: String::new(),
            name: "AWS Certified Solutions Architect".to_owned(),
            employee_code: "EMP-001".to_owned(),
            issuing_org: "Amazon Web Services".to_owned(),
            issue_date: "2025-01-01".to_owned(),
            expire_date: "2027-01-01".to_owned(),
            credential_id: "AWS-12345".to_owned(),
            verification_url: "https://example.com/verify/12345".to_owned(),
            company_sponsored: true,
            exam_fee: "8,000,000".to_owned(),
        }
    }

    #[test]
    fn certificate_form_serializes_legacy_fields_without_inventing_identity() {
        let input = valid_form().to_input().expect("valid certificate form");
        assert_eq!(input.cert_code, "");
        assert_eq!(input.employee_code, "EMP-001");
        assert_eq!(input.exam_fee, 8_000_000);
        let wire = serde_json::to_value(input).expect("wire JSON");
        assert_eq!(wire["certName"], "AWS Certified Solutions Architect");
        assert_eq!(wire["employeeCode"], "EMP-001");
        assert!(wire.get("employeeName").is_none());
        assert_eq!(wire["companySponsored"], true);
    }

    #[test]
    fn certificate_form_rejects_bad_dates_url_and_sponsorship_amount() {
        let mut reversed = valid_form();
        reversed.expire_date = "2024-12-31".to_owned();
        assert!(reversed.to_input().is_err());

        let mut bad_url = valid_form();
        bad_url.verification_url = "javascript:alert(1)".to_owned();
        assert!(bad_url.to_input().is_err());

        let mut no_sponsorship = valid_form();
        no_sponsorship.company_sponsored = false;
        no_sponsorship.exam_fee = "not-a-number".to_owned();
        assert_eq!(no_sponsorship.to_input().unwrap().exam_fee, 0);

        let mut negative_fee = valid_form();
        negative_fee.exam_fee = "-1".to_owned();
        assert!(negative_fee.to_input().is_err());
    }

    #[test]
    fn certificate_dto_decodes_legacy_camel_case_and_extra_fields() {
        let certificate: HrCertificate = serde_json::from_value(serde_json::json!({
            "key":"cert-1","certCode":"CC-01","certName":"Cloud Architect",
            "employeeName":"Nguyen An","empCode":"EMP-001","department":"IT",
            "issuingOrg":"AWS","issueDate":"2025-01-01","expireDate":"2027-01-01",
            "credentialId":"AWS-123","companySponsored":true,"examFee":8000000,
            "status":"Còn hiệu lực","legacyField":"kept"
        }))
        .expect("certificate DTO");
        assert_eq!(certificate.cert_code, "CC-01");
        assert_eq!(certificate.employee_name, "Nguyen An");
        assert_eq!(certificate.extra["legacyField"], "kept");
    }

    #[test]
    fn certificate_status_filter_defaults_to_all_records() {
        assert!(status_matches("", "Còn hiệu lực"));
        assert!(status_matches("Tất cả", "Hết hiệu lực"));
        assert!(status_matches("Sắp hết hạn", "Sắp hết hạn"));
        assert!(!status_matches("Hết hiệu lực", "Còn hiệu lực"));
    }
}
