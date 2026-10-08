import React, { useRef, useState } from 'react';
import { AutoComplete, Button, Dropdown, Flex, Input, Radio, Select, Space, Typography, theme } from 'antd';
import type { InputRef, MenuProps } from 'antd';
import { parseNumericFormula } from '../../../../shared/numericFormula';
import { CaretLeftFilled, CaretUpFilled, CaretDownFilled, CaretRightFilled, CheckOutlined } from '@ant-design/icons';
import { InputNumber } from './StepInputNumber';
import useAppContexts from '@/providers/contexts/AppContexts';
import { useI18n } from '@/i18n/I18n';
import { normalizeNumericValue, NUMERIC_CONSTANTS, NUMERIC_DIRECTIONS, NUMERIC_ENGINE_FIELDS, NUMERIC_MAX_DEPTH, NUMERIC_OPERATIONS, NUMERIC_PROPERTIES, validateNumericValue, type NumericOperation, type NumericValue } from '../../../../shared/numericValues';

let copiedValue: NumericValue | null = null;
type Props = { value: unknown; onChange: (value: NumericValue) => void; label?: string; min?: number; max?: number; style?: React.CSSProperties; depth?: number; disabled?: boolean; renderNumber?: (value: number, onChange: (value: number) => void) => React.ReactNode };
const zero = (): NumericValue => ({ kind: 'number', value: 0 });

