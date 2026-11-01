import { createXmBeatTemplateWithInstruments } from './xmBeatTemplate';
import { createTrackerUuid, isTrackerUuid } from './trackerIdentity';
import { createTrackerInstrumentPresetPcm, TRACKER_INSTRUMENT_PRESETS, TRACKER_FACTORY_SAMPLE_RATE, TrackerInstrumentPresetId } from './trackerInstrumentLibrary';
export { TRACKER_INSTRUMENT_PRESETS } from './trackerInstrumentLibrary';
export type { TrackerInstrumentPresetId } from './trackerInstrumentLibrary';
export { createTrackerUuid, isTrackerUuid } from './trackerIdentity';

export interface TrackerModuleInfo {
  format: 'MOD' | 'XM' | 'S3M' | 'IT' | 'unknown';
  title: string;
  channels: number;
  patterns: number;
  instruments: number;
  sampleCount?: number;
  orders: number;
  tempo?: number;
  speed?: number;
  globalVolume?: number;
  /** Initial global volume in the Maxmod MAS header domain. */
  maxmodGlobalVolume?: number;
  /** Per-channel volume bytes after mmutil's format conversion (0..64). */
  maxmodChannelVolumes?: number[];
  /** Initial S3M pan for each physical channel, indexed by pattern channel number. */
  channelPans?: number[];
}

export interface TrackerPlaybackPosition {
  order: number;
  pattern: number;
  row: number;
}

export const TRACKER_MOD_CHANNEL_PAN_DEFAULTS_VERSION = 2;
export const TRACKER_MOD_DEFAULT_CHANNEL_PANS = [-0.5, 0.5, 0.5, -0.5] as const;

/** Restore mixer pans while upgrading only the obsolete MOD default matrix. */
export function restoreTrackerChannelPans(
  format: TrackerModuleInfo['format'],
  defaultPans: readonly number[],
  savedPans: unknown,
  savedDefaultsVersion?: number,
): number[] {
  const legacyModDefaults = defaultPans.map((_, channel) => [-1, 1, 1, -1][channel % 4]);
  const hasLegacyModDefaults = format === 'MOD'
    && savedDefaultsVersion !== TRACKER_MOD_CHANNEL_PAN_DEFAULTS_VERSION
    && Array.isArray(savedPans)
    && savedPans.length === legacyModDefaults.length
    && savedPans.every((pan, channel) => pan === legacyModDefaults[channel]);
  const pans = hasLegacyModDefaults ? [] : Array.isArray(savedPans) ? savedPans : [];
  return defaultPans.map((defaultPan, channel) => {
    const pan = pans[channel];
    return Number.isFinite(pan) ? Math.max(-1, Math.min(1, Number(pan))) : defaultPan;
  });
}

export interface TrackerPatternEvent {
  note: number;
  /** Distinguishes a native zero-valued note (IT C-0) from an empty cell. */
  notePresent?: boolean;
  /** Original Amiga period for MOD playback precision; absent in edited/other formats. */
  period?: number;
  instrument: number;
  /** Distinguishes an IT instrument column from the channel's carried instrument. */
  instrumentPresent?: boolean;
  volume: number;
  /** Distinguishes explicit zero volume from an absent S3M/IT volume column. */
  volumePresent?: boolean;
  effect: number;
  parameter: number;
}

export interface TrackerSample {
  samples: Float32Array;
  /** Original XM delta-encoded PCM, retained for source-document export. */
  encodedPcm?: Uint8Array;
  sampleRate: number;
  loopStart: number;
  loopEnd: number;
  loopType?: number;
  rootNote: number;
  fineTune?: number;
  /** XM header flag: Maxmod uses IT_PitchTable slides instead of Amiga periods. */
  linearPeriods?: boolean;
  panning?: number;
  /** Instrument fadeout rate; XM counts down from 65536 and IT from 1024. */
  fadeout?: number;
  fadeoutMaximum?: number;
  name?: string;
  /** XM instrument header name, distinct from each sample's own name. */
  instrumentName?: string;
  sixteenBit: boolean;
  stereo?: boolean;
  volume?: number;
  /** Maxmod MAS sample-global volume (0..64), separate from default note volume. */
  maxmodSampleGlobalVolume?: number;
  /** Maxmod MAS instrument-global volume (0..128). */
  maxmodInstrumentGlobalVolume?: number;
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
    sustainEnabled?: boolean;
    loopEnabled?: boolean;
    sustainStart?: number;
    sustainEnd?: number;
  };
  panningEnvelope?: {
    points: Array<{ tick: number; value: number }>;
    sustain: number;
    loopStart: number;
    loopEnd: number;
    enabled: boolean;
    sustainEnabled?: boolean;
    loopEnabled?: boolean;
  };
}

export interface MusicEditorSourceDocument {
  schema: 'gba-studio/music-source';
  version: 1;
  assetFileName: string;
  moduleFingerprint: string;
  format: 'XM';
  origin?: 'scratch' | 'imported';
  title: string;
  tempo: number;
  speed: number;
  channels: Array<{ id: string; index: number; name: string }>;
  instruments: Array<{ id: string; index: number; name: string; noteMap?: number[]; volumeEnvelope?: TrackerSample['volumeEnvelope']; panningEnvelope?: TrackerSample['panningEnvelope']; fadeout?: number }>;
  samples: Array<{ id: string; index: number; variantIndex?: number; noteLow?: number; noteHigh?: number; name?: string; sampleRate: number; length: number; loopStart: number; loopEnd: number; rootNote: number; volume: number; encodedPcm?: string; sixteenBit?: boolean; loopType?: number; fineTune?: number; panning?: number }>;
  channelMixer?: { muted: boolean[]; volumes: number[]; pans: number[] };
  patterns: Array<{
    id: string;
    index: number;
    name?: string;
    rows: number;
    events: Array<{ id: string; row: number; channel: number; note: number; instrument: number; volume: number; effect: number; parameter: number }>;
    notes: Array<{ id: string; row: number; channel: number; note: number; instrument: number; volume: number; length: number }>;
  }>;
  order: Array<{ id: string; index: number; patternId: string }>;
  history?: { undo: MusicEditorSourceSnapshot[]; redo: MusicEditorSourceSnapshot[] };
}

export type MusicEditorSourceSnapshot = Omit<MusicEditorSourceDocument, 'history'> & { moduleData?: string };

export function hasUniqueTrackerUuidIds(values: unknown): values is Array<{ id: string }> {
  if (!Array.isArray(values)) return false;
  const ids = values.map(value => value && typeof value === 'object' ? (value as { id?: unknown }).id : undefined);
  return ids.every(isTrackerUuid) && new Set(ids).size === ids.length;
}

export function createMusicEditorSourceSnapshot(source: MusicEditorSourceDocument, moduleBytes?: ArrayBuffer): MusicEditorSourceSnapshot {
  const snapshot = { ...source } as MusicEditorSourceDocument;
  delete snapshot.history;
  return { ...snapshot, ...(moduleBytes ? { moduleData: encodeBase64(new Uint8Array(moduleBytes)) } : {}) };
}

export type MusicEditorSourceCommand =
  | { type: 'patch-events'; patternIndex: number; updates: Array<{ row: number; channel: number; patch: Partial<TrackerPatternEvent> }> }
  | { type: 'set-tempo'; tempo: number }
  | { type: 'set-speed'; speed: number }
  | { type: 'set-pattern-name'; patternIndex: number; name: string }
  | { type: 'set-pattern-rows'; patternIndex: number; rows: number }
  | { type: 'move-order'; from: number; to: number }
  | { type: 'append-pattern'; sourcePattern?: number }
  | { type: 'delete-pattern'; patternIndex: number }
  | { type: 'append-instrument'; name?: string; preset?: TrackerInstrumentPresetId }
  | { type: 'delete-instrument'; instrumentIndex: number }
  | { type: 'append-sample-variant'; instrumentIndex: number; noteLow: number; noteHigh: number; sample: Omit<MusicEditorSourceDocument['samples'][number], 'id' | 'index' | 'variantIndex' | 'noteLow' | 'noteHigh'> }
  | { type: 'patch-sample'; sampleIndex: number; variantIndex?: number; patch: { volume?: number; loopStart?: number; loopEnd?: number; loopType?: number; rootNote?: number; fineTune?: number; panning?: number } }
  | { type: 'replace-sample'; sampleIndex: number; sampleId?: string; sample: MusicEditorSourceDocument['samples'][number] };

const createPresetDeltaPcm = (preset: TrackerInstrumentPresetId, length?: number) => {
  const pcm = createTrackerInstrumentPresetPcm(preset, length);
  const result = new Uint8Array(pcm.length);
  let previous = 0;
  for (let frame = 0; frame < pcm.length; frame += 1) {
    const signed = pcm[frame] < 128 ? pcm[frame] : pcm[frame] - 256;
    result[frame] = (signed - previous + 256) & 0xff;
    previous = signed;
  }
  return result;
};

export function isMusicEditorSourceDocument(value: unknown): value is MusicEditorSourceDocument {
  if (!value || typeof value !== 'object') return false;
  const source = value as Partial<MusicEditorSourceDocument>;
  const hasValidEntityIds = (candidate: Partial<MusicEditorSourceDocument>): boolean => {
    if (!Array.isArray(candidate.channels) || !Array.isArray(candidate.instruments) || !Array.isArray(candidate.samples)
      || !Array.isArray(candidate.patterns) || !Array.isArray(candidate.order)
      || candidate.patterns.some(pattern => !pattern || !Array.isArray(pattern.events) || !Array.isArray(pattern.notes))) return false;
    const ids: unknown[] = [
      ...candidate.channels.map(item => item?.id),
      ...candidate.instruments.map(item => item?.id),
      ...candidate.samples.map(item => item?.id),
      ...candidate.patterns.flatMap(pattern => [pattern.id, ...pattern.events.map(event => event?.id), ...pattern.notes.map(note => note?.id)]),
      ...candidate.order.map(item => item?.id),
    ];
    const patternIds = new Set(candidate.patterns.map(pattern => pattern.id));
    return ids.every(isTrackerUuid)
      && new Set(ids).size === ids.length
      && candidate.order.every(item => isTrackerUuid(item?.patternId) && patternIds.has(item.patternId));
  };
  const validSnapshots = (snapshots: unknown, origin: MusicEditorSourceDocument['origin']): snapshots is MusicEditorSourceSnapshot[] => Array.isArray(snapshots)
    && snapshots.length <= 32
    && snapshots.every(snapshot => Boolean(snapshot && typeof snapshot === 'object'
      && (snapshot as MusicEditorSourceSnapshot).schema === 'gba-studio/music-source'
      && (snapshot as MusicEditorSourceSnapshot).version === 1
      && (snapshot as MusicEditorSourceSnapshot).origin === origin
      && hasValidEntityIds(snapshot as MusicEditorSourceSnapshot)
      && !('history' in snapshot)
      && (origin !== 'imported' || typeof (snapshot as MusicEditorSourceSnapshot).moduleData === 'string')));
  return source.schema === 'gba-studio/music-source' && source.version === 1
    && typeof source.assetFileName === 'string' && typeof source.moduleFingerprint === 'string'
    && source.format === 'XM' && Array.isArray(source.channels) && Array.isArray(source.instruments)
    && Array.isArray(source.samples) && Array.isArray(source.patterns) && Array.isArray(source.order)
    && hasValidEntityIds(source)
    && (source.channelMixer === undefined || Boolean(source.channelMixer
      && Array.isArray(source.channelMixer.muted) && source.channelMixer.muted.every(value => typeof value === 'boolean')
      && Array.isArray(source.channelMixer.volumes) && source.channelMixer.volumes.every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
      && Array.isArray(source.channelMixer.pans) && source.channelMixer.pans.every(value => typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1)))
    && source.patterns.every(pattern => Boolean(pattern && typeof pattern.id === 'string'
      && Array.isArray(pattern.events) && Array.isArray(pattern.notes)
      && pattern.notes.every(note => Boolean(note && typeof note.id === 'string'))))
    && (source.origin === undefined || source.origin === 'scratch' || source.origin === 'imported')
    && (source.history === undefined || Boolean((source.origin === 'scratch' || source.origin === 'imported')
      && validSnapshots(source.history.undo, source.origin) && validSnapshots(source.history.redo, source.origin)));
}

const text = (bytes: Uint8Array, start: number, length: number) => {
  return new TextDecoder('latin1').decode(bytes.slice(start, start + length)).replace(/\0/g, '').trim();
};

const encodeBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(binary);
};

const decodeBase64 = (encoded: string): Uint8Array => Uint8Array.from(atob(encoded), character => character.charCodeAt(0));

