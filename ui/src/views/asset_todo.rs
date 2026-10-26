//! Asset work orders from legacy/web/src/modules/assets/AssetTodoModule.tsx.
use std::time::Duration;

use chrono::{NaiveDateTime, Utc};
use egui::{Color32, RichText, Ui};
use serde_json::{Value, json};

use crate::{
    api::{ApiClient, ApiTask, GenericCollectionResponse, GenericRecordResponse},
    models::Session,
    widgets::{self, Metric, TableColumn},
};

const SCOPE: &str = "asset_todos";
const STATUSES: &[&str] = &[
    "Chờ xử lý",
    "Đang thực hiện",
    "Chờ phê duyệt cấp trên",
    "Đã hoàn thành",
];
const PRIORITIES: &[&str] = &["Khẩn cấp (P1)", "Cao (P2)", "Trung bình (P3)", "Thấp (P4)"];
const CATEGORIES: &[&str] = &[
    "Cấp phát / Bàn giao",
    "Thu hồi tài sản",
    "Bảo dưỡng / Kiểm định",
    "Sửa chữa & Thay thế",
    "Kiểm kê đối soát",
    "Thanh lý & Tiêu hủy",
    "Đề xuất mua sắm",
];
const CHECKLIST: &[&str] = &[
    "Tiếp nhận thông tin và kiểm tra hiện trạng thiết bị",
    "Thực hiện thao tác kỹ thuật theo quy trình chuẩn",
    "Lập biên bản / Hồ sơ bàn giao xác nhận",
];

#[derive(Default)]
struct Filters {
    search: String,
    status: String,
    priority: String,
    category: String,
}

impl Filters {
    fn matches(&self, record: &Value) -> bool {
        let query = self.search.trim().to_lowercase();
        [
            "taskCode",
            "taskTitle",
            "assignedStaff",
            "requester",
            "relatedAssetCode",
            "location",
        ]
        .iter()
        .any(|field| text(record, field).to_lowercase().contains(&query))
            && (self.status.is_empty() || text(record, "status") == self.status)
            && (self.priority.is_empty() || text(record, "priority") == self.priority)
            && (self.category.is_empty() || text(record, "taskCategory") == self.category)
    }
}

#[derive(Default, Debug, PartialEq)]
struct TaskMetrics {
    pending: usize,
    in_progress: usize,
    urgent: usize,
    completed: usize,
    reported_hours_mean: Option<f64>,
}

fn metrics(records: &[Value]) -> TaskMetrics {
    let mut result = TaskMetrics::default();
    let mut hours = Vec::new();
    for record in records {
        let status = text(record, "status");
        result.pending += usize::from(status == STATUSES[0]);
        result.in_progress += usize::from(status == STATUSES[1]);
        result.urgent +=
            usize::from(text(record, "priority") == PRIORITIES[0] && status != STATUSES[3]);
        if status == STATUSES[3] {
            result.completed += 1;
            if let Some(value) = record
                .get("actualHours")
                .and_then(Value::as_f64)
                .filter(|value| value.is_finite() && *value > 0.0)
            {
                hours.push(value);
            }
        }
    }
    if !hours.is_empty() {
        let count = hours.len() as f64;
        result.reported_hours_mean = Some(hours.iter().map(|hours| hours / count).sum());
    }
    result
}

#[derive(Default)]
struct CreateDraft {
    key: String,
    code: String,
    title: String,
    category: String,
    priority: String,
    requester: String,
    assigned: String,
    asset_code: String,
    location: String,
    deadline: String,
    estimated_hours: String,
    notes: String,
}

impl CreateDraft {
    fn new(requester: &str) -> Self {
        Self {
            key: format!("asset-todo-{}", Utc::now().timestamp_micros()),
            category: CATEGORIES[0].into(),
            priority: PRIORITIES[1].into(),
            requester: requester.into(),
            estimated_hours: "2".into(),
            ..Default::default()
        }
    }

    fn record(&self, existing: &[Value]) -> Result<Value, String> {
        for (value, label) in [
            (&self.code, "Mã công việc"),
            (&self.title, "Tiêu đề nhiệm vụ"),
            (&self.requester, "Người yêu cầu"),
            (&self.assigned, "Cán bộ phụ trách"),
            (&self.location, "Vị trí thực hiện"),
            (&self.deadline, "Hạn hoàn thành"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{label} không được để trống."));
            }
        }
        if self.key.is_empty() || self.code.len() > 160 || self.title.len() > 2_000 {
            return Err("Mã công việc hoặc tiêu đề không hợp lệ / quá dài.".into());
        }
        if !CATEGORIES.contains(&self.category.as_str())
            || !PRIORITIES.contains(&self.priority.as_str())
        {
            return Err("Phân nhóm hoặc mức ưu tiên không hợp lệ.".into());
        }
        if existing.iter().any(|record| {
            text(record, "taskCode").trim().to_lowercase() == self.code.trim().to_lowercase()
        }) {
            return Err("Mã công việc đã có trong danh sách. Hãy chọn mã khác.".into());
        }
        let deadline = self.deadline.trim();
        let parsed = NaiveDateTime::parse_from_str(deadline, "%Y-%m-%d %H:%M")
            .map_err(|_| "Hạn hoàn thành phải là ngày giờ hợp lệ theo dạng YYYY-MM-DD HH:MM.")?;
        if parsed.format("%Y-%m-%d %H:%M").to_string() != deadline {
            return Err("Hạn hoàn thành phải theo dạng YYYY-MM-DD HH:MM.".into());
        }
        let estimated_hours = if self.estimated_hours.trim().is_empty() {
            None
        } else {
            Some(parse_hours(&self.estimated_hours)?)
        };
        let mut record = json!({
            "key": self.key, "taskCode": self.code.trim(), "taskTitle": self.title.trim(),
            "taskCategory": self.category, "priority": self.priority, "deadline": deadline,
            "assignedStaff": self.assigned.trim(), "requester": self.requester.trim(),
            "relatedAssetCode": self.asset_code.trim(), "location": self.location.trim(),
            "status": STATUSES[0], "notes": self.notes.trim(),
            "checklist": CHECKLIST.iter().map(|item| json!({"item": item, "done": false})).collect::<Vec<_>>()
        });
        if let Some(hours) = estimated_hours {
            record["estimatedHours"] = json!(hours);
        }
        Ok(record)
    }
}

