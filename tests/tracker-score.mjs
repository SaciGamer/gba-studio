import assert from 'node:assert/strict';
import path from 'node:path';
import { build } from 'esbuild';

const result = await build({ entryPoints: [path.resolve('src/renderer/frontend/src/utils/trackerScore.ts')], bundle: true, write: false, platform: 'node', format: 'esm' });
const score = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const event = (note = 0, effect = 0, parameter = 0) => ({ note, effect, parameter, instrument: 1, volume: 0 });
for (const format of ['MOD', 'XM', 'S3M', 'IT']) {
  const rows = Array.from({ length: 16 }, () => [event(), event()]);
  rows[0][0] = event(49);
  rows[4][0] = event(53);
  rows[8][0] = event(97);
  let timing = score.trackerScoreTiming(rows, format, { bpm: 125, speed: 6 });
  assert.equal(timing.ticks, 96);
  let notes = score.trackerScoreNotes(rows, timing.rows, 0, format);
  assert.deepEqual(notes.map(note => [note.start, note.end]), [[0, 24], [24, 48]]);
  assert.equal(score.scoreRhythm(notes[0].end - notes[0].start).exact, true);
  // Global timing commands on a different channel change this channel's score.
  rows[4][1] = event(0, format === 'MOD' || format === 'XM' ? 15 : 1, 3);
  rows[8][1] = event(0, format === 'MOD' || format === 'XM' ? 15 : 20, 150);
  timing = score.trackerScoreTiming(rows, format, { bpm: 125, speed: 6 });
  assert.equal(timing.rows[4].speed, 3);
  assert.equal(timing.rows[4].ticks, 3);
  assert.equal(timing.rows[8].bpm, 150);
  assert.ok(timing.rows[8].duration < timing.rows[4].duration);
  assert.deepEqual(timing.state, { bpm: 150, speed: 3 });
  const next = score.trackerScoreTiming([[event()]], format, timing.state);
  assert.equal(next.rows[0].speed, 3, 'tempo carries across preceding patterns');
  const extended = format === 'MOD' || format === 'XM' ? 14 : 19;
  const delayed = [[event(49, extended, 0xd2)], [event(0, extended, 0xc3)], [event()]];
  timing = score.trackerScoreTiming(delayed, format, { bpm: 125, speed: 6 });
  notes = score.trackerScoreNotes(delayed, timing.rows, 0, format);
  assert.deepEqual(notes.map(note => [note.start, note.end]), [[2, 9]], 'delays and cuts use tick positions');
  assert.equal(notes[0].duration, timing.rows[1].seconds + timing.rows[1].tickSeconds[3] - timing.rows[0].tickSeconds[2]);
  const held = score.trackerScoreTiming([[event(49, extended, 0xe2)]], format, { bpm: 125, speed: 6 });
  assert.equal(held.ticks, 18, 'pattern delay extends the written row');
}
const slide = score.trackerScoreTiming([[event(49, 20, 0x11)]], 'IT', { bpm: 125, speed: 6 });
assert.equal(slide.state.bpm, 130);
assert.ok(slide.rows[0].tickSeconds[2] - slide.rows[0].tickSeconds[1] < slide.rows[0].tickSeconds[1]);
for (const pitch of [1, 13, 25, 37, 49, 61, 73, 85, 96]) assert.equal(score.scoreYToPitch(score.scorePitchY(pitch)), pitch);
assert.equal(score.scorePitchY(49), 160, 'middle C lies between the staves');
assert.equal(score.scoreYToPitch(160, true), 50);
assert.equal(score.scoreRhythm(36).dotted, true);
for (let ticks = 1; ticks <= 384; ticks++) {
  const parts = score.scoreDurationParts(7, 7 + ticks);
  assert.equal(parts.reduce((sum, part) => sum + part.ticks, 0), ticks, 'notation preserves the exact duration');
  assert.ok(parts.every(part => score.scoreRhythm(part.ticks).exact), 'every fragment has a conventional note value or explicit tuplet');
  assert.ok(parts.every((part, index) => !index || parts[index - 1].start + parts[index - 1].ticks === part.start));
}
assert.deepEqual(score.scoreDurationParts(0, 7).map(part => part.ticks), [6, 1]);
assert.equal(score.scoreRhythm(1).tuplet, true);
assert.equal(score.scoreRhythm(2).tuplet, true);
assert.equal(score.scoreRhythm(1).flags, 4);
console.log('Score timing, global BPM/speed, inheritance, tempo slides, delays, cuts, rhythm and staff pitch mapping pass in MOD/XM/S3M/IT.');
