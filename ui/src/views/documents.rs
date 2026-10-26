use crate::{
    api::{ApiClient, ApiTask, GenericCollectionResponse, GenericRecordResponse},
    models::Session,
    views::document_editor::DocumentEditorView,
    widgets::{self, Metric, TableColumn},
};
use egui::{Color32, RichText, Ui};
use serde_json::{Value, json};
use std::{collections::BTreeMap, time::Duration};

type Field = (&'static str, &'static str, bool);

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum Page {
    #[default]
    Library,
    Notes,
    Archives,
    Templates,
    Settings,
}

impl Page {
    fn from_route(path: &str) -> Self {
        match path.trim_end_matches('/') {
            "/admin/documents/notes" => Self::Notes,
            "/admin/documents/archives" => Self::Archives,
            "/admin/documents/settings/contract-templates" => Self::Templates,
            p if p.starts_with("/admin/documents/settings") => Self::Settings,
            _ => Self::Library,
        }
    }
    fn scope(self) -> &'static str {
        match self {
            Self::Library => "enterprise_documents",
            Self::Notes => "doc_notes",
            Self::Archives => "doc_archives",
            Self::Templates => "contract_templates",
            Self::Settings => "",
        }
    }
    fn title(self) -> &'static str {
        match self {
            Self::Library => "Tài liệu & văn bản doanh nghiệp",
            Self::Notes => "Ghi chép & Chỉ đạo điều hành",
            Self::Archives => "Văn thư đến & đi",
            Self::Templates => "Mẫu hợp đồng",
            Self::Settings => "Thiết lập văn thư",
        }
    }
    fn create_label(self) -> &'static str {
        match self {
            Self::Library => "Ban hành văn bản",
            Self::Notes => "Ban hành chỉ đạo",
            Self::Archives => "Vào sổ văn thư",
            Self::Templates => "Thêm mẫu hợp đồng",
            Self::Settings => "Thêm quy tắc",
        }
    }
    fn fields(self) -> &'static [Field] {
        match self {
            Self::Library => &[
                ("docCode", "Số / Ký hiệu văn bản", true),
                ("docCategory", "Phân loại văn thư", true),
                ("title", "Trích yếu nội dung văn bản", true),
                ("direction", "Luồng văn bản", true),
                ("issuingAuthority", "Cơ quan ban hành", true),
                ("signerName", "Người ký (khai báo)", true),
                ("signerPosition", "Chức danh người ký", false),
                ("issuedDate", "Ngày ban hành", true),
                ("effectiveDate", "Ngày hiệu lực", true),
                ("expirationDate", "Ngày hết hiệu lực", false),
                ("securityLevel", "Mức độ bảo mật", true),
                ("storageLocation", "Vị trí lưu trữ", false),
                ("status", "Trạng thái", true),
                ("summary", "Tóm tắt nội dung", false),
            ],
            Self::Notes => &[
                ("noteCode", "Mã chỉ đạo / Biên bản", true),
                ("category", "Phân loại", true),
                ("title", "Tiêu đề chỉ đạo", true),
                ("priority", "Mức độ ưu tiên", true),
                ("author", "Người chỉ đạo (khai báo)", true),
                ("authorRole", "Chức danh", false),
                ("assignedToDept", "Phòng ban thực hiện", true),
                ("deadline", "Hạn chót", true),
                ("content", "Nội dung chỉ đạo", true),
                ("rawActions", "Đầu việc (mỗi dòng một việc)", false),
            ],
            Self::Archives => &[
                ("bookNumber", "Số vào sổ", true),
                ("dispatchType", "Loại sổ văn thư", true),
                ("docType", "Thể loại văn bản", true),
                ("originalCode", "Số & Ký hiệu gốc", true),
                ("partner", "Cơ quan gửi / Nơi nhận", true),
                ("subject", "Trích yếu nội dung", true),
                ("signer", "Người ký (khai báo)", true),
                ("signerPosition", "Chức danh người ký", false),
                ("receiverOrAuthor", "Phòng ban chủ trì xử lý", true),
                ("docDate", "Ngày ghi trên văn bản", true),
                ("dateReceivedOrIssued", "Ngày vào sổ", true),
                ("urgency", "Độ khẩn", true),
                ("securityLevel", "Mức độ mật", true),
                ("slaDeadline", "Hạn xử lý", false),
                ("status", "Trạng thái xử lý", true),
            ],
            Self::Templates => &[
                ("name", "Tên mẫu hợp đồng", true),
                ("category", "Phân loại hợp đồng", true),
                ("partyType", "Đối tượng hợp đồng", true),
                ("content", "Nội dung mẫu", true),
            ],
            Self::Settings => &[],
        }
    }
    fn tabs(self) -> &'static [&'static str] {
        match self {
            Self::Library => &[
                "Tất cả",
                "Quy chế & Quyết định",
                "Công văn điều hành",
                "Thông báo nội bộ",
                "Hợp đồng & Pháp lý",
                "Biên bản & Kỹ thuật",
            ],
            Self::Notes => &[
                "Tất cả",
                "Ghim ưu tiên",
                "Ý kiến chỉ đạo BGĐ",
                "Giao ban tuần & Tháng",
                "Biên bản cuộc họp HĐQT",
                "Ghi nhớ dự án & Kỹ thuật",
                "Chỉ đạo đột xuất",
            ],
            Self::Archives => &["Tất cả", "Văn bản đến", "Văn bản đi"],
            Self::Templates => &["Tất cả", "Đang áp dụng", "Tạm dừng"],
            Self::Settings => &[
                "Quy tắc sinh số",
                "Chữ ký số & Con dấu",
                "Bảo mật tài liệu",
                "Lưu trữ & Tiêu hủy",
            ],
        }
    }
}