fn parse_hours(value: &str) -> Result<f64, String> {
    value.trim().parse::<f64>().ok().filter(|value| value.is_finite() && *value >= 0.5 && *value <= 1_000_000.0)
        .ok_or_else(|| "Số giờ phải nằm trong khoảng 0,5 đến 1.000.000 và là số hữu hạn (dùng dấu chấm thập phân).".into())
}

fn checklist(record: &Value) -> Result<Option<&Vec<Value>>, String> {
    let Some(value) = record.get("checklist") else {
        return Ok(None);
    };
    let items = value
        .as_array()
        .ok_or("Checklist trên máy chủ không hợp lệ; chưa thể chỉnh sửa.")?;
    if items.iter().any(|item| {
        item.get("item").and_then(Value::as_str).is_none()
            || item.get("done").and_then(Value::as_bool).is_none()
    }) {
        return Err("Checklist trên máy chủ không hợp lệ; chưa thể chỉnh sửa.".into());
    }
    Ok(Some(items))
}

fn checklist_progress(record: &Value) -> Option<(usize, usize)> {
    checklist(record).ok().flatten().map(|items| {
        (
            items.iter().filter(|item| item["done"] == true).count(),
            items.len(),
        )
    })
}

fn checklist_patch(record: &Value, index: usize, done: bool) -> Result<Value, String> {
    if text(record, "status") == STATUSES[3] {
        return Err("Nhiệm vụ đã nghiệm thu hoàn tất.".into());
    }
    let mut items = checklist(record)?
        .ok_or("Nhiệm vụ chưa có checklist.")?
        .clone();
    let item = items
        .get_mut(index)
        .ok_or("Bước checklist không còn tồn tại.")?;
    item["done"] = json!(done);
    Ok(json!({"checklist": items}))
}

fn completion_patch(record: &Value, hours: &str, resolution: &str) -> Result<Value, String> {
    if text(record, "status") == STATUSES[3] {
        return Err("Nhiệm vụ đã nghiệm thu hoàn tất.".into());
    }
    let hours = parse_hours(hours)?;
    if resolution.trim().is_empty() {
        return Err("Vui lòng nhập kết quả xử lý thực tế.".into());
    }
    let mut patch =
        json!({"status": STATUSES[3], "actualHours": hours, "resolutionResult": resolution.trim()});
    if let Some(items) = checklist(record)? {
        let mut items = items.clone();
        for item in &mut items {
            item["done"] = json!(true);
        }
        patch["checklist"] = json!(items);
    }
    Ok(patch)
}

struct Mutation {
    key: String,
    created: bool,
    expected: Value,
    task: ApiTask<GenericRecordResponse>,
}

enum Action {
    Detail(String),
    Complete(String),
    Check(String, usize, bool),
}

#[derive(Default)]
pub struct AssetTodoView {
    identity: Option<(String, String, String)>,
    records: Vec<Value>,
    revision: String,
    loaded: bool,
    pending_load: Option<ApiTask<GenericCollectionResponse>>,
    mutation: Option<Mutation>,
    needs_reload: bool,
    filters: Filters,
    kanban: bool,
    page: usize,
    page_size: usize,
    detail_key: Option<String>,
    create_open: bool,
    draft: CreateDraft,
    complete_key: Option<String>,
    actual_hours: String,
    resolution: String,
    error: String,
    form_error: String,
    notice: String,
}

