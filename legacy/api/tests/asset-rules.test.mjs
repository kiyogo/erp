import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { assetClassProblem, assetLifeProblem, assetTaxWarnings, costBreakdownProblem, taxDeductibleCost } from '../assetRules.mjs';
import { startServer } from './helpers/server.mjs';

test('khung thời gian khấu hao theo nhóm tài sản (Thông tư 45/2013)', () => {
  assert.equal(assetLifeProblem('building_solid', 600), '');
  assert.equal(assetLifeProblem('building_solid', 300), '');
  assert.match(assetLifeProblem('building_solid', 240), /300 đến 600/);
  assert.equal(assetLifeProblem('management_it', 36), '');
  assert.match(assetLifeProblem('management_it', 24), /36 đến 96/);
  assert.equal(assetLifeProblem('management_it', 24, true), '', 'tài sản đã qua sử dụng được dưới mức tối thiểu');
  assert.match(assetLifeProblem('management_it', 120, true), /ngoài khung/);
  assert.equal(assetLifeProblem('', 7), '');
  assert.match(assetLifeProblem('khong-co', 12), /không hợp lệ/);
});

test('tài sản cố định cần nguyên giá từ 30 triệu, cấu thành nguyên giá phải khớp', () => {
  assert.equal(assetClassProblem('Tài sản cố định hữu hình', 30_000_000), '');
  assert.match(assetClassProblem('Tài sản cố định hữu hình', 29_999_999), /công cụ dụng cụ/);
  assert.equal(assetClassProblem('Công cụ dụng cụ', 5_000_000), '');
  assert.equal(assetClassProblem('', 1), '');
  assert.equal(costBreakdownProblem({}, 100), '');
  assert.equal(costBreakdownProblem({ purchasePrice: 90, installCost: 10 }, 100), '');
  assert.match(costBreakdownProblem({ purchasePrice: 90 }, 100), /khác nguyên giá/);
});

test('ô tô từ 9 chỗ trở xuống: khấu hao phần vượt 1,6 tỷ không được trừ thuế, trừ xe kinh doanh vận tải', () => {
  const car = { originalPrice: 2_500_000_000, vehicleSeats: 5, lifeGroup: 'transport_road', assetClass: 'Tài sản cố định hữu hình' };
  assert.equal(taxDeductibleCost(car), 1_600_000_000);
  assert.equal(taxDeductibleCost({ ...car, vehicleSeats: 16 }), 2_500_000_000);
  assert.equal(taxDeductibleCost({ ...car, transportBusiness: true }), 2_500_000_000);
  assert.equal(taxDeductibleCost({ ...car, originalPrice: 1_000_000_000 }), 1_000_000_000);
  assert.equal(assetTaxWarnings({ originalPrice: 100, taxCost: 100, ownershipProof: 'Hóa đơn' }).length, 0);
  assert.equal(assetTaxWarnings({ originalPrice: 2_500_000_000, taxCost: 1_600_000_000, ownershipProof: '' }).length, 2);
});

const server = await startServer('assetrules');
after(server.stop);
const { admin, call } = server;
const asset = (key, extra = {}) => ({ record: { key, code: key.toUpperCase(), name: 'Tài sản kiểm thử', category: 'Thiết bị IT', purchaseDate: '2026-03-01', originalPrice: 35_000_000, depreciationMonths: 36, status: 'Đang sử dụng', department: 'Kế toán', ...extra } });

test('danh mục tài sản kiểm tra phân loại, khung khấu hao và tính nguyên giá được trừ thuế ở máy chủ', async () => {
  const ok = await call(admin, '/collections/asset_items', 'POST', asset('ts-ok', { assetClass: 'Tài sản cố định hữu hình', usefulLifeGroup: 'management_it', ownershipProof: 'Hóa đơn 0001234' }));
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.record.taxDeductibleCost, 35_000_000);
  assert.deepEqual(ok.body.record.taxWarnings, []);
  const noProof = await call(admin, '/collections/asset_items', 'POST', asset('ts-noproof'));
  assert.equal(noProof.status, 201);
  assert.equal(noProof.body.record.taxWarnings.length, 1);
  assert.equal((await call(admin, '/collections/asset_items', 'POST', asset('ts-small', { assetClass: 'Tài sản cố định hữu hình', originalPrice: 20_000_000 }))).status, 422);
  assert.equal((await call(admin, '/collections/asset_items', 'POST', asset('ts-life', { usefulLifeGroup: 'management_it', depreciationMonths: 12 }))).status, 422);
  assert.equal((await call(admin, '/collections/asset_items', 'POST', asset('ts-used', { usefulLifeGroup: 'management_it', depreciationMonths: 12, usedAsset: true }))).status, 201);
  assert.equal((await call(admin, '/collections/asset_items', 'POST', asset('ts-cost', { purchasePrice: 30_000_000 }))).status, 422);
  assert.equal((await call(admin, '/collections/asset_items', 'POST', asset('ts-cost-ok', { purchasePrice: 30_000_000, installCost: 5_000_000 }))).status, 201);
  assert.equal((await call(admin, '/collections/asset_items', 'POST', asset('ts-warranty', { warrantyExpiry: '2026-01-01' }))).status, 422);
  assert.equal((await call(admin, '/collections/asset_items', 'POST', asset('ts-future', { purchaseDate: '2999-01-01' }))).status, 422);
  const car = await call(admin, '/collections/asset_items', 'POST', asset('ts-car', { category: 'Phương tiện & Vận chuyển', originalPrice: 2_500_000_000, depreciationMonths: 120, usefulLifeGroup: 'transport_road', vehicleSeats: 5, registrationNumber: '30A-123.45', ownershipProof: 'Giấy đăng ký xe' }));
  assert.equal(car.status, 201, JSON.stringify(car.body));
  assert.equal(car.body.record.taxDeductibleCost, 1_600_000_000);
  assert.equal(car.body.record.taxWarnings.length, 1);
  assert.equal((await call(admin, '/collections/asset_items', 'POST', asset('ts-building', { originalPrice: 6_000_000_000, depreciationMonths: 600, usefulLifeGroup: 'building_solid', ownershipProof: 'Giấy chứng nhận' }))).status, 201);
});
