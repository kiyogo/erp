import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { startServer } from './helpers/server.mjs';

const server = await startServer('taxestimate');
after(server.stop);
const { admin, call } = server;
const dbPath = path.join(server.directory, 'test.sqlite');

test('ước tính thuế GTGT và TNDN theo kỳ từ chứng từ và sổ cái, chỉ quản trị viên', async () => {
  const db = new DatabaseSync(dbPath);
  const creator = db.prepare('SELECT id FROM users LIMIT 1').get().id;
  const stamp = new Date().toISOString();
  const insert = db.prepare("INSERT INTO finance_documents (id, document_type, code, subtype, partner_name, amount, document_date, status, vat_rate, vat_amount, created_by, created_at, updated_at) VALUES (?, 'invoice', ?, ?, ?, ?, ?, 'Đã phát hành', ?, ?, ?, ?, ?)");
  insert.run('d1', 'HD-OUT-1', 'Đầu ra', 'Khách A', 22_000_000, '2026-10-05', 10, 2_000_000, creator, stamp, stamp);
  insert.run('d2', 'HD-IN-1', 'Đầu vào', 'NCC 1', 1_100_000, '2026-10-06', 10, 100_000, creator, stamp, stamp);
  const ledger = db.prepare("INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at) VALUES (?, 'finance_general_ledger', ?, ?, ?, ?, ?)");
  const entry = (key, extra) => ledger.run(`l-${key}`, key, creator, JSON.stringify({ key, status: 'Đã ghi sổ cái', entryDate: '2026-05-10', ...extra }), stamp, stamp);
  entry('rev', { debitAccount: 'TK 112', creditAccount: 'TK 511', amount: 2_000_000_000 });
  entry('exp', { debitAccount: 'TK 642', creditAccount: 'TK 112', amount: 500_000_000 });
  db.close();

  const vat = await call(admin, '/finance/tax/estimate?taxType=' + encodeURIComponent('Thuế GTGT') + '&filingMethod=' + encodeURIComponent('Tháng') + '&periodStart=2026-10-01&periodEnd=2026-10-31');
  assert.equal(vat.status, 200, JSON.stringify(vat.body));
  assert.equal(vat.body.data.deadline, '2026-11-20');
  assert.equal(vat.body.data.amountPayable, 1_900_000);
  assert.equal(vat.body.data.vat.deductibleInputVat, 100_000);

  const cit = await call(admin, '/finance/tax/estimate?taxType=' + encodeURIComponent('Thuế TNDN tạm tính') + '&periodStart=2026-04-01&periodEnd=2026-06-30');
  assert.equal(cit.status, 200, JSON.stringify(cit.body));
  assert.equal(cit.body.data.deadline, '2026-07-31');
  assert.equal(cit.body.data.cit.profit, 1_500_000_000);
  assert.equal(cit.body.data.cit.rate, 0.15, 'không có doanh thu năm trước: mức doanh thu tới 3 tỷ');
  assert.equal(cit.body.data.amountPayable, 225_000_000);
  const explicit = await call(admin, '/finance/tax/estimate?taxType=' + encodeURIComponent('Thuế TNDN tạm tính') + '&periodStart=2026-04-01&periodEnd=2026-06-30&previousYearRevenue=60000000000');
  assert.equal(explicit.body.data.cit.rate, 0.20);
  assert.equal(explicit.body.data.amountPayable, 300_000_000);

  assert.equal((await call(admin, '/finance/tax/estimate?taxType=' + encodeURIComponent('Thuế GTGT') + '&periodStart=2026-10-01&periodEnd=2026-10-31')).status, 422, 'thiếu chu kỳ kê khai');
  assert.equal((await call(admin, '/finance/tax/estimate?taxType=Khac&periodStart=2026-10-01&periodEnd=2026-10-31')).status, 422);
  const staff = await server.makeUser('nvthue');
  assert.equal((await call(staff, '/finance/tax/estimate?taxType=' + encodeURIComponent('Thuế GTGT') + '&filingMethod=' + encodeURIComponent('Tháng') + '&periodStart=2026-10-01&periodEnd=2026-10-31')).status, 403);
});
