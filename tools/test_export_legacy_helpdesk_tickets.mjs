import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./export_legacy_helpdesk_tickets.js", import.meta.url), "utf8");

function runExporter(tickets) {
  const writes = [];
  const downloads = [];
  const warnings = [];
  const allowedKeyReads = [];
  const storage = new Map([["kiyovn_cache_tickets", JSON.stringify(tickets)]]);
  class FixtureBlob {
    constructor(parts) { this.text = parts.join(""); }
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
    URL: {
      createObjectURL(blob) { downloads.push({ blob }); return "blob:fixture"; },
      revokeObjectURL() {},
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
    console: { warn(...args) { warnings.push(args); } },
  };
  vm.runInNewContext(source, context, { timeout: 1000 });
  return { downloads, warnings, writes, allowedKeyReads };
}

const fixture = [{
  key: "legacy-ticket-1",
  code: "TK-OLD-1",
  title: "Synthetic password reset request",
  requester: "Synthetic user",
  department: "IT",
  priority: "Cao",
  status: "Đang xử lý",
  createdDate: "2025-03-04 09:10",
}];
const result = runExporter(fixture);
assert.deepEqual(result.allowedKeyReads, ["kiyovn_cache_tickets"]);
assert.deepEqual(result.writes, []);
assert.equal(result.downloads.length, 1);
assert.equal(result.downloads[0].name, `kiyovn-legacy-helpdesk-tickets-${new Date().toISOString().slice(0, 10)}.json`);
const exported = JSON.parse(result.downloads[0].blob.text);
assert.equal(exported.format, "kiyovn-legacy-helpdesk-tickets");
assert.equal(exported.tickets[0].key, "legacy-ticket-1");
assert.equal(exported.tickets[0].title, fixture[0].title);
assert.equal(result.warnings.length, 1);
assert.equal(JSON.stringify(result.warnings).includes(fixture[0].title), false);

assert.throws(() => runExporter([fixture[0], { ...fixture[0] }]), /key ticket trùng/);
assert.throws(() => runExporter([]), /1\.\.5000/);
process.stdout.write("Synthetic Helpdesk exporter fixture passed (allowlisted read only; no cache writes or row logging).\n");
