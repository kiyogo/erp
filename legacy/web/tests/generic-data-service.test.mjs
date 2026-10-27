import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const loadDataService = async (api) => {
  const source = readFileSync(new URL('../src/services/dataService.ts', import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  outputText = outputText.replace(
    /import\s*\{([^}]+)\}\s*from ['"]\.\.\/api\/endpoints['"];?/,
    (_, names) => `const {${names}} = globalThis.__genericDataTestApi;`,
  );
  globalThis.__genericDataTestApi = api;
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

test('generic single-record writes update cache only after the API confirms them', async () => {
  let rows = [];
  let failNextWrite = false;
  const api = {
    collectionsApi: {
      get: async () => ({ data: { data: rows, pagination: { totalPages: 0 } } }),
      create: async (scope, record) => {
        assert.equal(scope, 'generic_test');
        if (failNextWrite) throw new Error('offline');
        rows = [record, ...rows];
        return { data: { record } };
      },
      update: async (scope, key, patch) => {
        assert.equal(scope, 'generic_test');
        if (failNextWrite) throw new Error('offline');
        rows = rows.map((item) => item.key === key ? { ...item, ...patch } : item);
        return { data: { record: rows.find((item) => item.key === key) } };
      },
      remove: async (scope, key) => {
        assert.equal(scope, 'generic_test');
        if (failNextWrite) throw new Error('offline');
        rows = rows.filter((item) => item.key !== key);
        return { data: { deleted: true } };
      },
    },
    auditLogsApi: { record: async () => ({}) },
  };

  try {
    const { dataService } = await loadDataService(api);
    dataService.getGenericData('generic_test');
    await new Promise((resolve) => setImmediate(resolve));
    const created = await dataService.createGenericRecord('generic_test', { key: 'one', name: 'First' });
    assert.equal(created.key, 'one');
    assert.equal(dataService.getGenericData('generic_test')[0].name, 'First');

    const updated = await dataService.updateGenericRecord('generic_test', { key: 'one', name: 'Updated' });
    assert.equal(updated.name, 'Updated');
    assert.equal(dataService.getGenericData('generic_test')[0].name, 'Updated');

    const beforeFailure = dataService.getGenericData('generic_test');
    failNextWrite = true;
    await assert.rejects(dataService.updateGenericRecord('generic_test', { key: 'one', name: 'Lost' }), /offline/);
    assert.equal(dataService.getGenericData('generic_test'), beforeFailure);
    await assert.rejects(dataService.deleteGenericRecord('generic_test', 'one'), /offline/);
    assert.equal(dataService.getGenericData('generic_test'), beforeFailure);

    failNextWrite = false;
    await dataService.deleteGenericRecord('generic_test', 'one');
    assert.deepEqual(dataService.getGenericData('generic_test'), []);
  } finally {
    delete globalThis.__genericDataTestApi;
  }
});
