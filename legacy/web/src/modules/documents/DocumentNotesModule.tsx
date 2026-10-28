import { dataService } from '../../services/dataService';
import React, { useEffect, useRef, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  PushpinOutlined,
  CheckCircleOutlined,
  TeamOutlined,
  EyeOutlined,
  CheckSquareOutlined,
  BorderOutlined,
  PrinterOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer } from '../../custom-ui';
import { useAuth } from '../../context/AuthContext';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { NOTE_CATEGORIES, NOTE_PRIORITIES, formatNoteDate, formatNoteTimestamp, noteCompletionRate, noteExportRows, noteStatus, parseNoteActionItems, type MeetingDirectiveNote } from './notesRules';

export type { MeetingDirectiveNote } from './notesRules';

function normalizeNotes(records: any[]): MeetingDirectiveNote[] {
  return records.map((record) => {
    const actionItems = Array.isArray(record.actionItems) ? record.actionItems : [];
    return {
      ...record,
      actionItems,
      completionRate: noteCompletionRate(actionItems),
      status: noteStatus({ ...record, actionItems }),
      history: Array.isArray(record.history) ? record.history : [],
      reminderHistory: Array.isArray(record.reminderHistory) ? record.reminderHistory : [],
    };
  });
}

export const DocumentNotesModule: React.FC = () => {
  const { user } = useAuth();
  const mounted = useRef(false);
  const [data, setData] = useState<MeetingDirectiveNote[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [notes, units] = await Promise.all([
        dataService.refreshGenericData('doc_notes'),
        dataService.refreshGenericData('business_org_units'),
      ]);
      if (!mounted.current) return;
      setData(normalizeNotes(Array.isArray(notes) ? notes : []));
      setDepartmentOptions(Array.from(new Set((Array.isArray(units) ? units : [])
        .filter((unit: any) => unit?.status !== 'Tạm ngưng' && unit?.isActive !== false && unit?.name)
        .map((unit: any) => String(unit.name).trim())
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'vi'))
        .map((name) => ({ label: name, value: name })));
    } catch (error: any) {
      if (mounted.current) message.error(error?.response?.data?.message || 'Không tải được sổ chỉ đạo và danh mục đơn vị.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = dataService.subscribe(() => {
      if (!mounted.current) return;
      const updated = normalizeNotes(dataService.getGenericData('doc_notes'));
      setData(updated);
      setSelectedNote((current) => current ? updated.find((note) => note.key === current.key) || current : current);
    });
    void loadData();
    return () => { mounted.current = false; unsubscribe(); };
  }, []);

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<MeetingDirectiveNote | null>(null);

  const currentData = data.map((note) => ({
    ...note,
    completionRate: noteCompletionRate(note.actionItems || []),
    status: noteStatus(note),
  }));
  const totalNotes = currentData.length;
  const pinnedCount = currentData.filter((note) => note.isPinned).length;
  const p1Count = currentData.filter((note) => note.priority === 'Khẩn cấp P1').length;
  const completedCount = currentData.filter((note) => note.status === 'Đã hoàn thành').length;
  const completionPercentage = totalNotes ? Math.round(completedCount * 100 / totalNotes) : null;

  const handleCreate = async (values: any) => {
    const noteCode = String(values.noteCode || '').trim();
    const title = String(values.title || '').trim();
    const author = String(values.author || '').trim();
    const authorRole = String(values.authorRole || '').trim();
    const assignedToDept = String(values.assignedToDept || '').trim();
    let actionItems;
    try {
      actionItems = parseNoteActionItems(String(values.rawActions || ''));
    } catch (error: any) {
      message.error(error?.message || 'Danh sách đầu việc không hợp lệ.');
      return;
    }
    if (!noteCode || !title || !author || !authorRole || !assignedToDept || !values.deadline || !values.content?.trim()) {
      message.error('Vui lòng nhập đủ thông tin chỉ đạo, đơn vị, hạn chót, nội dung và đầu việc.');
      return;
    }
    if (!departmentOptions.some((option) => option.value === assignedToDept)) {
      message.error('Đơn vị thực thi không còn hoạt động. Hãy tải lại danh mục.');
      return;
    }
    if (currentData.some((note) => note.noteCode.toLocaleLowerCase() === noteCode.toLocaleLowerCase())) {
      message.error('Mã chỉ đạo đã tồn tại. Vui lòng dùng mã khác.');
      return;
    }

    setSavingKey('create');
    try {
      const saved = await dataService.createGenericRecord('doc_notes', {
        key: noteCode,
        noteCode,
        title,
        category: values.category,
        priority: values.priority,
        author,
        authorRole,
        assignedToDept,
        deadline: values.deadline,
        isPinned: values.isPinned === true,
        content: String(values.content).trim(),
        actionItems,
      }) as MeetingDirectiveNote;
      setSelectedNote(normalizeNotes([saved])[0]);
      message.success(`Đã ban hành chỉ đạo ${saved.noteCode}.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu chỉ đạo. Vui lòng thử lại.');
    } finally {
      setSavingKey('');
    }
  };

  const updateNote = async (note: MeetingDirectiveNote, patch: Record<string, unknown>) => {
    if (savingKey) return;
    setSavingKey(note.key);
    try {
      const saved = await dataService.updateDocumentNote(note.key, patch);
      const updated = normalizeNotes([saved])[0];
      setSelectedNote((current) => current?.key === updated.key ? updated : current);
      return updated;
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu thay đổi. Vui lòng tải lại dữ liệu.');
      return undefined;
    } finally {
      setSavingKey('');
    }
  };

  const handleTogglePin = async (note: MeetingDirectiveNote) => {
    const updated = await updateNote(note, { isPinned: !note.isPinned });
    if (updated) message.success(updated.isPinned ? 'Đã ghim chỉ đạo ưu tiên.' : 'Đã gỡ ghim chỉ đạo.');
  };

  const handleToggleActionItem = async (note: MeetingDirectiveNote, itemId: number) => {
    const actionItems = (note.actionItems || []).map((item) => item.id === itemId ? { ...item, done: !item.done } : item);
    const updated = await updateNote(note, { actionItems });
    if (updated) setSelectedNote(updated);
  };

  const handleRemind = async (note: MeetingDirectiveNote) => {
    if (savingKey) return;
    setSavingKey(note.key);
    try {
      const result = await dataService.remindDocumentNote(note.key);
      const updated = normalizeNotes([result.record])[0];
      setSelectedNote(updated);
      message.success(`Đã gửi nhắc việc đến ${result.recipientCount} nhân sự của ${note.assignedToDept}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể gửi nhắc việc nội bộ.');
    } finally {
      setSavingKey('');
    }
  };

  const exportNotes = () => {
    if (!filteredData.length) {
      message.info('Không có chỉ đạo phù hợp để xuất.');
      return;
    }
    downloadFile('So_chi_dao_dieu_hanh.xlsx', generateValidXlsxBlob(noteExportRows(filteredData)));
  };

  const printNote = (note: MeetingDirectiveNote) => downloadFile(
    `${note.noteCode.replace(/[^a-z0-9_-]/gi, '_')}_chi_dao.pdf`,
    generateValidPdfBlob('PHIEU CHI DAO DIEU HANH', `${note.noteCode} | ${note.title}`, [
      `Phan loai: ${note.category}`,
      `Muc do: ${note.priority}`,
      `Nguoi chi dao: ${note.author}`,
      `Chuc danh: ${note.authorRole}`,
      `Don vi thuc thi: ${note.assignedToDept}`,
      `Ngay ban hanh: ${formatNoteDate(note.createdDate)}`,
      `Han chot: ${formatNoteDate(note.deadline)}`,
      `Trang thai: ${note.status}`,
      `Tien do: ${note.completionRate}%`,
      `Noi dung: ${note.content}`,
      'Danh sach dau viec:', ...(note.actionItems || []).map((item) => `${item.done ? '[x]' : '[ ]'} ${item.text}`),
      `So lan gui nhac viec: ${note.reminderHistory?.length ?? 0}`,
    ]),
  );

  const filteredData = currentData.filter((item) => {
    const matchCategory =
      categoryFilter === 'all' ||
      (categoryFilter === 'pinned' && item.isPinned) ||
      (categoryFilter === 'completed' && item.status === 'Đã hoàn thành') ||
      (categoryFilter === 'overdue' && item.status === 'Quá hạn') ||
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
      title: 'Mã và mức độ ưu tiên',
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
      title: 'Tiêu đề và nội dung tóm tắt',
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
              {(r.actionItems || []).filter((a) => a.done).length}/{(r.actionItems || []).length} việc
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
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 145,
      render: (status: string) => <Tag color={status === 'Đã hoàn thành' ? 'success' : status === 'Quá hạn' ? 'error' : status === 'Cần đẩy nhanh' ? 'warning' : 'processing'}>{status}</Tag>,
    },
    {
      title: 'Người chỉ đạo & Hạn chót',
      key: 'author',
      width: 180,
      render: (_: any, record: MeetingDirectiveNote) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 12.5 }}>{record.author}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>{record.authorRole}</div>
          <div style={{ fontSize: 11, color: record.status === 'Quá hạn' ? '#DC2626' : '#64748B', marginTop: 2, fontWeight: 600 }}>
            Hạn: {formatNoteDate(record.deadline)}
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
            onClick={() => void handleTogglePin(record)}
            disabled={Boolean(savingKey)}
            loading={savingKey === record.key}
            aria-label={record.isPinned ? 'Gỡ ghim chỉ đạo' : 'Ghim chỉ đạo'}
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
                    <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Theo dõi đầu việc theo đơn vị</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chỉ đạo khẩn cấp P1 &amp; Ghim ưu tiên</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {pinnedCount} ghim · {p1Count} P1
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Cần giải quyết dứt điểm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chỉ đạo đã hoàn thành</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {completedCount} chỉ đạo
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tỷ lệ chỉ đạo hoàn tất: {completionPercentage === null ? 'Chưa đủ dữ liệu' : `${completionPercentage}%`}</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hành động giao việc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {currentData.reduce((acc, cur) => acc + (cur.actionItems || []).length, 0)} đầu việc
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
            { key: NOTE_CATEGORIES[0], label: 'Chỉ đạo BGĐ' },
            { key: NOTE_CATEGORIES[1], label: 'Giao ban tuần' },
            { key: NOTE_CATEGORIES[3], label: 'Dự án và kỹ thuật' },
            { key: 'completed', label: 'Đã hoàn thành' },
            { key: 'overdue', label: 'Quá hạn' },
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
            placeholder="Tìm theo mã, tiêu đề, người chỉ đạo, đơn vị..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={loading || Boolean(savingKey)}
            onClick={() => {
              if (!departmentOptions.length) {
                message.error('Chưa có đơn vị đang hoạt động trong danh mục.');
                return;
              }
              form.resetFields();
              form.setFieldsValue({
                noteCode: `CD-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                category: NOTE_CATEGORIES[0],
                priority: NOTE_PRIORITIES[2],
                author: user?.name || '',
                isPinned: false,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tạo chỉ đạo mới
          </Button>

          <Button icon={<DownloadOutlined />} onClick={exportNotes} disabled={loading || filteredData.length === 0}>
            Xuất sổ
          </Button>
        </div>
      </div>

      {/* Main Notes Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} loading={loading} />
      </div>

      {/* MODAL: Tạo Ý Kiến Chỉ Đạo / Kết Luận Mới */}
      <Modal
        title="Tạo chỉ đạo và kết luận giao ban"
        open={modalOpen}
        onCancel={() => { if (savingKey !== 'create') setModalOpen(false); }}
        footer={null}
        width={680}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          style={{ marginTop: 14 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Form.Item name="noteCode" label="Mã chỉ đạo" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập mã chỉ đạo.' }]}>
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item name="category" label="Phân loại" rules={[{ required: true, message: 'Vui lòng chọn phân loại.' }]}>
              <Select options={NOTE_CATEGORIES.map((category) => ({ label: category, value: category }))} />
            </Form.Item>
            <Form.Item name="priority" label="Mức độ ưu tiên" rules={[{ required: true, message: 'Vui lòng chọn mức độ ưu tiên.' }]}>
              <Select options={NOTE_PRIORITIES.map((priority) => ({ label: priority, value: priority }))} />
            </Form.Item>
          </div>

          <Form.Item name="title" label="Tiêu đề chỉ đạo điều hành" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tiêu đề.' }]}>
            <Input maxLength={300} />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="author" label="Người chỉ đạo" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập người chỉ đạo.' }]}>
              <Input maxLength={160} />
            </Form.Item>
            <Form.Item name="authorRole" label="Chức danh" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập chức danh.' }]}>
              <Input maxLength={160} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Form.Item name="assignedToDept" label="Đơn vị thực thi" rules={[{ required: true, message: 'Vui lòng chọn đơn vị thực thi.' }]}>
              <Select options={departmentOptions} />
            </Form.Item>
            <Form.Item name="deadline" label="Hạn chót hoàn thành" rules={[{ required: true, message: 'Vui lòng chọn hạn chót.' }]}>
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

          <Form.Item name="content" label="Nội dung chi tiết chỉ đạo" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập nội dung.' }]}>
            <Input.TextArea rows={3} maxLength={4000} />
          </Form.Item>

          <Form.Item name="rawActions" label="Các đầu việc cụ thể" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập ít nhất một đầu việc.' }]}>
            <Input.TextArea rows={3} maxLength={4000} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 14 }}>
            <Button onClick={() => setModalOpen(false)} disabled={savingKey === 'create'}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={savingKey === 'create'} disabled={Boolean(savingKey)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Header Banner */}
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedNote.noteCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedNote.title}
                  </div>
                </div>
                <Tag color={selectedNote.status === 'Đã hoàn thành' ? 'success' : selectedNote.status === 'Quá hạn' ? 'error' : selectedNote.status === 'Cần đẩy nhanh' ? 'warning' : 'processing'}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Người chỉ đạo:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedNote.author}</div>
                  <div style={{ color: '#64748B' }}>Chức danh: {selectedNote.authorRole}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Đơn vị chịu trách nhiệm:</span>
                  <div style={{ fontWeight: 700, color: '#2563EB' }}>{selectedNote.assignedToDept}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Ngày ban hành:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{formatNoteDate(selectedNote.createdDate)}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Hạn chót:</span>
                  <div style={{ fontWeight: 700, color: selectedNote.status === 'Quá hạn' ? '#DC2626' : '#0F172A' }}>{formatNoteDate(selectedNote.deadline)}</div>
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
                <strong style={{ color: noteCompletionRate(selectedNote.actionItems || []) === 100 ? '#16A34A' : '#2563EB' }}>
                  Tiến độ: {noteCompletionRate(selectedNote.actionItems || [])}%
                </strong>
              </div>

              <Progress
                percent={noteCompletionRate(selectedNote.actionItems || [])}
                strokeColor={noteCompletionRate(selectedNote.actionItems || []) === 100 ? '#16A34A' : '#009688'}
                style={{ marginBottom: 12 }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(selectedNote.actionItems || []).map((act) => (
                  <button
                    type="button"
                    key={act.id}
                    onClick={() => void handleToggleActionItem(selectedNote, act.id)}
                    disabled={Boolean(savingKey)}
                    aria-pressed={act.done}
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
                      color: 'inherit',
                      textAlign: 'left',
                      width: '100%',
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
                  </button>
                ))}
              </div>
            </div>

            {(selectedNote.reminderHistory || []).length > 0 && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Lịch sử nhắc việc nội bộ</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(selectedNote.reminderHistory || []).map((entry, index) => (
                    <div key={`${entry.at}-${index}`} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 12.5 }}>
                      <strong>{formatNoteTimestamp(entry.at)}</strong>
                      <span>{entry.actor} đã gửi đến {entry.recipientCount} nhân sự</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(selectedNote.history || []).length > 0 && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Lịch sử xử lý</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...(selectedNote.history || [])].reverse().map((entry, index) => (
                    <div key={`${entry.at}-${index}`} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 12.5 }}>
                      <strong>{formatNoteTimestamp(entry.at)}</strong>
                      <span>{entry.actor}: {entry.action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => printNote({ ...selectedNote, status: noteStatus(selectedNote), completionRate: noteCompletionRate(selectedNote.actionItems || []) })}
                style={{ flex: 1 }}
              >
                In phiếu chỉ đạo
              </Button>
              <Button
                type="primary"
                icon={<BellOutlined />}
                onClick={() => void handleRemind(selectedNote)}
                disabled={Boolean(savingKey) || selectedNote.status === 'Đã hoàn thành'}
                loading={savingKey === selectedNote.key}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Gửi nhắc việc nội bộ
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

