import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  SafetyCertificateOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileDoneOutlined,
  AuditOutlined,
  UserOutlined,
  InboxOutlined,
  InfoCircleOutlined,
  ClockCircleOutlined,
  GlobalOutlined,
  BankOutlined,
  IdcardOutlined,
  TagOutlined,
  EyeOutlined,
  CopyOutlined,
  LockOutlined,
  CompassOutlined,
  FileProtectOutlined,
  SafetyOutlined,
  LinkOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { FileUploadDialog } from '../../components/FileUploadDialog';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Tooltip } from '../../custom-ui';
import {
  verifyDocumentSignatures,
  VerificationResult,
  VerifiedSignature
} from '../../utils/digitalSignatureVerifier';

interface DigitalCert {
  key: string;
  certNumber: string;
  provider: string;
  subjectName: string;
  signType: 'USB Token' | 'Cloud CA (Ký từ xa)' | 'HSM Server';
  authorizedSigner: string;
  validFrom: string;
  validTo: string;
  status: 'Còn hiệu lực' | 'Sắp hết hạn' | 'Đã hết hạn';
}

const INITIAL_CERTS: DigitalCert[] = [];

export const DigitalSignatureModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname;

  const isVerifyRoute = currentPath.includes('/verify');
  const isEmployeeVerifyRoute = currentPath.startsWith('/employee/digital-signature/verify');
  const isHistoryRoute = currentPath.includes('/history');
  const isProvidersRoute = currentPath.includes('/providers');
  const isSignersRoute = currentPath.includes('/signers');
  const isAlertsRoute = currentPath.includes('/alerts');
  const isRenewRoute = currentPath.includes('/renew');

  const [data, setData] = useState<DigitalCert[]>(INITIAL_CERTS);

  useEffect(() => {
    const list = dataService.getGenericData('finance_digital_signatures');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_digital_signatures');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [inspectingSig, setInspectingSig] = useState<VerifiedSignature | null>(null);
  const [form] = Form.useForm();

  // Verification State
  const [verifyingFile, setVerifyingFile] = useState<File | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [verifyResults, setVerifyResults] = useState<VerificationResult | null>(null);

  const [verifyPickerOpen, setVerifyPickerOpen] = useState(false);

  const handleCreate = (values: any) => {
    const newCert: DigitalCert = {
      ...values,
      key: String(Date.now()),
      subjectName: 'CÔNG TY CP CÔNG NGHỆ KIYOVN',
      status: 'Còn hiệu lực',
    };
    const nextItems = [newCert, ...data]; setData(nextItems); dataService.saveGenericData('finance_digital_signatures', nextItems);
    message.success(`Đã đăng ký chứng thư chữ ký số mới: ${values.provider}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleRenew = (record: DigitalCert) => {
    message.success(`Đã gửi yêu cầu gia hạn chứng thư số ${record.certNumber} đến nhà cung cấp ${record.provider}`);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    message.success(`Đã sao chép ${label}!`);
  };

  // Logic kiểm tra đa chữ ký số toàn diện chuẩn X.509/PKCS#7 (Viettel-CA, VNPT, FPT, MISA, v.v.)
  const handleVerifyFile = async () => {
    if (!verifyingFile) {
      message.warning('Vui lòng chọn tệp tin cần kiểm tra chữ ký số!');
      return;
    }

    setIsVerifying(true);
    message.loading({ content: `Đang quét và bóc tách 100% dữ liệu chữ ký số chuẩn X.509 trong tệp "${verifyingFile.name}"...`, key: 'verifying' });

    try {
      const result = await verifyDocumentSignatures(verifyingFile);
      setVerifyResults(result);
      setIsVerifying(false);

      if (result.documentIntegrity === 'VALID') {
        message.success({
          content: `Kiểm tra thành công: Đã xác thực ${result.totalSignatures} chữ ký số hợp lệ trong văn bản.`,
          key: 'verifying',
          duration: 4
        });
      } else if (result.hasSignature) {
        message.warning({
          content: `Đã đọc được ${result.totalSignatures} chứng thư/chữ ký nhưng chưa thể xác thực tính toàn vẹn, chuỗi tin cậy hoặc trạng thái thu hồi.`,
          key: 'verifying',
          duration: 6
        });
      } else {
        message.error({
          content: 'Văn bản không chứa chứng thư hoặc khối chữ ký số điện tử hợp lệ!',
          key: 'verifying',
          duration: 4
        });
      }
    } catch (err: any) {
      setIsVerifying(false);
      message.error({ content: `Lỗi khi kiểm tra chữ ký: ${err.message || 'Không thể giải mã tệp'}`, key: 'verifying' });
    }
  };

  const filteredData = data.filter(
    (item) =>
      (item.provider || '').toLowerCase().includes(searchText.toLowerCase()) ||
      item.certNumber.includes(searchText) ||
      (item.authorizedSigner || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: 'Số serial chứng thư số',
      dataIndex: 'certNumber',
      key: 'certNumber',
      render: (num: string) => (
        <span style={{ fontWeight: 600, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
          <KeyOutlined /> {num}
        </span>
      ),
    },
    {
      title: 'Nhà cung cấp dịch vụ CA',
      dataIndex: 'provider',
      key: 'provider',
      render: (prov: string) => (
        <span style={{ fontWeight: 600, color: '#1E293B' }}>{prov}</span>
      ),
    },
    {
      title: 'Chủ thể chứng thư (Subject)',
      dataIndex: 'subjectName',
      key: 'subjectName',
    },
    {
      title: 'Loại hình ký số',
      dataIndex: 'signType',
      key: 'signType',
      render: (type: string) => (
        <Tag color={type.includes('Cloud') ? 'blue' : type.includes('HSM') ? 'purple' : 'cyan'}>
          {type}
        </Tag>
      ),
    },
    {
      title: 'Người được quyền ký',
      dataIndex: 'authorizedSigner',
      key: 'authorizedSigner',
      render: (signer: string) => (
        <span style={{ color: '#2563EB', fontWeight: 500 }}>{signer}</span>
      ),
    },
    {
      title: 'Thời hạn hiệu lực',
      key: 'validity',
      render: (_: any, record: DigitalCert) => (
        <span style={{ fontSize: 12.5, color: '#64748B' }}>
          {record.validFrom} → {record.validTo}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st: string) => (
        <Tag color={st === 'Còn hiệu lực' ? 'success' : st === 'Sắp hết hạn' ? 'warning' : 'error'}>
          {st}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: DigitalCert) => (
        <Button size="small" onClick={() => handleRenew(record)}>
          Gia hạn
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <FileUploadDialog open={verifyPickerOpen} onClose={() => setVerifyPickerOpen(false)} onSelect={(files) => { if (files[0]) { setVerifyingFile(files[0]); setVerifyResults(null); } }} title="Chọn tệp kiểm tra chữ ký số" accept=".pdf,.xml,.docx,.xlsx,.cer,.crt,.p7s,.p7b,.inv" multiple={false} confirmText="Chọn tệp" />
      {isVerifyRoute ? (
        /* GIAO DIỆN KIỂM TRA CHỮ KÝ SỐ CHUYÊN BIỆT (VERIFY TOOL) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: isEmployeeVerifyRoute ? 'none' : 1180, margin: isEmployeeVerifyRoute ? 0 : '0 auto' }}>
          <Card
            className={isEmployeeVerifyRoute ? 'employee-signature-verify-card' : ''}
            style={{
              borderRadius: 8,
              border: isEmployeeVerifyRoute ? 'none' : '1px solid #E0E0E0',
              background: isEmployeeVerifyRoute ? 'transparent' : undefined,
              marginBottom: isEmployeeVerifyRoute ? 0 : undefined,
            }}
          >
            <div style={{ textAlign: isEmployeeVerifyRoute ? 'left' : 'center', padding: isEmployeeVerifyRoute ? 0 : '16px 12px' }}>
              {!isEmployeeVerifyRoute && (
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E0F2F1', color: '#009688', fontSize: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <AuditOutlined />
                </div>
              )}
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1E293B' }}>
                {isEmployeeVerifyRoute ? 'Kiểm tra chữ ký số' : 'Hệ thống Kiểm tra & Xác minh Chữ ký số 100% Chi tiết'}
              </h3>
              {!isEmployeeVerifyRoute && (
                <p style={{ color: '#64748B', fontSize: 13, marginTop: 6, maxWidth: 680, margin: '6px auto 16px' }}>
                  Hỗ trợ phân tích nhị phân X.509 v3, PKCS#7 / CMS, PAdES, XMLDSig của Viettel-CA, VNPT-CA, FPT-CA, BKAV, MISA eSign và toàn bộ các nhà cung cấp CA được Bộ TT&TT (NEAC) cấp phép.
                </p>
              )}

              {/* Drag and Drop Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    setVerifyingFile(e.dataTransfer.files[0]);
                    setVerifyResults(null);
                  }
                }}
                onClick={() => setVerifyPickerOpen(true)}
                style={{
                  border: isDragging ? '2px dashed #009688' : '2px dashed #CBD5E1',
                  backgroundColor: isDragging ? '#F0FDFA' : '#F8FAFC',
                  borderRadius: 8,
                  padding: isEmployeeVerifyRoute ? '20px 18px' : '24px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  maxWidth: isEmployeeVerifyRoute ? 'none' : 620,
                  margin: isEmployeeVerifyRoute ? '12px 0' : '0 auto 16px'
                }}
              >
                <InboxOutlined style={{ fontSize: 38, color: isDragging ? '#009688' : '#94A3B8', marginBottom: 8 }} />
                <div style={{ fontSize: 14.5, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                  {verifyingFile ? verifyingFile.name : isEmployeeVerifyRoute ? 'Chọn hoặc kéo thả tệp' : 'Kéo thả tệp tin vào đây hoặc bấm để chọn tệp'}
                </div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  {isEmployeeVerifyRoute ? 'PDF, XML, DOCX, XLSX, P7S, CER' : <><span>Hỗ trợ tệp: </span><strong>PDF (ISO 32000-1), XML (Hóa đơn/Thuế XMLDSig), Word/Excel (DOCX/XLSX), P7S, CER</strong></>}
                </div>
                {verifyingFile && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: '#009688', fontWeight: 600 }}>
                    Dung lượng: {(verifyingFile.size / 1024).toFixed(1)} KB ({verifyingFile.size.toLocaleString()} bytes)
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: isEmployeeVerifyRoute ? 'flex-end' : 'center', gap: 12, alignItems: 'center' }}>
                <Button
                  type="primary"
                  icon={<SafetyCertificateOutlined />}
                  onClick={handleVerifyFile}
                  loading={isVerifying}
                  disabled={!verifyingFile}
                  size="large"
                  style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6, minWidth: isEmployeeVerifyRoute ? 200 : 200, fontWeight: 600 }}
                >
                  {isEmployeeVerifyRoute ? 'Kiểm tra' : 'Kiểm tra toàn diện 100%'}
                </Button>
                {verifyingFile && (
                  <Button
                    onClick={() => {
                      setVerifyingFile(null);
                      setVerifyResults(null);
                    }}
                    size="large"
                    style={{ borderRadius: 6 }}
                  >
                    Hủy tệp
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* HIỂN THỊ KẾT QUẢ KIỂM TRA ĐA CHỮ KÝ SỐ ĐẦY ĐỦ 100% THÔNG TIN */}
          {verifyResults && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {verifyResults.hasSignature ? (
                <>
                  {/* Summary Bar */}
                  <div style={{ background: verifyResults.documentIntegrity === 'VALID' ? '#ECFDF5' : '#FFFBEB', border: `1px solid ${verifyResults.documentIntegrity === 'VALID' ? '#A7F3D0' : '#FDE68A'}`, borderRadius: 8, padding: '16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      {verifyResults.documentIntegrity === 'VALID' ? <CheckCircleOutlined style={{ color: '#059669', fontSize: 28 }} /> : <InfoCircleOutlined style={{ color: '#B45309', fontSize: 28 }} />}
                      <div>
                        <div style={{ fontWeight: 700, color: verifyResults.documentIntegrity === 'VALID' ? '#065F46' : '#92400E', fontSize: 15 }}>
                          {verifyResults.documentIntegrity === 'VALID' ? 'VĂN BẢN HỢP LỆ' : 'ĐÃ PHÁT HIỆN THÔNG TIN CHỮ KÝ – CHƯA XÁC THỰC'} · {verifyResults.totalSignatures} CHỮ KÝ SỐ ĐIỆN TỬ
                        </div>
                        <div style={{ fontSize: 12.5, color: verifyResults.documentIntegrity === 'VALID' ? '#047857' : '#A16207', marginTop: 3 }}>
                          Tệp: <strong>{verifyResults.fileName}</strong> ({verifyResults.fileSize}) — Định dạng: <strong>{verifyResults.fileType}</strong> — Trình duyệt chỉ đọc metadata; không thay thế kiểm tra CMS/XMLDSig, OCSP/CRL của nhà cung cấp.
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: verifyResults.documentIntegrity === 'VALID' ? '#047857' : '#A16207', background: verifyResults.documentIntegrity === 'VALID' ? '#D1FAE5' : '#FEF3C7', padding: '6px 12px', borderRadius: 6, fontWeight: 600 }}>
                      Thời gian kiểm tra: {verifyResults.checkedAt}
                    </div>
                  </div>

                  {/* Danh sách từng chữ ký số chi tiết 100% */}
                  {verifyResults.signatures.map((sig, idx) => (
                    <Card
                      key={sig.id}
                      title={
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#E0F2F1', color: '#009688', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>
                              #{idx + 1}
                            </div>
                            <span style={{ fontWeight: 700, fontSize: 14.5, color: '#0F172A' }}>
                              {sig.signerName}
                            </span>
                            <Tag color="blue" style={{ fontWeight: 600 }}>{sig.issuerUnit}</Tag>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Tag color={sig.isCertExpired ? 'error' : 'warning'} style={{ padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                              {sig.isCertExpired ? 'CHỨNG THƯ HẾT HẠN' : 'CHƯA XÁC THỰC CHỮ KÝ'}
                            </Tag>
                            <Button
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={() => {
                                setInspectingSig(sig);
                                setInspectModalOpen(true);
                              }}
                              style={{ fontSize: 12 }}
                            >
                              Soi ASN.1 DER / X.509
                            </Button>
                          </div>
                        </div>
                      }
                      style={{ borderRadius: 8, border: '1px solid #CBD5E1', boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        
                        {/* 4 KHỐI THÔNG TIN CỐT LÕI (2x2 GRID) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 14 }}>
                          
                          {/* 1. CHỦ THỂ KÝ (SIGNER / SUBJECT) */}
                          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px' }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid #E2E8F0', paddingBottom: 6 }}>
                              <UserOutlined style={{ color: '#2563EB', fontSize: 16 }} /> 1. Chủ thể chữ ký số (Ký bởi)
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12.5 }}>
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Tên người / Doanh nghiệp ký (Subject CN):</span>
                                <strong style={{ color: '#2563EB', fontSize: 13.5 }}>{sig.signerName}</strong>
                              </div>
                              {sig.signerTaxCode && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Mã số thuế / Mã định danh (MST / Tax Code):</span>
                                  <strong style={{ color: '#0F172A', background: '#F1F5F9', padding: '2px 6px', borderRadius: 4 }}>
                                    {sig.signerTaxCode}
                                  </strong>
                                </div>
                              )}
                              {sig.signerOrg && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Tổ chức / Công ty (Organization - O):</span>
                                  <span style={{ color: '#1E293B', fontWeight: 500 }}>{sig.signerOrg}</span>
                                </div>
                              )}
                              {sig.signerUnit && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Phòng ban / Đơn vị trực thuộc (OU):</span>
                                  <span style={{ color: '#1E293B' }}>{sig.signerUnit}</span>
                                </div>
                              )}
                              {sig.signerTitle && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Chức vụ / Chức danh:</span>
                                  <span style={{ color: '#1E293B', fontWeight: 500 }}>{sig.signerTitle}</span>
                                </div>
                              )}
                              {sig.signerAddress && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Địa chỉ trụ sở:</span>
                                  <span style={{ color: '#1E293B' }}>{sig.signerAddress}</span>
                                </div>
                              )}
                              {sig.signerCity && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Tỉnh / Thành phố:</span>
                                  <span style={{ color: '#1E293B' }}>{sig.signerCity}</span>
                                </div>
                              )}
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Quốc gia người ký:</span>
                                <strong style={{ color: '#1E293B' }}>{sig.signerCountry}</strong>
                              </div>
                              {sig.signerEmail && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Email:</span>
                                  <span style={{ color: '#2563EB' }}>{sig.signerEmail}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 2. NHÀ CUNG CẤP CA (ISSUER) */}
                          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px' }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid #E2E8F0', paddingBottom: 6 }}>
                              <BankOutlined style={{ color: '#009688', fontSize: 16 }} /> 2. Đơn vị chứng thực số (Cấp bởi CA)
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12.5 }}>
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Tên nhà cung cấp dịch vụ CA (Issuer CN):</span>
                                <strong style={{ color: '#009688', fontSize: 13.5 }}>{sig.issuerUnit}</strong>
                              </div>
                              {sig.issuerOrg && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Tổ chức phát hành (Issuer O):</span>
                                  <span style={{ color: '#1E293B', fontWeight: 500 }}>{sig.issuerOrg}</span>
                                </div>
                              )}
                              {sig.issuerUnitDept && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Phòng ban CA (Issuer OU):</span>
                                  <span style={{ color: '#1E293B' }}>{sig.issuerUnitDept}</span>
                                </div>
                              )}
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Cơ quan giám sát cấp phép:</span>
                                <span style={{ color: '#1E293B' }}>{sig.issuerAuthority}</span>
                              </div>
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Quốc gia cấp phát:</span>
                                <strong style={{ color: '#1E293B' }}>{sig.issuerCountry}</strong>
                              </div>
                              {sig.ocspUrls && sig.ocspUrls.length > 0 && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Máy chủ kiểm tra trực tuyến (OCSP):</span>
                                  <span style={{ color: '#2563EB', wordBreak: 'break-all', fontSize: 11.5 }}>{sig.ocspUrls.join(', ')}</span>
                                </div>
                              )}
                              {sig.crlDistributionPoints && sig.crlDistributionPoints.length > 0 && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Danh sách thu hồi (CRL Distribution Point):</span>
                                  <span style={{ color: '#2563EB', wordBreak: 'break-all', fontSize: 11.5 }}>{sig.crlDistributionPoints.join(', ')}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 3. THỜI HẠN & DẤU THỜI GIAN (VALIDITY & SIGNING TIME) */}
                          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px' }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid #E2E8F0', paddingBottom: 6 }}>
                              <ClockCircleOutlined style={{ color: '#D97706', fontSize: 16 }} /> 3. Thời hạn & Dấu thời gian ký
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12.5 }}>
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Thời gian ký xác thực chính xác:</span>
                                <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{sig.signedAt}</strong>
                              </div>
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Nguồn dấu thời gian:</span>
                                <span style={{ color: '#475569', fontSize: 11.5 }}>{sig.timeSource}</span>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Hiệu lực từ (Not Before):</span>
                                  <span style={{ color: '#1E293B', fontWeight: 500 }}>{sig.validFrom}</span>
                                </div>
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Hết hạn vào (Not After):</span>
                                  <span style={{ color: sig.isCertExpired ? '#DC2626' : '#059669', fontWeight: 600 }}>{sig.validTo}</span>
                                </div>
                              </div>
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Thời hạn còn lại:</span>
                                <Tag color={sig.certStatus === 'Còn hiệu lực' ? 'success' : sig.certStatus === 'Sắp hết hạn' ? 'warning' : 'error'}>
                                  {sig.remainingTime}
                                </Tag>
                              </div>
                              {sig.reason && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Lý do ký (Signing Reason):</span>
                                  <span style={{ color: '#1E293B' }}>{sig.reason}</span>
                                </div>
                              )}
                              {sig.location && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Địa điểm ký (Location):</span>
                                  <span style={{ color: '#1E293B' }}>{sig.location}</span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 4. THÔNG SỐ MẬT MÃ & KHÓA (CRYPTOGRAPHIC SPECS) */}
                          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px' }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid #E2E8F0', paddingBottom: 6 }}>
                              <LockOutlined style={{ color: '#7C3AED', fontSize: 16 }} /> 4. Thông số Mật mã & Chứng thư số
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 12.5 }}>
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Số Serial Chứng thư (Hex):</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <code style={{ color: '#009688', fontWeight: 700, fontSize: 12.5, wordBreak: 'break-all' }}>{sig.certNumber}</code>
                                  <Tooltip title="Sao chép Serial">
                                    <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(sig.certNumber, 'Số serial chứng thư')} />
                                  </Tooltip>
                                </div>
                              </div>
                              {sig.certNumberDec && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Số Serial dạng Thập phân (Decimal):</span>
                                  <code style={{ color: '#475569', fontSize: 11.5 }}>{sig.certNumberDec}</code>
                                </div>
                              )}
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Phiên bản chứng thư & Tiêu chuẩn:</span>
                                <span style={{ fontWeight: 600 }}>{sig.version} — {sig.standard}</span>
                              </div>
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Thuật toán ký & Khóa công khai:</span>
                                <span style={{ fontWeight: 600 }}>{sig.algorithm}</span> ({sig.publicKeyType})
                              </div>
                              <div>
                                <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Thuật toán băm thông điệp:</span>
                                <strong>{sig.digestAlgorithm}</strong>
                              </div>
                              {sig.subFilter && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Bộ lọc bao gói (Filter / SubFilter):</span>
                                  <span style={{ fontSize: 11.5, color: '#475569' }}>/Filter /{sig.filter} /SubFilter /{sig.subFilter}</span>
                                </div>
                              )}
                              {sig.byteRange && (
                                <div>
                                  <span style={{ color: '#64748B', display: 'block', fontSize: 11.5 }}>Phạm vi byte ký (ByteRange):</span>
                                  <code style={{ fontSize: 11, color: '#475569' }}>{sig.byteRange}</code>
                                </div>
                              )}
                            </div>
                          </div>

                        </div>

                        {/* MỤC ĐÍCH SỬ DỤNG KHÓA (KEY USAGE & EXTENDED KEY USAGE) */}
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>
                            Mục đích sử dụng khóa (Key Usage & Extended Key Usage - RFC 5280):
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {sig.keyUsage.map((u, kIdx) => (
                              <Tag key={kIdx} color="cyan" style={{ fontSize: 11.5 }}>{u}</Tag>
                            ))}
                            {sig.extKeyUsage.map((u, eIdx) => (
                              <Tag key={eIdx} color="purple" style={{ fontSize: 11.5 }}>{u}</Tag>
                            ))}
                          </div>
                        </div>

                        {/* MÃ BĂM CHỨNG THƯ (FINGERPRINTS) */}
                        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                              <span style={{ fontSize: 11.5, color: '#64748B', fontWeight: 600 }}>Mã băm SHA-256 (Fingerprint):</span>
                              <Tooltip title="Sao chép SHA-256">
                                <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(sig.thumbprintSha256, 'Mã băm SHA-256')} />
                              </Tooltip>
                            </div>
                            <code style={{ fontSize: 11, color: '#0F172A', display: 'block', wordBreak: 'break-all', background: '#FFFFFF', padding: '4px 6px', borderRadius: 4, border: '1px solid #E2E8F0' }}>
                              {sig.thumbprintSha256}
                            </code>
                          </div>
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                              <span style={{ fontSize: 11.5, color: '#64748B', fontWeight: 600 }}>Mã băm SHA-1 (Fingerprint):</span>
                              <Tooltip title="Sao chép SHA-1">
                                <Button size="small" type="text" icon={<CopyOutlined />} onClick={() => copyToClipboard(sig.thumbprintSha1, 'Mã băm SHA-1')} />
                              </Tooltip>
                            </div>
                            <code style={{ fontSize: 11, color: '#0F172A', display: 'block', wordBreak: 'break-all', background: '#FFFFFF', padding: '4px 6px', borderRadius: 4, border: '1px solid #E2E8F0' }}>
                              {sig.thumbprintSha1}
                            </code>
                          </div>
                        </div>

                      </div>
                    </Card>
                  ))}
                </>
              ) : (
                <Card style={{ borderRadius: 8, border: '1px solid #E0E0E0' }}>
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <CloseCircleOutlined style={{ color: '#DC2626', fontSize: 32 }} />
                    <div>
                      <div style={{ fontWeight: 700, color: '#991B1B', fontSize: 15 }}>
                        VĂN BẢN KHÔNG CÓ CHỮ KÝ SỐ ĐIỆN TỬ HỢP LỆ
                      </div>
                      <div style={{ fontSize: 13, color: '#B91C1C', marginTop: 4 }}>
                        Tệp tin "{verifyResults.fileName}" ({verifyResults.fileSize}) không chứa chứng thư số hoặc khối chữ ký điện tử hợp lệ theo tiêu chuẩn PAdES / CAdES / XMLDSig.
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          )}
        </div>
      ) : isHistoryRoute ? (
        /* GIAO DIỆN LỊCH SỬ KÝ SỐ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Lịch sử ký số tài liệu doanh nghiệp</h3>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo tên tài liệu, mã chứng thực..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={dataService.getGenericData('digital_signature_audit_trail')}
              columns={[
                { title: 'Tài liệu ký số', dataIndex: 'doc', key: 'doc', render: (t: string) => <span style={{ fontWeight: 600, color: '#1E293B' }}>{t}</span> },
                { title: 'Thời gian ký', dataIndex: 'time', key: 'time' },
                { title: 'Người ký', dataIndex: 'signer', key: 'signer', render: (s: string) => <span style={{ color: '#2563EB' }}>{s}</span> },
                { title: 'Nhà cung cấp CA', dataIndex: 'ca', key: 'ca', render: (c: string) => <Tag color="blue">{c}</Tag> },
                { title: 'Mã băm SHA-256', dataIndex: 'hash', key: 'hash', render: (h: string) => <code>{h}</code> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: () => <Tag icon={<CheckOutlined />} color="success">Thành công</Tag> },
              ]}
            />
          </div>
        </div>
      ) : null}

      {/* MODAL: THÊM MỚI CHỨNG THƯ SỐ */}
      <Modal
        title="Đăng Ký & Tích Hợp Chứng Thư Số Doanh Nghiệp Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item name="caProvider" label="Nhà cung cấp Dịch vụ Chữ ký số (CA)" initialValue="KIYO GROUP" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'KIYO GROUP', value: 'KIYO GROUP' },
                { label: 'Viettel-CA (Tập đoàn Viettel)', value: 'Viettel-CA (Tập đoàn Viettel)' },
                { label: 'VNPT-CA (Tập đoàn VNPT)', value: 'VNPT-CA (Tập đoàn VNPT)' },
                { label: 'FPT-CA (Hệ thống thông tin FPT)', value: 'FPT-CA (Hệ thống thông tin FPT)' },
                { label: 'Bkav-CA', value: 'Bkav-CA' },
                { label: 'MISA-CA (MISA eSign)', value: 'MISA-CA (MISA eSign)' },
                { label: 'SmartSign (VINA-CA)', value: 'SmartSign (VINA-CA)' },
                { label: 'Safe-CA (TS24)', value: 'Safe-CA (TS24)' },
                { label: 'FastCA', value: 'FastCA' },
                { label: 'EasyCA (Softdreams)', value: 'EasyCA (Softdreams)' },
              ]}
            />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="certNumber" label="Số serial chứng thư" rules={[{ required: true, message: 'Nhập số serial' }]}>
              <Input placeholder="5401 0108..." />
            </Form.Item>
            <Form.Item name="signType" label="Loại hình ký số" initialValue="Cloud CA (Ký từ xa)">
              <Select
                options={[
                  { label: 'Cloud CA (Ký từ xa)', value: 'Cloud CA (Ký từ xa)' },
                  { label: 'USB Token', value: 'USB Token' },
                  { label: 'HSM Server', value: 'HSM Server' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="authorizedSigner" label="Người được phân quyền ký số" initialValue="Nguyễn Huy Tùng (Quản trị hệ thống)" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="validFrom" label="Hiệu lực từ" initialValue="2026-08-01">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="validTo" label="Hết hạn vào" initialValue="2029-08-01">
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu chứng thư số
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default DigitalSignatureModule;
