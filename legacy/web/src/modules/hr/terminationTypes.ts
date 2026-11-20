// Giữ khớp với TERMINATION_TYPES trong legacy/api/terminationRules.mjs; tests/termination-types.test.mjs so khớp hai bản.
export const TERMINATION_TYPES: Record<string, string> = {
  mutual: 'Hai bên thỏa thuận (Điều 34 khoản 3)',
  expiry: 'Hết hạn hợp đồng (Điều 34 khoản 1)',
  completed: 'Hoàn thành công việc theo hợp đồng (Điều 34 khoản 2)',
  employee_unilateral: 'Người lao động đơn phương chấm dứt (Điều 35)',
  employer_unilateral: 'Người sử dụng lao động đơn phương chấm dứt (Điều 36)',
  restructuring: 'Thay đổi cơ cấu, công nghệ, lý do kinh tế (Điều 42, 43)',
  discipline: 'Sa thải (Điều 125)',
  retirement: 'Nghỉ hưu',
};
export const TERMINATION_TYPE_OPTIONS = Object.entries(TERMINATION_TYPES).map(([value, label]) => ({ value, label }));
