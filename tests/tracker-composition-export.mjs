import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { inlineTrackerIdentity } from './helpers/tracker-module-identity.mjs';

const root = path.resolve('src/renderer/frontend/src/utils');
const compile = filename => ts.transpileModule(fs.readFileSync(path.join(root, filename), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const dataUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;

const templateSource = compile('xmBeatTemplate.ts');
const compatibilitySource = ts.transpileModule(fs.readFileSync('src/shared/trackerItBuildCompatibility.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const identitySource = compile('trackerIdentity.ts');
const instrumentLibrarySource = compile('trackerInstrumentLibrary.ts');
const instrumentLibraryUrl = dataUrl(instrumentLibrarySource);
const panSource = compile('trackerNotePan.ts');
const trackerSource = inlineTrackerIdentity(compile('trackerModule.ts')
  .replace("from './xmBeatTemplate';", `from '${dataUrl(templateSource)}';`)
  .replaceAll("from './trackerInstrumentLibrary';", `from '${instrumentLibraryUrl}';`)
  .replace("from '../../../../shared/trackerItBuildCompatibility';", `from '${dataUrl(compatibilitySource)}';`));
const compositionSource = inlineTrackerIdentity(compile('trackerComposition.ts')
  .replace("from './trackerInstrumentLibrary';", `from '${instrumentLibraryUrl}';`)
  .replace("from './trackerNotePan';", `from '${dataUrl(panSource)}';`));
const pianoRollSource = compile('trackerPianoRollModel.ts');
const exporterSource = inlineTrackerIdentity(compile('trackerCompositionExport.ts'))
  .replace("from './trackerModule';", `from '${dataUrl(trackerSource)}';`)
  .replace("from './trackerComposition';", `from '${dataUrl(compositionSource)}';`)
  .replace("from './trackerIdentity';", `from '${dataUrl(identitySource)}';`)
  .replace("from './trackerNotePan';", `from '${dataUrl(panSource)}';`)
  .replace("from './trackerPianoRollModel';", `from '${dataUrl(pianoRollSource)}';`);
const modulePlayerSource = compile('modPlayer.ts');
const envelopeSource = compile('trackerEnvelope.ts');
const compositionImportSource = compile('trackerCompositionImport.ts')
  .replace("from './trackerComposition';", `from '${dataUrl(compositionSource)}';`)
  .replace("from './modPlayer';", `from '${dataUrl(modulePlayerSource)}';`)
  .replace("from './trackerModule';", `from '${dataUrl(trackerSource)}';`)
  .replace("from './trackerPianoRollModel';", `from '${dataUrl(pianoRollSource)}';`);

const composition = await import(dataUrl(compositionSource));
const tracker = await import(dataUrl(trackerSource));
const notePan = await import(dataUrl(panSource));
for (const format of ['XM', 'S3M', 'IT']) {
  const encoded = notePan.encodeTrackerNotePan(format, 0.37);
  assert.ok(notePan.decodeTrackerNotePan(format, encoded.effect, encoded.parameter) > 0.2, `${format} should retain the nearest marked right pan level`);
}
const modPan = notePan.encodeTrackerNotePan('MOD', 0.37);
assert.ok(notePan.decodeTrackerNotePan('MOD', modPan.effect, modPan.parameter) > 0.2, 'MOD should retain multiple pan positions between center and hard right');
assert.ok(notePan.decodeTrackerNotePan('MOD', modPan.effect, modPan.parameter) < 0.5, 'MOD pan should quantize to its closest supported position');
const exporter = await import(dataUrl(exporterSource));
const compositionImporter = await import(dataUrl(compositionImportSource));
const modulePlayer = await import(dataUrl(modulePlayerSource));
let s3mEmptyNoteSource = composition.createMusicCompositionForTarget('S3M', 'S3M empty note sentinel');
s3mEmptyNoteSource = composition.addMusicCompositionInstrumentPreset(s3mEmptyNoteSource, 'sine-lead');
s3mEmptyNoteSource.patterns[0].notes.push({
  id: crypto.randomUUID(), row: 0, channelId: s3mEmptyNoteSource.channels[0].id, pitch: 49,
  durationRows: 8, instrumentId: s3mEmptyNoteSource.instruments.at(-1).id, volume: 1, pan: 0,
});
const s3mEmptyNoteBytes = exporter.exportMusicComposition(s3mEmptyNoteSource, 'S3M').moduleData;
const s3mInstrumentOnlyBytes = tracker.updateS3mPatternEvents(s3mEmptyNoteBytes, 0, [
  { row: 1, channel: 0, patch: { note: 255, instrument: 1 } },
  { row: 2, channel: 0, patch: { note: 255, instrument: 1, volume: 32, volumePresent: true, effect: 4, parameter: 2 } },
]);
const s3mEmptyNoteImported = compositionImporter.importTrackerModuleComposition(s3mInstrumentOnlyBytes, 'empty-note.s3m');
assert.ok(!s3mEmptyNoteImported.patterns[0].commands.some(command => command.command === 'S3M:note-cut'), 'S3M 0xFF means no note even when an instrument number is present');
const s3mEmptyNoteReexport = exporter.exportMusicComposition(s3mEmptyNoteImported, 'S3M');
const s3mEmptyNoteRows = tracker.parseS3mPatternRows(s3mEmptyNoteReexport.moduleData, 0, 4);
assert.notEqual(s3mEmptyNoteRows[1][0].note, 254, 'S3M import/export must not turn an instrument-only 0xFF cell into a note-off');
assert.equal(s3mEmptyNoteRows[2][0].note, 0, 'S3M volume/effect-only cells remain note-less');
assert.equal(s3mEmptyNoteRows[2][0].volume, 32, 'S3M import/export must preserve a volume column without a note');
assert.equal(s3mEmptyNoteRows[2][0].effect, 4, 'S3M import/export must preserve a Dxy slide beside a note-less volume column');
assert.equal(s3mEmptyNoteRows[2][0].parameter, 2);
const soda7Bytes = fs.readFileSync(path.join('templateEngineGame', 'shooter_game', 'assets', 'musics', 'soda7_xcopy_ohc.s3m'));
const soda7Buffer = soda7Bytes.buffer.slice(soda7Bytes.byteOffset, soda7Bytes.byteOffset + soda7Bytes.byteLength);
const soda7SourceSample10 = tracker.parseS3mSamples(soda7Buffer).get(10);
const soda7Imported = compositionImporter.importTrackerModuleComposition(soda7Buffer, 'soda7_xcopy_ohc.s3m');
const soda7Reexported = exporter.exportMusicComposition(soda7Imported, 'S3M');
const soda7ExportedSample10 = tracker.parseS3mSamples(soda7Reexported.moduleData).get(10);
assert.ok(soda7SourceSample10 && soda7ExportedSample10, 'the real Soda7 S3M fixture must retain sample 10 through canonical import/export');
assert.equal(soda7ExportedSample10.samples.length, soda7SourceSample10.samples.length, 'real Soda7 sample 10 retains its exact frame count');
assert.equal(soda7ExportedSample10.volume, soda7SourceSample10.volume, 'real Soda7 sample 10 retains its default volume');
assert.equal(soda7ExportedSample10.sampleRate, soda7SourceSample10.sampleRate, 'real Soda7 sample 10 retains its sample rate');
assert.deepEqual([...soda7ExportedSample10.samples], [...soda7SourceSample10.samples], 'real Soda7 sample 10 PCM amplitude survives unsigned/signed S3M conversion exactly');
let zeroLengthSampleSource = composition.createMusicCompositionForTarget('MOD', 'Zero length source sample');
zeroLengthSampleSource = composition.addMusicCompositionInstrumentPreset(zeroLengthSampleSource, 'sine-lead');
const zeroLengthSourceInstrument = zeroLengthSampleSource.instruments.at(-1);
zeroLengthSampleSource.patterns[0].notes.push({
  id: crypto.randomUUID(), row: 0, channelId: zeroLengthSampleSource.channels[0].id, pitch: 49,
  durationRows: 4, instrumentId: zeroLengthSourceInstrument.id, volume: 1, pan: 0,
});
const zeroLengthSourceBytes = new Uint8Array(exporter.exportMusicComposition(zeroLengthSampleSource, 'MOD').moduleData);
zeroLengthSourceBytes[42] = 0;
zeroLengthSourceBytes[43] = 0;
const zeroLengthImported = compositionImporter.importTrackerModuleComposition(
  zeroLengthSourceBytes.buffer, 'zero-length-sample.mod', zeroLengthSourceBytes.buffer,
);
assert.equal(zeroLengthImported.samples.length, 0, 'empty source PCM remains in the immutable module and is not fabricated as an editable canonical sample');
assert.equal(zeroLengthImported.instruments[0].sampleIds.length, 0, 'a note using an empty source sample keeps an instrument without a broken sample reference');
const zeroLengthReexport = exporter.exportMusicComposition(zeroLengthImported, 'MOD');
assert.equal(tracker.parseTrackerModule(zeroLengthReexport.moduleData, 'MOD').format, 'MOD', 'a module containing referenced zero-length source samples can still produce a valid silent target projection');
const creationProfiles = { MOD: 'retro', XM: 'beat', S3M: 'tracker', IT: 'advanced' };
for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  const draft = composition.createMusicCompositionForTarget(format, 'New Beat');
  assert.equal(draft.targetFormat, format, `${format} authoring profile should set its initial export target`);
  assert.equal(draft.profile, creationProfiles[format], `${format} should use the matching creation profile`);
  assert.equal(draft.channels.length, format === 'MOD' || format === 'XM' ? 4 : 8, `${format} should start with the planned channel count`);
  assert.deepEqual(draft.sourceModules, [], `${format} scratch projects should start from canonical composition data`);
  const target = exporter.exportMusicComposition(draft, format);
  assert.equal(tracker.parseTrackerModule(target.moduleData, format).format, format, `${format} scratch project should materialize a native ${format} module`);
}
const presetIds = ['sine-lead', 'pulse-lead', 'triangle-bass', 'noise-hit'];
let authoredPresets = composition.createMusicCompositionForTarget('XM', 'Preset library');
for (const presetId of presetIds) authoredPresets = composition.addMusicCompositionInstrumentPreset(authoredPresets, presetId);
const authoredPresetInstrumentIds = authoredPresets.instruments.slice(1).map(instrument => instrument.id);
const authoredPresetSampleIds = authoredPresets.samples.map(sample => sample.id);
assert.equal(new Set([...authoredPresetInstrumentIds, ...authoredPresetSampleIds]).size, 8, 'each preset instrument and sample receives its own UUID');
assert.deepEqual(authoredPresets.instruments.slice(1).map(instrument => instrument.noteMap), presetIds.map((_, index) => [
  { low: 0, high: 127, sampleId: authoredPresets.samples[index].id },
]), 'each bundled preset maps its editable sample over the full note range');
const canonicalPresetPcm = authoredPresets.samples.map(sample => sample.pcmData);
for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  const projected = composition.selectMusicExportTarget(authoredPresets, format);
  const module = exporter.exportMusicComposition(projected, format);
  const parsed = tracker.parseTrackerModule(module.moduleData, format);
  const nativeSampleCount = format === 'S3M' ? tracker.parseS3mSamples(module.moduleData).size
    : format === 'IT' ? tracker.parseItSamples(module.moduleData).size
      : parsed.instruments;
  assert.ok(nativeSampleCount >= 5, `${format} exports all four presets as native instruments with samples (reported ${nativeSampleCount})`);
  assert.deepEqual(projected.instruments.slice(1).map(instrument => instrument.id), authoredPresetInstrumentIds, `${format} target selection preserves preset instrument UUIDs`);
  assert.deepEqual(projected.samples.map(sample => sample.id), authoredPresetSampleIds, `${format} target selection preserves preset sample UUIDs`);
  assert.deepEqual(projected.samples.map(sample => sample.pcmData), canonicalPresetPcm, `${format} target selection preserves canonical preset PCM`);
}
const project = composition.createMusicCompositionDocument('Canonical Export', 8, 'XM');
project.channels[7].pan = -0.25;
const sample = new Int16Array([-32768, -12000, 0, 12000, 32767]);
project.samples.push({
  id: crypto.randomUUID(), name: '16 bit tone', sampleRate: 8363, channels: 1, bitDepth: 16,
  pcmData: Buffer.from(sample.buffer).toString('base64'), volume: 0.75, panning: 0,
  rootNote: 48, fineTune: 0, loopStart: 0, loopEnd: sample.length, loopType: 'forward',
});
project.instruments[0].sampleIds = [project.samples[0].id];
project.instruments[0].noteMap = [{ low: 0, high: 95, sampleId: project.samples[0].id }];
project.instruments[0].volumeEnvelope = {
  points: [{ tick: 0, value: 1 }, { tick: 8, value: 0.5 }, { tick: 20, value: 0 }],
  sustainStart: 1, sustainEnd: 1, loopStart: 1, loopEnd: 2, enabled: true, sustainEnabled: true, loopEnabled: true,
};
project.instruments[0].panningEnvelope = {
  points: [{ tick: 0, value: 0.5 }, { tick: 12, value: 0.75 }],
  sustainStart: 0, sustainEnd: 0, loopStart: 0, loopEnd: 1, enabled: true, sustainEnabled: false, loopEnabled: true,
};
project.instruments[0].fadeout = 2048;
const note = {
  id: crypto.randomUUID(), row: 0, channelId: project.channels[7].id, pitch: 49,
  durationRows: 2, instrumentId: project.instruments[0].id, volume: 0.75, pan: 0.5,
};
project.patterns[0].notes.push(note);
project.patterns[0].commands.push({
  id: crypto.randomUUID(), row: 5, channelId: project.channels[7].id, command: 'XM:effect-a', parameter: 15,
});
const crossTargetEffect = { id: crypto.randomUUID(), row: 6, channelId: project.channels[0].id, command: 'XM:effect-4', parameter: 0x2a };
project.patterns[0].commands.push(crossTargetEffect);
project.sourceModules = [{ id: crypto.randomUUID(), format: 'XM', fileName: 'original.xm', fingerprint: 'source-xm', parserVersion: 'test', moduleData: '', warnings: [] }];

const exported = exporter.exportMusicCompositionToXm(project);
project.sourceModules[0].moduleData = Buffer.from(new Uint8Array(exported.moduleData)).toString('base64');
project.sourceModules[0].fingerprint = tracker.getMusicModuleFingerprint(exported.moduleData);
const info = tracker.parseTrackerModule(exported.moduleData, 'xm');
assert.equal(info.format, 'XM');
assert.equal(info.channels, 8, 'XM export preserves every canonical channel, including channels beyond the MOD ceiling');
assert.ok(!exported.warnings.some(warning => warning.includes('XM:effect-a') || warning.includes('command') && warning.includes('omitted')),
  'native XM effect is preserved without a warning');
const rows = tracker.parseXmPatternRows(exported.moduleData, 0, 64);
assert.equal(rows[0][7].note, 49);
assert.equal(rows[0][7].instrument, 1);
assert.equal(rows[0][7].volume, 0x40);
assert.deepEqual({ effect: rows[0][7].effect, parameter: rows[0][7].parameter }, { effect: 8, parameter: 160 });
assert.equal(rows[2][7].note, 97, 'canonical row duration exports as XM note-off');
assert.equal(rows[5][7].effect, 10);
const modProjection = exporter.exportMusicComposition(project, 'MOD');
assert.ok(modProjection.warnings.some(warning => warning.includes('XM:effect-4') && warning.includes('omitted')),
  'a target that cannot represent an effect warns before exporting it away');
const modRoundTrip = compositionImporter.importTrackerModuleComposition(modProjection.moduleData, 'target.mod', modProjection.moduleData, project);
assert.deepEqual(modRoundTrip.patterns[0].commands.find(command => command.id === crossTargetEffect.id), crossTargetEffect,
  'saving the narrower MOD projection retains the XM command in canonical source data');
const returnedXm = exporter.exportMusicComposition(modRoundTrip, 'XM');
const returnedXmRows = tracker.parseXmPatternRows(returnedXm.moduleData, 0, 256);
assert.deepEqual({ effect: returnedXmRows[6][0].effect, parameter: returnedXmRows[6][0].parameter },
  { effect: 4, parameter: 0x2a }, 'switching back to XM restores the previously unsupported effect');
const highZoneComposition = structuredClone(project);
highZoneComposition.instruments[0].noteMap = [{ low: 96, high: 127, sampleId: highZoneComposition.instruments[0].sampleIds[0] }];
assert.ok(exporter.exportMusicCompositionToXm(highZoneComposition).warnings.some(warning => warning.includes('above note 96') && warning.includes('remain canonical')),
  'XM export warns when canonical zones exceed its 96-note keyboard range');
for (const { format, effect, parameter } of [
  { format: 'MOD', effect: 14, parameter: 0x86 },
  { format: 'XM', effect: 4, parameter: 0x2a },
  { format: 'S3M', effect: 4, parameter: 0x2a },
  { format: 'IT', effect: 4, parameter: 0x2a },
]) {
  const source = structuredClone(project);
  const command = { id: crypto.randomUUID(), row: 7, channelId: source.channels[0].id, command: `${format}:effect-${effect.toString(16)}`, parameter };
  source.patterns[0].commands = [command];
  const narrowExport = exporter.exportMusicComposition(source, 'MOD');
  const narrowComposition = compositionImporter.importTrackerModuleComposition(narrowExport.moduleData, 'round-trip.mod', narrowExport.moduleData, source);
  assert.deepEqual(narrowComposition.patterns[0].commands.find(item => item.id === command.id), command,
    `${format} commands remain in the canonical source through a MOD projection`);
  const restoredExport = exporter.exportMusicComposition(narrowComposition, format);
  const restoredBytes = new Uint8Array(restoredExport.moduleData);
  const restoredCell = format === 'MOD'
    ? { effect: restoredBytes[1084 + 7 * 4 * 4 + 2] & 0x0f, parameter: restoredBytes[1084 + 7 * 4 * 4 + 3] }
    : format === 'XM' ? tracker.parseXmPatternRows(restoredExport.moduleData, 0, 256)[7][0]
      : format === 'S3M' ? tracker.parseS3mPatternRows(restoredExport.moduleData, 0, 64)[7][0]
        : tracker.parseItPatternRows(restoredExport.moduleData, 0, 64)[7][0];
  assert.deepEqual({ effect: restoredCell.effect, parameter: restoredCell.parameter }, { effect, parameter },
    `${format} target export restores the exact command and parameter after switching away`);
}
assert.equal(rows[5][7].parameter, 15);
assert.ok(exported.warnings.some(warning => warning.includes('Sample 16 bit tone rate')) === false);
const samples = tracker.parseXmSamples(exported.moduleData).get(1);
assert.ok(samples);
assert.deepEqual(samples.volumeEnvelope.points, [{ tick: 0, value: 64 }, { tick: 8, value: 32 }, { tick: 20, value: 0 }], 'XM export retains volume envelope nodes and values');
assert.equal(samples.volumeEnvelope.enabled, true);
assert.equal(samples.volumeEnvelope.sustainEnabled, true);
assert.deepEqual(samples.panningEnvelope.points, [{ tick: 0, value: 32 }, { tick: 12, value: 48 }], 'XM export retains panning envelope nodes and values');
assert.equal(samples.panningEnvelope.loopEnabled, true);
assert.equal(samples.fadeout, 2048, 'XM export retains instrument fadeout');
assert.equal(samples.variants[0].sixteenBit, true);
assert.deepEqual([...samples.variants[0].samples], [-1, -12000 / 32768, 0, 12000 / 32768, 32767 / 32768]);

const highRateComposition = structuredClone(project);
highRateComposition.samples[0].sampleRate = 48_000;
highRateComposition.samples[0].rootNote = 53;
highRateComposition.samples[0].fineTune = 16;
const highRateExport = exporter.exportMusicCompositionToXm(highRateComposition);
const highRateSample = tracker.parseXmSamples(highRateExport.moduleData).get(1).variants[0];
const canonicalRootRate = 48_000 * 2 ** ((53 - 48 + 16 / 128) / 12);
const exportedRootRate = highRateSample.sampleRate * 2 ** ((highRateSample.rootNote - 48 + highRateSample.fineTune / 128) / 12);
const xmRateErrorSemitones = Math.abs(12 * Math.log2(exportedRootRate / canonicalRootRate));
assert.ok(xmRateErrorSemitones < 0.01, `XM relative-note/fine-tune should preserve the canonical root rate (error ${xmRateErrorSemitones} semitones)`);
assert.ok(highRateExport.warnings.some(warning => warning.includes('represented by XM relative-note/fine-tune metadata')),
  'XM export should explain how a nonstandard canonical sample rate is represented');
assert.deepEqual([...highRateSample.samples], [...samples.variants[0].samples], 'tuning changes must not resample or rewrite canonical PCM');
for (const target of ['MOD', 'S3M', 'IT']) {
  const projectedModule = exporter.exportMusicComposition(project, target);
  const projectedComposition = compositionImporter.importTrackerModuleComposition(projectedModule.moduleData, `projection.${target.toLowerCase()}`, projectedModule.moduleData, project);
  assert.deepEqual(projectedComposition.samples, project.samples, `${target} module quantization does not replace canonical sample data`);
  assert.deepEqual(projectedComposition.instruments[0].sampleIds, project.instruments[0].sampleIds, `${target} keeps canonical sample identity`);
  assert.deepEqual(projectedComposition.sourceModules, project.sourceModules, `${target} reimport retains original source module bytes and identity`);
}

const modProject = structuredClone(project);
modProject.title = 'MOD fidelity';
modProject.channels[0].pan = 0;
modProject.channels[0].volume = 1;
modProject.channels[0].muted = false;
modProject.patterns[0].notes = [
  { ...note, channelId: modProject.channels[0].id, pan: -0.5, volume: 1 },
  { ...note, id: crypto.randomUUID(), channelId: modProject.channels[7].id },
];
modProject.patterns[0].commands = [];
modProject.ticksPerRow = 4;
modProject.tempoBpm = 140;
const modFlowCollision = structuredClone(modProject);
modFlowCollision.patterns[0].commands.push({
  id: crypto.randomUUID(), row: 0, channelId: modFlowCollision.channels[0].id, command: 'MOD:effect-d', parameter: 0,
});
const modFlowCollisionExport = exporter.exportMusicCompositionToMod(modFlowCollision);
const modFlowCollisionBytes = new Uint8Array(modFlowCollisionExport.moduleData);
const modFlowCollisionBuffer = modFlowCollisionBytes.buffer.slice(modFlowCollisionBytes.byteOffset, modFlowCollisionBytes.byteOffset + modFlowCollisionBytes.byteLength);
const modFlowCollisionParsed = modulePlayer.parseModModule(modFlowCollisionBuffer);
const preservedFlowCommands = modFlowCollisionParsed.patterns[0][0].flatMap((event, channel) => event.effect === 13 ? [{ channel, parameter: event.parameter }] : []);
assert.deepEqual(preservedFlowCommands, [{ channel: 0, parameter: 0 }], 'MOD position breaks retain their source channel when note panning yields to the native effect');
const modVolumeCollision = structuredClone(modProject);
modVolumeCollision.patterns[0].commands.push({
  id: crypto.randomUUID(), row: 0, channelId: modVolumeCollision.channels[0].id, command: 'MOD:volume', parameter: 22,
});
const modVolumeCollisionBytes = new Uint8Array(exporter.exportMusicCompositionToMod(modVolumeCollision).moduleData);
assert.deepEqual([modVolumeCollisionBytes[1084 + 2] & 0x0f, modVolumeCollisionBytes[1084 + 3]], [12, 22],
  'MOD Cxx volume commands keep the only effect column when implicit note panning collides');
const modExport = exporter.exportMusicCompositionToMod(modProject);
const modBytes = new Uint8Array(modExport.moduleData);
assert.equal(String.fromCharCode(...modBytes.slice(1080, 1084)), 'M.K.');
assert.equal(modBytes[950], 1);
const modCell = 1084;
const modSample = (modBytes[modCell] & 0xf0) | (modBytes[modCell + 2] >> 4);
assert.equal(modSample, 1);
assert.equal(modBytes[modCell + 2] & 0x0f, 14);
assert.equal(modBytes[modCell + 3], 0x84, 'MOD pan keeps an intermediate left-of-center E8x level');
assert.deepEqual([...modBytes.slice(42, 44)], [0, 3], 'MOD sample length is stored as a big-endian word count');
assert.deepEqual([...modBytes.slice(2108, 2114)], [0x80, 0xd1, 0, 0x2f, 0x7f, 0], 'MOD sample data is signed 8-bit PCM');
assert.equal(modBytes[1084 + (2 * 4) * 4 + 2] & 0x0f, 14);
assert.equal(modBytes[1084 + (2 * 4) * 4 + 3], 0xc0, 'canonical note duration exports as MOD note-off');
const rowZeroGlobalParameters = [1, 2, 3].filter(channel => (modBytes[1084 + channel * 4 + 2] & 0x0f) === 15)
  .map(channel => modBytes[1084 + channel * 4 + 3]);
assert.deepEqual(rowZeroGlobalParameters, [4, 140], 'speed and tempo are serialized in unused row-zero effect columns');
assert.ok(modExport.warnings.some(warning => warning.includes('reduced from 16-bit to 8-bit')));
assert.ok(modExport.warnings.some(warning => warning.includes('4 channels')));

const importedModPanSource = structuredClone(modProject);
importedModPanSource.channels[0].pan = -0.25;
importedModPanSource.patterns[0].notes[0].pan = -0.5;
const importedModPanFirstExport = exporter.exportMusicCompositionToMod(importedModPanSource).moduleData;
const importedModPanBytes = new Uint8Array(importedModPanFirstExport);
const importedModPanParameter = importedModPanBytes[1084 + 3];
const importedModPanComposition = compositionImporter.importTrackerModuleComposition(importedModPanFirstExport, 'pan-state.mod');
assert.equal(importedModPanComposition.channels[0].pan, -0.5, 'MOD round-trip fixture restores its standard channel pan');
assert.equal(importedModPanComposition.patterns[0].notes.find(item => item.channelId === importedModPanComposition.channels[0].id)?.pan, -0.75,
  'MOD note pan effect records the channel position selected on that row');
const importedModPanRoundTrip = exporter.exportMusicCompositionToMod(importedModPanComposition).moduleData;
assert.equal(new Uint8Array(importedModPanRoundTrip)[1084 + 3], importedModPanParameter,
  'same-row imported MOD panning does not add the channel pan a second time');
const editedModPanComposition = structuredClone(importedModPanComposition);
editedModPanComposition.patterns[0].notes.find(item => item.channelId === editedModPanComposition.channels[0].id).pan = -0.25;
assert.equal(new Uint8Array(exporter.exportMusicCompositionToMod(editedModPanComposition).moduleData)[1084 + 3], 0x86,
  'editing an imported MOD note pan replaces its old effect using the selected marked position');

const s3mExport = exporter.exportMusicComposition(modProject, 'S3M');
const s3mInfo = tracker.parseTrackerModule(s3mExport.moduleData, 's3m');
assert.equal(s3mInfo.format, 'S3M');
assert.equal(s3mInfo.channels, 8);
assert.equal(s3mInfo.instruments, 1);
const s3mRows = tracker.parseS3mPatternRows(s3mExport.moduleData, 0, 64);
assert.equal(s3mRows[0][0].note, 64, 'canonical pitches are packed as S3M octave/semitone nibbles');
assert.equal(s3mRows[0][0].instrument, 1);
assert.equal(s3mRows[0][0].volume, 64);
assert.equal(s3mRows[0][0].effect, 19);
assert.equal(s3mRows[0][0].parameter, 0x84, 'S3M preserves the nearest representable left-of-center pan with S8x');
assert.equal(s3mRows[2][0].note, 254, 'canonical duration exports as the S3M note-off marker');
const s3mSamples = tracker.parseS3mSamples(s3mExport.moduleData);
assert.deepEqual([...s3mSamples.get(1).samples], [-1, -47 / 128, 0, 47 / 128, 127 / 128]);
assert.ok(s3mExport.warnings.some(warning => warning.includes('reduced from 16-bit to signed 8-bit')));
const s3mOrderFlowCollision = structuredClone(modProject);
s3mOrderFlowCollision.patterns[0].commands.push({ id: crypto.randomUUID(), row: 0, channelId: s3mOrderFlowCollision.channels[0].id, command: 'S3M:effect-3', parameter: 0 });
const s3mOrderFlowCollisionExport = exporter.exportMusicCompositionToS3m(s3mOrderFlowCollision);
const s3mOrderFlowCollisionRows = tracker.parseS3mPatternRows(s3mOrderFlowCollisionExport.moduleData, 0, 64);
assert.deepEqual(s3mOrderFlowCollisionRows[0].flatMap((event, channel) => event.effect === 3 ? [{ channel, parameter: event.parameter }] : []),
  [{ channel: 1, parameter: 0 }], 'S3M pattern breaks move to another free effect column when note pan occupies the source channel');
assert.ok(!s3mOrderFlowCollisionExport.warnings.some(warning => warning.includes('S3M:effect-3 was omitted')));
const importedS3mPanSource = structuredClone(modProject);
importedS3mPanSource.channels[0].pan = -0.25;
importedS3mPanSource.patterns[0].notes[0].pan = -0.5;
const importedS3mPanFirstExport = exporter.exportMusicCompositionToS3m(importedS3mPanSource).moduleData;
const importedS3mPanFirstCell = tracker.parseS3mPatternRows(importedS3mPanFirstExport, 0, 64)[0][0];
const importedS3mPanComposition = compositionImporter.importTrackerModuleComposition(importedS3mPanFirstExport, 'pan-state.s3m');
assert.equal(importedS3mPanComposition.channels[0].pan, -0.25, 'S3M round-trip fixture retains the channel header pan');
assert.equal(importedS3mPanComposition.patterns[0].notes.find(item => item.channelId === importedS3mPanComposition.channels[0].id)?.pan, -0.75,
  'S3M note pan effect records the channel position selected on that row');
const importedS3mPanRoundTrip = exporter.exportMusicCompositionToS3m(importedS3mPanComposition).moduleData;
assert.equal(tracker.parseS3mPatternRows(importedS3mPanRoundTrip, 0, 64)[0][0].parameter, importedS3mPanFirstCell.parameter,
  'same-row imported S3M panning does not add the channel header pan a second time');
const persistentS3mPanComposition = structuredClone(importedS3mPanComposition);
const persistentS3mPanNote = persistentS3mPanComposition.patterns[0].notes[0];
persistentS3mPanComposition.patterns[0].notes.push({
  ...persistentS3mPanNote, id: crypto.randomUUID(), row: 1, pan: 0, panMode: undefined,
});
const persistentS3mPanRows = tracker.parseS3mPatternRows(
  exporter.exportMusicCompositionToS3m(persistentS3mPanComposition).moduleData, 0, 64,
);
assert.equal(persistentS3mPanRows[0][0].parameter, importedS3mPanFirstCell.parameter,
  'S3M note pan command remains on the row where the user set it');
assert.notEqual(persistentS3mPanRows[1][0].effect, 19,
  'a following note without a pan edit inherits the persistent S3M channel pan');
const authoredPersistentPan = structuredClone(modProject);
authoredPersistentPan.channels[0].pan = -0.25;
authoredPersistentPan.patterns[0].notes = [
  { ...authoredPersistentPan.patterns[0].notes[0], row: 0, channelId: authoredPersistentPan.channels[0].id, pan: -0.5 },
  { ...authoredPersistentPan.patterns[0].notes[0], id: crypto.randomUUID(), row: 1, channelId: authoredPersistentPan.channels[0].id, pan: 0 },
];
const authoredPersistentPanRows = tracker.parseS3mPatternRows(
  exporter.exportMusicCompositionToS3m(authoredPersistentPan).moduleData, 0, 64,
);
assert.equal(authoredPersistentPanRows[0][0].effect, 19, 'an authored note pan emits one S3M pan command at its row');
assert.equal(authoredPersistentPanRows[0][0].parameter, 0x82, 'the authored note pan combines with its channel pan once');
assert.notEqual(authoredPersistentPanRows[1][0].effect, 19,
  'a later neutral note preserves the authored pan state instead of restoring the channel baseline');
const editedS3mPanComposition = structuredClone(importedS3mPanComposition);
editedS3mPanComposition.patterns[0].notes.find(item => item.channelId === editedS3mPanComposition.channels[0].id).pan = -0.25;
assert.equal(tracker.parseS3mPatternRows(exporter.exportMusicCompositionToS3m(editedS3mPanComposition).moduleData, 0, 64)[0][0].parameter, 0x86,
  'editing an imported S3M note pan replaces its old effect using the selected marked position');
const s3mEffectZero = structuredClone(modProject);
s3mEffectZero.patterns[0].commands.push({ id: crypto.randomUUID(), row: 6, channelId: s3mEffectZero.channels[3].id, command: 'S3M:effect-0', parameter: 0x37 });
const s3mEffectZeroBytes = exporter.exportMusicCompositionToS3m(s3mEffectZero).moduleData;
assert.deepEqual([tracker.parseS3mPatternRows(s3mEffectZeroBytes, 0, 64)[6][3].effect, tracker.parseS3mPatternRows(s3mEffectZeroBytes, 0, 64)[6][3].parameter],
  [0, 0x37], 'S3M effect A/zero remains representable and is not mistaken for an empty effect column');
const itExport = exporter.exportMusicComposition(modProject, 'IT');
const itInfo = tracker.parseTrackerModule(itExport.moduleData, 'it');
assert.equal(itInfo.format, 'IT');
assert.equal(itInfo.channels, 8);
assert.equal(itInfo.sampleCount, 1);
const itRows = tracker.parseItPatternRows(itExport.moduleData, 0, 64);
assert.equal(itRows[0][0].note, 48, 'canonical IT pitches use the format-native zero-based note encoding');
assert.equal(itRows[0][0].instrument, 1);
assert.equal(itRows[0][0].volume, 64);
assert.equal(itRows[0][0].effect, 24);
assert.equal(itRows[0][0].parameter, 64, 'IT retains an intermediate left-of-center pan value');
assert.equal(new Uint8Array(itExport.moduleData)[0x2c] & 0x08, 0, 'new IT exports default to Amiga slides');
const linearItBytes = new Uint8Array(itExport.moduleData.slice(0));
linearItBytes[0x2c] |= 0x08;
const importedLinearIt = compositionImporter.importTrackerModuleComposition(linearItBytes.buffer, 'linear-slides.it');
assert.equal(importedLinearIt.itLinearSlides, true, 'IT import retains the source frequency-slide mode in the canonical composition');
assert.notEqual(new Uint8Array(exporter.exportMusicCompositionToIt(importedLinearIt).moduleData)[0x2c] & 0x08, 0,
  'canonical IT export preserves the imported linear-frequency slide mode');
const itFinePanBytes = tracker.updateItPatternEvent(itExport.moduleData, 0, 0, 0, { effect: 24, parameter: 0xef });
const importedItFinePan = compositionImporter.importTrackerModuleComposition(itFinePanBytes, 'fine-pan.it');
const itFinePanRoundTrip = exporter.exportMusicCompositionToIt(importedItFinePan).moduleData;
assert.equal(tracker.parseItPatternRows(itFinePanRoundTrip, 0, 64)[0][0].parameter, 0xef,
  'an unchanged imported IT XEF pan preserves its exact source byte across canonical export');
const editedItFinePan = structuredClone(importedItFinePan);
editedItFinePan.patterns[0].notes[0].pan -= 0.1;
assert.notEqual(tracker.parseItPatternRows(exporter.exportMusicCompositionToIt(editedItFinePan).moduleData, 0, 64)[0][0].parameter, 0xef,
  'editing an imported IT pan replaces the preserved source byte with the updated canonical value');
assert.equal(itRows[2][0].note, 255, 'canonical duration exports as the IT note-off marker');
const itSamples = tracker.parseItSamples(itExport.moduleData);
assert.equal(itSamples.get(1).samples.length, sample.length, 'IT length fields count sample points for 16-bit PCM');
assert.equal(itSamples.get(1).sixteenBit, true);
assert.equal(itSamples.get(1).sampleRate, Math.round(project.samples[0].sampleRate * 2 ** ((61 - project.samples[0].rootNote) / 12)),
  'IT C5 speed accounts for zero-based IT note fields and one-based canonical pitches');
assert.deepEqual([...itSamples.get(1).samples], [...sample].map(value => value / 32768));
const importedIt = compositionImporter.importTrackerModuleComposition(itExport.moduleData, 'canonical.it');
assert.equal(importedIt.patterns[0].notes[0].pitch, 49, 'IT note points round-trip to the canonical one-based pitch');
assert.equal(importedIt.patterns[0].notes[0].durationRows, 2);
assert.equal(importedIt.patterns[0].notes[0].pan, -0.5);
assert.equal(importedIt.order.length, 1, 'the required IT end marker does not become an empty ORDER entry');
const withPackedItPattern = (moduleData, packedRows, rowCount, patternIndex = 0) => {
  const source = new Uint8Array(moduleData);
  const sourceView = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const orderCount = sourceView.getUint16(0x20, true);
  const instrumentCount = sourceView.getUint16(0x22, true);
  const sampleCount = sourceView.getUint16(0x24, true);
  const patternPointerOffset = 192 + orderCount + instrumentCount * 4 + sampleCount * 4 + patternIndex * 4;
  const patternOffset = (source.length + 3) & ~3;
  const output = new Uint8Array(patternOffset + 8 + packedRows.length);
  output.set(source);
  const view = new DataView(output.buffer);
  view.setUint16(patternOffset, packedRows.length, true);
  view.setUint16(patternOffset + 2, rowCount, true);
  output.set(packedRows, patternOffset + 8);
  view.setUint32(patternPointerOffset, patternOffset, true);
  return output.buffer;
};
const itInstrumentMemoryBytes = withPackedItPattern(itExport.moduleData, Uint8Array.from([
  0x81, 0x03, 48, 1, 0,
  0x81, 0x01, 49, 0,
  0x81, 0x03, 50, 0, 0,
  0x81, 0x01, 51, 0,
]), 4);
const itInstrumentMemoryRows = tracker.parseItPatternRows(itInstrumentMemoryBytes, 0, 4);
assert.equal(itInstrumentMemoryRows[1][0].instrumentPresent, false, 'a later IT note can omit the instrument column');
assert.equal(itInstrumentMemoryRows[2][0].instrumentPresent, true, 'an explicit IT instrument zero is distinct from an omitted column');
const importedItInstrumentMemory = compositionImporter.importTrackerModuleComposition(itInstrumentMemoryBytes, 'instrument-memory.it');
assert.deepEqual(importedItInstrumentMemory.patterns[0].notes.map(({ row, pitch }) => ({ row, pitch })), [
  { row: 0, pitch: 49 }, { row: 1, pitch: 50 },
], 'IT instrument memory carries the first instrument onto the second note, then treats explicit instrument zero as non-triggering');
const itInstrumentMemoryRoundTrip = exporter.exportMusicCompositionToIt(importedItInstrumentMemory).moduleData;
const itInstrumentMemoryRoundTripRows = tracker.parseItPatternRows(itInstrumentMemoryRoundTrip, 0, 4);
assert.equal(itInstrumentMemoryRoundTripRows[1][0].instrument, 1, 'the carried IT instrument is made explicit on export');
assert.equal(itInstrumentMemoryRoundTripRows[2][0].note, 0, 'an IT note with explicit instrument zero does not become audible through the fallback instrument');
assert.equal(itInstrumentMemoryRoundTripRows[3][0].note, 0, 'IT instrument zero remains active until a new instrument is selected');
const createItGlobalVolumeFixture = () => {
  const bytes = new Uint8Array(1_024);
  const view = new DataView(bytes.buffer);
  const writeText = (offset, value) => [...value].forEach((character, index) => { bytes[offset + index] = character.charCodeAt(0); });
  writeText(0, 'IMPM');
  view.setUint16(0x20, 2, true); view.setUint16(0x22, 1, true); view.setUint16(0x24, 1, true); view.setUint16(0x26, 1, true);
  view.setUint16(0x28, 0x0214, true); view.setUint16(0x2a, 0x0214, true);
  bytes[0x30] = 128; bytes[0x32] = 6; bytes[0x33] = 125; bytes[0x40] = 0;
  bytes[192] = 0; bytes[193] = 255;
  const instrumentOffset = 208; const sampleOffset = 800; const patternOffset = 880; const dataOffset = 896;
  view.setUint32(194, instrumentOffset, true); view.setUint32(198, sampleOffset, true); view.setUint32(202, patternOffset, true);
  writeText(instrumentOffset, 'IMPI'); bytes[instrumentOffset + 0x18] = 96;
  for (let noteIndex = 0; noteIndex < 120; noteIndex += 1) {
    bytes[instrumentOffset + 64 + noteIndex * 2] = noteIndex;
    bytes[instrumentOffset + 65 + noteIndex * 2] = 1;
  }
  writeText(sampleOffset, 'IMPS'); bytes[sampleOffset + 0x11] = 48; bytes[sampleOffset + 0x12] = 1; bytes[sampleOffset + 0x13] = 64;
  view.setUint32(sampleOffset + 0x30, 4, true); view.setUint32(sampleOffset + 0x3c, 8_363, true); view.setUint32(sampleOffset + 0x48, dataOffset, true);
  view.setUint16(patternOffset + 2, 1, true); bytes.set([0, 64, 127, 0x80], dataOffset);
  return bytes.buffer;
};
const itGlobalVolumeImported = compositionImporter.importTrackerModuleComposition(createItGlobalVolumeFixture(), 'global-volume.it');
const itGlobalVolumeSample = itGlobalVolumeImported.samples[0];
assert.deepEqual([itGlobalVolumeSample.maxmodSampleGlobalVolume, itGlobalVolumeSample.maxmodInstrumentGlobalVolume], [48, 96],
  'IT sample and instrument Maxmod global volumes persist independently in canonical source data');
const itGlobalVolumeRoundTrip = exporter.exportMusicCompositionToIt(itGlobalVolumeImported).moduleData;
assert.equal(tracker.parseItSamples(itGlobalVolumeRoundTrip).get(1)?.maxmodSampleGlobalVolume, 36,
  'sample-mode IT export combines source Maxmod globals without changing effective gain');
assert.ok(exporter.exportMusicCompositionToXm(itGlobalVolumeImported).warnings.some(warning => warning.includes('Maxmod sample/instrument global volume')),
  'cross-format export reports source Maxmod global-volume data it cannot preserve');
const realItBytes = fs.readFileSync(path.resolve('templateEngineGame/shooter_game/assets/musics/minor_boss_r.it'));
const realItBuffer = realItBytes.buffer.slice(realItBytes.byteOffset, realItBytes.byteOffset + realItBytes.byteLength);
const realItComposition = compositionImporter.importTrackerModuleComposition(realItBuffer, 'minor_boss_r.it');
const realItExportedSamples = tracker.parseItSamples(exporter.exportMusicCompositionToIt(realItComposition).moduleData);
const realItSourceSamples = tracker.parseItSamples(realItBuffer);
for (const [sampleIndex, sourceSample] of realItSourceSamples) {
  const exportedSample = realItExportedSamples.get(sampleIndex);
  assert.ok(exportedSample, `minor_boss_r.it sample ${sampleIndex} remains in the canonical IT export`);
  assert.equal(exportedSample.samples.length, sourceSample.samples.length, `IT sample ${sampleIndex} retains its frame count`);
  assert.deepEqual(
    [exportedSample.sampleRate, exportedSample.loopStart, exportedSample.loopEnd, exportedSample.loopType ?? 0, exportedSample.volume, exportedSample.maxmodSampleGlobalVolume],
    [sourceSample.sampleRate, sourceSample.loopStart, sourceSample.loopEnd, sourceSample.loopType ?? 0, sourceSample.volume, sourceSample.maxmodSampleGlobalVolume],
    `IT sample ${sampleIndex} retains pitch rate, loop boundaries/type, default volume, and Maxmod sample global volume`,
  );
  let maximumPcmError = 0;
  for (let frame = 0; frame < sourceSample.samples.length; frame += 1) {
    maximumPcmError = Math.max(maximumPcmError, Math.abs(exportedSample.samples[frame] - sourceSample.samples[frame]));
  }
  assert.ok(maximumPcmError <= 1 / 32768, `IT sample ${sampleIndex} PCM round-trip error ${maximumPcmError} stays within one 16-bit unit`);
}
const pianoRoll = await import(dataUrl(pianoRollSource));
const envelopeMath = await import(dataUrl(envelopeSource));
const realModuleFixtures = [
  ['cyberrid.mod', 'MOD'],
  ['stardstm.mod', 'MOD'],
  ['basic_instinct.mod', 'MOD'],
  ['fruit.mod', 'MOD'],
  ['galgox_snowheart_melody.xm', 'XM'],
  ['soda7_xcopy_ohc.s3m', 'S3M'],
];
// Compare note-authored fields. Pan effects are validated by format-specific contracts because imports also expose channel/sample pan.
const canonicalNoteEvents = document => document.patterns.flatMap((pattern, patternIndex) => pattern.notes.map(note => [
  patternIndex, note.row, document.channels.find(channel => channel.id === note.channelId)?.index,
  note.pitch, note.durationRows, document.instruments.find(instrument => instrument.id === note.instrumentId)?.index,
  note.volume,
]).sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]));
const playbackNoteTimeline = (format, moduleBuffer) => {
  const mod = format === 'MOD' ? modulePlayer.parseModModule(moduleBuffer) : null;
  const rows = format === 'MOD' && mod
    ? mod.patternTable.slice(0, mod.orders).flatMap(patternIndex => mod.patterns[patternIndex] ?? [])
    : tracker.parseTrackerPlaybackRows(moduleBuffer, format, 65_536);
  const instruments = Array.from({ length: 64 }, () => 0);
  const events = [];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    for (let channel = 0; channel < rows[rowIndex].length; channel += 1) {
      const event = rows[rowIndex][channel];
      if (!event) continue;
      if (format === 'MOD') {
        if (event.sample > 0) instruments[channel] = event.sample;
      } else if (format === 'IT') {
        if (event.instrumentPresent) instruments[channel] = event.instrument;
        else if (event.instrument > 0) instruments[channel] = event.instrument;
      } else if (event.instrument > 0) instruments[channel] = event.instrument;
      const pitch = format === 'MOD' ? event.period > 0 ? pianoRoll.trackerPeriodToPitch(event.period) : 0
        : format === 'XM' ? event.note : pianoRoll.trackerStoredNoteToPitch(format, event.note);
      const hasNote = format === 'IT' ? (event.notePresent ?? event.instrument > 0) && pitch > 0 : pitch > 0;
      if (!hasNote || instruments[channel] <= 0) continue;
      events.push([rowIndex, channel, pitch]);
    }
  }
  return { rowCount: rows.length, events };
};
const normalizeModEventTimeline = moduleBuffer => {
  const mod = modulePlayer.parseModModule(moduleBuffer);
  assert.ok(mod, 'real MOD fixture parses before its expanded event timeline is audited');
  const samplePcm = index => {
    const sample = mod.samples[index - 1];
    if (!sample?.length) return null;
    const end = Math.min(mod.bytes.length, sample.dataOffset + sample.length);
    return createHash('sha256').update(mod.bytes.subarray(sample.dataOffset, end)).digest('hex');
  };
  const selectedSamples = Array.from({ length: mod.channels }, () => 0);
  const timeline = [];
  for (let order = 0; order < mod.orders; order += 1) {
    const patternIndex = mod.patternTable[order];
    const pattern = mod.patterns[patternIndex] ?? [];
    for (let row = 0; row < 64; row += 1) {
      const notes = [];
      const effects = [];
      pattern[row].forEach((event, channel) => {
        if (event.sample > 0) selectedSamples[channel] = event.sample;
        const hasNote = event.period > 0;
        const isImplicitPan = event.effect === 14 && ((event.parameter >> 4) & 0x0f) === 8;
        if (hasNote) notes[channel] = { period: event.period, sample: samplePcm(selectedSamples[channel]) };
        if (!isImplicitPan && (event.effect !== 0 || event.parameter !== 0)) {
          const globalEffect = event.effect === 11 || event.effect === 13 || event.effect === 15;
          effects.push({ channel: globalEffect ? null : channel, effect: event.effect, parameter: event.parameter });
        }
      });
      effects.sort((left, right) => (left.channel ?? -1) - (right.channel ?? -1) || left.effect - right.effect || left.parameter - right.parameter);
      timeline.push({ order, row, notes, effects });
    }
  }
  return timeline;
};
for (const [filename, format] of realModuleFixtures) {
  const moduleBytes = fs.readFileSync(path.resolve('templateEngineGame/shooter_game/assets/musics', filename));
  const sourceBuffer = moduleBytes.buffer.slice(moduleBytes.byteOffset, moduleBytes.byteOffset + moduleBytes.byteLength);
  const sourceComposition = compositionImporter.importTrackerModuleComposition(sourceBuffer, filename);
  if (format === 'MOD') assert.ok(sourceComposition.samples.every(sample => sample.rootNote === 48), `${filename} uses MOD's canonical C-3 reference when imported`);
  const roundTripBytes = exporter.exportMusicComposition(sourceComposition, format).moduleData;
  if (format !== 'MOD') {
    const roundTripComposition = compositionImporter.importTrackerModuleComposition(roundTripBytes, `round-trip.${format.toLowerCase()}`, roundTripBytes);
    const sourceEvents = canonicalNoteEvents(sourceComposition);
    const exportedEvents = canonicalNoteEvents(roundTripComposition);
    assert.equal(exportedEvents.length, sourceEvents.length, `${filename} retains its canonical note event count`);
    assert.deepEqual(exportedEvents, sourceEvents, `${filename} retains canonical pattern, row, channel, pitch, duration, instrument and volume`);
    if (format === 'XM') {
      const envelopes = document => document.instruments.map(({ index, volumeEnvelope, panningEnvelope, fadeout }) => ({ index, volumeEnvelope, panningEnvelope, fadeout }));
      const activeEnvelopeInstruments = sourceComposition.instruments.filter(instrument => instrument.volumeEnvelope.enabled || instrument.panningEnvelope.enabled || instrument.fadeout > 0).length;
      assert.ok(activeEnvelopeInstruments > 0, `${filename} exercises at least one active envelope or fadeout`);
      assert.deepEqual(envelopes(roundTripComposition), envelopes(sourceComposition), `${filename} retains each instrument's envelope points, sustain/loop flags, and fadeout`);
      let evaluatedEnvelopePoints = 0;
      for (const instrument of sourceComposition.instruments) {
        for (const envelope of [instrument.volumeEnvelope, instrument.panningEnvelope]) {
          if (!envelope.enabled) continue;
          for (const point of envelope.points) {
            const sustainEnd = envelope.sustainEnd ?? envelope.sustain;
            const loopPointEnd = envelope.points[envelope.loopEnd]?.tick;
            if (envelope.sustainEnabled && point.tick > envelope.points[sustainEnd]?.tick) continue;
            if (!envelope.sustainEnabled && envelope.loopEnabled && loopPointEnd !== undefined && point.tick > loopPointEnd) continue;
            assert.equal(envelopeMath.trackerEnvelopeValueAt(envelope, point.tick, false), point.value,
              `${filename} instrument ${instrument.index} evaluates its imported envelope value at tick ${point.tick}`);
            evaluatedEnvelopePoints += 1;
          }
        }
      }
      assert.ok(evaluatedEnvelopePoints > 0, `${filename} evaluates active envelope nodes`);
      const realVolumeEnvelope = sourceComposition.instruments.find(instrument => instrument.index === 16)?.volumeEnvelope;
      assert.ok(realVolumeEnvelope?.enabled && !realVolumeEnvelope.sustainEnabled && !realVolumeEnvelope.loopEnabled,
        `${filename} instrument 17 is the real decaying XM envelope reference`);
      let envelopeNode = 0;
      let envelopeCount = 0;
      let maximumMasEnvelopeDifference = 0;
      for (let tick = 0; tick <= realVolumeEnvelope.points.at(-1).tick; tick += 1) {
        const node = realVolumeEnvelope.points[envelopeNode];
        const next = realVolumeEnvelope.points[envelopeNode + 1];
        const range = next ? next.tick - node.tick : 0;
        let maxmodValue = node.value * 64;
        if (envelopeCount > 0 && next) {
          const delta = Math.trunc(((next.value - node.value) * 512) / range);
          maxmodValue += (delta * envelopeCount) >> 3;
        }
        maximumMasEnvelopeDifference = Math.max(maximumMasEnvelopeDifference,
          Math.abs(envelopeMath.trackerEnvelopeValueAt(realVolumeEnvelope, tick, false) - maxmodValue / 64));
        if (!next && envelopeCount === 0) continue;
        envelopeCount += 1;
        if (envelopeCount === range) { envelopeCount = 0; envelopeNode += 1; }
      }
      assert.ok(maximumMasEnvelopeDifference <= 0.125,
        `${filename} instrument 17 volume envelope stays within 1/8 Maxmod level across integer ticks (max ${maximumMasEnvelopeDifference})`);
      console.log(`${filename} Maxmod envelope contract: instrument 17, ${realVolumeEnvelope.points.length} nodes, maximum tick-level difference ${maximumMasEnvelopeDifference.toFixed(4)}/64.`);
      console.log(`${filename} envelope round-trip: ${activeEnvelopeInstruments} active instruments, ${evaluatedEnvelopePoints} active nodes checked.`);
      const sourcePositions = [];
      const exportedPositions = [];
      tracker.parseTrackerPlaybackRows(sourceBuffer, 'XM', 65_536, position => sourcePositions.push(position));
      tracker.parseTrackerPlaybackRows(roundTripBytes, 'XM', 65_536, position => exportedPositions.push(position));
      assert.deepEqual(exportedPositions, sourcePositions, `${filename} keeps the same expanded ORDER/pattern/row traversal`);
      const flow = moduleBuffer => {
        const info = tracker.parseTrackerModule(moduleBuffer, 'XM');
        return Array.from({ length: info.patterns }, (_, patternIndex) => tracker.parseXmPatternRows(moduleBuffer, patternIndex, 256)
          .flatMap((row, rowIndex) => row.flatMap((event, channel) => event && (event.effect === 0x0b || event.effect === 0x0d || event.effect === 0x0e && (event.parameter >> 4) === 6)
            ? [{ pattern: patternIndex, row: rowIndex, channel, effect: event.effect, parameter: event.parameter }]
            : []))).flat();
      };
      assert.deepEqual(flow(roundTripBytes), flow(sourceBuffer), `${filename} retains pattern-loop, jump, and break commands that define its playback order`);
      const normalizeXmPlayback = moduleBuffer => {
        const instruments = Array.from({ length: 64 }, () => 0);
        const positions = [];
        const rows = tracker.parseTrackerPlaybackRows(moduleBuffer, 'XM', 65_536, position => positions.push({ ...position }));
        return rows.map((row, rowIndex) => ({
          ...positions[rowIndex],
          events: row.map((cell, channel) => {
            if (!cell) return null;
            if (cell.instrument > 0) instruments[channel] = cell.instrument;
            const effect = cell.effect !== 8 && (cell.effect !== 0 || cell.parameter !== 0)
              ? { effect: cell.effect, parameter: cell.parameter }
              : null;
            const note = cell.note;
            const volume = cell.volume || null;
            if (!note && !volume && !effect) return null;
            return { note, instrument: note >= 1 && note <= 96 ? instruments[channel] : null, volume, effect };
          }),
        }));
      };
      const sourceXmPlayback = normalizeXmPlayback(sourceBuffer);
      const exportedXmPlayback = normalizeXmPlayback(roundTripBytes);
      const firstXmDifference = sourceXmPlayback.findIndex((row, index) => JSON.stringify(row) !== JSON.stringify(exportedXmPlayback[index]));
      assert.equal(firstXmDifference, -1,
        `${filename} retains every expanded XM note, effective instrument, and non-pan effect. First difference: ${JSON.stringify({ source: sourceXmPlayback[firstXmDifference], exported: exportedXmPlayback[firstXmDifference] })}`);
      console.log(`${filename} expanded song round-trip: ${sourcePositions.length} ORDER/pattern/row positions preserved.`);
    }
    if (format === 'S3M') {
      const sourcePositions = [];
      const exportedPositions = [];
      const sourceRows = tracker.parseTrackerPlaybackRows(sourceBuffer, 'S3M', 65_536, position => sourcePositions.push({ ...position }));
      const exportedRows = tracker.parseTrackerPlaybackRows(roundTripBytes, 'S3M', 65_536, position => exportedPositions.push({ ...position }));
      assert.deepEqual(exportedPositions, sourcePositions,
        `${filename} preserves the expanded S3M ORDER/pattern/row traversal, including jumps, breaks, and pattern loops`);
      assert.ok(sourcePositions.length > 0, `${filename} expands to playable S3M rows`);
      const sourceS3mInfo = tracker.parseTrackerModule(sourceBuffer, 'S3M');
      const normalizePlayback = (rows, positions) => rows.map((row, rowIndex) => ({
        ...positions[rowIndex],
        events: row.map(cell => {
          if (!cell) return null;
          const note = cell.note === 0xff ? 0 : cell.note;
          const volumePresent = cell.volumePresent === true;
          const redundantInitialSpeed = positions[rowIndex].order === 0 && positions[rowIndex].row === 0
            && cell.effect === 1 && cell.parameter === sourceS3mInfo.speed;
          const channelPanInitializer = cell.effect === 19 && ((cell.parameter >> 4) & 0x0f) === 8;
          const effect = redundantInitialSpeed || channelPanInitializer || cell.effect === 0 && cell.parameter === 0
            ? null
            : { effect: cell.effect, parameter: cell.parameter };
          if (note === 0 && !volumePresent && !effect) return null;
          return { note, instrument: note ? cell.instrument : null, volumePresent, volume: volumePresent ? cell.volume : null, effect };
        }),
      }));
      const sourcePlayback = normalizePlayback(sourceRows, sourcePositions);
      const exportedPlayback = normalizePlayback(exportedRows, exportedPositions);
      const firstEventDifference = sourcePlayback.findIndex((row, index) => JSON.stringify(row) !== JSON.stringify(exportedPlayback[index]));
      assert.equal(firstEventDifference, -1,
        `${filename} preserves every expanded S3M note, instrument, volume column, and non-initializer effect. First difference: ${JSON.stringify({ source: sourcePlayback[firstEventDifference], exported: exportedPlayback[firstEventDifference] })}`);
      console.log(`${filename} deterministic song round-trip: ${sourcePositions.length} ORDER/pattern/row positions and ${sourceRows.reduce((sum, row) => sum + row.filter(Boolean).length, 0)} source row events preserved.`);
    }
  } else {
    const roundTripComposition = compositionImporter.importTrackerModuleComposition(roundTripBytes, `round-trip.${format.toLowerCase()}`, roundTripBytes);
    const normalizeModComposition = document => document.patterns.flatMap((pattern, patternIndex) => pattern.notes.map(note => {
      const instrument = document.instruments.find(item => item.id === note.instrumentId);
      const sampleId = instrument?.noteMap.find(zone => note.pitch - 1 >= zone.low && note.pitch - 1 <= zone.high)?.sampleId
        ?? instrument?.sampleIds[0];
      const sample = document.samples.find(item => item.id === sampleId);
      return [patternIndex, note.row, document.channels.find(channel => channel.id === note.channelId)?.index,
        note.pitch, note.durationRows, note.volume, sample?.pcmData ?? null];
    }).sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]));
    const sourceEvents = normalizeModComposition(sourceComposition);
    const exportedEvents = normalizeModComposition(roundTripComposition);
    assert.deepEqual(exportedEvents, sourceEvents,
      `${filename} retains each MOD note's selected sample PCM, pitch, timing and volume across instrument-slot reindexing`);
  }
  if (format === 'MOD') {
    const sourceTimeline = playbackNoteTimeline(format, sourceBuffer);
    const roundTripTimeline = playbackNoteTimeline(format, roundTripBytes);
    assert.equal(roundTripTimeline.rowCount, sourceTimeline.rowCount, `${filename} keeps its expanded playback row count through same-format import/export`);
    assert.deepEqual(roundTripTimeline.events, sourceTimeline.events, `${filename} keeps every triggered note's playback row, channel, and pitch through same-format import/export`);
    const sourceEvents = normalizeModEventTimeline(sourceBuffer);
    const exportedEvents = normalizeModEventTimeline(roundTripBytes);
    const firstEventDifference = sourceEvents.findIndex((event, index) => JSON.stringify(event) !== JSON.stringify(exportedEvents[index]));
    assert.equal(firstEventDifference, -1,
      `${filename} preserves every expanded ORDER/pattern/row MOD sample selection, note period, and non-pan effect. First difference at ${firstEventDifference}: ${JSON.stringify({ source: sourceEvents[firstEventDifference], exported: exportedEvents[firstEventDifference] })}`);
    console.log(`${filename} deterministic note round-trip: ${JSON.stringify({ rows: sourceTimeline.rowCount, triggeredNotes: sourceTimeline.events.length })}.`);
  }
}
const itOrderMemoryProject = structuredClone(modProject);
const itOrderMemoryPattern = {
  ...itOrderMemoryProject.patterns[0], id: crypto.randomUUID(), index: 1, name: 'Pattern 02',
  notes: [{ ...itOrderMemoryProject.patterns[0].notes[0], id: crypto.randomUUID(), row: 0, pitch: 50 }], commands: [],
};
itOrderMemoryProject.patterns.push(itOrderMemoryPattern);
itOrderMemoryProject.order.push({ id: crypto.randomUUID(), index: itOrderMemoryProject.order.length, patternId: itOrderMemoryPattern.id });
const itOrderMemoryExport = exporter.exportMusicCompositionToIt(itOrderMemoryProject).moduleData;
const itOrderMemoryPatternZero = withPackedItPattern(itOrderMemoryExport, Uint8Array.from([0x81, 0x03, 48, 1, 0]), 1, 0);
const itOrderMemoryBytes = withPackedItPattern(itOrderMemoryPatternZero, Uint8Array.from([
  0x81, 0x01, 49, 0,
  0x81, 0x03, 50, 0, 0,
  0x81, 0x01, 51, 0,
]), 3, 1);
const importedItOrderMemory = compositionImporter.importTrackerModuleComposition(itOrderMemoryBytes, 'order-instrument-memory.it');
assert.deepEqual(importedItOrderMemory.patterns.map(pattern => pattern.notes.map(({ row, pitch }) => ({ row, pitch }))), [
  [{ row: 0, pitch: 49 }], [{ row: 0, pitch: 50 }],
], 'IT instrument memory carries across ORDER patterns and an explicit zero clears it for later notes');
assert.deepEqual(importedItOrderMemory.order.map(entry => entry.patternId), importedItOrderMemory.patterns.map(pattern => pattern.id),
  'the contextual IT patterns remain connected to their original ORDER sequence');
