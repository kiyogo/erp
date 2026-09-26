import React, { useState, useEffect } from 'react';
import {
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Input, message } from '../../custom-ui';
import { dataService, AuditLog } from '../../services/dataService';

export const LogsSettingsModule: React.FC = () => {
  const [data, setData] = useState<AuditLog[]>([]);
  const [searchText, setSearchText] = useState('');

  const loadData = () => {
    setData(dataService.getAuditLogs());
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredData = data.filter(
    (l) =>
      (l.action || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (l.module || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (l.detail || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (l.user || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: 'Thời gian',
      dataIndex: 'timestamp',
      key: 'timestamp',
      render: (t: string) => <span style={{ fontWeight: 600, color: '#009688', fontSize: 12.5 }}>{t}</span>,
    },
    {
      title: 'Người thực hiện',
      dataIndex: 'user',
      key: 'user',
      render: (u: string) => <span style={{ fontWeight: 500, color: '#212121' }}>{u}</span>,
    },
    {
      title: 'Hành động',
      dataIndex: 'action',
      key: 'action',
      render: (act: string) => {
        const isCreate = act === 'Thêm mới';
        const isApprove = act === 'Phê duyệt';
        const isDelete = act === 'Xóa';
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 600,
              background: isCreate ? '#E8F5E9' : isApprove ? '#E3F2FD' : isDelete ? '#FFEBEE' : '#F5F5F5',
              color: isCreate ? '#2E7D32' : isApprove ? '#1565C0' : isDelete ? '#C62828' : '#616161',
            }}
          >
            {act}
          </span>
        );
      },
    },
    {
      title: 'Phân hệ',
      dataIndex: 'module',
      key: 'module',
      render: (m: string) => <span style={{ fontWeight: 600, color: '#374151' }}>{m}</span>,
    },
    {
      title: 'Nội dung chi tiết thay đổi',
      dataIndex: 'detail',
      key: 'detail',
      render: (d: string) => <span style={{ color: '#212121' }}>{d}</span>,
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="Tìm theo hành động, người thực hiện, phân hệ, nội dung..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 360, borderRadius: 6 }}
          allowClear
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} onClick={loadData}>
          Làm mới
        </Button>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất toàn bộ nhật ký hệ thống ra Excel')}>
            Xuất Excel
          </Button>
        </div>
      </div>

      <div className="transparent-table-card" style={{ width: '100%' }}>
        <KTable
          dataSource={filteredData}
          columns={columns}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total, range) => (
              <span style={{ fontSize: 13, color: '#757575' }}>
                Hiển thị {range[0]}-{range[1]} trên tổng số {total} bản ghi nhật ký
              </span>
            ),
          }}
        />
      </div>
    </div>
  );
};
