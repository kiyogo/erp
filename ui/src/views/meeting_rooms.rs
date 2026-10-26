use std::time::Duration;
use web_time::Instant;

use crate::{
    api::{
        ApiClient, ApiTask, MeetingBooking, MeetingBookingInput, MeetingRoom, MeetingRoomInput,
        MeetingRoomsResponse,
    },
    models::Session,
};
use egui::{Color32, RichText, Ui};

const TIME_SLOTS: &[&str] = &[
    "08:00 - 09:00",
    "09:00 - 10:00",
    "10:00 - 11:00",
    "11:00 - 12:00",
    "13:30 - 14:30",
    "14:30 - 15:30",
    "15:30 - 16:30",
    "16:30 - 17:30",
];

enum PendingMutation {
    CreateRoom(ApiTask<MeetingRoom>),
    CreateBooking(ApiTask<MeetingBooking>),
    CancelBooking {
        key: String,
        task: ApiTask<MeetingBooking>,
    },
}

pub struct MeetingRoomsView {
    rooms: Vec<MeetingRoom>,
    bookings: Vec<MeetingBooking>,
    pending_load: Option<ApiTask<MeetingRoomsResponse>>,
    pending_mutation: Option<PendingMutation>,
    loaded_for: Option<String>,
    last_loaded: Option<Instant>,
    needs_reload: bool,
    search: String,
    rooms_page: usize,
    bookings_page: usize,
    page_size: usize,
    calendar_date: String,
    room_name: String,
    room_location: String,
    room_capacity: String,
    room_equipment: String,
    room_create_open: bool,
    booking_open: bool,
    booking_room: String,
    booking_title: String,
    booking_booker: String,
    booking_date: String,
    booking_time_slot: String,
    booking_participants: String,
    notice: String,
    error: String,
}

impl Default for MeetingRoomsView {
    fn default() -> Self {
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        Self {
            rooms: Vec::new(),
            bookings: Vec::new(),
            pending_load: None,
            pending_mutation: None,
            loaded_for: None,
            last_loaded: None,
            needs_reload: true,
            search: String::new(),
            rooms_page: 0,
            bookings_page: 0,
            page_size: 8,
            calendar_date: today.clone(),
            room_name: String::new(),
            room_location: String::new(),
            room_capacity: "10".to_owned(),
            room_equipment: String::new(),
            room_create_open: false,
            booking_open: false,
            booking_room: String::new(),
            booking_title: String::new(),
            booking_booker: String::new(),
            booking_date: today,
            booking_time_slot: TIME_SLOTS[1].to_owned(),
            booking_participants: "4".to_owned(),
            notice: String::new(),
            error: String::new(),
        }
    }
}

impl MeetingRoomsView {
    fn request_reload(&mut self, session: &Session, api: &ApiClient) {
        if self.pending_load.is_some() || self.pending_mutation.is_some() {
            self.needs_reload = true;
            return;
        }
        self.error.clear();
        self.pending_load = Some(api.list_meeting_rooms_task(session));
        self.needs_reload = false;
    }

    fn poll(&mut self, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            self.rooms.clear();
            self.bookings.clear();
            self.pending_load = None;
            self.pending_mutation = None;
            self.loaded_for = Some(session.user.id.clone());
            self.last_loaded = None;
            self.needs_reload = true;
            self.booking_booker = session.user.name.clone();
            self.notice.clear();
            self.error.clear();
        }

        if self.needs_reload && self.pending_load.is_none() && self.pending_mutation.is_none() {
            self.request_reload(session, api);
        } else if self.pending_load.is_none()
            && self.pending_mutation.is_none()
            && self
                .last_loaded
                .is_none_or(|loaded| loaded.elapsed() >= Duration::from_secs(15))
        {
            self.request_reload(session, api);
        }

        if let Some(result) = self.pending_load.as_ref().and_then(ApiClient::poll) {
            self.pending_load = None;
            self.last_loaded = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.rooms = response.rooms;
                    self.bookings = response.bookings;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }

        let mutation_result =
            self.pending_mutation
                .as_ref()
                .and_then(|pending| match pending {
                    PendingMutation::CreateRoom(task) => ApiClient::poll(task)
                        .map(|result| result.map(|room| MeetingMutationResult::Room(room))),
                    PendingMutation::CreateBooking(task) => ApiClient::poll(task)
                        .map(|result| result.map(MeetingMutationResult::Booking)),
                    PendingMutation::CancelBooking { task, .. } => ApiClient::poll(task)
                        .map(|result| result.map(MeetingMutationResult::Booking)),
                });
        if let Some(result) = mutation_result {
            let pending = self
                .pending_mutation
                .take()
                .expect("meeting mutation exists");
            match (pending, result) {
                (PendingMutation::CreateRoom(_), Ok(MeetingMutationResult::Room(room))) => {
                    self.rooms.insert(0, room);
                    self.room_name.clear();
                    self.room_location.clear();
                    self.room_capacity = "10".to_owned();
                    self.room_equipment.clear();
                    self.room_create_open = false;
                    self.notice = "Đã lưu phòng họp.".to_owned();
                    self.error.clear();
                }
                (
                    PendingMutation::CreateBooking(_),
                    Ok(MeetingMutationResult::Booking(booking)),
                ) => {
                    self.bookings.insert(0, booking);
                    self.booking_title.clear();
                    self.booking_open = false;
                    self.notice = "Đã xác nhận lịch đặt phòng.".to_owned();
                    self.error.clear();
                }
                (
                    PendingMutation::CancelBooking { key, .. },
                    Ok(MeetingMutationResult::Booking(booking)),
                ) => {
                    if let Some(current) = self.bookings.iter_mut().find(|item| item.key == key) {
                        *current = booking;
                    }
                    self.notice = "Đã hủy lịch đặt phòng.".to_owned();
                    self.error.clear();
                }
                (_, Ok(_)) => self.error = "Phản hồi API phòng họp không hợp lệ.".to_owned(),
                (_, Err(error)) => {
                    self.error = error;
                    self.notice.clear();
                }
            }
            self.last_loaded = Some(Instant::now());
        }

