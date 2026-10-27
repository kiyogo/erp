import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  FieldTimeOutlined,
  PrinterOutlined,
  EyeOutlined,
  ProjectOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Button, message, Tag, Drawer } from '../../custom-ui';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { daysUntilDueDate, planProgressExportRows, planProgressMetrics, planProgressStatus, updatePlanProgress } from './planProgressRules';

interface TaskProgress {
  key: string;
  code: string;
  planName: string;
  taskTitle: string;
  assignee: string;
  dueDate: string;
  daysRemaining: number;
  progressPercent: number;
  weightPercent: number;
  status: 'Đúng tiến độ' | 'Chậm tiến độ' | 'Hoàn thành';
}

const INITIAL_PROGRESS: TaskProgress[] = [];

export const PlanProgressModule: React.FC = () => {
  const [data, setData] = useState<TaskProgress[]>(INITIAL_PROGRESS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('plan_progress');
      if (active) setData(Array.isArray(updated) ? updated : []);
    });
    void dataService.refreshGenericData('plan_progress')
      .catch((error: any) => message.error(error?.response?.data?.message || 'Không tải được tiến độ kế hoạch.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; unsub(); };
  }, []);

  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'completed' | 'fast' | 'running'>('all');

  const [editingItem, setEditingItem] = useState<TaskProgress | null>(null);
  const [selectedTask, setSelectedTask] = useState<TaskProgress | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();

  const metrics = planProgressMetrics(data);

  const handleUpdateProgress = async (values: any) => {
    if (!editingItem || saving) return;
    setSaving(true);
    try {
      const updated = updatePlanProgress(editingItem, values.progressPercent);
      const saved = await dataService.updateGenericRecord('plan_progress', updated) as TaskProgress;
      setSelectedTask((current) => current?.key === saved.key ? saved : current);
      message.success(`Đã cập nhật tiến độ hạng mục: ${saved.taskTitle} -> ${saved.progressPercent}%`);
      setModalOpen(false);
      setEditingItem(null);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể cập nhật tiến độ.');
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = (records: TaskProgress[], filename: string) => downloadFile(filename, generateValidPdfBlob(
    'BÁO CÁO TIẾN ĐỘ KẾ HOẠCH', `${records.length} hạng mục`, records.map((record) =>
      `${record.code} | ${record.planName} | ${record.taskTitle} | ${record.progressPercent}% | Hạn ${record.dueDate} | ${planProgressStatus(record.progressPercent, record.dueDate)}`,
    ),
  ));

  const filteredData = data.filter((item) => {
    let matchTab = true;
    if (filterTab === 'completed') {
      matchTab = item.progressPercent === 100;
    } else if (filterTab === 'fast') {
      matchTab = item.progressPercent >= 80 && item.progressPercent < 100;
    } else if (filterTab === 'running') {
      matchTab = item.progressPercent < 80;
    }

    const matchSearch =
      (item.taskTitle || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.planName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assignee || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Mã nhiệm vụ',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => (
        <span style={{ fontWeight: 700, color: '#009688', fontFamily: 'monospace' }}>
          {code}
        </span>
      ),
    },
    {
      title: 'Kế hoạch & Nhiệm vụ thực hiện',
      key: 'task',
      render: (_: any, record: TaskProgress) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.taskTitle}</div>
          <div style={{ fontSize: 12, color: '#1E40AF', marginTop: 2 }}>
            Thuộc kế hoạch: <strong>{record.planName}</strong> · Tỷ trọng: {record.weightPercent}%
          </div>
        </div>
      ),
    },
    {
      title: 'Nhân sự phụ trách',
      dataIndex: 'assignee',
      key: 'assignee',
      width: 180,
      render: (a: string) => <span style={{ fontWeight: 500, color: '#0F172A', fontSize: 13 }}>{a}</span>,
    },
    {
      title: 'Tiến độ hoàn thành',
      dataIndex: 'progressPercent',
      key: 'progressPercent',
      width: 180,
      render: (pct: number) => {
        let color = '#009688';
        if (pct === 100) color = '#16A34A';
        else if (pct < 50) color = '#F59E0B';
        return (
          <div style={{ width: 150 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              <span style={{ color }}>{pct}%</span>
              <span style={{ color: '#64748B', fontWeight: 500 }}>{pct === 100 ? 'Xong' : 'Đang làm'}</span>
            </div>
            <div style={{ width: '100%', height: 6, borderRadius: 3, background: '#E2E8F0', overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
            </div>
          </div>
        );
      },
    },
    {
      title: 'Hạn chót & Thời gian',
      key: 'dueDate',
      width: 150,
      render: (_: any, record: TaskProgress) => {
        const daysRemaining = daysUntilDueDate(record.dueDate);
        return (
          <div style={{ fontSize: 12.5 }}>
            <div style={{ color: '#0F172A', fontWeight: 500 }}>{record.dueDate || 'Chưa đặt hạn'}</div>
            <div style={{ color: daysRemaining !== null && daysRemaining <= 3 ? '#DC2626' : '#64748B', fontWeight: daysRemaining !== null && daysRemaining <= 3 ? 700 : 400 }}>
              {record.progressPercent === 100 ? 'Đã hoàn tất' : daysRemaining === null ? 'Chưa có hạn hợp lệ' : daysRemaining < 0 ? `Quá ${Math.abs(daysRemaining)} ngày` : `Còn ${daysRemaining} ngày`}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (_: string, record: TaskProgress) => {
        const status = planProgressStatus(record.progressPercent, record.dueDate);
        let color: any = 'processing';
        if (status === 'Hoàn thành') color = 'success';
        if (status === 'Chậm tiến độ') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 170,
      render: (_: any, record: TaskProgress) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedTask(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingItem(record);
              form.setFieldsValue({ progressPercent: record.progressPercent });
              setModalOpen(true);
            }}
          >
            Cập nhật %
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiến độ tổng thể toàn doanh nghiệp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {metrics.averageProgress === null ? 'Chưa có dữ liệu' : `${metrics.averageProgress}% Hoàn thành`}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Tính theo tỷ trọng đã ghi nhận</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hạng mục đã hoàn thành 100%</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {metrics.completedCount} / {data.length} nhiệm vụ
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đã nghiệm thu và bàn giao thành công</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hạng mục đang trong tiến trình</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {metrics.runningCount} nhiệm vụ
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Chưa hoàn thành</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhiệm vụ quá hạn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: metrics.overdueCount ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {metrics.overdueCount} nhiệm vụ
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Tính từ hạn chót và tiến độ đã lưu</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả nhiệm vụ' },
            { key: 'completed', label: 'Hoàn thành 100%', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'fast', label: 'Tiến độ cao', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'running', label: 'Đang triển khai', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFilterTab(tab.key as any)}
              style={{
                backgroundColor: filterTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: filterTab === tab.key ? '#009688' : '#CBD5E1',
                color: filterTab === tab.key ? '#00796B' : '#475569',
                fontWeight: filterTab === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo nhiệm vụ, kế hoạch, nhân sự..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />

          <Button
            icon={<PrinterOutlined />}
            disabled={!filteredData.length}
            onClick={() => exportPdf(filteredData, 'Bao_cao_tien_do_ke_hoach.pdf')}
          >
            Tải PDF A4
          </Button>

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            disabled={!filteredData.length}
            onClick={() => downloadFile('Bao_cao_tien_do_ke_hoach.xlsx', generateValidXlsxBlob(planProgressExportRows(filteredData)))}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Xuất Excel
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          loading={loading}
          dataSource={filteredData}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* Modal Update Progress */}
      <Modal
        title={editingItem ? `Cập nhật tiến độ: ${editingItem.taskTitle}` : 'Cập nhật tiến độ'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={460}
      >
        <Form form={form} layout="vertical" onFinish={handleUpdateProgress} style={{ marginTop: 14 }}>
          <Form.Item
            name="progressPercent"
            label="Phần trăm hoàn thành"
            rules={[{ required: true, message: 'Vui lòng nhập phần trăm hoàn thành' }]}
          >
            <Input type="number" min={0} max={100} step={5} placeholder="Nhập từ 0 đến 100%" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu tiến độ
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi tiết tiến độ nhiệm vụ */}
      <Drawer
        title="Chi Tiết Hạng Mục Kế Hoạch & Tiến Độ"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
      >
        {selectedTask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ NHIỆM VỤ: {selectedTask.code}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {selectedTask.taskTitle}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Kế hoạch liên quan: <strong>{selectedTask.planName}</strong>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Thực Hiện &amp; SLA:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Nhân sự phụ trách:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedTask.assignee}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tỷ trọng trong kế hoạch:</span>
                  <span style={{ fontWeight: 700, color: '#1E40AF' }}>{selectedTask.weightPercent}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tiến độ thực tế:</span>
                  <span style={{ fontWeight: 700, color: '#16A34A' }}>{selectedTask.progressPercent}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Hạn chót hoàn thành:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedTask.dueDate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Trạng thái hiện thời:</span>
                  <Tag color={planProgressStatus(selectedTask.progressPercent, selectedTask.dueDate) === 'Hoàn thành' ? 'success' : planProgressStatus(selectedTask.progressPercent, selectedTask.dueDate) === 'Chậm tiến độ' ? 'error' : 'processing'}>
                    {planProgressStatus(selectedTask.progressPercent, selectedTask.dueDate)}
                  </Tag>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => {
                  setEditingItem(selectedTask);
                  form.setFieldsValue({ progressPercent: selectedTask.progressPercent });
                  setModalOpen(true);
                }}
              >
                Cập nhật tiến độ %
              </Button>
              <Button
                icon={<PrinterOutlined />}
                style={{ flex: 1 }}
                onClick={() => exportPdf([selectedTask], `${selectedTask.code}_tien_do.pdf`)}
              >
                In Phiếu (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

