import React, { useEffect, useRef, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  SwapOutlined,
  BankOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  EyeOutlined,
  AuditOutlined,
  PrinterOutlined,
  DollarOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';
import { financeTransfersApi, type FinanceInternalTransfer, type FinanceTransferAccount } from '../../api/endpoints';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';

export type EnterpriseInternalTransferRecord = FinanceInternalTransfer;

const INITIAL_TRANSFERS: EnterpriseInternalTransferRecord[] = [];

export const InternalTransferModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseInternalTransferRecord[]>(INITIAL_TRANSFERS);
  const [accounts, setAccounts] = useState<FinanceTransferAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const requestId = useRef('');
  const pending = useRef(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await financeTransfersApi.getAll();
      setData(response.data.data);
      setAccounts(response.data.accounts);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được sổ điều chuyển nội bộ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<EnterpriseInternalTransferRecord | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const totalTransferred = data.filter((d) => d.ledgerRecorded && d.status === 'Thành công').reduce((sum, item) => sum + item.amount, 0);
  const totalFees = data.filter(d => d.ledgerRecorded && d.status !== 'Đã hủy').reduce((sum, item) => sum + item.fee, 0);
  const pendingCount = data.filter((d) => d.status === 'Đang chuyển').length;

  const handleCreate = async (values: any) => {
    if (pending.current) return;
    if (values.sourceAccount === values.destinationAccount) {
      message.error('Tài khoản nguồn và tài khoản đích không được trùng nhau!');
      return;
    }
    const amount = Number(values.amount);
    const fee = Number(values.fee || 0);
    if (!Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(fee) || fee < 0) {
      message.error('Số tiền phải là số nguyên dương và phí phải là số nguyên không âm.');
      return;
    }
    pending.current = true;
    setSaving(true);
    try {
      requestId.current ||= crypto.randomUUID();
      const response = await financeTransfersApi.create({
        requestId: requestId.current,
        sourceAccountId: values.sourceAccount,
        destinationAccountId: values.destinationAccount,
        amount, fee,
        transferDate: values.transferDate,
        transferMethod: values.transferMethod,
        purpose: values.purpose,
      });
      message.success(`Đã ghi sổ điều chuyển nội bộ: ${response.data.transfer.transferCode}`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể ghi sổ điều chuyển.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedTransfer || pending.current) return;
    if (!cancelReason.trim()) { message.error('Vui lòng nhập lý do hủy.'); return; }
    pending.current = true;
    setSaving(true);
    try {
      const response = await financeTransfersApi.cancel(selectedTransfer.key, cancelReason);
      setSelectedTransfer(response.data.transfer);
      setCancelModalOpen(false);
      await loadData();
      message.success('Đã hủy đồng thời các chứng từ của lệnh điều chuyển.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể hủy lệnh điều chuyển.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  const handlePrint = () => {
    if (!selectedTransfer) return;
    const popup = window.open('', '_blank');
    if (!popup) { message.error('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép mở cửa sổ.'); return; }
    popup.document.write('<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>Phiếu điều chuyển nội bộ</title><style>@page{size:A5;margin:12mm}body{font-family:Arial,sans-serif;font-size:12px;line-height:1.6}h1{font-size:18px}</style></head><body></body></html>');
    const heading = popup.document.createElement('h1');
    heading.textContent = 'PHIẾU GHI SỔ ĐIỀU CHUYỂN NỘI BỘ';
    popup.document.body.appendChild(heading);
    for (const text of [
      `Mã: ${selectedTransfer.transferCode}`, `Ngày: ${selectedTransfer.transferDate} ${selectedTransfer.time || ''}`,
      `Nguồn: ${selectedTransfer.sourceAccount}`, `Đích: ${selectedTransfer.destinationAccount}`,
      `Số tiền: ${selectedTransfer.amount.toLocaleString('vi-VN')} ₫; Phí thực tế: ${(selectedTransfer.fee || 0).toLocaleString('vi-VN')} ₫`,
      `Nội dung: ${selectedTransfer.purpose}`, `Người ghi sổ: ${selectedTransfer.executor || 'Chưa xác minh'}`,
      `Trạng thái: ${selectedTransfer.status === 'Đã hủy' ? 'Đã hủy' : selectedTransfer.ledgerRecorded ? 'Đã ghi sổ nội bộ' : 'Lệnh cũ chưa đối chiếu'}`,
      ...(selectedTransfer.canceledAt ? [`Người hủy: ${selectedTransfer.canceledBy}; ${selectedTransfer.canceledAt}`, `Lý do: ${selectedTransfer.cancelReason}`] : []),
      'Phiếu ghi nhận sổ quỹ nội bộ. Xác nhận giao dịch ngân hàng cần đối chiếu chứng từ ngân hàng.',
    ]) {
      const paragraph = popup.document.createElement('p');
      paragraph.textContent = text;
      popup.document.body.appendChild(paragraph);
    }
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.transferCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.sourceAccount || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.destinationAccount || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.purpose || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã lệnh & Thời gian',
      key: 'transferCode',
      render: (_: any, record: EnterpriseInternalTransferRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SwapOutlined /> {record.transferCode}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            {record.transferDate} ({record.time}) · {record.transferMethod}
          </div>
        </div>
      ),
    },
    {
      title: 'Tài khoản nguồn (Xuất) ➔ Tài khoản đích (Nhận)',
      key: 'accounts',
      render: (_: any, record: EnterpriseInternalTransferRecord) => (
        <div>
          <div style={{ fontWeight: 600, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <BankOutlined /> {record.sourceAccount}
          </div>
          <div style={{ fontWeight: 600, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginTop: 4 }}>
            <ArrowRightOutlined style={{ color: '#64748B', fontSize: 11 }} /> {record.destinationAccount}
          </div>
        </div>
      ),
    },
    {
      title: 'Số tiền chuyển (VNĐ)',
      dataIndex: 'amount',
      key: 'amount',
      width: 180,
      render: (v: number, record: EnterpriseInternalTransferRecord) => (
        <div>
          <strong style={{ fontWeight: 800, color: '#0F172A', fontSize: 14 }}>
            {v.toLocaleString('vi-VN')} ₫
          </strong>
          {record.fee > 0 && <div style={{ fontSize: 11, color: '#64748B' }}>Phí: {record.fee.toLocaleString()} ₫</div>}
        </div>
      ),
      sorter: (a: EnterpriseInternalTransferRecord, b: EnterpriseInternalTransferRecord) => a.amount - b.amount,
    },
    {
      title: 'Nội dung điều chuyển',
      dataIndex: 'purpose',
      key: 'purpose',
      render: (p: string) => <span style={{ color: '#334155', fontSize: 12.5 }}>{p}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (st: string, record: EnterpriseInternalTransferRecord) => {
        let color = 'default';
        if (st === 'Thành công') color = 'success';
        if (st === 'Đang chuyển') color = 'processing';
        if (st === 'Đã hủy') color = 'error';
        return <Tag color={color}>{st === 'Đã hủy' ? st : record.ledgerRecorded ? 'Đã ghi sổ nội bộ' : 'Chưa đối chiếu sổ quỹ'}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseInternalTransferRecord) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedTransfer(record);
            setDrawerOpen(true);
          }}
        >
          Lệnh UNC
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng luân chuyển vốn đã ghi sổ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalTransferred.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Cân đối thanh khoản giữa các quỹ &amp; ngân hàng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số lệnh chuyển tiền hoàn tất</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.filter((d) => d.ledgerRecorded && d.status === 'Thành công').length} Lệnh giao dịch
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Có chứng từ thu và chi liên kết trong sổ quỹ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lệnh đang điều chuyển (Napas/Két)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: pendingCount > 0 ? '#D97706' : '#64748B', marginTop: 4 }}>
            {pendingCount} Giao dịch
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Lệnh cũ cần đối chiếu chứng từ thực tế</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chi phí phí chuyển tiền phát sinh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalFees.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Phí thực tế do người lập ghi nhận</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả lệnh chuyển' },
            { key: 'Thành công', label: 'Thành công', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Đang chuyển', label: 'Đang điều chuyển', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
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
            placeholder="Tìm theo mã lệnh, tài khoản nguồn/đích, nội dung..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('So_dieu_chuyen_noi_bo.xlsx', generateValidXlsxBlob([
            ['Mã lệnh', 'Ngày', 'Tài khoản nguồn', 'Tài khoản đích', 'Số tiền (VNĐ)', 'Phí thực tế (VNĐ)', 'Nội dung', 'Người lập', 'Trạng thái'],
            ...filteredData.map(item => [item.transferCode, item.transferDate, item.sourceAccount, item.destinationAccount, item.amount, item.fee || 0, item.purpose, item.executor || '', item.status === 'Đã hủy' ? 'Đã hủy' : item.ledgerRecorded ? 'Đã ghi sổ nội bộ' : 'Chưa đối chiếu sổ quỹ']),
          ]))}>
            Xuất Sao Kê
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              requestId.current = crypto.randomUUID();
              const active = accounts.filter(account => account.status === 'Đang hoạt động');
              form.setFieldsValue({
                sourceAccount: active[0]?.key,
                destinationAccount: active[1]?.key,
                transferMethod: 'Ghi sổ nội bộ',
                fee: 0,
                transferDate: new Date().toISOString().substring(0, 10),
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập lệnh chuyển tiền
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} loading={loading} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Lập Lệnh Chuyển Tiền Nội Bộ */}
      <Modal
        title="Lập Lệnh Chuyển Tiền &amp; Điều Phối Vốn Nội Bộ"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <p>Ghi nhận điều chuyển vào sổ quỹ sau khi giao dịch thực tế đã được thực hiện. Chọn tài khoản hoặc quỹ đang hoạt động.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="sourceAccount" label="Tài khoản nguồn (Xuất tiền)" rules={[{ required: true }]}>
              <Select
                options={accounts.filter(account => account.status === 'Đang hoạt động').map(account => ({ label: `${account.name} — ${account.balance.toLocaleString('vi-VN')} ₫`, value: account.key }))}
              />
            </Form.Item>
            <Form.Item name="destinationAccount" label="Tài khoản đích (Nhận tiền)" rules={[{ required: true }]}>
              <Select
                options={accounts.filter(account => account.status === 'Đang hoạt động').map(account => ({ label: `${account.name} — ${account.balance.toLocaleString('vi-VN')} ₫`, value: account.key }))}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="amount" label="Số tiền điều chuyển (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={1} step={1} />
            </Form.Item>
            <Form.Item name="transferMethod" label="Phương thức chuyển tiền" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Ghi sổ điều chuyển nội bộ', value: 'Ghi sổ nội bộ' },
                  { label: 'Napas 247 (Tức thì)', value: 'Napas 247' },
                  { label: 'CITAD Liên Ngân Hàng', value: 'CITAD Liên Ngân Hàng' },
                  { label: 'Rút séc / Nộp tiền mặt két', value: 'Rút séc / Nộp tiền mặt két' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="fee" label="Phí giao dịch thực tế (VNĐ)">
            <Input type="number" min={0} step={1} />
          </Form.Item>

          <Form.Item name="purpose" label="Mục đích điều chuyển vốn chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Ví dụ: Cân đối số dư thanh toán hợp đồng IDC hoặc Bổ sung quỹ két..." />
          </Form.Item>

          <Form.Item name="transferDate" label="Ngày thực hiện giao dịch" rules={[{ required: true }]}>
            <Input type="date" max={new Date().toISOString().slice(0, 10)} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận ghi sổ điều chuyển
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Lệnh Chuyển & Định Khoản Nợ/Có */}
      <Drawer
        title="Lệnh Điều Chuyển Vốn Nội Bộ &amp; Hạch Toán"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedTransfer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ LỆNH: {selectedTransfer.transferCode}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedTransfer.amount.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <Tag color={selectedTransfer.status === 'Thành công' ? 'success' : 'processing'}>
                  {selectedTransfer.status === 'Đã hủy' ? 'Đã hủy' : selectedTransfer.ledgerRecorded ? 'Đã ghi sổ nội bộ' : 'Chưa đối chiếu sổ quỹ'}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedTransfer.transferMethod} · Thời gian: {selectedTransfer.transferDate} {selectedTransfer.time}
              </div>
            </div>

            {/* Account Flow */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Tuyến Điều Phối Dòng Tiền:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ background: '#FEF2F2', padding: '10px 12px', borderRadius: 6, border: '1px solid #FECACA' }}>
                  <div style={{ fontSize: 11, color: '#991B1B', fontWeight: 700 }}>TÀI KHOẢN NGUỒN (XUẤT TIỀN):</div>
                  <strong style={{ color: '#DC2626' }}>{selectedTransfer.sourceAccount}</strong>
                </div>
                <div style={{ background: '#F0FDF4', padding: '10px 12px', borderRadius: 6, border: '1px solid #BBF7D0' }}>
                  <div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>TÀI KHOẢN ĐÍCH (NHẬN TIỀN):</div>
                  <strong style={{ color: '#16A34A' }}>{selectedTransfer.destinationAccount}</strong>
                </div>
                <div style={{ marginTop: 6, color: '#475569' }}>
                  Lý do: <em>"{selectedTransfer.purpose}"</em>
                </div>
              </div>
            </div>

            {/* Accounting Debit / Credit */}
            <div style={{ border: '1px solid #BFDBFE', borderRadius: 8, padding: 14, background: '#EFF6FF' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AuditOutlined /> Đối ứng sổ quỹ nội bộ:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                <div><strong>Thu vào tài khoản đích</strong>: {selectedTransfer.amount.toLocaleString('vi-VN')} ₫</div>
                <div><strong>Chi từ tài khoản nguồn</strong>: {selectedTransfer.amount.toLocaleString('vi-VN')} ₫</div>
                {selectedTransfer.fee > 0 && <div><strong>Chi phí thực tế từ nguồn</strong>: {selectedTransfer.fee.toLocaleString()} ₫</div>}
                <div>{selectedTransfer.ledgerRecorded ? 'Chứng từ liên kết đã lưu trong sổ quỹ.' : 'Lệnh cũ chưa có chứng từ liên kết để đối chiếu.'}</div>
              </div>
            </div>

            {/* Signatures */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'center', fontSize: 12, padding: 12, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div>
                <strong>Người Lập Biểu</strong>
                <div style={{ color: '#16A34A', fontWeight: 600, marginTop: 12 }}>Đã lập lệnh</div>
                <div style={{ color: '#64748B', marginTop: 2 }}>{selectedTransfer.executor}</div>
              </div>
              <div>
                <strong>Xác nhận ngân hàng / phê duyệt</strong>
                <div style={{ color: '#64748B', fontWeight: 600, marginTop: 12 }}>Cần đối chiếu chứng từ thực tế</div>
                <div style={{ color: '#64748B', marginTop: 2 }}>{selectedTransfer.ledgerRecorded ? 'Người ghi sổ được xác thực từ phiên đăng nhập.' : 'Thông tin người lập lệnh cũ chưa được xác minh.'}</div>
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              icon={<PrinterOutlined />}
              onClick={handlePrint}
            >
              In Phiếu Điều Chuyển Vốn (A5)
            </Button>
            {selectedTransfer.ledgerRecorded && selectedTransfer.status !== 'Đã hủy' && (
              <Button danger onClick={() => { setCancelReason(''); setCancelModalOpen(true); }}>Hủy lệnh và hoàn lại số dư sổ quỹ</Button>
            )}
            {selectedTransfer.canceledAt && <p>Đã hủy bởi {selectedTransfer.canceledBy} lúc {selectedTransfer.canceledAt}. Lý do: {selectedTransfer.cancelReason}</p>}
          </div>
        )}
      </Drawer>
      <Modal title="Hủy lệnh điều chuyển nội bộ" open={cancelModalOpen} onCancel={() => setCancelModalOpen(false)} footer={null}>
        <p>Hủy đồng thời chứng từ thu, chi và phí liên kết. Tài khoản đích phải đủ số dư để hoàn lại lệnh.</p>
        <Input.TextArea aria-label="Lý do hủy lệnh" value={cancelReason} onChange={event => setCancelReason(event.target.value)} rows={3} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button onClick={() => setCancelModalOpen(false)}>Đóng</Button>
          <Button danger loading={saving} onClick={handleCancel}>Xác nhận hủy lệnh</Button>
        </div>
      </Modal>
    </div>
  );
};