impl AssetTodoView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn busy(&self) -> bool {
        self.pending_load.is_some() || self.mutation.is_some()
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.needs_reload && !self.busy() {
            self.pending_load = Some(api.list_generic_collection_task(session, SCOPE));
            self.needs_reload = false;
            self.error.clear();
        }
        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            match result {
                Ok(response) => {
                    if response.data.iter().any(|record| !record.is_object()) {
                        self.error = "Danh sách có dữ liệu không hợp lệ; chưa thay thế dữ liệu đang hiển thị.".into();
                    } else {
                        self.records = response.data;
                        self.revision = response.revision;
                        self.loaded = true;
                        self.error.clear();
                    }
                }
                Err(error) => self.error = error,
            }
        }
        let result = self
            .mutation
            .as_ref()
            .and_then(|mutation| ApiClient::poll(&mutation.task));
        if let Some(result) = result {
            let mutation = self.mutation.take().unwrap();
            match result {
                Ok(response)
                    if acknowledged(&response.record, &mutation.key, &mutation.expected) =>
                {
                    if let Some(record) = self
                        .records
                        .iter_mut()
                        .find(|record| record_key(record) == Some(mutation.key.as_str()))
                    {
                        *record = response.record;
                    } else {
                        self.records.insert(0, response.record);
                    }
                    self.revision = response.revision;
                    self.notice = if mutation.created {
                        "Đã tạo nhiệm vụ trên máy chủ."
                    } else {
                        "Đã lưu cập nhật nhiệm vụ trên máy chủ."
                    }
                    .into();
                    if mutation.created {
                        self.create_open = false;
                        self.draft = CreateDraft::default();
                    }
                    self.complete_key = None;
                    self.error.clear();
                    self.form_error.clear();
                }
                Ok(_) => {
                    self.form_error =
                        "Phản hồi máy chủ chưa xác nhận nội dung đã lưu. Hãy tải lại để kiểm tra."
                            .into()
                }
                Err(error) => self.form_error = error,
            }
        }
        if self.busy() || self.needs_reload {
            ctx.request_repaint_after(Duration::from_millis(100));
        }
    }

    fn submit(
        &mut self,
        session: &Session,
        api: &ApiClient,
        key: String,
        expected: Value,
        created: bool,
    ) {
        if self.busy() || !self.loaded || session.user.role != "ADMIN" {
            return;
        }
        let revision = (!self.revision.is_empty()).then_some(self.revision.as_str());
        // shortcut: asset_todos has no server revision guard; use a typed versioned API for concurrent-edit guarantees.
        let task = if created {
            api.create_generic_collection_record_task(session, SCOPE, &expected, revision)
        } else {
            api.patch_generic_collection_record_task(session, SCOPE, &key, &expected, revision)
        };
        self.mutation = Some(Mutation {
            key,
            expected,
            created,
            task,
        });
        self.notice.clear();
        self.form_error.clear();
    }

    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            self.reset();
            ui.heading("Không đủ quyền");
            ui.add(egui::Label::new("Chỉ quản trị viên được quản lý nhiệm vụ tài sản.").wrap());
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
            self.needs_reload = true;
            self.page_size = 8;
        }
        self.poll(ctx, session, api);
        if widgets::page_header(
            ui,
            "asset-todo",
            "Nhiệm vụ quản trị tài sản",
            "Theo dõi yêu cầu, checklist và kết quả xử lý",
            !self.busy() && !self.create_open && self.complete_key.is_none(),
        ) {
            self.needs_reload = true;
            ctx.request_repaint();
        }
        ui.add_space(12.0);
        let height = (ui.clip_rect().bottom() - ui.cursor().top() - 2.0).max(80.0);
        let mut action = None;
        egui::ScrollArea::vertical().id_salt("asset-todo.body").max_height(height).auto_shrink([false, false]).show(ui, |ui| {
            ui.style_mut().wrap_mode = Some(egui::TextWrapMode::Wrap);
            if !self.error.is_empty() { ui.colored_label(ui.visuals().error_fg_color, &self.error); if self.loaded { ui.weak("Dữ liệu của lần tải trước vẫn được giữ."); } }
            if !self.notice.is_empty() { ui.label(&self.notice); }
            if !self.form_error.is_empty() && !self.create_open && self.complete_key.is_none() { ui.colored_label(ui.visuals().error_fg_color, &self.form_error); }
            self.render_metrics(ui);
            ui.add_space(12.0);
            self.render_filters(ui);
            ui.horizontal_wrapped(|ui| {
                ui.selectable_value(&mut self.kanban, false, "Danh sách");
                ui.selectable_value(&mut self.kanban, true, "Kanban");
                ui.add_enabled(false, egui::Button::new("Xuất Excel")).on_disabled_hover_text("Xuất báo cáo nhiệm vụ chưa được hỗ trợ.");
                if ui.add_enabled(self.loaded && !self.busy() && !self.create_open && self.complete_key.is_none(), egui::Button::new("＋ Tạo nhiệm vụ mới")).clicked() {
                    self.draft = CreateDraft::new(&session.user.name); self.create_open = true; self.detail_key = None; self.form_error.clear();
                }
            });
            ui.weak("SLA chỉ hiển thị theo thông tin đã lưu; xuất Excel và in PDF chưa được hỗ trợ.");
            if self.pending_load.is_some() { ui.horizontal(|ui| { ui.spinner(); ui.label("Đang tải nhiệm vụ tài sản…"); }); }
            if self.mutation.is_some() { ui.horizontal(|ui| { ui.spinner(); ui.label("Đang lưu thay đổi…"); }); }
            if !self.loaded { ui.label("Chưa có dữ liệu nhiệm vụ từ máy chủ. Chọn Làm mới để thử lại nếu tải thất bại."); return; }
            if self.kanban { action = self.render_kanban(ui); } else { action = self.render_table(ui); }
        });
        if let Some(action) = action {
            self.act(action, session, api);
        }
        self.render_detail(ctx, session, api);
        self.render_create(ctx, session, api);
        self.render_complete(ctx, session, api);
    }

    fn render_metrics(&self, ui: &mut Ui) {
        let values = metrics(&self.records);
        let count = |value: usize| {
            if self.loaded {
                value.to_string()
            } else {
                "—".into()
            }
        };
        widgets::metrics(
            ui,
            "asset-todo.metrics",
            &[
                Metric {
                    label: "Việc đang chờ tiếp nhận",
                    value: count(values.pending),
                    detail: &format!("{} việc đang thực hiện", count(values.in_progress)),
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 22.0,
                },
                Metric {
                    label: "Khẩn cấp P1 chưa hoàn tất",
                    value: count(values.urgent),
                    detail: "Không suy ra hạn SLA từ mức ưu tiên",
                    color: Color32::from_rgb(220, 38, 38),
                    value_size: 22.0,
                },
                Metric {
                    label: "Tỷ lệ hoàn thành đúng hạn SLA",
                    value: "—".into(),
                    detail: &format!(
                        "{} việc hoàn tất; chưa đủ mốc thời gian để tính SLA",
                        count(values.completed)
                    ),
                    color: crate::theme::PRIMARY,
                    value_size: 22.0,
                },
                Metric {
                    label: "Thời gian xử lý trung bình",
                    value: values
                        .reported_hours_mean
                        .map_or("—".into(), |hours| format!("{hours:.2} giờ")),
                    detail: "Bình quân số giờ thực tế đã ghi ở việc hoàn tất",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 22.0,
                },
            ],
        );
    }

    fn render_filters(&mut self, ui: &mut Ui) {
        let mut changed = ui
            .add(
                egui::TextEdit::singleline(&mut self.filters.search)
                    .hint_text("Tìm mã việc, tên, phụ trách, tài sản…")
                    .desired_width(360.0_f32.min(ui.available_width())),
            )
            .changed();
        let column_count = if ui.available_width() >= 760.0 { 3 } else { 1 };
        ui.columns(column_count, |columns| {
            for (index, (id, label, value, options)) in [
                (
                    "status",
                    "Tất cả trạng thái",
                    &mut self.filters.status,
                    STATUSES,
                ),
                (
                    "priority",
                    "Tất cả mức ưu tiên",
                    &mut self.filters.priority,
                    PRIORITIES,
                ),
                (
                    "category",
                    "Tất cả nhóm công việc",
                    &mut self.filters.category,
                    CATEGORIES,
                ),
            ]
            .into_iter()
            .enumerate()
            {
                let ui = &mut columns[index % column_count];
                widgets::combo_box(("asset-todo.filter", id))
                    .width(ui.available_width().min(280.0))
                    .selected_text(if value.is_empty() {
                        label
                    } else {
                        value.as_str()
                    })
                    .show_ui(ui, |ui| {
                        changed |= ui.selectable_value(value, String::new(), label).changed();
                        for option in options {
                            changed |= ui
                                .selectable_value(value, (*option).into(), *option)
                                .changed();
                        }
                    });
            }
        });
        if ui.button("Xóa bộ lọc").clicked() {
            self.filters = Filters::default();
            changed = true;
        }
        if changed {
            self.page = 0;
        }
    }

    fn render_table(&mut self, ui: &mut Ui) -> Option<Action> {
        let rows: Vec<_> = self
            .records
            .iter()
            .filter(|record| self.filters.matches(record))
            .collect();
        let size = self.page_size.max(1);
        self.page = self.page.min(rows.len().div_ceil(size).saturating_sub(1));
        let start = self.page * size;
        let shown = &rows[start..(start + size).min(rows.len())];
        let mut action = None;
        widgets::table_with_row_height(
            ui,
            "asset-todo.table",
            &[
                TableColumn {
                    title: "Mã việc & Ưu tiên",
                    width: 180.0,
                },
                TableColumn {
                    title: "Nhiệm vụ & Tài sản liên kết",
                    width: 350.0,
                },
                TableColumn {
                    title: "Hạn chót & SLA",
                    width: 210.0,
                },
                TableColumn {
                    title: "Phụ trách & Tiến độ",
                    width: 200.0,
                },
                TableColumn {
                    title: "Trạng thái",
                    width: 180.0,
                },
                TableColumn {
                    title: "Thao tác",
                    width: 170.0,
                },
            ],
            shown.len(),
            100.0,
            |ui, row, col| {
                let record = shown[row];
                match col {
                    0 => {
                        clipped(ui, text(record, "taskCode"), true);
                        ui.colored_label(
                            priority_color(text(record, "priority")),
                            text(record, "priority"),
                        );
                    }
                    1 => {
                        clipped(ui, text(record, "taskTitle"), true);
                        clipped(
                            ui,
                            &format!(
                                "{} · {}",
                                text(record, "taskCategory"),
                                text(record, "location")
                            ),
                            false,
                        );
                        clipped(
                            ui,
                            &format!(
                                "Tài sản: {} · Yêu cầu: {}",
                                text(record, "relatedAssetCode"),
                                text(record, "requester")
                            ),
                            false,
                        );
                    }
                    2 => {
                        ui.label(text(record, "deadline"));
                        clipped(
                            ui,
                            &format!("SLA đã ghi: {}", text(record, "slaStatus")),
                            false,
                        );
                    }
                    3 => {
                        clipped(ui, text(record, "assignedStaff"), true);
                        render_progress(ui, record);
                    }
                    4 => {
                        ui.colored_label(
                            status_color(text(record, "status")),
                            text(record, "status"),
                        );
                    }
                    _ => {
                        let key = record_key(record);
                        if ui
                            .add_enabled(key.is_some(), egui::Button::new("Chi tiết").small())
                            .clicked()
                        {
                            action = key.map(|key| Action::Detail(key.into()));
                        }
                        if text(record, "status") != STATUSES[3] {
                            if ui
                                .add_enabled(
                                    key.is_some() && !self.busy(),
                                    egui::Button::new("Xong").small(),
                                )
                                .on_hover_text(
                                    "Nhập số giờ và kết quả nghiệm thu trước khi hoàn tất",
                                )
                                .clicked()
                            {
                                action = key.map(|key| Action::Complete(key.into()));
                            }
                        } else {
                            ui.small("Đã nghiệm thu");
                        }
                    }
                }
            },
        );
        if rows.is_empty() {
            ui.label(if self.records.is_empty() {
                "Chưa có nhiệm vụ. Tạo nhiệm vụ mới để bắt đầu."
            } else {
                "Không có nhiệm vụ phù hợp với bộ lọc."
            });
        }
        ui.small(format!(
            "{} / {} nhiệm vụ phù hợp",
            rows.len(),
            self.records.len()
        ));
        widgets::pagination(
            ui,
            "asset-todo.pagination",
            &mut self.page,
            rows.len(),
            &mut self.page_size,
        );
        action
    }

    fn render_kanban(&self, ui: &mut Ui) -> Option<Action> {
        let rows: Vec<_> = self
            .records
            .iter()
            .filter(|record| self.filters.matches(record))
            .collect();
        let mut statuses = STATUSES.to_vec();
        if rows
            .iter()
            .any(|record| !STATUSES.contains(&text(record, "status")))
        {
            statuses.push("Trạng thái khác");
        }
        let width = ((ui.available_width() - 42.0) / 4.0).max(250.0);
        let mut action = None;
        egui::ScrollArea::horizontal()
            .id_salt("asset-todo.kanban.horizontal")
            .show(ui, |ui| {
                ui.horizontal_top(|ui| {
                    for status in statuses {
                        let items: Vec<_> = rows
                            .iter()
                            .filter(|record| {
                                if status == "Trạng thái khác" {
                                    !STATUSES.contains(&text(record, "status"))
                                } else {
                                    text(record, "status") == status
                                }
                            })
                            .collect();
                        ui.allocate_ui_with_layout(
                            egui::vec2(width, 520.0),
                            egui::Layout::top_down(egui::Align::Min),
                            |ui| {
                                ui.group(|ui| {
                                    ui.set_width(width - 14.0);
                                    ui.colored_label(
                                        status_color(status),
                                        format!("{status} ({})", items.len()),
                                    );
                                    egui::ScrollArea::vertical()
                                        .id_salt(("asset-todo.kanban", status))
                                        .max_height(480.0)
                                        .auto_shrink([false, false])
                                        .show(ui, |ui| {
                                            if items.is_empty() {
                                                ui.weak("Chưa có nhiệm vụ trong cột này.");
                                            }
                                            for record in items {
                                                ui.group(|ui| {
                                                    ui.set_width(ui.available_width());
                                                    clipped(ui, text(record, "taskCode"), true);
                                                    ui.add(
                                                        egui::Label::new(
                                                            RichText::new(text(
                                                                record,
                                                                "taskTitle",
                                                            ))
                                                            .strong(),
                                                        )
                                                        .wrap(),
                                                    );
                                                    ui.colored_label(
                                                        priority_color(text(record, "priority")),
                                                        text(record, "priority"),
                                                    );
                                                    ui.label(format!(
                                                        "Hạn: {}",
                                                        text(record, "deadline")
                                                    ));
                                                    clipped(
                                                        ui,
                                                        text(record, "assignedStaff"),
                                                        false,
                                                    );
                                                    render_progress(ui, record);
                                                    if ui
                                                        .add_enabled(
                                                            record_key(record).is_some(),
                                                            egui::Button::new(
                                                                "Chi tiết & checklist",
                                                            ),
                                                        )
                                                        .clicked()
                                                    {
                                                        action = record_key(record)
                                                            .map(|key| Action::Detail(key.into()));
                                                    }
                                                });
                                            }
                                        });
                                });
                            },
                        );
                    }
                });
            });
        ui.small(format!(
            "{} nhiệm vụ phù hợp; cuộn ngang để xem các cột.",
            rows.len()
        ));
        action
    }

    fn act(&mut self, action: Action, session: &Session, api: &ApiClient) {
        match action {
            Action::Detail(key) => {
                self.detail_key = Some(key);
            }
            Action::Complete(key) if !self.busy() => {
                self.complete_key = Some(key);
                self.actual_hours.clear();
                self.resolution.clear();
                self.form_error.clear();
            }
            Action::Check(key, index, done) if !self.busy() => {
                let patch = self
                    .records
                    .iter()
                    .find(|record| record_key(record) == Some(key.as_str()))
                    .ok_or_else(|| "Không còn tìm thấy nhiệm vụ.".to_owned())
                    .and_then(|record| checklist_patch(record, index, done));
                match patch {
                    Ok(patch) => self.submit(session, api, key, patch, false),
                    Err(error) => self.form_error = error,
                }
            }
            _ => {}
        }
    }

    fn render_detail(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let Some(key) = self.detail_key.as_ref() else {
            return;
        };
        let record = self
            .records
            .iter()
            .find(|record| record_key(record) == Some(key.as_str()))
            .cloned();
        let mut action = None;
        let (_, closed) = widgets::drawer(
            ctx,
            "asset-todo.detail",
            "Chi tiết nhiệm vụ & Phiếu xử lý kỹ thuật",
            620.0,
            |ui| {
                let Some(record) = record.as_ref() else {
                    ui.label("Nhiệm vụ không còn trong danh sách đang tải.");
                    return;
                };
                ui.style_mut().wrap_mode = Some(egui::TextWrapMode::Wrap);
                ui.strong(text(record, "taskCode"));
                ui.add(egui::Label::new(RichText::new(text(record, "taskTitle")).heading()).wrap());
                for (label, field) in [
                    ("Phân loại", "taskCategory"),
                    ("Vị trí", "location"),
                    ("Ưu tiên", "priority"),
                    ("Trạng thái", "status"),
                    ("Hạn hoàn thành", "deadline"),
                    ("SLA đã ghi", "slaStatus"),
                    ("Cán bộ phụ trách", "assignedStaff"),
                    ("Mã tài sản liên quan", "relatedAssetCode"),
                    ("Người yêu cầu", "requester"),
                ] {
                    ui.add(egui::Label::new(format!("{label}: {}", text(record, field))).wrap());
                }
                for (label, field) in [
                    ("Giờ dự kiến", "estimatedHours"),
                    ("Giờ thực tế đã ghi", "actualHours"),
                ] {
                    ui.label(format!(
                        "{label}: {}",
                        record
                            .get(field)
                            .and_then(Value::as_f64)
                            .filter(|value| value.is_finite() && *value >= 0.0)
                            .map_or("Chưa ghi nhận".into(), |value| value.to_string())
                    ));
                }
                ui.separator();
                ui.strong("Checklist các bước thực hiện");
                match checklist(record) {
                    Ok(Some(items)) => {
                        if items.is_empty() {
                            ui.label("Nhiệm vụ chưa có bước checklist.");
                        }
                        for (index, item) in items.iter().enumerate() {
                            let mut done = item["done"].as_bool().unwrap_or(false);
                            if ui
                                .add_enabled(
                                    !self.busy()
                                        && text(record, "status") != STATUSES[3]
                                        && self.complete_key.is_none(),
                                    egui::Checkbox::new(&mut done, text(item, "item")),
                                )
                                .changed()
                            {
                                action = Some(Action::Check(key.clone(), index, done));
                            }
                        }
                    }
                    Ok(None) => {
                        ui.label("Nhiệm vụ chưa có checklist.");
                    }
                    Err(error) => {
                        ui.colored_label(ui.visuals().error_fg_color, error);
                    }
                }
                ui.weak("Đánh dấu checklist được lưu riêng; hoàn tất công việc cần xác nhận nghiệm thu.");
                ui.separator();
                ui.strong("Ghi chú công việc");
                ui.add(egui::Label::new(text(record, "notes")).wrap());
                if let Some(result) = record.get("resolutionResult").and_then(Value::as_str) {
                    ui.strong("Kết quả xử lý");
                    ui.add(egui::Label::new(result).wrap());
                }
                if !self.form_error.is_empty() {
                    ui.colored_label(ui.visuals().error_fg_color, &self.form_error);
                }
                if self.mutation.is_some() {
                    ui.spinner();
                    ui.label("Đang lưu…");
                }
                ui.horizontal_wrapped(|ui| {
                    ui.add_enabled(false, egui::Button::new("In phiếu việc (PDF)"))
                        .on_disabled_hover_text("Xuất phiếu PDF chưa được hỗ trợ.");
                    if ui
                        .add_enabled(
                            !self.busy()
                                && text(record, "status") != STATUSES[3]
                                && self.complete_key.is_none(),
                            egui::Button::new("Nghiệm thu hoàn tất"),
                        )
                        .clicked()
                    {
                        action = Some(Action::Complete(key.clone()));
                    }
                });
            },
        );
        if closed {
            self.detail_key = None;
        }
        if let Some(action) = action {
            self.act(action, session, api);
        }
    }

    fn render_create(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if !self.create_open {
            return;
        }
        let busy = self.busy();
        let mut save = false;
        let mut cancel = false;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-todo.create",
            "Tạo nhiệm vụ & Yêu cầu xử lý tài sản",
            760.0,
            busy,
            |ui| {
                widgets::form_input(
                    ui,
                    "asset-todo.code",
                    "Mã công việc",
                    true,
                    &mut self.draft.code,
                    "Ví dụ: CV-TS-08",
                    false,
                );
                widgets::form_select(
                    ui,
                    "asset-todo.category",
                    "Phân nhóm công việc",
                    true,
                    &mut self.draft.category,
                    CATEGORIES,
                );
                widgets::form_select(
                    ui,
                    "asset-todo.priority",
                    "Mức độ ưu tiên",
                    true,
                    &mut self.draft.priority,
                    PRIORITIES,
                );
                for (id, label, required, value, hint) in [
                    (
                        "title",
                        "Tiêu đề nhiệm vụ",
                        true,
                        &mut self.draft.title,
                        "Nhập công việc cần xử lý",
                    ),
                    (
                        "asset",
                        "Mã tài sản liên quan",
                        false,
                        &mut self.draft.asset_code,
                        "Mã tham chiếu tài sản (nếu có)",
                    ),
                    (
                        "requester",
                        "Người yêu cầu / Bộ phận",
                        true,
                        &mut self.draft.requester,
                        "Người yêu cầu thực tế",
                    ),
                    (
                        "assigned",
                        "Cán bộ phụ trách",
                        true,
                        &mut self.draft.assigned,
                        "Người được giao thực hiện",
                    ),
                    (
                        "location",
                        "Vị trí / Phòng ban thực hiện",
                        true,
                        &mut self.draft.location,
                        "Nhập vị trí thực hiện",
                    ),
                    (
                        "deadline",
                        "Hạn hoàn thành (giờ địa phương)",
                        true,
                        &mut self.draft.deadline,
                        "YYYY-MM-DD HH:MM",
                    ),
                    (
                        "hours",
                        "Dự kiến (giờ)",
                        false,
                        &mut self.draft.estimated_hours,
                        "Tối thiểu 0.5 nếu có nhập",
                    ),
                ] {
                    widgets::form_input(
                        ui,
                        &format!("asset-todo.{id}"),
                        label,
                        required,
                        value,
                        hint,
                        false,
                    );
                }
                widgets::form_textarea(
                    ui,
                    "asset-todo.notes",
                    "Ghi chú & Hướng dẫn kỹ thuật",
                    false,
                    &mut self.draft.notes,
                    "Yêu cầu đặc biệt khi xử lý",
                    3,
                );
                ui.weak("SLA chưa được tự đánh giá. Nhiệm vụ mới có ba bước checklist chuẩn, đều chưa hoàn thành.");
                if !self.form_error.is_empty() {
                    ui.colored_label(ui.visuals().error_fg_color, &self.form_error);
                }
                ui.add_space(12.0);
                ui.horizontal_wrapped(|ui| {
                    cancel = ui.button("Hủy bỏ").clicked();
                    save = ui.button("Tạo nhiệm vụ").clicked();
                });
            },
        );
        if !busy && (cancel || closed) {
            self.create_open = false;
        } else if !busy && save {
            match self.draft.record(&self.records) {
                Ok(record) => self.submit(session, api, self.draft.key.clone(), record, true),
                Err(error) => self.form_error = error,
            }
        }
    }

    fn render_complete(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        let Some(key) = self.complete_key.clone() else {
            return;
        };
        let record = self
            .records
            .iter()
            .find(|record| record_key(record) == Some(key.as_str()))
            .cloned();
        let busy = self.busy();
        let mut save = false;
        let mut cancel = false;
        let (_, closed) = widgets::modal(
            ctx,
            "asset-todo.complete",
            "Nghiệm thu & Hoàn tất nhiệm vụ",
            480.0,
            busy,
            |ui| {
                if let Some(record) = &record {
                    ui.strong(text(record, "taskCode"));
                    ui.label(text(record, "taskTitle"));
                } else {
                    ui.label("Không còn tìm thấy nhiệm vụ. Đóng hộp thoại và tải lại danh sách.");
                }
                widgets::form_input(
                    ui,
                    "asset-todo.actual-hours",
                    "Thời gian thực tế xử lý (giờ)",
                    true,
                    &mut self.actual_hours,
                    "Nhập số giờ thực tế, tối thiểu 0.5",
                    false,
                );
                widgets::form_textarea(
                    ui,
                    "asset-todo.resolution",
                    "Kết quả xử lý & Nghiệm thu",
                    true,
                    &mut self.resolution,
                    "Nhập kết quả thực tế",
                    3,
                );
                ui.weak("Xác nhận sẽ đánh dấu hoàn thành các bước checklist và lưu kết quả cùng số giờ bạn đã nhập.");
                if !self.form_error.is_empty() {
                    ui.colored_label(ui.visuals().error_fg_color, &self.form_error);
                }
                ui.add_space(12.0);
                ui.horizontal_wrapped(|ui| {
                    cancel = ui.button("Hủy").clicked();
                    save = ui
                        .add_enabled(record.is_some(), egui::Button::new("Xác nhận hoàn tất"))
                        .clicked();
                });
            },
        );
        if !busy && (cancel || closed) {
            self.complete_key = None;
        } else if !busy && save {
            match record
                .as_ref()
                .ok_or_else(|| "Không còn tìm thấy nhiệm vụ.".into())
                .and_then(|record| completion_patch(record, &self.actual_hours, &self.resolution))
            {
                Ok(patch) => self.submit(session, api, key, patch, false),
                Err(error) => self.form_error = error,
            }
        }
    }
}

