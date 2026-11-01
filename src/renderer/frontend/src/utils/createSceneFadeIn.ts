import { v4 as uuidv4 } from 'uuid';
import { EVENT_DEFAULTS } from '../../../../shared/events/eventCatalog';
import { EEvents } from '@/components/events/interfaces/IEvents';
import type { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';

export function createSceneFadeIn(): IScriptsElement {
  return { id: uuidv4(), command: EEvents.FADE_IN, args: { ...(EVENT_DEFAULTS.EVENT_FADE_IN as Record<string, unknown>), __automatic: true, __comment: false } };
}

/** The first Fade In owns the automatic role; later fades keep their order and settings. */
export function reconcileSceneFadeIn(previous: readonly IScriptsElement[], next: IScriptsElement[]): IScriptsElement[] {
  const isFade = (event: IScriptsElement) => event.command === EEvents.FADE_IN;
  const first = next.find(isFade);
  if (!first) return previous.some(isFade) ? [createSceneFadeIn(), ...next] : next;
  let changed = false;
  const reconciled = next.map(event => {
    if (!isFade(event)) return event;
    const automatic = event === first;
    if ((event.args?.__automatic === true) === automatic) return event;
    changed = true;
    const args = { ...event.args };
    if (automatic) args.__automatic = true;
    else delete args.__automatic;
    return { ...event, args };
  });
  return changed ? reconciled : next;
}
