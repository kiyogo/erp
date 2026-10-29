import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DownOutlined,
  ReloadOutlined,
  EditOutlined,
  SettingOutlined,
  EllipsisOutlined,
  InfoCircleOutlined,
  ApartmentOutlined,
  RobotOutlined,
  ShopOutlined,
  CheckOutlined,
  RiseOutlined,
  FilterOutlined,
  SearchOutlined,
  SendOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  FileTextOutlined,
  TeamOutlined,
  DollarOutlined,
  AimOutlined,
  ThunderboltOutlined,
  CheckSquareOutlined,
} from '@ant-design/icons';
import { Button, Modal, Select, Input, message } from '../../custom-ui';
import { financeDocumentsApi, crmContactsApi, systemApi, FinanceDocument } from '../../api/endpoints';

// ===== Standard SVG Empty State Illustrations =====
const EmptyLineChartSvg: React.FC = () => (
  <svg width="64" height="48" viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 42H58" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M6 6V42" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M12 34L24 22L34 28L52 12" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="24" cy="22" r="3" fill="#94A3B8" />
    <circle cx="34" cy="28" r="3" fill="#94A3B8" />
    <circle cx="52" cy="12" r="3" fill="#94A3B8" />
  </svg>
);

const EmptyBarChartSvg: React.FC = () => (
  <svg width="56" height="48" viewBox="0 0 56 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 44H52" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
    <rect x="10" y="24" width="8" height="20" rx="1.5" fill="#CBD5E1" />
    <rect x="24" y="14" width="8" height="30" rx="1.5" fill="#94A3B8" />
    <rect x="38" y="28" width="8" height="16" rx="1.5" fill="#CBD5E1" />
  </svg>
);

const EmptyPieChartSvg: React.FC = () => (
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="28" cy="28" r="22" stroke="#CBD5E1" strokeWidth="8" strokeDasharray="90 50" />
    <path d="M28 6A22 22 0 0 1 50 28H28V6Z" fill="#94A3B8" />
  </svg>
);

const EmptyDocumentSvg: React.FC = () => (
  <svg width="48" height="56" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 8C4 5.79086 5.79086 4 8 4H32L44 16V48C44 50.2091 42.2091 52 40 52H8C5.79086 52 4 50.2091 4 48V8Z" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="2" />
    <path d="M32 4V16H44" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
    <path d="M12 24H36" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 32H28" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 40H22" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

interface MetricCardProps {
  title: string;
  value: number | string;
  badge: string;
  bgColor: string;
  tooltipText: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, badge, bgColor, tooltipText }) => {
  return (
    <div
      style={{
        backgroundColor: bgColor,
        borderRadius: 8,
        padding: '16px 20px',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 104,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255, 255, 255, 0.95)' }}>{title}</span>
        <span title={tooltipText} style={{ cursor: 'pointer', opacity: 0.85, fontSize: 13 }}>
          <InfoCircleOutlined />
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10 }}>
        <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{value}</span>
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.22)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: '#FFFFFF',
          }}
        >
          <RiseOutlined style={{ fontSize: 10 }} />
          <span>{badge}</span>
        </div>
      </div>
    </div>
  );
};

interface ChartCardProps {
  title: string;
  subtitle?: string;
  extraHeader?: React.ReactNode;
  timestamp: string;
  onReload: () => void;
  children?: React.ReactNode;
  emptyType?: 'line' | 'bar' | 'pie' | 'doc';
  emptyText?: string;
  topMetric?: string | number;
}

