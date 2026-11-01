import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { inlineTrackerIdentity } from './helpers/tracker-module-identity.mjs';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerModule.ts'), 'utf8');
const trackerTemplateSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerModuleTemplate.ts'), 'utf8');
const templateSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/xmBeatTemplate.ts'), 'utf8');
const templateCompiled = ts.transpileModule(templateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const instrumentLibrarySource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerInstrumentLibrary.ts'), 'utf8');
const instrumentLibraryCompiled = ts.transpileModule(instrumentLibrarySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const compatibilitySource = fs.readFileSync(path.resolve('src/shared/trackerItBuildCompatibility.ts'), 'utf8');
const compatibilityCompiled = ts.transpileModule(compatibilitySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const compiled = inlineTrackerIdentity(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
  .replace("from './xmBeatTemplate';", `from 'data:text/javascript;base64,${Buffer.from(templateCompiled).toString('base64')}';`)
  .replaceAll("from './trackerInstrumentLibrary';", `from 'data:text/javascript;base64,${Buffer.from(instrumentLibraryCompiled).toString('base64')}';`)
  .replace("from '../../../../shared/trackerItBuildCompatibility';", `from 'data:text/javascript;base64,${Buffer.from(compatibilityCompiled).toString('base64')}';`);
const { analyzeTrackerPreview, appendXmPattern, applyMusicEditorSourceCommand, compileMusicEditorSourceCommand, createMusicEditorSourceDocument, getMusicModuleFingerprint, hasUniqueTrackerUuidIds, inferXmNoteLength, isMusicEditorSourceDocument, isTrackerUuid, moveXmOrder, parseItPatternRows, parseItSamples, parseS3mSamples, parseTrackerCompatibilityWarnings, parseTrackerModule, parseTrackerOrderTable, parseTrackerPlaybackRows, parseXmPatternRows, parseXmSamples, replaceXmSamplePcm, updateItPatternEvent, updateS3mPatternEvent, updateXmPatternEvent, updateXmSample } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const estimateSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerSampleEstimate.ts'), 'utf8');
const estimateCompiled = ts.transpileModule(estimateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { estimateTrackerSampleModuleSize } = await import(`data:text/javascript;base64,${Buffer.from(estimateCompiled).toString('base64')}`);
const { createXmBeatTemplate } = await import(`data:text/javascript;base64,${Buffer.from(templateCompiled).toString('base64')}`);
const trackerTemplateCompiled = ts.transpileModule(trackerTemplateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
  .replace("from './xmBeatTemplate';", `from 'data:text/javascript;base64,${Buffer.from(templateCompiled).toString('base64')}';`);
const { createTrackerModuleTemplate } = await import(`data:text/javascript;base64,${Buffer.from(trackerTemplateCompiled).toString('base64')}`);
const defaultItModuleInfo = parseTrackerModule(createTrackerModuleTemplate('IT').slice(0), 'IT');
assert.equal(defaultItModuleInfo.channels, 4, 'new IT documents start with four active channels for the default GBA build profile');
assert.equal(defaultItModuleInfo.globalVolume, 128, 'IT parser reads the 0..128 global volume from the module header');
assert.equal(defaultItModuleInfo.maxmodGlobalVolume, 128, 'IT global volume already uses Maxmod MAS 0..128 units');
const defaultS3mModuleInfo = parseTrackerModule(createTrackerModuleTemplate('S3M').slice(0), 'S3M');
assert.equal(defaultS3mModuleInfo.globalVolume, 64, 'S3M parser reads the 0..64 tracker global volume from the module header');
assert.equal(defaultS3mModuleInfo.maxmodGlobalVolume, 128, 'S3M global volume is converted to Maxmod MAS units by doubling');
assert.ok(defaultS3mModuleInfo.maxmodChannelVolumes?.every(volume => volume === 64), 'mmutil sets all S3M channel volumes to 64');
const itEnvelopeFixture = new Uint8Array(1024);
const itEnvelopeView = new DataView(itEnvelopeFixture.buffer);
const itWriteText = (offset, value) => { for (let index = 0; index < value.length; index += 1) itEnvelopeFixture[offset + index] = value.charCodeAt(index); };
itWriteText(0, 'IMPM');
itEnvelopeView.setUint16(0x20, 1, true);
itEnvelopeView.setUint16(0x22, 1, true);
itEnvelopeView.setUint16(0x24, 1, true);
itEnvelopeView.setUint16(0x2a, 0x0214, true);
itEnvelopeView.setUint16(0x2c, 0x02, true);
itEnvelopeFixture[192] = 0;
itEnvelopeView.setUint32(193, 256, true);
itEnvelopeView.setUint32(197, 832, true);
itWriteText(256, 'IMPI');
itEnvelopeFixture[256 + 0x18] = 96;
itEnvelopeFixture[0x80] = 32;
itEnvelopeFixture[0x81] = 48;
itEnvelopeFixture[0x30] = 128;
for (let note = 0; note < 120; note += 1) {
  itEnvelopeFixture[256 + 64 + note * 2] = note;
  itEnvelopeFixture[256 + 65 + note * 2] = 1;
}
itEnvelopeView.setUint16(256 + 0x14, 128, true);
const itVolumeEnvelopeOffset = 256 + 0x130;
itEnvelopeFixture[itVolumeEnvelopeOffset] = 0x05;
itEnvelopeFixture[itVolumeEnvelopeOffset + 1] = 3;
itEnvelopeFixture[itVolumeEnvelopeOffset + 4] = 1;
itEnvelopeFixture[itVolumeEnvelopeOffset + 5] = 1;
for (const [index, tick, value] of [[0, 0, 64], [1, 4, 48], [2, 8, 0]]) {
  const point = itVolumeEnvelopeOffset + 6 + index * 3;
  itEnvelopeFixture[point] = value;
  itEnvelopeView.setUint16(point + 1, tick, true);
}
const itPanningEnvelopeOffset = 256 + 0x182;
itEnvelopeFixture[itPanningEnvelopeOffset] = 1;
itEnvelopeFixture[itPanningEnvelopeOffset + 1] = 2;
for (const [index, tick, value] of [[0, 0, 0xf0], [1, 4, 0x10]]) {
  const point = itPanningEnvelopeOffset + 6 + index * 3;
  itEnvelopeFixture[point] = value;
  itEnvelopeView.setUint16(point + 1, tick, true);
}
itWriteText(832, 'IMPS');
itEnvelopeFixture[832 + 0x11] = 48;
itEnvelopeFixture[832 + 0x12] = 0x11;
itEnvelopeFixture[832 + 0x13] = 64;
itEnvelopeView.setUint32(832 + 0x30, 16, true);
itEnvelopeView.setUint32(832 + 0x34, 2, true);
itEnvelopeView.setUint32(832 + 0x38, 8, true);
itEnvelopeView.setUint32(832 + 0x3c, 8363, true);
itEnvelopeView.setUint32(832 + 0x48, 960, true);
itEnvelopeFixture.fill(0x40, 960, 976);
const parsedItEnvelope = parseItSamples(itEnvelopeFixture.buffer).get(1);
assert.deepEqual(parsedItEnvelope?.volumeEnvelope?.points, [{ tick: 0, value: 64 }, { tick: 4, value: 48 }, { tick: 8, value: 0 }], 'IT instrument volume envelope reads node values and tick ordering');
assert.equal(parsedItEnvelope?.volumeEnvelope?.enabled, true, 'IT envelope enabled flag is retained');
assert.equal(parsedItEnvelope?.volumeEnvelope?.sustainStart, 1, 'IT sustain loop start node is retained');
assert.equal(parsedItEnvelope?.volumeEnvelope?.sustainEnd, 1, 'IT sustain loop end node is retained');
assert.deepEqual(parsedItEnvelope?.panningEnvelope?.points, [{ tick: 0, value: 16 }, { tick: 4, value: 48 }], 'signed IT panning nodes map into the shared 0..64 envelope range');
assert.equal(parsedItEnvelope?.fadeout, 128, 'IT instrument fadeout rate is read from the IMPI header');
assert.equal(parsedItEnvelope?.fadeoutMaximum, 1024, 'IT instrument fadeout uses its own countdown scale');
assert.equal(parsedItEnvelope?.maxmodSampleGlobalVolume, 48, 'IT sample global volume is retained separately from its default note volume');
assert.equal(parsedItEnvelope?.maxmodInstrumentGlobalVolume, 96, 'IT instrument global volume is retained for the Maxmod MAS mixer');
assert.deepEqual([parsedItEnvelope?.loopType, parsedItEnvelope?.loopStart, parsedItEnvelope?.loopEnd], [1, 2, 8], 'IT forward-loop flags and sample-point boundaries survive parsing');
const itPingPongFixture = itEnvelopeFixture.slice();
itPingPongFixture[832 + 0x12] |= 0x40;
assert.equal(parseItSamples(itPingPongFixture.buffer).get(1)?.loopType, 2, 'IT ping-pong loops are distinguished from forward loops');
assert.deepEqual(parseTrackerModule(itEnvelopeFixture.buffer, 'IT').maxmodChannelVolumes?.slice(0, 2), [32, 48], 'IT channel-volume bytes are retained in the Maxmod 0..64 domain');
assert.equal(parseTrackerModule(itEnvelopeFixture.buffer, 'IT').maxmodGlobalVolume, 128, 'IT module global volume is read directly in MAS units');
const legacyItEnvelopeFixture = itEnvelopeFixture.slice();
new DataView(legacyItEnvelopeFixture.buffer).setUint16(0x2a, 0x0100, true);
assert.ok(parseTrackerCompatibilityWarnings(legacyItEnvelopeFixture.buffer, 'IT').includes('IT 1.xx instrument envelopes are not reproduced in the browser preview.'), 'legacy IT envelope limitations are surfaced to the user');
let s3mLoopModule = createTrackerModuleTemplate('S3M');
s3mLoopModule = updateS3mPatternEvent(s3mLoopModule, 0, 0, 0, { effect: 19, parameter: 0xb0 });
s3mLoopModule = updateS3mPatternEvent(s3mLoopModule, 0, 2, 0, { note: 0x40, instrument: 1, effect: 19, parameter: 0xb2 });
s3mLoopModule = updateS3mPatternEvent(s3mLoopModule, 0, 3, 0, { note: 0x41, instrument: 1 });
new Uint8Array(s3mLoopModule)[97] = 255;
const s3mLoopRows = parseTrackerPlaybackRows(s3mLoopModule, 'S3M', 128);
const s3mLoopPositions = [];
parseTrackerPlaybackRows(s3mLoopModule, 'S3M', 128, position => s3mLoopPositions.push(position));
assert.equal(s3mLoopRows.length, 70, 'S3M SB2 repeats the marked rows twice before continuing');
assert.deepEqual([s3mLoopRows[2]?.[0]?.note, s3mLoopRows[5]?.[0]?.note, s3mLoopRows[8]?.[0]?.note], [0x40, 0x40, 0x40], 'S3M pattern-loop note rows are repeated');
assert.equal(s3mLoopRows[9]?.[0]?.note, 0x41, 'S3M playback continues after the final loop repetition');
assert.deepEqual(s3mLoopPositions.slice(0, 10).map(({ order, pattern, row }) => [order, pattern, row]), [
  [0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 0], [0, 0, 1], [0, 0, 2], [0, 0, 3],
], 'S3M playback positions identify the exact source row through pattern-loop repetitions');
let s3mRestartModule = createTrackerModuleTemplate('S3M');
s3mRestartModule = updateS3mPatternEvent(s3mRestartModule, 0, 1, 0, { effect: 2, parameter: 0 });
new Uint8Array(s3mRestartModule)[97] = 255;
assert.equal(parseTrackerPlaybackRows(s3mRestartModule, 'S3M', 65_536).length, 2, 'S3M B00 returns one finite song cycle instead of expanding until maxRows');
let itLoopModule = createTrackerModuleTemplate('IT');
itLoopModule = updateItPatternEvent(itLoopModule, 0, 0, 0, { effect: 19, parameter: 0xb0 });
itLoopModule = updateItPatternEvent(itLoopModule, 0, 2, 0, { note: 49, instrument: 1, effect: 19, parameter: 0xb2 });
itLoopModule = updateItPatternEvent(itLoopModule, 0, 3, 0, { note: 50, instrument: 1 });
assert.deepEqual([parseItPatternRows(itLoopModule, 0, 4)[0]?.[0]?.effect, parseItPatternRows(itLoopModule, 0, 4)[2]?.[0]?.parameter], [19, 0xb2], 'IT pattern writer retains the pattern-loop controls');
const itWithEndOrder = new Uint8Array(itLoopModule.byteLength + 1);
itWithEndOrder.set(new Uint8Array(itLoopModule, 0, 193));
itWithEndOrder[32] = 2;
itWithEndOrder[33] = 0;
itWithEndOrder[193] = 255;
itWithEndOrder.set(new Uint8Array(itLoopModule, 193), 194);
new DataView(itWithEndOrder.buffer).setUint32(194, new DataView(itLoopModule).getUint32(193, true) + 1, true);
assert.deepEqual(parseTrackerOrderTable(itWithEndOrder.buffer, 'IT'), [0, 255], 'IT flow fixture contains one pattern order followed by the end marker');
assert.deepEqual([parseTrackerModule(itWithEndOrder.buffer, 'IT').orders, parseTrackerModule(itWithEndOrder.buffer, 'IT').patterns], [2, 1], 'IT header retains the shifted order count and pattern count');
assert.deepEqual([parseItPatternRows(itWithEndOrder.buffer, 0, 4)[0]?.[0]?.effect, parseItPatternRows(itWithEndOrder.buffer, 0, 4)[2]?.[0]?.parameter], [19, 0xb2], 'IT fixture retains SB0 and SB2 in its shifted pattern pointer');
const itLoopRows = parseTrackerPlaybackRows(itWithEndOrder.buffer, 'IT', 128);
assert.equal(itLoopRows.length, 70, 'IT SB2 repeats the marked rows twice before continuing');
assert.deepEqual([itLoopRows[2]?.[0]?.note, itLoopRows[5]?.[0]?.note, itLoopRows[8]?.[0]?.note], [49, 49, 49], 'IT pattern-loop note rows are repeated');
assert.equal(itLoopRows[9]?.[0]?.note, 50, 'IT playback continues after the final loop repetition');
let itExtendedCommandModule = createTrackerModuleTemplate('IT');
itExtendedCommandModule = updateItPatternEvent(itExtendedCommandModule, 0, 0, 0, { effect: 130, parameter: 0x25 });
itExtendedCommandModule = updateItPatternEvent(itExtendedCommandModule, 0, 1, 0, { effect: 31, parameter: 0x01 });
itExtendedCommandModule = updateItPatternEvent(itExtendedCommandModule, 0, 2, 0, { effect: 0x52, parameter: 0x41 });
itExtendedCommandModule = updateItPatternEvent(itExtendedCommandModule, 0, 3, 0, { effect: 0x56, parameter: 0x80 });
assert.deepEqual([parseItPatternRows(itExtendedCommandModule, 0, 4)[0]?.[0]?.effect, parseItPatternRows(itExtendedCommandModule, 0, 4)[1]?.[0]?.effect, parseItPatternRows(itExtendedCommandModule, 0, 4)[2]?.[0]?.effect, parseItPatternRows(itExtendedCommandModule, 0, 4)[3]?.[0]?.effect], [2, 0, 18, 22], 'IT edits persist canonical effect IDs and drop invalid legacy aliases');
const itPlaybackCommands = parseTrackerPlaybackRows(itExtendedCommandModule, 'IT', 4);
assert.deepEqual(itPlaybackCommands.map(row => [row[0]?.effect, row[0]?.parameter]), [[2, 0x25], [0, 0], [18, 0x41], [22, 0x80]], 'IT playback normalizes numeric command IDs and ASCII R/V aliases while ignoring 27..31');
const beatTemplate = createXmBeatTemplate();
const replacedXmSample = replaceXmSamplePcm(beatTemplate, 1, new Uint8Array(127), 'take');
assert.ok(replacedXmSample);
assert.equal(estimateTrackerSampleModuleSize('XM', beatTemplate.byteLength, parseXmSamples(beatTemplate).get(1)?.variants?.[0]?.encodedPcm?.length ?? 0, 127)?.afterBytes, replacedXmSample.byteLength, 'XM file-size estimate matches the replacement writer and old sample payload removal');
const xmRestartModule = updateXmPatternEvent(beatTemplate, 0, 1, 0, { effect: 0x0b, parameter: 0 });
assert.equal(parseTrackerPlaybackRows(xmRestartModule, 'XM', 65_536).length, 2, 'XM B00 returns one finite song cycle instead of expanding until maxRows');
const titledBeatTemplate = createXmBeatTemplate('New Beat');
assert.equal(createMusicEditorSourceDocument(titledBeatTemplate, 'new-beat.xm').format, 'XM', 'the Electron New beat title still produces a valid XM source document');
assert.equal(parseXmPatternRows(beatTemplate, 0, 64).length, 64);
assert.equal(parseXmSamples(beatTemplate).get(1)?.samples.length, 2048);
assert.equal(parseXmSamples(beatTemplate).get(1)?.rootNote, 48);
assert.deepEqual([parseXmSamples(beatTemplate).get(1)?.variants?.[0]?.maxmodSampleGlobalVolume, parseXmSamples(beatTemplate).get(1)?.maxmodInstrumentGlobalVolume], [64, 128], 'XM sample and instrument globals use the mmutil MAS defaults');
assert.deepEqual(parseTrackerOrderTable(beatTemplate, 'XM'), [0]);
assert.equal(new DataView(beatTemplate).getUint16(78, true), 125);
const envelopeFlagFixture = new Uint8Array(beatTemplate.slice(0));
const envelopeFlagView = new DataView(envelopeFlagFixture.buffer);
let envelopeInstrumentOffset = 60 + envelopeFlagView.getUint32(60, true);
for (let pattern = 0; pattern < envelopeFlagView.getUint16(70, true); pattern += 1) {
  envelopeInstrumentOffset += envelopeFlagView.getUint32(envelopeInstrumentOffset, true) + envelopeFlagView.getUint16(envelopeInstrumentOffset + 7, true);
}
envelopeFlagView.setUint16(envelopeInstrumentOffset + 225, 1, true);
envelopeFlagView.setUint16(envelopeInstrumentOffset + 226, 2, true);
envelopeFlagView.setUint16(envelopeInstrumentOffset + 129, 0, true);
envelopeFlagView.setUint16(envelopeInstrumentOffset + 131, 64, true);
envelopeFlagView.setUint16(envelopeInstrumentOffset + 177, 0, true);
envelopeFlagView.setUint16(envelopeInstrumentOffset + 179, 32, true);
envelopeFlagView.setUint16(envelopeInstrumentOffset + 181, 8, true);
envelopeFlagView.setUint16(envelopeInstrumentOffset + 183, 48, true);
envelopeFlagView.setUint8(envelopeInstrumentOffset + 233, 1);
envelopeFlagView.setUint8(envelopeInstrumentOffset + 234, 7);
envelopeFlagView.setUint16(envelopeInstrumentOffset + 239, 0x1234, true);
const flaggedInstrument = parseXmSamples(envelopeFlagFixture.buffer).get(1);
assert.equal(flaggedInstrument?.volumeEnvelope?.enabled, true, 'XM volume envelope enable comes from its own flags byte');
assert.equal(flaggedInstrument?.volumeEnvelope?.sustainEnabled, false, 'XM volume sustain is disabled unless its dedicated bit is set');
assert.equal(flaggedInstrument?.volumeEnvelope?.loopEnabled, false, 'XM volume loop is disabled unless its dedicated bit is set');
assert.equal(flaggedInstrument?.panningEnvelope?.enabled, true, 'XM panning envelope enable comes from its separate flags byte');
assert.equal(flaggedInstrument?.panningEnvelope?.sustainEnabled, true);
assert.equal(flaggedInstrument?.panningEnvelope?.loopEnabled, true);
assert.equal(flaggedInstrument?.fadeout, 0x1234, 'XM instruments expose the fadeout field for release playback');
assert.equal(flaggedInstrument?.fadeoutMaximum, 32768, 'XM fadeout uses Maxmod’s converted 1024-based countdown scale');
const realXmPath = path.resolve('templateEngineGame/sample_project_example/assets/musics/galgox_snowheart_melody.xm');
if (fs.existsSync(realXmPath)) {
  const realXm = fs.readFileSync(realXmPath);
  const realXmBuffer = realXm.buffer.slice(realXm.byteOffset, realXm.byteOffset + realXm.byteLength);
  const decayingInstrument = parseXmSamples(realXmBuffer).get(17)?.volumeEnvelope;
  assert.equal(decayingInstrument?.enabled, true);
  assert.equal(decayingInstrument?.sustainEnabled, false, 'real XM instrument 17 decays instead of sustaining at point zero');
  assert.equal(decayingInstrument?.loopEnabled, false, 'real XM instrument 17 does not loop its envelope');
}
const durationRows = Array.from({ length: 8 }, () => []);
durationRows[0][0] = { note: 48, instrument: 1, volume: 0, effect: 0, parameter: 0 };
durationRows[4][0] = { note: 97, instrument: 0, volume: 0, effect: 0, parameter: 0 };
assert.equal(inferXmNoteLength(durationRows, 0, 0, 1), 4, 'note-off row is an exclusive note end');
durationRows[4][0] = { note: 55, instrument: 1, volume: 0, effect: 0, parameter: 0 };
assert.equal(inferXmNoteLength(durationRows, 0, 0, 1), 4, 'following note ends a note when no note-off exists');
assert.equal(inferXmNoteLength(durationRows, 4, 0, 3), 3, 'fallback duration is used for an open note');
let sourceBeat = updateXmPatternEvent(beatTemplate, 0, 2, 0, { note: 48, instrument: 1, effect: 0x0f, parameter: 6 });
sourceBeat = updateXmPatternEvent(sourceBeat, 0, 6, 0, { note: 97 });
const sourceDocument = createMusicEditorSourceDocument(sourceBeat, 'beat.xm');
assert.equal(sourceDocument.schema, 'gba-studio/music-source');
assert.equal(sourceDocument.version, 1);
const sourceIds = [
  ...sourceDocument.channels.map(item => item.id),
  ...sourceDocument.instruments.map(item => item.id),
  ...sourceDocument.samples.map(item => item.id),
  ...sourceDocument.patterns.flatMap(pattern => [pattern.id, ...pattern.events.map(event => event.id), ...pattern.notes.map(note => note.id)]),
  ...sourceDocument.order.map(item => item.id),
];
assert.ok(sourceIds.every(isTrackerUuid), 'every generated Music Editor entity ID is a v4 UUID');
assert.ok(sourceIds.every((id, index) => sourceIds.indexOf(id) === index), 'generated Music Editor entity UUIDs are unique');
assert.equal(hasUniqueTrackerUuidIds([{ id: '8e2ce5df-8f38-4329-9a6d-289d4460bfa2' }]), true, 'valid UUID identities are accepted for imported sources');
assert.equal(hasUniqueTrackerUuidIds(undefined), false, 'the current package must explicitly include its imported source list');
assert.equal(hasUniqueTrackerUuidIds(null), false, 'a missing imported source list is not treated as a legacy empty list');
assert.equal(hasUniqueTrackerUuidIds([{ id: '8e2ce5df-8f38-4329-9a6d-289d4460bfa2' }, { id: '8e2ce5df-8f38-4329-9a6d-289d4460bfa2' }]), false, 'duplicate imported source UUIDs are rejected');
assert.equal(hasUniqueTrackerUuidIds([{ id: 'legacy-source-id' }]), false, 'non-UUID imported source identities are rejected');
assert.equal(hasUniqueTrackerUuidIds([{}]), false, 'imported sources without identities are rejected');
assert.ok(isMusicEditorSourceDocument(sourceDocument), 'the current source document satisfies the strict UUID schema');
assert.ok(sourceDocument.order.every(item => sourceDocument.patterns.some(pattern => pattern.id === item.patternId)), 'ORDER references patterns by UUID');
const invalidIdSource = structuredClone(sourceDocument);
invalidIdSource.channels[0].id = 'invalid-id';
assert.equal(isMusicEditorSourceDocument(invalidIdSource), false, 'source documents reject IDs outside the current UUID schema');
const duplicateIdSource = structuredClone(sourceDocument);
duplicateIdSource.channels[0].id = duplicateIdSource.instruments[0].id;
assert.equal(isMusicEditorSourceDocument(duplicateIdSource), false, 'source documents reject duplicate entity identities');
const unresolvedOrderSource = structuredClone(sourceDocument);
unresolvedOrderSource.order[0].patternId = unresolvedOrderSource.channels[0].id;
assert.equal(isMusicEditorSourceDocument(unresolvedOrderSource), false, 'ORDER references must resolve to a pattern UUID');
const invalidHistorySource = structuredClone(sourceDocument);
const invalidSnapshot = structuredClone(sourceDocument);
delete invalidSnapshot.history;
invalidSnapshot.patterns[0].notes[0].id = 'invalid-id';
invalidHistorySource.history = { undo: [invalidSnapshot], redo: [] };
assert.equal(isMusicEditorSourceDocument(invalidHistorySource), false, 'history snapshots must satisfy the same strict UUID schema');
assert.equal(sourceDocument.patterns[0].notes[0].length, 4);
assert.equal(sourceDocument.patterns[0].events.find(event => event.row === 2)?.effect, 0x0f);
assert.equal(sourceDocument.moduleFingerprint, getMusicModuleFingerprint(sourceBeat));
let movedSourceBeat = updateXmPatternEvent(sourceBeat, 0, 2, 0, { note: 0, instrument: 0 });
movedSourceBeat = updateXmPatternEvent(movedSourceBeat, 0, 6, 0, { note: 0, instrument: 0 });
movedSourceBeat = updateXmPatternEvent(movedSourceBeat, 0, 9, 0, { note: 48, instrument: 1, effect: 0x0f, parameter: 6 });
movedSourceBeat = updateXmPatternEvent(movedSourceBeat, 0, 13, 0, { note: 97 });
const movedSourceDocument = createMusicEditorSourceDocument(movedSourceBeat, 'beat.xm', sourceDocument);
assert.equal(movedSourceDocument.patterns[0].notes[0].id, sourceDocument.patterns[0].notes[0].id, 'note identity survives moving and saving a source document');
const commandDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'patch-events', patternIndex: 0, updates: [
  { row: 2, channel: 0, patch: { note: 0, instrument: 0 } },
  { row: 6, channel: 0, patch: { note: 0 } },
  { row: 9, channel: 0, patch: { note: 48, instrument: 1, effect: 0x0f, parameter: 6 } },
  { row: 13, channel: 0, patch: { note: 97, instrument: 0 } },
] }, getMusicModuleFingerprint(movedSourceBeat));
const compiledMove = compileMusicEditorSourceCommand(sourceBeat, { type: 'patch-events', patternIndex: 0, updates: [
  { row: 2, channel: 0, patch: { note: 0, instrument: 0 } },
  { row: 6, channel: 0, patch: { note: 0 } },
  { row: 9, channel: 0, patch: { note: 48, instrument: 1, effect: 0x0f, parameter: 6 } },
  { row: 13, channel: 0, patch: { note: 97, instrument: 0 } },
] });
const compiledMoveBytes = new Uint8Array(compiledMove);
const movedSourceBytes = new Uint8Array(movedSourceBeat);
assert.deepEqual(compiledMoveBytes, movedSourceBytes, 'source event commands compile to the same deterministic XM bytes');
assert.equal(commandDocument.patterns[0].notes[0].id, sourceDocument.patterns[0].notes[0].id, 'source commands preserve note identity when moving a note');
assert.equal(commandDocument.patterns[0].notes[0].row, 9);
assert.equal(commandDocument.patterns[0].notes[0].length, 4);
assert.equal(commandDocument.patterns[0].events.find(event => event.row === 2)?.effect, 0x0f, 'source commands preserve an effect column while moving a note');
assert.equal(commandDocument.moduleFingerprint, getMusicModuleFingerprint(movedSourceBeat));
const fasterDocument = applyMusicEditorSourceCommand(commandDocument, { type: 'set-tempo', tempo: 150 }, commandDocument.moduleFingerprint);
assert.equal(fasterDocument.tempo, 150);
assert.equal(new DataView(compileMusicEditorSourceCommand(sourceBeat, { type: 'set-tempo', tempo: 150 })).getUint16(78, true), 150);
const cappedTempoDocument = applyMusicEditorSourceCommand(commandDocument, { type: 'set-tempo', tempo: 999 }, commandDocument.moduleFingerprint);
assert.equal(cappedTempoDocument.tempo, 255, 'source document tempo follows the XM BPM range');
const sampleDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'patch-sample', sampleIndex: 1, patch: { volume: 32, loopStart: 12 } }, sourceDocument.moduleFingerprint);
assert.equal(sampleDocument.samples.find(sample => sample.index === 1)?.volume, 32);
assert.equal(sampleDocument.samples.find(sample => sample.index === 1)?.loopStart, 12);
const validLoopDocument = applyMusicEditorSourceCommand(sourceDocument, { type: 'patch-sample', sampleIndex: 1, patch: { loopStart: 24, loopEnd: 12 } }, sourceDocument.moduleFingerprint);
assert.equal(validLoopDocument.samples.find(sample => sample.index === 1)?.loopEnd, 24, 'sample loop end cannot precede its start');
assert.deepEqual(new Uint8Array(compileMusicEditorSourceCommand(sourceBeat, { type: 'patch-sample', sampleIndex: 1, patch: { volume: 32 } })), new Uint8Array(updateXmSample(sourceBeat, 1, { volume: 32 })), 'source sample commands use the XM sample writer');
const orderedDocument = createMusicEditorSourceDocument(appendXmPattern(beatTemplate), 'beat.xm', sourceDocument);
const reorderedDocument = applyMusicEditorSourceCommand(orderedDocument, { type: 'move-order', from: 0, to: 1 }, orderedDocument.moduleFingerprint);
assert.deepEqual(reorderedDocument.order.map(item => reorderedDocument.patterns.find(pattern => pattern.id === item.patternId)?.index), [1, 0]);
assert.ok(reorderedDocument.order.every(item => isTrackerUuid(item.id) && isTrackerUuid(item.patternId)));
assert.equal(reorderedDocument.order[1].id, orderedDocument.order[0].id, 'order identity follows an entry when the order is rearranged');
assert.deepEqual(new Uint8Array(compileMusicEditorSourceCommand(appendXmPattern(beatTemplate), { type: 'move-order', from: 0, to: 1 })), new Uint8Array(moveXmOrder(appendXmPattern(beatTemplate), 0, 1)));
const appendedSource = applyMusicEditorSourceCommand(sourceDocument, { type: 'append-pattern', sourcePattern: 0 }, sourceDocument.moduleFingerprint);
assert.equal(appendedSource.patterns.length, 2);
assert.ok(isTrackerUuid(appendedSource.patterns[1].id));
assert.ok(appendedSource.patterns[1].notes.every(note => isTrackerUuid(note.id) && note.id !== sourceDocument.patterns[0].notes[0].id), 'duplicated pattern notes receive new UUIDs');
assert.ok(appendedSource.patterns[1].events.every(event => isTrackerUuid(event.id)));
assert.ok(isTrackerUuid(appendedSource.order.at(-1).id));
assert.deepEqual(new Uint8Array(compileMusicEditorSourceCommand(sourceBeat, { type: 'append-pattern', sourcePattern: 0 })), new Uint8Array(appendXmPattern(sourceBeat, 0)), 'source pattern duplication compiles deterministically');
const secondPattern = appendXmPattern(beatTemplate);
assert.equal(parseXmPatternRows(secondPattern, 1, 64).length, 64);
assert.deepEqual(parseTrackerOrderTable(secondPattern, 'XM'), [0, 1]);
const thirdPattern = appendXmPattern(secondPattern);
assert.equal(parseTrackerPlaybackRows(thirdPattern, 'XM', 65536).length, 192, 'song preview rows should not stop at the former 128-row limit');
let patternBreakModule = updateXmPatternEvent(secondPattern, 0, 2, 0, { effect: 0x0d, parameter: 0x03 });
patternBreakModule = updateXmPatternEvent(patternBreakModule, 1, 3, 0, { note: 61, instrument: 1 });
const patternBreakRows = parseTrackerPlaybackRows(patternBreakModule, 'XM', 128);
const patternBreakPositions = [];
parseTrackerPlaybackRows(patternBreakModule, 'XM', 128, position => patternBreakPositions.push(position));
assert.equal(patternBreakRows.length, 64, 'D03 plays through its row and resumes the next order at row 3');
assert.equal(patternBreakRows[2]?.[0]?.effect, 0x0d, 'the break command remains present in the expanded playback data');
assert.equal(patternBreakRows[3]?.[0]?.note, 61, 'the next order starts from the BCD row requested by Dxx');
assert.deepEqual(patternBreakPositions[3], { order: 1, pattern: 1, row: 3 }, 'XM playback positions resume at the requested source order and row after Dxx');
assert.equal(parseTrackerPlaybackRows(patternBreakModule, 'XM', 4).length, 4, 'XM flow expansion respects the requested row bound');
let positionJumpModule = appendXmPattern(secondPattern);
positionJumpModule = updateXmPatternEvent(positionJumpModule, 0, 1, 0, { effect: 0x0b, parameter: 2 });
positionJumpModule = updateXmPatternEvent(positionJumpModule, 0, 1, 1, { effect: 0x0d, parameter: 0x03 });
positionJumpModule = updateXmPatternEvent(positionJumpModule, 2, 3, 0, { note: 62, instrument: 1 });
positionJumpModule = updateXmPatternEvent(positionJumpModule, 2, 0, 1, { note: 63, instrument: 1 });
const positionJumpRows = parseTrackerPlaybackRows(positionJumpModule, 'XM', 128);
const positionJumpPositions = [];
parseTrackerPlaybackRows(positionJumpModule, 'XM', 128, position => positionJumpPositions.push(position));
assert.equal(positionJumpRows.length, 63, 'B02/D03 jumps to order 2 at row 3');
assert.equal(positionJumpRows[2]?.[0]?.note, 62, 'the position jump bypasses order 1 and starts the target pattern at Dxx row');
assert.deepEqual(positionJumpPositions[2], { order: 2, pattern: 2, row: 3 }, 'XM playback positions skip the bypassed order and retain the target row');
const positionJumpOnly = updateXmPatternEvent(positionJumpModule, 0, 1, 1, { effect: 0, parameter: 0 });
const positionJumpOnlyRows = parseTrackerPlaybackRows(positionJumpOnly, 'XM', 128);
assert.equal(positionJumpOnlyRows.length, 66, 'B02 without Dxx starts the target order at row 0');
assert.equal(positionJumpOnlyRows[2]?.[1]?.note, 63, 'a position jump alone lands at row zero of its target pattern');
let patternLoopModule = updateXmPatternEvent(beatTemplate, 0, 1, 0, { effect: 0x0e, parameter: 0x60 });
patternLoopModule = updateXmPatternEvent(patternLoopModule, 0, 3, 0, { effect: 0x0e, parameter: 0x62 });
patternLoopModule = updateXmPatternEvent(patternLoopModule, 0, 2, 1, { note: 60, instrument: 1 });
const patternLoopRows = parseTrackerPlaybackRows(patternLoopModule, 'XM', 128);
assert.equal(patternLoopRows.length, 70, 'E62 repeats rows 1 through 3 twice before continuing');
assert.equal(patternLoopRows[1]?.[0]?.parameter, 0x60, 'the pattern-loop start command is preserved');
assert.equal(patternLoopRows[3]?.[0]?.parameter, 0x62, 'the pattern-loop count command is preserved');
assert.equal(patternLoopRows[8]?.[1]?.note, 60, 'rows inside the E62 loop are repeated in Song playback');
const patternLoopBounded = parseTrackerPlaybackRows(patternLoopModule, 'XM', 10);
assert.equal(patternLoopBounded.length, 10, 'E6x flow expansion respects maxRows');
const duplicatedPattern = appendXmPattern(beatTemplate, 0);
assert.deepEqual(parseTrackerOrderTable(duplicatedPattern, 'XM'), [0, 1]);
const notedPattern = updateXmPatternEvent(beatTemplate, 0, 4, 0, { note: 60, instrument: 1 });
const independentDuplicate = appendXmPattern(notedPattern, 0);
assert.equal(parseXmPatternRows(independentDuplicate, 1, 64)[4][0].note, 60);
const editedDuplicate = updateXmPatternEvent(independentDuplicate, 1, 4, 0, { note: 62 });
assert.equal(parseXmPatternRows(editedDuplicate, 0, 64)[4][0].note, 60, 'duplicated patterns can be edited independently');
assert.equal(parseXmPatternRows(editedDuplicate, 1, 64)[4][0].note, 62);
const movedOrder = moveXmOrder(secondPattern, 0, 1);
assert.deepEqual(parseTrackerOrderTable(movedOrder, 'XM'), [1, 0]);
assert.equal(parseXmSamples(secondPattern).get(1)?.samples.length, 2048, 'adding a pattern keeps the instrument and sample blocks valid');
const bytes = new Uint8Array(120);
const text = 'Extended Module: ';
bytes.set([...text].map(character => character.charCodeAt(0)), 0);
const u16 = (offset, value) => { bytes[offset] = value & 0xff; bytes[offset + 1] = value >> 8; };
const u32 = (offset, value) => { bytes[offset] = value & 0xff; bytes[offset + 1] = (value >> 8) & 0xff; bytes[offset + 2] = (value >> 16) & 0xff; bytes[offset + 3] = value >> 24; };
u32(60, 20);
u16(68, 2);
u16(70, 1);
u32(80, 9);
u16(85, 2);
u16(87, 20);
bytes.set([48, 2, 0x10, 0x0f, 6, 0x80, 49, 3, 0x20, 0x0e, 1, 0x80], 89);
const rows = parseXmPatternRows(bytes.buffer);
assert.equal(rows.length, 2);
assert.deepEqual(rows[0][0], { note: 48, instrument: 2, volume: 0x10, volumePresent: true, effect: 0x0f, parameter: 6 });
assert.equal(rows[0][1].note, 0);
assert.equal(rows[1][0].note, 49);
const orderBytes = new Uint8Array(100);
orderBytes.set([...text].map(character => character.charCodeAt(0)), 0);
orderBytes[64] = 2;
orderBytes[80] = 0;
orderBytes[81] = 0;
assert.deepEqual(parseTrackerOrderTable(orderBytes.buffer, 'XM'), [0, 0]);
assert.deepEqual(parseTrackerPlaybackRows(orderBytes.buffer, 'XM'), []);
const edited = updateXmPatternEvent(bytes.buffer, 0, 0, 1, { note: 60, instrument: 4, volume: 32, effect: 15, parameter: 7 });
const editedRows = parseXmPatternRows(edited, 0, 2);
assert.deepEqual(editedRows[0][1], { note: 60, instrument: 4, volume: 32, volumePresent: true, effect: 15, parameter: 7 });
assert.equal(new Uint8Array(bytes.buffer)[0], 'E'.charCodeAt(0), 'source buffer remains unchanged');
const sampleModule = new Uint8Array(200);
sampleModule.set([...text].map(character => character.charCodeAt(0)), 0);
const writeSampleU32 = (offset, value) => { sampleModule[offset] = value & 0xff; sampleModule[offset + 1] = (value >> 8) & 0xff; sampleModule[offset + 2] = (value >> 16) & 0xff; sampleModule[offset + 3] = (value >> 24) & 0xff; };
writeSampleU32(60, 20); sampleModule[72] = 1; // one instrument
writeSampleU32(80, 33); sampleModule[107] = 2; writeSampleU32(109, 40); writeSampleU32(113, 4); writeSampleU32(153, 3); sampleModule.set([1, 2, 3, 4], 193); sampleModule.set([10, 20, 30], 197);
sampleModule[125] = 48;
sampleModule[165] = 48;
const samples = parseXmSamples(sampleModule.buffer);
assert.equal(samples.get(1)?.variants?.[0]?.samples.length, 4);
assert.equal(samples.get(1)?.variants?.[1]?.samples.length, 3);
assert.ok((samples.get(1)?.variants?.[0]?.samples[3] ?? 0) > 0, 'XM delta sample decoded');
const editedSample = updateXmSample(sampleModule.buffer, 1, { volume: 32, loopStart: 1, loopEnd: 3 });
const editedSamples = parseXmSamples(editedSample);
assert.equal(editedSamples.get(1)?.variants?.[0]?.volume, 32);
assert.equal(editedSamples.get(1)?.variants?.[0]?.loopStart, 1);
assert.equal(editedSamples.get(1)?.variants?.[0]?.loopEnd, 3);
const replacementPcm = new Uint8Array([5, 6, 7, 8, 9]);
const replaceVariant = compileMusicEditorSourceCommand(sampleModule.buffer, {
  type: 'replace-sample', sampleIndex: 1, sampleId: 'zone-2',
  sample: { id: 'zone-2', index: 1, variantIndex: 1, name: 'zone two', sampleRate: 8363, length: replacementPcm.length, loopStart: 1, loopEnd: 4, rootNote: 50, volume: 32, encodedPcm: Buffer.from(replacementPcm).toString('base64'), sixteenBit: false, panning: 200 },
});
const replacedVariants = parseXmSamples(replaceVariant).get(1)?.variants;
assert.equal(replacedVariants?.[0]?.samples.length, 4, 'editing a note zone preserves adjacent sample PCM');
assert.equal(replacedVariants?.[1]?.samples.length, replacementPcm.length, 'source command replaces the selected XM zone');
assert.deepEqual([replacedVariants?.[1]?.loopStart, replacedVariants?.[1]?.loopEnd, replacedVariants?.[1]?.volume, replacedVariants?.[1]?.panning], [1, 4, 32, 200], 'selected XM zone metadata remains attached to its replacement PCM');
assert.equal(sampleModule[125], 48, 'source XM sample remains unchanged');
const diagnostics = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x0f, parameter: 1 }]], editedSamples);
assert.deepEqual(diagnostics.unsupportedEffects, []);
assert.equal(diagnostics.warnings.length, 0);
assert.equal(analyzeTrackerPreview('XM', [[]], editedSamples, 16).warnings.length, 0, 'the default Butano music-channel limit is inclusive');
assert.match(analyzeTrackerPreview('XM', [[]], editedSamples, 17).warnings[0], /17 channels.*build profile supports 16 active music channels.*increase the project's music-channel limit/, 'modules above the default GBA mix profile are called out');
const supportedXmTremor = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x14, parameter: 0x21 }]], editedSamples);
assert.deepEqual(supportedXmTremor.unsupportedEffects, [], 'XM Txy follows the Maxmod legacy tremor schedule');
assert.equal(supportedXmTremor.warnings.length, 0);
const unsupportedExtended = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x0e, parameter: 0x01 }]], editedSamples);
assert.deepEqual(unsupportedExtended.unsupportedEffects, [], 'XM E0x has no audio effect in the default Maxmod build');
const supportedInvertLoopNoop = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x0e, parameter: 0xf1 }]], editedSamples);
assert.deepEqual(supportedInvertLoopNoop.unsupportedEffects, [], 'XM EFx is an audio no-op in the default Maxmod build');
const supportedExtended = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x0e, parameter: 0x90 }]], editedSamples);
assert.deepEqual(supportedExtended.unsupportedEffects, []);
const supportedVibratoSquareWave = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, effect: 0x0e, parameter: 0x43 }]], editedSamples);
assert.deepEqual(supportedVibratoSquareWave.unsupportedEffects, [], 'XM E43 selects the square vibrato waveform');
const supportedVibratoNoFlagBit = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, effect: 0x0e, parameter: 0x48 }]], editedSamples);
assert.deepEqual(supportedVibratoNoFlagBit.unsupportedEffects, [], 'XM E48 uses the waveform low bits without enabling no-retrigger');
const unsupportedVibratoControlFlag = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, effect: 0x0e, parameter: 0x44 }]], editedSamples);
assert.deepEqual(unsupportedVibratoControlFlag.unsupportedEffects, [], 'XM E44 is supported when no-retrigger phase persistence is implemented');
assert.deepEqual(analyzeTrackerPreview('XM', [[{ note: 49, instrument: 1, effect: 0x0e, parameter: 0x7c }]], new Map(), 1).unsupportedEffects, [], 'XM E7C is supported when no-retrigger phase persistence is implemented');
const supportedFineVolumeDown = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x0e, parameter: 0xa2 }]], editedSamples);
assert.deepEqual(supportedFineVolumeDown.unsupportedEffects, []);
const supportedFineVolumeUp = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x0e, parameter: 0xb2 }]], editedSamples);
assert.deepEqual(supportedFineVolumeUp.unsupportedEffects, []);
const supportedFinePortaDown = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x0e, parameter: 0x12 }]], editedSamples);
assert.deepEqual(supportedFinePortaDown.unsupportedEffects, []);
const supportedFinePortaUp = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x0e, parameter: 0x22 }]], editedSamples);
assert.deepEqual(supportedFinePortaUp.unsupportedEffects, []);
const supportedFineTune = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x0e, parameter: 0x5f }]], editedSamples);
const supportedPatternDelay = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x0e, parameter: 0xe2 }]], editedSamples);
assert.deepEqual(supportedPatternDelay.unsupportedEffects, [], 'XM EEx is covered as a pattern delay effect');
const supportedPatternLoop = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x0e, parameter: 0x62 }]], editedSamples);
assert.deepEqual(supportedPatternLoop.unsupportedEffects, [], 'XM E6x is covered as a pattern loop effect');
const supportedExtendedPanning = analyzeTrackerPreview('XM', [[{ note: 0, instrument: 0, volume: 0, effect: 0x0e, parameter: 0x8f }]], editedSamples);
assert.deepEqual(supportedExtendedPanning.unsupportedEffects, [], 'XM E8x is covered as persistent channel panning');
const supportedGlissando = analyzeTrackerPreview('XM', [[{ note: 0, instrument: 0, volume: 0, effect: 0x0e, parameter: 0x31 }]], editedSamples);
assert.deepEqual(supportedGlissando.unsupportedEffects, [], 'XM E3x is covered as glissando control');
assert.deepEqual(supportedFineTune.unsupportedEffects, []);
const supportedCombinedVibratoVolumeSlide = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0, effect: 0x06, parameter: 0x0f }]], editedSamples);
assert.deepEqual(supportedCombinedVibratoVolumeSlide.unsupportedEffects, [], 'XM Kxy is covered as a vibrato-memory plus volume-slide effect');
const supportedPanningSlide = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0x20, effect: 0x19, parameter: 0x0f }]], editedSamples);
assert.deepEqual(supportedPanningSlide.unsupportedEffects, [], 'XM Pxy is covered as a panning slide effect');
const supportedTonePortamento = analyzeTrackerPreview('XM', [[{ note: 49, instrument: 1, volume: 0, effect: 0x03, parameter: 0x20 }]], editedSamples);
assert.deepEqual(supportedTonePortamento.unsupportedEffects, [], 'XM 3xx is covered as tone portamento');
const supportedGlobalVolume = analyzeTrackerPreview('XM', [[{ note: 49, instrument: 1, volume: 0, effect: 0x10, parameter: 0x20 }]], editedSamples);
assert.deepEqual(supportedGlobalVolume.unsupportedEffects, [], 'XM Gxx is covered as global volume');
const supportedGlobalVolumeSlide = analyzeTrackerPreview('XM', [[{ note: 0, instrument: 0, volume: 0, effect: 0x11, parameter: 0x0f }]], editedSamples);
assert.deepEqual(supportedGlobalVolumeSlide.unsupportedEffects, [], 'XM Hxy is covered as global volume slide');
const supportedPositionJump = analyzeTrackerPreview('XM', [[{ note: 0, instrument: 0, volume: 0, effect: 0x0b, parameter: 1 }]], editedSamples);
assert.deepEqual(supportedPositionJump.unsupportedEffects, [], 'XM Bxx is covered by order expansion');
const supportedPatternBreak = analyzeTrackerPreview('XM', [[{ note: 0, instrument: 0, volume: 0, effect: 0x0d, parameter: 0x23 }]], editedSamples);
assert.deepEqual(supportedPatternBreak.unsupportedEffects, [], 'XM Dxx is covered by order expansion');
const supportedS3mTonePortamento = analyzeTrackerPreview('S3M', [[{ note: 0x40, instrument: 1, volume: 0, effect: 0x07, parameter: 0x20 }]], editedSamples);
assert.deepEqual(supportedS3mTonePortamento.unsupportedEffects, [], 'S3M Gxx is covered as tone portamento');
const supportedS3mChannelVolume = analyzeTrackerPreview('S3M', [[{ note: 0, instrument: 0, volume: 0, effect: 0x0d, parameter: 0x20 }]], editedSamples);
assert.deepEqual(supportedS3mChannelVolume.unsupportedEffects, [], 'S3M Mxx is covered as channel volume');
const supportedS3mTremolo = analyzeTrackerPreview('S3M', [[{ note: 0x40, instrument: 1, volume: 0, effect: 0x12, parameter: 0x42 }]], editedSamples);
assert.deepEqual(supportedS3mTremolo.unsupportedEffects, [], 'S3M Rxy is covered as tremolo');
const supportedS3mExtendedPanning = analyzeTrackerPreview('S3M', [[{ note: 0, instrument: 0, volume: 0, effect: 19, parameter: 0x8f }]], editedSamples);
assert.deepEqual(supportedS3mExtendedPanning.unsupportedEffects, [], 'S3M S8x is covered as persistent channel panning');
const supportedS3mPatternDelay = analyzeTrackerPreview('S3M', [[{ note: 0x40, instrument: 1, volume: 0, effect: 19, parameter: 0xe2 }]], editedSamples);
assert.deepEqual(supportedS3mPatternDelay.unsupportedEffects, [], 'S3M SEx is covered as pattern delay');
const supportedItPatternDelay = analyzeTrackerPreview('IT', [[{ note: 49, instrument: 1, volume: 0, effect: 19, parameter: 0xe2 }]], editedSamples);
assert.deepEqual(supportedItPatternDelay.unsupportedEffects, [], 'IT SEx is covered as pattern delay');
const supportedItChannelVolumeSlide = analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, volume: 0, effect: 14, parameter: 0x40 }]], editedSamples);
assert.deepEqual(supportedItChannelVolumeSlide.unsupportedEffects, [], 'IT Nxy is covered as channel volume slide');
const supportedItFinePatternDelay = analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, volume: 0, effect: 19, parameter: 0x62 }]], editedSamples);
assert.deepEqual(supportedItFinePatternDelay.unsupportedEffects, [19], 'IT S6x is warned because the default Maxmod GBA core does not extend rows for fpattdelay');
const itFinePatternDelayModule = updateItPatternEvent(createTrackerModuleTemplate('IT'), 0, 0, 0, { effect: 19, parameter: 0x62 });
assert.ok(parseTrackerCompatibilityWarnings(itFinePatternDelayModule, 'IT').includes('The default GBA build core ignores these IT effects: S6x.'), 'the editor warns that IT S6x does not extend rows in the default GBA build core');
const supportedS3mGlobalVolumeSlide = analyzeTrackerPreview('S3M', [[{ note: 0, instrument: 0, volume: 0, effect: 23, parameter: 0x10 }]], editedSamples);
assert.deepEqual(supportedS3mGlobalVolumeSlide.unsupportedEffects, [], 'S3M Wxy is covered as global volume slide');
const supportedItGlobalVolumeSlide = analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, volume: 0, effect: 23, parameter: 0x10 }]], editedSamples);
assert.deepEqual(supportedItGlobalVolumeSlide.unsupportedEffects, [], 'IT Wxy is covered as global volume slide');
const supportedItTonePortamentoVolumeSlide = analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, volume: 0, effect: 12, parameter: 0x40 }]], editedSamples);
assert.deepEqual(supportedItTonePortamentoVolumeSlide.unsupportedEffects, [], 'IT Lxy is covered as tone portamento plus note volume slide');
assert.deepEqual(analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, volume: 0, effect: 16, parameter: 0x10 }]], editedSamples).unsupportedEffects, [16], 'IT Pxy is not implemented by the preview');
assert.deepEqual(analyzeTrackerPreview('S3M', [[{ note: 0, instrument: 0, volume: 0, effect: 16, parameter: 0x10 }]], editedSamples).unsupportedEffects, [16], 'S3M pan slide is not implemented by the preview');
const itPanbrelloDiagnostics = analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, volume: 0, effect: 25, parameter: 0x82 }]], editedSamples);
assert.deepEqual(itPanbrelloDiagnostics.unsupportedEffects, [25], 'IT Yxy panbrello is reported because the target player does not render it');
let itPanningSlideModule = createTrackerModuleTemplate('IT');
itPanningSlideModule = updateItPatternEvent(itPanningSlideModule, 0, 0, 0, { effect: 16, parameter: 0x10 });
assert.ok(parseTrackerCompatibilityWarnings(itPanningSlideModule, 'IT').includes('The default GBA build core ignores these IT effects: Pxy.'), 'the user is warned that IT Pxy is a no-op in the target GBA core');
let itPanbrelloModule = createTrackerModuleTemplate('IT');
itPanbrelloModule = updateItPatternEvent(itPanbrelloModule, 0, 0, 0, { effect: 25, parameter: 0x82 });
assert.ok(parseTrackerCompatibilityWarnings(itPanbrelloModule, 'IT').includes('The default GBA build core ignores these IT effects: Yxy.'), 'the user is told that IT Yxy is also ignored by the target player');
const itMidiMacroDiagnostics = analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, volume: 0, effect: 26, parameter: 0x82 }]], editedSamples);
let itMidiMacroModule = createTrackerModuleTemplate('IT');
itMidiMacroModule = updateItPatternEvent(itMidiMacroModule, 0, 0, 0, { effect: 26, parameter: 0x82 });
assert.ok(parseTrackerCompatibilityWarnings(itMidiMacroModule, 'IT').includes('The default GBA build core ignores these IT effects: Zxx.'), 'the user is told that IT Zxx is ignored by the target player');
const itPanbrelloWaveformDiagnostics = analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, volume: 0, effect: 19, parameter: 0x50 }]], editedSamples);
assert.deepEqual(itPanbrelloWaveformDiagnostics.unsupportedEffects, [19], 'IT S5x is reported because its panbrello waveform has no target effect');
let itPanbrelloWaveformModule = createTrackerModuleTemplate('IT');
itPanbrelloWaveformModule = updateItPatternEvent(itPanbrelloWaveformModule, 0, 0, 0, { effect: 19, parameter: 0x50 });
assert.ok(parseTrackerCompatibilityWarnings(itPanbrelloWaveformModule, 'IT').includes('The default GBA build core ignores these IT effects: S5x.'), 'the user is told that IT S5x is also ignored by the target player');
const itHighOffsetDiagnostics = analyzeTrackerPreview('IT', [[{ note: 49, instrument: 1, volume: 0, effect: 19, parameter: 0xa1 }]], editedSamples);
assert.deepEqual(itHighOffsetDiagnostics.unsupportedEffects, [19], 'IT SAx remains visibly unsupported because the checked-in Maxmod GBA core leaves its high-offset handler unimplemented');
let itHighOffsetModule = createTrackerModuleTemplate('IT');
itHighOffsetModule = updateItPatternEvent(itHighOffsetModule, 0, 0, 0, { effect: 19, parameter: 0xa1 });
assert.ok(parseTrackerCompatibilityWarnings(itHighOffsetModule, 'IT').includes('The default GBA build core ignores these IT effects: SAx.'), 'the editor warns when IT SAx has no effect in the target build');
const itSongMessageDiagnostics = analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, volume: 0, effect: 19, parameter: 0xf1 }]], editedSamples);
assert.deepEqual(itSongMessageDiagnostics.unsupportedEffects, [], 'IT SFx is audio-compatible because Maxmod only emits a song-message callback');
const supportedS3mPatternLoop = analyzeTrackerPreview('S3M', [[{ note: 0, instrument: 0, volume: 0, effect: 19, parameter: 0xb2 }]], editedSamples);
assert.deepEqual(supportedS3mPatternLoop.unsupportedEffects, [], 'S3M SBx is covered by order expansion');
const supportedItPatternLoop = analyzeTrackerPreview('IT', [[{ note: 0, instrument: 0, volume: 0, effect: 19, parameter: 0xb2 }]], editedSamples);
assert.deepEqual(supportedItPatternLoop.unsupportedEffects, [], 'IT SBx is covered by order expansion');
const supportedS3mTonePortaVolumeSlide = analyzeTrackerPreview('S3M', [[{ note: 0x50, instrument: 1, volume: 0, effect: 0x0c, parameter: 0x04 }]], editedSamples);
assert.deepEqual(supportedS3mTonePortaVolumeSlide.unsupportedEffects, [], 'S3M Lxy is supported as tone portamento plus volume slide');
const supportedModVibratoVolumeSlide = analyzeTrackerPreview('MOD', [[{ note: 1, instrument: 1, volume: 0, effect: 0x06, parameter: 1 }]], new Map());
assert.deepEqual(supportedModVibratoVolumeSlide.unsupportedEffects, []);
const modDiagnostics = analyzeTrackerPreview('MOD', [[{ note: 1, instrument: 1, volume: 0, effect: 0x0e, parameter: 0xf1 }]], new Map());
assert.deepEqual(modDiagnostics.unsupportedEffects, [0x0e]);
assert.equal(modDiagnostics.warnings.some(warning => warning.includes('No decoded PCM')), false);
const supportedModSampleOffset = analyzeTrackerPreview('MOD', [[{ note: 49, instrument: 1, volume: 0, effect: 0x09, parameter: 0x01 }]], new Map());
assert.deepEqual(supportedModSampleOffset.unsupportedEffects, [], 'MOD 9xx sample offset is rendered by the structural preview');
const supportedModFinePortamento = analyzeTrackerPreview('MOD', [[{ note: 49, instrument: 1, volume: 0, effect: 0x0e, parameter: 0x12 }]], new Map());
assert.deepEqual(supportedModFinePortamento.unsupportedEffects, [], 'MOD E1x/E2x fine portamento is rendered by the structural preview');
const pcmFixture = { samples: new Float32Array([0.25]), sampleRate: 8363, loopStart: 0, loopEnd: 0, rootNote: 48, sixteenBit: false };
const pcmInstrumentRows = [
  [
    { note: 48, instrument: 1, volume: 0, effect: 0, parameter: 0 },
    { note: 52, instrument: 2, volume: 0, effect: 0, parameter: 0 },
  ],
  [
    { note: 50, instrument: 0, volume: 0, effect: 0, parameter: 0 },
    { note: 55, instrument: 0, volume: 0, effect: 0, parameter: 0 },
  ],
];
const completePcmDiagnostics = analyzeTrackerPreview('S3M', pcmInstrumentRows, new Map([[1, pcmFixture], [2, { ...pcmFixture, variants: [{ ...pcmFixture, samples: new Float32Array([0.1, -0.1]) }] }]]));
assert.equal(completePcmDiagnostics.warnings.some(warning => warning.includes('decoded PCM')), false, 'repeated notes using two decoded instruments do not produce a false missing-sample warning');
const partialPcmDiagnostics = analyzeTrackerPreview('S3M', pcmInstrumentRows, new Map([[1, pcmFixture]]));
assert.equal(partialPcmDiagnostics.warnings.includes('Some instrument/sample references have no decoded PCM data and use oscillator fallback.'), true, 'missing PCM for one active instrument reports a partial fallback');
const noPcmDiagnostics = analyzeTrackerPreview('XM', [[{ note: 48, instrument: 1, volume: 0, effect: 0, parameter: 0 }]], new Map());
assert.equal(noPcmDiagnostics.warnings.includes('No decoded PCM samples were found; notes use oscillator fallback.'), true, 'missing PCM for every active instrument reports a complete fallback');
const ignoredModExtended = analyzeTrackerPreview('MOD', [[{ note: 1, instrument: 1, volume: 0, effect: 0x0e, parameter: 0x01 }]], new Map());
assert.deepEqual(ignoredModExtended.unsupportedEffects, [], 'E0x is inert in both preview and Maxmod, so it is not reported as a mismatch');
const unsupportedModExtended = analyzeTrackerPreview('MOD', [[{ note: 1, instrument: 1, volume: 0, effect: 0x0e, parameter: 0x41 }]], new Map());
assert.deepEqual(unsupportedModExtended.unsupportedEffects, [0x0e]);
if (process.argv.includes('--audit-real-tracker-effects')) {
  const musicDirectory = path.resolve('templateEngineGame/shooter_game/assets/musics');
  for (const [filename, format, parseSamples] of [
    ['soda7_xcopy_ohc.s3m', 'S3M', parseS3mSamples],
    ['minor_boss_r.it', 'IT', parseItSamples],
  ]) {
    const file = fs.readFileSync(path.join(musicDirectory, filename));
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const rows = parseTrackerPlaybackRows(buffer, format, 65_536);
    const effects = new Map();
    const channelAudit = Array.from({ length: format === 'S3M' ? parseTrackerModule(buffer, format).channels : 0 }, () => ({ notes: 0, explicitVolumeNotes: 0, sampleOnlySelections: 0, effects: new Map(), dxyParameters: new Map() }));
    const extendedCommands = new Map();
    const extendedParameters = new Map();
    const nonStandardEffects = [];
    const effect12Events = [];
    const effect25Events = [];
    const effect26Events = [];
    rows.forEach((row, rowIndex) => row.forEach((event, channel) => {
      if (!event) return;
      if (format === 'S3M' && channelAudit[channel] && event.note > 0 && event.note < 0xf0) {
        channelAudit[channel].notes += 1;
        if (event.volumePresent && event.volume <= 64) channelAudit[channel].explicitVolumeNotes += 1;
      }
      if (format === 'S3M' && channelAudit[channel] && event.instrument > 0 && !(event.note > 0 && event.note < 0xf0)) channelAudit[channel].sampleOnlySelections += 1;
      if (!event.effect && !event.parameter) return;
      const effect = event.effect & 0xff;
      effects.set(effect, (effects.get(effect) ?? 0) + 1);
      if (format === 'S3M' && channelAudit[channel]) {
        if (effect || event.parameter) channelAudit[channel].effects.set(effect, (channelAudit[channel].effects.get(effect) ?? 0) + 1);
        if (effect === 4) channelAudit[channel].dxyParameters.set(event.parameter, (channelAudit[channel].dxyParameters.get(event.parameter) ?? 0) + 1);
      }
      if (format === 'IT' && effect === 12 && effect12Events.length < 32) effect12Events.push({ row: rowIndex, channel, note: event.note, instrument: event.instrument, volume: event.volume, parameter: event.parameter });
      if (format === 'IT' && effect === 25 && effect25Events.length < 32) effect25Events.push({ row: rowIndex, channel, note: event.note, instrument: event.instrument, volume: event.volume, parameter: event.parameter });
      if (format === 'IT' && effect === 26 && effect26Events.length < 32) effect26Events.push({ row: rowIndex, channel, note: event.note, instrument: event.instrument, volume: event.volume, parameter: event.parameter });
      if (effect > 26 && nonStandardEffects.length < 24) nonStandardEffects.push({ row: rowIndex, channel, note: event.note, instrument: event.instrument, volume: event.volume, effect, parameter: event.parameter });
      if (effect === 19) {
        const command = (event.parameter >> 4) & 0x0f;
        extendedCommands.set(command, (extendedCommands.get(command) ?? 0) + 1);
        const key = `${command.toString(16).toUpperCase()}${(event.parameter & 0x0f).toString(16).toUpperCase()}`;
        extendedParameters.set(key, (extendedParameters.get(key) ?? 0) + 1);
      }
    }));
    const samples = parseSamples(buffer);
    const diagnostics = analyzeTrackerPreview(format, rows, samples);
    const instrumentEnvelopes = format === 'IT' ? [...samples.entries()]
      .filter(([, instrument]) => instrument.volumeEnvelope?.enabled || instrument.panningEnvelope?.enabled)
      .map(([index, instrument]) => ({ index, volumeEnvelopePoints: instrument.volumeEnvelope?.points.length ?? 0, panningEnvelopePoints: instrument.panningEnvelope?.points.length ?? 0, fadeout: instrument.fadeout })) : [];
    console.log(`${format} ${filename} real-effect audit: ${JSON.stringify({ rows: rows.length, effects: [...effects].sort((a, b) => a[0] - b[0]), instrumentEnvelopes, channelAudit: channelAudit.map(channel => ({ notes: channel.notes, explicitVolumeNotes: channel.explicitVolumeNotes, sampleOnlySelections: channel.sampleOnlySelections, effects: [...channel.effects].sort((a, b) => a[0] - b[0]), dxyParameters: [...channel.dxyParameters].sort((a, b) => a[0] - b[0]) })), extendedCommands: [...extendedCommands].sort((a, b) => a[0] - b[0]), extendedParameters: [...extendedParameters].sort((a, b) => a[0].localeCompare(b[0])), unsupportedEffects: diagnostics.unsupportedEffects, nonStandardEffects, effect12Events, effect25Events, effect26Events })}.`);
  }
}
console.log('XM tracker parser native contract passed.');
