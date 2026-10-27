import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAllocationAssetUpdate, buildRepairAssetUpdate, findAssetByCode } from '../src/modules/assets/assetOperations.ts';

test('asset lookup is case-insensitive and refuses missing or ambiguous codes', () => {
  const asset = { key: '1', code: 'LT-01', status: 'Trong kho' };
  assert.equal(findAssetByCode([asset], ' lt-01 '), asset);
  assert.throws(() => findAssetByCode([asset], 'missing'), /Không tìm thấy/);
  assert.throws(() => findAssetByCode([asset, { ...asset, key: '2' }], 'LT-01'), /bị trùng/);
});

test('allocation and return update the asset custodian and append an audit history entry', () => {
  const asset = { key: '1', code: 'LT-01', status: 'Trong kho', assignedTo: '', history: [] };
  const assigned = buildAllocationAssetUpdate(asset, 'Cấp phát', 'Nguyễn An', 'IT', 'Admin', '2026-10-26', 'CP-1', 'Tốt');
  assert.equal(assigned.status, 'Đang sử dụng');
  assert.equal(assigned.assignedTo, 'Nguyễn An');
  assert.equal(assigned.history.length, 1);
  const returned = buildAllocationAssetUpdate(assigned, 'Thu hồi', 'Nguyễn An', 'IT', 'Admin', '2026-10-27', 'TH-1', 'Đủ phụ kiện');
  assert.equal(returned.status, 'Trong kho');
  assert.equal(returned.assignedTo, '');
  assert.equal(returned.history.length, 2);
});

test('allocation and repair reject unavailable or conflicting assets', () => {
  assert.throws(() => buildAllocationAssetUpdate({ status: 'Đang sửa chữa' }, 'Cấp phát', 'An', 'IT', 'Admin', 'date', 'CP-1', 'OK'), /đang ở kho/);
  assert.throws(() => buildAllocationAssetUpdate({ status: 'Đang sử dụng', assignedTo: 'An' }, 'Cấp phát', 'An', 'IT', 'Admin', 'date', 'CP-1', 'OK'), /đang ở kho/);
  assert.throws(() => buildAllocationAssetUpdate({ status: 'Đang sử dụng', assignedTo: 'Bình' }, 'Thu hồi', 'An', 'IT', 'Admin', 'date', 'TH-1', 'OK'), /không khớp/);
  assert.throws(() => buildAllocationAssetUpdate({ status: 'Trong kho', assignedTo: '' }, 'Thu hồi', 'An', 'IT', 'Admin', 'date', 'TH-1', 'OK'), /đã ở trong kho/);
  assert.throws(() => buildAllocationAssetUpdate({ status: 'Đang sửa chữa', assignedTo: 'An' }, 'Thu hồi', 'An', 'IT', 'Admin', 'date', 'TH-2', 'OK'), /đang sử dụng/);
  assert.throws(() => buildRepairAssetUpdate({ status: 'Đang sửa chữa' }, 'Admin', 'date', 'SC-2', 'Bắt đầu sửa chữa', 'hỏng'), /đang có trạng thái sửa chữa/);
  assert.throws(() => buildRepairAssetUpdate({ status: 'Đã thanh lý' }, 'Admin', 'date', 'SC-2', 'Hoàn tất sửa chữa', 'đạt'), /đã thanh lý/);
});

test('repair lifecycle preserves assigned status after completion and records history', () => {
  const asset = { key: '1', status: 'Đang sử dụng', assignedTo: 'Nguyễn An', history: [] };
  const repairing = buildRepairAssetUpdate(asset, 'Admin', '2026-10-26', 'SC-1', 'Bắt đầu sửa chữa', 'Lập phiếu');
  assert.equal(repairing.status, 'Đang sửa chữa');
  const repaired = buildRepairAssetUpdate(repairing, 'Admin', '2026-10-28', 'SC-1', 'Hoàn tất sửa chữa', 'Đã nghiệm thu');
  assert.equal(repaired.status, 'Đang sử dụng');
  assert.equal(repaired.history.length, 2);
});

test('repair waiting parts stays out of service and an unrepairable asset goes to the disposal queue', () => {
  const asset = { key: '1', status: 'Đang sửa chữa', assignedTo: 'Nguyễn An', history: [] };
  const waiting = buildRepairAssetUpdate(asset, 'Admin', '2026-10-26', 'SC-1', 'Chờ linh kiện thay thế', 'Đã đặt linh kiện');
  assert.equal(waiting.status, 'Đang sửa chữa');
  const disposal = buildRepairAssetUpdate(waiting, 'Admin', '2026-10-27', 'SC-1', 'Không thể sửa chữa', 'Nhà cung cấp xác nhận ngừng linh kiện');
  assert.equal(disposal.status, 'Chờ thanh lý');
  assert.equal(disposal.history.length, 2);
});
