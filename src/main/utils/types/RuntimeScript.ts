import { PHYSICS_EVENT_CODES } from '../../../shared/events/physicsEvents';
import { EVENT_CATALOG_BY_CODE, EVENT_DEFAULTS } from '../../../shared/events/eventCatalog';
import { validateNumericValue, type NumericValue } from '../../../shared/numericValues';
import { hasEventCompiler } from '../events/EventCompilerRegistry';
import { withEventContext } from '../events/EventDiagnostics';
import { SCRIPT_PARAMETER_LIMIT, type ScriptArgument } from '../../../shared/scriptParameters';

export type RuntimeScriptValue = string | number | boolean | null | NumericValue
  | ScriptArgument
  | { kind: 'literal'; type: 'number' | 'boolean' | 'string'; value: string | number | boolean }
  | { kind: 'variable'; type: 'number' | 'boolean' | 'string'; variableId: string }
  | { kind: 'button'; type: 'boolean'; button: string }
  | { type: 'number'; value: number }
  | RuntimeScriptValue[];

export interface RuntimeScript {
  id: string;
  command: string;
  version?: number;
  args: Record<string, RuntimeScriptValue>;
  children?: { then: RuntimeScript[]; else: RuntimeScript[] };
}

// Legacy aliases and additional native ABI fields audited in ResourceBuilder.
// Unknown editor fields cannot enter a payload via this table.
const extraFields: Readonly<Record<string, readonly string[]>> = {
  EVENT_CHANGE_PALETTE_BACKGROUND: ['paletteIds'],
  EVENT_BACKGROUND_ANIMATE: ['regularBackgroundId', 'bitmapBackgroundId', 'resolvedFrameCount', 'sourceStartFrame', 'frameDelta', 'stepX', 'stepY'],
};
const aliases: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  EVENT_MOVE_ACTOR: { actorId: 'actor_id' }, EVENT_ACTOR_MOVE_TO: { actorId: 'actor_id' },
  EVENT_ACTOR_SET_POSITION: { actorId: 'actor_id' }, EVENT_SPAWN_ACTOR: { actorId: 'actor_id' },
  EVENT_ACTOR_SPAWN: { actorId: 'actor_id' }, EVENT_REMOVE_ACTOR: { actorId: 'actor_id' },
  EVENT_ACTOR_DESPAWN: { actorId: 'actor_id' }, EVENT_VISIBLE_ACTOR: { actorId: 'actor_id' },
  EVENT_ACTOR_SET_VISIBLE: { actorId: 'actor_id' }, EVENT_HIDE_ACTOR: { actorId: 'actor_id' },
  EVENT_SHOW_ACTOR: { actorId: 'actor_id' }, EVENT_SET_ANIMATION_SPEED: { actorId: 'actor_id' },
  EVENT_ACTOR_SET_ANIMATION: { actorId: 'actor_id' }, EVENT_SET_ACTOR_PRIORITY: { actorId: 'actor_id' },
  EVENT_PLAY_MUSIC: { musicId: 'music_id' }, EVENT_MUSIC_PLAY_JINGLE: { musicId: 'music_id' },
  EVENT_PLAY_SOUND: { soundId: 'sound_id' }, EVENT_DISPLAY_DIALOGUE: { text: 'dialogue' },
  EVENT_DIALOGUE_SHOW: { text: 'dialogue' }, EVENT_TEXT_SCROLL: { text: 'dialogue' },
};

