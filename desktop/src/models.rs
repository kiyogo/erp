use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum StorageMode {
    #[default]
    #[serde(rename = "kiyo_cloud")]
    KiyoCloud,
    #[serde(rename = "self_hosted")]
    SelfHosted,
    #[serde(rename = "local_admin")]
    LocalAdmin,
}

impl StorageMode {
    pub fn label(&self) -> &'static str {
        match self {
            Self::KiyoCloud => "Kiyo Cloud",
            Self::SelfHosted => "Self Hosted (Linux)",
            Self::LocalAdmin => "Local Admin (SQLite)",
        }
    }

    pub fn default_endpoint(&self) -> &'static str {
        match self {
            Self::KiyoCloud => "http://127.0.0.1:3001/api/v1",
            Self::SelfHosted => "http://127.0.0.1:3001/api/v1",
            Self::LocalAdmin => "http://127.0.0.1:3011/api/v1",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
    pub role: String,
    #[serde(default)]
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub token: String,
    pub user: User,
    pub endpoint: String,
    pub mode: StorageMode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavGroup {
    Dashboard,
    Chat,
    Business,
    Hr,
    Insurance,
    Attendance,
    Crm,
    Finance,
    Assets,
    Workflows,
    MeetingRooms,
    Services,
    Documents,
    Files,
    Tickets,
    Plans,
    Reports,
    Administration,
    Signatures,
    Notifications,
    Settings,
    EmployeeHome,
    EmployeeProfile,
    EmployeeTasks,
    EmployeePayslips,
    EmployeeContracts,
    EmployeeProposals,
    EmployeeAssets,
    EmployeeFiles,
    EmployeeNotifications,
    EmployeeSignatures,
    EmployeeSettings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NavItem {
    pub id: &'static str,
    pub title: &'static str,
    pub path: &'static str,
    pub icon: &'static str,
    pub group: NavGroup,
}

#[derive(Debug, Clone, Copy)]
pub struct NavNode {
    pub item: NavItem,
    pub children: &'static [NavNode],
}

impl NavItem {
    pub const fn new(
        id: &'static str,
        title: &'static str,
        path: &'static str,
        icon: &'static str,
        group: NavGroup,
    ) -> Self {
        Self {
            id,
            title,
            path,
            icon,
            group,
        }
    }

    pub const fn admin_dashboard() -> Self {
        Self::new(
            "dashboard",
            "Bảng điều khiển",
            "/admin/dashboard",
            "📊",
            NavGroup::Dashboard,
        )
    }

    pub const fn employee_home() -> Self {
        Self::new(
            "emp-home",
            "Trang chủ",
            "/employee/home",
            "🏠",
            NavGroup::EmployeeHome,
        )
    }

    pub const fn label(&self) -> &'static str {
        self.title
    }

    pub const fn icon(&self) -> &'static str {
        match self.group {
            NavGroup::Dashboard => "◌",
            NavGroup::Chat => "□",
            NavGroup::Business => "⌂",
            NavGroup::Hr => "⌁",
            NavGroup::Insurance => "◇",
            NavGroup::Attendance => "○",
            NavGroup::Crm => "☻",
            NavGroup::Finance => "$",
            NavGroup::Assets => "▣",
            NavGroup::Workflows => "⌘",
            NavGroup::MeetingRooms => "▤",
            NavGroup::Services => "▦",
            NavGroup::Documents => "▱",
            NavGroup::Files => "▰",
            NavGroup::Tickets => "◫",
            NavGroup::Plans => "□",
            NavGroup::Reports => "▥",
            NavGroup::Administration => "⚙",
            NavGroup::Signatures => "◇",
            NavGroup::Notifications => "◖",
            NavGroup::Settings => "⚙",
            NavGroup::EmployeeHome => "⌂",
            NavGroup::EmployeeProfile => "⌾",
            NavGroup::EmployeeTasks => "✓",
            NavGroup::EmployeePayslips => "$",
            NavGroup::EmployeeContracts => "▱",
            NavGroup::EmployeeProposals => "◫",
            NavGroup::EmployeeAssets => "▣",
            NavGroup::EmployeeFiles => "▰",
            NavGroup::EmployeeNotifications => "◖",
            NavGroup::EmployeeSignatures => "◇",
            NavGroup::EmployeeSettings => "⚙",
        }
    }
}

const fn item(
    id: &'static str,
    title: &'static str,
    path: &'static str,
    icon: &'static str,
    group: NavGroup,
) -> NavItem {
    NavItem::new(id, title, path, icon, group)
}

const fn node(item: NavItem, children: &'static [NavNode]) -> NavNode {
    NavNode { item, children }
}

