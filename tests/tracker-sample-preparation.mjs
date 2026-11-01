import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerSamplePreparation.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { createTrackerSamplePreviewWav, encodeTrackerDeltaPcm, prepareTrackerSamplePcm } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const estimateSource = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerSampleEstimate.ts'), 'utf8');
const estimateCompiled = ts.transpileModule(estimateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { estimateTrackerSampleConversion } = await import(`data:text/javascript;base64,${Buffer.from(estimateCompiled).toString('base64')}`);
for (const [format, encodingKey, maxFrames] of [
  ['MOD', 'music.sample.encoding.mod', 131070],
  ['XM', 'music.sample.encoding.xm', 131072],
  ['S3M', 'music.sample.encoding.s3m', 131072],
  ['IT', 'music.sample.encoding.it', 131072],
]) {
  assert.deepEqual(estimateTrackerSampleConversion(format, 669), { frames: 669, payloadBytes: 669, maxFrames, encodingKey }, `${format} estimate reports its actual payload size and encoding`);
}
assert.equal(estimateTrackerSampleConversion('MOD', 131071).payloadBytes, 131071, 'estimate preserves an over-limit size for the warning');
assert.equal(estimateTrackerSampleConversion('XM', Number.NaN).frames, 0, 'invalid duration cannot produce a NaN estimate');
const sampleRate = 8363;
const sourceRate = 22050;
const channels = Array.from({ length: 2 }, (_, channel) => Float32Array.from({ length: sourceRate / 2 }, (_, frame) => 0.25 + 0.15 * Math.sin(2 * Math.PI * 440 * frame / sourceRate) + (channel ? 0.02 : -0.02)));
const options = { trimStart: 0.02, trimEnd: 0.10, gain: 1, removeDc: true, fadeInMs: 10, fadeOutMs: 10 };
const pcm = prepareTrackerSamplePcm(channels, sourceRate, options);
assert.equal(pcm.length, 669, 'trim boundaries determine exact output frame count');
assert.equal(pcm[0], 0, 'fade-in begins at silence');
assert.equal(pcm.at(-1), 0, 'fade-out ends at silence');
const mean = pcm.reduce((sum, value) => sum + value, 0) / pcm.length;
assert.ok(Math.abs(mean) < 1, 'DC removal centers the quantized sample');
assert.ok(Math.max(...pcm.map(Math.abs)) > 10, 'prepared sample retains signal');
const noDc = prepareTrackerSamplePcm(channels, sourceRate, { ...options, removeDc: false, fadeInMs: 0, fadeOutMs: 0 });
assert.ok(noDc.reduce((sum, value) => sum + value, 0) / noDc.length > 25, 'DC removal is an explicit transform');
const delta = encodeTrackerDeltaPcm(pcm);
let decoded = 0;
for (let index = 0; index < delta.length; index += 1) {
  decoded = (decoded + (delta[index] > 127 ? delta[index] - 256 : delta[index])) << 24 >> 24;
  assert.equal(decoded, pcm[index], `delta PCM round-trips frame ${index}`);
}
const wav = createTrackerSamplePreviewWav(pcm, sampleRate);
const bytes = new DataView(await wav.arrayBuffer());
assert.equal(wav.type, 'audio/wav');
assert.equal(bytes.getUint32(24, true), sampleRate);
assert.equal(bytes.getUint16(22, true), 1);
assert.equal(bytes.getUint16(34, true), 8);
assert.equal(bytes.getUint32(40, true), pcm.length);
assert.equal(bytes.getUint8(44), 128);
assert.equal(bytes.getUint8(44 + pcm.length - 1), 128);
assert.throws(() => prepareTrackerSamplePcm(channels, sourceRate, { ...options, trimEnd: 0.001 }), /between 1 and 131072 frames/);
console.log('Tracker sample preparation, XM delta PCM and exact WAV preview checks passed.');
