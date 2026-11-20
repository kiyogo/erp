import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quarterOf, validatePlanRecord } from '../planRules.mjs';

const plan = { code: 'KH-1', name: 'Mở rộng thị trường', department: 'Kinh doanh', manager: 'An', startDate: '2026-01-01', endDate: '2026-12-31', budget: 1000000, priority: 'Thường xuyên' };

test('kế hoạch: ngày, ngân sách và cấp ưu tiên', () => {
  assert.equal(validatePlanRecord('plan_items', plan, '2026-11-21').status, 'Đang triển khai');
  assert.throws(() => validatePlanRecord('plan_items', { ...plan, endDate: '2025-12-31' }, '2026-11-21'), /Ngày kết thúc/);
  assert.throws(() => validatePlanRecord('plan_items', { ...plan, startDate: '2026-02-30' }, '2026-11-21'), /Ngày bắt đầu/);
  assert.throws(() => validatePlanRecord('plan_items', { ...plan, budget: -1 }, '2026-11-21'), /Ngân sách/);
  assert.throws(() => validatePlanRecord('plan_items', { ...plan, budget: 1.5 }, '2026-11-21'), /Ngân sách/);
  assert.throws(() => validatePlanRecord('plan_items', { ...plan, priority: 'Khác' }, '2026-11-21'), /ưu tiên/);
  assert.throws(() => validatePlanRecord('plan_items', { ...plan, name: ' ' }, '2026-11-21'), /Tên kế hoạch/);
});

test('mốc: quý khớp hạn và tiến độ khớp trạng thái', () => {
  const milestone = { code: 'M-1', name: 'Ra mắt', acceptanceCriteria: 'Đạt 100 khách', owner: 'An', deadline: '2026-08-15', quarter: 'Q3/2026', progress: 0 };
  assert.equal(quarterOf('2026-08-15'), 'Q3/2026');
  assert.equal(validatePlanRecord('plan_milestones', milestone, '2026-11-21').status, 'Chưa bắt đầu');
  assert.throws(() => validatePlanRecord('plan_milestones', { ...milestone, quarter: 'Q4/2026' }, '2026-11-21'), /Kỳ quý/);
  assert.throws(() => validatePlanRecord('plan_milestones', { ...milestone, status: 'Đã đạt mốc', progress: 50 }, '2026-11-21'), /100%/);
  assert.throws(() => validatePlanRecord('plan_milestones', { ...milestone, progress: 100 }, '2026-11-21'), /100%/);
  assert.equal(validatePlanRecord('plan_milestones', { ...milestone, status: 'Đã đạt mốc', progress: 100 }, '2026-11-21').status, 'Đã đạt mốc');
});

test('tiến độ: trạng thái do máy chủ tính từ tiến độ và hạn chót', () => {
  const row = { code: 'T-1', planName: 'KH-1', taskTitle: 'Thiết kế', assignee: 'An', dueDate: '2026-11-20', progressPercent: 40, weightPercent: 25, status: 'Hoàn thành' };
  assert.equal(validatePlanRecord('plan_progress', row, '2026-11-21').status, 'Chậm tiến độ');
  assert.equal(validatePlanRecord('plan_progress', { ...row, dueDate: '2026-11-21' }, '2026-11-21').status, 'Đúng tiến độ');
  assert.equal(validatePlanRecord('plan_progress', { ...row, progressPercent: 100 }, '2026-11-21').status, 'Hoàn thành');
  assert.throws(() => validatePlanRecord('plan_progress', { ...row, progressPercent: 101 }, '2026-11-21'), /0 đến 100/);
  assert.throws(() => validatePlanRecord('plan_progress', { ...row, weightPercent: 0 }, '2026-11-21'), /Tỷ trọng/);
});
