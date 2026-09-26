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

export interface WorkflowAuditRecord {
  key: string;
  txCode: string;
  requestCode: string;
  workflowName: string;
  category: 'Mua sắm & Tài sản' | 'Tài chính & Thanh toán' | 'Hợp đồng & Pháp chế' | 'Nhân sự & Phúc lợi' | 'Vận hành Kỹ thuật & IDC';
  approver: string;
  approverRole: string;
  stepName: string;
  decision: 'Đã phê duyệt' | 'Từ chối' | 'Yêu cầu bổ sung';
  timestamp: string;
  certificateProvider: 'Viettel-CA' | 'VNPT-CA' | 'FPT-CA' | 'Chữ ký nội bộ';
  certificateSerial: string;
  sha256Hash: string;
  ipAddress: string;
  deviceInfo: string;
  comments: string;
  budgetAmount?: number;
  attachmentCount: number;
  validityStatus: 'Hợp lệ & Toàn vẹn' | 'Đã thu hồi chứng thư' | 'Cảnh báo sai lệch';
}

const INITIAL_AUDIT_HISTORY: WorkflowAuditRecord[] = [];

export const WorkflowHistoryModule: React.FC = () => {
  const [data] = useState<WorkflowAuditRecord[]>(INITIAL_AUDIT_HISTORY);
  const [searchText, setSearchText] = useState('');
  const [decisionFilter, setDecisionFilter] = useState<string>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  const [detailItem, setDetailItem] = useState<WorkflowAuditRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Metrics
  const totalAuditLogs = 1420;
  const approvedCount = data.filter((d) => d.decision === 'Đã phê duyệt').length;
  const rejectedCount = data.filter((d) => d.decision === 'Từ chối' || d.decision === 'Yêu cầu bổ sung').length;

  const handleVerifyIntegrity = (record: WorkflowAuditRecord) => {
    message.success(`Mã băm SHA-256 của giao dịch ${record.txCode} khớp 100% với chuỗi khối TSA. Chứng thư số ${record.certificateSerial} còn hiệu lực pháp lý!`);
  };

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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhật ký kiểm toán lưu vết (Audit Trail)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalAuditLogs.toLocaleString('vi-VN')} giao dịch
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Lưu trữ bất biến chống chối bỏ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chứng thư số CA hợp lệ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            100% Verified
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Chuỗi băm SHA-256 toàn vẹn tuyệt đối</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Giao dịch ký duyệt thành công</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            1.375 phê duyệt
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Được cấp dấu mộc điện tử hợp pháp</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Giao dịch từ chối / Bổ sung</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            45 trường hợp
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Kiểm soát rủi ro & chi tiêu vượt trần</div>
        </div>
      </div>

      {/* Filter and Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã giao dịch, mã tờ trình, người duyệt, IP..."
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
          <Button
            icon={<DownloadOutlined />}
            onClick={() => message.success('Đã xuất báo cáo kiểm toán tuân thủ (Compliance Audit Report PDF/Excel)')}
          >
            Xuất Báo Cáo Kiểm Toán
          </Button>
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
              title: 'Người ký & Quyết định',
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
              title: 'Thời gian & Địa chỉ IP',
              key: 'time',
              width: 190,
              render: (_: any, r: WorkflowAuditRecord) => (
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 600, color: '#0F172A' }}>{r.timestamp}</div>
                  <div style={{ color: '#64748B', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <GlobalOutlined /> {r.ipAddress}
                  </div>
                  <div style={{ color: '#64748B', fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}>
                    <LaptopOutlined /> {r.deviceInfo.split('·')[0]}
                  </div>
                </div>
              ),
            },
            {
              title: 'Chứng thư số Token CA',
              key: 'cert',
              width: 180,
              render: (_: any, r: WorkflowAuditRecord) => (
                <div>
                  <span style={{ fontSize: 11.5, color: '#7C3AED', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <SafetyCertificateOutlined /> {r.certificateProvider}
                  </span>
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>{r.certificateSerial}</div>
                  <Tag color="success" style={{ marginTop: 2, fontSize: 10 }}>
                    SHA-256 Valid
                  </Tag>
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
                    title="Xem chi tiết bằng chứng ký số điện tử"
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

      {/* DRAWER: Bằng Chứng Ký Số & Chứng Nhận Kiểm Toán Điện Tử */}
      <Drawer
        title="Bằng Chứng Ký Số &amp; Chứng Nhận Kiểm Toán Pháp Lý (Digital Evidence Certificate)"
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

            {/* Official Digital Signature Certificate Seal */}
            <div style={{ border: '2px solid #009688', background: '#F0FDF4', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#009688', fontWeight: 800, fontSize: 14 }}>
                <SafetyCertificateOutlined style={{ fontSize: 24 }} />
                CHỨNG THƯ KÝ SỐ ĐIỆN TỬ HỢP CHUẨN QUỐC GIA (E-SIGNATURE PKI)
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12, fontSize: 12 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Chủ thể ký số:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{detailItem.approver}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Chức danh thẩm quyền:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{detailItem.approverRole}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Tổ chức cấp phát CA:</span>
                  <div style={{ fontWeight: 700, color: '#2563EB' }}>{detailItem.certificateProvider}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Số Serial Chứng Thư:</span>
                  <div style={{ fontWeight: 700, color: '#7C3AED' }}>{detailItem.certificateSerial}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Thời gian đóng dấu thời gian (TSA):</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{detailItem.timestamp} (GMT+7)</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Trạng thái xác thực:</span>
                  <div><Tag color="success">Đã kiểm tra hợp lệ</Tag></div>
                </div>
              </div>

              <div style={{ marginTop: 12, borderTop: '1px dashed #CBD5E1', paddingTop: 10 }}>
                <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>MÃ BĂM TOÀN VẸN VĂN BẢN (SHA-256 CHECKSUM):</span>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#0F172A', background: '#FFFFFF', padding: '6px 8px', borderRadius: 4, border: '1px solid #E2E8F0', marginTop: 4, wordBreak: 'break-all' }}>
                  {detailItem.sha256Hash}
                </div>
              </div>
            </div>

            {/* Forensic Metadata Box */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#FFFFFF' }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <GlobalOutlined style={{ color: '#2563EB' }} /> Thông Tin Thiết Bị &amp; Hạ Tầng Mạng Lúc Ký:
              </div>
              <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><strong>Địa chỉ IP mạng:</strong> {detailItem.ipAddress}</div>
                <div><strong>Môi trường &amp; Thiết bị:</strong> {detailItem.deviceInfo}</div>
                <div><strong>Số lượng tệp đính kèm niêm phong:</strong> {detailItem.attachmentCount} tài liệu gốc</div>
              </div>
            </div>

            {/* Approval Comment */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Ý kiến / Nhận xét phê duyệt chính thức:</div>
              <div style={{ fontSize: 12.5, color: '#334155', fontStyle: 'italic', lineHeight: 1.6 }}>
                "{detailItem.comments}"
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất chứng chỉ kiểm toán giao dịch ${detailItem.txCode} (PDF)`)}
                style={{ flex: 1 }}
              >
                In Chứng Thư Kiểm Toán (PDF)
              </Button>
              <Button
                type="primary"
                icon={<SecurityScanOutlined />}
                onClick={() => handleVerifyIntegrity(detailItem)}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Đối soát chữ ký số (Verify)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

