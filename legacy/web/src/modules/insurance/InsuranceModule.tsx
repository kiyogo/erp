import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CalendarOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  MedicineBoxOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  DollarOutlined,
  CloudSyncOutlined,
  AuditOutlined,
  EyeOutlined,
  EditOutlined,
  PrinterOutlined,
  IdcardOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Card, Button, Input, Select, Tag, Modal, Form, message, Drawer, Progress, Alert } from '../../custom-ui';
import { collectionsApi, contractsApi, employeesApi, type ContractPayload, type EnterpriseEmployee } from '../../api/endpoints';
import { dataService, type PayrollRecord } from '../../services/dataService';

export interface InsuranceLaborItem {
  key: string;
  empCode: string;
  fullName: string;
  dept: string;
  position: string;
  socialInsNumber: string;
  healthInsNumber: string;
  salaryBase: number;
  empRatio: number; // 10.5%
  compRatio: number; // 21.5%
  hospitalClinic: string;
  startDate: string;
  status: 'Đang tham gia' | 'Nghỉ thai sản' | 'Tạm hoãn' | 'Đã báo giảm';
}

export interface InsuranceAdjustmentItem {
  key: string;
  d02Code: string;
  empName: string;
  empCode: string;
  adjustType: 'Báo tăng mới' | 'Báo giảm hẳn' | 'Điều chỉnh tăng lương' | 'Nghỉ thai sản' | 'Nghỉ ốm dài ngày';
  oldSalary: number;
  newSalary: number;
  effectiveMonth: string;
  filingDate: string;
  vssSubmissionStatus: 'BHXH đã duyệt' | 'Đã nộp qua Cổng eBH' | 'Chờ nộp' | 'Yêu cầu giải trình';
}

export interface InsuranceRegimeItem {
  key: string;
  claimCode: string;
  empName: string;
  regimeType: 'Ốm đau ngắn ngày' | 'Thai sản (6 tháng)' | 'Dưỡng sức sau sinh' | 'Khám thai định kỳ' | 'Tai nạn lao động';
  leaveDays: number;
  calculatedAmount: number;
  bankAccount: string;
  approvalStatus: 'Đã giải ngân' | 'BHXH duyệt chi' | 'Đang thẩm định';
  settlementDate: string;
}

export interface ContributionSummary {
  period: string;
  headcount: number;
  totalSalaryFund: number;
  socialInsAmt: number; // 25.5%
  healthInsAmt: number; // 4.5%
  unempInsAmt: number; // 2%
  totalPayable: number; // 32%
  paidAmount: number;
  balanceOwed: number;
  c12Status: 'Khớp đúng 100%' | 'Đang đối soát';
}

const INITIAL_LABOR: InsuranceLaborItem[] = [];

const INITIAL_ADJUSTMENTS: InsuranceAdjustmentItem[] = [];

const INITIAL_REGIMES: InsuranceRegimeItem[] = [];

const TODAY = new Date().toISOString().slice(0, 10);
const BHXH_RATE = 0.255;
const BHYT_RATE = 0.045;
const BHTN_RATE = 0.02;
const TOTAL_INSURANCE_RATE = BHXH_RATE + BHYT_RATE + BHTN_RATE;

const INSURANCE_PAGE_IDS = [
  'overview',
  'labor',
  'adjustments',
  'regimes',
  'card',
  'voluntary',
  'contributions',
  'expenses',
] as const;

type InsurancePageId = (typeof INSURANCE_PAGE_IDS)[number];

const isInsurancePageId = (value: string): value is InsurancePageId =>
  INSURANCE_PAGE_IDS.includes(value as InsurancePageId);

