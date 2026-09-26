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
import { dataService } from '../../services/dataService';


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

const getEmployeePositions = (employee: EnterpriseEmployee): string[] => {
  if (Array.isArray(employee?.position)) return employee.position.filter(Boolean);
  if (typeof employee?.position === 'string') return employee.position.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};

const getEmployeeDepartments = (employee: EnterpriseEmployee): string[] => {
  if (Array.isArray(employee?.department)) return employee.department.filter(Boolean);
  if (typeof employee?.department === 'string') return employee.department.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};

const rankEmployee = (employee: EnterpriseEmployee) => {
  const positions = getEmployeePositions(employee).map(normalizeText);
  const posText = positions.join(' ');
  if (posText.includes('tổng giám đốc') || posText.includes('ceo')) return 1;
  if (posText.includes('phó tổng giám đốc')) return 2;
  if (posText.includes('giám đốc')) return 3;
  if (posText.includes('trưởng')) return 4;
  if (posText.includes('phó phòng') || posText.includes('phó')) return 5;
  if (posText.includes('lead')) return 6;
  if (posText.includes('kỹ sư')) return 7;
  if (posText.includes('chuyên viên')) return 8;
  return 9;
};

const safePercent = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

const isSuperAdmin = (item: any) =>
  item?.role === 'ADMIN' ||
  item?.role === 'Super Admin' ||
  item?.code === 'ADMIN-001' ||
  item?.employeeCode === 'ADMIN-001' ||
  (item?.email && (item.email.toLowerCase().includes('admin') || item.email.toLowerCase() === 'tung@kiyovn.local'));