        if self.pending_load.is_some() || self.pending_mutation.is_some() {
            ctx.request_repaint_after(Duration::from_millis(80));
        } else if let Some(last_loaded) = self.last_loaded {
            ctx.request_repaint_after(
                Duration::from_secs(15).saturating_sub(last_loaded.elapsed()),
            );
        }
    }

    fn is_busy(&self) -> bool {
        self.pending_load.is_some() || self.pending_mutation.is_some()
    }

    fn open_booking(&mut self, room_name: Option<&str>, date: Option<&str>, slot: Option<&str>) {
        self.booking_room = room_name
            .map(ToOwned::to_owned)
            .or_else(|| self.rooms.first().map(|room| room.name.clone()))
            .unwrap_or_default();
        self.booking_date = date
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string());
        self.booking_time_slot = slot.unwrap_or(TIME_SLOTS[1]).to_owned();
        self.booking_participants = "4".to_owned();
        self.booking_title.clear();
        self.booking_open = true;
    }

    pub fn render(
        &mut self,
        ui: &mut Ui,
        ctx: &egui::Context,
        session: &Session,
        api: &ApiClient,
        path: &str,
    ) {
        self.poll(ctx, session, api);
        let busy = self.is_busy();
        let page = if path.ends_with("/list") {
            MeetingRoomsPage::List
        } else if path.ends_with("/calendar") {
            MeetingRoomsPage::Calendar
        } else if path.ends_with("/history") {
            MeetingRoomsPage::History
        } else if path.ends_with("/settings") {
            MeetingRoomsPage::Settings
        } else {
            MeetingRoomsPage::Overview
        };
        let mut open_room_create = false;
        let mut submit_room = false;
        let mut submit_booking = false;
        let mut cancel_booking = None;
        let mut reload = false;

        ui.vertical(|ui| {
            ui.add_space(8.0);
            if !self.notice.is_empty() {
                ui.colored_label(Color32::from_rgb(21, 128, 61), &self.notice);
            }
            if !self.error.is_empty() {
                ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
            }
            if matches!(
                page,
                MeetingRoomsPage::Overview | MeetingRoomsPage::List | MeetingRoomsPage::Calendar
            ) {
                let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
                let confirmed = self
                    .bookings
                    .iter()
                    .filter(|b| b.status == "Đã xác nhận" && b.date == today)
                    .count();
                let unknown = self.rooms.is_empty()
                    && (self.pending_load.is_some() || !self.error.is_empty());
                crate::widgets::metrics(
                    ui,
                    "rooms.metrics",
                    &[
                        crate::widgets::Metric {
                            label: "Tổng số phòng họp hiện hữu",
                            value: if unknown {
                                "—".into()
                            } else {
                                format!("{} phòng họp", self.rooms.len())
                            },
                            detail: "Phòng họp VIP, Hội nghị & Brainstorm",
                            color: crate::theme::PRIMARY,
                            value_size: 24.0,
                        },
                        crate::widgets::Metric {
                            label: "Lịch họp đã xác nhận hôm nay",
                            value: if unknown {
                                "—".into()
                            } else {
                                format!("{confirmed} cuộc họp")
                            },
                            detail: "Theo lịch đặt đã được máy chủ xác nhận",
                            color: Color32::from_rgb(37, 99, 235),
                            value_size: 24.0,
                        },
                        crate::widgets::Metric {
                            label: "Hạ tầng thiết bị hội nghị trực tuyến",
                            value: "Chưa có dữ liệu".into(),
                            detail: "Chưa có kết nối giám sát thiết bị trực tuyến",
                            color: Color32::from_rgb(22, 163, 74),
                            value_size: 24.0,
                        },
                        crate::widgets::Metric {
                            label: "Công suất khai thác phòng họp",
                            value: "Chưa có dữ liệu".into(),
                            detail: "Chưa có số liệu sử dụng đã được kiểm chứng",
                            color: Color32::from_rgb(124, 58, 237),
                            value_size: 24.0,
                        },
                    ],
                );
                ui.add_space(16.0);
            }
            match page {
                MeetingRoomsPage::Overview => {
                    ui.horizontal_wrapped(|ui| {
                        ui.label(
                            RichText::new("Trạng thái phòng họp trực tiếp")
                                .size(16.0)
                                .strong(),
                        );
                        if ui
                            .add_enabled(!busy, egui::Button::new("Thêm phòng họp"))
                            .clicked()
                        {
                            open_room_create = true;
                        }
                        if ui
                            .add_enabled(
                                !busy && !self.rooms.is_empty(),
                                egui::Button::new(
                                    RichText::new("＋ Đặt phòng ngay").color(Color32::WHITE),
                                )
                                .fill(crate::theme::PRIMARY),
                            )
                            .clicked()
                        {
                            self.open_booking(None, None, None);
                        }
                        if ui
                            .add_enabled(!busy, egui::Button::new("Làm mới"))
                            .clicked()
                        {
                            reload = true;
                        }
                    });
                    ui.add_space(12.0);
                    let columns = ((ui.available_width() + 16.0) / 316.0).floor().max(1.0) as usize;
                    let mut selected = None;
                    for rooms in self.rooms.chunks(columns) {
                        ui.columns(columns, |cols| {
                            for (index, room) in rooms.iter().enumerate() {
                                if render_room_card(&mut cols[index], room, !busy) {
                                    selected = Some(room.name.clone());
                                }
                            }
                        });
                        ui.add_space(16.0);
                    }
                    if let Some(name) = selected {
                        self.open_booking(Some(&name), None, None);
                    }
                    ui.add_space(20.0);
                    ui.label(
                        RichText::new("Danh sách lịch họp đang hoạt động")
                            .size(16.0)
                            .strong(),
                    );
                    ui.add_space(12.0);
                    if let Some(key) = render_bookings(
                        ui,
                        &self.bookings,
                        &self.search,
                        !busy,
                        &mut self.bookings_page,
                        &mut self.page_size,
                        false,
                    ) {
                        cancel_booking = Some(key);
                    }
                }
                MeetingRoomsPage::List => {
                    ui.horizontal_wrapped(|ui| {
                        if ui
                            .add(
                                egui::TextEdit::singleline(&mut self.search)
                                    .hint_text("Tìm phòng họp theo tên hoặc vị trí...")
                                    .desired_width(340.0),
                            )
                            .changed()
                        {
                            self.rooms_page = 0;
                        }
                        if ui
                            .add_enabled(
                                !busy,
                                egui::Button::new(
                                    RichText::new("＋ Thêm phòng họp mới").color(Color32::WHITE),
                                )
                                .fill(crate::theme::PRIMARY),
                            )
                            .clicked()
                        {
                            open_room_create = true;
                        }
                        if ui
                            .add_enabled(!busy, egui::Button::new("Làm mới"))
                            .clicked()
                        {
                            reload = true;
                        }
                    });
                    ui.add_space(12.0);
                    let query = self.search.trim().to_lowercase();
                    let visible = self
                        .rooms
                        .iter()
                        .filter(|room| {
                            query.is_empty()
                                || room.name.to_lowercase().contains(&query)
                                || room.location.to_lowercase().contains(&query)
                                || room
                                    .equipment
                                    .iter()
                                    .any(|item| item.to_lowercase().contains(&query))
                        })
                        .cloned()
                        .collect::<Vec<_>>();
                    self.rooms_page = self
                        .rooms_page
                        .min(visible.len().div_ceil(self.page_size.max(1)).max(1) - 1);
                    let rows = visible
                        .iter()
                        .skip(self.rooms_page * self.page_size)
                        .take(self.page_size)
                        .collect::<Vec<_>>();
                    let width = (ui.available_width() - 2.0).max(800.0);
                    let titles = [
                        "Tên phòng họp",
                        "Vị trí",
                        "Sức chứa",
                        "Trang thiết bị",
                        "Trạng thái",
                        "Thao tác",
                    ];
                    let widths = [
                        width * 0.22,
                        width * 0.15,
                        width * 0.12,
                        width * 0.26,
                        width * 0.13,
                        width * 0.12,
                    ];
                    let cols = titles
                        .iter()
                        .enumerate()
                        .map(|(i, title)| crate::widgets::TableColumn {
                            title,
                            width: widths[i],
                        })
                        .collect::<Vec<_>>();
                    let mut selected = None;
                    if self.pending_load.is_some() && self.rooms.is_empty() {
                        ui.spinner();
                    } else if self.error.is_empty() || !self.rooms.is_empty() {
                        crate::widgets::table(
                            ui,
                            "rooms.table",
                            &cols,
                            rows.len(),
                            |ui, row, col| {
                                let room = rows[row];
                                match col {
                                    0 => {
                                        ui.label(
                                            RichText::new(&room.name)
                                                .strong()
                                                .color(crate::theme::PRIMARY),
                                        );
                                    }
                                    1 => {
                                        ui.label(&room.location);
                                    }
                                    2 => {
                                        ui.strong(format!("{} người", room.capacity));
                                    }
                                    3 => {
                                        ui.horizontal_wrapped(|ui| {
                                            for eq in &room.equipment {
                                                crate::widgets::tag(
                                                    ui,
                                                    eq,
                                                    crate::widgets::TagTone::Processing,
                                                );
                                            }
                                        });
                                    }
                                    4 => crate::widgets::tag(
                                        ui,
                                        &room.status,
                                        if room.status == "Trống" {
                                            crate::widgets::TagTone::Success
                                        } else {
                                            crate::widgets::TagTone::Warning
                                        },
                                    ),
                                    _ => {
                                        if ui
                                            .add_enabled(
                                                !busy
                                                    && !room.status.eq_ignore_ascii_case("Bảo trì"),
                                                egui::Button::new("Đặt lịch"),
                                            )
                                            .clicked()
                                        {
                                            selected = Some(room.name.clone());
                                        }
                                    }
                                }
                            },
                        );
                        ui.add_space(10.0);
                        crate::widgets::pagination(
                            ui,
                            "rooms.pagination",
                            &mut self.rooms_page,
                            visible.len(),
                            &mut self.page_size,
                        );
                    }
                    if let Some(name) = selected {
                        self.open_booking(Some(&name), None, None);
                    }
                }
                MeetingRoomsPage::Calendar => {
                    self.render_calendar(ui, busy);
                }
                MeetingRoomsPage::History => {
                    ui.horizontal_wrapped(|ui| {
                        let (rect, _) = ui.allocate_exact_size(
                            egui::vec2(340.0_f32.min(ui.available_width()), 32.0),
                            egui::Sense::hover(),
                        );
                        if crate::widgets::search_input(
                            ui,
                            rect,
                            &mut self.search,
                            "Tìm theo người đặt, tiêu đề họp, phòng họp...",
                        )
                        .changed()
                        {
                            self.bookings_page = 0;
                        }
                        ui.add_enabled(false, egui::Button::new("Xuất báo cáo Excel"))
                            .on_disabled_hover_text("Chưa có dịch vụ xuất báo cáo thật.");
                    });
                    ui.add_space(12.0);
                    if let Some(key) = render_bookings(
                        ui,
                        &self.bookings,
                        &self.search,
                        !busy,
                        &mut self.bookings_page,
                        &mut self.page_size,
                        true,
                    ) {
                        cancel_booking = Some(key);
                    }
                }
                MeetingRoomsPage::Settings => {
                    render_room_settings(ui);
                }
            }
        });

        if reload {
            self.needs_reload = true;
        }
        if open_room_create {
            self.room_create_open = true;
        }
        if self.room_create_open {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "rooms.create",
                "Thêm phòng họp mới vào hệ thống",
                480.0,
                busy,
                |ui| {
                    ui.add_space(16.0);
                    crate::widgets::form_input(
                        ui,
                        "room.name",
                        "Tên phòng họp",
                        true,
                        &mut self.room_name,
                        "Ví dụ: Phòng Họp VIP Sapphire",
                        false,
                    );
                    ui.columns(2, |cols| {
                        crate::widgets::form_input(
                            &mut cols[0],
                            "room.capacity",
                            "Sức chứa (Người)",
                            true,
                            &mut self.room_capacity,
                            "",
                            false,
                        );
                        crate::widgets::form_input(
                            &mut cols[1],
                            "room.location",
                            "Vị trí lắp đặt",
                            true,
                            &mut self.room_location,
                            "",
                            false,
                        );
                    });
                    crate::widgets::form_input(
                        ui,
                        "room.equipment",
                        "Thiết bị hội nghị (cách nhau dấu phẩy)",
                        false,
                        &mut self.room_equipment,
                        "",
                        false,
                    );
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::DARK_RED, &self.error);
                    }
                    ui.add_space(20.0);
                    crate::widgets::action_row(ui, |ui| {
                        submit_room = ui
                            .add(
                                egui::Button::new(
                                    RichText::new("Lưu phòng họp").color(Color32::WHITE),
                                )
                                .fill(crate::theme::PRIMARY),
                            )
                            .clicked();
                        if ui.button("Hủy").clicked() {
                            self.room_create_open = false;
                        }
                    });
                },
            );
            if closed {
                self.room_create_open = false;
            }
        }
        if submit_room {
            match self.room_input() {
                Ok(input) => {
                    self.pending_mutation = Some(PendingMutation::CreateRoom(
                        api.create_meeting_room_task(session, &input),
                    ));
                    self.error.clear();
                    self.notice = "Đang lưu phòng họp…".to_owned();
                }
                Err(error) => self.error = error,
            }
        }
        if let Some(key) = cancel_booking {
            self.pending_mutation = Some(PendingMutation::CancelBooking {
                task: api.cancel_meeting_booking_task(session, &key),
                key,
            });
            self.error.clear();
            self.notice = "Đang hủy lịch…".to_owned();
        }

        if self.booking_open {
            let (_, closed) = crate::widgets::modal(
                ctx,
                "rooms.booking",
                "Đặt phòng họp mới",
                480.0,
                busy,
                |ui| {
                    ui.add_space(16.0);
                    crate::widgets::form_field(
                        ui,
                        "booking.room",
                        "Chọn phòng họp",
                        true,
                        |ui| {
                            crate::widgets::combo_box("meeting_room_booking_room")
                                .width(ui.available_width())
                                .selected_text(if self.booking_room.is_empty() {
                                    "Chọn phòng"
                                } else {
                                    &self.booking_room
                                })
                                .show_ui(ui, |ui| {
                                    for room in &self.rooms {
                                        if !room.status.eq_ignore_ascii_case("Bảo trì") {
                                            ui.selectable_value(
                                                &mut self.booking_room,
                                                room.name.clone(),
                                                format!(
                                                    "{} ({} chỗ - {})",
                                                    room.name, room.capacity, room.location
                                                ),
                                            );
                                        }
                                    }
                                });
                        },
                    );
                    crate::widgets::form_input(
                        ui,
                        "booking.title",
                        "Tiêu đề cuộc họp",
                        true,
                        &mut self.booking_title,
                        "Ví dụ: Họp bàn chiến lược kinh doanh Q3",
                        false,
                    );
                    ui.columns(2, |cols| {
                        crate::widgets::form_input(
                            &mut cols[0],
                            "booking.booker",
                            "Người đặt phòng",
                            true,
                            &mut self.booking_booker,
                            "",
                            false,
                        );
                        crate::widgets::form_input(
                            &mut cols[1],
                            "booking.participants",
                            "Số người tham gia",
                            true,
                            &mut self.booking_participants,
                            "",
                            false,
                        );
                    });
                    ui.columns(2, |cols| {
                        crate::widgets::form_date(
                            &mut cols[0],
                            "booking.date",
                            "Ngày họp",
                            true,
                            &mut self.booking_date,
                        );
                        crate::widgets::form_select(
                            &mut cols[1],
                            "booking.slot",
                            "Khung giờ",
                            true,
                            &mut self.booking_time_slot,
                            TIME_SLOTS,
                        );
                    });
                    if !self.error.is_empty() {
                        ui.colored_label(Color32::DARK_RED, &self.error);
                    }
                    ui.add_space(20.0);
                    crate::widgets::action_row(ui, |ui| {
                        submit_booking = ui
                            .add_enabled(
                                !self.rooms.is_empty(),
                                egui::Button::new(
                                    RichText::new("Xác nhận đặt phòng").color(Color32::WHITE),
                                )
                                .fill(crate::theme::PRIMARY),
                            )
                            .clicked();
                        if ui.button("Hủy").clicked() {
                            self.booking_open = false;
                        }
                    });
                },
            );
            if closed {
                self.booking_open = false;
            }
        }
        if submit_booking {
            match self.booking_input() {
                Ok(input) => {
                    self.pending_mutation = Some(PendingMutation::CreateBooking(
                        api.create_meeting_booking_task(session, &input),
                    ));
                    self.error.clear();
                    self.notice = "Đang gửi yêu cầu đặt phòng…".to_owned();
                }
                Err(error) => self.error = error,
            }
        }
        if reload {
            self.request_reload(session, api);
        }
        if self.is_busy() {
            ctx.request_repaint_after(Duration::from_millis(80));
        }
    }

    fn render_calendar(&mut self, ui: &mut Ui, busy: bool) {
        let mut open = false;
        ui.horizontal_wrapped(|ui| {
            ui.spacing_mut().item_spacing.x = 10.0;
            ui.label(RichText::new("Chọn ngày xem lịch:").strong());
            ui.scope(|ui| {
                ui.set_width(170.0_f32.min(ui.available_width()));
                crate::date_picker::date_picker(ui, "rooms.calendar.date", &mut self.calendar_date);
            });
            crate::widgets::tag(
                ui,
                &format!("Hôm nay: {}", self.calendar_date),
                crate::widgets::TagTone::Processing,
            );
            let button = ui.add_enabled(
                !busy && !self.rooms.is_empty(),
                egui::Button::new(RichText::new("＋ Đặt lịch theo giờ").color(Color32::WHITE))
                    .fill(crate::theme::PRIMARY),
            );
            crate::visual_test::record("rooms.book", button.rect);
            open = button.clicked();
        });
        if open {
            let date = self.calendar_date.clone();
            self.open_booking(None, Some(&date), None);
        }
        ui.add_space(16.0);
        let mut selected = None;
        egui::Frame::none()
            .fill(Color32::WHITE)
            .rounding(8.0)
            .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .inner_margin(16.0)
            .show(ui, |ui| {
                ui.spacing_mut().item_spacing.y = 0.0;
                egui::ScrollArea::horizontal()
                    .id_salt("rooms.calendar.scroll")
                    .show(ui, |ui| {
                        let width = ui.available_width().max(700.0);
                        let first = if self.rooms.is_empty() { width } else { 182.0 };
                        let room_width = (width - first) / self.rooms.len().max(1) as f32;
                        let header_height = if self.rooms.is_empty() { 45.5 } else { 62.0 };
                        let (header, _) = ui.allocate_exact_size(
                            egui::vec2(width, header_height),
                            egui::Sense::hover(),
                        );
                        ui.painter()
                            .rect_filled(header, 0.0, Color32::from_rgb(248, 250, 252));
                        ui.painter().line_segment(
                            [header.left_bottom(), header.right_bottom()],
                            egui::Stroke::new(2.0, Color32::from_rgb(203, 213, 225)),
                        );
                        ui.painter().text(
                            header.left_center() + egui::vec2(16.0, 0.0),
                            egui::Align2::LEFT_CENTER,
                            "Khung giờ",
                            crate::native_text::weighted_font(ui.ctx(), 13.0, true),
                            Color32::from_rgb(71, 85, 105),
                        );
                        for (index, room) in self.rooms.iter().enumerate() {
                            let rect = egui::Rect::from_min_size(
                                header.min + egui::vec2(first + index as f32 * room_width, 0.0),
                                egui::vec2(room_width, header_height),
                            );
                            let mut child = ui.new_child(
                                egui::UiBuilder::new()
                                    .id_salt(("rooms.calendar.header", index))
                                    .max_rect(rect.shrink2(egui::vec2(16.0, 12.0))),
                            );
                            child.set_clip_rect(rect.intersect(ui.clip_rect()));
                            child.label(RichText::new(&room.name).size(13.5).strong());
                            child.label(
                                RichText::new(format!("Sức chứa {} người", room.capacity))
                                    .size(11.0)
                                    .color(Color32::from_rgb(100, 116, 139)),
                            );
                        }
                        for slot in TIME_SLOTS {
                            let height = if self.rooms.is_empty() { 43.75 } else { 72.0 };
                            let (row, _) = ui.allocate_exact_size(
                                egui::vec2(width, height),
                                egui::Sense::hover(),
                            );
                            ui.painter().line_segment(
                                [row.left_bottom(), row.right_bottom()],
                                egui::Stroke::new(1.0, Color32::from_rgb(241, 245, 249)),
                            );
                            ui.painter().text(
                                row.left_center() + egui::vec2(38.0, 0.0),
                                egui::Align2::LEFT_CENTER,
                                slot,
                                crate::native_text::weighted_font(ui.ctx(), 12.5, false),
                                Color32::from_rgb(100, 116, 139),
                            );
                            let center = row.left_center() + egui::vec2(22.0, 0.0);
                            egui::Image::from_bytes(
                                "bytes://ClockCircleOutlined.svg",
                                include_bytes!("../../assets/nav-icons/ClockCircleOutlined.svg"),
                            )
                            .tint(Color32::from_rgb(37, 99, 235))
                            .paint_at(
                                ui,
                                egui::Rect::from_center_size(center, egui::Vec2::splat(13.0)),
                            );
                            for (index, room) in self.rooms.iter().enumerate() {
                                let rect = egui::Rect::from_min_size(
                                    row.min + egui::vec2(first + index as f32 * room_width, 0.0),
                                    egui::vec2(room_width, height),
                                )
                                .shrink2(egui::vec2(12.0, 8.0));
                                let booking = self.bookings.iter().find(|b| {
                                    b.room_name == room.name
                                        && b.date == self.calendar_date
                                        && b.status == "Đã xác nhận"
                                        && time_slots_overlap(&b.time_slot, slot)
                                });
                                if let Some(booking) = booking {
                                    ui.painter().rect_filled(
                                        rect,
                                        4.0,
                                        Color32::from_rgb(239, 246, 255),
                                    );
                                    ui.painter().line_segment(
                                        [rect.left_top(), rect.left_bottom()],
                                        egui::Stroke::new(4.0, Color32::from_rgb(37, 99, 235)),
                                    );
                                    let mut child = ui.new_child(
                                        egui::UiBuilder::new()
                                            .id_salt(("rooms.calendar.booking", index, *slot))
                                            .max_rect(rect.shrink2(egui::vec2(10.0, 8.0))),
                                    );
                                    child.set_clip_rect(rect.intersect(ui.clip_rect()));
                                    child
                                        .add(
                                            egui::Label::new(
                                                RichText::new(&booking.meeting_title)
                                                    .size(12.5)
                                                    .strong()
                                                    .color(Color32::from_rgb(30, 64, 175)),
                                            )
                                            .truncate(),
                                        )
                                        .on_hover_text(&booking.meeting_title);
                                    child.label(
                                        RichText::new(format!(
                                            "{} ({} người)",
                                            booking.booker, booking.participants_count
                                        ))
                                        .size(11.0)
                                        .color(Color32::from_rgb(59, 130, 246)),
                                    );
                                } else {
                                    ui.add_enabled_ui(
                                        !busy && !room.status.eq_ignore_ascii_case("Bảo trì"),
                                        |ui| {
                                            if crate::widgets::put(
                                                ui,
                                                rect,
                                                egui::Button::new(
                                                    RichText::new("+ Trống (Bấm để đặt)")
                                                        .size(12.0)
                                                        .color(Color32::from_rgb(148, 163, 184)),
                                                )
                                                .fill(Color32::TRANSPARENT),
                                            )
                                            .clicked()
                                            {
                                                selected =
                                                    Some((room.name.clone(), (*slot).to_owned()));
                                            }
                                        },
                                    );
                                }
                            }
                        }
                    });
            });
        if let Some((name, slot)) = selected {
            let date = self.calendar_date.clone();
            self.open_booking(Some(&name), Some(&date), Some(&slot));
        }
    }

    fn room_input(&self) -> Result<MeetingRoomInput, String> {
        let name = self.room_name.trim();
        let location = self.room_location.trim();
        if name.is_empty() || location.is_empty() {
            return Err("Nhập tên phòng và vị trí.".to_owned());
        }
        let capacity = self
            .room_capacity
            .trim()
            .parse::<u32>()
            .map_err(|_| "Sức chứa phải là số nguyên.".to_owned())?;
        let equipment = self
            .room_equipment
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToOwned::to_owned)
            .collect();
        Ok(MeetingRoomInput {
            name: name.to_owned(),
            location: location.to_owned(),
            capacity,
            equipment,
        })
    }

    fn booking_input(&self) -> Result<MeetingBookingInput, String> {
        if self.booking_room.trim().is_empty() {
            return Err("Chọn phòng họp trước khi đặt.".to_owned());
        }
        if self.booking_title.trim().is_empty() {
            return Err("Nhập tiêu đề cuộc họp.".to_owned());
        }
        let participants_count = self
            .booking_participants
            .trim()
            .parse::<u32>()
            .map_err(|_| "Số người tham gia phải là số nguyên.".to_owned())?;
        Ok(MeetingBookingInput {
            room_name: self.booking_room.clone(),
            meeting_title: self.booking_title.trim().to_owned(),
            booker: self.booking_booker.trim().to_owned(),
            date: self.booking_date.trim().to_owned(),
            time_slot: self.booking_time_slot.clone(),
            participants_count,
        })
    }
}

