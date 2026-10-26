use std::time::Duration;

use egui::{Color32, Context, RichText, Ui};

use crate::{
    api::{
        ApiClient, ApiTask, CreateHrTrainingCourseInput, HrTrainingCourse,
        HrTrainingCourseResponse, HrTrainingCoursesResponse,
    },
    models::Session,
};

const PAGE_SIZE: usize = 8;

#[derive(Default)]
pub struct HrTrainingCoursesView {
    rows: Vec<HrTrainingCourse>,
    list_task: Option<ApiTask<HrTrainingCoursesResponse>>,
    create_task: Option<ApiTask<HrTrainingCourseResponse>>,
    loaded_for: Option<String>,
    loading: bool,
    needs_reload: bool,
    form_open: bool,
    form: CourseForm,
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
struct CourseForm {
    code: String,
    name: String,
    category: String,
    instructor: String,
    start_date: String,
    end_date: String,
    duration_hours: String,
    participant_target: String,
    budget: String,
    location: String,
}

impl Default for CourseForm {
    fn default() -> Self {
        Self {
            code: String::new(),
            name: String::new(),
            category: "Công nghệ & Kỹ thuật".to_owned(),
            instructor: String::new(),
            start_date: String::new(),
            end_date: String::new(),
            duration_hours: String::new(),
            participant_target: String::new(),
            budget: "0".to_owned(),
            location: String::new(),
        }
    }
}

impl HrTrainingCoursesView {
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
            self.list_task = Some(api.list_hr_training_courses_task(session));
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
                    self.notice = format!("Đã lập khóa đào tạo {}.", response.course.course_code);
                    self.form_open = false;
                    self.form = CourseForm::default();
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
            ui.label("Chỉ quản trị viên Nhân sự mới được quản lý kế hoạch đào tạo.");
            return;
        }
        self.poll(ui, session, api);
        let active = self
            .rows
            .iter()
            .filter(|r| r.status == "Đang diễn ra")
            .count();
        let hours = self
            .rows
            .iter()
            .fold(0_i64, |sum, r| sum.saturating_add(r.duration_hours));
        let participants = self
            .rows
            .iter()
            .fold(0_i64, |sum, r| sum.saturating_add(r.participants_count));
        let detail = if self.loading || !self.error.is_empty() {
            "Chưa tải được dữ liệu khóa học".into()
        } else {
            format!("{active} khóa đang giảng dạy trực tiếp")
        };
        let known = self.loaded_for.is_some() && !self.loading && self.error.is_empty();
        crate::widgets::metrics(
            ui,
            "hr.training.metrics",
            &[
                crate::widgets::Metric {
                    label: "Tổng chương trình đào tạo nội bộ",
                    value: if known {
                        format!("{} Khóa học", self.rows.len())
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: &detail,
                    color: crate::theme::PRIMARY,
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Lượt cán bộ nhân viên tham dự",
                    value: if known {
                        format!("{participants} Lượt học viên")
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Theo số học viên trong hồ sơ",
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Tổng giờ đào tạo tích lũy",
                    value: if known {
                        format!("{hours} Giờ đào tạo")
                    } else {
                        "Chưa xác định".into()
                    },
                    detail: "Tổng thời lượng đã khai báo",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Tỷ lệ đạt chuẩn bài thi kiểm tra",
                    value: "Chưa xác định".into(),
                    detail: "Chưa có dữ liệu kết quả sát hạch",
                    color: Color32::from_rgb(124, 58, 237),
                    value_size: 24.0,
                },
            ],
        );
        ui.add_space(16.0);
        let statuses = [
            "Tất cả chương trình",
            "Đang diễn ra",
            "Sắp khai giảng",
            "Đã hoàn thành",
        ];
        let selected = statuses
            .iter()
            .position(|s| *s == self.status_filter)
            .unwrap_or(0);
        let toolbar = collection_toolbar(
            ui,
            "hr.training",
            &statuses,
            selected,
            &mut self.search,
            "Tìm theo mã khóa, tên khóa học, giảng viên...",
            "+ Mở khóa đào tạo",
            "Xuất Báo Cáo",
            "Chưa có API xuất báo cáo đào tạo.",
        );
        if let Some(index) = toolbar.selected {
            self.status_filter = if index == 0 {
                String::new()
            } else {
                statuses[index].into()
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
            self.form = CourseForm::default();
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
                ui.label("Đang tải khóa đào tạo...");
            });
        }
        let needle = self.search.trim().to_lowercase();
        let visible = self
            .rows
            .iter()
            .filter(|r| {
                (self.status_filter.is_empty()
                    || self.status_filter == "Tất cả"
                    || self.status_filter == r.status)
                    && (needle.is_empty()
                        || [&r.course_code, &r.course_name, &r.category, &r.instructor]
                            .iter()
                            .any(|s| s.to_lowercase().contains(&needle)))
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
                title: "Mã & Chương trình đào tạo",
                width: (ui.available_width() - 790.0).max(300.0),
            },
            crate::widgets::TableColumn {
                title: "Giảng viên",
                width: 180.0,
            },
            crate::widgets::TableColumn {
                title: "Thời lượng & Học viên",
                width: 170.0,
            },
            crate::widgets::TableColumn {
                title: "Tiến độ hoàn thành",
                width: 180.0,
            },
            crate::widgets::TableColumn {
                title: "Trạng thái",
                width: 140.0,
            },
            crate::widgets::TableColumn {
                title: "Thao tác",
                width: 120.0,
            },
        ];
        crate::widgets::table(
            ui,
            "hr.training.table",
            &columns,
            page.len(),
            |ui, row, col| {
                let r = page[row];
                match col {
                    0 => {
                        ui.label(RichText::new(&r.course_name).size(13.5).strong());
                        ui.label(
                            RichText::new(format!("Mã: {} · Nhóm: {}", r.course_code, r.category))
                                .size(11.5)
                                .color(crate::theme::PRIMARY),
                        );
                    }
                    1 => {
                        ui.label(
                            RichText::new(&r.instructor)
                                .size(12.5)
                                .strong()
                                .color(Color32::from_rgb(37, 99, 235)),
                        );
                    }
                    2 => {
                        ui.label(
                            RichText::new(format!("{} giờ đào tạo", r.duration_hours))
                                .size(12.5)
                                .strong(),
                        );
                        ui.label(
                            RichText::new(format!("{} cán bộ nhân viên", r.participants_count))
                                .size(11.5)
                                .color(Color32::from_rgb(100, 116, 139)),
                        );
                    }
                    3 => {
                        ui.label(
                            RichText::new(format!("Đạt yêu cầu: {}%", r.completion_rate))
                                .size(11.5),
                        );
                        ui.add(
                            egui::ProgressBar::new(
                                (r.completion_rate / 100.0).clamp(0.0, 1.0) as f32
                            )
                            .desired_width(ui.available_width())
                            .fill(crate::theme::PRIMARY),
                        );
                    }
                    4 => {
                        crate::widgets::tag(
                            ui,
                            &r.status,
                            match r.status.as_str() {
                                "Đã hoàn thành" => crate::widgets::TagTone::Success,
                                "Sắp khai giảng" => crate::widgets::TagTone::Warning,
                                "Đang diễn ra" => crate::widgets::TagTone::Processing,
                                _ => crate::widgets::TagTone::Neutral,
                            },
                        );
                    }
                    _ => {
                        if ui.button("Giáo trình").clicked() {
                            self.selected_key = Some(r.key.clone());
                        }
                    }
                }
            },
        );
        ui.add_space(16.0);
        crate::widgets::pagination(
            ui,
            "hr.training.pages",
            &mut self.page,
            visible.len(),
            &mut self.page_size,
        );
        if let Some(course) = self
            .rows
            .iter()
            .find(|r| self.selected_key.as_deref() == Some(&r.key))
        {
            let (_, closed) = crate::widgets::drawer(
                ctx,
                "hr.training.detail",
                "Thông Tin Khóa Học & Danh Sách Học Viên Đăng Ký",
                580.0,
                |ui| {
                    ui.spacing_mut().item_spacing.y = 16.0;
                    egui::Frame::none()
                        .fill(Color32::from_rgb(248, 250, 252))
                        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
                        .rounding(8.0)
                        .inner_margin(16.0)
                        .show(ui, |ui| {
                            ui.colored_label(crate::theme::PRIMARY, &course.course_code);
                            ui.label(RichText::new(&course.course_name).size(16.0).strong());
                            ui.label(format!(
                                "Chuyên ngành: {} · {}",
                                course.category, course.status
                            ));
                        });
                    egui::Frame::group(ui.style())
                        .inner_margin(14.0)
                        .show(ui, |ui| {
                            ui.strong("Thông Tin Khung Chương Trình");
                            for (label, value) in [
                                ("Giảng viên hướng dẫn", course.instructor.clone()),
                                ("Địa điểm tổ chức", course.location.clone()),
                                (
                                    "Thời lượng đào tạo",
                                    format!("{} Giờ", course.duration_hours),
                                ),
                                (
                                    "Thời gian học",
                                    format!("{} → {}", course.start_date, course.end_date),
                                ),
                                ("Kinh phí đào tạo", format_vnd(course.budget)),
                                ("Chỉ tiêu học viên", course.participants_count.to_string()),
                            ] {
                                ui.label(format!(
                                    "{label}: {}",
                                    if value.is_empty() {
                                        "Chưa khai báo"
                                    } else {
                                        &value
                                    }
                                ));
                            }
                        });
                    egui::Frame::group(ui.style())
                        .inner_margin(14.0)
                        .show(ui, |ui| {
                            ui.strong("Tỷ Lệ Tốt Nghiệp & Cấp Chứng Nhận");
                            ui.label(format!(
                                "Tiến độ hoàn thành theo hồ sơ: {}%",
                                course.completion_rate
                            ));
                            ui.add(
                                egui::ProgressBar::new(
                                    (course.completion_rate / 100.0).clamp(0.0, 1.0) as f32,
                                )
                                .desired_width(ui.available_width()),
                            );
                        });
                    ui.horizontal_wrapped(|ui| {
                        ui.add_enabled(false, egui::Button::new("Xuất DS Điểm Danh"))
                            .on_disabled_hover_text("Chưa có API danh sách điểm danh.");
                        ui.add_enabled(false, egui::Button::new("Cấp Chứng Chỉ Số"))
                            .on_disabled_hover_text("Chưa có API cấp chứng chỉ.");
                    });
                    ui.label(
                        "Chưa kết nối danh sách điểm danh, kết quả sát hạch hoặc cấp chứng chỉ.",
                    );
                },
            );
            if closed {
                self.selected_key = None;
            }
        }
        if self.form_open {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "hr.training.create",
                "Lập Kế Hoạch & Khai Giảng Khóa Đào Tạo Mới",
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
        ui.label("Để trống mã khóa để máy chủ tự cấp mã duy nhất.");
        let cols = if ui.available_width() < 480.0 { 1 } else { 2 };
        ui.columns(cols, |c| {
            crate::widgets::form_input(
                &mut c[0],
                "course.code",
                "Mã khóa học",
                false,
                &mut self.form.code,
                "",
                false,
            );
            crate::widgets::form_select(
                &mut c[cols - 1],
                "course.category",
                "Chuyên ngành đào tạo",
                true,
                &mut self.form.category,
                &[
                    "Bảo mật & Tuân thủ",
                    "Công nghệ & Kỹ thuật",
                    "Kinh doanh & Kỹ năng mềm",
                    "Tài chính & Quản trị",
                ],
            );
        });
        crate::widgets::form_input(
            ui,
            "course.name",
            "Tên chương trình đào tạo",
            true,
            &mut self.form.name,
            "",
            false,
        );
        ui.columns(cols, |c| {
            crate::widgets::form_input(
                &mut c[0],
                "course.instructor",
                "Giảng viên / Chuyên gia đào tạo",
                true,
                &mut self.form.instructor,
                "",
                false,
            );
            crate::widgets::form_input(
                &mut c[cols - 1],
                "course.location",
                "Địa điểm / Hình thức học",
                false,
                &mut self.form.location,
                "",
                false,
            );
        });
        let numbers = if cols == 1 { 1 } else { 3 };
        ui.columns(numbers, |c| {
            crate::widgets::form_input(
                &mut c[0],
                "course.hours",
                "Thời lượng (Giờ)",
                true,
                &mut self.form.duration_hours,
                "",
                false,
            );
            crate::widgets::form_input(
                &mut c[if numbers == 1 { 0 } else { 1 }],
                "course.seats",
                "Chỉ tiêu học viên",
                true,
                &mut self.form.participant_target,
                "",
                false,
            );
            crate::widgets::form_input(
                &mut c[numbers - 1],
                "course.budget",
                "Kinh phí dự kiến (VNĐ)",
                true,
                &mut self.form.budget,
                "",
                false,
            );
        });
        ui.columns(cols, |c| {
            crate::widgets::form_date(
                &mut c[0],
                "course.start",
                "Ngày bắt đầu",
                true,
                &mut self.form.start_date,
            );
            crate::widgets::form_date(
                &mut c[cols - 1],
                "course.end",
                "Ngày kết thúc",
                true,
                &mut self.form.end_date,
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
                    egui::Button::new("Ban hành khóa đào tạo").fill(crate::theme::PRIMARY),
                )
                .clicked()
            {
                match self.form.to_input() {
                    Ok(input) => {
                        self.create_task =
                            Some(api.create_hr_training_course_task(session, &input));
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

impl CourseForm {
    fn to_input(&self) -> Result<CreateHrTrainingCourseInput, String> {
        for (value, field) in [
            (&self.name, "Tên khóa học"),
            (&self.category, "Chuyên ngành"),
            (&self.instructor, "Giảng viên"),
            (&self.start_date, "Ngày bắt đầu"),
            (&self.end_date, "Ngày kết thúc"),
        ] {
            if value.trim().is_empty() {
                return Err(format!("{field} là bắt buộc."));
            }
        }
        let duration_hours = parse_integer(&self.duration_hours, "Thời lượng", 1, 10_000)?;
        let participants_count =
            parse_integer(&self.participant_target, "Chỉ tiêu học viên", 1, 100_000)?;
        let budget = parse_integer(&self.budget, "Kinh phí", 0, 1_000_000_000_000)?;
        if self.start_date.trim().len() != 10
            || self.end_date.trim().len() != 10
            || self.start_date.trim() > self.end_date.trim()
        {
            return Err(
                "Ngày cần theo định dạng YYYY-MM-DD; ngày kết thúc không trước ngày bắt đầu."
                    .to_owned(),
            );
        }
        Ok(CreateHrTrainingCourseInput {
            course_code: self.code.trim().to_owned(),
            course_name: self.name.trim().to_owned(),
            category: self.category.trim().to_owned(),
            instructor: self.instructor.trim().to_owned(),
            start_date: self.start_date.trim().to_owned(),
            end_date: self.end_date.trim().to_owned(),
            duration_hours,
            participants_count,
            budget,
            location: self.location.trim().to_owned(),
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

/// The four HR collection routes share the same legacy tabs and export/create toolbar.
pub(super) fn collection_toolbar(
    ui: &mut Ui,
    id: &str,
    tabs: &[&str],
    selected: usize,
    search: &mut String,
    hint: &str,
    create_label: &str,
    export_label: &str,
    export_reason: &str,
) -> crate::widgets::ToolbarResponse {
    let mut result = crate::widgets::ToolbarResponse::default();
    let compact = ui.ctx().screen_rect().width() <= 992.0;
    let width = ui.available_width();
    let measure = |text: &str, size: f32| {
        ui.painter()
            .layout_no_wrap(
                text.to_owned(),
                egui::FontId::new(size, egui::FontFamily::Name("legacy-controls".into())),
                Color32::BLACK,
            )
            .size()
            .x
    };
    let tab_widths = tabs
        .iter()
        .map(|t| measure(t, 13.0) + 18.0)
        .collect::<Vec<_>>();
    let export_width = (measure(export_label, 14.0) + 42.0).min(width);
    let create_width = (measure(create_label, 14.0) + 32.0).min(width);
    let left_width = tab_widths.iter().sum::<f32>() + tabs.len() as f32 * 6.0 + 28.0;
    let right_width = 280.0 + 16.0 + export_width + create_width;
    let same_row = !compact && left_width + 10.0 + right_width <= width;
    let mut tab_positions = Vec::new();
    let mut x = 0.0;
    let mut y = if same_row { 2.0 } else { 0.0 };
    for &w in &tab_widths {
        if x > 0.0 && x + w > width {
            x = 0.0;
            y += 34.0;
        }
        tab_positions.push(egui::pos2(x, y));
        x += w + 6.0;
    }
    if x + 28.0 > width {
        x = 0.0;
        y += 34.0;
    }
    let reload_pos = egui::pos2(x, y);
    let right_y = if same_row { 0.0 } else { y + 38.0 };
    let right_x = if same_row { width - right_width } else { 0.0 };
    let search_width = if compact { width } else { 280.0_f32.min(width) };
    let mut control_positions = vec![egui::pos2(right_x, right_y)];
    let mut x = right_x + search_width + 8.0;
    let mut y = right_y;
    for w in [export_width, create_width] {
        if x + w > width {
            x = 0.0;
            y += 40.0;
        }
        control_positions.push(egui::pos2(x, y));
        x += w + 8.0;
    }
    let (bounds, _) = ui.allocate_exact_size(egui::vec2(width, y + 32.0), egui::Sense::hover());
    for (i, ((label, &w), pos)) in tabs.iter().zip(&tab_widths).zip(tab_positions).enumerate() {
        let active = i == selected;
        let button = egui::Button::new(RichText::new(*label).size(13.0).color(if active {
            crate::theme::PRIMARY_ACTIVE
        } else {
            Color32::from_rgb(71, 85, 105)
        }))
        .fill(if active {
            Color32::from_rgb(224, 242, 241)
        } else {
            Color32::WHITE
        })
        .stroke(egui::Stroke::new(
            1.0,
            if active {
                crate::theme::PRIMARY
            } else {
                Color32::from_rgb(203, 213, 225)
            },
        ));
        if crate::widgets::put(
            ui,
            egui::Rect::from_min_size(bounds.min + pos.to_vec2(), egui::vec2(w.min(width), 28.0)),
            button,
        )
        .clicked()
        {
            result.selected = Some(i);
        }
    }
    let reload_rect =
        egui::Rect::from_min_size(bounds.min + reload_pos.to_vec2(), egui::vec2(28.0, 28.0));
    if crate::widgets::put(
        ui,
        reload_rect,
        egui::Button::image(
            egui::Image::from_bytes(
                "bytes://hr-toolbar-reload.svg",
                include_bytes!("../../assets/nav-icons/ReloadOutlined.svg"),
            )
            .fit_to_exact_size(egui::Vec2::splat(14.0)),
        ),
    )
    .on_hover_text("Làm mới")
    .clicked()
    {
        result.reload_clicked = true;
    }
    let search_rect = egui::Rect::from_min_size(
        bounds.min + control_positions[0].to_vec2(),
        egui::vec2(search_width, 32.0),
    );
    result.search_changed = crate::widgets::search_input(ui, search_rect, search, hint).changed();
    let export_rect = egui::Rect::from_min_size(
        bounds.min + control_positions[1].to_vec2(),
        egui::vec2(export_width, 32.0),
    );
    ui.add_enabled_ui(false, |ui| {
        crate::widgets::put(
            ui,
            export_rect,
            egui::Button::image_and_text(
                egui::Image::from_bytes(
                    "bytes://hr-toolbar-export.svg",
                    include_bytes!("../../assets/nav-icons/DownloadOutlined.svg"),
                )
                .fit_to_exact_size(egui::Vec2::splat(14.0)),
                export_label,
            ),
        )
        .on_disabled_hover_text(export_reason);
    });
    let create_rect = egui::Rect::from_min_size(
        bounds.min + control_positions[2].to_vec2(),
        egui::vec2(create_width, 32.0),
    );
    result.create_clicked = crate::widgets::put(
        ui,
        create_rect,
        egui::Button::new(RichText::new(create_label).color(Color32::WHITE))
            .fill(crate::theme::PRIMARY),
    )
    .clicked();
    crate::visual_test::record(&format!("{id}.toolbar"), bounds);
    crate::visual_test::record(&format!("{id}.create"), create_rect);
    result
}

#[cfg(test)]
pub(super) fn assert_form_fits(mut render: impl FnMut(&mut Ui, &Session, &ApiClient)) {
    let session = Session {
        token: String::new(),
        session_id: "layout-test".into(),
        user: crate::models::User {
            id: "layout-test".into(),
            email: String::new(),
            name: String::new(),
            role: "ADMIN".into(),
            is_active: true,
        },
        endpoint: String::new(),
        mode: crate::models::StorageMode::default(),
    };
    for width in [375.0, 800.0, 1440.0] {
        let ctx = Context::default();
        crate::native_text::setup_fonts(&ctx);
        crate::native_text::setup_style(&ctx);
        for _ in 0..6 {
            let output = ctx.run(
                egui::RawInput {
                    screen_rect: Some(egui::Rect::from_min_size(
                        egui::Pos2::ZERO,
                        egui::vec2(width, 900.0),
                    )),
                    ..Default::default()
                },
                |ctx| {
                    crate::widgets::modal(ctx, "test.hr.form", "Thông tin", 640.0, false, |ui| {
                        render(ui, &session, &ApiClient)
                    });
                },
            );
            assert!(!output.shapes.is_empty());
        }
        let (footer, clip) = ctx
            .data(|d| d.get_temp::<(egui::Rect, egui::Rect)>(egui::Id::new("test.footer.bounds")))
            .expect("form footer bounds");
        assert!(footer.is_finite() && footer.is_positive());
        assert!(
            footer.left() >= clip.left() - 1.0 && footer.right() <= clip.right() + 1.0,
            "form footer overflows at {width}: {footer:?}, clip {clip:?}"
        );
    }
}

#[cfg(test)]
mod tests {

    #[test]
    fn legacy_form_footer_fits_mobile_tablet_and_desktop() {
        let mut view = HrTrainingCoursesView::default();
        crate::views::hr_training::assert_form_fits(|ui, session, api| {
            view.render_form(ui, session, api)
        });
    }
    use super::*;

    fn valid_form() -> CourseForm {
        CourseForm {
            code: String::new(),
            name: "Bảo mật ứng dụng".to_owned(),
            category: "Bảo mật & Tuân thủ".to_owned(),
            instructor: "Đội an toàn thông tin".to_owned(),
            start_date: "2026-11-01".to_owned(),
            end_date: "2026-11-02".to_owned(),
            duration_hours: "8".to_owned(),
            participant_target: "24".to_owned(),
            budget: "12,000,000".to_owned(),
            location: "Phòng đào tạo".to_owned(),
        }
    }

    #[test]
    fn course_form_validates_and_serializes_the_legacy_business_fields() {
        let input = valid_form().to_input().expect("valid course form");
        assert_eq!(input.course_code, "");
        assert_eq!(input.duration_hours, 8);
        assert_eq!(input.participants_count, 24);
        assert_eq!(input.budget, 12_000_000);
        let wire = serde_json::to_value(input).expect("wire JSON");
        assert_eq!(wire["courseName"], "Bảo mật ứng dụng");
        assert_eq!(wire["participantsCount"], 24);
        assert_eq!(wire["startDate"], "2026-11-01");
    }

    #[test]
    fn course_form_rejects_missing_fields_bad_dates_and_out_of_range_values() {
        let mut missing = valid_form();
        missing.name.clear();
        assert!(missing.to_input().is_err());

        let mut reversed = valid_form();
        reversed.end_date = "2026-10-31".to_owned();
        assert!(reversed.to_input().is_err());

        let mut bad_hours = valid_form();
        bad_hours.duration_hours = "0".to_owned();
        assert!(bad_hours.to_input().is_err());

        let mut overflow_budget = valid_form();
        overflow_budget.budget = "1,000,000,000,001".to_owned();
        assert!(overflow_budget.to_input().is_err());
    }

    #[test]
    fn training_course_dto_decodes_camel_case_and_unknown_legacy_fields() {
        let course: HrTrainingCourse = serde_json::from_value(serde_json::json!({
            "key":"course-1","courseCode":"DT-2026/01","courseName":"Ứng cứu sự cố",
            "category":"Bảo mật & Tuân thủ","instructor":"Nhóm ATTT","startDate":"2026-11-01",
            "endDate":"2026-11-02","durationHours":8,"participantsCount":20,"completionRate":0,
            "budget":0,"location":"Online","status":"Sắp khai giảng","legacyFlag":true
        }))
        .expect("course DTO");
        assert_eq!(course.course_code, "DT-2026/01");
        assert_eq!(course.participants_count, 20);
        assert_eq!(course.extra["legacyFlag"], true);
    }
}