pub const ADMIN_NAV_TREE: &[NavNode] = &[
    node(
        item(
            "dashboard",
            "Bảng điều khiển",
            "/admin/dashboard",
            "📊",
            NavGroup::Dashboard,
        ),
        &[],
    ),
    node(
        item("chat", "Chat", "/admin/chat", "💬", NavGroup::Chat),
        &[
            node(
                item(
                    "chat-internal",
                    "Chat nội bộ",
                    "/admin/chat",
                    "💬",
                    NavGroup::Chat,
                ),
                &[],
            ),
            node(
                item(
                    "chat-admin",
                    "Quản trị chat",
                    "/admin/chat/admin",
                    "🛠",
                    NavGroup::Chat,
                ),
                &[],
            ),
        ],
    ),
    node(
        item(
            "business",
            "Doanh nghiệp",
            "/admin/business",
            "🏢",
            NavGroup::Business,
        ),
        &[
            node(
                item(
                    "business-org-units",
                    "Đơn vị tổ chức",
                    "/admin/business/org-units",
                    "🏢",
                    NavGroup::Business,
                ),
                &[],
            ),
            node(
                item(
                    "business-org-chart",
                    "Sơ đồ doanh nghiệp",
                    "/admin/business/org-chart",
                    "🔀",
                    NavGroup::Business,
                ),
                &[],
            ),
        ],
    ),
    node(
        item("hr", "Nhân sự", "/admin/hr", "👥", NavGroup::Hr),
        &[
            node(
                item(
                    "hr-overview",
                    "Tổng quan",
                    "/admin/hr/overview",
                    "📊",
                    NavGroup::Hr,
                ),
                &[],
            ),
            node(
                item(
                    "hr-employees",
                    "Nhân viên",
                    "/admin/hr/employees",
                    "👤",
                    NavGroup::Hr,
                ),
                &[],
            ),
            node(
                item(
                    "hr-onboarding",
                    "Hội nhập",
                    "/admin/hr/onboarding",
                    "✅",
                    NavGroup::Hr,
                ),
                &[],
            ),
            node(
                item(
                    "hr-contracts",
                    "Hợp đồng",
                    "/admin/hr/contracts",
                    "📄",
                    NavGroup::Hr,
                ),
                &[],
            ),
            node(
                item(
                    "hr-uniforms",
                    "Đồng phục",
                    "/admin/hr/uniforms",
                    "🎽",
                    NavGroup::Hr,
                ),
                &[],
            ),
            node(
                item(
                    "hr-proposals",
                    "Đề xuất",
                    "/admin/hr/proposals",
                    "📬",
                    NavGroup::Hr,
                ),
                &[],
            ),
            node(
                item(
                    "hr-headcount",
                    "Định biên",
                    "/admin/hr/headcount",
                    "📌",
                    NavGroup::Hr,
                ),
                &[],
            ),
            node(
                item(
                    "hr-history",
                    "Lịch sử nhân viên",
                    "/admin/hr/history",
                    "🕘",
                    NavGroup::Hr,
                ),
                &[
                    node(
                        item(
                            "hr-hist-position",
                            "Chức vụ",
                            "/admin/hr/history/position",
                            "🏷",
                            NavGroup::Hr,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "hr-hist-transfer",
                            "Thuyên chuyển",
                            "/admin/hr/history/transfer",
                            "🔁",
                            NavGroup::Hr,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "hr-hist-resignation",
                            "Nghỉ việc",
                            "/admin/hr/history/resignation",
                            "🚪",
                            NavGroup::Hr,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "hr-hist-reward",
                            "Khen thưởng",
                            "/admin/hr/history/reward",
                            "🏅",
                            NavGroup::Hr,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "hr-hist-discipline",
                            "Kỷ luật sự cố",
                            "/admin/hr/history/discipline",
                            "⚠",
                            NavGroup::Hr,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "hr-hist-bank",
                            "Ngân hàng",
                            "/admin/hr/history/bank",
                            "🏦",
                            NavGroup::Hr,
                        ),
                        &[],
                    ),
                ],
            ),
        ],
    ),
    node(
        item(
            "insurance",
            "Bảo hiểm xã hội",
            "/admin/insurance",
            "🛡",
            NavGroup::Insurance,
        ),
        &[
            node(
                item(
                    "ins-overview",
                    "Tổng quan",
                    "/admin/insurance/overview",
                    "📊",
                    NavGroup::Insurance,
                ),
                &[],
            ),
            node(
                item(
                    "ins-labor",
                    "Quản lý lao động",
                    "/admin/insurance/labor",
                    "👥",
                    NavGroup::Insurance,
                ),
                &[],
            ),
            node(
                item(
                    "ins-adjustments",
                    "Tăng giảm điều chỉnh",
                    "/admin/insurance/adjustments",
                    "↕",
                    NavGroup::Insurance,
                ),
                &[],
            ),
            node(
                item(
                    "ins-regimes",
                    "Chế độ BHXH",
                    "/admin/insurance/regimes",
                    "📋",
                    NavGroup::Insurance,
                ),
                &[],
            ),
            node(
                item(
                    "ins-card",
                    "Đổi số thẻ",
                    "/admin/insurance/card",
                    "💳",
                    NavGroup::Insurance,
                ),
                &[],
            ),
            node(
                item(
                    "ins-voluntary",
                    "BH tự nguyện",
                    "/admin/insurance/voluntary",
                    "🤝",
                    NavGroup::Insurance,
                ),
                &[],
            ),
            node(
                item(
                    "ins-contributions",
                    "Theo dõi đóng BHXH",
                    "/admin/insurance/contributions",
                    "📈",
                    NavGroup::Insurance,
                ),
                &[],
            ),
            node(
                item(
                    "ins-expenses",
                    "Theo dõi chi BHXH",
                    "/admin/insurance/expenses",
                    "📉",
                    NavGroup::Insurance,
                ),
                &[],
            ),
        ],
    ),
    node(
        item(
            "attendance",
            "Chấm công",
            "/admin/attendance",
            "📅",
            NavGroup::Attendance,
        ),
        &[
            node(
                item(
                    "att-overview",
                    "Tổng quan",
                    "/admin/attendance/overview",
                    "📊",
                    NavGroup::Attendance,
                ),
                &[],
            ),
            node(
                item(
                    "att-monitoring",
                    "Giám sát tổng quan",
                    "/admin/attendance/monitoring",
                    "👁",
                    NavGroup::Attendance,
                ),
                &[],
            ),
            node(
                item(
                    "att-alerts",
                    "Cảnh báo dữ liệu",
                    "/admin/attendance/alerts",
                    "⚠",
                    NavGroup::Attendance,
                ),
                &[],
            ),
            node(
                item(
                    "att-shifts",
                    "Ca làm việc",
                    "/admin/attendance/shifts",
                    "🕒",
                    NavGroup::Attendance,
                ),
                &[
                    node(
                        item(
                            "att-shifts-cat",
                            "Danh mục ca",
                            "/admin/attendance/shifts/categories",
                            "📚",
                            NavGroup::Attendance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "att-shifts-detail",
                            "Phân ca chi tiết",
                            "/admin/attendance/shifts/detail",
                            "🧩",
                            NavGroup::Attendance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "att-shifts-sum",
                            "Bảng phân ca tổng hợp",
                            "/admin/attendance/shifts/summary",
                            "📋",
                            NavGroup::Attendance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "att-shifts-reg",
                            "Đăng ký ca",
                            "/admin/attendance/shifts/registration",
                            "✍",
                            NavGroup::Attendance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "att-timesheet",
                    "Chấm công",
                    "/admin/attendance/timesheet",
                    "⏱",
                    NavGroup::Attendance,
                ),
                &[
                    node(
                        item(
                            "att-ts-detail",
                            "Bảng chấm công chi tiết",
                            "/admin/attendance/timesheet/detail",
                            "📄",
                            NavGroup::Attendance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "att-ts-sum",
                            "Bảng chấm công tổng hợp",
                            "/admin/attendance/timesheet/summary",
                            "📋",
                            NavGroup::Attendance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "att-ts-data",
                            "Dữ liệu chấm công",
                            "/admin/attendance/timesheet/data",
                            "🗃",
                            NavGroup::Attendance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "att-requests",
                    "Quản lý đơn",
                    "/admin/attendance/requests",
                    "📨",
                    NavGroup::Attendance,
                ),
                &[
                    node(
                        item(
                            "att-req-list",
                            "Đơn",
                            "/admin/attendance/requests/list",
                            "📄",
                            NavGroup::Attendance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "att-req-leaves",
                            "Bảng tổng hợp ngày nghỉ",
                            "/admin/attendance/requests/leaves",
                            "🌿",
                            NavGroup::Attendance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "att-req-overtime",
                            "Bảng tổng hợp làm thêm",
                            "/admin/attendance/requests/overtime",
                            "⏰",
                            NavGroup::Attendance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "att-req-plans",
                            "Kế hoạch nghỉ phép",
                            "/admin/attendance/requests/plans",
                            "🗓",
                            NavGroup::Attendance,
                        ),
                        &[],
                    ),
                ],
            ),
        ],
    ),
    node(
        item(
            "crm",
            "Khách hàng & đối tác",
            "/admin/crm",
            "🤝",
            NavGroup::Crm,
        ),
        &[
            node(
                item(
                    "crm-customers",
                    "Khách hàng",
                    "/admin/crm/customers",
                    "🙂",
                    NavGroup::Crm,
                ),
                &[],
            ),
            node(
                item(
                    "crm-suppliers",
                    "Nhà cung cấp",
                    "/admin/crm/suppliers",
                    "🏭",
                    NavGroup::Crm,
                ),
                &[],
            ),
        ],
    ),
    node(
        item(
            "finance",
            "Tài chính",
            "/admin/finance",
            "💰",
            NavGroup::Finance,
        ),
        &[
            node(
                item(
                    "fin-overview",
                    "Tổng quan",
                    "/admin/finance/overview",
                    "📊",
                    NavGroup::Finance,
                ),
                &[],
            ),
            node(
                item(
                    "fin-analysis",
                    "Phân tích tài chính",
                    "/admin/finance/analysis",
                    "📈",
                    NavGroup::Finance,
                ),
                &[],
            ),
            node(
                item(
                    "fin-cash",
                    "Tiền",
                    "/admin/finance/cash",
                    "💵",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-cash-flow",
                            "Tổng quan dòng tiền",
                            "/admin/finance/cash/flow",
                            "〽",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-cash-trx",
                            "Thu, chi tiền",
                            "/admin/finance/cash/transactions",
                            "🔁",
                            NavGroup::Finance,
                        ),
                        &[
                            node(
                                item(
                                    "fin-cash-income",
                                    "Khoản thu",
                                    "/admin/finance/cash/income",
                                    "⬇",
                                    NavGroup::Finance,
                                ),
                                &[],
                            ),
                            node(
                                item(
                                    "fin-cash-expense",
                                    "Khoản chi",
                                    "/admin/finance/cash/expense",
                                    "⬆",
                                    NavGroup::Finance,
                                ),
                                &[],
                            ),
                        ],
                    ),
                    node(
                        item(
                            "fin-cash-petty",
                            "Quỹ tiền mặt",
                            "/admin/finance/cash/petty",
                            "👛",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-cash-bank",
                            "Ngân hàng",
                            "/admin/finance/cash/bank",
                            "🏦",
                            NavGroup::Finance,
                        ),
                        &[
                            node(
                                item(
                                    "fin-bank-accounts",
                                    "Tài khoản ngân hàng",
                                    "/admin/finance/cash/bank/accounts",
                                    "🏦",
                                    NavGroup::Finance,
                                ),
                                &[],
                            ),
                            node(
                                item(
                                    "fin-bank-trx",
                                    "Giao dịch ngân hàng",
                                    "/admin/finance/cash/bank/transactions",
                                    "🔁",
                                    NavGroup::Finance,
                                ),
                                &[],
                            ),
                            node(
                                item(
                                    "fin-bank-stmt",
                                    "Sao kê ngân hàng",
                                    "/admin/finance/cash/bank/statements",
                                    "📃",
                                    NavGroup::Finance,
                                ),
                                &[],
                            ),
                            node(
                                item(
                                    "fin-bank-ebank",
                                    "Kết nối ngân hàng điện tử",
                                    "/admin/finance/cash/bank/e-banking",
                                    "🔌",
                                    NavGroup::Finance,
                                ),
                                &[],
                            ),
                        ],
                    ),
                    node(
                        item(
                            "fin-cash-transfer",
                            "Chuyển tiền nội bộ",
                            "/admin/finance/cash/transfer",
                            "↔",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-cash-loans",
                            "Khoản vay",
                            "/admin/finance/cash/loans",
                            "📒",
                            NavGroup::Finance,
                        ),
                        &[
                            node(
                                item(
                                    "fin-loan-borrow",
                                    "Khế ước đi vay",
                                    "/admin/finance/cash/loans/borrow",
                                    "📥",
                                    NavGroup::Finance,
                                ),
                                &[],
                            ),
                            node(
                                item(
                                    "fin-loan-lend",
                                    "Khế ước cho vay",
                                    "/admin/finance/cash/loans/lend",
                                    "📤",
                                    NavGroup::Finance,
                                ),
                                &[],
                            ),
                        ],
                    ),
                    node(
                        item(
                            "fin-cash-forecast",
                            "Dự báo dòng tiền",
                            "/admin/finance/cash/forecast",
                            "🔮",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "fin-invoices",
                    "Hóa đơn",
                    "/admin/finance/invoices",
                    "🧾",
                    NavGroup::Finance,
                ),
                &[],
            ),
            node(
                item(
                    "fin-debts",
                    "Công nợ",
                    "/admin/finance/debts",
                    "📒",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-debt-recv",
                            "Công nợ phải thu",
                            "/admin/finance/debts/receivable",
                            "📥",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-debt-pay",
                            "Công nợ phải trả",
                            "/admin/finance/debts/payable",
                            "📤",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-debt-recon",
                            "Đối chiếu công nợ",
                            "/admin/finance/debts/reconciliation",
                            "🔍",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-debt-aging",
                            "Tuổi nợ",
                            "/admin/finance/debts/aging",
                            "⏳",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-debt-remind",
                            "Nhắc nợ",
                            "/admin/finance/debts/reminders",
                            "🔔",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "fin-payments",
                    "Thanh toán",
                    "/admin/finance/payments",
                    "💳",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-pay-create",
                            "Lập thanh toán",
                            "/admin/finance/payments/create",
                            "➕",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pay-approve",
                            "Duyệt thanh toán",
                            "/admin/finance/payments/approve",
                            "✅",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pay-history",
                            "Lịch sử thanh toán",
                            "/admin/finance/payments/history",
                            "🕘",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "fin-payroll",
                    "Tiền lương",
                    "/admin/finance/payroll",
                    "💵",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-pay-att",
                            "Tổng hợp chấm công",
                            "/admin/finance/payroll/attendance",
                            "📅",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pay-calc",
                            "Tính lương",
                            "/admin/finance/payroll/calculate",
                            "🧮",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pay-acc",
                            "Hạch toán chi phí",
                            "/admin/finance/payroll/accounting",
                            "📒",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pay-disb",
                            "Trả lương",
                            "/admin/finance/payroll/disburse",
                            "💸",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pay-ins",
                            "Nộp bảo hiểm",
                            "/admin/finance/payroll/insurance",
                            "🛡",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pay-tax",
                            "Khấu trừ thuế TNCN",
                            "/admin/finance/payroll/tax",
                            "🏛",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "fin-tax",
                    "Thuế",
                    "/admin/finance/tax",
                    "🏛",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-tax-types",
                            "Loại thuế",
                            "/admin/finance/tax/types",
                            "🏷",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-tax-periods",
                            "Kỳ kê khai",
                            "/admin/finance/tax/periods",
                            "🗓",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-tax-deadlines",
                            "Lịch hạn nộp",
                            "/admin/finance/tax/deadlines",
                            "⏰",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-tax-decl",
                            "Khai thuế",
                            "/admin/finance/tax/declaration",
                            "📄",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-tax-orders",
                            "Giấy nộp tiền",
                            "/admin/finance/tax/orders",
                            "💳",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-tax-risky",
                            "Danh sách NCC có rủi ro",
                            "/admin/finance/tax/risky",
                            "⚠",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "fin-costing",
                    "Giá thành",
                    "/admin/finance/costing",
                    "🏗",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-cost-simple",
                            "Sản xuất liên tục giản đơn",
                            "/admin/finance/costing/simple",
                            "🏭",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-cost-coef",
                            "Sản xuất liên tục hệ số, tỷ lệ",
                            "/admin/finance/costing/coefficient",
                            "📐",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-cost-const",
                            "Công trình",
                            "/admin/finance/costing/construction",
                            "🏗",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-cost-orders",
                            "Đơn hàng",
                            "/admin/finance/costing/orders",
                            "🧾",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-cost-cont",
                            "Hợp đồng",
                            "/admin/finance/costing/contracts",
                            "📄",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "fin-purchasing",
                    "Mua hàng",
                    "/admin/finance/purchasing",
                    "🛒",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-pur-orders",
                            "Đơn mua hàng",
                            "/admin/finance/purchasing/orders",
                            "🧾",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pur-cont",
                            "Hợp đồng mua",
                            "/admin/finance/purchasing/contracts",
                            "📄",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pur-goods",
                            "Mua hàng hóa, dịch vụ",
                            "/admin/finance/purchasing/goods",
                            "📦",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pur-recinv",
                            "Nhận hóa đơn",
                            "/admin/finance/purchasing/invoices",
                            "📥",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pur-ret",
                            "Trả lại hàng mua",
                            "/admin/finance/purchasing/returns",
                            "↩",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pur-disc",
                            "Giảm giá hàng mua",
                            "/admin/finance/purchasing/discounts",
                            "🏷",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pur-input",
                            "Xử lý hóa đơn đầu vào",
                            "/admin/finance/purchasing/input-invoices",
                            "🔎",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pur-recon",
                            "Đối chiếu công nợ",
                            "/admin/finance/purchasing/reconciliation",
                            "🔍",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-pur-charts",
                            "Biểu đồ",
                            "/admin/finance/purchasing/charts",
                            "📊",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "fin-sales",
                    "Bán hàng",
                    "/admin/finance/sales",
                    "🏪",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-sale-quote",
                            "Báo giá",
                            "/admin/finance/sales/quotes",
                            "💬",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-sale-orders",
                            "Đơn đặt hàng",
                            "/admin/finance/sales/orders",
                            "🧾",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-sale-cont",
                            "Hợp đồng bán",
                            "/admin/finance/sales/contracts",
                            "📄",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-sale-goods",
                            "Bán hàng hóa, dịch vụ",
                            "/admin/finance/sales/goods",
                            "📦",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-sale-inv",
                            "Hóa đơn",
                            "/admin/finance/sales/invoices",
                            "🧾",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-sale-ret",
                            "Trả lại hàng bán",
                            "/admin/finance/sales/returns",
                            "↩",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-sale-disc",
                            "Giảm giá hàng bán",
                            "/admin/finance/sales/discounts",
                            "🏷",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-sale-out",
                            "Xử lý hóa đơn đầu ra",
                            "/admin/finance/sales/output-invoices",
                            "🔎",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-sale-debt",
                            "Công nợ",
                            "/admin/finance/sales/debts",
                            "📒",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-sale-charts",
                            "Biểu đồ",
                            "/admin/finance/sales/charts",
                            "📊",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "fin-inventory",
                    "Kho",
                    "/admin/finance/inventory",
                    "📦",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-inv-in",
                            "Nhập kho",
                            "/admin/finance/inventory/import",
                            "📥",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-inv-out",
                            "Xuất kho",
                            "/admin/finance/inventory/export",
                            "📤",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-inv-trans",
                            "Chuyển kho",
                            "/admin/finance/inventory/transfer",
                            "🔁",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-inv-prod",
                            "Lệnh sản xuất",
                            "/admin/finance/inventory/production",
                            "🏭",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-inv-assem",
                            "Lắp ráp, tháo dỡ",
                            "/admin/finance/inventory/assembly",
                            "🧩",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-inv-audit",
                            "Kiểm kê",
                            "/admin/finance/inventory/audit",
                            "🔎",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-inv-cost",
                            "Tính giá xuất kho",
                            "/admin/finance/inventory/costing",
                            "🧮",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-inv-charts",
                            "Biểu đồ",
                            "/admin/finance/inventory/charts",
                            "📊",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "fin-general",
                    "Tổng hợp",
                    "/admin/finance/general",
                    "📚",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-gen-other",
                            "Chứng từ nghiệp vụ khác",
                            "/admin/finance/general/other",
                            "📄",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-gen-advance",
                            "Quyết toán tạm ứng",
                            "/admin/finance/general/advance",
                            "💳",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-gen-pl",
                            "Kết chuyển lãi lỗ",
                            "/admin/finance/general/profit-loss",
                            "📈",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-gen-fs",
                            "Báo cáo tài chính",
                            "/admin/finance/general/statements",
                            "📊",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "fin-budget",
                    "Ngân sách",
                    "/admin/finance/budget",
                    "🎯",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-bud-charts",
                            "Biểu đồ",
                            "/admin/finance/budget/charts",
                            "📊",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-bud-plans",
                            "Kế hoạch ngân sách",
                            "/admin/finance/budget/plans",
                            "🗓",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
            node(
                item(
                    "fin-einvoice",
                    "Hóa đơn điện tử",
                    "/admin/finance/e-invoice",
                    "🧾",
                    NavGroup::Finance,
                ),
                &[
                    node(
                        item(
                            "fin-einv-over",
                            "Tổng quan",
                            "/admin/finance/e-invoice/overview",
                            "📊",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-einv-create",
                            "Lập hóa đơn",
                            "/admin/finance/e-invoice/create",
                            "➕",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-einv-list",
                            "Danh sách hóa đơn",
                            "/admin/finance/e-invoice/list",
                            "📋",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-einv-draft",
                            "Hóa đơn nháp",
                            "/admin/finance/e-invoice/drafts",
                            "📝",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-einv-tpl",
                            "Mẫu hóa đơn",
                            "/admin/finance/e-invoice/templates",
                            "📐",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-einv-lookup",
                            "Tra cứu hóa đơn",
                            "/admin/finance/e-invoice/lookup",
                            "🔍",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "fin-einv-rep",
                            "Báo cáo hóa đơn",
                            "/admin/finance/e-invoice/reports",
                            "📊",
                            NavGroup::Finance,
                        ),
                        &[],
                    ),
                ],
            ),
        ],
    ),
    node(
        item("assets", "Tài sản", "/admin/assets", "💻", NavGroup::Assets),
        &[
            node(
                item(
                    "ast-overview",
                    "Tổng quan",
                    "/admin/assets/overview",
                    "📊",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-list",
                    "Tài sản",
                    "/admin/assets/list",
                    "💻",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-materials",
                    "Vật tư, linh kiện",
                    "/admin/assets/materials",
                    "🔩",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-allocation",
                    "Cấp phát, thu hồi",
                    "/admin/assets/allocation",
                    "📦",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-transfer",
                    "Điều chuyển",
                    "/admin/assets/transfer",
                    "🔁",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-repairs",
                    "Sửa chữa",
                    "/admin/assets/repairs",
                    "🔧",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-maint",
                    "Bảo dưỡng",
                    "/admin/assets/maintenance",
                    "🧰",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-disposal",
                    "Mất, hủy, thanh lý",
                    "/admin/assets/disposal",
                    "🗑",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-todo",
                    "Việc cần làm",
                    "/admin/assets/todo",
                    "✅",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-audit",
                    "Kiểm kê",
                    "/admin/assets/audit",
                    "🔎",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-count",
                    "Kiểm đếm",
                    "/admin/assets/count",
                    "🔢",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-deprec",
                    "Khấu hao, phân bổ",
                    "/admin/assets/depreciation",
                    "📉",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-reports",
                    "Báo cáo",
                    "/admin/assets/reports",
                    "📊",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-usage",
                    "Quá trình sử dụng",
                    "/admin/assets/usage",
                    "🕘",
                    NavGroup::Assets,
                ),
                &[],
            ),
            node(
                item(
                    "ast-system",
                    "Hệ thống",
                    "/admin/assets/system",
                    "⚙",
                    NavGroup::Assets,
                ),
                &[
                    node(
                        item(
                            "ast-sys-types",
                            "Loại tài sản",
                            "/admin/assets/system/types",
                            "🏷",
                            NavGroup::Assets,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "ast-sys-groups",
                            "Nhóm tài sản",
                            "/admin/assets/system/groups",
                            "🧩",
                            NavGroup::Assets,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "ast-sys-org",
                            "Cơ cấu tổ chức",
                            "/admin/assets/system/org",
                            "🏢",
                            NavGroup::Assets,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "ast-sys-loc",
                            "Vị trí tài sản",
                            "/admin/assets/system/locations",
                            "📍",
                            NavGroup::Assets,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "ast-sys-prov",
                            "Nhà cung cấp",
                            "/admin/assets/system/suppliers",
                            "🏭",
                            NavGroup::Assets,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "ast-sys-quota",
                            "Định mức cấp phát",
                            "/admin/assets/system/quotas",
                            "📌",
                            NavGroup::Assets,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "ast-sys-tpl",
                            "Mẫu văn bản",
                            "/admin/assets/system/templates",
                            "📄",
                            NavGroup::Assets,
                        ),
                        &[],
                    ),
                ],
            ),
        ],
    ),
    node(
        item(
            "workflows",
            "Quy trình",
            "/admin/workflows",
            "📋",
            NavGroup::Workflows,
        ),
        &[
            node(
                item(
                    "wf-overview",
                    "Tổng quan",
                    "/admin/workflows/overview",
                    "📊",
                    NavGroup::Workflows,
                ),
                &[],
            ),
            node(
                item(
                    "wf-list",
                    "Danh sách quy trình",
                    "/admin/workflows/list",
                    "📋",
                    NavGroup::Workflows,
                ),
                &[],
            ),
            node(
                item(
                    "wf-requests",
                    "Yêu cầu",
                    "/admin/workflows/requests",
                    "📨",
                    NavGroup::Workflows,
                ),
                &[],
            ),
            node(
                item(
                    "wf-history",
                    "Lịch sử xử lý",
                    "/admin/workflows/history",
                    "🕘",
                    NavGroup::Workflows,
                ),
                &[],
            ),
            node(
                item(
                    "wf-settings",
                    "Thiết lập",
                    "/admin/workflows/settings",
                    "⚙",
                    NavGroup::Workflows,
                ),
                &[],
            ),
        ],
    ),
    node(
        item(
            "meeting-rooms",
            "Phòng họp",
            "/admin/meeting-rooms",
            "🚪",
            NavGroup::MeetingRooms,
        ),
        &[
            node(
                item(
                    "mr-overview",
                    "Tổng quan",
                    "/admin/meeting-rooms/overview",
                    "📊",
                    NavGroup::MeetingRooms,
                ),
                &[],
            ),
            node(
                item(
                    "mr-list",
                    "Danh sách phòng họp",
                    "/admin/meeting-rooms/list",
                    "🚪",
                    NavGroup::MeetingRooms,
                ),
                &[],
            ),
            node(
                item(
                    "mr-calendar",
                    "Lịch phòng họp",
                    "/admin/meeting-rooms/calendar",
                    "🗓",
                    NavGroup::MeetingRooms,
                ),
                &[],
            ),
            node(
                item(
                    "mr-history",
                    "Lịch sử đặt phòng",
                    "/admin/meeting-rooms/history",
                    "🕘",
                    NavGroup::MeetingRooms,
                ),
                &[],
            ),
            node(
                item(
                    "mr-settings",
                    "Thiết lập",
                    "/admin/meeting-rooms/settings",
                    "⚙",
                    NavGroup::MeetingRooms,
                ),
                &[],
            ),
        ],
    ),
    node(
        item(
            "services",
            "Dịch vụ doanh nghiệp",
            "/admin/services",
            "🏪",
            NavGroup::Services,
        ),
        &[],
    ),
    node(
        item(
            "documents",
            "Tài liệu",
            "/admin/documents",
            "📄",
            NavGroup::Documents,
        ),
        &[
            node(
                item(
                    "doc-overview",
                    "Tổng quan",
                    "/admin/documents/overview",
                    "📊",
                    NavGroup::Documents,
                ),
                &[],
            ),
            node(
                item(
                    "doc-list",
                    "Tài liệu",
                    "/admin/documents/list",
                    "📄",
                    NavGroup::Documents,
                ),
                &[],
            ),
            node(
                item(
                    "doc-contracts",
                    "Hợp đồng",
                    "/admin/documents/contracts",
                    "📑",
                    NavGroup::Documents,
                ),
                &[],
            ),
            node(
                item(
                    "doc-notes",
                    "Ghi chép",
                    "/admin/documents/notes",
                    "📝",
                    NavGroup::Documents,
                ),
                &[],
            ),
            node(
                item(
                    "doc-archives",
                    "Văn thư",
                    "/admin/documents/archives",
                    "🗄",
                    NavGroup::Documents,
                ),
                &[],
            ),
            node(
                item(
                    "doc-settings",
                    "Thiết lập",
                    "/admin/documents/settings",
                    "⚙",
                    NavGroup::Documents,
                ),
                &[
                    node(
                        item(
                            "doc-set-contract-templates",
                            "Mẫu hợp đồng",
                            "/admin/documents/settings/contract-templates",
                            "📐",
                            NavGroup::Documents,
                        ),
                        &[],
                    ),
                    node(
                        item(
                            "doc-set-sig",
                            "Chữ ký số",
                            "/admin/documents/settings/digital-signature",
                            "✍",
                            NavGroup::Documents,
                        ),
                        &[],
                    ),
                ],
            ),
        ],
    ),
    node(
        item("files", "Thư mục", "/admin/files", "📁", NavGroup::Files),
        &[],
    ),
    node(
        item(
            "tickets",
            "Ticket",
            "/admin/tickets",
            "🎧",
            NavGroup::Tickets,
        ),
        &[],
    ),
    node(
        item("plans", "Kế hoạch", "/admin/tasks", "🗓", NavGroup::Plans),
        &[
            node(
                item(
                    "plan-tasks",
                    "Nhiệm vụ",
                    "/admin/tasks",
                    "✅",
                    NavGroup::Plans,
                ),
                &[],
            ),
            node(
                item(
                    "plan-list",
                    "Danh sách kế hoạch",
                    "/admin/plans/list",
                    "📋",
                    NavGroup::Plans,
                ),
                &[],
            ),
            node(
                item(
                    "plan-progress",
                    "Tiến độ thực hiện",
                    "/admin/plans/progress",
                    "📈",
                    NavGroup::Plans,
                ),
                &[],
            ),
            node(
                item(
                    "plan-milestones",
                    "Mốc quan trọng",
                    "/admin/plans/milestones",
                    "📍",
                    NavGroup::Plans,
                ),
                &[],
            ),
            node(
                item(
                    "plan-reports",
                    "Báo cáo",
                    "/admin/plans/reports",
                    "📊",
                    NavGroup::Plans,
                ),
                &[],
            ),
        ],
    ),
    node(
        item(
            "reports",
            "Báo cáo",
            "/admin/reports",
            "📊",
            NavGroup::Reports,
        ),
        &[],
    ),
    node(
        item(
            "admin",
            "Quản trị hệ thống",
            "/admin/system",
            "⚙",
            NavGroup::Administration,
        ),
        &[
            node(
                item(
                    "adm-overview",
                    "Tổng quan quản trị",
                    "/admin/overview",
                    "📊",
                    NavGroup::Administration,
                ),
                &[],
            ),
            node(
                item(
                    "adm-users",
                    "Quản lý người dùng",
                    "/admin/users",
                    "👥",
                    NavGroup::Administration,
                ),
                &[],
            ),
            node(
                item(
                    "adm-roles",
                    "Nhóm quyền & vai trò",
                    "/admin/roles",
                    "🛡",
                    NavGroup::Administration,
                ),
                &[],
            ),
            node(
                item(
                    "adm-permissions",
                    "Phân quyền chức năng",
                    "/admin/permissions",
                    "🔐",
                    NavGroup::Administration,
                ),
                &[],
            ),
            node(
                item(
                    "adm-audit",
                    "Nhật ký kiểm toán",
                    "/admin/audit-logs",
                    "📜",
                    NavGroup::Administration,
                ),
                &[],
            ),
            node(
                item(
                    "adm-sessions",
                    "Phiên đăng nhập",
                    "/admin/sessions",
                    "🕒",
                    NavGroup::Administration,
                ),
                &[],
            ),
            node(
                item(
                    "adm-backup",
                    "Sao lưu & phục hồi",
                    "/admin/backup",
                    "💾",
                    NavGroup::Administration,
                ),
                &[],
            ),
            node(
                item(
                    "adm-drop-menu",
                    "Cấu hình menu thả",
                    "/admin/drop-menu",
                    "☰",
                    NavGroup::Administration,
                ),
                &[],
            ),
            node(
                item(
                    "adm-system",
                    "Cấu hình hệ thống",
                    "/admin/system",
                    "⚙",
                    NavGroup::Administration,
                ),
                &[],
            ),
            node(
                item(
                    "adm-notif",
                    "Thông báo hệ thống",
                    "/admin/system/notifications",
                    "🔔",
                    NavGroup::Administration,
                ),
                &[],
            ),
        ],
    ),
    node(
        item(
            "digisig",
            "Chữ ký số",
            "/admin/digital-signature",
            "✍",
            NavGroup::Signatures,
        ),
        &[
            node(
                item(
                    "set-sig-list",
                    "Danh sách chữ ký số",
                    "/admin/digital-signature/list",
                    "📋",
                    NavGroup::Signatures,
                ),
                &[],
            ),
            node(
                item(
                    "set-sig-cert",
                    "Thông tin chứng thư số",
                    "/admin/digital-signature/certs",
                    "🪪",
                    NavGroup::Signatures,
                ),
                &[],
            ),
            node(
                item(
                    "set-sig-prov",
                    "Nhà cung cấp chữ ký số",
                    "/admin/digital-signature/providers",
                    "🏭",
                    NavGroup::Signatures,
                ),
                &[],
            ),
            node(
                item(
                    "set-sig-signers",
                    "Người được quyền ký",
                    "/admin/digital-signature/signers",
                    "👥",
                    NavGroup::Signatures,
                ),
                &[],
            ),
            node(
                item(
                    "set-sig-verify",
                    "Kiểm tra chữ ký số",
                    "/admin/digital-signature/verify",
                    "🔎",
                    NavGroup::Signatures,
                ),
                &[],
            ),
            node(
                item(
                    "set-sig-hist",
                    "Lịch sử ký số",
                    "/admin/digital-signature/history",
                    "🕘",
                    NavGroup::Signatures,
                ),
                &[],
            ),
            node(
                item(
                    "set-sig-alert",
                    "Cảnh báo hết hạn",
                    "/admin/digital-signature/alerts",
                    "⚠",
                    NavGroup::Signatures,
                ),
                &[],
            ),
            node(
                item(
                    "set-sig-renew",
                    "Gia hạn chữ ký số",
                    "/admin/digital-signature/renew",
                    "🔄",
                    NavGroup::Signatures,
                ),
                &[],
            ),
        ],
    ),
    node(
        item(
            "notifications",
            "Thông báo",
            "/admin/notifications",
            "🔔",
            NavGroup::Notifications,
        ),
        &[
            node(
                item(
                    "notif-my",
                    "Thông báo của tôi",
                    "/admin/notifications/my",
                    "🔔",
                    NavGroup::Notifications,
                ),
                &[],
            ),
            node(
                item(
                    "notif-system",
                    "Thông báo hệ thống",
                    "/admin/system/notifications",
                    "📢",
                    NavGroup::Notifications,
                ),
                &[],
            ),
        ],
    ),
    node(
        item(
            "settings",
            "Cài đặt",
            "/admin/settings",
            "⚙",
            NavGroup::Settings,
        ),
        &[
            node(
                item(
                    "set-account",
                    "Tài khoản",
                    "/admin/settings/account",
                    "👤",
                    NavGroup::Settings,
                ),
                &[],
            ),
            node(
                item(
                    "set-security",
                    "Bảo mật",
                    "/admin/settings/security",
                    "🔐",
                    NavGroup::Settings,
                ),
                &[],
            ),
            node(
                item(
                    "set-appearance",
                    "Giao diện",
                    "/admin/settings/appearance",
                    "🎨",
                    NavGroup::Settings,
                ),
                &[],
            ),
            node(
                item(
                    "set-system",
                    "Hệ thống",
                    "/admin/settings/system",
                    "⚙",
                    NavGroup::Settings,
                ),
                &[],
            ),
            node(
                item(
                    "set-logs",
                    "Nhật ký hệ thống",
                    "/admin/settings/logs",
                    "📜",
                    NavGroup::Settings,
                ),
                &[],
            ),
        ],
    ),
];

pub const EMPLOYEE_NAV_TREE: &[NavNode] = &[
    node(
        item(
            "emp-home",
            "Trang chủ",
            "/employee/home",
            "🏠",
            NavGroup::EmployeeHome,
        ),
        &[],
    ),
    node(
        item(
            "emp-profile",
            "Hồ sơ cá nhân",
            "/employee/profile",
            "👤",
            NavGroup::EmployeeProfile,
        ),
        &[],
    ),
    node(
        item(
            "emp-tasks",
            "Nhiệm vụ",
            "/employee/tasks",
            "✅",
            NavGroup::EmployeeTasks,
        ),
        &[],
    ),
    node(
        item(
            "emp-payslip",
            "Phiếu lương điện tử",
            "/employee/payslip",
            "💳",
            NavGroup::EmployeePayslips,
        ),
        &[],
    ),
    node(
        item(
            "emp-contracts",
            "Hợp đồng",
            "/employee/contracts",
            "📄",
            NavGroup::EmployeeContracts,
        ),
        &[],
    ),
    node(
        item(
            "emp-proposals",
            "Kiến nghị",
            "/employee/proposals",
            "📬",
            NavGroup::EmployeeProposals,
        ),
        &[],
    ),
    node(
        item(
            "emp-assets",
            "Tài sản được giao",
            "/employee/assets",
            "💻",
            NavGroup::EmployeeAssets,
        ),
        &[],
    ),
    node(
        item(
            "emp-files",
            "Tài liệu",
            "/employee/files",
            "📁",
            NavGroup::EmployeeFiles,
        ),
        &[],
    ),
    node(
        item(
            "emp-notifications",
            "Thông báo",
            "/employee/notifications",
            "🔔",
            NavGroup::EmployeeNotifications,
        ),
        &[],
    ),
    node(
        item(
            "emp-digisig",
            "Chữ ký số",
            "/employee/digital-signature",
            "✍",
            NavGroup::EmployeeSignatures,
        ),
        &[
            node(
                item(
                    "emp-sig-my",
                    "Chữ ký của tôi",
                    "/employee/digital-signature/my-signature",
                    "✍",
                    NavGroup::EmployeeSignatures,
                ),
                &[],
            ),
            node(
                item(
                    "emp-sig-verify",
                    "Kiểm tra chữ ký số",
                    "/employee/digital-signature/verify",
                    "🔎",
                    NavGroup::EmployeeSignatures,
                ),
                &[],
            ),
            node(
                item(
                    "emp-sig-history",
                    "Lịch sử ký số",
                    "/employee/digital-signature/history",
                    "🕘",
                    NavGroup::EmployeeSignatures,
                ),
                &[],
            ),
        ],
    ),
    node(
        item(
            "emp-settings",
            "Cài đặt",
            "/employee/settings",
            "⚙",
            NavGroup::EmployeeSettings,
        ),
        &[
            node(
                item(
                    "emp-set-account",
                    "Tài khoản",
                    "/employee/settings/account",
                    "👤",
                    NavGroup::EmployeeSettings,
                ),
                &[],
            ),
            node(
                item(
                    "emp-set-security",
                    "Bảo mật",
                    "/employee/settings/security",
                    "🔐",
                    NavGroup::EmployeeSettings,
                ),
                &[],
            ),
            node(
                item(
                    "emp-set-appearance",
                    "Giao diện",
                    "/employee/settings/appearance",
                    "🎨",
                    NavGroup::EmployeeSettings,
                ),
                &[],
            ),
            node(
                item(
                    "emp-set-logs",
                    "Nhật ký hệ thống",
                    "/employee/settings/logs",
                    "📜",
                    NavGroup::EmployeeSettings,
                ),
                &[],
            ),
        ],
    ),
];