export function restoreMusicEditorModuleSnapshot(snapshot: MusicEditorSourceSnapshot): ArrayBuffer {
  if (!snapshot.moduleData) throw new Error('This source history entry has no stored XM binary.');
  const bytes = decodeBase64(snapshot.moduleData);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  if (getMusicModuleFingerprint(buffer) !== snapshot.moduleFingerprint) throw new Error('Stored XM history does not match its source snapshot.');
  return buffer;
}

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
  const linearPeriods = (u16le(bytes, 74) & 0x01) !== 0;
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
      variants.push({
        samples: sampleValues,
        encodedPcm: bytes.slice(sampleDataOffset, sampleDataOffset + availableBytes),
        sampleRate: 8363,
        loopStart,
        loopEnd,
        loopType: type & 0x03,
        rootNote: 48 + relativeNote,
        fineTune: (bytes[header + 13] << 24) >> 24,
        linearPeriods,
        panning: bytes[header + 15] ?? 128,
        name: text(bytes, header + 18, 22),
        sixteenBit,
        volume: bytes[header + 12] ?? 64,
        maxmodSampleGlobalVolume: 64,
        maxmodInstrumentGlobalVolume: 128,
      });
      sampleDataOffset += sampleLength;
    }
    if (variants.length) {
      const noteMap = Array.from(bytes.slice(offset + 33, Math.min(offset + 129, bytes.length))).slice(0, 96);
      const envelopePointCount = Math.min(12, bytes[offset + 225] ?? 0);
      const envelopePoints = Array.from({ length: envelopePointCount }, (_, point) => ({
        tick: u16le(bytes, offset + 129 + point * 4),
        value: Math.max(0, Math.min(64, u16le(bytes, offset + 131 + point * 4))),
      }));
      const volumeEnvelopeFlags = bytes[offset + 233] ?? 0;
      const panningEnvelopeFlags = bytes[offset + 234] ?? 0;
      const panningPointCount = Math.min(12, bytes[offset + 226] ?? 0);
      const panningPoints = Array.from({ length: panningPointCount }, (_, point) => ({
        tick: u16le(bytes, offset + 177 + point * 4),
        value: Math.max(0, Math.min(64, u16le(bytes, offset + 179 + point * 4))),
      }));
      result.set(instrument, {
        ...variants[0],
        instrumentName: text(bytes, offset + 4, 22),
        variants,
        noteMap,
        volumeEnvelope: {
          points: envelopePoints,
          sustain: bytes[offset + 227] ?? 0,
          loopStart: bytes[offset + 228] ?? 0,
          loopEnd: bytes[offset + 229] ?? 0,
          enabled: envelopePointCount > 0 && (volumeEnvelopeFlags & 1) !== 0,
          sustainEnabled: (volumeEnvelopeFlags & 2) !== 0,
          loopEnabled: (volumeEnvelopeFlags & 4) !== 0,
        },
        panningEnvelope: {
          points: panningPoints,
          sustain: bytes[offset + 230] ?? 0,
          loopStart: bytes[offset + 231] ?? 0,
          loopEnd: bytes[offset + 232] ?? 0,
          enabled: panningPointCount > 0 && (panningEnvelopeFlags & 1) !== 0,
          sustainEnabled: (panningEnvelopeFlags & 2) !== 0,
          loopEnabled: (panningEnvelopeFlags & 4) !== 0,
        },
        fadeout: u16le(bytes, offset + 239),
        // Maxmod converts XM's 16-bit fadeout rate to an 8-bit value by
        // dividing by 32, then counts down from 1024 at runtime.
        fadeoutMaximum: 32768,
      });
    }
    offset = sampleDataOffset;
  }
  return result;
}

/** Replaces the first sample of an XM instrument with signed 8-bit delta PCM. */
export function replaceXmSamplePcm(buffer: ArrayBuffer, instrumentIndex: number, deltaPcm: Uint8Array, name: string, variantIndex = 0): ArrayBuffer | null {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 17) !== 'Extended Module:' || bytes.length < 80 || !Number.isInteger(instrumentIndex) || instrumentIndex < 1 || !deltaPcm.length || deltaPcm.length > 0xffff_ffff) return null;
  const patternCount = u16le(bytes, 70);
  const instrumentCount = u16le(bytes, 72);
  if (instrumentIndex > instrumentCount) return null;
  let offset = 60 + u32le(bytes, 60);
  for (let pattern = 0; pattern < patternCount; pattern += 1) {
    if (offset + 9 > bytes.length) return null;
    const headerSize = u32le(bytes, offset);
    const packedSize = u16le(bytes, offset + 7);
    if (headerSize < 9 || offset + headerSize + packedSize > bytes.length) return null;
    offset += headerSize + packedSize;
  }
  for (let instrument = 1; instrument <= instrumentIndex; instrument += 1) {
    if (offset + 33 > bytes.length) return null;
    const instrumentHeaderSize = u32le(bytes, offset);
    const sampleCount = u16le(bytes, offset + 27);
    const sampleHeaderSize = u32le(bytes, offset + 29);
    if (instrumentHeaderSize < 33 || offset + instrumentHeaderSize > bytes.length || !sampleCount || sampleHeaderSize < 40) return null;
    const headersOffset = offset + instrumentHeaderSize;
    const dataStart = headersOffset + sampleCount * sampleHeaderSize;
    if (dataStart > bytes.length) return null;
    let sampleDataOffset = dataStart;
    for (let sample = 0; sample < sampleCount; sample += 1) {
      const headerOffset = headersOffset + sample * sampleHeaderSize;
      const sampleLength = u32le(bytes, headerOffset);
      if (sampleDataOffset + sampleLength > bytes.length) return null;
      if (instrument === instrumentIndex && sample === variantIndex) {
        const outputLength = bytes.length - sampleLength + deltaPcm.length;
        if (!Number.isSafeInteger(outputLength)) return null;
        const result = new Uint8Array(outputLength);
        result.set(bytes.subarray(0, sampleDataOffset));
        result.set(deltaPcm, sampleDataOffset);
        result.set(bytes.subarray(sampleDataOffset + sampleLength), sampleDataOffset + deltaPcm.length);
        writeU32le(result, headerOffset, deltaPcm.length);
        writeU32le(result, headerOffset + 4, 0);
        writeU32le(result, headerOffset + 8, 0);
        result[headerOffset + 14] = (result[headerOffset + 14] ?? 0) & ~0x13;
        result.fill(0, headerOffset + 18, headerOffset + 40);
        const sampleName = name.replace(/[^\x20-\x7e]/g, '_').slice(0, 22);
        for (let index = 0; index < sampleName.length; index += 1) result[headerOffset + 18 + index] = sampleName.charCodeAt(index);
        return result.buffer;
      }
      sampleDataOffset += sampleLength;
    }
    offset = sampleDataOffset;
  }
  return null;
}

export function parseS3mSamples(buffer: ArrayBuffer): Map<number, TrackerSample> {
  const bytes = new Uint8Array(buffer);
  const result = new Map<number, TrackerSample>();
  if (text(bytes, 44, 4) !== 'SCRM' || bytes.length < 96) return result;
  // S3M Ffi: 1 = signed PCM, 2 = unsigned PCM (Scream Tracker TECH.DOC).
  const unsignedSamples = u16le(bytes, 42) === 2;
  const orders = u16le(bytes, 32);
  const instruments = u16le(bytes, 34);
  const pointerTable = 96 + orders;
  for (let instrument = 0; instrument < instruments; instrument += 1) {
    const pointerOffset = pointerTable + instrument * 2;
    if (pointerOffset + 2 > bytes.length) break;
    const headerOffset = u16le(bytes, pointerOffset) * 16;
    if (headerOffset + 0x50 > bytes.length || bytes[headerOffset] !== 1) continue;
    const dataOffset = (((bytes[headerOffset + 0x0d] << 16) | u16le(bytes, headerOffset + 0x0e)) * 16) >>> 0;
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
          return (unsignedSamples ? raw - 0x8000 : ((raw & 0x8000) !== 0 ? raw - 0x10000 : raw)) / 32768;
        }
        const value = bytes[offset] ?? 0;
        return (unsignedSamples ? value - 0x80 : ((value & 0x80) !== 0 ? value - 0x100 : value)) / 128;
      };
      samples[index] = stereo ? (readSample(0) + readSample(1)) * 0.5 : readSample(0);
    }
    const loopStart = (flags & 0x01) !== 0 ? Math.min(length, u32le(bytes, headerOffset + 0x14)) : 0;
    const loopEnd = (flags & 0x01) !== 0 ? Math.min(length, u32le(bytes, headerOffset + 0x18)) : 0;
    result.set(instrument + 1, { samples, sampleRate: Math.max(1, u32le(bytes, headerOffset + 0x20) || 8363), loopStart, loopEnd, loopType: (flags & 0x01) !== 0 ? 1 : 0, rootNote: 49, sixteenBit, stereo, volume: bytes[headerOffset + 0x1c] ?? 64, maxmodSampleGlobalVolume: 64, maxmodInstrumentGlobalVolume: 128, name: text(bytes, headerOffset + 0x30, 28) });
  }
  return result;
}

/** Replaces one S3M PCM sample by appending aligned data and redirecting its parapointer. */
export function replaceS3mSamplePcm(buffer: ArrayBuffer, sampleIndex: number, pcm: Int8Array, name: string, sampleRate = 8363): ArrayBuffer | null {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 44, 4) !== 'SCRM' || bytes.length < 96 || !Number.isInteger(sampleIndex) || sampleIndex < 0 || !pcm.length) return null;
  if (pcm.length > 0xffff_ffff) return null;
  const orders = u16le(bytes, 32);
  const instruments = u16le(bytes, 34);
  if (sampleIndex >= instruments) return null;
  const pointerOffset = 96 + orders + sampleIndex * 2;
  if (pointerOffset + 2 > bytes.length) return null;
  const headerOffset = u16le(bytes, pointerOffset) * 16;
  if (headerOffset + 0x50 > bytes.length || bytes[headerOffset] !== 1) return null;

  const dataOffset = Math.ceil(bytes.length / 16) * 16;
  const dataParagraph = dataOffset / 16;
  const outputLength = dataOffset + pcm.length;
  if (dataParagraph > 0x0f_ffff || !Number.isSafeInteger(outputLength) || outputLength > 0xffff_ffff) return null;

  const result = new Uint8Array(outputLength);
  result.set(bytes);
  const outputHeader = result.subarray(headerOffset, headerOffset + 0x50);
  outputHeader[0x0d] = (dataParagraph >>> 16) & 0xff;
  outputHeader[0x0e] = dataParagraph & 0xff;
  outputHeader[0x0f] = (dataParagraph >>> 8) & 0xff;
  writeU32le(result, headerOffset + 0x10, pcm.length);
  writeU32le(result, headerOffset + 0x14, 0);
  writeU32le(result, headerOffset + 0x18, 0);
  result[headerOffset + 0x1f] &= ~0x07; // one-shot, mono, 8-bit
  writeU32le(result, headerOffset + 0x20, sampleRate);
  result.fill(0, headerOffset + 0x30, headerOffset + 0x4c);
  const sampleName = name.replace(/[^\x20-\x7e]/g, '_').slice(0, 28);
  for (let index = 0; index < sampleName.length; index += 1) result[headerOffset + 0x30 + index] = sampleName.charCodeAt(index);

  const unsignedSamples = u16le(bytes, 42) === 2;
  for (let index = 0; index < pcm.length; index += 1) result[dataOffset + index] = (pcm[index] + (unsignedSamples ? 128 : 0)) & 0xff;
  return result.buffer;
}

