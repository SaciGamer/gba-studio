import { createMusicCompositionFromImportedModule, ImportedCompositionData, MusicCompositionDocument } from './trackerComposition';
import { parseModModule } from './modPlayer';
import {
  getMusicModuleFingerprint, parseItPatternRows, parseItSamples, parseS3mPatternRows, parseS3mSamples,
  parseTrackerCompatibilityWarnings, parseTrackerModule, parseTrackerOrderTable, parseXmPatternRows, parseXmSamples, TrackerSample,
} from './trackerModule';
import { trackerPeriodToPitch } from './trackerPianoRollModel';

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(binary);
};

/** Normalizes the shared, editable portion of an imported module and preserves its original bytes in the composition. */
export function importTrackerModuleComposition(bytes: ArrayBuffer, fileName: string, originalBytes: ArrayBuffer = bytes, existingComposition?: MusicCompositionDocument, channelMixer?: ImportedCompositionData['channelMixer']) {
  const info = parseTrackerModule(bytes, fileName.split('.').pop() ?? '');
  if (!['MOD', 'XM', 'S3M', 'IT'].includes(info.format)) throw new Error('The selected file is not a supported tracker module.');
  const format = info.format as ImportedCompositionData['format'];
  const samples = format === 'XM' ? parseXmSamples(bytes) : format === 'S3M' ? parseS3mSamples(bytes) : format === 'IT' ? parseItSamples(bytes) : new Map();
  const mod = format === 'MOD' ? parseModModule(bytes) : null;
  if (format === 'MOD' && !mod) throw new Error('The MOD structure is invalid.');
  const instrumentCount = format === 'MOD' ? mod!.samples.length : format === 'IT' && info.instruments === 0 ? (info.sampleCount ?? 0) : info.instruments;
  const instruments: ImportedCompositionData['instruments'] = [];
  for (let index = 1; index <= instrumentCount; index += 1) {
    let sample = samples.get(index);
    let name = sample?.instrumentName || sample?.name || `Instrument ${String(index).padStart(2, '0')}`;
    if (format === 'IT' && sample?.variants?.length && sample.noteTranspose?.length) {
      const variants: TrackerSample[] = [];
      const variantIndexes = new Map<string, number>();
      const noteMap = Array.from({ length: 96 }, (_, note) => {
        const sourceIndex = Math.max(0, Math.min(sample!.variants!.length - 1, sample!.noteMap?.[note] ?? 0));
        const transpose = sample!.noteTranspose?.[note] ?? 0;
        const key = `${sourceIndex}:${transpose}`;
        let variantIndex = variantIndexes.get(key);
        if (variantIndex === undefined) {
          const source = sample!.variants![sourceIndex];
          variantIndex = variants.length;
          variantIndexes.set(key, variantIndex);
          variants.push({ ...source, rootNote: Math.max(0, Math.min(127, source.rootNote - transpose)) });
        }
        return variantIndex;
      });
      sample = { ...sample, variants, noteMap };
    }
    if (format === 'MOD' && mod) {
      const source = mod.samples[index - 1];
      const pcm = new Float32Array(Math.min(source?.length ?? 0, Math.max(0, mod.bytes.length - (source?.dataOffset ?? mod.bytes.length))));
      for (let frame = 0; frame < pcm.length; frame += 1) pcm[frame] = ((mod.bytes[(source?.dataOffset ?? 0) + frame] << 24) >> 24) / 128;
      sample = {
        samples: pcm, sampleRate: 8363, loopStart: source?.loopStart ?? 0,
        loopEnd: source ? source.loopStart + source.loopLength : 0, loopType: source && source.loopLength > 2 ? 1 : 0, rootNote: 48,
        fineTune: (source?.finetune ?? 0) * 16, name: source?.name, sixteenBit: false, volume: source?.volume ?? 64,
      };
      name = source?.name || name;
    }
    instruments.push({ index, name, sample });
  }
  let patterns: ImportedCompositionData['patterns'] = [];
  for (let pattern = 0; pattern < info.patterns && pattern < 256; pattern += 1) {
    const rows = format === 'MOD'
      ? (mod?.patterns[pattern] ?? []).map(row => row.map(event => ({ note: event.period ? trackerPeriodToPitch(event.period) : event.effect === 14 && (event.parameter >> 4) === 12 ? 97 : 0, instrument: event.sample, volume: 0, effect: event.effect, parameter: event.parameter })))
      : format === 'XM' ? parseXmPatternRows(bytes, pattern, 256)
        : format === 'S3M' ? parseS3mPatternRows(bytes, pattern, 64)
          : parseItPatternRows(bytes, pattern, 256);
    const patternRows = Math.max(1, rows.length);
    const events = rows.flatMap((row, rowIndex) => row.flatMap((event, channel) => {
      if (!event || (!event.note && !event.instrument && !event.volumePresent && !event.effect && !event.parameter)) return [];
      let note = event.note;
      if (format === 'IT' && event.notePresent) {
        note = event.note < 96 ? event.note + 1
          : event.note <= 119 ? 100 + event.note - 96
          : event.note === 255 ? 97
            : event.note === 254 ? 98
              : event.note >= 120 && event.note <= 252 ? 99 : 0;
      } else if (format === 'S3M' && event.notePresent) {
        const semitone = event.note & 0x0f;
        const pitch = ((event.note >> 4) * 12) + semitone + 1;
        note = event.note === 254 ? 97
          : event.note === 255 ? 0
            : event.note < 0xf0 && semitone < 12 ? pitch <= 96 ? pitch : 100 + pitch - 97 : 0;
      }
      return [{ row: rowIndex, channel, note, instrument: event.instrument, instrumentPresent: event.instrumentPresent, volume: event.volume, volumePresent: event.volumePresent, effect: event.effect, parameter: event.parameter }];
    }));
    patterns.push({ rows: patternRows, events });
  }
  const rawOrder = format === 'MOD' && mod ? mod.patternTable.slice(0, mod.orders) : parseTrackerOrderTable(bytes, format);
  let order = format === 'S3M' || format === 'IT' ? rawOrder.filter(pattern => pattern < patterns.length) : rawOrder;
  let instrumentMemoryContextTruncated = false;
  if ((format === 'MOD' || format === 'XM' || format === 'IT') && order.length) {
    const sourcePatterns = patterns;
    const contextualPatterns = sourcePatterns.slice();
    const instrumentMemory = Array.from({ length: 64 }, () => 0);
    const contextVariants = new Map<string, { patternIndex: number; outgoingMemory: number[] }>();
    const firstVariantForSourcePattern = new Set<number>();
    const contextualOrder: number[] = [];
    for (const sourcePatternIndex of order) {
      const sourcePattern = sourcePatterns[sourcePatternIndex];
      if (!sourcePattern) continue;
      const incomingMemory = instrumentMemory.slice();
      const contextKey = `${sourcePatternIndex}:${incomingMemory.join(',')}`;
      const previousVariant = contextVariants.get(contextKey);
      if (previousVariant) {
        instrumentMemory.splice(0, instrumentMemory.length, ...previousVariant.outgoingMemory);
        contextualOrder.push(previousVariant.patternIndex);
        continue;
      }

      const outgoingMemory = incomingMemory.slice();
      const events = sourcePattern.events.map(event => {
        const hasInstrument = format === 'MOD' || format === 'XM' ? event.instrument > 0 : event.instrumentPresent === true;
        const updatesInstrumentMemory = format === 'MOD' || (format === 'XM' ? event.note !== 97 : event.note < 97 || event.note > 99);
        if (hasInstrument && updatesInstrumentMemory) outgoingMemory[event.channel] = event.instrument;
        const noteInstrument = event.note >= 1 && event.note <= 96
          ? hasInstrument ? event.instrument : outgoingMemory[event.channel]
          : event.instrument;
        return { ...event, instrument: noteInstrument };
      });
      let contextualPatternIndex = sourcePatternIndex;
      if (firstVariantForSourcePattern.has(sourcePatternIndex)) {
        if (contextualPatterns.length >= 256) {
          instrumentMemoryContextTruncated = true;
          contextualOrder.push(sourcePatternIndex);
          instrumentMemory.splice(0, instrumentMemory.length, ...outgoingMemory);
          continue;
        }
        contextualPatternIndex = contextualPatterns.length;
        contextualPatterns.push({ rows: sourcePattern.rows, events });
      } else {
        firstVariantForSourcePattern.add(sourcePatternIndex);
        contextualPatterns[sourcePatternIndex] = { rows: sourcePattern.rows, events };
      }
      contextVariants.set(contextKey, { patternIndex: contextualPatternIndex, outgoingMemory: outgoingMemory.slice() });
      instrumentMemory.splice(0, instrumentMemory.length, ...outgoingMemory);
      contextualOrder.push(contextualPatternIndex);
    }
    patterns = contextualPatterns;
    order = contextualOrder;
  }
  const raw = new Uint8Array(originalBytes);
  const sourceWarnings = parseTrackerCompatibilityWarnings(bytes, format);
  if (instrumentMemoryContextTruncated) sourceWarnings.push(`The ${format} order requires more than 256 context-specific patterns to preserve carried instruments; the immutable source module retains the exact playback data.`);
  if (patterns.some(pattern => pattern.events.some(event => event.note >= 100 && event.note <= 123))) {
    sourceWarnings.push('Some notes above the canonical 96-note editor range are preserved only in the immutable source module.');
  }
  if ([...samples.values()].some(sample => sample.stereo)) sourceWarnings.push('Stereo source samples are represented as mono in the editable composition; the exact stereo module remains preserved in sourceModules.');
  if (info.patterns > 256) sourceWarnings.push('Only the first 256 patterns are normalized for editing; the exact module remains preserved in sourceModules.');
  return createMusicCompositionFromImportedModule({
    format,
    itLinearSlides: format === 'IT' && bytes.byteLength > 0x2c && (new Uint8Array(bytes)[0x2c] & 0x08) !== 0,
    title: info.title, tempoBpm: info.tempo ?? 125, ticksPerRow: info.speed ?? 6,
    channels: info.channels, channelPans: info.channelPans, patterns, order, instruments, existingComposition, channelMixer,
    sourceModule: {
      fileName, fingerprint: getMusicModuleFingerprint(originalBytes), parserVersion: 'gba-studio-tracker-parser/1',
      moduleData: encodeBase64(raw), warnings: sourceWarnings,
    },
  });
}
