import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message } from '../../custom-ui';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { createStrategicPlan, strategicPlanCompletionRate, strategicPlanExportRows } from './planListRules';

interface StrategicPlan {
  key: string;
  code: string;
  name: string;
  department: string;
  startDate: string;
  endDate: string;
  budget: number;
  manager: string;
  priority: 'Chiến lược cấp 1' | 'Trọng điểm cấp 2' | 'Thường xuyên';
  status: 'Đang triển khai' | 'Đã phê duyệt' | 'Đã hoàn thành';
}

const INITIAL_PLANS: StrategicPlan[] = [];

export const PlanListModule: React.FC = () => {
  const [data, setData] = useState<StrategicPlan[]>(INITIAL_PLANS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('plan_items');
      if (active) setData(Array.isArray(updated) ? updated : []);
    });
    void dataService.refreshGenericData('plan_items')
      .catch((error: any) => message.error(error?.response?.data?.message || 'Không tải được kế hoạch chiến lược.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; unsub(); };
  }, []);

  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const totalBudget = data.reduce((sum, item) => sum + (Number(item.budget) || 0), 0);
  const completionRate = strategicPlanCompletionRate(data);

  const handleCreate = async (values: any) => {
    if (savingKey) return;
    setSavingKey('create');
    try {
      const newPlan = createStrategicPlan(values, data);
      await dataService.createGenericRecord('plan_items', newPlan);
      message.success(`Đã thêm kế hoạch chiến lược: ${newPlan.name}`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu kế hoạch chiến lược.');
    } finally {
      setSavingKey(null);
    }
  };

  const filteredData = data.filter(
    (item) =>
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.manager || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const handleCompletePlan = async (record: StrategicPlan) => {
    if (record.status === 'Đã hoàn thành' || savingKey) return;
    setSavingKey(record.key);
    try {
      await dataService.updateGenericRecord('plan_items', { ...record, status: 'Đã hoàn thành' });
      message.success(`Đã đánh dấu hoàn thành kế hoạch: ${record.name}`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể cập nhật trạng thái kế hoạch.');
    } finally {
      setSavingKey(null);
    }
  };

  const openCreate = () => {
    let sequence = data.length + 1;
    let code = '';
    do {
      code = `KH-${new Date().getFullYear()}-${String(sequence++).padStart(3, '0')}`;
    } while (data.some((item) => item.code.toLowerCase() === code.toLowerCase()));
    form.resetFields();
    form.setFieldsValue({ code, priority: 'Trọng điểm cấp 2' });
    setModalOpen(true);
  };

  const columns = [
    {
      title: 'Mã kế hoạch',
      dataIndex: 'code',
      key: 'code',
      render: (code: string) => (
        <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarOutlined /> {code}
        </span>
      ),
    },
    {
      title: 'Tên kế hoạch chiến lược',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: StrategicPlan) => (
        <div>
          <div style={{ fontWeight: 600, color: '#212121', fontSize: 13.5 }}>{name}</div>
          <div style={{ fontSize: 11.5, color: '#1565C0' }}>Khối phụ trách: {record.department} · Chủ nhiệm: {record.manager}</div>
        </div>
      ),
    },
    {
      title: 'Cấp ưu tiên',
      dataIndex: 'priority',
      key: 'priority',
      render: (pri: string) => {
        let bg = '#FEF3C7';
        let color = '#D97706';
        if (pri === 'Chiến lược cấp 1') { bg = '#FFEBEE'; color = '#C62828'; }
        return (
          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11.5, fontWeight: 600, background: bg, color: color }}>
            {pri}
          </span>
        );
      },
    },
    {
      title: 'Thời gian thực hiện',
      key: 'dates',
      render: (_: any, record: StrategicPlan) => (
        <span style={{ fontSize: 12, color: '#757575' }}>
          {record.startDate} ➔ {record.endDate}
        </span>
      ),
    },
    {
      title: 'Ngân sách phê duyệt',
      dataIndex: 'budget',
      key: 'budget',
      render: (val: number) => (
        <span style={{ fontWeight: 700, color: '#2E7D32' }}>
          {val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, background: '#E8F5E9', color: '#2E7D32' }}>
          {status}
        </span>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 140,
      render: (_: any, record: StrategicPlan) => (
        <div style={{ display: 'flex', gap: 6 }}>
          {record.status !== 'Đã hoàn thành' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              loading={savingKey === record.key}
              disabled={!!savingKey}
              style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', fontSize: 11 }}
              onClick={() => handleCompletePlan(record)}
            >
              Hoàn thành
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 6, padding: '12px 16px' }}>
          <div style={{ fontSize: 12.5, color: '#757575', fontWeight: 500 }}>Tổng kế hoạch chiến lược</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#009688', marginTop: 4 }}>
            {data.length} kế hoạch
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 6, padding: '12px 16px' }}>
          <div style={{ fontSize: 12.5, color: '#757575', fontWeight: 500 }}>Tổng ngân sách đầu tư phê duyệt</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#2E7D32', marginTop: 4 }}>
            {totalBudget.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 6, padding: '12px 16px' }}>
          <div style={{ fontSize: 12.5, color: '#757575', fontWeight: 500 }}>Tỷ lệ kế hoạch hoàn thành</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1565C0', marginTop: 4 }}>
            {completionRate === null ? 'Chưa có dữ liệu' : `${completionRate}% Hoàn thành`}
          </div>
        </div>
      </div>

      {/* Unified Toolbar (Search on left, Actions on right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="Tìm theo tên kế hoạch, mã, đơn vị phụ trách, chủ nhiệm..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 360, borderRadius: 4 }}
          allowClear
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button disabled={!filteredData.length} icon={<DownloadOutlined />} onClick={() => downloadFile('Danh_sach_ke_hoach.xlsx', generateValidXlsxBlob(strategicPlanExportRows(filteredData)))}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập kế hoạch mới
          </Button>
        </div>
      </div>

      <div className="transparent-table-card" style={{ width: '100%' }}>
        <KTable
          loading={loading}
          dataSource={filteredData}
          columns={columns}
          pagination={{
            pageSize: 10,
            showTotal: (total) => (
              <span style={{ fontSize: 13, color: '#757575' }}>
                Tổng số {total} kế hoạch chiến lược
              </span>
            ),
          }}
        />
      </div>

      {/* Modal Add Plan */}
      <Modal
        title="Lập kế hoạch chiến lược mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã kế hoạch" rules={[{ required: true, whitespace: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="priority" label="Cấp độ ưu tiên" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Chiến lược cấp 1', value: 'Chiến lược cấp 1' },
                  { label: 'Trọng điểm cấp 2', value: 'Trọng điểm cấp 2' },
                  { label: 'Thường xuyên', value: 'Thường xuyên' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="name" label="Tên kế hoạch chiến lược" rules={[{ required: true, message: 'Nhập tên kế hoạch' }]}>
            <Input placeholder="Ví dụ: Kế hoạch mở rộng chi nhánh Đà Nẵng" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="department" label="Khối phụ trách" rules={[{ required: true, whitespace: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="manager" label="Chủ nhiệm kế hoạch" rules={[{ required: true, whitespace: true }]}>
              <Input />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="endDate" label="Ngày kết thúc" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <Form.Item name="budget" label="Ngân sách dự kiến (VNĐ)" rules={[{ required: true }]}>
            <Input type="number" min={0} step={100000000} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={savingKey === 'create'} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận lập kế hoạch
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
