import React, { useState, useMemo } from 'react';
import {
  IdcardOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  InfoCircleOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  message,
  Tag,
  Tooltip,
} from '../../custom-ui';
import { KTable } from '../../components/KTable';
import { dataService, DropdownOptionItem } from '../../services/dataService';

export const AdminDropMenuModule: React.FC = () => {
  const [searchText, setSearchText] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DropdownOptionItem | null>(null);
  const [form] = Form.useForm();

  // Load positions options
  const options = useMemo(() => {
    void refreshKey;
    return dataService.getDropdownOptions('positions');
  }, [refreshKey]);

  const filteredOptions = useMemo(() => {
    if (!searchText.trim()) return options;
    const q = searchText.toLowerCase();
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.code && o.code.toLowerCase().includes(q)) ||
        (o.description && o.description.toLowerCase().includes(q))
    );
  }, [options, searchText]);

  const handleOpenAdd = () => {
    setEditingItem(null);
    form.setFieldsValue({
      name: '',
      code: '',
      color: '#009688',
      order: options.length + 1,
      description: '',
      isActive: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (item: DropdownOptionItem) => {
    setEditingItem(item);
    form.setFieldsValue({
      name: item.name,
      code: item.code || '',
      color: item.color || '#009688',
      order: item.order || 1,
      description: item.description || '',
      isActive: item.isActive !== false,
    });
    setModalOpen(true);
  };

  const handleSave = (values: any) => {
    const payload: DropdownOptionItem = {
      id: editingItem ? editingItem.id : `pos-${Date.now()}`,
      name: String(values.name || '').trim(),
      code: values.code ? String(values.code).trim().toUpperCase() : undefined,
      color: values.color || '#009688',
      order: Number(values.order || 1),
      description: values.description ? String(values.description).trim() : '',
      isActive: values.isActive !== false,
    };

    if (!payload.name) {
      message.error('Vui lòng nhập tên chức danh!');
      return;
    }

    dataService.saveDropdownOption('positions', payload);
    message.success(`Đã lưu chức danh "${payload.name}" thành công!`);
    setModalOpen(false);
    setEditingItem(null);
    form.resetFields();
    setRefreshKey((k) => k + 1);
  };

  const handleDelete = (item: DropdownOptionItem) => {
    Modal.confirm({
      title: 'Xác nhận xóa chức danh?',
      content: `Bạn có chắc chắn muốn xóa chức danh "${item.name}" không?`,
      okText: 'Xóa',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: () => {
        dataService.deleteDropdownOption('positions', item.id);
        message.success(`Đã xóa chức danh "${item.name}".`);
        setRefreshKey((k) => k + 1);
      },
    });
  };

  const handleResetDefaults = () => {
    Modal.confirm({
      title: 'Khôi phục danh sách chức danh mặc định?',
      content: 'Toàn bộ danh mục Chức danh đảm nhiệm sẽ được đặt lại theo danh sách tiêu chuẩn ban đầu của hệ thống.',
      okText: 'Khôi phục',
      cancelText: 'Hủy',
      onOk: () => {
        dataService.resetDropdownDefaults('positions');
        message.success('Đã khôi phục danh sách chức danh mặc định thành công.');
        setRefreshKey((k) => k + 1);
      },
    });
  };

  const PRESET_COLORS = [
    '#009688', // Teal
    '#2563EB', // Blue
    '#16A34A', // Green
    '#DC2626', // Red
    '#EA580C', // Orange
    '#D97706', // Amber
    '#7C3AED', // Purple
    '#DB2777', // Pink
    '#475569', // Slate
  ];

  const columns: any = [
    {
      title: 'STT',
      key: 'stt',
      width: 60,
      render: (_: any, __: any, index: number) => (
        <span style={{ color: '#64748B', fontWeight: 500 }}>{index + 1}</span>
      ),
    },
    {
      title: 'Tên chức danh',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: DropdownOptionItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: record.color || '#009688',
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 600, color: '#0F172A', fontSize: 13.5 }}>{name}</span>
        </div>
      ),
    },
    {
      title: 'Mã chức danh',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) =>
        code ? (
          <Tag color="geekblue" style={{ fontWeight: 600, fontSize: 12 }}>
            {code}
          </Tag>
        ) : (
          <span style={{ color: '#94A3B8' }}>—</span>
        ),
    },
    {
      title: 'Mô tả vai trò',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string) =>
        desc ? (
          <span style={{ color: '#475569', fontSize: 13 }}>{desc}</span>
        ) : (
          <span style={{ color: '#CBD5E1', fontStyle: 'italic' }}>Chưa có mô tả</span>
        ),
    },
    {
      title: 'Thứ tự',
      dataIndex: 'order',
      key: 'order',
      width: 90,
      align: 'center',
      render: (order: number, _: any, index: number) => (
        <span style={{ fontWeight: 600, color: '#334155' }}>{order || index + 1}</span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 130,
      align: 'center',
      render: (isActive: boolean) =>
        isActive !== false ? (
          <Tag color="success" style={{ fontWeight: 600 }}>
            <CheckOutlined /> Hoạt động
          </Tag>
        ) : (
          <Tag color="default" style={{ fontWeight: 600 }}>
            <CloseOutlined /> Tạm tắt
          </Tag>
        ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 100,
      align: 'center',
      render: (_: any, record: DropdownOptionItem) => (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
            title="Chỉnh sửa"
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
            title="Xóa"
          />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '20px 24px', width: '100%', boxSizing: 'border-box' }}>
      {/* Top Header & Toolbar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background: '#E0F2F1',
              color: '#00796B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
            }}
          >
            <IdcardOutlined />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
                Chức danh đảm nhiệm
              </h1>
              <Tag color="cyan" style={{ margin: 0, fontWeight: 600 }}>
                {options.length} chức danh
              </Tag>
            </div>
            <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
              Cấu hình danh mục chức vụ, vị trí công tác của nhân sự trong toàn công ty.
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên chức danh, mã..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 250 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} onClick={handleResetDefaults}>
            Khôi phục mặc định
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenAdd}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm chức danh
          </Button>
        </div>
      </div>

      {/* Main Single Clean Data Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredOptions}
          columns={columns}
          rowKey="id"
          pagination={{
            pageSize: 12,
            showSizeChanger: true,
            showTotal: (total, range) => (
              <span style={{ fontSize: 13, color: '#64748B' }}>
                Hiển thị {range[0]}-{range[1]} trên tổng số {total} chức danh
              </span>
            ),
          }}
        />
      </div>

      {/* MODAL: THÊM / SỬA CHỨC DANH */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={editingItem ? `Chỉnh sửa chức danh: ${editingItem.name}` : 'Thêm chức danh đảm nhiệm mới'}
        width={540}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 14 }}>
          <Form.Item
            name="name"
            label="Tên chức danh"
            rules={[{ required: true, message: 'Vui lòng nhập tên chức danh' }]}
          >
            <Input placeholder="Ví dụ: Kỹ sư Phần mềm Cao cấp, Trưởng Phòng Kinh Doanh..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã chức danh">
              <Input placeholder="Ví dụ: SR_DEV, TECH_LEAD..." />
            </Form.Item>

            <Form.Item name="order" label="Thứ tự hiển thị">
              <Input type="number" min={1} placeholder="1, 2, 3..." />
            </Form.Item>
          </div>

          <Form.Item name="color" label="Màu sắc đại diện">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => form.setFieldsValue({ color: c })}
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: c,
                    border: form.getFieldValue('color') === c ? '2px solid #0F172A' : '2px solid transparent',
                    cursor: 'pointer',
                    outline: 'none',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                  }}
                />
              ))}
              <Input
                style={{ width: 110, marginLeft: 6 }}
                placeholder="#009688"
                onChange={(e) => form.setFieldsValue({ color: e.target.value })}
              />
            </div>
          </Form.Item>

          <Form.Item name="description" label="Mô tả vai trò / Nhiệm vụ">
            <Input.TextArea rows={3} placeholder="Mô tả tóm tắt vai trò, trách nhiệm của vị trí công tác này..." />
          </Form.Item>

          <Form.Item name="isActive" label="Trạng thái">
            <Select
              options={[
                { label: 'Hoạt động (Hiển thị trong menu lựa chọn nhân sự)', value: true },
                { label: 'Tạm tắt (Ẩn khỏi menu lựa chọn nhân sự)', value: false },
              ]}
            />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingBottom: 4 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              htmlType="submit"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              {editingItem ? 'Lưu thay đổi' : 'Thêm chức danh'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
