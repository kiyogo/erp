import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  LinkOutlined,
  EyeOutlined,
  FileProtectOutlined,
  CalendarOutlined,
  GlobalOutlined,
  DollarOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

import { useEffect } from 'react';
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

export interface EnterpriseCertificateItem {
  key: string;
  certCode: string;
  certName: string;
  employeeName: string;
  empCode: string;
  department: string;
  issuingOrg: string;
  issueDate: string;
  expireDate: string;
  credentialId: string;
  verificationUrl?: string;
  companySponsored: boolean;
  examFee: number;
  status: 'Còn hiệu lực' | 'Sắp hết hạn' | 'Hết hiệu lực';
}

export const CertificatesModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseCertificateItem[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCert, setSelectedCert] = useState<EnterpriseCertificateItem | null>(null);

  const loadData = async () => {
    try {
      const [res, orgUnits] = await Promise.all([
        collectionsApi.get<EnterpriseCertificateItem>('hr_certificates', { limit: 500 }),
        dataService.fetchOrgUnitsList(),
      ]);
      const list = res.data?.data || [];
      setData(list.map((item: any) => ({ ...item, key: item.id || item.key })));
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
    } catch {
      setData([]);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const activeCount = data.filter((c) => c.status === 'Còn hiệu lực').length;
  const expiringCount = data.filter((c) => c.status === 'Sắp hết hạn').length;
  const totalSponsorship = data.reduce((sum, item) => sum + (item.examFee || 0), 0);

  const handleCreate = async (values: any) => {
    const id = `cert-${Date.now()}`;
    const newCert: EnterpriseCertificateItem = {
      ...values,
      key: id,
      empCode: values.empCode || `KY-${String(Date.now()).slice(-3)}`,
      companySponsored: true,
      examFee: Number(values.examFee) || 8000000,
      verificationUrl: values.verificationUrl || `https://credly.com/badges/${values.credentialId}`,
      status: 'Còn hiệu lực',
    };
    try {
      await collectionsApi.create('hr_certificates', newCert, id);
      message.success(`Đã thêm và đồng bộ chứng chỉ cho: ${values.employeeName}`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu chứng chỉ.');
    }
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.certCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.certName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.issuingOrg || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.credentialId || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Tên chứng chỉ quốc tế',
      key: 'certName',
      render: (_: any, record: EnterpriseCertificateItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SafetyCertificateOutlined style={{ color: '#009688', fontSize: 15 }} />
            {record.certName}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{record.certCode}</code> · ID: {record.credentialId}
          </div>
        </div>
      ),
    },
    {
      title: 'Tổ chức cấp chứng chỉ',
      dataIndex: 'issuingOrg',
      key: 'issuingOrg',
      width: 220,
      render: (org: string) => <span style={{ fontWeight: 600, color: '#2563EB', fontSize: 12 }}>{org}</span>,
    },
    {
      title: 'Nhân sự sở hữu',
      key: 'employeeName',
      width: 190,
      render: (_: any, record: EnterpriseCertificateItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Mã: <code>{record.empCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Thời hạn hiệu lực',
      key: 'dates',
      width: 170,
      render: (_: any, record: EnterpriseCertificateItem) => (
        <div style={{ fontSize: 11.5 }}>
          <div>Cấp: {record.issueDate}</div>
          <div style={{ color: record.status === 'Sắp hết hạn' ? '#D97706' : '#0F172A', fontWeight: 600 }}>
            Hết hạn: {record.expireDate}
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Còn hiệu lực') color = 'success';
        if (status === 'Sắp hết hạn') color = 'warning';
        if (status === 'Hết hiệu lực') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_: any, record: EnterpriseCertificateItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedCert(record);
            setDrawerOpen(true);
          }}
        >
          Văn bằng
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chứng chỉ quốc tế sở hữu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Chứng chỉ
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>AWS, CNCF, PMI,², Microsoft Cloud</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang còn hiệu lực chuẩn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeCount} / {data.length} Văn bằng
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Được xác thực trên hệ sinh thái đối tác toàn cầu</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Sắp hết hạn trong 90 ngày</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {expiringCount} Chứng chỉ
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Đã cấp ngân sách thi Recertification</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng ngân sách công ty tài trợ thi</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {(totalSponsorship / 1000000).toFixed(1)} Triệu ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tài trợ 100% lệ phí thi cho kỹ sư đỗ chứng chỉ</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả chứng chỉ' },
            { key: 'Còn hiệu lực', label: 'Còn hiệu lực', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Sắp hết hạn', label: 'Sắp hết hạn', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Hết hiệu lực', label: 'Hết hiệu lực', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setStatusFilter(tab.key)}
              style={{
                backgroundColor: statusFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: statusFilter === tab.key ? '#009688' : '#CBD5E1',
                color: statusFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: statusFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên chứng chỉ, nhân sự, tổ chức..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo hồ sơ chứng chỉ')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                certCode: `CC-2026-0${data.length + 1}`,
                issuingOrg: 'Amazon Web Services',
                examFee: 8000000,
                issueDate: new Date().toISOString().substring(0, 10),
                expireDate: new Date(Date.now() + 3 * 365 * 86400000).toISOString().substring(0, 10),
                department: 'Phòng Ban Kỹ Thuật',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Khai báo chứng chỉ mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm chứng chỉ mới */}
      <Modal
        title="Khai Báo &amp; Đăng Ký Chứng Chỉ Chuyên Môn Quốc Tế"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="certCode" label="Mã chứng chỉ" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="issuingOrg" label="Tổ chức cấp chứng chỉ" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Amazon Web Services', value: 'Amazon Web Services (AWS)' },
                  { label: 'Cloud Native Computing Foundation', value: 'Cloud Native Computing Foundation (CNCF)' },
                  { label: 'Project Management Institute', value: 'Project Management Institute (PMI)' },
                  { label: '² Cybersecurity', value: '(ISC)²' },
                  { label: 'Microsoft Azure Certification', value: 'Microsoft' },
                  { label: 'Google Cloud Platform', value: 'Google Cloud' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="certName" label="Tên văn bằng / Chứng chỉ chuyên môn" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: AWS Certified DevOps Engineer - Professional" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Nhân sự sở hữu" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Hoàng Quốc Dũng" />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban trực thuộc" rules={[{ required: true }]}>
              <Select
                options={deptOptions.length > 0 ? deptOptions : [
                  { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
                ]}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="credentialId" label="Credential ID / Số hiệu" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: AWS-DOP-782193" />
            </Form.Item>
            <Form.Item name="issueDate" label="Ngày cấp" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="expireDate" label="Ngày hết hạn" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="examFee" label="Lệ phí thi được công ty tài trợ (VNĐ)">
              <Input type="number" step={500000} />
            </Form.Item>
            <Form.Item name="verificationUrl" label="Đường link xác thực trực tuyến">
              <Input placeholder="https://www.credly.com/badges/..." />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác thực &amp; Lưu hồ sơ
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Văn Bằng & Chứng Chỉ */}
      <Drawer
        title="Hồ Sơ Văn Bằng &amp; Chứng Chỉ Số Quốc Tế"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedCert && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 18, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedCert.certCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedCert.certName}
                  </div>
                </div>
                <Tag color={selectedCert.status === 'Còn hiệu lực' ? 'success' : 'warning'}>
                  {selectedCert.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                Tổ chức cấp: <strong style={{ color: '#2563EB' }}>{selectedCert.issuingOrg}</strong>
              </div>
            </div>

            {/* Information */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Thông Tin Xác Thực Văn Bằng:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Nhân sự sở hữu:</span>
                  <strong>{selectedCert.employeeName} ({selectedCert.empCode})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số hiệu chứng chỉ:</span>
                  <code>{selectedCert.credentialId}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời hạn hiệu lực:</span>
                  <strong>{selectedCert.issueDate} ➔ {selectedCert.expireDate}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Kinh phí công ty tài trợ 100%:</span>
                  <strong style={{ color: '#16A34A' }}>{selectedCert.examFee.toLocaleString('vi-VN')} ₫</strong>
                </div>
              </div>
            </div>

            {/* Online Verification */}
            {selectedCert.verificationUrl && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#EFF6FF' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 4 }}>
                  Liên Kết Xác Thực Điện Tử Quốc Tế:
                </div>
                <div style={{ fontSize: 12, color: '#2563EB', wordBreak: 'break-all' }}>
                  <a href={selectedCert.verificationUrl} target="_blank" rel="noopener noreferrer">
                    <LinkOutlined /> {selectedCert.verificationUrl}
                  </a>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                style={{ flex: 1 }}
                onClick={() => message.success(`Đã sao chép link xác thực cho chứng chỉ ${selectedCert.certCode}`)}
              >
                Sao Chép Link Xác Thực
              </Button>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => message.success(`Đã lập hồ sơ tài trợ ôn thi gia hạn (Recertification) cho ${selectedCert.employeeName}`)}
              >
                Cấp Kinh Phí Thi Gia Hạn
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
