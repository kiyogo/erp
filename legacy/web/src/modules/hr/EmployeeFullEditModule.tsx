import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeftOutlined,
  UserOutlined,
  TeamOutlined,
  ShopOutlined,
  HeartOutlined,
  SafetyCertificateOutlined,
  SkinOutlined,
  KeyOutlined,
  FormOutlined,
  HistoryOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  BankOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CheckOutlined,
  CloseOutlined,
  LockOutlined,
  SafetyOutlined,
  HighlightOutlined,
  FileTextOutlined,
  QrcodeOutlined,
  FontSizeOutlined,
  UploadOutlined,
  CloudUploadOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SendOutlined,
  ExclamationCircleFilled,
  WarningOutlined,
  CheckSquareOutlined,
  BorderOutlined,
  SettingOutlined,
  HddOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import { Button, Input as BaseInput, Select as BaseSelect, message, Checkbox as BaseCheckbox, Modal, Tag, InputNumber } from '../../custom-ui';
import { dataService } from '../../services/dataService';
import { collectionsApi, employeesApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { EmployeeProfileWizard } from '../employee/EmployeeProfileWizard';
import { getEmployeeOnboardingStorage, isEmployeeOnboardingComplete } from '../employee/onboardingStorage';
import { FileUploadDialog } from '../../components/FileUploadDialog';
import { addressService } from '../../services/addressService';

// Options Constants for Dropdown Menus
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
  { label: 'Á tính', value: 'Á tính' },
  { label: 'Xám tính', value: 'Xám tính' },
  { label: 'Vô tính dao động', value: 'Vô tính dao động' },
  { label: 'Vô tính tách biệt', value: 'Vô tính tách biệt' },
  { label: 'Vô hấp dẫn nhưng mong muốn quan hệ', value: 'Vô hấp dẫn nhưng mong muốn quan hệ' },
  { label: 'Hấp dẫn không mong được đáp lại', value: 'Hấp dẫn không mong được đáp lại' },
  { label: 'Hấp dẫn khi được đáp lại', value: 'Hấp dẫn khi được đáp lại' },
  { label: 'Hấp dẫn giảm khi trở nên thân thiết', value: 'Hấp dẫn giảm khi trở nên thân thiết' },
  { label: 'Tính dục biến đổi', value: 'Tính dục biến đổi' },
  { label: 'Tính dục linh hoạt', value: 'Tính dục linh hoạt' },
  { label: 'Hấp dẫn bởi nét nam tính', value: 'Hấp dẫn bởi nét nam tính' },
  { label: 'Hấp dẫn bởi nét nữ tính', value: 'Hấp dẫn bởi nét nữ tính' },
  { label: 'Hấp dẫn với người phi nhị nguyên', value: 'Hấp dẫn với người phi nhị nguyên' },
  { label: 'Thiên dị tính', value: 'Thiên dị tính' },
  { label: 'Thiên đồng tính', value: 'Thiên đồng tính' },
  { label: 'Đơn tính', value: 'Đơn tính' },
  { label: 'Đa xu hướng', value: 'Đa xu hướng' },
  { label: 'Song tính mở rộng', value: 'Song tính mở rộng' },
  { label: 'Yêu người cùng giới', value: 'Yêu người cùng giới' },
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
  { label: 'Công nghệ thông tin', value: 'Công nghệ thông tin' },
  { label: 'Khoa học máy tính', value: 'Khoa học máy tính' },
  { label: 'Kỹ thuật phần mềm', value: 'Kỹ thuật phần mềm' },
  { label: 'Hệ thống thông tin quản lý', value: 'Hệ thống thông tin quản lý' },
  { label: 'An toàn thông tin', value: 'An toàn thông tin' },
  { label: 'Mạng máy tính', value: 'Mạng máy tính' },
  { label: 'Quản trị kinh doanh', value: 'Quản trị kinh doanh' },
  { label: 'Tài chính - Ngân hàng', value: 'Tài chính - Ngân hàng' },
  { label: 'Kế toán - Kiểm toán', value: 'Kế toán - Kiểm toán' },
  { label: 'Marketing', value: 'Marketing' },
  { label: 'Truyền thông', value: 'Truyền thông' },
  { label: 'Quản trị nhân lực', value: 'Quản trị nhân lực' },
  { label: 'Ngôn ngữ Anh', value: 'Ngôn ngữ Anh' },
  { label: 'Quốc tế học', value: 'Quốc tế học' },
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
  { label: 'Đại học Công nghệ - Đại học Quốc Gia Hà Nội', value: 'Đại học Công nghệ - ĐHQGHN' },
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
  { label: 'Toán - Tin ứng dụng', value: 'Toán - Tin ứng dụng' },
  { label: 'Điện tử Viễn thông', value: 'Điện tử Viễn thông' },
  { label: 'Ngoại ngữ', value: 'Ngoại ngữ' },
  { label: 'Khác', value: 'Khác' },
];

const CONTRACT_TYPE_OPTIONS = [
  { label: 'Hợp đồng lao động không xác định thời hạn', value: 'Hợp đồng lao động không xác định thời hạn' },
  { label: 'Hợp đồng lao động xác định thời hạn 1 đến 3 năm', value: 'Hợp đồng lao động xác định thời hạn 1 đến 3 năm' },
  { label: 'Hợp đồng thử việc', value: 'Hợp đồng thử việc' },
  { label: 'Hợp đồng thời vụ / Cộng tác viên', value: 'Hợp đồng thời vụ' },
];

const GRADE_LEVEL_OPTIONS = [
  { label: 'Cấp 1', value: 'Cấp 1' },
  { label: 'Cấp 2', value: 'Cấp 2' },
  { label: 'Cấp 3', value: 'Cấp 3' },
  { label: 'Cấp 4', value: 'Cấp 4' },
  { label: 'Cấp 5', value: 'Cấp 5' },
];

const RANK_STEP_OPTIONS = [
  { label: 'Bậc 1', value: 'Bậc 1' },
  { label: 'Bậc 2', value: 'Bậc 2' },
  { label: 'Bậc 3', value: 'Bậc 3' },
  { label: 'Bậc 4', value: 'Bậc 4' },
  { label: 'Bậc 5', value: 'Bậc 5' },
  { label: 'Bậc 6', value: 'Bậc 6' },
  { label: 'Bậc 7', value: 'Bậc 7' },
];

const LABOR_NATURE_OPTIONS = [
  { label: 'Toàn thời gian cố định', value: 'Toàn thời gian cố định' },
  { label: 'Bán thời gian', value: 'Bán thời gian' },
  { label: 'Làm việc từ xa', value: 'Làm việc từ xa' },
  { label: 'Linh hoạt', value: 'Linh hoạt' },
];

const SALARY_SCALE_OPTIONS = [
  { label: 'Bậc 1 - Nhân viên mới', value: 'Bậc 1 - Nhân viên mới' },
  { label: 'Bậc 2 - Chuyên viên', value: 'Bậc 2 - Chuyên viên' },
  { label: 'Bậc 3 - Chuyên viên cao cấp', value: 'Bậc 3 - Chuyên viên cao cấp' },
  { label: 'Bậc 4 - Chuyên gia', value: 'Bậc 4 - Chuyên gia' },
  { label: 'Bậc 5 - Quản lý cấp cao', value: 'Bậc 5 - Quản lý cấp cao' },
];

