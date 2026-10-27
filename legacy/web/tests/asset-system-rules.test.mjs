import test from 'node:test';
import assert from 'node:assert/strict';
import { findAllocationQuotaRule, findCodePattern, findDepreciationDefault, generateAssetCode, getAssetSystemOptions, isValidAssetCodePattern } from '../src/modules/assets/assetSystemRules.ts';

const rule = (values = {}) => ({ key: 'rule-1', status: 'Đang áp dụng', ...values });

test('asset depreciation defaults apply only to one exact active category rule', () => {
  const category = 'Thiết bị IT';
  assert.equal(findDepreciationDefault([
    rule({ category: 'Nhóm & Loại tài sản', name: category, depreciationMonthsDefault: 36 }),
    rule({ key: 'paused', category: 'Nhóm & Loại tài sản', name: category, depreciationMonthsDefault: 48, status: 'Tạm ngưng' }),
  ], category), 36);
  assert.equal(findDepreciationDefault([
    rule({ category: 'Nhóm & Loại tài sản', name: category, depreciationMonthsDefault: 36 }),
    rule({ key: 'duplicate', category: 'Nhóm & Loại tài sản', details: category, depreciationMonthsDefault: 48 }),
  ], category), undefined);
  assert.equal(findDepreciationDefault([rule({ category: 'Nhóm & Loại tài sản', name: 'Thiết bị', depreciationMonthsDefault: 36 })], category), undefined);
});

test('asset code pattern chooses a unique applicable active rule', () => {
  const first = rule({ category: 'Quy tắc sinh mã tự động', name: 'Thiết bị IT', prefixPattern: 'IT-{YYYY}-{####}' });
  const second = rule({ key: 'second', category: 'Quy tắc sinh mã tự động', name: 'Máy chủ', prefixPattern: 'SRV-{YYYY}-{####}' });
  assert.equal(findCodePattern([first, second], 'Thiết bị IT'), first.prefixPattern);
  assert.equal(findCodePattern([first, second], 'Nội thất văn phòng'), undefined);
  assert.equal(findCodePattern([first], 'Nội thất văn phòng'), first.prefixPattern);
  assert.equal(findCodePattern([{ ...first, status: 'Tạm ngưng' }], 'Thiết bị IT'), undefined);
});

test('asset code generation skips codes already assigned without reusing a sequence', () => {
  const pattern = 'TS-{YYYY}-{####}';
  assert.equal(generateAssetCode(pattern, 2026, ['TS-2026-0001', 'ts-2026-0002'], () => 'fallback'), 'TS-2026-0003');
  assert.equal(generateAssetCode(undefined, 2026, [], () => 'fallback'), 'fallback');
  assert.equal(isValidAssetCodePattern('TS-{YYYY}-{####}'), true);
  assert.equal(isValidAssetCodePattern('TS-{YYYY}-{YYYY}-{####}'), false);
  assert.equal(isValidAssetCodePattern('TS-{YYYY}-{####}-{MM}'), false);
});

test('asset location and supplier suggestions come from unique active configurations', () => {
  const rules = [
    rule({ category: 'Nhà cung cấp', name: 'Công ty A' }),
    rule({ key: 'duplicate', category: 'Nhà cung cấp', name: '  công ty a  ' }),
    rule({ key: 'inactive', category: 'Nhà cung cấp', name: 'Công ty cũ', status: 'Tạm ngưng' }),
    rule({ key: 'location', category: 'Vị trí & Tủ Rack', name: 'Tủ rack A' }),
  ];
  assert.deepEqual(getAssetSystemOptions(rules, 'Nhà cung cấp'), ['Công ty A']);
  assert.deepEqual(getAssetSystemOptions(rules, 'Vị trí & Tủ Rack'), ['Tủ rack A']);
});

test('allocation quota guidance requires an exact active role and company or department scope', () => {
  const companyRule = rule({ category: 'Định mức cấp phát chức danh', allocatedRole: 'Kỹ sư IT', scope: 'Toàn công ty', budgetLimit: 30000000, standardPackage: 'Laptop' });
  const departmentRule = rule({ key: 'department-rule', category: 'Định mức cấp phát chức danh', allocatedRole: 'Kế toán', scope: 'Phòng Tài chính', budgetLimit: 20000000 });
  assert.equal(findAllocationQuotaRule([companyRule], 'Kỹ sư IT', 'Phòng IT'), companyRule);
  assert.equal(findAllocationQuotaRule([departmentRule], 'Kế toán', 'Phòng Tài chính'), departmentRule);
  assert.equal(findAllocationQuotaRule([departmentRule], 'Kế toán', 'Phòng Kế toán'), undefined);
  assert.equal(findAllocationQuotaRule([companyRule, { ...companyRule, key: 'duplicate' }], 'Kỹ sư IT', 'Phòng IT'), undefined);
});