#[derive(Default)]
pub struct EnterpriseDocumentsView {
    page: Page,
    loaded_for: Option<String>,
    rows: Vec<Value>,
    revision: String,
    loaded: bool,
    reload: bool,
    pending: Option<ApiTask<GenericCollectionResponse>>,
    save: Option<ApiTask<GenericRecordResponse>>,
    error: String,
    notice: String,
    search: String,
    tab: usize,
    security: String,
    page_index: usize,
    page_size: usize,
    create_open: bool,
    draft: BTreeMap<String, String>,
    form_error: String,
    selected: Option<Value>,
    editor_open: bool,
}

impl EnterpriseDocumentsView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }
    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient, path: &str) {
        let page = Page::from_route(path);
        let account = format!(
            "{}:{}:{}",
            session.endpoint, session.user.id, session.session_id
        );
        if self.loaded_for.as_deref() != Some(account.as_str()) || self.page != page {
            *self = Self {
                loaded_for: Some(account),
                page,
                reload: true,
                page_size: 8,
                ..Default::default()
            };
        }
        if self.reload && self.pending.is_none() && self.save.is_none() && page != Page::Settings {
            self.error.clear();
            self.pending = Some(api.list_generic_collection_task(session, page.scope()));
            self.reload = false;
        }
        if let Some(result) = self.pending.as_ref().and_then(ApiClient::poll) {
            self.pending = None;
            match result {
                Ok(r) => {
                    self.rows = r.data;
                    self.revision = r.revision;
                    self.loaded = true;
                }
                Err(e) => self.error = e,
            }
        }
        if let Some(result) = self.save.as_ref().and_then(ApiClient::poll) {
            self.save = None;
            match result {
                Ok(_) => {
                    self.create_open = false;
                    self.draft.clear();
                    self.reload = true;
                    self.notice = "Đã lưu bản ghi lên máy chủ.".into();
                }
                Err(e) => self.form_error = e,
            }
        }
        if self.pending.is_some() || self.save.is_some() {
            ctx.request_repaint_after(Duration::from_millis(80));
        }
    }
    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        path: &str,
        editor: &mut DocumentEditorView,
    ) {
        if session.user.role != "ADMIN" {
            self.reset();
            ui.heading("Không đủ quyền");
            return;
        }
        self.poll(ctx, session, api, path);
        if self.editor_open {
            if ui.button("‹ Danh mục văn bản").clicked() {
                self.editor_open = false;
            }
            ui.weak("Bản soạn thảo được giữ trong phiên khi quay lại danh mục.");
            editor.render(ui, ctx, session, api);
            return;
        }
        if self.page == Page::Settings {
            self.render_settings(ui);
            return;
        }
        ui.add_enabled_ui(!self.create_open && self.selected.is_none(), |ui| {
            self.render_list(ui)
        });
        if self.create_open {
            self.render_create(ctx, session, api);
        }
        if let Some(record) = self.selected.clone() {
            let (_, close) = widgets::drawer(
                ctx,
                "documents.detail",
                self.page.title(),
                600.0,
                |ui| {
                    for (key, label, _) in self.page.fields() {
                        if *key == "rawActions" {
                            continue;
                        }
                        ui.strong(*label);
                        ui.add(egui::Label::new(present(text(&record, key))).wrap());
                        ui.add_space(8.0);
                    }
                    ui.weak("Thông tin người ký/độ mật là khai báo trong hồ sơ; chưa phải xác minh chữ ký số hay cấu hình phân quyền.");
                },
            );
            if close {
                self.selected = None;
            }
        }
    }
    fn render_list(&mut self, ui: &mut Ui) {
        ui.add_space(8.0);
        let labels = match self.page {
            Page::Notes => [
                "Tổng số chỉ đạo & biên bản họp",
                "Chỉ đạo khẩn cấp P1 & Ghim ưu tiên",
                "Chỉ đạo đã hoàn tất 100%",
                "Hành động giao việc (Action Items)",
            ],
            Page::Archives => [
                "Tổng văn bản vào sổ",
                "Văn bản đến",
                "Văn bản đi",
                "Văn bản đã giải quyết",
            ],
            Page::Templates => [
                "Tổng mẫu hợp đồng",
                "Mẫu đang áp dụng",
                "Mẫu cho nhân sự",
                "Mẫu cho doanh nghiệp",
            ],
            _ => [
                "Tổng số văn bản & quyết định",
                "Văn bản mật & Tuyệt mật (ISO)",
                "Hồ sơ có khai báo ký số",
                "Dự thảo đang thẩm định",
            ],
        };
        let counts = page_counts(self.page, &self.rows);
        let colors = [
            crate::theme::PRIMARY,
            Color32::from_rgb(220, 38, 38),
            Color32::from_rgb(22, 163, 74),
            Color32::from_rgb(217, 119, 6),
        ];
        let metrics = (0..4)
            .map(|i| Metric {
                label: labels[i],
                value: if self.loaded {
                    counts[i].to_string()
                } else {
                    "—".into()
                },
                detail: "Theo bản ghi đã lưu",
                color: colors[i],
                value_size: 24.0,
            })
            .collect::<Vec<_>>();
        widgets::metrics(ui, "documents.metrics", &metrics);
        ui.add_space(16.0);
        if !self.error.is_empty() {
            ui.colored_label(Color32::DARK_RED, &self.error);
        }
        if !self.notice.is_empty() {
            ui.colored_label(Color32::DARK_GREEN, &self.notice);
        }
        ui.horizontal_wrapped(|ui| {
            for (index, label) in self.page.tabs().iter().enumerate() {
                if ui
                    .add(egui::Button::new(*label).selected(self.tab == index))
                    .clicked()
                {
                    self.tab = index;
                    self.page_index = 0;
                }
            }
        });
        ui.add_space(10.0);
        ui.horizontal_wrapped(|ui| {
            let (rect, _) = ui.allocate_exact_size(
                egui::vec2(ui.available_width().min(280.0), 32.0),
                egui::Sense::hover(),
            );
            if widgets::search_input(
                ui,
                rect,
                &mut self.search,
                "Tìm số hiệu, trích yếu, người ký...",
            )
            .changed()
            {
                self.page_index = 0;
            }
            if self.page == Page::Library {
                ui.allocate_ui_with_layout(
                    egui::vec2(170.0, 32.0),
                    egui::Layout::top_down(egui::Align::Min),
                    |ui| {
                        widgets::combo_box("documents.security")
                            .width(170.0)
                            .selected_text(if self.security.is_empty() {
                                "Tất cả mức bảo mật"
                            } else {
                                &self.security
                            })
                            .show_ui(ui, |ui| {
                                for level in [
                                    "",
                                    "Tuyệt mật (BOD Only)",
                                    "Mật (Confidential)",
                                    "Nội bộ công ty",
                                    "Công khai",
                                ] {
                                    if ui
                                        .selectable_value(
                                            &mut self.security,
                                            level.into(),
                                            if level.is_empty() {
                                                "Tất cả mức bảo mật"
                                            } else {
                                                level
                                            },
                                        )
                                        .changed()
                                    {
                                        self.page_index = 0;
                                    }
                                }
                            });
                    },
                );
                if ui
                    .button("Soạn Word (.docx)")
                    .on_hover_text("Mở trình soạn thảo. Xuất tệp Word chưa được hỗ trợ.")
                    .clicked()
                {
                    self.editor_open = true;
                }
            }
            let create = ui.add_enabled(
                self.loaded && self.pending.is_none(),
                egui::Button::new(
                    RichText::new(format!("＋ {}", self.page.create_label())).color(Color32::WHITE),
                )
                .fill(crate::theme::PRIMARY),
            );
            crate::visual_test::record("documents.add", create.rect);
            if create.clicked() {
                self.begin_create();
            }
            if ui
                .add_enabled(self.pending.is_none(), egui::Button::new("Làm mới"))
                .clicked()
            {
                self.reload = true;
            }
            ui.add_enabled(false, egui::Button::new("Xuất Excel"))
                .on_disabled_hover_text("Chưa tích hợp xuất tệp thật.");
        });
        ui.add_space(12.0);
        if self.pending.is_some() {
            ui.spinner();
        }
        let visible = self
            .rows
            .iter()
            .filter(|r| row_matches(self.page, r, self.tab, &self.search, &self.security))
            .cloned()
            .collect::<Vec<_>>();
        self.page_size = self.page_size.max(1);
        self.page_index = self
            .page_index
            .min(visible.len().div_ceil(self.page_size).max(1) - 1);
        let shown = visible
            .iter()
            .skip(self.page_index * self.page_size)
            .take(self.page_size)
            .collect::<Vec<_>>();
        let headings = match self.page {
            Page::Notes => [
                "Mã & Trọng yếu",
                "Tiêu đề chỉ đạo & Nội dung tóm tắt",
                "Phân loại",
                "Tiến độ hoàn thành",
                "Người chỉ đạo & Hạn chót",
                "Thao tác",
            ],
            Page::Archives => [
                "Số vào sổ & Phân loại",
                "Số ký hiệu gốc & Ngày",
                "Cơ quan gửi / Nhận & Trích yếu",
                "Độ khẩn & Bảo mật",
                "Trạng thái & Hạn xử lý",
                "Thao tác",
            ],
            Page::Templates => [
                "Tên mẫu hợp đồng",
                "Phân loại",
                "Đối tượng",
                "Trường dữ liệu",
                "Trạng thái",
                "Thao tác",
            ],
            _ => [
                "Số / Ký hiệu văn bản",
                "Trích yếu nội dung & Từ khóa",
                "Phân loại",
                "Ngày ban hành & Hiệu lực",
                "Bảo mật & Trạng thái",
                "Thao tác",
            ],
        };
        let columns = headings
            .iter()
            .zip([190.0, 320.0, 170.0, 190.0, 210.0, 120.0])
            .map(|(title, width)| TableColumn { title, width })
            .collect::<Vec<_>>();
        widgets::table_with_row_height(
            ui,
            "documents.table",
            &columns,
            shown.len(),
            84.0,
            |ui, row, column| {
                let record = shown[row];
                if column == 5 {
                    if ui.button("Chi tiết").clicked() {
                        self.selected = Some(record.clone());
                    }
                    return;
                }
                for (i, key) in table_fields(self.page, column).iter().enumerate() {
                    let value = match *key {
                        "completionRate" => record
                            .get(key)
                            .and_then(Value::as_f64)
                            .map(|v| format!("{v}% (khai báo)"))
                            .unwrap_or_else(|| "—".into()),
                        "isActive" => match record.get(key).and_then(Value::as_bool) {
                            Some(true) => "Đang áp dụng".into(),
                            Some(false) => "Tạm dừng".into(),
                            None => "—".into(),
                        },
                        "fieldKeys" => record
                            .get(key)
                            .and_then(Value::as_array)
                            .map(|v| format!("{} trường", v.len()))
                            .unwrap_or_else(|| "—".into()),
                        _ => present(text(record, key)).to_owned(),
                    };
                    ui.add(
                        egui::Label::new(if i == 0 {
                            RichText::new(value).strong()
                        } else {
                            RichText::new(value).small()
                        })
                        .truncate(),
                    )
                    .on_hover_text(present(text(record, key)));
                }
            },
        );
        ui.add_space(10.0);
        widgets::pagination(
            ui,
            "documents.pagination",
            &mut self.page_index,
            visible.len(),
            &mut self.page_size,
        );
    }
    fn begin_create(&mut self) {
        self.draft.clear();
        self.form_error.clear();
        self.create_open = true;
        let defaults = match self.page {
            Page::Library => vec![
                ("direction", "Nội bộ ban hành"),
                ("docCategory", "Quy chế & Quyết định"),
                ("securityLevel", "Nội bộ công ty"),
                ("status", "Dự thảo thẩm định"),
            ],
            Page::Notes => vec![
                ("category", "Ý kiến chỉ đạo BGĐ"),
                ("priority", "Bình thường P3"),
            ],
            Page::Archives => vec![
                ("dispatchType", "Văn bản đến"),
                ("docType", "Công văn"),
                ("urgency", "Bình thường"),
                ("securityLevel", "Nội bộ"),
            ],
            Page::Templates => vec![("category", "labor"), ("partyType", "employee")],
            _ => vec![],
        };
        self.draft
            .extend(defaults.into_iter().map(|(k, v)| (k.into(), v.into())));
    }
    fn render_create(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let (mut submit, mut cancel) = (false, false);
        let (_, close) = widgets::modal(
            ctx,
            "documents.create",
            self.page.create_label(),
            750.0,
            self.save.is_some(),
            |ui| {
                if !self.form_error.is_empty() {
                    ui.colored_label(Color32::DARK_RED, &self.form_error);
                }
                for (key, label, required) in self.page.fields() {
                    let value = self.draft.entry((*key).into()).or_default();
                    let options = field_options(self.page, key);
                    if !options.is_empty() {
                        widgets::form_select(
                            ui,
                            &format!("documents.{key}"),
                            label,
                            *required,
                            value,
                            options,
                        );
                    } else if is_date(key) {
                        widgets::form_date(
                            ui,
                            &format!("documents.{key}"),
                            label,
                            *required,
                            value,
                        );
                    } else if matches!(*key, "summary" | "content" | "subject" | "rawActions") {
                        widgets::form_textarea(
                            ui,
                            &format!("documents.{key}"),
                            label,
                            *required,
                            value,
                            "Nhập nội dung...",
                            3,
                        );
                    } else {
                        widgets::form_input(
                            ui,
                            &format!("documents.{key}"),
                            label,
                            *required,
                            value,
                            "Nhập thông tin...",
                            false,
                        );
                    }
                }
                ui.weak("Lưu thông tin hồ sơ. Chưa tải tệp lên hoặc ký/xác minh chữ ký số trong biểu mẫu này.");
                widgets::action_row(ui, |ui| {
                    submit = ui
                        .add(
                            egui::Button::new(RichText::new("Lưu hồ sơ").color(Color32::WHITE))
                                .fill(crate::theme::PRIMARY),
                        )
                        .clicked();
                    cancel = ui.button("Hủy").clicked();
                });
            },
        );
        if (close || cancel) && self.save.is_none() {
            self.create_open = false;
        }
        if submit && self.save.is_none() {
            match draft_record(self.page, &self.draft) {
                Ok(record) => {
                    self.save = Some(api.create_generic_collection_record_task(
                        session,
                        self.page.scope(),
                        &record,
                        (!self.revision.is_empty()).then_some(self.revision.as_str()),
                    ))
                }
                Err(error) => self.form_error = error,
            }
        }
    }
    fn render_settings(&mut self, ui: &mut Ui) {
        ui.add_space(8.0);
        let metrics = [
            "Quy tắc sinh số ký hiệu (NĐ 30)",
            "Chứng thư số CA & Con dấu mộc",
            "Chính sách bảo mật tài liệu ISO",
            "Máy chủ đóng dấu thời gian (TSA)",
        ]
        .iter()
        .map(|label| Metric {
            label,
            value: "Chưa kết nối".into(),
            detail: "Chưa có cấu hình được xác nhận",
            color: crate::theme::PRIMARY,
            value_size: 22.0,
        })
        .collect::<Vec<_>>();
        widgets::metrics(ui, "documents.settings.metrics", &metrics);
        ui.add_space(16.0);
        ui.horizontal_wrapped(|ui| {
            for (i, label) in self.page.tabs().iter().enumerate() {
                ui.selectable_value(&mut self.tab, i, *label);
            }
        });
        ui.add_space(16.0);
        ui.heading(self.page.tabs()[self.tab]);
        ui.label("Chưa có dịch vụ đọc/lưu cấu hình văn thư và chính sách chứng thư được kết nối.");
        ui.add_enabled(false, egui::Button::new("Lưu cấu hình"));
    }
}

