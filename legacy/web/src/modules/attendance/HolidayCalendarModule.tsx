import React, { useEffect, useState } from 'react';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Alert, Button, Checkbox, Input, Select, Tag, message } from '../../custom-ui';
import { holidayApi, type HolidayCalendar, type HolidayItem } from '../../api/endpoints';

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const currentYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date()));
const YEAR_OPTIONS = [currentYear - 1, currentYear, currentYear + 1].map((year) => ({ label: `Năm ${year}`, value: year }));
const KIND_LABEL: Record<HolidayItem['kind'], [string, string]> = { statutory: ['Theo luật', 'success'], announced: ['Theo thông báo', 'processing'], compensation: ['Nghỉ bù', 'warning'] };

/**
 * Lịch nghỉ lễ, tết hưởng nguyên lương (Bộ luật Lao động 2019 Điều 112): hệ thống tự tính Tết Âm lịch, Giỗ Tổ theo lịch âm và ngày nghỉ bù;
 * quản trị viên chọn ngày nghỉ hằng tuần và sửa theo thông báo hằng năm. Lịch dùng cho hệ số làm thêm, hạn nộp thuế và đếm ngày làm việc.
 */
export const HolidayCalendarModule: React.FC = () => {
  const [year, setYear] = useState(currentYear);
  const [calendar, setCalendar] = useState<HolidayCalendar | null>(null);
  const [restDays, setRestDays] = useState<number[]>([0]);
  const [extraDays, setExtraDays] = useState<Array<{ date: string; name: string }>>([]);
  const [removedDates, setRemovedDates] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const apply = (data: HolidayCalendar) => {
    setCalendar(data);
    setRestDays(data.weeklyRestDays);
    setExtraDays(data.extraDays);
    setRemovedDates(data.removedDates);
  };
  useEffect(() => {
    holidayApi.get(year).then(({ data }) => apply(data)).catch((error) => message.error(error?.response?.data?.message || 'Không tải được lịch nghỉ lễ.'));
  }, [year]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      apply((await holidayApi.save({ year, weeklyRestDays: restDays, extraDays: extraDays.filter((item) => item.date || item.name), removedDates })).data);
      message.success(`Đã lưu lịch nghỉ lễ năm ${year}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được lịch nghỉ lễ.');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: 'Ngày', dataIndex: 'date', key: 'date', render: (date: string) => `${date.split('-').reverse().join('/')} (${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]})` },
    { title: 'Ngày nghỉ', dataIndex: 'name', key: 'name' },
    { title: 'Loại', dataIndex: 'kind', key: 'kind', render: (kind: HolidayItem['kind']) => <Tag color={KIND_LABEL[kind][1]}>{KIND_LABEL[kind][0]}</Tag> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Alert type="info" showIcon message="11 ngày nghỉ lễ, tết hưởng nguyên lương: Tết Dương lịch 1 ngày, Tết Âm lịch 5 ngày, Giỗ Tổ Hùng Vương 1 ngày, 30/4, 01/5 mỗi ngày 1 ngày, Quốc khánh 2 ngày. Ngày nghỉ hằng tuần trùng ngày lễ thì nghỉ bù ngày làm việc kế tiếp. Ngày Tết Âm lịch và ngày liền kề Quốc khánh theo thông báo hằng năm: bỏ ngày mặc định và thêm ngày thay thế." />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Select value={year} options={YEAR_OPTIONS} onChange={(value) => setYear(Number(value))} style={{ width: 140 }} />
        <span style={{ color: '#475569' }}>Ngày nghỉ hằng tuần:</span>
        {WEEKDAYS.map((label, day) => (
          <Checkbox key={label} checked={restDays.includes(day)} onChange={(event) => setRestDays((current) => (event.target.checked ? [...current, day] : current.filter((item) => item !== day)))}>{label}</Checkbox>
        ))}
      </div>
      <div className="transparent-table-card">
        <KTable dataSource={calendar?.holidays || []} columns={columns} rowKey={(row: HolidayItem) => `${row.date}-${row.kind}`} pagination={false} />
      </div>
      <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ color: '#0F172A' }}>Điều chỉnh theo thông báo năm {year}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: '#475569' }}>Bỏ ngày mặc định:</span>
          {(calendar?.statutory || []).map((item) => (
            <Checkbox key={item.date} checked={removedDates.includes(item.date)} onChange={(event) => setRemovedDates((current) => (event.target.checked ? [...current, item.date] : current.filter((date) => date !== item.date)))}>
              {item.date.split('-').reverse().join('/')}
            </Checkbox>
          ))}
        </div>
        {extraDays.map((item, index) => (
          <div key={index} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 40px', gap: 8 }}>
            <Input type="date" value={item.date} onChange={(event: any) => setExtraDays((current) => current.map((row, i) => (i === index ? { ...row, date: event.target.value } : row)))} />
            <Input placeholder="Tên ngày nghỉ (ví dụ: Tết Âm lịch theo Thông báo của Bộ Nội vụ)" value={item.name} onChange={(event: any) => setExtraDays((current) => current.map((row, i) => (i === index ? { ...row, name: event.target.value } : row)))} />
            <Button icon={<DeleteOutlined />} onClick={() => setExtraDays((current) => current.filter((_, i) => i !== index))} />
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button icon={<PlusOutlined />} onClick={() => setExtraDays((current) => [...current, { date: '', name: '' }])}>Thêm ngày nghỉ</Button>
          <Button type="primary" disabled={saving} onClick={() => void save()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>{saving ? 'Đang lưu...' : 'Lưu lịch nghỉ'}</Button>
        </div>
      </div>
    </div>
  );
};