#[derive(Clone, Copy)]
enum MeetingRoomsPage {
    Overview,
    List,
    Calendar,
    History,
    Settings,
}

enum MeetingMutationResult {
    Room(MeetingRoom),
    Booking(MeetingBooking),
}

fn time_slots_overlap(left: &str, right: &str) -> bool {
    fn minutes(value: &str) -> Option<u16> {
        let (hour, minute) = value.trim().split_once(':')?;
        let hour = hour.parse::<u16>().ok()?;
        let minute = minute.parse::<u16>().ok()?;
        (hour < 24 && minute < 60).then_some(hour * 60 + minute)
    }
    fn interval(value: &str) -> Option<(u16, u16)> {
        let (start, end) = value.split_once('-')?;
        let start = minutes(start)?;
        let end = minutes(end)?;
        (start < end).then_some((start, end))
    }
    match (interval(left), interval(right)) {
        (Some((left_start, left_end)), Some((right_start, right_end))) => {
            left_start < right_end && right_start < left_end
        }
        _ => left == right,
    }
}

fn render_room_card(ui: &mut Ui, room: &MeetingRoom, enabled: bool) -> bool {
    let mut clicked = false;
    egui::Frame::none()
        .fill(Color32::WHITE)
        .stroke(egui::Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
        .rounding(8.0)
        .inner_margin(egui::vec2(20.0, 18.0))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.horizontal_wrapped(|ui| {
                ui.label(RichText::new(&room.name).size(16.0).strong());
                crate::widgets::tag(
                    ui,
                    &room.status,
                    if room.status == "Trống" {
                        crate::widgets::TagTone::Success
                    } else {
                        crate::widgets::TagTone::Error
                    },
                );
            });
            ui.add_space(4.0);
            ui.label(
                RichText::new(format!(
                    "{} · Sức chứa {} người",
                    room.location, room.capacity
                ))
                .size(12.5)
                .color(Color32::from_rgb(100, 116, 139)),
            );
            ui.add_space(12.0);
            ui.label(
                RichText::new("Trang thiết bị:")
                    .size(11.5)
                    .color(Color32::from_rgb(100, 116, 139)),
            );
            ui.add_space(6.0);
            ui.horizontal_wrapped(|ui| {
                for item in &room.equipment {
                    crate::widgets::tag(ui, item, crate::widgets::TagTone::Neutral);
                }
                if room.equipment.is_empty() {
                    ui.small("Chưa khai báo thiết bị");
                }
            });
            ui.add_space(14.0);
            clicked = ui
                .add_enabled(
                    enabled && !room.status.eq_ignore_ascii_case("Bảo trì"),
                    egui::Button::new(
                        RichText::new("Đặt phòng này ngay").color(crate::theme::PRIMARY),
                    )
                    .min_size(egui::vec2(ui.available_width(), 32.0)),
                )
                .clicked();
        });
    clicked
}

