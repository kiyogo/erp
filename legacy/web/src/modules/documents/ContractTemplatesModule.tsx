import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  RightOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Button, Checkbox, Input, Modal, Select, Switch, Tag, message } from '../../custom-ui';
import { KTable } from '../../components/KTable';
import {
  CONTRACT_TEMPLATE_CATEGORY_OPTIONS,
  ContractTemplate,
  ContractTemplateCustomField,
  ContractTemplateCustomFieldType,
  ContractTemplatePartyType,
  dataService,
} from '../../services/dataService';

const newDraft = (): ContractTemplate => ({
  id: '',
  name: '',
  category: 'labor',
  partyType: 'employee',
  fieldKeys: [],
  customFields: [],
  content: '',
  isActive: true,
  updatedAt: '',
});

const partyTypeOptions: { value: ContractTemplatePartyType; label: string }[] = [
  { value: 'employee', label: 'Nhân sự' },
  { value: 'individual', label: 'Cá nhân' },
  { value: 'organization', label: 'Doanh nghiệp / tổ chức' },
];

const customFieldTypeOptions: { value: ContractTemplateCustomFieldType; label: string }[] = [
  { value: 'text', label: 'Văn bản ngắn' },
  { value: 'number', label: 'Số tiền / số lượng' },
  { value: 'date', label: 'Ngày' },
  { value: 'select', label: 'Danh sách chọn' },
];

const createCustomField = (): ContractTemplateCustomField => ({
  key: `truong_tuy_chinh_${Date.now()}`,
  label: 'Trường tùy chỉnh mới',
  type: 'text',
  placeholder: '',
  required: false,
});

const normalizeFieldKey = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .toLowerCase()
  .replace(/[^a-z0-9_]+/g, '_')
  .replace(/^_+|_+$/g, '');

const formatDateTime = (value?: string) => {
  if (!value) return 'Chưa cập nhật';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN');
};

