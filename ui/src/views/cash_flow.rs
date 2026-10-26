use std::{collections::HashMap, time::Duration};

use egui::{Color32, RichText, Ui};
use web_time::Instant;

use crate::{
    api::{ApiClient, ApiTask, FinanceCashTransaction, FinanceCashTransactionsResponse},
    models::Session,
};

const PAGE_SIZE: usize = 10;
const REFRESH_INTERVAL: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, PartialEq, Eq)]
struct CashFlowRow {
    category: String,
    receipts: i64,
    disbursements: i64,
    net: i64,
    vouchers: usize,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct CashFlowTotals {
    receipts: i64,
    disbursements: i64,
    pending_vouchers: usize,
}

#[derive(Default)]
pub struct CashFlowView {
    transactions: Vec<FinanceCashTransaction>,
    task: Option<ApiTask<FinanceCashTransactionsResponse>>,
    loaded_for: Option<String>,
    last_load: Option<Instant>,
    needs_reload: bool,
    page: usize,
    page_size: usize,
    data_loaded: bool,
    error: String,
}

impl CashFlowView {
    pub fn render(&mut self, ui: &mut Ui, ctx: &egui::Context, session: &Session, api: &ApiClient) {
        if self.loaded_for.as_deref() != Some(session.user.id.as_str()) {
            *self = Self {
                loaded_for: Some(session.user.id.clone()),
                needs_reload: true,
                page_size: PAGE_SIZE,
                ..Self::default()
            };
        }

        if session.user.role != "ADMIN" {
            ui.heading("Không đủ quyền");
            ui.label("Tổng quan dòng tiền hiện chỉ dành cho quản trị viên.");
            return;
        }

        if self.needs_reload
            || (self.task.is_none()
                && self
                    .last_load
                    .is_none_or(|last| last.elapsed() >= REFRESH_INTERVAL))
        {
            self.task = Some(api.list_finance_cash_transactions_task(session, None));
            self.needs_reload = false;
        }

        if let Some(result) = self.task.as_ref().and_then(ApiClient::poll) {
            self.task = None;
            self.last_load = Some(Instant::now());
            match result {
                Ok(response) => {
                    self.transactions = response.data;
                    self.data_loaded = true;
                    self.error.clear();
                }
                Err(error) => self.error = error,
            }
        }
        if self.task.is_some() {
            ctx.request_repaint_after(Duration::from_millis(100));
        } else {
            ctx.request_repaint_after(REFRESH_INTERVAL);
        }

        if self.render_content(ui) {
            self.needs_reload = true;
        }
    }

