import React, { useState, useEffect } from 'react';
import {
  FileTextOutlined,
  DownloadOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  SearchOutlined,
  PrinterOutlined,
  FileProtectOutlined,
  DollarOutlined,
  UserOutlined,
  ReloadOutlined,
  EditOutlined,
  UploadOutlined,
  FilePdfOutlined,
  ApartmentOutlined,
  PercentageOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Input, Button, message, Tag, Drawer, Select, Radio, Upload, Form } from '../../custom-ui';
import { dataService } from '../../services/dataService';
import { contractsApi } from '../../api/endpoints';
import { downloadFile } from '../../utils/fileExporter';

export interface EnterpriseContractItem {
  key: string;
  id?: string;
  code: string;
  name: string;
  contractCategory?: string;
  contractTemplate: string;
  partyBType?: 'organization' | 'individual' | 'employee';
  partyBName?: string;
  partyBTaxCode?: string;
  partyBRepresentative?: string;
  partyBPosition?: string;
  partyBIdNumber?: string;
  partyBPhone?: string;
  partyBEmail?: string;
  partyBBank?: string;
  partyBAddress?: string;

  employeeCode: string;
  employeeName: string;
  employeeIdNumber?: string;
  employeePhone?: string;
  employeeEmail?: string;
  employeeBank?: string;
  type: string;
  position: string;
  department: string;
  jobLevel?: string;
  workLocation?: string;
  startDate: string;
  endDate: string;
  probationMonths?: number;
  contractValue?: number;
  salary: number;
  allowance?: number;
  stockSharesPercent?: string;
  paymentMethod?: string;
  paymentDay?: number;
  workingHours?: string;
  annualLeaveDays?: number;
  insuranceType?: string;
  ndaClause?: boolean;
  nonCompeteClause?: boolean;
  status: 'Dự thảo' | 'Chờ ký' | 'Chờ duyệt' | 'Còn hiệu lực' | 'Đã hết hạn';
  
  employeeSignStatus?: 'Chưa ký' | 'Đã ký';
  employeeSignDate?: string;
  employeeSignMethod?: 'digital' | 'upload';
  employeeCertName?: string;
  employeeSignedFileName?: string;
  employeeSignedFileData?: string;
  
  companySignStatus?: 'Chưa ký' | 'Đã ký';
  companySignDate?: string;
  companySignMethod?: 'digital' | 'upload';
  companyCertName?: string;
  companySignedFileName?: string;
  companySignedFileData?: string;

  signerName?: string;
  signerPosition?: string;
  note?: string;
}

const PERSONAL_SIGNATURE_OPTIONS = [
  {
    value: 'Nguyễn Đức Đại Sơn CCCD 064210005343 NEAC Digital ID',
    label: 'Nguyễn Đức Đại Sơn CCCD gắn chip NEAC ID',
  },
  {
    value: 'Passkey FIDO2 Security Key Xác thực Sinh trắc học FaceID',
    label: 'Khóa bảo mật sinh trắc học FaceID / TouchID',
  },
  {
    value: 'Nguyễn Đức Đại Sơn VNPT SmartCA',
    label: 'VNPT / Viettel SmartCA Cloud',
  },
];