const HOSPITAL_OPTIONS = [
  { label: 'Bệnh viện Bạch Mai', value: 'Bệnh viện Bạch Mai' },
  { label: 'Bệnh viện Hữu Nghị Việt Đức', value: 'Bệnh viện Hữu Nghị Việt Đức' },
  { label: 'Bệnh viện Đại học Y Hà Nội', value: 'Bệnh viện Đại học Y Hà Nội' },
  { label: 'Bệnh viện E Hà Nội', value: 'Bệnh viện E Hà Nội' },
  { label: 'Bệnh viện Quân Y 108', value: 'Bệnh viện Quân Y 108' },
  { label: 'Bệnh viện Chợ Rẫy Thành phố Hồ Chí Minh', value: 'Bệnh viện Chợ Rẫy Thành phố Hồ Chí Minh' },
  { label: 'Bệnh viện Thống Nhất Thành phố Hồ Chí Minh', value: 'Bệnh viện Thống Nhất Thành phố Hồ Chí Minh' },
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

const RELATION_SELECT_OPTIONS = [
  { label: 'Bố đẻ', value: 'Bố đẻ' },
  { label: 'Mẹ đẻ', value: 'Mẹ đẻ' },
  { label: 'Vợ / Chồng', value: 'Vợ / Chồng' },
  { label: 'Con đẻ', value: 'Con đẻ' },
  { label: 'Con nuôi', value: 'Con nuôi' },
  { label: 'Anh ruột', value: 'Anh ruột' },
  { label: 'Chị ruột', value: 'Chị ruột' },
  { label: 'Em gái ruột', value: 'Em gái ruột' },
  { label: 'Em trai ruột', value: 'Em trai ruột' },
  { label: 'Bố mẹ vợ / Bố mẹ chồng', value: 'Bố mẹ vợ' },
  { label: 'Khác', value: 'Khác' },
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
  employeeName?: string;
  id: string;
  employeeCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branch: string;
  accountType: 'Tài khoản nhận lương chính' | 'Tài khoản phụ' | string;
  isPrimary: boolean;
  status: 'Đang hoạt động' | 'Tạm khóa' | 'Đã đóng' | string;
  note?: string;
}

interface SectionFieldItem {
  key: string;
  label: string;
}

interface SectionDefinition {
  key: string;
  label: string;
  desc: string;
  fields: SectionFieldItem[];
}

const SECTION_DETAILED_OPTIONS: SectionDefinition[] = [
  {
    key: 'Thông tin cơ bản',
    label: 'Thông tin cơ bản',
    desc: 'Họ tên, ngày sinh, giới tính, quê quán, dân tộc, tôn giáo...',
    fields: [
      { key: 'code', label: 'Mã nhân viên' },
      { key: 'name', label: 'Họ và tên' },
      { key: 'middleLastName', label: 'Họ và đệm' },
      { key: 'firstName', label: 'Tên' },
      { key: 'nickname', label: 'Tên gọi khác' },
      { key: 'gender', label: 'Giới tính' },
      { key: 'birthDate', label: 'Ngày sinh' },
      { key: 'maritalStatus', label: 'Tình trạng hôn nhân' },
      { key: 'taxCode', label: 'Mã số thuế cá nhân' },
      { key: 'ethnicity', label: 'Dân tộc' },
      { key: 'religion', label: 'Tôn giáo' },
      { key: 'birthPlace', label: 'Nơi sinh' },
      { key: 'originPlace', label: 'Nguyên quán' },
      { key: 'nationality', label: 'Quốc tịch' },
      { key: 'sexualOrientation', label: 'Xu hướng tính dục' },
      { key: 'selfBackground', label: 'Bản thân' },
      { key: 'familyBackground', label: 'Gia đình' },
      { key: 'avatar', label: 'Ảnh đại diện' },
    ],
  },
  {
    key: 'CMND / Thẻ căn cước',
    label: 'CMND / Thẻ căn cước',
    desc: 'Số CCCD/CMND, ngày cấp, nơi cấp, hộ chiếu, ảnh chụp 2 mặt...',
    fields: [
      { key: 'docType', label: 'Loại giấy tờ' },
      { key: 'docNumber', label: 'Số giấy tờ' },
      { key: 'docIssueDate', label: 'Ngày cấp giấy tờ' },
      { key: 'docIssuePlace', label: 'Nơi cấp giấy tờ' },
      { key: 'docExpiryDate', label: 'Ngày hết hạn giấy tờ' },
      { key: 'passportNumber', label: 'Số hộ chiếu' },
      { key: 'passportIssueDate', label: 'Ngày cấp hộ chiếu' },
      { key: 'passportIssuePlace', label: 'Nơi cấp hộ chiếu' },
      { key: 'passportExpiryDate', label: 'Ngày hết hạn hộ chiếu' },
      { key: 'frontCccd', label: 'Ảnh CCCD mặt trước' },
      { key: 'backCccd', label: 'Ảnh CCCD mặt sau' },
    ],
  },
  {
    key: 'Trình độ học vấn & Bằng cấp',
    label: 'Trình độ học vấn & Bằng cấp',
    desc: 'Trình độ văn hóa, đào tạo, chuyên ngành, năm tốt nghiệp...',
    fields: [
      { key: 'educationLevel', label: 'Trình độ văn hóa' },
      { key: 'trainingLevel', label: 'Trình độ đào tạo' },
      { key: 'major', label: 'Chuyên ngành' },
      { key: 'trainingPlace', label: 'Nơi đào tạo' },
      { key: 'graduationYear', label: 'Năm tốt nghiệp' },
      { key: 'degreeRank', label: 'Xếp loại' },
      { key: 'faculty', label: 'Khoa đào tạo' },
      { key: 'certificates', label: 'Chứng chỉ / Văn bằng khác' },
    ],
  },
  {
    key: 'Thông tin liên hệ & Địa chỉ',
    label: 'Thông tin liên hệ & Địa chỉ',
    desc: 'Điện thoại, email cá nhân, Skype, thường trú, tạm trú...',
    fields: [
      { key: 'mobilePhone', label: 'Điện thoại di động' },
      { key: 'accountEmail', label: 'Email tài khoản' },
      { key: 'personalEmail', label: 'Email cá nhân' },
      { key: 'otherEmail', label: 'Email khác' },
      { key: 'workPhone', label: 'Điện thoại cơ quan' },
      { key: 'homePhone', label: 'Điện thoại nhà riêng' },
      { key: 'otherPhone', label: 'Điện thoại khác' },
      { key: 'skype', label: 'Skype' },
      { key: 'facebook', label: 'Facebook' },
      { key: 'permanentCountry', label: 'Hộ khẩu: Quốc gia' },
      { key: 'permanentProvince', label: 'Hộ khẩu: Tỉnh / Thành' },
      { key: 'permanentDistrict', label: 'Hộ khẩu: Quận / Huyện' },
      { key: 'permanentWard', label: 'Hộ khẩu: Phường / Xã' },
      { key: 'permanentAddress', label: 'Hộ khẩu: Địa chỉ cụ thể' },
      { key: 'currentCountry', label: 'Tạm trú: Quốc gia' },
      { key: 'currentProvince', label: 'Tạm trú: Tỉnh / Thành' },
      { key: 'currentDistrict', label: 'Tạm trú: Quận / Huyện' },
      { key: 'currentWard', label: 'Tạm trú: Phường / Xã' },
      { key: 'currentAddress', label: 'Tạm trú: Chỗ ở hiện nay' },
      { key: 'emergencyContact', label: 'Thông tin liên hệ khẩn cấp' },
    ],
  },
  {
    key: 'Thông tin công việc',
    label: 'Thông tin công việc',
    desc: 'Phòng ban, chức vụ, vị trí việc làm, quản lý trực tiếp...',
    fields: [
      { key: 'organizationUnit', label: 'Đơn vị công tác' },
      { key: 'department', label: 'Phòng ban' },
      { key: 'position', label: 'Chức danh' },
      { key: 'jobTitle', label: 'Vị trí việc làm' },
      { key: 'contractType', label: 'Loại hợp đồng' },
      { key: 'joinDate', label: 'Ngày vào làm' },
      { key: 'officialDate', label: 'Ngày chính thức' },
      { key: 'directManager', label: 'Quản lý trực tiếp' },
      { key: 'workLocation', label: 'Địa điểm làm việc' },
      { key: 'workShift', label: 'Ca làm việc' },
    ],
  },
  {
    key: 'Thông tin gia đình',
    label: 'Thông tin gia đình',
    desc: 'Thành phần gia đình, chủ hộ, danh sách người thân...',
    fields: [
      { key: 'familyBackground', label: 'Thành phần gia đình' },
      { key: 'selfBackground', label: 'Thành phần bản thân' },
      { key: 'householdNumber', label: 'Số sổ hộ khẩu' },
      { key: 'householdCode', label: 'Mã số hộ gia đình' },
      { key: 'relatives', label: 'Danh sách người thân' },
    ],
  },
  {
    key: 'Chính trị, quân sự, y tế',
    label: 'Chính trị, quân sự, y tế',
    desc: 'Đoàn viên, Đảng viên, nghĩa vụ quân sự, chiều cao, cân nặng...',
    fields: [
      { key: 'isYouthUnion', label: 'Là Đoàn viên' },
      { key: 'youthUnionDate', label: 'Ngày vào Đoàn' },
      { key: 'youthUnionPlace', label: 'Nơi vào Đoàn' },
      { key: 'isPartyMember', label: 'Là Đảng viên' },
      { key: 'partyJoinDate', label: 'Ngày vào Đảng' },
      { key: 'partyOfficialDate', label: 'Ngày chính thức Đảng' },
      { key: 'partyJoinPlace', label: 'Nơi vào Đảng' },
      { key: 'partyCardNumber', label: 'Số thẻ Đảng' },
      { key: 'partyPosition', label: 'Chức vụ Đảng' },
      { key: 'militaryService', label: 'Nghĩa vụ quân sự' },
      { key: 'healthStatus', label: 'Tình trạng sức khỏe' },
      { key: 'bloodGroup', label: 'Nhóm máu' },
      { key: 'height', label: 'Chiều cao' },
      { key: 'weight', label: 'Cân nặng' },
    ],
  },
  {
    key: 'Số đo & Kích cỡ trang phục',
    label: 'Số đo trang phục',
    desc: 'Size áo, quần, zuýp, bảo hộ và số đo may đo 3 vòng...',
    fields: [
      { key: 'tailoringGender', label: 'Giới tính may đo' },
      { key: 'height', label: 'Chiều cao' },
      { key: 'weight', label: 'Cân nặng' },
      { key: 'shirtLetter', label: 'Cỡ áo' },
      { key: 'pantsLetter', label: 'Cỡ quần/váy' },
      { key: 'ppeLetter', label: 'Cỡ bảo hộ / Giày' },
      { key: 'chest', label: 'Số đo Vòng 1' },
      { key: 'waist', label: 'Số đo Vòng 2' },
      { key: 'butt', label: 'Số đo Vòng 3' },
      { key: 'shoulder', label: 'Rộng vai' },
      { key: 'arm', label: 'Dài tay' },
      { key: 'pants', label: 'Dài quần / váy' },
      { key: 'neck', label: 'Vòng cổ' },
      { key: 'thigh', label: 'Vòng đùi' },
      { key: 'costumeNote', label: 'Ghi chú may đo' },
    ],
  },
  {
    key: 'Tài khoản đăng nhập & Mật khẩu',
    label: 'Tài khoản đăng nhập',
    desc: 'Email đăng nhập hệ thống, mật khẩu truy cập và mã PIN...',
    fields: [
      { key: 'username', label: 'Tên đăng nhập' },
      { key: 'accountEmail', label: 'Email tài khoản' },
      { key: 'password', label: 'Mật khẩu tài khoản' },
      { key: 'passkey', label: 'Mã PIN / Passkey' },
      { key: 'twoFactor', label: 'Xác thực 2 lớp (2FA)' },
    ],
  },
  {
    key: 'Tài chính & Tài khoản ngân hàng',
    label: 'Tài chính & Ngân hàng',
    desc: 'Mã số thuế, số BHXH, BHYT và tài khoản ngân hàng nhận lương...',
    fields: [
      { key: 'taxCode', label: 'Mã số thuế cá nhân' },
      { key: 'socialInsuranceNumber', label: 'Số sổ BHXH' },
      { key: 'socialInsuranceStatus', label: 'Trạng thái BHXH' },
      { key: 'bankAccounts', label: 'Tài khoản ngân hàng nhận lương' },
      { key: 'hospitalPlace', label: 'Bệnh viện KCB ban đầu' },
      { key: 'baseSalary', label: 'Lương cơ bản' },
      { key: 'salaryCoefficient', label: 'Hệ số lương' },
    ],
  },
  {
    key: 'Chữ ký số cá nhân',
    label: 'Chữ ký số cá nhân',
    desc: 'Chứng thư số điện tử và mẫu chữ ký số vẽ tay...',
    fields: [
      { key: 'digisigCert', label: 'Chứng thư số điện tử' },
      { key: 'digisigProvider', label: 'Nhà cung cấp chứng thư' },
      { key: 'digisigSerial', label: 'Số Serial chứng thư' },
      { key: 'digisigExpiry', label: 'Ngày hết hạn chứng thư' },
      { key: 'signatureImage', label: 'Mẫu chữ ký vẽ tay' },
    ],
  },
  {
    key: 'Lịch sử & Quá trình',
    label: 'Lịch sử & Quá trình',
    desc: 'Quá trình công tác nội bộ, tăng lương, khen thưởng & kỷ luật...',
    fields: [
      { key: 'workHistory', label: 'Quá trình công tác nội bộ' },
      { key: 'salaryHistory', label: 'Lịch sử điều chỉnh lương' },
      { key: 'rewardDiscipline', label: 'Khen thưởng & Kỷ luật' },
      { key: 'trainingHistory', label: 'Quá trình đào tạo / bồi dưỡng' },
    ],
  },
];

const PortalContext = React.createContext<{
  isEmployeePortal: boolean;
  onCopy: (e: React.MouseEvent<HTMLElement>, text: string) => void;
}>({
  isEmployeePortal: false,
  onCopy: () => {},
});

// Stable top-level Read-only wrappers when accessed in Employee Portal (/employee/profile)
const Input: React.FC<any> & { Password?: React.FC<any> } = ({ style, ...props }) => {
  const { isEmployeePortal, onCopy } = React.useContext(PortalContext);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const valStr = props.value !== undefined && props.value !== null ? String(props.value) : '';
  const isEmpty = !valStr || valStr.trim() === '' || valStr.trim() === '--' || valStr.trim() === 'Không chọn';

  useLayoutEffect(() => {
    if (!isEmployeePortal || !wrapperRef.current) return;
    const parent = wrapperRef.current.parentElement;
    if (parent && !parent.className.includes('k-form-grid')) {
      parent.style.display = isEmpty ? 'none' : '';
    }
    return () => {
      if (parent && !parent.className.includes('k-form-grid')) {
        parent.style.display = '';
      }
    };
  }, [isEmployeePortal, isEmpty]);

  if (isEmployeePortal) {
    if (isEmpty) {
      return <div ref={wrapperRef} style={{ display: 'none' }} />;
    }
    return (
      <div
        ref={wrapperRef}
        onClick={(e) => onCopy(e, valStr)}
        style={{
          position: 'relative',
          width: '100%',
          cursor: 'pointer',
        }}
        title="Nhấp để copy"
        onMouseEnter={(e) => {
          const inp = e.currentTarget.querySelector('input');
          if (inp) {
            inp.style.borderColor = '#009688';
            inp.style.backgroundColor = '#F0FDF4';
          }
        }}
        onMouseLeave={(e) => {
          const inp = e.currentTarget.querySelector('input');
          if (inp) {
            inp.style.borderColor = '';
            inp.style.backgroundColor = '#FAFAFA';
          }
        }}
      >
        <BaseInput
          {...props}
          type={props.type === 'date' ? 'text' : props.type}
          readOnly
          tabIndex={-1}
          onFocus={(e: any) => e.target.blur()}
          style={{
            cursor: 'pointer',
            backgroundColor: '#FAFAFA',
            color: '#1E293B',
            pointerEvents: 'none',
            userSelect: 'text',
            transition: 'all 0.15s ease',
            ...style,
          }}
        />
      </div>
    );
  }
  return <BaseInput style={style} {...props} />;
};

Input.Password = (props: any) => {
  const { isEmployeePortal, onCopy } = React.useContext(PortalContext);
  if (isEmployeePortal) {
    const valStr = props.value !== undefined && props.value !== null ? String(props.value) : '••••••••••••';
    return (
      <div
        onClick={(e) => valStr && onCopy(e, valStr)}
        style={{
          position: 'relative',
          width: '100%',
          cursor: 'pointer',
        }}
        title="Nhấp để copy"
        onMouseEnter={(e) => {
          const inp = e.currentTarget.querySelector('input');
          if (inp) {
            inp.style.borderColor = '#009688';
            inp.style.backgroundColor = '#F0FDF4';
          }
        }}
        onMouseLeave={(e) => {
          const inp = e.currentTarget.querySelector('input');
          if (inp) {
            inp.style.borderColor = '';
            inp.style.backgroundColor = '#FAFAFA';
          }
        }}
      >
        <BaseInput
          {...props}
          type="password"
          value="••••••••••••"
          readOnly
          tabIndex={-1}
          onFocus={(e: any) => e.target.blur()}
          style={{
            cursor: 'pointer',
            backgroundColor: '#FAFAFA',
            color: '#1E293B',
            pointerEvents: 'none',
            userSelect: 'text',
            transition: 'all 0.15s ease',
            ...props.style,
          }}
        />
      </div>
    );
  }
  return <BaseInput.Password {...props} />;
};

const Select: React.FC<any> = ({ style, ...props }) => {
  const { isEmployeePortal, onCopy } = React.useContext(PortalContext);
  const wrapperRef = useRef<HTMLDivElement>(null);
  let displayVal = props.value;
  if (props.options && Array.isArray(props.options)) {
    const found = props.options.find((o: any) => o.value === props.value);
    if (found) displayVal = found.label;
  }
  const valStr = displayVal !== undefined && displayVal !== null ? String(displayVal) : '';
  const isEmpty = !valStr || valStr.trim() === '' || valStr.trim() === '--' || valStr.trim() === 'Không chọn';

  useLayoutEffect(() => {
    if (!isEmployeePortal || !wrapperRef.current) return;
    const parent = wrapperRef.current.parentElement;
    if (parent && !parent.className.includes('k-form-grid')) {
      parent.style.display = isEmpty ? 'none' : '';
    }
    return () => {
      if (parent && !parent.className.includes('k-form-grid')) {
        parent.style.display = '';
      }
    };
  }, [isEmployeePortal, isEmpty]);

  if (isEmployeePortal) {
    if (isEmpty) {
      return <div ref={wrapperRef} style={{ display: 'none' }} />;
    }
    return (
      <div
        ref={wrapperRef}
        onClick={(e) => onCopy(e, valStr)}
        style={{
          position: 'relative',
          width: '100%',
          cursor: 'pointer',
        }}
        title="Nhấp để copy"
        onMouseEnter={(e) => {
          if (valStr) {
            const inp = e.currentTarget.querySelector('input') || e.currentTarget.querySelector('.ant-select-selector');
            if (inp) {
              (inp as HTMLElement).style.borderColor = '#009688';
              (inp as HTMLElement).style.backgroundColor = '#F0FDF4';
            }
          }
        }}
        onMouseLeave={(e) => {
          const inp = e.currentTarget.querySelector('input') || e.currentTarget.querySelector('.ant-select-selector');
          if (inp) {
            (inp as HTMLElement).style.borderColor = '';
            (inp as HTMLElement).style.backgroundColor = '#FAFAFA';
          }
        }}
      >
        <BaseInput
          value={valStr}
          readOnly
          tabIndex={-1}
          placeholder={props.placeholder}
          onFocus={(e: any) => e.target.blur()}
          style={{
            cursor: 'pointer',
            backgroundColor: '#FAFAFA',
            color: '#1E293B',
            pointerEvents: 'none',
            userSelect: 'text',
            transition: 'all 0.15s ease',
            ...style,
          }}
        />
      </div>
    );
  }
  return <BaseSelect style={style} {...props} />;
};

const Checkbox: React.FC<any> = ({ children, checked, style, ...props }) => {
  const { isEmployeePortal, onCopy } = React.useContext(PortalContext);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const isEmpty = !checked;

  useLayoutEffect(() => {
    if (!isEmployeePortal || !wrapperRef.current) return;
    const parent = wrapperRef.current.parentElement;
    if (parent && !parent.className.includes('k-form-grid')) {
      parent.style.display = isEmpty ? 'none' : '';
    }
    return () => {
      if (parent && !parent.className.includes('k-form-grid')) {
        parent.style.display = '';
      }
    };
  }, [isEmployeePortal, isEmpty]);

  if (isEmployeePortal) {
    if (isEmpty) {
      return <div ref={wrapperRef} style={{ display: 'none' }} />;
    }
    const valStr = 'Có';
    return (
      <div ref={wrapperRef} style={{ width: '100%', ...style }}>
        {children && (
          <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
            {children}
          </label>
        )}
        <div
          onClick={(e) => onCopy(e, valStr)}
          style={{
            position: 'relative',
            width: '100%',
            cursor: 'pointer',
          }}
          title="Nhấp để copy"
          onMouseEnter={(e) => {
            const inp = e.currentTarget.querySelector('input');
            if (inp) {
              inp.style.borderColor = '#009688';
              inp.style.backgroundColor = '#F0FDF4';
            }
          }}
          onMouseLeave={(e) => {
            const inp = e.currentTarget.querySelector('input');
            if (inp) {
              inp.style.borderColor = '';
              inp.style.backgroundColor = '#FAFAFA';
            }
          }}
        >
          <BaseInput
            value="Có"
            readOnly
            tabIndex={-1}
            onFocus={(e: any) => e.target.blur()}
            style={{
              cursor: 'pointer',
              backgroundColor: '#FAFAFA',
              color: '#059669',
              fontWeight: 600,
              pointerEvents: 'none',
              userSelect: 'text',
              transition: 'all 0.15s ease',
            }}
          />
        </div>
      </div>
    );
  }
  return (
    <BaseCheckbox checked={checked} style={style} {...props}>
      {children}
    </BaseCheckbox>
  );
};

export const EmployeeFullEditModule: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isEmployeePortal = location.pathname.startsWith('/employee');
  const onboardingStorage = useMemo(() => getEmployeeOnboardingStorage(user), [user?.id, user?.email]);
  const [wizardDone, setWizardDone] = useState<boolean>(() => isEmployeeOnboardingComplete(onboardingStorage, user));
  const [provinceOptions, setProvinceOptions] = useState<Array<{ label: string; value: string; code?: number }>>(() => addressService.getProvinceOptions());
  const [workUnitOptions, setWorkUnitOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [positionOptions, setPositionOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [managerOptions, setManagerOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [bankOptions, setBankOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [workLocationOptions, setWorkLocationOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [workStatusOptions, setWorkStatusOptions] = useState<Array<{ label: string; value: string }>>([]);

  const [isResetSetupModalOpen, setIsResetSetupModalOpen] = useState(false);
  const [isUpdateRequestModalOpen, setIsUpdateRequestModalOpen] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [resetFieldMap, setResetFieldMap] = useState<Record<string, string[]>>({});
  const [resetNote, setResetNote] = useState('');
  const [updateFieldMap, setUpdateFieldMap] = useState<Record<string, string[]>>({});
  const [updateNote, setUpdateNote] = useState('');
  const [updateDeadline, setUpdateDeadline] = useState('');

  // Password Change State for Admin Edit
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Sub-Fields Detail Modal State
  const [subFieldModalConfig, setSubFieldModalConfig] = useState<{
    isOpen: boolean;
    mode: 'reset' | 'update';
    sectionKey: string;
  } | null>(null);

  // Helper functions for field selections
  const isSectionSelected = (mode: 'reset' | 'update', sectionKey: string) => {
    const map = mode === 'reset' ? resetFieldMap : updateFieldMap;
    return !!(map[sectionKey] && map[sectionKey].length > 0);
  };

  const getSectionSelectedCount = (mode: 'reset' | 'update', sectionKey: string) => {
    const map = mode === 'reset' ? resetFieldMap : updateFieldMap;
    return (map[sectionKey] || []).length;
  };

  const getSelectedSectionsList = (mode: 'reset' | 'update') => {
    const map = mode === 'reset' ? resetFieldMap : updateFieldMap;
    return Object.keys(map).filter(k => map[k] && map[k].length > 0);
  };

  const getTotalSelectedFieldsCount = (mode: 'reset' | 'update') => {
    const map = mode === 'reset' ? resetFieldMap : updateFieldMap;
    return Object.values(map).reduce((sum, list) => sum + (list ? list.length : 0), 0);
  };

  const toggleSection = (mode: 'reset' | 'update', sectionKey: string) => {
    const setMap = mode === 'reset' ? setResetFieldMap : setUpdateFieldMap;
    const sec = SECTION_DETAILED_OPTIONS.find(s => s.key === sectionKey);
    if (!sec) return;

    setMap(prev => {
      const next = { ...prev };
      if (next[sectionKey] && next[sectionKey].length > 0) {
        delete next[sectionKey];
      } else {
        next[sectionKey] = sec.fields.map(f => f.key);
      }
      return next;
    });
  };

  const toggleSubField = (mode: 'reset' | 'update', sectionKey: string, fieldKey: string) => {
    const setMap = mode === 'reset' ? setResetFieldMap : setUpdateFieldMap;
    setMap(prev => {
      const currentList = prev[sectionKey] || [];
      let nextList: string[];
      if (currentList.includes(fieldKey)) {
        nextList = currentList.filter(k => k !== fieldKey);
      } else {
        nextList = [...currentList, fieldKey];
      }
      const next = { ...prev };
      if (nextList.length === 0) {
        delete next[sectionKey];
      } else {
        next[sectionKey] = nextList;
      }
      return next;
    });
  };

  const selectAllSections = (mode: 'reset' | 'update') => {
    const setMap = mode === 'reset' ? setResetFieldMap : setUpdateFieldMap;
    const allMap: Record<string, string[]> = {};
    SECTION_DETAILED_OPTIONS.forEach(s => {
      allMap[s.key] = s.fields.map(f => f.key);
    });
    setMap(allMap);
  };

  const deselectAllSections = (mode: 'reset' | 'update') => {
    const setMap = mode === 'reset' ? setResetFieldMap : setUpdateFieldMap;
    setMap({});
  };

  const selectAllFieldsOfSection = (mode: 'reset' | 'update', sectionKey: string) => {
    const sec = SECTION_DETAILED_OPTIONS.find(s => s.key === sectionKey);
    if (!sec) return;
    const setMap = mode === 'reset' ? setResetFieldMap : setUpdateFieldMap;
    setMap(prev => ({
      ...prev,
      [sectionKey]: sec.fields.map(f => f.key),
    }));
  };

  const deselectAllFieldsOfSection = (mode: 'reset' | 'update', sectionKey: string) => {
    const setMap = mode === 'reset' ? setResetFieldMap : setUpdateFieldMap;
    setMap(prev => {
      const next = { ...prev };
      delete next[sectionKey];
      return next;
    });
  };

  useEffect(() => {
    setWizardDone(isEmployeeOnboardingComplete(onboardingStorage, user));
  }, [onboardingStorage, user]);
  const { id: paramId } = useParams<{ id?: string }>();
  const match = /\/(?:edit|employees\/edit|employee\/edit)\/([^/?#]+)/.exec(location.pathname);
  const id = paramId || (match ? match[1] : undefined);
  const [activeTab, setActiveTab] = useState('basic');
  const isClickingTabRef = useRef(false);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const avatarFileInputRef = useRef<HTMLInputElement>(null);
  const [avatarImgError, setAvatarImgError] = useState(false);

  const handleAvatarFile = (file: File) => {
    if (!file) return;

    // Giới hạn dung lượng tối đa 10MB
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
      message.error(`Dung lượng ảnh đại diện vượt quá 10MB (${fileSizeMB}MB)! Vui lòng chọn tệp nhỏ hơn.`);
      return;
    }

    // Hỗ trợ tối đa các định dạng ảnh phổ biến
    const isImageFormat = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|svg|tiff?|avif|heic|heif|ico)$/i.test(file.name);
    if (!isImageFormat) {
      message.error('Định dạng tệp không được hỗ trợ! Vui lòng chọn tệp hình ảnh.');
      return;
    }

    // Xử lý riêng cho ảnh Vector SVG: đọc trực tiếp không cần qua canvas
    if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
      const reader = new FileReader();
      reader.onload = () => {
        const svgBase64 = reader.result as string;
        setAvatarImgError(false);
        setFormData((prev: any) => ({ ...prev, avatarUrl: svgBase64, avatar: svgBase64 }));
        message.success('Đã tải ảnh đại diện thành công. Bấm "Lưu thay đổi" để đồng bộ hồ sơ.');
      };
      reader.onerror = () => message.error('Lỗi khi đọc tệp ảnh SVG.');
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const rawBase64 = reader.result as string;
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          // Tối ưu độ phân giải cao cho ảnh thẻ (tỉ lệ 3:4 chân dung chuẩn)
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 1066;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round(height * (MAX_WIDTH / width));
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round(width * (MAX_HEIGHT / height));
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Nền trắng cho ảnh có kênh alpha nếu xuất sang JPEG
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
            const outputMime = isPng ? 'image/png' : 'image/jpeg';
            const compressedBase64 = canvas.toDataURL(outputMime, 0.90);

            setAvatarImgError(false);
            setFormData((prev: any) => ({ ...prev, avatarUrl: compressedBase64, avatar: compressedBase64 }));
            message.success('Đã tải ảnh đại diện thành công. Bấm "Lưu thay đổi" để đồng bộ hồ sơ.');
          } else {
            setAvatarImgError(false);
            setFormData((prev: any) => ({ ...prev, avatarUrl: rawBase64, avatar: rawBase64 }));
            message.success('Đã tải ảnh đại diện thành công. Bấm "Lưu thay đổi" để đồng bộ hồ sơ.');
          }
        } catch {
          setAvatarImgError(false);
          setFormData((prev: any) => ({ ...prev, avatarUrl: rawBase64, avatar: rawBase64 }));
          message.success('Đã tải ảnh đại diện thành công. Bấm "Lưu thay đổi" để đồng bộ hồ sơ.');
        }
      };
      img.onerror = () => {
        setAvatarImgError(false);
        setFormData((prev: any) => ({ ...prev, avatarUrl: rawBase64, avatar: rawBase64 }));
        message.success('Đã tải ảnh đại diện thành công. Bấm "Lưu thay đổi" để đồng bộ hồ sơ.');
      };
      img.src = rawBase64;
    };
    reader.onerror = () => {
      message.error('Lỗi khi đọc tệp ảnh.');
    };
    reader.readAsDataURL(file);
  };

  const [storageQuotaGB, setStorageQuotaGB] = useState<number>(() => {
    try {
      const targetId = id || user?.id || '';
      if (targetId) {
        const saved = localStorage.getItem('employee_storage_quota_' + targetId);
        if (saved) return parseFloat(saved) || 2;
      }
    } catch {}
    return 2;
  });

  useEffect(() => {
    const targetId = id || user?.id || '';
    try {
      if (targetId) {
        const saved = localStorage.getItem('employee_storage_quota_' + targetId);
        if (saved) {
          setStorageQuotaGB(parseFloat(saved) || 2);
          return;
        }
      }
      setStorageQuotaGB(2);
    } catch {
      setStorageQuotaGB(2);
    }
  }, [id, user?.id]);

  const handleSaveStorageQuota = () => {
    const targetId = id || user?.id || '';
    try {
      if (targetId) {
        localStorage.setItem('employee_storage_quota_' + targetId, String(storageQuotaGB));
      }
      message.success(`Đã lưu hạn mức dung lượng lưu trữ ${storageQuotaGB} GB cho tài khoản thành công!`);
    } catch (err) {
      message.error('Không thể lưu dung lượng lưu trữ.');
    }
  };

  const handleBack = () => {
    if (isEmployeePortal) {
      navigate('/employee/home');
    } else {
      navigate(-1);
    }
  };

  const handleConfirmResetSetup = () => {
    const selectedSections = getSelectedSectionsList('reset');
    if (selectedSections.length === 0) {
      message.warning('Vui lòng chọn ít nhất 1 mục hoặc 1 trường dữ liệu cần đặt lại thiết lập!');
      return;
    }

    const empId = id || formData.code || user?.id || '';
    if (!empId) {
      message.error('Không xác định được nhân sự cần đặt lại hồ sơ.');
      return;
    }
    // 1. Reset data in dataService & localStorage
    dataService.resetEmployeeProfileSections(empId, selectedSections);
    
    // 2. Create update request of type reset_setup
    dataService.createEmployeeProfileUpdateRequest({
      employeeId: empId,
      employeeCode: formData.code,
      employeeName: formData.name,
      type: 'reset_setup',
      sections: selectedSections,
      note: resetNote,
      hrSender: 'Ban Quản trị / Phòng Nhân sự',
    });

    // 3. Clear local fields corresponding to reset sections
    setFormData((prev: any) => {
      const copy = { ...prev };
      if (selectedSections.includes('Thông tin cơ bản')) {
        const fields = resetFieldMap['Thông tin cơ bản'] || [];
        if (fields.includes('avatar')) copy.avatar = '';
        if (fields.includes('name')) copy.name = '';
        if (fields.includes('middleLastName')) copy.middleLastName = '';
        if (fields.includes('firstName')) copy.firstName = '';
        if (fields.includes('nickname')) copy.nickname = '';
        if (fields.includes('gender')) copy.gender = 'Nam';
        if (fields.includes('birthDate')) copy.birthDate = '';
        if (fields.includes('maritalStatus')) copy.maritalStatus = 'Độc thân';
        if (fields.includes('taxCode')) copy.taxCode = '';
        if (fields.includes('ethnicity')) copy.ethnicity = 'Kinh';
        if (fields.includes('religion')) copy.religion = 'Không';
        if (fields.includes('birthPlace')) copy.birthPlace = '';
        if (fields.includes('originPlace')) copy.originPlace = '';
        if (fields.includes('nationality')) copy.nationality = 'Việt Nam';
        if (fields.includes('selfBackground')) copy.selfBackground = '';
        if (fields.includes('familyBackground')) copy.familyBackground = '';
      }
      if (selectedSections.includes('CMND / Thẻ căn cước')) {
        const fields = resetFieldMap['CMND / Thẻ căn cước'] || [];
        if (fields.includes('docNumber')) copy.docNumber = '';
        if (fields.includes('docIssueDate')) copy.docIssueDate = '';
        if (fields.includes('docIssuePlace')) copy.docIssuePlace = '';
        if (fields.includes('docExpiryDate')) copy.docExpiryDate = '';
        if (fields.includes('passportNumber')) copy.passportNumber = '';
        if (fields.includes('passportIssueDate')) copy.passportIssueDate = '';
        if (fields.includes('passportIssuePlace')) copy.passportIssuePlace = '';
        if (fields.includes('passportExpiryDate')) copy.passportExpiryDate = '';
      }
      if (selectedSections.includes('Trình độ học vấn & Bằng cấp')) {
        const fields = resetFieldMap['Trình độ học vấn & Bằng cấp'] || [];
        if (fields.includes('educationLevel')) copy.educationLevel = '';
        if (fields.includes('trainingLevel')) copy.trainingLevel = '';
        if (fields.includes('major')) copy.major = '';
        if (fields.includes('graduationYear')) copy.graduationYear = '';
        if (fields.includes('trainingPlace')) copy.trainingPlace = '';
        if (fields.includes('degreeRank')) copy.degreeRank = '';
        if (fields.includes('faculty')) copy.faculty = '';
      }
      if (selectedSections.includes('Thông tin liên hệ & Địa chỉ')) {
        const fields = resetFieldMap['Thông tin liên hệ & Địa chỉ'] || [];
        if (fields.includes('mobilePhone')) copy.mobilePhone = '';
        if (fields.includes('personalEmail')) copy.personalEmail = '';
        if (fields.includes('permanentAddress')) copy.permanentAddress = '';
        if (fields.includes('currentAddress')) copy.currentAddress = '';
        if (fields.includes('skype')) copy.skype = '';
        if (fields.includes('facebook')) copy.facebook = '';
      }
      if (selectedSections.includes('Thông tin gia đình')) {
        copy.familyBackground = '';
        copy.selfBackground = '';
        copy.householdNumber = '';
        copy.householdCode = '';
      }
      if (selectedSections.includes('Chính trị, quân sự, y tế') || selectedSections.includes('Thông tin chính trị, quân sự, y tế')) {
        copy.healthStatus = '';
        copy.bloodGroup = '';
        copy.height = '';
        copy.weight = '';
      }
      if (selectedSections.includes('Số đo & Kích cỡ trang phục')) {
        copy.shirtLetter = 'Không chọn';
        copy.skirtLetter = 'Không chọn';
        copy.pantsLetter = 'Không chọn';
        copy.ppeLetter = 'Không chọn';
      }
      return copy;
    });

    setIsResetSetupModalOpen(false);
    setResetNote('');
    setResetFieldMap({});
    message.success('Đã đặt lại thiết lập hồ sơ thành công! Nhân viên sẽ phải hoàn thiện lại hồ sơ khi truy cập Cổng nhân viên.');
  };

  const handleSendUpdateRequest = () => {
    const selectedSections = getSelectedSectionsList('update');
    if (selectedSections.length === 0) {
      message.warning('Vui lòng chọn ít nhất 1 mục hoặc 1 trường dữ liệu cần yêu cầu nhân viên cập nhật!');
      return;
    }

    const empId = id || formData.code || user?.id || '';
    if (!empId) {
      message.error('Không xác định được nhân sự cần yêu cầu cập nhật.');
      return;
    }
    dataService.createEmployeeProfileUpdateRequest({
      employeeId: empId,
      employeeCode: formData.code,
      employeeName: formData.name,
      type: 'update_request',
      sections: selectedSections,
      note: updateNote,
      deadline: updateDeadline,
      hrSender: 'Ban Quản trị / Phòng Nhân sự',
    });

    setIsUpdateRequestModalOpen(false);
    setUpdateNote('');
    setUpdateDeadline('');
    setUpdateFieldMap({});
    message.success('Đã gửi yêu cầu cập nhật thông tin tới nhân viên thành công!');
  };

  // Copy tooltip state & handler for /employee/profile
  const [copyTarget, setCopyTarget] = useState<HTMLElement | null>(null);
  const [copyCoords, setCopyCoords] = useState<{ x: number; y: number } | null>(null);
  const [isCopyClosing, setIsCopyClosing] = useState(false);
  const initialScrollYRef = useRef<number>(0);
  const copyTimeoutRef = useRef<any>(null);
  const copyCloseTimeoutRef = useRef<any>(null);

  const startCloseCopyTooltip = () => {
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    if (copyCloseTimeoutRef.current) clearTimeout(copyCloseTimeoutRef.current);
    setIsCopyClosing(true);
    copyCloseTimeoutRef.current = setTimeout(() => {
      setCopyTarget(null);
      setCopyCoords(null);
      setIsCopyClosing(false);
    }, 140);
  };

  const handleCopy = (e: React.MouseEvent<HTMLElement>, textToCopy: string) => {
    if (!textToCopy) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (err) {
      console.error('Copy failed', err);
    }

    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    initialScrollYRef.current = window.scrollY;

    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    if (copyCloseTimeoutRef.current) clearTimeout(copyCloseTimeoutRef.current);

    setIsCopyClosing(false);
    setCopyTarget(target);
    setCopyCoords({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });

    copyTimeoutRef.current = setTimeout(() => {
      startCloseCopyTooltip();
    }, 900);
  };

  useEffect(() => {
    if (!copyTarget) return;

    const handleScrollOrResize = () => {
      if (!copyTarget || !copyTarget.isConnected) {
        startCloseCopyTooltip();
        return;
      }

      // If user scrolls more than 15px, dismiss with smooth exit animation
      if (Math.abs(window.scrollY - initialScrollYRef.current) > 15) {
        startCloseCopyTooltip();
        return;
      }

      const rect = copyTarget.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        startCloseCopyTooltip();
        return;
      }

      setCopyCoords({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    };

    window.addEventListener('scroll', handleScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, { capture: true });
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [copyTarget]);

  // Form State initialized with clean empty fields
  const [formData, setFormData] = useState<any>({
    // Header & Basic
    code: '',
    name: '',
    firstName: '',
    middleLastName: '',
    otherName: '',
    maritalStatus: '',
    taxCode: '',
    familyBackground: '',
    selfBackground: '',
    gender: '',
    sexualOrientation: '',
    ethnicity: '',
    birthDate: '',
    religion: '',
    birthPlace: '',
    originPlace: '',
    nationality: '',

    // CMND / Passport
    docType: '',
    docNumber: '',
    docIssueDate: '',
    docIssuePlace: '',
    docExpiryDate: '',
    passportNumber: '',
    passportIssueDate: '',
    passportIssuePlace: '',
    passportExpiryDate: '',

    // Education
    educationLevel: '',
    trainingLevel: '',
    major: '',
    graduationYear: '',
    trainingPlace: '',
    degreeRank: '',
    faculty: '',

    // Contact
    mobilePhone: '',
    accountEmail: '',
    workPhone: '',
    otherEmail: '',
    homePhone: '',
    skype: '',
    otherPhone: '',
    facebook: '',
    personalEmail: '',

    // HKTT
    hkttCountry: '',
    hkttBookNumber: '',
    hkttCity: '',
    hkttFamilyCode: '',
    hkttDistrict: '',
    hkttIsHead: false,
    hkttWard: '',
    hkttAddress: '',
    hkttStreetNumber: '',

    // Current Residence
    resSameAsHKTT: false,
    resCountry: '',
    resCity: '',
    resDistrict: '',
    resWard: '',
    resStreetNumber: '',
    resAddress: '',

    // Emergency Contact
    emName: '',
    emRelation: '',
    emPhone: '',
    emHomePhone: '',
    emEmail: '',
    emAddress: '',

    // Work Info
    workUnit: '',
    contractType: '',
    position: '',
    timekeepingCode: '',
    jobTitle: '',
    internshipDate: '',
    gradeLevel: '',
    probationDate: '',
    rankStep: '',
    officialDate: '',
    workStatus: 'Đang làm việc',
    seniority: '',
    laborNature: '',
    workLocation: '',
    directManager: '',
    indirectManager: '',
    laborBookNumber: '',
    retirementDate: '',

    // Salary & Insurance
    salaryScale: '',
    totalSalary: 0,
    salaryCoeff: '',
    bankAccount: '',
    bankName: '',
    baseSalary: 0,
    insuranceSalary: 0,
    allowances: '',
    deductions: '',

    // Insurance & Union
    insJoinDate: '',
    unionMember: false,
    insParticipate: false,
    bhxhRate: '',
    bhytRate: '',
    bhtnRate: '',
    insCity: '',
    insCityCode: '',
    bhytNumber: '',
    bhxhBookNumber: '',
    kcbHospital: '',
    bhxhCode: '',
    kcbCode: '',

    // Politics & Military & Medical
    isYouthUnion: false,
    isPartyMember: false,
    youthUnionDate: '',
    partyJoinDate: '',
    partyPosition: '',
    youthUnionPlace: '',
    partyJoinPlace: '',
    isMilitary: false,
    isWoundedSoldier: false,
    militaryEnlistDate: '',
    cmJoinDate: '',
    militaryBranch: '',
    woundedRank: '',
    militaryUnit: '',
    laborReductionRate: '',
    militaryRank: '',
    hasPolicyBenefit: false,
    militaryPosition: '',
    militaryDischargeDate: '',
    militaryDischargeReason: '',
    bloodType: '',
    diseases: '',
    heightM: '',
    weightKg: '',
    medicalNote: '',
    isDisability: false,
    healthStatus: '',

    // Clothing Uniforms
    shirtLetter: '',
    skirtLetter: '',
    ppeLetter: '',
    shirtNum: '',
    skirtNum: '',
    pantsNum: '',
    ppeNum: '',
    shoulderWidth: '',
    hipCircumference: '',
    sleeveLength: '',
    pantsLength: '',
    shirtLength: '',
    skirtLength: '',
    chestCircumference: '',
    thighCircumference: '',
    waistCircumference: '',

    // Account & Signature
    loginEmail: '',
    sigStatus: '',
    sigEffectiveDate: '',
    sigProfileStatus: '',
    sigExpiryDate: '',
  });

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const finalWorkUnitOptions = useMemo(() => {
    const opts = [...workUnitOptions];
    if (formData.workUnit && !opts.some((o) => o.value === formData.workUnit)) {
      opts.unshift({ label: formData.workUnit, value: formData.workUnit });
    }
    return opts;
  }, [workUnitOptions, formData.workUnit]);

  useEffect(() => {
    const loadCanonicalProfile = async () => {
      try {
        const response = isEmployeePortal
          ? await employeesApi.getMyProfile()
          : id ? await employeesApi.getOne(id) : null;
        const employee: any = response?.data?.employee;
        if (!employee) return;

        if (isEmployeePortal && isEmployeeOnboardingComplete(onboardingStorage, user, employee)) {
          setWizardDone(true);
        }
        const details = typeof employee.details === 'object' && employee.details ? employee.details : {};
        const empName = employee.name || employee.fullName || '';
        const nameParts = empName.trim().split(/\s+/);
        const autoFirstName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : empName;
        const autoMiddleLastName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';

        setFormData((previous: any) => ({
          ...previous,
          ...details,
          ...employee,
          code: employee.code || employee.employeeCode || previous.code || '',
          name: empName || previous.name || '',
          firstName: employee.firstName || details.firstName || autoFirstName || previous.firstName || '',
          middleLastName: employee.middleLastName || details.middleLastName || autoMiddleLastName || previous.middleLastName || '',
          loginEmail: employee.email || previous.loginEmail || '',
          accountEmail: employee.email || previous.accountEmail || '',
          personalEmail: employee.personalEmail || details.personalEmail || employee.email || previous.personalEmail || '',
          mobilePhone: employee.phone || details.mobilePhone || previous.mobilePhone || '',
          position: employee.position || details.position || previous.position || '',
          workUnit: employee.department || details.workUnit || details.department || previous.workUnit || '',
          totalSalary: employee.salaryBase ?? previous.totalSalary ?? 0,
          baseSalary: employee.salaryBase ?? previous.baseSalary ?? 0,
          officialDate: employee.joinDate || previous.officialDate || '',
          avatarUrl: employee.avatar || previous.avatarUrl || '',
          workStatus: employee.status || previous.workStatus || '',
          status: employee.status || previous.status || '',
        }));
        const loadedFamily = Array.isArray(details.familyMembers)
          ? details.familyMembers
          : Array.isArray(details.familyList)
          ? details.familyList
          : Array.isArray((employee as any).familyMembers)
          ? (employee as any).familyMembers
          : [];
        setFamilyList(loadedFamily);
        let loadedBanks: BankAccount[] = [];
        if (Array.isArray(details.bankAccounts) && details.bankAccounts.length > 0) {
          loadedBanks = details.bankAccounts;
        } else if (Array.isArray(employee.bankAccounts) && employee.bankAccounts.length > 0) {
          loadedBanks = employee.bankAccounts;
        } else if (employee.bankAccount || details.bankAccount || employee.bankName || details.bankName) {
          const bName = employee.bankName || details.bankName || 'Ngân hàng TMCP Ngoại Thương VN';
          const bAcc = employee.bankAccount || details.bankAccount || '';
          if (bAcc || bName) {
            loadedBanks = [
              {
                id: `ba-${employee.id || employee.code || '1'}`,
                bankName: bName,
                accountNumber: bAcc,
                accountHolder: employee.accountHolder || details.accountHolder || empName.toUpperCase(),
                branch: employee.branch || details.branch || details.bankBranch || '',
                accountType: 'Tài khoản nhận lương chính',
                isPrimary: true,
                status: details.bankStatus || employee.bankStatus || 'Chờ duyệt',
                employeeCode: employee.code || employee.employeeCode || '',
                employeeName: empName,
              },
            ];
          }
        }
        // Normalize bank account status in case of English strings
        loadedBanks = loadedBanks.filter(Boolean).map((b) => ({
          ...b,
          employeeCode: b.employeeCode || employee.code || employee.employeeCode || '',
          employeeName: b.employeeName || empName,
          status: b.status === 'verified' ? 'Đã duyệt' : b.status === 'rejected' ? 'Từ chối' : (b.status || 'Chờ duyệt'),
        }));
        setBankAccountList(loadedBanks);
      } catch {
        // The screen remains usable for a legacy record that has not yet been
        // migrated. A normal Save will create its server-side HR profile.
      }
    };
    void loadCanonicalProfile();
  }, [id, isEmployeePortal, user?.id]);

  const [managerOptionsLoaded, setManagerOptionsLoaded] = useState(false);
  const [isLoadingManagers, setIsLoadingManagers] = useState(false);

  const loadManagerOptions = async () => {
    if (managerOptionsLoaded || isLoadingManagers) return;
    setIsLoadingManagers(true);
    try {
      const employeeRes = await employeesApi.getAll().catch(() => ({ data: { data: [] } }));
      const employees = (employeeRes?.data?.data || []).filter((item: any) => item?.role !== 'ADMIN' && item?.status !== 'Đã nghỉ việc');
      setManagerOptions(employees.map((item: any) => ({
        label: `${item.name || item.fullName || 'Nhân sự'}${item.code || item.employeeCode ? ` (${item.code || item.employeeCode})` : ''}`,
        value: item.name || item.fullName || '',
      })));
      setManagerOptionsLoaded(true);
    } catch {
      // ignore
    } finally {
      setIsLoadingManagers(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const [provinces, units, positions, banks, workStatuses, orgUnitRes] = await Promise.all([
          addressService.getProvinceOptionsAsync().catch(() => []),
          dataService.fetchOrgUnitsList().catch(() => []),
          dataService.fetchDropdownOptions('positions').catch(() => []),
          dataService.fetchDropdownOptions('banks').catch(() => []),
          dataService.fetchDropdownOptions('work_statuses').catch(() => []),
          collectionsApi.get<any>('business_org_units', { limit: 500, sort: 'name', order: 'asc' }).catch(() => ({ data: { data: [] } })),
        ]);
        setProvinceOptions(provinces);
        setWorkUnitOptions(units.map((name) => ({ label: name, value: name })));
        setPositionOptions(positions.filter((item) => item.isActive !== false).map((item) => ({ label: item.name, value: item.name })));
        setBankOptions(banks.filter((item) => item.isActive !== false).map((item) => ({ label: item.name, value: item.name })));
        setWorkStatusOptions(workStatuses.filter((item) => item.isActive !== false).map((item) => ({ label: item.name, value: item.name })));
        const locations = Array.from(new Set((orgUnitRes?.data?.data || []).map((item: any) => item?.location).filter(Boolean)));
        setWorkLocationOptions(locations.map((name) => ({ label: String(name), value: String(name) })));
      } catch {
        // Fallback silently if any option fetching issue occurs
      }
    })();
  }, []);

  const [hkttWardOptions, setHkttWardOptions] = useState<{ label: string; value: string }[]>([]);
  const [resWardOptions, setResWardOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    if (formData.hkttCity) {
      void (async () => {
        const opts = await addressService.getWardOptionsByProvince(formData.hkttCity);
        setHkttWardOptions(opts);
      })();
    } else {
      setHkttWardOptions([]);
    }
  }, [formData.hkttCity]);

  useEffect(() => {
    if (formData.resCity) {
      void (async () => {
        const opts = await addressService.getWardOptionsByProvince(formData.resCity);
        setResWardOptions(opts);
      })();
    } else {
      setResWardOptions([]);
    }
  }, [formData.resCity]);

  // Family Members State
  const [familyList, setFamilyList] = useState<FamilyMember[]>([]);

  // Modal State for Family Member
  const [isFamilyModalOpen, setIsFamilyModalOpen] = useState(false);
  const [editingFamilyMember, setEditingFamilyMember] = useState<FamilyMember | null>(null);
  const [isFamilyViewModalOpen, setIsFamilyViewModalOpen] = useState(false);
  const [viewingFamilyMember, setViewingFamilyMember] = useState<FamilyMember | null>(null);
  const [familyMemberForm, setFamilyMemberForm] = useState<Partial<FamilyMember>>({
    name: '',
    relation: 'Bố đẻ',
    gender: 'Nam',
    birthDate: '',
    idNumber: '',
    job: '',
    phone: '',
    address: '',
    isDependent: false,
    dependentTaxCode: '',
    dependentStartDate: '',
    dependentEndDate: '',
  });

  const handleOpenAddFamily = () => {
    setEditingFamilyMember(null);
    setFamilyMemberForm({
      name: '',
      relation: 'Bố đẻ',
      gender: 'Nam',
      birthDate: '',
      idNumber: '',
      job: '',
      phone: '',
      address: '',
      isDependent: false,
      dependentTaxCode: '',
      dependentStartDate: '',
      dependentEndDate: '',
    });
    setIsFamilyModalOpen(true);
  };

  const handleOpenEditFamily = (member: FamilyMember) => {
    setEditingFamilyMember(member);
    setFamilyMemberForm({ ...member });
    setIsFamilyModalOpen(true);
  };

  const handleOpenViewFamily = (member: FamilyMember) => {
    setViewingFamilyMember(member);
    setIsFamilyViewModalOpen(true);
  };

  const syncFamilyList = async (updated: FamilyMember[]) => {
    const payload = {
      details: {
        ...formData,
        familyMembers: updated,
        familyList: updated,
        bankAccounts: bankAccountList,
      },
    };
    try {
      if (isEmployeePortal) {
        await employeesApi.updateMyProfile(payload);
      } else if (id) {
        await employeesApi.update(id, payload);
      }
    } catch (error: any) {
      console.error('syncFamilyList error:', error);
    }
  };

  const handleDeleteFamily = (memberId: string, memberName: string) => {
    const updated = familyList.filter(m => m.id !== memberId);
    setFamilyList(updated);
    void syncFamilyList(updated);
    message.success(`Đã xóa thân nhân "${memberName}" thành công!`);
  };

  const handleSaveFamilyMember = () => {
    if (!familyMemberForm.name?.trim()) {
      message.error('Vui lòng nhập họ và tên thân nhân!');
      return;
    }

    let updatedList: FamilyMember[];
    if (editingFamilyMember) {
      // Update
      updatedList = familyList.map(m => (m.id === editingFamilyMember.id ? { ...(familyMemberForm as FamilyMember), id: m.id } : m));
      setFamilyList(updatedList);
      void syncFamilyList(updatedList);
      message.success(`Đã cập nhật thông tin thân nhân "${familyMemberForm.name}" thành công!`);
    } else {
      // Add
      const newMember: FamilyMember = {
        ...(familyMemberForm as FamilyMember),
        id: `fm-${Date.now()}`,
      };
      updatedList = [...familyList, newMember];
      setFamilyList(updatedList);
      void syncFamilyList(updatedList);
      message.success(`Đã thêm thân nhân "${newMember.name}" thành công!`);
    }
    setIsFamilyModalOpen(false);
  };

  // Bank Accounts State (Thông tin tài chính)
  const [bankAccountList, setBankAccountList] = useState<BankAccount[]>([]);

  const syncBankAccounts = async (updated: BankAccount[]) => {
    const primaryBank = updated.find((b) => b.isPrimary) || updated[0];
    const payload = {
      bankAccount: primaryBank?.accountNumber || '',
      bankName: primaryBank?.bankName || '',
      details: {
        ...formData,
        bankAccounts: updated,
        bankAccount: primaryBank?.accountNumber || '',
        bankName: primaryBank?.bankName || '',
        accountHolder: primaryBank?.accountHolder || '',
        bankBranch: primaryBank?.branch || '',
        bankStatus: primaryBank?.status || 'Chờ duyệt',
      },
    };
    try {
      if (isEmployeePortal) {
        await employeesApi.updateMyProfile(payload);
      } else if (id) {
        await employeesApi.update(id, payload);
      }
    } catch (error: any) {
      console.error('syncBankAccounts error:', error);
      message.error(error?.response?.data?.message || 'Không thể đồng bộ tài khoản ngân hàng.');
    }
  };

  // Modal State for Bank Account
  const [isBankModalOpen, setIsBankModalOpen] = useState(false);
  const [editingBankAccount, setEditingBankAccount] = useState<BankAccount | null>(null);
  const [isBankViewModalOpen, setIsBankViewModalOpen] = useState(false);
  const [viewingBankAccount, setViewingBankAccount] = useState<BankAccount | null>(null);
  const [bankAccountForm, setBankAccountForm] = useState<Partial<BankAccount>>({
    bankName: 'Ngân hàng TMCP Ngoại Thương VN',
    accountNumber: '',
    accountHolder: '',
    branch: '',
    accountType: 'Tài khoản nhận lương chính',
    isPrimary: true,
    status: isEmployeePortal ? 'Chờ duyệt' : 'Đã duyệt',
    note: '',
  });

  const handleOpenAddBank = () => {
    setEditingBankAccount(null);
    setBankAccountForm({
      bankName: 'Ngân hàng TMCP Ngoại Thương VN',
      accountNumber: '',
      accountHolder: (formData?.name || '').toUpperCase(),
      branch: '',
      accountType: bankAccountList.length === 0 ? 'Tài khoản nhận lương chính' : 'Tài khoản phụ',
      isPrimary: bankAccountList.length === 0,
      status: isEmployeePortal ? 'Chờ duyệt' : 'Đã duyệt',
      note: '',
    });
    setIsBankModalOpen(true);
  };

  const handleOpenEditBank = (item: BankAccount) => {
    setEditingBankAccount(item);
    setBankAccountForm({ ...item });
    setIsBankModalOpen(true);
  };

  const handleOpenViewBank = (item: BankAccount) => {
    setViewingBankAccount(item);
    setIsBankViewModalOpen(true);
  };

  const handleDeleteBank = (bankId: string, bankName: string) => {
    Modal.confirm({
      title: 'Xác nhận xóa tài khoản ngân hàng?',
      content: `Bạn có chắc chắn muốn xóa tài khoản ngân hàng "${bankName}" không?`,
      okText: 'Xóa ngân hàng',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        const updated = bankAccountList.filter((b) => b.id !== bankId);
        setBankAccountList(updated);
        await syncBankAccounts(updated);
        try {
          dataService.deleteEmployeeBankAccount(bankId);
        } catch {}
        message.success(`Đã xóa ngân hàng "${bankName}" thành công!`);
        if (isBankViewModalOpen) setIsBankViewModalOpen(false);
      },
    });
  };

  const handleApproveBank = async (bankId: string, bankName: string) => {
    const updated = bankAccountList.map((b) => (b.id === bankId ? { ...b, status: 'Đã duyệt' } : b));
    setBankAccountList(updated);
    if (viewingBankAccount && viewingBankAccount.id === bankId) {
      setViewingBankAccount({ ...viewingBankAccount, status: 'Đã duyệt' });
    }
    await syncBankAccounts(updated);
    try {
      dataService.approveEmployeeBankAccount(bankId);
    } catch {}
    message.success(`Đã phê duyệt tài khoản ngân hàng "${bankName}" thành công!`);
  };

  const handleRejectBank = (bankId: string, bankName: string) => {
    Modal.confirm({
      title: 'Xác nhận từ chối tài khoản ngân hàng?',
      content: `Bạn có chắc chắn muốn từ chối tài khoản ngân hàng "${bankName}" của nhân sự này không? Nhân viên sẽ nhận được thông báo để chỉnh sửa lại.`,
      okText: 'Từ chối duyệt',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        const updated = bankAccountList.map((b) => (b.id === bankId ? { ...b, status: 'Từ chối' } : b));
        setBankAccountList(updated);
        if (viewingBankAccount && viewingBankAccount.id === bankId) {
          setViewingBankAccount({ ...viewingBankAccount, status: 'Từ chối' });
        }
        await syncBankAccounts(updated);
        try {
          dataService.rejectEmployeeBankAccount(bankId, 'Thông tin chưa trùng khớp với hồ sơ nhân sự');
        } catch {}
        message.warning(`Đã từ chối tài khoản ngân hàng "${bankName}".`);
      },
    });
  };

  const handleSaveBankAccount = async () => {
    if (!bankAccountForm.accountNumber?.trim()) {
      message.error('Vui lòng nhập số tài khoản ngân hàng!');
      return;
    }
    if (!bankAccountForm.bankName?.trim()) {
      message.error('Vui lòng chọn tên ngân hàng!');
      return;
    }
    if (!bankAccountForm.accountHolder?.trim()) {
      message.error('Vui lòng nhập tên chủ tài khoản!');
      return;
    }

    const currentEmpCode = formData?.code || '';
    const currentEmpName = formData?.name || '';

    const isRejected = editingBankAccount?.status === 'Từ chối' || editingBankAccount?.status === 'rejected';
    const newStatus = isEmployeePortal
      ? 'Chờ duyệt'
      : (bankAccountForm.status || 'Đã duyệt');

    const newAccount: BankAccount = {
      ...(editingBankAccount ? { ...editingBankAccount, ...bankAccountForm } : bankAccountForm),
      id: editingBankAccount ? editingBankAccount.id : `ba-${Date.now()}`,
      employeeCode: currentEmpCode,
      employeeName: currentEmpName,
      bankName: bankAccountForm.bankName.trim(),
      accountNumber: bankAccountForm.accountNumber.trim(),
      accountHolder: bankAccountForm.accountHolder.trim(),
      branch: bankAccountForm.branch || '',
      accountType: bankAccountForm.accountType || 'Tài khoản phụ',
      status: newStatus,
      isPrimary: bankAccountForm.isPrimary ?? (bankAccountList.length === 0),
    };

    let nextList: BankAccount[];
    if (editingBankAccount) {
      nextList = bankAccountList.map((b) => (b.id === editingBankAccount.id ? newAccount : (newAccount.isPrimary ? { ...b, isPrimary: false } : b)));
    } else {
      nextList = newAccount.isPrimary
        ? [newAccount, ...bankAccountList.map((b) => ({ ...b, isPrimary: false }))]
        : [...bankAccountList, newAccount];
    }

    setBankAccountList(nextList);
    await syncBankAccounts(nextList);

    try {
      dataService.saveEmployeeBankAccount(newAccount, isEmployeePortal);
    } catch {}

    if (isEmployeePortal) {
      if (isRejected) {
        message.success(`Đã cập nhật lại thông tin và gửi duyệt thành công! Vui lòng chờ Quản trị viên phê duyệt.`);
      } else if (editingBankAccount) {
        message.success(`Đã lưu thay đổi thông tin tài khoản ngân hàng thành công!`);
      } else {
        message.success(`Đã gửi yêu cầu thêm ngân hàng "${bankAccountForm.bankName}" thành công! Vui lòng chờ Quản trị viên duyệt.`);
      }
    } else {
      message.success(`Đã lưu thông tin ngân hàng "${bankAccountForm.bankName}" thành công!`);
    }
    setIsBankModalOpen(false);
  };

  // =========================================================================
  // CHỮ KÝ SỐ & PASSKEY STATE & HANDLERS
  // =========================================================================
  const targetEmpCode = formData?.code || '';
  const targetEmpName = formData?.name || '';

  const [digisigData, setDigisigData] = useState<any>(() => dataService.getEmployeeDigisig(targetEmpCode));

  useEffect(() => {
    setDigisigData(dataService.getEmployeeDigisig(targetEmpCode));
  }, [targetEmpCode]);

  // Admin Modal: Cấp / Chỉnh sửa chứng thư số
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [issueForm, setIssueForm] = useState<any>({
    certNumber: '',
    provider: 'KIYO Internal PKI CA',
    certType: 'Chữ ký số nội bộ',
    status: 'Đang hoạt động',
    issueDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 3 * 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
    issuedBy: 'Ban Giám Đốc',
    note: '',
  });

  const handleOpenIssueModal = () => {
    const current = dataService.getEmployeeDigisig(targetEmpCode);
    if (current) {
      setIssueForm({ ...current });
    } else {
      setIssueForm({
        certNumber: `CERT-${targetEmpCode.replace(/[^A-Za-z0-9]/g, '')}-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
        provider: 'KIYO Internal PKI CA',
        certType: 'Chữ ký số nội bộ',
        status: 'Đang hoạt động',
        issueDate: new Date().toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 3 * 365 * 24 * 3600 * 1000).toISOString().split('T')[0],
        issuedBy: 'Ban Giám Đốc',
        note: 'Cấp chứng thư chữ ký số chính thức',
      });
    }
    setIsIssueModalOpen(true);
  };

  const handleSaveIssueCert = () => {
    const payload = {
      ...issueForm,
      employeeCode: targetEmpCode,
      employeeName: targetEmpName,
      status: issueForm.status || 'Đang hoạt động',
    };
    const saved = dataService.saveEmployeeDigisig(payload);
    setDigisigData(saved);
    setIsIssueModalOpen(false);
    message.success(`Đã cấp chứng thư số ${saved.certNumber} cho nhân sự ${targetEmpName} thành công!`);
  };

  const handleRevokeCert = () => {
    dataService.revokeEmployeeDigisig(targetEmpCode, 'Thu hồi bởi Quản trị viên');
    setDigisigData(dataService.getEmployeeDigisig(targetEmpCode));
    message.warning(`Đã thu hồi / tạm khóa chứng thư số của ${targetEmpName}`);
  };

  // Employee Modal: Thiết lập mẫu chữ ký cá nhân
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [signTab, setSignTab] = useState<'font' | 'draw' | 'upload'>('font');
  const [signText, setSignText] = useState(targetEmpName);
  const [selectedFontIndex, setSelectedFontIndex] = useState(0);
  const [uploadedSignImage, setUploadedSignImage] = useState<string | null>(null);
  const [signUploadPickerOpen, setSignUploadPickerOpen] = useState(false);
  const [signaturePosition, setSignaturePosition] = useState<'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'>(() => {
    try {
      const saved = localStorage.getItem('kiyovn_signature_position');
      if (saved) return saved as any;
    } catch (e) {}
    return 'bottom-right';
  });
  const [signaturePage, setSignaturePage] = useState<'first' | 'last'>(() => {
    try {
      const saved = localStorage.getItem('kiyovn_signature_page');
      if (saved) return saved as any;
    } catch (e) {}
    return 'first';
  });

  // Canvas Drawing Ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'clientX' in e ? e.clientX : e.touches[0].clientX;
    const clientY = 'clientY' in e ? e.clientY : e.touches[0].clientY;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    ctx.strokeStyle = '#0052CC';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // PASSKEY VERIFICATION
  const [isPasskeyModalOpen, setIsPasskeyModalOpen] = useState(false);
  const [passkeyInput, setPasskeyInput] = useState('');
  const [passkeyCallback, setPasskeyCallback] = useState<(() => void) | null>(null);
  const [passkeyPromptTitle, setPasskeyPromptTitle] = useState('Xác thực Passkey');

  const requirePasskey = (title: string, onVerified: () => void) => {
    setPasskeyPromptTitle(title);
    setPasskeyInput('');
    setPasskeyCallback(() => onVerified);
    setIsPasskeyModalOpen(true);
  };

  const handleConfirmPasskey = () => {
    if (!passkeyInput.trim()) {
      message.error('Vui lòng nhập mã Passkey PIN!');
      return;
    }

    const isValid = dataService.verifyEmployeePasskey(targetEmpCode, passkeyInput);
    if (!isValid) {
      message.error('Mã Passkey PIN không chính xác! Vui lòng thử lại.');
      return;
    }

    message.success('Xác thực Passkey bảo mật thành công!');
    setIsPasskeyModalOpen(false);
    if (passkeyCallback) {
      passkeyCallback();
    }
  };

  const handleSaveSignature = () => {
    requirePasskey('Xác thực Passkey', () => {
      let finalImg = '';
      if (signTab === 'draw' && canvasRef.current) {
        finalImg = canvasRef.current.toDataURL('image/png');
      } else if (signTab === 'upload' && uploadedSignImage) {
        finalImg = uploadedSignImage;
      }
      const updated = dataService.updateEmployeeSignatureVisual(
        targetEmpCode,
        finalImg,
        signTab,
        signText
      );
      setDigisigData({ ...digisigData, ...updated, signatureType: signTab, signatureText: signText, signatureImage: finalImg });
      try {
        localStorage.setItem('kiyovn_signature_position', signaturePosition);
        localStorage.setItem('kiyovn_signature_page', signaturePage);
      } catch (e) {}
      setIsSignModalOpen(false);
      message.success('Đã lưu mẫu chữ ký số cá nhân thành công!');
    });
  };

  const handleTestSignDoc = (docName: string) => {
    requirePasskey(`Xác thực Passkey để ký số "${docName}"`, () => {
      dataService.logDigitalSigning(targetEmpCode, docName, 'Tài liệu thử nghiệm');
      message.success(`Ký số thành công tài liệu "${docName}"!`);
    });
  };

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleChangePassword = async () => {
    const trimmedPass = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedPass) {
      message.error('Vui lòng nhập mật khẩu mới!');
      return;
    }
    if (trimmedPass.length < 6) {
      message.error('Mật khẩu mới phải có ít nhất 6 ký tự!');
      return;
    }
    if (trimmedPass !== trimmedConfirm) {
      message.error('Mật khẩu xác nhận không trùng khớp!');
      return;
    }

    const targetId = id || formData.userId || formData.id || formData.code;
    if (!targetId) {
      message.error('Không tìm thấy thông tin tài khoản nhân sự.');
      return;
    }

    setIsChangingPassword(true);
    try {
      await employeesApi.changePassword(targetId, {
        newPassword: trimmedPass,
        confirmPassword: trimmedConfirm,
      });
      message.success(`Đã cập nhật mật khẩu mới cho nhân sự "${formData.name || formData.loginEmail || formData.code}" thành công!`);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Không thể đổi mật khẩu cho nhân sự này.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const trimmedPass = newPassword.trim();
      if (trimmedPass && trimmedPass !== confirmPassword.trim()) {
        message.error('Mật khẩu mới và mật khẩu xác nhận không trùng khớp!');
        setIsSaving(false);
        return;
      }

      // Check unit manager restriction
      let orgUnits: any[] = [];
      try {
        const cached = dataService.getGenericData('business_org_units');
        if (Array.isArray(cached) && cached.length > 0) {
          orgUnits = cached;
        }
      } catch {}
      if (!orgUnits.length) {
        orgUnits = (dataService.getOrgUnits() as any[]) || [];
      }

      const empName = (formData.name || '').toLowerCase().trim();
      const empCode = (formData.code || '').toLowerCase().trim();
      const empId = String(id || '').trim();

      const managedUnits = orgUnits.filter((unit: any) => {
        const mgr = String(unit.manager || '').toLowerCase().trim();
        if (!mgr || mgr === 'chưa phân công') return false;
        return (
          (empName && (mgr === empName || mgr.includes(empName) || empName.includes(mgr))) ||
          (empCode && (mgr === empCode || mgr.includes(empCode))) ||
          (empId && (mgr === empId || mgr.includes(empId)))
        );
      });

      if (managedUnits.length > 0) {
        const nextDeptRaw = formData.workUnit || formData.department || '';
        const nextDepts = Array.isArray(nextDeptRaw)
          ? nextDeptRaw.map(String).map((s: string) => s.toLowerCase().trim()).filter(Boolean)
          : typeof nextDeptRaw === 'string'
            ? nextDeptRaw.split(',').map((s: string) => s.toLowerCase().trim()).filter(Boolean)
            : [];

        for (const unit of managedUnits) {
          const uName = String(unit.name || '').toLowerCase().trim();
          const uCode = String(unit.code || '').toLowerCase().trim();
          const isPresent = nextDepts.some((d: string) => d === uName || d === uCode || d.includes(uName) || uName.includes(d));
          if (!isPresent) {
            message.error(`Nhân sự "${formData.name}" đang là Trưởng đơn vị của "${unit.name}". Vui lòng gỡ hoặc thay đổi Trưởng đơn vị tại mục Đơn vị tổ chức trước khi xóa đơn vị của nhân sự này!`);
            setIsSaving(false);
            return;
          }
        }
      }

      const payload: any = {
        code: formData.code,
        name: formData.name,
        email: formData.accountEmail || formData.loginEmail,
        phone: formData.mobilePhone,
        department: formData.workUnit,
        position: formData.position,
        joinDate: formData.officialDate,
        salaryBase: Number(formData.totalSalary || formData.baseSalary || 0),
        avatar: formData.avatarUrl,
        password: trimmedPass || undefined,
        details: { ...formData, bankAccounts: bankAccountList, familyMembers: familyList, familyList: familyList },
      };
      const response = isEmployeePortal
        ? await employeesApi.updateMyProfile(payload)
        : id ? await employeesApi.update(id, payload) : null;
      if (response?.data?.employee) setFormData((previous: any) => ({ ...previous, ...response.data.employee }));
      if (trimmedPass) {
        setNewPassword('');
        setConfirmPassword('');
      }
      message.success(`Đã lưu và đồng bộ hồ sơ, tài khoản và tài chính của "${formData.name}".`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể đồng bộ hồ sơ nhân sự.');
    } finally {
      setIsSaving(false);
    }
  };

  // Section & Sub-section visibility calculation for /employee/profile
  const hasBasicData = true;
  const hasContactData = Boolean(formData.mobilePhone || formData.accountEmail || formData.workPhone || formData.personalEmail || formData.hkttCity || formData.resCity);
  const hasWorkData = Boolean(formData.workUnit || formData.position || formData.directManager || formData.totalSalary || formData.insJoinDate);
  const hasFamilyData = Boolean(familyList && familyList.length > 0);

  const hasEducationData = Boolean(formData.educationLevel || formData.major || formData.trainingLevel || formData.trainingPlace || formData.graduationYear || formData.degreeRank || formData.faculty);
  const hasEmergencyData = Boolean(formData.emName || formData.emRelation || formData.emPhone || formData.emHomePhone || formData.emEmail || formData.emAddress);
  const hasSalaryData = Boolean(formData.salaryScale || formData.totalSalary || formData.salaryCoeff || formData.bankAccount || formData.bankName || formData.baseSalary || formData.insuranceSalary);
  const hasInsuranceData = Boolean(formData.insJoinDate || formData.bhxhRate || formData.bhytRate || formData.bhtnRate || formData.bhytNumber || formData.bhxhBookNumber || formData.kcbHospital || formData.bhxhCode || formData.unionMember);

  const hasPoliticsInfo = Boolean(formData.isYouthUnion || formData.isPartyMember || formData.youthUnionDate || formData.partyJoinDate || (formData.partyPosition && formData.partyPosition !== 'Không có'));
  const hasMilitaryInfo = Boolean(formData.isMilitary || formData.isWoundedSoldier || formData.hasPolicyBenefit || formData.militaryEnlistDate || formData.militaryBranch || formData.militaryRank);
  const hasHealthInfo = Boolean((formData.bloodType && formData.bloodType !== 'Không xác định') || formData.heightM || formData.weightKg || formData.healthStatus || formData.medicalNote);
  const hasPoliticsSection = Boolean(hasPoliticsInfo || hasMilitaryInfo || hasHealthInfo);

  const hasReadySizes = Boolean((formData.shirtLetter && formData.shirtLetter !== 'Không chọn') || (formData.skirtLetter && formData.skirtLetter !== 'Không chọn') || (formData.pantsNumber && formData.pantsNumber !== 'Không chọn') || (formData.ppeSize && formData.ppeSize !== 'Không chọn'));
  const hasTailorSizes = Boolean(formData.shoulderWidth || formData.sleeveLength || formData.shirtLength || formData.chestCircumference || formData.waistCircumference || formData.hipCircumference);
  const hasUniformSection = Boolean(hasReadySizes || hasTailorSizes);

  const hasAccountData = Boolean(formData.loginEmail);
  const hasFinanceData = Boolean(bankAccountList && bankAccountList.length > 0);
  const hasDigisigData = Boolean(digisigData && digisigData.status !== 'Thu hồi' && digisigData.certNumber);
  const displayJoinDate = formData.officialDate || formData.joinDate || 'Chưa cập nhật';
  const displayEmploymentStatus = formData.workStatus || formData.status || 'Chưa cập nhật';
  const displayWorkUnit = formData.workUnit || formData.department || 'Chưa cập nhật';
  const displayAccessStatus = formData.activationStatus || (formData.isActive === true ? 'Đang hoạt động' : formData.isActive === false ? 'Chưa kích hoạt' : 'Chưa cập nhật');
  const isAccessActive = displayAccessStatus === 'Đang hoạt động' || displayAccessStatus === 'Đã kích hoạt';
  const hasUserData = Boolean(formData.loginEmail || formData.accountEmail || targetEmpCode);
  const hasHistoryData = true;

  const allNavTabs = [
    { key: 'settings', label: 'Thiết lập', icon: <SettingOutlined />, visible: !isEmployeePortal },
    { key: 'basic', label: 'Thông tin cơ bản', icon: <UserOutlined />, visible: !isEmployeePortal || hasBasicData },
    { key: 'contact', label: 'Thông tin liên hệ', icon: <TeamOutlined />, visible: !isEmployeePortal || hasContactData },
    { key: 'work', label: 'Thông tin công việc', icon: <ShopOutlined />, visible: !isEmployeePortal || hasWorkData },
    { key: 'family', label: 'Thông tin gia đình', icon: <HeartOutlined />, visible: !isEmployeePortal || hasFamilyData },
    { key: 'politics', label: 'Chính trị, quân sự, y tế', icon: <SafetyCertificateOutlined />, visible: !isEmployeePortal || hasPoliticsSection },
    { key: 'uniform', label: 'Thông tin trang phục', icon: <SkinOutlined />, visible: !isEmployeePortal || hasUniformSection },
    { key: 'account', label: 'Thông tin tài khoản', icon: <KeyOutlined />, visible: !isEmployeePortal || hasAccountData },
    { key: 'finance', label: 'Thông tin tài chính', icon: <BankOutlined />, visible: !isEmployeePortal || hasFinanceData },
    { key: 'digisig', label: 'Thông tin chữ ký số', icon: <FormOutlined />, visible: !isEmployeePortal || hasDigisigData },
    { key: 'user', label: 'Người dùng', icon: <UserOutlined />, visible: !isEmployeePortal && hasUserData },
    { key: 'history', label: 'Lịch sử & Quá trình', icon: <HistoryOutlined />, visible: !isEmployeePortal || hasHistoryData },
  ];

  const navTabs = allNavTabs.filter(t => t.visible);

  // Auto-scroll on initial load or reload if URL has hash (e.g., #settings, #contact, #history)
  useEffect(() => {
    const rawHash = window.location.hash.replace('#', '');
    if (rawHash) {
      const match = navTabs.find((t) => t.key === rawHash);
      if (match) {
        setActiveTab(rawHash);
        const timer = setTimeout(() => {
          const el = document.getElementById(`section-${rawHash}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 200);
        return () => clearTimeout(timer);
      }
    } else if (navTabs.length > 0 && !isEmployeePortal) {
      // Default to #settings when opening admin edit
      setActiveTab(navTabs[0].key);
      window.history.replaceState(null, '', `#${navTabs[0].key}`);
    }
  }, []);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Optimized ScrollSpy to track active section smoothly without lag
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (isClickingTabRef.current) return;
      if (!ticking) {
        window.requestAnimationFrame(() => {
          let foundKey = navTabs[0]?.key || 'settings';
          for (let i = 0; i < navTabs.length; i++) {
            const el = document.getElementById(`section-${navTabs[i].key}`);
            if (el) {
              const rect = el.getBoundingClientRect();
              // Check if top of section is within viewport focus range
              if (rect.top <= 140 && rect.bottom > 90) {
                foundKey = navTabs[i].key;
                break;
              }
            }
          }
          if (activeTabRef.current !== foundKey) {
            activeTabRef.current = foundKey;
            setActiveTab(foundKey);
            if (window.location.hash !== `#${foundKey}`) {
              window.history.replaceState(null, '', `#${foundKey}`);
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    // Use capture: true so scroll events from .kiyovn-main-content or document are captured immediately!
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    
    const scrollContainer = document.querySelector('.kiyovn-main-content');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    }

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, [navTabs]);

  const handleTabClick = (tabKey: string) => {
    setActiveTab(tabKey);
    activeTabRef.current = tabKey;
    isClickingTabRef.current = true;
    window.history.replaceState(null, '', `#${tabKey}`);
    const el = document.getElementById(`section-${tabKey}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => {
      isClickingTabRef.current = false;
    }, 800);
  };

  if (isEmployeePortal && !wizardDone) {
    return <EmployeeProfileWizard storage={onboardingStorage} onDone={() => setWizardDone(true)} />;
  }

  return (
    <PortalContext.Provider value={{ isEmployeePortal, onCopy: handleCopy }}>
      <style>{`
        @media (max-width: 992px) {
          .employee-edit-sidebar {
            display: none !important;
          }

          .employee-full-edit-page,
          .employee-full-edit-main,
          .employee-full-edit-section,
          .employee-full-edit-profile-card,
          .employee-full-edit-settings-card {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            overflow-x: hidden !important;
          }

          .employee-full-edit-page {
            padding: 10px 12px 10px 12px !important;
            margin: 0 !important;
            gap: 10px !important;
          }

          .employee-full-edit-mobile-bar {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            left: 0 !important;
            right: 0 !important;
            box-sizing: border-box !important;
          }

          .kiyovn-main-content .employee-full-edit-page .employee-full-edit-main {
            gap: 10px !important;
            row-gap: 10px !important;
          }

          .employee-full-edit-profile-card {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            padding: 14px !important;
          }

          .employee-full-edit-avatar {
            align-self: center !important;
          }

          .employee-full-edit-profile-info,
          .employee-full-edit-profile-title,
          .employee-full-edit-info-grid,
          .employee-full-edit-info-card,
          .employee-full-edit-card-text {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          .employee-full-edit-info-grid > div {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
            overflow: hidden !important;
          }

          .employee-full-edit-info-grid > div > div:last-child {
            min-width: 0 !important;
            flex: 1 1 auto !important;
          }

          .employee-full-edit-info-grid > div > div:last-child > div {
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }

          .employee-full-edit-profile-title {
            justify-content: center !important;
            text-align: center !important;
          }

          .employee-full-edit-info-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .employee-full-edit-info-card {
            overflow: hidden !important;
          }

          .employee-full-edit-card-text,
          .employee-full-edit-card-text * {
            white-space: normal !important;
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }

          .employee-full-edit-settings-header,
          .employee-full-edit-settings-actions {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          .employee-full-edit-settings-actions {
            display: grid !important;
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 8px !important;
          }

          .employee-full-edit-settings-actions .ant-btn,
          .employee-full-edit-settings-actions button {
            width: 100% !important;
            min-width: 0 !important;
          }

          .employee-full-edit-main > div {
            width: 100% !important;
            max-width: 100% !important;
            min-width: 0 !important;
            box-sizing: border-box !important;
          }

          .employee-full-edit-section {
            margin-top: 0 !important;
            margin-bottom: 0 !important;
          }
        }
      `}</style>
      <div
        className="employee-full-edit-page"
        style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        width: '100%',
        minHeight: 'calc(100vh - 50px)',
        background: '#FDFDFD',
        padding: isMobile ? '10px 10px 60px 10px' : 16,
        boxSizing: 'border-box',
        gap: 16,
        alignItems: 'flex-start',
      }}
    >
      {/* Mobile Top Sticky Action Bar (Without navigation tabs list) */}
      {isMobile ? (
        !isEmployeePortal ? (
          <div
            className="employee-full-edit-mobile-bar"
            style={{
              width: '100%',
              background: '#FFFFFF',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              padding: '8px 12px',
              position: 'sticky',
              top: 0,
              zIndex: 50,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxSizing: 'border-box',
            }}
          >
            <div
              onClick={handleBack}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                color: '#212121',
              }}
            >
              <ArrowLeftOutlined style={{ color: '#757575', fontSize: 14 }} />
              <span>Quay lại</span>
            </div>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={isSaving}
              disabled={isSaving}
              size="small"
              style={{
                backgroundColor: '#009688',
                borderColor: '#009688',
                borderRadius: 6,
                fontWeight: 400,
                fontSize: 12.5,
              }}
            >
              Lưu thay đổi
            </Button>
          </div>
        ) : null
      ) : (
        /* Desktop Left Isolated Card Sidebar (Sticky Pinned, Fit snugly to content) */
        <div
          className="employee-edit-sidebar"
          style={{
            width: 'fit-content',
            minWidth: 'fit-content',
            maxWidth: 220,
            background: '#FFFFFF',
            border: '1px solid #E0E0E0',
            borderRadius: 8,
            padding: '10px 8px',
            flexShrink: 0,
            position: 'sticky',
            top: 16,
            alignSelf: 'flex-start',
            zIndex: 10,
            maxHeight: 'calc(100vh - 32px)',
          }}
        >
          {/* Back Button (Hidden on /employee/profile) */}
          {!isEmployeePortal && (
            <div
              onClick={handleBack}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                marginBottom: 2,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 400,
                color: '#212121',
                background: 'transparent',
                transition: 'all 0.12s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#009688';
                e.currentTarget.style.background = '#E0F2F1';
                const iconEl = e.currentTarget.querySelector('.back-icon') as HTMLElement;
                if (iconEl) iconEl.style.color = '#009688';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#212121';
                e.currentTarget.style.background = 'transparent';
                const iconEl = e.currentTarget.querySelector('.back-icon') as HTMLElement;
                if (iconEl) iconEl.style.color = '#757575';
              }}
            >
              <span
                className="back-icon"
                style={{
                  fontSize: 15,
                  color: '#757575',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.12s ease',
                }}
              >
                <ArrowLeftOutlined />
              </span>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Quay lại
              </span>
            </div>
          )}

          {/* Tab Navigation Items */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {navTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <div
                  key={tab.key}
                  onClick={() => handleTabClick(tab.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 400,
                    color: isActive ? '#009688' : '#212121',
                    background: isActive ? '#E0F2F1' : 'transparent',
                    transition: 'all 0.12s ease',
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      color: isActive ? '#009688' : '#757575',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    {tab.icon}
                  </span>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tab.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Save Button */}
          {!isEmployeePortal && (
            <div style={{ marginTop: 8 }}>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={isSaving}
                disabled={isSaving}
                style={{
                  width: '100%',
                  backgroundColor: '#009688',
                  borderColor: '#009688',
                  borderRadius: 6,
                  height: 34,
                  fontWeight: 400,
                }}
              >
                Lưu thay đổi
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Right Main Content Area (Continuous Vertical Scroll with all 9 Sections) */}
      <div className="employee-full-edit-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, width: '100%' }}>
        {/* Top Header Card */}
        <div
          className="employee-full-edit-profile-card"
          style={{
            background: 'linear-gradient(90deg, #F4EEFD 0%, #EEF4FD 50%, #E8F2FD 100%)',
            border: '1px solid #E4DCF5',
            borderRadius: 8,
            padding: 15,
            display: 'flex',
            gap: isMobile ? 12 : 18,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          {/* Direct File Picker Input for Avatar */}
          <input
            type="file"
            ref={avatarFileInputRef}
            accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.tiff,.tif,.avif,.heic,.heif,.ico"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleAvatarFile(file);
              }
              e.target.value = '';
            }}
          />

          {/* Avatar Box 3:4 (Ảnh thẻ 3x4) */}
          <div
            className="employee-full-edit-avatar"
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
            {!avatarImgError && (formData.avatarUrl || formData.avatar) ? (
              <img
                src={formData.avatarUrl || formData.avatar}
                alt={formData.name || ''}
                onError={() => setAvatarImgError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', border: 'none', boxShadow: 'none' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                <UserOutlined style={{ fontSize: 32 }} />
                <span style={{ fontSize: 10, marginTop: 2 }}>Tải ảnh</span>
              </div>
            )}

            {/* Hover overlay */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.45)',
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
          <div className="employee-full-edit-profile-info" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div className="employee-full-edit-profile-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0 }}>
              <div style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' }}>
                {formData.name}
              </div>
            </div>

            {/* 6 Info Cards */}
            <div className="employee-full-edit-info-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, width: '100%', minWidth: 0 }}>
              {/* 1. Mã nhân viên */}
              <div
                onClick={(e) => isEmployeePortal && handleCopy(e, formData.code)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E8EEF5',
                  borderRadius: 8,
                  padding: '5px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: isEmployeePortal ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                }}
                title={isEmployeePortal ? 'Nhấp để copy' : undefined}
                onMouseEnter={(e) => {
                  if (isEmployeePortal) e.currentTarget.style.borderColor = '#009688';
                }}
                onMouseLeave={(e) => {
                  if (isEmployeePortal) e.currentTarget.style.borderColor = '#E8EEF5';
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: '#DBEAFE', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }}>
                  #
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#64748B' }}>Mã nhân viên</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{formData.code}</div>
                </div>
              </div>

              {/* 2. Chức vụ */}
              {(!isEmployeePortal || Boolean(formData.position && formData.position !== '--')) && (
                <div
                  onClick={(e) => isEmployeePortal && handleCopy(e, formData.position || '')}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E8EEF5',
                    borderRadius: 8,
                    padding: '5px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: isEmployeePortal ? 'pointer' : 'default',
                    transition: 'all 0.15s ease',
                  }}
                  title={isEmployeePortal ? 'Nhấp để copy' : undefined}
                  onMouseEnter={(e) => {
                    if (isEmployeePortal) e.currentTarget.style.borderColor = '#009688';
                  }}
                  onMouseLeave={(e) => {
                    if (isEmployeePortal) e.currentTarget.style.borderColor = '#E8EEF5';
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: '#EDE9FE', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                    <UserOutlined />
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: '#64748B' }}>Chức vụ</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{formData.position || '--'}</div>
                  </div>
                </div>
              )}

              {/* 3. Vào làm */}
              <div
                onClick={(e) => isEmployeePortal && handleCopy(e, displayJoinDate)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E8EEF5',
                  borderRadius: 8,
                  padding: '5px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: isEmployeePortal ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                }}
                title={isEmployeePortal ? 'Nhấp để copy' : undefined}
                onMouseEnter={(e) => {
                  if (isEmployeePortal) e.currentTarget.style.borderColor = '#009688';
                }}
                onMouseLeave={(e) => {
                  if (isEmployeePortal) e.currentTarget.style.borderColor = '#E8EEF5';
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                  <CalendarOutlined />
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#64748B' }}>Vào làm</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{displayJoinDate}</div>
                </div>
              </div>

              {/* 4. Trạng thái */}
              <div
                onClick={(e) => isEmployeePortal && handleCopy(e, displayEmploymentStatus)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E8EEF5',
                  borderRadius: 8,
                  padding: '5px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: isEmployeePortal ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                }}
                title={isEmployeePortal ? 'Nhấp để copy' : undefined}
                onMouseEnter={(e) => {
                  if (isEmployeePortal) e.currentTarget.style.borderColor = '#009688';
                }}
                onMouseLeave={(e) => {
                  if (isEmployeePortal) e.currentTarget.style.borderColor = '#E8EEF5';
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: !isAccessActive ? '#FEF3C7' : '#DCFCE7', color: !isAccessActive ? '#D97706' : '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                  <CheckCircleOutlined />
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#64748B' }}>Trạng thái</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{displayEmploymentStatus}</div>
                  {!isAccessActive && (
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#D97706', display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#D97706', display: 'inline-block' }} />
                      Chưa kích hoạt
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Đơn vị */}
              <div
                onClick={(e) => isEmployeePortal && handleCopy(e, displayWorkUnit)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E8EEF5',
                  borderRadius: 8,
                  padding: '5px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: isEmployeePortal ? 'pointer' : 'default',
                  transition: 'all 0.15s ease',
                }}
                title={isEmployeePortal ? 'Nhấp để copy' : undefined}
                onMouseEnter={(e) => {
                  if (isEmployeePortal) e.currentTarget.style.borderColor = '#009688';
                }}
                onMouseLeave={(e) => {
                  if (isEmployeePortal) e.currentTarget.style.borderColor = '#E8EEF5';
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 6, background: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                  <ShopOutlined />
                </div>
                <div>
                  <div style={{ fontSize: 10.5, color: '#64748B' }}>Đơn vị</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{displayWorkUnit}</div>
                </div>
              </div>

              {/* 6. Quản lý */}
              {(!isEmployeePortal || Boolean(formData.directManager && formData.directManager !== 'Chưa phân công')) && (
                <div
                  onClick={(e) => isEmployeePortal && handleCopy(e, formData.directManager || '')}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E8EEF5',
                    borderRadius: 8,
                    padding: '5px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: isEmployeePortal ? 'pointer' : 'default',
                    transition: 'all 0.15s ease',
                  }}
                  title={isEmployeePortal ? 'Nhấp để copy' : undefined}
                  onMouseEnter={(e) => {
                    if (isEmployeePortal) e.currentTarget.style.borderColor = '#009688';
                  }}
                  onMouseLeave={(e) => {
                    if (isEmployeePortal) e.currentTarget.style.borderColor = '#E8EEF5';
                  }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: '#FCE7F3', color: '#DB2777', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                    <UserOutlined />
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: '#64748B' }}>Quản lý</div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B' }}>{formData.directManager || 'Chưa phân công'}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 0: THIẾT LẬP (Chỉ hiển thị ở Quản trị) */}
        {!isEmployeePortal && (
          <div
          id="section-settings"
            className="employee-full-edit-section employee-full-edit-settings-card"
            style={{
              scrollMarginTop: 16,
              background: '#FFFFFF',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              padding: 15,
            }}
          >
            <div className="employee-full-edit-settings-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
                  <SettingOutlined />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#212121' }}>Thiết lập</h2>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    Cấu hình dung lượng, trạng thái tài khoản, yêu cầu bổ sung hồ sơ và đặt lại thiết lập
                  </div>
                </div>
              </div>

              {/* Status Chips */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <Tag color={isAccessActive ? 'success' : 'error'} style={{ margin: 0, padding: '2px 8px', fontSize: 12 }}>
                  {isAccessActive ? 'Tài khoản: Đang hoạt động' : 'Tài khoản: Đã khóa / Chưa kích hoạt'}
                </Tag>
                <Tag color="cyan" style={{ margin: 0, padding: '2px 8px', fontSize: 12 }}>
                  Hạn mức: {storageQuotaGB} GB
                </Tag>
              </div>
            </div>

            <div className="employee-full-edit-settings-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button
                icon={<ReloadOutlined />}
                danger
                onClick={() => {
                  selectAllSections('reset');
                  setIsResetSetupModalOpen(true);
                }}
                style={{ borderRadius: 6, fontSize: 13, height: 36, fontWeight: 500 }}
              >
                Đặt lại thiết lập
              </Button>

              <Button
                type="primary"
                icon={<FormOutlined />}
                onClick={() => {
                  setUpdateFieldMap({});
                  setIsUpdateRequestModalOpen(true);
                }}
                style={{
                  backgroundColor: '#009688',
                  borderColor: '#009688',
                  borderRadius: 6,
                  fontSize: 13,
                  height: 36,
                  fontWeight: 500,
                }}
              >
                Yêu cầu cập nhật hồ sơ
              </Button>

              <Button
                type="primary"
                icon={<HddOutlined />}
                onClick={() => setIsStorageModalOpen(true)}
                style={{
                  backgroundColor: '#0284C7',
                  borderColor: '#0284C7',
                  borderRadius: 6,
                  fontSize: 13,
                  height: 36,
                  fontWeight: 500,
                }}
              >
                Dung lượng ({storageQuotaGB} GB)
              </Button>

              <Button
                icon={isAccessActive ? <LockOutlined /> : <CheckCircleOutlined />}
                onClick={() => {
                  const newStatus = !isAccessActive;
                  setFormData((prev: any) => ({
                    ...prev,
                    isActive: newStatus,
                    activationStatus: newStatus ? 'Đang hoạt động' : 'Chưa kích hoạt',
                  }));
                  dataService.logAction(
                    newStatus ? 'Mở khóa tài khoản' : 'Khóa tài khoản',
                    'Thiết lập',
                    `Thay đổi trạng thái truy cập của nhân viên "${formData.name}" thành: ${newStatus ? 'Đang hoạt động' : 'Tạm khóa'}`
                  );
                  message.success(`Đã chuyển trạng thái tài khoản thành "${newStatus ? 'Đang hoạt động' : 'Tạm khóa'}". Bấm "Lưu thay đổi" để đồng bộ.`);
                }}
                style={{ borderRadius: 6, fontSize: 13, height: 36, fontWeight: 500 }}
              >
                {isAccessActive ? 'Khóa tài khoản' : 'Kích hoạt tài khoản'}
              </Button>
            </div>
          </div>
        )}

        {/* SECTION 1: THÔNG TIN CƠ BẢN */}
        <div
          id="section-basic"
          className="employee-full-edit-section"
          style={{
            scrollMarginTop: 16,
            background: '#FFFFFF',
            border: '1px solid #E0E0E0',
            borderRadius: 8,
            padding: 15,
          }}
        >
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
              <UserOutlined />
            </div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#212121' }}>Thông tin cơ bản</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Thông tin chung */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                Thông tin chung
              </div>
              <div className="k-form-grid-3">
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Mã nhân viên</label>
                  <Input
                    value={formData.code || formData.employeeCode || targetEmpCode || user?.employeeCode || user?.code || ''}
                    readOnly
                    disabled
                    style={{ backgroundColor: '#F8FAFC', color: '#0F172A', fontWeight: 'normal', cursor: 'not-allowed' }}
                    title="Mã nhân viên do hệ thống quản lý và không thể chỉnh sửa."
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nguyên quán</label>
                  <Select
                    value={formData.originPlace}
                    onChange={val => handleChange('originPlace', val)}
                    options={provinceOptions}
                    showSearch
                    allowClear
                    placeholder="Chọn Tỉnh / Thành phố..."
                  />
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
                  <Select
                    value={formData.familyBackground}
                    onChange={val => handleChange('familyBackground', val)}
                    options={FAMILY_BG_OPTIONS}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tên gọi khác</label>
                  <Input value={formData.otherName} onChange={e => handleChange('otherName', e.target.value)} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Bản thân</label>
                  <Select
                    value={formData.selfBackground}
                    onChange={val => handleChange('selfBackground', val)}
                    options={SELF_BG_OPTIONS}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Giới tính</label>
                  <Select
                    value={formData.gender}
                    onChange={val => handleChange('gender', val)}
                    options={GENDER_OPTIONS}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Xu hướng tính dục</label>
                  <Select
                    value={formData.sexualOrientation}
                    onChange={val => handleChange('sexualOrientation', val)}
                    options={SEXUAL_ORIENTATION_OPTIONS}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Dân tộc</label>
                  <Select
                    value={formData.ethnicity}
                    onChange={val => handleChange('ethnicity', val)}
                    options={ETHNICITY_OPTIONS}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày sinh</label>
                  <Input type="date" value={formData.birthDate} onChange={e => handleChange('birthDate', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tôn giáo</label>
                  <Select
                    value={formData.religion}
                    onChange={val => handleChange('religion', val)}
                    options={RELIGION_OPTIONS}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nơi sinh</label>
                  <Select
                    value={formData.birthPlace}
                    onChange={val => handleChange('birthPlace', val)}
                    options={provinceOptions}
                    showSearch
                    allowClear
                    placeholder="Chọn Tỉnh / Thành phố..."
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quốc tịch</label>
                  <Select
                    value={formData.nationality}
                    onChange={val => handleChange('nationality', val)}
                    options={NATIONALITY_OPTIONS}
                  />
                </div>
              </div>
            </div>

            {/* Chứng minh nhân dân / Thẻ căn cước / Hộ chiếu */}
            <div style={{ paddingTop: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                Chứng minh nhân dân / Thẻ căn cước / Hộ chiếu
              </div>
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
                  <Input
                    value={formData.passportIssuePlace || ''}
                    onChange={e => handleChange('passportIssuePlace', e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nơi cấp giấy tờ</label>
                  <Input
                    value={formData.docIssuePlace || ''}
                    onChange={e => handleChange('docIssuePlace', e.target.value)}
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
            </div>

            {/* Trình độ / Bằng cấp */}
            {(!isEmployeePortal || hasEducationData) && (
              <div style={{ paddingTop: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                  Trình độ / Bằng cấp
                </div>
                <div className="k-form-grid-3">
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Trình độ văn hóa</label>
                    <Select
                      value={formData.educationLevel}
                      onChange={val => handleChange('educationLevel', val)}
                      options={EDUCATION_LEVEL_OPTIONS}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chuyên ngành</label>
                    <Input
                      value={formData.major}
                      onChange={e => handleChange('major', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Trình độ đào tạo</label>
                    <Select
                      value={formData.trainingLevel}
                      onChange={val => handleChange('trainingLevel', val)}
                      options={TRAINING_LEVEL_OPTIONS}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Năm tốt nghiệp</label>
                    <Input value={formData.graduationYear} onChange={e => handleChange('graduationYear', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nơi đào tạo</label>
                    <Input
                      value={formData.trainingPlace}
                      onChange={e => handleChange('trainingPlace', e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Xếp loại</label>
                    <Select
                      value={formData.degreeRank}
                      onChange={val => handleChange('degreeRank', val)}
                      options={DEGREE_RANK_OPTIONS}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Khoa</label>
                    <Input
                      value={formData.faculty}
                      onChange={e => handleChange('faculty', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: THÔNG TIN LIÊN HỆ */}
        <div
          id="section-contact"
          className="employee-full-edit-section"
          style={{
            scrollMarginTop: 16,
            background: '#FFFFFF',
            border: '1px solid #E0E0E0',
            borderRadius: 8,
            padding: 15,
          }}
        >
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
              <TeamOutlined />
            </div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#212121' }}>Thông tin liên hệ</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Số điện thoại / Email / Khác */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                Số điện thoại / Email / Khác
              </div>
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
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Email cá nhân</label>
                  <Input value={formData.personalEmail} onChange={e => handleChange('personalEmail', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Hộ khẩu thường trú */}
            <div style={{ paddingTop: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                Hộ khẩu thường trú
              </div>
              <div className="k-form-grid-3">
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quốc gia</label>
                  <Select
                    value={formData.hkttCountry}
                    onChange={val => handleChange('hkttCountry', val)}
                    options={NATIONALITY_OPTIONS}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số sổ hộ khẩu</label>
                  <Input value={formData.hkttBookNumber} onChange={e => handleChange('hkttBookNumber', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tỉnh/Thành phố</label>
                  <Select
                    value={formData.hkttCity}
                    onChange={val => {
                      handleChange('hkttCity', val);
                      handleChange('hkttWard', '');
                    }}
                    options={provinceOptions}
                    showSearch
                    allowClear
                    placeholder="Chọn Tỉnh / Thành phố..."
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Mã số hộ gia đình</label>
                  <Input value={formData.hkttFamilyCode} onChange={e => handleChange('hkttFamilyCode', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quận/Huyện</label>
                  <Input value={formData.hkttDistrict} placeholder="Nhập Quận/Huyện..." onChange={e => handleChange('hkttDistrict', e.target.value)} />
                </div>
                <div style={{ marginTop: isEmployeePortal ? 0 : 20, display: isEmployeePortal ? 'block' : 'flex', alignItems: 'center' }}>
                  <Checkbox checked={formData.hkttIsHead} onChange={e => handleChange('hkttIsHead', e.target.checked)}>
                    Là chủ hộ
                  </Checkbox>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Phường/Xã</label>
                  {hkttWardOptions.length > 0 ? (
                    <Select
                      value={formData.hkttWard}
                      onChange={val => handleChange('hkttWard', val)}
                      options={hkttWardOptions}
                      showSearch
                      allowClear
                      placeholder="Chọn Phường/Xã..."
                    />
                  ) : (
                    <Input value={formData.hkttWard} placeholder="Nhập Phường/Xã..." onChange={e => handleChange('hkttWard', e.target.value)} />
                  )}
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
            </div>

            {/* Chỗ ở hiện nay */}
            <div style={{ paddingTop: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B' }}>
                  Chỗ ở hiện nay
                </div>
                {!isEmployeePortal && (
                  <Checkbox checked={formData.resSameAsHKTT} onChange={e => handleChange('resSameAsHKTT', e.target.checked)}>
                    Giống hộ khẩu thường trú
                  </Checkbox>
                )}
              </div>
              <div className="k-form-grid-3">
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quốc gia</label>
                  <Select
                    value={formData.resCountry}
                    onChange={val => handleChange('resCountry', val)}
                    options={NATIONALITY_OPTIONS}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tỉnh/Thành phố</label>
                  <Select
                    value={formData.resCity}
                    onChange={val => {
                      handleChange('resCity', val);
                      handleChange('resWard', '');
                    }}
                    options={provinceOptions}
                    showSearch
                    allowClear
                    placeholder="Chọn Tỉnh / Thành phố..."
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quận/Huyện</label>
                  <Input value={formData.resDistrict} placeholder="Nhập Quận/Huyện..." onChange={e => handleChange('resDistrict', e.target.value)} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Phường/Xã</label>
                  {resWardOptions.length > 0 ? (
                    <Select
                      value={formData.resWard}
                      onChange={val => handleChange('resWard', val)}
                      options={resWardOptions}
                      showSearch
                      allowClear
                      placeholder="Chọn Phường/Xã..."
                    />
                  ) : (
                    <Input value={formData.resWard} placeholder="Nhập Phường/Xã..." onChange={e => handleChange('resWard', e.target.value)} />
                  )}
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

            {/* Liên hệ khẩn cấp */}
            {(!isEmployeePortal || hasEmergencyData) && (
              <div style={{ paddingTop: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                  Liên hệ khẩn cấp
                </div>
                <div className="k-form-grid-3">
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Họ và tên</label>
                    <Input value={formData.emName} onChange={e => handleChange('emName', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quan hệ</label>
                    <Select
                      value={formData.emRelation}
                      onChange={val => handleChange('emRelation', val)}
                      options={EMERGENCY_RELATION_OPTIONS}
                    />
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
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: THÔNG TIN CÔNG VIỆC */}
        <div
          id="section-work"
          className="employee-full-edit-section"
          style={{
            scrollMarginTop: 16,
            background: '#FFFFFF',
            border: '1px solid #E0E0E0',
            borderRadius: 8,
            padding: 15,
          }}
        >
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
              <ShopOutlined />
            </div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#212121' }}>Thông tin công việc</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Thông tin nhân viên */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                Thông tin nhân viên
              </div>
              <div className="k-form-grid-3">
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Đơn vị công tác</label>
                  <Select
                    value={formData.workUnit}
                    onChange={val => handleChange('workUnit', val)}
                    options={finalWorkUnitOptions}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Loại hợp đồng</label>
                  <Select
                    value={formData.contractType}
                    onChange={val => handleChange('contractType', val)}
                    options={CONTRACT_TYPE_OPTIONS}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chức vụ</label>
                  <Select
                    value={formData.position}
                    onChange={val => handleChange('position', val)}
                    options={positionOptions}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Mã chấm công</label>
                  <Input value={formData.timekeepingCode} readOnly title="Mã chấm công do hệ thống quản lý và không thể chỉnh sửa." />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chức danh</label>
                  <Select
                    value={formData.jobTitle}
                    onChange={val => handleChange('jobTitle', val)}
                    options={positionOptions}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày học việc</label>
                  <Input type="date" value={formData.internshipDate} onChange={e => handleChange('internshipDate', e.target.value)} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Cấp</label>
                  <Select
                    value={formData.gradeLevel}
                    onChange={val => handleChange('gradeLevel', val)}
                    options={GRADE_LEVEL_OPTIONS}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày thử việc</label>
                  <Input type="date" value={formData.probationDate} onChange={e => handleChange('probationDate', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Bậc</label>
                  <Select
                    value={formData.rankStep}
                    onChange={val => handleChange('rankStep', val)}
                    options={RANK_STEP_OPTIONS}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày chính thức</label>
                  <Input type="date" value={formData.officialDate} onChange={e => handleChange('officialDate', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Trạng thái lao động</label>
                  <Select
                    value={formData.workStatus}
                    onChange={val => handleChange('workStatus', val)}
                    options={workStatusOptions}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Thâm niên</label>
                  <Input value={formData.seniority} onChange={e => handleChange('seniority', e.target.value)} />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tính chất lao động</label>
                  <Select
                    value={formData.laborNature}
                    onChange={val => handleChange('laborNature', val)}
                    options={LABOR_NATURE_OPTIONS}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày nghỉ hưu dự kiến</label>
                  <Input type="date" value={formData.retirementDate} onChange={e => handleChange('retirementDate', e.target.value)} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quản lý trực tiếp</label>
                  <Select
                    showSearch
                    allowClear
                    placeholder="Chọn người quản lý trực tiếp"
                    value={formData.directManager}
                    onChange={val => handleChange('directManager', val)}
                    onDropdownVisibleChange={(open) => { if (open) void loadManagerOptions(); }}
                    loading={isLoadingManagers}
                    options={
                      managerOptions.length > 0
                        ? managerOptions
                        : formData.directManager
                          ? [{ label: formData.directManager, value: formData.directManager }]
                          : []
                    }
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Địa điểm làm việc</label>
                  <Select
                    value={formData.workLocation}
                    onChange={val => handleChange('workLocation', val)}
                    options={workLocationOptions}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quản lý gián tiếp</label>
                  <Select
                    showSearch
                    allowClear
                    placeholder="Chọn người quản lý gián tiếp"
                    value={formData.indirectManager}
                    onChange={val => handleChange('indirectManager', val)}
                    onDropdownVisibleChange={(open) => { if (open) void loadManagerOptions(); }}
                    loading={isLoadingManagers}
                    options={
                      managerOptions.length > 0
                        ? managerOptions
                        : formData.indirectManager
                          ? [{ label: formData.indirectManager, value: formData.indirectManager }]
                          : []
                    }
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số sổ quản lý lao động</label>
                  <Input value={formData.laborBookNumber} onChange={e => handleChange('laborBookNumber', e.target.value)} />
                </div>
              </div>
            </div>

            {/* Thông tin lương & phúc lợi */}
            {(!isEmployeePortal || hasSalaryData) && (
              <div style={{ paddingTop: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                  Thông tin lương &amp; phúc lợi
                </div>
                <div className="k-form-grid-3">
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Bậc lương</label>
                    <Select
                      value={formData.salaryScale}
                      onChange={val => handleChange('salaryScale', val)}
                      options={SALARY_SCALE_OPTIONS}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tổng lương</label>
                    <Input value={formData.totalSalary?.toLocaleString()} onChange={e => handleChange('totalSalary', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Hệ số lương</label>
                    <Input value={formData.salaryCoeff} onChange={e => handleChange('salaryCoeff', e.target.value)} />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Lương cơ bản</label>
                    <Input value={formData.baseSalary?.toLocaleString()} onChange={e => handleChange('baseSalary', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngân hàng</label>
                    <Select
                      value={formData.bankName}
                      onChange={val => handleChange('bankName', val)}
                      options={bankOptions}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số tài khoản ngân hàng</label>
                    <Input value={formData.bankAccount} onChange={e => handleChange('bankAccount', e.target.value)} />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Lương đóng bảo hiểm</label>
                    <Input value={formData.insuranceSalary?.toLocaleString()} onChange={e => handleChange('insuranceSalary', e.target.value)} />
                  </div>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Các khoản phụ cấp</label>
                    <Input value={formData.allowances} onChange={e => handleChange('allowances', e.target.value)} />
                  </div>
                </div>
              </div>
            )}

            {/* Thông tin bảo hiểm - công đoàn */}
            {(!isEmployeePortal || hasInsuranceData) && (
              <div style={{ paddingTop: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                  Thông tin bảo hiểm - công đoàn
                </div>
                <div className="k-form-grid-3">
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày tham gia bảo hiểm</label>
                    <Input type="date" value={formData.insJoinDate} onChange={e => handleChange('insJoinDate', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tỷ lệ đóng bảo hiểm xã hội</label>
                    <Input value={formData.bhxhRate} onChange={e => handleChange('bhxhRate', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tỷ lệ đóng bảo hiểm y tế</label>
                    <Input value={formData.bhytRate} onChange={e => handleChange('bhytRate', e.target.value)} />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tỷ lệ đóng bảo hiểm thất nghiệp</label>
                    <Input value={formData.bhtnRate} onChange={e => handleChange('bhtnRate', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số thẻ bảo hiểm y tế</label>
                    <Input value={formData.bhytNumber} onChange={e => handleChange('bhytNumber', e.target.value)} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số sổ bảo hiểm xã hội</label>
                    <Input value={formData.bhxhBookNumber} onChange={e => handleChange('bhxhBookNumber', e.target.value)} />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nơi đăng ký khám chữa bệnh</label>
                    <Select
                      value={formData.kcbHospital}
                      onChange={val => handleChange('kcbHospital', val)}
                      options={HOSPITAL_OPTIONS}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Mã số bảo hiểm xã hội</label>
                    <Input value={formData.bhxhCode} onChange={e => handleChange('bhxhCode', e.target.value)} />
                  </div>
                  <div style={{ marginTop: isEmployeePortal ? 0 : 20, display: isEmployeePortal ? 'block' : 'flex', alignItems: 'center' }}>
                    <Checkbox checked={formData.unionMember} onChange={e => handleChange('unionMember', e.target.checked)}>
                      Tham gia công đoàn
                    </Checkbox>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 4: THÔNG TIN GIA ĐÌNH */}
        {(!isEmployeePortal || hasFamilyData) && (
          <div
            id="section-family"
            className="employee-full-edit-section"
            style={{
              scrollMarginTop: 16,
              background: '#FFFFFF',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              padding: 15,
            }}
          >
            {/* Header Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
                  <HeartOutlined />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#212121' }}>Thông tin gia đình</h2>
                  <div style={{ fontSize: 12, color: '#757575', marginTop: 2 }}>
                    Danh sách thân nhân &amp; người phụ thuộc giảm trừ gia cảnh
                  </div>
                </div>
              </div>

              {!isEmployeePortal && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={handleOpenAddFamily}
                  style={{
                    backgroundColor: '#009688',
                    borderColor: '#009688',
                    borderRadius: 6,
                    fontWeight: 400,
                    fontSize: 13,
                    height: 32,
                  }}
                >
                  Thêm thân nhân / người phụ thuộc
                </Button>
              )}
            </div>

            {/* Table / List View */}
            {familyList.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: '#757575' }}>
                <HeartOutlined style={{ fontSize: 26, color: '#BDBDBD', marginBottom: 8 }} />
                <div style={{ fontSize: 13.5 }}>Chưa có dữ liệu thành viên gia đình</div>
                {!isEmployeePortal && (
                  <Button size="small" icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={handleOpenAddFamily}>
                    Thêm thân nhân / người phụ thuộc
                  </Button>
                )}
              </div>
            ) : (
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
                      <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', textAlign: 'center', width: isEmployeePortal ? 70 : 100, whiteSpace: 'nowrap' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {familyList.map((member, index) => (
                      <tr key={member.id} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.1s' }}>
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
                        <td style={{ padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{member.job || '--'}</td>
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
                              onClick={() => handleOpenViewFamily(member)}
                              title="Xem chi tiết"
                              style={{
                                background: 'transparent',
                                border: '1px solid #E2E8F0',
                                borderRadius: 4,
                                padding: '4px 7px',
                                cursor: 'pointer',
                                color: '#009688',
                                display: 'flex',
                                alignItems: 'center',
                              }}
                            >
                              <EyeOutlined style={{ fontSize: 13 }} />
                            </button>
                            {!isEmployeePortal && (
                              <>
                                <button
                                  onClick={() => handleOpenEditFamily(member)}
                                  title="Chỉnh sửa"
                                  style={{
                                    background: 'transparent',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: 4,
                                    padding: '4px 7px',
                                    cursor: 'pointer',
                                    color: '#009688',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  <EditOutlined style={{ fontSize: 13 }} />
                                </button>
                                <button
                                  onClick={() => handleDeleteFamily(member.id, member.name)}
                                  title="Xóa"
                                  style={{
                                    background: 'transparent',
                                    border: '1px solid #FEE2E2',
                                    borderRadius: 4,
                                    padding: '4px 7px',
                                    cursor: 'pointer',
                                    color: '#EF4444',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  <DeleteOutlined style={{ fontSize: 13 }} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SECTION 5: CHÍNH TRỊ, QUÂN SỰ, Y TẾ */}
        {(!isEmployeePortal || hasPoliticsSection) && (
          <div
            id="section-politics"
            className="employee-full-edit-section"
            style={{
              scrollMarginTop: 16,
              background: '#FFFFFF',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              padding: 15,
            }}
          >
            {/* Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
                <SafetyCertificateOutlined />
              </div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#212121' }}>Chính trị, quân sự, y tế</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Thông tin chính trị */}
              {(!isEmployeePortal || hasPoliticsInfo) && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                    Thông tin chính trị
                  </div>
                  {isEmployeePortal ? (
                    <div className="k-form-grid-3">
                      <Checkbox checked={formData.isYouthUnion} onChange={e => handleChange('isYouthUnion', e.target.checked)}>Là Đoàn viên</Checkbox>
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày vào Đoàn</label>
                        <Input type="date" value={formData.youthUnionDate} onChange={e => handleChange('youthUnionDate', e.target.value)} />
                      </div>
                      <Checkbox checked={formData.isPartyMember} onChange={e => handleChange('isPartyMember', e.target.checked)}>Là Đảng viên</Checkbox>

                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày vào Đảng</label>
                        <Input type="date" value={formData.partyJoinDate} onChange={e => handleChange('partyJoinDate', e.target.value)} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chức vụ Đảng</label>
                        <Select
                          value={formData.partyPosition}
                          onChange={val => handleChange('partyPosition', val)}
                          options={PARTY_POSITION_OPTIONS}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
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
                          <Select
                            value={formData.partyPosition}
                            onChange={val => handleChange('partyPosition', val)}
                            options={PARTY_POSITION_OPTIONS}
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Thông tin quân sự */}
              {(!isEmployeePortal || hasMilitaryInfo) && (
                <div style={{ paddingTop: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                    Thông tin quân sự
                  </div>
                  {isEmployeePortal ? (
                    <div className="k-form-grid-3">
                      <Checkbox checked={formData.isMilitary} onChange={e => handleChange('isMilitary', e.target.checked)}>Là quân nhân</Checkbox>
                      <Checkbox checked={formData.isWoundedSoldier} onChange={e => handleChange('isWoundedSoldier', e.target.checked)}>Là thương binh, bệnh binh</Checkbox>
                      <Checkbox checked={formData.hasPolicyBenefit} onChange={e => handleChange('hasPolicyBenefit', e.target.checked)}>Hưởng chế độ</Checkbox>

                      {formData.isMilitary && (
                        <>
                          <div>
                            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày nhập ngũ</label>
                            <Input type="date" value={formData.militaryEnlistDate} onChange={e => handleChange('militaryEnlistDate', e.target.value)} />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Binh chủng</label>
                            <Select
                              value={formData.militaryBranch}
                              onChange={val => handleChange('militaryBranch', val)}
                              options={MILITARY_BRANCH_OPTIONS}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Cấp bậc quân sự</label>
                            <Select
                              value={formData.militaryRank}
                              onChange={val => handleChange('militaryRank', val)}
                              options={MILITARY_RANK_OPTIONS}
                            />
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <>
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
                            <Select
                              value={formData.militaryBranch}
                              onChange={val => handleChange('militaryBranch', val)}
                              options={MILITARY_BRANCH_OPTIONS}
                            />
                          </div>
                          <div>
                            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Cấp bậc quân sự</label>
                            <Select
                              value={formData.militaryRank}
                              onChange={val => handleChange('militaryRank', val)}
                              options={MILITARY_RANK_OPTIONS}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Thông tin y tế & sức khỏe */}
              {(!isEmployeePortal || hasHealthInfo) && (
                <div style={{ paddingTop: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                    Thông tin y tế &amp; sức khỏe
                  </div>
                  <div className="k-form-grid-3">
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nhóm máu</label>
                      <Select
                        value={formData.bloodType}
                        onChange={val => handleChange('bloodType', val)}
                        options={BLOOD_TYPE_OPTIONS}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chiều cao</label>
                      <Input value={formData.heightM} onChange={e => handleChange('heightM', e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Cân nặng</label>
                      <Input value={formData.weightKg} onChange={e => handleChange('weightKg', e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Tình trạng sức khỏe</label>
                      <Select
                        value={formData.healthStatus}
                        onChange={val => handleChange('healthStatus', val)}
                        options={HEALTH_STATUS_OPTIONS}
                      />
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Lưu ý y tế</label>
                      <Input value={formData.medicalNote} onChange={e => handleChange('medicalNote', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 6: THÔNG TIN TRANG PHỤC */}
        {(!isEmployeePortal || hasUniformSection) && (
          <div
            id="section-uniform"
            className="employee-full-edit-section"
            style={{
              scrollMarginTop: 16,
              background: '#FFFFFF',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              padding: 15,
            }}
          >
            {/* Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
                <SkinOutlined />
              </div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#212121' }}>Thông tin trang phục</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Kích cỡ may sẵn */}
              {(!isEmployeePortal || hasReadySizes) && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                    Kích cỡ may sẵn
                  </div>
                  <div className="k-form-grid-4">
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Áo</label>
                      <Select
                        value={formData.shirtLetter}
                        onChange={val => handleChange('shirtLetter', val)}
                        options={SHIRT_SIZE_OPTIONS}
                      />
                    </div>
                    {formData.gender === 'Nữ' && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Zuýp</label>
                        <Select
                          value={formData.skirtLetter}
                          onChange={val => handleChange('skirtLetter', val)}
                          options={SKIRT_SIZE_OPTIONS}
                        />
                      </div>
                    )}
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Quần</label>
                      <Select
                        value={formData.pantsLetter}
                        onChange={val => handleChange('pantsLetter', val)}
                        options={PANTS_SIZE_OPTIONS}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Đồ bảo hộ</label>
                      <Select
                        value={formData.ppeLetter}
                        onChange={val => handleChange('ppeLetter', val)}
                        options={PPE_SIZE_OPTIONS}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Kích thước may đo */}
              {(!isEmployeePortal || hasTailorSizes) && (
                <div style={{ paddingTop: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                    Kích thước may đo
                  </div>
                  <div className="k-form-grid-3">
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Rộng vai</label>
                      <Input value={formData.shoulderWidth} onChange={e => handleChange('shoulderWidth', e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Dài tay</label>
                      <Input value={formData.sleeveLength} onChange={e => handleChange('sleeveLength', e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Dài áo</label>
                      <Input value={formData.shirtLength} onChange={e => handleChange('shirtLength', e.target.value)} />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Vòng ngực</label>
                      <Input value={formData.chestCircumference} onChange={e => handleChange('chestCircumference', e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Vòng eo</label>
                      <Input value={formData.waistCircumference} onChange={e => handleChange('waistCircumference', e.target.value)} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Vòng mông</label>
                      <Input value={formData.hipCircumference} onChange={e => handleChange('hipCircumference', e.target.value)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION 7: THÔNG TIN TÀI KHOẢN */}
        {(!isEmployeePortal || hasAccountData) && (
          <div
            id="section-account"
            className="employee-full-edit-section"
            style={{
              scrollMarginTop: 16,
              background: '#FFFFFF',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              padding: 15,
            }}
          >
            {/* Title */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
                <KeyOutlined />
              </div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#212121' }}>Thông tin tài khoản</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#64748B', marginBottom: 12 }}>
                  Tài khoản đăng nhập hệ thống
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Email đăng nhập</label>
                  <Input value={formData.loginEmail} onChange={e => handleChange('loginEmail', e.target.value)} />
                </div>
              </div>

              {!isEmployeePortal && (
                <div style={{ paddingTop: 12, borderTop: '1px solid #F1F5F9', marginTop: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <LockOutlined style={{ color: '#009688' }} /> Đổi mật khẩu cho tài khoản nhân sự
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Mật khẩu mới</label>
                    <BaseInput.Password
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Nhập mật khẩu mới"
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Xác nhận mật khẩu mới</label>
                    <BaseInput.Password
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu mới"
                    />
                  </div>
                  <Button
                    type="primary"
                    icon={<LockOutlined />}
                    loading={isChangingPassword}
                    onClick={handleChangePassword}
                    style={{
                      backgroundColor: '#009688',
                      borderColor: '#009688',
                      borderRadius: 6,
                      fontWeight: 500,
                      height: 36,
                    }}
                  >
                    Cập nhật mật khẩu ngay
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SECTION: THÔNG TIN TÀI CHÍNH */}
        {(!isEmployeePortal || hasFinanceData) && (
          <div
            id="section-finance"
            className="employee-full-edit-section"
            style={{
              scrollMarginTop: 16,
              background: '#FFFFFF',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              padding: 15,
            }}
          >
            {/* Header Bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
                  <BankOutlined />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#212121' }}>Thông tin tài chính</h2>
                  <div style={{ fontSize: 12, color: '#757575', marginTop: 2 }}>
                    Danh sách tài khoản ngân hàng nhận lương &amp; thông tin thanh toán
                  </div>
                </div>
              </div>

              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleOpenAddBank}
                style={{
                  backgroundColor: '#009688',
                  borderColor: '#009688',
                  borderRadius: 6,
                  fontWeight: 400,
                  fontSize: 13,
                  height: 32,
                }}
              >
                Thêm ngân hàng
              </Button>
            </div>

            {/* Table / List View */}
            {(() => {
              const currentEmpCode = formData?.code || '';
              const currentAccounts = (bankAccountList || []).filter(
                (b) => !currentEmpCode || !b.employeeCode || b.employeeCode === currentEmpCode
              );

              if (currentAccounts.length === 0) {
                return (
                  <div style={{ padding: '30px 20px', textAlign: 'center', color: '#757575' }}>
                    <BankOutlined style={{ fontSize: 26, color: '#BDBDBD', marginBottom: 8 }} />
                    <div style={{ fontSize: 13.5 }}>Chưa có dữ liệu ngân hàng</div>
                    <Button size="small" icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={handleOpenAddBank}>
                      Thêm ngân hàng
                    </Button>
                  </div>
                );
              }

              return (
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', color: '#475569', fontWeight: 600 }}>
                        <th style={{ padding: '10px 10px', borderBottom: '1px solid #E2E8F0', width: 40, whiteSpace: 'nowrap' }}>STT</th>
                        <th style={{ padding: '10px 10px', borderBottom: '1px solid #E2E8F0', minWidth: 150, whiteSpace: 'nowrap' }}>Ngân hàng</th>
                        <th style={{ padding: '10px 10px', borderBottom: '1px solid #E2E8F0', minWidth: 110, whiteSpace: 'nowrap' }}>Số tài khoản</th>
                        <th style={{ padding: '10px 10px', borderBottom: '1px solid #E2E8F0', minWidth: 130, whiteSpace: 'nowrap' }}>Chủ tài khoản</th>
                        <th style={{ padding: '10px 10px', borderBottom: '1px solid #E2E8F0', minWidth: 110, whiteSpace: 'nowrap' }}>Chi nhánh</th>
                        <th style={{ padding: '10px 10px', borderBottom: '1px solid #E2E8F0', minWidth: 110, whiteSpace: 'nowrap' }}>Loại</th>
                        <th style={{ padding: '10px 10px', borderBottom: '1px solid #E2E8F0', minWidth: 105, whiteSpace: 'nowrap' }}>Trạng thái</th>
                        <th style={{ padding: '10px 10px', borderBottom: '1px solid #E2E8F0', textAlign: 'center', minWidth: 130, whiteSpace: 'nowrap' }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(currentAccounts || []).filter(acc => acc != null).map((acc, index) => {
                        const isPending = acc?.status === 'Chờ duyệt' || acc?.status === 'pending';
                        const isRejected = acc?.status === 'Từ chối' || acc?.status === 'rejected';
                        const isApproved = acc?.status === 'Đã duyệt' || acc?.status === 'verified';

                        return (
                          <tr key={acc?.id || index} style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.1s' }}>
                            <td style={{ padding: '10px 12px', color: '#64748B', whiteSpace: 'nowrap' }}>{index + 1}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <BankOutlined style={{ color: '#009688' }} />
                                <span>{acc?.bankName || '--'}</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 12px', fontWeight: 600, color: '#009688', whiteSpace: 'nowrap' }}>{acc?.accountNumber || '--'}</td>
                            <td style={{ padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{acc?.accountHolder || '--'}</td>
                            <td style={{ padding: '10px 12px', color: '#334155', whiteSpace: 'nowrap' }}>{acc?.branch || '--'}</td>
                            <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                              {acc?.isPrimary && isApproved ? (
                                <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                  <CheckCircleOutlined /> Nhận lương chính
                                </span>
                              ) : acc?.isPrimary && isPending ? (
                                <span style={{ background: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                  <ClockCircleOutlined /> Đề xuất chính
                                </span>
                              ) : (
                                <span style={{ background: '#F1F5F9', color: '#64748B', padding: '2px 8px', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                                  Phụ
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                              {isPending ? (
                                <span style={{ background: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                  <ClockCircleOutlined /> Chờ duyệt
                                </span>
                              ) : isRejected ? (
                                <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                  <CloseCircleOutlined /> Từ chối
                                </span>
                              ) : (
                                <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                                  <CheckCircleOutlined /> Đã duyệt
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, flexWrap: 'nowrap' }}>
                                {/* Nút Phê duyệt & Từ chối cho Quản trị viên */}
                                {!isEmployeePortal && isPending && (
                                  <>
                                    <Button
                                      type="primary"
                                      size="small"
                                      icon={<CheckCircleOutlined />}
                                      onClick={() => handleApproveBank(acc?.id, acc?.bankName)}
                                      style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', borderRadius: 4, fontSize: 12, height: 26, padding: '0 8px' }}
                                    >
                                      Duyệt
                                    </Button>
                                    <Button
                                      danger
                                      size="small"
                                      icon={<CloseCircleOutlined />}
                                      onClick={() => handleRejectBank(acc?.id, acc?.bankName)}
                                      style={{ borderRadius: 4, fontSize: 12, height: 26, padding: '0 8px' }}
                                    >
                                      Từ chối
                                    </Button>
                                  </>
                                )}

                                {!isEmployeePortal && isRejected && (
                                  <Button
                                    type="primary"
                                    size="small"
                                    icon={<CheckCircleOutlined />}
                                    onClick={() => handleApproveBank(acc?.id, acc?.bankName)}
                                    style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', borderRadius: 4, fontSize: 12, height: 26, padding: '0 8px' }}
                                  >
                                    Duyệt lại
                                  </Button>
                                )}

                                <button
                                  onClick={() => handleOpenViewBank(acc)}
                                  title="Xem chi tiết"
                                  style={{
                                    background: 'transparent',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: 4,
                                    padding: '4px 7px',
                                    cursor: 'pointer',
                                    color: '#009688',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  <EyeOutlined style={{ fontSize: 13 }} />
                                </button>

                                <button
                                  onClick={() => handleOpenEditBank(acc)}
                                  title="Chỉnh sửa"
                                  style={{
                                    background: 'transparent',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: 4,
                                    padding: '4px 7px',
                                    cursor: 'pointer',
                                    color: '#009688',
                                    display: 'flex',
                                    alignItems: 'center',
                                  }}
                                >
                                  <EditOutlined style={{ fontSize: 13 }} />
                                </button>

                                {!isEmployeePortal && (
                                  <button
                                    onClick={() => handleDeleteBank(acc?.id, acc?.bankName)}
                                    title="Xóa"
                                    style={{
                                      background: 'transparent',
                                      border: '1px solid #FEE2E2',
                                      borderRadius: 4,
                                      padding: '4px 7px',
                                      cursor: 'pointer',
                                      color: '#EF4444',
                                      display: 'flex',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <DeleteOutlined style={{ fontSize: 13 }} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* SECTION 8: CHỮ KÝ SỐ & PASSKEY BẢO MẬT */}
        {(!isEmployeePortal || hasDigisigData) && (
          <div
            id="section-digisig"
            className="employee-full-edit-section"
            style={{
              scrollMarginTop: 16,
              background: '#FFFFFF',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              padding: 18,
            }}
          >
            {/* Section Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 18 }}>
                  <SafetyCertificateOutlined />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1E293B' }}>
                    Chữ ký số
                  </h2>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    {!isEmployeePortal
                      ? `Cấp phát và quản lý chữ ký số cho nhân sự ${targetEmpName}`
                      : 'Quản lý chữ ký số cá nhân'}
                  </div>
                </div>
              </div>

              {/* Header Actions */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {!isEmployeePortal && (
                  <Button
                    type="primary"
                    icon={<SafetyCertificateOutlined />}
                    onClick={handleOpenIssueModal}
                    style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                  >
                    {digisigData && digisigData.status !== 'Thu hồi' ? 'Cập nhật chứng thư' : 'Cấp chứng thư số'}
                  </Button>
                )}
              </div>
            </div>

            {/* Body Content */}
            {!digisigData || digisigData.status === 'Thu hồi' ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <SafetyCertificateOutlined style={{ fontSize: 36, color: '#94A3B8', marginBottom: 10, display: 'block' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 12 }}>
                  {!isEmployeePortal
                    ? 'Nhân sự này chưa được cấp chứng thư chữ ký số'
                    : 'Bạn chưa được cấp chứng thư chữ ký số'}
                </div>
                {!isEmployeePortal && (
                  <Button
                    type="primary"
                    icon={<SafetyCertificateOutlined />}
                    onClick={handleOpenIssueModal}
                    style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                  >
                    Cấp chứng thư số
                  </Button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1E293B' }}>
                      {digisigData.certNumber}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => {
                        setSignText(digisigData.signatureText || targetEmpName);
                        setIsSignModalOpen(true);
                      }}
                    >
                      Đổi mẫu chữ ký
                    </Button>
                    <Button
                      size="small"
                      type="primary"
                      icon={<SafetyCertificateOutlined />}
                      onClick={() => handleTestSignDoc('Phiếu lương')}
                      style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                    >
                      Ký thử nghiệm
                    </Button>
                    {!isEmployeePortal && (
                      <Button
                        danger
                        size="small"
                        icon={<CloseCircleOutlined />}
                        onClick={handleRevokeCert}
                      >
                        Thu hồi chứng thư
                      </Button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, fontSize: 13 }}>
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 14px' }}>
                    <span style={{ color: '#64748B', display: 'block', fontSize: 12, marginBottom: 4 }}>Ngày cấp - Thời hạn</span>
                    <span style={{ fontWeight: 600, color: '#1E293B' }}>{digisigData.issueDate} → {digisigData.expiryDate}</span>
                  </div>
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 14px' }}>
                    <span style={{ color: '#64748B', display: 'block', fontSize: 12, marginBottom: 4 }}>Nhân sự</span>
                    <span style={{ fontWeight: 600, color: '#1E293B' }}>{targetEmpName} ({targetEmpCode})</span>
                  </div>
                  <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 14px' }}>
                    <span style={{ color: '#64748B', display: 'block', fontSize: 12, marginBottom: 4 }}>Phương thức bảo mật</span>
                    <span style={{ fontWeight: 600, color: '#009688', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <LockOutlined /> Xác thực bảo mật
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 9: NGƯỜI DÙNG */}
        {!isEmployeePortal && (
          <div
            id="section-user"
            className="employee-full-edit-section"
            style={{
              scrollMarginTop: 16,
              background: '#FFFFFF',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              padding: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 18 }}>
                  <UserOutlined />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1E293B' }}>
                    Người dùng
                  </h2>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    Tài khoản người dùng liên kết với hồ sơ nhân sự {targetEmpName}
                  </div>
                </div>
              </div>

              <Button
                size="small"
                icon={<SettingOutlined />}
                onClick={() => navigate('/admin/users')}
              >
                Quản lý người dùng
              </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, fontSize: 13 }}>
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '12px 14px' }}>
                <span style={{ color: '#64748B', display: 'block', fontSize: 12, marginBottom: 4 }}>Tài khoản đăng nhập</span>
                <span style={{ fontWeight: 700, color: '#1E293B', wordBreak: 'break-word' }}>
                  {formData.loginEmail || formData.accountEmail || 'Chưa thiết lập'}
                </span>
                <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 6 }}>
                  Mã nhân viên: <strong style={{ color: '#009688' }}>{targetEmpCode}</strong>
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '12px 14px' }}>
                <span style={{ color: '#64748B', display: 'block', fontSize: 12, marginBottom: 4 }}>Hồ sơ liên kết</span>
                <span style={{ fontWeight: 700, color: '#1E293B' }}>{targetEmpName}</span>
                <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 6 }}>
                  {formData.position || 'Chưa cập nhật chức danh'} · {formData.workUnit || 'Chưa cập nhật đơn vị'}
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '12px 14px' }}>
                <span style={{ color: '#64748B', display: 'block', fontSize: 12, marginBottom: 4 }}>Vai trò hệ thống</span>
                <span style={{ fontWeight: 700, color: '#1E293B' }}>Nhân viên</span>
                <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 6 }}>
                  Quyền tự phục vụ: hồ sơ, phiếu lương, tài liệu, chữ ký số
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '12px 14px' }}>
                <span style={{ color: '#64748B', display: 'block', fontSize: 12, marginBottom: 4 }}>Trạng thái truy cập</span>
                <span style={{ fontWeight: 700, color: isAccessActive ? '#009688' : '#D97706', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {isAccessActive ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
                  {displayAccessStatus}
                </span>
                <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 6 }}>
                  Trạng thái nhân sự: {displayEmploymentStatus}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SECTION 10: LỊCH SỬ & QUÁ TRÌNH */}
        <div
          id="section-history"
          className="employee-full-edit-section"
          style={{
            scrollMarginTop: 16,
            background: '#FFFFFF',
            border: '1px solid #E0E0E0',
            borderRadius: 8,
            padding: 15,
          }}
        >
          {/* Title */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
                <HistoryOutlined />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#212121' }}>Lịch sử &amp; Quá trình</h2>
                <div style={{ fontSize: 12, color: '#757575', marginTop: 2 }}>
                  Quá trình công tác, bổ nhiệm, điều chuyển và biến động nhân sự
                </div>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left', minWidth: 700 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', color: '#475569', fontWeight: 600 }}>
                  <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0', width: 45 }}>STT</th>
                  <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Ngày hiệu lực</th>
                  <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Loại sự kiện</th>
                  <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Số văn bản / Quyết định</th>
                  <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Vị trí / Chức danh</th>
                  <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Đơn vị / Phòng ban</th>
                  <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Người ký ban hành</th>
                  <th style={{ padding: '10px 12px', borderBottom: '1px solid #E2E8F0' }}>Nội dung chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {Array.isArray(formData?.careerHistory) && formData.careerHistory.length > 0 ? (
                  formData.careerHistory.map((item: any, index: number) => (
                    <tr key={index} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 12px', color: '#64748B' }}>{index + 1}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 500, color: '#1E293B' }}>{item.date || '-'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ background: '#E0F2F1', color: '#00796B', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {item.type || 'Sự kiện'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', color: '#2563EB', fontWeight: 500 }}>{item.code || '-'}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1E293B' }}>{item.position || '-'}</td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>{item.unit || '-'}</td>
                      <td style={{ padding: '10px 12px', color: '#334155' }}>{item.signer || '-'}</td>
                      <td style={{ padding: '10px 12px', color: '#64748B' }}>{item.note || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} style={{ padding: '28px 12px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
                      Chưa có ghi nhận quá trình công tác, bổ nhiệm hoặc biến động nhân sự.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL: THÊM / SỬA THÂN NHÂN & NGƯỜI PHỤ THUỘC */}
      <Modal
        open={isFamilyModalOpen}
        onCancel={() => setIsFamilyModalOpen(false)}
        title={editingFamilyMember ? 'Chỉnh sửa thông tin thân nhân' : 'Thêm thân nhân / người phụ thuộc mới'}
        width={680}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button onClick={() => setIsFamilyModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              onClick={handleSaveFamilyMember}
              style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6 }}
            >
              {editingFamilyMember ? 'Cập nhật' : 'Lưu thân nhân'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6 }}>
          <div className="k-form-grid-2">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Họ và tên thân nhân*</label>
              <BaseInput
                placeholder="Nhập họ và tên..."
                value={familyMemberForm.name}
                onChange={e => setFamilyMemberForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Mối quan hệ*</label>
              <BaseSelect
                value={familyMemberForm.relation}
                onChange={val => setFamilyMemberForm(prev => ({ ...prev, relation: val }))}
                options={RELATION_SELECT_OPTIONS}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Giới tính</label>
              <BaseSelect
                value={familyMemberForm.gender}
                onChange={val => setFamilyMemberForm(prev => ({ ...prev, gender: val }))}
                options={GENDER_OPTIONS}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ngày sinh</label>
              <BaseInput
                type="date"
                value={familyMemberForm.birthDate}
                onChange={e => setFamilyMemberForm(prev => ({ ...prev, birthDate: e.target.value }))}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số Căn cước công dân / Chứng minh nhân dân</label>
              <BaseInput
                placeholder="Nhập số Căn cước công dân / Chứng minh nhân dân..."
                value={familyMemberForm.idNumber}
                onChange={e => setFamilyMemberForm(prev => ({ ...prev, idNumber: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Nghề nghiệp / Nơi công tác</label>
              <BaseInput
                placeholder="Nhập nghề nghiệp..."
                value={familyMemberForm.job}
                onChange={e => setFamilyMemberForm(prev => ({ ...prev, job: e.target.value }))}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Số điện thoại liên lạc</label>
              <BaseInput
                placeholder="09xx..."
                value={familyMemberForm.phone}
                onChange={e => setFamilyMemberForm(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Địa chỉ thường trú</label>
              <BaseInput
                placeholder="Số nhà, phố, xã/phường..."
                value={familyMemberForm.address}
                onChange={e => setFamilyMemberForm(prev => ({ ...prev, address: e.target.value }))}
              />
            </div>
          </div>

          {/* Người phụ thuộc giảm trừ gia cảnh */}
          <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
            <BaseCheckbox
              checked={familyMemberForm.isDependent}
              onChange={e => setFamilyMemberForm(prev => ({ ...prev, isDependent: e.target.checked }))}
            >
              <span style={{ fontWeight: 600, color: '#1E293B' }}>Đăng ký giảm trừ gia cảnh</span>
            </BaseCheckbox>

            {familyMemberForm.isDependent && (
              <div className="k-form-grid-3" style={{ marginTop: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Mã số thuế người phụ thuộc</label>
                  <BaseInput
                    placeholder="Mã số thuế..."
                    value={familyMemberForm.dependentTaxCode}
                    onChange={e => setFamilyMemberForm(prev => ({ ...prev, dependentTaxCode: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Ngày bắt đầu giảm trừ</label>
                  <BaseInput
                    type="date"
                    value={familyMemberForm.dependentStartDate}
                    onChange={e => setFamilyMemberForm(prev => ({ ...prev, dependentStartDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 4 }}>Ngày kết thúc giảm trừ</label>
                  <BaseInput
                    type="date"
                    value={familyMemberForm.dependentEndDate}
                    onChange={e => setFamilyMemberForm(prev => ({ ...prev, dependentEndDate: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL: XEM CHI TIẾT THÂN NHÂN */}
      <Modal
        open={isFamilyViewModalOpen}
        onCancel={() => setIsFamilyViewModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HeartOutlined style={{ color: '#009688' }} />
            <span>Thông tin chi tiết thân nhân</span>
          </div>
        }
        width={640}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              onClick={() => setIsFamilyViewModalOpen(false)}
              style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6 }}
            >
              Đóng
            </Button>
          </div>
        }
      >
        {viewingFamilyMember && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6 }}>
            <div className="k-form-grid-2">
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Họ và tên thân nhân</label>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B' }}>{viewingFamilyMember.name || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Mối quan hệ</label>
                <div>
                  <span style={{ background: '#E0F2F1', color: '#00796B', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 500 }}>
                    {viewingFamilyMember.relation || '--'}
                  </span>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Giới tính</label>
                <div style={{ fontSize: 13, color: '#334155' }}>{viewingFamilyMember.gender || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Ngày sinh</label>
                <div style={{ fontSize: 13, color: '#334155' }}>{viewingFamilyMember.birthDate || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Định danh</label>
                <div style={{ fontSize: 13, color: '#334155' }}>{viewingFamilyMember.idNumber || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Nghề nghiệp / Nơi công tác</label>
                <div style={{ fontSize: 13, color: '#334155' }}>{viewingFamilyMember.job || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Số điện thoại liên lạc</label>
                <div style={{ fontSize: 13, color: '#334155' }}>{viewingFamilyMember.phone || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Địa chỉ thường trú</label>
                <div style={{ fontSize: 13, color: '#334155' }}>{viewingFamilyMember.address || '--'}</div>
              </div>
            </div>

            {/* Giảm trừ gia cảnh */}
            <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: viewingFamilyMember.isDependent ? 10 : 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#475569' }}>Giảm trừ gia cảnh:</span>
                {viewingFamilyMember.isDependent ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16A34A', fontSize: 12, background: '#DCFCE7', padding: '2px 8px', borderRadius: 4, fontWeight: 500 }}>
                    <CheckCircleOutlined /> Người phụ thuộc
                  </span>
                ) : (
                  <span style={{ color: '#94A3B8', fontSize: 12.5 }}>Không đăng ký</span>
                )}
              </div>

              {viewingFamilyMember.isDependent && (
                <div className="k-form-grid-3" style={{ borderTop: '1px dashed #E2E8F0', paddingTop: 10 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Mã số thuế</label>
                    <div style={{ fontSize: 13, color: '#334155' }}>{viewingFamilyMember.dependentTaxCode || '--'}</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Ngày bắt đầu</label>
                    <div style={{ fontSize: 13, color: '#334155' }}>{viewingFamilyMember.dependentStartDate || '--'}</div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Ngày kết thúc</label>
                    <div style={{ fontSize: 13, color: '#334155' }}>{viewingFamilyMember.dependentEndDate || '--'}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: THÊM / CHỈNH SỬA NGÂN HÀNG */}
      <Modal
        open={isBankModalOpen}
        onCancel={() => setIsBankModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BankOutlined style={{ color: '#009688' }} />
            <span>
              {editingBankAccount
                ? editingBankAccount.status === 'Từ chối'
                  ? 'Chỉnh sửa & Gửi duyệt lại ngân hàng'
                  : 'Chỉnh sửa ngân hàng'
                : 'Thêm ngân hàng'}
            </span>
          </div>
        }
        width={620}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setIsBankModalOpen(false)} style={{ borderRadius: 6 }}>
              Hủy
            </Button>
            <Button
              type="primary"
              onClick={handleSaveBankAccount}
              style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6 }}
            >
              {isEmployeePortal && editingBankAccount?.status === 'Từ chối'
                ? 'Gửi duyệt lại'
                : editingBankAccount
                ? 'Lưu thay đổi'
                : 'Thêm ngân hàng'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 6 }}>
          {/* Thông báo nếu tài khoản bị từ chối */}
          {isEmployeePortal && editingBankAccount?.status === 'Từ chối' && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '10px 14px', color: '#B91C1C', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <InfoCircleOutlined style={{ fontSize: 16 }} />
              <div>
                Tài khoản này đã bị <strong>Từ chối</strong> trước đó. Bạn có thể chỉnh sửa lại đầy đủ thông tin và nhấn <strong>Gửi duyệt lại</strong> để Quản trị viên duyệt lại.
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
              Ngân hàng <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <BaseSelect
              disabled={isEmployeePortal && editingBankAccount !== null && editingBankAccount.status !== 'Từ chối'}
              value={bankAccountForm.bankName}
              onChange={val => setBankAccountForm(prev => ({ ...prev, bankName: val }))}
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
              style={{ width: '100%' }}
            />
          </div>

          <div className="k-form-grid-2">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
                Số tài khoản <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <BaseInput
                disabled={isEmployeePortal && editingBankAccount !== null && editingBankAccount.status !== 'Từ chối'}
                placeholder="Nhập số tài khoản..."
                value={bankAccountForm.accountNumber}
                onChange={e => setBankAccountForm(prev => ({ ...prev, accountNumber: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
                Tên chủ tài khoản <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <BaseInput
                disabled={isEmployeePortal && editingBankAccount !== null && editingBankAccount.status !== 'Từ chối'}
                placeholder="Nhập tên chủ tài khoản..."
                value={bankAccountForm.accountHolder}
                onChange={e => setBankAccountForm(prev => ({ ...prev, accountHolder: e.target.value.toUpperCase() }))}
              />
            </div>
          </div>

          <div className="k-form-grid-2">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chi nhánh ngân hàng</label>
              <BaseInput
                disabled={isEmployeePortal && editingBankAccount !== null && editingBankAccount.status !== 'Từ chối'}
                placeholder="Nhập chi nhánh ngân hàng..."
                value={bankAccountForm.branch}
                onChange={e => setBankAccountForm(prev => ({ ...prev, branch: e.target.value }))}
              />
            </div>
            {!isEmployeePortal ? (
              <div>
                <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Trạng thái</label>
                <BaseSelect
                  value={bankAccountForm.status || 'Đã duyệt'}
                  onChange={val => setBankAccountForm(prev => ({ ...prev, status: val }))}
                  options={[
                    { value: 'Đã duyệt', label: 'Đã duyệt' },
                    { value: 'Chờ duyệt', label: 'Chờ duyệt' },
                    { value: 'Từ chối', label: 'Từ chối' },
                  ]}
                  style={{ width: '100%' }}
                />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Trạng thái</label>
                <BaseInput
                  value={editingBankAccount?.status === 'Từ chối' ? 'Gửi duyệt lại' : (bankAccountForm.status || 'Chờ duyệt')}
                  readOnly
                  disabled
                  style={{
                    backgroundColor: editingBankAccount?.status === 'Từ chối' ? '#FEF2F2' : '#F8FAFC',
                    color: editingBankAccount?.status === 'Từ chối' ? '#DC2626' : '#D97706',
                    fontWeight: 600,
                  }}
                />
              </div>
            )}
          </div>

          <div>
            <BaseCheckbox
              checked={bankAccountForm.isPrimary}
              onChange={e => setBankAccountForm(prev => ({
                ...prev,
                isPrimary: e.target.checked,
                accountType: e.target.checked ? 'Tài khoản nhận lương chính' : 'Tài khoản phụ',
              }))}
            >
              <span style={{ fontWeight: 500, color: '#1E293B' }}>Đặt làm tài khoản nhận lương chính</span>
            </BaseCheckbox>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ghi chú</label>
            <BaseInput
              placeholder="Nhập ghi chú thêm nếu có..."
              value={bankAccountForm.note || ''}
              onChange={e => setBankAccountForm(prev => ({ ...prev, note: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* MODAL: XEM CHI TIẾT TÀI KHOẢN NGÂN HÀNG */}
      <Modal
        open={isBankViewModalOpen}
        onCancel={() => setIsBankViewModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BankOutlined style={{ color: '#009688' }} />
            <span>Thông tin chi tiết ngân hàng</span>
          </div>
        }
        width={580}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {!isEmployeePortal && viewingBankAccount && (viewingBankAccount.status === 'Chờ duyệt' || viewingBankAccount.status === 'pending') && (
              <>
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleApproveBank(viewingBankAccount.id, viewingBankAccount.bankName)}
                  style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', borderRadius: 6 }}
                >
                  Duyệt tài khoản
                </Button>
                <Button
                  danger
                  icon={<CloseCircleOutlined />}
                  onClick={() => handleRejectBank(viewingBankAccount.id, viewingBankAccount.bankName)}
                  style={{ borderRadius: 6 }}
                >
                  Từ chối tài khoản
                </Button>
              </>
            )}
            {!isEmployeePortal && viewingBankAccount && (viewingBankAccount.status === 'Từ chối' || viewingBankAccount.status === 'rejected') && (
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => handleApproveBank(viewingBankAccount.id, viewingBankAccount.bankName)}
                style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', borderRadius: 6 }}
              >
                Duyệt lại tài khoản
              </Button>
            )}
            <Button
              type="default"
              onClick={() => setIsBankViewModalOpen(false)}
              style={{ borderRadius: 6 }}
            >
              Đóng
            </Button>
          </div>
        }
      >
        {viewingBankAccount && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6 }}>
            <div className="k-form-grid-2">
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Tên ngân hàng</label>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{viewingBankAccount?.bankName || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Số tài khoản</label>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#009688' }}>{viewingBankAccount?.accountNumber || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Tên chủ tài khoản</label>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B' }}>{viewingBankAccount?.accountHolder || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Chi nhánh</label>
                <div style={{ fontSize: 13, color: '#334155' }}>{viewingBankAccount?.branch || '--'}</div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: '#64748B', marginBottom: 2 }}>Trạng thái</label>
                <div>
                  {viewingBankAccount.status === 'Chờ duyệt' || viewingBankAccount.status === 'pending' ? (
                    <span style={{ background: '#FEF3C7', color: '#D97706', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <ClockCircleOutlined /> Chờ duyệt
                    </span>
                  ) : viewingBankAccount.status === 'Từ chối' || viewingBankAccount.status === 'rejected' ? (
                    <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CloseCircleOutlined /> Từ chối
                    </span>
                  ) : (
                    <span style={{ background: '#DCFCE7', color: '#16A34A', padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircleOutlined /> Đã duyệt
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: '#475569' }}>Loại tài khoản:</span>
                {viewingBankAccount.isPrimary ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#16A34A', fontSize: 12, background: '#DCFCE7', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                    <CheckCircleOutlined /> Tài khoản nhận lương chính
                  </span>
                ) : (
                  <span style={{ color: '#64748B', fontSize: 12.5, background: '#F1F5F9', padding: '2px 8px', borderRadius: 4 }}>
                    Tài khoản phụ
                  </span>
                )}
              </div>
              {viewingBankAccount.note && (
                <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 6 }}>
                  <strong>Ghi chú:</strong> {viewingBankAccount.note}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: ADMIN CẤP / CHỈNH SỬA CHỨNG THƯ CHỮ KÝ SỐ */}
      <Modal
        open={isIssueModalOpen}
        onCancel={() => setIsIssueModalOpen(false)}
        centered
        title="Cấp phát chứng thư chữ ký số"
        width={680}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setIsIssueModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              icon={<SafetyCertificateOutlined />}
              onClick={handleSaveIssueCert}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Cấp chứng thư
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="k-form-grid-2">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
                Mã chứng thư số <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <BaseInput
                value={issueForm.certNumber}
                onChange={e => setIssueForm({ ...issueForm, certNumber: e.target.value })}
                placeholder="VD: CERT-EMP951954-2026-8801"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
                Nhà cung cấp <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <BaseSelect
                value={issueForm.provider}
                onChange={val => setIssueForm({ ...issueForm, provider: val })}
                options={[
                  { value: 'KIYO Internal PKI CA', label: 'KIYO Internal PKI CA' },
                  { value: 'Viettel-CA', label: 'Viettel-CA' },
                  { value: 'VNPT-CA', label: 'VNPT-CA' },
                  { value: 'FPT-CA', label: 'FPT-CA' },
                ]}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div className="k-form-grid-2">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
                Loại chứng thư <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <BaseSelect
                value={issueForm.certType}
                onChange={val => setIssueForm({ ...issueForm, certType: val })}
                options={[
                  { value: 'Chữ ký số nội bộ', label: 'Chữ ký số nội bộ' },
                  { value: 'Cloud CA', label: 'Cloud CA' },
                  { value: 'USB Token', label: 'USB Token' },
                  { value: 'Chữ ký số kèm Dấu đỏ số', label: 'Chữ ký số kèm Dấu đỏ số' },
                ]}
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
                Trạng thái <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <BaseSelect
                value={issueForm.status || 'Đang hoạt động'}
                onChange={val => setIssueForm({ ...issueForm, status: val })}
                options={[
                  { value: 'Đang hoạt động', label: 'Đang hoạt động' },
                  { value: 'Tạm khóa', label: 'Tạm khóa' },
                  { value: 'Thu hồi', label: 'Thu hồi' },
                ]}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div className="k-form-grid-2">
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
                Ngày có hiệu lực
              </label>
              <BaseInput
                type="date"
                value={issueForm.issueDate}
                onChange={e => setIssueForm({ ...issueForm, issueDate: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
                Ngày hết hiệu lực
              </label>
              <BaseInput
                type="date"
                value={issueForm.expiryDate}
                onChange={e => setIssueForm({ ...issueForm, expiryDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
              Cấp bởi
            </label>
            <BaseInput
              value={issueForm.issuedBy}
              onChange={e => setIssueForm({ ...issueForm, issuedBy: e.target.value })}
              placeholder="VD: Ban Giám Đốc"
            />
          </div>
        </div>
      </Modal>

      {/* MODAL: THIẾT LẬP MẪU CHỮ KÝ CÁ NHÂN (3 TABS) */}
      <Modal
        open={isSignModalOpen}
        onCancel={() => setIsSignModalOpen(false)}
        centered
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HighlightOutlined style={{ color: '#009688', fontSize: 18 }} />
            <span>Thiết lập mẫu chữ ký số cá nhân</span>
          </div>
        }
        width={540}
        styles={{
          body: { paddingTop: 0, paddingBottom: 0 },
          footer: { marginTop: 6, paddingTop: 4 },
        }}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
            <Button onClick={() => setIsSignModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              onClick={handleSaveSignature}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Xác nhận lưu chữ ký
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2 }}>
          {/* Tab Selection với Icon Web chuẩn 100% */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E2E8F0', gap: 6 }}>
            {[
              { key: 'font', label: 'Mẫu Font chữ nghệ thuật', icon: <FontSizeOutlined /> },
              { key: 'draw', label: 'Vẽ tay trực tiếp', icon: <HighlightOutlined /> },
              { key: 'upload', label: 'Tải ảnh chữ ký', icon: <UploadOutlined /> },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSignTab(tab.key as any)}
                style={{
                  padding: '6px 12px',
                  background: 'none',
                  border: 'none',
                  borderBottom: signTab === tab.key ? '2px solid #009688' : '2px solid transparent',
                  color: signTab === tab.key ? '#009688' : '#64748B',
                  fontWeight: signTab === tab.key ? 700 : 500,
                  fontSize: 12.5,
                  cursor: 'pointer',
                  outline: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div style={{ height: 204, display: 'flex', flexDirection: 'column', boxSizing: 'border-box', overflow: 'hidden' }}>
            {/* TAB 1: FONT NGHỆ THUẬT */}
            {signTab === 'font' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 3 }}>
                    Tên hiển thị trên chữ ký
                  </label>
                  <BaseInput
                    value={signText}
                    onChange={e => setSignText(e.target.value)}
                    placeholder="Nhập tên chữ ký..."
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  {[
                    { name: 'Nét bút lông mềm mại', font: '"Brush Script MT", "Caveat", "Dancing Script", cursive', size: 20, style: 'italic' },
                    { name: 'Chữ ký thanh lịch', font: '"Segoe Script", "Great Vibes", cursive', size: 18, style: 'italic' },
                    { name: 'Chữ ký viết tay phóng khoáng', font: '"Lucida Handwriting", "Sacramento", cursive', size: 18, style: 'normal' },
                    { name: 'Chữ ký nghệ thuật bay bổng', font: '"Alex Brush", "Cedarville Cursive", cursive', size: 21, style: 'italic' },
                  ].map((fItem, fIdx) => (
                    <div
                      key={fIdx}
                      onClick={() => setSelectedFontIndex(fIdx)}
                      style={{
                        border: selectedFontIndex === fIdx ? '2px solid #009688' : '2px solid #E2E8F0',
                        background: selectedFontIndex === fIdx ? '#F0FDFA' : '#FAFAFA',
                        borderRadius: 6,
                        padding: '6px 10px',
                        cursor: 'pointer',
                        textAlign: 'center',
                        position: 'relative',
                        boxSizing: 'border-box',
                        height: 64,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                        transition: 'border-color 0.15s, background-color 0.15s',
                      }}
                    >
                      {selectedFontIndex === fIdx && (
                        <span style={{ position: 'absolute', top: 3, right: 5, color: '#009688', fontSize: 11 }}>
                          <CheckCircleOutlined />
                        </span>
                      )}
                      <div style={{ fontFamily: fItem.font, fontStyle: fItem.style, fontSize: fItem.size, color: '#0052CC', lineHeight: 1.1, marginBottom: 1, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {signText || targetEmpName}
                      </div>
                      <div style={{ fontSize: 10.5, color: '#64748B' }}>{fItem.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: VẼ TAY TRỰC TIẾP */}
            {signTab === 'draw' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                  <Button size="small" onClick={clearCanvas}>
                    Xóa vẽ lại
                  </Button>
                </div>

                <div style={{ border: '2px dashed #009688', borderRadius: 6, background: '#FFFFFF', position: 'relative', overflow: 'hidden', height: 168, flex: 1 }}>
                  <canvas
                    ref={canvasRef}
                    width={480}
                    height={168}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
                  />
                </div>
              </div>
            )}

            {/* TAB 3: TẢI ẢNH CHỮ KÝ */}
            {signTab === 'upload' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
                <FileUploadDialog open={signUploadPickerOpen} onClose={() => setSignUploadPickerOpen(false)} accept="image/*" multiple={false} title="Chọn ảnh chữ ký" confirmText="Chọn ảnh" onSelect={(files) => { const reader = new FileReader(); reader.onload = () => setUploadedSignImage(reader.result as string); reader.readAsDataURL(files[0]); }} />
                <div style={{ border: '2px dashed #CBD5E1', borderRadius: 6, padding: '14px', textAlign: 'center', background: '#F8FAFC', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <button type="button" onClick={() => setSignUploadPickerOpen(true)} style={{ cursor: 'pointer', width: '100%', border: 'none', background: 'transparent' }}>
                    <CloudUploadOutlined style={{ fontSize: 28, color: '#009688', marginBottom: 4, display: 'block' }} />
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: '#1E293B', marginBottom: 2 }}>
                      Nhấn để tải lên ảnh chữ ký
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>
                      Hỗ trợ định dạng PNG, JPG
                    </div>
                  </button>
                </div>

                {uploadedSignImage && (
                  <div style={{ textAlign: 'center', padding: '3px 6px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 6, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: '#64748B' }}>Xem trước:</span>
                    <img src={uploadedSignImage} alt="Preview" style={{ maxHeight: 34, maxWidth: 160, objectFit: 'contain' }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tùy chỉnh vị trí hiển thị chữ ký */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 4 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, color: '#64748B', marginBottom: 3 }}>Trang ký</label>
              <BaseSelect
                value={signaturePage}
                onChange={(val) => setSignaturePage(val as any)}
                style={{ width: '100%' }}
                options={[
                  { label: 'Trang đầu tiên', value: 'first' },
                  { label: 'Trang cuối cùng', value: 'last' },
                ]}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11.5, color: '#64748B', marginBottom: 3 }}>Vị trí trên trang</label>
              <BaseSelect
                value={signaturePosition}
                onChange={(val) => setSignaturePosition(val as any)}
                style={{ width: '100%' }}
                options={[
                  { label: 'Góc dưới bên phải', value: 'bottom-right' },
                  { label: 'Góc dưới bên trái', value: 'bottom-left' },
                  { label: 'Góc trên bên phải', value: 'top-right' },
                  { label: 'Góc trên bên trái', value: 'top-left' },
                ]}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* MODAL: XÁC THỰC PASSKEY / MÃ PIN BẢO MẬT */}
      <Modal
        open={isPasskeyModalOpen}
        onCancel={() => setIsPasskeyModalOpen(false)}
        centered
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SafetyOutlined style={{ color: '#009688', fontSize: 18 }} />
            <span>{passkeyPromptTitle || 'Xác thực Passkey'}</span>
          </div>
        }
        width={420}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setIsPasskeyModalOpen(false)}>Hủy</Button>
            <Button
              type="primary"
              icon={<SafetyOutlined />}
              onClick={handleConfirmPasskey}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Xác nhận
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4, fontWeight: 500 }}>
              Mã PIN bảo mật
            </label>
            <BaseInput
              type="password"
              placeholder="Nhập mã PIN bảo mật..."
              value={passkeyInput}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleConfirmPasskey();
              }}
              onChange={e => setPasskeyInput(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* MODAL 1: ĐẶT LẠI THIẾT LẬP HỒ SƠ */}
      <Modal
        open={isResetSetupModalOpen}
        onCancel={() => setIsResetSetupModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#DC2626', fontSize: 16, fontWeight: 700 }}>
            <ReloadOutlined />
            <span>Đặt lại thiết lập hồ sơ nhân viên</span>
          </div>
        }
        width={780}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <Button onClick={() => setIsResetSetupModalOpen(false)} style={{ borderRadius: 6, fontSize: 12.5 }}>
              Hủy bỏ
            </Button>
            <Button
              type="primary"
              danger
              icon={<ReloadOutlined />}
              onClick={handleConfirmResetSetup}
              style={{
                backgroundColor: '#DC2626',
                borderColor: '#DC2626',
                color: '#FFFFFF',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Xác nhận đặt lại
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
          {/* Cảnh báo */}
          <div
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECDD3',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12.5,
              color: '#991B1B',
              lineHeight: 1.5,
              display: 'flex',
              gap: 8,
            }}
          >
            <WarningOutlined style={{ fontSize: 16, color: '#DC2626', flexShrink: 0, marginTop: 2 }} />
            <div>
              Thao tác này sẽ xóa các dữ liệu được chọn của nhân viên {formData.name} về mặc định
            </div>
          </div>

          {/* Công cụ chọn nhanh */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
              Chọn các mục cần đặt lại
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                size="small"
                onClick={() => selectAllSections('reset')}
                style={{ fontSize: 11.5, borderRadius: 4 }}
              >
                Chọn tất cả
              </Button>
              <Button
                size="small"
                onClick={() => deselectAllSections('reset')}
                style={{ fontSize: 11.5, borderRadius: 4 }}
              >
                Bỏ chọn tất cả
              </Button>
            </div>
          </div>

          {/* Grid Checkbox các phần dữ liệu (Không khung, chỉ hiện tick + chữ, không có thanh kéo) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px 14px',
              padding: '4px 0',
              userSelect: 'none',
            }}
          >
            {SECTION_DETAILED_OPTIONS.map((sec) => {
              const isChecked = isSectionSelected('reset', sec.key);
              return (
                <div
                  key={sec.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    userSelect: 'none',
                  }}
                >
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                      color: '#1E293B',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSection('reset', sec.key)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#DC2626' }}
                    />
                    <span style={{ whiteSpace: 'nowrap' }}>{sec.label}</span>
                  </label>

                  <span
                    onClick={() => setSubFieldModalConfig({ isOpen: true, mode: 'reset', sectionKey: sec.key })}
                    title="Chọn chi tiết từng trường"
                    style={{
                      fontSize: 13,
                      color: '#8C8C8C',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#009688';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#8C8C8C';
                    }}
                  >
                    <EditOutlined />
                  </span>
                </div>
              );
            })}
          </div>

          {/* Ghi chú lý do */}
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Lý do
            </label>
            <textarea
              value={resetNote}
              onChange={(e) => setResetNote(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                fontSize: 12.5,
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>
        </div>
      </Modal>

      {/* MODAL 2: YÊU CẦU CẬP NHẬT / BỔ SUNG THÔNG TIN */}
      <Modal
        open={isUpdateRequestModalOpen}
        onCancel={() => setIsUpdateRequestModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#0F766E', fontSize: 16, fontWeight: 700 }}>
            <FormOutlined />
            <span>Gửi yêu cầu cập nhật thông tin tới nhân viên</span>
          </div>
        }
        width={780}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <Button onClick={() => setIsUpdateRequestModalOpen(false)} style={{ borderRadius: 6, fontSize: 12.5 }}>
              Hủy bỏ
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSendUpdateRequest}
              style={{
                backgroundColor: '#009688',
                borderColor: '#009688',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12.5,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              Gửi yêu cầu
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '4px 0' }}>
          {/* Công cụ chọn nhanh */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
              Chọn các mục cần nhân viên kiểm tra, bổ sung
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                size="small"
                onClick={() => selectAllSections('update')}
                style={{ fontSize: 11.5, borderRadius: 4 }}
              >
                Chọn tất cả
              </Button>
              <Button
                size="small"
                onClick={() => deselectAllSections('update')}
                style={{ fontSize: 11.5, borderRadius: 4 }}
              >
                Bỏ chọn tất cả
              </Button>
            </div>
          </div>

          {/* Grid Checkbox các phần dữ liệu (Không khung, chỉ hiện tick + chữ, không có thanh kéo) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px 14px',
              padding: '4px 0',
              userSelect: 'none',
            }}
          >
            {SECTION_DETAILED_OPTIONS.map((sec) => {
              const isChecked = isSectionSelected('update', sec.key);
              return (
                <div
                  key={sec.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    userSelect: 'none',
                  }}
                >
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      cursor: 'pointer',
                      fontSize: 13,
                      color: '#1E293B',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSection('update', sec.key)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0D9488' }}
                    />
                    <span style={{ whiteSpace: 'nowrap' }}>{sec.label}</span>
                  </label>

                  <span
                    onClick={() => setSubFieldModalConfig({ isOpen: true, mode: 'update', sectionKey: sec.key })}
                    title="Chọn chi tiết từng trường"
                    style={{
                      fontSize: 13,
                      color: '#8C8C8C',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = '#009688';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#8C8C8C';
                    }}
                  >
                    <EditOutlined />
                  </span>
                </div>
              );
            })}
          </div>

          {/* Nội dung ghi chú / Hướng dẫn */}
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Nội dung
            </label>
            <textarea
              value={updateNote}
              onChange={(e) => setUpdateNote(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #CBD5E1',
                fontSize: 12.5,
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>

          {/* Hạn chót (Tùy chọn) */}
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
              Hạn chót hoàn thành
            </label>
            <BaseInput
              type="date"
              value={updateDeadline}
              onChange={(e: any) => setUpdateDeadline(e.target.value)}
              style={{ width: '100%', borderRadius: 6 }}
            />
          </div>
        </div>
      </Modal>

      {/* MODAL TÙY CHỈNH HẠN MỨC DUNG LƯỢNG LƯU TRỮ */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: '#0F172A' }}>
            <HddOutlined style={{ color: '#0284C7' }} /> Hạn mức dung lượng lưu trữ
          </div>
        }
        open={isStorageModalOpen}
        onCancel={() => setIsStorageModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsStorageModalOpen(false)}>
            Hủy
          </Button>,
          <Button
            key="submit"
            type="primary"
            icon={<SaveOutlined />}
            onClick={() => {
              handleSaveStorageQuota();
              setIsStorageModalOpen(false);
            }}
            style={{ backgroundColor: '#0284C7', borderColor: '#0284C7', borderRadius: 6 }}
          >
            Lưu dung lượng
          </Button>,
        ]}
        width={480}
      >
        <div style={{ padding: '8px 0' }}>
          <p style={{ fontSize: 13, color: '#475569', marginBottom: 16, lineHeight: '20px' }}>
            Mặc định mỗi tài khoản nhân viên được cấp <strong>2 GB</strong> dung lượng lưu trữ dữ liệu. Quản trị viên có thể điều chỉnh hạn mức lưu trữ riêng cho tài khoản này bên dưới.
          </p>

          <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
              Dung lượng cấp cho tài khoản:
            </span>
            <InputNumber
              min={0.1}
              max={10000}
              step={0.5}
              value={storageQuotaGB}
              onChange={(val) => setStorageQuotaGB(val || 2)}
              addonAfter="GB"
              style={{ width: 140 }}
            />
          </div>
        </div>
      </Modal>

      {/* MODAL 3: CHI TIẾT TRƯỜNG DỮ LIỆU CỦA TỪNG PHẦN */}
      {subFieldModalConfig && subFieldModalConfig.isOpen && (() => {
        const mode = subFieldModalConfig.mode;
        const currentSec = SECTION_DETAILED_OPTIONS.find(s => s.key === subFieldModalConfig.sectionKey);
        if (!currentSec) return null;

        const currentFields = (mode === 'reset' ? resetFieldMap : updateFieldMap)[currentSec.key] || [];
        const isAllSelected = currentFields.length === currentSec.fields.length;
        const isNoneSelected = currentFields.length === 0;
        const accentColor = mode === 'reset' ? '#DC2626' : '#009688';

        return (
          <Modal
            open={true}
            onCancel={() => setSubFieldModalConfig(null)}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: accentColor, fontSize: 15, fontWeight: 700 }}>
                {mode === 'reset' ? <ReloadOutlined /> : <FormOutlined />}
                <span>Chọn chi tiết trường {currentSec.label}</span>
              </div>
            }
            width={720}
            footer={
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                <Button
                  type="primary"
                  onClick={() => setSubFieldModalConfig(null)}
                  style={{
                    backgroundColor: accentColor,
                    borderColor: accentColor,
                    borderRadius: 6,
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  Hoàn tất chọn
                </Button>
              </div>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '4px 0' }}>
              {/* Header hướng dẫn & nút chọn nhanh (Không khung xám bao quanh) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4, userSelect: 'none' }}>
                <div style={{ fontSize: 13, color: '#334155' }}>
                  Tick chọn từng trường dữ liệu nhỏ bạn muốn {mode === 'reset' ? 'đặt lại' : 'yêu cầu cập nhật'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    size="small"
                    onClick={() => selectAllFieldsOfSection(mode, currentSec.key)}
                    disabled={isAllSelected}
                    style={{ fontSize: 11.5, borderRadius: 4 }}
                  >
                    Chọn tất cả
                  </Button>
                  <Button
                    size="small"
                    onClick={() => deselectAllFieldsOfSection(mode, currentSec.key)}
                    disabled={isNoneSelected}
                    style={{ fontSize: 11.5, borderRadius: 4 }}
                  >
                    Bỏ chọn tất cả
                  </Button>
                </div>
              </div>

              {/* Grid hiển thị các trường dữ liệu nhỏ (Không khung, chỉ tick + chữ) */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px 16px',
                  maxHeight: 'calc(70vh - 160px)',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  padding: '8px 2px',
                  userSelect: 'none',
                }}
              >
                {currentSec.fields.map((field) => {
                  const isFieldChecked = currentFields.includes(field.key);
                  return (
                    <label
                      key={field.key}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        color: '#1E293B',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isFieldChecked}
                        onChange={() => toggleSubField(mode, currentSec.key, field.key)}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor }}
                      />
                      <span style={{ whiteSpace: 'nowrap' }}>
                        {field.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* "Đã copy" Tooltip popup (Giống 100% như ảnh, có cả hiệu ứng mở & đóng mượt mà) */}
      {copyCoords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: copyCoords.x,
              top: copyCoords.y - 6,
              transform: 'translate(-50%, -100%)',
              backgroundColor: '#262626',
              color: '#FFFFFF',
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 500,
              lineHeight: '16px',
              whiteSpace: 'nowrap',
              zIndex: 999999,
              pointerEvents: 'none',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              animation: isCopyClosing
                ? 'kCopyExit 0.14s cubic-bezier(0.7, 0, 0.84, 0) forwards'
                : 'kCopyEnter 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards',
            }}
          >
            Đã copy
            <div
              style={{
                position: 'absolute',
                bottom: -4,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: '4px solid #262626',
              }}
            />
          </div>,
          document.body
        )}

      {/* FileUploadDialog for Employee Avatar */}
      <FileUploadDialog
        open={avatarPickerOpen}
        onClose={() => setAvatarPickerOpen(false)}
        accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.tiff,.tif,.avif,.heic,.heif,.ico"
        multiple={false}
        title="Chọn ảnh đại diện nhân viên"
        confirmText="Cập nhật ảnh đại diện"
        onSelect={(files) => {
          if (files && files[0]) {
            handleAvatarFile(files[0]);
          }
        }}
      />
    </div>
  </PortalContext.Provider>
  );
};
