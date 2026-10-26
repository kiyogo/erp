// Read-only exporter for the legacy browser cache of Helpdesk incidents.
// Run in DevTools on the original KiyoVN legacy origin after the Incidents
// screen has loaded. Only the allowlisted cache key is read; storage is never
// modified and incident rows are never logged.
(() => {
  "use strict";

  const format = "kiyovn-legacy-helpdesk-incidents";
  const storageKey = "kiyovn_cache_ticket_incidents";
  const maxRecords = 5000;
  const maxBytes = 7 * 1024 * 1024;
  const maxRecordBytes = 64 * 1024;
  const raw = localStorage.getItem(storageKey);
  if (raw === null) throw new Error(`Không tìm thấy cache '${storageKey}'; chưa tạo tệp.`);

  let incidents;
  try {
    incidents = JSON.parse(raw);
  } catch {
    throw new Error("Cache sự cố không phải JSON hợp lệ; chưa tạo tệp.");
  }
  if (!Array.isArray(incidents)) throw new Error("Cache sự cố không phải mảng; chưa tạo tệp.");
  if (incidents.length < 1 || incidents.length > maxRecords) {
    throw new Error(`Số hồ sơ phải nằm trong 1..${maxRecords}; chưa tạo tệp.`);
  }

  const keys = new Set();
  for (const incident of incidents) {
    if (!incident || typeof incident !== "object" || Array.isArray(incident)) {
      throw new Error("Cache có bản ghi không phải đối tượng; chưa tạo tệp.");
    }
    const bytes = new TextEncoder().encode(JSON.stringify(incident)).length;
    if (bytes > maxRecordBytes) throw new Error("Một bản ghi vượt quá 64 KiB; chưa tạo tệp.");
    if (typeof incident.key !== "string" || !incident.key.trim()
        || incident.key.trim() !== incident.key || incident.key.length > 256
        || /[\u0000-\u001f\u007f]/.test(incident.key)) {
      throw new Error("Bản ghi thiếu key ổn định hợp lệ; chưa tạo tệp.");
    }
    if (keys.has(incident.key)) throw new Error("Cache có key sự cố trùng; chưa tạo tệp.");
    keys.add(incident.key);
  }

  const bundle = {
    format,
    schemaVersion: 1,
    batchId: crypto.randomUUID(),
    sourceOrigin: location.origin,
    exportedAt: new Date().toISOString(),
    incidents,
  };
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > maxBytes) throw new Error("Gói xuất vượt quá 7 MiB; chưa tạo tệp.");

  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kiyovn-legacy-helpdesk-incidents-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);

  // Incident titles, root-cause notes and affected-system names may be sensitive.
  console.warn("Đã xuất cache sự cố theo chế độ chỉ đọc; localStorage không bị sửa. Tệp có thể chứa thông tin hạ tầng/nội bộ; hãy lưu tại nơi được phê duyệt và xóa bản tạm sau khi xác minh.", {
    origin: bundle.sourceOrigin,
    batchId: bundle.batchId,
    incidentCount: incidents.length,
    bytes,
  });
})();
