import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SaveOutlined, PrinterOutlined } from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { KTable } from '../../components/KTable';
import { Button, Checkbox, Select, Tag, message } from '../../custom-ui';
import { adminRolesApi, AdminRoleRecord, AdminRolesOverview } from '../../api/endpoints';
import { exportRecordToPdf } from '../../utils/fileExporter';
import { ROLE_ACTIONS, RoleAction } from './delegatedAccess';

type Matrix = Record<string, Record<RoleAction, boolean>>;

const EMPTY_OVERVIEW: AdminRolesOverview = { modules: [], actions: [], roles: [] };
const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' };

const matrixFromRole = (role: AdminRoleRecord | undefined, modules: AdminRolesOverview['modules']): Matrix =>
  Object.fromEntries(modules.map(({ key }) => [key, Object.fromEntries(ROLE_ACTIONS.map(({ key: action }) => [action, Boolean(role?.permissions[key]?.[action])]))])) as Matrix;

/** Cùng quy tắc với máy chủ: thêm, sửa, xóa đều kéo theo quyền xem, và bỏ quyền xem thì bỏ luôn các quyền còn lại. */
const toggleAction = (row: Record<RoleAction, boolean>, action: RoleAction, checked: boolean): Record<RoleAction, boolean> => {
  if (action === 'read') return checked ? { ...row, read: true } : { read: false, create: false, edit: false, delete: false };
  return { ...row, [action]: checked, read: checked ? true : row.read };
};

