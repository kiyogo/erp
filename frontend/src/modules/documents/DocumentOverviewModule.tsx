import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AuditOutlined,
  CloudServerOutlined,
  DownloadOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Button, Drawer, Progress, Tag, message } from '../../custom-ui';
import { contractsApi, documentsApi, filesApi, type ContractPayload, type EnterpriseDocument, type StoredFileNode } from '../../api/endpoints';

type OverviewDocumentItem = {
  key: string;
  docNumber: string;
  title: string;
  docType: string;
  issuingDept: string;
  signer: string;
  signerRole: string;
  issuedDate: string;
  effectiveDate: string;
  securityLevel: string;
  status: string;
  fileCount: number;
  fileName: string;
  fileSize: string;
  summary: string;
  source: 'document' | 'contract';
};

const TODAY = new Date('2026-08-29T00:00:00');

const formatSize = (sizeBytes: number) => {
  if (sizeBytes >= 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${sizeBytes} B`;
};

const keywordType = (title: string) => {
  const value = title.toLowerCase();
  if (value.includes('quyết định') || value.includes('quy che')) return 'Quy chế & quyết định';
  if (value.includes('hợp đồng') || value.includes('nda')) return 'Hợp đồng & pháp lý';
  if (value.includes('thông báo')) return 'Thông báo';
  return 'Tài liệu cộng tác';
};

const normalizeDocument = (item: EnterpriseDocument): OverviewDocumentItem => ({
  key: `doc-${item.id}`,
  docNumber: item.id,
  title: item.title,
  docType: keywordType(item.title),
  issuingDept: item.ownerName || item.ownerCode || 'Chưa rõ đơn vị',
  signer: item.ownerName || 'Chưa rõ người phụ trách',
  signerRole: item.userRole || 'owner',
  issuedDate: item.createdAt?.slice(0, 10) || '',
  effectiveDate: item.updatedAt?.slice(0, 10) || item.createdAt?.slice(0, 10) || '',
  securityLevel: String(item.settings?.securityLevel || 'Nội bộ'),
  status: item.currentRevision > 1 ? 'Đang cộng tác' : 'Mới tạo',
  fileCount: Math.max(1, Number(item.currentRevision || 1)),
  fileName: `${item.title || item.id}.docx`,
  fileSize: 'Không xác định',
  summary: `Tài liệu cộng tác do ${item.ownerName || item.ownerCode || 'người dùng'} quản lý. Revision hiện tại: ${item.currentRevision}.`,
  source: 'document',
});

const normalizeContract = (item: ContractPayload): OverviewDocumentItem => ({
  key: `contract-${item.id || item.key || item.code}`,
  docNumber: item.code || item.id || 'HD',
  title: item.name,
  docType: 'Hợp đồng & pháp lý',
  issuingDept: item.department || item.contractCategory || 'Chưa phân loại',
  signer: item.signerName || item.employeeName || item.partyBName || 'Chưa có người ký',
  signerRole: item.signerPosition || 'Đại diện ký',
  issuedDate: item.createdAt?.slice(0, 10) || item.startDate || '',
  effectiveDate: item.startDate || item.updatedAt?.slice(0, 10) || '',
  securityLevel: item.ndaClause ? 'Mật' : 'Nội bộ',
  status: item.status || 'Chưa xác định',
  fileCount: item.fileNodeId ? 1 : 0,
  fileName: item.companySignedFileName || item.employeeSignedFileName || `${item.code || item.id || 'hop-dong'}.pdf`,
  fileSize: 'Không xác định',
  summary: `Hợp đồng thuộc mẫu ${item.contractTemplate}. Bên liên quan: ${item.employeeName || item.partyBName || 'chưa gắn đối tượng'}.`,
  source: 'contract',
});

export const DocumentOverviewModule: React.FC = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<EnterpriseDocument[]>([]);
  const [contracts, setContracts] = useState<ContractPayload[]>([]);
  const [files, setFiles] = useState<StoredFileNode[]>([]);
  const [detailItem, setDetailItem] = useState<OverviewDocumentItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      documentsApi.getAll(),
      contractsApi.getAll(),
      filesApi.list(),
    ]).then(([documentRes, contractRes, fileRes]) => {
      if (documentRes.status === 'fulfilled') setDocuments(documentRes.value.data.data || []);
      if (contractRes.status === 'fulfilled') setContracts(contractRes.value.data.data || []);
      if (fileRes.status === 'fulfilled') setFiles(fileRes.value.data.data || []);
    }).catch(() => {
      message.error('Không thể tải tổng quan văn bản.');
    });
  }, []);

  const data = useMemo(() => {
    const merged = [
      ...documents.map(normalizeDocument),
      ...contracts.map(normalizeContract),
    ];
    return merged.sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate));
  }, [contracts, documents]);

  const totalStorageBytes = files.reduce((sum, item) => sum + Number(item.sizeBytes || 0), 0);
  const collaborativeDocs = documents.length;
  const legalDocs = contracts.length;
  const pendingDocuments = contracts.filter((item) => item.status === 'Chờ ký' || item.status === 'Chờ duyệt').length;
  const signedContracts = contracts.filter((item) => item.employeeSignStatus === 'Đã ký' || item.companySignStatus === 'Đã ký').length;

  const breakdown = useMemo(() => {
    const groups = new Map<string, number>();
    data.forEach((item) => groups.set(item.docType, (groups.get(item.docType) || 0) + 1));
    const total = data.length || 1;
    return Array.from(groups.entries()).map(([name, count], index) => ({
      name,
      count,
      percent: Math.round((count / total) * 100),
      color: ['#009688', '#2563EB', '#7C3AED', '#D97706'][index % 4],
    }));
  }, [data]);

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng hồ sơ tài liệu</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{data.length}</div>
            <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Gồm tài liệu cộng tác và hợp đồng</div>
          </div>
          <div style={{ width: 46, height: 46, borderRadius: 8, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileTextOutlined style={{ fontSize: 24, color: '#009688' }} />
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tài liệu cộng tác</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{collaborativeDocs}</div>
            <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Lấy từ bảng `documents`</div>
          </div>
          <div style={{ width: 46, height: 46, borderRadius: 8, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <InboxOutlined style={{ fontSize: 24, color: '#2563EB' }} />
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hồ sơ chờ ký hoặc chờ duyệt</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>{pendingDocuments}</div>
            <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Tính từ trạng thái hợp đồng hiện tại</div>
          </div>
          <div style={{ width: 46, height: 46, borderRadius: 8, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SafetyCertificateOutlined style={{ fontSize: 24, color: '#D97706' }} />
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Dung lượng tệp đang thấy ở kho gốc</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{formatSize(totalStorageBytes)}</div>
            <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{files.length} mục tệp/thư mục ở root</div>
          </div>
          <div style={{ width: 46, height: 46, borderRadius: 8, background: '#F0FDF4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CloudServerOutlined style={{ fontSize: 24, color: '#16A34A' }} />
          </div>
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CloudServerOutlined style={{ fontSize: 20, color: '#009688' }} />
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
              Tình trạng lưu trữ tài liệu tính đến ngày 2026-08-29
            </div>
            <div style={{ fontSize: 12, color: '#64748B' }}>
              {signedContracts} hợp đồng đã có ít nhất một lượt ký số hoặc xác nhận lưu dấu.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 140 }}>
            <Progress percent={data.length > 0 ? Math.min(100, Math.round((signedContracts / data.length) * 100)) : 0} size="small" strokeColor="#009688" />
          </div>
          <Button
            icon={<SafetyCertificateOutlined />}
            onClick={() => navigate('/admin/documents/settings')}
            style={{ borderColor: '#009688', color: '#009688' }}
          >
            Thiết lập tài liệu
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AuditOutlined style={{ color: '#009688' }} /> Hồ Sơ Gần Đây
            </h3>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => navigate('/admin/documents/archives')}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Vào sổ
              </Button>
              <Button type="link" onClick={() => navigate('/admin/documents/list')} style={{ color: '#009688', fontWeight: 600 }}>
                Xem tất cả
              </Button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.length === 0 ? (
              <div style={{ fontSize: 13, color: '#64748B' }}>Chưa có văn bản hoặc hợp đồng để hiển thị.</div>
            ) : data.slice(0, 8).map((item) => (
              <div
                key={item.key}
                style={{
                  padding: '12px 14px',
                  borderRadius: 6,
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: '#009688', fontSize: 12 }}>{item.docNumber}</span>
                    <Tag color={item.source === 'contract' ? 'blue' : 'cyan'} style={{ margin: 0, fontSize: 10.5 }}>
                      {item.docType}
                    </Tag>
                    <Tag color={item.securityLevel === 'Mật' ? 'error' : 'default'} style={{ margin: 0, fontSize: 10.5 }}>
                      {item.securityLevel}
                    </Tag>
                  </div>
                  <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13, marginTop: 4 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
                    Nguồn: <strong>{item.issuingDept}</strong> · Phụ trách: <strong>{item.signer}</strong> ({item.issuedDate})
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <Tag color={item.status === 'Còn hiệu lực' || item.status === 'Đang cộng tác' || item.status === 'Mới tạo' ? 'success' : 'warning'}>
                    {item.status}
                  </Tag>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(item);
                      setDrawerOpen(true);
                    }}
                  >
                    Xem
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FolderOpenOutlined style={{ color: '#2563EB' }} /> Phân Bổ Theo Loại Hồ Sơ
              </h3>
              <Tag color="blue">Dữ liệu thật</Tag>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {breakdown.length === 0 ? (
                <div style={{ fontSize: 13, color: '#64748B' }}>Chưa có loại hồ sơ nào để tổng hợp.</div>
              ) : breakdown.map((item) => (
                <div key={item.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{item.name}</span>
                    <span style={{ color: '#64748B', fontWeight: 700 }}>
                      {item.count} hồ sơ ({item.percent}%)
                    </span>
                  </div>
                  <Progress percent={item.percent} strokeColor={item.color} showInfo={false} size="small" />
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 20, borderTop: '1px solid #E2E8F0', paddingTop: 14 }}>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>
              Hợp đồng đang hiệu lực đến ngày 2026-08-29: <strong style={{ color: '#0F172A' }}>{contracts.filter((item) => item.status === 'Còn hiệu lực').length}</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                icon={<DownloadOutlined />}
                onClick={() => message.success('Đã chuẩn bị báo cáo văn bản từ dữ liệu hiện có.')}
                style={{ flex: 1 }}
              >
                Xuất báo cáo
              </Button>
              <Button
                onClick={() => navigate('/admin/documents/settings')}
                style={{ flex: 1 }}
              >
                Thiết lập
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Drawer
        title="Chi tiết hồ sơ tài liệu"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.docNumber}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.title}</div>
                </div>
                <Tag color={detailItem.status === 'Còn hiệu lực' || detailItem.status === 'Đang cộng tác' || detailItem.status === 'Mới tạo' ? 'success' : 'processing'}>
                  {detailItem.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phân loại: <strong>{detailItem.docType}</strong> · Mức độ: <strong>{detailItem.securityLevel}</strong>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Nguồn / đơn vị:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{detailItem.issuingDept}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Người phụ trách:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{detailItem.signer} ({detailItem.signerRole})</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Ngày tạo / ban hành:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{detailItem.issuedDate}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Ngày hiệu lực / cập nhật:</span>
                  <div style={{ fontWeight: 700, color: '#16A34A' }}>{detailItem.effectiveDate}</div>
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#FFFFFF' }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>Tóm tắt:</div>
              <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>{detailItem.summary}</div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FilePdfOutlined style={{ color: '#2563EB' }} /> Tệp liên quan
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FilePdfOutlined style={{ color: '#DC2626', fontSize: 22 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{detailItem.fileName}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>Bản ghi liên kết: {detailItem.fileCount} · Dung lượng: {detailItem.fileSize}</div>
                  </div>
                </div>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => message.success(`Đã chuẩn bị tải thông tin của ${detailItem.fileName}.`)}>
                  Tải
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
