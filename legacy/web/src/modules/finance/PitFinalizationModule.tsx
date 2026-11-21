import React, { useEffect, useState } from 'react';
import { DownloadOutlined, FileDoneOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Alert, Button, Checkbox, Input, Modal, Select, Tag, message } from '../../custom-ui';
import { pitFinalizationApi, type PitFinalizationRow } from '../../api/endpoints';
import { exportRowsToXlsx } from '../../utils/fileExporter';

const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;
const currentYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date()));
export const PIT_YEAR_OPTIONS = Array.from({ length: Math.max(1, currentYear - 2024 + 1) }, (_, index) => currentYear - index).map((year) => ({ label: `Năm ${year}`, value: year }));

/** Hộp thoại ủy quyền quyết toán (mẫu 08/UQ-QTT-TNCN): nhân viên tự ủy quyền hoặc quản trị viên ghi nhận giấy ủy quyền đã nhận. */
export const PitAuthorizationModal: React.FC<{ row: PitFinalizationRow | null; employeeId?: string; onClose: () => void; onSaved: (row: PitFinalizationRow) => void }> = ({ row, employeeId, onClose, onSaved }) => {
  const [confirmed, setConfirmed] = useState(false);
  const [otherIncome, setOtherIncome] = useState('0');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setConfirmed(false); setOtherIncome(String(row?.authorization?.otherIncomeMonthlyAverage || 0)); }, [row]);
  if (!row) return null;
  const save = async (authorized: boolean) => {
    setSaving(true);
    try {
      const { data } = await pitFinalizationApi.authorize({ year: row.year, employeeId, authorized, onlyIncomeConfirmed: confirmed, otherIncomeMonthlyAverage: Number(otherIncome) || 0 });
      message.success(authorized ? `Đã ghi nhận ủy quyền quyết toán thuế TNCN năm ${row.year}.` : 'Đã hủy ủy quyền quyết toán.');
      onSaved(data.finalization);
      onClose();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không ghi nhận được ủy quyền.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal title={`Ủy quyền quyết toán thuế TNCN năm ${row.year}`} open onCancel={onClose} footer={null} width={560}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, fontSize: 13 }}>
        <Alert type="info" showIcon message={`${row.employeeName}: doanh nghiệp quyết toán thay và nộp hồ sơ chậm nhất ${row.deadline}.`}
          description="Điều kiện: hợp đồng lao động từ 3 tháng trở lên, đang làm việc tại thời điểm quyết toán; thu nhập vãng lai nơi khác (nếu có) bình quân không quá 10 triệu đồng một tháng đã khấu trừ 10% và không quyết toán phần này." />
        {row.authorizationProblems.length > 0 && <Alert type="warning" showIcon message="Chưa đủ điều kiện ủy quyền" description={row.authorizationProblems.join(' ')} />}
        <div>
          <div style={{ color: '#475569', marginBottom: 4 }}>Thu nhập vãng lai nơi khác bình quân tháng (VNĐ)</div>
          <Input type="number" min={0} step={1} value={otherIncome} onChange={(event) => setOtherIncome(event.target.value)} />
        </div>
        <Checkbox checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)}>
          Người lao động xác nhận trong năm chỉ có thu nhập tiền lương, tiền công tại doanh nghiệp, hoặc thu nhập vãng lai nơi khác như đã khai ở trên.
        </Checkbox>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {row.authorization?.authorized && <Button danger disabled={saving} onClick={() => void save(false)}>Hủy ủy quyền</Button>}
          <Button onClick={onClose}>Đóng</Button>
          <Button type="primary" disabled={saving || !confirmed || row.authorizationProblems.length > 0} onClick={() => void save(true)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Ủy quyền quyết toán</Button>
        </div>
      </div>
    </Modal>
  );
};

