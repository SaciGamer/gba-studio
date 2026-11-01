import { createTrackerUuid, isTrackerUuid } from './trackerIdentity';
import { decodeTrackerNotePan, encodeTrackerNotePan, isTrackerNotePanEffect, quantizeTrackerNotePan } from './trackerNotePan';
import { createTrackerInstrumentPresetPcm, createTrackerStarterInstrumentBank, TRACKER_INSTRUMENT_PRESETS, TRACKER_FACTORY_SAMPLE_RATE, TrackerInstrumentPresetId } from './trackerInstrumentLibrary';
import { createLegacyTrackerStarterInstrumentBank, createLegacyTrackerInstrumentPresetPcm } from './trackerLegacyInstrumentLibrary';

export type MusicExportTarget = 'MOD' | 'XM' | 'S3M' | 'IT';
export const MAX_MUSIC_COMPOSITION_INSTRUMENTS = 128;

export interface MusicCompositionEnvelope {
  points: Array<{ tick: number; value: number }>;
  sustainStart: number;
  sustainEnd: number;
  loopStart: number;
  loopEnd: number;
  enabled: boolean;
  sustainEnabled: boolean;
  loopEnabled: boolean;
}

export interface MusicCompositionSample {
  id: string;
  name: string;
  sampleRate: number;
  channels: number;
  bitDepth: 8 | 16;
  pcmData: string;
  volume: number;
  panning: number;
  /** Preserve the source Maxmod sample and instrument globals for IT materialization. */
  maxmodSampleGlobalVolume?: number;
  maxmodInstrumentGlobalVolume?: number;
  rootNote: number;
  /** Native meaning of rootNote/fineTune; factory samples use XM relative tuning. */
  tuningFormat?: MusicExportTarget;
  fineTune: number;
  loopStart: number;
  loopEnd: number;
  loopType: 'none' | 'forward' | 'ping-pong';
}

export interface MusicCompositionSourceModule {
  id: string;
  format: MusicExportTarget;
  fileName: string;
  fingerprint: string;
  parserVersion: string;
  moduleData: string;
  warnings: string[];
}

interface ImportedCompositionEnvelope {
  points: Array<{ tick: number; value: number }>;
  sustain?: number;
  sustainStart?: number;
  sustainEnd?: number;
  loopStart: number;
  loopEnd: number;
  enabled: boolean;
  sustainEnabled?: boolean;
  loopEnabled?: boolean;
}

export interface ImportedCompositionData {
  format: MusicExportTarget;
  /** IT frequency-slide mode from the source header; omitted for other formats. */
  itLinearSlides?: boolean;
  title: string;
  tempoBpm: number;
  ticksPerRow: number;
  channels: number;
  channelPans?: number[];
  patterns: Array<{ rows: number; events: Array<{ row: number; channel: number; note: number; instrument: number; instrumentPresent?: boolean; volume: number; volumePresent?: boolean; effect: number; parameter: number }> }>;
  order: number[];
  channelMixer?: { muted?: boolean[]; volumes?: number[]; pans?: number[] };
  existingComposition?: MusicCompositionDocument;
  instruments: Array<{ index: number; name: string; sample?: {
    samples: Float32Array; sampleRate: number; loopStart: number; loopEnd: number; loopType?: number;
    rootNote: number; fineTune?: number; panning?: number; fadeout?: number; name?: string;
    sixteenBit: boolean; volume?: number; maxmodSampleGlobalVolume?: number; maxmodInstrumentGlobalVolume?: number; variants?: Array<{
      samples: Float32Array; sampleRate: number; loopStart: number; loopEnd: number; loopType?: number;
      rootNote: number; fineTune?: number; panning?: number; name?: string; sixteenBit: boolean; volume?: number;
      maxmodSampleGlobalVolume?: number; maxmodInstrumentGlobalVolume?: number;
    }>;
    noteMap?: number[];
    volumeEnvelope?: ImportedCompositionEnvelope;
    panningEnvelope?: ImportedCompositionEnvelope;
  } }>;
  sourceModule: { fileName: string; fingerprint: string; parserVersion: string; moduleData: string; warnings: string[] };
}

export interface MusicCompositionDocument {
  schema: 'gba-studio/music-composition';
  version: 1;
  id: string;
  title: string;
  profile: 'retro' | 'beat' | 'tracker' | 'advanced';
  targetFormat: MusicExportTarget;
  /** Preserve IT's Amiga/linear slide mode when exporting and previewing. */
  itLinearSlides?: boolean;
  tempoBpm: number;
  ticksPerRow: number;
  channels: Array<{ id: string; index: number; name: string; volume: number; pan: number; muted: boolean }>;
  instruments: Array<{
    id: string;
    index: number;
    name: string;
    sampleIds: string[];
    starterCategory?: 'Duty' | 'Wave' | 'Noise';
    starterColor?: string;
    noteMap: Array<{ low: number; high: number; sampleId: string }>;
    volumeEnvelope: MusicCompositionEnvelope;
    panningEnvelope: MusicCompositionEnvelope;
    fadeout: number;
  }>;
  samples: MusicCompositionSample[];
  patterns: Array<{
    id: string;
    index: number;
    name: string;
    rows: number;
    notes: Array<{ id: string; row: number; channelId: string; pitch: number; durationRows: number; endAtPatternBoundary?: boolean; instrumentId: string; volume: number; volumePresent?: boolean; pan: number; panMode?: 'absolute' }>;
    commands: Array<{ id: string; row: number; channelId: string; command: string; parameter: number; gridEffect?: boolean }>;
  }>;
  order: Array<{ id: string; index: number; patternId: string }>;
  sourceModules: MusicCompositionSourceModule[];
}

export interface MusicTargetProjection {
  target: MusicExportTarget;
  maxProjectChannels: number;
  maxTargetChannels: number;
  channelStates: Array<{ channelId: string; index: number; enabled: boolean }>;
  warnings: string[];
}

// These are conservative authoring targets. The game profile may lower the
// runtime ceiling; the source composition always keeps all channels intact.
const targetChannelLimits: Record<MusicExportTarget, number> = { MOD: 4, XM: 32, S3M: 32, IT: 32 };
export const MAX_GBA_TRACKER_CHANNELS = 32;

const emptyEnvelope = (): MusicCompositionEnvelope => ({
  points: [], sustainStart: 0, sustainEnd: 0, loopStart: 0, loopEnd: 0,
  enabled: false, sustainEnabled: false, loopEnabled: false,
});

export function createMusicCompositionDocument(title = 'New Composition', channelCount = 8, targetFormat: MusicExportTarget = 'XM'): MusicCompositionDocument {
  const safeChannelCount = Math.max(1, Math.min(MAX_GBA_TRACKER_CHANNELS, Math.trunc(channelCount)));
  const instrumentId = createTrackerUuid();
  const patternId = createTrackerUuid();
  return {
    schema: 'gba-studio/music-composition',
    version: 1,
    id: createTrackerUuid(),
    title,
    profile: 'tracker',
    targetFormat,
    itLinearSlides: false,
    tempoBpm: 125,
    ticksPerRow: 6,
    channels: Array.from({ length: safeChannelCount }, (_, index) => ({
      id: createTrackerUuid(), index, name: `Channel ${String(index + 1).padStart(2, '0')}`, volume: 1, pan: 0, muted: false,
    })),
    instruments: [{ id: instrumentId, index: 0, name: 'Instrument 01', sampleIds: [], noteMap: [], volumeEnvelope: emptyEnvelope(), panningEnvelope: emptyEnvelope(), fadeout: 0 }],
    samples: [],
    patterns: [{ id: patternId, index: 0, name: 'Pattern 01', rows: 64, notes: [], commands: [] }],
    order: [{ id: createTrackerUuid(), index: 0, patternId }],
    sourceModules: [],
  };
}

export function createMusicCompositionForTarget(targetFormat: MusicExportTarget, title = 'New Beat'): MusicCompositionDocument {
  const profileByFormat: Record<MusicExportTarget, MusicCompositionDocument['profile']> = {
    MOD: 'retro', XM: 'beat', S3M: 'tracker', IT: 'advanced',
  };
  const initialChannels = targetFormat === 'MOD' || targetFormat === 'XM' ? 4 : 8;
  return {
    ...createMusicCompositionDocument(title, initialChannels, targetFormat),
    profile: profileByFormat[targetFormat],
  };
}

