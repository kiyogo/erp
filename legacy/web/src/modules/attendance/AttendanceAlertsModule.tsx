import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  EyeOutlined,
  CheckOutlined,
  CloseOutlined,
  FileTextOutlined,
  HistoryOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseAlertItem {
  key: string;
  alertCode: string;
  employeeName: string;
  empCode: string;
  department: string;
  position: string;
  alertType: 'Quên chấm công ra về' | 'Đi muộn quá 3 lần/tháng' | 'Chấm công ngoài Geofence' | 'Chấm công trùng lặp thẻ' | 'Về sớm không phép';
  alertDate: string;
  details: string;
  explanationText?: string;
  explanationProof?: string;
  penaltyAmount?: number;
  status: 'Chờ nhân viên giải trình' | 'Đã giải trình hợp lệ' | 'Đã trừ phạt chuyên cần';
}

const INITIAL_ALERTS: EnterpriseAlertItem[] = [];

export const AttendanceAlertsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseAlertItem[]>(INITIAL_ALERTS);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    const list = dataService.getGenericData('attendance_alerts');
    setData(Array.isArray(list) ? list : []);
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('attendance_alerts');
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
  const [selectedAlert, setSelectedAlert] = useState<EnterpriseAlertItem | null>(null);

  const pendingCount = data.filter((d) => d.status === 'Chờ nhân viên giải trình').length;
  const approvedCount = data.filter((d) => d.status === 'Đã giải trình hợp lệ').length;
  const penalizedCount = data.filter((d) => d.status === 'Đã trừ phạt chuyên cần').length;

  const handleCreate = (values: any) => {
    const newItem: EnterpriseAlertItem = {
      ...values,
      key: String(Date.now()),
      empCode: values.empCode || `KY-${String(Date.now()).slice(-3)}`,
      penaltyAmount: 0,
      status: 'Chờ nhân viên giải trình',
    };
    const nextItems = [newItem, ...data]; setData(nextItems); dataService.saveGenericData('attendance_alerts', nextItems);
    message.success(`Đã ghi nhận cảnh báo bất thường: ${values.employeeName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleApproveExplanation = (record: EnterpriseAlertItem) => {
    setData(
      data.map((d) =>
        d.key === record.key ? { ...d, status: 'Đã giải trình hợp lệ' as const } : d
      )
    );
    message.success(`Đã chấp thuận giải trình cho cảnh báo: ${record.alertCode}`);
    setDrawerOpen(false);
  };

  const handlePenalize = (record: EnterpriseAlertItem) => {
    setData(
      data.map((d) =>
        d.key === record.key ? { ...d, status: 'Đã trừ phạt chuyên cần' as const, penaltyAmount: 100000 } : d
      )
    );
    message.warning(`Đã chuyển trạng thái trừ phạt chuyên cần 100.000 ₫ đối với ${record.employeeName}`);
    setDrawerOpen(false);
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.alertCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.alertType || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.details || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Loại cảnh báo bất thường',
      key: 'alertCode',
      render: (_: any, record: EnterpriseAlertItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertOutlined style={{ color: '#D97706', fontSize: 15 }} />
            {record.alertType}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã sự vụ: <code>{record.alertCode}</code>
          </div>
        </div>
      ),
    },
    {
      title: 'Nhân sự & Phòng ban',
      key: 'employee',
      width: 220,
      render: (_: any, record: EnterpriseAlertItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Mã: <code>{record.empCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Chi tiết hiện tượng',
      dataIndex: 'details',
      key: 'details',
      render: (det: string) => <span style={{ color: '#475569', fontSize: 12 }}>{det}</span>,
    },
    {
      title: 'Ngày ghi nhận',
      dataIndex: 'alertDate',
      key: 'alertDate',
      width: 120,
      render: (d: string) => <span style={{ fontSize: 12.5, fontWeight: 600 }}>{d}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Chờ nhân viên giải trình') color = 'warning';
        if (status === 'Đã giải trình hợp lệ') color = 'success';
        if (status === 'Đã trừ phạt chuyên cần') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_: any, record: EnterpriseAlertItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedAlert(record);
            setDrawerOpen(true);
          }}
        >
          Xử lý
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng bất thường trong tháng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Sự vụ
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Ghi nhận tự động từ hệ thống IoT AI</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chờ nhân sự gửi giải trình</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingCount} Trường hợp
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Thời hạn phản hồi tối đa: 48h làm việc</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã duyệt giải trình hợp lệ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {approvedCount} Trường hợp
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Được tính đủ công &amp; không trừ phạt</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã trừ phạt chuyên cần</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {penalizedCount} Sự vụ
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Trừ trực tiếp vào kỳ lương Tháng 08/2026</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả cảnh báo' },
            { key: 'Chờ nhân viên giải trình', label: 'Chờ giải trình', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã giải trình hợp lệ', label: 'Đã duyệt hợp lệ', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Đã trừ phạt chuyên cần', label: 'Đã trừ phạt', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
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
            placeholder="Tìm theo mã, tên nhân sự, loại bất thường..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo cảnh báo bất thường')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                alertCode: `CB-2026-0${data.length + 1}`,
                alertType: 'Quên chấm công ra về',
                alertDate: new Date().toISOString().substring(0, 10),
                department: 'Phòng Ban Kỹ Thuật',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Ghi nhận cảnh báo mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm cảnh báo mới */}
      <Modal
        title="Ghi Nhận Cảnh Báo Chấm Công Bất Thường Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="alertCode" label="Mã cảnh báo" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="alertType" label="Loại bất thường" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Quên chấm công ra về', value: 'Quên chấm công ra về' },
                  { label: 'Đi muộn quá 3 lần/tháng', value: 'Đi muộn quá 3 lần/tháng' },
                  { label: 'Chấm công ngoài Geofence', value: 'Chấm công ngoài Geofence' },
                  { label: 'Chấm công trùng lặp thẻ', value: 'Chấm công trùng lặp thẻ' },
                  { label: 'Về sớm không phép', value: 'Về sớm không phép' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Nhân viên vi phạm" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Đỗ Hải Nam" />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban trực thuộc" rules={[{ required: true, message: 'Vui lòng chọn phòng ban' }]}>
              <Select
                placeholder="Chọn phòng ban trực thuộc..."
                options={departmentOptions}
              />
            </Form.Item>
          </div>

          <Form.Item name="details" label="Chi tiết hiện tượng bất thường" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="Ví dụ: Đi muộn 25 phút không báo trước..." />
          </Form.Item>

          <Form.Item name="alertDate" label="Ngày ghi nhận" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tạo cảnh báo &amp; Gửi thông báo
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Xử Lý Giải Trình & Vi Phạm */}
      <Drawer
        title="Hồ Sơ Giải Trình Bất Thường &amp; Xử Lý Chuyên Cần"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedAlert && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedAlert.alertCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedAlert.employeeName}
                  </div>
                </div>
                <Tag color={selectedAlert.status === 'Đã giải trình hợp lệ' ? 'success' : 'warning'}>
                  {selectedAlert.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedAlert.position} · {selectedAlert.department} (Mã: {selectedAlert.empCode})
              </div>
            </div>

            {/* Alert Detail */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Nội Dung Bất Thường Ghi Nhận:
              </div>
              <div style={{ fontSize: 12.5, color: '#DC2626', background: '#FEF2F2', padding: '10px 12px', borderRadius: 6 }}>
                <strong>{selectedAlert.alertType}:</strong> {selectedAlert.details}
              </div>
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 6 }}>
                Ngày xảy ra: <strong>{selectedAlert.alertDate}</strong>
              </div>
            </div>

            {/* Explanation */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Nội Dung Giải Trình Của Nhân Sự:
              </div>
              {selectedAlert.explanationText ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12.5, color: '#1E293B', background: '#F1F5F9', padding: '10px 12px', borderRadius: 6, lineHeight: 1.6 }}>
                    "{selectedAlert.explanationText}"
                  </div>
                  {selectedAlert.explanationProof && (
                    <div style={{ fontSize: 12, color: '#2563EB', background: '#EFF6FF', padding: '8px 12px', borderRadius: 6 }}>
                      📎 <strong>Chứng từ đính kèm:</strong> {selectedAlert.explanationProof}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>
                  Chưa có nội dung giải trình. Đã gửi nhắc nhở qua App Kiyo Portal.
                </div>
              )}
            </div>

            {/* Actions */}
            {selectedAlert.status === 'Chờ nhân viên giải trình' && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Button
                  style={{ flex: 1, borderColor: '#DC2626', color: '#DC2626' }}
                  icon={<CloseOutlined />}
                  onClick={() => handlePenalize(selectedAlert)}
                >
                  Trừ Phạt Chuyên Cần (100k)
                </Button>
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                  icon={<CheckOutlined />}
                  onClick={() => handleApproveExplanation(selectedAlert)}
                >
                  Chấp Thuận Giải Trình
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

