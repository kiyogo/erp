// Read-only exporter for the legacy server-side asset_allocations collection.
// Paste into DevTools on the original legacy origin while signed in as ADMIN.
// The bearer token is used only for same-origin GET requests and is never exported or logged.
(() => (async () => {
  "use strict";

  const format = "kiyovn-legacy-asset-allocations";
  const storageKey = "minepanel_token";
  const limit = 500;
  const maxRecords = 10_000;
  const maxBytes = 7 * 1024 * 1024;
  const maxRecordBytes = 128 * 1024;
  const apiBase = new URL("/api/v1", location.origin);
  if (apiBase.origin !== location.origin) throw new Error("Exporter chỉ gửi token tới đúng origin đang mở.");

  const token = localStorage.getItem(storageKey);
  if (!token) throw new Error(`Không tìm thấy phiên đăng nhập '${storageKey}'; hãy đăng nhập legacy bằng tài khoản ADMIN.`);

  const records = [];
  const keys = new Set();
  let expectedTotal;
  let expectedPages;
  const maxPages = Math.ceil(maxRecords / limit);

  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`${apiBase.pathname.replace(/\/$/, "")}/collections/asset_allocations`, apiBase.origin);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(limit));
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
      });
    } catch {
      throw new Error("Không thể đọc collection legacy bằng GET cùng origin; chưa tạo tệp.");
    }
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? "Phiên hết hạn hoặc tài khoản không có quyền ADMIN; chưa tạo tệp."
        : `API legacy trả HTTP ${response.status}; chưa tạo tệp.`;
      throw new Error(message);
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      throw new Error("API legacy không trả JSON hợp lệ; chưa tạo tệp.");
    }
    const pagination = payload?.pagination;
    if (!Array.isArray(payload?.data) || !pagination
        || pagination.page !== page || pagination.limit !== limit
        || !Number.isInteger(pagination.total) || pagination.total < 0 || pagination.total > maxRecords
        || !Number.isInteger(pagination.totalPages)
        || pagination.totalPages !== Math.ceil(pagination.total / limit)) {
      throw new Error("Phân trang asset_allocations không hợp lệ hoặc vượt 10.000 bản ghi; chưa tạo tệp.");
    }
    if (expectedTotal === undefined) {
      expectedTotal = pagination.total;
      expectedPages = pagination.totalPages;
      if (expectedTotal < 1) throw new Error("Legacy chưa có biên bản cấp phát để xuất; chưa tạo tệp.");
    } else if (pagination.total !== expectedTotal || pagination.totalPages !== expectedPages) {
      throw new Error("Collection thay đổi trong lúc xuất; hãy thử lại khi dữ liệu ổn định. Chưa tạo tệp.");
    }
    const expectedPageRecords = Math.min(limit, expectedTotal - (page - 1) * limit);
    if (payload.data.length !== expectedPageRecords) {
      throw new Error("Một trang dữ liệu bị thiếu hoặc thay đổi trong lúc xuất; chưa tạo tệp.");
    }

    for (const record of payload.data) {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error("Collection có bản ghi không phải đối tượng; chưa tạo tệp.");
      }
      const bytes = new TextEncoder().encode(JSON.stringify(record)).length;
      if (bytes > maxRecordBytes) throw new Error("Một biên bản vượt quá 128 KiB; chưa tạo tệp.");
      const candidate = typeof record.key === "string"
        ? record.key
        : typeof record.id === "string"
          ? record.id
          : typeof record.code === "string"
            ? record.code
            : null;
      if (candidate === null || !candidate || candidate.trim() !== candidate
          || new TextEncoder().encode(candidate).length > 160
          || /[\u0000-\u001f\u007f]/.test(candidate)) {
        throw new Error("Biên bản thiếu key/id/code ổn định hợp lệ; chưa tạo tệp.");
      }
      if (keys.has(candidate)) throw new Error("Collection có key biên bản trùng lặp; chưa tạo tệp.");
      keys.add(candidate);
      records.push(record);
    }

    if (page === expectedPages) break;
    if (page === maxPages) throw new Error("Collection vượt giới hạn số trang; chưa tạo tệp.");
  }

  if (records.length !== expectedTotal) throw new Error("Tổng số biên bản không khớp phân trang; chưa tạo tệp.");

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
  if (bytes > maxBytes) throw new Error("Gói xuất vượt giới hạn 7 MiB; chia lô chưa được hỗ trợ, chưa tạo tệp.");

  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kiyovn-legacy-asset-allocations-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);

  // This bundle can contain employee names/codes, serial numbers and internal notes.
  // Do not print record contents, the bearer token, or response bodies to the console.
  console.warn("Đã xuất asset_allocations chỉ bằng GET; dữ liệu legacy không bị sửa. Tệp có thể chứa thông tin nhân viên, số sê-ri và ghi chú nội bộ; hãy lưu/chuyển tệp theo chính sách bảo mật.", {
    origin: bundle.sourceOrigin,
    batchId: bundle.batchId,
    recordCount: records.length,
    bytes,
  });
  return { batchId: bundle.batchId, recordCount: records.length, bytes };
})())();
