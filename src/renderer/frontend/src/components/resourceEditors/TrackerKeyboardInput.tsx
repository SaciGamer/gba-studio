import React, { useEffect, useRef, useState } from 'react';
import { Flex, message, Select, Typography } from 'antd';
import { useI18n } from '@/i18n/I18n';
import { scorePitchLabel, type ScoreRow } from '@/utils/trackerScore';
import { buildKeyboardGesture, type KeyboardGestureMode, type KeyboardGestureResult, type KeyboardTouch } from '@/utils/trackerKeyboardGesture';

export default function TrackerKeyboardInput(props: {
  timing: ScoreRow[]; row: number; length: number; channel: number; instrument: number; format: string; playing: boolean;
  selectedPitch?: number; fitPitch: (pitch: number) => number; inScale: (pitch: number) => boolean;
  onPreview: (pitch: number) => void; onCommit: (result: KeyboardGestureResult) => void;
  onRelease?: () => void;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<KeyboardGestureMode>('notes');
  const [held, setHeld] = useState<{ pitch: number; rows: number } | null>(null);
  const gesture = useRef<{ id: number; started: number; row: number; touches: KeyboardTouch[] } | null>(null);
  const current = useRef(props); current.current = props;
  const container = useRef<HTMLDivElement>(null);
  const cancel = () => { if (gesture.current) current.current.onRelease?.(); gesture.current = null; setHeld(null); };
  useEffect(() => { cancel(); }, [props.channel, props.playing]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('keydown', key); window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', cancel); if (gesture.current) current.current.onRelease?.(); gesture.current = null; };
  }, []);
  useEffect(() => {
    if (!held) return;
    const timer = window.setInterval(() => {
      const active = gesture.current;
      if (!active) return;
      const p = current.current;
      const result = buildKeyboardGesture(active.touches, (performance.now() - active.started) / 1000, active.row, p.length, p.timing, mode, p.format, p.channel, p.instrument);
      setHeld(previous => previous ? { ...previous, rows: (result.notes.at(-1)?.end ?? active.row + 1) - active.row } : previous);
    }, 80);
    return () => window.clearInterval(timer);
  }, [Boolean(held), mode]);
  const finish = (seconds: number) => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null; setHeld(null);
    props.onRelease?.();
    const result = buildKeyboardGesture(active.touches, seconds, active.row, props.length, props.timing, mode, props.format, props.channel, props.instrument);
    if (result.arpeggioOverflow) message.info(t('music.score.arpeggioOverflow'));
    if (result.notes.length) props.onCommit(result);
  };
  return <>
    <Flex gap={8} align="center" wrap="wrap" className="gba-keyboard-gesture-toolbar">
      <label>{t('music.score.gesture')} <Select size="small" aria-label={t('music.score.gesture')} value={mode} disabled={Boolean(held) || props.playing}
        onChange={setMode} options={(['notes', 'portamento', 'vibrato', 'arpeggio'] as const).map(value => ({ value, label: t(`music.score.gesture.${value}`) }))} /></label>
      <Typography.Text type="secondary">{held ? t('music.score.holding', { rows: held.rows }) : t('music.score.gestureHint')}</Typography.Text>
    </Flex>
    <div className="gba-keyboard-keys" ref={container}
      onPointerMove={event => {
        const active = gesture.current;
        if (!active || active.id !== event.pointerId) return;
        const key = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('[data-keyboard-pitch]');
        if (!key || !container.current?.contains(key)) return;
        const pitch = props.fitPitch(Number(key.dataset.keyboardPitch));
        if (active.touches.at(-1)?.pitch === pitch) return;
        active.touches.push({ pitch, seconds: (performance.now() - active.started) / 1000 });
        setHeld(previous => previous ? { ...previous, pitch } : previous); props.onPreview(pitch);
      }} onPointerUp={event => {
        const active = gesture.current;
        if (!active || active.id !== event.pointerId) return;
        finish((performance.now() - active.started) / 1000);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={cancel}>
      {Array.from({ length: 36 }, (_, index) => {
        const raw = index + 37, pitch = props.fitPitch(raw);
        const black = [1, 3, 6, 8, 10].includes((raw - 1) % 12);
        return <button key={raw} type="button" disabled={props.playing} data-keyboard-pitch={raw} title={scorePitchLabel(raw)}
          aria-label={scorePitchLabel(raw)} className={`${black ? 'black ' : ''}${(held?.pitch ?? props.selectedPitch) === pitch ? 'active ' : ''}${!props.inScale(raw) ? 'outside-scale' : ''}`}
          onPointerDown={event => {
            if (props.playing || event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.focus({ preventScroll: true });
            const now = performance.now();
            gesture.current = { id: event.pointerId, started: now, row: Math.max(0, Math.min(props.timing.length - 1, props.row)), touches: [{ pitch, seconds: 0 }] };
            setHeld({ pitch, rows: props.length }); props.onPreview(pitch);
            container.current?.setPointerCapture(event.pointerId);
          }} onClick={event => {
            if (event.detail === 0 && !props.playing) props.onCommit(buildKeyboardGesture([{ pitch, seconds: 0 }], 0, props.row, props.length, props.timing, 'notes', props.format, props.channel, props.instrument));
          }}>{(raw - 1) % 12 === 0 || raw === 37 ? scorePitchLabel(raw) : ''}</button>;
      })}
    </div>
  </>;
}
