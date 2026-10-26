import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./export_legacy_asset_items.js", import.meta.url), "utf8");

function runExporter(records) {
  const writes = [];
  const downloads = [];
  const warnings = [];
  const allowedKeyReads = [];
  const storage = new Map([["kiyovn_cache_asset_items", JSON.stringify(records)]]);
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
  key: "asset-legacy-1",
  code: "TS-OLD-1",
  name: "Synthetic monitor",
  serialNumber: "SYNTHETIC-SERIAL",
  department: "IT",
  customLegacyField: { retained: true },
}];
const result = runExporter(fixture);
assert.deepEqual(result.allowedKeyReads, ["kiyovn_cache_asset_items"]);
assert.deepEqual(result.writes, []);
assert.equal(result.downloads.length, 1);
assert.equal(result.downloads[0].name, `kiyovn-legacy-asset-items-${new Date().toISOString().slice(0, 10)}.json`);
const exported = JSON.parse(result.downloads[0].blob.text);
assert.equal(exported.format, "kiyovn-legacy-asset-items");
assert.equal(exported.records[0].key, "asset-legacy-1");
assert.deepEqual(exported.records[0].customLegacyField, { retained: true });
assert.equal(result.warnings.length, 1);
assert.equal(JSON.stringify(result.warnings).includes("SYNTHETIC-SERIAL"), false);

assert.throws(() => runExporter([fixture[0], { ...fixture[0] }]), /key tài sản trùng/);
assert.throws(() => runExporter([]), /1\.\.10000/);
assert.throws(() => runExporter([{ id: " padded ", name: "Unstable identity" }]), /key\/id\/code ổn định/);
assert.throws(() => runExporter([{ key: "oversized", value: "x".repeat(129 * 1024) }]), /128 KiB/);
process.stdout.write("Synthetic asset exporter fixture passed (single allowlisted read, no cache writes, unknown-field preservation, no row logging).\n");
