import { compileMusicEditorSourceDocument, MusicEditorSourceDocument } from './trackerModule';
import { MusicCompositionDocument, MusicExportTarget, getMusicTargetProjection, isMusicCompositionDocument } from './trackerComposition';
import { createTrackerUuid } from './trackerIdentity';
import { decodeTrackerNotePan, encodeTrackerNotePan, normalizeTrackerPan, TrackerNotePanFormat } from './trackerNotePan';
import { trackerPitchToPeriod } from './trackerPianoRollModel';
import { factoryModFineTuneCorrection, factoryS3mRateCorrection } from './trackerFactoryTuning';

export interface MusicCompositionExport {
  target: MusicExportTarget;
  moduleData: ArrayBuffer;
  warnings: string[];
}

/** Materialize finite note ends at the next order's first row, including song looping. */
function withPatternBoundaryCuts(project: MusicCompositionDocument, target: MusicExportTarget): MusicCompositionDocument {
  const order = [...project.order].sort((a, b) => a.index - b.index);
  const patterns = new Map(project.patterns.map(pattern => [pattern.id, pattern]));
  const cuts = new Map<string, Set<string>>();
  order.forEach((entry, index) => {
    const previous = patterns.get(order[(index + order.length - 1) % order.length].patternId);
    const next = patterns.get(entry.patternId);
    if (!previous || !next) return;
    for (const note of previous.notes) {
      // Imported trackers can deliberately carry voices across patterns. Only
      // impose finite boundaries on native compositions or explicitly edited ends.
      if ((project.sourceModules.length > 0 && !note.endAtPatternBoundary)
        || note.row + note.durationRows !== previous.rows
        || next.notes.some(candidate => candidate.row === 0 && candidate.channelId === note.channelId)) continue;
      const channels = cuts.get(next.id) ?? new Set<string>();
      channels.add(note.channelId);
      cuts.set(next.id, channels);
    }
  });
  if (!cuts.size) return project;
  return {
    ...project,
    patterns: project.patterns.map(pattern => {
      const channels = cuts.get(pattern.id);
      if (!channels) return pattern;
      const releases = [...channels].flatMap(channelId => {
        const command = { id: createTrackerUuid(), row: 0, channelId,
          command: target === 'IT' ? 'IT:note-cut' : `${target}:note-off`, parameter: 0 };
        return target === 'XM' ? [command, { ...command, id: createTrackerUuid(), command: 'XM:volume', parameter: 0x10 }] : [command];
      });
      return { ...pattern, commands: target === 'MOD' ? [...releases, ...pattern.commands] : [...pattern.commands, ...releases] };
    }),
  };
}

function isPanEffect(format: TrackerNotePanFormat, effect: number, parameter: number): boolean {
  return (format === 'MOD' && effect === 14 && (parameter >> 4) === 8)
    || (format === 'XM' && (effect === 8 || effect === 14 && (parameter >> 4) === 8))
    || (format === 'S3M' && effect === 19 && (parameter >> 4) === 8)
    || (format === 'IT' && (effect === 24 || effect === 19 && (parameter >> 4) === 8));
}

function importedPanEffect(
  commands: MusicCompositionDocument['patterns'][number]['commands'],
  row: number,
  channelId: string,
  format: TrackerNotePanFormat,
  pan: number,
): { effect: number; parameter: number } | undefined {
  const prefix = `${format}:effect-`;
  for (const command of commands) {
    if (command.row !== row || command.channelId !== channelId || !command.command.startsWith(prefix)) continue;
    const effect = Number.parseInt(command.command.slice(prefix.length), 16);
    if (!Number.isFinite(effect) || !isPanEffect(format, effect, command.parameter)) continue;
    if (Math.abs(decodeTrackerNotePan(format, effect, command.parameter) - pan) < 1e-9) {
      return { effect, parameter: command.parameter & 0xff };
    }
  }
  return undefined;
}

function hasPanEffectAt(commands: MusicCompositionDocument['patterns'][number]['commands'], row: number, channelId: string, format: TrackerNotePanFormat): boolean {
  const prefix = `${format}:effect-`;
  return commands.some(command => {
    if (command.row !== row || command.channelId !== channelId || !command.command.startsWith(prefix)) return false;
    const effect = Number.parseInt(command.command.slice(prefix.length), 16);
    return Number.isFinite(effect) && isPanEffect(format, effect, command.parameter & 0xff);
  });
}

function hasEarlierPanChange(
  commands: MusicCompositionDocument['patterns'][number]['commands'],
  notes: MusicCompositionDocument['patterns'][number]['notes'],
  row: number,
  channelId: string,
  format: TrackerNotePanFormat,
): boolean {
  return notes.some(note => note.row < row && note.channelId === channelId && note.pan !== 0)
    || commands.some(command => command.row < row && hasPanEffectAt([command], command.row, channelId, format));
}

const bytesFromBase64 = (encoded: string): Uint8Array => {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const base64FromBytes = (bytes: Uint8Array): string => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(binary);
};

function warnUnrepresentableMaxmodSampleGlobals(project: MusicCompositionDocument, target: MusicExportTarget, warnings: string[]) {
  if (target === 'IT') return;
  for (const sample of project.samples) {
    const sampleGlobal = sample.maxmodSampleGlobalVolume ?? 64;
    const instrumentGlobal = sample.maxmodInstrumentGlobalVolume ?? 128;
    if (sampleGlobal !== 64 || instrumentGlobal !== 128) {
      warnings.push(`Sample ${sample.name} carries Maxmod sample/instrument global volume which the ${target} exporter does not preserve.`);
    }
  }
}

function encodeXmDelta(sample: MusicCompositionDocument['samples'][number], warnings: string[]): { pcm: Uint8Array; sixteenBit: boolean; frames: number } {
  const raw = bytesFromBase64(sample.pcmData);
  const bytesPerValue = sample.bitDepth / 8;
  const frameWidth = bytesPerValue * sample.channels;
  if (!raw.length || raw.length % frameWidth !== 0) throw new Error(`Sample ${sample.name} PCM length does not match its channel count and bit depth.`);
  const frames = raw.length / frameWidth;
  if (sample.channels > 1) warnings.push(`Sample ${sample.name} is downmixed from ${sample.channels} channels to mono for XM.`);
  const pcm = new Uint8Array(frames * bytesPerValue);
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  let previous = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    let value = 0;
    for (let channel = 0; channel < sample.channels; channel += 1) {
      const offset = frame * frameWidth + channel * bytesPerValue;
      value += sample.bitDepth === 16 ? view.getInt16(offset, true) : (raw[offset] & 0x80 ? raw[offset] - 0x100 : raw[offset]) * 256;
    }
    value = Math.round(value / sample.channels);
    if (sample.bitDepth === 16) {
      const delta = (value - previous + 0x10000) & 0xffff;
      pcm[frame * 2] = delta & 0xff;
      pcm[frame * 2 + 1] = delta >>> 8;
      previous = value;
    } else {
      const quantized = Math.max(-128, Math.min(127, Math.round(value / 256)));
      pcm[frame] = (quantized - previous + 0x100) & 0xff;
      previous = quantized;
    }
  }
  return { pcm, sixteenBit: sample.bitDepth === 16, frames };
}

function encodeXmSampleTuning(sample: MusicCompositionDocument['samples'][number], warnings: string[]): { rootNote: number; fineTune: number } {
  const requestedOffset = sample.rootNote - 48 + sample.fineTune / 128
    + 12 * Math.log2(sample.sampleRate / 8_363);
  const relativeNote = Math.max(-96, Math.min(95, Math.round(requestedOffset)));
  const fineTune = Math.max(-128, Math.min(127, Math.round((requestedOffset - relativeNote) * 128)));
  const encodedOffset = relativeNote + fineTune / 128;
  if (Math.abs(requestedOffset - encodedOffset) > 1 / 256) {
    warnings.push(`Sample ${sample.name} nominal rate/root tuning is outside XM's relative-note and fine-tune range; its pitch was clamped.`);
  }
  if (sample.sampleRate !== 8_363 && sample.tuningFormat !== 'XM') {
    warnings.push(`Sample ${sample.name} rate ${sample.sampleRate} Hz is represented by XM relative-note/fine-tune metadata.`);
  }
  return { rootNote: 48 + relativeNote, fineTune };
}

function formatEffectCommand(command: string): number | null {
  const match = /^XM:effect-([0-9a-f]{1,2})$/i.exec(command);
  return match ? Number.parseInt(match[1], 16) : null;
}