    fn render_content(&mut self, ui: &mut Ui) -> bool {
        ui.spacing_mut().item_spacing.y = 0.0;
        ui.add_space(8.0);
        let width = ui.available_width();
        let description =
            "Tổng hợp trực tiếp từ các phiếu thu, phiếu chi và quỹ tiền mặt đã hoàn thành.";
        let mut job = egui::text::LayoutJob::default();
        job.wrap.max_width = width.min(444.671875);
        job.append(
            description,
            0.0,
            egui::TextFormat {
                font_id: egui::FontId::proportional(13.0),
                line_height: Some(19.5),
                color: Color32::from_rgb(100, 116, 139),
                ..Default::default()
            },
        );
        let subtitle = ui.fonts(|f| f.layout_job(job));
        let text_height = 34.0 + subtitle.rows.len().max(1) as f32 * 19.5;
        let wrap_actions = width < 565.75;
        let (header, _) = ui.allocate_exact_size(
            egui::vec2(width, text_height + if wrap_actions { 44.0 } else { 0.0 }),
            egui::Sense::hover(),
        );
        ui.painter().text(
            header.min + egui::vec2(0.0, 15.0),
            egui::Align2::LEFT_CENTER,
            "Tổng quan dòng tiền",
            crate::native_text::weighted_font(ui.ctx(), 20.0, true),
            Color32::from_rgb(15, 23, 42),
        );
        ui.painter().galley(
            header.min + egui::vec2(0.0, 34.0),
            subtitle,
            Color32::from_rgb(100, 116, 139),
        );
        let refresh_rect = egui::Rect::from_min_size(
            header.min
                + if wrap_actions {
                    egui::vec2(0.0, text_height + 12.0)
                } else {
                    egui::vec2(width - 109.078125, 0.0)
                },
            egui::vec2(109.078125, 32.0),
        );
        let mut refresh = false;
        ui.add_enabled_ui(self.task.is_none(), |ui| {
            refresh = crate::widgets::put(
                ui,
                refresh_rect,
                egui::Button::image_and_text(
                    egui::Image::from_bytes(
                        "bytes://cash-flow-refresh.svg",
                        include_bytes!("../../assets/nav-icons/ReloadOutlined.svg"),
                    )
                    .fit_to_exact_size(egui::Vec2::splat(14.0)),
                    "Làm mới",
                ),
            )
            .clicked();
        });
        crate::visual_test::record("cash.flow.header", header);
        ui.add_space(16.0);
        let totals = summarize_totals(&self.transactions);
        let rows = summarize_rows(&self.transactions);
        let unknown = !self.data_loaded;
        let net = totals.receipts.saturating_sub(totals.disbursements);
        crate::widgets::metrics_grid(
            ui,
            "cash.flow.metrics",
            &[
                crate::widgets::Metric {
                    label: "Tổng tiền thực thu",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("+{} ₫", format_money(totals.receipts))
                    },
                    detail: "",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Tổng tiền thực chi",
                    value: if unknown {
                        "—".into()
                    } else {
                        format!("-{} ₫", format_money(totals.disbursements))
                    },
                    detail: "",
                    color: Color32::from_rgb(220, 38, 38),
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Dòng tiền thuần phát sinh",
                    value: if unknown {
                        "—".into()
                    } else {
                        format_signed_money(net)
                    },
                    detail: "",
                    color: if net >= 0 {
                        crate::theme::PRIMARY
                    } else {
                        Color32::from_rgb(220, 38, 38)
                    },
                    value_size: 24.0,
                },
                crate::widgets::Metric {
                    label: "Chứng từ chờ duyệt",
                    value: if unknown {
                        "—".into()
                    } else {
                        totals.pending_vouchers.to_string()
                    },
                    detail: "",
                    color: Color32::from_rgb(217, 119, 6),
                    value_size: 24.0,
                },
            ],
            egui::vec2(18.0, 14.0),
            220.0,
            4.0,
        );
        ui.add_space(16.0);
        if !self.error.is_empty() {
            ui.colored_label(Color32::from_rgb(185, 28, 28), &self.error);
            ui.label(if unknown {
                "Chưa thể tính dòng tiền vì dữ liệu chưa tải được."
            } else {
                "Đang giữ số liệu của lần tải thành công gần nhất."
            });
            refresh |= ui.button("Thử lại").clicked();
        }
        if self.transactions.is_empty() && self.task.is_some() {
            ui.spinner();
            ui.label("Đang tải sổ thu chi…");
        } else if !unknown {
            self.page_size = self.page_size.max(1);
            let page_count = rows.len().div_ceil(self.page_size).max(1);
            self.page = self.page.clamp(1, page_count);
            let visible = rows
                .iter()
                .skip((self.page - 1) * self.page_size)
                .take(self.page_size)
                .collect::<Vec<_>>();
            let table_columns = [
                crate::widgets::TableColumn {
                    title: "Nội dung thu chi",
                    width: (width - 702.0).max(119.625),
                },
                crate::widgets::TableColumn {
                    title: "Số phiếu hoàn thành",
                    width: 160.0,
                },
                crate::widgets::TableColumn {
                    title: "Thu",
                    width: 180.0,
                },
                crate::widgets::TableColumn {
                    title: "Chi",
                    width: 180.0,
                },
                crate::widgets::TableColumn {
                    title: "Thuần",
                    width: 180.0,
                },
            ];
            crate::widgets::table_with_row_height(
                ui,
                "cash.flow.table",
                &table_columns,
                visible.len(),
                56.25,
                |ui, row, col| {
                    let row = visible[row];
                    match col {
                        0 => {
                            ui.label(
                                RichText::new(&row.category)
                                    .strong()
                                    .color(Color32::from_rgb(15, 23, 42)),
                            );
                        }
                        1 => {
                            ui.label(format!("{} phiếu", row.vouchers));
                        }
                        2 => {
                            ui.colored_label(
                                Color32::from_rgb(22, 163, 74),
                                if row.receipts == 0 {
                                    "—".to_owned()
                                } else {
                                    format!("+{} ₫", format_money(row.receipts))
                                },
                            );
                        }
                        3 => {
                            ui.colored_label(
                                Color32::from_rgb(220, 38, 38),
                                if row.disbursements == 0 {
                                    "—".to_owned()
                                } else {
                                    format!("-{} ₫", format_money(row.disbursements))
                                },
                            );
                        }
                        _ => crate::widgets::tag(
                            ui,
                            &format_signed_money(row.net),
                            if row.net >= 0 {
                                crate::widgets::TagTone::Success
                            } else {
                                crate::widgets::TagTone::Error
                            },
                        ),
                    }
                },
            );
            ui.add_space(10.0);
            let mut page = self.page - 1;
            crate::widgets::pagination(
                ui,
                "cash.flow.pagination",
                &mut page,
                rows.len(),
                &mut self.page_size,
            );
            self.page = page + 1;
            if rows.is_empty() {
                ui.add_space(12.0);
                ui.label(
                    RichText::new("Chưa có chứng từ hoàn thành để tính dòng tiền.")
                        .size(13.0)
                        .color(Color32::from_rgb(100, 116, 139)),
                );
            }
        }
        refresh
    }
}

