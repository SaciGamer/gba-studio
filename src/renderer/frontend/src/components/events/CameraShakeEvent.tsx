import { Form, Segmented, Tooltip, Typography } from 'antd';
import NumericEventInput from '../NumericEventInput';
import { useI18n } from '@/i18n/I18n';
import type { IArgs } from '@/providers/contexts/interfaces/ISceneElement';

export default function CameraShakeEvent({ args, onChange }: { args: IArgs; onChange: (patch: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const custom = args.customShake ?? (args.frames !== undefined && args.frames !== 8 || args.amplitude !== undefined && args.amplitude !== 2 || args.axis && args.axis !== 'both');
  return <Form layout="vertical">
    <Form.Item label={t('events.shake.mode')}>
      <Segmented block aria-label={t('events.shake.mode')} value={custom ? 'custom' : 'default'} options={['default', 'custom'].map(value => ({ value, label: t(`events.shake.${value}`) }))} onChange={value => onChange(value === 'default' ? { customShake: false, frames: 8, amplitude: 2, axis: 'both' } : { customShake: true })} />
    </Form.Item>
    {custom ? <>
      <Form.Item label={t('events.shake.axis')}>
        <Segmented block aria-label={t('events.shake.axis')} value={args.axis ?? 'both'} options={['both', 'horizontal', 'vertical'].map(value => ({ value, label: t(`events.shake.${value}`) }))} onChange={axis => onChange({ axis })} />
      </Form.Item>
      <Form.Item label={t('events.shake.amplitude')}>
        <Tooltip mouseEnterDelay={0.6} title={t('events.shake.amplitudeHelp')}><div>
          <NumericEventInput label={t('events.shake.amplitude')} min={1} max={8} value={args.amplitude ?? 2} onChange={amplitude => onChange({ amplitude: amplitude ?? 2 })} style={{ width: '100%' }} />
        </div></Tooltip>
      </Form.Item>
      <Form.Item label={t('events.shake.duration')}>
        <Tooltip mouseEnterDelay={0.6} title={t('events.shake.durationHelp')}><div>
          <NumericEventInput label={t('events.shake.duration')} min={1} max={120} value={args.frames ?? 8} onChange={frames => onChange({ frames: frames ?? 8 })} style={{ width: '100%' }} />
        </div></Tooltip>
      </Form.Item>
    </> : <Typography.Paragraph type="secondary">{t('events.shake.defaultHint')}</Typography.Paragraph>}
  </Form>;
}