/** Exports canonical composition data to an XM module, reporting unsupported content explicitly. */
export function exportMusicCompositionToXm(project: MusicCompositionDocument): MusicCompositionExport {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot export an invalid canonical music composition.');
  project = withPatternBoundaryCuts(project, 'XM');
  const warnings: string[] = [];
  warnUnrepresentableMaxmodSampleGlobals(project, 'XM', warnings);
  const channels = [...project.channels].sort((left, right) => left.index - right.index);
  const instruments = [...project.instruments].sort((left, right) => left.index - right.index);
  const patterns = [...project.patterns].sort((left, right) => left.index - right.index);
  if (channels.length > 32) throw new Error('XM export supports at most 32 channels.');
  if (instruments.length > 128) throw new Error('XM export supports at most 128 instruments.');
  if (patterns.length > 256 || project.order.length > 256) throw new Error('XM export supports at most 256 patterns and order entries.');
  if (channels.some((channel, index) => channel.index !== index)) throw new Error('XM export requires contiguous channel indexes starting at zero.');
  if (instruments.some((instrument, index) => instrument.index !== index)) throw new Error('XM export requires contiguous instrument indexes starting at zero.');
  if (patterns.some((pattern, index) => pattern.index !== index)) throw new Error('XM export requires contiguous pattern indexes starting at zero.');
  if (project.tempoBpm < 32 || project.tempoBpm > 255) warnings.push(`Tempo ${project.tempoBpm} BPM is outside XM's 32-255 range and will be clamped.`);
  if (project.ticksPerRow < 1 || project.ticksPerRow > 31) warnings.push(`Ticks per row ${project.ticksPerRow} is outside XM's 1-31 range and will be clamped.`);

  const sampleById = new Map(project.samples.map(sample => [sample.id, sample]));
  const instrumentIndexById = new Map(instruments.map((instrument, index) => [instrument.id, index + 1]));
  const sourceInstruments: MusicEditorSourceDocument['instruments'] = [];
  const sourceSamples: MusicEditorSourceDocument['samples'] = [];
  const emittedSampleIds = new Set<string>();
  for (const [instrumentPosition, instrument] of instruments.entries()) {
    if (instrument.noteMap.some(zone => zone.high > 95)) warnings.push(`Instrument ${instrument.name} has key zones above note 96; XM cannot address notes 97-128, so those zones remain canonical but are omitted from this target.`);
    if (instrument.volumeEnvelope.sustainStart !== instrument.volumeEnvelope.sustainEnd || instrument.panningEnvelope.sustainStart !== instrument.panningEnvelope.sustainEnd) {
      warnings.push(`Instrument ${instrument.name} uses an envelope sustain range; XM supports a single sustain point, so the start point is used.`);
    }
    const references = instrument.sampleIds.length ? instrument.sampleIds : [null];
    if (references.length > 16) throw new Error(`Instrument ${instrument.name} exceeds XM's 16-sample limit.`);
    const variantForSample = new Map<string, number>();
    references.forEach((id, variantIndex) => { if (id) variantForSample.set(id, variantIndex); });
    const noteMap = Array.from({ length: 96 }, () => 0);
    for (const zone of instrument.noteMap) {
      const variantIndex = variantForSample.get(zone.sampleId);
      if (variantIndex === undefined) throw new Error(`Instrument ${instrument.name} maps a note to an unlisted sample.`);
      for (let note = zone.low; note <= zone.high && note < 96; note += 1) noteMap[note] = variantIndex;
    }
    const toXmEnvelope = (envelope: MusicCompositionDocument['instruments'][number]['volumeEnvelope']) => ({
      points: envelope.points.slice(0, 12).map(point => ({ tick: Math.max(0, Math.min(65535, Math.trunc(point.tick))), value: Math.round(point.value * 64) })),
      sustain: Math.min(Math.max(0, envelope.sustainStart), Math.max(0, envelope.points.length - 1)),
      loopStart: Math.min(Math.max(0, envelope.loopStart), Math.max(0, envelope.points.length - 1)),
      loopEnd: Math.min(Math.max(0, envelope.loopEnd), Math.max(0, envelope.points.length - 1)),
      enabled: envelope.enabled, sustainEnabled: envelope.sustainEnabled, loopEnabled: envelope.loopEnabled,
    });
    sourceInstruments.push({
      id: instrument.id, index: instrumentPosition + 1, name: instrument.name, noteMap,
      volumeEnvelope: toXmEnvelope(instrument.volumeEnvelope), panningEnvelope: toXmEnvelope(instrument.panningEnvelope), fadeout: instrument.fadeout,
    });
    references.forEach((id, variantIndex) => {
      const sample = id ? sampleById.get(id) : undefined;
      if (!sample) {
        sourceSamples.push({ id: createTrackerUuid(), index: instrumentPosition + 1, variantIndex, name: 'Sine', sampleRate: 8363, length: 2048, loopStart: 0, loopEnd: 0, rootNote: 48, volume: 64, sixteenBit: false, loopType: 0, fineTune: 0, panning: 128 });
        if (id) warnings.push(`Sample ${id} referenced by ${instrument.name} was missing; XM will use the built-in sine placeholder.`);
        else warnings.push(`Instrument ${instrument.name} has no sample; XM will use the built-in sine placeholder until audio is added.`);
        return;
      }
      const encoded = encodeXmDelta(sample, warnings);
      const tuning = encodeXmSampleTuning(sample, warnings);
      const exportedSampleId = emittedSampleIds.has(sample.id) ? createTrackerUuid() : sample.id;
      emittedSampleIds.add(sample.id);
      sourceSamples.push({
        id: exportedSampleId, index: instrumentPosition + 1, variantIndex, name: sample.name,
        sampleRate: 8363, length: encoded.frames, loopStart: sample.loopStart, loopEnd: sample.loopEnd,
        rootNote: tuning.rootNote, volume: Math.round(sample.volume * 64), encodedPcm: base64FromBytes(encoded.pcm),
        sixteenBit: encoded.sixteenBit, loopType: sample.loopType === 'forward' ? 1 : sample.loopType === 'ping-pong' ? 2 : 0,
        fineTune: tuning.fineTune, panning: Math.max(0, Math.min(255, Math.round((normalizeTrackerPan(sample.panning) + 1) * 128))),
      });
    });
  }

  const patternIdToIndex = new Map(patterns.map((pattern, index) => [pattern.id, index]));
  const sourcePatterns: MusicEditorSourceDocument['patterns'] = patterns.map((pattern, patternIndex) => {
    if (pattern.rows > 256) throw new Error(`Pattern ${pattern.name} exceeds XM's 256-row limit.`);
    const eventMap = new Map<string, MusicEditorSourceDocument['patterns'][number]['events'][number]>();
    const put = (row: number, channel: number, patch: Partial<MusicEditorSourceDocument['patterns'][number]['events'][number]>) => {
      const key = `${row}:${channel}`;
      const prior = eventMap.get(key);
      if (prior) Object.assign(prior, patch);
      else eventMap.set(key, { id: createTrackerUuid(), row, channel, note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0, ...patch });
    };
    const notes = [...pattern.notes].sort((left, right) => left.row - right.row || left.channelId.localeCompare(right.channelId));
    for (const note of notes) {
      const channelIndex = channels.findIndex(channel => channel.id === note.channelId);
      const instrumentNumber = instrumentIndexById.get(note.instrumentId);
      if (channelIndex < 0 || instrumentNumber === undefined) throw new Error(`Pattern ${pattern.name} contains an unresolved channel or instrument reference.`);
      if (note.pitch < 1 || note.pitch > 96) throw new Error(`Note ${note.id} pitch ${note.pitch} is outside XM's 1-96 range.`);
      const channel = channels[channelIndex];
      const instrument = instruments[instrumentNumber - 1];
      const zoneSampleId = instrument.noteMap.find(zone => note.pitch - 1 >= zone.low && note.pitch - 1 <= zone.high)?.sampleId
        ?? instrument.sampleIds[0];
      const defaultSamplePan = zoneSampleId ? sampleById.get(zoneSampleId)?.panning ?? 0 : 0;
      const volume = channel.muted ? 0 : Math.max(0, Math.min(1, (note.volumePresent === false ? 1 : note.volume) * channel.volume));
      const hasImportedPan = note.panMode === 'absolute' && hasPanEffectAt(pattern.commands, note.row, note.channelId, 'XM');
      const preservedPan = hasImportedPan ? importedPanEffect(pattern.commands, note.row, note.channelId, 'XM', note.pan) : null;
      const panRequired = hasImportedPan || (note.panMode === 'absolute'
        ? Math.abs(note.pan - defaultSamplePan) > 1e-9
        : note.pan !== 0 || channel.pan !== 0 && !hasEarlierPanChange(pattern.commands, pattern.notes, note.row, note.channelId, 'XM'));
      const competingEffect = pattern.commands.some(command => command.row === note.row && command.channelId === note.channelId
        && command.command.startsWith('XM:effect-') && !hasPanEffectAt([command], note.row, note.channelId, 'XM'));
      const pan = normalizeTrackerPan(hasImportedPan || note.panMode === 'absolute' ? note.pan : note.pan + channel.pan);
      const panCommand = preservedPan ?? encodeTrackerNotePan('XM', pan);
      if (panRequired && competingEffect) warnings.push(`Pattern ${pattern.name} row ${note.row + 1} channel ${channelIndex + 1} has a native XM effect that takes precedence over note panning.`);
      put(note.row, channelIndex, {
        note: note.pitch, instrument: instrumentNumber,
        volume: note.volumePresent === false && channel.volume === 1 && !channel.muted ? 0 : Math.round(0x10 + volume * 0x40),
        ...(panRequired && !competingEffect ? { effect: panCommand.effect, parameter: panCommand.parameter } : {}),
      });
      const releaseRow = note.row + note.durationRows;
      if (releaseRow < pattern.rows) {
        const releaseKey = `${releaseRow}:${channelIndex}`;
        if (eventMap.has(releaseKey)) warnings.push(`Pattern ${pattern.name} note-off at row ${releaseRow + 1} conflicts with another event; the note-off was omitted.`);
        else {
          // Maxmod only clears KEYON for XM key-off and starts the instrument
          // fade. Without a volume envelope or fadeout there is no release to
          // finish a looping factory sample, so explicitly silence that lane.
          const needsVolumeCut = !(instrument.volumeEnvelope.enabled && instrument.volumeEnvelope.points.length)
            && instrument.fadeout === 0;
          put(releaseRow, channelIndex, { note: 97, ...(needsVolumeCut ? { volume: 0x10 } : {}) });
        }
      }
    }
    for (const command of pattern.commands) {
      const channelIndex = channels.findIndex(channel => channel.id === command.channelId);
      if (channelIndex < 0) throw new Error(`Pattern ${pattern.name} contains a command with an unresolved channel.`);
      const key = `${command.row}:${channelIndex}`;
      const prior = eventMap.get(key);
      if (command.command === 'XM:note-off') {
        if (prior && prior.note !== 0) warnings.push(`Pattern ${pattern.name} note-off at row ${command.row + 1} conflicts with another event.`);
        else put(command.row, channelIndex, { note: 97 });
        continue;
      }
      if (command.command === 'XM:volume') {
        put(command.row, channelIndex, { volume: Math.max(0x10, Math.min(0x50, command.parameter)) });
        continue;
      }
      if (command.command === 'XM:volume-column') {
        put(command.row, channelIndex, { volume: Math.max(0, Math.min(255, command.parameter)) });
        continue;
      }
      const effect = formatEffectCommand(command.command);
      if (effect === null) {
        warnings.push(`Pattern ${pattern.name} command ${command.command} is not representable in XM and was omitted.`);
        continue;
      }
      if (prior && prior.effect !== 0) {
        if (pattern.notes.some(note => note.row === command.row && note.channelId === command.channelId)
          && hasPanEffectAt([command], command.row, command.channelId, 'XM')) continue;
        warnings.push(`Pattern ${pattern.name} has more than one effect at row ${command.row + 1}, channel ${channelIndex + 1}; later effect ${command.command} was omitted.`);
        continue;
      }
      put(command.row, channelIndex, { effect, parameter: Math.min(255, command.parameter) });
      if (command.parameter > 255) warnings.push(`Pattern ${pattern.name} effect parameter ${command.parameter} was clamped to 255 for XM.`);
    }
    return {
      id: pattern.id, index: patternIndex, name: pattern.name, rows: pattern.rows,
      events: [...eventMap.values()].sort((left, right) => left.row - right.row || left.channel - right.channel),
      notes: notes.map(note => ({ id: note.id, row: note.row, channel: channels.findIndex(channel => channel.id === note.channelId), note: note.pitch, instrument: instrumentIndexById.get(note.instrumentId)!, volume: Math.round(note.volume * 0x40), length: note.durationRows })),
    };
  });
  const order = [...project.order].sort((left, right) => left.index - right.index).map(entry => {
    const patternIndex = patternIdToIndex.get(entry.patternId);
    if (patternIndex === undefined) throw new Error(`Order entry ${entry.id} points to a missing pattern.`);
    return { id: entry.id, index: entry.index, patternId: entry.patternId };
  });
  if (order.some((entry, index) => entry.index !== index)) throw new Error('XM export requires contiguous order indexes starting at zero.');
  const source: MusicEditorSourceDocument = {
    schema: 'gba-studio/music-source', version: 1, assetFileName: `${project.title}.xm`, moduleFingerprint: '', format: 'XM', origin: 'scratch',
    title: project.title, tempo: Math.max(32, Math.min(255, project.tempoBpm)), speed: Math.max(1, Math.min(31, project.ticksPerRow)),
    channels: channels.map(channel => ({ id: channel.id, index: channel.index, name: channel.name })),
    instruments: sourceInstruments, samples: sourceSamples, patterns: sourcePatterns, order,
    channelMixer: { muted: channels.map(channel => channel.muted), volumes: channels.map(channel => channel.volume), pans: channels.map(channel => channel.pan) },
  };
  const moduleData = compileMusicEditorSourceDocument(source);
  const projection = getMusicTargetProjection(project, 'XM', 32);
  warnings.push(...projection.warnings);
  return { target: 'XM', moduleData, warnings: [...new Set(warnings)] };
}