export const AdminPermissionsModule: React.FC = () => {
  const location = useLocation();
  const requestedRole = String((location.state as { role?: string } | null)?.role || '');
  const [overview, setOverview] = useState<AdminRolesOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedCode, setSelectedCode] = useState(requestedRole);
  const [matrix, setMatrix] = useState<Matrix>({});
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminRolesApi.overview();
      setOverview(response.data);
      setSelectedCode((current) => {
        const roles = response.data.roles;
        if (current && roles.some((role) => role.roleCode === current)) return current;
        return (roles.find((role) => !role.system) || roles[0])?.roleCode || '';
      });
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được danh mục vai trò.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const role = overview.roles.find((item) => item.roleCode === selectedCode);
  const editable = Boolean(role && !role.system);

  useEffect(() => {
    setMatrix(matrixFromRole(role, overview.modules));
    setDirty(false);
  }, [role, overview.modules]);

  const change = (moduleKey: string, action: RoleAction, checked: boolean) => {
    setMatrix((current) => ({ ...current, [moduleKey]: toggleAction(current[moduleKey], action, checked) }));
    setDirty(true);
  };

  const setWholeRow = (moduleKey: string, checked: boolean) => {
    setMatrix((current) => ({ ...current, [moduleKey]: Object.fromEntries(ROLE_ACTIONS.map(({ key }) => [key, checked])) as Record<RoleAction, boolean> }));
    setDirty(true);
  };

  const applyAll = (grant: (action: RoleAction) => boolean) => {
    setMatrix(Object.fromEntries(overview.modules.map(({ key }) => [key, Object.fromEntries(ROLE_ACTIONS.map(({ key: action }) => [action, grant(action)]))])) as Matrix);
    setDirty(true);
  };

  const handleSave = async () => {
    if (!role || !editable || saving) return;
    setSaving(true);
    try {
      await adminRolesApi.update(role.roleCode, { permissions: matrix });
      message.success(`Đã lưu ma trận quyền của vai trò ${role.roleCode}. Máy chủ áp dụng ngay cho các tài khoản đang giữ vai trò.`);
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được ma trận quyền.');
    } finally {
      setSaving(false);
    }
  };

  const rows = useMemo(() => overview.modules.map((module) => ({ key: module.key, label: module.label })), [overview.modules]);
  const granted = Object.values(matrix).reduce((sum, row) => sum + ROLE_ACTIONS.filter(({ key }) => row[key]).length, 0);

  const columns = [
    { title: 'Phân hệ chức năng', key: 'module', render: (_: any, row: { key: string; label: string }) => <span style={{ color: '#0F172A', fontSize: 13.5 }}>{row.label}</span> },
    ...ROLE_ACTIONS.map(({ key, label }) => ({
      title: label,
      key,
      width: 130,
      render: (_: any, row: { key: string }) => (
        <Checkbox checked={Boolean(matrix[row.key]?.[key])} disabled={!editable} onChange={(event: any) => change(row.key, key, event.target.checked)} />
      ),
    })),
    {
      title: 'Cả hàng',
      key: 'all',
      width: 130,
      render: (_: any, row: { key: string }) => (
        <Checkbox checked={ROLE_ACTIONS.every(({ key }) => matrix[row.key]?.[key])} disabled={!editable} onChange={(event: any) => setWholeRow(row.key, event.target.checked)} />
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Phân hệ có thể ủy quyền</div>
          <div style={{ fontSize: 24, color: '#009688', marginTop: 4 }}>{overview.modules.length} phân hệ</div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Mỗi phân hệ có bốn quyền: xem, thêm mới, sửa và duyệt, xóa</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Quyền đang cấp cho vai trò</div>
          <div style={{ fontSize: 24, color: '#16A34A', marginTop: 4 }}>{granted} / {overview.modules.length * ROLE_ACTIONS.length} quyền</div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{dirty ? 'Có thay đổi chưa lưu' : 'Khớp với dữ liệu trên máy chủ'}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tài khoản giữ vai trò này</div>
          <div style={{ fontSize: 24, color: '#7C3AED', marginTop: 4 }}>{role?.usersCount ?? 0} tài khoản</div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Gán vai trò tại màn hình Quản lý người dùng</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Trạng thái vai trò</div>
          <div style={{ fontSize: 24, color: role?.status === 'Tạm khóa' ? '#DC2626' : '#1E40AF', marginTop: 4 }}>{role?.status || 'Chưa chọn'}</div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Vai trò tạm khóa không còn hiệu lực</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: '#0F172A' }}>Vai trò cấu hình</span>
          <Select
            value={selectedCode || undefined}
            onChange={(value: string) => setSelectedCode(value)}
            style={{ width: 320 }}
            placeholder="Chưa có vai trò nào"
            options={overview.roles.map((item) => ({ label: `${item.name} · ${item.roleCode}`, value: item.roleCode }))}
          />
          {role?.system && <Tag color="default">Vai trò của hệ thống, không chỉnh sửa</Tag>}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button disabled={!editable} onClick={() => applyAll(() => true)}>Cấp toàn quyền</Button>
          <Button disabled={!editable} onClick={() => applyAll((action) => action === 'read')}>Chỉ xem</Button>
          <Button disabled={!editable} onClick={() => applyAll(() => false)}>Bỏ toàn bộ quyền</Button>
          <Button
            icon={<PrinterOutlined />}
            disabled={!role}
            onClick={() => role && exportRecordToPdf(`Ma_tran_phan_quyen_${role.roleCode}`, `MA TRAN PHAN QUYEN ${role.roleCode}`, rows.map((row): [string, string] => [row.label, ROLE_ACTIONS.filter(({ key }) => matrix[row.key]?.[key]).map(({ key }) => ({ read: 'xem', create: 'them moi', edit: 'sua va duyet', delete: 'xoa' } as Record<RoleAction, string>)[key]).join(', ') || 'khong co quyen']))}
          >
            In ma trận
          </Button>
          <Button type="primary" icon={<SaveOutlined />} disabled={!editable || !dirty} loading={saving} onClick={handleSave} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
            Lưu ma trận phân quyền
          </Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable dataSource={rows} columns={columns} rowKey="key" loading={loading} pagination={false} />
      </div>
      <div style={{ fontSize: 12, color: '#64748B', marginTop: 10, lineHeight: 1.6 }}>
        Quyền áp dụng ngay ở máy chủ khi lưu. Menu của tài khoản đang đăng nhập cập nhật sau khi tải lại trang. Quản lý người dùng, vai trò, nhật ký kiểm toán, sao lưu và cấu hình hệ thống chỉ dành cho quản trị viên, không giao được cho vai trò nghiệp vụ.
      </div>
    </div>
  );
};
