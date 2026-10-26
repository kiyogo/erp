import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./export_legacy_reports_catalog.js", import.meta.url), "utf8");

function page(records, number, total) {
  const limit = 500;
  return { data: records, pagination: { page: number, limit, total, totalPages: Math.ceil(total / limit) } };
}

async function run(pages, { token = "synthetic-admin-token", cache = null, statuses = [], fetchErrorAt = -1 } = {}) {
  const writes = [];
  const downloads = [];
  const warnings = [];
  const reads = [];
  const requests = [];
  const storage = new Map([["minepanel_token", token]]);
  if (cache !== null) storage.set("kiyovn_cache_reports_catalog", JSON.stringify(cache));
  class FixtureBlob { constructor(parts) { this.text = parts.join(""); } }
  class FixtureURL extends URL {
    static createObjectURL(blob) { downloads.push({ blob }); return "blob:fixture"; }
    static revokeObjectURL() {}
  }
  const context = {
    localStorage: {
      getItem(key) { reads.push(key); return storage.get(key) ?? null; },
      setItem(...args) { writes.push(args); throw new Error("legacy storage must stay read-only"); },
      removeItem(...args) { writes.push(args); throw new Error("legacy storage must stay read-only"); },
    },
    location: { origin: "https://legacy.fixture.test" },
    crypto: { randomUUID: () => "3b3b3b3b-3b3b-43bb-8bbb-3b3b3b3b3b3b" },
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
    console: { warn(...args) { warnings.push(args); }, error(...args) { warnings.push(args); } },
  };
  const summary = await vm.runInNewContext(source, context, { timeout: 1000 });
  return { summary, downloads, warnings, writes, reads, requests };
}

const sourceRecord = {
  key: "1791500000000",
  code: "RP-LEGACY-01",
  title: "Synthetic finance report",
  type: "Tài chính",
  author: "Synthetic author",
  date: "2026-10-10",
  period: "Quý III / 2026",
  fileSize: "2.1 MB",
  downloadsCount: 1,
  executiveSummary: "Synthetic-only report summary",
  keyMetrics: [{ label: "Metric", value: "100%" }],
  status: "Sẵn sàng",
  unknownLegacyField: { preserved: true },
};

const preferred = await run([page([sourceRecord], 1, 1)], { cache: [{ key: "stale-cache-row" }] });
assert.deepEqual(preferred.reads, ["minepanel_token", "kiyovn_cache_reports_catalog"]);
assert.deepEqual(preferred.writes, []);
assert.equal(preferred.requests.length, 1);
assert.equal(preferred.requests[0].url, "https://legacy.fixture.test/api/v1/collections/reports_catalog?page=1&limit=500");
assert.equal(preferred.requests[0].options.method, "GET");
assert.equal(preferred.requests[0].options.credentials, "omit");
assert.equal(preferred.requests[0].options.headers.Authorization, "Bearer synthetic-admin-token");
const bundle = JSON.parse(preferred.downloads[0].blob.text);
assert.equal(bundle.format, "kiyovn-legacy-reports-catalog");
assert.equal(bundle.sourceMode, "server_collection");
assert.deepEqual(bundle.records[0], sourceRecord);
assert.equal(preferred.summary.recordCount, 1);
assert.equal(JSON.stringify(preferred.warnings).includes(sourceRecord.executiveSummary), false);
assert.equal(JSON.stringify(preferred.warnings).includes("synthetic-admin-token"), false);

const many = Array.from({ length: 501 }, (_, index) => ({ ...sourceRecord, key: `legacy-${index}`, code: `RP-${index}` }));
const paged = await run([page(many.slice(0, 500), 1, many.length), page(many.slice(500), 2, many.length)]);
assert.equal(paged.summary.recordCount, 501);
assert.equal(paged.requests.length, 2);
assert.equal(JSON.parse(paged.downloads[0].blob.text).records.length, 501);

const cached = [{ ...sourceRecord, key: "cache-report", title: "Cache fallback report" }];
const fallback = await run([page([], 1, 0)], { cache: cached });
assert.equal(fallback.requests.length, 1);
assert.equal(JSON.parse(fallback.downloads[0].blob.text).sourceMode, "browser_cache_fallback");
assert.deepEqual(JSON.parse(fallback.downloads[0].blob.text).records, cached);

await assert.rejects(run([page([], 1, 0)]), /Không tìm thấy báo cáo/);
await assert.rejects(run([page([sourceRecord, sourceRecord], 1, 2)]), /key báo cáo trùng/);
await assert.rejects(run([page([sourceRecord], 1, 2)]), /trang báo cáo bị thiếu/);
await assert.rejects(run([page([], 1, 0)], { statuses: [403], cache: cached }), /không có quyền ADMIN/);
await assert.rejects(run([page([], 1, 0)], { fetchErrorAt: 0, cache: cached }), /Không thể đọc collection/);
await assert.rejects(run([page([], 1, 0)], { token: "" }), /minepanel_token/);
await assert.rejects(run([page([{ title: "Missing key" }], 1, 1)]), /thiếu key\/id\/code/);

process.stdout.write("Synthetic reports_catalog exporter fixture passed (server preference, localStorage fallback, paging, read-only, validation, fail-closed auth/network and redacted logs).\n");