fn render_room_settings(ui: &mut Ui) {
    let width = ui.available_width().min(840.0);
    egui::Frame::none().fill(Color32::WHITE).rounding(8.0)
        .stroke(egui::Stroke::new(1.0,Color32::from_rgb(226,232,240)))
        .inner_margin(24.0).show(ui,|ui| {
            ui.set_width((width-50.0).max(1.0));
            ui.label(RichText::new("Quy định & Chính sách Đặt phòng họp").size(16.0).strong());
            ui.add_space(24.0);
            let columns=if width>=600.0 {2}else{1};
            for labels in [
                ["Thời lượng họp tối đa một lượt (Phút)","Số ngày được phép đặt trước tối đa"],
                ["Tự động hủy lịch nếu không check-in sau","Gửi thông báo nhắc lịch trước"],
            ] {
                ui.columns(columns,|cols| {
                    for (index,label) in labels.into_iter().enumerate() {
                        let mut unknown=String::new();
                        cols[index%columns].add_enabled_ui(false,|ui|crate::widgets::form_input(ui,label,label,false,&mut unknown,"Chưa có cấu hình máy chủ",false));
                    }
                });
            }
            ui.add_space(8.0);ui.separator();ui.add_space(16.0);
            ui.label(RichText::new("Tích hợp Nền tảng Hội nghị Trực tuyến").size(14.0).strong());
            for (name,detail) in [
                ("Google Meet API","Tự động tạo link phòng họp ảo Google Meet khi đặt phòng"),
                ("Microsoft Teams Integration","Đồng bộ lịch phòng họp với Microsoft Outlook 365"),
                ("Thông báo qua Kênh Chat Nội bộ","Gửi bot thông báo lịch họp đến kênh #thông-báo-chung"),
            ] {
                ui.add_space(12.0);
                egui::Frame::none().fill(Color32::from_rgb(248,250,252)).rounding(6.0).inner_margin(egui::vec2(14.0,10.0)).show(ui,|ui| {
                    ui.set_width(ui.available_width());
                    ui.strong(name);
                    ui.label(RichText::new(detail).size(12.0).color(Color32::from_rgb(100,116,139)));
                    ui.label(RichText::new("Chưa kết nối").size(11.5).color(Color32::from_rgb(148,163,184)));
                });
            }
            ui.add_space(20.0);
            crate::widgets::action_row(ui,|ui| {ui.add_enabled(false,egui::Button::new("Lưu thiết lập")).on_disabled_hover_text("Chưa có API lưu cấu hình và tích hợp thật.");});
            ui.add_space(12.0);
            ui.label(RichText::new("Chưa có API lưu chính sách hoặc kết nối hội nghị; các trường đang bị khóa, không xác nhận cấu hình hay tự động hủy lịch.").size(12.0).color(Color32::from_rgb(146,64,14)));
        });
}

