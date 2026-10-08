export interface TrackerModuleInfo {
  format: 'MOD' | 'XM' | 'S3M' | 'IT' | 'unknown';
  title: string;
  channels: number;
  patterns: number;
  instruments: number;
  orders: number;
  tempo?: number;
  speed?: number;
}

export interface TrackerPatternEvent {
  note: number;
  instrument: number;
  volume: number;
  effect: number;
  parameter: number;
}

export interface TrackerSample {
  samples: Float32Array;
  sampleRate: number;
  loopStart: number;
  loopEnd: number;
  rootNote: number;
  sixteenBit: boolean;
  volume?: number;
  /** XM instruments can map each note to a different sample. */
  variants?: TrackerSample[];
  noteMap?: number[];
  noteTranspose?: number[];
  volumeEnvelope?: {
    points: Array<{ tick: number; value: number }>;
    sustain: number;
    loopStart: number;
    loopEnd: number;
    enabled: boolean;
  };
  panningEnvelope?: {
    points: Array<{ tick: number; value: number }>;
    sustain: number;
    loopStart: number;
    loopEnd: number;
    enabled: boolean;
  };
}

const text = (bytes: Uint8Array, start: number, length: number) => {
  return new TextDecoder('latin1').decode(bytes.slice(start, start + length)).replace(/\0/g, '').trim();
};

const u16le = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8);
const u32le = (bytes: Uint8Array, offset: number) => (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
const writeU32le = (bytes: Uint8Array, offset: number, value: number) => {
  const safe = Math.max(0, Math.trunc(value));
  bytes[offset] = safe & 0xff;
  bytes[offset + 1] = (safe >> 8) & 0xff;
  bytes[offset + 2] = (safe >> 16) & 0xff;
  bytes[offset + 3] = (safe >> 24) & 0xff;
};
const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.trunc(number))) : fallback;
};

/** Decodes XM instrument samples and their per-note sample maps for editor playback. */
export function parseXmSamples(buffer: ArrayBuffer): Map<number, TrackerSample> {
  const bytes = new Uint8Array(buffer);
  const result = new Map<number, TrackerSample>();
  if (text(bytes, 0, 17) !== 'Extended Module:' || bytes.length < 80) return result;
  const patternCount = u16le(bytes, 70);
  const instrumentCount = u16le(bytes, 72);
  let offset = 60 + u32le(bytes, 60);
  for (let pattern = 0; pattern < patternCount; pattern += 1) {
    if (offset + 9 > bytes.length) return result;
    offset += u32le(bytes, offset) + u16le(bytes, offset + 7);
  }
  for (let instrument = 1; instrument <= instrumentCount && offset + 29 <= bytes.length; instrument += 1) {
    const instrumentHeaderSize = u32le(bytes, offset);
    const sampleCount = u16le(bytes, offset + 27);
    const sampleHeaderSize = u32le(bytes, offset + 29);
    if (!instrumentHeaderSize || !sampleCount || !sampleHeaderSize || offset + instrumentHeaderSize > bytes.length) {
      offset += Math.max(1, instrumentHeaderSize);
      continue;
    }
    const headersOffset = offset + instrumentHeaderSize;
    const dataOffset = headersOffset + sampleCount * sampleHeaderSize;
    if (dataOffset > bytes.length) return result;
    let sampleDataOffset = dataOffset;
    const variants: TrackerSample[] = [];
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const header = headersOffset + sample * sampleHeaderSize;
      const sampleLength = u32le(bytes, header);
      const loopStartBytes = u32le(bytes, header + 4);
      const loopLengthBytes = u32le(bytes, header + 8);
      const type = bytes[header + 14] ?? 0;
      const relativeNote = (bytes[header + 16] << 24) >> 24;
      const sixteenBit = (type & 0x10) !== 0;
      const count = sixteenBit ? Math.floor(sampleLength / 2) : sampleLength;
      const availableBytes = Math.min(sampleLength, Math.max(0, bytes.length - sampleDataOffset));
      const sampleValues = new Float32Array(count);
      if (sixteenBit) {
        let accumulator = 0;
        for (let index = 0; index < count && index * 2 + 1 < availableBytes; index += 1) {
          const raw = (bytes[sampleDataOffset + index * 2] ?? 0) | ((bytes[sampleDataOffset + index * 2 + 1] ?? 0) << 8);
          const delta = raw & 0x8000 ? raw - 0x10000 : raw;
          accumulator = (accumulator + delta) << 16 >> 16;
          sampleValues[index] = accumulator / 32768;
        }
      } else {
        let accumulator = 0;
        for (let index = 0; index < count && index < availableBytes; index += 1) {
          const raw = bytes[sampleDataOffset + index] ?? 0;
          const delta = raw & 0x80 ? raw - 0x100 : raw;
          accumulator = (accumulator + delta) << 24 >> 24;
          sampleValues[index] = accumulator / 128;
        }
      }
      const loopStart = sixteenBit ? Math.min(count, Math.floor(loopStartBytes / 2)) : Math.min(count, loopStartBytes);
      const loopEnd = Math.min(count, loopStart + (sixteenBit ? Math.floor(loopLengthBytes / 2) : loopLengthBytes));
      variants.push({ samples: sampleValues, sampleRate: 8363, loopStart, loopEnd, rootNote: 48 + relativeNote, sixteenBit, volume: bytes[header + 12] ?? 64 });
      sampleDataOffset += sampleLength;
    }
    if (variants.length) {
      const noteMap = Array.from(bytes.slice(offset + 33, Math.min(offset + 129, bytes.length))).slice(0, 96);
      const envelopePointCount = Math.min(12, bytes[offset + 225] ?? 0);
      const envelopePoints = Array.from({ length: envelopePointCount }, (_, point) => ({
        tick: u16le(bytes, offset + 129 + point * 4),
        value: Math.max(0, Math.min(64, u16le(bytes, offset + 131 + point * 4))),
      }));
      const envelopeFlags = bytes[offset + 233] ?? 0;
      const panningPointCount = Math.min(12, bytes[offset + 226] ?? 0);
      const panningPoints = Array.from({ length: panningPointCount }, (_, point) => ({
        tick: u16le(bytes, offset + 177 + point * 4),
        value: Math.max(0, Math.min(64, u16le(bytes, offset + 179 + point * 4))),
      }));
      result.set(instrument, {
        ...variants[0],
        variants,
        noteMap,
        volumeEnvelope: {
          points: envelopePoints,
          sustain: bytes[offset + 227] ?? 0,
          loopStart: bytes[offset + 228] ?? 0,
          loopEnd: bytes[offset + 229] ?? 0,
          enabled: envelopePointCount > 0 && (envelopeFlags & 1) !== 0,
        },
        panningEnvelope: {
          points: panningPoints,
          sustain: bytes[offset + 230] ?? 0,
          loopStart: bytes[offset + 231] ?? 0,
          loopEnd: bytes[offset + 232] ?? 0,
          enabled: panningPointCount > 0 && (envelopeFlags & 2) !== 0,
        },
      });
    }
    offset = sampleDataOffset;
  }
  return result;
}

