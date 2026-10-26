import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./export_legacy_asset_depreciations.js", import.meta.url), "utf8");
const record = {
  key: "legacy-depreciation-1",
  assetCode: "ASSET-SYNTHETIC-1",
  assetName: "Synthetic workstation",
  department: "Synthetic department",
  originalCost: 24000000,
  accumulatedDeprec: 4000000,
  scheduleList: [{ month: 1, monthlyAmount: 500000 }],
  depreciationEvents: [{ actor: "Synthetic operator", posted: true }],
};

function page(data, number, total) {
  const limit = 500;
  return { data, pagination: { page: number, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function run(pages, { cache = null, status = 200, token = "synthetic-admin-token", networkFailure = false } = {}) {
  const storage = new Map([["minepanel_token", token]]);
  if (cache !== null) storage.set("kiyovn_cache_asset_depreciations", JSON.stringify(cache));
  const writes = [];
  const downloads = [];
  const warnings = [];
  const requests = [];
  const reads = [];
  class FixtureBlob { constructor(parts) { this.text = parts.join(""); } }
  class FixtureURL extends URL {
    static createObjectURL(blob) { downloads.push({ blob }); return "blob:test"; }
    static revokeObjectURL() {}
  }
  const context = {
    localStorage: {
      getItem(key) { reads.push(key); return storage.get(key) ?? null; },
      setItem(...args) { writes.push(args); throw new Error("source must remain read-only"); },
      removeItem(...args) { writes.push(args); throw new Error("source must remain read-only"); },
    },
    location: { origin: "https://legacy.fixture.test" },
    crypto: { randomUUID: () => "3a3a3a3a-3a3a-43aa-8aaa-3a3a3a3a3a3a" },
    TextEncoder,
    Blob: FixtureBlob,
    URL: FixtureURL,
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      if (networkFailure) throw new Error("synthetic network failure");
      return { ok: status >= 200 && status < 300, status, async json() { return pages[requests.length - 1]; } };
    },
    document: {
      body: { appendChild() {} },
      createElement() {
        return {
          href: "", download: "",
          click() { downloads.at(-1).name = this.download; },
          remove() {},
        };
      },
    },
    setTimeout() {},
    console: { warn(...args) { warnings.push(args); } },
  };
  const summary = await vm.runInNewContext(source, context, { timeout: 1000 });
  return { summary, writes, downloads, warnings, requests, reads };
}

const fromServer = await run([page([record], 1, 1)], { cache: [{ key: "stale-cache" }] });
assert.equal(fromServer.requests[0].url, "https://legacy.fixture.test/api/v1/collections/asset_depreciations?page=1&limit=500");
assert.equal(fromServer.requests[0].options.method, "GET");
assert.equal(fromServer.requests[0].options.credentials, "omit");
assert.equal(fromServer.requests[0].options.redirect, "error");
assert.deepEqual(fromServer.writes, []);
assert.equal(fromServer.summary.sourceMode, "server_collection");
assert.equal(fromServer.summary.recordCount, 1);
assert.equal(fromServer.downloads[0].name.startsWith("kiyovn-legacy-asset-depreciations-"), true);
assert.deepEqual(JSON.parse(fromServer.downloads[0].blob.text).records[0], record);
assert.equal(JSON.stringify(fromServer.warnings).includes(record.assetCode), false);
assert.equal(JSON.stringify(fromServer.warnings).includes("synthetic-admin-token"), false);

const fromCache = await run([page([], 1, 0)], { cache: [record] });
assert.equal(fromCache.summary.sourceMode, "browser_cache_fallback");
assert.deepEqual(JSON.parse(fromCache.downloads[0].blob.text).records, [record]);
assert.deepEqual(fromCache.writes, []);

await assert.rejects(run([page([], 1, 0)]), /Không tìm thấy hồ sơ/);
await assert.rejects(run([page([], 1, 0)], { status: 403, cache: [record] }), /không có quyền ADMIN/);
await assert.rejects(run([page([], 1, 0)], { networkFailure: true, cache: [record] }), /Không thể đọc collection/);
await assert.rejects(run([page([record, record], 1, 2)]), /key hồ sơ trùng lặp/);
await assert.rejects(run([page([], 1, 0)], { token: "" }), /minepanel_token/);

process.stdout.write("Synthetic asset_depreciations exporter fixture passed (server preference, browser-cache fallback, same-origin GET, read-only behavior, redaction, and fail-closed errors).\n");
