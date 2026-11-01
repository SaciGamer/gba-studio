import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { inlineTrackerIdentity } from './helpers/tracker-module-identity.mjs';

const devkitPro = process.env.DEVKITPRO;
assert.ok(devkitPro, 'DEVKITPRO must point to devkitPro');
const executable = path.join(devkitPro, 'tools', 'bin', process.platform === 'win32' ? 'mmutil.exe' : 'mmutil');
assert.ok(fs.existsSync(executable), `Maxmod mmutil not found: ${executable}`);
const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/xmBeatTemplate.ts'), 'utf8');
const compiled = inlineTrackerIdentity(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText);
const { createXmBeatTemplate } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const parserSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerModule.ts'), 'utf8');
const compatibilitySource = fs.readFileSync(path.resolve('src/shared/trackerItBuildCompatibility.ts'), 'utf8');
const compatibilityCompiled = ts.transpileModule(compatibilitySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const instrumentLibrarySource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerInstrumentLibrary.ts'), 'utf8');
const instrumentLibraryCompiled = ts.transpileModule(instrumentLibrarySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const parserCompiled = inlineTrackerIdentity(ts.transpileModule(parserSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
  .replace("from './xmBeatTemplate';", `from 'data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}';`)
  .replace("from '../../../../shared/trackerItBuildCompatibility';", `from 'data:text/javascript;base64,${Buffer.from(compatibilityCompiled).toString('base64')}';`)
  .replaceAll("from './trackerInstrumentLibrary';", `from 'data:text/javascript;base64,${Buffer.from(instrumentLibraryCompiled).toString('base64')}';`);
const { applyMusicEditorSourceCommand, compileMusicEditorSourceCommand, compileMusicEditorSourceDocument, createMusicEditorSourceDocument, createMusicEditorSourceSnapshot, getMusicModuleFingerprint, isMusicEditorSourceDocument, parseItPatternRows, parseItSamples, parseTrackerModule, parseTrackerPlaybackRows, parseXmPatternRows, parseXmSamples, parseTrackerOrderTable, restoreMusicEditorModuleSnapshot, updateItPatternEvent, updateXmSample } = await import(`data:text/javascript;base64,${Buffer.from(parserCompiled).toString('base64')}`);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-xm-maxmod-'));
try {
  const xmPath = path.join(tempDir, 'new-beat.xm');
  const romPath = path.join(tempDir, 'new-beat.gba');
  const importedXmPath = path.join(tempDir, 'imported-edited.xm');
  const importedRomPath = path.join(tempDir, 'imported-edited.gba');
  const extendedXmPath = path.join(tempDir, 'extended-beat.xm');
  const extendedRomPath = path.join(tempDir, 'extended-beat.gba');
  const importedItPath = path.join(tempDir, 'imported-edited.it');
  const importedItRomPath = path.join(tempDir, 'imported-edited-it.gba');
  let sourceDocument = { ...createMusicEditorSourceDocument(createXmBeatTemplate(), 'new-beat.xm'), origin: 'scratch' };
  const customPcm = new Uint8Array(512);
  for (let index = 0; index < customPcm.length; index += 2) customPcm[index] = index % 7;
  sourceDocument.samples[0] = {
    ...sourceDocument.samples[0],
    length: customPcm.length / 2,
    loopStart: 20,
    loopEnd: 240,
    rootNote: 54,
    volume: 51,
    encodedPcm: Buffer.from(customPcm).toString('base64'),
    sixteenBit: true,
    loopType: 1,
    fineTune: -22,
    panning: 68,
  };
  sourceDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'append-instrument', name: 'Snare' }, sourceDocument.moduleFingerprint);
  sourceDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'replace-sample', sampleIndex: 2, sample: {
    ...sourceDocument.samples[1], name: 'Snare', length: 128, loopStart: 0, loopEnd: 0,
    encodedPcm: Buffer.from(new Uint8Array(128).fill(3)).toString('base64'),
  } }, sourceDocument.moduleFingerprint);
  const variantPcm = new Uint8Array(128).fill(3);
  sourceDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'append-sample-variant', instrumentIndex: 2, noteLow: 49, noteHigh: 96, sample: {
    name: 'Snare High', sampleRate: 8363, length: variantPcm.length, loopStart: 0, loopEnd: 0, rootNote: 48, volume: 64,
    encodedPcm: Buffer.from(variantPcm).toString('base64'), sixteenBit: false, loopType: 0, fineTune: 0, panning: 128,
  } }, sourceDocument.moduleFingerprint);
  const zoneInstrument = sourceDocument.instruments.find(instrument => instrument.index === 2);
  assert.equal(zoneInstrument?.noteMap?.[47], 0, 'the base sample remains mapped below the new zone');
  assert.equal(zoneInstrument?.noteMap?.[48], 1, 'the appended sample becomes active at the zone start');
  assert.equal(zoneInstrument?.noteMap?.[95], 1, 'the appended sample stays active through the zone end');
  const compositionMappedVariantSource = {
    ...sourceDocument,
    instruments: sourceDocument.instruments.map(instrument => instrument.index === 2
      ? { ...instrument, noteMap: Array.from({ length: 96 }, (_, note) => note >= 48 ? 1 : 0) }
      : instrument),
    samples: sourceDocument.samples.map(sample => {
      const { noteLow, noteHigh, ...payload } = sample;
      return payload;
    }),
  };
  const compositionMappedVariant = parseXmSamples(compileMusicEditorSourceDocument(compositionMappedVariantSource)).get(2);
  assert.equal(compositionMappedVariant?.noteMap[48], 1, 'the explicit canonical note map should compile variant zones without redundant per-sample note ranges');
  assert.equal(compositionMappedVariant?.noteMap[47], 0, 'notes outside the canonical variant zone should stay mapped to the base sample');
  sourceDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'patch-sample', sampleIndex: 2, patch: { rootNote: 52, fineTune: -10, panning: 180 } }, sourceDocument.moduleFingerprint);
  sourceDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'patch-events', patternIndex: 0, updates: [
    { row: 0, channel: 0, patch: { note: 49, instrument: 1, volume: 0x50 } },
    { row: 4, channel: 2, patch: { effect: 0x0e, parameter: 0x09 } },
    { row: 8, channel: 0, patch: { note: 97 } },
  ] }, sourceDocument.moduleFingerprint);
  sourceDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'append-pattern', sourcePattern: 0 }, sourceDocument.moduleFingerprint);
  sourceDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'patch-events', patternIndex: 1, updates: [
    { row: 0, channel: 1, patch: { note: 53, instrument: 2, volume: 0x40 } },
    { row: 12, channel: 1, patch: { note: 97 } },
  ] }, sourceDocument.moduleFingerprint);
  sourceDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'move-order', from: 0, to: 1 }, sourceDocument.moduleFingerprint);
  const unnamedMusic = compileMusicEditorSourceDocument(sourceDocument);
  sourceDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'set-pattern-name', patternIndex: 1, name: 'Intro' }, sourceDocument.moduleFingerprint);
  assert.equal(sourceDocument.patterns[1].name, 'Intro', 'pattern names should be stored in the source document');
  const namedMusic = compileMusicEditorSourceDocument(sourceDocument);
  assert.deepEqual(new Uint8Array(namedMusic), new Uint8Array(unnamedMusic), 'pattern names should not alter XM playback bytes');
  sourceDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'set-pattern-rows', patternIndex: 1, rows: 32 }, sourceDocument.moduleFingerprint);
  assert.equal(sourceDocument.patterns[1].rows, 32, 'the source model should retain a resized pattern extent');
  const rejectedTruncation = applyMusicEditorSourceCommand(sourceDocument, { type: 'set-pattern-rows', patternIndex: 1, rows: 8 }, sourceDocument.moduleFingerprint);
  assert.equal(rejectedTruncation.patterns[1].rows, 32, 'the source model should reject shortening across existing events');
  const music = compileMusicEditorSourceDocument(sourceDocument);
  assert.equal(parseXmPatternRows(music, 0, 256).length, 64, 'resizing one pattern should not change other pattern lengths');
  assert.equal(parseXmPatternRows(music, 1, 256).length, 32, 'the XM writer should encode the selected pattern row count');
  assert.equal(parseXmPatternRows(music, 1, 256)[12][1].note, 97, 'resizing should preserve events within the new extent');
  sourceDocument = { ...sourceDocument, moduleFingerprint: getMusicModuleFingerprint(music) };
  const namedSourceReload = createMusicEditorSourceDocument(music, 'new-beat.xm', sourceDocument);
  assert.equal(namedSourceReload.patterns[1].name, 'Intro', 'pattern names should survive source reconstruction when the module fingerprint is unchanged');
  assert.equal(namedSourceReload.patterns[1].rows, 32, 'pattern extent should survive source reconstruction when the module fingerprint is unchanged');
  assert.equal(parseXmSamples(music).size, 2, 'scratch compilation should include both instrument samples');
  const snare = parseXmSamples(music).get(2);
  assert.equal(snare.variants.length, 2, 'one instrument should retain both note-zone samples');
  assert.equal(snare.variants[0].loopType, 0, 'a sample with an empty loop must compile as non-looping XM PCM');
  assert.deepEqual({ rootNote: snare.rootNote, fineTune: snare.fineTune, panning: snare.panning }, { rootNote: 52, fineTune: -10, panning: 180 }, 'sample pitch tuning and pan should survive XM compilation');
  assert.equal(snare.noteMap[47], 0, 'notes below the configured zone should use the primary sample');
  assert.equal(snare.noteMap[48], 1, 'notes in the configured zone should use the added sample');
  assert.deepEqual(snare.variants[1].encodedPcm, variantPcm, 'the note-zone sample PCM should survive XM compilation');
  const importedSource = createMusicEditorSourceDocument(music, 'imported-variants.xm');
  assert.equal(importedSource.origin, 'imported');
  assert.equal(isMusicEditorSourceDocument(importedSource), true);
  let importedEdit = compileMusicEditorSourceCommand(music, { type: 'patch-events', patternIndex: 0, updates: [
    { row: 0, channel: 0, patch: { note: 50 } },
  ] });
  importedEdit = compileMusicEditorSourceCommand(importedEdit, { type: 'patch-sample', sampleIndex: 1, patch: { volume: 45, loopStart: 24, loopEnd: 224, rootNote: 56, fineTune: 12, panning: 200 } });
  importedEdit = compileMusicEditorSourceCommand(importedEdit, { type: 'set-pattern-rows', patternIndex: 1, rows: 48 });
  importedEdit = compileMusicEditorSourceCommand(importedEdit, { type: 'set-tempo', tempo: 126 });
  importedEdit = compileMusicEditorSourceCommand(importedEdit, { type: 'set-speed', speed: 5 });
  importedEdit = compileMusicEditorSourceCommand(importedEdit, { type: 'move-order', from: 0, to: 1 });
  const importedEditedRows = parseXmPatternRows(importedEdit, 0, 64);
  assert.equal(importedEditedRows[0][0].note, 50, 'editing an imported note should update the targeted XM event');
  assert.deepEqual(importedEditedRows[4][2], { note: 0, instrument: 0, volume: 0, volumePresent: false, effect: 0x0e, parameter: 0x09 }, 'editing an imported event should preserve other effect data in the same pattern');
  assert.equal(parseXmPatternRows(importedEdit, 1, 64).length, 48, 'an imported pattern should accept a row-count edit');
  assert.deepEqual(parseXmPatternRows(importedEdit, 1, 48)[0][1], parseXmPatternRows(music, 1, 32)[0][1], 'editing another imported pattern property should preserve its note events');
  const importedEditedSample = parseXmSamples(importedEdit).get(1);
  assert.deepEqual(importedEditedSample.encodedPcm, parseXmSamples(music).get(1).encodedPcm, 'editing imported sample metadata should preserve its original PCM payload');
  assert.deepEqual({ volume: importedEditedSample.volume, loopStart: importedEditedSample.loopStart, loopEnd: importedEditedSample.loopEnd, rootNote: importedEditedSample.rootNote, fineTune: importedEditedSample.fineTune, panning: importedEditedSample.panning }, { volume: 45, loopStart: 24, loopEnd: 224, rootNote: 56, fineTune: 12, panning: 200 }, 'sample edits should land in the imported XM header');
  assert.deepEqual(parseTrackerOrderTable(importedEdit, 'XM'), [0, 1], 'moving an imported ORDER entry should only change the order table');
  assert.deepEqual({ tempo: parseTrackerModule(importedEdit, 'xm').tempo, speed: parseTrackerModule(importedEdit, 'xm').speed }, { tempo: 126, speed: 5 }, 'BPM and speed edits should be preserved in imported XM');
  const importedEditSource = createMusicEditorSourceDocument(importedEdit, 'imported-edited.xm', {
    ...importedSource,
    moduleFingerprint: getMusicModuleFingerprint(importedEdit),
  });
  const importedSavedSidecar = JSON.parse(JSON.stringify(importedEditSource));
  assert.equal(isMusicEditorSourceDocument(importedSavedSidecar), true, 'the edited imported sidecar should survive JSON serialization');
  const importedReopenedSource = createMusicEditorSourceDocument(importedEdit, 'imported-edited.xm', importedSavedSidecar);
  assert.deepEqual(importedReopenedSource.patterns[0].events, importedEditSource.patterns[0].events, 'imported event edits should survive sidecar reconstruction after reopening');
  assert.deepEqual(importedReopenedSource.order, importedEditSource.order, 'imported ORDER edits should survive sidecar reconstruction after reopening');
  assert.equal(importedReopenedSource.patterns[1].rows, 48, 'imported pattern extents should survive sidecar reconstruction after reopening');
  assert.equal(importedReopenedSource.moduleFingerprint, getMusicModuleFingerprint(importedEdit), 'the reopened imported sidecar should match the edited binary fingerprint');
  fs.writeFileSync(importedXmPath, new Uint8Array(importedEdit));
  assert.deepEqual(fs.readFileSync(importedXmPath), Buffer.from(importedEdit), 'an imported copy should remain byte-stable through the save/reopen payload');
  const importedResult = spawnSync(executable, ['-b', importedXmPath, `-o${importedRomPath}`], { encoding: 'utf8', windowsHide: true });
  assert.equal(importedResult.status, 0, `Maxmod should accept the edited imported XM:\n${importedResult.stdout}\n${importedResult.stderr}`);
  assert.ok(fs.existsSync(importedRomPath) && fs.statSync(importedRomPath).size > 0, 'Maxmod should emit a ROM for the edited imported XM');
  assert.deepEqual(importedSource.samples.map(sample => [sample.index, sample.variantIndex]), [[1, 0], [2, 0], [2, 1]], 'the imported source document should retain every sample variant');
  assert.equal(importedSource.instruments[1].noteMap[48], 1, 'the imported source document should retain the exact per-note sample map');
  assert.equal(Buffer.from(importedSource.samples[2].encodedPcm, 'base64').length, variantPcm.length, 'imported sidecar should retain variant PCM bytes');
  const importedSnapshot = createMusicEditorSourceSnapshot(importedSource, music);
  const importedWithHistory = { ...importedSource, history: { undo: [importedSnapshot], redo: [] } };
  assert.equal(isMusicEditorSourceDocument(importedWithHistory), true, 'imported sidecars should accept persisted module snapshots');
  assert.deepEqual(new Uint8Array(restoreMusicEditorModuleSnapshot(importedSnapshot)), new Uint8Array(music), 'imported history should restore its exact XM bytes');
  const reloadedImportedSource = createMusicEditorSourceDocument(music, 'imported-variants.xm', importedSource);
  assert.deepEqual(reloadedImportedSource.samples, importedSource.samples, 'imported source reconstruction should preserve all variant payloads');
  assert.deepEqual(reloadedImportedSource.instruments[1].noteMap, importedSource.instruments[1].noteMap, 'imported source reconstruction should preserve sample maps');
  const compiledSample = parseXmSamples(music).get(1);
  assert.deepEqual(compiledSample.encodedPcm, customPcm, 'scratch compilation should preserve source PCM payload bytes');
  assert.deepEqual({ length: compiledSample.samples.length, loopStart: compiledSample.loopStart, loopEnd: compiledSample.loopEnd, rootNote: compiledSample.rootNote, volume: compiledSample.volume, loopType: compiledSample.loopType, fineTune: compiledSample.fineTune, panning: compiledSample.panning }, {
    length: 256, loopStart: 20, loopEnd: 240, rootNote: 54, volume: 51, loopType: 1, fineTune: -22, panning: 68,
  });
  const loopedSample = parseXmSamples(updateXmSample(createXmBeatTemplate(), 1, { loopStart: 4, loopEnd: 100 })).get(1);
  assert.equal(loopedSample.loopType, 1, 'editing a valid loop range should enable forward looping');
  const stoppedLoop = parseXmSamples(updateXmSample(createXmBeatTemplate(), 1, { loopStart: 0, loopEnd: 0 })).get(1);
  assert.equal(stoppedLoop.loopType, 0, 'an empty loop range should disable looping');
  assert.equal(parseXmPatternRows(music, 0, 64)[0][0].note, 49);
  assert.equal(parseXmPatternRows(music, 0, 64)[8][0].note, 97);
  assert.equal(parseXmPatternRows(music, 1, 64)[0][1].note, 53);
  assert.equal(parseXmPatternRows(music, 1, 64)[0][1].instrument, 2);
  assert.deepEqual(parseTrackerOrderTable(music, 'XM'), [1, 0]);
  fs.writeFileSync(xmPath, new Uint8Array(music));
  const result = spawnSync(executable, ['-b', xmPath, `-o${romPath}`], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `mmutil rejected generated XM:\n${result.stdout}\n${result.stderr}`);
  assert.ok(fs.existsSync(romPath), 'Maxmod should produce a GBA test ROM');
  assert.ok(fs.statSync(romPath).size > 0, 'generated GBA ROM should not be empty');
  const extendedSource = applyMusicEditorSourceCommand(sourceDocument, { type: 'set-pattern-rows', patternIndex: 1, rows: 256 }, sourceDocument.moduleFingerprint);
  const extendedMusic = compileMusicEditorSourceDocument(extendedSource);
  assert.equal(parseXmPatternRows(extendedMusic, 1, 256).length, 256, 'the writer should support the maximum XM pattern length');
  fs.writeFileSync(extendedXmPath, new Uint8Array(extendedMusic));
  const extendedResult = spawnSync(executable, ['-b', extendedXmPath, `-o${extendedRomPath}`], { encoding: 'utf8', windowsHide: true });
  assert.equal(extendedResult.status, 0, `mmutil rejected a 256-row XM pattern:\n${extendedResult.stdout}\n${extendedResult.stderr}`);
  assert.ok(fs.existsSync(extendedRomPath) && fs.statSync(extendedRomPath).size > 0, 'Maxmod should emit a test ROM for a 256-row pattern');
  const importedItSource = fs.readFileSync(path.resolve('templateEngineGame/shooter_game/assets/musics/minor_boss_r.it'));
  const importedItBuffer = importedItSource.buffer.slice(importedItSource.byteOffset, importedItSource.byteOffset + importedItSource.byteLength);
  const importedItInfo = parseTrackerModule(importedItBuffer, 'IT');
  assert.equal(importedItInfo.instruments, 0, 'the real IT fixture exercises sample mode');
  const importedItRows = parseItPatternRows(importedItBuffer, 0, 64);
  const firstItEvent = importedItRows.flatMap((row, rowIndex) => row.map((event, channelIndex) => ({ event, rowIndex, channelIndex })))
    .find(({ event }) => event.note > 0 && event.note < 254 && event.instrument > 0 && parseItSamples(importedItBuffer).get(event.instrument)?.samples.length);
  assert.ok(firstItEvent, 'the real IT fixture should contain a note pointing to a decoded sample');
  const firstItSampleBefore = parseItSamples(importedItBuffer).get(firstItEvent.event.instrument);
  const editedIt = updateItPatternEvent(importedItBuffer, 0, firstItEvent.rowIndex, firstItEvent.channelIndex, { note: firstItEvent.event.note + 1 });
  const editedItRows = parseItPatternRows(editedIt, 0, 64);
  assert.equal(editedItRows[firstItEvent.rowIndex][firstItEvent.channelIndex].note, firstItEvent.event.note + 1, 'the IT writer should apply the note edit');
  assert.deepEqual(parseItSamples(editedIt).get(firstItEvent.event.instrument).samples, firstItSampleBefore.samples, 'IT pattern edits should preserve sample PCM byte-for-byte after decoding');
  assert.ok(parseTrackerPlaybackRows(editedIt, 'IT', 2048).length > 0, 'edited sample-mode IT should retain playable ORDER rows');
  fs.writeFileSync(importedItPath, new Uint8Array(editedIt));
  const importedItResult = spawnSync(executable, ['-b', importedItPath, `-o${importedItRomPath}`], { encoding: 'utf8', windowsHide: true });
  assert.equal(importedItResult.status, 0, `mmutil rejected a note-edited sample-mode IT:\n${importedItResult.stdout}\n${importedItResult.stderr}`);
  assert.ok(fs.existsSync(importedItRomPath) && fs.statSync(importedItRomPath).size > 0, 'Maxmod should emit a ROM for the edited sample-mode IT');
  console.log(`Edited real sample-mode IT accepted by Maxmod (${firstItEvent.event.instrument} -> note ${firstItEvent.event.note + 1}); decoded PCM unchanged at ${firstItSampleBefore.samples.length} frames.`);
  console.log(`Generated XM accepted by Maxmod ${result.stdout.match(/Maxmod Utility [^\r\n]+/)?.[0] ?? 'mmutil'} and emitted a GBA ROM.`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