export function parseItSamples(buffer: ArrayBuffer): Map<number, TrackerSample> {
  const bytes = new Uint8Array(buffer);
  const result = new Map<number, TrackerSample>();
  if (text(bytes, 0, 4) !== 'IMPM' || bytes.length < 192) return result;
  const orders = u16le(bytes, 0x20);
  const instruments = u16le(bytes, 0x22);
  const samplesCount = u16le(bytes, 0x24);
  const compatibleVersion = u16le(bytes, 0x2a);
  const instrumentMaps = new Map<number, {
    samples: number[];
    transposes: number[];
    volumeEnvelope?: TrackerSample['volumeEnvelope'];
    panningEnvelope?: TrackerSample['panningEnvelope'];
    panning?: number;
    fadeout: number;
    maxmodInstrumentGlobalVolume: number;
  }>();
  const instrumentPointerTable = 192 + orders;
  for (let instrument = 0; instrument < instruments; instrument += 1) {
    const pointerOffset = instrumentPointerTable + instrument * 4;
    if (pointerOffset + 4 > bytes.length) break;
    const headerOffset = u32le(bytes, pointerOffset);
    if (headerOffset + 0x1d4 + 82 > bytes.length || text(bytes, headerOffset, 4) !== 'IMPI') continue;
    const samplesMap = Array.from({ length: 120 }, (_, note) => bytes[headerOffset + 65 + note * 2] ?? 0);
    const transposes = Array.from({ length: 120 }, (_, note) => Math.max(-128, Math.min(127, (bytes[headerOffset + 64 + note * 2] ?? note) - note)));
    const parseEnvelope = (relativeOffset: number, center = 0) => {
      const offset = headerOffset + relativeOffset;
      const flags = bytes[offset] ?? 0;
      const pointCount = Math.min(25, bytes[offset + 1] ?? 0);
      const points = Array.from({ length: pointCount }, (_, pointIndex) => {
        const pointOffset = offset + 6 + pointIndex * 3;
        const rawValue = bytes[pointOffset] ?? 0;
        const value = center === 32 ? Math.max(-32, Math.min(32, rawValue > 127 ? rawValue - 256 : rawValue)) + 32 : rawValue;
        return { tick: u16le(bytes, pointOffset + 1), value: Math.max(0, Math.min(64, value)) };
      });
      return {
        points,
        sustain: bytes[offset + 5] ?? 0,
        sustainStart: bytes[offset + 4] ?? 0,
        sustainEnd: bytes[offset + 5] ?? 0,
        loopStart: bytes[offset + 2] ?? 0,
        loopEnd: bytes[offset + 3] ?? 0,
        enabled: pointCount > 0 && (flags & 1) !== 0,
        sustainEnabled: (flags & 4) !== 0,
        loopEnabled: (flags & 2) !== 0,
      };
    };
    const hasModernEnvelope = compatibleVersion >= 0x0200;
    const volumeEnvelope = hasModernEnvelope ? parseEnvelope(0x130) : undefined;
    const panningEnvelope = hasModernEnvelope ? parseEnvelope(0x182, 32) : undefined;
    instrumentMaps.set(instrument + 1, {
      samples: samplesMap,
      transposes,
      ...(volumeEnvelope ? { volumeEnvelope } : {}),
      ...(panningEnvelope ? { panningEnvelope } : {}),
      ...((bytes[headerOffset + 0x19] & 0x80) !== 0 ? { panning: Math.max(0, Math.min(255, Math.round(((bytes[headerOffset + 0x19] & 0x7f) / 64) * 255))) } : {}),
      fadeout: hasModernEnvelope ? u16le(bytes, headerOffset + 0x14) : 0,
      maxmodInstrumentGlobalVolume: bytes[headerOffset + 0x18] ?? 128,
    });
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
    const stereo = compatibleVersion >= 0x0214 && (flags & 0x04) !== 0;
    const count = length;
    const channelCount = stereo ? 2 : 1;
    const conversion = bytes[headerOffset + 0x2e] ?? 1;
    // The browser importer handles IT's plain PCM, signedness, endian, delta,
    // and PTM byte-delta flags. ADPCM and TX-Wave samples stay source-only.
    if (conversion === 0xff || (conversion & 0x10) !== 0) continue;
    const dataBytes = count * (sixteenBit ? 2 : 1) * channelCount;
    if (dataOffset + dataBytes > bytes.length) continue;
    const samples = new Float32Array(count);
    const bytesPerSample = sixteenBit ? 2 : 1;
    const bits = sixteenBit ? 16 : 8;
    const modulus = 1 << bits;
    const signBit = modulus >> 1;
    const signedSamples = (conversion & 0x01) !== 0;
    const deltaEncoded = (conversion & 0x04) !== 0;
    const byteDelta = sixteenBit && (conversion & 0x08) !== 0;
    const readChannel = (channel: number) => {
      const channelStart = dataOffset + channel * count * bytesPerSample;
      let deltaAccumulator = 0;
      let byteAccumulatorLow = 0;
      let byteAccumulatorHigh = 0;
      for (let index = 0; index < count; index += 1) {
        const offset = channelStart + index * bytesPerSample;
        let raw: number;
        if (sixteenBit) {
          let low = bytes[offset] ?? 0;
          let high = bytes[offset + 1] ?? 0;
          if (byteDelta) {
            byteAccumulatorLow = (byteAccumulatorLow + low) & 0xff;
            byteAccumulatorHigh = (byteAccumulatorHigh + high) & 0xff;
            low = byteAccumulatorLow;
            high = byteAccumulatorHigh;
          }
          raw = (conversion & 0x02) !== 0 ? (low << 8) | high : low | (high << 8);
        } else raw = bytes[offset] ?? 0;
        let signed: number;
        if (deltaEncoded) {
          const delta = signedSamples ? (raw & signBit ? raw - modulus : raw) : raw - signBit;
          deltaAccumulator = (deltaAccumulator + delta) & (modulus - 1);
          signed = deltaAccumulator & signBit ? deltaAccumulator - modulus : deltaAccumulator;
        } else signed = signedSamples ? (raw & signBit ? raw - modulus : raw) : raw - signBit;
        returnValue[index] = signed / signBit;
      }
      return returnValue;
    };
    const returnValue = new Float32Array(count);
    const left = readChannel(0);
    if (stereo) {
      const right = readChannel(1);
      for (let index = 0; index < count; index += 1) samples[index] = (left[index] + right[index]) * 0.5;
    } else samples.set(left);
    const loopEnabled = (flags & 0x10) !== 0;
    const loopStart = loopEnabled ? Math.min(count, u32le(bytes, headerOffset + 0x34)) : 0;
    const loopEnd = loopEnabled ? Math.min(count, u32le(bytes, headerOffset + 0x38)) : 0;
    const c5Speed = u32le(bytes, headerOffset + 0x3c);
    const sampleRate = c5Speed >= 3000 && c5Speed <= 768000 ? c5Speed : 8363;
    const defaultPan = bytes[headerOffset + 0x2f] ?? 0;
    result.set(sample + 1, { samples, sampleRate, loopStart, loopEnd, loopType: loopEnabled ? (flags & 0x40) !== 0 ? 2 : 1 : 0, rootNote: 61, sixteenBit, stereo, volume: bytes[headerOffset + 0x13] ?? 64, maxmodSampleGlobalVolume: bytes[headerOffset + 0x11] ?? 64, ...(defaultPan & 0x80 ? { panning: Math.max(0, Math.min(255, Math.round(((defaultPan & 0x7f) / 64) * 255))) } : {}), name: text(bytes, headerOffset + 0x14, 26) });
  }
  for (const [instrument, instrumentMap] of instrumentMaps) {
    const references = [...new Set(instrumentMap.samples.filter(sample => sample > 0))];
    const validReferences = references.filter(sample => result.has(sample));
    const variants = validReferences.map(sample => result.get(sample)).filter((sample): sample is TrackerSample => Boolean(sample))
      .map(sample => ({ ...sample, ...(instrumentMap.panning === undefined ? {} : { panning: instrumentMap.panning }), maxmodInstrumentGlobalVolume: instrumentMap.maxmodInstrumentGlobalVolume }));
    if (!variants.length) continue;
    const first = variants[0];
    const variantIndex = instrumentMap.samples.map(sample => {
      const index = validReferences.indexOf(sample);
      return index >= 0 && index < variants.length ? index : 0;
    });
    result.set(instrument, {
      ...first,
      variants,
      noteMap: variantIndex,
      noteTranspose: instrumentMap.transposes,
      ...(instrumentMap.volumeEnvelope ? { volumeEnvelope: instrumentMap.volumeEnvelope } : {}),
      ...(instrumentMap.panningEnvelope ? { panningEnvelope: instrumentMap.panningEnvelope } : {}),
      fadeout: instrumentMap.fadeout,
      fadeoutMaximum: 1024,
      maxmodInstrumentGlobalVolume: instrumentMap.maxmodInstrumentGlobalVolume,
    });
  }
  return result;
}

/** Adds a signed 8-bit one-shot sample and remaps one IT instrument to use it. */
export function replaceItInstrumentPcm(buffer: ArrayBuffer, instrumentIndex: number, pcm: Int8Array, name: string, sampleRate = 8363): ArrayBuffer | null {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 4) !== 'IMPM' || bytes.length < 192 || !Number.isInteger(instrumentIndex) || instrumentIndex < 0 || !pcm.length) return null;
  if (pcm.length > 0xffff_ffff) return null;
  const orders = u16le(bytes, 0x20);
  const instruments = u16le(bytes, 0x22);
  const samplesCount = u16le(bytes, 0x24);
  const patterns = u16le(bytes, 0x26);
  if (instrumentIndex >= instruments || samplesCount >= 0xffff) return null;
  const instrumentPointerTable = 192 + orders;
  const samplePointerTable = instrumentPointerTable + instruments * 4;
  const patternPointerTable = samplePointerTable + samplesCount * 4;
  const insertionOffset = patternPointerTable;
  if (insertionOffset + patterns * 4 > bytes.length) return null;

  const selectedInstrumentOffset = u32le(bytes, instrumentPointerTable + instrumentIndex * 4);
  if (selectedInstrumentOffset + 304 > bytes.length || text(bytes, selectedInstrumentOffset, 4) !== 'IMPI') return null;
  const noteMap = Array.from({ length: 120 }, (_, note) => bytes[selectedInstrumentOffset + 65 + note * 2] ?? 0);
  if (!noteMap.some(sample => sample > 0)) return null;

  const newSampleHeaderOffset = Math.ceil((bytes.length + 4) / 4) * 4;
  const newSampleDataOffset = newSampleHeaderOffset + 0x50;
  const outputLength = newSampleDataOffset + pcm.length;
  if (newSampleHeaderOffset > 0xffff_ffff || newSampleDataOffset > 0xffff_ffff || !Number.isSafeInteger(outputLength)) return null;

  const result = new Uint8Array(outputLength);
  result.set(bytes.subarray(0, insertionOffset), 0);
  result.set(bytes.subarray(insertionOffset), insertionOffset + 4);
  result[0x24] = (samplesCount + 1) & 0xff;
  result[0x25] = (samplesCount + 1) >>> 8;
  const messageOffset = u32le(bytes, 0x38);
  if (messageOffset >= insertionOffset && messageOffset > 0) writeU32le(result, 0x38, messageOffset + 4);

  for (let instrument = 0; instrument < instruments; instrument += 1) {
    const pointerOffset = instrumentPointerTable + instrument * 4;
    const headerOffset = u32le(bytes, pointerOffset);
    if (headerOffset >= insertionOffset) writeU32le(result, pointerOffset, headerOffset + 4);
  }
  for (let sample = 0; sample < samplesCount; sample += 1) {
    const pointerOffset = samplePointerTable + sample * 4;
    const headerOffset = u32le(bytes, pointerOffset);
    if (headerOffset + 0x50 > bytes.length || text(bytes, headerOffset, 4) !== 'IMPS') return null;
    if (headerOffset >= insertionOffset) writeU32le(result, pointerOffset, headerOffset + 4);
  }
  writeU32le(result, insertionOffset, newSampleHeaderOffset);

  for (let pattern = 0; pattern < patterns; pattern += 1) {
    const oldPointerOffset = patternPointerTable + pattern * 4;
    const headerOffset = u32le(bytes, oldPointerOffset);
    if (headerOffset && headerOffset + 8 > bytes.length) return null;
    writeU32le(result, oldPointerOffset + 4, headerOffset >= insertionOffset ? headerOffset + 4 : headerOffset);
  }

  for (let sample = 0; sample < samplesCount; sample += 1) {
    const headerOffset = u32le(result, samplePointerTable + sample * 4);
    const dataOffset = u32le(result, headerOffset + 0x48);
    if (dataOffset >= insertionOffset) writeU32le(result, headerOffset + 0x48, dataOffset + 4);
  }

  const remappedInstrumentOffset = selectedInstrumentOffset >= insertionOffset ? selectedInstrumentOffset + 4 : selectedInstrumentOffset;
  for (let note = 0; note < noteMap.length; note += 1) {
    if (noteMap[note] > 0) result[remappedInstrumentOffset + 65 + note * 2] = samplesCount + 1;
  }

  result.set([... 'IMPS'].map(character => character.charCodeAt(0)), newSampleHeaderOffset);
  result[newSampleHeaderOffset + 0x11] = 64;
  result[newSampleHeaderOffset + 0x12] = 0x01; // sample data present, mono 8-bit PCM, no loop or compression
  result[newSampleHeaderOffset + 0x13] = 64;
  result[newSampleHeaderOffset + 0x2e] = 1; // signed PCM conversion
  writeU32le(result, newSampleHeaderOffset + 0x30, pcm.length);
  writeU32le(result, newSampleHeaderOffset + 0x3c, sampleRate);
  writeU32le(result, newSampleHeaderOffset + 0x48, newSampleDataOffset);
  const sampleName = name.replace(/[^\x20-\x7e]/g, '_').slice(0, 26);
  for (let index = 0; index < sampleName.length; index += 1) result[newSampleHeaderOffset + 0x14 + index] = sampleName.charCodeAt(index);
  result.set([... 'SCRS'].map(character => character.charCodeAt(0)), newSampleHeaderOffset + 0x4c);
  for (let index = 0; index < pcm.length; index += 1) result[newSampleDataOffset + index] = pcm[index] & 0xff;
  return result.buffer;
}

/** Replaces an IT sample in sample mode, preserving its pattern sample number. */
export function replaceItSamplePcm(buffer: ArrayBuffer, sampleIndex: number, pcm: Int8Array, name: string, sampleRate = 8363): ArrayBuffer | null {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 4) !== 'IMPM' || bytes.length < 192 || u16le(bytes, 0x22) !== 0 || !Number.isInteger(sampleIndex) || sampleIndex < 0 || !pcm.length || pcm.length > 0xffff_ffff) return null;
  const orders = u16le(bytes, 0x20);
  const samples = u16le(bytes, 0x24);
  const patterns = u16le(bytes, 0x26);
  if (sampleIndex >= samples) return null;
  const pointerTable = 192 + orders;
  const patternTable = pointerTable + samples * 4;
  if (patternTable + patterns * 4 > bytes.length) return null;
  const headerOffset = u32le(bytes, pointerTable + sampleIndex * 4);
  if (headerOffset + 0x50 > bytes.length || text(bytes, headerOffset, 4) !== 'IMPS') return null;
  const dataOffset = Math.ceil(bytes.length / 4) * 4;
  if (!Number.isSafeInteger(dataOffset + pcm.length) || dataOffset + pcm.length > 0xffff_ffff) return null;
  const result = new Uint8Array(dataOffset + pcm.length);
  result.set(bytes);
  result.fill(0, bytes.length, dataOffset);
  result[headerOffset + 0x12] = 0x01;
  result[headerOffset + 0x2e] = 1;
  writeU32le(result, headerOffset + 0x30, pcm.length);
  writeU32le(result, headerOffset + 0x34, 0);
  writeU32le(result, headerOffset + 0x38, 0);
  writeU32le(result, headerOffset + 0x3c, sampleRate);
  writeU32le(result, headerOffset + 0x48, dataOffset);
  result.fill(0, headerOffset + 0x14, headerOffset + 0x2e);
  const sampleName = name.replace(/[^\x20-\x7e]/g, '_').slice(0, 26);
  for (let index = 0; index < sampleName.length; index += 1) result[headerOffset + 0x14 + index] = sampleName.charCodeAt(index);
  result.set([... 'SCRS'].map(character => character.charCodeAt(0)), headerOffset + 0x4c);
  for (let index = 0; index < pcm.length; index += 1) result[dataOffset + index] = pcm[index] & 0xff;
  return result.buffer;
}

export interface TrackerSamplePatch {
  volume?: number;
  loopStart?: number;
  loopEnd?: number;
  loopType?: number;
  rootNote?: number;
  fineTune?: number;
  panning?: number;
}

/** Updates the first sample header in an XM instrument without touching PCM data. */
export function updateXmSample(buffer: ArrayBuffer, instrumentIndex: number, patch: TrackerSamplePatch, variantIndex = 0): ArrayBuffer {
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
      if (variantIndex < 0 || variantIndex >= sampleCount) return buffer;
      const header = offset + instrumentHeaderSize + variantIndex * sampleHeaderSize;
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
      result[header + 13] = clamp(patch.fineTune, -128, 127, (bytes[header + 13] << 24) >> 24) & 0xff;
      result[header + 15] = clamp(patch.panning, 0, 255, bytes[header + 15] ?? 128);
      const currentRootNote = 48 + ((bytes[header + 16] << 24) >> 24);
      result[header + 16] = (clamp(patch.rootNote, -80, 175, currentRootNote) - 48) & 0xff;
      const boundsChanged = patch.loopStart !== undefined || patch.loopEnd !== undefined;
      if (patch.loopType !== undefined || boundsChanged) {
        const loopType = patch.loopType === undefined ? (loopEnd - loopStart >= 2 ? 1 : 0) : clamp(patch.loopType, 0, 2, type & 0x03);
        result[header + 14] = (type & 0xfc) | loopType;
      }
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
  const pointerOffset = 96 + orders + (sampleIndex - 1) * 2;
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
  const length = u32le(bytes, header + 0x30);
  const start = u32le(bytes, header + 0x34);
  const end = u32le(bytes, header + 0x38);
  const loopStart = clamp(patch.loopStart, 0, length, start);
  const loopEnd = clamp(patch.loopEnd, loopStart, length, end);
  const result = new Uint8Array(bytes);
  writeU32le(result, header + 0x34, loopStart);
  writeU32le(result, header + 0x38, loopEnd);
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
      const event = { note: 0, instrument: 0, volume: 0, volumePresent: false, effect: 0, parameter: 0 };
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
      event.volumePresent = event.volume !== 0;
      events.push(event);
    }
    result.push(events);
  }
  return result;
}

