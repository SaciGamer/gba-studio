import type { TrackerChannelSettings } from '@/utils/trackerChannelSettings';
import { trackerInstrumentHierarchyColor } from '@/utils/trackerInstrumentOptions';
import { readMusicEditorSettings, type MusicEditorSettings } from '@/utils/musicEditorSettings';
import { trackerEffectLabel } from '@/utils/trackerEffectLabels';
import { AudioOutlined, CaretDownFilled, DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined, SaveOutlined, SelectOutlined, SoundOutlined, StopOutlined } from '@ant-design/icons';
import { Button, Flex, InputNumber, message, Modal, Segmented, Select, Slider, Switch, Tag, theme, Tooltip, Typography } from 'antd';
import MusicDial from './MusicDial';
import './MusicDial.css';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18n';
import { inferXmNoteLength, TrackerModuleInfo, TrackerPatternEvent, TrackerSample } from '@/utils/trackerModule';
import './TrackerGrid.css';
import TrackerFxLane from './TrackerFxLane';
import TrackerRollNoteLayer from './TrackerRollNoteLayer';
import TrackerKeyboardScore from './TrackerKeyboardScore';
import './TrackerKeyboard.css';
import { trackerScoreTiming } from '@/utils/trackerScore';
import TrackerKeyboardInput from './TrackerKeyboardInput';
import type { KeyboardGestureResult } from '@/utils/trackerKeyboardGesture';
import { copyMusicNotes, readMusicNotes, useMusicNoteClipboard, type MusicNoteClipboard } from '@/utils/musicNoteClipboard';
import type { TrackerFxUpdate } from '@/utils/trackerFxEditing';
import { trackerFxPresencePrefix } from '@/utils/trackerFxVisuals';
import './TrackerFxLane.css';
import { MusicEditorFormatCapabilities } from './musicEditorCapabilities';
import { createTrackerSamplePreviewWav, createTrackerSourceWav, prepareTrackerSamplePcm, TRACKER_SAMPLE_RATE } from '@/utils/trackerSamplePreparation';
import { estimateTrackerSampleConversion, estimateTrackerSampleModuleSize } from '@/utils/trackerSampleEstimate';
import { TrackerPcmEditOperation, TrackerPcmEditRange, TrackerPcmFrameEdit } from '@/utils/trackerPcmEditing';
import { decodeTrackerNotePan, quantizeTrackerNotePan } from '@/utils/trackerNotePan';
import type { MusicExportTarget } from '@/utils/trackerComposition';

const BOTTOM_PITCH = 13;
const TOP_PITCH = 96;
const PITCHES = TOP_PITCH - BOTTOM_PITCH + 1;
const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const scaleNames = ['Chromatic', 'Major', 'Minor'];
const noteLabel = (note: number) => `${noteNames[(note - 1 + 1200) % 12]}${Math.floor((note - 1) / 12) + 1}`;
const sampleZoneLabels = (sample: TrackerSample) => (sample.variants?.length ? sample.variants : [sample]).map((variant, variantIndex) => {
  const notes = Array.from({ length: 96 }, (_, index) => index + 1).filter(note => (sample.noteMap?.[note - 1] ?? 0) === variantIndex);
  const ranges: Array<[number, number]> = [];
  for (const note of notes) {
    const last = ranges.at(-1);
    if (last && note === last[1] + 1) last[1] = note;
    else ranges.push([note, note]);
  }
  const rangeLabel = ranges.length
    ? ranges.map(([low, high]) => low === high ? noteLabel(low) : `${noteLabel(low)}–${noteLabel(high)}`).join(', ')
    : 'unmapped';
  return `${variant.name || `Sample ${variantIndex + 1}`}: ${rangeLabel}`;
});
const hasEditableSampleZone = (sample?: TrackerSample) => !!sample && (sample.variants?.length ? sample.variants : [sample]).some(variant => !variant.sixteenBit && !variant.stereo);

type GhostTimelineSegment = { patternIndex: number; orderIndex: number; start: number; end: number; rows: TrackerPatternEvent[][] };
type EraseTarget = { row: number; note: number; start: number; end: number; patternIndex: number; orderIndex: number };

function GhostNoteLayer({ channelSettings, scrollRef, segments, songRowCount, channels, selectedChannel, gridWidth, cellHeight, instrumentColor }: {
  channelSettings?: TrackerChannelSettings;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  segments: GhostTimelineSegment[];
  songRowCount: number;
  channels: number;
  selectedChannel: number;
  gridWidth: number;
  cellHeight: number;
  instrumentColor: (id: number, channel: number) => string;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const element = scrollRef.current;
    const content = contentRef.current;
    if (!element || !content) return;
    let frame: number | null = null;
    let lastViewportKey = '';
    const elements = new Map<string, HTMLDivElement>();
    const pool: HTMLDivElement[] = [];
    const update = () => {
      if (content.parentElement?.style.visibility === 'hidden') return;
      // The pending frame reads the latest scroll offsets, so keep it and let
      // rapid scroll/resize events coalesce instead of canceling and rescheduling.
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const firstVisibleRow = Math.max(0, Math.floor(element.scrollLeft / gridWidth));
        const lastVisibleRow = Math.min(songRowCount, Math.ceil((element.scrollLeft + element.clientWidth) / gridWidth) + 1);
        const firstVisiblePitch = Math.max(BOTTOM_PITCH, TOP_PITCH - Math.ceil((element.scrollTop + element.clientHeight) / cellHeight));
        const lastVisiblePitch = Math.min(TOP_PITCH, TOP_PITCH - Math.floor(element.scrollTop / cellHeight));
        const viewportKey = `${firstVisibleRow}:${lastVisibleRow}:${firstVisiblePitch}:${lastVisiblePitch}`;
        if (viewportKey === lastViewportKey) return;
        lastViewportKey = viewportKey;
        const noteLengthAt = (segment: GhostTimelineSegment, channel: number, rowIndex: number) =>
          inferXmNoteLength(segment.rows, rowIndex, channel, segment.rows.length - rowIndex);
        const visible = new Set<string>();
        const add = (segment: GhostTimelineSegment, timelineRow: number, channel: number, note: number, instrument: number, length: number) => {
          const key = `${segment.orderIndex}-${channel}-${timelineRow}`;
          visible.add(key);
          let noteElement = elements.get(key);
          if (!noteElement) {
            noteElement = pool.pop() ?? document.createElement('div');
            if (!noteElement.parentElement) {
              noteElement.className = 'gba-beat-note ghost';
              noteElement.setAttribute('aria-hidden', 'true');
              content.appendChild(noteElement);
            }
            elements.set(key, noteElement);
            noteElement.classList.remove('pooled');
          }
          noteElement.style.visibility = 'visible';
          noteElement.style.left = `${timelineRow * gridWidth + 2}px`;
          noteElement.style.top = `${(TOP_PITCH - note) * cellHeight + 2}px`;
          noteElement.style.width = `${Math.max(16, length * gridWidth - 4)}px`;
          noteElement.style.height = `${cellHeight - 4}px`;
          noteElement.style.background = instrumentColor(instrument || 1, channel);
        };
        // Segments are ordered by timeline position. Skip all orders before
        // the viewport with a binary search so a long song does not make each
        // scroll frame walk every pattern in its arrangement.
        let firstVisibleSegment = 0;
        let segmentSearchEnd = segments.length;
        while (firstVisibleSegment < segmentSearchEnd) {
          const middle = Math.floor((firstVisibleSegment + segmentSearchEnd) / 2);
          if (segments[middle].end <= firstVisibleRow) firstVisibleSegment = middle + 1;
          else segmentSearchEnd = middle;
        }
        for (let segmentIndex = firstVisibleSegment; segmentIndex < segments.length; segmentIndex += 1) {
          const segment = segments[segmentIndex];
          if (segment.start >= lastVisibleRow) break;
          const start = Math.max(segment.start, firstVisibleRow);
          const end = Math.min(segment.end, lastVisibleRow);
          for (let timelineRow = start; timelineRow < end; timelineRow += 1) {
            const rowIndex = timelineRow - segment.start;
            const row = segment.rows[rowIndex];
            for (let channel = 0; channel < channels; channel += 1) {
              if (channel === selectedChannel || channelSettings?.[String(channel)]?.hidden) continue;
              const event = row?.[channel];
              if (!event || event.note < firstVisiblePitch || event.note > lastVisiblePitch) continue;
              add(segment, timelineRow, channel, event.note, event.instrument, Math.min(segment.end - timelineRow, noteLengthAt(segment, channel, rowIndex)));
            }
          }
          if (segment.start >= firstVisibleRow || segment.end <= firstVisibleRow) continue;
          for (let channel = 0; channel < channels; channel += 1) {
            if (channel === selectedChannel || channelSettings?.[String(channel)]?.hidden) continue;
            const earliestSustainingRow = segment.start;
            for (let timelineRow = firstVisibleRow - 1; timelineRow >= earliestSustainingRow; timelineRow -= 1) {
              const rowIndex = timelineRow - segment.start;
              const event = segment.rows[rowIndex]?.[channel];
              if (!event || event.note < 1 || event.note > 96) continue;
              const length = Math.min(segment.end - timelineRow, noteLengthAt(segment, channel, rowIndex));
              if (timelineRow + length > firstVisibleRow && event.note >= firstVisiblePitch && event.note <= lastVisiblePitch) add(segment, timelineRow, channel, event.note, event.instrument, length);
              break;
            }
          }
        }
        for (const [key, noteElement] of elements) {
          if (visible.has(key)) continue;
          noteElement.style.visibility = 'hidden';
          noteElement.classList.add('pooled');
          elements.delete(key);
          pool.push(noteElement);
        }
      });
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const refresh = () => {
      lastViewportKey = '';
      update();
    };
    window.addEventListener('gba-studio:ghost-layer-enable', refresh);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      window.removeEventListener('gba-studio:ghost-layer-enable', refresh);
      observer?.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      for (const noteElement of elements.values()) noteElement.remove();
      for (const noteElement of pool) noteElement.remove();
      elements.clear();
      pool.length = 0;
    };
  }, [channelSettings, scrollRef, segments, songRowCount, channels, selectedChannel, gridWidth, cellHeight, instrumentColor]);
  return <div ref={contentRef} />;
}

type Props = {
  info: TrackerModuleInfo;
  format?: TrackerModuleInfo['format'];
  capabilities?: MusicEditorFormatCapabilities;
  filename?: string;
  rows: TrackerPatternEvent[][];
  patternRowsByIndex: TrackerPatternEvent[][][];
  patternNames?: string[];
  orderIds?: string[];
  pattern: number;
  patternRowCount: number;
  patternCount: number;
  order: number[];
  selectedOrder: number;
  selectedChannel: number;
  moduleBytes: ArrayBuffer;
  samples: Map<number, TrackerSample>;
  instrumentColors?: Record<string, Record<string, string>>;
  instrumentCategories?: Record<string, 'Duty' | 'Wave' | 'Noise'>;
  instrumentPresetColors?: Record<string, string>;
  channelInstrumentTypes?: Record<string, 'Duty' | 'Wave' | 'Noise'>;
  channelSettings?: TrackerChannelSettings;
  onPatternChange: (pattern: number) => void;
  onOrderChange: (order: number) => void;
  onReorderOrder: (from: number, to: number) => void;
  onAddPattern: () => void;
  onDuplicatePattern: () => void;
  onEffectChange: (row: number, channel: number, patternIndex: number, effect: number, parameter: number) => void;
  onEffectsChange: (updates: TrackerFxUpdate[]) => void;
  onChannelChange: (channel: number) => void;
  onNote: (start: number, end: number, note: number, channel: number, instrument: number, patternIndex?: number, audition?: boolean) => void;
  onPreviewNote: (note: number, instrument: number, durationRows?: number) => void;
  onPreviewSample: (sample: TrackerSample, note: number, durationRows?: number) => void;
  onPreviewExistingNote: (row: number, channel: number, patternIndex: number) => void;
  onCreateNotes: (notes: Array<{ start: number; end: number; note: number; channel: number; instrument: number; patternIndex?: number }>) => void;
  onKeyboardGesture?: (result: KeyboardGestureResult) => boolean;
  onStopKeyboardPreview?: () => void;
  onEditNote: (oldRow: number, oldNote: number, start: number, end: number, note: number, channel: number, instrument: number, patternIndex?: number) => void;
  onEditNoteProperties: (notes: Array<{ row: number; note: number; instrument: number; channel: number; patternIndex: number }>, patch: { transpose?: number; instrument?: number; volume?: number; pan?: number; effect?: number; parameter?: number }) => boolean;
  onEditNotes: (edits: Array<{ oldRow: number; oldNote: number; start: number; end: number; note: number; channel: number; instrument: number }>) => void;
  onDelete: (row: number, channel: number) => void;
  onDeleteNotes: (notes: Array<{ row: number; channel: number; patternIndex?: number }>, noteEffects?: boolean) => void;
  onEraseNoteRanges: (ranges: Array<{ row: number; start: number; end: number; channel: number; patternIndex?: number }>) => void;
  muted: boolean[];
  volumes: number[];
  pans: number[];
  onToggleChannel: (channel: number) => void;
  onVolumeChange: (channel: number, value: number) => void;
  onPanChange: (channel: number, value: number) => void;
  onInstrumentChange: (row: number, channel: number, instrument: number) => void;
  onNoteVolumeChange: (row: number, channel: number, volume: number) => void;
  onNotePanChange: (row: number, channel: number, pan: number) => void;
  onSampleChange: (instrument: number, patch: { volume?: number; loopStart?: number; loopEnd?: number; rootNote?: number; fineTune?: number; panning?: number }, variantIndex?: number) => void;
  instrumentCount?: number;
  onEditSamplePcm?: (instrument: number, operation: TrackerPcmEditOperation, range?: TrackerPcmEditRange, frameEdits?: readonly TrackerPcmFrameEdit[], variantIndex?: number) => void;
  onImportSample?: (file: File, instrument: number, noteZone?: { low: number; high: number }, options?: { trimStart: number; trimEnd: number; gain: number; removeDc: boolean; fadeInMs: number; fadeOutMs: number }) => void;
  onEstimateSampleModuleSize?: (instrument: number, frames: number) => ReturnType<typeof estimateTrackerSampleModuleSize>;
  canAddSampleVariant?: boolean;
  onAddInstrument?: () => void;
  onActiveInstrumentChange?: (instrument: number) => void;
  onSelectionChange?: (selection: { row: number; note: number; length: number; instrument: number; volume: number; pan: number; effect?: number; parameter?: number; count: number; minNote?: number; maxNote?: number; panEditable?: boolean } | null) => void;
  onViewChange?: (view: 'roll' | 'keyboard' | 'tracker') => void;
  initialEditorSettings?: MusicEditorSettings;
  onEditorSettingsChange?: (settings: MusicEditorSettings) => void;
  externalWorkspacePanels?: boolean;
  diagnosticWarnings?: string[];
  onTargetChange?: (target: MusicExportTarget) => void;
  targetSwitching?: boolean;
  onSave: () => void;
  onPlay: (mode: 'pattern' | 'song', startRow: number, onRow: (row: number) => void) => void;
  onPreviewLoopChange: (enabled: boolean) => void;
  onPlayRom: () => Promise<{ status?: string; message?: string }>;
  playing: boolean;
};

