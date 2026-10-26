import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./export_legacy_helpdesk_incidents.js", import.meta.url), "utf8");

function runExporter(incidents) {
  const writes = [];
  const downloads = [];
  const warnings = [];
  const allowedKeyReads = [];
  const storage = new Map([["kiyovn_cache_ticket_incidents", JSON.stringify(incidents)]]);
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
  key: "legacy-incident-1",
  code: "INC-OLD-1",
  incidentTitle: "Synthetic authentication interruption",
  affectedSystem: "Synthetic identity service",
  severity: "P1 - Khẩn cấp (Toàn hệ thống)",
  occurredAt: "2025-03-04 09:10",
  resolvedAt: "2025-03-04 09:28",
  handler: "Synthetic on-call lead",
  downtimeMinutes: 18,
  rootCause: "Synthetic preliminary note",
  timeline: [{ time: "09:10", action: "Synthetic legacy entry" }],
  actionItems: [{ task: "Synthetic action", status: "Đang triển khai" }],
  status: "Đã xử lý & Hoàn tất RCA",
}];
const result = runExporter(fixture);
assert.deepEqual(result.allowedKeyReads, ["kiyovn_cache_ticket_incidents"]);
assert.deepEqual(result.writes, []);
assert.equal(result.downloads.length, 1);
assert.equal(result.downloads[0].name, `kiyovn-legacy-helpdesk-incidents-${new Date().toISOString().slice(0, 10)}.json`);
const exported = JSON.parse(result.downloads[0].blob.text);
assert.equal(exported.format, "kiyovn-legacy-helpdesk-incidents");
assert.equal(exported.incidents[0].key, "legacy-incident-1");
assert.equal(exported.incidents[0].timeline[0].action, "Synthetic legacy entry");
assert.equal(result.warnings.length, 1);
assert.equal(JSON.stringify(result.warnings).includes(fixture[0].incidentTitle), false);

assert.throws(() => runExporter([fixture[0], { ...fixture[0] }]), /key sự cố trùng/);
assert.throws(() => runExporter([]), /1\.\.5000/);
process.stdout.write("Synthetic Helpdesk incident exporter fixture passed (allowlisted read only; no cache writes or row logging).\n");
