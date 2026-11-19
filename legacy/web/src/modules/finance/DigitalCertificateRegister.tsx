import React, { useEffect, useMemo, useState } from 'react';
import { PlusOutlined, SearchOutlined, KeyOutlined, SyncOutlined, DeleteOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag } from '../../custom-ui';
import { dataService } from '../../services/dataService';
import { useCompanyName } from '../../hooks/useCompanyName';

export type CertificateMode = 'list' | 'certs' | 'providers' | 'signers' | 'alerts' | 'renew';

interface Renewal {
  previousCertNumber: string;
  previousValidFrom: string;
  previousValidTo: string;
  note: string;
  recordedAt: string;
  recordedBy: string;
}

export interface DigitalCert {
  key: string;
  certNumber: string;
  provider: string;
  subjectName: string;
  signType: 'USB Token' | 'Cloud CA' | 'HSM Server';
  authorizedSigner: string;
  validFrom: string;
  validTo: string;
  renewals?: Renewal[];
}

type CertStatus = 'Còn hiệu lực' | 'Sắp hết hạn' | 'Đã hết hạn';
const SCOPE = 'finance_digital_signatures';
const WARNING_DAYS = 30;
const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' };

/** Số ngày còn lại tới hết ngày hết hạn (âm nếu đã quá hạn). */
export const daysUntilExpiry = (validTo: string, now = new Date()): number => {
  const end = Date.parse(`${validTo}T23:59:59`);
  return Math.floor((end - now.getTime()) / 86_400_000);
};
export const certStatus = (cert: Pick<DigitalCert, 'validTo'>, now = new Date()): CertStatus => {
  const days = daysUntilExpiry(cert.validTo, now);
  return days < 0 ? 'Đã hết hạn' : days <= WARNING_DAYS ? 'Sắp hết hạn' : 'Còn hiệu lực';
};
const statusColor = (status: CertStatus) => (status === 'Còn hiệu lực' ? 'success' : status === 'Sắp hết hạn' ? 'warning' : 'error');

const TITLES: Record<CertificateMode, string> = {
  list: 'Danh sách chứng thư số',
  certs: 'Thông tin chứng thư số',
  providers: 'Nhà cung cấp chữ ký số',
  signers: 'Người được quyền ký',
  alerts: 'Cảnh báo hết hạn',
  renew: 'Gia hạn chữ ký số',
};

/**
 * Sổ chứng thư số của doanh nghiệp. Mọi trang con (danh sách, nhà cung cấp, người ký, cảnh báo, gia hạn)
 * đều đọc từ cùng một kho dữ liệu; trạng thái hiệu lực luôn tính theo ngày hết hạn tại thời điểm xem.
 */