fn summarize_totals(transactions: &[FinanceCashTransaction]) -> CashFlowTotals {
    let mut totals = CashFlowTotals::default();
    for transaction in transactions {
        match transaction.status.as_str() {
            "Chờ duyệt" => totals.pending_vouchers += 1,
            "Đã hoàn thành" if transaction.transaction_type == "Thu" => {
                totals.receipts = totals.receipts.saturating_add(transaction.amount);
            }
            "Đã hoàn thành" if transaction.transaction_type == "Chi" => {
                totals.disbursements = totals.disbursements.saturating_add(transaction.amount);
            }
            _ => {}
        }
    }
    totals
}

fn summarize_rows(transactions: &[FinanceCashTransaction]) -> Vec<CashFlowRow> {
    let mut indexes = HashMap::<String, usize>::new();
    let mut rows = Vec::<CashFlowRow>::new();
    for transaction in transactions
        .iter()
        .filter(|transaction| transaction.status == "Đã hoàn thành")
    {
        let index = if let Some(index) = indexes.get(&transaction.category) {
            *index
        } else {
            let index = rows.len();
            indexes.insert(transaction.category.clone(), index);
            rows.push(CashFlowRow {
                category: transaction.category.clone(),
                receipts: 0,
                disbursements: 0,
                net: 0,
                vouchers: 0,
            });
            index
        };
        let row = &mut rows[index];
        if transaction.transaction_type == "Thu" {
            row.receipts = row.receipts.saturating_add(transaction.amount);
        } else if transaction.transaction_type == "Chi" {
            row.disbursements = row.disbursements.saturating_add(transaction.amount);
        }
        row.net = row.receipts.saturating_sub(row.disbursements);
        row.vouchers += 1;
    }
    rows.sort_by(|left, right| right.net.unsigned_abs().cmp(&left.net.unsigned_abs()));
    rows
}

fn format_money(amount: i64) -> String {
    crate::views::employees::format_vnd(amount.unsigned_abs())
}

fn format_signed_money(amount: i64) -> String {
    let sign = if amount < 0 { "−" } else { "+" };
    format!("{sign}{} ₫", format_money(amount))
}

#[cfg(test)]
mod tests {
    use super::{CashFlowTotals, PAGE_SIZE, summarize_rows, summarize_totals};
    use crate::api::FinanceCashTransaction;

