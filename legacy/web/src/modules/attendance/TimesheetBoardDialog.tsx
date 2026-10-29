import React, { useState } from 'react';
import { Button, Input, Modal, Select, message } from '../../custom-ui';
import { dataService } from '../../services/dataService';

type TimesheetBoardDialogProps = { summary?: boolean };

export const TimesheetBoardDialog: React.FC<TimesheetBoardDialogProps> = ({ summary = false }) => {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('Chấm công theo buổi');
  const [month, setMonth] = useState(String(today.getMonth() + 1).padStart(2, '0'));
  const [year, setYear] = useState(String(today.getFullYear()));
  const [startDate, setStartDate] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`);
  const [endDate, setEndDate] = useState('');
  const [name, setName] = useState('');
  const [fromAnother, setFromAnother] = useState(false);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const units = dataService.getOrgUnits().filter((unit) => unit.status !== 'Tạm ngưng');

  const createBoard = () => {
    if (!name.trim() || selectedUnits.length === 0) { message.error('Nhập tên bảng và chọn ít nhất một đơn vị.'); return; }
    if (!summary && (!startDate || !endDate || endDate < startDate)) { message.error('Chọn khoảng ngày hợp lệ cho bảng chấm công.'); return; }
    const scope = summary ? 'attendance_timesheet_board_summaries' : 'attendance_timesheet_boards';
    const rows = dataService.getGenericData(scope);
    dataService.saveGenericData(scope, [{
      key: crypto.randomUUID(), name: name.trim(), type: kind, month, year,
      period: `${year}-${month}`, startDate: summary ? undefined : startDate,
      endDate: summary ? undefined : endDate, unitKeys: selectedUnits,
      basedOnAnother: fromAnother, createdAt: new Date().toISOString(),
    }, ...rows]);
    setOpen(false); setName(''); setSelectedUnits([]); message.success(summary ? 'Đã tạo bảng tổng hợp chấm công.' : 'Đã tạo bảng chấm công.');
  };

  return <>
    <Button onClick={() => setOpen(true)}>{summary ? 'Thêm tổng hợp chấm công' : 'Thêm bảng chấm công'}</Button>
    <Modal title={summary ? 'Thêm tổng hợp chấm công' : 'Thêm bảng chấm công'} open={open} onCancel={() => setOpen(false)} onOk={createBoard} okText="Lưu" width={760}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
        <label>Loại chấm công<Select value={kind} onChange={setKind} options={['Chấm công theo buổi', 'Chấm công theo giờ'].map((value) => ({ value, label: value }))} /></label>
        <label>Tháng<Input type="number" min={1} max={12} value={month} onChange={(event: any) => setMonth(String(event.target.value).padStart(2, '0'))} /></label>
        <label>Năm<Input type="number" value={year} onChange={(event: any) => setYear(event.target.value)} /></label>
        {!summary && <><label>Từ ngày<Input type="date" value={startDate} onChange={(event: any) => setStartDate(event.target.value)} /></label><label>Đến ngày<Input type="date" value={endDate} onChange={(event: any) => setEndDate(event.target.value)} /></label></>}
        <label style={{ gridColumn: '1 / -1' }}>{summary ? 'Tên bảng tổng hợp chấm công' : 'Tên bảng chấm công'}<Input value={name} onChange={(event: any) => setName(event.target.value)} /></label>
        <label style={{ gridColumn: '1 / -1' }}><input type="checkbox" checked={fromAnother} onChange={(event) => setFromAnother(event.target.checked)} /> {summary ? 'Tổng hợp từ các bảng chấm công chi tiết' : 'Tạo bảng chấm công dựa trên bảng chấm công khác'}</label>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 6px' }}><span>Đơn vị áp dụng</span><Button size="small" onClick={() => setSelectedUnits(units.map((unit) => unit.key))}>Chọn tất cả</Button></div>
      <div style={{ maxHeight: 220, overflow: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th></th><th>Mã đơn vị</th><th>Tên đơn vị</th><th>Cấp tổ chức</th></tr></thead><tbody>{units.map((unit) => <tr key={unit.key}><td><input type="checkbox" checked={selectedUnits.includes(unit.key)} onChange={(event) => setSelectedUnits((current) => event.target.checked ? [...current, unit.key] : current.filter((key) => key !== unit.key))} /></td><td>{unit.code}</td><td>{unit.name}</td><td>{unit.manager ? 'Phòng ban' : 'Tổng công ty/Công ty'}</td></tr>)}</tbody></table><div>Tổng số: {units.length} bản ghi</div></div>
    </Modal>
  </>;
};
