import { Select, Space } from 'antd';
import { useState } from 'react';
import StepInputNumber from '../StepInputNumber';
import { useI18n } from '@/i18n/I18n';
import { PHYSICS_VALUE_OPTIONS, type PhysicsValueField } from '@/utils/physicsValueOptions';

export default function PhysicsValueControl({ field, value, onChange }: {
  field: PhysicsValueField; value: number; onChange: (value: number) => void;
}) {
  const { t } = useI18n();
  const [custom, setCustom] = useState(false);
  const presets = PHYSICS_VALUE_OPTIONS[field];
  const isCustom = custom || !presets.some(option => option.value === value);
  const label = t(`events.physics.${field}`);
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Select<number | 'custom'> aria-label={label} style={{ width: '100%' }} value={isCustom ? 'custom' : value}
      options={[...presets.map(option => ({ value: option.value, label: `${t(option.labelKey)} (${option.value})` })), { value: 'custom', label: t('events.physics.custom') }]}
      onChange={next => { setCustom(next === 'custom'); if(next !== 'custom') onChange(next); }} />
    {isCustom && <StepInputNumber aria-label={t('events.physics.customValue', { field: label })} style={{ width: '100%' }}
      min={field === 'impulse' ? -16 : field === 'airJumps' ? -1 : 0} max={field === 'airJumps' ? 255 : 16}
      step={field === 'airJumps' ? 1 : 0.0625} precision={field === 'airJumps' ? 0 : 4} value={value}
      onChange={next => { if(next !== null && next !== '') onChange(Number(next)); }} />}
  </Space>;
}
