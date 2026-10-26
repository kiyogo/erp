use crate::{
    api::{ApiClient, ApiTask, ContractSummary, ContractsResponse, EmployeeListResponse},
    models::{Employee, Session},
    widgets::{self, Metric},
};
use chrono::{Datelike, NaiveDate, Utc};
use egui::{Color32, RichText, Ui};
use std::{collections::BTreeMap, time::Duration};

#[derive(Default)]
pub struct HrOverviewView {
    account: String,
    employees: Vec<Employee>,
    contracts: Vec<ContractSummary>,
    employee_task: Option<ApiTask<EmployeeListResponse>>,
    contract_task: Option<ApiTask<ContractsResponse>>,
    employees_loaded: bool,
    contracts_loaded: bool,
    employee_error: String,
    contract_error: String,
    reload: bool,
}

impl HrOverviewView {
    pub fn reset(&mut self) {
        *self = Self::default();
    }
    pub fn render(&mut self, ui: &mut Ui, session: &Session, api: &ApiClient) {
        if session.user.role != "ADMIN" {
            self.reset();
            ui.heading("Không đủ quyền");
            return;
        }
        let account = format!(
            "{}:{}:{}",
            session.endpoint, session.user.id, session.session_id
        );
        if self.account != account {
            *self = Self {
                account,
                reload: true,
                ..Default::default()
            };
        }
        if self.reload && self.employee_task.is_none() && self.contract_task.is_none() {
            self.employee_error.clear();
            self.contract_error.clear();
            self.employee_task = Some(api.list_employees_task(session));
            self.contract_task = Some(api.list_contracts_task(session));
            self.reload = false;
        }
        if let Some(result) = self.employee_task.as_ref().and_then(ApiClient::poll) {
            self.employee_task = None;
            match result {
                Ok(r) => {
                    self.employees = r.data.into_iter().filter(|e| e.role != "ADMIN").collect();
                    self.employees_loaded = true;
                }
                Err(e) => self.employee_error = e,
            }
        }
        if let Some(result) = self.contract_task.as_ref().and_then(ApiClient::poll) {
            self.contract_task = None;
            match result {
                Ok(r) => {
                    self.contracts = r.data;
                    self.contracts_loaded = true;
                }
                Err(e) => self.contract_error = e,
            }
        }
        if self.employee_task.is_some() || self.contract_task.is_some() {
            ui.ctx().request_repaint_after(Duration::from_millis(80));
        }
        self.render_content(ui, Utc::now().date_naive());
    }

