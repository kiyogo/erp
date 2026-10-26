import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  UserOutlined,
  EditOutlined,
  BankOutlined,
  IdcardOutlined,
  PhoneOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ShopOutlined,
  TeamOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import { Modal, Form, Input, Button, message } from '../../custom-ui';
import { employeesApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { useAuth } from '../../context/AuthContext';
import { EmployeeProfileWizard } from './EmployeeProfileWizard';
import { getEmployeeOnboardingStorage, isEmployeeOnboardingComplete } from './onboardingStorage';
import { FileUploadDialog } from '../../components/FileUploadDialog';

const createEmptyProfile = (user?: { name?: string; email?: string }) => ({
  name: user?.name || '',
  email: user?.email || '',
  phone: '',
  bankName: '',
  bankAccount: '',
  avatar: '',
});

const normalizeProfile = (value: any, user?: { name?: string; email?: string }) => {
  if (!value || typeof value !== 'object') {
    return createEmptyProfile(user);
  }
  return {
    ...createEmptyProfile(user),
    ...value,
    details: value.details && typeof value.details === 'object' ? value.details : {},
  };
};

export const EmployeeProfileModule: React.FC<{ initialStep?: number }> = ({ initialStep }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const stepParam = searchParams.get('step');
  const parsedStep = stepParam !== null ? parseInt(stepParam, 10) : undefined;
  const effectiveInitialStep = initialStep !== undefined ? initialStep : parsedStep;

  const { user } = useAuth();
  const onboardingStorage = useMemo(() => getEmployeeOnboardingStorage(user), [user?.id, user?.email]);
  const [profile, setProfile] = useState<any>(() => createEmptyProfile(user));
  const [modalOpen, setModalOpen] = useState(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [avatarImgError, setAvatarImgError] = useState(false);
  const avatarFileInputRef = React.useRef<HTMLInputElement>(null);
  const [form] = Form.useForm();
  const [wizardDone, setWizardDone] = useState<boolean>(() => isEmployeeOnboardingComplete(onboardingStorage, user));
  const details = profile?.details && typeof profile.details === 'object' ? profile.details : {};

  // Lấy dữ liệu dự phòng từ bộ nhớ Onboarding/Wizard nếu chưa kịp đồng bộ server
  const wizardData = useMemo(() => {
    try {
      const raw = localStorage.getItem(onboardingStorage.data);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }, [onboardingStorage.data]);

  const bankAccountsFromDetails = Array.isArray(details?.bankAccounts) && details.bankAccounts.length > 0 ? details.bankAccounts : [];
  const primaryBankFromDetails = bankAccountsFromDetails.find((b: any) => b?.isPrimary) || bankAccountsFromDetails[0];

  const bankFromService = useMemo(() => {
    try {
      return dataService.getEmployeeBankAccount(profile?.employeeCode || profile?.code || details?.employeeCode);
    } catch {
      return null;
    }
  }, [profile?.employeeCode, profile?.code, details?.employeeCode]);

  const displayName = profile?.name || details?.name || wizardData?.name || user?.name || 'Chưa cập nhật';
  const employeeCode = profile?.employeeCode || profile?.code || details?.employeeCode || wizardData?.employeeCode || 'Chưa cập nhật';
  const position = profile?.position || profile?.title || details?.position || details?.title || wizardData?.position || 'Chưa cập nhật';
  const joinDate = profile?.joinDate || details?.joinDate || wizardData?.joinDate || 'Chưa cập nhật';
  const status = profile?.status || details?.status || wizardData?.status || 'Chính thức';
  const unit = profile?.unit || profile?.department || details?.unit || details?.department || wizardData?.unit || 'Chưa cập nhật';
  const manager = profile?.manager || profile?.directManager || details?.manager || details?.directManager || wizardData?.manager || 'Chưa cập nhật';

  // Số CCCD / Hộ chiếu
  const legalId = profile?.docNumber || details?.docNumber || profile?.idNumber || details?.idNumber || wizardData?.docNumber || wizardData?.idNumber || wizardData?.passportNumber || details?.passportNumber || 'Chưa cập nhật';
  const taxCode = profile?.taxCode || details?.taxCode || wizardData?.taxCode || 'Chưa cập nhật';
  const insuranceNumber = profile?.insuranceNumber || details?.insuranceNumber || wizardData?.insuranceNumber || 'Chưa cập nhật';

  // Tài khoản ngân hàng nhận lương
  const firstWizardBank = Array.isArray(wizardData?.bankAccounts)
    ? wizardData.bankAccounts.find((b: any) => b && (b.accountNumber || b.bankName))
    : null;

  const bankName = primaryBankFromDetails?.bankName || profile?.bankName || details?.bankName || bankFromService?.bankName || wizardData?.bankName || firstWizardBank?.bankName || 'Chưa cập nhật';
  const bankAccount = primaryBankFromDetails?.accountNumber || profile?.bankAccount || details?.bankAccount || bankFromService?.accountNumber || wizardData?.bankAccount || firstWizardBank?.accountNumber || 'Chưa cập nhật';
  const hasBankAccount = bankAccount !== 'Chưa cập nhật' && bankAccount !== '' && bankName !== 'Chưa cập nhật' && bankName !== '';
  const accountHolderName = hasBankAccount
    ? (primaryBankFromDetails?.accountHolder || profile?.accountHolder || details?.accountHolder || bankFromService?.accountHolder || wizardData?.accountHolder || firstWizardBank?.accountHolder || (displayName !== 'Chưa cập nhật' ? displayName.toUpperCase() : 'Chưa cập nhật'))
    : 'Chưa cập nhật';

  const email = profile?.email || details?.email || wizardData?.email || user?.email || 'Chưa cập nhật';
  const phone = profile?.phone || details?.phone || wizardData?.phone || 'Chưa cập nhật';
  const address = profile?.address || details?.currentAddress || details?.hkttAddress || details?.address || wizardData?.currentAddress || wizardData?.hkttAddress || wizardData?.address || 'Chưa cập nhật';
  const avatarSrc = !avatarImgError && (profile?.avatar || profile?.avatarUrl || details?.avatarUrl || wizardData?.avatarUrl || wizardData?.cardAvatarUrl)
    ? (profile?.avatar || profile?.avatarUrl || details?.avatarUrl || wizardData?.avatarUrl || wizardData?.cardAvatarUrl)
    : '';

  const handleAvatarFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.name.match(/\.(png|jpe?g|webp|gif|svg|bmp)$/i)) {
      message.error('Vui lòng chọn tệp hình ảnh hợp lệ!');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      if (base64 && (base64.startsWith('data:image/') || base64.startsWith('http') || base64.startsWith('/api/'))) {
        setAvatarImgError(false);
        setProfile((prev: any) => ({ ...prev, avatar: base64 }));
        try {
          await employeesApi.updateMyProfile({ avatar: base64 });
          message.success('Đã cập nhật ảnh đại diện thành công!');
        } catch {
          message.success('Đã lưu ảnh đại diện.');
        }
      } else {
        message.error('Định dạng ảnh không hợp lệ.');
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    setWizardDone(isEmployeeOnboardingComplete(onboardingStorage, user, profile));
  }, [onboardingStorage, user]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await employeesApi.getMyProfile();
        const empData = response.data?.employee;
        const normalized = normalizeProfile(empData, user);
        setProfile(normalized);

        // Check if onboarding is already complete from server data or local storage
        if (isEmployeeOnboardingComplete(onboardingStorage, user, empData)) {
          setWizardDone(true);
        }
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Không thể tải hồ sơ nhân sự.');
      }
    })();
  }, [user?.id, user?.email, onboardingStorage]);

  const handleWizardDone = () => {
    setWizardDone(true);
    void employeesApi.getMyProfile().then((response) => setProfile(normalizeProfile(response.data?.employee, user)));
  };

  if (!wizardDone || effectiveInitialStep !== undefined) {
    return <EmployeeProfileWizard storage={onboardingStorage} onDone={handleWizardDone} initialStep={effectiveInitialStep} />;
  }

  const handleOpenEditModal = () => {
    form.setFieldsValue({
      phone: phone !== 'Chưa cập nhật' ? phone : '',
      address: address !== 'Chưa cập nhật' ? address : '',
      bankName: bankName !== 'Chưa cập nhật' ? bankName : '',
      bankAccount: bankAccount !== 'Chưa cập nhật' ? bankAccount : '',
    });
    setModalOpen(true);
  };

  const handleUpdate = async (values: any) => {
    try {
      const existingBankAccounts = Array.isArray(details.bankAccounts) ? details.bankAccounts : [];
      const updatedBankAccounts = existingBankAccounts.length > 0
        ? existingBankAccounts.map((b: any, idx: number) => idx === 0 ? { ...b, bankName: values.bankName, accountNumber: values.bankAccount, accountHolder: (displayName !== 'Chưa cập nhật' ? displayName.toUpperCase() : b.accountHolder), branch: values.address || b.branch, status: 'Chờ duyệt' } : b)
        : [{
            id: `ba-${Date.now()}`,
            bankName: values.bankName,
            accountNumber: values.bankAccount,
            accountHolder: (displayName !== 'Chưa cập nhật' ? displayName.toUpperCase() : ''),
            branch: '',
            isPrimary: true,
            status: 'Chờ duyệt',
            employeeCode: employeeCode,
            employeeName: displayName,
          }];

      const payload = {
        phone: values.phone,
        bankAccount: values.bankAccount,
        bankName: values.bankName,
        details: {
          ...details,
          ...values,
          bankAccounts: updatedBankAccounts,
          bankAccount: values.bankAccount,
          bankName: values.bankName,
          bankStatus: 'Chờ duyệt',
        },
      };
      const response = await employeesApi.updateMyProfile(payload);
      setProfile(normalizeProfile(response.data?.employee, user));
      dataService.saveEmployeeBankAccount(updatedBankAccounts[0], true);
      message.success('Đã cập nhật thông tin hồ sơ và gửi duyệt tài khoản ngân hàng thành công!');
      setModalOpen(false);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể cập nhật hồ sơ.');
    }
  };

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  return (
    <div style={{ padding: isMobile ? '16px 10px 48px 10px' : '16px 10px', width: '100%', boxSizing: 'border-box' }}>

      {/* Profile Overview Banner đồng bộ 100% với /hr/employees/edit */}
      <div
        style={{
          background: 'linear-gradient(90deg, #F4EEFD 0%, #EEF4FD 50%, #E8F2FD 100%)',
          border: '1px solid #E4DCF5',
          borderRadius: 8,
          padding: 15,
          marginBottom: 16,
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
          boxSizing: 'border-box',
        }}
      >
        {/* Direct File Picker Input for Avatar */}
        <input
          type="file"
          ref={avatarFileInputRef}
          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif,image/bmp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void handleAvatarFile(file);
            }
            e.target.value = '';
          }}
        />

        {/* Avatar Box 3:4 */}
        <div
          onClick={() => setAvatarPickerOpen(true)}
          style={{
            width: 72,
            height: 96,
            aspectRatio: '3 / 4',
            borderRadius: 6,
            background: '#E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
            cursor: 'pointer',
            position: 'relative',
          }}
          title="Nhấp vào để mở menu chọn tệp ảnh đại diện"
        >
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt=""
              onError={() => setAvatarImgError(true)}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
                fontSize: 24,
                fontWeight: 700,
                background: 'linear-gradient(180deg, #E2E8F0 0%, #CBD5E1 100%)',
              }}
            >
              {displayName !== 'Chưa cập nhật' ? displayName.trim().charAt(0).toUpperCase() : <UserOutlined />}
            </div>
          )}

          {/* Hover overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.55)',
              color: '#FFFFFF',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              opacity: 0,
              transition: 'opacity 0.2s ease',
              fontSize: 11.5,
              fontWeight: 600,
              backdropFilter: 'blur(1px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = '0';
            }}
          >
            <CameraOutlined style={{ fontSize: 20 }} />
            <span>Đổi ảnh</span>
          </div>
        </div>

        {/* Name & 6 Metric Cards */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
            {displayName}
          </div>

          {/* 6 Info Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, width: '100%' }}>
            {/* 1. Mã nhân viên */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E8EEF5', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#DBEAFE', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }}>
                #
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: '#64748B' }}>Mã nhân viên</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{employeeCode}</div>
              </div>
            </div>

            {/* 2. Chức vụ */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E8EEF5', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#EDE9FE', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                <UserOutlined />
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: '#64748B' }}>Chức vụ</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{position}</div>
              </div>
            </div>

            {/* 3. Vào làm */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E8EEF5', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                <CalendarOutlined />
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: '#64748B' }}>Vào làm</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{joinDate}</div>
              </div>
            </div>

            {/* 4. Trạng thái */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E8EEF5', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                <CheckCircleOutlined />
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: '#64748B' }}>Trạng thái</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{status}</div>
              </div>
            </div>

            {/* 5. Đơn vị */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E8EEF5', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                <ShopOutlined />
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: '#64748B' }}>Đơn vị</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{unit}</div>
              </div>
            </div>

            {/* 6. Quản lý */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E8EEF5', borderRadius: 8, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: '#E0E7FF', color: '#4338CA', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                <TeamOutlined />
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: '#64748B' }}>Quản lý</div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{manager}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Info Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        {/* Card 1: Thông tin định danh & Nhân thân */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#212121', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <IdcardOutlined style={{ color: '#009688' }} /> Thông tin Pháp lý &amp; Định danh
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#757575' }}>Số CCCD / Hộ chiếu:</span>
              <span style={{ fontWeight: 500, color: '#212121' }}>{legalId}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#757575' }}>Mã số thuế cá nhân:</span>
              <span style={{ fontWeight: 500, color: '#212121' }}>{taxCode}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#757575' }}>Số sổ BHXH:</span>
              <span style={{ fontWeight: 500, color: '#212121' }}>{insuranceNumber}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Tài khoản nhận lương */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#212121', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <BankOutlined style={{ color: '#009688' }} /> Tài Khoản Nhận Lương Ngân Hàng
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#757575' }}>Tên Ngân hàng:</span>
              <span style={{ fontWeight: 500, color: '#212121' }}>{bankName}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#757575' }}>Số tài khoản:</span>
              <span style={{ fontWeight: 600, color: '#009688' }}>{bankAccount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#757575' }}>Chủ tài khoản:</span>
              <span style={{ fontWeight: 500, color: '#212121' }}>{accountHolderName}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Thông tin liên hệ */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: '18px 20px' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#212121', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <PhoneOutlined style={{ color: '#009688' }} /> Thông Tin Liên Lạc
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#757575' }}>Email doanh nghiệp:</span>
              <span style={{ fontWeight: 500, color: '#212121' }}>{email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#757575' }}>Số điện thoại:</span>
              <span style={{ fontWeight: 500, color: '#212121' }}>{phone}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#757575' }}>Địa chỉ liên hệ:</span>
              <span style={{ fontWeight: 500, color: '#212121', textAlign: 'right', maxWidth: '60%' }}>{address}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      <Modal
        title="Cập Nhật Thông Tin Hồ Sơ Cá Nhân"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Lưu thông tin"
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical" onFinish={handleUpdate}>
          <Form.Item name="phone" label="Số điện thoại cá nhân">
            <Input placeholder="Nhập số điện thoại..." />
          </Form.Item>
          <Form.Item name="address" label="Địa chỉ cư trú" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="bankName" label="Ngân hàng & Chi nhánh" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="bankAccount" label="Số tài khoản ngân hàng" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      {/* FileUploadDialog for Avatar */}
      <FileUploadDialog
        open={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        accept="image/*"
        multiple={false}
        title="Chọn ảnh đại diện nhân viên"
        confirmText="Cập nhật ảnh đại diện"
        onSelect={(files) => {
          if (files && files[0]) {
            void handleAvatarFile(files[0]);
          }
        }}
      />
    </div>
  );
};
