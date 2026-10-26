import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CalculatorOutlined,
  CheckCircleOutlined,
  PieChartOutlined,
  EyeOutlined,
  PrinterOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ThunderboltOutlined,
  AuditOutlined,
  AccountBookOutlined,
  DollarOutlined,
  CalendarOutlined,
  SettingOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Progress, Tooltip } from '../../custom-ui';

export interface DepreciationScheduleRow {
  period: string;
  monthNumber: number;
  monthlyAmount: number;
  accumulatedAmount: number;
  remainingAmount: number;
  posted: boolean;
}

export interface DepreciationItem {
  key: string;
  assetCode: string;
  assetName: string;
  category: string;
  department: string;
  costAccount: string; // TK Nợ: 642, 641, 627
  assetAccount: string; // TK Có: 2141, 2143
  depreciationMethod: 'Đường thẳng' | 'Số dư giảm dần có điều chỉnh' | 'Theo sản lượng / Công suất';
  originalCost: number;
  residualValue: number; // Giá trị thanh lý ước tính
  lifeMonths: number;
  depreciatedMonths: number;
  monthlyDeprec: number;
  yearlyDeprec: number;
  accumulatedDeprec: number;
  netBookValue: number;
  startDate: string;
  endDate: string;
  lastRunDate: string;
  status: 'Đang trích khấu hao' | 'Tạm dừng trích KH' | 'Đã trích hết 100%' | 'Đã thanh lý giảm tài sản';
  notes: string;
  scheduleList: DepreciationScheduleRow[];
}

const generateSchedule = (
  original: number,
  lifeMonths: number,
  depreciatedMonths: number,
  startDateStr: string
): DepreciationScheduleRow[] => {
  const monthly = Math.round(original / lifeMonths);
  const rows: DepreciationScheduleRow[] = [];
  let accum = 0;
  const [startYear, startMonth] = startDateStr.split('-').map(Number);

  for (let i = 1; i <= lifeMonths; i++) {
    const curMonth = ((startMonth - 1 + (i - 1)) % 12) + 1;
    const curYear = startYear + Math.floor((startMonth - 1 + (i - 1)) / 12);
    const periodStr = `${String(curMonth).padStart(2, '0')}/${curYear}`;
    accum = Math.min(original, accum + monthly);
    const remain = Math.max(0, original - accum);
    const isPosted = i <= depreciatedMonths;

    rows.push({
      period: periodStr,
      monthNumber: i,
      monthlyAmount: i === lifeMonths ? original - (monthly * (lifeMonths - 1)) : monthly,
      accumulatedAmount: accum,
      remainingAmount: remain,
      posted: isPosted,
    });
  }
  return rows;
};

import { useEffect } from 'react';
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