    #[test]
    fn cash_flow_keeps_table_overflow_inside_mobile_viewport_and_error_is_not_zero() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            for failed in [false, true] {
                let ctx = egui::Context::default();
                crate::native_text::setup_fonts(&ctx);
                crate::native_text::setup_style(&ctx);
                let mut view = super::CashFlowView {
                    data_loaded: !failed,
                    page_size: PAGE_SIZE,
                    ..Default::default()
                };
                if failed {
                    view.error = "fixture server failure".to_owned();
                }
                let output = ctx.run(
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
                            assert!(!view.render_content(ui));
                            assert!(ui.min_rect().right() <= right, "overflow at {width}");
                        });
                    },
                );
                let texts = output
                    .shapes
                    .iter()
                    .filter_map(|s| match &s.shape {
                        egui::Shape::Text(t) => Some(t.galley.text()),
                        _ => None,
                    })
                    .collect::<Vec<_>>();
                assert_eq!(
                    texts.contains(&"+0 ₫"),
                    !failed,
                    "unavailable data must not claim zero income"
                );
                if failed {
                    assert!(texts.contains(&"fixture server failure"));
                }
            }
        }
    }

    fn voucher(
        id: &str,
        category: &str,
        transaction_type: &str,
        amount: i64,
        status: &str,
    ) -> FinanceCashTransaction {
        FinanceCashTransaction {
            key: id.to_owned(),
            code: format!("{id}-CODE"),
            transaction_type: transaction_type.to_owned(),
            source: "bank".to_owned(),
            category: category.to_owned(),
            amount,
            date: "2026-10-08".to_owned(),
            recipient_or_payer: "Đối tác".to_owned(),
            account: "Tài khoản".to_owned(),
            status: status.to_owned(),
            note: String::new(),
            department: String::new(),
            employee_code: String::new(),
            created_at: "2026-10-08T00:00:00Z".to_owned(),
            updated_at: "2026-10-08T00:00:00Z".to_owned(),
        }
    }

    #[test]
    fn totals_include_only_completed_vouchers_and_count_pending() {
        let transactions = [
            voucher("1", "Dịch vụ", "Thu", 900, "Đã hoàn thành"),
            voucher("2", "Văn phòng", "Chi", 250, "Đã hoàn thành"),
            voucher("3", "Dịch vụ", "Chi", 400, "Chờ duyệt"),
            voucher("4", "Dịch vụ", "Thu", 100, "Đã hủy"),
        ];
        assert_eq!(
            summarize_totals(&transactions),
            CashFlowTotals {
                receipts: 900,
                disbursements: 250,
                pending_vouchers: 1,
            }
        );
    }

    #[test]
    fn rows_group_completed_vouchers_and_sort_by_absolute_net() {
        let transactions = [
            voucher("1", "Dịch vụ", "Thu", 900, "Đã hoàn thành"),
            voucher("2", "Dịch vụ", "Chi", 200, "Đã hoàn thành"),
            voucher("3", "Văn phòng", "Chi", 1_500, "Đã hoàn thành"),
            voucher("4", "Dịch vụ", "Thu", 500, "Chờ duyệt"),
        ];
        let rows = summarize_rows(&transactions);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].category, "Văn phòng");
        assert_eq!(rows[0].disbursements, 1_500);
        assert_eq!(rows[0].net, -1_500);
        assert_eq!(rows[1].category, "Dịch vụ");
        assert_eq!(rows[1].receipts, 900);
        assert_eq!(rows[1].disbursements, 200);
        assert_eq!(rows[1].net, 700);
        assert_eq!(rows[1].vouchers, 2);
    }

    #[test]
    fn equal_net_groups_keep_first_seen_order_from_the_legacy_ledger() {
        let transactions = [
            voucher("1", "Nội dung Z", "Thu", 500, "Đã hoàn thành"),
            voucher("2", "Nội dung A", "Chi", 500, "Đã hoàn thành"),
        ];
        let rows = summarize_rows(&transactions);
        assert_eq!(rows[0].category, "Nội dung Z");
        assert_eq!(rows[1].category, "Nội dung A");
    }
}
