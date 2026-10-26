// Read-only exporter for the legacy asset_depreciations collection/cache.
// Paste into DevTools on the original legacy origin while signed in as ADMIN.
(() => (async () => {
  "use strict";
  const format = "kiyovn-legacy-asset-depreciations";
  const tokenKey = "minepanel_token";
  const cacheKey = "kiyovn_cache_asset_depreciations";
  const limit = 500;
  const maxRecords = 10_000;
  const maxBytes = 7 * 1024 * 1024;
  const maxRecordBytes = 128 * 1024;
  const apiBase = new URL("/api/v1", location.origin);
  if (apiBase.origin !== location.origin) throw new Error("Exporter chỉ gửi token tới origin hiện tại.");
  const token = localStorage.getItem(tokenKey);
  if (!token) throw new Error(`Không tìm thấy '${tokenKey}'; hãy đăng nhập legacy bằng tài khoản ADMIN.`);

  let cachedRecords = null;
  let cacheError = false;
  const rawCache = localStorage.getItem(cacheKey);
  if (rawCache !== null) {
    try {
      cachedRecords = JSON.parse(rawCache);
      if (!Array.isArray(cachedRecords)) cacheError = true;
    } catch { cacheError = true; }
  }

  const serverRecords = [];
  const serverKeys = new Set();
  let totalRecords;
  let totalPages;
  let serverBytes = 0;
  for (let page = 1; page <= Math.ceil(maxRecords / limit); page += 1) {
    const url = new URL(`${apiBase.pathname.replace(/\/$/, "")}/collections/asset_depreciations`, apiBase.origin);
    url.searchParams.set("page", String(page));
    url.searchParams.set("limit", String(limit));
    let response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        credentials: "omit", cache: "no-store", redirect: "error",
      });
    } catch { throw new Error("Không thể đọc collection asset_depreciations cùng origin; chưa tạo tệp."); }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("Phiên hết hạn hoặc tài khoản không có quyền ADMIN; chưa tạo tệp.");
      throw new Error(`API legacy trả HTTP ${response.status}; chưa tạo tệp.`);
    }
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error("API legacy không trả JSON hợp lệ; chưa tạo tệp."); }
    const paging = payload?.pagination;
    if (!Array.isArray(payload?.data) || !paging || paging.page !== page || paging.limit !== limit
      || !Number.isInteger(paging.total) || paging.total < 0 || paging.total > maxRecords
      || !Number.isInteger(paging.totalPages) || paging.totalPages !== Math.ceil(paging.total / limit)) {
      throw new Error("Phân trang asset_depreciations không hợp lệ hoặc vượt giới hạn; chưa tạo tệp.");
    }
    if (totalRecords === undefined) {
      totalRecords = paging.total;
      totalPages = paging.totalPages;
    } else if (paging.total !== totalRecords || paging.totalPages !== totalPages) {
      throw new Error("Collection thay đổi trong lúc xuất; hãy thử lại. Chưa tạo tệp.");
    }
    const expectedLength = Math.min(limit, totalRecords - (page - 1) * limit);
    if (payload.data.length !== expectedLength) throw new Error("Trang dữ liệu thiếu hoặc thay đổi; chưa tạo tệp.");
    for (const record of payload.data) {
      if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Nguồn chứa bản ghi không phải đối tượng.");
      const key = record.key;
      if (typeof key !== "string" || !key || key.trim() !== key || key.length > 160 || /[\u0000-\u001f\u007f]/.test(key)) {
        throw new Error("Hồ sơ thiếu key ổn định hợp lệ; chưa tạo tệp.");
      }
      if (serverKeys.has(key)) throw new Error("Collection có key hồ sơ trùng lặp; chưa tạo tệp.");
      serverKeys.add(key);
      const size = new TextEncoder().encode(JSON.stringify(record)).length;
      if (size > maxRecordBytes) throw new Error("Một hồ sơ vượt quá 128 KiB; chưa tạo tệp.");
      serverBytes += size;
      if (serverBytes > maxBytes) throw new Error("Collection máy chủ vượt giới hạn gói 7 MiB; chưa tạo tệp.");
      serverRecords.push(record);
    }
    if (totalPages === 0 || page === totalPages) break;
    if (page === Math.ceil(maxRecords / limit)) throw new Error("Collection vượt giới hạn phân trang.");
  }
  if (serverRecords.length !== (totalRecords ?? 0)) throw new Error("Tổng số hồ sơ không khớp phân trang.");

  const sourceMode = serverRecords.length > 0 ? "server_collection" : "browser_cache_fallback";
  const records = serverRecords.length > 0 ? serverRecords : cachedRecords;
  if (!Array.isArray(records) || records.length < 1 || records.length > maxRecords) {
    throw new Error(cacheError
      ? "Cache asset_depreciations lỗi và collection máy chủ rỗng; chưa tạo tệp."
      : "Không tìm thấy hồ sơ ở máy chủ hoặc cache legacy; chưa tạo tệp.");
  }
  const keys = new Set();
  let totalBytes = 0;
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("Nguồn có bản ghi không phải đối tượng.");
    const key = record.key;
    if (typeof key !== "string" || !key || key.trim() !== key || key.length > 160 || /[\u0000-\u001f\u007f]/.test(key)) {
      throw new Error("Hồ sơ thiếu key ổn định hợp lệ; chưa tạo tệp.");
    }
    if (keys.has(key)) throw new Error("Nguồn có key hồ sơ trùng lặp; chưa tạo tệp.");
    keys.add(key);
    const size = new TextEncoder().encode(JSON.stringify(record)).length;
    if (size > maxRecordBytes) throw new Error("Một hồ sơ vượt quá 128 KiB; chưa tạo tệp.");
    totalBytes += size;
    if (totalBytes > maxBytes) throw new Error("Dữ liệu nguồn vượt giới hạn gói 7 MiB; chưa tạo tệp.");
  }

  const bundle = {
    format, schemaVersion: 1, sourceMode, batchId: crypto.randomUUID(),
    sourceOrigin: location.origin, exportedAt: new Date().toISOString(), records,
  };
  const json = `${JSON.stringify(bundle, null, 2)}\n`;
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > maxBytes) throw new Error("Gói xuất vượt giới hạn 7 MiB; chưa tạo tệp.");
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `kiyovn-legacy-asset-depreciations-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  console.warn("Đã xuất asset_depreciations chỉ bằng GET/cache read; legacy không bị sửa. Tệp chứa mã tài sản, phòng ban, giá trị và lịch sử kế toán nội bộ; hãy lưu/chuyển theo chính sách bảo mật.", {
    sourceMode, batchId: bundle.batchId, recordCount: records.length, bytes,
  });
  return { sourceMode, batchId: bundle.batchId, recordCount: records.length, bytes };
})())();