export function parseS3mSamples(buffer: ArrayBuffer): Map<number, TrackerSample> {
  const bytes = new Uint8Array(buffer);
  const result = new Map<number, TrackerSample>();
  if (text(bytes, 44, 4) !== 'SCRM' || bytes.length < 96) return result;
  const orders = u16le(bytes, 32);
  const instruments = u16le(bytes, 34);
  const pointerTable = 96 + orders * 2;
  for (let instrument = 0; instrument < instruments; instrument += 1) {
    const pointerOffset = pointerTable + instrument * 2;
    if (pointerOffset + 2 > bytes.length) break;
    const headerOffset = u16le(bytes, pointerOffset) * 16;
    if (headerOffset + 0x30 > bytes.length || bytes[headerOffset] !== 1) continue;
    const dataOffset = ((bytes[headerOffset + 0x0e] << 8) | bytes[headerOffset + 0x0d]) * 16;
    const length = u32le(bytes, headerOffset + 0x10);
    const flags = bytes[headerOffset + 0x1f] ?? 0;
    const sixteenBit = (flags & 0x04) !== 0;
    const stereo = (flags & 0x02) !== 0;
    const bytesPerSample = sixteenBit ? 2 : 1;
    const channelCount = stereo ? 2 : 1;
    const dataBytes = length * bytesPerSample * channelCount;
    if (!length || dataOffset + dataBytes > bytes.length) continue;
    const samples = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      const readSample = (channel: number) => {
        const offset = dataOffset + (index * channelCount + channel) * bytesPerSample;
        if (sixteenBit) {
          const raw = (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
          return (raw & 0x8000 ? raw - 0x10000 : raw) / 32768;
        }
        const value = bytes[offset] ?? 0;
        return (value & 0x80 ? value - 0x100 : value) / 128;
      };
      samples[index] = stereo ? (readSample(0) + readSample(1)) * 0.5 : readSample(0);
    }
    const loopStart = (flags & 0x01) !== 0 ? Math.min(length, u32le(bytes, headerOffset + 0x14)) : 0;
    const loopEnd = (flags & 0x01) !== 0 ? Math.min(length, u32le(bytes, headerOffset + 0x18)) : 0;
    result.set(instrument + 1, { samples, sampleRate: Math.max(1, u32le(bytes, headerOffset + 0x20) || 8363), loopStart, loopEnd, rootNote: 49, sixteenBit, volume: bytes[headerOffset + 0x1c] ?? 64 });
  }
  return result;
}

