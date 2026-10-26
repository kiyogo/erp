// Read-only exporter for the legacy Enterprise Reports catalog.
// Paste into DevTools on the original legacy origin while signed in as ADMIN.
// Mirrors dataService.getGenericData: use server rows when present, otherwise its localStorage fallback.
(() => (async () => {
  "use strict";

  const format = "kiyovn-legacy-reports-catalog";
  const tokenKey = "minepanel_token";
  const cacheKey = "kiyovn_cache_reports_catalog";
  const limit = 500;
  const maxRecords = 10_000;
  const maxBytes = 7 * 1024 * 1024;
  const maxRecordBytes = 128 * 1024;
  const apiBase = new URL("/api/v1", location.origin);
  if (apiBase.origin !== location.origin) throw new Error("Exporter chỉ gửi token tới đúng origin đang mở.");

  const token = localStorage.getItem(tokenKey);
  if (!token) throw new Error(`Không tìm thấy phiên đăng nhập '${tokenKey}'; hãy đăng nhập legacy bằng tài khoản ADMIN.`);

  const rawCache = localStorage.getItem(cacheKey);
  let cachedRecords = null;
  let cacheError = false;
  if (rawCache !== null) {
    try {
      cachedRecords = JSON.parse(rawCache);
      if (!Array.isArray(cachedRecords)) cacheError = true;
    } catch {
      cacheError = true;
    }
  }

  const serverRecords = [];
  let serverRecordBytes = 0;
  let expectedTotal;
  let expectedPages;
  const maxPages = Math.ceil(maxRecords / limit);
  for (let page = 1; page <= maxPages; page += 1) {
    const url = new URL(`${apiBase.pathname.replace(/\/$/, "")}/collections/reports_catalog`, apiBase.origin);
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
      throw new Error("Không thể đọc collection reports_catalog cùng origin; chưa tạo tệp.");
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
      throw new Error(`Phân trang reports_catalog không hợp lệ hoặc vượt ${maxRecords} bản ghi; chưa tạo tệp.`);
    }
    if (expectedTotal === undefined) {
      expectedTotal = pagination.total;
      expectedPages = pagination.totalPages;
    } else if (pagination.total !== expectedTotal || pagination.totalPages !== expectedPages) {
      throw new Error("Danh mục thay đổi trong lúc xuất; hãy thử lại khi dữ liệu ổn định. Chưa tạo tệp.");
    }
    const expectedPageRecords = Math.min(limit, expectedTotal - (page - 1) * limit);
    if (payload.data.length !== expectedPageRecords) {
      throw new Error("Một trang báo cáo bị thiếu hoặc thay đổi trong lúc xuất; chưa tạo tệp.");
    }
    for (const record of payload.data) {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        throw new Error("Danh mục có bản ghi báo cáo không phải đối tượng; chưa tạo tệp.");
      }
      const bytes = new TextEncoder().encode(JSON.stringify(record)).length;
      if (bytes > maxRecordBytes) throw new Error("Một báo cáo vượt quá 128 KiB; chưa tạo tệp.");
      serverRecordBytes += bytes;
      if (serverRecordBytes > maxBytes) throw new Error("Danh mục máy chủ vượt giới hạn gói 7 MiB; chưa tạo tệp.");
      serverRecords.push(record);
    }
    if (expectedPages === 0 || page === expectedPages) break;
    if (page === maxPages) throw new Error("Danh mục vượt giới hạn số trang; chưa tạo tệp.");
  }
  if (serverRecords.length !== (expectedTotal ?? 0)) {
    throw new Error("Tổng số báo cáo không khớp phân trang; chưa tạo tệp.");
  }

  const sourceMode = serverRecords.length > 0 ? "server_collection" : "browser_cache_fallback";
  const records = serverRecords.length > 0 ? serverRecords : cachedRecords;
  if (!Array.isArray(records) || records.length < 1 || records.length > maxRecords) {
    const reason = cacheError
      ? "Cache reports_catalog lỗi và collection máy chủ rỗng"
      : "Không tìm thấy báo cáo ở máy chủ hoặc cache legacy";
    throw new Error(`${reason}; chưa tạo tệp.`);
  }

  const keys = new Set();
  let recordBytes = 0;
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error("Nguồn có báo cáo không phải đối tượng; chưa tạo tệp.");
    }
    const serialized = JSON.stringify(record);
    const bytes = new TextEncoder().encode(serialized).length;
    recordBytes += bytes;
    if (recordBytes > maxBytes) throw new Error("Dữ liệu nguồn vượt giới hạn gói 7 MiB; chưa tạo tệp.");
    if (bytes > maxRecordBytes) throw new Error("Một báo cáo vượt quá 128 KiB; chưa tạo tệp.");
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
      throw new Error("Báo cáo thiếu key/id/code ổn định hợp lệ; chưa tạo tệp.");
    }
    if (keys.has(candidate)) throw new Error("Nguồn có key báo cáo trùng lặp; chưa tạo tệp.");
    keys.add(candidate);
  }

  const bundle = {
    format,
    schemaVersion: 1,
    sourceMode,
    batchId: crypto.randomUUID(),
    sourceOrigin: location.origin,
    exportedAt: new Date().toISOString(),
    records,
  };
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > maxBytes) throw new Error("Gói xuất vượt giới hạn 7 MiB; chưa tạo tệp.");

  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kiyovn-legacy-reports-catalog-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);

  console.warn("Đã xuất reports_catalog chỉ bằng GET/cache read; localStorage legacy không bị sửa. Tệp có thể chứa nội dung báo cáo nội bộ; chỉ lưu/chuyển tại nơi được phê duyệt.", {
    origin: bundle.sourceOrigin,
    sourceMode,
    batchId: bundle.batchId,
    recordCount: records.length,
    bytes,
  });
  return { batchId: bundle.batchId, sourceMode, recordCount: records.length, bytes };
})())();
