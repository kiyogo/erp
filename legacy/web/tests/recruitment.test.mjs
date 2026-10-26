import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/hr/RecruitmentModule.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } });
const imports = {
  react: 'globalThis.__recruitmentTest.react',
  '@ant-design/icons': 'globalThis.__recruitmentTest.icons',
  '../../components/KTable': 'globalThis.__recruitmentTest.ui',
  '../../custom-ui': 'globalThis.__recruitmentTest.ui',
  'react-router-dom': 'globalThis.__recruitmentTest.router',
  '../../api/endpoints': 'globalThis.__recruitmentTest.api',
  '../../services/dataService': 'globalThis.__recruitmentTest.services',
  '../../utils/fileExporter': 'globalThis.__recruitmentTest.exporter',
};
const executable = outputText.replace(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, names, path) => {
  const target = imports[path];
  assert.ok(target, `Unmocked import: ${path}`);
  if (names.startsWith('React,')) return `const React = ${target}; const ${names.slice(6).trim()} = ${target};`;
  return `const ${names} = ${target};`;
});

test('recruitment validates stages and dates and derives metrics from actual candidates', async () => {
  globalThis.__recruitmentTest = { react: {}, icons: {}, ui: {}, router: {}, api: {}, services: {}, exporter: {} };
  const { validateRecruitmentCandidate: validate, recruitmentMetrics: metrics } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#logic`);
  const candidate = { key: 'c1', jobKey: 'j1', name: 'Ứng viên', email: 'person@example.com', status: 'applied', appliedAt: '2026-10-01', interviewAt: '', interviewer: '', offerDate: '', hiredDate: '', history: [] };
  assert.equal(validate(candidate), '');
  assert.match(validate({ ...candidate, appliedAt: '2026-02-30' }), /Ngày tiếp nhận/);
  assert.match(validate({ ...candidate, email: 'invalid' }), /Email/);
  assert.match(validate({ ...candidate, status: 'hired' }, candidate), /Không thể chuyển/);
  const interview = { ...candidate, status: 'interview', interviewAt: '2026-10-03T09:00', interviewer: 'HR' };
  assert.equal(validate(interview, { ...candidate, status: 'screening' }), '');
  assert.match(validate({ ...interview, interviewer: '' }, { ...candidate, status: 'screening' }), /người phỏng vấn/);
  assert.match(validate({ ...interview, interviewAt: '2026-09-30T09:00' }, { ...candidate, status: 'screening' }), /trước ngày tiếp nhận/);
  assert.match(validate({ ...interview, status: 'offer', offerDate: '2026-10-02' }, interview), /trước.*phỏng vấn/);
  const hired = { ...interview, status: 'hired', offerDate: '2026-10-04', hiredDate: '2026-10-11' };
  assert.equal(validate(hired, { ...hired, status: 'offer' }), '');
  assert.match(validate({ ...hired, hiredDate: '2026-10-03' }, { ...hired, status: 'offer' }), /trước ngày gửi Offer/);
  assert.deepEqual(metrics([]), { applied: 0, interviewed: 0, offered: 0, hired: 0, acceptance: null, daysToHire: null });
  assert.deepEqual(metrics([candidate, hired, { ...interview, key: 'c2', status: 'rejected', offerDate: '2026-10-04' }]), { applied: 3, interviewed: 2, offered: 2, hired: 1, acceptance: 50, daysToHire: 10 });
  delete globalThis.__recruitmentTest;
});

