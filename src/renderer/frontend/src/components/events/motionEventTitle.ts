import { formatNumericValue, type NumericValue } from '../../../../../shared/numericValues';
import type { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';

function formatMotionValue(value: unknown, actorName: (id: string) => string): string {
  if (value && typeof value === 'object') {
    const node = value as NumericValue;
    if (node.kind === 'property') return `${node.actorId === '__SELF__' ? 'self' : actorName(node.actorId)}.${node.property}`;
    if (node.kind === 'expression') {
      const symbol = { add: '+', subtract: '−', multiply: '×', divide: '÷', min: 'min', max: 'max', abs: 'abs' }[node.operation];
      const left = formatMotionValue(node.left, actorName);
      return node.right
        ? `(${left} ${symbol ?? '?'} ${formatMotionValue(node.right, actorName)})`
        : `${symbol ?? '?'}(${left})`;
    }
  }
  return formatNumericValue(value);
}

export function motionEventTitle(
  event: IScriptsElement,
  label: (command: string) => string,
  actorName: (id: string) => string = id => typeof id === 'string' && id.length > 0 ? id.slice(0, 8) : '?',
  actorAnimationTitle?: (actorId: string) => string,
): string {
  const aliases: Record<string, string> = { EVENT_CAMERA_MOVE_TO: 'EVENT_PAN_CAMERA', EVENT_ACTOR_MOVE_TO: 'EVENT_MOVE_ACTOR' };
  const command = aliases[event.command] ?? event.command;
  if (event.command === 'EVENT_ACTOR_SET_ANIMATION') {
    const actorId = typeof event.args?.actorId === 'string' ? event.args.actorId : '';
    return actorAnimationTitle?.(actorId) ?? `Actor ${actorName(actorId)} Animation`;
  }
  if (!['EVENT_PAN_CAMERA', 'EVENT_MOVE_ACTOR'].includes(command)) return label(event.command);
  const args = event.args as any;
  const animated = args?.animated ?? Boolean(aliases[event.command]);
  return label(command) + (animated ? ` → {${formatMotionValue(args?.x ?? 0, actorName)}, ${formatMotionValue(args?.y ?? 0, actorName)}}` : '');
}
