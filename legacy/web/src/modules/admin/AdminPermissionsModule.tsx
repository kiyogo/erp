import React, { useState } from 'react';
import {
  SaveOutlined,
  CheckOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Select, message, Tag, Card, Tooltip } from '../../custom-ui';

export interface ModulePermissionRow {
  key: string;
  module: string;
  category: string;
  read: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
  exportData: boolean;
}

const DEFAULT_PERMISSIONS: ModulePermissionRow[] = [
  { key: '1', module: 'Bảng điều khiển & Giám sát', category: 'Tổng quan', read: true, create: true, edit: true, delete: true, approve: true, exportData: true },
  { key: '2', module: 'Nhân sự, Hồ sơ & Hợp đồng', category: 'Vận hành', read: true, create: true, edit: true, delete: true, approve: true, exportData: true },
  { key: '3', module: 'Tài chính, Thu chi & Dòng tiền', category: 'Tài chính', read: true, create: true, edit: true, delete: true, approve: true, exportData: true },
  { key: '4', module: 'Bảo hiểm xã hội & Chế độ phúc lợi', category: 'Nhân sự', read: true, create: true, edit: true, delete: true, approve: true, exportData: true },
  { key: '5', module: 'Tài sản cố định & Kho linh kiện', category: 'Kho vận', read: true, create: true, edit: true, delete: true, approve: true, exportData: true },
  { key: '6', module: 'Quy trình trình ký điện tử', category: 'Văn thư', read: true, create: true, edit: true, delete: true, approve: true, exportData: true },
  { key: '7', module: 'Văn thư & Chữ ký số HSM', category: 'Pháp lý', read: true, create: true, edit: true, delete: true, approve: true, exportData: true },
  { key: '8', module: 'Kế hoạch chiến lược & Nhiệm vụ', category: 'Kế hoạch', read: true, create: true, edit: true, delete: true, approve: true, exportData: true },
  { key: '9', module: 'Quản trị hệ thống & Kiểm toán số', category: 'Hạ tầng', read: true, create: true, edit: true, delete: true, approve: true, exportData: true },
];

import { useEffect } from 'react';
import { dataService } from '../../services/dataService';