/** Creates a new .gbatracker project with the 42 starter instruments from the built-in GBA bank. */
export function createMusicCompositionWithStarterBank(targetFormat: MusicExportTarget, title = 'New Beat'): MusicCompositionDocument {
  const project = createMusicCompositionForTarget(targetFormat, title);
  const bank = createTrackerStarterInstrumentBank();
  const instruments: MusicCompositionDocument['instruments'] = [];
  const samples: MusicCompositionDocument['samples'] = [];
  for (const [index, preset] of bank.entries()) {
    const sampleId = createTrackerUuid();
    const instrumentId = createTrackerUuid();
    instruments.push({
      id: instrumentId, index, name: preset.name, sampleIds: [sampleId], starterCategory: preset.category, starterColor: preset.color,
      noteMap: [{ low: 0, high: 127, sampleId }], volumeEnvelope: emptyEnvelope(), panningEnvelope: emptyEnvelope(), fadeout: 0,
    });
    samples.push({
      id: sampleId, name: preset.name, sampleRate: TRACKER_FACTORY_SAMPLE_RATE, channels: 1, bitDepth: 8,
      pcmData: encodeBase64(preset.pcm), volume: 1, panning: 0, rootNote: 48, tuningFormat: 'XM', fineTune: 0,
      loopStart: preset.loopStart, loopEnd: preset.loopEnd, loopType: preset.loop ? 'forward' : 'none',
    });
  }
  const composition = { ...project, instruments, samples };
  if (!isMusicCompositionDocument(composition)) throw new Error('The starter bank produced an invalid canonical composition.');
  return composition;
}

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(binary);
};

/** Upgrade only byte-identical factory audio; preserve edited PCM, tuning and loops. */
export function repairMusicCompositionStarterLoops(project: MusicCompositionDocument): MusicCompositionDocument {
  const bank = createTrackerStarterInstrumentBank();
  const versions = [createLegacyTrackerStarterInstrumentBank(2048, false), createLegacyTrackerStarterInstrumentBank()];
  const candidates = versions.flatMap(version => version.map((preset,index) => ({
    name: preset.name, pcm: encodeBase64(preset.pcm), loopStart: preset.loopStart, loopEnd: preset.loopEnd,
    loopType: preset.loop ? 'forward' : 'none', next: bank[index],
  })));
  const presets = TRACKER_INSTRUMENT_PRESETS.map(preset => ({
    name: preset.name, pcm: encodeBase64(createLegacyTrackerInstrumentPresetPcm(preset.id)),
    loopStart: preset.loopType === 'none' ? 0 : preset.loopStart ?? 0,
    loopEnd: preset.loopType === 'none' ? 0 : preset.sampleLength ?? 2048, loopType: preset.loopType,
    next: {pcm: createTrackerInstrumentPresetPcm(preset.id), loopStart: preset.loopType === 'none' ? 0 : preset.loopStart ?? 0,
      loopEnd: preset.loopType === 'none' ? 0 : preset.sampleLength ?? 2048, loop: preset.loopType !== 'none'},
  }));
  let changed = false;
  const samples = project.samples.map(sample => {
    if (sample.bitDepth !== 8 || sample.channels !== 1 || sample.sampleRate !== 8363 || sample.rootNote !== 48 || sample.fineTune !== 0) return sample;
    const match = [...candidates, ...presets].find(preset => preset.name === sample.name && preset.pcm === sample.pcmData
      && preset.loopStart === sample.loopStart && preset.loopEnd === sample.loopEnd && preset.loopType === sample.loopType);
    if (!match) return sample;
    changed = true;
    return {...sample, pcmData: encodeBase64(match.next.pcm), sampleRate: TRACKER_FACTORY_SAMPLE_RATE, tuningFormat: 'XM' as const,
      loopStart: match.next.loopStart, loopEnd: match.next.loopEnd, loopType: match.next.loop ? 'forward' as const : 'none' as const};
  });
  return changed ? {...project,samples} : project;
}

/** Adds a private, editable copy of a bundled procedural instrument preset to a canonical project. */
export function addMusicCompositionInstrumentPreset(project: MusicCompositionDocument, presetId: TrackerInstrumentPresetId): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot add an instrument to an invalid music composition.');
  const preset = TRACKER_INSTRUMENT_PRESETS.find(item => item.id === presetId);
  if (!preset) throw new Error(`Unknown tracker instrument preset: ${String(presetId)}`);
  const index = Math.max(-1, ...project.instruments.map(instrument => instrument.index)) + 1;
  const sampleId = createTrackerUuid();
  const instrument = {
    id: createTrackerUuid(), index, name: preset.name, sampleIds: [sampleId],
    starterCategory: preset.starterCategory,
    noteMap: [{ low: 0, high: 127, sampleId }],
    volumeEnvelope: emptyEnvelope(), panningEnvelope: emptyEnvelope(), fadeout: 0,
  };
  const loopType = preset.loopType === 'none' ? 'none' as const : 'forward' as const;
  const pcm = createTrackerInstrumentPresetPcm(presetId);
  const sample: MusicCompositionSample = {
    id: sampleId, name: preset.name, sampleRate: TRACKER_FACTORY_SAMPLE_RATE, channels: 1, bitDepth: 8,
    pcmData: encodeBase64(pcm), volume: preset.volume, panning: 0,
    rootNote: 48, tuningFormat: 'XM', fineTune: 0, loopStart: loopType === 'none' ? 0 : preset.loopStart ?? 0, loopEnd: loopType === 'none' ? 0 : pcm.length, loopType,
  };
  const next = { ...project, instruments: [...project.instruments, instrument], samples: [...project.samples, sample] };
  if (!isMusicCompositionDocument(next)) throw new Error('The instrument preset produced an invalid canonical composition.');
  return next;
}

/** Renames one project-owned instrument without changing its UUID or bundled preset source. */
export function setMusicCompositionInstrumentName(project: MusicCompositionDocument, instrumentIndex: number, name: string): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot edit instruments in an invalid music composition.');
  if (!Number.isInteger(instrumentIndex) || typeof name !== 'string') return project;
  const instrument = project.instruments.find(item => item.index === instrumentIndex);
  if (!instrument) return project;
  const normalizedName = name.trim().slice(0, 64);
  if (!normalizedName || normalizedName === instrument.name) return project;
  return {
    ...project,
    instruments: project.instruments.map(item => item.index === instrumentIndex ? { ...item, name: normalizedName } : item),
  };
}

/** Updates canonical instrument envelopes without changing instrument/sample identities. */
export function setMusicCompositionInstrumentEnvelope(
  project: MusicCompositionDocument,
  instrumentIndex: number,
  envelopeType: 'volume' | 'panning',
  patch: Partial<MusicCompositionEnvelope>,
  fadeout?: number,
): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot edit envelopes in an invalid music composition.');
  const instrument = project.instruments.find(item => item.index === instrumentIndex);
  if (!instrument) return project;
  const key = envelopeType === 'volume' ? 'volumeEnvelope' : 'panningEnvelope';
  const nextEnvelope = { ...instrument[key], ...patch, points: (patch.points ?? instrument[key].points).map(point => ({ ...point })) };
  if (!isValidEnvelope(nextEnvelope)) return project;
  const nextFadeout = fadeout === undefined ? instrument.fadeout : Math.max(0, Math.min(65535, Math.round(fadeout)));
  if (JSON.stringify(nextEnvelope) === JSON.stringify(instrument[key]) && nextFadeout === instrument.fadeout) return project;
  const next = { ...project, instruments: project.instruments.map(item => item.index === instrumentIndex ? { ...item, [key]: nextEnvelope, fadeout: nextFadeout } : item) };
  return isMusicCompositionDocument(next) ? next : project;
}

/** Replaces one instrument's sample-to-key zones while preserving UUID ownership. */
export function setMusicCompositionInstrumentZones(
  project: MusicCompositionDocument,
  instrumentIndex: number,
  zones: MusicCompositionDocument['instruments'][number]['noteMap'],
): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot edit zones in an invalid music composition.');
  const instrument = project.instruments.find(item => item.index === instrumentIndex);
  if (!instrument || !Array.isArray(zones)) return project;
  const sorted = zones.map(zone => ({ ...zone })).sort((left, right) => left.low - right.low || left.high - right.high);
  let priorHigh = -1;
  for (const zone of sorted) {
    if (!Number.isInteger(zone.low) || !Number.isInteger(zone.high) || zone.low < 0 || zone.high > 127 || zone.high < zone.low
      || !instrument.sampleIds.includes(zone.sampleId) || zone.low <= priorHigh) return project;
    priorHigh = zone.high;
  }
  if (JSON.stringify(sorted) === JSON.stringify(instrument.noteMap)) return project;
  const next = { ...project, instruments: project.instruments.map(item => item.index === instrumentIndex ? { ...item, noteMap: sorted } : item) };
  return isMusicCompositionDocument(next) ? next : project;
}

