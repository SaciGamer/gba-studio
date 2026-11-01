import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';
const root = path.resolve('src/renderer/frontend/src');
const load = async file => {
  const result = await build({ entryPoints: [path.join(root, 'utils', file)], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const [deletion, score, composition] = await Promise.all(['trackerScoreDeletion.ts', 'trackerScore.ts', 'trackerComposition.ts'].map(load));
const source = fs.readFileSync(path.join(root, 'components/resourceEditors/TrackerModuleViewer.tsx'), 'utf8');
const ast = ts.createSourceFile('viewer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'deleteKeyboardScoreNotes') handler = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
};
visit(ast); assert.ok(handler);
for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  const modXm = format === 'MOD' || format === 'XM';
  const event = (note = 0, effect = 0, parameter = 0) => ({ note, effect, parameter, instrument: note > 0 && note < 97 ? 1 : 0, volume: 0 });
  const rows = Array.from({ length: 16 }, () => [event(), event()]);
  rows[0][0] = event(49, modXm ? 4 : 8, 0x47);
  rows[1][0] = event(0, modXm ? 15 : 20, 150);
  rows[2][0] = event(0, modXm ? 0 : 10, 0x37);
  rows[3][0] = event(0, modXm ? 14 : 19, modXm ? 0x60 : 0xb0);
  rows[4][0] = event(0, modXm ? 15 : 1, 3);
  rows[6][0] = event(0, modXm ? 8 : 24, 0x40);
  rows[7][0] = event(97, modXm ? 14 : 19, 0xc0);
  rows[8][0] = event(53, modXm ? 4 : 8, 0x23);
  rows[2][1] = event(61, modXm ? 4 : 8, 0x17);
  const initial = { bpm: 125, speed: 6 };
  const updates = deletion.trackerScoreDeletion(rows, format, [{ row: 0, channel: 0 }], initial);
  assert.deepEqual(updates.filter(update => update.patch.effect === 0).map(update => update.row), [0, 2, 6, 7]);
  assert.ok(updates.some(update => update.row === 0 && update.patch.notePresent === false));
  assert.ok(updates.some(update => update.row === 7 && update.patch.note === 0));
  assert.ok(updates.every(update => update.channel === 0 && update.row < 8));
  let project = composition.createMusicCompositionWithStarterBank(format);
  project = composition.editMusicCompositionNotes(project, 0, [{ start: 0, end: 7, pitch: 49, channelIndex: 0, instrumentIndex: 1 }, { start: 8, end: 12, pitch: 53, channelIndex: 0, instrumentIndex: 1 }]);
  for (let row = 0; row <= 8; row++) {
    const effect = rows[row][0];
    if (effect.effect || effect.parameter) project = composition.setMusicCompositionPatternEffect(project, 0, row, 0, format, effect.effect, effect.parameter, true);
  }
  let calls = 0, committed;
  const context = { ...deletion, ...score, ...composition, projectPackage: {}, musicComposition: { current: project }, selectedPattern: 0, selectedOrder: 0,
    unifiedOrderTable: [0], patternRowsByIndex: [rows], info: { format, tempo: 125, speed: 6 },
    commitCanonicalRollEdits: (_edits, _pattern, _audition, _timing, next) => { calls++; committed = next; } };
  vm.createContext(context);
  vm.runInContext(ts.transpile(`var remove = ${handler}`, { target: ts.ScriptTarget.ES2022 }), context);
  context.remove([{ row: 0, channel: 0 }]);
  assert.equal(calls, 1, `${format}: note and note effects share one undo step`);
  assert.ok(!committed.patterns[0].notes.some(note => note.row === 0));
  assert.ok(committed.patterns[0].notes.some(note => note.row === 8));
  for (const row of [1, 3, 4, 8]) assert.ok(committed.patterns[0].commands.some(command => command.row === row), `${format}: global commands and the next note effects survive`);
  assert.ok(!committed.patterns[0].commands.some(command => [0, 2, 6, 7].includes(command.row)));
}
console.log('Keyboard Delete removes notes and note-scoped Fx atomically, preserving tempo, speed, repeats, other channels and following notes in all formats.');
