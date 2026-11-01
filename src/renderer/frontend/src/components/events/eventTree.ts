import type { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';

export type EventBranch = 'then' | 'else';
export type EventDestination = { parentId?: string; branch?: EventBranch; siblingId?: string; position?: 'before' | 'after' };
export type EventInsertionError = 'caseOnly' | 'caseOutside' | 'loopOnly' | 'invalidBranch' | 'cycle' | 'caseType';
export const EVENT_BRANCHES: Record<string, readonly EventBranch[]> = {
  EVENT_IF_ACTOR_FACING: ['then', 'else'], EVENT_IF: ['then', 'else'], EVENT_IF_BUTTON_HELD: ['then', 'else'],
  EVENT_WHILE: ['then'], EVENT_FOR: ['then'], EVENT_WAIT_FOR_BUTTON: ['then'],
  EVENT_SAVE_WRITE: ['then'], EVENT_SAVE_LOAD: ['then'], EVENT_SWITCH: ['then', 'else'], EVENT_SWITCH_CASE: ['then'],
};

export function findEventLocation(events: IScriptsElement[], id: string, ancestors: Array<{ event: IScriptsElement; branch: EventBranch }> = []): { event: IScriptsElement; list: IScriptsElement[]; ancestors: typeof ancestors } | undefined {
  for (const event of events) {
    if (event.id === id) return { event, list: events, ancestors };
    for (const branch of ['then', 'else'] as const) {
      const found = findEventLocation(event.children?.[branch] ?? [], id, [...ancestors, { event, branch }]);
      if (found) return found;
    }
  }
}

function destinationAncestors(events: IScriptsElement[], destination: EventDestination) {
  if (destination.siblingId) return findEventLocation(events, destination.siblingId)?.ancestors;
  if (!destination.parentId) return [];
  const parent = findEventLocation(events, destination.parentId);
  if (!parent || !destination.branch || !EVENT_BRANCHES[parent.event.command]?.includes(destination.branch)) return undefined;
  return [...parent.ancestors, { event: parent.event, branch: destination.branch }];
}

export function eventInsertionError(events: IScriptsElement[], event: IScriptsElement, destination: EventDestination): EventInsertionError | undefined {
  const ancestors = destinationAncestors(events, destination);
  if (!ancestors) return 'invalidBranch';
  if (destination.siblingId === event.id || ancestors.some(parent => parent.event.id === event.id)) return 'cycle';
  let loop = false;
  for (const parent of ancestors) {
    if (parent.event.command === 'EVENT_SAVE_WRITE' && parent.branch === 'else') loop = false;
    if (['EVENT_WHILE', 'EVENT_FOR'].includes(parent.event.command)) loop = true;
  }
  const visit = (node: IScriptsElement, parent: IScriptsElement | undefined, branch: EventBranch | undefined, inLoop: boolean): EventInsertionError | undefined => {
    const cases = parent?.command === 'EVENT_SWITCH' && branch === 'then';
    if (cases && node.command !== 'EVENT_SWITCH_CASE') return 'caseOnly';
    if (!cases && node.command === 'EVENT_SWITCH_CASE') return 'caseOutside';
    if (cases) {
      const type = parent?.args?.value?.kind === 'button' ? 'boolean' : parent?.args?.value?.type ?? 'number';
      if ((node.args?.value?.type ?? 'number') !== type) return 'caseType';
    }
    if (['EVENT_BREAK', 'EVENT_CONTINUE'].includes(node.command) && !inLoop) return 'loopOnly';
    for (const childBranch of ['then', 'else'] as const) {
      const children = node.children?.[childBranch] ?? [];
      if (children.length && !EVENT_BRANCHES[node.command]?.includes(childBranch)) return 'invalidBranch';
      const childLoop = node.command === 'EVENT_SAVE_WRITE' && childBranch === 'else' ? false
        : inLoop || ['EVENT_WHILE', 'EVENT_FOR'].includes(node.command);
      for (const child of children) {
        const error = visit(child, node, childBranch, childLoop);
        if (error) return error;
      }
    }
  };
  const owner = ancestors[ancestors.length - 1];
  return visit(event, owner?.event, owner?.branch, loop);
}

/** Immutable insertion shared by drag, paste and tests. A failed move leaves the source intact. */
export function insertEvent(events: IScriptsElement[], event: IScriptsElement, destination: EventDestination, move = false): IScriptsElement[] {
  if (eventInsertionError(events, event, destination)) return events;
  const visit = (list: IScriptsElement[], parentId?: string, branch?: EventBranch): IScriptsElement[] => {
    const next: IScriptsElement[] = [];
    for (const item of list) {
      if (move && item.id === event.id) continue;
      if (item.id === destination.siblingId && destination.position !== 'after') next.push(event);
      next.push(item.children ? { ...item, children: { ...item.children,
        then: visit(item.children.then ?? [], item.id, 'then'),
        else: item.children.else || destination.parentId === item.id && destination.branch === 'else'
          ? visit(item.children.else ?? [], item.id, 'else') : undefined,
      } } : destination.parentId === item.id ? { ...item, children: {
        then: visit([], item.id, 'then'),
        ...(destination.branch === 'else' ? { else: visit([], item.id, 'else') } : {}),
      } } : item);
      if (item.id === destination.siblingId && destination.position === 'after') next.push(event);
    }
    if (!destination.siblingId && destination.parentId === parentId && destination.branch === branch) next.push(event);
    return next;
  };
  return visit(events);
}

export function cloneEventTree(event: IScriptsElement, createId: () => string): IScriptsElement {
  const copy = structuredClone(event);
  const visit = (node: IScriptsElement) => {
    node.id = createId();
    if (node.args) delete node.args.__automatic;
    node.children?.then?.forEach(visit);
    node.children?.else?.forEach(visit);
  };
  visit(copy);
  return copy;
}
