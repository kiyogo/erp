import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const catalog = JSON.parse(await readFile(new URL('../src/data/einvoiceProviderCatalog.json', import.meta.url), 'utf8'));

test('e-invoice provider snapshot contains all 128 numbered source entries', () => {
  assert.equal(catalog.length, 128);
  assert.deepEqual(catalog.map(({ number }) => number), Array.from({ length: 128 }, (_, index) => index + 1));
  for (const provider of catalog) {
    assert.ok(provider.name);
    assert.ok(provider.taxId);
    assert.match(provider.website, /^https?:\/\//);
  }
});
