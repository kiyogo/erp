import assert from 'node:assert/strict';
import pg from 'pg';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

// Opt-in integration run: creates and drops only its own randomly named database.
const database = `kiyovn_codex_test_${randomUUID().replaceAll('-', '')}`;
assert.match(database, /^kiyovn_codex_test_[a-f0-9]{32}$/);
const config = { host: process.env.PGHOST || '127.0.0.1', port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER || 'postgres', password: process.env.PGPASSWORD || 'postgres', connectionTimeoutMillis: 3000 };
const admin = new pg.Client({ ...config, database: 'postgres' });
await admin.connect();
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-pg-test-'));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const env = { ...process.env, DATABASE_URL: '', USE_SQLITE: 'false', PGHOST: config.host, PGPORT: String(config.port), PGUSER: config.user, PGPASSWORD: config.password, PGDATABASE: database, HOST: '127.0.0.1', PORT: String(port), KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'fallback.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'), SEED_ADMIN_EMAIL: 'pg@example.test', SEED_ADMIN_PASSWORD: 'Postgres-Test-26!Secure', SEED_ADMIN_EMPLOYEE_CODE: 'PG-ADMIN', GOOGLE_ENFORCE_LOGIN: 'false' };
let server;
let created = false;
let logs = '';
let completed = 0;
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(seed.status, 0, seed.stderr);
  assert.ok(seed.stdout.includes('Connected successfully to PostgreSQL'), 'SQLite fallback is not a PostgreSQL test');
  server = spawn(process.execPath, ['index.mjs'], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  const base = `http://127.0.0.1:${port}/api/v1`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
    if (server.exitCode !== null || i === 99) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  let token = '';
  async function request(route, method = 'GET', payload, expected = 200) {
    const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  }
  const login = await request('/auth/login', 'POST', { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });
  token = login.token;
  await request('/auth/profile'); completed++;
  const meetingToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const meetingDate = new Date(Date.parse(`${meetingToday}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
  const meetingRoom = (await request('/collections/meeting_rooms', 'POST', { record: {
    key: 'pg-meeting-room', name: 'PG Meeting Room', capacity: 10, location: 'PG office', equipment: ['Screen'], status: 'Bảo trì',
  } }, 201)).record;
  assert.equal(meetingRoom.status, 'Trống');
  await request('/collections/meeting_room_settings', 'POST', { record: { key: 'spoofed', maxDuration: 60, maxAdvanceDays: 9 } }, 201);
  const pgBookingInput = (key, timeSlot) => ({ key, roomKey: meetingRoom.key, meetingTitle: 'PG meeting', date: meetingDate, timeSlot, participantsCount: 4, booker: 'Forged', status: 'Đã hủy' });
  const pgBookingRace = await Promise.all(['pg-meeting-race-a', 'pg-meeting-race-b'].map(async (key, index) => {
    const response = await fetch(`${base}/collections/room_bookings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ record: pgBookingInput(key, index ? '10:30 - 11:30' : '10:00 - 11:00') }),
    });
    return { status: response.status, body: await response.json() };
  }));
  assert.deepEqual(pgBookingRace.map(item => item.status).sort(), [201, 409]);
  const pgBooking = pgBookingRace.find(item => item.status === 201).body.record;
  assert.equal(pgBooking.bookerId, login.user.id);
  assert.equal(pgBooking.status, 'Đã xác nhận');
  await request('/collections/room_bookings', 'POST', { record: pgBookingInput('pg-meeting-too-long', '12:00 - 14:00') }, 422);
  const canceledPgBooking = (await request(`/collections/room_bookings/${pgBooking.key}`, 'PATCH', { patch: { status: 'Đã hủy' } })).record;
  assert.equal(canceledPgBooking.history.at(-1).actorId, login.user.id);
  const unavailablePgRoom = (await request(`/collections/meeting_rooms/${meetingRoom.key}`, 'PATCH', { patch: { status: 'Bảo trì' } })).record;
  assert.equal(unavailablePgRoom.status, 'Bảo trì');
  await request('/collections/room_bookings', 'POST', { record: pgBookingInput('pg-meeting-on-maintenance', '15:00 - 16:00') }, 422); completed++;
  await request('/collections/pg_rows', 'PUT', { records: [{ key: 'a', title: 'Alpha' }, { key: 'b', title: 'Beta' }] });
  assert.equal((await request('/collections/pg_rows?sort=title&order=asc')).data[0].title, 'Alpha'); completed++;
  const { task } = await request('/tasks', 'POST', { taskTitle: 'PG task', priority: 'Trung bình', dueDate: '2026-12-31', assigneeId: login.user.id, checklist: ['First', 'Second'] }, 201);
  assert.equal((await request(`/tasks/${task.key}`)).task.subtasks.length, 2); completed++;
  const feedbackInput = { key: 'pg-feedback-lifecycle', feedbackCode: 'FB-PG-LIFECYCLE', clientName: 'PG customer', contactPerson: 'PG contact', phone: '0900000000', serviceName: 'PG service', rating: null, content: 'PostgreSQL feedback lifecycle', priority: 'Khẩn cấp', assignedStaffId: login.user.id };
  const feedback = (await request('/collections/crm_feedback', 'POST', { record: feedbackInput }, 201)).record;
  assert.equal(feedback.status, 'Đang xử lý');
  assert.equal(feedback.assignedStaff, login.user.name);
  await request('/collections/crm_feedback', 'POST', { record: { ...feedbackInput, key: 'pg-feedback-duplicate-code' } }, 409);
  const feedbackRace = await Promise.all(['pg-feedback-race-a', 'pg-feedback-race-b'].map(async (key) => {
    const response = await fetch(`${base}/collections/crm_feedback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ record: { ...feedbackInput, key, feedbackCode: 'FB-PG-RACE' } }),
    });
    return response.status;
  }));
  assert.deepEqual(feedbackRace.sort(), [201, 409]);
  await request('/collections/crm_feedback', 'POST', { record: { ...feedbackInput, key: 'pg-feedback-bad-rating', feedbackCode: 'FB-PG-BAD-RATING', rating: 6 } }, 422);
  const resolvedFeedback = (await request('/collections/crm_feedback/pg-feedback-lifecycle', 'PATCH', { patch: { status: 'Đã giải quyết thỏa đáng', resolutionAction: 'Đã kiểm tra và xác nhận hoàn tất.' } })).record;
  assert.equal(resolvedFeedback.resolvedById, login.user.id);
  await request('/collections/crm_feedback/pg-feedback-lifecycle', 'PATCH', { patch: { status: 'Đã giải quyết thỏa đáng', resolutionAction: 'Không cho đóng lặp.' } }, 422);
  await request('/collections/crm_feedback/pg-feedback-lifecycle', 'DELETE', undefined, 422); completed++;
  const supplier = (await request('/crm/contacts', 'POST', { name: 'PG supplier', type: 'supplier', industry: 'PG infrastructure', status: 'Đang hoạt động' }, 201)).contact;
  const updatedSupplier = (await request(`/crm/contacts/${supplier.key}`, 'PATCH', { patch: { name: 'PG supplier updated', phone: '0900000200' } })).contact;
  assert.equal(updatedSupplier.code, supplier.code);
  assert.equal(updatedSupplier.name, 'PG supplier updated');
  assert.equal(updatedSupplier.phone, '0900000200'); completed++;
  const promotionCustomer = (await request('/crm/contacts', 'POST', { name: 'PG promotion customer', type: 'customer' }, 201)).contact;
  const promotionRecord = (key, code) => ({
    key, code, name: 'PG promotion test', startDate: meetingToday, endDate: '2099-12-31', promotionType: 'Chiết khấu',
    target: 'PG test customers', enabled: true, allowConcurrent: false, eligibleItemCodes: ['PG-SKU-1'],
    amountBasis: 'Thành tiền trước thuế', orgUnitKeys: [], employeeIds: [], applyOnce: true,
    combinablePromotionKeys: [], taxCondition: 'Bất kỳ', minimumSubtotal: 1000, unitPrice: 0,
    unit: 'đơn hàng', customerKeys: [promotionCustomer.key], discountKind: 'Phần trăm', discountValue: 10,
    owner: 'Forged', ownerId: 'forged',
  });
  const pgPromotion = (await request('/collections/crm_promotions', 'POST', { record: promotionRecord('pg-promotion-1', 'PG-KM-1') }, 201)).record;
  assert.equal(pgPromotion.ownerId, login.user.id);
  assert.equal(pgPromotion.status, 'Đang hoạt động');
  assert.equal(pgPromotion.customerKeys[0], promotionCustomer.key);
  const promotionRace = await Promise.all(['pg-promotion-race-a', 'pg-promotion-race-b'].map(async (key) => {
    const response = await fetch(`${base}/collections/crm_promotions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ record: promotionRecord(key, 'PG-KM-RACE') }),
    });
    return response.status;
  }));
  assert.deepEqual(promotionRace.sort((a, b) => a - b), [201, 409]);
  const invalidPromotion = promotionRecord('pg-promotion-invalid', 'PG-KM-BAD');
  invalidPromotion.endDate = '2020-01-01';
  await request('/collections/crm_promotions', 'POST', { record: invalidPromotion }, 422);
  const pausedPromotion = (await request('/collections/crm_promotions/pg-promotion-1', 'PATCH', { patch: { enabled: false } })).record;
  assert.equal(pausedPromotion.status, 'Tạm dừng');
  assert.equal(pausedPromotion.history.length, 2);
  await request('/collections/crm_promotions/pg-promotion-1', 'DELETE', undefined, 409); completed++;
  const pgPoints = { requestId: 'pg-loyalty-earn', type: 'earn', customerId: promotionCustomer.key, points: 100, reference: 'PG-SALE-1', note: '' };
  assert.equal((await request('/crm/loyalty/entries', 'POST', pgPoints, 201)).balance, 100);
  assert.equal((await request('/crm/loyalty/entries', 'POST', pgPoints)).replayed, true);
  const redemptionRace = await Promise.all(['pg-redemption-a', 'pg-redemption-b'].map(async (requestId) => {
    const response = await fetch(`${base}/crm/loyalty/entries`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestId, type: 'redeem', customerId: promotionCustomer.key, points: 70, reference: requestId, rewardName: 'PG gift' }),
    });
    return { status: response.status, body: await response.json() };
  }));
  assert.deepEqual(redemptionRace.map((item) => item.status).sort((a, b) => a - b), [201, 422]);
  const pgRedemption = redemptionRace.find((item) => item.status === 201).body.entry;
  assert.equal((await request(`/crm/loyalty/entries/${pgRedemption.key}/cancel`, 'POST', { reason: 'PG cancellation' })).balance, 100);
  await request(`/crm/loyalty/entries/${pgRedemption.key}/cancel`, 'POST', { reason: 'duplicate' }, 409);
  assert.equal((await request('/crm/loyalty')).customers.find((item) => item.key === promotionCustomer.key).balance, 100); completed++;
  const supplierEvaluationInput = { key: 'pg-supplier-evaluation', evalCode: 'PG-NCC-DG-1', supplierId: supplier.key, evalPeriod: 'Quý IV / 2026', qualityScore: 35, deliveryScore: 25, priceScore: 18, serviceScore: 8, evaluator: 'Forged', evaluatorId: 'forged', totalScore: 0, tier: 'Hạng C' };
  const supplierEvaluation = (await request('/collections/crm_supplier_evaluations', 'POST', { record: supplierEvaluationInput }, 201)).record;
  assert.equal(supplierEvaluation.supplierName, updatedSupplier.name);
  assert.equal(supplierEvaluation.totalScore, 86);
  assert.equal(supplierEvaluation.tier, 'Hạng B');
  assert.equal(supplierEvaluation.evaluatorId, login.user.id);
  await request('/collections/crm_supplier_evaluations', 'POST', { record: { ...supplierEvaluationInput, key: 'pg-supplier-evaluation-duplicate', evalCode: 'pg-ncc-dg-1' } }, 409);
  await request('/collections/crm_supplier_evaluations/pg-supplier-evaluation', 'PATCH', { patch: { evaluator: 'Forgery' } }, 422);
  await request('/collections/crm_supplier_evaluations/pg-supplier-evaluation', 'DELETE', undefined, 422); completed++;
  const documents = await Promise.all(Array.from({ length: 5 }, (_, i) => request('/documents', 'POST', { title: `PG document ${i}` }, 201)));
  assert.equal(new Set(documents.map(result => result.document.id)).size, 5); completed++;
  const route = `/documents/${documents[0].document.id}`;
  const operation = { operations: [{ transactionId: 'pg-retry', clientId: 'pg', data: 'operation' }], snapshot: { data: { blocks: [] } } };
  assert.equal((await request(`${route}/operations`, 'POST', operation)).revision, 2);
  assert.equal((await request(`${route}/operations`, 'POST', operation)).revision, 2);
  await request(`${route}/snapshots`, 'POST', { revision: 2, data: { blocks: [], updated: true } }); completed++;
  async function bank(balance) {
    return (await request('/finance/bank-accounts', 'POST', { bankName: 'PG bank', accountNumber: randomUUID(), accountHolder: 'PG', balance, status: 'Đang hoạt động' }, 201)).account;
  }
  const source = await bank(100000);
  const destination = await bank(0);
  const transferInput = { requestId: randomUUID(), sourceAccountId: source.key, destinationAccountId: destination.key, amount: 1000, fee: 0, purpose: 'PG transfer', transferDate: new Date().toISOString().slice(0, 10), transferMethod: 'Ghi sổ nội bộ' };
  const transfer = await request('/finance/internal-transfers', 'POST', transferInput, 201);
  assert.equal((await request('/finance/internal-transfers', 'POST', transferInput)).replayed, true);
  await request(`/finance/internal-transfers/${transfer.transfer.key}/cancel`, 'POST', { reason: 'PG cancellation' }); completed++;
  const paymentSource = await bank(200000);
  const payment = (await request('/finance/payments', 'POST', {
    beneficiary: 'PG supplier payment', bankAccountInfo: 'PG account reference', category: 'PostgreSQL payment workflow',
    amount: 125000, paymentMethod: 'Thẻ tín dụng DN',
  }, 201)).payment;
  const paymentApprovals = await Promise.all([1, 2].map(() => fetch(`${base}/finance/payments/${payment.key}/approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: '{}',
  })));
  assert.deepEqual(paymentApprovals.map(response => response.status).sort((a, b) => a - b), [200, 409]);
  const approvedPayment = (await request('/finance/payments')).data.find(item => item.key === payment.key);
  assert.equal(approvedPayment.status, 'Đã phê duyệt');
  assert.equal(approvedPayment.approverId, login.user.id);
  const recordedPayment = (await request(`/finance/payments/${payment.key}/execute`, 'POST', { sourceAccountId: paymentSource.key, settlementReference: 'PG-TXN-2026-01' })).payment;
  assert.equal(recordedPayment.status, 'Đã thanh toán');
  assert.equal(recordedPayment.settlementRecordedInternally, true);
  assert.equal(recordedPayment.ledgerRecorded, true);
  assert.equal(recordedPayment.history.length, 3); completed++;
  await request('/attendance/check-in', 'POST', { type: 'in' });
  await request('/attendance/check-in', 'POST', { type: 'out' }); completed++;
  const archive = { dispatchType: 'Văn bản đến', docType: 'Công văn', subject: 'PG archive', partner: 'PG office', docDate: '2026-10-20', dateReceivedOrIssued: '2026-10-26', urgency: 'Bình thường', securityLevel: 'Nội bộ' };
  const archives = await Promise.all(Array.from({ length: 4 }, (_, i) => request('/collections/doc_archives', 'POST', { record: { ...archive, key: `pg-archive-${i}` } }, 201)));
  assert.equal(new Set(archives.map(item => item.record.bookNumber)).size, 4); completed++;
  const docRecord = { key: 'pg-doc-register', docCode: 'PG-VB-01', title: 'PG enterprise register', docCategory: 'Công văn điều hành', direction: 'Nội bộ ban hành', issuingAuthority: 'PG office', issuedDate: '2026-10-26', effectiveDate: '2026-10-26', securityLevel: 'Nội bộ công ty', status: 'Dự thảo thẩm định' };
  await request('/collections/enterprise_documents', 'POST', { record: docRecord }, 201);
  await request('/collections/enterprise_documents/pg-doc-register', 'PATCH', { patch: { status: 'Mới ban hành' } }); completed++;
  await request('/collections/hr_rewards', 'POST', { record: { key: 'pg-reward', rewardCode: 'PG-KT-1', employeeId: login.user.id, department: 'PG', title: 'PG award', rewardType: 'Bằng khen Ban Giám Đốc', rewardValue: 0, decisionNo: 'PG-QD-1', date: '2026-10-26', status: 'Chờ duyệt' } }, 201);
  await request('/collections/hr_rewards/pg-reward', 'PATCH', { patch: { status: 'Đã ký quyết định' } });
  const awarded = await request('/collections/hr_rewards/pg-reward', 'PATCH', { patch: { status: 'Đã trao giải' } });
  assert.equal(awarded.record.awardedById, login.user.id); completed++;
  await request(`/users/${login.user.id}`, 'PATCH', { role: 'USER' }, 422);
  assert.equal((await request('/admin/backups')).capabilities.database, false); completed++;
  await request('/admin/backups', 'POST', { name: 'Unavailable PG dump', type: 'Database' }, 422);
  const company = (await request('/system/company-profile')).profile;
  const companySaved = (await request('/system/company-profile', 'PUT', { ...company, companyName: 'PG company', fullName: 'Pháp nhân PostgreSQL', taxCode: '0012345678' })).profile;
  assert.equal(companySaved.revision, 1);
  assert.equal((await request('/system/company-profile')).profile.fullName, 'Pháp nhân PostgreSQL');
  await request('/system/company-profile', 'PUT', { ...company, companyName: 'Stale' }, 409); completed++;
  const contract = (await request('/contracts', 'POST', { code: 'PG-CONTRACT', name: 'Hợp đồng PostgreSQL', contractTemplate: 'PG template', employeeCode: login.user.employeeCode, employeeName: login.user.name }, 201)).contract;
  assert.ok(contract.fileNodeId);
  const word = await fetch(`${base}/files/${contract.fileNodeId}/download`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(word.status, 200);
  assert.equal(Buffer.from(await word.arrayBuffer()).readUInt32LE(0), 0x04034b50); completed++;
  await request('/collections/hr_performance_reviews', 'POST', { record: { key: 'pg-review', code: 'PG-DG-1', employeeId: login.user.id, evaluatorId: login.user.id, department: 'PG', period: 'PG period', selfScore: 0, managerScore: 100, productivityScore: 0, disciplineScore: 0, innovationScore: 0, kpiBonus: 0 } }, 201);
  const review = (await request('/collections/hr_performance_reviews/pg-review', 'PATCH', { patch: { status: 'Đã hoàn tất đánh giá' } })).record;
  assert.equal(review.managerScore, 0); assert.equal(review.grade, 'C (Cần cải thiện)'); assert.equal(review.approvedById, login.user.id);
  await request('/collections/hr_performance_reviews/pg-review', 'DELETE', undefined, 422); completed++;
  await request('/collections/asset_items', 'POST', { record: {
    key: 'pg-disposal-asset', code: 'PG-AST-DSP', name: 'Bàn làm việc', category: 'Nội thất', model: 'PG-SN',
    originalPrice: 3000, accumulatedDepreciation: 2500, status: 'Đang sử dụng', history: [],
  } }, 201);
  const disposal = (await request('/collections/asset_disposals', 'POST', { record: {
    key: 'pg-disposal', disposalCode: 'PG-TL-01', assetKey: 'pg-disposal-asset', disposalMethod: 'Bán thanh lý cho đơn vị thu mua ngoài',
    reason: 'PostgreSQL disposal integration', disposalDate: '2026-10-27', startingAuctionPrice: 0,
    councilLeader: 'PG lead', councilMembers: 'PG members', status: 'Đã thanh lý & Hoàn tất sổ sách', actualDisposalPrice: 9000,
  } }, 201)).record;
  assert.equal(disposal.status, 'Chờ hội đồng phê duyệt');
  await request('/collections/asset_disposals/pg-disposal', 'PATCH', { patch: { status: 'Đang thực hiện xử lý' } });
  const completedDisposal = (await request('/collections/asset_disposals/pg-disposal', 'PATCH', { patch: {
    status: 'Đã thanh lý & Hoàn tất sổ sách', actualDisposalPrice: 800, disposalCost: 100,
    disposalDate: '2026-10-27', buyerName: 'PG buyer', buyerPhone: '', securityDataWipeCertified: false, dataWipeOfficer: '',
  } })).record;
  assert.equal(completedDisposal.netGainLoss, 200);
  assert.equal((await request('/collections/asset_items/pg-disposal-asset')).record.status, 'Đã thanh lý'); completed++;
  const todoAssignee = (await request('/users', 'POST', {
    email: 'pg-asset-operator@example.test', name: 'PG asset operator', employeeCode: 'PG-ASSET-OPERATOR',
    password: 'PG-Asset-Operator-26!Secure', role: 'USER',
  }, 201)).user;
  const todo = (await request('/collections/asset_todos', 'POST', { record: {
    key: 'pg-asset-todo', taskCode: 'PG-CV-TS-01', taskTitle: 'Đối chiếu tài sản', taskCategory: 'Kiểm kê đối soát',
    priority: 'Trung bình (P3)', deadline: '2026-10-29', assignedStaffId: todoAssignee.id, requester: 'PG operations',
    relatedAssetCode: 'PG-AST-01', location: 'PG office', estimatedHours: 2,
    checklist: [{ item: 'Đối chiếu mã tài sản', done: false }],
  } }, 201)).record;
  assert.equal(todo.status, 'Chờ xử lý');
  await request('/collections/asset_todos/pg-asset-todo', 'PATCH', { patch: { status: 'Đang thực hiện' } });
  await request('/collections/asset_todos/pg-asset-todo', 'PATCH', { patch: { checklist: [{ item: 'Đối chiếu mã tài sản', done: true }] } });
  await request('/collections/asset_todos/pg-asset-todo', 'PATCH', { patch: { status: 'Chờ phê duyệt cấp trên' } });
  const completedTodo = (await request('/collections/asset_todos/pg-asset-todo', 'PATCH', { patch: {
    status: 'Đã hoàn thành', actualHours: 1.5, resolutionResult: 'Đã lưu biên bản kiểm kê.',
  } })).record;
  assert.equal(completedTodo.completedById, login.user.id);
  assert.equal(completedTodo.actualHours, 1.5); completed++;
  const maintenanceAssignee = (await request('/users', 'POST', {
    email: 'pg-maintenance-operator@example.test', name: 'PG maintenance operator', employeeCode: 'PG-MAINTENANCE-OPERATOR',
    password: 'PG-Maintenance-Operator-26!Secure', role: 'USER',
  }, 201)).user;
  await request('/collections/asset_items', 'POST', { record: {
    key: 'pg-maintenance-asset', code: 'PG-AST-MNT', name: 'PG server', category: 'Máy chủ', model: 'PG-MNT-SN',
    status: 'Đang sử dụng', location: 'PG server room', history: [],
  } }, 201);
  const today = new Date().toISOString().slice(0, 10);
  const nextDue = new Date(Date.parse(`${today}T00:00:00Z`) + 40 * 86_400_000).toISOString().slice(0, 10);
  const plan = (await request('/collections/asset_maintenances', 'POST', { record: {
    key: 'pg-maintenance', maintCode: 'PG-BD-01', assetKey: 'pg-maintenance-asset', responsibleEngineerId: maintenanceAssignee.id,
    frequency: 'Hàng quý (3 tháng)', maintenanceType: 'Phòng ngừa định kỳ', slaLevel: 'SLA Standard (24h)', nextDate: nextDue,
    estimatedBudget: 2500,
  } }, 201)).record;
  assert.equal(plan.status, 'Đã lên lịch');
  await request('/collections/asset_maintenances/pg-maintenance', 'PATCH', { patch: { status: 'Đang tiến hành bảo dưỡng' } });
  const checklist = plan.checklist.map(entry => ({ ...entry, done: true }));
  await request('/collections/asset_maintenances/pg-maintenance', 'PATCH', { patch: { checklist } });
  const completedMaintenance = (await request('/collections/asset_maintenances/pg-maintenance', 'PATCH', { patch: {
    status: 'Đã hoàn thành đúng lịch', performedDate: today, actualCost: 1200, healthScore: 92,
    checklist, notes: 'PG maintenance completed', certificateCode: '',
  } })).record;
  assert.equal(completedMaintenance.maintenanceHistory[0].completedById, login.user.id);
  assert.equal((await request('/collections/asset_items/pg-maintenance-asset')).record.history.at(-1).action, 'Hoàn tất bảo dưỡng định kỳ'); completed++;
  const systemConfig = (await request('/collections/asset_systems', 'POST', { record: {
    key: 'pg-asset-system-config', code: 'PG-AS-CFG-01', name: 'PG asset config', category: 'Quy tắc sinh mã tự động',
    details: 'PG configuration persistence', scope: 'PG inventory', allocatedRole: 'IT', standardPackage: '',
    budgetLimit: 0, depreciationMonthsDefault: 0, prefixPattern: 'PG-{YYYY}-{####}', responsiblePersonId: maintenanceAssignee.id,
  } }, 201)).record;
  assert.equal(systemConfig.responsiblePerson, maintenanceAssignee.name);
  await request('/collections/asset_systems', 'POST', { record: {
    key: 'pg-asset-system-invalid-pattern', code: 'PG-AS-CFG-BAD', name: 'PG bad pattern', category: 'Quy tắc sinh mã tự động',
    details: 'Invalid code pattern', scope: 'PG inventory', allocatedRole: 'IT', standardPackage: '',
    budgetLimit: 0, depreciationMonthsDefault: 0, prefixPattern: 'PG-{YYYY}-{YYYY}-{####}', responsiblePersonId: maintenanceAssignee.id,
  } }, 422);
  assert.equal((await request('/collections/asset_systems/pg-asset-system-config', 'PATCH', { patch: { status: 'Tạm ngưng' } })).record.status, 'Tạm ngưng'); completed++;
  await request('/collections/asset_items', 'POST', { record: { key: 'pg-asset-unique-1', code: 'PG-AST-UNIQUE', barcode: 'PG BC 1', name: 'PG unique asset' } }, 201);
  await request('/collections/asset_items', 'POST', { record: { key: 'pg-asset-unique-2', code: 'pg-ast-unique', barcode: 'PG-BC-2', name: 'PG duplicate code' } }, 409);
  await request('/collections/asset_items', 'POST', { record: { key: 'pg-asset-unique-3', code: 'PG-AST-UNIQUE-3', barcode: 'PGBC1', name: 'PG duplicate barcode' } }, 409);
  completed++;
  const concurrentAssetCreates = await Promise.all(['pg-asset-unique-race-a', 'pg-asset-unique-race-b'].map((key) => fetch(`${base}/collections/asset_items`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ record: { key, code: 'PG-AST-UNIQUE-RACE', barcode: key, name: 'PG concurrent asset' } }),
  })));
  assert.deepEqual(concurrentAssetCreates.map((response) => response.status).sort((a, b) => a - b), [201, 409]);
  completed++;
  await request('/collections/asset_items', 'POST', { record: {
    key: 'pg-depreciation-asset', code: 'PG-AST-DEP', name: 'PG depreciation asset', category: 'Máy chủ',
    department: 'PG', originalPrice: 60000000, depreciationMonths: 36, accumulatedDepreciation: 0, status: 'Trong kho',
  } }, 201);
  const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const depreciationPeriod = businessDate.slice(0, 7);
  const depreciationInput = {
    assetKey: 'pg-depreciation-asset', assetCode: 'forged', originalCost: 1, lifeMonths: 1, residualValue: 6000000,
    startDate: `${depreciationPeriod}-01`, depreciationMethod: 'Đường thẳng', costAccount: 'Nợ 6421 (CP Quản lý CNTT)',
    assetAccount: 'Có 2141 (Hao mòn TSCĐ hữu hình)',
  };
  const depreciationResponses = await Promise.all(['pg-depreciation-race-a', 'pg-depreciation-race-b'].map((key) => fetch(`${base}/collections/asset_depreciations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ record: { ...depreciationInput, key } }),
  })));
  assert.deepEqual(depreciationResponses.map((response) => response.status).sort((a, b) => a - b), [201, 409]);
  const depreciationRecords = (await request('/collections/asset_depreciations')).data;
  const depreciationRecord = depreciationRecords.find((item) => item.key === 'pg-depreciation-race-a' || item.key === 'pg-depreciation-race-b');
  assert.equal(depreciationRecord.assetKey, 'pg-depreciation-asset');
  assert.equal(depreciationRecord.assetCode, 'PG-AST-DEP');
  assert.equal(depreciationRecord.originalCost, 60000000);
  assert.equal(depreciationRecord.lifeMonths, 36);
  const runPayload = { period: depreciationPeriod, entries: [{ depreciationKey: depreciationRecord.key, amount: 1500000 }] };
  const depreciationRuns = await Promise.all([runPayload, runPayload].map((body) => fetch(`${base}/assets/depreciation-runs`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
  })));
  assert.deepEqual(depreciationRuns.map((response) => response.status).sort((a, b) => a - b), [200, 409]);
  const postedDepreciation = (await request(`/collections/asset_depreciations/${depreciationRecord.key}`)).record;
  const postedAsset = (await request('/collections/asset_items/pg-depreciation-asset')).record;
  assert.equal(postedDepreciation.depreciatedMonths, 1);
  assert.equal(postedAsset.accumulatedDepreciation, 1500000);
  assert.equal(postedAsset.netBookValue, 58500000);
  assert.equal((await request('/collections/finance_general_ledger')).data.filter((entry) => entry.sourceReference === `asset-depreciation:${depreciationPeriod}:${depreciationRecord.key}`).length, 1); completed++;
  const adminToken = token;
  const requester = (await request('/users', 'POST', { email: 'pg-workflow-requester@example.test', name: 'PG workflow requester', employeeCode: 'PG-WF-REQUESTER', password: 'PG-Workflow-Requester-26!Secure', role: 'USER' }, 201)).user;
  const firstApprover = (await request('/users', 'POST', { email: 'pg-workflow-first@example.test', name: 'PG workflow first', employeeCode: 'PG-WF-FIRST', password: 'PG-Workflow-First-26!Secure', role: 'USER' }, 201)).user;
  const finalApprover = (await request('/users', 'POST', { email: 'pg-workflow-final@example.test', name: 'PG workflow final', employeeCode: 'PG-WF-FINAL', password: 'PG-Workflow-Final-26!Secure', role: 'USER' }, 201)).user;
  const workflowCode = 'PG-WF-ASSIGNED';
  await request('/collections/workflow_blueprints', 'POST', { record: {
    key: workflowCode, workflowCode, workflowName: 'PG assigned workflow', category: 'Tài chính & Thanh toán',
    description: 'PostgreSQL per-level approval', scope: 'PostgreSQL', totalSteps: 2, slaTargetHours: 8,
    applicableBudgetLimit: 1000000, status: 'Đang áp dụng', version: 'v1.0', formFields: [],
    approvalFlow: [
      { roleName: 'First approver', defaultApprover: 'First', approverId: firstApprover.id, slaHours: 3, canReject: true, requireTokenPKI: false },
      { roleName: 'Final approver', defaultApprover: 'Final', approverId: finalApprover.id, slaHours: 2, canReject: false, requireTokenPKI: false },
    ],
  } }, 201);
  async function loginAs(email, password) {
    const session = await request('/auth/login', 'POST', { email, password });
    token = session.token;
  }
  await loginAs(requester.email, 'PG-Workflow-Requester-26!Secure');
  const workflow = (await request('/collections/workflow_requests', 'POST', { record: {
    key: 'pg-assigned-request', code: 'PG-REQ-WF-01', workflowCode, workflowName: 'PG approval request',
    category: 'Tài chính & Thanh toán', department: 'PG', summaryDetails: 'Check PostgreSQL workflow assignment.',
    budgetAmount: 0, priority: 'Bình thường (P3)', totalLevels: 2, attachments: [], formData: {},
  } }, 201)).record;
  assert.equal(workflow.currentApproverId, firstApprover.id);
  await loginAs(firstApprover.email, 'PG-Workflow-First-26!Secure');
  assert.equal((await request('/collections/workflow_requests')).data[0].canDecide, true);
  const firstDecision = (await request('/collections/workflow_requests/pg-assigned-request', 'PATCH', { patch: { decision: 'Đã phê duyệt', approvalNote: 'PG first level' } })).record;
  assert.equal(firstDecision.currentApproverId, finalApprover.id);
  assert.equal(firstDecision.slaHoursTarget, 2);
  await loginAs(finalApprover.email, 'PG-Workflow-Final-26!Secure');
  await request('/collections/workflow_requests/pg-assigned-request', 'PATCH', { patch: { decision: 'Từ chối', approvalNote: 'Not permitted at this level' } }, 422);
  const finalDecision = (await request('/collections/workflow_requests/pg-assigned-request', 'PATCH', { patch: { decision: 'Đã phê duyệt', approvalNote: 'PG final level' } })).record;
  assert.equal(finalDecision.status, 'Đã phê duyệt');
  assert.equal(finalDecision.approvalHistory[1].approverId, finalApprover.id); completed++;
  token = adminToken;
  const sessions = await request('/admin/sessions');
  const current = sessions.data.find(item => item.current);
  assert.ok(current);
  await request(`/admin/sessions/${current.key}/revoke`, 'POST', { reason: 'PG revocation' });
  await request('/auth/profile', 'GET', undefined, 401); completed++;
  console.log(JSON.stringify({ databaseEngine: 'PostgreSQL', checksPassed: completed, evidence: directory }));
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  if (created) {
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [database]);
    await admin.query(`DROP DATABASE "${database}"`);
  }
  await admin.end();
}
