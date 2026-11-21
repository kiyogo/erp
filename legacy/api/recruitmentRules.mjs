// Quy tắc tuyển dụng: tin tuyển dụng không phân biệt đối xử, đồng ý xử lý dữ liệu cá nhân của ứng viên, lương đề nghị không thấp hơn lương tối thiểu vùng.
// Căn cứ: Bộ luật Lao động 2019 Điều 3 khoản 8 và Điều 8 (cấm phân biệt đối xử vì giới tính, độ tuổi, tình trạng hôn nhân, thai sản, dân tộc,
// tôn giáo, khuyết tật...), Điều 90, 91 và Nghị định 293/2025/NĐ-CP (lương không thấp hơn lương tối thiểu vùng), Luật Bảo vệ dữ liệu cá nhân
// 91/2025/QH15 và Nghị định 356/2025/NĐ-CP (xử lý dữ liệu cá nhân cần sự đồng ý của chủ thể, đúng mục đích đã nêu). Xác minh qua trí nhớ văn bản
// và bài tổng hợp, chưa đối chiếu bản gốc; danh sách cụm từ phân biệt đối xử chỉ là gợi ý, hệ thống cảnh báo chứ không chặn lưu vì có công việc
// pháp luật cho phép giới hạn (ví dụ công việc cấm dùng người chưa thành niên).

import { payrollParameters } from './payrollRules.mjs';

const DISCRIMINATORY_PATTERNS = [
  [/chỉ\s+(tuyển|nhận)\s+(nam|nữ)\b/i, 'giới tính'],
  [/giới\s+tính\s*:?\s*(nam|nữ)\b/i, 'giới tính'],
  [/\b(nam|nữ)\s+giới\b/i, 'giới tính'],
  [/(chưa\s+(lập\s+gia\s+đình|kết\s+hôn|có\s+con)|độc\s+thân)/i, 'tình trạng hôn nhân'],
  [/(không\s+(mang\s+thai|có\s+thai)|cam\s+kết\s+không\s+sinh\s+con)/i, 'tình trạng thai sản'],
  [/(dưới|không\s+quá|tối\s+đa)\s+\d{2}\s+tuổi|tuổi\s+(từ\s+)?\d{2}\s*(-|đến)\s*\d{2}|độ\s+tuổi\s*:?\s*\d{2}/i, 'độ tuổi'],
  [/không\s+(nhận|tuyển)\s+người\s+khuyết\s+tật/i, 'khuyết tật'],
  [/(dân\s+tộc\s+kinh|không\s+theo\s+tôn\s+giáo|theo\s+đạo)/i, 'dân tộc, tôn giáo'],
  [/ngoại\s+hình\s+(ưa\s+nhìn|đẹp|sáng)/i, 'ngoại hình'],
];

export function jobPostingWarnings(job) {
  const text = ['title', 'level', 'experienceReq', 'salaryRange', 'description', 'requirements'].map((field) => String(job[field] ?? '')).join(' \n ');
  const found = [...new Set(DISCRIMINATORY_PATTERNS.filter(([pattern]) => pattern.test(text)).map(([, label]) => label))];
  return found.length ? [`Tin tuyển dụng có yêu cầu về ${found.join(', ')} có thể là phân biệt đối xử theo Điều 3 khoản 8 và Điều 8 Bộ luật Lao động 2019; chỉ giữ khi pháp luật cho phép giới hạn đối với công việc này.`] : [];
}

export const WORK_REGIONS = ['I', 'II', 'III', 'IV'];

// Lương đề nghị phải từ lương tối thiểu vùng tại kỳ của ngày đề nghị; kỳ trước dữ liệu tham số thì không kiểm.
export function offerSalaryProblem(offerSalary, region, date) {
  if (!offerSalary) return '';
  if (!WORK_REGIONS.includes(region)) return 'Chọn vùng nơi làm việc (I đến IV) để đối chiếu lương tối thiểu vùng.';
  let minimum;
  try { minimum = payrollParameters(String(date).slice(0, 7), region).regionalMinimumWage; } catch { return ''; }
  return offerSalary < minimum ? `Lương đề nghị ${offerSalary.toLocaleString('vi-VN')} đồng thấp hơn lương tối thiểu vùng ${region} là ${minimum.toLocaleString('vi-VN')} đồng (Điều 90 Bộ luật Lao động 2019).` : '';
}
