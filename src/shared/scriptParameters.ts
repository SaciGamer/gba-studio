import { normalizeNumericValue, validateNumericValue, type NumericValue } from './numericValues';
import { parseNumericFormula } from './numericFormula';

export const SCRIPT_PARAMETER_LIMIT = 20;
export type ScriptParameter = { id: string; name: string; alias?: string; type: 'number' | 'boolean' | 'string'; mode: 'local' | 'reference' };
export type ScriptArgument = { parameterId: string; value: NumericValue | { kind: 'literal'; type: 'string'; value: string } | { kind: 'variable'; type: 'string'; variableId: string } };
export const isScriptParameter = (id: unknown): id is string => typeof id === 'string' && id.startsWith('__PARAM__:');
export const scriptParameterName = (index: number) => `Parameter ${String.fromCharCode(65 + index)}`;
export const scriptParameterLabel = (parameter: ScriptParameter) => parameter.alias ?? parameter.name;
export function normalizeScriptParameters(parameters: ScriptParameter[]): ScriptParameter[] {
  return parameters.map((parameter, index) => {
    const letter = /^__PARAM__:([A-T])$/.exec(parameter.id)?.[1];
    const name = letter ? `Parameter ${letter}` : scriptParameterName(index);
    const alias = parameter.alias ?? (/^(input[1-9][0-9]*|Parameter [A-T])$/.test(parameter.name) ? undefined : parameter.name);
    return { ...parameter, name, ...(alias !== undefined ? { alias } : {}) };
  });
}
/** The runtime slot is fixed; name is its editable engine alias. */
export function createScriptParameter(parameters: ScriptParameter[], type: ScriptParameter['type'] = 'number'): ScriptParameter | null {
  if (parameters.length >= SCRIPT_PARAMETER_LIMIT) return null;
  const occupied = new Set(parameters.map((parameter, index) => /^__PARAM__:[A-T]$/.test(parameter.id) ? parameter.id : `__PARAM__:${String.fromCharCode(65 + index)}`));
  for (let index = 0; index < SCRIPT_PARAMETER_LIMIT; index++) {
    const id = `__PARAM__:${String.fromCharCode(65 + index)}`;
    if (occupied.has(id)) continue;
    const base = scriptParameterName(index);
    let name = base, suffix = 2;
    while (parameters.some(parameter => scriptParameterLabel(parameter) === name)) name = `${base} (${suffix++})`;
    return { id, name: base, ...(name !== base ? { alias: name } : {}), type, mode: 'local' };
  }
  return null;
}
export function scriptUsesParameter(value: any, id: string): boolean {
  if (value?.command === 'EVENT_CALL_SCRIPT') return (value.args?.arguments ?? []).some((argument: ScriptArgument) => scriptUsesParameter(argument.value, id));
  if (typeof value === 'string') return value === id;
  return !!value && typeof value === 'object' && Object.values(value).some(child => scriptUsesParameter(child, id));
}
/** New variable assignments in reusable scripts expose a named input by default. */
export function exposeScriptInputs<T extends { id: string; command: string; args?: any; children?: any }>(events: T[], existing: ScriptParameter[] = []): { events: T[]; parameters: ScriptParameter[] } {
  const parameters = normalizeScriptParameters(existing);
  const visit = (entries: T[]): T[] => entries.map(event => {
    let next = event;
    if (['EVENT_VARIABLE', 'EVENT_FOR'].includes(event.command) && !event.args?.variableId && parameters.length < SCRIPT_PARAMETER_LIMIT) {
      const type = event.command === 'EVENT_VARIABLE' && ['boolean', 'string'].includes(event.args?.value?.type) ? event.args.value.type : 'number';
      const parameter = createScriptParameter(parameters, type);
      if (parameter) {
        parameters.push(parameter);
        next = { ...event, args: { ...event.args, variableId: parameter.id, variableSymbol: parameter.name } };
      }
    }
    if (next.children) next = { ...next, children: { ...next.children, then: visit(next.children.then ?? []), else: visit(next.children.else ?? []) } };
    const parameter = parameters.find(parameter => parameter.id === next.args?.variableId);
    if (parameter && next.command === 'EVENT_VARIABLE' && next.args?.value?.kind === 'literal' && next.args.value.type !== parameter.type)
      next = { ...next, args: { ...next.args, value: { kind: 'literal', type: parameter.type, value: parameter.type === 'string' ? '' : parameter.type === 'boolean' ? false : 0 } } };
    return next;
  });
  const result = visit(events);
  // Parameters belong to the method signature, independently of an event's
  // current target. Choosing Global must leave Parameter available to reselect.
  return { events: result, parameters };
}
export function validateScriptParameters(parameters: ScriptParameter[]): void {
  if (!Array.isArray(parameters) || parameters.length > SCRIPT_PARAMETER_LIMIT) throw new Error('A script accepts at most 20 parameters');
  const ids = new Set<string>(), names = new Set<string>();
  for (const parameter of parameters) {
    if (!parameter || !isScriptParameter(parameter.id) || ids.has(parameter.id)) throw new Error('Invalid or duplicate script input id');
    const label = scriptParameterLabel(parameter);
    if (!parameter.name?.trim() || !label?.trim() || names.has(label.trim())) throw new Error('Script parameters require unique aliases');
    if (!['number', 'boolean', 'string'].includes(parameter.type) || !['local', 'reference'].includes(parameter.mode)) throw new Error('Invalid script input type or mode');
    ids.add(parameter.id); names.add(label.trim());
  }
}
export function isWritableScriptValue(value: unknown): boolean {
  const node = value as NumericValue;
  return !!node && (node.kind === 'variable' || node.kind === 'property'
    || node.kind === 'trigger' || node.kind === 'engine' && ['cameraX', 'cameraY'].includes(node.field));
}
export function validateScriptArgument(parameter: ScriptParameter, argument: ScriptArgument): void {
  if (!argument || argument.parameterId !== parameter.id) throw new Error(`Missing input '${parameter.name}'`);
  if (parameter.type === 'string') {
    const value = argument.value as any;
    if (!(value?.kind === 'literal' && value.type === 'string' && typeof value.value === 'string')
      && !(value?.kind === 'variable' && value.type === 'string' && typeof value.variableId === 'string' && value.variableId)) throw new Error(`Input '${parameter.name}' requires text`);
  } else {
    const value = argument.value as any;
    if (value?.type === 'string') throw new Error(`Input '${parameter.name}' requires a numeric value`);
    validateNumericValue(value?.kind === 'literal' && ['number', 'boolean'].includes(value.type) ? normalizeNumericValue(value) : value);
  }
  if (parameter.mode === 'reference' && !isWritableScriptValue(argument.value)) throw new Error(`Input '${parameter.name}' requires a writable reference`);
}

