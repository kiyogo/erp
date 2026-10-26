use std::time::Duration;

use egui::{Color32, RichText, Ui};

use crate::{
    api::{
        ApiClient, ApiTask, CreateHelpdeskIncidentInput, HelpdeskIncident,
        HelpdeskIncidentDetailResponse, HelpdeskIncidentResponse, HelpdeskIncidentsResponse,
    },
    models::Session,
    widgets,
};

const SEVERITIES: &[&str] = &[
    "P1 - Khẩn cấp (Toàn hệ thống)",
    "P2 - Cao (Ảnh hưởng dịch vụ)",
    "P3 - Trung bình",
];
const ACTIVE: &str = "Đang xử lý";
const RESOLVED: &str = "Đã khắc phục";
const PAGE_SIZE: usize = 8;

#[derive(Default)]
pub struct HelpdeskIncidentsView {
    loaded_for: Option<String>,
    data_loaded: bool,
    incidents: Vec<HelpdeskIncident>,
    events: Vec<crate::api::HelpdeskIncidentEvent>,
    list_task: Option<ApiTask<HelpdeskIncidentsResponse>>,
    detail_task: Option<ApiTask<HelpdeskIncidentDetailResponse>>,
    create_task: Option<ApiTask<HelpdeskIncidentResponse>>,
    resolve_task: Option<ApiTask<HelpdeskIncidentResponse>>,
    selected_key: Option<String>,
    title: String,
    affected_system: String,
    severity: String,
    handler: String,
    root_cause: String,
    resolution_note: String,
    search: String,
    filter: String,
    page: usize,
    page_size: usize,
    create_open: bool,
    needs_reload: bool,
    error: String,
    form_error: String,
    notice: String,
}

