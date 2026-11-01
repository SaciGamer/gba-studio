import { isLocalVariable } from '../../../../../shared/localVariables';
import { isActiveProjectEntry } from '../../../../../shared/projectCollectionEntries';
import { isScriptParameter } from '../../../../../shared/scriptParameters';
import type { IVariableDefinition } from '@/providers/contexts/interfaces/IVariablesElement';

type Translate = (key: string) => string;
export function variableOptionLabel(variable: IVariableDefinition, _t: Translate) {
  return variable.name || variable.symbol;
}
const groups = [
  { value: 'Parameter', key: 'scripts.parameterGroup', accepts: (id: string) => isScriptParameter(id) },
  { value: 'Local', key: 'variables.localGroup', accepts: (id: string) => isLocalVariable(id) },
  { value: 'Global', key: 'scripts.globalGroup', accepts: (id: string) => !isScriptParameter(id) && !isLocalVariable(id) },
];
export function variableOptions(variables: IVariableDefinition[], t: Translate) {
  return groups.map(group => ({ label: t(group.key), options: variables.filter(isActiveProjectEntry).filter(variable => group.accepts(variable.id))
    .map(variable => ({ value: variable.id, label: variableOptionLabel(variable, t), searchText: `${variable.name ?? ''} ${variable.symbol ?? ''} ${variable.id}` })) })).filter(group => group.options.length);
}
export const variableCascaderPath = (id: string) => ['Variables', isScriptParameter(id) ? 'Parameter' : isLocalVariable(id) ? 'Local' : 'Global', id];
export function variableCascaderOptions(variables: IVariableDefinition[], t: Translate) {
  return groups.map(group => ({ value: group.value, label: t(group.key), children: variables.filter(isActiveProjectEntry).filter(variable => group.accepts(variable.id))
    .map(variable => ({ value: variable.id, label: variableOptionLabel(variable, t) })) })).filter(group => group.children.length);
}

const normalizeVariableSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
export function filterVariableOption(input: string, option?: { label?: unknown; searchText?: string }) {
  return normalizeVariableSearch(option?.searchText ?? String(option?.label ?? '')).includes(normalizeVariableSearch(input.trim()));
}
