import { dataService } from '../../services/dataService';
import { collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { attendanceNumber, timeRangeDetails } from './attendanceRules';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  EditOutlined,
  SettingOutlined,
  TeamOutlined,
  DollarOutlined,
  CalendarOutlined,
  BankOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseWorkShift {
  key: string;
  shiftCode: string;
  shiftName: string;
  timeRange: string;
  startTime: string;
  endTime: string;
  workingHours: number;
  workUnits: number;
  breakTime: string;
  applicableTo: string;
  allowGraceMinutes: number;
  nightAllowancePct: number;
  shiftCategory: 'Hành chính' | 'Trực kíp' | 'Ca đêm' | 'Linh hoạt';
  status: 'Đang áp dụng' | 'Tạm ngưng';
}

const INITIAL_SHIFTS: EnterpriseWorkShift[] = [];

export const ShiftsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseWorkShift[]>(INITIAL_SHIFTS);
  const [saving, setSaving] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    void dataService.refreshGenericData('attendance_shifts').catch(() => message.error('Không thể tải dữ liệu từ máy chủ.'));
    const list = dataService.getGenericData('attendance_shifts');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('attendance_shifts');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedShift, setSelectedShift] = useState<EnterpriseWorkShift | null>(null);

  const activeCount = data.filter((s) => s.status === 'Đang áp dụng').length;
  const nightShiftCount = data.filter((s) => s.shiftCategory === 'Ca đêm' || s.nightAllowancePct > 0).length;

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const time = timeRangeDetails(values.timeRange);
      const hours = attendanceNumber(values.workingHours, 'Số giờ làm việc', 0.5, 24);
      const breakHours = values.breakTime && values.breakTime !== '0' ? timeRangeDetails(values.breakTime).hours : 0;
      if (hours + breakHours > time.hours + 0.001) throw new Error('Giờ làm việc và giờ nghỉ không được vượt quá khung giờ ca.');
      const newShift = {
        ...values, key: editingKey || crypto.randomUUID(),
        startTime: time.startTime, endTime: time.endTime, workingHours: hours,
        workUnits: Number((hours / 8).toFixed(4)),
        allowGraceMinutes: attendanceNumber(values.allowGraceMinutes ?? 0, 'Số phút đi muộn', 0, 60),
        nightAllowancePct: attendanceNumber(values.nightAllowancePct ?? 0, 'Phụ cấp ca đêm', 0, 100),
        status: values.status || 'Đang áp dụng',
      };
      if (editingKey) await collectionsApi.update('attendance_shifts', editingKey, newShift);
      else await collectionsApi.create('attendance_shifts', newShift);
      await dataService.refreshGenericData('attendance_shifts');
      message.success(`Đã lưu ca làm việc: ${values.shiftName}`);
      setModalOpen(false);
      setDrawerOpen(false);
      form.resetFields();
    } catch (error: any) { message.error(error?.response?.data?.message || error.message || 'Không thể lưu ca làm việc.'); }
    finally { setSaving(false); }
  };

  const filteredData = data.filter((item) => {
    const matchCat = categoryFilter === 'all' || item.shiftCategory === categoryFilter;
    const matchSearch =
      (item.shiftName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.shiftCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.applicableTo || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.timeRange || '').toLowerCase().includes(searchText.toLowerCase());

    return matchCat && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Tên ca làm việc',
      key: 'shiftName',
      render: (_: any, record: EnterpriseWorkShift) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ClockCircleOutlined style={{ color: '#009688', fontSize: 15 }} />
            {record.shiftName}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã ca: <code>{record.shiftCode}</code> · Nhóm: <strong>{record.shiftCategory}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Khung giờ làm việc',
      dataIndex: 'timeRange',
      key: 'timeRange',
      width: 170,
      render: (tr: string) => <span style={{ fontWeight: 700, color: '#2563EB', fontSize: 13 }}>{tr}</span>,
    },
    {
      title: 'Thời gian tính công',
      key: 'workingHours',
      width: 170,
      render: (_: any, record: EnterpriseWorkShift) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A' }}>
            {record.workingHours} Giờ ({record.workUnits} Công)
          </div>
          {record.nightAllowancePct > 0 && (
            <div style={{ fontSize: 11, color: '#D97706', fontWeight: 600 }}>
              + {record.nightAllowancePct}% Phụ cấp ca đêm
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Nghỉ giữa ca',
      dataIndex: 'breakTime',
      key: 'breakTime',
      width: 170,
      render: (b: string) => <span style={{ color: '#64748B', fontSize: 12 }}>{b}</span>,
    },
    {
      title: 'Đối tượng áp dụng',
      dataIndex: 'applicableTo',
      key: 'applicableTo',
      render: (app: string) => <span style={{ color: '#334155', fontSize: 12 }}>{app}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (st: string) => <Tag color={st === 'Đang áp dụng' ? 'success' : 'default'}>{st}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseWorkShift) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedShift(record);
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng ca làm việc chuẩn hóa</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Ca làm việc
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Thiết lập đa dạng theo tính chất công việc</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ca đang áp dụng vận hành</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeCount} / {data.length} Ca hiệu lực
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Ca làm việc được lưu trên hệ thống</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ca trực đêm &amp; Kíp 24/7</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {nightShiftCount} Ca đặc thù
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Phụ cấp theo cấu hình của từng ca</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số nhóm đối tượng áp dụng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {new Set(data.map((item) => item.applicableTo).filter(Boolean)).size} Nhóm
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Kết nối thiết bị cần cấu hình nhà cung cấp</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả ca làm việc' },
            { key: 'Hành chính', label: 'Ca Hành Chính', icon: <BankOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Trực kíp', label: 'Ca Trực Kíp', icon: <SwapOutlined style={{ color: '#10B981' }} /> },
            { key: 'Ca đêm', label: 'Ca Đêm IDC', icon: <ClockCircleOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Linh hoạt', label: 'Ca Linh Hoạt', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setCategoryFilter(tab.key)}
              style={{
                backgroundColor: categoryFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: categoryFilter === tab.key ? '#009688' : '#CBD5E1',
                color: categoryFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: categoryFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên ca, mã ca, đối tượng..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('Ca_lam_viec.xlsx', generateValidXlsxBlob([['Mã ca', 'Tên ca', 'Khung giờ', 'Giờ làm', 'Ngày công', 'Giờ nghỉ', 'Cho phép muộn', 'Phụ cấp đêm', 'Đối tượng', 'Trạng thái'], ...filteredData.map((item) => [item.shiftCode, item.shiftName, item.timeRange, item.workingHours, item.workUnits, item.breakTime, item.allowGraceMinutes, item.nightAllowancePct, item.applicableTo, item.status])]))}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingKey(null);
              form.resetFields();
              form.setFieldsValue({
                shiftCode: `CA-${Date.now()}`,
                startTime: '08:00',
                endTime: '17:30',
                timeRange: '08:00 - 17:30',
                workingHours: 8,
                breakTime: '12:00 - 13:30 (1.5h)',
                allowGraceMinutes: 15,
                nightAllowancePct: 0,
                shiftCategory: 'Hành chính',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thiết lập ca mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm ca mới */}
      <Modal
        title="Thiết Lập Ca Làm Việc &amp; Quy Tắc Tính Công Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="shiftCode" label="Mã ca làm việc" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="shiftCategory" label="Phân loại ca" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Hành chính chuẩn', value: 'Hành chính' },
                  { label: 'Trực kíp luân phiên', value: 'Trực kíp' },
                  { label: 'Ca đêm IDC 24/7', value: 'Ca đêm' },
                  { label: 'Linh hoạt R&D', value: 'Linh hoạt' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="shiftName" label="Tên ca làm việc" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Ca Kỹ Thuật Data Center IDC" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="timeRange" label="Khung giờ" rules={[{ required: true }]}>
              <Input placeholder="08:00 - 17:30" />
            </Form.Item>
            <Form.Item name="workingHours" label="Số giờ làm việc" rules={[{ required: true }]}>
              <Input type="number" step={0.5} min={1} max={12} />
            </Form.Item>
            <Form.Item name="allowGraceMinutes" label="Cho phép đi muộn">
              <Input type="number" step={5} min={0} max={60} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="breakTime" label="Thời gian nghỉ giữa giờ" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: 12:00 - 13:30 (1.5h)" />
            </Form.Item>
            <Form.Item name="nightAllowancePct" label="Phụ cấp ca đêm">
              <Input type="number" step={5} min={0} max={100} />
            </Form.Item>
          </div>

          <Form.Item name="applicableTo" label="Đối tượng phòng ban áp dụng" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Toàn bộ Kỹ sư Trung tâm Dữ liệu & Trực ca" />
          </Form.Item>
          <Form.Item name="status" label="Trạng thái" initialValue="Đang áp dụng">
            <Select options={[{ label: 'Đang áp dụng', value: 'Đang áp dụng' }, { label: 'Tạm ngưng', value: 'Tạm ngưng' }]} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu ca làm việc
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Thông Số Ca */}
      <Drawer
        title="Thông Số Ca &amp; Chính Sách Chấm Công Chi Tiết"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
      >
        {selectedShift && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedShift.shiftCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedShift.shiftName}
                  </div>
                </div>
                <Tag color="success">{selectedShift.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Nhóm ca: <strong>{selectedShift.shiftCategory}</strong>
              </div>
            </div>

            {/* Shift Rules */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Số Chấm Công &amp; Quy Đổi Ngày Công:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Khung giờ bắt đầu - kết thúc:</span>
                  <strong style={{ color: '#2563EB' }}>{selectedShift.timeRange}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tổng giờ làm việc thực tế:</span>
                  <strong>{selectedShift.workingHours} Giờ / Ca</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Hệ số ngày công quy đổi:</span>
                  <strong style={{ color: '#16A34A' }}>{selectedShift.workUnits} Công chuẩn</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời gian nghỉ giữa ca:</span>
                  <span>{selectedShift.breakTime}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Dung sai cho phép đi muộn:</span>
                  <strong>{selectedShift.allowGraceMinutes} phút / lần</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Phụ cấp làm thêm ca đêm:</span>
                  <strong style={{ color: '#D97706' }}>+{selectedShift.nightAllowancePct}% Lương giờ chuẩn</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Đối tượng áp dụng:</span>
                  <span>{selectedShift.applicableTo}</span>
                </div>
              </div>
            </div>

            <Button icon={<EditOutlined />} onClick={() => { setEditingKey(selectedShift.key); form.resetFields(); form.setFieldsValue(selectedShift); setModalOpen(true); }}>
              Chỉnh sửa ca làm việc
            </Button>
            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => {
                message.info('Chưa cấu hình kết nối thiết bị FaceID. Ca làm việc đã được lưu trong hệ thống.');
              }}
            >
              Đồng Bộ Chính Sách Xuống Máy Chấm Công
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

