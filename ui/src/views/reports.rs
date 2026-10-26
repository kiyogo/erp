use std::time::Duration;

use chrono::Utc;
use egui::{Color32, RichText, Ui};
use serde_json::{Value, json};

use crate::{
    api::{ApiClient, ApiTask, GenericCollectionResponse, GenericRecordResponse},
    models::Session,
    widgets::{self, Metric, TableColumn},
};

const REPORT_SCOPE: &str = "reports_catalog";
const REPORT_TYPES: [&str; 5] = [
    "Tài chính",
    "Nhân sự & Tiền lương",
    "Tài sản & IDC",
    "Kinh doanh & CRM",
    "Kế hoạch & OKR",
];
const EXPORT_UNAVAILABLE: &str = "Chưa có API kết xuất, tải tệp, in hoặc gửi email báo cáo. Danh mục không xác nhận nội dung đã được kiểm toán.";

pub struct ReportsView {
    reports: Vec<Value>,
    pending_list: Option<ApiTask<GenericCollectionResponse>>,
    pending_create: Option<ApiTask<GenericRecordResponse>>,
    loaded_for: Option<String>,
    revision: String,
    needs_reload: bool,
    data_loaded: bool,
    search: String,
    type_filter: String,
    selected_period: String,
    page: usize,
    page_size: usize,
    create_open: bool,
    selected_report: Option<Value>,
    title: String,
    form_type: String,
    author: String,
    period: String,
    format: String,
    notice: String,
    error: String,
}

