export interface ModSample {
  name: string;
  length: number;
  finetune: number;
  volume: number;
  loopStart: number;
  loopLength: number;
  dataOffset: number;
}

export interface ModEvent {
  period: number;
  sample: number;
  effect: number;
  parameter: number;
}

export interface ParsedMod {
  title: string;
  channels: number;
  orders: number;
  patternTable: number[];
  patterns: ModEvent[][][];
  samples: ModSample[];
  bytes: Uint8Array;
  /** Header layout metadata; omitted for standard 31-sample MOD files. */
  sampleCount?: 15 | 31;
  sampleHeaderOffset?: number;
  patternDataOffset?: number;
}

export interface ModEventUpdate { row: number; channel: number; patch: Partial<ModEvent> }

export function updateModEvents(module: ParsedMod, patternIndex: number, updates: ModEventUpdate[]): ParsedMod {
  const sourcePattern = module.patterns[patternIndex];
  if (!sourcePattern || updates.length === 0) return module;
  const pattern = sourcePattern.map(row => row.slice());
  const bytes = new Uint8Array(module.bytes);
  let changed = false;
  for (const { row, channel, patch } of updates) {
    const current = pattern[row]?.[channel];
    if (!current) continue;
    const next: ModEvent = {
      period: Math.max(0, Math.min(4095, Math.trunc(Number(patch.period ?? current.period)))),
      sample: Math.max(0, Math.min(31, Math.trunc(Number(patch.sample ?? current.sample)))),
      effect: Math.max(0, Math.min(15, Math.trunc(Number(patch.effect ?? current.effect)))),
      parameter: Math.max(0, Math.min(255, Math.trunc(Number(patch.parameter ?? current.parameter)))),
    };
    if (next.period === current.period && next.sample === current.sample && next.effect === current.effect && next.parameter === current.parameter) continue;
    const offset = (module.patternDataOffset ?? 1084) + (patternIndex * 64 * module.channels + row * module.channels + channel) * 4;
    bytes[offset] = (next.sample & 0x10) | ((next.period >> 8) & 0x0f);
    bytes[offset + 1] = next.period & 0xff;
    bytes[offset + 2] = ((next.sample & 0x0f) << 4) | next.effect;
    bytes[offset + 3] = next.parameter;
    pattern[row][channel] = next;
    changed = true;
  }
  if (!changed) return module;
  const patterns = module.patterns.slice();
  patterns[patternIndex] = pattern;
  return { ...module, bytes, patterns };
}

export function updateModEvent(module: ParsedMod, patternIndex: number, row: number, channel: number, patch: Partial<ModEvent>): ParsedMod {
  return updateModEvents(module, patternIndex, [{ row, channel, patch }]);
}

export function updateModSample(module: ParsedMod, sampleIndex: number, patch: { name?: string; volume?: number; loopStart?: number; loopLength?: number; fineTune?: number }): ParsedMod {
  const current = module.samples[sampleIndex];
  if (!current) return module;
  const volume = Math.max(0, Math.min(64, Math.trunc(Number(patch.volume ?? current.volume))));
  const name = patch.name === undefined ? current.name : patch.name.slice(0, 22);
  const finetune = Math.max(-8, Math.min(7, Math.trunc(Number(patch.fineTune ?? current.finetune))));
  const loopStart = Math.max(0, Math.min(current.length, Math.trunc(Number(patch.loopStart ?? current.loopStart)) / 2) * 2);
  const loopLength = Math.max(0, Math.min(current.length - loopStart, Math.trunc(Number(patch.loopLength ?? current.loopLength)) / 2) * 2);
  if (name === current.name && volume === current.volume && finetune === current.finetune && loopStart === current.loopStart && loopLength === current.loopLength) return module;
  const bytes = new Uint8Array(module.bytes);
  const header = (module.sampleHeaderOffset ?? 20) + sampleIndex * 30;
  if (patch.name !== undefined) {
    bytes.fill(0, header, header + 22);
    bytes.set(Array.from(name).slice(0, 22).map(character => character.charCodeAt(0) & 0xff), header);
  }
  if (patch.volume !== undefined) bytes[header + 25] = volume;
  if (patch.fineTune !== undefined) bytes[header + 24] = (bytes[header + 24] & 0xf0) | (finetune & 0x0f);
  if (patch.loopStart !== undefined || patch.loopLength !== undefined) {
    bytes[header + 26] = loopStart / 2 >> 8;
    bytes[header + 27] = loopStart / 2 & 0xff;
    bytes[header + 28] = loopLength / 2 >> 8;
    bytes[header + 29] = loopLength / 2 & 0xff;
  }
  const samples = module.samples.map((sample, index) => index === sampleIndex ? { ...sample, name, volume, finetune, loopStart, loopLength } : sample);
  return { ...module, bytes, samples };
}