/** Infers a note's exclusive end from its first note-off or following note. */
export function inferXmNoteLength(rows: TrackerPatternEvent[][], startRow: number, channel: number, fallbackLength: number): number {
  for (let row = startRow + 1; row < rows.length; row += 1) {
    const note = rows[row]?.[channel]?.note ?? 0;
    if ((note >= 97 && note <= 99) || (note >= 1 && note <= 96)) return row - startRow;
  }
  return Math.max(1, fallbackLength);
}

export function getMusicModuleFingerprint(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return `${bytes.length.toString(16)}-${hash.toString(16).padStart(8, '0')}`;
}

/**
 * Builds the versioned, project-persistable source view for an XM composition.
 * The source XM remains the persisted asset, preserving unsupported effects
 * and sample payloads while the structured sidecar stays editable.
 */
export function createMusicEditorSourceDocument(
  buffer: ArrayBuffer,
  assetFileName: string,
  previous?: MusicEditorSourceDocument | null,
): MusicEditorSourceDocument {
  const info = parseTrackerModule(buffer, 'xm');
  if (info.format !== 'XM') throw new Error('Music source documents require a valid XM module.');
  const moduleFingerprint = getMusicModuleFingerprint(buffer);
  const stablePrevious = previous && isMusicEditorSourceDocument(previous) ? previous : null;
  const preserveScratch = stablePrevious?.origin === 'scratch' && stablePrevious.moduleFingerprint === moduleFingerprint;
  const samples = parseXmSamples(buffer);
  const patterns = Array.from({ length: info.patterns }, (_, patternIndex) => {
    const previousPattern = stablePrevious?.patterns.find(pattern => pattern.index === patternIndex);
    const id = previousPattern?.id ?? createTrackerUuid();
    const rows = parseXmPatternRows(buffer, patternIndex, 256);
    const events = rows.flatMap((cells, row) => cells.flatMap((event, channel) => {
      if (!(event.note || event.instrument || event.volume || event.effect || event.parameter)) return [];
      const oldEvent = previousPattern?.events.find(item => item.row === row && item.channel === channel);
      return [{ id: oldEvent?.id ?? createTrackerUuid(), row, channel, ...event }];
    }));
    const oldNotes = previousPattern?.notes ?? [];
    const unusedOld = new Set(oldNotes.map((_, index) => index));
    const notes = rows.flatMap((cells, row) => cells.flatMap((event, channel) => {
      if (event.note < 1 || event.note > 96) return [];
      const exact = oldNotes.findIndex((old, index) => unusedOld.has(index) && old.row === row && old.channel === channel && old.note === event.note && old.instrument === event.instrument);
      let oldIndex = exact;
      if (oldIndex < 0) {
        oldIndex = oldNotes.reduce((best, old, index) => {
          if (!unusedOld.has(index) || old.channel !== channel) return best;
          if (best < 0) return index;
          const currentScore = Math.abs(old.row - row) + (old.note === event.note ? 0 : 8) + (old.instrument === event.instrument ? 0 : 4);
          const bestOld = oldNotes[best];
          const bestScore = Math.abs(bestOld.row - row) + (bestOld.note === event.note ? 0 : 8) + (bestOld.instrument === event.instrument ? 0 : 4);
          return currentScore < bestScore ? index : best;
        }, -1);
      }
      const old = oldIndex >= 0 ? oldNotes[oldIndex] : undefined;
      if (oldIndex >= 0) unusedOld.delete(oldIndex);
      return [{
        id: old?.id ?? createTrackerUuid(),
        row,
        channel,
        note: event.note,
        instrument: event.instrument,
        volume: event.volume,
        length: inferXmNoteLength(rows, row, channel, 1),
      }];
    }));
    return { id, index: patternIndex, name: previousPattern?.name ?? `Pattern ${patternIndex + 1}`, rows: rows.length, events, notes };
  });
  const patternIdByIndex = new Map(patterns.map(pattern => [pattern.index, pattern.id]));
  const orderTable = parseTrackerOrderTable(buffer, 'XM');
  return {
    schema: 'gba-studio/music-source',
    version: 1,
    assetFileName,
    moduleFingerprint,
    format: 'XM',
    origin: stablePrevious?.origin ?? 'imported',
    title: info.title,
    tempo: info.tempo ?? 125,
    speed: info.speed ?? 6,
    channels: preserveScratch ? stablePrevious.channels : Array.from({ length: info.channels }, (_, index) => ({ id: stablePrevious?.channels.find(channel => channel.index === index)?.id ?? createTrackerUuid(), index, name: `Channel ${index + 1}` })),
    instruments: preserveScratch ? stablePrevious.instruments : Array.from({ length: info.instruments }, (_, zeroIndex) => {
      const index = zeroIndex + 1;
      const sample = samples.get(index);
      return {
        id: stablePrevious?.instruments.find(instrument => instrument.index === index)?.id ?? createTrackerUuid(),
        index,
        name: sample?.instrumentName || `Instrument ${index}`,
        ...(sample?.noteMap ? { noteMap: sample.noteMap.slice(0, 96) } : {}),
        ...(sample?.volumeEnvelope ? { volumeEnvelope: sample.volumeEnvelope } : {}),
        ...(sample?.panningEnvelope ? { panningEnvelope: sample.panningEnvelope } : {}),
      };
    }),
    samples: preserveScratch ? stablePrevious.samples : [...samples.entries()].flatMap(([index, instrumentSample]) =>
      (instrumentSample.variants?.length ? instrumentSample.variants : [instrumentSample]).map((sample, variantIndex) => {
        const mappedNotes = instrumentSample.noteMap?.slice(0, 96).flatMap((mappedVariant, noteIndex) => mappedVariant === variantIndex ? [noteIndex + 1] : []) ?? [];
        return {
          id: stablePrevious?.samples.find(item => item.index === index && (item.variantIndex ?? 0) === variantIndex)?.id ?? createTrackerUuid(),
          index,
          variantIndex,
          ...(mappedNotes.length ? { noteLow: Math.min(...mappedNotes), noteHigh: Math.max(...mappedNotes) } : {}),
          name: sample.name,
          sampleRate: sample.sampleRate,
          length: sample.samples.length,
          loopStart: sample.loopStart,
          loopEnd: sample.loopEnd,
          rootNote: sample.rootNote,
          volume: sample.volume ?? 64,
          ...(sample.encodedPcm ? { encodedPcm: encodeBase64(sample.encodedPcm) } : {}),
          sixteenBit: sample.sixteenBit,
          loopType: sample.loopType ?? 0,
          fineTune: sample.fineTune ?? 0,
          panning: sample.panning ?? 128,
        };
      }),
    ),
    channelMixer: stablePrevious?.channelMixer,
    patterns,
    order: orderTable.map((patternIndex, index) => ({ id: stablePrevious?.order.find(item => item.index === index)?.id ?? createTrackerUuid(), index, patternId: patternIdByIndex.get(patternIndex) ?? patterns[0]?.id ?? createTrackerUuid() })),
    history: stablePrevious?.history,
  };
}

/** Applies a source-level editor command while keeping stable note IDs and the binary fingerprint in sync. */
export function applyMusicEditorSourceCommand(source: MusicEditorSourceDocument, command: MusicEditorSourceCommand, moduleFingerprint: string): MusicEditorSourceDocument {
  if (command.type === 'set-tempo') return { ...source, tempo: clamp(command.tempo, 32, 255, source.tempo), moduleFingerprint };
  if (command.type === 'set-speed') return { ...source, speed: clamp(command.speed, 1, 31, source.speed), moduleFingerprint };
  if (command.type === 'set-pattern-name') {
    const pattern = source.patterns[command.patternIndex];
    if (!pattern) return { ...source, moduleFingerprint };
    const name = command.name.trim().slice(0, 48) || `Pattern ${command.patternIndex + 1}`;
    if (pattern.name === name) return { ...source, moduleFingerprint };
    return { ...source, moduleFingerprint, patterns: source.patterns.map((item, index) => index === command.patternIndex ? { ...item, name } : item) };
  }
  if (command.type === 'set-pattern-rows') {
    const pattern = source.patterns[command.patternIndex];
    const rows = Math.trunc(command.rows);
    if (!pattern || !Number.isFinite(rows) || rows < 1 || rows > 256 || pattern.events.some(event => event.row >= rows && (event.note || event.instrument || event.volume || event.effect || event.parameter))) return { ...source, moduleFingerprint };
    return { ...source, moduleFingerprint, patterns: source.patterns.map((item, index) => index === command.patternIndex ? { ...item, rows } : item) };
  }
  if (command.type === 'append-instrument') {
    if (source.origin !== 'scratch' || source.instruments.length >= 128 || source.instruments.some(instrument => !source.samples.some(sample => sample.index === instrument.index && (sample.variantIndex ?? 0) === 0))) return { ...source, moduleFingerprint };
    const index = source.instruments.length + 1;
    const preset = command.preset ?? 'sine-lead';
    const presetInfo = TRACKER_INSTRUMENT_PRESETS.find(item => item.id === preset);
    if (!presetInfo) throw new Error(`Unknown tracker instrument preset: ${String(preset)}`);
    const loopType = presetInfo.loopType === 'none' ? 0 : 1;
    const pcm = createPresetDeltaPcm(preset);
    return {
      ...source,
      moduleFingerprint,
      instruments: [...source.instruments, { id: createTrackerUuid(), index, name: command.name ?? presetInfo.name }],
      samples: [...source.samples, { id: createTrackerUuid(), index, variantIndex: 0, name: presetInfo.name, sampleRate: 8363, length: pcm.length, loopStart: loopType ? presetInfo.loopStart ?? 0 : 0, loopEnd: loopType ? pcm.length : 0, rootNote: 48, volume: Math.round(presetInfo.volume * 64), encodedPcm: encodeBase64(pcm), sixteenBit: false, loopType, fineTune: Math.round(12 * 128 * Math.log2(TRACKER_FACTORY_SAMPLE_RATE / 8363)), panning: 128 }],
    };
  }
  if (command.type === 'delete-pattern') {
    if (source.origin !== 'scratch' || source.patterns.length <= 1 || !source.patterns[command.patternIndex]) return { ...source, moduleFingerprint };
    const removed = source.patterns[command.patternIndex];
    const patterns = source.patterns.filter((_, index) => index !== command.patternIndex).map((item, index) => ({ ...item, index }));
    const indexById = new Map(patterns.map((item, index) => [item.id, index]));
    let order = source.order.filter(item => item.patternId !== removed.id).map((item, index) => ({ ...item, index }));
    if (!order.length) order = [{ id: createTrackerUuid(), index: 0, patternId: patterns[0].id }];
    return { ...source, moduleFingerprint, patterns, order: order.map((item, index) => ({ ...item, index, patternId: patterns[indexById.get(item.patternId) ?? 0]?.id ?? patterns[0].id })) };
  }
  if (command.type === 'delete-instrument') {
    const target = command.instrumentIndex;
    if (source.origin !== 'scratch' || source.instruments.length <= 1 || target < 1 || target > source.instruments.length) return { ...source, moduleFingerprint };
    const instruments = source.instruments.filter(item => item.index !== target).map(item => ({ ...item, index: item.index > target ? item.index - 1 : item.index }));
    const samples = source.samples.filter(item => item.index !== target).map(item => ({ ...item, index: item.index > target ? item.index - 1 : item.index }));
    const patterns = source.patterns.map(pattern => ({ ...pattern, events: pattern.events.map(event => ({ ...event, instrument: event.instrument === target ? 0 : event.instrument > target ? event.instrument - 1 : event.instrument })) }));
    return { ...source, moduleFingerprint, instruments, samples, patterns };
  }
  if (command.type === 'append-sample-variant') {
    if (source.origin !== 'scratch' || command.instrumentIndex < 1 || command.instrumentIndex > source.instruments.length || command.noteLow < 1 || command.noteHigh > 96 || command.noteHigh < command.noteLow) return { ...source, moduleFingerprint };
    const variants = source.samples.filter(sample => sample.index === command.instrumentIndex);
    if (!variants.length || variants.length >= 16) return { ...source, moduleFingerprint };
    const variantIndex = Math.max(...variants.map(sample => sample.variantIndex ?? 0)) + 1;
    const instrumentPosition = source.instruments.findIndex(instrument => instrument.index === command.instrumentIndex);
    if (instrumentPosition < 0) return { ...source, moduleFingerprint };
    const instrument = source.instruments[instrumentPosition];
    const noteMap = Array.from({ length: 96 }, (_, noteIndex) => instrument.noteMap?.[noteIndex] ?? 0);
    for (let note = command.noteLow - 1; note < command.noteHigh; note += 1) noteMap[note] = variantIndex;
    return {
      ...source,
      moduleFingerprint,
      instruments: source.instruments.map((item, index) => index === instrumentPosition ? { ...item, noteMap } : item),
      samples: [...source.samples, { ...command.sample, id: createTrackerUuid(), index: command.instrumentIndex, variantIndex, noteLow: command.noteLow, noteHigh: command.noteHigh }],
    };
  }
  if (command.type === 'replace-sample') {
    const target = source.samples.find(sample => command.sampleId ? sample.id === command.sampleId : sample.index === command.sampleIndex && (sample.variantIndex ?? 0) === 0);
    if (!target) return { ...source, moduleFingerprint };
    return { ...source, moduleFingerprint, samples: source.samples.map(sample => sample.id === target.id ? { ...command.sample, id: sample.id, index: sample.index, variantIndex: sample.variantIndex, noteLow: sample.noteLow, noteHigh: sample.noteHigh } : sample) };
  }
  if (command.type === 'move-order') {
    if (command.from < 0 || command.from >= source.order.length || command.to < 0 || command.to >= source.order.length) return { ...source, moduleFingerprint };
    const order = source.order.slice();
    const [entry] = order.splice(command.from, 1);
    order.splice(command.to, 0, entry);
    return { ...source, moduleFingerprint, order: order.map((item, index) => ({ ...item, index })) };
  }
  if (command.type === 'append-pattern') {
    if (source.patterns.length >= 256 || source.order.length >= 256) return { ...source, moduleFingerprint };
    const index = source.patterns.length;
    const template = source.patterns[command.sourcePattern ?? -1];
    const events = template
      ? template.events.map(event => ({ ...event, id: createTrackerUuid() }))
      : [];
    const notes = template
      ? template.notes.map(note => ({ ...note, id: createTrackerUuid() }))
      : [];
    const pattern = { id: createTrackerUuid(), index, rows: template?.rows ?? 64, events, notes };
    const order = [...source.order, { id: createTrackerUuid(), index: source.order.length, patternId: pattern.id }];
    return { ...source, moduleFingerprint, patterns: [...source.patterns, pattern], order };
  }
  if (command.type === 'patch-sample') {
    return {
      ...source,
      moduleFingerprint,
      samples: source.samples.map(sample => {
        if (sample.index !== command.sampleIndex || (sample.variantIndex ?? 0) !== (command.variantIndex ?? 0)) return sample;
        const loopStart = clamp(command.patch.loopStart, 0, sample.length, sample.loopStart);
        const loopEnd = Math.max(loopStart, clamp(command.patch.loopEnd, 0, sample.length, sample.loopEnd));
        const boundsChanged = command.patch.loopStart !== undefined || command.patch.loopEnd !== undefined;
        return {
          ...sample,
          volume: clamp(command.patch.volume, 0, 64, sample.volume),
          loopStart,
          loopEnd,
          loopType: command.patch.loopType === undefined
            ? boundsChanged ? (loopEnd - loopStart >= 2 ? 1 : 0) : sample.loopType ?? 0
            : clamp(command.patch.loopType, 0, 2, sample.loopType ?? 0),
          rootNote: clamp(command.patch.rootNote, -80, 175, sample.rootNote),
          fineTune: clamp(command.patch.fineTune, -128, 127, sample.fineTune ?? 0),
          panning: clamp(command.patch.panning, 0, 255, sample.panning ?? 128),
        };
      }),
    };
  }

  const pattern = source.patterns[command.patternIndex];
  if (!pattern || command.updates.length === 0) return { ...source, moduleFingerprint };
  const events = new Map(pattern.events.map(event => [`${event.row}:${event.channel}`, event]));
  for (const update of command.updates) {
    if (update.row < 0 || update.row >= pattern.rows || update.channel < 0 || update.channel >= source.channels.length) continue;
    const key = `${update.row}:${update.channel}`;
    const current = events.get(key) ?? { id: createTrackerUuid(), row: update.row, channel: update.channel, note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
    const next = {
      ...current,
      note: clamp(update.patch.note, 0, 255, current.note),
      instrument: clamp(update.patch.instrument, 0, 255, current.instrument),
      volume: clamp(update.patch.volume, 0, 255, current.volume),
      effect: clamp(update.patch.effect, 0, 255, current.effect),
      parameter: clamp(update.patch.parameter, 0, 255, current.parameter),
    };
    if (!(next.note || next.instrument || next.volume || next.effect || next.parameter)) events.delete(key);
    else events.set(key, next);
  }
  const nextEvents = [...events.values()].sort((a, b) => a.row - b.row || a.channel - b.channel);
  const oldNotes = pattern.notes;
  const unusedOld = new Set(oldNotes.map((_, index) => index));
  const noteEvents = nextEvents.filter(event => event.note >= 1 && event.note <= 96);
  const notes = noteEvents.map(event => {
    let oldIndex = oldNotes.findIndex((old, index) => unusedOld.has(index) && old.row === event.row && old.channel === event.channel && old.note === event.note && old.instrument === event.instrument);
    if (oldIndex < 0) oldIndex = oldNotes.reduce((best, old, index) => {
      if (!unusedOld.has(index) || old.channel !== event.channel) return best;
      if (best < 0) return index;
      const score = Math.abs(old.row - event.row) + (old.note === event.note ? 0 : 8) + (old.instrument === event.instrument ? 0 : 4);
      const bestOld = oldNotes[best];
      const bestScore = Math.abs(bestOld.row - event.row) + (bestOld.note === event.note ? 0 : 8) + (bestOld.instrument === event.instrument ? 0 : 4);
      return score < bestScore ? index : best;
    }, -1);
    const old = oldIndex >= 0 ? oldNotes[oldIndex] : undefined;
    if (oldIndex >= 0) unusedOld.delete(oldIndex);
    const endingEvent = nextEvents.find(next => next.channel === event.channel && next.row > event.row && (next.note === 97 || (next.note >= 1 && next.note <= 96)));
    return {
      id: old?.id ?? createTrackerUuid(),
      row: event.row,
      channel: event.channel,
      note: event.note,
      instrument: event.instrument,
      volume: event.volume,
      length: endingEvent ? endingEvent.row - event.row : Math.max(1, old?.length ?? 1),
    };
  });
  const patterns = source.patterns.slice();
  patterns[command.patternIndex] = { ...pattern, events: nextEvents, notes };
  return { ...source, moduleFingerprint, patterns };
}

/**
 * Updates one XM event and rebuilds only the selected pattern as valid packed
 * XM events. The returned buffer is a derived copy; the source ArrayBuffer is
 * never mutated. Re-encoding all cells is intentional: it keeps the writer
 * deterministic while preserving the pattern header and all following data.
 */
export function updateXmPatternEvent(buffer: ArrayBuffer, patternIndex: number, rowIndex: number, channelIndex: number, patch: Partial<TrackerPatternEvent>): ArrayBuffer {
  return updateXmPatternEvents(buffer, patternIndex, [{ row: rowIndex, channel: channelIndex, patch }]);
}

function encodeXmPatternCells(rows: TrackerPatternEvent[][], rowCount: number, channels: number): Uint8Array {
  const encoded = new Uint8Array(rowCount * channels * 6);
  let cursor = 0;
  for (let row = 0; row < rowCount; row += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const event = rows[row]?.[channel];
      // Omit empty fields. In particular mmutil treats an explicitly present
      // zero note differently from an absent note and can retrigger the voice.
      let mask = 0x80;
      if (event?.note) mask |= 1;
      if (event?.instrument) mask |= 2;
      if (event?.volume) mask |= 4;
      if (event?.effect || event?.parameter) mask |= 8 | 16;
      encoded[cursor++] = mask;
      if (mask & 1) encoded[cursor++] = event!.note;
      if (mask & 2) encoded[cursor++] = event!.instrument;
      if (mask & 4) encoded[cursor++] = event!.volume;
      if (mask & 8) encoded[cursor++] = event!.effect;
      if (mask & 16) encoded[cursor++] = event!.parameter;
    }
  }
  return encoded.subarray(0, cursor);
}

