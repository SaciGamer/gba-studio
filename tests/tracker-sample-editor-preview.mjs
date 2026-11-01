import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const beatPath = 'src/renderer/frontend/src/components/resourceEditors/GBABeatEditor.tsx';
const viewerPath = 'src/renderer/frontend/src/components/resourceEditors/TrackerModuleViewer.tsx';
const beatAst = ts.createSourceFile(beatPath, fs.readFileSync(beatPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const viewerAst = ts.createSourceFile(viewerPath, fs.readFileSync(viewerPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let buttonHandler;
let previewHandler;
const visitBeat = node => {
  if (ts.isJsxAttribute(node) && node.name.getText(beatAst) === 'onClick'
    && node.initializer?.getText(beatAst).includes('props.onPreviewSample')) buttonHandler = node.initializer.expression.getText(beatAst);
  ts.forEachChild(node, visitBeat);
};
const visitViewer = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(viewerAst) === 'previewEditorSample') previewHandler = node.initializer.getText(viewerAst);
  ts.forEachChild(node, visitViewer);
};
visitBeat(beatAst); visitViewer(viewerAst);
assert.ok(buttonHandler); assert.ok(previewHandler);
const pcm = new Float32Array([0.5, -0.5]);
const selectedSample = { samples: pcm, rootNote: 36, fineTune: 32, sampleRate: 8363, loopStart: 0, loopEnd: 2, loopType: 1, volume: 48,
  variants: [{ samples: new Float32Array([0.1]) }], noteMap: [0], noteTranspose: [12] };
const calls = [];
let stopped = 0;
const context = {
  activeEditorSample: selectedSample, selectedNote: null, noteLength: 8,
  info: { format: 'XM', speed: 6, tempo: 125 },
  stopSelectedNotePreview: () => { stopped += 1; },
  trackerPlayer: { current: { auditionNote: (...args) => calls.push(args) } },
  props: {},
};
vm.createContext(context);
vm.runInContext(ts.transpile(`var previewEditorSample = ${previewHandler}; var clickPreview = ${buttonHandler};`, { target: ts.ScriptTarget.ES2022 }), context);
context.props.onPreviewSample = context.previewEditorSample;
context.clickPreview();
assert.equal(calls[0][0], 49, 'no selection must use C5 like the instrument preview, not the sample root-note metadata');
assert.equal(calls[0][4], undefined);
context.selectedNote = { note: 61 };
context.clickPreview();
assert.equal(calls[1][0], 61, 'an existing note must audition the selected pitch');
assert.equal(calls[1][4], 0.96, 'use the selected note duration at the song tempo');
for (const args of calls) {
  assert.equal(args[3], 'XM');
  const sample = args[2].get(1);
  assert.equal(sample.samples, pcm, 'play the displayed PCM instead of a different mapped variant');
  for (const key of ['rootNote', 'fineTune', 'sampleRate', 'loopStart', 'loopEnd', 'loopType', 'volume']) assert.equal(sample[key], selectedSample[key]);
  for (const key of ['variants', 'noteMap', 'noteTranspose']) assert.equal(sample[key], undefined, 'the already selected sample must not be remapped');
}
assert.equal(stopped, 2, 'stop the previous clicked-note voice before auditioning the sample');
console.log('Sample Editor: C5/default and selected-note pitch, selected variant, tuning, loop, gain and duration routing passed.');