export function parseItSamples(buffer: ArrayBuffer): Map<number, TrackerSample> {
  const bytes = new Uint8Array(buffer);
  const result = new Map<number, TrackerSample>();
  if (text(bytes, 0, 4) !== 'IMPM' || bytes.length < 192) return result;
  const orders = u16le(bytes, 0x20);
  const instruments = u16le(bytes, 0x22);
  const samplesCount = u16le(bytes, 0x24);
  const instrumentMaps = new Map<number, { samples: number[]; transposes: number[] }>();
  const instrumentPointerTable = 192 + orders;
  for (let instrument = 0; instrument < instruments; instrument += 1) {
    const pointerOffset = instrumentPointerTable + instrument * 4;
    if (pointerOffset + 4 > bytes.length) break;
    const headerOffset = u32le(bytes, pointerOffset);
    if (headerOffset + 304 > bytes.length || text(bytes, headerOffset, 4) !== 'IMPI') continue;
    const samplesMap = Array.from({ length: 120 }, (_, note) => bytes[headerOffset + 64 + note * 2] ?? 0);
    const transposes = Array.from({ length: 120 }, (_, note) => ((bytes[headerOffset + 65 + note * 2] ?? 0) << 24) >> 24);
    instrumentMaps.set(instrument + 1, { samples: samplesMap, transposes });
  }
  const samplePointerTable = 192 + orders + instruments * 4;
  for (let sample = 0; sample < samplesCount; sample += 1) {
    const pointerOffset = samplePointerTable + sample * 4;
    if (pointerOffset + 4 > bytes.length) break;
    const headerOffset = u32le(bytes, pointerOffset);
    if (headerOffset + 0x50 > bytes.length || text(bytes, headerOffset, 4) !== 'IMPS') continue;
    const flags = bytes[headerOffset + 0x12];
    const dataOffset = u32le(bytes, headerOffset + 0x48);
    const length = u32le(bytes, headerOffset + 0x30);
    if (!length || (flags & 0x08)) continue; // compressed IT samples need a separate bitstream decoder
    const sixteenBit = (flags & 0x02) !== 0;
    const stereo = (flags & 0x04) !== 0;
    const count = sixteenBit ? Math.floor(length / 2) : length;
    const channelCount = stereo ? 2 : 1;
    const dataBytes = count * (sixteenBit ? 2 : 1) * channelCount;
    if (dataOffset + dataBytes > bytes.length) continue;
    const samples = new Float32Array(count);
    if (sixteenBit) {
      for (let index = 0; index < count; index += 1) {
        const readSample = (channel: number) => {
          const sampleOffset = dataOffset + (index * channelCount + channel) * 2;
          const raw = (bytes[sampleOffset] ?? 0) | ((bytes[sampleOffset + 1] ?? 0) << 8);
          return (raw & 0x8000 ? raw - 0x10000 : raw) / 32768;
        };
        samples[index] = stereo ? (readSample(0) + readSample(1)) * 0.5 : readSample(0);
      }
    } else {
      for (let index = 0; index < count; index += 1) {
        const readSample = (channel: number) => {
          const value = bytes[dataOffset + index * channelCount + channel] ?? 0;
          return (value & 0x80 ? value - 0x100 : value) / 128;
        };
        samples[index] = stereo ? (readSample(0) + readSample(1)) * 0.5 : readSample(0);
      }
    }
    const loopEnabled = (flags & 0x10) !== 0;
    const loopStart = loopEnabled ? Math.min(count, u32le(bytes, headerOffset + 0x34) / (sixteenBit ? 2 : 1)) : 0;
    const loopEnd = loopEnabled ? Math.min(count, u32le(bytes, headerOffset + 0x38) / (sixteenBit ? 2 : 1)) : 0;
    result.set(sample + 1, { samples, sampleRate: Math.max(1, u32le(bytes, headerOffset + 0x20) || 8363), loopStart, loopEnd, rootNote: 49, sixteenBit, volume: bytes[headerOffset + 0x13] ?? 64 });
  }
  for (const [instrument, instrumentMap] of instrumentMaps) {
    const references = [...new Set(instrumentMap.samples.filter(sample => sample > 0))];
    const variants = references.map(sample => result.get(sample)).filter((sample): sample is TrackerSample => Boolean(sample));
    if (!variants.length) continue;
    const first = variants[0];
    const variantIndex = instrumentMap.samples.map(sample => {
      const index = references.indexOf(sample);
      return index >= 0 && index < variants.length ? index : 0;
    });
    result.set(instrument, { ...first, variants, noteMap: variantIndex, noteTranspose: instrumentMap.transposes });
  }
  return result;
}

export interface TrackerSamplePatch {
  volume?: number;
  loopStart?: number;
  loopEnd?: number;
}

/** Updates the first sample header in an XM instrument without touching PCM data. */
export function updateXmSample(buffer: ArrayBuffer, instrumentIndex: number, patch: TrackerSamplePatch): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 17) !== 'Extended Module:' || bytes.length < 80 || instrumentIndex < 1) return buffer;
  const patternCount = u16le(bytes, 70);
  const instrumentCount = u16le(bytes, 72);
  if (instrumentIndex > instrumentCount) return buffer;
  let offset = 60 + u32le(bytes, 60);
  for (let pattern = 0; pattern < patternCount; pattern += 1) {
    if (offset + 9 > bytes.length) return buffer;
    offset += u32le(bytes, offset) + u16le(bytes, offset + 7);
  }
  for (let instrument = 1; instrument <= instrumentIndex; instrument += 1) {
    if (offset + 33 > bytes.length) return buffer;
    const instrumentHeaderSize = u32le(bytes, offset);
    const sampleCount = u16le(bytes, offset + 27);
    const sampleHeaderSize = u32le(bytes, offset + 29);
    if (!instrumentHeaderSize || !sampleHeaderSize || offset + instrumentHeaderSize > bytes.length) return buffer;
    if (instrument === instrumentIndex) {
      if (!sampleCount) return buffer;
      const header = offset + instrumentHeaderSize;
      const lengthBytes = u32le(bytes, header);
      const type = bytes[header + 14] ?? 0;
      const sixteenBit = (type & 0x10) !== 0;
      const unit = sixteenBit ? 2 : 1;
      const length = Math.floor(lengthBytes / unit);
      const currentStart = Math.floor(u32le(bytes, header + 4) / unit);
      const currentEnd = currentStart + Math.floor(u32le(bytes, header + 8) / unit);
      const loopStart = clamp(patch.loopStart, 0, length, currentStart);
      const loopEnd = clamp(patch.loopEnd, loopStart, length, currentEnd);
      const result = new Uint8Array(bytes);
      writeU32le(result, header + 4, loopStart * unit);
      writeU32le(result, header + 8, Math.max(0, loopEnd - loopStart) * unit);
      result[header + 12] = clamp(patch.volume, 0, 64, result[header + 12] ?? 64);
      return result.buffer;
    }
    offset += instrumentHeaderSize + sampleCount * sampleHeaderSize + (() => {
      let total = 0;
      const headers = offset + instrumentHeaderSize;
      for (let sample = 0; sample < sampleCount; sample += 1) total += u32le(bytes, headers + sample * sampleHeaderSize);
      return total;
    })();
  }
  return buffer;
}

