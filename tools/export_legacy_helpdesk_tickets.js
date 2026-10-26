// Read-only exporter for the legacy browser cache of Helpdesk tickets.
// Run only in DevTools on the original KiyoVN legacy web origin after the
// Tickets screen has loaded. This script reads one allowlisted key only.
(() => {
  "use strict";

  const format = "kiyovn-legacy-helpdesk-tickets";
  const storageKey = "kiyovn_cache_tickets";
  const maxRecords = 5000;
  const maxBytes = 7 * 1024 * 1024;
  const maxRecordBytes = 64 * 1024;
  const raw = localStorage.getItem(storageKey);
  if (raw === null) throw new Error(`Không tìm thấy cache '${storageKey}'; chưa tạo tệp.`);

  let tickets;
  try {
    tickets = JSON.parse(raw);
  } catch {
    throw new Error("Cache tickets không phải JSON hợp lệ; chưa tạo tệp.");
  }
  if (!Array.isArray(tickets)) throw new Error("Cache tickets không phải mảng; chưa tạo tệp.");
  if (tickets.length < 1 || tickets.length > maxRecords) {
    throw new Error(`Số ticket phải nằm trong 1..${maxRecords}; chưa tạo tệp.`);
  }

  const keys = new Set();
  for (const ticket of tickets) {
    if (!ticket || typeof ticket !== "object" || Array.isArray(ticket)) {
      throw new Error("Cache có bản ghi không phải đối tượng; chưa tạo tệp.");
    }
    const bytes = new TextEncoder().encode(JSON.stringify(ticket)).length;
    if (bytes > maxRecordBytes) throw new Error("Một bản ghi vượt quá 64 KiB; chưa tạo tệp.");
    if (typeof ticket.key !== "string" || !ticket.key.trim()
        || ticket.key.trim() !== ticket.key || ticket.key.length > 256
        || /[\u0000-\u001f\u007f]/.test(ticket.key)) {
      throw new Error("Bản ghi thiếu key ổn định hợp lệ; chưa tạo tệp.");
    }
    if (keys.has(ticket.key)) throw new Error("Cache có key ticket trùng; chưa tạo tệp.");
    keys.add(ticket.key);
  }

  const bundle = {
    format,
    schemaVersion: 1,
    batchId: crypto.randomUUID(),
    sourceOrigin: location.origin,
    exportedAt: new Date().toISOString(),
    tickets,
  };
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > maxBytes) throw new Error("Gói xuất vượt quá 7 MiB; chưa tạo tệp.");

  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kiyovn-legacy-helpdesk-tickets-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);

  // Titles and requester names may be personal or operational data; never log rows.
  console.warn("Đã xuất cache ticket theo chế độ chỉ đọc; localStorage không bị sửa. Tệp chứa dữ liệu yêu cầu/người gửi, hãy lưu ở nơi được phê duyệt và xóa bản tạm sau khi xác minh.", {
    origin: bundle.sourceOrigin,
    batchId: bundle.batchId,
    ticketCount: tickets.length,
    bytes,
  });
})();
