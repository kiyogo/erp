import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  UserOutlined,
  TeamOutlined,
  ShopOutlined,
  HeartOutlined,
  SafetyCertificateOutlined,
  SkinOutlined,
  BankOutlined,
  ArrowRightOutlined,
  ArrowLeftOutlined,
  CheckOutlined,
  CameraOutlined,
  IdcardOutlined,
  BookOutlined,
  PhoneOutlined,
  HomeOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ScissorOutlined,
  CalendarOutlined,
  MedicineBoxOutlined,
  QrcodeOutlined,
  BulbOutlined,
  FileTextOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  WarningFilled,
  UploadOutlined,
  ReloadOutlined,
  ScanOutlined,
} from '@ant-design/icons';
import { Button, Input, Select, Checkbox, Modal, message } from '../../custom-ui';
import { dataService } from '../../services/dataService';
import { employeesApi } from '../../api/endpoints';
import { FileUploadDialog } from '../../components/FileUploadDialog';
import signatureImg from '../../assets/signature_son.png';
import { type EmployeeOnboardingStorage, markEmployeeOnboardingComplete } from './onboardingStorage';
import { useAuth } from '../../context/AuthContext';
import { QRCode } from '../ekyc/qr/QRCode';

import {
  EkycExtractedData,
  CardValidationResult,
  BiometricMatchResult,
  useCamera,
  useFaceDetection,
  FaceScanningViewfinder,
  CardScanningViewfinder,
  CardValidationService,
  EkycService,
} from '../ekyc';

const ACCOUNT_DISPLAY_KEY = 'kiyovn_account_display_name';
const ACCOUNT_AVATAR_KEY = 'kiyovn_account_avatar_url';

// Constants & Dropdown Options matching /hr/employees/edit/...
const GENDER_OPTIONS = [
  { label: 'Nam', value: 'Nam' },
  { label: 'Nữ', value: 'Nữ' },
  { label: 'Chuyển giới', value: 'Chuyển giới' },
  { label: 'Liên giới tính', value: 'Liên giới tính' },
];

const SEXUAL_ORIENTATION_OPTIONS = [
  { label: 'Dị tính', value: 'Dị tính' },
  { label: 'Đồng tính nam', value: 'Đồng tính nam' },
  { label: 'Đồng tính nữ', value: 'Đồng tính nữ' },
  { label: 'Song tính', value: 'Song tính' },
  { label: 'Toàn tính', value: 'Toàn tính' },
  { label: 'Đa tính', value: 'Đa tính' },
  { label: 'Toàn giới tính', value: 'Toàn giới tính' },
  { label: 'Phi chuẩn tính dục', value: 'Phi chuẩn tính dục' },
  { label: 'Vô tính', value: 'Vô tính' },
  { label: 'Khác', value: 'Khác' },
];

const ETHNICITY_OPTIONS = [
  { label: 'Kinh', value: 'Kinh' },
  { label: 'Tày', value: 'Tày' },
  { label: 'Thái', value: 'Thái' },
  { label: 'Mường', value: 'Mường' },
  { label: "H'Mông", value: "H'Mông" },
  { label: 'Dao', value: 'Dao' },
  { label: 'Nùng', value: 'Nùng' },
  { label: 'Hoa', value: 'Hoa' },
  { label: 'Khmer', value: 'Khmer' },
  { label: 'Khác', value: 'Khác' },
];

const RELIGION_OPTIONS = [
  { label: 'Không', value: 'Không' },
  { label: 'Phật giáo', value: 'Phật giáo' },
  { label: 'Công giáo', value: 'Công giáo' },
  { label: 'Tin lành', value: 'Tin lành' },
  { label: 'Hòa hảo', value: 'Hòa hảo' },
  { label: 'Cao đài', value: 'Cao đài' },
  { label: 'Hồi giáo', value: 'Hồi giáo' },
  { label: 'Khác', value: 'Khác' },
];

const PROVINCE_OPTIONS = [
  { label: 'Hà Nội', value: 'Hà Nội' },
  { label: 'Thành phố Hồ Chí Minh', value: 'Thành phố Hồ Chí Minh' },
  { label: 'Hải Phòng', value: 'Hải Phòng' },
  { label: 'Đà Nẵng', value: 'Đà Nẵng' },
  { label: 'Cần Thơ', value: 'Cần Thơ' },
  { label: 'Bắc Ninh', value: 'Bắc Ninh' },
  { label: 'Hải Dương', value: 'Hải Dương' },
  { label: 'Hưng Yên', value: 'Hưng Yên' },
  { label: 'Nam Định', value: 'Nam Định' },
  { label: 'Thái Bình', value: 'Thái Bình' },
  { label: 'Nghệ An', value: 'Nghệ An' },
  { label: 'Thanh Hóa', value: 'Thanh Hóa' },
  { label: 'Bình Dương', value: 'Bình Dương' },
  { label: 'Đồng Nai', value: 'Đồng Nai' },
  { label: 'Quảng Ninh', value: 'Quảng Ninh' },
  { label: 'Khác', value: 'Khác' },
];

const NATIONALITY_OPTIONS = [
  { label: 'Việt Nam', value: 'Việt Nam' },
  { label: 'Hàn Quốc', value: 'Hàn Quốc' },
  { label: 'Nhật Bản', value: 'Nhật Bản' },
  { label: 'Hoa Kỳ', value: 'Hoa Kỳ' },
  { label: 'Trung Quốc', value: 'Trung Quốc' },
  { label: 'Singapore', value: 'Singapore' },
  { label: 'Úc', value: 'Úc' },
  { label: 'Khác', value: 'Khác' },
];

const FAMILY_BG_OPTIONS = [
  { label: 'Công chức', value: 'Công chức' },
  { label: 'Viên chức', value: 'Viên chức' },
  { label: 'Nông dân', value: 'Nông dân' },
  { label: 'Công nhân', value: 'Công nhân' },
  { label: 'Kinh doanh', value: 'Kinh doanh' },
  { label: 'Hộ cá thể', value: 'Hộ cá thể' },
  { label: 'Trí thức', value: 'Trí thức' },
  { label: 'Chuyên gia', value: 'Chuyên gia' },
  { label: 'Khác', value: 'Khác' },
];

const SELF_BG_OPTIONS = [
  { label: 'Kỹ sư phần mềm', value: 'Kỹ sư phần mềm' },
  { label: 'Chuyên viên Công nghệ thông tin', value: 'Chuyên viên Công nghệ thông tin' },
  { label: 'Cán bộ quản lý', value: 'Cán bộ quản lý' },
  { label: 'Nhân viên văn phòng', value: 'Nhân viên văn phòng' },
  { label: 'Công nhân kỹ thuật', value: 'Công nhân kỹ thuật' },
  { label: 'Khác', value: 'Khác' },
];

const EDUCATION_LEVEL_OPTIONS = [
  { label: '12/12', value: '12/12' },
  { label: '10/10', value: '10/10' },
  { label: '9/12', value: '9/12' },
];

const TRAINING_LEVEL_OPTIONS = [
  { label: 'Đại học chính quy', value: 'Đại học chính quy' },
  { label: 'Thạc sĩ', value: 'Thạc sĩ' },
  { label: 'Tiến sĩ', value: 'Tiến sĩ' },
  { label: 'Cao đẳng', value: 'Cao đẳng' },
  { label: 'Trung cấp', value: 'Trung cấp' },
  { label: 'Chứng chỉ nghề', value: 'Chứng chỉ nghề' },
  { label: 'Khác', value: 'Khác' },
];

const MAJOR_OPTIONS = [
  { label: 'Công nghệ thông tin / Khoa học máy tính', value: 'Công nghệ thông tin / Khoa học máy tính' },
  { label: 'Kỹ thuật phần mềm', value: 'Kỹ thuật phần mềm' },
  { label: 'Hệ thống thông tin quản lý', value: 'Hệ thống thông tin quản lý' },
  { label: 'An toàn thông tin', value: 'An toàn thông tin' },
  { label: 'Quản trị kinh doanh', value: 'Quản trị kinh doanh' },
  { label: 'Tài chính - Ngân hàng', value: 'Tài chính - Ngân hàng' },
  { label: 'Khác', value: 'Khác' },
];

const TRAINING_PLACE_OPTIONS = [
  { label: 'Đại học Bách Khoa Hà Nội', value: 'Đại học Bách Khoa Hà Nội' },
  { label: 'Đại học Quốc Gia Hà Nội', value: 'Đại học Quốc Gia Hà Nội' },
  { label: 'Đại học Bách Khoa Thành phố Hồ Chí Minh', value: 'Đại học Bách Khoa Thành phố Hồ Chí Minh' },
  { label: 'Đại học Kinh Tế Quốc Dân', value: 'Đại học Kinh Tế Quốc Dân' },
  { label: 'Đại học Ngoại Thương', value: 'Đại học Ngoại Thương' },
  { label: 'Học viện Công nghệ Bưu chính Viễn thông', value: 'Học viện Công nghệ Bưu chính Viễn thông' },
  { label: 'Đại học FPT', value: 'Đại học FPT' },
  { label: 'Khác', value: 'Khác' },
];

const DEGREE_RANK_OPTIONS = [
  { label: 'Xuất sắc', value: 'Xuất sắc' },
  { label: 'Giỏi', value: 'Giỏi' },
  { label: 'Khá', value: 'Khá' },
  { label: 'Trung bình khá', value: 'Trung bình khá' },
  { label: 'Trung bình', value: 'Trung bình' },
];

const FACULTY_OPTIONS = [
  { label: 'Công nghệ Thông tin & Truyền thông', value: 'Công nghệ Thông tin & Truyền thông' },
  { label: 'Khoa học Máy tính', value: 'Khoa học Máy tính' },
  { label: 'Kinh tế & Quản lý', value: 'Kinh tế & Quản lý' },
  { label: 'Điện tử Viễn thông', value: 'Điện tử Viễn thông' },
  { label: 'Ngoại ngữ', value: 'Ngoại ngữ' },
  { label: 'Khác', value: 'Khác' },
];

const PARTY_POSITION_OPTIONS = [
  { label: 'Đảng viên dự bị', value: 'Đảng viên dự bị' },
  { label: 'Đảng viên chính thức', value: 'Đảng viên chính thức' },
  { label: 'Bí thư Chi bộ', value: 'Bí thư Chi bộ' },
  { label: 'Phó Bí thư Chi bộ', value: 'Phó Bí thư Chi bộ' },
  { label: 'Chi ủy viên', value: 'Chi ủy viên' },
  { label: 'Không có', value: 'Không có' },
];

const MILITARY_BRANCH_OPTIONS = [
  { label: 'Bộ binh', value: 'Bộ binh' },
  { label: 'Phòng không - Không quân', value: 'Phòng không - Không quân' },
  { label: 'Hải quân', value: 'Hải quân' },
  { label: 'Thông tin liên lạc', value: 'Thông tin liên lạc' },
  { label: 'Công binh', value: 'Công binh' },
  { label: 'Đặc công', value: 'Đặc công' },
  { label: 'Khác', value: 'Khác' },
];

const MILITARY_RANK_OPTIONS = [
  { label: 'Binh nhì', value: 'Binh nhì' },
  { label: 'Binh nhất', value: 'Binh nhất' },
  { label: 'Hạ sĩ', value: 'Hạ sĩ' },
  { label: 'Trung sĩ', value: 'Trung sĩ' },
  { label: 'Thượng sĩ', value: 'Thượng sĩ' },
  { label: 'Thiếu úy', value: 'Thiếu úy' },
  { label: 'Trung úy', value: 'Trung úy' },
  { label: 'Thượng úy', value: 'Thượng úy' },
  { label: 'Đại úy', value: 'Đại úy' },
  { label: 'Thiếu tá', value: 'Thiếu tá' },
  { label: 'Trung tá', value: 'Trung tá' },
];

