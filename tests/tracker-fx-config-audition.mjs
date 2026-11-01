import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const filename = 'src/renderer/frontend/src/components/resourceEditors/TrackerModuleViewer.tsx';
const ast = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let preview, change;
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'previewExistingNote') preview = node.initializer.getText(ast);
  if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'onEffectChange') change = node.initializer.expression.getText(ast);
  ts.forEachChild(node, visit);
};
visit(ast);
assert.ok(preview && change);
const rows = Array.from({ length: 8 }, (_, row) => [{ note: row === 0 ? 49 : 0, instrument: row === 0 ? 1 : 0, effect: 0, parameter: 0 }]);
const committed = [], played = [];
const context = {
  trackerPlaying: false, stopSelectedNotePreview() {}, selectedNoteGeneration: { current: 0 },
  patternRowsByIndex: [rows], info: { format: 'XM', channels: 1, speed: 6, tempo: 125 },
  moduleBytes: new ArrayBuffer(1), parseXmPatternRows: () => structuredClone(rows),
  activeInstrument: 1, unifiedSamples: new Map(), channelPans: [], projectPackage: null, musicSource: null,
  selectedNotePlayer: { current: { play: async audition => { played.push(audition); return 100; } } },
  selectedNoteTimer: { current: null }, window: { setTimeout() {} },
  message: { error() { assert.fail('audition failed'); } }, t: key => key,
  createTrackerNoteAudition: source => ({ rows: source, speed: 6, tempo: 125 }),
  commitFxChanges: changes => committed.push(changes),
};
vm.createContext(context);
vm.runInContext(ts.transpile(`var previewExistingNote = ${preview}; var change = ${change};`, { target: ts.ScriptTarget.ES2022 }), context);
context.change(3, 0, 0, 4, 0x47);
await Promise.resolve();
assert.equal(committed.length, 1);
assert.equal(played.length, 1, 'configuration completion auditions the preceding held note');
assert.equal(played[0][0][0].note, 49);
assert.equal(played[0][3][0].effect, 4);
assert.equal(played[0][3][0].parameter, 0x47, 'audition uses the new value before React rerenders');
assert.equal(rows[3][0].effect, 0, 'preview does not mutate the current pattern');
context.trackerPlaying = true;
context.change(3, 0, 0, 4, 0x48);
assert.equal(played.length, 1, 'configuration does not interrupt active playback');
console.log('Fx configuration: committed value, held-note audition, immutable pattern and active playback guard passed.');