    fn render_content(&mut self, ui: &mut Ui, today: NaiveDate) {
        let active = self
            .employees
            .iter()
            .filter(|e| e.status != "Đã nghỉ việc")
            .collect::<Vec<_>>();
        let official = active.iter().filter(|e| e.status == "Chính thức").count();
        let probation = active.iter().filter(|e| e.status == "Thử việc").count();
        let retired = self.employees.len() - active.len();
        let new_count = active
            .iter()
            .filter(|e| {
                NaiveDate::parse_from_str(&e.join_date, "%Y-%m-%d")
                    .is_ok_and(|date| date.year() == today.year() && date.month() == today.month())
            })
            .count();
        let payroll = active.iter().try_fold(0_u64, |sum, e| {
            sum.checked_add(u64::try_from(e.salary_base).ok()?)
        });
        let (expiring, expired, pending) = contract_alert_counts(&self.contracts, today);
        let known_count = |count: usize, known: bool| {
            if known {
                count.to_string()
            } else {
                "—".into()
            }
        };
        let official_detail = if self.employees_loaded {
            format!(
                "{:.1}% chính thức · {probation} thử việc",
                fraction(official, active.len()) * 100.0
            )
        } else {
            "Chưa có dữ liệu từ máy chủ".into()
        };
        let new_detail = if self.employees_loaded {
            format!("{new_count} nhân sự vào làm trong tháng này")
        } else {
            "Chưa có dữ liệu từ máy chủ".into()
        };
        let contract_detail = if self.contracts_loaded {
            format!("{expiring} sắp hết hạn · {pending} chờ ký")
        } else {
            "Chưa có dữ liệu hợp đồng".into()
        };
        ui.add_space(8.0);
        widgets::metrics_with_padding(
            ui,
            "hr.overview.metrics",
            &[
                Metric {
                    label: "Tổng nhân sự đang hoạt động",
                    value: known_count(active.len(), self.employees_loaded),
                    detail: &new_detail,
                    color: crate::theme::PRIMARY,
                    value_size: 26.0,
                },
                Metric {
                    label: "Cơ cấu trạng thái nhân sự",
                    value: if self.employees_loaded {
                        format!("{official} / {}", active.len())
                    } else {
                        "—".into()
                    },
                    detail: &official_detail,
                    color: Color32::from_rgb(37, 99, 235),
                    value_size: 26.0,
                },
                Metric {
                    label: "Quỹ lương cơ bản / tháng",
                    value: if self.employees_loaded {
                        payroll
                            .map(|v| format!("{} VNĐ", crate::views::employees::format_vnd(v)))
                            .unwrap_or_else(|| "Chưa đủ dữ liệu".into())
                    } else {
                        "—".into()
                    },
                    detail: "Tính từ hồ sơ nhân sự đang hoạt động",
                    color: Color32::from_rgb(22, 163, 74),
                    value_size: 26.0,
                },
                Metric {
                    label: "Tình trạng hợp đồng cần lưu ý",
                    value: known_count(expiring + pending, self.contracts_loaded),
                    detail: &contract_detail,
                    color: Color32::from_rgb(124, 58, 237),
                    value_size: 26.0,
                },
            ],
            egui::vec2(18.0, 16.0),
        );
        ui.add_space(18.0);
        for error in [&self.employee_error, &self.contract_error] {
            if !error.is_empty() {
                ui.colored_label(Color32::DARK_RED, error);
            }
        }
        let mut departments = BTreeMap::<String, usize>::new();
        for employee in &active {
            let name = employee.department.trim();
            *departments
                .entry(if name.is_empty() {
                    "Chưa phân bổ".into()
                } else {
                    name.into()
                })
                .or_default() += 1;
        }
        let mut departments = departments.into_iter().collect::<Vec<_>>();
        departments.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
        if ui.available_width() >= 830.0 {
            ui.columns(2, |cols| {
                render_departments(
                    &mut cols[0],
                    &departments,
                    active.len(),
                    self.employees_loaded,
                );
                self.render_signals(
                    &mut cols[1],
                    official,
                    active.len(),
                    retired,
                    expiring,
                    expired,
                    pending,
                );
            });
        } else {
            render_departments(ui, &departments, active.len(), self.employees_loaded);
            ui.add_space(16.0);
            self.render_signals(
                ui,
                official,
                active.len(),
                retired,
                expiring,
                expired,
                pending,
            );
        }
        ui.add_space(12.0);
        if ui
            .add_enabled(
                self.employee_task.is_none() && self.contract_task.is_none(),
                egui::Button::new("Làm mới"),
            )
            .clicked()
        {
            self.reload = true;
        }
        if self.employee_task.is_some() || self.contract_task.is_some() {
            ui.horizontal(|ui| {
                ui.spinner();
                ui.label("Đang đồng bộ dữ liệu tổng quan nhân sự…");
            });
        }
    }

    fn render_signals(
        &self,
        ui: &mut Ui,
        official: usize,
        active: usize,
        retired: usize,
        expiring: usize,
        expired: usize,
        pending: usize,
    ) {
        let width = ui.available_width();
        egui::Frame::group(ui.style())
            .fill(Color32::WHITE)
            .inner_margin(20.0)
            .show(ui, |ui| {
                ui.set_width((width - 42.0).max(1.0));
                ui.strong("Chỉ Số Vận Hành Nhân Sự");
                ui.add_space(14.0);
                if self.employees_loaded {
                    ui.label(format!("Nhân sự chính thức: {official}/{active}"));
                    progress(
                        ui,
                        fraction(official, active),
                        Color32::from_rgb(37, 99, 235),
                    );
                    ui.add_space(14.0);
                    ui.label(format!("Nhân sự đã nghỉ việc: {retired} hồ sơ"));
                    progress(
                        ui,
                        fraction(retired, self.employees.len()),
                        Color32::from_rgb(220, 38, 38),
                    );
                } else {
                    ui.label("Chưa tải được hồ sơ nhân sự.");
                }
                ui.add_space(18.0);
                ui.strong("Cảnh báo nhân sự cần xử lý");
                if !self.contracts_loaded {
                    ui.label("Chưa tải được dữ liệu hợp đồng để kiểm tra cảnh báo.");
                } else if expiring + expired + pending == 0 {
                    ui.label("Chưa phát hiện cảnh báo từ các hợp đồng hiện có.");
                } else {
                    ui.label(format!("{expiring} hợp đồng sắp hết hạn trong 30 ngày"));
                    ui.label(format!("{expired} hợp đồng quá hạn"));
                    ui.label(format!(
                        "{pending} hợp đồng chờ ký (theo trạng thái khai báo)"
                    ));
                }
                ui.add_space(16.0);
                ui.horizontal_wrapped(|ui| {
                    ui.label(format!(
                        "Hợp đồng quá hạn: {}",
                        if self.contracts_loaded {
                            expired.to_string()
                        } else {
                            "—".into()
                        }
                    ));
                    ui.label(format!(
                        "Hợp đồng chờ ký: {}",
                        if self.contracts_loaded {
                            pending.to_string()
                        } else {
                            "—".into()
                        }
                    ));
                });
            });
    }
}