const BLOOD_TYPE_OPTIONS = [
  { label: 'O+', value: 'O+' },
  { label: 'O-', value: 'O-' },
  { label: 'A+', value: 'A+' },
  { label: 'A-', value: 'A-' },
  { label: 'B+', value: 'B+' },
  { label: 'B-', value: 'B-' },
  { label: 'AB+', value: 'AB+' },
  { label: 'AB-', value: 'AB-' },
  { label: 'Không xác định', value: 'Không xác định' },
];

const HEALTH_STATUS_OPTIONS = [
  { label: 'Tốt', value: 'Tốt' },
  { label: 'Rất tốt', value: 'Rất tốt' },
  { label: 'Bình thường', value: 'Bình thường' },
  { label: 'Yếu', value: 'Yếu' },
  { label: 'Có bệnh mãn tính', value: 'Có bệnh mãn tính' },
];

const SHIRT_SIZE_OPTIONS = [
  { label: 'XS', value: 'XS' },
  { label: 'S', value: 'S' },
  { label: 'M', value: 'M' },
  { label: 'L', value: 'L' },
  { label: 'XL', value: 'XL' },
  { label: 'XXL', value: 'XXL' },
  { label: '3XL', value: '3XL' },
];

const SKIRT_SIZE_OPTIONS = [
  { label: 'Không chọn', value: 'Không chọn' },
  { label: 'XS', value: 'XS' },
  { label: 'S', value: 'S' },
  { label: 'M', value: 'M' },
  { label: 'L', value: 'L' },
  { label: 'XL', value: 'XL' },
  { label: 'XXL', value: 'XXL' },
];

const PANTS_SIZE_OPTIONS = [
  { label: '28', value: '28' },
  { label: '29', value: '29' },
  { label: '30', value: '30' },
  { label: '31', value: '31' },
  { label: '32', value: '32' },
  { label: '33', value: '33' },
  { label: '34', value: '34' },
  { label: '35', value: '35' },
  { label: '36', value: '36' },
];

const PPE_SIZE_OPTIONS = [
  { label: 'S', value: 'S' },
  { label: 'M', value: 'M' },
  { label: 'L', value: 'L' },
  { label: 'XL', value: 'XL' },
  { label: 'XXL', value: 'XXL' },
  { label: '3XL', value: '3XL' },
];

const EMERGENCY_RELATION_OPTIONS = [
  { label: 'Bố đẻ', value: 'Bố đẻ' },
  { label: 'Mẹ đẻ', value: 'Mẹ đẻ' },
  { label: 'Vợ / Chồng', value: 'Vợ / Chồng' },
  { label: 'Anh / Chị / Em ruột', value: 'Anh / Chị / Em ruột' },
  { label: 'Con đẻ', value: 'Con đẻ' },
  { label: 'Người giám hộ / Khác', value: 'Khác' },
];

interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  gender: string;
  birthDate: string;
  idNumber: string;
  job: string;
  phone: string;
  address: string;
  isDependent: boolean;
  dependentTaxCode?: string;
  dependentStartDate?: string;
  dependentEndDate?: string;
}

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string;
  accountType: string;
  isPrimary: boolean;
  status: string;
  note?: string;
}

// 14 STEPS matching user flow
const STEPS = [
  { id: 'avatar', title: 'Avatar & Tên tài khoản', section: 'Tài khoản', icon: <CameraOutlined /> },
  { id: 'general', title: 'Thông tin chung', section: 'Thông tin cơ bản', icon: <UserOutlined /> },
  { id: 'ekyc', title: 'Xác thực danh tính', section: 'Xác thực danh tính', icon: <SafetyCertificateOutlined /> },
  { id: 'idcard', title: 'CMND / Thẻ căn cước / Hộ chiếu', section: 'Thông tin cơ bản', icon: <IdcardOutlined /> },
  { id: 'education', title: 'Trình độ / Bằng cấp', section: 'Thông tin cơ bản', icon: <BookOutlined /> },
  { id: 'contact', title: 'Số điện thoại / Email / Khác', section: 'Thông tin liên hệ', icon: <PhoneOutlined /> },
  { id: 'hktt', title: 'Hộ khẩu thường trú', section: 'Thông tin liên hệ', icon: <HomeOutlined /> },
  { id: 'residence', title: 'Chỗ ở hiện nay', section: 'Thông tin liên hệ', icon: <HomeOutlined /> },
  { id: 'emergency', title: 'Liên hệ khẩn cấp', section: 'Thông tin liên hệ', icon: <TeamOutlined /> },
  { id: 'family', title: 'Thông tin gia đình', section: 'Thông tin gia đình', icon: <HeartOutlined /> },
  { id: 'politics', title: 'Thông tin chính trị', section: 'Chính trị & Quân sự', icon: <SafetyCertificateOutlined /> },
  { id: 'health', title: 'Thông tin y tế & sức khỏe', section: 'Y tế & Sức khỏe', icon: <MedicineBoxOutlined /> },
  { id: 'uniform', title: 'Thông tin trang phục', section: 'Thông tin trang phục', icon: <SkinOutlined /> },
  { id: 'finance', title: 'Thông tin ngân hàng', section: 'Thông tin tài chính', icon: <BankOutlined /> },
];

const DEFAULT_FORM_DATA = {
  // Step 0: Display Account
  displayName: '',
  avatarUrl: '',

  // Step 1: General
  code: '',
  name: '',
  firstName: '',
  middleLastName: '',
  otherName: '',
  maritalStatus: 'Độc thân',
  taxCode: '',
  familyBackground: '',
  selfBackground: '',
  gender: 'Nam',
  sexualOrientation: '',
  ethnicity: 'Kinh',
  birthDate: '',
  religion: 'Không',
  birthPlace: '',
  originPlace: '',
  nationality: 'Việt Nam',

  // Step 2: Documents
  docType: 'Căn cước công dân',
  docNumber: '',
  docIssueDate: '',
  docIssuePlace: '',
  docExpiryDate: '',
  passportNumber: '',
  passportIssueDate: '',
  passportIssuePlace: '',
  passportExpiryDate: '',

  // Step 3: Education
  educationLevel: '',
  trainingLevel: '',
  major: '',
  graduationYear: '',
  trainingPlace: '',
  degreeRank: '',
  faculty: '',

  // Step 4: Contact
  mobilePhone: '',
  accountEmail: '',
  workPhone: '',
  otherEmail: '',
  homePhone: '',
  skype: '',
  otherPhone: '',
  facebook: '',
  personalEmail: '',

  // Step 5: HKTT
  hkttCountry: 'Việt Nam',
  hkttBookNumber: '',
  hkttCity: '',
  hkttFamilyCode: '',
  hkttDistrict: '',
  hkttIsHead: false,
  hkttWard: '',
  hkttAddress: '',
  hkttStreetNumber: '',

  // Step 6: Residence
  resSameAsHKTT: false,
  resCountry: 'Việt Nam',
  resCity: '',
  resDistrict: '',
  resWard: '',
  resStreetNumber: '',
  resAddress: '',

  // Step 7: Emergency
  emName: '',
  emRelation: '',
  emPhone: '',
  emHomePhone: '',
  emEmail: '',
  emAddress: '',

  // Step 9: Politics
  isYouthUnion: false,
  isPartyMember: false,
  youthUnionDate: '',
  partyJoinDate: '',
  partyPosition: '',
  isMilitary: false,
  isWoundedSoldier: false,
  hasPolicyBenefit: false,
  militaryEnlistDate: '',
  militaryBranch: '',
  militaryRank: '',

  // Step 10: Health
  bloodType: '',
  heightM: '',
  weightKg: '',
  healthStatus: '',
  medicalNote: '',

  // Step 11: Uniform Ready
  shirtLetter: '',
  skirtLetter: '',
  pantsLetter: '',
  ppeLetter: '',

  // Step 12: Uniform Tailor
  shoulderWidth: '',
  sleeveLength: '',
  shirtLength: '',
  chestCircumference: '',
  waistCircumference: '',
  hipCircumference: '',
  pantsLength: '',
  thighCircumference: '',
};

const DEFAULT_FAMILY_LIST: FamilyMember[] = [];

const DEFAULT_BANK_LIST: BankAccount[] = [];

interface Props {
  onDone: () => void;
  storage: EmployeeOnboardingStorage;
  initialStep?: number;
}