export const InsuranceModule: React.FC = () => {
  const location = useLocation();
  const rawPath = location.pathname.replace(/^\/admin/, '');
  const requestedPage = rawPath.split('/')[2] || 'overview';
  const activePage: InsurancePageId = isInsurancePageId(requestedPage) ? requestedPage : 'overview';

  // States
  const [laborList, setLaborList] = useState<InsuranceLaborItem[]>(INITIAL_LABOR);
  const [adjustments, setAdjustments] = useState<InsuranceAdjustmentItem[]>(INITIAL_ADJUSTMENTS);
  const [regimes, setRegimes] = useState<InsuranceRegimeItem[]>(INITIAL_REGIMES);
  const [contributions, setContributions] = useState<ContributionSummary[]>([]);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [contracts, setContracts] = useState<ContractPayload[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'adjust' | 'regime'>('adjust');
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLabor, setSelectedLabor] = useState<InsuranceLaborItem | null>(null);

  useEffect(() => {
    const loadInsuranceData = async () => {
      try {
        const [employeeRes, contractRes, payrollRes] = await Promise.all([
          employeesApi.getAll(),
          contractsApi.getAll(),
          collectionsApi.get<PayrollRecord>('payroll'),
        ]);

        const employeeRows = employeeRes.data.data || [];
        const contractRows = contractRes.data.data || [];
        const payrollRows = payrollRes.data.data || [];

        setEmployees(employeeRows);
        setContracts(contractRows);

        const contractByEmployeeCode = new Map(
          contractRows
            .filter((item) => item.employeeCode)
            .map((item) => [String(item.employeeCode), item]),
        );

        const mappedLabor = employeeRows
          .filter((item) => item.status !== 'Đã nghỉ việc')
          .map((item) => {
            const contract = contractByEmployeeCode.get(item.employeeCode || item.code);
            return {
              key: item.id || item.key,
              empCode: item.employeeCode || item.code,
              fullName: item.name || item.fullName,
              dept: item.department || 'Chưa phân bổ',
              position: item.position || '',
              socialInsNumber: '',
              healthInsNumber: '',
              salaryBase: Number(item.salaryBase || 0),
              empRatio: 10.5,
              compRatio: 21.5,
              hospitalClinic: '',
              startDate: item.joinDate || '',
              status: contract?.status === 'Đã hết hạn' ? 'Tạm hoãn' : 'Đang tham gia',
            } satisfies InsuranceLaborItem;
          });

        setLaborList(mappedLabor);

        const payrollMap = new Map<string, PayrollRecord[]>();
        payrollRows.forEach((item) => {
          const monthKey = String(item.month || '').trim() || 'Chưa rõ kỳ';
          const list = payrollMap.get(monthKey) || [];
          list.push(item);
          payrollMap.set(monthKey, list);
        });

        const computedContributions = Array.from(payrollMap.entries())
          .map(([period, rows]) => {
            const totalSalaryFund = rows.reduce((sum, row) => sum + Number(row.baseSalary || 0), 0);
            const totalPayable = Math.round(totalSalaryFund * TOTAL_INSURANCE_RATE);
            const paidAmount = rows.every((row) => row.status === 'Đã chi trả') ? totalPayable : 0;
            return {
              period,
              headcount: rows.length,
              totalSalaryFund,
              socialInsAmt: Math.round(totalSalaryFund * BHXH_RATE),
              healthInsAmt: Math.round(totalSalaryFund * BHYT_RATE),
              unempInsAmt: Math.round(totalSalaryFund * BHTN_RATE),
              totalPayable,
              paidAmount,
              balanceOwed: Math.max(0, totalPayable - paidAmount),
              c12Status: paidAmount === totalPayable ? 'Khớp đúng 100%' : 'Đang đối soát',
            } satisfies ContributionSummary;
          })
          .sort((left, right) => right.period.localeCompare(left.period));

        const savedAdjustments = dataService.getGenericData('insurance_adjustments');
        if (Array.isArray(savedAdjustments) && savedAdjustments.length > 0) {
          setAdjustments(savedAdjustments);
        }
        const savedRegimes = dataService.getGenericData('insurance_regimes');
        if (Array.isArray(savedRegimes) && savedRegimes.length > 0) {
          setRegimes(savedRegimes);
        }

        setContributions(computedContributions);
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Không thể tải dữ liệu bảo hiểm.');
      }
    };

    void loadInsuranceData();
  }, []);

  const totalHeadcount = laborList.length;
  const currentContribution = contributions[0];
  const currentMonthPayable = currentContribution?.totalPayable || 0;
  const pendingClaimsCount = regimes.filter((r) => r.approvalStatus !== 'Đã giải ngân').length;
  const hasContributionData = contributions.length > 0;
  const hasInsuranceData = laborList.length > 0 || contracts.length > 0 || contributions.length > 0 || regimes.length > 0;
  const activeInsuranceContracts = useMemo(
    () => contracts.filter((item) => item.insuranceType && item.status !== 'Đã hết hạn').length,
    [contracts],
  );
  const employeesMissingInsurance = useMemo(
    () => laborList.filter((item) => !item.salaryBase).length,
    [laborList],
  );

  const handleOpenAddAdjust = () => {
    setModalType('adjust');
    form.resetFields();
    form.setFieldsValue({
      d02Code: `D02-2026/08-0${adjustments.length + 1}`,
      adjustType: 'Báo tăng mới',
      effectiveMonth: 'Tháng 08/2026',
      filingDate: new Date().toISOString().substring(0, 10),
    });
    setModalOpen(true);
  };

  const handleOpenAddRegime = () => {
    setModalType('regime');
    form.resetFields();
    form.setFieldsValue({
      claimCode: `CĐ-2026/0${regimes.length + 1}`,
      regimeType: 'Ốm đau ngắn ngày',
      leaveDays: 3,
    });
    setModalOpen(true);
  };

  const handleSaveModal = (values: any) => {
    if (modalType === 'adjust') {
      const newAdj: InsuranceAdjustmentItem = {
        ...values,
        key: String(Date.now()),
        oldSalary: Number(values.oldSalary) || 0,
        newSalary: Number(values.newSalary) || 15000000,
        vssSubmissionStatus: 'Đã nộp qua Cổng eBH',
      };
      const nextAdjustments = [newAdj, ...adjustments];
      setAdjustments(nextAdjustments);
      dataService.saveGenericData('insurance_adjustments', nextAdjustments);
      message.success(`Đã lập hồ sơ D02-LT: ${values.d02Code} (${values.empName})`);
    } else {
      const newRegime: InsuranceRegimeItem = {
        ...values,
        key: String(Date.now()),
        leaveDays: Number(values.leaveDays) || 3,
        calculatedAmount: Number(values.calculatedAmount) || 2500000,
        approvalStatus: 'Đang thẩm định',
        settlementDate: 'Chờ duyệt',
      };
      const nextRegimes = [newRegime, ...regimes];
      setRegimes(nextRegimes);
      dataService.saveGenericData('insurance_regimes', nextRegimes);
      message.success(`Đã lập hồ sơ giải quyết chế độ ${values.claimCode} thành công!`);
    }
    setModalOpen(false);
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* /admin/insurance/overview: dashboard only */}
      {activePage === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lao động tham gia BHXH bắt buộc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalHeadcount} nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{activeInsuranceContracts} hợp đồng còn hiệu lực có khai báo loại bảo hiểm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Kỳ đóng BHXH hiện tại</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {currentMonthPayable.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
            {hasContributionData ? `${currentContribution?.period} · tỷ lệ cấu hình 32% (DN 21.5% + NLĐ 10.5%)` : 'Chưa có dữ liệu payroll để tính kỳ đóng bảo hiểm'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hồ sơ hưởng chế độ đang xử lý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingClaimsCount} hồ sơ
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Các hồ sơ chế độ đang có trong dữ liệu hiện tại</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đối soát Thông báo Mẫu C12-TS</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {currentContribution?.c12Status || 'Chưa có dữ liệu'}
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{employeesMissingInsurance} nhân sự chưa có mức lương đóng hoặc dữ liệu chưa đủ để chốt đối soát</div>
        </div>
          </div>
        </>
      )}

      {/* /admin/insurance/overview */}
      {activePage === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SafetyCertificateOutlined style={{ color: '#009688' }} /> Cơ Cấu Tỷ Lệ Đóng BHXH - BHYT - BHTN Năm 2026 (Tổng 32%)
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 12, background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>1. Bảo Hiểm Xã Hội (Hưu trí, Tử tuất, Ốm đau, Thai sản)</span>
                  <span style={{ fontWeight: 800, color: '#009688' }}>25.5% (DN: 17.5% · NLĐ: 8%)</span>
                </div>
                <Progress percent={79.6} strokeColor="#009688" size="small" showInfo={false} />
              </div>

              <div style={{ padding: 12, background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>2. Bảo Hiểm Y Tế (Khám chữa bệnh BHYT)</span>
                  <span style={{ fontWeight: 800, color: '#2563EB' }}>4.5% (DN: 3.0% · NLĐ: 1.5%)</span>
                </div>
                <Progress percent={14.0} strokeColor="#2563EB" size="small" showInfo={false} />
              </div>

              <div style={{ padding: 12, background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: '#0F172A' }}>3. Bảo Hiểm Thất Nghiệp (BHTN)</span>
                  <span style={{ fontWeight: 800, color: '#7C3AED' }}>2.0% (DN: 1.0% · NLĐ: 1.0%)</span>
                </div>
                <Progress percent={6.4} strokeColor="#7C3AED" size="small" showInfo={false} />
              </div>
            </div>

            <div style={{ marginTop: 16, padding: 12, background: '#EFF6FF', borderRadius: 6, border: '1px solid #BFDBFE', fontSize: 12.5, color: '#1E40AF' }}>
              {hasInsuranceData
                ? 'Tổng quan đang phản ánh dữ liệu hiện có từ hồ sơ nhân sự, hợp đồng và payroll đã phát sinh.'
                : 'Chưa có dữ liệu bảo hiểm để hiển thị tổng quan. Khi phát sinh hồ sơ nhân sự, hợp đồng và payroll, hệ thống sẽ tự tổng hợp tại đây.'}
            </div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                <AuditOutlined style={{ color: '#2563EB' }} /> Lịch Trình Đối Soát &amp; Nộp BHXH
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>Kỳ đang theo dõi:</div>
                  <div style={{ color: '#DC2626', fontWeight: 700, marginTop: 2 }}>{currentContribution?.period || 'Chưa xác định kỳ'} tính đến ngày {TODAY}</div>
                </div>

                <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>Hồ sơ tăng giảm đang có:</div>
                  <div style={{ color: '#2563EB', fontWeight: 700, marginTop: 2 }}>{adjustments.length} bản ghi điều chỉnh</div>
                </div>

                <div style={{ padding: '10px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>Chi phí BHXH còn chờ đối soát:</div>
                  <div style={{ color: '#16A34A', fontWeight: 700, marginTop: 2 }}>{(currentContribution?.balanceOwed || 0).toLocaleString('vi-VN')} ₫</div>
                </div>
              </div>
            </div>

            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => message.success('Đã xuất báo cáo tổng hợp đóng BHXH (Mẫu C12-TS)!')}
              style={{ backgroundColor: '#009688', borderColor: '#009688', marginTop: 14 }}
              disabled={!hasContributionData}
            >
              Xuất Báo Cáo Đối Soát C12
            </Button>
          </div>
        </div>
      )}

      {/* /admin/insurance/labor */}
      {activePage === 'labor' && (
        <div className="transparent-table-card">
          <KTable
            dataSource={laborList}
            columns={[
              {
                title: 'Mã NV & Họ tên',
                key: 'name',
                width: 210,
                render: (_: any, r: InsuranceLaborItem) => (
                  <div>
                    <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.fullName}</strong>
                    <div style={{ fontSize: 11.5, color: '#009688' }}>{r.empCode} · {r.dept}</div>
                  </div>
                ),
              },
              {
                title: 'Số Sổ BHXH & Mã BHYT',
                key: 'insNumber',
                width: 200,
                render: (_: any, r: InsuranceLaborItem) => (
                  <div style={{ fontSize: 12 }}>
                    <div>
                      Sổ: <strong style={{ color: '#2563EB' }}>{r.socialInsNumber}</strong>
                    </div>
                    <div style={{ color: '#64748B', marginTop: 2 }}>BHYT: {r.healthInsNumber}</div>
                  </div>
                ),
              },
              {
                title: 'Mức lương đóng BHXH',
                dataIndex: 'salaryBase',
                key: 'salaryBase',
                width: 170,
                render: (sal: number) => (
                  <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
                    {sal.toLocaleString('vi-VN')} ₫
                  </span>
                ),
              },
              {
                title: 'Cơ sở KCB Ban đầu',
                dataIndex: 'hospitalClinic',
                key: 'hospitalClinic',
                render: (h: string) => <span style={{ fontSize: 12, color: '#334155' }}>{h}</span>,
              },
              {
                title: 'Ngày bắt đầu',
                dataIndex: 'startDate',
                key: 'startDate',
                width: 120,
                render: (d: string) => <span style={{ fontSize: 12, color: '#64748B' }}>{d}</span>,
              },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                key: 'status',
                width: 140,
                render: (st: string) => {
                  let col = 'success';
                  if (st === 'Nghỉ thai sản') col = 'purple';
                  if (st === 'Tạm hoãn') col = 'warning';
                  if (st === 'Đã báo giảm') col = 'default';
                  return <Tag color={col}>{st}</Tag>;
                },
              },
              {
                title: 'Thao tác',
                key: 'actions',
                width: 100,
                render: (_: any, r: InsuranceLaborItem) => (
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setSelectedLabor(r);
                      setDrawerOpen(true);
                    }}
                  >
                    Hồ sơ
                  </Button>
                ),
              },
            ]}
            pagination={{ pageSize: 8 }}
          />
        </div>
      )}

      {/* /admin/insurance/adjustments */}
      {activePage === 'adjustments' && (
        <div className="transparent-table-card">
          <KTable
            dataSource={adjustments}
            columns={[
              {
                title: 'Mã hồ sơ D02-LT',
                dataIndex: 'd02Code',
                key: 'd02Code',
                width: 170,
                render: (c: string) => (
                  <span style={{ fontWeight: 700, color: '#009688', fontFamily: 'monospace' }}>
                    {c}
                  </span>
                ),
              },
              {
                title: 'Nhân viên & Mã',
                key: 'emp',
                width: 200,
                render: (_: any, r: InsuranceAdjustmentItem) => (
                  <div>
                    <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.empName}</strong>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>{r.empCode}</div>
                  </div>
                ),
              },
              {
                title: 'Loại nghiệp vụ điều chỉnh',
                dataIndex: 'adjustType',
                key: 'adjustType',
                width: 200,
                render: (t: string) => {
                  let color = 'blue';
                  if (t === 'Báo tăng mới') color = 'green';
                  if (t === 'Báo giảm hẳn') color = 'red';
                  if (t === 'Nghỉ thai sản') color = 'purple';
                  return <Tag color={color}>{t}</Tag>;
                },
              },
              {
                title: 'Mức lương Cũ ➔ Mới',
                key: 'salary',
                width: 220,
                render: (_: any, r: InsuranceAdjustmentItem) => (
                  <div style={{ fontSize: 12 }}>
                    <span>{r.oldSalary.toLocaleString('vi-VN')} ₫</span>
                    <span style={{ color: '#2563EB', fontWeight: 700, margin: '0 6px' }}>➔</span>
                    <strong style={{ color: '#16A34A' }}>{r.newSalary.toLocaleString('vi-VN')} ₫</strong>
                  </div>
                ),
              },
              {
                title: 'Kỳ áp dụng & Ngày nộp',
                key: 'time',
                width: 180,
                render: (_: any, r: InsuranceAdjustmentItem) => (
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{r.effectiveMonth}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>Ngày nộp: {r.filingDate}</div>
                  </div>
                ),
              },
              {
                title: 'Trạng thái Cổng eBH',
                dataIndex: 'vssSubmissionStatus',
                key: 'vssSubmissionStatus',
                width: 170,
                render: (st: string) => {
                  let color = 'processing';
                  if (st === 'BHXH đã duyệt') color = 'success';
                  if (st === 'Yêu cầu giải trình') color = 'error';
                  return <Tag color={color}>{st}</Tag>;
                },
              },
            ]}
            pagination={{ pageSize: 8 }}
          />
        </div>
      )}

      {/* /admin/insurance/regimes */}
      {activePage === 'regimes' && (
        <div className="transparent-table-card">
          <KTable
            dataSource={regimes}
            columns={[
              {
                title: 'Mã hồ sơ chế độ',
                dataIndex: 'claimCode',
                key: 'claimCode',
                width: 140,
                render: (c: string) => <strong style={{ color: '#009688' }}>{c}</strong>,
              },
              {
                title: 'Họ tên người hưởng',
                dataIndex: 'empName',
                key: 'empName',
                width: 180,
                render: (n: string) => <strong style={{ color: '#0F172A' }}>{n}</strong>,
              },
              {
                title: 'Loại chế độ trợ cấp',
                dataIndex: 'regimeType',
                key: 'regimeType',
                width: 200,
                render: (t: string) => {
                  let col = 'blue';
                  if (t.includes('Thai sản')) col = 'purple';
                  if (t.includes('Ốm đau')) col = 'orange';
                  return <Tag color={col}>{t}</Tag>;
                },
              },
              {
                title: 'Thời gian hưởng',
                dataIndex: 'leaveDays',
                key: 'leaveDays',
                width: 140,
                render: (days: number) => <strong>{days} ngày</strong>,
              },
              {
                title: 'Số tiền trợ cấp BHXH',
                dataIndex: 'calculatedAmount',
                key: 'calculatedAmount',
                width: 170,
                render: (amt: number) => (
                  <span style={{ fontWeight: 800, color: '#16A34A', fontSize: 13.5 }}>
                    {amt.toLocaleString('vi-VN')} ₫
                  </span>
                ),
              },
              {
                title: 'Tài khoản nhận trợ cấp',
                dataIndex: 'bankAccount',
                key: 'bankAccount',
                render: (acc: string) => <span style={{ fontSize: 12, color: '#334155' }}>{acc}</span>,
              },
              {
                title: 'Tình trạng giải quyết',
                dataIndex: 'approvalStatus',
                key: 'approvalStatus',
                width: 160,
                render: (st: string) => {
                  let col = 'processing';
                  if (st === 'Đã giải ngân' || st === 'BHXH duyệt chi') col = 'success';
                  return <Tag color={col}>{st}</Tag>;
                },
              },
            ]}
            pagination={{ pageSize: 8 }}
          />
        </div>
      )}

      {/* /admin/insurance/contributions */}
      {activePage === 'contributions' && (
        <div className="transparent-table-card">
          <KTable
            dataSource={contributions}
            columns={[
              {
                title: 'Kỳ đối soát',
                dataIndex: 'period',
                key: 'period',
                width: 150,
                render: (p: string) => <strong style={{ color: '#009688', fontSize: 13.5 }}>{p}</strong>,
              },
              {
                title: 'Lao động',
                dataIndex: 'headcount',
                key: 'headcount',
                width: 110,
                render: (hc: number) => <span>{hc} người</span>,
              },
              {
                title: 'Tổng quỹ lương đóng',
                dataIndex: 'totalSalaryFund',
                key: 'totalSalaryFund',
                width: 180,
                render: (sal: number) => <span>{sal.toLocaleString('vi-VN')} ₫</span>,
              },
              {
                title: 'BHXH (25.5%)',
                dataIndex: 'socialInsAmt',
                key: 'socialInsAmt',
                render: (amt: number) => <span style={{ color: '#009688' }}>{amt.toLocaleString('vi-VN')} ₫</span>,
              },
              {
                title: 'BHYT (4.5%)',
                dataIndex: 'healthInsAmt',
                key: 'healthInsAmt',
                render: (amt: number) => <span style={{ color: '#2563EB' }}>{amt.toLocaleString('vi-VN')} ₫</span>,
              },
              {
                title: 'BHTN (2%)',
                dataIndex: 'unempInsAmt',
                key: 'unempInsAmt',
                render: (amt: number) => <span style={{ color: '#7C3AED' }}>{amt.toLocaleString('vi-VN')} ₫</span>,
              },
              {
                title: 'Tổng tiền phải nộp (32%)',
                dataIndex: 'totalPayable',
                key: 'totalPayable',
                width: 180,
                render: (tot: number) => (
                  <strong style={{ color: '#16A34A', fontSize: 13.5 }}>
                    {tot.toLocaleString('vi-VN')} ₫
                  </strong>
                ),
              },
              {
                title: 'Tình trạng C12',
                dataIndex: 'c12Status',
                key: 'c12Status',
                width: 140,
                render: (st: string) => <Tag color="success">{st}</Tag>,
              },
            ]}
            pagination={false}
          />
        </div>
      )}

      {/* /admin/insurance/card */}
      {activePage === 'card' && (
        <div className="transparent-table-card">
          <div style={{ padding: '2px 0 16px' }}>
            <h1 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}>Đổi số thẻ BHYT</h1>
            <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Tra cứu số sổ BHXH, mã thẻ BHYT và thông tin khám chữa bệnh ban đầu.</div>
          </div>
          <KTable
            dataSource={laborList}
            columns={[
              {
                title: 'Người lao động',
                key: 'employee',
                width: 220,
                render: (_: unknown, record: InsuranceLaborItem) => (
                  <div>
                    <strong style={{ color: '#0F172A' }}>{record.fullName}</strong>
                    <div style={{ marginTop: 2, color: '#64748B', fontSize: 12 }}>{record.empCode} · {record.dept}</div>
                  </div>
                ),
              },
              { title: 'Số sổ BHXH', dataIndex: 'socialInsNumber', key: 'socialInsNumber', width: 170, render: (value: string) => <strong style={{ color: '#2563EB' }}>{value}</strong> },
              { title: 'Mã thẻ BHYT', dataIndex: 'healthInsNumber', key: 'healthInsNumber', width: 210 },
              { title: 'Cơ sở KCB ban đầu', dataIndex: 'hospitalClinic', key: 'hospitalClinic' },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                key: 'status',
                width: 140,
                render: (value: string) => <Tag color={value === 'Đang tham gia' ? 'success' : 'processing'}>{value}</Tag>,
              },
              {
                title: 'Chi tiết',
                key: 'actions',
                width: 100,
                render: (_: unknown, record: InsuranceLaborItem) => (
                  <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedLabor(record); setDrawerOpen(true); }}>Xem</Button>
                ),
              },
            ]}
            pagination={{ pageSize: 8 }}
          />
        </div>
      )}

      {/* /admin/insurance/voluntary */}
      {activePage === 'voluntary' && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <h1 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}>BHXH tự nguyện</h1>
          <div style={{ marginTop: 4, marginBottom: 18, color: '#64748B', fontSize: 13 }}>Danh sách người tham gia BHXH tự nguyện được quản lý tách biệt với lao động bắt buộc.</div>
          <Alert
            type="info"
            showIcon
            message="Chưa có hồ sơ BHXH tự nguyện"
            description="Chưa nhận được bản ghi BHXH tự nguyện từ nguồn dữ liệu hiện tại. Khi có dữ liệu được đồng bộ, danh sách sẽ hiển thị tại đây."
          />
        </div>
      )}

      {/* /admin/insurance/expenses */}
      {activePage === 'expenses' && (
        <div className="transparent-table-card">
          <div style={{ padding: '2px 0 16px' }}>
            <h1 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}>Theo dõi chi BHXH</h1>
            <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Theo dõi tiến độ chi trả theo các hồ sơ chế độ đã lập.</div>
          </div>
          <KTable
            dataSource={regimes}
            columns={[
              { title: 'Mã hồ sơ', dataIndex: 'claimCode', key: 'claimCode', width: 150, render: (value: string) => <strong style={{ color: '#009688' }}>{value}</strong> },
              { title: 'Người hưởng', dataIndex: 'empName', key: 'empName', width: 190, render: (value: string) => <strong>{value}</strong> },
              { title: 'Chế độ', dataIndex: 'regimeType', key: 'regimeType', width: 200, render: (value: string) => <Tag color="blue">{value}</Tag> },
              { title: 'Số tiền chi trả', dataIndex: 'calculatedAmount', key: 'calculatedAmount', width: 180, render: (value: number) => <strong style={{ color: '#16A34A' }}>{value.toLocaleString('vi-VN')} ₫</strong> },
              { title: 'Ngày giải quyết', dataIndex: 'settlementDate', key: 'settlementDate', width: 150 },
              {
                title: 'Tình trạng',
                dataIndex: 'approvalStatus',
                key: 'approvalStatus',
                width: 150,
                render: (value: string) => <Tag color={value === 'Đã giải ngân' ? 'success' : 'processing'}>{value}</Tag>,
              },
            ]}
            pagination={{ pageSize: 8 }}
          />
        </div>
      )}

      {/* MODAL: Thêm Tăng Giảm (D02-LT) / Chế Độ (01B-HSB) */}
      <Modal
        title={modalType === 'adjust' ? 'Lập Hồ Sơ Tăng/Giảm Lao Động (Mẫu D02-LT)' : 'Lập Hồ Sơ Đề Nghị Hưởng Chế Độ BHXH'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={650}
      >
        <Form form={form} layout="vertical" onFinish={handleSaveModal} style={{ marginTop: 14 }}>
          {modalType === 'adjust' ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="d02Code" label="Mã hồ sơ D02" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="adjustType" label="Loại nghiệp vụ điều chỉnh" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { label: 'Báo tăng mới lao động', value: 'Báo tăng mới' },
                      { label: 'Báo giảm hẳn (Nghỉ việc)', value: 'Báo giảm hẳn' },
                      { label: 'Điều chỉnh tăng/giảm mức lương', value: 'Điều chỉnh tăng lương' },
                      { label: 'Nghỉ thai sản', value: 'Nghỉ thai sản' },
                      { label: 'Nghỉ ốm dài ngày', value: 'Nghỉ ốm dài ngày' },
                    ]}
                  />
                </Form.Item>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="empName" label="Họ và tên nhân viên" rules={[{ required: true }]}>
                  <Input placeholder="Ví dụ: Hoàng Văn Long" />
                </Form.Item>
                <Form.Item name="empCode" label="Mã nhân viên" rules={[{ required: true }]}>
                  <Input placeholder="Ví dụ: KY-056" />
                </Form.Item>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="oldSalary" label="Mức lương đóng cũ (VNĐ)">
                  <Input type="number" step={1000000} />
                </Form.Item>
                <Form.Item name="newSalary" label="Mức lương đóng mới (VNĐ)" rules={[{ required: true }]}>
                  <Input type="number" step={1000000} />
                </Form.Item>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="effectiveMonth" label="Tháng áp dụng" rules={[{ required: true }]}>
                  <Input placeholder="Ví dụ: Tháng 09/2026" />
                </Form.Item>
                <Form.Item name="filingDate" label="Ngày nộp hồ sơ">
                  <Input type="date" />
                </Form.Item>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="claimCode" label="Mã hồ sơ chế độ" rules={[{ required: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="regimeType" label="Loại chế độ hưởng" rules={[{ required: true }]}>
                  <Select
                    options={[
                      { label: 'Ốm đau ngắn ngày', value: 'Ốm đau ngắn ngày' },
                      { label: 'Thai sản (6 tháng)', value: 'Thai sản (6 tháng)' },
                      { label: 'Dưỡng sức sau sinh', value: 'Dưỡng sức sau sinh' },
                      { label: 'Khám thai định kỳ', value: 'Khám thai định kỳ' },
                    ]}
                  />
                </Form.Item>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="empName" label="Họ tên người hưởng" rules={[{ required: true }]}>
                  <Input placeholder="Ví dụ: Lê Thị Thu Thảo" />
                </Form.Item>
                <Form.Item name="leaveDays" label="Số ngày nghỉ hưởng trợ cấp" rules={[{ required: true }]}>
                  <Input type="number" min={1} />
                </Form.Item>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Form.Item name="calculatedAmount" label="Số tiền đề nghị BHXH chi trả (VNĐ)" rules={[{ required: true }]}>
                  <Input type="number" step={500000} />
                </Form.Item>
                <Form.Item name="bankAccount" label="Số tài khoản ngân hàng nhận tiền" rules={[{ required: true }]}>
                  <Input placeholder="Số TK - Tên Ngân hàng" />
                </Form.Item>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Nộp hồ sơ điện tử eBH
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Tra Cứu VssID & Sổ BHXH Cá Nhân */}
      <Drawer
        title="Trích Lục Thông Tin Sổ BHXH &amp; Thẻ BHYT Điện Tử (VssID)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
      >
        {selectedLabor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>{selectedLabor.fullName}</div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{selectedLabor.empCode} · {selectedLabor.position}</div>
                </div>
                <Tag color="success">{selectedLabor.status}</Tag>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <IdcardOutlined style={{ color: '#2563EB' }} /> Mã Số Định Danh Bảo Hiểm:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Số sổ BHXH (10 số):</span>
                  <div style={{ fontWeight: 700, color: '#2563EB' }}>{selectedLabor.socialInsNumber}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Mã thẻ BHYT (15 ký tự):</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedLabor.healthInsNumber}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Mức lương trích đóng:</span>
                  <div style={{ fontWeight: 700, color: '#16A34A' }}>
                    {selectedLabor.salaryBase.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Ngày tham gia tại công ty:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedLabor.startDate}</div>
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Cơ sở khám chữa bệnh ban đầu (KCB):</div>
              <div style={{ fontSize: 13, color: '#1E40AF', fontWeight: 600 }}>{selectedLabor.hospitalClinic}</div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất trích lục sổ BHXH của ${selectedLabor.fullName}`)}
                style={{ flex: 1 }}
              >
                In Tờ Rời BHXH
              </Button>
              <Button
                type="primary"
                icon={<CloudSyncOutlined />}
                onClick={() => message.success(`Đã cập nhật dữ liệu từ VssID cho ${selectedLabor.fullName}`)}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Tra cứu quá trình VssID
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