interface ModSampleSlot {
  sampleId: string | null;
  sample: MusicCompositionDocument['samples'][number] | null;
  volume: number;
  name: string;
}

interface ModCell {
  period: number;
  sample: number;
  effect: number;
  parameter: number;
}

function modEffectCommand(command: string): number | null {
  const match = /^MOD:effect-([0-9a-f])$/i.exec(command);
  return match ? Number.parseInt(match[1], 16) : null;
}

/** Encodes a canonical composition as a four-channel ProTracker MOD module. */
export function exportMusicCompositionToMod(project: MusicCompositionDocument): MusicCompositionExport {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot export an invalid canonical music composition.');
  project = withPatternBoundaryCuts(project, 'MOD');
  const warnings: string[] = [];
  warnUnrepresentableMaxmodSampleGlobals(project, 'MOD', warnings);
  const channels = [...project.channels].sort((left, right) => left.index - right.index);
  const instruments = [...project.instruments].sort((left, right) => left.index - right.index);
  const patterns = [...project.patterns].sort((left, right) => left.index - right.index);
  if (channels.length > 4) warnings.push(...getMusicTargetProjection(project, 'MOD', 32).warnings);
  if (patterns.length < 1 || patterns.length > 128 || project.order.length < 1 || project.order.length > 128) {
    throw new Error('MOD export requires one to 128 patterns and order entries.');
  }
  if (channels.some((channel, index) => channel.index !== index)) throw new Error('MOD export requires contiguous channel indexes starting at zero.');
  if (instruments.some((instrument, index) => instrument.index !== index)) throw new Error('MOD export requires contiguous instrument indexes starting at zero.');
  if (patterns.some((pattern, index) => pattern.index !== index || pattern.rows > 64)) throw new Error('MOD export requires contiguous patterns of at most 64 rows.');

  const sampleById = new Map(project.samples.map(sample => [sample.id, sample]));
  const instrumentById = new Map(instruments.map(instrument => [instrument.id, instrument]));
  const slots: ModSampleSlot[] = [];
  const slotByKey = new Map<string, number>();
  const slotForNote = new Map<string, number>();
  for (const pattern of patterns) for (const note of pattern.notes) {
    const channelIndex = channels.findIndex(channel => channel.id === note.channelId);
    if (channelIndex < 0) throw new Error(`Pattern ${pattern.name} contains an unresolved channel reference.`);
    if (channelIndex >= 4) continue;
    const instrument = instrumentById.get(note.instrumentId);
    if (!instrument) throw new Error(`Pattern ${pattern.name} contains an unresolved instrument reference.`);
    const zone = instrument.noteMap.find(item => note.pitch - 1 >= item.low && note.pitch - 1 <= item.high);
    const sampleId = zone?.sampleId ?? instrument.sampleIds[0] ?? null;
    const sample = sampleId ? sampleById.get(sampleId) ?? null : null;
    const channel = channels[channelIndex];
    const volume = channel.muted ? 0 : Math.max(0, Math.min(64, Math.round((note.volumePresent === false ? 1 : note.volume) * channel.volume * (sample?.volume ?? 1) * 64)));
    const key = `${instrument.id}:${sampleId ?? 'silent'}:${volume}`;
    let slot = slotByKey.get(key);
    if (slot === undefined) {
      if (slots.length >= 31) throw new Error('MOD export exceeds 31 sample slots after preserving per-note sample and volume variants.');
      slot = slots.length + 1;
      slots.push({ sampleId, sample, volume, name: sample?.name || instrument.name || `Instrument ${slot}` });
      slotByKey.set(key, slot);
    }
    slotForNote.set(note.id, slot);
  }
  if (!slots.length) {
    for (const instrument of instruments.slice(0, 31)) {
      const key = `${instrument.id}:silent:64`;
      if (slotByKey.has(key)) continue;
      const slot = slots.length + 1;
      slots.push({ sampleId: null, sample: null, volume: 64, name: instrument.name || `Instrument ${slot}` });
      slotByKey.set(key, slot);
    }
  }

  const warningsForSamples = new Set<string>();
  const samplePcm = slots.map(slot => {
    if (!slot.sample) {
      warningsForSamples.add(`Instrument ${slot.name} has no sample; MOD exports a silent placeholder sample.`);
      return new Uint8Array([0, 0]);
    }
    const sample = slot.sample;
    const raw = bytesFromBase64(sample.pcmData);
    const bytesPerValue = sample.bitDepth / 8;
    const frameWidth = bytesPerValue * sample.channels;
    if (!raw.length || raw.length % frameWidth !== 0) throw new Error(`Sample ${sample.name} PCM length does not match its channel count and bit depth.`);
    if (sample.bitDepth === 16) warningsForSamples.add(`Sample ${sample.name} is reduced from 16-bit to 8-bit signed PCM for MOD.`);
    if (sample.channels > 1) warningsForSamples.add(`Sample ${sample.name} is downmixed from ${sample.channels} channels to mono for MOD.`);
    if (sample.loopType === 'ping-pong') warningsForSamples.add(`Sample ${sample.name} ping-pong loop is exported as a forward loop for MOD.`);
    const frames = raw.length / frameWidth;
    if (frames > 65_535) throw new Error(`Sample ${sample.name} exceeds MOD's 65,535-byte sample limit after conversion.`);
    const outputLength = Math.max(2, frames + (frames & 1));
    if (outputLength > 65_534) throw new Error(`Sample ${sample.name} exceeds MOD's 65,534-byte aligned sample limit.`);
    const output = new Uint8Array(outputLength);
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    for (let frame = 0; frame < frames; frame += 1) {
      let value = 0;
      for (let channel = 0; channel < sample.channels; channel += 1) {
        const offset = frame * frameWidth + channel * bytesPerValue;
        value += sample.bitDepth === 16 ? view.getInt16(offset, true) : (raw[offset] & 0x80 ? raw[offset] - 0x100 : raw[offset]) * 256;
      }
      output[frame] = Math.max(-128, Math.min(127, Math.round(value / sample.channels / 256))) & 0xff;
    }
    return output;
  });
  warnings.push(...warningsForSamples);

  const grids: ModCell[][][] = patterns.map(() => Array.from({ length: 64 }, () =>
    Array.from({ length: 4 }, () => ({ period: 0, sample: 0, effect: 0, parameter: 0 }))));
  let ignoredChannels = false;
  for (const [patternIndex, pattern] of patterns.entries()) {
    const noteCells = new Set<string>();
    for (const note of [...pattern.notes].sort((left, right) => left.row - right.row || left.channelId.localeCompare(right.channelId))) {
      const channelIndex = channels.findIndex(channel => channel.id === note.channelId);
      if (channelIndex >= 4) { ignoredChannels = true; continue; }
      if (note.pitch < 1 || note.pitch > 96) throw new Error(`Note ${note.id} pitch ${note.pitch} is outside MOD's canonical range.`);
      const cell = grids[patternIndex][note.row][channelIndex];
      const cellKey = `${note.row}:${channelIndex}`;
      if (noteCells.has(cellKey)) { warnings.push(`Pattern ${pattern.name} has multiple notes at row ${note.row + 1}, channel ${channelIndex + 1}; later note ${note.id} was omitted.`); continue; }
      noteCells.add(cellKey);
      const slot = slotForNote.get(note.id);
      if (!slot) { warnings.push(`Pattern ${pattern.name} note ${note.id} has no MOD sample slot and was omitted.`); continue; }
      const instrument = instrumentById.get(note.instrumentId)!;
      const zone = instrument.noteMap.find(item => note.pitch - 1 >= item.low && note.pitch - 1 <= item.high);
      const sampleId = zone?.sampleId ?? instrument.sampleIds[0] ?? null;
      const sample = sampleId ? sampleById.get(sampleId) : undefined;
      const samplePan = sample?.panning ?? 0;
      const hasImportedPan = note.panMode === 'absolute' && hasPanEffectAt(pattern.commands, note.row, note.channelId, 'MOD');
      const preservedPan = hasImportedPan ? importedPanEffect(pattern.commands, note.row, note.channelId, 'MOD', note.pan) : null;
      const competingEffect = pattern.commands.some(command => command.row === note.row && command.channelId === note.channelId
        && (command.command === 'MOD:volume' || command.command.startsWith('MOD:effect-'))
        && !hasPanEffectAt([command], note.row, note.channelId, 'MOD'));
      const pan = normalizeTrackerPan(hasImportedPan || note.panMode === 'absolute' ? note.pan : note.pan + channels[channelIndex].pan + samplePan);
      const panRequired = hasImportedPan || (note.panMode === 'absolute'
        ? Math.abs(note.pan - channels[channelIndex].pan - samplePan) > 1e-9
        : note.pan !== 0 || channels[channelIndex].pan + samplePan !== 0 && !hasEarlierPanChange(pattern.commands, pattern.notes, note.row, note.channelId, 'MOD'));
      const encodedPan = preservedPan ?? (panRequired ? encodeTrackerNotePan('MOD', pan) : undefined);
      if (panRequired && competingEffect) warnings.push(`Pattern ${pattern.name} row ${note.row + 1} channel ${channelIndex + 1} has a native MOD effect that takes precedence over note panning.`);
      const sampleRate = Math.max(1, sample?.sampleRate ?? 8363);
      const sampleRoot = sample?.rootNote ?? 48;
      const tunedPitch = sample?.tuningFormat === 'XM' ? note.pitch + sampleRoot - 48 : note.pitch + 48 - sampleRoot;
      const periodExact = trackerPitchToPeriod(tunedPitch) * (8363 / sampleRate);
      const period = Math.max(113, Math.min(856, Math.round(periodExact)));
      if (period !== Math.round(periodExact)) warnings.push(`Pattern ${pattern.name} note ${note.id} pitch was clamped to MOD's period range.`);
      cell.period = period;
      cell.sample = slot;
      if (encodedPan && !competingEffect) {
        cell.effect = encodedPan.effect;
        cell.parameter = encodedPan.parameter;
      }
      const releaseRow = note.row + note.durationRows;
      if (releaseRow < pattern.rows) {
        const release = grids[patternIndex][releaseRow][channelIndex];
        const hasNativeEffect = pattern.commands.some(command => command.row === releaseRow
          && command.channelId === note.channelId && (command.command === 'MOD:volume' || command.command.startsWith('MOD:effect-')));
        if (release.period || release.sample || release.effect || hasNativeEffect) warnings.push(`Pattern ${pattern.name} note-off at row ${releaseRow + 1}, channel ${channelIndex + 1} conflicts with another MOD event.`);
        else { release.effect = 14; release.parameter = 0xc0; }
      }
    }
    for (const command of pattern.commands) {
      const channelIndex = channels.findIndex(channel => channel.id === command.channelId);
      if (channelIndex >= 4) { ignoredChannels = true; continue; }
      let effect: number | null = null;
      let parameter = command.parameter;
      if (command.command === 'MOD:note-off') { effect = 14; parameter = 0xc0; }
      else if (command.command === 'MOD:volume') { effect = 12; parameter = Math.max(0, Math.min(64, command.parameter)); }
      else effect = modEffectCommand(command.command);
      if (effect === null) {
        warnings.push(`Pattern ${pattern.name} command ${command.command} is not representable in MOD and was omitted.`);
        continue;
      }
      const globalFlowEffect = effect === 0x0b || effect === 0x0d;
      const destinationChannel = globalFlowEffect
        ? grids[patternIndex][command.row].findIndex(candidate => candidate.effect === 0
          || candidate.effect === effect && candidate.parameter === parameter)
        : channelIndex;
      if (destinationChannel < 0) {
        warnings.push(`Pattern ${pattern.name} has no free MOD effect column at row ${command.row + 1}; ${command.command} was omitted.`);
        continue;
      }
      const destination = grids[patternIndex][command.row][destinationChannel];
      if (destination.effect !== 0) {
        if (pattern.notes.some(note => note.row === command.row && note.channelId === command.channelId)
          && hasPanEffectAt([command], command.row, command.channelId, 'MOD')) continue;
        if (destination.effect === effect && destination.parameter === parameter) continue;
        warnings.push(`Pattern ${pattern.name} has competing effects at row ${command.row + 1}, channel ${destinationChannel + 1}; ${command.command} was omitted to preserve note pan or note-off.`);
        continue;
      }
      destination.effect = effect;
      destination.parameter = parameter;
    }
  }
  if (ignoredChannels && channels.length > 4 && !warnings.some(warning => warning.startsWith('MOD authoring target supports 4 channels'))) {
    warnings.push('MOD exports only channels 1-4; the canonical composition retains all other channels for XM/S3M/IT targets.');
  }

  const order = [...project.order].sort((left, right) => left.index - right.index);
  const patternIndexById = new Map(patterns.map((pattern, index) => [pattern.id, index]));
  const orderIndexes = order.map(entry => {
    const index = patternIndexById.get(entry.patternId);
    if (index === undefined) throw new Error(`Order entry ${entry.id} points to a missing pattern.`);
    return index;
  });
  const bytes = new Uint8Array(1084 + patterns.length * 1024 + samplePcm.reduce((sum, sample) => sum + sample.length, 0));
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string, length: number, description: string) => {
    if ([...value].some(character => character.charCodeAt(0) > 0x7f)) warnings.push(`${description} contains non-ASCII characters which MOD cannot preserve.`);
    for (let index = 0; index < Math.min(value.length, length); index += 1) bytes[offset + index] = value.charCodeAt(index) & 0x7f;
  };
  const write16 = (offset: number, value: number) => view.setUint16(offset, value, false);
  ascii(0, project.title, 20, 'The MOD title');
  let dataOffset = 1084 + patterns.length * 1024;
  slots.forEach((slot, index) => {
    const header = 20 + index * 30;
    const sampleBytes = samplePcm[index];
    ascii(header, slot.name, 22, `Sample ${slot.name}`);
    write16(header + 22, sampleBytes.length / 2);
    const fine = slot.sample ? Math.round(slot.sample.tuningFormat === 'XM'
      ? slot.sample.fineTune / 8 + factoryModFineTuneCorrection : slot.sample.fineTune / 16) : 0;
    const quantizedFine = Math.max(-8, Math.min(7, fine));
    bytes[header + 24] = quantizedFine & 15;
    if (slot.sample && slot.sample.tuningFormat !== 'XM' && quantizedFine * 16 !== slot.sample.fineTune) warnings.push(`Sample ${slot.name} fine tune is quantized to MOD's 1/8-semitone steps.`);
    bytes[header + 25] = slot.volume;
    const loopStart = slot.sample ? Math.max(0, Math.min(sampleBytes.length, slot.sample.loopStart)) : 0;
    const loopEnd = slot.sample ? Math.max(loopStart, Math.min(sampleBytes.length, slot.sample.loopEnd)) : 0;
    const loopLength = slot.sample?.loopType !== 'none' && loopEnd - loopStart >= 2 ? loopEnd - loopStart : 2;
    write16(header + 26, Math.floor(loopLength >= 2 && slot.sample?.loopType !== 'none' ? loopStart / 2 : 0));
    write16(header + 28, Math.max(1, Math.floor(loopLength / 2)));
    bytes.set(sampleBytes, dataOffset);
    dataOffset += sampleBytes.length;
  });
  bytes[950] = orderIndexes.length;
  bytes[951] = 0x7f;
  bytes.fill(0, 952, 1080);
  orderIndexes.forEach((patternIndex, index) => { bytes[952 + index] = patternIndex; });
  ascii(1080, 'M.K.', 4, 'MOD signature');

  const writeGlobal = (parameter: number, label: string) => {
    const freeChannel = grids[0][0].findIndex(cell => cell.effect === 0);
    if (freeChannel < 0) { warnings.push(`MOD could not place the ${label} command at the start because all four effect columns are occupied.`); return; }
    grids[0][0][freeChannel].effect = 15;
    grids[0][0][freeChannel].parameter = parameter;
  };
  if (project.ticksPerRow !== 6) writeGlobal(Math.max(1, Math.min(31, project.ticksPerRow)), 'speed');
  if (project.tempoBpm !== 125) writeGlobal(Math.max(32, Math.min(255, project.tempoBpm)), 'tempo');

  patterns.forEach((_, patternIndex) => {
    const base = 1084 + patternIndex * 1024;
    for (let row = 0; row < 64; row += 1) for (let channel = 0; channel < 4; channel += 1) {
      const cell = grids[patternIndex][row][channel];
      const offset = base + (row * 4 + channel) * 4;
      const period = cell.period;
      bytes[offset] = ((cell.sample & 0xf0) | ((period >> 8) & 0x0f)) & 0xff;
      bytes[offset + 1] = period & 0xff;
      bytes[offset + 2] = ((cell.sample & 0x0f) << 4) | (cell.effect & 0x0f);
      bytes[offset + 3] = cell.parameter & 0xff;
    }
  });
  return { target: 'MOD', moduleData: bytes.buffer, warnings: [...new Set(warnings)] };
}

