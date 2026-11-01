import { IArgs, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { Input, InputNumber, Select, Space } from 'antd';
import { useI18n } from '@/i18n/I18n';

type CaseValue = { kind: 'literal'; type: 'number' | 'string' | 'boolean'; value: number | string | boolean };
export default function SwitchCaseEvent({ event, valueType, onValueChange }: { event: IScriptsElement; valueType: 'number' | 'string' | 'boolean'; onValueChange: (id: string, args: IArgs) => void }) {
  const { t } = useI18n();
  const stored = event.args?.value as Partial<CaseValue> | undefined;
  const defaultValue = valueType === 'number' ? 0 : valueType === 'boolean' ? false : '';
  const value: CaseValue = stored?.type === valueType && typeof stored.value === valueType
    ? { kind: 'literal', type: valueType, value: stored.value }
    : { kind: 'literal', type: valueType, value: defaultValue };
  const update = (next: CaseValue) => onValueChange(event.id, { value: next });
  return <Space.Compact block>
    {valueType === 'number' ? <InputNumber aria-label={t('events.switch.caseValue')} style={{ width: '100%' }} value={Number(value.value)} onChange={next => update({ ...value, value: next ?? 0 })} />
      : valueType === 'boolean' ? <Select aria-label={t('events.switch.caseValue')} style={{ width: '100%' }} value={Boolean(value.value)} options={[{ value: true, label: t('events.switch.true') }, { value: false, label: t('events.switch.false') }]} onChange={next => update({ ...value, value: next })} />
      : <Input aria-label={t('events.switch.caseValue')} value={String(value.value)} onChange={change => update({ ...value, value: change.target.value })} />}
  </Space.Compact>;
}
