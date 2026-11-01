import { Flex, Typography } from 'antd';
import { useI18n } from '@/i18n/I18n';
import type { IArgs } from '@/providers/contexts/interfaces/ISceneElement';
import MusicDial from '../resourceEditors/MusicDial';

const controls = [
  { field: 'volume', min: 0, max: 100, defaultValue: 100 },
  { field: 'speed', min: 25, max: 400, defaultValue: 100 },
  { field: 'panning', min: -100, max: 100, defaultValue: 0 },
] as const;

export default function SoundPlaybackControls({ args, onChange }: { args: IArgs; onChange: (patch: Record<string, unknown>) => void }) {
  const { t } = useI18n();
  return <Flex gap={12} wrap="wrap" justify="space-around" style={{ marginBottom: 24 }}>{controls.map(({ field, min, max, defaultValue }) => {
    const pan = field === 'panning';
    const label = t(`events.sound.${pan ? 'pan' : field}`);
    const raw = args[field] ?? defaultValue;
    const literal = typeof raw === 'number' ? raw : raw && typeof raw === 'object'
      && (raw.kind === 'number' || raw.kind === 'literal' || raw.type === 'number') ? raw.value : null;
    const known = typeof literal === 'number' && Number.isFinite(literal);
    const value = known ? Math.max(min, Math.min(max, Math.round(literal))) : defaultValue;
    const valueText = !known ? '—' : pan
      ? value === 0 ? t('music.inspector.center') : `${value < 0 ? 'L' : 'R'} ${Math.abs(value)}%`
      : `${value}%`;
    return <Flex key={field} vertical align="center" gap={4} style={{ flex: '1 1 80px', minWidth: 80 }} data-testid={`sound-control-${field}`}>
      <Typography.Text style={{ fontSize: 12, textAlign: 'center' }}>{label.replace(/\s*\(%\)$/, '')}</Typography.Text>
      <Flex align="center" justify="center" style={{ height: 80 }}>
        <MusicDial label={label} min={min} max={max} step={pan ? 25 : 1} value={value} valueText={valueText} panScale={pan} onChange={next => onChange({ [field]: next })} />
      </Flex>
      <Typography.Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{valueText}</Typography.Text>
    </Flex>;
  })}</Flex>;
}