/** Adds a private sample and gives its key range precedence while preserving uncovered parts of existing zones. */
export function addMusicCompositionSampleToInstrument(
  project: MusicCompositionDocument,
  instrumentIndex: number,
  sample: Omit<MusicCompositionSample, 'id'>,
  zone: { low: number; high: number },
): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot add samples to an invalid music composition.');
  const instrument = project.instruments.find(item => item.index === instrumentIndex);
  if (!instrument || instrument.sampleIds.length >= 255 || !Number.isInteger(zone.low) || !Number.isInteger(zone.high)
    || zone.low < 0 || zone.high > 127 || zone.high < zone.low) return project;
  const sampleId = createTrackerUuid();
  const newSample: MusicCompositionSample = { ...sample, id: sampleId };
  const preservedZones = instrument.noteMap.flatMap(item => {
    if (zone.low > item.high || zone.high < item.low) return [item];
    return [
      ...(item.low < zone.low ? [{ ...item, high: zone.low - 1 }] : []),
      ...(item.high > zone.high ? [{ ...item, low: zone.high + 1 }] : []),
    ];
  });
  const next = {
    ...project,
    samples: [...project.samples, newSample],
    instruments: project.instruments.map(item => item.index === instrumentIndex ? {
      ...item,
      sampleIds: [...item.sampleIds, sampleId],
      noteMap: [...preservedZones, { ...zone, sampleId }].sort((left, right) => left.low - right.low),
    } : item),
  };
  return isMusicCompositionDocument(next) ? next : project;
}

/** Duplicates an instrument and its samples into private UUID-owned copies. */
export function duplicateMusicCompositionInstrument(project: MusicCompositionDocument, instrumentIndex: number, copySuffix = 'Copy'): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot duplicate instruments in an invalid music composition.');
  if (!Number.isInteger(instrumentIndex) || project.instruments.length >= MAX_MUSIC_COMPOSITION_INSTRUMENTS) return project;
  const source = project.instruments.find(item => item.index === instrumentIndex);
  if (!source) return project;
  const sampleIds = new Map(source.sampleIds.map(id => [id, createTrackerUuid()]));
  const clonedSamples = project.samples.filter(sample => sampleIds.has(sample.id)).map(sample => ({ ...sample, id: sampleIds.get(sample.id)! }));
  const nextIndex = Math.max(-1, ...project.instruments.map(item => item.index)) + 1;
  const suffix = copySuffix.trim().slice(0, 24) || 'Copy';
  const clone = {
    ...source,
    id: createTrackerUuid(),
    index: nextIndex,
    name: `${source.name} ${suffix}`.slice(0, 64),
    sampleIds: source.sampleIds.map(id => sampleIds.get(id)!),
    noteMap: source.noteMap.map(zone => ({ ...zone, sampleId: sampleIds.get(zone.sampleId)! })),
  };
  const next = { ...project, instruments: [...project.instruments, clone], samples: [...project.samples, ...clonedSamples] };
  if (!isMusicCompositionDocument(next)) throw new Error('The duplicated instrument produced an invalid canonical composition.');
  return next;
}

/** Removes an instrument, its notes and samples that are no longer referenced. */
export function deleteMusicCompositionInstrument(project: MusicCompositionDocument, instrumentIndex: number): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot delete an instrument from an invalid music composition.');
  const instrument = project.instruments.find(item => item.index === instrumentIndex);
  if (!instrument || project.instruments.length <= 1) return project;
  const instruments = project.instruments.filter(item => item.id !== instrument.id)
    .map(item => ({ ...item, index: item.index > instrumentIndex ? item.index - 1 : item.index }));
  const sampleIds = new Set(instruments.flatMap(item => item.sampleIds));
  const next = {
    ...project, instruments,
    samples: project.samples.filter(sample => sampleIds.has(sample.id)),
    patterns: project.patterns.map(pattern => ({ ...pattern, notes: pattern.notes.filter(note => note.instrumentId !== instrument.id) })),
  };
  if (!isMusicCompositionDocument(next)) throw new Error('Deleting the instrument produced an invalid canonical composition.');
  return next;
}

const normalizeEnvelope = (source?: ImportedCompositionEnvelope): MusicCompositionEnvelope => {
  if (!source) return emptyEnvelope();
  const points = source.points.map(point => ({ tick: Math.max(0, Math.trunc(point.tick)), value: Math.max(0, Math.min(1, point.value / 64)) }));
  const pointIndex = (value: number) => Math.max(0, Math.min(points.length, Math.trunc(value)));
  return {
    points,
    sustainStart: pointIndex(source.sustainStart ?? source.sustain ?? 0),
    sustainEnd: pointIndex(source.sustainEnd ?? source.sustain ?? 0),
    loopStart: pointIndex(source.loopStart), loopEnd: pointIndex(source.loopEnd),
    enabled: source.enabled, sustainEnabled: source.sustainEnabled ?? false, loopEnabled: source.loopEnabled ?? false,
  };
};

