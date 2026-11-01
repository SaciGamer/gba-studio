import type { ScoreRow } from './trackerScore';
export type KeyboardGestureMode = 'notes' | 'portamento' | 'vibrato' | 'arpeggio';
export interface KeyboardTouch { pitch: number; seconds: number }
export interface KeyboardGestureResult {
  notes: Array<{ start: number; end: number; note: number; channel: number; instrument: number; patternIndex?: number }>;
  effects: Array<{ row: number; channel: number; effect: number; parameter: number }>;
  arpeggioOverflow?: boolean;
}
export function buildKeyboardGesture(touches: KeyboardTouch[], seconds: number, start: number, minimumLength: number,
  timing: ScoreRow[], mode: KeyboardGestureMode, format: string, channel: number, instrument: number): KeyboardGestureResult {
  const result: KeyboardGestureResult = { notes: [], effects: [] };
  if (!touches.length || !timing[start]) return result;
  const origin = timing[start].seconds;
  const at = (elapsed: number) => {
    const index = timing.findIndex(row => row.seconds >= origin + elapsed);
    return index < 0 ? timing.length : index;
  };
  const end = Math.min(timing.length, Math.max(start + Math.max(1, minimumLength), at(seconds)));
  const modXm = format === 'MOD' || format === 'XM';
  if (mode === 'arpeggio') {
    const pitches = [...new Set(touches.map(touch => touch.pitch))].sort((a, b) => a - b);
    if (pitches.length > 3 || pitches.at(-1)! - pitches[0] > 15) result.arpeggioOverflow = true;
    else {
      result.notes.push({ start, end, note: pitches[0], channel, instrument });
      const parameter = ((pitches[1] ?? pitches[0]) - pitches[0]) << 4 | (pitches[2] ?? pitches[0]) - pitches[0];
      for (let row = start; row < end && parameter; row++) result.effects.push({ row, channel, effect: modXm ? 0 : 10, parameter });
      return result;
    }
  }
  if (mode === 'vibrato') {
    result.notes.push({ start, end, note: touches[0].pitch, channel, instrument });
    const depth = Math.min(15, Math.max(1, Math.max(...touches.map(touch => Math.abs(touch.pitch - touches[0].pitch))) * 4));
    const rate = Math.min(15, Math.max(1, Math.round((touches.length - 1) / Math.max(.15, seconds) * 2)));
    if (touches.length > 1) for (let row = start; row < end; row++) result.effects.push({ row, channel, effect: modXm ? 4 : 8, parameter: rate << 4 | depth });
    return result;
  }
  let previous = start - 1;
  for (const touch of touches) {
    const row = Math.max(start, previous + 1, at(touch.seconds));
    if (row >= timing.length) break;
    if (result.notes.length) result.notes.at(-1)!.end = row;
    result.notes.push({ start: row, end: Math.min(timing.length, Math.max(row + 1, end)), note: touch.pitch, channel, instrument });
    if (mode === 'portamento' && previous >= start) result.effects.push({ row, channel, effect: modXm ? 3 : 7,
      parameter: Math.min(255, Math.max(1, Math.abs(touch.pitch - result.notes.at(-2)!.note) * 4)) });
    previous = row;
  }
  return result;
}