/** Rebuilds an XM pattern once for a batch of source-document event commands. */
export function updateXmPatternEvents(buffer: ArrayBuffer, patternIndex: number, updates: TrackerPatternEventUpdate[]): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 17) !== 'Extended Module:' || bytes.length < 80) return buffer;
  const channels = u16le(bytes, 68);
  const patternCount = u16le(bytes, 70);
  if (patternIndex < 0 || patternIndex >= patternCount || updates.length === 0) return buffer;
  let patternOffset = 60 + u32le(bytes, 60);
  for (let pattern = 0; pattern < patternIndex; pattern += 1) {
    if (patternOffset + 9 > bytes.length) return buffer;
    patternOffset += u32le(bytes, patternOffset) + u16le(bytes, patternOffset + 7);
  }
  if (patternOffset + 9 > bytes.length) return buffer;
  const headerSize = u32le(bytes, patternOffset);
  const rows = Math.max(1, u16le(bytes, patternOffset + 5));
  const packedSize = u16le(bytes, patternOffset + 7);
  if (patternOffset + headerSize + packedSize > bytes.length) return buffer;
  const parsed = parseXmPatternRows(buffer, patternIndex, rows);
  while (parsed.length < rows) parsed.push([]);
  let changed = false;
  for (const { row, channel, patch } of updates) {
    if (row < 0 || row >= rows || channel < 0 || channel >= channels) continue;
    const current = parsed[row][channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
    const next = {
      note: Math.max(0, Math.min(255, Math.trunc(Number(patch.note ?? current.note) || 0))),
      instrument: Math.max(0, Math.min(255, Math.trunc(Number(patch.instrument ?? current.instrument) || 0))),
      volume: Math.max(0, Math.min(255, Math.trunc(Number(patch.volume ?? current.volume) || 0))),
      effect: Math.max(0, Math.min(255, Math.trunc(Number(patch.effect ?? current.effect) || 0))),
      parameter: Math.max(0, Math.min(255, Math.trunc(Number(patch.parameter ?? current.parameter) || 0))),
    };
    if (next.note === current.note && next.instrument === current.instrument && next.volume === current.volume && next.effect === current.effect && next.parameter === current.parameter) continue;
    parsed[row][channel] = next;
    changed = true;
  }
  if (!changed) return buffer;
  const encoded = encodeXmPatternCells(parsed, rows, channels);
  if (encoded.length > 0xffff) return buffer;
  const patternEnd = patternOffset + headerSize + packedSize;
  const result = new Uint8Array(bytes.length - packedSize + encoded.length);
  result.set(bytes.slice(0, patternOffset + headerSize), 0);
  result[patternOffset + 7] = encoded.length & 0xff;
  result[patternOffset + 8] = (encoded.length >> 8) & 0xff;
  result.set(encoded, patternOffset + headerSize);
  result.set(bytes.slice(patternEnd), patternOffset + headerSize + encoded.length);
  return result.buffer;
}

/** Resizes one XM pattern while retaining every event and all other module data. */
export function resizeXmPatternRows(buffer: ArrayBuffer, patternIndex: number, requestedRows: number): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 17) !== 'Extended Module:' || bytes.length < 80) return buffer;
  const patternCount = u16le(bytes, 70);
  const channels = u16le(bytes, 68);
  if (!Number.isInteger(requestedRows) || requestedRows < 1 || requestedRows > 256 || patternIndex < 0 || patternIndex >= patternCount) return buffer;
  let patternOffset = 60 + u32le(bytes, 60);
  for (let pattern = 0; pattern < patternIndex; pattern += 1) {
    if (patternOffset + 9 > bytes.length) return buffer;
    patternOffset += u32le(bytes, patternOffset) + u16le(bytes, patternOffset + 7);
  }
  if (patternOffset + 9 > bytes.length) return buffer;
  const headerSize = u32le(bytes, patternOffset);
  const currentRows = Math.max(1, u16le(bytes, patternOffset + 5));
  const packedSize = u16le(bytes, patternOffset + 7);
  const patternEnd = patternOffset + headerSize + packedSize;
  if (patternEnd > bytes.length) return buffer;
  if (requestedRows === currentRows) return buffer;
  const parsed = parseXmPatternRows(buffer, patternIndex, currentRows);
  if (requestedRows < currentRows && parsed.slice(requestedRows).some(row => row.some(event => event.note || event.instrument || event.volume || event.effect || event.parameter))) return buffer;
  const encoded = encodeXmPatternCells(parsed, requestedRows, channels);
  if (encoded.length > 0xffff) return buffer;
  const result = new Uint8Array(bytes.length - packedSize + encoded.length);
  result.set(bytes.slice(0, patternOffset + headerSize));
  result[patternOffset + 5] = requestedRows & 0xff;
  result[patternOffset + 6] = (requestedRows >> 8) & 0xff;
  result[patternOffset + 7] = encoded.length & 0xff;
  result[patternOffset + 8] = (encoded.length >> 8) & 0xff;
  result.set(encoded, patternOffset + headerSize);
  result.set(bytes.slice(patternEnd), patternOffset + headerSize + encoded.length);
  return result.buffer;
}

/** Adds a 64-row XM pattern and appends it to the order list. Pass a source index to duplicate its pattern data. */
export function appendXmPattern(buffer: ArrayBuffer, sourcePattern?: number): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 17) !== 'Extended Module:' || bytes.length < 336) return buffer;
  const patternCount = u16le(bytes, 70);
  const orderCount = u16le(bytes, 64);
  if (patternCount >= 256 || orderCount >= 256) return buffer;
  let insertOffset = 60 + u32le(bytes, 60);
  let sourceOffset = -1;
  let sourceLength = 0;
  for (let pattern = 0; pattern < patternCount; pattern += 1) {
    if (insertOffset + 9 > bytes.length) return buffer;
    const blockLength = u32le(bytes, insertOffset) + u16le(bytes, insertOffset + 7);
    if (blockLength < 9 || insertOffset + blockLength > bytes.length) return buffer;
    if (pattern === sourcePattern) { sourceOffset = insertOffset; sourceLength = blockLength; }
    insertOffset += blockLength;
  }
  const block = sourceOffset >= 0
    ? bytes.slice(sourceOffset, sourceOffset + sourceLength)
    : new Uint8Array([9, 0, 0, 0, 0, 64, 0, 0, 0]);
  const result = new Uint8Array(bytes.length + block.length);
  result.set(bytes.slice(0, insertOffset), 0);
  result.set(block, insertOffset);
  result.set(bytes.slice(insertOffset), insertOffset + block.length);
  const view = new DataView(result.buffer);
  view.setUint16(70, patternCount + 1, true);
  view.setUint16(64, orderCount + 1, true);
  result[80 + orderCount] = patternCount;
  return result.buffer;
}

/** Reorders one XM song-order entry without changing or copying its pattern. */
export function moveXmOrder(buffer: ArrayBuffer, from: number, to: number): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 17) !== 'Extended Module:' || bytes.length < 80) return buffer;
  const count = u16le(bytes, 64);
  if (from < 0 || to < 0 || from >= count || to >= count || from === to) return buffer;
  const orders = Array.from(bytes.slice(80, 80 + count));
  const [value] = orders.splice(from, 1);
  orders.splice(to, 0, value);
  const result = new Uint8Array(bytes);
  result.set(orders, 80);
  return result.buffer;
}

