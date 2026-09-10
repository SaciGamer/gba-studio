import useAppContexts from '@/providers/contexts/AppContexts';
import { IVariableBooleanArgs, IVariableLiteral, IVariableSetValueArgs, IVariableValue, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { EVariableType, IVariableDefinition, VariableValue } from '@/providers/contexts/interfaces/IVariablesElement';
import { Button, Cascader, Flex, Input, InputNumber, Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { EEvents } from './interfaces/IEvents';

interface VariableEventProps {
  event: IScriptsElement | undefined;
  onValueChange: (eventId: string, eventArgs: any) => void;
}

const getScope = (variable: IVariableDefinition): string => variable.scope || 'GLOBAL';

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
  return (
    <Space.Compact block style={{ width: '100%' }}>
      <Button type="text" style={{ width: 42, paddingInline: 0, fontWeight: 600 }}>$</Button>
      <Select
        aria-label="Variable"
        style={{ minWidth: 0, flex: 1 }}
        placeholder="Variable"
        value={value || undefined}
        options={variables.map(variable => ({
          value: variable.id,
          label: `${getScope(variable)}: ${variable.name || variable.symbol}`,
        }))}
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
  if (type === 'boolean') return <Select<boolean> aria-label="Value" value={value as boolean} options={[{ value: true, label: 'True' }, { value: false, label: 'False' }]} onChange={onChange} />;
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
  const prefix = value.kind === 'variable' ? '$' : type === 'boolean' ? (value.value ? 'T' : 'F') : type === 'number' ? '#' : '""';

  return (
    <Space.Compact block style={{ width: '100%' }}>
      <Cascader
        aria-label="Value"
        allowClear={false}
        style={{ width: 42 }}
        value={value.kind === 'variable' ? ['Variables', value.variableId] : type === 'boolean' ? ['Boolean', String(value.value)] : [type === 'number' ? 'Number' : 'Text']}
        options={[
          { value: 'Number', label: 'Number' },
          { value: 'Text', label: 'Text' },
          { value: 'Variables', label: 'Variables', children: variables.filter(variable => variable.type === type).map(variable => ({ value: variable.id, label: variable.name || variable.symbol })) },
          { value: 'Boolean', label: 'Boolean', children: [{ value: 'true', label: 'True' }, { value: 'false', label: 'False' }] },
        ]}
        displayRender={() => prefix}
        onChange={(path) => {
          const [category, selected] = path as string[];
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
          style={{ flex: 1 }}
          value={value.variableId}
          options={variables.filter(variable => variable.type === type).map(variable => ({ value: variable.id, label: variable.name || variable.symbol }))}
          onChange={(variableId: string) => {
            const variable = variables.find(item => item.id === variableId);
            if (variable) onChange({ kind: 'variable', variableId, symbol: variable.symbol, type: variable.type });
          }}
        />
      ) : type === 'boolean' ? (
        <Select<boolean>
          aria-label="Boolean value"
          value={value.value as boolean}
          options={[{ value: true, label: 'True' }, { value: false, label: 'False' }]}
          onChange={(next) => onChange({ kind: 'literal', type: 'boolean', value: next })}
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
  const { variables } = useAppContexts();
  const [variableId, setVariableId] = useState('');
  const [value, setValue] = useState<IVariableValue>({ kind: 'literal', type: 'number', value: 0 });
  const [scope, setScope] = useState<'ALL' | 'GLOBAL' | 'LOCAL' | 'TEMP'>('ALL');
  const selectedVariable = variables.variables.find(variable => variable.id === variableId);
  const type = selectedVariable?.type || 'number';

  useEffect(() => {
    const args = event?.args as Partial<IVariableSetValueArgs & IVariableBooleanArgs & { scope: typeof scope }> | undefined;
    setVariableId(args?.variableId || '');
    setScope(args?.scope || 'ALL');
    if (args && 'value' in args && args.value) setValue(args.value);
  }, [event]);

  const update = (patch: Record<string, unknown>) => {
    if (!event?.id) return;
    onValueChange(event.id, { ...event.args, ...patch });
  };

  if (event?.command === EEvents.VARIABLE_RESET_ALL) {
    return <Select aria-label="Reset scope" value={scope} options={['ALL', 'GLOBAL', 'LOCAL', 'TEMP'].map(item => ({ value: item, label: `Reset ${item} variables to default` }))} onChange={(next) => { setScope(next); update({ scope: next }); }} />;
  }

  const selectVariable = (variable: IVariableDefinition) => {
    const nextValue = value.kind === 'literal' ? { kind: 'literal' as const, type: variable.type, value: valueForType(variable.type) } : value;
    setVariableId(variable.id);
    setValue(nextValue);
    update({ variableId: variable.id, variableSymbol: variable.symbol, ...(event?.command === EEvents.VARIABLE_SET_VALUE ? { value: nextValue } : {}) });
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Flex align="center" gap={8} style={{ width: '100%' }}>
        <Typography.Text style={{ width: 56, flex: '0 0 56px' }}>Variable</Typography.Text>
        <VariableSelector value={variableId} variables={variables.variables} onChange={selectVariable} />
      </Flex>
      {event?.command === EEvents.VARIABLE && (
        <Flex align="center" gap={8} style={{ width: '100%' }}>
          <Typography.Text style={{ width: 56, flex: '0 0 56px' }}>Value</Typography.Text>
          <ValueEditor value={value} variables={variables.variables} type={type} onChange={(next) => { setValue(next); update({ value: next }); }} />
        </Flex>
      )}
    </Space>
  );
}