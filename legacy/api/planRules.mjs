// Kiểm tra phía máy chủ cho kế hoạch chiến lược (plan_items), mốc quan trọng (plan_milestones) và tiến độ thực hiện (plan_progress).
// Các quy tắc lặp lại bản ở web (legacy/web/src/modules/plans/plan*Rules.ts) để dữ liệu gửi thẳng vào API cũng không vượt qua được.
// Đây là quy tắc quản trị nội bộ, không có căn cứ pháp luật riêng; ngân sách kế hoạch chưa đối chiếu với ngân sách tài chính.

export const PLAN_PRIORITIES = ['Chiến lược cấp 1', 'Trọng điểm cấp 2', 'Thường xuyên'];
export const PLAN_STATUSES = ['Đang triển khai', 'Đã phê duyệt', 'Đã hoàn thành'];
export const MILESTONE_STATUSES = ['Đã đạt mốc', 'Đang thực hiện', 'Chưa bắt đầu'];

const text = (value, label, max = 300) => {
  const result = String(value ?? '').trim();
  if (!result) throw new Error(`${label} là bắt buộc.`);
  if (result.length > max) throw new Error(`${label} dài tối đa ${max} ký tự.`);
  return result;
};

function isoDate(value, label) {
  const result = String(value ?? '').trim();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(result) && new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) === result;
  if (!valid) throw new Error(`${label} không hợp lệ.`);
  return result;
}

const percent = (value, label) => {
  const result = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isInteger(result) || result < 0 || result > 100) throw new Error(`${label} phải là số nguyên từ 0 đến 100.`);
  return result;
};

export function quarterOf(date) {
  return `Q${Math.ceil(Number(date.slice(5, 7)) / 3)}/${date.slice(0, 4)}`;
}

export function validatePlanRecord(scope, input, today) {
  const record = { ...input };
  if (scope === 'plan_items') {
    record.code = text(record.code, 'Mã kế hoạch', 80);
    record.name = text(record.name, 'Tên kế hoạch');
    record.department = text(record.department, 'Đơn vị', 160);
    record.manager = text(record.manager, 'Chủ nhiệm', 160);
    record.startDate = isoDate(record.startDate, 'Ngày bắt đầu');
    record.endDate = isoDate(record.endDate, 'Ngày kết thúc');
    if (record.startDate > record.endDate) throw new Error('Ngày kết thúc không được trước ngày bắt đầu.');
    const budget = Number(record.budget ?? 0);
    if (!Number.isSafeInteger(budget) || budget < 0) throw new Error('Ngân sách phải là số nguyên không âm.');
    record.budget = budget;
    if (!PLAN_PRIORITIES.includes(record.priority)) throw new Error('Cấp độ ưu tiên không hợp lệ.');
    record.status = record.status || 'Đang triển khai';
    if (!PLAN_STATUSES.includes(record.status)) throw new Error('Trạng thái kế hoạch không hợp lệ.');
  } else if (scope === 'plan_milestones') {
    record.code = text(record.code, 'Mã mốc', 80);
    record.name = text(record.name, 'Tên mốc');
    record.acceptanceCriteria = text(record.acceptanceCriteria, 'Tiêu chuẩn nghiệm thu', 2000);
    record.owner = text(record.owner, 'Người phụ trách', 160);
    record.deadline = isoDate(record.deadline, 'Hạn hoàn thành');
    if (record.quarter !== quarterOf(record.deadline)) throw new Error('Kỳ quý phải khớp với hạn hoàn thành.');
    record.progress = percent(record.progress ?? 0, 'Tiến độ');
    record.status = record.status || 'Chưa bắt đầu';
    if (!MILESTONE_STATUSES.includes(record.status)) throw new Error('Trạng thái mốc không hợp lệ.');
    if ((record.status === 'Đã đạt mốc') !== (record.progress === 100)) throw new Error('Mốc đã đạt phải có tiến độ 100% và ngược lại.');
  } else if (scope === 'plan_progress') {
    record.code = text(record.code, 'Mã nhiệm vụ', 80);
    record.planName = text(record.planName, 'Kế hoạch');
    record.taskTitle = text(record.taskTitle, 'Hạng mục');
    record.assignee = text(record.assignee, 'Người phụ trách', 160);
    record.dueDate = isoDate(record.dueDate, 'Hạn chót');
    record.progressPercent = percent(record.progressPercent ?? 0, 'Tiến độ');
    const weight = Number(record.weightPercent ?? 0);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) throw new Error('Tỷ trọng phải lớn hơn 0 và không quá 100%.');
    record.weightPercent = weight;
    // Trạng thái do máy chủ tính từ tiến độ và hạn chót, không nhận giá trị gửi lên.
    record.status = record.progressPercent === 100 ? 'Hoàn thành' : record.dueDate < today ? 'Chậm tiến độ' : 'Đúng tiến độ';
    delete record.daysRemaining;
  }
  return record;
}