fn text<'a>(record: &'a Value, field: &str) -> &'a str {
    record
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .unwrap_or("—")
}

fn record_key(record: &Value) -> Option<&str> {
    ["key", "id", "code"]
        .iter()
        .find_map(|field| record.get(*field).and_then(Value::as_str))
        .map(str::trim)
        .filter(|key| !key.is_empty() && key.len() <= 160 && !key.chars().any(char::is_control))
}

fn acknowledged(record: &Value, key: &str, expected: &Value) -> bool {
    record_key(record) == Some(key)
        && expected.as_object().is_some_and(|fields| {
            fields
                .iter()
                .all(|(field, value)| record.get(field) == Some(value))
        })
}

fn clipped(ui: &mut Ui, text: &str, strong: bool) {
    let rich = if strong {
        RichText::new(text).strong()
    } else {
        RichText::new(text).small()
    };
    ui.add(egui::Label::new(rich).truncate())
        .on_hover_text(text);
}

fn render_progress(ui: &mut Ui, record: &Value) {
    if let Some((done, total)) = checklist_progress(record).filter(|(_, total)| *total > 0) {
        ui.add(
            egui::ProgressBar::new(done as f32 / total as f32)
                .text(format!("Checklist {done}/{total}")),
        );
    } else {
        ui.small("Chưa có checklist hợp lệ");
    }
}

