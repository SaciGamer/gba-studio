import { Button, Dropdown, Form, Space, Tooltip, Typography } from 'antd';
import { InputNumber } from '../StepInputNumber';
import { AntdToken } from '../common/AntDToken';
import { useI18n } from '@/i18n/I18n';
import type { IArgs } from '@/providers/contexts/interfaces/ISceneElement';

export default function RumbleEvent({ args, onChange }: { args: IArgs; onChange: (patch: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const { token } = AntdToken();
  const unit = args.durationUnit === 'seconds' ? 'seconds' : 'frames';
  const frames = Number(args.durationFrames ?? 8);
  return <Form layout="vertical">
    <Typography.Paragraph type="secondary">{t('events.rumble.hardwareHint')}</Typography.Paragraph>
    <Form.Item label={t('events.rumble.duration')}>
      <Space.Compact block>
        <Dropdown trigger={['click']} menu={{ items: ['frames', 'seconds'].map(value => ({ key: value, label: t(value === 'frames' ? 'events.wait.frames' : 'events.bgAnimation.seconds'), onClick: () => onChange({ durationUnit: value }) })) }}>
          <Button aria-label={t('events.rumble.unit')} style={{ backgroundColor: token.colorBgBase }}>{t(unit === 'frames' ? 'events.wait.frames' : 'events.bgAnimation.seconds')}</Button>
        </Dropdown>
        <Tooltip mouseEnterDelay={0.6} title={t('events.rumble.durationHelp')}>
          <InputNumber aria-label={t('events.rumble.duration')} style={{ flex: 1, minWidth: 0 }}
            min={unit === 'seconds' ? 1 / 60 : 1} max={unit === 'seconds' ? 2 : 120}
            step={unit === 'seconds' ? 1 / 60 : 1} precision={unit === 'seconds' ? 4 : 0}
            value={unit === 'seconds' ? Number((frames / 60).toFixed(4)) : frames}
            onChange={value => { if (value !== null) onChange({ durationFrames: Math.max(1, Math.min(120, Math.round(Number(value) * (unit === 'seconds' ? 60 : 1)))) }); }} />
        </Tooltip>
      </Space.Compact>
    </Form.Item>
    <Form.Item label={t('events.rumble.intensity')}>
      <Tooltip mouseEnterDelay={0.6} title={t('events.rumble.intensityHelp')}>
        <InputNumber aria-label={t('events.rumble.intensity')} style={{ width: '100%' }} min={0} max={100} value={Number(args.intensity ?? 100)} onChange={value => { if (value !== null) onChange({ intensity: Number(value) }); }} />
      </Tooltip>
    </Form.Item>
  </Form>;
}
