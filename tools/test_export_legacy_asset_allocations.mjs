import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./export_legacy_asset_allocations.js", import.meta.url), "utf8");

function makePage(records, page, total) {
  const limit = 500;
  return {
    data: records,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

async function runExporter(pages, { token = "synthetic-admin-token", statuses = [] } = {}) {
  const writes = [];
  const downloads = [];
  const warnings = [];
  const allowedKeyReads = [];
  const requests = [];
  const storage = new Map([["minepanel_token", token]]);
  class FixtureBlob {
    constructor(parts) { this.text = parts.join(""); }
  }
  class FixtureURL extends URL {
    static createObjectURL(blob) { downloads.push({ blob }); return "blob:fixture"; }
    static revokeObjectURL() {}
  }
  const context = {
    localStorage: {
      getItem(key) { allowedKeyReads.push(key); return storage.get(key) ?? null; },
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
  return { summary, downloads, warnings, writes, allowedKeyReads, requests };
}

const fixture = {
  key: "legacy-allocation-1",
  id: "legacy-allocation-1",
  type: "Cấp phát",
  ticketCode: "CP-OLD-1",
  assetCode: "ASSET-PRIVATE-1",
  assetName: "Synthetic laptop",
  serialNo: "SERIAL-PRIVATE-1",
  employeeCode: "EMP-PRIVATE-1",
  employeeName: "Synthetic employee",
  signedByReceiver: true,
  signedAt: "2026-10-09 10:30",
  status: "Đã bàn giao hoàn tất",
  notes: "Synthetic internal note",
};

const result = await runExporter([makePage([fixture], 1, 1)]);
assert.deepEqual(result.allowedKeyReads, ["minepanel_token"]);
assert.deepEqual(result.writes, []);
assert.equal(result.requests.length, 1);
assert.equal(result.requests[0].url, "https://legacy.fixture.test/api/v1/collections/asset_allocations?page=1&limit=500");
assert.equal(result.requests[0].options.method, "GET");
assert.equal(result.requests[0].options.credentials, "omit");
assert.equal(result.requests[0].options.headers.Authorization, "Bearer synthetic-admin-token");
assert.equal(result.downloads.length, 1);
assert.equal(result.downloads[0].name, `kiyovn-legacy-asset-allocations-${new Date().toISOString().slice(0, 10)}.json`);
const exported = JSON.parse(result.downloads[0].blob.text);
assert.equal(exported.format, "kiyovn-legacy-asset-allocations");
assert.equal(exported.records[0].key, fixture.key);
assert.equal(exported.records[0].signedByReceiver, true);
assert.equal(exported.records[0].status, fixture.status);
assert.equal(result.summary.recordCount, 1);
assert.equal(JSON.stringify(result.warnings).includes(fixture.serialNo), false);
assert.equal(JSON.stringify(result.warnings).includes("synthetic-admin-token"), false);

const many = Array.from({ length: 501 }, (_, index) => ({
  ...fixture,
  key: `legacy-allocation-${index}`,
  id: `legacy-allocation-${index}`,
}));
const paged = await runExporter([
  makePage(many.slice(0, 500), 1, many.length),
  makePage(many.slice(500), 2, many.length),
]);
assert.equal(paged.summary.recordCount, 501);
assert.equal(paged.requests.length, 2);
assert.equal(JSON.parse(paged.downloads[0].blob.text).records.length, 501);

await assert.rejects(runExporter([makePage([], 1, 0)]), /chưa có biên bản/);
await assert.rejects(runExporter([makePage([fixture, fixture], 1, 2)]), /key biên bản trùng/);
await assert.rejects(runExporter([makePage([fixture], 1, 2)]), /thiếu hoặc thay đổi/);
await assert.rejects(runExporter([makePage([fixture], 1, 1)], { statuses: [403] }), /không có quyền ADMIN/);
await assert.rejects(runExporter([makePage([fixture], 1, 1)], { token: "" }), /minepanel_token/);

process.stdout.write("Synthetic asset_allocations exporter fixture passed (paged same-origin GET, no source writes, token/row data not logged).\n");
