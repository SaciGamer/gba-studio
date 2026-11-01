import { coordinateScale } from '../../../../../shared/events/coordinateUnits';

export type FacingPreviewActor = { x: number; y: number; direction: string; name: string };
type Point = [number, number];

function distance(args: Record<string, any>, field: string): number | null {
  const raw = args[field] ?? 0;
  const value = typeof raw === 'number' ? raw
    : raw && (raw.kind === 'number' || raw.kind === 'literal' || raw.type === 'number') ? raw.value : null;
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value)) * coordinateScale(args, field) : null;
}

/** Clip a directional sector using the same dominant-axis rules as actor_is_facing. */
function clip(points: Point[], a: number, b: number, c: number): Point[] {
  const output: Point[] = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const first = a * point[0] + b * point[1] - c;
    const second = a * next[0] + b * next[1] - c;
    if (first <= 0) output.push(point);
    if ((first <= 0) !== (second <= 0)) {
      const ratio = first / (first - second);
      output.push([point[0] + (next[0] - point[0]) * ratio, point[1] + (next[1] - point[1]) * ratio]);
    }
  });
  return output;
}

export function facingTargetPreview(args: Record<string, any>, source: FacingPreviewActor | null, target: FacingPreviewActor | null) {
  const lookX = args.lookX !== false, lookY = args.lookY !== false;
  const distanceX = lookX ? distance(args, 'distanceX') : 0;
  const distanceY = lookY ? distance(args, 'distanceY') : 0;
  const dx = source && target ? target.x - source.x : 0;
  const dy = source && target ? target.y - source.y : 0;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const dynamic = distanceX === null || distanceY === null;
  let matches: boolean | null = null;
  const direction = source?.direction ?? 'right';
  if (!lookX && !lookY) matches = false;
  else if (source && target && !dynamic) {
    const inRange = (!lookX || !distanceX || ax <= distanceX) && (!lookY || !distanceY || ay <= distanceY);
    matches = inRange && (
      lookX && dx !== 0 && (!lookY || ax >= ay) && direction === (dx > 0 ? 'right' : 'left') ||
      lookY && dy !== 0 && (!lookX || ay >= ax) && direction === (dy > 0 ? 'down' : 'up')
    );
  }
  const scale = Math.min(1, 104 / Math.max(1, ax, distanceX ?? 0), 64 / Math.max(1, ay, distanceY ?? 0));
  const width = Math.min(120 / scale, distanceX || Infinity);
  const height = Math.min(80 / scale, distanceY || Infinity);
  let polygon: Point[] = [[-width, -height], [width, -height], [width, height], [-width, height]];
  if (dynamic || !lookX && !lookY || ['left', 'right'].includes(direction) && !lookX || ['up', 'down'].includes(direction) && !lookY) polygon = [];
  else {
    const planes: Record<string, Point[]> = {
      right: [[-1, 0], [-1, 1], [-1, -1]], left: [[1, 0], [1, 1], [1, -1]],
      down: [[0, -1], [1, -1], [-1, -1]], up: [[0, 1], [1, 1], [-1, 1]],
    };
    const boundaries = planes[direction] ?? [];
    for (const [a, b] of lookX && lookY ? boundaries : boundaries.slice(0, 1)) polygon = clip(polygon, a, b, 0);
  }
  return { matches, dynamic, distanceX, distanceY, scale, dx, dy,
    points: polygon.map(([x, y]) => `${120 + x * scale},${80 + y * scale}`).join(' ') };
}
