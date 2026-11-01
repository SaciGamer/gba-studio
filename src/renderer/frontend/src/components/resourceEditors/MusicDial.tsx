import React, { CSSProperties, KeyboardEvent, useMemo, useRef, useState } from 'react';
import { theme } from 'antd';
import './MusicDial.css';

interface MusicDialProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  valueText?: string;
  disabled?: boolean;
  panScale?: boolean;
  onChange: (value: number) => void;
  onChangeComplete?: (value: number) => void;
}

export default function MusicDial({ label, value, min = -1, max = 1, step = 0.01, valueText, disabled = false, panScale = false, onChange, onChangeComplete }: MusicDialProps) {
  const { token } = theme.useToken();
  const normalized = Math.max(0, Math.min(1, (value - min) / Math.max(Number.EPSILON, max - min)));
  const angle = normalized * 270 - 135;
  const fillStart = panScale ? Math.min(135, normalized * 270) : 0;
  const fillEnd = panScale ? Math.max(135, normalized * 270) : normalized * 270;
  const drag = useRef<{ pointerId: number; x: number; y: number; value: number; latestValue: number; axis: 'horizontal' | 'vertical' | null } | null>(null);
  const [dragAxis, setDragAxis] = useState<'horizontal' | 'vertical' | null>(null);
  const style = useMemo(() => ({ '--dial-angle': `${angle}deg`, '--dial-fill-start': `${fillStart}deg`, '--dial-fill-end': `${fillEnd}deg`, '--dial-accent': token.colorPrimary, '--music-surface-raised': token.colorBgElevated, '--music-surface-highlight': token.colorFillTertiary, '--music-border': token.colorBorderSecondary } as CSSProperties), [angle, fillStart, fillEnd, token]);
  const clampValue = (candidate: number) => Math.max(min, Math.min(max, Math.round(candidate / step) * step));
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    let next: number | undefined;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = value + step;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = value - step;
    else if (event.key === 'PageUp') next = value + step * 10;
    else if (event.key === 'PageDown') next = value - step * 10;
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    if (next !== undefined) { event.preventDefault(); const result = clampValue(next); onChange(result); onChangeComplete?.(result); }
  };
  const control = <button
    type="button"
    className={`gba-music-dial${value === 0 ? ' is-zero' : ''}`}
    role="slider"
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={valueText ?? String(value)}
    aria-disabled={disabled}
    disabled={disabled}
    tabIndex={0}
    style={{ ...style, cursor: disabled ? 'not-allowed' : dragAxis === 'horizontal' ? 'ew-resize' : dragAxis === 'vertical' ? 'ns-resize' : 'move' }}
    onKeyDown={handleKeyDown}
    onPointerDown={event => {
      if (disabled || event.button !== 0) return;
      event.preventDefault();
      drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, value, latestValue: value, axis: null };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId || disabled) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) return;
        current.axis = Math.abs(dx) >= Math.abs(dy) ? 'horizontal' : 'vertical';
        setDragAxis(current.axis);
      }
      const distance = current.axis === 'horizontal' ? dx : -dy;
      current.latestValue = clampValue(current.value + distance / 120 * (max - min));
      onChange(current.latestValue);
    }}
    onPointerUp={event => { const current = drag.current; drag.current = null; setDragAxis(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (current?.axis) onChangeComplete?.(current.latestValue); }}
    onPointerCancel={() => { drag.current = null; setDragAxis(null); }}
    onLostPointerCapture={() => { drag.current = null; setDragAxis(null); }}
  ><span className="gba-music-dial-face"><i aria-hidden="true" className="gba-music-dial-indicator" /></span></button>;
  if (!panScale) return control;
  return <span className="gba-music-dial-pan-scale" style={{ color: token.colorTextSecondary }}>
    <svg viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="27" fill="none" stroke={token.colorBorderSecondary} />
      {Array.from({ length: 9 }, (_, index) => {
        const radians = (-135 + index * 33.75) * Math.PI / 180;
        const x = 40 + Math.sin(radians) * 34;
        const y = 40 - Math.cos(radians) * 34;
        const text = index === 0 ? 'L' : index === 4 ? 'C' : index === 8 ? 'R' : null;
        return text
          ? <text key={index} x={x} y={y} fill="currentColor" textAnchor="middle" dominantBaseline="central" fontSize="10">{text}</text>
          : <circle key={index} cx={x} cy={y} r="1.5" fill="currentColor" />;
      })}
    </svg>
    {control}
  </span>;
}