type S3mSlot = { instrumentId: string; sample: MusicCompositionDocument['samples'][number] | null; name: string };
type S3mCell = { note: number; instrument: number; volume: number; effect: number; parameter: number };

const s3mEffectCommand = (command: string): number | null => {
  const match = /^S3M:effect-([0-9a-f]{1,2})$/i.exec(command);
  return match ? Number.parseInt(match[1], 16) : null;
};

/** Encodes canonical notes and samples as a signed PCM S3M module. */
export function exportMusicCompositionToS3m(project: MusicCompositionDocument): MusicCompositionExport {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot export an invalid canonical music composition.');
  project = withPatternBoundaryCuts(project, 'S3M');
  const warnings: string[] = [];
  warnUnrepresentableMaxmodSampleGlobals(project, 'S3M', warnings);
  const channels = [...project.channels].sort((a, b) => a.index - b.index);
  const instruments = [...project.instruments].sort((a, b) => a.index - b.index);
  const patterns = [...project.patterns].sort((a, b) => a.index - b.index);
  const activeChannels = Math.min(32, channels.length);
  if (channels.length > 32) warnings.push('S3M exports only channels 1-32; upper-channel events remain in the canonical composition.');
  if (patterns.length < 1 || patterns.length > 255 || project.order.length < 1 || project.order.length > 255) throw new Error('S3M export requires one to 255 patterns and order entries.');
  if (channels.some((channel, index) => channel.index !== index) || instruments.some((instrument, index) => instrument.index !== index)
    || patterns.some((pattern, index) => pattern.index !== index)) throw new Error('S3M export requires contiguous canonical indexes.');
  if (patterns.some(pattern => pattern.rows > 64)) throw new Error('S3M export requires patterns of at most 64 rows.');
  const sampleById = new Map(project.samples.map(sample => [sample.id, sample]));
  const instrumentById = new Map(instruments.map(instrument => [instrument.id, instrument]));
  for (const instrument of instruments) {
    if (instrument.volumeEnvelope.enabled || instrument.panningEnvelope.enabled || instrument.fadeout > 0) {
      warnings.push(`Instrument ${instrument.name} envelope or fadeout settings are not represented by this S3M exporter.`);
    }
  }
  const slots: S3mSlot[] = [];
  const slotByKey = new Map<string, number>();
  const slotForNote = new Map<string, number>();
  for (const instrument of instruments) {
    const sampleIds = [...new Set([...instrument.sampleIds, ...instrument.noteMap.map(zone => zone.sampleId)])];
    const resolvedSampleIds = sampleIds.length ? sampleIds : [null];
    for (const sampleId of resolvedSampleIds) {
      const sample = sampleId ? sampleById.get(sampleId) ?? null : null;
      const key = `${instrument.id}:${sampleId ?? 'silent'}`;
      if (slotByKey.has(key)) continue;
      if (slots.length >= 99) throw new Error('S3M export supports at most 99 sample instruments.');
      slots.push({ instrumentId: instrument.id, sample, name: sample?.name || instrument.name || `Instrument ${slots.length + 1}` });
      slotByKey.set(key, slots.length);
    }
  }
  for (const pattern of patterns) for (const note of pattern.notes) {
    const instrument = instrumentById.get(note.instrumentId);
    if (!instrument) throw new Error(`Pattern ${pattern.name} contains an unresolved instrument reference.`);
    const mapped = instrument.noteMap.find(zone => note.pitch - 1 >= zone.low && note.pitch - 1 <= zone.high)?.sampleId;
    const sampleId = mapped ?? instrument.sampleIds[0] ?? null;
    const sample = sampleId ? sampleById.get(sampleId) ?? null : null;
    const key = `${instrument.id}:${sampleId ?? 'silent'}`;
    let slot = slotByKey.get(key);
    if (slot === undefined) {
      if (slots.length >= 99) throw new Error('S3M export supports at most 99 sample instruments.');
      slot = slots.length + 1;
      slots.push({ instrumentId: instrument.id, sample, name: sample?.name || instrument.name || `Instrument ${slot}` });
      slotByKey.set(key, slot);
    }
    slotForNote.set(note.id, slot);
  }
  const slotIndexByKey = new Map(slots.map((slot, index) => [`${slot.instrumentId}:${slot.sample?.id ?? 'silent'}`, index + 1]));
  const grids: S3mCell[][][] = patterns.map(() => Array.from({ length: 64 }, () => Array.from({ length: activeChannels }, () => ({ note: 255, instrument: 0, volume: 255, effect: -1, parameter: 0 }))));
  const writeEffect = (cell: S3mCell, effect: number, parameter: number, patternName: string, label: string) => {
    if (cell.effect !== -1) { warnings.push(`Pattern ${patternName} has competing effects; ${label} was omitted.`); return; }
    cell.effect = effect; cell.parameter = parameter & 0xff;
  };
  const writeOrderFlowEffect = (row: S3mCell[], preferredChannel: number, effect: number, parameter: number, patternName: string, label: string) => {
    const channelOrder = [preferredChannel, ...Array.from({ length: activeChannels }, (_, index) => index).filter(index => index !== preferredChannel)];
    const target = channelOrder.find(channel => row[channel]?.effect === -1);
    if (target === undefined) { warnings.push(`Pattern ${patternName} has no free channel effect column; ${label} was omitted.`); return; }
    row[target].effect = effect;
    row[target].parameter = parameter & 0xff;
  };
  for (const [patternIndex, pattern] of patterns.entries()) {
    const used = new Set<string>();
    for (const note of pattern.notes) {
      const channel = channels.findIndex(item => item.id === note.channelId);
      if (channel < 0) throw new Error(`Pattern ${pattern.name} contains an unresolved channel reference.`);
      if (channel >= activeChannels) continue;
      if (note.pitch < 1 || note.pitch > 96) throw new Error(`Note ${note.id} pitch is outside S3M's 1-96 range.`);
      const cell = grids[patternIndex][note.row][channel];
      const key = `${note.row}:${channel}`;
      if (used.has(key)) { warnings.push(`Pattern ${pattern.name} has multiple notes in row ${note.row + 1}, channel ${channel + 1}; note ${note.id} was omitted.`); continue; }
      used.add(key);
      const slot = slotForNote.get(note.id) ?? 0;
      const zeroBasedPitch = note.pitch - 1;
      cell.note = Math.floor(zeroBasedPitch / 12) * 16 + (zeroBasedPitch % 12);
      cell.instrument = slot;
      const sample = slots[slot - 1]?.sample;
      const materializeVolume = note.volumePresent !== false || channels[channel].muted || channels[channel].volume !== 1;
      cell.volume = channels[channel].muted ? 0 : materializeVolume
        ? Math.max(0, Math.min(64, Math.round((note.volumePresent === false ? 1 : note.volume) * channels[channel].volume * 64)))
        : 255;
      const hasImportedPan = note.panMode === 'absolute' && hasPanEffectAt(pattern.commands, note.row, note.channelId, 'S3M');
      const preservedPan = note.panMode === 'absolute' ? importedPanEffect(pattern.commands, note.row, note.channelId, 'S3M', note.pan) : null;
      const pan = normalizeTrackerPan(hasImportedPan || note.panMode === 'absolute' ? note.pan : note.pan + channels[channel].pan + (sample?.panning ?? 0));
      // Channel panning is already encoded in S3M's channel-pan table. Do not
      // synthesize an S8x note effect for it: that would occupy the row's sole
      // effect column and silently discard a real imported effect.
      const panRequired = hasImportedPan || (note.panMode === 'absolute'
        ? Math.abs(note.pan - channels[channel].pan - (sample?.panning ?? 0)) > 1e-9
        : note.pan !== 0);
      const panCommand = preservedPan ?? (panRequired ? encodeTrackerNotePan('S3M', pan) : undefined);
      if (panCommand) writeEffect(cell, panCommand.effect, panCommand.parameter, pattern.name, 'note panning');
      if (note.durationRows > 0 && note.row + note.durationRows < pattern.rows) {
        const release = grids[patternIndex][note.row + note.durationRows][channel];
        if (release.note !== 255 || release.instrument || release.effect !== -1) warnings.push(`Pattern ${pattern.name} note-off at row ${note.row + note.durationRows + 1}, channel ${channel + 1} conflicts with another event.`);
        else release.note = 254;
      }
    }
    for (const command of pattern.commands) {
      const channel = channels.findIndex(item => item.id === command.channelId);
      if (channel < 0) throw new Error(`Pattern ${pattern.name} contains an unresolved command channel.`);
      if (channel >= activeChannels) continue;
      const cell = grids[patternIndex][command.row][channel];
      if (command.command === 'S3M:volume') {
        if (cell.volume !== 255) warnings.push(`Pattern ${pattern.name} has competing volume columns; ${command.command} was omitted.`);
        else cell.volume = Math.max(0, Math.min(64, Math.trunc(command.parameter)));
        continue;
      }
      const specialNote = command.command === 'S3M:note-off' ? 254 : command.command === 'S3M:note-cut' ? 255 : null;
      const effect = s3mEffectCommand(command.command);
      if (specialNote !== null) {
        if (cell.note !== 255) warnings.push(`Pattern ${pattern.name} has competing note data; ${command.command} was omitted.`);
        else cell.note = specialNote;
      } else if (effect === null) warnings.push(`Pattern ${pattern.name} command ${command.command} is not representable in S3M and was omitted.`);
      else if (effect === 2 || effect === 3) writeOrderFlowEffect(grids[patternIndex][command.row], channel, effect, command.parameter, pattern.name, command.command);
      else if (pattern.notes.some(note => note.row === command.row && note.channelId === command.channelId)
        && hasPanEffectAt([command], command.row, command.channelId, 'S3M')) continue;
      else writeEffect(cell, effect, command.parameter, pattern.name, command.command);
    }
  }
  if (project.ticksPerRow > 255) warnings.push('S3M speed was clamped to 255 ticks per row.');
  if (project.tempoBpm < 32 || project.tempoBpm > 255) warnings.push('S3M tempo was clamped to its 32-255 BPM command range.');

  const packPattern = (grid: S3mCell[][]) => {
    const packed: number[] = [];
    for (const row of grid) {
      for (let channel = 0; channel < row.length; channel += 1) {
        const cell = row[channel];
        let flags = 0;
        if (cell.note !== 255 || cell.instrument) flags |= 32;
        if (cell.volume !== 255) flags |= 64;
        if (cell.effect !== -1) flags |= 128;
        if (!flags) continue;
        packed.push(channel | flags);
        if (flags & 32) packed.push(cell.note, cell.instrument);
        if (flags & 64) packed.push(cell.volume);
        if (flags & 128) packed.push(cell.effect, cell.parameter);
      }
      packed.push(0);
    }
    if (packed.length > 65535) throw new Error('S3M packed pattern exceeds the format size limit.');
    return packed;
  };
  const packedPatterns = grids.map(packPattern);
  const order = [...project.order].sort((a, b) => a.index - b.index);
  const patternById = new Map(patterns.map((pattern, index) => [pattern.id, index]));
  const orderIndexes = order.map(entry => {
    const index = patternById.get(entry.patternId);
    if (index === undefined) throw new Error(`Order entry ${entry.id} points to a missing pattern.`);
    return index;
  });
  const panBytes = 32;
  const tableStart = 96 + orderIndexes.length + slots.length * 2 + patterns.length * 2;
  const dataStart = Math.ceil((tableStart + panBytes) / 16) * 16;
  let cursor = dataStart;
  const instrumentOffsets = slots.map(() => { const offset = cursor; cursor += 80; return offset; });
  cursor = Math.ceil(cursor / 16) * 16;
  const patternOffsets = packedPatterns.map(data => { const offset = cursor; cursor = Math.ceil((cursor + 2 + data.length) / 16) * 16; return offset; });
  const sampleData = slots.map(slot => {
    if (!slot.sample) { warnings.push(`Instrument ${slot.name} has no sample; S3M exports a silent placeholder.`); return new Uint8Array([0]); }
    const sample = slot.sample;
    const raw = bytesFromBase64(sample.pcmData);
    const bytesPerValue = sample.bitDepth / 8;
    const frameWidth = bytesPerValue * sample.channels;
    if (!raw.length || raw.length % frameWidth) throw new Error(`Sample ${sample.name} PCM length does not match its channel count and bit depth.`);
    if (sample.bitDepth === 16) warnings.push(`Sample ${sample.name} is reduced from 16-bit to signed 8-bit PCM for S3M.`);
    if (sample.channels > 1) warnings.push(`Sample ${sample.name} is downmixed from ${sample.channels} channels to mono for S3M.`);
    if (sample.loopType === 'ping-pong') warnings.push(`Sample ${sample.name} ping-pong loop is exported as a forward loop for S3M.`);
    if (sample.tuningFormat !== 'XM' && (sample.rootNote !== 48 || sample.fineTune !== 0)) warnings.push(`Sample ${sample.name} root note or fine tune is not represented by the current S3M exporter.`);
    if (sample.sampleRate > 65535) warnings.push(`Sample ${sample.name} rate is clamped to S3M's 65,535 Hz C2 speed limit.`);
    const frames = raw.length / frameWidth;
    if (frames > 0xffff_ffff) throw new Error(`Sample ${sample.name} exceeds S3M's sample length limit.`);
    const output = new Uint8Array(Math.max(1, frames));
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    for (let frame = 0; frame < frames; frame += 1) {
      let value = 0;
      for (let channel = 0; channel < sample.channels; channel += 1) {
        const offset = frame * frameWidth + channel * bytesPerValue;
        value += sample.bitDepth === 16 ? view.getInt16(offset, true) : (raw[offset] & 0x80 ? raw[offset] - 0x100 : raw[offset]) * 256;
      }
      output[frame] = Math.max(-128, Math.min(127, Math.round(value / sample.channels / 256))) & 0xff;
    }
    return output;
  });
  cursor = Math.ceil(cursor / 16) * 16;
  const sampleOffsets = sampleData.map(data => { const offset = cursor; cursor = Math.ceil((cursor + data.length) / 16) * 16; return offset; });
  if (cursor > 0x1000000) throw new Error('S3M export exceeds the 24-bit sample pointer address space.');
  const bytes = new Uint8Array(cursor);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string, length: number) => {
    if ([...value].some(character => character.charCodeAt(0) > 0x7f)) warnings.push(`S3M text ${value} contains non-ASCII characters and was reduced.`);
    for (let index = 0; index < Math.min(value.length, length); index += 1) bytes[offset + index] = value.charCodeAt(index) & 0x7f;
  };
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value >>> 0, true);
  ascii(0, project.title, 28); bytes[28] = 0x1a; bytes[29] = 0x10;
  u16(32, orderIndexes.length); u16(34, slots.length); u16(36, patterns.length);
  u16(40, 0x1320); u16(42, 1); ascii(44, 'SCRM', 4);
  bytes[48] = 64; bytes[49] = Math.max(1, Math.min(255, project.ticksPerRow)); bytes[50] = Math.max(32, Math.min(255, project.tempoBpm)); bytes[51] = 0xc0;
  bytes[0x35] = 0xfc;
  bytes.fill(0xff, 64, 96);
  for (let channel = 0; channel < activeChannels; channel += 1) bytes[64 + channel] = channel;
  orderIndexes.forEach((index, offset) => { bytes[96 + offset] = index; });
  slots.forEach((_, index) => u16(96 + orderIndexes.length + index * 2, instrumentOffsets[index] / 16));
  patterns.forEach((_, index) => u16(96 + orderIndexes.length + slots.length * 2 + index * 2, patternOffsets[index] / 16));
  for (let channel = 0; channel < 32; channel += 1) {
    const pan = channel < channels.length ? normalizeTrackerPan(channels[channel].pan) : 0;
    const nibble = Math.max(0, Math.min(15, Math.round((pan + 1) * 7.5)));
    bytes[tableStart + channel] = channel < activeChannels ? 0x20 | nibble : 0;
  }
  slots.forEach((slot, index) => {
    const offset = instrumentOffsets[index];
    const sample = slot.sample;
    bytes[offset] = 1; ascii(offset + 1, slot.name, 12);
    const paragraph = sampleOffsets[index] / 16;
    bytes[offset + 0x0d] = (paragraph >>> 16) & 0xff;
    u16(offset + 0x0e, paragraph & 0xffff);
    u32(offset + 0x10, sampleData[index].length);
    const start = sample ? Math.max(0, Math.min(sampleData[index].length, sample.loopStart)) : 0;
    const end = sample ? Math.max(start, Math.min(sampleData[index].length, sample.loopEnd)) : 0;
    const looping = Boolean(sample && sample.loopType !== 'none' && end - start > 1);
    if (looping) bytes[offset + 0x1f] |= 1;
    u32(offset + 0x14, looping ? start : 0); u32(offset + 0x18, looping ? end : 0);
    bytes[offset + 0x1c] = sample ? Math.max(0, Math.min(64, Math.round(sample.volume * 64))) : 0;
    const c4Speed = sample?.tuningFormat === 'XM'
      ? Math.round(sample.sampleRate * 2 ** ((sample.rootNote - 48 + sample.fineTune / 128) / 12) * factoryS3mRateCorrection) : sample?.sampleRate ?? 8363;
    u32(offset + 0x20, Math.max(1, Math.min(65535, c4Speed)));
    ascii(offset + 0x30, slot.name, 28); ascii(offset + 0x4c, 'SCRS', 4);
    bytes.set(sampleData[index], sampleOffsets[index]);
  });
  packedPatterns.forEach((packed, index) => {
    const offset = patternOffsets[index];
    u16(offset, packed.length);
    bytes.set(packed, offset + 2);
  });
  return { target: 'S3M', moduleData: bytes.buffer, warnings: [...new Set(warnings)] };
}