/** Updates an S3M sample header in place on a derived buffer. */
export function updateS3mSample(buffer: ArrayBuffer, sampleIndex: number, patch: TrackerSamplePatch): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 44, 4) !== 'SCRM' || bytes.length < 96 || sampleIndex < 1) return buffer;
  const orders = u16le(bytes, 32);
  const instruments = u16le(bytes, 34);
  if (sampleIndex > instruments) return buffer;
  const pointerOffset = 96 + orders * 2 + (sampleIndex - 1) * 2;
  if (pointerOffset + 2 > bytes.length) return buffer;
  const header = u16le(bytes, pointerOffset) * 16;
  if (header + 0x30 > bytes.length || bytes[header] !== 1) return buffer;
  const length = u32le(bytes, header + 0x10);
  const start = u32le(bytes, header + 0x14);
  const end = u32le(bytes, header + 0x18);
  const loopStart = clamp(patch.loopStart, 0, length, start);
  const loopEnd = clamp(patch.loopEnd, loopStart, length, end);
  const result = new Uint8Array(bytes);
  writeU32le(result, header + 0x14, loopStart);
  writeU32le(result, header + 0x18, loopEnd);
  result[header + 0x1c] = clamp(patch.volume, 0, 64, result[header + 0x1c] ?? 64);
  result[header + 0x1f] = loopEnd > loopStart ? (result[header + 0x1f] | 0x01) : (result[header + 0x1f] & ~0x01);
  return result.buffer;
}

/** Updates an IT sample header in place on a derived buffer. */
export function updateItSample(buffer: ArrayBuffer, sampleIndex: number, patch: TrackerSamplePatch): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 4) !== 'IMPM' || bytes.length < 192 || sampleIndex < 1) return buffer;
  const orders = u16le(bytes, 0x20);
  const instruments = u16le(bytes, 0x22);
  const samples = u16le(bytes, 0x24);
  if (sampleIndex > samples) return buffer;
  const pointerOffset = 192 + orders + instruments * 4 + (sampleIndex - 1) * 4;
  if (pointerOffset + 4 > bytes.length) return buffer;
  const header = u32le(bytes, pointerOffset);
  if (header + 0x50 > bytes.length || text(bytes, header, 4) !== 'IMPS') return buffer;
  const flags = bytes[header + 0x12] ?? 0;
  const unit = (flags & 0x02) !== 0 ? 2 : 1;
  const length = Math.floor(u32le(bytes, header + 0x30) / unit);
  const start = Math.floor(u32le(bytes, header + 0x34) / unit);
  const end = Math.floor(u32le(bytes, header + 0x38) / unit);
  const loopStart = clamp(patch.loopStart, 0, length, start);
  const loopEnd = clamp(patch.loopEnd, loopStart, length, end);
  const result = new Uint8Array(bytes);
  writeU32le(result, header + 0x34, loopStart * unit);
  writeU32le(result, header + 0x38, loopEnd * unit);
  result[header + 0x13] = clamp(patch.volume, 0, 64, result[header + 0x13] ?? 64);
  result[header + 0x12] = loopEnd > loopStart ? (result[header + 0x12] | 0x10) : (result[header + 0x12] & ~0x10);
  return result.buffer;
}

export function parseXmPatternRows(buffer: ArrayBuffer, patternIndex = 0, rowLimit = 32): TrackerPatternEvent[][] {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 17) !== 'Extended Module:' || bytes.length < 80) return [];
  const channels = u16le(bytes, 68);
  const patternCount = u16le(bytes, 70);
  if (patternIndex < 0 || patternIndex >= patternCount) return [];
  let offset = 60 + u32le(bytes, 60);
  for (let pattern = 0; pattern < patternIndex; pattern += 1) {
    if (offset + 9 > bytes.length) return [];
    offset += u32le(bytes, offset) + u16le(bytes, offset + 7);
  }
  if (offset + 9 > bytes.length) return [];
  const headerSize = u32le(bytes, offset);
  const rows = Math.max(1, u16le(bytes, offset + 5));
  const packedSize = u16le(bytes, offset + 7);
  let cursor = offset + headerSize;
  const result: TrackerPatternEvent[][] = [];
  for (let row = 0; row < Math.min(rows, rowLimit); row += 1) {
    const events: TrackerPatternEvent[] = [];
    for (let channel = 0; channel < channels; channel += 1) {
      if (cursor >= offset + headerSize + packedSize || cursor >= bytes.length) {
        events.push({ note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 });
        continue;
      }
      const flag = bytes[cursor++];
      const event = { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      if (flag & 0x80) {
        if (flag & 0x01) event.note = bytes[cursor++];
        if (flag & 0x02) event.instrument = bytes[cursor++];
        if (flag & 0x04) event.volume = bytes[cursor++];
        if (flag & 0x08) event.effect = bytes[cursor++];
        if (flag & 0x10) event.parameter = bytes[cursor++];
      } else {
        event.note = flag;
        event.instrument = bytes[cursor++];
        event.volume = bytes[cursor++];
        event.effect = bytes[cursor++];
        event.parameter = bytes[cursor++];
      }
      events.push(event);
    }
    result.push(events);
  }
  return result;
}

/**
 * Updates one XM event and rebuilds only the selected pattern as valid packed
 * XM events. The returned buffer is a derived copy; the source ArrayBuffer is
 * never mutated. Re-encoding all cells is intentional: it keeps the writer
 * deterministic while preserving the pattern header and all following data.
 */
