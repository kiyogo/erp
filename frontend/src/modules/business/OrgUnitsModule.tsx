import React, { useEffect, useMemo, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  EditOutlined,
  DeleteOutlined,
  ApartmentOutlined,
  TeamOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer } from '../../custom-ui';
import { collectionsApi, employeesApi, type EnterpriseEmployee } from '../../api/endpoints';

export interface EnterpriseOrgUnit {
  key: string;
  code: string;
  name: string;
  parentUnit: string;
  manager: string;
  managerTitle: string;
  managerEmail: string;
  managerPhone: string;
  headcountLimit: number;
  actualHeadcount: number;
  location: string;
  establishedDate: string;
  costCenterCode: string;
  annualBudget: number;
  budgetSpent: number;
  status: 'Đang hoạt động' | 'Tái cấu trúc' | 'Tạm ngưng';
}

type OrgUnitRecord = Partial<EnterpriseOrgUnit> & { key?: string };

const normalizeText = (value?: string) => String(value || '').trim().toLowerCase();

const codeFromName = (name: string) => {
  const compact = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((part) => part.slice(0, 3))
    .join('');
  return compact.slice(0, 12) || `DV${Date.now().toString().slice(-4)}`;
};

const inferLocation = (name: string) => {
  const normalized = normalizeText(name);
  if (normalized.includes('hồ chí minh') || normalized.includes('ho chi minh') || normalized.includes('hcm')) return 'TP. Hồ Chí Minh';
  if (normalized.includes('hà nội') || normalized.includes('ha noi') || normalized.includes('hn')) return 'Hà Nội';
  return 'Chưa cập nhật';
};

const rankEmployee = (employee: EnterpriseEmployee) => {
  const position = normalizeText(employee.position);
  if (position.includes('tổng giám đốc') || position.includes('ceo')) return 1;
  if (position.includes('giám đốc')) return 2;
  if (position.includes('trưởng')) return 3;
  if (position.includes('lead')) return 4;
  return 5;
};

const findManager = (employees: EnterpriseEmployee[]) => {
  const sorted = [...employees].sort((left, right) => rankEmployee(left) - rankEmployee(right));
  const manager = sorted[0];
  return {
    manager: manager?.name || 'Chưa phân công',
    managerTitle: manager?.position || 'Chưa cập nhật',
    managerEmail: manager?.email || 'Chưa cập nhật',
    managerPhone: manager?.phone || 'Chưa cập nhật',
  };
};

const safePercent = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

