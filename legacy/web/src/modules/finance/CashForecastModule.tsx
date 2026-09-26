import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  DownloadOutlined,
  LineChartOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SafetyCertificateOutlined,
  EyeOutlined,
  PlusOutlined,
  CalendarOutlined,
  AlertOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseForecastRow {
  key: string;
  period: string;
  expectedInflow: number;
  expectedOutflow: number;
  netWeeklyChange: number;
  projectedBalance: number;
  inflowDetails: string;
  outflowDetails: string;
  safetyStatus: 'An toàn (Vượt ngưỡng tối thiểu)' | 'Cảnh báo hạn mức';
}

const INITIAL_FORECASTS: EnterpriseForecastRow[] = [];

export const CashForecastModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseForecastRow[]>(INITIAL_FORECASTS);

  useEffect(() => {
    const list = dataService.getGenericData('finance_forecasts');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_forecasts');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<EnterpriseForecastRow | null>(null);

  const safeLimit = 2000000000; // 2 Tỷ VNĐ quỹ dự phòng an toàn
  const projectedEndBalance = data.length > 0 ? data[data.length - 1].projectedBalance : 6930000000;

  const handleCreate = (values: any) => {
    const inflow = Number(values.expectedInflow) || 0;
    const outflow = Number(values.expectedOutflow) || 0;
    const prevBalance = data.length > 0 ? data[data.length - 1].projectedBalance : 5000000000;
    const net = inflow - outflow;
    const newBal = prevBalance + net;

    const newRow: EnterpriseForecastRow = {
      ...values,
      key: String(Date.now()),
      expectedInflow: inflow,
      expectedOutflow: outflow,
      netWeeklyChange: net,
      projectedBalance: newBal,
      safetyStatus: newBal >= safeLimit ? 'An toàn (Vượt ngưỡng tối thiểu)' : 'Cảnh báo hạn mức',
    };

    setData([...data, newRow]);
    message.success(`Đã bổ sung chu kỳ dự báo: ${values.period}`);
    setModalOpen(false);
    form.resetFields();
  };

  const columns = [
    {
      title: 'Kỳ dự báo dòng tiền',
      dataIndex: 'period',
      key: 'period',
      render: (p: string) => (
        <span style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarOutlined style={{ color: '#009688' }} /> {p}
        </span>
      ),
    },
    {
      title: 'Dự thu dự kiến (+)',
      dataIndex: 'expectedInflow',
      key: 'expectedInflow',
      width: 170,
      render: (val: number) => (
        <span style={{ fontWeight: 700, color: '#16A34A' }}>
          +{val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Dự chi dự kiến (-)',
      dataIndex: 'expectedOutflow',
      key: 'expectedOutflow',
      width: 170,
      render: (val: number) => (
        <span style={{ fontWeight: 700, color: '#DC2626' }}>
          -{val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Biến động thuần / Tuần',
      dataIndex: 'netWeeklyChange',
      key: 'netWeeklyChange',
      width: 190,
      render: (val: number) => (
        <span style={{ fontWeight: 700, color: val >= 0 ? '#16A34A' : '#D97706' }}>
          {val >= 0 ? `+${val.toLocaleString('vi-VN')} ₫` : `${val.toLocaleString('vi-VN')} ₫`}
        </span>
      ),
    },
    {
      title: 'Số dư dự kiến cuối kỳ',
      dataIndex: 'projectedBalance',
      key: 'projectedBalance',
      width: 200,
      render: (val: number) => (
        <strong style={{ fontWeight: 800, color: '#009688', fontSize: 14 }}>
          {val.toLocaleString('vi-VN')} ₫
        </strong>
      ),
    },
    {
      title: 'Độ an toàn thanh khoản',
      dataIndex: 'safetyStatus',
      key: 'safetyStatus',
      width: 210,
      render: (st: string) => {
        const isSafe = st.includes('An toàn');
        return <Tag color={isSafe ? 'success' : 'warning'}>{st}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseForecastRow) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedRow(record);
            setDrawerOpen(true);
          }}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Dự kiến số dư cuối tháng 9/2026</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {projectedEndBalance.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Thặng dư tăng trưởng +18.5% so với đầu tháng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hạn mức đệm an toàn thanh khoản</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {safeLimit.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đảm bảo đủ 2 tháng chi trả chi phí cố định</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chỉ số thanh toán nhanh (Quick Ratio)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            2.85x (Rất tốt)
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Không có rủi ro áp lực thanh khoản ngắn hạn</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thặng dư dòng tiền thuần dự kiến</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            +1.080.000.000 ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Sau khi hoàn thành chi lương và thuế</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
          <LineChartOutlined style={{ color: '#009688', fontSize: 16 }} />
          Mô Hình Dự Báo Dòng Tiền 4 Tuần Tới (Tháng 09/2026)
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất mô hình dự báo dòng tiền')}>
            Xuất Báo Cáo
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                period: `Tuần ${data.length + 1} (Tháng 10/2026)`,
                expectedInflow: 1000000000,
                expectedOutflow: 500000000,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm chu kỳ dự báo
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={data} columns={columns} pagination={false} />
      </div>

      {/* MODAL: Thêm chu kỳ dự báo */}
      <Modal
        title="Thêm Chu Kỳ Dự Báo Dòng Tiền Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <Form.Item name="period" label="Kỳ dự báo (Tuần / Khung ngày)" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Tuần 1 (01/10 - 07/10/2026)" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="expectedInflow" label="Dự kiến tiền thu về (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
            <Form.Item name="expectedOutflow" label="Dự kiến tiền chi ra (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
          </div>

          <Form.Item name="inflowDetails" label="Chi tiết nguồn dự thu trọng điểm" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Hợp đồng số ..., khách hàng ..." />
          </Form.Item>

          <Form.Item name="outflowDetails" label="Chi tiết nghĩa vụ dự chi bắt buộc" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Chi trả lương, tiền thuê văn phòng, cước IDC..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu mô hình dự báo
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Cấu Thành Dòng Tiền Tuần */}
      <Drawer
        title="Phân Tích Cấu Thành Dòng Tiền &amp; Độ An Toàn Thanh Khoản"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedRow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>DỰ BÁO DÒNG TIỀN</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {selectedRow.period}
              </div>
              <div style={{ marginTop: 6 }}>
                <Tag color={selectedRow.safetyStatus.includes('An toàn') ? 'success' : 'warning'}>
                  {selectedRow.safetyStatus}
                </Tag>
              </div>
            </div>

            {/* Financial Details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Các Khoản Thu &amp; Chi Dự Kiến:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Dự thu khách hàng (+):</span>
                  <strong style={{ color: '#16A34A', fontSize: 14 }}>+{selectedRow.expectedInflow.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Dự chi nghĩa vụ (-):</span>
                  <strong style={{ color: '#DC2626', fontSize: 14 }}>-{selectedRow.expectedOutflow.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                  <span style={{ color: '#0F172A', fontWeight: 700 }}>Số dư dự kiến cuối tuần:</span>
                  <strong style={{ color: '#009688', fontSize: 16 }}>{selectedRow.projectedBalance.toLocaleString('vi-VN')} ₫</strong>
                </div>
              </div>
            </div>

            {/* Inflow breakdown */}
            <div style={{ border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 4 }}>
                <CheckCircleOutlined style={{ color: '#10B981', marginRight: 6 }} />Nguồn Tiền Thu Về Trọng Điểm:
              </div>
              <div style={{ fontSize: 12.5, color: '#14532D' }}>
                {selectedRow.inflowDetails}
              </div>
            </div>

            {/* Outflow breakdown */}
            <div style={{ border: '1px solid #FECACA', borderRadius: 8, padding: 14, background: '#FEF2F2' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', marginBottom: 4 }}>
                <CloseCircleOutlined style={{ color: '#EF4444', marginRight: 6 }} />Các Nghĩa Vụ Chi Bắt Buộc:
              </div>
              <div style={{ fontSize: 12.5, color: '#7F1D1D' }}>
                {selectedRow.outflowDetails}
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => message.success(`Đã xuất báo cáo chi tiết dự báo dòng tiền ${selectedRow.period}`)}
            >
              Xuất Báo Cáo Kịch Bản Dòng Tiền (Excel)
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

