use crate::{models::Session, widgets};
use egui::{Color32, Pos2, RichText, Sense, Stroke, Ui, Vec2};

pub struct SignDoc {
    pub id: String,
    pub title: String,
    pub doc_type: String,
    pub date: String,
    pub status: String,
}

#[derive(Default)]
pub struct SignaturesView {
    pub strokes: Vec<Vec<Pos2>>,
    pub current_stroke: Vec<Pos2>,
    pub documents: Vec<SignDoc>,
    pub notice: String,
    loaded_for: Option<String>,
    search: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SignaturePage {
    Personal,
    Certificates,
    Verify,
    History,
    Providers,
    Signers,
    Alerts,
    Renew,
    Unknown,
}

impl SignaturePage {
    fn from_route(route: &str) -> Self {
        let route = route.trim_end_matches('/');
        match route {
            "/employee/digital-signature" | "/employee/digital-signature/my-signature" => {
                Self::Personal
            }
            "/admin/digital-signature"
            | "/admin/digital-signature/list"
            | "/admin/digital-signature/certs" => Self::Certificates,
            "/admin/digital-signature/verify" | "/employee/digital-signature/verify" => {
                Self::Verify
            }
            "/admin/digital-signature/history" | "/employee/digital-signature/history" => {
                Self::History
            }
            "/admin/digital-signature/providers" => Self::Providers,
            "/admin/digital-signature/signers" => Self::Signers,
            "/admin/digital-signature/alerts" => Self::Alerts,
            "/admin/digital-signature/renew" => Self::Renew,
            _ => Self::Unknown,
        }
    }

    fn title(self) -> &'static str {
        match self {
            Self::Personal => "Chữ ký số cá nhân",
            Self::Certificates => "Danh sách & Thông tin chứng thư số",
            Self::Verify => "Kiểm tra chữ ký số",
            Self::History => "Lịch sử ký số",
            Self::Providers => "Nhà cung cấp chữ ký số",
            Self::Signers => "Người được quyền ký số",
            Self::Alerts => "Cảnh báo hết hạn chứng thư",
            Self::Renew => "Gia hạn chữ ký số",
            Self::Unknown => "Không tìm thấy trang chữ ký số",
        }
    }
}

impl SignaturesView {
    fn select_account(&mut self, user_id: &str) {
        if self.loaded_for.as_deref() != Some(user_id) {
            *self = Self {
                loaded_for: Some(user_id.to_owned()),
                ..Self::default()
            };
        }
    }

    pub fn render(&mut self, ui: &mut Ui, session: &Session) {
        self.render_route(ui, session, "/employee/digital-signature/my-signature");
    }