/** Tracker piano roll shared by the supported module formats. */
export default function GBABeatEditor(props: Props) {
  const { info, rows, pattern, patternCount, order, selectedOrder, selectedChannel, onNote } = props;
  const patternRowCount = Math.max(1, Math.min(256, props.patternRowCount));
  const { token } = theme.useToken();
  const { t } = useI18n();
  const format = props.format ?? info.format;
  const trackerSlotCount = props.instrumentCount ?? (format === 'IT' && info.instruments === 0 ? (info.sampleCount ?? 0) : info.instruments);
  const capabilities: MusicEditorFormatCapabilities = props.capabilities ?? {
    patternName: true, patternLength: true, patternOrder: true, noteVolume: true,
    sampleVolumeLoop: true, sampleTuning: true, sampleFineTune: true,
    createInstrument: true, importWavSample: true, tempo: true, romPreview: true,
  };
  const [instrument, setInstrument] = useState(1);
  const [variantLow, setVariantLow] = useState(49);
  const [variantHigh, setVariantHigh] = useState(96);
  const [sampleModalOpen, setSampleModalOpen] = useState(false);
  const [pendingSampleFile, setPendingSampleFile] = useState<File | null>(null);
  const [pendingSampleDuration, setPendingSampleDuration] = useState(0);
  const [pendingSamplePeaks, setPendingSamplePeaks] = useState<number[]>([]);
  const [pendingSampleChannels, setPendingSampleChannels] = useState<Float32Array[]>([]);
  const [pendingSampleRate, setPendingSampleRate] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const sampleEstimate = estimateTrackerSampleConversion(format, (trimEnd - trimStart) * TRACKER_SAMPLE_RATE);
  const sampleModuleSizeEstimate = props.onEstimateSampleModuleSize?.(instrument, sampleEstimate.frames);
  const sampleExceedsFormatLimit = sampleEstimate.frames > sampleEstimate.maxFrames;
  const [sampleGain, setSampleGain] = useState(1);
  const [removeSampleDc, setRemoveSampleDc] = useState(false);
  const [sampleFadeInMs, setSampleFadeInMs] = useState(0);
  const [sampleFadeOutMs, setSampleFadeOutMs] = useState(0);
  const sampleFadeLimitMs = Math.min(5000, Math.max(0, (trimEnd - trimStart) * 1000));
  const [microphoneRecording, setMicrophoneRecording] = useState(false);
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneDeviceId, setSelectedMicrophoneDeviceId] = useState('');
  const [noteLength, setNoteLength] = useState(4);
  const [activePanel, setActivePanel] = useState<'music' | 'channels' | 'instruments'>('channels');
  const [initialSettings] = useState(() => readMusicEditorSettings(props.initialEditorSettings));
  const [view, setView] = useState(initialSettings.view);
  const previewView = useRef(view);
  previewView.current = view;
  const [trackerTool, setTrackerTool] = useState(initialSettings.tool);
  const [ghostState, setGhostState] = useState(initialSettings.ghostLayer);
  const ghostEnabled = useRef(initialSettings.ghostLayer);
  const ghostToggleButton = useRef<HTMLButtonElement | null>(null);
  const ghostLayerElement = useRef<HTMLDivElement | null>(null);
  const [playMode, setPlayMode] = useState(initialSettings.playMode);
  const [scaleRoot, setScaleRoot] = useState(initialSettings.scaleRoot);
  const [scaleMode, setScaleMode] = useState(initialSettings.scaleMode);
  const [snapToScale, setSnapToScale] = useState(initialSettings.snapToScale);
  const [previewLoop, setPreviewLoop] = useState(initialSettings.loop);
  const [romPreviewing, setRomPreviewing] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [playbackStart, setPlaybackStart] = useState(0);
  const [draggedOrderIndex, setDraggedOrderIndex] = useState<number | null>(null);
  const [orderDropIndex, setOrderDropIndex] = useState<number | null>(null);
  const suppressOrderClick = useRef(false);
  const [orderPanning, setOrderPanning] = useState(false);
  const orderPanDrag = useRef<{ pointerId: number; startX: number; scrollLeft: number } | null>(null);
  const wasPlaying = useRef(false);
  const [dragPreview, setDragPreview] = useState<{ row: number; note: number; length: number; old?: { row: number; note: number }; resize: boolean } | null>(null);
  const [inspectorLengthPreview, setInspectorLengthPreview] = useState<{ row: number; note: number; length: number; old: { row: number; note: number }; resize: true } | null>(null);
  const [selectedNote, setSelectedNote] = useState<{ row: number; note: number } | null>(null);
  const [selectedNotes, setSelectedNotes] = useState<Array<{ row: number; note: number }>>([]);
  const [trackerGroupPreview, setTrackerGroupPreview] = useState<Array<{ row: number; note: number }>>([]);
  const [rollGroupPreview, setRollGroupPreview] = useState<Array<{ row: number; note: number; length: number; instrument: number }>>([]);
  const [selectionBox, setSelectionBox] = useState<{ firstRow: number; lastRow: number; firstNote: number; lastNote: number } | null>(null);
  const [eraseTargets, setEraseTargets] = useState<EraseTarget[]>([]);
  const [rollHover, setRollHover] = useState<{ row: number; note: number } | null>(null);
  const [rollHoveredKeyPitch, setRollHoveredKeyPitch] = useState<number | null>(null);
  const fxRollCrosshair = useRef<HTMLDivElement>(null);
  const noteClipboard = useMusicNoteClipboard();
  const clipboardPaste = useRef<((value: MusicNoteClipboard | null) => void) | null>(null);
  const pasteRequest = useRef(0);
  const clipboardEditorMounted = useRef(false);
  useEffect(() => {
    clipboardEditorMounted.current = true;
    return () => { clipboardEditorMounted.current = false; pasteRequest.current++; };
  }, [props.filename]);
  const pendingPaste = useRef<{ clipboard: MusicNoteClipboard; row: number; note: number; patternIndex: number; patternStart: number; patternEnd: number; orderIndex: number } | null>(null);
  const [gridWidth, setGridWidth] = useState(initialSettings.zoom);
  useLayoutEffect(() => {
    props.onEditorSettingsChange?.({ version: 1, view, tool: trackerTool, playMode, scaleRoot, scaleMode,
      snapToScale, loop: previewLoop, ghostLayer: ghostState, zoom: gridWidth });
  }, [view, trackerTool, playMode, scaleRoot, scaleMode, snapToScale, previewLoop, ghostState, gridWidth, props.onEditorSettingsChange]);
  const [gridPanning, setGridPanning] = useState(false);
  const selectionAnchor = useRef<{ row: number; note: number } | null>(null);
  const previewKeyDrag = useRef<{ active: boolean; moved: boolean; pitch: number } | null>(null);
  const pianoRollScroll = useRef<HTMLDivElement | null>(null);
  const orderTrackRef = useRef<HTMLDivElement | null>(null);
  const [addPatternTooltipOpen, setAddPatternTooltipOpen] = useState(false);
  const pianoKeyboardScroll = useRef<HTMLDivElement | null>(null);
  const pianoRollRulerContent = useRef<HTMLDivElement | null>(null);
  const pianoRollPatternContent = useRef<HTMLDivElement | null>(null);
  const pianoRollFxContent = useRef<HTMLDivElement | null>(null);
  const fxCommandRef = useRef<((command: string) => boolean) | null>(null);
  const pianoRollPlayhead = useRef<HTMLDivElement | null>(null);
  const pianoRollZoomAnchor = useRef<{ row: number; pitch: number; x: number; y: number } | null>(null);
  useEffect(() => {
    const scroll = pianoRollScroll.current;
    if (view !== 'roll' || !scroll) return;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.deltaY) return;
      const nextWidth = Math.max(12, Math.min(72, gridWidth + (event.deltaY < 0 ? 2 : -2)));
      if (nextWidth === gridWidth) return;
      const bounds = scroll.getBoundingClientRect();
      const x = event.clientX - bounds.left - scroll.clientLeft;
      const y = event.clientY - bounds.top - scroll.clientTop;
      pianoRollZoomAnchor.current = {
        row: (scroll.scrollLeft + x) / gridWidth,
        pitch: (scroll.scrollTop + y) / gridWidth,
        x,
        y,
      };
      setGridWidth(nextWidth);
    };
    scroll.addEventListener('wheel', handleWheel, { passive: false });
    return () => scroll.removeEventListener('wheel', handleWheel);
  }, [view, gridWidth]);
  const syncPianoRollScrollLeft = (left: number) => {
    const offset = `translateX(-${left}px)`;
    if (pianoRollRulerContent.current) pianoRollRulerContent.current.style.transform = offset;
    if (pianoRollPatternContent.current) pianoRollPatternContent.current.style.transform = offset;
    if (pianoRollFxContent.current) pianoRollFxContent.current.style.transform = offset;
    if (pianoRollPlayhead.current) pianoRollPlayhead.current.style.left = `${playhead * gridWidth - left}px`;
  };
  useLayoutEffect(() => {
    const anchor = pianoRollZoomAnchor.current;
    const scroll = pianoRollScroll.current;
    if (anchor && scroll && view === 'roll') {
      scroll.scrollLeft = anchor.row * gridWidth - anchor.x;
      scroll.scrollTop = anchor.pitch * gridWidth - anchor.y;
      if (pianoKeyboardScroll.current) pianoKeyboardScroll.current.scrollTop = scroll.scrollTop;
      pianoRollZoomAnchor.current = null;
    }
    syncPianoRollScrollLeft(pianoRollScroll.current?.scrollLeft ?? 0);
  }, [playhead, gridWidth, view]);
  const toggleGhostLayer = () => {
    ghostEnabled.current = !ghostEnabled.current;
    setGhostState(ghostEnabled.current);
    const enabled = ghostEnabled.current;
    const button = ghostToggleButton.current;
    button?.setAttribute('aria-pressed', String(enabled));
    button?.classList.toggle('ant-btn-primary', enabled);
    button?.classList.toggle('ant-btn-default', !enabled);
    const layer = ghostLayerElement.current;
    layer?.setAttribute('aria-hidden', String(!enabled || view !== 'roll'));
    if (layer) {
      const visible = enabled && view === 'roll';
      layer.style.visibility = visible ? 'visible' : 'hidden';
      // Ghost notes set their own visibility, so hiding the parent with only
      // visibility:hidden can leave those explicitly-visible children drawn.
      layer.style.display = visible ? 'block' : 'none';
    }
    if (enabled) window.dispatchEvent(new Event('gba-studio:ghost-layer-enable'));
  };
  useEffect(() => {
    const toggleGhostShortcut = (event: KeyboardEvent) => {
      if (event.code !== 'Backquote' || event.defaultPrevented || event.isComposing
        || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || view !== 'roll' || info.channels < 2) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="dialog"],.ant-select-dropdown')) return;
      event.preventDefault();
      toggleGhostLayer();
    };
    window.addEventListener('keydown', toggleGhostShortcut);
    return () => window.removeEventListener('keydown', toggleGhostShortcut);
  }, [view, info.channels]);
  useEffect(() => {
    const layer = ghostLayerElement.current;
    if (!layer) return;
    const visible = ghostEnabled.current && view === 'roll';
    layer.setAttribute('aria-hidden', String(!visible));
    layer.style.visibility = visible ? 'visible' : 'hidden';
    layer.style.display = visible ? 'block' : 'none';
    if (ghostEnabled.current && view === 'roll') window.dispatchEvent(new Event('gba-studio:ghost-layer-enable'));
  }, [view]);
  const lastObservedOrder = useRef<number | null>(null);
  const centerAnimationFrame = useRef<number | null>(null);
  const skipNextOrderRecentering = useRef(false);
  const orderPan = useRef<{ pointerId: number; startX: number; scrollLeft: number } | null>(null);
  const musicCommandRef = useRef<(command: string) => void>(() => undefined);
  const sampleImportInput = useRef<HTMLInputElement | null>(null);
  const [sampleImportAsVariant, setSampleImportAsVariant] = useState(false);
  const [sampleEditorOpen, setSampleEditorOpen] = useState(false);
  const [sampleEditorVariantIndex, setSampleEditorVariantIndex] = useState(0);
  const [sampleEditorZoom, setSampleEditorZoom] = useState(1);
  const [sampleEditorSelection, setSampleEditorSelection] = useState<TrackerPcmEditRange | null>(null);
  const [sampleEditorTool, setSampleEditorTool] = useState<'select' | 'draw'>('select');
  const sampleEditorPointer = useRef<{ mode: 'select' | 'draw'; start: number; edits: Map<number, number> } | null>(null);
  const activeEditorInstrumentSample = props.samples.get(instrument);
  const activeEditorVariants = activeEditorInstrumentSample?.variants?.length ? activeEditorInstrumentSample.variants : activeEditorInstrumentSample ? [activeEditorInstrumentSample] : [];
  const activeEditorVariant = activeEditorVariants[sampleEditorVariantIndex] ?? activeEditorVariants[0];
  const activeEditorSample = activeEditorVariant ?? activeEditorInstrumentSample;
  const activeEditorZoneEditable = !!activeEditorSample && !activeEditorSample.sixteenBit && !activeEditorSample.stereo;
  const activeEditorLength = activeEditorSample?.samples.length ?? 0;
  const activeEditorSelection = sampleEditorSelection ?? { start: 0, end: activeEditorLength };
  const editorVisibleLength = activeEditorLength ? Math.max(1, Math.ceil(activeEditorLength / sampleEditorZoom)) : 1;
  const editorCenter = sampleEditorSelection ? (sampleEditorSelection.start + sampleEditorSelection.end) / 2 : activeEditorLength / 2;
  const editorViewStart = Math.max(0, Math.min(activeEditorLength - editorVisibleLength, Math.round(editorCenter - editorVisibleLength / 2)));
  const editorViewEnd = Math.min(activeEditorLength, editorViewStart + editorVisibleLength);
  let selectedSamplePeak = 0;
  let selectedSampleSquares = 0;
  let selectedSampleFrames = 0;
  if (activeEditorSample) {
    const from = Math.max(0, Math.min(activeEditorLength, activeEditorSelection.start));
    const to = Math.max(from, Math.min(activeEditorLength, activeEditorSelection.end));
    for (let frame = from; frame < to; frame += 1) {
      const value = activeEditorSample.samples[frame] ?? 0;
      selectedSamplePeak = Math.max(selectedSamplePeak, Math.abs(value));
      selectedSampleSquares += value * value;
      selectedSampleFrames += 1;
    }
  }
  const selectedSampleRms = Math.sqrt(selectedSampleSquares / Math.max(1, selectedSampleFrames));
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const microphoneStream = useRef<MediaStream | null>(null);
  const recordedChunks = useRef<BlobPart[]>([]);
  const pendingSampleUrl = useMemo(() => {
    if (!pendingSampleFile || !pendingSampleChannels.length || !pendingSampleRate || trimEnd <= trimStart) return null;
    try {
      const pcm = prepareTrackerSamplePcm(pendingSampleChannels, pendingSampleRate, {
        trimStart, trimEnd, gain: sampleGain, removeDc: removeSampleDc, fadeInMs: Math.min(sampleFadeInMs, sampleFadeLimitMs), fadeOutMs: Math.min(sampleFadeOutMs, sampleFadeLimitMs),
      }, TRACKER_SAMPLE_RATE);
      return URL.createObjectURL(createTrackerSamplePreviewWav(pcm));
    } catch { return null; }
  }, [pendingSampleFile, pendingSampleChannels, pendingSampleRate, trimStart, trimEnd, sampleGain, removeSampleDc, sampleFadeInMs, sampleFadeOutMs]);
  useEffect(() => () => { if (pendingSampleUrl) URL.revokeObjectURL(pendingSampleUrl); }, [pendingSampleUrl]);
  useEffect(() => {
    setRemoveSampleDc(false);
    setSampleFadeInMs(0);
    setSampleFadeOutMs(0);
    if (!pendingSampleFile) { setPendingSampleDuration(0); setPendingSamplePeaks([]); setPendingSampleChannels([]); setPendingSampleRate(0); setTrimStart(0); setTrimEnd(0); return; }
    let cancelled = false;
    const context = new AudioContext();
    void pendingSampleFile.arrayBuffer().then(bytes => context.decodeAudioData(bytes)).then(buffer => {
      if (cancelled) return;
      const peaks = Array.from({ length: 96 }, (_, column) => {
        const from = Math.floor(column * buffer.length / 96);
        const to = Math.max(from + 1, Math.floor((column + 1) * buffer.length / 96));
        let peak = 0;
        for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
          const pcm = buffer.getChannelData(channel);
          for (let frame = from; frame < Math.min(to, pcm.length); frame += 1) peak = Math.max(peak, Math.abs(pcm[frame]));
        }
        return peak;
      });
      setPendingSampleDuration(buffer.duration);
      setPendingSamplePeaks(peaks);
      setPendingSampleChannels(Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel).slice()));
      setPendingSampleRate(buffer.sampleRate);
      setTrimStart(0);
      setTrimEnd(buffer.duration);
    }).catch(() => { if (!cancelled) message.error(t('music.sample.decodeError')); })
      .finally(() => { void context.close().catch(() => undefined); });
    return () => { cancelled = true; void context.close().catch(() => undefined); };
  }, [pendingSampleFile, t]);
  useEffect(() => () => {
    if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop();
    microphoneStream.current?.getTracks().forEach(track => track.stop());
  }, []);
  const sampleEditorFrameAtPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!activeEditorLength) return 0;
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(editorViewStart, Math.min(editorViewEnd - 1, Math.floor(editorViewStart + ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * (editorViewEnd - editorViewStart))));
  };
  const sampleEditorValueAtPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(-1, Math.min(1, (0.5 - (event.clientY - bounds.top) / Math.max(1, bounds.height)) * 2));
  };
  const beginSampleEditorPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (props.playing || !activeEditorLength || !activeEditorZoneEditable) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const frame = sampleEditorFrameAtPointer(event);
    if (sampleEditorTool === 'draw') {
      const edits = new Map([[frame, sampleEditorValueAtPointer(event)]]);
      sampleEditorPointer.current = { mode: 'draw', start: frame, edits };
    } else {
      sampleEditorPointer.current = { mode: 'select', start: frame, edits: new Map() };
      setSampleEditorSelection({ start: frame, end: Math.min(activeEditorLength, frame + 1) });
    }
  };
  const moveSampleEditorPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const pointer = sampleEditorPointer.current;
    if (!pointer || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const frame = sampleEditorFrameAtPointer(event);
    if (pointer.mode === 'select') {
      setSampleEditorSelection({ start: Math.min(pointer.start, frame), end: Math.max(pointer.start, frame) + 1 });
    } else pointer.edits.set(frame, sampleEditorValueAtPointer(event));
  };
  const finishSampleEditorPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const pointer = sampleEditorPointer.current;
    if (!pointer) return;
    const frame = sampleEditorFrameAtPointer(event);
    if (pointer.mode === 'select') {
      setSampleEditorSelection({ start: Math.min(pointer.start, frame), end: Math.max(pointer.start, frame) + 1 });
    } else {
      pointer.edits.set(frame, sampleEditorValueAtPointer(event));
      const frames = [...pointer.edits.keys()];
      if (frames.length) props.onEditSamplePcm?.(instrument, 'draw', { start: Math.min(...frames), end: Math.max(...frames) + 1 }, [...pointer.edits].map(([editedFrame, value]) => ({ frame: editedFrame, value })), sampleEditorVariantIndex);
    }
    sampleEditorPointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  useEffect(() => {
    if (!sampleModalOpen || !navigator.mediaDevices?.enumerateDevices) return;
    const refreshMicrophones = () => {
      void navigator.mediaDevices.enumerateDevices().then(devices => {
        setMicrophoneDevices(devices.filter(device => device.kind === 'audioinput' && device.deviceId !== 'default' && device.deviceId !== 'communications'));
      }).catch(() => setMicrophoneDevices([]));
    };
    refreshMicrophones();
    navigator.mediaDevices.addEventListener?.('devicechange', refreshMicrophones);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', refreshMicrophones);
  }, [sampleModalOpen]);
  useEffect(() => {
    const onImportAudio = (event: Event) => {
      const importDetail = (event as CustomEvent<{ file?: File; replaceSelected?: boolean; asVariant?: boolean }>).detail;
      const file = importDetail?.file;
      if (!file) return;
      setSampleImportAsVariant(importDetail.asVariant === true || (importDetail.asVariant !== false && importDetail.replaceSelected !== true && format === 'XM' && props.canAddSampleVariant !== false));
      setPendingSampleFile(file);
      setSampleModalOpen(true);
    };
    const onEditorAction = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind === 'record-microphone') {
        setSampleImportAsVariant(false);
        setPendingSampleFile(null);
        setSampleModalOpen(true);
      } else if (kind === 'open-sample-editor') {
        setSampleEditorVariantIndex(0);
        setSampleEditorSelection(null);
        setSampleEditorZoom(1);
        setSampleEditorOpen(true);
      }
    };
    window.addEventListener('gba-studio:music-editor-import-audio', onImportAudio);
    window.addEventListener('gba-studio:music-editor-action', onEditorAction);
    return () => {
      window.removeEventListener('gba-studio:music-editor-import-audio', onImportAudio);
      window.removeEventListener('gba-studio:music-editor-action', onEditorAction);
    };
  }, [format, props.canAddSampleVariant]);
  const startMicrophoneRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error(t('music.sample.microphoneUnavailable'));
      const audio: MediaTrackConstraints | boolean = selectedMicrophoneDeviceId ? { deviceId: { exact: selectedMicrophoneDeviceId } } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      microphoneStream.current = stream;
      mediaRecorder.current = recorder;
      recordedChunks.current = [];
      recorder.ondataavailable = event => { if (event.data.size) recordedChunks.current.push(event.data); };
      recorder.onerror = () => { message.error(t('music.sample.recordError')); setMicrophoneRecording(false); stream.getTracks().forEach(track => track.stop()); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        microphoneStream.current = null;
        mediaRecorder.current = null;
        setMicrophoneRecording(false);
        const type = recorder.mimeType || 'audio/webm';
        const take = new Blob(recordedChunks.current, { type });
        recordedChunks.current = [];
        if (!take.size) { message.error(t('music.sample.emptyRecording')); return; }
        const context = new AudioContext();
        try {
          const decoded = await context.decodeAudioData(await take.arrayBuffer());
          const wav = createTrackerSourceWav(Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel)), decoded.sampleRate);
          setPendingSampleFile(new File([wav], 'microphone-take.wav', { type: 'audio/wav' }));
        } catch {
          message.error(t('music.sample.decodeError'));
        } finally {
          await context.close().catch(() => undefined);
        }
      };
      recorder.start();
      setMicrophoneRecording(true);
    } catch (error) {
      const errorName = error instanceof DOMException ? error.name : '';
      const permissionDenied = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(errorName);
      const microphoneUnavailable = ['NotFoundError', 'DevicesNotFoundError'].includes(errorName);
      message.error(permissionDenied ? t('music.sample.permissionDenied') : microphoneUnavailable ? t('music.sample.microphoneUnavailable') : error instanceof Error ? error.message : t('music.sample.recordError'));
    }
  };
  const stopMicrophoneRecording = () => { if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop(); };
  const drag = useRef<{ row: number; note: number; end: number; old?: { row: number; note: number }; length: number; resize: boolean; resizeEdge?: 'left' | 'right'; moved: boolean; patternIndex?: number; patternStart?: number; patternEnd?: number; orderIndex?: number; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; group?: Array<{ oldRow: number; oldNote: number; row: number; note: number; length: number; instrument: number; patternIndex: number; patternStart: number; patternEnd: number }>; originRow?: number; originNote?: number; grabOffsetRows?: number; creationPointerRow?: number } | null>(null);
  const selectionDrag = useRef<{ startRow: number; startNote: number; startX?: number; startY?: number; patternIndex: number; patternStart: number; moved: boolean; mode?: 'erase'; orderIndex?: number; targets?: EraseTarget[] } | null>(null);
  const trackerGroupDrag = useRef<{ pointerId: number; startRow: number; notes: Array<{ row: number; note: number; length: number; instrument: number }>; moved: boolean } | null>(null);
  const suppressTrackerCellClick = useRef(false);
  const suppressRollNoteClick = useRef(false);
  const gridPan = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const pendingNoteHold = useRef<{ pointerId: number; startX: number; startY: number; target: HTMLButtonElement; timer: number } | null>(null);
  const cancelPendingNoteHold = () => {
    const pending = pendingNoteHold.current;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingNoteHold.current = null;
  };
  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const pending = pendingNoteHold.current;
      if (pending?.pointerId === event.pointerId && Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > 6) cancelPendingNoteHold();
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (pendingNoteHold.current?.pointerId === event.pointerId) cancelPendingNoteHold();
      if (event.type === 'pointercancel') suppressRollNoteClick.current = false;
      else if (suppressRollNoteClick.current) window.setTimeout(() => { suppressRollNoteClick.current = false; }, 0);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      cancelPendingNoteHold();
    };
  }, []);
  useEffect(() => {
    const stopPreviewDrag = () => {
      if (!previewKeyDrag.current) return;
      previewKeyDrag.current.active = false;
      window.setTimeout(() => { if (previewKeyDrag.current?.active === false) previewKeyDrag.current = null; }, 0);
    };
    window.addEventListener('pointerup', stopPreviewDrag);
    window.addEventListener('pointercancel', stopPreviewDrag);
    return () => { window.removeEventListener('pointerup', stopPreviewDrag); window.removeEventListener('pointercancel', stopPreviewDrag); };
  }, []);
  const patternRows = useMemo(() => Array.from({ length: patternRowCount }, (_, index) => rows[index] ?? []), [patternRowCount, rows]);
  const songTimelineSegments = useMemo(() => {
    let start = 0;
    return order.map((patternIndex, orderIndex) => {
      const segmentRows = props.patternRowsByIndex[patternIndex] ?? [];
      const segment = { patternIndex, orderIndex, start, end: start + segmentRows.length, rows: segmentRows };
      start = segment.end;
      return segment;
    }).filter(segment => segment.rows.length > 0);
  }, [order, props.patternRowsByIndex]);
  const timelineSegments = useMemo(() => playMode === 'song' ? songTimelineSegments : [{
    patternIndex: pattern, orderIndex: selectedOrder, start: 0, end: patternRows.length, rows: patternRows,
  }], [playMode, songTimelineSegments, pattern, selectedOrder, patternRows]);
  const songRowCount = Math.max(1, songTimelineSegments.at(-1)?.end ?? patternRowCount);
  const scorePrecedingRows = useMemo(() => songTimelineSegments.filter(segment => segment.orderIndex < selectedOrder).flatMap(segment => segment.rows), [songTimelineSegments, selectedOrder]);
  const keyboardTiming = useMemo(() => {
    if (view !== 'keyboard') return [];
    const initial = trackerScoreTiming(scorePrecedingRows, format, { bpm: info.tempo ?? 125, speed: info.speed ?? 6 }).state;
    return trackerScoreTiming(patternRows, format, initial).rows;
  }, [view, scorePrecedingRows, patternRows, format, info.tempo, info.speed]);
  const rowCount = view === 'roll' && playMode === 'song' ? songRowCount : patternRowCount;
  const segmentAtRow = (row: number) => timelineSegments.find(segment => row >= segment.start && row < segment.end) ?? timelineSegments.at(-1);
  const selectedTimelineSegment = timelineSegments.find(segment => segment.orderIndex === selectedOrder);
  const playbackTimelineSegment = view === 'roll' && playMode === 'song' ? segmentAtRow(playhead) : selectedTimelineSegment;
  const playbackOrderIndex = playbackTimelineSegment?.orderIndex ?? selectedOrder;
  const localPlayhead = view === 'roll' && playMode === 'song' ? Math.max(0, playhead - (selectedTimelineSegment?.start ?? 0)) : playhead;
  const existingNotes = useMemo<Array<{ row: number; timelineRow?: number; patternIndex: number; orderIndex: number; patternRow: number; note: number; instrument: number; volume: number; volumePresent?: boolean; effect: number; parameter: number; length: number }>>(() => view === 'roll' && playMode === 'song' ? timelineSegments.flatMap(segment => segment.rows.flatMap((row, rowIndex) => {
    const event = row[selectedChannel];
    if (!event || event.note < 1 || event.note > 96) return [];
    const length = Math.min(segment.end - (segment.start + rowIndex), inferXmNoteLength(segment.rows, rowIndex, selectedChannel, segment.rows.length - rowIndex));
    return [{ row: rowIndex, timelineRow: segment.start + rowIndex, patternIndex: segment.patternIndex, orderIndex: segment.orderIndex, patternRow: rowIndex, note: event.note, instrument: event.instrument, volume: event.volume, volumePresent: event.volumePresent, effect: event.effect, parameter: event.parameter, length }];
  })) : patternRows.flatMap((row, rowIndex) => {
    const event = row[selectedChannel];
    if (!event || event.note < 1 || event.note > 96) return [];
    const length = inferXmNoteLength(patternRows, rowIndex, selectedChannel, patternRows.length - rowIndex);
    return [{ row: rowIndex, patternIndex: pattern, orderIndex: selectedOrder, patternRow: rowIndex, note: event.note, instrument: event.instrument, volume: event.volume, volumePresent: event.volumePresent, effect: event.effect, parameter: event.parameter, length }];
  }), [view, playMode, timelineSegments, patternRows, selectedChannel, pattern, selectedOrder]);
  const setCursorRow = (row: number, syncPattern = true) => {
    const next = Math.max(0, Math.min(rowCount - 1, Math.trunc(row)));
    setPlaybackStart(next);
    setPlayhead(next);
    if (syncPattern && view === 'roll' && playMode === 'song') {
      const segment = segmentAtRow(next);
      if (segment && (segment.orderIndex !== selectedOrder || segment.patternIndex !== pattern)) {
        if (segment.orderIndex !== selectedOrder) skipNextOrderRecentering.current = true;
        props.onOrderChange(segment.orderIndex);
        props.onPatternChange(segment.patternIndex);
      }
    }
  };
  const changePlayMode = (mode: 'pattern' | 'song') => {
    if (mode === playMode) return;
    setPlayMode(mode);
    const selectedSegment = songTimelineSegments.find(segment => segment.orderIndex === selectedOrder);
    const nextRow = mode === 'song' && view === 'roll' ? selectedSegment?.start ?? 0 : 0;
    setPlaybackStart(nextRow);
    setPlayhead(nextRow);
    pendingPaste.current = null;
    setRollGroupPreview([]);
    setInspectorLengthPreview(null);
    setDragPreview(null);
  };
  useLayoutEffect(() => {
    const scroll = pianoRollScroll.current;
    if (!scroll) return;
    const selectedSegment = songTimelineSegments.find(segment => segment.orderIndex === selectedOrder);
    scroll.scrollLeft = playMode === 'song' ? (selectedSegment?.start ?? 0) * gridWidth : 0;
    syncPianoRollScrollLeft(scroll.scrollLeft);
  }, [playMode]);
  const animateToOrderStart = (orderIndex: number) => {
    const segment = timelineSegments.find(item => item.orderIndex === orderIndex);
    const scroll = pianoRollScroll.current;
    if (!segment || !scroll) return () => undefined;
    const startLeft = scroll.scrollLeft;
    const targetLeft = Math.max(0, Math.min(scroll.scrollWidth - scroll.clientWidth, segment.start * gridWidth));
    if (centerAnimationFrame.current !== null) cancelAnimationFrame(centerAnimationFrame.current);
    const startedAt = performance.now();
    const duration = 600;
    const animateCenter = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      scroll.scrollLeft = startLeft + (targetLeft - startLeft) * easeOut;
      if (progress < 1) centerAnimationFrame.current = requestAnimationFrame(animateCenter);
      else centerAnimationFrame.current = null;
    };
    centerAnimationFrame.current = requestAnimationFrame(animateCenter);
    return () => {
      if (centerAnimationFrame.current !== null) cancelAnimationFrame(centerAnimationFrame.current);
      centerAnimationFrame.current = null;
    };
  };
  const selectOrder = (orderIndex: number) => {
    if (props.playing) return;
    props.onOrderChange(orderIndex);
    const segment = timelineSegments.find(item => item.orderIndex === orderIndex);
    if (segment) {
      setPlaybackStart(view === 'roll' ? segment.start : 0);
      setPlayhead(view === 'roll' ? segment.start : 0);
    }
    if (view === 'roll') {
      lastObservedOrder.current = orderIndex;
      skipNextOrderRecentering.current = false;
      animateToOrderStart(orderIndex);
    }
  };
  const selectPattern = (patternIndex: number) => {
    const matches = order.flatMap((orderedPattern, orderIndex) => orderedPattern === patternIndex ? [orderIndex] : []);
    if (!matches.length) {
      props.onPatternChange(patternIndex);
      return;
    }
    const orderIndex = matches.reduce((nearest, candidate) => Math.abs(candidate - selectedOrder) < Math.abs(nearest - selectedOrder) ? candidate : nearest, matches[0]);
    selectOrder(orderIndex);
  };
  useEffect(() => {
    setPlaybackStart(current => Math.min(rowCount - 1, current));
    setPlayhead(current => Math.min(rowCount - 1, current));
  }, [rowCount]);
  useEffect(() => {
    if (wasPlaying.current && !props.playing) setPlayhead(playbackStart);
    wasPlaying.current = props.playing;
  }, [playbackStart, props.playing]);
  useLayoutEffect(() => {
    const scroll = pianoRollScroll.current;
    if (view !== 'roll' || !props.playing || !scroll) return;
    const playheadX = playhead * gridWidth;
    // Keep the cursor stationary while the grid moves underneath it. Once the
    // viewport reaches the end, scrollLeft is clamped and the cursor advances
    // across the remaining visible rows to finish the song.
    scroll.scrollLeft = Math.min(scroll.scrollWidth - scroll.clientWidth, Math.max(0, playheadX - scroll.clientWidth * 0.5));
    syncPianoRollScrollLeft(scroll.scrollLeft);
  }, [gridWidth, playhead, props.playing, view]);
  useLayoutEffect(() => {
    const track = orderTrackRef.current;
    if (!props.playing || orderPanning || !track) return;
    const card = track.querySelector<HTMLElement>(`[data-order-index="${playbackOrderIndex}"]`);
    if (!card) return;
    const start = view === 'roll' ? playbackTimelineSegment?.start ?? 0 : 0;
    const length = playbackTimelineSegment ? playbackTimelineSegment.end - playbackTimelineSegment.start : patternRowCount;
    const progress = Math.max(0, Math.min(1, (playhead - start) / Math.max(1, length)));
    const cardLeft = card.getBoundingClientRect().left - track.getBoundingClientRect().left + track.scrollLeft;
    const position = cardLeft + card.offsetWidth * progress;
    track.scrollLeft = Math.max(0, Math.min(track.scrollWidth - track.clientWidth, position - track.clientWidth / 2));
  }, [props.playing, playhead, playbackOrderIndex, playbackTimelineSegment, patternRowCount, view, orderPanning]);
  useEffect(() => {
    const previousOrder = lastObservedOrder.current;
    lastObservedOrder.current = selectedOrder;
    if (skipNextOrderRecentering.current) {
      skipNextOrderRecentering.current = false;
      return;
    }
    if (previousOrder === selectedOrder || props.playing || view !== 'roll') return;
    return animateToOrderStart(selectedOrder);
  }, [gridWidth, props.playing, selectedOrder, timelineSegments, view]);
  useEffect(() => { props.onActiveInstrumentChange?.(instrument); }, [instrument, props.onActiveInstrumentChange]);
  useEffect(() => {
    const selectItem = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; index?: number }>).detail;
      setSelectedNote(null);
      setSelectedNotes([]);
      selectionAnchor.current = null;
      props.onSelectionChange?.(null);
      if (detail?.kind === 'instrument' && Number.isInteger(detail.index) && (detail.index ?? -1) >= 0) {
        const selectedInstrument = Math.min((detail.index ?? 0) + 1, Math.max(1, trackerSlotCount));
        setInstrument(selectedInstrument);
      }
    };
    window.addEventListener('gba-studio:music-select-item', selectItem);
    return () => window.removeEventListener('gba-studio:music-select-item', selectItem);
  }, [trackerSlotCount, props.onSelectionChange]);
  const noteKey = (item: { row: number; note: number }) => `${item.row}:${item.note}`;
  const isNoteSelected = (item: { row: number; note: number; patternRow?: number; orderIndex?: number }) => selectedNotes.some(note => noteKey(note) === noteKey({ row: item.patternRow ?? item.row, note: item.note })) && (item.orderIndex === undefined || item.orderIndex === selectedOrder);
  const findExistingNote = (selected: { row: number; note: number }) => existingNotes.find(note => note.row === selected.row && note.note === selected.note && (note.orderIndex === undefined || note.orderIndex === selectedOrder));
  const selectNote = (item: { row: number; note: number }, event?: Pick<React.PointerEvent | React.MouseEvent, 'shiftKey' | 'ctrlKey' | 'metaKey'>, targetPattern = pattern, targetChannel = selectedChannel) => {
    if (!props.playing) props.onPreviewExistingNote(item.row, targetChannel, targetPattern);
    const anchor = selectionAnchor.current ?? selectedNote;
    if (event?.shiftKey && anchor) {
      const low = Math.min(anchor.row, item.row);
      const high = Math.max(anchor.row, item.row);
      setSelectedNotes(existingNotes.filter(note => note.row >= low && note.row <= high).map(({ row, note }) => ({ row, note })));
    } else if (event?.ctrlKey || event?.metaKey) {
      const alreadySelected = selectedNotes.some(note => noteKey(note) === noteKey(item));
      const next = alreadySelected ? selectedNotes.filter(note => noteKey(note) !== noteKey(item)) : [...selectedNotes, item];
      setSelectedNotes(next);
      setSelectedNote(alreadySelected ? next.at(-1) ?? null : item);
    } else { setSelectedNotes([item]); selectionAnchor.current = item; }
    if (!event?.ctrlKey && !event?.metaKey) setSelectedNote(item);
  };
  const handleExistingNoteClick = (item: { row: number; timelineRow?: number; note: number; instrument: number; length: number; patternRow?: number; patternIndex?: number; orderIndex?: number }, event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 && suppressRollNoteClick.current) {
      suppressRollNoteClick.current = false;
      return;
    }
    if (trackerTool === 'eraser') {
      props.onOrderChange(item.orderIndex);
      props.onPatternChange(item.patternIndex);
      props.onDelete(item.patternRow ?? item.row, selectedChannel);
      setSelectedNotes(notes => notes.filter(note => note.row !== (item.patternRow ?? item.row) || note.note !== item.note));
      if (selectedNote?.row === (item.patternRow ?? item.row) && selectedNote.note === item.note) setSelectedNote(null);
      return;
    }
    props.onOrderChange(item.orderIndex);
    props.onPatternChange(item.patternIndex);
    selectNote({ row: item.patternRow ?? item.row, note: item.note }, event, item.patternIndex ?? pattern);
    setNoteLength(item.length);
    setInstrument(item.instrument || 1);
  };
  const instrumentColor = useCallback((id: number, channel: number) => {
    return trackerInstrumentHierarchyColor(id, props.instrumentCategories ?? {}, props.channelInstrumentTypes?.[String(channel)], props.instrumentColors ?? {}, props.instrumentPresetColors ?? {});
  }, [props.channelInstrumentTypes, props.instrumentColors, props.instrumentCategories, props.instrumentPresetColors]);
  const cellHeight = view === 'roll' ? gridWidth : 20;
  const hoverFxRow = useCallback((row: number | null) => {
    const layer = fxRollCrosshair.current;
    if (!layer) return;
    if (row === null) { layer.style.display = 'none'; return; }
    const vertical = layer.firstElementChild as HTMLDivElement;
    vertical.style.left = `${row * gridWidth}px`;
    layer.style.display = 'block';
  }, [gridWidth]);
  useEffect(() => { if (fxRollCrosshair.current) fxRollCrosshair.current.style.display = 'none'; }, [selectedChannel, view, gridWidth, props.playing]);
  useLayoutEffect(() => {
    const scroll = pianoRollScroll.current;
    if (!scroll || view !== 'roll') return;
    const update = () => {
      const center = scroll.scrollTop + scroll.clientHeight / 2;
      scroll.style.setProperty('--piano-roll-visible-center', `${center}px`);
    };
    update();
    scroll.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(scroll);
    return () => { scroll.removeEventListener('scroll', update); observer.disconnect(); };
  }, [cellHeight, view]);
  const pianoKeys = useMemo(() => {
    const pitches = Array.from({ length: PITCHES }, (_, index) => TOP_PITCH - index);
    const naturals = (note: number) => [0, 2, 4, 5, 7, 9, 11].includes((note - 1) % 12);
    return pitches.map((note, index) => {
      const rowTop = index * cellHeight;
      const black = !naturals(note);
      if (black) return { note, black, top: rowTop, height: cellHeight };
      const sharpAbove = index > 0 && !naturals(pitches[index - 1]);
      const sharpBelow = index < pitches.length - 1 && !naturals(pitches[index + 1]);
      const top = Math.max(0, rowTop - (sharpAbove ? cellHeight / 2 : 0));
      const bottom = Math.min(PITCHES * cellHeight, rowTop + cellHeight + (sharpBelow ? cellHeight / 2 : 0));
      return { note, black, top, height: bottom - top };
    });
  }, [cellHeight]);
  const previewKeyboardPitch = (pitch: number) => { props.onPreviewNote(pitch, instrument); };
  const selectInstrument = (selectedInstrument: number) => {
    const nextInstrument = Math.max(1, Math.min(trackerSlotCount, selectedInstrument));
    setInstrument(nextInstrument);
    props.onPreviewNote(49, nextInstrument);
  };
  const startKeyboardPreview = (pitch: number) => {
    previewKeyDrag.current = { active: true, moved: false, pitch };
    previewKeyboardPitch(pitch);
  };
  const enterKeyboardPreview = (pitch: number) => {
    setRollHoveredKeyPitch(pitch);
    const current = previewKeyDrag.current;
    if (current?.active && current.pitch !== pitch) {
      current.pitch = pitch;
      current.moved = true;
      previewKeyboardPitch(pitch);
    }
  };
  const clickKeyboardPitch = (pitch: number, event: React.MouseEvent<HTMLButtonElement>) => {
    const pointerDragMoved = previewKeyDrag.current?.moved ?? false;
    if (previewKeyDrag.current) previewKeyDrag.current.moved = false;
    if (pointerDragMoved) return;
    if (selectedNote) updateSelected(selectedNote.row, noteLength, pitch);
    if (event.detail === 0) previewKeyboardPitch(pitch);
  };
  useEffect(() => {
    if (view !== 'roll' || !pianoRollScroll.current) return;
    const targetPitch = 49; // C5 in tracker octave numbering.
    const scroll = pianoRollScroll.current;
    const pitchCenter = ((TOP_PITCH - targetPitch) * cellHeight) + (cellHeight / 2);
    scroll.scrollTop = Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, pitchCenter - (scroll.clientHeight / 2)));
    if (pianoKeyboardScroll.current) pianoKeyboardScroll.current.scrollTop = scroll.scrollTop;
  }, [props.filename, view]);
  const scaleIntervals = useMemo(() => scaleMode === 1 ? [0, 2, 4, 5, 7, 9, 11] : scaleMode === 2 ? [0, 2, 3, 5, 7, 8, 10] : Array.from({ length: 12 }, (_, index) => index), [scaleMode]);
  const isScalePitch = (note: number) => scaleIntervals.includes((note - 1 - scaleRoot + 1200) % 12);
  const pianoRollCells = useMemo(() => Array.from({ length: PITCHES }, (_, pitchIndex) => {
    const note = TOP_PITCH - pitchIndex;
    const black = [1, 3, 6, 8, 10].includes((note - 1) % 12);
    const outsideScale = !scaleIntervals.includes((note - 1 - scaleRoot + 1200) % 12);
    const backgroundImage = [
      `repeating-linear-gradient(to right, transparent 0 ${Math.max(0, gridWidth - 1)}px, var(--music-grid) ${Math.max(0, gridWidth - 1)}px ${gridWidth}px)`,
      `repeating-linear-gradient(to right, transparent 0 ${Math.max(0, 4 * gridWidth - 1)}px, var(--music-border) ${Math.max(0, 4 * gridWidth - 1)}px ${4 * gridWidth}px)`,
      `repeating-linear-gradient(to right, transparent 0 ${Math.max(0, 8 * gridWidth - 1)}px, var(--music-border-strong) ${Math.max(0, 8 * gridWidth - 1)}px ${8 * gridWidth}px)`,
      `repeating-linear-gradient(to right, transparent 0 ${Math.max(0, 16 * gridWidth - 1)}px, var(--music-grid-strong) ${Math.max(0, 16 * gridWidth - 1)}px ${16 * gridWidth}px)`,
    ].join(',');
    return <div key={note} className={`gba-beat-cell ${black ? 'black' : ''} ${(note - 1) % 12 === 0 ? 'octave' : ''} ${outsideScale ? 'outside-scale' : ''}`} style={{ left: 0, top: pitchIndex * cellHeight, width: rowCount * gridWidth, height: cellHeight, backgroundColor: black ? 'color-mix(in srgb, var(--music-surface-base) 88%, white)' : undefined, backgroundImage: scaleMode !== 0 && outsideScale ? undefined : backgroundImage }} />;
  }), [rowCount, scaleIntervals, scaleRoot, scaleMode, gridWidth, cellHeight]);
  const fitScalePitch = (note: number) => {
    if (!snapToScale || isScalePitch(note)) return note;
    return Array.from({ length: PITCHES }, (_, index) => index + BOTTOM_PITCH).filter(isScalePitch).sort((a, b) => Math.abs(a - note) - Math.abs(b - note) || a - b)[0] ?? note;
  };
  const beginEraseSelection = (grid: HTMLElement, pointerId: number, clientX: number, clientY: number, hitNote?: { row: number; note: number; length: number; patternRow?: number; patternIndex?: number; orderIndex?: number }) => {
    const rect = grid.getBoundingClientRect();
    const time = Math.max(0, Math.min(rowCount - 1, Math.floor((clientX - rect.left) / gridWidth)));
    const pitch = Math.max(BOTTOM_PITCH, Math.min(TOP_PITCH, TOP_PITCH - Math.floor((clientY - rect.top) / cellHeight)));
    const segment = view === 'roll' && playMode === 'song' ? segmentAtRow(time) : undefined;
    const orderIndex = segment?.orderIndex ?? selectedOrder;
    const targets = (hitNote ? [hitNote] : existingNotes.filter(item => item.orderIndex === orderIndex && item.note === pitch
      && (item.timelineRow ?? item.row) <= time && (item.timelineRow ?? item.row) + item.length > time))
      .map(item => ({ row: item.patternRow ?? item.row, note: item.note, start: item.patternRow ?? item.row, end: (item.patternRow ?? item.row) + item.length, patternIndex: item.patternIndex, orderIndex: item.orderIndex }));
    pendingPaste.current = null;
    setRollGroupPreview([]);
    setInspectorLengthPreview(null);
    selectionDrag.current = { startRow: time, startNote: hitNote?.note ?? pitch, startX: clientX, startY: clientY, patternIndex: hitNote?.patternIndex ?? segment?.patternIndex ?? pattern,
      patternStart: segment?.start ?? 0, moved: false, mode: 'erase', orderIndex: hitNote?.orderIndex ?? orderIndex, targets };
    setEraseTargets(targets);
    setSelectionBox(null);
    suppressRollNoteClick.current = true;
    grid.setPointerCapture(pointerId);
  };
  const startPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (props.playing) { event.preventDefault(); return; }
    if (trackerTool === 'eraser' && event.button !== 1) {
      event.preventDefault();
      if (event.button === 0) beginEraseSelection(event.currentTarget, event.pointerId, event.clientX, event.clientY);
      return;
    }
    if (pendingPaste.current && event.button === 0) {
      event.preventDefault();
      positionPasteAtPointer(event.clientX, event.clientY);
      placePastedNotes();
      return;
    }
    setInspectorLengthPreview(null);
    if (event.button === 1) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gridPan.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, scrollLeft: pianoRollScroll.current?.scrollLeft ?? 0, scrollTop: pianoRollScroll.current?.scrollTop ?? 0 };
      setGridPanning(true);
      return;
    }
    if ((event.target as HTMLElement).closest('[data-note]')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const time = Math.max(0, Math.min(rowCount - 1, Math.floor((event.clientX - rect.left) / gridWidth)));
    const pitchIndex = Math.max(0, Math.min(PITCHES - 1, Math.floor((event.clientY - rect.top) / cellHeight)));
    const note = fitScalePitch(TOP_PITCH - pitchIndex);
    setRollHover({ row: time, note });
    const segment = view === 'roll' && playMode === 'song' ? segmentAtRow(time) : undefined;
    if (view === 'roll' && trackerTool === 'select') {
      selectionDrag.current = { startRow: time, startNote: note, patternIndex: segment?.patternIndex ?? pattern, patternStart: segment?.start ?? 0, moved: false };
      setSelectionBox({ firstRow: time, lastRow: time, firstNote: note, lastNote: note });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    drag.current = { row: time, note, end: time, length: 1, resize: true, moved: false, creationPointerRow: time, patternIndex: segment?.patternIndex ?? pattern, patternStart: segment?.start ?? 0, patternEnd: segment?.end ?? patternRowCount };
    setDragPreview({ row: time, note, length: 1, resize: true });
    props.onPreviewNote(note, instrument, 1);
    const localRow = time - (segment?.start ?? 0);
    setSelectedNote({ row: localRow, note });
    setSelectedNotes([{ row: localRow, note }]);
    selectionAnchor.current = { row: localRow, note };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (props.playing) return;
    const hoverRect = event.currentTarget.getBoundingClientRect();
    const hoverRow = Math.max(0, Math.min(rowCount - 1, Math.floor((event.clientX - hoverRect.left) / gridWidth)));
    const hoverPitch = Math.max(BOTTOM_PITCH, Math.min(TOP_PITCH, TOP_PITCH - Math.floor((event.clientY - hoverRect.top) / cellHeight)));
    setRollHover({ row: hoverRow, note: hoverPitch });
    if (pendingPaste.current) {
      updatePastePlacement(hoverRow, hoverPitch);
      return;
    }
    if (gridPan.current?.pointerId === event.pointerId) {
      const scroll = pianoRollScroll.current;
      if (!scroll) return;
      scroll.scrollLeft = gridPan.current.scrollLeft - (event.clientX - gridPan.current.startX);
      scroll.scrollTop = gridPan.current.scrollTop - (event.clientY - gridPan.current.startY);
      if (pianoKeyboardScroll.current) pianoKeyboardScroll.current.scrollTop = scroll.scrollTop;
      syncPianoRollScrollLeft(scroll.scrollLeft);
      return;
    }
    if (selectionDrag.current) {
      const current = selectionDrag.current;
      if (current.mode === 'erase' && !current.moved
        && Math.hypot(event.clientX - (current.startX ?? event.clientX), event.clientY - (current.startY ?? event.clientY)) < 4) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const time = Math.max(0, Math.min(rowCount - 1, Math.floor((event.clientX - rect.left) / gridWidth)));
      const rawPitch = Math.max(BOTTOM_PITCH, Math.min(TOP_PITCH, TOP_PITCH - Math.floor((event.clientY - rect.top) / cellHeight)));
      const pitch = current.mode === 'erase' ? rawPitch : fitScalePitch(rawPitch);
      current.moved ||= time !== current.startRow || pitch !== current.startNote;
      setSelectionBox({ firstRow: current.startRow, lastRow: time, firstNote: current.startNote, lastNote: pitch });
      if (current.mode === 'erase') {
        if (!current.moved) return;
        const lowRow = Math.min(current.startRow, time);
        const highRow = Math.max(current.startRow, time);
        current.targets = existingNotes.filter(item => item.orderIndex === current.orderIndex
          && (item.timelineRow ?? item.row) <= highRow && (item.timelineRow ?? item.row) + item.length > lowRow
          && item.note >= Math.min(current.startNote, pitch) && item.note <= Math.max(current.startNote, pitch))
          .map(item => ({ row: item.patternRow ?? item.row, note: item.note,
            start: Math.max(item.timelineRow ?? item.row, lowRow) - current.patternStart,
            end: Math.min((item.timelineRow ?? item.row) + item.length, highRow + 1) - current.patternStart,
            patternIndex: item.patternIndex, orderIndex: item.orderIndex }));
        setEraseTargets(current.targets);
        return;
      }
      if (current.moved) {
        const lowRow = Math.min(current.startRow, time);
        const highRow = Math.max(current.startRow, time);
        const lowNote = Math.min(current.startNote, pitch);
        const highNote = Math.max(current.startNote, pitch);
        const selection = existingNotes.filter(item => (item.orderIndex === undefined || item.orderIndex === selectedOrder)
          && (item.timelineRow ?? item.row) >= lowRow && (item.timelineRow ?? item.row) <= highRow && item.note >= lowNote && item.note <= highNote)
          .map(item => ({ row: item.patternRow ?? item.row, note: item.note }));
        setSelectedNotes(selection);
        setSelectedNote(selection[0] ?? null);
        selectionAnchor.current = selection[0] ?? null;
      }
      return;
    }
    if (!drag.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const time = Math.max(drag.current.patternStart ?? 0, Math.min((drag.current.patternEnd ?? rowCount) - 1, Math.floor((event.clientX - rect.left) / gridWidth)));
    const pitch = fitScalePitch(Math.max(BOTTOM_PITCH, Math.min(TOP_PITCH, TOP_PITCH - Math.floor((event.clientY - rect.top) / cellHeight))));
    if (drag.current.group) {
      drag.current.row = time;
      drag.current.note = pitch;
      drag.current.moved = time !== drag.current.originRow || pitch !== drag.current.originNote;
      const deltaRow = time - (drag.current.originRow ?? time);
      const deltaNote = pitch - (drag.current.originNote ?? pitch);
      setRollGroupPreview(drag.current.group.map(item => ({ row: item.row + deltaRow, note: Math.max(1, Math.min(96, item.note + deltaNote)), length: item.length, instrument: item.instrument })));
      return;
    }
    const previousPitch = drag.current.note;
    const previousRow = drag.current.row;
    const previousLength = drag.current.end - drag.current.row + 1;
    if (drag.current.resize) {
      if (drag.current.resizeEdge === 'left') {
        drag.current.row = Math.min(drag.current.end, time);
      } else if (!drag.current.old && event.ctrlKey) {
        const length = Math.max(1, drag.current.end - drag.current.row + 1);
        const delta = time - (drag.current.creationPointerRow ?? time);
        const maxStart = Math.max(drag.current.patternStart ?? 0, (drag.current.patternEnd ?? rowCount) - length);
        drag.current.row = Math.max(drag.current.patternStart ?? 0, Math.min(maxStart, drag.current.row + delta));
        drag.current.end = drag.current.row + length - 1;
      } else {
        drag.current.end = Math.max(drag.current.row, time);
      }
      if (!drag.current.old) {
        drag.current.note = pitch;
        drag.current.creationPointerRow = time;
      }
    }
    else {
      const maxStart = Math.max(drag.current.patternStart ?? 0, (drag.current.patternEnd ?? rowCount) - drag.current.length);
      drag.current.row = Math.max(drag.current.patternStart ?? 0, Math.min(maxStart, time - (drag.current.grabOffsetRows ?? 0)));
      drag.current.note = pitch;
      drag.current.end = drag.current.row + drag.current.length - 1;
    }
    drag.current.moved = true;
    const previewLength = Math.max(1, drag.current.end - drag.current.row + 1);
    if (drag.current.row !== previousRow || drag.current.note !== previousPitch || previewLength !== previousLength) {
      props.onPreviewNote(drag.current.note, instrument, previewLength);
    }
    setDragPreview({ row: drag.current.row, note: drag.current.note, length: Math.max(1, drag.current.end - drag.current.row + 1), old: drag.current.old, resize: drag.current.resize });
  };
  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (props.playing) {
      gridPan.current = null;
      drag.current = null;
      setGridPanning(false);
      setDragPreview(null);
      return;
    }
    if (gridPan.current?.pointerId === event.pointerId) {
      gridPan.current = null;
      setGridPanning(false);
      return;
    }
    if (selectionDrag.current) {
      if (selectionDrag.current.mode === 'erase') {
        const targets = selectionDrag.current.targets ?? [];
        if (event.type !== 'pointercancel' && targets.length) {
          if (selectionDrag.current.moved) props.onEraseNoteRanges(targets.map(item => ({ row: item.row, start: item.start, end: item.end, channel: selectedChannel, patternIndex: item.patternIndex })));
          else props.onDeleteNotes(targets.map(item => ({ row: item.row, channel: selectedChannel, patternIndex: item.patternIndex })));
          props.onOrderChange(selectionDrag.current.orderIndex ?? selectedOrder);
          props.onPatternChange(selectionDrag.current.patternIndex);
          setSelectedNote(null); setSelectedNotes([]); selectionAnchor.current = null;
        }
        selectionDrag.current = null;
        setEraseTargets([]);
        setSelectionBox(null);
        return;
      }
      if (!selectionDrag.current.moved) { setSelectedNote(null); setSelectedNotes([]); selectionAnchor.current = null; }
      selectionDrag.current = null;
      setSelectionBox(null);
      return;
    }
    const current = drag.current;
    drag.current = null;
    setDragPreview(null);
    setRollGroupPreview([]);
    if (!current) return;
    if (current.group) {
      if (!current.moved) return;
      const deltaRow = current.row - (current.originRow ?? current.row);
      const deltaNote = current.note - (current.originNote ?? current.note);
      const moved = current.group.map(item => ({ ...item, start: item.oldRow + deltaRow, note: item.oldNote + deltaNote }));
      if (moved.some(item => item.start < current.patternStart! || item.start + item.length > current.patternEnd! || item.note < 1 || item.note > 96)) {
        message.warning(t('music.tracker.moveCollision'));
        return;
      }
      props.onEditNotes(moved.map(item => ({ oldRow: item.oldRow, oldNote: item.oldNote, start: item.start, end: item.start + item.length, note: item.note, channel: selectedChannel, instrument: item.instrument })));
      const nextSelection = moved.map(item => ({ row: item.start, note: item.note }));
      setSelectedNotes(nextSelection);
      setSelectedNote(nextSelection[0] ?? null);
      selectionAnchor.current = nextSelection[0] ?? null;
      return;
    }
    const length = Math.max(1, current.end - current.row + 1);
    setNoteLength(length);
    const segment = view === 'roll' ? timelineSegments.find(item => item.patternIndex === current.patternIndex && item.start === current.patternStart) : undefined;
    const segmentStart = segment?.start ?? current.patternStart ?? 0;
    const segmentLength = segment ? segment.end - segment.start : current.patternEnd ?? patternRowCount;
    const localStart = current.row - segmentStart;
    const localEnd = Math.min(segmentLength, current.end + 1 - segmentStart);
     if (segment) { props.onOrderChange(segment.orderIndex); props.onPatternChange(segment.patternIndex); }
    if (current.old) {
      if (current.moved) {
        props.onEditNote(current.old.row, current.old.note, localStart, localEnd, current.note, selectedChannel, instrument, current.patternIndex);
        const item = { row: localStart, note: current.note };
        setSelectedNote(item);
        setSelectedNotes([item]);
        selectionAnchor.current = item;
      } else {
         if (!segment) {
           if (current.orderIndex !== undefined) props.onOrderChange(current.orderIndex);
           if (current.patternIndex !== undefined) props.onPatternChange(current.patternIndex);
         }
        selectNote({ row: current.old.row, note: current.old.note }, {
          shiftKey: current.shiftKey ?? false,
          ctrlKey: current.ctrlKey ?? false,
          metaKey: current.metaKey ?? false,
        }, current.patternIndex ?? pattern);
      }
    } else { onNote(localStart, localEnd, current.note, selectedChannel, instrument, current.patternIndex, false); const item = { row: localStart, note: current.note }; setSelectedNote(item); setSelectedNotes([item]); selectionAnchor.current = item; }
  };
  const beginNoteDrag = (target: HTMLButtonElement, pointerId: number, clientX: number, clientY: number, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, item: { row: number; timelineRow?: number; note: number; instrument: number; length: number; patternRow?: number; patternIndex?: number; orderIndex?: number }) => {
    const grid = target.closest('.gba-beat-grid');
    if (!grid || !target.isConnected) return;
    const rect = grid.getBoundingClientRect();
    const time = Math.max(0, Math.min(rowCount - 1, Math.floor((clientX - rect.left) / gridWidth)));
    const pitch = fitScalePitch(Math.max(BOTTOM_PITCH, Math.min(TOP_PITCH, TOP_PITCH - Math.floor((clientY - rect.top) / cellHeight))));
    const segment = view === 'roll' ? timelineSegments.find(candidate => candidate.orderIndex === item.orderIndex) : undefined;
    const noteRect = target.getBoundingClientRect();
    const resizeEdge = clientX >= noteRect.right - 5 ? 'right' as const : clientX <= noteRect.left + 5 ? 'left' as const : undefined;
    const resize = resizeEdge !== undefined;
    const timelineRow = item.timelineRow ?? item.row;
    const patternIndex = segment?.patternIndex ?? item.patternIndex ?? pattern;
    const patternStart = segment?.start ?? 0;
    const patternEnd = segment?.end ?? patternRowCount;
    const oldRow = item.patternRow ?? item.row;
    setInspectorLengthPreview(null);
    const group = !resize && trackerTool === 'select' && selectedNotes.length > 1 && selectedNotes.some(note => note.row === oldRow && note.note === item.note)
      ? selectedNotes.map(findExistingNote).filter((note): note is (typeof existingNotes)[number] => Boolean(note) && (note.orderIndex === undefined || note.orderIndex === selectedOrder)).map(note => ({
        oldRow: note.patternRow ?? note.row, oldNote: note.note, row: note.timelineRow ?? note.row, note: note.note, length: note.length,
        instrument: note.instrument || instrument, patternIndex: note.patternIndex ?? patternIndex, patternStart, patternEnd,
      })) : undefined;
    const grabOffsetRows = Math.max(0, Math.min(item.length - 1, time - timelineRow));
    drag.current = { row: timelineRow, note: item.note, end: timelineRow + item.length - 1, old: { row: oldRow, note: item.note }, length: item.length, resize, resizeEdge, moved: false, patternIndex, patternStart, patternEnd, orderIndex: item.orderIndex, ...modifiers, group, originRow: time, originNote: pitch, grabOffsetRows };
    setInstrument(item.instrument || 1);
    setNoteLength(item.length);
    target.setPointerCapture(pointerId);
    suppressRollNoteClick.current = true;
    if (!resize) { drag.current.row = timelineRow; drag.current.note = item.note; }
    if (group?.length) {
      setDragPreview(null);
      setRollGroupPreview(group.map(note => ({ row: note.row, note: note.note, length: note.length, instrument: note.instrument })));
    } else {
      setRollGroupPreview([]);
      setDragPreview({ row: drag.current.row, note: drag.current.note, length: drag.current.length, old: drag.current.old, resize });
      props.onPreviewNote(item.note, item.instrument || instrument, item.length);
    }
  };
  const startNotePointer = (event: React.PointerEvent<HTMLButtonElement>, item: { row: number; timelineRow?: number; note: number; instrument: number; length: number; patternRow?: number; patternIndex?: number; orderIndex?: number }) => {
    if (pendingPaste.current && event.button === 0 && !props.playing) {
      event.preventDefault();
      event.stopPropagation();
      positionPasteAtPointer(event.clientX, event.clientY);
      suppressRollNoteClick.current = true;
      placePastedNotes();
      return;
    }
    if (trackerTool === 'eraser') {
      event.preventDefault(); event.stopPropagation();
      const grid = event.currentTarget.closest<HTMLElement>('.gba-beat-grid');
      if (!props.playing && event.button === 0 && grid) beginEraseSelection(grid, event.pointerId, event.clientX, event.clientY, item);
      return;
    }
    if (props.playing || event.button !== 0) return;
    event.stopPropagation();
    cancelPendingNoteHold();
    const target = event.currentTarget;
    const { pointerId, clientX, clientY, shiftKey, ctrlKey, metaKey } = event;
    const noteRect = target.getBoundingClientRect();
    if (clientX >= noteRect.right - 5 || clientX <= noteRect.left + 5) {
      event.preventDefault();
      beginNoteDrag(target, pointerId, clientX, clientY, { shiftKey, ctrlKey, metaKey }, item);
      return;
    }
    const timer = window.setTimeout(() => {
      if (pendingNoteHold.current?.pointerId !== pointerId) return;
      pendingNoteHold.current = null;
      beginNoteDrag(target, pointerId, clientX, clientY, { shiftKey, ctrlKey, metaKey }, item);
    }, 100);
    pendingNoteHold.current = { pointerId, startX: clientX, startY: clientY, target, timer };
  };
  const dragOrderOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('application/x-gba-studio-music-order') || draggedOrderIndex === null || props.playing || !capabilities.patternOrder) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const cards = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.gba-order-item:not(.dragging):not(.gba-order-drag-image) .gba-order-card'));
    const before = cards.findIndex(card => { const rect = card.getBoundingClientRect(); return event.clientX < rect.left + rect.width / 2; });
    setOrderDropIndex(before < 0 ? cards.length : before);
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.clientX < rect.left + 28) event.currentTarget.scrollLeft -= 10;
    else if (event.clientX > rect.right - 28) event.currentTarget.scrollLeft += 10;
  };
  const dropOrder = (event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('application/x-gba-studio-music-order')) return;
    event.preventDefault();
    event.stopPropagation();
    const from = draggedOrderIndex ?? Number(event.dataTransfer.getData('application/x-gba-studio-music-order'));
    const to = orderDropIndex ?? from;
    if (!props.playing && capabilities.patternOrder && Number.isInteger(from) && from >= 0 && from < order.length && to >= 0 && to < order.length && from !== to) props.onReorderOrder(from, to);
    setDraggedOrderIndex(null);
    setOrderDropIndex(null);
  };
  const startTrackerGroupMove = (event: React.PointerEvent<HTMLButtonElement>, row: number, note: number) => {
    if (trackerTool !== 'select' || selectedNotes.length < 2 || !selectedNotes.some(item => item.row === row && item.note === note)) return;
    const notes = selectedNotes.map(findExistingNote).filter((item): item is (typeof existingNotes)[number] => Boolean(item))
      .map(item => ({ row: item.patternRow ?? item.row, note: item.note, length: item.length, instrument: item.instrument || instrument }));
    if (notes.length < 2) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    trackerGroupDrag.current = { pointerId: event.pointerId, startRow: row, notes, moved: false };
  };
  const moveTrackerGroup = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = trackerGroupDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-tracker-row]');
    if (!target) return;
    const row = Number(target.dataset.trackerRow);
    if (!Number.isInteger(row)) return;
    const delta = row - current.startRow;
    if (delta === 0) return;
    current.moved = true;
    setTrackerGroupPreview(current.notes.map(item => ({ row: item.row + delta, note: item.note })));
  };
  const finishTrackerGroupMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = trackerGroupDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    trackerGroupDrag.current = null;
    setTrackerGroupPreview([]);
    if (event.type === 'pointercancel') return;
    if (!current.moved) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-tracker-row]');
    const targetRow = Number(target?.dataset.trackerRow);
    if (!Number.isInteger(targetRow)) return;
    const delta = targetRow - current.startRow;
    if (delta === 0) return;
    const moved = current.notes.map(item => ({ ...item, start: item.row + delta }));
    suppressTrackerCellClick.current = true;
    window.setTimeout(() => { suppressTrackerCellClick.current = false; }, 0);
    if (moved.some(item => item.start < 0 || item.start + item.length > patternRowCount)) {
      message.warning(t('music.tracker.moveCollision'));
      return;
    }
    const edits = moved.map(item => ({ oldRow: item.row, oldNote: item.note, start: item.start, end: item.start + item.length, note: item.note, channel: selectedChannel, instrument: item.instrument }));
    props.onEditNotes(edits);
    const nextSelection = moved.map(item => ({ row: item.start, note: item.note }));
    setSelectedNotes(nextSelection);
    setSelectedNote(nextSelection[0] ?? null);
    selectionAnchor.current = nextSelection[0] ?? null;
  };
  const movePlayheadToPointer = (clientX: number) => {
    if (props.playing) return;
    const grid = pianoRollScroll.current?.querySelector<HTMLElement>('.gba-beat-grid');
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    setCursorRow(Math.floor((clientX - rect.left) / gridWidth));
  };
  const removeSelected = () => {
    if (view === 'keyboard') props.onDeleteNotes((selectedNotes.length ? selectedNotes : selectedNote ? [selectedNote] : []).map(note => ({ row: note.row, channel: selectedChannel, patternIndex: pattern })), true);
    else if (selectedNotes.length === 0 && selectedNote) props.onDelete(selectedNote.row, selectedChannel);
    else if (selectedNotes.length) props.onDeleteNotes(selectedNotes.map(note => ({ row: note.row, channel: selectedChannel })));
    setSelectedNote(null);
    setSelectedNotes([]);
    selectionAnchor.current = null;
  };
  useEffect(() => {
    const handleGlobalDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (props.playing || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,[contenteditable="true"],[role="textbox"]')) return;
      if (fxCommandRef.current?.('delete')) { event.preventDefault(); event.stopPropagation(); return; }
      if (!selectedNote && selectedNotes.length === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      removeSelected();
    };
    window.addEventListener('keydown', handleGlobalDelete, true);
    return () => window.removeEventListener('keydown', handleGlobalDelete, true);
  }, [selectedNote, selectedNotes, view, selectedChannel, pattern, props.playing, props.onDeleteNotes, props.onDelete]);
  useEffect(() => {
    const selectChannelShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const match = /^F(\d{1,2})$/.exec(event.key);
      if (!match) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="dialog"],.ant-select-dropdown')) return;
      if (drag.current || selectionDrag.current || gridPan.current || props.playing) return;
      const channel = Number(match[1]) - 1;
      if (channel < 0 || channel >= info.channels) return;
      event.preventDefault();
      props.onChannelChange(channel);
      setSelectedNote(null);
      setSelectedNotes([]);
      selectionAnchor.current = null;
    };
    window.addEventListener('keydown', selectChannelShortcut);
    return () => window.removeEventListener('keydown', selectChannelShortcut);
  }, [info.channels, props.onChannelChange, props.playing]);
  useEffect(() => {
    const selectTool = (event: KeyboardEvent) => {
      if (view !== 'roll' || event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const tool = ({ '1': 'pencil', '2': 'eraser', '3': 'select' } as const)[event.key as '1' | '2' | '3'];
      if (!tool) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"],[role="dialog"],.ant-select-dropdown')) return;
      if (drag.current || selectionDrag.current || gridPan.current) return;
      event.preventDefault();
      pendingPaste.current = null;
      setRollGroupPreview([]);
      setTrackerTool(tool);
    };
    window.addEventListener('keydown', selectTool);
    return () => window.removeEventListener('keydown', selectTool);
  }, [view]);
  useEffect(() => {
    setSelectedNote(null);
    setSelectedNotes([]);
    pendingPaste.current = null;
    setRollGroupPreview([]);
    selectionAnchor.current = null;
  }, [props.filename, format]);
  useEffect(() => {
    const cancelPaste = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !pendingPaste.current && selectionDrag.current?.mode !== 'erase') return;
      event.preventDefault();
      event.stopPropagation();
      pendingPaste.current = null;
      setRollGroupPreview([]);
      if (selectionDrag.current?.mode === 'erase') {
        selectionDrag.current = null;
        setEraseTargets([]);
        setSelectionBox(null);
      }
    };
    window.addEventListener('keydown', cancelPaste, true);
    return () => window.removeEventListener('keydown', cancelPaste, true);
  }, []);
  useEffect(() => {
    pendingPaste.current = null;
    setRollGroupPreview([]);
    selectionDrag.current = null;
    setEraseTargets([]);
    setSelectionBox(null);
  }, [selectedChannel, view, props.playing]);
  const cutSelected = () => {
    if (!selectedNote && selectedNotes.length === 0) return;
    copySelected();
    removeSelected();
  };
  const copySelected = () => {
    const selection = selectedNotes.length ? selectedNotes : selectedNote ? [selectedNote] : [];
    const items = selection.map(findExistingNote).filter((item): item is (typeof existingNotes)[number] => Boolean(item));
    if (!items.length) return;
    const first = items.reduce((best, item) => item.row < best.row ? item : best);
    copyMusicNotes({ baseNote: first.note, notes: items.map(item => ({ rowOffset: item.row - first.row, noteDelta: item.note - first.note, instrument: item.instrument || instrument, length: item.length })) });
  };
  const updatePastePlacement = (row: number, note: number) => {
    const pending = pendingPaste.current;
    if (!pending) return;
    const segment = playMode === 'song' ? segmentAtRow(row) ?? selectedTimelineSegment : undefined;
    const start = segment?.start ?? 0;
    const end = segment?.end ?? patternRowCount;
    const span = Math.max(...pending.clipboard.notes.map(item => item.rowOffset + item.length));
    const minDelta = Math.min(...pending.clipboard.notes.map(item => item.noteDelta));
    const maxDelta = Math.max(...pending.clipboard.notes.map(item => item.noteDelta));
    pending.row = Math.max(start, Math.min(Math.max(start, end - span), row));
    pending.note = Math.max(BOTTOM_PITCH - minDelta, Math.min(TOP_PITCH - maxDelta, fitScalePitch(note)));
    pending.patternIndex = segment?.patternIndex ?? pattern;
    pending.patternStart = start;
    pending.patternEnd = end;
    pending.orderIndex = segment?.orderIndex ?? selectedOrder;
    setRollGroupPreview(pending.clipboard.notes.map(item => ({ row: pending.row + item.rowOffset, note: pending.note + item.noteDelta, length: item.length, instrument: item.instrument })));
  };
  const positionPasteAtPointer = (clientX: number, clientY: number) => {
    const grid = pianoRollScroll.current?.querySelector<HTMLElement>('.gba-beat-grid');
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    updatePastePlacement(Math.max(0, Math.min(rowCount - 1, Math.floor((clientX - rect.left) / gridWidth))),
      Math.max(BOTTOM_PITCH, Math.min(TOP_PITCH, TOP_PITCH - Math.floor((clientY - rect.top) / cellHeight))));
  };
  const placePastedNotes = () => {
    const pending = pendingPaste.current;
    if (!pending) return;
    const notes = pending.clipboard.notes.map(item => ({ start: pending.row + item.rowOffset - pending.patternStart,
      end: pending.row + item.rowOffset + item.length - pending.patternStart, note: pending.note + item.noteDelta,
      channel: selectedChannel, instrument: item.instrument, patternIndex: pending.patternIndex }));
    if (notes.some(item => item.start < 0 || item.end > pending.patternEnd - pending.patternStart || item.note < BOTTOM_PITCH || item.note > TOP_PITCH)) {
      message.warning(t('music.tracker.moveCollision'));
      return;
    }
    pendingPaste.current = null;
    setRollGroupPreview([]);
    props.onCreateNotes(notes);
    props.onOrderChange(pending.orderIndex);
    props.onPatternChange(pending.patternIndex);
    const selection = notes.map(item => ({ row: item.start, note: item.note }));
    setSelectedNotes(selection);
    setSelectedNote(selection[0] ?? null);
    selectionAnchor.current = selection[0] ?? null;
    if (notes[0]) { setInstrument(notes[0].instrument); setNoteLength(notes[0].end - notes[0].start); }
  };
  const pasteNote = (copied: MusicNoteClipboard | null = noteClipboard) => {
    if (props.playing || !copied?.notes.length) return;
    const clipboard = { ...copied, notes: copied.notes.map(item => ({ ...item, instrument: item.instrument <= Math.max(1, trackerSlotCount) ? item.instrument : Math.max(1, Math.min(instrument, trackerSlotCount || 1)) })) };
    if (!clipboard?.notes.length) return;
    if (view === 'roll') {
      if (props.playing || drag.current || selectionDrag.current) return;
      setTrackerTool('select');
      setInspectorLengthPreview(null);
      pendingPaste.current = { clipboard: clipboard, row: 0, note: clipboard.baseNote, patternIndex: pattern,
        patternStart: selectedTimelineSegment?.start ?? 0, patternEnd: selectedTimelineSegment?.end ?? patternRowCount, orderIndex: selectedOrder };
      const scroll = pianoRollScroll.current;
      const row = rollHover?.row ?? (scroll ? Math.floor((scroll.scrollLeft + scroll.clientWidth / 2) / gridWidth) : playhead);
      const pitch = rollHover?.note ?? (scroll ? TOP_PITCH - Math.floor((scroll.scrollTop + scroll.clientHeight / 2) / cellHeight) : clipboard.baseNote);
      updatePastePlacement(row, pitch);
      return;
    }
    const start = Math.max(0, Math.min(patternRowCount - 1, localPlayhead));
    const occupied = new Set(patternRows.flatMap((row, index) => {
      const event = row[selectedChannel];
      return event && (event.note || event.instrument || event.volume || event.effect || event.parameter) ? [index] : [];
    }));
    let lastRow = -1;
    let adjusted = false;
    const pasted = clipboard.notes.flatMap(item => {
      const desired = start + item.rowOffset;
      if (desired >= patternRowCount) { adjusted = true; return []; }
      let row: number | undefined = desired;
      if (row <= lastRow || occupied.has(row)) {
        adjusted = true;
        row = Array.from({ length: patternRowCount }, (_, index) => Math.max(desired, lastRow + 1) + index).find(candidate => candidate < patternRowCount && !occupied.has(candidate))
          ?? Array.from({ length: patternRowCount }, (_, index) => index).find(candidate => candidate > lastRow && !occupied.has(candidate));
      }
      if (row === undefined) return [];
      occupied.add(row);
      lastRow = row;
      return [{ row, note: fitScalePitch(Math.max(1, Math.min(96, clipboard.baseNote + item.noteDelta))), instrument: item.instrument, length: Math.min(item.length, patternRowCount - row) }];
    });
    const orderedPaste = [...pasted].sort((a, b) => a.row - b.row);
    props.onCreateNotes(orderedPaste.map((item, index) => {
      const nextRow = orderedPaste[index + 1]?.row ?? existingNotes.find(existing => existing.row > item.row)?.row;
      return { start: item.row, end: Math.min(item.row + item.length, nextRow ?? patternRowCount), note: item.note, channel: selectedChannel, instrument: item.instrument };
    }));
    if (adjusted) message.warning(t('music.warning.pasteAdjusted'));
    const nextSelection = orderedPaste.map(({ row, note }) => ({ row, note }));
    setSelectedNotes(nextSelection);
    setSelectedNote(nextSelection[0] ?? null);
    selectionAnchor.current = nextSelection[0] ?? null;
    if (orderedPaste[0]) setInstrument(orderedPaste[0].instrument);
    const lastEnd = Math.max(start + 1, ...orderedPaste.map(item => item.row + item.length));
    setCursorRow(lastEnd % patternRowCount, false);
  };
  clipboardPaste.current = pasteNote;
  const requestPasteNotes = () => {
    const request = ++pasteRequest.current;
    void readMusicNotes().then(value => {
      if (clipboardEditorMounted.current && request === pasteRequest.current) clipboardPaste.current?.(value);
    });
  };
  const duplicateSelected = () => {
    const selection = selectedNotes.length ? selectedNotes : selectedNote ? [selectedNote] : [];
    const items = selection.map(findExistingNote).filter((item): item is (typeof existingNotes)[number] => Boolean(item));
    if (!items.length) { props.onDuplicatePattern(); return; }
    const base = Math.min(...items.map(item => item.row));
    const occupied = new Set<number>();
    for (const note of existingNotes) for (let row = note.row; row < note.row + note.length; row += 1) occupied.add(row);
    const lastOffset = Math.max(...items.map(item => item.row + item.length - base));
    let destination = Math.max(...items.map(item => item.row + item.length));
    while (destination + lastOffset <= patternRowCount && items.some(item => Array.from({ length: item.length }, (_, offset) => destination + item.row - base + offset).some(row => occupied.has(row)))) destination += 1;
    if (destination + lastOffset > patternRowCount) { message.warning(t('music.warning.noDuplicateSpace')); return; }
    const duplicates = items.map(item => ({ row: destination + item.row - base, note: item.note, instrument: item.instrument || instrument, length: item.length }));
    props.onCreateNotes(duplicates.map(item => ({ start: item.row, end: Math.min(patternRowCount, item.row + item.length), note: item.note, channel: selectedChannel, instrument: item.instrument })));
    const nextSelection = duplicates.map(({ row, note }) => ({ row, note }));
    setSelectedNotes(nextSelection);
    setSelectedNote(nextSelection[0] ?? null);
    selectionAnchor.current = nextSelection[0] ?? null;
    setCursorRow((selectedTimelineSegment?.start ?? 0) + (nextSelection[0]?.row ?? 0));
  };
  musicCommandRef.current = command => {
    if (fxCommandRef.current?.(command)) return;
    if (command === 'copy') copySelected();
    else if (command === 'cut') cutSelected();
    else if (command === 'paste') requestPasteNotes();
    else if (command === 'duplicate') duplicateSelected();
  };
  useEffect(() => {
    const handleMusicCommand = (event: Event) => {
      const command = (event as CustomEvent<{ command?: string }>).detail?.command;
      if (command) musicCommandRef.current(command);
    };
    window.addEventListener('gba-studio:gba-editor-command', handleMusicCommand);
    return () => window.removeEventListener('gba-studio:gba-editor-command', handleMusicCommand);
  }, []);
  useEffect(() => {
    const track = document.querySelector<HTMLElement>('[data-editor-history="music"] .gba-beat-order-track');
    if (!track) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      track.setPointerCapture(event.pointerId);
      orderPan.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: track.scrollLeft };
    };
    const onPointerMove = (event: PointerEvent) => {
      const pan = orderPan.current;
      if (pan?.pointerId === event.pointerId) track.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    };
    const onPointerUp = (event: PointerEvent) => {
      if (orderPan.current?.pointerId !== event.pointerId) return;
      orderPan.current = null;
      if (track.hasPointerCapture(event.pointerId)) track.releasePointerCapture(event.pointerId);
    };
    track.addEventListener('pointerdown', onPointerDown);
    track.addEventListener('pointermove', onPointerMove);
    track.addEventListener('pointerup', onPointerUp);
    track.addEventListener('pointercancel', onPointerUp);
    return () => {
      track.removeEventListener('pointerdown', onPointerDown);
      track.removeEventListener('pointermove', onPointerMove);
      track.removeEventListener('pointerup', onPointerUp);
      track.removeEventListener('pointercancel', onPointerUp);
    };
  }, [order.length]);
  const quantizeSelected = () => {
    const selection = selectedNotes.length ? selectedNotes : selectedNote ? [selectedNote] : [];
    const items = selection.map(findExistingNote).filter((item): item is (typeof existingNotes)[number] => Boolean(item)).sort((a, b) => a.row - b.row);
    if (!items.length) return;
    const quantum = Math.max(1, noteLength);
    const selectedKeys = new Set(items.map(noteKey));
    const selectedNoteOffRows = new Set(items.map(item => item.row + item.length).filter(row => row < patternRowCount));
    const occupied = new Set(patternRows.flatMap((row, rowIndex) => {
      const event = row[selectedChannel];
      if (!event || !(event.note || event.instrument || event.volume || event.effect || event.parameter)) return [];
      if (event.note > 0 && event.note < 97 && selectedKeys.has(noteKey({ row: rowIndex, note: event.note }))) return [];
      if (event.note === 97 && selectedNoteOffRows.has(rowIndex)) return [];
      return [rowIndex];
    }));
    let shiftedToAvoidCollision = false;
    const placements = items.map(item => {
      const desired = Math.max(0, Math.min(patternRowCount - 1, Math.round(item.row / quantum) * quantum));
      const gridCandidates = Array.from({ length: patternRowCount }, (_, row) => row).filter(row => row % quantum === 0).sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b);
      const freeGrid = gridCandidates.find(row => !occupied.has(row));
      const start = freeGrid ?? Array.from({ length: patternRowCount }, (_, row) => row).sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b).find(row => !occupied.has(row));
      if (start === undefined) return { item, start: item.row };
      if (start !== desired) shiftedToAvoidCollision = true;
      occupied.add(start);
      return { item, start };
    });
    const orderedPlacements = [...placements].sort((a, b) => a.start - b.start);
    const edits = placements.map(({ item, start }) => {
      const quantizedLength = Math.max(1, Math.min(patternRowCount - start, Math.round(item.length / quantum) * quantum || quantum));
      const nextStart = orderedPlacements.find(placement => placement.start > start)?.start;
      const length = nextStart !== undefined && nextStart > start ? Math.min(quantizedLength, nextStart - start) : quantizedLength;
      return { oldRow: item.row, oldNote: item.note, start, end: start + length, note: item.note, channel: selectedChannel, instrument: item.instrument || instrument };
    });
    props.onEditNotes(edits.filter((edit, index) => edit.start !== items[index].row || edit.end - edit.start !== items[index].length));
    if (shiftedToAvoidCollision) message.warning(t('music.warning.notesShiftedChannel'));
    const nextSelection = edits.map(({ start, note }) => ({ row: start, note }));
    setSelectedNotes(nextSelection);
    setSelectedNote(nextSelection[0] ?? null);
    selectionAnchor.current = nextSelection[0] ?? null;
    setNoteLength(edits[0].end - edits[0].start);
  };
  const playMaxmodRom = async () => {
    setRomPreviewing(true);
    try {
      const result = await props.onPlayRom();
      if (result.status !== 'success') message.error(`${t('music.preview.romFailed')}${result.message ? ` ${result.message}` : ''}`);
    } catch (error) {
      message.error(`${t('music.preview.romFailed')} ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRomPreviewing(false);
    }
  };
  const chooseInstrument = (value: number) => {
    selectInstrument(value);
    if (selectedNote) props.onInstrumentChange(selectedNote.row, selectedChannel, value);
  };
  const selectedNoteEvent = selectedNote ? findExistingNote(selectedNote) : undefined;
  const selectedSample = props.samples.get(selectedNoteEvent?.instrument || instrument);
  const selectedSampleVolume = Math.max(0, Math.min(64, selectedSample?.volume ?? 64));
  const selectedVolumeFactor = format === 'MOD'
    ? selectedNoteEvent?.effect === 12 ? Math.max(0, Math.min(64, selectedNoteEvent.parameter)) / 64 : 1
    : format === 'XM'
      ? selectedNoteEvent?.volume !== undefined && selectedNoteEvent.volume >= 0x10 && selectedNoteEvent.volume <= 0x50 ? (selectedNoteEvent.volume - 0x10) / 0x40 : 1
      : selectedNoteEvent?.volumePresent && selectedNoteEvent.volume >= 0 && selectedNoteEvent.volume <= 64 ? selectedNoteEvent.volume / 64 : 1;
  const selectedVolume = selectedSampleVolume * selectedVolumeFactor;
  const noteHasPanEffect = Boolean(selectedNoteEvent && (
    format === 'XM' && selectedNoteEvent.effect === 8
    || (format === 'MOD' || format === 'XM') && selectedNoteEvent.effect === 14 && (selectedNoteEvent.parameter >> 4) === 8
    || (format === 'S3M' || format === 'IT') && selectedNoteEvent.effect === 19 && (selectedNoteEvent.parameter >> 4) === 8
    || format === 'IT' && selectedNoteEvent.effect === 24));
  const selectedPan = noteHasPanEffect && selectedNoteEvent
    ? decodeTrackerNotePan(format, selectedNoteEvent.effect, selectedNoteEvent.parameter)
    : Math.max(-1, Math.min(1, ((selectedSample?.panning ?? 128) - 128) / 128));
  const notePanEditable = !selectedNoteEvent || selectedNoteEvent.effect === 0 && selectedNoteEvent.parameter === 0
    || (format === 'XM' && selectedNoteEvent.effect === 8)
    || ((format === 'MOD' || format === 'XM') && selectedNoteEvent.effect === 14 && (selectedNoteEvent.parameter >> 4) === 8)
    || (format === 'S3M' && selectedNoteEvent.effect === 19 && (selectedNoteEvent.parameter >> 4) === 8)
    || (format === 'IT' && selectedNoteEvent.effect === 24)
    || (format === 'IT' && selectedNoteEvent.effect === 19 && (selectedNoteEvent.parameter >> 4) === 8);
  const displayedVolume = Math.round(selectedVolume / 64 * 100);
  const encodeInspectorNoteVolume = (effectivePercent: number) => {
    const relative = selectedSampleVolume > 0 ? Math.max(0, Math.min(1, (effectivePercent / 100 * 64) / selectedSampleVolume)) : 0;
    return 0x10 + Math.round(relative * 0x40);
  };
  useEffect(() => {
    const note = selectedNote ? findExistingNote(selectedNote) : undefined;
    props.onSelectionChange?.(selectedNote ? {
      row: selectedNote.row,
      note: selectedNote.note,
      length: note?.length ?? noteLength,
      instrument: note?.instrument || instrument,
      volume: displayedVolume,
      pan: selectedPan,
      effect: note?.effect ?? 0,
      parameter: note?.parameter ?? 0,
      count: Math.max(1, selectedNotes.length),
      minNote: Math.min(...(selectedNotes.length ? selectedNotes : [selectedNote]).map(item => item.note)),
      maxNote: Math.max(...(selectedNotes.length ? selectedNotes : [selectedNote]).map(item => item.note)),
      panEditable: !note || note.effect === 0 && note.parameter === 0 || (format === 'XM' && note.effect === 8)
        || ((format === 'MOD' || format === 'XM') && note.effect === 14 && (note.parameter >> 4) === 8)
        || (format === 'S3M' && note.effect === 19 && (note.parameter >> 4) === 8)
        || (format === 'IT' && note.effect === 24)
        || (format === 'IT' && note.effect === 19 && (note.parameter >> 4) === 8),
    } : null);
  }, [displayedVolume, existingNotes, instrument, noteLength, props.onSelectionChange, selectedNote, selectedNotes, selectedPan]);
  const updateSelected = (start: number, length: number, note: number) => {
    if (!selectedNote) return;
    const source = findExistingNote(selectedNote);
    const next = { row: Math.max(0, Math.min(patternRowCount - 1, start)), note: fitScalePitch(Math.max(1, Math.min(96, note))) };
    const duration = Math.max(1, Math.min(patternRowCount - next.row, length));
    props.onEditNote(selectedNote.row, selectedNote.note, next.row, next.row + duration, next.note, selectedChannel, source?.instrument || instrument, source?.patternIndex ?? pattern);
    setSelectedNote(next);
    setSelectedNotes([next]);
    selectionAnchor.current = next;
    setNoteLength(duration);
  };
  useEffect(() => {
    const editFromInspector = (event: Event) => {
      const detail = (event as CustomEvent<{ row?: number; length?: number; note?: number; transpose?: number; instrument?: number; volume?: number; pan?: number; effect?: number; parameter?: number }>).detail;
      if (!selectedNote || !detail) return;
      const common = detail.note !== undefined || detail.transpose !== undefined || detail.instrument !== undefined || detail.volume !== undefined || detail.pan !== undefined || detail.effect !== undefined || detail.parameter !== undefined;
      if (common) {
        const targets = (selectedNotes.length ? selectedNotes : [selectedNote]).flatMap(item => {
          const source = findExistingNote(item);
          return source ? [{ ...item, instrument: source.instrument || instrument, channel: selectedChannel, patternIndex: source.patternIndex }] : [];
        });
        if (!targets.length) return;
        const requested = detail.transpose ?? (detail.note === undefined ? 0 : detail.note - selectedNote.note);
        const transpose = Math.max(1 - Math.min(...targets.map(item => item.note)), Math.min(96 - Math.max(...targets.map(item => item.note)), requested));
        if (props.onEditNoteProperties(targets, { transpose, instrument: detail.instrument, volume: detail.volume, pan: detail.pan, effect: detail.effect, parameter: detail.parameter })) {
          if (transpose) {
            setSelectedNote({ ...selectedNote, note: selectedNote.note + transpose });
            setSelectedNotes(targets.map(item => ({ row: item.row, note: item.note + transpose })));
            selectionAnchor.current = { ...selectedNote, note: selectedNote.note + transpose };
          }
          if (detail.instrument !== undefined) setInstrument(detail.instrument);
        }
        return;
      }
      const nextRow = detail.row === undefined ? selectedNote.row : Math.max(0, Math.min(patternRowCount - 1, detail.row));
      const nextLength = detail.length === undefined ? noteLength : Math.max(1, Math.min(patternRowCount - nextRow, detail.length));
      const nextNote = detail.note === undefined ? selectedNote.note : Math.max(1, Math.min(96, detail.note));
      if (detail.row !== undefined || detail.length !== undefined || detail.note !== undefined) updateSelected(nextRow, nextLength, nextNote);
      if (detail.instrument !== undefined) {
        const nextInstrument = Math.max(1, Math.min(trackerSlotCount, detail.instrument));
        setInstrument(nextInstrument);
        props.onPreviewNote(49, nextInstrument);
        props.onInstrumentChange(nextRow, selectedChannel, nextInstrument);
      }
      if (detail.volume !== undefined) props.onNoteVolumeChange(nextRow, selectedChannel, 0x10 + Math.round((Math.max(0, Math.min(100, detail.volume)) / 100) * 0x40));
      if (detail.pan !== undefined) props.onNotePanChange(nextRow, selectedChannel, quantizeTrackerNotePan(detail.pan));
    };
    window.addEventListener('gba-studio:music-editor-edit-note', editFromInspector);
    return () => window.removeEventListener('gba-studio:music-editor-edit-note', editFromInspector);
  }, [trackerSlotCount, noteLength, patternRowCount, props, selectedChannel, selectedNote, selectedNotes]);
  useEffect(() => {
    const previewInspectorLength = (event: Event) => {
      const detail = (event as CustomEvent<{ length?: number; clear?: boolean }>).detail;
      if (detail?.clear || !selectedNote || !Number.isFinite(detail?.length)) {
        setInspectorLengthPreview(null);
        return;
      }
      const length = Math.max(1, Math.min(patternRowCount - selectedNote.row, Math.trunc(detail.length!)));
      const timelineStart = view === 'roll' ? selectedTimelineSegment?.start ?? 0 : 0;
      setInspectorLengthPreview({ row: timelineStart + selectedNote.row, note: selectedNote.note, length, old: { row: selectedNote.row, note: selectedNote.note }, resize: true });
    };
    window.addEventListener('gba-studio:music-editor-preview-note-length', previewInspectorLength);
    return () => window.removeEventListener('gba-studio:music-editor-preview-note-length', previewInspectorLength);
  }, [patternRowCount, selectedNote, view, selectedTimelineSegment]);
  useEffect(() => {
    const previewInspectorPitch = (event: Event) => {
      const detail = (event as CustomEvent<{ note?: number; clear?: boolean }>).detail;
      if (detail?.clear || !selectedNote || !Number.isFinite(detail?.note)) { setRollGroupPreview([]); return; }
      const sources = (selectedNotes.length ? selectedNotes : [selectedNote]).map(findExistingNote).filter((note): note is (typeof existingNotes)[number] => Boolean(note));
      if (!sources.length) return;
      const delta = Math.max(1 - Math.min(...sources.map(note => note.note)), Math.min(96 - Math.max(...sources.map(note => note.note)), detail.note! - selectedNote.note));
      setRollGroupPreview(sources.map(note => ({ row: note.timelineRow ?? note.row, note: note.note + delta, length: note.length, instrument: note.instrument })));
    };
    window.addEventListener('gba-studio:music-editor-preview-note-pitch', previewInspectorPitch);
    return () => window.removeEventListener('gba-studio:music-editor-preview-note-pitch', previewInspectorPitch);
  }, [existingNotes, selectedNote, selectedNotes, selectedOrder]);
  const existingNoteRenderers = useRef({ instrumentColor, isNoteSelected, startNotePointer, handleExistingNoteClick, drag });
  existingNoteRenderers.current = { instrumentColor, isNoteSelected, startNotePointer, handleExistingNoteClick, drag };
  const fxPresence = useMemo(() => props.patternRowsByIndex.map(patternRows => trackerFxPresencePrefix(patternRows, selectedChannel)),
    [props.patternRowsByIndex, selectedChannel]);
  const existingNoteElements = useMemo(() => existingNotes.filter(item => !props.channelSettings?.[String(selectedChannel)]?.hidden && item.note >= BOTTOM_PITCH && item.note <= TOP_PITCH).map(item => {
    const source = dragPreview?.old?.row === (item.patternRow ?? item.row) && dragPreview.old.note === item.note
      || inspectorLengthPreview?.old.row === (item.patternRow ?? item.row) && inspectorLengthPreview.old.note === item.note && item.orderIndex === selectedOrder
      || Boolean(existingNoteRenderers.current.drag.current?.group?.some(note => note.row === (item.timelineRow ?? item.row) && note.oldNote === item.note));
    const itemStart = item.timelineRow ?? item.row;
    const destinations = rollGroupPreview.length ? rollGroupPreview : dragPreview ? [dragPreview] : inspectorLengthPreview ? [inspectorLengthPreview] : [];
    const erasing = eraseTargets.find(target => target.row === (item.patternRow ?? item.row) && target.note === item.note && target.orderIndex === item.orderIndex);
    const overwritten = erasing ? [{ start: itemStart + erasing.start - (item.patternRow ?? item.row), end: itemStart + erasing.end - (item.patternRow ?? item.row) }] : source ? [] : destinations.flatMap(destination => {
      const start = Math.max(itemStart, destination.row);
      const end = Math.min(itemStart + item.length, destination.row + destination.length);
      return end > start ? [{ start, end }] : [];
    });
    const fxCounts = fxPresence[item.patternIndex] ?? [0];
    const localStart = item.patternRow ?? item.row;
    const hasFx = (fxCounts[Math.min(fxCounts.length - 1, localStart + item.length)] ?? 0) > (fxCounts[localStart] ?? 0);
    return <button key={`${item.orderIndex}:${item.row}:${item.note}`} data-note="true" title={noteLabel(item.note) + " | song row " + ((item.timelineRow ?? item.row) + 1) + " | pattern row " + ((item.patternRow ?? item.row) + 1) + " | instrument " + item.instrument} className={"gba-beat-note " + (existingNoteRenderers.current.isNoteSelected(item) ? "selected " : "") + (source ? "note-preview-source " : "") + (overwritten.length ? "overwrite-target" : "")} style={{ left: (item.timelineRow ?? item.row) * gridWidth + 2, top: (TOP_PITCH - item.note) * cellHeight + 2, width: Math.max(16, (item.length * gridWidth) - 4), height: cellHeight - 4, background: existingNoteRenderers.current.instrumentColor(item.instrument || 1, selectedChannel) }} onPointerDown={event => existingNoteRenderers.current.startNotePointer(event, item)} onClick={event => existingNoteRenderers.current.handleExistingNoteClick(item, event)}>
      <span className="gba-note-label">{noteLabel(item.note)}</span>
      {hasFx && <span className="gba-note-fx-mark" role="img" aria-label={t('music.fx.noteHasEffects')}>{'\u2726'}</span>}
      {overwritten.map((part, index) => <span key={index} className="gba-note-overwrite-region" aria-hidden="true" style={{ left: `${(part.start - itemStart) / item.length * 100}%`, width: `${(part.end - part.start) / item.length * 100}%` }} />)}</button>;
  }), [t, fxPresence, props.channelSettings, existingNotes, dragPreview, inspectorLengthPreview, rollGroupPreview, eraseTargets, selectedNotes, selectedOrder, gridWidth, cellHeight, selectedChannel, instrumentColor]);
  const editorTheme = {
    '--music-surface-base': token.colorBgBase,
    '--music-surface': token.colorBgContainer,
    '--music-surface-raised': token.colorBgElevated,
    '--music-surface-muted': token.colorFillTertiary,
    '--music-surface-selected': token.colorPrimaryBg,
    '--music-border': token.colorBorderSecondary,
    '--music-border-strong': token.colorBorder,
    '--music-grid': `color-mix(in srgb, ${token.colorBorderSecondary} 48%, ${token.colorBgBase})`,
    '--music-grid-strong': token.colorBorder,
    '--music-text': token.colorText,
    '--music-text-secondary': token.colorTextSecondary,
    '--music-primary': token.colorPrimary,
    '--music-primary-hover': token.colorPrimaryHover,
    '--music-primary-text': token.colorTextLightSolid,
  } as React.CSSProperties;
  return <div className={`gba-beat-editor ${props.externalWorkspacePanels ? 'external-workspace-panels' : ''}`} style={editorTheme} aria-label="Music beat editor" data-editor-history="music">
    <header className="gba-beat-toolbar">
      <Flex className="gba-beat-toolbar-actions" align="center" gap={8} wrap="wrap">
        <SoundOutlined style={{ color: '#73d4bd' }} />
        <Typography.Text strong>{info.title || props.filename || 'Music track'}</Typography.Text>
        {props.onTargetChange ? <>
          <Tooltip title={t('music.toolbar.formatHint')}><span><Select size="small" className="gba-music-target-tag" variant="borderless" aria-label={t('music.target.label')} value={format} disabled={props.targetSwitching}
            onChange={value => props.onTargetChange?.(value as MusicExportTarget)} style={{ width: 'fit-content', minWidth: 0 }}
            labelRender={({ value }) => <Typography.Text style={{ cursor: props.targetSwitching ? 'default' : 'pointer' }}>{String(value)} · {info.channels} channels</Typography.Text>}
            virtual={false}
            options={(['MOD', 'XM', 'S3M', 'IT'] as const).map(target => ({ value: target, label: t(`music.create.${target.toLowerCase()}`) }))} /></span></Tooltip>
          {props.targetSwitching && <Typography.Text type="secondary">{t('music.target.switching')}</Typography.Text>}
        </> : <Typography.Text type="secondary">{format} · {info.channels} channels</Typography.Text>}

        <Tooltip title={t(props.playing ? 'music.toolbar.stopHint' : 'music.toolbar.previewHint')}><Button size="small" icon={props.playing ? <StopOutlined /> : <PlayCircleOutlined />} aria-label={t(props.playing ? 'music.preview.stop' : 'music.preview.quick')} onClick={() => {
          setPlayhead(playbackStart);
          const localView = view !== 'roll' && playMode === 'song';
          const start = playbackStart + (localView ? selectedTimelineSegment?.start ?? 0 : 0);
          props.onPlay(playMode, start, row => {
            const segment = previewView.current !== 'roll' && playMode === 'song' ? songTimelineSegments.find(segment => row >= segment.start && row < segment.end) : undefined;
            setPlayhead(row - (segment?.start ?? 0));
          });
        }}>{t(props.playing ? 'music.preview.stop' : 'music.preview.quick')}</Button></Tooltip>
        <Tooltip title={t(!capabilities.romPreview ? 'music.toolbar.romUnavailable' : 'music.toolbar.romHint', { format })}><span><Button aria-label={t('music.toolbar.romLabel')} size="small" disabled={!capabilities.romPreview} loading={romPreviewing} onClick={() => void playMaxmodRom()}>{t('music.toolbar.romLabel')}</Button></span></Tooltip>
        <Tooltip title={t('music.preview.loopHint')}><Flex align="center" gap={5}><Switch size="small" checked={previewLoop} onChange={enabled => { setPreviewLoop(enabled); props.onPreviewLoopChange(enabled); }} aria-label={t('music.preview.loop')} /><Typography.Text type="secondary">{t('music.preview.loop')}</Typography.Text></Flex></Tooltip>
        <Tooltip title={t('music.toolbar.saveHint')}><Button style={{ marginInlineStart: 'auto' }} aria-label={t('common.save')} size="small" icon={<SaveOutlined />} onClick={props.onSave}>{t('common.save')}</Button></Tooltip>
      </Flex>
      <Flex className="gba-beat-toolbar-settings" align="center" gap={8} wrap="wrap">
        <Segmented aria-label={t('music.toolbar.viewLabel')} size="small" value={view} onChange={value => {
          const nextView = value as 'roll' | 'keyboard' | 'tracker';
          if (playMode === 'song' && (view === 'roll') !== (nextView === 'roll')) {
            const offset = selectedTimelineSegment?.start ?? 0;
            const delta = nextView === 'roll' ? offset : -offset;
            setPlayhead(row => Math.max(0, row + delta)); setPlaybackStart(row => Math.max(0, row + delta));
          }
          setView(nextView); props.onViewChange?.(nextView);
        }} options={[{ label: <Tooltip title={t('music.toolbar.rollHint')}><span>Piano roll</span></Tooltip>, value: 'roll' }, { label: <Tooltip title={t('music.toolbar.keyboardHint')}><span>Keyboard</span></Tooltip>, value: 'keyboard' }, { label: <Tooltip title={t('music.toolbar.trackerHint')}><span>Tracker</span></Tooltip>, value: 'tracker' }]} />
        <Flex align="center" gap={8} style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: '3px 8px', background: token.colorBgBase }}>
          <Tooltip title={t('music.scale.rootHint')}><Select size="small" aria-label={t('music.scale.root')} value={scaleRoot} onChange={setScaleRoot} style={{ width: 70 }} options={noteNames.map((name, index) => ({ value: index, label: name }))} /></Tooltip>
          <Tooltip title={t('music.scale.modeHint')}><Select size="small" aria-label={t('music.scale.mode')} value={scaleMode} onChange={setScaleMode} style={{ width: 105 }} options={scaleNames.map((name, index) => ({ value: index, label: name }))} /></Tooltip>
          <Tooltip title={t('music.scale.snapHint')}><Flex align="center" gap={5}><Switch size="small" checked={snapToScale} onChange={setSnapToScale} aria-label={t('music.scale.snap')} /><Typography.Text type="secondary">{t('music.scale.snap')}</Typography.Text></Flex></Tooltip>
        </Flex>
      </Flex>
    </header>
    {props.diagnosticWarnings?.length ? <Flex className="gba-beat-diagnostics" gap={6} wrap="wrap" style={{ padding: '6px 12px' }} role="status" aria-label="Music compatibility warnings">
      {props.diagnosticWarnings.map(warning => <Tag key={warning} color="warning">{warning}</Tag>)}
    </Flex> : null}
    <div className="gba-beat-body">
      <aside className="gba-beat-sidebar">
        <nav className="gba-beat-tabs" aria-label="Music panels">
          {(['music', 'channels', 'instruments'] as const).map(tab => <button key={tab} className={activePanel === tab ? 'active' : ''} onClick={() => setActivePanel(tab)}>{tab.toUpperCase()}</button>)}
        </nav>
        {activePanel === 'music' && <div className="gba-beat-list"><Typography.Text type="secondary">MUSIC FILE</Typography.Text><div className="gba-beat-file">♫ <span>{props.filename ?? 'Untitled.xm'}</span></div><Typography.Text type="secondary">ORDER · {order.length} patterns</Typography.Text>{order.map((item, index) => <button key={index} disabled={props.playing} className={selectedOrder === index ? 'selected' : ''} onClick={() => selectOrder(index)}><b>{String(index + 1).padStart(2, '0')}</b> Pattern {item}</button>)}</div>}
        {activePanel === 'channels' && <div className="gba-beat-list"><Typography.Text type="secondary">CHANNELS</Typography.Text>{Array.from({ length: info.channels }, (_, channel) => <Tooltip key={channel} title={`${t('music.channels.defaultName', { number: channel + 1 })} (F${channel + 1})`}><button className={selectedChannel === channel ? 'selected' : ''} onClick={() => { props.onChannelChange(channel); setSelectedNote(null); setSelectedNotes([]); selectionAnchor.current = null; }}><i style={{ background: token.colorTextQuaternary }} /><kbd style={{ padding: '1px 4px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 3, color: token.colorTextSecondary, fontSize: 10 }}>F{channel + 1}</kbd> CH {String(channel + 1).padStart(2, '0')}<span>{patternRows.some(row => row[channel]?.note > 0 && row[channel]?.note < 97) ? '♫' : '·'}</span></button></Tooltip>)}</div>}
        {activePanel === 'instruments' && <div className="gba-beat-list">
          <Typography.Text type="secondary">INSTRUMENTS</Typography.Text>
          <Tooltip title={!capabilities.createInstrument ? `${format} does not support creating instruments in this editor.` : !props.onAddInstrument ? t('music.capabilities.scratchOnly') : trackerSlotCount >= (capabilities.maxInstruments ?? (props.instrumentCount !== undefined ? 128 : 16)) ? t('music.capabilities.maxInstruments') : ''}><span><Button size="small" icon={<PlusOutlined />} disabled={!capabilities.createInstrument || trackerSlotCount >= (capabilities.maxInstruments ?? (props.instrumentCount !== undefined ? 128 : 16)) || !props.onAddInstrument} onClick={() => { props.onAddInstrument?.(); setInstrument(Math.min(props.instrumentCount !== undefined ? 128 : 16, trackerSlotCount + 1)); }}>Add instrument</Button></span></Tooltip>
          <>
            <Tooltip title={!capabilities.importWavSample ? t('music.capabilities.sampleImportUnsupported', { format }) : !props.onImportSample ? t('music.capabilities.scratchOnly') : ''}><span><Button size="small" disabled={!capabilities.importWavSample || !props.onImportSample} onClick={() => { setSampleImportAsVariant(false); sampleImportInput.current?.click(); }}>{t('music.instruments.replaceSampleAudio')}</Button></span></Tooltip>
            <Flex align="center" gap={4}><Typography.Text type="secondary">New note zone</Typography.Text><InputNumber size="small" min={1} max={96} value={variantLow} aria-label="Sample zone low note" onChange={value => value !== null && setVariantLow(Number(value))} style={{ width: 58 }} /><Typography.Text type="secondary">to</Typography.Text><InputNumber size="small" min={1} max={96} value={variantHigh} aria-label="Sample zone high note" onChange={value => value !== null && setVariantHigh(Number(value))} style={{ width: 58 }} /></Flex>
            <Tooltip title={!capabilities.importWavSample ? t('music.capabilities.sampleImportUnsupported', { format }) : !props.onImportSample || props.canAddSampleVariant === false ? t('music.capabilities.scratchOnly') : ''}><span><Button size="small" disabled={!capabilities.importWavSample || !props.onImportSample || props.canAddSampleVariant === false || variantHigh < variantLow} onClick={() => { setSampleImportAsVariant(true); sampleImportInput.current?.click(); }}>{t('music.instruments.addAudio')}</Button></span></Tooltip>
            <Button size="small" icon={<AudioOutlined />} disabled={!capabilities.importWavSample || !props.onImportSample} onClick={() => { setSampleImportAsVariant(false); setPendingSampleFile(null); setSampleModalOpen(true); }}>{t('music.instruments.recordMicrophone')}</Button>
            <input ref={sampleImportInput} type="file" accept="audio/*,.wav" aria-label="Audio sample file" hidden onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) { setPendingSampleFile(file); setSampleModalOpen(true); }
            }} />
          </>
          {Array.from({ length: trackerSlotCount }, (_, index) => {
            const sample = props.samples.get(index + 1);
            return <div key={index} className={`gba-instrument-card ${instrument === index + 1 ? 'selected' : ''}`}>
              <button aria-label={`Select instrument ${index + 1}`} onClick={() => selectInstrument(index + 1)}><SoundOutlined /> Instrument {String(index + 1).padStart(2, '0')}<span>{sample ? `${sample.variants?.length ?? 1} sample zone${(sample.variants?.length ?? 1) === 1 ? '' : 's'}` : 'no sample'}</span></button>
              {sample && <div className="gba-instrument-sample">
                <Typography.Text className="gba-instrument-zone-map" type="secondary">{sampleZoneLabels(sample).join(' · ')}</Typography.Text>
                {instrument === index + 1 && <>
                  <svg role="img" aria-label={t('music.sample.editorWaveform')} viewBox="0 0 640 64" preserveAspectRatio="none" style={{ width: '100%', height: 52, background: token.colorFillTertiary, borderRadius: 5 }}>
                    {Array.from({ length: 64 }, (_, column) => {
                      const from = Math.floor(column * sample.samples.length / 64);
                      const to = Math.max(from + 1, Math.floor((column + 1) * sample.samples.length / 64));
                      let peak = 0;
                      for (let frame = from; frame < Math.min(to, sample.samples.length); frame += 1) peak = Math.max(peak, Math.abs(sample.samples[frame] ?? 0));
                      const height = Math.max(2, peak * 56);
                      return <rect key={column} x={column * 10} y={(64 - height) / 2} width="6" height={height} rx="1" fill={token.colorPrimary} />;
                    })}
                  </svg>
                  <Tooltip title={!hasEditableSampleZone(sample) ? t('music.sample.edit.warning') : ''}><span><Button size="small" aria-label={t('music.sample.editorOpen')} disabled={!hasEditableSampleZone(sample)} onClick={() => { setSampleEditorVariantIndex(0); setSampleEditorSelection(null); setSampleEditorZoom(1); setSampleEditorOpen(true); }}>{t('music.sample.editorOpen')}</Button></span></Tooltip>
                  {props.onEditSamplePcm && !sample.sixteenBit && !sample.stereo && (sample.variants?.length ?? 1) <= 1 && <Flex gap={4} wrap="wrap" className="gba-sample-edit-actions">
                    <Button size="small" onClick={() => props.onEditSamplePcm?.(index + 1, 'normalize')}>{t('music.sample.edit.normalize')}</Button>
                    <Button size="small" onClick={() => props.onEditSamplePcm?.(index + 1, 'remove-dc')}>{t('music.sample.edit.removeDc')}</Button>
                    <Button size="small" onClick={() => props.onEditSamplePcm?.(index + 1, 'reverse')}>{t('music.sample.edit.reverse')}</Button>
                    <Button size="small" onClick={() => props.onEditSamplePcm?.(index + 1, 'fade-out')}>{t('music.sample.edit.fadeOut')}</Button>
                  </Flex>}
                </>}
                <Tooltip title={!capabilities.sampleVolumeLoop ? `${format} sample volume and loop editing is unavailable.` : format === 'XM' ? t('music.inspector.xmSampleVolumeGbaPreview') : ''}><span><label>{t('music.inspector.sampleVolume')}<InputNumber disabled={!capabilities.sampleVolumeLoop} size="small" min={0} max={64} value={sample.volume ?? 64} onChange={value => value !== null && props.onSampleChange(index + 1, { volume: Number(value) })} /></label></span></Tooltip>
                <Tooltip title={!capabilities.sampleVolumeLoop ? `${format} sample volume and loop editing is unavailable.` : ''}><span><label>Loop start<InputNumber disabled={!capabilities.sampleVolumeLoop} size="small" min={0} max={sample.samples.length} value={sample.loopStart} onChange={value => value !== null && props.onSampleChange(index + 1, { loopStart: Number(value) })} /></label></span></Tooltip>
                <Tooltip title={!capabilities.sampleVolumeLoop ? `${format} sample volume and loop editing is unavailable.` : ''}><span><label>Loop end<InputNumber disabled={!capabilities.sampleVolumeLoop} size="small" min={0} max={sample.samples.length} value={sample.loopEnd} onChange={value => value !== null && props.onSampleChange(index + 1, { loopEnd: Number(value) })} /></label></span></Tooltip>
                <Tooltip title={!capabilities.sampleTuning ? `${format} does not support sample root-note and pan editing.` : ''}><span><label>Root note<InputNumber disabled={!capabilities.sampleTuning} size="small" min={0} max={119} value={sample.rootNote ?? 49} onChange={value => value !== null && props.onSampleChange(index + 1, { rootNote: Number(value) })} /></label></span></Tooltip>
                <Tooltip title={!capabilities.sampleFineTune ? `${format} does not support sample fine-tune editing.` : ''}><span><label>Fine tune<InputNumber disabled={!capabilities.sampleFineTune} size="small" min={format === 'MOD' ? -8 : -128} max={format === 'MOD' ? 7 : 127} value={sample.fineTune ?? 0} onChange={value => value !== null && props.onSampleChange(index + 1, { fineTune: Number(value) })} /></label></span></Tooltip>
                <Tooltip title={!capabilities.sampleTuning ? `${format} does not support sample root-note and pan editing.` : ''}><span><label>Pan<InputNumber disabled={!capabilities.sampleTuning} size="small" min={0} max={255} value={sample.panning ?? 128} onChange={value => value !== null && props.onSampleChange(index + 1, { panning: Number(value) })} /></label></span></Tooltip>
              </div>}
            </div>;
          })}
        </div>}
      </aside>
      <main className="gba-beat-main">
        <div className="gba-beat-pattern-head"><Flex className="gba-beat-pattern-actions" align="center" gap={5} wrap="wrap">
        {view === 'roll' && <Tooltip title={<>{t('music.roll.ghostHint')} (<kbd>`</kbd>)</>}><span><Button ref={ghostToggleButton} size="small" type={ghostEnabled.current ? 'primary' : 'default'} aria-label={t('music.roll.ghostHint')} aria-pressed={ghostEnabled.current} aria-keyshortcuts="Backquote" disabled={info.channels < 2} onClick={toggleGhostLayer}>GL</Button></span></Tooltip>}
          <Tooltip title={t('music.roll.quantizeHint', { rows: Math.max(1, noteLength) })} color={token.colorBorder}>
            <span><Button size="small" aria-label={t('music.roll.quantize')} disabled={!selectedNote && selectedNotes.length === 0} onClick={quantizeSelected}>{t('music.roll.quantize')}</Button></span>
          </Tooltip>
          {(view === 'tracker' || view === 'roll') && <>
            <Tooltip title={`${t('music.tracker.pencil')} (1)`}><Button size="small" type={trackerTool === 'pencil' ? 'primary' : 'default'} aria-label={t('music.tracker.pencil')} aria-pressed={trackerTool === 'pencil'} icon={<EditOutlined />} onClick={() => { pendingPaste.current = null; setRollGroupPreview([]); setTrackerTool('pencil'); }} /></Tooltip>
            <Tooltip title={`${t('music.tracker.eraser')} (2)`}><Button size="small" type={trackerTool === 'eraser' ? 'primary' : 'default'} aria-label={t('music.tracker.eraser')} aria-pressed={trackerTool === 'eraser'} icon={<DeleteOutlined />} onClick={() => { pendingPaste.current = null; setRollGroupPreview([]); setTrackerTool('eraser'); }} /></Tooltip>
            <Tooltip title={`${t('music.tracker.select')} (3)`}><Button size="small" type={trackerTool === 'select' ? 'primary' : 'default'} aria-label={t('music.tracker.select')} aria-pressed={trackerTool === 'select'} icon={<SelectOutlined />} onClick={() => { pendingPaste.current = null; setRollGroupPreview([]); setTrackerTool('select'); }} /></Tooltip>
          </>}
          {view === 'roll' && <><Tooltip title={t('music.toolbar.zoomHint')}><Typography.Text style={{ whiteSpace: 'nowrap' }}>Zoom</Typography.Text></Tooltip><Slider aria-label={t('music.toolbar.zoomHint')} tooltip={{ formatter: () => t('music.toolbar.zoomHint') }} min={12} max={72} value={gridWidth} marks={{ 20: <Tooltip title={t('music.roll.zoomDefault')}><span aria-hidden="true" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: token.colorPrimary, verticalAlign: 'middle' }} /></Tooltip> }} onChange={value => setGridWidth(Number(value))} style={{ width: 92, margin: 0 }} /></>}
        </Flex></div>
        <div className="gba-beat-roll" onKeyDown={event => {
          const target = event.target as HTMLElement;
          if (target.closest('input,textarea,[contenteditable="true"]')) return;
          if (event.key === 'Escape' && (selectedNote || selectedNotes.length)) {
            event.preventDefault();
            setSelectedNote(null);
            setSelectedNotes([]);
            selectionAnchor.current = null;
            props.onSelectionChange?.(null);
            return;
          }
          if (event.key.toLowerCase() === 'q' && selectedNote) { event.preventDefault(); quantizeSelected(); }
        }} tabIndex={0}>
          {view === "keyboard" ? <div className="gba-playing-keyboard">
            <div className="gba-keyboard-help"><Typography.Text strong>{t('music.score.keyboardHelp')}</Typography.Text><Typography.Text type="secondary">{t('music.score.rowHint', { row: playhead + 1, length: noteLength })}</Typography.Text><InputNumber aria-label={t('music.score.insertionRow')} min={0} max={rowCount - 1} value={playhead} onChange={value => setCursorRow(Number(value ?? 0))} /></div>
            <TrackerKeyboardInput timing={keyboardTiming} row={playhead} length={noteLength} channel={selectedChannel} instrument={instrument} format={format}
              playing={props.playing} selectedPitch={selectedNote?.note} fitPitch={fitScalePitch} inScale={isScalePitch} onPreview={pitch => props.onPreviewNote(pitch, instrument, patternRowCount)} onRelease={props.onStopKeyboardPreview}
              onCommit={result => {
                if (!props.onKeyboardGesture?.(result)) {
                  props.onCreateNotes(result.notes);
                  if (result.effects.length) props.onEffectsChange(result.effects.map(effect => ({ ...effect, patternIndex: pattern })));
                }
                const last = result.notes.at(-1)!;
                setSelectedNote({ row: last.start, note: last.note }); setSelectedNotes(result.notes.map(note => ({ row: note.start, note: note.note })));
                if (last.end >= patternRowCount && capabilities.patternOrder) { props.onAddPattern(); setSelectedNote(null); setSelectedNotes([]); setCursorRow(0, false); }
                else setCursorRow(Math.min(last.end, patternRowCount - 1), false);
              }} />
            <TrackerKeyboardScore rows={patternRows} precedingRows={scorePrecedingRows} format={format} bpm={info.tempo ?? 125} speed={info.speed ?? 6}
              channel={selectedChannel} playhead={playhead} playing={props.playing} selectedRow={selectedNote?.row}
              onCursor={row => setCursorRow(row, false)} onSelect={(row, note, event) => {
                selectNote({ row, note }, event, pattern);
                const item = existingNotes.find(item => item.row === row && item.note === note);
                if (item) { setInstrument(item.instrument || 1); setNoteLength(item.length); }
                setCursorRow(row, false);
              }} onMove={(oldRow, row, pitch) => {
                const source = existingNotes.find(item => item.row === oldRow);
                if (!source) return;
                const group = selectedNotes.some(item => item.row === oldRow) ? existingNotes.filter(item => selectedNotes.some(selected => selected.row === item.row && selected.note === item.note)) : [source];
                const delta = Math.max(-Math.min(...group.map(item => item.row)), Math.min(row - oldRow, patternRowCount - Math.max(...group.map(item => item.row + item.length))));
                const transpose = Math.max(1 - Math.min(...group.map(item => item.note)), Math.min(pitch - source.note, 96 - Math.max(...group.map(item => item.note))));
                props.onEditNotes(group.map(item => ({ oldRow: item.row, oldNote: item.note, start: item.row + delta, end: item.row + delta + item.length,
                  note: item.note + transpose, channel: selectedChannel, instrument: item.instrument || 1 })));
                setSelectedNotes(group.map(item => ({ row: item.row + delta, note: item.note + transpose })));
                setSelectedNote({ row: source.row + delta, note: source.note + transpose }); setCursorRow(source.row + delta, false);
              }} onInsert={(row, note) => {
                onNote(row, Math.min(patternRowCount, row + noteLength), note, selectedChannel, instrument);
                setSelectedNote({ row, note }); setSelectedNotes([{ row, note }]); setCursorRow(row, false);
              }} />
          </div> : view === "tracker" ?
          <div className="gba-tracker-scroll"><div className="gba-tracker-grid" role="grid" aria-label={`Tracker pattern ${pattern + 1}`} style={{ gridTemplateColumns: `42px repeat(${info.channels}, minmax(130px, 1fr))` }}>
            <div className="gba-tracker-corner">ROW</div>
            {Array.from({ length: info.channels }, (_, channel) => <div className={`gba-tracker-channel ${selectedChannel === channel ? 'selected' : ''}`} style={{ background: token.colorBgBase, color: token.colorText }} key={`head-${channel}`}><button onClick={() => props.onChannelChange(channel)}>CHANNEL {String(channel + 1).padStart(2, '0')}</button><button className={props.muted[channel] ? 'muted' : ''} aria-label={`${props.muted[channel] ? 'Unmute' : 'Mute'} channel ${channel + 1}`} onClick={() => props.onToggleChannel(channel)}>M</button></div>)}
            {patternRows.map((row, rowIndex) => <React.Fragment key={`row-${rowIndex}`}><button type="button" className={`gba-tracker-row-number ${rowIndex % 16 === 0 ? 'bar' : ''} ${playhead === rowIndex ? 'playhead' : ''}`} aria-label={`Set preview start to row ${rowIndex.toString(16).toUpperCase().padStart(2, '0')}`} onClick={() => setCursorRow(rowIndex, false)}>{rowIndex.toString(16).toUpperCase().padStart(2, '0')}</button>{Array.from({ length: info.channels }, (_, channel) => {
              const event = row[channel];
              const hasNote = Boolean(event && event.note > 0 && event.note < 97);
              const selected = hasNote && isNoteSelected({ row: rowIndex, note: event!.note });
              const noteText = hasNote ? noteLabel(event!.note) : event?.note === 97 ? 'OFF' : '···';
              const eventText = event && (event.effect || event.parameter) ? trackerEffectLabel(format, event.effect, event.parameter, t) : '';
              return <button key={`${rowIndex}-${channel}`} role="gridcell" data-tracker-row={rowIndex} className={`gba-tracker-cell ${rowIndex % 16 === 0 ? 'bar' : rowIndex % 4 === 0 ? 'beat' : ''} ${playhead === rowIndex ? 'playhead' : ''} ${selected ? 'selected' : ''} ${hasNote ? 'has-note' : ''} ${trackerGroupPreview.some(item => item.row === rowIndex) ? 'group-preview' : ''}`} aria-label={`Row ${rowIndex.toString(16).toUpperCase()}, channel ${channel + 1}, ${hasNote ? noteText : 'empty'}`} onPointerDown={event => { if (hasNote) startTrackerGroupMove(event, rowIndex, event!.note); }} onPointerMove={moveTrackerGroup} onPointerUp={finishTrackerGroupMove} onPointerCancel={finishTrackerGroupMove} onClick={clickEvent => {
                if (suppressTrackerCellClick.current) { suppressTrackerCellClick.current = false; return; }
                props.onChannelChange(channel);
                if (trackerTool === 'eraser') {
                  if (hasNote) props.onDelete(rowIndex, channel);
                  setSelectedNote(null); setSelectedNotes([]); selectionAnchor.current = null;
                  return;
                }
                if (trackerTool === 'select') {
                  if (!hasNote) setCursorRow(rowIndex);
                  if (hasNote) { const item = { row: rowIndex, note: event!.note }; selectNote(item, clickEvent, pattern, channel); setInstrument(event!.instrument || instrument); }
                  else { setSelectedNote(null); setSelectedNotes([]); selectionAnchor.current = null; }
                  return;
                }
                if (!hasNote) setCursorRow(rowIndex);
                if (hasNote) { const item = { row: rowIndex, note: event!.note }; selectNote(item, clickEvent, pattern, channel); setInstrument(event!.instrument || instrument); }
                else { const note = fitScalePitch(selectedNote?.note ?? 49); onNote(rowIndex, Math.min(rowCount, rowIndex + noteLength), note, channel, instrument); const item = { row: rowIndex, note }; setSelectedNote(item); setSelectedNotes([item]); selectionAnchor.current = item; }
              }}><span>{noteText}</span><span>{hasNote ? String(event!.instrument).padStart(2, '0') : '··'}</span><span title={eventText} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eventText || '···'}</span></button>;
            })}</React.Fragment>)}
          </div></div> : <>
          <div className="gba-piano-roll-layout">
          <div className="gba-piano-roll-ruler-row">
            <div className="gba-piano-roll-ruler-spacer" style={{ width: 48 + gridWidth, flexBasis: 48 + gridWidth }} />
            <div className="gba-piano-roll-ruler-viewport" style={props.playing ? { pointerEvents: 'none' } : undefined} onPointerDown={event => {
              if ((event.target as HTMLElement).closest('button')) return;
              movePlayheadToPointer(event.clientX);
            }}>
              <div ref={pianoRollRulerContent} className="gba-piano-roll-ruler-content" style={{ width: rowCount * gridWidth, transform: 'translateX(0px)' }}>
                {Array.from({ length: rowCount }, (_, rowIndex) => rowIndex > 0 && rowIndex % 4 === 0 ? <div key={rowIndex} className={`gba-piano-roll-ruler-mark${rowIndex % 8 === 0 ? '' : ' gba-piano-roll-ruler-mark-half'}`} style={{ left: rowIndex * gridWidth }}>{rowIndex % 8 === 0 ? <span>{rowIndex}</span> : null}</div> : null)}
                <button className="gba-beat-playhead-handle" type="button" disabled={props.playing} aria-label="Drag to set playback start" title="Drag to set playback start" style={{ left: playhead * gridWidth - 8 }} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); movePlayheadToPointer(event.clientX); }} onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) movePlayheadToPointer(event.clientX); }}><CaretDownFilled /></button>
              </div>
            </div>
          </div>
          {playMode === 'song' && <div className="gba-piano-roll-pattern-row" aria-label={t('music.inspector.patterns')}>
            <div className="gba-piano-roll-ruler-spacer" style={{ width: 48 + gridWidth, flexBasis: 48 + gridWidth }} />
            <div className="gba-piano-roll-ruler-viewport"><div ref={pianoRollPatternContent} className="gba-piano-roll-pattern-content" style={{ width: rowCount * gridWidth, transform: 'translateX(0px)' }}>
              {timelineSegments.map((segment, index) => {
                const name = props.patternNames?.[segment.patternIndex] || `Pattern ${segment.patternIndex + 1}`;
                const label = `${String(segment.orderIndex + 1).padStart(2, '0')} · ${name}`;
                return <button key={props.orderIds?.[segment.orderIndex] ?? `${segment.orderIndex}:${segment.patternIndex}`} type="button" disabled={props.playing} className={`gba-piano-roll-pattern-band ${selectedOrder === segment.orderIndex ? 'selected' : ''}`} style={{ left: segment.start * gridWidth, width: (segment.end - segment.start) * gridWidth, background: index % 2 ? token.colorFillSecondary : token.colorFillTertiary }} title={`${label} · ${segment.end - segment.start}`} onClick={() => { selectOrder(segment.orderIndex); props.onPatternChange(segment.patternIndex); setCursorRow(segment.start, false); }}><span>{label}</span></button>;
              })}
            </div></div>
          </div>}
          <div className="gba-piano-roll-content">
          <div className="gba-beat-keyboard" ref={pianoKeyboardScroll} onScroll={event => { const scroll = pianoRollScroll.current; if (scroll && scroll.scrollTop !== event.currentTarget.scrollTop) scroll.scrollTop = event.currentTarget.scrollTop; }} style={{ width: 48 + gridWidth, flexBasis: 48 + gridWidth }}><div className="gba-beat-keyboard-content" style={{ height: PITCHES * cellHeight }}>{pianoKeys.filter(key => !key.black).map(key => { const octave = (key.note - 1) % 12 === 0; const center = (TOP_PITCH - key.note) * cellHeight + cellHeight / 2; return <button key={key.note} className={`natural ${key.note === rollHover?.note || key.note === rollHoveredKeyPitch ? 'hovered' : ''} ${octave ? 'octave' : ''}`} style={{ top: key.top, height: key.height }} title={noteLabel(key.note)} onPointerDown={() => startKeyboardPreview(key.note)} onPointerEnter={() => enterKeyboardPreview(key.note)} onPointerLeave={() => setRollHoveredKeyPitch(null)} onClick={event => clickKeyboardPitch(key.note, event)}>{octave && <span style={{ top: center - key.top - 5 }}>{noteLabel(key.note)}</span>}</button>; })}{pianoKeys.filter(key => key.black).map(key => <button key={key.note} className={`black ${key.note === rollHover?.note || key.note === rollHoveredKeyPitch ? 'hovered' : ''}`} style={{ top: key.top, height: key.height }} title={noteLabel(key.note)} onPointerDown={() => startKeyboardPreview(key.note)} onPointerEnter={() => enterKeyboardPreview(key.note)} onPointerLeave={() => setRollHoveredKeyPitch(null)} onClick={event => clickKeyboardPitch(key.note, event)} />)}</div></div>
          <div className="gba-beat-scroll" ref={pianoRollScroll} onScroll={event => { if (pianoKeyboardScroll.current && pianoKeyboardScroll.current.scrollTop !== event.currentTarget.scrollTop) pianoKeyboardScroll.current.scrollTop = event.currentTarget.scrollTop; syncPianoRollScrollLeft(event.currentTarget.scrollLeft); }}><div className="gba-piano-roll-grid-track" style={{ width: rowCount * gridWidth + (capabilities.patternOrder ? 50 : 0), height: PITCHES * cellHeight }}><div className={`gba-beat-grid tool-${trackerTool} ${gridPanning ? 'panning' : ''} ${selectionDrag.current?.mode === 'erase' ? 'erasing' : ''} ${dragPreview || rollGroupPreview.length ? 'note-dragging' : ''}`} style={{ width: rowCount * gridWidth, height: PITCHES * cellHeight }} onPointerLeave={() => setRollHover(null)} onAuxClick={event => { if (event.button === 1) event.preventDefault(); }} onPointerDown={startPointer} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer}>
            {pianoRollCells}
            {scaleMode === 0 && <div className="gba-beat-grid-eight-line" aria-hidden="true" style={{ width: rowCount * gridWidth, height: PITCHES * cellHeight, backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${Math.max(0, 4 * gridWidth - 2)}px, color-mix(in srgb, var(--music-border-strong) 55%, transparent) ${Math.max(0, 4 * gridWidth - 1)}px, color-mix(in srgb, var(--music-border-strong) 85%, transparent) ${4 * gridWidth}px), repeating-linear-gradient(to right, transparent 0 ${Math.max(0, 8 * gridWidth - 2.5)}px, var(--music-grid-strong) ${Math.max(0, 8 * gridWidth - 1.25)}px ${8 * gridWidth}px)` }} />}
            {rollHover && <><div className="gba-roll-hover-row" aria-hidden="true" style={{ top: (TOP_PITCH - rollHover.note) * cellHeight, height: cellHeight }} /><div className="gba-roll-hover-column" aria-hidden="true" style={{ left: rollHover.row * gridWidth, width: gridWidth }} /><div className="gba-roll-hover-center" aria-hidden="true" style={{ left: rollHover.row * gridWidth, top: (TOP_PITCH - rollHover.note) * cellHeight, width: gridWidth, height: cellHeight }} /></>}
            <div ref={fxRollCrosshair} data-fx-roll-crosshair="true" aria-hidden="true" style={{ display: 'none', position: 'absolute', inset: 0, pointerEvents: 'none' }}>
              <div className="gba-roll-hover-column" style={{ width: gridWidth }} />
            </div>
            {selectionBox && <div className={`gba-roll-selection-box${selectionDrag.current?.mode === 'erase' ? ' erase' : ''}`} aria-hidden="true" style={{ left: Math.min(selectionBox.firstRow, selectionBox.lastRow) * gridWidth, top: (TOP_PITCH - Math.max(selectionBox.firstNote, selectionBox.lastNote)) * cellHeight, width: (Math.abs(selectionBox.lastRow - selectionBox.firstRow) + 1) * gridWidth, height: (Math.abs(selectionBox.lastNote - selectionBox.firstNote) + 1) * cellHeight }} />}
            <div ref={ghostLayerElement} className="gba-beat-ghost-layer" aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'none', visibility: 'hidden', pointerEvents: 'none' }}><GhostNoteLayer channelSettings={props.channelSettings} scrollRef={pianoRollScroll} segments={timelineSegments} songRowCount={rowCount} channels={info.channels} selectedChannel={selectedChannel} gridWidth={gridWidth} cellHeight={cellHeight} instrumentColor={instrumentColor} /></div>
            <TrackerRollNoteLayer scrollRef={pianoRollScroll} gridWidth={gridWidth}>{existingNoteElements}</TrackerRollNoteLayer>
            {rollGroupPreview.map((item, index) => <div key={`group-preview-${index}`} className="gba-beat-note drag-preview" aria-hidden="true" style={{ left: item.row * gridWidth + 2, top: (TOP_PITCH - item.note) * cellHeight + 2, width: Math.max(16, item.length * gridWidth - 4), height: cellHeight - 4, background: instrumentColor(item.instrument, selectedChannel) }}>{noteLabel(item.note)}</div>)}
            {dragPreview && <div className="gba-beat-note drag-preview" aria-hidden="true" style={{ left: dragPreview.row * gridWidth + 2, top: (TOP_PITCH - dragPreview.note) * cellHeight + 2, width: Math.max(16, (dragPreview.length * gridWidth) - 4), height: cellHeight - 4, background: instrumentColor(instrument, selectedChannel) }}>{noteLabel(dragPreview.note)}</div>}
            {inspectorLengthPreview && <div className="gba-beat-note inspector-length-preview" aria-hidden="true" style={{ left: inspectorLengthPreview.row * gridWidth + 2, top: (TOP_PITCH - inspectorLengthPreview.note) * cellHeight + 2, width: Math.max(16, (inspectorLengthPreview.length * gridWidth) - 4), height: cellHeight - 4, background: instrumentColor(instrument, selectedChannel) }}>{noteLabel(inspectorLengthPreview.note)}</div>}
          </div>
          {capabilities.patternOrder && <span className="gba-piano-roll-add-pattern-slot" onMouseEnter={() => setAddPatternTooltipOpen(true)} onMouseLeave={() => setAddPatternTooltipOpen(false)} onFocus={() => setAddPatternTooltipOpen(true)} onBlur={() => setAddPatternTooltipOpen(false)}><button type="button" className="gba-piano-roll-add-pattern-large" aria-label={t('music.create.addPattern')} disabled={props.playing} onClick={props.onAddPattern}><Tooltip placement="left" open={addPatternTooltipOpen} title={t('music.create.addPattern')}><span className="gba-piano-roll-add-pattern-icon"><PlusOutlined /></span></Tooltip></button></span>}
          </div></div>
          <div className="gba-beat-playhead-overlay" style={{ left: 48 + gridWidth }}><div ref={pianoRollPlayhead} className="gba-beat-playhead" style={{ left: playhead * gridWidth }} /></div>
          </div></div>
          </>}
        </div>
        {view === 'roll' && <TrackerFxLane ref={pianoRollFxContent} format={format} segments={timelineSegments}
          channel={selectedChannel} rowCount={rowCount} gridWidth={gridWidth}
          tool={trackerTool} scrollRef={pianoRollScroll} commandRef={fxCommandRef} onEffectsChange={props.onEffectsChange}
          onHoverRow={hoverFxRow}
          onActivate={() => { setSelectedNote(null); setSelectedNotes([]); selectionAnchor.current = null; props.onSelectionChange?.(null); }}
          playing={props.playing} onEffectChange={props.onEffectChange} />}
        <div className="gba-beat-order"><div className="gba-beat-order-title">ORDER <Segmented aria-label={t('music.toolbar.playModeLabel')} size="small" value={playMode} disabled={props.playing} onChange={value => changePlayMode(value as 'pattern' | 'song')} options={[{ label: <Tooltip title={t('music.toolbar.patternHint')}><span>Pattern</span></Tooltip>, value: 'pattern' }, { label: <Tooltip title={t('music.toolbar.songHint')}><span>Song</span></Tooltip>, value: 'song' }]} /></div><div ref={orderTrackRef} className={`gba-beat-order-track ${orderPanning ? 'panning' : ''}`} onDragOver={dragOrderOver} onDrop={dropOrder} onPointerDown={event => { if (event.button !== 1) return; event.preventDefault(); orderPanDrag.current = { pointerId: event.pointerId, startX: event.clientX, scrollLeft: event.currentTarget.scrollLeft }; event.currentTarget.setPointerCapture(event.pointerId); setOrderPanning(true); }} onPointerMove={event => { const drag = orderPanDrag.current; if (!drag || drag.pointerId !== event.pointerId) return; event.currentTarget.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX); }} onPointerUp={event => { if (orderPanDrag.current?.pointerId !== event.pointerId) return; orderPanDrag.current = null; setOrderPanning(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { orderPanDrag.current = null; setOrderPanning(false); }} onAuxClick={event => { if (event.button === 1) event.preventDefault(); }}>
          {(playMode === 'pattern' ? [{ item: pattern, index: selectedOrder }] : order.map((item, index) => ({ item, index }))).map(({ item, index }) => <React.Fragment key={props.orderIds?.[index] ?? `${index}:${item}`}>
            {draggedOrderIndex !== null && index !== draggedOrderIndex && orderDropIndex === index - (index > draggedOrderIndex ? 1 : 0) && <div className="gba-order-drop-slot" aria-hidden="true" />}
            <div className={`gba-order-item ${draggedOrderIndex === index ? 'dragging' : ''}`} draggable={playMode === 'song' && capabilities.patternOrder && !props.playing} onDragStart={event => {
              suppressOrderClick.current = true;
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('application/x-gba-studio-music-order', String(index));
              const rect = event.currentTarget.getBoundingClientRect();
              const image = event.currentTarget.cloneNode(true) as HTMLDivElement;
              Object.assign(image.style, { position: 'fixed', left: '-10000px', top: '-10000px', width: `${rect.width}px`, opacity: '1' });
              image.classList.add('gba-order-drag-image');
              (event.currentTarget.parentElement ?? document.body).appendChild(image);
              event.dataTransfer.setDragImage(image, event.clientX - rect.left, event.clientY - rect.top);
              requestAnimationFrame(() => image.remove());
              setDraggedOrderIndex(index);
              setOrderDropIndex(index);
            }} onDragEnd={() => { setDraggedOrderIndex(null); setOrderDropIndex(null); window.setTimeout(() => { suppressOrderClick.current = false; }, 0); }}>
              <button data-order-index={index} className={`gba-order-card ${(props.playing ? playbackOrderIndex : selectedOrder) === index ? 'selected' : ''}`} disabled={props.playing} onClick={() => { if (!suppressOrderClick.current) selectOrder(index); }}><small>{String(index + 1).padStart(2, '0')}</small><b>{props.patternNames?.[item] || `Pattern ${item + 1}`}</b><span>{item === pattern ? existingNotes.length : 'open to edit'} notes</span></button>
            </div>
          </React.Fragment>)}
          {draggedOrderIndex !== null && orderDropIndex === order.length - 1 && <div className="gba-order-drop-slot" aria-hidden="true" />}
          {capabilities.patternOrder && <Tooltip title={t('music.create.addPattern')}><span className="gba-order-add-pattern-slot"><button type="button" className="gba-order-card gba-order-add-pattern" disabled={props.playing} aria-label={t('music.create.addPattern')} onClick={props.onAddPattern}><PlusOutlined /></button></span></Tooltip>}
        </div></div>
      </main>
        <aside className="gba-beat-inspector"><div className="gba-beat-inspector-title">INSPECTOR</div>{selectedNote ? <><Typography.Text type="secondary">{selectedNotes.length > 1 ? `${selectedNotes.length} NOTES SELECTED` : 'SELECTED NOTE'}</Typography.Text><Typography.Title level={5}>{selectedNotes.length > 1 ? `${selectedNotes.length} notes` : noteLabel(selectedNote.note)}</Typography.Title>{selectedNotes.length === 1 && <><label>Time row<InputNumber min={0} max={patternRowCount - 1} value={selectedNote.row} onChange={value => updateSelected(Number(value ?? 0), noteLength, selectedNote.note)} /></label><label>Length<InputNumber min={1} max={patternRowCount - selectedNote.row} value={noteLength} onChange={value => updateSelected(selectedNote.row, Number(value ?? 1), selectedNote.note)} /></label><label>Pitch<Select value={selectedNote.note} onChange={value => updateSelected(selectedNote.row, noteLength, value)} options={Array.from({ length: 96 }, (_, index) => ({ value: index + 1, label: noteLabel(index + 1) })).reverse()} /></label><label>Instrument<Select value={instrument} onChange={chooseInstrument} options={Array.from({ length: Math.max(1, trackerSlotCount) }, (_, index) => ({ value: index + 1, label: `Instrument ${index + 1}` }))} /></label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Tooltip title={!capabilities.noteVolume ? `${format} does not support per-note volume editing.` : ''}><span><label>Note volume<div className="gba-music-control-row"><Slider className="gba-music-fader" disabled={!capabilities.noteVolume} min={0} max={100} value={displayedVolume} onChange={value => props.onNoteVolumeChange(selectedNote.row, selectedChannel, encodeInspectorNoteVolume(value))} /><MusicDial label="Note volume dial" min={0} max={100} step={1} disabled={!capabilities.noteVolume} value={displayedVolume} valueText={`${displayedVolume}%`} onChange={value => props.onNoteVolumeChange(selectedNote.row, selectedChannel, 0x10 + Math.round((value / 100) * 0x40))} /></div></label></span></Tooltip><Tooltip title={notePanEditable ? t('music.inspector.panSnap') : t('music.inspector.panConflict')}><span><label>Stereo pan <Typography.Text type="secondary">{selectedPan < -0.005 ? "L" : selectedPan > 0.005 ? "R" : "C"} | {Math.round(selectedPan * 100)}%</Typography.Text><div className="gba-music-control-row"><Slider className="gba-music-fader" aria-label={t('music.inspector.panAria')} min={-100} max={100} step={25} marks={{ "-100": "L", "-75": "-75%", "-50": "-50%", "-25": "-25%", 0: "C", 25: "25%", 50: "50%", 75: "75%", 100: "R" }} value={Math.round(selectedPan * 4) * 25} disabled={!notePanEditable} onChange={value => props.onNotePanChange(selectedNote.row, selectedChannel, quantizeTrackerNotePan(value / 100))} /><MusicDial label={t('music.inspector.panAria')} min={-100} max={100} step={25} disabled={!notePanEditable} value={Math.round(selectedPan * 4) * 25} valueText={`${selectedPan < -0.005 ? "Left" : selectedPan > 0.005 ? "Right" : "Center"}, ${Math.round(Math.abs(selectedPan * 100))}%`} onChange={value => props.onNotePanChange(selectedNote.row, selectedChannel, quantizeTrackerNotePan(value / 100))} /></div></label></span></Tooltip></div></>}<Typography.Text type="secondary">Group actions: copy, paste, quantize and delete.</Typography.Text><Button danger icon={<DeleteOutlined />} onClick={removeSelected}>Delete {selectedNotes.length > 1 ? `${selectedNotes.length} notes` : 'note'}</Button></> : <><Typography.Text type="secondary">CHANNEL {selectedChannel + 1} · PATTERN {pattern + 1}</Typography.Text><Typography.Title level={5}>Channel settings</Typography.Title><Button size="small" onClick={() => props.onToggleChannel(selectedChannel)}>{props.muted[selectedChannel] ? 'Unmute channel' : 'Mute channel'}</Button><label>Volume<div className="gba-music-control-row"><Slider className="gba-music-fader" aria-label="Channel volume" min={0} max={100} value={Math.round((props.volumes[selectedChannel] ?? 1) * 100)} onChange={value => props.onVolumeChange(selectedChannel, value / 100)} /><MusicDial label="Channel volume dial" min={0} max={100} step={1} value={Math.round((props.volumes[selectedChannel] ?? 1) * 100)} valueText={`${Math.round((props.volumes[selectedChannel] ?? 1) * 100)}%`} onChange={value => props.onVolumeChange(selectedChannel, value / 100)} /></div></label><div className="gba-music-pan-control"><span>Pan</span><MusicDial label="Channel pan" min={-100} max={100} value={Math.round((props.pans[selectedChannel] ?? 0) * 100)} valueText={`${(props.pans[selectedChannel] ?? 0) < -0.005 ? "Left" : (props.pans[selectedChannel] ?? 0) > 0.005 ? "Right" : "Center"}, ${Math.round(Math.abs((props.pans[selectedChannel] ?? 0) * 100))}%`} onChange={value => props.onPanChange(selectedChannel, value / 100)} /><small>{(props.pans[selectedChannel] ?? 0) < -0.005 ? "L" : (props.pans[selectedChannel] ?? 0) > 0.005 ? "R" : "C"} · {Math.round((props.pans[selectedChannel] ?? 0) * 100)}%</small></div><label>Instrument for new notes<Select value={instrument} onChange={setInstrument} options={Array.from({ length: Math.max(1, trackerSlotCount) }, (_, index) => ({ value: index + 1, label: `Instrument ${index + 1}` }))} /></label></>}</aside>
    </div>
    <Modal title={t('music.sample.previewTitle')} open={sampleModalOpen} onCancel={() => { stopMicrophoneRecording(); setSampleModalOpen(false); setPendingSampleFile(null); }} footer={pendingSampleFile ? <><Button onClick={() => { setSampleModalOpen(false); setPendingSampleFile(null); }}>{t('music.sample.discard')}</Button><Button type="primary" disabled={trimEnd <= trimStart || sampleExceedsFormatLimit} onClick={() => {
      props.onImportSample?.(pendingSampleFile, instrument, sampleImportAsVariant ? { low: variantLow, high: variantHigh } : undefined, { trimStart, trimEnd, gain: sampleGain, removeDc: removeSampleDc, fadeInMs: Math.min(sampleFadeInMs, sampleFadeLimitMs), fadeOutMs: Math.min(sampleFadeOutMs, sampleFadeLimitMs) });
      setSampleModalOpen(false);
      setPendingSampleFile(null);
    }}>{t(sampleImportAsVariant ? 'music.sample.addToInstrument' : 'music.sample.replaceSelected')}</Button></> : null} destroyOnClose>
      {pendingSampleFile ? <Flex vertical gap={12}>
        <Typography.Text>{pendingSampleFile.name} · {pendingSampleDuration.toFixed(2)} s</Typography.Text>
        <Typography.Text type="secondary">{t('music.sample.conversionEstimate', { format, frames: sampleEstimate.frames.toLocaleString(), bytes: sampleEstimate.payloadBytes.toLocaleString(), sampleRate: TRACKER_SAMPLE_RATE })}</Typography.Text>
        {sampleModuleSizeEstimate && <Typography.Text type="secondary">{t('music.sample.moduleSizeEstimate', {
          before: sampleModuleSizeEstimate.beforeBytes.toLocaleString(),
          after: sampleModuleSizeEstimate.afterBytes.toLocaleString(),
          delta: (sampleModuleSizeEstimate.deltaBytes >= 0 ? '+' : '−') + Math.abs(sampleModuleSizeEstimate.deltaBytes).toLocaleString(),
        })}</Typography.Text>}
        <Typography.Text type="secondary">{t(sampleEstimate.encodingKey)} · {t('music.sample.conversionLosses', { channels: pendingSampleChannels.length, sourceRate: pendingSampleRate, sampleRate: TRACKER_SAMPLE_RATE })}</Typography.Text>
        {sampleExceedsFormatLimit && <Typography.Text type="danger">{t('music.sample.limitExceeded', { seconds: (sampleEstimate.maxFrames / TRACKER_SAMPLE_RATE).toFixed(2), format })}</Typography.Text>}
        <svg role="img" aria-label={t('music.sample.waveform')} viewBox="0 0 960 100" preserveAspectRatio="none" style={{ width: '100%', height: 72, background: token.colorFillTertiary, borderRadius: 6 }}>
          {pendingSamplePeaks.map((peak, index) => <rect key={index} x={index * 10} y={50 - peak * 46} width="7" height={Math.max(2, peak * 92)} rx="2" fill={token.colorPrimary} />)}
          <rect x={pendingSampleDuration ? trimStart / pendingSampleDuration * 960 : 0} y="0" width={pendingSampleDuration ? Math.max(0, (trimEnd - trimStart) / pendingSampleDuration * 960) : 0} height="100" fill={token.colorPrimary} opacity="0.12" />
        </svg>
        {pendingSampleUrl && <audio controls src={pendingSampleUrl} style={{ width: '100%' }} />}
        <Flex gap={12} wrap="wrap" align="center">
          <label style={{ flex: '1 1 250px' }}>{t('music.sample.trimStart')}<Flex align="center" gap={8}><Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('music.sample.trimStart')} min={0} max={Math.max(0, trimEnd - 0.01)} step={0.01} value={trimStart} onChange={value => setTrimStart(Math.min(Number(value), Math.max(0, trimEnd - 0.01)))} style={{ width: 160, '--music-accent': 'var(--music-primary, #69d5d0)' } as React.CSSProperties} /><InputNumber aria-label={t('music.sample.trimStart')} min={0} max={Math.max(0, trimEnd - 0.01)} step={0.01} value={trimStart} onChange={value => value !== null && setTrimStart(Math.min(Number(value), Math.max(0, trimEnd - 0.01)))} /></Flex></label>
          <label style={{ flex: '1 1 250px' }}>{t('music.sample.trimEnd')}<Flex align="center" gap={8}><Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('music.sample.trimEnd')} min={Math.min(pendingSampleDuration, trimStart + 0.01)} max={pendingSampleDuration} step={0.01} value={trimEnd} onChange={value => setTrimEnd(Math.max(Math.min(pendingSampleDuration, trimStart + 0.01), Number(value)))} style={{ width: 160, '--music-accent': 'var(--music-primary, #69d5d0)' } as React.CSSProperties} /><InputNumber aria-label={t('music.sample.trimEnd')} min={Math.min(pendingSampleDuration, trimStart + 0.01)} max={pendingSampleDuration} step={0.01} value={trimEnd} onChange={value => value !== null && setTrimEnd(Math.max(Math.min(pendingSampleDuration, trimStart + 0.01), Number(value)))} /></Flex></label>
          <label>{t('music.sample.gain')}<Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('music.sample.gain')} min={0} max={2} step={0.05} value={sampleGain} onChange={value => setSampleGain(Number(value))} style={{ width: 150, '--music-accent': 'var(--music-primary, #69d5d0)' } as React.CSSProperties} /></label>
          <label>{t('music.sample.removeDc')}<Switch aria-label={t('music.sample.removeDc')} checked={removeSampleDc} onChange={setRemoveSampleDc} style={{ marginInlineStart: 8 }} /></label>
          <label style={{ flex: '1 1 250px' }}>{t('music.sample.fadeIn')}<Flex align="center" gap={8}><Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('music.sample.fadeIn')} min={0} max={sampleFadeLimitMs} step={1} value={Math.min(sampleFadeInMs, sampleFadeLimitMs)} onChange={value => setSampleFadeInMs(Number(value))} style={{ width: 160, '--music-accent': 'var(--music-primary, #69d5d0)' } as React.CSSProperties} /><InputNumber aria-label={t('music.sample.fadeIn')} min={0} max={sampleFadeLimitMs} step={1} value={Math.min(sampleFadeInMs, sampleFadeLimitMs)} onChange={value => setSampleFadeInMs(Math.min(sampleFadeLimitMs, Math.max(0, Number(value ?? 0))))} /></Flex></label>
          <label style={{ flex: '1 1 250px' }}>{t('music.sample.fadeOut')}<Flex align="center" gap={8}><Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('music.sample.fadeOut')} min={0} max={sampleFadeLimitMs} step={1} value={Math.min(sampleFadeOutMs, sampleFadeLimitMs)} onChange={value => setSampleFadeOutMs(Number(value))} style={{ width: 160, '--music-accent': 'var(--music-primary, #69d5d0)' } as React.CSSProperties} /><InputNumber aria-label={t('music.sample.fadeOut')} min={0} max={sampleFadeLimitMs} step={1} value={Math.min(sampleFadeOutMs, sampleFadeLimitMs)} onChange={value => setSampleFadeOutMs(Math.min(sampleFadeLimitMs, Math.max(0, Number(value ?? 0))))} /></Flex></label>
        </Flex>
        <Typography.Text type="secondary">{t('music.sample.sourceUnchanged')}</Typography.Text>
      </Flex> : <Flex vertical gap={12}>
        <Typography.Text type="secondary">{t('music.sample.microphonePermission')}</Typography.Text>
        <label>{t('music.sample.microphoneDevice')}<Select aria-label={t('music.sample.microphoneDevice')} data-testid="music-microphone-device" value={selectedMicrophoneDeviceId} disabled={microphoneRecording} onOpenChange={open => {
          if (open && navigator.mediaDevices?.enumerateDevices) void navigator.mediaDevices.enumerateDevices().then(devices => setMicrophoneDevices(devices.filter(device => device.kind === 'audioinput' && device.deviceId !== 'default' && device.deviceId !== 'communications'))).catch(() => {});
        }} onChange={setSelectedMicrophoneDeviceId} options={[
          { value: '', label: t('music.sample.defaultMicrophone') },
          ...microphoneDevices.map((device, index) => ({ value: device.deviceId, label: device.label || t('music.sample.microphoneNumber', { number: index + 1 }) })),
        ]} /></label>
        {microphoneRecording ? <Flex align="center" gap={8}><Tag color="red">{t('music.sample.recording')}</Tag><Button danger icon={<StopOutlined />} onClick={stopMicrophoneRecording}>{t('music.sample.stopRecording')}</Button></Flex>
          : <Button type="primary" icon={<AudioOutlined />} onClick={() => void startMicrophoneRecording()}>{t('music.sample.startRecording')}</Button>}
      </Flex>}
    </Modal>
    <Modal className="gba-sample-editor-modal" title={activeEditorSample?.name || t('music.sample.editorOpen')} open={sampleEditorOpen} onCancel={() => { setSampleEditorOpen(false); sampleEditorPointer.current = null; }} footer={null} width={920} style={{ maxWidth: 'calc(100vw - 32px)' }} destroyOnClose>
      {activeEditorSample && <Flex vertical gap={12} data-editor-history="music">
        <Typography.Text type="secondary">{t('music.sample.editorHint')}</Typography.Text>
        {activeEditorVariants.length > 1 && <label className="gba-sample-editor-zone">{t('music.sample.editorZone')}<Select aria-label={t('music.sample.editorZone')} value={activeEditorVariant?.sixteenBit || activeEditorVariant?.stereo ? undefined : sampleEditorVariantIndex} onChange={value => { setSampleEditorVariantIndex(Number(value)); setSampleEditorSelection(null); setSampleEditorZoom(1); }} options={sampleZoneLabels(activeEditorInstrumentSample!).map((label, index) => ({ value: index, label, disabled: !!activeEditorVariants[index]?.sixteenBit || !!activeEditorVariants[index]?.stereo }))} /></label>}
        <div className="gba-sample-editor-wave-wrap">
          <svg
            role="img"
            aria-label={t('music.sample.editorWaveform')}
            viewBox="0 0 960 120"
            preserveAspectRatio="none"
            onPointerDown={beginSampleEditorPointer}
            onPointerMove={moveSampleEditorPointer}
            onPointerUp={finishSampleEditorPointer}
            onPointerCancel={finishSampleEditorPointer}
            style={{ touchAction: 'none' }}
          >
            <line x1="0" y1="60" x2="960" y2="60" stroke={token.colorBorderSecondary} strokeWidth="1" />
            {Array.from({ length: 16 }, (_, index) => <line key={`grid-${index}`} x1={index * 64} y1="0" x2={index * 64} y2="120" stroke={token.colorBorderSecondary} strokeWidth="0.5" opacity="0.45" />)}
            {sampleEditorSelection && <rect x={(sampleEditorSelection.start - editorViewStart) / Math.max(1, editorViewEnd - editorViewStart) * 960} y="0" width={(sampleEditorSelection.end - sampleEditorSelection.start) / Math.max(1, editorViewEnd - editorViewStart) * 960} height="120" fill={token.colorPrimary} opacity="0.18" />}
            {activeEditorSample.loopEnd > activeEditorSample.loopStart && <>
              <line x1={(activeEditorSample.loopStart - editorViewStart) / Math.max(1, editorViewEnd - editorViewStart) * 960} y1="0" x2={(activeEditorSample.loopStart - editorViewStart) / Math.max(1, editorViewEnd - editorViewStart) * 960} y2="120" stroke={token.colorWarning} strokeWidth="2" />
              <line x1={(activeEditorSample.loopEnd - editorViewStart) / Math.max(1, editorViewEnd - editorViewStart) * 960} y1="0" x2={(activeEditorSample.loopEnd - editorViewStart) / Math.max(1, editorViewEnd - editorViewStart) * 960} y2="120" stroke={token.colorWarning} strokeWidth="2" />
            </>}
            <polyline
              points={Array.from({ length: 961 }, (_, point) => {
                const frame = Math.min(activeEditorLength - 1, Math.max(0, Math.floor(editorViewStart + point * (editorViewEnd - editorViewStart) / 960)));
                return `${point},${60 - (activeEditorSample.samples[frame] ?? 0) * 54}`;
              }).join(' ')}
              fill="none"
              stroke={token.colorPrimary}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
          <div className="gba-sample-editor-ruler"><span>{editorViewStart.toLocaleString()} {t('music.sample.frames')}</span><span>{editorViewEnd.toLocaleString()} / {activeEditorLength.toLocaleString()} {t('music.sample.frames')}</span></div>
        </div>
        <Flex className="gba-sample-editor-controls" align="center" gap={10} wrap="wrap">
          <label>{t('music.sample.editorZoom')}<Slider ariaLabelForHandle={t('music.sample.editorZoom')} min={1} max={32} value={sampleEditorZoom} onChange={value => setSampleEditorZoom(Number(value))} style={{ width: 180, margin: '4px 8px' }} /></label>
          <Segmented aria-label={t('music.sample.editorTool')} value={sampleEditorTool} onChange={value => setSampleEditorTool(value as 'select' | 'draw')} options={[{ value: 'select', label: t('music.sample.editorSelect') }, { value: 'draw', label: t('music.sample.editorDraw') }]} />
          <Tag>{t('music.sample.frames')}: {selectedSampleFrames.toLocaleString()}</Tag>
          <Tag>{t('music.sample.peak')}: {selectedSamplePeak.toFixed(3)}</Tag>
          <Tag>{t('music.sample.rms')}: {selectedSampleRms.toFixed(3)}</Tag>
        </Flex>
        <Flex className="gba-sample-editor-actions" gap={6} wrap="wrap">
          <Button size="small" icon={<PlayCircleOutlined />} onClick={() => props.onPreviewSample(activeEditorSample, selectedNote?.note ?? 49, selectedNote ? noteLength : undefined)}>{t('music.sample.editorPreview')}</Button>
          {(['normalize', 'remove-dc', 'reverse', 'fade-out', 'crossfade'] as const).map(operation => <Button key={operation} size="small" disabled={!activeEditorZoneEditable || !props.onEditSamplePcm || !selectedSampleFrames} onClick={() => props.onEditSamplePcm?.(instrument, operation, activeEditorSelection, undefined, sampleEditorVariantIndex)}>{t(`music.sample.edit.${operation === 'remove-dc' ? 'removeDc' : operation === 'fade-out' ? 'fadeOut' : operation}`)}</Button>)}
          <Button size="small" disabled={!activeEditorZoneEditable || !props.onEditSamplePcm || !selectedSampleFrames || selectedSampleFrames === activeEditorLength} onClick={() => { props.onEditSamplePcm?.(instrument, 'trim', activeEditorSelection, undefined, sampleEditorVariantIndex); setSampleEditorSelection(null); setSampleEditorZoom(1); }}>{t('music.sample.trimSelection')}</Button>
          <Button size="small" disabled={!selectedSampleFrames || !capabilities.sampleVolumeLoop} onClick={() => props.onSampleChange(instrument, { loopStart: activeEditorSelection.start, loopEnd: activeEditorSelection.end }, sampleEditorVariantIndex)}>{t('music.sample.setLoop')}</Button>
        </Flex>
      </Flex>}
    </Modal>
  </div>;
}