impl HelpdeskIncidentsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn clear_account(&mut self, session: &Session) {
        *self = Self {
            loaded_for: Some(format!("{}:{}", session.user.id, session.session_id)),
            severity: SEVERITIES[1].to_owned(),
            page_size: PAGE_SIZE,
            needs_reload: true,
            ..Self::default()
        };
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref()
            != Some(format!("{}:{}", session.user.id, session.session_id).as_str())
        {
            self.clear_account(session);
        }
        if self.needs_reload
            && self.list_task.is_none()
            && self.create_task.is_none()
            && self.resolve_task.is_none()
        {
            self.error.clear();
            self.list_task = Some(api.list_helpdesk_incidents_task(session));
            self.needs_reload = false;
        }
        if let Some(result) = self.list_task.as_ref().and_then(ApiClient::poll) {
            self.list_task = None;
            match result {
                Ok(response) => {
                    self.data_loaded = true;
                    self.incidents = response.data;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.detail_task.as_ref().and_then(ApiClient::poll) {
            self.detail_task = None;
            match result {
                Ok(response)
                    if self.selected_key.as_deref() == Some(response.incident.key.as_str()) =>
                {
                    self.events = response.events;
                    if let Some(current) = self
                        .incidents
                        .iter_mut()
                        .find(|i| i.key == response.incident.key)
                    {
                        *current = response.incident;
                    }
                    self.error.clear();
                }
                Ok(_) => {}
                Err(error) => self.error = error,
            }
        }
        if let Some(result) = self.create_task.as_ref().and_then(ApiClient::poll) {
            self.create_task = None;
            match result {
                Ok(response) => {
                    let code = response.incident.code.clone();
                    self.incidents.insert(0, response.incident);
                    self.title.clear();
                    self.affected_system.clear();
                    self.handler.clear();
                    self.root_cause.clear();
                    self.create_open = false;
                    self.notice = format!(
                        "Đã ghi nhận sự cố {code}; thời điểm và trạng thái do máy chủ xác định."
                    );
                    self.form_error.clear();
                }
                Err(error) => self.form_error = error,
            }
        }
        if let Some(result) = self.resolve_task.as_ref().and_then(ApiClient::poll) {
            self.resolve_task = None;
            match result {
                Ok(response) => {
                    let code = response.incident.code.clone();
                    if let Some(current) = self
                        .incidents
                        .iter_mut()
                        .find(|i| i.key == response.incident.key)
                    {
                        *current = response.incident;
                    }
                    self.resolution_note.clear();
                    self.notice = format!(
                        "Đã lưu xác nhận khắc phục cho {code}. Đây chưa phải xác nhận RCA độc lập."
                    );
                    self.error.clear();
                    self.detail_task = self
                        .selected_key
                        .as_deref()
                        .map(|id| api.get_helpdesk_incident_task(session, id));
                }
                Err(error) => self.error = error,
            }
        }
        if self.list_task.is_some()
            || self.detail_task.is_some()
            || self.create_task.is_some()
            || self.resolve_task.is_some()
        {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            self.reset();
            ui.heading("Không đủ quyền");
            ui.label("Hồ sơ sự cố hiện chỉ dành cho ADMIN.");
            return;
        }
        self.poll(ctx, session, api);
        let busy =
            self.list_task.is_some() || self.create_task.is_some() || self.resolve_task.is_some();
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        let counts = [
            self.incidents.len(),
            self.incidents.iter().filter(|i| i.status == ACTIVE).count(),
            self.incidents
                .iter()
                .filter(|i| i.status == RESOLVED)
                .count(),
            self.incidents
                .iter()
                .filter(|i| i.status == ACTIVE && i.severity.starts_with("P1"))
                .count(),
        ];
        let metrics = [
            (
                "Tổng hồ sơ sự cố",
                "Hồ sơ đã lưu trên máy chủ",
                Color32::from_rgb(15, 23, 42),
            ),
            (
                "Đang xử lý",
                "Đang ứng cứu / chờ khắc phục",
                Color32::from_rgb(217, 119, 6),
            ),
            (
                "Đã khắc phục",
                "Chưa đồng nghĩa hoàn tất RCA độc lập",
                Color32::from_rgb(22, 163, 74),
            ),
            (
                "Sự cố P1 đang mở",
                "Mức khẩn cấp toàn hệ thống",
                Color32::from_rgb(220, 38, 38),
            ),
        ]
        .into_iter()
        .zip(counts)
        .map(|((label, detail, color), count)| widgets::Metric {
            label,
            detail,
            color,
            value: if self.data_loaded {
                count.to_string()
            } else {
                "—".to_owned()
            },
            value_size: 24.0,
        })
        .collect::<Vec<_>>();
        widgets::metrics(ui, "incidents.metrics", &metrics);
        ui.add_space(16.0);
        if !self.notice.is_empty() {
            ui.colored_label(Color32::DARK_GREEN, &self.notice);
            ui.add_space(8.0);
        }
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
            ui.add_space(8.0);
        }

        let selected = match self.filter.as_str() {
            "P1" => 1,
            "P2" => 2,
            "P3" => 3,
            ACTIVE => 4,
            _ => 0,
        };
        let toolbar = ui
            .add_enabled_ui(
                !busy && !self.create_open && self.selected_key.is_none(),
                |ui| {
                    widgets::filter_toolbar_with_more(
                        ui,
                        "incidents",
                        &[
                            "Tất cả sự cố",
                            "P1 · Khẩn cấp",
                            "P2 · Cao",
                            "P3 · Trung bình",
                            "Đang ứng cứu",
                        ],
                        selected,
                        &mut self.search,
                        "Tìm mã sự cố, tiêu đề, hệ thống...",
                        "+ Báo cáo sự cố",
                        false,
                        240,
                        |ui| {
                            ui.add_enabled(false, egui::Button::new("Xuất báo cáo"))
                                .on_hover_text("Chưa có dịch vụ xuất báo cáo sự cố.");
                        },
                    )
                },
            )
            .inner;
        if let Some(tab) = toolbar.selected {
            self.filter = ["", "P1", "P2", "P3", ACTIVE][tab].to_owned();
            self.page = 0;
        }
        if toolbar.search_changed {
            self.page = 0;
        }
        if toolbar.reload_clicked && !busy {
            self.needs_reload = true;
        }
        if toolbar.create_clicked && !busy && self.selected_key.is_none() {
            self.create_open = true;
            self.form_error.clear();
        }
        ui.add_space(12.0);
        if self.list_task.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang tải hồ sơ sự cố…");
            });
        }
        let visible = self
            .incidents
            .iter()
            .filter(|incident| matches_incident(incident, &self.filter, &self.search))
            .cloned()
            .collect::<Vec<_>>();
        let page_size = self.page_size.max(PAGE_SIZE);
        self.page = self.page.min(visible.len().div_ceil(page_size).max(1) - 1);
        let shown = visible
            .iter()
            .skip(self.page * page_size)
            .take(page_size)
            .collect::<Vec<_>>();
        let columns = [
            widgets::TableColumn {
                title: "Mã sự cố / Ghi nhận lúc",
                width: 185.0,
            },
            widgets::TableColumn {
                title: "Tiêu đề / Hệ thống ảnh hưởng",
                width: 300.0,
            },
            widgets::TableColumn {
                title: "Mức độ (Severity)",
                width: 240.0,
            },
            widgets::TableColumn {
                title: "Chỉ huy ứng cứu (khai báo)",
                width: 200.0,
            },
            widgets::TableColumn {
                title: "Trạng thái",
                width: 150.0,
            },
            widgets::TableColumn {
                title: "Thao tác",
                width: 120.0,
            },
        ];
        let mut inspect = None;
        widgets::table_with_row_height(
            ui,
            "incidents.table",
            &columns,
            shown.len(),
            94.0,
            |ui, row, col| {
                let incident = shown[row];
                match col {
                    0 => {
                        ui.label(
                            RichText::new(&incident.code)
                                .strong()
                                .color(Color32::from_rgb(220, 38, 38)),
                        );
                        ui.label(
                            RichText::new(display_timestamp(&incident.occurred_at))
                                .size(11.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                        if incident.legacy_import_status.as_deref() == Some("unverified") {
                            ui.label(
                                RichText::new("Legacy · chưa xác minh")
                                    .size(11.0)
                                    .color(Color32::from_rgb(180, 83, 9)),
                            );
                        }
                    }
                    1 => {
                        ui.add(
                            egui::Label::new(
                                RichText::new(&incident.incident_title).strong().size(13.0),
                            )
                            .truncate(),
                        )
                        .on_hover_text(&incident.incident_title);
                        ui.add(
                            egui::Label::new(
                                RichText::new(format!("Hệ thống: {}", incident.affected_system))
                                    .size(11.5)
                                    .color(Color32::from_rgb(37, 99, 235)),
                            )
                            .truncate(),
                        )
                        .on_hover_text(&incident.affected_system);
                    }
                    2 => widgets::tag(ui, &incident.severity, severity_tone(&incident.severity)),
                    3 => {
                        ui.label(RichText::new(&incident.handler).color(crate::theme::PRIMARY));
                    }
                    4 => widgets::tag(
                        ui,
                        &incident.status,
                        if incident.status == RESOLVED {
                            widgets::TagTone::Success
                        } else {
                            widgets::TagTone::Warning
                        },
                    ),
                    _ => {
                        if ui
                            .add_enabled(!busy && !self.create_open, egui::Button::new("Hồ sơ"))
                            .clicked()
                        {
                            inspect = Some(incident.key.clone());
                        }
                    }
                }
            },
        );
        if let Some(key) = inspect {
            self.selected_key = Some(key.clone());
            self.events.clear();
            self.resolution_note.clear();
            self.error.clear();
            self.detail_task = Some(api.get_helpdesk_incident_task(session, &key));
        }
        if visible.is_empty() && self.list_task.is_none() {
            ui.label(if self.data_loaded {
                "Không có hồ sơ phù hợp."
            } else {
                "Chưa tải được hồ sơ. Chọn Làm mới để thử lại."
            });
        }
        ui.add_space(12.0);
        self.page_size = page_size;
        widgets::pagination(
            ui,
            "incidents.pagination",
            &mut self.page,
            visible.len(),
            &mut self.page_size,
        );
        ui.add_space(8.0);
        ui.label(
            RichText::new(
                "SLA, uptime, downtime và CAPA: chưa có dữ liệu đo lường trong dịch vụ hiện tại.",
            )
            .size(11.5)
            .color(Color32::from_rgb(100, 116, 139)),
        );
        self.render_create(ctx, session, api);
        self.render_detail(ctx, session, api);
    }

    fn render_create(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if !self.create_open {
            return;
        }
        let busy = self.create_task.is_some();
        let mut submit = false;
        let mut cancel = false;
        let (_, close) = widgets::modal(
            ctx,
            "incidents.create",
            "Báo cáo sự cố kỹ thuật hạ tầng",
            640.0,
            busy,
            |ui| {
                ui.label(
                    RichText::new(
                        "Mã sự cố, thời điểm và trạng thái ban đầu được máy chủ cấp khi lưu.",
                    )
                    .size(12.0)
                    .color(Color32::from_rgb(100, 116, 139)),
                );
                ui.add_space(14.0);
                widgets::form_field(ui, "incident.code", "Mã sự cố", false, |ui| {
                    ui.add_enabled(
                        false,
                        egui::TextEdit::singleline(&mut "Máy chủ cấp khi lưu".to_owned()),
                    );
                });
                widgets::form_select(
                    ui,
                    "incident.severity",
                    "Mức độ nghiêm trọng",
                    true,
                    &mut self.severity,
                    SEVERITIES,
                );
                widgets::form_input(
                    ui,
                    "incident.title",
                    "Mô tả tóm tắt sự cố",
                    true,
                    &mut self.title,
                    "Ví dụ: Lỗi xác thực tài khoản qua OAuth2 Gateway",
                    false,
                );
                widgets::form_input(
                    ui,
                    "incident.system",
                    "Hệ thống / Dịch vụ bị gián đoạn",
                    true,
                    &mut self.affected_system,
                    "Tên hệ thống hoặc dịch vụ ảnh hưởng",
                    false,
                );
                widgets::form_input(
                    ui,
                    "incident.handler",
                    "Chỉ huy ứng cứu (khai báo)",
                    true,
                    &mut self.handler,
                    "Họ tên người phụ trách",
                    false,
                );
                widgets::form_input(
                    ui,
                    "incident.cause",
                    "Nguyên nhân sơ bộ (chưa xác minh RCA)",
                    false,
                    &mut self.root_cause,
                    "Kết quả phân tích ban đầu, nếu có",
                    false,
                );
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.form_error);
                    ui.add_space(8.0);
                }
                ui.add_space(8.0);
                widgets::action_row(ui, |ui| {
                    submit = ui
                        .add(
                            egui::Button::new(
                                RichText::new(if busy {
                                    "Đang lưu…"
                                } else {
                                    "Lưu hồ sơ sự cố"
                                })
                                .color(Color32::WHITE),
                            )
                            .fill(Color32::from_rgb(220, 38, 38)),
                        )
                        .clicked();
                    cancel = ui.button("Hủy").clicked();
                });
            },
        );
        if (close || cancel) && !busy {
            self.create_open = false;
        }
        if submit && !busy {
            match make_create_input(
                &self.title,
                &self.affected_system,
                &self.severity,
                &self.handler,
                &self.root_cause,
            ) {
                Ok(input) => {
                    self.form_error.clear();
                    self.create_task = Some(api.create_helpdesk_incident_task(session, &input));
                }
                Err(error) => self.form_error = error,
            }
        }
    }

    fn render_detail(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let Some(incident) = self
            .selected_key
            .as_deref()
            .and_then(|key| self.incidents.iter().find(|item| item.key == key))
            .cloned()
        else {
            return;
        };
        let busy = self.resolve_task.is_some();
        let mut resolve = false;
        let (_, close) = widgets::drawer(
            ctx,
            "incidents.detail",
            "Hồ sơ sự cố & Phân tích nguyên nhân",
            620.0,
            |ui| {
                ui.spacing_mut().item_spacing.y = 8.0;
                egui::Frame::none()
                    .fill(Color32::from_rgb(254, 242, 242))
                    .stroke(egui::Stroke::new(1.0, Color32::from_rgb(254, 202, 202)))
                    .rounding(8.0)
                    .inner_margin(16.0)
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.label(
                            RichText::new(format!("MÃ SỰ CỐ: {}", incident.code))
                                .strong()
                                .color(Color32::from_rgb(220, 38, 38)),
                        );
                        ui.label(RichText::new(&incident.incident_title).size(17.0).strong());
                        widgets::tag(ui, &incident.severity, severity_tone(&incident.severity));
                        detail(ui, "Hệ thống ảnh hưởng", &incident.affected_system);
                    });
                if incident.legacy_import_status.as_deref() == Some("unverified") {
                    ui.colored_label(Color32::from_rgb(180, 83, 9), "Hồ sơ nhập từ legacy: RCA, thời điểm khắc phục, timeline, CAPA và downtime nguồn chưa được xác minh.");
                }
                egui::Frame::group(ui.style())
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.label(RichText::new("Thời gian & Chỉ huy ứng cứu").strong());
                        detail(ui, "Trạng thái", &incident.status);
                        detail(
                            ui,
                            "Ghi nhận lúc",
                            &display_timestamp(&incident.occurred_at),
                        );
                        detail(
                            ui,
                            "Khắc phục lúc",
                            &incident
                                .resolved_at
                                .as_deref()
                                .map(display_timestamp)
                                .unwrap_or_else(|| "Chưa ghi nhận".to_owned()),
                        );
                        detail(ui, "Người phụ trách khai báo", &incident.handler);
                        detail(ui, "ADMIN ghi nhận", &incident.created_by_name);
                    });
                egui::Frame::group(ui.style())
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.label(RichText::new("Phân tích nguyên nhân sơ bộ").strong());
                        ui.label(if incident.root_cause.is_empty() {
                            "Chưa ghi nhận"
                        } else {
                            &incident.root_cause
                        });
                        ui.small("Trạng thái khắc phục không xác nhận RCA độc lập đã hoàn tất.");
                    });
                egui::Frame::group(ui.style())
                    .inner_margin(14.0)
                    .show(ui, |ui| {
                        ui.set_width(ui.available_width());
                        ui.label(RichText::new("Nhật ký diễn biến ứng cứu").strong());
                        if self.detail_task.is_some() {
                            ui.spinner();
                        } else if self.events.is_empty() {
                            ui.label("Chưa có nhật ký được tải từ máy chủ.");
                        }
                        for event in &self.events {
                            ui.label(
                                RichText::new(format!(
                                    "{} · {}",
                                    display_timestamp(&event.created_at),
                                    event.actor_name
                                ))
                                .color(crate::theme::PRIMARY),
                            );
                            ui.label(format!(
                                "{} → {}",
                                event.from_status.as_deref().unwrap_or("Khởi tạo"),
                                event.to_status
                            ));
                            if !event.note.is_empty() {
                                ui.label(&event.note);
                            }
                            ui.separator();
                        }
                    });
                if !self.error.is_empty() {
                    ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
                }
                if incident.status == ACTIVE {
                    ui.add_enabled_ui(!busy, |ui| {
                        widgets::form_input(
                            ui,
                            "incident.resolution",
                            "Ghi chú khắc phục (bắt buộc, tối đa 2.000 ký tự)",
                            true,
                            &mut self.resolution_note,
                            "Nội dung xử lý thực tế",
                            false,
                        );
                        resolve = ui
                            .add_enabled(
                                self.detail_task.is_none()
                                    && valid_resolution_note(&self.resolution_note),
                                egui::Button::new(
                                    RichText::new(if busy {
                                        "Đang lưu…"
                                    } else {
                                        "Xác nhận đã khắc phục"
                                    })
                                    .color(Color32::WHITE),
                                )
                                .fill(crate::theme::PRIMARY),
                            )
                            .clicked();
                    });
                }
                ui.small("Chưa có số liệu downtime, kế hoạch CAPA hoặc dịch vụ in Post-Mortem.");
            },
        );
        if resolve && !busy && valid_resolution_note(&self.resolution_note) {
            self.error.clear();
            self.resolve_task = Some(api.resolve_helpdesk_incident_task(
                session,
                &incident.key,
                self.resolution_note.trim(),
            ));
        }
        if close && !busy {
            self.selected_key = None;
            self.detail_task = None;
            self.events.clear();
            self.resolution_note.clear();
        }
    }
}

