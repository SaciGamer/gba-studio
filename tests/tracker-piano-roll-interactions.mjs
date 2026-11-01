import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const filename = 'src/renderer/frontend/src/components/resourceEditors/GBABeatEditor.tsx';
const source = fs.readFileSync(filename, 'utf8');
const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const handlers = new Map();
const names = new Set(['pasteNote', 'updatePastePlacement', 'positionPasteAtPointer', 'placePastedNotes', 'cancelPaste',
  'beginEraseSelection', 'startPointer', 'startNotePointer', 'movePointer', 'endPointer']);
const visit = node => {
  if (ts.isVariableDeclaration(node) && names.has(node.name.getText(ast))) handlers.set(node.name.getText(ast), node.initializer.getText(ast));
  ts.forEachChild(node, visit);
};
visit(ast);
assert.equal(handlers.size, names.size);
const state = { preview: [], erased: [], box: null, created: [], deleted: [], cuts: [] };
const noop = () => {};
const grid = { getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture: noop };
const context = {
  view: 'roll', pattern: 0, selectedOrder: 0, selectedChannel: 1, patternRowCount: 64, rowCount: 128,
  gridWidth: 20, cellHeight: 16, BOTTOM_PITCH: 13, TOP_PITCH: 96, instrument: 1, trackerTool: 'pencil',
  selectedTimelineSegment: { patternIndex: 0, orderIndex: 0, start: 0, end: 64 },
  timelineSegments: [{ patternIndex: 0, orderIndex: 0, start: 0, end: 64 }, { patternIndex: 3, orderIndex: 1, start: 64, end: 128 }],
  noteClipboard: { baseNote: 49, notes: [{ rowOffset: 0, noteDelta: 0, instrument: 1, length: 4 }, { rowOffset: 8, noteDelta: 7, instrument: 2, length: 6 }] },
  pendingPaste: { current: null }, drag: { current: null }, gridPan: { current: null }, selectionDrag: { current: null },
  selectionAnchor: { current: null }, suppressRollNoteClick: { current: false },
  pianoRollScroll: { current: null }, selectedNote: null, selectedNotes: [], rollHover: { row: 80, note: 49 },
  fitScalePitch: value => value, existingNotes: [], message: { warning: message => { throw new Error(message); } }, t: key => key,
  setInspectorLengthPreview: noop, setRollGroupPreview: value => { state.preview = value; },
  setEraseTargets: value => { state.erased = value; }, setSelectionBox: value => { state.box = value; },
  setSelectedNote: value => { context.selectedNote = value; }, setSelectedNotes: value => { context.selectedNotes = value; },
  setInstrument: noop, setNoteLength: noop, setTrackerTool: value => { context.trackerTool = value; },
  setRollHover: noop, setGridPanning: noop, setDragPreview: noop,
  props: { playing: false, onCreateNotes: notes => state.created.push(JSON.parse(JSON.stringify(notes))),
    onEraseNoteRanges: ranges => state.cuts.push(JSON.parse(JSON.stringify(ranges))),
    onDeleteNotes: notes => state.deleted.push(JSON.parse(JSON.stringify(notes))), onOrderChange: noop, onPatternChange: noop },
  onNote: () => { throw new Error('Erase must never create a note'); },
};
context.segmentAtRow = row => context.timelineSegments.find(segment => row >= segment.start && row < segment.end);
vm.createContext(context);
for (const [name, handler] of handlers) vm.runInContext(ts.transpile(`var ${name} = ${handler};`, { target: ts.ScriptTarget.ES2022 }), context);
const json = value => JSON.parse(JSON.stringify(value));
const eventAt = (row, pitch, type = 'pointerup') => ({ type, button: 0, pointerId: 1, clientX: row * 20 + 1,
  clientY: (96 - pitch) * 16 + 1, currentTarget: grid, target: { closest: () => null }, preventDefault: noop, stopPropagation: noop });

context.pasteNote();
assert.equal(state.created.length, 0, 'Ctrl+V must only start placement');
assert.deepEqual(json(state.preview).map(note => [note.row, note.note, note.length]), [[80, 49, 4], [88, 56, 6]]);
context.updatePastePlacement(125, 95);
assert.deepEqual(json(state.preview).map(note => [note.row, note.note, note.length]), [[114, 89, 4], [122, 96, 6]], 'clamp the complete group without shortening or changing intervals');
context.placePastedNotes();
assert.deepEqual(state.created[0], [{ start: 50, end: 54, note: 89, channel: 1, instrument: 1, patternIndex: 3 },
  { start: 58, end: 64, note: 96, channel: 1, instrument: 2, patternIndex: 3 }]);
assert.equal(context.pendingPaste.current, null);
assert.equal(state.preview.length, 0);
context.pasteNote();
context.cancelPaste({ key: 'Escape', preventDefault: noop, stopPropagation: noop });
assert.equal(context.pendingPaste.current, null);
assert.equal(state.preview.length, 0);
assert.equal(state.created.length, 1, 'Esc must cancel without inserting notes');

context.trackerTool = 'eraser';
context.existingNotes = [
  { row: 4, patternRow: 4, timelineRow: 68, patternIndex: 3, orderIndex: 1, note: 49, length: 8 },
  { row: 20, patternRow: 20, timelineRow: 84, patternIndex: 3, orderIndex: 1, note: 52, length: 4 },
  { row: 4, patternRow: 4, timelineRow: 4, patternIndex: 0, orderIndex: 0, note: 49, length: 8 },
];
context.startPointer(eventAt(70, 49, 'pointerdown'));
assert.equal(state.deleted.length, 0, 'Erase pointer-down must only preview');
assert.equal(state.erased[0].row, 4, 'touching the middle of a long note must select it');
context.movePointer(eventAt(86, 52, 'pointermove'));
assert.deepEqual(json(state.erased).map(note => note.row), [4, 20]);
assert.equal(state.deleted.length, 0, 'Erase drag must not delete before pointer-up');
context.endPointer(eventAt(86, 52));
assert.equal(state.deleted.length, 0, 'dragging Erase must cut ranges instead of deleting complete notes');
assert.deepEqual(state.cuts[0], [{ row: 4, start: 6, end: 12, channel: 1, patternIndex: 3 }, { row: 20, start: 20, end: 23, channel: 1, patternIndex: 3 }]);
assert.equal(state.erased.length, 0);
assert.equal(state.box, null);
context.startPointer(eventAt(70, 49, 'pointerdown'));
context.endPointer(eventAt(70, 49));
assert.deepEqual(state.deleted[0], [{ row: 4, channel: 1, patternIndex: 3 }], 'simple click must delete the whole note, including when clicking its middle');
context.startPointer(eventAt(70, 49, 'pointerdown'));
context.endPointer(eventAt(70, 49, 'pointercancel'));
assert.equal(state.deleted.length, 1, 'pointer cancellation must leave notes intact');
context.startPointer(eventAt(100, 60, 'pointerdown'));
context.movePointer(eventAt(103, 64, 'pointermove'));
context.endPointer(eventAt(103, 64));
assert.equal(state.deleted.length, 1, 'empty Erase marquee must do nothing');
assert.equal(state.cuts.length, 1, 'empty Erase marquee must not cut notes');
assert.equal(context.drag.current, null, 'Erase must never start note creation or resize');
console.log('Piano roll: mouse paste/commit/cancel, group boundaries, Erase preview/commit/cancel and empty drags passed.');
