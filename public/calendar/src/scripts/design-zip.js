const ZIP_MIME_TYPE = 'application/zip';
const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const UTF8_FLAG = 0x0800;
const STORED_METHOD = 0;
const DOS_DATE = 0x0021; // January 1, 1980; deterministic and valid in every timezone.
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_HEADER_SIZE = 22;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;
const CRC_POLYNOMIAL = 0xedb88320;
const CRC_CHUNK_SIZE = 1024 * 1024;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc >>> 1) ^ ((crc & 1) ? CRC_POLYNOMIAL : 0);
  }
  return crc >>> 0;
});

function assertZip32(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= UINT32_MAX) {
    throw new RangeError(`${label} exceeds ZIP32 limits.`);
  }
}

function encodePath(path, names) {
  if (typeof path !== 'string' || !path || /[\\:\u0000-\u001f\u007f]/u.test(path)
    || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new TypeError(`Unsafe ZIP path: ${String(path)}`);
  }
  const encoded = new TextEncoder().encode(path);
  // TextEncoder replaces unpaired surrogates; reject names that would silently change.
  if (new TextDecoder().decode(encoded) !== path) {
    throw new TypeError('ZIP paths must contain valid Unicode.');
  }
  if (encoded.length > UINT16_MAX) {
    throw new RangeError('ZIP filename exceeds ZIP32 limits.');
  }
  if (names.has(path)) {
    throw new TypeError(`Duplicate ZIP path: ${path}`);
  }
  names.add(path);
  return encoded;
}

function toBlob(data) {
  if (data instanceof Blob) return data;
  if (typeof data === 'string' || data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return new Blob([data]);
  }
  throw new TypeError('ZIP entry data must be a Blob, Uint8Array, ArrayBuffer, or string.');
}

async function checksum(blob) {
  let crc = UINT32_MAX;
  for (let offset = 0; offset < blob.size; offset += CRC_CHUNK_SIZE) {
    const bytes = new Uint8Array(await blob.slice(offset, offset + CRC_CHUNK_SIZE).arrayBuffer());
    for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ UINT32_MAX) >>> 0;
}

function fileHeader(entry, central) {
  const bytes = new Uint8Array(central ? CENTRAL_HEADER_SIZE : LOCAL_HEADER_SIZE);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, central ? CENTRAL_SIGNATURE : LOCAL_SIGNATURE, true);
  let offset = 4;
  if (central) {
    view.setUint16(offset, ZIP_VERSION, true);
    offset += 2;
  }
  view.setUint16(offset, ZIP_VERSION, true);
  view.setUint16(offset + 2, UTF8_FLAG, true);
  view.setUint16(offset + 4, STORED_METHOD, true);
  view.setUint16(offset + 8, DOS_DATE, true);
  view.setUint32(offset + 10, entry.crc, true);
  view.setUint32(offset + 14, entry.blob.size, true);
  view.setUint32(offset + 18, entry.blob.size, true);
  view.setUint16(offset + 22, entry.name.length, true);
  if (central) view.setUint32(42, entry.offset, true);
  return bytes;
}

/**
 * Create a deterministic, uncompressed UTF-8 ZIP Blob without external dependencies.
 * Entry paths must be unique relative file paths; unsafe paths and ZIP64-sized
 * archives are rejected. Blob payloads are checksummed in bounded chunks and
 * retained as Blob parts rather than concatenating all source bytes in memory.
 * @param {Array<{path: string, data: Blob|Uint8Array|ArrayBuffer|string}>} entries
 * @returns {Promise<Blob>} An application/zip Blob.
 */
export async function createDesignZip(entries) {
  if (!Array.isArray(entries)) throw new TypeError('ZIP entries must be an array.');
  if (entries.length >= UINT16_MAX) throw new RangeError('Entry count exceeds ZIP32 limits.');
  const names = new Set();
  const files = [];
  let localSize = 0;
  let centralSize = 0;
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') throw new TypeError('Invalid ZIP entry.');
    const name = encodePath(entry.path, names);
    const blob = toBlob(entry.data);
    assertZip32(blob.size, 'Entry size');
    files.push({ name, blob, offset: localSize, crc: 0 });
    localSize += LOCAL_HEADER_SIZE + name.length + blob.size;
    centralSize += CENTRAL_HEADER_SIZE + name.length;
    assertZip32(localSize, 'Central directory offset');
    assertZip32(centralSize, 'Central directory size');
  }
  assertZip32(localSize + centralSize + END_HEADER_SIZE, 'Archive size');
  const parts = [];
  for (const file of files) {
    file.crc = await checksum(file.blob);
    parts.push(fileHeader(file, false), file.name, file.blob);
  }
  for (const file of files) parts.push(fileHeader(file, true), file.name);
  const end = new Uint8Array(END_HEADER_SIZE);
  const view = new DataView(end.buffer);
  view.setUint32(0, END_SIGNATURE, true);
  view.setUint16(8, files.length, true);
  view.setUint16(10, files.length, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, localSize, true);
  parts.push(end);
  return new Blob(parts, { type: ZIP_MIME_TYPE });
}
