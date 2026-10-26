import React, { useState, useMemo, useEffect } from 'react';
import {
  IdcardOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  CheckOutlined,
  CloseOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  CalendarOutlined,
  ReadOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  BgColorsOutlined,
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
import { dataService, DropdownOptionItem, DropdownGroup } from '../../services/dataService';

const ENTERPRISE_PALETTE = [
  { name: 'Xanh ngọc', hex: '#009688' },
  { name: 'Xanh lam', hex: '#2563EB' },
  { name: 'Xanh da trời', hex: '#0284C7' },
  { name: 'Xanh lục', hex: '#16A34A' },
  { name: 'Xanh ngọc bích', hex: '#059669' },
  { name: 'Đỏ tươi', hex: '#DC2626' },
  { name: 'Đỏ hồng', hex: '#E11D48' },
  { name: 'Cam đất', hex: '#EA580C' },
  { name: 'Vàng hổ phách', hex: '#D97706' },
  { name: 'Tím đậm', hex: '#7C3AED' },
  { name: 'Tím hoa cà', hex: '#8B5CF6' },
  { name: 'Hồng phấn', hex: '#DB2777' },
  { name: 'Chàm Indigo', hex: '#4F46E5' },
  { name: 'Xám than', hex: '#475569' },
  { name: 'Xám đậm', hex: '#334155' },
  { name: 'Đen thanh lịch', hex: '#18181B' },
];

export const AdminDropMenuModule: React.FC = () => {
  const groups: DropdownGroup[] = useMemo(() => dataService.getDropdownGroups(), []);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string>('positions');
  const [searchText, setSearchText] = useState('');

  const currentGroup = useMemo(() => {
    return groups.find((g) => g.key === selectedGroupKey) || groups[0];
  }, [groups, selectedGroupKey]);

  const [options, setOptions] = useState<DropdownOptionItem[]>(() =>
    dataService.getDropdownOptions(selectedGroupKey)
  );

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DropdownOptionItem | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>('#009688');
  const [form] = Form.useForm();

  useEffect(() => {
    let alive = true;
    const initialOptions = dataService.getDropdownOptions(selectedGroupKey);
    setOptions([...initialOptions]);

    dataService
      .fetchDropdownOptions(selectedGroupKey)
      .then((rows) => {
        if (alive && rows && rows.length > 0) {
          setOptions([...rows]);
        }
      })
      .catch(() => {
        if (alive) setOptions([...dataService.getDropdownOptions(selectedGroupKey)]);
      });

    const unsub = dataService.subscribe(() => {
      if (alive) {
        setOptions([...dataService.getDropdownOptions(selectedGroupKey)]);
      }
    });

    return () => {
      alive = false;
      unsub();
    };
  }, [selectedGroupKey]);

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
    form.resetFields();
    setSelectedColor('#009688');
    const nextOrder = options.length > 0 ? Math.max(...options.map((o) => o.order || 0)) + 1 : 1;
    form.setFieldsValue({
      name: '',
      code: '',
      color: '#009688',
      order: nextOrder,
      description: '',
      isActive: true,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (item: DropdownOptionItem) => {
    setEditingItem(item);
    form.resetFields();
    const colorVal = item.color || '#009688';
    setSelectedColor(colorVal);
    form.setFieldsValue({
      name: item.name,
      code: item.code || '',
      color: colorVal,
      order: item.order || 1,
      description: item.description || '',
      isActive: item.isActive !== false,
    });
    setModalOpen(true);
  };

  const handleColorChange = (newColor: string) => {
    setSelectedColor(newColor);
    form.setFieldsValue({ color: newColor });
  };

  const handleSave = (values: any) => {
    const name = String(values.name || '').trim();
    if (!name) {
      message.error(selectedGroupKey === 'positions' ? 'Vui lòng nhập tên chức danh!' : 'Vui lòng nhập tên mục danh mục!');
      return;
    }

    const code = values.code != null ? String(values.code).trim() : '';

    const payload: DropdownOptionItem = {
      id: editingItem ? editingItem.id : `opt-${selectedGroupKey}-${Date.now()}`,
      name,
      code,
      color: selectedColor || values.color || '#009688',
      order: Number(values.order || 1),
      description: values.description ? String(values.description).trim() : '',
      isActive: values.isActive !== false,
    };

    const updated = dataService.saveDropdownOption(selectedGroupKey, payload);
    setOptions([...updated]);
    message.success(`Đã lưu "${payload.name}" thành công!`);
    setModalOpen(false);
    setEditingItem(null);
    form.resetFields();
  };

  const handleDelete = (item: DropdownOptionItem) => {
    Modal.confirm({
      title: 'Xác nhận xóa mục cấu hình?',
      content: `Bạn có chắc chắn muốn xóa "${item.name}" khỏi danh mục ${currentGroup.title} không?`,
      okText: 'Xóa',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: () => {
        const updated = dataService.deleteDropdownOption(selectedGroupKey, item.id);
        setOptions([...updated]);
        message.success(`Đã xóa "${item.name}".`);
      },
    });
  };

  const handleResetDefaults = () => {
    Modal.confirm({
      title: `Khôi phục mặc định danh mục "${currentGroup.title}"?`,
      content: `Toàn bộ danh mục "${currentGroup.title}" sẽ được đặt lại theo danh sách tiêu chuẩn ban đầu của hệ thống.`,
      okText: 'Khôi phục',
      cancelText: 'Hủy',
      onOk: () => {
        const defaults = dataService.resetDropdownDefaults(selectedGroupKey);
        setOptions([...defaults]);
        message.success(`Đã khôi phục danh mục "${currentGroup.title}" mặc định thành công.`);
      },
    });
  };

  const getGroupIcon = (key: string) => {
    switch (key) {
      case 'positions': return <IdcardOutlined />;
      case 'work_statuses': return <CheckCircleOutlined />;
      case 'contract_types': return <FileTextOutlined />;
      case 'leave_types': return <CalendarOutlined />;
      case 'academic_levels': return <ReadOutlined />;
      case 'job_ranks': return <ApartmentOutlined />;
      case 'asset_categories': return <AppstoreOutlined />;
      default: return <IdcardOutlined />;
    }
  };

  const isPositionsGroup = selectedGroupKey === 'positions';

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
      title: isPositionsGroup ? 'Tên chức danh' : 'Tên mục hiển thị',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: DropdownOptionItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: record.color || '#009688',
              flexShrink: 0,
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
          <span style={{ fontWeight: 600, color: '#0F172A', fontSize: 13.5 }}>{name}</span>
        </div>
      ),
    },
    {
      title: isPositionsGroup ? 'Mã chức danh' : 'Mã định danh',
      dataIndex: 'code',
      key: 'code',
      width: 150,
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
      title: 'Mô tả chi tiết',
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
      {/* Group Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          paddingBottom: 12,
          marginBottom: 16,
          borderBottom: '1px solid #E2E8F0',
        }}
      >
        {groups.map((g) => {
          const active = g.key === selectedGroupKey;
          return (
            <button
              key={g.key}
              type="button"
              onClick={() => {
                setSelectedGroupKey(g.key);
                setSearchText('');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 6,
                border: active ? '1px solid #009688' : '1px solid #E2E8F0',
                background: active ? '#E0F2F1' : '#FFFFFF',
                color: active ? '#00796B' : '#475569',
                fontWeight: active ? 700 : 500,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {getGroupIcon(g.key)}
              <span>{g.title}</span>
            </button>
          );
        })}
      </div>

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
            {getGroupIcon(currentGroup.key)}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0F172A' }}>
                {currentGroup.title}
              </h1>
              <Tag color="cyan" style={{ margin: 0, fontWeight: 600 }}>
                {options.length} {isPositionsGroup ? 'chức danh' : 'mục'}
              </Tag>
            </div>
            <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
              {currentGroup.description}
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder={isPositionsGroup ? 'Tìm theo tên chức danh, mã...' : 'Tìm theo tên, mã...'}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 240 }}
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
            {isPositionsGroup ? 'Thêm chức danh' : 'Thêm mới'}
          </Button>
        </div>
      </div>

      {/* Main Clean Data Table */}
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
                Hiển thị {range[0]}-{range[1]} trên tổng số {total} {isPositionsGroup ? 'chức danh' : 'mục'}
              </span>
            ),
          }}
        />
      </div>

      {/* MODAL: THÊM / SỬA MỤC DROPDOWN */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={editingItem ? `Chỉnh sửa: ${editingItem.name}` : `Thêm ${isPositionsGroup ? 'chức danh' : 'mục'} mới vào ${currentGroup.title}`}
        width={580}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 14 }}>
          <Form.Item
            name="name"
            label={isPositionsGroup ? 'Tên chức danh' : 'Tên mục hiển thị'}
            rules={[{ required: true, message: `Vui lòng nhập ${isPositionsGroup ? 'tên chức danh' : 'tên mục'}` }]}
          >
            <Input placeholder={isPositionsGroup ? 'Ví dụ: Kỹ sư Phần mềm, Trưởng Phòng Kinh Doanh...' : `Nhập tên cho ${currentGroup.title.toLowerCase()}...`} />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label={isPositionsGroup ? 'Mã chức danh' : 'Mã định danh'}>
              <Input autoComplete="off" placeholder="Nhập mã..." allowClear />
            </Form.Item>

            <Form.Item name="order" label="Thứ tự hiển thị">
              <Input type="number" min={1} placeholder="1, 2, 3..." />
            </Form.Item>
          </div>

          {/* BẢNG CHỌN MÀU SẮC ĐẠI DIỆN TRỰC QUAN */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 13.5, fontWeight: 600, color: '#334155' }}>
              Màu sắc đại diện:
            </label>
            <div
              style={{
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                padding: '12px 14px',
                background: '#F8FAFC',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {/* Swatches Grid */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                {ENTERPRISE_PALETTE.map((c) => {
                  const isSelected = selectedColor.toLowerCase() === c.hex.toLowerCase();
                  return (
                    <Tooltip key={c.hex} title={`${c.name} (${c.hex})`}>
                      <button
                        type="button"
                        onClick={() => handleColorChange(c.hex)}
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 6,
                          background: c.hex,
                          border: isSelected ? '2px solid #0F172A' : '1px solid rgba(0,0,0,0.12)',
                          cursor: 'pointer',
                          outline: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: isSelected ? '0 0 0 2px #E0F2F1, 0 2px 4px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.1)',
                          transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {isSelected && <CheckOutlined style={{ color: '#FFFFFF', fontSize: 14, fontWeight: 700 }} />}
                      </button>
                    </Tooltip>
                  );
                })}
              </div>

              {/* Custom Color Wheel / Hex Input Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  paddingTop: 8,
                  borderTop: '1px dashed #CBD5E1',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => handleColorChange(e.target.value)}
                    style={{
                      width: 34,
                      height: 34,
                      padding: 0,
                      border: '1px solid #CBD5E1',
                      borderRadius: 6,
                      cursor: 'pointer',
                      background: '#FFFFFF',
                    }}
                    title="Bấm để mở bảng màu phổ quang tự do"
                  />
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>
                    Tự chọn màu:
                  </span>
                </div>

                <Input
                  value={selectedColor}
                  onChange={(e) => handleColorChange(e.target.value)}
                  placeholder="#009688"
                  style={{ width: 120, fontFamily: 'monospace', fontWeight: 600 }}
                  prefix={
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: selectedColor,
                        display: 'inline-block',
                        marginRight: 4,
                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                      }}
                    />
                  }
                />

                <span style={{ fontSize: 12, color: '#64748B' }}>
                  
                </span>
              </div>
            </div>
          </div>

          <Form.Item name="description" label="Mô tả ghi chú">
            <Input.TextArea rows={3} placeholder="Mô tả tóm tắt vai trò, trách nhiệm hoặc ý nghĩa..." />
          </Form.Item>

          <Form.Item name="isActive" label="Trạng thái">
            <Select
              options={[
                { label: 'Hoạt động', value: true },
                { label: 'Tạm tắt', value: false },
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
              {editingItem ? 'Lưu thay đổi' : 'Thêm mới'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
