import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { inlineTrackerIdentity } from './helpers/tracker-module-identity.mjs';

const root = path.resolve('src/renderer/frontend/src/utils');
const templateSource = fs.readFileSync(path.join(root, 'xmBeatTemplate.ts'), 'utf8');
const templateCompiled = ts.transpileModule(templateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const instrumentLibraryCompiled = ts.transpileModule(fs.readFileSync(path.join(root, 'trackerInstrumentLibrary.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const compatibilitySource = fs.readFileSync(path.resolve('src/shared/trackerItBuildCompatibility.ts'), 'utf8');
const compatibilityCompiled = ts.transpileModule(compatibilitySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const trackerSource = fs.readFileSync(path.join(root, 'trackerModule.ts'), 'utf8');
const trackerCompiled = inlineTrackerIdentity(ts.transpileModule(trackerSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
  .replace("from './xmBeatTemplate';", `from 'data:text/javascript;base64,${Buffer.from(templateCompiled).toString('base64')}';`)
  .replaceAll("from './trackerInstrumentLibrary';", `from 'data:text/javascript;base64,${Buffer.from(instrumentLibraryCompiled).toString('base64')}';`)
  .replace("from '../../../../shared/trackerItBuildCompatibility';", `from 'data:text/javascript;base64,${Buffer.from(compatibilityCompiled).toString('base64')}';`);
const compositionSource = fs.readFileSync(path.join(root, 'trackerComposition.ts'), 'utf8');
const panSource = ts.transpileModule(fs.readFileSync(path.join(root, 'trackerNotePan.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const compositionCompiled = inlineTrackerIdentity(ts.transpileModule(compositionSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
  .replace("from './trackerInstrumentLibrary';", `from 'data:text/javascript;base64,${Buffer.from(instrumentLibraryCompiled).toString('base64')}';`)
  .replace("from './trackerModule';", `from 'data:text/javascript;base64,${Buffer.from(trackerCompiled).toString('base64')}';`)
  .replace("from './trackerNotePan';", `from 'data:text/javascript;base64,${Buffer.from(panSource).toString('base64')}';`);
const { addMusicCompositionInstrumentPreset, addMusicCompositionSampleToInstrument, duplicateMusicCompositionInstrument, createMusicCompositionDocument, createMusicCompositionFromImportedModule, getMusicTargetProjection, isMusicCompositionDocument, selectMusicExportTarget, setMusicCompositionNotePan, setMusicCompositionNoteProperties, setMusicCompositionChannelMix, setMusicCompositionPatternEffect, setMusicCompositionPatternName, setMusicCompositionSampleProperties, setMusicCompositionInstrumentName, setMusicCompositionInstrumentEnvelope, setMusicCompositionInstrumentZones, editMusicCompositionNotes, deleteMusicCompositionNotes, MAX_GBA_TRACKER_CHANNELS } = await import(`data:text/javascript;base64,${Buffer.from(compositionCompiled).toString('base64')}`);
const modPlayerSource = ts.transpileModule(fs.readFileSync(path.join(root, 'modPlayer.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const rollSource = ts.transpileModule(fs.readFileSync(path.join(root, 'trackerPianoRollModel.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const importSource = ts.transpileModule(fs.readFileSync(path.join(root, 'trackerCompositionImport.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace("from './trackerComposition';", `from 'data:text/javascript;base64,${Buffer.from(compositionCompiled).toString('base64')}';`)
  .replace("from './modPlayer';", `from 'data:text/javascript;base64,${Buffer.from(modPlayerSource).toString('base64')}';`)
  .replace("from './trackerModule';", `from 'data:text/javascript;base64,${Buffer.from(trackerCompiled).toString('base64')}';`)
  .replace("from './trackerPianoRollModel';", `from 'data:text/javascript;base64,${Buffer.from(rollSource).toString('base64')}';`);
const { importTrackerModuleComposition } = await import(`data:text/javascript;base64,${Buffer.from(importSource).toString('base64')}`);
const moduleTemplateSource = ts.transpileModule(fs.readFileSync(path.join(root, 'trackerModuleTemplate.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace("from './xmBeatTemplate';", `from 'data:text/javascript;base64,${Buffer.from(templateCompiled).toString('base64')}';`);
const { createTrackerModuleTemplate } = await import(`data:text/javascript;base64,${Buffer.from(moduleTemplateSource).toString('base64')}`);

const source = createMusicCompositionDocument('Universal song', 8);
assert.equal(isMusicCompositionDocument(source), true);
assert.equal(source.channels.length, 8);
const presetProject = addMusicCompositionInstrumentPreset(source, 'triangle-bass');
const presetInstrument = presetProject.instruments.at(-1);
const presetSample = presetProject.samples.find(sample => sample.id === presetInstrument.sampleIds[0]);
const renamedPreset = setMusicCompositionInstrumentName(presetProject, presetInstrument.index, '  Sub Pulse  ');
assert.equal(renamedPreset.instruments.at(-1).id, presetInstrument.id, 'renaming a private preset must preserve its UUID');
assert.equal(renamedPreset.instruments.at(-1).name, 'Sub Pulse', 'instrument names are trimmed before saving');
assert.equal(renamedPreset.samples.find(sample => sample.id === presetSample.id).name, presetSample.name, 'renaming an instrument does not rename or mutate its sample');
assert.equal(presetInstrument.name, 'Triangle Bass', 'editing the private copy must not mutate the bundled preset definition');
assert.equal(setMusicCompositionInstrumentName(renamedPreset, presetInstrument.index, '   '), renamedPreset, 'blank instrument names are ignored');
const editedEnvelope = setMusicCompositionInstrumentEnvelope(renamedPreset, presetInstrument.index, 'volume', {
  points: [{ tick: 0, value: 1 }, { tick: 12, value: 0.25 }], enabled: true, sustainStart: 1, sustainEnd: 1, loopStart: 0, loopEnd: 1, sustainEnabled: true, loopEnabled: false,
}, 1024);
assert.equal(editedEnvelope.instruments[presetInstrument.index].id, renamedPreset.instruments[presetInstrument.index].id, 'envelope editing preserves instrument UUID');
assert.deepEqual(editedEnvelope.instruments[presetInstrument.index].volumeEnvelope.points, [{ tick: 0, value: 1 }, { tick: 12, value: 0.25 }]);
assert.equal(editedEnvelope.instruments[presetInstrument.index].fadeout, 1024);
assert.equal(setMusicCompositionInstrumentEnvelope(editedEnvelope, presetInstrument.index, 'volume', { points: [{ tick: -1, value: 2 }] }), editedEnvelope, 'invalid envelopes are rejected without damaging the composition');
const splitZones = setMusicCompositionInstrumentZones(renamedPreset, presetInstrument.index, [
  { low: 64, high: 127, sampleId: presetSample.id }, { low: 0, high: 63, sampleId: presetSample.id },
]);
assert.deepEqual(splitZones.instruments[presetInstrument.index].noteMap, [
  { low: 0, high: 63, sampleId: presetSample.id }, { low: 64, high: 127, sampleId: presetSample.id },
], 'instrument zones are sorted and retain sample UUID references');
assert.equal(setMusicCompositionInstrumentZones(splitZones, presetInstrument.index, [
  { low: 0, high: 70, sampleId: presetSample.id }, { low: 64, high: 127, sampleId: presetSample.id },
]), splitZones, 'overlapping key zones are rejected');
assert.equal(setMusicCompositionInstrumentZones(splitZones, presetInstrument.index, [
  { low: 0, high: 127, sampleId: crypto.randomUUID() },
]), splitZones, 'zones cannot reference a sample owned by another instrument');
const splitWithGap = setMusicCompositionInstrumentZones(renamedPreset, presetInstrument.index, [
  { low: 0, high: 47, sampleId: presetSample.id }, { low: 72, high: 127, sampleId: presetSample.id },
]);
const { id: _presetSampleId, ...presetSampleData } = presetSample;
const addedZoneSample = addMusicCompositionSampleToInstrument(splitWithGap, presetInstrument.index, {
  ...presetSampleData, name: 'Imported zone sample', pcmData: presetSample.pcmData,
}, { low: 48, high: 71 });
const addedZoneInstrument = addedZoneSample.instruments[presetInstrument.index];
assert.equal(addedZoneSample.samples.length, splitWithGap.samples.length + 1, 'adding a zone sample creates a project-owned sample');
assert.equal(addedZoneInstrument.sampleIds.length, 2);
assert.equal(addedZoneInstrument.noteMap[1].low, 48);
assert.equal(addedZoneSample.samples.find(sample => sample.id === addedZoneInstrument.noteMap[1].sampleId).name, 'Imported zone sample');
const addedOverlappingZone = addMusicCompositionSampleToInstrument(splitWithGap, presetInstrument.index, presetSampleData, { low: 40, high: 60 });
assert.notEqual(addedOverlappingZone, splitWithGap, 'adding a sample zone can replace an occupied range');
assert.deepEqual(addedOverlappingZone.instruments[presetInstrument.index].noteMap.map(zone => [zone.low, zone.high]), [[0, 39], [40, 60], [72, 127]], 'adding a zone preserves the old sample outside the new range');
const fullRangeOverride = addMusicCompositionSampleToInstrument(renamedPreset, presetInstrument.index, presetSampleData, { low: 48, high: 95 });
assert.deepEqual(fullRangeOverride.instruments[presetInstrument.index].noteMap.map(zone => [zone.low, zone.high]), [[0, 47], [48, 95], [96, 127]], 'an imported zone splits a default full-range preset cleanly');
const duplicatePreset = duplicateMusicCompositionInstrument(renamedPreset, presetInstrument.index, 'Copy');
const duplicateInstrument = duplicatePreset.instruments.at(-1);
const duplicateSample = duplicatePreset.samples.find(sample => sample.id === duplicateInstrument.sampleIds[0]);
assert.notEqual(duplicateInstrument.id, presetInstrument.id, 'duplicated instruments receive new UUIDs');
assert.notEqual(duplicateSample.id, presetSample.id, 'duplicated samples receive new UUIDs');
assert.equal(duplicateInstrument.name, 'Sub Pulse Copy');
assert.equal(duplicateSample.pcmData, presetSample.pcmData, 'duplication preserves exact PCM');
assert.equal(duplicateInstrument.noteMap[0].sampleId, duplicateSample.id, 'duplicated note zones point to the cloned sample');
assert.equal(duplicatePreset.samples.length, renamedPreset.samples.length + 1);
let fullPresetProject = duplicatePreset;
while (fullPresetProject.instruments.length < 16) fullPresetProject = addMusicCompositionInstrumentPreset(fullPresetProject, 'sine-lead');
assert.equal(duplicateMusicCompositionInstrument(fullPresetProject, duplicateInstrument.index), fullPresetProject, 'the 16-instrument ceiling prevents additional copies');
assert.equal(source.schema, 'gba-studio/music-composition');
const effectCellChannel = source.channels[0].id;
const withUnrelatedCellCommand = {
  ...source,
  patterns: source.patterns.map((pattern, index) => index === 0 ? {
    ...pattern,
    commands: [{ id: randomUUID(), row: 0, channelId: effectCellChannel, command: 'XM:volume-slide', parameter: 3 }],
  } : pattern),
};
const withCanonicalEffect = setMusicCompositionPatternEffect(withUnrelatedCellCommand, 0, 0, 0, 'XM', 8, 96);
const canonicalEffectCommand = withCanonicalEffect.patterns[0].commands.find(command => command.command === 'XM:effect-8');
assert.ok(canonicalEffectCommand, 'per-cell effects are represented as canonical commands');
assert.equal(withCanonicalEffect.patterns[0].commands.length, 2, 'adding a pan effect preserves unrelated commands in the same cell');
const changedCanonicalEffect = setMusicCompositionPatternEffect(withCanonicalEffect, 0, 0, 0, 'XM', 8, 160);
assert.equal(changedCanonicalEffect.patterns[0].commands.find(command => command.command === 'XM:effect-8').id, canonicalEffectCommand.id, 'changing an effect parameter preserves its UUID');
assert.equal(changedCanonicalEffect.patterns[0].commands.find(command => command.command === 'XM:effect-8').parameter, 160);
const removedCanonicalEffect = setMusicCompositionPatternEffect(changedCanonicalEffect, 0, 0, 0, 'XM', 0, 0);
assert.deepEqual(removedCanonicalEffect.patterns[0].commands.map(command => command.id), [withUnrelatedCellCommand.patterns[0].commands[0].id], 'clearing an effect preserves unrelated command IDs');
const canonicalSample = {
  id: randomUUID(), name: 'Original', sampleRate: 8363, channels: 1, bitDepth: 16, pcmData: 'AAA=',
  volume: 1, panning: 0, rootNote: 48, fineTune: 0, loopStart: 0, loopEnd: 0, loopType: 'none',
};
const compositionWithSample = {
  ...source,
  samples: [canonicalSample],
  instruments: source.instruments.map((instrument, index) => index === 0 ? { ...instrument, sampleIds: [canonicalSample.id] } : instrument),
};
const editedCanonicalSample = setMusicCompositionSampleProperties(compositionWithSample, canonicalSample.id, {
  name: 'Edited', sampleRate: 12000, volume: 0.5, panning: 0.25, rootNote: 52, fineTune: -4,
  loopStart: 12, loopEnd: 48, pcmData: 'AQI=',
});
assert.equal(isMusicCompositionDocument(editedCanonicalSample), true, 'sample edits remain a valid canonical composition');
assert.deepEqual(editedCanonicalSample.samples[0], { ...canonicalSample, name: 'Edited', sampleRate: 12000, volume: 0.5, panning: 0.25, rootNote: 52, fineTune: -4, loopStart: 12, loopEnd: 48, pcmData: 'AQI=' });
assert.equal(compositionWithSample.samples[0].pcmData, 'AAA=', 'canonical sample edits do not mutate the prior PCM source');
const mixedSource = setMusicCompositionChannelMix(source, 2, { volume: 0.63, pan: -0.41, muted: true });
assert.deepEqual(mixedSource.channels[2], { ...source.channels[2], volume: 0.63, pan: -0.41, muted: true }, 'channel mixer edits update the canonical channel');
assert.deepEqual(source.channels[2], { ...source.channels[2], volume: 1, pan: 0, muted: false }, 'channel mixer edits leave the previous composition unchanged');
assert.equal(setMusicCompositionChannelMix(mixedSource, 2, { volume: 2, pan: -2 }).channels[2].volume, 1, 'channel volume remains clamped to its valid range');
assert.equal(setMusicCompositionChannelMix(mixedSource, 2, { volume: 2, pan: -2 }).channels[2].pan, -1, 'channel pan remains clamped to its valid range');
const createdCanonicalNote = editMusicCompositionNotes(source, 0, [{ start: 4, end: 9, pitch: 49, channelIndex: 1, instrumentIndex: 1 }]);
const canonicalNote = createdCanonicalNote.patterns[0].notes[0];
assert.deepEqual(canonicalNote, { id: canonicalNote.id, row: 4, channelId: source.channels[1].id, pitch: 49, durationRows: 5, instrumentId: source.instruments[0].id, volume: 1, pan: 0 });
assert.equal(isMusicCompositionDocument(createdCanonicalNote), true);
const secondCanonicalInstrument = { ...source.instruments[0], id: randomUUID(), index: 1, name: 'Instrument 02' };
const sourceWithTwoInstruments = { ...createdCanonicalNote, instruments: [...createdCanonicalNote.instruments, secondCanonicalInstrument] };
const patchedCanonicalNote = setMusicCompositionNoteProperties(sourceWithTwoInstruments, 0, 4, 1, { instrumentIndex: 2, volume: 0.63, pan: 0.37 });
assert.deepEqual({ instrumentId: patchedCanonicalNote.patterns[0].notes[0].instrumentId, volume: patchedCanonicalNote.patterns[0].notes[0].volume, pan: patchedCanonicalNote.patterns[0].notes[0].pan }, { instrumentId: secondCanonicalInstrument.id, volume: 0.63, pan: 0.25 }, 'note pan edits snap to one of the nine marked positions');
assert.equal(createdCanonicalNote.patterns[0].notes[0].volume, 1, 'note property edits leave the previous canonical entity unchanged');
const movedCanonicalNote = editMusicCompositionNotes(createdCanonicalNote, 0, [{ oldRow: 4, start: 7, end: 11, pitch: 52, channelIndex: 1, instrumentIndex: 1 }]);
assert.equal(movedCanonicalNote.patterns[0].notes[0].id, canonicalNote.id, 'moving a canonical note retains its UUID');
assert.deepEqual({ row: movedCanonicalNote.patterns[0].notes[0].row, pitch: movedCanonicalNote.patterns[0].notes[0].pitch, durationRows: movedCanonicalNote.patterns[0].notes[0].durationRows }, { row: 7, pitch: 52, durationRows: 4 });
const deletedCanonicalNote = deleteMusicCompositionNotes(movedCanonicalNote, 0, [{ row: 7, channelIndex: 1 }]);
assert.equal(deletedCanonicalNote.patterns[0].notes.length, 0, 'deleting a canonical note removes only its selected cell');
const adjacentCanonicalNotes = editMusicCompositionNotes(source, 0, [
  { start: 4, end: 7, pitch: 49, channelIndex: 1, instrumentIndex: 1 },
  { start: 7, end: 10, pitch: 52, channelIndex: 1, instrumentIndex: 1 },
]);
const adjacentIds = adjacentCanonicalNotes.patterns[0].notes.map(note => note.id);
const shiftedCanonicalNotes = editMusicCompositionNotes(adjacentCanonicalNotes, 0, [
  { oldRow: 4, start: 7, end: 10, pitch: 49, channelIndex: 1, instrumentIndex: 1 },
  { oldRow: 7, start: 10, end: 13, pitch: 52, channelIndex: 1, instrumentIndex: 1 },
]);
assert.deepEqual(shiftedCanonicalNotes.patterns[0].notes.map(note => note.id), adjacentIds, 'batch moves retain note UUIDs when target cells overlap notes moving in the same edit');
const original = structuredClone(source);
const renamedPattern = setMusicCompositionPatternName(source, 0, 'Intro');
assert.equal(renamedPattern.patterns[0].name, 'Intro', 'pattern names persist in the canonical composition');
assert.equal(renamedPattern.patterns[0].id, source.patterns[0].id, 'renaming retains the pattern UUID');
const modProjection = getMusicTargetProjection(source, 'MOD');
const xmProjection = getMusicTargetProjection(source, 'XM');
const s3mProjection = getMusicTargetProjection(source, 'S3M');
const itProjection = getMusicTargetProjection(source, 'IT');
assert.deepEqual(modProjection.channelStates.map(channel => channel.enabled), [true, true, true, true, false, false, false, false]);
assert.ok(modProjection.warnings.some(warning => warning.includes('4 source channels are preserved')));
assert.ok(xmProjection.channelStates.every(channel => channel.enabled));
assert.ok(s3mProjection.channelStates.every(channel => channel.enabled));
assert.ok(itProjection.channelStates.every(channel => channel.enabled));
assert.deepEqual(source, original, 'changing the target projection never edits the canonical composition');
assert.deepEqual(modProjection.channelStates.map(channel => channel.channelId), source.channels.map(channel => channel.id));
assert.deepEqual(xmProjection.channelStates.map(channel => channel.channelId), source.channels.map(channel => channel.id));
assert.deepEqual(s3mProjection.channelStates.map(channel => channel.channelId), source.channels.map(channel => channel.id));
assert.deepEqual(itProjection.channelStates.map(channel => channel.channelId), source.channels.map(channel => channel.id));
const wideS3mSource = createMusicCompositionDocument('Wide target projection', 20);
const wideS3mProjection = getMusicTargetProjection(wideS3mSource, 'S3M');
assert.deepEqual(wideS3mProjection.channelStates.map(channel => channel.enabled), [...Array(16).fill(true), ...Array(4).fill(false)],
  'the GBA profile disables channels beyond its 16-channel playback limit while retaining their UUIDs');
assert.ok(wideS3mProjection.warnings.some(warning => warning.includes('4 source channels are preserved')));
assert.ok(getMusicTargetProjection(wideS3mSource, 'S3M', 32).channelStates.every(channel => channel.enabled),
  'S3M can represent all 32 channels when the project raises its active-channel profile');
for (const target of ['MOD', 'XM', 'S3M', 'IT']) {
  const switched = selectMusicExportTarget(source, target);
  assert.equal(switched.targetFormat, target);
  assert.deepEqual({ ...switched, targetFormat: source.targetFormat }, source, `switching to ${target} preserves canonical content and identity`);
}
assert.equal(source.targetFormat, 'XM', 'target switches do not mutate the saved source');

const raisedProjectLimit = getMusicTargetProjection(source, 'XM', 4);
assert.deepEqual(raisedProjectLimit.channelStates.map(channel => channel.enabled), [true, true, true, true, false, false, false, false]);
assert.ok(raisedProjectLimit.warnings.some(warning => warning.includes('GBA build profile supports 4 active music channels')));

const invalidIdentity = structuredClone(source);
invalidIdentity.channels[1].id = invalidIdentity.channels[0].id;
assert.equal(isMusicCompositionDocument(invalidIdentity), false, 'canonical IDs must be unique UUIDs');
const invalidReference = structuredClone(source);
invalidReference.order[0].patternId = invalidReference.channels[0].id;
assert.equal(isMusicCompositionDocument(invalidReference), false, 'ORDER references must resolve by pattern UUID');
const malformedRow = structuredClone(source);
malformedRow.channels[0] = null;
assert.equal(isMusicCompositionDocument(malformedRow), false, 'malformed source rows are rejected without throwing');
const capped = createMusicCompositionDocument('Capped', MAX_GBA_TRACKER_CHANNELS + 1);
assert.equal(capped.channels.length, MAX_GBA_TRACKER_CHANNELS);

const importedFixture = {
  format: 'XM', title: 'Imported source', tempoBpm: 138, ticksPerRow: 5, channels: 6,
  patterns: [{ rows: 8, events: [
    { row: 0, channel: 0, note: 49, instrument: 1, volume: 32, effect: 14, parameter: 0x80 },
    { row: 1, channel: 0, note: 0, instrument: 0, volume: 0, effect: 4, parameter: 19 },
    { row: 2, channel: 1, note: 0, instrument: 0, volume: 0, volumePresent: true, effect: 0, parameter: 0 },
    { row: 3, channel: 0, note: 97, instrument: 0, volume: 0, effect: 0, parameter: 0 },
  ] }],
  order: [0],
  channelMixer: { muted: [true], volumes: [0.75], pans: [-0.25] },
  instruments: [{ index: 1, name: 'Lead', sample: {
    samples: new Float32Array([-1, -0.5, 0, 0.5, 1, Number.NaN]), sampleRate: 22050,
    loopStart: 1, loopEnd: 5, loopType: 1, rootNote: 60, fineTune: -3, sixteenBit: false,
    variants: [{ samples: new Float32Array([-1, 0, 1]), sampleRate: 22050, loopStart: 0, loopEnd: 3, loopType: 2, rootNote: 60, sixteenBit: false, name: 'Low' },
      { samples: new Float32Array([0.25, -0.25]), sampleRate: 11025, loopStart: 0, loopEnd: 0, loopType: 0, rootNote: 72, sixteenBit: false, name: 'High' }],
    noteMap: Array.from({ length: 96 }, (_, note) => note < 48 ? 0 : 1),
  } }],
  sourceModule: { fileName: 'source.xm', fingerprint: '6-abc12345', parserVersion: '1', moduleData: Buffer.from([1, 2, 3]).toString('base64'), warnings: ['fixture warning'] },
};
const imported = createMusicCompositionFromImportedModule(importedFixture);
assert.equal(isMusicCompositionDocument(imported), true);
const invalidNotePan = structuredClone(imported);
invalidNotePan.patterns[0].notes[0].pan = 1.01;
assert.equal(isMusicCompositionDocument(invalidNotePan), false, 'note pan outside the stereo range is rejected');
assert.equal(imported.targetFormat, 'XM');
assert.equal(imported.patterns[0].notes.length, 1);
assert.equal(imported.patterns[0].notes[0].durationRows, 3, 'note duration is inferred up to the next note or explicit note-off');
assert.equal(imported.patterns[0].notes[0].pan, -1, 'XM E8x pan is normalized onto the note');
assert.equal(imported.patterns[0].notes[0].volume, 0.25, 'XM 0x20 note volume is decoded from its volume-column range');
assert.equal(imported.patterns[0].commands.length, 4, 'native pan/effect, explicit volume, and note-off are retained as normalized commands');
assert.equal(imported.patterns[0].notes[0].instrumentId, imported.instruments[0].id);
assert.equal(imported.instruments[0].noteMap.length, 2, 'per-note sample zones are preserved');
assert.equal(imported.samples.length, 2);
assert.equal(imported.samples[0].bitDepth, 16, 'normalized PCM uses deterministic signed PCM16');
assert.deepEqual(imported.channels[0], { ...imported.channels[0], volume: 0.75, pan: -0.25, muted: true });
assert.equal(imported.sourceModules[0].moduleData, Buffer.from([1, 2, 3]).toString('base64'), 'the exact imported module remains attached and immutable');
const foreignEffectCommand = { id: randomUUID(), row: 5, channelId: imported.channels[0].id, command: 'XM:effect-4', parameter: 44 };
const compositionWithForeignCommand = { ...imported, patterns: imported.patterns.map((pattern, index) => index === 0 ? { ...pattern, commands: [...pattern.commands, foreignEffectCommand] } : pattern) };
const modProjectionWithForeignCommand = createMusicCompositionFromImportedModule({
  ...importedFixture, format: 'MOD', existingComposition: compositionWithForeignCommand,
  sourceModule: { ...importedFixture.sourceModule, fileName: 'target.mod' },
});
assert.deepEqual(modProjectionWithForeignCommand.patterns[0].commands.find(command => command.id === foreignEffectCommand.id), foreignEffectCommand,
  'switching to MOD preserves commands authored for other formats on active channels');
assert.equal(modProjectionWithForeignCommand.sourceModules[0].format, 'XM', 'a cross-target save retains the original source module record');
assert.equal(modProjectionWithForeignCommand.sourceModules[0].moduleData, imported.sourceModules[0].moduleData, 'switching targets does not replace original module bytes');
assert.deepEqual(modProjectionWithForeignCommand.instruments[0].sampleIds, imported.instruments[0].sampleIds, 'a narrower target keeps all canonical sample variants');
assert.deepEqual(modProjectionWithForeignCommand.samples, imported.samples, 'MOD projection quantization does not overwrite canonical PCM or sample settings');
const returnedToXm = createMusicCompositionFromImportedModule({
  ...importedFixture,
  patterns: [{ ...importedFixture.patterns[0], events: [...importedFixture.patterns[0].events, { row: 5, channel: 0, note: 0, instrument: 0, volume: 0, effect: 4, parameter: 44 }] }],
  existingComposition: modProjectionWithForeignCommand,
});
assert.ok(returnedToXm.patterns[0].commands.some(command => command.id === foreignEffectCommand.id),
  'switching back restores the unsupported command with its original UUID');
const clearedXmCommands = createMusicCompositionFromImportedModule({
  ...importedFixture,
  patterns: [{ ...importedFixture.patterns[0], events: importedFixture.patterns[0].events.map(event => event.row === 1 ? { ...event, effect: 0, parameter: 0 } : event) }],
  existingComposition: compositionWithForeignCommand,
});
assert.equal(clearedXmCommands.patterns[0].commands.some(command => command.command === 'XM:effect-4'), false,
  'reimporting the active format still removes an effect that was intentionally cleared');
const importedWithImplicitVolume = createMusicCompositionFromImportedModule({
  ...importedFixture,
  patterns: [{ ...importedFixture.patterns[0], events: [{ ...importedFixture.patterns[0].events[0], volume: 0, volumePresent: false }] }],
});
assert.equal(importedWithImplicitVolume.patterns[0].notes[0].volume, 1, 'an absent tracker volume column retains the instrument default instead of muting imported notes');
const importedWithExplicitZeroVolume = createMusicCompositionFromImportedModule({
  ...importedFixture,
  patterns: [{ ...importedFixture.patterns[0], events: [{ ...importedFixture.patterns[0].events[0], volume: 0x10, volumePresent: true }] }],
});
assert.equal(importedWithExplicitZeroVolume.patterns[0].notes[0].volume, 0, 'XM volume-column 0x10 represents an explicit silent note');
assert.ok(getMusicTargetProjection(imported, 'MOD').warnings.some(warning => warning.includes('2 source channels are preserved')));
assert.ok(imported.sourceModules[0].warnings.includes('fixture warning'));
const panVariant = (format, effect, parameter) => createMusicCompositionFromImportedModule({
  ...importedFixture,
  format,
  patterns: [{ ...importedFixture.patterns[0], events: importedFixture.patterns[0].events.map((event, index) => index === 0 ? { ...event, effect, parameter } : event) }],
});
assert.equal(panVariant('MOD', 14, 0x88).patterns[0].notes[0].pan, 0, 'MOD E8x round-trips the exact center position');
assert.equal(panVariant('XM', 8, 255).patterns[0].notes[0].pan, 127 / 128, 'XM 8xx retains the exact Maxmod byte pan gain without stretching the right endpoint');
assert.equal(panVariant('S3M', 19, 0x84).patterns[0].notes[0].pan, -0.5, 'S3M S8x retains intermediate pan levels');
assert.equal(panVariant('IT', 24, 128).patterns[0].notes[0].pan, 0, 'IT Xxx round-trips the exact center position');
const authoringPan = setMusicCompositionNotePan(imported, 0, 0, 0, -0.99);
assert.equal(authoringPan.patterns[0].notes[0].pan, -1, 'the canonical note snaps authored pan to a marked position');
assert.equal(imported.patterns[0].notes[0].pan, -1, 'editing canonical pan does not mutate the previous composition');
const panReimport = createMusicCompositionFromImportedModule({
  ...importedFixture,
  patterns: [{ ...importedFixture.patterns[0], events: [{ row: 0, channel: 0, note: 49, instrument: 1, volume: 32, effect: 8, parameter: 1 }] }],
  existingComposition: authoringPan,
});
assert.equal(panReimport.patterns[0].notes[0].pan, -127 / 128, 'reimport reads the native module pan when it differs from the authored marked position');
const changedPanReimport = createMusicCompositionFromImportedModule({
  ...importedFixture,
  patterns: [{ ...importedFixture.patterns[0], events: [{ row: 0, channel: 0, note: 49, instrument: 1, volume: 32, effect: 8, parameter: 128 }] }],
  existingComposition: authoringPan,
});
assert.equal(changedPanReimport.patterns[0].notes[0].pan, 0, 'a changed native pan effect replaces the previous canonical value');
const reimported = createMusicCompositionFromImportedModule({
  ...importedFixture, tempoBpm: 144, existingComposition: imported,
  patterns: [{ ...importedFixture.patterns[0], events: importedFixture.patterns[0].events.map(event => event.row === 0 ? { ...event, volume: 48 } : event) }],
});
assert.equal(reimported.id, imported.id);
assert.deepEqual(reimported.channels.map(channel => channel.id), imported.channels.map(channel => channel.id));
assert.deepEqual(reimported.instruments.map(instrument => [instrument.id, ...instrument.sampleIds]), imported.instruments.map(instrument => [instrument.id, ...instrument.sampleIds]));
assert.deepEqual(reimported.patterns.map(pattern => [pattern.id, ...pattern.notes.map(note => note.id), ...pattern.commands.map(command => command.id)]), imported.patterns.map(pattern => [pattern.id, ...pattern.notes.map(note => note.id), ...pattern.commands.map(command => command.id)]));
assert.deepEqual(reimported.order.map(entry => entry.id), imported.order.map(entry => entry.id));
assert.equal(reimported.sourceModules[0].id, imported.sourceModules[0].id);
assert.equal(reimported.tempoBpm, 144);

const wideAuthoringSource = createMusicCompositionDocument('Wide MOD authoring source', 8, 'MOD');
const inactiveChannel = wideAuthoringSource.channels[7];
inactiveChannel.name = 'Reserved channel';
inactiveChannel.volume = 0.375;
inactiveChannel.pan = -0.625;
inactiveChannel.muted = true;
const inactiveNote = { id: randomUUID(), row: 2, channelId: inactiveChannel.id, pitch: 60, durationRows: 3,
  instrumentId: wideAuthoringSource.instruments[0].id, volume: 0.75, pan: 0.25 };
const inactiveCommand = { id: randomUUID(), row: 6, channelId: inactiveChannel.id, command: 'XM:effect-4', parameter: 19 };
wideAuthoringSource.patterns[0].notes.push(inactiveNote);
wideAuthoringSource.patterns[0].commands.push(inactiveCommand);
const savedModProjection = createMusicCompositionFromImportedModule({
  ...importedFixture, format: 'MOD', channels: 4, existingComposition: wideAuthoringSource,
  patterns: [{ ...importedFixture.patterns[0], events: importedFixture.patterns[0].events.filter(event => event.channel < 4) }],
});
assert.equal(savedModProjection.channels.length, 8, 'saving a narrower target must retain inactive authoring channels');
assert.equal(savedModProjection.channels[7].id, inactiveChannel.id, 'inactive channel UUIDs survive a native target round-trip');
assert.deepEqual(savedModProjection.channels[7], inactiveChannel, 'inactive channel name, volume, pan and mute state survive');
assert.deepEqual(savedModProjection.patterns[0].notes.find(note => note.id === inactiveNote.id), inactiveNote,
  'notes on target-disabled channels survive a save through the active module');
assert.deepEqual(savedModProjection.patterns[0].commands.find(command => command.id === inactiveCommand.id), inactiveCommand,
  'commands on target-disabled channels survive a save through the active module');
assert.equal(isMusicCompositionDocument(savedModProjection), true, 'the channel-preserving target projection remains valid canonical data');

for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  const moduleBytes = new Uint8Array(createTrackerModuleTemplate(format, 'Import fixture'));
  const composition = importTrackerModuleComposition(moduleBytes.buffer, `fixture.${format.toLowerCase()}`);
  assert.equal(isMusicCompositionDocument(composition), true, `${format} imports must normalize to the canonical composition schema`);
  assert.equal(composition.targetFormat, format);
  assert.equal(composition.sourceModules[0].moduleData, Buffer.from(moduleBytes).toString('base64'), `${format} source bytes must remain exact in the canonical document`);
  assert.equal(composition.patterns.length, 1);
  assert.equal(composition.order[0].patternId, composition.patterns[0].id);
}

const modImportTemplate = new Uint8Array(createTrackerModuleTemplate('MOD', 'MOD sample import'));
const modImportFixture = new Uint8Array(modImportTemplate.length + 8);
modImportFixture.set(modImportTemplate);
modImportFixture.set(Buffer.from('Fixture sample'), 20);
modImportFixture[42] = 0; modImportFixture[43] = 4;
modImportFixture[44] = 0x0f; modImportFixture[45] = 32;
modImportFixture[48] = 0; modImportFixture[49] = 2;
const importedModSample = importTrackerModuleComposition(modImportFixture.buffer, 'fixture.mod').samples[0];
assert.equal(importedModSample.loopStart, 0);
assert.equal(importedModSample.loopEnd, 4, 'MOD word-based sample loop length becomes four canonical sample frames');
assert.equal(importedModSample.loopType, 'forward', 'a valid MOD sample loop remains enabled after import');
assert.equal(importedModSample.fineTune, -16, 'MOD 1/8-semitone finetune converts to canonical 1/128-semitone units');

const soda7Bytes = fs.readFileSync(path.resolve('templateEngineGame/shooter_game/assets/musics/soda7_xcopy_ohc.s3m'));
const soda7Buffer = soda7Bytes.buffer.slice(soda7Bytes.byteOffset, soda7Bytes.byteOffset + soda7Bytes.byteLength);
const importedSoda7 = importTrackerModuleComposition(soda7Buffer, 'soda7_xcopy_ohc.s3m');
const soda7Instrument11 = importedSoda7.instruments.find(instrument => instrument.index === 10);
const soda7Sample11 = importedSoda7.samples.find(sample => sample.id === soda7Instrument11?.sampleIds[0]);
assert.deepEqual(
  soda7Sample11 && { loopStart: soda7Sample11.loopStart, loopEnd: soda7Sample11.loopEnd, loopType: soda7Sample11.loopType },
  { loopStart: 4, loopEnd: 4020, loopType: 'forward' },
  'S3M sample loop flags and bounds must survive canonical import for Preview and export',
);
const soda7Instrument25 = importedSoda7.instruments.find(instrument => instrument.index === 24);
const soda7Sample25 = importedSoda7.samples.find(sample => sample.id === soda7Instrument25?.sampleIds[0]);
assert.deepEqual(
  soda7Sample25 && { loopStart: soda7Sample25.loopStart, loopEnd: soda7Sample25.loopEnd, loopType: soda7Sample25.loopType },
  { loopStart: 0, loopEnd: 0, loopType: 'none' },
  'an unlooped S3M instrument must remain unlooped after canonical import',
);

console.log('Canonical composition and non-destructive target channel projection passed.');
