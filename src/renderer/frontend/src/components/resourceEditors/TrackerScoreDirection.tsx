import React from 'react';
import { useI18n } from '@/i18n/I18n';
import { scorePitchLabel, scorePitchY, type ScoreNote } from '@/utils/trackerScore';
import type { TrackerFxVisual } from '@/utils/trackerFxVisuals';

export interface ScoreDirection extends TrackerFxVisual { row: number; channel: number; tick: number; endTick: number; repeatStart?: number }
const wave = (x: number, y: number, length: number) => `M ${x} ${y} ` + Array.from({ length: Math.max(1, Math.floor(length / 8)) }, () => 'q 2 -3 4 0 q 2 3 4 0').join(' ');

export function scoreDirectionText(effect: ScoreDirection): string {
  const { name, parameter } = effect;
  if (name === 'vibrato' || name === 'fineVibrato') return 'vib.';
  if (name === 'tremolo') return 'trem.';
  if (name === 'panbrello') return 'pan';
  if (name === 'arpeggio') return 'arp.';
  if (name === 'portamento') return 'port.';
  if (name === 'glissando') return 'gliss.';
  if (['pitchUp', 'pitchDown', 'finePitchUp', 'finePitchDown'].includes(name)) return 'slide';
  if (name === 'retrigger') return 'reart.';
  if (['volumeSlide', 'fineVolumeUp', 'fineVolumeDown', 'channelVolumeSlide', 'globalVolumeSlide'].includes(name)) return 'cresc.';
  if (name === 'patternDelay' || name === 'finePatternDelay') return `+${parameter}t`;
  if (name === 'orderJump') return parameter === 0 ? 'D.C.' : `→ §${parameter + 1}`;
  if (name === 'patternBreak') return `→ +1:${(parameter >> 4) * 10 + (parameter & 15) + 1}`;
  if (name === 'tempo') return parameter >= 32 ? `♩ = ${parameter}` : parameter < 16 ? 'rit.' : 'accel.';
  if (name === 'speed') return `${parameter}t`;
  return `${name === 'pan' ? 'pan' : effect.code} ${parameter.toString(16).toUpperCase().padStart(2, '0')}`;
}

export function ScoreRepeat({ x, start, count }: { x: number; start: boolean; count?: number }) {
  const { t } = useI18n();
  const side = start ? 1 : -1;
  return <g data-score-repeat={start ? 'start' : 'end'} fill="currentColor" stroke="currentColor" pointerEvents="none">
    <title>{start ? t('music.score.repeatStart') : t('music.score.repeatEnd', { count: count ?? 2 })}</title>
    <line x1={x} x2={x} y1="110" y2="210" strokeWidth="3" />
    <line x1={x + side * 5} x2={x + side * 5} y1="110" y2="210" strokeWidth="1" />
    {[125, 135, 185, 195].map(y => <circle key={y} cx={x + side * 12} cy={y} r="2" stroke="none" />)}
    {!start && <text x={x - 8} y="94" textAnchor="end" stroke="none" fill="currentColor" fontSize="11">×{count}</text>}
  </g>;
}