/** Converts the parser's shared rows/sample data into editable UUID based source while retaining the exact original module. */
export function createMusicCompositionFromImportedModule(input: ImportedCompositionData): MusicCompositionDocument {
  if (!['MOD', 'XM', 'S3M', 'IT'].includes(input.format)) throw new Error(`Unsupported imported tracker format: ${String(input.format)}`);
  if (!input.sourceModule?.moduleData || !input.sourceModule.fileName || !input.sourceModule.fingerprint || !input.sourceModule.parserVersion) throw new Error('Imported tracker source metadata is incomplete.');
  const previous = input.existingComposition && isMusicCompositionDocument(input.existingComposition) ? input.existingComposition : undefined;
  const sourceChannelCount = Math.max(1, Math.min(MAX_GBA_TRACKER_CHANNELS, Math.trunc(input.channels)));
  const channelCount = Math.max(sourceChannelCount, Math.min(MAX_GBA_TRACKER_CHANNELS, previous?.channels.length ?? 0));
  const channelIds = Array.from({ length: channelCount }, (_, index) => previous?.channels[index]?.id ?? createTrackerUuid());
  const referencedInstrumentIndexes = new Set(input.patterns.flatMap(pattern => pattern.events.map(event => event.instrument).filter(index => Number.isInteger(index) && index >= 1)));
  const instrumentRows = input.instruments.filter(instrument => Number.isInteger(instrument.index) && instrument.index >= 1
    && (input.format !== 'MOD' || !previous || instrument.index <= previous.instruments.length
      || (instrument.sample?.samples.length ?? 0) > 0 || referencedInstrumentIndexes.has(instrument.index)));
  const instrumentIds = new Map<number, string>();
  const sampleRows: MusicCompositionSample[] = [];
  const canonicalInstruments: MusicCompositionDocument['instruments'] = [];
  const crossFormatProjection = Boolean(previous?.sourceModules.length && previous.sourceModules[0].format !== input.format);
  const warnings = [...input.sourceModule.warnings];
  if (input.channels > MAX_GBA_TRACKER_CHANNELS) warnings.push(`The normalized editor model is limited to ${MAX_GBA_TRACKER_CHANNELS} channels; the immutable source module retains all ${input.channels} channels.`);
  const toPcm16 = (samples: Float32Array) => {
    const bytes = new Uint8Array(samples.length * 2);
    const view = new DataView(bytes.buffer);
    for (let index = 0; index < samples.length; index += 1) {
      const value = Number.isFinite(samples[index]) ? Math.max(-1, Math.min(1, samples[index])) : 0;
      view.setInt16(index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    }
    return encodeBase64(bytes);
  };
  for (const imported of instrumentRows) {
    const id = previous?.instruments.find(instrument => instrument.index === canonicalInstruments.length)?.id ?? createTrackerUuid();
    instrumentIds.set(imported.index, id);
    const sourceVariants = (imported.sample?.variants?.length ? imported.sample.variants : imported.sample ? [imported.sample] : [])
      .map((sample, sourceVariantIndex) => ({ sample, sourceVariantIndex }))
      .filter(item => item.sample.samples.length > 0);
    const sampleIds: string[] = [];
    const noteMap: MusicCompositionDocument['instruments'][number]['noteMap'] = [];
    const previousInstrument = previous?.instruments.find(instrument => instrument.index === canonicalInstruments.length);
    const variantIds = sourceVariants.map((item, variantIndex) => previousInstrument?.sampleIds[item.sourceVariantIndex] ?? createTrackerUuid());
    for (const [variantIndex, { sample, sourceVariantIndex }] of sourceVariants.entries()) {
      sampleIds.push(variantIds[variantIndex]);
      const importedSample: MusicCompositionSample = {
        id: variantIds[variantIndex], name: sample.name || imported.name || `Sample ${imported.index}.${variantIndex + 1}`,
        sampleRate: Math.max(1, Math.round(sample.sampleRate)), channels: 1, bitDepth: 16,
        pcmData: toPcm16(sample.samples), volume: Math.max(0, Math.min(1, (sample.volume ?? 64) / 64)),
        panning: Math.max(-1, Math.min(1, ((sample.panning ?? 128) - 128) / 128)),
        ...(Number.isFinite(sample.maxmodSampleGlobalVolume) ? { maxmodSampleGlobalVolume: Math.max(0, Math.min(64, Math.trunc(sample.maxmodSampleGlobalVolume!))) } : {}),
        ...(Number.isFinite(sample.maxmodInstrumentGlobalVolume) ? { maxmodInstrumentGlobalVolume: Math.max(0, Math.min(128, Math.trunc(sample.maxmodInstrumentGlobalVolume!))) } : {}),
        rootNote: Math.max(0, Math.min(127, Math.round(sample.rootNote))), fineTune: Math.max(-128, Math.min(127, Math.trunc(sample.fineTune ?? 0))),
        loopStart: Math.max(0, Math.min(sample.samples.length, Math.trunc(sample.loopStart))),
        loopEnd: Math.max(0, Math.min(sample.samples.length, Math.trunc(sample.loopEnd))),
        loopType: sample.loopType === 1 ? 'forward' : sample.loopType === 2 ? 'ping-pong' : 'none',
      };
      const previousSample = previous?.samples.find(item => item.id === variantIds[variantIndex]);
      sampleRows.push(crossFormatProjection && previousSample ? previousSample : importedSample);
      const ranges: Array<{ low: number; high: number; sampleId: string }> = [];
      for (let note = 0; note < 96; note += 1) {
        if ((imported.sample?.noteMap?.[note] ?? 0) !== sourceVariantIndex) continue;
        const previous = ranges.at(-1);
        if (previous && previous.high === note - 1) previous.high = note;
        else ranges.push({ low: note, high: note, sampleId: variantIds[variantIndex] });
      }
      if (!ranges.length && variantIndex === 0 && !imported.sample?.noteMap) ranges.push({ low: 0, high: 127, sampleId: variantIds[variantIndex] });
      noteMap.push(...ranges);
    }
    canonicalInstruments.push({
      id, index: canonicalInstruments.length,
      name: crossFormatProjection && previousInstrument ? previousInstrument.name : imported.name || `Instrument ${imported.index}`,
      sampleIds: [...new Set([...sampleIds, ...(crossFormatProjection ? previousInstrument?.sampleIds ?? [] : [])])],
      noteMap: crossFormatProjection && previousInstrument ? previousInstrument.noteMap : noteMap,
      volumeEnvelope: crossFormatProjection && previousInstrument ? previousInstrument.volumeEnvelope : normalizeEnvelope(imported.sample?.volumeEnvelope),
      panningEnvelope: crossFormatProjection && previousInstrument ? previousInstrument.panningEnvelope : normalizeEnvelope(imported.sample?.panningEnvelope),
      fadeout: crossFormatProjection && previousInstrument ? previousInstrument.fadeout : Math.max(0, imported.sample?.fadeout ?? 0),
    });
  }
  if (crossFormatProjection && previous) {
    const existingInstrumentIds = new Set(canonicalInstruments.map(instrument => instrument.id));
    canonicalInstruments.push(...previous.instruments.filter(instrument => !existingInstrumentIds.has(instrument.id)));
    const existingSampleIds = new Set(sampleRows.map(sample => sample.id));
    sampleRows.push(...previous.samples.filter(sample => !existingSampleIds.has(sample.id)));
  }
  const fallbackInstrumentId = canonicalInstruments[0]?.id ?? createTrackerUuid();
  if (!canonicalInstruments.length) canonicalInstruments.push({ id: fallbackInstrumentId, index: 0, name: 'Instrument 01', sampleIds: [], noteMap: [], volumeEnvelope: emptyEnvelope(), panningEnvelope: emptyEnvelope(), fadeout: 0 });
  const patterns = input.patterns.slice(0, 256).map((pattern, index) => {
    const rows = Math.max(1, Math.min(256, Math.trunc(pattern.rows)));
    const notes: MusicCompositionDocument['patterns'][number]['notes'] = [];
    const commands: MusicCompositionDocument['patterns'][number]['commands'] = [];
    const previousPattern = previous?.patterns.find(item => item.index === index);
    const previousNoteByCell = new Map(previousPattern?.notes.map(note => [`${note.row}:${note.channelId}`, note]) ?? []);
    for (const event of pattern.events) {
      if (!Number.isInteger(event.row) || event.row < 0 || event.row >= rows || event.channel < 0 || event.channel >= sourceChannelCount) continue;
      if (event.note >= 1 && event.note <= 96) {
        const channelId = channelIds[event.channel];
        const previousNote = previousNoteByCell.get(`${event.row}:${channelId}`);
        const decodedPan = decodeTrackerNotePan(input.format, event.effect, event.parameter);
        const previousChannelPan = previous?.channels.find(channel => channel.id === channelId)?.pan ?? 0;
        const previousPan = previousNote?.panMode === 'absolute' ? previousNote.pan : previousNote ? previousNote.pan + previousChannelPan : 0;
        const previousPanEffect = previousNote ? encodeTrackerNotePan(input.format, previousPan) : undefined;
        const previousPanProjection = previousPanEffect
          ? decodeTrackerNotePan(input.format, previousPanEffect.effect, previousPanEffect.parameter)
          : undefined;
        const nextBoundary = pattern.events
          .filter(next => next.channel === event.channel && next.row > event.row
            && (next.note >= 97 || (next.note >= 1 && next.note <= 96))
            && (input.format !== 'IT' || next.note >= 97 || next.instrument > 0))
          .reduce((nearest, next) => Math.min(nearest, next.row), rows);
        if (input.format !== 'IT' || event.instrument > 0) notes.push({
          id: createTrackerUuid(), row: event.row, channelId, pitch: event.note,
          durationRows: Math.max(1, nextBoundary - event.row), instrumentId: instrumentIds.get(event.instrument) ?? fallbackInstrumentId,
          ...(previousNote?.endAtPatternBoundary ? { endAtPatternBoundary: true } : {}),
          volume: input.format === 'XM'
            ? event.volume >= 0x10 && event.volume <= 0x50 ? (event.volume - 0x10) / 0x40 : 1
            : Math.max(0, Math.min(1, event.volumePresent ? event.volume / 64 : 1)),
          ...(input.format === 'S3M' || input.format === 'XM' ? {
            volumePresent: input.format === 'XM'
              ? event.volume >= 0x10 && event.volume <= 0x50
              : event.volumePresent === true,
          } : {}),
          pan: previousNote && previousPanProjection === decodedPan ? previousNote.pan : decodedPan,
          ...((previousNote ? previousNote.panMode : isTrackerNotePanEffect(input.format, event.effect, event.parameter) ? 'absolute' : undefined)
            ? { panMode: 'absolute' as const } : {}),
        });
      }
      if (event.volumePresent && !(event.note >= 1 && event.note <= 96)
        || input.format === 'XM' && event.volumePresent && event.note >= 1 && event.note <= 96 && !(event.volume >= 0x10 && event.volume <= 0x50)) {
        const xmVolumeEffect = input.format === 'XM' && !(event.volume >= 0x10 && event.volume <= 0x50);
        commands.push({
          id: createTrackerUuid(), row: event.row, channelId: channelIds[event.channel],
          command: xmVolumeEffect ? 'XM:volume-column' : `${input.format}:volume`,
          parameter: Math.max(0, Math.min(65535, Math.trunc(event.volume))),
        });
      }
      const specialNoteCommand = event.note === 97 ? `${input.format}:note-off`
        : event.note === 98 ? `${input.format}:note-cut`
          : event.note === 99 ? `${input.format}:note-fade` : null;
      if (specialNoteCommand) commands.push({
        id: createTrackerUuid(), row: event.row, channelId: channelIds[event.channel], command: specialNoteCommand, parameter: 0,
      });
      if (event.effect || event.parameter) commands.push({
        id: createTrackerUuid(), row: event.row, channelId: channelIds[event.channel],
        command: `${input.format}:effect-${Math.max(0, Math.trunc(event.effect)).toString(16)}`,
        parameter: Math.max(0, Math.min(65535, Math.trunc(event.parameter))),
      });
    }
    const isInactiveChannel = (channelId: string) => (previous?.channels.find(channel => channel.id === channelId)?.index ?? -1) >= sourceChannelCount;
    const previousNotes = new Map(previousPattern?.notes.map(note => [`${note.row}:${note.channelId}`, note.id]) ?? []);
    const previousCommands = new Map(previousPattern?.commands.map(command => [`${command.row}:${command.channelId}:${command.command}`, command.id]) ?? []);
    const gridCommands = new Set(previousPattern?.commands.filter(command => command.gridEffect).map(command => `${command.row}:${command.channelId}:${command.command}`) ?? []);
    const preservedNotes = previousPattern?.notes.filter(note => isInactiveChannel(note.channelId)) ?? [];
    const preservedCommands = previousPattern?.commands.filter(command => command.row < rows
      && (isInactiveChannel(command.channelId) || !command.command.startsWith(`${input.format}:`))) ?? [];
    const stableNotes = [...notes.map(note => ({ ...note, id: previousNotes.get(`${note.row}:${note.channelId}`) ?? note.id })), ...preservedNotes];
    const stableCommands = [...commands.map(command => ({ ...command, id: previousCommands.get(`${command.row}:${command.channelId}:${command.command}`) ?? command.id,
      ...(gridCommands.has(`${command.row}:${command.channelId}:${command.command}`) ? { gridEffect: true } : {}) })), ...preservedCommands];
    return { id: previousPattern?.id ?? createTrackerUuid(), index, name: previousPattern?.name ?? `Pattern ${String(index + 1).padStart(2, '0')}`, rows, notes: stableNotes, commands: stableCommands };
  });
  if (!patterns.length) patterns.push({ id: createTrackerUuid(), index: 0, name: 'Pattern 01', rows: 64, notes: [], commands: [] });
  const order = input.order.flatMap((patternIndex, index) => {
    const pattern = patterns[patternIndex];
    return pattern ? [{ id: previous?.order.find(entry => entry.index === index)?.id ?? createTrackerUuid(), index, patternId: pattern.id }] : [];
  });
  if (!order.length) order.push({ id: previous?.order[0]?.id ?? createTrackerUuid(), index: 0, patternId: patterns[0].id });
  const document: MusicCompositionDocument = {
    schema: 'gba-studio/music-composition', version: 1, id: previous?.id ?? createTrackerUuid(),
    title: input.title || 'Imported Music', profile: input.format === 'MOD' ? 'retro' : input.format === 'XM' ? 'beat' : input.format === 'S3M' ? 'tracker' : 'advanced',
    targetFormat: input.format,
    itLinearSlides: input.format === 'IT' ? input.itLinearSlides === true : previous?.itLinearSlides ?? false,
    tempoBpm: Math.max(1, Math.min(999, input.tempoBpm || 125)), ticksPerRow: Math.max(1, Math.min(255, input.ticksPerRow || 6)),
    channels: channelIds.map((id, index) => {
      const previousChannel = previous?.channels[index];
      const activeInSource = index < sourceChannelCount;
      return { id, index, name: previousChannel?.name ?? `Channel ${String(index + 1).padStart(2, '0')}`,
        volume: Math.max(0, Math.min(1, input.channelMixer?.volumes?.[index] ?? (activeInSource ? 1 : previousChannel?.volume ?? 1))),
        pan: Math.max(-1, Math.min(1, input.channelMixer?.pans?.[index] ?? input.channelPans?.[index] ?? (activeInSource ? 0 : previousChannel?.pan ?? 0))),
        muted: input.channelMixer?.muted?.[index] ?? (activeInSource ? false : previousChannel?.muted ?? false) };
    }),
    instruments: canonicalInstruments, samples: sampleRows, patterns, order,
    sourceModules: crossFormatProjection && previous
      ? previous.sourceModules
      : [{ id: previous?.sourceModules[0]?.id ?? createTrackerUuid(), format: input.format, ...input.sourceModule, warnings }],
  };
  if (!isMusicCompositionDocument(document)) throw new Error('The imported module could not be represented by the canonical composition model.');
  return document;
}

export function isMusicCompositionDocument(value: unknown): value is MusicCompositionDocument {
  if (!value || typeof value !== 'object') return false;
  const project = value as Partial<MusicCompositionDocument>;
  if (project.schema !== 'gba-studio/music-composition' || project.version !== 1
    || typeof project.title !== 'string' || !['retro', 'beat', 'tracker', 'advanced'].includes(project.profile ?? '')
    || !['MOD', 'XM', 'S3M', 'IT'].includes(project.targetFormat ?? '')
    || (project.itLinearSlides !== undefined && typeof project.itLinearSlides !== 'boolean')
    || typeof project.tempoBpm !== 'number' || !Number.isFinite(project.tempoBpm) || project.tempoBpm < 1 || project.tempoBpm > 999
    || typeof project.ticksPerRow !== 'number' || !Number.isInteger(project.ticksPerRow) || project.ticksPerRow < 1 || project.ticksPerRow > 255
    || !Array.isArray(project.channels) || !Array.isArray(project.instruments) || !Array.isArray(project.samples)
    || !Array.isArray(project.patterns) || !Array.isArray(project.order) || !Array.isArray(project.sourceModules)) return false;
  if (project.channels.length < 1 || project.channels.length > MAX_GBA_TRACKER_CHANNELS) return false;
  if (!project.channels.every(item => Boolean(item && typeof item === 'object'))
    || !project.instruments.every(item => Boolean(item && typeof item === 'object'))
    || !project.samples.every(item => Boolean(item && typeof item === 'object'))
    || !project.patterns.every(item => Boolean(item && typeof item === 'object' && Array.isArray(item.notes) && Array.isArray(item.commands)))
    || !project.order.every(item => Boolean(item && typeof item === 'object'))) return false;
  const ids: unknown[] = [project.id,
    ...project.channels.map(item => item?.id),
    ...project.instruments.map(item => item?.id),
    ...project.samples.map(item => item?.id),
    ...project.sourceModules.map(item => item?.id),
    ...project.patterns.flatMap(item => [item?.id, ...(item?.notes ?? []).map(note => note?.id), ...(item?.commands ?? []).map(command => command?.id)]),
    ...project.order.map(item => item?.id),
  ];
  if (!ids.every(isTrackerUuid) || new Set(ids).size !== ids.length) return false;
  const channelIds = new Set(project.channels.map(channel => channel.id));
  const instrumentIds = new Set(project.instruments.map(instrument => instrument.id));
  const sampleIds = new Set(project.samples.map(sample => sample.id));
  const patternIds = new Set(project.patterns.map(pattern => pattern.id));
  if (new Set(project.channels.map(channel => channel.index)).size !== project.channels.length
    || new Set(project.patterns.map(pattern => pattern.index)).size !== project.patterns.length
    || new Set(project.instruments.map(instrument => instrument.index)).size !== project.instruments.length) return false;
  if (!project.channels.every(channel => Number.isInteger(channel.index) && channel.index >= 0
    && typeof channel.name === 'string' && Number.isFinite(channel.volume) && channel.volume >= 0 && channel.volume <= 1
    && Number.isFinite(channel.pan) && channel.pan >= -1 && channel.pan <= 1 && typeof channel.muted === 'boolean')) return false;
  if (!project.instruments.every(instrument => Number.isInteger(instrument.index) && instrument.index >= 0
    && typeof instrument.name === 'string' && Array.isArray(instrument.sampleIds)
    && instrument.sampleIds.every(id => sampleIds.has(id))
    && Array.isArray(instrument.noteMap) && instrument.noteMap.every(zone => Number.isInteger(zone.low) && zone.low >= 0 && zone.low <= 127
      && Number.isInteger(zone.high) && zone.high >= zone.low && zone.high <= 127 && sampleIds.has(zone.sampleId))
    && isValidEnvelope(instrument.volumeEnvelope) && isValidEnvelope(instrument.panningEnvelope)
    && Number.isFinite(instrument.fadeout) && instrument.fadeout >= 0)) return false;
  if (!project.samples.every(sample => typeof sample.name === 'string' && Number.isFinite(sample.sampleRate) && sample.sampleRate > 0
    && Number.isInteger(sample.channels) && sample.channels >= 1 && (sample.bitDepth === 8 || sample.bitDepth === 16)
    && typeof sample.pcmData === 'string' && Number.isFinite(sample.volume) && sample.volume >= 0 && sample.volume <= 1
    && (sample.maxmodSampleGlobalVolume === undefined || Number.isInteger(sample.maxmodSampleGlobalVolume) && sample.maxmodSampleGlobalVolume >= 0 && sample.maxmodSampleGlobalVolume <= 64)
    && (sample.maxmodInstrumentGlobalVolume === undefined || Number.isInteger(sample.maxmodInstrumentGlobalVolume) && sample.maxmodInstrumentGlobalVolume >= 0 && sample.maxmodInstrumentGlobalVolume <= 128)
    && Number.isFinite(sample.panning) && sample.panning >= -1 && sample.panning <= 1
    && Number.isInteger(sample.rootNote) && sample.rootNote >= 0 && sample.rootNote <= 127
    && Number.isInteger(sample.fineTune) && sample.fineTune >= -128 && sample.fineTune <= 127
    && Number.isInteger(sample.loopStart) && sample.loopStart >= 0 && Number.isInteger(sample.loopEnd) && sample.loopEnd >= sample.loopStart
    && ['none', 'forward', 'ping-pong'].includes(sample.loopType))) return false;
  if (!project.patterns.every(pattern => Number.isInteger(pattern.index) && pattern.index >= 0
    && typeof pattern.name === 'string' && Number.isInteger(pattern.rows) && pattern.rows >= 1
    && Array.isArray(pattern.notes) && pattern.notes.every(note => Number.isInteger(note.row) && note.row >= 0 && note.row < pattern.rows
      && channelIds.has(note.channelId) && Number.isInteger(note.pitch) && note.pitch >= 0 && note.pitch <= 127
      && Number.isInteger(note.durationRows) && note.durationRows >= 1 && instrumentIds.has(note.instrumentId)
      && (note.endAtPatternBoundary === undefined || typeof note.endAtPatternBoundary === 'boolean')
      && Number.isFinite(note.volume) && note.volume >= 0 && note.volume <= 1
      && Number.isFinite(note.pan) && note.pan >= -1 && note.pan <= 1 && (note.panMode === undefined || note.panMode === 'absolute'))
    && Array.isArray(pattern.commands) && pattern.commands.every(command => Number.isInteger(command.row) && command.row >= 0 && command.row < pattern.rows
      && (command.gridEffect === undefined || typeof command.gridEffect === 'boolean')
      && channelIds.has(command.channelId) && typeof command.command === 'string' && Number.isInteger(command.parameter) && command.parameter >= 0 && command.parameter <= 65535))) return false;
  if (!project.sourceModules.every(source => ['MOD', 'XM', 'S3M', 'IT'].includes(source.format)
    && typeof source.fileName === 'string' && typeof source.fingerprint === 'string' && typeof source.parserVersion === 'string'
    && typeof source.moduleData === 'string' && Array.isArray(source.warnings) && source.warnings.every(warning => typeof warning === 'string'))) return false;
  return project.order.every(item => Number.isInteger(item.index) && item.index >= 0 && patternIds.has(item.patternId));
}

function isValidEnvelope(value: unknown): value is MusicCompositionEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as Partial<MusicCompositionEnvelope>;
  return Array.isArray(envelope.points) && envelope.points.every(point => Number.isFinite(point.tick) && point.tick >= 0
    && Number.isFinite(point.value) && point.value >= 0 && point.value <= 1)
    && [envelope.sustainStart, envelope.sustainEnd, envelope.loopStart, envelope.loopEnd].every(value => Number.isInteger(value) && value! >= 0)
    && typeof envelope.enabled === 'boolean' && typeof envelope.sustainEnabled === 'boolean' && typeof envelope.loopEnabled === 'boolean'
    && envelope.sustainStart! <= envelope.sustainEnd! && envelope.loopStart! <= envelope.loopEnd!
    && envelope.sustainEnd! <= envelope.points.length && envelope.loopEnd! <= envelope.points.length;
}

