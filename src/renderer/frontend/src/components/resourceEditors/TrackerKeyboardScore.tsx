import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Flex, Select, Typography } from 'antd';
import { useI18n } from '@/i18n/I18n';
import type { TrackerPatternEvent } from '@/utils/trackerModule';
import { scorePitchLabel as pitchLabel, scorePitchStep, scoreStepPitch, scorePitchY, scoreDurationParts, scoreRestParts, scoreRhythm, scoreYToPitch, trackerScoreNotes, trackerScoreTiming } from '@/utils/trackerScore';
import { trackerFxVisuals } from '@/utils/trackerFxVisuals';
import TrackerScoreClefs from './TrackerScoreClefs';
import TrackerScoreDirection, { ScoreRepeat, scoreDirectionText, type ScoreDirection } from './TrackerScoreDirection';
import './TrackerKeyboardScore.css';

const systemWidth = 820, measureWidth = 350, leftMargin = 100, systemHeight = 320;
interface Props {
  rows: TrackerPatternEvent[][];
  precedingRows: TrackerPatternEvent[][];
  format: string;
  bpm: number;
  speed: number;
  channel: number;
  playhead: number;
  playing: boolean;
  selectedRow?: number;
  onSelect: (row: number, pitch: number, event: React.MouseEvent) => void;
  onInsert: (row: number, pitch: number) => void;
  onCursor: (row: number) => void;
  onMove: (oldRow: number, row: number, pitch: number) => void;
}

