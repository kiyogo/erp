import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  DownloadOutlined,
  EyeOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Select, Button, message, Card, Tag } from '../../custom-ui';
import { dataService, PayrollRecord } from '../../services/dataService';
import { collectionsApi, systemApi } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { filterPayrollForMonth, normalizePayrollMonth, payrollBankRows, payrollReportRows } from './payrollExports';

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

  const downloadPayslip = (record: PayrollRecord) => {
    const lines = [
      `Nhan vien: ${record.employeeName} - ${record.employeeCode}`,
      `Phong ban: ${record.department}`,
      `Ky luong: ${selectedMonth}`,
      `Luong co ban: ${record.baseSalary.toLocaleString('vi-VN')} VND`,
      `Ngay cong: ${record.workDays}`,
      `Phu cap: ${record.allowance.toLocaleString('vi-VN')} VND`,
      `Thuong: ${record.bonus.toLocaleString('vi-VN')} VND`,
      `Khau tru bao hiem: ${record.insuranceDeduction.toLocaleString('vi-VN')} VND`,
      `Khau tru thue TNCN: ${record.taxDeduction.toLocaleString('vi-VN')} VND`,
      `Thuc linh: ${record.netSalary.toLocaleString('vi-VN')} VND`,
    ];
    downloadFile(`phieu_luong_${record.employeeCode}_${selectedMonth.replace('/', '-')}.pdf`, generateValidPdfBlob('PHIEU LUONG', 'Bang tinh luong theo du lieu hien co', lines));
  };

  const emailPayslip = async (record: PayrollRecord) => {
    const employee = dataService.getEmployees().find((item) => item.code === record.employeeCode);
    if (!employee?.email?.trim()) {
      message.error(`Hồ sơ ${record.employeeName} chưa có địa chỉ email.`);
      return;
    }
    const content = [
      `Xin chào ${record.employeeName},`,
      `Thông tin lương kỳ ${selectedMonth}:`,
      `Lương cơ bản: ${record.baseSalary.toLocaleString('vi-VN')} ₫`,
      `Ngày công: ${record.workDays}`,
      `Phụ cấp: ${record.allowance.toLocaleString('vi-VN')} ₫`,
      `Thưởng: ${record.bonus.toLocaleString('vi-VN')} ₫`,
      `Khấu trừ bảo hiểm: ${record.insuranceDeduction.toLocaleString('vi-VN')} ₫`,
      `Khấu trừ thuế TNCN: ${record.taxDeduction.toLocaleString('vi-VN')} ₫`,
      `Thực lĩnh: ${record.netSalary.toLocaleString('vi-VN')} ₫`,
    ].join('\n');
    try {
      const response = await systemApi.sendEmail({
        to: employee.email,
        subject: `Thông tin lương kỳ ${selectedMonth}`,
        content,
        category: 'payroll_payslip',
      });
      message.success(`Đã gửi thông tin lương đến ${employee.email}.`);
      return response.data;
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không gửi được email. Kiểm tra cấu hình SMTP và quyền tài khoản.');
    }
  };

  useEffect(() => {
    loadData();
    return dataService.subscribe(loadData);
  }, []);

  const periodData = filterPayrollForMonth(data, selectedMonth);
  const totalPayroll = periodData.reduce((sum, item) => sum + item.netSalary, 0);
  const grossPayroll = periodData.reduce((sum, item) => sum + item.baseSalary + item.allowance + item.bonus, 0);
  const employerInsurance = periodData.reduce((sum, item) => sum + Math.round(item.baseSalary * 0.215), 0);
  const employeeInsurance = periodData.reduce((sum, item) => sum + item.insuranceDeduction, 0);
  const taxWithholding = periodData.reduce((sum, item) => sum + item.taxDeduction, 0);
  const paidPayroll = periodData.filter((item) => item.status === 'Đã chi trả').reduce((sum, item) => sum + item.netSalary, 0);
  const availableMonths = Array.from(new Set([...['08/2026', '07/2026', '06/2026'], ...data.map((item) => item.month).filter(Boolean)]))
    .map((month) => {
      const normalized = normalizePayrollMonth(month);
      return normalized ? { value: normalized, label: `Tháng ${normalized.slice(0, 2)} / ${normalized.slice(3)}` } : null;
    })
    .filter((option): option is { value: string; label: string } => Boolean(option))
    .filter((option, index, all) => all.findIndex((candidate) => candidate.value === option.value) === index)
    .sort((a, b) => b.value.localeCompare(a.value));

  const exportPayrollReport = (report: 'payroll' | 'attendance' | 'insurance' | 'tax', fileName: string, successText: string) => {
    downloadFile(fileName, generateValidXlsxBlob(payrollReportRows(periodData, report, selectedMonth)));
    message.success(successText);
  };

  const getEmployeeBankAccount = (employeeCode: string) => dataService.getEmployeeBankAccounts()
    .filter((account: any) => account?.employeeCode === employeeCode && (account?.status === 'Đã duyệt' || account?.status === 'verified') && account?.accountNumber)
    .sort((a: any, b: any) => Number(Boolean(b?.isPrimary)) - Number(Boolean(a?.isPrimary)))[0];

  const exportBankPaymentFile = async () => {
    try {
      const accounts = await dataService.refreshGenericData('employee_bank_accounts');
      const result = payrollBankRows(periodData, accounts, selectedMonth);
      if (result.rows.length === 2) {
        message.warning('Chưa có nhân viên nào vừa có lương chưa chi trả vừa có tài khoản ngân hàng đã duyệt.');
        return;
      }
      downloadFile(`lenh_chi_luong_${selectedMonth.replace('/', '-')}.xlsx`, generateValidXlsxBlob(result.rows));
      message.success(`Đã xuất ${result.rows.length - 2} lệnh chuyển khoản. Bỏ qua ${result.skipped} nhân viên chưa có tài khoản nhận lương đã duyệt.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được danh sách tài khoản nhận lương.');
    }
  };

  const postPayrollToLedger = () => {
    if (periodData.length === 0 || grossPayroll <= 0) {
      message.warning('Kỳ lương này chưa có dữ liệu để hạch toán.');
      return;
    }
    const inconsistent = periodData.find((record) => Math.abs(record.netSalary - (record.baseSalary + record.allowance + record.bonus - record.insuranceDeduction - record.taxDeduction)) > 1);
    if (inconsistent) {
      message.error(`Phiếu lương ${inconsistent.employeeCode} chưa cân đối giữa thu nhập, khấu trừ và thực lĩnh.`);
      return;
    }

    Modal.confirm({
      title: `Ghi sổ các bút toán lương kỳ ${selectedMonth}?`,
      content: 'Hệ thống sẽ tạo chứng từ trong Sổ Cái. Kiểm tra lại dữ liệu lương trước khi xác nhận.',
      okText: 'Ghi sổ',
      cancelText: 'Hủy',
      onOk: async () => {
        const sourceReference = `payroll:${selectedMonth}`;
        const createdKeys: string[] = [];
        try {
          const ledger = await dataService.refreshGenericData('finance_general_ledger');
          if (ledger.some((entry: any) => entry.sourceReference === sourceReference)) {
            message.warning(`Kỳ lương ${selectedMonth} đã có chứng từ trong Sổ Cái.`);
            return;
          }
          let author = 'Người dùng hiện tại';
          try {
            const currentUser = JSON.parse(localStorage.getItem('minepanel_user') || 'null');
            author = currentUser?.name || currentUser?.fullName || currentUser?.email || author;
          } catch { /* Use the generic signed-in label when cached identity data is malformed. */ }
          const journalLines = [
            { description: `Ghi nhận lương phải trả kỳ ${selectedMonth}`, debitAccount: 'TK 642', creditAccount: 'TK 334', amount: grossPayroll },
            { description: `Trích bảo hiểm phần doanh nghiệp kỳ ${selectedMonth}`, debitAccount: 'TK 642', creditAccount: 'TK 338', amount: employerInsurance },
            { description: `Khấu trừ bảo hiểm người lao động kỳ ${selectedMonth}`, debitAccount: 'TK 334', creditAccount: 'TK 338', amount: employeeInsurance },
            { description: `Khấu trừ thuế TNCN kỳ ${selectedMonth}`, debitAccount: 'TK 334', creditAccount: 'TK 3335', amount: taxWithholding },
            { description: `Ghi nhận lương đã chi kỳ ${selectedMonth}`, debitAccount: 'TK 334', creditAccount: 'TK 112', amount: paidPayroll },
          ].filter((line) => line.amount > 0);
          for (const [index, line] of journalLines.entries()) {
            const key = `payroll:${selectedMonth.replace('/', '-')}:${index + 1}`;
            await collectionsApi.create('finance_general_ledger', {
              key,
              voucherCode: `BL-${selectedMonth.replace('/', '')}-${index + 1}`,
              entryDate: new Date().toISOString().slice(0, 10),
              ...line,
              author,
              status: 'Đã ghi sổ cái',
              sourceModule: 'payroll',
              sourceReference,
            });
            createdKeys.push(key);
          }
          await dataService.refreshGenericData('finance_general_ledger');
          message.success(`Đã ghi ${createdKeys.length} bút toán lương kỳ ${selectedMonth} vào Sổ Cái.`);
        } catch (error: any) {
          const rollback = await Promise.allSettled(createdKeys.map((key) => collectionsApi.remove('finance_general_ledger', key)));
          const rollbackFailed = rollback.some((result) => result.status === 'rejected');
          if (!rollbackFailed && createdKeys.length > 0) await dataService.refreshGenericData('finance_general_ledger').catch(() => {});
          message.error(rollbackFailed
            ? 'Ghi sổ bị lỗi và chưa thể hoàn tác toàn bộ. Cần đối chiếu Sổ Cái trước khi chạy lại.'
            : error?.response?.data?.message || 'Không thể ghi bút toán lương vào Sổ Cái.');
        }
      },
    });
  };

  const handlePayOut = (record: PayrollRecord) => Modal.confirm({
    title: `Xác nhận đã chuyển lương cho ${record.employeeName}?`,
    content: `Hệ thống sẽ ghi nhận trạng thái đã chi ${record.netSalary.toLocaleString('vi-VN')} ₫. Chỉ xác nhận sau khi giao dịch ngân hàng hoàn tất.`,
    okText: 'Đã chuyển khoản',
    cancelText: 'Hủy',
    onOk: async () => {
      try {
        await dataService.updatePayrollStatus(record.key, 'Đã chi trả');
        loadData();
        message.success(`Đã ghi nhận trạng thái chi trả cho ${record.employeeName}.`);
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái chi lương.');
        throw error;
      }
    },
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Kỳ lương:</span>
        <Select value={selectedMonth} onChange={setSelectedMonth} options={availableMonths} style={{ width: 160 }} />
      </div>
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
            {periodData.length} nhân viên
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiến độ giải ngân lương</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {periodData.filter((d) => d.status === 'Đã chi trả').length}/{periodData.length} đã nhận lương
          </div>
        </div>
      </div>

      {/* VIEW: ATTENDANCE (Dữ liệu chấm công tính lương) */}
      {isAttendance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Tổng Hợp Dữ Liệu Chấm Công &amp; Ngày Công Thực Tế ({selectedMonth})</h3>
            <Button icon={<DownloadOutlined />} onClick={() => exportPayrollReport('attendance', `tong_hop_ngay_cong_${selectedMonth.replace('/', '-')}.xlsx`, 'Đã tải bảng ngày công thực tế từ hồ sơ lương.')}>
              Xuất Bảng Công
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={periodData}
              columns={[
                { title: 'Mã NV', dataIndex: 'employeeCode', key: 'employeeCode', render: (c: string) => <strong>{c}</strong> },
                { title: 'Họ và tên', dataIndex: 'employeeName', key: 'employeeName', render: (n: string, r: any) => <div><strong>{n}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>{r.department}</div></div> },
                { title: 'Công làm thực tế', dataIndex: 'workDays', key: 'workDays', render: (d: number) => <Tag color="success">{d} ngày</Tag> },
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
                {employerInsurance.toLocaleString('vi-VN')} ₫
              </div>
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4 }}>BHXH 17% + BHYT 3% + BHTN 1% + KPCĐ 0.5%</div>
            </div>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12.5, color: '#92400E', fontWeight: 600 }}>Người lao động trích nộp (10.5%)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
                {(periodData.reduce((s, i) => s + i.insuranceDeduction, 0)).toLocaleString('vi-VN')} ₫
              </div>
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4 }}>BHXH 8% + BHYT 1.5% + BHTN 1%</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Sách Trích Nộp Bảo Hiểm Bắt Buộc Tháng {selectedMonth}</h3>
            <Button icon={<DownloadOutlined />} onClick={() => exportPayrollReport('insurance', `du_lieu_bao_hiem_${selectedMonth.replace('/', '-')}.xlsx`, 'Đã tải bảng dữ liệu bảo hiểm theo hồ sơ lương.')}>
              Xuất dữ liệu bảo hiểm
            </Button>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={periodData}
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
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Bảng Khấu Trừ Thuế Thu Nhập Cá Nhân Tháng {selectedMonth}</h3>
            <Button icon={<DownloadOutlined />} onClick={() => exportPayrollReport('tax', `khau_tru_thue_TNCN_${selectedMonth.replace('/', '-')}.xlsx`, 'Đã tải bảng thu nhập và thuế TNCN từ hồ sơ lương.')}>
              Xuất Bảng Thuế
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={periodData}
              columns={[
                { title: 'Nhân viên', key: 'name', render: (_: any, r: PayrollRecord) => <div><strong>{r.employeeName}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>{r.employeeCode}</div></div> },
                { title: 'Thu nhập trước khấu trừ', key: 'gross', render: (_: any, r: PayrollRecord) => `${(r.baseSalary + r.allowance + r.bonus).toLocaleString('vi-VN')} ₫` },
                { title: 'Giảm trừ cá nhân', key: 'self', render: (_: any, r: PayrollRecord) => typeof (r as any).personalDeduction === 'number' ? `${(r as any).personalDeduction.toLocaleString('vi-VN')} ₫` : 'Chưa có dữ liệu' },
                { title: 'Giảm trừ bảo hiểm', dataIndex: 'insuranceDeduction', key: 'ins', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Thuế TNCN khấu trừ tạm tính', dataIndex: 'taxDeduction', key: 'tax', render: (v: number) => <strong style={{ color: '#DC2626' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Tình trạng dữ liệu thuế', key: 'st', render: (_: any, r: PayrollRecord) => <Tag color={typeof r.taxDeduction === 'number' ? 'success' : 'warning'}>{typeof r.taxDeduction === 'number' ? 'Đã có dữ liệu' : 'Chưa có dữ liệu'}</Tag> },
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
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Lập Lệnh Chi Trả Lương Tự Động Qua Ngân Hàng</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: '#64748B' }}>
                Xuất danh sách lệnh chuyển khoản cho nhân viên có tài khoản nhận lương đã duyệt
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={exportBankPaymentFile}>
                Tải file lệnh chi
              </Button>
            </div>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={periodData}
              columns={[
                { title: 'Mã NV', dataIndex: 'employeeCode', key: 'employeeCode', render: (c: string) => <strong>{c}</strong> },
                { title: 'Tên người thụ hưởng', dataIndex: 'employeeName', key: 'employeeName', render: (n: string) => <strong style={{ color: '#1E293B' }}>{n}</strong> },
                { title: 'Ngân hàng & Số tài khoản', key: 'bank', render: (_: any, r: PayrollRecord) => { const account = getEmployeeBankAccount(r.employeeCode); return account ? <div><strong>{account.bankName}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>{account.accountNumber}</div></div> : <Tag color="warning">Chưa có tài khoản đã duyệt</Tag>; } },
                { title: 'Số tiền chi trả', dataIndex: 'netSalary', key: 'netSalary', render: (v: number) => <strong style={{ color: '#16A34A', fontSize: 13.5 }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Nội dung chuyển khoản', key: 'msg', render: (_: any, r: PayrollRecord) => `Luong ${selectedMonth.replace('/', '-')} ${r.employeeName}` },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'Đã chi trả' ? 'success' : 'warning'}>{s}</Tag> },
                {
                  title: 'Thao tác',
                  key: 'act',
                  render: (_: any, r: PayrollRecord) => (
                    <Button size="small" type="primary" disabled={r.status === 'Đã chi trả' || r.status !== 'Chưa chi trả'} onClick={() => handlePayOut(r)} style={r.status === 'Chưa chi trả' ? { backgroundColor: '#009688', borderColor: '#009688' } : {}}>
                      {r.status === 'Đã chi trả' ? 'Đã chi' : r.status === 'Chưa chi trả' ? 'Xác nhận đã chi' : 'Chờ duyệt'}
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
                { desc: 'Ghi nhận tiền lương phải trả', debit: 'Nợ TK 642', credit: 'Có TK 334', amount: grossPayroll },
                { desc: 'Trích bảo hiểm phần doanh nghiệp', debit: 'Nợ TK 642', credit: 'Có TK 338', amount: employerInsurance },
                { desc: 'Khấu trừ bảo hiểm người lao động', debit: 'Nợ TK 334', credit: 'Có TK 338', amount: employeeInsurance },
                { desc: 'Khấu trừ thuế TNCN', debit: 'Nợ TK 334', credit: 'Có TK 3335', amount: taxWithholding },
                { desc: 'Ghi nhận lương đã chi', debit: 'Nợ TK 334', credit: 'Có TK 112', amount: paidPayroll },
              ].filter((line) => line.amount > 0).map((bt, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                  <div>
                    <strong style={{ fontSize: 13, color: '#0F172A' }}>{bt.desc}</strong>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{bt.debit} ➔ {bt.credit}</div>
                  </div>
                  <strong style={{ color: '#009688', fontSize: 13.5 }}>{bt.amount.toLocaleString('vi-VN')} ₫</strong>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button type="primary" icon={<AuditOutlined />} disabled={periodData.length === 0} onClick={postPayrollToLedger} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
              <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Bảng lương kỳ {selectedMonth}</span>
            </div>
            <Button icon={<DownloadOutlined />} onClick={() => exportPayrollReport('payroll', `bang_luong_${selectedMonth.replace('/', '-')}.xlsx`, 'Đã tải bảng lương của kỳ đã chọn.')}>
              Xuất Bảng Lương
            </Button>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={periodData}
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
                  title: 'Khấu trừ',
                  key: 'deductions',
                  render: (_: any, record: PayrollRecord) => (
                    <span style={{ color: '#DC2626' }}>
                      -{(record.insuranceDeduction + record.taxDeduction).toLocaleString('vi-VN')} ₫
                    </span>
                  ),
                },
                {
                  title: 'Thực lĩnh',
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
                <span>LƯƠNG THỰC LĨNH:</span>
                <span>{selectedRecord.netSalary.toLocaleString('vi-VN')} ₫</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
              <Button style={{ width: '100%' }} icon={<DownloadOutlined />} onClick={() => downloadPayslip(selectedRecord)}>
                Tải phiếu lương PDF
              </Button>
              <Button
                type="primary"
                style={{ width: '100%', backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={async () => { await emailPayslip(selectedRecord); }}
              >
                Gửi thông tin lương qua Email
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