export function getMusicTargetProjection(project: MusicCompositionDocument, target: MusicExportTarget, maxProjectChannels = 16): MusicTargetProjection {
  const safeProjectLimit = Math.max(1, Math.min(MAX_GBA_TRACKER_CHANNELS, Math.trunc(maxProjectChannels)));
  const maxTargetChannels = targetChannelLimits[target];
  const maxPlayableChannels = Math.min(safeProjectLimit, maxTargetChannels);
  const channelStates = project.channels.map(channel => ({ channelId: channel.id, index: channel.index, enabled: channel.index < maxPlayableChannels }));
  const disabledCount = channelStates.filter(channel => !channel.enabled).length;
  const warnings: string[] = [];
  if (project.channels.length > maxTargetChannels) warnings.push(`${target} authoring target supports ${maxTargetChannels} channels; ${disabledCount} source channels are preserved but inactive for this target.`);
  else if (project.channels.length > safeProjectLimit) warnings.push(`The GBA build profile supports ${safeProjectLimit} active music channels; ${disabledCount} source channels are preserved but inactive for this target.`);
  return { target, maxProjectChannels: safeProjectLimit, maxTargetChannels, channelStates, warnings };
}

/** Selects an export target without rewriting or dropping canonical source data. */
export function selectMusicExportTarget(project: MusicCompositionDocument, target: MusicExportTarget): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot change the target of an invalid music composition.');
  if (!['MOD', 'XM', 'S3M', 'IT'].includes(target)) throw new Error(`Unsupported music export target: ${String(target)}`);
  return { ...project, targetFormat: target };
}

