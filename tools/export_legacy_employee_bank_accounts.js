// Read-only exporter for the legacy employee_bank_accounts browser cache.
// Run on the original KiyoVN legacy origin in DevTools after that module has loaded.
// It reads one allowlisted localStorage key and never changes storage or calls an API.
(() => {
  "use strict";

  const format = "kiyovn-legacy-employee-bank-accounts";
  const storageKey = "kiyovn_cache_employee_bank_accounts";
  const maxRecords = 5000;
  const maxBytes = 7 * 1024 * 1024;
  const raw = localStorage.getItem(storageKey);

  if (raw === null) {
    throw new Error(`Không tìm thấy ${storageKey}; không tạo tệp.`);
  }

  let records;
  try {
    records = JSON.parse(raw);
  } catch {
    throw new Error("Cache tài khoản ngân hàng không phải JSON hợp lệ; không tạo tệp.");
  }
  if (!Array.isArray(records)) {
    throw new Error("Cache tài khoản ngân hàng không phải mảng; không tạo tệp.");
  }
  if (records.length > maxRecords) {
    throw new Error(`Cache vượt quá ${maxRecords} bản ghi; không tạo tệp.`);
  }

  const usedKeys = new Set();
  const accounts = records.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return { id: `legacy-row-${String(index + 1).padStart(6, "0")}`, legacyValue: record };
    }
    const suppliedId = typeof record.id === "string" && record.id.trim()
      ? record.id.trim()
      : typeof record.key === "string" && record.key.trim()
        ? record.key.trim()
        : `legacy-row-${String(index + 1).padStart(6, "0")}`;
    const originalId = suppliedId.length <= 256 && !/[\u0000-\u001f\u007f]/.test(suppliedId)
      ? suppliedId
      : `legacy-row-${String(index + 1).padStart(6, "0")}`;
    let stableId = originalId;
    if (usedKeys.has(stableId)) {
      stableId = `legacy-row-${String(index + 1).padStart(6, "0")}`;
      if (usedKeys.has(stableId)) {
        throw new Error("Không tạo được khóa ổn định duy nhất cho các hàng trùng ID.");
      }
      usedKeys.add(stableId);
      return { ...record, id: stableId, legacyOriginalId: originalId };
    }
    usedKeys.add(stableId);
    return originalId === suppliedId
      ? { ...record, id: stableId }
      : { ...record, id: stableId, legacyOriginalId: suppliedId };
  });

  const bundle = {
    format,
    schemaVersion: 1,
    batchId: crypto.randomUUID(),
    sourceOrigin: location.origin,
    exportedAt: new Date().toISOString(),
    accounts,
  };
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  if (blob.size > maxBytes) {
    throw new Error("Gói xuất vượt quá 7 MiB; không tải tệp xuống.");
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `kiyovn-legacy-employee-bank-accounts-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  console.info("Đã xuất cache chỉ-đọc; không thay đổi legacy localStorage.", {
    origin: bundle.sourceOrigin,
    batchId: bundle.batchId,
    accountRows: accounts.length,
    bytes: blob.size,
  });
})();
