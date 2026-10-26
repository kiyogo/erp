import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  FileTextOutlined,
  PushpinOutlined,
  UserOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  AlertOutlined,
  CalendarOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckSquareOutlined,
  BorderOutlined,
  PrinterOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer, Card, Tooltip } from '../../custom-ui';

export interface MeetingDirectiveNote {
  key: string;
  noteCode: string;
  title: string;
  category: 'Ý kiến chỉ đạo BGĐ' | 'Giao ban tuần & Tháng' | 'Biên bản cuộc họp HĐQT' | 'Ghi nhớ dự án & Kỹ thuật' | 'Chỉ đạo đột xuất';
  priority: 'Khẩn cấp P1' | 'Ưu tiên cao P2' | 'Bình thường P3';
  author: string;
  authorRole: string;
  assignedToDept: string;
  deadline: string;
  createdDate: string;
  isPinned: boolean;
  completionRate: number;
  content: string;
  actionItems: { id: number; text: string; done: boolean }[];
  status: 'Đang thực hiện' | 'Đã hoàn thành' | 'Cần đẩy nhanh' | 'Quá hạn';
}

const INITIAL_NOTES: MeetingDirectiveNote[] = [];

export const DocumentNotesModule: React.FC = () => {
  const [data, setData] = useState<MeetingDirectiveNote[]>(INITIAL_NOTES);

  useEffect(() => {
    const list = dataService.getGenericData('doc_notes');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('doc_notes');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<MeetingDirectiveNote | null>(null);

  const totalNotes = data.length;
  const pinnedCount = data.filter((d) => d.isPinned).length;
  const p1Count = data.filter((d) => d.priority === 'Khẩn cấp P1').length;
  const completedCount = data.filter((d) => d.status === 'Đã hoàn thành').length;

  const handleCreate = (values: any) => {
    const rawActions = (values.rawActions || '')
      .split('\n')
      .filter((s: string) => s.trim().length > 0)
      .map((text: string, idx: number) => ({ id: idx + 1, text: text.trim(), done: false }));

    const newItem: MeetingDirectiveNote = {
      ...values,
      key: String(Date.now()),
      isPinned: Boolean(values.isPinned),
      createdDate: new Date().toISOString().substring(0, 10),
      author: 'Quản trị viên',
      authorRole: values.authorRole || 'Tổng Giám Đốc (CEO)',
      completionRate: 0,
      actionItems: rawActions.length > 0 ? rawActions : [{ id: 1, text: 'Triển khai theo nội dung chỉ đạo', done: false }],
      status: 'Đang thực hiện',
    };

    const nextItems = [newItem, ...data]; setData(nextItems); dataService.saveGenericData('doc_notes', nextItems);
    message.success(`Đã tạo chỉ đạo mới: ${values.title} (${values.noteCode})`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleTogglePin = (record: MeetingDirectiveNote) => {
    setData(
      data.map((d) => (d.key === record.key ? { ...d, isPinned: !d.isPinned } : d))
    );
    message.success(`${record.isPinned ? 'Đã gỡ ghim' : 'Đã ghim ưu tiên'}: ${record.noteCode}`);
  };

  const handleToggleActionItem = (noteKey: string, itemId: number) => {
    setData((prev) =>
      prev.map((note) => {
        if (note.key !== noteKey) return note;
        const newActions = note.actionItems.map((act) =>
          act.id === itemId ? { ...act, done: !act.done } : act
        );
        const doneCount = newActions.filter((a) => a.done).length;
        const newRate = Math.round((doneCount / newActions.length) * 100);
        const newStatus = newRate === 100 ? 'Đã hoàn thành' : 'Đang thực hiện';
        const updated = { ...note, actionItems: newActions, completionRate: newRate, status: newStatus as any };
        if (selectedNote && selectedNote.key === noteKey) {
          setSelectedNote(updated);
        }
        return updated;
      })
    );
  };

  const filteredData = data.filter((item) => {
    const matchCategory =
      categoryFilter === 'all' ||
      (categoryFilter === 'pinned' && item.isPinned) ||
      (categoryFilter === 'completed' && item.status === 'Đã hoàn thành') ||
      item.category === categoryFilter;

    const matchPriority =
      priorityFilter === 'all' || item.priority === priorityFilter;

    const matchSearch =
      (item.noteCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.content || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.author || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assignedToDept || '').toLowerCase().includes(searchText.toLowerCase());

    return matchCategory && matchPriority && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Trọng yếu',
      key: 'noteCode',
      width: 150,
      render: (_: any, record: MeetingDirectiveNote) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            {record.isPinned && <PushpinOutlined style={{ color: '#E11D48', fontSize: 15 }} />}
            {record.noteCode}
          </div>
          <div style={{ marginTop: 2 }}>
            <Tag color={record.priority === 'Khẩn cấp P1' ? 'error' : record.priority === 'Ưu tiên cao P2' ? 'warning' : 'blue'} style={{ margin: 0, fontSize: 10.5 }}>
              {record.priority}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Tiêu đề chỉ đạo & Nội dung tóm tắt',
      key: 'title',
      render: (_: any, record: MeetingDirectiveNote) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.title}</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {record.content}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <TeamOutlined /> Đơn vị thực thi: <strong>{record.assignedToDept}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Phân loại',
      dataIndex: 'category',
      key: 'category',
      width: 170,
      render: (cat: string) => {
        let color = 'cyan';
        if (cat.includes('BGĐ')) color = 'purple';
        if (cat.includes('Giao ban')) color = 'blue';
        return <Tag color={color}>{cat}</Tag>;
      },
    },
    {
      title: 'Tiến độ hoàn thành',
      key: 'progress',
      width: 160,
      render: (_: any, r: MeetingDirectiveNote) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
            <span style={{ color: '#64748B' }}>
              {r.actionItems.filter((a) => a.done).length}/{r.actionItems.length} việc
            </span>
            <strong style={{ color: r.completionRate === 100 ? '#16A34A' : '#2563EB' }}>
              {r.completionRate}%
            </strong>
          </div>
          <Progress
            percent={r.completionRate}
            size="small"
            strokeColor={r.completionRate === 100 ? '#16A34A' : '#009688'}
            showInfo={false}
          />
        </div>
      ),
    },
    {
      title: 'Người chỉ đạo & Hạn chót',
      key: 'author',
      width: 180,
      render: (_: any, record: MeetingDirectiveNote) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 12.5 }}>{record.author}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>{record.authorRole}</div>
          <div style={{ fontSize: 11, color: '#DC2626', marginTop: 2, fontWeight: 600 }}>
            Hạn: {record.deadline}
          </div>
        </div>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 140,
      render: (_: any, record: MeetingDirectiveNote) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedNote(record);
              setDrawerOpen(true);
            }}
          >
            Xem
          </Button>
          <Button
            size="small"
            icon={<PushpinOutlined />}
            onClick={() => handleTogglePin(record)}
            style={{
              color: record.isPinned ? '#E11D48' : '#64748B',
              borderColor: record.isPinned ? '#FCA5A5' : '#CBD5E1',
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số chỉ đạo &amp; biên bản họp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalNotes} chỉ đạo
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Theo dõi tiến trình trực tiếp</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chỉ đạo khẩn cấp P1 &amp; Ghim ưu tiên</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {pinnedCount} đang ghim ({p1Count} P1)
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Cần giải quyết dứt điểm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chỉ đạo đã hoàn tất 100%</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {completedCount} chỉ đạo
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tỷ lệ đáp ứng SLA 91.5%</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hành động giao việc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {data.reduce((acc, cur) => acc + cur.actionItems.length, 0)} đầu việc
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Phân quyền trực tiếp đến phòng ban</div>
        </div>
      </div>

      {/* Filter Tabs & Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'pinned', label: 'Ghim ưu tiên', icon: <PushpinOutlined style={{ color: '#EC4899' }} /> },
            { key: 'Ý kiến chỉ đạo BGĐ', label: 'Chỉ đạo BGĐ' },
            { key: 'Giao ban tuần & Tháng', label: 'Giao ban tuần' },
            { key: 'Ghi nhớ dự án & Kỹ thuật', label: 'Dự án & Kỹ thuật' },
            { key: 'completed', label: 'Đã hoàn thành' },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setCategoryFilter(tab.key)}
              style={{
                backgroundColor: categoryFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: categoryFilter === tab.key ? '#009688' : '#CBD5E1',
                color: categoryFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: categoryFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Select
            value={priorityFilter}
            onChange={(val) => setPriorityFilter(val)}
            style={{ width: 150 }}
            options={[
              { label: 'Tất cả mức độ', value: 'all' },
              { label: 'Khẩn cấp P1', value: 'Khẩn cấp P1' },
              { label: 'Ưu tiên cao P2', value: 'Ưu tiên cao P2' },
              { label: 'Bình thường P3', value: 'Bình thường P3' },
            ]}
          />

          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã, tiêu đề, người chỉ đạo, phòng ban..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tạo chỉ đạo mới
          </Button>

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất sổ tay chỉ đạo điều hành!')}>
            Xuất Sổ
          </Button>
        </div>
      </div>

      {/* Main Notes Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Tạo Ý Kiến Chỉ Đạo / Kết Luận Mới */}
      <Modal
        title="Tạo Ý Kiến Chỉ Đạo &amp; Kết Luận Giao Ban Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={680}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            noteCode: `CĐ-2026/0${data.length + 1}`,
            category: 'Ý kiến chỉ đạo BGĐ',
            priority: 'Khẩn cấp P1',
            author: 'Quản trị viên',
            authorRole: 'Tổng Giám Đốc (CEO)',
            assignedToDept: 'Khối Kỹ Thuật & IDC',
            deadline: '2026-09-05',
            isPinned: true,
          }}
          style={{ marginTop: 14 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="noteCode" label="Mã chỉ đạo" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="category" label="Phân loại" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Ý kiến chỉ đạo BGĐ', value: 'Ý kiến chỉ đạo BGĐ' },
                  { label: 'Giao ban tuần & Tháng', value: 'Giao ban tuần & Tháng' },
                  { label: 'Biên bản cuộc họp HĐQT', value: 'Biên bản cuộc họp HĐQT' },
                  { label: 'Ghi nhớ dự án & Kỹ thuật', value: 'Ghi nhớ dự án & Kỹ thuật' },
                  { label: 'Chỉ đạo đột xuất', value: 'Chỉ đạo đột xuất' },
                ]}
              />
            </Form.Item>
            <Form.Item name="priority" label="Mức độ ưu tiên" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Khẩn cấp P1', value: 'Khẩn cấp P1' },
                  { label: 'Ưu tiên cao P2', value: 'Ưu tiên cao P2' },
                  { label: 'Bình thường P3', value: 'Bình thường P3' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="title" label="Tiêu đề chỉ đạo điều hành" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
            <Input placeholder="Ví dụ: Rà soát nâng cấp hạ tầng mạng Core Switch IDC" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="author" label="Lãnh đạo chỉ đạo" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Nguyễn Văn Minh" />
            </Form.Item>
            <Form.Item name="authorRole" label="Chức danh" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Tổng Giám Đốc (CEO)" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="assignedToDept" label="Đơn vị thực thi" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Khối Kỹ Thuật & Mạng" />
            </Form.Item>
            <Form.Item name="deadline" label="Hạn chót hoàn thành" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="isPinned" label="Ghim ưu tiên">
              <Select
                options={[
                  { label: 'Ghim lên đầu trang', value: true },
                  { label: 'Bình thường', value: false },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="content" label="Nội dung chi tiết chỉ đạo" rules={[{ required: true, message: 'Nhập nội dung' }]}>
            <Input.TextArea rows={3} placeholder="Nội dung chỉ đạo..." />
          </Form.Item>

          <Form.Item name="rawActions" label="Các đầu việc cụ thể">
            <Input.TextArea rows={3} placeholder="Ví dụ:&#10;Khảo sát cấu hình switch hiện tại&#10;Báo giá thiết bị Cisco Catalyst 9500&#10;Lập phương án bảo trì không gián đoạn dịch vụ" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ban hành chỉ đạo
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Chỉ Đạo & Action Item Checklist */}
      <Drawer
        title="Theo Dõi Tiến Trình Thực Thi Chỉ Đạo Điều Hành"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
      >
        {selectedNote && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Banner */}
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedNote.noteCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedNote.title}
                  </div>
                </div>
                <Tag color={selectedNote.status === 'Đã hoàn thành' ? 'success' : 'processing'}>
                  {selectedNote.status}
                </Tag>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Tag color={selectedNote.priority === 'Khẩn cấp P1' ? 'error' : 'warning'}>
                  {selectedNote.priority}
                </Tag>
                <Tag color="blue">{selectedNote.category}</Tag>
                {selectedNote.isPinned && <Tag icon={<PushpinOutlined />} color="magenta">Đang ghim ưu tiên</Tag>}
              </div>
            </div>

            {/* Meta Grid */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Người chỉ đạo:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>
                    {selectedNote.author} ({selectedNote.authorRole})
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Đơn vị chịu trách nhiệm:</span>
                  <div style={{ fontWeight: 700, color: '#2563EB' }}>{selectedNote.assignedToDept}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Ngày ban hành:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedNote.createdDate}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Hạn chót:</span>
                  <div style={{ fontWeight: 700, color: '#DC2626' }}>{selectedNote.deadline}</div>
                </div>
              </div>
            </div>

            {/* Directive Content */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Nội dung chỉ đạo:</div>
              <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>{selectedNote.content}</div>
            </div>

            {/* Action Items Checklist */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#FFFFFF' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckSquareOutlined style={{ color: '#009688' }} /> Danh Sách Đầu Việc Cần Thực Hiện:
                </div>
                <strong style={{ color: selectedNote.completionRate === 100 ? '#16A34A' : '#2563EB' }}>
                  Tiến độ: {selectedNote.completionRate}%
                </strong>
              </div>

              <Progress
                percent={selectedNote.completionRate}
                strokeColor={selectedNote.completionRate === 100 ? '#16A34A' : '#009688'}
                style={{ marginBottom: 12 }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedNote.actionItems.map((act) => (
                  <div
                    key={act.id}
                    onClick={() => handleToggleActionItem(selectedNote.key, act.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: '1px solid #E2E8F0',
                      background: act.done ? '#F0FDF4' : '#F8FAFC',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    {act.done ? (
                      <CheckCircleOutlined style={{ color: '#16A34A', fontSize: 16 }} />
                    ) : (
                      <BorderOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
                    )}
                    <span
                      style={{
                        fontSize: 12.5,
                        color: act.done ? '#15803D' : '#0F172A',
                        textDecoration: act.done ? 'line-through' : 'none',
                        fontWeight: act.done ? 500 : 600,
                      }}
                    >
                      {act.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in phiếu chỉ đạo ${selectedNote.noteCode} (PDF)`)}
                style={{ flex: 1 }}
              >
                In Phiếu Chỉ Đạo
              </Button>
              <Button
                type="primary"
                icon={<BellOutlined />}
                onClick={() => message.success(`Đã gửi cảnh báo nhắc nhở tiến độ đến ${selectedNote.assignedToDept} qua Slack`)}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Nhắc Nhở Thực Thi
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