fn make_create_input(
    title: &str,
    system: &str,
    severity: &str,
    handler: &str,
    root_cause: &str,
) -> Result<CreateHelpdeskIncidentInput, String> {
    let title = title.trim();
    let system = system.trim();
    let handler = handler.trim();
    if title.is_empty() || title.encode_utf16().count() > 240 {
        return Err("Nhập mô tả sự cố hợp lệ (tối đa 240 ký tự).".to_owned());
    }
    if system.is_empty() || system.encode_utf16().count() > 200 {
        return Err("Nhập hệ thống ảnh hưởng hợp lệ (tối đa 200 ký tự).".to_owned());
    }
    if !SEVERITIES.contains(&severity) {
        return Err("Chọn mức độ sự cố hợp lệ.".to_owned());
    }
    if handler.is_empty() || handler.encode_utf16().count() > 160 {
        return Err("Nhập người phụ trách khai báo hợp lệ.".to_owned());
    }
    if [title, system, handler, root_cause.trim()]
        .iter()
        .any(|value| value.chars().any(char::is_control))
    {
        return Err("Không sử dụng ký tự điều khiển trong hồ sơ sự cố.".to_owned());
    }
    if root_cause.trim().encode_utf16().count() > 4_000 {
        return Err("Nguyên nhân sơ bộ tối đa 4.000 ký tự.".to_owned());
    }
    Ok(CreateHelpdeskIncidentInput {
        incident_title: title.to_owned(),
        affected_system: system.to_owned(),
        severity: severity.to_owned(),
        handler: handler.to_owned(),
        root_cause: (!root_cause.trim().is_empty()).then(|| root_cause.trim().to_owned()),
    })
}

