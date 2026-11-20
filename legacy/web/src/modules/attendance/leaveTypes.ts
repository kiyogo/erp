// Danh mục loại nghỉ, khớp LEAVE_TYPES ở legacy/api/attendanceRules.mjs (test tests/leave-types.test.mjs so khớp).
export const LEAVE_TYPE_LABELS = [
  'Nghỉ phép năm',
  'Nghỉ ốm BHXH',
  'Nghỉ kết hôn',
  'Nghỉ khi con kết hôn',
  'Nghỉ tang cha mẹ, vợ chồng, con',
  'Nghỉ việc riêng 1 ngày không lương',
  'Nghỉ thai sản',
  'Nghỉ chăm vợ sinh con',
  'Nghỉ không lương',
  'Nghỉ việc riêng có lương',
];

export const LEAVE_TYPE_OPTIONS = LEAVE_TYPE_LABELS.map((label) => ({ label, value: label }));