export const OrgUnitsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseOrgUnit[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<EnterpriseOrgUnit | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<EnterpriseOrgUnit | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [employeeRes, unitRes] = await Promise.all([
        employeesApi.getAll(),
        collectionsApi.get<OrgUnitRecord>('org_units'),
      ]);

      const employeeRows = employeeRes.data.data || [];
      const storedUnits = unitRes.data.data || [];
      const activeEmployees = employeeRows.filter((item) => item.status !== 'Đã nghỉ việc');
      const grouped = new Map<string, EnterpriseEmployee[]>();

      activeEmployees.forEach((employee) => {
        const departmentName = String(employee.department || '').trim() || 'Chưa phân bổ';
        const list = grouped.get(departmentName) || [];
        list.push(employee);
        grouped.set(departmentName, list);
      });

      const unitsByName = new Map(storedUnits.map((item) => [normalizeText(item.name), item]));
      const merged = Array.from(grouped.entries()).map(([name, members], index) => {
        const stored = unitsByName.get(normalizeText(name));
        const managerInfo = findManager(members);
        const headcountLimit = Math.max(Number(stored?.headcountLimit || 0), members.length);
        return {
          key: String(stored?.key || stored?.code || name || index),
          code: String(stored?.code || codeFromName(name)),
          name,
          parentUnit: String(stored?.parentUnit || 'Doanh nghiệp'),
          manager: String(stored?.manager || managerInfo.manager),
          managerTitle: String(stored?.managerTitle || managerInfo.managerTitle),
          managerEmail: String(stored?.managerEmail || managerInfo.managerEmail),
          managerPhone: String(stored?.managerPhone || managerInfo.managerPhone),
          headcountLimit,
          actualHeadcount: members.length,
          location: String(stored?.location || inferLocation(name)),
          establishedDate: String(stored?.establishedDate || members.map((item) => item.joinDate).filter(Boolean).sort()[0] || ''),
          costCenterCode: String(stored?.costCenterCode || `CC-${codeFromName(name)}`),
          annualBudget: Number(stored?.annualBudget || 0),
          budgetSpent: Number(stored?.budgetSpent || 0),
          status: (stored?.status as EnterpriseOrgUnit['status']) || 'Đang hoạt động',
        } satisfies EnterpriseOrgUnit;
      });

      setData(merged.sort((left, right) => left.name.localeCompare(right.name, 'vi')));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải danh sách đơn vị tổ chức.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const persistUnits = async (units: EnterpriseOrgUnit[]) => {
    setData(units);
    await collectionsApi.replace('org_units', units);
  };

  const totalUnits = data.length;
  const totalHeadcountLimit = data.reduce((sum, item) => sum + item.headcountLimit, 0);
  const totalActualHeadcount = data.reduce((sum, item) => sum + item.actualHeadcount, 0);
  const totalBudget = data.reduce((sum, item) => sum + item.annualBudget, 0);
  const activeLocations = useMemo(
    () => new Set(data.map((item) => item.location).filter((item) => item && item !== 'Chưa cập nhật')).size,
    [data],
  );

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const keyword = searchText.toLowerCase();
    const matchSearch =
      (item.name || '').toLowerCase().includes(keyword) ||
      (item.code || '').toLowerCase().includes(keyword) ||
      (item.manager || '').toLowerCase().includes(keyword) ||
      (item.location || '').toLowerCase().includes(keyword);
    return matchStatus && matchSearch;
  });

  const handleCreateOrUpdate = async (values: any) => {
    try {
      const normalized: EnterpriseOrgUnit = {
        key: editingUnit?.key || String(Date.now()),
        code: String(values.code || codeFromName(values.name)),
        name: String(values.name || '').trim(),
        parentUnit: String(values.parentUnit || 'Doanh nghiệp'),
        manager: String(values.manager || 'Chưa phân công'),
        managerTitle: String(values.managerTitle || 'Chưa cập nhật'),
        managerEmail: String(values.managerEmail || 'Chưa cập nhật'),
        managerPhone: String(values.managerPhone || 'Chưa cập nhật'),
        headcountLimit: Number(values.headcountLimit) || 0,
        actualHeadcount: editingUnit?.actualHeadcount || 0,
        location: String(values.location || 'Chưa cập nhật'),
        establishedDate: String(values.establishedDate || editingUnit?.establishedDate || ''),
        costCenterCode: String(values.costCenterCode || `CC-${codeFromName(values.name)}`),
        annualBudget: Number(values.annualBudget) || 0,
        budgetSpent: Number(values.budgetSpent) || editingUnit?.budgetSpent || 0,
        status: (values.status || 'Đang hoạt động') as EnterpriseOrgUnit['status'],
      };

      const next = editingUnit
        ? data.map((item) => (item.key === editingUnit.key ? { ...item, ...normalized } : item))
        : [...data, normalized];

      await persistUnits(next);
      message.success(editingUnit ? `Đã cập nhật đơn vị: ${normalized.name}` : `Đã thêm đơn vị: ${normalized.name}`);
      setModalOpen(false);
      setEditingUnit(null);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu đơn vị tổ chức.');
    }
  };

  const handleDelete = (unit: EnterpriseOrgUnit) => {
    Modal.confirm({
      title: 'Xác nhận xóa đơn vị tổ chức?',
      content: `Bạn có chắc chắn muốn xóa đơn vị "${unit.name}" không?`,
      okText: 'Xóa đơn vị',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await persistUnits(data.filter((item) => item.key !== unit.key));
          message.success(`Đã xóa đơn vị ${unit.name}`);
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể xóa đơn vị.');
        }
      },
    });
  };

  const columns = [
    {
      title: 'Mã & Tên Đơn Vị',
      key: 'name',
      width: 220,
      render: (_: any, record: EnterpriseOrgUnit) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ApartmentOutlined style={{ color: '#009688', fontSize: 16 }} />
            {record.name}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2, fontWeight: 600 }}>
            Mã: <code>{record.code}</code> · Trung tâm chi phí: <code>{record.costCenterCode}</code>
          </div>
        </div>
      ),
    },
    {
      title: 'Lãnh đạo phụ trách',
      key: 'manager',
      width: 200,
      render: (_: any, record: EnterpriseOrgUnit) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 12.5 }}>{record.manager}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.managerTitle}</div>
          <div style={{ fontSize: 11, color: '#2563EB', marginTop: 2 }}>{record.managerPhone}</div>
        </div>
      ),
    },
    {
      title: 'Định biên nhân sự',
      key: 'headcount',
      width: 170,
      render: (_: any, record: EnterpriseOrgUnit) => {
        const fillRate = safePercent(record.actualHeadcount, record.headcountLimit);
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
              <span>
                <strong>{record.actualHeadcount}</strong> / {record.headcountLimit} người
              </span>
              <strong style={{ color: '#009688' }}>{fillRate}%</strong>
            </div>
            <Progress percent={fillRate} size="small" strokeColor={fillRate > 80 ? '#16A34A' : '#009688'} showInfo={false} />
          </div>
        );
      },
    },
    {
      title: 'Ngân sách năm',
      dataIndex: 'annualBudget',
      key: 'annualBudget',
      width: 160,
      render: (budget: number) => (
        <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
          {budget > 0 ? `${(budget / 1_000_000_000).toFixed(2)} tỷ ₫` : 'Chưa cập nhật'}
        </span>
      ),
    },
    {
      title: 'Địa điểm làm việc',
      dataIndex: 'location',
      key: 'location',
      width: 220,
      render: (location: string) => (
        <span style={{ fontSize: 12, color: '#475569' }}>
          <EnvironmentOutlined style={{ color: '#E11D48', marginRight: 4 }} />
          {location || 'Chưa cập nhật'}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => <Tag color={status === 'Đang hoạt động' ? 'success' : 'warning'}>{status}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 140,
      render: (_: any, record: EnterpriseOrgUnit) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedUnit(record); setDrawerOpen(true); }}>
            Xem
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => { setEditingUnit(record); form.setFieldsValue(record); setModalOpen(true); }} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
        </div>
      ),
    },
  ];

  return (
    <div className="k-page-container">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số phòng ban &amp; đơn vị</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>{totalUnits} đơn vị</div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Tổng hợp theo dữ liệu phòng ban đang có nhân sự hoạt động</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Định biên &amp; nhân sự hiện hữu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalActualHeadcount} / {totalHeadcountLimit} nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
            Tỷ lệ lấp đầy định biên: {safePercent(totalActualHeadcount, totalHeadcountLimit)}%
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng ngân sách vận hành</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalBudget > 0 ? `${(totalBudget / 1_000_000_000).toFixed(1)} Tỷ VNĐ` : 'Chưa cập nhật'}
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đồng bộ từ cấu hình đơn vị đã lưu</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Địa điểm hoạt động</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>{activeLocations}</div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Đếm từ các đơn vị đã khai báo địa điểm rõ ràng</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đơn vị' },
            { key: 'Đang hoạt động', label: 'Đang hoạt động' },
            { key: 'Tái cấu trúc', label: 'Tái cấu trúc' },
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên phòng ban, mã đơn vị, người quản lý..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            style={{ width: 280, maxWidth: '100%' }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã chuẩn bị danh sách đơn vị từ dữ liệu hiện có.')} disabled={!data.length}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingUnit(null);
              form.resetFields();
              form.setFieldsValue({
                code: `DV-${Date.now().toString().slice(-4)}`,
                parentUnit: 'Doanh nghiệp',
                status: 'Đang hoạt động',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm đơn vị mới
          </Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} loading={loading} pagination={{ pageSize: 8 }} />
      </div>

      <Modal title={editingUnit ? 'Chỉnh sửa thông tin đơn vị tổ chức' : 'Thêm mới đơn vị phòng ban'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={680}>
        <Form form={form} layout="vertical" onFinish={handleCreateOrUpdate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã đơn vị" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="parentUnit" label="Đơn vị cấp trên" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="costCenterCode" label="Mã trung tâm chi phí"><Input /></Form.Item>
          </div>

          <Form.Item name="name" label="Tên đơn vị / phòng ban" rules={[{ required: true, message: 'Nhập tên phòng ban' }]}><Input /></Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="manager" label="Trưởng phòng / phụ trách" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="managerTitle" label="Chức danh phụ trách" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="managerPhone" label="Số điện thoại liên hệ"><Input /></Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="managerEmail" label="Email phụ trách"><Input /></Form.Item>
            <Form.Item name="headcountLimit" label="Định biên nhân sự"><Input type="number" min={0} /></Form.Item>
            <Form.Item name="annualBudget" label="Ngân sách năm (VNĐ)"><Input type="number" min={0} step={1000000} /></Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Form.Item name="location" label="Địa điểm làm việc"><Input /></Form.Item>
            <Form.Item name="status" label="Trạng thái">
              <Select options={[{ label: 'Đang hoạt động', value: 'Đang hoạt động' }, { label: 'Tái cấu trúc', value: 'Tái cấu trúc' }, { label: 'Tạm ngưng', value: 'Tạm ngưng' }]} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingUnit ? 'Lưu thay đổi' : 'Thêm mới đơn vị'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Drawer title="Hồ sơ đơn vị phòng ban & chỉ số vận hành" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={620}>
        {selectedUnit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedUnit.code} · {selectedUnit.costCenterCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{selectedUnit.name}</div>
                </div>
                <Tag color={selectedUnit.status === 'Đang hoạt động' ? 'success' : 'warning'}>{selectedUnit.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                Trực thuộc: <strong>{selectedUnit.parentUnit}</strong> · Ngày thành lập: <strong>{selectedUnit.establishedDate || 'Chưa cập nhật'}</strong>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserOutlined style={{ color: '#009688' }} /> Lãnh đạo phụ trách đơn vị
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div><span style={{ color: '#64748B' }}>Họ và tên:</span><div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedUnit.manager}</div></div>
                <div><span style={{ color: '#64748B' }}>Chức danh:</span><div style={{ fontWeight: 700, color: '#2563EB' }}>{selectedUnit.managerTitle}</div></div>
                <div><span style={{ color: '#64748B' }}>Email:</span><div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedUnit.managerEmail}</div></div>
                <div><span style={{ color: '#64748B' }}>Số điện thoại:</span><div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedUnit.managerPhone}</div></div>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TeamOutlined style={{ color: '#2563EB' }} /> Định biên &amp; nhân sự hiện có
                </div>
                <strong>{selectedUnit.actualHeadcount} / {selectedUnit.headcountLimit} nhân sự</strong>
              </div>
              <Progress percent={safePercent(selectedUnit.actualHeadcount, selectedUnit.headcountLimit)} strokeColor="#009688" />
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DollarOutlined style={{ color: '#16A34A' }} /> Ngân sách vận hành
                </div>
                <strong style={{ color: '#16A34A' }}>
                  {selectedUnit.annualBudget > 0 ? `${(selectedUnit.budgetSpent / 1_000_000_000).toFixed(2)} / ${(selectedUnit.annualBudget / 1_000_000_000).toFixed(2)} tỷ ₫` : 'Chưa cập nhật'}
                </strong>
              </div>
              <Progress percent={safePercent(selectedUnit.budgetSpent, selectedUnit.annualBudget)} strokeColor="#16A34A" />
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Địa điểm làm việc</div>
              <div style={{ fontSize: 13, color: '#334155' }}>
                <EnvironmentOutlined style={{ color: '#E11D48', marginRight: 6 }} />
                {selectedUnit.location || 'Chưa cập nhật'}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
