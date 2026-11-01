import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../src/renderer/frontend/src/utils/trackerOutputLimiter.worklet.js', import.meta.url), 'utf8');
let Processor;
class AudioWorkletProcessorStub {
  constructor() { this.port = { postMessage() {} }; }
}
vm.runInNewContext(source, {
  AudioWorkletProcessor: AudioWorkletProcessorStub,
  registerProcessor: (_name, processor) => { Processor = processor; },
  sampleRate: 48_000,
  currentFrame: 0,
  Float32Array,
  Math,
});

const processor = new Processor({ processorOptions: {} });
const input = Float32Array.from([0, 0.001, 0.0079, 0.01, 0.5, 1, 1.5, -0.001, -0.01, -0.5, -1, -1.5]);
const output = new Float32Array(input.length);
assert.equal(processor.process([[input]], [[output]], {}), true);
assert.deepEqual(Array.from(output), [
  0,
  0,
  0,
  0,
  0.5,
  0.5,
  0.5,
  -1 / 128,
  -1 / 128,
  -1 / 128,
  -1,
  -1,
]);
assert.ok(Math.max(...output) <= 127 / 128, 'positive peaks should saturate at signed PCM8 max');
assert.ok(Math.min(...output) >= -1, 'negative peaks should saturate at signed PCM8 min');

const stereoProcessor = new Processor({ processorOptions: { mixRate: 15_768 } });
const leftInput = Float32Array.from([0.125, 0.1875, 0.25, 0.3125, 0.375, 0.4375, 0.5, 0.5625, 0.625, 0.6875, 0.75, 0.8125]);
const rightInput = Float32Array.from(leftInput, value => -value);
const leftOutput = new Float32Array(leftInput.length);
const rightOutput = new Float32Array(rightInput.length);
stereoProcessor.process([[leftInput, rightInput]], [[leftOutput, rightOutput]], {});
assert.deepEqual(Array.from(leftOutput), [
  0.125, 0.125, 0.125, 0.125, 0.375, 0.375, 0.375, 0.5625, 0.5625, 0.5625, 0.75, 0.75,
], '15,768 Hz Maxmod updates each left PCM8 sample at the exact 48 kHz browser-frame boundary');
assert.deepEqual(Array.from(rightOutput), [
  -0.125, -0.125, -0.125, -0.125, -0.375, -0.375, -0.375, -0.5625, -0.5625, -0.5625, -0.75, -0.75,
], 'stereo right PCM8 timing and signed clipping are independent from the left channel');
const silence = new Float32Array(2);
const silenceOutLeft = new Float32Array(2);
const silenceOutRight = new Float32Array(2);
stereoProcessor.process([[]], [[silenceOutLeft, silenceOutRight]], {});
assert.deepEqual([...silenceOutLeft, ...silenceOutRight], [0, 0, 0, 0], 'an empty mixer block resets held stereo samples to silence');

console.log('Tracker output mixer: exact 15,768 Hz scheduling, stereo signed PCM8 quantization, silence reset and clipping verified.');
