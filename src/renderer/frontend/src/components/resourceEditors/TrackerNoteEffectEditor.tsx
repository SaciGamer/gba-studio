import React, { useEffect, useState } from 'react';
import { Flex, Radio, Select, Slider, Tabs, Typography, theme } from 'antd';
import { useI18n } from '@/i18n/I18n';
import { decodeTrackerNoteEffects, encodeTrackerNoteEffects, trackerNoteEffectCatalog, type TrackerEffectChoice } from '@/utils/trackerNoteEffects';
import { trackerFxVisuals } from '@/utils/trackerFxVisuals';
import MusicDial from './MusicDial';
import './MusicDial.css';

function FxControl({ label, value, min = 0, max = 15, slider = false, pan = false, onChange }: {
  label: string; value: number; min?: number; max?: number; slider?: boolean; pan?: boolean; onChange: (value: number) => void;
}) {
  const { token } = theme.useToken();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (next: number) => { setDraft(next); onChange(next); };
  return <Flex vertical gap={10} align={slider ? undefined : 'center'} style={{ flex: 1, minWidth: 0 }}>
    <Flex justify="space-between" align="center" gap={8} style={{ width: '100%' }}>
      <Typography.Text>{label}</Typography.Text>{slider && <Typography.Text type="secondary">{draft}</Typography.Text>}
    </Flex>
    {slider ? <Slider className="gba-music-fader gba-sample-volume-fader" ariaLabelForHandle={label} min={min} max={max} step={1}
      marks={pan ? { [min]: 'L', [Math.round((max + 1) / 2)]: 'C', [max]: 'R' } : undefined}
      value={draft} onChange={setDraft} onChangeComplete={commit}
      style={{ width: '100%', margin: pan ? '0 0 20px' : 0, '--music-accent': token.colorPrimary } as React.CSSProperties} />
      : <><MusicDial label={label} min={min} max={max} step={1} value={draft} valueText={String(draft)} onChange={setDraft} onChangeComplete={commit} />
        <Typography.Text type="secondary">{draft}</Typography.Text></>}
  </Flex>;
}

