import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
import { build } from 'esbuild';
const root = path.resolve('src/renderer/frontend/src');
const load = async file => {
  const result = await build({ entryPoints: [path.join(root, 'utils', file)], bundle: true, write: false, format: 'esm', platform: 'node' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const [gesture, score, composition] = await Promise.all(['trackerKeyboardGesture.ts', 'trackerScore.ts', 'trackerComposition.ts'].map(load));
const source = fs.readFileSync(path.join(root, 'components/resourceEditors/TrackerModuleViewer.tsx'), 'utf8');
const ast = ts.createSourceFile('viewer.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let commit;
const visit = node => {
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onKeyboardGesture') commit = node.initializer.expression.getText(ast);
  ts.forEachChild(node, visit);
};
visit(ast); assert.ok(commit);
for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  const rows = Array.from({ length: 64 }, () => []);
  const timing = score.trackerScoreTiming(rows, format, { bpm: 125, speed: 6 }).rows;
  const make = (touches, seconds, mode) => gesture.buildKeyboardGesture(touches, seconds, 4, 4, timing, mode, format, 0, 1);
  const held = make([{ pitch: 49, seconds: 0 }], 1, 'notes');
  assert.ok(held.notes[0].end - held.notes[0].start > 4, 'holding extends a note by elapsed tracker time');
  const trace = [{ pitch: 49, seconds: 0 }, { pitch: 53, seconds: .25 }, { pitch: 49, seconds: .5 }];
  const notes = make(trace, .7, 'notes');
  assert.deepEqual(notes.notes.map(note => note.note), [49, 53, 49]);
  assert.ok(notes.notes.every((note, index) => note.end > note.start && (!index || notes.notes[index - 1].end === note.start)));
  for (const mode of ['portamento', 'vibrato', 'arpeggio']) {
    const result = make(trace, .7, mode);
    const expected = mode === 'portamento' ? (format === 'MOD' || format === 'XM' ? 3 : 7)
      : mode === 'vibrato' ? (format === 'MOD' || format === 'XM' ? 4 : 8) : (format === 'MOD' || format === 'XM' ? 0 : 10);
    assert.ok(result.effects.length > 0);
    assert.ok(result.effects.every(effect => effect.effect === expected));
    let count = 0, committed;
    const context = { ...composition, projectPackage: {}, musicComposition: { current: composition.createMusicCompositionWithStarterBank(format) },
      selectedPattern: 0, info: { format }, instrumentsAllowed: () => true,
      commitCanonicalRollEdits: (_notes, _pattern, _audition, _timing, project) => { count++; committed = project; } };
    vm.createContext(context);
    vm.runInContext(ts.transpile(`var commit = ${commit}`, { target: ts.ScriptTarget.ES2022 }), context);
    context.commit(result);
    assert.equal(count, 1, `${format} ${mode}: notes and effects commit as one history step`);
    assert.ok(committed.patterns[0].notes.length > 0);
    assert.ok(committed.patterns[0].commands.some(command => command.command === `${format}:effect-${expected.toString(16)}`));
  }
  assert.equal(make([{ pitch: 37, seconds: 0 }, { pitch: 72, seconds: .2 }], .3, 'arpeggio').arpeggioOverflow, true);
}
console.log('Hold, slide, return gestures, arpeggio limits and atomic notes/Fx commits pass in MOD/XM/S3M/IT.');
