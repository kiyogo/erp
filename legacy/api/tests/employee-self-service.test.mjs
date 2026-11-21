import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { startServer } from './helpers/server.mjs';

const server = await startServer('selfservice');
after(server.stop);
const { admin, call } = server;

const managed = (employee) => ({
  salaryBase: employee.salaryBase, position: employee.position, department: employee.department, status: employee.status, joinDate: employee.joinDate,
});

test('nhân viên tự cập nhật hồ sơ không đổi được lương, chức danh, phòng ban, trạng thái và ngày vào làm', async () => {
  const staff = await server.makeUser('nv');
  const before = managed((await call(staff, '/employees/me')).body.employee);

  const attempt = await call(staff, '/employees/me', 'PATCH', {
    phone: '0900000001', salaryBase: 999_999_999, position: 'Giám đốc', department: 'Ban lãnh đạo', status: 'Thử việc', joinDate: '2001-01-01',
  });
  assert.equal(attempt.status, 200, JSON.stringify(attempt.body));
  assert.deepEqual(managed((await call(staff, '/employees/me')).body.employee), before, 'các trường do quản trị viên quyết định phải giữ nguyên');

  // Cùng quy tắc khi nhân viên sửa hồ sơ của chính mình qua đường dẫn theo mã.
  const byId = await call(staff, `/employees/${staff.id}`, 'PATCH', { salaryBase: 1, position: 'Trưởng phòng' });
  assert.equal(byId.status, 200, JSON.stringify(byId.body));
  assert.deepEqual(managed((await call(staff, '/employees/me')).body.employee), before);

  // Quản trị viên vẫn đặt được các trường này.
  const set = await call(admin, `/employees/${staff.id}`, 'PATCH', { salaryBase: 15_000_000, position: 'Kế toán viên', department: 'Kế toán' });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  const after = managed((await call(staff, '/employees/me')).body.employee);
  assert.equal(after.salaryBase, 15_000_000);
  assert.equal(after.position, 'Kế toán viên');
  assert.equal(after.department, 'Kế toán');
});

test('người phụ thuộc nhân viên tự khai chờ xác minh, bị kiểm tra điều kiện và không khai trùng giữa hai nhân viên', async () => {
  const first = await server.makeUser('pt1');
  const second = await server.makeUser('pt2');
  const child = { id: 'kid-1', name: 'Con nhỏ', relation: 'Con đẻ', gender: 'Nam', birthDate: '2018-05-01', idNumber: '001218000321', isDependent: true, dependentStartDate: '2026-01-01' };
  const members = (employee) => call(admin, `/employees/${employee.id}`).then((response) => response.body.employee.details.familyMembers);

  const incomplete = await call(first, '/employees/me', 'PATCH', { details: { familyMembers: [{ ...child, idNumber: '' }] } });
  assert.equal(incomplete.status, 422, JSON.stringify(incomplete.body));
  const adult = await call(first, '/employees/me', 'PATCH', { details: { familyMembers: [{ ...child, birthDate: '2000-01-01' }] } });
  assert.equal(adult.status, 422, JSON.stringify(adult.body));

  const declared = await call(first, '/employees/me', 'PATCH', { details: { familyMembers: [{ ...child, dependentVerified: true }] } });
  assert.equal(declared.status, 200, JSON.stringify(declared.body));
  assert.equal((await members(first))[0].dependentVerified, false, 'nhân viên không tự xác nhận được');

  const duplicate = await call(second, '/employees/me', 'PATCH', { details: { familyMembers: [{ ...child, id: 'kid-2' }] } });
  assert.equal(duplicate.status, 409, JSON.stringify(duplicate.body));
  assert.match(duplicate.body.message, /chỉ tính cho một người nộp thuế/);

  const confirmed = await call(admin, `/employees/${first.id}`, 'PATCH', { details: { familyMembers: [{ ...child, dependentVerified: true }] } });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal((await members(first))[0].dependentVerified, true);

  const badId = await call(first, '/employees/me', 'PATCH', { details: { idNumber: '123' } });
  assert.equal(badId.status, 422, JSON.stringify(badId.body));
});
