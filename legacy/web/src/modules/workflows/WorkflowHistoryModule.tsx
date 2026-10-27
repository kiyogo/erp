import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  SearchOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SafetyCertificateOutlined,
  HistoryOutlined,
  KeyOutlined,
  EyeOutlined,
  PrinterOutlined,
  FilePdfOutlined,
  ReloadOutlined,
  SecurityScanOutlined,
  BranchesOutlined,
  LaptopOutlined,
  GlobalOutlined,
  CheckOutlined,
  CommentOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Input, Button, message, Tag, Drawer, Select, Tooltip, Alert, Card } from '../../custom-ui';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';

export interface WorkflowAuditRecord {
  key: string;
  txCode: string;
  requestCode: string;
  workflowName: string;
  category: 'Mua sắm & Tài sản' | 'Tài chính & Thanh toán' | 'Hợp đồng & Pháp chế' | 'Nhân sự & Phúc lợi' | 'Vận hành Kỹ thuật & IDC';
  approver: string;
  approverRole: string;
  level: number;
  stepName: string;
  decision: 'Đã phê duyệt' | 'Từ chối' | 'Yêu cầu bổ sung';
  timestamp: string;
  certificateProvider: 'Viettel-CA' | 'VNPT-CA' | 'FPT-CA' | 'Chữ ký nội bộ';
  certificateSerial: string;
  sha256Hash: string;
  hashPayload?: { previousHash?: string };
  ipAddress: string;
  deviceInfo: string;
  comments: string;
  budgetAmount?: number;
  attachmentCount: number;
  validityStatus: 'Chưa kiểm tra' | 'Hợp lệ & Toàn vẹn' | 'Đã thu hồi chứng thư' | 'Cảnh báo sai lệch';
}