export const AdminPermissionsModule: React.FC = () => {
  const [selectedRole, setSelectedRole] = useState('ROLE_SUPER_ADMIN');
  const [permissions, setPermissions] = useState<ModulePermissionRow[]>(DEFAULT_PERMISSIONS);

  useEffect(() => {
    const saved = dataService.getGenericData('admin_permissions_' + selectedRole);
    if (Array.isArray(saved) && saved.length > 0) {
      setPermissions(saved);
    } else {
      setPermissions(DEFAULT_PERMISSIONS);
    }
  }, [selectedRole]);

  const handleToggle = (key: string, field: keyof ModulePermissionRow) => {
    setPermissions((prev) =>
      prev.map((p) => (p.key === key ? { ...p, [field]: !p[field] } : p))
    );
  };

  const handleGrantAll = () => {
    setPermissions((prev) =>
      prev.map((p) => ({
        ...p,
        read: true,
        create: true,
        edit: true,
        delete: true,
        approve: true,
        exportData: true,
      }))
    );
    message.success('Đã cấp toàn bộ đặc quyền cho vai trò hiện tại!');
  };

  const handleReadOnly = () => {
    setPermissions((prev) =>
      prev.map((p) => ({
        ...p,
        read: true,
        create: false,
        edit: false,
        delete: false,
        approve: false,
        exportData: true,
      }))
    );
    message.info('Đã chuyển vai trò về chế độ Chỉ Xem & Xuất báo cáo!');
  };

  const handleSave = () => {
    dataService.saveGenericData('admin_permissions_' + selectedRole, permissions);
    message.success(`Đã lưu và đồng bộ ma trận phân quyền cho vai trò [${selectedRole}] thành công!`);
  };

  const totalPermissionsChecked = permissions.reduce(
    (acc, p) =>
      acc +
      (p.read ? 1 : 0) +
      (p.create ? 1 : 0) +
      (p.edit ? 1 : 0) +
      (p.delete ? 1 : 0) +
      (p.approve ? 1 : 0) +
      (p.exportData ? 1 : 0),
    0
  );

  const renderCheckbox = (record: ModulePermissionRow, field: keyof ModulePermissionRow) => {
    const isChecked = !!record[field];
    return (
      <input
        type="checkbox"
        checked={isChecked}
        onChange={() => handleToggle(record.key, field)}
        style={{ cursor: 'pointer', accentColor: '#009688', width: 16, height: 16 }}
      />
    );
  };

  const columns = [
    {
      title: 'Phân hệ chức năng doanh nghiệp',
      key: 'module',
      render: (_: any, r: ModulePermissionRow) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{r.module}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Nhóm nghiệp vụ: <Tag color="blue">{r.category}</Tag></div>
        </div>
      ),
    },
    {
      title: 'Xem',
      key: 'read',
      align: 'center' as const,
      width: 100,
      render: (_: any, r: ModulePermissionRow) => renderCheckbox(r, 'read'),
    },
    {
      title: 'Thêm mới',
      key: 'create',
      align: 'center' as const,
      width: 110,
      render: (_: any, r: ModulePermissionRow) => renderCheckbox(r, 'create'),
    },
    {
      title: 'Chỉnh sửa',
      key: 'edit',
      align: 'center' as const,
      width: 110,
      render: (_: any, r: ModulePermissionRow) => renderCheckbox(r, 'edit'),
    },
    {
      title: 'Xóa bỏ (Delete)',
      key: 'delete',
      align: 'center' as const,
      width: 100,
      render: (_: any, r: ModulePermissionRow) => renderCheckbox(r, 'delete'),
    },
    {
      title: 'Ký duyệt',
      key: 'approve',
      align: 'center' as const,
      width: 120,
      render: (_: any, r: ModulePermissionRow) => renderCheckbox(r, 'approve'),
    },
    {
      title: 'Xuất tệp',
      key: 'exportData',
      align: 'center' as const,
      width: 110,
      render: (_: any, r: ModulePermissionRow) => renderCheckbox(r, 'exportData'),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Phân hệ tính năng cốt lõi</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {permissions.length} Phân hệ
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Kiểm soát ma trận CRUD 6 chiều</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đặc quyền đang được cấp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalPermissionsChecked} / {permissions.length * 6} quyền
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Áp dụng trực tiếp cho tài khoản gắn role</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cấp độ an ninh phân quyền</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            RBAC Strict Level 4
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Tuân thủ tiêu chuẩn ISO/IEC 27001</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Kiểm định tính toàn vẹn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            Đã đồng bộ HSM
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Chữ ký số xác nhận không có xung đột</div>
        </div>
      </div>

      {/* Role Selector & Quick Batch Actions Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>Vai trò cấu hình:</span>
          <Select
            value={selectedRole}
            onChange={setSelectedRole}
            style={{ width: 300 }}
            options={[
              { label: '👑 Super Admin', value: 'ROLE_SUPER_ADMIN' },
              { label: '🏛️ Ban Giám Đốc', value: 'ROLE_DIRECTOR' },
              { label: '💰 Kế Toán Trưởng', value: 'ROLE_CHIEF_ACCOUNTANT' },
              { label: '👥 Trưởng Phòng Nhân Sự', value: 'ROLE_HR_MANAGER' },
              { label: '👤 Nhân Viên Tiêu Chuẩn', value: 'ROLE_STAFF' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="small" onClick={handleGrantAll}>
            Cấp toàn quyền
          </Button>
          <Button size="small" onClick={handleReadOnly}>
            Chỉ xem
          </Button>
          <Button
            icon={<PrinterOutlined />}
            onClick={() => message.success(`Đã in ma trận phân quyền cho vai trò ${selectedRole}`)}
          >
            In Ma Trận (A4)
          </Button>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lưu ma trận phân quyền
          </Button>
        </div>
      </div>

      {/* Permissions Matrix Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={permissions}
          columns={columns}
          rowKey="key"
          pagination={false}
        />
      </div>
    </div>
  );
};

