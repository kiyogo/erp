import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BellOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  SearchOutlined,
  CheckOutlined,
  RightOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Button, Input, message } from '../../custom-ui';
import { dataService, AppNotification } from '../../services/dataService';

export const EmployeeNotificationsModule: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [searchText, setSearchText] = useState('');

  const loadNotifications = () => {
    setNotifications(dataService.getNotifications());
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = dataService.markNotificationAsRead(id);
    setNotifications(updated);
    message.success('Đã đánh dấu thông báo là đã đọc');
  };

  const handleMarkAllAsRead = () => {
    const updated = dataService.markAllNotificationsAsRead();
    setNotifications(updated);
    message.success('Đã đánh dấu tất cả thông báo là đã đọc');
  };

  const handleNotificationClick = (item: AppNotification) => {
    dataService.markNotificationAsRead(item.id);
    if (item.link) {
      navigate(item.link);
    }
  };

  const filteredNotifications = notifications.filter((item) => {
    const query = searchText.toLowerCase().trim();
    if (!query) return true;
    return (
      (item.title || '').toLowerCase().includes(query) ||
      (item.message || '').toLowerCase().includes(query) ||
      (item.type || '').toLowerCase().includes(query)
    );
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'payroll':
        return <DollarOutlined style={{ color: '#009688', fontSize: 16 }} />;
      case 'approval':
        return <CheckCircleOutlined style={{ color: '#2E7D32', fontSize: 16 }} />;
      case 'timesheet':
        return <ClockCircleOutlined style={{ color: '#E65100', fontSize: 16 }} />;
      case 'proposal':
        return <FileTextOutlined style={{ color: '#1565C0', fontSize: 16 }} />;
      default:
        return <BellOutlined style={{ color: '#009688', fontSize: 16 }} />;
    }
  };

  const getIconBg = (type: string) => {
    switch (type) {
      case 'payroll':
        return '#E0F2F1';
      case 'approval':
        return '#E8F5E9';
      case 'timesheet':
        return '#FFF3E0';
      case 'proposal':
        return '#E3F2FD';
      default:
        return '#E0F2F1';
    }
  };

  const unreadCount = notifications.filter((n) => n.unread).length;

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* Header Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: '#E0F2F1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#009688',
              fontSize: 18,
            }}
          >
            <BellOutlined />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#212121' }}>
              Thông báo hệ thống
            </h1>
            <div style={{ fontSize: 12.5, color: '#757575', marginTop: 2 }}>
              Danh sách toàn bộ thông báo và cập nhật quan trọng gửi tới bạn
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm kiếm thông báo..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280, borderRadius: 6 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} onClick={loadNotifications} title="Làm mới">
            Làm mới
          </Button>

          {unreadCount > 0 && (
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleMarkAllAsRead}
              style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6 }}
            >
              Đánh dấu tất cả đã đọc ({unreadCount})
            </Button>
          )}
        </div>
      </div>

      {/* Main List Container */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E0E0E0',
          borderRadius: 8,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        }}
      >
        {filteredNotifications.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#9E9E9E' }}>
            <BellOutlined style={{ fontSize: 36, color: '#BDBDBD', marginBottom: 12, display: 'block' }} />
            <div style={{ fontSize: 14, fontWeight: 500, color: '#616161' }}>Không có thông báo nào</div>
            <div style={{ fontSize: 12.5, color: '#9E9E9E', marginTop: 4 }}>
              Các thông báo mới từ hệ thống sẽ hiển thị tại đây
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredNotifications.map((item, index) => {
              const isLast = index === filteredNotifications.length - 1;
              return (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  style={{
                    padding: '14px 16px',
                    borderBottom: isLast ? 'none' : '1px solid #F0F0F0',
                    cursor: 'pointer',
                    background: item.unread ? '#F7FDFD' : '#FFFFFF',
                    display: 'flex',
                    gap: 14,
                    alignItems: 'flex-start',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#F9FAFB')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = item.unread ? '#F7FDFD' : '#FFFFFF')
                  }
                >
                  {/* Left Icon Badge */}
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 6,
                      background: getIconBg(item.type),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {getIcon(item.type)}
                  </div>

                  {/* Content Body */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span
                          style={{
                            fontSize: 14,
                            fontWeight: item.unread ? 600 : 500,
                            color: item.unread ? '#00796B' : '#1E293B',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.title}
                        </span>
                        {item.unread && (
                          <span
                            style={{
                              background: '#DCFCE7',
                              color: '#16A34A',
                              fontSize: 11,
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            Mới
                          </span>
                        )}
                      </div>

                      <span style={{ fontSize: 12, color: '#94A3B8', whiteSpace: 'nowrap' }}>
                        {item.time}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        color: '#475569',
                        marginTop: 4,
                        lineHeight: 1.5,
                      }}
                    >
                      {item.message}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: 8,
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {item.unread && (
                          <span
                            onClick={(e) => handleMarkAsRead(item.id, e)}
                            style={{
                              color: '#009688',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                          >
                            <CheckOutlined style={{ fontSize: 11 }} /> Đánh dấu đã đọc
                          </span>
                        )}
                      </div>

                      {item.link && (
                        <span
                          style={{
                            color: '#009688',
                            fontWeight: 500,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          Xem chi tiết <RightOutlined style={{ fontSize: 10 }} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
