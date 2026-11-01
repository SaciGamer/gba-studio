import { Button, Dropdown, Input, Select, Space, Typography } from 'antd';
import { useI18n } from '@/i18n/I18n';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { createScriptParameter, SCRIPT_PARAMETER_LIMIT, scriptParameterLabel, type ScriptParameter } from '../../../../../shared/scriptParameters';

export default function ScriptInputs({ parameters, onChange, canRemove = () => true }: { parameters: ScriptParameter[]; onChange: (parameters: ScriptParameter[]) => void; canRemove?: (id: string) => boolean }) {
  const { t } = useI18n();
  const update = (id: string, patch: Partial<ScriptParameter>) => onChange(parameters.map(parameter => parameter.id === id ? { ...parameter, ...patch } : parameter));
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
      <Typography.Text>{t('scripts.inputs')} ({parameters.length}/{SCRIPT_PARAMETER_LIMIT})</Typography.Text>
      <Button size="small" icon={<PlusOutlined />} aria-label={t('scripts.addParameter')} disabled={parameters.length >= SCRIPT_PARAMETER_LIMIT} onClick={() => {
        const parameter = createScriptParameter(parameters);
        if (parameter) onChange([...parameters, parameter]);
      }}>Add</Button>
    </Space>
    {parameters.map(parameter => <Space.Compact key={parameter.id} block data-parameter-id={parameter.id} data-parameter-name={parameter.name}>
      <Input aria-label={t('scripts.inputName')} title={parameter.name} value={scriptParameterLabel(parameter)} status={!scriptParameterLabel(parameter).trim() || parameters.some(other => other.id !== parameter.id && scriptParameterLabel(other).trim() === scriptParameterLabel(parameter).trim()) ? 'error' : undefined} onChange={event => update(parameter.id, { alias: event.target.value })} />
      <Select aria-label={t('scripts.inputType')} value={parameter.type} style={{ width: 105, flex: 'none' }} options={(['number', 'boolean', 'string'] as const).map(type => ({ value: type, label: t(`scripts.type.${type}`) }))} onChange={type => update(parameter.id, { type })} />
      <Dropdown menu={{ selectedKeys: [parameter.mode], items: ['local', 'reference'].map(mode => ({ key: mode, label: t(`scripts.mode.${mode}`) })), onClick: ({ key }) => update(parameter.id, { mode: key as ScriptParameter['mode'] }) }} trigger={['click']}>
        <Button aria-label={t('scripts.inputMode')} title={t(`scripts.modeHint.${parameter.mode}`)}>{t(`scripts.mode.${parameter.mode}`)}</Button>
      </Dropdown>
      <Button type="primary" danger={canRemove(parameter.id)} style={{ backgroundClip: 'padding-box', boxShadow: 'none' }} icon={<DeleteOutlined />} aria-label={`${t('scripts.removeParameter')}: ${parameter.name}`} disabled={!canRemove(parameter.id)} title={!canRemove(parameter.id) ? t('scripts.parameterInUse') : t('scripts.removeParameter')} onClick={() => onChange(parameters.filter(other => other.id !== parameter.id))} />
    </Space.Compact>)}
    <Typography.Text type="secondary">{t('scripts.inputsHint')}</Typography.Text>
  </Space>;
}