export function updateXmPatternEvent(buffer: ArrayBuffer, patternIndex: number, rowIndex: number, channelIndex: number, patch: Partial<TrackerPatternEvent>): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 17) !== 'Extended Module:' || bytes.length < 80) return buffer;
  const channels = u16le(bytes, 68);
  const patternCount = u16le(bytes, 70);
  if (patternIndex < 0 || patternIndex >= patternCount || channelIndex < 0 || channelIndex >= channels) return buffer;
  let patternOffset = 60 + u32le(bytes, 60);
  for (let pattern = 0; pattern < patternIndex; pattern += 1) {
    if (patternOffset + 9 > bytes.length) return buffer;
    patternOffset += u32le(bytes, patternOffset) + u16le(bytes, patternOffset + 7);
  }
  if (patternOffset + 9 > bytes.length) return buffer;
  const headerSize = u32le(bytes, patternOffset);
  const rows = Math.max(1, u16le(bytes, patternOffset + 5));
  const packedSize = u16le(bytes, patternOffset + 7);
  if (rowIndex < 0 || rowIndex >= rows || patternOffset + headerSize + packedSize > bytes.length) return buffer;
  const parsed = parseXmPatternRows(buffer, patternIndex, rows);
  while (parsed.length < rows) parsed.push([]);
  const current = parsed[rowIndex][channelIndex] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
  parsed[rowIndex][channelIndex] = {
    note: Math.max(0, Math.min(255, Math.trunc(Number(patch.note ?? current.note) || 0))),
    instrument: Math.max(0, Math.min(255, Math.trunc(Number(patch.instrument ?? current.instrument) || 0))),
    volume: Math.max(0, Math.min(255, Math.trunc(Number(patch.volume ?? current.volume) || 0))),
    effect: Math.max(0, Math.min(255, Math.trunc(Number(patch.effect ?? current.effect) || 0))),
    parameter: Math.max(0, Math.min(255, Math.trunc(Number(patch.parameter ?? current.parameter) || 0))),
  };
  const encoded = new Uint8Array(rows * channels * 6);
  if (encoded.length > 0xffff) return buffer;
  let cursor = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const event = parsed[row]?.[channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      encoded[cursor++] = 0x9f; // packed event with all five fields present
      encoded[cursor++] = event.note;
      encoded[cursor++] = event.instrument;
      encoded[cursor++] = event.volume;
      encoded[cursor++] = event.effect;
      encoded[cursor++] = event.parameter;
    }
  }
  const patternEnd = patternOffset + headerSize + packedSize;
  const result = new Uint8Array(bytes.length - packedSize + encoded.length);
  result.set(bytes.slice(0, patternOffset + headerSize), 0);
  result[patternOffset + 7] = encoded.length & 0xff;
  result[patternOffset + 8] = (encoded.length >> 8) & 0xff;
  result.set(encoded, patternOffset + headerSize);
  result.set(bytes.slice(patternEnd), patternOffset + headerSize + encoded.length);
  return result.buffer;
}

export function parseS3mPatternRows(buffer: ArrayBuffer, patternIndex = 0, rowLimit = 32): TrackerPatternEvent[][] {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 44, 4) !== 'SCRM' || bytes.length < 96) return [];
  const orders = u16le(bytes, 32);
  const instruments = u16le(bytes, 34);
  const patterns = u16le(bytes, 36);
  if (patternIndex < 0 || patternIndex >= patterns) return [];
  const activeChannels = Array.from(bytes.slice(64, 96)).filter(channel => channel < 16);
  const channels = activeChannels.length;
  const patternPointerOffset = 96 + orders * 2 + instruments * 2 + patternIndex * 2;
  if (patternPointerOffset + 2 > bytes.length) return [];
  const patternOffset = u16le(bytes, patternPointerOffset) * 16;
  if (patternOffset + 2 > bytes.length) return [];
  const packedLength = u16le(bytes, patternOffset);
  const end = Math.min(bytes.length, patternOffset + 2 + packedLength);
  let cursor = patternOffset + 2;
  let row = 0;
  const result: TrackerPatternEvent[][] = [];
  while (row < Math.min(64, rowLimit) && cursor < end) {
    const token = bytes[cursor++];
    if (token === 0) {
      row += 1;
      continue;
    }
    const channel = activeChannels.indexOf(token & 31);
    if (!result[row]) result[row] = Array.from({ length: channels }, () => ({ note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 }));
    if (token & 32) {
      const note = bytes[cursor++];
      const instrument = bytes[cursor++];
      if (channel < channels) { result[row][channel].note = note; result[row][channel].instrument = instrument; }
    }
    if (token & 64) {
      const volume = bytes[cursor++];
      if (channel < channels) result[row][channel].volume = volume;
    }
    if (token & 128) {
      const effect = bytes[cursor++];
      const parameter = bytes[cursor++];
      if (channel < channels) { result[row][channel].effect = effect; result[row][channel].parameter = parameter; }
    }
  }
  return result.map(events => events ?? Array.from({ length: channels }, () => ({ note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 })));
}

