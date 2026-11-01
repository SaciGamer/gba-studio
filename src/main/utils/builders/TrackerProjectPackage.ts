const schema = 'gba-studio/gbatracker-package';
const blobMarker = '__gbaTrackerBlob';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Same identifier for the generated audio filename and Butano C++ registry. */
export function musicAssetSymbol(id: string): string {
  const normalized = id.normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().replace(/_+/g, '_');
  return /^[a-z]/.test(normalized) ? normalized : `a_${normalized}`;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[index] = value >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Buffer) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

export interface BuiltTrackerProject {
  id: string;
  format: 'MOD' | 'XM' | 'S3M' | 'IT';
  composition: unknown;
}

export interface TrackerProjectDescriptor {
  id: string;
  format: 'MOD' | 'XM' | 'S3M' | 'IT';
}

/** Read the stored ZIP subset emitted for .gbatracker and resolve its module blob. */
function readTrackerProject(input: Buffer, filename: string, includeModuleData: boolean): BuiltTrackerProject | TrackerProjectDescriptor {
  const blobs = new Map<string, Buffer>();
  let manifest: any;
  let offset = 0;
  while (offset + 30 <= input.length && input.readUInt32LE(offset) === 0x04034b50) {
    const flags = input.readUInt16LE(offset + 6);
    const method = input.readUInt16LE(offset + 8);
    const checksum = input.readUInt32LE(offset + 14);
    const compressedSize = input.readUInt32LE(offset + 18);
    const uncompressedSize = input.readUInt32LE(offset + 22);
    const nameLength = input.readUInt16LE(offset + 26);
    const extraLength = input.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if ((flags & 0x0008) || method !== 0 || compressedSize !== uncompressedSize || dataEnd > input.length) {
      throw new Error(`Invalid .gbatracker package ${filename}: unsupported or truncated ZIP entry.`);
    }
    const entryName = input.toString('utf8', nameStart, nameStart + nameLength);
    if (!entryName || entryName.startsWith('/') || entryName.includes('..') || entryName.includes('\\')) {
      throw new Error(`Invalid .gbatracker package ${filename}: unsafe ZIP path.`);
    }
    const contents = input.subarray(dataStart, dataEnd);
    if (entryName === 'manifest.json') {
      if (crc32(contents) !== checksum) throw new Error(`Invalid .gbatracker package ${filename}: ZIP checksum mismatch.`);
      if (manifest) throw new Error(`Invalid .gbatracker package ${filename}: duplicate manifest.`);
      try { manifest = JSON.parse(contents.toString('utf8')); } catch { throw new Error(`Invalid .gbatracker package ${filename}: malformed manifest.`); }
    } else if (/^binary\/[0-9]{6}\.bin$/.test(entryName)) {
      if (includeModuleData) {
        if (crc32(contents) !== checksum) throw new Error(`Invalid .gbatracker package ${filename}: ZIP checksum mismatch.`);
        blobs.set(entryName, contents);
      }
    }
    else throw new Error(`Invalid .gbatracker package ${filename}: unexpected ZIP entry.`);
    offset = dataEnd;
  }
  if (!manifest || manifest.schema !== schema || manifest.version !== 1 || !manifest.source || input.readUInt32LE(input.length - 22) !== 0x06054b50) {
    throw new Error(`Invalid .gbatracker package ${filename}: unsupported package schema.`);
  }
  const project = manifest.source;
  const compositionTarget = project.composition?.targetFormat;
  if (Object.hasOwn(project, 'format') || Object.hasOwn(project, 'moduleData')
    || Object.hasOwn(project, 'originalModuleData') || Object.hasOwn(project, 'moduleFingerprint')) {
    throw new Error(`Invalid .gbatracker package ${filename}: legacy root-level target/cache fields are not supported.`);
  }
  const format = compositionTarget;
  if (project.schema !== 'gba-studio/music-project' || project.version !== 1 || !uuidPattern.test(project.id ?? '')
    || !['MOD', 'XM', 'S3M', 'IT'].includes(format)) {
    throw new Error(`Invalid .gbatracker package ${filename}: missing project identity or target format.`);
  }
  if (includeModuleData && (!project.composition || typeof project.composition !== 'object' || Array.isArray(project.composition))) {
    throw new Error(`Invalid .gbatracker package ${filename}: canonical music composition is required for build materialization.`);
  }
  const hydrate = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(item => hydrate(item));
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    if (typeof record[blobMarker] === 'string' && Object.keys(record).length === 1) {
      const blob = blobs.get(record[blobMarker] as string);
      if (!blob) throw new Error(`Invalid .gbatracker package ${filename}: a composition binary is missing.`);
      // Package binaries represent base64 strings in the canonical document,
      // including sourceModules[].moduleData for imported compositions.
      return blob.toString('base64');
    }
    return Object.fromEntries(Object.entries(record).map(([childKey, child]) => [childKey, hydrate(child)]));
  };
  return includeModuleData
    ? { id: project.id, format, composition: hydrate(project.composition) }
    : { id: project.id, format };
}

export function readTrackerProjectForBuild(input: Buffer, filename: string): BuiltTrackerProject {
  return readTrackerProject(input, filename, true) as BuiltTrackerProject;
}

/** Parse only the manifest fields needed by event pickers, skipping sample blobs. */
export function readTrackerProjectDescriptor(input: Buffer, filename: string): TrackerProjectDescriptor {
  return readTrackerProject(input, filename, false) as TrackerProjectDescriptor;
}