/** Applies an authoring pan value to the canonical note without quantizing it to the selected export format. */
export function setMusicCompositionNotePan(project: MusicCompositionDocument, patternIndex: number, row: number, channelIndex: number, pan: number): MusicCompositionDocument {
  return setMusicCompositionNoteProperties(project, patternIndex, row, channelIndex, { pan });
}

/** Applies note controls to the canonical entity while the module remains an export/preview projection. */
export function setMusicCompositionNoteProperties(project: MusicCompositionDocument, patternIndex: number, row: number, channelIndex: number, patch: { instrumentIndex?: number; volume?: number; pan?: number }): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot edit notes in an invalid music composition.');
  const pattern = project.patterns.find(item => item.index === patternIndex);
  const channelId = project.channels.find(channel => channel.index === channelIndex)?.id;
  if (!pattern || !channelId || !Number.isInteger(row) || row < 0 || row >= pattern.rows) return project;
  const noteIndex = pattern.notes.findIndex(note => note.row === row && note.channelId === channelId);
  if (noteIndex < 0) return project;
  const note = pattern.notes[noteIndex];
  const instrumentId = patch.instrumentIndex === undefined
    ? note.instrumentId
    : project.instruments.find(instrument => instrument.index === patch.instrumentIndex! - 1)?.id ?? note.instrumentId;
  const volume = patch.volume === undefined ? note.volume : Number.isFinite(patch.volume) ? Math.max(0, Math.min(1, patch.volume)) : 1;
  const volumePresent = patch.volume === undefined ? note.volumePresent : true;
  const pan = patch.pan === undefined ? note.pan : quantizeTrackerNotePan(patch.pan);
  if (note.instrumentId === instrumentId && note.volume === volume && note.volumePresent === volumePresent && note.pan === pan
    && (patch.pan === undefined || note.panMode !== 'absolute')) return project;
  return {
    ...project,
    patterns: project.patterns.map(item => item === pattern ? {
      ...item,
      notes: item.notes.map((itemNote, index) => {
        if (index !== noteIndex) return itemNote;
        const nextNote = { ...itemNote, instrumentId, volume, volumePresent, pan };
        if (patch.pan !== undefined) nextNote.panMode = 'absolute';
        return nextNote;
      }),
    } : item),
  };
}

