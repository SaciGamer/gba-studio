import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { build } from 'esbuild';

const bundle = await build({ stdin: { contents: `
  export * from './src/renderer/frontend/src/utils/trackerComposition';
  export * from './src/renderer/frontend/src/utils/trackerCompositionExport';
  export * from './src/renderer/frontend/src/utils/trackerCompositionImport';
  export * from './src/renderer/frontend/src/utils/trackerModule';
  export * from './src/renderer/frontend/src/utils/trackerPianoRollModel';
  export * from './src/renderer/frontend/src/utils/modPlayer';
`, resolveDir: path.resolve('.'), loader: 'ts' }, bundle: true, write: false, platform: 'node', format: 'esm' });
const lib = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const file = 'src/renderer/frontend/src/components/resourceEditors/TrackerModuleViewer.tsx';
const source = fs.readFileSync(file, 'utf8');
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = new Map();
const visit = node => {
  if (ts.isVariableDeclaration(node) && ['erasePatternRollNoteRanges', 'toRollDisplayNote'].includes(node.name.getText(ast))) handlers.set(node.name.getText(ast), node.initializer.getText(ast));
  ts.forEachChild(node, visit);
};
visit(ast);
const cases = [
  { name: 'head', start: 8, end: 12, expected: [[12, 12]] },
  { name: 'tail', start: 20, end: 24, expected: [[8, 12]] },
  { name: 'middle', start: 12, end: 16, expected: [[8, 4], [16, 8]] },
  { name: 'whole', start: 8, end: 24, expected: [] },
];
const intervals = (project, channelIndex = 0) => project.patterns[0].notes.filter(note => note.channelId === project.channels[channelIndex].id)
  .sort((a, b) => a.row - b.row).map(note => [note.row, note.durationRows]);
for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  let project = lib.createMusicCompositionWithStarterBank(format);
  project = lib.editMusicCompositionNotes(project, 0, [
    { start: 8, end: 24, pitch: 49, channelIndex: 0, instrumentIndex: 1 },
    { start: 8, end: 24, pitch: 53, channelIndex: 1, instrumentIndex: 1 },
  ]);
  const original = lib.exportMusicComposition(project, format).moduleData;
  project = lib.importTrackerModuleComposition(original, `original.${format.toLowerCase()}`);
  const sourceNote = project.patterns[0].notes.find(note => note.channelId === project.channels[0].id);
  for (const test of cases) {
    const cut = lib.eraseMusicCompositionNoteRanges(project, 0, [{ row: 8, start: test.start, end: test.end, channelIndex: 0 }]);
    assert.deepEqual(intervals(cut), test.expected, `${format} canonical ${test.name}`);
    const survivors = cut.patterns[0].notes.filter(note => note.channelId === project.channels[0].id);
    assert.equal(new Set(survivors.map(note => note.id)).size, survivors.length, 'split notes need distinct identities');
    for (const note of survivors) for (const key of ['pitch', 'instrumentId', 'volume', 'pan']) assert.equal(note[key], sourceNote[key], `preserve ${key}`);
    const roundtrip = lib.importTrackerModuleComposition(lib.exportMusicComposition(cut, format).moduleData, `cut.${format.toLowerCase()}`);
    assert.deepEqual(intervals(roundtrip), test.expected, `${format} exported ${test.name}`);
    assert.deepEqual(intervals(roundtrip, 1), [[8, 16]], 'other channels must remain intact');

    let bytes = original;
    const context = {
      ...lib, projectPackage: null, moduleBytes: original, selectedPattern: 0, info: { format }, activeInstrument: 1,
      mod: format === 'MOD' ? lib.parseModModule(original) : null,
      itEventHasNote: event => (event.notePresent ?? event.instrument > 0) && event.note >= 0 && event.note <= 119,
      t: key => key, message: { warning: message => { throw new Error(message); } },
      commitXmEventUpdates: (pattern, updates) => { bytes = lib.updateXmPatternEvents(bytes, pattern, updates); return true; },
      applyGridUpdates: (updates, pattern) => {
        if (format === 'MOD') {
          const result = lib.updateModEvents(lib.parseModModule(bytes), pattern, updates.map(update => ({ ...update,
            patch: { period: update.patch.note, sample: update.patch.instrument, effect: update.patch.effect, parameter: update.patch.parameter } })));
          bytes = result.bytes.buffer.slice(result.bytes.byteOffset, result.bytes.byteOffset + result.bytes.byteLength);
        } else bytes = format === 'S3M' ? lib.updateS3mPatternEvents(bytes, pattern, updates) : lib.updateItPatternEvents(bytes, pattern, updates);
        return true;
      },
    };
    vm.createContext(context);
    for (const [name, handler] of handlers) vm.runInContext(ts.transpile(`var ${name} = ${handler};`, { target: ts.ScriptTarget.ES2022 }), context);
    context.erasePatternRollNoteRanges([{ row: 8, start: test.start, end: test.end, channel: 0, patternIndex: 0 }]);
    const rawResult = lib.importTrackerModuleComposition(bytes, `original-cut.${format.toLowerCase()}`);
    assert.deepEqual(intervals(rawResult), test.expected, `${format} original file ${test.name}`);
    assert.deepEqual(intervals(rawResult, 1), [[8, 16]], 'raw editing must preserve other channels');
  }
  console.log(`${format}: head, tail, middle split and complete erase passed for compositions and original modules.`);
}