    pub fn render_route(&mut self, ui: &mut Ui, session: &Session, route: &str) {
        self.select_account(&format!("{}:{}", session.user.id, session.session_id));
        if route.starts_with("/admin/") && session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            return;
        }
        let page = SignaturePage::from_route(route);
        ui.spacing_mut().item_spacing.y = 8.0;
        ui.add_space(8.0);
        widgets::heading(ui, page.title(), 20.0, 32.0, Color32::from_rgb(30, 41, 59));
        if page == SignaturePage::Unknown {
            return;
        }
        if page != SignaturePage::Personal {
            self.notice.clear();
            self.current_stroke.clear();
        }
        ui.add_space(8.0);
        match page {
            SignaturePage::Personal => self.render_personal(ui, session),
            SignaturePage::Verify => self.render_verification(ui),
            SignaturePage::History => self.render_history(ui, route.starts_with("/employee/")),
            _ => self.render_certificates(ui, page),
        }
    }

    fn render_personal(&mut self, ui: &mut Ui, session: &Session) {
        ui.label(format!(
            "Chữ ký định danh điện tử của {}",
            session.user.name
        ));
        unavailable(
            ui,
            "Chưa kết nối dịch vụ ký số, chứng thư CA hoặc xác minh eKYC. Mẫu vẽ chỉ nằm trong bộ nhớ phiên.",
        );
        if !self.notice.is_empty() {
            ui.label(RichText::new(&self.notice).color(Color32::from_rgb(71, 85, 105)));
        }
        ui.add_space(8.0);
        if ui.available_width() >= 760.0 {
            ui.columns(2, |cols| {
                self.render_pad(&mut cols[0]);
                identity_panel(&mut cols[1], session);
            });
        } else {
            self.render_pad(ui);
            ui.add_space(12.0);
            identity_panel(ui, session);
        }
        ui.add_space(16.0);
        widgets::heading(
            ui,
            "Tài liệu chờ ký",
            16.0,
            28.0,
            Color32::from_rgb(30, 41, 59),
        );
        ui.small("Chưa có dịch vụ tải danh sách tài liệu chờ ký cho tài khoản này.");
        let columns = [
            widgets::TableColumn {
                title: "Mã & Tên văn bản",
                width: 340.0,
            },
            widgets::TableColumn {
                title: "Phân loại",
                width: 180.0,
            },
            widgets::TableColumn {
                title: "Ngày ban hành",
                width: 170.0,
            },
            widgets::TableColumn {
                title: "Trạng thái nguồn",
                width: 210.0,
            },
            widgets::TableColumn {
                title: "Thao tác",
                width: 130.0,
            },
        ];
        widgets::table(
            ui,
            "signatures.documents",
            &columns,
            self.documents.len(),
            |ui, row, col| {
                let doc = &self.documents[row];
                match col {
                    0 => {
                        ui.label(RichText::new(&doc.title).strong());
                        ui.small(&doc.id);
                    }
                    1 => {
                        ui.label(&doc.doc_type);
                    }
                    2 => {
                        ui.label(&doc.date);
                    }
                    3 => {
                        widgets::tag(
                            ui,
                            if doc.status == "Đã ký số" {
                                "Nguồn báo đã ký · chưa xác minh"
                            } else {
                                &doc.status
                            },
                            widgets::TagTone::Warning,
                        );
                    }
                    _ => {
                        ui.add_enabled(false, egui::Button::new("Ký số"))
                            .on_hover_text("Chưa kết nối dịch vụ ký số/CA.");
                    }
                }
            },
        );
    }

    fn render_pad(&mut self, ui: &mut Ui) {
        egui::Frame::none().fill(Color32::WHITE)
            .stroke(Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
            .rounding(8.0).inner_margin(16.0).show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.label(RichText::new("Mẫu chữ ký viết tay").strong().color(crate::theme::PRIMARY));
                ui.small("Dùng chuột hoặc bút vẽ vào khung bên dưới.");
                let (response, painter) = ui.allocate_painter(
                    Vec2::new(ui.available_width().max(1.0), 180.0), Sense::drag());
                let rect = response.rect;
                response.widget_info(|| egui::WidgetInfo::labeled(egui::WidgetType::Other, true, "Khung vẽ mẫu chữ ký viết tay"));
                painter.rect_filled(rect, 6.0, Color32::from_rgb(248, 250, 252));
                painter.rect_stroke(rect.shrink(0.5), 6.0, Stroke::new(1.0, Color32::from_rgb(203, 213, 225)));
                if response.drag_started() {
                    self.current_stroke.clear();
                }
                if response.drag_started() || response.dragged() {
                    if let Some(pos) = response.interact_pointer_pos() {
                        self.current_stroke.push(normalized_point(rect, pos));
                        self.notice.clear();
                    }
                }
                if response.drag_stopped() && !self.current_stroke.is_empty() {
                    self.strokes.push(std::mem::take(&mut self.current_stroke));
                }
                for stroke in self.strokes.iter().chain(std::iter::once(&self.current_stroke)) {
                    if stroke.len() == 1 {
                        painter.circle_filled(canvas_point(rect, stroke[0]), 1.25, Color32::from_rgb(0, 77, 64));
                    }
                    for pair in stroke.windows(2) {
                        painter.line_segment([canvas_point(rect, pair[0]), canvas_point(rect, pair[1])], Stroke::new(2.5, Color32::from_rgb(0, 77, 64)));
                    }
                }
                if self.strokes.is_empty() && self.current_stroke.is_empty() {
                    painter.text(rect.center(), egui::Align2::CENTER_CENTER, "Vẽ chữ ký tại đây",
                        egui::FontId::proportional(13.0), Color32::from_rgb(148, 163, 184));
                }
                ui.add_space(8.0);
                ui.horizontal_wrapped(|ui| {
                    if ui.button("Xóa vẽ lại").clicked() {
                        self.strokes.clear();
                        self.current_stroke.clear();
                        self.notice.clear();
                    }
                    if ui.add_enabled(!self.strokes.is_empty(), egui::Button::new("Giữ mẫu trong phiên")).clicked() {
                        self.notice = "Mẫu nằm trong bộ nhớ phiên, chưa lưu lên máy chủ và chưa phải chữ ký số đã xác thực.".to_owned();
                    }
                });
            });
    }

    fn render_verification(&mut self, ui: &mut Ui) {
        ui.label("Kiểm tra chứng thư và chữ ký trong tài liệu điện tử");
        unavailable(
            ui,
            "Chưa có dịch vụ xác minh PKI trong ứng dụng Rust. Chưa kiểm tra tính toàn vẹn tài liệu, chuỗi tin cậy hoặc trạng thái thu hồi.",
        );
        egui::Frame::none()
            .fill(Color32::WHITE)
            .stroke(Stroke::new(1.0, Color32::from_rgb(203, 213, 225)))
            .rounding(8.0)
            .inner_margin(24.0)
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.vertical_centered(|ui| {
                    ui.add_space(16.0);
                    ui.label(
                        RichText::new("Chọn tài liệu cần kiểm tra")
                            .strong()
                            .size(16.0),
                    );
                    ui.label("PDF · XML · DOCX · XLSX · CER · CRT · P7S · P7B");
                    ui.small("Việc chọn và phân tích tệp sẽ khả dụng khi có dịch vụ xác minh.");
                    ui.add_space(12.0);
                    ui.add_enabled(false, egui::Button::new("Chọn tệp kiểm tra"))
                        .on_hover_text("Chưa kết nối dịch vụ xác minh chữ ký số.");
                    ui.add_enabled(false, egui::Button::new("Kiểm tra chữ ký số"));
                    ui.add_space(16.0);
                });
            });
        ui.add_space(12.0);
        widgets::heading(
            ui,
            "Kết quả xác minh",
            16.0,
            28.0,
            Color32::from_rgb(30, 41, 59),
        );
        for (label, value) in [
            ("Tính toàn vẹn văn bản", "Chưa kiểm tra"),
            ("Chữ ký mật mã / Chứng thư X.509", "Chưa kiểm tra"),
            ("Chuỗi tin cậy & CA gốc", "Chưa kiểm tra"),
            ("Thu hồi OCSP / CRL & Dấu thời gian", "Chưa kiểm tra"),
        ] {
            ui.horizontal_wrapped(|ui| {
                ui.label(label);
                widgets::tag(ui, value, widgets::TagTone::Neutral);
            });
        }
    }

    fn render_history(&mut self, ui: &mut Ui, employee: bool) {
        ui.label(if employee {
            "Lịch sử ký số tài liệu cá nhân"
        } else {
            "Lịch sử ký số tài liệu doanh nghiệp"
        });
        unavailable(
            ui,
            "Chưa có dịch vụ nhật ký ký số cho phiên này. Mẫu chữ ký viết tay không tạo lịch sử ký số.",
        );
        self.search_box(ui, "Tìm theo tên tài liệu, mã băm SHA-256...");
        let columns = if employee {
            vec![
                widgets::TableColumn {
                    title: "Thời gian ký",
                    width: 190.0,
                },
                widgets::TableColumn {
                    title: "Tài liệu ký số",
                    width: 320.0,
                },
                widgets::TableColumn {
                    title: "Mã băm toàn vẹn (SHA-256)",
                    width: 340.0,
                },
                widgets::TableColumn {
                    title: "Trạng thái",
                    width: 150.0,
                },
            ]
        } else {
            vec![
                widgets::TableColumn {
                    title: "Tài liệu ký số",
                    width: 280.0,
                },
                widgets::TableColumn {
                    title: "Thời gian ký",
                    width: 190.0,
                },
                widgets::TableColumn {
                    title: "Người ký",
                    width: 170.0,
                },
                widgets::TableColumn {
                    title: "Nhà cung cấp CA",
                    width: 160.0,
                },
                widgets::TableColumn {
                    title: "Mã băm SHA-256",
                    width: 300.0,
                },
                widgets::TableColumn {
                    title: "Trạng thái",
                    width: 150.0,
                },
            ]
        };
        widgets::table(ui, "signatures.history", &columns, 0, |_, _, _| {});
    }

    fn render_certificates(&mut self, ui: &mut Ui, page: SignaturePage) {
        unavailable(
            ui,
            "Chưa kết nối dịch vụ chứng thư số/CA. Chưa có chứng thư, người ký hoặc hiệu lực đã được xác minh.",
        );
        let metrics = ["Chứng thư số", "Còn hiệu lực", "Sắp hết hạn", "Đã hết hạn"].map(|label| {
            widgets::Metric {
                label,
                value: "—".to_owned(),
                detail: "Chưa có dữ liệu từ dịch vụ CA",
                color: crate::theme::PRIMARY,
                value_size: 24.0,
            }
        });
        if page == SignaturePage::Certificates {
            widgets::metrics(ui, "signatures.metrics", &metrics);
            ui.add_space(16.0);
        }
        self.search_box(ui, "Tìm số serial, nhà cung cấp, người ký...");
        let (headers, action): (&[&str], &str) = match page {
            // Legacy declares these menu routes without rendering their bodies.
            SignaturePage::Providers => (
                &["Nhà cung cấp dịch vụ CA", "Kết nối", "Trạng thái"],
                "Kết nối nhà cung cấp",
            ),
            SignaturePage::Signers => (
                &[
                    "Người được quyền ký",
                    "Chủ thể chứng thư",
                    "Số serial",
                    "Phạm vi ký",
                ],
                "Phân quyền ký",
            ),
            SignaturePage::Alerts => (
                &[
                    "Số serial chứng thư",
                    "Nhà cung cấp CA",
                    "Ngày hết hạn",
                    "Trạng thái",
                ],
                "Cấu hình cảnh báo",
            ),
            SignaturePage::Renew => (
                &[
                    "Số serial chứng thư",
                    "Nhà cung cấp CA",
                    "Thời hạn hiệu lực",
                    "Trạng thái",
                ],
                "Yêu cầu gia hạn",
            ),
            _ => (
                &[
                    "Số serial chứng thư",
                    "Nhà cung cấp CA",
                    "Chủ thể chứng thư",
                    "Loại hình ký số",
                    "Người được quyền ký",
                    "Thời hạn hiệu lực",
                    "Trạng thái",
                ],
                "Đăng ký chứng thư số",
            ),
        };
        widgets::action_row(ui, |ui| {
            ui.add_enabled(false, egui::Button::new(action))
                .on_hover_text("Chưa có dịch vụ chứng thư số/CA.");
        });
        ui.add_space(8.0);
        let columns = headers
            .iter()
            .map(|title| widgets::TableColumn {
                title,
                width: 200.0,
            })
            .collect::<Vec<_>>();
        widgets::table(ui, "signatures.certificates", &columns, 0, |_, _, _| {});
    }

    fn search_box(&mut self, ui: &mut Ui, hint: &str) {
        let width = ui.available_width().min(360.0);
        let (rect, _) = ui.allocate_exact_size(Vec2::new(width, 32.0), Sense::hover());
        ui.add_enabled_ui(false, |ui| {
            widgets::search_input(ui, rect, &mut self.search, hint)
                .on_hover_text("Tìm kiếm sẽ khả dụng khi có dữ liệu từ dịch vụ.");
        });
        ui.add_space(8.0);
    }
}

