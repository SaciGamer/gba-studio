import { formatNumericValue } from '../../../../../shared/numericValues';
import type { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';

export function motionEventTitle(event: IScriptsElement, label: (command: string) => string): string {
  const aliases: Record<string, string> = { EVENT_CAMERA_MOVE_TO: 'EVENT_PAN_CAMERA', EVENT_ACTOR_MOVE_TO: 'EVENT_MOVE_ACTOR' };
  const command = aliases[event.command] ?? event.command;
  if (!['EVENT_PAN_CAMERA', 'EVENT_MOVE_ACTOR'].includes(command)) return label(event.command);
  const args = event.args as any;
  const animated = args?.animated ?? Boolean(aliases[event.command]);
  return label(command) + (animated ? ` To {${formatNumericValue(args?.x ?? 0)}, ${formatNumericValue(args?.y ?? 0)}}` : '');
}
