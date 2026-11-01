import useAppContexts from '@/providers/contexts/AppContexts';
import { useI18n } from '@/i18n/I18n';
import { LOCAL_VARIABLES, hasLocalVariableOwner } from '../../../../../shared/localVariables';
import { createContext, useContext } from 'react';
import { scriptParameterLabel, type ScriptParameter } from '../../../../../shared/scriptParameters';

export const ScriptParameterContext = createContext<ScriptParameter[]>([]);
export function useScriptParameterVariables() {
  const context = useAppContexts();
  const { t } = useI18n();
  const parameters = useContext(ScriptParameterContext).map(parameter => ({ id: parameter.id, name: scriptParameterLabel(parameter),
    symbol: scriptParameterLabel(parameter), type: parameter.type, scope: 'TEMP' as const, initialValue: parameter.type === 'string' ? '' : parameter.type === 'boolean' ? false : 0 }));
  return [...parameters, ...(hasLocalVariableOwner(context) ? LOCAL_VARIABLES.map(variable => ({ ...variable, name: t('variables.localSlot', { slot: variable.id.slice(-1) }) })) : [])];
}