fn unavailable(ui: &mut Ui, text: &str) {
    egui::Frame::none()
        .fill(Color32::from_rgb(255, 251, 235))
        .stroke(Stroke::new(1.0, Color32::from_rgb(253, 230, 138)))
        .rounding(8.0)
        .inner_margin(12.0)
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.label(RichText::new(text).color(Color32::from_rgb(146, 64, 14)));
        });
}

fn identity_panel(ui: &mut Ui, session: &Session) {
    egui::Frame::none()
        .fill(Color32::WHITE)
        .stroke(Stroke::new(1.0, Color32::from_rgb(226, 232, 240)))
        .rounding(8.0)
        .inner_margin(16.0)
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            ui.label(
                RichText::new("Tài khoản & Chứng thư định danh")
                    .strong()
                    .color(crate::theme::PRIMARY),
            );
            ui.label(format!("Họ tên tài khoản: {}", session.user.name));
            ui.label(format!("Email tài khoản: {}", session.user.email));
            ui.separator();
            widgets::tag(ui, "eKYC · Chưa xác minh", widgets::TagTone::Warning);
            ui.label("Chứng thư, số serial, thuật toán: Chưa có dữ liệu");
            ui.label("Nhà cung cấp CA: Chưa kết nối");
            ui.small("Thông tin tài khoản chưa phải thông tin chủ thể chứng thư.");
        });
}

