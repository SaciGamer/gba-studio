import { _electron as electron, expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { TextDecoder } from 'node:util';
import vm from 'node:vm';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { detectPulsedToneMarkers, fitScheduledMarkerClock, selectExpectedMarkerPair } from '../helpers/mod-sync-marker.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const electronEntryPoint = path.join(repositoryRoot, 'dist', 'main', 'main.js');
const fixtureRoot = path.join(repositoryRoot, '.tmp');
const screenshotDirectory = path.join(repositoryRoot, 'test-results');
const screenshotPath = path.join(screenshotDirectory, `music-editor-${process.pid}.png`);
let trackerModuleTools;
let modPlayerTools;
const loadModPlayerTools = async () => {
  if (modPlayerTools) return modPlayerTools;
  const source = fs.readFileSync(path.join(repositoryRoot, 'src', 'renderer', 'frontend', 'src', 'utils', 'modPlayer.ts'), 'utf8');
  modPlayerTools = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: modPlayerTools, TextDecoder });
  return modPlayerTools;
};
const loadTrackerModuleTools = async () => {
  if (trackerModuleTools) return trackerModuleTools;
  const moduleSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'renderer', 'frontend', 'src', 'utils', 'trackerModule.ts'), 'utf8');
  const templateSource = fs.readFileSync(path.join(repositoryRoot, 'src', 'renderer', 'frontend', 'src', 'utils', 'xmBeatTemplate.ts'), 'utf8');
  const compilerOptions = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 };
  const templateExports = {};
  vm.runInNewContext(ts.transpileModule(templateSource, { compilerOptions }).outputText, { exports: templateExports, TextDecoder });
  const moduleExports = {};
  vm.runInNewContext(ts.transpileModule(moduleSource, { compilerOptions }).outputText, { exports: moduleExports, require: () => templateExports, TextDecoder });
  moduleExports.createXmBeatTemplateWithInstruments = templateExports.createXmBeatTemplateWithInstruments;
  trackerModuleTools = moduleExports;
  return trackerModuleTools;
};
const expectPatternRowsPreserved = (actualRows, originalRows, format) => {
  expect(actualRows).toHaveLength(originalRows.length);
  const defaultPanEffect = format === 'XM' ? 8 : format === 'S3M' ? 19 : format === 'IT' ? 24 : -1;
  for (let row = 0; row < originalRows.length; row += 1) {
    expect(actualRows[row]).toHaveLength(originalRows[row].length);
    for (let channel = 0; channel < originalRows[row].length; channel += 1) {
      const expected = originalRows[row][channel];
      const actual = { ...actualRows[row][channel] };
      if (expected.effect === 0 && expected.parameter === 0 && actual.effect === defaultPanEffect && actual.parameter === 128) {
        actual.effect = 0;
        actual.parameter = 0;
      }
      if (expected.volumePresent === false && actual.volumePresent === true && actual.volume === 64) {
        actual.volume = expected.volume;
        actual.volumePresent = false;
      }
      if (format === 'IT' && expected.volume === 0 && actual.volume === 64) actual.volume = 0;
      expect(actual).toEqual(expected);
    }
  }
};
const exportCompositionModuleData = async (page, composition) => page.evaluate(async source => {
  const { exportMusicComposition } = await import('/src/utils/trackerCompositionExport.ts');
  const bytes = new Uint8Array(exportMusicComposition(source, source.targetFormat).moduleData);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(binary);
}, composition);
const expectTrackerMixerAtFullVolume = async page => {
  const mixers = await page.evaluate(() => Object.keys(localStorage)
    .filter(key => key.startsWith('gba-studio-tracker-mixer:'))
    .map(key => JSON.parse(localStorage.getItem(key) || '{}')));
  expect(mixers.length, 'The tracker preview should have persisted its active mixer.').toBeGreaterThan(0);
  for (const mixer of mixers) {
    expect(mixer.muted?.every(value => value === false), 'Every browser preview channel should be unmuted for parity tests.').toBe(true);
    expect(mixer.volumes?.every(value => value === 1), 'Every browser preview channel should be at 100% for parity tests.').toBe(true);
  }
};

const samplePeriodicity = sample => {
  const values = sample.samples;
  const count = Math.min(values.length, 4096);
  const minLag = Math.max(2, Math.floor(sample.sampleRate / 1800));
  const maxLag = Math.min(Math.floor(sample.sampleRate / 80), Math.floor(count / 2));
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let cross = 0;
    let left = 0;
    let right = 0;
    for (let index = 0; index < count - lag; index += 1) {
      const a = values[index];
      const b = values[index + lag];
      cross += a * b;
      left += a * a;
      right += b * b;
    }
    best = Math.max(best, cross / Math.sqrt(Math.max(1e-20, left * right)));
  }
  return best;
};








const measureWindowedSpectralBands = (samples, sampleRate, boundaries = [0, 500, 1_000, 2_000, 4_000, 8_000, 12_000, 18_000, 24_000]) => {
  let fftSize = 1;
  const maximumSize = Math.min(4_096, samples.length);
  while (fftSize * 2 <= maximumSize) fftSize *= 2;
  if (fftSize < 16) return { fftSize, bands: [] };
  const real = new Float64Array(fftSize);
  const imaginary = new Float64Array(fftSize);
  let mean = 0;
  for (let index = 0; index < fftSize; index += 1) mean += samples[index];
  mean /= fftSize;
  let windowPower = 0;
  for (let index = 0; index < fftSize; index += 1) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (fftSize - 1));
    real[index] = (samples[index] - mean) * window;
    windowPower += window * window;
  }
  for (let index = 1, reversed = 0; index < fftSize; index += 1) {
    let bit = fftSize >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let size = 2; size <= fftSize; size <<= 1) {
    const half = size >> 1;
    const angle = -2 * Math.PI / size;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let base = 0; base < fftSize; base += size) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      for (let offset = 0; offset < half; offset += 1) {
        const even = base + offset;
        const odd = even + half;
        const productReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const productImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - productReal;
        imaginary[odd] = imaginary[even] - productImaginary;
        real[even] += productReal;
        imaginary[even] += productImaginary;
        const nextTwiddleReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextTwiddleReal;
      }
    }
  }
  const bandPower = Array.from({ length: boundaries.length - 1 }, () => 0);
  for (let bin = 1; bin < fftSize / 2; bin += 1) {
    const frequency = bin * sampleRate / fftSize;
    const band = boundaries.findIndex((boundary, index) => index < boundaries.length - 1 && frequency >= boundary && frequency < boundaries[index + 1]);
    if (band >= 0) bandPower[band] += real[bin] * real[bin] + imaginary[bin] * imaginary[bin];
  }
  const totalPower = bandPower.reduce((sum, value) => sum + value, 0);
  return {
    fftSize,
    bands: bandPower.map((power, index) => ({
      lowHz: boundaries[index],
      highHz: boundaries[index + 1],
      rms: Math.sqrt(power / Math.max(1, fftSize * windowPower)),
      energyFraction: power / Math.max(1e-30, totalPower),
    })),
  };
};






const createIsolatedModuleStem = async (sourceBytes, format, { preferredInstrument, preferredEffectParameter } = {}) => {
  const tracker = await loadTrackerModuleTools();
  const original = Buffer.from(sourceBytes);
  const originalArrayBuffer = original.buffer.slice(original.byteOffset, original.byteOffset + original.byteLength);
  const info = tracker.parseTrackerModule(originalArrayBuffer, format);
  const orders = tracker.parseTrackerOrderTable(originalArrayBuffer, format);
  const samples = format === 'XM' ? tracker.parseXmSamples(originalArrayBuffer)
    : format === 'S3M' ? tracker.parseS3mSamples(originalArrayBuffer)
      : tracker.parseItSamples(originalArrayBuffer);
  const parseRows = format === 'XM' ? tracker.parseXmPatternRows
    : format === 'S3M' ? tracker.parseS3mPatternRows
      : tracker.parseItPatternRows;
  const updateRows = format === 'XM' ? tracker.updateXmPatternEvents
    : format === 'S3M' ? tracker.updateS3mPatternEvents
      : tracker.updateItPatternEvents;
  let selectedPattern = -1;
  let selectedChannel = -1;
  let markerEvent = null;
  let selectedRows = null;
  let selectedSampleLength = 0;
  let selectedSampleScore = -1;
  let selectedRootDistance = Number.POSITIVE_INFINITY;
  for (const patternIndex of orders) {
    if (patternIndex >= info.patterns) continue;
    const rows = parseRows(originalArrayBuffer, patternIndex, 256);
    if (rows.length < 60) continue;
    for (let row = 0; row < rows.length; row += 1) {
      for (let channel = 0; channel < (rows[row]?.length ?? 0); channel += 1) {
        const event = rows[row][channel];
        const playableNote = format === 'XM' ? event.note >= 1 && event.note <= 96
          : format === 'S3M' ? event.note > 0 && event.note < 0xf0
            : event.note >= 1 && event.note <= 120;
        const sample = samples.get(event.instrument);
        const hasPcm = sample?.samples?.length || sample?.variants?.some(variant => variant.samples.length);
        if (playableNote && event.instrument > 0 && hasPcm
          && (format !== 'XM' || preferredInstrument === undefined || event.instrument === preferredInstrument)
          && (format !== 'XM' || preferredEffectParameter === undefined
            || event.effect === 0 && event.parameter === preferredEffectParameter)) {
          const mappedIndex = format === 'XM' ? sample?.noteMap?.[event.note - 1] ?? 0 : 0;
          const mappedSample = sample?.variants?.[mappedIndex] ?? sample;
          const pcmLength = mappedSample?.samples?.length ?? sample?.samples?.length ?? 0;
          const periodicity = format === 'XM' ? samplePeriodicity(mappedSample) : 0;
          const rootDistance = format === 'XM' ? Math.abs(event.note - (mappedSample?.rootNote ?? 49)) : 0;
          const isBetterXmSample = format === 'XM' && (preferredInstrument !== undefined
            ? selectedPattern < 0
            : pcmLength >= Math.max(512, Math.floor((mappedSample?.sampleRate ?? 8363) * 0.2))
              && (periodicity > selectedSampleScore + 0.001
                || (Math.abs(periodicity - selectedSampleScore) <= 0.001 && rootDistance < selectedRootDistance)));
          if (format !== 'XM' || isBetterXmSample) {
            selectedPattern = patternIndex;
            selectedChannel = channel;
            markerEvent = event;
            selectedRows = rows;
            selectedSampleLength = pcmLength;
            if (format === 'XM') {
              selectedSampleScore = periodicity;
              selectedRootDistance = rootDistance;
            }
          }
          if (format !== 'XM') break;
        }
      }
      if (markerEvent && format !== 'XM') break;
    }
    if (markerEvent && format !== 'XM') break;
  }
  if (selectedPattern < 0 || !markerEvent || !selectedRows) throw new Error(`No playable sample event found in real ${format} module.`);
  const pulseRows = Array.from({ length: 8 }, (_, index) => index * 8);
  const cutRows = pulseRows.map(row => row + 2);
  const loopRow = selectedRows.length - 1;
  if (format === 'XM') {
    const instrument = samples.get(markerEvent.instrument);
    const noteIndex = Math.max(0, Math.min(95, markerEvent.note - 1));
    const variantIndex = instrument?.noteMap?.[noteIndex] ?? 0;
    const sample = instrument?.variants?.[variantIndex] ?? instrument;
    if (!sample?.samples?.length) throw new Error('The selected real XM note has no mapped PCM sample.');
    const sixteenBit = sample.sixteenBit === true;
    const scale = sixteenBit ? 32768 : 128;
    const sampleFrames = sample.loopType === 1 || sample.loopType === 2
      ? sample.samples.length
      : Math.min(sample.samples.length, Math.max(512, Math.floor(sample.sampleRate * 0.2)));
    const loopStart = Math.min(sampleFrames, sample.loopStart ?? 0);
    const loopEnd = Math.min(sampleFrames, sample.loopEnd ?? 0);
    const sampleLoopType = (sample.loopType === 1 || sample.loopType === 2) && loopEnd > loopStart ? sample.loopType : 0;
    const encodedPcm = new Uint8Array(sampleFrames * (sixteenBit ? 2 : 1));
    let previous = 0;
    for (let frame = 0; frame < sampleFrames; frame += 1) {
      const current = Math.max(-scale, Math.min(scale - 1, Math.round(sample.samples[frame] * scale)));
      const delta = current - previous;
      if (sixteenBit) {
        encodedPcm[frame * 2] = delta & 0xff;
        encodedPcm[frame * 2 + 1] = (delta >> 8) & 0xff;
      } else encodedPcm[frame] = delta & 0xff;
      previous = current;
    }
    let cleanXm = tracker.createXmBeatTemplateWithInstruments('Isolated real XM sample', [{
      name: `Instrument ${markerEvent.instrument}`,
      noteMap: Array(96).fill(0),
      samples: [{
        deltaEncodedPcm: encodedPcm,
        sixteenBit,
        loopType: sampleLoopType,
        loopStart: sampleLoopType ? loopStart : 0,
        loopEnd: sampleLoopType ? loopEnd : 0,
        rootNote: sample.rootNote,
        fineTune: sample.fineTune,
        panning: sample.panning,
        name: sample.name,
        volume: sample.volume,
      }],
    }]);
    const cleanXmBytes = new Uint8Array(cleanXm);
    const cleanXmView = new DataView(cleanXmBytes.buffer, cleanXmBytes.byteOffset, cleanXmBytes.byteLength);
    const cleanInstrumentOffset = 60 + cleanXmView.getUint32(60, true) + 9;
    const volumeEnvelope = instrument?.volumeEnvelope;
    if (volumeEnvelope) {
      const points = volumeEnvelope.points.slice(0, 12);
      cleanXmBytes[cleanInstrumentOffset + 225] = points.length;
      for (const [index, point] of points.entries()) {
        cleanXmView.setUint16(cleanInstrumentOffset + 129 + index * 4, point.tick, true);
        cleanXmView.setUint16(cleanInstrumentOffset + 131 + index * 4, point.value, true);
      }
      cleanXmBytes[cleanInstrumentOffset + 227] = volumeEnvelope.sustain ?? 0;
      cleanXmBytes[cleanInstrumentOffset + 228] = volumeEnvelope.loopStart ?? 0;
      cleanXmBytes[cleanInstrumentOffset + 229] = volumeEnvelope.loopEnd ?? 0;
      cleanXmBytes[cleanInstrumentOffset + 233] = (volumeEnvelope.enabled ? 1 : 0)
        | (volumeEnvelope.sustainEnabled ? 2 : 0)
        | (volumeEnvelope.loopEnabled ? 4 : 0);
      cleanXmView.setUint16(cleanInstrumentOffset + 239, instrument?.fadeout ?? 0, true);
    }
    const stemEvents = [];
    for (let row = 0; row < 64; row += 1) {
      const patch = row % 8 === 0
        ? { note: markerEvent.note, instrument: 1, volume: 0x50, effect: markerEvent.effect, parameter: markerEvent.parameter }
        : row % 8 === 2 ? { note: 0, instrument: 0, volume: 0, effect: 0x0e, parameter: 0xc0 }
          : row === 63 ? { note: 0, instrument: 0, volume: 0, effect: 0x0b, parameter: 0 }
            : { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      stemEvents.push({ row, channel: 0, patch });
    }
    const cleanArrayBuffer = cleanXm;
    cleanXm = tracker.updateXmPatternEvents(cleanArrayBuffer, 0, stemEvents);
    const cleanBytes = Buffer.from(new Uint8Array(cleanXm));
    const info = tracker.parseTrackerModule(cleanXm, 'XM');
    const sampleRms = Math.sqrt(sample.samples.reduce((sum, value) => sum + value * value, 0) / sample.samples.length);
    const originalInstrument = instrument;
    return { bytes: cleanBytes, marker: { pattern: 0, channel: 0, note: markerEvent.note, instrument: 1, originalInstrument: markerEvent.instrument, effect: markerEvent.effect, parameter: markerEvent.parameter, pulseRows, cutRows, loopRow: 63, sampleRootNote: sample.rootNote, fineTune: sample.fineTune, sampleFrames, sixteenBit, sampleVolume: sample.volume, samplePanning: sample.panning, sampleLoopType, sampleLoopStart: sampleLoopType ? loopStart : 0, sampleLoopEnd: sampleLoopType ? loopEnd : 0, samplePeak: Math.max(...sample.samples.map(Math.abs)), sampleRms, volumeEnvelope: originalInstrument?.volumeEnvelope, panningEnvelope: originalInstrument?.panningEnvelope, globalVolume: info.globalVolume, expectedIntervalSeconds: (2.5 * (info.speed ?? 6) / (info.tempo ?? 125)) * 8 } };
  }
  const updates = [];
  for (let row = 0; row < selectedRows.length; row += 1) {
    for (let channel = 0; channel < selectedRows[row].length; channel += 1) {
      const patch = { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      if (format === 'IT') patch.volumePresent = false;
      if (channel === selectedChannel && pulseRows.includes(row)) {
        Object.assign(patch, { note: markerEvent.note, instrument: markerEvent.instrument });
        if (markerEvent.volume > 0 || markerEvent.volumePresent) {
          patch.volume = markerEvent.volume;
          if (format === 'IT') patch.volumePresent = true;
        }
      } else if (channel === selectedChannel && cutRows.includes(row)) {
        Object.assign(patch, { effect: format === 'XM' ? 0x0e : 19, parameter: 0xc0 });
      } else if (channel === selectedChannel && row === loopRow && format !== 'IT') {
        Object.assign(patch, { effect: format === 'XM' ? 0x0b : 2, parameter: 0 });
      }
      updates.push({ row, channel, patch });
    }
  }
  const updatedArrayBuffer = updateRows(originalArrayBuffer, selectedPattern, updates);
  const result = Buffer.from(new Uint8Array(updatedArrayBuffer));
  const orderCount = format === 'XM' ? original.readUInt16LE(64)
    : format === 'S3M' ? original.readUInt16LE(32)
      : original.readUInt16LE(0x20);
  const orderOffset = format === 'XM' ? 80 : format === 'S3M' ? 96 : 192;
  if (format === 'XM') {
    // Keep the XM order list minimal and deterministic: Maxmod and the editor
    // both start at order 0, which loops through the explicit B00 at row 63.
    result.writeUInt16LE(1, 64);
    result.writeUInt16LE(0, 66);
    result[80] = selectedPattern;
  } else if (format === 'IT') {
    result[orderOffset] = selectedPattern;
    result.fill(255, orderOffset + 1, orderOffset + orderCount);
  } else {
    result.fill(selectedPattern, orderOffset, orderOffset + orderCount);
  }
  const effectiveSpeed = format === 'IT' && markerEvent.effect === 1 && markerEvent.parameter > 0 ? markerEvent.parameter : info.speed ?? 6;
  return { bytes: result, marker: { pattern: selectedPattern, channel: selectedChannel, note: markerEvent.note, instrument: markerEvent.instrument, pulseRows, cutRows, loopRow, expectedIntervalSeconds: (2.5 * effectiveSpeed / (info.tempo ?? 125)) * 8 } };
};

const maxmodPreviewSuccessText = /The ROM preview is running\.|A prévia da ROM está em execução\.|La vista previa de la ROM está en ejecución\.|L’aperçu ROM est en cours\./;
const maxmodPreviewFailureText = /Unable to build the ROM preview\.|Não foi possível gerar a prévia da ROM\.|No se pudo generar la vista previa de la ROM\.|Impossible de générer l’aperçu ROM\./;
const maxmodPreviewStatusText = /The ROM preview is running\.|A prévia da ROM está em execução\.|La vista previa de la ROM está en ejecución\.|L’aperçu ROM est en cours\.|Unable to build the ROM preview\.|Não foi possível gerar a prévia da ROM\.|No se pudo generar la vista previa de la ROM\.|Impossible de générer l’aperçu ROM\./;

const waitForMaxmodPreviewStatus = async (editor, timeout = 45_000) => {
  await expect.poll(() => editor.innerText(), { timeout }).toMatch(maxmodPreviewStatusText);
  const status = await editor.innerText();
  if (maxmodPreviewFailureText.test(status)) {
    throw new Error(`Maxmod preview failed: ${status}`);
  }
  expect(status).toMatch(maxmodPreviewSuccessText);
};

const createWavFixture = () => {
  const sampleRate = 22_050;
  // Leave a clear gap between tracker notes so audio onset timing can be
  // measured independently from the scheduled row interval.
  const sampleCount = Math.floor(sampleRate / 8);
  const wav = Buffer.alloc(44 + sampleCount * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(sampleCount * 2, 40);
  for (let index = 0; index < sampleCount; index += 1) wav.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * index) / sampleRate) * 9_000), 44 + index * 2);
  return wav;
};

const createModFixture = () => {
  const sampleOffset = 1084 + 64 * 4 * 4;
  const bytes = Buffer.alloc(sampleOffset + 8);
  bytes.write('M.K.', 1080);
  bytes.write('Fixture sample', 20);
  bytes[44] = 0x0f;
  bytes.writeUInt16BE(4, 42);
  bytes[45] = 32;
  bytes.writeUInt16BE(2, 48);
  bytes[950] = 1;
  bytes.set([0x01, 0x94, 0x1f, 0x06], 1084);
  for (let frame = 0; frame < 8; frame += 1) bytes.writeInt8(frame % 2 ? 48 : -48, sampleOffset + frame);
  return bytes;
};

const createModLoopFixture = () => {
  const sampleFrames = 8_192;
  const patternOffset = 1084;
  const sampleOffset = patternOffset + 64 * 4 * 4;
  const bytes = Buffer.alloc(sampleOffset + sampleFrames);
  bytes.write('MOD steady tone', 20, 22, 'ascii');
  bytes.writeUInt16BE(sampleFrames / 2, 42);
  bytes[45] = 64;
  bytes.writeUInt16BE(sampleFrames / 2, 48);
  bytes[950] = 1;
  bytes.write('M.K.', 1080, 4, 'ascii');
  // A C-3 sample at the first row, looping for the full pattern and song.
  bytes.set([0x01, 0xac, 0x10, 0x00], patternOffset);
  for (let frame = 0; frame < sampleFrames; frame += 1) {
    bytes.writeInt8(Math.round(Math.sin((2 * Math.PI * 440 * frame) / 8_363) * 112), sampleOffset + frame);
  }
  return bytes;
};

const createStardstmWithoutChannelEffect = (channel, effectCode) => {
  const bytes = fs.readFileSync(path.join(repositoryRoot, 'templateEngineGame', 'shooter_game', 'assets', 'musics', 'stardstm.mod'));
  const patternCount = Math.max(...bytes.subarray(952, 952 + bytes[950])) + 1;
  for (let pattern = 0; pattern < patternCount; pattern += 1) {
    for (let row = 0; row < 64; row += 1) {
      const eventOffset = 1084 + pattern * 64 * 16 + row * 16 + channel * 4;
      if ((bytes[eventOffset + 2] & 0x0f) !== effectCode) continue;
      bytes[eventOffset + 2] &= 0xf0;
      bytes[eventOffset + 3] = 0;
    }
  }
  return bytes;
};
const createStardstmWithoutChannelAxy = channel => createStardstmWithoutChannelEffect(channel, 0x0a);

const createModChannelIsolation = (moduleBytes, selectedChannel) => {
  const bytes = Buffer.from(moduleBytes);
  const selectedChannels = Array.isArray(selectedChannel) ? selectedChannel : [selectedChannel];
  const orders = bytes[950];
  const patterns = [...new Set(bytes.subarray(952, 952 + orders))];
  for (const patternIndex of patterns) {
    const patternOffset = 1084 + patternIndex * 64 * 4 * 4;
    for (let row = 0; row < 64; row += 1) {
      for (let channel = 0; channel < 4; channel += 1) {
        if (selectedChannels.includes(channel)) continue;
        const eventOffset = patternOffset + row * 4 * 4 + channel * 4;
        bytes.fill(0, eventOffset, eventOffset + 4);
      }
    }
  }
  return bytes;
};

const modChannelCount = bytes => {
  const signature = bytes.subarray(1080, 1084).toString('ascii');
  if (['M.K.', 'M!K!', 'M&K!', 'N.T.'].includes(signature)) return 4;
  const match = signature.match(/^(\d{1,2})CHN$/) || signature.match(/^([1-9]\d?)CH$/);
  return match ? Number(match[1]) : 4;
};

const expandModToFiveChannels = moduleBytes => {
  const bytes = Buffer.from(moduleBytes);
  if (modChannelCount(bytes) !== 4) throw new Error('Expected a four-channel MOD before adding a sync lane.');
  const patternCount = Math.max(...bytes.subarray(952, 952 + bytes[950])) + 1;
  const oldPatternSize = 64 * 4 * 4;
  const newPatternSize = 64 * 5 * 4;
  const oldSampleOffset = 1084 + patternCount * oldPatternSize;
  const expanded = Buffer.alloc(bytes.length + patternCount * (newPatternSize - oldPatternSize));
  bytes.copy(expanded, 0, 0, 1084);
  for (let pattern = 0; pattern < patternCount; pattern += 1) {
    for (let row = 0; row < 64; row += 1) {
      const source = 1084 + pattern * oldPatternSize + row * 16;
      const target = 1084 + pattern * newPatternSize + row * 20;
      bytes.copy(expanded, target, source, source + 16);
    }
  }
  bytes.copy(expanded, 1084 + patternCount * newPatternSize, oldSampleOffset);
  expanded.write('5CHN', 1080, 4, 'ascii');
  return expanded;
};

const createModSyncMarker = (moduleBytes, markerChannel = undefined, timingSource = moduleBytes, markerRows = [0, 8], additionalMarkerPositions = [], codedFrequencySequence = undefined) => {
  let bytes = Buffer.from(moduleBytes);
  let source = Buffer.from(timingSource);
  const requestedMarkerPositions = [...markerRows.map(row => ({ order: 0, row })), ...additionalMarkerPositions];
  if (modChannelCount(bytes) === 4 && markerChannel === undefined) {
    bytes = expandModToFiveChannels(bytes);
    source = expandModToFiveChannels(source);
    markerChannel = 4;
  }
  const channelCount = modChannelCount(bytes);
  const orderCount = bytes[950];
  const patternCount = Math.max(...bytes.subarray(952, 952 + orderCount)) + 1;
  if (markerChannel === undefined) {
    const firstPatternOffset = 1084 + bytes[952] * 64 * channelCount * 4;
    const readCell = (row, channel) => {
      const eventOffset = firstPatternOffset + row * channelCount * 4 + channel * 4;
      return {
        period: ((bytes[eventOffset] & 0x0f) << 8) | bytes[eventOffset + 1],
        sample: (bytes[eventOffset] & 0xf0) | (bytes[eventOffset + 2] >> 4),
      };
    };
    const candidates = Array.from({ length: channelCount }, (_, channel) => channel).filter(channel => {
      const firstMarkerCell = readCell(markerRows[0], channel);
      const secondMarkerCell = readCell(markerRows[1], channel);
      if (firstMarkerCell.period || firstMarkerCell.sample || secondMarkerCell.period) return false;
      for (const position of additionalMarkerPositions) {
        if (position.order < 0 || position.order >= orderCount || position.row < 0 || position.row >= 64) return false;
        const patternOffset = 1084 + bytes[952 + position.order] * 64 * channelCount * 4;
        const eventOffset = patternOffset + position.row * channelCount * 4 + channel * 4;
        const period = ((bytes[eventOffset] & 0x0f) << 8) | bytes[eventOffset + 1];
        if (period) return false;
      }
      for (const markerRow of markerRows) {
        let hasSelectedInstrument = false;
        for (let row = markerRow + 1; row < 64; row += 1) {
          const cell = readCell(row, channel);
          if (cell.sample) hasSelectedInstrument = true;
          if (cell.period) {
            if (!hasSelectedInstrument) return false;
            break;
          }
        }
      }
      return true;
    });
    if (!candidates.length) throw new Error('No MOD channel can hold both synchronization markers without replacing a note or sample.');
    markerChannel = candidates.sort((left, right) => {
      const eventCost = channel => markerRows.reduce((sum, row) => {
        const eventOffset = firstPatternOffset + row * channelCount * 4 + channel * 4;
        return sum + ((bytes[eventOffset + 2] & 0x0f) !== 0 || bytes[eventOffset + 3] !== 0 ? 1 : 0);
      }, 0);
      return eventCost(left) - eventCost(right);
    })[0];
  }
  const usedSamples = new Set();
  for (let pattern = 0; pattern < patternCount; pattern += 1) {
    const patternOffset = 1084 + pattern * 64 * channelCount * 4;
    for (let row = 0; row < 64; row += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const eventOffset = patternOffset + row * channelCount * 4 + channel * 4;
        usedSamples.add((bytes[eventOffset] & 0xf0) | (bytes[eventOffset + 2] >> 4));
      }
    }
  }
  let sampleNumber = 0;
  for (let candidate = 31; candidate >= 1; candidate -= 1) {
    const header = 20 + (candidate - 1) * 30;
    if (bytes.readUInt16BE(header + 22) === 0 && !usedSamples.has(candidate)) {
      sampleNumber = candidate;
      break;
    }
  }
  if (!sampleNumber) throw new Error('cyberrid.mod has no unused empty sample slot for the synchronization marker.');
  const markerPulseCount = codedFrequencySequence?.length === 8 ? 8 : 5;
  const marker = Buffer.alloc(128 * markerPulseCount);
  const markerFrequencySequence = codedFrequencySequence?.length === markerPulseCount ? [...codedFrequencySequence] : Array(markerPulseCount).fill(2_200);
  for (let frame = 0; frame < marker.length; frame += 1) {
    const pulse = Math.floor(frame / 128);
    const pulseFrame = frame % 128;
    const value = pulseFrame < 64 ? Math.round(Math.sin((2 * Math.PI * markerFrequencySequence[pulse] * pulseFrame) / 8_363) * 96) : 0;
    marker.writeInt8(value, frame);
  }
  const patternDataOffset = 1084 + patternCount * 64 * channelCount * 4;
  let sampleDataOffset = patternDataOffset;
  for (let index = 1; index < sampleNumber; index += 1) sampleDataOffset += bytes.readUInt16BE(20 + (index - 1) * 30 + 22) * 2;
  const instrumentHeader = 20 + (sampleNumber - 1) * 30;
  const timingChannels = modChannelCount(source);
  const timingCommandAtPosition = (order, row) => {
    let command;
    if (order < 0 || order >= source[950] || row < 0 || row >= 64) throw new Error(`Invalid MOD synchronization marker position ${order}:${row}.`);
    const patternOffset = 1084 + source[952 + order] * 64 * timingChannels * 4;
    for (let channel = 0; channel < timingChannels; channel += 1) {
      const offset = patternOffset + row * timingChannels * 4 + channel * 4;
      if ((source[offset + 2] & 0x0f) === 0x0f && source[offset + 3] > 0) {
        command = { effect: 0x0f, parameter: source[offset + 3] };
      }
    }
    return command ?? { effect: 0, parameter: 0 };
  };
  bytes.writeUInt16BE(marker.length / 2, instrumentHeader + 22);
  bytes[instrumentHeader + 24] = 0;
  bytes[instrumentHeader + 25] = 64;
  bytes.writeUInt16BE(0, instrumentHeader + 26);
  // Use an explicit no-loop header so the sync tone is one-shot in every player.
  bytes.writeUInt16BE(0, instrumentHeader + 28);
  const markedBytes = Buffer.concat([bytes.subarray(0, sampleDataOffset), marker, bytes.subarray(sampleDataOffset)]);
  for (const position of requestedMarkerPositions) {
    const { effect: eventEffect, parameter: eventParameter } = timingCommandAtPosition(position.order, position.row);
    const patternOffset = 1084 + markedBytes[952 + position.order] * 64 * channelCount * 4;
    const rowEventOffset = patternOffset + position.row * channelCount * 4 + markerChannel * 4;
    markedBytes[rowEventOffset] = ((sampleNumber & 0xf0) | (428 >> 8));
    markedBytes[rowEventOffset + 1] = 428 & 0xff;
    markedBytes[rowEventOffset + 2] = ((sampleNumber & 0x0f) << 4) | eventEffect;
    markedBytes[rowEventOffset + 3] = eventParameter;
  }
  const markerPositions = [];
  for (let order = 0; order < orderCount; order += 1) {
    const patternOffset = 1084 + markedBytes[952 + order] * 64 * channelCount * 4;
    for (let row = 0; row < 64; row += 1) {
      const eventOffset = patternOffset + row * channelCount * 4 + markerChannel * 4;
      const period = ((markedBytes[eventOffset] & 0x0f) << 8) | markedBytes[eventOffset + 1];
      const sample = (markedBytes[eventOffset] & 0xf0) | (markedBytes[eventOffset + 2] >> 4);
      if (sample === sampleNumber && period > 0) markerPositions.push({ order, row });
    }
  }
  return { bytes: markedBytes, sampleNumber, markerChannel, markerRows, markerPositions, markerSampleBytes: Buffer.from(marker), frequency: markerFrequencySequence[0], pulseCount: markerPulseCount, frequencySequence: codedFrequencySequence?.length === markerPulseCount ? markerFrequencySequence : undefined };
};

const findModSampleTemplateMatches = (channels, sampleBytes, sampleRate, options = {}) => {
  const matches = [];
  const sampleSteps = options.sampleSteps ?? [0.515, 0.52, 0.525, 0.53, 0.535];
  const coarseHopFrames = Math.max(1, Math.floor(options.coarseHopFrames ?? 16));
  const maximumMatches = Math.max(1, Math.floor(options.maximumMatches ?? 8));
  for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
    const channel = channels[channelIndex];
      const prefix = new Float64Array(channel.length + 1);
      const prefixSquares = new Float64Array(channel.length + 1);
      for (let frame = 0; frame < channel.length; frame += 1) {
        prefix[frame + 1] = prefix[frame] + channel[frame];
        prefixSquares[frame + 1] = prefixSquares[frame] + channel[frame] ** 2;
      }
    for (const sampleStep of sampleSteps) {
      const templateLength = Math.ceil((sampleBytes.length - 1) / sampleStep);
      if (templateLength > channel.length) continue;
      const template = Float64Array.from({ length: templateLength }, (_, frame) => {
        const sourceFrame = Math.floor(frame * sampleStep);
        const byte = sampleBytes[sourceFrame];
        return (byte < 128 ? byte : byte - 256) / 128;
      });
      const templateMean = template.reduce((sum, value) => sum + value, 0) / template.length;
      const templateVariance = template.reduce((sum, value) => sum + (value - templateMean) ** 2, 0);
      const scoreAt = start => {
        let dot = 0;
        for (let frame = 0; frame < templateLength; frame += 1) dot += channel[start + frame] * template[frame];
        const signalSum = prefix[start + templateLength] - prefix[start];
        const signalSquares = prefixSquares[start + templateLength] - prefixSquares[start];
        const covariance = dot - signalSum * templateMean;
        const signalVariance = signalSquares - signalSum ** 2 / templateLength;
        return covariance / Math.sqrt(Math.max(1e-20, signalVariance * templateVariance));
      };
      const ranges = options.searchWindowsMs?.length
        ? options.searchWindowsMs
        : [[0, (channel.length / sampleRate) * 1_000]];
      for (const [startMs, endMs] of ranges) {
        const firstFrame = Math.max(0, Math.floor(startMs * sampleRate / 1_000));
        const lastFrame = Math.min(channel.length - templateLength, Math.floor(endMs * sampleRate / 1_000));
        let bestStart = -1;
        let bestCorrelation = -Infinity;
        for (let start = firstFrame; start <= lastFrame; start += coarseHopFrames) {
          const correlation = scoreAt(start);
          if (correlation > bestCorrelation) { bestStart = start; bestCorrelation = correlation; }
        }
        if (bestStart < 0) continue;
        const refineStart = Math.max(firstFrame, bestStart - coarseHopFrames);
        const refineEnd = Math.min(lastFrame, bestStart + coarseHopFrames);
        for (let start = refineStart; start <= refineEnd; start += 1) {
          const correlation = scoreAt(start);
          if (correlation > bestCorrelation) { bestStart = start; bestCorrelation = correlation; }
        }
        matches.push({ timeMs: bestStart / sampleRate * 1_000, sampleStep, channel: channelIndex, correlation: bestCorrelation });
      }
    }
  }
  matches.sort((left, right) => right.correlation - left.correlation);
  const separated = [];
  for (const match of matches) {
    if (separated.some(existing => Math.abs(existing.timeMs - match.timeMs) < 25)) continue;
    separated.push(match);
    if (separated.length === maximumMatches) break;
  }
  return separated;
};

const createS3mFixture = () => {
  const bytes = Buffer.alloc(256);
  const u16 = (offset, value) => bytes.writeUInt16LE(value, offset);
  bytes.write('SCRM', 44);
  u16(32, 1); u16(34, 0); u16(36, 1);
  bytes.fill(255, 64, 96); bytes[64] = 0;
  bytes[96] = 0;
  u16(97, 8);
  const packed = Buffer.from([0xe0, 0x40, 1, 32, 0, 0, 0, ...Array(64).fill(0)]);
  u16(128, packed.length);
  packed.copy(bytes, 130);
  return bytes;
};

const createS3mMaxmodParityFixture = (sampleVolume = 64, noteVolume, initialPanParameter, { noteIntervalRows = 8, speed = 6, tempo = 125, noteCount = Number.POSITIVE_INFINITY, sampleRate = 8_363, note = 0x40, toneFrequency = 440, toneSampleRate = 8_363, waveform = 'sine', targetSampleRms, sampleFrames = 1_024, rowCommands = [], loopSample = false } = {}) => {
  const sampleLength = sampleFrames;
  const patternRows = 64;
  const sampleHeaderOffset = 160;
  const patternOffset = 256;
  const sampleDataOffset = 1_024;
  const packedPattern = [];
  for (let row = 0; row < patternRows; row += 1) {
    if (row % noteIntervalRows === 0 && row / noteIntervalRows < noteCount) {
      const addPanCommand = row === 0 && initialPanParameter !== undefined;
      packedPattern.push(0x20 | (noteVolume === undefined ? 0 : 0x40) | (addPanCommand ? 0x80 : 0), note, 1, ...(noteVolume === undefined ? [] : [noteVolume]), ...(addPanCommand ? [19, initialPanParameter] : []));
    }
    const rowCommand = rowCommands.find(command => command.row === row);
    if (rowCommand) packedPattern.push(0x80, rowCommand.effect, rowCommand.parameter);
    packedPattern.push(0);
  }
  const bytes = Buffer.alloc(sampleDataOffset + sampleLength);
  const u16 = (offset, value) => bytes.writeUInt16LE(value, offset);
  const u32 = (offset, value) => bytes.writeUInt32LE(value, offset);
  bytes[0x1c] = 0x1a; bytes[0x1d] = 0x10;
  bytes[0x35] = 0xfc;
  bytes.write('SCRM', 44);
  u16(32, 1); u16(34, 1); u16(36, 1);
  u16(0x2a, 1);
  bytes[0x33] = 0xc0;
  bytes.fill(255, 64, 96); bytes[64] = 0;
  bytes[96] = 0;
  u16(97, sampleHeaderOffset / 16);
  u16(99, patternOffset / 16);
  bytes.fill(0x28, 101, 133); // Explicit center pan matches the reference fixture.
  bytes[sampleHeaderOffset] = 1;
  bytes[sampleHeaderOffset + 0x0e] = (sampleDataOffset / 16) & 0xff;
  bytes[sampleHeaderOffset + 0x0f] = (sampleDataOffset / 16) >> 8;
  u32(sampleHeaderOffset + 0x10, sampleLength);
  u32(sampleHeaderOffset + 0x14, 0);
  u32(sampleHeaderOffset + 0x18, loopSample ? sampleLength : 0);
  bytes[sampleHeaderOffset + 0x1c] = sampleVolume;
  bytes[sampleHeaderOffset + 0x1f] = loopSample ? 1 : 0;
  u32(sampleHeaderOffset + 0x20, sampleRate);
  bytes.write('SCRS', sampleHeaderOffset + 0x4c);
  u16(patternOffset, packedPattern.length);
  Buffer.from(packedPattern).copy(bytes, patternOffset + 2);
  if (targetSampleRms === undefined) {
    for (let index = 0; index < sampleLength; index += 1) bytes[sampleDataOffset + index] = Math.round(Math.sin((2 * Math.PI * toneFrequency * index) / toneSampleRate) * 96) & 0xff;
  } else {
    const signal = new Float32Array(sampleLength);
    let randomState = 0x6d2b79f5;
    for (let index = 0; index < sampleLength; index += 1) {
      if (waveform === 'noise') {
        randomState ^= randomState << 13;
        randomState ^= randomState >>> 17;
        randomState ^= randomState << 5;
        signal[index] = ((randomState >>> 0) / 0xffff_ffff) * 2 - 1;
      } else if (waveform === 'alternating') {
        signal[index] = index % 2 === 0 ? 1 : -1;
      } else if (waveform === 'impulse-train') {
        signal[index] = index % 16 === 0 ? 1 : 0;
      } else {
        signal[index] = Math.sin((2 * Math.PI * toneFrequency * index) / toneSampleRate);
      }
    }
    const signalRms = Math.sqrt(signal.reduce((sum, value) => sum + value * value, 0) / sampleLength);
    const scale = targetSampleRms / Math.max(1e-9, signalRms);
    for (let index = 0; index < sampleLength; index += 1) bytes[sampleDataOffset + index] = Math.max(-128, Math.min(127, Math.round(signal[index] * scale))) & 0xff;
  }
  bytes[0x30] = 64; bytes[0x31] = speed; bytes[0x32] = tempo;
  return bytes;
};

const createS3mStemWithSyncMarker = (sourceSample, noteIntervalRows = 8, tempo = 125, { loopSample = false } = {}) => {
  const patternRows = 64;
  const sampleHeaderOffset = 144;
  const markerHeaderOffset = 224;
  const patternOffset = 304;
  const sampleDataOffset = 1_024;
  const sampleRate = Math.max(3_000, Math.min(768_000, Math.trunc(sourceSample.sampleRate ?? 8_363)));
  const sampleLength = Math.min(sourceSample.samples.length, Math.max(512, Math.floor(sampleRate * 0.2)));
  const markerLength = 128;
  const packed = [];
  const musicRows = [];
  const markerRows = [];
  for (let row = 0; row < patternRows; row += 1) {
    if (row % noteIntervalRows === 0) {
      packed.push(0x20, 0x40, 1);
      musicRows.push(row);
    } else if (noteIntervalRows > 2 && row % noteIntervalRows === Math.max(1, Math.floor(noteIntervalRows / 4))) {
      packed.push(0x80, 19, 0xc0);
    }
    if (row % 2 === 0) {
      packed.push(0x21, 0x40, 2);
      markerRows.push(row);
    }
    packed.push(0);
  }
  const markerDataOffset = sampleDataOffset + sampleLength;
  const bytes = Buffer.alloc(markerDataOffset + markerLength);
  const u16 = (offset, value) => bytes.writeUInt16LE(value, offset);
  const u32 = (offset, value) => bytes.writeUInt32LE(value, offset);
  bytes[0x1c] = 0x1a; bytes[0x1d] = 0x10;
  bytes[0x35] = 0xfc;
  bytes.write('SCRM', 44);
  u16(32, 1); u16(34, 2); u16(36, 1);
  u16(0x2a, 2);
  bytes[0x30] = 64; bytes[0x31] = 6; bytes[0x32] = tempo; bytes[0x33] = 0xc0;
  bytes.fill(255, 64, 96); bytes[64] = 0; bytes[65] = 1;
  bytes[96] = 0;
  u16(97, sampleHeaderOffset / 16);
  u16(99, markerHeaderOffset / 16);
  u16(101, patternOffset / 16);
  bytes.fill(0x28, 103, 135); bytes[103] = 0x20; bytes[104] = 0x2f;
  const writeSampleHeader = (headerOffset, dataOffset, frames, rate, volume, loop = false) => {
    bytes[headerOffset] = 1;
    bytes[headerOffset + 0x0d] = (dataOffset / 16) >> 16;
    u16(headerOffset + 0x0e, (dataOffset / 16) & 0xffff);
    u32(headerOffset + 0x10, frames);
    u32(headerOffset + 0x14, 0); u32(headerOffset + 0x18, loop ? frames : 0);
    bytes[headerOffset + 0x1c] = volume;
    bytes[headerOffset + 0x1f] = loop ? 1 : 0;
    u32(headerOffset + 0x20, rate);
    bytes.write('SCRS', headerOffset + 0x4c);
  };
  writeSampleHeader(sampleHeaderOffset, sampleDataOffset, sampleLength, sampleRate, Math.max(0, Math.min(64, Math.trunc(sourceSample.volume ?? 64))), loopSample);
  writeSampleHeader(markerHeaderOffset, markerDataOffset, markerLength, 8_363, 64);
  u16(patternOffset, packed.length);
  Buffer.from(packed).copy(bytes, patternOffset + 2);
  for (let frame = 0; frame < sampleLength; frame += 1) {
    bytes[sampleDataOffset + frame] = Math.max(0, Math.min(255, Math.round(sourceSample.samples[frame] * 128 + 128)));
  }
  for (let frame = 0; frame < markerLength; frame += 1) {
    bytes[markerDataOffset + frame] = frame < 24 ? frame % 2 === 0 ? 255 : 0 : 128;
  }
  return { bytes, markerRows, musicRows, sampleRate, sampleLength };
};




const createItFixture = () => {
  const bytes = Buffer.alloc(192 + 1 + 4 + 8 + 72);
  const u16 = (offset, value) => bytes.writeUInt16LE(value, offset);
  bytes.write('IMPM', 0);
  u16(0x20, 1); u16(0x22, 0); u16(0x24, 0); u16(0x26, 1);
  bytes[192] = 0;
  bytes.writeUInt32LE(224, 193);
  const packed = Buffer.from([0x81, 0x0f, 48, 1, 32, 0, 0, 0, ...Array(63).fill(0)]);
  u16(224, packed.length); u16(226, 64);
  packed.copy(bytes, 232);
  return bytes;
};

const createItOrderFlowFixture = () => {
  const sampleHeaderOffset = 256;
  const patternOffsets = [336, 352, 368, 392];
  const sampleDataOffset = 512;
  const sampleLength = 2_048;
  const patterns = [
    [0x81, 0x08, 2, 2, 0], // B02: skip order 2 and jump to order 3.
    [0x81, 0x03, 48, 1, 0],
    [0x81, 0x03, 60, 1, 0, 0x81, 0x08, 3, 0, 0], // C00: advance to the next order.
    [0x81, 0x03, 64, 1, 0],
  ];
  const bytes = Buffer.alloc(sampleDataOffset + sampleLength);
  const u16 = (offset, value) => bytes.writeUInt16LE(value, offset);
  const u32 = (offset, value) => bytes.writeUInt32LE(value, offset);
  bytes.write('IMPM', 0);
  u16(0x20, 4); u16(0x22, 0); u16(0x24, 1); u16(0x26, patterns.length);
  bytes[0x30] = 128; bytes[0x31] = 128; bytes[0x32] = 6; bytes[0x33] = 125;
  bytes.fill(0x80, 0x40, 0x80); bytes[0x40] = 32;
  bytes.fill(64, 0x80, 0xc0);
  bytes.set([0, 1, 2, 3], 192);
  u32(196, sampleHeaderOffset);
  patternOffsets.forEach((offset, index) => u32(200 + index * 4, offset));
  bytes.write('IMPS', sampleHeaderOffset);
  bytes[sampleHeaderOffset + 0x11] = 64;
  bytes[sampleHeaderOffset + 0x12] = 1;
  bytes[sampleHeaderOffset + 0x13] = 64;
  bytes.write('IT flow sample', sampleHeaderOffset + 0x14, 'ascii');
  bytes[sampleHeaderOffset + 0x2e] = 1;
  u32(sampleHeaderOffset + 0x30, sampleLength);
  u32(sampleHeaderOffset + 0x3c, 8_363);
  u32(sampleHeaderOffset + 0x48, sampleDataOffset);
  patterns.forEach((packed, index) => {
    const offset = patternOffsets[index];
    u16(offset, packed.length);
    u16(offset + 2, index === 2 ? 2 : 1);
    Buffer.from(packed).copy(bytes, offset + 8);
  });
  for (let index = 0; index < sampleLength; index += 1) bytes[sampleDataOffset + index] = Math.round(Math.sin((2 * Math.PI * 440 * index) / 8_363) * 96) & 0xff;
  return bytes;
};

const createItInstrumentAudioFixture = (initialPanParameter, initialPanEffect = 24) => {
  const sampleLength = 1_024;
  const sampleHeaderOffset = 256;
  const patternOffset = 384;
  const sampleDataOffset = 512;
  const patternData = Buffer.from(Array.from({ length: 64 }, (_, row) => row % 8 === 0
    ? row === 0 && initialPanParameter !== undefined ? [0x81, 0x0b, 60, 1, initialPanEffect, initialPanParameter] : [0x81, 0x03, 60, 1, 0]
    : [0]).flat());
  const bytes = Buffer.alloc(sampleDataOffset + sampleLength);
  const u16 = (offset, value) => bytes.writeUInt16LE(value, offset);
  const u32 = (offset, value) => bytes.writeUInt32LE(value, offset);
  bytes.write('IMPM', 0);
  u16(0x20, 1); u16(0x22, 0); u16(0x24, 1); u16(0x26, 1);
  bytes[0x30] = 128; bytes[0x31] = 128; bytes[0x32] = 6; bytes[0x33] = 125;
  bytes.fill(0x80, 0x40, 0x80); bytes[0x40] = 32;
  if (initialPanParameter !== undefined) bytes[0x40] = 48;
  bytes.fill(64, 0x80, 0xc0);
  bytes[192] = 0;
  u32(193, sampleHeaderOffset); u32(197, patternOffset);
  bytes.write('IMPS', sampleHeaderOffset);
  bytes[sampleHeaderOffset + 0x11] = 64;
  bytes[sampleHeaderOffset + 0x12] = 1;
  bytes[sampleHeaderOffset + 0x13] = 64;
  bytes.write('IT fixture sample', sampleHeaderOffset + 0x14, 'ascii');
  bytes[sampleHeaderOffset + 0x2e] = 1;
  u32(sampleHeaderOffset + 0x30, sampleLength);
  u32(sampleHeaderOffset + 0x3c, 8_363);
  u32(sampleHeaderOffset + 0x48, sampleDataOffset);
  u16(patternOffset, patternData.length); u16(patternOffset + 2, 64);
  patternData.copy(bytes, patternOffset + 8);
  for (let index = 0; index < sampleLength; index += 1) bytes[sampleDataOffset + index] = Math.round(Math.sin((2 * Math.PI * 440 * index) / 8_363) * 96) & 0xff;
  return bytes;
};

const createItInstrumentModeAudioFixture = () => {
  const sampleLength = 1_024;
  const instrumentOffset = 256;
  const sampleHeaderOffset = 560;
  const patternOffset = 704;
  const sampleDataOffset = 1_024;
  const patternData = Buffer.from([0x81, 0x03, 60, 1, 0, ...Array(63).fill(0)]);
  const bytes = Buffer.alloc(sampleDataOffset + sampleLength);
  const u16 = (offset, value) => bytes.writeUInt16LE(value, offset);
  const u32 = (offset, value) => bytes.writeUInt32LE(value, offset);
  bytes.write('IMPM', 0);
  u16(0x20, 1); u16(0x22, 1); u16(0x24, 1); u16(0x26, 1);
  u16(0x2c, 0x04);
  bytes[0x30] = 128; bytes[0x31] = 128; bytes[0x32] = 6; bytes[0x33] = 125;
  bytes.fill(0x80, 0x40, 0x80); bytes[0x40] = 32;
  bytes.fill(64, 0x80, 0xc0);
  bytes[192] = 0;
  u32(193, instrumentOffset); u32(197, sampleHeaderOffset); u32(201, patternOffset);
  bytes.write('IMPI', instrumentOffset);
  bytes.write('MappedIns', instrumentOffset + 4, 'ascii');
  bytes[instrumentOffset + 0x18] = 64;
  for (let note = 0; note < 120; note += 1) {
    bytes[instrumentOffset + 64 + note * 2] = note;
    bytes[instrumentOffset + 65 + note * 2] = 1;
  }
  bytes.write('IMPS', sampleHeaderOffset);
  bytes[sampleHeaderOffset + 0x11] = 64;
  bytes[sampleHeaderOffset + 0x12] = 1;
  bytes[sampleHeaderOffset + 0x13] = 64;
  bytes.write('Mapped sample', sampleHeaderOffset + 0x14, 'ascii');
  bytes[sampleHeaderOffset + 0x2e] = 1;
  u32(sampleHeaderOffset + 0x30, sampleLength);
  u32(sampleHeaderOffset + 0x3c, 8_363);
  u32(sampleHeaderOffset + 0x48, sampleDataOffset);
  u16(patternOffset, patternData.length); u16(patternOffset + 2, 64);
  patternData.copy(bytes, patternOffset + 8);
  for (let index = 0; index < sampleLength; index += 1) bytes[sampleDataOffset + index] = Math.round(Math.sin((2 * Math.PI * 440 * index) / 8_363) * 96) & 0xff;
  return bytes;
};

const createItC5PitchFixture = note => {
  const sampleLength = 8_192;
  const sampleHeaderOffset = 256;
  const patternOffset = 384;
  const sampleDataOffset = 512;
  const packedPattern = [];
  for (let row = 0; row < 64; row += 1) {
    if (row === 0) packedPattern.push(0x81, 0x03, note, 1);
    packedPattern.push(0);
  }
  const bytes = Buffer.alloc(sampleDataOffset + sampleLength);
  const u16 = (offset, value) => bytes.writeUInt16LE(value, offset);
  const u32 = (offset, value) => bytes.writeUInt32LE(value, offset);
  bytes.write('IMPM', 0);
  u16(0x20, 1); u16(0x22, 0); u16(0x24, 1); u16(0x26, 1);
  bytes[0x30] = 128; bytes[0x31] = 128; bytes[0x32] = 6; bytes[0x33] = 125;
  bytes.fill(0x80, 0x40, 0x80);
  bytes[0x40] = 32;
  bytes.fill(64, 0x80, 0xc0);
  bytes[192] = 0;
  u32(193, sampleHeaderOffset);
  u32(197, patternOffset);
  bytes.write('IMPS', sampleHeaderOffset);
  bytes[sampleHeaderOffset + 0x11] = 64;
  bytes[sampleHeaderOffset + 0x12] = 1;
  bytes[sampleHeaderOffset + 0x13] = 64;
  u32(sampleHeaderOffset + 0x30, sampleLength);
  u32(sampleHeaderOffset + 0x3c, 8_363);
  u32(sampleHeaderOffset + 0x48, sampleDataOffset);
  u16(patternOffset, packedPattern.length);
  u16(patternOffset + 2, 64);
  Buffer.from(packedPattern).copy(bytes, patternOffset + 8);
  for (let index = 0; index < sampleLength; index += 1) bytes[sampleDataOffset + index] = Math.round(Math.sin((2 * Math.PI * 440 * index) / 8_363) * 100) & 0xff;
  return bytes;
};

const createXmLoopFixture = (loopType, volumeColumn = 0x50, panning = 128, fineTune = 0, relativeNote = 0, sampleVolume = 64, panEffectParameter, sampleAmplitude = 90, keyOffRow = 16, sampleLength = 1_024, sampleDataOverride, sixteenBit = false, channels = 4) => {
  const sampleByteLength = sampleLength * (sixteenBit ? 2 : 1);
  const sampleData = Buffer.alloc(sampleByteLength);
  if (sampleDataOverride) Buffer.from(sampleDataOverride).copy(sampleData, 0, 0, sampleByteLength);
  else if (sixteenBit) {
    let previous = 0;
    for (let index = 0; index < sampleLength; index += 1) {
      const value = Math.round(Math.sin((2 * Math.PI * 440 * index) / 8_363) * sampleAmplitude * 256);
      sampleData.writeUInt16LE((value - previous + 65_536) & 0xffff, index * 2);
      previous = value;
    }
  } else {
    let previous = 0;
    for (let index = 0; index < sampleLength; index += 1) {
      const value = Math.round(Math.sin((2 * Math.PI * 440 * index) / 8_363) * sampleAmplitude);
      sampleData[index] = (value - previous + 256) & 0xff;
      previous = value;
    }
  }
  const packedPattern = [];
  for (let row = 0; row < 64; row += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      if (channel === 0 && row === 0 && panEffectParameter !== undefined) packedPattern.push(volumeColumn === null ? 0x9b : 0x9f, 49, 1, ...(volumeColumn === null ? [] : [volumeColumn]), 0x0e, panEffectParameter);
      else if (channel === 0 && row === 0) packedPattern.push(...(volumeColumn === null ? [0x9b, 49, 1, 0, 0] : [49, 1, volumeColumn, 0, 0]));
      else if (channel === 0 && row === keyOffRow) packedPattern.push(97, 0, 0, 0, 0);
      else packedPattern.push(0x80);
    }
  }
  const packed = Buffer.from(packedPattern);
  const patternOffset = 336;
  const instrumentOffset = patternOffset + 9 + packed.length;
  const sampleHeaderOffset = instrumentOffset + 263;
  const sampleDataOffset = sampleHeaderOffset + 40;
  const bytes = Buffer.alloc(sampleDataOffset + sampleByteLength);
  bytes.write('Extended Module: ', 0, 17, 'ascii');
  bytes.write('Maxmod loop fixture', 17, 20, 'ascii');
  bytes[37] = 0x1a;
  bytes.write('GBA Studio E2E', 38, 20, 'ascii');
  bytes.writeUInt16LE(0x0104, 58);
  bytes.writeUInt32LE(276, 60);
  bytes.writeUInt16LE(1, 64);
  bytes.writeUInt16LE(0, 66);
  bytes.writeUInt16LE(channels, 68);
  bytes.writeUInt16LE(1, 70);
  bytes.writeUInt16LE(1, 72);
  bytes.writeUInt16LE(1, 74);
  bytes.writeUInt16LE(6, 76);
  bytes.writeUInt16LE(125, 78);
  bytes[80] = 0;
  bytes.writeUInt32LE(9, patternOffset);
  bytes[patternOffset + 4] = 0;
  bytes.writeUInt16LE(64, patternOffset + 5);
  bytes.writeUInt16LE(packed.length, patternOffset + 7);
  packed.copy(bytes, patternOffset + 9);
  bytes.writeUInt32LE(263, instrumentOffset);
  bytes.write('Fixture Instrument', instrumentOffset + 4, 22, 'ascii');
  bytes.writeUInt16LE(1, instrumentOffset + 27);
  bytes.writeUInt32LE(40, instrumentOffset + 29);
  bytes.writeUInt32LE(sampleByteLength, sampleHeaderOffset);
  bytes.writeUInt32LE(0, sampleHeaderOffset + 4);
  bytes.writeUInt32LE(sampleByteLength, sampleHeaderOffset + 8);
  bytes[sampleHeaderOffset + 12] = sampleVolume;
  bytes[sampleHeaderOffset + 13] = fineTune & 0xff;
  bytes[sampleHeaderOffset + 14] = loopType | (sixteenBit ? 0x10 : 0);
  bytes[sampleHeaderOffset + 15] = panning;
  bytes[sampleHeaderOffset + 16] = relativeNote & 0xff;
  bytes.write('440 Hz', sampleHeaderOffset + 18, 22, 'ascii');
  sampleData.copy(bytes, sampleDataOffset);
  return bytes;
};

const createXmTwoOrderFixture = () => {
  const source = createXmLoopFixture(1);
  const patternOffset = 336;
  const patternLength = 9 + source.readUInt16LE(patternOffset + 7);
  const instrumentOffset = patternOffset + patternLength;
  const result = Buffer.alloc(source.length + patternLength);
  source.copy(result, 0, 0, instrumentOffset);
  source.copy(result, instrumentOffset, patternOffset, instrumentOffset);
  source.copy(result, instrumentOffset + patternLength, instrumentOffset);
  result.writeUInt16LE(2, 64); // Two order entries.
  result.writeUInt16LE(2, 70); // Two patterns.
  result[80] = 0;
  result[81] = 1;
  return result;
};

const createXmTwoZoneFixture = (volumeColumn = 0x50, secondSampleVolume = 64) => {
  const source = createXmLoopFixture(1, volumeColumn);
  const patternOffset = 336;
  const instrumentOffset = patternOffset + 9 + source.readUInt16LE(patternOffset + 7);
  const firstHeaderOffset = instrumentOffset + 263;
  const sampleDataOffset = firstHeaderOffset + 40;
  const secondHeader = Buffer.from(source.subarray(firstHeaderOffset, sampleDataOffset));
  secondHeader.fill(0, 18, 40);
  secondHeader[12] = secondSampleVolume;
  secondHeader.write('Second zone', 18, 22, 'ascii');
  const secondPcm = Buffer.from(source.subarray(sampleDataOffset));
  const result = Buffer.concat([source.subarray(0, sampleDataOffset), secondHeader, secondPcm, secondPcm]);
  result.writeUInt16LE(2, instrumentOffset + 27);
  const sampleMapOffset = instrumentOffset + 33;
  result.fill(0, sampleMapOffset, sampleMapOffset + 96);
  result.fill(1, sampleMapOffset + 48, sampleMapOffset + 96);
  return result;
};


const installBrowserPreviewAudioTap = configuration => {
  const { detectorSource, templateMatcherSource, markerSampleBase64 } = typeof configuration === 'string'
    ? { detectorSource: configuration }
    : configuration ?? {};
  if (detectorSource) window.__detectPulsedToneMarkers = Function(`return (${detectorSource})`)();
  if (templateMatcherSource) window.__findModSampleTemplateMatches = Function(`return (${templateMatcherSource})`)();
  if (markerSampleBase64) window.__musicSyncMarkerSampleBase64 = markerSampleBase64;
  if (window.location.hash.toLowerCase().includes('emulator')) return;
  if (typeof AudioWorkletNode !== 'undefined' && !window.__musicCaptureWorkletInstalled) {
    const NativeAudioWorkletNode = window.AudioWorkletNode;
    window.AudioWorkletNode = new Proxy(NativeAudioWorkletNode, {
      construct(target, args, newTarget) {
        const [context, name, options = {}] = args;
        if (name !== 'tracker-output-limiter') return Reflect.construct(target, args, newTarget);
        const captureOptions = { ...options, processorOptions: { ...options.processorOptions, musicTestCapture: true, musicTestCapturePreLimiter: window.__musicTestCapturePreLimiter === true, musicTestCapturePreLimiterStats: window.__musicTestCapturePreLimiterStats === true, musicTestCaptureDurationSeconds: window.__musicTestCaptureDurationSeconds ?? 30 } };
        const node = Reflect.construct(target, [context, name, captureOptions], newTarget);
        const capture = {
          context,
          contextEpochMs: Date.now() - context.currentTime * 1000,
          processor: node,
          workletNodes: [node],
          chunks: [],
          preLimiterStats: [],
          syncMarkerFrequency: window.__musicSyncMarkerFrequency ?? null,
          syncMarkerPulsePattern: window.__musicSyncMarkerPulsePattern ?? null,
          syncMarkerSampleBase64: window.__musicSyncMarkerSampleBase64 ?? null,
        };
        context.__musicPreviewCapture = capture;
        window.__musicPreviewCapture = capture;
        node.port.addEventListener('message', event => {
          if (event.data?.preLimiterStats) capture.preLimiterStats.push(event.data.preLimiterStats);
          if (!event.data?.musicTestCaptureBlock) return;
          capture.chunks.push([
            event.data.left,
            event.data.right,
            event.data.startFrame / context.sampleRate,
            performance.now(),
            event.data.inputLeft,
            event.data.inputRight,
          ]);
        });
        node.port.start();
        return node;
      },
    });
    window.__musicCaptureWorkletInstalled = true;
  }
  if (!window.__musicPannerAuditInstalled && typeof AudioContext !== 'undefined') {
    const createStereoPanner = AudioContext.prototype.createStereoPanner;
    if (typeof createStereoPanner === 'function') {
      window.__musicPannerAuditInstalled = true;
      window.__musicPannerAudit = [];
      AudioContext.prototype.createStereoPanner = function (...args) {
        const node = createStereoPanner.apply(this, args);
        window.__musicPannerAudit.push(node);
        return node;
      };
    }
  }
  const nativeConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (destination, ...rest) {
    const result = nativeConnect.call(this, destination, ...rest);
    if (destination === this.context.destination) {
      const context = this.context;
      let capture = context.__musicPreviewCapture;
      if (capture?.workletNodes?.includes(this)) return result;
      if (!capture) {
        let processor;
        let silentGain;
        let workletNode;
        silentGain = context.createGain();
        silentGain.gain.value = 0;
        const chunks = [];
        try {
          workletNode = new AudioWorkletNode(context, 'music-capture-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
          nativeConnect.call(workletNode, silentGain);
          processor = workletNode;
        } catch (error) {
          window.__musicCaptureTapError = String(error?.stack ?? error);
          processor = context.createScriptProcessor(2048, 2, 2);
          processor.onaudioprocess = event => chunks.push([event.inputBuffer.getChannelData(0).slice(), event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1).slice() : event.inputBuffer.getChannelData(0).slice(), event.playbackTime, performance.now()]);
          nativeConnect.call(processor, silentGain);
        }
        nativeConnect.call(silentGain, context.destination);
        capture = { context, contextEpochMs: Date.now() - context.currentTime * 1000, processor, workletNodes: workletNode ? [workletNode] : [], silentGain, chunks, syncMarkerFrequency: window.__musicSyncMarkerFrequency ?? null, syncMarkerPulsePattern: window.__musicSyncMarkerPulsePattern ?? null, syncMarkerSampleBase64: window.__musicSyncMarkerSampleBase64 ?? null };
        context.__musicPreviewCapture = capture;
      }
      // Tee every output node into one analyzer so capture reflects the full
      // mix instead of whichever voice happened to connect last.
      nativeConnect.call(this, capture.processor);
      window.__musicPreviewCapture = capture;
    }
    return result;
  };
};

const installEmulatorOpenALTap = async configuration => {
  const { detectorSource, templateMatcherSource, markerSampleBase64 } = typeof configuration === 'string'
    ? { detectorSource: configuration }
    : configuration ?? {};
  if (detectorSource) window.__detectPulsedToneMarkers = Function(`return (${detectorSource})`)();
  if (templateMatcherSource) window.__findModSampleTemplateMatches = Function(`return (${templateMatcherSource})`)();
  if (markerSampleBase64) window.__musicSyncMarkerSampleBase64 = markerSampleBase64;
  const audioContext = window.EJS_emulator?.Module?.AL?.currentCtx;
  if (!audioContext?.audioCtx || window.__musicOpenALCapture) return false;
  const context = audioContext.audioCtx;
  const chunks = [];
  const processors = [];
  const workletNodes = [];
  const silentGains = [];
  const tappedGains = new WeakSet();
  const sourceGainCaptures = [];
  const auxiliaryStageCaptures = [];
  const openALAudioBufferCaptures = [];
  const openALAudioBufferSummary = { total: 0, byFormat: {}, firstStartTime: null, lastStartTime: null, activeBufferCount: 0, maxRms: 0, maxPeak: 0, lastActiveStartTime: null };
  let tappedSourceCount = 0;
  let openALBufferActivityCaptureStarted = false;
  const contextGain = audioContext.gain && typeof audioContext.gain.connect === 'function' ? audioContext.gain : null;
  const captureSourceStages = window.__musicCaptureSourceStages === true;
  let restoreAudioBufferSourceTap;
  if (window.__musicCaptureOpenALBuffers === true) {
    const prototype = window.AudioBufferSourceNode.prototype;
    const nativeStart = prototype.start;
    const wrappedStart = function (...args) {
      const buffer = this.buffer;
      if (this.context === context && buffer) {
        const startTime = Number.isFinite(args[0]) ? args[0] : context.currentTime;
        const shape = `${buffer.sampleRate}Hz/${buffer.numberOfChannels}ch/${buffer.length}f`;
        openALAudioBufferSummary.total += 1;
        openALAudioBufferSummary.byFormat[shape] = (openALAudioBufferSummary.byFormat[shape] ?? 0) + 1;
        openALAudioBufferSummary.firstStartTime ??= startTime;
        openALAudioBufferSummary.lastStartTime = startTime;
        const captureBufferTail = window.__musicCaptureOpenALBufferTail === true;
        if (buffer.sampleRate === 44_100 && buffer.numberOfChannels === 2 && buffer.length > 0) {
          const left = buffer.getChannelData(0);
          const right = buffer.getChannelData(1);
          let power = 0;
          let peak = 0;
          for (let frame = 0; frame < buffer.length; frame += 1) {
            power += left[frame] * left[frame] + right[frame] * right[frame];
            peak = Math.max(peak, Math.abs(left[frame]), Math.abs(right[frame]));
          }
          const rms = Math.sqrt(power / Math.max(1, buffer.length * 2));
          openALAudioBufferSummary.maxRms = Math.max(openALAudioBufferSummary.maxRms, rms);
          openALAudioBufferSummary.maxPeak = Math.max(openALAudioBufferSummary.maxPeak, peak);
          const active = rms > 1e-7;
          if (active) {
            openALAudioBufferSummary.activeBufferCount += 1;
            openALAudioBufferSummary.lastActiveStartTime = startTime;
            openALBufferActivityCaptureStarted = true;
          }
          if (captureBufferTail ? openALBufferActivityCaptureStarted : buffer.length === 256 && openALAudioBufferCaptures.length < 16) {
            if (captureBufferTail && openALAudioBufferCaptures.length >= 1_024) openALAudioBufferCaptures.shift();
            openALAudioBufferCaptures.push({
              startTime,
              sampleRate: buffer.sampleRate,
              length: buffer.length,
              channels: buffer.numberOfChannels,
              rms,
              peak,
              left: Array.from(left),
              right: Array.from(right),
            });
          }
        }
      }
      return nativeStart.apply(this, args);
    };
    prototype.start = wrappedStart;
    restoreAudioBufferSourceTap = () => {
      if (prototype.start === wrappedStart) prototype.start = nativeStart;
    };
  }
  const audioGraphAudit = window.__musicAudioGraphAudit;
  const coreModule = window.EJS_emulator?.Module;
  const coreFs = coreModule?.FS;
  const runtimeAudioConfig = (() => {
    if (!coreFs?.analyzePath || !coreFs?.readFile) return { fsAvailable: false, moduleKeys: Object.keys(coreModule ?? {}).filter(key => /fs|config|audio/i.test(key)).sort() };
    const configPaths = [
      '/home/web_user/retroarch/userdata/config/retroarch/retroarch.cfg',
      '/home/web_user/retroarch/userdata/config/retroarch.cfg',
      '/home/web_user/retroarch/userdata/config/mGBA/mGBA.opt',
      '/home/web_user/retroarch/retroarch.cfg',
      '/home/web_user/retroarch/userdata/retroarch.cfg',
      '/retroarch/userdata/config/retroarch/retroarch.cfg',
      '/userdata/config/retroarch/retroarch.cfg',
      '/data/system/retroarch.cfg',
      '/retroarch.cfg',
    ];
    const files = [];
    for (const path of configPaths) {
      try {
        if (!coreFs.analyzePath(path).exists) continue;
        const contents = coreFs.readFile(path, { encoding: 'utf8' });
        files.push({ path, audioLines: contents.split(/\r?\n/).filter(line => /audio|resampl/i.test(line)).slice(0, 30) });
      } catch (error) {
        files.push({ path, error: String(error) });
      }
    }
    const pendingDirectories = ['/home/web_user/retroarch/userdata', '/home/web_user/retroarch/config', '/data'];
    const visitedDirectories = new Set();
    while (pendingDirectories.length && visitedDirectories.size < 160) {
      const directory = pendingDirectories.shift();
      if (!directory || visitedDirectories.has(directory)) continue;
      visitedDirectories.add(directory);
      let entries = [];
      try { entries = coreFs.readdir(directory).filter(name => !['.', '..'].includes(name)); } catch { continue; }
      for (const name of entries) {
        const path = `${directory}/${name}`;
        try {
          const status = coreFs.analyzePath(path);
          if (status.object?.isFolder) {
            if (directory.split('/').length < 8) pendingDirectories.push(path);
          } else if (/\.cfg$/i.test(name) && !files.some(file => file.path === path)) {
            const contents = coreFs.readFile(path, { encoding: 'utf8' });
            const audioLines = contents.split(/\r?\n/).filter(line => /audio|resampl/i.test(line)).slice(0, 30);
            files.push({ path, audioLines });
          }
        } catch {}
      }
    }
    let rootEntries = [];
    try { rootEntries = coreFs.readdir('/').filter(name => !['.', '..'].includes(name)).slice(0, 80); } catch {}
    return { fsAvailable: true, rootEntries, files };
  })();
  const summarizeAudioQueue = source => Array.isArray(source?.audioQueue) ? source.audioQueue.slice(-4).map(item => {
    const buffer = item?.buffer ?? item?.source?.buffer;
    return {
      bufferSampleRate: buffer?.sampleRate,
      bufferChannels: buffer?.numberOfChannels,
      bufferLength: buffer?.length,
    };
  }) : [];
  let tapPoint = 'source-gain-fallback';
  let workletTapInstalled = false;
  if (typeof AudioWorkletNode !== 'undefined' && context.audioWorklet) {
    const workletSource = `class GbaStudioOpenALCaptureTap extends AudioWorkletProcessor {
      constructor() { super(); this.blockSize = 2048; this.offset = 0; this.startFrame = -1; this.left = new Float32Array(this.blockSize); this.right = new Float32Array(this.blockSize); }
      process(inputs, outputs) {
        const input = inputs[0] || []; const output = outputs[0] || []; const left = input[0];
        for (let channel = 0; channel < output.length; channel += 1) { const source = input[channel] || left; if (source) output[channel].set(source); else output[channel].fill(0); }
        if (!left) return true;
        const right = input[1] || left; let sourceOffset = 0;
        while (sourceOffset < left.length) {
          if (this.offset === 0) this.startFrame = currentFrame + sourceOffset;
          const count = Math.min(left.length - sourceOffset, this.blockSize - this.offset);
          this.left.set(left.subarray(sourceOffset, sourceOffset + count), this.offset);
          this.right.set(right.subarray(sourceOffset, sourceOffset + count), this.offset);
          this.offset += count; sourceOffset += count;
          if (this.offset === this.blockSize) {
            const leftBlock = this.left; const rightBlock = this.right; const startFrame = this.startFrame;
            this.port.postMessage({ musicCaptureBlock: true, left: leftBlock, right: rightBlock, startFrame }, [leftBlock.buffer, rightBlock.buffer]);
            this.left = new Float32Array(this.blockSize); this.right = new Float32Array(this.blockSize); this.offset = 0; this.startFrame = -1;
          }
        }
        return true;
      }
    }
    registerProcessor('gba-studio-openal-capture-tap', GbaStudioOpenALCaptureTap);`;
    const workletUrl = URL.createObjectURL(new Blob([workletSource], { type: 'application/javascript' }));
    try {
      await context.audioWorklet.addModule(workletUrl);
      workletTapInstalled = true;
    } catch (error) {
      window.__musicOpenALWorkletError = String(error?.stack ?? error);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }
  }
  const connectTap = (gain, targetChunks) => {
    if (!gain || typeof gain.connect !== 'function' || tappedGains.has(gain)) return false;
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    let processor;
    if (workletTapInstalled) {
      const worklet = new AudioWorkletNode(context, 'gba-studio-openal-capture-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      worklet.port.addEventListener('message', event => {
        if (!event.data?.musicCaptureBlock) return;
        targetChunks.push([event.data.left, event.data.right, event.data.startFrame / context.sampleRate, performance.now()]);
      });
      worklet.port.start();
      processor = worklet;
      workletNodes.push(worklet);
    } else {
      processor = context.createScriptProcessor(2048, 2, 2);
      processor.onaudioprocess = event => targetChunks.push([
        event.inputBuffer.getChannelData(0).slice(),
        event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1).slice() : event.inputBuffer.getChannelData(0).slice(),
        event.playbackTime,
        performance.now(),
      ]);
      processors.push(processor);
    }
    gain.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);
    silentGains.push(silentGain);
    tappedGains.add(gain);
    tappedSourceCount += 1;
    return true;
  };
  const tapNewSources = () => {
    let connectedSource = false;
    const gameManagerAudioNode = window.EJS_emulator?.gameManager?.audioNode;
    if (captureSourceStages && gameManagerAudioNode && typeof gameManagerAudioNode.connect === 'function'
      && !auxiliaryStageCaptures.some(stage => stage.name === 'gameManager.audioNode')) {
      const stage = { name: 'gameManager.audioNode', chunks: [] };
      if (connectTap(gameManagerAudioNode, stage.chunks)) auxiliaryStageCaptures.push(stage);
    }
    if ((audioContext.sources?.length ?? 0) > 0) {
      for (const [sourceIndex, source] of (audioContext.sources ?? []).entries()) {
        if (!source?.gain || typeof source.gain.connect !== 'function') continue;
        const outputGain = audioGraphAudit?.outputNode(source.gain, context.destination);
        const captureNode = outputGain ?? source.gain;
        if (tappedGains.has(captureNode)) {
          if (captureSourceStages && outputGain && outputGain !== source.gain && !tappedGains.has(source.gain)) {
            const preOutputChunks = [];
            if (connectTap(source.gain, preOutputChunks)) sourceGainCaptures.push({ sourceIndex, chunks: preOutputChunks });
          }
          connectedSource = true;
          continue;
        }
        const targetChunks = connectedSource ? [] : chunks;
        if (!connectTap(captureNode, targetChunks)) continue;
        connectedSource = true;
        tapPoint = outputGain ? 'source-output-gain' : 'source-gain-fallback';
        if (captureSourceStages && outputGain && outputGain !== source.gain) {
          const preOutputChunks = [];
          if (connectTap(source.gain, preOutputChunks)) sourceGainCaptures.push({ sourceIndex, chunks: preOutputChunks });
        }
      }
    }
    if (!connectedSource && contextGain) {
      connectTap(contextGain, chunks);
      tapPoint = 'master-gain-fallback';
    }
  };
  tapNewSources();
  if (!processors.length && !workletNodes.length) return false;
  const sourceScanTimer = window.setInterval(tapNewSources, 100);
  const sourceInventory = (audioContext.sources ?? []).map((source, sourceIndex) => source?.gain ? {
    sourceIndex,
    sourceKeys: Object.keys(source),
    openALContextKeys: Object.keys(source.context ?? {}),
    bufferQueue: Array.isArray(source.bufQueue) ? source.bufQueue.slice(-4) : source.bufQueue,
    audioQueueSummary: summarizeAudioQueue(source),
    openALBufferSummary: Array.isArray(source.bufQueue) ? source.bufQueue.slice(-4).map(buffer => ({
      bufferId: buffer?.id,
      channels: buffer?.channels,
      length: buffer?.length,
      bytesPerSample: buffer?.bytesPerSample,
      frequency: buffer?.frequency,
    })) : [],
    bufferSampleRate: source.buffer?.sampleRate,
    state: source.state,
    gain: source.gain.gain.value,
    sourceGainValue: source.gain.gain.value,
    minGain: source.minGain,
    maxGain: source.maxGain,
    relative: source.relative,
    position: source.position,
    pannerType: source.panner?.constructor?.name,
    pannerPosition: source.panner ? [source.panner.positionX?.value, source.panner.positionY?.value, source.panner.positionZ?.value] : undefined,
    distanceModel: source.panner?.distanceModel,
    refDistance: source.panner?.refDistance,
    maxDistance: source.panner?.maxDistance,
    rolloffFactor: source.panner?.rolloffFactor,
  } : null).filter(Boolean);
  const graphPaths = audioGraphAudit ? {
    recordedConnections: audioGraphAudit.connectionCount,
    contextGainToDestination: contextGain ? audioGraphAudit.path(contextGain, context.destination) : undefined,
    sourceGainsToDestination: (audioContext.sources ?? []).flatMap((source, sourceIndex) => source?.gain
      ? [{ sourceIndex, path: audioGraphAudit.path(source.gain, context.destination), includesContextGain: contextGain ? audioGraphAudit.pathContains(source.gain, contextGain, context.destination) : false }]
      : []),
  } : undefined;
  window.__musicOpenALCapture = {
    context,
    contextEpochMs: Date.now() - context.currentTime * 1000,
    chunks,
    processors,
    workletNodes,
    silentGains,
    sourceGainCaptures,
    auxiliaryStageCaptures,
    openALAudioBufferCaptures,
    openALAudioBufferSummary,
    restoreAudioBufferSourceTap,
    sourceInventory,
    sourceScanTimer,
    tapPoint,
    contextGainValue: contextGain?.gain?.value,
    getTappedSourceCount: () => tappedSourceCount,
    syncMarkerFrequency: window.__musicSyncMarkerFrequency ?? null,
    syncMarkerPulsePattern: window.__musicSyncMarkerPulsePattern ?? null,
    syncMarkerSampleBase64: window.__musicSyncMarkerSampleBase64 ?? null,
  };
  return {
    markerDetectorInstalled: typeof window.__detectPulsedToneMarkers === 'function',
    sources: (audioContext.sources ?? []).length,
    tappedSources: tappedSourceCount,
    captureType: workletNodes.length ? 'AudioWorklet' : 'ScriptProcessor',
    sampleRate: context.sampleRate,
    tapPoint,
    sourceInventory,
    contextGainValue: contextGain?.gain?.value,
    openALApiKeys: Object.keys(window.EJS_emulator?.Module?.AL ?? {}).filter(key => /buffer|source|audio/i.test(key)),
    openALApiFunctions: Object.keys(window.EJS_emulator?.Module?.AL ?? {}).filter(key => /buffer|source|audio/i.test(key) && typeof window.EJS_emulator.Module.AL[key] === 'function'),
    coreModuleAudioExports: Object.keys(window.EJS_emulator?.Module?.asm ?? window.EJS_emulator?.Module?.wasmExports ?? {}).filter(key => /retro|audio|rate/i.test(key)).sort(),
    coreModuleAudioMethods: Object.keys(window.EJS_emulator?.Module ?? {}).filter(key => /retro|audio|rate/i.test(key)).sort(),
    runtimeAudioConfig,
    graphPaths,
  };
};

const installEmulatorAudioGraphAudit = () => {
  if (window.__musicAudioGraphAudit) return;
  const nativeConnect = AudioNode.prototype.connect;
  const nodeIds = new WeakMap();
  const nodes = new Map();
  const edges = [];
  let nextNodeId = 1;
  const idFor = node => {
    if (!node || (typeof node !== 'object' && typeof node !== 'function')) return 0;
    let id = nodeIds.get(node);
    if (!id) { id = nextNodeId++; nodeIds.set(node, id); nodes.set(id, node); }
    return id;
  };
  const typeFor = node => node?.constructor?.name ?? typeof node;
  AudioNode.prototype.connect = function (destination, ...args) {
    edges.push({ from: idFor(this), to: idFor(destination), fromType: typeFor(this), toType: typeFor(destination) });
    return nativeConnect.call(this, destination, ...args);
  };
  window.__musicAudioGraphAudit = {
    get connectionCount() { return edges.length; },
    outputNode(fromNode, toNode) {
      const route = this.path(fromNode, toNode);
      return route?.length ? nodes.get(route[route.length - 1].fromId) : null;
    },
    path(fromNode, toNode) {
      const from = idFor(fromNode);
      const to = idFor(toNode);
      if (!from || !to) return null;
      const adjacency = new Map();
      for (const edge of edges) {
        if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
        adjacency.get(edge.from).push(edge);
      }
      const pending = [[from, []]];
      const visited = new Set([from]);
      while (pending.length) {
        const [current, path] = pending.shift();
        if (current === to) return path;
        for (const edge of adjacency.get(current) ?? []) {
          if (visited.has(edge.to)) continue;
          visited.add(edge.to);
          pending.push([edge.to, [...path, { fromId: edge.from, toId: edge.to, fromType: edge.fromType, toType: edge.toType }]]);
        }
      }
      return null;
    },
    pathContains(fromNode, viaNode, toNode) {
      const via = idFor(viaNode);
      return Boolean(via && this.path(fromNode, toNode)?.some(edge => edge.fromId === via || edge.toId === via));
    },
  };
};

const finishAudioCapture = async source => {
  const captureOptions = source && typeof source === 'object' ? source : {};
  const sourceType = captureOptions.source ?? source;
  const capture = sourceType === 'openal'
    ? window.__musicOpenALCapture
    : sourceType === 'preview'
      ? window.__musicPreviewCapture
      : sourceType === 'sync'
        ? window.__musicPreviewCapture ?? window.__musicOpenALCapture
        : window.__musicOpenALCapture ?? window.__musicPreviewCapture;
  if (!capture) throw new Error('Audio capture was not initialized.');
  if (capture.sourceScanTimer) window.clearInterval(capture.sourceScanTimer);
  capture.restoreAudioBufferSourceTap?.();
  for (const processor of [...(capture.processors ?? [capture.processor]), ...(capture.workletNodes ?? [])]) processor?.disconnect();
  for (const silentGain of capture.silentGains ?? [capture.silentGain]) silentGain?.disconnect();
  const sampleRate = capture.context.sampleRate;
  const sourceGainRmsByIndex = (capture.sourceGainCaptures ?? []).map(({ sourceIndex, chunks }) => {
    let power = 0;
    let sampleCount = 0;
    for (const [left, right] of chunks) {
      for (let index = 0; index < left.length; index += 1) {
        power += left[index] * left[index] + right[index] * right[index];
        sampleCount += 2;
      }
    }
    return { sourceIndex, rms: Math.sqrt(power / Math.max(1, sampleCount)), chunks: chunks.length };
  });
  const auxiliaryStageRmsByName = (capture.auxiliaryStageCaptures ?? []).map(({ name, chunks }) => {
    let power = 0;
    let sampleCount = 0;
    for (const [left, right] of chunks) {
      for (let index = 0; index < left.length; index += 1) {
        power += left[index] * left[index] + right[index] * right[index];
        sampleCount += 2;
      }
    }
    return { name, rms: Math.sqrt(power / Math.max(1, sampleCount)), chunks: chunks.length };
  });
  const timestamped = capture.chunks.length > 0 && Number.isFinite(capture.chunks[0][2]);
  const recordedDuration = capture.chunks.reduce((total, chunk) => total + chunk[0].length, 0) / sampleRate;
  const callbackTimes = capture.chunks.map(chunk => chunk[3]).filter(Number.isFinite);
  const callbackWallDuration = callbackTimes.length > 1 ? (Math.max(...callbackTimes) - Math.min(...callbackTimes)) / 1000 : 0;
  const timelineSpan = timestamped
    ? Math.max(...capture.chunks.map(chunk => chunk[2] + chunk[0].length / sampleRate)) - Math.min(...capture.chunks.map(chunk => chunk[2]))
    : recordedDuration;
  const timestampGapDuration = Math.max(0, timelineSpan - recordedDuration);
  let captureStartTime = 0;
  let chunkPeak = 0;
  let overlappingChunkCount = 0;
  let maximumChunkOverlapFrames = 0;
  let channel;
  let channelRight;
  if (timestamped) {
    const earliestChunkTime = Math.min(...capture.chunks.map(chunk => chunk[2]));
    const firstTime = Math.max(earliestChunkTime, capture.trimStartTime ?? earliestChunkTime);
    const requestedEndTime = Number.isFinite(capture.trimEndTime) ? Math.max(firstTime, capture.trimEndTime) : null;
    captureStartTime = firstTime;
    const selectedChunks = capture.chunks.filter(chunk => chunk[2] + chunk[0].length / sampleRate > firstTime
      && (requestedEndTime === null || chunk[2] < requestedEndTime));
    const sampleCount = requestedEndTime === null
      ? Math.max(0, Math.round((Math.max(...selectedChunks.map(chunk => chunk[2])) - firstTime) * sampleRate) + capture.chunks[0][0].length)
      : Math.max(0, Math.round((Math.min(requestedEndTime, Math.max(...selectedChunks.map(chunk => chunk[2] + chunk[0].length / sampleRate))) - firstTime) * sampleRate));
    channel = new Float32Array(sampleCount);
    channelRight = new Float32Array(sampleCount);
    const contributions = new Uint16Array(sampleCount);
    const orderedChunks = [...selectedChunks].sort((left, right) => left[2] - right[2]);
    let previousChunkEnd = 0;
    for (const chunk of orderedChunks) {
      const selectedLeft = captureOptions.preLimiter === true ? chunk[4] ?? chunk[0] : chunk[0];
      const selectedRight = captureOptions.preLimiter === true ? chunk[5] ?? chunk[1] : chunk[1];
      const sourceStart = Math.max(0, Math.round((firstTime - chunk[2]) * sampleRate));
      const start = Math.max(0, Math.round((chunk[2] - firstTime) * sampleRate));
      const overlap = Math.max(0, previousChunkEnd - start);
      if (overlap > 0) {
        overlappingChunkCount += 1;
        maximumChunkOverlapFrames = Math.max(maximumChunkOverlapFrames, overlap);
      }
      previousChunkEnd = Math.max(previousChunkEnd, start + chunk[0].length);
      const count = Math.min(chunk[0].length - sourceStart, channel.length - start);
      for (let index = 0; index < count; index += 1) {
        chunkPeak = Math.max(chunkPeak, Math.abs(selectedLeft[sourceStart + index]));
        channel[start + index] += selectedLeft[sourceStart + index];
        channelRight[start + index] += selectedRight[sourceStart + index];
        contributions[start + index] += 1;
      }
    }
    for (let index = 0; index < sampleCount; index += 1) {
      const contributionCount = contributions[index];
      if (contributionCount > 1) {
        channel[index] /= contributionCount;
        channelRight[index] /= contributionCount;
      }
    }
  } else {
    channel = capture.chunks.flatMap(chunk => Array.from(captureOptions.preLimiter === true ? chunk[4] ?? chunk[0] : chunk[0]));
    channelRight = capture.chunks.flatMap(chunk => Array.from(captureOptions.preLimiter === true ? chunk[5] ?? chunk[1] : chunk[1]));
  }
  const windowSize = 2048;
  let squareSum = 0;
  let peak = 0;
  let activeWindows = 0;
  let activeSquares = 0;
  let activeSamples = 0;
  let activeRightSquares = 0;
  let activeRightSamples = 0;
  let stereoActiveSquares = 0;
  let stereoActiveSamples = 0;
  let firstActive = -1;
  let lastActive = -1;
  for (let offset = 0; offset < channel.length; offset += windowSize) {
    const end = Math.min(channel.length, offset + windowSize);
    let windowSquares = 0;
    let windowRightSquares = 0;
    for (let index = offset; index < end; index += 1) {
      const magnitude = Math.abs(channel[index]);
      squareSum += channel[index] * channel[index];
      windowSquares += channel[index] * channel[index];
      windowRightSquares += channelRight[index] * channelRight[index];
      peak = Math.max(peak, magnitude);
    }
    const rms = Math.sqrt(windowSquares / Math.max(1, end - offset));
    if (rms > 0.0005) {
      activeWindows += 1;
      activeSquares += windowSquares;
      activeSamples += end - offset;
      if (firstActive < 0) firstActive = offset / sampleRate;
      lastActive = end / sampleRate;
    }
    if (Math.sqrt(windowRightSquares / Math.max(1, end - offset)) > 0.0005) {
      activeRightSquares += windowRightSquares;
      activeRightSamples += end - offset;
    }
    if (Math.sqrt((windowSquares + windowRightSquares) / Math.max(1, (end - offset) * 2)) > 0.0005) {
      stereoActiveSquares += windowSquares + windowRightSquares;
      stereoActiveSamples += (end - offset) * 2;
    }
  }
  const rms = Math.sqrt(squareSum / Math.max(1, channel.length));
  const leftRms = rms;
  const rightRms = Math.sqrt(channelRight.reduce((sum, sample) => sum + sample * sample, 0) / Math.max(1, channelRight.length));
  const activeRms = Math.sqrt(activeSquares / Math.max(1, activeSamples));
  const rightActiveRms = Math.sqrt(activeRightSquares / Math.max(1, activeRightSamples));
  const stereoActiveRms = Math.sqrt(stereoActiveSquares / Math.max(1, stereoActiveSamples));
  const envelopeBlock = Math.max(64, Math.round(sampleRate * 0.005));
  // A short startup transient can be far louder than the musical signal.
  // Bound the onset threshold by the capture's RMS so that one peak cannot
  // hide every subsequent note attack.
  const envelopeThreshold = Math.max(0.0005, Math.min(peak * 0.05, rms * 0.25));
  const onsetTimes = [];
  let activeStartSample = -1;
  for (let offset = 0; offset < channel.length; offset += envelopeBlock) {
    const end = Math.min(channel.length, offset + envelopeBlock);
    let blockSquares = 0;
    for (let index = offset; index < end; index += 1) blockSquares += channel[index] * channel[index];
    const blockRms = Math.sqrt(blockSquares / Math.max(1, end - offset));
    if (blockRms > envelopeThreshold && activeStartSample < 0) activeStartSample = offset;
    if (blockRms <= envelopeThreshold && activeStartSample >= 0) {
      if (offset - activeStartSample >= sampleRate * 0.02) onsetTimes.push(activeStartSample / sampleRate);
      activeStartSample = -1;
    }
  }
  if (activeStartSample >= 0 && channel.length - activeStartSample >= sampleRate * 0.02) onsetTimes.push(activeStartSample / sampleRate);
  let syncMarkerTemplateMatches = [];
  let syncMarkerExpectedSecondTemplateMatches = [];
  let syncMarkerExpectedSecondStartMs = null;
  if (capture.syncMarkerSampleBase64 && typeof window.__findModSampleTemplateMatches === 'function') {
    const markerBinary = atob(capture.syncMarkerSampleBase64);
    const markerBytes = Uint8Array.from(markerBinary, character => character.charCodeAt(0));
    const sourceSteps = [0.52, 0.525146, 0.53];
    const sampleSteps = sampleRate > 20_000
      ? sourceSteps.map(step => step * 15_768 / sampleRate)
      : sourceSteps;
    syncMarkerTemplateMatches = window.__findModSampleTemplateMatches(
      [channel, channelRight],
      markerBytes,
      sampleRate,
      {
        sampleSteps,
        searchWindowsMs: capture.syncMarkerSampleSearchWindowsMs,
        coarseHopFrames: 16,
        maximumMatches: 8,
      },
    );
    if (Number.isFinite(capture.syncMarkerExpectedIntervalMs)) {
      const firstMatch = syncMarkerTemplateMatches
        .filter(match => match.timeMs < capture.syncMarkerExpectedIntervalMs / 2)
        .sort((left, right) => right.correlation - left.correlation)[0];
      if (firstMatch) {
        syncMarkerExpectedSecondStartMs = firstMatch.timeMs + capture.syncMarkerExpectedIntervalMs;
        syncMarkerExpectedSecondTemplateMatches = window.__findModSampleTemplateMatches(
          [channel, channelRight],
          markerBytes,
          sampleRate,
          {
            sampleSteps,
            searchWindowsMs: [[syncMarkerExpectedSecondStartMs - 30, syncMarkerExpectedSecondStartMs + 30]],
            coarseHopFrames: 8,
            maximumMatches: 4,
          },
        );
      }
    }
  }
  let estimatedPitch = null;
  let harmonicPitch = null;
  let toneOnsetTimes = [];
  const spectrumSize = 8_192;
  if (firstActive >= 0 && channel.length >= spectrumSize + 1) {
    const start = Math.min(channel.length - spectrumSize - 1, Math.round(firstActive * sampleRate));
    const minimumBin = Math.max(1, Math.floor(80 * spectrumSize / sampleRate));
    const maximumBin = Math.min(spectrumSize / 2 - 1, Math.ceil(1_200 * spectrumSize / sampleRate));
    const powers = new Float64Array(maximumBin + 2);
    const windowedChannel = new Float64Array(spectrumSize);
    for (let index = 0; index < spectrumSize; index += 1) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (spectrumSize - 1));
      windowedChannel[index] = channel[start + index] * window;
    }
    let peakBin = 0;
    let peakPower = -Infinity;
    for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
      const coefficient = 2 * Math.cos((2 * Math.PI * bin) / spectrumSize);
      let previous = 0;
      let previousPrevious = 0;
      for (let index = 0; index < spectrumSize; index += 1) {
        const current = windowedChannel[index] + coefficient * previous - previousPrevious;
        previousPrevious = previous;
        previous = current;
      }
      const power = previous * previous + previousPrevious * previousPrevious - coefficient * previous * previousPrevious;
      powers[bin] = power;
      if (power > peakPower) { peakPower = power; peakBin = bin; }
    }
    let harmonicBin = 0;
    let bestHarmonicScore = -Infinity;
    for (let bin = minimumBin; bin <= Math.min(maximumBin >> 1, Math.floor(600 * spectrumSize / sampleRate)); bin += 1) {
      const score = Math.log(Math.max(Number.EPSILON, powers[bin])) + Math.log(Math.max(Number.EPSILON, powers[bin * 2]));
      if (score > bestHarmonicScore) { bestHarmonicScore = score; harmonicBin = bin; }
    }
    if (harmonicBin) harmonicPitch = 69 + 12 * Math.log2((harmonicBin * sampleRate / spectrumSize) / 440);
    if (peakBin) {
      const left = Math.log(Math.max(Number.EPSILON, powers[peakBin - 1]));
      const center = Math.log(Math.max(Number.EPSILON, powers[peakBin]));
      const right = Math.log(Math.max(Number.EPSILON, powers[peakBin + 1]));
      const curvature = left - 2 * center + right;
      const correction = curvature ? 0.5 * (left - right) / curvature : 0;
      const frequency = ((peakBin + Math.max(-0.5, Math.min(0.5, correction))) * sampleRate) / spectrumSize;
      estimatedPitch = 69 + 12 * Math.log2(frequency / 440);
    }
  }
  if (estimatedPitch !== null && channel.length >= Math.round(sampleRate * 0.05)) {
    const frequency = 440 * Math.pow(2, (estimatedPitch - 69) / 12);
    const analysisSize = Math.round(sampleRate * 0.03);
    const hopSize = Math.round(sampleRate * 0.005);
    const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate);
    const analysisWindow = new Float64Array(analysisSize);
    for (let index = 0; index < analysisSize; index += 1) {
      analysisWindow[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (analysisSize - 1));
    }
    const envelope = [];
    for (let offset = 0; offset + analysisSize <= channel.length; offset += hopSize) {
      let previous = 0;
      let previousPrevious = 0;
      for (let index = 0; index < analysisSize; index += 1) {
        const current = channel[offset + index] * analysisWindow[index] + coefficient * previous - previousPrevious;
        previousPrevious = previous;
        previous = current;
      }
      const power = previous * previous + previousPrevious * previousPrevious - coefficient * previous * previousPrevious;
      envelope.push(Math.sqrt(Math.max(0, power)));
    }
    const maximumToneLevel = Math.max(0, ...envelope);
    const toneThreshold = Math.max(0.001, maximumToneLevel * 0.22);
    let toneStart = -1;
    envelope.forEach((level, index) => {
      if (level > toneThreshold && toneStart < 0) toneStart = index * hopSize;
      if (level <= toneThreshold && toneStart >= 0) {
        if (index * hopSize - toneStart >= sampleRate * 0.03) toneOnsetTimes.push(toneStart / sampleRate);
        toneStart = -1;
      }
    });
    if (toneStart >= 0 && envelope.length * hopSize - toneStart >= sampleRate * 0.03) toneOnsetTimes.push(toneStart / sampleRate);
  }
  const onsetRmsWindows = (toneOnsetTimes.length ? toneOnsetTimes : onsetTimes).map(time => {
    const start = Math.max(0, Math.min(channel.length, Math.round((time + 0.01) * sampleRate)));
    const end = Math.max(start, Math.min(channel.length, start + Math.round(sampleRate * 0.1)));
    let leftSquares = 0;
    let rightSquares = 0;
    for (let index = start; index < end; index += 1) {
      leftSquares += channel[index] * channel[index];
      rightSquares += channelRight[index] * channelRight[index];
    }
    const frames = Math.max(0, end - start);
    return {
      onset: time,
      duration: frames / sampleRate,
      leftRms: Math.sqrt(leftSquares / Math.max(1, frames)),
      rightRms: Math.sqrt(rightSquares / Math.max(1, frames)),
      rms: Math.sqrt((leftSquares + rightSquares) / Math.max(1, frames * 2)),
    };
  });
  let autocorrelationPitch = null;
  if (firstActive >= 0) {
    const start = Math.round(firstActive * sampleRate);
    const count = Math.min(4096, channel.length - start);
    const minimumLag = Math.max(2, Math.floor(sampleRate / 1_000));
    const maximumLag = Math.min(Math.floor(sampleRate / 100), Math.floor(count / 2));
    let mean = 0;
    for (let index = 0; index < count; index += 1) mean += channel[start + index];
    mean /= Math.max(1, count);
    const correlations = new Float64Array(maximumLag + 1);
    for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
      let cross = 0;
      let left = 0;
      let right = 0;
      for (let index = 0; index < count - lag; index += 1) {
        const a = channel[start + index] - mean;
        const b = channel[start + index + lag] - mean;
        cross += a * b;
        left += a * a;
        right += b * b;
      }
      correlations[lag] = cross / Math.sqrt(Math.max(Number.EPSILON, left * right));
    }
    for (let lag = minimumLag + 1; lag < maximumLag; lag += 1) {
      if (correlations[lag] < 0.75 || correlations[lag] < correlations[lag - 1] || correlations[lag] <= correlations[lag + 1]) continue;
      const left = correlations[lag - 1];
      const center = correlations[lag];
      const right = correlations[lag + 1];
      const curvature = left - 2 * center + right;
      const correction = curvature ? 0.5 * (left - right) / curvature : 0;
      const period = lag + Math.max(-0.5, Math.min(0.5, correction));
      autocorrelationPitch = 69 + 12 * Math.log2((sampleRate / period) / 440);
      break;
    }
  }
  if (window.__musicOpenALCapture === capture) window.__musicOpenALCapture = undefined;
  if (window.__musicPreviewCapture === capture) window.__musicPreviewCapture = undefined;
  const onsetIntervals = onsetTimes.slice(1).map((time, index) => time - onsetTimes[index]);
  const envelopeWindowFrames = Math.max(1, Math.round(sampleRate * 0.01));
  const leftEnvelope = [];
  const rightEnvelope = [];
  const envelope = Array.from({ length: Math.ceil(channel.length / envelopeWindowFrames) }, (_, windowIndex) => {
    const start = windowIndex * envelopeWindowFrames;
    const end = Math.min(channel.length, start + envelopeWindowFrames);
    let sum = 0;
    let leftSum = 0;
    let rightSum = 0;
    for (let index = start; index < end; index += 1) {
      leftSum += channel[index] * channel[index];
      rightSum += channelRight[index] * channelRight[index];
      sum += channel[index] * channel[index] + channelRight[index] * channelRight[index];
    }
    leftEnvelope.push(Math.sqrt(leftSum / Math.max(1, end - start)));
    rightEnvelope.push(Math.sqrt(rightSum / Math.max(1, end - start)));
    return Math.sqrt(sum / Math.max(2, (end - start) * 2));
  });
  const pitchSegments = sourceType === 'pitch' || sourceType === 'pitch-segments'
    ? Array.from({ length: Math.floor(channel.length / Math.round(sampleRate * 0.08)) }, (_, segmentIndex) => {
      const start = segmentIndex * Math.round(sampleRate * 0.08);
      const end = Math.min(channel.length, start + Math.round(sampleRate * 0.08));
      let firstCrossing = -1;
      let lastCrossing = -1;
      let crossings = 0;
      for (let index = start + 1; index < end; index += 1) {
        if (channel[index - 1] <= 0 && channel[index] > 0) {
          if (firstCrossing < 0) firstCrossing = index;
          lastCrossing = index;
          crossings += 1;
        }
      }
      const frequency = crossings > 1 ? (crossings - 1) * sampleRate / (lastCrossing - firstCrossing) : 0;
      return { time: start / sampleRate, pitch: frequency > 0 ? 69 + 12 * Math.log2(frequency / 440) : null };
    })
    : undefined;
  const spectralPitchSegments = sourceType === 'pitch-spectral-segments'
    ? Array.from({ length: Math.max(0, Math.floor((channel.length - 4_096) / Math.round(sampleRate * 0.08)) + 1) }, (_, segmentIndex) => {
      const windowFrames = 4_096;
      const start = segmentIndex * Math.round(sampleRate * 0.08);
      const minimumBin = Math.max(1, Math.floor(200 * windowFrames / sampleRate));
      const maximumBin = Math.min(windowFrames / 2 - 1, Math.ceil(2_000 * windowFrames / sampleRate));
      let peakBin = 0;
      let peakPower = -Infinity;
      const powers = new Float64Array(maximumBin + 2);
      for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
        const coefficient = 2 * Math.cos((2 * Math.PI * bin) / windowFrames);
        let previous = 0;
        let previousPrevious = 0;
        for (let index = 0; index < windowFrames; index += 1) {
          const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (windowFrames - 1));
          const current = channel[start + index] * hann + coefficient * previous - previousPrevious;
          previousPrevious = previous;
          previous = current;
        }
        const power = previous * previous + previousPrevious * previousPrevious - coefficient * previous * previousPrevious;
        powers[bin] = power;
        if (power > peakPower) { peakPower = power; peakBin = bin; }
      }
      const left = Math.log(Math.max(Number.EPSILON, powers[peakBin - 1]));
      const center = Math.log(Math.max(Number.EPSILON, powers[peakBin]));
      const right = Math.log(Math.max(Number.EPSILON, powers[peakBin + 1]));
      const curvature = left - 2 * center + right;
      const correction = curvature ? 0.5 * (left - right) / curvature : 0;
      const frequency = ((peakBin + Math.max(-0.5, Math.min(0.5, correction))) * sampleRate) / windowFrames;
      return { time: start / sampleRate, pitch: peakBin && peakPower > Number.EPSILON ? 69 + 12 * Math.log2(frequency / 440) : null };
    })
    : undefined;
  const rmsSegments = sourceType === 'segments' || sourceType === 'pitch-segments' || sourceType === 'pitch-spectral-segments' || sourceType === 'sync'
    ? Array.from({ length: Math.ceil(channel.length / Math.round(sampleRate * 0.08)) }, (_, segmentIndex) => {
      const start = segmentIndex * Math.round(sampleRate * 0.08);
      const end = Math.min(channel.length, start + Math.round(sampleRate * 0.08));
      let sum = 0;
      for (let index = start; index < end; index += 1) sum += channel[index] * channel[index];
      return { time: start / sampleRate, rms: Math.sqrt(sum / Math.max(1, end - start)) };
    })
    : undefined;
  const stereoRmsSegments = sourceType === 'segments' || sourceType === 'pitch-segments' || sourceType === 'sync'
    ? Array.from({ length: Math.ceil(channel.length / Math.round(sampleRate * 0.08)) }, (_, segmentIndex) => {
      const start = segmentIndex * Math.round(sampleRate * 0.08);
      const end = Math.min(channel.length, start + Math.round(sampleRate * 0.08));
      let sum = 0;
      for (let index = start; index < end; index += 1) sum += channel[index] ** 2 + channelRight[index] ** 2;
      return { time: start / sampleRate, rms: Math.sqrt(sum / Math.max(1, (end - start) * 2)) };
    })
    : undefined;
  let syncMarkerOnsetTimes = [];
  let syncMarkerOnsetCandidates = [];
  let syncMarkerRightOnsetCandidates = [];
  if (Number.isFinite(capture.syncMarkerFrequency)) {
    if (capture.syncMarkerPulsePattern) {
      const markerDiagnostics = {};
      syncMarkerOnsetCandidates = window.__detectPulsedToneMarkers?.(channel, sampleRate, capture.syncMarkerFrequency, capture.syncMarkerPulsePattern, markerDiagnostics) ?? [];
      syncMarkerOnsetTimes = syncMarkerOnsetCandidates.map(marker => marker.time);
      capture.syncMarkerDetectionDiagnostics = markerDiagnostics;
      const rightMarkerDiagnostics = {};
      syncMarkerRightOnsetCandidates = window.__detectPulsedToneMarkers?.(channelRight, sampleRate, capture.syncMarkerFrequency, capture.syncMarkerPulsePattern, rightMarkerDiagnostics) ?? [];
      capture.syncMarkerRightDetectionDiagnostics = rightMarkerDiagnostics;
    } else {
    const blockSize = Math.max(128, Math.round(sampleRate * 0.008));
    const hopSize = Math.max(32, Math.round(sampleRate * 0.002));
    const coefficient = 2 * Math.cos((2 * Math.PI * capture.syncMarkerFrequency) / sampleRate);
    const markerPower = [];
    for (let offset = 0; offset + blockSize <= channel.length; offset += hopSize) {
      let previous = 0;
      let previousPrevious = 0;
      for (let index = 0; index < blockSize; index += 1) {
        const current = channel[offset + index] + coefficient * previous - previousPrevious;
        previousPrevious = previous;
        previous = current;
      }
      markerPower.push(previous * previous + previousPrevious * previousPrevious - coefficient * previous * previousPrevious);
    }
    let maximumMarkerPower = 0;
    for (const power of markerPower) maximumMarkerPower = Math.max(maximumMarkerPower, power);
    const markerThreshold = maximumMarkerPower * 0.1;
    let activeStart = -1;
    let lastActive = -1;
    markerPower.forEach((power, index) => {
      if (maximumMarkerPower > 1e-8 && power >= markerThreshold) {
        if (activeStart < 0) activeStart = index;
        lastActive = index;
      } else if (activeStart >= 0 && index - lastActive > 8) {
        syncMarkerOnsetTimes.push(activeStart * hopSize / sampleRate);
        activeStart = -1;
      }
    });
    if (activeStart >= 0) syncMarkerOnsetTimes.push(activeStart * hopSize / sampleRate);
    }
  }
  const waveformRanges = captureOptions.waveformRanges?.map(({ startSeconds, durationSeconds, stride = 8 }) => {
    const startFrame = Math.max(0, Math.round(startSeconds * sampleRate));
    const endFrame = Math.min(channel.length, Math.round((startSeconds + durationSeconds) * sampleRate));
    const left = [];
    const right = [];
    for (let frame = startFrame; frame + stride <= endFrame; frame += stride) {
      let leftSum = 0;
      let rightSum = 0;
      for (let offset = 0; offset < stride; offset += 1) {
        leftSum += channel[frame + offset];
        rightSum += channelRight[frame + offset];
      }
      left.push(leftSum / stride);
      right.push(rightSum / stride);
    }
    return { startSeconds, durationSeconds: (endFrame - startFrame) / sampleRate, stride, left, right };
  }) ?? [];
  const panSpacing = captureOptions.panEventWindows?.length > 1
    ? captureOptions.panEventWindows[1].startSeconds - captureOptions.panEventWindows[0].startSeconds
    : null;
  let panWindowOrigin = toneOnsetTimes[0] ?? onsetTimes[0] ?? firstActive;
  let panWindowAttackTimes;
  const expectedPanAttackIntervals = captureOptions.panEventAttackIntervals;
  if (Array.isArray(expectedPanAttackIntervals)
    && expectedPanAttackIntervals.length === captureOptions.panEventWindows?.length - 1) {
    let bestSequence;
    let bestScore = Infinity;
    for (let start = 0; start < onsetTimes.length; start += 1) {
      const sequence = [onsetTimes[start]];
      let previousIndex = start;
      let score = 0;
      let valid = true;
      for (const interval of expectedPanAttackIntervals) {
        let candidateIndex = -1;
        let candidateError = Infinity;
        for (let index = previousIndex + 1; index < onsetTimes.length; index += 1) {
          const error = Math.abs((onsetTimes[index] - sequence.at(-1)) - interval);
          if (error < candidateError) { candidateIndex = index; candidateError = error; }
        }
        if (candidateError >= 0.08) { valid = false; break; }
        sequence.push(onsetTimes[candidateIndex]);
        previousIndex = candidateIndex;
        score += candidateError * candidateError;
      }
      if (!valid) continue;
      if (score < bestScore) {
        bestSequence = sequence;
        bestScore = score;
      }
    }
    if (bestSequence) panWindowAttackTimes = bestSequence;
  } else if (Number.isFinite(panSpacing) && panSpacing > 0 && captureOptions.panEventWindows.length > 1) {
    let bestSequence;
    let bestScore = Infinity;
    for (let start = 0; start + captureOptions.panEventWindows.length <= onsetTimes.length; start += 1) {
      const sequence = onsetTimes.slice(start, start + captureOptions.panEventWindows.length);
      const errors = sequence.slice(1).map((time, index) => Math.abs((time - sequence[index]) - panSpacing));
      const score = errors.reduce((sum, error) => sum + error * error, 0);
      if (errors.every(error => error < 0.08) && score < bestScore) {
        bestSequence = sequence;
        bestScore = score;
      }
    }
    if (bestSequence) panWindowOrigin = bestSequence[0];
  }
  const stereoPanWindows = captureOptions.panEventWindows?.map(({ startSeconds, endSeconds }, index) => {
    const eventOrigin = panWindowAttackTimes?.[index] ?? panWindowOrigin;
    const start = Math.max(0, Math.min(channel.length, Math.round((eventOrigin + startSeconds) * sampleRate)));
    const end = Math.max(start, Math.min(channel.length, Math.round((eventOrigin + endSeconds) * sampleRate)));
    let leftSquares = 0;
    let rightSquares = 0;
    for (let index = start; index < end; index += 1) {
      leftSquares += channel[index] * channel[index];
      rightSquares += channelRight[index] * channelRight[index];
    }
    const frames = Math.max(1, end - start);
    const leftRms = Math.sqrt(leftSquares / frames);
    const rightRms = Math.sqrt(rightSquares / frames);
    return { startSeconds, endSeconds, leftRms, rightRms, balance: rightRms / Math.max(1e-9, leftRms) };
  }) ?? [];
  let syncSpectrumWindow;
  if (sourceType === 'sync' && syncMarkerOnsetTimes.length >= 2) {
    const start = Math.round((syncMarkerOnsetTimes[1] + 0.1) * sampleRate);
    const length = Math.min(4_096, channel.length - start);
    if (length >= 2_048) syncSpectrumWindow = {
      markerRelativeStartMs: 100,
      sampleRate,
      left: Array.from(channel.subarray(start, start + length)),
      right: Array.from(channelRight.subarray(start, start + length)),
    };
  }
  let syncSpectrumRightWindow;
  const syncMarkerRightOnsetTimes = syncMarkerRightOnsetCandidates.map(marker => marker.time);
  if (sourceType === 'sync' && syncMarkerRightOnsetTimes.length >= 2) {
    const start = Math.round((syncMarkerRightOnsetTimes[1] + 0.1) * sampleRate);
    const length = Math.min(4_096, channel.length - start);
    if (length >= 2_048) syncSpectrumRightWindow = {
      markerRelativeStartMs: 100,
      sampleRate,
      left: Array.from(channel.subarray(start, start + length)),
      right: Array.from(channelRight.subarray(start, start + length)),
    };
  }
  return { captureType: capture.workletNodes?.length ? 'AudioWorklet' : 'ScriptProcessor', contextState: capture.context.state, tappedSourceCount: capture.getTappedSourceCount?.() ?? capture.processors?.length ?? 0, tapPoint: capture.tapPoint, sourceInventory: capture.sourceInventory ?? [], sourceGainRmsByIndex, auxiliaryStageRmsByName, openALAudioBufferCaptures: capture.openALAudioBufferCaptures ?? [], preLimiterStats: capture.preLimiterStats ?? [], preLimiterCaptureChunks: capture.chunks.filter(chunk => chunk[4] instanceof Float32Array && chunk[5] instanceof Float32Array).length, duration: channel.length / sampleRate, recordedDuration, callbackWallDuration, timestampGapDuration, timestampRate: callbackWallDuration > 0 ? timelineSpan / callbackWallDuration : null, capturedChunks: capture.chunks.length, firstChunkTime: capture.chunks[0]?.[2] ?? null, lastChunkTime: capture.chunks.at(-1)?.[2] ?? null, sampleRate, channels: capture.chunks[0] ? (capture.chunks[0][1] ? 2 : 1) : 0, timestamped, contextEpochMs: capture.context.__musicPreviewResumeEpochMs ?? capture.contextEpochMs, captureStartTime, captureTrimStartTime: capture.trimStartTime ?? null, captureStartOffsetFromTrimStart: Number.isFinite(capture.trimStartTime) ? captureStartTime - capture.trimStartTime : null, rms, leftRms, rightRms, activeRms, rightActiveRms, stereoActiveRms, peak, chunkPeak, overlappingChunkCount, maximumChunkOverlapFrames, activeWindows, activeDuration: Math.max(0, lastActive - firstActive), estimatedPitch, harmonicPitch, autocorrelationPitch, onsetTimes, onsetIntervals, toneOnsetTimes, onsetRmsWindows, syncMarkerOnsetTimes, syncMarkerOnsetCandidates, syncMarkerRightOnsetCandidates, syncMarkerTemplateMatches, syncMarkerExpectedSecondStartMs, syncMarkerExpectedSecondTemplateMatches, syncMarkerDetectionDiagnostics: capture.syncMarkerDetectionDiagnostics ?? null, syncMarkerRightDetectionDiagnostics: capture.syncMarkerRightDetectionDiagnostics ?? null, ...(syncSpectrumWindow ? { syncSpectrumWindow } : {}), ...(syncSpectrumRightWindow ? { syncSpectrumRightWindow } : {}), ...(panWindowAttackTimes ? { panWindowAttackTimes } : {}), ...(['sync', 'openal', 'pitch', 'pitch-segments', 'pitch-spectral-segments'].includes(sourceType) ? { envelope, leftEnvelope, rightEnvelope, envelopeWindowSeconds: envelopeWindowFrames / sampleRate } : {}), ...(pitchSegments ? { pitchSegments } : {}), ...(spectralPitchSegments ? { spectralPitchSegments } : {}), ...(rmsSegments ? { rmsSegments } : {}), ...(stereoRmsSegments ? { stereoRmsSegments } : {}), ...(waveformRanges.length ? { waveformRanges } : {}), ...(stereoPanWindows.length ? { stereoPanWindows } : {}), ...(captureOptions.includePcm === true ? { audioSamples: Array.from(channel), rightAudioSamples: Array.from(channelRight) } : {}) };
};

const decodeMaxmodCapturePng = png => {
  if (png.toString('ascii', 1, 4) !== 'PNG') throw new Error('The emulator screenshot is not a PNG image.');
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const compressed = [];
  for (let offset = 8; offset + 12 <= png.length;) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') compressed.push(data);
    offset += length + 12;
    if (type === 'IEND') break;
  }
  if (bitDepth !== 8 || ![2, 6].includes(colorType)) throw new Error(`Unsupported emulator PNG layout: ${JSON.stringify({ width, height, bitDepth, colorType })}.`);
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const rowBytes = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(compressed));
  const pixels = Buffer.alloc(rowBytes * height);
  const paeth = (left, above, upperLeft) => {
    const estimate = left + above - upperLeft;
    const leftDistance = Math.abs(estimate - left);
    const aboveDistance = Math.abs(estimate - above);
    const upperLeftDistance = Math.abs(estimate - upperLeft);
    return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left
      : aboveDistance <= upperLeftDistance ? above : upperLeft;
  };
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[sourceOffset++];
    const rowOffset = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const raw = filtered[sourceOffset++];
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[rowOffset + x - rowBytes] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[rowOffset + x - rowBytes - bytesPerPixel] : 0;
      pixels[rowOffset + x] = (raw + (filter === 1 ? left : filter === 2 ? above : filter === 3 ? Math.floor((left + above) / 2) : filter === 4 ? paeth(left, above, upperLeft) : 0)) & 0xff;
    }
  }
  return { width, height, pixels, bytesPerPixel };
};
const unpackMaxmodCapturePixels = (image, byteLength = 15_856) => {
  const bytes = Buffer.alloc(byteLength);
  for (let index = 0; index < bytes.length; index += 1) {
    const logicalX = index % 240;
    const logicalY = Math.floor(index / 240);
    const x = Math.min(image.width - 1, Math.floor((logicalX + 0.5) * image.width / 240));
    const y = Math.min(image.height - 1, Math.floor((logicalY + 0.5) * image.height / 160));
    const offset = (y * image.width + x) * image.bytesPerPixel;
    const red = Math.round(image.pixels[offset] * 31 / 255);
    const green = Math.round(image.pixels[offset + 1] * 31 / 255);
    bytes[index] = (red << 3) | (green >> 2);
  }
  return bytes;
};










const openMusicLibrary = async (electronApp, { expectBeatEditor = true } = {}) => {
  await electronApp.context().addInitScript(installEmulatorAudioGraphAudit);
  await electronApp.firstWindow();
  await expect.poll(() => electronApp.windows().map(page => page.url()), { timeout: 15_000 }).toContainEqual(expect.stringMatching(/#engine/));
  const engine = electronApp.windows().find(page => page.url().includes('#engine'));
  if (!engine) throw new Error('The Engine window did not open.');
  engine.setDefaultTimeout(5_000);
  await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
  const workspaceMenu = engine.locator('.ant-dropdown-trigger').first();
  await expect(workspaceMenu).toBeVisible({ timeout: 15_000 });
  await expect(workspaceMenu).toBeEnabled();
  await workspaceMenu.click({ timeout: 15_000 });
  await engine.getByRole('menuitem').filter({ hasText: /m.sic/i }).click();
  if (expectBeatEditor) {
    const musicBeatEditor = engine.getByLabel('Music beat editor');
    if (!(await musicBeatEditor.isVisible().catch(() => false))) {
      // The library can restore selection to an original tracker module,
      // whose preview/import surface has no editable beat grid. Select an
      // authored project explicitly so these editor tests do not depend on
      // whichever library item happened to be selected at startup.
      const savedMusicProject = engine.getByRole('listitem').filter({ hasText: /\.gbatracker/ }).first();
      await expect(savedMusicProject).toBeVisible({ timeout: 15_000 });
      await savedMusicProject.click();
    }
    await expect(musicBeatEditor).toBeVisible({ timeout: 15_000 });
  }
  return engine;
};

const selectMusicInstrument = async (engine, index = 1) => {
  const section = engine.getByRole('button', { name: /^INSTRUMENTS$/i });
  if (await section.getAttribute('aria-expanded') !== 'true') await section.click();
  const panel = engine.locator('.ant-splitter-panel').filter({ has: section });
  const number = String(index).padStart(2, '0');
  const instrument = panel.getByRole('button').filter({ hasText: new RegExp(`^(?:${number}:|Instrument ${number}\\b)`) });
  await expect(instrument).toHaveCount(1);
  await instrument.click();
  await engine.getByRole('tab', { name: 'Sample', exact: true }).click();
  await expect(engine.getByRole('button', { name: /Replace selected sample with audio|Substituir sample selecionado por áudio|Reemplazar la muestra seleccionada por audio|Remplacer le sample sélectionné par un audio/ })).toBeEnabled();
};
const playRawTrackerModulePreview = async (engine, encoded, format) => engine.evaluate(async ({ encodedModule, moduleFormat }) => {
  const [{ TrackerPreviewPlayer }, tracker] = await Promise.all([
    import('/src/utils/trackerPreviewPlayer.ts'),
    import('/src/utils/trackerModule.ts'),
  ]);
  const binary = atob(encodedModule);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const info = tracker.parseTrackerModule(buffer, moduleFormat);
  const rows = tracker.parseTrackerPlaybackRows(buffer, moduleFormat, 64);
  const samples = moduleFormat === 'XM' ? tracker.parseXmSamples(buffer)
    : moduleFormat === 'S3M' ? tracker.parseS3mSamples(buffer)
      : tracker.parseItSamples(buffer);
  const player = new TrackerPreviewPlayer();
  window.__rawModulePreviewPlayer = player;
  return player.play(rows, info.channels, info.speed, info.tempo, [], samples, moduleFormat, [], [], undefined, false, info.globalVolume, false, moduleFormat === 'IT' && (bytes[0x2c] & 0x08) !== 0);
}, { encodedModule: encoded, moduleFormat: format });
const importSelectedOriginalForEditing = async engine => {
  await engine.getByRole('button', { name: /Import for editing|Importar para edi/i }).click();
  const editor = engine.getByLabel('Music beat editor');
  await expect(editor).toBeVisible();
  return editor;
};
const installMusicLoopPlaybackProbe = async () => {
  const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
  const probe = { playCount: 0, stopCount: 0, durations: [], startedAt: [], completedPassAudio: [] };
  const summarizeCapture = capture => {
    let power = 0;
    let frames = 0;
    let activeChunks = 0;
    for (const chunk of capture.chunks ?? []) {
      const [left, right] = chunk;
      let chunkPower = 0;
      for (let index = 0; index < left.length; index += 1) {
        chunkPower += left[index] ** 2 + right[index] ** 2;
      }
      const chunkFrames = left.length * 2;
      power += chunkPower;
      frames += chunkFrames;
      if (Math.sqrt(chunkPower / Math.max(1, chunkFrames)) > 0.001) activeChunks += 1;
    }
    return { chunks: capture.chunks?.length ?? 0, activeChunks, rms: Math.sqrt(power / Math.max(1, frames)) };
  };
  const originalPlay = TrackerPreviewPlayer.prototype.play;
  const originalStop = TrackerPreviewPlayer.prototype.stop;
  TrackerPreviewPlayer.prototype.play = async function (...args) {
    const previousCapture = window.__musicPreviewCapture;
    if (previousCapture) probe.completedPassAudio.push(summarizeCapture(previousCapture));
    probe.playCount += 1;
    probe.startedAt.push(performance.now());
    const duration = await originalPlay.apply(this, args);
    probe.durations.push(duration);
    return duration;
  };
  TrackerPreviewPlayer.prototype.stop = function (...args) {
    probe.stopCount += 1;
    return originalStop.apply(this, args);
  };
  window.__musicLoopPlaybackProbe = probe;
};

test('music editor loops the structural preview and Stop interrupts the restarted pass', async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-preview-loop-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const originalFilename = 'loop-preview-fixture.s3m';
  const originalPath = path.join(projectDirectory, 'assets', 'musics', originalFilename);
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  fs.writeFileSync(originalPath, createS3mMaxmodParityFixture());
  let electronApp;
  try {
    const projectFile = path.join(projectDirectory, 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').filter({ hasText: originalFilename }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    const loopSwitch = editor.getByRole('switch', { name: /Loop|Repetir/ });
    await expect(loopSwitch).toBeVisible();
    await expect(loopSwitch).toHaveAttribute('aria-checked', 'false');
    await loopSwitch.hover();
    await expect(engine.getByText(/Repete a prévia|Repeat the current pattern/)).toBeVisible();
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(installMusicLoopPlaybackProbe);
    await loopSwitch.click();
    await expect(loopSwitch).toHaveAttribute('aria-checked', 'true');
    await editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
    await expect.poll(() => engine.evaluate(() => window.__musicLoopPlaybackProbe?.playCount ?? 0), { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
    const s3mLoopSpanMs = await engine.evaluate(() => {
      const starts = window.__musicLoopPlaybackProbe?.startedAt ?? [];
      return starts.length >= 5 ? starts[4] - starts[0] : 0;
    });
    expect(s3mLoopSpanMs).toBeGreaterThanOrEqual(30_000);
    const s3mCompletedPassAudio = await engine.evaluate(() => window.__musicLoopPlaybackProbe?.completedPassAudio.slice(0, 4) ?? []);
    expect(s3mCompletedPassAudio).toHaveLength(4);
    for (const pass of s3mCompletedPassAudio) {
      expect(pass.chunks).toBeGreaterThan(0);
      expect(pass.activeChunks).toBeGreaterThan(0);
      expect(pass.rms).toBeGreaterThan(0.001);
    }
    const stopButton = editor.getByRole('button', { name: /Stop|Parar|Detener|Arr.ter/ });
    await expect(stopButton).toBeVisible();
    await stopButton.click();
    await expect.poll(() => engine.evaluate(() => window.__musicLoopPlaybackProbe?.stopCount ?? 0)).toBeGreaterThan(0);
    await loopSwitch.click();
    await expect(loopSwitch).toHaveAttribute('aria-checked', 'false');
  } finally {
    await electronApp?.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('XM pattern preview loops through a second pass until Stop', async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-xm-pattern-loop-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const originalFilename = 'loop-pattern-fixture.xm';
  const originalPath = path.join(projectDirectory, 'assets', 'musics', originalFilename);
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  fs.writeFileSync(originalPath, createXmLoopFixture(1, 0x50, 128, 0, 0, 64, undefined, 90, 63));
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').filter({ hasText: originalFilename }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    const loopSwitch = editor.getByRole('switch', { name: /Loop|Repetir/ });
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(installMusicLoopPlaybackProbe);
    await loopSwitch.click();
    await editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
    await expect.poll(() => engine.evaluate(() => window.__musicLoopPlaybackProbe?.playCount ?? 0), { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
    const xmLoopSpanMs = await engine.evaluate(() => {
      const starts = window.__musicLoopPlaybackProbe?.startedAt ?? [];
      return starts.length >= 5 ? starts[4] - starts[0] : 0;
    });
    expect(xmLoopSpanMs).toBeGreaterThanOrEqual(30_000);
    const xmCompletedPassAudio = await engine.evaluate(() => window.__musicLoopPlaybackProbe?.completedPassAudio.slice(0, 4) ?? []);
    expect(xmCompletedPassAudio).toHaveLength(4);
    for (const pass of xmCompletedPassAudio) {
      expect(pass.chunks).toBeGreaterThan(0);
      expect(pass.activeChunks).toBeGreaterThan(0);
      expect(pass.rms).toBeGreaterThan(0.001);
    }
    const stopButton = editor.getByRole('button', { name: /Stop|Parar|Detener|Arr.ter/ });
    await stopButton.click();
    await expect.poll(() => engine.evaluate(() => window.__musicLoopPlaybackProbe?.stopCount ?? 0)).toBeGreaterThan(0);
    await expect(stopButton).toBeHidden();
    await loopSwitch.click();
    await expect(loopSwitch).toHaveAttribute('aria-checked', 'false');
    const quickPreview = editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ });
    await quickPreview.click();
    await expect.poll(() => engine.evaluate(() => window.__musicLoopPlaybackProbe?.durations.length ?? 0)).toBe(6);
    const singlePassDuration = await engine.evaluate(() => window.__musicLoopPlaybackProbe?.durations.at(-1) ?? 0);
    expect(singlePassDuration).toBeGreaterThan(0);
    await engine.waitForTimeout(Math.min(singlePassDuration + 250, 20_000));
    await expect(stopButton).toBeHidden();
    expect(await engine.evaluate(() => window.__musicLoopPlaybackProbe?.playCount)).toBe(6);
  } finally {
    await electronApp?.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('MOD song preview loops its order sequence until Stop', async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-mod-song-loop-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const originalFilename = 'loop-song-fixture.mod';
  const originalPath = path.join(projectDirectory, 'assets', 'musics', originalFilename);
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  fs.writeFileSync(originalPath, createModLoopFixture());
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').filter({ hasText: originalFilename }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    const loopSwitch = editor.getByRole('switch', { name: /Loop|Repetir/ });
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(installMusicLoopPlaybackProbe);
    await loopSwitch.click();
    await editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
    await expect.poll(() => engine.evaluate(() => window.__musicLoopPlaybackProbe?.playCount ?? 0), { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
    const modLoopSpanMs = await engine.evaluate(() => {
      const starts = window.__musicLoopPlaybackProbe?.startedAt ?? [];
      return starts.length >= 5 ? starts[4] - starts[0] : 0;
    });
    expect(modLoopSpanMs).toBeGreaterThanOrEqual(30_000);
    const modCompletedPassAudio = await engine.evaluate(() => window.__musicLoopPlaybackProbe?.completedPassAudio.slice(0, 4) ?? []);
    expect(modCompletedPassAudio).toHaveLength(4);
    for (const pass of modCompletedPassAudio) {
      expect(pass.chunks).toBeGreaterThan(0);
      expect(pass.activeChunks).toBeGreaterThan(0);
      expect(pass.rms).toBeGreaterThan(0.001);
    }
    await editor.getByRole('button', { name: /Stop|Parar|Detener|Arr.ter/ }).click();
    await expect.poll(() => engine.evaluate(() => window.__musicLoopPlaybackProbe?.stopCount ?? 0)).toBeGreaterThan(0);
  } finally {
    await electronApp?.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('IT song preview loops its order sequence until Stop', async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-song-loop-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const originalFilename = 'loop-song-fixture.it';
  const originalPath = path.join(projectDirectory, 'assets', 'musics', originalFilename);
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  fs.writeFileSync(originalPath, createItInstrumentAudioFixture());
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').filter({ hasText: originalFilename }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    const loopSwitch = editor.getByRole('switch', { name: /Loop|Repetir/ });
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(installMusicLoopPlaybackProbe);
    await loopSwitch.click();
    await editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
    await expect.poll(() => engine.evaluate(() => window.__musicLoopPlaybackProbe?.playCount ?? 0), { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
    const itLoopSpanMs = await engine.evaluate(() => {
      const starts = window.__musicLoopPlaybackProbe?.startedAt ?? [];
      return starts.length >= 5 ? starts[4] - starts[0] : 0;
    });
    expect(itLoopSpanMs).toBeGreaterThanOrEqual(30_000);
    const itCompletedPassAudio = await engine.evaluate(() => window.__musicLoopPlaybackProbe?.completedPassAudio.slice(0, 4) ?? []);
    expect(itCompletedPassAudio).toHaveLength(4);
    for (const pass of itCompletedPassAudio) {
      expect(pass.chunks).toBeGreaterThan(0);
      expect(pass.activeChunks).toBeGreaterThan(0);
      expect(pass.rms).toBeGreaterThan(0.001);
    }
    await editor.getByRole('button', { name: /Stop|Parar|Detener|Arr.ter/ }).click();
    await expect.poll(() => engine.evaluate(() => window.__musicLoopPlaybackProbe?.stopCount ?? 0)).toBeGreaterThan(0);
  } finally {
    await electronApp?.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('IT song preview follows Bxx/Cxx order jumps in the ORDER playhead', async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-order-playhead-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const originalFilename = 'order-flow-playhead.it';
  const originalPath = path.join(projectDirectory, 'assets', 'musics', originalFilename);
  fs.mkdirSync(path.dirname(originalPath), { recursive: true });
  const fixtureBytes = createItOrderFlowFixture();
  fs.writeFileSync(originalPath, fixtureBytes);
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').filter({ hasText: originalFilename }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    await expect(editor.getByRole('radio', { name: 'Song' })).toBeChecked();
    const playbackPositions = await engine.evaluate(async encoded => {
      const { parseTrackerPlaybackRows } = await import('/src/utils/trackerModule.ts');
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const positions = [];
      parseTrackerPlaybackRows(buffer, 'IT', 64, position => positions.push(position));
      return positions;
    }, fixtureBytes.toString('base64'));
    expect(playbackPositions).toEqual([
      { order: 0, pattern: 0, row: 0 },
      { order: 2, pattern: 2, row: 0 },
      { order: 2, pattern: 2, row: 1 },
      { order: 3, pattern: 3, row: 0 },
    ]);
    await editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
    const orderCards = editor.locator('.gba-order-card');
    const jumpedOrder = orderCards.filter({ hasText: 'PATTERN 4' });
    const skippedOrder = orderCards.nth(1);
    await expect(jumpedOrder).toHaveClass(/selected/, { timeout: 10_000 });
    await expect(skippedOrder).not.toHaveClass(/selected/);
  } finally {
    await electronApp?.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('closes the Engine window without a main-process destroy error', async () => {
  test.setTimeout(45_000);
  let electronApp;
  let mainProcessOutput = '';
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    electronApp.process().stderr?.on('data', chunk => { mainProcessOutput += chunk.toString(); });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.close();
    await expect.poll(() => electronApp.windows().length, { timeout: 10_000 }).toBe(0);
  } finally {
    await electronApp?.close();
  }
  expect(mainProcessOutput).not.toMatch(/A JavaScript error occurred in the main process|Object has been destroyed|Cannot read properties of destroyed/i);
});

test('closing Engine also closes the Maxmod preview and removes its temporary ROM', async () => {
  test.setTimeout(180_000);
  let electronApp;
  let mainProcessOutput = '';
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    electronApp.process().stderr?.on('data', chunk => { mainProcessOutput += chunk.toString(); });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const userDataDirectory = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    const sample = {
      name: 'engine-close-cleanup',
      volume: 48,
      sampleRate: 17_600,
      samples: Float32Array.from({ length: 1_760 }, (_, frame) => 0.4 * Math.sin((2 * Math.PI * 440 * frame) / 17_600)),
    };
    const moduleBytes = createS3mStemWithSyncMarker(sample, 64, 125, { loopSample: true }).bytes;
    const preview = await engine.evaluate(async encoded => window.electronAPI.playTrackerModulePreview(
      encoded,
      { demoAudioVolume: 1, demoAudioMuted: false },
      true,
    ), moduleBytes.toString('base64'));
    expect(preview, JSON.stringify(preview)).toMatchObject({ status: 'success' });
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    const emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!emulator) throw new Error('The Maxmod preview emulator did not open.');
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.gameManager)), { timeout: 30_000 }).toBe(true);
    const romUrl = new URL(emulator.url());
    const romName = new URLSearchParams(romUrl.hash.split('?')[1] ?? '').get('rom')?.split(/[\\/]/).at(-1) ?? '';
    expect(romName).toMatch(/^tracker-preview-\d+\.gba$/);
    const romPath = path.join(userDataDirectory, 'gba-studio-play', 'roms', romName);
    expect(fs.existsSync(romPath)).toBe(true);

    await engine.close();
    await expect.poll(() => electronApp.windows().length, { timeout: 10_000 }).toBe(0);
    await expect.poll(() => fs.existsSync(romPath), { timeout: 5_000 }).toBe(false);
  } finally {
    await electronApp?.close();
  }
  expect(mainProcessOutput).not.toMatch(/A JavaScript error occurred in the main process|Object has been destroyed|Cannot read properties of destroyed/i);
});

test('honors explicit IT instrument zero when scheduling preview notes', async () => {
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { maxmodGbaTickDurationSeconds } = await import('/src/utils/trackerMaxmodTiming.ts');
      const pcm = Float32Array.from({ length: 1_024 }, (_, index) => Math.sin(index * 2 * Math.PI / 32) * 0.25);
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 60, volume: 64, loopType: 0 };
      const rows = Array.from({ length: 8 }, () => Array(1).fill(undefined));
      rows[0][0] = { note: 60, notePresent: true, instrument: 1, instrumentPresent: true };
      rows[1][0] = { note: 61, notePresent: true, instrument: 0, instrumentPresent: true };
      rows[2][0] = { note: 62, notePresent: true, instrument: 0, instrumentPresent: false };
      rows[3][0] = { note: 0, notePresent: false, instrument: 1, instrumentPresent: true };
      rows[4][0] = { note: 63, notePresent: true, instrument: 0, instrumentPresent: false };
      const sourceStarts = [];
      const nativeStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when = 0, ...args) {
        sourceStarts.push(when);
        return nativeStart.call(this, when, ...args);
      };
      const player = new TrackerPreviewPlayer();
      try {
        await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
        return { sourceStarts, expectedRowDuration: 6 * maxmodGbaTickDurationSeconds(125) };
      } finally {
        player.stop();
        AudioBufferSourceNode.prototype.start = nativeStart;
      }
    });
    console.log(`IT explicit-zero note preview sources: ${JSON.stringify(audit)}.`);
    expect(audit.sourceStarts).toHaveLength(2);
    expect(audit.sourceStarts[1] - audit.sourceStarts[0]).toBeCloseTo(4 * audit.expectedRowDuration, 5);
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
  }
});

test('plays XM Kxy vibrato memory and note-less volume slides in the structural preview', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(installBrowserPreviewAudioTap);
    await expectTrackerMixerAtFullVolume(engine);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 10 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 4, parameter: 0x4f };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 6, parameter: 0x0f };
      const player = new TrackerPreviewPlayer();
      window.__xmCombinedVibratoSlidePlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'XM');
    });
    await engine.waitForTimeout(800);
    const audio = await engine.evaluate(finishAudioCapture, 'segments');
    const volumeBeforeSlide = audio.rmsSegments.find(segment => segment.time >= 0.08 && segment.time < 0.16)?.rms ?? 0;
    const volumeAfterSlide = audio.rmsSegments.find(segment => segment.time >= 0.48 && segment.time < 0.56)?.rms ?? 0;
    console.log(`XM Kxy vibrato-memory and note-less volume slide: ${JSON.stringify({ volumeBeforeSlide, volumeAfterSlide, duration: audio.duration })}.`);
    expect(audio.rms).toBeGreaterThan(0.0001);
    expect(volumeBeforeSlide).toBeGreaterThan(0.02);
    expect(volumeAfterSlide).toBeLessThan(volumeBeforeSlide * 0.05);
  } finally {
    await electronApp?.close();
  }
});

test('keeps an XM instrument alive through key-off and applies its tick-based fadeout', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1, panning: 128 };
      const instrument = {
        ...sample,
        variants: [sample],
        noteMap: Array(96).fill(0),
        fadeout: 4096,
        volumeEnvelope: { points: [{ tick: 0, value: 64 }, { tick: 64, value: 64 }], sustain: 0, loopStart: 0, loopEnd: 1, enabled: true, sustainEnabled: true, loopEnabled: false },
        panningEnvelope: { points: [], sustain: 0, loopStart: 0, loopEnd: 0, enabled: false, sustainEnabled: false, loopEnabled: false },
      };
      const rows = Array.from({ length: 24 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 97, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__xmKeyOffFadeoutPlayer = player;
      await player.play(rows, 1, 6, 125, [], new Map([[1, instrument]]), 'XM');
    });
    await engine.waitForTimeout(1_100);
    const audio = await engine.evaluate(finishAudioCapture, 'segments');
    const meanRms = (from, to) => {
      const segments = audio.rmsSegments.filter(segment => segment.time >= from && segment.time < to);
      return segments.reduce((sum, segment) => sum + segment.rms, 0) / Math.max(1, segments.length);
    };
    const beforeKeyOff = meanRms(0.25, 0.40);
    const duringFadeout = meanRms(0.60, 0.72);
    const afterFadeout = meanRms(0.92, 1.04);
    console.log(`XM key-off fadeout: ${JSON.stringify({ beforeKeyOff, duringFadeout, afterFadeout, duration: audio.duration })}.`);
    expect(beforeKeyOff).toBeGreaterThan(0.02);
    expect(duringFadeout).toBeGreaterThan(beforeKeyOff * 0.2);
    expect(duringFadeout).toBeLessThan(beforeKeyOff * 0.8);
    expect(afterFadeout).toBeLessThan(beforeKeyOff * 0.05);
    await engine.evaluate(() => { window.__xmKeyOffFadeoutPlayer?.stop(); window.__xmKeyOffFadeoutPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies IT sustain-loop release and instrument fadeout on note-off', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = {
        samples: pcm,
        sampleRate: 8_363,
        loopStart: 0,
        loopEnd: pcm.length,
        rootNote: 60,
        volume: 64,
        fadeout: 128,
        fadeoutMaximum: 1024,
        volumeEnvelope: {
          points: [{ tick: 0, value: 64 }, { tick: 1, value: 64 }, { tick: 2, value: 64 }],
          sustain: 1,
          sustainStart: 0,
          sustainEnd: 1,
          loopStart: 0,
          loopEnd: 2,
          enabled: true,
          sustainEnabled: true,
          loopEnabled: true,
        },
        panningEnvelope: { points: [], sustain: 0, loopStart: 0, loopEnd: 0, enabled: false },
      };
      const rows = Array.from({ length: 24 }, () => []);
      rows[0][0] = { note: 60, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 255, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__itEnvelopeReleasePlayer = player;
      await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
    });
    await engine.waitForTimeout(1_800);
    const audio = await engine.evaluate(finishAudioCapture, 'segments');
    const meanRms = (from, to) => {
      const segments = audio.rmsSegments.filter(segment => segment.time >= from && segment.time < to);
      return segments.reduce((sum, segment) => sum + segment.rms, 0) / Math.max(1, segments.length);
    };
    const beforeNoteOff = meanRms(0.25, 0.40);
    const duringFadeout = meanRms(0.51, 0.61);
    const afterFadeout = meanRms(0.72, 0.84);
    console.log(`IT instrument envelope release: ${JSON.stringify({ beforeNoteOff, duringFadeout, afterFadeout, duration: audio.duration })}.`);
    expect(beforeNoteOff).toBeGreaterThan(0.02);
    expect(duringFadeout).toBeGreaterThan(beforeNoteOff * 0.2);
    expect(duringFadeout).toBeLessThan(beforeNoteOff * 0.8);
    expect(afterFadeout).toBeLessThan(beforeNoteOff * 0.05);
    await engine.evaluate(() => { window.__itEnvelopeReleasePlayer?.stop(); window.__itEnvelopeReleasePlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('releases an IT sustain loop into its envelope tail before any fadeout', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = {
        samples: pcm,
        sampleRate: 8_363,
        loopStart: 0,
        loopEnd: pcm.length,
        rootNote: 60,
        volume: 64,
        fadeout: 128,
        fadeoutMaximum: 1024,
        volumeEnvelope: {
          points: [{ tick: 0, value: 64 }, { tick: 1, value: 64 }, { tick: 15, value: 0 }],
          sustain: 1,
          sustainStart: 0,
          sustainEnd: 1,
          loopStart: 0,
          loopEnd: 2,
          enabled: true,
          sustainEnabled: true,
          loopEnabled: false,
        },
        panningEnvelope: { points: [], sustain: 0, loopStart: 0, loopEnd: 0, enabled: false },
      };
      const rows = Array.from({ length: 24 }, () => []);
      rows[0][0] = { note: 60, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 255, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__itEnvelopeTailPlayer = player;
      await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
    });
    await engine.waitForTimeout(1_100);
    const audio = await engine.evaluate(finishAudioCapture, 'segments');
    const meanRms = (from, to) => {
      const segments = audio.rmsSegments.filter(segment => segment.time >= from && segment.time < to);
      return segments.reduce((sum, segment) => sum + segment.rms, 0) / Math.max(1, segments.length);
    };
    const beforeNoteOff = meanRms(0.25, 0.40);
    const envelopeTail = meanRms(0.51, 0.61);
    const afterEnvelopeEnd = meanRms(0.86, 0.98);
    console.log(`IT sustain-loop envelope tail: ${JSON.stringify({ beforeNoteOff, envelopeTail, afterEnvelopeEnd, duration: audio.duration })}.`);
    expect(beforeNoteOff).toBeGreaterThan(0.02);
    expect(envelopeTail).toBeGreaterThan(beforeNoteOff * 0.35);
    expect(envelopeTail).toBeLessThan(beforeNoteOff * 0.9);
    expect(afterEnvelopeEnd).toBeLessThan(beforeNoteOff * 0.05);
    await engine.evaluate(() => { window.__itEnvelopeTailPlayer?.stop(); window.__itEnvelopeTailPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies key-off fadeout from a real XM instrument envelope', async () => {
  test.setTimeout(60_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    const sourceModule = fs.readFileSync(path.join(repositoryRoot, 'templateEngineGame', 'shooter_game', 'assets', 'musics', 'galgox_snowheart_melody.xm'));
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(installBrowserPreviewAudioTap);
    const playbackTimes = await engine.evaluate(async encodedModule => {
      const { parseTrackerModule, parseTrackerPlaybackRows, parseXmSamples } = await import('/src/utils/trackerModule.ts');
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const bytes = Uint8Array.from(atob(encodedModule), character => character.charCodeAt(0));
      const moduleBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const info = parseTrackerModule(moduleBytes, 'XM');
      const sourceRows = parseTrackerPlaybackRows(moduleBytes, 'XM', 4096);
      const instrument = parseXmSamples(moduleBytes).get(1);
      if (!instrument?.volumeEnvelope?.enabled || !instrument.fadeout) throw new Error('The real XM instrument must provide an enabled volume envelope and fadeout.');
      const noteRow = sourceRows.findIndex((row, index) => row[0]?.note === 64
        && row[0]?.instrument === 1 && sourceRows[index + 1]?.[0]?.note === 97);
      const keyOffRow = noteRow + 1;
      if (noteRow < 0) throw new Error('The real XM note using instrument 1 and its following key-off must be present.');
      const rows = sourceRows.map((row, rowIndex) => row.map((event, channel) => {
        if (!event) return undefined;
        const effect = event.effect & 0xff;
        const parameter = event.parameter & 0xff;
        const timingControl = effect === 0x0f && parameter > 0
          || effect === 0x0e && ((parameter >> 4) & 0x0f) === 0x0e;
        return timingControl || channel === 0 && (rowIndex === noteRow || rowIndex === keyOffRow) ? event : undefined;
      }));
      let speed = info.speed || 6;
      let tempo = info.tempo || 125;
      let elapsed = 0;
      let noteTime = 0;
      let keyOffTime = 0;
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        for (const event of rows[rowIndex]) {
          if (!event || (event.effect & 0xff) !== 0x0f || event.parameter <= 0) continue;
          if (event.parameter < 0x20) speed = event.parameter;
          else tempo = Math.max(32, event.parameter);
        }
        if (rowIndex === noteRow) noteTime = elapsed;
        if (rowIndex === keyOffRow) keyOffTime = elapsed;
        let patternDelay = 0;
        for (const event of rows[rowIndex]) {
          if (event && (event.effect & 0xff) === 0x0e && ((event.parameter >> 4) & 0x0f) === 0x0e) patternDelay = event.parameter & 0x0f;
        }
        elapsed += Math.max(0.025, (2.5 / tempo) * speed * (patternDelay + 1));
      }
      const player = new TrackerPreviewPlayer();
      window.__realXmKeyOffPlayer = player;
      await player.play(rows, info.channels, info.speed, info.tempo, [], new Map([[1, instrument]]), 'XM');
      return { noteRow, keyOffRow, noteTime, keyOffTime, fadeoutSeconds: Math.ceil((instrument.fadeoutMaximum ?? 65536) / instrument.fadeout) * (2.5 / tempo) };
    }, sourceModule.toString('base64'));
    await engine.waitForTimeout((playbackTimes.keyOffTime + playbackTimes.fadeoutSeconds + 0.25) * 1000);
    const audio = await engine.evaluate(finishAudioCapture, 'segments');
    const meanRms = (from, to) => {
      const segments = audio.rmsSegments.filter(segment => segment.time >= from && segment.time < to);
      return segments.reduce((sum, segment) => sum + segment.rms, 0) / Math.max(1, segments.length);
    };
    const beforeKeyOff = meanRms(playbackTimes.keyOffTime - 0.08, playbackTimes.keyOffTime - 0.02);
    const duringFadeout = meanRms(playbackTimes.keyOffTime + 0.25, playbackTimes.keyOffTime + 0.45);
    const afterFadeout = meanRms(playbackTimes.keyOffTime + playbackTimes.fadeoutSeconds + 0.05, playbackTimes.keyOffTime + playbackTimes.fadeoutSeconds + 0.20);
    console.log(`Real XM note/key-off envelope: ${JSON.stringify({ ...playbackTimes, beforeKeyOff, duringFadeout, afterFadeout, duration: audio.duration })}.`);
    expect(playbackTimes.noteRow).toBeGreaterThanOrEqual(0);
    expect(playbackTimes.keyOffTime).toBeGreaterThan(10);
    expect(beforeKeyOff).toBeGreaterThan(0.002);
    expect(duringFadeout).toBeGreaterThan(beforeKeyOff * 0.2);
    expect(duringFadeout).toBeLessThan(beforeKeyOff * 0.9);
    expect(afterFadeout).toBeLessThan(beforeKeyOff * 0.05);
    await engine.evaluate(() => { window.__realXmKeyOffPlayer?.stop(); window.__realXmKeyOffPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});




test('plays Maxmod GBA-quantized PCM8 in the tracker preview', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const captured = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const samples = new Float32Array([-32768, -32767, -32512, -1, 0, 255, 256, 32767].map(value => value / 32768));
      const copiedPcm = [];
      const copyToChannel = AudioBuffer.prototype.copyToChannel;
      AudioBuffer.prototype.copyToChannel = function (source, channel, offset) {
        copiedPcm.push(Array.from(source));
        return copyToChannel.call(this, source, channel, offset);
      };
      const sample = { samples, sampleRate: 8363, loopStart: 0, loopEnd: samples.length, rootNote: 49, volume: 64, loopType: 0, sixteenBit: true };
      const player = new TrackerPreviewPlayer();
      try {
        await player.play([[{ note: 49, instrument: 1, volume: 64, effect: 0, parameter: 0 }]], 1, 6, 125, [], new Map([[1, sample]]), 'XM');
      } finally {
        player.stop();
        AudioBuffer.prototype.copyToChannel = copyToChannel;
      }
      return copiedPcm[0] ?? [];
    });
    const expected = [-127, -127, -127, -1, 0, 0, 1, 127].map(value => value / 128);
    expect(captured).toEqual(expected);
  } finally {
    await electronApp?.close();
  }
});

test('schedules deterministic S3M S82 and S88 pan transitions', async () => {
  test.setTimeout(60_000);
  let electronApp;
  try {
    const fixture = createS3mMaxmodParityFixture(64, undefined, 0x82, {
      speed: 3,
      tempo: 255,
      noteIntervalRows: 64,
      noteCount: 1,
      sampleRate: 8_363,
      sampleFrames: 32_768,
      loopSample: true,
      rowCommands: [{ row: 8, effect: 19, parameter: 0x88 }],
    });
    const encoded = fixture.toString('base64');
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async moduleData => {
      const { parseTrackerModule, parseTrackerPlaybackRows, parseS3mSamples } = await import('/src/utils/trackerModule.ts');
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const bytes = Uint8Array.from(atob(moduleData), character => character.charCodeAt(0));
      const moduleBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const info = parseTrackerModule(moduleBytes, 'S3M');
      const rows = parseTrackerPlaybackRows(moduleBytes, 'S3M', 256);
      const nativeCreateStereoPanner = AudioContext.prototype.createStereoPanner;
      const nativeSourceStart = AudioBufferSourceNode.prototype.start;
      const panWrites = [];
      const panners = [];
      let firstSourceStart = null;
      AudioContext.prototype.createStereoPanner = function (...args) {
        const panner = nativeCreateStereoPanner.apply(this, args);
        const nativePan = panner.pan;
        const observedPan = new Proxy(nativePan, {
          set(target, property, value) {
            if (property === 'value') panWrites.push({ kind: 'value', value });
            return Reflect.set(target, property, value, target);
          },
          get(target, property) {
            if (property === 'setValueAtTime') return (value, when) => {
              panWrites.push({ kind: 'scheduled', value, when });
              return target.setValueAtTime(value, when);
            };
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        Object.defineProperty(panner, 'pan', { configurable: true, value: observedPan });
        panners.push(panner);
        return panner;
      };
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (firstSourceStart === null) firstSourceStart = args[0] ?? this.context.currentTime;
        return nativeSourceStart.apply(this, args);
      };
      const player = new TrackerPreviewPlayer();
      try {
        await player.play(rows, info.channels, info.speed, info.tempo, [], parseS3mSamples(moduleBytes), 'S3M', [], info.channelPans);
        await new Promise(resolve => window.setTimeout(resolve, 500));
        return {
          speed: info.speed,
          tempo: info.tempo,
          effectRows: rows.map((row, index) => ({ index, effects: row.filter(event => event?.effect === 19).map(event => event.parameter) }))
            .filter(row => row.effects.length > 0),
          pannerCount: panners.length,
          firstSourceStart,
          panWrites,
        };
      } finally {
        player.stop();
        AudioContext.prototype.createStereoPanner = nativeCreateStereoPanner;
        AudioBufferSourceNode.prototype.start = nativeSourceStart;
      }
    }, encoded);
    console.log(`S3M S82/S88 deterministic pan schedule: ${JSON.stringify(audit)}.`);
    expect(audit.speed).toBe(3);
    expect(audit.tempo).toBe(255);
    expect(audit.effectRows).toEqual([{ index: 0, effects: [0x82] }, { index: 8, effects: [0x88] }]);
    expect(audit.pannerCount).toBeGreaterThan(0);
    const expectedPreviewPan = normalized => {
      const right = (normalized + 1) / 2;
      return (4 * Math.atan2(right, 1 - right)) / Math.PI - 1;
    };
    expect(audit.panWrites.filter(write => write.kind === 'value')
      .some(write => Math.abs(write.value - expectedPreviewPan(-0.75)) < 1e-6)).toBe(true);
    const centerTransition = audit.panWrites.find(write => write.kind === 'scheduled');
    expect(centerTransition?.value).toBeCloseTo(expectedPreviewPan(0), 6);
    const expectedRowEightTime = 8 * 3 * 2.5 / 255;
    expect(Math.abs(centerTransition.when - audit.firstSourceStart - expectedRowEightTime)).toBeLessThan(0.005);
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
  }
});
test('applies XM E4/E7 waveform controls and reports unsupported control flags', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 14 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, effect: 0x0e, parameter: 0x40 };
      rows[1][0] = { note: 49, instrument: 1, effect: 4, parameter: 0xff };
      rows[2][0] = { note: 49, instrument: 1, effect: 0x0e, parameter: 0x41 };
      rows[3][0] = { note: 49, instrument: 1, effect: 4, parameter: 0xff };
      rows[4][0] = { note: 49, instrument: 1, effect: 0x0e, parameter: 0x42 };
      rows[5][0] = { note: 49, instrument: 1, effect: 4, parameter: 0xff };
      rows[6][0] = { note: 49, instrument: 1, effect: 0x0e, parameter: 0x71 };
      rows[7][0] = { note: 49, instrument: 1, effect: 7, parameter: 0xff };
      rows[8][0] = { note: 49, instrument: 1, effect: 0x0e, parameter: 0x72 };
      rows[9][0] = { note: 49, instrument: 1, effect: 7, parameter: 0xff };
      rows[10][0] = { note: 49, instrument: 1, effect: 0x0e, parameter: 0x43 };
      rows[11][0] = { note: 49, instrument: 1, effect: 4, parameter: 0xff };
      rows[12][0] = { note: 49, instrument: 1, effect: 0x0e, parameter: 0x73 };
      rows[13][0] = { note: 49, instrument: 1, effect: 7, parameter: 0xff };
      const rateParameters = new WeakSet();
      const rateRamps = [];
      const voiceStarts = [];
      const gainParameters = new WeakSet();
      const gainRamps = [];
      const createBufferSource = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = createBufferSource.apply(this, args);
        rateParameters.add(source.playbackRate);
        return source;
      };
      const createGain = AudioContext.prototype.createGain;
      AudioContext.prototype.createGain = function (...args) {
        const gain = createGain.apply(this, args);
        gainParameters.add(gain.gain);
        return gain;
      };
      const linearRamp = AudioParam.prototype.linearRampToValueAtTime;
      AudioParam.prototype.linearRampToValueAtTime = function (value, when) {
        if (rateParameters.has(this)) rateRamps.push({ value, when });
        if (gainParameters.has(this)) gainRamps.push({ value, when, param: this });
        return linearRamp.call(this, value, when);
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when = 0, ...args) {
        voiceStarts.push(when);
        return start.call(this, when, ...args);
      };
      try {
        const player = new TrackerPreviewPlayer();
        window.__xmWaveformControlPlayer = player;
        await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'XM');
      } finally {
        AudioContext.prototype.createBufferSource = createBufferSource;
        AudioContext.prototype.createGain = createGain;
        AudioParam.prototype.linearRampToValueAtTime = linearRamp;
        AudioBufferSourceNode.prototype.start = start;
      }
      const notePitchRanges = [1, 3, 5, 11].map(noteIndex => {
        const begin = voiceStarts[noteIndex];
        const end = voiceStarts[noteIndex + 1] ?? begin + 0.12;
        const pitches = rateRamps.filter(entry => entry.when >= begin && entry.when < end).map(entry => 12 * Math.log2(entry.value));
        return pitches.length ? Math.max(...pitches) - Math.min(...pitches) : 0;
      });
      const notePitchCurves = [1, 3, 5, 11].map(noteIndex => rateRamps.filter(entry => entry.when >= voiceStarts[noteIndex] && entry.when < (voiceStarts[noteIndex + 1] ?? voiceStarts[noteIndex] + 0.12)).map(entry => Number((12 * Math.log2(entry.value)).toFixed(3))));
      const tremoloStart = voiceStarts[7];
      const tremoloEnd = voiceStarts[8] ?? tremoloStart + 0.12;
      const tremoloParameters = [...new Set(gainRamps.filter(entry => entry.when >= tremoloStart && entry.when < tremoloEnd).map(entry => entry.param))];
      const tremoloGainRange = Math.max(0, ...tremoloParameters.map(param => {
        const values = gainRamps.filter(entry => entry.param === param && entry.when >= tremoloStart && entry.when < tremoloEnd).map(entry => entry.value);
        return values.length ? Math.max(...values) - Math.min(...values) : 0;
      }));
      const tremoloWaveformCurves = [7, 9, 13].map(noteIndex => {
        const begin = voiceStarts[noteIndex];
        const end = voiceStarts[noteIndex + 1] ?? begin + 0.12;
        const parameters = [...new Set(gainRamps.filter(entry => entry.when >= begin && entry.when < end).map(entry => entry.param))];
        const candidates = parameters.map(param => gainRamps.filter(entry => entry.param === param && entry.when >= begin && entry.when < end).map(entry => entry.value));
        const values = candidates.sort((left, right) => right.length - left.length)[0] ?? [];
        return { count: values.length, distinct: new Set(values.map(value => value.toFixed(6))).size, values: values.map(value => Number(value.toFixed(6))) };
      });
      const validWaveforms = [0, 1, 2, 3, 8, 9, 10, 11].flatMap(waveform => [0x40, 0x70].map(command => ({ note: 49, instrument: 1, effect: 0x0e, parameter: command | waveform })));
      const supportedNoReset = [0x44, 0x47, 0x4c, 0x4f, 0x74, 0x77, 0x7c, 0x7f].map(parameter => ({ note: 49, instrument: 1, effect: 0x0e, parameter }));
      const unsupportedControl = [{ note: 49, instrument: 1, effect: 0x0e, parameter: 0x00 }];
      return {
        notePitchRanges,
        notePitchCurves,
        voiceStarts,
        vibratoRampCounts: [1, 3, 5].map(noteIndex => rateRamps.filter(entry => entry.when >= voiceStarts[noteIndex] && entry.when < (voiceStarts[noteIndex + 1] ?? voiceStarts[noteIndex] + 0.12)).length),
        tremoloGainRange,
        tremoloWaveformCurves,
        supportedWaveformEffects: analyzeTrackerPreview('XM', [validWaveforms], new Map(), 1).unsupportedEffects,
        supportedNoResetEffects: analyzeTrackerPreview('XM', [supportedNoReset], new Map(), 1).unsupportedEffects,
        unsupportedWaveformEffects: analyzeTrackerPreview('XM', [unsupportedControl], new Map(), 1).unsupportedEffects,
      };
    });
    console.log(`XM E4/E7 waveform controls: ${JSON.stringify(audit)}.`);
    expect(audit.notePitchRanges).toHaveLength(4);
    for (const range of audit.notePitchRanges) expect(range).toBeGreaterThan(0.15);
    expect([...new Set(audit.notePitchCurves[2])].sort((a, b) => a - b)).toEqual([...new Set(audit.notePitchCurves[3])].sort((a, b) => a - b));
    expect(audit.tremoloGainRange).toBeGreaterThan(0.01);
    expect(audit.tremoloWaveformCurves[0].distinct).toBeGreaterThan(4);
    expect(audit.tremoloWaveformCurves[1].distinct).toBeLessThanOrEqual(3);
    expect(audit.tremoloWaveformCurves[1].values).toEqual(audit.tremoloWaveformCurves[2].values);
    expect(audit.supportedWaveformEffects).toEqual([]);
    expect(audit.supportedNoResetEffects).toEqual([]);
    expect(audit.unsupportedWaveformEffects).toEqual([0x0e]);
    await engine.evaluate(() => { window.__xmWaveformControlPlayer?.stop(); window.__xmWaveformControlPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('schedules IT Rxy tremolo from the Maxmod sine table and carries phase across rows', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const { maxmodGbaTickDurationSeconds } = await import('/src/utils/trackerMaxmodTiming.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 3 }, (_, row) => [{
        note: row === 0 ? 49 : 0,
        instrument: row === 0 ? 1 : 0,
        volume: row === 0 ? 32 : 0,
        volumePresent: row === 0,
        effect: 18,
        parameter: 0x43,
      }]);
      const gainIds = new WeakMap();
      const gainEvents = [];
      const sourceStarts = [];
      let nextGainId = 0;
      const createGain = AudioContext.prototype.createGain;
      const setValueAtTime = AudioParam.prototype.setValueAtTime;
      const start = AudioBufferSourceNode.prototype.start;
      AudioContext.prototype.createGain = function (...args) {
        const gain = createGain.apply(this, args);
        gainIds.set(gain.gain, nextGainId++);
        return gain;
      };
      AudioParam.prototype.setValueAtTime = function (value, when) {
        const gainId = gainIds.get(this);
        if (gainId !== undefined) gainEvents.push({ gainId, value, when });
        return setValueAtTime.call(this, value, when);
      };
      AudioBufferSourceNode.prototype.start = function (when) {
        sourceStarts.push(when);
        return start.call(this, when);
      };
      const player = new TrackerPreviewPlayer();
      try {
        await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
      } finally {
        player.stop();
        AudioContext.prototype.createGain = createGain;
        AudioParam.prototype.setValueAtTime = setValueAtTime;
        AudioBufferSourceNode.prototype.start = start;
      }
      const tickDuration = maxmodGbaTickDurationSeconds(125);
      const startTime = sourceStarts[0];
      const expectedVolumes = [64, 72, 80, 80, 88, 80, 80, 80, 72, 64, 48, 40, 40, 40, 40, 40, 40, 48];
      const groups = new Map();
      for (const event of gainEvents) {
        if (!groups.has(event.gainId)) groups.set(event.gainId, []);
        groups.get(event.gainId).push(event);
      }
      const candidates = [...groups.values()].map(events => expectedVolumes.map((_, tick) => {
        const expectedTime = startTime + tick * tickDuration;
        return events.filter(event => Math.abs(event.when - expectedTime) < 0.002).at(-1);
      }));
      const scheduled = candidates.find(events => events.every(Boolean));
      return {
        supportedEffects: analyzeTrackerPreview('IT', rows, new Map([[1, sample]]), 1).unsupportedEffects,
        startTime,
        tickDuration,
        expectedVolumes,
        actualRelativeVolumes: scheduled?.map(event => Number((event.value / Math.max(1e-9, scheduled[0].value)).toFixed(4))) ?? [],
        actualTickTimes: scheduled?.map(event => Number(((event.when - startTime) / tickDuration).toFixed(4))) ?? [],
      };
    });
    expect(audit.supportedEffects).toEqual([]);
    expect(audit.startTime).toBeGreaterThan(0);
    expect(audit.actualTickTimes).toEqual(Array.from({ length: 18 }, (_, tick) => tick));
    expect(audit.actualRelativeVolumes).toEqual(audit.expectedVolumes.map(volume => Number((volume / audit.expectedVolumes[0]).toFixed(4))));
  } finally {
    await electronApp?.close();
  }
});

test('applies Maxmod Uxy depth, phase, and parameter memory in IT preview', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const { trackerItMaxmodFineVibratoPitch } = await import('/src/utils/trackerItMaxmodPitch.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = [
        [{ note: 49, instrument: 1, effect: 21, parameter: 0x44 }],
        [{ note: 0, instrument: 0, effect: 21, parameter: 0x04 }],
        [{ note: 49, instrument: 1, effect: 21, parameter: 0x40 }],
      ];
      const rateVoiceIndexes = new WeakMap();
      const rateBatches = new WeakMap();
      const scheduledRates = [];
      let voiceIndex = 0;
      const createBufferSource = AudioContext.prototype.createBufferSource;
      const setValueAtTime = AudioParam.prototype.setValueAtTime;
      const linearRampToValueAtTime = AudioParam.prototype.linearRampToValueAtTime;
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = createBufferSource.apply(this, args);
        rateVoiceIndexes.set(source.playbackRate, voiceIndex++);
        rateBatches.set(source.playbackRate, 0);
        return source;
      };
      const cancelScheduledValues = AudioParam.prototype.cancelScheduledValues;
      AudioParam.prototype.cancelScheduledValues = function (when) {
        if (rateBatches.has(this)) rateBatches.set(this, rateBatches.get(this) + 1);
        return cancelScheduledValues.call(this, when);
      };
      AudioParam.prototype.setValueAtTime = function (value, when) {
        if (rateVoiceIndexes.has(this)) scheduledRates.push({ voice: rateVoiceIndexes.get(this), batch: rateBatches.get(this), value, when });
        return setValueAtTime.call(this, value, when);
      };
      AudioParam.prototype.linearRampToValueAtTime = function (value, when) {
        if (rateVoiceIndexes.has(this)) scheduledRates.push({ voice: rateVoiceIndexes.get(this), batch: rateBatches.get(this), value, when });
        return linearRampToValueAtTime.call(this, value, when);
      };
      const player = new TrackerPreviewPlayer();
      try {
        await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
      } finally {
        player.stop();
        AudioContext.prototype.createBufferSource = createBufferSource;
        AudioParam.prototype.cancelScheduledValues = cancelScheduledValues;
        AudioParam.prototype.setValueAtTime = setValueAtTime;
        AudioParam.prototype.linearRampToValueAtTime = linearRampToValueAtTime;
      }
      const firstVoiceStart = scheduledRates.find(entry => entry.voice === 0)?.when ?? 0;
      const rowDuration = 6 * 2.5 / 125;
      const pitchRanges = [
        scheduledRates.filter(entry => entry.voice === 0 && entry.batch === 0 && entry.when < firstVoiceStart + rowDuration),
        scheduledRates.filter(entry => entry.voice === 0 && entry.batch === 1 && entry.when >= firstVoiceStart + rowDuration && entry.when < firstVoiceStart + rowDuration * 2),
        scheduledRates.filter(entry => entry.voice === 1),
      ].map(entries => {
        const points = entries.map(entry => entry.value);
        const baseRate = points[0] ?? 1;
        const pitchOffsets = points.map(value => 12 * Math.log2(value / baseRate));
        return Math.max(...pitchOffsets) - Math.min(...pitchOffsets);
      });
      let expectedPhase = 0;
      const expectedPitchRanges = rows.map((_, row) => {
        const points = Array.from({ length: 6 }, (_, tick) => trackerItMaxmodFineVibratoPitch(
          sample.sampleRate,
          49,
          sample.rootNote,
          expectedPhase + (tick + 1) * 4 * (2 * Math.PI / 64),
          4,
        ));
        expectedPhase = (expectedPhase + 6 * 4 * (2 * Math.PI / 64)) % (2 * Math.PI);
        return Math.max(...points) - Math.min(...points);
      });
      return {
        scheduledPoints: scheduledRates.length,
        pitchRanges,
        expectedPitchRanges,
        unsupportedEffects: analyzeTrackerPreview('IT', rows, new Map([[1, sample]]), 1).unsupportedEffects,
      };
    });
    console.log(`IT U44 fine-vibrato pitch: ${JSON.stringify(audit)}.`);
    expect(audit.unsupportedEffects).toEqual([]);
    expect(audit.scheduledPoints).toBeGreaterThan(24);
    for (let index = 0; index < audit.pitchRanges.length; index += 1) {
      expect(Math.abs(audit.pitchRanges[index] - audit.expectedPitchRanges[index]), `IT Uxy range ${index} should follow Maxmod's Amiga-period vibrato.`).toBeLessThan(0.05);
    }
  } finally {
    await electronApp?.close();
  }
});

test('matches Maxmod waveform behavior and diagnoses IT S3x/S4x controls', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rateParameters = [];
      const gainParameters = [];
      const rateRamps = [];
      const gainRamps = [];
      const createBufferSource = AudioContext.prototype.createBufferSource;
      const createGain = AudioContext.prototype.createGain;
      const linearRamp = AudioParam.prototype.linearRampToValueAtTime;
      const setValueAtTime = AudioParam.prototype.setValueAtTime;
      const gainSetValues = [];
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = createBufferSource.apply(this, args);
        rateParameters.push(source.playbackRate);
        return source;
      };
      AudioContext.prototype.createGain = function (...args) {
        const gain = createGain.apply(this, args);
        gainParameters.push(gain.gain);
        return gain;
      };
      AudioParam.prototype.linearRampToValueAtTime = function (value, when) {
        if (rateParameters.includes(this)) rateRamps.push({ param: this, value, when });
        if (gainParameters.includes(this)) gainRamps.push({ param: this, value, when });
        return linearRamp.call(this, value, when);
      };
      AudioParam.prototype.setValueAtTime = function (value, when) {
        if (gainParameters.includes(this)) gainSetValues.push({ param: this, value, when });
        return setValueAtTime.call(this, value, when);
      };
      const curves = { vibrato: [], tremolo: [] };
      const players = [];
      try {
        for (const [kind, command, effect] of [['vibrato', 0x30, 8], ['tremolo', 0x40, 18]]) {
          for (let waveform = 0; waveform < 4; waveform += 1) {
            const rows = Array.from({ length: 3 }, () => []);
            rows[0][0] = { note: 0, instrument: 0, volume: 0, effect: 19, parameter: command | waveform };
            rows[1][0] = { note: 49, instrument: 1, volume: 0, effect, parameter: 0x48 };
            const player = new TrackerPreviewPlayer();
            players.push(player);
            const beforeRate = rateParameters.length;
            const beforeGain = gainParameters.length;
            await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
            const parameter = kind === 'vibrato'
              ? rateParameters[beforeRate]
              : gainParameters.slice(beforeGain).sort((left, right) =>
                gainSetValues.filter(entry => entry.param === left).length - gainSetValues.filter(entry => entry.param === right).length,
              ).at(-1);
            const ramps = (kind === 'vibrato' ? rateRamps : gainSetValues)
              .filter(entry => entry.param === parameter)
              .map(entry => Number((kind === 'vibrato' ? 12 * Math.log2(entry.value) : entry.value).toFixed(5)));
            curves[kind].push(ramps);
            player.stop();
            await player.context?.close();
          }
        }
      } finally {
        AudioContext.prototype.createBufferSource = createBufferSource;
        AudioContext.prototype.createGain = createGain;
        AudioParam.prototype.linearRampToValueAtTime = linearRamp;
        AudioParam.prototype.setValueAtTime = setValueAtTime;
        for (const player of players) {
          player.stop();
          await player.context?.close().catch(() => {});
        }
      }
      const invalid = [0x34, 0x4f].map(parameter => analyzeTrackerPreview('IT', [[{ note: 49, instrument: 1, effect: 19, parameter }]], new Map(), 1).unsupportedEffects);
      const ignored = [0x30, 0x31, 0x32, 0x33, 0x40, 0x41, 0x42, 0x43]
        .map(parameter => analyzeTrackerPreview('IT', [[{ note: 49, instrument: 1, effect: 19, parameter }]], new Map(), 1).unsupportedEffects);
      return { curves, invalid, ignored };
    });
    console.log(`IT S3x/S4x Maxmod-compatible waveform curves: ${JSON.stringify(audit)}.`);
    for (const kind of ['vibrato', 'tremolo']) {
      expect(audit.curves[kind]).toHaveLength(4);
      expect(audit.curves[kind][0].length).toBeGreaterThan(4);
      expect(new Set(audit.curves[kind].map(curve => curve.join(','))).size).toBe(1);
    }
    expect(audit.ignored).toEqual(Array(8).fill([19]));
    expect(audit.invalid).toEqual([[19], [19]]);
  } finally {
    await electronApp?.close();
  }
});

test('schedules IT Jxy base, high, and low arpeggio ticks in the preview', async () => {
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-jxy-maxmod-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  let electronApp;
  try {
    fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
    const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
    fs.mkdirSync(musicDirectory, { recursive: true });
    const tracker = await loadTrackerModuleTools();
    const source = createItInstrumentAudioFixture();
    source[256 + 0x12] |= 0x10;
    source.writeUInt32LE(1_024, 256 + 0x38);
    let moduleBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    moduleBuffer = tracker.updateItPatternEvent(moduleBuffer, 0, 0, 0, { volume: 32, effect: 10, parameter: 0x37 });
    const rows = tracker.parseItPatternRows(moduleBuffer, 0, 7);
    expect(rows[0][0]).toMatchObject({ note: 60, instrument: 1, effect: 10, parameter: 0x37 });
    const moduleBytes = new Uint8Array(moduleBuffer);
    fs.writeFileSync(path.join(musicDirectory, 'it-jxy-preview.it'), Buffer.from(moduleBytes));
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    await electronApp.context().addInitScript(installBrowserPreviewAudioTap);
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(() => {
      const audioParamPrototype = AudioParam.prototype;
      const nativeSet = audioParamPrototype.setValueAtTime;
      const nativeRamp = audioParamPrototype.linearRampToValueAtTime;
      const nativeCreate = AudioContext.prototype.createBufferSource;
      const playbackRates = new WeakSet();
      const events = [];
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = nativeCreate.apply(this, args);
        playbackRates.add(source.playbackRate);
        return source;
      };
      audioParamPrototype.setValueAtTime = function (value, time) {
        if (playbackRates.has(this)) events.push({ kind: 'set', value, time });
        return nativeSet.call(this, value, time);
      };
      audioParamPrototype.linearRampToValueAtTime = function (value, time) {
        if (playbackRates.has(this)) events.push({ kind: 'ramp', value, time });
        return nativeRamp.call(this, value, time);
      };
      window.__itJxyPreviewRateTrace = { events };
    });
    await playRawTrackerModulePreview(engine, Buffer.from(moduleBytes).toString('base64'), 'IT');
    await expect.poll(() => engine.evaluate(() => window.__musicPreviewCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
    await engine.waitForTimeout(850);
    const preview = await engine.evaluate(finishAudioCapture, 'pitch-segments');
    expect(preview.rms).toBeGreaterThan(0.001);
    expect(preview.onsetTimes.length).toBeGreaterThan(0);
    const previewRateEvents = (await engine.evaluate(() => window.__itJxyPreviewRateTrace?.events ?? []))
      .sort((left, right) => left.time - right.time);
    expect(previewRateEvents.length).toBeGreaterThan(10);
    const tickSeconds = 2.5 / 125;
    const expectedSteps = [0, 3, 7, 0, 3, 7];
    const previewStartTime = previewRateEvents[0].time;
    const previewBaseRate = previewRateEvents[0].value;
    const previewSteps = expectedSteps.map((_, tick) => {
      const time = previewStartTime + tick * tickSeconds + tickSeconds * 0.75;
      const event = previewRateEvents.filter(candidate => candidate.time <= time).at(-1);
      return 12 * Math.log2(event.value / previewBaseRate);
    });
    console.log(`IT Jxy preview arpeggio tick steps: ${JSON.stringify({ previewSteps, expectedSteps })}.`);
    expect(previewSteps.every(Number.isFinite), 'Preview should schedule pitch in each of the six Jxy ticks.').toBe(true);
    for (let tick = 0; tick < expectedSteps.length; tick += 1) {
      expect(Math.abs(previewSteps[tick] - expectedSteps[tick]), `Preview Jxy tick ${tick} should stay within Maxmod's Q12 pitch quantization of the requested semitone offset.`).toBeLessThan(0.05);
    }
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('applies IT Vxx and Mxx set-volume changes to sustained preview audio', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    const tracker = await loadTrackerModuleTools();
    const source = createItInstrumentAudioFixture();
    source[256 + 0x12] |= 0x10;
    source.writeUInt32LE(1_024, 256 + 0x38);
    let moduleBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    moduleBuffer = tracker.updateItPatternEvent(moduleBuffer, 0, 1, 0, { effect: 22, parameter: 32 });
    moduleBuffer = tracker.updateItPatternEvent(moduleBuffer, 0, 2, 0, { effect: 13, parameter: 32 });
    const rows = tracker.parseItPatternRows(moduleBuffer, 0, 3);
    expect(rows[0][0]).toMatchObject({ note: 60, instrument: 1 });
    expect(rows[1][0]).toMatchObject({ effect: 22, parameter: 32 });
    expect(rows[2][0]).toMatchObject({ effect: 13, parameter: 32 });
    const encoded = Buffer.from(new Uint8Array(moduleBuffer)).toString('base64');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    await electronApp.context().addInitScript(installBrowserPreviewAudioTap);
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await playRawTrackerModulePreview(engine, encoded, 'IT');
    await expect.poll(() => engine.evaluate(() => window.__musicPreviewCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(0);
    await engine.waitForTimeout(650);
    const preview = await engine.evaluate(finishAudioCapture, 'pitch-segments');
    const rmsAt = (start, duration) => {
      const values = preview.envelope.filter((_, index) => index * preview.envelopeWindowSeconds >= start
        && index * preview.envelopeWindowSeconds < start + duration);
      return Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / Math.max(1, values.length));
    };
    const onset = preview.onsetTimes[0];
    const baseline = rmsAt(onset + 0.02, 0.06);
    const afterGlobalSet = rmsAt(onset + 0.14, 0.06);
    const afterChannelSet = rmsAt(onset + 0.26, 0.06);
    const globalRatio = afterGlobalSet / baseline;
    const channelRatio = afterChannelSet / afterGlobalSet;
    console.log(`IT V20/M20 functional preview levels: ${JSON.stringify({ onset, baseline, afterGlobalSet, afterChannelSet, globalRatio, channelRatio })}.`);
    expect(preview.rms).toBeGreaterThan(0.001);
    expect(preview.onsetTimes.length).toBeGreaterThan(0);
    expect(baseline).toBeGreaterThan(0.01);
    expect(globalRatio).toBeGreaterThan(0.20);
    expect(globalRatio).toBeLessThan(0.30);
    expect(channelRatio).toBeGreaterThan(0.40);
    expect(channelRatio).toBeLessThan(0.60);
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
  }
});
test('keeps S3M and IT Tremor inert like the Maxmod GBA core', async () => {
  test.setTimeout(45_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const gainParameters = [];
      const gainRamps = [];
      const players = [];
      const createGain = AudioContext.prototype.createGain;
      const linearRamp = AudioParam.prototype.linearRampToValueAtTime;
      AudioContext.prototype.createGain = function (...args) {
        const gain = createGain.apply(this, args);
        gainParameters.push(gain.gain);
        return gain;
      };
      AudioParam.prototype.linearRampToValueAtTime = function (value, when) {
        if (gainParameters.includes(this)) gainRamps.push({ parameter: this, value });
        return linearRamp.call(this, value, when);
      };
      const signatures = {};
      try {
        for (const format of ['S3M', 'IT']) {
          signatures[format] = {};
          for (const effect of [0, 9]) {
            const beforeParameters = gainParameters.length;
            const beforeRamps = gainRamps.length;
            const rows = Array.from({ length: 4 }, () => []);
            rows[0][0] = { note: 49, instrument: 1, volume: 0, volumePresent: false, effect, parameter: effect ? 0x42 : 0 };
            const player = new TrackerPreviewPlayer();
            players.push(player);
            await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), format);
            const ownedParameters = new Set(gainParameters.slice(beforeParameters));
            signatures[format][effect] = gainRamps.slice(beforeRamps)
              .filter(ramp => ownedParameters.has(ramp.parameter))
              .map(ramp => Number(ramp.value.toFixed(7)));
            player.stop();
            await player.context?.close();
          }
        }
      } finally {
        AudioContext.prototype.createGain = createGain;
        AudioParam.prototype.linearRampToValueAtTime = linearRamp;
        for (const player of players) {
          player.stop();
          await player.context?.close().catch(() => {});
        }
      }
      return {
        signatures,
        unsupported: ['S3M', 'IT'].map(format => analyzeTrackerPreview(format, [[{ note: 49, instrument: 1, effect: 9, parameter: 0x42 }]], new Map()).unsupportedEffects),
      };
    });
    expect(audit.signatures.S3M[9]).toEqual(audit.signatures.S3M[0]);
    expect(audit.signatures.IT[9]).toEqual(audit.signatures.IT[0]);
    expect(audit.unsupported).toEqual([[9], [9]]);
  } finally {
    await electronApp?.close();
  }
});

test('applies IT S2x legacy retrigger on tick boundaries and keeps the final voice sustained', async () => {
  test.setTimeout(45_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, loopType: 1, rootNote: 60, volume: 64 };
      const rows = Array.from({ length: 5 }, () => []);
      rows[0] = [{ note: 60, instrument: 1, volume: 0, volumePresent: false, effect: 19, parameter: 0x23 }];
      rows[4] = [{ note: 0, instrument: 0, volume: 0, volumePresent: false, effect: 0, parameter: 0 }];
      const starts = [];
      const stops = [];
      const originalStart = AudioBufferSourceNode.prototype.start;
      const originalStop = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.start = function (...args) {
        starts.push(args[0]);
        return originalStart.apply(this, args);
      };
      AudioBufferSourceNode.prototype.stop = function (...args) {
        stops.push(args[0]);
        return originalStop.apply(this, args);
      };
      const player = new TrackerPreviewPlayer();
      try {
        const durationMs = await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
        const diagnostics = analyzeTrackerPreview('IT', [[rows[0][0]]], new Map([[1, sample]]), 1);
        return { durationMs, starts: starts.map(value => Number(value.toFixed(4))), stops: stops.map(value => Number(value.toFixed(4))), diagnostics };
      } finally {
        player.stop();
        await player.context?.close().catch(() => {});
        AudioBufferSourceNode.prototype.start = originalStart;
        AudioBufferSourceNode.prototype.stop = originalStop;
      }
    });
    console.log(`IT S2x legacy retrigger schedule: ${JSON.stringify(audit)}.`);
    expect(audit.durationMs).toBeGreaterThan(300);
    expect(audit.starts).toHaveLength(2);
    expect(audit.starts[0]).toBeCloseTo(0.025, 2);
    expect(audit.starts[1] - audit.starts[0]).toBeCloseTo(0.06, 2);
    expect(audit.stops.some(time => time > audit.starts[1] + 0.3)).toBe(true);
    expect(audit.diagnostics.unsupportedEffects).toEqual([]);
  } finally {
    await electronApp?.close();
  }
});

test('applies IT Qxy retriggers only within the effect row and sustains the final voice', async () => {
  test.setTimeout(45_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, loopType: 1, rootNote: 60, volume: 64 };
      const rows = Array.from({ length: 5 }, () => []);
      rows[0] = [{ note: 60, instrument: 1, volume: 64, volumePresent: true, effect: 17, parameter: 0x53 }];
      const starts = [];
      const stops = [];
      const warnings = [];
      const player = new TrackerPreviewPlayer();
      const originalStart = AudioBufferSourceNode.prototype.start;
      const originalStop = AudioBufferSourceNode.prototype.stop;
      const originalWarn = console.warn;
      AudioBufferSourceNode.prototype.start = function (...args) {
        if (this.context === player.context && Number.isFinite(args[0])) starts.push(args[0]);
        return originalStart.apply(this, args);
      };
      AudioBufferSourceNode.prototype.stop = function (...args) {
        if (this.context === player.context && Number.isFinite(args[0])) stops.push(args[0]);
        return originalStop.apply(this, args);
      };
      console.warn = (...args) => warnings.push(args.map(String).join(' '));
      try {
        const durationMs = await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
        return { durationMs, starts: starts.map(value => Number(value.toFixed(4))), stops: stops.map(value => Number(value.toFixed(4))), warnings };
      } finally {
        player.stop();
        await player.context?.close().catch(() => {});
        AudioBufferSourceNode.prototype.start = originalStart;
        AudioBufferSourceNode.prototype.stop = originalStop;
        console.warn = originalWarn;
      }
    });
    console.log(`IT Qxy row-limited retrigger schedule: ${JSON.stringify(audit)}.`);
    expect(audit.durationMs).toBeGreaterThan(300);
    expect(audit.starts).toHaveLength(2);
    expect(audit.starts[0]).toBeCloseTo(0.025, 2);
    expect(audit.starts[1] - audit.starts[0]).toBeCloseTo(0.06, 2);
    expect(audit.stops.some(time => time > audit.starts[1] + 0.3)).toBe(true);
  } finally {
    await electronApp?.close();
  }
});

test('restarts an active IT voice for Qxy in a note-less row', async () => {
  test.setTimeout(45_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, loopType: 1, rootNote: 60, volume: 64 };
      const rows = Array.from({ length: 5 }, () => []);
      rows[0] = [{ note: 60, instrument: 1, volume: 64, volumePresent: true, effect: 0, parameter: 0 }];
      rows[1] = [{ note: 0, instrument: 0, volume: 0, volumePresent: false, effect: 17, parameter: 0x53 }];
      rows[4] = [{ note: 60, instrument: 1, volume: 64, volumePresent: true, effect: 0, parameter: 0 }];
      const starts = [];
      const gainValues = [];
      const warnings = [];
      const originalStart = AudioBufferSourceNode.prototype.start;
      const originalCreateGain = AudioContext.prototype.createGain;
      const originalWarn = console.warn;
      AudioBufferSourceNode.prototype.start = function (...args) {
        starts.push(args[0]);
        return originalStart.apply(this, args);
      };
      AudioContext.prototype.createGain = function (...args) {
        const node = originalCreateGain.apply(this, args);
        gainValues.push(node.gain);
        return node;
      };
      console.warn = (...args) => warnings.push(args.map(String).join(' '));
      const player = new TrackerPreviewPlayer();
      try {
        const durationMs = await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
        return { durationMs, starts: starts.map(value => Number(value.toFixed(4))), gains: gainValues.map(gain => Number(gain.value.toFixed(3))), warnings };
      } finally {
        player.stop();
        await player.context?.close().catch(() => {});
        AudioBufferSourceNode.prototype.start = originalStart;
        AudioContext.prototype.createGain = originalCreateGain;
        console.warn = originalWarn;
      }
    });
    console.log(`IT note-less Qxy retrigger schedule: ${JSON.stringify(audit)}.`);
    expect(audit.durationMs).toBeGreaterThan(700);
    expect(audit.starts).toHaveLength(3);
    expect(audit.starts[0]).toBeCloseTo(0.025, 2);
    expect(audit.starts[1] - audit.starts[0]).toBeCloseTo(0.18, 1);
    expect(audit.starts[2] - audit.starts[1]).toBeCloseTo(0.30, 1);
    expect(audit.gains).toContain(0.75);
  } finally {
    await electronApp?.close();
  }
});

test('applies MOD E9x legacy retrigger on tick boundaries and recognizes it in diagnostics', async () => {
  test.setTimeout(45_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, loopType: 1, rootNote: 60, volume: 64 };
      const rows = Array.from({ length: 5 }, () => []);
      rows[0] = [{ note: 60, instrument: 1, volume: 0, volumePresent: false, effect: 0x0e, parameter: 0x93 }];
      const starts = [];
      const originalStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (...args) {
        starts.push(args[0]);
        return originalStart.apply(this, args);
      };
      const player = new TrackerPreviewPlayer();
      try {
        const durationMs = await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'MOD');
        const diagnostics = analyzeTrackerPreview('MOD', [[rows[0][0]]], new Map([[1, sample]]), 1);
        return { durationMs, starts: starts.map(value => Number(value.toFixed(4))), diagnostics };
      } finally {
        player.stop();
        await player.context?.close().catch(() => {});
        AudioBufferSourceNode.prototype.start = originalStart;
      }
    });
    console.log(`MOD E9x legacy retrigger schedule: ${JSON.stringify(audit)}.`);
    expect(audit.durationMs).toBeGreaterThan(300);
    expect(audit.starts).toHaveLength(2);
    expect(audit.starts[0]).toBeCloseTo(0.025, 2);
    expect(audit.starts[1] - audit.starts[0]).toBeCloseTo(0.06, 2);
    expect(audit.diagnostics.unsupportedEffects).toEqual([]);
  } finally {
    await electronApp?.close();
  }
});

test('applies IT S77/S78 volume-envelope toggles to an active voice', async () => {
  test.setTimeout(45_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const sample = {
        samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, loopType: 1, rootNote: 60, volume: 64,
        volumeEnvelope: { points: [{ tick: 0, value: 64 }, { tick: 12, value: 0 }], sustain: 0, loopStart: 0, loopEnd: 1, enabled: true },
      };
      const render = async controls => {
        const rows = Array.from({ length: 9 }, () => []);
        rows[0] = [{ note: 60, instrument: 1, volume: 0, volumePresent: false, effect: 0, parameter: 0 }];
        if (controls) {
          rows[2] = [{ note: 0, instrument: 0, volume: 0, volumePresent: false, effect: 19, parameter: 0x77 }];
          rows[5] = [{ note: 0, instrument: 0, volume: 0, volumePresent: false, effect: 19, parameter: 0x78 }];
        }
        rows[8] = [{ note: 255, instrument: 0, volume: 0, volumePresent: false, effect: 0, parameter: 0 }];
        const events = [];
        let voiceGain;
        const originalSetValue = AudioParam.prototype.setValueAtTime;
        const originalConnect = AudioNode.prototype.connect;
        AudioParam.prototype.setValueAtTime = function (value, when) {
          events.push({ param: this, value, when });
          return originalSetValue.call(this, value, when);
        };
        AudioNode.prototype.connect = function (destination, ...args) {
          if (this instanceof AudioBufferSourceNode && destination instanceof GainNode) voiceGain = destination;
          return originalConnect.call(this, destination, ...args);
        };
        const player = new TrackerPreviewPlayer();
        try {
          await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
          const scheduled = events.filter(event => event.param === voiceGain?.gain)
            .map(({ value, when }) => ({ value, when }));
          const levelAt = time => scheduled.filter(event => event.when <= time).at(-1)?.value ?? 0;
          return { scheduled, levelAt04: levelAt(0.4), levelAt08: levelAt(0.8), diagnostics: analyzeTrackerPreview('IT', rows, new Map([[1, sample]]), 1) };
        } finally {
          player.stop();
          await player.context?.close().catch(() => {});
          AudioParam.prototype.setValueAtTime = originalSetValue;
          AudioNode.prototype.connect = originalConnect;
        }
      };
      return { control: await render(true), baseline: await render(false) };
    });
    console.log(`IT S77/S78 volume envelope schedule: ${JSON.stringify(audit)}.`);
    expect(audit.control.scheduled.length).toBeGreaterThan(20);
    expect(audit.control.levelAt04).toBeGreaterThan(1);
    expect(audit.baseline.levelAt04).toBeLessThan(0.01);
    expect(audit.control.levelAt08).toBeLessThan(0.01);
    expect(audit.control.diagnostics.unsupportedEffects).toEqual([]);
  } finally {
    await electronApp?.close();
  }
});

test('schedules IT SDx note delays and SCx note cuts on Maxmod tick boundaries', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { maxmodGbaTickDurationSeconds } = await import('/src/utils/trackerMaxmodTiming.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 5 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 19, parameter: 0xd3 };
      rows[1][0] = { note: 0x41, notePresent: true, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0x42, notePresent: true, instrument: 0, volume: 0, effect: 19, parameter: 0xc3 };
      rows[3][0] = { note: 0x43, notePresent: true, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 254, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const starts = [];
      const stops = [];
      const originalStart = AudioBufferSourceNode.prototype.start;
      const originalStop = AudioBufferSourceNode.prototype.stop;
      AudioBufferSourceNode.prototype.start = function (...args) {
        starts.push(args[0] ?? this.context.currentTime);
        return originalStart.apply(this, args);
      };
      AudioBufferSourceNode.prototype.stop = function (...args) {
        stops.push(args[0] ?? this.context.currentTime);
        return originalStop.apply(this, args);
      };
      const player = new TrackerPreviewPlayer();
      let durationMs;
      try {
        durationMs = await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
      } finally {
        AudioBufferSourceNode.prototype.start = originalStart;
        AudioBufferSourceNode.prototype.stop = originalStop;
        player.stop();
      }
      return { starts, stops, durationMs, tick: maxmodGbaTickDurationSeconds(125) };
    });
    console.log(`IT SD3/SC3 Maxmod tick schedule: ${JSON.stringify(audit)}.`);
    expect(audit.durationMs).toBeGreaterThan(0);
    expect(audit.starts).toHaveLength(4);
    expect(audit.stops).toHaveLength(4);
    expect(Math.abs((audit.starts[1] - audit.starts[0]) - 3 * audit.tick)).toBeLessThan(0.0001);
    expect(Math.abs((audit.starts[2] - audit.starts[1]) - 6 * audit.tick)).toBeLessThan(0.0001);
    expect(audit.stops[2] - audit.starts[2]).toBeGreaterThan(3 * audit.tick + 0.005);
    expect(audit.stops[2] - audit.starts[2]).toBeLessThan(3 * audit.tick + 0.02);
  } finally {
    await electronApp?.close();
  }
});

test('applies IT S74-S76 new-note actions to previous voices', async () => {
  test.setTimeout(45_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const makePcm = frequency => {
        const pcm = new Float32Array(8_363);
        for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * frequency * index) / 8_363) * 0.25;
        return pcm;
      };
      const firstSample = { samples: makePcm(440), sampleRate: 8_363, loopStart: 0, loopEnd: 8_363, loopType: 1, rootNote: 60, volume: 64 };
      const secondSample = { samples: makePcm(880), sampleRate: 8_363, loopStart: 0, loopEnd: 8_363, loopType: 1, rootNote: 60, volume: 64 };
      const sample = {
        ...firstSample,
        variants: [firstSample, secondSample],
        noteMap: Array.from({ length: 96 }, (_, index) => index >= 63 ? 1 : 0),
        fadeout: 8192, fadeoutMaximum: 65536,
        volumeEnvelope: { points: [{ tick: 0, value: 64 }, { tick: 4, value: 64 }, { tick: 8, value: 0 }], sustain: 0, sustainStart: 0, sustainEnd: 1, loopStart: 0, loopEnd: 2, enabled: true, sustainEnabled: true, loopEnabled: false },
      };
      const render = async mode => {
        const renderedSample = mode === 'fade'
          ? { ...sample, volumeEnvelope: { points: [{ tick: 0, value: 64 }, { tick: 100, value: 64 }], sustain: 0, sustainStart: 0, sustainEnd: 1, loopStart: 0, loopEnd: 1, enabled: true, sustainEnabled: true, loopEnabled: false } }
          : sample;
        const rows = Array.from({ length: 12 }, () => []);
        rows[0] = [{ note: 60, instrument: 1, volume: 0, volumePresent: false, effect: 0, parameter: 0 }];
        const nna = { cut: 3, continue: 4, off: 5, fade: 6 }[mode];
        rows[1] = [{ note: 64, instrument: 1, volume: 0, volumePresent: false, effect: nna ? 19 : 0, parameter: nna ? 0x70 + nna : 0 }];
        const starts = [];
        const stops = [];
        const gainEvents = [];
        const sourceGainParameters = new WeakMap();
        const trackedGainParameters = new WeakSet();
        const originalStart = AudioBufferSourceNode.prototype.start;
        const originalStop = AudioBufferSourceNode.prototype.stop;
        const originalConnect = AudioBufferSourceNode.prototype.connect;
        const originalCreateGain = AudioContext.prototype.createGain;
        const originalSetValueAtTime = AudioParam.prototype.setValueAtTime;
        const originalLinearRampToValueAtTime = AudioParam.prototype.linearRampToValueAtTime;
        const originalExponentialRampToValueAtTime = AudioParam.prototype.exponentialRampToValueAtTime;
        const originalWarn = console.warn;
        const warnings = [];
        AudioBufferSourceNode.prototype.start = function (when, ...args) {
          starts.push({ source: this, when });
          return originalStart.call(this, when, ...args);
        };
        AudioBufferSourceNode.prototype.stop = function (when) {
          stops.push({ source: this, when });
          return originalStop.call(this, when);
        };
        AudioBufferSourceNode.prototype.connect = function (destination, ...args) {
          const gainParameter = destination?.gain;
          if (gainParameter) {
            sourceGainParameters.set(this, gainParameter);
            trackedGainParameters.add(gainParameter);
          }
          return originalConnect.call(this, destination, ...args);
        };
        AudioContext.prototype.createGain = function (...args) {
          const gainNode = originalCreateGain.apply(this, args);
          trackedGainParameters.add(gainNode.gain);
          return gainNode;
        };
        AudioParam.prototype.setValueAtTime = function (value, when) {
          if (trackedGainParameters.has(this)) gainEvents.push({ parameter: this, kind: 'set', value, when });
          return originalSetValueAtTime.call(this, value, when);
        };
        AudioParam.prototype.linearRampToValueAtTime = function (value, when) {
          if (trackedGainParameters.has(this)) gainEvents.push({ parameter: this, kind: 'linear-ramp', value, when });
          return originalLinearRampToValueAtTime.call(this, value, when);
        };
        AudioParam.prototype.exponentialRampToValueAtTime = function (value, when) {
          if (trackedGainParameters.has(this)) gainEvents.push({ parameter: this, kind: 'exponential-ramp', value, when });
          return originalExponentialRampToValueAtTime.call(this, value, when);
        };
        console.warn = (...args) => warnings.push(args.map(String).join(' '));
        const player = new TrackerPreviewPlayer();
        try {
          await player.play(rows, 1, 6, 125, [], new Map([[1, renderedSample]]), 'IT');
          const first = starts[0];
          const second = starts[1];
          const stop = stops.filter(event => event.source === first?.source).at(-1);
          const firstGain = sourceGainParameters.get(first?.source);
          const firstVoiceGainEvents = gainEvents.filter(event => event.parameter === firstGain);
          const releaseStart = mode === 'off' && second
            ? firstVoiceGainEvents.find(event => event.kind === 'set' && Math.abs(event.when - second.when) < 1e-6)
            : undefined;
          const releaseEnd = mode === 'off' && second
            ? [...firstVoiceGainEvents].reverse().find(event => event.kind === 'linear-ramp' && event.when > second.when && event.value <= 0.0001)
            : undefined;
          const fadeEnd = mode === 'fade' && second
            ? firstVoiceGainEvents.find(event => event.when > second.when && event.value <= 0.0001)
            : undefined;
          return {
            voiceCount: starts.length,
            firstVoiceDuration: first && stop ? stop.when - first.when : 0,
            firstAndSecondBuffersDiffer: Boolean(first && second && first.source.buffer !== second.source.buffer),
            newVoiceStartOffset: first && second ? second.when - first.when : 0,
            noteOffGainAtNewVoice: releaseStart?.value ?? null,
            noteOffPeakGain: Math.max(...firstVoiceGainEvents.map(event => event.value)),
            noteOffReleaseEndOffset: first && releaseEnd ? releaseEnd.when - first.when : 0,
            noteOffReleaseEndGain: releaseEnd?.value ?? null,
            fadeEndOffset: first && fadeEnd ? fadeEnd.when - first.when : 0,
            fadeEndGain: fadeEnd?.value ?? null,
            diagnostics: analyzeTrackerPreview('IT', rows, new Map([[1, renderedSample]]), 1),
            warnings,
          };
        } finally {
          player.stop();
          await player.context?.close().catch(() => {});
          AudioBufferSourceNode.prototype.start = originalStart;
          AudioBufferSourceNode.prototype.stop = originalStop;
          AudioBufferSourceNode.prototype.connect = originalConnect;
          AudioContext.prototype.createGain = originalCreateGain;
          AudioParam.prototype.setValueAtTime = originalSetValueAtTime;
          AudioParam.prototype.linearRampToValueAtTime = originalLinearRampToValueAtTime;
          AudioParam.prototype.exponentialRampToValueAtTime = originalExponentialRampToValueAtTime;
          console.warn = originalWarn;
        }
      };
      return {
        cut: await render('cut'), continued: await render('continue'),
        noteOff: await render('off'), fade: await render('fade'),
      };
    });
    console.log(`IT S74-S76 NNA voice schedules: ${JSON.stringify(audit)}.`);
    expect(audit.cut.voiceCount).toBe(2);
    expect(audit.continued.voiceCount).toBe(2);
    expect(audit.continued.firstVoiceDuration).toBeGreaterThan(audit.cut.firstVoiceDuration + 0.2);
    expect(audit.continued.diagnostics.unsupportedEffects).toEqual([]);
    expect(audit.noteOff.firstVoiceDuration).toBeGreaterThan(audit.cut.firstVoiceDuration + 0.02);
    expect(audit.noteOff.firstVoiceDuration).toBeLessThan(audit.continued.firstVoiceDuration);
    expect(audit.noteOff.firstAndSecondBuffersDiffer).toBe(true);
    expect(audit.noteOff.newVoiceStartOffset).toBeCloseTo(audit.cut.firstVoiceDuration - 0.01, 2);
    expect(audit.noteOff.noteOffGainAtNewVoice).toBeGreaterThan(0);
    expect(audit.noteOff.noteOffGainAtNewVoice / audit.noteOff.noteOffPeakGain).toBeGreaterThan(0.95);
    expect(audit.noteOff.noteOffGainAtNewVoice / audit.noteOff.noteOffPeakGain).toBeLessThan(1.05);
    expect(audit.noteOff.noteOffReleaseEndOffset).toBeGreaterThan(audit.noteOff.newVoiceStartOffset);
    expect(audit.noteOff.noteOffReleaseEndOffset).toBeLessThan(audit.continued.firstVoiceDuration);
    expect(audit.noteOff.noteOffReleaseEndGain).toBeLessThanOrEqual(0.0001);
    expect(audit.fade.firstVoiceDuration).toBeLessThan(audit.continued.firstVoiceDuration);
    expect(audit.fade.firstVoiceDuration).toBeGreaterThan(audit.fade.newVoiceStartOffset + 0.1);
    expect(audit.fade.fadeEndOffset).toBeGreaterThan(audit.fade.newVoiceStartOffset);
    expect(audit.fade.fadeEndOffset).toBeLessThan(audit.continued.firstVoiceDuration);
    expect(audit.fade.fadeEndGain).toBeLessThanOrEqual(0.0001);
    expect(audit.noteOff.diagnostics.unsupportedEffects).toEqual([]);
    expect(audit.fade.diagnostics.unsupportedEffects).toEqual([]);
  } finally {
    await electronApp?.close();
  }
});

test('preserves XM vibrato and tremolo phase only when E4/E7 bit 2 is set', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    const phaseCurves = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rateParameters = new WeakSet();
      const gainParameters = new WeakSet();
      const rateRamps = [];
      const gainRamps = [];
      const starts = [];
      let capture = false;
      const createBufferSource = AudioContext.prototype.createBufferSource;
      const createGain = AudioContext.prototype.createGain;
      const linearRamp = AudioParam.prototype.linearRampToValueAtTime;
      const sourceStart = AudioBufferSourceNode.prototype.start;
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = createBufferSource.apply(this, args);
        rateParameters.add(source.playbackRate);
        return source;
      };
      AudioContext.prototype.createGain = function (...args) {
        const gain = createGain.apply(this, args);
        gainParameters.add(gain.gain);
        return gain;
      };
      AudioParam.prototype.linearRampToValueAtTime = function (value, when) {
        if (capture && rateParameters.has(this)) rateRamps.push({ value, when, parameter: this });
        if (capture && gainParameters.has(this)) gainRamps.push({ value, when, parameter: this });
        return linearRamp.call(this, value, when);
      };
      AudioBufferSourceNode.prototype.start = function (when = 0, ...args) {
        if (capture) starts.push({ when, source: this });
        return sourceStart.call(this, when, ...args);
      };
      const readCurve = (entries, parameter, begin, end, pitch) => entries
        .filter(entry => entry.parameter === parameter && entry.when >= begin && entry.when < end)
        .map(entry => Number((pitch ? 12 * Math.log2(entry.value) : entry.value).toFixed(5)));
      const results = {};
      try {
        for (const { name, command, effect, entries, pitch } of [
          { name: 'vibrato', command: 0x04, effect: 0x04, entries: rateRamps, pitch: true },
          { name: 'tremolo', command: 0x07, effect: 0x07, entries: gainRamps, pitch: false },
        ]) {
          results[name] = {};
          for (const control of [0, 4]) {
            rateRamps.length = 0;
            gainRamps.length = 0;
            starts.length = 0;
            const rows = Array.from({ length: 4 }, () => []);
            rows[0][0] = { note: 49, instrument: 1, effect: 0x0e, parameter: (command << 4) | control };
            rows[1][0] = { note: 49, instrument: 1, effect, parameter: 0x4f };
            rows[2][0] = { note: 49, instrument: 1, effect: 0, parameter: 0 };
            rows[3][0] = { note: 49, instrument: 1, effect, parameter: 0x4f };
            const player = new TrackerPreviewPlayer();
            capture = true;
            await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'XM');
            capture = false;
            const curves = [1, 3].map(index => {
              const source = starts[index]?.source;
              const begin = starts[index]?.when ?? 0;
              const end = begin + 0.115;
              if (pitch) return readCurve(rateRamps, source?.playbackRate, begin, end, true);
              const candidates = new Map();
              for (const entry of gainRamps) {
                if (entry.when < begin || entry.when >= end) continue;
                const values = candidates.get(entry.parameter) ?? [];
                values.push(entry.value);
                candidates.set(entry.parameter, values);
              }
              return [...candidates.values()].sort((left, right) => right.length - left.length)[0] ?? [];
            });
            results[name][control] = curves;
            player.stop();
          }
        }
      } finally {
        capture = false;
        AudioContext.prototype.createBufferSource = createBufferSource;
        AudioContext.prototype.createGain = createGain;
        AudioParam.prototype.linearRampToValueAtTime = linearRamp;
        AudioBufferSourceNode.prototype.start = sourceStart;
      }
      return results;
    });
    console.log(`XM E4/E7 no-retrigger phase curves: ${JSON.stringify(phaseCurves)}.`);
    for (const name of ['vibrato', 'tremolo']) {
      expect(phaseCurves[name][0][0].length).toBeGreaterThan(4);
      expect(phaseCurves[name][0][1]).toEqual(phaseCurves[name][0][0]);
      expect(phaseCurves[name][4][0].length).toBeGreaterThan(4);
      expect(phaseCurves[name][4][1]).not.toEqual(phaseCurves[name][4][0]);
    }
  } finally {
    await electronApp?.close();
  }
});

test('plays MOD 6xy vibrato memory with a volume slide on a sustained voice', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 12, parameter: 32 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 4, parameter: 0x4f };
      rows[3][0] = { note: 0, instrument: 0, volume: 0, effect: 6, parameter: 0x40 };
      const player = new TrackerPreviewPlayer();
      window.__modVibratoVolumeSlidePlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'MOD');
    });
    await engine.waitForTimeout(500);
    const audio = await engine.evaluate(finishAudioCapture, 'pitch-segments');
    const levelBeforeSlide = audio.rmsSegments.find(segment => segment.time >= 0.26 && segment.time < 0.34)?.rms ?? 0;
    const levelAfterSlide = audio.rmsSegments.find(segment => segment.time >= 0.44 && segment.time < 0.52)?.rms ?? 0;
    const vibratoPitches = audio.pitchSegments.filter(segment => segment.time >= 0.26 && segment.time < 0.43).map(segment => segment.pitch);
    const vibratoRange = vibratoPitches.length ? Math.max(...vibratoPitches) - Math.min(...vibratoPitches) : 0;
    console.log(`MOD 6xy vibrato memory and volume slide: ${JSON.stringify({ levelBeforeSlide, levelAfterSlide, volumeRatio: levelAfterSlide / Math.max(1e-9, levelBeforeSlide), vibratoRange, rms: audio.rms })}.`);
    expect(audio.rms).toBeGreaterThan(0.0001);
    expect(levelBeforeSlide).toBeGreaterThan(0.01);
    expect(levelAfterSlide).toBeGreaterThan(levelBeforeSlide * 1.1);
    expect(vibratoRange).toBeGreaterThan(0.25);
  } finally {
    await electronApp?.close();
  }
});

test('plays XM Pxy panning slides on a sustained note in the structural preview', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const rows = Array.from({ length: 10 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 0, instrument: 0, volume: 0, effect: 0x19, parameter: 0x0f };
      const player = new TrackerPreviewPlayer();
      window.__xmPanningSlidePreviewPlayer = player;
      const sourcePrototype = OscillatorNode.prototype;
      const originalStop = sourcePrototype.stop;
      const originalStart = sourcePrototype.start;
      const stopTimes = [];
      const startTimes = [];
      sourcePrototype.stop = function (when) { stopTimes.push(when); return originalStop.call(this, when); };
      sourcePrototype.start = function (when) { startTimes.push(when); return originalStart.call(this, when); };
      const playbackRemainingMs = await player.play(rows, 4, 6, 500, [], new Map(), 'XM');
      sourcePrototype.stop = originalStop;
      sourcePrototype.start = originalStart;
      window.__xmPanningDebug = { playbackRemainingMs, startTimes, stopTimes };
    });
    await engine.waitForTimeout(900);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const playbackDebug = await engine.evaluate(() => window.__xmPanningDebug);
    const mean = (values, from, to) => {
      const windowSeconds = audio.envelopeWindowSeconds;
      const selected = values.filter((_, index) => index * windowSeconds >= from && index * windowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const playbackStartRelative = playbackDebug.startTimes[0] - audio.captureStartTime;
    const beforeLeft = mean(audio.leftEnvelope, playbackStartRelative + 0.09, playbackStartRelative + 0.12);
    const beforeRight = mean(audio.rightEnvelope, playbackStartRelative + 0.09, playbackStartRelative + 0.12);
    const afterLeft = mean(audio.leftEnvelope, playbackStartRelative + 0.20, playbackStartRelative + 0.23);
    const afterRight = mean(audio.rightEnvelope, playbackStartRelative + 0.20, playbackStartRelative + 0.23);
    console.log(`XM Pxy no-note panning slide: ${JSON.stringify({ beforeLeft, beforeRight, afterLeft, afterRight, duration: audio.duration, playbackDebug })}.`);
    expect(beforeLeft).toBeGreaterThan(0.01);
    expect(beforeRight).toBeGreaterThan(0.01);
    expect(afterLeft).toBeGreaterThan(0.01);
    expect(afterLeft).toBeGreaterThan(beforeLeft * 0.9);
    expect(afterRight).toBeLessThan(beforeRight * 0.95);
    expect(afterLeft).toBeGreaterThan(afterRight * 1.2);
  } finally {
    await electronApp?.close();
  }
});

test('applies XM E8x persistent panning to a sustained note', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const rows = Array.from({ length: 10 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 0, instrument: 0, volume: 0, effect: 0x0e, parameter: 0x8f };
      const player = new TrackerPreviewPlayer();
      window.__xmExtendedPanPlayer = player;
      window.__xmExtendedPanDebug = { panValues: [] };
      const trackedPanParams = new WeakSet();
      const nativeCreateStereoPanner = AudioContext.prototype.createStereoPanner;
      AudioContext.prototype.createStereoPanner = function (...args) {
        const panner = nativeCreateStereoPanner.apply(this, args);
        trackedPanParams.add(panner.pan);
        return panner;
      };
      const nativeSetValueAtTime = AudioParam.prototype.setValueAtTime;
      AudioParam.prototype.setValueAtTime = function (value, when) {
        if (trackedPanParams.has(this)) window.__xmExtendedPanDebug.panValues.push({ value, when });
        return nativeSetValueAtTime.call(this, value, when);
      };
      const originalStart = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (when) {
        window.__xmExtendedPanDebug.startTime = when;
        return originalStart.call(this, when);
      };
      try {
        await player.play(rows, 4, 6, 500, [], new Map(), 'XM');
      } finally {
        OscillatorNode.prototype.start = originalStart;
        AudioContext.prototype.createStereoPanner = nativeCreateStereoPanner;
        AudioParam.prototype.setValueAtTime = nativeSetValueAtTime;
      }
    });
    await engine.waitForTimeout(500);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const playback = await engine.evaluate(() => window.__xmExtendedPanDebug);
    const start = playback.startTime - audio.captureStartTime;
    const mean = (values, from, to) => {
      const windowSeconds = audio.envelopeWindowSeconds;
      const selected = values.filter((_, index) => index * windowSeconds >= from && index * windowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const panChangeTime = playback.panValues[0].when - audio.captureStartTime;
    const before = { left: mean(audio.leftEnvelope, panChangeTime - 0.08, panChangeTime - 0.03), right: mean(audio.rightEnvelope, panChangeTime - 0.08, panChangeTime - 0.03) };
    const after = { left: mean(audio.leftEnvelope, panChangeTime + 0.03, panChangeTime + 0.08), right: mean(audio.rightEnvelope, panChangeTime + 0.03, panChangeTime + 0.08) };
    console.log(`XM E8F persistent pan: ${JSON.stringify({ before, after, playback })}.`);
    expect(before.left).toBeGreaterThan(0.01);
    expect(before.right).toBeGreaterThan(0.01);
    expect(after.right).toBeGreaterThan(0.01);
    expect(after.right).toBeGreaterThan(after.left * 1.2);
    const expectedPan = (4 * Math.atan2(0.9375, 0.0625)) / Math.PI - 1;
    expect(playback.panValues[0].value).toBeCloseTo(expectedPan, 6);
    expect(after.right).toBeGreaterThan(after.left * 1.2);
    await engine.evaluate(() => { window.__xmExtendedPanPlayer?.stop(); window.__xmExtendedPanPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies XM panning envelopes relative to the sample pan', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1, panning: 64 };
      const instrument = {
        ...sample,
        variants: [sample],
        noteMap: Array(96).fill(0),
        volumeEnvelope: { points: [], sustain: 0, loopStart: 0, loopEnd: 0, enabled: false },
        panningEnvelope: {
          points: [{ tick: 0, value: 32 }, { tick: 2, value: 32 }, { tick: 6, value: 64 }],
          sustain: 0, loopStart: 0, loopEnd: 2, enabled: true, sustainEnabled: false, loopEnabled: false,
        },
      };
      const rows = Array.from({ length: 16 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__xmPanningEnvelopePlayer = player;
      window.__xmPanningEnvelopeDebug = {};
      const originalStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when) {
        window.__xmPanningEnvelopeDebug.startTime = when;
        return originalStart.call(this, when);
      };
      await player.play(rows, 4, 6, 125, [], new Map([[1, instrument]]), 'XM');
      AudioBufferSourceNode.prototype.start = originalStart;
    });
    await engine.waitForTimeout(500);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const playback = await engine.evaluate(() => window.__xmPanningEnvelopeDebug);
    const start = playback.startTime - audio.captureStartTime;
    const mean = (values, from, to) => {
      const windowSeconds = audio.envelopeWindowSeconds;
      const selected = values.filter((_, index) => index * windowSeconds >= from && index * windowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const before = { left: mean(audio.leftEnvelope, start + 0.04, start + 0.08), right: mean(audio.rightEnvelope, start + 0.04, start + 0.08) };
    const after = { left: mean(audio.leftEnvelope, start + 0.15, start + 0.20), right: mean(audio.rightEnvelope, start + 0.15, start + 0.20) };
    console.log(`XM panning envelope relative to sample pan: ${JSON.stringify({ before, after, playback })}.`);
    expect(before.left).toBeGreaterThan(before.right * 1.35);
    expect(after.left).toBeGreaterThan(0.01);
    expect(after.right).toBeGreaterThan(0.01);
    expect(after.right / after.left).toBeGreaterThan(0.85);
    expect(after.right / after.left).toBeLessThan(1.15);
    await engine.evaluate(() => { window.__xmPanningEnvelopePlayer?.stop(); window.__xmPanningEnvelopePlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies S3M S8x persistent panning to a sustained note', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 10 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 0, instrument: 0, volume: 0, effect: 19, parameter: 0x88 };
      rows[6][0] = { note: 0, instrument: 0, volume: 0, effect: 19, parameter: 0x8f };
      const player = new TrackerPreviewPlayer();
      window.__s3mExtendedPanPlayer = player;
      window.__s3mExtendedPanDebug = { panWrites: [], panParams: [] };
      const nativeCreateStereoPanner = AudioContext.prototype.createStereoPanner;
      const nativeSetAudioParamValue = AudioParam.prototype.setValueAtTime;
      AudioContext.prototype.createStereoPanner = function (...args) {
        const panner = nativeCreateStereoPanner.apply(this, args);
        window.__s3mExtendedPanDebug.panParams.push(panner.pan);
        return panner;
      };
      AudioParam.prototype.setValueAtTime = function (value, when) {
        if (window.__s3mExtendedPanDebug.panParams.includes(this)) window.__s3mExtendedPanDebug.panWrites.push({ value, when });
        return nativeSetAudioParamValue.call(this, value, when);
      };
      const originalStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when) {
        window.__s3mExtendedPanDebug.startTime = when;
        return originalStart.call(this, when);
      };
      await player.play(rows, 4, 6, 500, [], new Map([[1, sample]]), 'S3M');
      AudioBufferSourceNode.prototype.start = originalStart;
      AudioContext.prototype.createStereoPanner = nativeCreateStereoPanner;
      AudioParam.prototype.setValueAtTime = nativeSetAudioParamValue;
      window.__s3mExtendedPanDebug.panWrites = window.__s3mExtendedPanDebug.panWrites.map(write => write.value);
      delete window.__s3mExtendedPanDebug.panParams;
    });
    await engine.waitForTimeout(900);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const playback = await engine.evaluate(() => window.__s3mExtendedPanDebug);
    const start = playback.startTime - audio.captureStartTime;
    const mean = (values, from, to) => {
      const windowSeconds = audio.envelopeWindowSeconds;
      const selected = values.filter((_, index) => index * windowSeconds >= from && index * windowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const before = { left: mean(audio.leftEnvelope, start + 0.13, start + 0.17), right: mean(audio.rightEnvelope, start + 0.13, start + 0.17) };
    const afterCenter = { left: mean(audio.leftEnvelope, start + 0.25, start + 0.29), right: mean(audio.rightEnvelope, start + 0.25, start + 0.29) };
    const after = { left: mean(audio.leftEnvelope, start + 0.38, start + 0.42), right: mean(audio.rightEnvelope, start + 0.38, start + 0.42) };
    console.log(`S3M S8x center and right pan: ${JSON.stringify({ before, afterCenter, after, capture: { start: audio.captureStartTime, duration: audio.duration, envelopeWindowSeconds: audio.envelopeWindowSeconds }, playback })}.`);
    expect(playback.panWrites[0]).toBe(0);
    expect(playback.panWrites[1]).toBeGreaterThan(0.9);
    expect(playback.panWrites[1]).toBeLessThan(0.93);
    expect(before.left).toBeGreaterThan(0.01);
    expect(before.right).toBeGreaterThan(0.01);
    expect(afterCenter.left).toBeGreaterThan(0.01);
    expect(afterCenter.right / afterCenter.left).toBeGreaterThan(0.85);
    expect(afterCenter.right / afterCenter.left).toBeLessThan(1.15);
    expect(after.right).toBeGreaterThan(0.01);
    expect(after.right).toBeGreaterThan(after.left * 1.2);
    const expectedPan = (4 * Math.atan2(0.9375, 0.0625)) / Math.PI - 1;
    expect(playback.panValues[0].value).toBeCloseTo(expectedPan, 6);
    expect(after.right).toBeGreaterThan(after.left * 1.2);
    await engine.evaluate(() => { window.__s3mExtendedPanPlayer?.stop(); window.__s3mExtendedPanPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies tick-stepped S3M Hxy vibrato to sustained sample voices', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 16 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 8, parameter: 0x47 };
      rows[4][0] = { note: 0, instrument: 0, volume: 0, effect: 8, parameter: 0 };
      // Kxy combines the remembered Hxy vibrato with a channel volume slide.
      rows[6][0] = { note: 0, instrument: 0, volume: 0, effect: 11, parameter: 0x0f };
      const player = new TrackerPreviewPlayer();
      window.__s3mVibratoPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'S3M');
    });
    await engine.waitForTimeout(1_200);
    const audio = await engine.evaluate(finishAudioCapture, 'pitch-segments');
    const vibratoSegments = audio.pitchSegments.filter(segment => segment.time >= 0.25 && segment.time < 0.9 && Number.isFinite(segment.pitch));
    const vibratoRange = vibratoSegments.length ? Math.max(...vibratoSegments.map(segment => segment.pitch)) - Math.min(...vibratoSegments.map(segment => segment.pitch)) : 0;
    const combinedEffectVibratoSegments = audio.pitchSegments.filter(segment => segment.time >= 0.6 && segment.time < 0.9 && Number.isFinite(segment.pitch));
    const combinedEffectVibratoRange = combinedEffectVibratoSegments.length ? Math.max(...combinedEffectVibratoSegments.map(segment => segment.pitch)) - Math.min(...combinedEffectVibratoSegments.map(segment => segment.pitch)) : 0;
    const rmsInRange = (start, end) => {
      const segments = audio.stereoRmsSegments.filter(segment => segment.time >= start && segment.time < end);
      return Math.sqrt(segments.reduce((sum, segment) => sum + segment.rms ** 2, 0) / Math.max(1, segments.length));
    };
    const volumeBeforeCombinedEffect = rmsInRange(0.32, 0.52);
    const volumeDuringCombinedEffect = rmsInRange(0.78, 1.0);
    console.log(`S3M Hxy/Kxy sustained effects: ${JSON.stringify({ duration: audio.duration, rms: audio.rms, segments: vibratoSegments, vibratoRange, combinedEffectVibratoRange, volumeBeforeCombinedEffect, volumeDuringCombinedEffect })}.`);
    expect(audio.rms).toBeGreaterThan(0.01);
    expect(vibratoSegments.length).toBeGreaterThan(4);
    expect(vibratoRange).toBeGreaterThan(0.5);
    expect(vibratoRange).toBeLessThan(6);
    expect(combinedEffectVibratoSegments.length).toBeGreaterThan(1);
    expect(combinedEffectVibratoRange).toBeGreaterThan(0.2);
    expect(volumeDuringCombinedEffect).toBeLessThan(volumeBeforeCombinedEffect * 0.99);
    await engine.evaluate(() => { window.__s3mVibratoPlayer?.stop(); window.__s3mVibratoPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies remembered IT Hxy vibrato and Kxy volume slide to a sustained sample voice', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 16 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 64, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 8, parameter: 0x47 };
      rows[4][0] = { note: 0, instrument: 0, volume: 0, effect: 8, parameter: 0 };
      // Kxy reuses Hxy vibrato memory while applying its own volume slide.
      rows[6][0] = { note: 0, instrument: 0, volume: 0, effect: 11, parameter: 0x0f };
      const player = new TrackerPreviewPlayer();
      window.__itVibratoVolumePlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'IT');
    });
    await engine.waitForTimeout(1_200);
    const audio = await engine.evaluate(finishAudioCapture, 'pitch-segments');
    // Measure Hxy before Kxy lowers the sustained voice enough to make the
    // pitch estimator jump between harmonics.
    const vibratoSegments = audio.pitchSegments.filter(segment => segment.time >= 0.25 && segment.time < 0.68 && Number.isFinite(segment.pitch));
    const vibratoRange = vibratoSegments.length ? Math.max(...vibratoSegments.map(segment => segment.pitch)) - Math.min(...vibratoSegments.map(segment => segment.pitch)) : 0;
    const combinedEffectVibratoSegments = audio.pitchSegments.filter(segment => segment.time >= 0.78 && segment.time < 0.9 && Number.isFinite(segment.pitch));
    const combinedEffectVibratoRange = combinedEffectVibratoSegments.length ? Math.max(...combinedEffectVibratoSegments.map(segment => segment.pitch)) - Math.min(...combinedEffectVibratoSegments.map(segment => segment.pitch)) : 0;
    const rmsInRange = (start, end) => {
      const segments = audio.stereoRmsSegments.filter(segment => segment.time >= start && segment.time < end);
      return Math.sqrt(segments.reduce((sum, segment) => sum + segment.rms ** 2, 0) / Math.max(1, segments.length));
    };
    const volumeBeforeCombinedEffect = rmsInRange(0.32, 0.52);
    const volumeDuringCombinedEffect = rmsInRange(0.78, 1.0);
    console.log(`IT Hxy/Kxy sustained effects: ${JSON.stringify({ duration: audio.duration, rms: audio.rms, segments: vibratoSegments, vibratoRange, combinedEffectVibratoRange, volumeBeforeCombinedEffect, volumeDuringCombinedEffect })}.`);
    expect(audio.rms).toBeGreaterThan(0.01);
    expect(vibratoRange).toBeGreaterThan(0.15);
    // Pitch during Kxy remains diagnostic only; its volume slide can push the
    // signal below the reliable estimator range. RMS below validates Kxy.
    expect(volumeDuringCombinedEffect).toBeLessThan(volumeBeforeCombinedEffect * 0.99);
    await engine.evaluate(() => { window.__itVibratoVolumePlayer?.stop(); window.__itVibratoVolumePlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies S3M SEx pattern delay without retriggering the delayed row', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 19, parameter: 0xe2 };
      rows[1][0] = { note: 0x50, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__s3mPatternDelayPlayer = player;
      window.__s3mPatternDelayStarts = [];
      const originalStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when) {
        window.__s3mPatternDelayStarts.push(when);
        return originalStart.call(this, when);
      };
      await player.play(rows, 4, 6, 500, [], new Map([[1, sample]]), 'S3M');
      AudioBufferSourceNode.prototype.start = originalStart;
    });
    const starts = await engine.evaluate(() => window.__s3mPatternDelayStarts);
    const interval = starts[1] - starts[0];
    console.log(`S3M SE2 pattern delay interval: ${JSON.stringify({ starts, interval })}.`);
    expect(starts).toHaveLength(2);
    expect(interval).toBeGreaterThan(0.085);
    expect(interval).toBeLessThan(0.095);
    await engine.evaluate(() => { window.__s3mPatternDelayPlayer?.stop(); window.__s3mPatternDelayPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('schedules IT N0F channel-volume slide from tick zero', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 10 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 14, parameter: 0x0f };
      const player = new TrackerPreviewPlayer();
      window.__itChannelVolumePlayer = player;
      await player.play(rows, 4, 6, 500, [], new Map([[1, sample]]), 'IT');
    });
    await engine.waitForTimeout(500);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const onsetIndex = audio.leftEnvelope.findIndex(value => value > 0.002);
    const onset = onsetIndex * audio.envelopeWindowSeconds;
    const mean = (from, to) => {
      const selected = audio.leftEnvelope.filter((_, index) => index * audio.envelopeWindowSeconds >= from
        && index * audio.envelopeWindowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const before = mean(onset + 0.004, onset + 0.016);
    const after = mean(onset + 0.104, onset + 0.124);
    console.log(`IT N0F tick-zero channel-volume slide: ${JSON.stringify({ onset, before, after, ratio: after / before, rms: audio.rms })}.`);
    expect(before).toBeGreaterThan(0.01);
    expect(after).toBeLessThan(before * 0.1);
    await engine.evaluate(() => { window.__itChannelVolumePlayer?.stop(); window.__itChannelVolumePlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('keeps S3M and IT Pxy aligned with Maxmod pan-slide no-op', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = [[{ note: 49, instrument: 1, volume: 64, effect: 16, parameter: 0x0f }]];
      const results = {};
      for (const format of ['S3M', 'IT']) {
        const panningParameters = new WeakSet();
        const pannerParameters = [];
        const panRamps = [];
        const panValues = [];
        const createStereoPanner = AudioContext.prototype.createStereoPanner;
        const linearRamp = AudioParam.prototype.linearRampToValueAtTime;
        const setValue = AudioParam.prototype.setValueAtTime;
        AudioContext.prototype.createStereoPanner = function (...args) {
          const panner = createStereoPanner.apply(this, args);
          panningParameters.add(panner.pan);
          pannerParameters.push(panner.pan);
          return panner;
        };
        AudioParam.prototype.linearRampToValueAtTime = function (value, when) {
          if (panningParameters.has(this)) panRamps.push({ value, when });
          return linearRamp.call(this, value, when);
        };
        AudioParam.prototype.setValueAtTime = function (value, when) {
          if (panningParameters.has(this)) panValues.push(value);
          return setValue.call(this, value, when);
        };
        const player = new TrackerPreviewPlayer();
        try {
          await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), format, [], [0]);
        } finally {
          player.stop();
          AudioContext.prototype.createStereoPanner = createStereoPanner;
          AudioParam.prototype.linearRampToValueAtTime = linearRamp;
          AudioParam.prototype.setValueAtTime = setValue;
        }
        results[format] = { panRamps, panValues, currentPanValues: pannerParameters.map(parameter => parameter.value), unsupportedEffects: analyzeTrackerPreview(format, rows, new Map([[1, sample]]), 1).unsupportedEffects };
      }
      return results;
    });
    console.log(`S3M/IT Pxy target-compatible pan schedule: ${JSON.stringify(audit)}.`);
    for (const format of ['S3M', 'IT']) {
      expect(audit[format].unsupportedEffects).toEqual([16]);
      expect(audit[format].panRamps).toEqual([]);
      expect(audit[format].currentPanValues).toEqual([0]);
      expect(audit[format].panValues.every(value => value === 0)).toBe(true);
    }
  } finally {
    await electronApp?.close();
  }
});

test('applies IT Xxx channel pan to a sustained note and remembers it', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(32_768);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 60, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 12 }, () => []);
      rows[0][0] = { note: 60, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 0, instrument: 0, volume: 0, effect: 24, parameter: 255 };
      rows[5][0] = { note: 60, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__itPanPlayer = player;
      window.__itPanNodeValues = [];
      const originalCreateStereoPanner = AudioContext.prototype.createStereoPanner;
      AudioContext.prototype.createStereoPanner = function () {
        const node = originalCreateStereoPanner.call(this);
        window.__itPanNodeValues.push(node);
        return node;
      };
      await player.play(rows, 4, 6, 500, [], new Map([[1, sample]]), 'IT');
      AudioContext.prototype.createStereoPanner = originalCreateStereoPanner;
    });
    await engine.waitForTimeout(800);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const nodeValues = await engine.evaluate(() => window.__itPanNodeValues?.map(node => node.pan.value) ?? []);
    console.log(`IT XFF persistent pan: ${JSON.stringify({ nodeValues, rms: audio.rms, peak: audio.peak })}.`);
    expect(nodeValues).toHaveLength(2);
    expect(nodeValues[0]).toBeGreaterThan(0.98);
    expect(nodeValues[1]).toBeGreaterThan(0.98);
    expect(audio.rms).toBeGreaterThan(0.01);
    expect(audio.peak).toBeLessThan(1);
    await engine.evaluate(() => { window.__itPanPlayer?.stop(); window.__itPanPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies and remembers Maxmod IT S8x pan on subsequent notes', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 60, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 60, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 0, instrument: 0, volume: 0, effect: 19, parameter: 0x8f };
      rows[5][0] = { note: 60, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__itS8PanPlayer = player;
      window.__itS8PanNodes = [];
      const originalCreateStereoPanner = AudioContext.prototype.createStereoPanner;
      AudioContext.prototype.createStereoPanner = function () {
        const node = originalCreateStereoPanner.call(this);
        window.__itS8PanNodes.push(node);
        return node;
      };
      await player.play(rows, 4, 6, 500, [], new Map([[1, sample]]), 'IT');
      AudioContext.prototype.createStereoPanner = originalCreateStereoPanner;
    });
    await engine.waitForTimeout(500);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const nodeValues = await engine.evaluate(() => window.__itS8PanNodes?.map(node => node.pan.value) ?? []);
    const panByte = 0xf0;
    const normalizedPan = (panByte - 128) / 128;
    const rightGain = (normalizedPan + 1) / 2;
    const expectedAudioPan = (4 * Math.atan2(rightGain, 1 - rightGain)) / Math.PI - 1;
    console.log(`IT S8F stored Maxmod pan: ${JSON.stringify({ nodeValues, expectedAudioPan, rms: audio.rms })}.`);
    expect(nodeValues).toHaveLength(2);
    for (const value of nodeValues) expect(value).toBeCloseTo(expectedAudioPan, 4);
    expect(audio.rms).toBeGreaterThan(0.01);
    await engine.evaluate(() => { window.__itS8PanPlayer?.stop(); window.__itS8PanPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('matches Maxmod IT S6x no-op and warns about the unimplemented delay', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 19, parameter: 0x62 };
      rows[1][0] = { note: 61, notePresent: true, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__itFineDelayPlayer = player;
      window.__itFineDelayStarts = [];
      const originalStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when) {
        window.__itFineDelayStarts.push(when);
        return originalStart.call(this, when);
      };
      await player.play(rows, 4, 6, 250, [], new Map([[1, sample]]), 'IT');
      window.__itFineDelayDiagnostics = analyzeTrackerPreview('IT', rows, new Map([[1, sample]]), 4);
      AudioBufferSourceNode.prototype.start = originalStart;
    });
    const starts = await engine.evaluate(() => window.__itFineDelayStarts);
    const diagnostics = await engine.evaluate(() => window.__itFineDelayDiagnostics);
    const interval = starts[1] - starts[0];
    console.log(`IT S62 Maxmod no-op interval: ${JSON.stringify({ starts, interval, diagnostics })}.`);
    expect(starts).toHaveLength(2);
    expect(interval).toBeCloseTo(0.06, 2);
    expect(diagnostics.unsupportedEffects).toEqual([19]);
    await engine.evaluate(() => { window.__itFineDelayPlayer?.stop(); window.__itFineDelayPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('schedules IT Axx speed changes at Maxmod tick boundaries', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const trace = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { maxmodGbaTickDurationSeconds } = await import('/src/utils/trackerMaxmodTiming.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 60, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 3 }, () => []);
      rows[0][0] = { note: 60, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[1][0] = { note: 72, instrument: 1, volume: 0, effect: 1, parameter: 3 };
      rows[2][0] = { note: 60, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      const originalStart = AudioBufferSourceNode.prototype.start;
      const noteStarts = [];
      AudioBufferSourceNode.prototype.start = function (when, ...args) {
        noteStarts.push(when);
        return originalStart.call(this, when, ...args);
      };
      try {
        await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
      } finally {
        AudioBufferSourceNode.prototype.start = originalStart;
        player.stop();
      }
      const tickSeconds = maxmodGbaTickDurationSeconds(125);
      return { starts: noteStarts, expectedIntervals: [tickSeconds * 6, tickSeconds * 3] };
    });
    const { starts, expectedIntervals } = trace;
    const intervals = starts.slice(1).map((time, index) => time - starts[index]);
    console.log(`IT A03 preview row boundaries: ${JSON.stringify({ starts, intervals, expectedIntervals })}.`);
    expect(starts).toHaveLength(3);
    expect(Math.abs(intervals[0] - expectedIntervals[0])).toBeLessThan(1e-6);
    expect(Math.abs(intervals[1] - expectedIntervals[1])).toBeLessThan(1e-6);
    const realModuleBytes = fs.readFileSync(path.join(repositoryRoot, 'templateEngineGame', 'shooter_game', 'assets', 'musics', 'minor_boss_r.it'));
    const realModuleAudit = await engine.evaluate(async encoded => {
      const { parseTrackerModule, parseTrackerPlaybackRows, parseItSamples } = await import('/src/utils/trackerModule.ts');
      const { importTrackerModuleComposition } = await import('/src/utils/trackerCompositionImport.ts');
      const { exportMusicComposition } = await import('/src/utils/trackerCompositionExport.ts');
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { maxmodGbaTickDurationSeconds } = await import('/src/utils/trackerMaxmodTiming.ts');
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const info = parseTrackerModule(buffer, 'IT');
      const rows = parseTrackerPlaybackRows(buffer, 'IT', 65_536);
      const composition = importTrackerModuleComposition(buffer, 'minor_boss_r.it');
      const exported = new Uint8Array(exportMusicComposition(composition, 'IT').moduleData);
      const exportedBuffer = exported.buffer.slice(exported.byteOffset, exported.byteOffset + exported.byteLength);
      const exportedRows = parseTrackerPlaybackRows(exportedBuffer, 'IT', 65_536);
      const sourceSamples = parseItSamples(buffer);
      const exportedSamples = parseItSamples(exportedBuffer);
      const noteTimeline = (sourceRows, samples) => {
        const memory = Array.from({ length: 64 }, () => 0);
        const volumeMemory = Array.from({ length: 64 }, () => 64);
        const events = [];
        for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex += 1) for (let channel = 0; channel < sourceRows[rowIndex].length; channel += 1) {
          const event = sourceRows[rowIndex][channel];
          if (!event) continue;
          if (event.instrumentPresent && (event.note < 97 || event.note > 99)) memory[channel] = event.instrument;
          const instrument = memory[channel];
          const hasNote = event.note >= 1 && event.note <= 96;
          if (event.volumePresent && event.volume >= 0 && event.volume <= 64) volumeMemory[channel] = event.volume;
          else if (hasNote && instrument > 0 && event.instrument > 0) volumeMemory[channel] = samples.get(instrument)?.volume ?? 64;
          if (hasNote) events.push({ row: rowIndex, channel, note: event.note, instrument, volume: volumeMemory[channel] });
        }
        return events;
      };
      const sourceNoteTimeline = noteTimeline(rows, sourceSamples);
      const exportedNoteTimeline = noteTimeline(exportedRows, exportedSamples);
      const sourceNoteEvents = sourceNoteTimeline.filter(event => event.instrument > 0).map(({ instrument, ...event }) => event);
      const exportedNoteEvents = exportedNoteTimeline.filter(event => event.instrument > 0).map(({ instrument, ...event }) => event);
      const speedCommands = sourceRows => sourceRows.flatMap((row, rowIndex) => row.flatMap(event => event?.effect === 1 && event.parameter > 0 ? [{ row: rowIndex, speed: event.parameter }] : []));
      let speed = info.speed;
      let tempo = info.tempo;
      let expectedDurationSeconds = 0;
      const speedChanges = [];
      for (let row = 0; row < rows.length; row += 1) {
        for (const event of rows[row]) {
          if (event?.effect === 1 && event.parameter > 0) {
            speed = event.parameter;
            speedChanges.push({ row, speed });
          } else if (event?.effect === 20 && event.parameter >= 0x20) tempo = Math.min(255, event.parameter);
        }
        expectedDurationSeconds += speed * maxmodGbaTickDurationSeconds(tempo);
      }
      const player = new TrackerPreviewPlayer();
      try {
        const durationMs = await player.play(rows, info.channels, info.speed, info.tempo, [], parseItSamples(buffer), 'IT', [], [], undefined, true);
        const audioContextTime = player.context?.currentTime ?? 0;
        return {
          rows: rows.length,
          scheduledDurationMs: durationMs - 125 + audioContextTime * 1000,
          expectedDurationMs: expectedDurationSeconds * 1000,
          speedChanges,
          sourceNoteCount: sourceNoteEvents.length,
          sourceUntriggeredNoteCount: sourceNoteTimeline.length - sourceNoteEvents.length,
          exportedNoteCount: exportedNoteEvents.length,
          firstNoteEventMismatch: sourceNoteEvents.findIndex((event, index) => JSON.stringify(event) !== JSON.stringify(exportedNoteEvents[index])),
          exportedUntriggeredNoteCount: exportedNoteTimeline.length - exportedNoteEvents.length,
          sourceSpeedCommands: speedCommands(rows),
          exportedSpeedCommands: speedCommands(exportedRows),
        };
      } finally {
        player.stop();
      }
    }, realModuleBytes.toString('base64'));
    console.log(`minor_boss_r.it Maxmod Axx row-clock audit: ${JSON.stringify(realModuleAudit)}.`);
    expect(realModuleAudit.rows).toBe(1_984);
    expect(realModuleAudit.sourceNoteCount).toBe(2_722);
    expect(realModuleAudit.sourceUntriggeredNoteCount).toBe(110);
    expect(realModuleAudit.exportedNoteCount).toBe(realModuleAudit.sourceNoteCount);
    expect(realModuleAudit.firstNoteEventMismatch, 'IT import/export must preserve each triggered note row, channel, pitch, and effective note volume.').toBe(-1);
    expect(realModuleAudit.exportedUntriggeredNoteCount, 'IT notes that do not select an instrument must not be assigned the fallback instrument.').toBe(0);
    expect(realModuleAudit.speedChanges).toHaveLength(8);
    expect(realModuleAudit.exportedSpeedCommands).toEqual(realModuleAudit.sourceSpeedCommands);
    expect(Math.abs(realModuleAudit.scheduledDurationMs - realModuleAudit.expectedDurationMs)).toBeLessThan(1);
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
  }
});



test('applies IT W0F global volume slide from tick zero to a sustained note', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 10 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 22, parameter: 128 };
      rows[1][0] = { note: 0, instrument: 0, volume: 0, effect: 23, parameter: 0x0f };
      const player = new TrackerPreviewPlayer();
      window.__itGlobalVolumePlayer = player;
      const originalStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when) {
        window.__itGlobalVolumeStart = when;
        return originalStart.call(this, when);
      };
      await player.play(rows, 4, 6, 500, [], new Map([[1, sample]]), 'IT', [], [], undefined, false, 128);
      AudioBufferSourceNode.prototype.start = originalStart;
    });
    await engine.waitForTimeout(500);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const onsetIndex = audio.leftEnvelope.findIndex(value => value > 0.002);
    const onset = onsetIndex * audio.envelopeWindowSeconds;
    const mean = (from, to) => {
      const selected = audio.leftEnvelope.filter((_, index) => index * audio.envelopeWindowSeconds >= from && index * audio.envelopeWindowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const before = mean(onset + 0.005, onset + 0.025);
    const after = mean(onset + 0.200, onset + 0.240);
    console.log(`IT W0F tick-zero global volume slide: ${JSON.stringify({ onset, before, after, ratio: after / before, rms: audio.rms })}.`);
    expect(audio.rms).toBeGreaterThan(0.001);
    expect(before).toBeGreaterThan(0.01);
    expect(after).toBeLessThan(before * 0.5);
    await engine.evaluate(() => { window.__itGlobalVolumePlayer?.stop(); window.__itGlobalVolumePlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies IT Lxy and Dxy volume slides to a sustained voice', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 10 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 32, volumePresent: true, effect: 0, parameter: 0 };
      rows[1][0] = { note: 0, instrument: 0, volume: 0, effect: 12, parameter: 0x40 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 12, parameter: 0x40 };
      rows[3][0] = { note: 0, instrument: 0, volume: 0, effect: 12, parameter: 0x40 };
      rows[4][0] = { note: 0, instrument: 0, volume: 0, effect: 4, parameter: 0x04 };
      const originalStart = AudioBufferSourceNode.prototype.start;
      let voiceStarts = 0;
      AudioBufferSourceNode.prototype.start = function (...args) { voiceStarts += 1; return originalStart.apply(this, args); };
      const player = new TrackerPreviewPlayer();
      window.__itTonePortaVolumePlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'IT', [], [], undefined, false, 128);
      AudioBufferSourceNode.prototype.start = originalStart;
      window.__itTonePortaVoiceStarts = voiceStarts;
    });
    await engine.waitForTimeout(800);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const meanRms = (from, to) => {
      const selected = audio.rmsSegments.filter(segment => segment.time >= from && segment.time < to);
      return selected.reduce((sum, segment) => sum + segment.rms, 0) / Math.max(1, selected.length);
    };
    const volumeBefore = meanRms(0.06, 0.11);
    const volumeAfterLxy = meanRms(0.30, 0.42);
    const volumeAfterDxy = meanRms(0.62, 0.76);
    const voiceStarts = await engine.evaluate(() => window.__itTonePortaVoiceStarts);
    console.log(`IT Lxy/Dxy functional preview: ${JSON.stringify({ volumeBefore, volumeAfterLxy, volumeAfterDxy, voiceStarts, rms: audio.rms })}.`);
    expect(audio.rms).toBeGreaterThan(0.001);
    expect(volumeBefore).toBeGreaterThan(0.01);
    expect(volumeAfterLxy).toBeGreaterThan(volumeBefore * 1.4);
    expect(volumeAfterDxy).toBeLessThan(volumeAfterLxy * 0.85);
    expect(voiceStarts).toBe(1);
    await engine.evaluate(() => { window.__itTonePortaVolumePlayer?.stop(); window.__itTonePortaVolumePlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('keeps IT Yxy silent in the target-compatible preview', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 10 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 32, effect: 0, parameter: 0 };
      rows[1][0] = { note: 0, instrument: 0, volume: 0, effect: 25, parameter: 0x82 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 25, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__itPanbrelloPlayer = player;
      await player.play(rows, 4, 6, 500, [], new Map([[1, sample]]), 'IT', [], [], undefined, false, 128);
    });
    await engine.waitForTimeout(450);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const sideDifference = (from, to) => {
      const start = Math.floor(from / audio.envelopeWindowSeconds);
      const end = Math.floor(to / audio.envelopeWindowSeconds);
      let sum = 0;
      for (let index = start; index < end; index += 1) sum += Math.abs(audio.leftEnvelope[index] - audio.rightEnvelope[index]);
      return sum / Math.max(1, end - start);
    };
    const centeredDifference = sideDifference(0.02, 0.10);
    const panbrelloDifference = sideDifference(0.16, 0.28);
    console.log(`IT Y82 target-compatible preview: ${JSON.stringify({ centeredDifference, panbrelloDifference, leftRms: audio.leftRms, rightRms: audio.rightRms, rms: audio.rms })}.`);
    expect(audio.rms).toBeGreaterThan(0.001);
    expect(centeredDifference).toBeLessThan(0.002);
    expect(Math.abs(panbrelloDifference - centeredDifference)).toBeLessThan(0.001);
    expect(audio.leftRms).toBeGreaterThan(0.005);
    expect(audio.rightRms).toBeGreaterThan(0.005);
    await engine.evaluate(() => { window.__itPanbrelloPlayer?.stop(); window.__itPanbrelloPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('plays XM 3xx tone portamento without retriggering and remembers its speed', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 14 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 61, instrument: 0, volume: 0, effect: 3, parameter: 0x20 };
      rows[3][0] = { note: 0, instrument: 0, volume: 0, effect: 3, parameter: 0 };
      rows[4][0] = { note: 0, instrument: 0, volume: 0, effect: 3, parameter: 0 };
      rows[5][0] = { note: 0, instrument: 0, volume: 0, effect: 3, parameter: 0 };
      rows[6][0] = { note: 0, instrument: 0, volume: 0, effect: 3, parameter: 0 };
      rows[7][0] = { note: 0, instrument: 0, volume: 0, effect: 3, parameter: 0 };
      rows[8][0] = { note: 0, instrument: 0, volume: 0, effect: 3, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__xmPortamentoPreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'XM');
    });
    await engine.waitForTimeout(1_750);
    const audio = await engine.evaluate(finishAudioCapture, 'pitch');
    const pitchAt = time => audio.pitchSegments.reduce((best, segment) => Math.abs(segment.time - time) < Math.abs(best.time - time) ? segment : best).pitch;
    const beforeTarget = pitchAt(0.15);
    const earlyGlide = pitchAt(0.42);
    const continuedGlide = pitchAt(0.58);
    const nearTarget = pitchAt(0.85);
    console.log(`XM 3xx tone portamento and 300 speed memory: ${JSON.stringify({ beforeTarget, earlyGlide, continuedGlide, nearTarget, rms: audio.rms })}.`);
    expect(audio.rms).toBeGreaterThan(0.0001);
    expect(Math.abs(beforeTarget - 56)).toBeLessThan(1.5);
    expect(earlyGlide).toBeGreaterThan(beforeTarget + 1);
    expect(continuedGlide).toBeGreaterThan(earlyGlide + 1);
    expect(nearTarget).toBeGreaterThan(continuedGlide);
    expect(Math.abs(nearTarget - 68)).toBeLessThan(1.5);
    await engine.evaluate(() => { window.__xmPortamentoPreviewPlayer?.stop(); window.__xmPortamentoPreviewPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('quantizes XM 3xx tone portamento when E31 glissando is enabled', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 16 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[1][0] = { note: 0, instrument: 0, volume: 0, effect: 0x0e, parameter: 0x31 };
      rows[2][0] = { note: 61, instrument: 0, volume: 0, effect: 3, parameter: 0x20 };
      for (let row = 3; row <= 9; row += 1) rows[row][0] = { note: 0, instrument: 0, volume: 0, effect: 3, parameter: 0 };
      const rateParameters = new WeakSet();
      const scheduledRates = [];
      let voiceStartTime = Number.POSITIVE_INFINITY;
      const createBufferSource = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = createBufferSource.apply(this, args);
        rateParameters.add(source.playbackRate);
        return source;
      };
      const setValueAtTime = AudioParam.prototype.setValueAtTime;
      AudioParam.prototype.setValueAtTime = function (value, when) {
        if (rateParameters.has(this)) scheduledRates.push({ value, when });
        return setValueAtTime.call(this, value, when);
      };
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when = 0, ...args) {
        voiceStartTime = Math.min(voiceStartTime, when);
        return start.call(this, when, ...args);
      };
      const player = new TrackerPreviewPlayer();
      window.__xmGlissPreviewPlayer = player;
      await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'XM');
      AudioContext.prototype.createBufferSource = createBufferSource;
      AudioParam.prototype.setValueAtTime = setValueAtTime;
      AudioBufferSourceNode.prototype.start = start;
      window.__xmGlissRates = { voiceStartTime, scheduledRates };
    });
    const { voiceStartTime, scheduledRates } = await engine.evaluate(() => window.__xmGlissRates);
    const baseRate = scheduledRates.find(entry => entry.when <= voiceStartTime + 0.05)?.value;
    const glideSemitones = scheduledRates
      .filter(entry => entry.when >= voiceStartTime + 0.23 && entry.when <= voiceStartTime + 1.0)
      .map(entry => 12 * Math.log2(entry.value / baseRate));
    const distinctGlideSteps = [...new Set(glideSemitones.map(value => Math.round(value)))];
    const maxQuantizationError = Math.max(...glideSemitones.map(value => Math.abs(value - Math.round(value))));
    console.log(`XM E31 glissando: ${JSON.stringify({ voiceStartTime, glideSemitones, distinctGlideSteps, maxQuantizationError })}.`);
    expect(glideSemitones.length).toBeGreaterThan(5);
    expect(distinctGlideSteps.length).toBeGreaterThanOrEqual(5);
    expect(maxQuantizationError).toBeLessThan(0.03);
    await engine.evaluate(() => { window.__xmGlissPreviewPlayer?.stop(); window.__xmGlissPreviewPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies XM Gxx global volume and Hxy slide to notes already playing', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 10 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0x10, parameter: 0x20 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 0x11, parameter: 0x40 };
      rows[3][0] = { note: 0, instrument: 0, volume: 0, effect: 0x11, parameter: 0 };
      rows[8][0] = { note: 97, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__xmGlobalVolumePlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'XM');
    });
    await engine.waitForTimeout(1_300);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const mean = (from, to) => {
      const selected = audio.envelope.filter((_, index) => index * audio.envelopeWindowSeconds >= from && index * audio.envelopeWindowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const atHalfVolume = mean(0.08, 0.20);
    const afterFirstSlide = mean(0.30, 0.35);
    const afterRememberedSlide = mean(0.43, 0.49);
    console.log(`XM Gxx/Hxy global gain: ${JSON.stringify({ atHalfVolume, afterFirstSlide, afterRememberedSlide, rms: audio.rms })}.`);
    expect(audio.rms).toBeGreaterThan(0.0001);
    expect(atHalfVolume).toBeGreaterThan(0.01);
    expect(afterFirstSlide).toBeGreaterThan(atHalfVolume * 1.3);
    expect(afterRememberedSlide).toBeGreaterThan(afterFirstSlide * 1.1);
    await engine.evaluate(() => { window.__xmGlobalVolumePlayer?.stop(); window.__xmGlobalVolumePlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('follows XM Bxx position jumps and Dxx pattern breaks in Song preview', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    const fixture = createXmLoopFixture(1).toString('base64');
    await engine.evaluate(async encoded => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { appendXmPattern, parseTrackerPlaybackRows, updateXmPatternEvent } = await import('/src/utils/trackerModule.ts');
      const original = Uint8Array.from(atob(encoded), character => character.charCodeAt(0)).buffer;
      let module = appendXmPattern(appendXmPattern(original));
      module = updateXmPatternEvent(module, 0, 1, 0, { effect: 0x0b, parameter: 2 });
      module = updateXmPatternEvent(module, 0, 1, 1, { effect: 0x0d, parameter: 0x03 });
      module = updateXmPatternEvent(module, 2, 3, 0, { note: 61, instrument: 1 });
      const rows = parseTrackerPlaybackRows(module, 'XM', 128);
      window.__xmPatternFlowRows = rows.length;
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const player = new TrackerPreviewPlayer();
      window.__xmPatternFlowPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'XM');
    }, fixture);
    await engine.waitForTimeout(1_100);
    const rows = await engine.evaluate(() => window.__xmPatternFlowRows);
    const audio = await engine.evaluate(finishAudioCapture, 'pitch');
    const pitchAt = time => audio.pitchSegments.reduce((best, segment) => Math.abs(segment.time - time) < Math.abs(best.time - time) ? segment : best).pitch;
    const firstPatternPitch = pitchAt(0.15);
    const jumpedPatternPitch = pitchAt(0.45);
    console.log(`XM Bxx/Dxx playback flow: ${JSON.stringify({ rows, firstPatternPitch, jumpedPatternPitch, delta: jumpedPatternPitch - firstPatternPitch, rms: audio.rms })}.`);
    expect(rows).toBe(63);
    expect(audio.rms).toBeGreaterThan(0.0001);
    expect(jumpedPatternPitch).toBeGreaterThan(firstPatternPitch + 10);
    expect(jumpedPatternPitch).toBeLessThan(firstPatternPitch + 14);
    await engine.evaluate(() => { window.__xmPatternFlowPlayer?.stop(); window.__xmPatternFlowPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies XM EEx pattern delay without retriggering the delayed row', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const rows = Array.from({ length: 4 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, effect: 0x0e, parameter: 0xe2 };
      rows[1][0] = { note: 61, instrument: 1, effect: 0, parameter: 0 };
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const originalStart = AudioBufferSourceNode.prototype.start;
      window.__xmPatternDelayStarts = [];
      AudioBufferSourceNode.prototype.start = function (when = 0, ...args) {
        window.__xmPatternDelayStarts.push(when);
        return originalStart.call(this, when, ...args);
      };
      const player = new TrackerPreviewPlayer();
      window.__xmPatternDelayPlayer = player;
      await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'XM');
      AudioBufferSourceNode.prototype.start = originalStart;
    });
    const starts = await engine.evaluate(() => window.__xmPatternDelayStarts);
    const rowGap = starts[1] - starts[0];
    console.log(`XM EEx pattern delay starts: ${JSON.stringify({ starts, rowGap })}.`);
    expect(starts).toHaveLength(2);
    expect(rowGap).toBeGreaterThan(0.34);
    expect(rowGap).toBeLessThan(0.38);
    await engine.evaluate(() => { window.__xmPatternDelayPlayer?.stop(); window.__xmPatternDelayPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('repeats XM E6x pattern rows in Song preview', async () => {
  test.setTimeout(30_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(async encoded => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { parseTrackerPlaybackRows, updateXmPatternEvent } = await import('/src/utils/trackerModule.ts');
      let module = Uint8Array.from(atob(encoded), character => character.charCodeAt(0)).buffer;
      module = updateXmPatternEvent(module, 0, 1, 0, { effect: 0x0e, parameter: 0x60 });
      module = updateXmPatternEvent(module, 0, 2, 0, { note: 53, instrument: 1 });
      module = updateXmPatternEvent(module, 0, 3, 0, { effect: 0x0e, parameter: 0x62 });
      const rows = parseTrackerPlaybackRows(module, 'XM', 128);
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const originalStart = AudioBufferSourceNode.prototype.start;
      window.__xmPatternLoopStarts = [];
      AudioBufferSourceNode.prototype.start = function (when = 0, ...args) {
        window.__xmPatternLoopStarts.push(when);
        return originalStart.call(this, when, ...args);
      };
      const player = new TrackerPreviewPlayer();
      window.__xmPatternLoopPlayer = player;
      await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'XM');
      AudioBufferSourceNode.prototype.start = originalStart;
      window.__xmPatternLoopRows = rows.length;
    }, createXmLoopFixture(1).toString('base64'));
    const result = await engine.evaluate(() => ({ rows: window.__xmPatternLoopRows, starts: window.__xmPatternLoopStarts }));
    const intervals = result.starts.slice(1).map((time, index) => time - result.starts[index]);
    console.log(`XM E6x pattern loop: ${JSON.stringify({ ...result, intervals })}.`);
    expect(result.rows).toBe(70);
    expect(result.starts).toHaveLength(4);
    expect(intervals[0]).toBeGreaterThan(0.22);
    expect(intervals[0]).toBeLessThan(0.26);
    expect(intervals[1]).toBeGreaterThan(0.34);
    expect(intervals[1]).toBeLessThan(0.38);
    expect(intervals[2]).toBeGreaterThan(0.34);
    expect(intervals[2]).toBeLessThan(0.38);
    await engine.evaluate(() => { window.__xmPatternLoopPlayer?.stop(); window.__xmPatternLoopPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('plays S3M Gxx tone portamento and applies Mxx to the active channel', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 14 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0x50, instrument: 0, volume: 0, effect: 7, parameter: 0x20 };
      for (let row = 3; row <= 8; row += 1) rows[row][0] = { note: 0, instrument: 0, volume: 0, effect: 7, parameter: 0 };
      rows[9][0] = { note: 254, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__s3mPortamentoPreviewPlayer = player;
      const sourcePrototype = window.AudioBufferSourceNode.prototype;
      const originalStart = sourcePrototype.start;
      let voiceStarts = 0;
      sourcePrototype.start = function (...args) { voiceStarts += 1; return originalStart.apply(this, args); };
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'S3M');
      sourcePrototype.start = originalStart;
      window.__s3mPortamentoVoiceStarts = voiceStarts;
    });
    await engine.waitForTimeout(1_450);
    const portaAudio = await engine.evaluate(finishAudioCapture, 'pitch');
    const pitchAt = time => portaAudio.pitchSegments.reduce((best, segment) => Math.abs(segment.time - time) < Math.abs(best.time - time) ? segment : best).pitch;
    const beforeTarget = pitchAt(0.15);
    const earlyGlide = pitchAt(0.42);
    const continuedGlide = pitchAt(0.58);
    const nearTarget = pitchAt(0.85);
    const voiceStarts = await engine.evaluate(() => window.__s3mPortamentoVoiceStarts);
    console.log(`S3M Gxx tone portamento and G00 memory: ${JSON.stringify({ beforeTarget, earlyGlide, continuedGlide, nearTarget, rms: portaAudio.rms, voiceStarts })}.`);
    expect(portaAudio.rms).toBeGreaterThan(0.0001);
    expect(earlyGlide).toBeGreaterThan(beforeTarget + 1);
    expect(continuedGlide).toBeGreaterThan(earlyGlide + 1);
    expect(nearTarget).toBeGreaterThan(continuedGlide);
    expect(Math.abs(nearTarget - 69)).toBeLessThan(1.5);
    expect(voiceStarts).toBe(1);
    await engine.evaluate(() => { window.__s3mPortamentoPreviewPlayer?.stop(); window.__s3mPortamentoPreviewPlayer = undefined; });

    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 6 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 13, parameter: 32 };
      rows[4][0] = { note: 254, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__s3mChannelVolumePreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'S3M');
    });
    await engine.waitForTimeout(850);
    const channelVolumeAudio = await engine.evaluate(finishAudioCapture, 'sync');
    const mean = (values, from, to) => {
      const selected = values.filter((_, index) => index * channelVolumeAudio.envelopeWindowSeconds >= from && index * channelVolumeAudio.envelopeWindowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const beforeMxx = mean(channelVolumeAudio.envelope, 0.08, 0.20);
    const afterMxx = mean(channelVolumeAudio.envelope, 0.32, 0.44);
    console.log(`S3M Mxx channel volume: ${JSON.stringify({ beforeMxx, afterMxx, ratio: afterMxx / beforeMxx })}.`);
    expect(beforeMxx).toBeGreaterThan(0.01);
    expect(afterMxx).toBeGreaterThan(beforeMxx * 0.42);
    expect(afterMxx).toBeLessThan(beforeMxx * 0.58);
    await engine.evaluate(() => { window.__s3mChannelVolumePreviewPlayer?.stop(); window.__s3mChannelVolumePreviewPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('plays IT Gxx tone portamento and remembers G00 speed without retriggering', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(installBrowserPreviewAudioTap);
    const result = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 14 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0x50, notePresent: true, instrument: 0, volume: 0, effect: 7, parameter: 0x04 };
      for (let row = 3; row <= 8; row += 1) rows[row][0] = { note: 0, instrument: 0, volume: 0, effect: 7, parameter: 0 };
      rows[9][0] = { note: 254, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const unsupportedEffects = analyzeTrackerPreview('IT', rows, new Map([[1, sample]]), 1).unsupportedEffects;
      const player = new TrackerPreviewPlayer();
      window.__itPortamentoPreviewPlayer = player;
      const originalStart = AudioBufferSourceNode.prototype.start;
      const originalSetValueAtTime = AudioParam.prototype.setValueAtTime;
      const originalRampToValueAtTime = AudioParam.prototype.linearRampToValueAtTime;
      const pitchParams = new WeakSet();
      const pitchSchedule = [];
      const originalCreateBufferSource = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = originalCreateBufferSource.apply(this, args);
        pitchParams.add(source.playbackRate);
        return source;
      };
      AudioParam.prototype.setValueAtTime = function (value, when) {
        if (pitchParams.has(this)) pitchSchedule.push({ value, when });
        return originalSetValueAtTime.call(this, value, when);
      };
      AudioParam.prototype.linearRampToValueAtTime = function (value, when) {
        if (pitchParams.has(this)) pitchSchedule.push({ value, when });
        return originalRampToValueAtTime.call(this, value, when);
      };
      let voiceStarts = 0;
      AudioBufferSourceNode.prototype.start = function (...args) { voiceStarts += 1; return originalStart.apply(this, args); };
      let durationMs;
      try {
        durationMs = await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'IT');
      } finally {
        AudioBufferSourceNode.prototype.start = originalStart;
        AudioContext.prototype.createBufferSource = originalCreateBufferSource;
        AudioParam.prototype.setValueAtTime = originalSetValueAtTime;
        AudioParam.prototype.linearRampToValueAtTime = originalRampToValueAtTime;
      }
      return { unsupportedEffects, durationMs, voiceStarts, pitchSchedule };
    });
    await engine.waitForTimeout(1_450);
    const audio = await engine.evaluate(finishAudioCapture, 'pitch');
    const pitchAt = time => audio.pitchSegments.reduce((best, segment) => Math.abs(segment.time - time) < Math.abs(best.time - time) ? segment : best).pitch;
    const beforeTarget = pitchAt(0.15);
    const earlyGlide = pitchAt(0.42);
    const continuedGlide = pitchAt(0.58);
    const nearTarget = pitchAt(0.85);
    console.log(`IT Gxx tone portamento and G00 memory: ${JSON.stringify({ ...result, beforeTarget, earlyGlide, continuedGlide, nearTarget, rms: audio.rms })}.`);
    expect(result.unsupportedEffects).toEqual([]);
    expect(result.durationMs).toBeGreaterThan(1_500);
    expect(audio.rms).toBeGreaterThan(0.0001);
    expect(earlyGlide).toBeGreaterThan(beforeTarget + 1);
    expect(continuedGlide).toBeGreaterThan(earlyGlide + 1);
    expect(nearTarget).toBeGreaterThanOrEqual(continuedGlide - 0.5);
    expect(nearTarget - beforeTarget).toBeGreaterThan(10);
    expect(nearTarget - beforeTarget).toBeLessThan(20);
    expect(result.voiceStarts).toBe(1);
    expect(result.pitchSchedule.length).toBeGreaterThan(10);
    await engine.evaluate(() => { window.__itPortamentoPreviewPlayer?.stop(); window.__itPortamentoPreviewPlayer = undefined; });
  } finally {
    if (electronApp) await electronApp.close();
  }
});

test('applies S3M Dxy volume slide to a sustained voice on note-less rows', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 12 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 4, parameter: 0x0c };
      rows[10][0] = { note: 254, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__s3mDxyNoNotePlayer = player;
      await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'S3M');
    });
    await engine.waitForTimeout(1_000);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const mean = (from, to) => {
      const selected = audio.envelope.filter((_, index) => index * audio.envelopeWindowSeconds >= from && index * audio.envelopeWindowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const before = mean(0.08, 0.20);
    const after = mean(0.48, 0.60);
    console.log(`S3M note-less D0C volume slide: ${JSON.stringify({ before, after, ratio: after / before })}.`);
    expect(before).toBeGreaterThan(0.01);
    expect(after).toBeLessThan(before * 0.2);
    await engine.evaluate(() => { window.__s3mDxyNoNotePlayer?.stop(); window.__s3mDxyNoNotePlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('plays the original Soda7 S3M loop through consecutive notes and explicit volume rows', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    const sourcePath = path.join(repositoryRoot, 'templateEngineGame', 'shooter_game', 'assets', 'musics', 'soda7_xcopy_ohc.s3m');
    const encoded = fs.readFileSync(sourcePath).toString('base64');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    const audit = await engine.evaluate(async encodedModule => {
      const { parseS3mSamples, parseTrackerModule, parseTrackerPlaybackRows } = await import('/src/utils/trackerModule.ts');
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const bytes = Uint8Array.from(atob(encodedModule), character => character.charCodeAt(0));
      const moduleBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const info = parseTrackerModule(moduleBuffer, 'S3M');
      const allRows = parseTrackerPlaybackRows(moduleBuffer, 'S3M', 65_536);
      const rows = allRows.slice(1_258, 1_280).map(row => row.map(event => event ? { ...event } : event));
      const samples = parseS3mSamples(moduleBuffer);
      const sample = samples.get(11);
      if (!sample || sample.loopEnd <= sample.loopStart) throw new Error('The source voice must use Soda7 instrument 11 with its original sample loop.');
      const noteRows = rows.flatMap((row, index) => row[0]?.note > 0 && row[0]?.note < 0xf0 ? [{ row: index + 1_258, note: row[0].note, instrument: row[0].instrument }] : []);
      const volumeRows = rows.flatMap((row, index) => row[0]?.volumePresent ? [{ row: index + 1_258, volume: row[0].volume }] : []);
      const player = new TrackerPreviewPlayer();
      window.__soda7ContinuousLoopPlayer = player;
      await player.play(rows, info.channels, info.speed, info.tempo, [false, true, true, true, true], samples, 'S3M', [], info.channelPans);
      return { noteRows, volumeRows, sampleFrames: sample.samples.length, sampleRate: sample.sampleRate, loopStart: sample.loopStart, loopEnd: sample.loopEnd };
    }, encoded);
    await engine.waitForTimeout(1_350);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const mean = (from, to) => {
      const selected = audio.envelope.filter((_, index) => index * audio.envelopeWindowSeconds >= from && index * audio.envelopeWindowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const levels = { heldLoop: mean(0.72, 0.95), volumeReduced: mean(1.02, 1.24) };
    console.log(`Soda7 S3M continuous loop Preview: ${JSON.stringify({ ...audit, levels })}.`);
    expect(audit.noteRows.map(({ note, instrument }) => [note, instrument])).toEqual([[80, 11], [82, 11], [83, 11], [85, 11]]);
    expect(audit.volumeRows.map(({ volume }) => volume)).toEqual([64, 58, 52, 47, 41, 35, 29, 23, 17, 12, 6]);
    expect(levels.heldLoop).toBeGreaterThan(0.01);
    expect(levels.volumeReduced).toBeGreaterThan(0.001);
    expect(levels.volumeReduced).toBeLessThan(levels.heldLoop * 0.7);
    await engine.evaluate(() => { window.__soda7ContinuousLoopPlayer?.stop(); window.__soda7ContinuousLoopPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('keeps an S3M voice active across an explicit 0xFF empty-note field', async () => {
  test.setTimeout(45_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 9 }, () => []);
      rows[0][0] = { note: 0x40, notePresent: true, instrument: 1, volume: 64, volumePresent: true, effect: 0, parameter: 0 };
      rows[2][0] = { note: 255, notePresent: true, instrument: 0, volume: 32, volumePresent: true, effect: 4, parameter: 0x01 };
      rows[8][0] = { note: 254, notePresent: true, instrument: 0, volume: 0, volumePresent: false, effect: 0, parameter: 0 };
      const prototype = AudioBufferSourceNode.prototype;
      const nativeStart = prototype.start;
      const starts = [];
      prototype.start = function (...args) { starts.push(args[0]); return nativeStart.apply(this, args); };
      const player = new TrackerPreviewPlayer();
      window.__s3mEmptyNoteSentinel = { player, prototype, nativeStart, starts };
      await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'S3M');
    });
    await engine.waitForTimeout(800);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const mean = (from, to) => {
      const selected = audio.envelope.filter((_, index) => index * audio.envelopeWindowSeconds >= from && index * audio.envelopeWindowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const beforeEmptyCell = mean(0.08, 0.20);
    const afterEmptyCell = mean(0.40, 0.60);
    const starts = await engine.evaluate(() => {
      const state = window.__s3mEmptyNoteSentinel;
      state?.player.stop();
      if (state) state.prototype.start = state.nativeStart;
      const count = state?.starts.length ?? 0;
      window.__s3mEmptyNoteSentinel = undefined;
      return count;
    });
    console.log(`S3M explicit FF empty-cell sustain: ${JSON.stringify({ beforeEmptyCell, afterEmptyCell, ratio: afterEmptyCell / beforeEmptyCell, sourceStarts: starts })}.`);
    expect(beforeEmptyCell).toBeGreaterThan(0.01);
    expect(afterEmptyCell, 'An explicit S3M volume column must update the active voice even when the note field is 0xFF.').toBeLessThan(beforeEmptyCell * 0.7);
    expect(afterEmptyCell, 'S3M 0xFF means no note, so the active voice must continue past this effect row.').toBeGreaterThan(beforeEmptyCell * 0.25);
    expect(starts, 'An empty S3M cell must not retrigger the active voice.').toBe(1);
  } finally {
    await electronApp?.close().catch(() => {});
  }
});

test('applies S3M Dxy volume slide on the row that starts a note', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 12 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 64, volumePresent: true, effect: 4, parameter: 0x0c };
      rows[10][0] = { note: 254, instrument: 0, volume: 0, volumePresent: false, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__s3mDxyOnNotePlayer = player;
      await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'S3M');
    });
    await engine.waitForTimeout(700);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const mean = (from, to) => {
      const selected = audio.envelope.filter((_, index) => index * audio.envelopeWindowSeconds >= from && index * audio.envelopeWindowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const initial = mean(0.02, 0.04);
    const afterSlide = mean(0.13, 0.15);
    console.log(`S3M D0C on note-start row: ${JSON.stringify({ initial, afterSlide, ratio: afterSlide / initial })}.`);
    expect(initial).toBeGreaterThan(0.01);
    expect(afterSlide).toBeLessThan(initial * 0.4);
    await engine.evaluate(() => { window.__s3mDxyOnNotePlayer?.stop(); window.__s3mDxyOnNotePlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('restores S3M sample default volume on a note-only retrigger after a channel slide', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const firstSample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const secondSample = { ...firstSample, volume: 24 };
      const rows = Array.from({ length: 16 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 4, parameter: 0x0c };
      rows[4][0] = { note: 0x40, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      rows[6][0] = { note: 0x40, instrument: 0, volume: 32, volumePresent: true, effect: 0, parameter: 0 };
      rows[8][0] = { note: 0x40, instrument: 2, volume: 0, effect: 0, parameter: 0 };
      rows[14][0] = { note: 254, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__s3mPersistentVolumePlayer = player;
      await player.play(rows, 1, 6, 125, [], new Map([[1, firstSample], [2, secondSample]]), 'S3M');
    });
    await engine.waitForTimeout(1_450);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const mean = (from, to) => {
      const selected = audio.envelope.filter((_, index) => index * audio.envelopeWindowSeconds >= from && index * audio.envelopeWindowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const initial = mean(0.08, 0.20);
    const afterSlideAndNote = mean(0.52, 0.64);
    const afterExplicitVolume = mean(0.76, 0.88);
    const afterNewInstrument = mean(1.00, 1.12);
    console.log(`S3M persistent channel volume: ${JSON.stringify({ initial, afterSlideAndNote, afterExplicitVolume, afterNewInstrument, ratios: [afterSlideAndNote / initial, afterExplicitVolume / initial, afterNewInstrument / initial] })}.`);
    expect(initial).toBeGreaterThan(0.01);
    expect(afterSlideAndNote / initial).toBeGreaterThan(0.9);
    expect(afterSlideAndNote / initial).toBeLessThan(1.1);
    expect(afterExplicitVolume / initial).toBeGreaterThan(0.4);
    expect(afterExplicitVolume / initial).toBeLessThan(0.6);
    expect(afterNewInstrument / initial).toBeGreaterThan(0.3);
    expect(afterNewInstrument / initial).toBeLessThan(0.45);
    await engine.evaluate(() => { window.__s3mPersistentVolumePlayer?.stop(); window.__s3mPersistentVolumePlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('matches Maxmod tick behavior for S3M D0F and DF0 volume slides', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 12 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 4, parameter: 0x0f };
      rows[4][0] = { note: 0, instrument: 0, volume: 0, effect: 4, parameter: 0xf0 };
      rows[10][0] = { note: 254, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__s3mFineVolumeSlidePlayer = player;
      await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'S3M');
    });
    await engine.waitForTimeout(1_000);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const mean = (from, to) => {
      const selected = audio.envelope.filter((_, index) => index * audio.envelopeWindowSeconds >= from && index * audio.envelopeWindowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const before = mean(0.08, 0.20);
    const afterFineDown = mean(0.31, 0.43);
    const afterFineUp = mean(0.55, 0.67);
    console.log(`S3M D0F/DF0 fine volume slides: ${JSON.stringify({ before, afterFineDown, afterFineUp, downRatio: afterFineDown / before, restoredRatio: afterFineUp / before })}.`);
    expect(before).toBeGreaterThan(0.01);
    expect(afterFineDown).toBeLessThan(before * 0.1);
    expect(afterFineUp).toBeGreaterThan(before * 0.2);
    expect(afterFineUp).toBeLessThan(before * 0.3);
    await engine.evaluate(() => { window.__s3mFineVolumeSlidePlayer?.stop(); window.__s3mFineVolumeSlidePlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('applies S3M and IT Fxy and Exy pitch slides on note-less and note-bearing rows', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(installBrowserPreviewAudioTap);
    const results = [];
    for (const format of ['S3M', 'IT']) {
      await engine.evaluate(async moduleFormat => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { analyzeTrackerPreview } = await import('/src/utils/trackerModule.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 12 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 6, parameter: 0x02 };
      rows[4][0] = { note: 0, instrument: 0, volume: 0, effect: 5, parameter: 0x02 };
      rows[6][0] = { note: 0x40, instrument: 0, volume: 0, effect: 6, parameter: 0xf2 };
      rows[8][0] = { note: 0, instrument: 0, volume: 0, effect: 5, parameter: 0xe2 };
      rows[10][0] = { note: 254, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const diagnostics = analyzeTrackerPreview(moduleFormat, rows, new Map([[1, sample]]), 1);
      if (diagnostics.unsupportedEffects.length) throw new Error(`${moduleFormat} pitch slides were unexpectedly diagnosed as unsupported: ${diagnostics.unsupportedEffects.join(',')}`);
      const player = new TrackerPreviewPlayer();
      window.__trackerPitchSlidePlayer = player;
      const originalCreateBufferSource = AudioContext.prototype.createBufferSource;
      const originalSetValueAtTime = AudioParam.prototype.setValueAtTime;
      const playbackRates = new WeakSet();
      const pitchSchedule = [];
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = originalCreateBufferSource.apply(this, args);
        playbackRates.add(source.playbackRate);
        return source;
      };
      AudioParam.prototype.setValueAtTime = function (value, when) {
        if (playbackRates.has(this)) pitchSchedule.push({ value, when });
        return originalSetValueAtTime.call(this, value, when);
      };
      try {
        await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), moduleFormat);
      } finally {
        AudioContext.prototype.createBufferSource = originalCreateBufferSource;
        AudioParam.prototype.setValueAtTime = originalSetValueAtTime;
      }
      window.__trackerPitchSlideSchedule = pitchSchedule;
      return pitchSchedule;
      }, format);
      await engine.waitForTimeout(1_300);
      const audio = await engine.evaluate(finishAudioCapture, 'pitch-segments');
      const pitchSchedule = await engine.evaluate(() => window.__trackerPitchSlideSchedule ?? []);
      const pitchAt = seconds => {
        const event = pitchSchedule.filter(entry => entry.when <= pitchSchedule[0].when + seconds).at(-1);
        return event ? 12 * Math.log2(event.value / pitchSchedule[0].value) : Number.NaN;
      };
      const before = pitchAt(0.20);
      const afterSlideUp = pitchAt(0.46);
      const afterSlideDown = pitchAt(0.70);
      const afterFineUp = pitchAt(0.94);
      const afterFineDown = pitchAt(1.18);
      const result = { format, upDelta: afterSlideUp - before, restoredDelta: afterSlideDown - before, fineUpDelta: afterFineUp - afterSlideDown, fineRestoredDelta: afterFineDown - before, scheduledValues: pitchSchedule.length, rms: audio.rms };
      console.log(`${format} F02/E02 scheduled playback-rate trajectory: ${JSON.stringify(result)}.`);
      expect(audio.rms).toBeGreaterThan(0.0001);
      expect(pitchSchedule.length).toBeGreaterThan(10);
      expect(result.upDelta, `${format} F02 should raise scheduled pitch.`).toBeGreaterThan(format === 'IT' ? 0.7 : 0.25);
      expect(result.upDelta, `${format} F02 should stay within the expected slide range.`).toBeLessThan(format === 'IT' ? 1.3 : 0.8);
      expect(Math.abs(result.restoredDelta), `${format} E02 should bring scheduled pitch near its starting value.`).toBeLessThan(0.5);
      expect(result.fineUpDelta, `${format} FF2 should apply a fine scheduled pitch slide.`).toBeGreaterThan(format === 'IT' ? 0.025 : 0.01);
      expect(result.fineUpDelta, `${format} FF2 should remain a fine scheduled pitch step.`).toBeLessThan(format === 'IT' ? 0.2 : 0.6);
      expect(Math.abs(result.fineRestoredDelta), `${format} EE2 should return scheduled pitch near the initial value.`).toBeLessThan(0.5);
      results.push(result);
      await engine.evaluate(() => { window.__trackerPitchSlidePlayer?.stop(); window.__trackerPitchSlidePlayer = undefined; });
    }
    expect(results.map(result => result.format)).toEqual(['S3M', 'IT']);
  } finally {
    await electronApp?.close();
  }
});

test('applies S3M volume columns and restores the sample default on note-only retriggers', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 32, loopType: 1 };
      const rows = Array.from({ length: 12 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 64, volumePresent: true, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0, instrument: 0, volume: 16, volumePresent: true, effect: 0, parameter: 0 };
      rows[4][0] = { note: 0x40, instrument: 1, volume: 64, volumePresent: true, effect: 0, parameter: 0 };
      rows[6][0] = { note: 0, instrument: 1, volume: 0, volumePresent: false, effect: 0, parameter: 0 };
      rows[7][0] = { note: 0, instrument: 0, volume: 16, volumePresent: true, effect: 0, parameter: 0 };
      rows[8][0] = { note: 0x40, instrument: 0, volume: 0, volumePresent: false, effect: 0, parameter: 0 };
      rows[10][0] = { note: 254, instrument: 0, volume: 0, volumePresent: false, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__s3mVolumeColumnPlayer = player;
      await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'S3M');
    });
    await engine.waitForTimeout(1_400);
    const audio = await engine.evaluate(finishAudioCapture, 'sync');
    const mean = (from, to) => {
      const selected = audio.envelope.filter((_, index) => index * audio.envelopeWindowSeconds >= from && index * audio.envelopeWindowSeconds < to);
      return selected.reduce((sum, value) => sum + value, 0) / Math.max(1, selected.length);
    };
    const beforeVolumeColumn = mean(0.04, 0.10);
    const duringVolumeColumn = mean(0.28, 0.40);
    const afterRetrigger = mean(0.52, 0.64);
    const afterSampleOnlySelection = mean(0.76, 0.88);
    const beforeNoteOnlyRetrigger = mean(0.88, 0.96);
    const afterNoteOnlyRetrigger = mean(1.00, 1.12);
    console.log(`S3M volume columns and sample-default retriggers: ${JSON.stringify({ beforeVolumeColumn, duringVolumeColumn, afterRetrigger, afterSampleOnlySelection, beforeNoteOnlyRetrigger, afterNoteOnlyRetrigger, envelopeWindowSeconds: audio.envelopeWindowSeconds })}.`);
    expect(beforeVolumeColumn).toBeGreaterThan(0.01);
    expect(duringVolumeColumn).toBeLessThan(beforeVolumeColumn * 0.40);
    expect(afterRetrigger).toBeGreaterThan(beforeVolumeColumn * 0.75);
    expect(afterRetrigger).toBeLessThan(beforeVolumeColumn * 1.25);
    expect(afterSampleOnlySelection).toBeGreaterThan(afterRetrigger * 0.35);
    expect(afterSampleOnlySelection).toBeLessThan(afterRetrigger * 0.65);
    expect(beforeNoteOnlyRetrigger).toBeLessThan(afterSampleOnlySelection * 0.7);
    expect(afterNoteOnlyRetrigger).toBeGreaterThan(beforeNoteOnlyRetrigger * 1.7);
    expect(afterNoteOnlyRetrigger).toBeLessThan(beforeNoteOnlyRetrigger * 2.3);
    await engine.evaluate(() => { window.__s3mVolumeColumnPlayer?.stop(); window.__s3mVolumeColumnPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('plays S3M Lxy tone portamento with note volume slide and no retrigger', async () => {
  test.setTimeout(35_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 12 }, () => []);
      rows[0][0] = { note: 0x40, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[1][0] = { note: 0, instrument: 0, volume: 0, effect: 7, parameter: 0x20 };
      rows[2][0] = { note: 0x50, instrument: 0, volume: 0, effect: 12, parameter: 0x04 };
      for (let row = 3; row <= 8; row += 1) rows[row][0] = { note: 0, instrument: 0, volume: 0, effect: 12, parameter: 0 };
      rows[9][0] = { note: 254, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const originalStart = AudioBufferSourceNode.prototype.start;
      let voiceStarts = 0;
      AudioBufferSourceNode.prototype.start = function (...args) { voiceStarts += 1; return originalStart.apply(this, args); };
      const player = new TrackerPreviewPlayer();
      window.__s3mLxyPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'S3M');
      AudioBufferSourceNode.prototype.start = originalStart;
      window.__s3mLxyVoiceStarts = voiceStarts;
    });
    await engine.waitForTimeout(1_350);
    const audio = await engine.evaluate(finishAudioCapture, 'pitch-segments');
    const pitchAt = time => audio.pitchSegments.reduce((best, segment) => Math.abs(segment.time - time) < Math.abs(best.time - time) ? segment : best).pitch;
    const beforePortamento = pitchAt(0.15);
    const afterPortamento = pitchAt(0.85);
    const meanRms = (from, to) => {
      const selected = audio.rmsSegments.filter(segment => segment.time >= from && segment.time < to);
      return selected.reduce((sum, segment) => sum + segment.rms, 0) / Math.max(1, selected.length);
    };
    const volumeBefore = meanRms(0.08, 0.18);
    const volumeAfter = meanRms(0.45, 0.58);
    const voiceStarts = await engine.evaluate(() => window.__s3mLxyVoiceStarts);
    const volumeRatio = volumeAfter / volumeBefore;
    console.log(`S3M Lxy combined effect: ${JSON.stringify({ beforePortamento, afterPortamento, volumeBefore, volumeAfter, volumeRatio, voiceStarts })}.`);
    expect(audio.rms).toBeGreaterThan(0.0001);
    expect(Math.abs(beforePortamento - 57)).toBeLessThan(1.5);
    expect(Math.abs(afterPortamento - 69)).toBeLessThan(1.5);
    expect(volumeBefore).toBeGreaterThan(0.01);
    expect(volumeRatio).toBeGreaterThan(0.62);
    expect(volumeRatio).toBeLessThan(0.75);
    expect(voiceStarts).toBe(1);
    await engine.evaluate(() => { window.__s3mLxyPlayer?.stop(); window.__s3mLxyPlayer = undefined; });
  } finally {
    await electronApp?.close();
  }
});

test('plays PCM samples through the structural tracker preview', async () => {
  test.setTimeout(45_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: 0, rootNote: 49, volume: 64, loopType: 0 };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 97, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__syntheticSamplePreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'XM');
    });
    await engine.waitForTimeout(1_000);
    const audio = await engine.evaluate(finishAudioCapture);
    console.log(`Synthetic PCM tracker preview: ${JSON.stringify(audio)}.`);
    expect(audio.rms).toBeGreaterThan(0.0001);
    expect(audio.activeDuration).toBeGreaterThan(0.1);
    await engine.evaluate(() => { window.__syntheticSamplePreviewPlayer?.stop(); window.__syntheticSamplePreviewPlayer = undefined; });
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const nativeCreateBufferSource = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) {
        const source = nativeCreateBufferSource.apply(this, args);
        const nativeStart = source.start.bind(source);
        source.start = (...startArgs) => {
          const channel = source.buffer?.getChannelData(0);
          window.__modQ12PreviewBuffer = channel ? {
            sampleRate: source.buffer.sampleRate,
            frames: source.buffer.length,
            playbackRate: source.playbackRate.value,
            head: Array.from(channel.slice(0, 16)),
          } : undefined;
          return nativeStart(...startArgs);
        };
        return source;
      };
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: 0, rootNote: 49, volume: 64, loopType: 0 };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 0, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 49, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__instrumentMemoryPreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'MOD');
      AudioContext.prototype.createBufferSource = nativeCreateBufferSource;
    });
    const modQ12PreviewBuffer = await engine.evaluate(() => window.__modQ12PreviewBuffer);
    const expectedModQ12PreviewBuffer = await engine.evaluate(async () => {
      const { createTrackerMaxmodGbaSample } = await import('/src/utils/trackerMaxmodGbaSample.ts');
      const { convertTrackerSampleToMaxmodGbaPcm } = await import('/src/utils/trackerMaxmodSamplePcm.ts');
      const { trackerModMaxmodMixerStepQ12 } = await import('/src/utils/trackerModMaxmodPitch.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const stepQ12 = trackerModMaxmodMixerStepQ12(8_363, 49, 0);
      const converted = convertTrackerSampleToMaxmodGbaPcm(pcm, false);
      const expected = createTrackerMaxmodGbaSample(converted, stepQ12);
      return { sampleRate: expected.sampleRate, frames: expected.samples.length, stepQ12, head: Array.from(expected.samples.slice(0, 16)) };
    });
    expect(modQ12PreviewBuffer).toMatchObject({
      sampleRate: expectedModQ12PreviewBuffer.sampleRate,
      frames: expectedModQ12PreviewBuffer.frames,
      playbackRate: 1,
      head: expectedModQ12PreviewBuffer.head,
    });
    await engine.waitForTimeout(800);
    const instrumentMemoryAudio = await engine.evaluate(finishAudioCapture);
    console.log(`MOD instrument memory preview: ${JSON.stringify({ estimatedPitch: instrumentMemoryAudio.estimatedPitch, rms: instrumentMemoryAudio.rms })}.`);
    expect(instrumentMemoryAudio.rms).toBeGreaterThan(0.0001);
    expect(instrumentMemoryAudio.estimatedPitch).not.toBeNull();
    expect(Math.abs(instrumentMemoryAudio.estimatedPitch - 57)).toBeLessThan(1);
    await engine.evaluate(() => { window.__instrumentMemoryPreviewPlayer?.stop(); window.__instrumentMemoryPreviewPlayer = undefined; });
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 14 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 61, instrument: 0, volume: 0, effect: 3, parameter: 20 };
      rows[5][0] = { note: 0, instrument: 0, volume: 0, effect: 3, parameter: 20 };
      rows[6][0] = { note: 0, instrument: 0, volume: 0, effect: 3, parameter: 20 };
      rows[7][0] = { note: 0, instrument: 0, volume: 0, effect: 3, parameter: 20 };
      const player = new TrackerPreviewPlayer();
      window.__modPortamentoPreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'MOD');
    });
    await engine.waitForTimeout(1_800);
    const portamentoAudio = await engine.evaluate(finishAudioCapture, 'pitch');
    const pitchAt = time => portamentoAudio.pitchSegments.reduce((best, segment) => Math.abs(segment.time - time) < Math.abs(best.time - time) ? segment : best).pitch;
    const beforePortamentoPitch = pitchAt(0.2);
    const duringPortamentoPitch = pitchAt(0.55);
    const continuedPortamentoPitch = pitchAt(0.65);
    const afterPortamentoPitch = pitchAt(0.9);
    console.log(`MOD 3xx pitch ramp across rows: ${JSON.stringify({ beforePortamentoPitch, duringPortamentoPitch, continuedPortamentoPitch, afterPortamentoPitch })}.`);
    expect(Math.abs(beforePortamentoPitch - 57)).toBeLessThan(1.5);
    expect(duringPortamentoPitch).toBeGreaterThan(beforePortamentoPitch - 0.5);
    expect(continuedPortamentoPitch).toBeGreaterThan(duringPortamentoPitch + 4);
    expect(continuedPortamentoPitch).toBeLessThan(afterPortamentoPitch - 1);
    expect(Math.abs(afterPortamentoPitch - 69)).toBeLessThan(1);
    await engine.evaluate(() => { window.__modPortamentoPreviewPlayer?.stop(); window.__modPortamentoPreviewPlayer = undefined; });
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 6 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 14, parameter: 0x1f };
      const player = new TrackerPreviewPlayer();
      window.__modFineSlidePreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'MOD');
    });
    await engine.waitForTimeout(750);
    const fineSlideAudio = await engine.evaluate(finishAudioCapture, 'pitch');
    const pitchNear = time => fineSlideAudio.pitchSegments.reduce((best, segment) => Math.abs(segment.time - time) < Math.abs(best.time - time) ? segment : best).pitch;
    const pitchBeforeFineSlide = pitchNear(0.12);
    const pitchAfterFineSlide = pitchNear(0.36);
    console.log(`MOD E1x fine slide: ${JSON.stringify({ pitchBeforeFineSlide, pitchAfterFineSlide })}.`);
    expect(Math.abs(pitchBeforeFineSlide - 57)).toBeLessThan(1);
    expect(pitchAfterFineSlide).toBeGreaterThan(pitchBeforeFineSlide + 0.35);
    expect(pitchAfterFineSlide).toBeLessThan(pitchBeforeFineSlide + 1.9);
    await engine.evaluate(() => { window.__modFineSlidePreviewPlayer?.stop(); window.__modFineSlidePreviewPlayer = undefined; });
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { maxmodGbaTickDurationSeconds } = await import('/src/utils/trackerMaxmodTiming.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 6 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[1][0] = { note: 0, instrument: 0, volume: 0, effect: 10, parameter: 0x0f };
      const gainIds = new WeakMap();
      const gainEvents = [];
      const sourceStarts = [];
      let nextGainId = 0;
      const createGain = AudioContext.prototype.createGain;
      const setValueAtTime = AudioParam.prototype.setValueAtTime;
      const start = AudioBufferSourceNode.prototype.start;
      AudioContext.prototype.createGain = function (...args) {
        const gain = createGain.apply(this, args);
        gainIds.set(gain.gain, nextGainId++);
        return gain;
      };
      AudioParam.prototype.setValueAtTime = function (value, when) {
        const gainId = gainIds.get(this);
        if (gainId !== undefined) gainEvents.push({ gainId, value, when });
        return setValueAtTime.call(this, value, when);
      };
      AudioBufferSourceNode.prototype.start = function (when) {
        sourceStarts.push(when);
        return start.call(this, when);
      };
      const player = new TrackerPreviewPlayer();
      window.__modVolumeSlidePreviewPlayer = player;
      try {
        await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'MOD');
      } finally {
        AudioContext.prototype.createGain = createGain;
        AudioParam.prototype.setValueAtTime = setValueAtTime;
        AudioBufferSourceNode.prototype.start = start;
      }
      const tickDuration = maxmodGbaTickDurationSeconds(125);
      const expectedTicks = [7, 8, 9, 10, 11];
      const expectedTimes = expectedTicks.map(tick => sourceStarts[0] + tick * tickDuration);
      const groups = new Map();
      for (const event of gainEvents) {
        if (!groups.has(event.gainId)) groups.set(event.gainId, []);
        groups.get(event.gainId).push(event);
      }
      const scheduledGainEvents = [...groups.values()].find(events => expectedTimes.every(time =>
        events.some(event => Math.abs(event.when - time) < 0.001)));
      const rowStart = sourceStarts[0] + 6 * tickDuration;
      const rowEnd = rowStart + 6 * tickDuration;
      const effectEvents = scheduledGainEvents?.filter(event => event.when >= rowStart - 0.001 && event.when < rowEnd - 0.001) ?? [];
      window.__modVolumeSlideSchedule = {
        tickDuration,
        expectedTicks,
        actualTicks: effectEvents.map(event => Math.round((event.when - sourceStarts[0]) / tickDuration)),
        relativeVolumes: effectEvents.map(event => Number((event.value / Math.max(1e-9, effectEvents[0]?.value ?? 0)).toFixed(6))),
      };
    });
    await engine.waitForTimeout(750);
    const volumeSlideAudio = await engine.evaluate(finishAudioCapture, 'segments');
    const volumeBeforeSlide = volumeSlideAudio.rmsSegments.find(segment => segment.time >= 0.08 && segment.time < 0.16)?.rms ?? 0;
    const volumeAfterSlide = volumeSlideAudio.rmsSegments.find(segment => segment.time >= 0.36 && segment.time < 0.44)?.rms ?? 0;
    const volumeSlideSchedule = await engine.evaluate(() => window.__modVolumeSlideSchedule);
    console.log(`MOD Axy no-note volume slide: ${JSON.stringify({ volumeBeforeSlide, volumeAfterSlide, schedule: volumeSlideSchedule })}.`);
    expect(volumeBeforeSlide).toBeGreaterThan(0.02);
    expect(volumeAfterSlide).toBeLessThan(volumeBeforeSlide * 0.05);
    expect(volumeSlideSchedule.actualTicks).toEqual(volumeSlideSchedule.expectedTicks);
    expect(volumeSlideSchedule.relativeVolumes).toEqual([1, 34 / 49, 19 / 49, 4 / 49, 0].map(value => Number(value.toFixed(6))));
    await engine.evaluate(() => { window.__modVolumeSlidePreviewPlayer?.stop(); window.__modVolumeSlidePreviewPlayer = undefined; });
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 6 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 12, parameter: 32 };
      const player = new TrackerPreviewPlayer();
      window.__modSetVolumePreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'MOD');
    });
    await engine.waitForTimeout(750);
    const setVolumeAudio = await engine.evaluate(finishAudioCapture, 'segments');
    const volumeBeforeSet = setVolumeAudio.rmsSegments.find(segment => segment.time >= 0.08 && segment.time < 0.16)?.rms ?? 0;
    const volumeAfterSet = setVolumeAudio.rmsSegments.find(segment => segment.time >= 0.32 && segment.time < 0.4)?.rms ?? 0;
    const volumeSetRatio = volumeAfterSet / Math.max(1e-9, volumeBeforeSet);
    console.log(`MOD Cxx sustained volume change: ${JSON.stringify({ volumeBeforeSet, volumeAfterSet, volumeSetRatio })}.`);
    expect(volumeBeforeSet).toBeGreaterThan(0.02);
    expect(volumeSetRatio).toBeGreaterThan(0.35);
    expect(volumeSetRatio).toBeLessThan(0.75);
    await engine.evaluate(() => { window.__modSetVolumePreviewPlayer?.stop(); window.__modSetVolumePreviewPlayer = undefined; });
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 220 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 49, volume: 64, loopType: 1 };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[2][0] = { note: 0, instrument: 0, volume: 0, effect: 12, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__modZeroVolumePreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'MOD');
    });
    await engine.waitForTimeout(750);
    const zeroVolumeAudio = await engine.evaluate(finishAudioCapture, 'segments');
    const volumeAfterZero = zeroVolumeAudio.rmsSegments.find(segment => segment.time >= 0.4 && segment.time < 0.5)?.rms ?? 0;
    console.log(`MOD C00 silence control: ${JSON.stringify({ volumeAfterZero })}.`);
    expect(volumeAfterZero).toBeLessThan(0.000001);
    await engine.evaluate(() => { window.__modZeroVolumePreviewPlayer?.stop(); window.__modZeroVolumePreviewPlayer = undefined; });
    const captureModFineTune = async fineTune => {
      await engine.evaluate(async fineTune => {
        const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
        const pcm = new Float32Array(8_363);
        for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
        const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: 0, rootNote: 49, fineTune, volume: 64, loopType: 0 };
        const rows = Array.from({ length: 8 }, () => []);
        rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
        const player = new TrackerPreviewPlayer();
        window.__modFineTunePreviewPlayer = player;
        await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'MOD');
      }, fineTune);
      await engine.waitForTimeout(600);
      const audio = await engine.evaluate(finishAudioCapture);
      await engine.evaluate(() => { window.__modFineTunePreviewPlayer?.stop(); window.__modFineTunePreviewPlayer = undefined; });
      return audio;
    };
    const modFineTuneBaseAudio = await captureModFineTune(0);
    const modFineTuneAudio = await captureModFineTune(4);
    const modFineTuneDelta = modFineTuneAudio.estimatedPitch - modFineTuneBaseAudio.estimatedPitch;
    console.log(`MOD sample finetune +4 steps: base=${JSON.stringify(modFineTuneBaseAudio)}, tuned=${JSON.stringify(modFineTuneAudio)}, delta=${modFineTuneDelta}.`);
    expect(Math.abs(modFineTuneDelta - 0.25)).toBeLessThan(0.1);
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const variant = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: 0, rootNote: 48, volume: 64, loopType: 0 };
      const noteMap = Array(96).fill(0);
      noteMap[48] = 1;
      const instrument = { ...variant, variants: [{ ...variant, samples: new Float32Array(128) }, variant], noteMap, volumeEnvelope: { points: [], sustain: 0, loopStart: 0, loopEnd: 0, enabled: false }, panningEnvelope: { points: [], sustain: 0, loopStart: 0, loopEnd: 0, enabled: false } };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 49, instrument: 2, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 97, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__mappedSamplePreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[2, instrument]]), 'XM');
    });
    await engine.waitForTimeout(1_000);
    const mappedAudio = await engine.evaluate(finishAudioCapture);
    console.log(`Mapped XM sample tracker preview: ${JSON.stringify(mappedAudio)}.`);
    expect(mappedAudio.rms).toBeGreaterThan(0.0001);
    await engine.evaluate(() => { window.__mappedSamplePreviewPlayer?.stop(); window.__mappedSamplePreviewPlayer = undefined; });
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(8_363);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: 0, rootNote: 48, volume: 64, loopType: 0 };
      const rows = Array.from({ length: 16 }, () => []);
      for (const row of [0, 4, 8, 12]) rows[row][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__repeatedSamplePreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'XM');
    });
    await engine.waitForTimeout(1_000);
    const repeatedAudio = await engine.evaluate(finishAudioCapture);
    console.log(`Repeated PCM tracker preview: ${JSON.stringify(repeatedAudio)}.`);
    expect(repeatedAudio.rms).toBeGreaterThan(0.0001);
    await engine.evaluate(() => { window.__repeatedSamplePreviewPlayer?.stop(); window.__repeatedSamplePreviewPlayer = undefined; });
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(1_024);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.2;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 48, volume: 64, loopType: 1, panning: 0 };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__loopedPannedPreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'XM');
    });
    await engine.waitForTimeout(1_100);
    const loopedPannedAudio = await engine.evaluate(finishAudioCapture);
    console.log(`Looped XM sample and hard-left pan preview: ${JSON.stringify(loopedPannedAudio)}.`);
    expect(loopedPannedAudio.activeDuration).toBeGreaterThan(0.5);
    expect(loopedPannedAudio.leftRms).toBeGreaterThan(loopedPannedAudio.rightRms * 10);
    await engine.evaluate(() => { window.__loopedPannedPreviewPlayer?.stop(); window.__loopedPannedPreviewPlayer = undefined; });
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(1_024);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.2;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: 0, rootNote: 48, volume: 64, loopType: 0, panning: 0 };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__oneShotPannedPreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'XM');
    });
    await engine.waitForTimeout(1_100);
    const oneShotPannedAudio = await engine.evaluate(finishAudioCapture);
    console.log(`One-shot XM sample and hard-left pan preview: ${JSON.stringify(oneShotPannedAudio)}.`);
    expect(loopedPannedAudio.activeDuration).toBeGreaterThan(oneShotPannedAudio.activeDuration * 2);
    await engine.evaluate(() => { window.__oneShotPannedPreviewPlayer?.stop(); window.__oneShotPannedPreviewPlayer = undefined; });
    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(1_024);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.2;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, rootNote: 48, volume: 64, loopType: 1, panning: 255 };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      window.__rightPannedPreviewPlayer = player;
      await player.play(rows, 4, 6, 125, [], new Map([[1, sample]]), 'XM');
    });
    await engine.waitForTimeout(1_100);
    const rightPannedAudio = await engine.evaluate(finishAudioCapture);
    console.log(`Hard-right XM sample pan preview: ${JSON.stringify(rightPannedAudio)}.`);
    expect(rightPannedAudio.rightRms).toBeGreaterThan(rightPannedAudio.leftRms * 10);
    await engine.evaluate(() => { window.__rightPannedPreviewPlayer?.stop(); window.__rightPannedPreviewPlayer = undefined; });
    const scheduleChannelMix = async (volume, pan) => engine.evaluate(async ({ volume, pan }) => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const voiceGainParams = new Set();
      const panNodes = [];
      const gainEvents = [];
      const nativeConnect = GainNode.prototype.connect;
      const nativeCreateGain = AudioContext.prototype.createGain;
      const gainParams = new Set();
      const nativeCreateStereoPanner = AudioContext.prototype.createStereoPanner;
      const nativeRamp = AudioParam.prototype.exponentialRampToValueAtTime;
      AudioContext.prototype.createGain = function (...args) {
        const node = nativeCreateGain.apply(this, args);
        gainParams.add(node.gain);
        return node;
      };
      GainNode.prototype.connect = function (destination, ...args) {
        if (destination instanceof StereoPannerNode) voiceGainParams.add(this.gain);
        return nativeConnect.call(this, destination, ...args);
      };
      AudioContext.prototype.createStereoPanner = function (...args) {
        const node = nativeCreateStereoPanner.apply(this, args);
        panNodes.push(node);
        return node;
      };
      AudioParam.prototype.exponentialRampToValueAtTime = function (value, when) {
        if (gainParams.has(this)) gainEvents.push({ param: this, value, when });
        return nativeRamp.call(this, value, when);
      };
      const pcm = new Float32Array(1_024);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.2;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: 0, rootNote: 48, volume: 64, loopType: 0, panning: 128 };
      const rows = Array.from({ length: 8 }, () => []);
      rows[0][0] = { note: 49, instrument: 1, volume: 0, effect: 0, parameter: 0 };
      rows[4][0] = { note: 97, instrument: 0, volume: 0, effect: 0, parameter: 0 };
      const player = new TrackerPreviewPlayer();
      try {
        await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'XM', [volume], [pan]);
        return {
          panValues: panNodes.map(node => node.pan.value),
          voicePeakGain: gainEvents.find(event => voiceGainParams.has(event.param) && event.value > 0.001)?.value ?? null,
        };
      } finally {
        player.stop();
        await player.context?.close().catch(() => {});
        GainNode.prototype.connect = nativeConnect;
        AudioContext.prototype.createGain = nativeCreateGain;
        AudioContext.prototype.createStereoPanner = nativeCreateStereoPanner;
        AudioParam.prototype.exponentialRampToValueAtTime = nativeRamp;
      }
    }, { volume, pan });
    const normalChannelMix = await scheduleChannelMix(1, 0);
    const quietChannelMix = await scheduleChannelMix(0.25, 0);
    const hardLeftChannelMix = await scheduleChannelMix(1, -1);
    const hardRightChannelMix = await scheduleChannelMix(1, 1);
    expect(normalChannelMix.voicePeakGain).toBeGreaterThan(0);
    expect(quietChannelMix.voicePeakGain / normalChannelMix.voicePeakGain).toBeCloseTo(0.25, 6);
    expect(normalChannelMix.panValues).toContain(0);
    expect(hardLeftChannelMix.panValues).toContain(-1);
    expect(hardRightChannelMix.panValues).toContain(1);
  } finally {
    await electronApp?.close();
  }
});

test('previews an imported module internally and supports Maxmod ROM preview', async () => {
  test.setTimeout(75_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-quick-preview-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const syncMarker = createModSyncMarker(fs.readFileSync(path.join(projectDirectory, 'assets', 'musics', 'cyberrid.mod')));
  fs.writeFileSync(path.join(projectDirectory, 'assets', 'musics', 'cyberrid-sync.mod'), syncMarker.bytes);
  let electronApp;
  let engine;
  let maxmodEmulator;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    engine = await openMusicLibrary(electronApp);
    await engine.getByRole('listitem').getByText('cyberrid.mod', { exact: true }).click();
    await engine.evaluate(installBrowserPreviewAudioTap);
    const cyberridMod = fs.readFileSync(path.join(projectDirectory, 'assets', 'musics', 'cyberrid.mod')).toString('base64');
    await engine.evaluate(async encoded => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { trackerPeriodToPitch } = await import('/src/utils/trackerPianoRollModel.ts');
      const { parseModModule } = await import('/src/utils/modPlayer.ts');
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const module = parseModModule(bytes.buffer);
      if (!module) throw new Error('cyberrid.mod could not be parsed.');
      const samples = new Map(module.samples.map((sample, index) => {
        const pcm = new Float32Array(sample.length);
        for (let frame = 0; frame < sample.length && sample.dataOffset + frame < module.bytes.length; frame += 1) {
          pcm[frame] = ((module.bytes[sample.dataOffset + frame] << 24) >> 24) / 128;
        }
        return [index + 1, { samples: pcm, sampleRate: 8363, loopStart: sample.loopStart, loopEnd: sample.loopLength > 2 ? sample.loopStart + sample.loopLength : sample.loopStart, rootNote: 49, fineTune: sample.finetune, volume: sample.volume, loopType: sample.loopLength > 2 ? 1 : 0 }];
      }));
      const rows = module.patternTable.slice(0, module.orders).flatMap(patternIndex => (module.patterns[patternIndex] ?? []).map(row => row.map(event => ({
        note: event.period ? trackerPeriodToPitch(event.period) : 0,
        period: event.period,
        instrument: event.sample,
        volume: 0,
        effect: event.effect,
        parameter: event.parameter,
      }))));
      const player = new TrackerPreviewPlayer();
      window.__cyberridModPlayer = player;
      await player.play(rows, module.channels, 6, 125, [], samples, 'MOD', [], [-0.5, 0.5, 0.5, -0.5]);
    }, cyberridMod);
    await engine.waitForTimeout(2_000);
    const cyberridBrowserAudio = await engine.evaluate(finishAudioCapture);
    const cyberridLimiterPeak = await engine.evaluate(() => window.__cyberridModPlayer?.getLimiterPeak() ?? null);
    const cyberridLimiterKind = await engine.evaluate(() => window.__cyberridModPlayer?.getLimiterKind() ?? null);
    await engine.evaluate(() => { window.__cyberridModPlayer?.stop(); window.__cyberridModPlayer = undefined; });
    console.log(`cyberrid.mod structural player PCM: ${JSON.stringify({ duration: cyberridBrowserAudio.duration, rms: cyberridBrowserAudio.rms, estimatedPitch: cyberridBrowserAudio.estimatedPitch, limiterKind: cyberridLimiterKind, limiterPeak: cyberridLimiterPeak })}.`);
    expect(cyberridBrowserAudio.rms).toBeGreaterThan(0.0001);
    expect(cyberridLimiterKind).toBe('AudioWorklet');
    expect(cyberridLimiterPeak).toBeGreaterThan(0);
    expect(cyberridLimiterPeak).toBeLessThan(1);
    const comparisonMod = syncMarker.bytes.toString('base64');
    await engine.getByRole('listitem').getByText('cyberrid-sync.mod', { exact: true }).click();
    await expect(engine.getByTestId('right-panel-scroll').getByText('MOD', { exact: true })).toBeVisible();
    const maxmodButton = engine.getByRole('button', { name: /Play ROM/ });
    await expect(maxmodButton).toBeEnabled();
    await maxmodButton.click();
    await waitForMaxmodPreviewStatus(engine.getByLabel('Music beat editor'), 15_000);
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    maxmodEmulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!maxmodEmulator) throw new Error('The Maxmod preview emulator window was not opened.');
    await expect.poll(() => maxmodEmulator.evaluate(() => Boolean(window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx)), { timeout: 30_000 }).toBe(true);
    const audioTap = await maxmodEmulator.evaluate(installEmulatorOpenALTap);
    expect(audioTap).toBeTruthy();
    await maxmodEmulator.waitForTimeout(2_000);
    const idleMaxmodAudio = await maxmodEmulator.evaluate(finishAudioCapture);
    console.log(`Imported MOD Maxmod ROM idle capture: ${JSON.stringify({ duration: idleMaxmodAudio.duration, rms: idleMaxmodAudio.rms })}.`);
    await maxmodEmulator.evaluate(() => {
      const capture = window.__musicOpenALCapture;
      for (const processor of capture?.processors ?? []) processor.disconnect();
      for (const gain of capture?.silentGains ?? []) gain.disconnect();
      delete window.__musicOpenALCapture;
    });
    const alignedRomTap = await maxmodEmulator.evaluate(installEmulatorOpenALTap);
    await maxmodEmulator.evaluate(frequency => {
      window.__musicOpenALCapture.syncMarkerFrequency = frequency;
      if (window.__musicOpenALCapture) window.__musicOpenALCapture.trimStartTime = window.__musicOpenALCapture.context.currentTime;
      window.EJS_emulator?.gameManager?.restart();
    }, syncMarker.frequency);
    const alignedDirectStarted = await engine.evaluate(async encoded => {
        const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
        const { trackerPeriodToPitch } = await import('/src/utils/trackerPianoRollModel.ts');
        const { createModPlaybackSequence } = await import('/src/utils/trackerModPlaybackFlow.ts');
        const { parseModModule } = await import('/src/utils/modPlayer.ts');
        const { markerFrequency, markerSample, moduleBytes } = encoded;
        window.__musicSyncMarkerFrequency = markerFrequency;
        window.__musicSyncMarkerPulsePattern = { sourceSampleRate: 8_363, framesPerPulse: 128, activeFrames: 64, pulseCount: encoded.markerFrequencySequence?.length ?? 5, frequencySequence: encoded.markerFrequencySequence };
        const bytes = Uint8Array.from(atob(moduleBytes), character => character.charCodeAt(0));
        const module = parseModModule(bytes.buffer);
        if (!module) throw new Error('cyberrid.mod could not be parsed for aligned playback.');
        const samples = new Map(module.samples.map((sample, index) => {
          const pcm = new Float32Array(sample.length);
          for (let frame = 0; frame < sample.length && sample.dataOffset + frame < module.bytes.length; frame += 1) {
            pcm[frame] = ((module.bytes[sample.dataOffset + frame] << 24) >> 24) / 128;
          }
          return [index + 1, { samples: pcm, sampleRate: 8363, loopStart: sample.loopStart, loopEnd: sample.loopLength > 2 ? sample.loopStart + sample.loopLength : sample.loopStart, rootNote: 49, fineTune: sample.finetune, volume: sample.volume, loopType: sample.loopLength > 2 ? 1 : 0 }];
        }));
        const rows = module.patternTable.slice(0, module.orders).flatMap(patternIndex => (module.patterns[patternIndex] ?? []).map(row => row.map(event => ({
          note: event.period ? trackerPeriodToPitch(event.period) : 0,
          period: event.period,
          instrument: event.sample,
          volume: 0,
          effect: event.effect,
          parameter: event.parameter,
        }))));
        const playbackRows = createModPlaybackSequence(rows).slice(0, 16).map(row => rows[row]);
        const player = new TrackerPreviewPlayer();
        window.__alignedModPreviewPlayer = player;
        const playbackDurationMs = await player.play(playbackRows, module.channels, 6, 125, [], samples, 'MOD', [], [-0.5, 0.5, 0.5, -0.5]);
        return {
          rows: playbackRows.length,
          playbackDurationMs,
          syncMarkerRows: playbackRows.flatMap((row, index) => row.some(event => event?.instrument === markerSample && event.note > 0) ? [index] : []),
          firstEvents: playbackRows.map((row, index) => ({ row: index, events: row.map((event, channel) => event.note || event.effect || event.instrument ? { channel, note: event.note, period: event.period, instrument: event.instrument, effect: event.effect, parameter: event.parameter } : null).filter(Boolean) })).filter(row => row.events.length),
          sampleTuning: module.samples.map((sample, index) => ({ sample: index + 1, finetune: sample.finetune, volume: sample.volume, length: sample.length, loopStart: sample.loopStart, loopLength: sample.loopLength })),
        };
      }, { moduleBytes: comparisonMod, markerFrequency: syncMarker.frequency, markerSample: syncMarker.sampleNumber, markerFrequencySequence: syncMarker.frequencySequence });
    expect(alignedRomTap).toBeTruthy();
    expect(alignedDirectStarted.rows).toBeGreaterThan(0);
    await engine.waitForTimeout(1_800);
    const [alignedBrowserAudio, alignedMaxmodAudio] = await Promise.all([
      engine.evaluate(finishAudioCapture, 'sync'),
      maxmodEmulator.evaluate(finishAudioCapture, 'sync'),
    ]);
    const alignedLimiterPeaks = await engine.evaluate(() => ({ input: window.__alignedModPreviewPlayer?.getLimiterInputPeak() ?? null, output: window.__alignedModPreviewPlayer?.getLimiterPeak() ?? null }));
    const stereoRms = audio => Math.sqrt((audio.leftRms ** 2 + audio.rightRms ** 2) / 2);
    const cyberridModStereoRmsRatio = stereoRms(alignedBrowserAudio) / stereoRms(alignedMaxmodAudio);
    const browserCaptureEpochMs = alignedBrowserAudio.contextEpochMs + alignedBrowserAudio.captureStartTime * 1000;
    const maxmodCaptureEpochMs = alignedMaxmodAudio.contextEpochMs + alignedMaxmodAudio.captureStartTime * 1000;
    const captureStartSkewMs = Math.abs(browserCaptureEpochMs - maxmodCaptureEpochMs);
    expect(alignedBrowserAudio.syncMarkerOnsetTimes.length).toBeGreaterThanOrEqual(2);
    expect(alignedMaxmodAudio.syncMarkerOnsetTimes.length).toBeGreaterThanOrEqual(2);
    const browserFirstOnsetMs = alignedBrowserAudio.syncMarkerOnsetTimes[0] * 1000;
    const maxmodFirstOnsetMs = alignedMaxmodAudio.syncMarkerOnsetTimes[0] * 1000;
    const browserMarkerIntervalMs = (alignedBrowserAudio.syncMarkerOnsetTimes[1] - alignedBrowserAudio.syncMarkerOnsetTimes[0]) * 1000;
    const maxmodMarkerIntervalMs = (alignedMaxmodAudio.syncMarkerOnsetTimes[1] - alignedMaxmodAudio.syncMarkerOnsetTimes[0]) * 1000;
    const musicalOnsetSkewMs = (browserCaptureEpochMs + browserFirstOnsetMs) - (maxmodCaptureEpochMs + maxmodFirstOnsetMs);
    const envelopeWindowMs = alignedBrowserAudio.envelopeWindowSeconds * 1000;
    // Both captures started at different wall-clock times. Anchor each buffer
    // directly at its detected marker instead of shifting by the clocks' epoch.
    const browserStartIndex = Math.round(browserFirstOnsetMs / envelopeWindowMs);
    const maxmodStartIndex = Math.round(maxmodFirstOnsetMs / envelopeWindowMs);
    const captureEnvelopeCount = Math.min(alignedBrowserAudio.envelope.length - browserStartIndex, alignedMaxmodAudio.envelope.length - maxmodStartIndex);
    // Compare only the interval scheduled by the browser for these exact rows;
    // the ROM keeps playing the next rows after the short diagnostic excerpt.
    const scheduledRowWindowCount = Math.floor(Math.max(0, alignedDirectStarted.playbackDurationMs - 100) / envelopeWindowMs);
    const comparisonStartWindow = Math.ceil(100 / envelopeWindowMs);
    const comparisonEndWindow = Math.floor(Math.min(browserMarkerIntervalMs, maxmodMarkerIntervalMs) / envelopeWindowMs);
    const envelopeCount = Math.max(0, Math.min(captureEnvelopeCount, scheduledRowWindowCount, comparisonEndWindow) - comparisonStartWindow);
    const browserEnvelopeStart = browserStartIndex + comparisonStartWindow;
    const maxmodEnvelopeStart = maxmodStartIndex + comparisonStartWindow;
    const browserEnvelope = alignedBrowserAudio.envelope.slice(browserEnvelopeStart, browserEnvelopeStart + envelopeCount);
    const maxmodEnvelope = alignedMaxmodAudio.envelope.slice(maxmodEnvelopeStart, maxmodEnvelopeStart + envelopeCount);
    const browserEnvelopeMean = browserEnvelope.reduce((sum, value) => sum + value, 0) / Math.max(1, envelopeCount);
    const maxmodEnvelopeMean = maxmodEnvelope.reduce((sum, value) => sum + value, 0) / Math.max(1, envelopeCount);
    let envelopeCovariance = 0;
    let browserEnvelopeVariance = 0;
    let maxmodEnvelopeVariance = 0;
    for (let index = 0; index < envelopeCount; index += 1) {
      const browserDelta = browserEnvelope[index] - browserEnvelopeMean;
      const maxmodDelta = maxmodEnvelope[index] - maxmodEnvelopeMean;
      envelopeCovariance += browserDelta * maxmodDelta;
      browserEnvelopeVariance += browserDelta * browserDelta;
      maxmodEnvelopeVariance += maxmodDelta * maxmodDelta;
    }
    const envelopeCorrelation = envelopeCovariance / Math.sqrt(Math.max(1e-20, browserEnvelopeVariance * maxmodEnvelopeVariance));
    const correlationAtLag = lag => {
      const browserOffset = Math.max(0, -lag);
      const maxmodOffset = Math.max(0, lag);
      const count = Math.min(browserEnvelope.length - browserOffset, maxmodEnvelope.length - maxmodOffset);
      if (count < 40) return -1;
      let browserMean = 0;
      let maxmodMean = 0;
      for (let index = 0; index < count; index += 1) {
        browserMean += browserEnvelope[browserOffset + index];
        maxmodMean += maxmodEnvelope[maxmodOffset + index];
      }
      browserMean /= count;
      maxmodMean /= count;
      let covariance = 0;
      let browserVariance = 0;
      let maxmodVariance = 0;
      for (let index = 0; index < count; index += 1) {
        const browserDelta = browserEnvelope[browserOffset + index] - browserMean;
        const maxmodDelta = maxmodEnvelope[maxmodOffset + index] - maxmodMean;
        covariance += browserDelta * maxmodDelta;
        browserVariance += browserDelta * browserDelta;
        maxmodVariance += maxmodDelta * maxmodDelta;
      }
      return covariance / Math.sqrt(Math.max(1e-20, browserVariance * maxmodVariance));
    };
    let bestEnvelopeCorrelation = envelopeCorrelation;
    let bestEnvelopeLagWindows = 0;
    for (let lag = -50; lag <= 50; lag += 1) {
      const correlation = correlationAtLag(lag);
      if (correlation > bestEnvelopeCorrelation) {
        bestEnvelopeCorrelation = correlation;
        bestEnvelopeLagWindows = lag;
      }
    }
    const channelBestCorrelation = (browserValues, maxmodValues) => {
      let best = { correlation: -1, lag: 0 };
      for (let lag = -50; lag <= 50; lag += 1) {
        const browserOffset = Math.max(0, -lag);
        const maxmodOffset = Math.max(0, lag);
        const count = Math.min(browserValues.length - browserOffset, maxmodValues.length - maxmodOffset);
        if (count < 40) continue;
        let browserMean = 0;
        let maxmodMean = 0;
        for (let index = 0; index < count; index += 1) {
          browserMean += browserValues[browserOffset + index];
          maxmodMean += maxmodValues[maxmodOffset + index];
        }
        browserMean /= count;
        maxmodMean /= count;
        let covariance = 0;
        let browserVariance = 0;
        let maxmodVariance = 0;
        for (let index = 0; index < count; index += 1) {
          const browserDelta = browserValues[browserOffset + index] - browserMean;
          const maxmodDelta = maxmodValues[maxmodOffset + index] - maxmodMean;
          covariance += browserDelta * maxmodDelta;
          browserVariance += browserDelta * browserDelta;
          maxmodVariance += maxmodDelta * maxmodDelta;
        }
        const correlation = covariance / Math.sqrt(Math.max(1e-20, browserVariance * maxmodVariance));
        if (correlation > best.correlation) best = { correlation, lag };
      }
      return best;
    };
    const leftCorrelation = channelBestCorrelation(alignedBrowserAudio.leftEnvelope.slice(browserEnvelopeStart, browserEnvelopeStart + envelopeCount), alignedMaxmodAudio.leftEnvelope.slice(maxmodEnvelopeStart, maxmodEnvelopeStart + envelopeCount));
    const rightCorrelation = channelBestCorrelation(alignedBrowserAudio.rightEnvelope.slice(browserEnvelopeStart, browserEnvelopeStart + envelopeCount), alignedMaxmodAudio.rightEnvelope.slice(maxmodEnvelopeStart, maxmodEnvelopeStart + envelopeCount));
    console.log(`Restart-synchronized cyberrid.mod PCM: ${JSON.stringify({ rows: alignedDirectStarted.rows, scheduledPlaybackMs: alignedDirectStarted.playbackDurationMs, syncMarkerRows: alignedDirectStarted.syncMarkerRows, firstEvents: alignedDirectStarted.firstEvents, syncMarker: { sample: syncMarker.sampleNumber, frequency: syncMarker.frequency }, browser: { duration: alignedBrowserAudio.duration, rms: alignedBrowserAudio.rms, leftRms: alignedBrowserAudio.leftRms, rightRms: alignedBrowserAudio.rightRms, peak: alignedBrowserAudio.peak, syncMarkerOnsetsMs: alignedBrowserAudio.syncMarkerOnsetTimes.map(time => time * 1000), markerIntervalMs: browserMarkerIntervalMs, estimatedPitch: alignedBrowserAudio.estimatedPitch, limiterInputPeak: alignedLimiterPeaks.input, limiterOutputPeak: alignedLimiterPeaks.output }, maxmod: { duration: alignedMaxmodAudio.duration, rms: alignedMaxmodAudio.rms, leftRms: alignedMaxmodAudio.leftRms, rightRms: alignedMaxmodAudio.rightRms, peak: alignedMaxmodAudio.peak, syncMarkerOnsetsMs: alignedMaxmodAudio.syncMarkerOnsetTimes.map(time => time * 1000), markerIntervalMs: maxmodMarkerIntervalMs, estimatedPitch: alignedMaxmodAudio.estimatedPitch }, stereoRmsRatio: cyberridModStereoRmsRatio, markerIntervalDeltaMs: browserMarkerIntervalMs - maxmodMarkerIntervalMs, captureStartSkewMs, musicalOnsetSkewMs, envelopeCorrelation, bestEnvelopeCorrelation, bestEnvelopeLagMs: bestEnvelopeLagWindows * alignedBrowserAudio.envelopeWindowSeconds * 1000, leftCorrelation, rightCorrelation, envelopeComparedWindows: envelopeCount, unmatchedRomTailWindows: captureEnvelopeCount - envelopeCount })}.`);
    expect(captureStartSkewMs).toBeLessThan(500);
    expect(alignedBrowserAudio.duration).toBeGreaterThan(1.5);
    expect(alignedMaxmodAudio.duration).toBeGreaterThan(1.5);
    expect(alignedBrowserAudio.peak).toBeLessThan(1);
    if (requireParity) expect(Math.abs(browserMarkerIntervalMs - maxmodMarkerIntervalMs)).toBeLessThan(50);
    expect(envelopeCorrelation).toBeGreaterThan(0.75);
    expect(cyberridModStereoRmsRatio).toBeGreaterThan(0.75);
    expect(cyberridModStereoRmsRatio).toBeLessThan(1.25);
    await engine.evaluate(() => { window.__alignedModPreviewPlayer?.stop(); window.__alignedModPreviewPlayer = undefined; });
    await maxmodEmulator.screenshot({ path: path.join(screenshotDirectory, 'music-maxmod-mod-runtime.png') });
    const inputAudioTap = await maxmodEmulator.evaluate(installEmulatorOpenALTap);
    expect(inputAudioTap).toBeTruthy();
    await maxmodEmulator.evaluate(async () => {
      const gameManager = window.EJS_emulator?.gameManager;
      if (!gameManager) throw new Error('EmulatorJS game manager is unavailable.');
      gameManager.simulateInput(0, 8, 1);
      await new Promise(resolve => window.setTimeout(resolve, 150));
      gameManager.simulateInput(0, 8, 0);
    });
    await maxmodEmulator.waitForTimeout(2_000);
    const maxmodRuntime = await maxmodEmulator.evaluate(() => ({
      emulatorStarted: window.EJS_emulator?.started ?? null,
      emulatorRunning: window.EJS_emulator?.isRunning ?? null,
      core: window.EJS_core,
      moduleCalledRun: window.EJS_emulator?.Module?.calledRun ?? null,
      gameManagerKeys: Object.keys(window.EJS_emulator?.gameManager ?? {}).slice(0, 30),
      audioContext: {
        state: window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx?.state ?? null,
        sourceCount: Object.keys(window.EJS_emulator?.Module?.AL?.currentCtx?.sources ?? {}).length,
        sourceGain: Object.values(window.EJS_emulator?.Module?.AL?.currentCtx?.sources ?? {}).map(source => source?.gain?.gain?.value),
      },
    }));
    console.log(`Maxmod ROM runtime state: ${JSON.stringify(maxmodRuntime)}.`);
    const maxmodAudio = await maxmodEmulator.evaluate(finishAudioCapture);
    console.log(`Imported MOD Maxmod ROM output after A input: ${JSON.stringify(maxmodAudio)}.`);
    await maxmodEmulator.close();
  } finally {
    try {
      if (maxmodEmulator && !maxmodEmulator.isClosed()) await maxmodEmulator.close().catch(() => {});
    } finally {
      try {
        await electronApp?.close();
      } finally {
        fs.rmSync(projectDirectory, { recursive: true, force: true });
      }
    }
  }
});

const compareIsolatedCyberridChannel = async (selectedChannel, sourceModuleName = 'cyberrid.mod', requireParity = true, sourceModuleBytes = undefined, rowLimit = 16, measureAfterMarkerPair = false, syncMarkerRows = [0, 8], syncMarkerChannel = undefined, capturePreEmulationStartBlock = undefined, postMarkerSkipMs = 100, anchorToDetectedMarkerPair = false, markerFrequencySequence = undefined, markerDetectorOptions = {}, capturePreEmulationMarkerIndex = 1, capturePlayOnce = false) => {
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-mod-isolated-channel-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  const sourceBytes = sourceModuleBytes ? Buffer.from(sourceModuleBytes) : fs.readFileSync(path.join(repositoryRoot, 'templateEngineGame', 'shooter_game', 'assets', 'musics', sourceModuleName));
  const isolatedMusicBytes = createModChannelIsolation(sourceBytes, selectedChannel);
  const codedMarkerFrequencies = markerFrequencySequence ?? [6, 8, 10, 12, 14].map(cycles => cycles * 8_363 / 64);
  const isolatedMarker = createModSyncMarker(isolatedMusicBytes, syncMarkerChannel, sourceBytes, syncMarkerRows, [], codedMarkerFrequencies);
  if (sourceModuleName === 'stardstm-tail-window.mod') {
    console.log(`Stardstm stem sync lane: ${JSON.stringify({ sourceChannel: Array.isArray(selectedChannel) ? selectedChannel.map(channel => channel + 1) : selectedChannel + 1, markerChannel: isolatedMarker.markerChannel + 1, markerSample: isolatedMarker.sampleNumber, rows: isolatedMarker.markerRows })}.`);
  }
  const isolatedBytes = isolatedMarker.bytes;
  const channelLabel = (Array.isArray(selectedChannel) ? selectedChannel : [selectedChannel]).map(channel => channel + 1).join('-');
  const sourceModuleBase = path.basename(sourceModuleName, path.extname(sourceModuleName));
  const isolatedFilename = `${sourceModuleBase}-channel-${channelLabel}.mod`;
  const isolatedPath = path.join(musicDirectory, isolatedFilename);
  fs.writeFileSync(isolatedPath, isolatedBytes);
  let electronApp;
  let emulator;
  let preEmulationRawPcm;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('gba-studio-tracker-mixer:')) localStorage.removeItem(key);
      }
    });
    await engine.getByRole('listitem').getByText(isolatedFilename, { exact: true }).click();
    await importSelectedOriginalForEditing(engine);
    await expect.poll(() => engine.evaluate(() => Object.keys(localStorage)
      .filter(key => key.startsWith('gba-studio-tracker-mixer:'))
      .map(key => JSON.parse(localStorage.getItem(key) || '{}').pans)
      .find(Array.isArray)?.slice(0, 4) ?? null)).toEqual([-0.5, 0.5, 0.5, -0.5]);
    const editor = engine.getByLabel('Music beat editor');
    const markerCaptureInstrumentation = {
      detectorSource: detectPulsedToneMarkers.toString(),
      templateMatcherSource: findModSampleTemplateMatches.toString(),
      markerSampleBase64: isolatedMarker.markerSampleBytes.toString('base64'),
    };
    await engine.evaluate(installBrowserPreviewAudioTap, markerCaptureInstrumentation);
    let preEmulationCaptureMemory;
    if (Number.isInteger(capturePreEmulationStartBlock)) {
      const captureResult = await engine.evaluate(async ({ moduleBytes, captureStartBlock, capturePlayOnce }) => window.electronAPI.playTrackerModulePreview(
        moduleBytes,
        { demoAudioVolume: 1, demoAudioMuted: false },
        true,
        true,
        true,
        captureStartBlock,
        false,
        false,
        false,
        0,
        30,
        capturePlayOnce,
      ), { moduleBytes: isolatedBytes.toString('base64'), captureStartBlock: capturePreEmulationStartBlock, capturePlayOnce });
      expect(captureResult, JSON.stringify(captureResult)).toMatchObject({ status: 'success' });
      preEmulationCaptureMemory = captureResult.preEmulationMemory;
      expect(preEmulationCaptureMemory.captureStartBlock).toBe(capturePreEmulationStartBlock);
      expect(preEmulationCaptureMemory.captureBytes).toBe(16_380);
      expect(preEmulationCaptureMemory.ewramStaticTail).toBeGreaterThan(32 * 1_024);
    } else {
      await expect(editor.getByRole('button', { name: /Play ROM/ })).toBeEnabled();
      await editor.getByRole('button', { name: /Play ROM/ }).click();
      await waitForMaxmodPreviewStatus(editor, 45_000);
    }
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!emulator) throw new Error(`The isolated channel set ${channelLabel} Maxmod emulator did not open.`);
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx)), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.gameManager)), { timeout: 30_000 }).toBe(true);
    await emulator.evaluate(({ markerFrequency, frequencySequence, detectorOptions }) => {
      window.__musicSyncMarkerFrequency = markerFrequency;
      window.__musicSyncMarkerPulsePattern = { sourceSampleRate: 8_363, framesPerPulse: 128, activeFrames: 64, pulseCount: frequencySequence?.length ?? 5, frequencySequence, ...detectorOptions };
    }, { markerFrequency: isolatedMarker.frequency, frequencySequence: isolatedMarker.frequencySequence, detectorOptions: markerDetectorOptions });
    const romTap = await emulator.evaluate(installEmulatorOpenALTap, markerCaptureInstrumentation);
    await emulator.waitForTimeout(1_500);
    await emulator.evaluate(() => {
      if (window.__musicOpenALCapture) window.__musicOpenALCapture.trimStartTime = window.__musicOpenALCapture.context.currentTime;
      window.EJS_emulator?.gameManager?.restart();
    });
    let preEmulationWindow;
    if (Number.isInteger(capturePreEmulationStartBlock)) {
      await emulator.evaluate(async () => {
        const instance = window.EJS_emulator;
        const source = 'gba-studio-pre-emulation-capture';
        instance?.updateMappedInput(0, 8, source, 1);
        await new Promise(resolve => window.setTimeout(resolve, 150));
        instance?.updateMappedInput(0, 8, source, 0);
      });
      const captureDurationMs = (capturePreEmulationStartBlock + 30) * 264 / 15_768 * 1_000;
      await emulator.waitForTimeout(captureDurationMs + 250);
      const screenshot = await emulator.screenshot();
      const imageBytes = unpackMaxmodCapturePixels(decodeMaxmodCapturePng(screenshot), 16 + preEmulationCaptureMemory.captureBytes);
      expect(imageBytes.subarray(0, 4).toString('ascii')).toBe('MXPC');
      const sampleRate = imageBytes.readUInt32LE(4);
      const frames = imageBytes.readUInt32LE(8);
      const channels = imageBytes[12];
      const rawPcm = imageBytes.subarray(16);
      const pcmByteLength = frames * channels;
      expect(sampleRate).toBe(15_768);
      expect(frames).toBe(7_920);
      expect(channels).toBe(2);
      expect(rawPcm).toHaveLength(pcmByteLength + 30 * 18);
      let power = 0;
      let peak = 0;
      for (const byte of rawPcm) {
        const value = (byte < 128 ? byte : byte - 256) / 128;
        power += value * value;
        peak = Math.max(peak, Math.abs(value));
      }
      preEmulationRawPcm = Buffer.from(rawPcm.subarray(0, pcmByteLength));
      const blockFrames = 264;
      const blockRms = Array.from({ length: Math.floor(frames / blockFrames) }, (_, blockIndex) => {
        let blockPower = 0;
        for (let frame = blockIndex * blockFrames; frame < (blockIndex + 1) * blockFrames; frame += 1) {
          for (let channel = 0; channel < channels; channel += 1) {
            const byte = rawPcm[frame * channels + channel];
            const value = (byte < 128 ? byte : byte - 256) / 128;
            blockPower += value * value;
          }
        }
        return Math.sqrt(blockPower / (blockFrames * channels));
      });
      const mixerTrace = Array.from({ length: 30 }, (_, block) => {
        const offset = pcmByteLength + block * 18;
        return {
          block,
          source: imageBytes.readUInt32LE(16 + offset),
          readQ12: imageBytes.readUInt32LE(16 + offset + 4),
          frequency: imageBytes.readUInt32LE(16 + offset + 8),
          rateScale: imageBytes.readUInt32LE(16 + offset + 12),
          volume: imageBytes[16 + offset + 16],
          pan: imageBytes[16 + offset + 17],
        };
      }).filter(trace => trace.source !== 0);
      preEmulationWindow = {
        sampleRate,
        frames,
        channels,
        rms: Math.sqrt(power / rawPcm.length),
        peak,
        captureStartBlock: capturePreEmulationStartBlock,
        blockDurationMs: blockFrames / sampleRate * 1_000,
        blockRms,
        mixerTrace,
        memory: preEmulationCaptureMemory,
      };
      if (channels === 2) {
        const markerChannels = [new Float32Array(frames), new Float32Array(frames)];
        for (let frame = 0; frame < frames; frame += 1) {
          for (let channel = 0; channel < 2; channel += 1) {
            const byte = rawPcm[frame * 2 + channel];
            markerChannels[channel][frame] = (byte < 128 ? byte : byte - 256) / 128;
          }
        }
        const markerOptions = {
          sourceSampleRate: 8_363,
          framesPerPulse: 128,
          activeFrames: 64,
          pulseCount: isolatedMarker.pulseCount,
          frequencySequence: isolatedMarker.frequencySequence,
          threshold: 0.6,
          minimumPowerRatio: 0.001,
        };
        preEmulationWindow.markerCandidates = markerChannels.map(channel => detectPulsedToneMarkers(
          channel,
          sampleRate,
          isolatedMarker.frequency,
          markerOptions,
        ));
        if (Number.isInteger(capturePreEmulationStartBlock)) {
          preEmulationWindow.markerTemplateMatches = findModSampleTemplateMatches(
            markerChannels,
            isolatedMarker.markerSampleBytes,
            sampleRate,
          );
        }
      }
      expect(preEmulationWindow.rms).toBeGreaterThan(0.0001);
    }
    const directPlayback = await engine.evaluate(async encoded => {
        const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
        const { trackerPeriodToPitch } = await import('/src/utils/trackerPianoRollModel.ts');
        const { createModPlaybackSequence } = await import('/src/utils/trackerModPlaybackFlow.ts');
        const { parseModModule } = await import('/src/utils/modPlayer.ts');
        const { maxmodGbaTickDurationSeconds } = await import('/src/utils/trackerMaxmodTiming.ts');
        window.__musicSyncMarkerFrequency = encoded.markerFrequency;
        window.__musicSyncMarkerPulsePattern = { sourceSampleRate: 8_363, framesPerPulse: 128, activeFrames: 64, pulseCount: encoded.markerFrequencySequence?.length ?? 5, frequencySequence: encoded.markerFrequencySequence, ...encoded.markerDetectorOptions };
        if (window.__musicPreviewCapture) {
          window.__musicPreviewCapture.syncMarkerFrequency = encoded.markerFrequency;
          window.__musicPreviewCapture.syncMarkerPulsePattern = window.__musicSyncMarkerPulsePattern;
        }
        const bytes = Uint8Array.from(atob(encoded.moduleBytes), character => character.charCodeAt(0));
        const module = parseModModule(bytes.buffer);
        if (!module) throw new Error(`The isolated ${encoded.sourceModuleName} could not be parsed.`);
        const samples = new Map(module.samples.map((sample, index) => {
          const pcm = new Float32Array(sample.length);
          for (let frame = 0; frame < sample.length && sample.dataOffset + frame < module.bytes.length; frame += 1) pcm[frame] = ((module.bytes[sample.dataOffset + frame] << 24) >> 24) / 128;
          return [index + 1, { samples: pcm, sampleRate: 8363, loopStart: sample.loopStart, loopEnd: sample.loopLength > 2 ? sample.loopStart + sample.loopLength : sample.loopStart, rootNote: 49, fineTune: sample.finetune, volume: sample.volume, loopType: sample.loopLength > 2 ? 1 : 0 }];
        }));
        const rows = module.patternTable.slice(0, module.orders).flatMap(pattern => (module.patterns[pattern] ?? []).map(row => row.map(event => ({ note: event.period ? trackerPeriodToPitch(event.period) : 0, period: event.period, instrument: event.sample, volume: 0, effect: event.effect, parameter: event.parameter }))));
        const playbackRows = createModPlaybackSequence(rows).slice(0, encoded.rowLimit).map(index => rows[index]);
        const player = new TrackerPreviewPlayer();
        window.__isolatedCyberridPlayer = player;
        const durationMs = await player.play(playbackRows, module.channels, 6, 125, [], samples, 'MOD', [], [-0.5, 0.5, 0.5, -0.5]);
        let speed = 6;
        let tempo = 125;
        let elapsed = 0;
        const rowTimes = playbackRows.map(row => {
          row.forEach(event => {
            if (event?.effect !== 0x0f || !event.parameter) return;
            if (event.parameter < 0x20) speed = event.parameter;
            else tempo = Math.max(32, event.parameter);
          });
          const rowTime = elapsed;
          elapsed += speed * maxmodGbaTickDurationSeconds(tempo);
          return rowTime;
        });
        const markerRows = playbackRows.flatMap((row, index) => row.some(event => event?.instrument === encoded.markerSample && event.note > 0) ? [index] : []);
        return {
          rows: playbackRows.length,
          durationMs,
          markerRows,
          expectedMarkerStartMs: markerRows.length ? rowTimes[markerRows[0]] * 1000 : null,
          expectedMarkerIntervalMs: markerRows.length >= 2 ? (rowTimes[markerRows[1]] - rowTimes[markerRows[0]]) * 1000 : null,
        };
      }, { moduleBytes: isolatedBytes.toString('base64'), markerFrequency: isolatedMarker.frequency, markerFrequencySequence: isolatedMarker.frequencySequence, markerDetectorOptions, markerSample: isolatedMarker.sampleNumber, sourceModuleName, rowLimit });
    if (preEmulationWindow && preEmulationRawPcm) {
      const markerBlock = Math.round((directPlayback.expectedMarkerIntervalMs / 1_000) * preEmulationWindow.sampleRate / 264);
      const scheduledOffsetMs = Math.max(0, (markerBlock - capturePreEmulationStartBlock) * 264 / preEmulationWindow.sampleRate * 1_000);
      preEmulationWindow.captureOffsetAfterMarkerMs = scheduledOffsetMs;
      const matchedMarker = preEmulationWindow.markerTemplateMatches
        ?.filter(match => match.correlation >= 0.1)
        .sort((left, right) => Math.abs(left.timeMs - scheduledOffsetMs) - Math.abs(right.timeMs - scheduledOffsetMs))[0];
      if (matchedMarker && Number.isFinite(matchedMarker.timeMs)) {
        preEmulationWindow.captureOffsetAfterMarkerMs = matchedMarker.timeMs;
        preEmulationWindow.markerAlignmentSource = 'Maxmod sample-template match';
      } else {
        preEmulationWindow.markerAlignmentSource = 'scheduled Maxmod block estimate';
      }
      const analysisEndFrame = Math.min(preEmulationWindow.frames, Math.floor(preEmulationWindow.sampleRate * 0.4));
      let alignedPower = 0;
      for (let frame = 0; frame < analysisEndFrame; frame += 1) {
        for (let channel = 0; channel < preEmulationWindow.channels; channel += 1) {
          const byte = preEmulationRawPcm[frame * preEmulationWindow.channels + channel];
          const value = (byte < 128 ? byte : byte - 256) / 128;
          alignedPower += value * value;
        }
      }
      preEmulationWindow.markerAlignedRms = Math.sqrt(alignedPower / Math.max(1, analysisEndFrame * preEmulationWindow.channels));
    }
    expect(romTap).toBeTruthy();
    const markerSearchWindowsMs = [
      [0, directPlayback.expectedMarkerIntervalMs / 2],
      [directPlayback.expectedMarkerIntervalMs, directPlayback.expectedMarkerIntervalMs * 1.5],
    ];
    const markerCaptureSearch = { windows: markerSearchWindowsMs, intervalMs: directPlayback.expectedMarkerIntervalMs };
    await engine.evaluate(({ windows, intervalMs }) => {
      if (window.__musicPreviewCapture) {
        window.__musicPreviewCapture.syncMarkerSampleSearchWindowsMs = windows;
        window.__musicPreviewCapture.syncMarkerExpectedIntervalMs = intervalMs;
      }
    }, markerCaptureSearch);
    await emulator.evaluate(({ windows, intervalMs }) => {
      if (window.__musicOpenALCapture) {
        window.__musicOpenALCapture.syncMarkerSampleSearchWindowsMs = windows;
        window.__musicOpenALCapture.syncMarkerExpectedIntervalMs = intervalMs;
      }
    }, markerCaptureSearch);
    // Keep the capture alive through the row-zero marker's expected partner at
    // row eight. The ROM can start its song noticeably later than the direct
    // Preview, so a 1.8 s capture ended before that second marker and let a
    // musical transient masquerade as the pair.
    await engine.waitForTimeout(rowLimit > 16 ? directPlayback.durationMs + 200 : Math.max(2_800, directPlayback.expectedMarkerIntervalMs + 1_800));
    const captureMode = sourceModuleName.includes('different-tone') ? 'pitch' : 'sync';
    const [browser, maxmod] = await Promise.all([
      engine.evaluate(finishAudioCapture, captureMode),
      emulator.evaluate(finishAudioCapture, captureMode),
    ]);
    const romPlaybackState = await emulator.evaluate(() => ({
      core: window.EJS_core,
      emulatorJsVersion: window.EJS_emulator?.ejs_version ?? null,
      coreName: window.EJS_emulator?.coreName ?? null,
      coreRepository: window.EJS_emulator?.repository ?? null,
      started: window.EJS_emulator?.started ?? null,
      running: window.EJS_emulator?.isRunning ?? null,
      audioContextState: window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx?.state ?? null,
      audioSources: Object.entries(window.EJS_emulator?.Module?.AL?.currentCtx?.sources ?? {}).map(([key, source]) => ({ key, gain: source?.gain?.gain?.value, state: source?.gain?.context?.state })),
    }));
    expect(romPlaybackState.coreName, 'The Maxmod reference must run on the bundled mGBA core.').toBe('mgba');
    expect(romPlaybackState.emulatorJsVersion, 'Audio comparisons are tied to the runtime EmulatorJS version.').toBe('4.3.0-pre');
    const browserEpoch = browser.contextEpochMs + browser.captureStartTime * 1000;
    const maxmodEpoch = maxmod.contextEpochMs + maxmod.captureStartTime * 1000;
    const captureSkewMs = Math.abs(browserEpoch - maxmodEpoch);
    console.log(`Isolated ${sourceModuleName} MOD channel set ${channelLabel} raw sync capture: ${JSON.stringify({ romTap, romPlaybackState, browser: { duration: browser.duration, rms: browser.rms, leftRms: browser.leftRms, rightRms: browser.rightRms, markers: browser.syncMarkerOnsetTimes, markerDetector: browser.syncMarkerDetectionDiagnostics, markerTemplateMatches: browser.syncMarkerTemplateMatches, expectedSecondStartMs: browser.syncMarkerExpectedSecondStartMs, expectedSecondTemplateMatches: browser.syncMarkerExpectedSecondTemplateMatches }, maxmod: { duration: maxmod.duration, rms: maxmod.rms, leftRms: maxmod.leftRms, rightRms: maxmod.rightRms, markers: maxmod.syncMarkerOnsetTimes, markerDetector: maxmod.syncMarkerDetectionDiagnostics, markerTemplateMatches: maxmod.syncMarkerTemplateMatches, expectedSecondStartMs: maxmod.syncMarkerExpectedSecondStartMs, expectedSecondTemplateMatches: maxmod.syncMarkerExpectedSecondTemplateMatches } })}.`);
    if (browser.syncMarkerOnsetTimes.length < 2 || maxmod.syncMarkerOnsetTimes.length < 2) {
      if (requireParity) {
        expect(browser.syncMarkerOnsetTimes.length).toBeGreaterThanOrEqual(2);
        expect(maxmod.syncMarkerOnsetTimes.length).toBeGreaterThanOrEqual(2);
      }
      console.log(`Isolated ${sourceModuleName} MOD channel set ${channelLabel} timing diagnostic unavailable: both taps need two marker candidates.`);
      const browserOverallRms = Math.hypot(browser.leftRms, browser.rightRms);
      const maxmodOverallRms = Math.hypot(maxmod.leftRms, maxmod.rightRms);
      const rmsRatio = browserOverallRms / Math.max(1e-9, maxmodOverallRms);
      expect(browserOverallRms).toBeGreaterThan(0.0001);
      expect(maxmodOverallRms).toBeGreaterThan(0.0001);
      return {
        timingDiagnosticAvailable: false,
        rmsRatio,
        browserMarkerCount: browser.syncMarkerOnsetTimes.length,
        maxmodMarkerCount: maxmod.syncMarkerOnsetTimes.length,
        browserMarkerIntervalMs: NaN,
        maxmodMarkerIntervalMs: NaN,
      };
    }
    const findExpectedMarkerPair = audio => {
      const firstTemplate = audio.syncMarkerTemplateMatches
        ?.filter(match => match.timeMs < directPlayback.expectedMarkerIntervalMs / 2)
        .sort((left, right) => right.correlation - left.correlation)[0];
      const secondTemplate = audio.syncMarkerExpectedSecondTemplateMatches
        ?.filter(match => match.timeMs > (firstTemplate?.timeMs ?? 0))
        .sort((left, right) => right.correlation - left.correlation)[0];
      if (firstTemplate?.correlation >= 0.2 && secondTemplate?.correlation >= 0.1) {
        const intervalMs = secondTemplate.timeMs - firstTemplate.timeMs;
        const correlation = Math.min(firstTemplate.correlation, secondTemplate.correlation);
        return {
          first: firstTemplate.timeMs / 1_000,
          second: secondTemplate.timeMs / 1_000,
          intervalMs,
          errorMs: Math.abs(intervalMs - directPlayback.expectedMarkerIntervalMs),
          minimumPower: correlation,
          confidence: correlation,
          score: Math.abs(intervalMs - directPlayback.expectedMarkerIntervalMs) - correlation,
          channelSide: firstTemplate.channel === 1 ? 'right' : 'left',
          alignmentSource: 'sample-template',
          firstCorrelation: firstTemplate.correlation,
          secondCorrelation: secondTemplate.correlation,
        };
      }
      const leftCandidates = audio.syncMarkerOnsetCandidates?.length ? audio.syncMarkerOnsetCandidates : audio.syncMarkerOnsetTimes.map(time => ({ time, onPower: 1 }));
      const rightCandidates = audio.syncMarkerRightOnsetCandidates?.length ? audio.syncMarkerRightOnsetCandidates : [];
      const candidateSets = [{ side: 'left', candidates: leftCandidates }, { side: 'right', candidates: rightCandidates }].filter(({ candidates }) => candidates.length);
      return candidateSets
        .map(({ side, candidates }) => ({ ...selectExpectedMarkerPair(candidates, directPlayback.expectedMarkerStartMs ?? 0, directPlayback.expectedMarkerIntervalMs), channelSide: side, alignmentSource: 'coded-tone' }))
        .sort((left, right) => left.score - right.score)[0]
        ?? { ...selectExpectedMarkerPair([], directPlayback.expectedMarkerStartMs ?? 0, directPlayback.expectedMarkerIntervalMs), alignmentSource: 'coded-tone' };
    };
    const browserMarkerPair = findExpectedMarkerPair(browser);
    const maxmodMarkerPair = findExpectedMarkerPair(maxmod);
    const measureSelectedStereoSpectrum = (audio, markerPair) => {
      const window = markerPair.channelSide === 'right' ? audio.syncSpectrumRightWindow : audio.syncSpectrumWindow;
      if (!window) return null;
      const left = measureWindowedSpectralBands(Float32Array.from(window.left.slice(0, 2_048)), window.sampleRate);
      const right = measureWindowedSpectralBands(Float32Array.from(window.right.slice(0, 2_048)), window.sampleRate);
      const powers = left.bands.map((band, index) => band.rms ** 2 + right.bands[index].rms ** 2);
      const totalPower = powers.reduce((sum, value) => sum + value, 0);
      const bands = left.bands.map((band, index) => ({
        lowHz: band.lowHz,
        highHz: band.highHz,
        energyFraction: powers[index] / Math.max(1e-30, totalPower),
        leftEnergyFraction: band.energyFraction,
        rightEnergyFraction: right.bands[index].energyFraction,
      }));
      return {
        sampleRate: window.sampleRate,
        fftSize: left.fftSize,
        markerRelativeStartMs: window.markerRelativeStartMs,
        channelSide: markerPair.channelSide,
        highFrequencyEnergyShare: bands.filter(band => band.lowHz >= 8_000).reduce((sum, band) => sum + band.energyFraction, 0),
        bands,
      };
    };
    const measurePreGbaStereoSpectrum = () => {
      if (!preEmulationRawPcm || !preEmulationWindow || preEmulationWindow.channels !== 2) return null;
      const startFrame = Math.max(0, Math.round((preEmulationWindow.captureOffsetAfterMarkerMs + 100) * preEmulationWindow.sampleRate / 1_000));
      const frames = Math.min(2_048, preEmulationWindow.frames - startFrame);
      if (frames < 1_024) return null;
      const leftSamples = new Float32Array(frames);
      const rightSamples = new Float32Array(frames);
      for (let frame = 0; frame < frames; frame += 1) {
        const leftByte = preEmulationRawPcm[(startFrame + frame) * 2];
        const rightByte = preEmulationRawPcm[(startFrame + frame) * 2 + 1];
        leftSamples[frame] = (leftByte < 128 ? leftByte : leftByte - 256) / 128;
        rightSamples[frame] = (rightByte < 128 ? rightByte : rightByte - 256) / 128;
      }
      const left = measureWindowedSpectralBands(leftSamples, preEmulationWindow.sampleRate);
      const right = measureWindowedSpectralBands(rightSamples, preEmulationWindow.sampleRate);
      const powers = left.bands.map((band, index) => band.rms ** 2 + right.bands[index].rms ** 2);
      const totalPower = powers.reduce((sum, value) => sum + value, 0);
      const bands = left.bands.map((band, index) => ({
        lowHz: band.lowHz,
        highHz: band.highHz,
        energyFraction: powers[index] / Math.max(1e-30, totalPower),
        leftEnergyFraction: band.energyFraction,
        rightEnergyFraction: right.bands[index].energyFraction,
      }));
      return {
        sampleRate: preEmulationWindow.sampleRate,
        windowDurationMs: frames / preEmulationWindow.sampleRate * 1_000,
        fftSize: left.fftSize,
        markerRelativeStartMs: preEmulationWindow.captureOffsetAfterMarkerMs + 100,
        captureStartFrame: startFrame,
        alignmentSource: preEmulationWindow.markerAlignmentSource,
        channelSide: 'stereo',
        highFrequencyEnergyShare: bands.filter(band => band.lowHz >= 8_000).reduce((sum, band) => sum + band.energyFraction, 0),
        bands,
      };
    };
    const browserSpectrum = measureSelectedStereoSpectrum(browser, browserMarkerPair);
    const maxmodSpectrum = measureSelectedStereoSpectrum(maxmod, maxmodMarkerPair);
    const preGbaSpectrum = measurePreGbaStereoSpectrum();
    const spectrumDistance = (first, second) => first && second
      ? first.bands.reduce((sum, band, index) => sum + Math.abs(band.energyFraction - second.bands[index].energyFraction), 0)
      : null;
    const commonBandSpectrumDistance = (first, second, maximumHz = 8_000) => {
      if (!first || !second) return null;
      const firstBands = first.bands.filter(band => band.highHz <= maximumHz);
      const secondBands = second.bands.filter(band => band.highHz <= maximumHz);
      if (!firstBands.length || firstBands.length !== secondBands.length) return null;
      const firstTotal = firstBands.reduce((sum, band) => sum + band.energyFraction, 0);
      const secondTotal = secondBands.reduce((sum, band) => sum + band.energyFraction, 0);
      return firstBands.reduce((sum, band, index) => sum
        + Math.abs(band.energyFraction / Math.max(1e-30, firstTotal) - secondBands[index].energyFraction / Math.max(1e-30, secondTotal)), 0);
    };
    const spectralComparison = browserSpectrum && maxmodSpectrum ? {
      previewToOpenAlBandEnergyFractionL1: spectrumDistance(browserSpectrum, maxmodSpectrum),
      previewToOpenAlHighFrequencyShareDifference: browserSpectrum.highFrequencyEnergyShare - maxmodSpectrum.highFrequencyEnergyShare,
      preGbaToPreviewBandEnergyFractionL1: spectrumDistance(preGbaSpectrum, browserSpectrum),
      preGbaToOpenAlBandEnergyFractionL1: spectrumDistance(preGbaSpectrum, maxmodSpectrum),
      preGbaToPreviewCommonBandEnergyFractionL1Below8kHz: commonBandSpectrumDistance(preGbaSpectrum, browserSpectrum),
      preGbaToOpenAlCommonBandEnergyFractionL1Below8kHz: commonBandSpectrumDistance(preGbaSpectrum, maxmodSpectrum),
      browser: browserSpectrum,
      maxmod: maxmodSpectrum,
      preGba: preGbaSpectrum,
    } : null;
    if (spectralComparison) {
      const previewWindow = browserMarkerPair.channelSide === 'right' ? browser.syncSpectrumRightWindow : browser.syncSpectrumWindow;
      const onePoleLowPass = (samples, cutoffHz) => {
        const alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / previewWindow.sampleRate);
        const filtered = new Float32Array(samples.length);
        let previous = 0;
        for (let index = 0; index < samples.length; index += 1) {
          previous += alpha * (samples[index] - previous);
          filtered[index] = previous;
        }
        return filtered;
      };
      spectralComparison.onePolePreviewSweep = [4_000, 6_000, 8_000, 10_000, 12_000].map(cutoffHz => {
        const filteredLeft = onePoleLowPass(previewWindow.left, cutoffHz).subarray(0, 2_048);
        const filteredRight = onePoleLowPass(previewWindow.right, cutoffHz).subarray(0, 2_048);
        const left = measureWindowedSpectralBands(filteredLeft, previewWindow.sampleRate);
        const right = measureWindowedSpectralBands(filteredRight, previewWindow.sampleRate);
        const powers = left.bands.map((band, index) => band.rms ** 2 + right.bands[index].rms ** 2);
        const totalPower = powers.reduce((sum, value) => sum + value, 0);
        const filteredBands = powers.map(power => power / Math.max(1e-30, totalPower));
        return {
          cutoffHz,
          highFrequencyEnergyShare: left.bands.reduce((sum, band, index) => sum + (band.lowHz >= 8_000 ? filteredBands[index] : 0), 0),
          bandEnergyFractionL1ToOpenAl: filteredBands.reduce((sum, fraction, index) => sum + Math.abs(fraction - maxmodSpectrum.bands[index].energyFraction), 0),
        };
      });
      const windowedSincLowPass = (samples, cutoffHz, tapCount) => {
        const center = (tapCount - 1) / 2;
        const normalizedCutoff = cutoffHz / previewWindow.sampleRate;
        const coefficients = Array.from({ length: tapCount }, (_, index) => {
          const offset = index - center;
          const ideal = offset === 0 ? 2 * normalizedCutoff : Math.sin(2 * Math.PI * normalizedCutoff * offset) / (Math.PI * offset);
          const window = 0.54 - (0.46 * Math.cos((2 * Math.PI * index) / (tapCount - 1)));
          return ideal * window;
        });
        const coefficientSum = coefficients.reduce((sum, value) => sum + value, 0);
        for (let index = 0; index < coefficients.length; index += 1) coefficients[index] /= coefficientSum;
        const filtered = new Float32Array(samples.length);
        for (let frame = 0; frame < samples.length; frame += 1) {
          let value = 0;
          for (let tap = 0; tap < tapCount; tap += 1) {
            const sourceFrame = frame - tap;
            if (sourceFrame >= 0) value += samples[sourceFrame] * coefficients[tap];
          }
          filtered[frame] = value;
        }
        return filtered;
      };
      spectralComparison.firPreviewSweep = [7_000, 7_500, 8_000, 8_500].flatMap(cutoffHz => [31, 63].map(tapCount => {
        const filteredLeft = windowedSincLowPass(previewWindow.left, cutoffHz, tapCount).subarray(64, 2_112);
        const filteredRight = windowedSincLowPass(previewWindow.right, cutoffHz, tapCount).subarray(64, 2_112);
        const left = measureWindowedSpectralBands(filteredLeft, previewWindow.sampleRate);
        const right = measureWindowedSpectralBands(filteredRight, previewWindow.sampleRate);
        const powers = left.bands.map((band, index) => band.rms ** 2 + right.bands[index].rms ** 2);
        const totalPower = powers.reduce((sum, value) => sum + value, 0);
        const filteredBands = powers.map(power => power / Math.max(1e-30, totalPower));
        return {
          cutoffHz,
          tapCount,
          highFrequencyEnergyShare: left.bands.reduce((sum, band, index) => sum + (band.lowHz >= 8_000 ? filteredBands[index] : 0), 0),
          bandEnergyFractionL1ToOpenAl: filteredBands.reduce((sum, fraction, index) => sum + Math.abs(fraction - maxmodSpectrum.bands[index].energyFraction), 0),
        };
      }));
    }
    const markerIntervalToleranceMs = 30;
    const browserMarkerPairUsable = Number.isFinite(browserMarkerPair.errorMs) && browserMarkerPair.errorMs < markerIntervalToleranceMs;
    const maxmodMarkerPairUsable = Number.isFinite(maxmodMarkerPair.errorMs) && maxmodMarkerPair.errorMs < markerIntervalToleranceMs;
    if (!browserMarkerPairUsable || !maxmodMarkerPairUsable) {
      if (requireParity) {
        const timingDiagnostic = {
          expectedMarkerStartMs: directPlayback.expectedMarkerStartMs,
          expectedMarkerIntervalMs: directPlayback.expectedMarkerIntervalMs,
          browserMarkerPair,
          maxmodMarkerPair,
          browserCandidates: browser.syncMarkerOnsetCandidates?.map(({ time, onPower }) => ({ time, onPower })),
          browserRightCandidates: browser.syncMarkerRightOnsetCandidates?.map(({ time, onPower }) => ({ time, onPower })),
          maxmodCandidates: maxmod.syncMarkerOnsetCandidates?.map(({ time, onPower }) => ({ time, onPower })),
          maxmodRightCandidates: maxmod.syncMarkerRightOnsetCandidates?.map(({ time, onPower }) => ({ time, onPower })),
        };
        expect(browserMarkerPair.errorMs, `The Preview marker interval must be within ${markerIntervalToleranceMs} ms of schedule. ${JSON.stringify(timingDiagnostic)}`).toBeLessThan(markerIntervalToleranceMs);
        expect(maxmodMarkerPair.errorMs, `The Maxmod marker interval must be within ${markerIntervalToleranceMs} ms of schedule. ${JSON.stringify(timingDiagnostic)}`).toBeLessThan(markerIntervalToleranceMs);
      }
      const browserOverallRms = Math.hypot(browser.leftRms, browser.rightRms);
      const maxmodOverallRms = Math.hypot(maxmod.leftRms, maxmod.rightRms);
      const rmsRatio = browserOverallRms / Math.max(1e-9, maxmodOverallRms);
      if (!requireParity) {
        console.log(`Isolated ${sourceModuleName} MOD channel set ${channelLabel} timing diagnostic unavailable: ${JSON.stringify({ expectedMarkerStartMs: directPlayback.expectedMarkerStartMs, expectedMarkerIntervalMs: directPlayback.expectedMarkerIntervalMs, browserMarkerPair, maxmodMarkerPair, browserOverallRms, maxmodOverallRms, rmsRatio, spectralComparison })}.`);
        return {
          timingDiagnosticAvailable: false,
          rmsRatio,
          spectralComparison,
          browserPeak: browser.peak,
          preLimiterCaptureChunks: browser.preLimiterCaptureChunks,
          browserMarkerCount: browser.syncMarkerOnsetTimes.length,
          maxmodMarkerCount: maxmod.syncMarkerOnsetTimes.length,
          browserMarkerIntervalMs: NaN,
          maxmodMarkerIntervalMs: NaN,
        };
      }
      console.log(`Isolated ${sourceModuleName} MOD channel set ${channelLabel} timing diagnostic unavailable: ${JSON.stringify({ expectedMarkerStartMs: directPlayback.expectedMarkerStartMs, expectedMarkerIntervalMs: directPlayback.expectedMarkerIntervalMs, browserMarkerPair, maxmodMarkerPair, browserDurationMs: browser.duration * 1_000, maxmodDurationMs: maxmod.duration * 1_000, rmsRatio })}.`);
      expect(browserOverallRms, 'The isolated Preview must produce active PCM even when its marker pair is missing.').toBeGreaterThan(0.0001);
      expect(maxmodOverallRms, 'The isolated Maxmod ROM must produce active PCM even when its marker pair is missing.').toBeGreaterThan(0.0001);
      return { timingDiagnosticAvailable: false, rmsRatio, browserPeak: browser.peak, preLimiterCaptureChunks: browser.preLimiterCaptureChunks, browserMarkerCount: browser.syncMarkerOnsetTimes.length, maxmodMarkerCount: maxmod.syncMarkerOnsetTimes.length, browserMarkerIntervalMs: NaN, maxmodMarkerIntervalMs: NaN };
    }
    if (requireParity) {
      expect(browserMarkerPair.errorMs).toBeLessThan(markerIntervalToleranceMs);
      expect(maxmodMarkerPair.errorMs).toBeLessThan(markerIntervalToleranceMs);
    }
    // Anchor to the first detected pulse in the row-zero half-window, then
    // pair it with the strongest candidate near row eight. This rejects later
    // music transients that happen to repeat at a similar interval.
    const browserFirstOnsetMs = browserMarkerPair.first * 1000;
    const maxmodFirstOnsetMs = maxmodMarkerPair.first * 1000;
    const browserMarkerIntervalMs = browserMarkerPair.intervalMs;
    const maxmodMarkerIntervalMs = maxmodMarkerPair.intervalMs;
    if (!anchorToDetectedMarkerPair && requireParity) {
      expect(browserFirstOnsetMs, 'The Preview row-zero marker should be detected in the first half of the marker interval.').toBeLessThan(directPlayback.expectedMarkerIntervalMs / 2);
      expect(maxmodFirstOnsetMs, 'The Maxmod row-zero marker should be detected in the first half of the marker interval.').toBeLessThan(directPlayback.expectedMarkerIntervalMs / 2);
    }
    const musicalOnsetSkewMs = (browserEpoch + browserFirstOnsetMs) - (maxmodEpoch + maxmodFirstOnsetMs);
    const envelopeWindowMs = browser.envelopeWindowSeconds * 1000;
    const markerTailMs = postMarkerSkipMs;
    const comparisonStartAfterMarkerMs = measureAfterMarkerPair ? Math.min(browserMarkerIntervalMs, maxmodMarkerIntervalMs) + markerTailMs : markerTailMs;
    const browserStart = Math.round(browserFirstOnsetMs / envelopeWindowMs) + Math.ceil(comparisonStartAfterMarkerMs / envelopeWindowMs);
    const maxmodStart = Math.round(maxmodFirstOnsetMs / envelopeWindowMs) + Math.ceil(comparisonStartAfterMarkerMs / envelopeWindowMs);
    const comparisonDurationMs = measureAfterMarkerPair ? Math.max(0, directPlayback.durationMs - comparisonStartAfterMarkerMs) : Math.min(directPlayback.expectedMarkerIntervalMs, browserMarkerIntervalMs, maxmodMarkerIntervalMs) - markerTailMs;
    const broadbandEnvelope = audio => audio.leftEnvelope.map((left, index) => Math.sqrt((left * left + (audio.rightEnvelope[index] ?? left) ** 2) / 2));
    const browserComparisonEnvelope = broadbandEnvelope(browser);
    const maxmodComparisonEnvelope = broadbandEnvelope(maxmod);
    const count = Math.max(0, Math.min(browserComparisonEnvelope.length - browserStart, maxmodComparisonEnvelope.length - maxmodStart, Math.floor(comparisonDurationMs / envelopeWindowMs)));
    const correlationAtLag = lag => {
      const browserOffset = browserStart + Math.max(0, -lag);
      const maxmodOffset = maxmodStart + Math.max(0, lag);
      const length = Math.min(count - Math.max(0, -lag), count - Math.max(0, lag));
      if (length < 40) return -1;
      const a = browserComparisonEnvelope.slice(browserOffset, browserOffset + length);
      const b = maxmodComparisonEnvelope.slice(maxmodOffset, maxmodOffset + length);
      const meanA = a.reduce((sum, value) => sum + value, 0) / length;
      const meanB = b.reduce((sum, value) => sum + value, 0) / length;
      let covariance = 0;
      let varianceA = 0;
      let varianceB = 0;
      for (let index = 0; index < length; index += 1) {
        const deltaA = a[index] - meanA;
        const deltaB = b[index] - meanB;
        covariance += deltaA * deltaB;
        varianceA += deltaA * deltaA;
        varianceB += deltaB * deltaB;
      }
      return covariance / Math.sqrt(Math.max(1e-20, varianceA * varianceB));
    };
    const fixedCorrelation = correlationAtLag(0);
    let bestCorrelation = -1;
    let bestLag = 0;
    for (let lag = -50; lag <= 50; lag += 1) {
      const correlation = correlationAtLag(lag);
      if (correlation > bestCorrelation) { bestCorrelation = correlation; bestLag = lag; }
    }
    const bestLagMs = bestLag * browser.envelopeWindowSeconds * 1000;
    const tempoWarpScale = browserMarkerIntervalMs / Math.max(1, maxmodMarkerIntervalMs);
    const tempoWarpLength = Math.min(count, maxmodComparisonEnvelope.length - maxmodStart, Math.floor((browserComparisonEnvelope.length - browserStart - 1) / tempoWarpScale));
    let tempoWarpCorrelation = -1;
    if (tempoWarpLength >= 40) {
      let meanBrowser = 0;
      let meanMaxmod = 0;
      for (let index = 0; index < tempoWarpLength; index += 1) {
        const position = browserStart + index * tempoWarpScale;
        const lower = Math.floor(position);
        const fraction = position - lower;
        const browserValue = browserComparisonEnvelope[lower] * (1 - fraction) + browserComparisonEnvelope[lower + 1] * fraction;
        meanBrowser += browserValue;
        meanMaxmod += maxmodComparisonEnvelope[maxmodStart + index];
      }
      meanBrowser /= tempoWarpLength;
      meanMaxmod /= tempoWarpLength;
      let covariance = 0;
      let varianceBrowser = 0;
      let varianceMaxmod = 0;
      for (let index = 0; index < tempoWarpLength; index += 1) {
        const position = browserStart + index * tempoWarpScale;
        const lower = Math.floor(position);
        const fraction = position - lower;
        const browserValue = browserComparisonEnvelope[lower] * (1 - fraction) + browserComparisonEnvelope[lower + 1] * fraction;
        const browserDelta = browserValue - meanBrowser;
        const maxmodDelta = maxmodComparisonEnvelope[maxmodStart + index] - meanMaxmod;
        covariance += browserDelta * maxmodDelta;
        varianceBrowser += browserDelta * browserDelta;
        varianceMaxmod += maxmodDelta * maxmodDelta;
      }
      tempoWarpCorrelation = covariance / Math.sqrt(Math.max(1e-20, varianceBrowser * varianceMaxmod));
    }
    const stereoRms = audio => Math.sqrt((audio.leftRms ** 2 + audio.rightRms ** 2) / 2);
    const measuredStereoRms = (audio, start, length) => {
      let leftSquares = 0;
      let rightSquares = 0;
      for (let index = start; index < start + length; index += 1) {
        leftSquares += audio.leftEnvelope[index] ** 2;
        rightSquares += audio.rightEnvelope[index] ** 2;
      }
      return Math.sqrt((leftSquares + rightSquares) / Math.max(2, length * 2));
    };
    const browserMeasuredRms = measuredStereoRms(browser, browserStart, count);
    const maxmodMeasuredRms = measuredStereoRms(maxmod, maxmodStart, count);
    const measuredRmsAfterMarker = (audio, markerTime, startMs, endMs) => {
      const start = Math.round((markerTime + startMs / 1000) / audio.envelopeWindowSeconds);
      const end = Math.min(audio.envelope.length, Math.round((markerTime + endMs / 1000) / audio.envelopeWindowSeconds));
      return measuredStereoRms(audio, start, Math.max(0, end - start));
    };
    const lateSampleWindow = {
      browser: measuredRmsAfterMarker(browser, browserMarkerPair.first, 600, 850),
      maxmod: measuredRmsAfterMarker(maxmod, maxmodMarkerPair.first, 600, 850),
    };
    const loopedSampleTail = sourceModuleName.includes('stardstm-looped-sample') || sourceModuleName.includes('stardstm-cxx-disabled')
      ? Object.fromEntries([['browser', browser], ['maxmod', maxmod]].map(([side, audio]) => {
        const pair = side === 'browser' ? browserMarkerPair : maxmodMarkerPair;
        const startSeconds = pair.second + 0.9;
        const windows = (audio.stereoRmsSegments ?? []).filter(segment => segment.time >= startSeconds);
        return [side, {
          startSeconds,
          durationSeconds: windows.length ? windows.length * 0.08 : 0,
          rms: Math.sqrt(windows.reduce((sum, segment) => sum + segment.rms ** 2, 0) / Math.max(1, windows.length)),
          maximumWindowRms: Math.max(0, ...windows.map(segment => segment.rms)),
          finalSecondRms: Math.sqrt(windows.slice(-13).reduce((sum, segment) => sum + segment.rms ** 2, 0) / Math.max(1, Math.min(13, windows.length))),
          finalWindows: windows.slice(-10).map(segment => ({ time: segment.time, rms: segment.rms })),
          windows: windows.length,
        }];
      }))
      : undefined;
    if (preEmulationWindow) {
      const comparisonMarker = measureAfterMarkerPair ? maxmodMarkerPair.second : maxmodMarkerPair.first;
      const previewComparisonMarker = measureAfterMarkerPair ? browserMarkerPair.second : browserMarkerPair.first;
      preEmulationWindow.firstMarkerRelativeCaptureOffsetMs = capturePreEmulationStartBlock * preEmulationWindow.blockDurationMs - maxmodFirstOnsetMs;
      const alignedWindowStartMs = postMarkerSkipMs;
      const postCoreRms = measuredRmsAfterMarker(maxmod, comparisonMarker, alignedWindowStartMs, alignedWindowStartMs + 400);
      preEmulationWindow.postCoreWindow = { sampleRate: maxmod.sampleRate, rms: postCoreRms, markerOffsetMs: alignedWindowStartMs, durationMs: 400 };
      const preCoreStartFrame = Math.round((preEmulationWindow.captureOffsetAfterMarkerMs + alignedWindowStartMs) * preEmulationWindow.sampleRate / 1_000);
      const preCoreFrames = Math.min(Math.round(preEmulationWindow.sampleRate * 0.4), preEmulationWindow.frames - preCoreStartFrame);
      let preCoreAlignedPower = 0;
      for (let frame = preCoreStartFrame; frame < preCoreStartFrame + preCoreFrames; frame += 1) {
        for (let channel = 0; channel < preEmulationWindow.channels; channel += 1) {
          const byte = preEmulationRawPcm[frame * preEmulationWindow.channels + channel];
          const value = (byte < 128 ? byte : byte - 256) / 128;
          preCoreAlignedPower += value * value;
        }
      }
      preEmulationWindow.markerAlignedRms = Math.sqrt(preCoreAlignedPower / Math.max(1, preCoreFrames * preEmulationWindow.channels));
      preEmulationWindow.postCoreToMaxmodRms = postCoreRms / Math.max(1e-9, preEmulationWindow.markerAlignedRms);
      const blockDurationSeconds = preEmulationWindow.blockDurationMs / 1_000;
      const previewStart = Math.round((previewComparisonMarker * 1_000 + alignedWindowStartMs) / (browser.envelopeWindowSeconds * 1_000));
      const referenceStartBlock = Math.ceil((preEmulationWindow.captureOffsetAfterMarkerMs + alignedWindowStartMs) / preEmulationWindow.blockDurationMs);
      const alignedReferenceBlocks = preEmulationWindow.blockRms.slice(referenceStartBlock);
      const blockCount = Math.min(alignedReferenceBlocks.length, Math.floor((browser.envelope.length - previewStart) * browser.envelopeWindowSeconds / blockDurationSeconds));
      const previewBlocks = Array.from({ length: Math.max(0, blockCount) }, (_, blockIndex) => {
        const first = previewStart + Math.round(blockIndex * blockDurationSeconds / browser.envelopeWindowSeconds);
        const last = Math.min(browser.envelope.length, previewStart + Math.round((blockIndex + 1) * blockDurationSeconds / browser.envelopeWindowSeconds));
        let squares = 0;
        for (let index = first; index < last; index += 1) squares += (browser.leftEnvelope[index] ** 2 + browser.rightEnvelope[index] ** 2) / 2;
        return Math.sqrt(squares / Math.max(1, last - first));
      });
      const referenceBlocks = alignedReferenceBlocks.slice(0, previewBlocks.length);
      const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
      const previewMean = mean(previewBlocks);
      const referenceMean = mean(referenceBlocks);
      let covariance = 0;
      let previewVariance = 0;
      let referenceVariance = 0;
      for (let index = 0; index < previewBlocks.length; index += 1) {
        const previewDelta = previewBlocks[index] - previewMean;
        const referenceDelta = referenceBlocks[index] - referenceMean;
        covariance += previewDelta * referenceDelta;
        previewVariance += previewDelta * previewDelta;
        referenceVariance += referenceDelta * referenceDelta;
      }
      preEmulationWindow.previewEnvelopeComparison = {
        sampleCount: previewBlocks.length,
        markerOffsetMs: preEmulationWindow.captureOffsetAfterMarkerMs,
        previewStartMsAfterRowZeroMarker: previewComparisonMarker * 1_000 + alignedWindowStartMs,
        maxmodPcmStartMsAfterMarker: preEmulationWindow.captureOffsetAfterMarkerMs + alignedWindowStartMs,
        previewRms: Math.sqrt(previewBlocks.reduce((sum, value) => sum + value * value, 0) / Math.max(1, previewBlocks.length)),
        maxmodPreGbaRms: Math.sqrt(referenceBlocks.reduce((sum, value) => sum + value * value, 0) / Math.max(1, referenceBlocks.length)),
        rmsRatio: Math.sqrt(previewBlocks.reduce((sum, value) => sum + value * value, 0) / Math.max(1e-20, referenceBlocks.reduce((sum, value) => sum + value * value, 0))),
        envelopeCorrelation: covariance / Math.sqrt(Math.max(1e-20, previewVariance * referenceVariance)),
      };
      const alignedOpenAlBlocks = Array.from({ length: Math.min(previewBlocks.length, referenceBlocks.length) }, (_, blockIndex) => measuredRmsAfterMarker(
        maxmod,
        comparisonMarker,
        alignedWindowStartMs + blockIndex * preEmulationWindow.blockDurationMs,
        alignedWindowStartMs + (blockIndex + 1) * preEmulationWindow.blockDurationMs,
      ));
      const compareAlignedBlockEnvelopes = (reference, target) => {
        const sampleCount = Math.min(reference.length, target.length);
        const referenceMean = mean(reference.slice(0, sampleCount));
        const targetMean = mean(target.slice(0, sampleCount));
        let cross = 0;
        let referenceVariance = 0;
        let targetVariance = 0;
        let referencePower = 0;
        let targetPower = 0;
        for (let index = 0; index < sampleCount; index += 1) {
          const referenceValue = reference[index];
          const targetValue = target[index];
          const referenceDelta = referenceValue - referenceMean;
          const targetDelta = targetValue - targetMean;
          cross += referenceDelta * targetDelta;
          referenceVariance += referenceDelta * referenceDelta;
          targetVariance += targetDelta * targetDelta;
          referencePower += referenceValue * referenceValue;
          targetPower += targetValue * targetValue;
        }
        return {
          sampleCount,
          correlation: cross / Math.sqrt(Math.max(1e-20, referenceVariance * targetVariance)),
          rmsRatio: Math.sqrt(targetPower / Math.max(1e-20, referencePower)),
        };
      };
      preEmulationWindow.postCoreEnvelopeComparison = {
        marker: 'second-row-window',
        previewToOpenAl: compareAlignedBlockEnvelopes(previewBlocks, alignedOpenAlBlocks),
        preGbaToOpenAl: compareAlignedBlockEnvelopes(referenceBlocks, alignedOpenAlBlocks),
      };
      console.log(`${sourceModuleName} MOD Maxmod pre-mGBA window: ${JSON.stringify(preEmulationWindow)}.`);
    }
    const effectWindow = measureAfterMarkerPair ? {
      browser: measuredRmsAfterMarker(browser, browserMarkerPair.second, 100, 500),
      maxmod: measuredRmsAfterMarker(maxmod, maxmodMarkerPair.second, 100, 500),
    } : undefined;
    const selectedRowTickZeroWindow = sourceModuleName.includes('note-less-sample-selection') ? {
      browser: measuredRmsAfterMarker(browser, browserMarkerPair.first, browserMarkerPair.intervalMs / 8, browserMarkerPair.intervalMs / 8 + 18),
      maxmod: measuredRmsAfterMarker(maxmod, maxmodMarkerPair.first, maxmodMarkerPair.intervalMs / 8, maxmodMarkerPair.intervalMs / 8 + 18),
    } : undefined;
    const selectedRowWindow = sourceModuleName.includes('note-less-sample-selection') ? {
      browser: measuredRmsAfterMarker(browser, browserMarkerPair.first, browserMarkerPair.intervalMs / 8 + 25, browserMarkerPair.intervalMs / 8 + 75),
      maxmod: measuredRmsAfterMarker(maxmod, maxmodMarkerPair.first, maxmodMarkerPair.intervalMs / 8 + 25, maxmodMarkerPair.intervalMs / 8 + 75),
    } : undefined;
    const a0fEnvelope = (audio, markerTime) => Array.from({ length: 24 }, (_, index) => ({
      startMs: index * 25,
      rms: measuredRmsAfterMarker(audio, markerTime, index * 25, (index + 1) * 25),
    }));
    const effectEnvelope = sourceModuleName.includes('a0f') ? {
      browser: a0fEnvelope(browser, browserMarkerPair.first),
      maxmod: a0fEnvelope(maxmod, maxmodMarkerPair.first),
    } : undefined;
    const rmsRatio = browserMeasuredRms / Math.max(1e-9, maxmodMeasuredRms);
    const selectedMusicChannelCount = Array.isArray(selectedChannel) ? selectedChannel.length : 1;
    const addedMarkerChannelCount = Math.max(0, modChannelCount(isolatedBytes) - modChannelCount(isolatedMusicBytes));
    const markerHeadroomCorrection = addedMarkerChannelCount > 0
      ? Math.max(1, (selectedMusicChannelCount + addedMarkerChannelCount) / 4) / Math.max(1, selectedMusicChannelCount / 4)
      : 1;
    const headroomCorrectedRmsRatio = rmsRatio * markerHeadroomCorrection;
    const effectEnvelopeSummary = effectEnvelope && Object.fromEntries(Object.entries(effectEnvelope).map(([side, values]) => [side, values.map(value => Number(value.rms.toFixed(3)))]));
    console.log(`Isolated ${sourceModuleName} MOD channel set ${channelLabel}: ${JSON.stringify({ rows: directPlayback.rows, markerRows: directPlayback.markerRows, expectedMarkerStartMs: directPlayback.expectedMarkerStartMs, expectedMarkerIntervalMs: directPlayback.expectedMarkerIntervalMs, browserMarkerPair, maxmodMarkerPair, durationMs: directPlayback.durationMs, romTap, captureSkewMs, musicalOnsetSkewMs, browserFirstOnsetMs, maxmodFirstOnsetMs, browserMarkerIntervalMs, maxmodMarkerIntervalMs, tempoWarpScale, tempoWarpCorrelation, fixedCorrelation, bestCorrelation, bestLagMs, comparedStereoRms: { browser: browserMeasuredRms, maxmod: maxmodMeasuredRms }, spectralComparison, lateSampleWindow, loopedSampleTail, selectedRowTickZeroWindow, selectedRowWindow, effectEnvelope: effectEnvelopeSummary, rmsRatio, markerHeadroomCorrection, headroomCorrectedRmsRatio, browser: { leftRms: browser.leftRms, rightRms: browser.rightRms, estimatedPitch: browser.estimatedPitch }, maxmod: { leftRms: maxmod.leftRms, rightRms: maxmod.rightRms, estimatedPitch: maxmod.estimatedPitch } })}.`);
    if (!Number.isInteger(capturePreEmulationStartBlock)) expect(captureSkewMs).toBeLessThan(500);
    expect(stereoRms(browser)).toBeGreaterThan(0.0001);
    expect(stereoRms(maxmod)).toBeGreaterThan(0.0001);
    if (requireParity) expect(Math.abs(browserMarkerIntervalMs - maxmodMarkerIntervalMs)).toBeLessThan(50);
    const measurement = { browserMeasuredRms, maxmodMeasuredRms, browserEstimatedPitch: browser.estimatedPitch, maxmodEstimatedPitch: maxmod.estimatedPitch, browserPeak: browser.peak, browserPitchSegments: browser.pitchSegments, maxmodPitchSegments: maxmod.pitchSegments, rmsRatio, markerHeadroomCorrection, headroomCorrectedRmsRatio, tempoWarpScale, tempoWarpCorrelation, fixedCorrelation, bestCorrelation, bestLagMs, browserMarkerCount: browser.syncMarkerOnsetTimes.length, maxmodMarkerCount: maxmod.syncMarkerOnsetTimes.length, browserMarkerPair, maxmodMarkerPair, expectedMarkerStartMs: directPlayback.expectedMarkerStartMs, expectedMarkerIntervalMs: directPlayback.expectedMarkerIntervalMs, browserMarkerIntervalMs, maxmodMarkerIntervalMs, browserMarkerDetection: browser.syncMarkerDetectionDiagnostics, maxmodMarkerDetection: maxmod.syncMarkerDetectionDiagnostics, spectralComparison, lateSampleWindow, loopedSampleTail, selectedRowTickZeroWindow, selectedRowWindow, effectWindow, effectEnvelope, preEmulationWindow };
    if (requireParity) {
      const preGbaEnvelope = preEmulationWindow?.previewEnvelopeComparison;
      expect(preGbaEnvelope?.sampleCount, 'The isolated MOD lane should provide a marker-aligned Maxmod pre-GBA envelope window.').toBeGreaterThanOrEqual(12);
      expect(preGbaEnvelope?.envelopeCorrelation, 'The isolated MOD lane envelope should follow the Maxmod pre-GBA mixer.').toBeGreaterThan(0.65);
      expect(preGbaEnvelope?.rmsRatio, 'The isolated MOD lane level should match the Maxmod pre-GBA mixer.').toBeGreaterThan(0.75);
      expect(preGbaEnvelope?.rmsRatio, 'The isolated MOD lane level should match the Maxmod pre-GBA mixer.').toBeLessThan(1.25);
    }
    await engine.evaluate(() => { window.__isolatedCyberridPlayer?.stop(); window.__isolatedCyberridPlayer = undefined; });
    return measurement;
  } finally {
    if (emulator && !emulator.isClosed()) await emulator.close().catch(() => {});
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
};

for (const selectedChannel of [0, 1, 2, 3]) {
  test(`compares isolated cyberrid MOD channel ${selectedChannel + 1} against Maxmod`, async () => {
    test.setTimeout(90_000);
    const markerChannel = selectedChannel === 0 ? 1 : selectedChannel === 3 ? 2 : 3;
    const measurement = await compareIsolatedCyberridChannel(selectedChannel, 'cyberrid.mod', true, undefined, 16, true, [0, 8], markerChannel, 36, 0);
    console.log(`cyberrid channel ${selectedChannel + 1} Preview/Maxmod pre-GBA envelope: ${JSON.stringify(measurement.preEmulationWindow?.previewEnvelopeComparison)}.`);
  });
}

test('records Maxmod Q12 sample-read steps for an isolated cyberrid MOD channel', async () => {
  test.setTimeout(90_000);
  const measurement = await compareIsolatedCyberridChannel(0, 'cyberrid.mod', false, undefined, 16, true, [0, 8], undefined, 54, 0);
  const activeTrace = measurement.preEmulationWindow?.mixerTrace?.filter(trace => trace.frequency > 0) ?? [];
  const sourceSteps = activeTrace.map(trace => Number(((Math.imul(trace.frequency, trace.rateScale) >>> 14) / 4_096).toFixed(6)));
  const expectedSecondMarkerInCaptureMs = measurement.maxmodMarkerPair.first * 1_000
    + measurement.expectedMarkerIntervalMs
    - (measurement.preEmulationWindow.captureStartBlock * measurement.preEmulationWindow.blockDurationMs);
  const preGbaMarkerMatch = measurement.preEmulationWindow.markerTemplateMatches
    .filter(match => Math.abs(match.timeMs - expectedSecondMarkerInCaptureMs) < 30)
    .sort((left, right) => right.correlation - left.correlation)[0];
  const alignedEnvelope = measurement.preEmulationWindow?.previewEnvelopeComparison;
  const postCoreEnvelope = measurement.preEmulationWindow?.postCoreEnvelopeComparison;
  expect(preGbaMarkerMatch, `Maxmod PCM should contain the row-eight marker near ${expectedSecondMarkerInCaptureMs.toFixed(1)} ms: ${JSON.stringify(measurement.preEmulationWindow.markerTemplateMatches)}`).toBeDefined();
  expect(preGbaMarkerMatch.correlation, 'The expected Maxmod marker should correlate with its source PCM template.').toBeGreaterThan(0.12);
  console.log(`cyberrid MOD Maxmod sample-read and marker capture: ${JSON.stringify({ activeTrace, sourceSteps, expectedSecondMarkerInCaptureMs, previewEnvelopeComparison: measurement.preEmulationWindow?.previewEnvelopeComparison, postCoreEnvelopeComparison: measurement.preEmulationWindow?.postCoreEnvelopeComparison, preGbaMarkerTemplateMatches: measurement.preEmulationWindow?.markerTemplateMatches, preGbaMarkerCandidates: measurement.preEmulationWindow?.markerCandidates?.map(channel => channel.map(candidate => ({ timeMs: candidate.time * 1_000, confidence: candidate.confidence, patternCorrelation: candidate.patternCorrelation, onPower: candidate.onPower }))) })}.`);
  expect(activeTrace.length).toBeGreaterThan(0);
  expect(sourceSteps.every(step => Number.isFinite(step) && step > 0)).toBe(true);
  expect(alignedEnvelope?.sampleCount).toBeGreaterThan(10);
  expect(alignedEnvelope?.maxmodPcmStartMsAfterMarker).toBeCloseTo(alignedEnvelope?.markerOffsetMs ?? NaN, 6);
  expect(alignedEnvelope?.previewStartMsAfterRowZeroMarker).toBeCloseTo(measurement.browserMarkerPair.second * 1_000, 3);
  expect(postCoreEnvelope?.marker).toBe('second-row-window');
  expect(postCoreEnvelope?.previewToOpenAl.sampleCount).toBe(alignedEnvelope?.sampleCount);
  expect(Number.isFinite(postCoreEnvelope?.previewToOpenAl.correlation)).toBe(true);
  expect(Number.isFinite(postCoreEnvelope?.preGbaToOpenAl.correlation)).toBe(true);
});

test('validates the eight-tone cyberrid sync markers on an isolated Maxmod lane', async () => {
  test.setTimeout(90_000);
  const markerFrequencySequence = [2_200, 1_429, 1_753, 2_089, 2_441, 2_801, 3_163, 3_539];
  const markerDetectorOptions = { threshold: 0.9, minimumPowerRatio: 0.01 };
  const measurement = await compareIsolatedCyberridChannel(-1, 'cyberrid.mod', false, undefined, 16, false, [0, 8], 3, 50, 0, true, markerFrequencySequence, markerDetectorOptions);
  const mixerTrace = measurement.preEmulationWindow?.mixerTrace ?? [];
  console.log(`Isolated cyberrid marker lane diagnostic: ${JSON.stringify({
    markerFrequencySequence,
    markerDetectorOptions,
    browserMarkerCount: measurement.browserMarkerCount,
    maxmodMarkerCount: measurement.maxmodMarkerCount,
    browserMarkerIntervalMs: measurement.browserMarkerIntervalMs,
    maxmodMarkerIntervalMs: measurement.maxmodMarkerIntervalMs,
    browserMarkerDetection: measurement.browserMarkerDetection,
    maxmodMarkerDetection: measurement.maxmodMarkerDetection,
    rmsRatio: measurement.rmsRatio,
    preEmulationWindow: measurement.preEmulationWindow?.previewEnvelopeComparison,
    activeMixerTrace: mixerTrace.filter(trace => trace.frequency > 0 && trace.volume > 0),
  })}.`);
  expect(measurement.browserMarkerCount).toBeGreaterThanOrEqual(2);
  expect(measurement.maxmodMarkerCount).toBeGreaterThanOrEqual(2);
  expect(measurement.browserMarkerIntervalMs).toBeGreaterThan(700);
  expect(Math.abs(measurement.browserMarkerIntervalMs - measurement.maxmodMarkerIntervalMs)).toBeLessThan(50);
  expect(mixerTrace.some(trace => trace.frequency > 0 && trace.volume > 0), 'The isolated sync sample should reach the Maxmod mixer.').toBe(true);
});

test('reports the active Maxmod panning values for the cyberrid MOD music channels', async () => {
  test.setTimeout(240_000);
  const measurements = [];
  for (const channel of [0, 1, 2, 3]) {
    const measurement = await compareIsolatedCyberridChannel(channel, 'cyberrid.mod', false, undefined, 16, false, [0, 8], undefined, 24, 100, true);
    const activeTrace = measurement.preEmulationWindow?.mixerTrace?.filter(trace => trace.frequency > 0 && trace.volume > 0) ?? [];
    const panningValues = [...new Set(activeTrace.map(trace => trace.pan))].sort((left, right) => left - right);
    measurements.push({ channel: channel + 1, panningValues, traceCount: activeTrace.length });
    expect(activeTrace.length, `Maxmod should expose an active voice trace for isolated MOD channel ${channel + 1}.`).toBeGreaterThan(0);
  }
  console.log(`cyberrid MOD per-channel Maxmod panning values: ${JSON.stringify(measurements)}.`);
  expect(measurements.map(measurement => measurement.panningValues[0])).toEqual([64, 192, 192, 64]);
});

for (const channels of [[0, 3], [1, 2]]) {
  const channelLabel = channels.map(channel => channel + 1).join('-');
  test(`compares cyberrid MOD channel pair ${channelLabel} against Maxmod`, async () => {
    test.setTimeout(90_000);
    await compareIsolatedCyberridChannel(channels);
  });
}


test('measures stardstm MOD timing from sync markers 32 rows apart', async () => {
  test.setTimeout(60_000);
  const measurement = await compareIsolatedCyberridChannel([0, 1, 2, 3], 'stardstm.mod', false, undefined, 64, true, [0, 32], 1);
  expect(measurement).toBeTruthy();
  expect(measurement.markerHeadroomCorrection).toBe(1);
  expect(Math.abs(measurement.browserMarkerIntervalMs - measurement.maxmodMarkerIntervalMs)).toBeLessThan(25);
});

test('measures stardstm MOD stereo channel pairs against Maxmod for the open fidelity gate', async () => {
  test.setTimeout(180_000);
  const measurements = [];
  for (const channels of [[0, 3], [1, 2]]) {
    const measurement = await compareIsolatedCyberridChannel(channels, 'stardstm.mod', false);
    expect(measurement).toBeTruthy();
    measurements.push({ channels, ...measurement });
  }
  for (const measurement of measurements) {
    expect(measurement.rmsRatio).toBeGreaterThan(0.5);
    expect(measurement.rmsRatio).toBeLessThan(1.5);
    expect(Math.abs(measurement.browserMarkerIntervalMs - measurement.maxmodMarkerIntervalMs)).toBeLessThan(50);
  }
});

test('keeps a one-shot MOD sync sample out of the measurement window', async () => {
  test.setTimeout(90_000);
  const measurement = await compareIsolatedCyberridChannel([], 'stardstm.mod', false);
  expect(measurement).toBeTruthy();
  expect(measurement.browserMeasuredRms).toBeLessThan(0.005);
  expect(measurement.maxmodMeasuredRms).toBeLessThan(0.02);
});

test('measures the stardstm channel 3 sample without Axy effects', async () => {
  test.setTimeout(90_000);
  const measurement = await compareIsolatedCyberridChannel(2, 'stardstm-channel-3-no-axy.mod', false, createStardstmWithoutChannelAxy(2));
  expect(measurement).toBeTruthy();
  expect(measurement.rmsRatio).toBeGreaterThan(0.75);
  expect(measurement.rmsRatio).toBeLessThan(1.25);
  expect(measurement.bestCorrelation).toBeGreaterThan(0.65);
  expect(Math.abs(measurement.bestLagMs)).toBeLessThan(50);
  expect(Math.abs(measurement.browserMarkerIntervalMs - measurement.maxmodMarkerIntervalMs)).toBeLessThan(50);
  expect(measurement.browserMarkerIntervalMs).toBeGreaterThan(850);
  expect(measurement.maxmodMarkerIntervalMs).toBeGreaterThan(850);
});




test('renders real Shooter XM, S3M, and IT modules through the structural preview UI', async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-structural-formats-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  fs.mkdirSync(musicDirectory, { recursive: true });
  const shooterMusicDirectory = path.join(repositoryRoot, 'templateEngineGame', 'shooter_game', 'assets', 'musics');
  const fixtures = [
    ['galgox_snowheart_melody.xm', 'XM'],
    ['soda7_xcopy_ohc.s3m', 'S3M'],
    ['minor_boss_r.it', 'IT'],
  ];
  for (const [filename] of fixtures) {
    const sourcePath = path.join(shooterMusicDirectory, filename);
    const targetPath = path.join(musicDirectory, filename);
    if (filename === 'stardstm.mod') {
      const source = fs.readFileSync(sourcePath);
      fs.writeFileSync(targetPath, createModSyncMarker(source).bytes);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    await electronApp.context().addInitScript(installBrowserPreviewAudioTap);
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    for (const [filename, format] of fixtures) {
      await engine.getByRole('listitem').getByText(filename, { exact: true }).click();
      const sourceModule = fs.readFileSync(path.join(musicDirectory, filename)).toString('base64');
      const exportAudit = await engine.evaluate(async ({ encoded, fileName, target }) => {
        const tracker = await import('/src/utils/trackerModule.ts');
        const { importTrackerModuleComposition } = await import('/src/utils/trackerCompositionImport.ts');
        const { exportMusicComposition } = await import('/src/utils/trackerCompositionExport.ts');
        const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        try {
          const sourceInfo = tracker.parseTrackerModule(buffer, target);
          const composition = importTrackerModuleComposition(buffer, fileName);
          const output = new Uint8Array(exportMusicComposition(composition, target).moduleData);
          const outputBuffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
          const outputInfo = tracker.parseTrackerModule(outputBuffer, target);
          return { sourceInfo, compositionInstruments: composition.instruments.length, outputInfo };
        } catch (error) {
          return { error: String(error), stack: error instanceof Error ? error.stack : '' };
        }
      }, { encoded: sourceModule, fileName: filename, target: format });
      expect(exportAudit.error, JSON.stringify(exportAudit)).toBeUndefined();
      if (format === 'XM') expect(exportAudit.outputInfo.instruments).toBe(exportAudit.sourceInfo.instruments);
      await engine.getByRole('button', { name: /Import for editing|Importar para edição|Éditer une copie|Importar para editar/ }).click();
      const editor = engine.getByLabel('Music beat editor');
      await expect(editor).toBeVisible();
      await expect(engine.getByTestId('right-panel-scroll').getByText(format, { exact: true })).toBeVisible();
      const importedPlaybackData = await engine.evaluate(async filename => {
        const { parseTrackerModule, parseTrackerPlaybackRows, parseXmSamples, parseS3mSamples, parseItSamples } = await import('/src/utils/trackerModule.ts');
        const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
        const { exportMusicComposition } = await import('/src/utils/trackerCompositionExport.ts');
        const listed = await window.electronAPI.listTrackerProjects();
        const projectFilename = listed.files.find(name => name.toLowerCase().includes(filename.replace(/\.[^/.]+$/, '').toLowerCase()) && name.toLowerCase().endsWith('.gbatracker'));
        if (!projectFilename) throw new Error(`Imported ${filename} project is missing.`);
        const loaded = await window.electronAPI.loadTrackerProject(projectFilename);
        const binary = atob(loaded.data);
        const document = parseTrackerProjectPackage(Uint8Array.from(binary, character => character.charCodeAt(0)));
        const format = document.composition.targetFormat;
        const moduleData = exportMusicComposition(document.composition, format).moduleData;
        const moduleBytes = new Uint8Array(moduleData);
        const buffer = moduleBytes.buffer.slice(moduleBytes.byteOffset, moduleBytes.byteOffset + moduleBytes.byteLength);
        const info = parseTrackerModule(buffer, format);
        const rows = parseTrackerPlaybackRows(buffer, format, 65_536);
        const samples = format === 'XM' ? parseXmSamples(buffer) : format === 'S3M' ? parseS3mSamples(buffer) : parseItSamples(buffer);
        return { format, rows: rows.length, noteEvents: rows.flat().filter(event => event?.note > 0).length, instrumentEvents: rows.flat().filter(event => event?.instrument > 0).length, samples: samples.size, sampleFrames: [...samples.values()].reduce((sum, sample) => sum + sample.samples.length, 0), channels: info.channels, instruments: info.instruments };
      }, filename);
      expect(importedPlaybackData.format).toBe(format);
      expect(importedPlaybackData.noteEvents, `${format} imported notes should remain available for playback.`).toBeGreaterThan(0);
      expect(importedPlaybackData.samples, `${format} imported samples should remain available for playback.`).toBeGreaterThan(0);
      expect(importedPlaybackData.sampleFrames, `${format} imported sample frames should remain available for playback.`).toBeGreaterThan(0);
      expect(importedPlaybackData.instruments, `${format} canonical target should retain its exported instruments.`).toBe(exportAudit.outputInfo.instruments);
      const quickPreview = editor.getByRole('button', { name: /Quick preview|Prévia rápida|Vista previa rápida|Aperçu rapide/ });
      await expect(quickPreview).toBeEnabled();
      await quickPreview.click();
      await engine.waitForTimeout(2_000);
      const pcm8Range = await engine.evaluate(() => {
        const chunks = window.__musicPreviewCapture?.chunks ?? [];
        let minimum = Number.POSITIVE_INFINITY;
        let maximum = Number.NEGATIVE_INFINITY;
        let maxGridError = 0;
        let samples = 0;
        for (const chunk of chunks) for (const channel of chunk.slice(0, 2)) for (const sample of channel) {
          minimum = Math.min(minimum, sample);
          maximum = Math.max(maximum, sample);
          maxGridError = Math.max(maxGridError, Math.abs(sample * 128 - Math.round(sample * 128)));
          samples += 1;
        }
        return { minimum, maximum, maxGridError, samples };
      });
      const audio = await engine.evaluate(finishAudioCapture, 'preview');
      console.log(`${format} real Shooter structural preview PCM: ${JSON.stringify(audio)}.`);
      expect(audio.rms, `${format} structural preview should contain PCM.`).toBeGreaterThan(0.0001);
      expect(pcm8Range.samples, `${format} structural preview should pass through the GBA-rate PCM8 limiter.`).toBeGreaterThan(0);
      expect(pcm8Range.minimum, `${format} signed PCM8 output should stay in range.`).toBeGreaterThanOrEqual(-1);
      expect(pcm8Range.maximum, `${format} signed PCM8 output should stay in range.`).toBeLessThanOrEqual(127 / 128);
      expect(pcm8Range.maxGridError, `${format} output should use signed PCM8 quantization.`).toBeLessThan(0.00001);
      expect(audio.activeDuration, `${format} structural preview should remain active.`).toBeGreaterThan(0.25);
      const stopPreview = editor.getByRole('button', { name: /Stop|Parar|Detener|Arrêter/ });
      if (await stopPreview.isVisible().catch(() => false)) await stopPreview.click();
    }
  } finally {
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('shows IT effects ignored by the default GBA build core in the editor warning', async () => {
  test.setTimeout(45_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-build-core-warning-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  fs.mkdirSync(musicDirectory, { recursive: true });
  const tracker = await loadTrackerModuleTools();
  const fixture = createItC5PitchFixture(60);
  let moduleBytes = fixture.buffer.slice(fixture.byteOffset, fixture.byteOffset + fixture.byteLength);
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 1, 0, { effect: 0x59, parameter: 0x82 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 2, 0, { effect: 0x5a, parameter: 0x82 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 3, 0, { effect: 0x53, parameter: 0x50 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 4, 0, { effect: 0x53, parameter: 0xa1 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 5, 0, { effect: 0x53, parameter: 0xf1 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 6, 0, { effect: 0x53, parameter: 0x30 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 7, 0, { effect: 0x53, parameter: 0x40 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 8, 0, { effect: 0x50, parameter: 0x10 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 9, 0, { effect: 0x49, parameter: 0x34 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 10, 0, { effect: 0x53, parameter: 0x62 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 11, 0, { effect: 0x53, parameter: 0x70 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 12, 0, { effect: 0x53, parameter: 0x71 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 13, 0, { effect: 0x53, parameter: 0x72 });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 14, 0, { effect: 0x53, parameter: 0x7a });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 15, 0, { effect: 0x53, parameter: 0x7f });
  moduleBytes = tracker.updateItPatternEvent(moduleBytes, 0, 16, 0, { effect: 0x53, parameter: 0x91 });
  expect(tracker.parseTrackerCompatibilityWarnings(moduleBytes, 'IT')).toContain('The default GBA build core ignores these IT effects: Yxy, Zxx, S5x, SAx, S3x, S4x, Pxy, Ixy, S6x, S70-S72, S7A-S7F, S9x.');
  fs.writeFileSync(path.join(musicDirectory, 'target-limits.it'), Buffer.from(moduleBytes));
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').getByText('target-limits.it', { exact: true }).click();
    await engine.getByRole('button', { name: /Import/ }).click();
    await expect(engine.getByLabel('Music beat editor')).toBeVisible();
    const rendererWarnings = await engine.evaluate(async bytes => {
      const { parseTrackerCompatibilityWarnings } = await import('/src/utils/trackerModule.ts');
      const moduleBytes = Uint8Array.from(atob(bytes), character => character.charCodeAt(0));
      return parseTrackerCompatibilityWarnings(moduleBytes.buffer, 'IT');
    }, Buffer.from(moduleBytes).toString('base64'));
    expect(rendererWarnings).toContain('The default GBA build core ignores these IT effects: Yxy, Zxx, S5x, SAx, S3x, S4x, Pxy, Ixy, S6x, S70-S72, S7A-S7F, S9x.');
    await expect(engine.getByText(/O build core.*S70-S72, S7A-S7F, S9x\./)).toBeVisible();
  } finally {
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('uses IT C5 speed as the sample playback reference note', async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-c5-pitch-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    await electronApp.context().addInitScript(installBrowserPreviewAudioTap);
    const engine = await openMusicLibrary(electronApp);
    const measuredPitches = new Map();
    for (const note of [60, 48]) {
      const filename = `it-c5-note-${note}.it`;
      fs.writeFileSync(path.join(musicDirectory, filename), createItC5PitchFixture(note));
      await engine.getByRole('listitem').getByText(filename, { exact: true }).click();
      await engine.getByRole('button', { name: /Import for editing|Importar para edi|Éditer une copie/ }).click();
      const editor = engine.getByLabel('Music beat editor');
      await expect(editor).toBeVisible();
      await expect(engine.getByTestId('right-panel-scroll').getByText('IT', { exact: true })).toBeVisible();
      await engine.evaluate(() => { window.__musicPreviewCapture = null; });
      await editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
      await engine.waitForTimeout(2_400);
      const audio = await engine.evaluate(finishAudioCapture, 'sync');
      measuredPitches.set(note, audio.estimatedPitch);
      console.log(`IT note ${note} at C5 speed reference: ${JSON.stringify({ rms: audio.rms, peak: audio.peak, estimatedPitch: audio.estimatedPitch })}.`);
      expect(audio.rms, `IT note ${note} should render sample PCM.`).toBeGreaterThan(0.001);
      expect(audio.peak, `IT note ${note} should not clip.`).toBeLessThan(1);
      const stopPreview = editor.getByRole('button', { name: /Stop|Parar|Detener|Arr.ter/ });
      if (await stopPreview.isVisible().catch(() => false)) await stopPreview.click();
    }
    expect(Math.abs(measuredPitches.get(60) - 69)).toBeLessThan(0.5);
    expect(Math.abs(measuredPitches.get(48) - 57)).toBeLessThan(0.5);
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('passes the IT linear-slide header flag from the module editor into Preview', async () => {
  test.setTimeout(60_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-linear-ui-mode-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  let electronApp;
  try {
    fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
    const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
    fs.mkdirSync(musicDirectory, { recursive: true });
    const tracker = await loadTrackerModuleTools();
    let bytes = createItC5PitchFixture(60);
    bytes[0x2c] |= 0x08;
    bytes = tracker.updateItPatternEvent(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), 0, 2, 0,
      { note: 72, instrument: 0, effect: 7, parameter: 0x20 });
    const filename = 'it-linear-preview-mode.it';
    fs.writeFileSync(path.join(musicDirectory, filename), Buffer.from(new Uint8Array(bytes)));
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').getByText(filename, { exact: true }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    await editor.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const originalPlay = TrackerPreviewPlayer.prototype.play;
      TrackerPreviewPlayer.prototype.play = function (...args) {
        window.__itLinearUiPreviewAudit = { format: args[6], linearSlides: args[13] };
        window.__itLinearUiPreviewPlayer = this;
        return originalPlay.apply(this, args);
      };
    });
    await editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
    await expect.poll(() => editor.evaluate(() => window.__itLinearUiPreviewAudit ?? null), { timeout: 10_000 })
      .toEqual({ format: 'IT', linearSlides: true });
    await editor.evaluate(() => { window.__itLinearUiPreviewPlayer?.stop(); window.__itLinearUiPreviewPlayer = undefined; });
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('schedules IT Oxx as the exact Maxmod sample-frame offset', async () => {
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { trackerItMaxmodPlaybackRateScale } = await import('/src/utils/trackerItMaxmodPitch.ts');
      const sampleRate = 8_363;
      const sample = {
        samples: Float32Array.from({ length: 32_768 }, (_, index) => Math.sin(2 * Math.PI * 440 * index / sampleRate) * 0.25),
        sampleRate, loopStart: 0, loopEnd: 32_768, rootNote: 61, volume: 64, loopType: 1,
      };
      const rows = Array.from({ length: 5 }, () => []);
      rows[0][0] = { note: 60, instrument: 1, volume: 64, effect: 0, parameter: 0 };
      rows[4][0] = { note: 60, instrument: 1, volume: 64, effect: 15, parameter: 8 };
      const starts = [];
      const nativeStart = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when, offset = 0) {
        starts.push({ when, offset, bufferRate: this.buffer.sampleRate });
        return nativeStart.call(this, when, offset);
      };
      const player = new TrackerPreviewPlayer();
      try {
        await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
      } finally {
        player.stop();
        AudioBufferSourceNode.prototype.start = nativeStart;
      }
      const playbackScale = trackerItMaxmodPlaybackRateScale(sampleRate, sample.rootNote, sample.rootNote);
      return { starts, sampleRate, playbackScale, expectedSkippedFrames: 8 * 256 };
    });
    expect(audit.starts).toHaveLength(2);
    expect(audit.starts[0].offset).toBe(0);
    expect(audit.starts[1].offset * audit.sampleRate * audit.playbackScale).toBeCloseTo(audit.expectedSkippedFrames, 6);
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
  }
});
test('applies S3M and IT Txy tempo slides and tempo sets to row scheduling', async () => {
  test.setTimeout(45_000);
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const encodedFixtures = {
      S3M: createS3mMaxmodParityFixture().toString('base64'),
      IT: createItInstrumentAudioFixture().toString('base64'),
    };
    const results = await engine.evaluate(async fixtures => {
      const { analyzeTrackerPreview, parseTrackerPlaybackRows, parseS3mSamples, parseItSamples } = await import('/src/utils/trackerModule.ts');
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const measureFormat = async (format, encodedModule) => {
        const bytes = Uint8Array.from(atob(encodedModule), character => character.charCodeAt(0));
        const buffer = bytes.buffer;
        const samples = format === 'S3M' ? parseS3mSamples(buffer) : parseItSamples(buffer);
        const run = async parameter => {
          const rows = parseTrackerPlaybackRows(buffer, format, 64).map(row => row.map(event => event ? { ...event } : event));
          if (parameter !== null) rows[0][0] = { ...rows[0][0], effect: 20, parameter };
          const unsupportedEffects = analyzeTrackerPreview(format, rows, samples, 1).unsupportedEffects;
          const player = new TrackerPreviewPlayer();
          try {
            const durationMs = await player.play(rows, 1, 6, 125, [], samples, format);
            return { durationMs, unsupportedEffects };
          } finally {
            player.stop();
          }
        };
        return {
          control: await run(null),
          tempoSlideDown: await run(0x01),
          tempoSlideUp: await run(0x11),
          tempoSet: await run(0x96),
        };
      };
      return {
        S3M: await measureFormat('S3M', fixtures.S3M),
        IT: await measureFormat('IT', fixtures.IT),
      };
    }, encodedFixtures);
    console.log(`S3M/IT Txy timing scheduling: ${JSON.stringify(results)}.`);
    for (const format of ['S3M', 'IT']) {
      expect(results[format].tempoSlideDown.durationMs, `${format} T0x should reduce BPM on nonzero ticks.`).toBeGreaterThan(results[format].control.durationMs + 250);
      expect(results[format].tempoSlideUp.durationMs, `${format} T1x should increase BPM on nonzero ticks.`).toBeLessThan(results[format].control.durationMs - 250);
      expect(results[format].tempoSet.durationMs, `${format} Txx should set the BPM at tick zero.`).toBeLessThan(results[format].control.durationMs - 1_000);
      expect(results[format].tempoSlideDown.unsupportedEffects, `${format} T0x should be recognized by effect diagnostics.`).toEqual([]);
      expect(results[format].tempoSlideUp.unsupportedEffects, `${format} T1x should be recognized by effect diagnostics.`).toEqual([]);
      expect(results[format].tempoSet.unsupportedEffects, `${format} Txx should be recognized by effect diagnostics.`).toEqual([]);
    }
  } finally {
    if (electronApp) await electronApp.close();
  }
});

test('applies IT S0x and S1x fine volume changes to active and subsequent notes', async () => {
  test.setTimeout(45_000);
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp);
    const audit = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const pcm = new Float32Array(2_048);
      for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.sin((2 * Math.PI * 440 * index) / 8_363) * 0.25;
      const sample = { samples: pcm, sampleRate: 8_363, loopStart: 0, loopEnd: pcm.length, loopType: 1, rootNote: 60, volume: 64 };
      const rows = Array.from({ length: 17 }, () => []);
      rows[0] = [{ note: 60, instrument: 1, volume: 32, volumePresent: true, effect: 0, parameter: 0 }];
      rows[4] = [{ note: 0, instrument: 0, volume: 0, volumePresent: false, effect: 19, parameter: 0x08 }];
      rows[8] = [{ note: 60, instrument: 1, volume: 0, volumePresent: false, effect: 0, parameter: 0 }];
      rows[12] = [{ note: 0, instrument: 0, volume: 0, volumePresent: false, effect: 19, parameter: 0x12 }];
      rows[16] = [{ note: 60, instrument: 1, volume: 0, volumePresent: false, effect: 0, parameter: 0 }];
      const scheduled = [];
      const original = AudioParam.prototype.setValueAtTime;
      AudioParam.prototype.setValueAtTime = function (value, when) {
        scheduled.push({ value, when });
        return original.call(this, value, when);
      };
      const player = new TrackerPreviewPlayer();
      const durationMs = await player.play(rows, 1, 6, 125, [], new Map([[1, sample]]), 'IT');
      player.stop();
      AudioParam.prototype.setValueAtTime = original;
      return { durationMs, scheduledValues: scheduled.map(entry => entry.value) };
    });
    console.log(`IT S0x/S1x fine volume scheduling: ${JSON.stringify(audit)}.`);
    expect(audit.durationMs).toBeGreaterThan(2_000);
    expect(audit.scheduledValues).toContain(1.25);
    // The row-8 note has no volume column, so S12 applies to the sample default: 62/64.
    expect(audit.scheduledValues).toContain(62 / 64);
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
  }
});

test('schedules XM Txy tremor cuts on the Maxmod tick sequence', async () => {
  let electronApp;
  try {
    const projectFile = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example', 'sample_project.gbaproj');
    electronApp = await electron.launch({ args: [electronEntryPoint, projectFile] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const schedules = await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const createdGainParams = [];
      const writes = [];
      const createGain = AudioContext.prototype.createGain;
      const setValueAtTime = AudioParam.prototype.setValueAtTime;
      AudioContext.prototype.createGain = function (...args) {
        const gain = createGain.apply(this, args);
        createdGainParams.push(gain.gain);
        return gain;
      };
      AudioParam.prototype.setValueAtTime = function (value, when) {
        if (createdGainParams.includes(this)) writes.push({ param: this, value, when });
        return setValueAtTime.call(this, value, when);
      };
      const player = new TrackerPreviewPlayer();
      try {
        const rows = [[{ note: 0, instrument: 0, volume: 0, effect: 0x14, parameter: 0x21 }], [], []];
        await player.play(rows, 1, 6, 125, [], new Map(), 'XM');
      } finally {
        player.stop();
        AudioContext.prototype.createGain = createGain;
        AudioParam.prototype.setValueAtTime = setValueAtTime;
      }
      return createdGainParams.map(param => writes.filter(write => write.param === param).map(write => write.value));
    });
    expect(schedules).toContainEqual([1, 0, 1, 0, 1, 0, 1, 1]);
  } finally {
    await electronApp?.close().catch(() => {});
  }
});

test('matches Maxmod XM E0x and EFx controls as audio no-ops', async () => {
  test.setTimeout(240_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-xm-e0-ef-maxmod-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  const filename = 'xm-filter-funk-noop.xm';
  const tracker = await loadTrackerModuleTools();
  const baseBytes = createXmLoopFixture(1);
  const baseBuffer = baseBytes.buffer.slice(baseBytes.byteOffset, baseBytes.byteOffset + baseBytes.byteLength);
  const effectBytes = tracker.updateXmPatternEvents(baseBuffer, 0, [
    { row: 20, channel: 0, patch: { note: 49, instrument: 1, effect: 0x0e, parameter: 0x00 } },
    { row: 32, channel: 0, patch: { note: 97, instrument: 0, effect: 0, parameter: 0 } },
    { row: 36, channel: 0, patch: { note: 49, instrument: 1, effect: 0x0e, parameter: 0xf1 } },
    { row: 48, channel: 0, patch: { note: 97, instrument: 0, effect: 0, parameter: 0 } },
  ]);
  fs.writeFileSync(path.join(musicDirectory, filename), Buffer.from(new Uint8Array(effectBytes)));
  let electronApp;
  let emulator;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    await electronApp.context().addInitScript(installBrowserPreviewAudioTap);
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').getByText(filename, { exact: true }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    await expect(engine.getByTestId('right-panel-scroll').getByText('XM', { exact: true })).toBeVisible();
    const browserDiagnostics = await engine.evaluate(async encoded => {
      const { analyzeTrackerPreview, parseXmPatternRows, parseXmSamples } = await import('/src/utils/trackerModule.ts');
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const rows = parseXmPatternRows(bytes.buffer, 0, 64);
      return { rows, diagnostics: analyzeTrackerPreview('XM', rows, parseXmSamples(bytes.buffer)) };
    }, Buffer.from(new Uint8Array(effectBytes)).toString('base64'));
    expect(browserDiagnostics.rows[20][0]).toMatchObject({ effect: 0x0e, parameter: 0x00 });
    expect(browserDiagnostics.rows[36][0]).toMatchObject({ effect: 0x0e, parameter: 0xf1 });
    expect(browserDiagnostics.diagnostics.unsupportedEffects).not.toContain(0x0e);
    await editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
    await engine.waitForTimeout(6_900);
    const browserAudio = await engine.evaluate(finishAudioCapture, 'pitch-segments');
    const maxmodButton = editor.getByRole('button', { name: /Play ROM/ });
    await maxmodButton.click({ timeout: 10_000 });
    await waitForMaxmodPreviewStatus(editor, 180_000);
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.gameManager)), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => emulator.evaluate(() => window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx?.state), { timeout: 30_000 }).toBe('running');
    await expect.poll(() => emulator.evaluate(() => Object.values(window.EJS_emulator?.Module?.AL?.currentCtx?.sources ?? {}).some(source => source?.gain && typeof source.gain.connect === 'function')), { timeout: 30_000 }).toBe(true);
    const openAlTap = await emulator.evaluate(installEmulatorOpenALTap);
    expect(openAlTap).toBeTruthy();
    expect(openAlTap.captureType).toBe('AudioWorklet');
    await emulator.evaluate(() => {
      const capture = window.__musicOpenALCapture;
      if (!capture) throw new Error('The Maxmod OpenAL tap was not installed.');
      capture.trimStartTime = capture.context.currentTime;
      window.EJS_emulator?.gameManager?.restart();
    });
    await expect.poll(() => emulator.evaluate(() => window.__musicOpenALCapture?.chunks.some(([left, right]) =>
      left.some(sample => Math.abs(sample) > 0.001) || right.some(sample => Math.abs(sample) > 0.001))), { timeout: 12_000 })
      .toBe(true);
    await emulator.waitForTimeout(6_900);
    const maxmodAudio = await emulator.evaluate(finishAudioCapture, 'pitch-segments');
    const measureRegions = audio => {
      const regions = [[0.2, 1.4], [2.6, 3.6], [4.5, 5.5]];
      return regions.map(([from, to]) => {
        const rms = audio.rmsSegments.filter(segment => segment.time >= from && segment.time < to).map(segment => segment.rms);
        const pitch = audio.pitchSegments.filter(segment => segment.time >= from && segment.time < to && Number.isFinite(segment.pitch)).map(segment => segment.pitch);
        return {
          rms: rms.reduce((sum, value) => sum + value, 0) / Math.max(1, rms.length),
          pitch: pitch.reduce((sum, value) => sum + value, 0) / Math.max(1, pitch.length),
          rmsWindows: rms.length,
          pitchWindows: pitch.length,
        };
      });
    };
    const browserRegions = measureRegions(browserAudio);
    const maxmodRegions = measureRegions(maxmodAudio);
    const ratios = regions => regions.slice(1).map(region => region.rms / Math.max(1e-9, regions[0].rms));
    const pitchDeltas = regions => regions.slice(1).map(region => Math.abs(region.pitch - regions[0].pitch));
    console.log(`XM E0x/EFx Maxmod no-op control: ${JSON.stringify({ browser: browserRegions, maxmod: maxmodRegions, browserRmsRatios: ratios(browserRegions), maxmodRmsRatios: ratios(maxmodRegions), browserPitchDeltas: pitchDeltas(browserRegions), maxmodPitchDeltas: pitchDeltas(maxmodRegions) })}.`);
    for (const [index, region] of [...browserRegions, ...maxmodRegions].entries()) {
      expect(region.rmsWindows, `audio region ${index} should contain measured PCM windows`).toBeGreaterThan(4);
    }
    for (const region of browserRegions) expect(region.pitchWindows).toBeGreaterThan(4);
    for (const ratio of [...ratios(browserRegions), ...ratios(maxmodRegions)]) {
      expect(ratio).toBeGreaterThan(0.75);
      expect(ratio).toBeLessThan(1.25);
    }
    for (const delta of pitchDeltas(browserRegions)) expect(delta).toBeLessThan(0.5);
  } finally {
    if (emulator && !emulator.isClosed()) await emulator.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});


test('plays a writer-edited real IT sample-mode pattern through Maxmod', async () => {
  test.setTimeout(120_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-edited-rom-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  const sourceItPath = path.join(repositoryRoot, 'templateEngineGame', 'shooter_game', 'assets', 'musics', 'minor_boss_r.it');
  const sourceIt = fs.readFileSync(sourceItPath);
  const tracker = await loadTrackerModuleTools();
  const sourceItBuffer = sourceIt.buffer.slice(sourceIt.byteOffset, sourceIt.byteOffset + sourceIt.byteLength);
  const patternIndex = tracker.parseTrackerOrderTable(sourceItBuffer, 'IT').find(pattern => pattern < tracker.parseTrackerModule(sourceItBuffer, 'IT').patterns);
  const rows = tracker.parseItPatternRows(sourceItBuffer, patternIndex, 256);
  const samples = tracker.parseItSamples(sourceItBuffer);
  const note = rows.flatMap((row, rowIndex) => row.map((event, channelIndex) => ({ event, rowIndex, channelIndex })))
    .find(({ event }) => event.note > 0 && event.note < 254 && event.instrument > 0 && samples.get(event.instrument)?.samples.length);
  if (!note) throw new Error('The original sample-mode IT did not contain a playable decoded sample event.');
  const editedBytes = tracker.updateItPatternEvent(sourceItBuffer, patternIndex, note.rowIndex, note.channelIndex, { note: note.event.note + 1 });
  const editedItPath = path.join(musicDirectory, 'edited-full-song.it');
  fs.writeFileSync(editedItPath, new Uint8Array(editedBytes));
  let electronApp;
  let emulator;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp);
    await engine.getByRole('listitem').getByText('edited-full-song.it', { exact: true }).click();
    const editor = engine.getByLabel('Music beat editor');
    await expect(editor).toBeVisible();
    await expect(engine.getByTestId('right-panel-scroll').getByText('IT', { exact: true })).toBeVisible();
    await editor.getByRole('button', { name: /Play ROM/ }).click();
    await waitForMaxmodPreviewStatus(editor, 60_000);
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 30_000 }).toBe(1);
    emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!emulator) throw new Error('The edited IT ROM did not open in the emulator.');
    await expect.poll(() => emulator.evaluate(() => window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx?.state), { timeout: 30_000 }).toBe('running');
    const tap = await emulator.evaluate(installEmulatorOpenALTap);
    expect(tap).toBeTruthy();
    await expect.poll(() => emulator.evaluate(() => Boolean(window.__musicOpenALCapture?.chunks.some(([left, right]) =>
      left.some(sample => Math.abs(sample) > 0.001) || right.some(sample => Math.abs(sample) > 0.001)))), { timeout: 10_000 }).toBe(true);
    await emulator.waitForTimeout(1_200);
    const audio = await emulator.evaluate(finishAudioCapture, 'openal');
    console.log(`Edited real IT sample-mode ROM capture: ${JSON.stringify({ patternIndex, row: note.rowIndex, channel: note.channelIndex, sample: note.event.instrument, noteBefore: note.event.note, noteAfter: note.event.note + 1, rms: audio.rms, activeRms: audio.activeRms, activeDuration: audio.activeDuration, peak: audio.peak })}.`);
    expect(audio.rms).toBeGreaterThan(0.0001);
    expect(audio.activeRms).toBeGreaterThan(0.001);
    expect(audio.activeDuration).toBeGreaterThan(0.25);
    expect(audio.peak).toBeLessThan(1);
  } finally {
    if (emulator && !emulator.isClosed()) await emulator.close().catch(() => {});
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('plays the isolated real IT sample-mode stem through Maxmod', async () => {
  test.setTimeout(120_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-isolated-rom-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  const original = fs.readFileSync(path.join(repositoryRoot, 'templateEngineGame', 'shooter_game', 'assets', 'musics', 'minor_boss_r.it'));
  const isolated = await createIsolatedModuleStem(original, 'IT');
  fs.writeFileSync(path.join(musicDirectory, 'isolated-sample-mode.it'), isolated.bytes);
  let electronApp;
  let emulator;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').getByText('isolated-sample-mode.it', { exact: true }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    await expect(engine.getByTestId('right-panel-scroll').getByText('IT', { exact: true })).toBeVisible();
    await engine.evaluate(installBrowserPreviewAudioTap);
    await editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
    await expect.poll(() => engine.evaluate(() => window.__musicPreviewCapture?.chunks.length ?? 0), { timeout: 10_000 }).toBeGreaterThan(0);
    await engine.waitForTimeout(2_000);
    const structuralAudio = await engine.evaluate(finishAudioCapture, 'pitch-segments');
    const stopPreview = editor.getByRole('button', { name: /Stop|Parar|Detener|Arr.ter/ });
    if (await stopPreview.isVisible().catch(() => false)) await stopPreview.click();
    expect(structuralAudio.rms).toBeGreaterThan(0.0001);
    expect(structuralAudio.peak).toBeLessThan(1);

    await editor.getByRole('button', { name: /Play ROM/ }).click();
    await waitForMaxmodPreviewStatus(editor, 60_000);
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 30_000 }).toBe(1);
    emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!emulator) throw new Error('The isolated IT stem ROM did not open.');
    await expect.poll(() => emulator.evaluate(() => window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx?.state), { timeout: 30_000 }).toBe('running');
    expect(await emulator.evaluate(installEmulatorOpenALTap)).toBeTruthy();
    await expect.poll(() => emulator.evaluate(() => Boolean(window.__musicOpenALCapture?.chunks.some(([left, right]) =>
      left.some(sample => Math.abs(sample) > 0.001) || right.some(sample => Math.abs(sample) > 0.001)))), { timeout: 10_000 }).toBe(true);
    await emulator.waitForTimeout(2_000);
    const audio = await emulator.evaluate(finishAudioCapture, 'pitch-segments');
    const onsetSummary = capture => ({ onsetIntervals: capture.onsetIntervals, toneOnsetTimes: capture.toneOnsetTimes, toneOnsetIntervals: capture.toneOnsetTimes.slice(1).map((time, index) => time - capture.toneOnsetTimes[index]) });
    const stablePulseTimes = capture => {
      let best = [];
      for (let start = 0; start < capture.toneOnsetTimes.length; start += 1) {
        const chain = [capture.toneOnsetTimes[start]];
        while (true) {
          const previous = chain[chain.length - 1];
          const next = capture.toneOnsetTimes
            .filter(time => time > previous && Math.abs((time - previous) - isolated.marker.expectedIntervalSeconds) <= 0.08)
            .sort((left, right) => Math.abs((left - previous) - isolated.marker.expectedIntervalSeconds) - Math.abs((right - previous) - isolated.marker.expectedIntervalSeconds))[0];
          if (next === undefined) break;
          chain.push(next);
        }
        if (chain.length > best.length) best = chain;
      }
      return best;
    };
    const structuralPulseTimes = stablePulseTimes(structuralAudio);
    const romPulseTimes = stablePulseTimes(audio);
    const pulseIntervals = times => times.slice(1).map((time, index) => time - times[index]);
    const structuralPulseIntervals = pulseIntervals(structuralPulseTimes);
    const romPulseIntervals = pulseIntervals(romPulseTimes);
    const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    const pulseRms = (capture, pulseTimes) => pulseTimes.map(onset => {
      const candidates = (capture.stereoRmsSegments ?? []).filter(segment => segment.time >= onset + 0.04 && segment.time <= onset + 0.14);
      return candidates.sort((left, right) => Math.abs(left.time - (onset + 0.08)) - Math.abs(right.time - (onset + 0.08)))[0]?.rms;
    }).filter(Number.isFinite);
    const structuralPulseRms = pulseRms(structuralAudio, structuralPulseTimes);
    const romPulseRms = pulseRms(audio, romPulseTimes);
    expect(structuralPulseRms.length).toBeGreaterThanOrEqual(1);
    expect(romPulseRms.length).toBeGreaterThanOrEqual(1);
    const rmsRatio = mean(structuralPulseRms) / mean(romPulseRms);
    const pitchDelta = structuralAudio.autocorrelationPitch - audio.autocorrelationPitch;
    console.log(`Rewritten isolated IT stem comparison: ${JSON.stringify({ marker: isolated.marker, rmsRatio, pitchDelta, structural: { rms: structuralAudio.rms, activeRms: structuralAudio.activeRms, stereoActiveRms: structuralAudio.stereoActiveRms, activeDuration: structuralAudio.activeDuration, peak: structuralAudio.peak, estimatedPitch: structuralAudio.estimatedPitch, harmonicPitch: structuralAudio.harmonicPitch, autocorrelationPitch: structuralAudio.autocorrelationPitch, pulseIntervals: structuralPulseIntervals, ...onsetSummary(structuralAudio) }, rom: { rms: audio.rms, activeRms: audio.activeRms, stereoActiveRms: audio.stereoActiveRms, activeDuration: audio.activeDuration, peak: audio.peak, estimatedPitch: audio.estimatedPitch, harmonicPitch: audio.harmonicPitch, autocorrelationPitch: audio.autocorrelationPitch, pulseIntervals: romPulseIntervals, ...onsetSummary(audio) } })}.`);
    expect(audio.rms).toBeGreaterThan(0.0001);
    expect(audio.activeRms).toBeGreaterThan(0.001);
    expect(audio.activeDuration).toBeGreaterThan(0.25);
    expect(audio.peak).toBeLessThan(1);
    expect(structuralPulseIntervals.length).toBeGreaterThanOrEqual(1);
    expect(romPulseIntervals.length).toBeGreaterThanOrEqual(1);
    for (const interval of [...structuralPulseIntervals, ...romPulseIntervals]) {
      expect(Math.abs(interval - isolated.marker.expectedIntervalSeconds)).toBeLessThanOrEqual(0.08);
    }
    const meanInterval = intervals => intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    expect(Math.abs(meanInterval(structuralPulseIntervals) - meanInterval(romPulseIntervals))).toBeLessThanOrEqual(0.04);
    expect(rmsRatio).toBeGreaterThan(0.8);
    expect(rmsRatio).toBeLessThan(1.25);
    expect(Math.abs(pitchDelta)).toBeLessThan(0.5);
  } finally {
    if (emulator && !emulator.isClosed()) await emulator.close().catch(() => {});
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});






test('matches explicit S3M note volume independently of the sample default', async () => {
  test.setTimeout(240_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-s3m-note-volume-override-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  const fixtures = [
    { filename: 's3m-note-volume-sample-64.s3m', sampleVolume: 64 },
    { filename: 's3m-note-volume-sample-16.s3m', sampleVolume: 16 },
  ];
  for (const fixture of fixtures) fs.writeFileSync(path.join(musicDirectory, fixture.filename), createS3mMaxmodParityFixture(fixture.sampleVolume, 32));
  let electronApp;
  let activeEmulator;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    await electronApp.context().addInitScript(installBrowserPreviewAudioTap);
    const engine = await openMusicLibrary(electronApp);
    const captures = [];
    for (const fixture of fixtures) {
      await engine.getByRole('listitem').getByText(fixture.filename, { exact: true }).click();
      const editor = engine.getByLabel('Music beat editor');
      await expect(editor).toBeVisible();
      await engine.evaluate(() => { if (window.__musicPreviewCapture) window.__musicPreviewCapture.chunks.length = 0; });
      await editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
      await expect.poll(() => engine.evaluate(() => window.__musicPreviewCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(60);
      const structural = await engine.evaluate(finishAudioCapture, 'sync');
      await editor.getByRole('button', { name: /Play ROM/ }).click();
      await waitForMaxmodPreviewStatus(editor, 120_000);
      await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
      const emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
      if (!emulator) throw new Error(`${fixture.filename} Maxmod emulator did not open.`);
      activeEmulator = emulator;
      await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx)), { timeout: 30_000 }).toBe(true);
      expect(await emulator.evaluate(installEmulatorOpenALTap)).toBeTruthy();
      await expect.poll(() => emulator.evaluate(() => window.__musicOpenALCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(60);
      const rom = await emulator.evaluate(finishAudioCapture, 'openal');
      await emulator.close();
      activeEmulator = undefined;
      await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length).toBe(0);
      await engine.bringToFront();
      captures.push({ sampleVolume: fixture.sampleVolume, structuralRms: structural.activeRms, romRms: rom.activeRms, previewRomRatio: structural.activeRms / Math.max(1e-9, rom.activeRms) });
    }
    const [default64, default16] = captures;
    const structuralRatio = default16.structuralRms / default64.structuralRms;
    const romRatio = default16.romRms / default64.romRms;
    captures.forEach(capture => {
      expect(capture.previewRomRatio, `S3M note volume with sample default ${capture.sampleVolume} preview/ROM level`).toBeGreaterThan(0.8);
      expect(capture.previewRomRatio, `S3M note volume with sample default ${capture.sampleVolume} preview/ROM level`).toBeLessThan(1.25);
    });    console.log(`S3M explicit volume-column override: ${JSON.stringify({ captures, structuralRatio, romRatio })}.`);
    expect(default64.structuralRms).toBeGreaterThan(0.001);
    expect(default16.structuralRms).toBeGreaterThan(0.001);
    expect(default64.romRms).toBeGreaterThan(0.001);
    expect(default16.romRms).toBeGreaterThan(0.001);
    expect(structuralRatio).toBeGreaterThan(0.8);
    expect(structuralRatio).toBeLessThan(1.25);
    expect(romRatio).toBeGreaterThan(0.8);
    expect(romRatio).toBeLessThan(1.25);
  } finally {
    if (activeEmulator) await activeEmulator.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('creates empty modules using their selected MOD, XM, S3M, or IT format', async () => {
  test.setTimeout(60_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-format-create-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const musicLeftPanel = engine;
    const createButton = musicLeftPanel.getByRole('button', { name: /^(Create music|Criar m.sica)$/ });
    const searchButton = musicLeftPanel.getByRole('button', { name: /Search music|Buscar m.sicas|Rechercher/ });
    await expect(createButton).toBeVisible();
    await expect(searchButton).toBeVisible();
    await searchButton.click();
    const musicSearch = musicLeftPanel.getByPlaceholder(/Search.*music|Buscar.*m.sicas|Rechercher/);
    await expect(musicSearch).toBeVisible();
    await musicSearch.fill('music-search-no-match');
    await expect(musicLeftPanel.getByText(/No resources found|Nenhum recurso encontrado|No se encontraron recursos|Aucune ressource trouvée/)).toBeVisible();
    await searchButton.click();
    for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
      await createButton.click();
      await engine.getByRole('menuitem').filter({ hasText: new RegExp(`${format} \\(\\.${format.toLowerCase()}\\)`) }).click();
      const discardBeforeNewFormat = engine.getByRole('button', { name: /Continue without saving|Continuar sem salvar/ });
      if (format !== 'MOD') {
        await expect(discardBeforeNewFormat).toBeVisible();
        await discardBeforeNewFormat.click();
      }
      await expect(engine.getByTestId('right-panel-scroll').getByText(format, { exact: true })).toBeVisible();
      const editor = engine.getByLabel('Music beat editor');
      const addInstrument = engine.getByRole('button', { name: /Add instrument|Adicionar instrumento/ });
      const replaceSample = engine.getByRole('button', { name: /Replace selected sample with audio|Substituir sample selecionado por áudio/ });
      await expect(replaceSample).toBeEnabled();
      await expect(addInstrument).toBeEnabled();
      await addInstrument.click();
      await expect(engine.getByRole('button', { name: /^02:/ })).toBeVisible();
      await expect(editor).toBeVisible();
      await expect(editor.getByText(new RegExp(format + '.*channels'))).toBeVisible();
      const maxmod = editor.getByRole('button', { name: /Play ROM/ });
      await expect(maxmod).toBeEnabled();
      const addPattern = editor.getByTestId('music-add-pattern');
      if (format === 'XM') await expect(addPattern).toBeEnabled();
      else {
        await expect(addPattern).toBeDisabled();
        await addPattern.hover();
        await expect(engine.getByRole('tooltip').filter({ hasText: /pattern and order editing is unavailable/ })).toBeVisible();
      }
      await editor.getByText('Piano roll', { exact: true }).click();
      const roll = editor.locator('.gba-beat-scroll');
      await expect(roll.locator('.gba-beat-grid')).toBeVisible();
      const grid = roll.locator('.gba-beat-grid');
      const rollFill = await roll.evaluate(element => {
        const gridBounds = element.querySelector('.gba-beat-grid').getBoundingClientRect();
        const viewportBounds = element.getBoundingClientRect();
        return { contentHeight: element.scrollHeight, viewportHeight: element.clientHeight, gridBottom: gridBounds.bottom, viewportBottom: viewportBounds.bottom };
      });
      expect(rollFill.contentHeight).toBeGreaterThan(rollFill.viewportHeight);
      expect(rollFill.gridBottom).toBeGreaterThanOrEqual(rollFill.viewportBottom - 12);
      const gridBox = await grid.boundingBox();
      if (!gridBox) throw new Error(`${format} shared piano roll grid is not visible.`);
      const noteY = gridBox.y + gridBox.height / 2;
      await engine.mouse.move(gridBox.x + 2 * 20 + 10, noteY);
      await engine.mouse.down();
      await engine.mouse.move(gridBox.x + 5 * 20 + 10, noteY);
      await expect(editor.locator('.gba-beat-note.drag-preview')).toBeVisible();
      await engine.mouse.up();
      // A new canonical project starts with one order entry in every format.
      await expect(grid.locator('[data-note="true"]')).toHaveCount(1);
      const note = grid.locator('[data-note="true"]').first();
      const noteBox = await note.boundingBox();
      if (!noteBox) throw new Error(`${format} shared piano roll note is not visible.`);
      const oldLeft = Number.parseFloat(await note.evaluate(element => element.style.left));
      const moveX = noteBox.x + noteBox.width / 2;
      const moveY = noteBox.y + noteBox.height / 2;
      await engine.mouse.move(moveX, moveY);
      await engine.mouse.down();
      await engine.mouse.move(moveX + 40, moveY + 12);
      await expect(editor.locator('.gba-beat-note.drag-preview')).toBeVisible();
      await expect(note).toHaveCSS('opacity', '0');
      await engine.mouse.up();
      const movedLeft = Number.parseFloat(await note.evaluate(element => element.style.left));
      expect(movedLeft).toBe(oldLeft + 40);
      const movedBox = await note.boundingBox();
      if (!movedBox) throw new Error(`${format} moved piano roll note is not visible.`);
      const oldWidth = Number.parseFloat(await note.evaluate(element => element.style.width));
      await engine.mouse.move(movedBox.x + movedBox.width - 2, movedBox.y + movedBox.height / 2);
      expect(await note.evaluate(element => getComputedStyle(element, '::after').cursor)).toBe('ew-resize');
      await engine.mouse.down();
      await engine.mouse.move(movedBox.x + movedBox.width + 18, movedBox.y + movedBox.height / 2);
      await expect(editor.locator('.gba-beat-note.drag-preview')).toBeVisible();
      await engine.mouse.up();
      const resizedWidth = Number.parseFloat(await note.evaluate(element => element.style.width));
      expect(resizedWidth).toBe(oldWidth + 20);
    }
  } finally {
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});
test('keeps the Music Editor panels and piano roll usable at desktop and compact widths', async () => {
  test.setTimeout(60_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-layout-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('button', { name: /^(Create music|Criar m.sica)$/ }).click();
    await engine.getByRole('menuitem').filter({ hasText: /XM \(\.xm\)/ }).click();
    const editor = engine.getByLabel('Music beat editor');
    await expect(editor).toBeVisible();
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1080, height: 760 }, { width: 1024, height: 700 }]) {
      await engine.setViewportSize(viewport);
      await expect(editor).toBeVisible();
      await expect(engine.getByTestId('right-panel-scroll')).toBeVisible();
      await expect(engine.getByRole('button', { name: 'CHANNELS', exact: true })).toBeVisible();
      await expect(engine.getByRole('button', { name: 'INSTRUMENTS', exact: true })).toBeVisible();
      await editor.getByText('Piano roll', { exact: true }).click();
      const roll = editor.locator('.gba-beat-scroll');
      const bounds = await engine.evaluate(() => {
        const editorElement = document.querySelector('[aria-label="Music beat editor"]');
        const rollElement = editorElement?.querySelector('.gba-beat-scroll');
        const gridElement = rollElement?.querySelector('.gba-beat-grid');
        const rect = element => {
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
        };
        return {
          viewportWidth: document.documentElement.clientWidth,
          documentWidth: document.documentElement.scrollWidth,
          editor: rect(editorElement),
          roll: rect(rollElement),
          grid: rect(gridElement),
          left: rect(document.querySelector('[aria-label="CHANNELS"]')?.closest('.ant-splitter-panel')),
          right: rect(document.querySelector('[data-testid="right-panel-scroll"]')?.closest('.ant-splitter-panel')),
        };
      });
      console.log(`Music Editor layout ${viewport.width}px: ${JSON.stringify(bounds)}.`);
      expect(bounds.documentWidth).toBeLessThanOrEqual(bounds.viewportWidth + 2);
      expect(bounds.editor?.width).toBeGreaterThanOrEqual(520);
      expect(bounds.roll?.width).toBeGreaterThan(0);
      expect(bounds.grid?.width).toBeGreaterThan(0);
      expect(bounds.grid?.bottom).toBeGreaterThanOrEqual(bounds.roll.bottom - 12);
      expect(bounds.left?.right).toBeLessThanOrEqual(bounds.editor.left + 12);
      expect(bounds.right?.left).toBeGreaterThanOrEqual(bounds.editor.right - 12);
      await expect(roll.locator('.gba-beat-grid')).toBeVisible();
    }
    const instrumentsHeader = engine.getByRole('button', { name: 'INSTRUMENTS', exact: true });
    if (await instrumentsHeader.getAttribute('aria-expanded') === 'false') await instrumentsHeader.click();
    await engine.getByRole('button', { name: /Add instrument|Adicionar instrumento|Añadir instrumento|Ajouter un instrument/ }).click();
    await engine.getByRole('button', { name: /Instrument 02|02: Sine Lead/ }).click();
    await engine.getByRole('tab', { name: /Settings|Configurações|Ajustes|Paramètres/ }).click();
    await expect(engine.getByRole('slider', { name: /Sample volume|Volume da amostra|Volumen de muestra|Volume de l’échantillon/ })).toBeVisible();
    await expect(engine.getByRole('slider', { name: /Sample pan|Pan da amostra|Pan de muestra|Pan de l’échantillon/ })).toBeVisible();
    await engine.getByRole('tab', { name: 'Sample', exact: true }).click();
    const instrumentWaveform = engine.getByRole('img', { name: /Instrument sample waveform|Forma de onda do sample do instrumento|Forma de onda del sample del instrumento/ });
    await expect(instrumentWaveform).toBeVisible();
    await expect(engine.getByRole('button', { name: /Normalize|Normalizar/ })).toBeVisible();
    const waveformPeakHeight = () => instrumentWaveform.locator('rect').evaluateAll(rects => Math.max(...rects.map(rect => Number(rect.getAttribute('height') ?? 0))));
    const originalWaveformPeak = await waveformPeakHeight();
    expect(originalWaveformPeak).toBeLessThan(56);
    await engine.getByRole('button', { name: /Normalize|Normalizar/ }).click();
    await expect.poll(waveformPeakHeight).toBeGreaterThan(55);
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+z');
    await expect.poll(waveformPeakHeight).toBe(originalWaveformPeak);
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+Shift+z');
    await expect.poll(waveformPeakHeight).toBeGreaterThan(55);
    const addInstrumentButton = engine.getByRole('button', { name: /Add instrument|Adicionar instrumento|A.*adir instrumento|Ajouter un instrument/ });
    const addPresetMenuButton = addInstrumentButton.locator('..').getByRole('button').last();
    await addPresetMenuButton.click();
    await engine.getByRole('menuitem', { name: /Triangle bass|Baixo triangular|Bajo triangular|Basse triangulaire/ }).click();
    await expect(engine.getByRole('button', { name: /Instrument 03|03: Triangle Bass/ })).toBeVisible();
    await engine.getByRole('button', { name: 'Channel 01', exact: true }).click();
    const channelVolumeDial = engine.getByRole('slider', { name: 'Music channel volume dial' });
    const channelVolumeFader = engine.getByRole('slider', { name: 'Music channel volume fader' });
    await expect(channelVolumeDial).toBeVisible();
    await expect(channelVolumeFader).toBeVisible();
    const dialShadow = await channelVolumeDial.evaluate(element => getComputedStyle(element).boxShadow);
    expect(dialShadow).not.toBe('none');
    await channelVolumeDial.focus();
    await channelVolumeDial.press('Home');
    await channelVolumeDial.press('ArrowRight');
    await expect(channelVolumeFader).toHaveAttribute('aria-valuenow', '1');
    await channelVolumeDial.press('End');
    await expect(channelVolumeFader).toHaveAttribute('aria-valuenow', '100');
    const channelPanDial = engine.getByRole('slider', { name: 'Music channel pan dial' });
    await expect(channelPanDial).toBeVisible();
    await channelPanDial.press('End');
    await expect(channelPanDial).toHaveAttribute('aria-valuenow', '1');
    await channelVolumeFader.press('Home');
    await expect(channelVolumeFader).toHaveAttribute('aria-valuenow', '0');
    await channelVolumeFader.press('End');
    await expect(channelVolumeFader).toHaveAttribute('aria-valuenow', '100');
    await engine.evaluate(encoded => { const binary = atob(encoded); const wav = Uint8Array.from(binary, character => character.charCodeAt(0)); const file = new File([wav], 'layout-sample.wav', { type: 'audio/wav' }); window.dispatchEvent(new CustomEvent('gba-studio:music-editor-import-audio', { detail: { file } })); }, createWavFixture().toString('base64'));
    await expect(engine.getByRole('img', { name: /Audio sample waveform|Forma de onda do áudio|Forma de onda del audio|Forme d’onde audio/ })).toBeVisible();
    await expect(engine.getByText(/GBA sample for XM:|Sample GBA para XM:|Muestra GBA para XM:|Sample GBA pour XM :/)).toBeVisible();
    await expect(engine.getByText(/XM stores delta-coded 8-bit PCM|XM armazena PCM delta de 8-bit|XM almacena PCM delta de 8 bits|XM stocke du PCM delta 8 bits/)).toBeVisible();
    await expect(engine.getByText(/Module file size: .* → .* bytes \(.* bytes\)|Tamanho do módulo: .* → .* bytes \(.* bytes\)|Tamaño del módulo: .* → .* bytes \(.* bytes\)|Taille du module : .* → .* octets \(.* octets\)/)).toBeVisible();
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1080, height: 760 }, { width: 1024, height: 700 }]) {
      await engine.setViewportSize(viewport);
      const sampleDialog = engine.getByRole('dialog');
      await expect.poll(() => sampleDialog.evaluate(dialog => dialog.getBoundingClientRect().width), { timeout: 2_000 }).toBeGreaterThan(300);
      const dialogBounds = await sampleDialog.evaluate(dialog => {
        const box = dialog.getBoundingClientRect();
        const content = dialog.querySelector('.ant-modal-content');
        return { left: box.left, right: box.right, width: box.width, scrollWidth: content?.scrollWidth ?? 0, clientWidth: content?.clientWidth ?? 0 };
      });
      console.log(`Music sample preparation dialog ${viewport.width}px: ${JSON.stringify(dialogBounds)}.`);
      expect(dialogBounds.left).toBeGreaterThanOrEqual(0);
      expect(dialogBounds.right).toBeLessThanOrEqual(viewport.width);
      expect(dialogBounds.scrollWidth).toBeLessThanOrEqual(dialogBounds.clientWidth + 1);
      await expect(engine.getByLabel(/Remove DC offset|Remover componente DC|Quitar componente DC|Supprimer la composante continue/)).toBeVisible();
      await expect(engine.getByLabel(/Fade-in|Fundido de entrada|Fondu d’entrée/)).toBeVisible();
      await expect(engine.getByLabel(/Fade-out|Fundido de salida|Fondu de sortie/)).toBeVisible();
    }
    await engine.getByRole('button', { name: /Add to instrument|Adicionar ao instrumento|A�adir al instrumento|Ajouter � n��y��y�instrument/ }).click();
  } finally {
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('edits and trims PCM from the responsive Sample Editor', async () => {
  test.setTimeout(120_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-sample-editor-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  fs.writeFileSync(path.join(musicDirectory, 'sample-editor.xm'), createXmLoopFixture(1));
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp);
    await engine.getByRole('listitem').getByText('sample-editor.xm', { exact: true }).click();
    const editor = engine.getByLabel('Music beat editor');
    await engine.getByRole('button', { name: /Open Sample Editor|Abrir editor de sample|Abrir editor de muestra|Ouvrir l’éditeur de sample/ }).click();
    const dialog = engine.getByRole('dialog');
    const waveform = dialog.locator('.gba-sample-editor-wave-wrap svg');
    await expect(waveform).toBeVisible();
    await expect(dialog.locator('.gba-sample-editor-controls .ant-tag')).toHaveCount(3);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1080, height: 760 }, { width: 1024, height: 700 }]) {
      await engine.setViewportSize(viewport);
      const bounds = await dialog.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const content = element.querySelector('.ant-modal-content');
        return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: content?.scrollWidth ?? 0, clientWidth: content?.clientWidth ?? 0 };
      });
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(viewport.width);
      expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth + 1);
      await expect(waveform).toBeVisible();
    }
    const zoom = dialog.getByRole('slider', { name: /Waveform zoom|Zoom da forma de onda|Zoom de la forma de onda|Zoom de la forme d’onde/ });
    await zoom.focus();
    await engine.keyboard.press('ArrowRight');
    await expect(zoom).toHaveAttribute('aria-valuenow', '2');
    const waveBounds = await waveform.boundingBox();
    if (!waveBounds) throw new Error('Sample Editor waveform is not measurable.');
    await engine.mouse.move(waveBounds.x + waveBounds.width * 0.1, waveBounds.y + waveBounds.height * 0.5);
    await engine.mouse.down();
    await engine.mouse.move(waveBounds.x + waveBounds.width * 0.9, waveBounds.y + waveBounds.height * 0.5);
    await engine.mouse.up();
    const frameMetric = await dialog.locator('.gba-sample-editor-controls .ant-tag').first().innerText();
    const selectedFrames = Number((frameMetric.match(/[\d.,]+/)?.[0] ?? '0').replace(/[.,]/g, ''));
    expect(selectedFrames).toBeGreaterThan(100);
    expect(selectedFrames).toBeLessThan(1_024);
    await dialog.getByText(/Draw frames|Desenhar frames|Dibujar frames|Dessiner des frames/).click();
    await engine.mouse.move(waveBounds.x + waveBounds.width * 0.34, waveBounds.y + waveBounds.height * 0.15);
    await engine.mouse.down();
    await engine.mouse.move(waveBounds.x + waveBounds.width * 0.36, waveBounds.y + waveBounds.height * 0.85);
    await engine.mouse.up();
    await expect(dialog.getByRole('button', { name: /Fade out|Fade-out|Fundido de salida|Fondu de sortie/ })).toBeEnabled();
    await dialog.getByRole('button', { name: /Set loop from selection|Definir loop pela seleção|Definir loop desde la selección|Définir la boucle depuis la sélection/ }).click();
    await dialog.getByRole('button', { name: /Trim to selection|Cortar para seleção|Recortar a la selección|Rogner à la sélection/ }).click();
    const readSampleFrameMetric = async () => Number(((await dialog.locator('.gba-sample-editor-controls .ant-tag').first().innerText()).match(/[\d.,]+/)?.[0] ?? '0').replace(/[.,]/g, ''));
    await expect.poll(readSampleFrameMetric).toBe(selectedFrames);
    await dialog.locator('.ant-modal-close').click();
    await editor.evaluate(() => window.dispatchEvent(new Event('gba-studio:editor-undo')));
    await engine.getByRole('button', { name: /Open Sample Editor|Abrir editor de sample|Abrir editor de muestra|Ouvrir l’éditeur de sample/ }).click();
    await expect.poll(readSampleFrameMetric).toBe(1_024);
    await dialog.locator('.ant-modal-close').click();
    await editor.evaluate(() => window.dispatchEvent(new Event('gba-studio:editor-redo')));
    await engine.getByRole('button', { name: /Open Sample Editor|Abrir editor de sample|Abrir editor de muestra|Ouvrir l’éditeur de sample/ }).click();
    await expect.poll(readSampleFrameMetric).toBe(selectedFrames);
    await dialog.locator('.ant-modal-close').click();
    await editor.getByRole('button', { name: /Save|Salvar/ }).click();
    await expect(engine.getByText(/Music saved\.|Música salva\.|Musique enregistrée\./)).toBeVisible();
    const savedSample = await engine.evaluate(async () => {
      const filename = (await window.electronAPI.listTrackerProjects()).files.find(name => name.endsWith('.gbatracker'));
      if (!filename) throw new Error('The Sample Editor project package was not saved.');
      const result = await window.electronAPI.loadTrackerProject(filename);
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const { parseXmSamples } = await import('/src/utils/trackerModule.ts');
      const { exportMusicComposition } = await import('/src/utils/trackerCompositionExport.ts');
      const binary = atob(result.data);
      const project = parseTrackerProjectPackage(Uint8Array.from(binary, character => character.charCodeAt(0)));
      const moduleData = new Uint8Array(exportMusicComposition(project.composition, project.composition.targetFormat).moduleData);
      const sample = parseXmSamples(moduleData.buffer).get(1)?.variants?.[0];
      if (!sample) throw new Error('Trimmed sample cannot be parsed from the saved XM module.');
      return { length: sample.samples.length, loopStart: sample.loopStart, loopEnd: sample.loopEnd };
    });
    expect(savedSample.length).toBe(selectedFrames);
    expect(savedSample.loopStart).toBe(0);
    expect(savedSample.loopEnd).toBe(selectedFrames);
  } finally {
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('edits an XM note zone independently and preserves its note map', async () => {
  test.setTimeout(120_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-sample-zone-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  fs.writeFileSync(path.join(musicDirectory, 'two-zone.xm'), createXmTwoZoneFixture());
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp);
    await engine.getByRole('listitem').getByText('two-zone.xm', { exact: true }).click();
    const editor = engine.getByLabel('Music beat editor');
    await engine.getByRole('button', { name: /Open Sample Editor|Abrir editor de sample|Abrir editor de muestra|Ouvrir l’éditeur de sample/ }).click();
    const dialog = engine.getByRole('dialog');
    const zoneSelect = dialog.getByRole('combobox', { name: /Sample note zone|Zona de notas do sample|Zona de notas del sample|Zone de notes du sample/ });
    await dialog.locator('.gba-sample-editor-zone .ant-select-selector').click();
    await engine.locator('.ant-select-item-option').filter({ hasText: 'Second zone' }).click();
    const frameCount = async () => Number(((await dialog.locator('.gba-sample-editor-controls .ant-tag').first().innerText()).match(/[\d.,]+/)?.[0] ?? '0').replace(/[.,]/g, ''));
    await expect.poll(frameCount).toBe(1_024);
    const waveform = dialog.locator('.gba-sample-editor-wave-wrap svg');
    const bounds = await waveform.boundingBox();
    if (!bounds) throw new Error('Selected XM sample-zone waveform is not measurable.');
    await engine.mouse.move(bounds.x + bounds.width * 0.15, bounds.y + bounds.height * 0.5);
    await engine.mouse.down();
    await engine.mouse.move(bounds.x + bounds.width * 0.82, bounds.y + bounds.height * 0.5);
    await engine.mouse.up();
    const trimmedFrames = await frameCount();
    expect(trimmedFrames).toBeGreaterThan(500);
    expect(trimmedFrames).toBeLessThan(1_024);
    await dialog.getByRole('button', { name: /Trim to selection|Cortar para seleção|Recortar a la selección|Rogner à la sélection/ }).click();
    await expect.poll(frameCount).toBe(trimmedFrames);
    await dialog.locator('.ant-modal-close').click();
    await editor.evaluate(() => window.dispatchEvent(new Event('gba-studio:editor-undo')));
    await engine.getByRole('button', { name: /Open Sample Editor|Abrir editor de sample|Abrir editor de muestra|Ouvrir l’éditeur de sample/ }).click();
    await dialog.locator('.gba-sample-editor-zone .ant-select-selector').click();
    await engine.locator('.ant-select-item-option').filter({ hasText: 'Second zone' }).click();
    await expect.poll(frameCount).toBe(1_024);
    await dialog.locator('.ant-modal-close').click();
    await editor.evaluate(() => window.dispatchEvent(new Event('gba-studio:editor-redo')));
    await engine.getByRole('button', { name: /Open Sample Editor|Abrir editor de sample|Abrir editor de muestra|Ouvrir l’éditeur de sample/ }).click();
    await dialog.locator('.gba-sample-editor-zone .ant-select-selector').click();
    await engine.locator('.ant-select-item-option').filter({ hasText: 'Second zone' }).click();
    await expect.poll(frameCount).toBe(trimmedFrames);
    await dialog.locator('.ant-modal-close').click();
    await editor.getByRole('button', { name: /Save|Salvar/ }).click();
    await expect(engine.getByText(/Music saved\.|Música salva\.|Musique enregistrée\./)).toBeVisible();
    const savedZones = await engine.evaluate(async () => {
      const filename = (await window.electronAPI.listTrackerProjects()).files.find(name => name.endsWith('.gbatracker'));
      if (!filename) throw new Error('Edited XM note zones were not saved to a tracker project.');
      const result = await window.electronAPI.loadTrackerProject(filename);
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const { parseXmSamples } = await import('/src/utils/trackerModule.ts');
      const { exportMusicComposition } = await import('/src/utils/trackerCompositionExport.ts');
      const binary = atob(result.data);
      const project = parseTrackerProjectPackage(Uint8Array.from(binary, character => character.charCodeAt(0)));
      const moduleData = new Uint8Array(exportMusicComposition(project.composition, project.composition.targetFormat).moduleData);
      const variants = parseXmSamples(moduleData.buffer).get(1)?.variants ?? [];
      return { lengths: variants.map(sample => sample.samples.length), noteMap: parseXmSamples(moduleData.buffer).get(1)?.noteMap, sourceZones: project.sourceDocument.samples.filter(sample => sample.index === 1).map(sample => ({ variantIndex: sample.variantIndex, noteLow: sample.noteLow, noteHigh: sample.noteHigh, length: sample.length })) };
    });
    expect(savedZones.lengths).toEqual([1_024, trimmedFrames]);
    expect(savedZones.noteMap.slice(0, 48)).toEqual(Array(48).fill(0));
    expect(savedZones.noteMap.slice(48)).toEqual(Array(48).fill(1));
    expect(savedZones.sourceZones).toEqual([{ variantIndex: 0, noteLow: 1, noteHigh: 48, length: 1_024 }, { variantIndex: 1, noteLow: 49, noteHigh: 96, length: trimmedFrames }]);
  } finally {
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('renders only visible ghost notes and keeps dense scrolling responsive while toggling the layer', async () => {
  test.setTimeout(60_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-ghost-viewport-e2e-'));
  let electronApp;
  try {
    const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
    fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
    const shooterMusicDirectory = path.join(repositoryRoot, 'templateEngineGame', 'shooter_game', 'assets', 'musics');
    const denseModPath = path.join(projectDirectory, 'assets', 'musics', 'stardstm.mod');
    const denseMod = fs.readFileSync(path.join(shooterMusicDirectory, 'stardstm.mod'));
    const modTools = await loadModPlayerTools();
    const denseModBuffer = denseMod.buffer.slice(denseMod.byteOffset, denseMod.byteOffset + denseMod.byteLength);
    const parsedDenseMod = modTools.parseModModule(denseModBuffer);
    if (!parsedDenseMod) throw new Error('The stardstm MOD fixture could not be parsed for the ghost-layer stress test.');
    for (let pattern = 0; pattern < parsedDenseMod.patterns.length; pattern += 1) {
      for (let row = 0; row < 64; row += 1) {
        for (let channel = 0; channel < parsedDenseMod.channels; channel += 1) {
          const offset = 1084 + ((pattern * 64 + row) * parsedDenseMod.channels + channel) * 4;
          denseMod[offset] = 0x01;
          denseMod[offset + 1] = 0xac;
          denseMod[offset + 2] = 0x10;
          denseMod[offset + 3] = 0;
        }
      }
    }
    fs.writeFileSync(denseModPath, denseMod);
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').getByText('stardstm.mod', { exact: true }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    const gridScroll = editor.locator('.gba-beat-scroll');
    await expect(gridScroll).toBeVisible();
    await editor.getByRole('button', { name: 'Ghost Layer' }).click();
    const initial = await gridScroll.evaluate((element, orderCount) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      rowWidth: Number.parseFloat(getComputedStyle(element.querySelector('.gba-beat-grid')).width) / (orderCount * 64),
      ghostCount: Number(element.querySelectorAll('.gba-beat-note.ghost:not(.pooled)').length),
    }), parsedDenseMod.orders);
    expect(initial.scrollWidth).toBeGreaterThan(initial.clientWidth * 10);
    expect(initial.ghostCount).toBeGreaterThan(0);
    const visibleGhostNotes = gridScroll.locator('.gba-beat-note.ghost:not(.pooled)');
    const initialGhostCount = await visibleGhostNotes.count();
    const rowWidth = initial.rowWidth;
    const visibleRows = Math.ceil(initial.clientWidth / rowWidth);
    const visibleGhostLimit = (visibleRows + 2) * parsedDenseMod.channels;
    const totalGhostNotes = parsedDenseMod.orders * 64 * (parsedDenseMod.channels - 1);
    expect(totalGhostNotes).toBeGreaterThan(visibleGhostLimit * 10);
    expect(initialGhostCount, 'Ghost notes should stay bounded by the visible rows in a densely populated MOD.').toBeLessThanOrEqual(visibleGhostLimit);

    const scrollMetrics = await gridScroll.evaluate(async element => {
      let running = true;
      let previous = performance.now();
      let maxFrameGapMs = 0;
      let frames = 0;
      const sampleFrames = () => {
        const now = performance.now();
        maxFrameGapMs = Math.max(maxFrameGapMs, now - previous);
        previous = now;
        frames += 1;
        if (running) requestAnimationFrame(sampleFrames);
      };
      requestAnimationFrame(sampleFrames);
      for (let step = 1; step <= 24; step += 1) {
        element.scrollLeft = (element.scrollWidth - element.clientWidth) * step / 24;
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      await new Promise(resolve => setTimeout(resolve, 500));
      running = false;
      return { maxFrameGapMs, frames, scrollLeft: element.scrollLeft };
    });
    const scrolledGhostCount = await visibleGhostNotes.count();
    console.log(`Dense ghost-layer viewport: ${JSON.stringify({ totalGhostNotes, initialGhostCount, visibleGhostLimit, scrolledGhostCount, scrollMetrics })}.`);
    expect(scrolledGhostCount).toBeGreaterThan(0);
    expect(scrolledGhostCount).toBeLessThanOrEqual(visibleGhostLimit);
    expect(scrollMetrics.scrollLeft).toBeGreaterThan(0);
    expect(scrollMetrics.frames).toBeGreaterThan(20);
    expect(scrollMetrics.maxFrameGapMs).toBeLessThan(100);

    const ghostLayerToggle = editor.getByRole('button', { name: 'Ghost Layer' });
    await gridScroll.evaluate(element => {
      let running = true;
      let previous = performance.now();
      let maxFrameGapMs = 0;
      let frames = 0;
      const longTasks = [];
      const observer = typeof PerformanceObserver === 'undefined' ? null : new PerformanceObserver(entries => {
        for (const entry of entries.getEntries()) longTasks.push({ startTime: entry.startTime, duration: entry.duration, name: entry.name });
      });
      observer?.observe({ type: 'longtask' });
      const sampleFrames = () => {
        const now = performance.now();
        maxFrameGapMs = Math.max(maxFrameGapMs, now - previous);
        previous = now;
        frames += 1;
        if (running) requestAnimationFrame(sampleFrames);
      };
      requestAnimationFrame(sampleFrames);
      window.__ghostLayerFrameProbe = {
        stop: () => {
          running = false;
          observer?.disconnect();
          return {
            maxFrameGapMs,
            frames,
            longTaskCount: longTasks.length,
            longestLongTaskMs: longTasks.reduce((max, entry) => Math.max(max, entry.duration), 0),
          };
        },
      };
      element.scrollLeft = element.scrollWidth / 2;
    });
    const toggleCounts = [];
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await ghostLayerToggle.click();
      await expect(gridScroll.locator('.gba-beat-ghost-layer')).toHaveCSS('visibility', 'hidden');
      await gridScroll.evaluate(element => {
        element.scrollLeft = Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + element.clientWidth * 2);
      });
      await ghostLayerToggle.click();
      await expect(visibleGhostNotes.first()).toBeVisible();
      const visibleGhostCount = await visibleGhostNotes.count();
      expect(visibleGhostCount).toBeLessThanOrEqual(visibleGhostLimit);
      toggleCounts.push(visibleGhostCount);
    }
    const toggleMetrics = await engine.evaluate(() => {
      const probe = window.__ghostLayerFrameProbe;
      window.__ghostLayerFrameProbe = undefined;
      return probe?.stop() ?? { maxFrameGapMs: Number.POSITIVE_INFINITY, frames: 0 };
    });
    console.log(`Dense ghost-layer toggle responsiveness: ${JSON.stringify({ toggleCounts, toggleMetrics })}.`);
    expect(toggleMetrics.frames).toBeGreaterThan(20);
    expect(toggleMetrics.maxFrameGapMs).toBeLessThan(200);
  } finally {
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('supports live note dragging and a draggable playback start marker', async () => {
  test.setTimeout(60_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-roll-gesture-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp);
    await engine.getByRole('button', { name: /^(Create music|Criar m.sica)$/ }).click();
    await engine.getByRole('menuitem').filter({ hasText: /XM \(\.xm\)/ }).click();
    const editor = engine.getByLabel('Music beat editor');
    await expect(editor).toBeVisible();
    await engine.getByText('Keyboard', { exact: true }).click();
    await engine.locator('.gba-keyboard-keys button').nth(12).click();
    await engine.getByText('Piano roll', { exact: true }).click();
    const pianoNote = editor.locator('.gba-beat-scroll [data-note="true"]').first();
    await expect(pianoNote).toBeVisible();
    const noteBox = await pianoNote.boundingBox();
    const gridBox = await editor.locator('.gba-beat-grid').boundingBox();
    if (!noteBox || !gridBox) throw new Error('Piano roll note is not visible for drag testing.');
    const y = noteBox.y + noteBox.height / 2;
    await engine.mouse.move(noteBox.x + 20, y);
    await engine.mouse.down();
    await engine.mouse.move(gridBox.x + 42, y);
    await expect(editor.locator('.gba-beat-note.drag-preview')).toBeVisible();
    await expect(pianoNote).toHaveCSS('opacity', '0');
    expect(await editor.locator('.gba-beat-note.drag-preview').evaluate(note => note.style.left)).toBe('42px');
    await engine.mouse.up();
    await expect(pianoNote).toHaveAttribute('style', /left: 42px/);
    expect(await pianoNote.evaluate(note => getComputedStyle(note, '::after').cursor)).toBe('ew-resize');
    const movedBox = await pianoNote.boundingBox();
    if (!movedBox) throw new Error('Dragged note disappeared.');
    await engine.mouse.move(movedBox.x + 20, movedBox.y + movedBox.height / 2);
    await engine.mouse.down();
    await engine.mouse.move(gridBox.x + 10, movedBox.y + movedBox.height / 2);
    await engine.mouse.up();
    await expect(pianoNote).toHaveAttribute('style', /left: 2px/);
    const handle = editor.getByRole('button', { name: 'Drag to set playback start' });
    const handleBox = await handle.boundingBox();
    const playheadGridBox = await editor.locator('.gba-beat-grid').boundingBox();
    if (!handleBox || !playheadGridBox) throw new Error('Playback start marker is not visible.');
    await engine.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await engine.mouse.down();
    await engine.mouse.move(playheadGridBox.x + 248, handleBox.y + handleBox.height / 2);
    await engine.mouse.up();
    await expect(handle).toHaveAttribute('style', /left: 232px/);
  } finally {
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('replaces a sample in an imported MOD with prepared audio and preserves undo and build playback', async () => {
  test.setTimeout(300_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-mod-audio-import-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  const originalModule = createModLoopFixture();
  fs.writeFileSync(path.join(musicDirectory, 'mod-sample-source.mod'), originalModule);
  let electronApp;
  let emulator;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    console.log('MOD audio import: Electron launched.');
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').getByText('mod-sample-source.mod', { exact: true }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    await expect(engine.getByTestId('right-panel-scroll').getByText('MOD', { exact: true })).toBeVisible();
    await engine.getByRole('button', { name: /01: MOD steady tone/ }).click();
    const replaceAudio = engine.getByRole('button', { name: /Replace selected sample with audio|Substituir sample selecionado por áudio|Reemplazar la muestra seleccionada por audio|Remplacer le sample sélectionné par un audio/ });
    await expect(replaceAudio).toBeEnabled();
    await replaceAudio.click();
    await engine.locator('input[aria-label="Music sample audio file"]').setInputFiles({ name: 'mod-voice.wav', mimeType: 'audio/wav', buffer: createWavFixture() });
    await expect(engine.getByRole('img', { name: /Audio sample waveform|Forma de onda do áudio|Forma de onda del audio|Forme d’onde audio/ })).toBeVisible();
    const addSample = engine.getByRole('dialog').getByRole('button', { name: /Replace selected sample|Substituir sample selecionado|Reemplazar muestra seleccionada|Remplacer le sample sélectionné/ });
    await addSample.click();
    const instrumentButton = engine.getByRole('button', { name: /01: mod-voice/ });
    await expect(instrumentButton).toBeVisible();
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+z');
    await expect(engine.getByRole('button', { name: /01: MOD steady tone/ })).toBeVisible();
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+Shift+z');
    await expect(instrumentButton).toBeVisible();
    console.log('MOD audio import: prepared sample, undo, and redo passed.');

    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.getByRole('button', { name: /Quick preview|Prévia rápida|Vista previa rápida|Aperçu rapide/ }).click();
    await engine.waitForTimeout(1_000);
    const browserAudio = await engine.evaluate(finishAudioCapture);
    expect(browserAudio.rms).toBeGreaterThan(0.0001);
    console.log(`MOD audio import: structural preview captured (RMS ${browserAudio.rms}).`);

    await editor.getByRole('button', { name: /Save|Salvar|Enregistrer/ }).click();
    await expect(engine.getByText(/Music saved\.|Música salva\.|Música guardada\.|Musique enregistrée\./)).toBeVisible();
    const packageName = await engine.evaluate(async () => (await window.electronAPI.listTrackerProjects()).files.find(name => name.endsWith('.gbatracker')));
    expect(packageName).toBeTruthy();
    const savedProject = await engine.evaluate(async filename => {
      const result = await window.electronAPI.loadTrackerProject(filename);
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const binary = atob(result.data);
      return parseTrackerProjectPackage(Uint8Array.from(binary, character => character.charCodeAt(0)));
    }, packageName);
    expect(savedProject.composition.sourceModules[0].moduleData).toBe(originalModule.toString('base64'));
    expect(savedProject.moduleData).toBeUndefined();
    expect(savedProject.format).toBeUndefined();
    expect(savedProject.importedAudioSources).toHaveLength(1);
    expect(savedProject.importedAudioSources[0].sourceAudioData).toBe(createWavFixture().toString('base64'));
    const modAudit = await engine.evaluate(async encoded => {
      const { parseModModule } = await import('/src/utils/modPlayer.ts');
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const module = parseModModule(bytes.buffer);
      if (!module) throw new Error('Saved MOD project module is invalid.');
      const sample = module.samples[0];
      return { sampleName: sample.name, sampleLength: sample.length, loopLength: sample.loopLength, samplePcm: Array.from(bytes.slice(sample.dataOffset, sample.dataOffset + sample.length)) };
    }, await exportCompositionModuleData(engine, savedProject.composition));
    expect(modAudit.sampleName).toBe('mod-voice');
    expect(modAudit.sampleLength).toBe(1046);
    // MOD stores a two-byte repeat length for a non-looping sample; the
    // canonical sample keeps loopType='none' and the module uses this minimum.
    expect(modAudit.loopLength).toBe(2);
    expect(modAudit.samplePcm.some(value => value !== 0)).toBe(true);
    expect(fs.readFileSync(path.join(musicDirectory, 'mod-sample-source.mod'))).toEqual(originalModule);
    console.log('MOD audio import: proprietary project round-trip passed.');

    await engine.getByRole('button', { name: /Play ROM/ }).click();
    await waitForMaxmodPreviewStatus(editor, 240_000);
    console.log('MOD audio import: build core preview succeeded.');
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!emulator) throw new Error('The imported MOD Maxmod preview did not open.');
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx)), { timeout: 45_000 }).toBe(true);
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.gameManager)), { timeout: 45_000 }).toBe(true);
    expect(await emulator.evaluate(installEmulatorOpenALTap)).toBeTruthy();
    await emulator.evaluate(() => window.EJS_emulator?.gameManager?.restart());
    await emulator.waitForTimeout(1_000);
    const romAudio = await emulator.evaluate(finishAudioCapture);
    expect(romAudio.rms).toBeGreaterThan(0.0001);
    console.log(`MOD audio import: ROM audio captured (RMS ${romAudio.rms}).`);
  } finally {
    if (emulator) await emulator.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('replaces a sample in an imported S3M with prepared audio and preserves undo and build playback', async () => {
  test.setTimeout(300_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-s3m-audio-import-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  const originalModule = createS3mMaxmodParityFixture();
  originalModule.write('Fixture sample', 128 + 0x30, 'ascii');
  const trackerTools = await loadTrackerModuleTools();
  const originalModuleBuffer = originalModule.buffer.slice(originalModule.byteOffset, originalModule.byteOffset + originalModule.byteLength);
  const originalPatternRows = trackerTools.parseS3mPatternRows(originalModuleBuffer, 0, 64);
  fs.writeFileSync(path.join(musicDirectory, 's3m-sample-source.s3m'), originalModule);
  let electronApp;
  let emulator;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').getByText('s3m-sample-source.s3m', { exact: true }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    await expect(engine.getByTestId('right-panel-scroll').getByText('S3M', { exact: true })).toBeVisible();
    await selectMusicInstrument(engine);
    const replaceAudio = engine.getByRole('button', { name: /Replace selected sample with audio|Substituir sample selecionado por áudio|Reemplazar la muestra seleccionada por audio|Remplacer le sample sélectionné par un audio/ });
    await expect(replaceAudio).toBeEnabled();
    await replaceAudio.click();
    await engine.locator('input[aria-label="Music sample audio file"]').setInputFiles({ name: 's3m-voice.wav', mimeType: 'audio/wav', buffer: createWavFixture() });
    await expect(engine.getByRole('img', { name: /Audio sample waveform|Forma de onda do áudio|Forma de onda del audio|Forme d’onde audio/ })).toBeVisible();
    await engine.getByRole('dialog').getByRole('button', { name: /Replace selected sample|Substituir sample selecionado|Reemplazar muestra seleccionada|Remplacer le sample sélectionné/ }).click();
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+z');
    await engine.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+Shift+z');

    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.getByRole('button', { name: /Quick preview|Prévia rápida|Vista previa rápida|Aperçu rapide/ }).click();
    await engine.waitForTimeout(1_000);
    const browserAudio = await engine.evaluate(finishAudioCapture);
    expect(browserAudio.rms).toBeGreaterThan(0.0001);

    await editor.getByRole('button', { name: /Save|Salvar|Enregistrer/ }).click();
    await expect(engine.getByText(/Music saved\.|Música salva\.|Música guardada\.|Musique enregistrée\./)).toBeVisible();
    const savedProject = await engine.evaluate(async () => {
      const filename = (await window.electronAPI.listTrackerProjects()).files.find(name => name.endsWith('.gbatracker'));
      if (!filename) throw new Error('The S3M tracker project was not saved.');
      const result = await window.electronAPI.loadTrackerProject(filename);
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const binary = atob(result.data);
      return parseTrackerProjectPackage(Uint8Array.from(binary, character => character.charCodeAt(0)));
    });
    expect(savedProject.composition.sourceModules[0].moduleData).toBe(originalModule.toString('base64'));
    expect(savedProject.moduleData).toBeUndefined();
    expect(savedProject.format).toBeUndefined();
    expect(savedProject.importedAudioSources).toHaveLength(1);
    const sampleAudit = await engine.evaluate(async encoded => {
      const { parseS3mPatternRows, parseS3mSamples } = await import('/src/utils/trackerModule.ts');
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const sample = parseS3mSamples(bytes.buffer).get(1);
      if (!sample) throw new Error('The saved S3M sample is invalid.');
      return { name: sample.name, length: sample.samples.length, sampleRate: sample.sampleRate, loopStart: sample.loopStart, loopEnd: sample.loopEnd, pcm: Array.from(sample.samples), patternRows: parseS3mPatternRows(bytes.buffer, 0, 64) };
    }, await exportCompositionModuleData(engine, savedProject.composition));
    expect(sampleAudit.name).toBe('s3m-voice');
    expect(sampleAudit.length).toBe(1045);
    expect(sampleAudit.sampleRate).toBe(8363);
    expect(sampleAudit.loopStart).toBe(0);
    expect(sampleAudit.loopEnd).toBe(0);
    expect(sampleAudit.pcm.some(value => value !== 0)).toBe(true);
    expectPatternRowsPreserved(sampleAudit.patternRows, originalPatternRows, 'S3M');
    expect(fs.readFileSync(path.join(musicDirectory, 's3m-sample-source.s3m'))).toEqual(originalModule);

    await engine.getByRole('button', { name: /Play ROM/ }).click();
    await waitForMaxmodPreviewStatus(editor, 240_000);
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!emulator) throw new Error('The imported S3M Maxmod preview did not open.');
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx)), { timeout: 45_000 }).toBe(true);
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.gameManager)), { timeout: 45_000 }).toBe(true);
    expect(await emulator.evaluate(installEmulatorOpenALTap)).toBeTruthy();
    await emulator.evaluate(() => window.EJS_emulator?.gameManager?.restart());
    await expect.poll(() => emulator.evaluate(() => window.__musicOpenALCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(60);
    expect((await emulator.evaluate(finishAudioCapture)).rms).toBeGreaterThan(0.0001);
  } finally {
    if (emulator) await emulator.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('replaces audio in an imported IT sample and preserves its pattern and build playback', async () => {
  test.setTimeout(300_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-audio-import-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  const originalModule = createItInstrumentAudioFixture();
  const trackerTools = await loadTrackerModuleTools();
  const originalModuleBuffer = originalModule.buffer.slice(originalModule.byteOffset, originalModule.byteOffset + originalModule.byteLength);
  const originalPatternRows = trackerTools.parseItPatternRows(originalModuleBuffer, 0, 64);
  fs.writeFileSync(path.join(musicDirectory, 'it-sample-source.it'), originalModule);
  let electronApp;
  let emulator;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').getByText('it-sample-source.it', { exact: true }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    await expect(engine.getByTestId('right-panel-scroll').getByText('IT', { exact: true })).toBeVisible();
    await selectMusicInstrument(engine);
    const replaceAudio = engine.getByRole('button', { name: /Replace selected sample with audio|Substituir sample selecionado por áudio|Reemplazar la muestra seleccionada por audio|Remplacer le sample sélectionné par un audio/ });
    await expect(replaceAudio).toBeEnabled();
    await replaceAudio.click();
    await engine.locator('input[aria-label="Music sample audio file"]').setInputFiles({ name: 'it-voice.wav', mimeType: 'audio/wav', buffer: createWavFixture() });
    await expect(engine.getByRole('img', { name: /Audio sample waveform|Forma de onda do áudio|Forma de onda del audio|Forme d’onde audio/ })).toBeVisible();
    await engine.getByRole('dialog').getByRole('button', { name: /Replace selected sample|Substituir sample selecionado|Reemplazar muestra seleccionada|Remplacer le sample sélectionné/ }).click();
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+z');
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+Shift+z');

    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.getByRole('button', { name: /Quick preview|Prévia rápida|Vista previa rápida|Aperçu rapide/ }).click();
    await engine.waitForTimeout(1_000);
    expect((await engine.evaluate(finishAudioCapture)).rms).toBeGreaterThan(0.0001);

    await editor.getByRole('button', { name: /Save|Salvar|Enregistrer/ }).click();
    await expect(engine.getByText(/Music saved\.|Música salva\.|Música guardada\.|Musique enregistrée\./)).toBeVisible();
    const savedProject = await engine.evaluate(async () => {
      const filename = (await window.electronAPI.listTrackerProjects()).files.find(name => name.endsWith('.gbatracker'));
      if (!filename) throw new Error('The IT tracker project was not saved.');
      const result = await window.electronAPI.loadTrackerProject(filename);
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const binary = atob(result.data);
      return parseTrackerProjectPackage(Uint8Array.from(binary, character => character.charCodeAt(0)));
    });
    expect(savedProject.composition.sourceModules[0].moduleData).toBe(originalModule.toString('base64'));
    expect(savedProject.moduleData).toBeUndefined();
    expect(savedProject.format).toBeUndefined();
    expect(savedProject.importedAudioSources).toHaveLength(1);
    const sampleAudit = await engine.evaluate(async encoded => {
      const { parseItPatternRows, parseItSamples } = await import('/src/utils/trackerModule.ts');
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const samples = parseItSamples(bytes.buffer);
      const sample = samples.get(1);
      if (!sample) throw new Error('The saved IT sample no longer resolves.');
      return {
        sampleCount: new DataView(bytes.buffer).getUint16(0x24, true),
        name: sample.name,
        length: sample.samples.length,
        sampleRate: sample.sampleRate,
        loopStart: sample.loopStart,
        loopEnd: sample.loopEnd,
        pcm: Array.from(sample.samples),
        patternRows: parseItPatternRows(bytes.buffer, 0, 64),
      };
    }, await exportCompositionModuleData(engine, savedProject.composition));
    expect(sampleAudit.sampleCount).toBe(1);
    expect(sampleAudit.name).toBe('it-voice');
    expect(sampleAudit.length).toBe(1045);
    expect(sampleAudit.sampleRate).toBe(8363);
    expect(sampleAudit.loopStart).toBe(0);
    expect(sampleAudit.loopEnd).toBe(0);
    expect(sampleAudit.pcm.some(value => value !== 0)).toBe(true);
    expectPatternRowsPreserved(sampleAudit.patternRows, originalPatternRows, 'IT');
    expect(fs.readFileSync(path.join(musicDirectory, 'it-sample-source.it'))).toEqual(originalModule);

    await engine.getByRole('button', { name: /Play ROM/ }).click();
    await waitForMaxmodPreviewStatus(editor, 240_000);
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!emulator) throw new Error('The imported IT Maxmod preview did not open.');
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx)), { timeout: 45_000 }).toBe(true);
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.gameManager)), { timeout: 45_000 }).toBe(true);
    expect(await emulator.evaluate(installEmulatorOpenALTap)).toBeTruthy();
    await emulator.evaluate(() => window.EJS_emulator?.gameManager?.restart());
    await expect.poll(() => emulator.evaluate(() => window.__musicOpenALCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(60);
    expect((await emulator.evaluate(finishAudioCapture)).rms).toBeGreaterThan(0.0001);
  } finally {
    if (emulator) await emulator.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('replaces audio in an imported IT instrument-mode sample and preserves build playback', async () => {
  test.setTimeout(300_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-instrument-audio-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  const originalModule = createItInstrumentModeAudioFixture();
  const trackerTools = await loadTrackerModuleTools();
  const originalModuleBuffer = originalModule.buffer.slice(originalModule.byteOffset, originalModule.byteOffset + originalModule.byteLength);
  const originalPatternRows = trackerTools.parseItPatternRows(originalModuleBuffer, 0, 64);
  fs.writeFileSync(path.join(musicDirectory, 'it-instrument-source.it'), originalModule);
  let electronApp;
  let emulator;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').getByText('it-instrument-source.it', { exact: true }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    await expect(engine.getByTestId('right-panel-scroll').getByText('IT', { exact: true })).toBeVisible();
    await selectMusicInstrument(engine);
    await engine.getByRole('button', { name: /Play ROM/ }).click();
    await waitForMaxmodPreviewStatus(editor, 240_000);
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!emulator) throw new Error('The source IT instrument-mode Maxmod preview did not open.');
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx)), { timeout: 45_000 }).toBe(true);
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.gameManager)), { timeout: 45_000 }).toBe(true);
    expect(await emulator.evaluate(installEmulatorOpenALTap)).toBeTruthy();
    await emulator.evaluate(() => window.EJS_emulator?.gameManager?.restart());
    await expect.poll(() => emulator.evaluate(() => window.__musicOpenALCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(60);
    const sourceRomAudio = await emulator.evaluate(finishAudioCapture);
    expect(sourceRomAudio.rms).toBeGreaterThan(0.0001);
    await emulator.close();
    emulator = undefined;
    await engine.waitForTimeout(500);
    const replaceAudio = engine.getByRole('button', { name: /Replace selected sample with audio|Substituir sample selecionado|Reemplazar la muestra seleccionada|Remplacer le sample sÃ©lectionnÃ©/ });
    await expect(replaceAudio).toBeEnabled();
    await replaceAudio.click();
    await engine.locator('input[aria-label="Music sample audio file"]').setInputFiles({ name: 'it-instrument-voice.wav', mimeType: 'audio/wav', buffer: createWavFixture() });
    await expect(engine.getByRole('img', { name: /Audio sample waveform|Forma de onda|Forme d/ })).toBeVisible();
    await engine.getByRole('dialog').getByRole('button', { name: /Replace selected sample|Substituir sample selecionado|Reemplazar muestra seleccionada|Remplacer le sample sélectionné/ }).click();
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+z');
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+Shift+z');
    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
    await engine.waitForTimeout(1_000);
    expect((await engine.evaluate(finishAudioCapture)).rms).toBeGreaterThan(0.0001);

    await engine.getByRole('button', { name: /Play ROM/ }).click();
    await waitForMaxmodPreviewStatus(editor, 240_000);
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!emulator) throw new Error('The imported IT instrument-mode Maxmod preview did not open.');
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx)), { timeout: 45_000 }).toBe(true);
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.gameManager)), { timeout: 45_000 }).toBe(true);
    expect(await emulator.evaluate(installEmulatorOpenALTap)).toBeTruthy();
    await emulator.evaluate(() => window.EJS_emulator?.gameManager?.restart());
    await expect.poll(() => emulator.evaluate(() => window.__musicOpenALCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(60);
    expect((await emulator.evaluate(finishAudioCapture)).rms).toBeGreaterThan(0.0001);
    expect(fs.readFileSync(path.join(musicDirectory, 'it-instrument-source.it'))).toEqual(originalModule);
    expect(originalPatternRows[0][0].instrument).toBe(1);
  } finally {
    if (emulator) await emulator.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('plays one prepared PCM take in MOD, XM, S3M, and IT preview and ROM paths', async () => {
  test.setTimeout(480_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-shared-take-formats-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  fs.mkdirSync(musicDirectory, { recursive: true });
  const frameCount = 8_192;
  const pcm = Int8Array.from({ length: frameCount }, (_, frame) => {
    const fade = Math.min(1, frame / 64, (frameCount - frame - 1) / 64);
    return Math.round(Math.sin((2 * Math.PI * 440 * frame) / 8_363) * 88 * fade);
  });
  const arrayBufferOf = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const moduleTools = await loadTrackerModuleTools();
  const modTools = await loadModPlayerTools();
  const encodedPcm = Uint8Array.from(pcm, (value, index) => value - (pcm[index - 1] ?? 0));
  const modules = [];
  const modFixture = createModLoopFixture();
  const parsedMod = modTools.parseModModule(arrayBufferOf(modFixture));
  if (!parsedMod) throw new Error('The MOD fixture could not be parsed before the shared take export.');
  const modOutput = modTools.replaceModSamplePcm(parsedMod, 0, pcm, 'shared take');
  if (!modOutput) throw new Error('The shared PCM take could not be exported to MOD.');
  modules.push(['sharedmod.mod', 'MOD', Buffer.from(modOutput.bytes)]);
  const xmOutput = moduleTools.replaceXmSamplePcm(arrayBufferOf(createXmLoopFixture(1)), 1, encodedPcm, 'shared take');
  if (!xmOutput) throw new Error('The shared PCM take could not be exported to XM.');
  modules.push(['sharedxm.xm', 'XM', Buffer.from(xmOutput)]);
  const s3mOutput = moduleTools.replaceS3mSamplePcm(arrayBufferOf(createS3mMaxmodParityFixture()), 0, pcm, 'shared take');
  if (!s3mOutput) throw new Error('The shared PCM take could not be exported to S3M.');
  modules.push(['shareds3m.s3m', 'S3M', Buffer.from(s3mOutput)]);
  const itOutput = moduleTools.replaceItSamplePcm(arrayBufferOf(createItInstrumentAudioFixture()), 0, pcm, 'shared take');
  if (!itOutput) throw new Error('The shared PCM take could not be exported to IT.');
  modules.push(['sharedit.it', 'IT', Buffer.from(itOutput)]);
  const expectedSamples = Array.from(pcm, value => value / 128);
  const decodedSamples = [
    Array.from(modOutput.bytes.slice(modOutput.samples[0].dataOffset, modOutput.samples[0].dataOffset + frameCount), value => ((value << 24) >> 24) / 128),
    Array.from(moduleTools.parseXmSamples(xmOutput).get(1)?.variants?.[0]?.samples ?? []),
    Array.from(moduleTools.parseS3mSamples(s3mOutput).get(1)?.samples ?? []),
    Array.from(moduleTools.parseItSamples(itOutput).get(1)?.samples ?? []),
  ];
  for (const [index, samples] of decodedSamples.entries()) {
    expect(samples).toHaveLength(frameCount);
    for (let frame = 0; frame < frameCount; frame += 1) expect(Math.abs(samples[frame] - expectedSamples[frame]), `${modules[index][1]} PCM frame ${frame} should preserve the prepared take`).toBeLessThan(1 / 128);
  }
  for (const [filename, , bytes] of modules) fs.writeFileSync(path.join(musicDirectory, filename), bytes);

  let electronApp;
  let activeEmulator;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const comparisons = [];
    for (const [filename, format] of modules) {
      await engine.getByRole('listitem').getByText(filename, { exact: true }).click();
      const editor = await importSelectedOriginalForEditing(engine);
      await expect(editor).toBeVisible();
      await expect(engine.getByTestId('right-panel-scroll').getByText(format, { exact: true })).toBeVisible();
      await engine.evaluate(installBrowserPreviewAudioTap);
      const quickPreview = editor.locator('.gba-beat-toolbar-actions button').first();
      await quickPreview.click();
      await engine.waitForTimeout(1_500);
      const preview = await engine.evaluate(finishAudioCapture, 'preview');
      expect(preview.rms, `${format} preview should play the shared PCM take.`).toBeGreaterThan(0.0001);
      expect(preview.activeRms, `${format} preview should produce measurable active audio.`).toBeGreaterThan(0.001);
      await quickPreview.click();

      await editor.getByRole('button', { name: /Play ROM/ }).click();
      await waitForMaxmodPreviewStatus(editor, 90_000);
      await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
      activeEmulator = electronApp.windows().find(page => page.url().includes('#emulator'));
      if (!activeEmulator) throw new Error(`${format} shared-take ROM preview did not open.`);
      await expect.poll(() => activeEmulator.evaluate(() => Boolean(window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx)), { timeout: 30_000 }).toBe(true);
      await expect.poll(() => activeEmulator.evaluate(() => Boolean(window.EJS_emulator?.gameManager)), { timeout: 30_000 }).toBe(true);
      expect(await activeEmulator.evaluate(installEmulatorOpenALTap)).toBeTruthy();
      await activeEmulator.evaluate(() => window.EJS_emulator?.gameManager?.restart());
      // Capture early: the shared XM fixture sends key-off on row 16 (~0.32 s).
      await expect.poll(() => activeEmulator.evaluate(() => window.__musicOpenALCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(24);
      const rom = await activeEmulator.evaluate(finishAudioCapture, 'openal');
      expect(rom.rms, `${format} ROM preview should play the shared PCM take.`).toBeGreaterThan(0.0001);
      expect(rom.activeRms, `${format} ROM preview should produce measurable active audio.`).toBeGreaterThan(0.001);
      comparisons.push({ format, previewRms: preview.activeRms, romRms: rom.activeRms, previewPitch: preview.estimatedPitch, romPitch: rom.estimatedPitch });
      await activeEmulator.close();
      activeEmulator = undefined;
      await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length).toBe(0);
      await engine.bringToFront();
    }
    expect(comparisons.map(result => result.format)).toEqual(['MOD', 'XM', 'S3M', 'IT']);
    console.log(`One identical PCM sample take preview/ROM captures: ${JSON.stringify(comparisons)}.`);
  } finally {
    if (activeEmulator) await activeEmulator.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('builds a complete project containing an IT instrument-mode music asset', async () => {
  test.setTimeout(600_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-full-build-e2e-'));
  const previousBuildDirectory = path.join(os.tmpdir(), 'gba-studio-temp', 'gba-studio-build');
  const previousBuildBackup = path.join(path.dirname(previousBuildDirectory), `gba-studio-build-backup-${process.pid}`);
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  const originalModule = createItInstrumentModeAudioFixture();
  fs.writeFileSync(path.join(musicDirectory, 'it_instrument_build.it'), originalModule);
  let electronApp;
  let previousBuildMoved = false;
  try {
    if (fs.existsSync(previousBuildDirectory)) {
      const markerPath = path.join(previousBuildDirectory, '.project.json');
      const marker = fs.existsSync(markerPath) ? JSON.parse(fs.readFileSync(markerPath, 'utf8')) : null;
      if (marker?.projectDir === projectDirectory) throw new Error('The unique IT test project unexpectedly owns the existing temporary build directory.');
      if (fs.existsSync(previousBuildBackup)) throw new Error('The IT build test backup path already exists.');
      fs.renameSync(previousBuildDirectory, previousBuildBackup);
      previousBuildMoved = true;
    }
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp);
    await engine.evaluate(() => {
      window.__itFullBuildAudit = { status: null, error: null, output: [] };
      window.electronAPI.on('compile-progress', (_event, payload) => { if (payload?.status) window.__itFullBuildAudit.status = payload.status; if (payload?.message) window.__itFullBuildAudit.output.push(payload.message); });
      window.electronAPI.on('compile-error', (_event, payload) => { window.__itFullBuildAudit.error = payload?.message ?? String(payload); });
      window.electronAPI.send('compile-project', null);
    });
    await expect.poll(() => engine.evaluate(() => window.__itFullBuildAudit?.status), { timeout: 540_000, intervals: [500, 1_000, 2_000] }).toBe('finished');
    const buildAudit = await engine.evaluate(() => window.__itFullBuildAudit);
    if (buildAudit.error) console.log(`IT full build failure details: ${JSON.stringify({ error: buildAudit.error, output: buildAudit.output.slice(-24) })}`);
    expect(buildAudit.error).toBeNull();
    const buildDirectory = path.join(previousBuildDirectory, 'build');
    const builtModulePath = path.join(previousBuildDirectory, 'audio', 'it_instrument_build.it');
    expect(fs.existsSync(builtModulePath)).toBe(true);
    const builtModule = fs.readFileSync(builtModulePath);
    const trackerTools = await loadTrackerModuleTools();
    const builtModuleBuffer = builtModule.buffer.slice(builtModule.byteOffset, builtModule.byteOffset + builtModule.byteLength);
    const builtInfo = trackerTools.parseTrackerModule(builtModuleBuffer, 'IT');
    expect(builtInfo.instruments).toBe(0);
    expect(builtInfo.sampleCount).toBeGreaterThan(0);
    expect(trackerTools.parseItSamples(builtModuleBuffer).get(1)?.samples.length).toBe(1_024);
    expect(trackerTools.parseItPatternRows(builtModuleBuffer, 0, 1)[0][0]).toMatchObject({ note: 60, instrument: 1 });
    expect(fs.readFileSync(path.join(musicDirectory, 'it_instrument_build.it'))).toEqual(originalModule);
    const builtRoms = [];
    const walk = directory => {
      if (!fs.existsSync(directory)) return;
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(filename);
        else if (path.extname(entry.name).toLowerCase() === '.gba') builtRoms.push(filename);
      }
    };
    walk(previousBuildDirectory);
    expect(builtRoms.length).toBeGreaterThan(0);
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
    if (fs.existsSync(previousBuildDirectory)) {
      const markerPath = path.join(previousBuildDirectory, '.project.json');
      const marker = fs.existsSync(markerPath) ? JSON.parse(fs.readFileSync(markerPath, 'utf8')) : null;
      if (marker?.projectDir === projectDirectory) fs.rmSync(previousBuildDirectory, { recursive: true, force: true });
    }
    if (previousBuildMoved && fs.existsSync(previousBuildBackup) && !fs.existsSync(previousBuildDirectory)) fs.renameSync(previousBuildBackup, previousBuildDirectory);
    fs.rmSync(previousBuildBackup, { recursive: true, force: true });
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('replaces audio in an imported XM sample and preserves the source and build playback', async () => {
  test.setTimeout(300_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-xm-audio-import-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.mkdirSync(musicDirectory, { recursive: true });
  const originalModule = createXmLoopFixture(1);
  const trackerTools = await loadTrackerModuleTools();
  const originalModuleBuffer = originalModule.buffer.slice(originalModule.byteOffset, originalModule.byteOffset + originalModule.byteLength);
  const originalPatternRows = trackerTools.parseXmPatternRows(originalModuleBuffer, 0, 64);
  fs.writeFileSync(path.join(musicDirectory, 'xm-sample-source.xm'), originalModule);
  let electronApp;
  let emulator;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').getByText('xm-sample-source.xm', { exact: true }).click();
    const editor = await importSelectedOriginalForEditing(engine);
    await expect(engine.getByTestId('right-panel-scroll').getByText('XM', { exact: true })).toBeVisible();
    await selectMusicInstrument(engine);
    const replaceAudio = engine.getByRole('button', { name: /Replace selected sample with audio|Substituir sample selecionado por áudio|Reemplazar la muestra seleccionada por audio|Remplacer le sample sélectionné par un audio/ });
    await expect(replaceAudio).toBeEnabled();
    await replaceAudio.click();
    await engine.locator('input[aria-label="Music sample audio file"]').setInputFiles({ name: 'xm-voice.wav', mimeType: 'audio/wav', buffer: createWavFixture() });
    await expect(engine.getByRole('img', { name: /Audio sample waveform|Forma de onda do áudio|Forma de onda del audio|Forme d’onde audio/ })).toBeVisible();
    await engine.getByRole('dialog').getByRole('button', { name: /Replace selected sample|Substituir sample selecionado|Reemplazar muestra seleccionada|Remplacer le sample sélectionné/ }).click();
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+z');
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+Shift+z');

    await engine.evaluate(installBrowserPreviewAudioTap);
    await engine.getByRole('button', { name: /Quick preview|Prévia rápida|Vista previa rápida|Aperçu rapide/ }).click();
    await engine.waitForTimeout(1_000);
    expect((await engine.evaluate(finishAudioCapture)).rms).toBeGreaterThan(0.0001);
    await editor.getByRole('button', { name: /Save|Salvar|Enregistrer/ }).click();
    await expect(engine.getByText(/Music saved\.|Música salva\.|Música guardada\.|Musique enregistrée\./)).toBeVisible();

    const savedProject = await engine.evaluate(async () => {
      const filename = (await window.electronAPI.listTrackerProjects()).files.find(name => name.endsWith('.gbatracker'));
      if (!filename) throw new Error('The imported XM tracker project was not saved.');
      const result = await window.electronAPI.loadTrackerProject(filename);
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const binary = atob(result.data);
      return parseTrackerProjectPackage(Uint8Array.from(binary, character => character.charCodeAt(0)));
    });
    expect(savedProject.composition.sourceModules[0].moduleData).toBe(originalModule.toString('base64'));
    expect(savedProject.moduleData).toBeUndefined();
    expect(savedProject.format).toBeUndefined();
    expect(savedProject.importedAudioSources).toHaveLength(1);
    const sampleAudit = await engine.evaluate(async encoded => {
      const { parseXmPatternRows, parseXmSamples } = await import('/src/utils/trackerModule.ts');
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
      const sample = parseXmSamples(bytes.buffer).get(1)?.variants?.[0];
      if (!sample) throw new Error('The saved XM sample no longer resolves.');
      return { name: sample.name, length: sample.samples.length, loopStart: sample.loopStart, loopEnd: sample.loopEnd, pcm: Array.from(sample.samples), patternRows: parseXmPatternRows(bytes.buffer, 0, 64) };
    }, await exportCompositionModuleData(engine, savedProject.composition));
    expect(sampleAudit.name).toBe('xm-voice');
    expect(sampleAudit.length).toBe(1045);
    expect(sampleAudit.loopStart).toBe(0);
    expect(sampleAudit.loopEnd).toBe(0);
    expect(sampleAudit.pcm.some(value => value !== 0)).toBe(true);
    expectPatternRowsPreserved(sampleAudit.patternRows, originalPatternRows, 'XM');
    expect(fs.readFileSync(path.join(musicDirectory, 'xm-sample-source.xm'))).toEqual(originalModule);

    await engine.getByRole('button', { name: /Play ROM/ }).click();
    await waitForMaxmodPreviewStatus(editor, 240_000);
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!emulator) throw new Error('The imported XM Maxmod preview did not open.');
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx)), { timeout: 45_000 }).toBe(true);
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.gameManager)), { timeout: 45_000 }).toBe(true);
    expect(await emulator.evaluate(installEmulatorOpenALTap)).toBeTruthy();
    await emulator.evaluate(() => window.EJS_emulator?.gameManager?.restart());
    await expect.poll(() => emulator.evaluate(() => window.__musicOpenALCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(60);
    expect((await emulator.evaluate(finishAudioCapture)).rms).toBeGreaterThan(0.0001);
  } finally {
    if (emulator) await emulator.close().catch(() => {});
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('selects an imported XM note with the pointer and opens its inspector', async () => {
  test.setTimeout(45_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-gba-note-selection-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  let electronApp;
  try {
    const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
    fs.mkdirSync(musicDirectory, { recursive: true });
    fs.writeFileSync(path.join(musicDirectory, 'imported-fixture.xm'), createXmTwoOrderFixture());
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await engine.getByRole('listitem').filter({ hasText: 'imported-fixture.xm' }).click();
    await expect(engine.getByTestId('right-panel-scroll').getByText('XM', { exact: true })).toBeVisible();
    await importSelectedOriginalForEditing(engine);
    const editor = engine.getByLabel('Music beat editor');
    await expect(editor.locator('[data-note="true"]')).toHaveCount(2);
    const note = editor.locator('[data-note="true"]').last();
    await expect(note).toBeVisible();
    await note.click();
    await expect(editor.locator('[data-note="true"].selected')).toHaveCount(1);
    await expect(note).toContainText('C4');
    const pitch = engine.getByTestId('right-panel-scroll').getByLabel(/^(Pitch|Altura|Tono|Hauteur)$/);
    await expect(pitch).toHaveValue('49');
    await pitch.fill('50');
    await pitch.press('Tab');
    await expect(pitch).toHaveValue('50');
    await note.focus();
    await engine.keyboard.press('Enter');
    await expect(editor.locator('[data-note="true"].selected')).toHaveCount(1);
    await expect(pitch).toHaveValue('50');
  } finally {
    if (electronApp) await electronApp.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('original music assets can be previewed without writes or imported into editable .gbatracker copies', async () => {
  test.setTimeout(120_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-original-import-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, {
    recursive: true,
    filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`),
  });
  const sourceModule = fs.readFileSync(path.join(repositoryRoot, 'templateEngineGame', 'shooter_game', 'assets', 'musics', 'cyberrid.mod'));
  const originalFilename = 'original-fixture.mod';
  const originalPath = path.join(projectDirectory, 'assets', 'musics', originalFilename);
  fs.writeFileSync(originalPath, sourceModule);
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const originalItem = engine.getByRole('listitem').filter({ hasText: originalFilename });
    await originalItem.click();
    const previewButton = engine.getByRole('button', { name: /Preview only|Somente preview|Aperçu uniquement|Solo vista previa/ });
    await expect(previewButton).toBeVisible();
    await expect(engine.getByRole('button', { name: /Import for editing|Importar para edi\u00e7\u00e3o|Éditer une copie|Importar para editar/ })).toBeVisible();
    const originalCard = engine.locator('.ant-card').filter({ hasText: originalFilename });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1080, height: 760 }, { width: 1024, height: 700 }]) {
      await engine.setViewportSize(viewport);
      const bounds = await originalCard.boundingBox();
      expect(bounds, `Original music actions should remain visible at ${viewport.width}x${viewport.height}.`).not.toBeNull();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    }
    await previewButton.click();
    await expect(engine.getByRole('button', { name: /Stop preview|Parar preview|Arrêter l’aperçu|Detener vista previa/ })).toBeVisible();
    expect(fs.readFileSync(originalPath).equals(sourceModule)).toBe(true);
    expect(fs.existsSync(path.join(projectDirectory, 'project', 'musics', 'original-fixture.gbatracker'))).toBe(false);
    await engine.getByRole('button', { name: /Stop preview|Parar preview|Arrêter l’aperçu|Detener vista previa/ }).click();

    await engine.getByRole('button', { name: /Import for editing|Importar para edi\u00e7\u00e3o|Éditer une copie|Importar para editar/ }).click();
    const importedName = 'original-fixture.gbatracker';
    await expect(engine.getByRole('listitem').filter({ hasText: importedName })).toBeVisible();
    await expect(engine.getByLabel('Music beat editor')).toBeVisible();
    expect(fs.readFileSync(originalPath).equals(sourceModule)).toBe(true);
    const importedProject = await engine.evaluate(async () => {
      const listed = await window.electronAPI.listTrackerProjects();
      const filename = listed.projects.find(project => project.filename.includes('original-fixture'))?.filename;
      const result = await window.electronAPI.loadTrackerProject(filename);
      const binary = atob(result.data);
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const document = parseTrackerProjectPackage(Uint8Array.from(binary, character => character.charCodeAt(0)));
      return { ...document, filename };
    });
    expect(importedProject).toMatchObject({ schema: 'gba-studio/music-project', version: 1, origin: 'imported', sourceFilename: originalFilename });
    expect(importedProject.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(importedProject.composition).toMatchObject({ schema: 'gba-studio/music-composition', version: 1, targetFormat: 'MOD' });
    expect(importedProject.composition.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(importedProject).not.toHaveProperty('moduleData');
    expect(Buffer.from(importedProject.composition.sourceModules[0].moduleData, 'base64').equals(sourceModule)).toBe(true);
    const nestedProject = await engine.evaluate(async ({ filename, project }) => {
      const { createTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const firstPackage = createTrackerProjectPackage({ ...project, id: crypto.randomUUID() });
      const secondPackage = createTrackerProjectPackage({ ...project, id: crypto.randomUUID() });
      const encode = bytes => {
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
        return btoa(binary);
      };
      const firstSave = await window.electronAPI.saveTrackerProject('Collections/Imported-copy.gbatracker', encode(firstPackage));
      const secondSave = await window.electronAPI.saveTrackerProject('Collections/Imported-copy.gbatracker', encode(secondPackage));
      const sameIdentitySave = await window.electronAPI.saveTrackerProject('Collections/Imported-copy.gbatracker', encode(firstPackage));
      const listed = await window.electronAPI.listTrackerProjects();
      const loaded = await window.electronAPI.loadTrackerProject(secondSave.filename);
      const traversal = await window.electronAPI.saveTrackerProject('../escaped.gbatracker', encode(secondPackage));
      const deleted = await window.electronAPI.deleteTrackerProject(secondSave.filename);
      const listedAfterDelete = await window.electronAPI.listTrackerProjects();
      return { firstSave, secondSave, sameIdentitySave, listed, loaded, traversal, deleted, listedAfterDelete };
    }, { filename: importedProject.filename, project: importedProject });
    expect(nestedProject.firstSave.status).toBe('success');
    expect(nestedProject.secondSave.status).toBe('success');
    expect(nestedProject.firstSave.filename).toBe('Collections/Imported-copy/Imported-copy.gbatracker');
    expect(nestedProject.secondSave.filename).toBe('Collections/Imported-copy_1/Imported-copy.gbatracker');
    expect(nestedProject.sameIdentitySave.filename).toBe(nestedProject.firstSave.filename);
    expect(nestedProject.listed.files).toContain(nestedProject.firstSave.filename);
    expect(nestedProject.listed.files).toContain(nestedProject.secondSave.filename);
    expect(nestedProject.loaded.status).toBe('success');
    expect(nestedProject.traversal.status).toBe('error');
    expect(nestedProject.deleted.status).toBe('success');
    expect(nestedProject.listedAfterDelete.files).toContain(nestedProject.firstSave.filename);
    expect(nestedProject.listedAfterDelete.files).not.toContain(nestedProject.secondSave.filename);

    await expect(engine.getByText(/Originals|Originais|Originales|Originaux/).first()).toBeVisible();
    await expect(engine.getByText(/Music Projects|Projetos musicais|Proyectos musicales|Projets musicaux/).first()).toBeVisible();
    await expect(engine.getByRole('button', { name: /Export to assets|Exportar para assets|Exportar a assets|Exporter vers les assets/ })).toHaveCount(0);
    expect(fs.existsSync(path.join(projectDirectory, 'assets', 'music-exported'))).toBe(false);
    expect(fs.readFileSync(originalPath).equals(sourceModule)).toBe(true);
  } finally {
    await electronApp?.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('creates canonical GBA Tracker projects for each target profile', async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-target-profiles-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const targets = [
      ['MOD', 'Pocket Parade', 'retro', 4],
      ['XM', 'Stereo Expedition', 'beat', 4],
      ['S3M', 'Rocket Groove', 'tracker', 8],
      ['IT', 'Bug Parade', 'advanced', 8],
    ];
    for (const [format, profileName, profile, channels] of targets) {
      const before = await engine.evaluate(async () => (await window.electronAPI.listTrackerProjects()).files);
      await engine.getByRole('button', { name: /Create music|Criar m.sica/ }).click();
      await engine.getByRole('menuitem').filter({ hasText: new RegExp(`${profileName}.*${format}`) }).click();
      const editor = engine.getByLabel('Music beat editor');
      await expect(editor).toBeVisible();
      await expect(engine.getByTestId('right-panel-scroll').getByText(format, { exact: true })).toBeVisible();
      const packageState = await engine.evaluate(async beforeFiles => {
        const { parseTrackerModule } = await import('/src/utils/trackerModule.ts');
        const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
        const { exportMusicComposition } = await import('/src/utils/trackerCompositionExport.ts');
        const listed = await window.electronAPI.listTrackerProjects();
        const filename = listed.files.find(item => !beforeFiles.includes(item) && item.toLowerCase().endsWith('.gbatracker'));
        if (!filename) throw new Error('The newly created GBA Tracker project is missing.');
        const loaded = await window.electronAPI.loadTrackerProject(filename);
        const encoded = atob(loaded.data);
        const archive = parseTrackerProjectPackage(Uint8Array.from(encoded, character => character.charCodeAt(0)));
        const moduleData = new Uint8Array(exportMusicComposition(archive.composition, archive.composition.targetFormat).moduleData);
        const info = parseTrackerModule(moduleData.buffer, archive.composition.targetFormat);
        return { filename, format: archive.composition.targetFormat, target: archive.composition.targetFormat, profile: archive.composition.profile, channelCount: archive.composition.channels.length, sourceModules: archive.composition.sourceModules.length, moduleFormat: info.format, hasModuleCache: Object.hasOwn(archive, 'moduleData'), hasFormatCopy: Object.hasOwn(archive, 'format') };
      }, before);
      expect(packageState).toMatchObject({ format, target: format, profile, channelCount: channels, sourceModules: 0, moduleFormat: format, hasModuleCache: false, hasFormatCopy: false });
      const presetId = { MOD: 'sine-lead', XM: 'pulse-lead', S3M: 'triangle-bass', IT: 'noise-hit' }[format];
      await engine.evaluate(id => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'add-instrument', preset: id } })), presetId);
      const beatEditor = engine.getByLabel('Music beat editor');
      const instrumentName = `Studio ${format} Bass`;
      const presetName = ({ MOD: 'Sine Lead', XM: 'Pulse Lead', S3M: 'Triangle Bass', IT: 'Noise Hit' })[format];
      await engine.getByRole('button', { name: new RegExp(`02: ${presetName}`) }).click();
      const instrumentNameInput = engine.getByRole('textbox', { name: /Instrument name|Nome do instrumento|Nombre del instrumento|Nom de l’instrument/ });
      await expect(instrumentNameInput).toBeEnabled();
      await instrumentNameInput.fill(instrumentName);
      await instrumentNameInput.press('Tab');
      if (format === 'XM') {
        await engine.getByRole('tab', { name: /Envelopes|Envolventes|Enveloppes/ }).click();
        await engine.setViewportSize({ width: 1024, height: 700 });
        const envelopeLayout = await engine.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth, panel: document.querySelector('[data-testid="right-panel-scroll"]')?.getBoundingClientRect().width ?? 0 }));
        expect(envelopeLayout.document).toBeLessThanOrEqual(envelopeLayout.viewport + 2);
        expect(envelopeLayout.panel).toBeGreaterThan(0);
        await engine.getByRole('checkbox', { name: /Volume envelope Enabled|Envelope de volume Ativo|Envolvente de volumen Activo|Enveloppe de volume Activée/ }).check();
        await engine.getByRole('button', { name: /Add point|Adicionar ponto|Añadir punto|Ajouter un point/ }).first().click();
        await engine.getByRole('spinbutton', { name: /Tick 1/ }).fill('4');
        await engine.getByRole('spinbutton', { name: /Tick 1/ }).press('Tab');
        await engine.getByRole('spinbutton', { name: /Value 1|Valor 1|Valeur 1/ }).fill('0.4');
        await engine.getByRole('spinbutton', { name: /Value 1|Valor 1|Valeur 1/ }).press('Tab');
        await engine.getByRole('checkbox', { name: /Panning envelope Enabled|Envelope de pan Ativo|Envolvente de paneo Activo|Enveloppe de panoramique Activée/ }).check();
        await engine.getByRole('button', { name: /Add point|Adicionar ponto|Añadir punto|Ajouter un point/ }).last().click();
        await engine.getByRole('spinbutton', { name: /Fadeout|Fondu|Desvanecimiento/ }).fill('1024');
        await engine.getByRole('spinbutton', { name: /Fadeout|Fondu|Desvanecimiento/ }).press('Tab');
        await engine.getByRole('tab', { name: /Key zones|Zonas de notas/ }).click();
        const zonesLayout = await engine.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
        expect(zonesLayout.document).toBeLessThanOrEqual(zonesLayout.viewport + 2);
        await engine.getByRole('spinbutton', { name: /High note 1|Nota final 1|Nota máxima 1|Note haute 1/ }).fill('47');
        await engine.getByRole('spinbutton', { name: /High note 1|Nota final 1|Nota máxima 1|Note haute 1/ }).press('Tab');
        const addZoneAudioButton = engine.getByRole('button', { name: /sample selecionado|selected sample|sample seleccionado|sample sélectionné/i });
        await expect(addZoneAudioButton).toBeEnabled();
        await engine.locator('input[aria-label="Audio sample file"]').first().setInputFiles({ name: 'new-zone.wav', mimeType: 'audio/wav', buffer: createWavFixture() });
        const sampleImportDialog = engine.getByRole('dialog').filter({ hasText: 'new-zone.wav' });
        await expect(sampleImportDialog).toBeVisible();
        await sampleImportDialog.getByRole('button', { name: /Add to instrument|Adicionar ao instrumento|Añadir al instrumento|Ajouter à l’instrument/ }).click();
        await engine.setViewportSize({ width: 1440, height: 900 });
      }
      await beatEditor.getByRole('button', { name: /Save|Salvar|Guardar|Enregistrer/i }).click();
      const addedPreset = await engine.evaluate(async filename => {
        const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
        const loaded = await window.electronAPI.loadTrackerProject(filename);
        const encoded = atob(loaded.data);
        const archive = parseTrackerProjectPackage(Uint8Array.from(encoded, character => character.charCodeAt(0)));
        const instrument = archive.composition.instruments.at(-1);
        const sample = archive.composition.samples.find(item => item.id === instrument.sampleIds[0]);
        const newZone = instrument.noteMap.find(zone => zone.low === 48 && zone.high === 95);
        const zoneSample = newZone ? archive.composition.samples.find(item => item.id === newZone.sampleId) : null;
        return { id: instrument.id, name: instrument.name, sampleName: sample?.name, samples: archive.composition.samples.length, noteMap: instrument.noteMap, sampleId: sample?.id, pcmData: sample?.pcmData, zoneSampleId: zoneSample?.id, zoneSample: zoneSample && { name: zoneSample.name, sampleRate: zoneSample.sampleRate, channels: zoneSample.channels, bitDepth: zoneSample.bitDepth }, importedAudioSources: archive.importedAudioSources.length };
      }, packageState.filename);
      expect(addedPreset.name).toBe(instrumentName);
      expect(addedPreset.sampleName).toBe(presetName);
      expect(addedPreset, `${format} preset should retain its editable canonical instrument and zones`).toMatchObject({ samples: format === 'XM' ? 3 : 1 });
      expect(addedPreset.noteMap.map(({ low, high }) => ({ low, high }))).toEqual(format === 'XM'
        ? [{ low: 0, high: 47 }, { low: 48, high: 95 }]
        : [{ low: 0, high: 127 }]);
      if (format === 'XM') {
        expect(addedPreset.zoneSampleId).toMatch(/^[0-9a-f-]{36}$/i);
        expect(addedPreset.zoneSample).toMatchObject({ name: 'new-zone', sampleRate: 8363, channels: 1, bitDepth: 8 });
        expect(addedPreset.importedAudioSources).toBe(1);
      }
      expect(addedPreset.sampleId).toMatch(/^[0-9a-f-]{36}$/i);
      await engine.getByRole('button', { name: /Duplicate instrument|Duplicar instrumento|Dupliquer l’instrument/ }).click();
      const duplicateItem = engine.getByRole('button', { name: new RegExp(`03: ${instrumentName} (Copy|Cópia|Copia|Copie)`) });
      await expect(duplicateItem).toBeVisible();
      await duplicateItem.click();
      const duplicateNameInput = engine.getByRole('textbox', { name: /Instrument name|Nome do instrumento|Nombre del instrumento|Nom de lâ€™instrument/ });
      await expect(duplicateNameInput).toHaveValue(new RegExp(`^${instrumentName} (Copy|Cópia|Copia|Copie)$`));
      await beatEditor.getByRole('button', { name: /Save|Salvar|Guardar|Enregistrer/i }).click();
      const readDuplicatedPreset = async () => engine.evaluate(async filename => {
        const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
        const loaded = await window.electronAPI.loadTrackerProject(filename);
        const encoded = atob(loaded.data);
        const archive = parseTrackerProjectPackage(Uint8Array.from(encoded, character => character.charCodeAt(0)));
        const instrument = archive.composition.instruments.at(-1);
        const sample = archive.composition.samples.find(item => item.id === instrument.sampleIds[0]);
        return { id: instrument.id, name: instrument.name, sampleId: sample?.id, pcmData: sample?.pcmData, volumeEnvelope: instrument.volumeEnvelope, panningEnvelope: instrument.panningEnvelope, fadeout: instrument.fadeout, noteMap: instrument.noteMap };
      }, packageState.filename);
      await expect.poll(async () => (await readDuplicatedPreset()).name, { timeout: 10_000 }).toMatch(new RegExp(`^${instrumentName} (Copy|Cópia|Copia|Copie)$`));
      const duplicatedPreset = await readDuplicatedPreset();
      expect(duplicatedPreset.name).toMatch(new RegExp(`^${instrumentName} (Copy|Cópia|Copia|Copie)$`));
      expect(duplicatedPreset.id).not.toBe(addedPreset.id);
      expect(duplicatedPreset.sampleId).not.toBe(addedPreset.sampleId);
      expect(duplicatedPreset.pcmData).toBe(addedPreset.pcmData);
      if (format === 'XM') {
        expect(duplicatedPreset.volumeEnvelope).toMatchObject({ enabled: true, points: [{ tick: 4, value: 0.4 }] });
        expect(duplicatedPreset.panningEnvelope).toMatchObject({ enabled: true, points: [{ tick: 1, value: 0.5 }] });
        expect(duplicatedPreset.fadeout).toBe(1024);
        expect(duplicatedPreset.noteMap).toHaveLength(2);
        expect(duplicatedPreset.noteMap.map(({ low, high }) => ({ low, high }))).toEqual([{ low: 0, high: 47 }, { low: 48, high: 95 }]);
      }
      if (format === 'MOD') {
        await engine.locator('.ant-dropdown-trigger').first().click();
        await engine.getByRole('menuitem').filter({ hasText: /m.sic/i }).click();
        await engine.getByRole('listitem').getByText(packageState.filename, { exact: true }).click();
        await expect(engine.getByLabel('Music beat editor')).toContainText('MOD · 4 channels');
      }
      if (format !== 'IT') {
        await engine.locator('.ant-dropdown-trigger').first().click();
        await engine.getByRole('menuitem').filter({ hasText: /m.sic/i }).click();
      }
    }
  } finally {
    await electronApp?.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('switches the canonical music target and restores channels through a narrower target', async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-target-switch-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    const before = await engine.evaluate(async () => (await window.electronAPI.listTrackerProjects()).files);
    await engine.getByRole('button', { name: /Create music|Criar m.sica/ }).click();
    await engine.getByRole('menuitem').filter({ hasText: /Rocket Groove.*S3M/ }).click();
    const editor = engine.getByLabel('Music beat editor');
    const initialTargetWarning = engine.getByRole('dialog').filter({ hasText: /Review the target limitations|Revise as limita/ });
    if (await initialTargetWarning.count()) {
      await expect(initialTargetWarning).toContainText(/S3M exports a silent placeholder|S3M exporta um placeholder silencioso/);
      await initialTargetWarning.getByRole('button', { name: /Switch target|Trocar formato/ }).click();
    }
    await expect(editor).toContainText('S3M · 8 channels');
    const packageFilename = await engine.evaluate(async beforeFiles =>
      (await window.electronAPI.listTrackerProjects()).files.find(name => !beforeFiles.includes(name) && name.endsWith('.gbatracker')),
    before);
    expect(packageFilename).toBeTruthy();
    const originalChannelIds = await engine.evaluate(async filename => {
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const loaded = await window.electronAPI.loadTrackerProject(filename);
      const encoded = atob(loaded.data);
      const project = parseTrackerProjectPackage(Uint8Array.from(encoded, character => character.charCodeAt(0)));
      return project.composition.channels.map(channel => channel.id);
    }, packageFilename);

    const switchTo = async (target, optionName, visibleChannelCount) => {
      await engine.locator('.gba-beat-toolbar-actions .ant-select-selector').click();
      await expect(engine.getByRole('option').filter({ hasText: new RegExp(optionName) })).toBeVisible();
      await engine.getByRole('option').filter({ hasText: new RegExp(optionName) }).click();
      let confirmation = engine.getByRole('dialog').filter({ hasText: /Review the target limitations|Revise as limita/ });
      if (await confirmation.count()) {
        if (target === 'MOD') {
          await expect(confirmation).toContainText(/MOD supports 4 channels; 4 additional source channels remain preserved|MOD suporta 4 canais; 4 canais adicionais da composição continuam preservados/);
        } else {
          await expect(confirmation).toContainText(/S3M exports a silent placeholder|S3M exporta um placeholder silencioso/);
        }
        if (target === 'MOD') {
          await confirmation.getByRole('button', { name: /Cancel|Cancelar/ }).click();
          await expect(engine.getByLabel('Music beat editor')).toContainText('S3M · 8 channels');
          await engine.locator('.gba-beat-toolbar-actions .ant-select-selector').click();
          await engine.getByRole('option').filter({ hasText: new RegExp(optionName) }).click();
          confirmation = engine.getByRole('dialog').filter({ hasText: /Review the target limitations|Revise as limita/ });
          await expect(confirmation).toContainText(/MOD supports 4 channels; 4 additional source channels remain preserved|MOD suporta 4 canais; 4 canais adicionais da composição continuam preservados/);
        }
        await confirmation.getByRole('button', { name: /Switch target|Trocar formato/ }).click();
      }
      await expect(engine.getByLabel('Music beat editor')).toContainText(`${target} · ${visibleChannelCount} channels`);
    };

    await switchTo('MOD', 'Pocket Parade.*MOD', 4);
    const modState = await engine.evaluate(async filename => {
      const { parseTrackerModule } = await import('/src/utils/trackerModule.ts');
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const { exportMusicComposition } = await import('/src/utils/trackerCompositionExport.ts');
      const loaded = await window.electronAPI.loadTrackerProject(filename);
      const encoded = atob(loaded.data);
      const project = parseTrackerProjectPackage(Uint8Array.from(encoded, character => character.charCodeAt(0)));
      const moduleData = exportMusicComposition(project.composition, project.composition.targetFormat).moduleData;
      return { target: project.composition.targetFormat, hasModuleCache: Object.hasOwn(project, 'moduleData'), hasFormatCopy: Object.hasOwn(project, 'format'), channelIds: project.composition.channels.map(channel => channel.id), module: parseTrackerModule(moduleData, project.composition.targetFormat) };
    }, packageFilename);
    expect(modState.target).toBe('MOD');
    expect(modState.hasModuleCache).toBe(false);
    expect(modState.hasFormatCopy).toBe(false);
    expect(modState.channelIds).toEqual(originalChannelIds);
    expect(modState.module).toMatchObject({ format: 'MOD', channels: 4 });

    await switchTo('S3M', 'Rocket Groove.*S3M', 8);
    const restoredState = await engine.evaluate(async filename => {
      const { parseTrackerModule } = await import('/src/utils/trackerModule.ts');
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const { exportMusicComposition } = await import('/src/utils/trackerCompositionExport.ts');
      const loaded = await window.electronAPI.loadTrackerProject(filename);
      const encoded = atob(loaded.data);
      const project = parseTrackerProjectPackage(Uint8Array.from(encoded, character => character.charCodeAt(0)));
      const moduleData = exportMusicComposition(project.composition, project.composition.targetFormat).moduleData;
      return { target: project.composition.targetFormat, hasModuleCache: Object.hasOwn(project, 'moduleData'), hasFormatCopy: Object.hasOwn(project, 'format'), channelIds: project.composition.channels.map(channel => channel.id), module: parseTrackerModule(moduleData, project.composition.targetFormat) };
    }, packageFilename);
    expect(restoredState.target).toBe('S3M');
    expect(restoredState.hasModuleCache).toBe(false);
    expect(restoredState.hasFormatCopy).toBe(false);
    expect(restoredState.channelIds).toEqual(originalChannelIds);
    expect(restoredState.module).toMatchObject({ format: 'S3M', channels: 8 });
  } finally {
    await electronApp?.close();
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('creates, edits and saves an XM beat in the Electron editor', async () => {
  test.setTimeout(120_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-editor-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, {
    recursive: true,
    filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`),
  });
  let electronApp;
  let previewEmulator;
  try {
    electronApp = await electron.launch({
      args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')],
    });
    await electronApp.firstWindow();
    await expect.poll(() => electronApp.windows().map(page => page.url())).toContainEqual(expect.stringMatching(/#engine/));
    const engine = electronApp.windows().find(page => page.url().includes('#engine'));
    if (!engine) throw new Error('The Engine window did not open.');
    engine.setDefaultTimeout(5_000);

    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await engine.locator('.ant-dropdown-trigger').first().click();
    await engine.getByRole('menuitem').filter({ hasText: /m.sic/i }).click();
    await engine.getByRole('button', { name: /^(Create music|Criar m.sica)$/ }).click();
    await engine.getByRole('menuitem').filter({ hasText: /XM \(\.xm\)/ }).click();
    const editor = engine.getByLabel('Music beat editor');
    await expect(editor).toBeVisible();
    await expect(engine.getByTestId('right-panel-scroll')).toBeVisible();
    await expect(engine.getByRole('button', { name: 'MÚSICAS', exact: true })).toBeVisible();
    await expect(editor.locator('.gba-beat-sidebar')).toBeHidden();
    await expect(editor.locator('.gba-beat-inspector')).toBeHidden();
    await editor.getByRole('button', { name: 'P01', exact: true }).click();
    const patternName = engine.getByLabel(/Pattern name|Nome do padr|Nombre del patr|Nom du pattern/);
    await patternName.fill('Intro');
    await patternName.press('Tab');
    await expect(patternName).toHaveValue('Intro');
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+z');
    await expect(patternName).toHaveValue('Pattern 1');
    await engine.keyboard.press('Control+Shift+z');
    await expect(patternName).toHaveValue('Intro');
    const patternLength = engine.getByTestId('right-panel-scroll').getByLabel(/Length \(rows\)|Dura.* \(linhas\)|Duraci.* \(filas\)|Dur.* \(lignes\)/);
    await patternLength.fill('48');
    await patternLength.press('Tab');
    await expect(patternLength).toHaveValue('48');
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+z');
    await expect(patternLength).toHaveValue('64');
    await engine.keyboard.press('Control+Shift+z');
    await expect(patternLength).toHaveValue('48');
    await patternLength.fill('256');
    await patternLength.press('Tab');
    await expect(patternLength).toHaveValue('256');
    expect(await editor.locator('.gba-beat-cell').count()).toBe(96);
    const longPatternGrid = await editor.locator('.gba-beat-grid').evaluate(element => ({ width: element.scrollWidth, height: element.scrollHeight }));
    const longPatternViewportWidth = await editor.locator('.gba-beat-scroll').evaluate(element => element.clientWidth);
    expect(longPatternGrid.width).toBeGreaterThan(longPatternViewportWidth);
    expect(longPatternGrid.height).toBeGreaterThan(1_000);
    await patternLength.fill('48');
    await patternLength.press('Tab');
    await expect(patternLength).toHaveValue('48');
    await editor.locator('.gba-beat-roll').focus();
    await engine.keyboard.press('Control+z');
    await expect(patternLength).toHaveValue('256');
    await engine.keyboard.press('Control+Shift+z');
    await expect(patternLength).toHaveValue('48');
    const themedSurface = await editor.evaluate(element => {
      const expected = document.createElement('div');
      expected.style.backgroundColor = getComputedStyle(element).getPropertyValue('--music-surface-base').trim();
      document.body.append(expected);
      const expectedColor = getComputedStyle(expected).backgroundColor;
      expected.remove();
      const toolbar = element.querySelector('.gba-beat-toolbar');
      return {
        expectedColor,
        actualColor: getComputedStyle(element).backgroundColor,
        primary: getComputedStyle(element).getPropertyValue('--music-primary').trim(),
        editorGlow: getComputedStyle(element).boxShadow,
        toolbarGradient: getComputedStyle(toolbar).backgroundImage,
        transitionDuration: getComputedStyle(element).transitionDuration,
      };
    });
    expect(themedSurface.actualColor).toBe(themedSurface.expectedColor);
    expect(themedSurface.primary).toBeTruthy();
    expect(themedSurface.editorGlow).not.toBe('none');
    expect(themedSurface.toolbarGradient).toContain('linear-gradient');
    expect(themedSurface.transitionDuration).toContain('0.18s');
    await engine.evaluate(installBrowserPreviewAudioTap);
    const instrumentPanelHeader = engine.getByRole('button', { name: 'INSTRUMENTS', exact: true });
    if (await instrumentPanelHeader.getAttribute('aria-expanded') === 'false') await instrumentPanelHeader.click();
    await engine.getByRole('button', { name: /Add instrument|Adicionar instrumento|A.*adir instrumento|Ajouter un instrument/ }).click();
    const addedInstrument = engine.getByRole('button', { name: /Instrument 02|02: Sine Lead/ });
    await expect(addedInstrument).toBeVisible();
    await addedInstrument.click();
    await engine.getByRole('button', { name: /Replace selected sample with audio|Substituir sample selecionado|Remplacer le sample/ }).click();
    await engine.locator('input[aria-label="Audio sample file"]').setInputFiles({ name: 'kick.wav', mimeType: 'audio/wav', buffer: createWavFixture() });
    await expect(engine.getByRole('img', { name: /Audio sample waveform|Forma de onda do áudio|Forma de onda del audio|Forme d’onde audio/ })).toBeVisible();
    await expect(engine.locator('audio')).toHaveAttribute('src', /^blob:/);
    await expect(engine.getByText(/kick: C4.*B7/)).toHaveCount(0);
    await engine.getByRole('button', { name: /Discard take|Descartar gravação|Descartar toma|Supprimer la prise/ }).click();
    await expect(engine.getByText(/kick: C4.*B7/)).toHaveCount(0);
    await expect(engine.getByRole('dialog')).toBeHidden();
    await engine.getByRole('button', { name: /Replace selected sample with audio|Substituir sample selecionado|Remplacer le sample/ }).click();
    await engine.locator('input[aria-label="Audio sample file"]').setInputFiles({ name: 'kick.wav', mimeType: 'audio/wav', buffer: createWavFixture() });
    await expect(engine.getByRole('img', { name: /Audio sample waveform|Forma de onda do áudio|Forma de onda del audio|Forme d’onde audio/ })).toBeVisible();
    await engine.getByLabel(/Trim start|Início do corte|Inicio del recorte|Début de coupe/).fill('0.02');
    await engine.getByLabel(/Trim end|Fim do corte|Fin del recorte|Fin de coupe/).fill('0.10');
    await engine.getByLabel(/Remove DC offset|Remover componente DC|Quitar componente DC|Supprimer la composante continue/).click();
    await engine.getByLabel(/Fade-in|Fundido de entrada|Fondu d’entrée/).fill('10');
    await engine.getByLabel(/Fade-out|Fundido de salida|Fondu de sortie/).fill('10');
    await expect.poll(() => engine.locator('audio').evaluate(audio => audio.duration)).toBeGreaterThan(0.079);
    await expect.poll(() => engine.locator('audio').evaluate(audio => audio.duration)).toBeLessThan(0.081);
    const addSampleToInstrument = engine.getByRole('button', { name: /Add to instrument|Adicionar ao instrumento|Añadir al instrumento|Ajouter à l’instrument/ });
    await expect(addSampleToInstrument).toBeEnabled();
    await addSampleToInstrument.click();
    await expect(engine.getByText(/kick: C4.*B7/)).toBeVisible();
    await engine.evaluate(encoded => {
      const binary = atob(encoded);
      const wav = Uint8Array.from(binary, character => character.charCodeAt(0));
      const blob = new Blob([wav], { type: 'audio/wav' });
      const stoppedTracks = [];
      window.__stoppedTracks = stoppedTracks;
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new DOMException('denied by test', 'NotAllowedError'); } } });
      window.__deniedMediaRequests = 0;
      const deniedGetUserMedia = navigator.mediaDevices.getUserMedia;
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async (...args) => { window.__deniedMediaRequests += 1; return deniedGetUserMedia(...args); } } });
      class FakeMediaRecorder {
        static isTypeSupported() { return false; }
        constructor() { this.state = 'inactive'; this.mimeType = 'audio/wav'; window.__fakeRecorderStarts = 0; window.__fakeRecorderStops = stoppedTracks; }
        start() { this.state = 'recording'; window.__fakeRecorderStarts += 1; }
        stop() { this.state = 'inactive'; if (window.__fakeRecorderEmitData !== false) this.ondataavailable?.({ data: blob }); this.onstop?.(); }
      }
      Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
    }, createWavFixture().toString('base64'));
    await engine.getByRole('button', { name: /Record microphone|Gravar pelo microfone/ }).click();
    await engine.getByRole('button', { name: /Start microphone recording|Iniciar gravação do microfone/ }).click();
    await expect(engine.getByText(/Microphone permission was not granted|A permissão do microfone não foi concedida|No se concedió permiso para el micrófono|L’autorisation du microphone a été refusée/)).toBeVisible();
    await expect.poll(() => engine.evaluate(() => window.__deniedMediaRequests)).toBe(1);
    await expect(engine.getByText(/kick: C4.*B7/)).toBeVisible();
    await engine.evaluate(() => {
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new DOMException('no microphone connected', 'NotFoundError'); } } });
    });
    await engine.getByRole('button', { name: /Start microphone recording|Iniciar gravação do microfone/ }).click();
    await expect(engine.getByText(/Microphone recording is unavailable in this environment|A gravação pelo microfone não está disponível neste ambiente|La grabación con micrófono no está disponible en este entorno|L’enregistrement au microphone est indisponible dans cet environnement/)).toBeVisible();
    await expect(engine.getByText(/kick: C4.*B7/)).toBeVisible();
    await engine.evaluate(() => {
      const stoppedTracks = window.__stoppedTracks;
      window.__requestedMicrophoneConstraints = null;
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
        enumerateDevices: async () => [{ kind: 'audioinput', deviceId: 'test-mic-42', label: 'Test USB microphone' }],
        getUserMedia: async constraints => { window.__requestedMicrophoneConstraints = constraints; return { getTracks: () => [{ stop: () => stoppedTracks.push(true) }] }; },
      } });
    });
    await engine.getByTestId('music-microphone-device').click();
    await expect(engine.getByText('Test USB microphone', { exact: true })).toBeVisible();
    await engine.getByText('Test USB microphone', { exact: true }).click();
    await engine.getByRole('button', { name: /Start microphone recording|Iniciar gravação do microfone/ }).click();
    await expect(engine.getByText(/^(Recording|Gravando)$/)).toBeVisible();
    await expect.poll(() => engine.evaluate(() => window.__requestedMicrophoneConstraints?.audio?.deviceId?.exact)).toBe('test-mic-42');
    await engine.getByRole('button', { name: /Stop recording|Parar gravação/ }).click();
    await expect(engine.getByRole('img', { name: /Audio sample waveform|Forma de onda do áudio|Forma de onda del audio|Forme d’onde audio/ })).toBeVisible();
    await expect(engine.locator('audio')).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => engine.evaluate(() => window.__fakeRecorderStarts)).toBe(1);
    await expect.poll(() => engine.evaluate(() => window.__fakeRecorderStops.length)).toBe(1);
    await engine.getByRole('dialog').getByRole('button', { name: /Add to instrument|Adicionar ao instrumento|Añadir al instrumento|Ajouter à l’instrument|Replace selected sample|Substituir sample selecionado|Reemplazar muestra seleccionada|Remplacer le sample sélectionné/ }).click();
    const rightPanel = engine.getByTestId('right-panel-scroll');
    const microphoneZone = rightPanel.getByText(/^microphone-take:/);
    await expect(microphoneZone).toBeVisible();
    await engine.evaluate(() => window.dispatchEvent(new Event('gba-studio:editor-undo')));
    await expect(microphoneZone).toHaveCount(0);
    await engine.evaluate(() => window.dispatchEvent(new Event('gba-studio:editor-redo')));
    await expect(microphoneZone).toBeVisible();
    await engine.getByRole('button', { name: /Record microphone|Gravar pelo microfone/ }).click();
    await engine.evaluate(() => { window.__fakeRecorderEmitData = false; });
    await engine.getByRole('button', { name: /Start microphone recording|Iniciar gravação do microfone/ }).click();
    await engine.getByRole('button', { name: /Stop recording|Parar gravação/ }).click();
    await expect(engine.getByText(/The microphone produced no audio|O microfone não produziu áudio|El micrófono no produjo audio|Le microphone n’a produit aucun son/)).toBeVisible();
    await expect(microphoneZone).toBeVisible();
    await engine.evaluate(() => { window.__fakeRecorderEmitData = true; });
    await engine.getByRole('dialog').locator('.ant-modal-close').click();
    await expect(engine.getByRole('dialog')).toBeHidden();
    const sampleVolume = engine.getByRole('spinbutton', { name: /Sample volume|Volume da amostra|Volumen de muestra|Volume de l./ });
    const loopStart = engine.getByLabel(/Loop start \(samples\)|In.cio do loop \(amostras\)|Inicio del loop \(muestras\)|D.but de boucle/);
    const loopEnd = engine.getByLabel(/Loop end \(samples\)|Fim do loop \(amostras\)|Fin del loop \(muestras\)|Fin de boucle/);
    const rootNote = engine.getByLabel(/Root note \(MIDI\)|Nota raiz \(MIDI\)|Nota ra.z \(MIDI\)|Note fondamentale \(MIDI\)/);
    const fineTune = engine.getByLabel(/Fine tune \(1\/128 semitone\)|Afin.*fina|Accord fin/);
    const samplePan = engine.getByRole('spinbutton', { name: /Sample pan \(0.?255\)|Pan da amostra \(0.?255\)|Pan de muestra \(0.?255\)|Pan de l./ });
    await sampleVolume.fill('48');
    await expect(sampleVolume).toHaveValue('48');
    await loopEnd.fill('80');
    await expect(loopEnd).toHaveValue('80');
    await loopStart.fill('8');
    await expect(loopStart).toHaveValue('8');
    await rootNote.fill('52');
    await expect(rootNote).toHaveValue('52');
    await fineTune.fill('-10');
    await expect(fineTune).toHaveValue('-10');
    await samplePan.fill('180');
    await expect(samplePan).toHaveValue('180');
    await sampleVolume.hover();
    await expect(engine.getByRole('tooltip')).toContainText('O volume do cabeçalho do sample XM define o padrão quando o instrumento o solicita; comandos de volume do pattern podem substituí-lo.');
    await engine.evaluate(() => {
      window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-channel', { detail: { kind: 'volume', value: 0.75 } }));
      window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-channel', { detail: { kind: 'pan', value: -0.25 } }));
    });
    await engine.getByText('Keyboard', { exact: true }).click();
    const sampleZoneKeyboardKey = engine.locator('.gba-keyboard-keys button').nth(12);
    for (let note = 0; note < 4; note += 1) await sampleZoneKeyboardKey.click();
    await engine.getByText('Piano roll', { exact: true }).click();
    await expect(editor.locator('[data-note="true"]')).toHaveCount(4);
    await editor.locator('[data-note="true"]').last().click();
    await expect(engine.getByText(/NOTE INSPECTOR|INSPECIONAR NOTA/, { exact: true })).toBeVisible();
    await engine.locator('.ant-segmented-item-label').getByText('Tracker', { exact: true }).click();
    await expect(editor.getByRole('grid', { name: 'Tracker pattern 1' })).toBeVisible();
    await engine.locator('.ant-segmented-item-label').getByText('Piano roll', { exact: true }).click();
    await expect(editor.locator('[data-note="true"].selected')).toHaveCount(1);
    await expect(engine.getByText(/NOTE INSPECTOR|INSPECIONAR NOTA/, { exact: true })).toBeVisible();
    await expect(engine.getByLabel(/Row|Linha/)).toHaveValue('13');
    const selectedNoteLength = engine.getByLabel(/Length \(rows\)|Dura.* \(linhas\)|Duraci.* \(filas\)|Dur.* \(lignes\)/).last();
    await selectedNoteLength.fill('35');
    await selectedNoteLength.press('Tab');
    await expect(selectedNoteLength).toHaveValue('35');
    await engine.getByLabel(/Music note volume|Volume da nota musical/).fill('75');
    await expect(engine.getByLabel(/Music note volume|Volume da nota musical/)).toHaveValue('75');
    const notePanSlider = engine.getByRole('slider', { name: /Note stereo pan|Pan estéreo da nota/ });
    await expect(notePanSlider).toBeVisible();
    await notePanSlider.press('Home');
    await expect(notePanSlider).toHaveAttribute('aria-valuenow', '-1');
    for (let step = 0; step < 8; step += 1) {
      await notePanSlider.press('ArrowRight');
      await expect(notePanSlider).toHaveAttribute('aria-valuenow', String(-0.75 + step * 0.25));
    }
    await notePanSlider.press('Home');
    await notePanSlider.press('ArrowRight');
    await notePanSlider.press('ArrowRight');
    await notePanSlider.press('ArrowRight');
    await expect(notePanSlider).toHaveAttribute('aria-valuenow', '-0.25');
    await expect(engine.getByText('L 25%', { exact: true })).toBeVisible();
    await expect(engine.getByTestId('right-panel-scroll').getByLabel(/Song tempo|^Tempo$/)).toHaveValue('125');
    // Preview from the first note so selecting the last note for inspection does not skip the phrase.
    await editor.locator('[data-note="true"]').first().click();
    await engine.evaluate(() => { if (window.__musicPreviewCapture) window.__musicPreviewCapture.chunks.length = 0; });
    await engine.getByRole('button', { name: /Quick preview|Prévia rápida|Vista previa rápida|Aperçu rapide/ }).click();
    await engine.waitForTimeout(2_000);
    const browserAudio = await engine.evaluate(finishAudioCapture);
    expect(browserAudio.rms).toBeGreaterThan(0.0001);
    expect(browserAudio.peak).toBeGreaterThan(0.001);
    expect(browserAudio.activeDuration).toBeGreaterThan(0.02);
    await engine.getByRole('button', { name: /Stop|Parar|Detener|Arrêter/ }).click();
    await engine.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-channel', { detail: { kind: 'toggle-mute' } })));
    const toolbarRows = await editor.evaluate(element => {
      const actions = element.querySelector('.gba-beat-toolbar-actions').getBoundingClientRect();
      const settings = element.querySelector('.gba-beat-toolbar-settings').getBoundingClientRect();
      return { actionsBottom: actions.bottom, settingsTop: settings.top };
    });
    expect(toolbarRows.settingsTop).toBeGreaterThanOrEqual(toolbarRows.actionsBottom - 1);

    await editor.locator('.gba-piano-roll-pattern-band').first().click();
    await engine.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:gba-editor-command', { detail: { command: 'duplicate' } })));
    await expect(editor.locator('.gba-order-card')).toHaveCount(2);
    await expect(editor.locator('.gba-order-card.selected')).toContainText('PATTERN 2');
    await editor.getByRole('button', { name: 'Move order 2 left' }).click();
    await expect(editor.locator('.gba-order-card').first()).toContainText('PATTERN 2');
    const noteIsVisibleInPitchRange = await editor.locator('.gba-beat-scroll').evaluate(scroll => {
      const bounds = scroll.getBoundingClientRect();
      return [...scroll.querySelectorAll('[data-note="true"]')].some(note => {
        const noteBounds = note.getBoundingClientRect();
        return noteBounds.bottom > bounds.top && noteBounds.top < bounds.bottom;
      });
    });
    expect(noteIsVisibleInPitchRange).toBe(true);

    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await engine.screenshot({ path: screenshotPath });
    await editor.getByRole('button', { name: /Save|Salvar|Enregistrer/ }).click();
    await expect(engine.getByText(/Music saved\.|Música salva\.|Música guardada\.|Musique enregistrée\./)).toBeVisible();

    const savedModuleName = await engine.evaluate(async () =>
      (await window.electronAPI.listTrackerProjects()).files.find(name => /new-beat-.*\.gbatracker$/i.test(name)));
    expect(savedModuleName).toBeTruthy();
    const savedProject = await engine.evaluate(async filename => {
      const result = await window.electronAPI.loadTrackerProject(filename);
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const binary = atob(result.data);
      return parseTrackerProjectPackage(Uint8Array.from(binary, character => character.charCodeAt(0)));
    }, savedModuleName);
    expect(savedProject.importedAudioSources).toHaveLength(2);
    expect(savedProject.importedAudioSources.every(source => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(source.id))).toBe(true);
    expect(savedProject.importedAudioSources.map(source => source.fileName)).toEqual(['kick.wav', 'microphone-take.webm']);
    expect(savedProject.importedAudioSources.map(source => source.sourceAudioData)).toEqual(Array(2).fill(createWavFixture().toString('base64')));
    for (const source of savedProject.importedAudioSources) {
      const pcm = Buffer.from(source.sourcePcmData, 'base64');
      expect(source.pcmEncoding).toBe('float32le-interleaved');
      expect(pcm.length).toBe(source.pcmFrames * source.channels * Float32Array.BYTES_PER_ELEMENT);
      let sourcePeak = 0;
      for (let offset = 0; offset < pcm.length; offset += Float32Array.BYTES_PER_ELEMENT) sourcePeak = Math.max(sourcePeak, Math.abs(pcm.readFloatLE(offset)));
      expect(sourcePeak).toBeGreaterThan(0.05);
    }
    expect(savedProject.moduleData).toBeUndefined();
    expect(savedProject.originalModuleData).toBeUndefined();
    expect(savedProject.format).toBeUndefined();
    const savedTargetModule = await exportCompositionModuleData(engine, savedProject.composition);
    const moduleBytes = Buffer.from(savedTargetModule, 'base64');
    const moduleView = new DataView(moduleBytes.buffer, moduleBytes.byteOffset, moduleBytes.byteLength);
    const xmSampleAudit = await engine.evaluate(async encodedModule => {
      const { parseTrackerPlaybackRows, parseXmSamples } = await import('/src/utils/trackerModule.ts');
      const binary = atob(encodedModule);
      const module = Uint8Array.from(binary, character => character.charCodeAt(0));
      const instrument = parseXmSamples(module.buffer).get(2);
      const zone = instrument?.variants?.[1];
      return {
        instrumentCount: module[72] | (module[73] << 8),
        noteMappedSample: instrument?.noteMap?.[48] ?? null,
        zoneLength: zone?.samples.length ?? 0,
        pcmPeak: zone ? zone.samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0) : 0,
        firstSample: zone?.samples[0] ?? null,
        lastSample: zone?.samples.at(-1) ?? null,
      };
    }, moduleBytes.toString('base64'));
    console.log(`Exported XM sample audit: ${JSON.stringify(xmSampleAudit)}.`);
    expect(xmSampleAudit).toMatchObject({ instrumentCount: 2, noteMappedSample: 1 });
    expect(xmSampleAudit.zoneLength).toBeGreaterThan(100);
    expect(xmSampleAudit.pcmPeak).toBeGreaterThan(0.01);
    expect(xmSampleAudit.zoneLength).toBe(669);
    expect(Math.abs(xmSampleAudit.firstSample)).toBeLessThan(0.01);
    expect(Math.abs(xmSampleAudit.lastSample)).toBeLessThan(0.01);
    expect(savedProject.importedAudioSources[0]).toMatchObject({ trimStart: 0.02, trimEnd: 0.10, removeDc: true, fadeInMs: 10, fadeOutMs: 10 });
    const patternOffset = 60 + moduleView.getUint32(60, true);
    const patternHeaderSize = moduleView.getUint32(patternOffset, true);
    expect(moduleView.getUint16(patternOffset + 5, true)).toBe(48);
    expect(xmSampleAudit.noteMappedSample).toBe(1);
    const rowOffset = row => patternOffset + patternHeaderSize + row * moduleView.getUint16(68, true) * 6;
    expect(moduleBytes[rowOffset(0) + 1]).toBeGreaterThan(0);
    expect(moduleBytes[rowOffset(12) + 3]).toBe(0x10); // The event's channel is muted in the saved mixer.
    expect(moduleBytes[rowOffset(12) + 4]).toBe(0x08);
    expect(moduleBytes[rowOffset(12) + 5]).toBe(64); // The note snaps to -25%; with channel pan -25%, XM stores -50%.
    expect(moduleBytes[rowOffset(47) + 1]).toBe(97);

    const composition = savedProject.composition;
    const savedCanonicalNote = composition.patterns[0].notes.find(note => note.row === 12);
    const canonicalSampleInstrument = composition.instruments.find(instrument => instrument.index === 1);
    const canonicalMicrophoneSample = composition.samples.find(sample => sample.id === canonicalSampleInstrument?.sampleIds[0]);
    const canonicalKickZone = canonicalSampleInstrument?.noteMap.find(zone => zone.low === 48 && zone.high === 95);
    const canonicalKickSample = composition.samples.find(sample => sample.id === canonicalKickZone?.sampleId);
    expect(savedCanonicalNote.pan).toBe(-0.25);
    expect(savedCanonicalNote.volume).toBe(0.75);
    expect(savedCanonicalNote.instrumentId).toBe(canonicalSampleInstrument.id);
    expect(canonicalMicrophoneSample.name).toBe('microphone-take');
    expect(Buffer.from(canonicalMicrophoneSample.pcmData, 'base64').length).toBeGreaterThan(100);
    expect(canonicalKickSample).toMatchObject({ name: 'kick', loopType: 'none' });
    expect(xmSampleAudit.noteMappedSample).toBe(1);
    expect(xmSampleAudit.zoneLength).toBeGreaterThan(100);
    const musicEntityIds = [
      ...composition.channels.map(item => item.id),
      ...composition.instruments.map(item => item.id),
      ...composition.samples.map(item => item.id),
      ...composition.patterns.flatMap(pattern => [pattern.id, ...pattern.commands.map(command => command.id), ...pattern.notes.map(note => note.id)]),
      ...composition.order.map(item => item.id),
    ];
    expect(musicEntityIds.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))).toBe(true);
    expect(new Set(musicEntityIds).size).toBe(musicEntityIds.length);
    expect(composition.instruments).toHaveLength(2);
    expect(composition.channels[0]).toMatchObject({ volume: 0.75, pan: -0.25, muted: true });
    expect(composition.patterns[0].notes).toHaveLength(4);
    expect(composition.patterns[1].notes).toHaveLength(4);
    expect(composition.patterns[0].notes[0].id).not.toBe(composition.patterns[1].notes[0].id);
    expect(composition.order.map(entry => composition.patterns.find(pattern => pattern.id === entry.patternId)?.index)).toEqual([1, 0]);
    expect(composition.patterns[0].name).toBe('Intro');
    expect(composition.patterns[0].rows).toBe(48);
    expect(composition.patterns[0].notes[0]).toMatchObject({ row: 0, pitch: 49, durationRows: 4, instrumentId: canonicalSampleInstrument.id });
    expect(composition.patterns[0].notes[3]).toMatchObject({ row: 12, durationRows: 35, instrumentId: canonicalSampleInstrument.id });

    const userDataDirectory = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    const engineAudioPreference = await engine.evaluate(() => JSON.parse(localStorage.getItem('appSettings') ?? '{}'));
    await engine.locator('.ant-segmented-item-label').getByText('Piano roll', { exact: true }).click();
    await expect(editor.locator('.gba-piano-roll-pattern-band')).toHaveCount(2);
    await editor.locator('.gba-piano-roll-pattern-band[title^="P01"]').click();
    const previewPatternLength = engine.getByLabel(/Length \(rows\)|Dura.* \(linhas\)|Duraci.* \(filas\)|Dur.* \(lignes\)/).first();
    await previewPatternLength.fill('256');
    await previewPatternLength.press('Tab');
    await expect(previewPatternLength).toHaveValue('256');
    await editor.locator('.gba-piano-roll-pattern-band[title^="P02"]').click();
    await previewPatternLength.fill('256');
    await previewPatternLength.press('Tab');
    await expect(previewPatternLength).toHaveValue('256');
    await engine.evaluate(() => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-channel', { detail: { kind: 'toggle-mute' } })));
    await engine.getByText('Song', { exact: true }).click();
    await engine.getByText('Channel 01', { exact: true }).click();
    const channelMuteButton = engine.getByRole('button', { name: /^(Mute|Unmute) channel$/ });
    if ((await channelMuteButton.innerText()) === 'Unmute channel') await channelMuteButton.click();
    await expect(channelMuteButton).toHaveText('Mute channel');
    await engine.getByRole('button', { name: /Quick preview|Prévia rápida|Vista previa rápida|Aperçu rapide/ }).click();
    const eventLoopDuringPlayback = await engine.evaluate(() => new Promise(resolve => {
      const startedAt = performance.now();
      let previousAt = startedAt;
      let maxGapMs = 0;
      let ticks = 0;
      const timer = window.setInterval(() => {
        const now = performance.now();
        maxGapMs = Math.max(maxGapMs, now - previousAt);
        previousAt = now;
        ticks += 1;
        if (now - startedAt >= 1500) {
          window.clearInterval(timer);
          resolve({ durationMs: now - startedAt, maxGapMs, ticks });
        }
      }, 16);
    }));
    await expect(engine.getByRole('button', { name: /Stop|Parar|Detener|Arrêter/ })).toBeVisible();
    await engine.waitForTimeout(500);
    const browserSongAudio = await engine.evaluate(finishAudioCapture);
    await engine.getByRole('button', { name: /Stop|Parar|Detener|Arrêter/ }).click();
    expect(eventLoopDuringPlayback.ticks).toBeGreaterThan(0);
    expect(browserSongAudio.rms).toBeGreaterThan(0.0001);
    expect(browserSongAudio.peak).toBeGreaterThan(0.001);
    expect(browserSongAudio.activeDuration).toBeGreaterThan(0.02);
    await electronApp.context().addInitScript(installBrowserPreviewAudioTap);
    await engine.getByRole('button', { name: /Play ROM/ }).click();
    await waitForMaxmodPreviewStatus(editor, 45_000);
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    previewEmulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    expect(previewEmulator).toBeTruthy();
    const previewTapInstalled = await expect.poll(() => previewEmulator.evaluate(() => Boolean(window.__musicPreviewCapture)), { timeout: 5_000 })
      .toBe(true).then(() => true).catch(() => false);
    const emulatorTap = await previewEmulator.evaluate(() => ({
      capturedBlocksAtStartup: window.__musicPreviewCapture?.chunks.length ?? 0,
      audioNodeType: window.EJS_emulator?.gameManager?.audioNode?.constructor?.name ?? null,
    }));
    const emulatorAudioState = await previewEmulator.evaluate(() => ({
      emulatorCore: window.EJS_core,
      configuredVolume: window.EJS_emulator?.config?.volume,
      configuredMuted: window.EJS_emulator?.config?.muted,
      currentVolume: window.EJS_emulator?.volume,
      currentMuted: window.EJS_emulator?.muted,
      localStorageDisabled: window.EJS_emulator?.config?.disableLocalStorage,
      audioContextState: window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx?.state ?? null,
      audioSources: Object.entries(window.EJS_emulator?.Module?.AL?.currentCtx?.sources ?? {}).map(([key, source]) => ({
        key,
        sourceType: typeof source,
        gain: source?.gain?.gain?.value,
        contextState: source?.gain?.context?.state,
      })),
    }));
    const expectedVolume = typeof engineAudioPreference.demoAudioVolume === 'number' ? engineAudioPreference.demoAudioVolume : 1;
    const expectedMuted = engineAudioPreference.demoAudioMuted === true || expectedVolume === 0;
    expect(emulatorAudioState).toMatchObject({
      emulatorCore: 'gba',
      configuredVolume: expectedVolume,
      configuredMuted: engineAudioPreference.demoAudioMuted === true,
      currentVolume: expectedVolume,
      currentMuted: expectedMuted,
      localStorageDisabled: true,
    });
    expect(emulatorAudioState.audioContextState).toBe('running');
    expect(emulatorAudioState.audioSources.some(source => source.gain > 0 && source.contextState === 'running')).toBe(true);
    const openALCapture = await previewEmulator.evaluate(installEmulatorOpenALTap);
    expect(openALCapture).toBeTruthy();
    await previewEmulator.waitForTimeout(5_000);
    const romPreviewTapAudio = previewTapInstalled ? await previewEmulator.evaluate(finishAudioCapture, 'preview') : null;
    const romOpenALAudio = await previewEmulator.evaluate(finishAudioCapture, 'openal');
    const romAudio = romPreviewTapAudio?.rms > 0 ? romPreviewTapAudio : romOpenALAudio;
    expect(romAudio.rms).toBeGreaterThan(0.0001);
    expect(romAudio.activeDuration).toBeGreaterThan(0.01);
    const previewDirectory = path.join(userDataDirectory, 'gba-studio-play', 'roms');
    await expect.poll(() => fs.readdirSync(previewDirectory).filter(name => /^tracker-preview-\d+\.gba$/.test(name)), { timeout: 5_000 }).toHaveLength(1);
    const previewRomPath = path.join(previewDirectory, fs.readdirSync(previewDirectory).find(name => /^tracker-preview-\d+\.gba$/.test(name)));
    expect(fs.statSync(previewRomPath).size).toBeGreaterThan(0);
    await previewEmulator.close();
    previewEmulator = undefined;
    await expect.poll(() => fs.existsSync(previewRomPath), { timeout: 5_000 }).toBe(false);

    await engine.evaluate(async () => {
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const player = new TrackerPreviewPlayer();
      const rows = Array.from({ length: 65_536 }, () => []);
      for (let row = 0; row < 512; row += 1) {
        for (let channel = 0; channel < 4; channel += 1) {
          rows[row][channel] = { note: 49 + channel, instrument: 1, volume: 0, effect: 0, parameter: 0 };
        }
      }
      const button = document.createElement('button');
      button.id = 'music-long-audio-benchmark';
      button.textContent = 'Start long-song AudioContext measurement';
      document.body.appendChild(button);
      button.addEventListener('click', () => {
        const startedAt = performance.now();
        let previousAt = startedAt;
        let maxGapMs = 0;
        let ticks = 0;
        const audioCapture = { sumSquares: 0, peak: 0, minimum: Infinity, maximum: -Infinity, samples: 0 };
        const nativeConnect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (destination, ...args) {
          const result = nativeConnect.call(this, destination, ...args);
          if (destination === this.context.destination && !this.context.__longSongCapture) {
            const processor = this.context.createScriptProcessor(2048, 2, 2);
            const silentGain = this.context.createGain();
            silentGain.gain.value = 0;
            processor.onaudioprocess = event => {
              const samples = event.inputBuffer.getChannelData(0);
              for (let index = 0; index < samples.length; index += 1) {
                const magnitude = Math.abs(samples[index]);
                audioCapture.sumSquares += samples[index] * samples[index];
                audioCapture.peak = Math.max(audioCapture.peak, magnitude);
                audioCapture.minimum = Math.min(audioCapture.minimum, samples[index]);
                audioCapture.maximum = Math.max(audioCapture.maximum, samples[index]);
                audioCapture.samples += 1;
              }
            };
            nativeConnect.call(this, processor);
            nativeConnect.call(processor, silentGain);
            nativeConnect.call(silentGain, this.context.destination);
            this.context.__longSongCapture = processor;
          }
          return result;
        };
        const timer = window.setInterval(() => {
          const now = performance.now();
          maxGapMs = Math.max(maxGapMs, now - previousAt);
          previousAt = now;
          ticks += 1;
        }, 16);
        window.__musicLongSongPlayer = player;
        window.__musicLongSongRows = rows;
        window.__musicLongSongPreviewPromise = (async () => {
          const durationMs = await player.play(rows, 4, 6, 125, [], new Map(), 'MOD');
          const schedulingMs = performance.now() - startedAt;
          await new Promise(resolve => window.setTimeout(resolve, 3_000));
          const context = player.context;
          const rms = Math.sqrt(audioCapture.sumSquares / Math.max(1, audioCapture.samples));
          const playbackMs = performance.now() - startedAt - schedulingMs;
          window.clearInterval(timer);
          const captureProcessor = context?.__longSongCapture;
          captureProcessor?.disconnect();
          player.stop();
          void context?.close();
          AudioNode.prototype.connect = nativeConnect;
          button.remove();
          rows.length = 0;
          return {
            rows: 65_536,
            notes: 512 * 4,
            durationMs,
            schedulingMs,
            playbackMs,
            limiterKind: player.getLimiterKind(),
            maxGapMs,
            ticks,
            audioRms: rms,
            audioPeak: audioCapture.peak,
            audioMinimum: audioCapture.minimum,
            audioMaximum: audioCapture.maximum,
            audioSamples: audioCapture.samples,
          };
        })().catch(error => ({ error: error instanceof Error ? error.message : String(error) }));
      }, { once: true });
    });
    await engine.getByRole('button', { name: 'Start long-song AudioContext measurement' }).click();
    let longSongTimeout;
    const longSongBrowserMeasurement = await Promise.race([
      engine.evaluate(async () => await window.__musicLongSongPreviewPromise),
      new Promise(resolve => { longSongTimeout = setTimeout(() => resolve({ error: 'AudioContext scheduling did not finish within 10 s.' }), 10_000); }),
    ]);
    clearTimeout(longSongTimeout);
    expect(longSongBrowserMeasurement.error).toBeUndefined();
    expect(longSongBrowserMeasurement.rows).toBe(65_536);
    expect(longSongBrowserMeasurement.notes).toBe(2_048);
    expect(longSongBrowserMeasurement.durationMs).toBeGreaterThan(1_000_000);
    expect(longSongBrowserMeasurement.limiterKind).toBe('AudioWorklet');
    expect(longSongBrowserMeasurement.schedulingMs).toBeLessThan(5_000);
    expect(longSongBrowserMeasurement.playbackMs).toBeGreaterThanOrEqual(3_000);
    expect(longSongBrowserMeasurement.maxGapMs).toBeLessThan(250);
    expect(longSongBrowserMeasurement.ticks).toBeGreaterThan(100);
    expect(longSongBrowserMeasurement.audioRms).toBeGreaterThan(0.0005);
    // Signed PCM8 has an asymmetric full-scale range: -128/128 (-1) through +127/128.
    expect(longSongBrowserMeasurement.audioMinimum).toBeGreaterThanOrEqual(-1);
    expect(longSongBrowserMeasurement.audioMaximum).toBeLessThanOrEqual(127 / 128);
    await engine.evaluate(() => {
      const context = window.__musicLongSongPlayer?.context;
      window.__musicLongSongPlayer?.stop();
      void context?.close();
      document.getElementById('music-long-audio-benchmark')?.remove();
      if (window.__musicLongSongRows) window.__musicLongSongRows.length = 0;
      window.__musicLongSongPlayer = undefined;
      window.__musicLongSongRows = undefined;
      window.__musicLongSongPreviewPromise = undefined;
    });

    await electronApp.close();
    const fixtureMusicDirectory = path.join(projectDirectory, 'assets', 'musics');
    fs.writeFileSync(path.join(fixtureMusicDirectory, 'inspector.mod'), createModFixture());
    fs.writeFileSync(path.join(fixtureMusicDirectory, 'inspector.s3m'), createS3mFixture());
    fs.writeFileSync(path.join(fixtureMusicDirectory, 'inspector.it'), createItFixture());
    fs.writeFileSync(path.join(fixtureMusicDirectory, 'imported-fixture.xm'), moduleBytes);
    electronApp = await electron.launch({
      args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')],
    });
    const reopenedEngine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await expect(reopenedEngine.getByText(path.basename(savedModuleName, '.gbatracker'), { exact: false }).last()).toBeVisible({ timeout: 15_000 });
    await reopenedEngine.getByText(path.basename(savedModuleName, '.gbatracker'), { exact: false }).last().click();
    await expect(reopenedEngine.getByLabel('Music beat editor')).toBeVisible();
    const reopenedProjects = await reopenedEngine.evaluate(async filename => {
      const list = await window.electronAPI.listTrackerProjects();
      const loaded = await window.electronAPI.loadTrackerProject(filename);
      return { files: list.files, loadStatus: loaded.status };
    }, savedModuleName);
    expect(reopenedProjects.files).toContain(savedModuleName);
    expect(reopenedProjects.loadStatus).toBe('success');
    for (const [filename, format, pitch] of [['inspector.mod', 'MOD', '50'], ['inspector.s3m', 'S3M', '49'], ['inspector.it', 'IT', '49']]) {
      await reopenedEngine.getByRole('listitem').getByText(filename, { exact: true }).click();
      const discardTrackChanges = reopenedEngine.getByRole('button', { name: /Continue without saving|Continuar sem salvar/ });
      if (await discardTrackChanges.isVisible().catch(() => false)) await discardTrackChanges.click();
      await expect(reopenedEngine.getByRole('button', { name: /Import for editing|Importar para edi\u00e7\u00e3o|Éditer une copie|Importar para editar/ })).toBeVisible();
      await reopenedEngine.getByRole('button', { name: /Import for editing|Importar para edi\u00e7\u00e3o|Éditer une copie|Importar para editar/ }).click();
      await expect(reopenedEngine.getByTestId('right-panel-scroll').getByText(format, { exact: true })).toBeVisible();
      const sharedEditor = reopenedEngine.getByLabel('Music beat editor');
      await expect(sharedEditor).toBeVisible();
      await sharedEditor.locator('[data-note="true"]').first().click();
      await expect(reopenedEngine.getByLabel(/^(Pitch|Altura|Tono|Hauteur)$/)).toHaveValue(pitch);
      await reopenedEngine.getByLabel(/^(Pitch|Altura|Tono|Hauteur)$/).fill(String(Number(pitch) + 1));
      await expect(reopenedEngine.getByLabel(/^(Pitch|Altura|Tono|Hauteur)$/)).toHaveValue(String(Number(pitch) + 1));
      if (format === 'MOD') {
        await reopenedEngine.getByRole('button', { name: /01: Fixture sample/ }).click();
        const sampleVolumeInspector = reopenedEngine.getByRole('spinbutton', { name: /Sample volume|Volume da amostra|Volumen de muestra|Volume de l./ });
        await expect(sampleVolumeInspector).toHaveValue('32');
        await expect(sampleVolumeInspector).toBeEnabled();
        const sampleLoopStart = reopenedEngine.getByLabel(/Loop start|In.cio do loop|Inicio del bucle|D.but de boucle/);
        const sampleLoopEnd = reopenedEngine.getByLabel(/Loop end|Fim do loop|Fin del bucle|Fin de boucle/);
        await expect(sampleLoopStart).toHaveValue('0');
        await expect(sampleLoopEnd).toHaveValue('4');
        const fineTune = reopenedEngine.getByLabel(/Fine tune \(1\/8 semitone\)|Afina.* fina|Afinaci.* fina|Accord fin/);
        await expect(fineTune).toHaveValue('-1');
        await expect(fineTune).toBeEnabled();
      }
    }
    await reopenedEngine.getByText(savedModuleName, { exact: true }).click();
    const discardBeforeReopeningProject = reopenedEngine.getByRole('button', { name: /Continue without saving|Continuar sem salvar/ });
    if (await discardBeforeReopeningProject.isVisible().catch(() => false)) await discardBeforeReopeningProject.click();
    const reopenedEditor = reopenedEngine.getByLabel('Music beat editor');
    await expect(reopenedEditor).toBeVisible();
    await expect(reopenedEngine.getByTestId('right-panel-scroll').getByLabel(/File name|Nome do arquivo|Nombre del archivo|Nom du fichier/)).toHaveValue(savedModuleName.replace(/\.gbatracker$/i, ''));
    await reopenedEngine.getByRole('button', { name: 'Channel 01' }).click();
    await expect(reopenedEngine.getByRole('spinbutton', { name: 'Music channel volume' })).toHaveValue('0.75');
    await expect(reopenedEngine.getByRole('spinbutton', { name: 'Music channel pan' })).toHaveValue('-0.25');
    await expect(reopenedEngine.getByRole('button', { name: 'Mute channel' })).toBeVisible();
    await reopenedEditor.locator('.ant-segmented-item-label').getByText('Pattern', { exact: true }).click();
    await reopenedEditor.locator('.gba-order-card').first().click();
    await expect(reopenedEngine.getByTestId('right-panel-scroll').getByLabel(/Length \(rows\)|Dura.* \(linhas\)|Duraci.* \(filas\)|Dur.* \(lignes\)/)).toHaveValue('48');
    await reopenedEditor.locator('.ant-segmented-item-label').getByText('Piano roll', { exact: true }).click();
    await expect(reopenedEditor.locator('[data-note="true"]')).toHaveCount(8);
    await expect(reopenedEditor.getByRole('button', { name: 'Undo' })).toHaveCount(0);
    await expect(reopenedEditor.getByRole('button', { name: 'Redo' })).toHaveCount(0);
    const reopenedProject = await reopenedEngine.evaluate(async filename => {
      const result = await window.electronAPI.loadTrackerProject(filename);
      const { parseTrackerProjectPackage } = await import('/src/utils/trackerProjectPackage.ts');
      const binary = atob(result.data);
      return parseTrackerProjectPackage(Uint8Array.from(binary, character => character.charCodeAt(0)));
    }, savedModuleName);
    expect(reopenedProject.composition).toEqual(savedProject.composition);
    expect(reopenedProject.importedAudioSources).toHaveLength(2);
    expect(reopenedProject.importedAudioSources[1].sourceAudioData).toBe(createWavFixture().toString('base64'));
    expect(reopenedProject.importedAudioSources[1].sourcePcmData).toBe(savedProject.importedAudioSources[1].sourcePcmData);
    expect(reopenedProject.composition.patterns[0].name).toBe('Intro');
    expect(reopenedProject.composition.patterns[0].rows).toBe(48);
    expect(reopenedProject.composition.order.map(entry => reopenedProject.composition.patterns.find(pattern => pattern.id === entry.patternId)?.index)).toEqual([1, 0]);

    await reopenedEngine.getByText('imported-fixture.xm', { exact: true }).click();
    const discardBeforeImportedFixture = reopenedEngine.getByRole('button', { name: /Continue without saving|Continuar sem salvar/ });
    if (await discardBeforeImportedFixture.isVisible().catch(() => false)) await discardBeforeImportedFixture.click();
    await expect(reopenedEngine.getByRole('button', { name: /Import for editing|Importar para edi\u00e7\u00e3o|Éditer une copie|Importar para editar/ })).toBeVisible();
    await reopenedEngine.getByRole('button', { name: /Import for editing|Importar para edi\u00e7\u00e3o|Éditer une copie|Importar para editar/ }).click();
    const importedEditor = reopenedEngine.getByLabel('Music beat editor');
    await expect(reopenedEngine.getByTestId('right-panel-scroll').getByLabel(/File name|Nome do arquivo|Nombre del archivo|Nom du fichier/)).toHaveValue('imported-fixture/imported-fixture');
    await expect(importedEditor).toBeVisible();
    await expect(importedEditor.locator('[data-note="true"]')).toHaveCount(8);
    await importedEditor.locator('.ant-segmented-item-label').getByText('Pattern', { exact: true }).click();
    await expect(importedEditor.getByRole('radio', { name: 'Pattern' })).toBeChecked();
    const firstImportedNote = importedEditor.locator('[data-note="true"]').first();
    await firstImportedNote.focus();
    await reopenedEngine.keyboard.press('Enter');
    await expect(importedEditor.locator('[data-note="true"].selected')).toHaveCount(1);
    const importedPitch = reopenedEngine.getByTestId('right-panel-scroll').getByLabel(/^(Pitch|Altura|Tono|Hauteur)$/);
    const originalPitch = Number(await importedPitch.inputValue());
    const changedPitch = originalPitch === 96 ? 95 : originalPitch + 1;
    await importedPitch.fill(String(changedPitch));
    await importedPitch.press('Tab');
    await expect(importedPitch).toHaveValue(String(changedPitch));
    await importedEditor.getByRole('button', { name: /Save|Salvar/ }).click();
    await expect(reopenedEngine.getByText(/saved|salva|salvo|guardada|enregistr/i)).toBeVisible();
    const importedEditedName = 'imported-fixture/imported-fixture.gbatracker';
    const importedEditedPath = path.join(projectDirectory, 'project', 'musics', importedEditedName);
    expect(fs.existsSync(importedEditedPath)).toBe(true);
    expect(fs.readFileSync(path.join(fixtureMusicDirectory, 'imported-fixture.xm'))).toEqual(moduleBytes);

    await electronApp.close();
    electronApp = await electron.launch({
      args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')],
    });
    const finalEngine = await openMusicLibrary(electronApp, { expectBeatEditor: false });
    await finalEngine.getByText(importedEditedName, { exact: true }).click();
    const finalImportedEditor = finalEngine.getByLabel('Music beat editor');
    await expect(finalImportedEditor).toBeVisible();
    await expect(finalImportedEditor.locator('[data-note="true"]')).toHaveCount(8);
    await expect(finalEngine.getByTestId('right-panel-scroll').getByLabel(/File name|Nome do arquivo|Nombre del archivo|Nom du fichier/)).toHaveValue('imported-fixture/imported-fixture');
    await finalImportedEditor.locator('[data-note="true"]').first().focus();
    await finalEngine.keyboard.press('Enter');
    const finalPitch = finalEngine.getByTestId('right-panel-scroll').getByLabel(/^(Pitch|Altura|Tono|Hauteur)$/);
    await expect(finalPitch).toHaveValue(String(changedPitch));
    await finalImportedEditor.getByRole('button', { name: /Save|Salvar/ }).click();
    await expect(finalEngine.getByText(/saved|salva|salvo|guardada|enregistr/i)).toBeVisible();
    expect(fs.readFileSync(path.join(fixtureMusicDirectory, 'imported-fixture.xm'))).toEqual(moduleBytes);
  } finally {
    if (previewEmulator && !previewEmulator.isClosed()) await previewEmulator.close().catch(() => {});
    if (electronApp) await electronApp.close();
    if (process.env.GBA_STUDIO_KEEP_MUSIC_EDITOR_SCREENSHOT !== '1' && fs.existsSync(screenshotPath)) fs.rmSync(screenshotPath, { force: true });
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('generates and exports a visual SFX from the Sounds library', async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'sfx-generator-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    await electronApp.firstWindow();
    await expect.poll(() => electronApp.windows().map(page => page.url())).toContainEqual(expect.stringMatching(/#engine/));
    const engine = electronApp.windows().find(page => page.url().includes('#engine'));
    if (!engine) throw new Error('The Engine window did not open.');
    engine.setDefaultTimeout(5_000);
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await engine.locator('.ant-dropdown-trigger').first().click();
    await engine.getByRole('menuitem').filter({ hasText: /sound effects|efeitos sonoros|efectos de sonido/i }).click();
    await engine.getByRole('button', { name: /Generate SFX|Gerar SFX|Generar SFX|G.n.rer SFX/i }).click();
    const dialog = engine.getByTestId('sfx-generator-workspace');
    await expect(dialog).toBeVisible();
    await expect(engine.getByRole('dialog')).toHaveCount(0);
    await expect(dialog.getByRole('combobox', { name: /Waveform|Forma de onda|Forme d.nde/i })).toBeVisible();
    const graphCanvases = dialog.locator('canvas');
    await expect(graphCanvases).toHaveCount(2);
    const initialViewport = await engine.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    await engine.setViewportSize({ width: 900, height: initialViewport.height });
    const mediumGraphSizes = await graphCanvases.evaluateAll(canvases => canvases.map(canvas => canvas.clientWidth));
    await engine.setViewportSize({ width: 700, height: initialViewport.height });
    const narrowGraphSizes = await graphCanvases.evaluateAll(canvases => canvases.map(canvas => canvas.clientWidth));
    expect(narrowGraphSizes.every((width, index) => width > 300 && width < mediumGraphSizes[index])).toBe(true);
    await engine.setViewportSize(initialViewport);
    await expect(dialog.locator('canvas[aria-label="Generated SFX waveform preview"], canvas[aria-label="Prévia da forma de onda SFX gerada"], canvas[aria-label="Vista previa de la forma de onda SFX generada"], canvas[aria-label="Aperçu de la forme d’onde SFX générée"]')).toBeVisible();
    await expect(dialog.getByText(/^(Duration|Duração|Duración|Durée) \d+ ms$/)).toBeVisible();
    await dialog.screenshot({ path: path.join(screenshotDirectory, `sfx-generator-${process.pid}.png`) });
    const sfxName = dialog.getByLabel(/SFX file name|Nome do arquivo SFX|Nombre del archivo SFX|Nom du fichier SFX/);
    await sfxName.fill('bad-name');
    await dialog.getByRole('button', { name: /Save Project \(\.gbasfx\)|Salvar projeto \(\.gbasfx\)|Guardar proyecto \(\.gbasfx\)|Enregistrer le projet \(\.gbasfx\)/ }).click();
    await expect(engine.getByText(/letters, numbers or _|letras, números ou _|letras, números o _|lettres, chiffres ou _/)).toBeVisible();
    await sfxName.fill('e2e_sfx');
    await dialog.getByRole('button', { name: /Save Project \(\.gbasfx\)|Salvar projeto \(\.gbasfx\)|Guardar proyecto \(\.gbasfx\)|Enregistrer le projet \(\.gbasfx\)/ }).click();
    await expect(engine.getByText(/Editable SFX project saved|Projeto SFX editável salvo|Proyecto SFX editable guardado|Projet SFX modifiable enregistré/).last()).toBeVisible();
    await dialog.getByRole('button', { name: /Export WAV|Exportar WAV/ }).click();
    await expect(engine.getByText(/WAV exported to project Sounds|WAV exportado para Sounds do projeto|WAV exportado a Sounds del proyecto|WAV exporté dans Sounds du projet/).last()).toBeVisible();
    const source = JSON.parse(fs.readFileSync(path.join(projectDirectory, 'project', 'sounds', 'e2e_sfx.gbasfx'), 'utf8'));
    expect(source.schema).toBe('gba-studio/sfx');
    expect(source.parameters.fadeInMs).toBe(8);
    expect(source.parameters.volume).toBe(100);
    const wav = fs.readFileSync(path.join(projectDirectory, 'assets', 'sounds', 'e2e_sfx.wav'));
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    const editedWav = Buffer.from(wav); editedWav[44] ^= 1; fs.writeFileSync(path.join(projectDirectory, 'assets', 'sounds', 'e2e_sfx.wav'), editedWav);
    await dialog.getByRole('button', { name: /Back to Sounds|Voltar para Sounds|Volver a Sounds|Retour à Sounds/ }).click();
    await expect(engine.getByRole('listitem').filter({ hasText: /^e2e_sfx/ })).toHaveCount(2);
    await engine.getByRole('listitem').filter({ hasText: /^e2e_sfx/ }).last().click();
    await expect(engine.locator('audio').last()).toBeVisible();
    await engine.getByRole('listitem').filter({ hasText: /^e2e_sfx/ }).first().click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/SFX file name|Nome do arquivo SFX|Nombre del archivo SFX|Nom du fichier SFX/)).toHaveValue('e2e_sfx');
    await expect(dialog.getByText(/linked WAV changed|WAV vinculado foi alterado|WAV vinculado cambió|WAV associé a changé/)).toBeVisible();
    const waveformSelect = dialog.getByRole('combobox', { name: /Waveform|Forma de onda|Forme d.nde/i });
    await dialog.locator('.ant-select-selector').first().click();
    await engine.locator('.ant-select-item-option-content').filter({ hasText: /Noise|Ru.do|Bruit/ }).click();
    await expect(dialog.locator('.ant-select-selection-item').first()).toContainText(/Noise|Ru.do|Bruit/);
    await expect(dialog.locator('.ant-slider').first()).toHaveClass(/ant-slider-disabled/);
    const fadeInSlider = dialog.getByRole('slider').nth(2);
    await fadeInSlider.focus();
    await engine.keyboard.press('End');
    const volumeSlider = dialog.getByRole('slider').nth(4);
    await expect(volumeSlider).toBeVisible();
    const knobSurface = await volumeSlider.evaluate(element => ({
      shadow: getComputedStyle(element).boxShadow,
      indicator: element.querySelector('.gba-music-dial-indicator')
        ? getComputedStyle(element.querySelector('.gba-music-dial-indicator'), '::after').boxShadow
        : 'none',
    }));
    expect(knobSurface.shadow).not.toBe('none');
    expect(knobSurface.indicator).not.toBe('none');
    await volumeSlider.focus();
    await engine.keyboard.press('Home');
    await expect(volumeSlider).toHaveAttribute('aria-valuenow', '0');
    await dialog.getByRole('button', { name: /Save Project \(\.gbasfx\)|Salvar projeto \(\.gbasfx\)|Guardar proyecto \(\.gbasfx\)|Enregistrer le projet \(\.gbasfx\)/ }).click();
    let replaceDialog = engine.getByRole('dialog').filter({ hasText: /Replace this SFX source|Substituir esta fonte SFX|Reemplazar esta fuente SFX|Remplacer cette source SFX/ });
    await replaceDialog.getByRole('button', { name: /Replace|Substituir|Reemplazar|Remplacer/ }).click();
    await expect(engine.getByText(/Editable SFX project saved|Projeto SFX editável salvo|Proyecto SFX editable guardado|Projet SFX modifiable enregistré/).last()).toBeVisible();
    await dialog.getByRole('button', { name: /Export WAV|Exportar WAV/ }).click();
    replaceDialog = engine.getByRole('dialog').filter({ hasText: /Replace this SFX source|Substituir esta fonte SFX|Reemplazar esta fuente SFX|Remplacer cette source SFX/ });
    await replaceDialog.getByRole('button', { name: /Replace|Substituir|Reemplazar|Remplacer/ }).click();
    await expect(engine.getByText(/WAV exported to project Sounds|WAV exportado para Sounds do projeto|WAV exportado a Sounds del proyecto|WAV exporté dans Sounds du projet/).first()).toBeVisible();
    const replacedSource = JSON.parse(fs.readFileSync(path.join(projectDirectory, 'project', 'sounds', 'e2e_sfx.gbasfx'), 'utf8'));
    expect(replacedSource.parameters.waveform).toBe('noise');
    expect(replacedSource.parameters.fadeInMs).toBe(replacedSource.parameters.durationMs);
    expect(replacedSource.parameters.volume).toBe(0);
    expect(replacedSource.wavSha256).not.toBe(source.wavSha256);
  } finally {
    if (electronApp) await electronApp.close();
    const screenshot = path.join(screenshotDirectory, `sfx-generator-${process.pid}.png`);
    if (fs.existsSync(screenshot)) fs.rmSync(screenshot, { force: true });
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('schedules real IT sample sources at source rows and Maxmod tick boundaries', async () => {
  test.setTimeout(90_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-it-note-schedule-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  const musicDirectory = path.join(projectDirectory, 'assets', 'musics');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  fs.mkdirSync(musicDirectory, { recursive: true });
  const itPath = path.join(repositoryRoot, 'templateEngineGame', 'shooter_game', 'assets', 'musics', 'minor_boss_r.it');
  fs.copyFileSync(itPath, path.join(musicDirectory, 'minor_boss_r.it'));
  const encodedModule = fs.readFileSync(itPath).toString('base64');
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    const engine = await openMusicLibrary(electronApp);
    const audit = await engine.evaluate(async encoded => {
      const tracker = await import('/src/utils/trackerModule.ts');
      const { TrackerPreviewPlayer } = await import('/src/utils/trackerPreviewPlayer.ts');
      const { trackerItEventTriggersNote, trackerItInstrumentMemoryAfterEvent } = await import('/src/utils/trackerItInstrumentMemory.ts');
      const { maxmodGbaTickDurationSeconds } = await import('/src/utils/trackerMaxmodTiming.ts');
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0));
      const moduleBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const info = tracker.parseTrackerModule(moduleBytes, 'IT');
      const rows = tracker.parseTrackerPlaybackRows(moduleBytes, 'IT', 65_536);
      const samples = tracker.parseItSamples(moduleBytes);
      const noteEvents = rows.reduce((total, row) => total + row.filter(event => event && event.note > 0 && event.note < 246).length, 0);
      const starts = [];
      const sampleStarts = [];
      const expectedSampleOffsets = [];
      const checkedRows = 64;
      const instrumentMemory = Array(info.channels).fill(0);
      let rowSpeed = info.speed;
      let rowTempo = info.tempo;
      let expectedElapsed = 0;
      for (let rowIndex = 0; rowIndex < checkedRows; rowIndex += 1) {
        const row = rows[rowIndex] ?? [];
        for (let channel = 0; channel < info.channels; channel += 1) {
          const event = row[channel];
          if (!event) continue;
          if (event.effect === 1 && event.parameter > 0) rowSpeed = event.parameter;
          if (event.effect === 20 && event.parameter >= 0x20) rowTempo = event.parameter;
        }
        for (let channel = 0; channel < info.channels; channel += 1) {
          const event = row[channel];
          if (!event) continue;
          instrumentMemory[channel] = trackerItInstrumentMemoryAfterEvent(event, instrumentMemory[channel]);
          if (trackerItEventTriggersNote(event, instrumentMemory[channel]) && samples.has(instrumentMemory[channel])) {
            expectedSampleOffsets.push(expectedElapsed);
          }
        }
        expectedElapsed += rowSpeed * maxmodGbaTickDurationSeconds(rowTempo);
      }
      const originalBufferStart = AudioBufferSourceNode.prototype.start;
      const originalOscillatorStart = OscillatorNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (when = 0, ...args) {
        starts.push(when);
        sampleStarts.push(when);
        return originalBufferStart.call(this, when, ...args);
      };
      OscillatorNode.prototype.start = function (when = 0, ...args) {
        starts.push(when);
        return originalOscillatorStart.call(this, when, ...args);
      };
      const player = new TrackerPreviewPlayer();
      try {
        const playTask = player.play(rows, info.channels, info.speed, info.tempo, [], samples, 'IT');
        await new Promise(resolve => window.setTimeout(resolve, 4_000));
        const contextTime = player.context?.currentTime ?? 0;
        const scheduledAhead = starts.filter(when => when <= contextTime + 2.6).length;
        const firstSampleStart = Math.min(...sampleStarts);
        const firstWindowEnd = firstSampleStart + expectedElapsed - 0.001;
        const actualSampleOffsets = sampleStarts.filter(when => when < firstWindowEnd)
          .map(when => when - firstSampleStart)
          .sort((left, right) => left - right);
        player.stop();
        await playTask;
        return { rows: rows.length, noteEvents, decodedSamples: samples.size, starts: starts.length, scheduledAhead, expectedSampleOffsets, actualSampleOffsets };
      } finally {
        player.stop();
        AudioBufferSourceNode.prototype.start = originalBufferStart;
        OscillatorNode.prototype.start = originalOscillatorStart;
      }
    }, encodedModule);
    console.log(`IT real-module scheduled note sources: ${JSON.stringify(audit)}.`);
    expect(audit.noteEvents).toBeGreaterThan(2_000);
    expect(audit.decodedSamples).toBeGreaterThan(0);
    expect(audit.scheduledAhead, 'The dense IT preview must schedule dozens of independent note voices in the first seconds.').toBeGreaterThan(50);
    expect(audit.actualSampleOffsets).toHaveLength(audit.expectedSampleOffsets.length);
    audit.actualSampleOffsets.forEach((offset, index) => {
      expect(Math.abs(offset - audit.expectedSampleOffsets[index]), `IT sample source ${index} must follow its Maxmod row/tick boundary`).toBeLessThan(0.001);
    });
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});

test('records a physical Windows microphone take and previews it', async () => {
  test.skip(process.env.GBA_STUDIO_TEST_PHYSICAL_MIC !== '1', 'Set GBA_STUDIO_TEST_PHYSICAL_MIC=1 on a Windows machine with an input device.');
  test.setTimeout(120_000);
  fs.mkdirSync(fixtureRoot, { recursive: true });
  const projectDirectory = fs.mkdtempSync(path.join(fixtureRoot, 'music-editor-physical-mic-e2e-'));
  const sourceProject = path.join(repositoryRoot, 'templateEngineGame', 'sample_project_example');
  fs.cpSync(sourceProject, projectDirectory, { recursive: true, filter: source => !path.relative(sourceProject, source).startsWith(`build${path.sep}`) });
  let electronApp;
  try {
    electronApp = await electron.launch({ args: [electronEntryPoint, path.join(projectDirectory, 'sample_project.gbaproj')] });
    await electronApp.context().grantPermissions(['microphone']);
    await electronApp.firstWindow();
    await expect.poll(() => electronApp.windows().map(page => page.url())).toContainEqual(expect.stringMatching(/#engine/));
    const engine = electronApp.windows().find(page => page.url().includes('#engine'));
    if (!engine) throw new Error('The Engine window did not open for physical microphone capture.');
    engine.setDefaultTimeout(10_000);
    await expect(engine.locator('.ant-spin-fullscreen')).toHaveCount(0, { timeout: 15_000 });
    await engine.locator('.ant-dropdown-trigger').first().click();
    await engine.getByRole('menuitem').filter({ hasText: /m.sic/i }).click();
    await engine.getByRole('button', { name: /^(Create music|Criar m.sica)$/ }).click();
    await engine.getByRole('menuitem').filter({ hasText: /XM \(\.xm\)/ }).click();
    const editor = engine.getByLabel('Music beat editor');
    await expect(editor).toBeVisible();
    await engine.evaluate(installBrowserPreviewAudioTap);
    const instruments = engine.getByRole('button', { name: 'INSTRUMENTS', exact: true });
    if (await instruments.getAttribute('aria-expanded') === 'false') await instruments.click();
    await engine.getByRole('button', { name: /Add instrument|Adicionar instrumento|A.*adir instrumento|Ajouter un instrument/ }).click();
    const instrument = engine.getByRole('button', { name: 'Instrument 02', exact: true });
    await expect(instrument).toBeVisible();
    await instrument.click();
    await engine.getByRole('button', { name: /Record microphone|Gravar pelo microfone/ }).click();
    await engine.evaluate(() => {
      const devices = navigator.mediaDevices;
      const nativeGetUserMedia = devices.getUserMedia.bind(devices);
      Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: new Proxy(devices, {
        get(target, property) {
          if (property === 'getUserMedia') return async (...args) => {
            const stream = await nativeGetUserMedia(...args);
            const track = stream.getAudioTracks()[0];
            window.__physicalMicDeviceAudit = { label: track?.label ?? '', settings: track?.getSettings() ?? {} };
            return stream;
          };
          const value = Reflect.get(target, property, target);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }) });
    });
    await engine.getByRole('button', { name: /Start microphone recording|Iniciar gravação do microfone/ }).click();
    await expect(engine.getByText(/^(Recording|Gravando)$/)).toBeVisible();
    await engine.waitForTimeout(1_500);
    await engine.getByRole('button', { name: /Stop recording|Parar gravação/ }).click();
    const deviceAudit = await engine.evaluate(() => window.__physicalMicDeviceAudit);
    console.log(`Physical Windows microphone device: ${JSON.stringify(deviceAudit)}.`);
    expect(deviceAudit?.label).toMatch(/.+/);
    const waveform = engine.getByRole('img', { name: /Audio sample waveform|Forma de onda do áudio|Forma de onda del audio|Forme d’onde audio/ });
    await expect(waveform).toBeVisible();
    const takeGain = engine.getByRole('dialog').locator('.ant-slider-handle').first();
    await takeGain.focus();
    await engine.keyboard.press('End');
    await expect(takeGain).toHaveAttribute('aria-valuenow', '2');
    const takeAudit = await engine.locator('audio').evaluate(async audio => {
      const context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyser.connect(context.destination);
      await context.resume();
      await audio.play();
      const samples = new Float32Array(analyser.fftSize);
      let peak = 0;
      let squareSum = 0;
      let count = 0;
      const until = performance.now() + Math.min(800, Math.max(200, audio.duration * 1000));
      while (performance.now() < until) {
        analyser.getFloatTimeDomainData(samples);
        for (const sample of samples) { peak = Math.max(peak, Math.abs(sample)); squareSum += sample * sample; count += 1; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      audio.pause();
      source.disconnect();
      await context.close();
      return { duration: audio.duration, peak, rms: Math.sqrt(squareSum / Math.max(1, count)) };
    });
    console.log(`Physical Windows microphone take preview: ${JSON.stringify(takeAudit)}.`);
    expect(takeAudit.duration).toBeGreaterThan(0.1);
    expect(takeAudit.peak).toBeGreaterThan(0.001);
    await engine.getByRole('dialog').getByRole('button', { name: /Add to instrument|Adicionar ao instrumento|A.*adir al instrumento|Ajouter à l’instrument|Replace selected sample|Substituir sample selecionado|Reemplazar muestra seleccionada|Remplacer le sample sélectionné/ }).click();
    await expect(engine.getByTestId('right-panel-scroll').getByText(/^microphone-take:/)).toBeVisible();
    await engine.getByText('Keyboard', { exact: true }).click();
    const keyboardKey = editor.locator('.gba-keyboard-keys button').nth(12);
    for (let note = 0; note < 4; note += 1) await keyboardKey.click();
    await engine.getByText('Piano roll', { exact: true }).click();
    await expect(editor.locator('[data-note="true"]')).toHaveCount(4);
    await editor.getByRole('button', { name: /Quick preview|Pr.via r.pida|Vista previa r.pida|Aper.u rapide/ }).click();
    await expect.poll(() => engine.evaluate(() => window.__musicPreviewCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(10);
    const structural = await engine.evaluate(finishAudioCapture, 'sync');
    console.log(`Physical microphone structural preview: ${JSON.stringify({ duration: structural.duration, rms: structural.rms, peak: structural.peak })}.`);
    expect(structural.rms).toBeGreaterThan(0.0001);
    await editor.getByRole('button', { name: /Save|Salvar|Enregistrer/ }).click();
    await expect(engine.getByText(/Music saved\.|Música salva\.|Musique enregistrée\./)).toBeVisible();
    await editor.getByRole('button', { name: /Play ROM/ }).click();
    await waitForMaxmodPreviewStatus(editor, 120_000);
    await expect.poll(() => electronApp.windows().filter(page => page.url().includes('#emulator')).length, { timeout: 45_000 }).toBe(1);
    const emulator = electronApp.windows().find(page => page.url().includes('#emulator'));
    if (!emulator) throw new Error('The physical microphone Maxmod preview did not open.');
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.Module?.AL?.currentCtx?.audioCtx)), { timeout: 30_000 }).toBe(true);
    await expect.poll(() => emulator.evaluate(() => Boolean(window.EJS_emulator?.gameManager)), { timeout: 30_000 }).toBe(true);
    expect(await emulator.evaluate(installEmulatorOpenALTap)).toBeTruthy();
    await emulator.evaluate(() => window.EJS_emulator?.gameManager?.restart());
    await expect.poll(() => emulator.evaluate(() => window.__musicOpenALCapture?.chunks.length ?? 0), { timeout: 15_000 }).toBeGreaterThan(60);
    const rom = await emulator.evaluate(finishAudioCapture, 'openal');
    console.log(`Physical microphone Maxmod ROM preview: ${JSON.stringify({ duration: rom.duration, rms: rom.rms, peak: rom.peak })}.`);
    expect(rom.rms).toBeGreaterThan(0.0001);
  } finally {
    if (electronApp) await electronApp.close().catch(() => {});
    fs.rmSync(projectDirectory, { recursive: true, force: true });
  }
});