const itOrderMemoryRoundTrip = exporter.exportMusicCompositionToIt(importedItOrderMemory).moduleData;
assert.equal(tracker.parseItPatternRows(itOrderMemoryRoundTrip, 1, 3)[0][0].instrument, 1,
  'IT export writes the inherited cross-pattern instrument explicitly at the dependent note');
assert.equal(tracker.parseItPatternRows(itOrderMemoryRoundTrip, 1, 3)[1][0].note, 0,
  'IT export omits notes after explicit instrument zero instead of assigning the fallback');
const longItProject = structuredClone(project);
longItProject.targetFormat = 'IT';
longItProject.patterns[0].rows = 256;
longItProject.patterns[0].notes = [{ ...note, row: 220, durationRows: 2 }];
const longItBytes = exporter.exportMusicCompositionToIt(longItProject).moduleData;
assert.equal(tracker.parseTrackerModule(longItBytes, 'IT').patterns, 1);
assert.equal(tracker.parseItPatternRows(longItBytes, 0, 256)[220][7].note, 48, 'IT exports preserve events in the final rows of a 256-row pattern');
const importedS3m = compositionImporter.importTrackerModuleComposition(s3mExport.moduleData, 'canonical.s3m');
assert.equal(importedS3m.patterns[0].notes[0].pitch, 49, 'S3M octave/semitone notes round-trip to the canonical pitch');
assert.equal(importedS3m.patterns[0].notes[0].pan, -0.5, 'S3M S8x panning round-trips at its nearest format level');
const s3mPanRoundTrip = exporter.exportMusicCompositionToS3m(importedS3m);
const s3mPanRoundTripEvent = tracker.parseS3mPatternRows(s3mPanRoundTrip.moduleData, 0, 64)[0][0];
assert.equal(s3mPanRoundTripEvent.effect, 19, 'imported S3M S8x effects retain their hexadecimal effect identifier');
assert.equal(s3mPanRoundTripEvent.parameter, 0x84, 'imported S3M S8x panning survives a canonical import/export round trip');
assert.deepEqual([...tracker.parseS3mSamples(s3mPanRoundTrip.moduleData).get(1).samples], [...s3mSamples.get(1).samples],
  'S3M signed/unsigned PCM decoding and canonical PCM16 storage preserve 8-bit source sample amplitude across import/export');