fn render_bookings(
    ui: &mut Ui,
    bookings: &[MeetingBooking],
    search: &str,
    can_cancel: bool,
    page: &mut usize,
    page_size: &mut usize,
    history: bool,
) -> Option<String> {
    let query = search.trim().to_lowercase();
    let visible = bookings
        .iter()
        .filter(|b| {
            query.is_empty()
                || b.room_name.to_lowercase().contains(&query)
                || b.meeting_title.to_lowercase().contains(&query)
                || b.booker.to_lowercase().contains(&query)
        })
        .collect::<Vec<_>>();
    *page_size = (*page_size).max(1);
    *page = (*page).min(visible.len().div_ceil(*page_size).max(1) - 1);
    let rows = visible
        .iter()
        .skip(*page * *page_size)
        .take(*page_size)
        .collect::<Vec<_>>();
    let width = (ui.available_width() - 2.0).max(950.0);
    let widths = if history {
        vec![
            width * 0.21,
            width * 0.25,
            width * 0.17,
            width * 0.11,
            width * 0.12,
            width * 0.06,
            width * 0.08,
        ]
    } else {
        vec![170.0, width - 730.0, 160.0, 180.0, 120.0, 100.0]
    };
    let titles: &[&str] = if history {
        &[
            "Phòng họp",
            "Tiêu đề cuộc họp",
            "Người chủ trì",
            "Ngày diễn ra",
            "Khung giờ",
            "Số người",
            "Trạng thái",
        ]
    } else {
        &[
            "Phòng họp",
            "Tiêu đề cuộc họp",
            "Thời gian & Khung giờ",
            "Người đặt & Số lượng",
            "Trạng thái",
            "Thao tác",
        ]
    };
    let cols = titles
        .iter()
        .enumerate()
        .map(|(i, title)| crate::widgets::TableColumn {
            title,
            width: widths[i],
        })
        .collect::<Vec<_>>();
    let mut cancel = None;
    crate::widgets::table_with_row_height(
        ui,
        "rooms.bookings",
        &cols,
        rows.len(),
        64.0,
        |ui, row, col| {
            let booking = rows[row];
            if history {
                match col {
                    0 => {
                        ui.label(
                            RichText::new(&booking.room_name)
                                .strong()
                                .color(crate::theme::PRIMARY),
                        );
                    }
                    1 => {
                        ui.label(&booking.meeting_title);
                    }
                    2 => {
                        ui.label(
                            RichText::new(&booking.booker).color(Color32::from_rgb(37, 99, 235)),
                        );
                    }
                    3 => {
                        ui.label(&booking.date);
                    }
                    4 => {
                        ui.label(&booking.time_slot);
                    }
                    5 => {
                        ui.label(format!("{} người", booking.participants_count));
                    }
                    _ => {
                        crate::widgets::tag(
                            ui,
                            &booking.status,
                            if booking.status == "Đã xác nhận" {
                                crate::widgets::TagTone::Success
                            } else if booking.status == "Đã hủy" {
                                crate::widgets::TagTone::Error
                            } else {
                                crate::widgets::TagTone::Neutral
                            },
                        );
                        if booking.status == "Đã xác nhận" {
                            ui.menu_button("…", |ui| {
                                if ui
                                    .add_enabled(can_cancel, egui::Button::new("Hủy lịch"))
                                    .clicked()
                                {
                                    cancel = Some(booking.key.clone());
                                    ui.close_menu();
                                }
                            });
                        }
                    }
                }
                return;
            }
            match col {
                0 => {
                    ui.label(
                        RichText::new(&booking.room_name)
                            .strong()
                            .color(crate::theme::PRIMARY),
                    );
                }
                1 => {
                    ui.label(RichText::new(&booking.meeting_title).strong());
                }
                2 => {
                    ui.label(RichText::new(&booking.date).color(Color32::from_rgb(37, 99, 235)));
                    ui.small(&booking.time_slot);
                }
                3 => {
                    ui.label(&booking.booker);
                    ui.small(format!("{} người tham gia", booking.participants_count));
                }
                4 => crate::widgets::tag(
                    ui,
                    &booking.status,
                    if booking.status == "Đã xác nhận" {
                        crate::widgets::TagTone::Success
                    } else {
                        crate::widgets::TagTone::Error
                    },
                ),
                _ => {
                    if booking.status == "Đã xác nhận"
                        && ui
                            .add_enabled(can_cancel, egui::Button::new("Hủy lịch"))
                            .clicked()
                    {
                        cancel = Some(booking.key.clone());
                    }
                }
            }
        },
    );
    ui.add_space(10.0);
    crate::widgets::pagination(
        ui,
        "rooms.bookings.pagination",
        page,
        visible.len(),
        page_size,
    );
    cancel
}

