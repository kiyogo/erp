import assert from 'node:assert/strict';
import { test } from 'node:test';
import { customerFeedbackExportRows, customerFeedbackMetrics } from '../src/modules/crm/customerFeedbackRules.ts';

test('feedback metrics use rated records and exclude resolved urgent cases from the open count', () => {
  const metrics = customerFeedbackMetrics([
    { rating: 5, status: 'Đã giải quyết thỏa đáng', priority: 'Khẩn cấp' },
    { rating: 3, status: 'Đang xử lý', priority: 'Khẩn cấp' },
    { rating: null, status: 'Đang xử lý', priority: 'Cao' },
  ]);
  assert.equal(metrics.feedbackCount, 3);
  assert.equal(metrics.averageRating, 4);
  assert.equal(metrics.resolvedCount, 1);
  assert.equal(metrics.resolutionRate, 33);
  assert.equal(metrics.inProgressCount, 2);
  assert.equal(metrics.urgentCount, 1);
});

test('empty feedback metrics remain empty instead of reporting invented percentages', () => {
  assert.deepEqual(customerFeedbackMetrics([]), {
    feedbackCount: 0,
    averageRating: null,
    resolvedCount: 0,
    resolutionRate: null,
    inProgressCount: 0,
    urgentCount: 0,
  });
});

test('feedback export includes the selected records and leaves missing ratings blank', () => {
  const rows = customerFeedbackExportRows([{
    feedbackCode: 'FB-1', receivedDate: '2026-10-27', clientName: 'Khách A', contactPerson: '', phone: '',
    serviceName: 'Cloud', rating: null, priority: 'Cao', assignedStaff: 'Nhân viên A', status: 'Đang xử lý', resolutionAction: '',
  }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'FB-1');
  assert.equal(rows[1][6], '');
});
