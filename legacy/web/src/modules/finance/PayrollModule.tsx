import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  DownloadOutlined,
  EyeOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Select, Button, Input, message, Card, Tag } from '../../custom-ui';
import { dataService, PayrollRecord } from '../../services/dataService';
import { payrollLedgerApi, systemApi } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { filterPayrollForMonth, normalizePayrollMonth, payrollBankRows, payrollReportRows } from './payrollExports';

export const PayrollModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isAttendance = currentPath === '/finance/payroll/attendance';
  const isInsurance = currentPath === '/finance/payroll/insurance';
  const isDisburse = currentPath === '/finance/payroll/disburse';
  const isAccounting = currentPath === '/finance/payroll/accounting';

  const [data, setData] = useState<PayrollRecord[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').reverse().join('/'));
  const [employerCharge, setEmployerCharge] = useState('');
  const [postingLedger, setPostingLedger] = useState(false);
  const [postedPeriods, setPostedPeriods] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PayrollRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sheetDialog, setSheetDialog] = useState(false);
  const [sheetType, setSheetType] = useState('Lương cố định (không dựa trên bảng chấm công)');
  const [sheetName, setSheetName] = useState('');
  const [sheetBase, setSheetBase] = useState(false);
  const [sheetStartDate, setSheetStartDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
  const [sheetEndDate, setSheetEndDate] = useState('');
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'Tiền mặt' | 'Tiền gửi'>('Tiền mặt');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentRows, setPaymentRows] = useState<PayrollRecord[]>([]);
  const [insuranceLoaded, setInsuranceLoaded] = useState(false);
  const [accountingSheetKey, setAccountingSheetKey] = useState('');

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

  useEffect(() => {
    if (!isAccounting) return;
    let active = true;
    payrollLedgerApi.postedPeriods().then(({ data: response }) => { if (active) setPostedPeriods(response.periods); })
      .catch(() => { if (active) message.error('Không tải được các kỳ lương đã ghi sổ.'); });
    return () => { active = false; };
  }, [isAccounting]);

  const periodData = filterPayrollForMonth(data, selectedMonth);
  const orgUnits = dataService.getOrgUnits();
  const payrollSheets = dataService.getGenericData('finance_payroll_sheets');
  const totalPayroll = periodData.reduce((sum, item) => sum + item.netSalary, 0);
  const grossPayroll = periodData.reduce((sum, item) => sum + item.baseSalary + item.allowance + item.bonus, 0);
  const employerInsurance = periodData.reduce((sum, item) => sum + Math.round(item.baseSalary * 0.215), 0);
  const employeeInsurance = periodData.reduce((sum, item) => sum + item.insuranceDeduction, 0);
  const paidPayroll = periodData.filter((item) => item.status === 'Đã chi trả').reduce((sum, item) => sum + item.netSalary, 0);
  const availableMonths = Array.from(new Set([selectedMonth, ...postedPeriods, ...data.map((item) => normalizePayrollMonth(item.month)).filter((month): month is string => Boolean(month))]))
    .filter((month) => normalizePayrollMonth(month))
    .sort((a, b) => `${b.slice(3)}-${b.slice(0, 2)}`.localeCompare(`${a.slice(3)}-${a.slice(0, 2)}`))
    .map((value) => ({ value, label: `Tháng ${value.slice(0, 2)} / ${value.slice(3)}` }));
  if (data.some((item) => !normalizePayrollMonth(item.month))) availableMonths.push({ value: 'Chưa xác định kỳ', label: 'Chưa xác định kỳ' });

  const exportPayrollReport = (report: 'payroll' | 'attendance' | 'insurance', fileName: string, successText: string) => {
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

  const postPayrollToLedger = async () => {
    if (!normalizePayrollMonth(selectedMonth)) { message.error('Chọn kỳ lương hợp lệ để ghi sổ.'); return; }
    if (employerCharge.trim() === '' || !Number.isSafeInteger(Number(employerCharge)) || Number(employerCharge) < 0) {
      message.error('Nhập số tiền bảo hiểm doanh nghiệp đã đối chiếu.'); return;
    }
    const request = { period: selectedMonth, employerInsurance: Number(employerCharge) };
    setPostingLedger(true);
    try {
      const preview = (await payrollLedgerApi.preview(request)).data;
      Modal.confirm({
        title: `Ghi sổ các bút toán lương kỳ ${preview.period}?`,
        content: <div><div>{preview.employeeCount} phiếu lương</div>{preview.lines.map((line) => <div key={line.description}>{line.description}: {line.amount.toLocaleString('vi-VN')} ₫</div>)}</div>,
        okText: 'Ghi sổ', cancelText: 'Hủy',
        onOk: async () => {
          try {
            const saved = await payrollLedgerApi.post({ ...request, fingerprint: preview.fingerprint });
            await dataService.refreshGenericData('finance_general_ledger').catch(() => {});
            setPostedPeriods((periods) => Array.from(new Set([...periods, preview.period])));
            message.success(`Đã ghi ${saved.data.lines.length} bút toán lương kỳ ${preview.period} vào Sổ Cái.`);
          } catch (error: any) {
            message.error(error?.response?.data?.message || 'Không thể ghi bút toán lương vào Sổ Cái.');
            throw error;
          }
        },
      });
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể xem trước bút toán lương.'); }
    finally { setPostingLedger(false); }
  };

  const adjustPayrollLedger = async () => {
    if (!normalizePayrollMonth(selectedMonth)) { message.error('Chọn kỳ lương hợp lệ để điều chỉnh.'); return; }
    if (employerCharge.trim() === '' || !Number.isSafeInteger(Number(employerCharge)) || Number(employerCharge) < 0) {
      message.error('Nhập số tiền bảo hiểm doanh nghiệp đã đối chiếu.'); return;
    }
    const request = { period: selectedMonth, employerInsurance: Number(employerCharge) };
    setPostingLedger(true);
    try {
      const preview = (await payrollLedgerApi.previewAdjustment(request)).data;
      Modal.confirm({
        title: `Ghi điều chỉnh lương kỳ ${preview.period}?`,
        content: <div><div>{preview.employeeCount} phiếu lương hiện tại</div>{preview.lines.map((line) => <div key={line.description}>{line.description}: Nợ {line.debitAccount}, Có {line.creditAccount}, {line.amount.toLocaleString('vi-VN')} ₫</div>)}</div>,
        okText: 'Ghi điều chỉnh', cancelText: 'Hủy',
        onOk: async () => {
          try {
            const saved = await payrollLedgerApi.postAdjustment({ ...request, fingerprint: preview.fingerprint });
            await dataService.refreshGenericData('finance_general_ledger').catch(() => {});
            message.success(`Đã ghi ${saved.data.lines.length} bút toán điều chỉnh kỳ ${preview.period}.`);
          } catch (error: any) {
            message.error(error?.response?.data?.message || 'Không thể ghi điều chỉnh lương.');
            throw error;
          }
        },
      });
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể xem trước điều chỉnh lương.'); }
    finally { setPostingLedger(false); }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        {!isAttendance && !isInsurance && !isDisburse && !isAccounting && <Button onClick={() => setSheetDialog(true)}>Thêm bảng lương</Button>}
        <span style={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Kỳ lương:</span>
        <Select value={selectedMonth} onChange={(month) => { setSelectedMonth(month); setEmployerCharge(''); }} options={availableMonths} style={{ width: 160 }} />
      </div>
      <Modal title="Thêm bảng lương" open={sheetDialog} onCancel={() => setSheetDialog(false)} onOk={() => {
        if (!sheetName.trim() || selectedUnits.length === 0) { message.error('Nhập tên bảng lương và chọn ít nhất một đơn vị.'); return; }
        const rows = dataService.getGenericData('finance_payroll_sheets');
        if (!sheetStartDate || !sheetEndDate || sheetEndDate < sheetStartDate) { message.error('Chọn khoảng ngày hợp lệ cho bảng lương.'); return; }
        dataService.saveGenericData('finance_payroll_sheets', [{ key: String(Date.now()), name: sheetName.trim(), type: sheetType, month: selectedMonth.slice(0, 2), year: selectedMonth.slice(3), startDate: sheetStartDate, endDate: sheetEndDate, unitKeys: selectedUnits, basedOnOther: sheetBase, status: 'Nháp' }, ...rows]);
        setSheetDialog(false); setSheetName(''); message.success('Đã tạo bảng lương.');
      }} okText="Lưu" width={760}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>Loại bảng lương<Select value={sheetType} onChange={setSheetType} options={['Lương cố định (không dựa trên bảng chấm công)', 'Lương thời gian theo buổi', 'Lương thời gian theo giờ', 'Lương tạm ứng'].map((value) => ({ value, label: value }))} /></label>
          <label>Tháng<Input type="number" min={1} max={12} value={selectedMonth.slice(0, 2)} onChange={(e: any) => setSelectedMonth(`${String(e.target.value).padStart(2, '0')}/${selectedMonth.slice(3)}`)} /></label>
          <label>Năm<Input type="number" value={selectedMonth.slice(3)} onChange={(e: any) => setSelectedMonth(`${selectedMonth.slice(0, 2)}/${e.target.value}`)} /></label>
          <label>Từ ngày<Input type="date" value={sheetStartDate} onChange={(e: any) => setSheetStartDate(e.target.value)} /></label>
          <label>Đến ngày<Input type="date" value={sheetEndDate} onChange={(e: any) => setSheetEndDate(e.target.value)} /></label>
          <label style={{ gridColumn: '1 / -1' }}>Tên bảng lương<Input value={sheetName} onChange={(e: any) => setSheetName(e.target.value)} /></label>
          <label style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={sheetBase} onChange={(e) => setSheetBase(e.target.checked)} /> Tạo bảng lương dựa trên bảng lương khác</label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0 6px' }}><span>Đơn vị áp dụng</span><Button size="small" onClick={() => setSelectedUnits(orgUnits.map((unit) => unit.key))}>Chọn tất cả</Button></div>
        <div style={{ maxHeight: 210, overflow: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th></th><th>Mã đơn vị</th><th>Tên đơn vị</th><th>Cấp tổ chức</th></tr></thead><tbody>{orgUnits.map((unit) => <tr key={unit.key}><td><input type="checkbox" checked={selectedUnits.includes(unit.key)} onChange={(e) => setSelectedUnits((values) => e.target.checked ? [...values, unit.key] : values.filter((value) => value !== unit.key))} /></td><td>{unit.code}</td><td>{unit.name}</td><td>{unit.manager ? 'Phòng ban' : 'Tổng công ty/Công ty'}</td></tr>)}</tbody></table><div>Tổng số: {orgUnits.length} bản ghi</div></div>
      </Modal>
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
          <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
            <label>Phương thức thanh toán<Select value={paymentMethod} onChange={setPaymentMethod} options={['Tiền mặt', 'Tiền gửi'].map((value) => ({ value, label: value }))} /></label>
            <label>Ngày nộp bảo hiểm<Input type="date" value={paymentDate} onChange={(e: any) => setPaymentDate(e.target.value)} /></label>
            <Button type="primary" onClick={() => setInsuranceLoaded(true)}>Lấy dữ liệu</Button>
          </div>
          {insuranceLoaded && <div className="transparent-table-card"><KTable dataSource={[
            { key: 'bhxh', item: 'BHXH', due: periodData.reduce((sum, item) => sum + Math.round(item.baseSalary * 0.17), 0) },
            { key: 'bhyt', item: 'BHYT', due: periodData.reduce((sum, item) => sum + Math.round(item.baseSalary * 0.03), 0) },
            { key: 'bhtn', item: 'BHTN', due: periodData.reduce((sum, item) => sum + Math.round(item.baseSalary * 0.01), 0) },
          ]} columns={[{ title: 'Khoản phải nộp', dataIndex: 'item', key: 'item' }, { title: 'Số phải nộp', dataIndex: 'due', key: 'due', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` }, { title: 'Số nộp lần này', key: 'pay', render: (_: any, row: any) => <Input type="number" min={0} defaultValue={row.due} /> }]} /></div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12.5, color: '#1E40AF', fontWeight: 600 }}>Ước tính doanh nghiệp đóng</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
                {employerInsurance.toLocaleString('vi-VN')} ₫
              </div>
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 4 }}>Ước tính 21,5% lương cơ bản, cần đối chiếu</div>
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

      {/* VIEW: DISBURSE (Lệnh chi trả lương & Chuyển khoản ngân hàng) */}
      {isDisburse && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
            <label>Phương thức thanh toán<Select value={paymentMethod} onChange={setPaymentMethod} options={['Tiền mặt', 'Tiền gửi'].map((value) => ({ value, label: value }))} /></label>
            <label>Ngày trả lương<Input type="date" value={paymentDate} onChange={(e: any) => setPaymentDate(e.target.value)} /></label>
            <Button type="primary" onClick={() => setPaymentRows(periodData.filter((row) => row.status !== 'Đã chi trả'))}>Lấy dữ liệu</Button>
          </div>
          <div>Thông tin trả lương</div>
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
              dataSource={paymentRows}
              columns={[
                { title: 'Mã NV', dataIndex: 'employeeCode', key: 'employeeCode', render: (c: string) => <strong>{c}</strong> },
                { title: 'Số còn phải trả', dataIndex: 'netSalary', key: 'remaining', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Số trả', key: 'payAmount', render: (_: any, record: PayrollRecord) => <Input type="number" min={0} max={record.netSalary} defaultValue={record.netSalary} /> },
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
          <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}><label style={{ flex: 1 }}>Chọn bảng lương<Select value={accountingSheetKey} onChange={setAccountingSheetKey} options={payrollSheets.map((sheet: any) => ({ value: sheet.key, label: sheet.name }))} placeholder="Bảng lương" /></label><Button onClick={() => { const sheet = payrollSheets.find((item: any) => item.key === accountingSheetKey); if (!sheet) { message.error('Chọn bảng lương trước.'); return; } setSelectedMonth(`${sheet.month}/${sheet.year}`); }}>Đồng ý</Button></div>
          <Card title={`Bút Toán Hạch Toán Kế Toán Lương Tháng ${selectedMonth}`} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {[
                { desc: 'Ghi nhận tiền lương phải trả', debit: 'Nợ TK 642', credit: 'Có TK 334', amount: grossPayroll },
                { desc: 'Trích bảo hiểm phần doanh nghiệp', debit: 'Nợ TK 642', credit: 'Có TK 338', amount: Number(employerCharge) || 0 },
                { desc: 'Khấu trừ bảo hiểm người lao động', debit: 'Nợ TK 334', credit: 'Có TK 338', amount: employeeInsurance },
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
            <label style={{ display: 'block', marginBottom: 14 }}>Bảo hiểm doanh nghiệp đã đối chiếu
              <Input type="number" min={0} value={employerCharge} onChange={(event) => setEmployerCharge(event.target.value)} placeholder="Nhập số tiền" />
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button icon={<AuditOutlined />} loading={postingLedger} disabled={!normalizePayrollMonth(selectedMonth)} onClick={adjustPayrollLedger}>Điều chỉnh bút toán</Button>
              <Button type="primary" icon={<AuditOutlined />} loading={postingLedger} disabled={periodData.length === 0 || !normalizePayrollMonth(selectedMonth)} onClick={postPayrollToLedger} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Hạch toán ghi Sổ Cái
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* VIEW: DEFAULT (Bảng tính lương tháng) */}
      {!isAttendance && !isInsurance && !isDisburse && !isAccounting && (
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
                      -{record.insuranceDeduction.toLocaleString('vi-VN')} ₫
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