export const DigitalCertificateRegister: React.FC<{ mode: CertificateMode }> = ({ mode }) => {
  const companyName = useCompanyName();
  const [data, setData] = useState<DigitalCert[]>([]);
  const [searchText, setSearchText] = useState('');
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [renewing, setRenewing] = useState<DigitalCert | null>(null);
  const [form] = Form.useForm();
  const [renewForm] = Form.useForm();

  useEffect(() => {
    const read = () => {
      const list = dataService.getGenericData(SCOPE);
      setData(Array.isArray(list) ? list : []);
    };
    read();
    return dataService.subscribe(read);
  }, []);

  const rows = useMemo(() => data.map((cert) => ({ ...cert, status: certStatus(cert), daysLeft: daysUntilExpiry(cert.validTo) })), [data]);
  const query = searchText.trim().toLocaleLowerCase('vi-VN');
  const matches = (cert: DigitalCert) => !query || [cert.certNumber, cert.provider, cert.authorizedSigner, cert.subjectName].some((value) => String(value || '').toLocaleLowerCase('vi-VN').includes(query));
  const count = (status: CertStatus) => rows.filter((row) => row.status === status).length;

  const save = async (action: () => Promise<unknown>, success: string, failure: string, onDone: () => void) => {
    if (saving) return;
    setSaving(true);
    try {
      await action();
      message.success(success);
      onDone();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || failure);
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = (values: any) => save(
    () => dataService.createGenericRecord(SCOPE, {
      certNumber: String(values.certNumber || '').trim(),
      provider: String(values.provider || '').trim(),
      subjectName: String(values.subjectName || '').trim(),
      signType: values.signType,
      authorizedSigner: String(values.authorizedSigner || '').trim(),
      validFrom: values.validFrom,
      validTo: values.validTo,
      renewals: [],
    }),
    `Đã đăng ký chứng thư số ${values.certNumber}.`, 'Không đăng ký được chứng thư số.',
    () => { setCreateOpen(false); form.resetFields(); },
  );

  const handleRenew = (values: any) => {
    if (!renewing) return Promise.resolve();
    return save(
      () => dataService.updateGenericRecord(SCOPE, {
        ...renewing,
        certNumber: String(values.certNumber || '').trim() || renewing.certNumber,
        validFrom: values.validFrom,
        validTo: values.validTo,
        renewals: [...(renewing.renewals || []), {
          previousCertNumber: renewing.certNumber, previousValidFrom: renewing.validFrom, previousValidTo: renewing.validTo,
          note: String(values.note || '').trim(),
        }],
      }),
      'Đã ghi nhận gia hạn chứng thư số.', 'Không ghi nhận được gia hạn.',
      () => { setRenewing(null); renewForm.resetFields(); },
    );
  };

  const handleDelete = (cert: DigitalCert) => Modal.confirm({
    title: 'Xóa chứng thư số?',
    content: `Xóa chứng thư ${cert.certNumber} khỏi sổ chứng thư. Thao tác này không hoàn tác được.`,
    okText: 'Xóa chứng thư', cancelText: 'Hủy', okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await dataService.deleteGenericRecord(SCOPE, cert.key);
        message.success(`Đã xóa chứng thư ${cert.certNumber}.`);
      } catch (error: any) {
        message.error(error?.response?.data?.message || error?.message || 'Không xóa được chứng thư số.');
      }
    },
  });

  const certColumns = [
    { title: 'Số serial chứng thư', dataIndex: 'certNumber', key: 'certNumber', render: (value: string) => <span style={{ color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}><KeyOutlined /> {value}</span> },
    { title: 'Nhà cung cấp', dataIndex: 'provider', key: 'provider' },
    { title: 'Chủ thể', dataIndex: 'subjectName', key: 'subjectName' },
    { title: 'Loại hình', dataIndex: 'signType', key: 'signType', width: 110 },
    { title: 'Người được phân quyền ký', dataIndex: 'authorizedSigner', key: 'authorizedSigner' },
    { title: 'Hiệu lực', key: 'validity', render: (_: any, cert: DigitalCert) => <span style={{ fontSize: 12.5, color: '#64748B' }}>{cert.validFrom} đến {cert.validTo}</span> },
    { title: 'Trạng thái', key: 'status', width: 130, render: (_: any, cert: DigitalCert & { status: CertStatus }) => <Tag color={statusColor(cert.status)}>{cert.status}</Tag> },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 220,
      render: (_: any, cert: DigitalCert) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button icon={<SyncOutlined />} onClick={() => { renewForm.resetFields(); setRenewing(cert); }}>Gia hạn</Button>
          <Button danger icon={<DeleteOutlined />} aria-label="Xóa chứng thư" title="Xóa chứng thư" onClick={() => handleDelete(cert)} />
        </div>
      ),
    },
  ];

  const groupBy = (key: 'provider' | 'authorizedSigner') => {
    const groups = new Map<string, typeof rows>();
    for (const row of rows) groups.set(row[key], [...(groups.get(row[key]) || []), row]);
    return [...groups.entries()].map(([name, items]) => ({
      key: name, name, total: items.length,
      valid: items.filter((item) => item.status === 'Còn hiệu lực').length,
      expiring: items.filter((item) => item.status === 'Sắp hết hạn').length,
      expired: items.filter((item) => item.status === 'Đã hết hạn').length,
      nextExpiry: items.map((item) => item.validTo).sort()[0],
    })).filter((group) => !query || group.name.toLocaleLowerCase('vi-VN').includes(query));
  };
  const groupColumns = (label: string) => [
    { title: label, dataIndex: 'name', key: 'name' },
    { title: 'Số chứng thư', dataIndex: 'total', key: 'total', width: 130 },
    { title: 'Còn hiệu lực', dataIndex: 'valid', key: 'valid', width: 130 },
    { title: 'Sắp hết hạn', dataIndex: 'expiring', key: 'expiring', width: 130 },
    { title: 'Đã hết hạn', dataIndex: 'expired', key: 'expired', width: 130 },
    { title: 'Hạn gần nhất', dataIndex: 'nextExpiry', key: 'nextExpiry', width: 140 },
  ];

  const attention = rows.filter((row) => row.status !== 'Còn hiệu lực').sort((left, right) => left.validTo.localeCompare(right.validTo));
  const visibleRows = (mode === 'alerts' || mode === 'renew' ? attention : rows).filter(matches);

  const renderBody = () => {
    if (mode === 'providers') return <KTable dataSource={groupBy('provider')} columns={groupColumns('Nhà cung cấp chữ ký số')} rowKey="key" pagination={{ pageSize: 10 }} />;
    if (mode === 'signers') return <KTable dataSource={groupBy('authorizedSigner')} columns={groupColumns('Người được quyền ký')} rowKey="key" pagination={{ pageSize: 10 }} />;
    const columns = mode === 'alerts'
      ? [...certColumns.slice(0, 2), certColumns[4], certColumns[5], { title: 'Còn lại', key: 'daysLeft', width: 120, render: (_: any, cert: DigitalCert & { daysLeft: number }) => (cert.daysLeft < 0 ? `Quá hạn ${-cert.daysLeft} ngày` : `${cert.daysLeft} ngày`) }, certColumns[6]]
      : certColumns;
    return <KTable dataSource={visibleRows} columns={columns} rowKey="key" pagination={{ pageSize: 10 }} />;
  };

  const emptyNote = mode === 'alerts' || mode === 'renew'
    ? (rows.length ? `Không có chứng thư nào sắp hết hạn trong ${WARNING_DAYS} ngày tới hoặc đã hết hạn.` : 'Chưa đăng ký chứng thư số nào.')
    : '';

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng số chứng thư</div>
          <div style={{ fontSize: 24, color: '#009688', marginTop: 4 }}>{rows.length}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Còn hiệu lực</div>
          <div style={{ fontSize: 24, color: '#16A34A', marginTop: 4 }}>{count('Còn hiệu lực')}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Hết hạn trong {WARNING_DAYS} ngày</div>
          <div style={{ fontSize: 24, color: '#D97706', marginTop: 4 }}>{count('Sắp hết hạn')}</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Đã hết hạn</div>
          <div style={{ fontSize: 24, color: '#DC2626', marginTop: 4 }}>{count('Đã hết hạn')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 16, color: '#0F172A' }}>{TITLES[mode]}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input prefix={<SearchOutlined style={{ color: '#94A3B8' }} />} placeholder="Tìm theo số serial, nhà cung cấp hoặc người ký" value={searchText} onChange={(event) => setSearchText(event.target.value)} style={{ width: 320 }} allowClear />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ subjectName: companyName, signType: 'Cloud CA' }); setCreateOpen(true); }} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
            Đăng ký chứng thư
          </Button>
        </div>
      </div>

      <div className="transparent-table-card">{renderBody()}</div>
      {emptyNote && visibleRows.length === 0 && <div style={{ fontSize: 12.5, color: '#64748B' }}>{emptyNote}</div>}

      <Modal title="Đăng ký chứng thư số" open={createOpen} onCancel={() => !saving && setCreateOpen(false)} footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="certNumber" label="Số serial chứng thư" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="signType" label="Loại hình ký số" rules={[{ required: true }]}>
              <Select options={['Cloud CA', 'USB Token', 'HSM Server'].map((type) => ({ label: type, value: type }))} />
            </Form.Item>
          </div>
          <Form.Item name="provider" label="Nhà cung cấp chữ ký số" rules={[{ required: true, whitespace: true }]}><Input placeholder="Tên đơn vị cấp chứng thư số" /></Form.Item>
          <Form.Item name="subjectName" label="Chủ thể chứng thư" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
          <Form.Item name="authorizedSigner" label="Người được phân quyền ký số" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="validFrom" label="Hiệu lực từ" rules={[{ required: true }]}><Input type="date" aria-label="Hiệu lực từ" /></Form.Item>
            <Form.Item name="validTo" label="Hết hạn vào" rules={[{ required: true }]}><Input type="date" aria-label="Hết hạn vào" /></Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 14 }}>
            <Button disabled={saving} onClick={() => setCreateOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu chứng thư</Button>
          </div>
        </Form>
      </Modal>

      <Modal title="Ghi nhận gia hạn chứng thư số" open={Boolean(renewing)} onCancel={() => !saving && setRenewing(null)} footer={null} width={520}>
        {renewing && (
          <Form form={renewForm} layout="vertical" onFinish={handleRenew} style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12.5, color: '#64748B', marginBottom: 10 }}>
              Chứng thư {renewing.certNumber} của {renewing.provider}, hiện hết hạn {renewing.validTo}. Nhập thông tin chứng thư sau khi nhà cung cấp đã gia hạn hoặc cấp lại.
            </div>
            <Form.Item name="certNumber" label="Số serial mới nếu có thay đổi"><Input placeholder={renewing.certNumber} /></Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Form.Item name="validFrom" label="Hiệu lực từ" rules={[{ required: true }]}><Input type="date" aria-label="Hiệu lực từ" /></Form.Item>
              <Form.Item name="validTo" label="Hết hạn vào" rules={[{ required: true }]}><Input type="date" aria-label="Hết hạn vào" /></Form.Item>
            </div>
            <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} /></Form.Item>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 14 }}>
              <Button disabled={saving} onClick={() => setRenewing(null)}>Hủy</Button>
              <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Ghi nhận gia hạn</Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  );
};