export type ScriptArgumentDomain = { actors: string[]; triggers: string[]; scene: boolean; variables: ReadonlyMap<string, string> };
/** Enforce the same domain for menus, pasted values and ROM compilation. */
export function validateScriptArgumentDomain(value: ScriptArgument['value'], domain: ScriptArgumentDomain, parameter?: ScriptParameter): void {
  const walk = (node: any): void => {
    if (node.kind === 'variable') {
      const type = domain.variables.get(node.variableId);
      if (!type || type === 'string' && node.type !== 'string' || node.type === 'string' && type !== 'string') throw new Error('Input variable is outside the caller domain or has an incompatible type');
      if (parameter?.mode === 'reference' && type !== parameter.type) throw new Error('Reference input type does not match its variable');
    } else if (node.kind === 'property') {
      if (!domain.actors.includes(node.actorId)) throw new Error('Input actor is outside the caller domain');
      if (parameter?.mode === 'reference' && parameter.type !== 'number') throw new Error('Actor references require a number input');
    } else if (node.kind === 'trigger') {
      if (!domain.triggers.includes(node.triggerId)) throw new Error('Input trigger is outside the caller domain');
      if (parameter?.mode === 'reference' && parameter.type !== (node.property === 'enabled' ? 'boolean' : 'number')) throw new Error('Trigger reference type does not match its property');
    } else if (node.kind === 'engine') {
      if (!domain.scene) throw new Error('Scene attributes are outside the caller domain');
      if (parameter?.mode === 'reference' && parameter.type !== 'number') throw new Error('Scene references require a number input');
    } else if (node.kind === 'formula') walk(parseNumericFormula(node.source, node.variables ?? {}));
    else if (node.kind === 'expression') { walk(node.left); if (node.right) walk(node.right); }
  };
  walk(value);
}
