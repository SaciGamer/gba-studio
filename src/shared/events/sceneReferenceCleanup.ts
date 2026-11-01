import { validateScriptArgument, validateScriptArgumentDomain, type ScriptParameter, type ScriptArgumentDomain } from '../scriptParameters';
import { isEventValueIncomplete } from './eventPendingFields';
import { normalizeSceneResource } from '../sceneResource';

export type EventReferenceWarnings = Record<string, string>;

export function getEventReferenceWarnings(args: Record<string, unknown> | undefined): EventReferenceWarnings {
  const warnings = args?.__referenceWarnings;
  if (!warnings || typeof warnings !== 'object' || Array.isArray(warnings)) return {};
  return Object.fromEntries(Object.entries(warnings).filter(([field]) => {
    if (field.startsWith('arguments.') && !field.startsWith('arguments[')) {
      const parameterId = field.slice('arguments.'.length);
      const argument = Array.isArray(args?.arguments) ? args.arguments.find(argument => argument?.parameterId === parameterId) : undefined;
      return Boolean(argument && isEventValueIncomplete(argument.value));
    }
    const path = field.replace(/\[(\d+)\]/g, '.$1').split('.');
    let current: any = args;
    let parent: any;
    for (const part of path) { parent = current; current = current?.[part]; }
    if (typeof current === 'string' && current.trim()) return false;
    if (parent?.kind && !isEventValueIncomplete(parent)) return false;
    return true;
  })) as EventReferenceWarnings;
}

export function addEventReferenceWarning(args: Record<string, unknown>, field: string, message: string): Record<string, unknown> {
  return { ...args, __referenceWarnings: { ...getEventReferenceWarnings(args), [field]: message } };
}

/** Clear reference warnings when the user supplies a replacement for that field. */
export function mergeEventArgs(previous: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...previous, ...patch };
  const warnings = { ...getEventReferenceWarnings(previous) };
  Object.keys(patch).forEach(field => {
    if (JSON.stringify(previous[field]) === JSON.stringify(next[field])) return;
    Object.keys(warnings).forEach(warningField => {
      if (field === 'arguments' && warningField.startsWith('arguments.')) {
        const parameterId = warningField.slice('arguments.'.length);
        const before = Array.isArray(previous.arguments) ? previous.arguments.find(argument => argument?.parameterId === parameterId)?.value : undefined;
        const after = Array.isArray(next.arguments) ? next.arguments.find(argument => argument?.parameterId === parameterId)?.value : undefined;
        if (JSON.stringify(before) !== JSON.stringify(after)) delete warnings[warningField];
        return;
      }
      if (warningField === field || warningField.startsWith(`${field}.`) || warningField.startsWith(`${field}[`)) delete warnings[warningField];
    });
  });
  if (Object.keys(warnings).length) next.__referenceWarnings = warnings;
  else delete next.__referenceWarnings;
  return next;
}

function appendReferenceWarnings(args: Record<string, unknown>, warnings: Record<string, string>): Record<string, unknown> {
  return { ...args, __referenceWarnings: { ...getEventReferenceWarnings(args), ...warnings } };
}

function clearReferences<T>(value: T, matches: (key: string, id: string) => boolean, label: string): { value: T; changed: boolean; eventCount: number } {
  if (!value || typeof value !== 'object') return { value, changed: false, eventCount: 0 };
  if (Array.isArray(value)) {
    let changed = false;
    let eventCount = 0;
    const next = value.map(item => {
      const result = clearReferences(item, matches, label);
      changed ||= result.changed;
      eventCount += result.eventCount;
      return result.value;
    });
    return changed ? { value: next as T, changed, eventCount } : { value, changed: false, eventCount: 0 };
  }

  const source = value as Record<string, unknown>;
  const isEvent = typeof source.command === 'string' && source.args && typeof source.args === 'object';
  let next: Record<string, unknown> | undefined;
  let changed = false;
  let eventCount = 0;
  for (const [key, child] of Object.entries(source)) {
    if (isEvent && key === 'args') continue;
    const result = clearReferences(child, matches, label);
    if (!result.changed) continue;
    next ??= { ...source };
    next[key] = result.value;
    changed = true;
    eventCount += result.eventCount;
  }

  if (isEvent) {
    const args = source.args as Record<string, unknown>;
    const cleared = clearArgsReferences(args, matches, label);
    if (cleared.changed) {
      if (source.command === 'EVENT_CALL_SCRIPT' && Array.isArray(cleared.args.arguments)) {
        const warnings = { ...getEventReferenceWarnings(cleared.args) };
        const argumentsList = cleared.args.arguments.map((argument: any, index: number) => {
          const lost = Object.keys(warnings).filter(field => field.startsWith(`arguments[${index}].value`));
          if (!lost.length) return argument;
          const message = warnings[lost[0]];
          lost.forEach(field => delete warnings[field]);
          warnings[`arguments.${argument.parameterId}`] = message;
          return { ...argument, value: { kind: 'variable', variableId: '', ...(argument.value?.type === 'string' ? { type: 'string' } : {}) } };
        });
        cleared.args = { ...cleared.args, arguments: argumentsList, __referenceWarnings: warnings };
      }
      next ??= { ...source };
      const notice = String(args.__name ?? '');
      if (args.__comment === true && notice.includes('Repair this event before re-enabling it.')) {
        const repairedArgs: Record<string, unknown> = { ...cleared.args, __comment: false };
        delete repairedArgs.__name;
        next.args = repairedArgs;
      } else {
        next.args = cleared.args;
      }
      changed = true;
      eventCount += 1;
    }
  }

  return changed ? { value: next as T, changed, eventCount } : { value, changed: false, eventCount: 0 };
}

