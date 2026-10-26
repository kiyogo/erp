import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./export_legacy_asset_transfers.js", import.meta.url), "utf8");

function makePage(records, page, total) {
  const limit = 500;
  return { data: records, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function runExporter(pages, {
  token = "synthetic-admin-token",
  cache = null,
  statuses = [],
  fetchErrorAt = -1,
} = {}) {
  const writes = [];
  const downloads = [];
  const warnings = [];
  const keyReads = [];
  const requests = [];
  const storage = new Map([["minepanel_token", token]]);
  if (cache !== null) storage.set("kiyovn_cache_asset_transfers", JSON.stringify(cache));
  class FixtureBlob {
    constructor(parts) { this.text = parts.join(""); }
  }
  class FixtureURL extends URL {
    static createObjectURL(blob) { downloads.push({ blob }); return "blob:fixture"; }
    static revokeObjectURL() {}
  }
  const context = {
    localStorage: {
      getItem(key) { keyReads.push(key); return storage.get(key) ?? null; },
      setItem(...args) { writes.push(args); throw new Error("legacy storage must be read-only"); },
      removeItem(...args) { writes.push(args); throw new Error("legacy storage must be read-only"); },
    },
    location: { origin: "https://legacy.fixture.test" },
    crypto: { randomUUID: () => "2a2a2a2a-2a2a-42aa-8aaa-2a2a2a2a2a2a" },
    TextEncoder,
    Blob: FixtureBlob,
    URL: FixtureURL,
    fetch: async (url, options) => {
      requests.push({ url: String(url), options });
      const index = requests.length - 1;
      if (index === fetchErrorAt) throw new Error("synthetic network failure");
      const status = statuses[index] ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        async json() { return pages[index]; },
      };
    },
    document: {
      body: { appendChild() {} },
      createElement() {
        return {
          href: "",
          download: "",
          click() { downloads.at(-1).name = this.download; downloads.at(-1).href = this.href; },
          remove() {},
        };
      },
    },
    setTimeout() {},
    console: {
      warn(...args) { warnings.push(args); },
      error(...args) { warnings.push(args); },
    },
  };
  const summary = await vm.runInNewContext(source, context, { timeout: 1000 });
  return { summary, downloads, warnings, writes, keyReads, requests };
}

const sourceRecord = {
  key: "legacy-transfer-1",
  transferCode: "DC-OLD-1",
  assetCode: "ASSET-PRIVATE-1",
  assetName: "Synthetic laptop",
  serialNo: "SERIAL-PRIVATE-1",
  originalPrice: 30000000,
  netBookValue: 25000000,
  fromLocation: "Kho A",
  fromDepartment: "IT",
  fromCustodian: "Synthetic sender",
  toLocation: "Kho B",
  toDepartment: "Finance",
  toCustodian: "Synthetic receiver",
  carrierName: "Synthetic carrier",
  trackingCode: "TRACK-PRIVATE-1",
  shippingCost: 50000,
  transferDate: "2026-10-08",
  expectedDeliveryDate: "2026-10-09",
  receivedDate: "2026-10-09 09:00",
  reason: "Synthetic transfer reason",
  approver: "Legacy free text",
  approvedAt: "2026-10-08 15:00",
  status: "Đã điều chuyển hoàn tất",
  condition: "Synthetic packaged condition",
  receiveCondition: "Synthetic received condition",
  notes: "Synthetic internal note",
};

const result = await runExporter([makePage([sourceRecord], 1, 1)], {
  cache: [{ key: "stale-cache-record" }],
});
assert.deepEqual(result.keyReads, ["minepanel_token", "kiyovn_cache_asset_transfers"]);
assert.deepEqual(result.writes, []);
assert.equal(result.requests.length, 1);
assert.equal(result.requests[0].url, "https://legacy.fixture.test/api/v1/collections/asset_transfers?page=1&limit=500");
assert.equal(result.requests[0].options.method, "GET");
assert.equal(result.requests[0].options.credentials, "omit");
assert.equal(result.requests[0].options.headers.Authorization, "Bearer synthetic-admin-token");
const exported = JSON.parse(result.downloads[0].blob.text);
assert.equal(exported.format, "kiyovn-legacy-asset-transfers");
assert.equal(exported.sourceMode, "server_collection");
assert.deepEqual(exported.records[0], sourceRecord);
assert.equal(result.summary.recordCount, 1);
assert.equal(JSON.stringify(result.warnings).includes(sourceRecord.serialNo), false);
assert.equal(JSON.stringify(result.warnings).includes("synthetic-admin-token"), false);

const many = Array.from({ length: 501 }, (_, index) => ({
  ...sourceRecord,
  key: `legacy-transfer-${index}`,
  transferCode: `DC-${index}`,
}));
const paged = await runExporter([
  makePage(many.slice(0, 500), 1, many.length),
  makePage(many.slice(500), 2, many.length),
]);
assert.equal(paged.summary.recordCount, 501);
assert.equal(paged.requests.length, 2);
assert.equal(JSON.parse(paged.downloads[0].blob.text).records.length, 501);

const fallback = [{ ...sourceRecord, key: "cache-transfer", status: "Chờ phê duyệt" }];
const fromCache = await runExporter([makePage([], 1, 0)], { cache: fallback });
const cacheBundle = JSON.parse(fromCache.downloads[0].blob.text);
assert.equal(fromCache.requests.length, 1, "empty collection must stop after first page");
assert.equal(cacheBundle.sourceMode, "browser_cache_fallback");
assert.deepEqual(cacheBundle.records, fallback);

await assert.rejects(runExporter([makePage([], 1, 0)]), /Không tìm thấy lệnh điều chuyển/);
await assert.rejects(runExporter([makePage([sourceRecord, sourceRecord], 1, 2)]), /key điều chuyển trùng/);
await assert.rejects(runExporter([makePage([sourceRecord], 1, 2)]), /trang dữ liệu bị thiếu/);
await assert.rejects(runExporter([makePage([], 1, 0)], { statuses: [403], cache: fallback }), /không có quyền ADMIN/);
await assert.rejects(runExporter([makePage([], 1, 0)], { fetchErrorAt: 0, cache: fallback }), /Không thể đọc collection/);
await assert.rejects(runExporter([makePage([], 1, 0)], { token: "" }), /minepanel_token/);

process.stdout.write("Synthetic asset_transfers exporter fixture passed (server preference, cache fallback, paging, no source writes, fail-closed auth/network and redacted logs).\n");
