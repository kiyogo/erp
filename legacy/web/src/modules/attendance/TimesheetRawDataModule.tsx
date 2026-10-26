import { dataService } from '../../services/dataService';
import { collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import React, { useEffect, useState } from 'react';
import {
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  DesktopOutlined,
  MobileOutlined,
  ScanOutlined,
  IdcardOutlined,
  EnvironmentOutlined,
  EyeOutlined,
  CheckOutlined,
  CodeOutlined,
  WifiOutlined,
  CreditCardOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Input, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseRawLogItem {
  key: string;
  logId: string;
  terminalName: string;
  terminalIp: string;
  cardUid: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  timestamp: string;
  verifyMode: 'FaceID AI' | 'Thẻ Từ NFC' | 'Vân Tay' | 'Mobile Geofence GPS';
  matchScore: number;
  temperature?: string;
  gpsCoordinates?: string;
  rawPayload?: string;
  status: 'Dữ liệu hợp lệ' | 'Bản ghi trùng lặp (Đã lọc)' | 'Cần kiểm tra';
}

const INITIAL_RAW_LOGS: EnterpriseRawLogItem[] = [];

export const TimesheetRawDataModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseRawLogItem[]>(INITIAL_RAW_LOGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void dataService.refreshGenericData('attendance_raw_data').catch(() => message.error('Không thể tải dữ liệu từ máy chủ.'));
    const list = dataService.getGenericData('attendance_raw_data');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('attendance_raw_data');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [modeFilter, setModeFilter] = useState('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<EnterpriseRawLogItem | null>(null);

  const validCount = data.filter((d) => d.status === 'Dữ liệu hợp lệ').length;
  const duplicateCount = data.filter((d) => d.status === 'Bản ghi trùng lặp (Đã lọc)').length;

  const handleSync = async () => {
    try {
      const rows = await dataService.refreshGenericData('attendance_raw_data');
      message.info(`Đã tải lại ${rows.length} bản ghi đã lưu. Chưa cấu hình nhà cung cấp để đồng bộ máy chấm công.`);
    } catch { message.error('Không thể tải dữ liệu chấm công thô.'); }
  };

  const handleValidate = async (record: EnterpriseRawLogItem) => {
    if (saving) return;
    setSaving(true);
    try {
      if (record.status === 'Bản ghi trùng lặp (Đã lọc)') throw new Error('Không thể ghi nhận công cho bản ghi trùng lặp.');
      await collectionsApi.update('attendance_raw_data', record.key, { status: 'Dữ liệu hợp lệ' });
      await dataService.refreshGenericData('attendance_raw_data');
      message.success('Đã xác nhận bản ghi hợp lệ trên hệ thống.'); setDrawerOpen(false);
    } catch (error: any) { message.error(error?.response?.data?.message || error.message || 'Không thể xác nhận bản ghi.'); }
    finally { setSaving(false); }
  };

  const filteredData = data.filter((item) => {
    const matchMode = modeFilter === 'all' || item.verifyMode === modeFilter;
    const matchSearch =
      (item.logId || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.terminalName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.terminalIp || '').toLowerCase().includes(searchText.toLowerCase());

    return matchMode && matchSearch;
  });

  const columns = [
    {
      title: 'Mã Log & Thời gian chính xác',
      key: 'logId',
      render: (_: any, record: EnterpriseRawLogItem) => (
        <div>
          <div style={{ fontWeight: 800, color: '#009688', fontSize: 13 }}>{record.logId}</div>
          <div style={{ fontSize: 11.5, color: '#0F172A', fontWeight: 600, marginTop: 2 }}>
            <code>{record.timestamp}</code>
          </div>
        </div>
      ),
    },
    {
      title: 'Thiết bị quẹt thẻ & IP Gateway',
      key: 'terminal',
      render: (_: any, record: EnterpriseRawLogItem) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 13 }}>{record.terminalName}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB' }}>IP: {record.terminalIp} · UID: {record.cardUid}</div>
        </div>
      ),
    },
    {
      title: 'Nhân viên nhận diện',
      key: 'employeeName',
      width: 200,
      render: (_: any, record: EnterpriseRawLogItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Mã: <code>{record.employeeCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Phương thức & Độ tin cậy',
      key: 'verifyMode',
      width: 210,
      render: (_: any, record: EnterpriseRawLogItem) => (
        <div>
          <div style={{ fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            {record.verifyMode === 'FaceID AI' && <ScanOutlined style={{ color: '#009688' }} />}
            {record.verifyMode === 'Mobile Geofence GPS' && <EnvironmentOutlined style={{ color: '#2563EB' }} />}
            {record.verifyMode === 'Thẻ Từ NFC' && <IdcardOutlined style={{ color: '#D97706' }} />}
            {record.verifyMode}
          </div>
          <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
            Khớp: {record.matchScore}% {record.temperature && `· Nhiệt độ: ${record.temperature}`}
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái xử lý',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Dữ liệu hợp lệ') color = 'success';
        if (status === 'Bản ghi trùng lặp (Đã lọc)') color = 'default';
        if (status === 'Cần kiểm tra') color = 'warning';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 100,
      render: (_: any, record: EnterpriseRawLogItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedLog(record);
            setDrawerOpen(true);
          }}
        >
          Payload
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng bản ghi nhận diện thu thập</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Bản ghi
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Trích xuất trực tiếp từ các cổng kiểm soát</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Bản ghi hợp lệ đã ghi nhận công</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {validCount} Lượt điểm danh
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Bản ghi đã được xác nhận hợp lệ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Bản ghi trùng lặp (Lọc thông minh)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#64748B', marginTop: 4 }}>
            {duplicateCount} Bản ghi
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Loại bỏ quẹt liên tiếp dưới 15 giây</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thiết bị có dữ liệu đã lưu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {new Set(data.map((item) => item.terminalName).filter(Boolean)).size} Thiết bị
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Chưa có kết nối thiết bị thời gian thực</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả log' },
            { key: 'FaceID AI', label: '📸 FaceID AI' },
            { key: 'Thẻ Từ NFC', label: 'Thẻ Từ NFC', icon: <CreditCardOutlined style={{ color: '#0284C7' }} /> },
            { key: 'Mobile Geofence GPS', label: '📱 GPS Mobile' },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setModeFilter(tab.key)}
              style={{
                backgroundColor: modeFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: modeFilter === tab.key ? '#009688' : '#CBD5E1',
                color: modeFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: modeFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã log, tên nhân sự, thiết bị..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('Nhat_ky_cham_cong.xlsx', generateValidXlsxBlob([['Mã log', 'Mã NV', 'Nhân viên', 'Thiết bị', 'Thời gian', 'Phương thức', 'Điểm khớp', 'Trạng thái'], ...filteredData.map((item) => [item.logId, item.employeeCode, item.employeeName, item.terminalName, item.timestamp, item.verifyMode, item.matchScore, item.status])]))}>
            Xuất File Log
          </Button>

          <Button
            type="primary"
            icon={<ReloadOutlined />}
            onClick={handleSync}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đồng bộ máy quét IoT
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* DRAWER: Phân Tích Raw Payload & AI Match Inspection */}
      <Drawer
        title="Gói Dữ Liệu Raw Log IoT &amp; AI Inspection"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedLog.logId}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedLog.employeeName}
                  </div>
                </div>
                <Tag color={selectedLog.status === 'Dữ liệu hợp lệ' ? 'success' : 'default'}>
                  {selectedLog.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Mã: <code>{selectedLog.employeeCode}</code> · {selectedLog.department}
              </div>
            </div>

            {/* Technical Verification Details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Số Kỹ Thuật Bản Ghi Nhận Diện:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời gian timestamp:</span>
                  <strong>{selectedLog.timestamp}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thiết bị thu thập:</span>
                  <span>{selectedLog.terminalName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Địa chỉ IP Gateway:</span>
                  <code>{selectedLog.terminalIp}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Mã thẻ NFC / UID:</span>
                  <code>{selectedLog.cardUid}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Độ khớp AI Match Score:</span>
                  <strong style={{ color: '#16A34A' }}>{selectedLog.matchScore}%</strong>
                </div>
                {selectedLog.gpsCoordinates && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Tọa độ GPS Geofence:</span>
                    <strong style={{ color: '#2563EB' }}>{selectedLog.gpsCoordinates}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Raw JSON Payload */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#0F172A', color: '#F8FAFC' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#38BDF8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CodeOutlined /> RAW JSON GỐC TỪ THIẾT BỊ IOT:
              </div>
              <pre style={{ margin: 0, fontSize: 11.5, color: '#A5F3FC', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {selectedLog.rawPayload || '{}'}
              </pre>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => handleValidate(selectedLog)}
              loading={saving}
            >
              Ép Đồng Bộ Vào Bảng Chấm Công
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