export default function TrackerNoteEffectEditor({ format, effect, parameter, focusedEffect, onChange }: {
  format: string; effect: number; parameter: number; focusedEffect?: string;
  onChange: (value: { effect: number; parameter: number }) => void;
}) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const [activeEffect, setActiveEffect] = useState(focusedEffect);
  useEffect(() => setActiveEffect(focusedEffect), [focusedEffect]);
  const catalog = trackerNoteEffectCatalog(format);
  const selected = decodeTrackerNoteEffects(format, effect, parameter);
  const ids = selected.map(item => item.id);
  const selectedId = selected.length === 2 ? (ids.includes('portamento') ? 'portamentoVolume' : 'vibratoVolume') : ids[0];
  const label = (id: string) => t(`music.effects.${catalog.find(item => item.id === id)?.name ?? 'unknown'}`);
  const commit = (choices: TrackerEffectChoice[]) => {
    const encoded = encodeTrackerNoteEffects(format, choices);
    if (encoded) onChange(encoded);
  };
  const configure = (choice: TrackerEffectChoice) => {
    const definition = catalog.find(item => item.id === choice.id);
    const name = definition?.name ?? 'unknown';
    const memoryOnly = selected.length > 1 && choice.id !== 'volumeSlide';
    const setParameter = (value: number) => commit(selected.map(item => item.id === choice.id ? { ...item, parameter: value } : item));
    const paired = definition?.subcommand === undefined && ['arpeggio', 'vibrato', 'fineVibrato', 'tremolo', 'panbrello',
      'volumeSlide', 'globalVolumeSlide', 'channelVolumeSlide', 'panSlide', 'tremor', 'retrigger'].includes(name);
    const pairLabels = name === 'arpeggio' ? ['intervalOne', 'intervalTwo'] : name === 'tremor' ? ['soundTicks', 'silentTicks']
      : name === 'retrigger' ? ['volumeMode', 'repeatTicks'] : /Slide$/.test(name) ? ['increase', 'decrease'] : ['rate', 'depth'];
    return <Flex vertical gap={14}>
      <Typography.Text strong>{label(choice.id)}</Typography.Text>
      {memoryOnly ? <Typography.Text type="secondary">{t('music.effects.memoryParameter')}</Typography.Text>
        : name === 'patternLoop' ? <>
          <Radio.Group optionType="button" buttonStyle="solid" value={choice.parameter === 0 ? 'start' : 'repeat'}
            onChange={event => setParameter(event.target.value === 'start' ? 0 : Math.max(1, choice.parameter))}
            options={[{ value: 'start', label: t('music.effects.loopStart') }, { value: 'repeat', label: t('music.effects.loopRepeat') }]} />
          {choice.parameter > 0 && <FxControl label={t('music.effects.repeatCount')} min={1} max={15} value={choice.parameter} onChange={setParameter} />}
          <Typography.Text type="secondary">{t('music.effects.loopParameter')}</Typography.Text>
        </> : paired ? <Flex gap={18}>
          {pairLabels.map((key, index) => <FxControl key={key} label={t(`music.effects.config.${key}`)}
            value={index === 0 ? choice.parameter >> 4 : choice.parameter & 15}
            onChange={value => setParameter(index === 0 ? value << 4 | choice.parameter & 15 : choice.parameter & 0xf0 | value)} />)}
        </Flex> : <FxControl label={name === 'pan' ? label(choice.id) : t('music.effects.parameter')}
          min={definition?.min ?? 0} max={definition?.max ?? 255} value={choice.parameter} pan={name === 'pan'}
          slider={['pan', 'sampleOffset', 'highOffset', 'envelopePosition', 'noteCut', 'noteOff', 'noteDelay', 'patternBreak', 'orderJump'].includes(name)} onChange={setParameter} />}
      <Typography.Text type="secondary">{t('music.effects.parameterHex', { value: choice.parameter.toString(16).toUpperCase().padStart(2, '0') })}</Typography.Text>
    </Flex>;
  };
  return <Flex vertical gap={14} className="gba-sfx-design-panel gba-fx-design-panel" style={{ '--music-surface-raised': token.colorBgElevated,
    '--music-border': token.colorBorderSecondary } as React.CSSProperties}>
    <Select aria-label={t('music.inspector.effect')} placeholder={t('music.effects.choose')} value={selectedId}
      allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} labelRender={option => label(String(option.value))}
      options={(['pitch', 'volume', 'pan', 'sample', 'timing', 'sequence'] as const).map(group => ({
        label: t(`music.effects.group.${group}`), options: catalog.filter(item => item.group === group).map(item => {
          const encoded = encodeTrackerNoteEffects(format, [{ id: item.id, parameter: item.defaultParameter }])!;
          const code = item.id === 'portamentoVolume' ? 'PV' : item.id === 'vibratoVolume' ? 'VV'
            : trackerFxVisuals(format, encoded.effect, encoded.parameter)[0]?.code ?? 'FX';
          return { value: item.id, label: `${code} - ${t(`music.effects.${item.name}`)}` };
        }),
      })).filter(group => group.options.length > 0)}
      onChange={id => {
        setActiveEffect(undefined);
        if (!id) { commit([]); return; }
        const definition = catalog.find(item => item.id === id);
        if (definition) commit([{ id, parameter: id === selectedId ? parameter : definition.defaultParameter }]);
      }} />
    {selected.length === 1 ? configure(selected[0]) : selected.length > 1 ? <Tabs size="small" activeKey={ids.includes(activeEffect ?? '') ? activeEffect : ids[0]}
      onChange={setActiveEffect} items={selected.map(choice => ({ key: choice.id, label: label(choice.id), children: configure(choice) }))} /> : null}
    <Typography.Text type="secondary" style={{ fontSize: 11 }}>{t('music.effects.combinationHint')}</Typography.Text>
  </Flex>;
}