/** Rebuilds one S3M pattern and redirects its parapointer to a derived copy. */
export function updateS3mPatternEvent(buffer: ArrayBuffer, patternIndex: number, rowIndex: number, channelIndex: number, patch: Partial<TrackerPatternEvent>): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 44, 4) !== 'SCRM' || bytes.length < 96) return buffer;
  const orders = u16le(bytes, 32);
  const instruments = u16le(bytes, 34);
  const patterns = u16le(bytes, 36);
  const activeChannels = Array.from(bytes.slice(64, 96)).filter(channel => channel < 16);
  if (patternIndex < 0 || patternIndex >= patterns || rowIndex < 0 || rowIndex >= 64 || channelIndex < 0 || channelIndex >= activeChannels.length) return buffer;
  const pointerOffset = 96 + orders * 2 + instruments * 2 + patternIndex * 2;
  if (pointerOffset + 2 > bytes.length) return buffer;
  const patternOffset = u16le(bytes, pointerOffset) * 16;
  if (patternOffset + 2 > bytes.length) return buffer;
  const packedLength = u16le(bytes, patternOffset);
  if (patternOffset + 2 + packedLength > bytes.length) return buffer;
  const rows = parseS3mPatternRows(buffer, patternIndex, 64);
  while (rows.length < 64) rows.push([]);
  const current = rows[rowIndex][channelIndex] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
  rows[rowIndex][channelIndex] = {
    note: Math.max(0, Math.min(255, Math.trunc(Number(patch.note ?? current.note) || 0))),
    instrument: Math.max(0, Math.min(255, Math.trunc(Number(patch.instrument ?? current.instrument) || 0))),
    volume: Math.max(0, Math.min(255, Math.trunc(Number(patch.volume ?? current.volume) || 0))),
    effect: Math.max(0, Math.min(255, Math.trunc(Number(patch.effect ?? current.effect) || 0))),
    parameter: Math.max(0, Math.min(255, Math.trunc(Number(patch.parameter ?? current.parameter) || 0))),
  };
  const encoded: number[] = [];
  for (let row = 0; row < 64; row += 1) {
    for (let channel = 0; channel < activeChannels.length; channel += 1) {
      const event = rows[row]?.[channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      if (!(event.note || event.instrument || event.volume || event.effect || event.parameter)) continue;
      encoded.push((activeChannels[channel] & 31) | 32 | 64 | 128, event.note, event.instrument, event.volume, event.effect, event.parameter);
    }
    encoded.push(0);
  }
  if (encoded.length > 0xffff) return buffer;
  const alignedOffset = (bytes.length + 15) & ~15;
  const result = new Uint8Array(alignedOffset + 2 + encoded.length);
  result.set(bytes, 0);
  result[alignedOffset] = encoded.length & 0xff;
  result[alignedOffset + 1] = (encoded.length >> 8) & 0xff;
  result.set(encoded, alignedOffset + 2);
  const newParagraph = alignedOffset / 16;
  result[pointerOffset] = newParagraph & 0xff;
  result[pointerOffset + 1] = (newParagraph >> 8) & 0xff;
  return result.buffer;
}

export function parseItPatternRows(buffer: ArrayBuffer, patternIndex = 0, rowLimit = 32): TrackerPatternEvent[][] {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 4) !== 'IMPM' || bytes.length < 192) return [];
  const orders = u16le(bytes, 0x20);
  const instruments = u16le(bytes, 0x22);
  const samples = u16le(bytes, 0x24);
  const patterns = u16le(bytes, 0x26);
  if (patternIndex < 0 || patternIndex >= patterns) return [];
  const patternPointerOffset = 192 + orders + instruments * 4 + samples * 4 + patternIndex * 4;
  if (patternPointerOffset + 4 > bytes.length) return [];
  const patternOffset = (bytes[patternPointerOffset] | (bytes[patternPointerOffset + 1] << 8) | (bytes[patternPointerOffset + 2] << 16) | (bytes[patternPointerOffset + 3] << 24)) >>> 0;
  if (patternOffset + 8 > bytes.length) return [];
  const packedLength = u16le(bytes, patternOffset);
  const rows = Math.max(1, u16le(bytes, patternOffset + 2));
  const end = Math.min(bytes.length, patternOffset + 8 + packedLength);
  let cursor = patternOffset + 8;
  let row = 0;
  const masks = new Uint8Array(64);
  const result: TrackerPatternEvent[][] = [];
  while (row < Math.min(rows, rowLimit) && cursor < end) {
    const token = bytes[cursor++];
    if (token === 0) { row += 1; continue; }
    const channel = token & 0x7f;
    if (channel >= 64) break;
    if (token & 0x80) masks[channel] = bytes[cursor++];
    const mask = masks[channel];
    if (!result[row]) result[row] = Array.from({ length: 64 }, () => ({ note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 }));
    const event = result[row][channel];
    if (mask & 1) event.note = bytes[cursor++];
    if (mask & 2) event.instrument = bytes[cursor++];
    if (mask & 4) event.volume = bytes[cursor++];
    if (mask & 8) { const command = bytes[cursor++]; event.effect = command; event.parameter = bytes[cursor++]; }
  }
  return result.map(events => events ?? Array.from({ length: 64 }, () => ({ note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 })));
}

/**
 * Reads the module order list without interpreting pattern data.  254 is a
 * separator in IT files and 255 terminates the list; XM and S3M use every
 * order byte as a pattern index.
 */
export function parseTrackerOrderTable(buffer: ArrayBuffer, format: TrackerModuleInfo['format']): number[] {
  const bytes = new Uint8Array(buffer);
  const normalized = format.toUpperCase();
  if (normalized === 'XM' && text(bytes, 0, 17) === 'Extended Module:' && bytes.length >= 80) {
    const length = Math.min(u16le(bytes, 64), bytes.length - 80);
    return Array.from(bytes.slice(80, 80 + length));
  }
  if (normalized === 'S3M' && text(bytes, 44, 4) === 'SCRM' && bytes.length >= 96) {
    const length = Math.min(u16le(bytes, 32), Math.floor((bytes.length - 96) / 2));
    return Array.from({ length }, (_, index) => u16le(bytes, 96 + index * 2));
  }
  if (normalized === 'IT' && text(bytes, 0, 4) === 'IMPM' && bytes.length >= 192) {
    const length = Math.min(u16le(bytes, 0x20), bytes.length - 192);
    return Array.from(bytes.slice(192, 192 + length));
  }
  return [];
}

