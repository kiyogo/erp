import React, { useCallback, useEffect, useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { Button, Form, Input, Modal, Select, message } from '../../custom-ui';
import { CrmContact, CrmContactType, crmContactsApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';

type Props = {
  type: CrmContactType;
  value?: string | string[];
  /** Chọn một đối tượng: truyền kèm hồ sơ. Chọn nhiều: truyền mảng khóa hồ sơ. */
  onChange?: (value: any, contact?: CrmContact) => void;
  /** Gọi khi chọn hoặc tạo xong một đối tượng. Dùng trong Form.Item vì Form.Item chỉ chuyển tiếp giá trị. */
  onSelectContact?: (contact?: CrmContact) => void;
  /** Gọi sau khi tạo mới thành công, để màn hình cha nạp lại danh sách của nó. */
  onCreated?: (contact: CrmContact) => void;
  multiple?: boolean;
  allowClear?: boolean;
  disabled?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
};

const LABELS: Record<CrmContactType, { noun: string; title: string }> = {
  customer: { noun: 'khách hàng', title: 'Thêm khách hàng' },
  supplier: { noun: 'nhà cung cấp', title: 'Thêm nhà cung cấp' },
  partner: { noun: 'đối tác', title: 'Thêm đối tác' },
};

const isActive = (contact: CrmContact & { status?: string }) => !/tạm|ngừng|dừng|không ho/i.test(String(contact.status || ''));

/**
 * Ô chọn khách hàng, nhà cung cấp hoặc đối tác lấy từ danh bạ CRM thật, kèm nút "+" (chỉ quản trị viên)
 * để tạo hồ sơ mới ngay tại chỗ. Hồ sơ mới xuất hiện trong danh sách và được chọn luôn.
 */
export const ContactSelect: React.FC<Props> = ({ type, value, onChange, onSelectContact, onCreated, multiple, allowClear, disabled, placeholder, style }) => {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const canCreate = user?.role === 'ADMIN';
  const label = LABELS[type];

  const reload = useCallback(async () => {
    const response = await crmContactsApi.getAll(type);
    const list = (response.data.data || []).filter(isActive);
    setContacts(list);
    return list;
  }, [type]);

  useEffect(() => { void reload().catch(() => setContacts([])); }, [reload]);

  const selected = multiple ? (Array.isArray(value) ? value : []) : (typeof value === 'string' && value ? [value] : []);
  const options = contacts.map((contact) => ({ value: contact.key, label: `${contact.code} · ${contact.name}` }));
  for (const key of selected) if (!options.some((option) => option.value === key)) options.unshift({ value: key, label: key });

  const close = () => { setCreateOpen(false); form.resetFields(); };

  const handleCreate = async (values: any) => {
    const name = String(values.name || '').trim();
    const taxCode = String(values.taxCode || '').trim();
    const duplicate = contacts.find((contact) => (taxCode && String(contact.taxCode || '').trim().toLocaleLowerCase() === taxCode.toLocaleLowerCase())
      || contact.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) {
      onChange?.(multiple ? [...selected, duplicate.key] : duplicate.key, duplicate);
      onSelectContact?.(duplicate);
      close();
      message.info(`${label.noun[0].toUpperCase()}${label.noun.slice(1)} đã có trong danh bạ và đã được chọn.`);
      return;
    }
    setSaving(true);
    try {
      const response = await crmContactsApi.create({
        type, name, taxCode,
        contactPerson: String(values.contactPerson || '').trim(),
        phone: String(values.phone || '').trim(),
        email: String(values.email || '').trim(),
        address: String(values.address || '').trim(),
        status: 'Đang hoạt động',
      });
      const created = response.data.contact;
      setContacts((current) => [...current.filter((item) => item.key !== created.key), created]);
      onChange?.(multiple ? [...selected, created.key] : created.key, created);
      onSelectContact?.(created);
      onCreated?.(created);
      close();
      message.success(`Đã tạo ${label.noun} ${created.code}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || `Không tạo được ${label.noun}.`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 4, width: '100%', ...style }}>
      <Select
        showSearch
        mode={multiple ? 'multiple' : undefined}
        allowClear={allowClear}
        disabled={disabled}
        placeholder={placeholder || `Chọn ${label.noun}`}
        value={multiple ? selected : (selected[0] || undefined)}
        options={options}
        style={{ flex: 1, minWidth: 0 }}
        onChange={(next: any) => {
          const contact = multiple ? undefined : contacts.find((item) => item.key === next);
          onChange?.(next, contact);
          onSelectContact?.(contact);
        }}
      />
      {canCreate && !disabled && <Button aria-label={label.title} title={label.title} icon={<PlusOutlined />} onClick={() => setCreateOpen(true)} />}
      {canCreate && (
        <Modal title={label.title} open={createOpen} onCancel={() => !saving && close()} footer={null} width="min(640px, 95vw)">
          <Form form={form} layout="vertical" onFinish={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Form.Item name="name" label={`Tên ${label.noun}`} rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
              <Form.Item name="taxCode" label="Mã số thuế hoặc mã định danh"><Input /></Form.Item>
              <Form.Item name="contactPerson" label="Người liên hệ"><Input /></Form.Item>
              <Form.Item name="phone" label="Số điện thoại"><Input /></Form.Item>
              <Form.Item name="email" label="Email liên hệ" rules={[{ type: 'email', message: 'Email không đúng định dạng.' }]}><Input type="email" /></Form.Item>
              <Form.Item name="address" label="Địa chỉ"><Input /></Form.Item>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 14 }}>
              <Button disabled={saving} onClick={close}>Hủy</Button>
              <Button type="primary" htmlType="submit" loading={saving}>Lưu</Button>
            </div>
          </Form>
        </Modal>
      )}
    </div>
  );
};
