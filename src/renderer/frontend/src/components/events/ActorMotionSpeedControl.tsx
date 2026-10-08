import { Checkbox, Flex, Form, Select, Typography } from 'antd';
import { useState } from 'react';
import StepInputNumber from '../StepInputNumber';
import { useI18n } from '@/i18n/I18n';
import { ANIMATION_SPEED_OPTIONS, MOVEMENT_SPEED_OPTIONS } from '@/utils/movementSpeedOptions';

export default function ActorMotionSpeedControl({ enabled, speed, animationSpeed, onChange, showAnimationSpeed = true, maxSpeed = 10 }: {
  enabled: boolean; speed: number; animationSpeed: number;
  showAnimationSpeed?: boolean; maxSpeed?: number;
  onChange: (patch: { animated?: boolean; speed?: number; animationSpeed?: number }) => void;
}) {
  const { t } = useI18n();
  const [custom, setCustom] = useState(false);
  const [movementOpen, setMovementOpen] = useState(false);
  const [animationOpen, setAnimationOpen] = useState(false);
  const isCustom = custom || !MOVEMENT_SPEED_OPTIONS.some(option => option.value === speed);
  const optionLabel = (value: number, animation = false) => {
    if (animation && value === 0) return t('events.motion.none');
    const text = value === 0.25 ? '¼' : value === 0.5 ? '½' : String(value);
    const key = value === (animation ? 1 : 0.25) ? 'events.motion.speedSlower' : value === (animation ? 8 : 4) ? 'events.motion.speedFaster' : 'events.motion.speedLevel';
    return t(key, { speed: text });
  };
  return <>
    <Form.Item><Checkbox checked={enabled} onChange={event => onChange({ animated: event.target.checked, speed, animationSpeed })}>{t('events.motion.useSpeed')}</Checkbox></Form.Item>
    {enabled && <Flex gap={8} align="flex-start">
      <Form.Item label={t('settings.movementSpeed')} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        {isCustom ? <StepInputNumber aria-label={t('settings.movementSpeed')} min={0.0625} max={maxSpeed} step={0.0625} precision={4} value={speed} style={{ width: '100%' }} onChange={value => onChange({ speed: Number(value) || 1 })} onBlur={() => setCustom(false)} />
          : <Select aria-label={t('settings.movementSpeed')} value={speed} showSearch optionFilterProp="label" onOpenChange={setMovementOpen} onChange={value => {
            if (value === 'custom') setCustom(true); else onChange({ speed: Number(value) });
          }} options={[
            ...MOVEMENT_SPEED_OPTIONS.map(option => ({ value: option.value, label: `${optionLabel(option.value)} ${option.ppf}`, display: optionLabel(option.value), rate: option.ppf })),
            { value: 'custom', label: t('settings.customSpeed'), display: t('settings.customSpeed'), rate: '' },
          ]} labelRender={({ value }) => typeof value === 'number' ? optionLabel(value) : t('settings.customSpeed')}
          optionRender={option => <Flex justify="space-between" gap={8}><span>{option.data.display}</span>{movementOpen && <Typography.Text type="secondary">{option.data.rate}</Typography.Text>}</Flex>} />}
      </Form.Item>
      {showAnimationSpeed && <Form.Item label={t('settings.animationSpeed')} style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
        <Select aria-label={t('settings.animationSpeed')} value={animationSpeed} showSearch optionFilterProp="label" onOpenChange={setAnimationOpen} onChange={value => onChange({ animationSpeed: value })}
          options={ANIMATION_SPEED_OPTIONS.map(option => ({ value: option.value, label: `${optionLabel(option.value, true)} ${option.fps}`, display: optionLabel(option.value, true), rate: option.fps }))}
          labelRender={({ value }) => optionLabel(Number(value), true)} optionRender={option => <Flex justify="space-between" gap={8}><span>{option.data.display}</span>{animationOpen && <Typography.Text type="secondary">{option.data.rate}</Typography.Text>}</Flex>} />
      </Form.Item>}
    </Flex>}
  </>;
}
