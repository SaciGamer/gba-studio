import { isActiveProjectEntry } from '../../../../../shared/projectCollectionEntries';
import { withDefaultInputMap } from '../../../../../shared/inputMap';
import useAppContexts from '@/providers/contexts/AppContexts';
import { IConditionValue, IArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { useScriptParameterVariables } from './ScriptParameterContext';
import { Operand } from './IfEvent';
import { useI18n } from '@/i18n/I18n';
import { Space, Typography } from 'antd';

export default function SwitchEvent({ event, onValueChange }: { event: IScriptsElement; onValueChange: (id: string, args: IArgs) => void }) {
  const { variables: globals, settings } = useAppContexts();
  const parameters = useScriptParameterVariables();
  const variables = [...parameters, ...globals.variables].filter(isActiveProjectEntry);
  const value = (event.args?.value ?? { kind: 'literal', type: 'number', value: 0 }) as IConditionValue;
  const { t } = useI18n();
  const buttons = [...['A', 'B', 'L', 'R', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT'].map(button => ({ value: button, label: button })), ...Object.keys(withDefaultInputMap(settings?.inputMap)).map(action => ({ value: action, label: `Action: ${action}` }))];
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Typography.Text strong>{t('events.switch.value')}</Typography.Text>
    <Operand value={value} variables={variables} buttonOptions={buttons} onChange={next => onValueChange(event.id, { value: next })} />
  </Space>;
}
