// Read-only exporter for the five plan collections supported by the Rust importer.
// Run this in DevTools on the original KiyoVN legacy web origin after opening
// each relevant Plans screen and waiting for its records to finish loading. It reads only
// the named kiyovn_cache_* keys; it never reads tokens, accounts, datastore seed
// data, or writes to localStorage/network APIs.
(() => {
  "use strict";

  const format = "kiyovn-legacy-plan-collections";
  const scopes = [
    "plan_items",
    "plan_milestones",
    "plan_progress",
    "plan_reports",
    "plan_okrs",
  ];
  const maxRecords = 5000;
  const maxBytes = 7 * 1024 * 1024;

  function uuid() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  const collections = [];
  let totalRecords = 0;
  for (const scope of scopes) {
    const raw = localStorage.getItem(`kiyovn_cache_${scope}`);
    if (raw === null) continue;
    let records;
    try {
      records = JSON.parse(raw);
    } catch {
      throw new Error(`Dữ liệu localStorage của '${scope}' không phải JSON hợp lệ; chưa tạo tệp.`);
    }
    if (!Array.isArray(records)) {
      throw new Error(`Dữ liệu localStorage của '${scope}' không phải mảng; chưa tạo tệp.`);
    }
    const keys = new Set();
    for (const record of records) {
      if (!record || typeof record !== "object" || Array.isArray(record)
          || typeof record.key !== "string" || !record.key.trim()) {
        throw new Error(`Collection '${scope}' có bản ghi thiếu key dạng chuỗi; chưa tạo tệp.`);
      }
      if (keys.has(record.key)) {
        throw new Error(`Collection '${scope}' có key trùng '${record.key}'; chưa tạo tệp.`);
      }
      keys.add(record.key);
    }
    totalRecords += records.length;
    if (totalRecords > maxRecords) {
      throw new Error(`Gói có hơn ${maxRecords} bản ghi; chưa tạo tệp.`);
    }
    if (records.length > 0) collections.push({ scope, records });
  }

  if (collections.length === 0) {
    throw new Error("Không tìm thấy bản ghi kế hoạch trong các localStorage key được hỗ trợ.");
  }

  const bundle = {
    format,
    schemaVersion: 1,
    batchId: uuid(),
    sourceOrigin: location.origin,
    exportedAt: new Date().toISOString(),
    collections,
  };
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  if (blob.size > maxBytes) {
    throw new Error("Gói xuất vượt quá giới hạn 7 MiB; chưa tải tệp xuống.");
  }

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kiyovn-legacy-plan-collections-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);

  console.info("Đã xuất gói chỉ-đọc; không thay đổi dữ liệu legacy.", {
    origin: bundle.sourceOrigin,
    batchId: bundle.batchId,
    totalRecords,
    collections: collections.map(({ scope, records }) => ({ scope, records: records.length })),
    bytes: blob.size,
  });
})();
