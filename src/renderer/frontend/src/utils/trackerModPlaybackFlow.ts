import type { TrackerPatternEvent } from './trackerModule';

/** Expand MOD order jumps, pattern breaks and E6x loops into a bounded row sequence. */
export function createModPlaybackSequence(rows: TrackerPatternEvent[][], maxRows = 65_536): number[] {
  const sourceRows: number[] = [];
  const loopStarts = new Map<string, number>();
  const loopRepeats = new Map<string, number>();
  let sourceRow = 0;

  while (sourceRow >= 0 && sourceRow < rows.length && sourceRows.length < maxRows) {
    sourceRows.push(sourceRow);
    const order = Math.floor(sourceRow / 64);
    const localRow = sourceRow % 64;
    let jumpOrder: number | undefined;
    let breakRow: number | undefined;
    let loopTarget: number | undefined;
    for (let channel = 0; channel < rows[sourceRow].length; channel += 1) {
      const event = rows[sourceRow][channel];
      if (!event) continue;
      const effect = event.effect & 0x0f;
      const parameter = event.parameter & 0xff;
      if (effect === 0x0b) jumpOrder = parameter;
      else if (effect === 0x0d) {
        const bcdRow = (((parameter >> 4) & 0x0f) * 10) + (parameter & 0x0f);
        breakRow = Math.min(63, bcdRow);
      } else if (effect === 0x0e && (parameter >> 4) === 0x06) {
        const key = `${order}:${channel}`;
        const count = parameter & 0x0f;
        if (count === 0) loopStarts.set(key, localRow);
        else {
          const remaining = loopRepeats.get(key) ?? count;
          if (remaining > 0) {
            loopRepeats.set(key, remaining - 1);
            loopTarget = loopStarts.get(key) ?? 0;
          } else loopRepeats.delete(key);
        }
      }
    }
    if (jumpOrder !== undefined || breakRow !== undefined) {
      sourceRow = (jumpOrder ?? order + 1) * 64 + (breakRow ?? 0);
    } else if (loopTarget !== undefined) {
      sourceRow = order * 64 + loopTarget;
    } else sourceRow += 1;
  }
  return sourceRows;
}