fn normalized_point(rect: egui::Rect, point: Pos2) -> Pos2 {
    Pos2::new(
        ((point.x - rect.left()) / rect.width().max(1.0)).clamp(0.0, 1.0),
        ((point.y - rect.top()) / rect.height().max(1.0)).clamp(0.0, 1.0),
    )
}

fn canvas_point(rect: egui::Rect, point: Pos2) -> Pos2 {
    rect.min + egui::vec2(point.x * rect.width(), point.y * rect.height())
}
#[cfg(test)]
mod tests {
    use super::*;

    fn session() -> Session {
        Session {
            token: String::new(),
            session_id: "session-a".to_owned(),
            endpoint: String::new(),
            mode: crate::models::StorageMode::LocalAdmin,
            user: crate::models::User {
                id: "a".to_owned(),
                email: "a@example.test".to_owned(),
                name: "Nguyễn An".to_owned(),
                role: "ADMIN".to_owned(),
                is_active: true,
            },
        }
    }

    fn shape_text(shape: &egui::Shape, text: &mut String) {
        match shape {
            egui::Shape::Text(value) => {
                text.push_str(&value.galley.job.text);
                text.push('\n');
            }
            egui::Shape::Vec(shapes) => {
                for shape in shapes {
                    shape_text(shape, text);
                }
            }
            _ => {}
        }
    }