fn render_departments(ui: &mut Ui, departments: &[(String, usize)], total: usize, known: bool) {
    let width = ui.available_width();
    egui::Frame::group(ui.style())
        .fill(Color32::WHITE)
        .inner_margin(20.0)
        .show(ui, |ui| {
            ui.set_width((width - 42.0).max(1.0));
            ui.strong("Phân Bổ Nhân Sự Theo Phòng Ban");
            ui.add_space(14.0);
            if departments.is_empty() {
                ui.label(if known {
                    "Chưa có dữ liệu nhân sự để tổng hợp."
                } else {
                    "Đang tải dữ liệu nhân sự…"
                });
            }
            for (name, count) in departments {
                ui.add(
                    egui::Label::new(
                        RichText::new(format!(
                            "{name}: {count} người ({:.0}%)",
                            fraction(*count, total) * 100.0
                        ))
                        .strong(),
                    )
                    .wrap(),
                );
                ui.add_space(4.0);
                progress(ui, fraction(*count, total), crate::theme::PRIMARY);
                ui.add_space(14.0);
            }
        });
}
fn progress(ui: &mut Ui, value: f32, color: Color32) {
    let (rect, _) =
        ui.allocate_exact_size(egui::vec2(ui.available_width(), 8.0), egui::Sense::hover());
    ui.painter()
        .rect_filled(rect, 4.0, Color32::from_rgb(241, 245, 249));
    if value > 0.0 {
        ui.painter().rect_filled(
            egui::Rect::from_min_size(
                rect.min,
                egui::vec2(rect.width() * value.clamp(0.0, 1.0), rect.height()),
            ),
            4.0,
            color,
        );
    }
}
fn fraction(count: usize, total: usize) -> f32 {
    if total == 0 {
        0.0
    } else {
        count as f32 / total as f32
    }
}
fn contract_alert_counts(contracts: &[ContractSummary], today: NaiveDate) -> (usize, usize, usize) {
    let (mut soon, mut expired, mut pending) = (0, 0, 0);
    for contract in contracts {
        if let Ok(end) = NaiveDate::parse_from_str(&contract.end_date, "%Y-%m-%d") {
            let days = (end - today).num_days();
            if (0..=30).contains(&days) {
                soon += 1;
            } else if days < 0 {
                expired += 1;
            }
        }
        if contract.status == "Chờ ký"
            || contract.employee_sign_status == "Chưa ký"
            || contract.company_sign_status == "Chưa ký"
        {
            pending += 1;
        }
    }
    (soon, expired, pending)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn contract_alerts_use_real_current_date_and_keep_missing_dates_unknown() {
        let today = NaiveDate::from_ymd_opt(2026, 10, 25).unwrap();
        let contracts = vec![
            ContractSummary {
                end_date: "2026-10-24".into(),
                ..Default::default()
            },
            ContractSummary {
                end_date: "2026-11-24".into(),
                status: "Chờ ký".into(),
                ..Default::default()
            },
            ContractSummary {
                end_date: "2026-11-25".into(),
                ..Default::default()
            },
            ContractSummary::default(),
        ];
        assert_eq!(contract_alert_counts(&contracts, today), (1, 1, 1));
        assert_eq!(fraction(0, 0), 0.0);
    }
    #[test]
    fn overview_has_summary_panels_without_an_employee_list_and_no_horizontal_overflow() {
        for width in [320.0, 390.0, 768.0, 1440.0] {
            let ctx = egui::Context::default();
            crate::native_text::setup_fonts(&ctx);
            crate::native_text::setup_style(&ctx);
            let mut view = HrOverviewView {
                employees_loaded: true,
                contracts_loaded: true,
                ..Default::default()
            };
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
                        view.render_content(ui, NaiveDate::from_ymd_opt(2026, 10, 25).unwrap());
                        assert!(
                            ui.min_rect().right() <= right + 1.0,
                            "overview overflow at {width}"
                        );
                    });
                },
            );
            assert!(output.shapes.iter().any(|shape|matches!(&shape.shape,egui::Shape::Text(t)if t.galley.text()=="Phân Bổ Nhân Sự Theo Phòng Ban")));
        }
    }
}