/** Replaces one MOD sample while rebuilding its sequential PCM payload and length header. */
export function replaceModSamplePcm(module: ParsedMod, sampleIndex: number, pcm: Int8Array, name: string): ParsedMod | null {
  const target = module.samples[sampleIndex];
  const sampleLength = Math.ceil(pcm.length / 2) * 2;
  if (!target || !pcm.length || sampleLength > 131_070) return null;
  const sampleDataStart = module.samples[0]?.dataOffset;
  if (!Number.isInteger(sampleDataStart) || sampleDataStart! < (module.patternDataOffset ?? 1084)) return null;
  let originalDataEnd = sampleDataStart!;
  for (const sample of module.samples) {
    if (sample.dataOffset !== originalDataEnd || sample.dataOffset + sample.length > module.bytes.length) return null;
    originalDataEnd += sample.length;
  }
  const bytes = new Uint8Array(sampleDataStart! + module.samples.reduce((total, sample, index) => total + (index === sampleIndex ? sampleLength : sample.length), 0) + module.bytes.length - originalDataEnd);
  bytes.set(module.bytes.subarray(0, sampleDataStart!), 0);
  let outputOffset = sampleDataStart!;
  const samples = module.samples.map((sample, index) => {
    const currentLength = index === sampleIndex ? sampleLength : sample.length;
    if (index === sampleIndex) {
      const header = (module.sampleHeaderOffset ?? 20) + index * 30;
      bytes.fill(0, header, header + 22);
      const safeName = name.replace(/[^\x20-\x7e]/g, '_').slice(0, 22);
      for (let character = 0; character < safeName.length; character += 1) bytes[header + character] = safeName.charCodeAt(character);
      bytes[header + 22] = (currentLength >> 9) & 0xff;
      bytes[header + 23] = (currentLength >> 1) & 0xff;
      bytes[header + 26] = 0;
      bytes[header + 27] = 0;
      bytes[header + 28] = 0;
      bytes[header + 29] = 0;
      for (let frame = 0; frame < pcm.length; frame += 1) bytes[outputOffset + frame] = pcm[frame] & 0xff;
    } else {
      bytes.set(module.bytes.subarray(sample.dataOffset, sample.dataOffset + sample.length), outputOffset);
    }
    const next = { ...sample, length: currentLength, dataOffset: outputOffset };
    outputOffset += currentLength;
    return index === sampleIndex ? { ...next, name: name.replace(/[^\x20-\x7e]/g, '_').slice(0, 22), loopStart: 0, loopLength: 0 } : next;
  });
  bytes.set(module.bytes.subarray(originalDataEnd), outputOffset);
  const parsed = parseModModule(bytes.buffer);
  return parsed ? { ...parsed, samples } : null;
}

const readText = (bytes: Uint8Array, offset: number, length: number) => new TextDecoder('latin1').decode(bytes.slice(offset, offset + length)).replace(/\0/g, '').trim();
const readU16 = (bytes: Uint8Array, offset: number) => (bytes[offset] << 8) | bytes[offset + 1];