export const EmployeeProfileWizard: React.FC<Props> = ({ onDone, storage, initialStep }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState<number>(() => {
    if (initialStep !== undefined) return initialStep;
    try {
      const s = localStorage.getItem(storage.step);
      if (s !== null) return Math.min(parseInt(s, 10), STEPS.length - 1);
    } catch (e) {}
    return 0;
  });

  // eKYC State (5 sub-steps matching live system)
  const [ekycSubStep, setEkycSubStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [ekycQrToken] = useState(() => EkycService.generateToken(128));
  const [isDesktopDevice, setIsDesktopDevice] = useState(() => !EkycService.isMobileDevice());

  useEffect(() => {
    const handleCheckDevice = () => {
      setIsDesktopDevice(!EkycService.isMobileDevice());
    };
    handleCheckDevice();
    window.addEventListener('resize', handleCheckDevice);
    window.addEventListener('orientationchange', handleCheckDevice);
    return () => {
      window.removeEventListener('resize', handleCheckDevice);
      window.removeEventListener('orientationchange', handleCheckDevice);
    };
  }, [step]);

  const bottomBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleCheckStuck = () => {
      const bar = bottomBarRef.current;
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const viewportBottom = window.innerHeight;
      if (rect.bottom >= viewportBottom - 2) {
        bar.classList.add('is-stuck');
      } else {
        bar.classList.remove('is-stuck');
      }
    };

    window.addEventListener('scroll', handleCheckStuck, true);
    window.addEventListener('resize', handleCheckStuck);
    handleCheckStuck();
    const interval = setInterval(handleCheckStuck, 150);

    return () => {
      window.removeEventListener('scroll', handleCheckStuck, true);
      window.removeEventListener('resize', handleCheckStuck);
      clearInterval(interval);
    };
  }, [step]);

  const [ekycLivePhoto, setEkycLivePhoto] = useState<string | null>(null);
  const [ekycLiveVideo, setEkycLiveVideo] = useState<string | null>(null);
  const [ekycCardFrontPhoto, setEkycCardFrontPhoto] = useState<string | null>(null);
  const [ekycCardBackPhoto, setEkycCardBackPhoto] = useState<string | null>(null);
  const [ekycCroppedAvatar, setEkycCroppedAvatar] = useState<string | null>(null);
  const [ekycCardFrontResult, setEkycCardFrontResult] = useState<CardValidationResult | null>(null);
  const [ekycCardBackResult, setEkycCardBackResult] = useState<CardValidationResult | null>(null);
  const [ekycMatchResult, setEkycMatchResult] = useState<BiometricMatchResult | null>(null);
  const [isEkycProcessing, setIsEkycProcessing] = useState(false);
  const [ekycPickerOpen, setEkycPickerOpen] = useState(false);
  const [ekycUploadTarget, setEkycUploadTarget] = useState<'face' | 'front' | 'back'>('face');

  const [formData, setFormData] = useState<any>(() => {
    try {
      const raw = localStorage.getItem(storage.data);
      if (raw) return { ...DEFAULT_FORM_DATA, ...JSON.parse(raw) };
    } catch (e) {}
    return DEFAULT_FORM_DATA;
  });

  useEffect(() => {
    void employeesApi.getMyProfile().then((response) => {
      const employee: any = response.data.employee;
      setFormData((previous: any) => ({
        ...previous,
        ...employee,
        displayName: employee.displayName || employee.name || previous.displayName,
        avatarUrl: employee.avatar || employee.avatarUrl || previous.avatarUrl,
        accountEmail: employee.email || previous.accountEmail,
        mobilePhone: employee.phone || previous.mobilePhone,
        workUnit: employee.department || previous.workUnit,
        position: employee.position || previous.position,
      }));
    }).catch(() => undefined);
  }, []);

  const [familyList, setFamilyList] = useState<FamilyMember[]>(DEFAULT_FAMILY_LIST);
  const [bankList, setBankList] = useState<BankAccount[]>(DEFAULT_BANK_LIST);

  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);

  // Hook Camera for Wizard eKYC
  const {
    videoRef: ekycVideoRef,
    isActive: isEkycCameraActive,
    isLoading: isEkycCameraLoading,
    isRecording: isEkycCameraRecording,
    error: ekycCameraError,
    startCamera: startEkycCamera,
    stopCamera: stopEkycCamera,
    stopRecording: stopEkycRecording,
    captureFrame: captureEkycFrame,
  } = useCamera('user');

  const handleSnapshotPhotoInWizardRef = useRef<(() => void) | undefined>(undefined);
  const handleCompleteLivenessInWizardRef = useRef<(() => void) | undefined>(undefined);

  // Hook Face Detection BlazeFace for Wizard
  const {
    canvasRef: ekycFaceCanvasRef,
    faceValid: isEkycFaceValid,
    livenessStage: ekycLivenessStage,
    countdownProgress: ekycCountdownProgress,
    validationResult: ekycFaceValidationResult,
    statusMessage: ekycFaceStatusMessage,
    clearCanvas: clearEkycFaceCanvas,
  } = useFaceDetection(
    ekycVideoRef,
    isEkycCameraActive && step === 2 && ekycSubStep === 2,
    {
      onSnapshotPhoto: () => handleSnapshotPhotoInWizardRef.current?.(),
      onCompleteLiveness: () => handleCompleteLivenessInWizardRef.current?.(),
    }
  );

  const [ekycLivenessCompleted, setEkycLivenessCompleted] = useState(false);
  const ekycStepperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ekycStepperRef.current) {
      const activeEl = ekycStepperRef.current.querySelector(`#ekyc-wizard-step-item-${ekycSubStep}`) as HTMLElement;
      if (activeEl) {
        const container = ekycStepperRef.current;
        const targetLeft = activeEl.offsetLeft - (container.clientWidth / 2) + (activeEl.clientWidth / 2);
        container.scrollTo({
          left: Math.max(0, targetLeft),
          behavior: 'smooth',
        });
      }
    }
  }, [ekycSubStep]);

  // 1. Chụp ảnh chân dung sau 3s nhìn thẳng trong Wizard
  const handleSnapshotPhotoInWizard = useCallback(() => {
    const photo = captureEkycFrame(720, 1280);
    if (photo) {
      setEkycLivePhoto(photo);
    }
  }, [captureEkycFrame]);
  handleSnapshotPhotoInWizardRef.current = handleSnapshotPhotoInWizard;

  // 2. Hoàn tất toàn bộ 4 bước Liveness trong Wizard
  const handleCompleteLivenessInWizard = useCallback(async () => {
    setEkycLivenessCompleted(true);
    setIsEkycProcessing(true);
    const videoData = await stopEkycRecording();
    if (videoData) {
      setEkycLiveVideo(videoData);
    }
    stopEkycCamera();
    clearEkycFaceCanvas();
    setIsEkycProcessing(false);

    message.success('🎉 Xác thực sinh trắc học thành công 100%!');

    setTimeout(() => {
      setEkycSubStep(3);
    }, 1000);
  }, [stopEkycRecording, stopEkycCamera, clearEkycFaceCanvas]);
  handleCompleteLivenessInWizardRef.current = handleCompleteLivenessInWizard;

  // Camera Lifecycle for Wizard eKYC - Tự động quay video sinh trắc học ở Bước 2
  useEffect(() => {
    if (step === 2) {
      if (ekycSubStep === 2 && !ekycLivenessCompleted) {
        startEkycCamera('user', true);
      } else if (ekycSubStep === 3 && !ekycCardFrontPhoto) {
        startEkycCamera('environment', false);
      } else if (ekycSubStep === 4 && !ekycCardBackPhoto) {
        startEkycCamera('environment', false);
      } else {
        stopEkycCamera();
        clearEkycFaceCanvas();
      }
    } else {
      stopEkycCamera();
      clearEkycFaceCanvas();
    }
  }, [step, ekycSubStep, ekycLivenessCompleted, ekycCardFrontPhoto, ekycCardBackPhoto, startEkycCamera, stopEkycCamera, clearEkycFaceCanvas]);

  const handleCaptureCardFrontInWizard = async () => {
    const photo = captureEkycFrame(960, 600);
    if (!photo) {
      message.error('Không thể chụp từ camera. Vui lòng tải ảnh lên từ thiết bị.');
      return;
    }

    setIsEkycProcessing(true);
    message.loading('Đang phân tích hình ảnh và trích xuất dữ liệu mặt trước CCCD...', 1.2);

    const result = await CardValidationService.validateFrontCard(photo);
    setEkycCardFrontPhoto(photo);
    setEkycCardFrontResult(result);
    setIsEkycProcessing(false);
    stopEkycCamera();

    if (result.hasCard && result.isValid && result.extractedData) {
      setEkycCroppedAvatar(result.extractedData.cardAvatarUrl || null);
      message.success('Đã nhận diện thông tin mặt trước CCCD thành công!');
    } else {
      message.error(result.message);
    }
  };

  const handleCaptureCardBackInWizard = async () => {
    const photo = captureEkycFrame(960, 600);
    if (!photo) {
      message.error('Không thể chụp từ camera. Vui lòng tải ảnh lên từ thiết bị.');
      return;
    }

    setIsEkycProcessing(true);
    message.loading('Đang quét mã QR chuẩn BCA bằng jsQR và đối soát dải mã MRZ...', 1.2);

    const result = await CardValidationService.validateBackCard(photo, {
      name: formData.name || 'Nguyễn Huy Tùng',
      idNumber: formData.docNumber || '001095012345',
    });
    setEkycCardBackPhoto(photo);
    setEkycCardBackResult(result);
    setIsEkycProcessing(false);
    stopEkycCamera();

    if (result.hasCard && result.isValid && result.extractedData) {
      const ext = result.extractedData;
      setFormData((prev: any) => {
        const next = {
          ...prev,
          docType: 'Căn cước công dân',
          docNumber: ext.idNumber || prev.docNumber || '001095012345',
          docIssueDate: ext.issueDate || prev.docIssueDate || '2021-05-20',
          docIssuePlace: ext.issuePlace || prev.docIssuePlace || 'Cục Cảnh sát Quản lý hành chính về trật tự xã hội',
          docExpiryDate: ext.expiryDate || prev.docExpiryDate || '2035-08-19',
          name: ext.name || prev.name,
          displayName: ext.name || prev.displayName || prev.name,
          birthDate: ext.birthDate || prev.birthDate,
          gender: ext.gender || prev.gender,
          originPlace: ext.originPlace || prev.originPlace,
          hkttAddress: ext.residencePlace || prev.hkttAddress,
          currentAddress: ext.residencePlace || prev.currentAddress,
        };
        try {
          localStorage.setItem(storage.data, JSON.stringify(next));
        } catch (e) {}
        return next;
      });
      message.success('Đã giải mã mã QR & Chip CCCD thành công 100%! Tự động điền thông tin CCCD.');
    } else {
      message.error(result.message);
    }
  };

  const handleRunFaceMatchInWizard = async () => {
    setIsEkycProcessing(true);
    message.loading('Đang so khớp khuôn mặt sinh trắc học và khởi tạo chứng thư số...', 1.2);

    const match = await EkycService.matchFaces(ekycLivePhoto || '', ekycCroppedAvatar || undefined);
    setEkycMatchResult(match);
    setIsEkycProcessing(false);
    setEkycSubStep(5);
    message.success(`Xác thực hoàn tất! Độ khớp khuôn mặt đạt ${match.matchScore}%`);
  };

  const handleEkycFileUpload = (file: File | undefined, target: 'face' | 'front' | 'back') => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      message.error('Vui lòng chọn tệp định dạng hình ảnh.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      if (!base64) return;

      if (target === 'face') {
        setEkycLivePhoto(base64);
        stopEkycCamera();
        message.success('Đã tải ảnh chân dung thành công!');
      } else if (target === 'front') {
        setEkycCardFrontPhoto(base64);
        setIsEkycProcessing(true);
        const res = await CardValidationService.validateFrontCard(base64);
        setEkycCardFrontResult(res);
        setIsEkycProcessing(false);
        stopEkycCamera();
        if (res.hasCard && res.isValid && res.extractedData) {
          setEkycCroppedAvatar(res.extractedData.cardAvatarUrl || null);
          const ext = res.extractedData;
          setFormData((prev: any) => {
            const next = {
              ...prev,
              docType: 'Căn cước công dân',
              docNumber: ext.idNumber || prev.docNumber || '001095012345',
              docExpiryDate: ext.expiryDate || prev.docExpiryDate || '2035-08-19',
              name: ext.name || prev.name,
              displayName: ext.name || prev.displayName || prev.name,
              birthDate: ext.birthDate || prev.birthDate,
              gender: ext.gender || prev.gender,
              originPlace: ext.originPlace || prev.originPlace,
              hkttAddress: ext.residencePlace || prev.hkttAddress,
              currentAddress: ext.residencePlace || prev.currentAddress,
            };
            try {
              localStorage.setItem(storage.data, JSON.stringify(next));
            } catch (e) {}
            return next;
          });
          message.success('Đã nhận diện OCR mặt trước CCCD thành công!');
        } else {
          message.error(res.message);
        }
      } else if (target === 'back') {
        setEkycCardBackPhoto(base64);
        setIsEkycProcessing(true);
        const res = await CardValidationService.validateBackCard(base64, {
          name: formData.name || 'Nguyễn Huy Tùng',
          idNumber: formData.docNumber || '001095012345',
        });
        setEkycCardBackResult(res);
        setIsEkycProcessing(false);
        stopEkycCamera();
        if (res.hasCard && res.isValid && res.extractedData) {
          const ext = res.extractedData;
          setFormData((prev: any) => {
            const next = {
              ...prev,
              docType: 'Căn cước công dân',
              docNumber: ext.idNumber || prev.docNumber || '001095012345',
              docIssueDate: ext.issueDate || prev.docIssueDate || '2021-05-20',
              docIssuePlace: ext.issuePlace || prev.docIssuePlace || 'Cục Cảnh sát Quản lý hành chính về trật tự xã hội',
              docExpiryDate: ext.expiryDate || prev.docExpiryDate || '2035-08-19',
              name: ext.name || prev.name,
              displayName: ext.name || prev.displayName || prev.name,
              birthDate: ext.birthDate || prev.birthDate,
              gender: ext.gender || prev.gender,
              originPlace: ext.originPlace || prev.originPlace,
              hkttAddress: ext.residencePlace || prev.hkttAddress,
              currentAddress: ext.residencePlace || prev.currentAddress,
            };
            try {
              localStorage.setItem(storage.data, JSON.stringify(next));
            } catch (e) {}
            return next;
          });
          message.success('Đã giải mã mã QR & MRZ mặt sau CCCD thành công! Tự động điền thông tin CCCD.');
        } else {
          message.error(res.message);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const triggerNativeCameraInWizard = (target: 'face' | 'front' | 'back') => {
    setEkycUploadTarget(target);
    setEkycPickerOpen(true);
  };

  const handleFinishEkycInWizard = () => {
    const frontData = ekycCardFrontResult?.extractedData;
    const backData = ekycCardBackResult?.extractedData;
    const mergedData = { ...frontData, ...backData };

    setFormData((prev: any) => {
      const next = {
        ...prev,
        name: mergedData.name || prev.name || 'Nguyễn Huy Tùng',
        displayName: mergedData.name || prev.displayName || prev.name || 'Nguyễn Huy Tùng',
        docType: 'Căn cước công dân',
        docNumber: mergedData.idNumber || prev.docNumber || '001095012345',
        birthDate: mergedData.birthDate || prev.birthDate || '1995-08-19',
        gender: mergedData.gender || prev.gender || 'Nam',
        originPlace: mergedData.originPlace || prev.originPlace || 'Hà Nội',
        hkttAddress: mergedData.residencePlace || prev.hkttAddress || 'Thôn 1 Bát Tràng, Gia Lâm, Hà Nội',
        currentAddress: mergedData.residencePlace || prev.currentAddress || 'Thôn 1 Bát Tràng, Gia Lâm, Hà Nội',
        docIssueDate: mergedData.issueDate || prev.docIssueDate || '2021-05-20',
        docIssuePlace: mergedData.issuePlace || prev.docIssuePlace || 'Cục Cảnh sát Quản lý hành chính về trật tự xã hội',
        docExpiryDate: mergedData.expiryDate || prev.docExpiryDate || '2035-08-19',
        avatarUrl: ekycLivePhoto || ekycCroppedAvatar || prev.avatarUrl,
      };
      try {
        localStorage.setItem(storage.data, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
    goNext();
  };

  // Modals for Family
  const [isFamilyModalOpen, setIsFamilyModalOpen] = useState(false);
  const [editingFamily, setEditingFamily] = useState<FamilyMember | null>(null);
  const [familyForm, setFamilyForm] = useState<Partial<FamilyMember>>({
    name: '', relation: 'Bố đẻ', gender: 'Nam', birthDate: '', idNumber: '', job: '', phone: '', address: '', isDependent: false
  });

  // Modals for Bank
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [bankForm, setBankForm] = useState<Partial<BankAccount>>({
    bankName: 'Ngân hàng TMCP Ngoại Thương VN (Vietcombank)',
    accountNumber: '',
    accountHolder: 'NGUYỄN HUY TÙNG',
    branch: '',
    isPrimary: false,
    status: 'Đã duyệt',
  });

  // Modal Dialog "Xin lỗi" cute màu hồng khi Nữ vào bước Kích thước may đo
  const [isFemaleTailorModalOpen, setIsFemaleTailorModalOpen] = useState(false);

  useEffect(() => {
    if (STEPS[step]?.id === 'uniform' && formData.gender === 'Nữ') {
      setIsFemaleTailorModalOpen(true);
    }
  }, [step, formData.gender]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => {
      const next = { ...prev, [field]: value };
      try {
        localStorage.setItem(storage.data, JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleStepChange = (targetStep: number) => {
    const valid = Math.max(0, Math.min(targetStep, STEPS.length - 1));
    setStep(valid);
    try {
      localStorage.setItem(storage.step, String(valid));
    } catch (e) {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goNext = () => {
    if (step === 2) {
      if (isDesktopDevice) {
        // Trên máy tính: Chuyển tiếp sang bước tiếp theo
        handleStepChange(step + 1);
        return;
      }

      if (ekycSubStep === 1) {
        setEkycSubStep(2);
      } else if (ekycSubStep === 2) {
        if (!ekycLivePhoto) {
          message.error('Vui lòng hoàn thành bước quét khuôn mặt.');
          return;
        }
        setEkycSubStep(3);
      } else if (ekycSubStep === 3) {
        if (!ekycCardFrontResult?.hasCard || !ekycCardFrontResult?.isValid) {
          message.error('Vui lòng chụp ảnh thẻ Căn cước mặt trước hợp lệ.');
          return;
        }
        setEkycSubStep(4);
      } else if (ekycSubStep === 4) {
        if (!ekycCardBackResult?.hasCard || !ekycCardBackResult?.isValid) {
          message.error('Vui lòng chụp ảnh thẻ Căn cước mặt sau hợp lệ.');
          return;
        }
        handleRunFaceMatchInWizard();
      } else if (ekycSubStep === 5) {
        handleFinishEkycInWizard();
      }
      return;
    }

    if (step >= STEPS.length - 1) {
      handleFinish();
    } else {
      handleStepChange(step + 1);
    }
  };

  const goBack = () => {
    // 1. Trên máy tính (Desktop) trong Bước 3 (Xác thực danh tính): Quay lại ngay Bước 2 (Thông tin chung) trong 1 click
    if (step === 2 && isDesktopDevice) {
      handleStepChange(step - 1);
      return;
    }

    // 2. Trên điện thoại khi đã hoàn tất (Sub-step 5) hoặc ở màn hình đầu (Sub-step 1): Quay lại ngay Bước 2 (Thông tin chung) trong 1 click
    if (step === 2 && (ekycSubStep === 5 || ekycSubStep === 1)) {
      handleStepChange(step - 1);
      return;
    }

    // 3. Trên điện thoại khi đang ở các bước chụp dở (Sub-step 2, 3, 4): Lùi lại 1 bước con
    if (step === 2 && ekycSubStep > 1 && ekycSubStep < 5) {
      setEkycSubStep((prev) => (prev - 1) as any);
      return;
    }

    if (step > 0) {
      handleStepChange(step - 1);
    }
  };

  const handleFinish = async () => {
    // Save to profile in dataService
    const profile = dataService.getEmployeeProfile();
    const updated = {
      ...profile,
      name: formData.name || profile.name,
      avatar: formData.avatarUrl || profile.avatar,
      phone: formData.mobilePhone || profile.phone,
      email: formData.accountEmail || profile.email,
      personalEmail: formData.personalEmail || profile.personalEmail,
      address: formData.resAddress || profile.address,
      idNumber: formData.docNumber || profile.idNumber,
      bankAccount: formData.bankAccount || profile.bankAccount,
    };
    dataService.updateEmployeeProfile(updated);
    try {
      await employeesApi.updateMyProfile({
        name: formData.name || undefined,
        phone: formData.mobilePhone || undefined,
        avatar: formData.avatarUrl || undefined,
        details: { ...formData, bankAccounts: bankList, familyMembers: familyList },
      });
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể đồng bộ hồ sơ lên máy chủ.');
      return;
    }

    // Save display name & avatar
    if (formData.displayName) {
      try { localStorage.setItem(ACCOUNT_DISPLAY_KEY, formData.displayName); } catch (e) {}
    }
    if (formData.avatarUrl) {
      try { localStorage.setItem(ACCOUNT_AVATAR_KEY, formData.avatarUrl); } catch (e) {}
    }

    // Set wizard completed
    markEmployeeOnboardingComplete(storage, user);

    message.success('Thiết lập hồ sơ cá nhân thành công!');
    onDone();
  };

  // Family Handlers
  const handleOpenAddFamily = () => {
    setEditingFamily(null);
    setFamilyForm({
      name: '',
      relation: 'Bố đẻ',
      gender: 'Nam',
      birthDate: '',
      idNumber: '',
      job: '',
      phone: '',
      address: '',
      isDependent: false,
    });
    setIsFamilyModalOpen(true);
  };

  const handleOpenEditFamily = (item: FamilyMember) => {
    setEditingFamily(item);
    setFamilyForm({ ...item });
    setIsFamilyModalOpen(true);
  };

  const handleDeleteFamily = (id: string) => {
    setFamilyList(prev => prev.filter(m => m.id !== id));
    message.success('Đã xóa thân nhân thành công');
  };

  const handleSaveFamily = () => {
    if (!familyForm.name?.trim()) {
      message.error('Vui lòng nhập họ và tên thân nhân!');
      return;
    }
    if (editingFamily) {
      setFamilyList(prev => prev.map(m => m.id === editingFamily.id ? { ...(familyForm as FamilyMember), id: m.id } : m));
    } else {
      setFamilyList(prev => [...prev, { ...(familyForm as FamilyMember), id: `fm-${Date.now()}` }]);
    }
    setIsFamilyModalOpen(false);
    message.success('Đã lưu thông tin thân nhân');
  };

  // Bank Handlers
  const handleOpenAddBank = () => {
    setEditingBank(null);
    setBankForm({
      bankName: 'Ngân hàng TMCP Ngoại Thương VN (Vietcombank)',
      accountNumber: '',
      accountHolder: formData.name ? formData.name.toUpperCase() : 'NGUYỄN HUY TÙNG',
      branch: '',
      isPrimary: false,
      status: 'Đã duyệt',
    });
    setIsBankModalOpen(true);
  };

  const handleOpenEditBank = (item: BankAccount) => {
    setEditingBank(item);
    setBankForm({ ...item });
    setIsBankModalOpen(true);
  };

  const handleDeleteBank = (id: string) => {
    setBankList(prev => prev.filter(b => b.id !== id));
    message.success('Đã xóa tài khoản ngân hàng');
  };

  const handleSaveBank = () => {
    if (!bankForm.accountNumber?.trim()) {
      message.error('Vui lòng nhập số tài khoản!');
      return;
    }
    if (editingBank) {
      setBankList(prev => prev.map(b => b.id === editingBank.id ? { ...(bankForm as BankAccount), id: b.id } : b));
    } else {
      setBankList(prev => [...prev, { ...(bankForm as BankAccount), id: `bank-${Date.now()}`, accountType: bankForm.isPrimary ? 'Tài khoản nhận lương chính' : 'Phụ' }]);
    }
    setIsBankModalOpen(false);
    message.success('Đã lưu tài khoản ngân hàng');
  };

  const currentStepInfo = STEPS[step];
  const progressPercent = ((step) / (STEPS.length - 1)) * 100;

  return (
    <div className="k-wizard-container">
      <FileUploadDialog open={avatarPickerOpen} onClose={() => setAvatarPickerOpen(false)} accept="image/*" multiple={false} title="Chọn ảnh đại diện" confirmText="Chọn ảnh" onSelect={(files) => { const reader = new FileReader(); reader.onload = (event) => handleChange('avatarUrl', event.target?.result as string); reader.readAsDataURL(files[0]); }} />
      <FileUploadDialog open={ekycPickerOpen} onClose={() => setEkycPickerOpen(false)} onSelect={(files) => handleEkycFileUpload(files[0], ekycUploadTarget)} accept="image/*" multiple={false} title="Chọn ảnh xác minh danh tính" confirmText="Chọn ảnh" />

      {/* Step Progress Bar Card (Khung tiến độ) */}
      <div className="k-wizard-progress-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#009688' }}>
              Bước {step + 1} / {STEPS.length}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>
              {currentStepInfo.title}
            </span>
          </div>
        </div>

        {/* Progress Line */}
        <div style={{ width: '100%', height: 4, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: '#009688',
              borderRadius: 4,
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      </div>

      {/* 3. Main Step Form Card (White card matching /hr/employees/edit) */}
      <div className="k-wizard-card">
        {/* Step Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
            {currentStepInfo.icon}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#212121' }}>
              {currentStepInfo.title}
            </h2>
          </div>
        </div>

        {/* STEP CONTENTS */}
        {/* Step 0: Avatar & Tên tài khoản */}
        {step === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '12px 16px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: '#E2E8F0',
                  border: '2px solid #009688',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                onClick={() => setAvatarPickerOpen(true)}
              >
                <img src={formData.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80'} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div>
                <Button icon={<CameraOutlined />} size="small" onClick={() => setAvatarPickerOpen(true)}>
                  Chọn ảnh mới
                </Button>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                  Hỗ trợ định dạng JPG, PNG. Ảnh này dùng làm ảnh đại diện tài khoản.
                </div>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
                Tên hiển thị tài khoản
              </label>
              <Input
                value={formData.displayName}
                onChange={(e) => handleChange('displayName', e.target.value)}
                placeholder="Nhập tên hiển thị tài khoản..."
              />
              <div style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 4 }}>
                Tên này dùng để hiển thị trên góc phải tài khoản (có thể đặt bất cứ tên nào, không phụ thuộc hồ sơ nhân viên)
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Thông tin chung */}
        {step === 1 && (
          <div className="k-form-grid-3">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Mã nhân viên</label>
              <Input value={formData.code} readOnly title="Mã nhân viên do hệ thống quản lý và không thể chỉnh sửa." />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nguyên quán</label>
              <Select value={formData.originPlace} onChange={val => handleChange('originPlace', val)} options={PROVINCE_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Họ và đệm</label>
              <Input value={formData.middleLastName} onChange={e => handleChange('middleLastName', e.target.value)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tình trạng hôn nhân</label>
              <Select
                value={formData.maritalStatus}
                onChange={val => handleChange('maritalStatus', val)}
                options={[
                  { label: 'Độc thân', value: 'Độc thân' },
                  { label: 'Đã kết hôn', value: 'Đã kết hôn' },
                  { label: 'Ly hôn', value: 'Ly hôn' },
                  { label: 'Khác', value: 'Khác' },
                ]}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tên</label>
              <Input value={formData.firstName} onChange={e => handleChange('firstName', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Mã số thuế cá nhân</label>
              <Input value={formData.taxCode} onChange={e => handleChange('taxCode', e.target.value)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Họ và tên*</label>
              <Input value={formData.name} onChange={e => handleChange('name', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Gia đình</label>
              <Select value={formData.familyBackground} onChange={val => handleChange('familyBackground', val)} options={FAMILY_BG_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tên gọi khác</label>
              <Input value={formData.otherName} onChange={e => handleChange('otherName', e.target.value)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Bản thân</label>
              <Select value={formData.selfBackground} onChange={val => handleChange('selfBackground', val)} options={SELF_BG_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Giới tính</label>
              <Select value={formData.gender} onChange={val => handleChange('gender', val)} options={GENDER_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Xu hướng tính dục</label>
              <Select value={formData.sexualOrientation} onChange={val => handleChange('sexualOrientation', val)} options={SEXUAL_ORIENTATION_OPTIONS} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Dân tộc</label>
              <Select value={formData.ethnicity} onChange={val => handleChange('ethnicity', val)} options={ETHNICITY_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày sinh</label>
              <Input type="date" value={formData.birthDate} onChange={e => handleChange('birthDate', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tôn giáo</label>
              <Select value={formData.religion} onChange={val => handleChange('religion', val)} options={RELIGION_OPTIONS} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nơi sinh</label>
              <Select value={formData.birthPlace} onChange={val => handleChange('birthPlace', val)} options={PROVINCE_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quốc tịch</label>
              <Select value={formData.nationality} onChange={val => handleChange('nationality', val)} options={NATIONALITY_OPTIONS} />
            </div>
          </div>
        )}

        {/* Step 2: Xác thực danh tính (eKYC) */}
        {step === 2 && (
          isDesktopDevice ? (
            /* TRÊN MÁY TÍNH (PC / DESKTOP): Chỉ hiện duy nhất 1 mã QR căn giữa, full trắng, viền sắc nét */
            <div
              style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-start',
                padding: '8px 16px 16px 16px',
                textAlign: 'center',
                gap: 12,
              }}
            >
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0F172A', margin: '0 0 6px 0' }}>
                  Quét mã QR để tiếp tục trên điện thoại
                </h3>
                <p style={{ fontSize: 13, color: '#64748B', margin: 0, maxWidth: 500, lineHeight: 1.5 }}>
                  Tính năng xác thực khuôn mặt và CCCD yêu cầu camera điện thoại<br />
                  để đảm bảo chất lượng hình ảnh và độ chính xác sinh trắc học.
                </p>
              </div>

              {/* QR Container - Full white, viền sắc nét 1px solid #E0E0E0, bo góc 8px, QR to gần chạm khung */}
              <div
                style={{
                  padding: 6,
                  background: '#FFFFFF',
                  border: '1px solid #E0E0E0',
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <QRCode
                  value={`${window.location.origin}/employee/Identity/verification/?token=${ekycQrToken}`}
                  size={260}
                  quietZone={1}
                  ecLevel="M"
                  style={{ borderRadius: 4, display: 'block' }}
                />
              </div>



              {/* Status Badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12.5,
                  color: '#00796B',
                  background: '#E0F2F1',
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontWeight: 500,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#009688',
                  }}
                />
                <span>Đang chờ quét mã QR từ điện thoại...</span>
              </div>
            </div>
          ) : (
            /* TRÊN ĐIỆN THOẠI DI ĐỘNG (MOBILE): Hiện luồng eKYC đầy đủ 5 bước */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Top Stepper Bar (Responsive Stepper) */}
            <div ref={ekycStepperRef} className="k-ekyc-stepper">
              <div
                style={{
                  display: 'inline-flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  flexWrap: 'nowrap',
                  whiteSpace: 'nowrap',
                  minWidth: 'max-content',
                }}
              >
                {[
                  { num: 1, title: 'Chuẩn bị' },
                  { num: 2, title: 'Khuôn mặt' },
                  { num: 3, title: 'CCCD trước' },
                  { num: 4, title: 'CCCD sau' },
                  { num: 5, title: 'Xác nhận' },
                ].map((st, idx, arr) => {
                  const isActive = ekycSubStep === st.num;
                  const isPassed = ekycSubStep > st.num;
                  return (
                    <React.Fragment key={st.num}>
                      <div
                        id={`ekyc-wizard-step-item-${st.num}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          cursor: isPassed ? 'pointer' : 'default',
                          flexShrink: 0,
                          whiteSpace: 'nowrap',
                        }}
                        onClick={() => {
                          if (isPassed) setEkycSubStep(st.num as any);
                        }}
                      >
                        <div
                          style={{
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: isPassed ? '#E0F2F1' : isActive ? '#009688' : '#FFFFFF',
                            color: isPassed ? '#009688' : isActive ? '#FFFFFF' : '#94A3B8',
                            border: isPassed ? '1px solid #B2DFDB' : isActive ? '1px solid #009688' : '1px solid #CBD5E1',
                            flexShrink: 0,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {isPassed ? <CheckOutlined style={{ fontSize: 11, fontWeight: 'bold' }} /> : st.num}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: isActive ? 600 : isPassed ? 500 : 400,
                            color: isActive ? '#009688' : isPassed ? '#1E293B' : '#94A3B8',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          {st.title}
                        </div>
                      </div>
                      {idx < arr.length - 1 && (
                        <div
                          style={{
                            width: 24,
                            minWidth: 24,
                            maxWidth: 24,
                            height: 1,
                            background: isPassed ? '#009688' : '#E2E8F0',
                            margin: '0 8px',
                            flexShrink: 0,
                          }}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Sub-step 1: Hướng dẫn chuẩn bị */}
            {ekycSubStep === 1 && (
              <div className="k-ekyc-guide-grid">
                {/* Cột trái */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Card Thông tin bảo mật */}
                  <div
                    style={{
                      background: '#F0FDFA',
                      border: '1px solid #CCFBF1',
                      borderRadius: 8,
                      padding: 16,
                      display: 'flex',
                      gap: 14,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 6,
                        background: '#E0F2F1',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#009688',
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      <SafetyCertificateOutlined />
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1E293B' }}>Thông tin bảo mật</div>
                      <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 4, lineHeight: 1.5 }}>
                        Hình ảnh CCCD và sinh trắc học khuôn mặt được mã hóa an toàn theo tiêu chuẩn NEAC.
                      </div>
                    </div>
                  </div>


                  {/* Card Mẹo nhanh */}
                  <div
                    style={{
                      background: '#FFFDF5',
                      border: '1px solid #FEF3C7',
                      borderRadius: 8,
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <BulbOutlined style={{ color: '#D97706', fontSize: 16 }} />
                      <span style={{ fontWeight: 700, color: '#92400E', fontSize: 13.5 }}>Mẹo nhanh</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5, color: '#475569' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#009688', marginTop: 6, flexShrink: 0 }} />
                        <span>Đảm bảo CCCD còn hiệu lực, rõ ràng, không mờ</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#009688', marginTop: 6, flexShrink: 0 }} />
                        <span>Chụp ảnh nơi đủ sáng, tránh ngược sáng</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#009688', marginTop: 6, flexShrink: 0 }} />
                        <span>Kiểm tra kết nối mạng ổn định</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cột phải: Hướng dẫn chuẩn bị */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: 300,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <FileTextOutlined style={{ color: '#009688', fontSize: 18 }} />
                      <span style={{ fontWeight: 700, color: '#0F172A', fontSize: 15 }}>Hướng dẫn chuẩn bị</span>
                    </div>

                    {/* Step 1 */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 14,
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: '#F8FAFC',
                        border: '1px solid #F1F5F9',
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#E0F2F1',
                          color: '#009688',
                          fontWeight: 700,
                          fontSize: 13,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        1
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1E293B' }}>Chuẩn bị CCCD</div>
                        <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
                          Đảm bảo CCCD còn hiệu lực, rõ ràng, không mờ, không bị hư hỏng.
                        </div>
                      </div>
                    </div>

                    {/* Step 2 */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 14,
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: '#F8FAFC',
                        border: '1px solid #F1F5F9',
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#E0F2F1',
                          color: '#009688',
                          fontWeight: 700,
                          fontSize: 13,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        2
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1E293B' }}>Môi trường chụp</div>
                        <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
                          Nơi đủ sáng, không phản quang. Tránh ánh nắng trực tiếp.
                        </div>
                      </div>
                    </div>

                    {/* Step 3 */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 14,
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: '#F8FAFC',
                        border: '1px solid #F1F5F9',
                      }}
                    >
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#E0F2F1',
                          color: '#009688',
                          fontWeight: 700,
                          fontSize: 13,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        3
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1E293B' }}>Kết nối mạng</div>
                        <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 2 }}>
                          Đảm bảo kết nối internet ổn định.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Nút Bắt đầu xác thực -> */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
                    <Button
                      type="primary"
                      onClick={() => setEkycSubStep(2)}
                      style={{
                        backgroundColor: '#009688',
                        borderColor: '#009688',
                        borderRadius: 6,
                        height: 36,
                        padding: '0 22px',
                        fontWeight: 600,
                        fontSize: 13,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>Bắt đầu xác thực</span>
                      <ArrowRightOutlined />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Sub-step 2: Khuôn mặt */}
            {ekycSubStep === 2 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 0',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>Xác thực khuôn mặt</div>
                  <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                    Giữ thẳng khuôn mặt trong khung hình và nhìn thẳng vào camera
                  </div>
                </div>

                {/* Face Scanning Viewfinder */}
                <FaceScanningViewfinder
                  videoRef={ekycVideoRef}
                  canvasRef={ekycFaceCanvasRef}
                  capturedPhoto={ekycLivePhoto}
                  isCameraActive={isEkycCameraActive}
                  isCameraLoading={isEkycCameraLoading}
                  isRecording={isEkycCameraRecording}
                  hasRecordedVideo={!!ekycLiveVideo}
                  livenessStage={ekycLivenessStage}
                  countdownProgress={ekycCountdownProgress}
                  cameraError={ekycCameraError}
                  faceValid={isEkycFaceValid}
                  validationResult={ekycFaceValidationResult}
                  statusMessage={ekycFaceStatusMessage}
                  onTakePhoto={() => triggerNativeCameraInWizard('face')}
                />

                {(ekycLivenessStage === 'COMPLETED' || ekycLivenessCompleted) && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
                    <Button
                      type="primary"
                      onClick={() => setEkycSubStep(3)}
                      style={{
                        backgroundColor: '#009688',
                        borderColor: '#009688',
                        borderRadius: 6,
                        padding: '0 24px',
                        height: 36,
                        fontWeight: 600,
                        fontSize: 13,
                      }}
                    >
                      Tiếp tục quét CCCD mặt trước <ArrowRightOutlined />
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Sub-step 3: Quét CCCD Mặt trước */}
            {ekycSubStep === 3 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 0',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>Chụp ảnh Căn cước công dân - Mặt trước</div>
                  <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                    Đặt mặt trước CCCD nằm trọn trong khung hình, đảm bảo rõ nét không bị bóng sáng
                  </div>
                </div>

                <CardScanningViewfinder
                  mode="front"
                  videoRef={ekycVideoRef}
                  capturedPhoto={ekycCardFrontPhoto}
                  isCameraActive={isEkycCameraActive}
                  isCameraLoading={isEkycCameraLoading}
                  cameraError={ekycCameraError}
                  validationResult={ekycCardFrontResult}
                  onTakePhoto={() => triggerNativeCameraInWizard('front')}
                />

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {ekycCardFrontPhoto ? (
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => {
                        setEkycCardFrontPhoto(null);
                        setEkycCardFrontResult(null);
                        startEkycCamera('environment');
                      }}
                      style={{ borderRadius: 6, height: 36 }}
                    >
                      Chụp lại
                    </Button>
                  ) : (
                    <>
                      <Button
                        icon={<CameraOutlined />}
                        onClick={() => triggerNativeCameraInWizard('front')}
                        style={{ borderRadius: 6, height: 36, borderColor: '#009688', color: '#00796B', fontWeight: 600 }}
                      >
                        Chụp ảnh / Tải ảnh CCCD
                      </Button>

                      <Button
                        type="primary"
                        onClick={handleCaptureCardFrontInWizard}
                        loading={isEkycProcessing}
                        style={{
                          backgroundColor: '#009688',
                          borderColor: '#009688',
                          borderRadius: 6,
                          padding: '0 20px',
                          height: 36,
                          fontWeight: 600,
                          fontSize: 13,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <CameraOutlined /> Chụp từ khung hình
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Sub-step 4: Quét CCCD Mặt sau (Chip & QR Code & MRZ) */}
            {ekycSubStep === 4 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 0',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#0F172A' }}>Chụp ảnh Căn cước công dân - Mặt sau</div>
                  <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                    Đặt mặt sau CCCD (phần có chip điện tử &amp; dòng mã MRZ) trong khung hình
                  </div>
                </div>

                <CardScanningViewfinder
                  mode="back"
                  videoRef={ekycVideoRef}
                  capturedPhoto={ekycCardBackPhoto}
                  isCameraActive={isEkycCameraActive}
                  isCameraLoading={isEkycCameraLoading}
                  cameraError={ekycCameraError}
                  validationResult={ekycCardBackResult}
                  onTakePhoto={() => triggerNativeCameraInWizard('back')}
                />

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                  {ekycCardBackPhoto ? (
                    <Button
                      icon={<ReloadOutlined />}
                      onClick={() => {
                        setEkycCardBackPhoto(null);
                        setEkycCardBackResult(null);
                        startEkycCamera('environment');
                      }}
                      style={{ borderRadius: 6, height: 36 }}
                    >
                      Chụp lại
                    </Button>
                  ) : (
                    <>
                      <Button
                        icon={<CameraOutlined />}
                        onClick={() => triggerNativeCameraInWizard('back')}
                        style={{ borderRadius: 6, height: 36, borderColor: '#009688', color: '#00796B', fontWeight: 600 }}
                      >
                        Chụp ảnh / Tải ảnh CCCD
                      </Button>

                      <Button
                        type="primary"
                        onClick={handleCaptureCardBackInWizard}
                        loading={isEkycProcessing}
                        style={{
                          backgroundColor: '#009688',
                          borderColor: '#009688',
                          borderRadius: 6,
                          padding: '0 20px',
                          height: 36,
                          fontWeight: 600,
                          fontSize: 13,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <CameraOutlined /> Chụp từ khung hình
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Sub-step 5: Xác nhận & Cấp chứng thư số eKYC */}
            {ekycSubStep === 5 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 16,
                  padding: '12px 0',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 17, color: '#0F766E' }}>
                    🎉 Xác thực danh tính Thành Công!
                  </div>
                  <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                    Dữ liệu sinh trắc học và Căn cước công dân đã được xác thực an toàn 100%.
                  </div>
                </div>

                {/* Chứng thư số */}
                <div
                  style={{
                    width: '100%',
                    maxWidth: 480,
                    background: '#F0FDFA',
                    border: '1px solid #CCFBF1',
                    borderRadius: 8,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#4B5563' }}>Họ và tên:</span>
                    <strong style={{ color: '#111827' }}>
                      {formData.name || ekycCardBackResult?.extractedData?.name || ekycCardFrontResult?.extractedData?.name || 'Chưa cập nhật'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#4B5563' }}>Số CCCD:</span>
                    <strong style={{ color: '#009688' }}>
                      {formData.docNumber || ekycCardBackResult?.extractedData?.idNumber || ekycCardFrontResult?.extractedData?.idNumber || 'Chưa cập nhật'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#4B5563' }}>Mã chứng thư số:</span>
                    <span style={{ color: '#0F766E', fontFamily: 'monospace', fontWeight: 600 }}>{ekycMatchResult?.certId || 'NEAC-EKYC-2026-8951'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#4B5563' }}>Trạng thái đối soát:</span>
                    <span style={{ color: '#0F766E', fontWeight: 700, background: '#CCFBF1', padding: '1px 8px', borderRadius: 4, fontSize: 12 }}>
                      ✓ Đã chứng thực NEAC
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      )}

        {/* Step 4: CMND / Thẻ căn cước / Hộ chiếu */}
        {step === 3 && (
          <div className="k-form-grid-3">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Loại giấy tờ</label>
              <Select
                value={formData.docType}
                onChange={val => handleChange('docType', val)}
                options={[{ label: 'Căn cước công dân', value: 'Căn cước công dân' }, { label: 'Chứng minh nhân dân', value: 'Chứng minh nhân dân' }, { label: 'Hộ chiếu', value: 'Hộ chiếu' }]}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số hộ chiếu</label>
              <Input value={formData.passportNumber} onChange={e => handleChange('passportNumber', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số giấy tờ</label>
              <Input value={formData.docNumber} onChange={e => handleChange('docNumber', e.target.value)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày cấp hộ chiếu</label>
              <Input type="date" value={formData.passportIssueDate} onChange={e => handleChange('passportIssueDate', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày cấp giấy tờ</label>
              <Input type="date" value={formData.docIssueDate} onChange={e => handleChange('docIssueDate', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nơi cấp hộ chiếu</label>
              <Select
                value={formData.passportIssuePlace || 'Cục Quản lý Xuất nhập cảnh'}
                onChange={val => handleChange('passportIssuePlace', val)}
                options={[
                  { label: 'Cục Quản lý Xuất nhập cảnh', value: 'Cục Quản lý Xuất nhập cảnh' },
                  { label: 'Phòng Quản lý Xuất nhập cảnh Công an Thành phố Hà Nội', value: 'Phòng Quản lý Xuất nhập cảnh Công an Thành phố Hà Nội' },
                  { label: 'Phòng Quản lý Xuất nhập cảnh Công an Thành phố Hồ Chí Minh', value: 'Phòng Quản lý Xuất nhập cảnh Công an Thành phố Hồ Chí Minh' },
                ]}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nơi cấp giấy tờ</label>
              <Select
                value={formData.docIssuePlace || 'Bộ Công an'}
                onChange={val => handleChange('docIssuePlace', val)}
                options={[
                  { label: 'Bộ Công an', value: 'Bộ Công an' },
                  { label: 'Cục Cảnh sát Quản lý hành chính về trật tự xã hội', value: 'Cục Cảnh sát Quản lý hành chính về trật tự xã hội' },
                  { label: 'Công an Thành phố Hà Nội', value: 'Công an Thành phố Hà Nội' },
                  { label: 'Công an Thành phố Hồ Chí Minh', value: 'Công an Thành phố Hồ Chí Minh' },
                ]}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày hết hạn hộ chiếu</label>
              <Input type="date" value={formData.passportExpiryDate} onChange={e => handleChange('passportExpiryDate', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày hết hạn giấy tờ</label>
              <Input type="date" value={formData.docExpiryDate} onChange={e => handleChange('docExpiryDate', e.target.value)} />
            </div>
          </div>
        )}

        {/* Step 4: Trình độ / Bằng cấp */}
        {step === 4 && (
          <div className="k-form-grid-3">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Trình độ văn hóa</label>
              <Select value={formData.educationLevel} onChange={val => handleChange('educationLevel', val)} options={EDUCATION_LEVEL_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chuyên ngành</label>
              <Select value={formData.major} onChange={val => handleChange('major', val)} options={MAJOR_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Trình độ đào tạo</label>
              <Select value={formData.trainingLevel} onChange={val => handleChange('trainingLevel', val)} options={TRAINING_LEVEL_OPTIONS} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Năm tốt nghiệp</label>
              <Input value={formData.graduationYear} onChange={e => handleChange('graduationYear', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nơi đào tạo</label>
              <Select value={formData.trainingPlace} onChange={val => handleChange('trainingPlace', val)} options={TRAINING_PLACE_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Xếp loại</label>
              <Select value={formData.degreeRank} onChange={val => handleChange('degreeRank', val)} options={DEGREE_RANK_OPTIONS} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Khoa</label>
              <Select value={formData.faculty} onChange={val => handleChange('faculty', val)} options={FACULTY_OPTIONS} />
            </div>
          </div>
        )}

        {/* Step 5: SĐT / Email / Khác */}
        {step === 5 && (
          <div className="k-form-grid-2">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Điện thoại di động</label>
              <Input value={formData.mobilePhone} onChange={e => handleChange('mobilePhone', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Email tài khoản</label>
              <Input value={formData.accountEmail} onChange={e => handleChange('accountEmail', e.target.value)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Email khác</label>
              <Input value={formData.otherEmail} onChange={e => handleChange('otherEmail', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Điện thoại nhà riêng</label>
              <Input value={formData.homePhone} onChange={e => handleChange('homePhone', e.target.value)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Điện thoại cơ quan</label>
              <Input value={formData.workPhone} onChange={e => handleChange('workPhone', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Skype</label>
              <Input value={formData.skype} onChange={e => handleChange('skype', e.target.value)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Điện thoại khác</label>
              <Input value={formData.otherPhone} onChange={e => handleChange('otherPhone', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Facebook</label>
              <Input value={formData.facebook} onChange={e => handleChange('facebook', e.target.value)} />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Email cá nhân</label>
              <Input value={formData.personalEmail} onChange={e => handleChange('personalEmail', e.target.value)} />
            </div>
          </div>
        )}

        {/* Step 6: Hộ khẩu thường trú */}
        {step === 6 && (
          <div className="k-form-grid-3">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quốc gia</label>
              <Select value={formData.hkttCountry} onChange={val => handleChange('hkttCountry', val)} options={NATIONALITY_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số sổ hộ khẩu</label>
              <Input value={formData.hkttBookNumber} onChange={e => handleChange('hkttBookNumber', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tỉnh/Thành phố</label>
              <Select value={formData.hkttCity} onChange={val => handleChange('hkttCity', val)} options={PROVINCE_OPTIONS} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Mã số hộ gia đình</label>
              <Input value={formData.hkttFamilyCode} onChange={e => handleChange('hkttFamilyCode', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quận/Huyện</label>
              <Input value={formData.hkttDistrict} onChange={e => handleChange('hkttDistrict', e.target.value)} />
            </div>
            <div style={{ marginTop: 22, display: 'flex', alignItems: 'center' }}>
              <Checkbox checked={formData.hkttIsHead} onChange={e => handleChange('hkttIsHead', e.target.checked)}>
                Là chủ hộ
              </Checkbox>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Phường/Xã</label>
              <Input value={formData.hkttWard} onChange={e => handleChange('hkttWard', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Địa chỉ</label>
              <Input value={formData.hkttAddress} onChange={e => handleChange('hkttAddress', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số nhà, đường phố</label>
              <Input value={formData.hkttStreetNumber} onChange={e => handleChange('hkttStreetNumber', e.target.value)} />
            </div>
          </div>
        )}

        {/* Step 7: Chỗ ở hiện nay */}
        {step === 7 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 13, color: '#64748B' }}>Thông tin nơi đang cư trú</div>
              <Checkbox checked={formData.resSameAsHKTT} onChange={e => handleChange('resSameAsHKTT', e.target.checked)}>
                Giống hộ khẩu thường trú
              </Checkbox>
            </div>
            <div className="k-form-grid-3">
              <div>
                <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quốc gia</label>
                <Select value={formData.resCountry} onChange={val => handleChange('resCountry', val)} options={NATIONALITY_OPTIONS} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tỉnh/Thành phố</label>
                <Select value={formData.resCity} onChange={val => handleChange('resCity', val)} options={PROVINCE_OPTIONS} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quận/Huyện</label>
                <Input value={formData.resDistrict} onChange={e => handleChange('resDistrict', e.target.value)} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Phường/Xã</label>
                <Input value={formData.resWard} onChange={e => handleChange('resWard', e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số nhà, đường phố</label>
                <Input value={formData.resStreetNumber} onChange={e => handleChange('resStreetNumber', e.target.value)} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Địa chỉ</label>
                <Input value={formData.resAddress} onChange={e => handleChange('resAddress', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* Step 8: Liên hệ khẩn cấp */}
        {step === 8 && (
          <div className="k-form-grid-3">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Họ và tên</label>
              <Input value={formData.emName} onChange={e => handleChange('emName', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quan hệ</label>
              <Select value={formData.emRelation} onChange={val => handleChange('emRelation', val)} options={EMERGENCY_RELATION_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Điện thoại di động</label>
              <Input value={formData.emPhone} onChange={e => handleChange('emPhone', e.target.value)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Điện thoại nhà riêng</label>
              <Input value={formData.emHomePhone} onChange={e => handleChange('emHomePhone', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Email</label>
              <Input value={formData.emEmail} onChange={e => handleChange('emEmail', e.target.value)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Địa chỉ</label>
              <Input value={formData.emAddress} onChange={e => handleChange('emAddress', e.target.value)} />
            </div>
          </div>
        )}

        {/* Step 9: Thông tin gia đình */}
        {step === 9 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13, color: '#64748B' }}>
                Danh sách thân nhân &amp; người phụ thuộc giảm trừ gia cảnh
              </div>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleOpenAddFamily}
                style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6, height: 32, fontSize: 13 }}
              >
                Thêm thân nhân
              </Button>
            </div>

            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left', minWidth: 920 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', color: '#475569', fontWeight: 600 }}>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', width: 45, whiteSpace: 'nowrap' }}>STT</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>Họ và tên</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>Quan hệ</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>Giới tính</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>Ngày sinh</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>Định danh</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>Nghề nghiệp</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>Số điện thoại</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>Giảm trừ gia cảnh</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', textAlign: 'center', width: 80, whiteSpace: 'nowrap' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {familyList.map((member, index) => (
                    <tr key={member.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 12px', color: '#64748B', whiteSpace: 'nowrap' }}>{index + 1}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap' }}>{member.name}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ background: '#E0F2F1', color: '#00796B', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap', display: 'inline-block' }}>
                          {member.relation}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{member.gender || '--'}</td>
                      <td style={{ padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{member.birthDate || '--'}</td>
                      <td style={{ padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{member.idNumber || '--'}</td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>{member.job || '--'}</td>
                      <td style={{ padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{member.phone || '--'}</td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {member.isDependent ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16A34A', fontSize: 12, background: '#DCFCE7', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                            <CheckCircleOutlined /> Người phụ thuộc
                          </span>
                        ) : (
                          <span style={{ color: '#94A3B8', fontSize: 12, whiteSpace: 'nowrap' }}>Không</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                          <button
                            onClick={() => handleOpenEditFamily(member)}
                            title="Sửa"
                            style={{ background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 4, padding: '4px 7px', cursor: 'pointer', color: '#009688' }}
                          >
                            <EditOutlined style={{ fontSize: 13 }} />
                          </button>
                          <button
                            onClick={() => handleDeleteFamily(member.id)}
                            title="Xóa"
                            style={{ background: 'transparent', border: '1px solid #FEE2E2', borderRadius: 4, padding: '4px 7px', cursor: 'pointer', color: '#EF4444' }}
                          >
                            <DeleteOutlined style={{ fontSize: 13 }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step 10: Thông tin chính trị */}
        {step === 10 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>Thông tin chính trị</div>
              <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
                <Checkbox checked={formData.isYouthUnion} onChange={e => handleChange('isYouthUnion', e.target.checked)}>Là Đoàn viên</Checkbox>
                <Checkbox checked={formData.isPartyMember} onChange={e => handleChange('isPartyMember', e.target.checked)}>Là Đảng viên</Checkbox>
              </div>
              <div className="k-form-grid-3">
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày vào Đoàn</label>
                  <Input type="date" value={formData.youthUnionDate} onChange={e => handleChange('youthUnionDate', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày vào Đảng</label>
                  <Input type="date" value={formData.partyJoinDate} onChange={e => handleChange('partyJoinDate', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chức vụ Đảng</label>
                  <Select value={formData.partyPosition} onChange={val => handleChange('partyPosition', val)} options={PARTY_POSITION_OPTIONS} />
                </div>
              </div>
            </div>

            <div style={{ paddingTop: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>Thông tin quân sự</div>
              <div style={{ display: 'flex', gap: 20, marginBottom: 12, flexWrap: 'wrap' }}>
                <Checkbox checked={formData.isMilitary} onChange={e => handleChange('isMilitary', e.target.checked)}>Là quân nhân</Checkbox>
                <Checkbox checked={formData.isWoundedSoldier} onChange={e => handleChange('isWoundedSoldier', e.target.checked)}>Là thương binh, bệnh binh</Checkbox>
                <Checkbox checked={formData.hasPolicyBenefit} onChange={e => handleChange('hasPolicyBenefit', e.target.checked)}>Hưởng chế độ</Checkbox>
              </div>
              {formData.isMilitary && (
                <div className="k-form-grid-3">
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày nhập ngũ</label>
                    <Input type="date" value={formData.militaryEnlistDate} onChange={e => handleChange('militaryEnlistDate', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Binh chủng</label>
                    <Select value={formData.militaryBranch} onChange={val => handleChange('militaryBranch', val)} options={MILITARY_BRANCH_OPTIONS} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Cấp bậc quân sự</label>
                    <Select value={formData.militaryRank} onChange={val => handleChange('militaryRank', val)} options={MILITARY_RANK_OPTIONS} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 11: Thông tin y tế & sức khỏe */}
        {step === 11 && (
          <div className="k-form-grid-3">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nhóm máu</label>
              <Select value={formData.bloodType} onChange={val => handleChange('bloodType', val)} options={BLOOD_TYPE_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chiều cao (m)</label>
              <Input value={formData.heightM} onChange={e => handleChange('heightM', e.target.value)} placeholder="VD: 1.75" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Cân nặng (kg)</label>
              <Input value={formData.weightKg} onChange={e => handleChange('weightKg', e.target.value)} placeholder="VD: 68" />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tình trạng sức khỏe</label>
              <Select value={formData.healthStatus} onChange={val => handleChange('healthStatus', val)} options={HEALTH_STATUS_OPTIONS} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Lưu ý y tế</label>
              <Input value={formData.medicalNote} onChange={e => handleChange('medicalNote', e.target.value)} placeholder="VD: Sức khỏe loại 1" />
            </div>
          </div>
        )}

        {/* Step 12: Thông tin trang phục (Gộp Kích cỡ may sẵn & Kích thước may đo) */}
        {step === 12 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {formData.gender === 'Nữ' && (
              <div
                style={{
                  background: '#F0FDFA',
                  border: '1px solid #CCFBF1',
                  borderRadius: 8,
                  padding: '8px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  color: '#0F766E',
                  fontSize: 12.5,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <HeartOutlined style={{ fontSize: 16, color: '#009688' }} />
                  <span>
                    Thông tin trang phục sẽ được đo trực tiếp tại văn phòng. Bạn có thể bỏ qua hoặc tự điền số đo ước tính nhé!
                  </span>
                </div>
                <Button
                  type="primary"
                  onClick={() => setIsFemaleTailorModalOpen(true)}
                  style={{
                    backgroundColor: '#009688',
                    borderColor: '#009688',
                    borderRadius: 14,
                    fontSize: 12,
                    height: 26,
                    padding: '0 12px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    flexShrink: 0,
                    fontWeight: 500,
                  }}
                >
                  Xem lời nhắn
                </Button>
              </div>
            )}

            {/* 1. Kích cỡ may sẵn */}
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B', marginBottom: 10 }}>
                Kích cỡ may sẵn
              </div>
              <div className="k-form-grid-4">
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Áo</label>
                  <Select value={formData.shirtLetter} onChange={val => handleChange('shirtLetter', val)} options={SHIRT_SIZE_OPTIONS} />
                </div>
                {formData.gender === 'Nữ' && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Zuýp</label>
                    <Select value={formData.skirtLetter} onChange={val => handleChange('skirtLetter', val)} options={SKIRT_SIZE_OPTIONS} />
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quần</label>
                  <Select value={formData.pantsLetter} onChange={val => handleChange('pantsLetter', val)} options={PANTS_SIZE_OPTIONS} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Đồ bảo hộ</label>
                  <Select value={formData.ppeLetter} onChange={val => handleChange('ppeLetter', val)} options={PPE_SIZE_OPTIONS} />
                </div>
              </div>
            </div>

            {/* 2. Kích thước may đo */}
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B', marginBottom: 10 }}>
                Kích thước may đo
              </div>

              <div className="k-form-grid-3">
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Rộng vai (cm)</label>
                  <Input value={formData.shoulderWidth} onChange={e => handleChange('shoulderWidth', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Dài tay (cm)</label>
                  <Input value={formData.sleeveLength} onChange={e => handleChange('sleeveLength', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Dài áo (cm)</label>
                  <Input value={formData.shirtLength} onChange={e => handleChange('shirtLength', e.target.value)} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Vòng ngực (cm)</label>
                  <Input value={formData.chestCircumference} onChange={e => handleChange('chestCircumference', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Vòng eo (cm)</label>
                  <Input value={formData.waistCircumference} onChange={e => handleChange('waistCircumference', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Vòng mông (cm)</label>
                  <Input value={formData.hipCircumference} onChange={e => handleChange('hipCircumference', e.target.value)} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Dài quần (cm)</label>
                  <Input value={formData.pantsLength} onChange={e => handleChange('pantsLength', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Vòng đùi (cm)</label>
                  <Input value={formData.thighCircumference} onChange={e => handleChange('thighCircumference', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 13: Thông tin ngân hàng */}
        {step === 13 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13, color: '#64748B' }}>
                Danh sách tài khoản ngân hàng nhận lương &amp; thông tin thanh toán
              </div>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleOpenAddBank}
                style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6, height: 32, fontSize: 13 }}
              >
                Thêm ngân hàng
              </Button>
            </div>

            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left', minWidth: 700 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', color: '#475569', fontWeight: 600 }}>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', width: 45 }}>STT</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Ngân hàng</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Số tài khoản</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Chủ tài khoản</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Chi nhánh</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Loại</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Trạng thái</th>
                    <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', textAlign: 'center', width: 80 }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {bankList.map((acc, index) => (
                    <tr key={acc.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 12px', color: '#64748B' }}>{index + 1}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1E293B' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <BankOutlined style={{ color: '#009688' }} />
                          <span>{acc?.bankName || '--'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#009688' }}>{acc?.accountNumber || '--'}</td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>{acc?.accountHolder || '--'}</td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>{acc?.branch || '--'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        {acc?.isPrimary ? (
                          <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircleOutlined /> Nhận lương chính
                          </span>
                        ) : (
                          <span style={{ background: '#F1F5F9', color: '#64748B', padding: '2px 8px', borderRadius: 4, fontSize: 12 }}>
                            Phụ
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircleOutlined /> {acc.status}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                          <button
                            onClick={() => handleOpenEditBank(acc)}
                            title="Sửa"
                            style={{ background: 'transparent', border: '1px solid #E2E8F0', borderRadius: 4, padding: '4px 7px', cursor: 'pointer', color: '#009688' }}
                          >
                            <EditOutlined style={{ fontSize: 13 }} />
                          </button>
                          <button
                            onClick={() => handleDeleteBank(acc.id)}
                            title="Xóa"
                            style={{ background: 'transparent', border: '1px solid #FEE2E2', borderRadius: 4, padding: '4px 7px', cursor: 'pointer', color: '#EF4444' }}
                          >
                            <DeleteOutlined style={{ fontSize: 13 }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* 4. Separate Bottom Action Card (Khung riêng biệt ở dưới cùng - Tự động sticky & toggle .is-stuck) */}
      <div ref={bottomBarRef} className="k-wizard-bottom-bar">
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={goBack}
          disabled={step === 0}
          style={{ borderRadius: 6, height: 36, fontSize: 13 }}
        >
          Quay lại
        </Button>

        <Button
          type="primary"
          onClick={goNext}
          style={{
            marginLeft: 'auto',
            backgroundColor: '#009688',
            borderColor: '#009688',
            borderRadius: 6,
            height: 36,
            fontSize: 13,
            fontWeight: 600,
            padding: '0 20px',
          }}
        >
          {step === STEPS.length - 1 ? (
            <>
              <CheckOutlined /> Hoàn tất thiết lập
            </>
          ) : (
            <>
              Tiếp theo <ArrowRightOutlined />
            </>
          )}
        </Button>
      </div>

      {/* MODAL: THÊM / SỬA THÂN NHÂN */}
      <Modal
        open={isFamilyModalOpen}
        onCancel={() => setIsFamilyModalOpen(false)}
        title={editingFamily ? 'Chỉnh sửa thân nhân' : 'Thêm thân nhân / người phụ thuộc'}
        onOk={handleSaveFamily}
        okText="Lưu thông tin"
        cancelText="Hủy"
        width={600}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10 }}>
          <div className="k-form-grid-2">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Họ và tên *</label>
              <Input value={familyForm.name} onChange={e => setFamilyForm({ ...familyForm, name: e.target.value })} placeholder="VD: Nguyễn Văn A" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quan hệ</label>
              <Select value={familyForm.relation} onChange={v => setFamilyForm({ ...familyForm, relation: v })} options={EMERGENCY_RELATION_OPTIONS} />
            </div>
          </div>
          <div className="k-form-grid-2">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Giới tính</label>
              <Select value={familyForm.gender} onChange={v => setFamilyForm({ ...familyForm, gender: v })} options={GENDER_OPTIONS} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày sinh</label>
              <Input type="date" value={familyForm.birthDate} onChange={e => setFamilyForm({ ...familyForm, birthDate: e.target.value })} />
            </div>
          </div>
          <div className="k-form-grid-2">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Định danh</label>
              <Input value={familyForm.idNumber} onChange={e => setFamilyForm({ ...familyForm, idNumber: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số điện thoại</label>
              <Input value={familyForm.phone} onChange={e => setFamilyForm({ ...familyForm, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nghề nghiệp</label>
            <Input value={familyForm.job} onChange={e => setFamilyForm({ ...familyForm, job: e.target.value })} />
          </div>
          <div style={{ marginTop: 6 }}>
            <Checkbox checked={familyForm.isDependent} onChange={e => setFamilyForm({ ...familyForm, isDependent: e.target.checked })}>
              Người phụ thuộc (giảm trừ gia cảnh)
            </Checkbox>
          </div>
        </div>
      </Modal>

      {/* MODAL: THÊM / SỬA NGÂN HÀNG */}
      <Modal
        open={isBankModalOpen}
        onCancel={() => setIsBankModalOpen(false)}
        title={editingBank ? 'Chỉnh sửa tài khoản ngân hàng' : 'Thêm tài khoản ngân hàng'}
        onOk={handleSaveBank}
        okText="Lưu thông tin"
        cancelText="Hủy"
        width={580}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tên ngân hàng</label>
            <Select
              value={bankForm.bankName}
              onChange={v => setBankForm({ ...bankForm, bankName: v })}
              showSearch
              options={[
                'Ngân hàng TMCP Ngoại Thương VN (Vietcombank)',
                'Ngân hàng TMCP Công Thương VN (VietinBank)',
                'Ngân hàng TMCP Đầu tư & Phát triển VN (BIDV)',
                'Ngân hàng Nông nghiệp & PTNT VN (Agribank)',
                'Ngân hàng TMCP Kỹ Thương VN (Techcombank)',
                'Ngân hàng TMCP Quân Đội (MB Bank)',
                'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)',
                'Ngân hàng TMCP Á Châu (ACB)',
                'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)',
                'Ngân hàng TMCP Tiên Phong (TPBank)',
              ].map(b => ({ value: b, label: b }))}
            />
          </div>
          <div className="k-form-grid-2">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số tài khoản (STK) *</label>
              <Input value={bankForm.accountNumber} onChange={e => setBankForm({ ...bankForm, accountNumber: e.target.value })} placeholder="VD: 0071000998822" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chi nhánh</label>
              <Input value={bankForm.branch} onChange={e => setBankForm({ ...bankForm, branch: e.target.value })} placeholder="VD: Chi nhánh Tân Định" />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chủ tài khoản</label>
            <Input value={bankForm.accountHolder} onChange={e => setBankForm({ ...bankForm, accountHolder: e.target.value })} />
          </div>
          <div style={{ marginTop: 6 }}>
            <Checkbox checked={bankForm.isPrimary} onChange={e => setBankForm({ ...bankForm, isPrimary: e.target.checked })}>
              Đặt làm tài khoản nhận lương chính
            </Checkbox>
          </div>
        </div>
      </Modal>

      {/* MODAL DIALOG "XIN LỖI" CUTE MÀU HỒNG KHI LÀ NỮ VÀO BƯỚC KÍCH THƯỚC MAY ĐO */}
      <Modal
        open={isFemaleTailorModalOpen}
        onCancel={() => setIsFemaleTailorModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#D81B60', fontSize: 16, fontWeight: 700 }}>
            <span><HeartOutlined style={{ color: '#D81B60' }} /></span><span>Xin lỗi bạn nhiều nhaa!!</span>
          </div>
        }
        width={480}
        style={{
          borderRadius: 8,
          border: '1px solid #F8BBD0',
          background: '#FFF5F8',
        }}
        styles={{
          header: {
            background: 'transparent',
            borderBottom: 'none',
            padding: '18px 22px 6px 22px',
          },
          body: {
            padding: '6px 22px 14px 22px',
            background: 'transparent',
          },
          footer: {
            background: 'transparent',
            borderTop: 'none',
            padding: '8px 22px 20px 22px',
          },
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button
              type="primary"
              onClick={() => setIsFemaleTailorModalOpen(false)}
              style={{
                backgroundColor: '#009688',
                borderColor: '#009688',
                borderRadius: 6,
                padding: '0 22px',
                height: 34,
                fontSize: 13,
              }}
            >
              Đã hiểu
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Icon Trái tim căn chuẩn chính giữa trên và dưới */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px 0 12px 0',
            }}
          >
            <HeartOutlined style={{ fontSize: 38, color: '#EC407A' }} />
          </div>

          <div
            style={{
              color: '#880E4F',
              fontSize: 13.5,
              lineHeight: 1.6,
              padding: '0 4px',
            }}
          >
            <p style={{ margin: 0, color: '#374151', fontSize: 13.5, fontWeight: 500 }}>
              Thông số trang phục để bên may đo chuẩn form và vừa vặn nhất cho bạn á!! ,bạn cho tui xin lỗi vì tui hỏi hơi tế nhị nhá.
            </p>
            <div style={{ marginTop: 8, fontSize: 12.5, color: '#E91E63', fontWeight: 500 }}>
              Bạn có thể bấm <strong>"Tiếp theo"</strong> để tiếp tục mà không cần nhập gì nhé ~
            </div>

            {/* Chữ ký Phó Giám Đốc căn phải */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop: 10 }}>
              <img
                src={signatureImg}
                alt="Chữ ký"
                style={{ width: 105, height: 'auto', objectFit: 'contain', marginBottom: 0, userSelect: 'none' }}
              />
              <div style={{ fontWeight: 700, fontSize: 13.5, color: '#1E293B' }}>
                Nguyễn Đức Đại Sơn
              </div>
              <div style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
                Phó Giám Đốc
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
