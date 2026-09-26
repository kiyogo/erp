import React, { useState, useEffect } from 'react';
import {
  FolderOpenOutlined,
  UploadOutlined,
  DownloadOutlined,
  EyeOutlined,
  DeleteOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FileImageOutlined,
  FileZipOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message } from '../../custom-ui';
import { FileUploadDialog } from '../../components/FileUploadDialog';
import { filesApi, type StoredFileNode } from '../../api/endpoints';

export interface EmployeeFileItem {
  key: string;
  name: string;
  category: string;
  fileType: 'PDF' | 'Word' | 'Excel' | 'Image' | 'ZIP' | 'Other';
  size: string;
  uploadDate: string;
  issuedBy: string;
  status: 'Đã xác thực' | 'Đã ký số' | 'Chờ kiểm tra';
  description?: string;
}

const fileTypeFromName = (fileName: string): EmployeeFileItem['fileType'] => {
  const name = fileName.toLowerCase();
  if (name.endsWith('.docx') || name.endsWith('.doc')) return 'Word';
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return 'Excel';
  if (name.match(/\.(png|jpe?g|gif|webp|bmp|svg)$/)) return 'Image';
  if (name.match(/\.(zip|rar|7z|tar|gz)$/)) return 'ZIP';
  return name.endsWith('.pdf') ? 'PDF' : 'Other';
};

const formatStoredSize = (bytes: number) => {
  if (!bytes) return '0 B';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
};

const asEmployeeFile = (file: StoredFileNode): EmployeeFileItem => ({
  key: file.id,
  name: file.name,
  category: file.originModule === 'employee-files' ? 'Hồ sơ cá nhân' : 'Tệp hệ thống',
  fileType: fileTypeFromName(file.name),
  size: formatStoredSize(file.sizeBytes),
  uploadDate: file.updatedAt.slice(0, 10),
  issuedBy: file.owner || 'Chưa cập nhật',
  status: 'Chờ kiểm tra',
  description: file.originModule === 'employee-files' ? 'Tài liệu do nhân sự tải lên.' : 'Tài liệu phát sinh từ hệ thống.',
});