export const WorkflowHistoryModule: React.FC = () => {
  const [requests, setRequests] = useState<Array<Record<string, any>>>([]);
  const [integrityResults, setIntegrityResults] = useState<Record<string, 'Hợp lệ & Toàn vẹn' | 'Cảnh báo sai lệch'>>({});

  useEffect(() => {
    setRequests(dataService.getGenericData('workflow_requests'));
    return dataService.subscribe(() => setRequests(dataService.getGenericData('workflow_requests')));
  }, []);

  const data: WorkflowAuditRecord[] = requests.flatMap((request) =>
    (Array.isArray(request.approvalHistory) ? request.approvalHistory : []).map((event: any) => ({
      ...event,
      key: event.txCode,
      requestCode: request.code,
      workflowName: request.workflowName,
      category: request.category,
      stepName: `Cấp ${event.level}`,
      budgetAmount: request.budgetAmount,
      attachmentCount: request.attachments?.length || 0,
      ipAddress: '',
      deviceInfo: '',
      validityStatus: integrityResults[event.txCode] || 'Chưa kiểm tra',
    }))
  );
  const [searchText, setSearchText] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  const [detailItem, setDetailItem] = useState<WorkflowAuditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Metrics
  const totalAuditLogs = data.length;
  const approvedCount = data.filter((d) => d.decision === 'Đã phê duyệt').length;
  const rejectedCount = data.filter((d) => d.decision === 'Từ chối' || d.decision === 'Yêu cầu bổ sung').length;

  const handleVerifyIntegrity = async (record: WorkflowAuditRecord) => {
    if (!record.hashPayload || !record.sha256Hash || !globalThis.crypto?.subtle) {
      message.warning('Không đủ dữ liệu để kiểm tra mã băm của giao dịch này.');
      return;
    }
    try {
      const bytes = new TextEncoder().encode(JSON.stringify(record.hashPayload));
      const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      const actual = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
      if (actual === record.sha256Hash.toLowerCase()) {
        setIntegrityResults((results) => ({ ...results, [record.txCode]: 'Hợp lệ & Toàn vẹn' }));
        message.success('Nội dung khớp với mã SHA-256 đã lưu. Kiểm tra này không xác thực chứng thư CA.');
      } else {
        setIntegrityResults((results) => ({ ...results, [record.txCode]: 'Cảnh báo sai lệch' }));
        message.error('Nội dung không khớp với mã SHA-256 đã lưu.');
      }
    } catch {
      message.error('Không thể kiểm tra mã băm của giao dịch.');
    }
  };

  const exportHistory = () => downloadFile(`Lich_su_phe_duyet_${new Date().toISOString().slice(0, 10)}.xlsx`, generateValidXlsxBlob([
    ['Mã giao dịch', 'Mã hồ sơ', 'Quy trình', 'Cấp', 'Người xử lý', 'Quyết định', 'Thời gian', 'Ý kiến', 'Phương thức', 'SHA-256'],
    ...filteredData.map((record) => [record.txCode, record.requestCode, record.workflowName, record.level, record.approver, record.decision, record.timestamp, record.comments, record.certificateProvider, record.sha256Hash]),
  ]));

  const exportDecision = (record: WorkflowAuditRecord) => downloadFile(
    `Phieu_xu_ly_${record.requestCode}_${record.txCode}.pdf`,
    generateValidPdfBlob('PHIẾU GHI NHẬN XỬ LÝ QUY TRÌNH', record.requestCode, [
      `Quy trình: ${record.workflowName}`,
      `Cấp xử lý: ${record.stepName}`,
      `Người xử lý: ${record.approver} (${record.approverRole})`,
      `Quyết định: ${record.decision}`,
      `Thời gian: ${record.timestamp}`,
      `Ý kiến: ${record.comments || 'Không có'}`,
      `Phương thức: ${record.certificateProvider}`,
      `SHA-256: ${record.sha256Hash}`,
      'Phiếu ghi nhận quyết định nội bộ; không thay thế chữ ký số CA.',
    ])
  );

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.txCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.requestCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.workflowName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.approver || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.certificateSerial || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.ipAddress || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.comments || '').toLowerCase().includes(searchText.toLowerCase());

    const matchDec = decisionFilter === 'all' || item.decision === decisionFilter;
    const matchProv = providerFilter === 'all' || item.certificateProvider === providerFilter;

    return matchSearch && matchDec && matchProv;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quyết định đã lưu lịch sử</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalAuditLogs.toLocaleString('vi-VN')} giao dịch
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Dữ liệu lấy từ hồ sơ quy trình</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quyết định có mã SHA-256</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.filter((d) => Boolean(d.sha256Hash)).length}
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Có thể kiểm tra nội dung khi mở hồ sơ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Giao dịch ký duyệt thành công</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {approvedCount} phê duyệt
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Quyết định nội bộ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Giao dịch từ chối / Bổ sung</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {rejectedCount} trường hợp
          </div>
            <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Từ chối hoặc cần bổ sung</div>
        </div>
      </div>

      {/* Filter and Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã giao dịch, mã hồ sơ, người xử lý..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={decisionFilter}
            onChange={setDecisionFilter}
            style={{ width: 180 }}
            options={[
              { label: 'Tất cả quyết định', value: 'all' },
              { label: 'Đã phê duyệt', value: 'Đã phê duyệt' },
              { label: 'Từ chối', value: 'Từ chối' },
              { label: 'Yêu cầu bổ sung', value: 'Yêu cầu bổ sung' },
            ]}
          />
          <Select
            value={providerFilter}
            onChange={setProviderFilter}
            style={{ width: 180 }}
            options={[
              { label: 'Tất cả nhà cung cấp CA', value: 'all' },
              { label: 'Viettel-CA', value: 'Viettel-CA' },
              { label: 'VNPT-CA', value: 'VNPT-CA' },
              { label: 'Chữ ký nội bộ', value: 'Chữ ký nội bộ' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} disabled={!filteredData.length} onClick={exportHistory}>Xuất lịch sử</Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã Audit & Hồ sơ',
              key: 'code',
              width: 170,
              render: (_: any, r: WorkflowAuditRecord) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <HistoryOutlined /> {r.txCode}
                  </span>
                  <div style={{ fontSize: 11.5, color: '#2563EB', fontWeight: 600, marginTop: 2 }}>
                    {r.requestCode}
                  </div>
                  <Tag color="cyan" style={{ marginTop: 2, fontSize: 10.5 }}>
                    {r.category.split(' ')[0]}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Quy trình, Cấp duyệt & Ý kiến chỉ đạo',
              key: 'info',
              render: (_: any, r: WorkflowAuditRecord) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.workflowName}</strong>
                  <div style={{ fontSize: 12, color: '#2563EB', marginTop: 2, fontWeight: 500 }}>
                    {r.stepName}
                  </div>
                  <div style={{ fontSize: 12, color: '#334155', fontStyle: 'italic', background: '#F8FAFC', padding: '4px 8px', borderRadius: 4, marginTop: 4 }}>
                    <><CommentOutlined style={{ marginRight: 4 }} />"{r.comments}"</>
                  </div>
                </div>
              ),
            },
            {
              title: 'Người xử lý & Quyết định',
              key: 'decision',
              width: 190,
              render: (_: any, r: WorkflowAuditRecord) => {
                let col = 'default';
                let icon = <CheckCircleOutlined />;
                if (r.decision === 'Đã phê duyệt') {
                  col = 'success';
                  icon = <CheckCircleOutlined />;
                } else if (r.decision === 'Từ chối') {
                  col = 'error';
                  icon = <CloseCircleOutlined />;
                } else {
                  col = 'warning';
                  icon = <SecurityScanOutlined />;
                }

                return (
                  <div>
                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{r.approver}</div>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>{r.approverRole}</div>
                    <Tag color={col} icon={icon} style={{ marginTop: 4, fontWeight: 600 }}>
                      {r.decision}
                    </Tag>
                  </div>
                );
              },
            },
            {
              title: 'Thời gian xử lý',
              key: 'time',
              width: 190,
              render: (_: any, r: WorkflowAuditRecord) => (
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: '#0F172A' }}>{r.timestamp}</div>
                </div>
              ),
            },
            {
              title: 'Phương thức & Mã băm',
              key: 'cert',
              width: 180,
              render: (_: any, r: WorkflowAuditRecord) => (
                <div>
                  <span style={{ fontSize: 11.5, color: '#7C3AED', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <SafetyCertificateOutlined /> {r.certificateProvider}
                  </span>
                  <Tag color={r.validityStatus === 'Hợp lệ & Toàn vẹn' ? 'success' : 'default'} style={{ marginTop: 2, fontSize: 10 }}>{r.validityStatus}</Tag>
                </div>
              ),
            },
            {
              title: 'Thao tác',
              key: 'actions',
              width: 140,
              render: (_: any, r: WorkflowAuditRecord) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem quyết định và dữ liệu kiểm tra"
                  >
                    Chi tiết
                  </Button>
                  <Tooltip title="Kiểm tra tính toàn vẹn mã băm SHA-256">
                    <Button
                      size="small"
                      icon={<SecurityScanOutlined />}
                      onClick={() => handleVerifyIntegrity(r)}
                      style={{ color: '#009688' }}
                    />
                  </Tooltip>
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      <Drawer
        title="Chi tiết quyết định quy trình"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={680}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Document */}
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>
                    MÃ AUDIT: {detailItem.txCode} · HỒ SƠ: {detailItem.requestCode}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                    {detailItem.workflowName}
                  </div>
                </div>
                <Tag color={detailItem.decision === 'Đã phê duyệt' ? 'success' : 'error'}>
                  {detailItem.decision}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Cấp thực thi: <strong>{detailItem.stepName}</strong>
              </div>
              {detailItem.budgetAmount && (
                <div style={{ fontSize: 13, color: '#16A34A', fontWeight: 800, marginTop: 4 }}>
                  Giá trị thẩm định: {detailItem.budgetAmount.toLocaleString('vi-VN')} ₫
                </div>
              )}
            </div>

            <div style={{ border: '2px solid #009688', background: '#F0FDF4', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#009688', fontWeight: 800, fontSize: 14 }}>
                <SafetyCertificateOutlined style={{ fontSize: 24 }} />
                QUYẾT ĐỊNH PHÊ DUYỆT NỘI BỘ
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12, fontSize: 12 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Người xử lý:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{detailItem.approver}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Vai trò:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{detailItem.approverRole}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Phương thức ghi nhận:</span>
                  <div style={{ fontWeight: 700, color: '#2563EB' }}>{detailItem.certificateProvider}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Thời gian:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{new Date(detailItem.timestamp).toLocaleString('vi-VN')}</div>
                </div>
              </div>

              <div style={{ marginTop: 12, borderTop: '1px dashed #CBD5E1', paddingTop: 10 }}>
                <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>MÃ SHA-256 ĐÃ LƯU:</span>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#0F172A', background: '#FFFFFF', padding: '6px 8px', borderRadius: 4, border: '1px solid #E2E8F0', marginTop: 4, wordBreak: 'break-all' }}>
                  {detailItem.sha256Hash}
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#FFFFFF' }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <HistoryOutlined style={{ color: '#2563EB' }} /> Dữ liệu ghi nhận:
              </div>
              <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><strong>Cấp xử lý:</strong> {detailItem.level}</div>
                <div><strong>Số tệp đính kèm:</strong> {detailItem.attachmentCount}</div>
                <div><strong>Hash trước đó:</strong> {detailItem.hashPayload?.previousHash || 'Không có'}</div>
              </div>
            </div>

            {/* Approval Comment */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Ý kiến xử lý:</div>
              <div style={{ fontSize: 12.5, color: '#334155', fontStyle: 'italic', lineHeight: 1.6 }}>
                "{detailItem.comments}"
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => exportDecision(detailItem)}
                style={{ flex: 1 }}
              >
                Tải phiếu xử lý (PDF)
              </Button>
              <Button
                type="primary"
                icon={<SecurityScanOutlined />}
                onClick={() => handleVerifyIntegrity(detailItem)}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Kiểm tra mã băm
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

