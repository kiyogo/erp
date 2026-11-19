import React, { useCallback, useEffect, useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Select } from '../../custom-ui';
import { EnterpriseEmployee, employeesApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { dataService } from '../../services/dataService';
import { EmployeeQuickCreateDialog } from './EmployeeQuickCreateDialog';

type Option = { label: string; value: string };
type ValueKey = 'code' | 'name' | 'id';

type Props = {
  value?: string | string[];
  /** Chọn một người: truyền kèm hồ sơ nhân viên. Chọn nhiều người: truyền mảng giá trị. */
  onChange?: (value: any, employee?: EnterpriseEmployee) => void;
  multiple?: boolean;
  /** Gọi khi chọn hoặc tạo xong một nhân viên. Dùng prop này (không dùng đối số thứ hai của onChange) khi ô nằm trong Form.Item, vì Form.Item chỉ chuyển tiếp giá trị. */
  onSelectEmployee?: (employee?: EnterpriseEmployee) => void;
  /** Giới hạn danh sách theo quyền, ví dụ nhân viên chỉ được chọn chính mình. */
  filter?: (employee: EnterpriseEmployee) => boolean;
  /** Gọi sau khi tạo nhân viên mới thành công, để màn hình cha nạp lại danh sách của nó. */
  onCreated?: (employee: EnterpriseEmployee) => void;
  /** Trường lưu vào bản ghi: mã nhân viên, họ tên hoặc id. */
  valueKey?: ValueKey;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  style?: React.CSSProperties;
};

const pick = (employee: EnterpriseEmployee, key: ValueKey) => (
  key === 'id' ? employee.id : key === 'name' ? (employee.name || employee.fullName) : (employee.employeeCode || employee.code)
);

/**
 * Ô chọn nhân viên dùng dữ liệu thật của hệ thống, kèm nút "+" (chỉ quản trị viên) để thêm nhân viên mới
 * ngay tại chỗ. Nhân viên mới xuất hiện trong danh sách và được chọn luôn.
 */
export const EmployeeSelect: React.FC<Props> = ({ value, onChange, valueKey = 'code', placeholder = 'Chọn nhân viên', allowClear, disabled, ariaLabel, style, onCreated, onSelectEmployee, multiple, filter }) => {
  const { user } = useAuth();
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [orgUnitOptions, setOrgUnitOptions] = useState<Option[]>([]);
  const [positionOptions, setPositionOptions] = useState<Option[]>([]);
  const [workStatusOptions, setWorkStatusOptions] = useState<Option[]>([]);
  const canCreate = user?.role === 'ADMIN';

  const reload = useCallback(async () => {
    const response = await employeesApi.getAll();
    const list = (response.data.data || []).filter(employee => employee.isActive && employee.role !== 'ADMIN');
    setEmployees(list);
    return list;
  }, []);

  useEffect(() => { void reload().catch(() => setEmployees([])); }, [reload]);

  useEffect(() => {
    if (!canCreate) return;
    void Promise.all([dataService.fetchOrgUnitsList(), dataService.fetchDropdownOptions('positions'), dataService.fetchDropdownOptions('work_statuses')]).then(([units, positions, statuses]) => {
      setOrgUnitOptions(units.map(unit => ({ label: unit, value: unit })));
      setPositionOptions(positions.filter(item => item.isActive !== false).map(item => ({ label: item.name, value: item.name })));
      setWorkStatusOptions(statuses.filter(item => item.isActive !== false).map(item => ({ label: item.name, value: item.name })));
    }).catch(() => {});
  }, [canCreate]);

  const options = employees.filter(employee => !filter || filter(employee)).map(employee => ({
    value: pick(employee, valueKey),
    label: `${employee.name || employee.fullName} (${employee.employeeCode || employee.code})`,
  }));
  // Giá trị đã lưu của nhân viên đã nghỉ việc vẫn hiển thị được thay vì để trống.
  const selected = multiple ? (Array.isArray(value) ? value : []) : (typeof value === 'string' && value ? [value] : []);
  for (const item of selected) if (!options.some(option => option.value === item)) options.unshift({ value: item, label: item });

  return (
    <div style={{ display: 'flex', gap: 4, width: '100%', ...style }}>
      <Select
        aria-label={ariaLabel}
        showSearch
        optionFilterProp="label"
        allowClear={allowClear}
        disabled={disabled}
        placeholder={placeholder}
        mode={multiple ? 'multiple' : undefined}
        value={multiple ? selected : (selected[0] || undefined)}
        options={options}
        style={{ flex: 1, minWidth: 0 }}
        onChange={(next: any) => {
          const employee = multiple ? undefined : employees.find(item => pick(item, valueKey) === next);
          onChange?.(next, employee);
          onSelectEmployee?.(employee);
        }}
      />
      {canCreate && !disabled && <Button aria-label="Thêm nhân viên" title="Thêm nhân viên" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} />}
      {canCreate && <EmployeeQuickCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        orgUnitOptions={orgUnitOptions}
        positionOptions={positionOptions}
        workStatusOptions={workStatusOptions}
        onCreated={created => {
          void reload().then(list => {
            const employee = list.find(item => item.id === created.id) || created;
            onChange?.(multiple ? [...selected, pick(employee, valueKey)] : pick(employee, valueKey), employee);
            dataService.cacheEmployee(employee);
            onSelectEmployee?.(employee);
            onCreated?.(employee);
          }).catch(() => {});
        }}
      />}
    </div>
  );
};
