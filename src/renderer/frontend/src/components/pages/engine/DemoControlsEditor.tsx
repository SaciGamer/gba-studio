import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Col, Input, Row, Select, Space, Tooltip, Typography } from 'antd';
import type { InputRef } from 'antd';
import { AntdToken } from '../../common/AntDToken';
import { watchConnectedGamepads } from '@/utils/connectedGamepads';
import { useI18n } from '@/i18n/I18n';
import { controlDescriptions, defaultControls, normalizeDemoControls, normalizeDemoKey } from '@/utils/demoControls';

const buttonLabels = ['BUTTON_1', 'BUTTON_2', 'BUTTON_3', 'BUTTON_4', 'LEFT_TOP_SHOULDER', 'RIGHT_TOP_SHOULDER', 'LEFT_BOTTOM_SHOULDER', 'RIGHT_BOTTOM_SHOULDER', 'SELECT', 'START', 'LEFT_STICK', 'RIGHT_STICK', 'DPAD_UP', 'DPAD_DOWN', 'DPAD_LEFT', 'DPAD_RIGHT'];
const indices = [8, 0, 10, 11, 2, 3, 4, 5, 6, 7, 27, 28, 29];
export default function DemoControlsEditor({ controls, onChange, joystick, onJoystickChange }: { controls: any; onChange: (controls: any) => void; joystick?: { id: string; index: number }; onJoystickChange: (joystick: { id: string; index: number }) => void }) {
  const { t } = useI18n();
  const { token } = AntdToken();
  const normalized = useMemo(() => normalizeDemoControls(controls), [controls]);
  const [capture, setCapture] = useState<{ index: number; kind: 'keyboard' | 'joystick' } | null>(null);
  const joystickInputs = useRef<Record<number, InputRef | null>>({});
  const [gamepads, setGamepads] = useState<Gamepad[]>([]);
  const [selectedPad, setSelectedPad] = useState<number | undefined>(undefined);
  const update = (index: number, patch: any) => onChange({ ...normalized, 0: { ...normalized[0], [index]: { ...normalized[0][index], ...patch } } });
  useEffect(() => watchConnectedGamepads(window, navigator, pads => {
    setGamepads(previous => previous.map(pad => `${pad.index}:${pad.id}`).join() === pads.map(pad => `${pad.index}:${pad.id}`).join() ? previous : pads);
  }), []);
  const hasSelectedPad = selectedPad !== undefined && gamepads.some(pad => pad.index === selectedPad);
  useEffect(() => {
    const selected = gamepads.find(pad => pad.index === joystick?.index && pad.id === joystick?.id)
      ?? gamepads.find(pad => pad.id === joystick?.id)
      ?? gamepads[0];
    setSelectedPad(selected?.index);
    setCapture(previous => previous?.kind === 'joystick' ? null : previous);
    if (selected && (selected.id !== joystick?.id || selected.index !== joystick?.index)) {
      onJoystickChange({ id: selected.id, index: selected.index });
    }
  }, [gamepads, joystick?.id, joystick?.index]);
  useEffect(() => {
    if (capture?.kind === 'joystick') {
      joystickInputs.current[capture.index]?.focus({ preventScroll: true });
      joystickInputs.current[capture.index]?.input?.scrollIntoView({ block: 'nearest' });
    }
  }, [capture?.kind, capture?.index]);
  useEffect(() => {
    if (!capture || (capture.kind === 'joystick' && !hasSelectedPad)) return;
    const handler = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapture(null);
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLInputElement) activeElement.blur();
        return;
      }
      if (capture.kind !== 'keyboard' || event.repeat) return;
      const key = normalizeDemoKey(event.key);
      const existing: string[] = normalized[0][capture.index]?.keyboardValues ?? [];
      const keys = existing.includes(key) ? existing.filter(value => value !== key) : [...existing, key];
      update(capture.index, { value: keys[0] ?? '', keyboardValues: keys });
    };
    window.addEventListener('keydown', handler, true);
    if (capture.kind === 'keyboard') return () => window.removeEventListener('keydown', handler, true);
    // Ignore held inputs at capture start; capture only a fresh press/movement.
    let previous = new Set<string>();
    const read = () => {
      const active = new Set<string>();
      for (const pad of Array.from(navigator.getGamepads?.() ?? [])) {
        if (!pad || selectedPad === undefined || pad.index !== selectedPad) continue;
        pad.buttons.forEach((button, index) => { if (button.pressed) active.add(`${pad.index}|${buttonLabels[index] ?? `GAMEPAD_${index}`}`); });
        pad.axes.forEach((axis, index) => { if (Math.abs(axis) > 0.5) active.add(`${pad.index}|${['LEFT_STICK_X', 'LEFT_STICK_Y', 'RIGHT_STICK_X', 'RIGHT_STICK_Y'][index] ?? `EXTRA_STICK_${index}`}:${axis > 0 ? '+1' : '-1'}`); });
      }
      return active;
    };
    previous = read();
    const timer = window.setInterval(() => {
      const active = read();
      const pressed = [...active].find(value => !previous.has(value));
      previous = active;
      if (pressed) {
        update(capture.index, { value2: pressed.split('|')[1] });
        const nextIndex = indices[indices.indexOf(capture.index) + 1];
        setCapture(nextIndex === undefined ? null : { index: nextIndex, kind: 'joystick' });
        if (nextIndex === undefined) joystickInputs.current[capture.index]?.blur();
      }
    }, 16);
    return () => { window.clearInterval(timer); window.removeEventListener('keydown', handler, true); };
  }, [capture, normalized, selectedPad, hasSelectedPad]);
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Row gutter={[24, 16]}>
      {(['keyboard', 'joystick'] as const).map(kind => <Col key={kind} xs={24} lg={12}>
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>{t(`settings.${kind}Control`)}</Typography.Title>
        <Typography.Paragraph type="secondary">{t(`settings.${kind}ControlHint`)}</Typography.Paragraph>
        {kind === 'joystick' && <Space direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
          <Tooltip title={t('settings.noJoystick')} trigger={['hover', 'focus']}>
            <span style={{ display: 'block', width: '100%' }}>
              <Select
                aria-label={t('settings.connectedJoystick')}
                placeholder={t('settings.selectJoystick')}
                value={selectedPad}
                disabled={!gamepads.length}
                onChange={index => {
                  const pad = gamepads.find(candidate => candidate.index === index);
                  if (!pad) return;
                  setCapture(null);
                  setSelectedPad(index);
                  onJoystickChange({ id: pad.id, index: pad.index });
                }}
                style={{ width: '100%' }}
                options={gamepads.map(pad => ({ value: pad.index, label: `${pad.id} (${pad.index + 1})` }))}
              />
            </span>
          </Tooltip>
        </Space>}
        {indices.map(index => {
          const entry = normalized[0][index];
          const isCapturing = capture?.index === index && capture.kind === kind;
          return <Row key={index} gutter={8} align="middle" style={{ marginBottom: 8 }}>
            <Col span={7}><Typography.Text>{controlDescriptions[index]}</Typography.Text></Col>
            <Col span={13}><Input ref={kind === 'joystick' ? input => { joystickInputs.current[index] = input; } : undefined} readOnly disabled={kind === 'joystick' && !hasSelectedPad} aria-label={`${t(`settings.${kind}Control`)} ${controlDescriptions[index]}`} value={kind === 'keyboard' ? (entry?.keyboardValues ?? []).join(', ') : entry?.value2 ?? ''} placeholder={t(isCapturing ? 'settings.pressControl' : 'settings.captureControl')} onClick={() => setCapture({ index, kind })} onFocus={() => setCapture({ index, kind })} onBlur={() => setCapture(previous => previous?.index === index && previous.kind === kind ? null : previous)} style={isCapturing ? { borderColor: token.colorPrimary } : undefined} /></Col>
            <Col span={4}><Button aria-label={`${t('settings.clearControl')} ${t(`settings.${kind}Control`)} ${controlDescriptions[index]}`} onClick={() => { setCapture(null); update(index, kind === 'keyboard' ? { value: '', keyboardValues: [] } : { value2: '' }); }}>{t('settings.clearControl')}</Button></Col>
          </Row>;
        })}
      </Col>)}
    </Row>
    <Space><Button onClick={() => { setCapture(null); onChange(normalizeDemoControls(defaultControls)); }}>{t('settings.restoreControls')}</Button>{capture && <Button onClick={() => setCapture(null)}>{t('common.cancel')}</Button>}</Space>
  </Space>;
}