const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  extraHeader,
  timestamp,
  onReload,
  children,
  emptyType = 'bar',
  emptyText = 'Không có dữ liệu',
  topMetric,
}) => {
  const renderEmptySvg = () => {
    switch (emptyType) {
      case 'line':
        return <EmptyLineChartSvg />;
      case 'pie':
        return <EmptyPieChartSvg />;
      case 'doc':
        return <EmptyDocumentSvg />;
      case 'bar':
      default:
        return <EmptyBarChartSvg />;
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        border: '1px solid #E2E8F0',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 280,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', margin: 0 }}>{title}</h3>
            {extraHeader}
          </div>
          {subtitle && (
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500, backgroundColor: '#F1F5F9', padding: '2px 8px', borderRadius: 4 }}>
              {subtitle}
            </span>
          )}
        </div>

        {topMetric !== undefined && (
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>
            {topMetric}
          </div>
        )}

        {children ? (
          children
        ) : (
          <div
            style={{
              height: 160,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {renderEmptySvg()}
            <span style={{ fontSize: 13, color: '#94A3B8' }}>{emptyText}</span>
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: '1px solid #F1F5F9',
          paddingTop: 10,
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          color: '#94A3B8',
        }}
      >
        <span>Số liệu tính đến: {timestamp}</span>
        <button
          onClick={onReload}
          style={{
            background: 'none',
            border: 'none',
            color: '#2563EB',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            padding: 0,
          }}
        >
          Tải lại
        </button>
      </div>
    </div>
  );
};

// Getting started initial 19 checklist items
interface OnboardingStep {
  id: number;
  category: string;
  title: string;
  description: string;
  completed: boolean;
}

const INITIAL_ONBOARDING_STEPS: OnboardingStep[] = [
  { id: 1, category: 'Dữ liệu cơ bản', title: 'Cập nhật thông tin công ty và hồ sơ doanh nghiệp', description: 'Khai báo tên công ty, mã số thuế, địa chỉ trụ sở và thông tin pháp nhân.', completed: true },
  { id: 2, category: 'Dữ liệu cơ bản', title: 'Thiết lập cơ cấu tổ chức và phòng ban', description: 'Phân cấp đơn vị phòng ban: Ban giám đốc, Phòng kinh doanh, Marketing, Kế toán.', completed: true },
  { id: 3, category: 'Dữ liệu cơ bản', title: 'Khai báo danh mục sản phẩm, dịch vụ và hàng hóa', description: 'Định nghĩa bảng giá bán chuẩn, đơn vị tính và định mức thuế GTGT.', completed: true },
  { id: 4, category: 'Dữ liệu cơ bản', title: 'Thêm tài khoản nhân viên kinh doanh', description: 'Tạo tài khoản và phân quyền vai trò cho các đại diện bán hàng.', completed: false },
  { id: 5, category: 'Dữ liệu cơ bản', title: 'Nhập danh bạ khách hàng ban đầu từ tệp Excel', description: 'Nhập khẩu dữ liệu khách hàng hiện tại vào hệ thống quản lý tập trung.', completed: false },
  { id: 6, category: 'Quy trình bán hàng', title: 'Thiết lập các giai đoạn phễu cơ hội bán hàng', description: 'Cấu hình luồng: Tiềm năng -> Liên hệ -> Báo giá -> Thương thảo -> Thắng/Thua.', completed: false },
  { id: 7, category: 'Quy trình bán hàng', title: 'Đặt chỉ tiêu mục tiêu doanh số tháng cho đội ngũ', description: 'Phân bổ hạn mức doanh số theo đơn vị và từng nhân viên kinh doanh.', completed: false },
  { id: 8, category: 'Quy trình bán hàng', title: 'Tạo mẫu báo giá chuẩn doanh nghiệp', description: 'Tùy chỉnh tiêu đề, mẫu bảng giá, điều khoản thanh toán và chữ ký.', completed: false },
  { id: 9, category: 'Quy trình bán hàng', title: 'Tạo và xác nhận đơn hàng bán đầu tiên', description: 'Ghi nhận giao dịch bán hàng từ báo giá đã được khách hàng phê duyệt.', completed: false },
  { id: 10, category: 'Quy trình bán hàng', title: 'Thiết lập luồng phê duyệt đơn hàng & chiết khấu', description: 'Quy định ngưỡng chiết khấu cần Giám đốc kinh doanh duyệt trước khi gửi.', completed: false },
  { id: 11, category: 'Chăm sóc & Tương tác', title: 'Cấu hình hòm thư điện tử gửi báo giá tự động', description: 'Kết nối máy chủ SMTP để gửi email xác nhận trực tiếp tới đối tác.', completed: false },
  { id: 12, category: 'Chăm sóc & Tương tác', title: 'Cài đặt kịch bản chăm sóc khách hàng tự động', description: 'Lên lịch gửi lời chúc mừng sinh nhật và nhắc lịch hẹn tái ký hợp đồng.', completed: false },
  { id: 13, category: 'Chăm sóc & Tương tác', title: 'Kích hoạt chính sách tích điểm và trả thưởng', description: 'Thiết lập tỷ lệ quy đổi điểm thưởng khi khách hàng tích lũy chi tiêu.', completed: false },
  { id: 14, category: 'Chăm sóc & Tương tác', title: 'Đồng bộ số dư công nợ khách hàng ban đầu', description: 'Ghi nhận số dư công nợ phải thu từ hệ thống kế toán nội bộ.', completed: false },
  { id: 15, category: 'Chăm sóc & Tương tác', title: 'Tạo mẫu hợp đồng thương mại điện tử', description: 'Soạn thảo hợp đồng mẫu và tích hợp chữ ký số pháp lý.', completed: false },
  { id: 16, category: 'Tự động hóa & Báo cáo', title: 'Kích hoạt chấm công và phân tuyến đi thị trường', description: 'Theo dõi lịch hẹn và nhật ký công tác của nhân viên kinh doanh.', completed: false },
  { id: 17, category: 'Tự động hóa & Báo cáo', title: 'Kết nối dữ liệu hóa đơn điện tử', description: 'Tự động đồng bộ hóa đơn GTGT sang hệ thống sổ sách kế toán.', completed: false },
  { id: 18, category: 'Tự động hóa & Báo cáo', title: 'Kích hoạt Trợ thủ AI phân tích cơ hội bán hàng', description: 'Sử dụng AI để phát hiện khách hàng có nguy cơ rời bỏ hoặc mất cơ hội.', completed: false },
  { id: 19, category: 'Tự động hóa & Báo cáo', title: 'Xuất báo cáo tổng kết tình hình kinh doanh tháng', description: 'Kết xuất báo cáo PDF và bảng tính doanh số thực tế theo thời gian thực.', completed: false },
];

export const CRMOverviewModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'all' | 'overview' | 'ai' | 'getting-started'>('overview');
  const [activeActivityTab, setActiveActivityTab] = useState<'count' | 'opportunity' | 'order'>('count');
  const [timeFilter, setTimeFilter] = useState<string>('this_month');
  const [companyName, setCompanyName] = useState<string>('CÔNG TY TNHH XÂY DỰNG KINH SỞ');
  const [orgUnit, setOrgUnit] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [timestamp, setTimestamp] = useState<string>('');
  const [aiModalVisible, setAiModalVisible] = useState<boolean>(false);
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);

  // Onboarding steps state
  const [onboardingSteps, setOnboardingSteps] = useState<OnboardingStep[]>(INITIAL_ONBOARDING_STEPS);

  // AI chat state
  const [chatMessages, setChatMessages] = useState<Array<{ sender: 'ai' | 'user'; text: string; time: string }>>([
    {
      sender: 'ai',
      text: 'Xin chào! Tôi là Trợ thủ AI Quản trị Doanh nghiệp & CRM. Tôi có thể giúp bạn phân tích xu hướng doanh thu, phát hiện điểm nghẽn bán hàng, gợi ý kịch bản đàm phán hoặc dự báo tình hình thu hồi công nợ.',
      time: '18:10',
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [aiThinking, setAiThinking] = useState<boolean>(false);

  // Catalog search and filter state for "Tất cả" tab
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [catalogFilter, setCatalogFilter] = useState<string>('all');

  // Real data state
  const [salesDocuments, setSalesDocuments] = useState<FinanceDocument[]>([]);
  const [totalCustomers, setTotalCustomers] = useState<number>(0);

  const getCurrentTimeString = useCallback(() => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }, []);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, contactsRes, profileRes] = await Promise.allSettled([
        financeDocumentsApi.getAll(),
        crmContactsApi.getAll('customer'),
        systemApi.getCompanyProfile(),
      ]);

      if (docsRes.status === 'fulfilled' && docsRes.value.data?.data) {
        const sales = docsRes.value.data.data.filter(
          (doc) => doc.documentType === 'sale' && doc.status !== 'Đã hủy'
        );
        setSalesDocuments(sales);
      }

      if (contactsRes.status === 'fulfilled' && contactsRes.value.data?.data) {
        setTotalCustomers(contactsRes.value.data.data.length);
      }

      if (profileRes.status === 'fulfilled' && profileRes.value.data?.profile?.companyName) {
        setCompanyName(profileRes.value.data.profile.companyName);
      }

      setTimestamp(getCurrentTimeString());
    } catch {
      message.error('Không thể làm mới dữ liệu tổng quan kinh doanh.');
    } finally {
      setLoading(false);
    }
  }, [getCurrentTimeString]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  // Aggregate stats
  const stats = useMemo(() => {
    const orderCount = salesDocuments.length;
    const orderValue = salesDocuments.reduce((sum, doc) => sum + (doc.amount || 0), 0);
    const collectedValue = salesDocuments.reduce((sum, doc) => sum + Math.max(0, (doc.amount || 0) - (doc.remainingAmount || 0)), 0);
    const remainingValue = salesDocuments.reduce((sum, doc) => sum + (doc.remainingAmount || 0), 0);

    return {
      orderCount,
      orderValue: orderValue > 0 ? orderValue.toLocaleString('vi-VN') : '0',
      collectedValue: collectedValue > 0 ? collectedValue.toLocaleString('vi-VN') : '0',
      remainingValue: remainingValue > 0 ? remainingValue.toLocaleString('vi-VN') : '0',
    };
  }, [salesDocuments]);

  // Toggle step completion in checklist
  const toggleStep = (id: number) => {
    setOnboardingSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, completed: !step.completed } : step))
    );
  };

  const completedStepsCount = useMemo(() => onboardingSteps.filter((s) => s.completed).length, [onboardingSteps]);
  const remainingStepsCount = onboardingSteps.length - completedStepsCount;

  // Handle AI send message
  const handleSendMessage = (textToSend?: string) => {
    const query = (textToSend || chatInput).trim();
    if (!query) return;

    const time = getCurrentTimeString();
    setChatMessages((prev) => [...prev, { sender: 'user', text: query, time }]);
    setChatInput('');
    setAiThinking(true);

    setTimeout(() => {
      let reply = '';
      if (query.includes('doanh số') || query.includes('doanh thu')) {
        reply = `Dựa trên dữ liệu hiện tại của ${companyName}, hệ thống đang trong giai đoạn đầu kỳ vận hành (0 đơn hàng ghi nhận). Khuyến nghị hành động: 1. Đặt mục tiêu doanh số chi tiết cho từng nhân viên; 2. Tiếp cận lại các báo giá mở; 3. Tổ chức chương trình khuyến mại mở bán quý này.`;
      } else if (query.includes('khách hàng') || query.includes('tiềm năng')) {
        reply = `Hệ thống ghi nhận ${totalCustomers} khách hàng trong cơ sở dữ liệu. Để gia tăng tỷ lệ chuyển đổi, bạn nên thiết lập phân loại nhóm khách hàng (VIP, Tiềm năng cao, Khách hàng cũ) và lên lịch chăm sóc định kỳ qua hòm thư tự động.`;
      } else if (query.includes('kịch bản') || query.includes('cuộc gọi')) {
        reply = `Kịch bản gọi điện đề xuất: \n- Mở đầu: Giới thiệu bản thân từ ${companyName}, chúc một ngày làm việc hiệu quả.\n- Nêu lý do: Chia sẻ chính sách giá ưu đãi mới cho các gói giải pháp doanh nghiệp.\n- Lắng nghe: Tìm hiểu nhu cầu dự kiến của khách hàng trong quý tới.\n- Chốt hẹn: Đề xuất gửi báo giá chi tiết qua email và đặt lịch tư vấn 15 phút.`;
      } else {
        reply = `Tôi đã tiếp nhận câu hỏi của bạn về "${query}". Hệ thống đang phân tích các chỉ số liên quan trong phân hệ Quản trị kinh doanh. Bạn có thể sử dụng các mẫu báo cáo và phễu cơ hội để tối ưu hóa quy trình bán hàng ngay hôm nay.`;
      }

      setChatMessages((prev) => [...prev, { sender: 'ai', text: reply, time: getCurrentTimeString() }]);
      setAiThinking(false);
    }, 700);
  };

  // Catalog items for "Tất cả" tab
  const catalogWidgets = [
    { id: 'orders_summary', title: 'Tổng quan chỉ số đơn hàng', category: 'sales', desc: 'Thống kê tổng số đơn hàng, giá trị hợp đồng, thực thu và công nợ còn lại.' },
    { id: 'target_time', title: 'Mục tiêu doanh số theo thời gian', category: 'targets', desc: 'Biểu đồ tiến độ thực hiện mục tiêu doanh số theo từng tháng trong năm 2026.' },
    { id: 'sales_org', title: 'Doanh số theo đơn vị phòng ban', category: 'sales', desc: 'Phân bổ tỷ trọng doanh thu thực tế giữa các phòng ban kinh doanh.' },
    { id: 'sales_items', title: 'Doanh số theo hàng hóa & dịch vụ', category: 'sales', desc: 'Cơ cấu đóng góp doanh thu của từng nhóm sản phẩm chủ lực.' },
    { id: 'target_units', title: 'Mục tiêu doanh số theo đơn vị', category: 'targets', desc: 'Theo dõi tỷ lệ hoàn thành hạn mức doanh số của từng chi nhánh.' },
    { id: 'sales_timeline', title: 'Doanh số theo thời gian lũy kế', category: 'sales', desc: 'Đồ thị tăng trưởng doanh số theo tuần, tháng và quý.' },
    { id: 'top_employees', title: 'Nhân viên kinh doanh xuất sắc', category: 'activities', desc: 'Bảng vinh danh top đại diện bán hàng có doanh số và tỷ lệ chốt cao nhất.' },
    { id: 'target_execution', title: 'Tình hình thực hiện mục tiêu doanh số', category: 'targets', desc: 'Bảng đối chiếu giữa chỉ tiêu giao và giá trị thực tế đã ghi nhận.' },
    { id: 'top_products', title: 'Hàng hóa bán chạy theo giá trị', category: 'sales', desc: 'Danh sách sản phẩm có doanh thu và biên lợi nhuận cao nhất.' },
    { id: 'activity_execution', title: 'Tình hình thực hiện hoạt động bán hàng', category: 'activities', desc: 'Tổng hợp số lượng cuộc gọi, lịch hẹn, đi tuyến và chuyển đổi cơ hội.' },
    { id: 'customer_types', title: 'Doanh số theo loại khách hàng', category: 'customers', desc: 'Phân tích doanh thu từ khách hàng doanh nghiệp, cá nhân và đối tác.' },
    { id: 'debt_aging', title: 'Phân tích tuổi nợ khách hàng', category: 'customers', desc: 'Theo dõi hạn mức nợ quá hạn và cảnh báo rủi ro thanh toán.' },
    { id: 'pipeline_conversion', title: 'Tỷ lệ chuyển đổi phễu bán hàng', category: 'sales', desc: 'Thống kê tỷ lệ chuyển đổi từ khách hàng tiềm năng đến hợp đồng chốt.' },
    { id: 'campaign_roi', title: 'Hiệu quả chiến dịch Marketing & Khuyến mại', category: 'activities', desc: 'Đo lường chi phí thu hút khách hàng và doanh số tạo ra từ chiến dịch.' },
  ];

  const filteredCatalogWidgets = useMemo(() => {
    return catalogWidgets.filter((w) => {
      const matchSearch = w.title.toLowerCase().includes(catalogSearch.toLowerCase()) || w.desc.toLowerCase().includes(catalogSearch.toLowerCase());
      const matchFilter = catalogFilter === 'all' || w.category === catalogFilter;
      return matchSearch && matchFilter;
    });
  }, [catalogSearch, catalogFilter]);

  return (
    <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', padding: '16px 20px 40px' }}>
      {/* Top AMIS CRM Style Nav Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          borderBottom: '1px solid #E2E8F0',
          marginBottom: 16,
          paddingBottom: 4,
        }}
      >
        <button
          onClick={() => setActiveTab('all')}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 4px',
            fontSize: 14,
            fontWeight: activeTab === 'all' ? 600 : 500,
            color: activeTab === 'all' ? '#2563EB' : '#64748B',
            borderBottom: activeTab === 'all' ? '2px solid #2563EB' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          Tất cả
        </button>

        <button
          onClick={() => setActiveTab('overview')}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 4px',
            fontSize: 14,
            fontWeight: activeTab === 'overview' ? 600 : 500,
            color: activeTab === 'overview' ? '#2563EB' : '#64748B',
            borderBottom: activeTab === 'overview' ? '2px solid #2563EB' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          Tổng quan
        </button>

        <button
          onClick={() => setActiveTab('ai')}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 4px',
            fontSize: 14,
            fontWeight: activeTab === 'ai' ? 600 : 500,
            color: activeTab === 'ai' ? '#2563EB' : '#64748B',
            borderBottom: activeTab === 'ai' ? '2px solid #2563EB' : '2px solid transparent',
            cursor: 'pointer',
          }}
        >
          Trợ thủ AI
        </button>

        <button
          onClick={() => setActiveTab('getting-started')}
          style={{
            background: 'none',
            border: 'none',
            padding: '8px 4px',
            fontSize: 14,
            fontWeight: activeTab === 'getting-started' ? 600 : 500,
            color: activeTab === 'getting-started' ? '#2563EB' : '#64748B',
            borderBottom: activeTab === 'getting-started' ? '2px solid #2563EB' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>Bắt đầu sử dụng</span>
          <span
            style={{
              backgroundColor: '#E2E8F0',
              color: '#475569',
              borderRadius: 10,
              padding: '1px 7px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {remainingStepsCount}
          </span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: TỔNG QUAN (BUSINESS DASHBOARD)
         ========================================================================= */}
      {activeTab === 'overview' && (
        <>
          {/* Main Header with Filters and Actions */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
            }}
          >
            {/* Title dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Tình hình kinh doanh</span>
                <DownOutlined style={{ fontSize: 12, color: '#64748B' }} />
              </h2>
              <button
                onClick={() => void loadDashboardData()}
                title="Làm mới toàn bộ dữ liệu"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748B',
                  fontSize: 14,
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <ReloadOutlined spin={loading} />
              </button>
            </div>

            {/* Right filter controls */}
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <Select
                value={orgUnit}
                onChange={(val) => setOrgUnit(String(val))}
                style={{ width: 150 }}
                options={[
                  { value: 'all', label: 'Cơ cấu tổ chức' },
                  { value: 'sales', label: 'Phòng Kinh doanh' },
                  { value: 'marketing', label: 'Phòng Marketing' },
                  { value: 'cskh', label: 'Chăm sóc khách hàng' },
                ]}
              />

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: 6,
                  padding: '5px 12px',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#334155',
                }}
              >
                <ShopOutlined style={{ color: '#2563EB' }} />
                <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {companyName}
                </span>
                <ApartmentOutlined style={{ color: '#64748B', fontSize: 12 }} />
              </div>

              <Select
                value={timeFilter}
                onChange={(val) => setTimeFilter(String(val))}
                style={{ width: 130 }}
                options={[
                  { value: 'today', label: 'Hôm nay' },
                  { value: 'this_week', label: 'Tuần này' },
                  { value: 'this_month', label: 'Tháng này' },
                  { value: 'this_quarter', label: 'Quý này' },
                  { value: 'this_year', label: 'Năm nay' },
                  { value: '2026', label: 'Năm 2026' },
                ]}
              />

              <Button
                onClick={() => setAiModalVisible(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 6,
                  borderColor: '#93C5FD',
                  color: '#1D4ED8',
                  backgroundColor: '#EFF6FF',
                  fontWeight: 600,
                }}
              >
                <RobotOutlined />
                <span>Phân tích với AI</span>
              </Button>

              <Button
                onClick={() => setEditModalVisible(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 6,
                  color: '#334155',
                }}
              >
                <EditOutlined />
                <span>Sửa</span>
              </Button>

              <Button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 6,
                  color: '#334155',
                  width: 36,
                  padding: 0,
                }}
              >
                <EllipsisOutlined style={{ fontSize: 16 }} />
              </Button>
            </div>
          </div>

          {/* Section Sub-header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Tổng quan</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748B' }}>
              <span>Số liệu tính đến: {timestamp}</span>
              <button
                onClick={() => void loadDashboardData()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#2563EB',
                  cursor: 'pointer',
                  fontWeight: 500,
                  padding: 0,
                }}
              >
                Tải lại
              </button>
            </div>
          </div>

          {/* 4 Colored KPI Cards (Row 1) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <MetricCard
              title="Số lượng đơn hàng"
              value={stats.orderCount}
              badge="▲ -"
              bgColor="#5E48E8"
              tooltipText="Tổng số lượng đơn hàng ghi nhận trong kỳ báo cáo"
            />
            <MetricCard
              title="Giá trị đơn hàng"
              value={stats.orderValue}
              badge="▲ -"
              bgColor="#2563EB"
              tooltipText="Tổng giá trị hợp đồng / đơn bán hàng đã xác nhận"
            />
            <MetricCard
              title="Thực thu đơn hàng"
              value={stats.collectedValue}
              badge="▲ -"
              bgColor="#0EA5E9"
              tooltipText="Số tiền khách hàng đã thanh toán thực tế"
            />
            <MetricCard
              title="Còn phải thu đơn hàng"
              value={stats.remainingValue}
              badge="▲ -"
              bgColor="#F97316"
              tooltipText="Công nợ còn phải thu của các đơn hàng"
            />
          </div>

          {/* Grid Row 2: 3 Cards (Mục tiêu thời gian, Doanh số đơn vị, Doanh số hàng hóa) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <ChartCard
              title="Mục tiêu doanh số theo thời gian"
              subtitle="2026"
              timestamp={timestamp}
              onReload={() => void loadDashboardData()}
              emptyType="line"
            />

            <ChartCard
              title="Doanh số theo đơn vị"
              timestamp={timestamp}
              onReload={() => void loadDashboardData()}
              emptyType="bar"
            />

            <ChartCard
              title="Doanh số theo hàng hóa"
              timestamp={timestamp}
              onReload={() => void loadDashboardData()}
              emptyType="pie"
            />
          </div>

          {/* Grid Row 3: 3 Cards (Mục tiêu đơn vị, Doanh số thời gian, Nhân viên xuất sắc) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <ChartCard
              title="Mục tiêu doanh số theo đơn vị"
              extraHeader={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 12 }}>
                  <EditOutlined style={{ cursor: 'pointer' }} />
                  <ReloadOutlined style={{ cursor: 'pointer' }} onClick={() => void loadDashboardData()} />
                  <SettingOutlined style={{ cursor: 'pointer' }} />
                </div>
              }
              timestamp={timestamp}
              onReload={() => void loadDashboardData()}
              emptyType="bar"
            />

            <ChartCard
              title="Doanh số theo thời gian"
              subtitle="2026"
              timestamp={timestamp}
              onReload={() => void loadDashboardData()}
              emptyType="bar"
            />

            <ChartCard
              title="Nhân viên xuất sắc"
              timestamp={timestamp}
              onReload={() => void loadDashboardData()}
              emptyType="doc"
            />
          </div>

          {/* Grid Row 4: 2 Cards (Tình hình thực hiện mục tiêu doanh số, Hàng hóa bán chạy theo giá trị) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <ChartCard
              title="Tình hình thực hiện mục tiêu doanh số"
              extraHeader={
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 12 }}>
                  <EditOutlined style={{ cursor: 'pointer' }} />
                  <ReloadOutlined style={{ cursor: 'pointer' }} onClick={() => void loadDashboardData()} />
                  <SettingOutlined style={{ cursor: 'pointer' }} />
                </div>
              }
              timestamp={timestamp}
              onReload={() => void loadDashboardData()}
              emptyType="doc"
            >
              {/* Table Header Summary */}
              <div
                style={{
                  backgroundColor: '#F8FAFC',
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#475569',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  textAlign: 'center',
                  borderBottom: '1px solid #E2E8F0',
                  marginBottom: 12,
                }}
              >
                <span>Mục tiêu doanh số</span>
                <span>Đã thực hiện</span>
                <span>% Đã thực hiện</span>
                <span>Còn thực hiện</span>
                <span>% Còn thực hiện</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  textAlign: 'center',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#64748B',
                  padding: '4px 12px 12px',
                  borderBottom: '1px dashed #CBD5E1',
                }}
              >
                <span style={{ fontWeight: 600, color: '#1E293B' }}>Tổng</span>
                <span>-</span>
                <span>-</span>
                <span>-</span>
                <span>-</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                <span style={{ fontSize: 12, color: '#2563EB', cursor: 'pointer' }}>Xem thêm</span>
              </div>
            </ChartCard>

            <ChartCard
              title="Hàng hóa bán chạy theo giá trị"
              timestamp={timestamp}
              onReload={() => void loadDashboardData()}
              emptyType="doc"
            />
          </div>

          {/* Grid Row 5: 2 Cards (Tình hình thực hiện hoạt động, Doanh số theo loại khách hàng) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            <ChartCard
              title="Tình hình thực hiện hoạt động"
              timestamp={timestamp}
              onReload={() => void loadDashboardData()}
              emptyType="doc"
            >
              {/* Sub-tabs for activity status */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  borderBottom: '1px solid #F1F5F9',
                  paddingBottom: 8,
                  marginBottom: 12,
                }}
              >
                <button
                  onClick={() => setActiveActivityTab('count')}
                  style={{
                    background: activeActivityTab === 'count' ? '#EFF6FF' : 'none',
                    color: activeActivityTab === 'count' ? '#2563EB' : '#64748B',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: activeActivityTab === 'count' ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  SL hoạt động
                </button>
                <button
                  onClick={() => setActiveActivityTab('opportunity')}
                  style={{
                    background: activeActivityTab === 'opportunity' ? '#EFF6FF' : 'none',
                    color: activeActivityTab === 'opportunity' ? '#2563EB' : '#64748B',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: activeActivityTab === 'opportunity' ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  Cơ hội
                </button>
                <button
                  onClick={() => setActiveActivityTab('order')}
                  style={{
                    background: activeActivityTab === 'order' ? '#EFF6FF' : 'none',
                    color: activeActivityTab === 'order' ? '#2563EB' : '#64748B',
                    border: 'none',
                    borderRadius: 4,
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: activeActivityTab === 'order' ? 600 : 500,
                    cursor: 'pointer',
                  }}
                >
                  Đơn hàng
                </button>
              </div>

              {/* Activity Category badges */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: 14,
                }}
              >
                {['Hoạt động', 'Nhiệm vụ', 'Lịch hẹn', 'Cuộc gọi', 'Đi tuyến'].map((cat) => (
                  <span
                    key={cat}
                    style={{
                      backgroundColor: '#F1F5F9',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 11,
                      color: '#475569',
                      fontWeight: 500,
                    }}
                  >
                    {cat}
                  </span>
                ))}
              </div>

              {/* Metrics summary list */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: 8,
                  fontSize: 11,
                  color: '#64748B',
                  backgroundColor: '#FAFAFA',
                  padding: 10,
                  borderRadius: 6,
                  marginBottom: 10,
                }}
              >
                <div>SL cơ hội: <strong>0</strong></div>
                <div>SL thua: <strong>0</strong></div>
                <div>SL thắng: <strong>0</strong></div>
                <div>DS thắng: <strong>0</strong></div>
                <div>SL đơn hàng: <strong>{stats.orderCount}</strong></div>
                <div>SL khách hàng: <strong>{totalCustomers}</strong></div>
                <div>Doanh số đề nghị ghi: <strong>0</strong></div>
                <div>DS đã ghi: <strong>0</strong></div>
              </div>
            </ChartCard>

            <ChartCard
              title="Doanh số theo loại khách hàng"
              topMetric={0}
              timestamp={timestamp}
              onReload={() => void loadDashboardData()}
              emptyType="pie"
            />
          </div>
        </>
      )}

      {/* =========================================================================
          TAB 2: TRỢ THỦ AI (AI COPILOT / SALES ASSISTANT)
         ========================================================================= */}
      {activeTab === 'ai' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
          {/* Main AI Chat & Advisor Area */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 8,
              border: '1px solid #E2E8F0',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 600,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14, borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB', fontSize: 18 }}>
                  <RobotOutlined />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Trợ thủ AI Phân tích & Bán hàng</h3>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748B' }}>Tự động hóa số liệu kinh doanh và đề xuất hành động tăng trưởng</p>
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#16A34A', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>
                Sẵn sàng hỗ trợ
              </span>
            </div>

            {/* Suggested Prompt Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '14px 0', padding: '10px 12px', backgroundColor: '#F8FAFC', borderRadius: 6 }}>
              <span style={{ fontSize: 12, color: '#475569', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                <ThunderboltOutlined style={{ color: '#F59E0B' }} /> Gợi ý câu hỏi:
              </span>
              {[
                'Phân tích tình hình kinh doanh tháng này',
                'Kịch bản gọi điện chốt hợp đồng mẫu',
                'Chiến lược tăng trưởng khách hàng xây dựng',
                'Dự báo công nợ và rủi ro thanh toán',
              ].map((chip) => (
                <button
                  key={chip}
                  onClick={() => handleSendMessage(chip)}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #CBD5E1',
                    borderRadius: 14,
                    padding: '3px 10px',
                    fontSize: 12,
                    color: '#334155',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Chat Conversation Box */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                padding: '10px 4px',
                minHeight: 340,
                maxHeight: 460,
              }}
            >
              {chatMessages.map((msg, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '82%',
                      backgroundColor: msg.sender === 'user' ? '#2563EB' : '#F1F5F9',
                      color: msg.sender === 'user' ? '#FFFFFF' : '#1E293B',
                      padding: '10px 14px',
                      borderRadius: 8,
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: 'pre-line',
                    }}
                  >
                    {msg.text}
                  </div>
                  <span style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>{msg.time}</span>
                </div>
              ))}
              {aiThinking && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748B', fontSize: 12 }}>
                  <RobotOutlined spin /> Trợ thủ AI đang phân tích dữ liệu...
                </div>
              )}
            </div>

            {/* Chat Input Box */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
              <Input
                placeholder="Nhập câu hỏi hoặc yêu cầu phân tích kinh doanh..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendMessage();
                }}
                style={{ flex: 1 }}
              />
              <Button type="primary" onClick={() => handleSendMessage()} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SendOutlined /> Gửi
              </Button>
            </div>
          </div>

          {/* Right AI Insights & Tools Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 16 }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Thống kê nhanh AI</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, color: '#475569' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #E2E8F0' }}>
                  <span>Tỷ lệ hoàn thành mục tiêu:</span>
                  <strong style={{ color: '#2563EB' }}>0%</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #E2E8F0' }}>
                  <span>Cơ hội cần xúc tiến gấp:</span>
                  <strong style={{ color: '#F97316' }}>0</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #E2E8F0' }}>
                  <span>Khách hàng chưa tương tác 30 ngày:</span>
                  <strong style={{ color: '#64748B' }}>0</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span>Đơn hàng chờ duyệt thanh toán:</span>
                  <strong style={{ color: '#16A34A' }}>0</strong>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 16 }}>
              <h4 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 700, color: '#0F172A' }}>Công cụ tự động hóa</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Button onClick={() => handleSendMessage('Soạn email giới thiệu chính sách bán hàng mới')} style={{ textAlign: 'left', fontSize: 12 }}>
                  Soạn email tiếp cận đối tác
                </Button>
                <Button onClick={() => handleSendMessage('Đánh giá rủi ro công nợ khách hàng hiện tại')} style={{ textAlign: 'left', fontSize: 12 }}>
                  Đánh giá hạn mức công nợ
                </Button>
                <Button onClick={() => handleSendMessage('Lập kế hoạch phân bổ chỉ tiêu doanh số quý')} style={{ textAlign: 'left', fontSize: 12 }}>
                  Lập kế hoạch doanh số quý
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: BẮT ĐẦU SỬ DỤNG (19-STEP ONBOARDING CHECKLIST)
         ========================================================================= */}
      {activeTab === 'getting-started' && (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 24 }}>
          {/* Header & Progress Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
                Danh mục thiết lập & Khởi động kinh doanh (19 bước)
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
                Hoàn thiện các bước dưới đây để vận hành toàn bộ quy trình bán hàng, phễu cơ hội và báo cáo doanh số chuẩn nghiệp vụ.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#2563EB' }}>
                {completedStepsCount} / {onboardingSteps.length} hoàn thành ({Math.round((completedStepsCount / onboardingSteps.length) * 100)}%)
              </span>
            </div>
          </div>

          {/* Progress track */}
          <div style={{ width: '100%', height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginBottom: 24 }}>
            <div
              style={{
                width: `${(completedStepsCount / onboardingSteps.length) * 100}%`,
                height: '100%',
                backgroundColor: '#2563EB',
                borderRadius: 4,
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          {/* Checklist by Category */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {onboardingSteps.map((step) => (
              <div
                key={step.id}
                onClick={() => toggleStep(step.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '12px 16px',
                  borderRadius: 6,
                  border: step.completed ? '1px solid #E2E8F0' : '1px solid #CBD5E1',
                  backgroundColor: step.completed ? '#F8FAFC' : '#FFFFFF',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ marginTop: 2 }}>
                  {step.completed ? (
                    <CheckCircleOutlined style={{ fontSize: 18, color: '#16A34A' }} />
                  ) : (
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: '2px solid #94A3B8' }} />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: step.completed ? '#64748B' : '#0F172A',
                        textDecoration: step.completed ? 'line-through' : 'none',
                      }}
                    >
                      {step.id}. {step.title}
                    </span>
                    <span style={{ fontSize: 11, backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>
                      {step.category}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748B', lineHeight: 1.4 }}>
                    {step.description}
                  </p>
                </div>
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStep(step.id);
                  }}
                  style={{ fontSize: 12 }}
                >
                  {step.completed ? 'Đánh dấu chưa xong' : 'Thực hiện'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: TẤT CẢ (ALL CRM WIDGETS & REPORT CATALOG)
         ========================================================================= */}
      {activeTab === 'all' && (
        <div style={{ backgroundColor: '#FFFFFF', borderRadius: 8, border: '1px solid #E2E8F0', padding: 24 }}>
          {/* Header & Filter Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14, marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
                Danh mục Tiện ích & Báo cáo Bán hàng (14 báo cáo)
              </h3>
              <p style={{ margin: 0, fontSize: 13, color: '#64748B' }}>
                Tùy biến hiển thị các tiện ích phân tích và mẫu báo cáo trên bàn làm việc của bạn.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Input
                prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
                placeholder="Tìm tiện ích, biểu đồ..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                style={{ width: 220 }}
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
            {[
              { key: 'all', label: 'Tất cả (14)' },
              { key: 'sales', label: 'Doanh số & Đơn hàng (6)' },
              { key: 'targets', label: 'Mục tiêu & Hạn mức (3)' },
              { key: 'activities', label: 'Hoạt động & Nhân viên (3)' },
              { key: 'customers', label: 'Khách hàng & Công nợ (2)' },
            ].map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCatalogFilter(cat.key)}
                style={{
                  background: catalogFilter === cat.key ? '#2563EB' : '#F1F5F9',
                  color: catalogFilter === cat.key ? '#FFFFFF' : '#475569',
                  border: 'none',
                  borderRadius: 16,
                  padding: '4px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Widgets Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {filteredCatalogWidgets.map((widget) => (
              <div
                key={widget.id}
                style={{
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, backgroundColor: '#F1F5F9', color: '#64748B', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
                      {widget.category === 'sales' ? 'Doanh số' : widget.category === 'targets' ? 'Mục tiêu' : widget.category === 'activities' ? 'Hoạt động' : 'Khách hàng'}
                    </span>
                    <span style={{ fontSize: 12, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckOutlined /> Đang hiển thị
                    </span>
                  </div>
                  <h4 style={{ margin: '0 0 6px 0', fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{widget.title}</h4>
                  <p style={{ margin: 0, fontSize: 12, color: '#64748B', lineHeight: 1.4 }}>{widget.desc}</p>
                </div>
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      setActiveTab('overview');
                      message.info(`Đang chuyển đến tiện ích: ${widget.title}`);
                    }}
                    style={{ background: 'none', border: 'none', color: '#2563EB', fontSize: 12, fontWeight: 500, cursor: 'pointer', padding: 0 }}
                  >
                    Xem trên bàn làm việc
                  </button>
                  <Button size="small" onClick={() => message.success('Đã cập nhật hiển thị tiện ích.')}>
                    Tùy biến
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Analysis Modal */}
      <Modal
        title="Trợ thủ Phân tích Kinh doanh với AI"
        open={aiModalVisible}
        onCancel={() => setAiModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setAiModalVisible(false)}>
            Đóng
          </Button>,
        ]}
      >
        <div style={{ padding: 14, fontSize: 13, lineHeight: 1.6, color: '#334155' }}>
          <p style={{ fontWeight: 600, color: '#1E293B', marginBottom: 10 }}>
            Tóm tắt đánh giá tình hình kinh doanh tháng này:
          </p>
          <ul style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Hệ thống đang ở trạng thái mới khởi tạo, chưa ghi nhận đơn bán hàng trong kỳ.</li>
            <li>Đơn hàng cần xử lý: 0 đơn. Công nợ cần thu hồi: 0 đ.</li>
            <li>Khuyến nghị: Bổ sung khách hàng tiềm năng, tạo báo giá và xác nhận đơn hàng đầu tiên để kích hoạt biểu đồ phân tích tự động.</li>
          </ul>
        </div>
      </Modal>

      {/* Edit Dashboard Layout Modal */}
      <Modal
        title="Tùy chỉnh Bàn làm việc & Tiện ích"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            Hủy
          </Button>,
          <Button key="save" type="primary" onClick={() => { setEditModalVisible(false); message.success('Đã lưu cấu hình bàn làm việc.'); }}>
            Lưu thay đổi
          </Button>,
        ]}
      >
        <div style={{ padding: 14, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, color: '#64748B' }}>
            Chọn các thẻ biểu đồ và tiện ích muốn hiển thị trên trang Tổng quan tình hình kinh doanh:
          </p>
          {[
            'Mục tiêu doanh số theo thời gian',
            'Doanh số theo đơn vị',
            'Doanh số theo hàng hóa',
            'Mục tiêu doanh số theo đơn vị',
            'Doanh số theo thời gian',
            'Nhân viên xuất sắc',
            'Tình hình thực hiện mục tiêu doanh số',
            'Hàng hóa bán chạy theo giá trị',
            'Tình hình thực hiện hoạt động',
            'Doanh số theo loại khách hàng',
          ].map((item) => (
            <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked />
              <span style={{ color: '#1E293B', fontWeight: 500 }}>{item}</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
};
