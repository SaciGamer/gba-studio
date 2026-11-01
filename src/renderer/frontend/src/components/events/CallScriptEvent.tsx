import { isActiveProjectEntry } from '../../../../../shared/projectCollectionEntries';
import useAppContexts from '@/providers/contexts/AppContexts';
import { IArgs, ICallScriptArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { Input, Select, Space, Typography } from 'antd';
import NumericValueInput from '../NumericValueInput';
import { useScriptParameterVariables } from './ScriptParameterContext';
import { variableOptions } from './variableOptions';
import { isWritableScriptValue, validateScriptArgument, validateScriptArgumentDomain, scriptParameterLabel, type ScriptArgument, type ScriptParameter } from '../../../../../shared/scriptParameters';
import { useI18n } from '@/i18n/I18n';
import { useEffect, useRef } from 'react';

const normalizeSearch = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

export default function CallScriptEvent({ event, onValueChange }: { event: IScriptsElement; onValueChange: (id: string, args: IArgs) => void }) {
  const { scripts, variables, scenes, elementSelected, settingUtils } = useAppContexts();
  const parameterVariables = useScriptParameterVariables();
  const { t } = useI18n();
  const args = (event.args as ICallScriptArgs | undefined) ?? { scriptId: '' };
  const scriptId = args.scriptId;
  const activeScripts = scripts.scripts.filter(script => !script._deleted);
  const selectedScript = activeScripts.find(script => script.id === scriptId);
  const argumentsList: ScriptArgument[] = args?.arguments ?? [];
  const declarations = useRef(new Map<string, string>());
  const textVariables = [...parameterVariables, ...variables.variables].filter(isActiveProjectEntry).filter(variable => variable.type === 'string');
  const scene = scenes.find(scene => !scene._deleted && scene.id === elementSelected?.id);
  const owner = settingUtils.activeSceneObject;
  const domain = { actors: [...(owner?.type === 'actor' && scene?.actors?.some(actor => actor.id === owner.id) ? ['__SELF__'] : []), ...(scene && !owner ? ['__PLAYER__'] : []), ...(scene?.actors ?? []).filter(actor => !owner || owner.type === 'actor' && actor.id === owner.id).map(actor => actor.id!)],
    triggers: (scene?.triggers ?? []).filter(trigger => !owner || owner.type === 'trigger' && trigger.id === owner.id).map(trigger => trigger.id!),
    scene: !!scene && !owner, variables: new Map([...parameterVariables, ...variables.variables].filter(isActiveProjectEntry).map(variable => [variable.id, variable.type])) };
  const defaultValue = (parameter: ScriptParameter): ScriptArgument['value'] => {
    if(parameter.mode === 'reference') {
      const variable = [...parameterVariables, ...variables.variables].filter(isActiveProjectEntry).find(variable => variable.type === parameter.type);
      if(variable) return parameter.type === 'string' ? { kind: 'variable', type: 'string', variableId: variable.id } : { kind: 'variable', variableId: variable.id };
      if(parameter.type === 'boolean' && domain.triggers.length) return { kind: 'trigger', triggerId: domain.triggers[0], property: 'enabled' };
      if(parameter.type === 'number' && domain.actors.length) return { kind: 'property', actorId: domain.actors[0], property: 'xPixels' };
      if(parameter.type === 'number' && domain.scene) return { kind: 'engine', field: 'cameraX' };
      return parameter.type === 'string' ? { kind: 'variable', type: 'string', variableId: '' } : { kind: 'variable', variableId: '' };
    }
    if(parameter.type === 'string') return { kind: 'literal', type: 'string', value: '' };
    return parameter.type === 'boolean' ? { kind: 'constant', constant: 'false' } : { kind: 'number', value: 0 };
  };
  useEffect(() => {
    if (!selectedScript) return;
    const parameters = selectedScript.parameters ?? [];
    const next = parameters.flatMap(parameter => {
      const key = `${event.id}:${scriptId}:${parameter.id}`;
      const signature = `${parameter.type}:${parameter.mode}`;
      const previous = declarations.current.get(key);
      const changed = previous !== undefined && previous !== signature;
      declarations.current.set(key, signature);
      const existing = argumentsList.find(argument => argument.parameterId === parameter.id);
      if(existing) {
        const value = existing.value;
        // Repair numeric boolean defaults saved by the previous editor.
        if(parameter.mode === 'local' && parameter.type === 'boolean' && value.kind === 'number') {
          return [{ ...existing, value: { kind: 'constant' as const, constant: value.value ? 'true' as const : 'false' as const } }];
        }
        const textValue = 'type' in value && value.type === 'string';
        const wrongValueType = parameter.type === 'string' ? !textValue : textValue;
        const variableType = value.kind === 'variable' ? domain.variables.get(value.variableId) : undefined;
        const wrongReference = parameter.mode === 'reference' && (!isWritableScriptValue(value) || variableType && variableType !== parameter.type);
        if(!wrongValueType && !wrongReference) {
          if(!changed) return [existing]; // Preserve incomplete formulas while the caller edits them.
          try { validateScriptArgument(parameter, existing); validateScriptArgumentDomain(value, domain, parameter); return [existing]; }
          catch { /* A changed declaration needs a compatible initial value. */ }
        }
      }
      return [{ parameterId: parameter.id, value: defaultValue(parameter) }];
    });
    if (JSON.stringify(next) !== JSON.stringify(argumentsList)) onValueChange(event.id, { ...args, arguments: next } as any);
  }, [event.id, scriptId, selectedScript?.parameters, args?.arguments, variables.variables]);
  const update = (parameter: ScriptParameter, value: ScriptArgument['value']) => onValueChange(event.id, { ...args,
    arguments: [...argumentsList.filter(argument => argument.parameterId !== parameter.id), { parameterId: parameter.id, value }] } as any);
  return <Space direction="vertical" size={8} style={{ width: '100%' }}>
    <Select aria-label={t('scripts.selectScript')} placeholder={t('scripts.selectScript')} showSearch optionFilterProp="label" filterOption={(input, option) => normalizeSearch(option?.label).includes(normalizeSearch(input))} value={selectedScript?.id || undefined} onChange={scriptId => {
      const script = activeScripts.find(script => script.id === scriptId);
      onValueChange(event.id, { ...args, scriptId, arguments: (script?.parameters ?? []).map(parameter => ({ parameterId: parameter.id, value: defaultValue(parameter) })) } as any);
    }} options={activeScripts.map(script => ({ value: script.id, label: script.name }))} style={{ width: '100%' }} />
    {selectedScript?.description?.trim() && <Typography.Paragraph type="secondary" style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{selectedScript.description}</Typography.Paragraph>}
    {(selectedScript?.parameters ?? []).map(parameter => {
      const argument = argumentsList.find(argument => argument.parameterId === parameter.id);
      const value = argument?.value;
      let invalid = false;
      try { validateScriptArgument(parameter, argument!); validateScriptArgumentDomain(argument!.value, domain, parameter); } catch { invalid = true; }
      return <Space key={parameter.id} direction="vertical" size={4} style={{ width: '100%' }}>
        <Typography.Text>{scriptParameterLabel(parameter)} <Typography.Text type="secondary">({t(`scripts.mode.${parameter.mode}`)})</Typography.Text></Typography.Text>
        {parameter.type !== 'string' ? <NumericValueInput scriptArgument referenceOnly={parameter.mode === 'reference'} referenceType={parameter.type} value={value ?? defaultValue(parameter)} onChange={value => update(parameter, value)} /> : <Space.Compact block>
          {parameter.mode === 'local' && <Select aria-label={t('scripts.inputSource')} value={value?.kind === 'variable' ? 'variable' : 'literal'} style={{ width: 100 }} options={[{ value: 'literal', label: t('scripts.type.string') }, { value: 'variable', label: t('values.variable') }]} onChange={source => update(parameter, source === 'literal' ? { kind: 'literal', type: 'string', value: '' } : { kind: 'variable', type: 'string', variableId: textVariables[0]?.id ?? '' })} />}
          {parameter.mode === 'reference' || value?.kind === 'variable' ? <Select aria-label={scriptParameterLabel(parameter)} showSearch optionFilterProp="label" filterOption={(input, option) => {
            const variable = textVariables.find(candidate => candidate.id === (option && 'value' in option ? option.value : undefined));
            return normalizeSearch(`${option?.label ?? ''} ${variable?.name ?? ''} ${variable?.symbol ?? ''}`).includes(normalizeSearch(input));
          }} style={{ width: '100%' }} value={value?.kind === 'variable' ? value.variableId || undefined : undefined} options={variableOptions(textVariables, t)} onChange={variableId => update(parameter, { kind: 'variable', type: 'string', variableId })} /> : <Input aria-label={scriptParameterLabel(parameter)} value={value?.kind === 'literal' ? value.value : ''} onChange={event => update(parameter, { kind: 'literal', type: 'string', value: event.target.value })} />}
        </Space.Compact>}
        {invalid && <Typography.Text type="danger">{t('scripts.configureInput')}</Typography.Text>}
      </Space>;
    })}
  </Space>;
}
