import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [path.resolve('src/renderer/frontend/src/utils/trackerPreviewPlayer.ts')],
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'worklet-url', setup(builder) {
    builder.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'worklet-url' }));
    builder.onLoad({ filter: /.*/, namespace: 'worklet-url' }, () => ({ contents: 'export default "mock-worklet-url";' }));
  } }],
});
const { TrackerPreviewPlayer } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

class Param {
  value = 0;
  scheduledValues = [];
  setValueAtTime(value) { this.value = value; this.scheduledValues.push(value); }
  linearRampToValueAtTime(value) { this.setValueAtTime(value); }
  exponentialRampToValueAtTime(value) { this.setValueAtTime(value); }
  setTargetAtTime(value) { this.setValueAtTime(value); }
  cancelScheduledValues() {}
}
class Node {
  connections = [];
  connect(target) { assert.ok(target, 'every audio connection needs a destination'); this.connections.push(target); return target; }
  disconnect() {}
  addEventListener() {}
}
class Gain extends Node { gain = Object.assign(new Param(), { value: 1 }); }
class Panner extends Node { pan = new Param(); }
class Source extends Node {
  playbackRate = new Param();
  started = false;
  start() { this.started = true; }
  stop() {}
}
class Context {
  currentTime = 0;
  sampleRate = 48_000;
  state = 'running';
  destination = new Node();
  sources = [];
  audioWorklet = { async addModule() {} };
  constructor() { Context.latest = this; }
  async suspend() { this.state = 'suspended'; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createGain() { return new Gain(); }
  createStereoPanner() { return new Panner(); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, duration: length / sampleRate, getChannelData: channel => data[channel], copyToChannel: (values, channel) => data[channel].set(values) };
  }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
}
globalThis.AudioWorkletNode = class extends Node { port = { postMessage() {} }; };
globalThis.window = { AudioContext: Context, setTimeout, clearTimeout };

const pcm = Float32Array.from({ length: 256 }, (_, index) => Math.sin(index * Math.PI / 16) * 0.5);
const samples = new Map([[1, { samples: pcm, sampleRate: 8363, rootNote: 49, volume: 64, loopStart: 0, loopEnd: 256, loopType: 1 }]]);
const stereoPeakGain = source => {
  const result = [1, 1];
  for (let node = source; node; node = node.connections[0]) {
    if (node instanceof Gain) {
      const peak = node.gain.scheduledValues.length ? Math.max(...node.gain.scheduledValues) : node.gain.value;
      result[0] *= peak; result[1] *= peak;
    }
    if (node instanceof Panner) {
      const angle = (node.pan.value + 1) * Math.PI / 4;
      result[0] *= Math.cos(angle); result[1] *= Math.sin(angle);
    }
  }
  return result;
};
for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  const note = channel => ({
    note: format === 'S3M' ? 0x40 + channel * 4 : format === 'IT' ? 48 + channel * 4 : 49 + channel * 4,
    instrument: 1, volume: 0, effect: 0, parameter: 0, notePresent: true, instrumentPresent: true,
  });
  const release = { note: format === 'XM' ? 97 : format === 'S3M' ? 254 : format === 'IT' ? 255 : 0,
    instrument: 0, volume: 0, effect: format === 'MOD' ? 14 : 0, parameter: format === 'MOD' ? 0xc0 : 0, notePresent: true };
  const player = new TrackerPreviewPlayer();
  const duration = await player.play([[note(0), note(1)], [release, release]], 2, 6, 125, [false, true], samples, format);
  assert.ok(duration > 0, `${format} preview must start`);
  assert.equal(Context.latest.state, 'running', `${format} audio clock must resume`);
  assert.ok(Context.latest.sources.filter(source => source.started).length >= 2, `${format} must schedule both channels, including the muted channel`);
  assert.equal(player.channelMuteGains[0].gain.value, 1);
  assert.equal(player.channelMuteGains[1].gain.value, 0);
  player.setChannelMuted(1, false);
  assert.equal(player.channelMuteGains[1].gain.value, 1, `${format} must support live unmute`);
  player.stop();
  assert.equal(Context.latest.state, 'closed');
  await player.auditionNote(49, 1, samples, format, 0.12);
  const auditionVoice = Context.latest.sources[0];
  const instrumentGain = stereoPeakGain(auditionVoice);
  player.stop();
  await player.play([[note(0)], [release]], 1, 6, 125, [], samples, format, [], [], undefined, false, undefined, false, false, [], true);
  const clickedNoteGain = stereoPeakGain(Context.latest.sources[0]);
  const clickedVoice = Context.latest.sources[0];
  assert.ok(Math.abs(auditionVoice.playbackRate.value - clickedVoice.playbackRate.scheduledValues[0]) < 1e-9,
    `${format} insertion and clicked note must have the same pitch`);
  assert.deepEqual(auditionVoice.buffer.getChannelData(0), clickedVoice.buffer.getChannelData(0), `${format} must audition the same converted PCM`);
  assert.equal(auditionVoice.buffer.sampleRate, clickedVoice.buffer.sampleRate);
  assert.equal(auditionVoice.loopStart, clickedVoice.loopStart);
  assert.equal(auditionVoice.loopEnd, clickedVoice.loopEnd);
  clickedNoteGain.forEach((gain, side) => assert.ok(Math.abs(gain - instrumentGain[side]) < 1e-9,
    `${format} clicked note gain ${gain} must match instrument audition ${instrumentGain[side]}`));
  player.stop();
  const halfVolume = { ...note(0), ...(format === 'MOD' ? { effect: 12, parameter: 32 }
    : format === 'XM' ? { volume: 0x30 } : { volume: 32, volumePresent: true }) };
  await player.play([[halfVolume], [release]], 1, 6, 125, [], samples, format, [], [], undefined, false, undefined, false, false, [], true);
  stereoPeakGain(Context.latest.sources[0]).forEach((gain, side) => assert.ok(gain > 0 && gain < clickedNoteGain[side] * 0.6,
    `${format} isolated audition must retain the note's reduced volume`));
  player.stop();
  console.log(`${format}: sample playback, live unmute and equal audition pitch/PCM/loops/levels passed.`);
}
