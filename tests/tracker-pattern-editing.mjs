import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

async function load(filename) {
  const result = await build({ entryPoints: [path.resolve(filename)], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const root = 'src/renderer/frontend/src/';
const [composition, editing, exporter, tracker, capabilities, modPlayer, importer] = await Promise.all([
  'utils/trackerComposition.ts', 'utils/trackerPatternEditing.ts', 'utils/trackerCompositionExport.ts',
  'utils/trackerModule.ts', 'components/resourceEditors/musicEditorCapabilities.ts', 'utils/modPlayer.ts', 'utils/trackerCompositionImport.ts',
].map(file => load(root + file)));
const source = fs.readFileSync(root + 'components/resourceEditors/TrackerModuleViewer.tsx', 'utf8');
const ast = ts.createSourceFile('viewer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = new Map();
function visit(node) {
  if (ts.isVariableDeclaration(node) && ['appendPattern', 'reorderXmOrder', 'commitCanonicalRollEdits', 'restoreSampleHistory'].includes(node.name.getText(ast))) {
    handlers.set(node.name.getText(ast), node.initializer.getText(ast));
  }
  ts.forEachChild(node, visit);
}
visit(ast);
let fixtureId = 0;
const uuid = () => `7d8ccad0-e11a-42dd-9999-${String(++fixtureId).padStart(12, '0')}`;

for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  let project = composition.createMusicCompositionForTarget(format, 'Imported editing');
  const sampleSnapshot = JSON.stringify(project.samples);
  const firstId = project.patterns[0].id;
  const channelId = project.channels[0].id;
  const jump = format === 'MOD' || format === 'XM' ? 'b' : '2';
  const breakCode = format === 'MOD' || format === 'XM' ? 'd' : '3';
  project.patterns[0].commands.push(
    { id: uuid(), row: 0, channelId, command: `${format}:effect-${jump}`, parameter: 1 },
    { id: uuid(), row: 1, channelId, command: `${format}:effect-${breakCode}`, parameter: 12 },
  );
  const snapshot = JSON.stringify(project);
  const duplicate = editing.appendMusicPattern(project, 0);
  assert.equal(JSON.stringify(project), snapshot, 'append is immutable');
  assert.equal(duplicate.patterns.length, 2);
  assert.notEqual(duplicate.patterns[0].id, duplicate.patterns[1].id);
  assert.notEqual(duplicate.patterns[0].commands[0].id, duplicate.patterns[1].commands[0].id);
  assert.equal(duplicate.patterns[1].commands[1].parameter, 12);
  project = editing.appendMusicPattern(duplicate);
  // Repeated references to the deleted pattern must all disappear.
  project.order.push({ id: uuid(), index: 3, patternId: firstId });
  const reordered = editing.moveMusicOrder(project, 1, 2);
  assert.equal(reordered.patterns[0].commands[0].parameter, 2, 'jump follows moved order');
  assert.equal(reordered.patterns[0].commands[1].parameter, 12, 'pattern break row stays intact');
  const deleted = editing.deleteMusicPattern(reordered, 0);
  assert.equal(deleted.patterns.length, 2);
  assert.equal(deleted.order.length, 2);
  assert.ok(deleted.order.every(entry => entry.patternId !== firstId));
  assert.equal(deleted.patterns[0].commands[0].parameter, 1);
  assert.equal(JSON.stringify(deleted.samples), sampleSnapshot, 'pattern operations preserve samples');
  const bytes = exporter.exportMusicComposition(deleted, format).moduleData;
  const info = tracker.parseTrackerModule(bytes, format.toLowerCase());
  assert.equal(info.patterns, 2, `${format} exports the edited patterns`);
  const single = editing.deleteMusicPattern(deleted, 1);
  assert.equal(editing.deleteMusicPattern(single, 0), single, 'retain one pattern');
  const allReferences = { ...deleted, order: deleted.order.map(entry => ({ ...entry, patternId: deleted.patterns[0].id })) };
  const fallback = editing.deleteMusicPattern(allReferences, 0);
  assert.equal(fallback.order.length, 1);
  assert.equal(fallback.order[0].patternId, fallback.patterns[0].id);
  const resized = editing.resizeMusicPattern(deleted, 0, 32);
  assert.equal(resized.patterns[0].rows, ['MOD', 'S3M'].includes(format) ? 64 : 32);
  const caps = capabilities.getMusicEditorFormatCapabilities(format, true);
  assert.ok(caps.patternOrder && caps.patternName && caps.createInstrument && caps.noteVolume && caps.tempo);
  assert.equal(caps.patternLength, ['XM', 'IT'].includes(format));
  assert.equal(caps.maxInstruments, format === 'MOD' ? 31 : format === 'S3M' ? 99 : 128);
  const [patternLimit] = editing.trackerPatternLimits[format];
  const full = { ...project, patterns: Array.from({ length: patternLimit }, () => project.patterns[0]) };
  assert.equal(editing.appendMusicPattern(full), full, 'respect native pattern limit');

  // Exercise the actual viewer callbacks, module materialization and history.
  const history = [];
  const ctx = { ...composition, ...editing, ...exporter, ...tracker, ...modPlayer,
    projectPackage: true, musicComposition: { current: project }, info: { format },
    moduleBytes: exporter.exportMusicComposition(project, format).moduleData,
    mod: null, selectedPattern: 0, selectedOrder: 0, musicSource: null, filename: 'imported',
    compositionHistory: { current: new WeakMap() }, sampleHistory: { current: new WeakMap() },
    canonicalAuthoringPendingRef: { current: false }, instrumentsAllowed: () => true,
    musicWorkspace: { selectEditorItem() {} }, message: { error(value) { throw new Error(value); } },
    setModuleBytes(value) { ctx.moduleBytes = value; }, setMod(value) { ctx.mod = value; },
    setInfo(value) { ctx.info = value; }, setSelectedPattern(value) { ctx.selectedPattern = value; },
    setSelectedOrder(value) { ctx.selectedOrder = value; }, setTrackerSamples() {}, markCurrentTrackDirty() {},
    setMusicSource() {}, setXmSourceRedo() {}, setXmSourceUndo() {},
    setModUndo(update) { history.splice(0, history.length, ...update(history)); }, setModRedo() {},
    setXmUndo(update) { history.splice(0, history.length, ...update(history)); }, setXmRedo() {},
    setItUndo(update) { history.splice(0, history.length, ...update(history)); }, setItRedo() {},
    s3mUndo: { current: [] }, s3mRedo: { current: [] },
  };
  if (format === 'MOD') ctx.mod = modPlayer.parseModModule(ctx.moduleBytes);
  vm.createContext(ctx);
  for (const [name, code] of handlers) vm.runInContext(ts.transpile(`var ${name} = ${code}`, { target: ts.ScriptTarget.ES2022 }), ctx);
  const original = ctx.musicComposition.current;
  ctx.appendPattern();
  assert.equal(ctx.musicComposition.current.patterns.length, original.patterns.length + 1);
  assert.equal(ctx.info.patterns, ctx.musicComposition.current.patterns.length);
  const previousKey = format === 'S3M' ? ctx.s3mUndo.current.at(-1) : history.at(-1);
  assert.ok(previousKey, `${format} pattern creation records undo`);
  ctx.restoreSampleHistory(format === 'MOD' ? ctx.mod : ctx.moduleBytes, previousKey);
  assert.equal(ctx.musicComposition.current, original, `${format} undo restores canonical structure`);
}
for (const file of ['cyberrid.mod', 'galgox_snowheart_melody.xm', 'soda7_xcopy_ohc.s3m', 'minor_boss_r.it']) {
  const bytes = fs.readFileSync(path.resolve('templateEngineGame/shooter_game/assets/musics', file));
  const original = importer.importTrackerModuleComposition(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), file);
  const samples = JSON.stringify(original.samples);
  const added = editing.appendMusicPattern(original, 0);
  assert.equal(added.patterns.length, original.patterns.length + 1, file);
  assert.deepEqual(added.patterns.at(-1).notes.map(({ id, ...note }) => note), original.patterns[0].notes.map(({ id, ...note }) => note));
  const exported = exporter.exportMusicComposition(added, original.targetFormat).moduleData;
  assert.equal(tracker.parseTrackerModule(exported, original.targetFormat).patterns, added.patterns.length, file);
  const restored = editing.deleteMusicPattern(added, added.patterns.length - 1);
  assert.deepEqual(restored.patterns, original.patterns);
  assert.deepEqual(restored.order, original.order);
  assert.equal(JSON.stringify(restored.samples), samples, `${file} preserves imported PCM and sample metadata`);
}
console.log('Pattern editing: MOD/XM/S3M/IT append, duplicate, delete, reorder, jumps, breaks, limits and export passed.');
