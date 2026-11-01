import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { inlineTrackerIdentity } from './helpers/tracker-module-identity.mjs';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerModule.ts'), 'utf8');
const volumeSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerS3mVolume.ts'), 'utf8');
const volumeCompiled = ts.transpileModule(volumeSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { trackerS3mVolumeForEvent } = await import(`data:text/javascript;base64,${Buffer.from(volumeCompiled).toString('base64')}`);
const templateSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/xmBeatTemplate.ts'), 'utf8');
const templateCompiled = ts.transpileModule(templateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const templateUrl = `data:text/javascript;base64,${Buffer.from(templateCompiled).toString('base64')}`;
const instrumentLibrarySource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerInstrumentLibrary.ts'), 'utf8');
const instrumentLibraryCompiled = ts.transpileModule(instrumentLibrarySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const instrumentLibraryUrl = `data:text/javascript;base64,${Buffer.from(instrumentLibraryCompiled).toString('base64')}`;
const compatibilitySource = fs.readFileSync(path.resolve('src/shared/trackerItBuildCompatibility.ts'), 'utf8');
const compatibilityCompiled = ts.transpileModule(compatibilitySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const compatibilityUrl = `data:text/javascript;base64,${Buffer.from(compatibilityCompiled).toString('base64')}`;
const compiled = inlineTrackerIdentity(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
  .replace("from './xmBeatTemplate'", `from '${templateUrl}'`)
  .replaceAll("from './trackerInstrumentLibrary'", `from '${instrumentLibraryUrl}'`)
  .replace("from '../../../../shared/trackerItBuildCompatibility'", `from '${compatibilityUrl}'`);
const { analyzeTrackerPreview, parseItPatternRows, parseItSamples, parseS3mChannelPans, parseS3mPatternRows, parseS3mSamples, parseTrackerModule, parseTrackerPlaybackRows, replaceItInstrumentPcm, replaceItSamplePcm, replaceS3mSamplePcm, updateItPatternEvent, updateItPatternEvents, updateItSample, updateS3mPatternEvent, updateS3mPatternEvents, updateS3mSample } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const estimateSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerSampleEstimate.ts'), 'utf8');
const estimateCompiled = ts.transpileModule(estimateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { estimateTrackerSampleModuleSize } = await import(`data:text/javascript;base64,${Buffer.from(estimateCompiled).toString('base64')}`);
const bytes = new Uint8Array(256);
const u16 = (offset, value) => { bytes[offset] = value & 0xff; bytes[offset + 1] = value >> 8; };
bytes.set([... 'SCRM'].map(character => character.charCodeAt(0)), 44);
u16(32, 1); u16(34, 0); u16(36, 1);
bytes[0x31] = 5; bytes[0x32] = 142;
bytes[64] = 0;
for (let index = 65; index < 96; index += 1) bytes[index] = 255;
u16(97, 8);
u16(128, 14);
bytes.set([224, 60, 1, 32, 15, 6, 0, 224, 62, 1, 28, 4, 5, 0], 130);
const rows = parseS3mPatternRows(bytes.buffer);
assert.equal(parseTrackerModule(bytes.buffer, 's3m').speed, 5);
assert.equal(parseTrackerModule(bytes.buffer, 's3m').tempo, 142);
assert.deepEqual([
  trackerS3mVolumeForEvent(22, 69, 1, 44, 64),
  trackerS3mVolumeForEvent(undefined, 74, 0, 44, 22),
  trackerS3mVolumeForEvent(undefined, 0, 1, 44, 22),
  trackerS3mVolumeForEvent(undefined, 0, 0, 44, 22),
], [22, 44, 44, 22], 'S3M note-on restores sample volume, instrument-only rows set it, and empty rows retain channel volume');
assert.equal(rows[0][0].note, 60);
assert.equal(rows[0][0].instrument, 1);
assert.equal(rows[0][0].volume, 32);
assert.equal(rows[0][0].volumePresent, true, 'S3M volume column presence is retained independently of its value');
assert.equal(rows[0][0].effect, 15);
assert.equal(rows[0][0].parameter, 6);
assert.equal(rows[1][0].note, 62);
for (const parameter of [0x01, 0x31, 0x51, 0x93]) {
  const diagnostics = analyzeTrackerPreview('MOD', [[{ note: 0, instrument: 0, volume: 0, effect: 0x0e, parameter }]], new Map(), 1);
  assert.deepEqual(diagnostics.unsupportedEffects, [], `MOD E${parameter.toString(16).toUpperCase()} is inert in the default Maxmod build or implemented in the browser preview`);
}
const unresolvedModExtended = analyzeTrackerPreview('MOD', [[{ note: 0, instrument: 0, volume: 0, effect: 0x0e, parameter: 0xa2 }]], new Map(), 1);
assert.deepEqual(unresolvedModExtended.unsupportedEffects, [0x0e], 'MOD EA2 fine volume slide remains diagnosed until the browser preview supports the mapped Maxmod S0x command');
const timingDiagnostics = analyzeTrackerPreview('S3M', [
  [{ note: 60, instrument: 1, volume: 0, effect: 1, parameter: 6 }],
  [{ note: 0, instrument: 0, volume: 0, effect: 20, parameter: 125 }],
  [{ note: 60, instrument: 1, volume: 0, effect: 15, parameter: 2 }],
], new Map([[1, { samples: new Float32Array([0, 1]), volume: 64, sampleRate: 8363, rootNote: 49, loopStart: 0, loopEnd: 0 }]]));
assert.deepEqual(timingDiagnostics.unsupportedEffects, [], 'S3M timing and sample-offset commands should be recognized');
const tremoloDiagnostics = analyzeTrackerPreview('S3M', [[{ note: 60, instrument: 1, volume: 0, effect: 13, parameter: 0x42 }]], new Map());
assert.deepEqual(tremoloDiagnostics.unsupportedEffects, []);
const tremorDiagnostics = analyzeTrackerPreview('S3M', [[{ note: 60, instrument: 1, volume: 0, effect: 9, parameter: 0x42 }]], new Map());
assert.deepEqual(tremorDiagnostics.unsupportedEffects, [9], 'Maxmod leaves S3M/IT Tremor inert, so the preview reports it');
const combinedDiagnostics = analyzeTrackerPreview('S3M', [[{ note: 60, instrument: 1, volume: 0, effect: 11, parameter: 0x42 }]], new Map());
assert.deepEqual(combinedDiagnostics.unsupportedEffects, []);
const globalVolumeDiagnostics = analyzeTrackerPreview('S3M', [[{ note: 60, instrument: 1, volume: 0, effect: 22, parameter: 48 }]], new Map());
assert.deepEqual(globalVolumeDiagnostics.unsupportedEffects, []);
const fineVibratoDiagnostics = analyzeTrackerPreview('S3M', [[{ note: 60, instrument: 1, volume: 0, effect: 21, parameter: 0x42 }]], new Map());
assert.deepEqual(fineVibratoDiagnostics.unsupportedEffects, []);
const unsupportedExtended = analyzeTrackerPreview('S3M', [[{ note: 60, instrument: 1, volume: 0, effect: 19, parameter: 0x10 }]], new Map());
assert.deepEqual(unsupportedExtended.unsupportedEffects, [19]);
const supportedExtended = analyzeTrackerPreview('S3M', [[{ note: 60, instrument: 1, volume: 0, effect: 19, parameter: 0x90 }]], new Map());
assert.deepEqual(supportedExtended.unsupportedEffects, []);
const flowS3m = new Uint8Array(224);
flowS3m.set([... 'SCRM'].map(character => character.charCodeAt(0)), 44);
flowS3m[32] = 3; flowS3m[36] = 3; flowS3m[64] = 0;
for (let index = 65; index < 96; index += 1) flowS3m[index] = 255;
flowS3m.set([0, 1, 2], 96);
const flowU16 = (offset, value) => { flowS3m[offset] = value & 0xff; flowS3m[offset + 1] = value >> 8; };
flowU16(99, 8); flowU16(101, 10); flowU16(103, 12);
flowU16(128, 4); flowS3m.set([128, 2, 1, 0], 130); // B01 to order 1.
flowU16(160, 8); flowS3m.set([32, 60, 1, 0, 128, 3, 0, 0], 162); // Note, then C00 to next order.
flowU16(192, 4); flowS3m.set([32, 64, 1, 0], 194);
const flowRows = parseTrackerPlaybackRows(flowS3m.buffer, 'S3M', 4);
assert.equal(flowRows.length, 4, 'S3M Bxx and Cxx expand only the traversed orders and rows');
assert.equal(flowRows[0][0].effect, 2);
assert.equal(flowRows[0][0].parameter, 1);
assert.equal(flowRows[1][0].note, 60, 'B01 enters the selected target order');
assert.equal(flowRows[2][0].effect, 3);
assert.equal(flowRows[3][0].note, 64, 'C00 continues at row zero in the next order');
const edited = updateS3mPatternEvent(bytes.buffer, 0, 0, 0, { note: 64, instrument: 2, effect: 3, parameter: 4 });
const editedRows = parseS3mPatternRows(edited, 0, 64);
assert.equal(editedRows[0][0].note, 64);
assert.equal(editedRows[0][0].instrument, 2);
assert.equal(editedRows[0][0].effect, 3);
assert.equal(editedRows[0][0].parameter, 4);
assert.equal(editedRows[1][0].note, 62, 'editing one S3M cell preserves the other rows');
assert.equal(bytes[97], 8, 'source pattern pointer remains unchanged');
const batchEdited = updateS3mPatternEvents(bytes.buffer, 0, [
  { row: 0, channel: 0, patch: { note: 65 } },
  { row: 1, channel: 0, patch: { note: 67 } },
]);
const batchRows = parseS3mPatternRows(batchEdited, 0, 64);
assert.equal(batchRows[0][0].note, 65);
assert.equal(batchRows[1][0].note, 67);
assert.equal(batchRows[0][0].effect, 15, 'batch edits preserve effects not included in the patch');
assert.equal(parseS3mPatternRows(bytes.buffer, 0, 64)[0][0].note, 60, 'batch edit leaves the source S3M bytes unchanged');
const volumePresenceEdited = updateS3mPatternEvents(bytes.buffer, 0, [
  { row: 2, channel: 0, patch: { note: 64, instrument: 1 } },
  { row: 3, channel: 0, patch: { note: 65, instrument: 1, volume: 0 } },
]);
const volumePresenceRows = parseS3mPatternRows(volumePresenceEdited, 0, 64);
assert.equal(volumePresenceRows[2][0].volumePresent, false, 'editing a note does not invent an omitted volume column');
assert.equal(volumePresenceRows[3][0].volumePresent, true, 'explicit volume zero is serialized as a present volume column');
assert.equal(volumePresenceRows[3][0].volume, 0);
const s3mSample = new Uint8Array(520);
s3mSample.set([... 'SCRM'].map(character => character.charCodeAt(0)), 44);
const writeS3mU16 = (offset, value) => { s3mSample[offset] = value & 0xff; s3mSample[offset + 1] = value >> 8; };
writeS3mU16(34, 1); writeS3mU16(42, 1); writeS3mU16(96, 16); s3mSample[256] = 1; s3mSample[269] = 0; s3mSample[270] = 32; s3mSample[271] = 0; s3mSample[272] = 4; s3mSample[284] = 48; s3mSample.set([1, 2, 3, 4], 512);
const panFixture = new Uint8Array(s3mSample);
panFixture[64] = 0; panFixture[65] = 8; panFixture[66] = 0x80; panFixture[67] = 0x80; panFixture[0x33] = 0x80; panFixture[0x35] = 0xfc;
panFixture[98] = 0x20; panFixture[99] = 0x2b;
assert.deepEqual(parseS3mChannelPans(panFixture.buffer).slice(0, 4), [-1, 0.375, 0, 0], 'S3M explicit pan table overrides channel defaults while disabled channels stay centered');
const defaultPanFixture = new Uint8Array(panFixture); defaultPanFixture[0x35] = 0;
assert.deepEqual(parseS3mChannelPans(defaultPanFixture.buffer).slice(0, 4), [-0.625, 0.5, 0, 0], 'S3M stereo channel defaults map to left/right and disabled channels stay centered');
const realS3m = fs.readFileSync(path.resolve('templateEngineGame/shooter_game/assets/musics/soda7_xcopy_ohc.s3m'));
assert.deepEqual(parseS3mChannelPans(realS3m.buffer.slice(realS3m.byteOffset, realS3m.byteOffset + realS3m.byteLength)).slice(0, 4), [0, 0, -0.375, 0.25], 'real S3M initial pans come from its explicit channel pan table');
assert.equal(parseS3mSamples(s3mSample.buffer).get(1)?.samples.length, 4);
assert.deepEqual([...parseS3mSamples(s3mSample.buffer).get(1).samples], [1 / 128, 2 / 128, 3 / 128, 4 / 128], 'S3M sample parapointer uses a high byte and little-endian low word');
const unsignedS3m = new Uint8Array(s3mSample);
unsignedS3m[42] = 2;
unsignedS3m.set([0, 127, 128, 255], 512);
assert.deepEqual([...parseS3mSamples(unsignedS3m.buffer).get(1).samples], [-1, -1 / 128, 0, 127 / 128], 'S3M unsigned 8-bit samples are centered around 128');
const editedS3mSample = updateS3mSample(s3mSample.buffer, 1, { volume: 24, loopStart: 1, loopEnd: 3 });
const editedS3mSamples = parseS3mSamples(editedS3mSample);
assert.equal(editedS3mSamples.get(1)?.volume, 24);
assert.equal(editedS3mSamples.get(1)?.loopStart, 1);
assert.equal(editedS3mSamples.get(1)?.loopEnd, 3);
assert.equal(s3mSample[284], 48, 'source S3M sample remains unchanged');
s3mSample[287] = 0x07;
const replacedS3mSample = replaceS3mSamplePcm(s3mSample.buffer, 0, Int8Array.from([-128, -1, 0, 127]), 'voice take');
assert.ok(replacedS3mSample, 'an existing S3M PCM sample accepts replacement audio');
assert.equal(estimateTrackerSampleModuleSize('S3M', s3mSample.byteLength, 4, 4)?.afterBytes, replacedS3mSample.byteLength, 'S3M file-size estimate matches the writer paragraph alignment and appended PCM');
const replacedS3mBytes = new Uint8Array(replacedS3mSample);
const replacedS3mParsed = parseS3mSamples(replacedS3mSample).get(1);
assert.deepEqual([...replacedS3mParsed.samples], [-1, -1 / 128, 0, 127 / 128]);
assert.equal(replacedS3mParsed.sampleRate, 8363);
assert.equal(replacedS3mParsed.loopStart, 0);
assert.equal(replacedS3mParsed.loopEnd, 0);
assert.equal(replacedS3mParsed.sixteenBit, false);
assert.equal(replacedS3mParsed.name, 'voice take');
assert.equal(replacedS3mBytes[287] & 0x07, 0, 'replacement data is one-shot, mono, 8-bit');
assert.equal(new DataView(replacedS3mSample).getUint32(256 + 0x10, true), 4, 'sample header stores the replacement frame count');
assert.equal(replacedS3mBytes[512], 1, 'the previous sample payload remains in place');
assert.deepEqual([...s3mSample.slice(512, 516)], [1, 2, 3, 4], 'replacement does not mutate source PCM');
assert.equal(replaceS3mSamplePcm(s3mSample.buffer, 1, Int8Array.from([1]), 'invalid'), null, 'replacement rejects a missing S3M sample');
const replacedUnsignedS3m = replaceS3mSamplePcm(unsignedS3m.buffer, 0, Int8Array.from([-128, 0, 127]), 'unsigned');
assert.ok(replacedUnsignedS3m);
assert.deepEqual([...parseS3mSamples(replacedUnsignedS3m).get(1).samples], [-1, 0, 127 / 128], 'replacement PCM follows the module-wide unsigned sample flag');
const wideS3m = new Uint8Array(524);
wideS3m.set([... 'SCRM'].map(character => character.charCodeAt(0)), 44);
wideS3m[34] = 1; wideS3m[96] = 16; wideS3m[256] = 1; wideS3m[270] = 32;
wideS3m[272] = 2; wideS3m[287] = 0x07;
wideS3m[276] = 0; wideS3m[280] = 2;
wideS3m.set([0, 32, 0, 64, 0, 96, 0, 127], 512);
const wideParsed = parseS3mSamples(wideS3m.buffer).get(1);
assert.equal(wideParsed?.sixteenBit, true);
assert.equal(wideParsed?.samples.length, 2);
assert.equal(wideParsed?.loopEnd, 2);
const unsignedWideS3m = new Uint8Array(wideS3m);
unsignedWideS3m[42] = 2;
unsignedWideS3m[287] = 0x05;
unsignedWideS3m.set([0, 0, 0, 128], 512);
assert.deepEqual([...parseS3mSamples(unsignedWideS3m.buffer).get(1).samples], [-1, 0], 'S3M unsigned 16-bit samples are centered around 32768');

const it = new Uint8Array(64);
it.set([... 'IMPM'].map(character => character.charCodeAt(0)), 0);
it[0x20] = 2; it[0x22] = 3; it[0x24] = 4; it[0x26] = 5;
const info = parseTrackerModule(it.buffer, 'it');
assert.equal(info.orders, 2);
assert.equal(info.instruments, 3);
assert.equal(info.patterns, 5);
const itPattern = new Uint8Array(320);
itPattern.set(it, 0);
const itPointer = 192 + 2 + 3 * 4 + 4 * 4;
itPattern[itPointer] = 0; itPattern[itPointer + 1] = 1; // pattern at 256
itPattern[256] = 16; itPattern[258] = 2;
itPattern.set([0x81, 0x0f, 60, 1, 32, 3, 4, 0, 0x81, 0x0f, 62, 1, 28, 4, 5, 0], 264);
const itEdited = updateItPatternEvent(itPattern.buffer, 0, 0, 0, { note: 64, instrument: 2, effect: 5, parameter: 6 });
const itRows = parseItPatternRows(itEdited, 0, 2);
assert.equal(itRows[0][0].note, 64);
assert.equal(itRows[0][0].instrument, 2);
assert.equal(itRows[0][0].effect, 5);
assert.equal(itRows[0][0].parameter, 6);
assert.equal(itRows[1][0].note, 62, 'editing one IT cell preserves the other rows');
assert.equal(itPattern[itPointer], 0, 'source IT pointer remains unchanged');
const reusedMaskIt = new Uint8Array(320);
reusedMaskIt.set([... 'IMPM'].map(character => character.charCodeAt(0)), 0);
reusedMaskIt[0x26] = 1;
reusedMaskIt[192] = 0; reusedMaskIt[193] = 1;
reusedMaskIt[256] = 16; reusedMaskIt[258] = 2;
reusedMaskIt.set([0x81, 0x0f, 60, 1, 32, 3, 4, 0, 0x81, 0xf0, 0], 264);
const reusedRows = parseItPatternRows(reusedMaskIt.buffer, 0, 2);
assert.deepEqual({ ...reusedRows[1][0] }, { note: 60, notePresent: true, instrument: 1, instrumentPresent: true, volume: 32, effect: 3, parameter: 4 }, 'IT reuse mask restores prior note, instrument presence, volume, and effect fields');
const batchIt = updateItPatternEvents(reusedMaskIt.buffer, 0, [{ row: 0, channel: 0, patch: { note: 64 } }]);
const batchItRows = parseItPatternRows(batchIt, 0, 2);
assert.equal(batchItRows[0][0].note, 64);
assert.equal(batchItRows[1][0].note, 60, 'IT batch re-encoding preserves reused note data in the next row');
assert.equal(batchItRows[1][0].effect, 3, 'IT batch re-encoding preserves reused effects in the next row');
const itSample = new Uint8Array(604);
itSample.set([... 'IMPM'].map(character => character.charCodeAt(0)), 0);
itSample[0x24] = 1; itSample[192] = 0; itSample[193] = 2;
itSample.set([... 'IMPS'].map(character => character.charCodeAt(0)), 512);
itSample[530] = 1; itSample[531] = 48; itSample[560] = 4; itSample[564] = 0; itSample[568] = 0; itSample[584] = 0x58; itSample[585] = 0x02; itSample.set([1, 2, 3, 4], 600);
assert.equal(parseItSamples(itSample.buffer).get(1)?.samples.length, 4);
const replacedItSamplePcm = replaceItSamplePcm(itSample.buffer, 0, Int8Array.from([-128, 0, 127]), 'sample take');
assert.ok(replacedItSamplePcm);
assert.equal(estimateTrackerSampleModuleSize('IT', itSample.byteLength, 4, 3)?.afterBytes, replacedItSamplePcm.byteLength, 'IT sample-mode estimate matches four-byte alignment and appended PCM');
const editedItSample = updateItSample(itSample.buffer, 1, { volume: 20, loopStart: 1, loopEnd: 3 });
const editedItSamples = parseItSamples(editedItSample);
assert.equal(editedItSamples.get(1)?.volume, 20);
assert.equal(editedItSamples.get(1)?.loopStart, 1);
assert.equal(editedItSamples.get(1)?.loopEnd, 3);
assert.equal(itSample[531], 48, 'source IT sample remains unchanged');
const itInstrument = new Uint8Array(1028);
itInstrument.set([... 'IMPM'].map(character => character.charCodeAt(0)), 0);
const writeItInstrumentU16 = (offset, value) => { itInstrument[offset] = value & 0xff; itInstrument[offset + 1] = value >> 8; };
const writeItInstrumentU32 = (offset, value) => { itInstrument[offset] = value & 0xff; itInstrument[offset + 1] = (value >> 8) & 0xff; itInstrument[offset + 2] = (value >> 16) & 0xff; itInstrument[offset + 3] = (value >> 24) & 0xff; };
writeItInstrumentU16(0x20, 1); writeItInstrumentU16(0x22, 1); writeItInstrumentU16(0x24, 1); writeItInstrumentU16(0x26, 1);
itInstrument[192] = 0;
writeItInstrumentU32(193, 256); writeItInstrumentU32(197, 560); writeItInstrumentU32(201, 704);
itInstrument.set([... 'IMPI'].map(character => character.charCodeAt(0)), 256);
for (let note = 0; note < 120; note += 1) { itInstrument[256 + 64 + note * 2] = note; itInstrument[256 + 65 + note * 2] = 1; }
itInstrument[256 + 64 + 60 * 2] = 62;
itInstrument.set([... 'IMPS'].map(character => character.charCodeAt(0)), 560);
itInstrument[560 + 0x11] = 64; itInstrument[560 + 0x13] = 48;
itInstrument.set(Buffer.from('old sample', 'ascii'), 560 + 0x14);
writeItInstrumentU32(560 + 0x30, 4); writeItInstrumentU32(560 + 0x3c, 8363); writeItInstrumentU32(560 + 0x48, 1024);
writeItInstrumentU16(704, 68); writeItInstrumentU16(706, 64);
itInstrument.set([0x81, 0x0f, 60, 1, 0, ...Array(63).fill(0)], 712);
itInstrument.set([1, 2, 3, 4], 1024);
const originalItPatternRows = parseItPatternRows(itInstrument.buffer, 0, 64);
const replacedItInstrument = replaceItInstrumentPcm(itInstrument.buffer, 0, Int8Array.from([-128, 0, 127]), 'voice take');
assert.ok(replacedItInstrument, 'an IT instrument with a sample map accepts replacement audio');
assert.equal(estimateTrackerSampleModuleSize('IT', itInstrument.byteLength, 4, 3, true)?.afterBytes, replacedItInstrument.byteLength, 'IT instrument-mode estimate matches the inserted pointer, sample header, and PCM');
const replacedItBytes = new Uint8Array(replacedItInstrument);
assert.equal(new DataView(replacedItInstrument).getUint16(0x24, true), 2, 'the appended sample is included in the IT sample count');
assert.deepEqual(parseItPatternRows(replacedItInstrument, 0, 64), originalItPatternRows, 'inserting a sample pointer preserves the IT pattern table and rows');
const replacedItSamples = parseItSamples(replacedItInstrument);
assert.deepEqual([...replacedItSamples.get(1).variants[0].samples], [-1, 0, 127 / 128]);
assert.equal(replacedItSamples.get(1).variants[0].name, 'voice take');
assert.equal(replacedItSamples.get(1).noteTranspose[60], 2, 'the IT instrument note transpose map is preserved');
assert.equal(replacedItBytes[260 + 65], 2, 'the selected instrument is remapped to the appended sample');
assert.equal(replacedItBytes[260 + 64 + 60 * 2], 62, 'the IT mapped note is preserved');
assert.deepEqual([...replacedItBytes.slice(1028, 1032)], [1, 2, 3, 4], 'the original sample PCM remains intact after table relocation');
assert.equal(itInstrument[256 + 65], 1, 'the source IT instrument mapping is unchanged');
assert.equal(new DataView(itInstrument.buffer).getUint16(0x24, true), 1, 'the source IT sample count is unchanged');
assert.equal(replaceItInstrumentPcm(itInstrument.buffer, 1, Int8Array.from([1]), 'invalid'), null, 'IT replacement rejects a missing instrument');
console.log('S3M/IT tracker parser native contract passed.');
