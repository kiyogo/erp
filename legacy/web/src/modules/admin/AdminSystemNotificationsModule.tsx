import React, { useState, useEffect } from 'react';
import {
  BellOutlined,
  PlusOutlined,
  SendOutlined,
  SearchOutlined,
  DeleteOutlined,
  EyeOutlined,
  EditOutlined,
  SoundOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  MailOutlined,
  MessageOutlined,
  ReloadOutlined,
  SettingOutlined,
  CodeOutlined,
  DesktopOutlined,
  MobileOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Card, Tooltip } from '../../custom-ui';
import { ActivationEmailTemplate, collectionsApi, employeesApi, systemApi, systemBroadcastsApi, type SystemBroadcastInput, type SystemBroadcastRecord } from '../../api/endpoints';

const broadcastTypes = new Set<SystemBroadcastRecord['type']>(['info', 'warning', 'urgent', 'cybersecurity', 'maintenance', 'regulation', 'policy', 'account_activation']);

function mapLegacyBroadcast(record: any, source: NonNullable<SystemBroadcastRecord['source']>, index: number): SystemBroadcastRecord {
  const legacyRecord = record && typeof record === 'object' ? record : {};
  const createdAt = String(legacyRecord.createdAt || legacyRecord.created_at || '');
  return {
    id: String(legacyRecord.id || legacyRecord.key || `legacy-${index}`),
    title: String(legacyRecord.title || 'Thông báo cũ'),
    content: String(legacyRecord.content || legacyRecord.message || ''),
    type: broadcastTypes.has(legacyRecord.type) ? legacyRecord.type : 'info',
    targetType: 'all',
    targetIds: [],
    targetAudience: String(legacyRecord.targetAudience || 'Đối tượng cũ chưa xác minh'),
    sender: String(legacyRecord.sender || 'Không rõ người gửi'),
    createdAt,
    updatedAt: createdAt,
    channels: Array.isArray(legacyRecord.channels) ? legacyRecord.channels.map(String) : [],
    readCount: 0,
    totalRecipients: 0,
    inAppSentCount: 0,
    emailSentCount: 0,
    emailFailedCount: 0,
    status: 'Chưa xác minh',
    source,
  };
}

function getLegacyBroadcasts(): SystemBroadcastRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem('kiyovn_cache_system_broadcasts') || '[]');
    return Array.isArray(parsed) ? parsed.map((record, index) => mapLegacyBroadcast(record, 'legacy_local', index)) : [];
  } catch {
    return [];
  }
}

function sanitizeEmailHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  let clean = String(rawHtml);
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  clean = clean.replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '');
  clean = clean.replace(/<embed\b[^>]*>/gi, '');
  clean = clean.replace(/<applet\b[^>]*>/gi, '');
  clean = clean.replace(/<base\b[^>]*>/gi, '');
  clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');
  clean = clean.replace(/(href|src|action)\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, '$1="#"');
  clean = clean.replace(/(href|src|action)\s*=\s*(?:'vbscript:[^']*'|"vbscript:[^"]*"|vbscript:[^\s>]+)/gi, '$1="#"');
  clean = clean.replace(/(href|src|action)\s*=\s*(?:'data:text\/html[^']*'|"data:text\/html[^"]*"|data:text\/html[^\s>]+)/gi, '$1="#"');
  return clean;
}

export const AdminSystemNotificationsModule: React.FC = () => {
  const navigate = useNavigate();
  const [broadcasts, setBroadcasts] = useState<SystemBroadcastRecord[]>([]);
  const [legacyBroadcasts] = useState<SystemBroadcastRecord[]>(getLegacyBroadcasts);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [targetType, setTargetType] = useState<'all' | 'employee' | 'unit'>('all');
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [employeeOptions, setEmployeeOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [unitOptions, setUnitOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<SystemBroadcastRecord | null>(null);
  const [editingBroadcast, setEditingBroadcast] = useState<SystemBroadcastRecord | null>(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [templateForm] = Form.useForm();
  const [emailConfigured, setEmailConfigured] = useState(true);
  const [notificationType, setNotificationType] = useState('info');
  const [isTemplateOpen, setIsTemplateOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templatePreview, setTemplatePreview] = useState<ActivationEmailTemplate | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [editorTab, setEditorTab] = useState<'fields' | 'raw_html'>('fields');
  const [rawHtmlCode, setRawHtmlCode] = useState('');

  const loadData = async () => {
    const [serverResult, legacyResult] = await Promise.allSettled([
      systemBroadcastsApi.getAll(),
      collectionsApi.get('system_broadcasts'),
    ]);
    const serverRecords = serverResult.status === 'fulfilled' && Array.isArray(serverResult.value.data.data)
      ? serverResult.value.data.data
      : [];
    const serverIds = new Set(serverRecords.map((record) => record.id));
    const legacyCollection = legacyResult.status === 'fulfilled' && Array.isArray(legacyResult.value.data.data)
      ? legacyResult.value.data.data.map((record, index) => mapLegacyBroadcast(record, 'legacy_collection', index))
      : [];
    const legacyById = new Map<string, SystemBroadcastRecord>();
    for (const record of [...legacyCollection, ...legacyBroadcasts]) {
      if (!serverIds.has(record.id) && !legacyById.has(record.id)) legacyById.set(record.id, record);
    }
    setBroadcasts([...serverRecords, ...legacyById.values()]);
    if (serverResult.status === 'rejected') {
      const error: any = serverResult.reason;
      message.error(error?.response?.data?.message || 'Không thể tải danh sách thông báo hệ thống.');
    }
  };

  const loadEmployeesAndUnits = async () => {
    try {
      const empRes = await employeesApi.getAll();
      const rawList = empRes.data?.data || [];
      const activeList = rawList.filter((item: any) => item.isActive !== false && item.status !== 'Đã nghỉ việc');
      const opts = activeList.map((emp: any) => {
        const empName = emp.name || emp.fullName || 'Nhân sự';
        const empCode = emp.code || emp.employeeCode || '';
        const display = empCode ? `${empName} (${empCode})` : empName;
        return { value: String(emp.id || emp.key || emp.employeeCode || emp.code || ''), label: display };
      }).filter((item: { value: string }) => Boolean(item.value));
      setEmployeeOptions(opts);
      const departments = [...new Set(activeList.map((item: any) => String(item.department || '').trim()).filter(Boolean))].sort();
      setUnitOptions(departments.map((department) => ({ value: department, label: department })));
    } catch (error: any) {
      setEmployeeOptions([]);
      setUnitOptions([]);
      message.error(error?.response?.data?.message || 'Không thể tải danh sách nhân sự và đơn vị.');
    }
  };

  useEffect(() => {
    void loadData();
    void (async () => {
      try {
        const [templateRes, emailRes] = await Promise.all([
          systemApi.getActivationTemplate(),
          systemApi.getEmailConfig(),
        ]);
        setEmailConfigured(Boolean(templateRes.data.emailConfigured || (emailRes.data.config?.configured ?? true)));
        templateForm.setFieldsValue(templateRes.data.template);
        setRawHtmlCode(templateRes.data.template?.body || '');
      } catch {
        setEmailConfigured(true);
      }
    })();
    return undefined;
  }, []);

  const activationChannels = () => [
    { value: 'Email', label: 'Email công vụ' },
    { value: 'SMS', label: 'Tin nhắn SMS Brandname' },
  ];

  const handleNotificationTypeChange = (value: string, targetForm = form) => {
    setNotificationType(value);
    if (value === 'account_activation') {
      const currentTitle = targetForm.getFieldValue('title');
      const currentContent = targetForm.getFieldValue('content');
      targetForm.setFieldsValue({
        title: currentTitle || 'Kích hoạt tài khoản KIYOVN Enterprise',
        content: currentContent || 'Tài khoản công việc của bạn đã được thiết lập. Vui lòng kích hoạt tài khoản để đặt mật khẩu và hoàn tất hồ sơ nhân sự.',
        channels: ['Email'],
      });
    }
  };

  const openActivationTemplate = async () => {
    try {
      const response = await systemApi.getActivationTemplate();
      setEmailConfigured(response.data.emailConfigured);
      templateForm.setFieldsValue(response.data.template);
      setTemplatePreview(response.data.template);
      setRawHtmlCode(response.data.template?.body || '');
      setIsTemplateOpen(true);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải mẫu email kích hoạt.');
    }
  };

  const saveActivationTemplate = async (values: ActivationEmailTemplate) => {
    setSavingTemplate(true);
    try {
      await systemApi.saveActivationTemplate(values);
      message.success('Đã lưu mẫu email kích hoạt tài khoản.');
      setIsTemplateOpen(false);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu mẫu email.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleCreateBroadcast = (values: any) => {
    let targetAudience = 'Tất cả nhân sự';
    if (targetType === 'employee') {
      targetAudience = selectedEmployees.length
        ? selectedEmployees.map((id) => employeeOptions.find((option) => option.value === id)?.label || id).join(', ')
        : 'Nhân sự chọn lọc';
    } else if (targetType === 'unit') {
      targetAudience = selectedUnits.length ? selectedUnits.join(', ') : 'Đơn vị chọn lọc';
    }

    const titleText = (values?.title || '').trim() || (values?.type === 'account_activation' ? 'Kích hoạt tài khoản KIYOVN Enterprise' : 'Thông báo hệ thống');
    const contentText = (values?.content || '').trim() || (values?.type === 'account_activation' ? 'Tài khoản công việc của bạn đã sẵn sàng. Vui lòng kiểm tra email kích hoạt.' : '');
    const channelsList = values?.channels && values.channels.length > 0 ? values.channels : ['In-app', 'Email'];

    Modal.confirm({
      title: 'Xác nhận phát hành thông báo mới',
      content: (
        <div>
          <div>Bạn có chắc chắn muốn phát hành thông báo này đến các đối tượng đã chọn không?</div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#475569' }}>
            <div>• Tiêu đề: <strong>{titleText}</strong></div>
            <div>• Đối tượng nhận: <strong>{targetAudience}</strong></div>
            <div>• Kênh phát hành: <strong>{channelsList.join(', ')}</strong></div>
          </div>
        </div>
      ),
      okText: 'Xác nhận phát thông báo',
      cancelText: 'Hủy',
      okButtonProps: { style: { backgroundColor: '#009688', borderColor: '#009688' } },
      onOk: async () => {
        const key = 'creating_notification';
        message.loading({ content: 'Đang phát hành thông báo...', key });
        const payload: SystemBroadcastInput = {
          title: titleText,
          content: contentText,
          type: values.type || 'info',
          sender: values.sender || 'Ban Quản Trị Hệ Thống',
          targetType,
          targetIds: targetType === 'employee' ? selectedEmployees : targetType === 'unit' ? selectedUnits : [],
          channels: channelsList,
        };
        try {
          const response = await systemBroadcastsApi.create(payload);
          const result = response.data.broadcast;
          if (result.status === 'Đã gửi') {
            message.success({ content: `Đã phát hành đến ${result.totalRecipients} nhân sự.`, key, duration: 3 });
          } else {
            message.warning({ content: `${result.status}: ${result.emailFailedCount} email chưa gửi được; ${result.inAppSentCount} thông báo ứng dụng đã tạo.`, key, duration: 5 });
          }
          setIsCreateModalOpen(false);
          form.resetFields();
          setTargetType('all');
          setSelectedEmployees([]);
          setSelectedUnits([]);
          await loadData();
        } catch (error: any) {
          message.error({ content: error?.response?.data?.message || 'Không thể phát hành thông báo.', key, duration: 5 });
        }
      },
    });
  };

  const handleOpenEdit = (record: SystemBroadcastRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (record.source) return;
    void loadEmployeesAndUnits();
    setEditingBroadcast(record);
    setTargetType(record.targetType);
    setSelectedEmployees(record.targetType === 'employee' ? record.targetIds : []);
    setSelectedUnits(record.targetType === 'unit' ? record.targetIds : []);
    setNotificationType(record.type || 'info');
    editForm.setFieldsValue({
      title: record.title,
      content: record.content,
      type: record.type,
      sender: record.sender,
      channels: record.channels,
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateBroadcast = async (values: any) => {
    if (!editingBroadcast) return;
    const titleText = (values?.title || '').trim() || (values?.type === 'account_activation' ? 'Kích hoạt tài khoản KIYOVN Enterprise' : 'Thông báo hệ thống');
    try {
      await systemBroadcastsApi.update(editingBroadcast.id, {
        title: titleText,
        content: values.content,
        type: values.type,
        sender: values.sender,
      });
      message.success(`Đã cập nhật thông báo "${titleText}". Email đã gửi trước đó không thể thu hồi.`);
      setIsEditModalOpen(false);
      setEditingBroadcast(null);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể cập nhật thông báo.');
    }
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (broadcasts.some((record) => record.id === id && record.source)) return;
    Modal.confirm({
      title: 'Xác nhận xóa thông báo hệ thống',
      content: 'Bạn có chắc chắn muốn xóa bản ghi thông báo này không? Thao tác không thể hoàn tác.',
      okText: 'Xóa vĩnh viễn',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await systemBroadcastsApi.delete(id);
          message.success('Đã xóa bản ghi thông báo. Thông báo đã gửi vẫn còn trong hộp thư người nhận.');
          await loadData();
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể xóa bản ghi thông báo.');
        }
      },
    });
  };

  const handleResend = (record: SystemBroadcastRecord, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (record.source) return;
    Modal.confirm({
      title: 'Xác nhận phát lại thông báo',
      content: (
        <div>
          <div>Bạn có chắc chắn muốn phát lại bản tin thông báo này đến người nhận không?</div>
          <div style={{ marginTop: 8, fontSize: 13, color: '#475569' }}>
            <div>• Tiêu đề: <strong>{record.title}</strong></div>
            <div>• Đối tượng nhận: <strong>{record.targetAudience}</strong></div>
            <div>• Kênh phát hành: <strong>{(record.channels || ['Email', 'In-app']).join(', ')}</strong></div>
          </div>
        </div>
      ),
      okText: 'Xác nhận phát lại',
      cancelText: 'Hủy',
      okButtonProps: { style: { backgroundColor: '#009688', borderColor: '#009688' } },
      onOk: async () => {
        const key = 'resending_notification';
        message.loading({ content: 'Đang phát lại thông báo đến danh sách người nhận đã lưu...', key });
        try {
          const response = await systemBroadcastsApi.resend(record.id);
          const result = response.data.broadcast;
          if (result.status === 'Đã gửi') {
            message.success({ content: `Đã phát lại đến ${result.totalRecipients} nhân sự.`, key, duration: 3 });
          } else {
            message.warning({ content: `${result.status}: ${result.emailFailedCount} email chưa gửi được.`, key, duration: 5 });
          }
          await loadData();
        } catch (error: any) {
          message.error({ content: error?.response?.data?.message || 'Không thể phát lại thông báo.', key, duration: 5 });
        }
      },
    });
  };

  // Filtered List
  const filteredList = broadcasts.filter((item) => {
    const q = (searchText || '').toLowerCase();
    const matchSearch =
      !q ||
      (item.title || '').toLowerCase().includes(q) ||
      (item.content || '').toLowerCase().includes(q) ||
      (item.sender || '').toLowerCase().includes(q) ||
      (item.targetAudience || '').toLowerCase().includes(q);

    const matchType = typeFilter === 'all' || item.type === typeFilter;
    return matchSearch && matchType;
  });

  // Calculate Metrics
  const verifiedBroadcasts = broadcasts.filter((b) => !b.source);
  const legacyBroadcastCount = broadcasts.length - verifiedBroadcasts.length;
  const totalBroadcasts = verifiedBroadcasts.length;
  const urgentCount = verifiedBroadcasts.filter((b) => b.type === 'urgent' || b.type === 'cybersecurity').length;
  const maintenanceCount = verifiedBroadcasts.filter((b) => b.type === 'maintenance').length;
  const totalInAppSent = verifiedBroadcasts.reduce((sum, b) => sum + b.inAppSentCount, 0);
  const totalReads = verifiedBroadcasts.reduce((sum, b) => sum + b.readCount, 0);
  const avgReadRate = totalInAppSent > 0 ? Math.round((totalReads / totalInAppSent) * 100) : null;

  const getTypeTag = (type: string) => {
    switch (type) {
      case 'urgent':
        return <Tag color="error" style={{ whiteSpace: 'nowrap' }}><WarningOutlined /> Khẩn cấp</Tag>;
      case 'account_activation':
        return <Tag color="cyan" style={{ whiteSpace: 'nowrap' }}><MailOutlined /> Kích hoạt tài khoản</Tag>;
      case 'cybersecurity':
        return <Tag color="volcano" style={{ whiteSpace: 'nowrap' }}><WarningOutlined /> An ninh mạng</Tag>;
      case 'maintenance':
        return <Tag color="warning" style={{ whiteSpace: 'nowrap' }}><ClockCircleOutlined /> Bảo trì hệ thống</Tag>;
      case 'regulation':
        return <Tag color="purple" style={{ whiteSpace: 'nowrap' }}><SafetyCertificateOutlined /> Quy định</Tag>;
      case 'policy':
        return <Tag color="magenta" style={{ whiteSpace: 'nowrap' }}><SafetyCertificateOutlined /> Chính sách</Tag>;
      case 'warning':
        return <Tag color="orange" style={{ whiteSpace: 'nowrap' }}>Cảnh báo</Tag>;
      default:
        return <Tag color="processing" style={{ whiteSpace: 'nowrap' }}><CheckCircleOutlined /> Thông tin</Tag>;
    }
  };

  const getStatusTag = (status: string) => {
    if (status === 'Chưa xác minh') return <Tag color="default" style={{ whiteSpace: 'nowrap' }}>Bản cũ · chưa xác minh</Tag>;
    const color = status === 'Đã gửi' ? 'success' : status === 'Gửi một phần' ? 'warning' : status === 'Gửi thất bại' ? 'error' : 'default';
    return <Tag color={color} style={{ whiteSpace: 'nowrap' }}>{status || 'Chưa có trạng thái'}</Tag>;
  };

  const columns = [
    {
      title: 'Thông tin',
      key: 'title',
      width: 280,
      render: (_: any, record: SystemBroadcastRecord) => (
        <div style={{ cursor: 'pointer', maxWidth: 280, overflow: 'hidden' }} onClick={() => { setSelectedBroadcast(record); setIsDetailModalOpen(true); }}>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>{record.id}</div>
          <div style={{ fontWeight: 700, color: '#0F172A', marginTop: 2, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.title}>
            {record.title}
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.content}>
            {record.content}
          </div>
        </div>
      ),
    },
    {
      title: 'Loại thông báo',
      dataIndex: 'type',
      key: 'type',
      width: 150,
      render: (type: string) => getTypeTag(type),
    },
    {
      title: 'Đối tượng',
      dataIndex: 'targetAudience',
      key: 'targetAudience',
      width: 170,
      render: (aud: string) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 600, color: '#009688', display: 'flex', alignItems: 'center', gap: 5 }}>
            <TeamOutlined /> {aud}
          </span>
        </div>
      ),
    },
    {
      title: 'Kênh gửi',
      dataIndex: 'channels',
      key: 'channels',
      width: 150,
      render: (channels: string[]) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
          {channels.map((ch, idx) => (
            <Tag key={idx} color={ch === 'In-app' ? 'blue' : ch === 'Email' ? 'cyan' : 'geekblue'} style={{ fontSize: 11 }}>
              {ch === 'In-app' ? <BellOutlined /> : ch === 'Email' ? <MailOutlined /> : <MessageOutlined />} {ch}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: 'Thời gian phát hành',
      key: 'createdAt',
      width: 160,
      render: (_: any, record: SystemBroadcastRecord) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 600, color: '#2563EB' }}>{record.createdAt}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.sender}</div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Lượt đã xem',
      key: 'readStats',
      width: 160,
      render: (_: any, record: SystemBroadcastRecord) => {
        if (record.source) return <Tag color="default">Chưa xác minh</Tag>;
        const percent = record.inAppSentCount > 0 ? Math.round((record.readCount / record.inAppSentCount) * 100) : 0;
        return (
          <div style={{ whiteSpace: 'nowrap', minWidth: 120 }}>
            <div style={{ fontSize: 11.5, color: '#334155', fontWeight: 600, marginBottom: 2 }}>
              {record.inAppSentCount > 0 ? `${record.readCount} / ${record.inAppSentCount}` : 'Không gửi In-app'}
            </div>
            <Progress percent={percent} size="small" strokeColor="#009688" />
          </div>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 170,
      render: (_: any, record: SystemBroadcastRecord) => (
        <div style={{ display: 'flex', gap: 6, whiteSpace: 'nowrap' }}>
          <Tooltip title="Xem chi tiết">
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedBroadcast(record);
                setIsDetailModalOpen(true);
              }}
            />
          </Tooltip>
          <Tooltip title={record.source ? 'Bản cũ chưa xác minh, chỉ xem được' : 'Chỉnh sửa thông báo'}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => handleOpenEdit(record, e)}
              disabled={Boolean(record.source)}
              style={{ color: '#0078d4', borderColor: '#0078d4' }}
            />
          </Tooltip>
          <Tooltip title={record.source ? 'Bản cũ chưa xác minh, không thể gửi lại' : 'Phát lại thông báo này'}>
            <Button
              size="small"
              icon={<SendOutlined />}
              onClick={(e) => handleResend(record, e)}
              disabled={Boolean(record.source)}
              style={{ color: '#009688', borderColor: '#009688' }}
            />
          </Tooltip>
          <Tooltip title={record.source ? 'Bản cũ chưa xác minh, chỉ xem được' : 'Xóa bản ghi'}>
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => handleDelete(record.id, e)}
              disabled={Boolean(record.source)}
            />
          </Tooltip>
        </div>
      ),
    },
  ];

  return (
    <div className="k-page-container">
      {/* 4 KPI Metrics Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng thông báo hệ thống đã phát</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalBroadcasts} bản tin
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Số bản tin đã ghi nhận trên máy chủ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ đọc thông báo ứng dụng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {avgReadRate === null ? 'Chưa có dữ liệu' : `${avgReadRate}%`}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tính trên thông báo ứng dụng đã ghi nhận</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thông báo khẩn cấp &amp; Bảo mật</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {urgentCount} khẩn cấp
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Tổng tin khẩn cấp và an ninh mạng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thông báo bảo trì hệ thống</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {maintenanceCount} lịch bảo trì
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Số bản tin có loại bảo trì</div>
        </div>
      </div>

      {legacyBroadcastCount > 0 && (
        <div role="status" style={{ marginBottom: 14, padding: '10px 12px', border: '1px solid #FDE68A', borderRadius: 8, background: '#FFFBEB', color: '#92400E', fontSize: 13 }}>
          Có {legacyBroadcastCount} bản tin từ dữ liệu cũ. Bản tin được giữ để tra cứu; số người nhận, lượt đọc và trạng thái gửi chưa xác minh nên không tính vào thống kê và không thể sửa, gửi lại hoặc xóa.
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo tiêu đề, nội dung, người phát hành..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 320, borderRadius: 6 }}
            allowClear
          />

          <Select
            value={typeFilter}
            onChange={(val) => setTypeFilter(val)}
            style={{ width: 180 }}
            options={[
              { value: 'all', label: 'Tất cả loại thông báo' },
              { value: 'info', label: 'Thông tin' },
              { value: 'account_activation', label: 'Kích hoạt tài khoản' },
              { value: 'urgent', label: 'Khẩn cấp' },
              { value: 'cybersecurity', label: 'An ninh mạng' },
              { value: 'maintenance', label: 'Bảo trì hệ thống' },
              { value: 'regulation', label: 'Quy định' },
              { value: 'policy', label: 'Chính sách' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Làm mới
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                type: 'info',
                targetAudience: 'Tất cả nhân viên',
                sender: 'Ban Quản Trị Hệ Thống',
                channels: ['In-app', 'Email'],
              });
              setNotificationType('info');
              void loadEmployeesAndUnits();
              setIsCreateModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Phát thông báo mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredList} columns={columns} />
      </div>

      {/* MODAL: TẠO THÔNG BÁO HỆ THỐNG MỚI */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
            <SoundOutlined style={{ color: '#009688' }} /> Phát hành Thông báo Toàn Hệ thống
          </div>
        }
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        footer={null}
        width={680}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleCreateBroadcast} style={{ marginTop: 12 }}>
          <Form.Item
            name="title"
            label="Tiêu đề thông báo"
            rules={[{ required: true, message: 'Vui lòng nhập tiêu đề thông báo' }]}
          >
            <Input placeholder="Ví dụ: Thông báo lịch bảo trì hệ thống máy chủ Cloud IDC..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item
              name="type"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span>Loại thông báo <span style={{ color: '#EF4444', marginLeft: 4, fontWeight: 700 }}>*</span></span>
                  {notificationType === 'account_activation' && (
                    <span
                      onClick={() => void openActivationTemplate()}
                      style={{ color: '#009688', fontSize: 12, fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Xem trước email
                    </span>
                  )}
                </div>
              }
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { value: 'info', label: 'Thông tin' },
                  { value: 'account_activation', label: 'Kích hoạt tài khoản' },
                  { value: 'urgent', label: 'Khẩn cấp' },
                  { value: 'cybersecurity', label: 'An ninh mạng' },
                  { value: 'maintenance', label: 'Bảo trì hệ thống' },
                  { value: 'regulation', label: 'Quy định' },
                  { value: 'policy', label: 'Chính sách' },
                ]}
                onChange={(value) => handleNotificationTypeChange(value)}
              />
            </Form.Item>

            <Form.Item label="Đối tượng" required>
              <Select
                value={targetType}
                onChange={(val) => setTargetType(val as any)}
                options={[
                  { value: 'all', label: 'Tất cả nhân sự' },
                  { value: 'employee', label: 'Nhân sự' },
                  { value: 'unit', label: 'Đơn vị' },
                ]}
              />
            </Form.Item>
          </div>

          {targetType === 'employee' && (
            <Form.Item label="Chọn danh sách nhân sự nhận thông báo" required style={{ marginTop: -4 }}>
              <Select
                mode="multiple"
                placeholder="Chọn một hoặc nhiều nhân sự..."
                value={selectedEmployees}
                onChange={setSelectedEmployees}
                options={employeeOptions}
              />
            </Form.Item>
          )}

          {targetType === 'unit' && (
            <Form.Item label="Chọn danh sách đơn vị nhận thông báo" required style={{ marginTop: -4 }}>
              <Select
                mode="multiple"
                placeholder="Chọn một hoặc nhiều đơn vị..."
                value={selectedUnits}
                onChange={setSelectedUnits}
                options={unitOptions}
              />
            </Form.Item>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item
              name="sender"
              label="Đơn vị phát hành / Người gửi"
              rules={[{ required: true }]}
            >
              <Input placeholder="Ví dụ: Ban Quản Trị Hệ Thống" />
            </Form.Item>

            <Form.Item
              name="channels"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span>Kênh phát hành <span style={{ color: '#EF4444', marginLeft: 4, fontWeight: 700 }}>*</span></span>
                  {notificationType === 'account_activation' && !emailConfigured && (
                    <span
                      onClick={() => navigate('/admin/system')}
                      style={{ color: '#D97706', fontSize: 12, fontWeight: 500, cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <SettingOutlined /> Thiết lập Email
                    </span>
                  )}
                </div>
              }
              rules={[{ required: true }]}
            >
              <Select
                mode="multiple"
                options={notificationType === 'account_activation' ? activationChannels() : [
                  { value: 'In-app', label: 'Thông báo ứng dụng' },
                  { value: 'Email', label: 'Email công vụ' },
                  { value: 'SMS', label: 'Tin nhắn SMS Brandname' },
                ]}
              />
            </Form.Item>
          </div>


          <Form.Item
            name="content"
            label="Nội dung chi tiết thông báo"
            rules={[{ required: true, message: 'Vui lòng nhập nội dung thông báo' }]}
          >
            <Input.TextArea
              rows={4}
              placeholder="Nhập đầy đủ nội dung thông báo, hướng dẫn hoặc quy định cần thông báo đến cán bộ nhân viên..."
            />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setIsCreateModalOpen(false)}>
              Hủy bỏ
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SendOutlined />}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Gửi thông báo ngay
            </Button>
          </div>
        </Form>
      </Modal>

      {/* MODAL: CHỈNH SỬA THÔNG BÁO HỆ THỐNG */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
            <EditOutlined style={{ color: '#0078d4' }} /> Chỉnh sửa Thông báo Hệ thống
          </div>
        }
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        footer={null}
        width={680}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdateBroadcast} style={{ marginTop: 12 }}>
          <Form.Item
            name="title"
            label="Tiêu đề thông báo"
            rules={[{ required: true, message: 'Vui lòng nhập tiêu đề thông báo' }]}
          >
            <Input placeholder="Ví dụ: Thông báo lịch bảo trì hệ thống..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item
              name="type"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span>Loại thông báo <span style={{ color: '#EF4444', marginLeft: 4, fontWeight: 700 }}>*</span></span>
                  {notificationType === 'account_activation' && (
                    <span
                      onClick={() => void openActivationTemplate()}
                      style={{ color: '#009688', fontSize: 12, fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Xem trước email
                    </span>
                  )}
                </div>
              }
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { value: 'info', label: 'Thông tin' },
                  { value: 'account_activation', label: 'Kích hoạt tài khoản' },
                  { value: 'urgent', label: 'Khẩn cấp' },
                  { value: 'cybersecurity', label: 'An ninh mạng' },
                  { value: 'maintenance', label: 'Bảo trì hệ thống' },
                  { value: 'regulation', label: 'Quy định' },
                  { value: 'policy', label: 'Chính sách' },
                ]}
                onChange={(value) => handleNotificationTypeChange(value, editForm)}
              />
            </Form.Item>

            <Form.Item label="Đối tượng" required>
              <Select
                value={targetType}
                disabled
                options={[
                  { value: 'all', label: 'Tất cả nhân sự' },
                  { value: 'employee', label: 'Nhân sự' },
                  { value: 'unit', label: 'Đơn vị' },
                ]}
              />
            </Form.Item>
          </div>

          {targetType === 'employee' && (
            <Form.Item label="Chọn danh sách nhân sự nhận thông báo" required style={{ marginTop: -4 }}>
              <Select
                mode="multiple"
                placeholder="Chọn một hoặc nhiều nhân sự..."
                value={selectedEmployees}
                disabled
                options={employeeOptions}
              />
            </Form.Item>
          )}

          {targetType === 'unit' && (
            <Form.Item label="Chọn danh sách đơn vị nhận thông báo" required style={{ marginTop: -4 }}>
              <Select
                mode="multiple"
                placeholder="Chọn một hoặc nhiều đơn vị..."
                value={selectedUnits}
                disabled
                options={unitOptions}
              />
            </Form.Item>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item
              name="sender"
              label="Đơn vị phát hành / Người gửi"
              rules={[{ required: true }]}
            >
              <Input placeholder="Ví dụ: Ban Quản Trị Hệ Thống" />
            </Form.Item>

            <Form.Item
              name="channels"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <span>Kênh phát hành <span style={{ color: '#EF4444', marginLeft: 4, fontWeight: 700 }}>*</span></span>
                  {notificationType === 'account_activation' && !emailConfigured && (
                    <span
                      onClick={() => navigate('/admin/system')}
                      style={{ color: '#D97706', fontSize: 12, fontWeight: 500, cursor: 'pointer', userSelect: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                    >
                      <SettingOutlined /> Thiết lập Email
                    </span>
                  )}
                </div>
              }
              rules={[{ required: true }]}
            >
              <Select
                mode="multiple"
                disabled
                options={notificationType === 'account_activation' ? activationChannels() : [
                  { value: 'In-app', label: 'Thông báo ứng dụng' },
                  { value: 'Email', label: 'Email công vụ' },
                  { value: 'SMS', label: 'Tin nhắn SMS Brandname' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ marginTop: -8, marginBottom: 10, color: '#64748B', fontSize: 12 }}>
            Đối tượng nhận và kênh phát hành được lưu theo lần gửi. Email đã gửi không thể thu hồi hoặc cập nhật.
          </div>

          <Form.Item
            name="content"
            label="Nội dung chi tiết thông báo"
            rules={[{ required: true, message: 'Vui lòng nhập nội dung thông báo' }]}
          >
            <Input.TextArea
              rows={4}
              placeholder="Nhập đầy đủ nội dung thông báo..."
            />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setIsEditModalOpen(false)}>
              Hủy bỏ
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SendOutlined />}
              style={{ backgroundColor: '#0078d4', borderColor: '#0078d4' }}
            >
              Lưu thay đổi
            </Button>
          </div>
        </Form>
      </Modal>

      {/* MODAL: XEM CHI TIẾT THÔNG BÁO */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
            <BellOutlined style={{ color: '#009688' }} /> Chi tiết Thông báo Hệ thống
          </div>
        }
        open={isDetailModalOpen}
        onCancel={() => setIsDetailModalOpen(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setIsDetailModalOpen(false)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
            Đóng
          </Button>,
        ]}
        width={600}
      >
        {selectedBroadcast && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#64748B', fontWeight: 600 }}>{selectedBroadcast.id}</span>
              {getTypeTag(selectedBroadcast.type)}
            </div>

            <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>
              {selectedBroadcast.title}
            </div>

            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 14px', fontSize: 13, lineHeight: 1.6, color: '#334155' }}>
              {selectedBroadcast.content}
            </div>

            {selectedBroadcast.source ? (
              <div role="note" style={{ padding: '10px 12px', border: '1px solid #FDE68A', borderRadius: 8, background: '#FFFBEB', color: '#92400E', fontSize: 12.5 }}>
                Đây là bản ghi từ dữ liệu cũ. Số người nhận, lượt đọc và trạng thái gửi chưa được xác minh.
              </div>
            ) : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5, color: '#475569' }}>
              <div><strong>Đối tượng:</strong> {selectedBroadcast.targetAudience}</div>
              <div><strong>Người phát:</strong> {selectedBroadcast.sender}</div>
              <div><strong>Thời gian:</strong> {selectedBroadcast.createdAt}</div>
              <div><strong>Trạng thái:</strong> {selectedBroadcast.status}</div>
              {!selectedBroadcast.source && <div><strong>Người nhận:</strong> {selectedBroadcast.totalRecipients}</div>}
              {!selectedBroadcast.source && <div><strong>In-app đã tạo:</strong> {selectedBroadcast.inAppSentCount}</div>}
              {!selectedBroadcast.source && <div><strong>Lượt đọc In-app:</strong> {selectedBroadcast.readCount} / {selectedBroadcast.inAppSentCount}</div>}
              {!selectedBroadcast.source && <div><strong>Email SMTP tiếp nhận:</strong> {selectedBroadcast.emailSentCount}</div>}
              {!selectedBroadcast.source && <div><strong>Email lỗi:</strong> {selectedBroadcast.emailFailedCount}</div>}
              <div><strong>Kênh đã chọn:</strong> {selectedBroadcast.channels.join(', ') || 'Chưa có'}</div>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: MẪU EMAIL KÍCH HOẠT TÀI KHOẢN (Flexible Unrestricted Size + Live Realtime Preview + HTML Editor + XSS Anti-Malware) */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
              <MailOutlined style={{ color: '#009688', fontSize: 18 }} />
              <span>Mẫu email kích hoạt tài khoản</span>
            </div>
            <Tag color="success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 4, fontWeight: 600, fontSize: 11.5 }}>
              <SafetyCertificateOutlined /> Chống mã độc HTML / XSS
            </Tag>
          </div>
        }
        open={isTemplateOpen}
        onCancel={() => setIsTemplateOpen(false)}
        footer={null}
        width="94vw"
        style={{ maxWidth: 1380, top: 18 }}
        bodyStyle={{ padding: '16px 22px 20px 22px', maxHeight: 'calc(88vh - 55px)', overflowY: 'auto' }}
        destroyOnClose
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20, marginTop: 4 }}>
          {/* Cột bên trái: Mã HTML & Cấu hình (Left Panel) */}
          <div style={{ display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CodeOutlined style={{ color: '#009688' }} />
                <span>Cấu hình nội dung & mã HTML</span>
              </div>
              <div style={{ display: 'flex', gap: 4, background: '#F1F5F9', padding: 3, borderRadius: 6 }}>
                <Button
                  size="small"
                  onClick={() => setEditorTab('fields')}
                  style={{
                    fontSize: 12,
                    height: 26,
                    padding: '0 10px',
                    borderRadius: 4,
                    border: 'none',
                    backgroundColor: editorTab === 'fields' ? '#FFFFFF' : 'transparent',
                    color: editorTab === 'fields' ? '#009688' : '#64748B',
                    fontWeight: editorTab === 'fields' ? 700 : 500,
                    boxShadow: editorTab === 'fields' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  Nội dung & Thẻ HTML
                </Button>
                <Button
                  size="small"
                  onClick={() => setEditorTab('raw_html')}
                  style={{
                    fontSize: 12,
                    height: 26,
                    padding: '0 10px',
                    borderRadius: 4,
                    border: 'none',
                    backgroundColor: editorTab === 'raw_html' ? '#FFFFFF' : 'transparent',
                    color: editorTab === 'raw_html' ? '#009688' : '#64748B',
                    fontWeight: editorTab === 'raw_html' ? 700 : 500,
                    boxShadow: editorTab === 'raw_html' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  Mã nguồn HTML tổng thể
                </Button>
              </div>
            </div>

            <Form
              form={templateForm}
              layout="vertical"
              onFinish={saveActivationTemplate}
              onValuesChange={(_, values) => {
                setTemplatePreview(values as ActivationEmailTemplate);
                if (editorTab === 'fields' && values.body) {
                  setRawHtmlCode(values.body);
                }
              }}
            >
              {editorTab === 'fields' ? (
                <>
                  <Form.Item name="subject" label={<span style={{ fontWeight: 600, color: '#334155' }}>Tiêu đề email</span>} rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}>
                    <Input placeholder="Ví dụ: Kích hoạt tài khoản KIYOVN Enterprise..." />
                  </Form.Item>

                  <Form.Item name="heading" label={<span style={{ fontWeight: 600, color: '#334155' }}>Tiêu đề trong thư</span>} rules={[{ required: true, message: 'Vui lòng nhập tiêu đề thư' }]}>
                    <Input placeholder="Ví dụ: Chào mừng bạn đến với KIYOVN Enterprise" />
                  </Form.Item>

                  <Form.Item
                    name="body"
                    label={<span style={{ fontWeight: 600, color: '#334155' }}>Nội dung thư</span>}
                    rules={[{ required: true, message: 'Vui lòng nhập nội dung thư' }]}
                  >
                    <Input.TextArea
                      rows={6}
                      style={{ fontFamily: "'Fira Code', 'Consolas', monospace", fontSize: 13 }}
                      placeholder="Nhập nội dung thư hoặc các thẻ HTML như <p>, <strong>, <br/>..."
                    />
                  </Form.Item>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Form.Item name="buttonLabel" label={<span style={{ fontWeight: 600, color: '#334155' }}>Nhãn nút kích hoạt</span>} rules={[{ required: true }]}>
                      <Input placeholder="Kích hoạt tài khoản" />
                    </Form.Item>
                    <Form.Item name="footer" label={<span style={{ fontWeight: 600, color: '#334155' }}>Ghi chú cuối thư</span>} rules={[{ required: true }]}>
                      <Input placeholder="Liên kết có hiệu lực trong 48 giờ..." />
                    </Form.Item>
                  </div>
                </>
              ) : (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6 }}>
                    Chỉnh sửa trực tiếp mã nguồn HTML. Hệ thống sẽ tự động lọc và loại bỏ các mã độc XSS trước khi gửi.
                  </div>
                  <Input.TextArea
                    rows={14}
                    value={rawHtmlCode || templateForm.getFieldValue('body') || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setRawHtmlCode(val);
                      templateForm.setFieldsValue({ body: val });
                      setTemplatePreview({ ...templateForm.getFieldsValue(), body: val } as ActivationEmailTemplate);
                    }}
                    style={{ fontFamily: "'Fira Code', 'Consolas', monospace", fontSize: 12.5, backgroundColor: '#0F172A', color: '#38BDF8', borderRadius: 6, padding: 12 }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, paddingTop: 12, borderTop: '1px solid #F1F5F9' }}>
                <Button onClick={() => setIsTemplateOpen(false)}>Hủy bỏ</Button>
                <Button type="primary" htmlType="submit" loading={savingTemplate} icon={<SaveOutlined />} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                  Lưu mẫu email
                </Button>
              </div>
            </Form>
          </div>

          {/* Cột bên phải: Xem trước trực tiếp Realtime (Right Panel) */}
          <div style={{ display: 'flex', flexDirection: 'column', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <EyeOutlined style={{ color: '#009688' }} />
                <span>Xem trước email</span>
              </div>
              <div style={{ display: 'flex', gap: 4, background: '#E2E8F0', padding: 3, borderRadius: 6 }}>
                <Button
                  size="small"
                  onClick={() => setPreviewDevice('desktop')}
                  style={{
                    fontSize: 12,
                    height: 26,
                    padding: '0 8px',
                    borderRadius: 4,
                    border: 'none',
                    backgroundColor: previewDevice === 'desktop' ? '#FFFFFF' : 'transparent',
                    color: previewDevice === 'desktop' ? '#0F172A' : '#64748B',
                    fontWeight: previewDevice === 'desktop' ? 700 : 500,
                  }}
                >
                  <DesktopOutlined /> Máy tính
                </Button>
                <Button
                  size="small"
                  onClick={() => setPreviewDevice('mobile')}
                  style={{
                    fontSize: 12,
                    height: 26,
                    padding: '0 8px',
                    borderRadius: 4,
                    border: 'none',
                    backgroundColor: previewDevice === 'mobile' ? '#FFFFFF' : 'transparent',
                    color: previewDevice === 'mobile' ? '#0F172A' : '#64748B',
                    fontWeight: previewDevice === 'mobile' ? 700 : 500,
                  }}
                >
                  <MobileOutlined /> Di động
                </Button>
              </div>
            </div>

            {/* Khung mô phỏng Email Client */}
            <div
              style={{
                width: previewDevice === 'mobile' ? 360 : '100%',
                margin: '0 auto',
                transition: 'all 0.2s ease',
                background: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
              }}
            >
              {/* Header mô phỏng Email */}
              <div style={{ background: '#F1F5F9', padding: '10px 14px', borderBottom: '1px solid #E2E8F0', fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
                <div><strong>Người gửi:</strong> KIYOVN Enterprise &lt;noreply@kiyovn.com&gt;</div>
                <div><strong>Người nhận:</strong> Nguyễn Văn A &lt;nhan.su@congty.vn&gt;</div>
                <div style={{ color: '#0F172A', fontWeight: 600, marginTop: 2 }}>
                  <strong>Chủ đề:</strong> {templatePreview?.subject || templateForm.getFieldValue('subject') || 'Kích hoạt tài khoản KIYOVN Enterprise'}
                </div>
              </div>

              {/* Nội dung Email đã được chống mã độc XSS */}
              <div style={{ padding: 20 }}>
                <div
                  dangerouslySetInnerHTML={{
                    __html: sanitizeEmailHtml(`
                      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 540px; margin: 0 auto;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #F1F5F9;">
                          <div style="width: 28px; height: 28px; border-radius: 6px; background: #009688; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 14px;">K</div>
                          <span style="font-weight: 700; font-size: 14px; color: #0F172A;">KIYOVN Enterprise</span>
                        </div>
                        <h3 style="font-size: 17px; font-weight: 800; color: #0F172A; margin: 0 0 12px 0;">${templatePreview?.heading || templateForm.getFieldValue('heading') || 'Chào mừng bạn đến với KIYOVN'}</h3>
                        <div style="font-size: 13px; color: #334155; line-height: 1.6; margin-bottom: 18px;">
                          <p style="margin-top: 0;">Xin chào <strong>Nguyễn Văn A</strong>,</p>
                          <div>${(templatePreview?.body || templateForm.getFieldValue('body') || '').includes('<') ? (templatePreview?.body || templateForm.getFieldValue('body') || '') : (templatePreview?.body || templateForm.getFieldValue('body') || '').replace(/\n/g, '<br/>')}</div>
                        </div>
                        <div style="margin: 20px 0;">
                          <a href="#" style="display: inline-block; background: #009688; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 700; font-size: 13px;">${templatePreview?.buttonLabel || templateForm.getFieldValue('buttonLabel') || 'Kích hoạt tài khoản'}</a>
                        </div>
                        <div style="margin-top: 20px; padding-top: 14px; border-top: 1px solid #F1F5F9; font-size: 11.5px; color: #64748B; line-height: 1.5;">
                          ${templatePreview?.footer || templateForm.getFieldValue('footer') || 'Liên kết có hiệu lực trong 48 giờ.'}
                        </div>
                      </div>
                    `),
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
