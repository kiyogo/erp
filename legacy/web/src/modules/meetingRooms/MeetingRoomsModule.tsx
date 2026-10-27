import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  DesktopOutlined,
  ReloadOutlined,
  UserOutlined,
  DownloadOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Switch } from '../../custom-ui';
import { collectionsApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { MeetingRoom, RoomBooking } from '../../services/dataService';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { getMeetingRoomMetrics, meetingTimesOverlap } from './meetingRoomRules';

const currentBusinessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

const requestErrorMessage = (error: any) => error?.response?.data?.error || error?.response?.data?.message || error?.message || 'Không thể hoàn tất thao tác.';

export const MeetingRoomsModule: React.FC = () => {
  const { user } = useAuth();
  const canManageRooms = user?.role?.toUpperCase() === 'ADMIN';
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [bookings, setBookings] = useState<RoomBooking[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [settings, setSettings] = useState({ key: '', maxDuration: 120, maxAdvanceDays: 14 });
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [roomForm] = Form.useForm();
  const [settingsForm] = Form.useForm();

  // Selected date for calendar view
  const [calendarDate, setCalendarDate] = useState(currentBusinessDate());

  const loadData = async () => {
    try {
      const [roomResponse, bookingResponse, settingsResponse] = await Promise.all([
        collectionsApi.get<MeetingRoom>('meeting_rooms', { limit: 500 }),
        collectionsApi.get<RoomBooking>('room_bookings', { limit: 500 }),
        canManageRooms ? collectionsApi.get<any>('meeting_room_settings', { limit: 1 }) : Promise.resolve({ data: { data: [] } } as any),
      ]);
      setRooms(roomResponse.data.data);
      setBookings(bookingResponse.data.data);
      if (settingsResponse.data.data[0]) {
        setSettings(settingsResponse.data.data[0]);
        settingsForm.setFieldsValue(settingsResponse.data.data[0]);
      } else if (canManageRooms) {
        settingsForm.setFieldsValue({ maxDuration: 120, maxAdvanceDays: 14 });
      }
    } catch (error) {
      message.error(requestErrorMessage(error));
    }
  };

  useEffect(() => {
    void loadData();
  }, [canManageRooms]);

  const openBooking = (roomKey?: string, date = calendarDate, timeSlot = '09:00 - 10:00') => {
    form.resetFields();
    form.setFieldsValue({ roomKey: roomKey || rooms[0]?.key, date, timeSlot });
    setModalOpen(true);
  };

  const handleCreateBooking = async (values: any) => {
    setSaving(true);
    try {
      const created = await collectionsApi.create<Partial<RoomBooking>>('room_bookings', {
        key: crypto.randomUUID(), roomKey: values.roomKey, meetingTitle: values.meetingTitle,
        participantsCount: Number(values.participantsCount), date: values.date, timeSlot: values.timeSlot,
      });
      const booking = created.data.record as RoomBooking;
      setBookings((previous) => [booking, ...previous]);
      message.success(`Đã đặt phòng ${booking.roomName} thành công.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(requestErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRoom = async (values: any) => {
    setSaving(true);
    try {
      const created = await collectionsApi.create<Partial<MeetingRoom>>('meeting_rooms', {
        key: crypto.randomUUID(), name: values.name, capacity: Number(values.capacity),
        location: values.location, equipment: String(values.equipment || '').split(',').map((item) => item.trim()).filter(Boolean),
      });
      setRooms((previous) => [created.data.record as MeetingRoom, ...previous]);
      message.success(`Đã thêm phòng họp ${values.name}.`);
      setRoomModalOpen(false);
      roomForm.resetFields();
    } catch (error) {
      message.error(requestErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelBooking = async (record: RoomBooking) => {
    setSaving(true);
    try {
      const updated = await collectionsApi.patch<RoomBooking>('room_bookings', record.key, { status: 'Đã hủy' });
      setBookings((previous) => previous.map((booking) => booking.key === record.key ? updated.data.record : booking));
      message.success('Đã hủy lịch đặt phòng.');
    } catch (error) {
      message.error(requestErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleRoomStatusChange = async (room: MeetingRoom, status: MeetingRoom['status']) => {
    setSaving(true);
    try {
      const updated = await collectionsApi.patch<MeetingRoom>('meeting_rooms', room.key, { status });
      setRooms((previous) => previous.map((item) => item.key === room.key ? updated.data.record : item));
      message.success(`Đã cập nhật trạng thái phòng ${room.name}.`);
    } catch (error) {
      message.error(requestErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!canManageRooms) return;
    setSaving(true);
    try {
      const values = await settingsForm.validateFields();
      const payload = { maxDuration: Number(values.maxDuration), maxAdvanceDays: Number(values.maxAdvanceDays) };
      const saved = settings.key
        ? await collectionsApi.patch<any>('meeting_room_settings', 'default', payload)
        : await collectionsApi.create<any>('meeting_room_settings', { key: 'default', ...payload });
      setSettings(saved.data.record);
      message.success('Đã lưu giới hạn đặt phòng.');
    } catch (error) {
      message.error(requestErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const metrics = getMeetingRoomMetrics(rooms, bookings, currentBusinessDate());
  const maxBookingDate = new Date(Date.parse(`${currentBusinessDate()}T00:00:00.000Z`) + Number(settings.maxAdvanceDays || 14) * 86_400_000).toISOString().slice(0, 10);
  const filteredHistory = bookings.filter((booking) => !searchText
    || [booking.meetingTitle, booking.booker, booking.roomName].some((value) => String(value || '').toLowerCase().includes(searchText.toLowerCase())));

  const isOverview = currentPath === '/meeting-rooms' || currentPath === '/meeting-rooms/overview';
  const isList = currentPath === '/meeting-rooms/list';
  const isCalendar = currentPath === '/meeting-rooms/calendar';
  const isHistory = currentPath === '/meeting-rooms/history';
  const isSettings = currentPath === '/meeting-rooms/settings';

  const timeSlots = [
    '08:00 - 09:00',
    '09:00 - 10:00',
    '10:00 - 11:00',
    '11:00 - 12:00',
    '13:30 - 14:30',
    '14:30 - 15:30',
    '15:30 - 16:30',
    '16:30 - 17:30',
  ];

  // Booking Columns
  const bookingColumns = [
    {
      title: 'Phòng họp',
      dataIndex: 'roomName',
      key: 'roomName',
      width: 170,
      render: (name: string) => <span style={{ fontWeight: 700, color: '#009688', whiteSpace: 'nowrap' }}>{name}</span>,
    },
    {
      title: 'Tiêu đề cuộc họp',
      dataIndex: 'meetingTitle',
      key: 'meetingTitle',
      width: 220,
      render: (t: string) => <span style={{ fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap' }}>{t}</span>,
    },
    {
      title: 'Thời gian & Khung giờ',
      key: 'time',
      width: 160,
      render: (_: any, record: RoomBooking) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 600, color: '#2563EB' }}>{record.date}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.timeSlot}</div>
        </div>
      ),
    },
    {
      title: 'Người đặt & Số lượng',
      key: 'booker',
      width: 180,
      render: (_: any, record: RoomBooking) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 500, color: '#1E293B' }}>{record.booker}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.participantsCount} người tham gia</div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => {
        const isOk = status === 'Đã xác nhận';
        return (
          <Tag color={isOk ? 'success' : 'error'} style={{ whiteSpace: 'nowrap' }}>
            {status}
          </Tag>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 100,
      render: (_: any, record: RoomBooking) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          {record.status === 'Đã xác nhận' && (canManageRooms || record.bookerId === user?.id) && (
            <Button size="small" danger loading={saving} onClick={() => void handleCancelBooking(record)}>
              Hủy lịch
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Room Inventory Columns
  const roomColumns = [
    {
      title: 'Tên phòng họp',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
          <DesktopOutlined /> {name}
        </span>
      ),
    },
    {
      title: 'Vị trí',
      dataIndex: 'location',
      key: 'location',
    },
    {
      title: 'Sức chứa',
      dataIndex: 'capacity',
      key: 'capacity',
      render: (cap: number) => <strong>{cap} người</strong>,
    },
    {
      title: 'Trang thiết bị',
      dataIndex: 'equipment',
      key: 'equipment',
      render: (eqs: string[]) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {(eqs || []).map((eq, i) => (
            <Tag key={i} color="blue" style={{ fontSize: 11.5 }}>
              {eq}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: MeetingRoom) => canManageRooms ? (
        <Select
          value={status}
          disabled={saving}
          onChange={(value: MeetingRoom['status']) => void handleRoomStatusChange(record, value)}
          options={['Trống', 'Đang sử dụng', 'Bảo trì', 'Tạm ngưng'].map((value) => ({ label: value, value }))}
          style={{ minWidth: 150 }}
        />
      ) : <Tag color={status === 'Trống' ? 'success' : status === 'Đang sử dụng' ? 'processing' : 'warning'}>{status}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: MeetingRoom) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            type="primary"
            disabled={saving || ['Bảo trì', 'Tạm ngưng'].includes(record.status)}
            onClick={() => openBooking(record.key)}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đặt lịch
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="k-page-container">
      {/* KPI Cards (Overview & Lists) */}
      {(isOverview || isList || isCalendar) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số phòng họp hiện hữu</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
              {rooms.length} phòng họp
            </div>
            <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Danh mục phòng đang được quản lý</div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lịch họp đã xác nhận hôm nay</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
              {metrics.todayBookings} cuộc họp
            </div>
            <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Chỉ lịch đã xác nhận trong ngày hiện tại</div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Phòng bảo trì hoặc tạm ngưng</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
              {metrics.unavailableRooms} phòng
            </div>
            <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Theo trạng thái hiện tại trong danh mục</div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Công suất khai thác phòng họp</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
              {metrics.utilizationPercent}%
            </div>
            <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>{metrics.bookedHours} giờ đã đặt hôm nay</div>
          </div>
        </div>
      )}

      {/* VIEW 1: OVERVIEW */}
      {isOverview && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Trạng thái phòng họp trực tiếp</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {canManageRooms && <Button icon={<DesktopOutlined />} onClick={() => { roomForm.resetFields(); setRoomModalOpen(true); }}>
                Thêm phòng họp
              </Button>}
              <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Tải lại</Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => openBooking()}
                disabled={!rooms.some((room) => !['Bảo trì', 'Tạm ngưng'].includes(room.status))}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Đặt phòng ngay
              </Button>
            </div>
          </div>

          {/* Meeting Rooms Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
            {rooms.map((room) => {
              const isAvailable = !['Bảo trì', 'Tạm ngưng'].includes(room.status);
              return (
                <div
                  key={room.key}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: 8,
                    padding: '18px 20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 14,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{room.name}</div>
                      <Tag color={isAvailable ? 'success' : 'error'}>
                        {room.status}
                      </Tag>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 4 }}>
                      {room.location} · Sức chứa {room.capacity} người
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 11.5, color: '#64748B', fontWeight: 600, marginBottom: 6 }}>Trang thiết bị:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {(room.equipment || []).map((eq, eIdx) => (
                          <span
                            key={eIdx}
                            style={{
                              fontSize: 11.5,
                              background: '#F8FAFC',
                              border: '1px solid #E2E8F0',
                              padding: '2px 8px',
                              borderRadius: 4,
                              color: '#334155',
                            }}
                          >
                            <CheckOutlined style={{ color: '#16A34A', marginRight: 4 }} />{eq}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <Button
                    style={{ width: '100%', borderColor: '#009688', color: '#009688' }}
                    disabled={!isAvailable || !rooms.length}
                    onClick={() => openBooking(room.key)}
                  >
                    Đặt phòng này ngay
                  </Button>
                </div>
              );
            })}
          </div>

          <h3 style={{ margin: '20px 0 12px 0', fontSize: 16, fontWeight: 700 }}>Danh sách lịch họp đang hoạt động</h3>
          <div className="transparent-table-card">
            <KTable dataSource={bookings} columns={bookingColumns} />
          </div>
        </>
      )}

      {/* VIEW 2: LIST (Quản lý cơ sở vật chất phòng họp) */}
      {isList && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo tên phòng họp, vị trí, thiết bị..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            {canManageRooms && <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                roomForm.resetFields();
                setRoomModalOpen(true);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Thêm phòng họp mới
            </Button>}
            <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Tải lại</Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={rooms.filter((r) => !searchText || [r.name, r.location, ...(r.equipment || [])].some((value) => String(value || '').toLowerCase().includes(searchText.toLowerCase())))}
              columns={roomColumns}
            />
          </div>
        </div>
      )}

      {/* VIEW 3: CALENDAR (Lịch đặt phòng trực quan theo Time-Grid) */}
      {isCalendar && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontWeight: 600, color: '#334155' }}>Chọn ngày xem lịch:</span>
              <Input
                type="date"
                value={calendarDate}
                onChange={(e) => setCalendarDate(e.target.value)}
                style={{ width: 170, borderRadius: 6 }}
              />
              <Tag color="blue" style={{ padding: '4px 10px', fontSize: 13 }}>
                Hôm nay: {calendarDate}
              </Tag>
            </div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openBooking(undefined, calendarDate)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Đặt lịch theo giờ
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Tải lại</Button>
          </div>

          {/* Time Slot Grid Matrix */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, overflowX: 'auto', padding: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #CBD5E1' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', width: 150, color: '#475569', fontSize: 13 }}>Khung giờ</th>
                  {rooms.map((r) => (
                    <th key={r.key} style={{ padding: '12px 16px', textAlign: 'left', color: '#0F172A', fontSize: 13.5, fontWeight: 700 }}>
                      {r.name}
                      <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: '#64748B' }}>
                        Sức chứa {r.capacity} người
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((slot, sIdx) => (
                  <tr key={sIdx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#64748B', fontSize: 12.5 }}>
                      <ClockCircleOutlined style={{ marginRight: 6, color: '#2563EB' }} /> {slot}
                    </td>
                    {rooms.map((r) => {
                      const matchBooking = bookings.find((b) => (b.roomKey === r.key || b.roomName === r.name)
                        && b.date === calendarDate && b.status === 'Đã xác nhận' && meetingTimesOverlap(b.timeSlot, slot));

                      return (
                        <td key={r.key} style={{ padding: '8px 12px' }}>
                          {matchBooking ? (
                            <div
                              style={{
                                background: '#EFF6FF',
                                borderLeft: '4px solid #2563EB',
                                borderRadius: 4,
                                padding: '8px 10px',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                              }}
                            >
                              <div style={{ fontWeight: 700, fontSize: 12.5, color: '#1E40AF' }}>
                                {matchBooking.meetingTitle}
                              </div>
                              <div style={{ fontSize: 11, color: '#3B82F6', marginTop: 2 }}>
                                <UserOutlined style={{ marginRight: 4 }} />{matchBooking.booker} ({matchBooking.participantsCount} người)
                              </div>
                            </div>
                          ) : (
                            <button
                              disabled={['Bảo trì', 'Tạm ngưng'].includes(r.status)}
                              onClick={() => openBooking(r.key, calendarDate, slot)}
                              style={{
                                width: '100%',
                                padding: '8px 10px',
                                background: 'transparent',
                                border: '1px dashed #CBD5E1',
                                borderRadius: 4,
                                color: '#94A3B8',
                                fontSize: 12,
                                cursor: 'pointer',
                                textAlign: 'center',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                (e.target as HTMLElement).style.background = '#F0FDF4';
                                (e.target as HTMLElement).style.borderColor = '#86EFAC';
                                (e.target as HTMLElement).style.color = '#16A34A';
                              }}
                              onMouseLeave={(e) => {
                                (e.target as HTMLElement).style.background = 'transparent';
                                (e.target as HTMLElement).style.borderColor = '#CBD5E1';
                                (e.target as HTMLElement).style.color = '#94A3B8';
                              }}
                            >
                              + Trống
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 4: HISTORY (Lịch sử sử dụng phòng họp toàn diện) */}
      {isHistory && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo người đặt, tiêu đề họp, phòng họp..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <Button icon={<DownloadOutlined />} onClick={() => downloadFile('Lich_su_dat_phong_hop.xlsx', generateValidXlsxBlob([
              ['Phòng họp', 'Tiêu đề cuộc họp', 'Người đặt', 'Ngày', 'Khung giờ', 'Số người', 'Trạng thái'],
              ...filteredHistory.map((booking) => [booking.roomName, booking.meetingTitle, booking.booker, booking.date, booking.timeSlot, booking.participantsCount, booking.status]),
            ]))}>
              Xuất báo cáo Excel
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Tải lại</Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={filteredHistory}
              columns={[
                { title: 'Phòng họp', dataIndex: 'roomName', key: 'roomName', render: (n: string) => <strong style={{ color: '#009688' }}>{n}</strong> },
                { title: 'Tiêu đề cuộc họp', dataIndex: 'meetingTitle', key: 'meetingTitle' },
                { title: 'Người chủ trì', dataIndex: 'booker', key: 'booker', render: (b: string) => <span style={{ color: '#2563EB', fontWeight: 500 }}>{b}</span> },
                { title: 'Ngày diễn ra', dataIndex: 'date', key: 'date' },
                { title: 'Khung giờ', dataIndex: 'timeSlot', key: 'timeSlot' },
                { title: 'Số người', dataIndex: 'participantsCount', key: 'participantsCount', render: (c: number) => `${c} người` },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s === 'Đã hoàn tất' ? 'default' : s === 'Đã xác nhận' ? 'success' : 'error'}>{s}</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW 5: SETTINGS (Thiết lập quy định đặt phòng & Hội nghị) */}
      {isSettings && canManageRooms && (
        <div style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Quy định & Chính sách Đặt phòng họp" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <Form form={settingsForm} layout="vertical" initialValues={{ maxDuration: 120, maxAdvanceDays: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item label="Thời lượng họp tối đa một lượt" name="maxDuration" rules={[{ required: true }]}>
                  <Input type="number" min={15} max={240} suffix="phút" />
                </Form.Item>
                <Form.Item label="Số ngày được phép đặt trước tối đa" name="maxAdvanceDays" rules={[{ required: true }]}>
                  <Input type="number" min={1} max={365} suffix="ngày" />
                </Form.Item>
              </div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, padding: 12, color: '#64748B', fontSize: 13 }}>
                Tự động hủy sau check-in và thông báo nhắc lịch chưa được kết nối với dịch vụ check-in hoặc gửi thông báo.
              </div>

              <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: 16, marginTop: 8 }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                  Tích hợp Nền tảng Hội nghị Trực tuyến
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6 }}>
                    <div>
                      <strong>Google Meet API</strong>
                      <div style={{ fontSize: 12, color: '#64748B' }}>Tự động tạo link phòng họp ảo Google Meet khi đặt phòng</div>
                    </div>
                    <Switch disabled checked={false} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6 }}>
                    <div>
                      <strong>Microsoft Teams Integration</strong>
                      <div style={{ fontSize: 12, color: '#64748B' }}>Đồng bộ lịch phòng họp với Microsoft Outlook 365</div>
                    </div>
                    <Switch disabled checked={false} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6 }}>
                    <div>
                      <strong>Thông báo qua Kênh Chat Nội bộ</strong>
                      <div style={{ fontSize: 12, color: '#64748B' }}>Gửi bot thông báo lịch họp đến kênh #thông-báo-chung</div>
                    </div>
                    <Switch disabled checked={false} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="primary" loading={saving} onClick={() => void handleSaveSettings()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                  Lưu thiết lập
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      )}
      {isSettings && !canManageRooms && <Card>Chỉ quản trị viên được xem và thay đổi quy định đặt phòng họp.</Card>}

      {/* Modal Add Booking */}
      <Modal
        title="Đặt phòng họp mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={480}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateBooking} style={{ marginTop: 16 }}>
          <Form.Item name="roomKey" label="Chọn phòng họp" rules={[{ required: true, message: 'Chọn phòng họp' }]}>
            <Select
              options={rooms.filter((room) => !['Bảo trì', 'Tạm ngưng'].includes(room.status)).map((room) => ({ label: `${room.name} · ${room.capacity} chỗ · ${room.location}`, value: room.key }))}
            />
          </Form.Item>
          <Form.Item name="meetingTitle" label="Tiêu đề cuộc họp" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
            <Input placeholder="Ví dụ: Họp bàn chiến lược kinh doanh Q3" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ paddingTop: 5, color: '#64748B', fontSize: 13 }}>Người đặt: {user?.name || 'Tài khoản hiện tại'}</div>
            <Form.Item name="participantsCount" label="Số người tham gia" rules={[{ required: true, message: 'Nhập số người tham gia' }]}>
              <Input type="number" min={1} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="date" label="Ngày họp" rules={[{ required: true, message: 'Chọn ngày họp' }]}>
              <Input type="date" min={currentBusinessDate()} max={maxBookingDate} />
            </Form.Item>
            <Form.Item name="timeSlot" label="Khung giờ" rules={[{ required: true, message: 'Chọn khung giờ' }]}>
              <Select
                options={timeSlots.map((s) => ({ label: s, value: s }))}
              />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={!rooms.some((room) => !['Bảo trì', 'Tạm ngưng'].includes(room.status))} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận đặt phòng
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Add Room */}
      <Modal
        title="Thêm phòng họp mới vào hệ thống"
        open={roomModalOpen}
        onCancel={() => setRoomModalOpen(false)}
        footer={null}
        width={480}
      >
        <Form form={roomForm} layout="vertical" onFinish={handleCreateRoom} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Tên phòng họp" rules={[{ required: true, message: 'Nhập tên phòng' }]}>
            <Input placeholder="Ví dụ: Phòng Họp VIP Sapphire" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="capacity" label="Sức chứa" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="location" label="Vị trí lắp đặt" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="equipment" label="Thiết bị hội nghị">
            <Input placeholder="Nhập danh sách thiết bị, cách nhau bằng dấu phẩy" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setRoomModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu phòng họp
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
