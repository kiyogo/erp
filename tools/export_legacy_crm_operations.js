// Read-only exporter for the two legacy CRM operations caches handled by Rust.
// Run this only in DevTools on the original KiyoVN legacy web origin.
// It reads two allowlisted localStorage keys and never writes storage, calls an API,
// or reads credentials, accounts, datastore seeds, or unrelated caches.
(() => {
  "use strict";

  const format = "kiyovn-legacy-crm-operations";
  const sources = [
    ["crm_supplier_evaluations", "supplierEvaluations"],
    ["crm_feedback", "customerFeedback"],
  ];
  const maxRecords = 5000;
  const maxBytes = 7 * 1024 * 1024;
  const recordsByField = {};
  let totalRecords = 0;

  function uuid() {
    if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  for (const [scope, field] of sources) {
    const storageKey = `kiyovn_cache_${scope}`;
    const raw = localStorage.getItem(storageKey);
    if (raw === null) {
      recordsByField[field] = [];
      continue;
    }

    let records;
    try {
      records = JSON.parse(raw);
    } catch {
      throw new Error(`Cache '${scope}' không phải JSON hợp lệ; chưa tạo tệp.`);
    }
    if (!Array.isArray(records)) {
      throw new Error(`Cache '${scope}' không phải mảng; chưa tạo tệp.`);
    }

    const keys = new Set();
    for (const record of records) {
      if (!record || typeof record !== "object" || Array.isArray(record)
          || typeof record.key !== "string" || !record.key.trim()
          || record.key.trim() !== record.key || record.key.length > 256
          || /[\u0000-\u001f\u007f]/.test(record.key)) {
        throw new Error(`Cache '${scope}' có bản ghi thiếu key ổn định hợp lệ; chưa tạo tệp.`);
      }
      if (keys.has(record.key)) {
        throw new Error(`Cache '${scope}' có key trùng lặp; chưa tạo tệp.`);
      }
      keys.add(record.key);
    }

    totalRecords += records.length;
    if (totalRecords > maxRecords) {
      throw new Error(`Gói có hơn ${maxRecords} bản ghi; chưa tạo tệp.`);
    }
    recordsByField[field] = records;
  }

  if (totalRecords === 0) {
    throw new Error("Không tìm thấy bản ghi đánh giá/ phản hồi trong hai cache CRM được hỗ trợ.");
  }

  const bundle = {
    format,
    schemaVersion: 1,
    batchId: uuid(),
    sourceOrigin: location.origin,
    exportedAt: new Date().toISOString(),
    supplierEvaluations: recordsByField.supplierEvaluations,
    customerFeedback: recordsByField.customerFeedback,
  };
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  if (blob.size > maxBytes) {
    throw new Error("Gói xuất vượt quá 7 MiB; chưa tải tệp xuống.");
  }

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kiyovn-legacy-crm-operations-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);

  // Never log record contents: customer feedback may include personal data and phone numbers.
  console.warn("Gói CRM đã tải xuống; localStorage legacy không bị thay đổi. Tệp có thể chứa số điện thoại và nội dung khách hàng ở dạng rõ. Chỉ chuyển/lưu trên thiết bị và đường dẫn được phê duyệt; xóa bản tạm an toàn sau khi nhập.", {
    origin: bundle.sourceOrigin,
    batchId: bundle.batchId,
    supplierEvaluations: bundle.supplierEvaluations.length,
    customerFeedback: bundle.customerFeedback.length,
    totalRecords,
    bytes: blob.size,
  });
})();
