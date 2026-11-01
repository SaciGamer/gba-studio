import React from 'react';
import { Button, Flex, InputNumber, Select, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useI18n } from '@/i18n/I18n';

interface Zone { low: number; high: number; sampleId: string }
interface Sample { id: string; name: string }
interface Props { zones: Zone[]; samples: Sample[]; editable: boolean; onChange: (zones: Zone[]) => void }

export default function MusicInstrumentZoneEditor({ zones, samples, editable, onChange }: Props) {
  const { t } = useI18n();
  const addZone = () => {
    if (!samples.length) return;
    const occupied = new Set<number>();
    zones.forEach(zone => { for (let note = zone.low; note <= zone.high; note += 1) occupied.add(note); });
    const low = Array.from({ length: 128 }, (_, note) => note).find(note => !occupied.has(note));
    if (low === undefined) return;
    const sampleId = samples.find(sample => !zones.some(zone => zone.sampleId === sample.id))?.id ?? samples[0].id;
    onChange([...zones, { low, high: low, sampleId }]);
  };
  return <Space direction="vertical" size={8} style={{ display: 'flex', maxHeight: 520, overflow: 'auto' }}>
    <Typography.Text type="secondary">{t('music.zones.hint')}</Typography.Text>
    {!samples.length && <Typography.Text type="warning">{t('music.zones.noSamples')}</Typography.Text>}
    {zones.map((zone, index) => <Flex key={`${zone.sampleId}:${index}`} align="center" gap={4} wrap="wrap" style={{ padding: '6px 0', borderBottom: '1px solid var(--ant-color-border-secondary)' }}>
      <Typography.Text type="secondary">{index + 1}</Typography.Text>
      <InputNumber aria-label={`${t('music.zones.low')} ${index + 1}`} min={0} max={zone.high} value={zone.low} disabled={!editable} onChange={value => value !== null && onChange(zones.map((item, itemIndex) => itemIndex === index ? { ...item, low: Number(value) } : item))} style={{ width: 72 }} />
      <InputNumber aria-label={`${t('music.zones.high')} ${index + 1}`} min={zone.low} max={127} value={zone.high} disabled={!editable} onChange={value => value !== null && onChange(zones.map((item, itemIndex) => itemIndex === index ? { ...item, high: Number(value) } : item))} style={{ width: 72 }} />
      <Select aria-label={`${t('music.zones.sample')} ${index + 1}`} value={zone.sampleId} disabled={!editable} options={samples.map(sample => ({ value: sample.id, label: sample.name }))} onChange={sampleId => onChange(zones.map((item, itemIndex) => itemIndex === index ? { ...item, sampleId } : item))} style={{ flex: '1 1 110px', minWidth: 110 }} />
      <Button size="small" aria-label={`${t('music.zones.remove')} ${index + 1}`} icon={<DeleteOutlined />} disabled={!editable} onClick={() => onChange(zones.filter((_, itemIndex) => itemIndex !== index))} />
    </Flex>)}
    <Button size="small" icon={<PlusOutlined />} disabled={!editable || !samples.length || zones.reduce((count, zone) => count + zone.high - zone.low + 1, 0) >= 128} onClick={addZone}>{t('music.zones.add')}</Button>
  </Space>;
}