    #[test]
    fn route_rendering_keeps_canvas_out_of_verification_and_history() {
        for width in [420.0, 1280.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::theme::setup_style(&ctx);
            let mut view = SignaturesView::default();
            for (route, expected) in [
                (
                    "/employee/digital-signature/my-signature",
                    "Mẫu chữ ký viết tay",
                ),
                ("/employee/digital-signature/verify", "Kết quả xác minh"),
                ("/admin/digital-signature/verify", "Kết quả xác minh"),
                (
                    "/employee/digital-signature/history",
                    "Lịch sử ký số tài liệu cá nhân",
                ),
                (
                    "/admin/digital-signature/history",
                    "Lịch sử ký số tài liệu doanh nghiệp",
                ),
                ("/admin/digital-signature/list", "Đăng ký chứng thư số"),
                ("/admin/digital-signature/certs", "Đăng ký chứng thư số"),
                ("/admin/digital-signature/providers", "Kết nối nhà cung cấp"),
                ("/admin/digital-signature/signers", "Phân quyền ký"),
                ("/admin/digital-signature/alerts", "Cấu hình cảnh báo"),
                ("/admin/digital-signature/renew", "Yêu cầu gia hạn"),
            ] {
                let mut text = String::new();
                for _ in 0..2 {
                    let output = ctx.run(
                        egui::RawInput {
                            screen_rect: Some(egui::Rect::from_min_size(
                                Pos2::ZERO,
                                Vec2::new(width, 1100.0),
                            )),
                            ..Default::default()
                        },
                        |ctx| {
                            egui::CentralPanel::default()
                                .show(ctx, |ui| view.render_route(ui, &session(), route));
                        },
                    );
                    text.clear();
                    for shape in &output.shapes {
                        shape_text(&shape.shape, &mut text);
                    }
                }
                assert!(text.contains(expected), "{route} at {width}: {text}");
                if SignaturePage::from_route(route) != SignaturePage::Personal {
                    assert!(!text.contains("Xóa vẽ lại"), "{route}");
                }
                assert!(view.documents.is_empty());
                assert!(!text.contains("Thành công"));
            }
        }
        assert_eq!(
            SignaturePage::from_route("/employee/digital-signature/verify/"),
            SignaturePage::Verify
        );
        assert_eq!(
            SignaturePage::from_route("/unrelated/verify"),
            SignaturePage::Unknown
        );
    }

    #[test]
    fn changing_session_clears_private_drawing_even_for_the_same_account() {
        let mut view = SignaturesView::default();
        view.select_account("a:session-a");
        view.strokes.push(vec![Pos2::new(0.2, 0.5)]);
        view.select_account("a:session-b");
        assert!(view.strokes.is_empty());
    }
    #[test]
    fn production_signature_view_has_no_fabricated_signed_documents() {
        assert!(SignaturesView::default().documents.is_empty());
    }
    #[test]
    fn changing_accounts_clears_signature_and_notices() {
        let mut view = SignaturesView::default();
        view.select_account("a");
        view.strokes.push(vec![Pos2::new(0.2, 0.5)]);
        view.notice = "Private".to_owned();
        view.select_account("b");
        assert!(view.strokes.is_empty());
        assert!(view.notice.is_empty());
    }
    #[test]
    fn handwritten_points_stay_inside_resized_canvas() {
        let rect = egui::Rect::from_min_size(Pos2::new(100.0, 100.0), Vec2::new(200.0, 100.0));
        let p = normalized_point(rect, Pos2::new(200.0, 150.0));
        assert_eq!(p, Pos2::new(0.5, 0.5));
        let small = egui::Rect::from_min_size(Pos2::ZERO, Vec2::new(80.0, 60.0));
        assert_eq!(canvas_point(small, p), small.center());
        assert_eq!(
            normalized_point(rect, Pos2::new(800.0, 0.0)),
            Pos2::new(1.0, 0.0)
        );
    }
}