/** Compiles one editor source command to XM using the same writers as export. */
export function compileMusicEditorSourceCommand(buffer: ArrayBuffer, command: MusicEditorSourceCommand): ArrayBuffer {
  if (command.type === 'set-pattern-name') return buffer;
  if (command.type === 'set-pattern-rows') return resizeXmPatternRows(buffer, command.patternIndex, command.rows);
  if (command.type === 'patch-events') return updateXmPatternEvents(buffer, command.patternIndex, command.updates);
  if (command.type === 'set-tempo' || command.type === 'set-speed') {
    const bytes = new Uint8Array(buffer.slice(0));
    if (text(bytes, 0, 17) !== 'Extended Module:' || bytes.length < 80) return buffer;
    const offset = command.type === 'set-tempo' ? 78 : 76;
    const value = command.type === 'set-tempo' ? clamp(command.tempo, 32, 255, u16le(bytes, offset)) : clamp(command.speed, 1, 31, u16le(bytes, offset));
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >> 8) & 0xff;
    return bytes.buffer;
  }
  if (command.type === 'move-order') return moveXmOrder(buffer, command.from, command.to);
  if (command.type === 'append-pattern') return appendXmPattern(buffer, command.sourcePattern);
  if (command.type === 'append-instrument') throw new Error('Adding instruments requires the scratch source compiler.');
  if (command.type === 'append-sample-variant') throw new Error('Adding XM sample variants requires the scratch source compiler.');
  if (command.type === 'replace-sample') {
    const encodedPcm = command.sample.encodedPcm ? decodeBase64(command.sample.encodedPcm) : null;
    if (!encodedPcm) throw new Error('Replacing an XM sample requires its delta-encoded PCM payload.');
    const variantIndex = command.sample.variantIndex ?? 0;
    const replaced = replaceXmSamplePcm(buffer, command.sampleIndex, encodedPcm, command.sample.name ?? '', variantIndex);
    if (!replaced) throw new Error('The selected XM instrument has no replaceable sample.');
    return updateXmSample(replaced, command.sampleIndex, {
      volume: command.sample.volume,
      loopStart: command.sample.loopStart,
      loopEnd: command.sample.loopEnd,
      rootNote: command.sample.rootNote,
      fineTune: command.sample.fineTune,
      panning: command.sample.panning,
    }, variantIndex);
  }
    if (command.type === 'patch-sample') return updateXmSample(buffer, command.sampleIndex, command.patch, command.variantIndex ?? 0);
  throw new Error(`Unsupported XM source command: ${command.type}`);
}

/** Compiles a newly composed beat from its source document without reading an XM base file. */
export function compileMusicEditorSourceDocument(source: MusicEditorSourceDocument): ArrayBuffer {
  if (!isMusicEditorSourceDocument(source)) throw new Error('Invalid Music Editor source document.');
  if (source.origin !== 'scratch') throw new Error('Only scratch compositions can currently be compiled without an XM base module.');
  if (source.channels.length < 1 || source.channels.length > 32 || source.instruments.length < 1 || source.instruments.length > 128 || source.samples.length < source.instruments.length || source.samples.some(sample => sample.index < 1 || sample.index > source.instruments.length)) {
    throw new Error('Scratch XM export requires one to 32 channels and one or more samples per instrument.');
  }
  if (source.patterns.length < 1 || source.patterns.length > 256 || source.order.length < 1 || source.order.length > 256) {
    throw new Error('Scratch XM export requires between one and 256 patterns and order entries.');
  }
  if (source.patterns.some(pattern => !Number.isInteger(pattern.rows) || pattern.rows < 1 || pattern.rows > 256)) throw new Error('Scratch XM export requires patterns between 1 and 256 rows.');

  const templateSample = (sample: MusicEditorSourceDocument['samples'][number]) => {
    const encodedPcm = sample.encodedPcm ? decodeBase64(sample.encodedPcm) : undefined;
    const sampleUnit = sample.sixteenBit ? 2 : 1;
    if (!encodedPcm && (sample.length !== 2048 || sample.sixteenBit || sample.rootNote !== 48 || (sample.fineTune ?? 0) !== 0 || (sample.panning ?? 128) !== 128)) {
      throw new Error(`Scratch XM sample ${sample.index}.${sample.variantIndex ?? 0} metadata requires its encoded PCM payload.`);
    }
    if (encodedPcm && (encodedPcm.length === 0 || encodedPcm.length % sampleUnit !== 0 || encodedPcm.length / sampleUnit !== sample.length)) {
      throw new Error(`Scratch XM sample ${sample.index}.${sample.variantIndex ?? 0} payload does not match its declared length.`);
    }
    if (sample.loopStart < 0 || sample.loopEnd < sample.loopStart || sample.loopEnd > sample.length) {
      throw new Error(`Scratch XM sample ${sample.index}.${sample.variantIndex ?? 0} loop is outside its payload.`);
    }
    return encodedPcm ? {
      deltaEncodedPcm: encodedPcm,
      sixteenBit: sample.sixteenBit,
      loopType: sample.loopType,
      loopStart: sample.loopStart,
      loopEnd: sample.loopEnd,
      rootNote: sample.rootNote,
      fineTune: sample.fineTune,
      panning: sample.panning,
      name: sample.name,
      volume: sample.volume,
    } : undefined;
  };
  const templateInstruments = source.instruments.map(instrument => {
    const samples = source.samples.filter(sample => sample.index === instrument.index).sort((left, right) => (left.variantIndex ?? 0) - (right.variantIndex ?? 0));
    if (!samples.length || samples.length > 16 || samples.some((sample, index) => (sample.variantIndex ?? 0) !== index)) throw new Error(`Scratch XM instrument ${instrument.index} has invalid sample variant indexes.`);
    const noteMap = Array.from({ length: 96 }, () => 0);
    if (instrument.noteMap !== undefined) {
      if (instrument.noteMap.length !== 96 || instrument.noteMap.some(index => !Number.isInteger(index) || index < 0 || index >= samples.length)) {
        throw new Error(`Scratch XM instrument ${instrument.index} has an invalid explicit note map.`);
      }
      noteMap.splice(0, noteMap.length, ...instrument.noteMap);
    } else {
      const occupied = new Set<number>();
      samples.slice(1).forEach((sample, index) => {
        const variantIndex = index + 1;
        const low = sample.noteLow;
        const high = sample.noteHigh;
        if (!Number.isInteger(low) || !Number.isInteger(high) || low! < 1 || high! > 96 || high! < low!) throw new Error(`Scratch XM sample variant ${instrument.index}.${variantIndex} needs a valid note range.`);
        for (let note = low! - 1; note < high!; note += 1) {
          if (occupied.has(note)) throw new Error(`Scratch XM instrument ${instrument.index} has overlapping sample note ranges.`);
          occupied.add(note);
          noteMap[note] = variantIndex;
        }
      });
    }
    return {
      name: instrument.name, samples: samples.map(templateSample), noteMap,
      volumeEnvelope: instrument.volumeEnvelope ? {
        points: instrument.volumeEnvelope.points, sustain: instrument.volumeEnvelope.sustain ?? instrument.volumeEnvelope.sustainStart ?? 0,
        loopStart: instrument.volumeEnvelope.loopStart, loopEnd: instrument.volumeEnvelope.loopEnd, enabled: instrument.volumeEnvelope.enabled,
        sustainEnabled: instrument.volumeEnvelope.sustainEnabled, loopEnabled: instrument.volumeEnvelope.loopEnabled,
      } : undefined,
      panningEnvelope: instrument.panningEnvelope ? {
        points: instrument.panningEnvelope.points, sustain: instrument.panningEnvelope.sustain ?? 0,
        loopStart: instrument.panningEnvelope.loopStart, loopEnd: instrument.panningEnvelope.loopEnd, enabled: instrument.panningEnvelope.enabled,
        sustainEnabled: instrument.panningEnvelope.sustainEnabled, loopEnabled: instrument.panningEnvelope.loopEnabled,
      } : undefined,
      fadeout: instrument.fadeout,
    };
  });
  let compiled = createXmBeatTemplateWithInstruments(source.title, templateInstruments, source.channels.length);
  for (let patternIndex = 1; patternIndex < source.patterns.length; patternIndex += 1) compiled = appendXmPattern(compiled);
  for (const [patternIndex, pattern] of source.patterns.entries()) {
    if (pattern.index !== patternIndex) throw new Error(`Pattern ${pattern.id} has an inconsistent index.`);
    compiled = resizeXmPatternRows(compiled, patternIndex, pattern.rows);
    const updates = pattern.events.map(event => ({
      row: event.row,
      channel: event.channel,
      patch: { note: event.note, instrument: event.instrument, volume: event.volume, effect: event.effect, parameter: event.parameter },
    }));
    if (updates.some(update => update.row < 0 || update.row >= pattern.rows || update.channel < 0 || update.channel >= source.channels.length)) {
      throw new Error(`Pattern ${pattern.id} contains an event outside the scratch XM grid.`);
    }
    compiled = updateXmPatternEvents(compiled, patternIndex, updates);
  }
  compiled = compileMusicEditorSourceCommand(compiled, { type: 'set-tempo', tempo: source.tempo });
  compiled = compileMusicEditorSourceCommand(compiled, { type: 'set-speed', speed: source.speed });
  source.samples.forEach((sample, index) => {
    if (!sample.encodedPcm) compiled = updateXmSample(compiled, sample.index, { volume: sample.volume, loopStart: sample.loopStart, loopEnd: sample.loopEnd });
  });

  const patternIndexes = new Map(source.patterns.map((pattern, index) => [pattern.id, index]));
  const order = source.order.map(entry => {
    const patternIndex = patternIndexes.get(entry.patternId);
    if (patternIndex === undefined) throw new Error(`Order entry ${entry.id} points to a missing pattern.`);
    return patternIndex;
  });
  const bytes = new Uint8Array(compiled);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  view.setUint16(64, order.length, true);
  bytes.fill(0, 80, 336);
  order.forEach((patternIndex, index) => { bytes[80 + index] = patternIndex; });
  return bytes.buffer;
}

export function parseS3mPatternRows(buffer: ArrayBuffer, patternIndex = 0, rowLimit = 32): TrackerPatternEvent[][] {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 44, 4) !== 'SCRM' || bytes.length < 96) return [];
  const orders = u16le(bytes, 32);
  const instruments = u16le(bytes, 34);
  const patterns = u16le(bytes, 36);
  if (patternIndex < 0 || patternIndex >= patterns) return [];
  const activeChannels = Array.from(bytes.slice(64, 96)).filter(channel => channel < 0x80);
  const channels = activeChannels.length;
  const patternPointerOffset = 96 + orders + instruments * 2 + patternIndex * 2;
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
    if (!result[row]) result[row] = Array.from({ length: channels }, () => ({ note: 0, notePresent: false, instrument: 0, volume: 0, volumePresent: false, effect: 0, parameter: 0 }));
    if (token & 32) {
      const note = bytes[cursor++];
      const instrument = bytes[cursor++];
      if (channel >= 0 && channel < channels) { result[row][channel].note = note; result[row][channel].notePresent = true; result[row][channel].instrument = instrument; }
    }
    if (token & 64) {
      const volume = bytes[cursor++];
      if (channel >= 0 && channel < channels) { result[row][channel].volume = volume; result[row][channel].volumePresent = true; }
    }
    if (token & 128) {
      const effect = bytes[cursor++];
      const parameter = bytes[cursor++];
      if (channel >= 0 && channel < channels) { result[row][channel].effect = effect; result[row][channel].parameter = parameter; }
    }
  }
  return Array.from({ length: Math.min(64, rowLimit) }, (_, index) => result[index] ?? Array.from({ length: channels }, () => ({ note: 0, notePresent: false, instrument: 0, volume: 0, volumePresent: false, effect: 0, parameter: 0 })));
}

export interface TrackerPatternEventUpdate {
  row: number;
  channel: number;
  patch: Partial<TrackerPatternEvent>;
}

