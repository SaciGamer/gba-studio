import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';

const root = path.resolve('src/renderer/frontend/src');
const load = async name => {
  const result = await build({ entryPoints: [path.join(root, 'utils', name)], bundle: true, write: false, platform: 'node', format: 'esm' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const [composition, exporter, tracker, modUtils] = await Promise.all([
  'trackerComposition.ts', 'trackerCompositionExport.ts', 'trackerModule.ts', 'modPlayer.ts',
].map(load));
const text = fs.readFileSync(path.join(root, 'components/resourceEditors/TrackerModuleViewer.tsx'), 'utf8');
const source = ts.createSourceFile('TrackerModuleViewer.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'commitFxChanges') handler = node.initializer.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(handler);
for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  let project = composition.createMusicCompositionWithStarterBank(format);
  const second = { ...project.patterns[0], id: tracker.createTrackerUuid(), index: 1, name: 'Pattern 2', notes: [], commands: [] };
  project = { ...project, patterns: [...project.patterns, second], order: [...project.order, { id: tracker.createTrackerUuid(), index: 1, patternId: second.id }] };
  project = composition.editMusicCompositionNotes(project, 0, [{ start: 0, end: 16, pitch: 61, channelIndex: 0, instrumentIndex: 1 }]);
  const effect = ['MOD', 'XM'].includes(format) ? 4 : 8;
  project = composition.setMusicCompositionPatternEffect(project, 0, 62, 0, format, effect, 0x47, true);
  const bytes = exporter.exportMusicComposition(project, format).moduleData;
  const mod = format === 'MOD' ? modUtils.parseModModule(bytes) : null;
  const parseRows = buffer => format === 'MOD' ? modUtils.parseModModule(buffer).patterns : [0, 1].map(index =>
    (format === 'XM' ? tracker.parseXmPatternRows : format === 'S3M' ? tracker.parseS3mPatternRows : tracker.parseItPatternRows)(buffer, index, 64));
  const rows = parseRows(bytes);
  const history = [], redo = [];
  let result = bytes, resultMod = mod, commits = 0;
  const context = {
    Map, info: { format }, projectPackage: null, musicComposition: { current: null }, mod, moduleBytes: bytes, patternRowsByIndex: rows,
    ...modUtils, ...tracker,
    setModUndo: update => { history.splice(0, history.length, ...update(history)); }, setModRedo: () => { redo.length = 0; },
    setMod: value => { resultMod = value; },
    setItUndo: update => { history.splice(0, history.length, ...update(history)); }, setItRedo: () => { redo.length = 0; },
    s3mUndo: { current: history }, s3mRedo: { current: redo },
    setModuleBytes: value => { result = value; }, markCurrentTrackDirty: () => { commits++; },
    commitXmEdit: value => { history.push(bytes); result = value; commits++; },
  };
  vm.createContext(context);
  vm.runInContext(ts.transpile(`var commit=${handler}`, { target: ts.ScriptTarget.ES2022 }), context);
  context.commit([
    { patternIndex: 0, row: 62, channel: 0, effect: 0, parameter: 0 },
    { patternIndex: 1, row: 1, channel: 0, effect, parameter: 0x47 },
  ]);
  assert.equal(commits, 1, `${format}: one group gesture commits once`);
  const undo = format === 'S3M' ? context.s3mUndo.current : history;
  assert.equal(undo.length, 1, `${format}: one undo step for both patterns`);
  const after = format === 'MOD' ? resultMod.patterns : parseRows(result);
  assert.equal(after[0][62][0].effect, 0);
  assert.equal(after[0][62][0].parameter, 0);
  assert.equal(after[1][1][0].effect, effect);
  assert.equal(after[1][1][0].parameter, 0x47);
  assert.deepEqual(after[0][0][0], rows[0][0][0], `${format}: note data is untouched`);
  const before = format === 'MOD' ? undo[0].patterns : parseRows(undo[0]);
  assert.equal(before[0][62][0].effect, effect, `${format}: undo snapshot restores the source`);
  assert.equal(before[1][1][0].parameter, 0, `${format}: undo snapshot clears the destination`);
  let canonicalCommits = 0, canonicalResult;
  Object.assign(context, composition, {
    projectPackage: {}, musicComposition: { current: project },
    isTrackerNotePanEffect: () => false,
    commitCanonicalRollEdits: (_edits, _pattern, _audition, _timing, next) => { canonicalCommits++; canonicalResult = next; },
  });
  context.commit([
    { patternIndex: 0, row: 62, channel: 0, effect: 0, parameter: 0 },
    { patternIndex: 1, row: 1, channel: 0, effect, parameter: 0x47 },
  ]);
  assert.equal(canonicalCommits, 1, `${format}: canonical authoring also commits the entire gesture once`);
  assert.ok(!canonicalResult.patterns[0].commands.some(command => command.row === 62));
  assert.ok(canonicalResult.patterns[1].commands.some(command => command.row === 1 && command.parameter === 0x47));
  assert.deepEqual(canonicalResult.patterns[0].notes, project.patterns[0].notes);
}
console.log('Fx group moves across patterns preserve notes and commit one undo step in MOD/XM/S3M/IT.');
