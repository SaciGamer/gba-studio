import React, { forwardRef, memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Flex, Popover, Tooltip } from 'antd';
import { useI18n } from '@/i18n/I18n';
import type { TrackerPatternEvent } from '@/utils/trackerModule';
import { trackerFxVisuals } from '@/utils/trackerFxVisuals';
import { clampTrackerFxDelta, trackerFxPlacementUpdates, type TrackerFxCell, type TrackerFxUpdate } from '@/utils/trackerFxEditing';
import TrackerNoteEffectEditor from './TrackerNoteEffectEditor';

type Segment = { patternIndex: number; orderIndex: number; start: number; end: number; rows: TrackerPatternEvent[][] };
interface Props {
  format: string; segments: Segment[]; channel: number;
  gridWidth: number; rowCount: number; playing: boolean;
  tool: 'pencil' | 'eraser' | 'select';
  scrollRef: React.RefObject<HTMLDivElement>;
  commandRef: React.MutableRefObject<((command: string) => boolean) | null>;
  onActivate: () => void;
  onHoverRow?: (row: number | null) => void;
  onEffectsChange: (updates: TrackerFxUpdate[]) => void;
  onEffectChange: (row: number, channel: number, patternIndex: number, effect: number, parameter: number) => void;
}
const laneHeight = 28;
const rulerHeight = 20;
const renderBlockRows = 32;

