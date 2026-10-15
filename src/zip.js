const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const STORED = 0;
const DEFLATED = 8;
const UTF8_NAMES = 0x0800;
const MAX_COMMENT_LENGTH = 0xffff;

export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndOfCentralDirectory(view);
  const entries = [];
  let offset = view.getUint32(end + 16, true);
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    if (view.getUint32(offset, true) !== CENTRAL_HEADER) throw new Error('damaged zip file');
    const nameLength = view.getUint16(offset + 28, true);
    const localOffset = view.getUint32(offset + 42, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    entries.push({
      name: new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
      method: view.getUint16(offset + 10, true),
      time: view.getUint16(offset + 12, true),
      date: view.getUint16(offset + 14, true),
      crc: view.getUint32(offset + 16, true),
      size: view.getUint32(offset + 24, true),
      data: bytes.subarray(dataStart, dataStart + compressedSize),
    });
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return entries;
}

function findEndOfCentralDirectory(view) {
  const lowest = Math.max(0, view.byteLength - 22 - MAX_COMMENT_LENGTH);
  for (let offset = view.byteLength - 22; offset >= lowest; offset--) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error('not a zip file');
}

export async function entryBytes(entry) {
  if (entry.method === STORED) return entry.data;
  if (entry.method !== DEFLATED) throw new Error(`unsupported zip compression method ${entry.method}`);
  return pipeThrough(entry.data, new DecompressionStream('deflate-raw'));
}

export async function deflatedEntry(name, bytes) {
  return { name, method: DEFLATED, time: 0, date: 0, crc: crc32(bytes), size: bytes.length, data: await pipeThrough(bytes, new CompressionStream('deflate-raw')) };
}

async function pipeThrough(bytes, transform) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
}

export function writeZip(entries) {
  const encoded = entries.map((entry) => ({ ...entry, nameBytes: new TextEncoder().encode(entry.name) }));
  const localSize = encoded.reduce((sum, entry) => sum + 30 + entry.nameBytes.length + entry.data.length, 0);
  const centralSize = encoded.reduce((sum, entry) => sum + 46 + entry.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);

  let offset = 0;
  const localOffsets = encoded.map((entry) => {
    const start = offset;
    view.setUint32(offset, LOCAL_HEADER, true);
    view.setUint16(offset + 4, 20, true);
    writeEntryFields(view, offset + 6, entry);
    view.setUint16(offset + 28, 0, true);
    out.set(entry.nameBytes, offset + 30);
    out.set(entry.data, offset + 30 + entry.nameBytes.length);
    offset += 30 + entry.nameBytes.length + entry.data.length;
    return start;
  });

  const centralStart = offset;
  encoded.forEach((entry, index) => {
    view.setUint32(offset, CENTRAL_HEADER, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    writeEntryFields(view, offset + 8, entry);
    view.setUint32(offset + 42, localOffsets[index], true);
    out.set(entry.nameBytes, offset + 46);
    offset += 46 + entry.nameBytes.length;
  });

  view.setUint32(offset, END_OF_CENTRAL_DIRECTORY, true);
  view.setUint16(offset + 8, encoded.length, true);
  view.setUint16(offset + 10, encoded.length, true);
  view.setUint32(offset + 12, offset - centralStart, true);
  view.setUint32(offset + 16, centralStart, true);
  return out;
}

function writeEntryFields(view, offset, entry) {
  view.setUint16(offset, UTF8_NAMES, true);
  view.setUint16(offset + 2, entry.method, true);
  view.setUint16(offset + 4, entry.time, true);
  view.setUint16(offset + 6, entry.date, true);
  view.setUint32(offset + 8, entry.crc, true);
  view.setUint32(offset + 12, entry.data.length, true);
  view.setUint32(offset + 16, entry.size, true);
  view.setUint16(offset + 20, entry.nameBytes.length, true);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