export const ContractTemplatesModule: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fieldManagerOpen, setFieldManagerOpen] = useState(false);
  const [addFieldDialogOpen, setAddFieldDialogOpen] = useState(false);
  const [editingFieldIndex, setEditingFieldIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<ContractTemplate | null>(null);
  const [previewing, setPreviewing] = useState<ContractTemplate | null>(null);
  const [draft, setDraft] = useState<ContractTemplate>(newDraft());
  const [newField, setNewField] = useState<ContractTemplateCustomField>(createCustomField());
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInsertToken = (tokenKey: string) => {
    const tokenStr = `{{${tokenKey}}}`;
    const el = contentTextareaRef.current;
    let newContent = '';
    if (el) {
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const val = draft.content || '';
      newContent = val.substring(0, start) + tokenStr + val.substring(end);
      updateDraft({ content: newContent });
      setTimeout(() => {
        if (el) {
          el.focus();
          const cursorPosition = start + tokenStr.length;
          el.setSelectionRange(cursorPosition, cursorPosition);
        }
      }, 15);
    } else {
      newContent = (draft.content || '') + ' ' + tokenStr;
      updateDraft({ content: newContent });
    }
    message.success(`Đã chèn tự động biến {{${tokenKey}}} vào con trỏ văn bản!`);
  };

  const loadTemplates = () => setTemplates(dataService.getContractTemplates());

  useEffect(() => {
    loadTemplates();
    const unsub = dataService.subscribe(loadTemplates);
    return unsub;
  }, []);

  const categoryLabel = useMemo(
    () => new Map(CONTRACT_TEMPLATE_CATEGORY_OPTIONS.map((item) => [item.value, item.label])),
    [],
  );

  const updateDraft = (patch: Partial<ContractTemplate>) => setDraft((current) => ({ ...current, ...patch }));
  const availableTemplateTokens = (draft.customFields || [])
    .map((field) => ({
      key: normalizeFieldKey(field.key || field.label),
      label: field.label,
    }))
    .filter((field) => field.key && field.label);

  const openCreate = () => {
    setEditing(null);
    setDraft(newDraft());
    setEditorOpen(true);
  };

  const openEdit = (template: ContractTemplate) => {
    setEditing(template);
    setDraft({ ...template, fieldKeys: [...template.fieldKeys], customFields: [...(template.customFields || [])] });
    setEditorOpen(true);
  };

  const saveTemplate = () => {
    const name = draft.name.trim();
    if (!name) {
      message.error('Vui lòng nhập tên mẫu hợp đồng.');
      return;
    }
    if (!draft.content.trim()) {
      message.error('Vui lòng nhập nội dung mẫu hợp đồng.');
      return;
    }
    const duplicate = templates.some((item) => item.id !== editing?.id && item.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) {
      message.error('Tên mẫu hợp đồng đã tồn tại.');
      return;
    }

    const customFields = (draft.customFields || []).map((field) => ({
      ...field,
      key: normalizeFieldKey(field.key),
      label: field.label.trim(),
      placeholder: field.placeholder?.trim(),
      options: field.type === 'select' ? (field.options || []).map((option) => option.trim()).filter(Boolean) : undefined,
    }));
    const allKeys = customFields.map((field) => field.key);
    if (customFields.some((field) => !field.key || !field.label)) {
      message.error('Mỗi trường cần có tên hiển thị.');
      return;
    }
    if (new Set(allKeys).size !== allKeys.length) {
      message.error('Tên trường đang trùng với một trường khác.');
      return;
    }

    const saved: ContractTemplate = {
      ...draft,
      id: editing?.id || `tpl-${Date.now()}`,
      name,
      content: draft.content.trim(),
      fieldKeys: [],
      customFields,
      isSystem: editing?.isSystem || false,
      updatedAt: new Date().toISOString(),
    };
    const next = editing ? templates.map((item) => (item.id === editing.id ? saved : item)) : [saved, ...templates];
    dataService.saveContractTemplates(next);
    setTemplates(next);
    setEditorOpen(false);
    message.success(editing ? 'Đã cập nhật mẫu hợp đồng.' : 'Đã tạo mẫu hợp đồng mới.');
  };

  const removeTemplate = (template: ContractTemplate) => {
    Modal.confirm({
      title: 'Xóa mẫu hợp đồng?',
      content: `Mẫu “${template.name}” sẽ không còn xuất hiện khi lập hợp đồng mới.`,
      okText: 'Xóa mẫu',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: () => {
        const next = templates.filter((item) => item.id !== template.id);
        dataService.saveContractTemplates(next);
        setTemplates(next);
        message.success('Đã xóa mẫu hợp đồng.');
      },
    });
  };

  const openAddFieldDialog = () => {
    setNewField({ ...createCustomField(), key: '', label: '', placeholder: '' });
    setEditingFieldIndex(null);
    setAddFieldDialogOpen(true);
  };

  const openEditFieldDialog = (index: number) => {
    const field = draft.customFields?.[index];
    if (!field) return;
    setNewField({ ...field, options: field.options ? [...field.options] : undefined });
    setEditingFieldIndex(index);
    setAddFieldDialogOpen(true);
  };

  const saveCustomField = () => {
    const label = newField.label.trim();
    const key = editingFieldIndex === null ? normalizeFieldKey(label) : newField.key;
    if (!label || !key) {
      message.error('Vui lòng nhập tên trường.');
      return;
    }
    if ((draft.customFields || []).some((field, index) => index !== editingFieldIndex && field.key === key)) {
      message.error('Tên trường đã tồn tại trong mẫu này.');
      return;
    }
    const savedField: ContractTemplateCustomField = {
      ...newField,
      key,
      label,
      placeholder: newField.placeholder?.trim(),
      options: newField.type === 'select' ? (newField.options || []).map((option) => option.trim()).filter(Boolean) : undefined,
    };
    const next = [...(draft.customFields || [])];
    if (editingFieldIndex === null) next.push(savedField);
    else next[editingFieldIndex] = savedField;
    updateDraft({ customFields: next });
    setAddFieldDialogOpen(false);
    message.success(editingFieldIndex === null ? 'Đã thêm trường vào mẫu hợp đồng.' : 'Đã cập nhật trường.');
  };

  const removeCustomField = (index: number) => {
    const field = draft.customFields?.[index];
    if (!field) return;
    Modal.confirm({
      title: 'Xóa trường?',
      content: `Bạn có chắc chắn muốn xóa trường “${field.label}”?`,
      okText: 'Xóa',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: () => updateDraft({ customFields: (draft.customFields || []).filter((_item, fieldIndex) => fieldIndex !== index) }),
    });
  };

  const columns = [
    {
      title: 'Mẫu hợp đồng',
      key: 'name',
      render: (_: unknown, record: ContractTemplate) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 7, background: '#E0F2F1', color: '#00796B', display: 'grid', placeItems: 'center', fontSize: 16 }}>
            <FileTextOutlined />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <strong style={{ color: '#0F172A' }}>{record.name}</strong>
              {record.isSystem && <Tag color="cyan" style={{ margin: 0 }}>Mẫu hệ thống</Tag>}
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>
              Chủ thể ký kết: {partyTypeOptions.find((item) => item.value === record.partyType)?.label || record.partyType}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Danh mục',
      dataIndex: 'category',
      key: 'category',
      width: 190,
      render: (value: string) => <Tag color={value === 'equity' ? 'gold' : 'blue'}>{categoryLabel.get(value as any) || value}</Tag>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 120,
      render: (active: boolean) => active ? <Tag color="success" icon={<CheckCircleOutlined />}>Đang dùng</Tag> : <Tag>Ngừng dùng</Tag>,
    },
    {
      title: 'Cập nhật',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 165,
      render: (value: string) => <span style={{ color: '#64748B', fontSize: 12 }}>{formatDateTime(value)}</span>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 176,
      render: (_: unknown, record: ContractTemplate) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => { setPreviewing(record); setPreviewOpen(true); }}>Xem</Button>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEdit(record)} style={{ background: '#009688', borderColor: '#009688' }}>Sửa</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeTemplate(record)} />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ background: 'linear-gradient(135deg, #F0FDFA 0%, #FFFFFF 70%)', border: '1px solid #BFE9E4', borderRadius: 10, padding: '18px 20px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 40, height: 40, borderRadius: 8, background: '#009688', color: '#FFFFFF', display: 'grid', placeItems: 'center', fontSize: 18 }}><SettingOutlined /></div>
          <div>
            <h2 style={{ fontSize: 18, margin: 0, color: '#0F172A' }}>Mẫu hợp đồng</h2>
            <div style={{ color: '#475569', fontSize: 13, marginTop: 5 }}>Chọn các trường sẽ tự hiện tại “Lập hợp đồng mới” trong Tài liệu → Hợp đồng.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => navigate('/admin/documents/contracts')} icon={<RightOutlined />}>Đi đến Hợp đồng</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ background: '#009688', borderColor: '#009688' }}>Thêm mẫu hợp đồng</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: '13px 16px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}><div style={{ fontSize: 12, color: '#64748B' }}>Tổng mẫu</div><strong style={{ fontSize: 22, color: '#009688' }}>{templates.length}</strong></div>
        <div style={{ padding: '13px 16px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}><div style={{ fontSize: 12, color: '#64748B' }}>Mẫu đang sử dụng</div><strong style={{ fontSize: 22, color: '#16A34A' }}>{templates.filter((item) => item.isActive).length}</strong></div>
        <div style={{ padding: '13px 16px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}><div style={{ fontSize: 12, color: '#64748B' }}>Mẫu Cổ phần & ESOP</div><strong style={{ fontSize: 22, color: '#D97706' }}>{templates.filter((item) => item.category === 'equity').length}</strong></div>
      </div>

      <div className="transparent-table-card"><KTable dataSource={templates} columns={columns as any} rowKey="id" pagination={{ pageSize: 8 }} /></div>

      <Modal
        title={editing ? `Chỉnh sửa mẫu: ${editing.name}` : 'Thêm mẫu hợp đồng'}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        width={900}
        style={{ top: 26 }}
        bodyStyle={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}
        footer={[
          <Button key="cancel" onClick={() => setEditorOpen(false)}>Đóng</Button>,
          <Button key="save" type="primary" onClick={saveTemplate} style={{ background: '#009688', borderColor: '#009688' }}>Lưu mẫu hợp đồng</Button>,
        ]}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))', gap: 14 }}>
          <div><label style={{ display: 'block', marginBottom: 5, fontWeight: 600, color: '#334155' }}>Tên mẫu hợp đồng *</label><Input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Ví dụ: Hợp đồng lao động tính theo cổ phần" /></div>
          <div><label style={{ display: 'block', marginBottom: 5, fontWeight: 600, color: '#334155' }}>Danh mục *</label><Select value={draft.category} onChange={(value) => updateDraft({ category: String(value) })} options={CONTRACT_TEMPLATE_CATEGORY_OPTIONS as any} style={{ width: '100%' }} /></div>
          <div><label style={{ display: 'block', marginBottom: 5, fontWeight: 600, color: '#334155' }}>Chủ thể ký kết mặc định</label><Select value={draft.partyType} onChange={(value) => updateDraft({ partyType: value as ContractTemplatePartyType })} options={partyTypeOptions} style={{ width: '100%' }} /></div>
          <div><label style={{ display: 'block', marginBottom: 5, fontWeight: 600, color: '#334155' }}>Trạng thái áp dụng</label><Switch checked={draft.isActive} onChange={(isActive) => updateDraft({ isActive })} checkedChildren="Đang dùng" unCheckedChildren="Ngừng dùng" /></div>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ color: '#0F172A', fontSize: 14 }}>Trường hợp đồng hiển thị</strong>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setFieldManagerOpen(true)}
              style={{ background: '#009688', borderColor: '#009688' }}
            >
              Thêm trường
            </Button>
          </div>
          {(draft.customFields || []).length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {(draft.customFields || []).map((f, idx) => (
                <Tag key={idx} color="cyan" style={{ fontSize: 12, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                  {f.label}
                </Tag>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ fontWeight: 600, color: '#334155', fontSize: 13.5 }}>Nội dung mẫu hợp đồng *</label>
            <span style={{ fontSize: 12, color: '#64748B' }}>Nhấp vào các thẻ bên dưới để tự động chèn dữ liệu vào con trỏ</span>
          </div>

          {availableTemplateTokens.length > 0 && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileTextOutlined style={{ color: '#009688' }} />
                <span>Mã trường khả dụng dùng trong Nội dung mẫu:</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {availableTemplateTokens.map((token) => (
                  <Tag
                    key={token.key}
                    color="cyan"
                    onClick={() => handleInsertToken(token.key)}
                    style={{ cursor: 'pointer', userSelect: 'none', padding: '3px 10px', fontSize: 12, fontWeight: 600, borderRadius: 4 }}
                    title={`Nhấp để chèn biến ${token.key} vào vị trí con trỏ`}
                  >
                    +{token.label}
                  </Tag>
                ))}
              </div>
            </div>
          )}

          <textarea
            ref={contentTextareaRef}
            value={draft.content}
            onChange={(event) => updateDraft({ content: event.target.value })}
            placeholder="Nhập nội dung hợp đồng mẫu... Nhấp vào các thẻ Mã trường màu xanh ở trên để tự động chèn dữ liệu động vào vị trí con trỏ"
            style={{
              width: '100%',
              minHeight: 235,
              boxSizing: 'border-box',
              resize: 'vertical',
              border: '1px solid #CBD5E1',
              borderRadius: 6,
              padding: 11,
              fontFamily: 'Times New Roman, serif',
              fontSize: 14,
              lineHeight: 1.55,
              color: '#1E293B',
            }}
          />
        </div>
      </Modal>

      <Modal
        title="Quản lý trường tự thêm"
        open={fieldManagerOpen}
        onCancel={() => setFieldManagerOpen(false)}
        width={940}
        style={{ top: 34 }}
        bodyStyle={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}
        footer={<Button type="primary" onClick={() => setFieldManagerOpen(false)} style={{ background: '#009688', borderColor: '#009688' }}>Xong</Button>}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddFieldDialog} style={{ background: '#009688', borderColor: '#009688' }}>Thêm trường</Button>
        </div>

        {(draft.customFields || []).length === 0 ? (
          <div style={{ padding: '26px 18px', textAlign: 'center', color: '#64748B', border: '1px dashed #CBD5E1', borderRadius: 8 }}>Chưa có trường nào. Nhấn “Thêm trường” để bắt đầu.</div>
        ) : <div style={{ overflowY: 'auto', overflowX: 'auto', borderTop: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '12px 16px', background: '#F8FAFC' }}>Tên trường</th>
                <th style={{ padding: '12px 16px', background: '#F8FAFC' }}>Mã chèn mẫu</th>
                <th style={{ padding: '12px 16px', background: '#F8FAFC' }}>Kiểu dữ liệu</th>
                <th style={{ padding: '12px 16px', background: '#F8FAFC' }}>Gợi ý nhập</th>
                <th style={{ padding: '12px 16px', background: '#F8FAFC' }}>Bắt buộc</th>
                <th style={{ padding: '12px 20px', textAlign: 'right', background: '#F8FAFC' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {(draft.customFields || []).map((field, index) => {
                const tokenKey = normalizeFieldKey(field.key || field.label);
                return (
                  <tr key={`${field.key}-${index}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0F172A' }}>{field.label}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#009688', fontWeight: 700 }}>
                      {tokenKey}
                    </td>
                    <td style={{ padding: '12px 16px' }}><Tag color="cyan">{customFieldTypeOptions.find((option) => option.value === field.type)?.label || field.type}</Tag></td>
                    <td style={{ padding: '12px 16px', color: '#64748B' }}>{field.placeholder || '—'}</td>
                    <td style={{ padding: '12px 16px' }}>{field.required ? <Tag color="success">Bắt buộc</Tag> : <Tag>Không</Tag>}</td>
                    <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openEditFieldDialog(index)} style={{ background: '#009688', borderColor: '#009688' }}>Sửa</Button>
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeCustomField(index)}>Xóa</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </Modal>

      <Modal
        title={editingFieldIndex === null ? 'Thêm trường tự thêm' : 'Chỉnh sửa trường tự thêm'}
        open={addFieldDialogOpen}
        onCancel={() => setAddFieldDialogOpen(false)}
        width={640}
        footer={[
          <Button key="cancel" onClick={() => setAddFieldDialogOpen(false)}>Hủy</Button>,
          <Button key="save" type="primary" onClick={saveCustomField} style={{ background: '#009688', borderColor: '#009688' }}>{editingFieldIndex === null ? 'Thêm trường' : 'Lưu thay đổi'}</Button>,
        ]}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#334155', fontWeight: 600, marginBottom: 5 }}>Tên trường *</label>
            <Input
              value={newField.label}
              onChange={(event) => {
                const labelVal = event.target.value;
                setNewField((current) => ({
                  ...current,
                  label: labelVal,
                  key: editingFieldIndex === null ? normalizeFieldKey(labelVal) : current.key,
                }));
              }}
              placeholder="Ví dụ: Số lượng cổ phần ESOP"
              autoFocus
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#334155', fontWeight: 600, marginBottom: 5 }}>
              Mã trường dùng chèn Nội dung mẫu
            </label>
            <Input
              value={newField.key}
              onChange={(event) => {
                const keyVal = normalizeFieldKey(event.target.value);
                setNewField((current) => ({ ...current, key: keyVal }));
              }}
              placeholder="Ví dụ: so_luong_co_phan_esop"
            />
            {newField.key && (
              <div style={{ fontSize: 11.5, color: '#009688', marginTop: 4, fontWeight: 600 }}>
                Mã chèn trong văn bản: <code>{newField.key}</code>
              </div>
            )}
          </div>

          <div><label style={{ display: 'block', fontSize: 12.5, color: '#334155', fontWeight: 600, marginBottom: 5 }}>Kiểu dữ liệu</label><Select value={newField.type} onChange={(value) => setNewField((current) => ({ ...current, type: value as ContractTemplateCustomFieldType, options: value === 'select' ? current.options : undefined }))} options={customFieldTypeOptions} style={{ width: '100%' }} /></div>
          <div><label style={{ display: 'block', fontSize: 12.5, color: '#334155', fontWeight: 600, marginBottom: 5 }}>Gợi ý nhập</label><Input value={newField.placeholder || ''} onChange={(event) => setNewField((current) => ({ ...current, placeholder: event.target.value }))} placeholder="Ví dụ: 50.000 cổ phần" /></div>
          {newField.type === 'select' && <div style={{ gridColumn: '1 / -1' }}><label style={{ display: 'block', fontSize: 12.5, color: '#334155', fontWeight: 600, marginBottom: 5 }}>Các lựa chọn</label><Input value={(newField.options || []).join(', ')} onChange={(event) => setNewField((current) => ({ ...current, options: event.target.value.split(',') }))} placeholder="Đợt 1, Đợt 2, Đợt 3" /></div>}
          <div style={{ gridColumn: '1 / -1' }}><Checkbox checked={!!newField.required} onChange={(event) => setNewField((current) => ({ ...current, required: event.target.checked }))}>Bắt buộc nhập khi lập hợp đồng</Checkbox></div>
        </div>
      </Modal>

      <Modal title={`Xem trước: ${previewing?.name || ''}`} open={previewOpen} onCancel={() => setPreviewOpen(false)} width={780} footer={<Button onClick={() => setPreviewOpen(false)}>Đóng</Button>}>
        <div style={{ background: '#FFFFFF', padding: '28px 34px', border: '1px solid #E2E8F0', borderRadius: 6, fontFamily: 'Times New Roman, serif', color: '#111827', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{previewing?.content}</div>
      </Modal>
    </div>
  );
};

export default ContractTemplatesModule;