/** Rebuilds one S3M pattern once for a batch of edited cells. */
export function updateS3mPatternEvents(buffer: ArrayBuffer, patternIndex: number, updates: TrackerPatternEventUpdate[]): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 44, 4) !== 'SCRM' || bytes.length < 96) return buffer;
  const orders = u16le(bytes, 32);
  const instruments = u16le(bytes, 34);
  const patterns = u16le(bytes, 36);
  const activeChannels = Array.from(bytes.slice(64, 96)).filter(channel => channel < 0x80);
  if (patternIndex < 0 || patternIndex >= patterns || updates.length === 0) return buffer;
  const pointerOffset = 96 + orders + instruments * 2 + patternIndex * 2;
  if (pointerOffset + 2 > bytes.length) return buffer;
  const patternOffset = u16le(bytes, pointerOffset) * 16;
  if (patternOffset + 2 > bytes.length) return buffer;
  const packedLength = u16le(bytes, patternOffset);
  if (patternOffset + 2 + packedLength > bytes.length) return buffer;
  const rows = parseS3mPatternRows(buffer, patternIndex, 64);
  while (rows.length < 64) rows.push([]);
  let changed = false;
  for (const { row, channel, patch } of updates) {
    if (row < 0 || row >= 64 || channel < 0 || channel >= activeChannels.length) continue;
    const current = rows[row]?.[channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
    const next = {
      note: Math.max(0, Math.min(255, Math.trunc(Number(patch.note ?? current.note) || 0))),
      instrument: Math.max(0, Math.min(255, Math.trunc(Number(patch.instrument ?? current.instrument) || 0))),
      volume: Math.max(0, Math.min(255, Math.trunc(Number(patch.volume ?? current.volume) || 0))),
      volumePresent: patch.volumePresent ?? (patch.volume !== undefined ? true : current.volumePresent ?? false),
      effect: Math.max(0, Math.min(255, Math.trunc(Number(patch.effect ?? current.effect) || 0))),
      parameter: Math.max(0, Math.min(255, Math.trunc(Number(patch.parameter ?? current.parameter) || 0))),
    };
    if (next.note === current.note && next.instrument === current.instrument && next.volume === current.volume && next.volumePresent === (current.volumePresent ?? false) && next.effect === current.effect && next.parameter === current.parameter) continue;
    if (!rows[row]) rows[row] = [];
    rows[row][channel] = next;
    changed = true;
  }
  if (!changed) return buffer;
  const encoded: number[] = [];
  for (let row = 0; row < 64; row += 1) {
    for (let channel = 0; channel < activeChannels.length; channel += 1) {
      const event = rows[row]?.[channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const hasNote = event.note !== 0 || event.instrument !== 0;
      const hasVolume = event.volumePresent ?? event.volume !== 0;
      const hasEffect = event.effect !== 0 || event.parameter !== 0;
      if (!hasNote && !hasVolume && !hasEffect) continue;
      encoded.push((activeChannels[channel] & 31) | (hasNote ? 32 : 0) | (hasVolume ? 64 : 0) | (hasEffect ? 128 : 0));
      if (hasNote) encoded.push(event.note, event.instrument);
      if (hasVolume) encoded.push(event.volume);
      if (hasEffect) encoded.push(event.effect, event.parameter);
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

export function updateS3mPatternEvent(buffer: ArrayBuffer, patternIndex: number, rowIndex: number, channelIndex: number, patch: Partial<TrackerPatternEvent>): ArrayBuffer {
  return updateS3mPatternEvents(buffer, patternIndex, [{ row: rowIndex, channel: channelIndex, patch }]);
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
  const previousVolumePresent = new Uint8Array(64);
  const previousEvents = Array.from({ length: 64 }, () => ({ note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 }));
  const result: TrackerPatternEvent[][] = [];
  while (row < Math.min(rows, rowLimit) && cursor < end) {
    const token = bytes[cursor++];
    if (token === 0) { row += 1; continue; }
    // IT stores channel numbers as 1..64; zero in the low six bits represents channel 64.
    const channel = ((token & 0x7f) - 1) & 0x3f;
    if (token & 0x80) masks[channel] = bytes[cursor++];
    const mask = masks[channel];
    if (!result[row]) result[row] = Array.from({ length: 64 }, () => ({ note: 0, notePresent: false, instrument: 0, instrumentPresent: false, volume: 0, effect: 0, parameter: 0 }));
    const event = result[row][channel];
    if (mask & 1) { event.note = bytes[cursor++]; event.notePresent = true; }
    else if (mask & 16) { event.note = previousEvents[channel].note; event.notePresent = true; }
    if (mask & 2) { event.instrument = bytes[cursor++]; event.instrumentPresent = true; }
    else if (mask & 32) { event.instrument = previousEvents[channel].instrument; event.instrumentPresent = true; }
    if (mask & 4) {
      event.volume = bytes[cursor++];
      previousVolumePresent[channel] = 1;
      if (event.volume === 0) event.volumePresent = true;
    } else if (mask & 64) {
      event.volume = previousEvents[channel].volume;
      if (previousVolumePresent[channel] && event.volume === 0) event.volumePresent = true;
    }
    if (mask & 8) { event.effect = bytes[cursor++]; event.parameter = bytes[cursor++]; }
    else if (mask & 128) { event.effect = previousEvents[channel].effect; event.parameter = previousEvents[channel].parameter; }
    previousEvents[channel] = { ...previousEvents[channel], ...event };
  }
  return Array.from({ length: Math.min(rows, rowLimit) }, (_, index) => result[index] ?? Array.from({ length: 64 }, () => ({ note: 0, notePresent: false, instrument: 0, instrumentPresent: false, volume: 0, effect: 0, parameter: 0 })));
}

export { flattenItInstrumentModeForBuild } from '../../../../shared/trackerItBuildCompatibility';

/**
 * Reads the module order list without interpreting pattern data.  S3M and IT
 * use 254 as a separator and 255 as the end marker.
 */
export function parseTrackerOrderTable(buffer: ArrayBuffer, format: TrackerModuleInfo['format']): number[] {
  const bytes = new Uint8Array(buffer);
  const normalized = format.toUpperCase() as TrackerModuleInfo['format'];
  if (normalized === 'XM' && text(bytes, 0, 17) === 'Extended Module:' && bytes.length >= 80) {
    const length = Math.min(u16le(bytes, 64), bytes.length - 80);
    return Array.from(bytes.slice(80, 80 + length));
  }
  if (normalized === 'S3M' && text(bytes, 44, 4) === 'SCRM' && bytes.length >= 96) {
    const length = Math.min(u16le(bytes, 32), bytes.length - 96);
    return Array.from(bytes.slice(96, 96 + length));
  }
  if (normalized === 'IT' && text(bytes, 0, 4) === 'IMPM' && bytes.length >= 192) {
    const length = Math.min(u16le(bytes, 0x20), bytes.length - 192);
    return Array.from(bytes.slice(192, 192 + length));
  }
  return [];
}

/** IT stores effect commands as five-bit command IDs or their ASCII letters. */
const normalizeItEffectCommand = (effect: number): number => {
  const command = effect & 0x1f;
  return command <= 26 ? command : 0;
};

/**
 * Expands the order list into bounded playback rows.  The editor still shows
 * one selected pattern for editing, while preview follows the same sequence a
 * tracker player would traverse.  Separator/end markers and invalid pointers
 * are ignored rather than allowing malformed modules to allocate unbounded
 * data in the renderer.
 */
export function parseTrackerPlaybackRows(
  buffer: ArrayBuffer,
  format: TrackerModuleInfo['format'],
  maxRows = 1024,
  onPosition?: (position: TrackerPlaybackPosition) => void,
): TrackerPatternEvent[][] {
  const normalized = format.toUpperCase();
  const info = parseTrackerModule(buffer, normalized);
  if (!(normalized === 'XM' || normalized === 'S3M' || normalized === 'IT') || info.patterns <= 0 || maxRows <= 0) return [];
  const orders = parseTrackerOrderTable(buffer, normalized);
  const result: TrackerPatternEvent[][] = [];
  if (normalized === 'XM') {
    let orderIndex = 0;
    let startRow = 0;
    const visitedOrderStates = new Set<string>();
    while (orderIndex < orders.length && result.length < maxRows) {
      const stateKey = `${orderIndex}:${startRow}`;
      if (visitedOrderStates.has(stateKey)) break;
      visitedOrderStates.add(stateKey);
      const patternIndex = orders[orderIndex];
      if (patternIndex >= info.patterns) { orderIndex += 1; startRow = 0; continue; }
      const rows = parseXmPatternRows(buffer, patternIndex, 256);
      let patternLoopStart = 0;
      let patternLoopRemaining = 0;
      let breakRow: number | undefined;
      let jumpOrder: number | undefined;
      let rowIndex = startRow;
      while (rowIndex < rows.length && result.length < maxRows) {
        const row = rows[rowIndex];
        onPosition?.({ order: orderIndex, pattern: patternIndex, row: rowIndex });
        result.push(row);
        let patternLoop: number | undefined;
        for (const event of row ?? []) {
          if (!event) continue;
          const effect = event.effect & 0xff;
          const parameter = event.parameter & 0xff;
          if (effect === 0x0b && parameter < orders.length) jumpOrder = parameter;
          if (effect === 0x0d) {
            const tens = (parameter >> 4) & 0x0f;
            const ones = parameter & 0x0f;
            if (tens <= 9 && ones <= 9) breakRow = tens * 10 + ones;
          }
          if (effect === 0x0e && (parameter >> 4) === 0x06) {
            const loopCount = parameter & 0x0f;
            if (loopCount === 0) patternLoopStart = rowIndex;
            else patternLoop = loopCount;
          }
        }
        // Position jumps and pattern breaks take priority over a pattern loop,
        // matching the row transition order used by the target build core.
        if (breakRow !== undefined || jumpOrder !== undefined) break;
        if (patternLoop !== undefined && patternLoop > 0) {
          if (patternLoopRemaining === 0) {
            patternLoopRemaining = patternLoop;
            rowIndex = patternLoopStart;
            continue;
          }
          patternLoopRemaining -= 1;
          if (patternLoopRemaining > 0) {
            rowIndex = patternLoopStart;
            continue;
          }
        }
        rowIndex += 1;
      }
      if (jumpOrder !== undefined) orderIndex = jumpOrder;
      else orderIndex += 1;
      startRow = breakRow ?? 0;
    }
    return result;
  }
  if (normalized === 'S3M' || normalized === 'IT') {
    let orderIndex = 0;
    let startRow = 0;
    const visitedOrderStates = new Set<string>();
    while (orderIndex < orders.length && result.length < maxRows) {
      const stateKey = `${orderIndex}:${startRow}`;
      if (visitedOrderStates.has(stateKey)) break;
      visitedOrderStates.add(stateKey);
      const order = orders[orderIndex];
      if (order === 255) break;
      if (order === 254 || order >= info.patterns) { orderIndex += 1; startRow = 0; continue; }
      const rows = normalized === 'S3M'
        ? parseS3mPatternRows(buffer, order, 64)
        : parseItPatternRows(buffer, order, 256);
      if (normalized === 'IT') {
        for (const row of rows) {
          for (const event of row) {
            event.effect = normalizeItEffectCommand(event.effect);
            if (event.effect === 0) event.parameter = 0;
          }
        }
      }
      let patternLoopStart = 0;
      let patternLoopRemaining = 0;
      let breakRow: number | undefined;
      let jumpOrder: number | undefined;
      let rowIndex = startRow;
      while (rowIndex < rows.length && result.length < maxRows) {
        const row = rows[rowIndex];
        onPosition?.({ order: orderIndex, pattern: order, row: rowIndex });
        result.push(row);
        let patternLoop: number | undefined;
        for (const event of row ?? []) {
          if (!event) continue;
          const effect = event.effect & 0xff;
          const parameter = event.parameter & 0xff;
          if (effect === 2 && parameter < orders.length) jumpOrder = parameter;
          if (effect === 3) {
            const tens = (parameter >> 4) & 0x0f;
            const ones = parameter & 0x0f;
            if (tens <= 9 && ones <= 9) breakRow = tens * 10 + ones;
          }
          if (effect === 19 && (parameter >> 4) === 0x0b) {
            const loopCount = parameter & 0x0f;
            if (loopCount === 0) patternLoopStart = rowIndex;
            else patternLoop = loopCount;
          }
        }
        if (breakRow !== undefined || jumpOrder !== undefined) break;
        if (patternLoop !== undefined && patternLoop > 0) {
          if (patternLoopRemaining === 0) {
            patternLoopRemaining = patternLoop;
            rowIndex = patternLoopStart;
            continue;
          }
          patternLoopRemaining -= 1;
          if (patternLoopRemaining > 0) {
            rowIndex = patternLoopStart;
            continue;
          }
        }
        rowIndex += 1;
      }
      if (jumpOrder !== undefined) orderIndex = jumpOrder;
      else orderIndex += 1;
      startRow = breakRow ?? 0;
    }
    return result;
  }
  for (const order of orders) {
    if (result.length >= maxRows) break;
    if (order >= info.patterns) continue;
    const remaining = maxRows - result.length;
    result.push(...parseXmPatternRows(buffer, order, Math.min(256, remaining)).slice(0, remaining));
  }
  return result;
}

/** Rebuilds one IT pattern once for a batch of edited cells. */
export function updateItPatternEvents(buffer: ArrayBuffer, patternIndex: number, updates: TrackerPatternEventUpdate[]): ArrayBuffer {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 4) !== 'IMPM' || bytes.length < 192) return buffer;
  const orders = u16le(bytes, 0x20);
  const instruments = u16le(bytes, 0x22);
  const samples = u16le(bytes, 0x24);
  const patterns = u16le(bytes, 0x26);
  if (patternIndex < 0 || patternIndex >= patterns || updates.length === 0) return buffer;
  const pointerOffset = 192 + orders + instruments * 4 + samples * 4 + patternIndex * 4;
  if (pointerOffset + 4 > bytes.length) return buffer;
  const patternOffset = (bytes[pointerOffset] | (bytes[pointerOffset + 1] << 8) | (bytes[pointerOffset + 2] << 16) | (bytes[pointerOffset + 3] << 24)) >>> 0;
  if (patternOffset + 8 > bytes.length) return buffer;
  const packedLength = u16le(bytes, patternOffset);
  const rowsCount = Math.max(1, u16le(bytes, patternOffset + 2));
  if (patternOffset + 8 + packedLength > bytes.length) return buffer;
  const rows = parseItPatternRows(buffer, patternIndex, rowsCount);
  while (rows.length < rowsCount) rows.push([]);
  let changed = false;
  for (const { row, channel, patch } of updates) {
    if (row < 0 || row >= rowsCount || channel < 0 || channel >= 64) continue;
    const current = rows[row]?.[channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
    const volumePresent = typeof patch.volumePresent === 'boolean'
      ? patch.volumePresent
      : (Math.trunc(Number(patch.volume) || 0) > 0 || current.volumePresent === true || current.volume > 0);
    const next = {
      note: Math.max(0, Math.min(255, Math.trunc(Number(patch.note ?? current.note) || 0))),
      instrument: Math.max(0, Math.min(255, Math.trunc(Number(patch.instrument ?? current.instrument) || 0))),
      volume: Math.max(0, Math.min(255, Math.trunc(Number(patch.volume ?? current.volume) || 0))),
      ...(volumePresent && Math.trunc(Number(patch.volume ?? current.volume) || 0) === 0 ? { volumePresent: true } : {}),
      effect: normalizeItEffectCommand(Math.max(0, Math.min(255, Math.trunc(Number(patch.effect ?? current.effect) || 0)))),
      parameter: Math.max(0, Math.min(255, Math.trunc(Number(patch.parameter ?? current.parameter) || 0))),
    };
    if (next.note === current.note && next.instrument === current.instrument && next.volume === current.volume && Boolean(next.volumePresent) === Boolean(current.volumePresent) && next.effect === current.effect && next.parameter === current.parameter) continue;
    if (!rows[row]) rows[row] = [];
    rows[row][channel] = next;
    changed = true;
  }
  if (!changed) return buffer;
  const encoded: number[] = [];
  for (let row = 0; row < rowsCount; row += 1) {
    for (let channel = 0; channel < 64; channel += 1) {
      const event = rows[row]?.[channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const volumePresent = event.volumePresent === true || event.volume > 0;
      if (!(event.note || event.instrument || event.volume || volumePresent || event.effect || event.parameter)) continue;
      const mask = (event.note ? 1 : 0) | (event.instrument ? 2 : 0) | (volumePresent ? 4 : 0) | (event.effect || event.parameter ? 8 : 0);
      encoded.push(0x80 | ((channel + 1) & 0x7f), mask);
      if (mask & 1) encoded.push(event.note);
      if (mask & 2) encoded.push(event.instrument);
      if (mask & 4) encoded.push(event.volume);
      if (mask & 8) encoded.push(event.effect, event.parameter);
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

export function updateItPatternEvent(buffer: ArrayBuffer, patternIndex: number, rowIndex: number, channelIndex: number, patch: Partial<TrackerPatternEvent>): ArrayBuffer {
  return updateItPatternEvents(buffer, patternIndex, [{ row: rowIndex, channel: channelIndex, patch }]);
}

const modChannels = (signature: string): number => {
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

export function parseTrackerModule(buffer: ArrayBuffer, extension: string): TrackerModuleInfo {
  const bytes = new Uint8Array(buffer);
  const ext = extension.toLowerCase();
  const signature = text(bytes, 1080, 4);
  if (signature && modChannels(signature)) {
    const orders = bytes[950] ?? 0;
    const patternCount = Math.max(0, ...(Array.from(bytes.slice(952, 952 + Math.min(orders, 128)))) as number[]) + 1;
    const channels = modChannels(signature);
    const channelPans = Array.from({ length: channels }, (_, channel) => TRACKER_MOD_DEFAULT_CHANNEL_PANS[channel % 4]);
    return { format: 'MOD', title: text(bytes, 0, 20), channels, patterns: patternCount, instruments: 31, orders, speed: 6, tempo: 125, globalVolume: 64, maxmodGlobalVolume: 64, maxmodChannelVolumes: Array.from({ length: channels }, () => 64), channelPans };
  }
  if (ext === 'mod' && bytes.length >= 600 && bytes[470] >= 1 && bytes[470] <= 128) {
    const orders = bytes[470];
    const patternCount = Math.max(0, ...Array.from(bytes.slice(472, 472 + orders))) + 1;
    if (600 + patternCount * 1024 <= bytes.length) {
      return { format: 'MOD', title: text(bytes, 0, 20), channels: 4, patterns: patternCount, instruments: 15, orders, speed: 6, tempo: 125, globalVolume: 64, maxmodGlobalVolume: 64, maxmodChannelVolumes: Array.from({ length: 4 }, () => 64), channelPans: [...TRACKER_MOD_DEFAULT_CHANNEL_PANS] };
    }
  }
  if (text(bytes, 0, 17) === 'Extended Module:') {
    const channels = u16le(bytes, 68);
    return { format: 'XM', title: text(bytes, 17, 20), channels, patterns: u16le(bytes, 70), instruments: u16le(bytes, 72), orders: u16le(bytes, 64), speed: u16le(bytes, 76), tempo: u16le(bytes, 78), globalVolume: 64, maxmodGlobalVolume: 64, maxmodChannelVolumes: Array.from({ length: channels }, () => 64) };
  }
  if (text(bytes, 44, 4) === 'SCRM') {
    const speed = bytes[0x31] || 6;
    const tempo = bytes[0x32] >= 32 ? bytes[0x32] : 125;
    const orders = u16le(bytes, 32);
    const instruments = u16le(bytes, 34);
    const patterns = u16le(bytes, 36);
    const channelPans = parseS3mChannelPans(buffer);
    return { format: 'S3M', title: text(bytes, 0, 28), channels: bytes.slice(64, 96).filter(channel => channel < 0x80).length, patterns, instruments, orders, globalVolume: Math.min(64, bytes[0x30] ?? 64), maxmodGlobalVolume: Math.min(128, (bytes[0x30] ?? 64) * 2), maxmodChannelVolumes: Array.from({ length: 32 }, () => 64), speed, tempo, channelPans };
  }
  if (text(bytes, 0, 4) === 'IMPM') {
    const speed = bytes[0x32] || 6;
    const tempo = bytes[0x33] >= 32 ? bytes[0x33] : 125;
    let channels = 0;
    for (let channel = 0; channel < 64; channel += 1) {
      if ((bytes[0x40 + channel] ?? 0x80) < 0x80) channels = channel + 1;
    }
    return { format: 'IT', title: text(bytes, 4, 26), channels, patterns: u16le(bytes, 0x26), instruments: u16le(bytes, 0x22), sampleCount: u16le(bytes, 0x24), orders: u16le(bytes, 0x20), globalVolume: Math.min(128, bytes[0x30] ?? 128), maxmodGlobalVolume: Math.min(128, bytes[0x30] ?? 128), maxmodChannelVolumes: Array.from({ length: 32 }, (_, channel) => Math.min(64, bytes[0x80 + channel] ?? 64)), speed, tempo };
  }
  return { format: 'unknown', title: '', channels: 0, patterns: 0, instruments: 0, orders: 0 };
}

/** Reads the S3M pan table and falls back to documented defaults for stereo output. */
export function parseS3mChannelPans(buffer: ArrayBuffer): number[] {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 44, 4) !== 'SCRM' || bytes.length < 96) return [];
  const orders = u16le(bytes, 32);
  const instruments = u16le(bytes, 34);
  const patterns = u16le(bytes, 36);
  const tableOffset = 96 + orders + instruments * 2 + patterns * 2;
  const hasTable = bytes[0x35] === 0xfc && tableOffset + 32 <= bytes.length;
  const stereo = ((bytes[0x33] ?? 0) & 0x80) !== 0;
  return Array.from({ length: 32 }, (_, channel) => {
    const setting = bytes[64 + channel] ?? 0xff;
    if (setting >= 0x80) return 0;
    if (hasTable) {
      const pan = bytes[tableOffset + channel] ?? 0;
      if (pan & 0x20) return Math.max(-1, Math.min(1, (((pan & 0x0f) * 16) - 128) / 128));
    }
    const type = setting & 0x7f;
    if (type > 31 || !stereo) return 0;
    const defaultPan = type < 8 ? 3 : 12;
    return ((defaultPan * 16) - 128) / 128;
  });
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
  const compatibleVersion = u16le(bytes, 0x2a);
  const pointerTable = 192 + orders + instruments * 4;
  let compressed = 0;
  let unsupportedConversions = 0;
  for (let index = 0; index < samples; index += 1) {
    const pointer = pointerTable + index * 4;
    if (pointer + 4 > bytes.length) break;
    const header = u32le(bytes, pointer);
    if (header + 0x50 <= bytes.length && text(bytes, header, 4) === 'IMPS') {
      const flags = bytes[header + 0x12] ?? 0;
      const conversion = bytes[header + 0x2e] ?? 1;
      if ((flags & 0x08) !== 0) compressed += 1;
      else if (conversion === 0xff || (conversion & 0x10) !== 0) unsupportedConversions += 1;
    }
  }
  const ignoredByBuildCore = new Set<string>();
  const patterns = u16le(bytes, 0x26);
  for (let pattern = 0; pattern < patterns; pattern += 1) {
    for (const row of parseItPatternRows(buffer, pattern, 256)) {
      for (const event of row) {
        const effect = normalizeItEffectCommand(event.effect);
        const parameter = event.parameter & 0xff;
        // Maxmod's default GBA core has a deliberate no-op for IT Ixy tremor.
        if (effect === 9) ignoredByBuildCore.add('Ixy');
        // Maxmod maps IT Pxy, but the GBA handler is a deliberate TODO/no-op.
        if (effect === 16) ignoredByBuildCore.add('Pxy');
        if (effect === 25) ignoredByBuildCore.add('Yxy');
        if (effect === 26) ignoredByBuildCore.add('Zxx');
        if (effect === 19 && ((parameter >> 4) & 0x0f) === 3) ignoredByBuildCore.add('S3x');
        if (effect === 19 && ((parameter >> 4) & 0x0f) === 4) ignoredByBuildCore.add('S4x');
        if (effect === 19 && ((parameter >> 4) & 0x0f) === 5) ignoredByBuildCore.add('S5x');
        // Maxmod's S9x sound-control handler leaves surround as a TODO.
        if (effect === 19 && ((parameter >> 4) & 0x0f) === 9) ignoredByBuildCore.add('S9x');
        // Maxmod stores/decrements fpattdelay but never uses it to hold a row.
        if (effect === 19 && ((parameter >> 4) & 0x0f) === 6) ignoredByBuildCore.add('S6x');
        // Maxmod's past-note actions S70-S72 are explicit TODOs in InstControl.
        if (effect === 19 && ((parameter >> 4) & 0x0f) === 7 && (parameter & 0x0f) <= 2) ignoredByBuildCore.add('S70-S72');
        if (effect === 19 && ((parameter >> 4) & 0x0f) === 7 && (parameter & 0x0f) >= 0x0a) ignoredByBuildCore.add('S7A-S7F');
        // Maxmod's default GBA core has an explicit SAx case, but its
        // mppex_HighOffset implementation is commented out.
        if (effect === 19 && ((parameter >> 4) & 0x0f) === 0x0a) ignoredByBuildCore.add('SAx');
      }
    }
  }
  const warnings: string[] = [];
  if (instruments > 0 && compatibleVersion < 0x0200) warnings.push('IT 1.xx instrument envelopes are not reproduced in the browser preview.');
  if (compressed) warnings.push(`${compressed} IT sample(s) use compression and remain ROM-only in the browser preview.`);
  if (unsupportedConversions) warnings.push(`${unsupportedConversions} IT sample(s) use ADPCM or TX-Wave encoding and remain source-only in the browser preview.`);
  if (ignoredByBuildCore.size) warnings.push(`The default GBA build core ignores these IT effects: ${[...ignoredByBuildCore].join(', ')}.`);
  return warnings;
}

export interface TrackerPreviewDiagnostics {
  unsupportedEffects: number[];
  decodedSamples: number;
  warnings: string[];
}

/** Butano's checked-in default for active Direct Sound music channels. */
export const DEFAULT_GBA_MUSIC_CHANNEL_LIMIT = 16;

/** Reports where the browser preview intentionally falls back from tracker fidelity. */
export function analyzeTrackerPreview(format: TrackerModuleInfo['format'], rows: TrackerPatternEvent[][], samples: Map<number, TrackerSample>, channelCount?: number): TrackerPreviewDiagnostics {
  // S3M/IT effect 9 is Tremor, a deliberate no-op in Maxmod's GBA core.
  // MOD/XM effect 9 remains sample offset and is handled separately.
  const supported = format === 'XM'
    ? new Set([0, 1, 2, 3, 4, 6, 7, 8, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x19])
    : format === 'MOD'
      ? new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f])
      : new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 13, 0x0f, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x18]);
  if (format === 'S3M') supported.add(12);
  if (format === 'IT') supported.add(14);
  if (format === 'XM') supported.add(0x14);
  if (format === 'IT') supported.add(12);
  if (format === 'S3M' || format === 'IT') supported.add(23);
  const extendedSupported = (effect: number, parameter: number): boolean => {
    const command = (parameter >> 4) & 0x0f;
    if (format === 'XM' && effect === 0x0e) return command === 0x00 || command === 0x01 || command === 0x02 || command === 0x03 || command === 0x04 || command === 0x05 || command === 0x06 || command === 0x07 || command === 0x08 || command === 0x09 || command === 0x0a || command === 0x0b || command === 0x0c || command === 0x0d || command === 0x0e || command === 0x0f;
    // mmutil discards E0x (Amiga filter), E3x (glissando control) and E5x
    // (per-note finetune) for the default GBA Maxmod stream. The browser also
    // leaves these commands inert, so they match the build target.
    if (format === 'MOD' && effect === 0x0e) return command === 0x00 || command === 0x01 || command === 0x02 || command === 0x03 || command === 0x05 || command === 0x09 || command === 0x0c || command === 0x0d;
    if (format !== 'XM' && effect === 0x13) {
      // Maxmod's S3x/S4x waveform setters are no-ops; keep the preview's
      // Hxy/Rxy waveforms on the same sine table as the GBA build core.
      // S73-S76 select Maxmod's CUT/CONTINUE/OFF/FADE actions; S77/S78 toggle
      // the volume envelope, and S79 is a target no-op.
      if (format === 'IT' && command === 0x07) return (parameter & 0x0f) >= 0x03;
      // SFx only triggers Maxmod's song-message callback; it has no audio
      // effect, so ignoring the callback in the browser keeps PCM equivalent.
      return command === 0x08 || command === 0x09 || command === 0x0b || command === 0x0c || command === 0x0d || command === 0x0e || (format === 'IT' && (command === 0x00 || command === 0x01 || command === 0x02 || command === 0x0f));
    }
    return true;
  };
  const effects = new Set<number>();
  const activeInstruments = new Map<number, number>();
  const usedInstruments = new Set<number>();
  const hasPcm = (sample: TrackerSample | undefined): boolean => Boolean(
    sample && (sample.samples.length > 0 || sample.variants?.some(variant => variant.samples.length > 0)),
  );
  rows.forEach(row => row.forEach((event, channel) => {
    if (!event) return;
    const effect = format === 'IT' ? normalizeItEffectCommand(event.effect) : event.effect & 0xff;
    const parameter = event.parameter & 0xff;
    if (event.effect || event.parameter) {
      if (!supported.has(effect) || !extendedSupported(effect, parameter)) effects.add(effect);
    }
    if (event.instrument > 0) activeInstruments.set(channel, event.instrument);
    const keyOff = format === 'XM' ? event.note === 97 : event.note >= 254;
    if (event.note > 0 && !keyOff) {
      const instrument = event.instrument || activeInstruments.get(channel) || 0;
      if (instrument > 0) usedInstruments.add(instrument);
    }
  }));
  const unsupportedEffects = [...effects].sort((a, b) => a - b);
  const warnings: string[] = [];
  if (channelCount !== undefined && channelCount > DEFAULT_GBA_MUSIC_CHANNEL_LIMIT) {
    warnings.push(`This module has ${channelCount} channels; the default GBA build profile supports ${DEFAULT_GBA_MUSIC_CHANNEL_LIMIT} active music channels. Reduce channels or increase the project's music-channel limit.`);
  }
  if (unsupportedEffects.length) warnings.push(`Effects not fully reproduced in browser preview: ${unsupportedEffects.map(effect => effect.toString(16).toUpperCase().padStart(2, '0')).join(', ')}`);
  const missingSamples = [...usedInstruments].filter(instrument => !hasPcm(samples.get(instrument)));
  if (format !== 'MOD' && missingSamples.length > 0 && missingSamples.length === usedInstruments.size) warnings.push('No decoded PCM samples were found; notes use oscillator fallback.');
  else if (format !== 'MOD' && missingSamples.length > 0) warnings.push('Some instrument/sample references have no decoded PCM data and use oscillator fallback.');
  return { unsupportedEffects, decodedSamples: samples.size, warnings };
}
