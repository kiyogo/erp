import { dataService } from '../../services/dataService';
import { collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { attendanceNumber, employeeAttendanceFields, leaveBalance } from './attendanceRules';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  EditOutlined,
  DollarOutlined,
  PieChartOutlined,
  UserOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';

export interface EnterpriseLeaveSummaryItem {
  key: string;
  year?: number;
  employeeCode: string;
  employeeName: string;
  position: string;
  department: string;
  standardQuota: number;
  seniorityQuota: number;
  carriedOver: number;
  totalEntitled: number;
  usedLeaves: number;
  remainingLeaves: number;
  leaveUsagePct: number;
  status: 'Còn nhiều phép' | 'Sắp hết phép' | 'Đã hết phép';
}

const INITIAL_LEAVES_SUMMARY: EnterpriseLeaveSummaryItem[] = [];

export const LeaveSummaryModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseLeaveSummaryItem[]>(INITIAL_LEAVES_SUMMARY);
  const [employees, setEmployees] = useState(dataService.getEmployees());
  const [saving, setSaving] = useState(false);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    void dataService.refreshGenericData('attendance_leave_summary').catch(() => message.error('Không thể tải dữ liệu từ máy chủ.'));
    const list = dataService.getGenericData('attendance_leave_summary');
    setData(Array.isArray(list) ? list : []);
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    const unsub = dataService.subscribe(() => {
      setEmployees(dataService.getEmployees());
      const updated = dataService.getGenericData('attendance_leave_summary');
      setData(Array.isArray(updated) ? updated : []);
      dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<EnterpriseLeaveSummaryItem | null>(null);

  const totalEntitledAll = data.reduce((sum, item) => sum + item.totalEntitled, 0);
  const totalUsed = data.reduce((sum, item) => sum + item.usedLeaves, 0);
  const totalRemaining = data.reduce((sum, item) => sum + item.remainingLeaves, 0);

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const employee = employeeAttendanceFields(employees, values.employeeName);
      const year = attendanceNumber(values.year, 'Năm theo dõi', 2000, 2200);
      if (!Number.isInteger(year)) throw new Error('Năm theo dõi phải là số nguyên.');
      const standardQuota = attendanceNumber(values.standardQuota, 'Phép chuẩn', 0, 366);
      const seniorityQuota = attendanceNumber(values.seniorityQuota ?? 0, 'Phép thâm niên', 0, 366);
      const carriedOver = attendanceNumber(values.carriedOver ?? 0, 'Phép chuyển tiếp', 0, 366);
      const usedLeaves = attendanceNumber(values.usedLeaves ?? 0, 'Phép đã sử dụng', 0, 366);
      const existing = data.find((item) => item.employeeCode === employee.employeeCode && (item.year || new Date().getFullYear()) === year);
      const record = { ...values, ...employee, key: existing?.key || crypto.randomUUID(), year, standardQuota, seniorityQuota, carriedOver, openingUsedLeaves: usedLeaves, ...leaveBalance(standardQuota, seniorityQuota, carriedOver, usedLeaves) };
      if (existing) await collectionsApi.update('attendance_leave_summary', existing.key, record);
      else await collectionsApi.create('attendance_leave_summary', record);
      await dataService.refreshGenericData('attendance_leave_summary');
      message.success(`Đã cập nhật quỹ phép năm cho: ${employee.employeeName}`);
      setModalOpen(false); form.resetFields();
    } catch (error: any) { message.error(error?.response?.data?.message || error.message || 'Không thể lưu quỹ phép.'); }
    finally { setSaving(false); }
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.employeeCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.position || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Họ tên nhân sự',
      key: 'employeeName',
      render: (_: any, record: EnterpriseLeaveSummaryItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{record.employeeCode}</code> · {record.position}
          </div>
        </div>
      ),
    },
    {
      title: 'Khối phòng ban',
      dataIndex: 'department',
      key: 'department',
      width: 200,
      render: (dept: string) => <span style={{ color: '#475569', fontSize: 12.5 }}>{dept}</span>,
    },
    {
      title: 'Phép chuẩn + Thâm niên',
      key: 'quota',
      width: 180,
      render: (_: any, record: EnterpriseLeaveSummaryItem) => (
        <div style={{ fontSize: 12 }}>
          <strong>{record.standardQuota}</strong> ngày chuẩn + <span style={{ color: '#009688', fontWeight: 600 }}>{record.seniorityQuota} ngày thâm niên</span>
        </div>
      ),
    },
    {
      title: 'Chuyển từ năm trước',
      dataIndex: 'carriedOver',
      key: 'carriedOver',
      width: 150,
      render: (d: number) => <span style={{ color: '#64748B', fontWeight: 600 }}>+{d} ngày tồn cũ</span>,
    },
    {
      title: 'Tổng quỹ phép',
      dataIndex: 'totalEntitled',
      key: 'totalEntitled',
      width: 140,
      render: (d: number) => <span style={{ fontWeight: 800, color: '#2563EB', fontSize: 13.5 }}>{d} ngày</span>,
    },
    {
      title: 'Đã nghỉ / Tỷ lệ',
      key: 'used',
      width: 150,
      render: (_: any, record: EnterpriseLeaveSummaryItem) => (
        <div>
          <span style={{ fontWeight: 700, color: '#DC2626' }}>{record.usedLeaves} ngày</span>
          <div style={{ fontSize: 11, color: '#64748B' }}>Đã dùng {record.leaveUsagePct}%</div>
        </div>
      ),
    },
    {
      title: 'Phép còn lại khả dụng',
      dataIndex: 'remainingLeaves',
      key: 'remainingLeaves',
      width: 160,
      render: (d: number, record: EnterpriseLeaveSummaryItem) => (
        <div>
          <div style={{ fontWeight: 800, color: d > 3 ? '#16A34A' : '#D97706', fontSize: 14 }}>
            {d} Ngày phép
          </div>
          <Tag color={d > 3 ? 'success' : d > 0 ? 'warning' : 'error'}>{record.status}</Tag>
        </div>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseLeaveSummaryItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedSummary(record);
            setDrawerOpen(true);
          }}
        >
          Sổ phép
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quỹ phép năm toàn công ty</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalEntitledAll} Ngày phép
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Bao gồm 12 ngày chuẩn + Phép thâm niên</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã sử dụng nghỉ trong năm</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {totalUsed} Ngày phép ({(totalEntitledAll ? Math.round((totalUsed / totalEntitledAll) * 100) : 0)}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Theo số liệu điều chỉnh quỹ phép đã lưu</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quỹ phép khả dụng còn lại</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalRemaining} Ngày phép
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Theo năm theo dõi của từng sổ phép</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng phép thâm niên đã ghi nhận</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {data.reduce((sum, item) => sum + item.seniorityQuota, 0)} Ngày
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Theo cấu hình quỹ phép của từng nhân viên</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả nhân sự' },
            { key: 'Còn nhiều phép', label: 'Còn nhiều phép', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Sắp hết phép', label: 'Sắp hết phép', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã hết phép', label: 'Đã hết phép', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setStatusFilter(tab.key)}
              style={{
                backgroundColor: statusFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: statusFilter === tab.key ? '#009688' : '#CBD5E1',
                color: statusFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: statusFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã NV, họ tên, phòng ban..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('Quy_phep_nam.xlsx', generateValidXlsxBlob([['Năm', 'Mã NV', 'Nhân viên', 'Phòng ban', 'Phép chuẩn', 'Thâm niên', 'Chuyển tiếp', 'Tổng quỹ', 'Đã nghỉ', 'Còn lại'], ...filteredData.map((item) => [item.year || new Date().getFullYear(), item.employeeCode, item.employeeName, item.department, item.standardQuota, item.seniorityQuota, item.carriedOver, item.totalEntitled, item.usedLeaves, item.remainingLeaves])]))}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                year: new Date().getFullYear(),
                standardQuota: 12,
                seniorityQuota: 0,
                carriedOver: 0,
                usedLeaves: 0,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Điều chỉnh quỹ phép
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Điều chỉnh quỹ phép */}
      <Modal
        title="Điều Chỉnh Hạn Mức Quỹ Phép Năm &amp; Thâm Niên"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeCode" label="Mã nhân viên" rules={[{ required: true }]}>
              <Input readOnly />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban trực thuộc" >
              <Select
                placeholder="Chọn phòng ban trực thuộc..."
                options={Array.from(new Set([...departmentOptions.map((item) => item.value), ...employees.map((item) => item.department)].filter(Boolean))).map((value) => ({ label: value, value }))}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân sự" rules={[{ required: true }]}>
              <Select placeholder="Chọn nhân viên" options={employees.filter((employee) => employee.status !== 'Đã nghỉ việc').map((employee) => ({ label: `${employee.name} (${employee.code})`, value: employee.key }))} onChange={(key) => { const employee = employees.find((item) => item.key === key); if (employee) { const existing = data.find((item) => item.employeeCode === employee.code && (item.year || new Date().getFullYear()) === Number(form.getFieldValue('year'))); form.setFieldsValue({ ...(existing || {}), employeeName: employee.key, employeeCode: employee.code, department: employee.department, position: employee.position, usedLeaves: (existing as any)?.openingUsedLeaves ?? existing?.usedLeaves ?? 0 }); } }} />
            </Form.Item>
            <Form.Item name="position" label="Chức danh">
              <Input placeholder="Ví dụ: Senior DevOps" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="standardQuota" label="Phép chuẩn năm" rules={[{ required: true }]}>
              <Input type="number" min={0} max={366} step={0.5} />
            </Form.Item>
            <Form.Item name="seniorityQuota" label="Phép thâm niên">
              <Input type="number" min={0} max={5} />
            </Form.Item>
            <Form.Item name="carriedOver" label="Tồn năm trước">
              <Input type="number" min={0} max={10} />
            </Form.Item>
          </div>

          <Form.Item name="year" label="Năm theo dõi" rules={[{ required: true }]}>
            <Input type="number" min={2000} max={2200} />
          </Form.Item>
          <Form.Item name="usedLeaves" label="Phép đã sử dụng">
            <Input type="number" min={0} max={366} step={0.5} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu &amp; Cập nhật quỹ phép
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Sổ Theo Dõi Quỹ Phép Cá Nhân */}
      <Drawer
        title="Sổ Theo Dõi Quỹ Phép Năm &amp; Lịch Sử Nghỉ Phép"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedSummary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedSummary.employeeCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedSummary.employeeName}
                  </div>
                </div>
                <Tag color={selectedSummary.remainingLeaves > 3 ? 'success' : 'warning'}>
                  {selectedSummary.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedSummary.position} · {selectedSummary.department}
              </div>
            </div>

            {/* Leave Balance Overview */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Cơ Cấu Hạn Mức Phép Năm {selectedSummary.year || new Date().getFullYear()}:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Phép năm theo luật quy định:</span>
                  <strong>{selectedSummary.standardQuota} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Cộng thưởng phép thâm niên:</span>
                  <strong style={{ color: '#009688' }}>+{selectedSummary.seniorityQuota} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Phép năm trước chuyển tiếp:</span>
                  <strong style={{ color: '#2563EB' }}>+{selectedSummary.carriedOver} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 6 }}>
                  <span style={{ color: '#0F172A', fontWeight: 700 }}>Tổng quỹ phép được hưởng:</span>
                  <strong style={{ color: '#2563EB', fontSize: 13.5 }}>{selectedSummary.totalEntitled} Ngày phép</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#DC2626' }}>Đã nghỉ phép trong năm:</span>
                  <strong style={{ color: '#DC2626' }}>- {selectedSummary.usedLeaves} Ngày ({selectedSummary.leaveUsagePct}%)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', background: '#F0FDF4', padding: '8px 10px', borderRadius: 6 }}>
                  <span style={{ color: '#166534', fontWeight: 700 }}>Quỹ phép còn lại khả dụng:</span>
                  <strong style={{ color: '#16A34A', fontSize: 15 }}>{selectedSummary.remainingLeaves} Ngày phép</strong>
                </div>
              </div>
            </div>

            {/* Compensation Policy */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                Chính Sách Thanh Toán Phép Tồn Cuối Năm:
              </div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                Chưa cấu hình chính sách thanh toán phép tồn. Sổ phép hiện ghi nhận hạn mức và số ngày sử dụng do cán bộ nhân sự điều chỉnh; cần đối chiếu với các đơn nghỉ đã duyệt.
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => {
                downloadFile(`So_phep_${selectedSummary.employeeCode}.pdf`, generateValidPdfBlob('Sổ theo dõi phép năm', `${selectedSummary.employeeName} - ${selectedSummary.year || new Date().getFullYear()}`, [`Mã nhân viên: ${selectedSummary.employeeCode}`, `Phòng ban: ${selectedSummary.department}`, `Phép chuẩn: ${selectedSummary.standardQuota}`, `Phép thâm niên: ${selectedSummary.seniorityQuota}`, `Tồn năm trước: ${selectedSummary.carriedOver}`, `Tổng quỹ: ${selectedSummary.totalEntitled}`, `Đã sử dụng: ${selectedSummary.usedLeaves}`, `Còn lại: ${selectedSummary.remainingLeaves}`]));
              }}
            >
              In Sổ Phép Năm Cá Nhân (PDF)
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