#[cfg(test)]
mod tests {
    use super::{MeetingRoomsView, TIME_SLOTS, time_slots_overlap};

    #[test]
    fn empty_calendar_keeps_horizontal_overflow_inside_its_scroll_area() {
        for width in [1440.0, 768.0, 390.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            crate::theme::apply_visuals(&ctx, false);
            let mut view = MeetingRoomsView::default();
            for _ in 0..3 {
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
                            view.render_calendar(ui, false);
                            assert!(
                                ui.min_rect().right() <= right + 1.0,
                                "calendar overflow at {width}: {:?}",
                                ui.min_rect()
                            );
                        });
                    },
                );
            }
        }
    }

    #[test]
    fn meeting_rooms_view_starts_from_api_empty_state_not_fabricated_rooms() {
        let view = MeetingRoomsView::default();
        assert!(view.rooms.is_empty());
        assert!(view.bookings.is_empty());
        assert_eq!(TIME_SLOTS.len(), 8);
    }

    #[test]
    fn calendar_detects_overlapping_intervals_but_not_adjacent_slots() {
        assert!(time_slots_overlap("09:30 - 10:30", "09:00 - 10:00"));
        assert!(!time_slots_overlap("09:00 - 10:00", "10:00 - 11:00"));
        assert!(!time_slots_overlap("09:00 - 10:00", "13:30 - 14:30"));
    }
}
