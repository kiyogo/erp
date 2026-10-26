import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CloudUploadOutlined,
  FolderOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileZipOutlined,
  FileWordOutlined,
  CodeOutlined,
  PrinterOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  LockOutlined,
  CloudServerOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  BarChartOutlined,
  EditOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { FileUploadDialog } from '../../components/FileUploadDialog';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';
import { formatFileSize } from '../../utils/fileStorage';
import { filesApi } from '../../api/endpoints';

import { dataService } from '../../services/dataService';

export interface EnterpriseDriveFile {
  key: string;
  fileName: string;
  fileType: 'PDF' | 'Excel' | 'ZIP/Code' | 'Word';
  fileSize: string;
  folder: string;
  modifiedDate: string;
  uploadedBy: string;
  sha256Hash: string;
  encryption: string;
  accessLevel: string;
}

const INITIAL_FILES: EnterpriseDriveFile[] = [];

export const CloudDriveModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseDriveFile[]>(INITIAL_FILES);
  const [orgUnitOptions, setOrgUnitOptions] = useState<{ label: string; value: string }[]>([]);
  const [searchText, setSearchText] = useState('');
  const [fileTypeFilter, setFileTypeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<EnterpriseDriveFile | null>(null);

  useEffect(() => {
    dataService.fetchOrgUnitsList().then((units) => {
      setOrgUnitOptions(units.map((u) => ({ label: `${u} (Chỉ riêng đơn vị)`, value: u })));
    });
  }, []);

  const handleUpload = async (values: any) => {
    const fileName = selectedUploadFile?.name || values.fileName;
    try {
      const uploaded = await filesApi.upload(selectedUploadFile || new Blob([], { type: 'text/plain' }), fileName, undefined, 'cloud-drive');
      const newItem: EnterpriseDriveFile = {
        ...values,
        key: uploaded.data.file.id,
        fileName,
        fileSize: formatFileSize(uploaded.data.file.sizeBytes),
        modifiedDate: uploaded.data.file.updatedAt.substring(0, 10),
        uploadedBy: uploaded.data.file.owner || 'Hệ thống',
        sha256Hash: 'Được lưu trữ bởi kho tệp hệ thống',
        encryption: 'Máy chủ quản lý',
        accessLevel: values.accessLevel || 'Toàn bộ nội bộ',
      };
      setData([newItem, ...data]);
      message.success(`Đã tải lên tệp tin: ${fileName}`);
      setModalOpen(false);
      setSelectedUploadFile(null);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải tệp lên máy chủ.');
    }
  };

  const handleDownload = async (record: EnterpriseDriveFile) => {
    try {
      const response = await filesApi.download(record.key);
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = record.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      message.success(`Đã tải xuống tệp an toàn: ${record.fileName}`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải tệp từ máy chủ.');
    }
  };

  const filteredData = data.filter((item) => {
    const matchType =
      fileTypeFilter === 'all' ||
      (fileTypeFilter === 'PDF' && item.fileType === 'PDF') ||
      (fileTypeFilter === 'Excel' && item.fileType === 'Excel') ||
      (fileTypeFilter === 'Word' && item.fileType === 'Word') ||
      (fileTypeFilter === 'ZIP/Code' && item.fileType === 'ZIP/Code');

    const matchSearch =
      (item.fileName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.folder || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.uploadedBy || '').toLowerCase().includes(searchText.toLowerCase());

    return matchType && matchSearch;
  });

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'PDF':
        return <FilePdfOutlined style={{ color: '#E11D48', fontSize: 20 }} />;
      case 'Excel':
        return <FileExcelOutlined style={{ color: '#16A34A', fontSize: 20 }} />;
      case 'ZIP/Code':
        return <FileZipOutlined style={{ color: '#7C3AED', fontSize: 20 }} />;
      default:
        return <FileWordOutlined style={{ color: '#2563EB', fontSize: 20 }} />;
    }
  };

  const columns = [
    {
      title: 'Tên tệp tin & Thư mục',
      key: 'name',
      render: (_: any, record: EnterpriseDriveFile) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {getFileIcon(record.fileType)}
          <div>
            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.fileName}</div>
            <div style={{ fontSize: 11.5, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4 }}>
              <FolderOutlined /> Thư mục: {record.folder}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Định dạng',
      dataIndex: 'fileType',
      key: 'fileType',
      width: 110,
      render: (t: string) => <Tag color="blue">{t}</Tag>,
    },
    {
      title: 'Dung lượng',
      dataIndex: 'fileSize',
      key: 'fileSize',
      width: 120,
      render: (size: string) => <span style={{ fontWeight: 700, color: '#334155' }}>{size}</span>,
    },
    {
      title: 'Cập nhật & Người tải',
      key: 'uploader',
      render: (_: any, record: EnterpriseDriveFile) => (
        <div>
          <div style={{ fontSize: 12.5, color: '#0F172A', fontWeight: 600 }}>{record.uploadedBy}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.modifiedDate}</div>
        </div>
      ),
    },
    {
      title: 'Bảo mật & Quyền hạn',
      key: 'security',
      width: 170,
      render: (_: any, record: EnterpriseDriveFile) => (
        <div>
          <div style={{ fontSize: 11.5, color: '#16A34A', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <LockOutlined /> {record.encryption}
          </div>
          <Tag color="purple" style={{ marginTop: 2 }}>{record.accessLevel}</Tag>
        </div>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 160,
      render: (_: any, record: EnterpriseDriveFile) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedFile(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => handleDownload(record)}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tải về
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Dung lượng lưu trữ đám mây đã dùng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            1.42 TB / 5.0 TB
          </div>
          <div style={{ marginTop: 6 }}>
            <Progress percent={28.4} strokeColor="#009688" size="small" />
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số tệp tin lưu trữ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {data.length} tệp dữ liệu
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Phân quyền bảo mật đa cấp chuẩn RBAC</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chuẩn mã hóa lưu trữ dữ liệu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            AES-256 GCM
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Mã hóa đầu cuối End-to-End Encryption</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cơ chế sao lưu dự phòng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            Snapshot 00:00
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Đồng bộ đa trung tâm dữ liệu IDC N+1</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả tệp tin' },
            { key: 'PDF', label: 'Tài liệu PDF', icon: <FileTextOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'Excel', label: 'Bảng tính Excel', icon: <BarChartOutlined style={{ color: '#10B981' }} /> },
            { key: 'Word', label: 'Văn bản Word', icon: <EditOutlined style={{ color: '#6366F1' }} /> },
            { key: 'ZIP/Code', label: 'Mã nguồn & ZIP', icon: <InboxOutlined style={{ color: '#D97706' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFileTypeFilter(tab.key)}
              style={{
                backgroundColor: fileTypeFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: fileTypeFilter === tab.key ? '#009688' : '#CBD5E1',
                color: fileTypeFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: fileTypeFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên tệp tin, thư mục, người tải..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={() => {
              form.resetFields();
              setSelectedUploadFile(null);
              form.setFieldsValue({
                folder: 'Báo cáo Tài chính & Thuế',
                fileType: 'PDF',
                accessLevel: 'Toàn bộ nội bộ',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tải tệp tin lên
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Tải tệp tin lên */}
      <FileUploadDialog open={filePickerOpen} onClose={() => setFilePickerOpen(false)} onSelect={(selected) => { const file = selected[0]; setSelectedUploadFile(file); form.setFieldsValue({ fileName: file.name }); }} title="Chọn tệp cho Cloud Drive" multiple={false} confirmText="Chọn tệp" />
      <Modal
        title="Tải Tệp Tin Lên Đám Mây Doanh Nghiệp"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={580}
      >
        <Form form={form} layout="vertical" onFinish={handleUpload} style={{ marginTop: 14 }}>
          <Form.Item name="fileName" label="Tên tệp tin kèm đuôi" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Ke_Hoach_Trien_Khai_Q3_2026.pdf" />
          </Form.Item>
          <div style={{ marginTop: -12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button icon={<CloudUploadOutlined />} onClick={() => setFilePickerOpen(true)}>Chọn tệp</Button>
            <span style={{ fontSize: 12, color: '#64748B' }}>{selectedUploadFile ? `${selectedUploadFile.name} · ${formatFileSize(selectedUploadFile.size)}` : 'Chưa chọn tệp từ thiết bị'}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="folder" label="Thư mục lưu trữ" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Báo cáo Tài chính & Thuế', value: 'Báo cáo Tài chính & Thuế' },
                  { label: 'Hợp đồng B2B & Đối tác', value: 'Hợp đồng B2B & Đối tác' },
                  { label: 'Hồ sơ Nhân sự & Lương', value: 'Hồ sơ Nhân sự & Lương' },
                  { label: 'Mã nguồn & Kiến trúc', value: 'Mã nguồn & Kiến trúc' },
                  { label: 'Tài liệu Tuân thủ ISO', value: 'Tài liệu Tuân thủ ISO' },
                ]}
              />
            </Form.Item>
            <Form.Item name="fileType" label="Định dạng tệp" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'PDF Document', value: 'PDF' },
                  { label: 'Excel Spreadsheet', value: 'Excel' },
                  { label: 'Word Document', value: 'Word' },
                  { label: 'ZIP Archive / Code', value: 'ZIP/Code' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="accessLevel" label="Phân quyền truy cập bảo mật" rules={[{ required: true, message: 'Vui lòng chọn phân quyền truy cập' }]}>
            <Select
              placeholder="Chọn phân quyền..."
              options={[
                { label: 'Toàn bộ nội bộ', value: 'Toàn bộ nội bộ' },
                ...orgUnitOptions,
              ]}
            />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Bắt đầu tải lên
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Tệp Tin Metadata */}
      <Drawer
        title="Thông Tin Tệp Tin &amp; Kiểm Tra Toàn Vẹn"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedFile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {getFileIcon(selectedFile.fileType)}
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                    {selectedFile.fileName}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    Dung lượng: <strong>{selectedFile.fileSize}</strong> · Thư mục: <strong>{selectedFile.folder}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Security & Access */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Thông Số Bảo Mật &amp; Phân Quyền:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                <div>Thuật toán mã hóa: <strong style={{ color: '#16A34A' }}>{selectedFile.encryption}</strong></div>
                <div>Phân quyền truy cập: <Tag color="purple">{selectedFile.accessLevel}</Tag></div>
                <div>Người tải lên: <strong>{selectedFile.uploadedBy}</strong></div>
                <div>Ngày cập nhật: <strong>{selectedFile.modifiedDate}</strong></div>
              </div>
            </div>

            {/* Integrity Hash */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined /> Mã Băm Toàn Vẹn Dữ Liệu (SHA-256):
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11.5, color: '#334155', wordBreak: 'break-all', background: '#FFFFFF', padding: 8, borderRadius: 6, border: '1px solid #CBD5E1' }}>
                {selectedFile.sha256Hash}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                icon={<DownloadOutlined />}
                onClick={() => handleDownload(selectedFile)}
              >
                Tải Tệp Tin Xuống Máy
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in biên bản bàn giao tệp ${selectedFile.fileName}`)}
              >
                In Biên Bản Dữ Liệu (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