/**
 * Expands the order list into bounded playback rows.  The editor still shows
 * one selected pattern for editing, while preview follows the same sequence a
 * tracker player would traverse.  Separator/end markers and invalid pointers
 * are ignored rather than allowing malformed modules to allocate unbounded
 * data in the renderer.
 */
export function parseTrackerPlaybackRows(buffer: ArrayBuffer, format: TrackerModuleInfo['format'], maxRows = 1024): TrackerPatternEvent[][] {
  const normalized = format.toUpperCase();
  const info = parseTrackerModule(buffer, normalized);
  if (!['XM', 'S3M', 'IT'].includes(normalized) || info.patterns <= 0 || maxRows <= 0) return [];
  const orders = parseTrackerOrderTable(buffer, normalized);
  const result: TrackerPatternEvent[][] = [];
  for (const order of orders) {
    if (result.length >= maxRows) break;
    if (normalized === 'IT' && (order === 254 || order === 255)) {
      if (order === 255) break;
      continue;
    }
    if (order >= info.patterns) continue;
    const remaining = maxRows - result.length;
    const rows = normalized === 'XM'
      ? parseXmPatternRows(buffer, order, Math.min(256, remaining))
      : normalized === 'S3M'
        ? parseS3mPatternRows(buffer, order, Math.min(64, remaining))
        : parseItPatternRows(buffer, order, Math.min(256, remaining));
    result.push(...rows.slice(0, remaining));
  }
  return result;
}

/** Rebuilds one IT pattern and redirects its pointer to a derived copy. */
export function updateItPatternEvent(buffer: ArrayBuffer, patternIndex: number, rowIndex: number, channelIndex: number, patch: Partial<TrackerPatternEvent>): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 4) !== 'IMPM' || bytes.length < 192) return buffer;
  const orders = u16le(bytes, 0x20);
  const instruments = u16le(bytes, 0x22);
  const samples = u16le(bytes, 0x24);
  const patterns = u16le(bytes, 0x26);
  if (patternIndex < 0 || patternIndex >= patterns || rowIndex < 0 || channelIndex < 0 || channelIndex >= 64) return buffer;
  const pointerOffset = 192 + orders + instruments * 4 + samples * 4 + patternIndex * 4;
  if (pointerOffset + 4 > bytes.length) return buffer;
  const patternOffset = (bytes[pointerOffset] | (bytes[pointerOffset + 1] << 8) | (bytes[pointerOffset + 2] << 16) | (bytes[pointerOffset + 3] << 24)) >>> 0;
  if (patternOffset + 8 > bytes.length) return buffer;
  const packedLength = u16le(bytes, patternOffset);
  const rowsCount = Math.max(1, u16le(bytes, patternOffset + 2));
  if (rowIndex >= rowsCount || patternOffset + 8 + packedLength > bytes.length) return buffer;
  const rows = parseItPatternRows(buffer, patternIndex, rowsCount);
  while (rows.length < rowsCount) rows.push([]);
  const current = rows[rowIndex][channelIndex] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
  rows[rowIndex][channelIndex] = {
    note: Math.max(0, Math.min(255, Math.trunc(Number(patch.note ?? current.note) || 0))),
    instrument: Math.max(0, Math.min(255, Math.trunc(Number(patch.instrument ?? current.instrument) || 0))),
    volume: Math.max(0, Math.min(255, Math.trunc(Number(patch.volume ?? current.volume) || 0))),
    effect: Math.max(0, Math.min(255, Math.trunc(Number(patch.effect ?? current.effect) || 0))),
    parameter: Math.max(0, Math.min(255, Math.trunc(Number(patch.parameter ?? current.parameter) || 0))),
  };
  const encoded: number[] = [];
  for (let row = 0; row < rowsCount; row += 1) {
    for (let channel = 0; channel < 64; channel += 1) {
      const event = rows[row]?.[channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      if (!(event.note || event.instrument || event.volume || event.effect || event.parameter)) continue;
      encoded.push(0x80 | channel, 0x0f, event.note, event.instrument, event.volume, event.effect, event.parameter);
    }
    encoded.push(0);
  }
  if (encoded.length > 0xffff) return buffer;
  const alignedOffset = (bytes.length + 3) & ~3;
  const result = new Uint8Array(alignedOffset + 8 + encoded.length);
  result.set(bytes, 0);
  result[alignedOffset] = encoded.length & 0xff;
  result[alignedOffset + 1] = (encoded.length >> 8) & 0xff;
  result[alignedOffset + 2] = rowsCount & 0xff;
  result[alignedOffset + 3] = (rowsCount >> 8) & 0xff;
  result.set(encoded, alignedOffset + 8);
  result[pointerOffset] = alignedOffset & 0xff;
  result[pointerOffset + 1] = (alignedOffset >> 8) & 0xff;
  result[pointerOffset + 2] = (alignedOffset >> 16) & 0xff;
  result[pointerOffset + 3] = (alignedOffset >> 24) & 0xff;
  return result.buffer;
}

const modChannels = (signature: string): number => {
  if (/^[0-9]+CH$/.test(signature)) return Number(signature.slice(0, -2));
  if (/^FLT[0-9]$/.test(signature)) return Number(signature.slice(3));
  if (/^..CH$/.test(signature)) return Number(signature.slice(0, 2));
  if (signature === 'M.K.' || signature === 'M!K!' || signature === '4CHN') return 4;
  return 0;
};

