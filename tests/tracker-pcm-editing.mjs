import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerPcmEditing.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { editTrackerPcm } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const sourcePcm = Float32Array.from([0.1, -0.2, 0.3, -0.4]);

const reversed = editTrackerPcm(sourcePcm, 'reverse');
assert.deepEqual([...reversed], [-51, 38, -25, 13], 'reverse also converts the result to signed 8-bit PCM');
const normalized = editTrackerPcm(sourcePcm, 'normalize');
assert.equal(Math.max(...normalized.map(Math.abs)), 127, 'normalization reaches full 8-bit scale without exceeding it');
const dcRemoved = editTrackerPcm(Float32Array.from([0.4, 0.5, 0.6]), 'remove-dc');
assert.ok(Math.abs(dcRemoved.reduce((sum, value) => sum + value, 0)) <= 1, 'DC removal centers the sample');
const faded = editTrackerPcm(sourcePcm, 'fade-out');
assert.equal(faded[0], 13, 'fade-out preserves the first frame');
assert.equal(faded.at(-1), 0, 'fade-out reaches silence at the last frame');
assert.deepEqual([...editTrackerPcm(new Float32Array(4), 'normalize')], [0, 0, 0, 0], 'normalizing silence is stable');
assert.equal(editTrackerPcm(new Float32Array(), 'reverse').length, 0, 'empty samples remain empty');
assert.deepEqual([...sourcePcm], Array.from(Float32Array.from([0.1, -0.2, 0.3, -0.4]), value => value), 'destructive edits return new PCM and preserve the source model');

const rangedSource = Float32Array.from([0.1, 0.2, -0.25, 0.5, -0.75, 0.1]);
const rangedReverse = editTrackerPcm(rangedSource, 'reverse', { start: 1, end: 5 });
assert.deepEqual([...rangedReverse], [13, -95, 64, -32, 25, 13], 'range reverse edits only selected frames');
const rangedFade = editTrackerPcm(rangedSource, 'fade-out', { start: 2, end: 5 });
assert.deepEqual([...rangedFade], [13, 25, -32, 32, 0, 13], 'range fade preserves frames outside selection and reaches silence at its end');
const drawn = editTrackerPcm(rangedSource, 'draw', { start: 2, end: 5 }, [{ frame: 3, value: 1.5 }, { frame: 0, value: -0.5 }, { frame: 4, value: -0.25 }]);
assert.deepEqual([...drawn], [13, 25, -32, 127, -32, 13], 'frame drawing clamps values and ignores edits outside the selected range');
const crossed = editTrackerPcm(Float32Array.from([1, 0.5, 0.25, -1, -0.5, -0.25]), 'crossfade', { start: 0, end: 6 });
assert.deepEqual([...crossed], [127, 64, 32, -42, 63, 127], 'crossfade blends the selected tail into the loop start and preserves the sample length');
assert.deepEqual([...editTrackerPcm(rangedSource, 'trim', { start: 1, end: 5 })], [25, -32, 64, -95], 'trim returns exactly the selected frames');

console.log('Tracker PCM edit operations passed: normalize, DC removal, range reverse/fade, crossfade, frame drawing, silence and source preservation.');
