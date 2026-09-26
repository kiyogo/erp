import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  TrophyOutlined,
  StarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  DollarOutlined,
  UserOutlined,
  ApartmentOutlined,
  AuditOutlined,
  CheckOutlined,
  StarFilled,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer, Card, Tooltip } from '../../custom-ui';

import { useEffect } from 'react';
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

export interface EnterprisePerformanceReview {
  key: string;
  code: string;
  employeeName: string;
  empCode: string;
  department: string;
  position: string;
  period: string;
  productivityScore: number; // 60%
  disciplineScore: number; // 20%
  innovationScore: number; // 20%
  selfScore: number;
  managerScore: number;
  grade: 'A+ (Xuất sắc)' | 'A (Tốt)' | 'B (Đạt)' | 'C (Cần cải thiện)';
  kpiBonus: number;
  evaluator: string;
  managerComment: string;
  status: 'Đã hoàn tất đánh giá' | 'Chờ phê duyệt điểm';
}

export const PerformanceReviewModule: React.FC = () => {
  const [data, setData] = useState<EnterprisePerformanceReview[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [posOptions, setPosOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedReview, setSelectedReview] = useState<EnterprisePerformanceReview | null>(null);

  const loadData = async () => {
    try {
      const [res, orgUnits, positions] = await Promise.all([
        collectionsApi.get<EnterprisePerformanceReview>('hr_performance_reviews', { limit: 500 }),
        dataService.fetchOrgUnitsList(),
        dataService.fetchDropdownOptions('positions'),
      ]);
      const list = res.data?.data || [];
      setData(list.map((item: any) => ({ ...item, key: item.id || item.key })));
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
      setPosOptions(positions.filter((p) => p.isActive !== false).map((p) => ({ label: p.name, value: p.name })));
    } catch {
      setData([]);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const totalBonus = data.reduce((sum, item) => sum + item.kpiBonus, 0);
  const excellentCount = data.filter((d) => d.grade.startsWith('A+')).length;
  const avgScore = data.length > 0 ? (data.reduce((sum, item) => sum + item.managerScore, 0) / data.length).toFixed(1) : '0.0';

  const handleCreate = async (values: any) => {
    const sScore = Number(values.selfScore) || 85;
    const mScore = Number(values.managerScore) || sScore;
    let gr: EnterprisePerformanceReview['grade'] = 'B (Đạt)';
    if (mScore >= 95) gr = 'A+ (Xuất sắc)';
    else if (mScore >= 85) gr = 'A (Tốt)';
    else if (mScore >= 70) gr = 'B (Đạt)';
    else gr = 'C (Cần cải thiện)';

    const id = `review-${Date.now()}`;
    const newRev: EnterprisePerformanceReview = {
      ...values,
      key: id,
      empCode: values.empCode || `KY-${String(Date.now()).slice(-3)}`,
      productivityScore: 54,
      disciplineScore: 18,
      innovationScore: 18,
      selfScore: sScore,
      managerScore: mScore,
      grade: gr,
      kpiBonus: Number(values.kpiBonus) || 10000000,
      status: 'Chờ phê duyệt điểm',
    };
    try {
      await collectionsApi.create('hr_performance_reviews', newRev, id);
      message.success(`Đã khởi tạo phiếu đánh giá hiệu suất KPI cho: ${values.employeeName}`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu phiếu đánh giá.');
    }
  };

  const handleApprove = async (record: EnterprisePerformanceReview) => {
    try {
      await collectionsApi.update('hr_performance_reviews', record.key, { status: 'Đã hoàn tất đánh giá' });
      message.success(`Đã phê duyệt điểm đánh giá & chi thưởng KPI cho ${record.employeeName}`);
      await loadData();
    } catch {
      message.error('Không thể cập nhật trạng thái phê duyệt.');
    }
  };

  const filteredData = data.filter((item) => {
    const matchGrade = gradeFilter === 'all' || item.grade.includes(gradeFilter) || item.status === gradeFilter;
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.evaluator || '').toLowerCase().includes(searchText.toLowerCase());

    return matchGrade && matchSearch;
  });

  const columns = [
    {
      title: 'Mã phiếu & Nhân viên',
      key: 'name',
      render: (_: any, r: EnterprisePerformanceReview) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{r.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600 }}>
            Mã: <code>{r.code}</code> · {r.position} ({r.department})
          </div>
        </div>
      ),
    },
    {
      title: 'Kỳ đánh giá',
      dataIndex: 'period',
      key: 'period',
      width: 140,
      render: (p: string) => <Tag color="blue">{p}</Tag>,
    },
    {
      title: 'Điểm tự chấm / Quản lý',
      key: 'scores',
      width: 200,
      render: (_: any, r: EnterprisePerformanceReview) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
            <span style={{ color: '#64748B' }}>Tự: {r.selfScore}đ</span>
            <strong style={{ color: '#009688', fontSize: 13 }}>QL: {r.managerScore}đ</strong>
          </div>
          <Progress percent={r.managerScore} size="small" strokeColor="#009688" showInfo={false} />
        </div>
      ),
    },
    {
      title: 'Xếp loại KPI',
      dataIndex: 'grade',
      key: 'grade',
      width: 150,
      render: (grade: string) => {
        let color = 'default';
        if (grade.startsWith('A+')) color = 'gold';
        else if (grade.startsWith('A')) color = 'green';
        else if (grade.startsWith('B')) color = 'blue';
        else color = 'error';
        return <Tag color={color} style={{ fontWeight: 700 }}>{grade}</Tag>;
      },
    },
    {
      title: 'Thưởng hiệu suất',
      dataIndex: 'kpiBonus',
      key: 'kpiBonus',
      width: 160,
      render: (val: number) => (
        <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
          +{val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => (
        <Tag color={status === 'Đã hoàn tất đánh giá' ? 'success' : 'warning'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 140,
      render: (_: any, record: EnterprisePerformanceReview) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedReview(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          {record.status === 'Chờ phê duyệt điểm' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={() => handleApprove(record)}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Duyệt
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự đạt loại A+ (Xuất sắc)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {excellentCount} Cán bộ nhân viên
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Được xét duyệt thăng tiến &amp; thưởng lớn</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quỹ thưởng hiệu suất KPI quý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalBonus.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Chi trả cùng kỳ lương tháng tiếp theo</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Điểm đánh giá trung bình toàn công ty</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {avgScore} / 100 Điểm
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Mô hình đánh giá 360 độ 3 tiêu chuẩn</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiến độ hoàn tất đánh giá KPI</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {Math.round((data.filter((d) => d.status === 'Đã hoàn tất đánh giá').length / data.length) * 100)}% Hoàn thành
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Còn 1 phiếu chờ Lãnh đạo duyệt điểm</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đánh giá' },
            { key: 'A+', label: 'A+ Xuất sắc', icon: <StarFilled style={{ color: '#F59E0B' }} /> },
            { key: 'A (Tốt)', label: 'A Tốt' },
            { key: 'Chờ phê duyệt điểm', label: 'Chờ duyệt', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setGradeFilter(tab.key)}
              style={{
                backgroundColor: gradeFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: gradeFilter === tab.key ? '#009688' : '#CBD5E1',
                color: gradeFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: gradeFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã phiếu, tên nhân viên, phòng ban..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất bảng tổng hợp đánh giá KPI')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `DG-2026/Q2-0${data.length + 1}`,
                period: 'Quý II / 2026',
                selfScore: 90,
                managerScore: 92,
                kpiBonus: 15000000,
                evaluator: 'Trần Tuấn Anh (CTO)',
                department: 'Phòng Ban Kỹ Thuật',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập phiếu đánh giá
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm phiếu đánh giá mới */}
      <Modal
        title="Lập Phiếu Đánh Giá Hiệu Suất &amp; Thưởng KPI Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã phiếu" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="period" label="Kỳ đánh giá" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Quý II / 2026', value: 'Quý II / 2026' },
                  { label: 'Quý III / 2026', value: 'Quý III / 2026' },
                  { label: 'Cả năm 2026', value: 'Cả năm 2026' },
                ]}
              />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban" rules={[{ required: true }]}>
              <Select
                options={deptOptions.length > 0 ? deptOptions : [
                  { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
                ]}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Nhân sự được đánh giá" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Hoàng Quốc Dũng" />
            </Form.Item>
            <Form.Item name="position" label="Chức danh đảm nhiệm">
              {posOptions.length > 0 ? (
                <Select options={posOptions} placeholder="Chọn chức danh..." />
              ) : (
                <Input placeholder="Ví dụ: Kỹ sư Lead" />
              )}
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="selfScore" label="Điểm Tự chấm (1-100)" rules={[{ required: true }]}>
              <Input type="number" min={1} max={100} />
            </Form.Item>
            <Form.Item name="managerScore" label="Điểm Quản lý chấm (1-100)" rules={[{ required: true }]}>
              <Input type="number" min={1} max={100} />
            </Form.Item>
            <Form.Item name="kpiBonus" label="Mức thưởng KPI (VNĐ)">
              <Input type="number" step={1000000} />
            </Form.Item>
          </div>

          <Form.Item name="evaluator" label="Người đánh giá (Quản lý trực tiếp)" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Trần Tuấn Anh (CTO)" />
          </Form.Item>

          <Form.Item name="managerComment" label="Nhận xét của Quản lý">
            <Input.TextArea rows={2} placeholder="Đánh giá kết quả công việc, tinh thần trách nhiệm và đóng góp..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu đánh giá
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Phiếu Đánh Giá 360 */}
      <Drawer
        title="Bảng Điểm Đánh Giá Hiệu Suất 360 Độ &amp; Nhận Xét Lãnh Đạo"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
      >
        {selectedReview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedReview.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedReview.employeeName}
                  </div>
                </div>
                <Tag color={selectedReview.status === 'Đã hoàn tất đánh giá' ? 'success' : 'warning'}>
                  {selectedReview.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                Chức danh: <strong>{selectedReview.position}</strong> · Phòng ban: <strong>{selectedReview.department}</strong> · Kỳ: <Tag color="blue">{selectedReview.period}</Tag>
              </div>
            </div>

            {/* 3 Pillars Score Breakdown */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Điểm Đánh Giá 3 Trụ Cột Năng Lực (360 Degree):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span>1. Năng suất &amp; Chất lượng công việc (Tỷ trọng 60%):</span>
                    <strong style={{ color: '#009688' }}>{selectedReview.productivityScore || 56} / 60 đ</strong>
                  </div>
                  <Progress percent={Math.round(((selectedReview.productivityScore || 56) / 60) * 100)} strokeColor="#009688" size="small" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span>2. Tác phong, Kỷ luật &amp; Tiến độ (Tỷ trọng 20%):</span>
                    <strong style={{ color: '#2563EB' }}>{selectedReview.disciplineScore || 19} / 20 đ</strong>
                  </div>
                  <Progress percent={Math.round(((selectedReview.disciplineScore || 19) / 20) * 100)} strokeColor="#2563EB" size="small" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span>3. Sáng tạo, Cải tiến &amp; Văn hóa (Tỷ trọng 20%):</span>
                    <strong style={{ color: '#7C3AED' }}>{selectedReview.innovationScore || 19} / 20 đ</strong>
                  </div>
                  <Progress percent={Math.round(((selectedReview.innovationScore || 19) / 20) * 100)} strokeColor="#7C3AED" size="small" />
                </div>
              </div>
            </div>

            {/* Total Result & Bonus */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#15803D', fontSize: 12 }}>Tổng điểm Quản lý:</span>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#166534' }}>
                    {selectedReview.managerScore} / 100 Điểm
                  </div>
                  <Tag color="gold" style={{ fontWeight: 800, fontSize: 12, marginTop: 4 }}>
                    {selectedReview.grade}
                  </Tag>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: '#15803D', fontSize: 12 }}>Thưởng hiệu suất KPI:</span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A' }}>
                    +{selectedReview.kpiBonus.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
              </div>
            </div>

            {/* Manager Comment */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                Nhận xét từ {selectedReview.evaluator}:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', fontStyle: 'italic', lineHeight: 1.5 }}>
                "{selectedReview.managerComment || 'Hoàn thành xuất sắc nhiệm vụ được giao, có tinh thần cầu tiến và chủ động trong công việc.'}"
              </div>
            </div>

            {/* Action */}
            {selectedReview.status === 'Chờ phê duyệt điểm' && (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => {
                  handleApprove(selectedReview);
                  setDrawerOpen(false);
                }}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Phê Duyệt Điểm &amp; Chuyển Kế Toán Chi Thưởng
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};