fn matches_incident(incident: &HelpdeskIncident, filter: &str, search: &str) -> bool {
    let category = match filter {
        "" => true,
        ACTIVE => incident.status == ACTIVE,
        _ => incident.severity.starts_with(filter),
    };
    let query = search.trim().to_lowercase();
    category
        && (query.is_empty()
            || [
                &incident.code,
                &incident.incident_title,
                &incident.affected_system,
                &incident.handler,
            ]
            .iter()
            .any(|value| value.to_lowercase().contains(&query)))
}

fn valid_resolution_note(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && value.encode_utf16().count() <= 2_000
        && !value.chars().any(char::is_control)
}

fn display_timestamp(value: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|time| {
            time.with_timezone(&chrono::FixedOffset::east_opt(7 * 3600).unwrap())
                .format("%d/%m/%Y %H:%M (UTC+7)")
                .to_string()
        })
        .unwrap_or_else(|_| value.to_owned())
}

fn detail(ui: &mut Ui, label: &str, value: &str) {
    ui.horizontal_wrapped(|ui| {
        ui.label(RichText::new(format!("{label}:")).strong());
        ui.label(value);
    });
}

fn severity_tone(severity: &str) -> widgets::TagTone {
    if severity.starts_with("P1") {
        widgets::TagTone::Error
    } else if severity.starts_with("P2") {
        widgets::TagTone::Warning
    } else {
        widgets::TagTone::Success
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn incident() -> HelpdeskIncident {
        HelpdeskIncident {
            key: "test".to_owned(),
            code: "INC-001".to_owned(),
            incident_title: "Lỗi OAuth".to_owned(),
            affected_system: "Auth Cluster".to_owned(),
            severity: SEVERITIES[0].to_owned(),
            occurred_at: "2026-10-24T00:30:00Z".to_owned(),
            resolved_at: None,
            handler: "Nguyễn An".to_owned(),
            root_cause: String::new(),
            status: ACTIVE.to_owned(),
            created_by: "admin".to_owned(),
            created_by_name: "Admin".to_owned(),
            updated_at: String::new(),
            legacy_import_status: None,
        }
    }

    #[test]
    fn create_dialog_footer_stays_inside_the_scroll_clip() {
        let session = Session {
            token: String::new(),
            session_id: "session".to_owned(),
            endpoint: String::new(),
            mode: crate::models::StorageMode::LocalAdmin,
            user: crate::models::User {
                id: "admin".to_owned(),
                email: String::new(),
                name: "Admin".to_owned(),
                role: "ADMIN".to_owned(),
                is_active: true,
            },
        };
        for width in [420.0, 1280.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::theme::setup_style(&ctx);
            let mut view = HelpdeskIncidentsView::default();
            view.clear_account(&session);
            view.create_open = true;
            for _ in 0..4 {
                let _ = ctx.run(
                    egui::RawInput {
                        screen_rect: Some(egui::Rect::from_min_size(
                            egui::Pos2::ZERO,
                            egui::vec2(width, 900.0),
                        )),
                        ..Default::default()
                    },
                    |ctx| view.render_create(ctx, &session, &ApiClient),
                );
            }
            let (footer, clip) = ctx
                .data(|data| {
                    data.get_temp::<(egui::Rect, egui::Rect)>(egui::Id::new("test.footer.bounds"))
                })
                .unwrap();
            assert!(
                clip.expand(1.0).contains_rect(footer),
                "{width}: {footer:?}, {clip:?}"
            );
        }
    }

    #[test]
    fn incident_tabs_combine_severity_status_and_trimmed_search() {
        let mut item = incident();
        assert!(matches_incident(&item, "P1", "  AUTH  "));
        assert!(matches_incident(&item, ACTIVE, "nguyễn"));
        assert!(matches_incident(&item, "", "inc-001"));
        assert!(!matches_incident(&item, "P2", "auth"));
        assert!(!matches_incident(&item, "P1", "unrelated"));
        item.status = RESOLVED.to_owned();
        assert!(!matches_incident(&item, ACTIVE, ""));
        assert!(matches_incident(&item, "P1", ""));
    }

    #[test]
    fn incident_validation_matches_server_utf16_and_control_character_limits() {
        assert!(make_create_input("a\nb", "system", SEVERITIES[0], "lead", "").is_err());
        assert!(
            make_create_input("title", "system", SEVERITIES[0], "lead", &"x".repeat(4_001))
                .is_err()
        );
        assert!(make_create_input(&"😀".repeat(120), "system", SEVERITIES[0], "lead", "").is_ok());
        assert!(make_create_input(&"😀".repeat(121), "system", SEVERITIES[0], "lead", "").is_err());
        assert!(!valid_resolution_note("  "));
        assert!(!valid_resolution_note("fix\nverified"));
        assert!(valid_resolution_note(&"😀".repeat(1_000)));
        assert!(!valid_resolution_note(&"😀".repeat(1_001)));
    }

    #[test]
    fn incident_timestamp_uses_explicit_vietnam_offset_and_preserves_unknown_dates() {
        assert_eq!(
            display_timestamp("2026-10-24T23:30:00Z"),
            "25/10/2026 06:30 (UTC+7)"
        );
        assert_eq!(display_timestamp("legacy date"), "legacy date");
    }

    #[test]
    fn incident_form_validates_and_sends_only_supported_fields() {
        assert!(make_create_input("", "system", SEVERITIES[0], "lead", "").is_err());
        assert!(make_create_input("title", "system", "P0", "lead", "").is_err());
        let input = make_create_input(" outage ", " auth ", SEVERITIES[0], " lead ", " ").unwrap();
        let payload = serde_json::to_value(input).unwrap();
        assert_eq!(payload["incidentTitle"], "outage");
        assert_eq!(payload["rootCause"], serde_json::Value::Null);
        assert!(payload.get("status").is_none());
        assert!(payload.get("downtimeMinutes").is_none());
        assert!(payload.get("actionItems").is_none());
    }

    #[test]
    fn incident_statuses_are_truthful_and_server_owned() {
        assert_eq!(ACTIVE, "Đang xử lý");
        assert_eq!(RESOLVED, "Đã khắc phục");
        assert_ne!(RESOLVED, "Đã xử lý & Hoàn tất RCA");
    }
}