/** Project metadata never survives the explicit value constructor. */
function toRuntimeValue(source: unknown, selfActorId?: string): RuntimeScriptValue {
  if (source === null || ['string', 'number', 'boolean'].includes(typeof source)) return source as string | number | boolean | null;
  if (Array.isArray(source)) return source.map(value => toRuntimeValue(value, selfActorId));
  if (!source || typeof source !== 'object') throw new Error('Invalid event payload value');
  const value = source as Record<string, any>;
  const type = value.type;
  if (value.kind === 'literal' && ['number', 'boolean', 'string'].includes(type)) {
    if (typeof value.value !== type) throw new Error(`Invalid ${type} script literal`);
    return { kind: 'literal', type, value: value.value };
  }
  if (value.kind === 'variable' && ['number', 'boolean', 'string'].includes(type)) {
    return { kind: 'variable', type, variableId: value.variableId };
  }
  if (value.kind === 'button') return { kind: 'button', type: 'boolean', button: value.button };
  if (value.kind === undefined && type === 'number') return { type: 'number', value: value.value };
  validateNumericValue(value);
  switch (value.kind) {
    case 'formula': {
      const variables: Record<string, string> = {};
      for (const [symbol, id] of Object.entries(value.variables ?? {})) {
        if (typeof id !== 'string') throw new Error(`Invalid formula variable ${symbol}`);
        variables[symbol] = id;
      }
      return { kind: 'formula', source: value.source, variables };
    }
    case 'number': return { kind: 'number', value: value.value };
    case 'variable': return { kind: 'variable', variableId: value.variableId };
    case 'constant': return { kind: 'constant', constant: value.constant };
    case 'property': return { kind: 'property', actorId: value.actorId === '__SELF__' && selfActorId ? selfActorId : value.actorId, property: value.property };
    case 'trigger': return { kind: 'trigger', triggerId: value.triggerId, property: value.property };
    case 'engine': return { kind: 'engine', field: value.field };
    case 'direction': return { kind: 'direction', direction: value.direction };
    case 'expression': return {
      kind: 'expression', operation: value.operation,
      left: toRuntimeValue(value.left, selfActorId) as NumericValue,
      ...(value.right === undefined ? {} : { right: toRuntimeValue(value.right, selfActorId) as NumericValue }),
    };
    default: throw new Error('Unsupported runtime expression');
  }
}

function validateEventVersion(source: Record<string, any>): void {
  if (source.version !== undefined && source.version !== 1) {
    throw withEventContext(source, new Error(`Invalid ${source.command} ${source.id ?? '<unknown>'}: unsupported schema version ${source.version}`));
  }
}

