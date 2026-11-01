import React from 'react';
import { Button, Checkbox, Flex, InputNumber, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useI18n } from '@/i18n/I18n';
import { MusicCompositionEnvelope } from '@/utils/trackerComposition';

interface Props {
  volume: MusicCompositionEnvelope;
  panning: MusicCompositionEnvelope;
  fadeout: number;
  enabled: boolean;
  editable: boolean;
  onChange: (type: 'volume' | 'panning', envelope: MusicCompositionEnvelope, fadeout: number) => void;
}

export default function MusicInstrumentEnvelopeEditor({ volume, panning, fadeout, enabled, editable, onChange }: Props) {
  const { t } = useI18n();
  const update = (type: 'volume' | 'panning', source: MusicCompositionEnvelope, patch: Partial<MusicCompositionEnvelope>) =>
    onChange(type, { ...source, ...patch }, fadeout);
  const renderEnvelope = (type: 'volume' | 'panning', envelope: MusicCompositionEnvelope) => <Space key={type} direction="vertical" size={6} style={{ display: 'flex', padding: '8px 0', borderBottom: '1px solid var(--ant-color-border-secondary)' }}>
    <Typography.Text strong>{t(type === 'volume' ? 'music.envelope.volume' : 'music.envelope.panning')}</Typography.Text>
    <Checkbox aria-label={`${t(type === 'volume' ? 'music.envelope.volume' : 'music.envelope.panning')} ${t('music.envelope.enabled')}`} checked={envelope.enabled} disabled={!editable} onChange={event => update(type, envelope, { enabled: event.target.checked })}>{t('music.envelope.enabled')}</Checkbox>
    {envelope.points.map((point, index) => <Flex key={index} align="center" gap={5}>
      <Typography.Text type="secondary">{index + 1}</Typography.Text>
      <InputNumber aria-label={`${t('music.envelope.tick')} ${index + 1}`} min={0} max={65535} value={point.tick} disabled={!editable || !envelope.enabled} onChange={value => {
        if (value === null) return;
        const points = envelope.points.map((item, itemIndex) => itemIndex === index ? { ...item, tick: Number(value) } : item).sort((a, b) => a.tick - b.tick);
        update(type, envelope, { points, sustainStart: Math.min(envelope.sustainStart, points.length), sustainEnd: Math.min(envelope.sustainEnd, points.length), loopStart: Math.min(envelope.loopStart, points.length), loopEnd: Math.min(envelope.loopEnd, points.length) });
      }} style={{ width: 76 }} />
      <InputNumber aria-label={`${t('music.envelope.value')} ${index + 1}`} min={0} max={1} step={0.01} value={point.value} disabled={!editable || !envelope.enabled} onChange={value => value !== null && update(type, envelope, { points: envelope.points.map((item, itemIndex) => itemIndex === index ? { ...item, value: Number(value) } : item) })} style={{ width: 76 }} />
      <Button size="small" aria-label={`${t('music.envelope.removePoint')} ${index + 1}`} icon={<DeleteOutlined />} disabled={!editable || envelope.points.length <= 1} onClick={() => {
        const points = envelope.points.filter((_, itemIndex) => itemIndex !== index);
        const clampIndex = (value: number) => Math.min(Math.max(0, value), points.length);
        update(type, envelope, { points, sustainStart: clampIndex(envelope.sustainStart), sustainEnd: clampIndex(envelope.sustainEnd), loopStart: clampIndex(envelope.loopStart), loopEnd: clampIndex(envelope.loopEnd) });
      }} />
    </Flex>)}
    <Button size="small" icon={<PlusOutlined />} disabled={!editable || envelope.points.length >= 12} onClick={() => update(type, envelope, { points: [...envelope.points, { tick: (envelope.points.at(-1)?.tick ?? 0) + 1, value: envelope.points.at(-1)?.value ?? (type === 'volume' ? 1 : 0.5) }] })}>{t('music.envelope.addPoint')}</Button>
    <Checkbox checked={envelope.sustainEnabled} disabled={!editable || !envelope.enabled} onChange={event => update(type, envelope, { sustainEnabled: event.target.checked })}>{t('music.envelope.sustain')}</Checkbox>
    <Flex gap={5} wrap="wrap">
      <InputNumber aria-label={t('music.envelope.sustainStart')} min={0} max={envelope.points.length} value={envelope.sustainStart} disabled={!editable || !envelope.enabled || !envelope.sustainEnabled} onChange={value => value !== null && update(type, envelope, { sustainStart: Math.min(Number(value), envelope.sustainEnd) })} style={{ width: 108 }} />
      <InputNumber aria-label={t('music.envelope.sustainEnd')} min={envelope.sustainStart} max={envelope.points.length} value={envelope.sustainEnd} disabled={!editable || !envelope.enabled || !envelope.sustainEnabled} onChange={value => value !== null && update(type, envelope, { sustainEnd: Number(value) })} style={{ width: 108 }} />
    </Flex>
    <Checkbox checked={envelope.loopEnabled} disabled={!editable || !envelope.enabled} onChange={event => update(type, envelope, { loopEnabled: event.target.checked })}>{t('music.envelope.loop')}</Checkbox>
    <Flex gap={5} wrap="wrap">
      <InputNumber aria-label={t('music.envelope.loopStart')} min={0} max={envelope.points.length} value={envelope.loopStart} disabled={!editable || !envelope.enabled || !envelope.loopEnabled} onChange={value => value !== null && update(type, envelope, { loopStart: Math.min(Number(value), envelope.loopEnd) })} style={{ width: 108 }} />
      <InputNumber aria-label={t('music.envelope.loopEnd')} min={envelope.loopStart} max={envelope.points.length} value={envelope.loopEnd} disabled={!editable || !envelope.enabled || !envelope.loopEnabled} onChange={value => value !== null && update(type, envelope, { loopEnd: Number(value) })} style={{ width: 108 }} />
    </Flex>
  </Space>;
  return <Space direction="vertical" size={8} style={{ display: 'flex', maxHeight: 520, overflow: 'auto' }}>
    {!editable && <Typography.Text type="warning">{t('music.envelope.unavailable')}</Typography.Text>}
    <label>{t('music.envelope.fadeout')}<InputNumber aria-label={t('music.envelope.fadeout')} min={0} max={65535} value={fadeout} disabled={!editable} onChange={value => value !== null && onChange('volume', volume, Number(value))} style={{ width: '100%' }} /></label>
    {enabled && <>{renderEnvelope('volume', volume)}{renderEnvelope('panning', panning)}</>}
  </Space>;
}