/** Applies channel mixer controls directly to the canonical composition. */
export function setMusicCompositionChannelMix(project: MusicCompositionDocument, channelIndex: number, patch: { volume?: number; pan?: number; muted?: boolean }): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot edit channels in an invalid music composition.');
  const index = project.channels.findIndex(channel => channel.index === channelIndex);
  if (index < 0) return project;
  const channel = project.channels[index];
  const next = {
    ...channel,
    ...(patch.volume === undefined ? {} : { volume: Number.isFinite(patch.volume) ? Math.max(0, Math.min(1, patch.volume)) : 1 }),
    ...(patch.pan === undefined ? {} : { pan: Number.isFinite(patch.pan) ? Math.max(-1, Math.min(1, patch.pan)) : 0 }),
    ...(patch.muted === undefined ? {} : { muted: patch.muted }),
  };
  if (next.volume === channel.volume && next.pan === channel.pan && next.muted === channel.muted) return project;
  return { ...project, channels: project.channels.map((item, itemIndex) => itemIndex === index ? next : item) };
}

export interface MusicCompositionNoteEdit {
  oldRow?: number;
  start: number;
  end: number;
  pitch: number;
  channelIndex: number;
  instrumentIndex: number;
}
const isMusicCompositionReleaseCommand = (command: MusicCompositionDocument['patterns'][number]['commands'][number], commands: MusicCompositionDocument['patterns'][number]['commands']) => !command.gridEffect && (
  /:(?:note-off|note-cut|note-fade)$/.test(command.command)
  || /^(?:MOD|XM):effect-e$/.test(command.command) && command.parameter === 0xc0
  || /^(?:S3M|IT):effect-13$/.test(command.command) && command.parameter === 0xc0
  || command.command === 'XM:volume' && command.parameter === 0x10
    && commands.some(release => release.row === command.row && release.channelId === command.channelId && release.command === 'XM:note-off'));

/** Applies piano-roll note edits by canonical pattern/channel/instrument identity. */
export function editMusicCompositionNotes(project: MusicCompositionDocument, patternIndex: number, edits: readonly MusicCompositionNoteEdit[]): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot edit notes in an invalid music composition.');
  const pattern = project.patterns.find(item => item.index === patternIndex);
  if (!pattern || edits.length === 0) return project;
  const sourceNotes = pattern.notes;
  const staged = new Map<string, { edit: MusicCompositionNoteEdit; channelId: string; oldNote?: MusicCompositionDocument['patterns'][number]['notes'][number] }>();
  for (const edit of edits) {
    const channelId = project.channels.find(channel => channel.index === edit.channelIndex)?.id;
    if (!channelId || !Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < 0 || edit.end <= edit.start || edit.start >= pattern.rows) continue;
    const oldNote = edit.oldRow === undefined ? undefined : sourceNotes.find(note => note.row === edit.oldRow && note.channelId === channelId);
    if (edit.oldRow !== undefined && !oldNote) continue;
    staged.set(`${edit.start}:${channelId}`, { edit, channelId, oldNote });
  }
  if (staged.size === 0) return project;
  const replacedCells = new Set(staged.keys());
  const removedIds = new Set<string>();
  for (const { oldNote } of staged.values()) if (oldNote) removedIds.add(oldNote.id);
  const notes = sourceNotes.flatMap(note => {
    if (removedIds.has(note.id)) return [];
    let pieces = [{ start: note.row, end: note.row + note.durationRows }];
    for (const { edit, channelId } of staged.values()) {
      if (note.channelId !== channelId) continue;
      pieces = pieces.flatMap(piece => {
        if (edit.end <= piece.start || edit.start >= piece.end) return [piece];
        return [
          ...(piece.start < edit.start ? [{ start: piece.start, end: edit.start }] : []),
          ...(piece.end > edit.end ? [{ start: edit.end, end: piece.end }] : []),
        ];
      });
    }
    if (pieces.length === 1 && pieces[0].start === note.row && pieces[0].end === note.row + note.durationRows) return [note];
    return pieces.map((piece, index) => ({ ...note, id: index === 0 ? note.id : createTrackerUuid(), row: piece.start, durationRows: piece.end - piece.start }));
  });
  for (const { edit, channelId, oldNote } of staged.values()) {
    const pitch = Math.max(1, Math.min(96, Math.trunc(edit.pitch)));
    const instrument = project.instruments.find(instrument => instrument.index === edit.instrumentIndex - 1)
      ?? project.instruments.find(item => item.id === oldNote?.instrumentId);
    const instrumentId = instrument?.id ?? project.instruments[0]?.id;
    if (!instrumentId) continue;
    const id = oldNote?.id ?? createTrackerUuid();
    const sampleId = instrument?.noteMap.find(zone => edit.pitch - 1 >= zone.low && edit.pitch - 1 <= zone.high)?.sampleId
      ?? instrument?.sampleIds[0];
    const sample = sampleId ? project.samples.find(item => item.id === sampleId) : undefined;
    const channelPan = project.channels.find(item => item.id === channelId)?.pan ?? 0;
    const panCommand = pattern.commands.find(command => command.row === edit.start && command.channelId === channelId
      && command.command.startsWith(`${project.targetFormat}:effect-`)
      && isTrackerNotePanEffect(project.targetFormat, Number.parseInt(command.command.split('effect-')[1], 16), command.parameter));
    const gridPan = panCommand ? decodeTrackerNotePan(project.targetFormat,
      Number.parseInt(panCommand.command.split('effect-')[1], 16), panCommand.parameter) : undefined;
    const oldGridPan = oldNote && oldNote.row !== edit.start ? pattern.commands.find(command => command.gridEffect
      && command.row === oldNote.row && command.channelId === channelId && command.command.startsWith(`${project.targetFormat}:effect-`)
      && isTrackerNotePanEffect(project.targetFormat, Number.parseInt(command.command.split('effect-')[1], 16), command.parameter)) : undefined;
    const leavesGridPan = oldGridPan && oldNote?.pan === decodeTrackerNotePan(project.targetFormat,
      Number.parseInt(oldGridPan.command.split('effect-')[1], 16), oldGridPan.parameter);
    const nextNote: MusicCompositionDocument['patterns'][number]['notes'][number] = {
      id, row: edit.start, channelId, pitch,
      durationRows: Math.max(1, Math.min(pattern.rows - edit.start, edit.end - edit.start)),
      ...(edit.end >= pattern.rows ? { endAtPatternBoundary: true } : {}),
      instrumentId,
      volume: oldNote?.volume ?? sample?.volume ?? 1,
      ...(oldNote ? {} : { volumePresent: false }),
      pan: gridPan ?? (leavesGridPan ? undefined : oldNote?.pan) ?? Math.max(-1, Math.min(1, (sample?.panning ?? 0) + channelPan)),
      ...(gridPan !== undefined ? { panMode: 'absolute' as const } : oldNote?.panMode ? { panMode: oldNote.panMode } : oldNote ? {} : { panMode: 'absolute' as const }),
    };
    notes.push(nextNote);
  }
  // Imported releases are also preserved as native commands. Once their note
  // is resized/moved, keeping the original release would cut the edited note
  // at its former end even though its canonical duration has changed.
  const commands = pattern.commands.filter(command => {
    if (!isMusicCompositionReleaseCommand(command, pattern.commands)) return true;
    return ![...staged.values()].some(({ edit, channelId, oldNote }) => command.channelId === channelId
      && (oldNote && command.row === oldNote.row + oldNote.durationRows
        || command.row >= edit.start && command.row < edit.end));
  });
  return { ...project, patterns: project.patterns.map(item => item === pattern ? { ...item, notes, commands } : item) };
}

/** Subtracts selected row ranges, retaining the portions outside each cut. */
export function eraseMusicCompositionNoteRanges(project: MusicCompositionDocument, patternIndex: number, ranges: readonly { row: number; start: number; end: number; channelIndex: number }[]): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot edit notes in an invalid music composition.');
  const pattern = project.patterns.find(item => item.index === patternIndex);
  if (!pattern || !ranges.length) return project;
  const removedReleases = new Set<string>();
  const notes = pattern.notes.flatMap(note => {
    const channelIndex = project.channels.find(channel => channel.id === note.channelId)?.index;
    const cuts = ranges.filter(range => range.row === note.row && range.channelIndex === channelIndex
      && Number.isInteger(range.start) && Number.isInteger(range.end) && range.end > range.start);
    if (!cuts.length) return [note];
    const originalEnd = note.row + note.durationRows;
    let pieces = [{ start: note.row, end: originalEnd }];
    for (const cut of cuts) pieces = pieces.flatMap(piece => cut.end <= piece.start || cut.start >= piece.end ? [piece] : [
      ...(piece.start < cut.start ? [{ start: piece.start, end: cut.start }] : []),
      ...(piece.end > cut.end ? [{ start: cut.end, end: piece.end }] : []),
    ]);
    if (!pieces.some(piece => piece.end === originalEnd)) removedReleases.add(`${originalEnd}:${note.channelId}`);
    return pieces.map((piece, index) => ({ ...note, id: index === 0 ? note.id : createTrackerUuid(), row: piece.start, durationRows: piece.end - piece.start }));
  });
  const commands = pattern.commands.filter(command => !isMusicCompositionReleaseCommand(command, pattern.commands) || !removedReleases.has(`${command.row}:${command.channelId}`));
  return { ...project, patterns: project.patterns.map(item => item === pattern ? { ...item, notes, commands } : item) };
}

