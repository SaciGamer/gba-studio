import { isActiveProjectEntry } from '../../../../../shared/projectCollectionEntries';
import { withDefaultInputMap } from '../../../../../shared/inputMap';
import useAppContexts from '@/providers/contexts/AppContexts';
import { useScriptParameterVariables } from './ScriptParameterContext';
import { filterVariableOption, variableOptions, variableCascaderOptions, variableCascaderPath } from './variableOptions';
import { useI18n } from '@/i18n/I18n';
import { IConditionValue, IIfArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { Cascader, Input, Select, Space, Typography } from 'antd';
import StepInputNumber, { InputNumber } from '../StepInputNumber';
import NumericEventInput from '../NumericEventInput';
import { useEffect, useState } from 'react';

interface IfEventProps {
  event: IScriptsElement | undefined;
  onValueChange: (eventId: string, eventArgs: IIfArgs) => void;
}

const operators = [
  { value: 'equality', label: 'Equality', children: [{ value: '==', label: 'equals' }, { value: '!=', label: 'not equals' }] },
  { value: 'ordering', label: 'Ordering', children: [
    { value: '>', label: 'greater than' },
    { value: '>=', label: 'greater or equal' },
    { value: '<', label: 'less than' },
    { value: '<=', label: 'less or equal' },
  ] },
];

const defaultValue = (): IConditionValue => ({ kind: 'literal', type: 'number', value: 0 });

const firstVariableValue = (variables: ReturnType<typeof useAppContexts>['variables']['variables']): IConditionValue => {
  const variable = variables[0];
  return variable
    ? { kind: 'variable', variableId: variable.id, symbol: variable.symbol, type: variable.type }
    : defaultValue();
};

const prefixForValue = (value: IConditionValue): string => {
  if (value.kind === 'variable') return '$';
  if (value.kind === 'button') return `B:${value.button}`;
  if (value.type === 'boolean') return value.value ? 'T' : 'F';
  if (value.type === 'number') return '#';
  return '""';
};

export function Operand({
  value,
  variables,
  buttonOptions,
  onChange,
}: {
  value: IConditionValue;
  variables: ReturnType<typeof useAppContexts>['variables']['variables'];
  buttonOptions: Array<{ value: string; label: string }>;
  onChange: (value: IConditionValue) => void;
}) {
  const { t } = useI18n();
  const selectedVariable = value.kind === 'variable'
    ? variables.find(variable => variable.id === value.variableId)
    : undefined;
  const type = selectedVariable?.type || value.type;

  if (type === 'number' || (value.kind === 'variable' && value.type === undefined) || (!['literal', 'variable', 'button'].includes(value.kind))) {
    return <NumericEventInput value={value} onChange={next => onChange(typeof next === 'number' ? { kind: 'literal', type: 'number', value: next } : next)} />;
  }
  const renderLiteral = () => {
    if (value.kind === 'button') {
      return <Select showSearch optionFilterProp="label" value={value.button} options={buttonOptions} onChange={button => onChange({ kind: 'button', type: 'boolean', button })} />;
    }
    if (type === 'boolean') {
      return (
        <Select
          aria-label="Boolean value"
          showSearch optionFilterProp="label"
          value={value.kind === 'literal' ? value.value as boolean : false}
          options={[{ value: true, label: 'True' }, { value: false, label: 'False' }]}
          onChange={(next) => onChange({ kind: 'literal', type, value: next })}
        />
      );
    }
    return <Input value={value.kind === 'literal' ? value.value as string : ''} onChange={(event) => onChange({ kind: 'literal', type: 'string', value: event.target.value })} />;
  };

  return (
    <Space.Compact block>
      <Cascader
        showSearch
        allowClear={false}
        value={value.kind === 'variable' ? variableCascaderPath(value.variableId) : value.kind === 'button' ? ['Button', value.button] : value.type === 'boolean' ? ['Boolean', String(value.value)] : [value.type === 'number' ? 'Number' : 'Text']}
        options={[
          { value: 'Number', label: 'Number' },
          { value: 'Text', label: 'Text' },
          { value: 'Variables', label: 'Variables', children: variableCascaderOptions(variables, t) },
          { value: 'Boolean', label: 'Boolean', children: [{ value: 'true', label: 'True' }, { value: 'false', label: 'False' }] },
          { value: 'Button', label: 'Button', children: buttonOptions },
        ]}
        displayRender={() => prefixForValue(value)}
        style={{ width: 42 }}
        onChange={(path) => {
          const category = path[0], selected = path[path.length - 1] as string;
          if (category === 'Variables' && selected) {
            const variable = variables.find(item => item.id === selected);
            if (variable) onChange({ kind: 'variable', variableId: variable.id, symbol: variable.symbol, type: variable.type });
          } else if (category === 'Boolean' && selected) {
            onChange({ kind: 'literal', type: 'boolean', value: selected === 'true' });
          } else if (category === 'Button' && selected) {
            onChange({ kind: 'button', type: 'boolean', button: selected });
          } else if (category === 'Number') {
            onChange({ kind: 'literal', type: 'number', value: 0 });
          } else if (category === 'Text') {
            onChange({ kind: 'literal', type: 'string', value: '' });
          }
        }}
      />
      {value.kind === 'variable' ? (
        <Select
          aria-label="Variable value"
          showSearch filterOption={filterVariableOption}
          style={{ flex: 1 }}
          value={value.variableId}
          options={variableOptions(variables, t)}
          onChange={(variableId: string) => {
            const variable = variables.find(item => item.id === variableId);
            if (variable) onChange({ kind: 'variable', variableId, symbol: variable.symbol, type: variable.type });
          }}
        />
      ) : renderLiteral()}
    </Space.Compact>
  );
}

export default function IfEvent({ event, onValueChange }: IfEventProps) {
  const { variables: globalVariables, settings } = useAppContexts();
  const parameters = useScriptParameterVariables();
  const variables = { variables: [...parameters, ...globalVariables.variables].filter(isActiveProjectEntry) };
  const buttonOptions = [
    ...['A', 'B', 'L', 'R', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT'].map(button => ({ value: button, label: button })),
    ...Object.keys(withDefaultInputMap(settings?.inputMap)).map(action => ({ value: action, label: `Action: ${action}` })),
  ];
  const args = event?.args as IIfArgs | undefined;
  const [condition, setCondition] = useState<IIfArgs>({
    left: args?.left || firstVariableValue(variables.variables),
    operator: args?.operator || '==',
    right: args?.right || firstVariableValue(variables.variables),
  });

  useEffect(() => {
    if (args) setCondition({ left: args.left, operator: args.operator, right: args.right });
  }, [args]);

  const update = (next: IIfArgs) => {
    setCondition(next);
    if (event?.id) onValueChange(event.id, next);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Text strong>Condition</Typography.Text>
      <Operand value={condition.left} variables={variables.variables} buttonOptions={buttonOptions} onChange={(left) => update({ ...condition, left })} />
      <Cascader
        showSearch
        style={{ width: '100%' }}
        allowClear={false}
        value={[condition.operator === '==' || condition.operator === '!=' ? 'equality' : 'ordering', condition.operator]}
        options={operators}
        displayRender={(labels) => labels[labels.length - 1]}
        onChange={(path) => update({ ...condition, operator: path[path.length - 1] as IIfArgs['operator'] })}
      />
      <Operand value={condition.right} variables={variables.variables} buttonOptions={buttonOptions} onChange={(right) => update({ ...condition, right })} />
    </Space>
  );
}
