import { getMenuLayoutIssues } from '../menuLayout';
import { getEventPendingFields } from './eventPendingFields';
import { countAssetReferenceAttention, getEventReferenceWarnings } from './sceneReferenceCleanup';
import { getBackgroundCompatibility } from './backgroundCompatibility';

type AttentionEvent = { id?: string; command: string; args?: Record<string, unknown>; children?: { then?: AttentionEvent[]; else?: AttentionEvent[] } };

export function countScriptAttention(script: { events?: readonly AttentionEvent[]; eventGraphs?: Record<string, { nodes?: readonly AttentionEvent[] }> }): number {
  const visited = new Set<string>();
  return [script.events ?? [], ...Object.values(script.eventGraphs ?? {}).map(graph => graph.nodes ?? [])]
    .reduce((total, events) => total + countEventAttention(events, visited), 0);
}

export function countPrefabAttention(prefab: { type: 'actor' | 'trigger'; actor?: AttentionObject; trigger?: AttentionObject }): number {
  const object = prefab.type === 'actor' ? prefab.actor : prefab.trigger;
  if (!object) return 0;
  return countObjectAttention(object);
}

export function countObjectAttention(object: AttentionObject): number {
  const visited = new Set<string>();
  return countAssetReferenceAttention(object) + [object.script, object.onEnterScript, object.onLeaveScript, object.onInteractScript, object.onInitScript, object.onUpdateScript,
    ...Object.values(object.eventGraphs ?? {}).map(graph => graph.nodes)]
    .reduce<number>((total, events) => total + countEventAttention(events ?? [], visited), 0);
}

type AttentionObject = {
  script?: AttentionEvent[];
  onEnterScript?: AttentionEvent[];
  onLeaveScript?: AttentionEvent[];
  onInteractScript?: AttentionEvent[];
  onInitScript?: AttentionEvent[];
  onUpdateScript?: AttentionEvent[];
  eventGraphs?: Record<string, { nodes?: AttentionEvent[] }>;
};

/** Find warning sources not exposed by the owner's ordinary event tabs. */
export function getAdditionalEventWarnings(value: AttentionObject & { events?: AttentionEvent[]; playerHit1Script?: AttentionEvent[]; playerHit2Script?: AttentionEvent[]; playerHit3Script?: AttentionEvent[] }, visibleFields: readonly string[]) {
  const fields = ['script', 'events', 'onInitScript', 'onInteractScript', 'onUpdateScript', 'onEnterScript', 'onLeaveScript', 'playerHit1Script', 'playerHit2Script', 'playerHit3Script'] as const;
  const visited = new Set<string>();
  const result: Array<{ key: string; graph: boolean; count: number }> = [];
  for (const key of fields) if (visibleFields.includes(key)) countEventAttention(value[key] ?? [], visited);
  for (const key of fields) {
    if (visibleFields.includes(key)) continue;
    const count = countEventAttention(value[key] ?? [], visited);
    if (count) result.push({ key, graph: false, count });
  }
  for (const [key, graph] of Object.entries(value.eventGraphs ?? {})) {
    const count = countEventAttention(graph.nodes ?? [], visited);
    if (count) result.push({ key, graph: true, count });
  }
  return result;
}

export function countSceneAttention(scene: AttentionObject & {
  id?: string;
  playerHit1Script?: AttentionEvent[]; playerHit2Script?: AttentionEvent[]; playerHit3Script?: AttentionEvent[];
  actors?: AttentionObject[]; triggers?: AttentionObject[];
}, settings?: { startSceneId?: string | null }): number {
  const visited = new Set<string>();
  const objects = [scene, ...(scene.actors ?? []), ...(scene.triggers ?? [])];
  const lists = objects.flatMap(object => [object.script, object.onEnterScript, object.onLeaveScript,
    object.onInteractScript, object.onInitScript, object.onUpdateScript,
    ...Object.values(object.eventGraphs ?? {}).map(graph => graph.nodes)]);
  return countAssetReferenceAttention(scene) + (scene.id && settings?.startSceneId === scene.id ? countAssetReferenceAttention(settings) : 0) + [...lists, scene.playerHit1Script, scene.playerHit2Script, scene.playerHit3Script]
    .reduce<number>((total, events) => total + countEventAttention(events ?? [], visited), 0);
}

/** Only the first Fade In warns when the entire list has no enabled Fade In. */
export function getDisabledFadeIn(events: readonly AttentionEvent[]) {
  const fades = events.filter(event => event.command === 'EVENT_FADE_IN');
  return fades.length && fades.every(event => event.args?.__comment === true) ? fades[0] : undefined;
}

/** The same pending fields and reference warnings used by the event controls. */
export function countEventAttention(events: readonly AttentionEvent[] = [], visited = new Set<string>()): number {
  let count = 0;
  const disabledFade = getDisabledFadeIn(events);
  for (const event of events) {
    if (!event || event.id && visited.has(event.id)) continue;
    if (event.id) visited.add(event.id);
    if (event === disabledFade || Object.keys(getEventReferenceWarnings(event.args)).length || getEventPendingFields(event.command, event.args).length || getBackgroundCompatibility(event.args)?.issues.length || (['EVENT_DIALOGUE_CHOICE', 'EVENT_MENU_OPEN'].includes(event.command) && getMenuLayoutIssues(event.args ?? {}, event.command === 'EVENT_MENU_OPEN').length)) ++count;
    if (event.args?.__comment === true) continue;
    count += countEventAttention(event.children?.then ?? [], visited);
    count += countEventAttention(event.children?.else ?? [], visited);
  }
  return count;
}
