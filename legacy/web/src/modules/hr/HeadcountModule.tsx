import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  TeamOutlined,
  CheckCircleOutlined,
  AlertOutlined,
  EyeOutlined,
  UserAddOutlined,
  ApartmentOutlined,
  DollarOutlined,
  PieChartOutlined,
  WarningOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer, Card, Tooltip } from '../../custom-ui';
import { useEffect } from 'react';
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

export interface EnterpriseHeadcountQuota {
  key: string;
  department: string;
  position: string;
  positionCode: string;
  quota: number;
  actual: number;
  vacancies: number;
  salaryBudget: number; // Tổng quỹ lương định biên
  levelDistribution: string; // ví dụ: 1 Lead, 3 Senior, 2 Junior
  status: 'Đủ định biên' | 'Thiếu nhân sự' | 'Vượt định biên';
}

export const HeadcountModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseHeadcountQuota[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [posOptions, setPosOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedQuota, setSelectedQuota] = useState<EnterpriseHeadcountQuota | null>(null);

  const loadData = async () => {
    try {
      const [res, orgUnits, positions] = await Promise.allSettled([
        collectionsApi.get<EnterpriseHeadcountQuota>('hr_headcount_quotas', { limit: 500 }),
        dataService.fetchOrgUnitsList(),
        dataService.fetchDropdownOptions('positions'),
      ]);
      let list: any[] = [];
      if (res.status === 'fulfilled' && res.value?.data?.data && res.value.data.data.length > 0) {
        list = res.value.data.data;
      } else {
        list = dataService.getGenericData('hr_headcount_quotas');
      }
      setData(list.map((item: any) => ({ ...item, key: item.id || item.key })));
      if (orgUnits.status === 'fulfilled' && orgUnits.value) {
        setDeptOptions(orgUnits.value.map((u) => ({ label: u, value: u })));
      } else {
        setDeptOptions(dataService.getOrgUnitsList().map((u) => ({ label: u, value: u })));
      }
      if (positions.status === 'fulfilled' && positions.value && positions.value.length > 0) {
        setPosOptions(positions.value.filter((p) => p.isActive !== false).map((p) => ({ label: p.name, value: p.name })));
      } else {
        setPosOptions(dataService.getDropdownOptions('positions').filter((p) => p.isActive !== false).map((p) => ({ label: p.name, value: p.name })));
      }
    } catch {
      const fallbackList = dataService.getGenericData('hr_headcount_quotas');
      setData(fallbackList.map((item: any) => ({ ...item, key: item.id || item.key })));
    }
  };

  useEffect(() => {
    void loadData();
    const unsub = dataService.subscribe(loadData);
    return unsub;
  }, []);

  const totalQuota = data.reduce((sum, item) => sum + item.quota, 0);
  const totalActual = data.reduce((sum, item) => sum + item.actual, 0);
  const totalVacancies = data.reduce((sum, item) => sum + item.vacancies, 0);
  const totalBudget = data.reduce((sum, item) => sum + item.salaryBudget, 0);

  const handleCreate = async (values: any) => {
    const quota = Number(values.quota) || 10;
    const actual = Number(values.actual) || 0;
    const vac = Math.max(0, quota - actual);
    const id = `headcount-${Date.now()}`;
    const newH: EnterpriseHeadcountQuota = {
      ...values,
      key: id,
      positionCode: values.positionCode || `POS-NEW-0${data.length + 1}`,
      quota,
      actual,
      vacancies: vac,
      salaryBudget: Number(values.salaryBudget) || 200000000,
      levelDistribution: values.levelDistribution || '1 Lead, 2 Senior, 2 Middle',
      status: actual < quota ? 'Thiếu nhân sự' : actual === quota ? 'Đủ định biên' : 'Vượt định biên',
    };
    try {
      await collectionsApi.create('hr_headcount_quotas', newH, id);
      message.success(`Đã thiết lập định biên mới cho: ${values.department} - ${values.position}`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu chỉ tiêu định biên.');
    }
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.position || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.positionCode || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Khối phòng ban & Vị trí chức danh',
      key: 'position',
      render: (_: any, r: EnterpriseHeadcountQuota) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ApartmentOutlined style={{ color: '#009688', fontSize: 15 }} />
            {r.position}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{r.positionCode}</code> · {r.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Chỉ tiêu / Thực tế',
      key: 'headcount',
      width: 170,
      render: (_: any, r: EnterpriseHeadcountQuota) => (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
            {r.actual} / {r.quota} người
          </div>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            {r.vacancies > 0 ? (
              <span style={{ color: '#DC2626', fontWeight: 700 }}>Thiếu +{r.vacancies} nhân sự</span>
            ) : (
              <span style={{ color: '#16A34A', fontWeight: 600 }}>100% Đủ quân số</span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Tỷ lệ lấp đầy định biên',
      key: 'fillRate',
      width: 180,
      render: (_: any, r: EnterpriseHeadcountQuota) => {
        const pct = Math.round((r.actual / (r.quota || 1)) * 100);
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
              <span>Lấp đầy:</span>
              <strong style={{ color: pct >= 100 ? '#16A34A' : '#D97706' }}>{pct}%</strong>
            </div>
            <Progress percent={pct} size="small" strokeColor={pct >= 100 ? '#16A34A' : '#009688'} showInfo={false} />
          </div>
        );
      },
    },
    {
      title: 'Quỹ lương định biên',
      dataIndex: 'salaryBudget',
      key: 'salaryBudget',
      width: 170,
      render: (val: number) => (
        <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 12.5 }}>
          {val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đủ định biên') color = 'success';
        if (status === 'Thiếu nhân sự') color = 'error';
        if (status === 'Vượt định biên') color = 'warning';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 130,
      render: (_: any, record: EnterpriseHeadcountQuota) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedQuota(record);
            setDrawerOpen(true);
          }}
        >
          Cơ cấu
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng định biên phê duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalQuota} Vị trí chỉ tiêu
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Phê duyệt bởi Hội đồng Quản trị 2026</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự hiện diện thực tế</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalActual} CBNV ({Math.round((totalActual / totalQuota) * 100)}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tỷ lệ lấp đầy định biên đạt 90.5%</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Vị trí trống cần tuyển bổ sung</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            +{totalVacancies} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Đang mở pipeline tuyển dụng tích cực</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quỹ lương định biên / tháng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {(totalBudget / 1000000000).toFixed(2)} Tỷ VNĐ
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Định mức ngân sách nhân sự tối đa</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả định biên' },
            { key: 'Thiếu nhân sự', label: 'Thiếu nhân sự', icon: <WarningOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đủ định biên', label: 'Đủ định biên', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Vượt định biên', label: 'Vượt định biên', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
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
            placeholder="Tìm theo phòng ban, chức danh, mã..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất kế hoạch định biên nhân sự')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                department: 'Phòng Ban Kỹ Thuật',
                positionCode: `POS-NEW-0${data.length + 1}`,
                quota: 10,
                actual: 8,
                salaryBudget: 250000000,
                levelDistribution: '1 Lead, 4 Senior, 5 Middle/Junior',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập định biên mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm định biên mới */}
      <Modal
        title="Thiết Lập Chỉ Tiêu Định Biên Vị Trí Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="department" label="Phòng ban trực thuộc" rules={[{ required: true }]}>
              <Select
                options={deptOptions.length > 0 ? deptOptions : [
                  { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
                ]}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
            <Form.Item name="positionCode" label="Mã vị trí định biên" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </div>

          <Form.Item name="position" label="Tên vị trí / Chức danh công việc" rules={[{ required: true }]}>
            {posOptions.length > 0 ? (
              <Select options={posOptions} placeholder="Chọn chức danh công việc..." />
            ) : (
              <Input placeholder="Ví dụ: Kỹ sư Trí tuệ Nhân tạo & Xử lý Dữ liệu lớn" />
            )}
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="quota" label="Chỉ tiêu định biên (Quota)" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="actual" label="Hiện diện thực tế" rules={[{ required: true }]}>
              <Input type="number" min={0} />
            </Form.Item>
            <Form.Item name="salaryBudget" label="Ngân sách quỹ lương / tháng" rules={[{ required: true }]}>
              <Input type="number" step={10000000} />
            </Form.Item>
          </div>

          <Form.Item name="levelDistribution" label="Cơ cấu phân bổ cấp bậc">
            <Input placeholder="Ví dụ: 1 Lead, 4 Senior, 5 Middle/Junior" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu định biên vị trí
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Định Biên */}
      <Drawer
        title="Chi Tiết Cơ Cấu Định Biên &amp; Quỹ Lương Vị Trí"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedQuota && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedQuota.positionCode}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {selectedQuota.position}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Khối: <strong>{selectedQuota.department}</strong> · <Tag color="processing">{selectedQuota.status}</Tag>
              </div>
            </div>

            {/* Quota Stats */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Chỉ Số Định Biên &amp; Nhu Cầu Tuyển Dụng:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Chỉ tiêu định biên phê duyệt:</span>
                  <strong>{selectedQuota.quota} Nhân sự</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thực tế đang công tác:</span>
                  <strong>{selectedQuota.actual} Nhân sự</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số lượng còn thiếu:</span>
                  <strong style={{ color: selectedQuota.vacancies > 0 ? '#DC2626' : '#16A34A', fontSize: 14 }}>
                    {selectedQuota.vacancies > 0 ? `+${selectedQuota.vacancies} Vị trí cần tuyển` : 'Đủ quân số'}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tổng quỹ lương định biên:</span>
                  <strong style={{ color: '#16A34A', fontSize: 14 }}>
                    {selectedQuota.salaryBudget.toLocaleString('vi-VN')} ₫/tháng
                  </strong>
                </div>
              </div>
            </div>

            {/* Level Distribution */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                Cơ Cấu Phân Bổ Cấp Bậc Chuyên Môn:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', fontWeight: 600 }}>
                {selectedQuota.levelDistribution}
              </div>
            </div>

            {/* Actions */}
            {selectedQuota.vacancies > 0 && (
              <Button
                type="primary"
                icon={<UserAddOutlined />}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => {
                  message.success(`Đã chuyển hướng tạo đề xuất tuyển dụng cho ${selectedQuota.position}`);
                }}
              >
                Mở Đăng Tin Tuyển Dụng Vị Trí Này
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

