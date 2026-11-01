import type { TrackerModuleInfo, TrackerPatternEvent, TrackerPatternEventUpdate } from './trackerModule';

export type TrackerRollFormat = Extract<TrackerModuleInfo['format'], 'MOD' | 'S3M' | 'IT'>;
export type TrackerRollNote = { row: number; channel: number; pitch: number; instrument: number; end: number };

export const trackerPeriodToPitch = (period: number) => Math.max(37, Math.min(72, Math.round(49 + 12 * Math.log2(428 / period))));
const modPeriods = [856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453, 428, 404, 381, 360, 339, 320, 302, 285, 269, 254, 240, 226, 214, 202, 190, 180, 170, 160, 151, 143, 135, 127, 120, 113];
export const trackerPitchToPeriod = (pitch: number) => modPeriods[Math.max(37, Math.min(72, Math.trunc(pitch))) - 37];
export function trackerStoredNoteToPitch(format: TrackerRollFormat, note: number): number {
  if (format === 'IT') return Number.isInteger(note) && note >= 0 && note <= 119 ? note + 1 : 0;
  if (note <= 0) return 0;
  if (format !== 'S3M') return note <= 120 ? note : 0;
  const semitone = note & 0x0f;
  const pitch = (note >> 4) * 12 + semitone + 1;
  return note < 0xf0 && semitone < 12 && pitch <= 120 ? pitch : 0;
}
export function trackerPitchToStoredNote(format: TrackerRollFormat, pitch: number): number {
  if (format === 'IT') return Math.max(0, Math.min(119, Math.trunc(pitch) - 1));
  if (format !== 'S3M') return Math.max(1, Math.min(120, Math.trunc(pitch)));
  const zeroBased = Math.max(0, Math.min(119, Math.trunc(pitch) - 1));
  return ((zeroBased / 12) | 0) << 4 | (zeroBased % 12);
}

