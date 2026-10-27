import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  BookOutlined,
  FileSyncOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag } from '../../custom-ui';
import { collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { buildQuarterClosingLines, calculateQuarterLedger, summarizeLedgerAccounts } from './ledgerCalculations';

interface LedgerEntry {
  key: string;
  voucherCode: string;
  entryDate: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  author: string;
  status: 'Đã ghi sổ cái' | 'Chờ duyệt kế toán trưởng';
  sourceReference?: string;
  sourceModule?: string;
}

const INITIAL_ENTRIES: LedgerEntry[] = [];

export const GeneralLedgerModule: React.FC<{ subType?: string }> = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isStatements = currentPath === '/finance/general/statements';
  const isProfitLoss = currentPath === '/finance/general/profit-loss';
  const isAdvance = currentPath === '/finance/general/advance';

  const [data, setData] = useState<LedgerEntry[]>(INITIAL_ENTRIES);
  const [advanceData, setAdvanceData] = useState<any[]>([]);
  const [selectedQuarter, setSelectedQuarter] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-Q${Math.floor(today.getMonth() / 3) + 1}`;
  });

  useEffect(() => {
    const list = dataService.getGenericData('finance_general_ledger');
    setData(Array.isArray(list) ? list : []);
    const advances = dataService.getGenericData('finance_advances');
    setAdvanceData(Array.isArray(advances) ? advances : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_general_ledger');
      setData(Array.isArray(updated) ? updated : []);
      const nextAdvances = dataService.getGenericData('finance_advances');
      setAdvanceData(Array.isArray(nextAdvances) ? nextAdvances : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);
  const totalDebits = data.filter((item) => item.debitAccount).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalCredits = data.filter((item) => item.creditAccount).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const balancedLedger = data.every((item) => Boolean(item.debitAccount && item.creditAccount) && Number.isFinite(Number(item.amount)) && Number(item.amount) > 0)
    && Math.abs(totalDebits - totalCredits) < 0.5;
  const accountSummary = summarizeLedgerAccounts(data);
  const quarterSummary = calculateQuarterLedger(data, selectedQuarter);
  const { year: yearText, quarter: quarterText, startMonth: quarterStartMonth, records: quarterLedgerData, revenue, expenses, netResult } = quarterSummary;
  const quarterDebits = quarterSummary.debits;
  const quarterCredits = quarterSummary.credits;
  const quarterClosed = data.some((item) => item.sourceReference === `period-close:${selectedQuarter}`);

  const quarterOptions = Array.from({ length: 8 }, (_, index) => {
    const year = new Date().getFullYear() - Math.floor((7 - index) / 4);
    const quarter = ((7 - index) % 4) + 1;
    return { label: `Quý ${quarter}/${year}`, value: `${year}-Q${quarter}` };
  });

  const handleCreate = async (values: any) => {
    const amount = Number(values.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      message.error('Số tiền hạch toán phải lớn hơn 0.');
      return;
    }
    if (data.some((record) => record.voucherCode === String(values.voucherCode).trim())) {
      message.error('Số chứng từ này đã tồn tại trong Sổ Cái.');
      return;
    }
    let author = 'Người dùng hiện tại';
    try {
      const user = JSON.parse(localStorage.getItem('minepanel_user') || 'null');
      author = user?.name || user?.fullName || user?.email || author;
    } catch { /* Keep a non-identifying fallback if the local identity cache is invalid. */ }
    const newItem: LedgerEntry = {
      ...values,
      key: crypto.randomUUID(),
      amount,
      author,
      status: 'Đã ghi sổ cái',
    };
    try {
      await collectionsApi.create('finance_general_ledger', newItem);
      await dataService.refreshGenericData('finance_general_ledger');
      message.success(`Đã hạch toán chứng từ: ${values.voucherCode}`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu chứng từ vào Sổ Cái.');
    }
  };

  const exportLedger = () => {
    const rows = [
      ['Số chứng từ', 'Ngày hạch toán', 'Diễn giải', 'Tài khoản Nợ', 'Tài khoản Có', 'Số tiền', 'Người ghi sổ', 'Trạng thái'],
      ...filteredData.map((item) => [item.voucherCode, item.entryDate, item.description, item.debitAccount, item.creditAccount, item.amount, item.author, item.status]),
    ];
    downloadFile('so_cai.xlsx', generateValidXlsxBlob(rows));
    message.success(`Đã xuất ${filteredData.length} chứng từ Sổ Cái.`);
  };

  const exportStatement = () => {
    const rows = [
      ['Tài khoản', 'Phát sinh Nợ', 'Phát sinh Có', 'Chênh lệch Nợ - Có'],
      ...accountSummary.map((item) => [item.account, item.debit, item.credit, item.debit - item.credit]),
    ];
    downloadFile('bao_cao_phat_sinh_so_cai.xlsx', generateValidXlsxBlob(rows));
    message.success(`Đã xuất báo cáo từ ${data.length} bút toán hiện có.`);
  };

  const exportAccountReport = (account: string) => {
    const entries = data.filter((item) => item.debitAccount === account || item.creditAccount === account);
    const lines = entries.map((item) => `${item.entryDate} | ${item.voucherCode} | ${item.description} | No ${item.debitAccount} | Co ${item.creditAccount} | ${Number(item.amount).toLocaleString('vi-VN')} VND`);
    downloadFile(`bao_cao_${account.replace(/[^a-z0-9]+/gi, '_')}.pdf`, generateValidPdfBlob(`BAO CAO ${account}`, 'Phat sinh tu cac but toan da luu trong So Cai', lines));
  };

  const exportFinancialReport = (code: string) => {
    const cashMovements = accountSummary.filter((item) => /(?:TK\s*)?11[12]/i.test(item.account));
    const reportLines = code === 'B01 - DN'
      ? [`Tổng tài khoản có phát sinh: ${accountSummary.length}`, `Tổng phát sinh Nợ: ${totalDebits.toLocaleString('vi-VN')} VND`, `Tổng phát sinh Có: ${totalCredits.toLocaleString('vi-VN')} VND`, ...accountSummary.map((item) => `${item.account}: No ${item.debit.toLocaleString('vi-VN')} VND / Co ${item.credit.toLocaleString('vi-VN')} VND`)]
      : code === 'B02 - DN'
      ? [`Kỳ: Quý ${quarterText}/${yearText}`, `Doanh thu tài khoản đầu 5, 7: ${revenue.toLocaleString('vi-VN')} VND`, `Chi phí tài khoản đầu 6, 8: ${expenses.toLocaleString('vi-VN')} VND`, `Kết quả sơ bộ: ${netResult.toLocaleString('vi-VN')} VND`, `Số bút toán: ${quarterLedgerData.length}`]
      : code === 'B03 - DN'
      ? cashMovements.map((item) => `${item.account}: No ${item.debit.toLocaleString('vi-VN')} VND / Co ${item.credit.toLocaleString('vi-VN')} VND`)
      : data.map((item) => `${item.entryDate} | ${item.voucherCode} | ${item.description} | No ${item.debitAccount} | Co ${item.creditAccount} | ${Number(item.amount).toLocaleString('vi-VN')} VND`);
    downloadFile(`bao_cao_${code.replace(/[^a-z0-9]+/gi, '_')}.pdf`, generateValidPdfBlob(code, `Du lieu Sổ Cai ${code === 'B02 - DN' ? `quy ${quarterText}/${yearText}` : 'hien co'}`, reportLines.length ? reportLines : ['Chua co but toan phat sinh.']));
  };

  const closeQuarter = () => {
    if (quarterClosed) {
      message.warning(`Quý ${quarterText}/${yearText} đã có bút toán kết chuyển.`);
      return;
    }
    if (quarterLedgerData.length === 0) {
      message.warning(`Quý ${quarterText}/${yearText} chưa có bút toán đã ghi sổ để kết chuyển.`);
      return;
    }
    const sourceReference = `period-close:${selectedQuarter}`;
    const quarterEnd = new Date(Number(yearText), quarterStartMonth + 2, 0);
    const closingDate = `${yearText}-${String(quarterEnd.getMonth() + 1).padStart(2, '0')}-${String(quarterEnd.getDate()).padStart(2, '0')}`;
    const lines = buildQuarterClosingLines(quarterSummary);
    if (lines.length === 0) {
      message.warning('Không có phát sinh doanh thu hoặc chi phí đủ điều kiện kết chuyển trong quý này.');
      return;
    }
    Modal.confirm({
      title: `Ghi bút toán kết chuyển quý ${quarterText}/${yearText}?`,
      content: `Sẽ tạo ${lines.length} bút toán dựa trên Sổ Cái đang lưu. Hãy đối chiếu báo cáo trước khi xác nhận.`,
      okText: 'Ghi kết chuyển',
      cancelText: 'Hủy',
      onOk: async () => {
        const createdKeys: string[] = [];
        try {
          const current = await dataService.refreshGenericData('finance_general_ledger');
          if (current.some((entry: any) => entry.sourceReference === sourceReference)) {
            message.warning(`Quý ${quarterText}/${yearText} đã có bút toán kết chuyển.`);
            return;
          }
          let author = 'Người dùng hiện tại';
          try {
            const user = JSON.parse(localStorage.getItem('minepanel_user') || 'null');
            author = user?.name || user?.fullName || user?.email || author;
          } catch { /* Use the generic signed-in label when cached identity data is malformed. */ }
          for (const [index, line] of lines.entries()) {
            const key = `closing:${selectedQuarter}:${index + 1}`;
            await collectionsApi.create('finance_general_ledger', {
              key,
              voucherCode: `KC-${selectedQuarter.replace('-', '')}-${index + 1}`,
              entryDate: closingDate,
              ...line,
              author,
              status: 'Đã ghi sổ cái',
              sourceModule: 'general_ledger_close',
              sourceReference,
            });
            createdKeys.push(key);
          }
          await dataService.refreshGenericData('finance_general_ledger');
          message.success(`Đã ghi ${createdKeys.length} bút toán kết chuyển quý ${quarterText}/${yearText}.`);
        } catch (error: any) {
          const rollback = await Promise.allSettled(createdKeys.map((key) => collectionsApi.remove('finance_general_ledger', key)));
          const rollbackFailed = rollback.some((result) => result.status === 'rejected');
          if (!rollbackFailed && createdKeys.length > 0) await dataService.refreshGenericData('finance_general_ledger').catch(() => {});
          message.error(rollbackFailed
            ? 'Kết chuyển gặp lỗi và chưa thể hoàn tác toàn bộ. Cần đối chiếu Sổ Cái trước khi chạy lại.'
            : error?.response?.data?.message || 'Không thể ghi bút toán kết chuyển.');
        }
      },
    });
  };

  const filteredData = data.filter(
    (item) =>
      (item.voucherCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.debitAccount || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.creditAccount || '').toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giá trị phát sinh trong Sổ Cái</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalAmount.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số bút toán đã ghi Sổ Cái</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.filter((d) => d.status === 'Đã ghi sổ cái').length} bút toán
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đối chiếu phát sinh Nợ - Có</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {balancedLedger ? 'Đang khớp' : 'Cần kiểm tra'}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Nợ {totalDebits.toLocaleString('vi-VN')} ₫ · Có {totalCredits.toLocaleString('vi-VN')} ₫
          </div>
        </div>
      </div>

      {/* VIEW: STATEMENTS */}
      {isStatements && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Bộ Báo Cáo Tài Chính Tổng Hợp</h3>
            <Button type="primary" icon={<DownloadOutlined />} onClick={exportStatement} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xuất Bộ BCTC
            </Button>
          </div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Các số liệu được tổng hợp từ bút toán Sổ Cái hiện có; cần đối chiếu số dư đầu kỳ trước khi phát hành.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {[
              { code: 'B01 - DN', name: 'Bảng Cân Đối Kế Toán', value: `${accountSummary.length} tài khoản · Nợ ${totalDebits.toLocaleString('vi-VN')} ₫ · Có ${totalCredits.toLocaleString('vi-VN')} ₫`, status: data.length ? 'Có dữ liệu Sổ Cái' : 'Chưa có dữ liệu' },
              { code: 'B02 - DN', name: 'Báo Cáo Kết Quả Hoạt Động KD', value: `Quý ${quarterText}/${yearText} · Kết quả sơ bộ ${netResult.toLocaleString('vi-VN')} ₫`, status: quarterLedgerData.length ? 'Từ bút toán đã ghi sổ' : 'Chưa có dữ liệu kỳ này' },
              { code: 'B03 - DN', name: 'Báo Cáo Lưu Chuyển Tiền Tệ', value: `Có ${accountSummary.filter((item) => /(?:TK\s*)?11[12]/i.test(item.account)).length} tài khoản tiền có phát sinh`, status: 'Tài khoản 111/112' },
              { code: 'B09 - DN', name: 'Bản Thuyết Minh BCTC', value: `${data.length} bút toán · ${accountSummary.length} tài khoản`, status: data.length ? 'Từ dữ liệu hiện có' : 'Chưa có dữ liệu' },
            ].map((st) => (
              <Card key={st.code} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ color: '#009688', fontSize: 14 }}>{st.code}</strong>
                  <Tag color={data.length ? 'processing' : 'warning'}>{st.status}</Tag>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', marginBottom: 8 }}>{st.name}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>{st.value}</div>
                <Button size="small" icon={<FilePdfOutlined />} onClick={() => exportFinancialReport(st.code)}>Tải PDF báo cáo</Button>
              </Card>
            ))}
          </div>
          <div className="transparent-table-card">
            <KTable dataSource={accountSummary} columns={[
              { title: 'Tài khoản', dataIndex: 'account', key: 'account' },
              { title: 'Phát sinh Nợ', dataIndex: 'debit', key: 'debit', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
              { title: 'Phát sinh Có', dataIndex: 'credit', key: 'credit', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
              { title: 'Chênh lệch Nợ - Có', key: 'balance', render: (_: any, record: { debit: number; credit: number }) => `${(record.debit - record.credit).toLocaleString('vi-VN')} ₫` },
              { title: 'Thao tác', key: 'action', render: (_: any, record: { account: string }) => <Button size="small" onClick={() => exportAccountReport(record.account)}>Tải sổ tài khoản</Button> },
            ]} />
          </div>
        </div>
      )}

      {/* VIEW: PROFIT-LOSS */}
      {isProfitLoss && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 840 }}>
          <Card title="Kết quả kinh doanh từ Sổ Cái" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#64748B' }}>Kỳ kết chuyển:</span>
              <Select value={selectedQuarter} onChange={setSelectedQuarter} options={quarterOptions} style={{ width: 170 }} />
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Chỉ tính bút toán đã ghi sổ trong quý đã chọn.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {[
                { step: `Doanh thu tài khoản đầu 5 và 7`, amount: revenue },
                { step: `Chi phí tài khoản đầu 6 và 8`, amount: expenses },
                { step: `Kết quả sơ bộ quý ${quarterText}/${yearText}`, amount: netResult },
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                  <strong style={{ fontSize: 13, color: '#0F172A' }}>{item.step}</strong>
                  <strong style={{ color: '#009688', fontSize: 13.5 }}>{item.amount.toLocaleString('vi-VN')} ₫</strong>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={() => message.info(`${quarterLedgerData.length} bút toán · Phát sinh Nợ ${quarterDebits.toLocaleString('vi-VN')} ₫ · Phát sinh Có ${quarterCredits.toLocaleString('vi-VN')} ₫`)}>Kiểm tra số dư</Button>
              <Button type="primary" icon={<FileSyncOutlined />} onClick={closeQuarter} disabled={quarterLedgerData.length === 0 || quarterClosed} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                {quarterClosed ? 'Đã kết chuyển' : 'Chạy Kết Chuyển Tự Động'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* VIEW: ADVANCE */}
      {isAdvance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Tạm ứng nhân viên</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/admin/finance/advances')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Quản lý tạm ứng
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={advanceData}
              columns={[
                { title: 'Mã phiếu', dataIndex: 'code', key: 'code' },
                { title: 'Nhân viên', dataIndex: 'employeeName', key: 'employeeName', render: (name: string) => <strong>{name || 'Chưa có dữ liệu'}</strong> },
                { title: 'Mục đích', dataIndex: 'purpose', key: 'purpose' },
                { title: 'Số tiền tạm ứng', dataIndex: 'advancedAmount', key: 'advancedAmount', render: (v: number) => `${Number(v || 0).toLocaleString('vi-VN')} ₫` },
                { title: 'Số thực chi', dataIndex: 'spentAmount', key: 'spentAmount', render: (v: number) => <strong style={{ color: '#0F172A' }}>{Number(v || 0).toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Chênh lệch', dataIndex: 'balance', key: 'balance', render: (v: number) => <span style={{ color: Number(v) >= 0 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>{Number(v || 0).toLocaleString('vi-VN')} ₫</span> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s.includes('Đã') ? 'success' : 'warning'}>{s}</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEFAULT */}
      {!isStatements && !isProfitLoss && !isAdvance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo số chứng từ, nội dung hạch toán, tài khoản..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 360, borderRadius: 6 }}
              allowClear
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={exportLedger}>
                Xuất Sổ Cái
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();
                  setModalOpen(true);
                }}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Hạch toán chứng từ mới
              </Button>
            </div>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                {
                  title: 'Số chứng từ',
                  dataIndex: 'voucherCode',
                  key: 'voucherCode',
                  render: (code: string) => (
                    <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BookOutlined /> {code}
                    </span>
                  ),
                },
                {
                  title: 'Ngày hạch toán',
                  dataIndex: 'entryDate',
                  key: 'entryDate',
                },
                {
                  title: 'Diễn giải nội dung nghiệp vụ',
                  dataIndex: 'description',
                  key: 'description',
                  render: (d: string) => <span style={{ fontWeight: 500, color: '#1E293B' }}>{d}</span>,
                },
                {
                  title: 'Định khoản Nợ ➔ Có',
                  key: 'acc',
                  render: (_: any, r: LedgerEntry) => (
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: '#16A34A', fontWeight: 600 }}>Nợ: {r.debitAccount}</div>
                      <div style={{ color: '#2563EB', fontWeight: 600 }}>Có: {r.creditAccount}</div>
                    </div>
                  ),
                },
                {
                  title: 'Số tiền phát sinh',
                  dataIndex: 'amount',
                  key: 'amount',
                  render: (v: number) => <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{v.toLocaleString('vi-VN')} ₫</strong>,
                },
                {
                  title: 'Trạng thái ghi sổ',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => <Tag color={status.includes('Đã ghi') ? 'success' : 'warning'}>{status}</Tag>,
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Modal Add Entry */}
      <Modal
        title="Hạch toán chứng từ nghiệp vụ khác"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="voucherCode" label="Số chứng từ" initialValue={`PKT-${new Date().getFullYear()}-${String(data.length + 1).padStart(4, '0')}`} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="entryDate" label="Ngày hạch toán" initialValue={new Date().toISOString().substring(0, 10)} rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="Nội dung diễn giải" rules={[{ required: true, message: 'Nhập diễn giải' }]}>
            <Input.TextArea rows={2} placeholder="Ví dụ: Phân bổ chi phí thuê văn phòng tháng 8" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="debitAccount" label="Tài khoản Nợ" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: TK 642" />
            </Form.Item>
            <Form.Item name="creditAccount" label="Tài khoản Có" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: TK 242" />
            </Form.Item>
          </div>
          <Form.Item name="amount" label="Số tiền hạch toán (VNĐ)" rules={[{ required: true }]}>
            <Input type="number" min={1} step={1} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ghi sổ cái
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