export const EmployeeFilesModule: React.FC = () => {
  const [files, setFiles] = useState<EmployeeFileItem[]>([]);

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<EmployeeFileItem | null>(null);
  const [form] = Form.useForm();

  const loadFiles = async () => {
    try {
      const response = await filesApi.list(undefined, false, true);
      setFiles(
        response.data.data
          .filter((file) => file.type === 'file' && !file.isHidden)
          .map(asEmployeeFile),
      );
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải kho tài liệu nhân sự.');
    }
  };

  useEffect(() => { void loadFiles(); }, []);

  const handleUpload = async (values: any) => {
    const fileName = selectedUploadFile?.name || values.name || '';
    try {
      await filesApi.upload(selectedUploadFile || new Blob([], { type: 'text/plain' }), fileName, undefined, 'employee-files');
      await loadFiles();
      message.success(`Đã tải lên tệp tài liệu "${fileName}" thành công!`);
      setUploadModalOpen(false);
      setSelectedUploadFile(null);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Tải tài liệu lên thất bại.');
    }
  };

  const handleDelete = async (key: string, name: string) => {
    try {
      await filesApi.remove(key);
      await loadFiles();
      message.success(`Đã xóa tài liệu "${name}" thành công!`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể xóa tài liệu.');
    }
  };

  const handleDownload = async (file: EmployeeFileItem) => {
    try {
      const response = await filesApi.download(file.key);
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      URL.revokeObjectURL(url);
      message.success(`Đã tải xuống thành công tài liệu: ${file.name}`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải tài liệu.');
    }
  };

  const filteredFiles = files.filter(f => {
    const matchesSearch =
      (f.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (f.category || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (f.issuedBy || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (f.description || '').toLowerCase().includes(searchText.toLowerCase());

    const matchesCategory = categoryFilter === 'all' || f.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'PDF':
        return <FilePdfOutlined style={{ color: '#EF4444', fontSize: 20 }} />;
      case 'Word':
        return <FileWordOutlined style={{ color: '#2563EB', fontSize: 20 }} />;
      case 'Excel':
        return <FileExcelOutlined style={{ color: '#16A34A', fontSize: 20 }} />;
      case 'Image':
        return <FileImageOutlined style={{ color: '#8B5CF6', fontSize: 20 }} />;
      case 'ZIP':
        return <FileZipOutlined style={{ color: '#F59E0B', fontSize: 20 }} />;
      default:
        return <FileTextOutlined style={{ color: '#64748B', fontSize: 20 }} />;
    }
  };

  const columns = [
    {
      title: 'Tên tệp tin / Tài liệu',
      key: 'name',
      render: (_: any, record: EmployeeFileItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {getFileIcon(record.fileType)}
          <div>
            <div style={{ fontWeight: 600, color: '#1E293B', fontSize: 13 }}>{record.name}</div>
            {record.description && (
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }}>{record.description}</div>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Phân loại',
      dataIndex: 'category',
      key: 'category',
      width: 170,
      render: (cat: string) => (
        <span
          style={{
            background: '#F1F5F9',
            color: '#475569',
            padding: '3px 8px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {cat}
        </span>
      ),
    },
    {
      title: 'Dung lượng',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (s: string) => <span style={{ color: '#64748B', fontSize: 12.5 }}>{s}</span>,
    },
    {
      title: 'Ngày cập nhật',
      dataIndex: 'uploadDate',
      key: 'uploadDate',
      width: 120,
      render: (d: string) => <span style={{ color: '#334155', fontSize: 12.5 }}>{d}</span>,
    },
    {
      title: 'Đơn vị ban hành / Cấp',
      dataIndex: 'issuedBy',
      key: 'issuedBy',
      width: 180,
      render: (i: string) => <span style={{ color: '#1E293B', fontSize: 12.5, fontWeight: 500 }}>{i}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (s: string) => {
        let bg = '#DCFCE7';
        let color = '#16A34A';
        let icon = <CheckCircleOutlined />;
        if (s === 'Đã ký số') {
          bg = '#EFF6FF';
          color = '#2563EB';
          icon = <SafetyCertificateOutlined />;
        } else if (s === 'Chờ kiểm tra') {
          bg = '#FEF3C7';
          color = '#D97706';
          icon = <ClockCircleOutlined />;
        }
        return (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              background: bg,
              color: color,
            }}
          >
            {icon} {s}
          </span>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      align: 'center' as const,
      render: (_: any, record: EmployeeFileItem) => (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
          <button
            onClick={() => {
              setSelectedFile(record);
              setViewModalOpen(true);
            }}
            title="Xem chi tiết"
            style={{
              background: 'transparent',
              border: '1px solid #E2E8F0',
              borderRadius: 4,
              padding: '4px 7px',
              cursor: 'pointer',
              color: '#009688',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <EyeOutlined style={{ fontSize: 13 }} />
          </button>
          <button
            onClick={() => handleDownload(record)}
            title="Tải xuống"
            style={{
              background: 'transparent',
              border: '1px solid #E2E8F0',
              borderRadius: 4,
              padding: '4px 7px',
              cursor: 'pointer',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <DownloadOutlined style={{ fontSize: 13 }} />
          </button>
          <button
            onClick={() => handleDelete(record.key, record.name)}
            title="Xóa tài liệu"
            style={{
              background: 'transparent',
              border: '1px solid #FEE2E2',
              borderRadius: 4,
              padding: '4px 7px',
              cursor: 'pointer',
              color: '#EF4444',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <DeleteOutlined style={{ fontSize: 13 }} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* Header Bar */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E0E0E0',
          borderRadius: 8,
          padding: '16px 10px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: '#E0F2F1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#009688',
              fontSize: 20,
            }}
          >
            <FolderOpenOutlined />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1E293B' }}>Tài liệu &amp; Hồ sơ đính kèm</h2>
            <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
              Quản lý toàn bộ hồ sơ nhân sự cá nhân, bằng cấp, chứng chỉ và văn bản số hóa
            </div>
          </div>
        </div>

        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            setSelectedUploadFile(null);
            setUploadModalOpen(true);
          }}
          style={{
            backgroundColor: '#009688',
            borderColor: '#009688',
            borderRadius: 6,
            fontWeight: 400,
            fontSize: 13,
            height: 34,
          }}
        >
          Tải lên tài liệu
        </Button>
      </div>

      {/* Filter & Search Toolbar */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E0E0E0',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 280 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên tệp tin, đơn vị cấp, mô tả..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            style={{ maxWidth: 360 }}
          />
          <Select
            value={categoryFilter}
            onChange={val => setCategoryFilter(val)}
            style={{ width: 190 }}
            options={[
              { label: 'Tất cả phân loại', value: 'all' },
              { label: 'Hồ sơ cá nhân', value: 'Hồ sơ cá nhân' },
              { label: 'Bằng cấp & Chứng chỉ', value: 'Bằng cấp & Chứng chỉ' },
              { label: 'Hợp đồng & Quyết định', value: 'Hợp đồng & Quyết định' },
              { label: 'Sức khỏe & Y tế', value: 'Sức khỏe & Y tế' },
              { label: 'Văn bản cam kết', value: 'Văn bản cam kết' },
              { label: 'Tài sản & Thiết bị', value: 'Tài sản & Thiết bị' },
            ]}
          />
        </div>

        <div style={{ fontSize: 13, color: '#64748B' }}>
          Tổng cộng: <strong>{filteredFiles.length}</strong> tệp tài liệu
        </div>
      </div>

      {/* Table Content */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, overflow: 'hidden' }}>
        <KTable columns={columns} dataSource={filteredFiles} rowKey="key" pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />
      </div>

      {/* Modal: Tải lên tài liệu mới */}
      <FileUploadDialog open={filePickerOpen} onClose={() => setFilePickerOpen(false)} onSelect={(selected) => { const file = selected[0]; setSelectedUploadFile(file); form.setFieldsValue({ name: file.name }); }} title="Chọn tài liệu / hồ sơ" multiple={false} confirmText="Chọn tệp" />
      <Modal
        open={uploadModalOpen}
        onCancel={() => setUploadModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <UploadOutlined style={{ color: '#009688' }} />
            <span>Tải lên tài liệu / hồ sơ mới</span>
          </div>
        }
        width={580}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button onClick={() => setUploadModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              onClick={() => form.submit()}
              style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6 }}
            >
              Lưu &amp; Tải lên
            </Button>
          </div>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleUpload} style={{ paddingTop: 8 }}>
          <Form.Item
            name="name"
            label="Tên tệp tin tài liệu"
            rules={[{ required: true, message: 'Vui lòng nhập tên tệp tin!' }]}
          >
            <Input placeholder="Ví dụ: BangTotNghiep_ChungChi_2026.pdf" />
          </Form.Item>
          <div style={{ marginTop: -12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button icon={<UploadOutlined />} onClick={() => setFilePickerOpen(true)}>Chọn tệp</Button>
            <span style={{ fontSize: 12, color: '#64748B' }}>{selectedUploadFile ? `${selectedUploadFile.name} · ${formatStoredSize(selectedUploadFile.size)}` : 'Chưa chọn tệp từ thiết bị'}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item
              name="category"
              label="Phân loại tài liệu"
              initialValue="Hồ sơ cá nhân"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { label: 'Hồ sơ cá nhân', value: 'Hồ sơ cá nhân' },
                  { label: 'Bằng cấp & Chứng chỉ', value: 'Bằng cấp & Chứng chỉ' },
                  { label: 'Hợp đồng & Quyết định', value: 'Hợp đồng & Quyết định' },
                  { label: 'Sức khỏe & Y tế', value: 'Sức khỏe & Y tế' },
                  { label: 'Văn bản cam kết', value: 'Văn bản cam kết' },
                  { label: 'Tài sản & Thiết bị', value: 'Tài sản & Thiết bị' },
                ]}
              />
            </Form.Item>

            <Form.Item name="issuedBy" label="Đơn vị ban hành / Cấp" initialValue="Công ty KIYOVN">
              <Input placeholder="Tên cơ quan, trường, tổ chức cấp..." />
            </Form.Item>
          </div>

          <Form.Item name="description" label="Ghi chú / Mô tả chi tiết">
            <Input.TextArea rows={3} placeholder="Mô tả nội dung tài liệu hoặc văn bản..." />
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal: Xem chi tiết tài liệu */}
      <Modal
        open={viewModalOpen}
        onCancel={() => setViewModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FolderOpenOutlined style={{ color: '#009688' }} />
            <span>Chi tiết tài liệu đính kèm</span>
          </div>
        }
        width={600}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
            <Button
              icon={<DownloadOutlined />}
              onClick={() => selectedFile && handleDownload(selectedFile)}
            >
              Tải xuống bản gốc
            </Button>
            <Button
              type="primary"
              onClick={() => setViewModalOpen(false)}
              style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6 }}
            >
              Đóng
            </Button>
          </div>
        }
      >
        {selectedFile && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
            <div
              style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              {getFileIcon(selectedFile.fileType)}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{selectedFile.name}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  Dung lượng: {selectedFile.size} • Định dạng: {selectedFile.fileType}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: 12 }}>Phân loại:</span>
                <span style={{ fontWeight: 500, color: '#1E293B' }}>{selectedFile.category}</span>
              </div>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: 12 }}>Ngày tải lên:</span>
                <span style={{ fontWeight: 500, color: '#1E293B' }}>{selectedFile.uploadDate}</span>
              </div>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: 12 }}>Đơn vị ban hành:</span>
                <span style={{ fontWeight: 500, color: '#1E293B' }}>{selectedFile.issuedBy}</span>
              </div>
              <div>
                <span style={{ color: '#64748B', display: 'block', fontSize: 12 }}>Trạng thái xác thực:</span>
                <span style={{ fontWeight: 500, color: '#16A34A' }}>{selectedFile.status}</span>
              </div>
            </div>

            {selectedFile.status === 'Đã ký số' ? (
              <div style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: 8, padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#065F46', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
                  <SafetyCertificateOutlined style={{ color: '#059669', fontSize: 16 }} />
                  <span>Xác thực chữ ký số điện tử hợp lệ (PKI Root CA)</span>
                </div>
                <div style={{ fontSize: 12, color: '#047857', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>Người ký: <span style={{ color: '#065F46' }}>Chưa đồng bộ</span></div>
                  <div>Đơn vị: <span style={{ color: '#065F46', fontWeight: 600 }}>Chưa cập nhật</span></div>
                  <div>Nhà cung cấp CA: <span>Chưa cập nhật</span></div>
                  <div>Thuật toán: <span>Chưa cập nhật</span></div>
                </div>
              </div>
            ) : (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  Văn bản này hiện chưa được cấp chứng thư chữ ký số điện tử
                </div>
                <Button size="small" icon={<SafetyCertificateOutlined />} disabled>
                  Chưa khả dụng
                </Button>
              </div>
            )}

            {selectedFile.description && (
              <div style={{ background: '#F9FAFB', padding: 12, borderRadius: 6, border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>Mô tả nội dung:</div>
                <div style={{ fontSize: 13, color: '#374151' }}>{selectedFile.description}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default EmployeeFilesModule;
