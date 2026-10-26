// Read-only exporter for the legacy browser-local asset inventory.
// Run only in DevTools on the original KiyoVN legacy origin after Assets loads.
// This script reads one allowlisted localStorage key and never changes it.
(() => {
  "use strict";

  const format = "kiyovn-legacy-asset-items";
  const storageKey = "kiyovn_cache_asset_items";
  const maxRecords = 10_000;
  const maxBytes = 7 * 1024 * 1024;
  const maxRecordBytes = 128 * 1024;
  const raw = localStorage.getItem(storageKey);
  if (raw === null) throw new Error(`Không tìm thấy cache '${storageKey}'; chưa tạo tệp.`);

  let records;
  try {
    records = JSON.parse(raw);
  } catch {
    throw new Error("Cache asset_items không phải JSON hợp lệ; chưa tạo tệp.");
  }
  if (!Array.isArray(records)) throw new Error("Cache asset_items không phải mảng; chưa tạo tệp.");
  if (records.length < 1 || records.length > maxRecords) {
    throw new Error(`Số tài sản phải nằm trong 1..${maxRecords}; chưa tạo tệp.`);
  }

  const keys = new Set();
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error("Cache có bản ghi tài sản không phải đối tượng; chưa tạo tệp.");
    }
    const bytes = new TextEncoder().encode(JSON.stringify(record)).length;
    if (bytes > maxRecordBytes) throw new Error("Một bản ghi tài sản vượt quá 128 KiB; chưa tạo tệp.");

    // Mirror the Rust collection identity order without rewriting the source JSON.
    const candidate = typeof record.key === "string"
      ? record.key
      : typeof record.id === "string"
        ? record.id
        : typeof record.code === "string"
          ? record.code
          : null;
    if (candidate === null || !candidate || candidate.trim() !== candidate
        || candidate.length > 160 || /[\u0000-\u001f\u007f]/.test(candidate)) {
      throw new Error("Tài sản thiếu key/id/code ổn định hợp lệ; chưa tạo tệp.");
    }
    if (keys.has(candidate)) throw new Error("Cache có key tài sản trùng; chưa tạo tệp.");
    keys.add(candidate);
  }

  const bundle = {
    format,
    schemaVersion: 1,
    batchId: crypto.randomUUID(),
    sourceOrigin: location.origin,
    exportedAt: new Date().toISOString(),
    records,
  };
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > maxBytes) throw new Error("Gói xuất vượt quá 7 MiB; chưa tạo tệp.");

  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kiyovn-legacy-asset-items-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);

  // Inventory may contain serial numbers, assigned staff and internal locations.
  // Never log row contents; warn operators to keep the exported file protected.
  console.warn("Đã xuất asset_items theo chế độ chỉ đọc; localStorage không bị sửa. Tệp có thể chứa số sê-ri, người sử dụng và vị trí nội bộ; chỉ lưu ở nơi được phê duyệt.", {
    origin: bundle.sourceOrigin,
    batchId: bundle.batchId,
    recordCount: records.length,
    bytes,
  });
})();