test('recruitment saves real candidate records, preserves logical keys, exports and reports API failure', async () => {
  const states = [];
  let cursor = 0;
  const forms = [];
  let formCursor = 0;
  const effects = [];
  const effectDependencies = [];
  let effectCursor = 0;
  const messages = [];
  const writes = [];
  const downloads = [];
  const removed = [];
  let failSave = false;
  let query = new URLSearchParams();
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useMemo: fn => fn(),
    useEffect: (fn, dependencies) => {
      const index = effectCursor++;
      if (!effectDependencies[index] || dependencies.some((item, i) => item !== effectDependencies[index][i])) {
        effectDependencies[index] = dependencies; effects.push(fn);
      }
    },
  };
  const ui = Object.fromEntries(['KTable', 'Modal', 'Input', 'Select', 'Button', 'Tag', 'Progress', 'Drawer'].map(name => [name, name]));
  ui.Form = Object.assign(function Form() {}, {
    Item: 'FormItem',
    useForm: () => {
      const index = formCursor++;
      forms[index] ||= { values: {}, resetFields() { this.values = {}; }, setFieldsValue(values) { this.values = { ...this.values, ...values }; } };
      return [forms[index]];
    },
  });
  ui.message = Object.fromEntries(['success', 'warning', 'error'].map(level => [level, text => messages.push({ level, text })]));
  const icons = new Proxy({}, { get: (_, name) => String(name) });
  const job = { key: 'job-logical', id: 'database-row-id', jobCode: 'TD-1', title: 'Kỹ sư', department: 'Kỹ thuật', level: 'Junior', headcountNeeded: 1, candidatesApplied: 99, offeredCount: 50, status: 'Đang tuyển dụng', deadline: '2026-11-01' };
  globalThis.__recruitmentTest = {
    react, ui, icons,
    router: { useSearchParams: () => [query, next => { query = next; }] },
    services: { dataService: { refreshGenericData: async scope => scope === 'hr_job_openings' ? [job] : [], fetchOrgUnitsList: async () => [], fetchDropdownOptions: async () => [] } },
    api: {
      collectionsApi: {
        create: async (scope, record) => { if (failSave) throw new Error('offline'); writes.push({ scope, record: structuredClone(record) }); return { data: { record } }; },
        update: async (scope, key, record) => { if (failSave) throw new Error('offline'); writes.push({ scope, key, record: structuredClone(record) }); return { data: { record } }; },
      },
      filesApi: { list: async () => ({ data: { context: { parentId: 'recruiter-workspace' } } }), upload: async (_, __, parentId) => { assert.equal(parentId, 'recruiter-workspace'); return { data: { file: { id: 'uploaded-cv' } } }; }, remove: async id => removed.push(id) },
    },
    exporter: { generateValidXlsxBlob: rows => new Blob([JSON.stringify(rows)]), downloadFile: (filename, content) => downloads.push({ filename, content }) },
  };
  const originalWindow = globalThis.window;
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let copiedLink = '';
  globalThis.window = { location: { href: 'http://localhost:3011/admin/hr/recruitment' } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async value => { copiedLink = value; } } } });
  const { RecruitmentModule } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#component`);
  let tree;
  const render = () => { cursor = 0; formCursor = 0; effectCursor = 0; tree = RecruitmentModule(); for (const effect of effects.splice(0)) effect(); return tree; };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(child => child ? nodes(child) : [])];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props?.children?.flat(Infinity).map(text).join('') || '';
  const button = label => nodes().find(node => node.type === 'Button' && text(node).includes(label));
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const candidateForm = () => nodes().find(node => node.type === ui.Form && node.props.form === forms[1]);
  try {
    render(); await tick(); render(); render();
    const jobsTable = nodes().find(node => node.type === 'KTable');
    assert.equal(jobsTable.props.dataSource[0].key, 'job-logical');
    assert.equal(jobsTable.props.dataSource[0].candidatesApplied, 0, 'ignores stale manually entered counters');
    jobsTable.props.columns.find(column => column.key === 'actions').render(null, jobsTable.props.dataSource[0]).props.onClick();
    render(); render();
    button('Xem Hồ Sơ').props.onClick(); render();
    button('Tiếp nhận ứng viên').props.onClick(); render();
    const values = { name: 'Test Candidate', email: 'Test@Example.com', appliedAt: '2026-10-01', status: 'applied' };
    await candidateForm().props.onFinish(values); render();
    assert.equal(writes[0].scope, 'hr_recruitment_candidates');
    assert.equal(writes[0].record.jobKey, 'job-logical');
    assert.equal(writes[0].record.email, 'test@example.com');
    assert.equal(nodes().find(node => node.type === 'KTable').props.dataSource[0].candidatesApplied, 1);

    await button('Copy Link Nội Bộ').props.onClick();
    await tick();
    assert.equal(new URL(copiedLink).searchParams.get('job'), 'job-logical');

    button('Tiếp nhận ứng viên').props.onClick(); render();
    await candidateForm().props.onFinish({ ...values, email: 'test@example.com' }); render();
    assert.equal(writes.length, 1, 'duplicate email for same job is not written');
    assert.match(messages.at(-1).text, /đã có hồ sơ/);

    failSave = true;
    const cvInput = nodes().find(node => node.type === 'input' && node.props.type === 'file');
    cvInput.props.onChange({ target: { files: [{ name: 'cv.pdf', size: 100 }] } }); render();
    const successCount = messages.filter(item => item.level === 'success').length;
    await candidateForm().props.onFinish({ ...values, email: 'second@example.com' }); render();
    assert.deepEqual(removed, ['uploaded-cv'], 'failed candidate save cleans up only newly uploaded file');
    assert.equal(writes.length, 1);
    assert.equal(messages.filter(item => item.level === 'success').length, successCount);
    assert.equal(nodes().find(node => node.type === 'KTable').props.dataSource[0].candidatesApplied, 1);

    failSave = false;
    for (const stage of ['screening', 'interview', 'offer', 'hired']) {
      const candidatesTable = nodes().filter(node => node.type === 'KTable')[1];
      const current = candidatesTable.props.dataSource[0];
      const actions = candidatesTable.props.columns.find(column => column.key === 'actions').render(null, current);
      nodes(actions).find(node => node.type === 'Button').props.onClick(); render();
      await candidateForm().props.onFinish({
        ...forms[1].values, status: stage,
        ...(stage !== 'screening' ? { interviewAt: '2026-10-03T09:00', interviewer: 'HR' } : {}),
        ...(['offer', 'hired'].includes(stage) ? { offerDate: '2026-10-04' } : {}),
        ...(stage === 'hired' ? { hiredDate: '2026-10-11' } : {}),
      });
      render();
      assert.equal(writes.at(-1).record.status, stage);
    }
    assert.deepEqual(writes.at(-1).record.history.map(item => item.status), ['applied', 'screening', 'interview', 'offer', 'hired']);
    assert.equal(nodes().find(node => node.type === 'KTable').props.dataSource[0].hiredCount, 1);

    button('Xuất Báo Cáo').props.onClick();
    assert.match(downloads[0].filename, /\.xlsx$/);
    const report = await downloads[0].content.text();
    assert.ok(report.includes('Test Candidate'));
    assert.ok(report.includes('test@example.com'));
    assert.ok(!report.includes('second@example.com'));
  } finally {
    globalThis.window = originalWindow;
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else delete globalThis.navigator;
    delete globalThis.__recruitmentTest;
  }
});
