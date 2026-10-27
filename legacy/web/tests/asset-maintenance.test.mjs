import test from 'node:test';
import assert from 'node:assert/strict';
import { addMaintenanceCycle, deriveMaintenanceStatus, MAINTENANCE_CHECKLIST, validateMaintenanceCompletion } from '../src/modules/assets/assetMaintenanceRules.ts';

test('maintenance plan status is derived from the next due date', () => {
  assert.equal(deriveMaintenanceStatus('2026-10-26', '2026-10-27'), 'Quá hạn bảo dưỡng');
  assert.equal(deriveMaintenanceStatus('2026-11-03', '2026-10-27'), 'Sắp đến hạn');
  assert.equal(deriveMaintenanceStatus('2026-11-04', '2026-10-27'), 'Đã lên lịch');
});

test('maintenance cycle is calculated from the recorded completion date', () => {
  assert.equal(addMaintenanceCycle('2026-10-27', 'Hàng tháng'), '2026-11-26');
  assert.equal(addMaintenanceCycle('2026-10-27', 'Hàng quý (3 tháng)'), '2027-01-25');
  assert.equal(addMaintenanceCycle('2026-10-27', 'Định kỳ 6 tháng'), '2027-04-25');
  assert.equal(addMaintenanceCycle('2026-10-27', 'Hàng năm'), '2027-10-27');
  assert.throws(() => addMaintenanceCycle('invalid', 'Hàng tháng'), /Ngày thực hiện/);
});

test('maintenance completion requires a real date, finished checklist and explicit measurements', () => {
  const checklist = MAINTENANCE_CHECKLIST.map((item) => ({ item, done: true }));
  assert.throws(() => validateMaintenanceCompletion({ performedDate: '2026-10-27', today: '2026-10-27', checklist: [{ ...checklist[0], done: false }], healthScore: 90, actualCost: 0, notes: '' }), /checklist/);
  assert.throws(() => validateMaintenanceCompletion({ performedDate: '2026-10-27', today: '2026-10-27', checklist, healthScore: '', actualCost: 0, notes: '' }), /điểm sức khỏe/);
  assert.throws(() => validateMaintenanceCompletion({ performedDate: '2026-10-27', today: '2026-10-27', checklist, healthScore: 90, actualCost: '', notes: '' }), /chi phí thực tế/);
  assert.throws(() => validateMaintenanceCompletion({ performedDate: '2026-10-28', today: '2026-10-27', checklist, healthScore: 90, actualCost: 0, notes: '' }), /tương lai/);
  assert.deepEqual(validateMaintenanceCompletion({ performedDate: '2026-10-27', today: '2026-10-27', checklist, healthScore: '87', actualCost: '0', notes: '  Đã ghi biên bản.  ' }), {
    performedDate: '2026-10-27', healthScore: 87, actualCost: 0, notes: 'Đã ghi biên bản.',
  });
});
