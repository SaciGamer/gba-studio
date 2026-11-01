import { createXmBeatTemplate } from './xmBeatTemplate';

export type EditableTrackerFormat = 'MOD' | 'XM' | 'S3M' | 'IT';

const writeText = (bytes: Uint8Array, offset: number, value: string, length: number) => {
  const encoded = new TextEncoder().encode(value);
  bytes.set(encoded.subarray(0, length), offset);
};

const writeU16le = (bytes: Uint8Array, offset: number, value: number) => {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >> 8) & 0xff;
};

const writeU32le = (bytes: Uint8Array, offset: number, value: number) => {
  writeU16le(bytes, offset, value & 0xffff);
  writeU16le(bytes, offset + 2, value >>> 16);
};

function createModTemplate(title: string): ArrayBuffer {
  const bytes = new Uint8Array(1084 + 64 * 4 * 4);
  writeText(bytes, 0, title, 20);
  bytes[950] = 1;
  bytes[952] = 0;
  writeText(bytes, 1080, 'M.K.', 4);
  return bytes.buffer;
}

function createS3mTemplate(title: string): ArrayBuffer {
  const bytes = new Uint8Array(194);
  writeText(bytes, 0, title, 28);
  bytes[28] = 0x1a;
  bytes[29] = 0x10;
  writeU16le(bytes, 32, 2); // S3M order tables conventionally contain an even number of entries.
  writeU16le(bytes, 34, 0);
  writeU16le(bytes, 36, 1);
  writeU16le(bytes, 40, 0x1320);
  writeU16le(bytes, 42, 1);
  writeText(bytes, 44, 'SCRM', 4);
  bytes[48] = 64;
  bytes[49] = 6;
  bytes[50] = 125;
  bytes[51] = 0xc0;
  for (let channel = 0; channel < 32; channel += 1) bytes[64 + channel] = channel < 4 ? channel : 0xff;
  bytes[96] = 0;
  writeU16le(bytes, 98, 8); // Pattern pointer follows both order entries at paragraph 8 (byte offset 128).
  writeU16le(bytes, 128, 64);
  // An empty S3M row is a zero channel token.
  return bytes.buffer;
}

function createItTemplate(title: string): ArrayBuffer {
  const bytes = new Uint8Array(296);
  writeText(bytes, 0, 'IMPM', 4);
  writeText(bytes, 4, title, 26);
  writeU16le(bytes, 0x20, 1);
  writeU16le(bytes, 0x22, 0);
  writeU16le(bytes, 0x24, 0);
  writeU16le(bytes, 0x26, 1);
  writeU16le(bytes, 0x28, 0x0214); // Compatible with IT 2.14 readers.
  writeU16le(bytes, 0x2a, 0x0214);
  writeU16le(bytes, 0x2c, 1);
  bytes[0x30] = 128;
  bytes[0x31] = 48;
  bytes[0x32] = 6;
  bytes[0x33] = 125;
  bytes[0x34] = 128;
  bytes.fill(0xff, 0x40, 0x80); // IT marks unused channels with the high bit set.
  bytes.fill(32, 0x40, 0x44); // Start with four active channels in the default GBA build profile.
  bytes.fill(64, 0x80, 0xc0);
  bytes[192] = 0;
  writeU32le(bytes, 193, 224);
  writeU16le(bytes, 224, 64);
  writeU16le(bytes, 226, 64);
  // Empty IT rows are terminated with a zero channel marker.
  return bytes.buffer;
}

/** Builds an empty but parseable module without mislabeling bytes as another format. */
export function createTrackerModuleTemplate(format: EditableTrackerFormat, title = 'New Music'): ArrayBuffer {
  switch (format) {
    case 'MOD': return createModTemplate(title);
    case 'XM': return createXmBeatTemplate(title);
    case 'S3M': return createS3mTemplate(title);
    case 'IT': return createItTemplate(title);
    default: throw new Error(`Unsupported tracker module format: ${String(format)}`);
  }
}