export function buildTrackerPianoEdit(format: TrackerRollFormat, rows: TrackerPatternEvent[][], channel: number, oldNote: TrackerRollNote | null, start: number, end: number, pitch: number, instrument: number): { updates: TrackerPatternEventUpdate[]; warning?: string } {
  channel = oldNote?.channel ?? channel;
  const startRow = Math.max(0, Math.min(rows.length - 1, Math.trunc(start)));
  let endRow = Math.max(startRow + 1, Math.min(rows.length, Math.trunc(end)));
  const isNote = (event: TrackerPatternEvent | undefined) => Boolean(event && (format === 'MOD' ? event.note > 0
    : format === 'IT' ? (event.notePresent ?? event.instrument > 0) && trackerStoredNoteToPitch(format, event.note) > 0
      : trackerStoredNoteToPitch(format, event.note) > 0));
  const updates: TrackerPatternEventUpdate[] = [];
  if (oldNote) {
    updates.push({ row: oldNote.row, channel: oldNote.channel, patch: { note: 0, instrument: 0 } });
    if (oldNote.end < rows.length) {
      const previousRelease = rows[oldNote.end]?.[oldNote.channel];
      if (format === 'MOD' && previousRelease?.effect === 14 && (previousRelease.parameter >> 4) === 12) {
        updates.push({ row: oldNote.end, channel: oldNote.channel, patch: { effect: 0, parameter: 0 } });
      } else if (format !== 'MOD' && previousRelease?.note === 254) {
        updates.push({ row: oldNote.end, channel: oldNote.channel, patch: { note: 0, instrument: 0 } });
      }
    }
  }
  // A note already sounding in this channel must release when the new note
  // starts. Otherwise its duration continues through the new note.
  if (!oldNote) {
    for (let row = startRow - 1; row >= 0; row -= 1) {
      const previous = rows[row]?.[channel];
      const previousPitch = format === 'MOD'
        ? previous?.note ? trackerPeriodToPitch(previous.note) : 0
        : format === 'IT' && !((previous?.notePresent ?? (previous?.instrument ?? 0) > 0)) ? 0
          : trackerStoredNoteToPitch(format, previous?.note ?? 0);
      if (!previous || !previousPitch) continue;

      let previousEnd = Math.min(rows.length, row + 4);
      for (let index = row + 1; index < rows.length; index += 1) {
        const next = rows[index]?.[channel];
        if (format === 'MOD' && next?.effect === 14 && (next.parameter >> 4) === 12) { previousEnd = index; break; }
        if (format !== 'MOD' && next && (next.note === 254 || format === 'IT' && next.note >= 254)) { previousEnd = index; break; }
        const nextPitch = format === 'MOD' ? next?.note ? trackerPeriodToPitch(next.note) : 0
          : format === 'IT' && !((next?.notePresent ?? (next?.instrument ?? 0) > 0)) ? 0
            : trackerStoredNoteToPitch(format, next?.note ?? 0);
        if (nextPitch) { previousEnd = index; break; }
      }
      if (previousEnd <= startRow) break;
      if (format === 'MOD') {
        const priorCut = rows[previousEnd]?.[channel];
        if (previousEnd < rows.length && priorCut?.effect === 14 && (priorCut.parameter >> 4) === 12) updates.push({ row: previousEnd, channel, patch: { effect: 0, parameter: 0 } });
        updates.push({ row: startRow, channel, patch: { effect: 14, parameter: 0xc0 } });
      } else {
        if (previousEnd < rows.length && rows[previousEnd]?.[channel]?.note === 254) updates.push({ row: previousEnd, channel, patch: { note: 0, instrument: 0 } });
        updates.push({ row: startRow, channel, patch: { note: 254, instrument: 0 } });
      }
      break;
    }
  }
  const destination = rows[startRow]?.[channel];
  const occupied = Boolean(destination && (isNote(destination) || destination.note === 254 || destination.instrument || destination.volume || destination.effect || destination.parameter));
  if (occupied && !(oldNote?.row === startRow && oldNote.channel === channel)) {
    // Placing a note on an occupied row is an edit: replace the row contents.
    updates.push({ row: startRow, channel, patch: { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 } });
    if (destination && isNote(destination)) {
      let displacedEnd = Math.min(rows.length, startRow + 4);
      for (let index = startRow + 1; index < rows.length; index += 1) {
        const next = rows[index]?.[channel];
        if (format === 'MOD' && next?.effect === 14 && (next.parameter >> 4) === 12 || format !== 'MOD' && next?.note === 254) { displacedEnd = index; break; }
        if (isNote(next)) { displacedEnd = index; break; }
      }
      const release = rows[displacedEnd]?.[channel];
      if (displacedEnd < rows.length && (format === 'MOD' ? release?.effect === 14 && (release.parameter >> 4) === 12 : release?.note === 254)) {
        updates.push(format === 'MOD'
          ? { row: displacedEnd, channel, patch: { effect: 0, parameter: 0 } }
          : { row: displacedEnd, channel, patch: { note: 0, instrument: 0 } });
      }
    }
  }
  // Retain the portion of a displaced note extending past the destination.
  let tail: TrackerPatternEvent | undefined;
  for (let index = endRow - 1; index >= 0; index -= 1) {
    const event = rows[index]?.[channel];
    const cut = format === 'MOD' ? event?.effect === 14 && (event.parameter >> 4) === 12 : event?.note === 254;
    if (cut) break;
    if (!isNote(event)) continue;
    if (oldNote?.row === index) break;
    let noteEnd = Math.min(rows.length, index + 4);
    for (let next = index + 1; next < rows.length; next += 1) {
      const nextEvent = rows[next]?.[channel];
      const nextCut = format === 'MOD' ? nextEvent?.effect === 14 && (nextEvent.parameter >> 4) === 12 : nextEvent?.note === 254;
      if (isNote(nextEvent) || nextCut) { noteEnd = next; break; }
    }
    if (noteEnd > endRow && !isNote(rows[endRow]?.[channel])) tail = event;
    break;
  }
  for (let index = startRow; index < endRow; index += 1) {
    const event = rows[index]?.[channel];
    const cut = format === 'MOD' && event?.effect === 14 && (event.parameter >> 4) === 12;
    if (event && (isNote(event) || event.note === 254 || cut)) updates.push({
      row: index, channel, patch: { note: 0, instrument: 0, volume: 0, ...(cut ? { effect: 0, parameter: 0 } : {}) },
    });
  }
  if (endRow < rows.length) {
    const release = rows[endRow]?.[channel];
    if (format === 'MOD' && !isNote(release) && !tail && (release && release.effect !== 0 && !(release.effect === 14 && (release.parameter >> 4) === 12))) {
      return { updates: [], warning: 'The duration cannot cross an existing MOD event at its note cut row.' };
    }
  }
  const storedPitch = format === 'MOD' ? trackerPitchToPeriod(pitch) : trackerPitchToStoredNote(format, pitch);
  updates.push({ row: startRow, channel, patch: { note: storedPitch, instrument } });
  if (tail && endRow < rows.length) updates.push({ row: endRow, channel, patch: { ...tail } });
  else if (endRow < rows.length && !isNote(rows[endRow]?.[channel])) updates.push(format === 'MOD'
    ? { row: endRow, channel, patch: { effect: 14, parameter: 0xc0 } }
    : { row: endRow, channel, patch: { note: 254, instrument: 0 } });
  return { updates };
}
