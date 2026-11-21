import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jobPostingWarnings, offerSalaryProblem } from '../recruitmentRules.mjs';
import { rewardBonusByEmployee } from '../rewardRules.mjs';

test('tin tuyển dụng: cảnh báo cụm từ phân biệt đối xử, không cảnh báo yêu cầu nghề nghiệp', () => {
  assert.deepEqual(jobPostingWarnings({ title: 'Kế toán tổng hợp', experienceReq: 'Tốt nghiệp đại học kế toán, 3 năm kinh nghiệm, thành thạo Excel' }), []);
  assert.match(jobPostingWarnings({ title: 'Lễ tân', experienceReq: 'Nữ, ngoại hình ưa nhìn, độc thân' })[0], /tình trạng hôn nhân, ngoại hình/);
  assert.match(jobPostingWarnings({ title: 'Bảo vệ', experienceReq: 'Tuổi từ 25 - 40' })[0], /độ tuổi/);
  assert.match(jobPostingWarnings({ title: 'Công nhân', experienceReq: 'Không nhận người khuyết tật' })[0], /khuyết tật/);
});

test('lương đề nghị không thấp hơn lương tối thiểu vùng tại kỳ đề nghị', () => {
  assert.match(offerSalaryProblem(5_000_000, 'I', '2026-03-01'), /5\.310\.000/);
  assert.equal(offerSalaryProblem(5_000_000, 'I', '2025-03-01'), '');
  assert.equal(offerSalaryProblem(0, '', '2026-03-01'), '');
  assert.match(offerSalaryProblem(9_000_000, '', '2026-03-01'), /vùng/);
  assert.equal(offerSalaryProblem(9_000_000, 'IV', '2020-01-01'), '');
});

test('chỉ cộng thưởng đã trao trong kỳ, bằng tiền hoặc hiện vật, không gồm cổ phần thưởng', () => {
  const rewards = [
    { employeeId: 'a', status: 'Đã trao giải', awardedAt: '2026-11-05T02:00:00Z', rewardValue: 1_000_000, rewardCode: 'K1', rewardType: 'Tiền mặt & Cúp pha lê' },
    { employeeId: 'a', status: 'Đã trao giải', awardedAt: '2026-11-20T02:00:00Z', rewardValue: 2_000_000, rewardCode: 'K2', rewardType: 'Chuyến du lịch nghỉ dưỡng 5 sao' },
    { employeeId: 'a', status: 'Đã ký quyết định', awardedAt: '', rewardValue: 9_000_000, rewardCode: 'K3', rewardType: 'Tiền mặt & Cúp pha lê' },
    { employeeId: 'a', status: 'Đã trao giải', awardedAt: '2026-10-30T02:00:00Z', rewardValue: 4_000_000, rewardCode: 'K4', rewardType: 'Tiền mặt & Cúp pha lê' },
    { employeeId: 'a', status: 'Đã trao giải', awardedAt: '2026-11-10T02:00:00Z', rewardValue: 50_000_000, rewardCode: 'K5', rewardType: 'Cổ phần thưởng ESOP' },
  ];
  assert.deepEqual(rewardBonusByEmployee(rewards, '2026-11').get('a'), { amount: 3_000_000, codes: ['K1', 'K2'] });
  assert.equal(rewardBonusByEmployee(rewards, '2026-12').size, 0);
});
