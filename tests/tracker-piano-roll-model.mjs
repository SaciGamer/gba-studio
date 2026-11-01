import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerPianoRollModel.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { buildTrackerPianoEdit, trackerPitchToPeriod, trackerPeriodToPitch, trackerPitchToStoredNote, trackerStoredNoteToPitch } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const emptyRows = count => Array.from({ length: count }, () => [{ note: 0, notePresent: false, instrument: 0, volume: 0, effect: 0, parameter: 0 }]);

assert.equal(trackerPitchToPeriod(49), 428);
assert.equal(trackerPitchToPeriod(56), 285, 'MOD pitch export uses the canonical Amiga period instead of equal-tempered rounding');
assert.equal(trackerPeriodToPitch(285), 56, 'the canonical MOD period maps back to its tracker semitone');
assert.deepEqual(Array.from({ length: 36 }, (_, index) => trackerPitchToPeriod(index + 37)), [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
  428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226,
  214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113,
], 'MOD note pitches use the canonical three-octave Amiga period table');
assert.equal(trackerPeriodToPitch(428), 49);
assert.equal(trackerPitchToStoredNote('S3M', 60), 0x4b);
assert.equal(trackerStoredNoteToPitch('S3M', 0x4b), 60);
assert.equal(trackerStoredNoteToPitch('S3M', 0x4c), 0, 'invalid S3M semitone nibbles are not rendered as notes');
assert.equal(trackerPitchToStoredNote('IT', 1), 0, 'IT C-0 uses the native zero note byte');
assert.equal(trackerStoredNoteToPitch('IT', 0), 1, 'IT note zero remains a valid C-0 pitch');
for (const format of ['S3M', 'IT']) {
  const result = buildTrackerPianoEdit(format, emptyRows(8), 0, null, 1, 4, 60, 2);
  const storedPitch = format === 'S3M' ? 0x4b : 59;
  assert.deepEqual(result.updates.map(item => [item.row, item.patch.note, item.patch.instrument]), [[1, storedPitch, 2], [4, 254, 0]], `${format} notes include a note-off at the exclusive end row`);
}
const modEdit = buildTrackerPianoEdit('MOD', emptyRows(8), 0, null, 1, 4, 49, 1);
assert.deepEqual(modEdit.updates.map(item => [item.row, item.patch.note, item.patch.effect, item.patch.parameter]), [[1, 428, undefined, undefined], [4, undefined, 14, 0xc0]], 'MOD note duration uses an E C0 cut row');
const existing = emptyRows(8);
existing[1][0] = { note: 59, notePresent: true, instrument: 2, volume: 0, effect: 3, parameter: 4 };
existing[5][0] = { note: 254, instrument: 0, volume: 0, effect: 0, parameter: 0 };
const move = buildTrackerPianoEdit('IT', existing, 0, { row: 1, channel: 0, pitch: 60, instrument: 2, end: 5 }, 3, 7, 62, 2);
assert.deepEqual(move.updates.map(item => [item.row, item.patch.note, item.patch.instrument]), [[1, 0, 0], [5, 0, 0], [3, 61, 2], [7, 254, 0]]);
assert.deepEqual(existing[1][0], { note: 59, notePresent: true, instrument: 2, volume: 0, effect: 3, parameter: 4 }, 'editing model does not mutate the imported pattern');
const occupied = emptyRows(8);
occupied[4][0].note = 48;
assert.match(buildTrackerPianoEdit('S3M', occupied, 0, null, 1, 4, 60, 1).warning, /cannot overwrite a note/);
console.log('Tracker piano roll note and duration model passed.');