/** Removes piano-roll notes without changing any unrelated canonical commands or entities. */
export function deleteMusicCompositionNotes(project: MusicCompositionDocument, patternIndex: number, cells: readonly { row: number; channelIndex: number }[]): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot edit notes in an invalid music composition.');
  const pattern = project.patterns.find(item => item.index === patternIndex);
  if (!pattern || cells.length === 0) return project;
  const targets = new Set(cells.flatMap(cell => {
    const channelId = project.channels.find(channel => channel.index === cell.channelIndex)?.id;
    return channelId ? [`${cell.row}:${channelId}`] : [];
  }));
  const notes = pattern.notes.filter(note => !targets.has(`${note.row}:${note.channelId}`));
  const removedNotes = pattern.notes.filter(note => targets.has(`${note.row}:${note.channelId}`));
  const commands = pattern.commands.filter(command => !isMusicCompositionReleaseCommand(command, pattern.commands)
    || !removedNotes.some(note => note.channelId === command.channelId && note.row + note.durationRows === command.row));
  return notes.length === pattern.notes.length ? project : {
    ...project,
    patterns: project.patterns.map(item => item === pattern ? { ...item, notes, commands } : item),
  };
}

/** Removes muted-channel notes and their channel commands from a final composition snapshot. */
export function omitMutedMusicCompositionChannels(project: MusicCompositionDocument, mutedChannels: readonly boolean[]): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot export an invalid music composition.');
  const mutedChannelIds = new Set(project.channels.filter(channel => mutedChannels[channel.index] === true).map(channel => channel.id));
  if (!mutedChannelIds.size) return project;
  return {
    ...project,
    patterns: project.patterns.map(pattern => ({
      ...pattern,
      notes: pattern.notes.filter(note => !mutedChannelIds.has(note.channelId)),
      commands: pattern.commands.filter(command => !mutedChannelIds.has(command.channelId)),
    })),
  };
}

/** Keeps the active format's per-cell effect command in the canonical pattern. */
export function setMusicCompositionPatternEffect(project: MusicCompositionDocument, patternIndex: number, row: number, channelIndex: number, format: MusicExportTarget, effect: number, parameter: number, gridEffect = false): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot edit commands in an invalid music composition.');
  const pattern = project.patterns.find(item => item.index === patternIndex);
  const channelId = project.channels.find(channel => channel.index === channelIndex)?.id;
  if (!pattern || !channelId || !Number.isInteger(row) || row < 0 || row >= pattern.rows) return project;
  const maxEffect = format === 'MOD' ? 0x0f : 0xff;
  const safeEffect = Number.isFinite(effect) ? Math.max(0, Math.min(maxEffect, Math.trunc(effect))) : 0;
  const safeParameter = Number.isFinite(parameter) ? Math.max(0, Math.min(0xff, Math.trunc(parameter))) : 0;
  const effectPrefix = `${format}:effect-`;
  const matching = pattern.commands.filter(command => command.row === row && command.channelId === channelId && command.command.startsWith(effectPrefix));
  const command = safeEffect > 0 || safeParameter > 0 ? `${effectPrefix}${safeEffect.toString(16)}` : null;
  if (matching.length === Number(command !== null)
    && (!command || matching[0]?.command === command && matching[0]?.parameter === safeParameter && (!gridEffect || matching[0]?.gridEffect))) return project;
  const id = matching[0]?.id ?? createTrackerUuid();
  const otherCommands = pattern.commands.filter(item => !(item.row === row && item.channelId === channelId && item.command.startsWith(effectPrefix)));
  const nextCommands = command ? [...otherCommands, { id, row, channelId, command, parameter: safeParameter,
    ...(gridEffect || matching[0]?.gridEffect ? { gridEffect: true } : {}) }] : otherCommands;
  // Detach mirrored note pan when its grid effect moves or is erased, so export
  // does not recreate the effect at the old address.
  const previousPan = matching.some(item => isTrackerNotePanEffect(format, Number.parseInt(item.command.slice(effectPrefix.length), 16), item.parameter));
  const nextPan = command !== null && isTrackerNotePanEffect(format, safeEffect, safeParameter);
  const notes = gridEffect && (previousPan || nextPan) ? pattern.notes.map(note => {
    if (note.row !== row || note.channelId !== channelId) return note;
    const instrument = project.instruments.find(item => item.id === note.instrumentId);
    const sampleId = instrument?.noteMap.find(zone => note.pitch - 1 >= zone.low && note.pitch - 1 <= zone.high)?.sampleId ?? instrument?.sampleIds[0];
    const sample = project.samples.find(item => item.id === sampleId);
    const channel = project.channels.find(item => item.id === channelId);
    const pan = nextPan ? decodeTrackerNotePan(format, safeEffect, safeParameter)
      : Math.max(-1, Math.min(1, (sample?.panning ?? 0) + (channel?.pan ?? 0)));
    return { ...note, pan, panMode: 'absolute' as const };
  }) : pattern.notes;
  return { ...project, patterns: project.patterns.map(item => item === pattern ? { ...item, commands: nextCommands, notes } : item) };
}

/** Renames a canonical pattern while retaining its UUID and notes. */
export function setMusicCompositionPatternName(project: MusicCompositionDocument, patternIndex: number, name: string): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project) || !Number.isInteger(patternIndex) || typeof name !== 'string') return project;
  const pattern = project.patterns.find(item => item.index === patternIndex);
  const normalized = name.trim().slice(0, 48) || `Pattern ${patternIndex + 1}`;
  if (!pattern || pattern.name === normalized) return project;
  const next = { ...project, patterns: project.patterns.map(item => item.index === patternIndex ? { ...item, name: normalized } : item) };
  return isMusicCompositionDocument(next) ? next : project;
}

/** Applies sample metadata or PCM edits to an existing canonical sample without changing its UUID. */
export function setMusicCompositionSampleProperties(project: MusicCompositionDocument, sampleId: string, patch: Partial<Omit<MusicCompositionSample, 'id'>>): MusicCompositionDocument {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot edit samples in an invalid music composition.');
  const sampleIndex = project.samples.findIndex(sample => sample.id === sampleId);
  if (sampleIndex < 0) return project;
  const sample = project.samples[sampleIndex];
  const next: MusicCompositionSample = {
    ...sample,
    ...patch,
    id: sample.id,
    sampleRate: Number.isFinite(patch.sampleRate) ? Math.max(1, Math.round(patch.sampleRate!)) : sample.sampleRate,
    volume: Number.isFinite(patch.volume) ? Math.max(0, Math.min(1, patch.volume!)) : sample.volume,
    panning: Number.isFinite(patch.panning) ? Math.max(-1, Math.min(1, patch.panning!)) : sample.panning,
    rootNote: Number.isFinite(patch.rootNote) ? Math.max(0, Math.min(127, Math.trunc(patch.rootNote!))) : sample.rootNote,
    fineTune: Number.isFinite(patch.fineTune) ? Math.max(-128, Math.min(127, Math.trunc(patch.fineTune!))) : sample.fineTune,
    loopStart: Number.isFinite(patch.loopStart) ? Math.max(0, Math.trunc(patch.loopStart!)) : sample.loopStart,
    loopEnd: Number.isFinite(patch.loopEnd) ? Math.max(0, Math.trunc(patch.loopEnd!)) : sample.loopEnd,
  };
  if (next.loopEnd < next.loopStart) next.loopEnd = next.loopStart;
  const unchanged = Object.keys(patch).every(key => next[key as keyof MusicCompositionSample] === sample[key as keyof MusicCompositionSample]);
  if (unchanged) return project;
  return { ...project, samples: project.samples.map((item, index) => index === sampleIndex ? next : item) };
}
