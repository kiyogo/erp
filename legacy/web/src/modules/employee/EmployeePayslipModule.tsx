import React, { useState, useEffect } from 'react';
import {
  DownloadOutlined,
  EyeOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  FileProtectOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  BankOutlined,
  CreditCardOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Input, Button, message, Select } from '../../custom-ui';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { useAuth } from '../../context/AuthContext';

interface BankFormState {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string;
  reason: string;
}

export const EmployeePayslipModule: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedPayslip, setSelectedPayslip] = useState<any | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [signedMonths, setSignedMonths] = useState<Record<string, boolean>>({});
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankForm, setBankForm] = useState<BankFormState>({
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    branch: '',
    reason: '',
  });

  const loadData = () => {
    setData(dataService.getEmployeePayslips());
    const existing = dataService.getEmployeeBankAccount();
    if (existing) {
      setBankForm({
        bankName: existing.bankName || '',
        accountNumber: existing.accountNumber || '',
        accountHolder: existing.accountHolder || '',
        branch: existing.branch || '',
        reason: existing.reason || '',
      });
    }
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(loadData);
    return unsub;
  }, []);

  const handleSignPayslip = async (payslip: any) => {
    const emp = dataService.getEmployeeProfile();
    try {
      await dataService.signEmployeePayslip(payslip.key || payslip.id, user?.name || emp?.name || '');
      setSignedMonths(prev => ({ ...prev, [payslip.key]: true }));
      message.success(`Đã lưu xác nhận phiếu lương ${payslip.month}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error.message || 'Không thể xác nhận phiếu lương.');
    }
  };

  const filteredData = data.filter((item) =>
    (item.month || '').toLowerCase().includes(searchText.toLowerCase()) ||
    (item.status || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const columns = [
    {
      title: 'Kỳ trả lương',
      dataIndex: 'month',
      key: 'month',
      render: (m: string) => <span style={{ fontWeight: 600, color: '#212121' }}>{m}</span>,
    },
    {
      title: 'Lương cơ bản',
      dataIndex: 'basicSalary',
      key: 'basicSalary',
      render: (v: number) => <span>{v.toLocaleString('vi-VN')} ₫</span>,
    },
    {
      title: 'Phụ cấp & Thưởng KPI',
      key: 'allowances',
      render: (_: any, r: any) => (
        <span style={{ color: '#2E7D32', fontWeight: 500 }}>
          +{(r.allowance + r.bonusKPI).toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Trích đóng BHXH & Thuế',
      key: 'deductions',
      render: (_: any, r: any) => (
        <span style={{ color: '#C62828' }}>
          -{(r.insuranceDeduction + r.personalTax).toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Thực lĩnh',
      dataIndex: 'netSalary',
      key: 'netSalary',
      render: (v: number) => (
        <span style={{ fontWeight: 700, color: '#009688', fontSize: 14 }}>
          {v.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (s: string) => (
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, background: '#E8F5E9', color: '#2E7D32' }}>
          {s}
        </span>
      ),
    },
    {
      title: 'Xác nhận cá nhân',
      key: 'signStatus',
      render: (_: any, record: any) => {
        const isSigned = signedMonths[record.key] || Boolean(record.signedDate);
        return isSigned ? (
          <span style={{ color: '#009688', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <CheckCircleOutlined /> Đã xác nhận
          </span>
        ) : (
          <Button
            size="small"
            type="primary"
            style={{ backgroundColor: '#7C3AED', borderColor: '#7C3AED', fontSize: 12 }}
            onClick={() => handleSignPayslip(record)}
          >
            Xác nhận phiếu lương
          </Button>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_: any, record: any) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedPayslip(record);
            setModalOpen(true);
          }}
        >
          Xem chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* Search & Actions Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          placeholder="Tìm theo kỳ lương..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ width: 320, borderRadius: 6 }}
          allowClear
        />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button icon={<DownloadOutlined />} onClick={() => {
            downloadFile('Bang_Tong_Hop_Phieu_Luong_Ca_Nhan.xlsx', generateValidXlsxBlob([
              ['Kỳ lương', 'Lương cơ bản', 'Phụ cấp', 'Thưởng KPI', 'Bảo hiểm', 'Thuế TNCN', 'Thực lĩnh', 'Trạng thái'],
              ...data.map(item => [item.month, item.basicSalary, item.allowance, item.bonusKPI, item.insuranceDeduction, item.personalTax, item.netSalary, item.status]),
            ]));
            message.success('Đã xuất file bảng kê phiếu lương cá nhân thành công!');
          }}>
            Tải Toàn Bộ Phiếu Lương
          </Button>
          <Button
            type="primary"
            icon={<BankOutlined />}
            onClick={() => setBankModalOpen(true)}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Cập nhật ngân hàng
          </Button>
        </div>
      </div>

      {/* Payslip Table */}
      <div className="transparent-table-card" style={{ width: '100%' }}>
        <KTable
          dataSource={filteredData}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 10 }}
        />
      </div>

      {/* Detailed Modal */}
      {selectedPayslip && (
        <Modal
          title={`Chi Tiết Phiếu Lương Điện Tử - ${selectedPayslip.month}`}
          open={modalOpen}
          onCancel={() => setModalOpen(false)}
          footer={[
            <Button key="download" icon={<DownloadOutlined />} onClick={() => {
              downloadFile(`Phieu_Luong_${selectedPayslip.month.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`, generateValidPdfBlob(
                `Phiếu lương ${selectedPayslip.month}`, dataService.getEmployeeProfile()?.name || '',
                [
                  `Lương cơ bản: ${selectedPayslip.basicSalary} VND`,
                  `Phụ cấp: ${selectedPayslip.allowance} VND`,
                  `Thưởng KPI: ${selectedPayslip.bonusKPI} VND`,
                  `Bảo hiểm: ${selectedPayslip.insuranceDeduction} VND`,
                  `Thuế TNCN: ${selectedPayslip.personalTax} VND`,
                  `Thực lĩnh: ${selectedPayslip.netSalary} VND`,
                  `Trạng thái: ${selectedPayslip.status}`,
                ],
              ));
              message.success(`Đã tải file PDF ${selectedPayslip.month} thành công!`);
            }}>
              Tải PDF Phiếu Lương
            </Button>,
            <Button key="close" type="primary" onClick={() => setModalOpen(false)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Đóng
            </Button>,
          ]}
          width={580}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 0', fontSize: 13.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid #F0F0F0' }}>
              <span style={{ color: '#757575' }}>Lương cơ bản đóng bảo hiểm:</span>
              <span style={{ fontWeight: 600 }}>{selectedPayslip.basicSalary.toLocaleString('vi-VN')} ₫</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid #F0F0F0' }}>
              <span style={{ color: '#757575' }}>Phụ cấp ăn trưa &amp; xăng xe:</span>
              <span style={{ color: '#2E7D32', fontWeight: 500 }}>+{selectedPayslip.allowance.toLocaleString('vi-VN')} ₫</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid #F0F0F0' }}>
              <span style={{ color: '#757575' }}>Thưởng hiệu suất công việc:</span>
              <span style={{ color: '#2E7D32', fontWeight: 600 }}>+{selectedPayslip.bonusKPI.toLocaleString('vi-VN')} ₫</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid #F0F0F0' }}>
              <span style={{ color: '#757575' }}>Trích đóng BHXH (8%), BHYT (1.5%), BHTN (1%):</span>
              <span style={{ color: '#C62828', fontWeight: 500 }}>-{selectedPayslip.insuranceDeduction.toLocaleString('vi-VN')} ₫</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid #F0F0F0' }}>
              <span style={{ color: '#757575' }}>Khấu trừ Thuế thu nhập cá nhân:</span>
              <span style={{ color: '#C62828', fontWeight: 500 }}>-{selectedPayslip.personalTax.toLocaleString('vi-VN')} ₫</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#E0F2F1',
                borderRadius: 6,
                marginTop: 6,
              }}
            >
              <span style={{ fontWeight: 600, color: '#00796B', fontSize: 15 }}>Tổng số tiền thực lĩnh:</span>
              <span style={{ fontWeight: 800, color: '#009688', fontSize: 18 }}>
                {selectedPayslip.netSalary.toLocaleString('vi-VN')} ₫
              </span>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Cập Nhật Ngân Hàng */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#009688', fontSize: 16, fontWeight: 600 }}>
            <BankOutlined /> Cập Nhật Tài Khoản Ngân Hàng Nhận Lương
          </div>
        }
        open={bankModalOpen}
        onCancel={() => setBankModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setBankModalOpen(false)}>
            Hủy Bỏ
          </Button>,
          <Button
            key="submit"
            type="primary"
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            onClick={() => {
              if (!bankForm?.bankName || !bankForm?.accountNumber || !bankForm?.accountHolder) {
                message.error('Vui lòng điền đầy đủ Tên ngân hàng, Số tài khoản và Tên chủ tài khoản!');
                return;
              }
              dataService.updateEmployeeBankAccount(bankForm);
              message.success('Cập nhật thông tin tài khoản ngân hàng nhận lương thành công!');
              setBankModalOpen(false);
            }}
          >
            Lưu Thay Đổi
          </Button>,
        ]}
        width={560}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 0' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#424242' }}>
              Ngân hàng thụ hưởng <span style={{ color: 'red' }}>*</span>
            </div>
            <Select
              value={bankForm?.bankName || ''}
              onChange={(val: string) => setBankForm(prev => ({ ...prev, bankName: val }))}
              placeholder="Chọn ngân hàng"
              style={{ width: '100%' }}
              options={[
                { value: 'Ngân hàng TMCP Ngoại Thương VN (Vietcombank)', label: 'Vietcombank - Ngân hàng Ngoại Thương VN' },
                { value: 'Ngân hàng TMCP Quân Đội (MB Bank)', label: 'MB Bank - Ngân hàng Quân Đội' },
                { value: 'Ngân hàng TMCP Kỹ Thương VN (Techcombank)', label: 'Techcombank - Ngân hàng Kỹ Thương VN' },
                { value: 'Ngân hàng TMCP Đầu Tư và Phát Triển VN (BIDV)', label: 'BIDV - Ngân hàng Đầu Tư & Phát Triển VN' },
                { value: 'Ngân hàng Nông nghiệp & Phát triển Nông thôn (Agribank)', label: 'Agribank - Ngân hàng NN&PTNT VN' },
                { value: 'Ngân hàng TMCP Á Châu (ACB)', label: 'ACB - Ngân hàng TMCP Á Châu' },
                { value: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)', label: 'VPBank - Ngân hàng Việt Nam Thịnh Vượng' },
                { value: 'Ngân hàng TMCP Tiên Phong (TPBank)', label: 'TPBank - Ngân hàng Tiên Phong' },
                { value: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)', label: 'Sacombank - Sài Gòn Thương Tín' },
                { value: 'Ngân hàng Quốc tế (VIB)', label: 'VIB - Ngân hàng Quốc tế' },
                { value: 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)', label: 'HDBank - Ngân hàng Phát triển TP.HCM' },
                { value: 'Ngân hàng TMCP Phương Đông (OCB)', label: 'OCB - Ngân hàng Phương Đông' },
                { value: 'Ngân hàng TNHH MTV Shinhan Việt Nam', label: 'Shinhan Bank Việt Nam' },
              ]}
            />
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#424242' }}>
              Số tài khoản ngân hàng <span style={{ color: 'red' }}>*</span>
            </div>
            <Input
              prefix={<CreditCardOutlined style={{ color: '#9E9E9E' }} />}
              value={bankForm?.accountNumber || ''}
              onChange={(e) => setBankForm(prev => ({ ...prev, accountNumber: e.target.value }))}
              placeholder="Nhập số tài khoản ngân hàng..."
            />
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#424242' }}>
              Tên chủ tài khoản <span style={{ color: 'red' }}>*</span>
            </div>
            <Input
              value={bankForm?.accountHolder || ''}
              onChange={(e) => setBankForm(prev => ({ ...prev, accountHolder: e.target.value.toUpperCase() }))}
              placeholder="VD: NGUYEN VAN MINH"
            />
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#424242' }}>
              Chi nhánh ngân hàng
            </div>
            <Input
              value={bankForm?.branch || ''}
              onChange={(e) => setBankForm(prev => ({ ...prev, branch: e.target.value }))}
              placeholder="VD: Chi nhánh Sở Giao Dịch - Hà Nội"
            />
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4, color: '#424242' }}>
              Lý do thay đổi / Ghi chú
            </div>
            <Input.TextArea
              rows={2}
              value={bankForm?.reason || ''}
              onChange={(e: any) => setBankForm(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="VD: Chuyển sang tài khoản ngân hàng chính sử dụng nhận lương..."
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};