export default function TrackerScoreDirection({ effect, x, base, next, xAt, limit, annotationY = 48, showLabel = true }: {
  effect: ScoreDirection; x: number; base?: ScoreNote; next?: ScoreNote; xAt: (tick: number) => number; limit: number;
  annotationY?: number; showLabel?: boolean;
}) {
  const { t } = useI18n();
  const { name, parameter } = effect;
  const label = t(`music.effects.${name}`);
  const y = annotationY;
  const pitchY = base ? scorePitchY(base.pitch) : 145;
  let symbol: React.ReactNode;
  if (name === 'patternLoop') return null;
  if (name === 'vibrato' || name === 'fineVibrato' || name === 'tremolo' || name === 'panbrello') {
    symbol = <><text data-score-direction-label="true" x={x} y={y}>{name === 'tremolo' ? 'trem.' : name === 'panbrello' ? 'pan' : 'vib.'}</text><path d={wave(x, y + 9, 32)} fill="none" stroke="currentColor" strokeWidth="1.2" /></>;
  } else if (name === 'arpeggio') {
    const pitches = base ? [...new Set([base.pitch, Math.min(96, base.pitch + (parameter >> 4)), Math.min(96, base.pitch + (parameter & 15))])] : [];
    const top = pitches.length ? Math.min(...pitches.map(scorePitchY)) : pitchY;
    const accidentalColumns: number[] = [];
    const guides = pitches.slice(1).sort((a, b) => b - a).map(pitch => {
      const y = scorePitchY(pitch);
      const sharp = [1, 3, 6, 8, 10].includes((pitch - 1) % 12);
      let column = 0;
      if (sharp) {
        while (column < accidentalColumns.length && y - accidentalColumns[column] < 14) column++;
        accidentalColumns[column] = y;
      }
      return { pitch, y, sharp, column };
    });
    symbol = <><text data-score-direction-label="true" x={x} y={y}>arp.</text>
      {pitches.length > 1 && <g data-score-arpeggio="true">
        <title>{t('music.score.arpeggioGuide', { notes: pitches.map(scorePitchLabel).join(' – ') })}</title>
        <path d={wave(0, 0, Math.max(16, pitchY - top + 8))} transform={`translate(${accidentalColumns.length ? x - 18 - (accidentalColumns.length - 1) * 11 : x + 2} ${top - 4}) rotate(90)`} fill="none" stroke="currentColor" />
        {guides.map(guide => <g key={guide.pitch} opacity=".7"><ellipse data-score-arpeggio-head={guide.pitch} cx={x + 14} cy={guide.y} rx="5" ry="3.5" fill="var(--music-surface-base)" stroke="currentColor" />
          {guide.sharp && <text data-score-arpeggio-accidental={guide.pitch} x={x - guide.column * 11} y={guide.y + 3} textAnchor="end" fill="currentColor" fontSize="12" fontStyle="normal">♯</text>}
        </g>)}
      </g>}
    </>;
  } else if (name === 'portamento' || name === 'glissando' || ['pitchUp', 'pitchDown', 'finePitchUp', 'finePitchDown'].includes(name)) {
    const portamento = name === 'portamento';
    const targetX = Math.min(limit - 5, next && portamento ? xAt(next.start) + 6 : x + 40);
    const targetY = next && portamento ? scorePitchY(next.pitch) : pitchY + (name.includes('Down') ? 16 : -16);
    symbol = <><text data-score-direction-label="true" x={x} y={y}>{portamento ? 'port.' : name === 'glissando' ? 'gliss.' : 'slide'}</text>
      {base && targetX > x + 22 && <line x1={x + 24} y1={pitchY} x2={targetX} y2={targetY} stroke="currentColor" strokeWidth="1.2" />}
    </>;
  } else if (name === 'retrigger') {
    symbol = <><text data-score-direction-label="true" x={x} y={y}>reart.</text>{base && [0, 1, 2].map(index => <path key={index} d={`M ${x + 15} ${pitchY - 20 + index * 5} l 10 -5`} stroke="currentColor" strokeWidth="2" />)}</>;
  } else if (['volumeSlide', 'fineVolumeUp', 'fineVolumeDown', 'channelVolumeSlide', 'globalVolumeSlide'].includes(name)) {
    const up = name.endsWith('Up') || !name.endsWith('Down') && (parameter >> 4) > 0;
    symbol = <><text data-score-direction-label="true" x={x} y={y}>{up ? 'cresc.' : 'dim.'}</text><path d={up ? `M ${x + 36} 235 L ${x} 230 L ${x + 36} 225` : `M ${x} 235 L ${x + 36} 230 L ${x} 225`} fill="none" stroke="currentColor" strokeWidth="1.2" /></>;
  } else if (name === 'patternDelay' || name === 'finePatternDelay') {
    symbol = <><path d={`M ${x} 92 a 12 10 0 0 1 24 0`} fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx={x + 12} cy="90" r="2" /><text data-score-direction-label="true" x={x} y={y}>+{parameter}{name === 'finePatternDelay' ? 't' : '×'}</text></>;
  } else if (name === 'orderJump') {
    symbol = <text data-score-direction-label="true" x={x} y={y}>{scoreDirectionText(effect)}</text>;
  } else if (name === 'patternBreak') {
    symbol = <text data-score-direction-label="true" x={x} y={y}>{scoreDirectionText(effect)}</text>;
  } else if (name === 'tempo') symbol = <text data-score-direction-label="true" x={x} y={y}>{parameter >= 32 ? `♩ = ${parameter}` : parameter < 16 ? 'rit.' : 'accel.'}</text>;
  else if (name === 'speed') symbol = <text data-score-direction-label="true" x={x} y={y}>{parameter}t</text>;
  else if (name === 'pan') symbol = <text data-score-direction-label="true" x={x} y={y}>pan {parameter.toString(16).toUpperCase().padStart(2, '0')}</text>;
  else symbol = <text data-score-direction-label="true" x={x} y={y}>{scoreDirectionText(effect)}</text>;
  return <g className={`gba-score-effect gba-score-direction ${showLabel ? '' : 'gba-score-direction-dense'}`} data-score-direction={name} fill="currentColor" pointerEvents="visiblePainted" onClick={event => event.stopPropagation()}>
    <title>{label} · {parameter.toString(16).toUpperCase().padStart(2, '0')}</title>{symbol}
    {!showLabel && <circle cx={x + 2} cy={y - 3} r="2" fill="currentColor" />}
  </g>;
}
