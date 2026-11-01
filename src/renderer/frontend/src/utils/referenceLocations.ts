import { ISceneSettings, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { IScriptDefinition } from '@/providers/contexts/interfaces/IScriptElement';

export interface ReferenceLocation {
  sceneId?: string;
  scriptId?: string;
  sceneObject?: { type: 'actor' | 'trigger'; id: string };
  scene?: string;
  script?: string;
  variable?: string;
  event?: string;
  eventId?: string;
  tab?: string;
}

const eventLabel = (event: IScriptsElement) => event.args?.__name || event.command;

const containsVariableReference = (value: unknown, variableId: string): boolean => {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(item => containsVariableReference(item, variableId));
  return Object.entries(value).some(([key, item]) =>
    (key === 'variableId' && item === variableId) || containsVariableReference(item, variableId),
  );
};

const walkEvents = (
  events: IScriptsElement[] | undefined,
  location: Omit<ReferenceLocation, 'event'>,
  targetId: string,
  kind: 'script' | 'variable',
  result: ReferenceLocation[],
) => {
  for (const event of events ?? []) {
    const matches = kind === 'script'
      ? event.command === 'EVENT_CALL_SCRIPT' && (event.args as { scriptId?: string } | undefined)?.scriptId === targetId
      : containsVariableReference(event, targetId);
    if (matches) result.push({ ...location, event: eventLabel(event), eventId: event.id,
      tab: location.sceneObject?.type === 'actor' ? location.script?.endsWith('On Init') ? 'init' : location.script?.endsWith('On Update') ? 'update' : 'interact'
        : location.sceneObject?.type === 'trigger' ? location.script?.endsWith('On Leave') ? 'leave' : 'enter'
          : location.script?.startsWith('Player Hit ') ? `hit${location.script.slice(-1)}` : '1' });
    walkEvents(event.children?.then, location, targetId, kind, result);
    walkEvents(event.children?.else, location, targetId, kind, result);
  }
};

export const collectReferenceLocations = (
  scenes: ISceneSettings[],
  scripts: IScriptDefinition[],
  targetId: string,
  kind: 'script' | 'variable',
): ReferenceLocation[] => {
  const result: ReferenceLocation[] = [];

  scripts.filter(script => !(script as IScriptDefinition & { _deleted?: boolean })._deleted).forEach(script => {
    walkEvents(script.events, { scriptId: script.id, script: script.name }, targetId, kind, result);
  });

  scenes.filter(scene => !scene._deleted).forEach(scene => {
    const sceneName = scene.name || scene.id;
    walkEvents(scene.script, { sceneId: scene.id, scene: sceneName, script: 'On Init' }, targetId, kind, result);
    walkEvents(scene.playerHit1Script, { sceneId: scene.id, scene: sceneName, script: 'Player Hit 1' }, targetId, kind, result);
    walkEvents(scene.playerHit2Script, { sceneId: scene.id, scene: sceneName, script: 'Player Hit 2' }, targetId, kind, result);
    walkEvents(scene.playerHit3Script, { sceneId: scene.id, scene: sceneName, script: 'Player Hit 3' }, targetId, kind, result);
    scene.actors?.forEach(actor => {
      const actorName = actor.name || actor.id;
      const actorScripts = actor as typeof actor & Record<string, IScriptsElement[] | undefined>;
      walkEvents(actorScripts.onInteractScript, { sceneId: scene.id, scene: sceneName, sceneObject: { type: 'actor', id: actor.id }, script: `${actorName} / On Interact` }, targetId, kind, result);
      walkEvents(actorScripts.onInitScript, { sceneId: scene.id, scene: sceneName, sceneObject: { type: 'actor', id: actor.id }, script: `${actorName} / On Init` }, targetId, kind, result);
      walkEvents(actorScripts.onUpdateScript, { sceneId: scene.id, scene: sceneName, sceneObject: { type: 'actor', id: actor.id }, script: `${actorName} / On Update` }, targetId, kind, result);
    });
    scene.triggers?.forEach(trigger => {
      const triggerName = trigger.name || trigger.id;
      const triggerScripts = trigger as typeof trigger & Record<string, IScriptsElement[] | undefined>;
      walkEvents(triggerScripts.script, { sceneId: scene.id, scene: sceneName, sceneObject: { type: 'trigger', id: trigger.id }, script: triggerName }, targetId, kind, result);
      walkEvents(triggerScripts.onEnterScript, { sceneId: scene.id, scene: sceneName, sceneObject: { type: 'trigger', id: trigger.id }, script: `${triggerName} / On Enter` }, targetId, kind, result);
      walkEvents(triggerScripts.onLeaveScript, { sceneId: scene.id, scene: sceneName, sceneObject: { type: 'trigger', id: trigger.id }, script: `${triggerName} / On Leave` }, targetId, kind, result);
    });
    Object.values(scene.eventGraphs ?? {}).forEach(graph => walkEvents(graph.nodes, { sceneId: scene.id, scene: sceneName, script: 'Event Graph' }, targetId, kind, result));
  });

  return result;
};