export default memo(forwardRef<HTMLDivElement, Props>(function TrackerFxLane(props, ref) {
  const { t } = useI18n();
  const gridRef = useRef<HTMLDivElement>(null);
  const hoverMarker = useRef<HTMLDivElement>(null);
  const showHover = (row: number | null) => {
    if (hoverMarker.current) {
      hoverMarker.current.style.display = row === null ? 'none' : 'block';
      if (row !== null) hoverMarker.current.style.left = `${row * props.gridWidth}px`;
    }
    props.onHoverRow?.(row);
  };
  const active = useRef(false);
  const hoverRow = useRef(0);
  const clipboard = useRef<TrackerFxCell[]>([]);
  const gesture = useRef<{ pointerId: number; startRow: number; startX: number; mode: 'move' | 'select' | 'erase' | 'add';
    cells: TrackerFxCell[]; selection: number[]; moved: boolean; focusedEffect?: string } | null>(null);
  const panGesture = useRef<{ pointerId: number; startX: number; scrollLeft: number } | null>(null);
  const [selection, setSelection] = useState<number[]>([]);
  const [range, setRange] = useState<{ start: number; end: number; erase: boolean } | null>(null);
  const [preview, setPreview] = useState<{ cells: TrackerFxCell[]; delta: number; move: boolean } | null>(null);
  const paste = useRef<TrackerFxCell[] | null>(null);
  const [visibleRows, setVisibleRows] = useState({ start: 0, end: 0 });
  const [panning, setPanning] = useState(false);
  const [editing, setEditing] = useState<{ timelineRow: number; row: number; patternIndex: number; orderIndex: number; channel: number; focusedEffect?: string } | null>(null);
  const entries = useMemo(() => props.segments.flatMap(segment => segment.rows.flatMap((row, index) => {
    const event = row[props.channel];
    if (!event) return [];
    return event.effect >= 0 && (event.effect > 0 || event.parameter > 0)
      ? [{ timelineRow: segment.start + index, row: index, channel: props.channel, segment, effect: event.effect, parameter: event.parameter }] : [];
  })), [props.segments, props.format, props.channel]);
  const visualsByEffect = useMemo(() => {
    const result = new Map<number, ReturnType<typeof trackerFxVisuals>>();
    for (const entry of entries) {
      const key = entry.effect * 256 + entry.parameter;
      if (!result.has(key)) result.set(key, trackerFxVisuals(props.format, entry.effect, entry.parameter));
    }
    return result;
  }, [entries, props.format]);
  const visibleEntries = useMemo(() => {
    const lowerBound = (row: number) => {
      let low = 0, high = entries.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (entries[middle].timelineRow < row) low = middle + 1;
        else high = middle;
      }
      return low;
    };
    return entries.slice(lowerBound(visibleRows.start), lowerBound(visibleRows.end));
  }, [entries, visibleRows.start, visibleRows.end]);
  // Pre-render neighboring blocks so scrolling does not expose unmounted badges.
  useLayoutEffect(() => {
    const scroll = props.scrollRef.current;
    if (!scroll) return;
    let frame = 0;
    const update = () => {
      const start = Math.max(0, (Math.floor(scroll.scrollLeft / props.gridWidth / renderBlockRows) - 1) * renderBlockRows);
      const end = Math.min(props.rowCount, (Math.ceil((scroll.scrollLeft + scroll.clientWidth) / props.gridWidth / renderBlockRows) + 1) * renderBlockRows);
      setVisibleRows(previous => previous.start === start && previous.end === end ? previous : { start, end });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const observer = new ResizeObserver(schedule);
    observer.observe(scroll);
    scroll.addEventListener('scroll', schedule, { passive: true });
    update();
    return () => { observer.disconnect(); scroll.removeEventListener('scroll', schedule); cancelAnimationFrame(frame); };
  }, [props.gridWidth, props.rowCount, props.scrollRef]);
  const cancelGesture = () => {
    const current = gesture.current;
    gesture.current = null;
    if (current && gridRef.current?.hasPointerCapture(current.pointerId)) gridRef.current.releasePointerCapture(current.pointerId);
    paste.current = null;
    setRange(null); setPreview(null);
  };
  useEffect(() => {
    setEditing(null); setSelection([]); cancelGesture();
  }, [props.channel, props.playing, props.tool]);
  useEffect(() => {
    if (editing && (editing.timelineRow < visibleRows.start || editing.timelineRow >= visibleRows.end)) setEditing(null);
  }, [visibleRows.start, visibleRows.end, editing]);
  useEffect(() => {
    const deactivate = (event: PointerEvent) => {
      if ((event.target as HTMLElement)?.closest('.gba-beat-grid,.gba-tracker-grid,.gba-keyboard-editor')) {
        active.current = false; setSelection([]); cancelGesture();
      }
    };
    document.addEventListener('pointerdown', deactivate, true);
    return () => document.removeEventListener('pointerdown', deactivate, true);
  }, []);
  const selectedCells = () => entries.filter(entry => selection.includes(entry.timelineRow));
  const eraseCells = (cells: TrackerFxCell[]) => props.onEffectsChange(trackerFxPlacementUpdates(props.segments, props.channel,
    cells.map(cell => ({ ...cell, effect: 0, parameter: 0 })), 0));
  props.commandRef.current = command => {
    if (!active.current) return false;
    if (!['copy', 'cut', 'paste', 'delete', 'duplicate', 'escape'].includes(command)) return false;
    if (props.playing) return true;
    if (command === 'escape') { cancelGesture(); setEditing(null); setSelection([]); return true; }
    const cells = selectedCells();
    if (command === 'copy' || command === 'cut') {
      if (cells.length) {
        const first = Math.min(...cells.map(cell => cell.timelineRow));
        clipboard.current = cells.map(({ timelineRow, effect, parameter }) => ({ timelineRow: timelineRow - first, effect, parameter }));
        if (command === 'cut') { eraseCells(cells); setSelection([]); }
      }
    } else if (command === 'delete') { eraseCells(cells); setSelection([]); }
    else {
      const copied = command === 'duplicate' && cells.length
        ? cells.map(cell => ({ ...cell, timelineRow: cell.timelineRow - Math.min(...cells.map(item => item.timelineRow)) })) : clipboard.current;
      if (copied.length) {
        setEditing(null); paste.current = copied;
        setPreview({ cells: copied, delta: clampTrackerFxDelta(copied, hoverRow.current, props.rowCount), move: false });
      }
    }
    return true;
  };
  useEffect(() => () => { props.commandRef.current = null; }, [props.commandRef]);
  useEffect(() => {
    const fxUndoShortcut = (event: KeyboardEvent) => {
      if (!active.current || !(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('textarea,[contenteditable="true"]')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      window.dispatchEvent(new CustomEvent(event.shiftKey ? 'gba-studio:editor-redo' : 'gba-studio:editor-undo'));
    };
    const deleteRequest = (event: Event) => {
      if (!active.current) return;
      event.stopImmediatePropagation(); props.commandRef.current?.('delete');
    };
    const historyChange = () => { cancelGesture(); setEditing(null); };
    window.addEventListener('keydown', fxUndoShortcut, true);
    window.addEventListener('gba-studio:music-delete-request', deleteRequest, true);
    window.addEventListener('gba-studio:editor-undo', historyChange, true);
    window.addEventListener('gba-studio:editor-redo', historyChange, true);
    return () => {
      window.removeEventListener('keydown', fxUndoShortcut, true);
      window.removeEventListener('gba-studio:music-delete-request', deleteRequest, true);
      window.removeEventListener('gba-studio:editor-undo', historyChange, true);
      window.removeEventListener('gba-studio:editor-redo', historyChange, true);
    };
  }, [props.commandRef]);
  useEffect(() => {
    if (!editing) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.gba-music-fx-config,.ant-select-dropdown,.gba-music-fx-badge')) return;
      setEditing(null);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditing(null);
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeEscape, true);
    };
  }, [Boolean(editing)]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && active.current) {
        cancelGesture(); setSelection([]); setEditing(null);
      }
    };
    window.addEventListener('keydown', escape, true);
    return () => window.removeEventListener('keydown', escape, true);
  }, []);
  const openAt = (timelineRow: number, channel: number, focusedEffect?: string) => {
    if (props.playing) return;
    const segment = props.segments.find(item => timelineRow >= item.start && timelineRow < item.end);
    if (segment) setEditing({ timelineRow, row: timelineRow - segment.start, patternIndex: segment.patternIndex, orderIndex: segment.orderIndex, channel, focusedEffect });
  };
  const activeSegment = editing && props.segments.find(item => item.orderIndex === editing.orderIndex && item.patternIndex === editing.patternIndex);
  const activeEvent = editing ? activeSegment?.rows[editing.row]?.[editing.channel] : undefined;
  const rowAt = (clientX: number) => Math.max(0, Math.min(props.rowCount - 1,
    Math.floor((clientX - (gridRef.current?.getBoundingClientRect().left ?? 0)) / props.gridWidth)));
  const startPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (props.playing) return;
    if (event.button === 1) {
      event.preventDefault();
      const scroll = props.scrollRef.current;
      if (!scroll) return;
      panGesture.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: scroll.scrollLeft };
      setPanning(true); event.currentTarget.setPointerCapture(event.pointerId); return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    active.current = true; props.onActivate();
    const row = rowAt(event.clientX);
    hoverRow.current = row;
    showHover(row);
    if (paste.current) {
      const delta = clampTrackerFxDelta(paste.current, row, props.rowCount);
      props.onEffectsChange(trackerFxPlacementUpdates(props.segments, props.channel, paste.current, delta));
      setSelection(paste.current.map(cell => cell.timelineRow + delta));
      paste.current = null; setPreview(null); return;
    }
    setEditing(null);
    const entry = entries.find(item => item.timelineRow === row);
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    const mode = props.tool === 'eraser' ? 'erase' : entry ? 'move' : props.tool === 'select' ? 'select' : 'add';
    let nextSelection = selection;
    if (entry && mode === 'move') {
      nextSelection = additive ? selection.includes(row) ? selection.filter(item => item !== row) : [...selection, row]
        : selection.includes(row) ? selection : [row];
      setSelection(nextSelection);
    } else if (mode === 'select' && !additive) { nextSelection = []; setSelection([]); }
    else if (mode === 'add') setSelection([row]);
    gesture.current = { pointerId: event.pointerId, startRow: row, startX: event.clientX, mode,
      cells: entries.filter(item => nextSelection.includes(item.timelineRow)), selection: additive ? selection : [], moved: false,
      focusedEffect: (event.target as HTMLElement).closest<HTMLElement>('[data-fx-id]')?.dataset.fxId };
    if (mode === 'erase' || mode === 'select') setRange({ start: row, end: row, erase: mode === 'erase' });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const pan = panGesture.current;
    if (pan?.pointerId === event.pointerId) {
      const scroll = props.scrollRef.current;
      if (scroll) scroll.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
      return;
    }
    const current = gesture.current;
    const scroll = props.scrollRef.current;
    if (current && scroll) {
      const bounds = scroll.getBoundingClientRect();
      if (event.clientX < bounds.left + 20) scroll.scrollLeft -= props.gridWidth;
      if (event.clientX > bounds.right - 20) scroll.scrollLeft += props.gridWidth;
    }
    const row = rowAt(event.clientX);
    hoverRow.current = row;
    showHover(row);
    if (paste.current) { setPreview({ cells: paste.current, delta: clampTrackerFxDelta(paste.current, row, props.rowCount), move: false }); return; }
    if (!current) return;
    if (Math.abs(event.clientX - current.startX) >= 4) current.moved = true;
    if (current.mode === 'move' && current.moved) setPreview({ cells: current.cells,
      delta: clampTrackerFxDelta(current.cells, row - current.startRow, props.rowCount), move: true });
    if (current.mode === 'select' || current.mode === 'erase') {
      const start = Math.min(row, current.startRow), end = Math.max(row, current.startRow);
      setRange({ start, end, erase: current.mode === 'erase' });
      if (current.mode === 'select') setSelection([...new Set([...current.selection,
        ...entries.filter(item => item.timelineRow >= start && item.timelineRow <= end).map(item => item.timelineRow)])]);
    }
  };
  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panGesture.current?.pointerId === event.pointerId) {
      panGesture.current = null; setPanning(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    const row = rowAt(event.clientX);
    if (current.mode === 'move' && current.moved) {
      const delta = clampTrackerFxDelta(current.cells, row - current.startRow, props.rowCount);
      if (delta) props.onEffectsChange(trackerFxPlacementUpdates(props.segments, props.channel, current.cells, delta, true));
      setSelection(current.cells.map(cell => cell.timelineRow + delta));
    } else if (current.mode === 'erase') {
      const start = Math.min(row, current.startRow), end = Math.max(row, current.startRow);
      eraseCells(entries.filter(item => item.timelineRow >= start && item.timelineRow <= end));
      setSelection(items => items.filter(item => item < start || item > end));
    } else if (props.tool === 'pencil' && !current.moved) openAt(row, props.channel, current.focusedEffect);
    setRange(null); setPreview(null);
  };
  const previewSources = new Set(preview?.move ? preview.cells.map(cell => cell.timelineRow) : []);
  const previewDestinations = new Set(preview?.cells.map(cell => cell.timelineRow + preview.delta) ?? []);
  const visible = (row: number) => row >= visibleRows.start && row < visibleRows.end;
  const renderCell = (entry: TrackerFxCell, key: string, ghost = false) => {
    const source = !ghost && 'segment' in entry ? entry as typeof entries[number] : undefined;
    const segment = source?.segment ?? props.segments.find(item => entry.timelineRow >= item.start && entry.timelineRow < item.end);
    const patternRow = source?.row ?? entry.timelineRow - (segment?.start ?? 0);
    const erased = range?.erase && entry.timelineRow >= range.start && entry.timelineRow <= range.end;
    const overwritten = !ghost && previewDestinations.has(entry.timelineRow) && !previewSources.has(entry.timelineRow);
    return <div key={key} className={`gba-music-fx-cell ${ghost ? 'fx-ghost' : ''} ${selection.includes(entry.timelineRow) ? 'fx-selected' : ''} ${erased || overwritten ? 'fx-erased' : ''}`}
      data-fx-row={patternRow}
      data-fx-timeline-row={entry.timelineRow} data-fx-channel={props.channel}
      style={{ left: entry.timelineRow * props.gridWidth + 1, top: 1, width: props.gridWidth - 2, height: laneHeight - 2 }}>
      {(visualsByEffect.get(entry.effect * 256 + entry.parameter) ?? trackerFxVisuals(props.format, entry.effect, entry.parameter)).map(visual => <span key={visual.id} className="gba-music-fx-badge-wrap">
        <button type="button" disabled={props.playing} aria-label={t('music.fx.cell', { effect: t(`music.effects.${visual.name}`),
          row: patternRow + 1, channel: props.channel + 1, value: visual.parameter.toString(16).toUpperCase().padStart(2, '0') })}
          className="gba-music-fx-badge" data-fx-id={visual.id} style={{ background: `linear-gradient(145deg, color-mix(in srgb, ${visual.color} 96%, white 2%), color-mix(in srgb, ${visual.color} 82%, transparent))` }}
          onClick={event => { if (event.detail === 0 && props.tool !== 'eraser') { active.current = true; props.onActivate(); setSelection([entry.timelineRow]); openAt(entry.timelineRow, props.channel, visual.id); } }}
          onDoubleClick={() => { if (props.tool !== 'eraser') openAt(entry.timelineRow, props.channel, visual.id); }}>{visual.code}</button>
      </span>)}
    </div>;
  };
  return <div className="gba-music-fx-lane" style={{ height: rulerHeight + laneHeight }} aria-label={t('music.roll.fxLane')}>
    <div className="gba-music-fx-heading" style={{ width: 48 + props.gridWidth, flexBasis: 48 + props.gridWidth }}>
      <Tooltip title={t('music.fx.gridHint')}><b className="gba-music-fx-title">Fx</b></Tooltip>
      <Tooltip title={t('music.channels.defaultName', { number: props.channel + 1 })}>
        <span className="gba-music-fx-channel-number">{props.channel + 1}</span>
      </Tooltip>
    </div>
    <div className="gba-music-fx-viewport">
      <div ref={ref} className="gba-music-fx-content" style={{ width: props.rowCount * props.gridWidth }}>
        <div className="gba-music-fx-ruler">
          {Array.from({ length: Math.max(0, Math.ceil(visibleRows.end / 4) - Math.floor(visibleRows.start / 4)) }, (_, index) => {
            const row = (Math.floor(visibleRows.start / 4) + index) * 4;
            return <span key={row} style={{ left: row * props.gridWidth }}>{row}</span>;
          })}
        </div>
        <div ref={gridRef} className={`gba-music-fx-grid tool-${props.tool} ${preview ? 'fx-dragging' : ''} ${panning ? 'fx-panning' : ''} ${range?.erase ? 'fx-erasing' : ''}`} role="grid" aria-label={t('music.roll.fxLane')}
          style={{ height: laneHeight, '--fx-grid-width': `${props.gridWidth}px` } as React.CSSProperties}
          onPointerEnter={event => showHover(rowAt(event.clientX))} onPointerLeave={() => showHover(null)}
          onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={cancelGesture}>
          <div ref={hoverMarker} className="gba-roll-hover-column" aria-hidden="true" style={{ display: 'none', width: props.gridWidth, height: laneHeight, top: 0, pointerEvents: 'none' }} />
          <div className="gba-music-fx-selected-channel" style={{ top: 0 }} />
          {props.segments.slice(1).filter(segment => visible(segment.start)).map(segment => <div key={segment.orderIndex} className="gba-music-fx-pattern-line" style={{ left: segment.start * props.gridWidth }} />)}
          {visibleEntries.filter(entry => !previewSources.has(entry.timelineRow)).map(entry => renderCell(entry, `${entry.segment.orderIndex}:${entry.row}`))}
          {preview?.cells.map(cell => ({ ...cell, timelineRow: cell.timelineRow + preview.delta })).filter(cell => visible(cell.timelineRow)).map(cell => renderCell(cell, `preview:${cell.timelineRow}`, true))}
          {range && <div className={`gba-music-fx-selection ${range.erase ? 'fx-erased' : ''}`} style={{ left: range.start * props.gridWidth,
            width: (range.end - range.start + 1) * props.gridWidth }} />}
          {editing && <div className="gba-music-fx-cursor" style={{ left: editing.timelineRow * props.gridWidth, top: 0,
            width: props.gridWidth, height: laneHeight }} />}
        </div>
        <Popover open={Boolean(editing)} onOpenChange={open => { if (!open) setEditing(null); }} trigger="click" placement="top"
          title={editing ? t('music.fx.position', { row: editing.row + 1, channel: editing.channel + 1 }) : undefined}
          content={editing && <Flex vertical gap={10} className="gba-music-fx-config">
            <TrackerNoteEffectEditor key={`${editing.orderIndex}:${editing.row}:${editing.channel}:${editing.focusedEffect ?? 'new'}`}
              focusedEffect={editing.focusedEffect} format={props.format} effect={activeEvent?.effect ?? 0} parameter={activeEvent?.parameter ?? 0}
              onChange={value => props.onEffectChange(editing.row, editing.channel, editing.patternIndex, value.effect, value.parameter)} />
          </Flex>}>
          <span className="gba-music-fx-anchor" style={{ left: (editing?.timelineRow ?? 0) * props.gridWidth,
            top: rulerHeight, width: props.gridWidth }} />
        </Popover>
      </div>
    </div>
  </div>;
}));