/** Compile editing policy and reconstruct every payload using its contract. */
export function toRuntimeScripts(events: readonly unknown[], selfActorId?: string): RuntimeScript[] {
  const result: RuntimeScript[] = [];
  const expandedEvents: unknown[] = [];
  for (const event of events) {
    const source = event && typeof event === 'object' ? event as Record<string, any> : undefined;
    if (source && source.args?.__comment !== true && source.disabled !== true && source.enabled !== false) validateEventVersion(source);
    if (source?.command !== 'EVENT_SWITCH') { expandedEvents.push(event); continue; }
    if (source.args?.__comment === true || source.disabled === true || source.enabled === false) { expandedEvents.push(event); continue; }
    if (typeof source.id !== 'string' || !source.id || !source.args?.value) throw new Error(`Invalid Switch event ${source.id ?? '<unknown>'}: choose a value to compare`);
    const cases = (Array.isArray(source.children?.then) ? source.children.then : [])
      .filter((item: any) => item?.command === 'EVENT_SWITCH_CASE' && item?.args?.__comment !== true && item?.disabled !== true && item?.enabled !== false);
    if ((Array.isArray(source.children?.then) ? source.children.then : []).some((item: any) => item?.command !== 'EVENT_SWITCH_CASE')) throw new Error(`Invalid Switch event ${source.id}: case branch data is malformed`);
    const defaultEvents = Array.isArray(source.children?.else) ? source.children.else : [];
    const buildCase = (index: number): any => {
      if (index >= cases.length) return null;
      const current = cases[index];
      validateEventVersion(current);
      if (typeof current.id !== 'string' || !current.id || !current.args?.value) throw new Error(`Invalid Switch event ${source.id}: a case has no value`);
      const switchType = source.args.value.type ?? (source.args.value.kind === 'button' ? 'boolean' : 'number');
      const storedCaseValue = current.args.value;
      // Older Switch editors initialized a case from the selected variable
      // operand, leaving kind/variableId metadata beside the editable literal.
      // Retain the authored scalar as the case constant when reading that data.
      const isLiteral = storedCaseValue.kind === 'literal';
      const isLegacyLiteral = storedCaseValue.kind === 'variable'
        && ['number', 'boolean', 'string'].includes(storedCaseValue.type)
        && ['number', 'boolean', 'string'].includes(typeof storedCaseValue.value);
      if (!isLiteral && !isLegacyLiteral) throw new Error(`Invalid Switch event ${source.id}: case ${current.id} must be a literal value`);
      const rawCaseValue = storedCaseValue.value;
      const caseValue = { kind: 'literal', type: switchType, value: switchType === 'string'
        ? String(rawCaseValue ?? '')
        : switchType === 'boolean' ? typeof rawCaseValue === 'boolean' ? rawCaseValue : rawCaseValue === 1 || String(rawCaseValue).toLowerCase() === 'true'
          : Number.isFinite(Number(rawCaseValue)) ? Math.trunc(Number(rawCaseValue)) : 0 };
      return {
        id: `${source.id}__switch_${current.id}`,
        version: 1,
        command: 'EVENT_IF',
        args: { left: source.args?.value, operator: '==', right: caseValue },
        children: { then: Array.isArray(current.children?.then) ? current.children.then : [], else: index + 1 < cases.length ? [buildCase(index + 1)] : defaultEvents },
      };
    };
    if (cases.length) expandedEvents.push(buildCase(0));
    else expandedEvents.push(...defaultEvents);
  }
  for (const event of expandedEvents) {
    try {
    if (!event || typeof event !== 'object') throw new Error('Invalid script command');
    const source = event as Record<string, any>;
    if (source.args?.__comment === true || source.disabled === true || source.enabled === false) continue;
    const contract = EVENT_CATALOG_BY_CODE[source.command];
    if (!contract || !hasEventCompiler(source.command)) throw new Error(`Unsupported runtime command ${source.command} (${source.id ?? '<unknown>'})`);
    if (typeof source.id !== 'string' || !source.id) throw new Error(`Missing command id for ${source.command}`);
    const args: Record<string, RuntimeScriptValue> = {};
    if (source.command === 'EVENT_CHANGE_DEFAULT_PALETTES') {
      const ids = source.args?.paletteIds;
      if (ids !== undefined && (!Array.isArray(ids) || ids.length > 16 || ids.some((id: unknown) => id !== null && (typeof id !== 'string' || !id)))) {
        throw new Error('Default palettes require at most 16 palette IDs or null slots');
      }
    }
    for (const field of [...Object.keys(contract.payload), ...(extraFields[source.command] ?? [])]) {
      if (['EVENT_ACTOR_SET_ROTATION', 'EVENT_ACTOR_SET_SCALE', 'EVENT_ACTOR_SET_TINT', ...PHYSICS_EVENT_CODES].includes(source.command)) {
        const raw = source.args?.[field];
        if (raw === null || (typeof raw === 'number' && !Number.isFinite(raw))) {
          throw new Error(`Invalid ${source.command} ${source.id}: ${field} must have a finite, non-null value`);
        }
      }
      const transformDefaults = ['EVENT_ACTOR_SET_DIRECTION', 'EVENT_ACTOR_SET_ROTATION', 'EVENT_ACTOR_SET_SCALE', 'EVENT_BACKGROUND_ANIMATE', 'EVENT_BACKGROUND_SET_SCALE', 'EVENT_BACKGROUND_SET_ROTATION', 'EVENT_BACKGROUND_SET_SHEAR', 'EVENT_ACTOR_SET_TINT', 'EVENT_ACTOR_SET_SATURATION', 'EVENT_ACTOR_SET_BRIGHTNESS', 'EVENT_ACTOR_SET_OPACITY'].includes(source.command) ? EVENT_DEFAULTS[source.command] as Record<string, unknown> : undefined;
      const value = source.args?.[field] ?? source.args?.[aliases[source.command]?.[field]] ?? transformDefaults?.[field];
      if (source.command === 'EVENT_CALL_SCRIPT' && field === 'arguments' && value !== undefined) {
        if (!Array.isArray(value) || value.length > SCRIPT_PARAMETER_LIMIT) throw new Error('Call Script accepts at most 20 parameters');
        args[field] = value.map(argument => {
          if (!argument || typeof argument.parameterId !== 'string' || !argument.parameterId) throw new Error('Invalid Call Script input');
          return { parameterId: argument.parameterId, value: toRuntimeValue(argument.value, selfActorId) as ScriptArgument['value'] };
        });
      } else if (value !== undefined) args[field] = toRuntimeValue(value, selfActorId);
    }
    const command: RuntimeScript = { id: source.id, command: source.command, args };
    // Bind Self to the owner at export, keeping copied actor programs portable.
    if (selfActorId && args.actorId === '__SELF__') args.actorId = selfActorId;
    if (source.version !== undefined) command.version = source.version;
    if (source.children) command.children = { then: toRuntimeScripts(source.children.then ?? [], selfActorId), else: toRuntimeScripts(source.children.else ?? [], selfActorId) };
    result.push(command);
    } catch (error) { throw withEventContext(event, error); }
  }
  return result;
}