export const EmployeeContractsModule: React.FC = () => {
  const [contracts, setContracts] = useState<EnterpriseContractItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [selectedContract, setSelectedContract] = useState<EnterpriseContractItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Edit & Sign Modal
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<EnterpriseContractItem | null>(null);
  const [signMethod, setSignMethod] = useState<'digital' | 'upload'>('digital');
  const [selectedPersonalCert, setSelectedPersonalCert] = useState(PERSONAL_SIGNATURE_OPTIONS[0].value);
  const [uploadedPersonalFile, setUploadedPersonalFile] = useState<string | null>(null);
  const [form] = Form.useForm();

  // File Preview Modal
  const [fileViewerOpen, setFileViewerOpen] = useState(false);
  const [viewerFileTitle, setViewerFileTitle] = useState('');
  const [viewerFileContent, setViewerFileContent] = useState('');

  const loadData = async () => {
    try {
      const response = await contractsApi.getAll();
      if (response.data?.data && Array.isArray(response.data.data) && response.data.data.length > 0) {
        setContracts(response.data.data as any[]);
        dataService.saveEnterpriseContracts(response.data.data as any[]);
      } else {
        setContracts(dataService.getEnterpriseContracts());
      }
    } catch {
      setContracts(dataService.getEnterpriseContracts());
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const activeContract = contracts.find((c) => c.status === 'Còn hiệu lực') || contracts[0];

  const handleOpenEditSignModal = (contract: EnterpriseContractItem) => {
    setEditingContract(contract);
    setSignMethod(contract.employeeSignMethod || 'digital');
    setSelectedPersonalCert(contract.employeeCertName || PERSONAL_SIGNATURE_OPTIONS[0].value);
    setUploadedPersonalFile(contract.employeeSignedFileName || null);
    form.setFieldsValue({
      note: contract.note || '',
    });
    setEditModalOpen(true);
  };

  const handleSaveAndSign = async () => {
    if (!editingContract) return;

    const isSigned = signMethod === 'digital' || !!uploadedPersonalFile;
    const signDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const certName = signMethod === 'digital' ? selectedPersonalCert : 'Tệp chữ ký số tải lên';
    const signedFileName = signMethod === 'digital'
      ? `${editingContract.code}_Signed_PartyB.pdf`
      : (uploadedPersonalFile || `${editingContract.code}_Signed_PartyB.pdf`);

    const newStatus = editingContract.companySignStatus === 'Đã ký' ? 'Còn hiệu lực' : 'Chờ duyệt';

    const updated: EnterpriseContractItem = {
      ...editingContract,
      status: newStatus as any,
      employeeSignStatus: isSigned ? 'Đã ký' : editingContract.employeeSignStatus,
      employeeSignDate: isSigned ? signDate : editingContract.employeeSignDate,
      employeeSignMethod: signMethod,
      employeeCertName: isSigned ? certName : editingContract.employeeCertName,
      employeeSignedFileName: isSigned ? signedFileName : editingContract.employeeSignedFileName,
      note: form.getFieldValue('note') || editingContract.note,
    };

    try {
      const targetId = editingContract.key;
      await contractsApi.sign(targetId, {
        signMethod,
        certName,
        signedFileName,
        signAs: 'employee',
      });
    } catch {}

    const updatedList = contracts.map((c) => (c.key === editingContract.key ? updated : c));
    setContracts(updatedList);
    dataService.saveEnterpriseContracts(updatedList);
    message.success(`Đã xác thực ký số thành công văn bản ${editingContract.code}!`);
    setEditModalOpen(false);
    void loadData();
  };

  const handleDownloadContract = (contract: EnterpriseContractItem) => {
    const content = `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\n\n${contract.name.toUpperCase()}\nSố: ${contract.code}\n\nBÊN A: CÔNG TY CỔ PHẦN KIYOVN\nĐại diện: ${contract.signerName || 'Chưa cập nhật'} - Chức vụ: ${contract.signerPosition || 'Chưa cập nhật'}\n\nBÊN B: ${contract.partyBName || contract.employeeName}\nĐại diện: ${contract.partyBRepresentative || contract.employeeName}\nĐiện thoại: ${contract.partyBPhone || contract.employeePhone}\nEmail: ${contract.partyBEmail || contract.employeeEmail}\n\nĐIỀU 1: VỊ TRÍ & THỜI HẠN\n- Đơn vị: ${contract.department}\n- Chức vụ / Vị trí: ${contract.position}\n- Thời hạn: Từ ${contract.startDate} đến ${contract.endDate}\n\nĐIỀU 2: GIÁ TRỊ HỢP ĐỒNG / LƯƠNG & CỔ PHẦN\n- Giá trị hợp đồng: ${(contract.contractValue || contract.salary || 0).toLocaleString('vi-VN')} VNĐ\n- Quyền lợi cổ phần ESOP: ${contract.stockSharesPercent || 'Không áp dụng'}\n\nĐIỀU 3: CHỨNG THỰC CHỮ KÝ SỐ\n- Bên B: ${contract.employeeSignStatus === 'Đã ký' ? `ĐÃ KÝ SỐ (${contract.employeeCertName})` : 'CHƯA KÝ'}\n- Bên A: ${contract.companySignStatus === 'Đã ký' ? `ĐÃ KÝ SỐ DOANH NGHIỆP (${contract.companyCertName})` : 'CHƯA KÝ'}`;

    downloadFile(`${contract.code}_${(contract.partyBName || contract.employeeName).replace(/\s+/g, '_')}.txt`, content);
    message.success(`Đã tải xuống văn bản ${contract.code}`);
  };

  const handleOpenFileViewer = (title: string, content: string) => {
    setViewerFileTitle(title);
    setViewerFileContent(content);
    setFileViewerOpen(true);
  };

  const filteredContracts = contracts.filter((item) => {
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.partyBName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    const matchCategory =
      filterCategory === 'all' ||
      item.contractCategory === filterCategory ||
      item.type === filterCategory;

    return matchSearch && matchCategory;
  });

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'Còn hiệu lực':
        return (
          <Tag color="success">
            <CheckCircleOutlined style={{ marginRight: 4 }} />
            Còn hiệu lực
          </Tag>
        );
      case 'Chờ duyệt':
        return (
          <Tag color="warning">
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            Chờ duyệt
          </Tag>
        );
      case 'Chờ ký':
        return (
          <Tag color="processing">
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            Chờ ký
          </Tag>
        );
      case 'Dự thảo':
        return <Tag color="default">Dự thảo</Tag>;
      default:
        return <Tag color="error">Đã hết hạn</Tag>;
    }
  };

  const columns = [
    {
      title: 'Thông tin hợp đồng',
      key: 'name',
      render: (_: any, record: EnterpriseContractItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: record.partyBType === 'organization' ? '#EFF6FF' : '#E0F2F1',
              color: record.partyBType === 'organization' ? '#2563EB' : '#009688',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            {record.partyBType === 'organization' ? <ShopOutlined /> : <FileProtectOutlined />}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.name}</div>
            <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <code>{record.code}</code>
              <Tag color={record.partyBType === 'organization' ? 'blue' : 'cyan'} style={{ margin: 0, fontSize: 10.5, lineHeight: '18px' }}>{record.type}</Tag>
            </div>
          </div>
        </div>
      ),
    },

    {
      title: 'Tệp đã ký',
      key: 'signedFiles',
      width: 200,
      render: (_: any, record: EnterpriseContractItem) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 11.5 }}>
            <span style={{ color: '#64748B' }}>Tôi </span>
            {record.employeeSignStatus === 'Đã ký' ? (
              <span style={{ color: '#16A34A', fontWeight: 600 }}>
                <CheckCircleOutlined style={{ marginRight: 3 }} />
                Đã ký số
              </span>
            ) : (
              <span style={{ color: '#D97706', fontWeight: 500 }}>
                <ClockCircleOutlined style={{ marginRight: 3 }} />
                Chưa ký
              </span>
            )}
          </div>

          <div style={{ fontSize: 11.5 }}>
            <span style={{ color: '#64748B' }}>Doanh nghiệp </span>
            {record.companySignStatus === 'Đã ký' ? (
              <span style={{ color: '#16A34A', fontWeight: 600 }}>
                <CheckCircleOutlined style={{ marginRight: 3 }} />
                Đã duyệt
              </span>
            ) : (
              <span style={{ color: '#D97706', fontWeight: 500 }}>
                <ClockCircleOutlined style={{ marginRight: 3 }} />
                Chờ ký
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: string) => getStatusTag(s),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 230,
      render: (_: any, record: EnterpriseContractItem) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedContract(record);
              setDrawerOpen(true);
            }}
          >
            Xem hợp đồng
          </Button>

          <Button
            size="small"
            type="primary"
            icon={<EditOutlined />}
            onClick={() => handleOpenEditSignModal(record)}
            style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 4 }}
          >
            Ký số
          </Button>

          <Button
            size="small"
            icon={<DownloadOutlined />}
            title="Tải hợp đồng"
            onClick={() => handleDownloadContract(record)}
          />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select
            value={filterCategory}
            onChange={setFilterCategory}
            style={{ width: 220 }}
            options={[
              { value: 'all', label: 'Tất cả văn bản' },
              { value: 'partner', label: 'Hợp tác đối tác B2B' },
              { value: 'service', label: 'Cung cấp dịch vụ' },
              { value: 'nda', label: 'Bảo mật thông tin' },
              { value: 'consultant', label: 'Chuyên gia cố vấn' },
              { value: 'equity', label: 'Cổ phần & ESOP' },
              { value: 'labor', label: 'Lao động nội bộ' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo số HĐ, tên đối tác..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Làm mới
          </Button>

          {activeContract && (
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => handleDownloadContract(activeContract)}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Tải văn bản hiện hành
            </Button>
          )}
        </div>
      </div>

      {/* Contracts Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredContracts}
          columns={columns as any}
          rowKey="key"
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* ========================================================================= */}
      {/* MODAL THAO TÁC / SỬA & KÝ SỐ HỢP ĐỒNG */}
      {/* ========================================================================= */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
              <EditOutlined />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>
                Ký số &amp; xác thực hợp đồng: {editingContract?.code || ''}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', fontWeight: 400 }}>
                Xem thông tin chi tiết, tải văn bản về hoặc thực hiện ký số / tải tệp đã ký lên hệ thống
              </div>
            </div>
          </div>
        }
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        width={850}
        footer={[
          <Button key="cancel" onClick={() => setEditModalOpen(false)}>
            Hủy
          </Button>,
          editingContract && (
            <Button
              key="download"
              icon={<DownloadOutlined />}
              onClick={() => handleDownloadContract(editingContract)}
            >
              Tải hợp đồng về
            </Button>
          ),
          <Button
            key="sign"
            type="primary"
            onClick={handleSaveAndSign}
            style={{ backgroundColor: '#009688', borderColor: '#009688', fontWeight: 600, padding: '0 20px' }}
          >
            Xác nhận ký số &amp; gửi duyệt
          </Button>,
        ]}
      >
        {editingContract && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>{editingContract.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Mã hợp đồng</span>
                  <div style={{ fontWeight: 700, color: '#009688' }}>{editingContract.code}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Lương (VNĐ)</span>
                  <div style={{ fontWeight: 700, color: '#16A34A' }}>
                    {(editingContract.contractValue || editingContract.salary || 0).toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Cổ phần thưởng</span>
                  <div style={{ fontWeight: 700, color: '#D97706' }}>{editingContract.stockSharesPercent || 'Không có'}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Thời hạn</span>
                  <div style={{ fontWeight: 600 }}>{editingContract.startDate} đến {editingContract.endDate}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Người đại diện</span>
                  <div style={{ fontWeight: 600 }}>{editingContract.signerName || 'Chưa cập nhật'}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Trạng thái hiện tại</span>
                  <div>{getStatusTag(editingContract.status)}</div>
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined style={{ color: '#009688' }} /> Phương thức ký số
              </div>

              <Radio.Group
                value={signMethod}
                onChange={(e) => setSignMethod(e.target.value)}
                style={{ marginBottom: 14 }}
              >
                <Radio value="digital">Ký số điện tử trực tiếp trong web</Radio>
                <Radio value="upload">Tải lên tệp đã ký từ máy</Radio>
              </Radio.Group>

              {signMethod === 'digital' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#334155', fontWeight: 600, marginBottom: 4 }}>
                      Chọn chứng thư số
                    </label>
                    <Select
                      value={selectedPersonalCert}
                      onChange={(val) => setSelectedPersonalCert(val)}
                      options={PERSONAL_SIGNATURE_OPTIONS}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 4 }}>
                  <Upload.Dragger
                    accept=".pdf"
                    maxCount={1}
                    beforeUpload={(file) => {
                      setUploadedPersonalFile(file.name);
                      message.success(`Đã chọn tệp đã ký: ${file.name}`);
                      return false;
                    }}
                    style={{ background: '#FFFFFF', padding: 10 }}
                  >
                    <p className="ant-upload-drag-icon">
                      <UploadOutlined style={{ color: '#009688', fontSize: 24 }} />
                    </p>
                    <p className="ant-upload-text" style={{ fontSize: 13, fontWeight: 600 }}>
                      Tải lên file PDF hợp đồng đã có chữ ký
                    </p>
                  </Upload.Dragger>
                </div>
              )}
            </div>

            <Form form={form} layout="vertical">
              <Form.Item name="note" label="Ghi chú">
                <Input.TextArea rows={2} placeholder="Nhập ghi chú hoặc ý kiến của bạn về hợp đồng..." />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL XEM CHI TIẾT TỆP KÝ */}
      {/* ========================================================================= */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FilePdfOutlined style={{ color: '#EF4444', fontSize: 18 }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>{viewerFileTitle}</span>
          </div>
        }
        open={fileViewerOpen}
        onCancel={() => setFileViewerOpen(false)}
        width={650}
        footer={[
          <Button key="close" type="primary" onClick={() => setFileViewerOpen(false)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
            Đóng
          </Button>,
        ]}
      >
        <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 6, border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12.5, color: '#1E293B', lineHeight: 1.6 }}>
          {viewerFileContent}
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* MODAL DIALOG: Chi tiết hợp đồng */}
      {/* ========================================================================= */}
      <Modal
        title="Chi tiết hợp đồng"
        open={drawerOpen}
        onCancel={() => setDrawerOpen(false)}
        width={620}
        footer={[
          <Button key="close" onClick={() => setDrawerOpen(false)}>
            Đóng
          </Button>,
          <Button
            key="download"
            icon={<DownloadOutlined />}
            onClick={() => selectedContract && handleDownloadContract(selectedContract)}
          >
            Tải hợp đồng
          </Button>,
          <Button
            key="sign"
            type="primary"
            icon={<EditOutlined />}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            onClick={() => {
              setDrawerOpen(false);
              selectedContract && handleOpenEditSignModal(selectedContract);
            }}
          >
            Sửa &amp; Ký Số Hợp Đồng
          </Button>,
        ]}
      >
        {selectedContract && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>Mã số {selectedContract.code}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {selectedContract.name}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phân loại <strong>{selectedContract.type}</strong> Vị trí <strong>{selectedContract.position}</strong>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Nội dung hợp đồng pháp lý
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời hạn hiệu lực</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedContract.startDate} đến {selectedContract.endDate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Lương (VNĐ)</span>
                  <span style={{ fontWeight: 700, color: '#16A34A' }}>
                    {(selectedContract.contractValue || selectedContract.salary || 0).toLocaleString('vi-VN')} ₫
                  </span>
                </div>
                {selectedContract.stockSharesPercent && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Cổ phần thưởng ESOP</span>
                    <span style={{ fontWeight: 700, color: '#D97706' }}>{selectedContract.stockSharesPercent}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Đại diện công ty ký</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedContract.signerName || 'Chưa cập nhật'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Địa điểm làm việc / thực hiện</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedContract.workLocation || 'Tòa nhà Landmark 72 Keangnam, Hà Nội'}</span>
                </div>
              </div>
            </div>

            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#166534', fontSize: 13, marginBottom: 8 }}>
                Chứng thực ký số
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <div>
                    <span style={{ color: '#64748B' }}>Tôi </span>
                    {selectedContract.employeeSignStatus === 'Đã ký' ? (
                      <span style={{ color: '#16A34A', fontWeight: 600 }}>
                        <CheckCircleOutlined style={{ marginRight: 3 }} />
                        Đã ký số
                      </span>
                    ) : (
                      <span style={{ color: '#D97706', fontWeight: 500 }}>
                        <ClockCircleOutlined style={{ marginRight: 3 }} />
                        Chưa ký
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <div>
                    <span style={{ color: '#64748B' }}>Doanh nghiệp </span>
                    {selectedContract.companySignStatus === 'Đã ký' ? (
                      <span style={{ color: '#16A34A', fontWeight: 600 }}>
                        <CheckCircleOutlined style={{ marginRight: 3 }} />
                        Đã duyệt
                      </span>
                    ) : (
                      <span style={{ color: '#D97706', fontWeight: 500 }}>
                        <ClockCircleOutlined style={{ marginRight: 3 }} />
                        Chờ ký
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default EmployeeContractsModule;
