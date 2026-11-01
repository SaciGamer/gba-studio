import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';

const loadUtility = async filename => {
  const result = await build({
    entryPoints: [path.resolve('src/renderer/frontend/src/utils', filename)],
    bundle: true, write: false, platform: 'node', format: 'esm',
    plugins: [{ name: 'worklet-url', setup(builder) {
      builder.onResolve({ filter: /\?url$/ }, args => ({ path: args.path, namespace: 'worklet-url' }));
      builder.onLoad({ filter: /.*/, namespace: 'worklet-url' }, () => ({ contents: 'export default "mock-worklet-url";' }));
    } }],
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const [composition, exporter, tracker, modulePlayer, { TrackerPreviewPlayer }] = await Promise.all([
  'trackerComposition.ts', 'trackerCompositionExport.ts', 'trackerModule.ts', 'modPlayer.ts', 'trackerPreviewPlayer.ts',
].map(loadUtility));

for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  let boundaryProject = composition.createMusicCompositionForTarget(format, 'Finite pattern boundary');
  boundaryProject = composition.addMusicCompositionInstrumentPreset(boundaryProject, 'sine-lead');
  const instrumentId = boundaryProject.instruments.at(-1).id;
  const makeNote = (row, channel, durationRows) => ({ id: crypto.randomUUID(), row,
    channelId: boundaryProject.channels[channel].id, pitch: 49, durationRows, instrumentId, volume: 1, pan: 0 });
  const first = boundaryProject.patterns[0];
  first.notes = [makeNote(60, 0, 4), makeNote(60, 1, 4)];
  const next = { ...first, id: crypto.randomUUID(), index: 1, name: 'Following pattern',
    notes: [makeNote(8, 0, 4), makeNote(0, 1, 4), makeNote(60, 2, 4)], commands: [] };
  boundaryProject.patterns.push(next);
  boundaryProject.order.push({ id: crypto.randomUUID(), index: 1, patternId: next.id });
  const snapshot = JSON.stringify(boundaryProject);
  const bytes = exporter.exportMusicComposition(boundaryProject, format).moduleData;
  const parseRows = (data, index) => format === 'XM' ? tracker.parseXmPatternRows(data, index, 64)
    : format === 'S3M' ? tracker.parseS3mPatternRows(data, index, 64)
      : format === 'IT' ? tracker.parseItPatternRows(data, index, 64)
        : modulePlayer.parseModModule(data).patterns[index];
  const rowsFor = index => parseRows(bytes, index);
  const assertCut = event => {
    if (format === 'MOD') {
      assert.equal(event.effect, 14);
      assert.equal(event.parameter, 0xc0);
    } else {
      assert.equal(event.note, format === 'XM' ? 97 : 254, `${format} cuts the preceding pattern's finite note`);
      if (format === 'XM') assert.equal(event.volume, 0x10, 'XM boundary cut also stops sustaining envelopes');
    }
  };
  assertCut(rowsFor(1)[0][0]);
  assertCut(rowsFor(0)[0][2]);
  assert.ok(format === 'MOD' ? rowsFor(1)[0][1].period > 0 : rowsFor(1)[0][1].instrument > 0,
    `${format} preserves a new note at the boundary in the same channel`);
  assert.equal(JSON.stringify(boundaryProject), snapshot, 'boundary cuts do not modify the editable composition');
  const imported = structuredClone(boundaryProject);
  imported.sourceModules = [{ id: crypto.randomUUID(), format, fileName: `original.${format.toLowerCase()}`,
    fingerprint: 'fixture', parserVersion: 'fixture', moduleData: '', warnings: [] }];
  const carry = parseRows(exporter.exportMusicComposition(imported, format).moduleData, 1)[0][0];
  assert.ok(format === 'MOD' ? !(carry.effect === 14 && carry.parameter === 0xc0) : carry.note !== (format === 'XM' ? 97 : 254),
    'untouched imported patterns retain their native voice carry behavior');
  const edited = composition.editMusicCompositionNotes(imported, 0, [{ oldRow: 60, start: 60, end: 64,
    pitch: 49, channelIndex: 0, instrumentIndex: boundaryProject.instruments.at(-1).index + 1 }]);
  assert.equal(edited.patterns[0].notes.find(note => note.channelId === edited.channels[0].id).endAtPatternBoundary, true);
  assertCut(parseRows(exporter.exportMusicComposition(edited, format).moduleData, 1)[0][0]);
}

class Param {
  value = 0;
  events = [];
  setValueAtTime(value, time) { this.value = value; this.events.push({ kind: 'set', value, time }); }
  linearRampToValueAtTime(value, time) { this.setValueAtTime(value, time); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push({ kind: 'ramp', value, time }); }
  setTargetAtTime(value, time) { this.setValueAtTime(value, time); }
  cancelScheduledValues(time) { this.events.push({ kind: 'cancel', time }); }
}
class AudioNode {
  connections = [];
  connect(target) { this.connections.push(target); return target; }
  disconnect() {}
  addEventListener() {}
}
class Gain extends AudioNode { gain = new Param(); }
class Source extends AudioNode {
  playbackRate = new Param();
  start(time) { this.startedAt = time; }
  stop() {}
}
class Context {
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  destination = new AudioNode();
  sources = [];
  audioWorklet = { async addModule() {} };
  constructor() { Context.latest = this; }
  async suspend() { this.state = 'suspended'; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createGain() { return new Gain(); }
  createStereoPanner() { return Object.assign(new AudioNode(), { pan: new Param() }); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { length, sampleRate, duration: length / sampleRate,
      getChannelData: channel => data[channel], copyToChannel: (values, channel) => data[channel].set(values) };
  }
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
}
globalThis.AudioWorkletNode = class extends AudioNode { port = { postMessage() {} }; };
globalThis.window = { AudioContext: Context, setTimeout, clearTimeout };
const sample = {
  samples: Float32Array.from({ length: 256 }, (_, index) => Math.sin(index * Math.PI / 16) * .5),
  sampleRate: 8363, rootNote: 49, volume: 64, loopStart: 0, loopEnd: 256, loopType: 1, fadeout: 0,
  volumeEnvelope: { enabled: true, points: [{ tick: 0, value: 64 }, { tick: 64, value: 64 }],
    sustainEnabled: true, sustain: 0, loopEnabled: true, loopStart: 0, loopEnd: 1 },
};
const cell = patch => ({ note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0, ...patch });
const player = new TrackerPreviewPlayer();
await player.play([
  [cell({ note: 49, instrument: 1 })], [cell({ note: 97, volume: 0x10 })],
  [cell({})], [cell({ note: 53, instrument: 1 })],
], 1, 6, 125, [], new Map([[1, sample]]), 'XM');
const voice = Context.latest.sources[0];
const releaseTime = voice.startedAt + 6 * (314 / 15768);
const events = voice.connections[0].gain.events;
assert.ok(events.some(event => event.kind === 'cancel' && Math.abs(event.time - releaseTime) < 1e-7),
  'XM explicit boundary cut cancels an otherwise sustaining envelope at the end of the note');
assert.ok(events.some(event => event.kind === 'ramp' && event.value === .0001 && Math.abs(event.time - releaseTime - .01) < 1e-7),
  'Quick Preview silences the released voice before the following musical note');
player.stop();
const { createTrackerNoteAudition } = await loadUtility('trackerNoteAudition.ts');
const fxRows = Array.from({ length: 10 }, () => [cell({}), cell({})]);
fxRows[0][0] = cell({ note: 49, instrument: 1 });
fxRows[2][0] = cell({ effect: 4, parameter: 0x47 });
fxRows[2][1] = cell({ note: 53, instrument: 1 });
fxRows[3][0] = cell({ effect: 8, parameter: 255 });
fxRows[3][1] = cell({ effect: 15, parameter: 150 });
fxRows[4][0] = cell({ effect: 1, parameter: 4 });
fxRows[4][1] = cell({ effect: 16, parameter: 32 });
fxRows[5][0] = cell({ effect: 7, parameter: 0x47 });
fxRows[6][0] = cell({ effect: 12, parameter: 24 });
fxRows[7][0] = cell({ effect: 0, parameter: 0x37 });
fxRows[8][0] = cell({ note: 97, volume: 0x10 });
const selectedAudition = createTrackerNoteAudition(fxRows, fxRows, 0, 0, 2, 'XM', 6, 125, 1);
assert.equal(selectedAudition.rows[3][1].parameter, 150, 'note audition retains tempo commands from other channels');
assert.equal(selectedAudition.rows[4][1].effect, 16, 'note audition retains global volume commands');
assert.equal(selectedAudition.rows[2][1].notePresent, false, 'other channels do not trigger notes in an isolated audition');
await player.play(fxRows, 2, 6, 125, [], new Map([[1, sample]]), 'XM');
const quickVoice = Context.latest.sources[0];
const quickPitch = quickVoice.playbackRate.events;
const rowDuration125 = 6 * 314 / 15768;
const rowDuration150 = 6 * 262 / 15768;
const vibratoStart = quickVoice.startedAt + 2 * rowDuration125;
const vibratoValues = quickPitch.filter(event => event.kind !== 'cancel' && event.time >= vibratoStart - 1e-7
  && event.time < vibratoStart + rowDuration125 - 1e-7).map(event => event.value);
assert.ok(new Set(vibratoValues).size > 2, 'vibrato on a later row modulates the currently held voice');
const rowSixTime = quickVoice.startedAt + 3 * rowDuration125 + 3 * rowDuration150;
const voiceNodes = [];
for (let node = quickVoice; node; node = node.connections?.[0]) voiceNodes.push(node);
assert.ok(voiceNodes.some(node => node.gain?.events.some(event => event.kind === 'set'
  && Math.abs(event.time - rowSixTime) < 1e-7 && Math.abs(event.value - .375) < 1e-7)), 'a later Cxx changes the active voice volume');
assert.ok(voiceNodes.some(node => node.pan?.events.some(event => event.time > quickVoice.startedAt && Math.abs(event.value) > .9)), 'a later pan command moves the active voice');
player.stop();
await player.play(selectedAudition.rows, 2, selectedAudition.speed, selectedAudition.tempo, [], new Map([[1, sample]]), 'XM', [], [], undefined, false, undefined, false, false, [], true);
assert.equal(Context.latest.sources.length, 1, 'clicked-note preview schedules just its selected voice');
assert.deepEqual(Context.latest.sources[0].playbackRate.events, quickPitch,
  'Quick Preview and clicked-note audition process the same pitch effects throughout the note');
player.stop();
console.log('Pattern-boundary cuts pass for MOD/XM/S3M/IT, including looping, new notes, immutable source and XM preview envelope cutoff.');
console.log('Quick Preview and note audition honor mid-note vibrato, pitch slide, pan, tremolo, volume, arpeggio and cross-channel global commands.');