export function parseTrackerModule(buffer: ArrayBuffer, extension: string): TrackerModuleInfo {
  const bytes = new Uint8Array(buffer);
  const ext = extension.toLowerCase();
  const signature = text(bytes, 1080, 4);
  if (signature && modChannels(signature)) {
    const orders = bytes[950] ?? 0;
    const patternCount = Math.max(0, ...(Array.from(bytes.slice(952, 952 + Math.min(orders, 128)))) as number[]) + 1;
    return { format: 'MOD', title: text(bytes, 0, 20), channels: modChannels(signature), patterns: patternCount, instruments: 31, orders, speed: 6, tempo: 125 };
  }
  if (text(bytes, 0, 17) === 'Extended Module:') {
    return { format: 'XM', title: text(bytes, 17, 20), channels: u16le(bytes, 68), patterns: u16le(bytes, 70), instruments: u16le(bytes, 72), orders: u16le(bytes, 64), speed: u16le(bytes, 76), tempo: u16le(bytes, 78) };
  }
  if (text(bytes, 44, 4) === 'SCRM') {
    return { format: 'S3M', title: text(bytes, 0, 28), channels: bytes.slice(64, 96).filter(channel => channel < 16).length, patterns: u16le(bytes, 36), instruments: u16le(bytes, 34), orders: u16le(bytes, 32) };
  }
  if (text(bytes, 0, 4) === 'IMPM') {
    return { format: 'IT', title: text(bytes, 4, 26), channels: 64, patterns: u16le(bytes, 0x26), instruments: u16le(bytes, 0x22), orders: u16le(bytes, 0x20) };
  }
  return { format: 'unknown', title: '', channels: 0, patterns: 0, instruments: 0, orders: 0 };
}

export function isTrackerExtension(extension: string): boolean {
  return ['MOD', 'XM', 'S3M', 'IT'].includes(extension.toUpperCase());
}

/** Reports format features intentionally left to the ROM/backend converter. */
export function parseTrackerCompatibilityWarnings(buffer: ArrayBuffer, format: TrackerModuleInfo['format']): string[] {
  if (format !== 'IT') return [];
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 4) !== 'IMPM' || bytes.length < 192) return [];
  const orders = u16le(bytes, 0x20);
  const instruments = u16le(bytes, 0x22);
  const samples = u16le(bytes, 0x24);
  const pointerTable = 192 + orders + instruments * 4;
  let compressed = 0;
  for (let index = 0; index < samples; index += 1) {
    const pointer = pointerTable + index * 4;
    if (pointer + 4 > bytes.length) break;
    const header = u32le(bytes, pointer);
    if (header + 0x50 <= bytes.length && text(bytes, header, 4) === 'IMPS' && ((bytes[header + 0x12] ?? 0) & 0x08)) compressed += 1;
  }
  return compressed ? [`${compressed} IT sample(s) use compression and remain ROM-only in the browser preview.`] : [];
}

export interface TrackerPreviewDiagnostics {
  unsupportedEffects: number[];
  decodedSamples: number;
  warnings: string[];
}

/** Reports where the browser preview intentionally falls back from tracker fidelity. */
export function analyzeTrackerPreview(format: TrackerModuleInfo['format'], rows: TrackerPatternEvent[][], samples: Map<number, TrackerSample>): TrackerPreviewDiagnostics {
  const supported = format === 'XM'
    ? new Set([0, 1, 2, 4, 7, 8, 0x09, 0x0a, 0x0c, 0x0e, 0x0f])
    : format === 'MOD'
      ? new Set([0, 1, 2, 3, 4, 6, 7, 8, 10, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f])
      : new Set([0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 13, 0x0f, 0x10, 0x11, 0x13, 0x14, 0x15, 0x16, 0x18]);
  const extendedSupported = (effect: number, parameter: number): boolean => {
    const command = (parameter >> 4) & 0x0f;
    if (format === 'XM' && effect === 0x0e) return command === 0x01 || command === 0x02 || command === 0x05 || command === 0x09 || command === 0x0a || command === 0x0b || command === 0x0c || command === 0x0d;
    if (format === 'MOD' && effect === 0x0e) return command === 0x0c || command === 0x0d;
    if (format !== 'XM' && effect === 0x13) return command === 0x09 || command === 0x0c || command === 0x0d;
    return true;
  };
  const effects = new Set<number>();
  let sampleReferences = 0;
  rows.forEach(row => row.forEach(event => {
    if (!event) return;
    const effect = event.effect & 0xff;
    if (event.effect || event.parameter) {
      if (!supported.has(effect) || !extendedSupported(effect, event.parameter & 0xff)) effects.add(effect);
    }
    if (event.instrument > 0) sampleReferences += 1;
  }));
  const unsupportedEffects = [...effects].sort((a, b) => a - b);
  const warnings: string[] = [];
  if (unsupportedEffects.length) warnings.push(`Effects not fully reproduced in browser preview: ${unsupportedEffects.map(effect => effect.toString(16).toUpperCase().padStart(2, '0')).join(', ')}`);
  if (format !== 'MOD' && sampleReferences > 0 && samples.size === 0) warnings.push('No decoded PCM samples were found; notes use oscillator fallback.');
  else if (format !== 'MOD' && sampleReferences > samples.size) warnings.push('Some instrument/sample references have no decoded PCM data and use oscillator fallback.');
  return { unsupportedEffects, decodedSamples: samples.size, warnings };
}