function clearArgsReferences(args: Record<string, unknown>, matches: (key: string, id: string) => boolean, label: string) {
  const warnings: Record<string, string> = {};
  let changed = false;
  const visit = (value: unknown, path: string): unknown => {
    if (Array.isArray(value)) {
      let arrayChanged = false;
      const field = path.split('.').at(-1)?.replace(/\[\d+\]$/, '') ?? '';
      const next = value.flatMap((item, index) => {
        if (typeof item === 'string' && matches(field, item)) {
          warnings[`${path}[${index}]`] = `${label} reference was removed. Select a replacement.`;
          changed = true;
          arrayChanged = true;
          return [];
        }
        const result = visit(item, `${path}[${index}]`);
        arrayChanged ||= result !== item;
        return [result];
      });
      if (arrayChanged) changed = true;
      return arrayChanged ? next : value;
    }
    if (!value || typeof value !== 'object') return value;
    const record = value as Record<string, unknown>;
    let next: Record<string, unknown> | undefined;
    for (const [key, child] of Object.entries(record)) {
      if (key.startsWith('__')) continue;
      const childPath = path ? `${path}.${key}` : key;
      if (typeof child === 'string' && matches(key, child)) {
        next ??= { ...record };
        delete next[key];
        warnings[childPath] = `${label} reference was removed. Select a replacement.`;
        changed = true;
        continue;
      }
      const result = visit(child, childPath);
      if (result !== child) {
        next ??= { ...record };
        next[key] = result;
      }
    }
    return next ?? value;
  };
  const cleaned = visit(args, '') as Record<string, unknown>;
  return { args: Object.keys(warnings).length ? appendReferenceWarnings(cleaned, warnings) : cleaned, changed };
}

/** Remove deleted scene ids from event arguments and leave an event-title warning. */
export function clearDeletedSceneReferences<T>(value: T, deletedSceneIds: ReadonlySet<string>): { value: T; changed: boolean } {
  const result = clearReferences(value, (key, id) => key === 'sceneId' && deletedSceneIds.has(id), 'Target scene');
  return { value: result.value, changed: result.changed };
}

/** Repair scene references that were already stale when a project was loaded. */
export function clearMissingSceneReferences<T>(value: T, availableSceneIds: ReadonlySet<string>): { value: T; changed: boolean } {
  const result = clearReferences(value, (key, id) => key === 'sceneId' && Boolean(id.trim()) && !availableSceneIds.has(id), 'Target scene');
  return { value: result.value, changed: result.changed };
}

export function clearDeletedEventReferences<T>(value: T, field: string, id: string, label: string): { value: T; changed: boolean; eventCount: number } {
  return clearReferences(value, (candidateField, candidateId) => (candidateField === field || candidateField === `${field}s`) && candidateId === id, label);
}

/** Reconcile event references after loading and after any resource removal. */
export function clearMissingEventReferences<T>(value: T, available: { scenes: ReadonlySet<string>; actors: ReadonlySet<string>; triggers: ReadonlySet<string>; scripts: ReadonlySet<string>; variables: ReadonlySet<string>; music?: ReadonlySet<string>; backgrounds?: ReadonlySet<string>; sprites?: ReadonlySet<string>; parameterIds?: ReadonlySet<string>; selfAllowed?: boolean }): { value: T; changed: boolean } {
  const fields: Record<string, ReadonlySet<string>> = {
    sceneId: available.scenes, actorId: available.actors, targetActorId: available.actors, actor_id: available.actors,
    triggerId: available.triggers, scriptId: available.scripts, variableId: available.variables, variableIds: available.variables,
    ...(available.music ? { musicId: available.music } : {}),
    ...(available.backgrounds ? { backgroundId: available.backgrounds, regularBackgroundId: available.backgrounds, bitmapBackgroundId: available.backgrounds } : {}),
    ...(available.sprites ? { spriteId: available.sprites, playerSpriteId: available.sprites, projectileSpriteId: available.sprites } : {}),
  };
  const result = clearReferences(value, (key, id) => Boolean(fields[key] && id.trim()
    && id !== '__PLAYER__'
    && (id === '__SELF__' ? available.selfAllowed === false
      : id.startsWith('__PARAM__:') ? available.parameterIds !== undefined && !available.parameterIds.has(id) : !fields[key].has(id))), 'Resource');
  return { value: result.value, changed: result.changed };
}