fn priority_color(priority: &str) -> Color32 {
    if priority == PRIORITIES[0] {
        Color32::from_rgb(220, 38, 38)
    } else if priority == PRIORITIES[1] {
        Color32::from_rgb(217, 119, 6)
    } else {
        Color32::from_rgb(37, 99, 235)
    }
}

fn status_color(status: &str) -> Color32 {
    match status {
        "Chờ xử lý" => Color32::from_rgb(217, 119, 6),
        "Đang thực hiện" => Color32::from_rgb(37, 99, 235),
        "Chờ phê duyệt cấp trên" => Color32::from_rgb(124, 58, 237),
        "Đã hoàn thành" => crate::theme::PRIMARY,
        _ => Color32::GRAY,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session() -> Session {
        serde_json::from_value(json!({
            "user": {"id": "admin", "email": "admin@example.test", "name": "Admin", "role": "ADMIN"},
            "endpoint": "http://127.0.0.1:1/api/v1", "session_id": "test", "token": "test", "mode": "local_admin"
        })).unwrap()
    }

    fn draft() -> CreateDraft {
        CreateDraft {
            key: "task-key".into(),
            code: "CV-TS-01".into(),
            title: "Kiểm tra thiết bị".into(),
            category: CATEGORIES[0].into(),
            priority: PRIORITIES[0].into(),
            requester: "Người yêu cầu".into(),
            assigned: "Cán bộ thực hiện".into(),
            location: "Kho thiết bị".into(),
            deadline: "2026-10-25 14:30".into(),
            estimated_hours: "2.5".into(),
            ..Default::default()
        }
    }

    fn fixture(session: &Session) -> AssetTodoView {
        AssetTodoView {
            identity: Some((
                session.user.id.clone(),
                session.endpoint.clone(),
                session.session_id.clone(),
            )),
            loaded: true,
            page_size: 8,
            records: (0..24)
                .map(|index| {
                    let mut record = draft().record(&[]).unwrap();
                    record["key"] = json!(format!("task-{index}"));
                    record["taskCode"] = json!(format!("CV-TS-{index}"));
                    record["taskTitle"] =
                        json!("Tên nhiệm vụ tài sản dài cần xuống dòng ".repeat(8));
                    record["status"] = json!(STATUSES[index % STATUSES.len()]);
                    record["notes"] = json!("Ghi chú chi tiết công việc. ".repeat(30));
                    record
                })
                .collect(),
            ..Default::default()
        }
    }

    fn ready<T>(value: Result<T, String>) -> ApiTask<T> {
        std::sync::Arc::new(std::sync::Mutex::new(Some(value)))
    }

    fn frame(view: &mut AssetTodoView, session: &Session, ctx: &egui::Context, width: f32) {
        let _ = ctx.run(
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
                        view.render(ui, ctx, session, &ApiClient::default());
                        assert!(
                            ui.min_rect().right() <= clip.right() + 1.0,
                            "width {width}: {:?} vs {clip:?}",
                            ui.min_rect()
                        );
                        assert!(
                            ui.min_rect().bottom() <= clip.bottom() + 1.0,
                            "width {width}: {:?} vs {clip:?}",
                            ui.min_rect()
                        );
                    });
                });
            },
        );
    }

    #[test]
    fn task_creation_preserves_explicit_deadline_and_never_invents_sla_or_actual_hours() {
        let record = draft().record(&[]).unwrap();
        assert_eq!(record["deadline"], "2026-10-25 14:30");
        assert_eq!(record["status"], STATUSES[0]);
        assert_eq!(record["estimatedHours"], 2.5);
        assert!(record.get("slaStatus").is_none());
        assert!(record.get("actualHours").is_none());
        assert!(record.get("resolutionResult").is_none());
        assert_eq!(checklist_progress(&record), Some((0, 3)));
        assert!(CreateDraft::new("Admin").deadline.is_empty());
    }

    #[test]
    fn create_validation_rejects_missing_invalid_and_duplicate_values() {
        let mut value = draft();
        value.title = "  ".into();
        assert!(value.record(&[]).is_err());
        value = draft();
        value.deadline = "2026-02-30 14:30".into();
        assert!(value.record(&[]).is_err());
        value.deadline = "2026-2-01 14:30".into();
        assert!(value.record(&[]).is_err());
        value = draft();
        value.priority = "invented".into();
        assert!(value.record(&[]).is_err());
        value = draft();
        value.category = "invented".into();
        assert!(value.record(&[]).is_err());
        for hours in ["NaN", "inf", "-1", "0", "0.1", "1000001"] {
            value = draft();
            value.estimated_hours = hours.into();
            assert!(value.record(&[]).is_err(), "{hours}");
        }
        value = draft();
        assert!(value.record(&[json!({"taskCode": " cv-ts-01 "})]).is_err());
        value.estimated_hours.clear();
        assert!(value.record(&[]).unwrap().get("estimatedHours").is_none());
    }

    #[test]
    fn filters_combine_search_status_priority_and_category() {
        let record = draft().record(&[]).unwrap();
        let mut filters = Filters::default();
        assert!(filters.matches(&record));
        for query in ["cv-ts", "KIỂM TRA", "cán bộ", "người yêu", "kho"] {
            filters.search = query.into();
            assert!(filters.matches(&record), "{query}");
        }
        filters.search.clear();
        filters.status = STATUSES[1].into();
        assert!(!filters.matches(&record));
        filters.status = STATUSES[0].into();
        filters.priority = PRIORITIES[1].into();
        assert!(!filters.matches(&record));
        filters.priority = PRIORITIES[0].into();
        filters.category = CATEGORIES[1].into();
        assert!(!filters.matches(&record));
        filters.category = CATEGORIES[0].into();
        assert!(filters.matches(&record));
    }

    #[test]
    fn metrics_count_recorded_states_and_use_only_reported_completed_hours() {
        let records = vec![
            json!({"status": STATUSES[0], "priority": PRIORITIES[0], "estimatedHours": 100}),
            json!({"status": STATUSES[1], "priority": PRIORITIES[1], "actualHours": 100}),
            json!({"status": STATUSES[3], "priority": PRIORITIES[0], "actualHours": 2}),
            json!({"status": STATUSES[3], "actualHours": 4}),
            json!({"status": STATUSES[3]}),
        ];
        assert_eq!(
            metrics(&records),
            TaskMetrics {
                pending: 1,
                in_progress: 1,
                urgent: 1,
                completed: 3,
                reported_hours_mean: Some(3.0)
            }
        );
        assert_eq!(metrics(&[]).reported_hours_mean, None);
        assert_eq!(
            metrics(&[
                json!({"status": STATUSES[3], "estimatedHours": 8, "actualHours": "unknown"})
            ])
            .reported_hours_mean,
            None
        );
    }

    #[test]
    fn checklist_and_completion_patches_preserve_metadata_and_require_actual_results() {
        let mut record = draft().record(&[]).unwrap();
        record["checklist"][0]["extra"] = json!({"keep": true});
        let patch = checklist_patch(&record, 0, true).unwrap();
        assert_eq!(patch["checklist"][0]["extra"], json!({"keep": true}));
        assert!(patch.get("status").is_none());
        assert!(checklist_patch(&record, 99, true).is_err());
        assert!(completion_patch(&record, "2", " ").is_err());
        assert!(completion_patch(&record, "NaN", "Thực tế").is_err());
        let patch = completion_patch(&record, "2.5", "  Thiết bị đã kiểm tra  ").unwrap();
        assert_eq!(patch["status"], STATUSES[3]);
        assert_eq!(patch["actualHours"], 2.5);
        assert_eq!(patch["resolutionResult"], "Thiết bị đã kiểm tra");
        assert_eq!(
            patch["checklist"][0]["extra"],
            record["checklist"][0]["extra"]
        );
        assert!(
            patch.get("deadline").is_none()
                && patch.get("slaStatus").is_none()
                && patch.get("key").is_none()
        );
        record["checklist"][0]["done"] = json!("ambiguous");
        assert!(checklist_patch(&record, 0, true).is_err());
        assert!(completion_patch(&record, "2", "Đã kiểm tra").is_err());
    }

    #[test]
    fn failed_create_keeps_draft_and_does_not_fabricate_a_saved_task() {
        let session = session();
        let mut view = fixture(&session);
        view.create_open = true;
        view.draft = draft();
        let original_count = view.records.len();
        view.mutation = Some(Mutation {
            key: view.draft.key.clone(),
            created: true,
            expected: view.draft.record(&[]).unwrap(),
            task: ready(Err("HTTP 503".into())),
        });
        view.poll(&egui::Context::default(), &session, &ApiClient::default());
        assert!(view.create_open);
        assert_eq!(view.draft.code, "CV-TS-01");
        assert_eq!(view.records.len(), original_count);
        assert!(view.notice.is_empty());
        assert_eq!(view.form_error, "HTTP 503");
        assert!(view.mutation.is_none());
    }

    #[test]
    fn mutation_requires_server_identity_and_saved_field_confirmation() {
        let record = draft().record(&[]).unwrap();
        assert!(acknowledged(&record, "task-key", &record));
        assert!(!acknowledged(&record, "wrong-key", &record));
        assert!(!acknowledged(
            &record,
            "task-key",
            &json!({"status": STATUSES[3]})
        ));
        let session = session();
        let mut view = fixture(&session);
        view.create_open = true;
        view.draft = draft();
        view.mutation = Some(Mutation {
            key: "task-key".into(),
            created: true,
            expected: record.clone(),
            task: ready(Ok(GenericRecordResponse {
                record: record.clone(),
                revision: String::new(),
            })),
        });
        view.poll(&egui::Context::default(), &session, &ApiClient::default());
        assert!(!view.create_open);
        assert_eq!(view.records[0], record);
        assert!(view.notice.contains("Đã tạo"));
    }

    #[test]
    fn unauthorized_access_clears_cached_data_and_reset_drops_pending_state() {
        let mut session = session();
        let mut view = fixture(&session);
        session.user.role = "USER".into();
        let ctx = egui::Context::default();
        crate::native_text::setup_fonts(&ctx);
        frame(&mut view, &session, &ctx, 320.0);
        assert!(view.records.is_empty() && view.identity.is_none() && !view.busy());
        view.create_open = true;
        view.detail_key = Some("task".into());
        view.reset();
        assert!(!view.create_open && view.detail_key.is_none() && view.complete_key.is_none());
    }

    #[test]
    fn table_kanban_empty_and_error_layouts_fit_320_390_768_1440() {
        let session = session();
        for width in [320.0, 390.0, 768.0, 1440.0] {
            for state in 0..4 {
                let ctx = egui::Context::default();
                crate::native_text::setup_fonts(&ctx);
                let mut view = fixture(&session);
                if state == 1 {
                    view.kanban = true;
                    view.records[0]["status"] = json!("Trạng thái nhập từ hệ cũ");
                }
                if state == 2 {
                    view.records.clear();
                }
                if state == 3 {
                    view.error = "Không thể tải nhiệm vụ. ".repeat(20);
                    view.pending_load = Some(std::sync::Arc::new(std::sync::Mutex::new(None)));
                }
                for _ in 0..3 {
                    frame(&mut view, &session, &ctx, width);
                }
                assert!(view.mutation.is_none());
            }
        }
    }

    #[test]
    fn create_detail_and_completion_panels_fit_all_four_viewports() {
        let session = session();
        for width in [320.0, 390.0, 768.0, 1440.0] {
            for mode in 0..3 {
                let ctx = egui::Context::default();
                crate::native_text::setup_fonts(&ctx);
                let mut view = fixture(&session);
                let id = match mode {
                    0 => {
                        view.create_open = true;
                        view.draft = draft();
                        ("asset-todo.create", "dialog")
                    }
                    1 => {
                        view.detail_key = Some("task-0".into());
                        ("asset-todo.detail", "drawer")
                    }
                    _ => {
                        view.complete_key = Some("task-0".into());
                        ("asset-todo.complete", "dialog")
                    }
                };
                for _ in 0..3 {
                    frame(&mut view, &session, &ctx, width);
                }
                let rect = ctx
                    .memory(|memory| memory.area_rect(egui::Id::new(id)))
                    .unwrap();
                assert!(
                    rect.left() >= -1.0
                        && rect.right() <= width + 1.0
                        && rect.top() >= -1.0
                        && rect.bottom() <= 845.0,
                    "{id:?} at {width}: {rect:?}"
                );
                assert!(view.mutation.is_none());
            }
        }
    }
}
