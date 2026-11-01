const PACKAGE_SCHEMA = 'gba-studio/gbatracker-package';
const BLOB_MARKER = '__gbaTrackerBlob';

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(binary);
};

const decodeBase64 = (encoded: string) => {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const u16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const u32 = (bytes: Uint8Array, offset: number) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
const write16 = (bytes: Uint8Array, offset: number, value: number) => { bytes[offset] = value & 0xff; bytes[offset + 1] = (value >>> 8) & 0xff; };
const write32 = (bytes: Uint8Array, offset: number, value: number) => { write16(bytes, offset, value & 0xffff); write16(bytes, offset + 2, value >>> 16); };

function externalize(value: unknown, blobs: Map<string, Uint8Array>, path = '$'): unknown {
  if (Array.isArray(value)) return value.map((item, index) => externalize(item, blobs, `${path}/${index}`));
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if ((key === 'encodedPcm' || key === 'pcmData' || key === 'moduleData' || key === 'sourceAudioData' || key === 'sourcePcmData') && typeof item === 'string' && item) {
      const filename = `binary/${String(blobs.size + 1).padStart(6, '0')}.bin`;
      blobs.set(filename, decodeBase64(item));
      result[key] = { [BLOB_MARKER]: filename };
    } else result[key] = externalize(item, blobs, `${path}/${key}`);
  }
  return result;
}

function internalize(value: unknown, blobs: Map<string, Uint8Array>): unknown {
  if (Array.isArray(value)) return value.map(item => internalize(item, blobs));
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (typeof record[BLOB_MARKER] === 'string' && Object.keys(record).length === 1) {
    const bytes = blobs.get(record[BLOB_MARKER] as string);
    if (!bytes) throw new Error('The .gbatracker package is missing a referenced binary sample or module.');
    return encodeBase64(bytes);
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, internalize(item, blobs)]));
}

/** Creates a dependency-free ZIP package using stored entries for broad compatibility. */
export function createTrackerProjectPackage(sourceDocument: unknown): Uint8Array {
  if (!sourceDocument || typeof sourceDocument !== 'object') throw new Error('A tracker source document is required.');
  const blobs = new Map<string, Uint8Array>();
  const manifest = new TextEncoder().encode(JSON.stringify({
    schema: PACKAGE_SCHEMA,
    version: 1,
    source: externalize(sourceDocument, blobs),
  }));
  const entries = [['manifest.json', manifest] as const, ...blobs.entries()];
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;
  for (const [filename, content] of entries) {
    const name = encoder.encode(filename);
    const checksum = crc32(content);
    const local = new Uint8Array(30 + name.length + content.length);
    write32(local, 0, 0x04034b50); write16(local, 4, 20); write16(local, 6, 0x0800); write16(local, 8, 0);
    write32(local, 14, checksum); write32(local, 18, content.length); write32(local, 22, content.length);
    write16(local, 26, name.length); local.set(name, 30); local.set(content, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    write32(central, 0, 0x02014b50); write16(central, 4, 20); write16(central, 6, 20); write16(central, 8, 0x0800); write16(central, 10, 0);
    write32(central, 16, checksum); write32(central, 20, content.length); write32(central, 24, content.length);
    write16(central, 28, name.length); write32(central, 42, localOffset); central.set(name, 46);
    centralParts.push(central);
    localOffset += local.length;
  }
  const centralLength = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  write32(end, 0, 0x06054b50); write16(end, 8, entries.length); write16(end, 10, entries.length);
  write32(end, 12, centralLength); write32(end, 16, localOffset);
  const result = new Uint8Array(localOffset + centralLength + end.length);
  let offset = 0;
  for (const part of [...localParts, ...centralParts, end]) { result.set(part, offset); offset += part.length; }
  return result;
}

/** Reads the stored ZIP subset emitted above and rejects paths, compression, and corrupt entries. */
export function parseTrackerProjectPackage(input: ArrayBuffer | Uint8Array): unknown {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 22 || u32(bytes, bytes.length - 22) !== 0x06054b50) throw new Error('The .gbatracker ZIP directory is missing or truncated.');
  const decoder = new TextDecoder();
  const blobs = new Map<string, Uint8Array>();
  let manifest: unknown;
  let offset = 0;
  while (offset + 30 <= bytes.length && u32(bytes, offset) === 0x04034b50) {
    const flags = u16(bytes, offset + 6);
    const method = u16(bytes, offset + 8);
    const checksum = u32(bytes, offset + 14);
    const compressedSize = u32(bytes, offset + 18);
    const uncompressedSize = u32(bytes, offset + 22);
    const nameLength = u16(bytes, offset + 26);
    const extraLength = u16(bytes, offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if ((flags & 0x0008) !== 0 || method !== 0 || compressedSize !== uncompressedSize || dataEnd > bytes.length) throw new Error('Unsupported or truncated .gbatracker ZIP entry.');
    const filename = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    if (!filename || filename.startsWith('/') || filename.includes('..') || filename.includes('\\')) throw new Error('Unsafe path in .gbatracker package.');
    const content = bytes.slice(dataStart, dataEnd);
    if (crc32(content) !== checksum) throw new Error(`The .gbatracker package entry ${filename} failed its CRC check.`);
    if (filename === 'manifest.json') {
      if (manifest !== undefined) throw new Error('The .gbatracker package contains more than one manifest.');
      try { manifest = JSON.parse(decoder.decode(content)); } catch { throw new Error('The .gbatracker manifest is invalid JSON.'); }
    } else if (filename.startsWith('binary/')) blobs.set(filename, content);
    else throw new Error('The .gbatracker package contains an unsupported entry.');
    offset = dataEnd;
  }
  const packageData = manifest as { schema?: unknown; version?: unknown; source?: unknown } | undefined;
  if (!packageData || packageData.schema !== PACKAGE_SCHEMA || packageData.version !== 1 || !packageData.source) throw new Error('Unsupported .gbatracker package schema.');
  return internalize(packageData.source, blobs);
}
