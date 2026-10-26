import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// shortcut: classic ZIP is limited to 4 GiB and 65,535 entries; add ZIP64 before supporting larger backups.
const MAX_ARCHIVE_BYTES = 0xffffffff;
const MAX_ENTRIES = 65534;
const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function crcUpdate(crc, bytes) {
  for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
  return crc >>> 0;
}
function fail(statusCode, message) {
  return Object.assign(new Error(message), { statusCode, status: statusCode });
}
async function fingerprint(filePath) {
  const hash = createHash('sha256');
  let size = 0;
  let crc = 0xffffffff;
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk); crc = crcUpdate(crc, chunk); size += chunk.length;
    if (size >= MAX_ARCHIVE_BYTES) throw fail(413, 'Tệp quá lớn cho định dạng ZIP hiện tại (giới hạn dưới 4 GiB).');
  }
  return { size, checksumSha256: hash.digest('hex'), crc: (crc ^ 0xffffffff) >>> 0 };
}
async function writeZip(destination, entries) {
  if (entries.length > MAX_ENTRIES) throw fail(413, 'Số tệp vượt giới hạn ZIP hiện tại (65.534 tệp).');
  const handle = await open(destination, 'wx', 0o600);
  let offset = 0;
  const central = [];
  const write = async bytes => {
    if (offset + bytes.length >= MAX_ARCHIVE_BYTES) throw fail(413, 'Bản sao lưu vượt giới hạn ZIP hiện tại (dưới 4 GiB).');
    for (let position = 0; position < bytes.length;) {
      const { bytesWritten } = await handle.write(bytes, position, bytes.length - position);
      if (!bytesWritten) throw new Error('Không ghi được tệp sao lưu.');
      position += bytesWritten;
    }
    offset += bytes.length;
  };
  try {
    for (const entry of entries) {
      const name = Buffer.from(entry.name, 'utf8');
      if (name.length > 65535 || entry.name.split('/').some(part => part === '..' || part === '.') || entry.name.startsWith('/')) throw fail(422, 'Tên tệp sao lưu không hợp lệ.');
      const start = offset;
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
      local.writeUInt16LE(33, 12); local.writeUInt32LE(entry.crc, 14);
      local.writeUInt32LE(entry.size, 18); local.writeUInt32LE(entry.size, 22); local.writeUInt16LE(name.length, 26);
      await write(local); await write(name);
      const copied = createHash('sha256');
      let size = 0;
      const chunks = entry.content ? [entry.content] : createReadStream(entry.filePath);
      for await (const chunk of chunks) { copied.update(chunk); size += chunk.length; await write(chunk); }
      if (size !== entry.size || copied.digest('hex') !== entry.checksumSha256) throw fail(409, 'Tệp đã thay đổi trong lúc sao lưu. Vui lòng tạo lại bản sao lưu.');
      const directory = Buffer.alloc(46);
      directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8);
      directory.writeUInt16LE(33, 14); directory.writeUInt32LE(entry.crc, 16);
      directory.writeUInt32LE(entry.size, 20); directory.writeUInt32LE(entry.size, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(start, 42);
      central.push(directory, name);
    }
    const directoryOffset = offset;
    for (const bytes of central) await write(bytes);
    const directoryLength = offset - directoryOffset;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directoryLength, 12); end.writeUInt32LE(directoryOffset, 16);
    await write(end);
    await handle.sync();
  } finally { await handle.close(); }
}

