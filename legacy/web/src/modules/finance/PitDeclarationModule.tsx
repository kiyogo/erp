import React, { useEffect, useState } from 'react';
import { DownloadOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Alert, Button, Select, Tag, message } from '../../custom-ui';
import { pitDeclarationApi, type PitDeclaration } from '../../api/endpoints';
import { exportRowsToXlsx } from '../../utils/fileExporter';

const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} ₫`;
const now = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const currentYear = Number(now.slice(0, 4));
// Kỳ kê khai: 12 tháng và 4 quý của năm nay và năm trước.
const PERIOD_OPTIONS = [currentYear, currentYear - 1].flatMap((year) => [
  ...[4, 3, 2, 1].map((quarter) => ({ label: `Quý ${quarter}/${year}`, value: `${year}-Q${quarter}` })),
  ...Array.from({ length: 12 }, (_, index) => 12 - index).map((month) => ({ label: `Tháng ${month}/${year}`, value: `${year}-${String(month).padStart(2, '0')}` })),
]);
const COUNT_INDICATORS = new Set(['21', '22', '23', '24', '25']);
const ORDER = ['21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36'];

/** Tờ khai 05/KK-TNCN: chỉ tiêu tổng hợp từ phiếu lương đã chốt và sổ thu nhập vãng lai của kỳ, hạn nộp và bảng kê từng cá nhân. */
export const PitDeclarationModule: React.FC = () => {
  const [period, setPeriod] = useState(now);
  const [data, setData] = useState<PitDeclaration | null>(null);

  useEffect(() => {
    pitDeclarationApi.get(period).then(({ data: response }) => setData(response)).catch((error) => {
      setData(null);
      message.error(error?.response?.data?.message || 'Không lập được tờ khai.');
    });
  }, [period]);

  const indicatorRows = data ? ORDER.map((code) => ({ code, label: data.labels[code], value: data.indicators[code] ?? 0 })) : [];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Select value={period} options={PERIOD_OPTIONS} onChange={(value) => setPeriod(String(value))} style={{ width: 180 }} showSearch />
          {data && <Tag color={data.mustFile ? 'warning' : 'default'}>{data.mustFile ? `Phải khai và nộp chậm nhất ${data.deadline}` : 'Không phát sinh khấu trừ: không phải khai kỳ này'}</Tag>}
        </div>
        <Button icon={<DownloadOutlined />} disabled={!data} onClick={() => {
          if (!data) return;
          exportRowsToXlsx(`To_khai_05KK_${data.period}`, [{ title: 'Chỉ tiêu', dataIndex: 'code' }, { title: 'Nội dung', dataIndex: 'label' }, { title: 'Giá trị', dataIndex: 'value' }], indicatorRows.map((row) => ({ ...row, code: `[${row.code}]` })));
          exportRowsToXlsx(`Bang_ke_05KK_${data.period}`, [
            { title: 'Họ tên', dataIndex: 'name' }, { title: 'Nguồn', dataIndex: 'sourceLabel' }, { title: 'Cư trú', dataIndex: 'residentLabel' }, { title: 'Số lần trả', dataIndex: 'payments' },
            { title: 'Thu nhập chịu thuế', dataIndex: 'taxable' }, { title: 'Thuế đã khấu trừ', dataIndex: 'tax' },
          ], data.rows.map((row) => ({ ...row, sourceLabel: row.source === 'casual' ? 'Thu nhập vãng lai' : 'Phiếu lương', residentLabel: row.resident ? 'Có' : 'Không' })));
          message.success('Đã xuất tờ khai và bảng kê.');
        }}>Xuất tờ khai</Button>
      </div>
      {data && <Alert type="info" showIcon message={`Kỳ ${data.filingMethod.toLowerCase()} ${data.period}: ${data.deadlineBasis}. Thu nhập chịu thuế là tổng thu nhập trừ phần miễn thuế, chưa trừ giảm trừ gia cảnh, bảo hiểm. Số chỉ tiêu theo mẫu 05/KK-TNCN Thông tư 80/2021, cần đối chiếu mẫu hiện hành trước khi nộp.`} />}
      <div className="transparent-table-card">
        <KTable dataSource={indicatorRows} rowKey="code" pagination={false} columns={[
          { title: 'Chỉ tiêu', dataIndex: 'code', key: 'code', width: 90, render: (code: string) => `[${code}]` },
          { title: 'Nội dung', dataIndex: 'label', key: 'label' },
          { title: 'Giá trị', dataIndex: 'value', key: 'value', width: 200, render: (value: number, row: { code: string }) => (COUNT_INDICATORS.has(row.code) ? `${value} người` : money(value)) },
        ]} />
      </div>
      <div style={{ color: '#0F172A' }}>Bảng kê từng cá nhân</div>
      <div className="transparent-table-card">
        <KTable dataSource={data?.rows || []} rowKey="key" pagination={{ pageSize: 10 }} columns={[
          { title: 'Họ tên', dataIndex: 'name', key: 'name' },
          { title: 'Nguồn', key: 'source', render: (_: unknown, row: PitDeclaration['rows'][number]) => (row.source === 'casual' ? 'Thu nhập vãng lai' : 'Phiếu lương') },
          { title: 'Cư trú', key: 'resident', render: (_: unknown, row: PitDeclaration['rows'][number]) => (row.resident ? 'Có' : 'Không') },
          { title: 'Số lần trả', dataIndex: 'payments', key: 'payments' },
          { title: 'Thu nhập chịu thuế', dataIndex: 'taxable', key: 'taxable', render: money },
          { title: 'Thuế đã khấu trừ', dataIndex: 'tax', key: 'tax', render: money },
        ]} />
      </div>
    </div>
  );
};