export const OrgUnitsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseOrgUnit[]>([]);
  const [employeesList, setEmployeesList] = useState<EnterpriseEmployee[]>([]);
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
      let employeeRows: EnterpriseEmployee[] = [];
      try {
        const employeeRes = await employeesApi.getAll();
        employeeRows = employeeRes.data?.data || [];
      } catch {
        employeeRows = (dataService.getEmployees() as any) || [];
      }

      const validEmployees = employeeRows.filter((item: any) => !isSuperAdmin(item));
      setEmployeesList(validEmployees);

      let storedUnits: any[] = [];
      try {
        const unitRes = await collectionsApi.get<OrgUnitRecord>('business_org_units');
        storedUnits = unitRes.data?.data || [];
      } catch {
        storedUnits = (dataService.getGenericData('business_org_units') as any[]) || [];
      }

      if (!storedUnits || storedUnits.length === 0) {
        const fallback = dataService.getGenericData('business_org_units');
        if (Array.isArray(fallback) && fallback.length > 0) {
          storedUnits = fallback;
        }
      }

      const unitsSource = (storedUnits && storedUnits.length > 0)
        ? storedUnits
        : [
            { key: 'ou-1', code: 'BGD', name: 'Ban Giám Đốc', status: 'Đang hoạt động' as const },
            { key: 'ou-2', code: 'KT', name: 'Kỹ Thuật', status: 'Đang hoạt động' as const },
            { key: 'ou-3', code: 'PKT', name: 'Phòng Kỹ Thuật', status: 'Đang hoạt động' as const },
          ];

      // Strict deduplication of stored units by normalized name
      const seenNames = new Set<string>();
      const deduplicatedUnits: any[] = [];
      for (const u of unitsSource) {
        const n = normalizeText(u?.name);
        if (!n || seenNames.has(n)) continue;
        seenNames.add(n);
        deduplicatedUnits.push(u);
      }

      const merged = deduplicatedUnits.map((stored, index) => {
        const name = String(stored.name || '').trim();
        // Tìm tất cả nhân sự thuộc chính xác đơn vị này
        const members = validEmployees.filter((emp) => {
          const depts = getEmployeeDepartments(emp);
          return depts.some((d) => normalizeText(d) === normalizeText(name));
        });

        // 1. Xác định Trưởng đơn vị (Bảo toàn dữ liệu đã lưu, không tự động gán ngẫu nhiên):
        const storedManager = String(stored.manager || '').trim();
        let managerInfo = {
          manager: storedManager || 'Chưa phân công',
          managerTitle: stored.managerTitle || 'Chưa cập nhật',
          managerEmail: stored.managerEmail || 'Chưa cập nhật',
          managerPhone: stored.managerPhone || 'Chưa cập nhật',
        };

        if (storedManager && storedManager !== 'Chưa phân công') {
          const found = validEmployees.find((e) => e.name === storedManager || e.code === storedManager);
          if (found) {
            const pos = getEmployeePositions(found);
            managerInfo.manager = found.name;
            if (!stored.managerTitle || stored.managerTitle === 'Chưa cập nhật') {
              managerInfo.managerTitle = pos.length > 0 ? pos.join(', ') : 'Trưởng đơn vị';
            }
          }
        }

        const headcountLimit = Math.max(Number(stored?.headcountLimit || 0), members.length);
        return {
          key: String(stored?.key || stored?.code || name || index),
          code: String(stored?.code || codeFromName(name)),
          name,
          parentUnit: String(stored?.parentUnit || ''),
          manager: managerInfo.manager,
          managerTitle: managerInfo.managerTitle,
          managerEmail: managerInfo.managerEmail,
          managerPhone: managerInfo.managerPhone,
          headcountLimit,
          actualHeadcount: members.length,
          location: String(stored?.location || inferLocation(name)),
          establishedDate: String(stored?.establishedDate || members.map((item) => item.joinDate).filter(Boolean).sort()[0] || ''),
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
    const unsub = dataService.subscribe(() => {
      void loadData();
    });
    return unsub;
  }, []);

  // 1. Dynamic Dropdown Options for Parent Org Unit (Đơn vị cấp trên)
  const parentUnitOptions = useMemo(() => {
    const editingName = normalizeText(editingUnit?.name);
    const unitNames = data
      .map((d) => String(d.name || '').trim())
      .filter((name) => name && normalizeText(name) !== editingName);
    return Array.from(new Set(unitNames))
      .sort((left, right) => left.localeCompare(right, 'vi'))
      .map((name) => ({ label: name, value: name }));
  }, [data, editingUnit?.name]);

  // 2. Dynamic Dropdown Options for Unit Head (Trưởng đơn vị)
  const employeeOptions = useMemo(() => {
    return employeesList.map((emp) => ({
      label: `${emp.name} (${emp.code})`,
      value: `${emp.name} (${emp.code})`,
    }));
  }, [employeesList]);

  const persistUnits = async (nextData: EnterpriseOrgUnit[]) => {
    // Strict deduplication by normalized name
    const seen = new Set<string>();
    const uniqueList = nextData.filter((item) => {
      const n = normalizeText(item.name);
      if (!n || seen.has(n)) return false;
      seen.add(n);
      return true;
    });

    setData(uniqueList);
    const payload = uniqueList.map((item) => ({
      key: item.key,
      code: item.code,
      name: item.name,
      parentUnit: item.parentUnit,
      manager: item.manager,
      managerTitle: item.managerTitle,
      managerEmail: item.managerEmail,
      managerPhone: item.managerPhone,
      headcountLimit: item.headcountLimit,
      location: item.location,
      establishedDate: item.establishedDate,
      annualBudget: item.annualBudget,
      budgetSpent: item.budgetSpent,
      status: item.status,
    }));
    try {
      await collectionsApi.save('business_org_units', payload);
    } catch {
      // safe fallback
    }
    dataService.saveGenericData('business_org_units', payload);
  };

  const filteredData = useMemo(() => {
    const keyword = normalizeText(searchText);
    return data.filter((item) => {
      const matchKeyword =
        !keyword ||
        normalizeText(item.name).includes(keyword) ||
        normalizeText(item.code).includes(keyword) ||
        normalizeText(item.manager).includes(keyword) ||
        normalizeText(item.parentUnit).includes(keyword);
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      return matchKeyword && matchStatus;
    });
  }, [data, searchText, statusFilter]);

  const totalUnits = data.length;
  const totalActualHeadcount = data.reduce((acc, curr) => acc + curr.actualHeadcount, 0);
  const totalHeadcountLimit = data.reduce((acc, curr) => acc + curr.headcountLimit, 0);
  const totalBudget = data.reduce((acc, curr) => acc + curr.annualBudget, 0);
  const activeLocations = Array.from(new Set(data.map((item) => item.location).filter((loc) => loc && loc !== 'Chưa cập nhật'))).length;

  const handleCreateOrUpdate = async (values: any) => {
    try {
      const selectedManager = String(values.manager || '').trim();
      const codeMatch = selectedManager.match(/\(([^)]+)\)/);
      const extractedCode = codeMatch ? codeMatch[1].trim() : '';
      const emp = employeesList.find((e) => (extractedCode && e.code === extractedCode) || e.name === selectedManager || e.code === selectedManager);
      const managerPos = emp
        ? getEmployeePositions(emp).join(', ')
        : (editingUnit?.managerTitle || '');
      const managerEmail = values.managerEmail ? String(values.managerEmail).trim() : 'Chưa cập nhật';
      const managerPhone = values.managerPhone ? String(values.managerPhone).trim() : 'Chưa cập nhật';
      const managerName = emp ? emp.name : (selectedManager.replace(/\s*\([^)]*\)/, '').trim() || 'Chưa phân công');

      const unitName = String(values.name || '').trim();
      const actualCount = employeesList.filter((e) => {
        const depts = getEmployeeDepartments(e);
        return depts.some((d) => normalizeText(d) === normalizeText(unitName));
      }).length;

      const normalized: EnterpriseOrgUnit = {
        key: editingUnit?.key || String(Date.now()),
        code: String(values.code || codeFromName(values.name)),
        name: unitName,
        parentUnit: String(values.parentUnit || '').trim(),
        manager: managerName,
        managerTitle: managerPos || 'Chưa cập nhật',
        managerEmail: managerEmail,
        managerPhone: managerPhone,
        headcountLimit: Math.max(Number(values.headcountLimit) || 0, actualCount),
        actualHeadcount: actualCount,
        location: String(values.location || inferLocation(unitName)),
        establishedDate: String(values.establishedDate || editingUnit?.establishedDate || ''),
        annualBudget: Number(values.annualBudget) || 0,
        budgetSpent: Number(values.budgetSpent) || editingUnit?.budgetSpent || 0,
        status: (values.status || 'Đang hoạt động') as EnterpriseOrgUnit['status'],
      };

      const next = editingUnit
        ? data.map((item) => (item.key === editingUnit.key || normalizeText(item.name) === normalizeText(editingUnit.name) ? { ...item, ...normalized } : item))
        : [...data, normalized];

      await persistUnits(next);

      // Auto-assign unit to employee's department when assigned as Unit Manager
      if (emp && unitName) {
        const empDepts = getEmployeeDepartments(emp);
        const hasUnit = empDepts.some((d) => normalizeText(d) === normalizeText(unitName));
        if (!hasUnit) {
          const nextDepts = [...empDepts, unitName];
          const nextDeptStr = nextDepts.join(', ');
          const empId = emp.id || emp.key;
          try {
            await employeesApi.update(empId, { department: nextDeptStr } as any);
          } catch {}
          dataService.updateEmployee(emp.key || emp.id, { department: nextDeptStr });
          emp.department = nextDeptStr;
        }
      }

      message.success(editingUnit ? `Đã cập nhật đơn vị: ${normalized.name}` : `Đã thêm đơn vị: ${normalized.name}`);
      setModalOpen(false);
      setEditingUnit(null);
      form.resetFields();
    } catch (error: any) {
      console.error('Save org unit error:', error);
      message.error(error?.response?.data?.message || 'Không thể lưu đơn vị tổ chức.');
    }
  };

  const handleDelete = (unit: EnterpriseOrgUnit) => {
    Modal.confirm({
      title: 'Xác nhận xóa đơn vị tổ chức?',
      content: `Bạn có chắc chắn muốn xóa đơn vị "${unit.name}" không? Toàn bộ nhân sự thuộc đơn vị này sẽ được giải phóng về trạng thái chưa phân bổ phòng ban.`,
      okText: 'Xóa đơn vị',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          const nextUnits = data.filter((item) => item.key !== unit.key && normalizeText(item.name) !== normalizeText(unit.name));
          await persistUnits(nextUnits);
          // Cập nhật nhân sự thuộc phòng ban bị xóa về trạng thái chưa phân bổ
          const affectedEmployees = employeesList.filter((e) => {
            const depts = getEmployeeDepartments(e);
            return depts.some((d) => normalizeText(d) === normalizeText(unit.name));
          });
          if (affectedEmployees.length > 0) {
            await Promise.allSettled(
              affectedEmployees.map((emp) => {
                const updatedDepts = getEmployeeDepartments(emp).filter((d) => normalizeText(d) !== normalizeText(unit.name));
                return employeesApi.update(emp.id, { department: updatedDepts.join(', ') });
              })
            );
          }
          message.success(`Đã xóa đơn vị ${unit.name}`);
        } catch (error: any) {
          console.error('handleDelete error:', error);
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
            Mã: <code>{record.code}</code> · Trực thuộc: <code>{record.parentUnit || 'Cấp cao nhất'}</code>
          </div>
        </div>
      ),
    },
    {
      title: 'Trưởng đơn vị',
      key: 'manager',
      width: 200,
      render: (_: any, record: EnterpriseOrgUnit) => {
        const emp = employeesList.find((e) => e.name === record.manager || e.code === record.manager);
        const managerName = emp?.name || record.manager || 'Chưa phân công';
        const managerPos = emp ? getEmployeePositions(emp).join(', ') : record.managerTitle;
        const managerPhone = record.managerPhone;

        return (
          <div>
            <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserOutlined style={{ color: managerName !== 'Chưa phân công' ? '#009688' : '#94A3B8' }} />
              {managerName}
            </div>
            {managerPos && managerPos !== 'Chưa cập nhật' && (
              <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 1 }}>{managerPos}</div>
            )}
            {managerPhone && managerPhone !== 'Chưa cập nhật' && (
              <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>{managerPhone}</div>
            )}
          </div>
        );
      },
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
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingUnit(record);
              const emp = employeesList.find((e) => e.name === record.manager || e.code === record.manager);
              const managerVal = emp ? `${emp.name} (${emp.code})` : (record.manager || undefined);
              form.setFieldsValue({
                ...record,
                manager: managerVal,
                managerPhone: record.managerPhone === 'Chưa cập nhật' ? '' : record.managerPhone,
                managerEmail: record.managerEmail === 'Chưa cập nhật' ? '' : record.managerEmail,
              });
              setModalOpen(true);
            }}
          />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
        </div>
      ),
    },
  ];

  const selectedUnitMembers = useMemo(() => {
    if (!selectedUnit) return [];
    return employeesList.filter((e) => {
      const depts = getEmployeeDepartments(e);
      return depts.some((d) => normalizeText(d) === normalizeText(selectedUnit.name) || normalizeText(d).includes(normalizeText(selectedUnit.name)) || normalizeText(selectedUnit.name).includes(normalizeText(d)));
    });
  }, [selectedUnit, employeesList]);

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
            placeholder="Tìm theo tên phòng ban, mã đơn vị, trưởng đơn vị..."
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã đơn vị" rules={[{ required: true, message: 'Nhập mã đơn vị' }]}><Input placeholder="VD: DV-TECH" /></Form.Item>
            <Form.Item name="parentUnit" label="Đơn vị cấp trên">
              <Select
                showSearch
                allowClear
                placeholder="Chọn đơn vị cấp trên..."
                options={parentUnitOptions}
                filterOption={(input, option) =>
                  (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
          </div>

          <Form.Item name="name" label="Tên đơn vị / phòng ban" rules={[{ required: true, message: 'Nhập tên phòng ban' }]}><Input placeholder="VD: Phòng Phát triển Phần mềm" /></Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="manager" label="Trưởng đơn vị">
              <Select
                showSearch
                allowClear
                placeholder="Chọn nhân sự trưởng đơn vị..."
                options={employeeOptions}
                filterOption={(input, option) =>
                  (option?.label ?? '').toString().toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
            <Form.Item name="managerPhone" label="Số điện thoại"><Input placeholder="090x xxx xxx" /></Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="managerEmail" label="Email"><Input placeholder="email@company.com" /></Form.Item>
            <Form.Item name="location" label="Địa điểm làm việc"><Input placeholder="Hà Nội, TP. Hồ Chí Minh..." /></Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="headcountLimit" label="Định biên nhân sự"><Input type="number" min={0} /></Form.Item>
            <Form.Item name="annualBudget" label="Ngân sách năm (VNĐ)"><Input type="number" min={0} step={1000000} /></Form.Item>
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
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>Mã đơn vị: {selectedUnit.code}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{selectedUnit.name}</div>
                </div>
                <Tag color={selectedUnit.status === 'Đang hoạt động' ? 'success' : 'warning'}>{selectedUnit.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                Trực thuộc: <strong>{selectedUnit.parentUnit || 'Cấp cao nhất'}</strong> · Ngày thành lập: <strong>{selectedUnit.establishedDate || 'Chưa cập nhật'}</strong>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserOutlined style={{ color: '#009688' }} /> Trưởng đơn vị
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Họ và tên:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedUnit.manager || 'Chưa phân công'}</div>
                  {selectedUnit.managerTitle && selectedUnit.managerTitle !== 'Chưa cập nhật' && (
                    <div style={{ fontSize: 11.5, color: '#2563EB' }}>{selectedUnit.managerTitle}</div>
                  )}
                </div>
                <div><span style={{ color: '#64748B' }}>Số điện thoại:</span><div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedUnit.managerPhone || '—'}</div></div>
                <div><span style={{ color: '#64748B' }}>Email:</span><div style={{ fontWeight: 600, color: '#0F172A' }}>{selectedUnit.managerEmail || '—'}</div></div>
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

            {/* Danh sách nhân sự thuộc đơn vị */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TeamOutlined style={{ color: '#009688' }} /> Danh sách nhân sự thuộc đơn vị
                </div>
                <Tag color="cyan">{selectedUnitMembers.length} nhân sự</Tag>
              </div>
              {selectedUnitMembers.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: 12.5, padding: '12px 0' }}>
                  Chưa có nhân sự nào được phân bổ vào đơn vị này.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                  {selectedUnitMembers.map((emp) => (
                    <div
                      key={emp.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#F8FAFC',
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1px solid #F1F5F9',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 13 }}>{emp.name}</div>
                        <div style={{ fontSize: 11.5, color: '#2563EB' }}>
                          <code>{emp.code}</code> · {getEmployeePositions(emp).join(', ') || 'Nhân viên'}
                        </div>
                      </div>
                      <Tag color={emp.status === 'Chính thức' ? 'success' : emp.status === 'Thử việc' ? 'warning' : 'default'}>
                        {emp.status}
                      </Tag>
                    </div>
                  ))}
                </div>
              )}
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
