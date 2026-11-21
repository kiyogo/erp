// Giữ khớp với disciplineRules.mjs ở legacy/api; tests/discipline-options.test.mjs so khớp hai bản.
export const DISCIPLINE_FORMS: Record<string, string> = {
  warning: 'Khiển trách',
  delay_raise: 'Kéo dài thời hạn nâng lương',
  demotion: 'Cách chức',
  dismissal: 'Sa thải',
};
export const VIOLATION_KINDS: Record<string, string> = {
  general: 'Vi phạm thông thường (thời hiệu 6 tháng)',
  financial: 'Liên quan trực tiếp đến tài chính, tài sản, bí mật công nghệ, bí mật kinh doanh (thời hiệu 12 tháng)',
};
export const DISMISSAL_GROUNDS: Record<string, string> = {
  misconduct: 'Trộm cắp, tham ô, đánh bạc, cố ý gây thương tích, sử dụng ma túy tại nơi làm việc, tiết lộ bí mật, hành vi gây thiệt hại hoặc xâm hại tình dục',
  repeat: 'Tái phạm trong thời gian chưa xóa kỷ luật (đã bị kéo dài thời hạn nâng lương hoặc cách chức)',
  damage: 'Gây thiệt hại nghiêm trọng hoặc đe dọa gây thiệt hại đặc biệt nghiêm trọng',
  absence: 'Tự ý bỏ việc 5 ngày cộng dồn trong 30 ngày hoặc 20 ngày cộng dồn trong 365 ngày không có lý do chính đáng',
};
export const PROTECTED_STATUSES: Record<string, string> = {
  none: 'Không thuộc trường hợp được bảo vệ',
  sick_leave: 'Đang nghỉ ốm đau, điều dưỡng hoặc nghỉ việc được người sử dụng lao động đồng ý',
  detained: 'Đang bị tạm giữ, tạm giam',
  pending_investigation: 'Đang chờ cơ quan có thẩm quyền xác minh, kết luận',
  pregnant_or_maternity: 'Lao động nữ mang thai hoặc đang nghỉ thai sản',
  child_under_12_months: 'Đang nuôi con dưới 12 tháng tuổi',
  cognitive_impairment: 'Mắc bệnh tâm thần hoặc bệnh khác làm mất khả năng nhận thức',
};
export const DISCIPLINE_ATTENDANCE: Record<string, string> = {
  attended: 'Người lao động có mặt và tự bào chữa',
  refused: 'Đã thông báo 3 lần nhưng người lao động không có mặt',
};
const toOptions = (map: Record<string, string>) => Object.entries(map).map(([value, label]) => ({ value, label }));
export const DISCIPLINE_FORM_OPTIONS = toOptions(DISCIPLINE_FORMS);
export const VIOLATION_KIND_OPTIONS = toOptions(VIOLATION_KINDS);
export const DISMISSAL_GROUND_OPTIONS = toOptions(DISMISSAL_GROUNDS);
export const PROTECTED_STATUS_OPTIONS = toOptions(PROTECTED_STATUSES);
export const DISCIPLINE_ATTENDANCE_OPTIONS = toOptions(DISCIPLINE_ATTENDANCE);
