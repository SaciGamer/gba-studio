import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const source = fs.readFileSync(path.resolve('src/renderer/frontend/src/utils/trackerEnvelope.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { trackerEnvelopeFadeoutAt, trackerEnvelopeFrameTimes, trackerEnvelopePanningAt, trackerEnvelopeValueAt } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const frames = trackerEnvelopeFrameTimes(
  [0, 0.48, 0.72],
  [0.08, 0.04, 0.05],
  [6, 6, 6],
  10,
  0,
  10.16,
  10.92,
);
assert.deepEqual(frames.slice(0, 5), [
  { frame: 0, time: 10.16 },
  { frame: 1, time: 10.24 },
  { frame: 2, time: 10.32 },
  { frame: 3, time: 10.4 },
  { frame: 4, time: 10.48 },
], 'envelope frames start on the delayed note and advance on tracker ticks across rows');
assert.equal(frames.at(-1)?.frame, frames.length - 1, 'frame index remains contiguous');
assert.ok(Math.abs(frames.at(-1).time - 10.87) < 1e-9, 'frame timeline stops before the exclusive note end');

const decayingEnvelope = {
  points: [{ tick: 0, value: 64 }, { tick: 3, value: 0 }],
  sustain: 0, loopStart: 0, loopEnd: 1, enabled: true, sustainEnabled: false, loopEnabled: false,
};
assert.equal(trackerEnvelopeValueAt(decayingEnvelope, 0, false), 64);
assert.equal(trackerEnvelopeValueAt(decayingEnvelope, 1, false), 64 - 64 / 3, 'volume decays by envelope frame, not by note duration');
assert.equal(trackerEnvelopeValueAt(decayingEnvelope, 3, false), 0);

const sustainedEnvelope = { ...decayingEnvelope, sustainEnabled: true };
assert.equal(trackerEnvelopeValueAt(sustainedEnvelope, 30, false), 64, 'sustain holds only when its flag is enabled');
assert.equal(trackerEnvelopeValueAt(sustainedEnvelope, 1, true), 64 - 64 / 3, 'released voices leave the sustain point');
assert.equal(trackerEnvelopeValueAt(sustainedEnvelope, 2, 3), 64, 'sustain remains active up to the key-off frame');
assert.equal(trackerEnvelopeValueAt(sustainedEnvelope, 3, 3), 0, 'the envelope leaves sustain at key-off');

const loopedEnvelope = {
  points: [{ tick: 0, value: 0 }, { tick: 1, value: 10 }, { tick: 2, value: 20 }, { tick: 3, value: 30 }],
  sustain: 0, loopStart: 1, loopEnd: 3, enabled: true, sustainEnabled: false, loopEnabled: true,
};
assert.equal(trackerEnvelopeValueAt(loopedEnvelope, 3, false), 30, 'loop endpoint is reached before repeating');
assert.equal(trackerEnvelopeValueAt(loopedEnvelope, 4, false), 10, 'loop repeats from the configured loop start');
assert.equal(trackerEnvelopeValueAt(loopedEnvelope, 6, false), 30, 'loop preserves its configured inclusive endpoint');
assert.equal(trackerEnvelopeValueAt(loopedEnvelope, 4, true), 10, 'an enabled XM envelope loop continues after key-off');
const itSustainLoop = { ...loopedEnvelope, sustainEnabled: true, sustainStart: 1, sustainEnd: 2 };
assert.equal(trackerEnvelopeValueAt(itSustainLoop, 3, false), 10, 'IT sustain loops repeat between their start and end nodes while held');
assert.equal(trackerEnvelopeValueAt(itSustainLoop, 3, true), 30, 'IT sustain loop stops at key-off and resumes the remaining envelope');
assert.equal(trackerEnvelopeValueAt(itSustainLoop, 4, 3), 20, 'IT envelope release continues from the active sustain-loop phase');
assert.equal(trackerEnvelopeFadeoutAt(4096, 2, 3), 1, 'fadeout does not start before key-off');
assert.equal(trackerEnvelopeFadeoutAt(4096, 3, 3), 1, 'fadeout begins from full volume on the key-off frame');
assert.equal(trackerEnvelopeFadeoutAt(4096, 19, 3), 0, 'XM fadeout reaches silence after its documented frame countdown');
assert.equal(trackerEnvelopeFadeoutAt(128, 8, 0, 1024), 0, 'IT fadeout reaches silence using its 1024-based counter');
assert.equal(trackerEnvelopeFadeoutAt(256, 128, 0, 32768), 0, 'XM fadeout reaches silence on the Maxmod 1024/32 conversion scale');
assert.equal(trackerEnvelopePanningAt(0, 0), -1, 'a left envelope value moves a centered sample fully left');
assert.equal(trackerEnvelopePanningAt(0, 64), 1, 'a right envelope value moves a centered sample fully right');
assert.equal(trackerEnvelopePanningAt(-0.5, 64), 0, 'XM panning envelope scales its offset by the remaining pan range');
assert.equal(trackerEnvelopePanningAt(1, 0), 1, 'a panning envelope cannot move beyond an already hard-panned edge');

console.log('Tracker XM/IT envelope timing, loops, and fadeout passed.');