/** Reconcile asset slots outside events without discarding layer paint or actor data. */
export function clearMissingAssetReferences<T>(value: T, available: { backgrounds: ReadonlySet<string>; sprites: ReadonlySet<string> }): { value: T; changed: boolean } {
  const fields: Record<string, ReadonlySet<string>> = { backgroundId: available.backgrounds, spriteId: available.sprites, playerSpriteId: available.sprites, projectileSpriteId: available.sprites };
  const walk = (node: any): any => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) {
      const next = node.map(walk);
      return next.some((item, index) => item !== node[index]) ? next : node;
    }
    let next = normalizeSceneResource(node);
    const isScene = node._resourceType === 'scene' || Array.isArray(node.backgrounds);
    for (const [field, child] of Object.entries(node)) {
      if (field.startsWith('__') || field === 'args') continue;
      if (isScene && field === 'backgroundId') continue;
      if (fields[field] && typeof child === 'string' && child.trim() && !fields[field].has(child)) {
        next = { ...next, [field]: null, __referenceWarnings: { ...getEventReferenceWarnings(next), [field]: 'Resource reference was removed. Select a replacement.' } };
      } else {
        const result = walk(child);
        if (result !== child) next = { ...next, [field]: result };
      }
    }
    return next;
  };
  const next = walk(value);
  return { value: next, changed: next !== value };
}

export function hasAssetReferenceWarning(value: unknown, field: string): boolean {
  return Boolean(value && typeof value === 'object' && getEventReferenceWarnings(value as Record<string, unknown>)[field]);
}

export function countAssetReferenceAttention(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) return value.reduce((total, child) => total + countAssetReferenceAttention(child), 0);
  const node = value as Record<string, unknown>;
  const isScene = node._resourceType === 'scene' || Array.isArray(node.backgrounds);
  return ['backgroundId', 'spriteId', 'playerSpriteId', 'projectileSpriteId'].filter(field => !(isScene && field === 'backgroundId') && hasAssetReferenceWarning(node, field)).length
    + ['backgrounds', 'actors', 'triggers', 'actor', 'trigger', 'shooterConfig'].reduce((total, key) => total + countAssetReferenceAttention(node[key]), 0);
}

/** Copied calls must obey the receiving component's domain, not the source's. */
export function repairCallScriptArguments<T>(value: T, definitions: ReadonlyMap<string, readonly ScriptParameter[]>, domain: ScriptArgumentDomain): { value: T; changed: boolean } {
  let changed = false;
  const walk = (node: any): any => {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) {
      const next = node.map(walk);
      return next.some((item, index) => item !== node[index]) ? next : node;
    }
    let result = node;
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith('__') || key === 'args') continue;
      const next = walk(child);
      if (next !== child) result = { ...result, [key]: next };
    }
    if (node.command !== 'EVENT_CALL_SCRIPT' || !node.args) return result;
    const parameters = definitions.get(node.args.scriptId);
    if (!parameters) return result;
    const argumentsList = Array.isArray(node.args.arguments) ? node.args.arguments : [];
    const warnings = { ...getEventReferenceWarnings(node.args) };
    const next = [...argumentsList];
    for (const field of Object.keys(warnings)) {
      if (field.startsWith('arguments.') && !parameters.some(parameter => field === `arguments.${parameter.id}`)) delete warnings[field];
    }
    for (const parameter of parameters) {
      const index = next.findIndex(argument => argument.parameterId === parameter.id);
      const argument = next[index];
      try {
        validateScriptArgument(parameter, argument);
        validateScriptArgumentDomain(argument.value, domain, parameter);
        delete warnings[`arguments.${parameter.id}`];
      } catch {
        const blank = { parameterId: parameter.id, value: { kind: 'variable', variableId: '', ...(parameter.type === 'string' ? { type: 'string' } : {}) } };
        if (index < 0) next.push(blank); else next[index] = blank;
        warnings[`arguments.${parameter.id}`] ??= 'Input reference is unavailable in this component. Select a replacement.';
      }
    }
    const args = { ...node.args, arguments: next, ...(Object.keys(warnings).length ? { __referenceWarnings: warnings } : {}) };
    if (!Object.keys(warnings).length) delete args.__referenceWarnings;
    if (JSON.stringify(args) !== JSON.stringify(node.args)) { changed = true; result = { ...result, args }; }
    return result;
  };
  const next = walk(value);
  return { value: next, changed };
}

/** Remove references to a deleted actor without disabling its event. */
export function disableDeletedActorReferences<T>(value: T, actorId: string, _actorName: string): { value: T; changed: boolean; eventCount: number } {
  return clearReferences(value, (key, id) => (key === 'actorId' || key === 'targetActorId') && id === actorId, 'Actor');
}

/** Clear legacy actor ids that no longer exist when the project is opened. */
export function disableMissingActorReferences<T>(value: T, availableActorIds: ReadonlySet<string>): { value: T; changed: boolean; eventCount: number } {
  return clearReferences(value, (key, id) => (key === 'actorId' || key === 'targetActorId') && Boolean(id.trim()) && id !== '__PLAYER__' && id !== '__SELF__' && !availableActorIds.has(id), 'Actor');
}
