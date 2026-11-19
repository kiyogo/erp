import { dataService } from '../../services/dataService';
import React, { useEffect, useMemo, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  PrinterOutlined,
  StarFilled,
  TeamOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Progress } from '../../custom-ui';
import { exportRecordToPdf, exportRowsToXlsx } from '../../utils/fileExporter';

export interface EnterpriseShareholder {
  key: string;
  shareholderCode: string;
  fullName: string;
  idNumber: string;
  address: string;
  type: 'Cổ đông sáng lập' | 'Cổ đông chiến lược' | 'Cổ đông ESOP' | 'Cổ đông phổ thông';
  sharesCount: number;
  parValue: number;
  capitalValue: number;
  joinDate: string;
  certificateNumber: string;
}

type ShareholderRow = EnterpriseShareholder & { ownershipPercentage: number };

const TYPES: Array<EnterpriseShareholder['type']> = ['Cổ đông sáng lập', 'Cổ đông chiến lược', 'Cổ đông ESOP', 'Cổ đông phổ thông'];
const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' };
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Sổ đăng ký cổ đông. Vốn góp bằng số cổ phần nhân mệnh giá do người dùng nhập, tỷ lệ sở hữu tính theo tổng cổ phần hiện có.
 * Không có số liệu cổ tức vì hệ thống chưa ghi nhận các lần chia cổ tức.
 */
