import type { TrackerPatternEvent, TrackerPatternEventUpdate } from './trackerModule';
import { decodeTrackerNoteEffects, trackerNoteEffectCatalog } from './trackerNoteEffects';
import { trackerScoreNotes, trackerScoreTiming, type ScoreTimingState } from './trackerScore';

/** Delete a written note and its note-scoped Fx, retaining global/sequence commands. */
export function trackerScoreDeletion(rows: TrackerPatternEvent[][], format: string, cells: readonly { row: number; channel: number }[], initial: ScoreTimingState) {
  const timing = trackerScoreTiming(rows, format, initial).rows;
  const catalog = trackerNoteEffectCatalog(format);
  const updates = new Map<string, TrackerPatternEventUpdate>();
  const clearNote = { note: 0, instrument: 0, volume: 0, notePresent: false, instrumentPresent: false, volumePresent: false };
  const stage = (row: number, channel: number, patch: Partial<TrackerPatternEvent>) => {
    const key = `${row}:${channel}`;
    updates.set(key, { row, channel, patch: { ...updates.get(key)?.patch, ...patch } });
  };
  const byChannel = new Map<number, ReturnType<typeof trackerScoreNotes>>();
  for (const cell of cells) {
    if (!byChannel.has(cell.channel)) byChannel.set(cell.channel, trackerScoreNotes(rows, timing, cell.channel, format));
    const note = byChannel.get(cell.channel)!.find(note => note.row === cell.row);
    if (!note) continue;
    stage(cell.row, cell.channel, clearNote);
    for (let row = cell.row; row < rows.length && timing[row].tick <= note.end; row++) {
      const event = rows[row]?.[cell.channel];
      if (!event) continue;
      if (row > cell.row && event.note >= 1 && event.note <= 96) break;
      const choices = decodeTrackerNoteEffects(format, event.effect, event.parameter);
      const definitions = choices.map(choice => catalog.find(definition => definition.id === choice.id));
      const release = event.note >= 97 && event.note <= 99;
      const cut = definitions.some(definition => definition?.name === 'noteCut' || definition?.name === 'noteOff');
      if (timing[row].tick === note.end && !release && !cut) break;
      if (choices.length && definitions.every(definition => definition?.scope === 'note')) stage(row, cell.channel, { effect: 0, parameter: 0 });
      if (release) { stage(row, cell.channel, clearNote); break; }
    }
  }
  return [...updates.values()];
}