export function createBackupManager({ db, filesDir, dataDir }) {
  const directory = path.resolve(dataDir, 'backups');
  const filesDirectory = path.resolve(filesDir);
  const validKey = key => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(key))) throw fail(422, 'Mã bản sao lưu không hợp lệ.');
    return String(key);
  };
  const metadataPath = key => path.join(directory, `${validKey(key)}.json`);
  const archivePath = key => path.join(directory, `${validKey(key)}.zip`);
  const capabilities = () => ({
    database: !db.pool && typeof db.backupTo === 'function',
    fullSystem: !db.pool && typeof db.backupTo === 'function', storageBlob: true,
    restore: false, autoDaily: false, encryptionKeysIncluded: false,
    engine: db.pool ? 'PostgreSQL' : 'SQLite', maxArchiveBytes: MAX_ARCHIVE_BYTES - 1, maxEntries: MAX_ENTRIES,
    reason: db.pool ? 'Chưa có cơ chế xuất PostgreSQL được cấu hình. Có thể sao lưu kho tệp riêng.' : '',
  });
  const saveMetadata = async backup => {
    const temporary = path.join(directory, `${backup.key}-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(backup, null, 2), { mode: 0o600, flag: 'wx' });
      await rename(temporary, metadataPath(backup.key));
    } finally { await rm(temporary, { force: true }); }
  };
  const get = async key => {
    let backup;
    try { backup = JSON.parse(await readFile(metadataPath(key), 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') throw fail(404, 'Không tìm thấy bản sao lưu vật lý.'); throw error; }
    if (backup.key !== key || backup.format !== 'KIYOVN_BACKUP_V1') throw fail(422, 'Hồ sơ bản sao lưu không hợp lệ.');
    return backup;
  };
  const list = async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const data = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[0-9a-f-]{36}\.json$/i.test(entry.name)) continue;
      const key = entry.name.slice(0, -5);
      try {
        const backup = await get(key);
        const file = await stat(archivePath(key)).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
        const available = Boolean(file?.isFile());
        data.push({ ...backup, available, ...(available ? { sizeBytes: file.size } : { status: 'Thiếu tệp sao lưu' }) });
      } catch (error) {
        if (error instanceof SyntaxError || error.statusCode === 422) continue;
        throw error;
      }
    }
    data.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { data, capabilities: capabilities() };
  };
  const create = async (input, actor) => {
    const name = String(input?.name || '').trim();
    const type = input?.type;
    if (!name || name.length > 160) throw fail(422, 'Tên bản sao lưu phải dài từ 1 đến 160 ký tự.');
    if (!['Full System', 'Database', 'Storage Blob'].includes(type)) throw fail(422, 'Phạm vi sao lưu không được hỗ trợ.');
    if (!actor?.id || !actor?.name) throw fail(422, 'Cần người thực hiện đã được xác thực.');
    if (type !== 'Storage Blob' && !capabilities().database) throw fail(422, capabilities().reason || 'Chưa hỗ trợ sao lưu cơ sở dữ liệu này.');
    if (filesDirectory === path.resolve(dataDir)) throw fail(422, 'Thư mục tệp phải tách khỏi thư mục cấu hình hệ thống để không sao lưu nhầm khóa mã hóa.');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await mkdir(filesDirectory, { recursive: true });
    const work = await mkdtemp(path.join(directory, '.creating-'));
    const key = randomUUID();
    let published = false;
    try {
      const createdAt = new Date().toISOString();
      const entries = [];
      if (type !== 'Storage Blob') {
        const snapshot = path.join(work, 'kiyovn.sqlite');
        await db.backupTo(snapshot);
        entries.push({ name: 'database/kiyovn.sqlite', filePath: snapshot, ...await fingerprint(snapshot) });
      }
      if (type !== 'Database') {
        const root = await realpath(filesDirectory);
        const walk = async folder => {
          for (const entry of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
            const absolute = path.join(folder, entry.name);
            const info = await lstat(absolute);
            if (info.isSymbolicLink()) throw fail(422, 'Kho tệp có liên kết tượng trưng; cần xử lý liên kết trước khi sao lưu.');
            const resolved = await realpath(absolute);
            const relative = path.relative(root, resolved);
            if (relative.startsWith('..') || path.isAbsolute(relative)) throw fail(422, 'Tệp nằm ngoài kho tệp được cấu hình.');
            if (resolved === directory) continue;
            if (info.isDirectory()) await walk(resolved);
            else if (info.isFile()) {
              entries.push({ name: `files/${relative.split(path.sep).join('/')}`, filePath: resolved, ...await fingerprint(resolved) });
              if (entries.length >= MAX_ENTRIES) throw fail(413, 'Kho tệp vượt giới hạn số tệp của ZIP hiện tại.');
            } else throw fail(422, 'Kho tệp chứa loại tệp không hỗ trợ sao lưu.');
          }
        };
        await walk(root);
      }
      const manifest = {
        format: 'KIYOVN_BACKUP_V1', key, name, type, createdAt, createdBy: actor.id, creator: actor.name,
        databaseEngine: type === 'Storage Blob' ? null : 'SQLite', compression: 'ZIP store (không nén)',
        encryptionKeysIncluded: false,
        restoreRequirements: 'Bảo quản riêng khóa mã hóa cấu hình và dữ liệu gốc. Khôi phục tự động chưa được hỗ trợ.',
        consistency: 'SQLite dùng API snapshot. Từng tệp được kiểm tra băm khi đọc và sao chép; không có giao dịch chung giữa CSDL và kho tệp.',
        files: entries.map(({ name, size, checksumSha256 }) => ({ name, sizeBytes: size, checksumSha256 })),
      };
      const content = Buffer.from(JSON.stringify(manifest, null, 2));
      entries.push({ name: 'manifest.json', content, size: content.length, checksumSha256: createHash('sha256').update(content).digest('hex'), crc: (crcUpdate(0xffffffff, content) ^ 0xffffffff) >>> 0 });
      const output = path.join(work, 'archive.zip');
      await writeZip(output, entries);
      const actual = await fingerprint(output);
      const backup = {
        format: 'KIYOVN_BACKUP_V1', key, code: `SNAP-${createdAt.slice(0, 10).replace(/-/g, '')}-${key.slice(0, 8).toUpperCase()}`,
        name, type, sizeBytes: actual.size, size: `${(actual.size / 1024 / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} MB`,
        createdAt, creator: actor.name, createdBy: actor.id, location: 'Kho sao lưu cục bộ trên máy chủ',
        checksumSha256: actual.checksumSha256, rtoEstimated: 'Chưa đo kiểm khôi phục', status: 'Đã xác minh SHA-256',
        verifiedAt: new Date().toISOString(), fileName: `${key}.zip`, available: true, restorable: false,
        fileCount: manifest.files.length, encryptionKeysIncluded: false,
      };
      await rename(output, archivePath(key));
      published = true;
      await saveMetadata(backup);
      return backup;
    } catch (error) {
      if (published) await rm(archivePath(key), { force: true });
      throw error;
    } finally {
      const relativeWork = path.relative(directory, path.resolve(work));
      if (!relativeWork || relativeWork.startsWith('..') || path.isAbsolute(relativeWork)) throw fail(500, 'Thư mục tạm nằm ngoài kho sao lưu.');
      await rm(work, { recursive: true, force: true });
    }
  };
  const verify = async key => {
    const backup = await get(key);
    let actual;
    try { actual = await fingerprint(archivePath(key)); }
    catch (error) { if (error.code === 'ENOENT') throw fail(404, 'Tệp sao lưu không còn trên máy chủ.'); throw error; }
    const matches = actual.checksumSha256 === backup.checksumSha256;
    const updated = { ...backup, available: true, sizeBytes: actual.size, verifiedAt: new Date().toISOString(), actualChecksumSha256: actual.checksumSha256, status: matches ? 'Đã xác minh SHA-256' : 'Không khớp SHA-256' };
    await saveMetadata(updated);
    return updated;
  };
  const download = async key => {
    const backup = await verify(key);
    if (backup.checksumSha256 !== backup.actualChecksumSha256) throw fail(409, 'Mã băm tệp sao lưu không khớp. Không tải bản sao lưu bị thay đổi.');
    return { backup, filePath: archivePath(key), fileName: `${backup.code}.zip`, sizeBytes: backup.sizeBytes };
  };
  return { capabilities, list, create, verify, download };
}
