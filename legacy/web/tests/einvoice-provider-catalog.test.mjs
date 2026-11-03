import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const catalog = JSON.parse(await readFile(new URL('../src/data/einvoiceProviderCatalog.json', import.meta.url), 'utf8'));
const publishedProviders = JSON.parse(await readFile(new URL('../src/data/einvoiceProvidersPublished.json', import.meta.url), 'utf8'));

test('e-invoice provider snapshot contains all 128 numbered source entries', () => {
  assert.equal(catalog.length, 128);
  assert.deepEqual(catalog.map(({ number }) => number), Array.from({ length: 128 }, (_, index) => index + 1));
  for (const provider of catalog) {
    assert.ok(provider.name);
    assert.ok(provider.taxId);
    assert.match(provider.website, /^https?:\/\//);
  }
});

test('e-invoice catalog keeps the TT 91 notice batch separate and source-labelled', () => {
  assert.deepEqual(publishedProviders.map(({ number }) => number), [129, 130, 131]);
  assert.deepEqual(publishedProviders.map(({ taxId }) => taxId), ['0108933234', '0307633556', '0111423385']);
  assert.ok(publishedProviders.every(({ sourceLabel, sourceDate, website }) =>
    sourceLabel === 'Thông báo 759/TB-CT' && sourceDate === '22/08/2026' && /^https:\/\//.test(website)
  ));
  assert.equal(new Set([...catalog, ...publishedProviders].map(({ taxId }) => taxId)).size, catalog.length + publishedProviders.length);
});
