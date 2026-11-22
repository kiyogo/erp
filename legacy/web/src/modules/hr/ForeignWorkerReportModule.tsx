import React, { useEffect, useState } from 'react';
import { DownloadOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Alert, Button, Select, Tag, message } from '../../custom-ui';
import { foreignWorkerReportApi, type ForeignWorkerReport } from '../../api/endpoints';
import { exportRowsToXlsx } from '../../utils/fileExporter';

const currentYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date()));
const PERIOD_OPTIONS = [currentYear, currentYear - 1].flatMap((year) => [{ label: `Năm ${year}`, value: String(year) }, { label: `6 tháng đầu năm ${year}`, value: `${year}-H1` }]);
const dateText = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '—');

/** Báo cáo tình hình sử dụng người lao động nước ngoài: danh sách người làm việc trong kỳ, giấy phép, hợp đồng, thống kê và việc cần xử lý. */
export const ForeignWorkerReportModule: React.FC = () => {
  const [period, setPeriod] = useState(String(currentYear));
  const [report, setReport] = useState<ForeignWorkerReport | null>(null);

  useEffect(() => {
    foreignWorkerReportApi.get(period).then(({ data }) => setReport(data)).catch((error) => {
      setReport(null);
      message.error(error?.response?.data?.message || 'Không lập được báo cáo.');
    });
  }, [period]);

  const summary = (title: string, items: Array<{ key: string; total: number }> = []) => (
    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px', fontSize: 12.5 }}>
      <div style={{ color: '#64748B', marginBottom: 6 }}>{title}</div>
      {items.length ? items.map((item) => <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{item.key}</span><span>{item.total} người</span></div>) : <div style={{ color: '#94A3B8' }}>Không có</div>}
    </div>
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Select value={period} options={PERIOD_OPTIONS} onChange={(value) => setPeriod(String(value))} style={{ width: 220 }} />
          {report && <Tag color="processing">{report.total} người nước ngoài · hạn báo cáo {dateText(report.deadline)}</Tag>}
        </div>
        <Button icon={<DownloadOutlined />} disabled={!report?.rows.length} onClick={() => {
          if (!report) return;
          const count = exportRowsToXlsx(`Bao_cao_lao_dong_nuoc_ngoai_${report.period}`, [
            { title: 'Họ tên', dataIndex: 'name' }, { title: 'Mã nhân viên', dataIndex: 'employeeCode' }, { title: 'Quốc tịch', dataIndex: 'nationality' }, { title: 'Số hộ chiếu', dataIndex: 'passportNumber' },
            { title: 'Vị trí công việc', dataIndex: 'jobCategory' }, { title: 'Chức danh', dataIndex: 'position' }, { title: 'Tình trạng giấy phép', dataIndex: 'permitStatus' },
            { title: 'Số giấy phép hoặc căn cứ miễn', dataIndex: 'workPermitNumber' }, { title: 'Ngày cấp', dataIndex: 'permitIssueDate' }, { title: 'Ngày hết hạn', dataIndex: 'permitExpiryDate' },
            { title: 'Thị thực', dataIndex: 'visa' }, { title: 'Thị thực hết hạn', dataIndex: 'visaExpiryDate' }, { title: 'Thẻ tạm trú', dataIndex: 'residenceCard' }, { title: 'Thẻ tạm trú hết hạn', dataIndex: 'residenceCardExpiryDate' },
            { title: 'Số hợp đồng', dataIndex: 'contractCode' }, { title: 'Hợp đồng từ', dataIndex: 'contractStart' }, { title: 'Hợp đồng đến', dataIndex: 'contractEnd' }, { title: 'Cần xử lý', dataIndex: 'issueText' },
          ], report.rows.map((row) => ({ ...row, issueText: row.issues.join('; ') })));
          message.success(`Đã xuất ${count} người.`);
        }}>Xuất báo cáo</Button>
      </div>
      <Alert type="info" showIcon message="Kỳ và hạn báo cáo (6 tháng trước 05/7, năm trước 05/01 năm sau) theo Nghị định 152/2020 trước đây; Nghị định 219/2025 đang có dự thảo sửa đổi nên cần đối chiếu mẫu và hạn hiện hành của Sở Nội vụ trước khi nộp." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {summary('Theo quốc tịch', report?.byNationality)}
        {summary('Theo vị trí công việc', report?.byJobCategory)}
        {summary('Theo tình trạng giấy phép', report?.byPermitStatus)}
      </div>
      <div className="transparent-table-card">
        <KTable dataSource={report?.rows || []} rowKey="employeeCode" pagination={{ pageSize: 10 }} columns={[
          { title: 'Người lao động', key: 'name', render: (_: unknown, row: ForeignWorkerReport['rows'][number]) => <div><div>{row.name}</div><div style={{ fontSize: 12, color: '#64748B' }}>{row.employeeCode} · {row.nationality} · {row.passportNumber || 'chưa có hộ chiếu'}</div></div> },
          { title: 'Vị trí', key: 'job', render: (_: unknown, row: ForeignWorkerReport['rows'][number]) => <div><div>{row.jobCategory}</div><div style={{ fontSize: 12, color: '#64748B' }}>{row.position}</div></div> },
          { title: 'Giấy phép', key: 'permit', render: (_: unknown, row: ForeignWorkerReport['rows'][number]) => <div><div>{row.permitStatus}</div><div style={{ fontSize: 12, color: '#64748B' }}>{row.workPermitNumber} {row.permitExpiryDate ? `· hết hạn ${dateText(row.permitExpiryDate)}` : ''}</div></div> },
          { title: 'Thị thực, tạm trú', key: 'immigration', render: (_: unknown, row: ForeignWorkerReport['rows'][number]) => <div style={{ fontSize: 12.5 }}>{row.visa && <div>Thị thực {row.visa} · {dateText(row.visaExpiryDate)}</div>}{row.residenceCard && <div>Thẻ tạm trú {row.residenceCard} · {dateText(row.residenceCardExpiryDate)}</div>}{!row.visa && !row.residenceCard && '—'}</div> },
          { title: 'Hợp đồng', key: 'contract', render: (_: unknown, row: ForeignWorkerReport['rows'][number]) => (row.contractCode ? `${row.contractCode}: ${dateText(row.contractStart)} – ${dateText(row.contractEnd)}` : 'Chưa có hợp đồng') },
          { title: 'Cần xử lý', key: 'issues', render: (_: unknown, row: ForeignWorkerReport['rows'][number]) => (row.issues.length ? row.issues.map((issue) => <Tag key={issue} color="warning">{issue}</Tag>) : <Tag color="success">Đủ hồ sơ</Tag>) },
        ]} />
      </div>
    </div>
  );
};