type ItSlot = { instrumentId: string; sample: MusicCompositionDocument['samples'][number] | null; name: string };
type ItCell = { note: number; instrument: number; volume: number; effect: number; parameter: number };

const itEffectCommand = (command: string): number | null => {
  const match = /^IT:effect-([0-9a-f]{1,2})$/i.exec(command);
  return match ? Number.parseInt(match[1], 16) : null;
};

/** Writes canonical music as an IT 2.14 sample-mode module. */
export function exportMusicCompositionToIt(project: MusicCompositionDocument): MusicCompositionExport {
  if (!isMusicCompositionDocument(project)) throw new Error('Cannot export an invalid canonical music composition.');
  project = withPatternBoundaryCuts(project, 'IT');
  const warnings: string[] = [];
  const channels = [...project.channels].sort((a, b) => a.index - b.index);
  const instruments = [...project.instruments].sort((a, b) => a.index - b.index);
  const patterns = [...project.patterns].sort((a, b) => a.index - b.index);
  const activeChannels = Math.min(64, channels.length);
  if (channels.length > 64) warnings.push('IT exports only channels 1-64; upper-channel events remain in the canonical composition.');
  if (patterns.length < 1 || patterns.length > 200 || project.order.length < 1 || project.order.length > 254) {
    throw new Error('IT export requires one to 200 patterns and one to 254 order entries.');
  }
  if (channels.some((channel, index) => channel.index !== index) || instruments.some((instrument, index) => instrument.index !== index)
    || patterns.some((pattern, index) => pattern.index !== index)) throw new Error('IT export requires contiguous canonical indexes.');
  if (patterns.some(pattern => pattern.rows < 1 || pattern.rows > 256)) throw new Error('IT 2.14 export requires patterns of 1-256 rows.');
  const sampleById = new Map(project.samples.map(sample => [sample.id, sample]));
  const instrumentById = new Map(instruments.map(instrument => [instrument.id, instrument]));
  for (const instrument of instruments) {
    if (instrument.volumeEnvelope.enabled || instrument.panningEnvelope.enabled || instrument.fadeout > 0) {
      warnings.push(`Instrument ${instrument.name} envelopes and fadeout are not represented by this sample-mode IT exporter.`);
    }
  }
  const slots: ItSlot[] = [];
  const slotByKey = new Map<string, number>();
  const slotForNote = new Map<string, number>();
  for (const instrument of instruments) {
    const sampleIds = [...new Set([...instrument.sampleIds, ...instrument.noteMap.map(zone => zone.sampleId)])];
    const resolvedSampleIds = sampleIds.length ? sampleIds : [null];
    for (const sampleId of resolvedSampleIds) {
      const sample = sampleId ? sampleById.get(sampleId) ?? null : null;
      const key = `${instrument.id}:${sampleId ?? 'silent'}`;
      if (slotByKey.has(key)) continue;
      if (slots.length >= 255) throw new Error('IT sample-mode export supports at most 255 samples.');
      slots.push({ instrumentId: instrument.id, sample, name: sample?.name || instrument.name || `Sample ${slots.length + 1}` });
      slotByKey.set(key, slots.length);
    }
  }
  for (const pattern of patterns) for (const note of pattern.notes) {
    const instrument = instrumentById.get(note.instrumentId);
    if (!instrument) throw new Error(`Pattern ${pattern.name} contains an unresolved instrument reference.`);
    const mapped = instrument.noteMap.find(zone => note.pitch - 1 >= zone.low && note.pitch - 1 <= zone.high)?.sampleId;
    const sampleId = mapped ?? instrument.sampleIds[0] ?? null;
    const sample = sampleId ? sampleById.get(sampleId) ?? null : null;
    const key = `${instrument.id}:${sampleId ?? 'silent'}`;
    let slot = slotByKey.get(key);
    if (slot === undefined) {
      if (slots.length >= 255) throw new Error('IT sample-mode export supports at most 255 samples.');
      slot = slots.length + 1;
      slots.push({ instrumentId: instrument.id, sample, name: sample?.name || instrument.name || `Sample ${slot}` });
      slotByKey.set(key, slot);
    }
    slotForNote.set(note.id, slot);
  }
  const rowsPerPattern = patterns.map(pattern => pattern.rows);
  const grids: ItCell[][][] = patterns.map(pattern => Array.from({ length: pattern.rows }, () => Array.from({ length: activeChannels }, () => ({ note: 0, instrument: 0, volume: 255, effect: -1, parameter: 0 }))));
  const putEffect = (cell: ItCell, effect: number, parameter: number, patternName: string, label: string) => {
    if (cell.effect !== -1) { warnings.push(`Pattern ${patternName} has competing effects; ${label} was omitted.`); return; }
    cell.effect = effect; cell.parameter = parameter & 0xff;
  };
  for (const [patternIndex, pattern] of patterns.entries()) {
    const occupied = new Set<string>();
    for (const note of pattern.notes) {
      const channel = channels.findIndex(item => item.id === note.channelId);
      if (channel < 0) throw new Error(`Pattern ${pattern.name} contains an unresolved channel reference.`);
      if (channel >= activeChannels) continue;
      if (note.pitch < 1 || note.pitch > 96) throw new Error(`Note ${note.id} pitch is outside the canonical IT 1-96 range.`);
      const cell = grids[patternIndex][note.row][channel];
      const key = `${note.row}:${channel}`;
      if (occupied.has(key)) { warnings.push(`Pattern ${pattern.name} has multiple notes in row ${note.row + 1}, channel ${channel + 1}; note ${note.id} was omitted.`); continue; }
      occupied.add(key);
      cell.note = note.pitch - 1;
      cell.instrument = slotForNote.get(note.id) ?? 0;
      cell.volume = channels[channel].muted ? 0 : note.volumePresent === false && channels[channel].volume === 1
        ? 255
        : Math.max(0, Math.min(64, Math.round((note.volumePresent === false ? 1 : note.volume) * channels[channel].volume * 64)));
      const sample = slots[cell.instrument - 1]?.sample;
      const hasImportedPan = note.panMode === 'absolute' && hasPanEffectAt(pattern.commands, note.row, note.channelId, 'IT');
      const projectedPan = normalizeTrackerPan(hasImportedPan || note.panMode === 'absolute' ? note.pan : note.pan + channels[channel].pan + (sample?.panning ?? 0));
      const importedPan = hasImportedPan ? importedPanEffect(pattern.commands, note.row, note.channelId, 'IT', projectedPan) : null;
      const competingEffect = pattern.commands.some(command => command.row === note.row
        && command.channelId === note.channelId && /^IT:effect-/i.test(command.command))
        && !hasImportedPan;
      if (importedPan) putEffect(cell, importedPan.effect, importedPan.parameter, pattern.name, 'note panning');
      else if (!competingEffect && (note.panMode === 'absolute'
        ? Math.abs(note.pan - channels[channel].pan - (sample?.panning ?? 0)) > 1e-9
        : note.pan !== 0 || channels[channel].pan + (sample?.panning ?? 0) !== 0
          && !hasEarlierPanChange(pattern.commands, pattern.notes, note.row, note.channelId, 'IT'))) {
        const panCommand = encodeTrackerNotePan('IT', projectedPan);
        putEffect(cell, panCommand.effect, panCommand.parameter, pattern.name, 'note panning');
      } else if (Math.abs(note.pan) > 1e-9) {
        warnings.push(`Pattern ${pattern.name} row ${note.row + 1} channel ${channel + 1} has an IT effect command that takes precedence over note panning.`);
      }
      const releaseRow = note.row + note.durationRows;
      if (releaseRow < rowsPerPattern[patternIndex]) {
        const release = grids[patternIndex][releaseRow][channel];
        if (release.note || release.instrument || release.effect !== -1) warnings.push(`Pattern ${pattern.name} note-off at row ${releaseRow + 1}, channel ${channel + 1} conflicts with another event.`);
        else release.note = 255;
      }
    }
    for (const command of pattern.commands) {
      const channel = channels.findIndex(item => item.id === command.channelId);
      if (channel < 0) throw new Error(`Pattern ${pattern.name} contains an unresolved command channel.`);
      if (channel >= activeChannels) continue;
      const cell = grids[patternIndex][command.row][channel];
      const specialNote = command.command === 'IT:note-off' ? 255 : command.command === 'IT:note-cut' ? 254 : command.command === 'IT:note-fade' ? 246 : null;
      if (specialNote !== null) {
        if (cell.note || cell.instrument) warnings.push(`Pattern ${pattern.name} has competing note data; ${command.command} was omitted.`);
        else cell.note = specialNote;
      } else {
        const effect = itEffectCommand(command.command);
        if (effect === null) warnings.push(`Pattern ${pattern.name} command ${command.command} is not representable in IT and was omitted.`);
        else if (pattern.notes.some(note => note.row === command.row && note.channelId === command.channelId)
          && hasPanEffectAt([command], command.row, command.channelId, 'IT')) continue;
        else putEffect(cell, effect, command.parameter, pattern.name, command.command);
      }
    }
  }
  if (project.tempoBpm < 32 || project.tempoBpm > 255) warnings.push('IT tempo was clamped to its 32-255 BPM range.');
  const packedPatterns = grids.map((grid, patternIndex) => {
    const packed: number[] = [];
    for (const row of grid) {
      for (let channel = 0; channel < row.length; channel += 1) {
        const cell = row[channel];
        let mask = 0;
        if (cell.note !== 0 || cell.instrument) mask |= 1 | 2;
        if (cell.volume !== 255) mask |= 4;
        if (cell.effect !== -1) mask |= 8;
        if (!mask) continue;
        packed.push(0x80 | ((channel + 1) & 0x7f), mask);
        if (mask & 1) packed.push(cell.note);
        if (mask & 2) packed.push(cell.instrument);
        if (mask & 4) packed.push(cell.volume);
        if (mask & 8) packed.push(cell.effect, cell.parameter);
      }
      packed.push(0);
    }
    if (packed.length > 65535) throw new Error(`IT pattern ${patterns[patternIndex].name} exceeds the packed size limit.`);
    return packed;
  });
  const order = [...project.order].sort((a, b) => a.index - b.index);
  const patternById = new Map(patterns.map((pattern, index) => [pattern.id, index]));
  const orderIndexes = order.map(entry => {
    const index = patternById.get(entry.patternId);
    if (index === undefined || index >= 200) throw new Error(`Order entry ${entry.id} points to an IT-incompatible pattern.`);
    return index;
  });
  const itOrders = [...orderIndexes, 255];
  const tableEnd = 192 + itOrders.length + slots.length * 4 + patterns.length * 4;
  let cursor = Math.ceil(tableEnd / 4) * 4;
  const sampleHeaderOffsets = slots.map(() => { const offset = cursor; cursor += 80; return offset; });
  const samplePcm = slots.map(slot => {
    if (!slot.sample) { warnings.push(`Sample ${slot.name} has no PCM; IT exports a silent placeholder.`); return new Uint8Array([0]); }
    const sample = slot.sample;
    const source = bytesFromBase64(sample.pcmData);
    const unit = sample.bitDepth / 8;
    const frameWidth = unit * sample.channels;
    if (!source.length || source.length % frameWidth) throw new Error(`Sample ${sample.name} PCM length does not match its channel count and bit depth.`);
    if (sample.channels > 1) warnings.push(`Sample ${sample.name} is downmixed from ${sample.channels} channels to mono for IT.`);
    if (sample.loopType === 'ping-pong') warnings.push(`Sample ${sample.name} ping-pong loop uses IT's alternate-loop flag.`);
    if (sample.fineTune !== 0 && sample.tuningFormat !== 'XM') warnings.push(`Sample ${sample.name} fine tune is not represented by this IT sample-mode exporter.`);
    const frames = source.length / frameWidth;
    const output = new Uint8Array(frames * unit);
    if (sample.channels === 1) output.set(source);
    else {
      const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
      const outputView = new DataView(output.buffer);
      for (let frame = 0; frame < frames; frame += 1) {
        let value = 0;
        for (let channel = 0; channel < sample.channels; channel += 1) {
          const offset = frame * frameWidth + channel * unit;
          value += sample.bitDepth === 16 ? view.getInt16(offset, true) : (source[offset] & 0x80 ? source[offset] - 0x100 : source[offset]) * 256;
        }
        if (sample.bitDepth === 16) outputView.setInt16(frame * 2, Math.round(value / sample.channels), true);
        else output[frame] = Math.max(-128, Math.min(127, Math.round(value / sample.channels / 256))) & 0xff;
      }
    }
    return output;
  });
  cursor = Math.ceil(cursor / 4) * 4;
  const sampleDataOffsets = samplePcm.map(data => { const offset = cursor; cursor = Math.ceil((cursor + data.length) / 4) * 4; return offset; });
  cursor = Math.ceil(cursor / 4) * 4;
  const patternOffsets = packedPatterns.map(data => { const offset = cursor; cursor = Math.ceil((cursor + 8 + data.length) / 4) * 4; return offset; });
  const bytes = new Uint8Array(cursor);
  const view = new DataView(bytes.buffer);
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value >>> 0, true);
  const ascii = (offset: number, value: string, length: number) => {
    if ([...value].some(character => character.charCodeAt(0) > 0x7f)) warnings.push(`IT text ${value} contains non-ASCII characters and was reduced.`);
    for (let index = 0; index < Math.min(value.length, length); index += 1) bytes[offset + index] = value.charCodeAt(index) & 0x7f;
  };
  ascii(0, 'IMPM', 4); ascii(4, project.title, 26);
  u16(0x20, itOrders.length); u16(0x22, 0); u16(0x24, slots.length); u16(0x26, patterns.length);
  u16(0x28, 0x0214); u16(0x2a, 0x0214); u16(0x2c, 0x0003 | (project.itLinearSlides ? 0x0008 : 0));
  bytes[0x30] = 128; bytes[0x31] = 48;
  bytes[0x32] = Math.max(1, Math.min(255, project.ticksPerRow)); bytes[0x33] = Math.max(32, Math.min(255, project.tempoBpm)); bytes[0x34] = 128;
  bytes.fill(0xc0, 0x40, 0x80); bytes.fill(64, 0x80, 0xc0);
  for (let channel = 0; channel < activeChannels; channel += 1) {
    const pan = Math.max(0, Math.min(64, Math.round((normalizeTrackerPan(channels[channel].pan) + 1) * 32)));
    bytes[0x40 + channel] = pan;
  }
  bytes.set(itOrders, 192);
  const samplePointerTable = 192 + itOrders.length;
  const patternPointerTable = samplePointerTable + slots.length * 4;
  slots.forEach((_, index) => u32(samplePointerTable + index * 4, sampleHeaderOffsets[index]));
  patterns.forEach((_, index) => u32(patternPointerTable + index * 4, patternOffsets[index]));
  slots.forEach((slot, index) => {
    const offset = sampleHeaderOffsets[index]; const sample = slot.sample; const pcm = samplePcm[index];
    ascii(offset, 'IMPS', 4); ascii(offset + 4, slot.name, 12);
    const maxmodSampleGlobalVolume = sample?.maxmodSampleGlobalVolume ?? 64;
    const maxmodInstrumentGlobalVolume = sample?.maxmodInstrumentGlobalVolume ?? 128;
    const effectiveMaxmodGlobalVolume = (maxmodSampleGlobalVolume * maxmodInstrumentGlobalVolume) / 128;
    bytes[offset + 0x11] = Math.max(0, Math.min(64, Math.round(effectiveMaxmodGlobalVolume)));
    if (Math.abs(bytes[offset + 0x11] - effectiveMaxmodGlobalVolume) > 1e-9) {
      warnings.push(`Sample ${slot.name} IT sample-mode global volume combines the Maxmod sample and instrument globals and is quantized to 1/64.`);
    }
    let flags = 1;
    if (sample?.bitDepth === 16) flags |= 2;
    const loopStart = sample ? Math.max(0, Math.min(pcm.length / (sample.bitDepth / 8), sample.loopStart)) : 0;
    const loopEnd = sample ? Math.max(loopStart, Math.min(pcm.length / (sample.bitDepth / 8), sample.loopEnd)) : 0;
    const looping = Boolean(sample && sample.loopType !== 'none' && loopEnd - loopStart > 1);
    if (looping) flags |= 0x10;
    if (looping && sample?.loopType === 'ping-pong') flags |= 0x40;
    bytes[offset + 0x12] = flags;
    bytes[offset + 0x13] = sample ? Math.max(0, Math.min(64, Math.round(sample.volume * 64))) : 0;
    ascii(offset + 0x14, slot.name, 26);
    bytes[offset + 0x2e] = 1;
    const samplePan = sample ? Math.max(0, Math.min(64, Math.round((normalizeTrackerPan(sample.panning) + 1) * 32))) : 32;
    bytes[offset + 0x2f] = 0x80 | samplePan;
    u32(offset + 0x30, pcm.length / (sample?.bitDepth === 16 ? 2 : 1));
    u32(offset + 0x34, looping ? loopStart : 0); u32(offset + 0x38, looping ? loopEnd : 0);
    // Canonical pitches are one-based; raw IT note 60 (C5) is canonical pitch 61.
    const c5Speed = sample ? Math.round(sample.sampleRate * 2 ** ((sample.tuningFormat === 'XM'
      ? 12 + sample.rootNote - 48 + sample.fineTune / 128 : 61 - sample.rootNote) / 12)) : 8363;
    if (c5Speed > 9_999_999) warnings.push(`Sample ${slot.name} C5 speed is clamped to IT's 9,999,999 Hz limit.`);
    u32(offset + 0x3c, Math.max(1, Math.min(9_999_999, c5Speed)));
    u32(offset + 0x48, sampleDataOffsets[index]);
    bytes.set(pcm, sampleDataOffsets[index]);
  });
  packedPatterns.forEach((packed, index) => {
    const offset = patternOffsets[index];
    u16(offset, packed.length); u16(offset + 2, rowsPerPattern[index]);
    bytes.set(packed, offset + 8);
  });
  return { target: 'IT', moduleData: bytes.buffer, warnings: [...new Set(warnings)] };
}

export function exportMusicComposition(project: MusicCompositionDocument, target: MusicExportTarget): MusicCompositionExport {
  if (target === 'XM') return exportMusicCompositionToXm(project);
  if (target === 'MOD') return exportMusicCompositionToMod(project);
  if (target === 'S3M') return exportMusicCompositionToS3m(project);
  if (target === 'IT') return exportMusicCompositionToIt(project);
  throw new Error(`${target} export is not implemented yet.`);
}