export default function TrackerKeyboardScore(props: Props) {
  const { t } = useI18n();
  const [meter, setMeter] = useState('4/4');
  const [sharp, setSharp] = useState(false);
  const [page, setPage] = useState(0);
  const drag = useRef<{ kind: 'cursor' | 'note'; pointerId: number; x: number; y: number; tick: number; row: number; pitch: number; moved: boolean; target?: { row: number; pitch: number } } | null>(null);
  const suppressClick = useRef(false);
  const [movePreview, setMovePreview] = useState<{ row: number; pitch: number } | null>(null);
  const [numerator, denominator] = meter.split('/').map(Number);
  const beatTicks = 96 / denominator, barTicks = numerator * beatTicks;
  const model = useMemo(() => {
    const inherited = trackerScoreTiming(props.precedingRows, props.format, { bpm: props.bpm, speed: props.speed });
    const timing = trackerScoreTiming(props.rows, props.format, inherited.state);
    return { ...timing, notes: trackerScoreNotes(props.rows, timing.rows, props.channel, props.format) };
  }, [props.rows, props.precedingRows, props.format, props.bpm, props.speed, props.channel]);
  const bars = Math.max(1, Math.ceil(model.ticks / barTicks));
  const pages = Math.ceil(bars / 8);
  const currentPage = Math.min(page, pages - 1);
  useEffect(() => { setPage(0); }, [props.rows, props.channel, meter]);
  useEffect(() => {
    if (props.playing) setPage(Math.floor((model.rows[props.playhead]?.tick ?? 0) / barTicks / 8));
  }, [props.playing, props.playhead, model, barTicks]);
  const activeTime = model.rows[props.playhead];
  const rowAtTick = (tick: number) => {
    let best = 0;
    model.rows.forEach((row, index) => { if (Math.abs(row.tick - tick) < Math.abs(model.rows[best].tick - tick)) best = index; });
    return best;
  };
  const effectMarks = useMemo<ScoreDirection[]>(() => {
    const raw = props.rows.flatMap((row, rowIndex) => row.flatMap((event, channel) => {
    if (!event || event.effect < 0 || !(event.effect || event.parameter)) return [];
    const visuals = trackerFxVisuals(props.format, event.effect, event.parameter);
    return visuals.filter(visual => channel === props.channel || ['speed', 'tempo', 'patternDelay', 'finePatternDelay', 'orderJump', 'patternBreak', 'patternLoop'].includes(visual.name))
      .map(visual => ({ ...visual, row: rowIndex, channel, tick: model.rows[rowIndex]?.tick ?? 0,
        endTick: (model.rows[rowIndex]?.tick ?? 0) + (model.rows[rowIndex]?.ticks ?? 0) }));
    }));
    const result: ScoreDirection[] = [], previous = new Map<string, ScoreDirection>();
    for (const mark of raw) {
      const key = `${mark.channel}:${mark.id}`;
      const last = previous.get(key);
      const newNote = props.rows[mark.row]?.[mark.channel]?.note ?? 0;
      if (last && last.parameter === mark.parameter && last.endTick === mark.tick && !(newNote >= 1 && newNote <= 96)
        && ['vibrato', 'fineVibrato', 'arpeggio', 'portamento', 'tremolo', 'volumeSlide', 'pitchUp', 'pitchDown'].includes(mark.name)) last.endTick = mark.endTick;
      else { result.push(mark); previous.set(key, mark); }
    }
    return result;
  }, [props.rows, props.channel, props.format, model]);
  const repeatMarks = useMemo(() => {
    const starts = new Map<number, number>();
    const marks: Array<{ tick: number; start: boolean; count?: number }> = [];
    for (const effect of effectMarks) {
      if (effect.name !== 'patternLoop') continue;
      if (effect.parameter === 0) {
        starts.set(effect.channel, effect.tick); marks.push({ tick: effect.tick, start: true });
      } else {
        if (!starts.has(effect.channel)) { starts.set(effect.channel, 0); marks.push({ tick: 0, start: true }); }
        marks.push({ tick: effect.endTick, start: false, count: effect.parameter + 1 });
      }
    }
    return [...new Map(marks.map(mark => [`${mark.tick}:${mark.start}:${mark.count}`, mark])).values()];
  }, [effectMarks]);
  return <section className="gba-keyboard-score" aria-label={t('music.score.title')}>
    <Flex gap={12} align="center" wrap="wrap" className="gba-score-toolbar">
      <Typography.Text strong>{t('music.score.title')}</Typography.Text>
      <label>{t('music.score.meter')} <Select size="small" aria-label={t('music.score.meter')} value={meter} onChange={setMeter}
        options={['2/4', '3/4', '4/4', '6/8'].map(value => ({ value, label: value }))} /></label>
      <Button size="small" type={sharp ? 'primary' : 'default'} aria-label={t('music.score.sharp')} aria-pressed={sharp} onClick={() => setSharp(value => !value)}>♯</Button>
      <Typography.Text type="secondary">{t('music.score.timing', { bpm: activeTime?.bpm ?? props.bpm, speed: activeTime?.speed ?? props.speed })}</Typography.Text>
      <Button size="small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label={t('music.score.previous')}>‹</Button>
      <Typography.Text>{currentPage + 1} / {pages}</Typography.Text>
      <Button size="small" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)} aria-label={t('music.score.next')}>›</Button>
    </Flex>
    <Typography.Text type="secondary" className="gba-score-help">{t('music.score.hint')}</Typography.Text>
    <div className="gba-score-systems">
      {Array.from({ length: Math.min(4, Math.ceil((bars - currentPage * 8) / 2)) }, (_, system) => {
        const firstBar = currentPage * 8 + system * 2;
        const barCount = Math.min(2, bars - firstBar);
        const startTick = firstBar * barTicks, endTick = (firstBar + barCount) * barTicks;
        const xAt = (tick: number) => leftMargin + (tick - startTick) / barTicks * measureWidth;
        const notes = model.notes.filter(note => note.start < endTick && note.end > startTick);
        const cursor = activeTime && activeTime.tick >= startTick && activeTime.tick < endTick;
        const labelEnds = [0, 0, 0];
        const directions = effectMarks.filter(effect => effect.name !== 'patternLoop' && effect.tick >= startTick && effect.tick < endTick).map(effect => {
          const x = xAt(effect.tick);
          const lane = labelEnds.findIndex(end => end <= x);
          const width = Math.max(44, scoreDirectionText(effect).length * 7 + 10);
          if (lane >= 0) labelEnds[lane] = x + width;
          return { effect, annotationY: 46 + Math.max(0, lane) * 16, showLabel: lane >= 0 };
        });
        const onBlankClick = (event: React.MouseEvent<SVGSVGElement>) => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          if (props.playing || (event.target as Element).closest('[data-score-note],[data-score-cursor-handle]') || !model.rows.length) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = (event.clientX - bounds.left) * systemWidth / bounds.width;
          const y = (event.clientY - bounds.top) * systemHeight / bounds.height;
          if (x < leftMargin || x > leftMargin + barCount * measureWidth) return;
          const tick = startTick + (x - leftMargin) / measureWidth * barTicks;
          if (tick >= model.ticks) return;
          const row = rowAtTick(tick);
          if (y < 80) props.onCursor(row);
          else props.onInsert(row, scoreYToPitch(y, sharp));
        };
        const pointerPosition = (event: React.PointerEvent<SVGSVGElement>) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          return { x: (event.clientX - bounds.left) * systemWidth / bounds.width, y: (event.clientY - bounds.top) * systemHeight / bounds.height };
        };
        const beginDrag = (event: React.PointerEvent<SVGGElement>, kind: 'cursor' | 'note', row: number, pitch: number) => {
          if (props.playing || event.button !== 0) return;
          event.preventDefault(); event.stopPropagation();
          if (kind === 'note') (event.currentTarget.parentElement as unknown as SVGElement)?.focus({ preventScroll: true });
          const svg = event.currentTarget.ownerSVGElement!;
          const bounds = svg.getBoundingClientRect();
          drag.current = { kind, pointerId: event.pointerId, row, pitch, tick: model.rows[row]?.tick ?? 0,
            x: (event.clientX - bounds.left) * systemWidth / bounds.width, y: (event.clientY - bounds.top) * systemHeight / bounds.height, moved: false };
          svg.setPointerCapture(event.pointerId);
        };
        return <svg key={firstBar} className="gba-score-system" viewBox={`0 0 ${systemWidth} ${systemHeight}`} onClick={onBlankClick}
          onPointerMove={event => {
            const current = drag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            const point = pointerPosition(event);
            if (Math.abs(point.x - current.x) + Math.abs(point.y - current.y) < 3 && !current.moved) return;
            current.moved = true;
            const row = rowAtTick(Math.max(0, current.tick + (point.x - current.x) / measureWidth * barTicks));
            if (current.kind === 'cursor') props.onCursor(row);
            else {
              current.target = { row, pitch: scoreStepPitch(scorePitchStep(current.pitch) + Math.round((current.y - point.y) / 5), [1, 3, 6, 8, 10].includes((current.pitch - 1) % 12)) };
              setMovePreview(current.target);
            }
          }} onPointerUp={event => {
            const current = drag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            suppressClick.current = true;
            window.setTimeout(() => { suppressClick.current = false; }, 0);
            if (current.moved && current.kind === 'note' && current.target) props.onMove(current.row, current.target.row, current.target.pitch);
            else if (current.kind === 'note') props.onSelect(current.row, current.pitch, event as unknown as React.MouseEvent);
            setMovePreview(null);
          }} onPointerCancel={event => { drag.current = null; setMovePreview(null); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
          role="group" aria-label={t('music.score.system', { first: firstBar + 1, last: firstBar + barCount })}>
          {[110, 120, 130, 140, 150, 170, 180, 190, 200, 210].map(y => <line key={y} x1="15" x2={leftMargin + barCount * measureWidth} y1={y} y2={y} className="gba-score-staff-line" />)}
          <path data-score-brace="true" d="M 12 110 C 3 116 3 125 6 140 C 8 151 7 156 2 160 C 7 164 8 169 6 180 C 3 195 3 204 12 210 C 7 201 7 194 9 182 C 12 169 10 164 5 160 C 10 156 12 151 9 138 C 7 126 7 119 12 110 Z" fill="currentColor" />
          <TrackerScoreClefs />
          {[125, 145, 185, 205].map((y, index) => <text key={y} x="65" y={y} className="gba-score-meter">{index % 2 ? denominator : numerator}</text>)}
          {Array.from({ length: barCount }, (_, bar) => {
            const absoluteBar = firstBar + bar, tick = absoluteBar * barTicks;
            const barX = xAt(tick);
            const fragments = notes.filter(note => note.start < tick + barTicks && note.end > tick);
            let covered = tick;
            const gaps: Array<[number, number]> = [];
            for (const note of fragments) {
              if (note.start > covered) gaps.push([covered, Math.min(note.start, tick + barTicks)]);
              covered = Math.max(covered, note.end);
            }
            if (covered < Math.min(model.ticks, tick + barTicks)) gaps.push([covered, Math.min(model.ticks, tick + barTicks)]);
            const accidentals = new Map<number, boolean>();
            return <g key={bar}>
              <text x={barX + 5} y="30" className="gba-score-bar-label">{t('music.score.bar', { bar: absoluteBar + 1 })}</text>
              <line x1={barX} x2={barX} y1="110" y2="210" className="gba-score-bar-line" />
              {Array.from({ length: numerator }, (_, beat) => <g key={beat}>
                <line x1={barX + beat * measureWidth / numerator} x2={barX + beat * measureWidth / numerator} y1="80" y2="280" className="gba-score-beat-line" />
                <text x={barX + beat * measureWidth / numerator + 5} y="300" className="gba-score-beat-label">{beat + 1}</text>
              </g>)}
              {gaps.flatMap(([start, end]) => scoreRestParts(start, end)).map(rest => {
                const x = xAt(rest.start) + 14, rhythm = scoreRhythm(rest.ticks);
                return <g key={`rest:${rest.start}`} className="gba-score-rest"><title>{t('music.score.rest', { ticks: rest.ticks })}</title>
                  {rhythm.hollow ? <rect x={x - 6} y={rhythm.stem ? 136 : 130} width="12" height="4" fill="currentColor" />
                    : rhythm.flags ? <g stroke="currentColor" strokeWidth="2"><line x1={x + 4} x2={x - 3} y1="128" y2={145 + rhythm.flags * 5} />{Array.from({ length: rhythm.flags }, (_, flag) => <path key={flag} d={`M ${x + 3 - flag} ${130 + flag * 6} q -12 7 -10 0 q 4 -8 10 0`} fill="currentColor" />)}</g>
                    : <path d={`M ${x} 124 l 6 9 -7 8 8 8 q -13 -4 -8 6 l -9 -12 8 -9 -5 -8`} fill="currentColor" />}
                  {rhythm.dotted && <circle cx={x + 12} cy="135" r="2" fill="currentColor" />}
                  {rhythm.tuplet && <text data-score-tuplet="3:2" x={x + 2} y="115" textAnchor="middle" fill="currentColor" fontSize="9">3:2</text>}
                </g>;
              })}
              {fragments.flatMap(note => scoreDurationParts(Math.max(tick, note.start), Math.min(tick + barTicks, note.end)).map((part, partIndex, parts) => {
                const start = part.start, end = start + part.ticks;
                const x = xAt(start) + 14, y = scorePitchY(note.pitch);
                const rhythm = scoreRhythm(end - start);
                const selected = props.selectedRow === note.row;
                const sharpPitch = [1, 3, 6, 8, 10].includes((note.pitch - 1) % 12);
                const accidental = partIndex === 0 && sharpPitch;
                const natural = partIndex === 0 && !sharpPitch && accidentals.get(scorePitchStep(note.pitch));
                accidentals.set(scorePitchStep(note.pitch), sharpPitch);
                const fx = effectMarks.filter(effect => effect.channel === props.channel && effect.tick >= note.start && effect.tick < note.end);
                const description = t('music.score.note', { note: pitchLabel(note.pitch), row: note.row + 1, ticks: note.end - note.start, seconds: note.duration.toFixed(3) });
                const select = (event: React.MouseEvent) => { event.stopPropagation(); if (event.detail === 0 && !props.playing) props.onSelect(note.row, note.pitch, event); };
                const ledgers: number[] = [];
                if (y === 160) ledgers.push(160);
                for (let line = 100; line >= y; line -= 10) ledgers.push(line);
                for (let line = 220; line <= y; line += 10) ledgers.push(line);
                return <g key={`${note.row}:${bar}:${start}`} data-score-note={note.row} data-score-fragment-ticks={part.ticks} role="button" tabIndex={props.playing ? -1 : 0} aria-label={description}
                  className={`gba-score-note ${selected ? 'selected' : ''}`} onClick={select} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !props.playing) { event.preventDefault(); props.onSelect(note.row, note.pitch, event as unknown as React.MouseEvent); } }}>
                  <g onPointerDown={event => beginDrag(event, 'note', note.row, note.pitch)}>
                  <title>{description}{fx.length ? ` · ${fx.map(effect => `${t(`music.effects.${effect.name}`)} ${effect.parameter.toString(16).toUpperCase()}`).join(', ')}` : ''}</title>
                  <rect x={x - 12} y={y - 18} width="30" height="55" fill="transparent" />
                  {ledgers.map(line => <line key={line} x1={x - 11} x2={x + 11} y1={line} y2={line} stroke="currentColor" />)}
                  {(accidental || natural) && <text className="gba-score-accidental" x={x - 19} y={y + 4} fontSize="17" fill="currentColor">{accidental ? '♯' : '♮'}</text>}
                  <ellipse data-score-notehead="true" cx={x} cy={y} rx="7" ry="4.5" transform={`rotate(-18 ${x} ${y})`} fill={rhythm.hollow ? 'var(--music-surface-base)' : 'currentColor'} stroke="currentColor" strokeWidth="1.6" />
                  {rhythm.stem && <line x1={x + 6} x2={x + 6} y1={y} y2={y - 28} stroke="currentColor" strokeWidth="1.6" />}
                  {Array.from({ length: Math.max(0, rhythm.flags) }, (_, flag) => <path key={flag} d={`M ${x + 6} ${y - 28 + flag * 7} q 16 8 5 17 q 5 -10 -5 -11`} fill="currentColor" />)}
                  {rhythm.dotted && <circle cx={x + 13} cy={y - 2} r="2" fill="currentColor" />}
                  {rhythm.tuplet && <g data-score-tuplet="3:2"><path d={`M ${x - 7} ${y - 39} v -3 h 25 v 3`} fill="none" stroke="currentColor" strokeWidth=".8" /><text x={x + 5} y={y - 45} textAnchor="middle" fill="currentColor" fontSize="9">3:2</text></g>}
                  {partIndex === 0 && note.start < tick && <path data-score-tie="incoming" d={`M ${x - 12} ${y + 9} q 9 7 17 0`} fill="none" stroke="currentColor" />}
                  {partIndex + 1 < parts.length ? <path data-score-tie="internal" d={`M ${x + 2} ${y + 9} Q ${(x + xAt(end) + 14) / 2} ${y + 21} ${xAt(end) + 12} ${y + 9}`} fill="none" stroke="currentColor" />
                    : note.end > tick + barTicks && <path data-score-tie="outgoing" d={`M ${x + 8} ${y + 9} Q ${xAt(tick + barTicks) - 10} ${y + 30} ${xAt(tick + barTicks) - 3} ${y + 9}`} fill="none" stroke="currentColor" />}
                  {partIndex === 0 && <><text x={x} y="248" textAnchor="middle" className="gba-score-pitch-label">{pitchLabel(note.pitch)}</text>
                  <text x={x} y="265" textAnchor="middle" className="gba-score-tick-label">{Math.min(tick + barTicks, note.end) - Math.max(tick, note.start)}t</text></>}
                  </g>
                </g>;
              }))}
            </g>;
          })}
          {directions.map(({ effect, annotationY, showLabel }) => {
            const base = model.notes.find(note => note.row === effect.row || note.start <= effect.tick && note.end > effect.tick);
            const next = base && model.notes.find(note => note.start >= base.end);
            return <TrackerScoreDirection key={`${effect.row}:${effect.channel}:${effect.id}`} effect={effect} x={xAt(effect.tick)} base={base} next={next} xAt={xAt} limit={leftMargin + barCount * measureWidth} annotationY={annotationY} showLabel={showLabel} />;
          })}
          <line x1={leftMargin + barCount * measureWidth} x2={leftMargin + barCount * measureWidth} y1="110" y2="210" className="gba-score-bar-line" />
          {repeatMarks.filter(mark => mark.start ? mark.tick >= startTick && mark.tick < endTick : mark.tick > startTick && mark.tick <= endTick).map((mark, index) => <ScoreRepeat key={index} x={xAt(mark.tick)} start={mark.start} count={mark.count} />)}
          {movePreview && drag.current?.kind === 'note' && <ellipse cx={xAt(model.rows[movePreview.row]?.tick ?? 0) + 14} cy={scorePitchY(movePreview.pitch)} rx="8" ry="5" fill="var(--music-primary)" opacity=".6" pointerEvents="none" />}
          {cursor && <g data-score-cursor-handle="true" className="gba-score-cursor-handle" onPointerDown={event => beginDrag(event, 'cursor', props.playhead, 49)}>
            <rect x={xAt(activeTime.tick) - 7} y="76" width="14" height="208" fill="transparent" />
            <line data-score-playhead="true" x1={xAt(activeTime.tick)} x2={xAt(activeTime.tick)} y1="80" y2="280" className="gba-score-cursor" />
            <path d={`M ${xAt(activeTime.tick) - 6} 77 l 12 0 -6 8 Z`} fill="var(--music-primary)" />
          </g>}
        </svg>;
      })}
    </div>
  </section>;
}
