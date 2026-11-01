import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { build } from 'esbuild';
import ts from 'typescript';
import { inlineTrackerIdentity } from './helpers/tracker-module-identity.mjs';

globalThis.AudioWorkletProcessor ??= class {};
globalThis.registerProcessor ??= () => {};

const root = path.resolve('.');
const templateSource = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/utils/xmBeatTemplate.ts'), 'utf8');
const templateCompiled = ts.transpileModule(templateSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const templateUrl = `data:text/javascript;base64,${Buffer.from(templateCompiled).toString('base64')}`;
const compatibilitySource = fs.readFileSync(path.join(root, 'src/shared/trackerItBuildCompatibility.ts'), 'utf8');
const compatibilityCompiled = ts.transpileModule(compatibilitySource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const compatibilityUrl = `data:text/javascript;base64,${Buffer.from(compatibilityCompiled).toString('base64')}`;
const templateJs = await import(templateUrl);
const trackerSource = fs.readFileSync(path.join(root, 'src/renderer/frontend/src/utils/trackerModule.ts'), 'utf8');
const trackerCompiled = inlineTrackerIdentity(ts.transpileModule(trackerSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
  .replace("from './xmBeatTemplate';", `from '${templateUrl}';`)
  .replace("from '../../../../shared/trackerItBuildCompatibility';", `from '${compatibilityUrl}';`);
const trackerJs = await import(`data:text/javascript;base64,${Buffer.from(trackerCompiled).toString('base64')}`);
const previewBundleDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gba-studio-long-song-'));
const previewBundlePath = path.join(previewBundleDirectory, 'preview.mjs');
const previewBundle = await build({
  entryPoints: [path.join(root, 'src/renderer/frontend/src/utils/trackerPreviewPlayer.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: previewBundlePath,
  write: false,
});
fs.writeFileSync(previewBundlePath, previewBundle.outputFiles[0].text);
fs.copyFileSync(path.join(root, 'src/renderer/frontend/src/utils/trackerOutputLimiter.worklet.js'), path.join(previewBundleDirectory, 'trackerOutputLimiter.worklet.js'));
process.once('exit', () => fs.rmSync(previewBundleDirectory, { recursive: true, force: true }));
const previewJs = await import(pathToFileURL(previewBundlePath).href);

const longPatternUpdates = [];
for (let channel = 0; channel < 4; channel += 1) {
  const firstNote = 49 + channel * 2;
  const secondNote = firstNote + 5;
  longPatternUpdates.push(
    { row: 0, channel, patch: { note: firstNote, instrument: 1 } },
    { row: 4, channel, patch: { note: 97, instrument: 0 } },
    { row: 32, channel, patch: { note: secondNote, instrument: 1 } },
    { row: 36, channel, patch: { note: 97, instrument: 0 } },
  );
}

let moduleBytes = trackerJs.updateXmPatternEvents(templateJs.createXmBeatTemplate(), 0, longPatternUpdates);
while (trackerJs.parseTrackerModule(moduleBytes, 'xm').patterns < 256) {
  moduleBytes = trackerJs.appendXmPattern(moduleBytes, 0);
}
for (let pattern = 0; pattern < 256; pattern += 1) {
  moduleBytes = trackerJs.resizeXmPatternRows(moduleBytes, pattern, 256);
}
const moduleInfo = trackerJs.parseTrackerModule(moduleBytes, 'xm');
assert.equal(moduleInfo.orders, 256);
assert.equal(moduleInfo.patterns, 256);

const heapBefore = process.memoryUsage().heapUsed;
const parseStarted = performance.now();
const rows = trackerJs.parseTrackerPlaybackRows(moduleBytes, 'XM', 65_536);
const parseMs = performance.now() - parseStarted;
assert.equal(rows.length, 65_536, 'the maximum-order 256-row XM track should expand without truncation');

const sourceStarted = performance.now();
const sourceDocument = trackerJs.createMusicEditorSourceDocument(moduleBytes, 'long-song.xm');
const sourceMs = performance.now() - sourceStarted;
assert.equal(sourceDocument.patterns.length, 256);
assert.equal(sourceDocument.order.length, 256);
assert.ok(sourceDocument.patterns.every(pattern => pattern.rows === 256));
assert.equal(sourceDocument.patterns.reduce((sum, pattern) => sum + pattern.notes.length, 0), 2_048);

let pitchRampCalls = 0;
const fakeOscillators = [];
class FakeParam {
  value = 0;
  values = [];
  setValueAtTime(value) { this.value = value; this.values.push(value); }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class FakeFrequencyParam extends FakeParam {
  linearRampToValueAtTime(value) { pitchRampCalls += 1; this.value = value; }
}
class FakeNode {
  connect(target) { return target; }
  disconnect() {}
  addEventListener() {}
  start() {}
  stop() {}
}
class FakeAudioWorkletNode extends FakeNode { port = { postMessage() {} }; }
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakePanner extends FakeNode { pan = new FakeParam(); }
class FakeOscillator extends FakeNode { frequency = new FakeFrequencyParam(); type = 'sine'; }
class FakeAudioContext {
  currentTime = 0;
  destination = new FakeNode();
  audioWorklet = { async addModule() {} };
  async resume() {}
  async suspend() {}
  async close() {}
  createGain() { return new FakeGain(); }
  createStereoPanner() { return new FakePanner(); }
  createOscillator() { const oscillator = new FakeOscillator(); fakeOscillators.push(oscillator); return oscillator; }
}
globalThis.AudioWorkletNode = FakeAudioWorkletNode;
let lastSchedulerYield = performance.now();
let maxSchedulerChunkMs = 0;
globalThis.window = {
  AudioContext: FakeAudioContext,
  setTimeout(callback, delay) {
    maxSchedulerChunkMs = Math.max(maxSchedulerChunkMs, performance.now() - lastSchedulerYield);
    return setTimeout(() => {
      lastSchedulerYield = performance.now();
      callback();
    }, delay);
  },
};
const previewPlayer = new previewJs.TrackerPreviewPlayer();
const emptyRows = Array.from({ length: 65_536 }, () => []);
const emptyPreviewStarted = performance.now();
const emptyDurationMs = await previewPlayer.play(emptyRows, moduleInfo.channels, moduleInfo.speed, moduleInfo.tempo, [], new Map(), 'XM');
const emptyPreviewMs = performance.now() - emptyPreviewStarted;
previewPlayer.stop();
assert.ok(emptyDurationMs > 1_000_000, 'the silent preview duration should cover the complete long song');
const previewStarted = performance.now();
const durationMs = await previewPlayer.play(rows, moduleInfo.channels, moduleInfo.speed, moduleInfo.tempo, [], new Map(), 'XM');
const previewMs = performance.now() - previewStarted;
previewPlayer.stop();
assert.ok(durationMs > 1_000_000, 'the preview duration should cover the complete long song');
assert.ok(previewMs < 10_000, `long-song preview scheduling took too long: ${previewMs.toFixed(1)} ms`);
assert.ok(maxSchedulerChunkMs < 50, `long-song preview blocked the event loop for ${maxSchedulerChunkMs.toFixed(1)} ms`);
assert.equal(pitchRampCalls, 0, 'notes without pitch effects should not enqueue redundant frequency ramps');
await previewPlayer.play([[{ note: 49, instrument: 1, volume: 0, effect: 4, parameter: 0x47 }]], moduleInfo.channels, moduleInfo.speed, moduleInfo.tempo, [], new Map(), 'XM');
assert.ok(pitchRampCalls > 0, 'vibrato notes should still schedule frequency ramps');
assert.equal(fakeOscillators.at(-1).frequency.values[0], 440, 'synthesized note frequency should start in Hz');
previewPlayer.stop();

const heapDeltaMb = Math.max(0, process.memoryUsage().heapUsed - heapBefore) / (1024 * 1024);
assert.ok(heapDeltaMb < 512, `long-song parse and preview retained too much heap: ${heapDeltaMb.toFixed(1)} MiB`);
console.log(`Maximum XM track: ${rows.length} rows, ${sourceDocument.patterns.length} patterns, ${sourceDocument.patterns.reduce((sum, pattern) => sum + pattern.notes.length, 0)} notes; playback parse ${parseMs.toFixed(1)} ms, source document ${sourceMs.toFixed(1)} ms, silent scheduling ${emptyPreviewMs.toFixed(1)} ms, note scheduling ${previewMs.toFixed(1)} ms, max event-loop chunk ${maxSchedulerChunkMs.toFixed(1)} ms, heap delta ${heapDeltaMb.toFixed(1)} MiB.`);
