import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dependentClaimConflict, identityProblems, normalizeFamilyMembers } from '../employeeRules.mjs';
import { countActiveDependents } from '../payrollRules.mjs';

const today = '2026-11-21';
const child = { id: 'c1', name: 'Con nhỏ', relation: 'Con đẻ', gender: 'Nam', birthDate: '2018-05-01', idNumber: '001218000123', isDependent: true, dependentStartDate: '2026-01-01' };
const normalize = (members, previous = [], trusted = true) => normalizeFamilyMembers(members, previous, { trusted, today });

test('giấy tờ và ngày sinh chỉ kiểm giá trị đã đổi', () => {
  assert.equal(identityProblems({ idNumber: '001234567890' }, {}, today), '');
  assert.match(identityProblems({ idNumber: '12345' }, {}, today), /12 chữ số/);
  assert.equal(identityProblems({ idNumber: '12345' }, { idNumber: '12345' }, today), '');
  assert.match(identityProblems({ birthDate: '2015-01-01' }, {}, today), /15 tuổi/);
  assert.match(identityProblems({ birthDate: '2999-01-01' }, {}, today), /tương lai/);
  assert.equal(identityProblems({ birthDate: '1990-01-01' }, {}, today), '');
  assert.match(identityProblems({ taxCode: '123' }, {}, today), /Mã số thuế/);
  assert.equal(identityProblems({ taxCode: '001234567890' }, {}, today), '');
  assert.match(identityProblems({ insuranceNumber: '12' }, {}, today), /bảo hiểm/);
  assert.equal(identityProblems({ insuranceNumber: '0123456789' }, {}, today), '');
});

test('người phụ thuộc: con nhỏ hợp lệ, thiếu định danh hoặc ngày bị chặn', () => {
  assert.equal(normalize([child])[0].dependentVerified, true);
  assert.throws(() => normalize([{ ...child, idNumber: '' }]), /mã số thuế hoặc số căn cước/);
  assert.throws(() => normalize([{ ...child, dependentStartDate: '' }]), /ngày bắt đầu/);
  assert.throws(() => normalize([{ ...child, dependentEndDate: '2025-12-01' }]), /không được trước/);
  assert.throws(() => normalize([{ ...child, birthDate: '' }]), /ngày sinh/);
  assert.throws(() => normalize([child, { ...child, id: 'c2' }]), /khai trùng/);
});

test('người phụ thuộc: điều kiện theo tuổi và căn cứ', () => {
  const adultChild = { ...child, birthDate: '2000-01-01' };
  assert.throws(() => normalize([adultChild]), /từ đủ 18 tuổi/);
  assert.equal(normalize([{ ...adultChild, dependentBasis: 'student' }])[0].isDependent, true);
  const father = { id: 'p1', name: 'Bố', relation: 'Bố đẻ', gender: 'Nam', birthDate: '1960-01-01', idNumber: '001060000111', isDependent: true, dependentStartDate: '2026-01-01' };
  assert.throws(() => normalize([father]), /ngoài độ tuổi lao động/);
  assert.equal(normalize([{ ...father, dependentBasis: 'low_income' }])[0].isDependent, true);
  assert.throws(() => normalize([{ ...father, birthDate: '1990-01-01', dependentBasis: 'low_income' }]), /trong độ tuổi lao động/);
  assert.equal(normalize([{ ...father, birthDate: '1990-01-01', dependentBasis: 'disabled' }])[0].isDependent, true);
  const mother = { ...father, id: 'p2', name: 'Mẹ', relation: 'Mẹ đẻ', gender: 'Nữ', birthDate: '1970-12-01', idNumber: '001070000222', dependentBasis: 'low_income' };
  assert.equal(normalize([mother])[0].isDependent, true);
});

test('nhân viên tự khai thì chờ xác minh, quản trị viên xác nhận, người không đổi giữ nguyên', () => {
  const selfDeclared = normalize([child], [], false)[0];
  assert.equal(selfDeclared.dependentVerified, false);
  assert.equal(normalize([{ ...selfDeclared, dependentVerified: true }], [selfDeclared], false)[0].dependentVerified, false);
  const confirmed = normalize([{ ...selfDeclared, dependentVerified: true }], [selfDeclared], true)[0];
  assert.equal(confirmed.dependentVerified, true);
  assert.equal(normalize([{ ...confirmed, dependentVerified: false }], [confirmed], false)[0].dependentVerified, true);
  assert.equal(normalize([{ ...confirmed, idNumber: '001218000999' }], [confirmed], false)[0].dependentVerified, false);
  // hồ sơ cũ không đủ thông tin vẫn lưu được khi không đổi
  const legacy = { id: 'old', name: 'Con', relation: 'Con', isDependent: true, dependentStartDate: '2026-01-01' };
  assert.equal(normalize([legacy], [legacy])[0].name, 'Con');
});

test('một người phụ thuộc chỉ tính cho một người nộp thuế trong cùng thời gian', () => {
  const others = [{ label: 'An (E1)', members: [{ ...child, id: 'x', dependentStartDate: '2025-01-01', dependentEndDate: '2026-06-30' }] }];
  assert.match(dependentClaimConflict([child], others), /An \(E1\)/);
  assert.equal(dependentClaimConflict([{ ...child, dependentStartDate: '2026-07-01' }], others), '');
  assert.equal(dependentClaimConflict([{ ...child, idNumber: '001218000777' }], others), '');
});

test('lương chỉ tính người phụ thuộc chưa bị đánh dấu chờ xác minh', () => {
  const members = [{ isDependent: true, dependentStartDate: '2026-01-01' }, { isDependent: true, dependentStartDate: '2026-01-01', dependentVerified: false }, { isDependent: true, dependentStartDate: '2026-01-01', dependentVerified: true }];
  assert.equal(countActiveDependents(members, '2026-03'), 2);
});