/** Bảng quyết toán thuế TNCN năm của doanh nghiệp: tổng hợp phiếu lương đã chốt, số thuế phải nộp cả năm, số đã khấu trừ, chênh lệch. */
export const PitFinalizationModule: React.FC = () => {
  const [year, setYear] = useState(currentYear - 1);
  const [rows, setRows] = useState<PitFinalizationRow[]>([]);
  const [summary, setSummary] = useState<{ employees: number; authorized: number; annualTax: number; withheld: number; payable: number; refundable: number } | null>(null);
  const [deadline, setDeadline] = useState('');
  const [editing, setEditing] = useState<PitFinalizationRow | null>(null);

  const load = async () => {
    try {
      const { data } = await pitFinalizationApi.company(year);
      setRows(data.data);
      setSummary(data.summary);
      setDeadline(data.deadline);
    } catch (error: any) {
      setRows([]);
      message.error(error?.response?.data?.message || 'Không tải được bảng quyết toán thuế TNCN.');
    }
  };
  useEffect(() => { void load(); }, [year]);

  const columns = [
    { title: 'Nhân viên', key: 'employee', render: (_: unknown, row: PitFinalizationRow) => <div><div style={{ color: '#0F172A' }}>{row.employeeName}</div><div style={{ fontSize: 12, color: '#64748B' }}>{row.employeeCode} · {row.months} tháng lương</div></div> },
    { title: 'Tổng thu nhập', dataIndex: 'totalIncome', key: 'totalIncome', render: money },
    { title: 'Giảm trừ', key: 'deduction', render: (_: unknown, row: PitFinalizationRow) => <div>{money(row.personalDeduction + row.dependentDeduction + row.insurance)}<div style={{ fontSize: 12, color: '#64748B' }}>{row.dependentMonths} tháng người phụ thuộc</div></div> },
    { title: 'Thu nhập tính thuế', dataIndex: 'taxableIncome', key: 'taxableIncome', render: money },
    { title: 'Thuế cả năm', dataIndex: 'annualTax', key: 'annualTax', render: money },
    { title: 'Đã khấu trừ', dataIndex: 'withheld', key: 'withheld', render: money },
    { title: 'Chênh lệch', key: 'difference', render: (_: unknown, row: PitFinalizationRow) => <Tag color={row.difference > 0 ? 'error' : row.difference < 0 ? 'success' : 'default'}>{row.result} {money(Math.abs(row.difference))}</Tag> },
    { title: 'Ủy quyền', key: 'authorization', render: (_: unknown, row: PitFinalizationRow) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Tag color={row.authorization?.authorized ? 'success' : row.authorizationProblems.length ? 'warning' : 'default'}>{row.authorization?.authorized ? (row.authorization.selfAuthorized ? 'Nhân viên đã ủy quyền' : 'Đã nhận giấy ủy quyền') : row.authorizationProblems.length ? 'Tự quyết toán' : 'Chưa ủy quyền'}</Tag>
        <Button onClick={() => setEditing(row)}>Ghi nhận</Button>
      </div>
    ) },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        {[
          ['Người có thu nhập trong năm', `${summary?.employees || 0} người`, `${summary?.authorized || 0} người ủy quyền quyết toán`],
          ['Thuế cả năm (người ủy quyền)', money(summary?.annualTax || 0), `Đã khấu trừ ${money(summary?.withheld || 0)}`],
          ['Phải nộp thêm', money(summary?.payable || 0), 'Nộp cùng hồ sơ 05/QTT-TNCN'],
          ['Nộp thừa', money(summary?.refundable || 0), 'Hoàn hoặc bù trừ kỳ sau'],
        ].map(([label, value, note]) => (
          <div key={label} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 12.5, color: '#64748B' }}>{label}</div>
            <div style={{ fontSize: 22, color: '#0F766E', marginTop: 4 }}>{value}</div>
            <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{note}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <Alert type="info" showIcon message={`Hạn nộp hồ sơ quyết toán thay năm ${year}: ${deadline || '—'}. Chỉ tính phiếu lương đã chốt (chưa chi trả hoặc đã chi trả); giảm trừ bản thân đủ 12 tháng, người phụ thuộc theo số tháng đăng ký.`} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Select value={year} options={PIT_YEAR_OPTIONS} onChange={(value) => setYear(Number(value))} style={{ width: 140 }} />
          <Button icon={<DownloadOutlined />} disabled={!rows.length} onClick={() => {
            const count = exportRowsToXlsx(`Quyet_toan_TNCN_${year}`, [
              { title: 'Mã nhân viên', dataIndex: 'employeeCode' }, { title: 'Họ tên', dataIndex: 'employeeName' }, { title: 'Số tháng lương', dataIndex: 'months' },
              { title: 'Tổng thu nhập chịu thuế', dataIndex: 'totalIncome' }, { title: 'Thu nhập miễn thuế', dataIndex: 'exemptIncome' }, { title: 'Bảo hiểm bắt buộc', dataIndex: 'insurance' },
              { title: 'Giảm trừ bản thân', dataIndex: 'personalDeduction' }, { title: 'Số tháng người phụ thuộc', dataIndex: 'dependentMonths' }, { title: 'Giảm trừ người phụ thuộc', dataIndex: 'dependentDeduction' },
              { title: 'Thu nhập tính thuế', dataIndex: 'taxableIncome' }, { title: 'Thuế phải nộp cả năm', dataIndex: 'annualTax' }, { title: 'Đã khấu trừ', dataIndex: 'withheld' },
              { title: 'Chênh lệch', dataIndex: 'difference' }, { title: 'Ủy quyền', dataIndex: 'authorized' },
            ], rows.map((row) => ({ ...row, authorized: row.authorization?.authorized ? 'Có' : 'Không' })));
            message.success(`Đã xuất ${count} dòng quyết toán.`);
          }}>Xuất bảng kê</Button>
        </div>
      </div>
      <div className="transparent-table-card">
        <KTable dataSource={rows} columns={columns} rowKey="employeeId" pagination={{ pageSize: 10 }} />
      </div>
      <PitAuthorizationModal row={editing} employeeId={editing?.employeeId} onClose={() => setEditing(null)} onSaved={() => void load()} />
      <div style={{ fontSize: 12, color: '#64748B', marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        <FileDoneOutlined /> Bảng kê dùng để lập tờ khai 05/QTT-TNCN và phụ lục 05-1/BK-QTT-TNCN, 05-3/BK-QTT-TNCN; hệ thống chưa tạo tệp tờ khai XML.
      </div>
    </div>
  );
};