export const EquityModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseShareholder[]>([]);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [form] = Form.useForm();

  useEffect(() => {
    const read = () => {
      const list = dataService.getGenericData('finance_equity');
      setData(Array.isArray(list) ? list : []);
    };
    read();
    return dataService.subscribe(read);
  }, []);

  const totalShares = data.reduce((sum, item) => sum + item.sharesCount, 0);
  const totalCapital = data.reduce((sum, item) => sum + item.capitalValue, 0);
  const rows: ShareholderRow[] = useMemo(
    () => data.map((item) => ({ ...item, ownershipPercentage: totalShares ? Math.round((item.sharesCount / totalShares) * 1000) / 10 : 0 })),
    [data, totalShares],
  );
  const selected = rows.find((item) => item.key === selectedKey) || null;
  const parValues = Array.from(new Set(data.map((item) => item.parValue)));

  const filteredData = rows.filter((item) => {
    const query = searchText.trim().toLocaleLowerCase('vi-VN');
    const matchType = typeFilter === 'all' || item.type === typeFilter;
    const matchSearch = !query || [item.fullName, item.shareholderCode, item.type, item.idNumber].some((value) => String(value || '').toLocaleLowerCase('vi-VN').includes(query));
    return matchType && matchSearch;
  });

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const created = await dataService.createGenericRecord('finance_equity', {
        shareholderCode: String(values.shareholderCode || '').trim(),
        type: values.type,
        fullName: String(values.fullName || '').trim(),
        idNumber: String(values.idNumber || '').trim(),
        address: String(values.address || '').trim(),
        sharesCount: Number(values.sharesCount),
        parValue: Number(values.parValue),
        joinDate: values.joinDate,
        certificateNumber: String(values.certificateNumber || '').trim(),
      });
      message.success(`Đã ghi sổ cổ đông ${created.fullName}.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không ghi được sổ cổ đông.');
    } finally {
      setSaving(false);
    }
  };

  const exportColumns = [
    { title: 'Mã cổ đông', dataIndex: 'shareholderCode' },
    { title: 'Họ và tên', dataIndex: 'fullName' },
    { title: 'Số định danh', dataIndex: 'idNumber' },
    { title: 'Địa chỉ', dataIndex: 'address' },
    { title: 'Loại', dataIndex: 'type' },
    { title: 'Số cổ phần', dataIndex: 'sharesCount' },
    { title: 'Mệnh giá', dataIndex: 'parValue' },
    { title: 'Tỷ lệ sở hữu (%)', dataIndex: 'ownershipPercentage' },
    { title: 'Giá trị vốn góp', dataIndex: 'capitalValue' },
    { title: 'Ngày ghi sổ', dataIndex: 'joinDate' },
    { title: 'Số sổ hoặc số cổ phiếu', dataIndex: 'certificateNumber' },
  ];

  const columns = [
    {
      title: 'Mã và loại cổ đông',
      key: 'shareholderCode',
      render: (_: any, record: ShareholderRow) => (
        <div>
          <div style={{ color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}><SafetyCertificateOutlined /> {record.shareholderCode}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>{record.type}</div>
        </div>
      ),
    },
    {
      title: 'Cổ đông',
      key: 'fullName',
      render: (_: any, record: ShareholderRow) => (
        <div>
          <div style={{ color: '#0F172A', fontSize: 13 }}>{record.fullName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>Số định danh {record.idNumber} · Ghi sổ {record.joinDate}</div>
        </div>
      ),
    },
    {
      title: 'Cổ phần sở hữu',
      dataIndex: 'sharesCount',
      key: 'sharesCount',
      width: 160,
      render: (value: number, record: ShareholderRow) => (
        <div>
          <span style={{ color: '#1E40AF', fontSize: 13.5 }}>{value.toLocaleString('vi-VN')} cổ phần</span>
          <div style={{ fontSize: 11, color: '#64748B' }}>Mệnh giá {record.parValue.toLocaleString('vi-VN')} ₫</div>
        </div>
      ),
    },
    {
      title: 'Tỷ lệ sở hữu',
      dataIndex: 'ownershipPercentage',
      key: 'ownershipPercentage',
      width: 160,
      render: (percent: number) => (
        <div>
          <span style={{ color: '#009688', fontSize: 14 }}>{percent}%</span>
          <Progress percent={percent} strokeColor="#009688" showInfo={false} />
        </div>
      ),
    },
    {
      title: 'Giá trị vốn góp',
      dataIndex: 'capitalValue',
      key: 'capitalValue',
      width: 180,
      render: (value: number) => <span style={{ color: '#0F172A', fontSize: 13.5 }}>{value.toLocaleString('vi-VN')} ₫</span>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_: any, record: ShareholderRow) => (
        <Button icon={<EyeOutlined />} onClick={() => { setSelectedKey(record.key); setDrawerOpen(true); }}>Chi tiết</Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng vốn góp đã ghi sổ</div>
          <div style={{ fontSize: 24, color: '#009688', marginTop: 4 }}>{totalCapital.toLocaleString('vi-VN')} ₫</div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>
            {parValues.length === 0 ? 'Chưa có cổ đông nào' : parValues.length === 1 ? `Mệnh giá ${parValues[0].toLocaleString('vi-VN')} ₫ mỗi cổ phần` : 'Có nhiều mệnh giá khác nhau'}
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng số cổ phần đã ghi sổ</div>
          <div style={{ fontSize: 24, color: '#1E40AF', marginTop: 4 }}>{totalShares.toLocaleString('vi-VN')} cổ phần</div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Của {data.length} cổ đông</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Cổ đông sáng lập</div>
          <div style={{ fontSize: 24, color: '#7C3AED', marginTop: 4 }}>{data.filter((item) => item.type === 'Cổ đông sáng lập').length} cổ đông</div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Theo sổ đăng ký cổ đông</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả cổ đông' },
            { key: 'Cổ đông sáng lập', label: 'Sáng lập', icon: <IdcardOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'Cổ đông ESOP', label: 'ESOP', icon: <StarFilled style={{ color: '#F59E0B' }} /> },
            { key: 'Cổ đông chiến lược', label: 'Chiến lược', icon: <TeamOutlined style={{ color: '#10B981' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              icon={tab.icon}
              onClick={() => setTypeFilter(tab.key)}
              style={{
                backgroundColor: typeFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: typeFilter === tab.key ? '#009688' : '#CBD5E1',
                color: typeFilter === tab.key ? '#00796B' : '#475569',
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên, mã hoặc số định danh"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Button
            icon={<DownloadOutlined />}
            onClick={() => {
              if (!filteredData.length) { message.warning('Không có cổ đông để xuất.'); return; }
              const count = exportRowsToXlsx('So_dang_ky_co_dong', exportColumns, filteredData);
              message.success(`Đã xuất ${count} cổ đông ra tệp Excel.`);
            }}
          >
            Xuất sổ cổ đông
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { form.resetFields(); form.setFieldsValue({ joinDate: today() }); setModalOpen(true); }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Ghi sổ cổ đông
          </Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} rowKey="key" pagination={{ pageSize: 8 }} />
      </div>

      <Modal title="Ghi sổ cổ đông" open={modalOpen} onCancel={() => !saving && setModalOpen(false)} footer={null} width={640}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="shareholderCode" label="Mã cổ đông" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="type" label="Loại cổ đông" rules={[{ required: true }]}>
              <Select options={TYPES.map((type) => ({ label: type, value: type }))} />
            </Form.Item>
          </div>
          <Form.Item name="fullName" label="Họ tên cổ đông hoặc tên tổ chức" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="idNumber" label="Số CCCD hoặc mã số doanh nghiệp" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="joinDate" label="Ngày ghi sổ" rules={[{ required: true }]}><Input type="date" aria-label="Ngày ghi sổ" /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Form.Item name="sharesCount" label="Số cổ phần" rules={[{ required: true }]}><Input type="number" min={1} step={1} /></Form.Item>
            <Form.Item name="parValue" label="Mệnh giá mỗi cổ phần (₫)" rules={[{ required: true }]}><Input type="number" min={1} step={1} /></Form.Item>
            <Form.Item name="certificateNumber" label="Số sổ hoặc số cổ phiếu"><Input /></Form.Item>
          </div>
          <Form.Item name="address" label="Địa chỉ thường trú hoặc trụ sở" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 14 }}>
            <Button disabled={saving} onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Ghi sổ</Button>
          </div>
        </Form>
      </Modal>

      <Drawer title="Hồ sơ cổ đông" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={580}>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, color: '#009688' }}>{selected.shareholderCode}{selected.certificateNumber ? ` · Sổ ${selected.certificateNumber}` : ''}</div>
                <div style={{ fontSize: 18, color: '#0F172A', marginTop: 4 }}>{selected.fullName}</div>
              </div>
              <Tag color="cyan">{selected.type}</Tag>
            </div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Số định danh {selected.idNumber} · Địa chỉ {selected.address}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Số cổ phần sở hữu</span><span style={{ color: '#1E40AF', fontSize: 14 }}>{selected.sharesCount.toLocaleString('vi-VN')} cổ phần</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Mệnh giá mỗi cổ phần</span><span>{selected.parValue.toLocaleString('vi-VN')} ₫</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Tỷ lệ trên tổng cổ phần đã ghi sổ</span><span style={{ color: '#009688', fontSize: 14 }}>{selected.ownershipPercentage}%</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Giá trị vốn góp</span><span style={{ fontSize: 15 }}>{selected.capitalValue.toLocaleString('vi-VN')} ₫</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Ngày ghi sổ</span><span>{selected.joinDate}</span></div>
            </div>
            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688', alignSelf: 'flex-start' }}
              icon={<PrinterOutlined />}
              onClick={() => exportRecordToPdf(`Trich_so_co_dong_${selected.shareholderCode}`, `BAN TRICH SO DANG KY CO DONG ${selected.shareholderCode}`, [
                ['Cổ đông', selected.fullName], ['Số định danh', selected.idNumber], ['Địa chỉ', selected.address], ['Loại cổ đông', selected.type],
                ['Số cổ phần', selected.sharesCount], ['Mệnh giá', selected.parValue], ['Tỷ lệ trên tổng cổ phần đã ghi sổ', `${selected.ownershipPercentage}%`],
                ['Giá trị vốn góp', selected.capitalValue], ['Ngày ghi sổ', selected.joinDate], ['Số sổ hoặc số cổ phiếu', selected.certificateNumber],
              ])}
            >
              In bản trích sổ đăng ký
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};
