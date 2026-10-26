import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  CalendarOutlined,
  DesktopOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserOutlined,
  SettingOutlined,
  DownloadOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  VideoCameraOutlined,
  SearchOutlined,
  CheckOutlined,
  EditOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Switch } from '../../custom-ui';
import { dataService, MeetingRoom, RoomBooking } from '../../services/dataService';

export const MeetingRoomsModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const [rooms, setRooms] = useState<MeetingRoom[]>([]);
  const [bookings, setBookings] = useState<RoomBooking[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [roomModalOpen, setRoomModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();
  const [roomForm] = Form.useForm();
  const [settingsForm] = Form.useForm();

  // Selected date for calendar view
  const [calendarDate, setCalendarDate] = useState(new Date().toISOString().substring(0, 10));

  const loadData = () => {
    setRooms(dataService.getMeetingRooms());
    setBookings(dataService.getRoomBookings());
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(loadData);
    return unsub;
  }, []);

  const handleCreateBooking = (values: any) => {
    dataService.addRoomBooking({
      ...values,
      participantsCount: Number(values.participantsCount) || 4,
      status: 'Đã xác nhận',
    });
    message.success(`Đã đặt phòng ${values.roomName} thành công!`);
    setModalOpen(false);
    form.resetFields();
    loadData();
  };

  const handleCreateRoom = (values: any) => {
    const newRoom: MeetingRoom = {
      key: String(Date.now()),
      name: values.name,
      capacity: Number(values.capacity) || 10,
      location: values.location || 'Trụ sở Tầng 4',
      equipment: (values.equipment || 'Máy chiếu 4K, Loa Polycom').split(',').map((s: string) => s.trim()),
      status: 'Trống',
    };
    const updated = [newRoom, ...rooms];
    setRooms(updated);
    dataService.saveGenericData('meeting_rooms', updated);
    message.success(`Đã thêm phòng họp mới: ${values.name}`);
    setRoomModalOpen(false);
    roomForm.resetFields();
  };

  const handleCancelBooking = (key: string) => {
    dataService.cancelRoomBooking(key);
    message.info('Đã hủy lịch đặt phòng thành công');
    loadData();
  };

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
          {record.status === 'Đã xác nhận' && (
            <Button size="small" danger onClick={() => handleCancelBooking(record.key)}>
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
          {eqs.map((eq, i) => (
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
      render: (st: string) => (
        <Tag color={st === 'Trống' ? 'success' : st === 'Đang họp' ? 'processing' : 'warning'}>
          {st}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: MeetingRoom) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            type="primary"
            onClick={() => {
              form.setFieldsValue({ roomName: record.name });
              setModalOpen(true);
            }}
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
            <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Phòng họp VIP, Hội nghị &amp; Brainstorm</div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lịch họp đã xác nhận hôm nay</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
              {bookings.filter((b) => b.status === 'Đã xác nhận').length} cuộc họp
            </div>
            <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Không phát sinh trùng lịch hoặc xung đột</div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hạ tầng thiết bị hội nghị trực tuyến</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
              100% Sẵn sàng
            </div>
            <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Polycom 4K, Smart Screen &amp; Zoom Room</div>
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Công suất khai thác phòng họp</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
              78.5% Tối ưu
            </div>
            <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Đỉnh điểm lúc 09:30 - 11:00 &amp; 14:00 - 16:30</div>
          </div>
        </div>
      )}

      {/* VIEW 1: OVERVIEW */}
      {isOverview && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Trạng thái phòng họp trực tiếp</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DesktopOutlined />} onClick={() => { roomForm.resetFields(); setRoomModalOpen(true); }}>
                Thêm phòng họp
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();
                  setModalOpen(true);
                }}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Đặt phòng ngay
              </Button>
            </div>
          </div>

          {/* Meeting Rooms Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 20 }}>
            {rooms.map((room) => {
              const isAvailable = room.status === 'Trống';
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
                        {room.equipment.map((eq, eIdx) => (
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
                    onClick={() => {
                      form.setFieldsValue({ roomName: room.name });
                      setModalOpen(true);
                    }}
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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                roomForm.resetFields();
                setRoomModalOpen(true);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Thêm phòng họp mới
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={rooms.filter((r) => !searchText || (r.name || '').toLowerCase().includes(searchText.toLowerCase()) || (r.location || '').toLowerCase().includes(searchText.toLowerCase()))}
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
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.setFieldsValue({ date: calendarDate });
                setModalOpen(true);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Đặt lịch theo giờ
            </Button>
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
                      const matchBooking = bookings.find(
                        (b) => b.roomName === r.name && b.date === calendarDate && b.timeSlot === slot && b.status === 'Đã xác nhận'
                      );

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
                              onClick={() => {
                                form.setFieldsValue({ roomName: r.name, date: calendarDate, timeSlot: slot });
                                setModalOpen(true);
                              }}
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
            <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo lịch sử đặt phòng họp!')}>
              Xuất báo cáo Excel
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                ...bookings,
                { key: 'h-1', roomName: 'Phòng Họp Diamond', meetingTitle: 'Đại hội đồng Cổ đông Thường niên 2026', booker: 'Nguyễn Văn Minh (CEO)', participantsCount: 20, date: '2026-08-20', timeSlot: '08:30 - 11:30', status: 'Đã hoàn tất' },
                { key: 'h-2', roomName: 'Phòng Họp Ruby', meetingTitle: 'Phỏng vấn ứng viên Senior DevOps', booker: 'Lê Hoàng Yến (HR)', participantsCount: 3, date: '2026-08-22', timeSlot: '14:00 - 15:00', status: 'Đã hoàn tất' },
                { key: 'h-3', roomName: 'Phòng Họp VIP Sapphire', meetingTitle: 'Ký kết hợp đồng đối tác AWS Cloud', booker: 'Trần Tuấn Anh (CTO)', participantsCount: 6, date: '2026-08-24', timeSlot: '10:00 - 11:30', status: 'Đã hoàn tất' },
              ].filter(
                (b) =>
                  !searchText ||
                  (b.meetingTitle || '').toLowerCase().includes(searchText.toLowerCase()) ||
                  (b.booker || '').toLowerCase().includes(searchText.toLowerCase()) ||
                  (b.roomName || '').toLowerCase().includes(searchText.toLowerCase())
              )}
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
      {isSettings && (
        <div style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Quy định & Chính sách Đặt phòng họp" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <Form form={settingsForm} layout="vertical" initialValues={{ maxDuration: 120, maxAdvanceDays: 14, autoCancelMinutes: 15, autoMeetingLink: true, reminderMinutes: 15 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item label="Thời lượng họp tối đa một lượt" name="maxDuration">
                  <Input type="number" suffix="phút" />
                </Form.Item>
                <Form.Item label="Số ngày được phép đặt trước tối đa" name="maxAdvanceDays">
                  <Input type="number" suffix="ngày" />
                </Form.Item>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Form.Item label="Tự động hủy lịch nếu không check-in sau" name="autoCancelMinutes">
                  <Input type="number" suffix="phút" />
                </Form.Item>
                <Form.Item label="Gửi thông báo nhắc lịch trước" name="reminderMinutes">
                  <Input type="number" suffix="phút" />
                </Form.Item>
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
                    <Switch defaultChecked />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6 }}>
                    <div>
                      <strong>Microsoft Teams Integration</strong>
                      <div style={{ fontSize: 12, color: '#64748B' }}>Đồng bộ lịch phòng họp với Microsoft Outlook 365</div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6 }}>
                    <div>
                      <strong>Thông báo qua Kênh Chat Nội bộ</strong>
                      <div style={{ fontSize: 12, color: '#64748B' }}>Gửi bot thông báo lịch họp đến kênh #thông-báo-chung</div>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="primary" onClick={() => message.success('Đã lưu cấu hình quy chế phòng họp thành công!')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                  Lưu thiết lập
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      )}

      {/* Modal Add Booking */}
      <Modal
        title="Đặt phòng họp mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={480}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateBooking} style={{ marginTop: 16 }}>
          <Form.Item name="roomName" label="Chọn phòng họp" initialValue={rooms[0]?.name || 'Phòng Họp Diamond'}>
            <Select
              options={rooms.map((r) => ({ label: `${r.name} (${r.capacity} chỗ - ${r.location})`, value: r.name }))}
            />
          </Form.Item>
          <Form.Item name="meetingTitle" label="Tiêu đề cuộc họp" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
            <Input placeholder="Ví dụ: Họp bàn chiến lược kinh doanh Q3" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="booker" label="Người đặt phòng" initialValue="Administrator" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="participantsCount" label="Số người tham gia" initialValue={6}>
              <Input type="number" min={1} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="date" label="Ngày họp" initialValue={calendarDate}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="timeSlot" label="Khung giờ" initialValue="09:00 - 10:00">
              <Select
                options={timeSlots.map((s) => ({ label: s, value: s }))}
              />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
            <Form.Item name="capacity" label="Sức chứa" initialValue={12} rules={[{ required: true }]}>
              <Input type="number" min={2} />
            </Form.Item>
            <Form.Item name="location" label="Vị trí lắp đặt" initialValue="Trụ sở Tầng 4" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="equipment" label="Thiết bị hội nghị" initialValue="Màn hình TV 75 inch 4K, Micro Polycom, Bảng viết kính">
            <Input />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setRoomModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu phòng họp
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
