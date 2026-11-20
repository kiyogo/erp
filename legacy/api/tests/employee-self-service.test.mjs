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