const s3mHexEffectProject = structuredClone(importedS3m);
s3mHexEffectProject.patterns[0].commands.push({ id: crypto.randomUUID(), row: 5, channelId: s3mHexEffectProject.channels[0].id, command: 'S3M:effect-10', parameter: 7 });
const s3mHexEffectRows = tracker.parseS3mPatternRows(exporter.exportMusicCompositionToS3m(s3mHexEffectProject).moduleData, 0, 64);
assert.deepEqual([s3mHexEffectRows[5][0].effect, s3mHexEffectRows[5][0].parameter], [16, 7], 'S3M canonical effect identifiers are parsed as hexadecimal');
const wideS3m = composition.createMusicCompositionDocument('32 channel target', 32, 'S3M');
wideS3m.patterns[0].notes.push({
  id: crypto.randomUUID(), row: 0, channelId: wideS3m.channels[31].id, pitch: 49,
  durationRows: 1, instrumentId: wideS3m.instruments[0].id, volume: 1, pan: 0,
});
const wideS3mBytes = exporter.exportMusicCompositionToS3m(wideS3m).moduleData;
assert.equal(tracker.parseTrackerModule(wideS3mBytes, 'S3M').channels, 32, 'S3M retains all 32 format channels');
assert.equal(tracker.parseS3mPatternRows(wideS3mBytes, 0, 64)[0][31].note, 64);
const manyInstrumentXm = structuredClone(project);
manyInstrumentXm.title = 'XM twenty-four instruments';
manyInstrumentXm.instruments = Array.from({ length: 24 }, (_, index) => ({
  ...structuredClone(project.instruments[0]),
  id: crypto.randomUUID(), index, name: `Instrument ${String(index + 1).padStart(2, '0')}`,
}));
manyInstrumentXm.patterns[0].notes = [{ ...note, instrumentId: manyInstrumentXm.instruments[23].id }];
const manyInstrumentXmBytes = exporter.exportMusicCompositionToXm(manyInstrumentXm).moduleData;
assert.equal(tracker.parseTrackerModule(manyInstrumentXmBytes, 'XM').instruments, 24, 'XM export preserves source instruments beyond the old 16-instrument cap');
assert.equal(tracker.createMusicEditorSourceDocument(manyInstrumentXmBytes, 'many-instrument.xm').instruments.length, 24, 'the exported XM can be reopened as an editable source document');
if (process.env.DEVKITPRO) {
  const mmutil = path.join(process.env.DEVKITPRO, 'tools', 'bin', process.platform === 'win32' ? 'mmutil.exe' : 'mmutil');
  assert.ok(fs.existsSync(mmutil), `Maxmod mmutil not found: ${mmutil}`);
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-canonical-s3m-'));
  try {
    const modulePath = path.join(temporaryDirectory, 'canonical.s3m');
    const romPath = path.join(temporaryDirectory, 'canonical.gba');
    const itPath = path.join(temporaryDirectory, 'canonical.it');
    const itRomPath = path.join(temporaryDirectory, 'canonical-it.gba');
    const longItPath = path.join(temporaryDirectory, 'long-pattern.it');
    const longItRomPath = path.join(temporaryDirectory, 'long-pattern.gba');
    const manyXmPath = path.join(temporaryDirectory, 'many-instrument.xm');
    const manyXmRomPath = path.join(temporaryDirectory, 'many-instrument.gba');
    fs.writeFileSync(modulePath, new Uint8Array(s3mExport.moduleData));
    const result = spawnSync(mmutil, ['-b', modulePath, `-o${romPath}`], { encoding: 'utf8', windowsHide: true });
    assert.equal(result.status, 0, `mmutil rejected the canonical S3M export:\n${result.stdout}\n${result.stderr}`);
    assert.ok(fs.existsSync(romPath) && fs.statSync(romPath).size > 0, 'mmutil should emit a ROM for the canonical S3M export');
    fs.writeFileSync(itPath, new Uint8Array(itExport.moduleData));
    const itResult = spawnSync(mmutil, ['-b', itPath, `-o${itRomPath}`], { encoding: 'utf8', windowsHide: true });
    assert.equal(itResult.status, 0, `mmutil rejected the canonical IT export:\n${itResult.stdout}\n${itResult.stderr}`);
    assert.ok(fs.existsSync(itRomPath) && fs.statSync(itRomPath).size > 0, 'mmutil should emit a ROM for the canonical IT export');
    fs.writeFileSync(longItPath, new Uint8Array(longItBytes));
    const longItResult = spawnSync(mmutil, ['-b', longItPath, `-o${longItRomPath}`], { encoding: 'utf8', windowsHide: true });
    assert.equal(longItResult.status, 0, `mmutil rejected the 256-row IT export:\n${longItResult.stdout}\n${longItResult.stderr}`);
    assert.ok(fs.existsSync(longItRomPath) && fs.statSync(longItRomPath).size > 0, 'mmutil should emit a ROM for the 256-row IT export');
    fs.writeFileSync(manyXmPath, new Uint8Array(manyInstrumentXmBytes));
    const manyXmResult = spawnSync(mmutil, ['-b', manyXmPath, `-o${manyXmRomPath}`], { encoding: 'utf8', windowsHide: true });
    assert.equal(manyXmResult.status, 0, `mmutil rejected the 24-instrument XM export:\n${manyXmResult.stdout}\n${manyXmResult.stderr}`);
    assert.ok(fs.existsSync(manyXmRomPath) && fs.statSync(manyXmRomPath).size > 0, 'mmutil should emit a ROM for the 24-instrument XM export');
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

const outOfRange = structuredClone(project);
outOfRange.patterns[0].notes[0].pitch = 97;
assert.throws(() => exporter.exportMusicCompositionToXm(outOfRange), /outside XM's 1-96 range/);
const unsupported = structuredClone(project);
unsupported.patterns[0].commands[0].command = 'MOD:effect-a';
const warnedExport = exporter.exportMusicCompositionToXm(unsupported);
assert.ok(warnedExport.warnings.some(warning => warning.includes('MOD:effect-a') && warning.includes('omitted')));

const blank = composition.createMusicCompositionDocument('Blank', 4, 'XM');
const blankExport = exporter.exportMusicCompositionToXm(blank);
assert.ok(blankExport.warnings.some(warning => warning.includes('built-in sine placeholder')));
assert.equal(tracker.parseTrackerModule(blankExport.moduleData, 'xm').channels, 4);
console.log('Canonical MOD/XM/S3M/IT exports preserve tested notes, intermediate panning, timing and PCM; Maxmod accepts generated XM, S3M and IT modules, including the 24-instrument XM target.');
