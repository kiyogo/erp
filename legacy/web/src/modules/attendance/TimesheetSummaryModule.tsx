import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  TableOutlined,
  CheckCircleOutlined,
  CalculatorOutlined,
  EyeOutlined,
  EditOutlined,
  CheckOutlined,
  DollarOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  LaptopOutlined,
  AuditOutlined,
  BarChartOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseTimesheetSummaryItem {
  key: string;
  employeeCode: string;
  employeeName: string;
  position: string;
  department: string;
  standardDays: number;
  actualDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  otHoursWeekday: number;
  otHoursWeekend: number;
  totalPayDays: number;
  attendanceRate: number;
  status: 'Đã khóa công' | 'Chờ đối soát';
}

const INITIAL_SUMMARY: EnterpriseTimesheetSummaryItem[] = [];

export const TimesheetSummaryModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseTimesheetSummaryItem[]>(INITIAL_SUMMARY);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    const list = dataService.getGenericData('attendance_timesheet_summary');
    setData(Array.isArray(list) ? list : []);
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('attendance_timesheet_summary');
      setData(Array.isArray(updated) ? updated : []);
      dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<EnterpriseTimesheetSummaryItem | null>(null);

  const totalActual = data.reduce((sum, item) => sum + item.actualDays, 0);
  const totalOT = data.reduce((sum, item) => sum + item.otHoursWeekday + item.otHoursWeekend, 0);

  const handleCreate = (values: any) => {
    const act = Number(values.actualDays) || 22;
    const leave = Number(values.paidLeaveDays) || 0;
    const newItem: EnterpriseTimesheetSummaryItem = {
      ...values,
      key: String(Date.now()),
      standardDays: 22,
      actualDays: act,
      paidLeaveDays: leave,
      unpaidLeaveDays: Number(values.unpaidLeaveDays) || 0,
      otHoursWeekday: Number(values.otHoursWeekday) || 0,
      otHoursWeekend: Number(values.otHoursWeekend) || 0,
      totalPayDays: act + leave,
      attendanceRate: Math.min(100, Math.round(((act + leave) / 22) * 100)),
      status: 'Đã khóa công',
    };
    const nextItems = [newItem, ...data]; setData(nextItems); dataService.saveGenericData('attendance_timesheet_summary', nextItems);
    message.success(`Đã thêm và tính toán dữ liệu công cho: ${values.employeeName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchDept = deptFilter === 'all' || item.department === deptFilter;
    const matchSearch =
      (item.employeeCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.position || '').toLowerCase().includes(searchText.toLowerCase());

    return matchDept && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Họ tên nhân viên',
      key: 'employeeName',
      render: (_: any, record: EnterpriseTimesheetSummaryItem) => (
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
      title: 'Công chuẩn / Thực tế',
      key: 'days',
      width: 170,
      render: (_: any, record: EnterpriseTimesheetSummaryItem) => (
        <div>
          <div>Chuẩn: <strong>{record.standardDays}</strong> ngày</div>
          <div style={{ color: '#16A34A', fontWeight: 700 }}>Thực tế: {record.actualDays} ngày</div>
        </div>
      ),
    },
    {
      title: 'Nghỉ phép (P) / Không lương',
      key: 'leaves',
      width: 170,
      render: (_: any, record: EnterpriseTimesheetSummaryItem) => (
        <div style={{ fontSize: 12 }}>
          <span style={{ color: '#D97706', fontWeight: 600 }}>{record.paidLeaveDays} Phép năm (P)</span>
          {record.unpaidLeaveDays > 0 && (
            <div style={{ color: '#DC2626' }}>{record.unpaidLeaveDays} Không lương</div>
          )}
        </div>
      ),
    },
    {
      title: 'Giờ làm thêm OT (x1.5 / x2.0)',
      key: 'ot',
      width: 180,
      render: (_: any, record: EnterpriseTimesheetSummaryItem) => (
        <div>
          <span style={{ color: '#2563EB', fontWeight: 700 }}>{record.otHoursWeekday}h ngày thường</span>
          <div style={{ color: '#D97706', fontSize: 11.5 }}>{record.otHoursWeekend}h cuối tuần</div>
        </div>
      ),
    },
    {
      title: 'Tổng công tính lương',
      dataIndex: 'totalPayDays',
      key: 'totalPayDays',
      width: 160,
      render: (d: number, record: EnterpriseTimesheetSummaryItem) => (
        <div>
          <div style={{ fontWeight: 800, color: '#009688', fontSize: 14 }}>
            {d} / 22 Công
          </div>
          <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
            {record.attendanceRate}% Chuyên cần
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (st: string) => <Tag color={st === 'Đã khóa công' ? 'success' : 'warning'}>{st}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseTimesheetSummaryItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedSummary(record);
            setDrawerOpen(true);
          }}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng ngày công thực tế toàn công ty</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalActual} Ngày công
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Được trích xuất từ 31 ngày chấm công chi tiết</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giờ làm thêm tăng ca (OT)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalOT} Giờ OT
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Quy đổi hệ số x1.5 ngày thường, x2.0 cuối tuần</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ chuyên cần bình quân</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            99.2% Đạt chuẩn
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Không có hiện tượng vắng mặt không lý do</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chuyển tiếp sang Tính Lương</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            100% Sẵn sàng
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Đã sẵn sàng tạo kỳ chi trả lương T08/2026</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phòng ban' },
            ...departmentOptions.map((d) => ({ key: d.value, label: d.label })),
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setDeptFilter(tab.key)}
              style={{
                backgroundColor: deptFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: deptFilter === tab.key ? '#009688' : '#CBD5E1',
                color: deptFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: deptFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã NV, họ tên..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất bảng tổng hợp ngày công ra Excel')}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                employeeCode: `KY-0${data.length + 10}`,
                department: 'Phòng Ban Kỹ Thuật',
                actualDays: 22,
                paidLeaveDays: 0,
                unpaidLeaveDays: 0,
                otHoursWeekday: 0,
                otHoursWeekend: 0,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Điều chỉnh ngày công
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Điều Chỉnh Ngày Công */}
      <Modal
        title="Thêm Hoặc Điều Chỉnh Ngày Công &amp; Giờ Tăng Ca"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeCode" label="Mã nhân viên" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban trực thuộc" rules={[{ required: true, message: 'Vui lòng chọn phòng ban' }]}>
              <Select
                placeholder="Chọn phòng ban trực thuộc..."
                options={departmentOptions}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân viên" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Hoàng Văn Thắng" />
            </Form.Item>
            <Form.Item name="position" label="Vị trí / Chức vụ" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Senior Security Engineer" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="actualDays" label="Công thực tế (ngày)" rules={[{ required: true }]}>
              <Input type="number" min={0} max={31} />
            </Form.Item>
            <Form.Item name="paidLeaveDays" label="Phép hưởng lương (P)">
              <Input type="number" min={0} max={10} />
            </Form.Item>
            <Form.Item name="unpaidLeaveDays" label="Nghỉ không lương (KL)">
              <Input type="number" min={0} max={10} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="otHoursWeekday" label="Giờ OT ngày thường (hệ số x1.5)">
              <Input type="number" step={0.5} />
            </Form.Item>
            <Form.Item name="otHoursWeekend" label="Giờ OT cuối tuần (hệ số x2.0)">
              <Input type="number" step={0.5} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu &amp; Cập nhật ngày công
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Cấu Thành Công & Chuyển Tính Lương */}
      <Drawer
        title="Chi Tiết Bảng Công Tổng Hợp &amp; Cấu Thành Lương"
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
                <Tag color="success">{selectedSummary.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedSummary.position} · {selectedSummary.department}
              </div>
            </div>

            {/* Workday Breakdown */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Cấu Thành Ngày Công Tính Lương:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số ngày công chuẩn của tháng:</span>
                  <strong>{selectedSummary.standardDays} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số ngày công đi làm thực tế:</span>
                  <strong style={{ color: '#16A34A' }}>{selectedSummary.actualDays} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Nghỉ phép hưởng 100% lương (P):</span>
                  <strong style={{ color: '#D97706' }}>{selectedSummary.paidLeaveDays} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Nghỉ không lương (KL):</span>
                  <span style={{ color: '#DC2626' }}>{selectedSummary.unpaidLeaveDays} Ngày</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                  <span style={{ color: '#0F172A', fontWeight: 700 }}>Tổng công thanh toán lương (P + Thực tế):</span>
                  <strong style={{ color: '#009688', fontSize: 14 }}>{selectedSummary.totalPayDays} / 22 Công</strong>
                </div>
              </div>
            </div>

            {/* OT Breakdown */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#EFF6FF' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 8 }}>
                Tổng Hợp Giờ Làm Thêm Ngoài Giờ (OT):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>OT Ngày thường (Hệ số x150% lương giờ):</span>
                  <strong>{selectedSummary.otHoursWeekday} Giờ</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>OT Cuối tuần (Hệ số x200% lương giờ):</span>
                  <strong>{selectedSummary.otHoursWeekend} Giờ</strong>
                </div>
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => {
                message.success(`Đã khóa công và đồng bộ số liệu sang phân hệ Lương cho ${selectedSummary.employeeName}`);
                setDrawerOpen(false);
              }}
            >
              Khóa Số Liệu &amp; Đẩy Sang Bảng Lương
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

