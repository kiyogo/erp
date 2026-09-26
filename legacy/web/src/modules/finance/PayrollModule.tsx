import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  DownloadOutlined,
  ReloadOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  BankOutlined,
  SendOutlined,
  AuditOutlined,
  CalendarOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Select, Button, message, Card, Tag } from '../../custom-ui';
import { dataService, PayrollRecord } from '../../services/dataService';

export const PayrollModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isAttendance = currentPath === '/finance/payroll/attendance';
  const isInsurance = currentPath === '/finance/payroll/insurance';
  const isTax = currentPath === '/finance/payroll/tax';
  const isDisburse = currentPath === '/finance/payroll/disburse';
  const isAccounting = currentPath === '/finance/payroll/accounting';

  const [data, setData] = useState<PayrollRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState('08/2026');
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadData = () => {
    setData(dataService.getPayroll());
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalPayroll = data.reduce((sum, item) => sum + item.netSalary, 0);

  const handlePayOut = (record: PayrollRecord) => {
    dataService.updatePayrollStatus(record.key, 'Đã chi trả');
    message.success(`Đã chi trả lương thành công cho ${record.employeeName}: ${record.netSalary.toLocaleString('vi-VN')} ₫`);
    loadData();
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quỹ lương thực lĩnh kỳ {selectedMonth}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalPayroll.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số nhân sự nhận lương</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {data.length} nhân viên
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiến độ giải ngân lương</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.filter((d) => d.status === 'Đã chi trả').length}/{data.length} đã nhận lương
          </div>
        </div>
      </div>

      {/* VIEW: ATTENDANCE (Dữ liệu chấm công tính lương) */}
      {isAttendance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Tổng Hợp Dữ Liệu Chấm Công &amp; Ngày Công Thực Tế ({selectedMonth})</h3>
            <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất bảng chấm công tổng hợp')}>
              Xuất Bảng Công (Excel)
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={data}
              columns={[
                { title: 'Mã NV', dataIndex: 'employeeCode', key: 'employeeCode', render: (c: string) => <strong>{c}</strong> },
                { title: 'Họ và tên', dataIndex: 'employeeName', key: 'employeeName', render: (n: string, r: any) => <div><strong>{n}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>{r.department}</div></div> },
                { title: 'Công chuẩn tháng', key: 'std', render: () => <span>22 ngày</span> },
                { title: 'Công làm thực tế', dataIndex: 'workDays', key: 'workDays', render: (d: number) => <Tag color="success">{d} ngày</Tag> },
                { title: 'Nghỉ phép hưởng lương', key: 'leave', render: () => <span>0 ngày</span> },
                { title: 'Giờ làm ngoài giờ (OT)', key: 'ot', render: () => <span>4.5 giờ</span> },
                { title: 'Trạng thái chốt công', key: 'st', render: () => <Tag color="blue">Đã khóa công</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: INSURANCE (Khấu trừ BHXH, BHYT, BHTN) */}
      {isInsurance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12.5, color: '#1E40AF', fontWeight: 600 }}>Doanh nghiệp đóng (21.5%)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
                {(data.reduce((s, i) => s + i.baseSalary, 0) * 0.215).toLocaleString('vi-VN')} ₫
              </div>
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4 }}>BHXH 17% + BHYT 3% + BHTN 1% + KPCĐ 0.5%</div>
            </div>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12.5, color: '#92400E', fontWeight: 600 }}>Người lao động trích nộp (10.5%)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
                {(data.reduce((s, i) => s + i.insuranceDeduction, 0)).toLocaleString('vi-VN')} ₫
              </div>
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4 }}>BHXH 8% + BHYT 1.5% + BHTN 1%</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Sách Trích Nộp Bảo Hiểm Bắt Buộc Tháng {selectedMonth}</h3>
            <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất biểu mẫu D02-LT cơ quan BHXH!')}>
              Xuất Mẫu D02-LT (BHXH)
            </Button>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={data}
              columns={[
                { title: 'Mã NV & Họ tên', key: 'name', render: (_: any, r: PayrollRecord) => <div><strong>{r.employeeName}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>{r.employeeCode} - {r.department}</div></div> },
                { title: 'Lương đóng BH', dataIndex: 'baseSalary', key: 'baseSalary', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'BHXH NLĐ (8%)', dataIndex: 'baseSalary', key: 'bhxh', render: (v: number) => `${Math.round(v * 0.08).toLocaleString('vi-VN')} ₫` },
                { title: 'BHYT NLĐ (1.5%)', dataIndex: 'baseSalary', key: 'bhyt', render: (v: number) => `${Math.round(v * 0.015).toLocaleString('vi-VN')} ₫` },
                { title: 'BHTN NLĐ (1%)', dataIndex: 'baseSalary', key: 'bhtn', render: (v: number) => `${Math.round(v * 0.01).toLocaleString('vi-VN')} ₫` },
                { title: 'Tổng trừ lương NLĐ (10.5%)', dataIndex: 'insuranceDeduction', key: 'tot', render: (v: number) => <strong style={{ color: '#DC2626' }}>-{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'DN đóng (21.5%)', dataIndex: 'baseSalary', key: 'comp', render: (v: number) => <span style={{ color: '#2563EB', fontWeight: 600 }}>{Math.round(v * 0.215).toLocaleString('vi-VN')} ₫</span> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: TAX (Khấu trừ thuế TNCN) */}
      {isTax && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Bảng Khấu Trừ Thuế Thu Nhập Cá Nhân (TNCN) Tháng {selectedMonth}</h3>
            <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất bảng khấu trừ thuế TNCN')}>
              Xuất Bảng Thuế (Excel)
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={data}
              columns={[
                { title: 'Nhân viên', key: 'name', render: (_: any, r: PayrollRecord) => <div><strong>{r.employeeName}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>{r.employeeCode}</div></div> },
                { title: 'Tổng thu nhập chịu thuế', key: 'gross', render: (_: any, r: PayrollRecord) => `${(r.baseSalary + r.allowance + r.bonus).toLocaleString('vi-VN')} ₫` },
                { title: 'Giảm trừ bản thân', key: 'self', render: () => '11.000.000 ₫' },
                { title: 'Giảm trừ bảo hiểm', dataIndex: 'insuranceDeduction', key: 'ins', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Thuế TNCN khấu trừ tạm tính', dataIndex: 'taxDeduction', key: 'tax', render: (v: number) => <strong style={{ color: '#DC2626' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Trạng thái', key: 'st', render: () => <Tag color="success">Đã khấu trừ</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DISBURSE (Lệnh chi trả lương & Chuyển khoản ngân hàng) */}
      {isDisburse && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Lập Lệnh Chi Trả Lương Tự Động Qua Ngân Hàng (E-Banking Batch Transfer)</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: '#64748B' }}>
                Tạo lô chuyển tiền tự động từ TK Vietcombank Doanh nghiệp sang tài khoản cán bộ nhân viên
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã tải file Excel mẫu chi lương Vietcombank!')}>
                File mẫu VCB Excel
              </Button>
              <Button type="primary" icon={<SendOutlined />} onClick={() => message.success('Đã duyệt và gửi lệnh chi lương đồng loạt sang cổng E-Banking!')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Duyệt chi lương đồng loạt
              </Button>
            </div>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={data}
              columns={[
                { title: 'Mã NV', dataIndex: 'employeeCode', key: 'employeeCode', render: (c: string) => <strong>{c}</strong> },
                { title: 'Tên người thụ hưởng', dataIndex: 'employeeName', key: 'employeeName', render: (n: string) => <strong style={{ color: '#1E293B' }}>{n}</strong> },
                { title: 'Ngân hàng & Số tài khoản', key: 'bank', render: (_: any, r: any, idx: number) => <div><strong>Vietcombank</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>0011 0042 88{idx + 10}</div></div> },
                { title: 'Số tiền chi trả (Net)', dataIndex: 'netSalary', key: 'netSalary', render: (v: number) => <strong style={{ color: '#16A34A', fontSize: 13.5 }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Nội dung chuyển khoản', key: 'msg', render: (_: any, r: PayrollRecord) => `KIYOVN Chi tra luong Thang 08-2026 cho ${r.employeeName}` },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'Đã chi trả' ? 'success' : 'warning'}>{s}</Tag> },
                {
                  title: 'Thao tác',
                  key: 'act',
                  render: (_: any, r: PayrollRecord) => (
                    <Button size="small" type="primary" disabled={r.status === 'Đã chi trả'} onClick={() => handlePayOut(r)} style={r.status !== 'Đã chi trả' ? { backgroundColor: '#009688', borderColor: '#009688' } : {}}>
                      {r.status === 'Đã chi trả' ? 'Đã chi' : 'Chi ngay'}
                    </Button>
                  ),
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: ACCOUNTING (Hạch toán chi phí lương) */}
      {isAccounting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 840 }}>
          <Card title={`Bút Toán Hạch Toán Kế Toán Lương Tháng ${selectedMonth}`} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {[
                { desc: '1. Tính tiền lương phải trả cho nhân viên khối công nghệ', debit: 'Nợ TK 6422 (Kỹ thuật)', credit: 'Có TK 3341', amount: '125.000.000 ₫' },
                { desc: '2. Tính tiền lương phải trả cho nhân viên khối văn phòng & QLDN', debit: 'Nợ TK 6421 (Bán hàng & QLDN)', credit: 'Có TK 3341', amount: '85.000.000 ₫' },
                { desc: '3. Trích các khoản bảo hiểm theo lương phần DN chịu (21.5%)', debit: 'Nợ TK 6421, 6422', credit: 'Có TK 3383, 3384, 3386', amount: '45.150.000 ₫' },
                { desc: '4. Khấu trừ bảo hiểm trừ vào lương người lao động (10.5%)', debit: 'Nợ TK 3341', credit: 'Có TK 3383, 3384, 3386', amount: '22.050.000 ₫' },
                { desc: '5. Khấu trừ thuế TNCN tạm tính trừ vào lương', debit: 'Nợ TK 3341', credit: 'Có TK 3335', amount: '12.450.000 ₫' },
                { desc: '6. Chi trả lương thực lĩnh qua tài khoản ngân hàng', debit: 'Nợ TK 3341', credit: 'Có TK 1121 (Vietcombank)', amount: `${totalPayroll.toLocaleString('vi-VN')} ₫` },
              ].map((bt, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                  <div>
                    <strong style={{ fontSize: 13, color: '#0F172A' }}>{bt.desc}</strong>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{bt.debit} ➔ {bt.credit}</div>
                  </div>
                  <strong style={{ color: '#009688', fontSize: 13.5 }}>{bt.amount}</strong>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="primary" icon={<AuditOutlined />} onClick={() => message.success('Đã hạch toán và ghi Sổ Cái toàn bộ chi phí lương!')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Hạch toán ghi Sổ Cái
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* VIEW: DEFAULT (Bảng tính lương tháng) */}
      {!isAttendance && !isInsurance && !isTax && !isDisburse && !isAccounting && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Kỳ tính lương:</span>
              <Select
                value={selectedMonth}
                onChange={setSelectedMonth}
                options={[
                  { label: 'Tháng 08 / 2026', value: '08/2026' },
                  { label: 'Tháng 07 / 2026', value: '07/2026' },
                  { label: 'Tháng 06 / 2026', value: '06/2026' },
                ]}
                style={{ width: 160 }}
              />
            </div>
            <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất bảng thanh toán tiền lương (Excel)')}>
              Xuất Bảng Lương (Excel)
            </Button>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={data}
              columns={[
                {
                  title: 'Mã NV',
                  dataIndex: 'employeeCode',
                  key: 'employeeCode',
                  render: (code: string) => <strong style={{ color: '#009688' }}>{code}</strong>,
                },
                {
                  title: 'Họ và tên nhân viên',
                  dataIndex: 'employeeName',
                  key: 'employeeName',
                  render: (name: string, record: PayrollRecord) => (
                    <div>
                      <div style={{ fontWeight: 600, color: '#1E293B' }}>{name}</div>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.department}</div>
                    </div>
                  ),
                },
                {
                  title: 'Lương cơ bản',
                  dataIndex: 'baseSalary',
                  key: 'baseSalary',
                  render: (val: number) => `${val.toLocaleString('vi-VN')} ₫`,
                },
                {
                  title: 'Ngày công',
                  dataIndex: 'workDays',
                  key: 'workDays',
                  render: (days: number) => <span>{days} công</span>,
                },
                {
                  title: 'Phụ cấp & Thưởng',
                  key: 'bonus',
                  render: (_: any, record: PayrollRecord) => (
                    <span style={{ color: '#16A34A', fontWeight: 600 }}>
                      +{(record.allowance + record.bonus).toLocaleString('vi-VN')} ₫
                    </span>
                  ),
                },
                {
                  title: 'Khấu trừ (BH+Thuế)',
                  key: 'deductions',
                  render: (_: any, record: PayrollRecord) => (
                    <span style={{ color: '#DC2626' }}>
                      -{(record.insuranceDeduction + record.taxDeduction).toLocaleString('vi-VN')} ₫
                    </span>
                  ),
                },
                {
                  title: 'Thực lĩnh (Net)',
                  dataIndex: 'netSalary',
                  key: 'netSalary',
                  render: (val: number) => (
                    <strong style={{ fontSize: 13.5, color: '#0F172A' }}>
                      {val.toLocaleString('vi-VN')} ₫
                    </strong>
                  ),
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => (
                    <Tag color={status === 'Đã chi trả' ? 'success' : 'warning'}>
                      {status}
                    </Tag>
                  ),
                },
                {
                  title: 'Thao tác',
                  key: 'action',
                  render: (_: any, record: PayrollRecord) => (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button
                        size="small"
                        icon={<EyeOutlined />}
                        onClick={() => {
                          setSelectedRecord(record);
                          setDrawerOpen(true);
                        }}
                      >
                        Phiếu
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        disabled={record.status === 'Đã chi trả'}
                        onClick={() => handlePayOut(record)}
                        style={record.status !== 'Đã chi trả' ? { backgroundColor: '#009688', borderColor: '#009688' } : {}}
                      >
                        Chi lương
                      </Button>
                    </div>
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Drawer Payslip */}
      <Drawer
        title="Phiếu lương chi tiết cán bộ nhân viên"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={420}
      >
        {selectedRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{selectedRecord.employeeName}</div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>{selectedRecord.employeeCode} - {selectedRecord.department}</div>
              <Tag color="success" style={{ marginTop: 6 }}>Kỳ lương: {selectedMonth}</Tag>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Lương cơ bản hợp đồng:</span>
                <strong>{selectedRecord.baseSalary.toLocaleString('vi-VN')} ₫</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Ngày công làm việc:</span>
                <strong>{selectedRecord.workDays} / 22 ngày</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16A34A' }}>
                <span>Phụ cấp chức vụ &amp; ăn trưa:</span>
                <strong>+{selectedRecord.allowance.toLocaleString('vi-VN')} ₫</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16A34A' }}>
                <span>Thưởng hiệu suất KPI:</span>
                <strong>+{selectedRecord.bonus.toLocaleString('vi-VN')} ₫</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#DC2626' }}>
                <span>Khấu trừ BHXH (10.5%):</span>
                <strong>-{selectedRecord.insuranceDeduction.toLocaleString('vi-VN')} ₫</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#DC2626' }}>
                <span>Khấu trừ Thuế TNCN:</span>
                <strong>-{selectedRecord.taxDeduction.toLocaleString('vi-VN')} ₫</strong>
              </div>
              <div style={{ height: 1, background: '#E2E8F0', margin: '8px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: '#009688' }}>
                <span>LƯƠNG THỰC LĨNH (NET):</span>
                <span>{selectedRecord.netSalary.toLocaleString('vi-VN')} ₫</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <Button style={{ width: '100%' }} icon={<DownloadOutlined />} onClick={() => message.success('Đã tải phiếu lương PDF')}>
                Tải phiếu lương PDF
              </Button>
              <Button
                type="primary"
                style={{ width: '100%', backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => {
                  message.success(`Đã gửi phiếu lương điện tử đến email của ${selectedRecord.employeeName}`);
                  setDrawerOpen(false);
                }}
              >
                Gửi phiếu lương qua Email
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
