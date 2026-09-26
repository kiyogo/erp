import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  TrophyFilled,
  GiftOutlined,
  CheckCircleOutlined,
  UserOutlined,
  EyeOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  CalendarOutlined,
  TeamOutlined,
  DollarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

import { useEffect } from 'react';
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

export interface EnterpriseRewardItem {
  key: string;
  rewardCode: string;
  employeeName: string;
  empCode: string;
  department: string;
  title: string;
  rewardType: 'Tiền mặt & Cúp pha lê' | 'Chuyến du lịch nghỉ dưỡng 5 sao' | 'Cổ phần thưởng ESOP' | 'Bằng khen Ban Giám Đốc';
  rewardValue: number;
  decisionNo: string;
  date: string;
  achievementSummary: string;
  signer: string;
  signerName?: string;
  status: 'Đã trao giải' | 'Đã ký quyết định' | 'Chờ duyệt';
}

export const RewardsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseRewardItem[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<EnterpriseRewardItem | null>(null);

  const loadData = async () => {
    try {
      const [res, orgUnits] = await Promise.all([
        collectionsApi.get<EnterpriseRewardItem>('hr_rewards', { limit: 500 }),
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

  const totalRewardsValue = data.reduce((sum, item) => sum + item.rewardValue, 0);
  const awardedCount = data.filter((d) => d.status === 'Đã trao giải').length;

  const handleCreate = async (values: any) => {
    const newVal = Number(values.rewardValue) || 10000000;
    const id = `reward-${Date.now()}`;
    const userRaw = localStorage.getItem('minepanel_user');
    const currUser = userRaw ? JSON.parse(userRaw) : null;
    const signer = currUser?.fullName || currUser?.name || 'Ban Giám Đốc';

    const newReward: EnterpriseRewardItem = {
      ...values,
      key: id,
      empCode: values.empCode || `KY-${String(Date.now()).slice(-3)}`,
      rewardValue: newVal,
      signerName: signer,
      status: 'Chờ duyệt',
    };
    try {
      await collectionsApi.create('hr_rewards', newReward, id);
      message.success(`Đã tạo quyết định khen thưởng cho: ${values.employeeName} (${values.decisionNo})`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo quyết định khen thưởng.');
    }
  };

  const handleApproveDecision = async (record: EnterpriseRewardItem) => {
    try {
      await collectionsApi.update('hr_rewards', record.key, { status: 'Đã ký quyết định' });
      message.success(`Đã phê duyệt và ký quyết định khen thưởng cho ${record.employeeName}`);
      await loadData();
    } catch {
      message.error('Không thể phê duyệt quyết định khen thưởng.');
    }
  };

  const handleConfirmAward = async (record: EnterpriseRewardItem) => {
    try {
      await collectionsApi.update('hr_rewards', record.key, { status: 'Đã trao giải' });
      message.success(`Đã xác nhận trao thưởng thành công cho ${record.employeeName}`);
      await loadData();
    } catch {
      message.error('Không thể cập nhật trạng thái trao thưởng.');
    }
  };

  const filteredData = data.filter((item) => {
    let matchStatus = true;
    if (statusFilter === 'Đã trao giải') {
      matchStatus = item.status === 'Đã trao giải' || item.status === 'Đã trao thưởng';
    } else if (statusFilter === 'Chờ trao giải') {
      matchStatus = item.status === 'Chờ duyệt' || item.status === 'Đã ký quyết định' || item.status === 'Chờ trao thưởng trong lễ vinh danh';
    } else if (statusFilter !== 'all') {
      matchStatus = item.status === statusFilter;
    }

    const matchSearch =
      (item.rewardCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.decisionNo || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Nhân sự được vinh danh',
      key: 'name',
      render: (_: any, r: EnterpriseRewardItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrophyFilled style={{ color: '#F59E0B', fontSize: 16 }} />
            {r.employeeName}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{r.rewardCode}</code> · {r.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Danh hiệu vinh danh & Quyết định',
      key: 'title',
      render: (_: any, r: EnterpriseRewardItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#B45309', fontSize: 13 }}>{r.title}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
            {r.decisionNo} · Ngày ban hành: {r.date}
          </div>
        </div>
      ),
    },
    {
      title: 'Hình thức & Giá trị thưởng',
      key: 'reward',
      width: 230,
      render: (_: any, r: EnterpriseRewardItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
            +{r.rewardValue.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <GiftOutlined style={{ color: '#009688' }} /> {r.rewardType}
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (status: string) => {
        let tagColor = 'warning';
        if (status === 'Đã trao giải' || status === 'Đã trao thưởng') tagColor = 'success';
        if (status === 'Đã ký quyết định') tagColor = 'processing';
        return (
          <Tag color={tagColor}>
            {status}
          </Tag>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 200,
      render: (_: any, record: EnterpriseRewardItem) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {record.status === 'Chờ duyệt' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => handleApproveDecision(record)}
              style={{ backgroundColor: '#2563EB', borderColor: '#2563EB', fontSize: 11.5 }}
            >
              Duyệt
            </Button>
          )}
          {record.status !== 'Đã trao giải' && record.status !== 'Đã trao thưởng' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={() => handleConfirmAward(record)}
              style={{ backgroundColor: '#009688', borderColor: '#009688', fontSize: 11.5 }}
            >
              Trao giải
            </Button>
          )}
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedReward(record);
              setDrawerOpen(true);
            }}
          >
            Bằng khen
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quỹ vinh danh &amp; khen thưởng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalRewardsValue.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Trích từ quỹ phúc lợi &amp; phát triển tài năng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cá nhân &amp; Tập thể được vinh danh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {data.length} Quyết định
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Đóng góp đột phá vào doanh thu &amp; kỹ thuật</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiến độ trao thưởng vinh danh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {awardedCount} / {data.length} Đã trao
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Trao trực tiếp tại Townhall &amp; Year End Party</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chỉ số hài lòng gắn kết nhân sự (eNPS)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            +72 Điểm (Rất Tốt)
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>94% nhân viên cảm thấy được ghi nhận xứng đáng</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả vinh danh' },
            { key: 'Đã trao giải', label: 'Đã trao giải', icon: <TrophyOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Chờ trao giải', label: 'Chờ trao giải', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
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
            placeholder="Tìm theo mã, tên nhân sự, danh hiệu..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất sổ vàng vinh danh khen thưởng')}>
            Xuất Sổ Vàng
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                rewardCode: `KT-2026/0${data.length + 1}`,
                decisionNo: `QĐ-0${data.length + 5}/2026/QĐ-BGD`,
                rewardType: 'Tiền mặt & Cúp pha lê',
                rewardValue: 15000000,
                date: new Date().toISOString().substring(0, 10),
                department: 'Phòng Ban Kỹ Thuật',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Quyết định khen thưởng
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Tạo quyết định khen thưởng */}
      <Modal
        title="Ban Hành Quyết Định Vinh Danh &amp; Khen Thưởng Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="rewardCode" label="Mã khen thưởng" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="decisionNo" label="Số quyết định BGD" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="date" label="Ngày ký quyết định" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân sự / Đại diện tập thể" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Hoàng Quốc Dũng" />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban trực thuộc" rules={[{ required: true }]}>
              <Select
                options={deptOptions.length > 0 ? deptOptions : [
                  { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
                ]}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
          </div>

          <Form.Item name="title" label="Danh hiệu vinh danh" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Cá Nhân Đột Phá Công Nghệ Quý II / 2026" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="rewardType" label="Hình thức khen thưởng" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Tiền mặt & Cúp pha lê', value: 'Tiền mặt & Cúp pha lê' },
                  { label: 'Chuyến du lịch nghỉ dưỡng 5 sao', value: 'Chuyến du lịch nghỉ dưỡng 5 sao' },
                  { label: 'Cổ phần thưởng ESOP', value: 'Cổ phần thưởng ESOP' },
                  { label: 'Bằng khen Ban Giám Đốc', value: 'Bằng khen Ban Giám Đốc' },
                ]}
              />
            </Form.Item>
            <Form.Item name="rewardValue" label="Giá trị phần thưởng (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" step={1000000} />
            </Form.Item>
          </div>

          <Form.Item name="achievementSummary" label="Tóm tắt thành tích đóng góp nổi bật">
            <Input.TextArea rows={2} placeholder="Mô tả chi tiết những thành tích và đóng góp mang lại giá trị cao cho công ty..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ban hành &amp; Vinh danh
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Quyết Định & Bằng Khen */}
      <Drawer
        title="Hồ Sơ Quyết Định Vinh Danh &amp; Bằng Khen Danh Dự"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedReward && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#FFFBEB', padding: 18, borderRadius: 8, border: '1px solid #FCD34D', textAlign: 'center' }}>
              <TrophyFilled style={{ fontSize: 36, color: '#D97706' }} />
              <div style={{ fontSize: 13, color: '#B45309', fontWeight: 800, marginTop: 6 }}>{selectedReward.decisionNo}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#78350F', marginTop: 4 }}>
                {selectedReward.title}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 6 }}>
                Vinh danh: <span style={{ color: '#009688' }}>{selectedReward.employeeName}</span> ({selectedReward.department})
              </div>
            </div>

            {/* Reward Information */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Chi Tiết Phần Thưởng &amp; Chế Độ:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Hình thức khen thưởng:</span>
                  <strong>{selectedReward.rewardType}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Giá trị quy đổi giải thưởng:</span>
                  <strong style={{ color: '#16A34A', fontSize: 14 }}>
                    +{selectedReward.rewardValue.toLocaleString('vi-VN')} ₫
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Người ký quyết định:</span>
                  <strong>{selectedReward.signerName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Trạng thái trao giải:</span>
                  <Tag color="success">{selectedReward.status}</Tag>
                </div>
              </div>
            </div>

            {/* Achievement */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                Thành Tích Đóng Góp Nổi Bật:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.5 }}>
                {selectedReward.achievementSummary}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                icon={<PrinterOutlined />}
                style={{ flex: 1 }}
                onClick={() => message.success(`Đã xuất file in Bằng Khen Danh Dự cho ${selectedReward.employeeName}`)}
              >
                In Bằng Khen (PDF)
              </Button>
              {selectedReward.status !== 'Đã trao giải' && (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                  onClick={() => {
                    handleConfirmAward(selectedReward);
                    setDrawerOpen(false);
                  }}
                >
                  Xác Nhận Đã Trao Thưởng
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