/** Shared numeric operand editor. Every operand can open the same type menu. */
export default function NumericValueInput({ value: raw, onChange: onValueChange, label, min, max, style, depth = 0, disabled, renderNumber }: Props) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const context = useAppContexts();
  const [open, setOpen] = useState(false);
  const [operatorOpen, setOperatorOpen] = useState(false);
  const [pasteError, setPasteError] = useState(false);
  const formulaInputRef = useRef<InputRef>(null);
  const [formulaVariableRange, setFormulaVariableRange] = useState<{ start: number; end: number; query: string } | null>(null);
  const booleanLiteral = raw && typeof raw === 'object' && 'kind' in raw && raw.kind === 'literal' && 'type' in raw && raw.type === 'boolean' && 'value' in raw;
  const value: NumericValue = booleanLiteral ? { kind: 'constant', constant: raw.value ? 'true' : 'false' } : normalizeNumericValue(raw);
  const onChange = (next: NumericValue) => {
    let candidate = next;
    for (let index = 0; index < depth; ++index) candidate = { kind: 'expression', operation: 'abs', left: candidate };
    try { validateNumericValue(candidate, { allowIncompleteFormula: true }); setPasteError(false); onValueChange(next); }
    catch { setPasteError(true); }
  };
  const variables = (context.variables?.variables ?? []).filter(variable => variable.type !== 'string');
  const actors = (context.scenes ?? []).filter(scene => !scene._deleted && scene.id === context.elementSelected?.id)
    .flatMap(scene => (scene.actors ?? []).map(actor => ({ value: actor.id!, label: actor.name || actor.id })));
  const booleanConstant = value.kind === 'constant' && (value.constant === 'true' || value.constant === 'false');
  const prefix = booleanConstant ? value.constant === 'true' ? 'T' : 'F' : ({ number: '#', variable: '$', constant: 'C', property: 'P', engine: 'G', direction: 'D', expression: '', formula: '\u2211' } as const)[value.kind];
  const formulaBindings = { ...(value.kind === 'formula' ? value.variables : {}) };
  variables.forEach(variable => {
    formulaBindings[variable.id] = variable.id;
    if (variable.symbol) formulaBindings[variable.symbol.replace(/^\$/, '')] = variable.id;
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.name ?? '')) formulaBindings[variable.name!] = variable.id;
  });
  const findFormulaVariable = (source: string, cursor: number) => {
    const match = source.slice(0, cursor).match(/\$([A-Za-z0-9_]*)$/);
    if (!match) { setFormulaVariableRange(null); return; }
    const tail = source.slice(cursor).match(/^[A-Za-z0-9_]*/)?.[0] ?? '';
    setFormulaVariableRange({ start: cursor - match[0].length, end: cursor + tail.length, query: match[1] });
  };
  const formulaVariableOptions = value.kind === 'formula' && formulaVariableRange ? variables
    .filter(variable => `${variable.name} ${variable.symbol} ${variable.id}`.toLowerCase().includes(formulaVariableRange.query.toLowerCase()))
    .map(variable => {
      const symbol = variable.symbol?.replace(/^\$/, '') || variable.name || '';
      const reference = /^[A-Za-z_][A-Za-z0-9_]*$/.test(symbol) && formulaBindings[symbol] === variable.id ? '$' + symbol : '$[' + variable.id + ']';
      return { value: value.source.slice(0, formulaVariableRange.start) + reference + value.source.slice(formulaVariableRange.end),
        label: variable.name || variable.symbol || variable.id, reference, variableId: variable.id };
    }) : [];
  const menuIcon = (selected = false) => <span aria-hidden="true" style={{ display: 'inline-flex', width: 14, minWidth: 14, justifyContent: 'center' }}>{selected ? <CheckOutlined /> : null}</span>;
  const operationGroups = (['math', 'boolean', 'comparison', 'bitwise'] as const).map(group => ({ key: group, label: t(`values.${group}`), icon: menuIcon(value.kind === 'expression' && NUMERIC_OPERATIONS[value.operation].group === group),
    children: [...(group === 'boolean' ? [
      { key: 'boolean:true', label: t('values.constant.true'), icon: menuIcon(value.kind === 'constant' && value.constant === 'true') },
      { key: 'boolean:false', label: t('values.constant.false'), icon: menuIcon(value.kind === 'constant' && value.constant === 'false') },
    ] : []), ...Object.entries(NUMERIC_OPERATIONS).filter(([, definition]) => definition.group === group).map(([key, definition]) => ({ key: `op:${key}`, icon: menuIcon(value.kind === 'expression' && value.operation === key), label: <Flex justify="space-between" gap={20}><span>{t(`values.operation.${key}`)}</span><Typography.Text type="secondary">{definition.symbol}</Typography.Text></Flex> }))] }));
  const checked = (kind: NumericValue['kind']) => menuIcon(value.kind === kind);
  const items: MenuProps['items'] = [
    { type: 'group', label: t('values.sourcesTitle'), children: [
      { key: 'number', label: t('values.number'), icon: checked('number') },
      { key: 'variable', label: t('values.variable'), icon: checked('variable'), disabled: variables.length === 0 },
      { key: 'constant', label: t('values.constant'), icon: checked('constant') },
      { key: 'property', label: t('values.property'), icon: checked('property') },
      { key: 'engine', label: t('values.engine'), icon: checked('engine') },
      { key: 'expression', label: t('values.expression'), icon: checked('formula') },
      { key: 'direction', label: t('values.direction'), icon: checked('direction') },
    ] },
    { type: 'group', label: t('values.operationsTitle'), children: operationGroups.map(group => ({ ...group, disabled: depth >= NUMERIC_MAX_DEPTH })) },
    { type: 'divider' },
    { key: 'copy', label: t('values.copy'), icon: menuIcon() },
    { key: 'paste', label: t('values.paste'), icon: menuIcon(), disabled: !copiedValue },
  ];
  const selectKind = (key: string) => {
    setOpen(false);
    setOperatorOpen(false);
    setPasteError(false);
    setFormulaVariableRange(null);
    if (key === 'boolean:true' || key === 'boolean:false') { onChange({ kind: 'constant', constant: key === 'boolean:true' ? 'true' : 'false' }); return; }
    if (key === 'remove' && value.kind === 'expression') { onChange(value.left); return; }
    if (key === 'copy') { copiedValue = structuredClone(value); return; }
    if (key === 'paste') {
      if (copiedValue) {
        // Enforce the total nesting budget when pasting into an operand.
        let candidate = structuredClone(copiedValue);
        for (let index = 0; index < depth; ++index) candidate = { kind: 'expression', operation: 'abs', left: candidate };
        try { validateNumericValue(candidate, { allowIncompleteFormula: true }); onChange(structuredClone(copiedValue)); } catch { setPasteError(true); }
      }
      return;
    }
    if (key === 'expression') {
      let source = value.kind === 'formula' ? value.source : value.kind === 'number' ? String(value.value) : '0';
      if (value.kind === 'variable') {
        const variable = variables.find(variable => variable.id === value.variableId);
        const symbol = variable?.symbol?.replace(/^\$/, '') || variable?.name || '';
        source = /^[A-Za-z_][A-Za-z0-9_]*$/.test(symbol) ? '$' + symbol : '$[' + value.variableId + ']';
      } else if (value.kind === 'constant') source = String(NUMERIC_CONSTANTS[value.constant]);
      else if (value.kind === 'direction') source = String(NUMERIC_DIRECTIONS[value.direction]);
      onChange({ kind: 'formula', source, variables: formulaBindings }); return;
    }
    if (key.startsWith('op:')) {
      const operation = key.slice(3) as NumericOperation;
      onChange({ kind: 'expression', operation, left: value.kind === 'expression' ? value.left : value,
        ...(NUMERIC_OPERATIONS[operation].arity === 2 ? { right: value.kind === 'expression' ? value.right ?? zero() : zero() } : {}) });
    } else if (key === 'number') onChange(zero());
    else if (key === 'variable') onChange({ kind: 'variable', variableId: variables[0]?.id ?? '' });
    else if (key === 'constant') onChange({ kind: 'constant', constant: 'screenWidth' });
    else if (key === 'property') onChange({ kind: 'property', actorId: '__PLAYER__', property: 'x' });
    else if (key === 'engine') onChange({ kind: 'engine', field: 'cameraX' });
    else if (key === 'direction') onChange({ kind: 'direction', direction: 'right' });
  };
  const operatorItems: MenuProps['items'] = [
    ...operationGroups,
    { type: 'divider' },
    { key: 'copy', label: t('values.copy'), icon: menuIcon() },
    { key: 'paste', label: t('values.paste'), icon: menuIcon(), disabled: !copiedValue },
    { type: 'divider' },
    { key: 'remove', label: t('values.remove'), icon: menuIcon(), danger: true },
  ];
  const operatorControl = value.kind === 'expression' ? <Dropdown classNames={{ root: 'numeric-operator-menu' }} destroyOnHidden trigger={['click']} open={operatorOpen} onOpenChange={setOperatorOpen} disabled={disabled}
    menu={{ items: operatorItems, selectedKeys: [`op:${value.operation}`], subMenuOpenDelay: 0, subMenuCloseDelay: 0.5, onClick: ({ key }) => selectKind(key) }}>
    <Button type="text" size="small" aria-label={t('values.editOperator')} title={t(`values.operation.${value.operation}`)} disabled={disabled}
      style={{ alignSelf: 'flex-start', paddingInline: 4, height: 24, color: token.colorTextSecondary }}>
      {NUMERIC_OPERATIONS[value.operation].symbol}
    </Button>
  </Dropdown> : null;
  const prefixControl = <Dropdown destroyOnHidden menu={{ items, subMenuOpenDelay: 0, subMenuCloseDelay: 0.5, onClick: ({ key }) => selectKind(key) }} trigger={['click']} open={open} onOpenChange={setOpen} disabled={disabled}>
    <Button aria-label={t('values.chooseType')} title={t(`values.${booleanConstant ? 'boolean' : value.kind === 'formula' ? 'expression' : value.kind === 'expression' ? 'math' : value.kind}`)} disabled={disabled} style={{ paddingInline: 10, flex: 'none', background: token.colorBgContainerDisabled, color: disabled ? token.colorTextDisabled : token.colorText }}>{prefix}</Button>
  </Dropdown>;
  const selectStyle = { flex: 1, minWidth: 0 };
  let control: React.ReactNode;
  if (value.kind === 'number') control = renderNumber ? renderNumber(value.value, next => onChange({ kind: 'number', value: next })) : <InputNumber aria-label={label || t('values.number')} value={value.value} min={min ?? -2147483648} max={max ?? 2147483647} precision={0} disabled={disabled} style={selectStyle} onChange={next => onChange({ kind: 'number', value: Number(next ?? 0) })} />;
  else if (value.kind === 'variable') control = <Select aria-label={t('values.variable')} showSearch optionFilterProp="label" value={value.variableId || undefined} placeholder={t('values.selectVariable')} disabled={disabled} style={selectStyle} options={variables.map(variable => ({ value: variable.id, label: variable.name || variable.symbol || variable.id }))} onChange={variableId => onChange({ kind: 'variable', variableId })} />;
  else if (value.kind === 'constant') control = booleanConstant
    ? <Input aria-label={t('values.boolean')} value={value.constant} readOnly disabled={disabled} style={selectStyle} />
    : <Select aria-label={t('values.constant')} value={value.constant} disabled={disabled} style={selectStyle} options={Object.entries(NUMERIC_CONSTANTS).map(([key, number]) => ({ value: key, label: `${t(`values.constant.${key}`)} (${number})` }))} onChange={constant => onChange({ ...value, constant })} />;
  else if (value.kind === 'engine') control = <Select aria-label={t('values.engine')} value={value.field} disabled={disabled} style={selectStyle} options={NUMERIC_ENGINE_FIELDS.map(field => ({ value: field, label: t(`values.engine.${field}`) }))} onChange={field => onChange({ ...value, field })} />;
  else if (value.kind === 'direction') control = <Radio.Group aria-label={t('values.direction')} buttonStyle="solid" value={value.direction} disabled={disabled} style={{ ...selectStyle, display: 'flex' }} onChange={event => onChange({ ...value, direction: event.target.value })}>
    {([['left', CaretLeftFilled], ['up', CaretUpFilled], ['down', CaretDownFilled], ['right', CaretRightFilled]] as const).map(([direction, Icon]) => <Radio.Button key={direction} value={direction} aria-label={t(`values.direction.${direction}`)} title={t(`values.direction.${direction}`)} style={{ flex: '1 1 0', minWidth: 0, paddingInline: 0, textAlign: 'center', ...(direction === 'left' ? { borderStartStartRadius: 0, borderEndStartRadius: 0 } : {}) }}><Icon /></Radio.Button>)}
  </Radio.Group>;
  else if (value.kind === 'property') control = <Select aria-label={t('values.property')} value={JSON.stringify([value.actorId, value.property])} disabled={disabled} style={selectStyle}
    labelRender={() => `${value.actorId === '__PLAYER__' ? t('values.player') : actors.find(actor => actor.value === value.actorId)?.label ?? value.actorId}: ${t(`values.property.${value.property}`)}`}
    options={[{ value: '__PLAYER__', label: t('values.player') }, ...actors].map(actor => ({ label: actor.label, options: NUMERIC_PROPERTIES.map(property => ({ value: JSON.stringify([actor.value, property]), label: t(`values.property.${property}`) })) }))}
    onChange={key => { const [actorId, property] = JSON.parse(key); onChange({ kind: 'property', actorId, property }); }} />;
  else if (value.kind === 'formula') control = <AutoComplete style={selectStyle} disabled={disabled} value={value.source}
    open={formulaVariableRange !== null} virtual={false}
    options={formulaVariableOptions.length ? formulaVariableOptions : [{ value: '__no_variable__', label: t('values.noVariables'), disabled: true }]}
    filterOption={false} onBlur={() => setFormulaVariableRange(null)}
    onChange={source => onChange({ kind: 'formula', source, variables: formulaBindings })}
    onSearch={source => findFormulaVariable(source, formulaInputRef.current?.input?.selectionStart ?? source.length)}
    onSelect={(source, option) => {
      const cursor = (formulaVariableRange?.start ?? source.length) + String(option.reference ?? '').length;
      setFormulaVariableRange(null);
      onChange({ kind: 'formula', source, variables: formulaBindings });
      requestAnimationFrame(() => { formulaInputRef.current?.focus(); formulaInputRef.current?.input?.setSelectionRange(cursor, cursor); });
    }}>
    <Input ref={formulaInputRef} aria-label={t('values.expression')} placeholder={t('values.formulaHint')} disabled={disabled}
      onClick={() => findFormulaVariable(value.source, formulaInputRef.current?.input?.selectionStart ?? value.source.length)}
      onKeyDown={event => { if (event.key === 'Escape') { setFormulaVariableRange(null); event.stopPropagation(); } }} />
  </AutoComplete>;
  let formulaInvalid = false;
  if (value.kind === 'formula' && !formulaVariableRange) { try { parseNumericFormula(value.source, value.variables ?? {}); } catch { formulaInvalid = true; } }
  return <Flex vertical gap={4} style={{ minWidth: 0, width: '100%', ...style }} data-numeric-value={value.kind} data-expression-depth={depth} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    {pasteError && <Typography.Text type="danger">{t('values.tooComplex')}</Typography.Text>}
    {label && <Typography.Text style={{ fontSize: 12 }}>{label}</Typography.Text>}
    {formulaInvalid && <Typography.Text type="danger" style={{ fontSize: 12 }}>{t('values.formulaInvalid')}</Typography.Text>}
    {value.kind !== 'expression' && <Space.Compact block style={{ width: '100%', alignItems: 'flex-start' }}>{prefixControl}{control}</Space.Compact>}
    {value.kind === 'expression' && <Flex vertical gap={6} style={{ minWidth: 0, paddingLeft: 7, borderLeft: `2px solid ${token.colorBorder}`, paddingBlock: 4 }}>
      {NUMERIC_OPERATIONS[value.operation].arity === 1 && operatorControl}
      <NumericValueInput value={value.left} disabled={disabled} depth={depth + 1} onChange={left => onChange({ ...value, left })} />
      {NUMERIC_OPERATIONS[value.operation].arity === 2 && <>{operatorControl}<NumericValueInput value={value.right ?? zero()} disabled={disabled} depth={depth + 1} onChange={right => onChange({ ...value, right })} /></>}
    </Flex>}
  </Flex>;
}
