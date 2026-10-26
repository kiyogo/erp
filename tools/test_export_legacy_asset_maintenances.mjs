import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./export_legacy_asset_maintenances.js", import.meta.url), "utf8");

function page(records, index, total) {
  const limit = 500;
  return { data: records, pagination: { page: index, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function run(pages, { cache = null, status = 200, fetchError = false } = {}) {
  const writes = [];
  const requests = [];
  const downloads = [];
  const warnings = [];
  const storage = new Map([["minepanel_token", "synthetic-secret-token"]]);
  if (cache !== null) storage.set("kiyovn_cache_asset_maintenances", JSON.stringify(cache));
  class FakeBlob {
    constructor(parts) { this.text = parts.join(""); }
  }
  class FakeURL extends URL {
    static createObjectURL(blob) { downloads.push({ blob }); return "blob:fixture"; }
    static revokeObjectURL() {}
  }
  const context = {
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(...args) { writes.push(args); throw new Error("legacy storage must remain read-only"); },
      removeItem(...args) { writes.push(args); throw new Error("legacy storage must remain read-only"); },
    },
    location: { origin: "https://legacy.example.test" },
    crypto: { randomUUID: () => "2a2a2a2a-2a2a-42aa-8aaa-2a2a2a2a2a2a" },
    TextEncoder,
    Blob: FakeBlob,
    URL: FakeURL,
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      if (fetchError) throw new Error("synthetic network failure");
      return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return pages[requests.length - 1]; },
      };
    },
    document: {
      body: { appendChild() {} },
      createElement() {
        return {
          href: "",
          download: "",
          click() { downloads.at(-1).name = this.download; },
          remove() {},
        };
      },
    },
    setTimeout() {},
    console: { warn(...args) { warnings.push(args); }, error(...args) { warnings.push(args); } },
  };
  try {
    const result = await vm.runInNewContext(source, context, { timeout: 1500 });
    return { result, writes, requests, downloads, warnings };
  } catch (error) {
    return { error, writes, requests, downloads, warnings };
  }
}

const rows = Array.from({ length: 501 }, (_, index) => ({
  key: `maintenance-${index}`,
  maintCode: `BD-${index}`,
  checklist: [{ item: "Kiểm tra", done: false }],
  extension: { preserved: true },
}));
const exported = await run([page(rows.slice(0, 500), 1, rows.length), page(rows.slice(500), 2, rows.length)], {
  cache: [{ key: "cache-only" }],
});
assert.equal(exported.result.recordCount, 501);
assert.equal(exported.result.sourceMode, "server_collection");
assert.equal(exported.requests.length, 2);
assert.equal(exported.writes.length, 0);
assert.equal(exported.downloads.length, 1);
assert.equal(exported.requests[0].options.method, "GET");
assert.equal(exported.requests[0].options.credentials, "omit");
assert.equal(exported.requests[0].options.redirect, "error");
assert.equal(exported.requests[0].options.headers.Authorization, "Bearer synthetic-secret-token");
assert.ok(!JSON.stringify(exported.warnings).includes("synthetic-secret-token"));
const bundle = JSON.parse(exported.downloads[0].blob.text);
assert.equal(bundle.format, "kiyovn-legacy-asset-maintenances");
assert.equal(bundle.records[500].extension.preserved, true);

const fallback = await run([page([], 1, 0)], { cache: [{ key: "cached-1", maintCode: "BD-CACHE" }] });
assert.equal(fallback.result.sourceMode, "browser_cache_fallback");
assert.equal(fallback.result.recordCount, 1);
assert.equal(fallback.requests.length, 1);
assert.equal(fallback.writes.length, 0);

for (const failure of [
  await run([page([], 1, 0)], { status: 403, cache: [{ key: "must-not-fallback" }] }),
  await run([page([], 1, 0)], { fetchError: true, cache: [{ key: "must-not-fallback" }] }),
  await run([{ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 0 } }], { cache: [{ key: "bad-page" }] }),
  await run([page([{ key: "duplicate" }, { key: "duplicate" }], 1, 2)]),
  await run([page([], 1, 0)]),
]) {
  assert.ok(failure.error instanceof Error || typeof failure.error === "object");
  assert.equal(failure.downloads.length, 0);
}

console.log("PASS: maintenance export pagination, server precedence, cache fallback, redaction, read-only and fail-closed cases");
