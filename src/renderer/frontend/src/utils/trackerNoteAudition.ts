import type { TrackerPatternEvent } from './trackerModule';

/** Keep row commands from every channel, but only trigger the selected musical voice. */
export function createTrackerNoteAudition(sourceRows: TrackerPatternEvent[][], displayRows: TrackerPatternEvent[][],
  row: number, channel: number, channels: number, format: 'MOD' | 'XM' | 'S3M' | 'IT',
  speed: number, tempo: number, fallbackInstrument: number, globalVolume = format === 'IT' ? 128 : 64) {
  let instrument = sourceRows[row]?.[channel]?.instrument ?? 0;
  for (let previous = row - 1; !instrument && previous >= 0; previous -= 1) instrument = sourceRows[previous]?.[channel]?.instrument ?? 0;
  for (let previous = 0; previous < row; previous += 1) for (const event of sourceRows[previous] ?? []) {
    if ((format === 'XM' || format === 'MOD') && event.effect === 15 && event.parameter > 0) {
      if (event.parameter < 32) speed = event.parameter;
      else tempo = event.parameter;
    } else if ((format === 'S3M' || format === 'IT') && event.effect === 1 && event.parameter > 0) speed = event.parameter;
    else if ((format === 'S3M' || format === 'IT') && event.effect === 20 && event.parameter >= 32) tempo = event.parameter;
    if (format === 'XM' && event.effect === 16) globalVolume = Math.max(0, Math.min(64, event.parameter));
    else if ((format === 'S3M' || format === 'IT') && event.effect === 22) globalVolume = Math.max(0, Math.min(format === 'IT' ? 128 : 64, event.parameter));
  }
  let end = row + 1;
  while (end < displayRows.length && !displayRows[end]?.[channel]?.note) end += 1;
  const empty = (): TrackerPatternEvent => ({ note: format === 'S3M' ? 255 : 0, instrument: 0, volume: 0,
    effect: 0, parameter: 0, notePresent: false, instrumentPresent: false, volumePresent: false });
  const rows = sourceRows.slice(row, end).map((cells, index) => Array.from({ length: channels }, (_, lane) => lane === channel
    ? { ...(cells[lane] ?? empty()), ...(index === 0 ? { instrument: instrument || fallbackInstrument, instrumentPresent: true } : {}) }
    : { ...(cells[lane] ?? empty()), note: empty().note, instrument: 0, notePresent: false, instrumentPresent: false }));
  return { rows, speed, tempo, globalVolume };
}