const channelsFromSignature = (signature: string): number => {
  if (signature === 'M.K.' || signature === 'M!K!' || signature === 'M&K!' || signature === 'N.T.') return 4;
  if (signature === 'CD81' || signature === 'OKTA' || signature === 'FLT8') return 8;
  if (signature === '16CN') return 16;
  if (signature === '32CN') return 32;
  if (signature === '64CN') return 64;
  if (/^[0-9]+CH$/.test(signature)) return Number(signature.slice(0, -2));
  if (/^FLT[0-9]$/.test(signature)) return Number(signature.slice(3));
  if (/^..CH$/.test(signature)) return Number(signature.slice(0, 2));
  if (/^[0-9]+CHN$/.test(signature)) return Number(signature.slice(0, -3));
  if (signature === '4CHN') return 4;
  return 0;
};

export function parseModModule(buffer: ArrayBuffer): ParsedMod | null {
  const bytes = new Uint8Array(buffer);
  const signature = bytes.length >= 1084 ? readText(bytes, 1080, 4) : '';
  const signedChannels = channelsFromSignature(signature);
  const legacy15 = !signedChannels && bytes.length >= 600 && bytes[470] >= 1 && bytes[470] <= 128;
  if (!signedChannels && !legacy15) return null;
  const channels = signedChannels || 4;
  const sampleCount: 15 | 31 = legacy15 ? 15 : 31;
  const sampleHeaderOffset = 20;
  const ordersOffset = legacy15 ? 470 : 950;
  const patternTableOffset = legacy15 ? 472 : 952;
  const patternDataOffset = legacy15 ? 600 : 1084;
  const orders = bytes[ordersOffset];
  const patternTable = Array.from(bytes.slice(patternTableOffset, patternTableOffset + 128));
  if (!orders || orders > 128) return null;
  const patternCount = Math.max(0, ...patternTable.slice(0, Math.max(1, orders))) + 1;
  const patternSize = 64 * channels * 4;
  if (patternDataOffset + patternCount * patternSize > bytes.length) return null;
  const patterns: ModEvent[][][] = [];
  let patternOffset = patternDataOffset;
  for (let patternIndex = 0; patternIndex < patternCount; patternIndex += 1) {
    const rows: ModEvent[][] = [];
    for (let row = 0; row < 64; row += 1) {
      const events: ModEvent[] = [];
      for (let channel = 0; channel < channels; channel += 1) {
        const offset = patternOffset + (row * channels + channel) * 4;
        const a = bytes[offset] ?? 0;
        const b = bytes[offset + 1] ?? 0;
        const c = bytes[offset + 2] ?? 0;
        const d = bytes[offset + 3] ?? 0;
        events.push({ period: ((a & 0x0f) << 8) | b, sample: (a & 0xf0) | (c >> 4), effect: c & 0x0f, parameter: d });
      }
      rows.push(events);
    }
    patterns.push(rows);
    patternOffset += patternSize;
  }

  const samples: ModSample[] = [];
  let sampleOffset = patternOffset;
  for (let index = 0; index < sampleCount; index += 1) {
    const header = 20 + index * 30;
    const length = readU16(bytes, header + 22) * 2;
    const loopStart = readU16(bytes, header + 26) * 2;
    const loopLength = readU16(bytes, header + 28) * 2;
    samples.push({
      name: readText(bytes, header, 22),
      length,
      finetune: (bytes[header + 24] & 0x08) !== 0 ? (bytes[header + 24] & 0x0f) - 16 : bytes[header + 24] & 0x0f,
      volume: Math.min(64, bytes[header + 25] ?? 0),
      loopStart,
      loopLength,
      dataOffset: sampleOffset,
    });
    sampleOffset += length;
  }
  if (sampleOffset > bytes.length) return null;
  return { title: readText(bytes, 0, 20), channels, orders, patternTable, patterns, samples, bytes, sampleCount, sampleHeaderOffset, patternDataOffset };
}
