import type { TrackerPatternEvent } from './trackerModule';
import { maxmodGbaTickDurationSeconds } from './trackerMaxmodTiming';

export const SCORE_QUARTER_TICKS = 24;
const pitchNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const scorePitchLabel = (pitch: number) => `${pitchNames[(pitch - 1) % 12]}${Math.floor((pitch - 1) / 12)}`;
export interface ScoreRow { tick: number; ticks: number; seconds: number; duration: number; bpm: number; speed: number; tickSeconds: number[] }
export interface ScoreNote { row: number; pitch: number; start: number; end: number; seconds: number; duration: number }
export interface ScoreTimingState { bpm: number; speed: number }

/** Written order, without expanding sequence jumps/loops. One quarter = 24 tracker ticks. */
export function trackerScoreTiming(rows: TrackerPatternEvent[][], format: string, initial: ScoreTimingState) {
  let bpm = initial.bpm || 125, speed = initial.speed || 6, tick = 0, seconds = 0;
  const result: ScoreRow[] = [];
  const modXm = format === 'MOD' || format === 'XM';
  for (const row of rows) {
    const slides: number[] = [];
    let delay = 0, fineDelay = 0;
    for (const event of row) {
      if (!event) continue;
      const { effect, parameter } = event;
      if (modXm && effect === 15 && parameter > 0) {
        if (parameter < 32) speed = parameter; else bpm = parameter;
      } else if (!modXm && effect === 1 && parameter > 0) speed = parameter;
      else if (!modXm && effect === 20) {
        if (parameter >= 32) bpm = parameter; else slides.push(parameter);
      }
      if (effect === (modXm ? 14 : 19) && parameter >> 4 === 14 && !delay) delay = parameter & 15;
      if (!modXm && effect === 19 && parameter >> 4 === 6) fineDelay += parameter & 15;
    }
    const ticks = speed * (1 + delay) + fineDelay;
    const startBpm = bpm;
    let duration = 0;
    const tickSeconds = [0];
    for (let index = 0; index < ticks; index++) {
      if (index > 0) for (const slide of slides) bpm = Math.max(32, Math.min(255, bpm + (slide < 16 ? -slide : slide & 15)));
      duration += maxmodGbaTickDurationSeconds(bpm);
      tickSeconds.push(duration);
    }
    result.push({ tick, ticks, seconds, duration, bpm: startBpm, speed, tickSeconds });
    tick += ticks; seconds += duration;
  }
  return { rows: result, ticks: tick, seconds, state: { bpm, speed } };
}

export function trackerScoreNotes(rows: TrackerPatternEvent[][], timing: ScoreRow[], channel: number, format: string): ScoreNote[] {
  const notes: ScoreNote[] = [];
  const modXm = format === 'MOD' || format === 'XM';
  let active: ScoreNote | undefined;
  const at = (row: number, offset = 0) => {
    const time = timing[row];
    const ticks = Math.max(0, Math.min(time.ticks, offset));
    return { tick: time.tick + ticks, seconds: time.seconds + time.tickSeconds[ticks] };
  };
  const finish = (row: number, offset = 0) => {
    if (!active) return;
    const end = at(row, offset);
    active.end = end.tick; active.duration = Math.max(0, end.seconds - active.seconds);
    if (active.end > active.start) notes.push(active);
    active = undefined;
  };
  rows.forEach((row, index) => {
    const event = row[channel];
    if (!event || !timing[index]) return;
    const extended = event.effect === (modXm ? 14 : 19);
    const command = extended ? event.parameter >> 4 : -1;
    const offset = command === 13 ? event.parameter & 15 : 0;
    if (event.note >= 1 && event.note <= 96 && offset < timing[index].speed) {
      finish(index, offset);
      const start = at(index, offset);
      active = { row: index, pitch: event.note, start: start.tick, end: start.tick, seconds: start.seconds, duration: 0 };
    } else if (event.note >= 97 && event.note <= 99) finish(index);
    if (command === 12 && (event.parameter & 15) < timing[index].speed) finish(index, event.parameter & 15);
    if (format === 'XM' && event.effect === 20 && event.parameter < timing[index].speed) finish(index, event.parameter);
  });
  if (active && timing.length) finish(timing.length - 1, timing.at(-1)!.ticks);
  return notes;
}

const naturalSteps = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const naturalSemitones = [0, 2, 4, 5, 7, 9, 11];
export const scorePitchStep = (pitch: number) => Math.floor((pitch - 1) / 12) * 7 + naturalSteps[(pitch - 1) % 12];
export const scoreStepPitch = (step: number, sharp = false) => Math.max(1, Math.min(96,
  Math.floor(step / 7) * 12 + naturalSemitones[((step % 7) + 7) % 7] + 1 + (sharp ? 1 : 0)));
export const scorePitchY = (pitch: number) => 160 - (scorePitchStep(pitch) - 28) * 5;
export const scoreYToPitch = (y: number, sharp = false) => scoreStepPitch(Math.round(28 + (160 - y) / 5), sharp);

/** Written values at 24 ticks per quarter; one- and two-tick remainders use 3:2 tuplets. */
export function scoreRhythm(ticks: number) {
  for (const [value, flags] of [[96, -1], [48, 0], [24, 0], [12, 1], [6, 2], [3, 3]] as const) {
    if (ticks === value || ticks === value * 1.5) return { hollow: value >= 48, stem: value < 96, flags, dotted: ticks !== value, exact: true, tuplet: false };
  }
  if (ticks === 1 || ticks === 2) return { hollow: false, stem: true, flags: ticks === 1 ? 4 : 3, dotted: false, exact: true, tuplet: true };
  return { hollow: false, stem: true, flags: 0, dotted: false, exact: false, tuplet: false };
}

export function scoreDurationParts(start: number, end: number): Array<{ start: number; ticks: number }> {
  if (end <= start) return [];
  if (scoreRhythm(end - start).exact) return [{ start, ticks: end - start }];
  const parts = [];
  while (start < end) {
    const ticks = [96, 72, 48, 36, 24, 18, 12, 9, 6, 3, 2, 1].find(value => value <= end - start) ?? end - start;
    parts.push({ start, ticks });
    start += ticks;
  }
  return parts;
}

export const scoreRestParts = scoreDurationParts;
