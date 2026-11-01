import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/renderer/frontend/src/utils/trackerMaxmodGbaSample.ts', 'utf8');
const pitchSource = fs.readFileSync('src/renderer/frontend/src/utils/trackerS3mMaxmodPitch.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {}, Float32Array };
vm.runInNewContext(compiled, context);
const createSample = context.exports.createTrackerMaxmodGbaSample;
const rate = context.exports.TRACKER_MAXMOD_GBA_MIX_RATE;

const sourcePcm = Float32Array.from({ length: 16 }, (_, index) => index - 8);
const rendered = createSample(sourcePcm, 4_319);
assert.equal(rendered.sampleRate, 15_768);
assert.equal(rendered.stepQ12, 4_319);
assert.equal(rendered.samples.length, Math.ceil((sourcePcm.length * 4_096) / 4_319));
assert.deepEqual(Array.from(rendered.samples.slice(0, 10)), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(index => sourcePcm[Math.floor((index * 4_319) / 4_096)]));
assert.equal(createSample(sourcePcm, 0).samples.length, 0);
assert.equal(createSample(new Float32Array(), 4_096).samples.length, 0);
assert.equal(rate, 15_768);

const compiledPitch = ts.transpileModule(pitchSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const pitchContext = { exports: {}, Math };
vm.runInNewContext(compiledPitch, pitchContext);
const stepAt = pitchContext.exports.trackerS3mMaxmodMixerStepQ12;
const rootStep = stepAt(16_777, 49);
const octaveStep = stepAt(16_777, 61);
assert.notEqual(rootStep, octaveStep, 'Maxmod selects a different Q12 sample step for a transposed S3M note');
const rootPitch = createSample(sourcePcm, rootStep);
const octavePitch = createSample(sourcePcm, octaveStep);
assert.notDeepEqual(Array.from(rootPitch.samples), Array.from(octavePitch.samples), 'each S3M pitch gets its own Maxmod lookup sequence');

console.log('Maxmod GBA sample pre-render uses a pitch-specific Q12 nearest-neighbor sequence at 15,768 Hz.');
