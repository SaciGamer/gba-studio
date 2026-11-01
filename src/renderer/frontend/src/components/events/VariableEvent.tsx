import { isActiveProjectEntry } from '../../../../../shared/projectCollectionEntries';
import useAppContexts from '@/providers/contexts/AppContexts';
import { IVariableBooleanArgs, IVariableLiteral, IVariableSetValueArgs, IVariableValue, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { EVariableType, IVariableDefinition, VariableValue } from '@/providers/contexts/interfaces/IVariablesElement';
import { Button, Cascader, Flex, Input, Select, Space, Typography } from 'antd';
import StepInputNumber, { InputNumber } from '../StepInputNumber';
import NumericEventInput from '../NumericEventInput';
import type { NumericValue } from '../../../../../shared/numericValues';
import { useEffect, useState } from 'react';
import { EEvents } from './interfaces/IEvents';
import { useScriptParameterVariables } from './ScriptParameterContext';
import { variableOptions, variableCascaderOptions, variableCascaderPath } from './variableOptions';
import { useI18n } from '@/i18n/I18n';

interface VariableEventProps {
  event: IScriptsElement | undefined;
  onValueChange: (eventId: string, eventArgs: any) => void;
}


const valueForType = (type: EVariableType): VariableValue => type === 'number' ? 0 : type === 'boolean' ? false : '';

function VariableSelector({
  value,
  variables,
  onChange,
}: {
  value: string;
  variables: IVariableDefinition[];
  onChange: (variable: IVariableDefinition) => void;
}) {
  const { t } = useI18n();
  return (
    <Space.Compact block style={{ width: 0, minWidth: 0, flex: '1 1 0' }}>
      <Button type="text" style={{ width: 42, flex: '0 0 42px', paddingInline: 0, fontWeight: 600 }}>$</Button>
      <Select
        aria-label="Variable"
        showSearch optionFilterProp="label"
        style={{ minWidth: 0, flex: 1 }}
        placeholder="Variable"
        value={value || undefined}
        options={variableOptions(variables, t)}
        onChange={(id: string) => {
          const variable = variables.find(item => item.id === id);
          if (variable) onChange(variable);
        }}
      />
    </Space.Compact>
  );
}

function LiteralEditor({
  value,
  type,
  onChange,
}: {
  value: VariableValue;
  type: EVariableType;
  onChange: (value: VariableValue) => void;
}) {
  if (type === 'number') return <InputNumber aria-label="Value" value={value as number} onChange={(next) => onChange(next ?? 0)} />;
  if (type === 'boolean') return <Select<string> aria-label="Value" value={String(value as boolean)} options={[{ value: 'true', label: 'True' }, { value: 'false', label: 'False' }]} onChange={(next) => onChange(next === 'true')} />;
  return <Input aria-label="Value" value={value as string} onChange={(event) => onChange(event.target.value)} />;
}

function ValueEditor({
  value,
  variables,
  type,
  onChange,
}: {
  value: IVariableValue;
  variables: IVariableDefinition[];
  type: EVariableType;
  onChange: (value: IVariableValue) => void;
}) {
  const { t } = useI18n();
  const prefix = value.kind === 'variable' ? '$' : type === 'boolean' ? (value.value ? 'T' : 'F') : type === 'number' ? '#' : '""';

  return (
    <Space.Compact block style={{ width: 0, minWidth: 0, flex: '1 1 0' }}>
      <Cascader
        aria-label="Value"
        allowClear={false}
        style={{ width: 42, flex: '0 0 42px' }}
        value={value.kind === 'variable' ? variableCascaderPath(value.variableId) : type === 'boolean' ? ['Boolean', String(value.value)] : [type === 'number' ? 'Number' : 'Text']}
        options={[
          { value: 'Number', label: 'Number' },
          { value: 'Text', label: 'Text' },
          { value: 'Variables', label: 'Variables', children: variableCascaderOptions(variables.filter(variable => variable.type === type), t) },
          { value: 'Boolean', label: 'Boolean', children: [{ value: 'true', label: 'True' }, { value: 'false', label: 'False' }] },
        ]}
        displayRender={() => prefix}
        onChange={(path) => {
          const category = path[0], selected = path[path.length - 1] as string;
          if (category === 'Variables' && selected) {
            const variable = variables.find(item => item.id === selected);
            if (variable) onChange({ kind: 'variable', variableId: variable.id, symbol: variable.symbol, type: variable.type });
          } else if (category === 'Boolean' && selected) {
            onChange({ kind: 'literal', type: 'boolean', value: selected === 'true' });
          } else if (category === 'Number') {
            onChange({ kind: 'literal', type: 'number', value: 0 });
          } else if (category === 'Text') {
            onChange({ kind: 'literal', type: 'string', value: '' });
          }
        }}
      />
      {value.kind === 'variable' ? (
        <Select
          aria-label="Value variable"
          style={{ flex: 1, minWidth: 0 }}
          value={value.variableId}
          options={variableOptions(variables.filter(variable => variable.type === type), t)}
          onChange={(variableId: string) => {
            const variable = variables.find(item => item.id === variableId);
            if (variable) onChange({ kind: 'variable', variableId, symbol: variable.symbol, type: variable.type });
          }}
        />
      ) : type === 'boolean' ? (
        <Select<string>
          aria-label="Boolean value"
          value={String(value.value as boolean)}
          options={[{ value: 'true', label: 'True' }, { value: 'false', label: 'False' }]}
          onChange={(next) => onChange({ kind: 'literal', type: 'boolean', value: next === 'true' })}
        />
      ) : (
        <LiteralEditor
          value={value.value}
          type={type}
          onChange={(literal) => onChange({ kind: 'literal', type, value: literal })}
        />
      )}
    </Space.Compact>
  );
}

export default function VariableEvent({ event, onValueChange }: VariableEventProps) {
  const { t } = useI18n();
  const { variables: globalVariables } = useAppContexts();
  const parameters = useScriptParameterVariables();
  const variables = { variables: [...parameters, ...globalVariables.variables].filter(isActiveProjectEntry) };
  const [variableId, setVariableId] = useState('');
  const [value, setValue] = useState<IVariableValue | NumericValue>({ kind: 'literal', type: 'number', value: 0 });
  const selectedVariable = variables.variables.find(variable => variable.id === variableId);
  const type = selectedVariable?.type || 'number';

  useEffect(() => {
    const args = event?.args as Partial<IVariableSetValueArgs & IVariableBooleanArgs> | undefined;
    setVariableId(args?.variableId || '');
    if (args && 'value' in args && args.value) setValue(args.value);
  }, [event]);

  const update = (patch: Record<string, unknown>) => {
    if (!event?.id) return;
    onValueChange(event.id, { ...event.args, ...patch });
  };

  if (event?.command === EEvents.LOCAL_VARIABLE_RESET) {
    return <Typography.Text type="secondary">{t('events.variables.resetLocalHelp')}</Typography.Text>;
  }
  if (event?.command === EEvents.VARIABLE_RESET_ALL) {
    return <Typography.Text type="secondary">{t('events.variables.resetAllHelp')}</Typography.Text>;
  }

  const selectVariable = (variable: IVariableDefinition) => {
    const nextValue = value.kind === 'literal'
      ? value.type === variable.type || (value.type === 'boolean' && variable.type !== 'string') ? value : { kind: 'literal' as const, type: variable.type, value: valueForType(variable.type) }
      : variable.type === 'string' ? { kind: 'literal' as const, type: variable.type, value: '' }
        : value.kind === 'variable' ? { kind: 'variable' as const, variableId: value.variableId } : value;
    setVariableId(variable.id);
    setValue(nextValue);
    update({ variableId: variable.id, variableSymbol: variable.symbol, ...(event?.command === EEvents.VARIABLE ? { value: nextValue } : {}) });
  };

  return (
    <Flex vertical gap={8} style={{ width: '100%', minWidth: 0 }}>
      <Flex align="center" gap={8} style={{ width: '100%' }}>
        <Typography.Text style={{ width: 56, flex: '0 0 56px' }}>Variable</Typography.Text>
        <VariableSelector value={variableId} variables={variables.variables} onChange={selectVariable} />
      </Flex>
      {event?.command === EEvents.VARIABLE && (
        <Flex align="center" gap={8} style={{ width: '100%' }}>
          <Typography.Text style={{ width: 56, flex: '0 0 56px' }}>Value</Typography.Text>
          {type !== 'string'
            ? <NumericEventInput style={{ flex: '1 1 0', width: 0, minWidth: 0 }} renderNumber={type === 'boolean' ? (number, onChange) => <Select value={number !== 0} style={{ flex: 1, minWidth: 0 }} options={[{ value: true, label: 'True' }, { value: false, label: 'False' }]} onChange={value => onChange(value ? 1 : 0)} /> : undefined} value={value} onChange={next => { const operand = typeof next === 'number' ? { kind: 'literal' as const, type, value: type === 'boolean' ? next !== 0 : next } : next; setValue(operand); update({ value: operand }); }} />
            : <ValueEditor value={value as IVariableValue} variables={variables.variables} type={type} onChange={(next) => { setValue(next); update({ value: next }); }} />}
        </Flex>
      )}
    </Flex>
  );
}