impl Default for ReportsView {
    fn default() -> Self {
        Self {
            reports: Vec::new(),
            pending_list: None,
            pending_create: None,
            loaded_for: None,
            revision: String::new(),
            needs_reload: true,
            data_loaded: false,
            search: String::new(),
            type_filter: "all".into(),
            selected_period: String::new(),
            page: 0,
            page_size: 8,
            create_open: false,
            selected_report: None,
            title: String::new(),
            form_type: REPORT_TYPES[0].into(),
            author: String::new(),
            period: String::new(),
            format: "PDF + Excel".into(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl ReportsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn load(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_list.is_none() && self.pending_create.is_none() {
            self.pending_list = Some(api.list_generic_collection_task(session, REPORT_SCOPE));
            self.needs_reload = false;
        }
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.reset();
            self.loaded_for = Some(session.user.id.clone());
        }
        if self.needs_reload {
            self.load(session, api);
        }
        if let Some(result) = self.pending_list.as_ref().and_then(ApiClient::poll) {
            self.pending_list = None;
            match result {
                Ok(response) => {
                    self.reports = response.data;
                    self.revision = response.revision;
                    self.data_loaded = true;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.pending_create.as_ref().and_then(ApiClient::poll) {
            self.pending_create = None;
            match result {
                Ok(response) => {
                    self.reports
                        .retain(|r| report_text(r, "key") != report_text(&response.record, "key"));
                    self.reports.insert(0, response.record);
                    self.revision = response.revision;
                    self.data_loaded = true;
                    self.create_open = false;
                    self.notice =
                        "Đã lưu yêu cầu vào danh mục. Chưa có tệp báo cáo được kết xuất.".into();
                    self.title.clear();
                    self.error.clear();
                    self.needs_reload = true;
                }
                Err(error) => self.error = error,
            }
        }
        if self.pending_list.is_some() || self.pending_create.is_some() {
            ctx.request_repaint_after(Duration::from_millis(80));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            ui.label("Bạn không có quyền xem danh mục báo cáo.");
            return;
        }
        self.poll(ctx, session, api);
        self.render_content(ui, session);

        if self.create_open {
            let mut close = false;
            let mut submit = false;
            let (_, dismissed) = widgets::modal(
                ctx,
                "reports.create",
                "Khởi Tạo Kết Xuất Báo Cáo Quản Trị Mới",
                600.0,
                self.pending_create.is_some(),
                |ui| {
                    ui.add_space(14.0);
                    widgets::form_input(
                        ui,
                        "reports.title",
                        "Tiêu đề báo cáo quản trị",
                        true,
                        &mut self.title,
                        "",
                        false,
                    );
                    widgets::form_select(
                        ui,
                        "reports.type",
                        "Phân hệ nghiệp vụ",
                        true,
                        &mut self.form_type,
                        &REPORT_TYPES,
                    );
                    widgets::form_input(
                        ui,
                        "reports.author",
                        "Người phụ trách lập",
                        true,
                        &mut self.author,
                        "",
                        false,
                    );
                    widgets::form_input(
                        ui,
                        "reports.period",
                        "Kỳ báo cáo",
                        true,
                        &mut self.period,
                        "Nhập kỳ cần lập báo cáo",
                        false,
                    );
                    widgets::form_select(
                        ui,
                        "reports.format",
                        "Định dạng trích xuất dữ liệu",
                        true,
                        &mut self.format,
                        &["PDF + Excel", "PDF", "Excel"],
                    );
                    ui.label(
                        RichText::new(EXPORT_UNAVAILABLE)
                            .small()
                            .color(Color32::from_rgb(100, 116, 139)),
                    );
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                    }
                    ui.add_space(18.0);
                    widgets::action_row(ui, |ui| {
                        submit = ui
                            .add_enabled(
                                !self.title.trim().is_empty()
                                    && !self.author.trim().is_empty()
                                    && !self.period.trim().is_empty(),
                                egui::Button::new("Lưu yêu cầu báo cáo")
                                    .fill(crate::theme::PRIMARY),
                            )
                            .clicked();
                        close = ui.button("Hủy").clicked();
                    });
                },
            );
            if close || dismissed {
                self.create_open = false;
            }
            if submit && self.pending_create.is_none() {
                match make_report_request(
                    &self.title,
                    &self.form_type,
                    &self.author,
                    &self.period,
                    &self.format,
                ) {
                    Ok(record) => {
                        self.pending_create = Some(api.create_generic_collection_record_task(
                            session,
                            REPORT_SCOPE,
                            &record,
                            (!self.revision.is_empty()).then_some(self.revision.as_str()),
                        ));
                    }
                    Err(error) => self.error = error,
                }
            }
        }
        if let Some(report) = self.selected_report.clone() {
            let (_, closed) = widgets::drawer(
                ctx,
                "reports.details",
                "Hồ Sơ Báo Cáo Điều Hành & Thẩm Tra Dữ Liệu",
                600.0,
                |ui| render_report_details(ui, &report),
            );
            if closed {
                self.selected_report = None;
            }
        }
    }

    fn render_content(&mut self, ui: &mut Ui, session: &Session) {
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::from_rgb(22, 101, 52), &self.notice);
            ui.add_space(8.0);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
            ui.label(if self.data_loaded {
                "Đang giữ danh mục của lần tải thành công gần nhất."
            } else {
                "Chưa tải được danh mục; các chỉ số chưa xác định."
            });
            ui.add_space(8.0);
        }
        let downloads = total_downloads(&self.reports);
        let metrics = [
            Metric {
                label: "Tổng số báo cáo quản trị lưu trữ",
                value: if self.data_loaded {
                    format!("{} báo cáo", self.reports.len())
                } else {
                    "—".into()
                },
                detail: "Phục vụ Ban Giám Đốc & HĐQT",
                color: crate::theme::PRIMARY,
                value_size: 24.0,
            },
            Metric {
                label: "Độ tin cậy số liệu kiểm toán",
                value: "Chưa xác minh".into(),
                detail: "Chưa có kết quả đối soát hoặc kiểm toán",
                color: Color32::from_rgb(22, 163, 74),
                value_size: 24.0,
            },
            Metric {
                label: "Tổng lượt tải & tra cứu trong kỳ",
                value: if self.data_loaded {
                    downloads
                        .map(|v| format!("{v} lượt tải"))
                        .unwrap_or_else(|| "—".into())
                } else {
                    "—".into()
                },
                detail: "Theo số lượt được lưu trong danh mục",
                color: Color32::from_rgb(30, 64, 175),
                value_size: 24.0,
            },
            Metric {
                label: "Chu kỳ tự động hóa kết xuất",
                value: "Chưa cấu hình".into(),
                detail: "Chưa có dịch vụ lập lịch hoặc gửi email",
                color: Color32::from_rgb(217, 119, 6),
                value_size: 24.0,
            },
        ];
        widgets::metrics(ui, "reports.metrics", &metrics);
        ui.add_space(16.0);
        let types = [
            "all",
            REPORT_TYPES[0],
            REPORT_TYPES[1],
            REPORT_TYPES[2],
            REPORT_TYPES[3],
            REPORT_TYPES[4],
        ];
        let selected = types
            .iter()
            .position(|t| *t == self.type_filter)
            .unwrap_or(0);
        let response = widgets::filter_toolbar(
            ui,
            "reports",
            &[
                "Tất cả phân hệ",
                "Tài chính",
                "Nhân sự",
                "Tài sản",
                "Kinh doanh",
                "Kế hoạch OKR",
            ],
            selected,
            &mut self.search,
            "Tìm theo tiêu đề, mã, người lập...",
            "+ Kết xuất báo cáo mới",
            false,
            usize::MAX,
        );
        if let Some(index) = response.selected {
            self.type_filter = types[index].into();
            self.page = 0;
        }
        if response.search_changed {
            self.page = 0;
        }
        if response.reload_clicked {
            self.needs_reload = true;
        }
        if response.create_clicked {
            self.title.clear();
            self.author = session.user.name.clone();
            self.period = self.selected_period.clone();
            self.create_open = true;
        }
        ui.add_space(10.0);
        let mut periods = self
            .reports
            .iter()
            .map(|r| report_text(r, "period"))
            .filter(|p| !p.is_empty())
            .collect::<Vec<_>>();
        periods.sort();
        periods.dedup();
        widgets::combo_box("reports.period.filter")
            .width(ui.available_width().min(200.0))
            .selected_text(if self.selected_period.is_empty() {
                "Tất cả kỳ"
            } else {
                &self.selected_period
            })
            .show_ui(ui, |ui| {
                if ui
                    .selectable_value(&mut self.selected_period, String::new(), "Tất cả kỳ")
                    .changed()
                {
                    self.page = 0;
                }
                for period in periods {
                    if ui
                        .selectable_value(&mut self.selected_period, period.clone(), period)
                        .changed()
                    {
                        self.page = 0;
                    }
                }
            });
        ui.add_space(12.0);
        if self.pending_list.is_some() {
            ui.spinner();
            ui.label("Đang tải danh mục báo cáo…");
        }
        let query = self.search.trim().to_lowercase();
        let filtered = self
            .reports
            .iter()
            .filter(|r| report_matches(r, &self.type_filter, &self.selected_period, &query))
            .cloned()
            .collect::<Vec<_>>();
        self.page = self
            .page
            .min(filtered.len().div_ceil(self.page_size).max(1) - 1);
        let shown = filtered
            .iter()
            .skip(self.page * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        let columns = [
            TableColumn {
                title: "Mã báo cáo & Kỳ",
                width: 160.0,
            },
            TableColumn {
                title: "Tên báo cáo điều hành",
                width: (ui.available_width() - 830.0).max(260.0),
            },
            TableColumn {
                title: "Người lập & Ngày ban hành",
                width: 220.0,
            },
            TableColumn {
                title: "Lượt tải",
                width: 100.0,
            },
            TableColumn {
                title: "Trạng thái",
                width: 130.0,
            },
            TableColumn {
                title: "Thao tác",
                width: 218.0,
            },
        ];
        widgets::table_with_row_height(
            ui,
            "reports.table",
            &columns,
            shown.len(),
            76.0,
            |ui, row, column| {
                let report = shown[row];
                match column {
                    0 => {
                        ui.colored_label(crate::theme::PRIMARY, report_display(report, "code"));
                        ui.label(RichText::new(report_display(report, "period")).size(11.5));
                    }
                    1 => {
                        ui.label(RichText::new(report_display(report, "title")).size(13.0));
                        ui.label(
                            RichText::new(format!(
                                "Phân hệ: {} · Dung lượng: {}",
                                report_display(report, "type"),
                                report_display(report, "fileSize")
                            ))
                            .size(11.5)
                            .color(Color32::from_rgb(37, 99, 235)),
                        );
                    }
                    2 => {
                        ui.label(report_display(report, "author"));
                        ui.label(
                            RichText::new(format!(
                                "Ngày ban hành: {}",
                                report_display(report, "date")
                            ))
                            .size(11.5),
                        );
                    }
                    3 => {
                        ui.label(
                            report_downloads(report)
                                .map(|n| format!("{n} lượt"))
                                .unwrap_or_else(|| "—".into()),
                        );
                    }
                    4 => {
                        let status = report_display(report, "status");
                        widgets::tag(
                            ui,
                            &status,
                            if status == "Sẵn sàng" {
                                widgets::TagTone::Success
                            } else {
                                widgets::TagTone::Warning
                            },
                        );
                    }
                    _ => {
                        ui.horizontal_wrapped(|ui| {
                            if ui.small_button("Hồ sơ").clicked() {
                                self.selected_report = Some(report.clone());
                            }
                            for label in ["PDF", "Excel"] {
                                ui.add_enabled(false, egui::Button::new(label).small())
                                    .on_disabled_hover_text(EXPORT_UNAVAILABLE);
                            }
                        });
                    }
                }
            },
        );
        ui.add_space(10.0);
        widgets::pagination(
            ui,
            "reports.pagination",
            &mut self.page,
            filtered.len(),
            &mut self.page_size,
        );
        ui.add_space(12.0);
        ui.label(
            RichText::new(EXPORT_UNAVAILABLE)
                .size(12.0)
                .color(Color32::from_rgb(100, 116, 139)),
        );
        if self.data_loaded && filtered.is_empty() {
            ui.label(if self.reports.is_empty() {
                "Chưa có báo cáo quản trị được lưu."
            } else {
                "Không có báo cáo phù hợp với bộ lọc hiện tại."
            });
        }
    }
}

fn report_matches(record: &Value, type_filter: &str, period: &str, query: &str) -> bool {
    (type_filter == "all" || report_text(record, "type") == type_filter)
        && (period.is_empty() || report_text(record, "period") == period)
        && (query.is_empty()
            || ["title", "code", "author"]
                .iter()
                .any(|field| report_text(record, field).to_lowercase().contains(query)))
}

fn report_text(record: &Value, field: &str) -> String {
    record
        .get(field)
        .and_then(|v| {
            v.as_str()
                .map(str::to_owned)
                .or_else(|| v.as_i64().map(|n| n.to_string()))
        })
        .unwrap_or_default()
}

fn report_display(record: &Value, field: &str) -> String {
    let text = report_text(record, field);
    if text.trim().is_empty() {
        "—".into()
    } else {
        text
    }
}

fn report_downloads(record: &Value) -> Option<i64> {
    record
        .get("downloadsCount")
        .and_then(Value::as_i64)
        .filter(|n| *n >= 0)
}

fn total_downloads(reports: &[Value]) -> Option<i64> {
    reports
        .iter()
        .try_fold(0_i64, |sum, r| sum.checked_add(report_downloads(r)?))
}

fn make_report_request(
    title: &str,
    report_type: &str,
    author: &str,
    period: &str,
    format: &str,
) -> Result<Value, String> {
    if title.trim().is_empty() || author.trim().is_empty() || period.trim().is_empty() {
        return Err("Tiêu đề, người lập và kỳ báo cáo là bắt buộc.".into());
    }
    if title.chars().count() > 500
        || author.chars().count() > 200
        || period.chars().count() > 120
        || !REPORT_TYPES.contains(&report_type)
        || !["PDF + Excel", "PDF", "Excel"].contains(&format)
    {
        return Err("Thông tin yêu cầu báo cáo không hợp lệ hoặc quá dài.".into());
    }
    let now = Utc::now();
    Ok(json!({
        "key": format!("report-request-{}", now.timestamp_micros()),
        "title": title.trim(), "type": report_type, "author": author.trim(),
        "date": now.format("%Y-%m-%d").to_string(), "period": period.trim(),
        "requestedFormat": format, "status": "Chờ kết xuất", "downloadsCount": 0
    }))
}

fn render_report_details(ui: &mut Ui, report: &Value) {
    ui.colored_label(
        crate::theme::PRIMARY,
        format!("MÃ BÁO CÁO: {}", report_display(report, "code")),
    );
    ui.label(
        RichText::new(report_display(report, "title"))
            .size(18.0)
            .strong(),
    );
    ui.label(format!(
        "Kỳ báo cáo: {} · Người lập: {}",
        report_display(report, "period"),
        report_display(report, "author")
    ));
    ui.add_space(16.0);
    ui.strong("Tóm Tắt Điều Hành (Executive Summary)");
    ui.add_space(8.0);
    ui.label(report_display(report, "executiveSummary"));
    ui.add_space(16.0);
    ui.strong("Các Chỉ Số Quan Trọng (Key Highlights)");
    ui.add_space(8.0);
    if let Some(metrics) = report.get("keyMetrics").and_then(Value::as_array) {
        for metric in metrics {
            ui.horizontal_wrapped(|ui| {
                ui.label(report_display(metric, "label"));
                ui.strong(report_display(metric, "value"));
            });
        }
    } else {
        ui.label("Chưa có dữ liệu chỉ số.");
    }
    ui.add_space(16.0);
    ui.horizontal_wrapped(|ui| {
        for label in ["Tải Báo Cáo PDF", "In Báo Cáo (A4)"] {
            ui.add_enabled(false, egui::Button::new(label))
                .on_disabled_hover_text(EXPORT_UNAVAILABLE);
        }
    });
    ui.add_space(10.0);
    ui.label(EXPORT_UNAVAILABLE);
    // Keep every imported extension field inspectable without rewriting the source record.
    ui.collapsing("Dữ liệu hồ sơ đầy đủ", |ui| {
        ui.label(serde_json::to_string_pretty(report).unwrap_or_default());
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn filters_include_real_period_and_preserve_unknown_record_fields() {
        let r = json!({"title":"Báo cáo tài chính","code":"RP-42","type":"Tài chính","author":"Nguyễn Mai","period":"Q4/2026","unknown":{"keep":true}});
        assert!(report_matches(&r, "all", "", "rp-42"));
        assert!(report_matches(&r, "Tài chính", "Q4/2026", "nguyễn"));
        assert!(!report_matches(&r, "Tài chính", "Q3/2026", ""));
        assert!(!report_matches(&r, "Tài sản & IDC", "", ""));
        assert_eq!(r["unknown"]["keep"], true);
    }

    #[test]
    fn request_never_fabricates_an_export_or_audit_result() {
        let r = make_report_request(
            " Báo cáo ",
            REPORT_TYPES[0],
            "Người lập",
            "Q4/2026",
            "Excel",
        )
        .unwrap();
        assert_eq!(r["title"], "Báo cáo");
        assert_eq!(r["period"], "Q4/2026");
        assert_eq!(r["requestedFormat"], "Excel");
        assert_eq!(r["status"], "Chờ kết xuất");
        for field in ["fileSize", "executiveSummary", "keyMetrics", "code"] {
            assert!(r.get(field).is_none(), "{field}");
        }
        assert!(make_report_request("", REPORT_TYPES[0], "A", "Q4", "PDF").is_err());
        assert!(make_report_request("A", "bad", "A", "Q4", "PDF").is_err());
    }

    #[test]
    fn missing_or_malformed_download_counts_are_unknown() {
        assert_eq!(report_downloads(&json!({"downloadsCount":"bad"})), None);
        assert_eq!(report_downloads(&json!({"downloadsCount":-7})), None);
        assert_eq!(report_downloads(&json!({"downloadsCount":0})), Some(0));
        assert_eq!(
            total_downloads(&[json!({"downloadsCount":9}), json!({})]),
            None
        );
    }
}
