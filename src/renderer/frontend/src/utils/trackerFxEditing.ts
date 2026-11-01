export interface TrackerFxCell {
  timelineRow: number;
  effect: number;
  parameter: number;
}
export interface TrackerFxUpdate {
  patternIndex: number;
  row: number;
  channel: number;
  effect: number;
  parameter: number;
}
interface Segment { start: number; end: number; patternIndex: number }

/** Clear sources before placing destinations, so overlapping group moves retain every effect. */
export function trackerFxPlacementUpdates(segments: Segment[], channel: number, cells: TrackerFxCell[], delta: number, move = false): TrackerFxUpdate[] {
  const updates = new Map<string, TrackerFxUpdate>();
  const put = (timelineRow: number, effect: number, parameter: number) => {
    const segment = segments.find(item => timelineRow >= item.start && timelineRow < item.end);
    if (!segment) return;
    const row = timelineRow - segment.start;
    updates.set(`${segment.patternIndex}:${row}:${channel}`, { patternIndex: segment.patternIndex, row, channel, effect, parameter });
  };
  if (move) cells.forEach(cell => put(cell.timelineRow, 0, 0));
  cells.forEach(cell => put(cell.timelineRow + delta, cell.effect, cell.parameter));
  return [...updates.values()];
}

export function clampTrackerFxDelta(cells: TrackerFxCell[], delta: number, rowCount: number): number {
  if (!cells.length) return 0;
  return Math.max(-Math.min(...cells.map(cell => cell.timelineRow)),
    Math.min(rowCount - 1 - Math.max(...cells.map(cell => cell.timelineRow)), Math.round(delta)));
}