fn text<'a>(record: &'a Value, key: &str) -> &'a str {
    record.get(key).and_then(Value::as_str).unwrap_or_default()
}
fn present(value: &str) -> &str {
    if value.trim().is_empty() {
        "—"
    } else {
        value
    }
}
fn is_date(key: &str) -> bool {
    matches!(
        key,
        "issuedDate"
            | "effectiveDate"
            | "expirationDate"
            | "deadline"
            | "docDate"
            | "dateReceivedOrIssued"
            | "slaDeadline"
    )
}
fn field_options(page: Page, key: &str) -> &'static [&'static str] {
    match (page, key) {
        (Page::Library, "docCategory") => &Page::Library.tabs()[1..],
        (Page::Library, "direction") => &["Nội bộ ban hành", "Văn bản đến", "Văn bản đi"],
        (Page::Library, "securityLevel") => &[
            "Công khai",
            "Nội bộ công ty",
            "Mật (Confidential)",
            "Tuyệt mật (BOD Only)",
        ],
        (Page::Library, "status") => &[
            "Đang hiệu lực",
            "Mới ban hành",
            "Dự thảo thẩm định",
            "Hết hiệu lực / Lưu kho",
        ],
        (Page::Notes, "category") => &Page::Notes.tabs()[2..],
        (Page::Notes, "priority") => &["Khẩn cấp P1", "Ưu tiên cao P2", "Bình thường P3"],
        (Page::Archives, "dispatchType") => &["Văn bản đến", "Văn bản đi"],
        (Page::Archives, "docType") => &[
            "Công văn",
            "Quyết định",
            "Thông báo",
            "Tờ trình",
            "Hợp đồng",
            "Giấy mời",
        ],
        (Page::Archives, "urgency") => &["Hỏa tốc", "Thượng khẩn", "Bình thường"],
        (Page::Archives, "securityLevel") => &["Tuyệt mật", "Mật", "Nội bộ", "Thường"],
        (Page::Archives, "status") => &[
            "Đã giải quyết xong",
            "Đang xử lý đúng hạn",
            "Cảnh báo quá hạn",
            "Đã chuyển phát bưu điện",
        ],
        (Page::Templates, "category") => &[
            "partner",
            "service",
            "nda",
            "consultant",
            "equity",
            "labor",
            "custom",
        ],
        (Page::Templates, "partyType") => &["employee", "individual", "organization"],
        _ => &[],
    }
}
fn table_fields(page: Page, col: usize) -> &'static [&'static str] {
    match page {
        Page::Notes => [
            &["noteCode", "priority"][..],
            &["title", "content"],
            &["category", "assignedToDept"],
            &["completionRate", "status"],
            &["author", "deadline"],
        ][col],
        Page::Archives => [
            &["bookNumber", "dispatchType"][..],
            &["originalCode", "docDate"],
            &["partner", "subject"],
            &["urgency", "securityLevel"],
            &["status", "slaDeadline"],
        ][col],
        Page::Templates => [
            &["name"][..],
            &["category"],
            &["partyType"],
            &["fieldKeys"],
            &["isActive"],
        ][col],
        _ => [
            &["docCode", "direction"][..],
            &["title", "issuingAuthority"],
            &["docCategory"],
            &["issuedDate", "effectiveDate"],
            &["securityLevel", "status"],
        ][col],
    }
}
fn row_matches(page: Page, row: &Value, tab: usize, search: &str, security: &str) -> bool {
    let category = page.tabs().get(tab).copied().unwrap_or("Tất cả");
    let matches = tab == 0
        || match page {
            Page::Library => text(row, "docCategory") == category,
            Page::Notes if tab == 1 => row.get("isPinned").and_then(Value::as_bool) == Some(true),
            Page::Notes => text(row, "category") == category,
            Page::Archives => text(row, "dispatchType") == category,
            Page::Templates => row.get("isActive").and_then(Value::as_bool) == Some(tab == 1),
            _ => true,
        };
    let needle = search.trim().to_lowercase();
    matches
        && (security.is_empty() || text(row, "securityLevel") == security)
        && (needle.is_empty()
            || row.as_object().is_some_and(|f| {
                f.values().any(|v| {
                    v.as_str()
                        .is_some_and(|s| s.to_lowercase().contains(&needle))
                        || v.as_array().is_some_and(|items| {
                            items.iter().any(|item| {
                                item.as_str()
                                    .is_some_and(|s| s.to_lowercase().contains(&needle))
                            })
                        })
                })
            }))
}
fn page_counts(page: Page, rows: &[Value]) -> [usize; 4] {
    let count = |key: &str, value: &str| rows.iter().filter(|r| text(r, key) == value).count();
    match page {
        Page::Notes => [
            rows.len(),
            rows.iter()
                .filter(|r| {
                    r.get("isPinned").and_then(Value::as_bool) == Some(true)
                        || text(r, "priority") == "Khẩn cấp P1"
                })
                .count(),
            count("status", "Đã hoàn thành"),
            rows.iter()
                .filter_map(|r| r.get("actionItems").and_then(Value::as_array))
                .map(Vec::len)
                .sum(),
        ],
        Page::Archives => [
            rows.len(),
            count("dispatchType", "Văn bản đến"),
            count("dispatchType", "Văn bản đi"),
            count("status", "Đã giải quyết xong"),
        ],
        Page::Templates => [
            rows.len(),
            rows.iter()
                .filter(|r| r.get("isActive").and_then(Value::as_bool) == Some(true))
                .count(),
            count("partyType", "employee"),
            count("partyType", "organization"),
        ],
        _ => [
            rows.len(),
            rows.iter()
                .filter(|r| text(r, "securityLevel").to_lowercase().contains("mật"))
                .count(),
            rows.iter()
                .filter(|r| r.get("caSigned").and_then(Value::as_bool) == Some(true))
                .count(),
            count("status", "Dự thảo thẩm định"),
        ],
    }
}
fn draft_record(page: Page, draft: &BTreeMap<String, String>) -> Result<Value, String> {
    let mut record = serde_json::Map::new();
    for (key, label, required) in page.fields() {
        let value = draft
            .get(*key)
            .map(String::as_str)
            .unwrap_or_default()
            .trim();
        if *required && value.is_empty() {
            return Err(format!("{label} là bắt buộc."));
        }
        if value.chars().count()
            > if matches!(*key, "content" | "summary" | "rawActions") {
                20000
            } else {
                2000
            }
        {
            return Err(format!("{label} vượt quá độ dài cho phép."));
        }
        if is_date(key)
            && !value.is_empty()
            && (value.len() != 10 || chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d").is_err())
        {
            return Err(format!("{label} cần ngày YYYY-MM-DD hợp lệ."));
        }
        let options = field_options(page, key);
        if !value.is_empty() && !options.is_empty() && !options.contains(&value) {
            return Err(format!("{label} không nằm trong danh mục cho phép."));
        }
        record.insert((*key).into(), json!(value));
    }
    let key = format!("DOC-{}", chrono::Utc::now().timestamp_micros());
    record.insert("key".into(), json!(key));
    if page == Page::Templates {
        record.insert("id".into(), json!(key));
        record.insert("isActive".into(), json!(true));
        record.insert("fieldKeys".into(), json!([]));
        record.insert("customFields".into(), json!([]));
        record.insert("updatedAt".into(), json!(chrono::Utc::now().to_rfc3339()));
    }
    if page == Page::Notes {
        let actions = draft
            .get("rawActions")
            .map(String::as_str)
            .unwrap_or_default()
            .lines()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .enumerate()
            .map(|(i, line)| json!({"id":i+1,"text":line,"done":false}))
            .collect::<Vec<_>>();
        record.remove("rawActions");
        record.insert("actionItems".into(), json!(actions));
        record.insert("isPinned".into(), json!(false));
        record.insert("completionRate".into(), json!(0));
        record.insert("status".into(), json!("Đang thực hiện"));
        record.insert(
            "createdDate".into(),
            json!(chrono::Utc::now().format("%Y-%m-%d").to_string()),
        );
    }
    Ok(Value::Object(record))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn distinct_document_routes_use_distinct_collections() {
        for (path, scope) in [
            ("/admin/documents/list", "enterprise_documents"),
            ("/admin/documents/notes", "doc_notes"),
            ("/admin/documents/archives", "doc_archives"),
            (
                "/admin/documents/settings/contract-templates",
                "contract_templates",
            ),
        ] {
            assert_eq!(Page::from_route(path).scope(), scope);
        }
    }
    #[test]
    fn filters_respect_category_security_and_pinned_state() {
        let row = json!({"title":"Thông báo nội bộ","docCategory":"Thông báo nội bộ","securityLevel":"Mật (Confidential)","isPinned":false});
        assert!(row_matches(
            Page::Library,
            &row,
            3,
            "THÔNG BÁO",
            "Mật (Confidential)"
        ));
        assert!(!row_matches(Page::Library, &row, 1, "", ""));
        assert!(!row_matches(Page::Library, &row, 0, "", "Công khai"));
        assert!(!row_matches(Page::Notes, &row, 1, "", ""));
    }
    #[test]
    fn metadata_does_not_fabricate_a_file_or_signature() {
        let mut draft = BTreeMap::new();
        for (key, _, required) in Page::Library.fields() {
            if *required {
                draft.insert(
                    (*key).into(),
                    if is_date(key) {
                        "2026-10-25".into()
                    } else if let Some(option) = field_options(Page::Library, key).first() {
                        (*option).into()
                    } else {
                        "Thông tin khai báo".into()
                    },
                );
            }
        }
        let row = draft_record(Page::Library, &draft).unwrap();
        for key in ["caSigned", "sha256Hash", "fileSize"] {
            assert!(row.get(key).is_none());
        }
        draft.insert("issuedDate".into(), "2026-02-30".into());
        assert!(draft_record(Page::Library, &draft).is_err());
    }
    #[test]
    fn archive_forms_preserve_book_number_and_reject_unknown_choices() {
        let mut draft = BTreeMap::new();
        for (key, _, required) in Page::Archives.fields() {
            if *required {
                let value = if is_date(key) {
                    "2026-10-25"
                } else {
                    field_options(Page::Archives, key)
                        .first()
                        .copied()
                        .unwrap_or("Khai báo")
                };
                draft.insert((*key).into(), value.into());
            }
        }
        draft.insert("bookNumber".into(), "CV-DEN-017".into());
        let record = draft_record(Page::Archives, &draft).unwrap();
        assert_eq!(record["bookNumber"], "CV-DEN-017");
        assert!(record.get("digitalVerified").is_none());
        assert_eq!(table_fields(Page::Archives, 0)[0], "bookNumber");
        draft.insert("dispatchType".into(), "không có trong danh mục".into());
        assert!(draft_record(Page::Archives, &draft).is_err());
        draft.insert("dispatchType".into(), "Văn bản đến".into());
        draft.insert("docDate".into(), "2026-1-1".into());
        assert!(draft_record(Page::Archives, &draft).is_err());
        let tagged = json!({"tags":["Hạ tầng"], "title":"Quyết định"});
        assert!(row_matches(Page::Library, &tagged, 0, "HẠ TẦNG", ""));
    }
    #[test]
    fn lists_keep_long_metadata_inside_narrow_windows() {
        for page in [
            Page::Library,
            Page::Notes,
            Page::Archives,
            Page::Templates,
            Page::Settings,
        ] {
            for width in [320.0, 390.0, 768.0, 1440.0] {
                let ctx = egui::Context::default();
                crate::native_text::setup_fonts(&ctx);
                crate::native_text::setup_style(&ctx);
                let long = "Văn bản có nội dung dài ".repeat(20);
                let mut row = serde_json::Map::new();
                for (key, _, _) in page.fields() {
                    row.insert((*key).into(), json!(long));
                }
                let mut view = EnterpriseDocumentsView {
                    page,
                    loaded: true,
                    rows: vec![Value::Object(row)],
                    page_size: 8,
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
                            if page == Page::Settings {
                                view.render_settings(ui)
                            } else {
                                view.render_list(ui)
                            }
                            assert!(
                                ui.min_rect().right() <= right + 1.0,
                                "{page:?} overflow at {width}"
                            );
                        });
                    },
                );
            }
        }
    }
}