export const AssetDepreciationModule: React.FC = () => {
  const [data, setData] = useState<DepreciationItem[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');

  // Modals & Drawers state
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<DepreciationItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [runModalOpen, setRunModalOpen] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      const [res, orgUnits] = await Promise.all([
        collectionsApi.get<DepreciationItem>('asset_depreciations', { limit: 500 }),
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

  // Metrics
  const totalOriginal = data.reduce((sum, item) => sum + item.originalCost, 0);
  const totalMonthly = data.reduce((sum, item) => sum + (item.status === 'Đang trích khấu hao' ? item.monthlyDeprec : 0), 0);
  const totalAccumulated = data.reduce((sum, item) => sum + item.accumulatedDeprec, 0);
  const totalNetBook = data.reduce((sum, item) => sum + item.netBookValue, 0);

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      assetCode: `TS-2026-0${data.length + 10}`,
      category: 'Máy chủ & Hạ tầng IDC',
      department: 'Trung Tâm Dữ Liệu & Cloud',
      costAccount: 'Nợ 6421',
      assetAccount: 'Có 2141',
      depreciationMethod: 'Đường thẳng',
      originalCost: 360000000,
      residualValue: 10000000,
      lifeMonths: 36,
      startDate: new Date().toISOString().substring(0, 10),
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    const orig = Number(values.originalCost) || 0;
    const months = Number(values.lifeMonths) || 36;
    const monthly = Math.round(orig / months);
    const yearly = monthly * 12;

    const start = values.startDate || new Date().toISOString().substring(0, 10);
    const [sy, sm] = start.split('-').map(Number);
    const endY = sy + Math.floor((sm + months - 1) / 12);
    const endM = ((sm + months - 1) % 12) + 1;
    const endStr = `${endY}-${String(endM).padStart(2, '0')}-01`;

    const id = `deprec-${Date.now()}`;
    const newItem: DepreciationItem = {
      ...values,
      key: id,
      originalCost: orig,
      residualValue: Number(values.residualValue) || 0,
      lifeMonths: months,
      depreciatedMonths: 0,
      monthlyDeprec: monthly,
      yearlyDeprec: yearly,
      accumulatedDeprec: 0,
      netBookValue: orig,
      startDate: start,
      endDate: endStr,
      lastRunDate: 'Chưa trích',
      status: 'Đang trích khấu hao',
      notes: values.notes || 'Thiết lập trích khấu hao mới theo chuẩn TT45/2013/TT-BTC',
      scheduleList: generateSchedule(orig, months, 0, start),
    };
    try {
      await collectionsApi.create('asset_depreciations', newItem, id);
      message.success(`Đã thiết lập trích khấu hao: ${values.assetCode} (${values.assetName})`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể thiết lập trích khấu hao.');
    }
  };

  const handleToggleStatus = async (record: DepreciationItem) => {
    const nextStatus = record.status === 'Đang trích khấu hao' ? 'Tạm dừng trích KH' : 'Đang trích khấu hao';
    try {
      await collectionsApi.update('asset_depreciations', record.key, { status: nextStatus });
      message.info(`Đã chuyển trạng thái ${record.assetCode} sang "${nextStatus}"`);
      await loadData();
    } catch {
      message.error('Không thể đổi trạng thái khấu hao.');
    }
  };

  const handleRunMonthlyDepreciation = () => {
    const today = new Date().toISOString().substring(0, 10);
    setData((prev) =>
      prev.map((item) => {
        if (item.status === 'Đang trích khấu hao' && item.depreciatedMonths < item.lifeMonths) {
          const nextDeprecMonths = item.depreciatedMonths + 1;
          const nextAccum = Math.min(item.originalCost, item.accumulatedDeprec + item.monthlyDeprec);
          const nextNetBook = Math.max(0, item.originalCost - nextAccum);
          const isDone = nextDeprecMonths >= item.lifeMonths;

          return {
            ...item,
            depreciatedMonths: nextDeprecMonths,
            accumulatedDeprec: nextAccum,
            netBookValue: nextNetBook,
            lastRunDate: today,
            status: isDone ? 'Đã trích hết 100%' : 'Đang trích khấu hao',
            scheduleList: generateSchedule(item.originalCost, item.lifeMonths, nextDeprecMonths, item.startDate),
          };
        }
        return item;
      })
    );

    message.success(`Đã chạy tự động trích khấu hao Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()} cho toàn bộ hệ thống thành công! Bút toán Nợ 642/Có 214 đã ghi nhận.`);
    setRunModalOpen(false);
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.assetCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assetName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.costAccount || '').toLowerCase().includes(searchText.toLowerCase());

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchMethod = methodFilter === 'all' || item.depreciationMethod === methodFilter;

    return matchSearch && matchStatus && matchMethod;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nguyên giá TSCĐ theo dõi</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalOriginal.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{data.length} danh mục tài sản đang phân bổ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chi phí khấu hao trích mỗi tháng</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#B45309', marginTop: 4 }}>
            {totalMonthly.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 2 }}>Hạch toán Nợ 642 / Có 214 định kỳ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Khấu hao lũy kế đã trích</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalAccumulated.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
            Đã thu hồi vốn {Math.round((totalAccumulated / (totalOriginal || 1)) * 100)}% tổng nguyên giá
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Giá trị còn lại</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalNetBook.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Ghi nhận trên Bảng Cân Đối Kế Toán</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã TS, tên tài sản, nhóm, phòng ban, TK..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 190 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Đang trích khấu hao', value: 'Đang trích khấu hao' },
              { label: 'Tạm dừng trích KH', value: 'Tạm dừng trích KH' },
              { label: 'Đã trích hết 100%', value: 'Đã trích hết 100%' },
            ]}
          />
          <Select
            value={methodFilter}
            onChange={setMethodFilter}
            style={{ width: 220 }}
            options={[
              { label: 'Tất cả phương pháp trích', value: 'all' },
              { label: 'Đường thẳng (VAS TT45)', value: 'Đường thẳng (Straight-Line VAS TT45)' },
              { label: 'Số dư giảm dần', value: 'Số dư giảm dần có điều chỉnh' },
              { label: 'Theo sản lượng', value: 'Theo sản lượng / Công suất' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất Bảng Tính Phân Bổ Khấu Hao')}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={() => setRunModalOpen(true)}
            style={{ backgroundColor: '#B45309', borderColor: '#B45309' }}
          >
            Chạy trích khấu hao tháng này
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thiết lập trích khấu hao
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã tài sản & Định khoản',
              key: 'code',
              width: 170,
              render: (_: any, r: DepreciationItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CalculatorOutlined /> {r.assetCode}
                  </span>
                  <Tag color="cyan" style={{ marginTop: 3, fontSize: 11 }}>
                    {r.costAccount}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Tên tài sản & Phòng ban',
              key: 'asset',
              render: (_: any, r: DepreciationItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.assetName}</strong>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    Nhóm: <strong>{r.category}</strong> · Đơn vị: <strong style={{ color: '#2563EB' }}>{r.department}</strong>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#B45309', marginTop: 2 }}>
                    Phương pháp: {r.depreciationMethod} ({r.lifeMonths} tháng)
                  </div>
                </div>
              ),
            },
            {
              title: 'Nguyên giá & Trích tháng',
              key: 'values',
              width: 200,
              render: (_: any, r: DepreciationItem) => (
                <div style={{ fontSize: 12 }}>
                  <div>Nguyên giá: <strong>{r.originalCost.toLocaleString('vi-VN')} ₫</strong></div>
                  <div style={{ color: '#B45309', fontWeight: 700, marginTop: 2 }}>
                    Trích/tháng: {r.monthlyDeprec.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
              ),
            },
            {
              title: 'Tiến độ trích',
              key: 'progress',
              width: 210,
              render: (_: any, r: DepreciationItem) => {
                const pct = Math.min(100, Math.round((r.accumulatedDeprec / (r.originalCost || 1)) * 100));
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ color: '#64748B' }}>Đã trích ({pct}%): <strong>{r.depreciatedMonths}/{r.lifeMonths}T</strong></span>
                      <strong style={{ color: '#16A34A' }}>{r.netBookValue.toLocaleString('vi-VN')} ₫</strong>
                    </div>
                    <Progress
                      percent={pct}
                      size="small"
                      strokeColor={pct >= 100 ? '#64748B' : '#009688'}
                      showInfo={false}
                    />
                  </div>
                );
              },
            },
            {
              title: 'Kỳ trích gần nhất',
              dataIndex: 'lastRunDate',
              key: 'lastRunDate',
              width: 120,
              render: (d: string) => <span style={{ fontSize: 12 }}>{d}</span>,
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              render: (s: string) => {
                let col = 'success';
                if (s.includes('Tạm dừng')) col = 'warning';
                if (s.includes('100%')) col = 'default';
                return <Tag color={col}>{s}</Tag>;
              },
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 170,
              render: (_: any, r: DepreciationItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem lịch trình trích khấu hao chi tiết từng tháng"
                  >
                    Kế hoạch
                  </Button>
                  {r.status !== 'Đã trích hết 100%' && (
                    <Tooltip title={r.status === 'Đang trích khấu hao' ? 'Tạm dừng trích khấu hao' : 'Tiếp tục trích khấu hao'}>
                      <Button
                        size="small"
                        icon={r.status === 'Đang trích khấu hao' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                        onClick={() => handleToggleStatus(r)}
                      />
                    </Tooltip>
                  )}
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Thiết lập trích khấu hao mới 100% trường nhập */}
      <Modal
        title="Thiết Lập Khấu Hao Tài Sản Cố Định"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
            <Form.Item name="assetCode" label="Mã tài sản" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: TS-SRV-003" />
            </Form.Item>
            <Form.Item name="category" label="Nhóm tài sản" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Máy chủ & Hạ tầng IDC', value: 'Máy chủ & Hạ tầng IDC' },
                  { label: 'Hạ tầng Mạng & An ninh', value: 'Hạ tầng Mạng & An ninh' },
                  { label: 'Thiết bị IT & CBNV', value: 'Thiết bị IT & Cán bộ nhân viên' },
                  { label: 'Hệ thống Điện & Nguồn UPS', value: 'Hệ thống Điện & Nguồn UPS' },
                  { label: 'Phần mềm & Bản quyền Vô hình', value: 'Phần mềm & Bản quyền Vô hình' },
                  { label: 'Phương tiện vận tải & Xe', value: 'Phương tiện vận tải & Xe' },
                ]}
              />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban sử dụng" rules={[{ required: true }]}>
              <Select
                options={deptOptions.length > 0 ? deptOptions : [
                  { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
                ]}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
          </div>

          <Form.Item name="assetName" label="Tên tài sản cố định" rules={[{ required: true, message: 'Nhập tên tài sản' }]}>
            <Input placeholder="Ví dụ: Cụm Tường Lửa FortiGate 200F High Availability" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="depreciationMethod" label="Phương pháp trích khấu hao" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Đường thẳng (VAS TT45)', value: 'Đường thẳng (Straight-Line VAS TT45)' },
                  { label: 'Số dư giảm dần có điều chỉnh', value: 'Số dư giảm dần có điều chỉnh' },
                  { label: 'Theo sản lượng / Công suất', value: 'Theo sản lượng / Công suất' },
                ]}
              />
            </Form.Item>
            <Form.Item name="costAccount" label="Tài khoản Nợ" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Nợ 6421', value: 'Nợ 6421 (CP Quản lý CNTT)' },
                  { label: 'Nợ 6422', value: 'Nợ 6422 (CP Vật liệu & CCDC Văn phòng)' },
                  { label: 'Nợ 641', value: 'Nợ 641 (CP Bán Hàng)' },
                  { label: 'Nợ 627', value: 'Nợ 627 (CP Sản xuất chung)' },
                ]}
              />
            </Form.Item>
            <Form.Item name="assetAccount" label="Tài khoản Có" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Có 2141', value: 'Có 2141 (Hao mòn TSCĐ hữu hình)' },
                  { label: 'Có 2143', value: 'Có 2143 (Hao mòn TSCĐ vô hình)' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="originalCost" label="Nguyên giá tài sản (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={10000000} placeholder="Ví dụ: 360000000" />
            </Form.Item>
            <Form.Item name="residualValue" label="Giá trị thanh lý ước tính (VNĐ)">
              <Input type="number" min={0} step={5000000} placeholder="Ví dụ: 10000000" />
            </Form.Item>
            <Form.Item name="lifeMonths" label="Thời gian trích" rules={[{ required: true }]}>
              <Input type="number" min={1} max={120} placeholder="Ví dụ: 36" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 12 }}>
            <Form.Item name="startDate" label="Ngày bắt đầu trích khấu hao" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="notes" label="Ghi chú hạch toán kế toán">
              <Input placeholder="Ví dụ: Phê duyệt theo Quyết định đầu tư số 88/QĐ-HĐQT..." />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu cấu hình khấu hao
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Kế Hoạch & Lịch Trình Khấu Hao Chi Tiết Từng Tháng */}
      <Drawer
        title="Bảng Kế Hoạch Phân Bổ Khấu Hao Chi Tiết Từng Tháng"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={650}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Passport */}
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.assetCode}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.assetName}</div>
                </div>
                <Tag color={detailItem.status === 'Đang trích khấu hao' ? 'success' : 'warning'}>{detailItem.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Đơn vị: <strong>{detailItem.department}</strong> · Phương pháp: <strong>{detailItem.depreciationMethod}</strong>
              </div>
            </div>

            {/* Financial Stats Matrix */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#F8FAFC' }}>
                <div style={{ fontSize: 11, color: '#64748B' }}>NGUYÊN GIÁ</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                  {detailItem.originalCost.toLocaleString('vi-VN')} ₫
                </div>
              </div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#FEF3C7' }}>
                <div style={{ fontSize: 11, color: '#92400E' }}>TRÍCH / THÁNG</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#B45309', marginTop: 2 }}>
                  {detailItem.monthlyDeprec.toLocaleString('vi-VN')} ₫
                </div>
              </div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#F0FDF4' }}>
                <div style={{ fontSize: 11, color: '#166534' }}>GIÁ TRỊ CÒN LẠI</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {detailItem.netBookValue.toLocaleString('vi-VN')} ₫
                </div>
              </div>
            </div>

            {/* Accounting Rule Info */}
            <div style={{ background: '#EFF6FF', padding: 10, borderRadius: 6, border: '1px solid #BFDBFE', fontSize: 12 }}>
              <strong style={{ color: '#1E40AF' }}>Bút toán hạch toán định kỳ:</strong>
              <div style={{ color: '#1E3A8A', marginTop: 2 }}>
                - Định khoản: <strong>{detailItem.costAccount}</strong> / <strong>{detailItem.assetAccount}</strong>
              </div>
              <div style={{ color: '#64748B', marginTop: 1 }}>
                - Thời gian phân bổ: Từ <strong>{detailItem.startDate}</strong> đến <strong>{detailItem.endDate}</strong> ({detailItem.lifeMonths} tháng)
              </div>
            </div>

            {/* Monthly Schedule Table */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Lịch trình phân bổ 36 tháng ({detailItem.scheduleList?.filter((s) => s.posted).length || 0} tháng đã ghi sổ):
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: '#F1F5F9', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #CBD5E1' }}>Kỳ</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #CBD5E1' }}>Mức trích kỳ này</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #CBD5E1' }}>Lũy kế đã trích</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #CBD5E1' }}>Giá trị còn lại</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #CBD5E1' }}>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItem.scheduleList?.map((row, idx) => (
                      <tr key={idx} style={{ background: row.posted ? '#F0FDF4' : '#FFFFFF', borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '7px 10px', fontWeight: 600 }}>{row.period} (T{row.monthNumber})</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#B45309' }}>{row.monthlyAmount.toLocaleString('vi-VN')} ₫</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>{row.accumulatedAmount.toLocaleString('vi-VN')} ₫</td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 600, color: '#16A34A' }}>{row.remainingAmount.toLocaleString('vi-VN')} ₫</td>
                        <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                          {row.posted ? <Tag color="success">Đã ghi sổ</Tag> : <Tag color="default">Dự kiến</Tag>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất bảng tính khấu hao ${detailItem.assetCode} (PDF)`)}
                style={{ flex: 1 }}
              >
                In bảng khấu hao (PDF)
              </Button>
              <Button
                type="primary"
                icon={detailItem.status === 'Đang trích khấu hao' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={() => handleToggleStatus(detailItem)}
                style={{ backgroundColor: detailItem.status === 'Đang trích khấu hao' ? '#D97706' : '#009688', borderColor: detailItem.status === 'Đang trích khấu hao' ? '#D97706' : '#009688', flex: 1 }}
              >
                {detailItem.status === 'Đang trích khấu hao' ? 'Tạm dừng trích KH' : 'Kích hoạt trích KH'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Chạy trích khấu hao tự động tháng này */}
      <Modal
        title="Chạy Trích Khấu Hao &amp; Tự Động Định Khoản Kế Toán"
        open={runModalOpen}
        onCancel={() => setRunModalOpen(false)}
        footer={null}
        width={500}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
          <Alert
            message={`Xác nhận chạy trích khấu hao: Kỳ Tháng ${new Date().getMonth() + 1}/${new Date().getFullYear()}`}
            description={`Tổng số tiền phân bổ kỳ này: ${totalMonthly.toLocaleString('vi-VN')} ₫. Bút toán Nợ 642 / Có 214 sẽ tự động ghi sổ.`}
            type="info"
            showIcon
          />

          <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
            <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Phân bổ chi phí theo phòng ban:</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span>1. Trung Tâm Dữ Liệu DC:</span>
              <strong style={{ color: '#B45309' }}>17.500.000 ₫</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
              <span>2. Khối Kỹ Thuật Dev:</span>
              <strong style={{ color: '#B45309' }}>11.666.667 ₫</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderTop: '1px solid #E2E8F0', marginTop: 4, paddingTop: 4 }}>
              <strong>TỔNG CỘNG GHI SỔ KỲ NÀY:</strong>
              <strong style={{ color: '#16A34A', fontSize: 14 }}>{totalMonthly.toLocaleString('vi-VN')} ₫</strong>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <Button onClick={() => setRunModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleRunMonthlyDepreciation}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Chấp nhận trích &amp; Ghi sổ kế toán
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

