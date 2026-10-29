import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { KTable } from '../../components/KTable';
import { dataService } from '../../services/dataService';
import { TimesheetBoardDialog } from '../attendance/TimesheetBoardDialog';

export const PayrollTimesheetModule: React.FC = () => {
  const isSummary = useLocation().pathname.endsWith('/summary');
  const scope = isSummary ? 'finance_payroll_timesheet_summaries' : 'finance_payroll_timesheet_boards';
  const [boards, setBoards] = useState<any[]>(() => dataService.getGenericData(scope));
  const units = dataService.getOrgUnits();

  useEffect(() => {
    let active = true;
    void dataService.refreshGenericData(scope).then((rows) => { if (active) setBoards(rows); }).catch(() => {});
    const unsubscribe = dataService.subscribe(() => setBoards(dataService.getGenericData(scope)));
    return () => { active = false; unsubscribe(); };
  }, [scope]);

  return <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{isSummary ? 'Bảng chấm công tổng hợp' : 'Bảng chấm công chi tiết'}</h2>
      <TimesheetBoardDialog summary={isSummary} payroll />
    </div>
    <div className="transparent-table-card">
      <KTable dataSource={boards} rowKey="key" columns={[
        { title: 'Tên bảng', dataIndex: 'name', key: 'name' },
        { title: 'Loại chấm công', dataIndex: 'type', key: 'type' },
        { title: 'Kỳ', key: 'period', render: (_: unknown, row: any) => `${row.month}/${row.year}` },
        ...(!isSummary ? [{ title: 'Từ ngày', dataIndex: 'startDate', key: 'startDate' }, { title: 'Đến ngày', dataIndex: 'endDate', key: 'endDate' }] : []),
        { title: 'Đơn vị', key: 'units', render: (_: unknown, row: any) => (row.unitKeys || []).map((key: string) => units.find((unit) => unit.key === key)?.name || key).join(', ') },
      ]} />
    </div>
  </div>;
};
