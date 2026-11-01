import { appendMusicPattern, deleteMusicPattern, moveMusicOrder, resizeMusicPattern } from '@/utils/trackerPatternEditing';
import { trackerChannelAllowsInstrument, type TrackerChannelSettings } from '@/utils/trackerChannelSettings';
import { trackerEffectLabel } from '@/utils/trackerEffectLabels';
import { trackerMixerStorageKey } from '@/utils/trackerMixerState';
import { createTrackerNoteAudition } from '@/utils/trackerNoteAudition';
import { CustomerServiceOutlined } from '@ant-design/icons';
import { Alert, App, Button, Empty, Flex, message, Select, Tag, Tooltip, Typography } from 'antd';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { inferXmNoteLength, analyzeTrackerPreview, applyMusicEditorSourceCommand, compileMusicEditorSourceCommand, compileMusicEditorSourceDocument, createMusicEditorSourceDocument, createMusicEditorSourceSnapshot, createTrackerUuid, flattenItInstrumentModeForBuild, getMusicModuleFingerprint, hasUniqueTrackerUuidIds, isMusicEditorSourceDocument, isTrackerExtension, isTrackerUuid, MusicEditorSourceCommand, MusicEditorSourceDocument, MusicEditorSourceSnapshot, parseItPatternRows, parseItSamples, parseS3mPatternRows, parseS3mSamples, parseTrackerCompatibilityWarnings, parseTrackerModule, parseTrackerOrderTable, parseTrackerPlaybackRows, parseXmPatternRows, parseXmSamples, replaceItInstrumentPcm, replaceItSamplePcm, replaceS3mSamplePcm, replaceXmSamplePcm, restoreMusicEditorModuleSnapshot, restoreTrackerChannelPans, TRACKER_MOD_CHANNEL_PAN_DEFAULTS_VERSION, TrackerInstrumentPresetId, TrackerModuleInfo, TrackerPatternEvent, TrackerPatternEventUpdate, TrackerPlaybackPosition, TrackerSample, updateItPatternEvent, updateItPatternEvents, updateItSample, updateS3mPatternEvent, updateS3mPatternEvents, updateS3mSample, updateXmSample } from '@/utils/trackerModule';
import { ModEventUpdate, parseModModule, ParsedMod, replaceModSamplePcm, updateModEvents, updateModSample } from '@/utils/modPlayer';
import { TrackerPreviewPlayer } from '@/utils/trackerPreviewPlayer';
import { estimateTrackerSampleModuleSize } from '@/utils/trackerSampleEstimate';
import { createModPlaybackSequence } from '@/utils/trackerModPlaybackFlow';
import { buildTrackerPianoEdit, trackerPeriodToPitch, trackerPitchToPeriod, trackerPitchToStoredNote, trackerStoredNoteToPitch, TrackerRollFormat, TrackerRollNote } from '@/utils/trackerPianoRollModel';
import { trackerScoreDeletion } from '@/utils/trackerScoreDeletion';
import { trackerScoreTiming } from '@/utils/trackerScore';
import GBABeatEditor from './GBABeatEditor';
import './GBABeatEditor.css';
import './TrackerOrder.css';
import './TrackerScale.css';
import './TrackerInstrument.css';
import './TrackerLoading.css';
import { MusicNoteSelection, useOptionalMusicEditorWorkspace } from './MusicEditorWorkspace';
import { getMusicEditorFormatCapabilities } from './musicEditorCapabilities';
import { createTrackerProjectPackage, parseTrackerProjectPackage } from '@/utils/trackerProjectPackage';
import { readMusicEditorSettings, type MusicEditorSettings } from '@/utils/musicEditorSettings';
import { factorySamplePreviewTuning, factorySampleTuningEdit } from '@/utils/trackerFactoryTuning';
import { importTrackerModuleComposition } from '@/utils/trackerCompositionImport';
import { repairMusicCompositionStarterLoops, deleteMusicCompositionInstrument, addMusicCompositionInstrumentPreset, addMusicCompositionSampleToInstrument, duplicateMusicCompositionInstrument, isMusicCompositionDocument, MAX_MUSIC_COMPOSITION_INSTRUMENTS, MusicCompositionDocument, selectMusicExportTarget, MusicExportTarget, setMusicCompositionNoteProperties, setMusicCompositionChannelMix, setMusicCompositionPatternEffect, setMusicCompositionPatternName, setMusicCompositionSampleProperties, setMusicCompositionInstrumentName, setMusicCompositionInstrumentEnvelope, setMusicCompositionInstrumentZones, editMusicCompositionNotes, eraseMusicCompositionNoteRanges, deleteMusicCompositionNotes, omitMutedMusicCompositionChannels } from '@/utils/trackerComposition';
import { exportMusicComposition } from '@/utils/trackerCompositionExport';
import { decodeTrackerNotePan, encodeTrackerNotePan, isTrackerNotePanEffect } from '@/utils/trackerNotePan';
import { encodeTrackerDeltaPcm, prepareTrackerSamplePcm, TRACKER_SAMPLE_RATE } from '@/utils/trackerSamplePreparation';
import { useI18n } from '@/i18n/I18n';
import { editTrackerPcm, TrackerPcmEditOperation, TrackerPcmEditRange, TrackerPcmFrameEdit } from '@/utils/trackerPcmEditing';
import { useAppContexts } from '@/providers/contexts/AppContexts';

interface TrackerModuleViewerProps {
  url: string;
  extension: string;
  filename?: string;
  projectPackage?: boolean;
  onSaved?: () => void;
  onTargetSwitched?: () => void;
}

type ImportedAudioSource = {
  id: string;
  fileName: string;
  mimeType: string;
  sourceAudioData: string;
  sourcePcmData?: string;
  pcmFrames?: number;
  pcmEncoding?: 'float32le-interleaved';
  sampleRate: number;
  channels: number;
  durationSeconds: number;
  trimStart: number;
  trimEnd: number;
  gain: number;
  removeDc?: boolean;
  fadeInMs?: number;
  fadeOutMs?: number;
  instrumentIndex: number;
  noteZone?: { low: number; high: number };
};

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(binary);
};
const floatPcmToCanonicalBase64 = (samples: Float32Array) => {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Number.isFinite(samples[index]) ? Math.max(-1, Math.min(1, samples[index])) : 0;
    view.setInt16(index * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return bytesToBase64(bytes);
};
const floatPcmToCanonical8BitBase64 = (samples: Float32Array) => {
  const bytes = new Uint8Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const value = Number.isFinite(samples[index]) ? Math.max(-1, Math.min(1, samples[index])) : 0;
    bytes[index] = Math.round(value * (value < 0 ? 128 : 127)) & 0xff;
  }
  return bytesToBase64(bytes);
};
const base64ToBytes = (encoded: string) => {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};
const sampleWaveformTrace = (samples: Float32Array, points = 128) => Array.from({ length: points + 1 }, (_, point) => {
  const frame = Math.min(samples.length - 1, Math.floor(point * samples.length / points));
  return samples[frame] ?? 0;
});

const MAX_PERSISTED_XM_HISTORY_BYTES = 32 * 1024 * 1024;
const trimXmHistory = (undo: MusicEditorSourceSnapshot[], redo: MusicEditorSourceSnapshot[]) => {
  const boundedUndo = undo.slice(-32);
  const boundedRedo = redo.slice(-32);
  const bytes = () => [...boundedUndo, ...boundedRedo].reduce((total, snapshot) => total + Math.floor((snapshot.moduleData?.length ?? 0) * 0.75), 0);
  while (bytes() > MAX_PERSISTED_XM_HISTORY_BYTES && (boundedUndo.length || boundedRedo.length)) {
    if (boundedUndo.length >= boundedRedo.length && boundedUndo.length) boundedUndo.shift();
    else boundedRedo.shift();
  }
  return { undo: boundedUndo, redo: boundedRedo };
};

const documentFromXmSnapshot = (snapshot: MusicEditorSourceSnapshot): MusicEditorSourceDocument => {
  const { moduleData: _moduleData, ...document } = snapshot;
  return document;
};

const trackerPitchLabel = (note: number) => `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][(note - 1 + 1200) % 12]}${Math.floor((note - 1) / 12)}`;
const sampleZoneNames = (sample: TrackerSample) => (sample.variants?.length ? sample.variants : [sample]).map((variant, variantIndex) => {
  const notes = Array.from({ length: 96 }, (_, index) => index + 1).filter(note => (sample.noteMap?.[note - 1] ?? 0) === variantIndex);
  const ranges: Array<[number, number]> = [];
  for (const note of notes) {
    const last = ranges.at(-1);
    if (last && note === last[1] + 1) last[1] = note;
    else ranges.push([note, note]);
  }
  const range = ranges.length ? ranges.map(([low, high]) => low === high ? trackerPitchLabel(low) : `${trackerPitchLabel(low)}–${trackerPitchLabel(high)}`).join(', ') : 'unmapped';
  return `${variant.name || sample.name || `Sample ${variantIndex + 1}`}: ${range}`;
});

const TrackerModuleViewer: React.FC<TrackerModuleViewerProps> = ({ url, extension, filename, projectPackage = false, onSaved, onTargetSwitched }) => {
  const { settings, settingUtils } = useAppContexts() as any;
  const { t } = useI18n();
  const localizeTrackerWarning = (warning: string) => {
    const exactWarnings: Record<string, string> = {
      'Choose an empty tracker row for this note.': 'music.warning.emptyNoteRow',
      'The duration cannot cross an existing MOD event at its note cut row.': 'music.warning.modNoteCut',
      'The duration cannot overwrite a note at its note-off row.': 'music.warning.noteOffRow',
      'No decoded PCM samples were found; notes use oscillator fallback.': 'music.warning.noPcmSamples',
      'Some instrument/sample references have no decoded PCM data and use oscillator fallback.': 'music.warning.partialPcmSamples',
    };
    if (exactWarnings[warning]) return t(exactWarnings[warning]);
    const effects = warning.match(/^Effects not fully reproduced in browser preview: (.+)$/);
    if (effects) return t('music.warning.unsupportedEffects', { effects: effects[1].split(',').map(code => trackerEffectLabel(info?.format ?? extension.toUpperCase(), parseInt(code.trim(), 16), undefined, t)).join(', ') });
    const buildCoreItEffects = warning.match(/^The default GBA build core ignores these IT effects: (.+)\.$/);
    if (buildCoreItEffects) return t('music.warning.buildCoreItEffects', { effects: buildCoreItEffects[1] });
    const channelLimit = warning.match(/^This module has (\d+) channels; the default GBA build profile supports (\d+) active music channels\. Reduce channels or increase the project's music-channel limit\.$/);
    if (channelLimit) return t('music.warning.gbaChannelLimit', { channels: channelLimit[1], limit: channelLimit[2] });
    const targetChannelLimit = warning.match(/^([A-Z]{3}) authoring target supports (\d+) channels; (\d+) source channels are preserved but inactive for this target\.$/);
    if (targetChannelLimit) return t('music.warning.targetChannelLimit', { format: targetChannelLimit[1], limit: targetChannelLimit[2], preserved: targetChannelLimit[3] });
    return warning;
  };
  const { modal } = App.useApp();
  const musicWorkspace = useOptionalMusicEditorWorkspace();
  const markCurrentTrackDirty = () => {
    if (musicWorkspace?.selectedAssetId) musicWorkspace.setAssetDirty(musicWorkspace.selectedAssetId, true);
  };
  const setWorkspaceEditorInfo = musicWorkspace?.setEditorInfo;
  const setWorkspaceNoteSelection = musicWorkspace?.setNoteSelection;
  const saveEditedTrackerProjectRef = useRef<() => Promise<boolean>>(async () => false);
  const musicInspectorSelectionRef = useRef<MusicNoteSelection | null>(null);
  const musicInspectorEditRef = useRef<(detail: { row?: number; length?: number; note?: number; instrument?: number; volume?: number; pan?: number }) => void>(() => undefined);
  const editModSampleRef = useRef<(index: number, patch: { name?: string; volume?: number; loopStart?: number; loopLength?: number; fineTune?: number }) => void>(() => undefined);
  const editTrackerSampleRef = useRef<(index: number, patch: { volume?: number; loopStart?: number; loopEnd?: number }) => void>(() => undefined);
  const editUnifiedSampleRef = useRef<(index: number, patch: { volume?: number; loopStart?: number; loopEnd?: number; rootNote?: number; fineTune?: number; panning?: number }) => void>(() => undefined);
  const editSamplePcmRef = useRef<(index: number, operation: TrackerPcmEditOperation) => void>(() => undefined);
  const canonicalAuthoringPendingRef = useRef(false);
  const [info, setInfo] = useState<TrackerModuleInfo | null>(null);
  const [switchingMusicTarget, setSwitchingMusicTarget] = useState(false);
  const [artist, setArtist] = useState('');
  const [instrumentConfigs, setInstrumentConfigs] = useState<Record<string, Record<string, { color: string }>>>({});
  const [channelInstrumentTypes, setChannelInstrumentTypes] = useState<Record<string, 'Duty' | 'Wave' | 'Noise'>>({});
  const [channelSettings, setChannelSettings] = useState<TrackerChannelSettings>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mod, setMod] = useState<ParsedMod | null>(null);
  const [modUndo, setModUndo] = useState<ParsedMod[]>([]);
  const [modRedo, setModRedo] = useState<ParsedMod[]>([]);
  const [mutedChannels, setMutedChannels] = useState<boolean[]>([]);
  const [channelVolumes, setChannelVolumes] = useState<number[]>([]);
  const [channelPans, setChannelPans] = useState<number[]>([]);
  const [selectedCell, setSelectedCell] = useState({ row: 0, channel: 0 });
  const [selectedGridCells, setSelectedGridCells] = useState<Array<{ row: number; channel: number }>>([]);
  const [trackerClipboard, setTrackerClipboard] = useState<{ format: string; events: Array<{ rowOffset: number; channelOffset: number; event: TrackerPatternEvent }> } | null>(null);
  const [trackerQuantizeRows, setTrackerQuantizeRows] = useState(4);
  const [activeInstrument, setActiveInstrument] = useState(1);
  const trackerSelectionAnchor = useRef<{ row: number; channel: number } | null>(null);
  const undoXmEditRef = useRef<() => void>(() => undefined);
  const redoXmEditRef = useRef<() => void>(() => undefined);
  const undoTrackerEditRef = useRef<() => void>(() => undefined);
  const redoTrackerEditRef = useRef<() => void>(() => undefined);
  const musicCommandRef = useRef<(command: string) => void>(() => undefined);
  const [selectedPattern, setSelectedPattern] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(0);
  useEffect(() => {
    if (!info) return;
    // Pattern/order creation participates in module undo too. Clamp the cursor
    // when an undo restores a module with fewer patterns or order entries.
    setSelectedPattern(current => Math.max(0, Math.min(current, info.patterns - 1)));
    setSelectedOrder(current => Math.max(0, Math.min(current, info.orders - 1)));
  }, [info?.patterns, info?.orders]);
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [beatEditorView, setBeatEditorView] = useState<'roll' | 'keyboard' | 'tracker'>('roll');
  const [initialEditorSettings, setInitialEditorSettings] = useState(() => readMusicEditorSettings());
  const editorSettingsRef = useRef<MusicEditorSettings>(initialEditorSettings);
  const [xmPatternRows, setXmPatternRows] = useState<TrackerPatternEvent[][]>([]);
  const [s3mPatternRows, setS3mPatternRows] = useState<TrackerPatternEvent[][]>([]);
  const [itPatternRows, setItPatternRows] = useState<TrackerPatternEvent[][]>([]);
  const [moduleBytes, setModuleBytes] = useState<ArrayBuffer | null>(null);
  const [resolvedFormat, setResolvedFormat] = useState(extension.toUpperCase());
  const originalModuleBytes = useRef<ArrayBuffer | null>(null);
  const activeFormat = projectPackage ? resolvedFormat : extension.toUpperCase();
  const [musicSource, setMusicSource] = useState<MusicEditorSourceDocument | null>(null);
  const musicProjectId = useRef(createTrackerUuid());
  const musicProjectOrigin = useRef<'scratch' | 'imported'>('imported');
  const musicComposition = useRef<MusicCompositionDocument | null>(null);
  const sampleHistory = useRef(new WeakMap<object, MusicCompositionDocument['samples']>());
  const compositionHistory = useRef(new WeakMap<object, MusicCompositionDocument>());
  const restoreSampleHistory = (current: object, target: object) => {
    const composition = musicComposition.current;
    if (!composition) return;
    compositionHistory.current.set(current, composition);
    const restoredComposition = compositionHistory.current.get(target);
    if (restoredComposition) {
      musicComposition.current = restoredComposition;
      canonicalAuthoringPendingRef.current = true;
      return;
    }
    sampleHistory.current.set(current, composition.samples);
    const samples = sampleHistory.current.get(target);
    if (samples) musicComposition.current = { ...composition, samples };
  };
  const [importedAudioSources, setImportedAudioSources] = useState<ImportedAudioSource[]>([]);
  const [trackerSamples, setTrackerSamples] = useState<Map<number, TrackerSample>>(new Map());
  const importedAudioSourcesRef = useRef<ImportedAudioSource[]>([]);
  const appendImportedAudioSource = (source: ImportedAudioSource) => {
    const next = [...importedAudioSourcesRef.current, source];
    importedAudioSourcesRef.current = next;
    setImportedAudioSources(next);
  };
  const buildInstrumentSamples = (includeCanonicalMod = false) => {
    const samples = mod
    ? new Map<number, TrackerSample>(mod.samples.map((sample, index) => {
      const pcm = new Float32Array(sample.length);
      for (let frame = 0; frame < sample.length && sample.dataOffset + frame < mod.bytes.length; frame += 1) {
        pcm[frame] = ((mod.bytes[sample.dataOffset + frame] << 24) >> 24) / 128;
      }
      return [index + 1, {
        samples: pcm, sampleRate: 8363, loopStart: sample.loopStart,
        loopEnd: sample.loopLength > 2 ? sample.loopStart + sample.loopLength : sample.loopStart,
        rootNote: 49, fineTune: sample.finetune, name: sample.name,
        sixteenBit: false, volume: sample.volume, maxmodSampleGlobalVolume: 64, maxmodInstrumentGlobalVolume: 128,
      }];
    }))
    : new Map(trackerSamples);
    const composition = projectPackage ? musicComposition.current : null;
    // MOD's exported module already contains the exact sample slot order and
    // sample data used by playback. Canonical instrument indices refer to the
    // source composition and can differ after MOD export compacts its slots.
    // Overlaying by those stale indices makes Quick Preview use the wrong PCM.
    if (composition && isMusicCompositionDocument(composition) && (info?.format !== 'MOD' || includeCanonicalMod)) {
      for (const instrument of composition.instruments) {
        const variants = instrument.sampleIds.map(sampleId => composition.samples.find(item => item.id === sampleId)).filter((sample): sample is NonNullable<typeof sample> => Boolean(sample)).map(sample => {
          const bytes = base64ToBytes(sample.pcmData);
          const bytesPerValue = sample.bitDepth / 8;
          const frameCount = Math.floor(bytes.length / (bytesPerValue * sample.channels));
          const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
          const pcm = new Float32Array(frameCount);
          for (let frame = 0; frame < frameCount; frame += 1) {
            let value = 0;
            for (let channel = 0; channel < sample.channels; channel += 1) {
              const offset = (frame * sample.channels + channel) * bytesPerValue;
              value += (sample.bitDepth === 16 ? view.getInt16(offset, true) / 32768 : ((bytes[offset] << 24) >> 24) / 128) / sample.channels;
            }
            pcm[frame] = value;
          }
          return {
            samples: pcm, sampleRate: sample.sampleRate, loopStart: sample.loopStart, loopEnd: sample.loopEnd,
            rootNote: info?.format === 'MOD' ? sample.rootNote + 1 : sample.rootNote,
            fineTune: info?.format === 'MOD' ? sample.fineTune / 16 : sample.fineTune,
            ...(sample.tuningFormat === 'XM' ? factorySamplePreviewTuning(sample, info?.format ?? 'XM') : {}),
            panning: Math.max(0, Math.min(255, Math.round(sample.panning * 127 + 128))),
            name: sample.name,
            sixteenBit: sample.bitDepth === 16, volume: Math.round(sample.volume * 64),
            maxmodSampleGlobalVolume: sample.maxmodSampleGlobalVolume ?? 64,
            maxmodInstrumentGlobalVolume: sample.maxmodInstrumentGlobalVolume ?? 128,
            loopType: sample.loopType === 'forward' ? 1 : sample.loopType === 'ping-pong' ? 2 : 0,
          } satisfies TrackerSample;
        });
        if (!variants.length) continue;
        const first = variants[0];
        const base = samples.get(instrument.index + 1);
        const noteMap = Array.from({ length: 96 }, (_, note) => {
          const range = instrument.noteMap.find(item => note >= item.low && note <= item.high);
          const index = range ? instrument.sampleIds.indexOf(range.sampleId) : 0;
          return index >= 0 && index < variants.length ? index : 0;
        });
        samples.set(instrument.index + 1, {
          ...base, ...first, variants, noteMap,
          instrumentName: instrument.name,
          noteTranspose: info?.format === 'IT' ? undefined : base?.noteTranspose,
          volumeEnvelope: base?.volumeEnvelope,
          panningEnvelope: base?.panningEnvelope,
          fadeout: base?.fadeout,
          fadeoutMaximum: base?.fadeoutMaximum,
        });
      }
    }
    return samples;
  };
  const unifiedSamples = useMemo(() => buildInstrumentSamples(), [info?.format, mod, trackerSamples, projectPackage, moduleBytes]);
  const auditionSamples = useMemo(() => info?.format === 'MOD' && projectPackage ? buildInstrumentSamples(true) : unifiedSamples,
    [info?.format, mod, trackerSamples, projectPackage, moduleBytes, unifiedSamples]);
  const [xmUndo, setXmUndo] = useState<ArrayBuffer[]>([]);
  const [xmRedo, setXmRedo] = useState<ArrayBuffer[]>([]);
  const [xmSourceUndo, setXmSourceUndo] = useState<MusicEditorSourceSnapshot[]>([]);
  const [xmSourceRedo, setXmSourceRedo] = useState<MusicEditorSourceSnapshot[]>([]);
  const s3mUndo = useRef<ArrayBuffer[]>([]);
  const s3mRedo = useRef<ArrayBuffer[]>([]);
  const [itUndo, setItUndo] = useState<ArrayBuffer[]>([]);
  const [itRedo, setItRedo] = useState<ArrayBuffer[]>([]);
  const trackerPlayer = useRef(new TrackerPreviewPlayer());
  const selectedNotePlayer = useRef(new TrackerPreviewPlayer());
  useEffect(() => {
    const testInstrument = (event: Event) => {
      const note = (event as CustomEvent<{ note?: number }>).detail?.note;
      if (!info || info.format === 'unknown' || typeof note !== 'number' || !Number.isInteger(note) || note < 13 || note > 85) return;
      void trackerPlayer.current.auditionNote(note, activeInstrument, auditionSamples, info.format);
    };
    window.addEventListener('gba-studio:music-editor-test-instrument', testInstrument);
    return () => window.removeEventListener('gba-studio:music-editor-test-instrument', testInstrument);
  }, [activeInstrument, auditionSamples, info]);

  const selectedNoteTimer = useRef<number | null>(null);
  const selectedNoteGeneration = useRef(0);
  const stopSelectedNotePreview = () => {
    selectedNoteGeneration.current += 1;
    if (selectedNoteTimer.current !== null) window.clearTimeout(selectedNoteTimer.current);
    selectedNoteTimer.current = null;
    selectedNotePlayer.current.stop();
  };
  const trackerTimer = useRef<number | null>(null);
  const trackerGeneration = useRef(0);
  const trackerPreviewLoop = useRef(false);
  const loadedModuleUrl = useRef<string | null>(null);
  const playbackProjectPath = useRef(settingUtils?.projectPathFile ?? null);
  const [trackerPlaying, setTrackerPlaying] = useState(false);
  const mixerStorageKey = trackerMixerStorageKey(url, projectPackage ? musicProjectId.current : undefined);
  const xmPatternLength = Math.max(1, Math.min(256, musicSource?.patterns[selectedPattern]?.rows ?? 64));

  useEffect(() => {
    const stopPlayback = () => {
      trackerGeneration.current += 1;
      if (trackerTimer.current !== null) window.clearTimeout(trackerTimer.current);
      trackerTimer.current = null;
      trackerPlayer.current.stop();
      stopSelectedNotePreview();
    };

    const projectPath = settingUtils?.projectPathFile ?? null;
    if (playbackProjectPath.current !== projectPath) {
      playbackProjectPath.current = projectPath;
      stopPlayback();
      setTrackerPlaying(false);
    }
    return stopPlayback;
  }, [settingUtils?.projectPathFile]);

  useEffect(() => {
    const onMusicCommand = (event: Event) => {
      const command = (event as CustomEvent<{ command?: string }>).detail?.command;
      if (command) musicCommandRef.current(command);
    };
    window.addEventListener('gba-studio:music-edit-command', onMusicCommand);
    return () => window.removeEventListener('gba-studio:music-edit-command', onMusicCommand);
  }, []);

  useEffect(() => {
    setWorkspaceNoteSelection?.(null);
    return () => setWorkspaceNoteSelection?.(null);
  }, [url, setWorkspaceNoteSelection]);

  useEffect(() => {
    if (!setWorkspaceEditorInfo || !info) {
      setWorkspaceEditorInfo?.(null);
      return;
    }
    const patternSource = musicSource?.patterns[selectedPattern];
    const capabilities = getMusicEditorFormatCapabilities(info.format, Boolean(projectPackage));
    const selectedModPattern = mod?.patterns[selectedPattern] ?? [];
    const importedPatternRows = info.format === 'MOD' ? selectedModPattern.length : info.format === 'S3M' ? s3mPatternRows.length : info.format === 'IT' ? itPatternRows.length : 0;
    const importedPatternEvents = info.format === 'MOD'
      ? selectedModPattern.flat().filter(event => event.period || event.sample || event.effect || event.parameter).length
      : info.format === 'S3M' ? s3mPatternRows.flat().filter(event => event.note || event.instrument || event.volume || event.effect || event.parameter).length
        : info.format === 'IT' ? itPatternRows.flat().filter(event => event.note || event.instrument || event.volume || event.effect || event.parameter).length
          : 0;
    setWorkspaceEditorInfo({
      title: info.title,
      artist,
      format: info.format,
      capabilities,
      channels: info.channels,
      patterns: info.patterns,
      instruments: projectPackage && musicComposition.current
        ? musicComposition.current.instruments.length
        : info.format === 'IT' && info.instruments === 0 ? (info.sampleCount ?? 0) : info.instruments,
      tempo: projectPackage ? musicComposition.current?.tempoBpm ?? 125 : info.tempo ?? 125,
      speed: projectPackage ? musicComposition.current?.ticksPerRow ?? 6 : info.speed ?? 6,
      speedEditable: Boolean(projectPackage) || info.format === 'XM',
      selectedChannel,
      selectedPattern,
      patternName: musicComposition.current?.patterns.find(pattern => pattern.index === selectedPattern)?.name ?? patternSource?.name ?? `Pattern ${selectedPattern + 1}`,
      patternRows: patternSource?.rows ?? (info.format === 'XM' ? xmPatternRows.length : importedPatternRows),
      patternMinimumRows: Math.max(1, (patternSource?.events ?? []).reduce((max, event) => event.note || event.instrument || event.volume || event.effect || event.parameter ? Math.max(max, event.row + 1) : max, 0)),
      patternEvents: patternSource?.events.length ?? importedPatternEvents,
      patternNameEditable: capabilities.patternName,
      patternLengthEditable: capabilities.patternLength,
      patternOrderEditable: capabilities.patternOrder,
      selectedInstrument: activeInstrument,
      instrumentConfig: instrumentConfigs[musicComposition.current?.instruments.find(item => item.index === activeInstrument - 1)?.starterCategory ?? channelInstrumentTypes[String(selectedChannel)] ?? 'Duty']?.[String(activeInstrument)]
        ?? { color: musicComposition.current?.instruments.find(item => item.index === activeInstrument - 1)?.starterColor ?? ['#68c9b4', '#74a9ff', '#d995ff', '#ffbd68', '#fb8295', '#a9d275'][(activeInstrument - 1) % 6] },
      instrumentConfigs,
      channelInstrumentTypes, channelSettings, channelMuteStates: mutedChannels,
      instrumentCategories: projectPackage && musicComposition.current
        ? Object.fromEntries(musicComposition.current.instruments.flatMap(instrument => instrument.starterCategory ? [[String(instrument.index + 1), instrument.starterCategory]] : []))
        : undefined,
      instrumentPresetColors: projectPackage && musicComposition.current
        ? Object.fromEntries(musicComposition.current.instruments.flatMap(instrument => instrument.starterColor ? [[String(instrument.index + 1), instrument.starterColor]] : []))
        : undefined,
      instrumentNames: projectPackage && musicComposition.current
        ? Object.fromEntries(musicComposition.current.instruments.map(instrument => [String(instrument.index + 1), instrument.name]))
        : info.format === 'MOD'
          ? Object.fromEntries((mod?.samples ?? []).map((sample, index) => [String(index + 1), sample.name]))
          : Object.fromEntries([...trackerSamples.entries()].map(([index, sample]) => [String(index), sample.name ?? ''])),
      instrumentEnvelopes: projectPackage && musicComposition.current?.instruments.find(instrument => instrument.index === activeInstrument - 1)
        ? (() => { const instrument = musicComposition.current!.instruments.find(item => item.index === activeInstrument - 1)!; return { volume: instrument.volumeEnvelope, panning: instrument.panningEnvelope, fadeout: instrument.fadeout }; })()
        : undefined,
      instrumentZones: projectPackage && musicComposition.current?.instruments.find(instrument => instrument.index === activeInstrument - 1)
        ? (() => { const instrument = musicComposition.current!.instruments.find(item => item.index === activeInstrument - 1)!; return {
          zones: instrument.noteMap,
          samples: instrument.sampleIds.flatMap(id => { const sample = musicComposition.current!.samples.find(item => item.id === id); return sample ? [{ id, name: sample.name }] : []; }),
        }; })()
        : undefined,
      scratch: info.format === 'XM' && musicSource?.origin === 'scratch',
      canonicalProject: Boolean(projectPackage && isMusicCompositionDocument(musicComposition.current)),
      channelMuted: Boolean(mutedChannels[selectedChannel]),
      channelVolume: channelVolumes[selectedChannel] ?? 1,
      channelPan: channelPans[selectedChannel] ?? 0,
      instrumentSample: (() => {
        if (projectPackage && musicComposition.current) {
          const instrument = musicComposition.current.instruments.find(item => item.index === activeInstrument - 1);
          const sample = instrument?.sampleIds[0] ? musicComposition.current.samples.find(item => item.id === instrument.sampleIds[0]) : undefined;
          const parsedSample = unifiedSamples.get(activeInstrument);
          return sample && parsedSample ? {
            name: sample.name, volume: parsedSample.volume ?? 64, loopStart: sample.loopStart, loopEnd: sample.loopEnd,
            rootNote: parsedSample.rootNote, fineTune: parsedSample.fineTune ?? 0, panning: Math.max(0, Math.min(255, Math.round(sample.panning * 127 + 128))),
            length: parsedSample.samples.length, zones: [], waveform: sampleWaveformTrace(parsedSample.samples), pcmEditable: !parsedSample.sixteenBit,
          } : undefined;
        }
        if (info.format === 'MOD') {
          const sample = mod?.samples[activeInstrument - 1];
          const parsedSample = unifiedSamples.get(activeInstrument);
          return sample && parsedSample ? { name: sample.name, volume: sample.volume, loopStart: sample.loopStart, loopEnd: sample.loopStart + sample.loopLength, rootNote: 49, fineTune: sample.finetune, panning: 128, length: sample.length, zones: [], waveform: sampleWaveformTrace(parsedSample.samples), pcmEditable: !parsedSample.sixteenBit && !parsedSample.stereo && (parsedSample.variants?.length ?? 1) <= 1 } : undefined;
        }
        const sample = trackerSamples.get(activeInstrument);
        return sample ? { name: sample.name, volume: sample.volume, loopStart: sample.loopStart, loopEnd: sample.loopEnd, rootNote: sample.rootNote, fineTune: sample.fineTune ?? 0, panning: sample.panning ?? 128, length: sample.samples.length, zones: sampleZoneNames(sample), waveform: sampleWaveformTrace(sample.samples), pcmEditable: !sample.sixteenBit && !sample.stereo && (sample.variants?.length ?? 1) <= 1 } : undefined;
      })(),
      instrumentSampleEditable: capabilities.sampleVolumeLoop,
      instrumentSampleTuningEditable: capabilities.sampleTuning,
      instrumentSampleFineTuneEditable: capabilities.sampleFineTune,
    });
  }, [artist, channelSettings, channelInstrumentTypes, channelPans, channelVolumes, info, instrumentConfigs, itPatternRows, activeInstrument, mod, musicSource, mutedChannels, selectedChannel, selectedPattern, setWorkspaceEditorInfo, s3mPatternRows, trackerSamples, xmPatternRows]);

  useEffect(() => {
    const selectItem = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; index?: number }>).detail;
      if (!detail || !Number.isInteger(detail.index) || (detail.index ?? -1) < 0) return;
      // Prevent the music note inspector from restoring a stale note selection
      // after the user switches to a channel, pattern, or instrument.
      musicInspectorSelectionRef.current = null;
      setWorkspaceNoteSelection?.(null);
      if (detail.kind === 'pattern') {
        const pattern = Math.min(detail.index!, Math.max(0, (info?.patterns ?? 1) - 1));
        setSelectedPattern(pattern);
        const order = mod ? mod.patternTable.slice(0, mod.orders) : moduleBytes && info ? parseTrackerOrderTable(moduleBytes, info.format) : [];
        setSelectedOrder(current => {
          if (order[current] === pattern) return current;
          const matches = order.flatMap((value, index) => value === pattern ? [index] : []);
          return matches.reduce((nearest, candidate) => Math.abs(candidate - current) < Math.abs(nearest - current) ? candidate : nearest, matches[0] ?? current);
        });
      } else if (detail.kind === 'channel') {
        const channel = Math.min(detail.index!, Math.max(0, (info?.channels ?? 1) - 1));
        setSelectedChannel(channel);
        setSelectedCell(current => ({ ...current, channel }));
      } else if (detail.kind === 'instrument') {
        const selectedInstrument = Math.min(detail.index! + 1, Math.max(1, projectPackage && musicComposition.current ? musicComposition.current.instruments.length : info?.instruments ?? 1));
        setActiveInstrument(selectedInstrument);
        if (info && info.format !== 'unknown') void trackerPlayer.current.auditionNote(49, selectedInstrument, auditionSamples, info.format);
      }
    };
    window.addEventListener('gba-studio:music-select-item', selectItem);
    const handleAction = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; file?: File; preset?: TrackerInstrumentPresetId; name?: string; replaceSelected?: boolean; asVariant?: boolean; envelopeType?: 'volume' | 'panning'; envelope?: import('@/utils/trackerComposition').MusicCompositionEnvelope; fadeout?: number; zones?: Array<{ low: number; high: number; sampleId: string }> }>).detail;
      const instrumentCount = projectPackage && musicComposition.current ? musicComposition.current.instruments.length : info?.instruments ?? 0;
      if (detail?.kind === 'add-instrument' && instrumentCount < (projectPackage ? MAX_MUSIC_COMPOSITION_INSTRUMENTS : 16)) {
        if (projectPackage) addCanonicalInstrumentPreset(detail.preset ?? 'sine-lead');
        else if (musicSource?.origin === 'scratch') {
          const result = commitXmCommand({ type: 'append-instrument', preset: detail.preset ?? 'sine-lead' });
          if (result) refreshCanonicalCompositionFromModule(result, detail.preset ?? 'sine-lead');
        }
      }
      if (detail?.kind === 'set-instrument-name' && projectPackage && musicComposition.current && typeof detail.name === 'string') {
        const next = setMusicCompositionInstrumentName(musicComposition.current, activeInstrument - 1, detail.name);
        if (next !== musicComposition.current) {
          musicComposition.current = next;
          setInfo(current => current ? { ...current } : current);
          markCurrentTrackDirty();
        }
      }
      if (detail?.kind === 'set-instrument-envelope' && projectPackage && musicComposition.current && detail.envelopeType && detail.envelope) {
        const next = setMusicCompositionInstrumentEnvelope(musicComposition.current, activeInstrument - 1, detail.envelopeType, detail.envelope, detail.fadeout);
        if (next !== musicComposition.current) {
          musicComposition.current = next;
          setInfo(current => current ? { ...current } : current);
          canonicalAuthoringPendingRef.current = true;
          markCurrentTrackDirty();
        }
      }
      if (detail?.kind === 'set-instrument-zones' && projectPackage && musicComposition.current && detail.zones) {
        const next = setMusicCompositionInstrumentZones(musicComposition.current, activeInstrument - 1, detail.zones);
        if (next !== musicComposition.current) {
          musicComposition.current = next;
          setInfo(current => current ? { ...current } : current);
          canonicalAuthoringPendingRef.current = true;
          markCurrentTrackDirty();
        }
      }
      if (detail?.kind === 'duplicate-instrument' && projectPackage && instrumentCount < MAX_MUSIC_COMPOSITION_INSTRUMENTS) duplicateCanonicalInstrument();
      if (detail?.kind === 'import-sample' && detail.file && (musicSource?.origin === 'scratch' || ['MOD', 'XM', 'S3M', 'IT'].includes(info?.format ?? ''))) {
        window.dispatchEvent(new CustomEvent('gba-studio:music-editor-import-audio', { detail: { file: detail.file, replaceSelected: detail.replaceSelected, asVariant: detail.asVariant } }));
      }
    };
    window.addEventListener('gba-studio:music-editor-action', handleAction);
    const handleChannelSetting = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; value?: number; channel?: number }>).detail;
      if (!detail) return;
      if (detail.kind === 'toggle-mute') toggleChannel(detail.channel ?? selectedChannel);
      else if (detail.kind === 'volume' && typeof detail.value === 'number') updateChannelVolume(selectedChannel, detail.value);
      else if (detail.kind === 'pan' && typeof detail.value === 'number') updateChannelPan(selectedChannel, detail.value);
    };
    window.addEventListener('gba-studio:music-editor-set-channel', handleChannelSetting);
    const handleSampleSetting = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; volume?: number; loopStart?: number; loopEnd?: number; rootNote?: number; fineTune?: number; panning?: number }>).detail;
      if (!detail || !Object.values(detail).some(value => typeof value === 'number' || typeof value === 'string')) return;
      if (projectPackage && musicComposition.current) {
        editUnifiedSampleRef.current(activeInstrument, detail);
      } else if (info?.format === 'XM') {
        commitXmCommand({ type: 'patch-sample', sampleIndex: activeInstrument, patch: detail });
      } else if (info?.format === 'MOD') {
        const sample = mod?.samples[activeInstrument - 1];
        if (!sample) return;
        const loopStart = detail.loopStart ?? sample.loopStart;
        editModSampleRef.current(activeInstrument - 1, {
          name: detail.name,
          volume: detail.volume,
          loopStart: detail.loopStart,
          loopLength: detail.loopEnd === undefined ? undefined : Math.max(0, detail.loopEnd - loopStart),
          fineTune: detail.fineTune,
        });
      } else if (info?.format === 'S3M') {
        editTrackerSampleRef.current(activeInstrument, { volume: detail.volume, loopStart: detail.loopStart, loopEnd: detail.loopEnd });
      }
    };
    window.addEventListener('gba-studio:music-editor-set-sample', handleSampleSetting);
    const handleSamplePcmEdit = (event: Event) => {
      const operation = (event as CustomEvent<{ operation?: TrackerPcmEditOperation }>).detail?.operation;
      if (operation && ['normalize', 'remove-dc', 'reverse', 'fade-out'].includes(operation)) editSamplePcmRef.current(activeInstrument, operation);
    };
    window.addEventListener('gba-studio:music-editor-edit-sample-pcm', handleSamplePcmEdit);
    const handlePatternSetting = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; rows?: number }>).detail;
      if (!detail) return;
      if (projectPackage && musicComposition.current) {
        let composition = musicComposition.current;
        if (typeof detail.name === 'string') composition = setMusicCompositionPatternName(composition, selectedPattern, detail.name);
        if (typeof detail.rows === 'number') composition = resizeMusicPattern(composition, selectedPattern, detail.rows);
        if (composition !== musicComposition.current) commitCanonicalRollEdits([], selectedPattern, false, undefined, composition);
        return;
      }
      if (info?.format !== 'XM') return;
      if (typeof detail.name === 'string') {
        const result = commitXmCommand({ type: 'set-pattern-name', patternIndex: selectedPattern, name: detail.name });
        if (result && musicComposition.current) musicComposition.current = setMusicCompositionPatternName(musicComposition.current, selectedPattern, detail.name);
      }
      if (typeof detail.rows === 'number') {
        const result = commitXmCommand({ type: 'set-pattern-rows', patternIndex: selectedPattern, rows: detail.rows });
        if (result) refreshCanonicalCompositionFromModule(result);
      }
    };
    const handleTempoSetting = (event: Event) => {
      const tempo = (event as CustomEvent<{ value?: number }>).detail?.value;
      if (typeof tempo !== 'number' || !Number.isFinite(tempo)) return;
      const value = Math.max(32, Math.min(255, Math.round(tempo)));
      if (projectPackage && info) commitCanonicalRollEdits([], selectedPattern, false, { tempoBpm: value });
      else commitXmCommand({ type: 'set-tempo', tempo: value });
    };
    const handleSpeedSetting = (event: Event) => {
      const speed = (event as CustomEvent<{ value?: number }>).detail?.value;
      if (typeof speed !== 'number' || !Number.isFinite(speed)) return;
      const value = Math.max(1, Math.min(31, Math.round(speed)));
      if (projectPackage && info) commitCanonicalRollEdits([], selectedPattern, false, { ticksPerRow: value });
      else commitXmCommand({ type: 'set-speed', speed: value });
    };
    window.addEventListener('gba-studio:music-editor-set-pattern', handlePatternSetting);
    window.addEventListener('gba-studio:music-editor-set-tempo', handleTempoSetting);
    window.addEventListener('gba-studio:music-editor-set-speed', handleSpeedSetting);
    return () => {
      window.removeEventListener('gba-studio:music-select-item', selectItem);
      window.removeEventListener('gba-studio:music-editor-action', handleAction);
      window.removeEventListener('gba-studio:music-editor-set-channel', handleChannelSetting);
      window.removeEventListener('gba-studio:music-editor-set-sample', handleSampleSetting);
      window.removeEventListener('gba-studio:music-editor-edit-sample-pcm', handleSamplePcmEdit);
      window.removeEventListener('gba-studio:music-editor-set-pattern', handlePatternSetting);
      window.removeEventListener('gba-studio:music-editor-set-tempo', handleTempoSetting);
      window.removeEventListener('gba-studio:music-editor-set-speed', handleSpeedSetting);
    };
  }, [auditionSamples, channelSettings, mutedChannels, info, activeInstrument, mod, musicSource, moduleBytes, selectedChannel, selectedPattern, setWorkspaceNoteSelection, t]);

  useEffect(() => {
    const deleteSelected = () => {
      const target = musicWorkspace?.selectedEditorItem;
      if (!target || !['pattern', 'instrument'].includes(target.kind)) return;
      if (!(projectPackage && musicComposition.current) && info?.format !== 'XM') {
        message.warning(t('music.delete.scratchOnly'));
        return;
      }
      const label = target.kind === 'pattern' ? `Pattern ${target.index + 1}` : `Instrument ${String(target.index + 1).padStart(2, '0')}`;
      modal.confirm({
        title: t('music.delete.title', { item: label }),
        content: t(target.kind === 'pattern' ? 'music.delete.patternConfirm' : 'music.delete.confirm', { item: label }),
        okText: t('common.delete'), cancelText: t('common.cancel'), okButtonProps: { danger: true },
        onOk: () => {
          if (target.kind === 'pattern') {
            if ((info?.patterns ?? 0) <= 1) { message.warning(t('music.delete.keepOnePattern')); return; }
            if (projectPackage && musicComposition.current) {
              const composition = deleteMusicPattern(musicComposition.current, target.index);
              const next = Math.min(target.index, composition.patterns.length - 1);
              if (commitCanonicalRollEdits([], next, false, undefined, composition)) {
                setSelectedPattern(next);
                setSelectedOrder(Math.max(0, composition.order.findIndex(entry => entry.patternId === composition.patterns[next].id)));
                musicWorkspace?.selectEditorItem('pattern', next);
              }
              return;
            }
            const result = commitXmCommand({ type: 'delete-pattern', patternIndex: target.index });
            if (result) refreshCanonicalCompositionFromModule(result);
            const next = Math.min(target.index, Math.max(0, (info?.patterns ?? 1) - 2));
            setSelectedPattern(next); setSelectedOrder(next);
          } else {
            if ((info?.instruments ?? 0) <= 1) { message.warning(t('music.delete.keepOneInstrument')); return; }
            if (projectPackage && musicComposition.current) {
              deleteCanonicalInstrument(target.index);
              return;
            }
            const result = commitXmCommand({ type: 'delete-instrument', instrumentIndex: target.index + 1 });
            if (result) refreshCanonicalCompositionFromModule(result);
            setActiveInstrument(Math.min(target.index + 1, Math.max(1, (info?.instruments ?? 1) - 1)));
          }
        },
      });
    };
    window.addEventListener('gba-studio:music-delete-request', deleteSelected);
    return () => window.removeEventListener('gba-studio:music-delete-request', deleteSelected);
  }, [info, modal, musicSource, musicWorkspace?.selectedEditorItem, t]);

  useEffect(() => {
    if (!info || mutedChannels.length === 0 || loadedModuleUrl.current !== url) return;
    localStorage.setItem(mixerStorageKey, JSON.stringify({
      muted: mutedChannels,
      volumes: channelVolumes,
      pans: channelPans,
      ...(info.format === 'MOD' ? { panDefaultsVersion: TRACKER_MOD_CHANNEL_PAN_DEFAULTS_VERSION } : {}),
    }));
  }, [channelPans, channelVolumes, info, mixerStorageKey, mutedChannels, url]);

  useEffect(() => {
    let cancelled = false;
    loadedModuleUrl.current = null;
    setLoading(true);
    const defaultEditorSettings = readMusicEditorSettings();
    editorSettingsRef.current = defaultEditorSettings;
    setInitialEditorSettings(defaultEditorSettings);
    setBeatEditorView(defaultEditorSettings.view);
    trackerPreviewLoop.current = defaultEditorSettings.loop;
    setError(null);
    setInfo(null);
    setMod(null);
    setTrackerPlaying(false);
    setModUndo([]);
    setModRedo([]);
    setMutedChannels([]);
    setChannelVolumes([]);
    setChannelPans([]);
    setSelectedCell({ row: 0, channel: 0 });
    setSelectedGridCells([]);
    trackerSelectionAnchor.current = null;
    setSelectedPattern(0);
    setSelectedOrder(0);
    setSelectedChannel(0);
    setXmPatternRows([]);
    setS3mPatternRows([]);
    setItPatternRows([]);
    setModuleBytes(null);
    setMusicSource(null);
    musicComposition.current = null;
    canonicalAuthoringPendingRef.current = false;
    setTrackerSamples(new Map());
    setXmUndo([]);
    setXmRedo([]);
    setXmSourceUndo([]);
    setXmSourceRedo([]);
    s3mUndo.current = [];
    s3mRedo.current = [];
    setItUndo([]);
    setItRedo([]);
    if (!projectPackage && !isTrackerExtension(extension)) {
      setLoading(false);
      return;
    }
    void (async () => {
      let bytes: ArrayBuffer;
      let moduleFormat = extension.toUpperCase();
      let storedProjectSource: unknown = null;
      if (projectPackage) {
        const result = filename ? await window.electronAPI.loadTrackerProject(filename) : null;
        if (result?.status !== 'success') throw new Error(result?.message || 'Unable to load GBA Tracker project.');
        const archive = parseTrackerProjectPackage(base64ToBytes(result.data));
        const project = archive as { id?: string; schema?: string; version?: number; origin?: 'scratch' | 'imported'; format?: string; moduleData?: string; originalModuleData?: string; moduleFingerprint?: string; sourceDocument?: unknown; composition?: unknown; editorSettings?: unknown; importedAudioSources: ImportedAudioSource[] };
        let composition = isMusicCompositionDocument(project.composition) ? project.composition : null;
        if (project.schema !== 'gba-studio/music-project' || project.version !== 1 || !isTrackerUuid(project.id)
          || !['scratch', 'imported'].includes(project.origin ?? '')
          || !composition || Object.hasOwn(project, 'format') || Object.hasOwn(project, 'moduleData')
          || Object.hasOwn(project, 'originalModuleData') || Object.hasOwn(project, 'moduleFingerprint')
          ) throw new Error('Invalid GBA Tracker music project.');
        let repairedComposition = repairMusicCompositionStarterLoops(composition);
        if (project.origin === 'scratch' && repairedComposition.patterns.some(pattern => pattern.notes.some(note =>
          note.row + note.durationRows === pattern.rows && !note.endAtPatternBoundary))) {
          repairedComposition = { ...repairedComposition, patterns: repairedComposition.patterns.map(pattern => ({
            ...pattern, notes: pattern.notes.map(note => note.row + note.durationRows === pattern.rows
              ? { ...note, endAtPatternBoundary: true } : note),
          })) };
        }
        const hadPreviewMute = composition.channels.some(channel => channel.muted);
        const repairedStarterLoops = repairedComposition !== composition || hadPreviewMute;
        composition = hadPreviewMute ? { ...repairedComposition, channels: repairedComposition.channels.map(channel => ({ ...channel, muted: false })) } : repairedComposition;
        if (repairedStarterLoops) canonicalAuthoringPendingRef.current = true;
        musicProjectId.current = project.id;
        if (!cancelled) {
          const settings = readMusicEditorSettings(project.editorSettings);
          editorSettingsRef.current = settings;
          setInitialEditorSettings(settings);
          setBeatEditorView(settings.view);
          trackerPreviewLoop.current = settings.loop;
        }
        musicProjectOrigin.current = project.origin!;
        moduleFormat = composition.targetFormat;
        let cachedModule = new Uint8Array(exportMusicComposition(composition, moduleFormat).moduleData);
        if (!repairedStarterLoops && moduleFormat === 'XM' && isMusicEditorSourceDocument(project.sourceDocument) && project.sourceDocument.origin === 'scratch') {
          const sourceModule = new Uint8Array(compileMusicEditorSourceDocument(project.sourceDocument));
          if (getMusicModuleFingerprint(sourceModule.buffer) === project.sourceDocument.moduleFingerprint) cachedModule = sourceModule;
        }
        bytes = cachedModule.buffer.slice(cachedModule.byteOffset, cachedModule.byteOffset + cachedModule.byteLength);
        const sourceModuleData = composition.sourceModules[0]?.moduleData;
        const originalModule = typeof sourceModuleData === 'string' && sourceModuleData
          ? base64ToBytes(sourceModuleData)
          : cachedModule;
        originalModuleBytes.current = originalModule.buffer.slice(originalModule.byteOffset, originalModule.byteOffset + originalModule.byteLength);
        musicComposition.current = composition;
        storedProjectSource = repairedStarterLoops ? null : project.sourceDocument ?? null;
        if (repairedStarterLoops) markCurrentTrackDirty();
        const importedAudioSources = project.importedAudioSources;
        if (!Array.isArray(importedAudioSources) || !hasUniqueTrackerUuidIds(importedAudioSources) || importedAudioSources.some(source => !source
          || typeof source.fileName !== 'string' || typeof source.mimeType !== 'string'
          || typeof source.sourceAudioData !== 'string' || !Number.isFinite(source.sampleRate)
          || !Number.isFinite(source.channels) || !Number.isFinite(source.durationSeconds))) {
          throw new Error('Invalid imported audio sources in GBA Tracker project.');
        }
        importedAudioSourcesRef.current = importedAudioSources;
        setImportedAudioSources(importedAudioSources);
        setResolvedFormat(moduleFormat);
      } else {
        musicProjectId.current = createTrackerUuid();
        musicProjectOrigin.current = 'imported';
        importedAudioSourcesRef.current = [];
        setImportedAudioSources([]);
        bytes = await window.electronAPI.readImageBytes(url);
        originalModuleBytes.current = bytes.slice(0);
        setResolvedFormat(moduleFormat);
      }
      if (!cancelled) {
        loadedModuleUrl.current = url;
        let sourceMixer: MusicEditorSourceDocument['channelMixer'];
        if (moduleFormat === 'XM') {
          let storedSource: unknown = storedProjectSource;
          try {
            if (!projectPackage) storedSource = filename ? await window.electronAPI.loadMusicEditorSource(filename) : null;
          } catch {
            storedSource = null;
          }
          if (cancelled) return;
          const previousSource = isMusicEditorSourceDocument(storedSource) ? storedSource : null;
          const sourceFilename = previousSource?.assetFileName ?? filename ?? 'untitled.xm';
          const currentSource = createMusicEditorSourceDocument(bytes, sourceFilename);
          let restoredSource = previousSource?.moduleFingerprint === currentSource.moduleFingerprint
            ? createMusicEditorSourceDocument(bytes, sourceFilename, previousSource)
            : currentSource;
          sourceMixer = restoredSource.channelMixer;
          if (restoredSource.origin === 'scratch') {
            const undoSnapshots = restoredSource.history?.undo ?? [];
            const redoSnapshots = restoredSource.history?.redo ?? [];
            try {
              setXmSourceUndo(undoSnapshots);
              setXmSourceRedo(redoSnapshots);
              setXmUndo(undoSnapshots.map(snapshot => compileMusicEditorSourceDocument(snapshot)));
              setXmRedo(redoSnapshots.map(snapshot => compileMusicEditorSourceDocument(snapshot)));
            } catch {
              restoredSource = { ...restoredSource, history: undefined };
              setXmSourceUndo([]);
              setXmSourceRedo([]);
              setXmUndo([]);
              setXmRedo([]);
              message.warning(t('music.warning.historyScratch'));
            }
          } else if (restoredSource.origin === 'imported' && restoredSource.history) {
            const undoSnapshots = restoredSource.history.undo;
            const redoSnapshots = restoredSource.history.redo;
            try {
              setXmSourceUndo(undoSnapshots);
              setXmSourceRedo(redoSnapshots);
              setXmUndo(undoSnapshots.map(restoreMusicEditorModuleSnapshot));
              setXmRedo(redoSnapshots.map(restoreMusicEditorModuleSnapshot));
            } catch {
              restoredSource = { ...restoredSource, history: undefined };
              setXmSourceUndo([]);
              setXmSourceRedo([]);
              setXmUndo([]);
              setXmRedo([]);
              message.warning(t('music.warning.historyImported'));
            }
          }
          setMusicSource(restoredSource);
        }
        setModuleBytes(bytes);
        const format = moduleFormat;
        setTrackerSamples(format === 'XM' ? parseXmSamples(bytes) : format === 'S3M' ? parseS3mSamples(bytes) : format === 'IT' ? parseItSamples(bytes) : new Map());
        setInfo(parseTrackerModule(bytes, moduleFormat));
        const parsedInfo = parseTrackerModule(bytes, moduleFormat);
        const defaultMixer = {
          muted: Array.from({ length: parsedInfo.channels }, () => false),
          volumes: Array.from({ length: parsedInfo.channels }, () => 1),
          pans: Array.from({ length: format === 'S3M' ? 32 : parsedInfo.channels }, (_, index) => format === 'MOD' || format === 'S3M' ? parsedInfo.channelPans?.[index] ?? 0 : 0),
        };
        let savedMixer: Partial<typeof defaultMixer> & { panDefaultsVersion?: number } = {};
        try {
          savedMixer = JSON.parse(localStorage.getItem(trackerMixerStorageKey(url, projectPackage ? musicProjectId.current : undefined)) ?? '{}');
        } catch {
          savedMixer = {};
        }
        if (projectPackage && musicComposition.current) {
          const channels = musicComposition.current.channels;
          savedMixer = {
            ...defaultMixer,
            volumes: defaultMixer.volumes.map((value, index) => channels.find(channel => channel.index === index)?.volume ?? value),
            pans: defaultMixer.pans.map((value, index) => channels.find(channel => channel.index === index)?.pan ?? value),
            ...savedMixer,
          };
        } else if (sourceMixer) savedMixer = { ...sourceMixer, muted: Array.isArray(savedMixer.muted) ? savedMixer.muted : sourceMixer.muted };
        const channels = parsedInfo.channels;
        setMutedChannels(Array.from({ length: channels }, (_, index) => savedMixer.muted?.[index] === true));
        setChannelVolumes(Array.from({ length: channels }, (_, index) => Number.isFinite(savedMixer.volumes?.[index]) ? Math.max(0, Math.min(1, Number(savedMixer.volumes?.[index]))) : defaultMixer.volumes[index]));
        setChannelPans(restoreTrackerChannelPans(format, defaultMixer.pans, savedMixer.pans, savedMixer.panDefaultsVersion));
        if (moduleFormat === 'MOD') {
          const parsed = parseModModule(bytes);
          setMod(parsed);
          if (!parsed) setMutedChannels([]);
        }
        if (moduleFormat === 'XM') setXmPatternRows(parseXmPatternRows(bytes, 0, 256));
        if (moduleFormat === 'S3M') {
          const rows = parseS3mPatternRows(bytes, 0, 64);
          setS3mPatternRows(rows);
        }
        if (moduleFormat === 'IT') setItPatternRows(parseItPatternRows(bytes, 0, 256));
      }
    })().catch((reason: unknown) => {
      if (!cancelled) setError(t('music.warning.inspectionFailed'));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; trackerGeneration.current += 1; if (trackerTimer.current !== null) window.clearTimeout(trackerTimer.current); trackerPlayer.current.stop(); stopSelectedNotePreview(); };
  }, [extension, filename, projectPackage, t, url]);

  useEffect(() => {
    if (!moduleBytes || activeFormat === 'MOD') return;
    const format = activeFormat;
    if (format === 'XM') setXmPatternRows(parseXmPatternRows(moduleBytes, selectedPattern, 256));
    if (format === 'S3M') setS3mPatternRows(parseS3mPatternRows(moduleBytes, selectedPattern, 64));
    if (format === 'IT') setItPatternRows(parseItPatternRows(moduleBytes, selectedPattern, 256));
  }, [activeFormat, moduleBytes, selectedPattern]);

  useEffect(() => {
    if (!moduleBytes || loadedModuleUrl.current !== url || activeFormat !== 'XM') return;
    setMusicSource(previous => {
      const next = createMusicEditorSourceDocument(moduleBytes, previous?.assetFileName ?? filename ?? 'untitled.xm', previous);
      return previous?.moduleFingerprint === next.moduleFingerprint ? previous : next;
    });
  }, [activeFormat, filename, moduleBytes, url]);

  useEffect(() => {
    if (!moduleBytes) return;
    const format = activeFormat;
    if (format === 'XM') setTrackerSamples(parseXmSamples(moduleBytes));
    else if (format === 'S3M') setTrackerSamples(parseS3mSamples(moduleBytes));
    else if (format === 'IT') setTrackerSamples(parseItSamples(moduleBytes));
  }, [activeFormat, moduleBytes]);

  useEffect(() => {
    if (!moduleBytes) return;
    const bytes = activeFormat === 'MOD' && mod ? mod.bytes.slice().buffer : moduleBytes;
    const parsed = parseTrackerModule(bytes, activeFormat);
    const composition = projectPackage ? musicComposition.current : null;
    setInfo(composition ? { ...parsed, tempo: composition.tempoBpm, speed: composition.ticksPerRow } : parsed);
  }, [activeFormat, moduleBytes, mod, projectPackage]);

  useEffect(() => {
    if (!info) return;
    if (info.patterns > 0 && selectedPattern >= info.patterns) setSelectedPattern(info.patterns - 1);
    if (info.orders > 0 && selectedOrder >= info.orders) setSelectedOrder(info.orders - 1);
  }, [info, selectedOrder, selectedPattern]);

  useEffect(() => {
    let cancelled = false;
    setArtist('');
    setInstrumentConfigs({});
    setChannelInstrumentTypes({});
    setChannelSettings({});
    if (filename) void window.electronAPI.loadMusicMetadata(filename).then((result: any) => {
      if (!cancelled && result?.status === 'success') {
        setArtist(result.artist ?? '');
        setChannelSettings(result.channelSettings && typeof result.channelSettings === 'object' ? result.channelSettings : {});
        const raw = result.instruments && typeof result.instruments === 'object' ? result.instruments : {};
        // Migrate the earlier per-instrument category/color document in memory.
        if (Object.values(raw).some((value: any) => value && typeof value === 'object' && 'category' in value)) {
          const migrated: Record<string, Record<string, { color: string }>> = { Duty: {}, Wave: {}, Noise: {} };
          for (const [id, value] of Object.entries(raw) as Array<[string, any]>) {
            const type = ['Duty', 'Wave', 'Noise'].includes(value?.category) ? value.category : 'Duty';
            migrated[type][id] = { color: /^#[0-9a-f]{6}$/i.test(value?.color) ? value.color : '#59c7b3' };
          }
          setInstrumentConfigs(migrated);
        } else {
          setInstrumentConfigs(raw);
          setChannelInstrumentTypes(result.channelInstrumentTypes && typeof result.channelInstrumentTypes === 'object' ? result.channelInstrumentTypes : {});
        }
      }
    });
    return () => { cancelled = true; };
  }, [filename]);

  useEffect(() => {
    const updateArtist = (event: Event) => {
      const value = (event as CustomEvent<{ artist?: string }>).detail?.artist;
      if (typeof value !== 'string' || !filename) return;
      setArtist(value);
      void window.electronAPI.saveMusicMetadata(filename, { artist: value }).then((result: any) => {
        if (result?.status !== 'success') message.error(t('music.warning.artistSaveFailed'));
      });
    };
    window.addEventListener('gba-studio:music-editor-set-artist', updateArtist);
    return () => window.removeEventListener('gba-studio:music-editor-set-artist', updateArtist);
  }, [filename, message]);

  useEffect(() => {
    const updateInstrumentConfig = (event: Event) => {
      const detail = (event as CustomEvent<{ index?: number; type?: 'Duty' | 'Wave' | 'Noise'; color?: string }>).detail;
      if (!filename || !Number.isInteger(detail?.index) || (detail?.index ?? -1) < 0 || !detail.type || !detail.color || !/^#[0-9a-f]{6}$/i.test(detail.color)) return;
      const type = detail.type;
      const id = String(detail.index! + 1);
      const next = { ...instrumentConfigs, [type]: { ...instrumentConfigs[type], [id]: { color: detail.color } } };
      setInstrumentConfigs(next);
      void window.electronAPI.saveMusicMetadata(filename, { instruments: next }).then((result: any) => {
        if (result?.status !== 'success') message.error(t('music.warning.instrumentSaveFailed'));
      });
    };
    window.addEventListener('gba-studio:music-editor-set-instrument', updateInstrumentConfig);
    return () => window.removeEventListener('gba-studio:music-editor-set-instrument', updateInstrumentConfig);
  }, [filename, instrumentConfigs, message]);

  useEffect(() => {
    const update = (event: Event) => {
      const detail = (event as CustomEvent<{ channel?: number; name?: string; instrumentType?: string; hidden?: boolean }>).detail;
      if (!filename || !detail || !Number.isInteger(detail.channel) || detail.channel! < 0 || detail.channel! >= (info?.channels ?? 0)) return;
      const patch = {
        ...(typeof detail.name === 'string' ? { name: detail.name.trim().slice(0, 64) } : {}),
        ...(['Any', 'Duty', 'Wave', 'Noise', 'Other'].includes(detail.instrumentType ?? '') ? { instrumentType: detail.instrumentType as NonNullable<TrackerChannelSettings[string]['instrumentType']> } : {}),
        ...(typeof detail.hidden === 'boolean' ? { hidden: detail.hidden } : {}),
      };
      const next = { ...channelSettings, [String(detail.channel)]: { ...channelSettings[String(detail.channel)], ...patch } };
      setChannelSettings(next);
      void window.electronAPI.saveMusicMetadata(filename, { channelSettings: next }).then((result: any) => {
        if (result?.status !== 'success') message.error(t('music.warning.instrumentSaveFailed'));
      });
    };
    window.addEventListener('gba-studio:music-editor-set-channel-settings', update);
    return () => window.removeEventListener('gba-studio:music-editor-set-channel-settings', update);
  }, [filename, channelSettings, info?.channels, t]);

  const instrumentsAllowed = (edits: Array<{ channel: number; instrument: number }>) => {
    const mismatch = edits.find(edit => edit.instrument > 0 && !trackerChannelAllowsInstrument(channelSettings, edit.channel,
      musicComposition.current?.instruments.find(item => item.index === edit.instrument - 1)?.starterCategory ?? 'Other'));
    if (!mismatch) return true;
    message.warning(t('music.channels.instrumentMismatch', { channel: channelSettings[String(mismatch.channel)]?.name || String(mismatch.channel + 1), category: channelSettings[String(mismatch.channel)]?.instrumentType ?? 'Any' }));
    return false;
  };
  useEffect(() => {
    const updateChannelType = (event: Event) => {
      const detail = (event as CustomEvent<{ channel?: number; instrumentType?: 'Duty' | 'Wave' | 'Noise' }>).detail;
      if (!filename || !Number.isInteger(detail?.channel) || (detail?.channel ?? -1) < 0 || !['Duty', 'Wave', 'Noise'].includes(detail.instrumentType ?? '')) return;
      const next = { ...channelInstrumentTypes, [String(detail.channel)]: detail.instrumentType! };
      setChannelInstrumentTypes(next);
      void window.electronAPI.saveMusicMetadata(filename, { channelInstrumentTypes: next }).then((result: any) => {
        if (result?.status !== 'success') message.error(t('music.warning.instrumentSaveFailed'));
      });
    };
    window.addEventListener('gba-studio:music-editor-set-channel-instrument-type', updateChannelType);
    return () => window.removeEventListener('gba-studio:music-editor-set-channel-instrument-type', updateChannelType);
  }, [filename, channelInstrumentTypes, message]);

  useEffect(() => {
    setSelectedGridCells([]);
    trackerSelectionAnchor.current = null;
  }, [selectedPattern]);

  useEffect(() => {
    if (!musicWorkspace || !info || info.format === 'XM' || info.format === 'unknown') return;
    // The unified editor owns note selection when module bytes are loaded.
    // Publishing the legacy grid cursor here would replace an explicit channel selection.
    if (moduleBytes) return;
    setWorkspaceNoteSelection?.(musicInspectorSelectionRef.current);
  }, [Boolean(musicWorkspace), info?.format, mod, moduleBytes, selectedCell, selectedGridCells, selectedPattern, setWorkspaceNoteSelection]);

  useEffect(() => {
    if (!musicWorkspace || !info || info.format === 'XM' || info.format === 'unknown') return;
    if (moduleBytes) return;
    const edit = (event: Event) => {
      const detail = (event as CustomEvent<{ row?: number; length?: number; note?: number; instrument?: number; volume?: number }>).detail;
      if (detail) musicInspectorEditRef.current(detail);
    };
    window.addEventListener('gba-studio:music-editor-edit-note', edit);
    return () => window.removeEventListener('gba-studio:music-editor-edit-note', edit);
  }, [Boolean(musicWorkspace), info?.format, moduleBytes]);

  // This hook must remain before the loading/error returns below. Tracker
  // inspection is asynchronous, so returning before it on the first render
  // changes the hook count and triggers React's "rendered more hooks" error.
  useEffect(() => {
    const undo = () => info?.format === 'XM' ? undoXmEditRef.current() : undoTrackerEditRef.current();
    const redo = () => info?.format === 'XM' ? redoXmEditRef.current() : redoTrackerEditRef.current();
    window.addEventListener('gba-studio:editor-undo', undo);
    window.addEventListener('gba-studio:editor-redo', redo);
    return () => {
      window.removeEventListener('gba-studio:editor-undo', undo);
      window.removeEventListener('gba-studio:editor-redo', redo);
    };
  }, [info?.format]);

  useEffect(() => {
    const assetId = musicWorkspace?.selectedAssetId;
    const register = musicWorkspace?.registerAssetSaveHandler;
    if (!assetId || !register) return;
    register(assetId, () => saveEditedTrackerProjectRef.current());
    return () => register(assetId, null);
  }, [musicWorkspace?.registerAssetSaveHandler, musicWorkspace?.selectedAssetId]);

  const patternRowsByIndex = useMemo(() => Array.from({ length: info?.patterns ?? 0 }, (_, patternIndex) => info?.format === 'XM' && moduleBytes
    ? parseXmPatternRows(moduleBytes, patternIndex, 256)
    : info?.format === 'S3M' && moduleBytes
      ? parseS3mPatternRows(moduleBytes, patternIndex, 64).map(row => row.map(event => ({
        ...event,
        // Timeline roll rows use the editor's linear pitch numbering, while
        // S3M stores octave/semitone nibbles in the note byte.
        note: event.note === 254 ? 97 : event.note === 255 ? 0 : event.notePresent && event.note < 0xf0 ? trackerStoredNoteToPitch('S3M', event.note) : 0,
      })))
      : info?.format === 'IT' && moduleBytes
        ? parseItPatternRows(moduleBytes, patternIndex, 256).map(row => row.map(event => ({
          ...event,
          // IT stores pitches as zero-based values; the piano roll is one-based.
          note: event.note === 255 ? 97 : event.note === 254 ? 98
            : event.note >= 120 && event.note <= 252 ? 99
              : (event.notePresent ?? event.instrument > 0) && event.note >= 0 && event.note <= 119 ? event.note + 1 : 0,
        })))
        : (mod?.patterns[patternIndex] ?? []).map(row => row.map(event => ({ note: event.period ? trackerPeriodToPitch(event.period) : event.effect === 14 && (event.parameter >> 4) === 12 ? 97 : 0, instrument: event.sample, volume: 0, effect: event.effect, parameter: event.parameter })))), [info?.format, info?.patterns, moduleBytes, mod]);

  if (loading) return <Flex className="gba-music-loading" justify="center" align="center" role="status" aria-label={t('music.loading')}>
    <CustomerServiceOutlined className="gba-music-loading-headset" aria-hidden="true" />
  </Flex>;
  if (error) return <Alert type="error" showIcon message={t('music.warning.inspectionFailed')} description={error} />;
  if (!info || info.format === 'unknown') return <Empty description={t('music.warning.unknownFormat')} />;
  const capabilities = getMusicEditorFormatCapabilities(info.format, Boolean(projectPackage));

  const previewExistingNote = async (row: number, channel: number, patternIndex: number, effectEdit?: { row: number; effect: number; parameter: number }) => {
    if (trackerPlaying) return;
    stopSelectedNotePreview();
    const generation = selectedNoteGeneration.current;
    const displayRows = patternRowsByIndex[patternIndex] ?? [];
    if (!displayRows[row]?.[channel]) return;
    const sourceRows: TrackerPatternEvent[][] = info.format === 'MOD'
      ? (mod?.patterns[patternIndex] ?? []).map(cells => cells.map(event => ({ note: event.period ? trackerPeriodToPitch(event.period) : 0, period: event.period || undefined, instrument: event.sample, volume: 0, effect: event.effect, parameter: event.parameter })))
      : !moduleBytes ? [] : info.format === 'XM' ? parseXmPatternRows(moduleBytes, patternIndex, 256)
        : info.format === 'S3M' ? parseS3mPatternRows(moduleBytes, patternIndex, 64)
          : parseItPatternRows(moduleBytes, patternIndex, 256);
    // React's saved module state updates on the next render. Audition the exact
    // value just released by the control, including effects inside a held note.
    if (effectEdit && sourceRows[effectEdit.row]?.[channel]) {
      sourceRows[effectEdit.row][channel] = { ...sourceRows[effectEdit.row][channel], effect: effectEdit.effect, parameter: effectEdit.parameter };
    }
    const event = sourceRows[row]?.[channel];
    if (!event) return;
    const audition = createTrackerNoteAudition(sourceRows, displayRows, row, channel, info.channels,
      info.format as MusicExportTarget, info.speed ?? 6, info.tempo ?? 125, activeInstrument, info.globalVolume);
    try {
      const duration = await selectedNotePlayer.current.play(audition.rows, info.channels, audition.speed, audition.tempo, [], unifiedSamples, info.format, [], channelPans, undefined, false, audition.globalVolume, projectPackage ? musicProjectOrigin.current === 'scratch' : musicSource?.origin === 'scratch', info.format === 'IT' && Boolean(moduleBytes && (new Uint8Array(moduleBytes)[0x2c] & 0x08)), [], true);
      if (generation === selectedNoteGeneration.current) selectedNoteTimer.current = window.setTimeout(stopSelectedNotePreview, duration);
    } catch {
      if (generation === selectedNoteGeneration.current) { stopSelectedNotePreview(); message.error(t('music.preview.failed')); }
    }
  };

  const previewEditorSample = (sample: TrackerSample, note: number, durationRows?: number) => {
    stopSelectedNotePreview();
    const duration = durationRows === undefined ? undefined : durationRows * (info.speed ?? 6) * 2.5 / (info.tempo ?? 125);
    // The editor already resolved the selected variant. Do not remap it to a
    // different sample or apply instrument-keyboard transposition a second time.
    const samples = new Map<number, TrackerSample>([[1, { ...sample, variants: undefined, noteMap: undefined, noteTranspose: undefined }]]);
    void trackerPlayer.current.auditionNote(note, 1, samples, info.format, duration);
  };

  const toggleTrackerPreview = async (startRow = 0, onRow?: (row: number, position?: TrackerPlaybackPosition) => void, rowOverride?: TrackerPatternEvent[][], forceStart = false) => {
    stopSelectedNotePreview();
    if (trackerPlaying && !forceStart) {
      trackerGeneration.current += 1;
      if (trackerTimer.current !== null) window.clearTimeout(trackerTimer.current);
      trackerPlayer.current.stop();
      setTrackerPlaying(false);
      return;
    }
    const generation = ++trackerGeneration.current;
    const modRows = mod ? mod.patternTable.slice(0, mod.orders).flatMap(patternIndex => (mod.patterns[patternIndex] ?? []).map(row => row.map(event => ({
      note: event.period ? trackerPeriodToPitch(event.period) : event.effect === 14 && (event.parameter >> 4) === 12 ? 97 : 0,
      period: event.period || undefined,
      instrument: event.sample,
      volume: 0,
      effect: event.effect,
      parameter: event.parameter,
    })))) : null;
    const playbackPositions: TrackerPlaybackPosition[] = [];
    const rows = rowOverride ?? (modRows ?? (moduleBytes
      ? parseTrackerPlaybackRows(moduleBytes, info.format, 65536, position => playbackPositions.push(position))
      : (info.format === 'XM' ? xmPatternRows : info.format === 'S3M' ? s3mPatternRows : itPatternRows)));
    if (rows.length === 0) { message.warning(t('music.preview.noRows')); return; }
    const offset = Math.max(0, Math.min(rows.length - 1, Math.trunc(startRow)));
    const modSourceRows = info.format === 'MOD' && !rowOverride ? createModPlaybackSequence(rows) : null;
    const modSequenceStart = modSourceRows ? modSourceRows.findIndex(row => row >= offset) : -1;
    const playbackRows = modSourceRows
      ? modSequenceStart >= 0 ? modSourceRows.slice(modSequenceStart).map(row => rows[row]) : []
      : rows.slice(offset);
    if (playbackRows.length === 0) { message.warning(t('music.preview.noRows')); return; }
    setTrackerPlaying(true);
    let durationMs = 0;
    try {
      durationMs = await trackerPlayer.current.play(playbackRows, info.channels, info.speed, info.tempo, mutedChannels, unifiedSamples, info.format === 'MOD' || info.format === 'XM' || info.format === 'S3M' || info.format === 'IT' ? info.format : 'XM', channelVolumes, channelPans, row => {
        const playbackIndex = modSourceRows ? modSourceRows[modSequenceStart + row] : row + offset;
        onRow?.(playbackIndex, playbackPositions[playbackIndex]);
      }, false, info.globalVolume, projectPackage ? musicProjectOrigin.current === 'scratch' : musicSource?.origin === 'scratch', info.format === 'IT' && Boolean(moduleBytes && (new Uint8Array(moduleBytes)[0x2c] & 0x08)), info.maxmodChannelVolumes);
    } catch (error) {
      if (generation === trackerGeneration.current) { trackerPlayer.current.stop(); setTrackerPlaying(false); console.error('Quick Preview failed:', error); message.error(`${t('music.preview.failed')}${error instanceof Error ? `: ${error.message}` : ''}`); }
      return;
    }
    if (generation !== trackerGeneration.current) return;
    if (!durationMs) {
      setTrackerPlaying(false);
      return;
    }
    trackerTimer.current = window.setTimeout(() => {
      trackerTimer.current = null;
      if (generation !== trackerGeneration.current) return;
      if (trackerPreviewLoop.current) void toggleTrackerPreview(startRow, onRow, rowOverride, true);
      else setTrackerPlaying(false);
    }, durationMs);
  };
  const toggleXmPatternPreview = async (startRow = 0, onRow?: (row: number) => void, forceStart = false) => {
    stopSelectedNotePreview();
    if (trackerPlaying && !forceStart) {
      trackerGeneration.current += 1;
      if (trackerTimer.current !== null) window.clearTimeout(trackerTimer.current);
      trackerPlayer.current.stop();
      setTrackerPlaying(false);
      return;
    }
    if (!moduleBytes || info.format !== 'XM') return;
    const generation = ++trackerGeneration.current;
    const patternRows = parseXmPatternRows(moduleBytes, selectedPattern, 256);
    if (patternRows.length === 0) { message.warning(t('music.preview.noRows')); return; }
    const offset = Math.max(0, Math.min(patternRows.length - 1, Math.trunc(startRow)));
    setTrackerPlaying(true);
    let durationMs = 0;
    try {
      durationMs = await trackerPlayer.current.play(patternRows.slice(offset), info.channels, info.speed, info.tempo, mutedChannels, trackerSamples, 'XM', channelVolumes, channelPans, row => onRow?.(row + offset), false, info.globalVolume, projectPackage ? musicProjectOrigin.current === 'scratch' : musicSource?.origin === 'scratch', false, info.maxmodChannelVolumes);
    } catch (error) {
      if (generation === trackerGeneration.current) { trackerPlayer.current.stop(); setTrackerPlaying(false); console.error('Quick Preview failed:', error); message.error(`${t('music.preview.failed')}${error instanceof Error ? `: ${error.message}` : ''}`); }
      return;
    }
    if (generation !== trackerGeneration.current) return;
    if (!durationMs) { setTrackerPlaying(false); return; }
    trackerTimer.current = window.setTimeout(() => {
      trackerTimer.current = null;
      if (generation !== trackerGeneration.current) return;
      if (trackerPreviewLoop.current) void toggleXmPatternPreview(startRow, onRow, true);
      else setTrackerPlaying(false);
    }, durationMs);
  };

  const toggleChannel = (channel: number) => {
    const muted = !mutedChannels[channel];
    setMutedChannels(current => current.map((value, index) => index === channel ? muted : value));
    trackerPlayer.current.setChannelMuted(channel, muted);
  };

  const updateChannelVolume = (channel: number, value: number) => {
    const next = Math.max(0, Math.min(1, value));
    if (musicComposition.current) musicComposition.current = setMusicCompositionChannelMix(musicComposition.current, channel, { volume: next });
    setChannelVolumes(current => current.map((item, index) => index === channel ? next : item));
  };

  const updateChannelPan = (channel: number, value: number) => {
    const next = Math.max(-1, Math.min(1, value));
    if (musicComposition.current) musicComposition.current = setMusicCompositionChannelMix(musicComposition.current, channel, { pan: next });
    setChannelPans(current => current.map((item, index) => index === channel ? next : item));
  };

  const currentPattern = mod ? Math.min(Math.max(0, selectedPattern), Math.max(0, mod.patterns.length - 1)) : 0;
  const editSample = (sampleIndex: number, patch: { name?: string; volume?: number; loopStart?: number; loopLength?: number; fineTune?: number }) => {
    if (!mod) return;
    const next = updateModSample(mod, sampleIndex, patch);
    if (next === mod) return;
    setModUndo(history => [...history.slice(-31), mod]);
    setModRedo([]);
    setMod(next);
    markCurrentTrackDirty();
  };
  const addCanonicalInstrumentPreset = (preset: TrackerInstrumentPresetId = 'sine-lead') => {
    if (!projectPackage || !musicComposition.current || !info || !['MOD', 'XM', 'S3M', 'IT'].includes(info.format)
      || musicComposition.current.instruments.length >= (capabilities.maxInstruments ?? MAX_MUSIC_COMPOSITION_INSTRUMENTS)) return false;
    const composition = addMusicCompositionInstrumentPreset(musicComposition.current, preset);
    if (!commitCanonicalRollEdits([], selectedPattern, false, undefined, composition)) return false;
    setActiveInstrument(composition.instruments.at(-1)!.index + 1);
    markCurrentTrackDirty();
    return true;
  };
  const deleteCanonicalInstrument = (instrumentIndex: number) => {
    if (!projectPackage || !musicComposition.current || !info) return;
    const previous = musicComposition.current;
    const composition = deleteMusicCompositionInstrument(previous, instrumentIndex);
    if (composition === previous) return;
    if (!commitCanonicalRollEdits([], selectedPattern, false, undefined, composition)) return;
    const sources = importedAudioSourcesRef.current.filter(source => source.instrumentIndex !== instrumentIndex + 1)
      .map(source => ({ ...source, instrumentIndex: source.instrumentIndex > instrumentIndex + 1 ? source.instrumentIndex - 1 : source.instrumentIndex }));
    importedAudioSourcesRef.current = sources;
    setImportedAudioSources(sources);
    const nextInstrument = Math.min(instrumentIndex + 1, composition.instruments.length);
    setActiveInstrument(nextInstrument);
    musicWorkspace?.selectEditorItem('instrument', nextInstrument - 1);
    const configs = Object.fromEntries(Object.entries(instrumentConfigs).map(([category, entries]) => [category,
      Object.fromEntries(Object.entries(entries).filter(([id]) => Number(id) !== instrumentIndex + 1)
        .map(([id, config]) => [String(Number(id) > instrumentIndex + 1 ? Number(id) - 1 : Number(id)), config])),
    ]));
    setInstrumentConfigs(configs);
    if (filename) void window.electronAPI.saveMusicMetadata(filename, { instruments: configs });
    markCurrentTrackDirty();
  };
  const duplicateCanonicalInstrument = () => {
    if (!projectPackage || !musicComposition.current || musicComposition.current.instruments.length >= (capabilities.maxInstruments ?? MAX_MUSIC_COMPOSITION_INSTRUMENTS)) return false;
    const composition = duplicateMusicCompositionInstrument(musicComposition.current, activeInstrument - 1, t('music.instruments.copySuffix'));
    if (composition === musicComposition.current) return false;
    if (!commitCanonicalRollEdits([], selectedPattern, false, undefined, composition)) return false;
    setActiveInstrument(composition.instruments.at(-1)!.index + 1);
    markCurrentTrackDirty();
    return true;
  };
  editModSampleRef.current = editSample;
  const undoModEdit = () => {
    const previous = modUndo.at(-1);
    if (!mod || !previous) return;
    restoreSampleHistory(mod, previous);
    setModRedo(history => [...history.slice(-31), mod]);
    setModUndo(history => history.slice(0, -1));
    setMod(previous);
    markCurrentTrackDirty();
  };
  const redoModEdit = () => {
    const next = modRedo.at(-1);
    if (!mod || !next) return;
    restoreSampleHistory(mod, next);
    setModUndo(history => [...history.slice(-31), mod]);
    setModRedo(history => history.slice(0, -1));
    setMod(next);
    markCurrentTrackDirty();
  };
  const xmEvent = xmPatternRows[selectedCell.row]?.[selectedCell.channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
  const commitXmEdit = (next: ArrayBuffer, command?: MusicEditorSourceCommand): ArrayBuffer | undefined => {
    if (!moduleBytes || (next === moduleBytes && !command)) return;
    const currentSource = musicSource?.moduleFingerprint === getMusicModuleFingerprint(moduleBytes)
      ? musicSource
      : createMusicEditorSourceDocument(moduleBytes, musicSource?.assetFileName ?? filename ?? 'untitled.xm', musicSource);
    let nextSource = command
      ? applyMusicEditorSourceCommand(currentSource, command, currentSource.moduleFingerprint)
      : createMusicEditorSourceDocument(next, currentSource.assetFileName, currentSource);
    if (currentSource.origin === 'scratch') {
      nextSource = {
        ...nextSource,
        history: {
          undo: [...(currentSource.history?.undo ?? []), createMusicEditorSourceSnapshot(currentSource)].slice(-32),
          redo: [],
        },
      };
    } else {
      const history = trimXmHistory(
        [...(currentSource.history?.undo ?? []), createMusicEditorSourceSnapshot(currentSource, moduleBytes)],
        [],
      );
      nextSource = { ...nextSource, history };
    }
    const compiled = currentSource.origin === 'scratch'
      ? compileMusicEditorSourceDocument(nextSource)
      : command ? compileMusicEditorSourceCommand(moduleBytes, command) : next;
    const fingerprint = getMusicModuleFingerprint(compiled);
    const moduleChanged = fingerprint !== getMusicModuleFingerprint(moduleBytes);
    const sourceOnlyChanged = command?.type === 'set-pattern-name'
      && currentSource.patterns[command.patternIndex]?.name !== nextSource.patterns[command.patternIndex]?.name;
    if (!moduleChanged && !sourceOnlyChanged) return;
    if (currentSource.origin === 'imported') {
      const history = nextSource.history ?? { undo: [], redo: [] };
      setXmUndo(history.undo.map(restoreMusicEditorModuleSnapshot));
      setXmRedo([]);
      setXmSourceUndo(history.undo);
      setXmSourceRedo([]);
    } else {
      setXmUndo(history => [...history.slice(-31), moduleBytes]);
      setXmRedo([]);
      if (musicSource) setXmSourceUndo(history => [...history.slice(-31), createMusicEditorSourceSnapshot(musicSource)]);
      setXmSourceRedo([]);
    }
    setMusicSource({ ...nextSource, moduleFingerprint: fingerprint });
    if (moduleChanged) setModuleBytes(compiled);
    if (moduleChanged && (command?.type === 'patch-sample' || command?.type === 'replace-sample')) setTrackerSamples(parseXmSamples(compiled));
    markCurrentTrackDirty();
    return compiled;
  };
  const commitXmCommand = (command: MusicEditorSourceCommand): ArrayBuffer | undefined => {
    if (!moduleBytes || info.format !== 'XM') return;
    return commitXmEdit(moduleBytes, command);
  };
  const currentXmEvent = (patternIndex: number, row: number, channel: number): TrackerPatternEvent => {
    const event = musicSource?.patterns[patternIndex]?.events.find(item => item.row === row && item.channel === channel);
    return event ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
  };
  const updateCanonicalNoteEdits = (patternIndex: number, edits: Array<{ oldRow?: number; start: number; end: number; note: number; channel: number; instrument: number }>) => {
    if (!projectPackage || !musicComposition.current) return;
    musicComposition.current = editMusicCompositionNotes(musicComposition.current, patternIndex, edits.map(edit => ({
      ...(edit.oldRow === undefined ? {} : { oldRow: edit.oldRow }),
      start: edit.start, end: edit.end, pitch: edit.note, channelIndex: edit.channel, instrumentIndex: edit.instrument,
    })));
  };
  const updateCanonicalNoteProperties = (row: number, channel: number, patch: { instrumentIndex?: number; volume?: number; pan?: number }) => {
    if (!projectPackage || !musicComposition.current) return;
    musicComposition.current = setMusicCompositionNoteProperties(musicComposition.current, selectedPattern, row, channel, patch);
  };
  const updateCanonicalPatternEffects = (patternIndex: number, updates: Array<{ row: number; channel: number; effect: number; parameter: number }>) => {
    if (!projectPackage || !musicComposition.current) return;
    for (const update of updates) musicComposition.current = setMusicCompositionPatternEffect(
      musicComposition.current, patternIndex, update.row, update.channel, info.format as MusicExportTarget, update.effect, update.parameter,
    );
  };
  const refreshCanonicalCompositionFromModule = (moduleBuffer: ArrayBuffer, authoredPreset?: TrackerInstrumentPresetId) => {
    if (!projectPackage || !musicComposition.current) return;
    const importedComposition = importTrackerModuleComposition(
      moduleBuffer, musicSource?.assetFileName ?? filename ?? 'untitled-module',
      originalModuleBytes.current ?? moduleBuffer, musicComposition.current,
      { muted: [], volumes: channelVolumes, pans: channelPans },
    );
    musicComposition.current = authoredPreset
      ? {
        ...importedComposition,
        instruments: importedComposition.instruments.map((instrument, index) => index === importedComposition.instruments.length - 1 && instrument.sampleIds.length
          ? { ...instrument, noteMap: [{ low: 0, high: 127, sampleId: instrument.sampleIds[0] }] }
          : instrument),
      }
      : importedComposition;
    if (authoredPreset) canonicalAuthoringPendingRef.current = true;
  };
  const updateCanonicalSample = (sampleIndex: number, variantIndex: number, patch: {
    name?: string; sampleRate?: number; pcmData?: string; channels?: number; bitDepth?: 8 | 16;
    volume?: number; panning?: number; rootNote?: number; fineTune?: number; loopStart?: number; loopEnd?: number;
  }) => {
    if (!projectPackage || !musicComposition.current) return;
    const instrument = musicComposition.current.instruments.find(item => item.index === sampleIndex - 1);
    const sampleId = instrument?.sampleIds[variantIndex];
    if (!sampleId) return;
    const historyKey = info.format === 'MOD' ? mod : moduleBytes;
    if (historyKey) sampleHistory.current.set(historyKey, musicComposition.current.samples);
    const { volume, panning, ...rest } = patch;
    const currentSample = musicComposition.current.samples.find(sample => sample.id === sampleId);
    musicComposition.current = setMusicCompositionSampleProperties(musicComposition.current, sampleId, {
      ...rest,
      ...(currentSample?.tuningFormat === 'XM' ? factorySampleTuningEdit(currentSample, info.format, patch) : {}),
      ...(volume === undefined ? {} : { volume: Math.max(0, Math.min(64, volume)) / 64 }),
      ...(panning === undefined ? {} : { panning: Math.max(-1, Math.min(1, (panning - 128) / 128)) }),
    });
  };
  const deleteCanonicalNoteCells = (patternIndex: number, cells: Array<{ row: number; channel: number }>) => {
    if (!projectPackage || !musicComposition.current) return;
    musicComposition.current = deleteMusicCompositionNotes(musicComposition.current, patternIndex, cells.map(cell => ({ row: cell.row, channelIndex: cell.channel })));
  };
  const commitXmEventUpdates = (patternIndex: number, updates: Array<{ row: number; channel: number; patch: Partial<TrackerPatternEvent> }>) => {
    if (!instrumentsAllowed(updates.map(update => ({ channel: update.channel, instrument: update.patch.instrument ?? 0 })))) return false;
    const unique = new Map(updates.map(update => [`${update.row}:${update.channel}`, update]));
    const staged = [...unique.values()];
    const committed = Boolean(commitXmCommand({ type: 'patch-events', patternIndex, updates: staged }));
    if (committed) updateCanonicalPatternEffects(patternIndex, staged.flatMap(update => {
      if (update.patch.effect === undefined && update.patch.parameter === undefined) return [];
      const current = patternRowsByIndex[patternIndex]?.[update.row]?.[update.channel] ?? { effect: 0, parameter: 0 };
      return [{ row: update.row, channel: update.channel, effect: update.patch.effect ?? current.effect, parameter: update.patch.parameter ?? current.parameter }];
    }));
    return committed;
  };
  const editXmEvent = (patch: Partial<TrackerPatternEvent>) => {
    if (!instrumentsAllowed([{ channel: selectedCell.channel, instrument: patch.instrument ?? 0 }])) return;
    if (!moduleBytes || info.format !== 'XM') return;
    commitXmEventUpdates(selectedPattern, [{ row: selectedCell.row, channel: selectedCell.channel, patch }]);
  };
  const commitCanonicalRollEdits = (edits: Array<{ oldRow?: number; start: number; end: number; note: number; channel: number; instrument: number }>, targetPattern = selectedPattern, audition = true, timing?: Partial<Pick<MusicCompositionDocument, 'tempoBpm' | 'ticksPerRow'>>, compositionOverride?: MusicCompositionDocument) => {
    if (!projectPackage || !musicComposition.current || !info) return false;
    if (!instrumentsAllowed(edits)) return true;
    const composition = compositionOverride ?? { ...editMusicCompositionNotes(musicComposition.current, targetPattern, edits.map(edit => ({
      oldRow: edit.oldRow, start: edit.start, end: edit.end, pitch: edit.note, channelIndex: edit.channel, instrumentIndex: edit.instrument,
    }))), ...timing };
    let exported: ReturnType<typeof exportMusicComposition>;
    try {
      exported = exportMusicComposition(composition, composition.targetFormat);
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
      return false;
    }
    const bytes = new Uint8Array(exported.moduleData);
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const nextMod = composition.targetFormat === 'MOD' ? parseModModule(buffer) : null;
    const previousKey = composition.targetFormat === 'MOD' ? mod : moduleBytes;
    if (previousKey) compositionHistory.current.set(previousKey, musicComposition.current);
    compositionHistory.current.set(nextMod ?? buffer, composition);
    if (composition.targetFormat === 'MOD' && mod) {
      setModUndo(history => [...history.slice(-31), mod]); setModRedo([]);
    } else if (composition.targetFormat === 'XM' && moduleBytes) {
      setXmUndo(history => [...history.slice(-31), moduleBytes]); setXmRedo([]);
      if (musicSource) setXmSourceUndo(history => [...history.slice(-31), createMusicEditorSourceSnapshot(musicSource)]);
      setXmSourceRedo([]);
    } else if (composition.targetFormat === 'S3M' && moduleBytes) {
      s3mUndo.current = [...s3mUndo.current.slice(-31), moduleBytes]; s3mRedo.current = [];
    } else if (composition.targetFormat === 'IT' && moduleBytes) {
      setItUndo(history => [...history.slice(-31), moduleBytes]); setItRedo([]);
    }
    musicComposition.current = composition;
    canonicalAuthoringPendingRef.current = true;
    setModuleBytes(buffer);
    setInfo({ ...parseTrackerModule(buffer, composition.targetFormat), tempo: composition.tempoBpm, speed: composition.ticksPerRow });
    setMod(nextMod);
    if (composition.targetFormat === 'XM') {
      setTrackerSamples(parseXmSamples(buffer));
      const nextSource = createMusicEditorSourceDocument(buffer, musicSource?.assetFileName ?? filename ?? 'untitled.xm', musicSource ? { ...musicSource, history: undefined } : undefined);
      const history = musicSource && moduleBytes ? trimXmHistory([...xmSourceUndo, createMusicEditorSourceSnapshot(musicSource, moduleBytes)], []) : undefined;
      setMusicSource({ ...nextSource, history });
    } else if (composition.targetFormat === 'S3M') setTrackerSamples(parseS3mSamples(buffer));
    else if (composition.targetFormat === 'IT') setTrackerSamples(parseItSamples(buffer));
    const inserted = edits.find(edit => edit.oldRow === undefined);
    if (audition && inserted) void trackerPlayer.current.auditionNote(inserted.note, inserted.instrument, auditionSamples, composition.targetFormat);
    markCurrentTrackDirty();
    return true;
  };
  const displacedXmTail = (start: number, end: number, channel: number, targetPattern: number, excludedRows: number[] = []) => {
    const rows = parseXmPatternRows(moduleBytes!, targetPattern, 256);
    if (end >= rows.length || (rows[end]?.[channel]?.note ?? 0) > 0) return [];
    for (let row = Math.min(end - 1, rows.length - 1); row >= 0; row -= 1) {
      const event = rows[row]?.[channel];
      if (event?.note === 97) break;
      if (!event || event.note < 1 || event.note > 96) continue;
      if (!excludedRows.includes(row) && row + inferXmNoteLength(rows, row, channel, 4) > end) {
        return [{ row: end, channel, patch: { ...event } }];
      }
      break;
    }
    return [];
  };
  const drawXmNote = (start: number, end: number, note: number, channel: number, instrument: number, targetPattern = selectedPattern, audition = true) => {
    if (!instrumentsAllowed([{ channel, instrument }])) return;
    if (commitCanonicalRollEdits([{ start, end, note, channel, instrument }], targetPattern, audition)) return;
    if (!moduleBytes || info.format !== 'XM') return;
    if (audition) void trackerPlayer.current.auditionNote(note, instrument, auditionSamples, info.format);
    const updates: Array<{ row: number; channel: number; patch: Partial<TrackerPatternEvent> }> = [{ row: start, channel, patch: { note, instrument } }];
    const targetLength = parseXmPatternRows(moduleBytes, targetPattern, 256).length;
    const noteOffRow = Math.min(targetLength - 1, Math.max(start + 1, end));
    for (let row = start + 1; row < Math.min(end, targetLength); row += 1) {
      const event = currentXmEvent(targetPattern, row, channel);
      if (event.note || event.instrument) updates.push({ row, channel, patch: { note: 0, instrument: 0, volume: 0 } });
    }
    const tail = displacedXmTail(start, end, channel, targetPattern);
    updates.push(...tail);
    const endEvent = currentXmEvent(targetPattern, noteOffRow, channel);
    if (!tail.length && noteOffRow > start && !(endEvent.note || endEvent.instrument || endEvent.volume || endEvent.effect || endEvent.parameter)) updates.push({ row: noteOffRow, channel, patch: { note: 97, instrument: 0 } });
    if (commitXmEventUpdates(targetPattern, updates)) updateCanonicalNoteEdits(targetPattern, [{ start, end, note, channel, instrument }]);
  };
  const drawXmNotes = (notes: Array<{ start: number; end: number; note: number; channel: number; instrument: number; patternIndex?: number }>, effects: Array<{ row: number; channel: number; effect: number; parameter: number }> = []) => {
    const targetPattern = notes[0]?.patternIndex ?? selectedPattern;
    if (!instrumentsAllowed(notes)) return;
    if (commitCanonicalRollEdits(notes, targetPattern)) return;
    if (!moduleBytes || info.format !== 'XM' || notes.length === 0) return;
    const targetLength = parseXmPatternRows(moduleBytes, targetPattern, 256).length;
    const audition = notes[0];
    void trackerPlayer.current.auditionNote(audition.note, audition.instrument, auditionSamples, info.format);
    const staged = new Map<string, { row: number; channel: number; patch: Partial<TrackerPatternEvent> }>();
    const eventAt = (row: number, channel: number) => {
      const key = `${row}:${channel}`;
      const update = staged.get(key);
      const base = currentXmEvent(targetPattern, row, channel);
      return update ? { ...base, ...update.patch } : base;
    };
    for (const item of notes) {
      for (let row = item.start; row < Math.min(item.end, targetLength); row += 1) {
        const event = currentXmEvent(targetPattern, row, item.channel);
        if (event.note || event.instrument) staged.set(`${row}:${item.channel}`, { row, channel: item.channel, patch: { note: 0, instrument: 0, volume: 0 } });
      }
      for (const tail of displacedXmTail(item.start, item.end, item.channel, targetPattern)) {
        if (!notes.some(other => other.channel === item.channel && tail.row >= other.start && tail.row < other.end)) staged.set(`${tail.row}:${tail.channel}`, tail);
      }
    }
    for (const item of [...notes].sort((a, b) => a.channel - b.channel || a.start - b.start)) {
      staged.set(`${item.start}:${item.channel}`, { row: item.start, channel: item.channel, patch: { note: item.note, instrument: item.instrument } });
      const noteOffRow = Math.min(targetLength, Math.max(item.start + 1, item.end));
      const endEvent = eventAt(noteOffRow, item.channel);
      if (noteOffRow < targetLength && noteOffRow > item.start && !(endEvent.note || endEvent.instrument || endEvent.volume || endEvent.effect || endEvent.parameter)) staged.set(`${noteOffRow}:${item.channel}`, { row: noteOffRow, channel: item.channel, patch: { note: 97, instrument: 0, volume: 0, effect: 0, parameter: 0 } });
    }
    for (const { row, channel, effect, parameter } of effects) {
      const key = `${row}:${channel}`;
      staged.set(key, { row, channel, patch: { ...staged.get(key)?.patch, effect, parameter } });
    }
    if (commitXmEventUpdates(targetPattern, [...staged.values()])) { updateCanonicalNoteEdits(targetPattern, notes); if (effects.length) updateCanonicalPatternEffects(targetPattern, effects); }
  };
  const deleteXmNotes = (notes: Array<{ row: number; channel: number }>, targetPattern = selectedPattern) => {
    if (!moduleBytes || info.format !== 'XM' || notes.length === 0) return;
    const targetLength = parseXmPatternRows(moduleBytes, targetPattern, 256).length;
    const updates: Array<{ row: number; channel: number; patch: Partial<TrackerPatternEvent> }> = [];
    for (const { row, channel } of notes) {
      const selected = currentXmEvent(targetPattern, row, channel);
      if (!(selected.note >= 1 && selected.note <= 96)) continue;
      updates.push({ row, channel, patch: { note: 0, instrument: 0 } });
      for (let index = row + 1; index < targetLength; index += 1) {
        const event = currentXmEvent(targetPattern, index, channel);
        if (event.note && event.note !== 97) break;
        if (event.note === 97) {
          updates.push({ row: index, channel, patch: { note: 0, instrument: 0, ...(event.volume === 0x10 ? { volume: 0 } : {}) } });
          break;
        }
      }
    }
    if (commitXmEventUpdates(targetPattern, updates)) deleteCanonicalNoteCells(targetPattern, notes);
  };
  const deleteXmNote = (row: number, channel: number) => deleteXmNotes([{ row, channel }]);
  const changeXmNoteInstrument = (row: number, channel: number, instrument: number) => {
    if (projectPackage && musicComposition.current) {
      const composition = setMusicCompositionNoteProperties(musicComposition.current, selectedPattern, row, channel, { instrumentIndex: instrument });
      commitCanonicalRollEdits([], selectedPattern, false, undefined, composition);
      return;
    }
    if (!moduleBytes || info.format !== 'XM') return;
    if (commitXmEventUpdates(selectedPattern, [{ row, channel, patch: { instrument } }])) updateCanonicalNoteProperties(row, channel, { instrumentIndex: instrument });
  };
  const changeXmNoteVolume = (row: number, channel: number, volume: number) => {
    if (projectPackage && musicComposition.current) {
      const composition = setMusicCompositionNoteProperties(musicComposition.current, selectedPattern, row, channel, { volume: Math.max(0, Math.min(1, (volume - 0x10) / 0x40)) });
      commitCanonicalRollEdits([], selectedPattern, false, undefined, composition);
      return;
    }
    if (!moduleBytes || info.format !== 'XM') return;
    if (commitXmEventUpdates(selectedPattern, [{ row, channel, patch: { volume } }])) updateCanonicalNoteProperties(row, channel, { volume: Math.max(0, Math.min(1, (volume - 0x10) / 0x40)) });
  };
  const appendPattern = (sourcePattern?: number) => {
    if (!moduleBytes) return;
    if (projectPackage && musicComposition.current) {
      const previous = musicComposition.current;
      const composition = appendMusicPattern(previous, sourcePattern);
      if (composition === previous) return;
      const pattern = composition.patterns.at(-1)!;
      if (!commitCanonicalRollEdits([], pattern.index, false, undefined, composition)) return;
      setSelectedPattern(pattern.index);
      setSelectedOrder(composition.order.length - 1);
      musicWorkspace?.selectEditorItem('pattern', pattern.index);
      return;
    }
    if (info.format !== 'XM') return;
    const createdPattern = info.patterns;
    const createdOrder = info.orders;
    const compiled = commitXmCommand({ type: 'append-pattern', sourcePattern });
    if (!compiled) return;
    refreshCanonicalCompositionFromModule(compiled);
    setInfo(parseTrackerModule(compiled, 'xm'));
    setSelectedPattern(createdPattern);
    setSelectedOrder(createdOrder);
  };
  const reorderXmOrder = (index: number, target: number) => {
    if (projectPackage && musicComposition.current) {
      const previous = musicComposition.current;
      const composition = moveMusicOrder(previous, index, target);
      if (composition === previous) return;
      const selectedId = previous.order[selectedOrder]?.id;
      if (commitCanonicalRollEdits([], selectedPattern, false, undefined, composition)) {
        setSelectedOrder(Math.max(0, composition.order.findIndex(entry => entry.id === selectedId)));
      }
      return;
    }
    if (!moduleBytes || info.format !== 'XM') return;
    if (target < 0 || target >= trackerOrderTable.length) return;
    const orderList = [...trackerOrderTable];
    const [moved] = orderList.splice(index, 1);
    orderList.splice(target, 0, moved);
    let nextSelectedOrder = selectedOrder;
    if (selectedOrder === index) nextSelectedOrder = target;
    else if (index < selectedOrder && target >= selectedOrder) nextSelectedOrder -= 1;
    else if (index > selectedOrder && target <= selectedOrder) nextSelectedOrder += 1;
    const compiled = commitXmCommand({ type: 'move-order', from: index, to: target });
    if (!compiled) return;
    refreshCanonicalCompositionFromModule(compiled);
    setSelectedOrder(nextSelectedOrder);
    setSelectedPattern(orderList[nextSelectedOrder] ?? selectedPattern);
  };
  const editXmNotes = (edits: Array<{ oldRow: number; oldNote: number; start: number; end: number; note: number; channel: number; instrument: number }>, targetPattern = selectedPattern) => {
    if (commitCanonicalRollEdits(edits, targetPattern)) return;
    if (!instrumentsAllowed(edits)) return;
    if (!moduleBytes || info.format !== 'XM' || edits.length === 0) return;
    const targetLength = parseXmPatternRows(moduleBytes, targetPattern, 256).length;
    const originalEvents = new Map<string, TrackerPatternEvent>();
    const staged = new Map<string, { row: number; channel: number; patch: Partial<TrackerPatternEvent> }>();
    const stage = (row: number, channel: number, patch: Partial<TrackerPatternEvent>) => staged.set(`${row}:${channel}`, { row, channel, patch });
    const eventAt = (row: number, channel: number) => {
      const base = currentXmEvent(targetPattern, row, channel);
      const update = staged.get(`${row}:${channel}`);
      return update ? { ...base, ...update.patch } : base;
    };
    for (const edit of edits) {
      const oldEvent = currentXmEvent(targetPattern, edit.oldRow, edit.channel);
      if (oldEvent.note === edit.oldNote) {
        originalEvents.set(`${edit.oldRow}:${edit.channel}`, oldEvent);
        stage(edit.oldRow, edit.channel, { note: 0, instrument: 0 });
        for (let index = edit.oldRow + 1; index < targetLength; index += 1) {
          const event = currentXmEvent(targetPattern, index, edit.channel);
          if (event?.note && event.note !== 97) break;
          if (event?.note === 97) {
            stage(index, edit.channel, { note: 0, instrument: 0, ...(event.volume === 0x10 ? { volume: 0 } : {}) });
            break;
          }
        }
      }
    }
    for (const edit of edits) {
      for (let row = edit.start; row < Math.min(edit.end, targetLength); row += 1) {
        const event = currentXmEvent(targetPattern, row, edit.channel);
        if (event.note || event.instrument) stage(row, edit.channel, { note: 0, instrument: 0, volume: 0 });
      }
    }
    for (const edit of edits) {
      for (const tail of displacedXmTail(edit.start, edit.end, edit.channel, targetPattern, edits.filter(item => item.channel === edit.channel).map(item => item.oldRow))) {
        stage(tail.row, tail.channel, tail.patch);
      }
    }
    for (const edit of [...edits].sort((a, b) => a.channel - b.channel || a.start - b.start)) {
      const original = originalEvents.get(`${edit.oldRow}:${edit.channel}`);
      stage(edit.start, edit.channel, { note: edit.note, instrument: edit.instrument, volume: original?.volume ?? 0, effect: original?.effect ?? 0, parameter: original?.parameter ?? 0 });
      const endEvent = eventAt(edit.end, edit.channel);
      if (edit.end < targetLength && edit.end > edit.start && !(endEvent.note || endEvent.instrument || endEvent.volume || endEvent.effect || endEvent.parameter)) stage(edit.end, edit.channel, { note: 97, instrument: 0, volume: 0, effect: 0, parameter: 0 });
    }
    if (commitXmEventUpdates(targetPattern, [...staged.values()])) updateCanonicalNoteEdits(targetPattern, edits);
  };
  const editXmNote = (oldRow: number, oldNote: number, start: number, end: number, note: number, channel: number, instrument: number, targetPattern = selectedPattern) => editXmNotes([{ oldRow, oldNote, start, end, note, channel, instrument }], targetPattern);
  const undoXmEdit = () => {
    const previous = xmUndo.at(-1);
    if (!moduleBytes || !previous) return;
    restoreSampleHistory(moduleBytes, previous);
    const previousSource = xmSourceUndo.at(-1);
    if (musicSource?.origin === 'imported' && previousSource) {
      const history = trimXmHistory(
        (musicSource.history?.undo ?? []).slice(0, -1),
        [...(musicSource.history?.redo ?? []), createMusicEditorSourceSnapshot(musicSource, moduleBytes)],
      );
      setXmUndo(history.undo.map(restoreMusicEditorModuleSnapshot));
      setXmRedo(history.redo.map(restoreMusicEditorModuleSnapshot));
      setXmSourceUndo(history.undo);
      setXmSourceRedo(history.redo);
      setMusicSource({ ...documentFromXmSnapshot(previousSource), history });
      setModuleBytes(previous);
      setTrackerSamples(parseXmSamples(previous));
      markCurrentTrackDirty();
      return;
    }
    setXmRedo(history => [...history.slice(-31), moduleBytes]);
    setXmUndo(history => history.slice(0, -1));
    if (previousSource) {
      if (musicSource) setXmSourceRedo(history => [...history.slice(-31), createMusicEditorSourceSnapshot(musicSource)]);
      setXmSourceUndo(history => history.slice(0, -1));
      const history = musicSource?.history;
      setMusicSource({
        ...previousSource,
        history: musicSource?.origin === 'scratch' ? {
          undo: history?.undo.slice(0, -1) ?? [],
          redo: [...(history?.redo ?? []), createMusicEditorSourceSnapshot(musicSource)].slice(-32),
        } : undefined,
      });
    }
    setModuleBytes(previous);
    setTrackerSamples(parseXmSamples(previous));
    markCurrentTrackDirty();
  };
  const redoXmEdit = () => {
    const next = xmRedo.at(-1);
    if (!moduleBytes || !next) return;
    restoreSampleHistory(moduleBytes, next);
    const nextSource = xmSourceRedo.at(-1);
    if (musicSource?.origin === 'imported' && nextSource) {
      const history = trimXmHistory(
        [...(musicSource.history?.undo ?? []), createMusicEditorSourceSnapshot(musicSource, moduleBytes)],
        (musicSource.history?.redo ?? []).slice(0, -1),
      );
      setXmUndo(history.undo.map(restoreMusicEditorModuleSnapshot));
      setXmRedo(history.redo.map(restoreMusicEditorModuleSnapshot));
      setXmSourceUndo(history.undo);
      setXmSourceRedo(history.redo);
      setMusicSource({ ...documentFromXmSnapshot(nextSource), history });
      setModuleBytes(next);
      setTrackerSamples(parseXmSamples(next));
      markCurrentTrackDirty();
      return;
    }
    setXmUndo(history => [...history.slice(-31), moduleBytes]);
    setXmRedo(history => history.slice(0, -1));
    if (nextSource) {
      if (musicSource) setXmSourceUndo(history => [...history.slice(-31), musicSource]);
      setXmSourceRedo(history => history.slice(0, -1));
      const history = musicSource?.history;
      setMusicSource({
        ...nextSource,
        history: musicSource?.origin === 'scratch' ? {
          undo: [...(history?.undo ?? []), createMusicEditorSourceSnapshot(musicSource)].slice(-32),
          redo: history?.redo.slice(0, -1) ?? [],
        } : undefined,
      });
    }
    setModuleBytes(next);
    setTrackerSamples(parseXmSamples(next));
    markCurrentTrackDirty();
  };
  undoXmEditRef.current = undoXmEdit;
  redoXmEditRef.current = redoXmEdit;
  const s3mEvent = s3mPatternRows[selectedCell.row]?.[selectedCell.channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
  const editS3mEvent = (patch: Partial<TrackerPatternEvent>) => {
    if (!moduleBytes || info.format !== 'S3M') return;
    const next = updateS3mPatternEvent(moduleBytes, selectedPattern, selectedCell.row, selectedCell.channel, patch);
    if (next === moduleBytes) return;
    s3mUndo.current = [...s3mUndo.current.slice(-31), moduleBytes];
    s3mRedo.current = [];
    setModuleBytes(next);
    if (patch.effect !== undefined || patch.parameter !== undefined) {
      updateCanonicalPatternEffects(selectedPattern, [{
        row: selectedCell.row, channel: selectedCell.channel,
        effect: patch.effect ?? s3mEvent.effect, parameter: patch.parameter ?? s3mEvent.parameter,
      }]);
    }
    markCurrentTrackDirty();
  };
  const undoS3mEdit = () => {
    const previous = s3mUndo.current.at(-1);
    if (!moduleBytes || !previous) return;
    restoreSampleHistory(moduleBytes, previous);
    s3mRedo.current = [...s3mRedo.current.slice(-31), moduleBytes];
    s3mUndo.current = s3mUndo.current.slice(0, -1);
    setModuleBytes(previous);
    markCurrentTrackDirty();
  };
  const redoS3mEdit = () => {
    const next = s3mRedo.current.at(-1);
    if (!moduleBytes || !next) return;
    restoreSampleHistory(moduleBytes, next);
    s3mUndo.current = [...s3mUndo.current.slice(-31), moduleBytes];
    s3mRedo.current = s3mRedo.current.slice(0, -1);
    setModuleBytes(next);
    markCurrentTrackDirty();
  };
  const itEvent = itPatternRows[selectedCell.row]?.[selectedCell.channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 };
  const editItEvent = (patch: Partial<TrackerPatternEvent>) => {
    if (!moduleBytes || info.format !== 'IT') return;
    const next = updateItPatternEvent(moduleBytes, selectedPattern, selectedCell.row, selectedCell.channel, patch);
    if (next === moduleBytes) return;
    setItUndo(history => [...history.slice(-31), moduleBytes]);
    setItRedo([]);
    setModuleBytes(next);
    if (patch.effect !== undefined || patch.parameter !== undefined) {
      updateCanonicalPatternEffects(selectedPattern, [{
        row: selectedCell.row, channel: selectedCell.channel,
        effect: patch.effect ?? itEvent.effect, parameter: patch.parameter ?? itEvent.parameter,
      }]);
    }
    markCurrentTrackDirty();
  };
  const undoItEdit = () => {
    const previous = itUndo.at(-1);
    if (!moduleBytes || !previous) return;
    restoreSampleHistory(moduleBytes, previous);
    setItRedo(history => [...history.slice(-31), moduleBytes]);
    setItUndo(history => history.slice(0, -1));
    setModuleBytes(previous);
    markCurrentTrackDirty();
  };
  const redoItEdit = () => {
    const next = itRedo.at(-1);
    if (!moduleBytes || !next) return;
    restoreSampleHistory(moduleBytes, next);
    setItUndo(history => [...history.slice(-31), moduleBytes]);
    setItRedo(history => history.slice(0, -1));
    setModuleBytes(next);
    markCurrentTrackDirty();
  };
  undoTrackerEditRef.current = info?.format === 'MOD' ? undoModEdit : info?.format === 'S3M' ? undoS3mEdit : info?.format === 'IT' ? undoItEdit : () => undefined;
  redoTrackerEditRef.current = info?.format === 'MOD' ? redoModEdit : info?.format === 'S3M' ? redoS3mEdit : info?.format === 'IT' ? redoItEdit : () => undefined;
  const editTrackerSample = (sampleIndex: number, patch: { volume?: number; loopStart?: number; loopEnd?: number; rootNote?: number; fineTune?: number; panning?: number }, variantIndex = 0) => {
    if (!moduleBytes || !info || info.format === 'MOD') return;
    const next = info.format === 'XM'
      ? updateXmSample(moduleBytes, sampleIndex, patch, variantIndex)
      : info.format === 'S3M'
        ? updateS3mSample(moduleBytes, sampleIndex, patch)
        : updateItSample(moduleBytes, sampleIndex, patch);
    if (next === moduleBytes) return;
    if (info.format === 'XM') {
      if (commitXmEdit(next, { type: 'patch-sample', sampleIndex, variantIndex, patch })) updateCanonicalSample(sampleIndex, variantIndex, patch);
    }
    else {
      if (info.format === 'S3M') {
        s3mUndo.current = [...s3mUndo.current.slice(-31), moduleBytes];
        s3mRedo.current = [];
      } else {
        setItUndo(history => [...history.slice(-31), moduleBytes]);
        setItRedo([]);
      }
      setModuleBytes(next);
      updateCanonicalSample(sampleIndex, variantIndex, patch);
      markCurrentTrackDirty();
    }
  };
  editTrackerSampleRef.current = editTrackerSample;
  const importScratchWavSample = async (file: File, instrumentIndex: number, noteZone?: { low: number; high: number }, options?: { trimStart: number; trimEnd: number; gain: number; removeDc: boolean; fadeInMs: number; fadeOutMs: number }) => {
    if (info?.format !== 'XM' || !moduleBytes || !musicSource || musicSource.origin === 'imported' && noteZone) return;
    const audioContext = new AudioContext();
    try {
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      const decoded = await audioContext.decodeAudioData(sourceBytes.slice().buffer);
      const sourcePcmBytes = new Uint8Array(decoded.length * decoded.numberOfChannels * Float32Array.BYTES_PER_ELEMENT);
      const sourcePcmView = new DataView(sourcePcmBytes.buffer);
      for (let frame = 0; frame < decoded.length; frame += 1) {
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          sourcePcmView.setFloat32((frame * decoded.numberOfChannels + channel) * Float32Array.BYTES_PER_ELEMENT, decoded.getChannelData(channel)[frame], true);
        }
      }
      const sampleRate = TRACKER_SAMPLE_RATE;
      const trimStart = Math.max(0, Math.min(decoded.duration, options?.trimStart ?? 0));
      const trimEnd = Math.max(trimStart, Math.min(decoded.duration, options?.trimEnd ?? decoded.duration));
      const sampleLength = Math.round((trimEnd - trimStart) * sampleRate);
      if (!sampleLength || sampleLength > 131_072) {
        message.error(t('music.warning.sampleTooLong'));
        return;
      }
      const gain = Math.max(0, Math.min(2, options?.gain ?? 1));
      const removeDc = options?.removeDc ?? false;
      const fadeInMs = Math.max(0, Math.min(5000, options?.fadeInMs ?? 0));
      const fadeOutMs = Math.max(0, Math.min(5000, options?.fadeOutMs ?? 0));
      const preparedPcm = prepareTrackerSamplePcm(
        Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel)),
        decoded.sampleRate,
        { trimStart, trimEnd, gain, removeDc, fadeInMs, fadeOutMs },
        sampleRate,
      );
      const deltaPcm = encodeTrackerDeltaPcm(preparedPcm);
      let binary = '';
      for (let offset = 0; offset < deltaPcm.length; offset += 0x8000) binary += String.fromCharCode(...deltaPcm.subarray(offset, Math.min(deltaPcm.length, offset + 0x8000)));
      const sample = musicSource.samples.find(item => item.index === instrumentIndex && (item.variantIndex ?? 0) === 0);
      if (!sample) throw new Error(`Scratch beat instrument ${instrumentIndex} is missing its sample slot.`);
      const importedSample = {
        name: file.name.replace(/\.[^.]+$/, '').slice(0, 22),
        sampleRate,
        length: deltaPcm.length,
        loopStart: 0,
        loopEnd: 0,
        rootNote: 48,
        volume: 64,
        encodedPcm: btoa(binary),
        sixteenBit: false,
        loopType: 0,
        fineTune: 0,
        panning: 128,
      };
      const result = noteZone
        ? commitXmCommand({ type: 'append-sample-variant', instrumentIndex, noteLow: noteZone.low, noteHigh: noteZone.high, sample: importedSample })
        : commitXmCommand({ type: 'replace-sample', sampleIndex: sample.index, sampleId: sample.id, sample: { ...sample, ...importedSample } });
      if (result) {
        refreshCanonicalCompositionFromModule(result);
        appendImportedAudioSource({
          id: createTrackerUuid(),
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sourceAudioData: bytesToBase64(sourceBytes),
          sourcePcmData: bytesToBase64(sourcePcmBytes),
          pcmFrames: decoded.length,
          pcmEncoding: 'float32le-interleaved',
          sampleRate: decoded.sampleRate,
          channels: decoded.numberOfChannels,
          durationSeconds: decoded.duration,
          trimStart,
          trimEnd,
          gain,
          removeDc,
          fadeInMs,
          fadeOutMs,
          instrumentIndex,
          ...(noteZone ? { noteZone } : {}),
        });
        message.success(noteZone
          ? t('music.warning.sampleImportedZone', { file: file.name, instrument: instrumentIndex, low: noteZone.low, high: noteZone.high })
          : t('music.warning.sampleImported', { file: file.name, instrument: instrumentIndex }));
      }
    } catch (error) {
      message.error(t('music.warning.sampleImportFailed'));
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  };
  const importCanonicalAudioSample = async (file: File, instrumentIndex: number, noteZone?: { low: number; high: number }, options?: { trimStart: number; trimEnd: number; gain: number; removeDc: boolean; fadeInMs: number; fadeOutMs: number }) => {
    if (!projectPackage || !musicComposition.current || !Number.isInteger(instrumentIndex) || instrumentIndex < 1) return;
    const instrument = musicComposition.current.instruments.find(item => item.index === instrumentIndex - 1);
    if (!instrument) return;
    const audioContext = new AudioContext();
    try {
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      const decoded = await audioContext.decodeAudioData(sourceBytes.slice().buffer);
      const sourcePcmBytes = new Uint8Array(decoded.length * decoded.numberOfChannels * Float32Array.BYTES_PER_ELEMENT);
      const sourcePcmView = new DataView(sourcePcmBytes.buffer);
      for (let frame = 0; frame < decoded.length; frame += 1) {
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          sourcePcmView.setFloat32((frame * decoded.numberOfChannels + channel) * Float32Array.BYTES_PER_ELEMENT, decoded.getChannelData(channel)[frame], true);
        }
      }
      const sampleRate = TRACKER_SAMPLE_RATE;
      const trimStart = Math.max(0, Math.min(decoded.duration, options?.trimStart ?? 0));
      const trimEnd = Math.max(trimStart, Math.min(decoded.duration, options?.trimEnd ?? decoded.duration));
      const gain = Math.max(0, Math.min(2, options?.gain ?? 1));
      const removeDc = options?.removeDc ?? false;
      const fadeInMs = Math.max(0, Math.min(5000, options?.fadeInMs ?? 0));
      const fadeOutMs = Math.max(0, Math.min(5000, options?.fadeOutMs ?? 0));
      const pcm = prepareTrackerSamplePcm(
        Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel)), decoded.sampleRate,
        { trimStart, trimEnd, gain, removeDc, fadeInMs, fadeOutMs }, sampleRate,
      );
      if (!pcm.length || pcm.length > 131_072) {
        message.error(t('music.warning.sampleTooLong'));
        return;
      }
      const sampleName = file.name.replace(/\.[^.]+$/, '').slice(0, 64) || t('music.instruments.sample');
      let next = musicComposition.current;
      if (noteZone) {
        const canonicalZone = { low: noteZone.low - 1, high: noteZone.high - 1 };
        next = addMusicCompositionSampleToInstrument(next, instrument.index, {
          name: sampleName, sampleRate, channels: 1, bitDepth: 8, pcmData: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
          volume: 1, panning: 0, rootNote: 48, fineTune: 0, loopStart: 0, loopEnd: 0, loopType: 'none',
        }, canonicalZone);
        if (next === musicComposition.current) {
          message.error(t('music.warning.sampleImportFailed'));
          return;
        }
      } else {
        const sampleId = instrument.sampleIds[0];
        if (!sampleId) {
          message.error(t('music.warning.sampleImportFailed'));
          return;
        }
        next = setMusicCompositionSampleProperties(next, sampleId, {
          name: sampleName, sampleRate, channels: 1, bitDepth: 8, pcmData: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)),
          volume: 1, panning: 0, rootNote: 48, fineTune: 0, loopStart: 0, loopEnd: 0, loopType: 'none',
        });
      }
      next = {
        ...next,
        instruments: next.instruments.map(item => item.index === instrument.index
          ? {
            ...item, name: sampleName, starterCategory: undefined, starterColor: undefined,
            // The newly prepared audio is the primary sample shown by the inspector.
            // Key zones keep their UUID references when the sample order changes.
            sampleIds: noteZone ? [item.sampleIds[item.sampleIds.length - 1], ...item.sampleIds.slice(0, -1)] : item.sampleIds,
          }
          : item),
      };
      const exported = exportMusicComposition(next, next.targetFormat);
      const bytes = new Uint8Array(exported.moduleData);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      musicComposition.current = next;
      canonicalAuthoringPendingRef.current = true;
      setModuleBytes(buffer);
      setInfo(parseTrackerModule(buffer, next.targetFormat));
      setMod(next.targetFormat === 'MOD' ? parseModModule(buffer) : null);
      if (next.targetFormat === 'XM') setTrackerSamples(parseXmSamples(buffer));
      else if (next.targetFormat === 'S3M') setTrackerSamples(parseS3mSamples(buffer));
      else if (next.targetFormat === 'IT') setTrackerSamples(parseItSamples(buffer));
      setActiveInstrument(instrumentIndex);
      appendImportedAudioSource({
        id: createTrackerUuid(), fileName: file.name, mimeType: file.type || 'application/octet-stream',
        sourceAudioData: bytesToBase64(sourceBytes), sourcePcmData: bytesToBase64(sourcePcmBytes),
        pcmFrames: decoded.length, pcmEncoding: 'float32le-interleaved', sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels, durationSeconds: decoded.duration, trimStart, trimEnd, gain,
        removeDc, fadeInMs, fadeOutMs, instrumentIndex, ...(noteZone ? { noteZone } : {}),
      });
      markCurrentTrackDirty();
      message.success(noteZone
        ? t('music.warning.sampleImportedZone', { file: file.name, instrument: instrumentIndex, low: noteZone.low, high: noteZone.high })
        : t('music.warning.sampleImported', { file: file.name, instrument: instrumentIndex }));
    } catch {
      message.error(t('music.warning.sampleImportFailed'));
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  };
  const importModAudioSample = async (file: File, instrumentIndex: number, _noteZone?: { low: number; high: number }, options?: { trimStart: number; trimEnd: number; gain: number; removeDc: boolean; fadeInMs: number; fadeOutMs: number }) => {
    if (info?.format !== 'MOD' || !mod || instrumentIndex < 1 || instrumentIndex > mod.samples.length) return;
    const audioContext = new AudioContext();
    try {
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      const decoded = await audioContext.decodeAudioData(sourceBytes.slice().buffer);
      const sourcePcmBytes = new Uint8Array(decoded.length * decoded.numberOfChannels * Float32Array.BYTES_PER_ELEMENT);
      const sourcePcmView = new DataView(sourcePcmBytes.buffer);
      for (let frame = 0; frame < decoded.length; frame += 1) {
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          sourcePcmView.setFloat32((frame * decoded.numberOfChannels + channel) * Float32Array.BYTES_PER_ELEMENT, decoded.getChannelData(channel)[frame], true);
        }
      }
      const sampleRate = TRACKER_SAMPLE_RATE;
      const trimStart = Math.max(0, Math.min(decoded.duration, options?.trimStart ?? 0));
      const trimEnd = Math.max(trimStart, Math.min(decoded.duration, options?.trimEnd ?? decoded.duration));
      const sampleLength = Math.round((trimEnd - trimStart) * sampleRate);
      if (!sampleLength || sampleLength > 131_070) {
        message.error(t('music.warning.sampleTooLong'));
        return;
      }
      const gain = Math.max(0, Math.min(2, options?.gain ?? 1));
      const removeDc = options?.removeDc ?? false;
      const fadeInMs = Math.max(0, Math.min(5000, options?.fadeInMs ?? 0));
      const fadeOutMs = Math.max(0, Math.min(5000, options?.fadeOutMs ?? 0));
      const preparedPcm = prepareTrackerSamplePcm(
        Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel)),
        decoded.sampleRate,
        { trimStart, trimEnd, gain, removeDc, fadeInMs, fadeOutMs },
        sampleRate,
      );
      const importedName = file.name.replace(/\.[^.]+$/, '').replace(/[^\x20-\x7e]/g, '_').slice(0, 22);
      const next = replaceModSamplePcm(mod, instrumentIndex - 1, preparedPcm, importedName);
      if (!next) {
        message.error(t('music.warning.sampleTooLong'));
        return;
      }
      setModUndo(history => [...history.slice(-31), mod]);
      setModRedo([]);
      setMod(next);
      markCurrentTrackDirty();
      appendImportedAudioSource({
        id: createTrackerUuid(),
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sourceAudioData: bytesToBase64(sourceBytes),
        sourcePcmData: bytesToBase64(sourcePcmBytes),
        pcmFrames: decoded.length,
        pcmEncoding: 'float32le-interleaved',
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        durationSeconds: decoded.duration,
        trimStart,
        trimEnd,
        gain,
        removeDc,
        fadeInMs,
        fadeOutMs,
        instrumentIndex,
      });
      markCurrentTrackDirty();
      message.success(t('music.warning.sampleImported', { file: file.name, instrument: instrumentIndex }));
    } catch {
      message.error(t('music.warning.sampleImportFailed'));
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  };
  const importS3mAudioSample = async (file: File, instrumentIndex: number, _noteZone?: { low: number; high: number }, options?: { trimStart: number; trimEnd: number; gain: number; removeDc: boolean; fadeInMs: number; fadeOutMs: number }) => {
    if (info?.format !== 'S3M' || !moduleBytes || instrumentIndex < 1 || instrumentIndex > info.instruments) return;
    const audioContext = new AudioContext();
    try {
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      const decoded = await audioContext.decodeAudioData(sourceBytes.slice().buffer);
      const sourcePcmBytes = new Uint8Array(decoded.length * decoded.numberOfChannels * Float32Array.BYTES_PER_ELEMENT);
      const sourcePcmView = new DataView(sourcePcmBytes.buffer);
      for (let frame = 0; frame < decoded.length; frame += 1) {
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          sourcePcmView.setFloat32((frame * decoded.numberOfChannels + channel) * Float32Array.BYTES_PER_ELEMENT, decoded.getChannelData(channel)[frame], true);
        }
      }
      const sampleRate = TRACKER_SAMPLE_RATE;
      const trimStart = Math.max(0, Math.min(decoded.duration, options?.trimStart ?? 0));
      const trimEnd = Math.max(trimStart, Math.min(decoded.duration, options?.trimEnd ?? decoded.duration));
      const gain = Math.max(0, Math.min(2, options?.gain ?? 1));
      const removeDc = options?.removeDc ?? false;
      const fadeInMs = Math.max(0, Math.min(5000, options?.fadeInMs ?? 0));
      const fadeOutMs = Math.max(0, Math.min(5000, options?.fadeOutMs ?? 0));
      const preparedPcm = prepareTrackerSamplePcm(
        Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel)),
        decoded.sampleRate,
        { trimStart, trimEnd, gain, removeDc, fadeInMs, fadeOutMs },
        sampleRate,
      );
      const importedName = file.name.replace(/\.[^.]+$/, '').replace(/[^\x20-\x7e]/g, '_').slice(0, 28);
      const next = replaceS3mSamplePcm(moduleBytes, instrumentIndex - 1, preparedPcm, importedName);
      if (!next) {
        message.error(t('music.warning.sampleImportFailed'));
        return;
      }
      s3mUndo.current = [...s3mUndo.current.slice(-31), moduleBytes];
      s3mRedo.current = [];
      setModuleBytes(next);
      appendImportedAudioSource({
        id: createTrackerUuid(),
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sourceAudioData: bytesToBase64(sourceBytes),
        sourcePcmData: bytesToBase64(sourcePcmBytes),
        pcmFrames: decoded.length,
        pcmEncoding: 'float32le-interleaved',
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        durationSeconds: decoded.duration,
        trimStart,
        trimEnd,
        gain,
        removeDc,
        fadeInMs,
        fadeOutMs,
        instrumentIndex,
      });
      markCurrentTrackDirty();
      message.success(t('music.warning.sampleImported', { file: file.name, instrument: instrumentIndex }));
    } catch {
      message.error(t('music.warning.sampleImportFailed'));
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  };
  const importItAudioSample = async (file: File, instrumentIndex: number, _noteZone?: { low: number; high: number }, options?: { trimStart: number; trimEnd: number; gain: number; removeDc: boolean; fadeInMs: number; fadeOutMs: number }) => {
    const sampleMode = info?.format === 'IT' && info.instruments === 0;
    const slotCount = sampleMode ? (info?.sampleCount ?? 0) : (info?.instruments ?? 0);
    if (info?.format !== 'IT' || !moduleBytes || instrumentIndex < 1 || instrumentIndex > slotCount) return;
    const audioContext = new AudioContext();
    try {
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      const decoded = await audioContext.decodeAudioData(sourceBytes.slice().buffer);
      const sourcePcmBytes = new Uint8Array(decoded.length * decoded.numberOfChannels * Float32Array.BYTES_PER_ELEMENT);
      const sourcePcmView = new DataView(sourcePcmBytes.buffer);
      for (let frame = 0; frame < decoded.length; frame += 1) {
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          sourcePcmView.setFloat32((frame * decoded.numberOfChannels + channel) * Float32Array.BYTES_PER_ELEMENT, decoded.getChannelData(channel)[frame], true);
        }
      }
      const sampleRate = TRACKER_SAMPLE_RATE;
      const trimStart = Math.max(0, Math.min(decoded.duration, options?.trimStart ?? 0));
      const trimEnd = Math.max(trimStart, Math.min(decoded.duration, options?.trimEnd ?? decoded.duration));
      const gain = Math.max(0, Math.min(2, options?.gain ?? 1));
      const removeDc = options?.removeDc ?? false;
      const fadeInMs = Math.max(0, Math.min(5000, options?.fadeInMs ?? 0));
      const fadeOutMs = Math.max(0, Math.min(5000, options?.fadeOutMs ?? 0));
      const preparedPcm = prepareTrackerSamplePcm(
        Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel)),
        decoded.sampleRate,
        { trimStart, trimEnd, gain, removeDc, fadeInMs, fadeOutMs },
        sampleRate,
      );
      const importedName = file.name.replace(/\.[^.]+$/, '').replace(/[^\x20-\x7e]/g, '_').slice(0, 26);
      const next = sampleMode
        ? replaceItSamplePcm(moduleBytes, instrumentIndex - 1, preparedPcm, importedName)
        : replaceItInstrumentPcm(moduleBytes, instrumentIndex - 1, preparedPcm, importedName);
      if (!next) {
        message.error(t('music.warning.sampleImportFailed'));
        return;
      }
      setItUndo(history => [...history.slice(-31), moduleBytes]);
      setItRedo([]);
      setModuleBytes(next);
      appendImportedAudioSource({
        id: createTrackerUuid(),
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sourceAudioData: bytesToBase64(sourceBytes),
        sourcePcmData: bytesToBase64(sourcePcmBytes),
        pcmFrames: decoded.length,
        pcmEncoding: 'float32le-interleaved',
        sampleRate: decoded.sampleRate,
        channels: decoded.numberOfChannels,
        durationSeconds: decoded.duration,
        trimStart,
        trimEnd,
        gain,
        removeDc,
        fadeInMs,
        fadeOutMs,
        instrumentIndex,
      });
      markCurrentTrackDirty();
      message.success(t('music.warning.sampleImported', { file: file.name, instrument: instrumentIndex }));
    } catch {
      message.error(t('music.warning.sampleImportFailed'));
    } finally {
      await audioContext.close().catch(() => undefined);
    }
  };
  const exportEditedTracker = () => {
    if (!moduleBytes || !info || info.format === 'MOD') return;
    const exportComposition = projectPackage && musicComposition.current
      ? omitMutedMusicCompositionChannels(musicComposition.current, mutedChannels)
      : null;
    const exportBytes = exportComposition
      ? exportMusicComposition(exportComposition, exportComposition.targetFormat).moduleData
      : moduleBytes;
    const blob = new Blob([exportBytes], { type: `audio/${info.format.toLowerCase()}` });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${(info.title || 'edited-module').replace(/[^a-z0-9_-]+/gi, '_')}.${info.format.toLowerCase()}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const saveEditedTrackerProject = async (): Promise<boolean> => {
    if ((!moduleBytes && !mod) || !info) return false;
    const sourceName = filename || `${(info.title || 'module').replace(/[^a-z0-9_-]+/gi, '_')}.${info.format.toLowerCase()}`;
    const moduleData = info.format === 'MOD' && mod ? mod.bytes : new Uint8Array(moduleBytes!);
    const currentBytes = moduleData.buffer.slice(moduleData.byteOffset, moduleData.byteOffset + moduleData.byteLength) as ArrayBuffer;
    const currentComposition = projectPackage && musicComposition.current ? musicComposition.current : undefined;
    const projectedCanonicalBytes = currentComposition
      ? new Uint8Array(exportMusicComposition(currentComposition, currentComposition.targetFormat).moduleData)
      : undefined;
    const moduleMatchesCanonical = canonicalAuthoringPendingRef.current || Boolean(projectedCanonicalBytes
      && projectedCanonicalBytes.length === moduleData.length && projectedCanonicalBytes.every((value, index) => value === moduleData[index]));
    const canonicalComposition = moduleMatchesCanonical ? currentComposition! : importTrackerModuleComposition(
      currentBytes, musicSource?.assetFileName ?? sourceName,
      originalModuleBytes.current ?? currentBytes, currentComposition,
      { muted: [], volumes: channelVolumes, pans: channelPans },
    );
    const source = info.format === 'XM' ? createMusicEditorSourceDocument(moduleBytes!, musicSource?.assetFileName ?? sourceName, musicSource) : null;
    // Canonical composition edits can add instruments the scratch XM compiler cannot round-trip yet.
    // Keep the composition authoritative and omit a stale scratch projection from the package.
    const sourceDocument = source && !canonicalAuthoringPendingRef.current ? {
      ...source,
      channelMixer: {
        muted: Array.from({ length: source.channels.length }, () => false),
        volumes: Array.from({ length: source.channels.length }, (_, index) => Math.max(0, Math.min(1, channelVolumes[index] ?? 1))),
        pans: Array.from({ length: source.channels.length }, (_, index) => Math.max(-1, Math.min(1, channelPans[index] ?? 0))),
      },
    } : null;
    if (sourceDocument?.origin === 'scratch') {
      const compiled = compileMusicEditorSourceDocument(sourceDocument);
      if (getMusicModuleFingerprint(compiled) !== getMusicModuleFingerprint(moduleBytes!)) {
        message.error(t('music.warning.sourceOutOfSync'));
        return false;
      }
    }
    const packageName = projectPackage
      ? sourceName
      : `${sourceName.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]/gi, '_')}-project.gbatracker`;
    const packageBytes = createTrackerProjectPackage({
      id: musicProjectId.current,
      schema: 'gba-studio/music-project',
      version: 1,
      origin: sourceDocument?.origin ?? musicProjectOrigin.current,
      sourceFilename: source?.assetFileName ?? sourceName,
      composition: canonicalComposition,
      editorSettings: editorSettingsRef.current,
      sourceDocument,
      importedAudioSources: importedAudioSourcesRef.current,
    });
    const result = await window.electronAPI.saveTrackerProject(packageName, bytesToBase64(packageBytes), projectPackage);
    if (result?.status === 'success') {
      musicComposition.current = canonicalComposition;
      canonicalAuthoringPendingRef.current = false;
      if (sourceDocument) setMusicSource(sourceDocument);
      if (musicWorkspace?.selectedAssetId) musicWorkspace.setAssetDirty(musicWorkspace.selectedAssetId, false);
      onSaved?.();
      return true;
    }
    message.error(t('music.warning.saveFailed'));
    return false;
  };
  saveEditedTrackerProjectRef.current = saveEditedTrackerProject;
  const switchMusicTarget = async (target: MusicExportTarget) => {
    if (!projectPackage || !filename || !info || target === info.format || switchingMusicTarget) return;
    setSwitchingMusicTarget(true);
    try {
      if (!await saveEditedTrackerProjectRef.current()) return;
      const currentComposition = musicComposition.current;
      if (!currentComposition) throw new Error('This project has no canonical music composition.');
      const nextComposition = selectMusicExportTarget(currentComposition, target);
      const exported = exportMusicComposition(nextComposition, target);
      if (exported.warnings.length) {
        const confirmed = await new Promise<boolean>(resolve => modal.confirm({
          title: t('music.target.switchConfirmTitle', { format: target }),
          content: <div>
            <p>{t('music.target.switchConfirmDescription')}</p>
            <p>{t('music.target.keepSource')}</p>
            <ul style={{ maxHeight: 220, overflowY: 'auto', paddingInlineStart: 24 }}>
              {exported.warnings.map(warning => <li key={warning}>{localizeTrackerWarning(warning)}</li>)}
            </ul>
          </div>,
          okText: t('music.target.switchConfirm'), cancelText: t('common.cancel'),
          onOk: () => resolve(true), onCancel: () => resolve(false),
        }));
        if (!confirmed) return;
      }
      const targetBytes = new Uint8Array(exported.moduleData);
      const targetBuffer = targetBytes.buffer.slice(targetBytes.byteOffset, targetBytes.byteOffset + targetBytes.byteLength) as ArrayBuffer;
      if (parseTrackerModule(targetBuffer, target).format !== target) throw new Error(`The ${target} export could not be parsed after target switching.`);
      const targetSourceName = `${filename.replace(/\.gbatracker$/i, '')}.${target.toLowerCase()}`;
      const targetSourceDocument = target === 'XM'
        ? { ...createMusicEditorSourceDocument(targetBuffer, targetSourceName), origin: musicProjectOrigin.current }
        : null;
      const packageBytes = createTrackerProjectPackage({
        id: musicProjectId.current,
        schema: 'gba-studio/music-project',
        version: 1,
        origin: musicProjectOrigin.current,
        sourceFilename: currentComposition.sourceModules[0]?.fileName ?? targetSourceName,
        sourceDocument: targetSourceDocument,
        composition: nextComposition,
        editorSettings: editorSettingsRef.current,
        importedAudioSources: importedAudioSourcesRef.current,
      });
      const result = await window.electronAPI.saveTrackerProject(filename, bytesToBase64(packageBytes), true);
      if (result?.status !== 'success') throw new Error(result?.message ?? t('music.target.switchFailed'));
      musicComposition.current = nextComposition;
      originalModuleBytes.current = targetBuffer.slice(0);
      if (targetSourceDocument) setMusicSource(targetSourceDocument);
      if (musicWorkspace?.selectedAssetId) musicWorkspace.setAssetDirty(musicWorkspace.selectedAssetId, false);
      message.success(t('music.target.switched', { format: target }));
      setSwitchingMusicTarget(false);
      onTargetSwitched?.();
      onSaved?.();
    } catch (error) {
      console.error('Unable to switch GBA Tracker target:', error);
      message.error(t('music.target.switchFailed'));
    } finally {
      setSwitchingMusicTarget(false);
    }
  };
  const playMaxmodRomPreview = async () => {
    if (!moduleBytes || !info || info.format === 'unknown') return { status: 'error', message: 'No supported tracker module is loaded.' };
    trackerGeneration.current += 1;
    if (trackerTimer.current !== null) window.clearTimeout(trackerTimer.current);
    trackerTimer.current = null;
    trackerPlayer.current.stop();
    stopSelectedNotePreview();
    setTrackerPlaying(false);
    let bytes = projectPackage && musicComposition.current
      ? new Uint8Array(exportMusicComposition(musicComposition.current, musicComposition.current.targetFormat).moduleData)
      : mod ? mod.bytes : new Uint8Array(moduleBytes);
    if (info.format === 'IT') {
      const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const compatible = flattenItInstrumentModeForBuild(source);
      if (!compatible) return { status: 'error', message: 'This IT instrument map cannot be represented by the GBA build preview.' };
      bytes = new Uint8Array(compatible);
    }
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
    return window.electronAPI.playTrackerModulePreview(btoa(binary), settings, false, false, false, 0, false, false, false, 0, 30, !trackerPreviewLoop.current);
  };
  const previewRows = info.format === 'XM' ? xmPatternRows : info.format === 'S3M' ? s3mPatternRows : itPatternRows;
    const gridRows: TrackerPatternEvent[][] = mod
    ? (mod.patterns[currentPattern] ?? []).map(row => row.map(event => ({ note: event.period, instrument: event.sample, volume: 0, effect: event.effect, parameter: event.parameter })))
    : info.format === 'S3M' ? s3mPatternRows
      : info.format === 'IT' ? itPatternRows
        : [];
  const itEventHasNote = (event: TrackerPatternEvent | undefined) => Boolean(event
    && (event.notePresent ?? event.instrument > 0) && event.note < 120);
  const isGridNote = (event: TrackerPatternEvent | undefined) => {
    if (!event) return false;
    if (info.format === 'IT') return itEventHasNote(event);
    if (!event.note) return false;
    if (info.format === 'S3M') return event.note < 0xf0;
    return true;
  };
  const selectGridCell = (cell: { row: number; channel: number }, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    setSelectedCell(cell);
    const note = gridRows[cell.row]?.[cell.channel];
    if (note?.instrument) setActiveInstrument(note.instrument);
    if (modifiers.shiftKey && isGridNote(note) && trackerSelectionAnchor.current?.channel === cell.channel) {
      const anchor = trackerSelectionAnchor.current;
      const low = Math.min(anchor.row, cell.row);
      const high = Math.max(anchor.row, cell.row);
      const range = gridRows.flatMap((row, rowIndex) => rowIndex >= low && rowIndex <= high && isGridNote(row[cell.channel]) ? [{ row: rowIndex, channel: cell.channel }] : []);
      setSelectedGridCells(range.length ? range : [cell]);
    } else if ((modifiers.ctrlKey || modifiers.metaKey) && isGridNote(note)) {
      const exists = selectedGridCells.some(item => item.row === cell.row && item.channel === cell.channel);
      const next = exists
        ? selectedGridCells.filter(item => item.row !== cell.row || item.channel !== cell.channel)
        : [...selectedGridCells, cell];
      setSelectedGridCells(next.length ? next : [cell]);
      if (!trackerSelectionAnchor.current) trackerSelectionAnchor.current = cell;
    } else {
      setSelectedGridCells(isGridNote(note) ? [cell] : []);
      trackerSelectionAnchor.current = isGridNote(note) ? cell : null;
    }
  };
  const selectedTrackerNotes = () => {
    const cells = selectedGridCells.length ? selectedGridCells : [selectedCell];
    return cells.flatMap(cell => {
      const event = gridRows[cell.row]?.[cell.channel];
      return isGridNote(event) ? [{ ...cell, event: { ...event } }] : [];
    });
  };
  const applyGridUpdates = (updates: Array<{ row: number; channel: number; patch: Partial<TrackerPatternEvent> }>, patternIndex = selectedPattern) => {
    if (!instrumentsAllowed(updates.map(update => ({ channel: update.channel, instrument: update.patch.instrument ?? 0 })))) return false;
    if (updates.length === 0) return false;
    if (mod) {
      const next = updateModEvents(mod, patternIndex, updates.map(({ row, channel, patch }) => ({
        row,
        channel,
        patch: { period: patch.note, sample: patch.instrument, effect: patch.effect, parameter: patch.parameter } as Partial<ModEvent>,
      } satisfies ModEventUpdate)));
      if (next === mod) return false;
      setModUndo(history => [...history.slice(-31), mod]);
      setModRedo([]);
      setMod(next);
      updateCanonicalPatternEffects(patternIndex, updates.flatMap(({ row, channel, patch }) => {
        if (patch.effect === undefined && patch.parameter === undefined) return [];
        const current = patternRowsByIndex[patternIndex]?.[row]?.[channel] ?? { effect: 0, parameter: 0 };
        return [{ row, channel, effect: patch.effect ?? current.effect, parameter: patch.parameter ?? current.parameter }];
      }));
      markCurrentTrackDirty();
      return true;
    }
    if (!moduleBytes) return false;
    const trackerUpdates: TrackerPatternEventUpdate[] = updates.map(({ row, channel, patch }) => ({ row, channel, patch }));
    const next = info.format === 'S3M'
      ? updateS3mPatternEvents(moduleBytes, patternIndex, trackerUpdates)
      : info.format === 'IT'
        ? updateItPatternEvents(moduleBytes, patternIndex, trackerUpdates)
        : moduleBytes;
    if (next === moduleBytes) return false;
    if (info.format === 'S3M') {
      s3mUndo.current = [...s3mUndo.current.slice(-31), moduleBytes];
      s3mRedo.current = [];
    } else if (info.format === 'IT') {
      setItUndo(history => [...history.slice(-31), moduleBytes]);
      setItRedo([]);
    } else return false;
    setModuleBytes(next);
    updateCanonicalPatternEffects(patternIndex, updates.flatMap(({ row, channel, patch }) => {
      if (patch.effect === undefined && patch.parameter === undefined) return [];
      const current = patternRowsByIndex[patternIndex]?.[row]?.[channel] ?? { effect: 0, parameter: 0 };
      return [{ row, channel, effect: patch.effect ?? current.effect, parameter: patch.parameter ?? current.parameter }];
    }));
    markCurrentTrackDirty();
    return true;
  };
  // A gesture can span several order entries. Commit its effect-only patches as one undo step.
  const commitFxChanges = (changes: Array<{ patternIndex: number; row: number; channel: number; effect: number; parameter: number }>) => {
    const updates = [...new Map(changes.map(change => [`${change.patternIndex}:${change.row}:${change.channel}`, change])).values()]
      .filter(change => {
        const current = patternRowsByIndex[change.patternIndex]?.[change.row]?.[change.channel];
        return current && (current.effect !== change.effect || current.parameter !== change.parameter);
      });
    if (!updates.length) return;
    if (projectPackage && musicComposition.current) {
      let composition = musicComposition.current;
      for (const { patternIndex, row, channel, effect, parameter } of updates) {
        composition = setMusicCompositionPatternEffect(composition, patternIndex, row, channel, info.format as MusicExportTarget, effect, parameter, true);
        if (isTrackerNotePanEffect(info.format as MusicExportTarget, effect, parameter)) composition = setMusicCompositionNoteProperties(
          composition, patternIndex, row, channel, { pan: decodeTrackerNotePan(info.format as MusicExportTarget, effect, parameter) });
      }
      commitCanonicalRollEdits([], updates[0].patternIndex, false, undefined, composition);
      return;
    }
    const groups = new Map<number, Array<{ row: number; channel: number; patch: Partial<TrackerPatternEvent> }>>();
    for (const { patternIndex, row, channel, effect, parameter } of updates) {
      const group = groups.get(patternIndex) ?? [];
      group.push({ row, channel, patch: { effect, parameter } }); groups.set(patternIndex, group);
    }
    if (mod) {
      let next = mod;
      for (const [patternIndex, group] of groups) next = updateModEvents(next, patternIndex,
        group.map(({ row, channel, patch }) => ({ row, channel, patch: { effect: patch.effect, parameter: patch.parameter } })));
      if (next !== mod) { setModUndo(history => [...history.slice(-31), mod]); setModRedo([]); setMod(next); markCurrentTrackDirty(); }
      return;
    }
    if (!moduleBytes) return;
    let next = moduleBytes;
    for (const [patternIndex, group] of groups) {
      if (info.format === 'XM') next = compileMusicEditorSourceCommand(next, { type: 'patch-events', patternIndex, updates: group });
      else if (info.format === 'S3M') next = updateS3mPatternEvents(next, patternIndex, group);
      else if (info.format === 'IT') next = updateItPatternEvents(next, patternIndex, group);
    }
    if (next === moduleBytes) return;
    if (info.format === 'XM') { commitXmEdit(next); return; }
    if (info.format === 'S3M') { s3mUndo.current = [...s3mUndo.current.slice(-31), moduleBytes]; s3mRedo.current = []; }
    else if (info.format === 'IT') { setItUndo(history => [...history.slice(-31), moduleBytes]); setItRedo([]); }
    else return;
    setModuleBytes(next); markCurrentTrackDirty();
  };
  const copyTrackerNotes = () => {
    const notes = selectedTrackerNotes();
    if (!notes.length) return;
    const baseRow = Math.min(...notes.map(note => note.row));
    const baseChannel = Math.min(...notes.map(note => note.channel));
    setTrackerClipboard({
      format: info.format,
      events: notes.map(note => ({ rowOffset: note.row - baseRow, channelOffset: note.channel - baseChannel, event: note.event })),
    });
  };
  const pasteTrackerNotes = () => {
    if (!trackerClipboard || trackerClipboard.format !== info.format || trackerClipboard.events.length === 0) return;
    const rowCount = gridRows.length;
    const maxRowOffset = Math.max(...trackerClipboard.events.map(item => item.rowOffset));
    const occupied = new Set(gridRows.flatMap((row, rowIndex) => row.flatMap((event, channel) =>
      event && (event.note || event.instrument || event.volume || event.effect || event.parameter) ? [`${rowIndex}:${channel}`] : [])));
    let baseRow = -1;
    for (let candidate = selectedCell.row; candidate + maxRowOffset < rowCount; candidate += 1) {
      const targets = trackerClipboard.events.map(item => ({ row: candidate + item.rowOffset, channel: selectedCell.channel + item.channelOffset }));
      if (targets.some(target => target.channel >= info.channels)) continue;
      if (targets.every(target => !occupied.has(`${target.row}:${target.channel}`))) { baseRow = candidate; break; }
    }
    if (baseRow < 0) {
      message.warning(t('music.warning.noPasteRows'));
      return;
    }
    const updates = trackerClipboard.events.map(item => ({
      row: baseRow + item.rowOffset,
      channel: selectedCell.channel + item.channelOffset,
      patch: item.event,
    }));
    if (!applyGridUpdates(updates)) return;
    const pastedCells = updates.map(({ row, channel }) => ({ row, channel }));
    setSelectedGridCells(pastedCells);
    setSelectedCell(pastedCells[0]);
    trackerSelectionAnchor.current = pastedCells[0];
    if (baseRow !== selectedCell.row) message.warning(t('music.warning.pasteMoved'));
  };
  const cutTrackerNotes = () => {
    const notes = selectedTrackerNotes();
    if (!notes.length) return;
    copyTrackerNotes();
    if (applyGridUpdates(notes.map(({ row, channel }) => ({ row, channel, patch: { note: 0, instrument: 0 } })))) {
      setSelectedGridCells([]);
      trackerSelectionAnchor.current = null;
    }
  };
  const duplicateTrackerNotes = () => {
    const notes = selectedTrackerNotes();
    if (!notes.length) return;
    const baseRow = Math.min(...notes.map(note => note.row));
    const baseChannel = Math.min(...notes.map(note => note.channel));
    const maxOffset = Math.max(...notes.map(note => note.row - baseRow));
    const occupied = new Set(gridRows.flatMap((row, rowIndex) => row.flatMap((event, channel) =>
      event && (event.note || event.instrument || event.volume || event.effect || event.parameter) ? [`${rowIndex}:${channel}`] : [])));
    let destination = -1;
    for (let row = Math.max(...notes.map(note => note.row)) + 1; row + maxOffset < gridRows.length; row += 1) {
      const targets = notes.map(note => `${row + note.row - baseRow}:${note.channel - baseChannel + baseChannel}`);
      if (targets.every(target => !occupied.has(target))) { destination = row; break; }
    }
    if (destination < 0) { message.warning(t('music.warning.noDuplicateRows')); return; }
    const updates = notes.map(note => ({ row: destination + note.row - baseRow, channel: note.channel, patch: note.event }));
    if (!applyGridUpdates(updates)) return;
    const selection = updates.map(({ row, channel }) => ({ row, channel }));
    setSelectedGridCells(selection);
    setSelectedCell(selection[0]);
    trackerSelectionAnchor.current = selection[0];
  };
  const deleteTrackerNotes = () => {
    const notes = selectedTrackerNotes();
    if (!notes.length) return;
    if (applyGridUpdates(notes.map(({ row, channel }) => ({ row, channel, patch: { note: 0, instrument: 0 } })))) {
      setSelectedGridCells([]);
      trackerSelectionAnchor.current = null;
    }
  };
  const quantizeTrackerNotes = () => {
    const notes = selectedTrackerNotes().sort((a, b) => a.row - b.row || a.channel - b.channel);
    if (!notes.length) return;
    const selectedKeys = new Set(notes.map(note => `${note.row}:${note.channel}`));
    const occupied = new Set(gridRows.flatMap((row, rowIndex) => row.flatMap((event, channel) => {
      if (selectedKeys.has(`${rowIndex}:${channel}`)) return [];
      return event && (event.note || event.instrument || event.volume || event.effect || event.parameter) ? [`${rowIndex}:${channel}`] : [];
    })));
    let collisionAdjusted = false;
    const placements = notes.map(note => {
      const desired = Math.min(gridRows.length - 1, Math.max(0, Math.round(note.row / trackerQuantizeRows) * trackerQuantizeRows));
      const find = (candidates: number[]) => candidates.sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b)
        .find(row => !occupied.has(`${row}:${note.channel}`));
      const quantizedRows = Array.from({ length: gridRows.length }, (_, row) => row).filter(row => row % trackerQuantizeRows === 0);
      const row = find(quantizedRows) ?? find(Array.from({ length: gridRows.length }, (_, index) => index));
      if (row === undefined) return { ...note, targetRow: note.row };
      if (row !== desired) collisionAdjusted = true;
      occupied.add(`${row}:${note.channel}`);
      return { ...note, targetRow: row };
    });
    const moved = placements.filter(item => item.targetRow !== item.row);
    if (!moved.length) return;
    const updates = [
      ...moved.map(item => ({ row: item.row, channel: item.channel, patch: { note: 0, instrument: 0 } })),
      ...moved.map(item => ({ row: item.targetRow, channel: item.channel, patch: item.event })),
    ];
    if (!applyGridUpdates(updates)) return;
    const nextSelection = placements.map(({ targetRow, channel }) => ({ row: targetRow, channel }));
    setSelectedGridCells(nextSelection);
    setSelectedCell(nextSelection[0]);
    trackerSelectionAnchor.current = nextSelection[0];
    if (collisionAdjusted) message.warning(t('music.warning.notesShifted'));
  };
  const editTrackerPianoNote = (oldNote: TrackerRollNote | null, start: number, end: number, pitch: number, instrument: number) => {
    if (!['MOD', 'S3M', 'IT'].includes(info.format)) return;
    const result = buildTrackerPianoEdit(info.format as 'MOD' | 'S3M' | 'IT', gridRows, selectedCell.channel, oldNote, start, end, pitch, instrument);
    if (result.warning) { message.warning(localizeTrackerWarning(result.warning)); return; }
    const updates = result.updates.map(({ row, channel, patch }) => ({ row, channel, patch }));
    if (applyGridUpdates(updates)) {
      const cell = { row: Math.max(0, Math.min(gridRows.length - 1, start)), channel: oldNote?.channel ?? selectedCell.channel };
      setSelectedCell(cell);
      setSelectedGridCells([cell]);
      trackerSelectionAnchor.current = cell;
    }
  };
  musicCommandRef.current = command => {
    if (moduleBytes && ['MOD', 'XM', 'S3M', 'IT'].includes(info.format) && beatEditorView !== 'tracker') {
      window.dispatchEvent(new CustomEvent('gba-studio:gba-editor-command', { detail: { command } }));
    } else if (command === 'copy') copyTrackerNotes();
    else if (command === 'cut') cutTrackerNotes();
    else if (command === 'paste') pasteTrackerNotes();
    else if (command === 'duplicate') duplicateTrackerNotes();
  };
  if (!musicWorkspace || String(info.format) === 'unknown') {
    musicInspectorSelectionRef.current = null;
    musicInspectorEditRef.current = () => undefined;
  } else {
    const format = info.format as TrackerRollFormat;
    const event = gridRows[selectedCell.row]?.[selectedCell.channel];
    const pitch = format === 'MOD'
      ? event?.note ? trackerPeriodToPitch(event.note) : 0
      : format === 'IT' && !itEventHasNote(event) ? 0 : trackerStoredNoteToPitch(format, event?.note ?? 0);
    if (!event || !pitch) musicInspectorSelectionRef.current = null;
    else {
      let end = Math.min(gridRows.length, selectedCell.row + 4);
      for (let row = selectedCell.row + 1; row < gridRows.length; row += 1) {
        const next = gridRows[row]?.[selectedCell.channel];
        if (format === 'MOD' && next?.effect === 14 && (next.parameter >> 4) === 12) { end = row; break; }
        if (format !== 'MOD' && next && (next.note === 254 || format === 'IT' && next.note >= 254 || format === 'IT' && next.note === 246)) { end = row; break; }
        if (next && (format === 'MOD' ? next.note > 0 : format === 'IT' ? itEventHasNote(next) : next.note > 0 && next.note < 97)) { end = row; break; }
      }
      const selectedCount = selectedGridCells.filter(cell => {
        const selected = gridRows[cell.row]?.[cell.channel];
        return selected && (format === 'MOD' ? selected.note > 0 : format === 'IT' ? itEventHasNote(selected) : selected.note > 0 && selected.note < 97);
      }).length;
      musicInspectorSelectionRef.current = {
        row: selectedCell.row,
        note: pitch,
        length: Math.max(1, end - selectedCell.row),
        instrument: Math.max(1, event.instrument || activeInstrument),
        volume: format === 'MOD' ? 100 : Math.round(Math.max(0, Math.min(64, event.volume)) * 100 / 64),
        pan: (format === 'MOD' || format === 'XM') && event.effect === 14 && (event.parameter >> 4) === 8
          ? ((event.parameter & 15) <= 8 ? ((event.parameter & 15) - 8) / 8 : ((event.parameter & 15) - 8) / 7)
          : format === 'XM' && event.effect === 8 ? (event.parameter <= 128 ? (event.parameter - 128) / 128 : (event.parameter - 128) / 127)
          : format === 'S3M' && event.effect === 24
            ? (event.parameter <= 128 ? (event.parameter - 128) / 128 : (event.parameter - 128) / 127)
            : format === 'IT' && event.effect === 24
              ? (event.parameter <= 128 ? (event.parameter - 128) / 128 : (event.parameter - 128) / 127)
              : format === 'IT' && event.effect === 19 && (event.parameter >> 4) === 8
                ? ((event.parameter & 15) <= 8 ? ((event.parameter & 15) - 8) / 8 : ((event.parameter & 15) - 8) / 7) : 0,
        effect: event.effect,
        parameter: event.parameter,
        count: Math.max(1, selectedCount),
        volumeEditable: getMusicEditorFormatCapabilities(format, Boolean(projectPackage)).noteVolume,
        panEditable: (event.effect === 0
          || ((format === 'MOD' || format === 'XM') && event.effect === 14 && (event.parameter >> 4) === 8)
          || (format === 'XM' && event.effect === 8)
          || (format === 'S3M' && event.effect === 24)
          || (format === 'IT' && (event.effect === 24 || (event.effect === 19 && (event.parameter >> 4) === 8)))),
      };
    }
    musicInspectorEditRef.current = detail => {
      const current = gridRows[selectedCell.row]?.[selectedCell.channel];
      if (!current) return;
      const currentPitch = format === 'MOD'
        ? current.note > 0 ? trackerPeriodToPitch(current.note) : 0
        : trackerStoredNoteToPitch(format, current.note);
      if (!currentPitch) return;
      const oldNote: TrackerRollNote = {
        row: selectedCell.row,
        channel: selectedCell.channel,
        pitch: currentPitch,
        instrument: current.instrument || activeInstrument,
        end: musicInspectorSelectionRef.current?.row === selectedCell.row
          ? selectedCell.row + musicInspectorSelectionRef.current.length
          : Math.min(gridRows.length, selectedCell.row + 4),
      };
      if (detail.row !== undefined || detail.length !== undefined || detail.note !== undefined || detail.instrument !== undefined) {
        const nextRow = detail.row === undefined ? oldNote.row : Math.max(0, Math.min(gridRows.length - 1, detail.row));
        const nextLength = detail.length === undefined ? oldNote.end - oldNote.row : Math.max(1, detail.length);
        const nextNote = detail.note === undefined ? oldNote.pitch : detail.note;
        const nextInstrument = detail.instrument === undefined ? oldNote.instrument : detail.instrument;
        editTrackerPianoNote(oldNote, nextRow, Math.min(gridRows.length, nextRow + nextLength), nextNote, nextInstrument);
      }
      if (detail.volume !== undefined && projectPackage && musicComposition.current) {
        const composition = setMusicCompositionNoteProperties(musicComposition.current, selectedPattern, selectedCell.row, selectedCell.channel, {
          volume: Math.max(0, Math.min(1, detail.volume / 100)),
        });
        commitCanonicalRollEdits([], selectedPattern, false, undefined, composition);
      } else if (detail.volume !== undefined && format !== 'MOD') {
        const volume = Math.round(Math.max(0, Math.min(100, detail.volume)) * 64 / 100);
        if (format === 'S3M') editS3mEvent({ volume });
        else if (format === 'IT') editItEvent({ volume });
      }
    };
  }
  const diagnosticRows = mod
    ? mod.patterns.flatMap(pattern => pattern.slice(0, 1024).map(row => row.map(event => ({ note: event.period ? 1 : 0, instrument: event.sample, volume: 0, effect: event.effect, parameter: event.parameter }))))
    : moduleBytes
      ? parseTrackerPlaybackRows(moduleBytes, info.format, 1024)
      : previewRows;
  const previewDiagnostics = moduleBytes || mod ? (() => {
    const diagnostics = analyzeTrackerPreview(info.format, diagnosticRows, unifiedSamples, info.channels);
    const preservedSourceWarnings = musicComposition.current?.sourceModules.flatMap(source => source.warnings) ?? [];
    const warnings = [...new Set([...parseTrackerCompatibilityWarnings(moduleBytes ?? new ArrayBuffer(0), info.format), ...preservedSourceWarnings, ...diagnostics.warnings])];
    return { ...diagnostics, warnings: warnings.map(localizeTrackerWarning) };
  })() : null;
  const trackerOrderTable = !mod && moduleBytes ? parseTrackerOrderTable(moduleBytes, info.format) : [];

  const editSamplePcm = (sampleIndex: number, operation: TrackerPcmEditOperation, range?: TrackerPcmEditRange, frameEdits: readonly TrackerPcmFrameEdit[] = [], variantIndex = 0) => {
    if (!moduleBytes || !info) return;
    const instrumentSample = unifiedSamples.get(sampleIndex);
    const current = instrumentSample?.variants?.[variantIndex] ?? (variantIndex === 0 ? instrumentSample : undefined);
    if (!current || current.sixteenBit || current.stereo || (variantIndex > 0 && info.format !== 'XM')) return;
    const pcm = editTrackerPcm(current.samples, operation, range, frameEdits);
    if (!pcm.length) return;
    const name = current.name ?? `Sample ${sampleIndex}`;
    let nextLoopStart = current.loopStart;
    let nextLoopEnd = current.loopEnd;
    if (operation === 'trim' && range) {
      const overlapStart = Math.max(current.loopStart, range.start);
      const overlapEnd = Math.min(current.loopEnd, range.end);
      if (current.loopEnd > current.loopStart && overlapEnd > overlapStart) {
        nextLoopStart = overlapStart - range.start;
        nextLoopEnd = overlapEnd - range.start;
      } else nextLoopStart = nextLoopEnd = 0;
    }
    if (info.format === 'MOD') {
      if (!mod) return;
      const next = replaceModSamplePcm(mod, sampleIndex - 1, pcm, name);
      if (!next) return;
      const preserved = updateModSample(next, sampleIndex - 1, {
        volume: current.volume,
        fineTune: current.fineTune,
        loopStart: nextLoopStart,
        loopLength: nextLoopEnd - nextLoopStart,
      });
      setModUndo(history => [...history.slice(-31), mod]);
      setModRedo([]);
      setMod(preserved);
      updateCanonicalSample(sampleIndex, 0, {
        name, sampleRate: current.sampleRate, channels: 1, bitDepth: 8,
        pcmData: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)), loopStart: nextLoopStart, loopEnd: nextLoopEnd,
      });
      markCurrentTrackDirty();
      return;
    }
    if (info.format === 'XM') {
      if (!musicSource) return;
      const sourceSample = musicSource.samples.find(sample => sample.index === sampleIndex && (sample.variantIndex ?? 0) === variantIndex);
      if (!sourceSample) return;
      const deltaPcm = encodeTrackerDeltaPcm(pcm);
      let next = replaceXmSamplePcm(moduleBytes, sampleIndex, deltaPcm, name, variantIndex);
      if (!next) return;
      next = updateXmSample(next, sampleIndex, {
        volume: current.volume,
        loopStart: nextLoopStart,
        loopEnd: nextLoopEnd,
        rootNote: current.rootNote,
        fineTune: current.fineTune,
        panning: current.panning,
      }, variantIndex);
      if (commitXmEdit(next, {
        type: 'replace-sample',
        sampleIndex,
        sampleId: sourceSample.id,
        sample: { ...sourceSample, length: pcm.length, loopStart: nextLoopStart, loopEnd: nextLoopEnd, sixteenBit: false, encodedPcm: bytesToBase64(deltaPcm) },
      })) updateCanonicalSample(sampleIndex, variantIndex, {
        name, sampleRate: current.sampleRate, channels: 1, bitDepth: 8,
        pcmData: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)), loopStart: nextLoopStart, loopEnd: nextLoopEnd,
      });
      return;
    }
    let next: ArrayBuffer | null = null;
    if (info.format === 'S3M') {
      next = replaceS3mSamplePcm(moduleBytes, sampleIndex - 1, pcm, name, current.sampleRate);
      if (next) next = updateS3mSample(next, sampleIndex, { volume: current.volume, loopStart: nextLoopStart, loopEnd: nextLoopEnd });
      if (next) {
        s3mUndo.current = [...s3mUndo.current.slice(-31), moduleBytes];
        s3mRedo.current = [];
      }
    } else if (info.format === 'IT') {
      next = info.instruments > 0
        ? replaceItInstrumentPcm(moduleBytes, sampleIndex - 1, pcm, name, current.sampleRate)
        : replaceItSamplePcm(moduleBytes, sampleIndex - 1, pcm, name, current.sampleRate);
      if (next) {
        const editedSampleIndex = info.instruments > 0 ? (info.sampleCount ?? 0) + 1 : sampleIndex;
        next = updateItSample(next, editedSampleIndex, { volume: current.volume, loopStart: nextLoopStart, loopEnd: nextLoopEnd });
        setItUndo(history => [...history.slice(-31), moduleBytes]);
        setItRedo([]);
      }
    }
    if (!next) return;
    setModuleBytes(next);
    updateCanonicalSample(sampleIndex, 0, {
      name, sampleRate: current.sampleRate, channels: 1, bitDepth: 8,
      pcmData: bytesToBase64(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)), loopStart: nextLoopStart, loopEnd: nextLoopEnd,
    });
    markCurrentTrackDirty();
  };
  editSamplePcmRef.current = editSamplePcm;
  const editUnifiedSample = (sampleIndex: number, patch: { volume?: number; loopStart?: number; loopEnd?: number; rootNote?: number; fineTune?: number; panning?: number }, variantIndex = 0) => {
    if (projectPackage && musicComposition.current) {
      const previous = musicComposition.current;
      updateCanonicalSample(sampleIndex, variantIndex, patch);
      const composition = musicComposition.current;
      musicComposition.current = previous;
      if (composition !== previous) commitCanonicalRollEdits([], selectedPattern, false, undefined, composition);
      return;
    }
    if (info.format !== 'MOD') { editTrackerSample(sampleIndex, patch, variantIndex); return; }
    if (!mod) return;
    const current = mod.samples[sampleIndex - 1];
    if (!current) return;
    const start = Math.max(0, Math.min(current.length, Math.trunc(patch.loopStart ?? current.loopStart)));
    const end = Math.max(start, Math.min(current.length, Math.trunc(patch.loopEnd ?? (current.loopStart + current.loopLength))));
    const next = updateModSample(mod, sampleIndex - 1, {
      volume: patch.volume,
      loopStart: patch.loopStart === undefined ? undefined : start,
      loopLength: patch.loopEnd === undefined && patch.loopStart === undefined ? undefined : end - start,
      fineTune: patch.fineTune,
    });
    if (next === mod) return;
    setModUndo(history => [...history.slice(-31), mod]);
    setModRedo([]);
    setMod(next);
    updateCanonicalSample(sampleIndex, 0, patch);
    markCurrentTrackDirty();
  };

  editUnifiedSampleRef.current = editUnifiedSample;

  const unifiedOrderTable = mod ? mod.patternTable.slice(0, mod.orders) : trackerOrderTable;
  const toRollDisplayNote = (event: TrackerPatternEvent) => {
    if (info.format === 'MOD') return event.effect === 14 && (event.parameter >> 4) === 12 ? 97 : event.note > 0 ? trackerPeriodToPitch(event.note) : 0;
    if (info.format === 'IT') {
      if (event.note === 255) return 97;
      if (event.note === 254) return 98;
      if (event.note >= 120 && event.note <= 252) return 99;
      return itEventHasNote(event) ? trackerStoredNoteToPitch('IT', event.note) : 0;
    }
    if (info.format === 'S3M' && event.note === 254) return 97;
    if (info.format === 'S3M' && (event.note === 255 || event.notePresent === false)) return 0;
    return trackerStoredNoteToPitch(info.format as TrackerRollFormat, event.note);
  };
  const unifiedRows: TrackerPatternEvent[][] = info.format === 'XM'
    ? xmPatternRows
    : gridRows.map(row => row.map(event => ({
      ...event,
      note: toRollDisplayNote(event),
    })));
  const patternRollNote = (row: number, channel: number): TrackerRollNote | null => {
    if (info.format === 'XM' || info.format === 'unknown') return null;
    const event = gridRows[row]?.[channel];
    const pitch = info.format === 'MOD'
      ? event?.note ? trackerPeriodToPitch(event.note) : 0
      : info.format === 'IT' && !itEventHasNote(event) ? 0 : trackerStoredNoteToPitch(info.format as TrackerRollFormat, event?.note ?? 0);
    if (!event || !pitch) return null;
    let end = Math.min(gridRows.length, row + 4);
    for (let index = row + 1; index < gridRows.length; index += 1) {
      const next = gridRows[index]?.[channel];
      if (info.format === 'MOD' && next?.effect === 14 && (next.parameter >> 4) === 12) { end = index; break; }
      if (info.format !== 'MOD' && next && (next.note === 254 || info.format === 'IT' && next.note >= 254 || info.format === 'IT' && next.note === 246)) { end = index; break; }
      if (next && (info.format === 'MOD' ? next.note > 0 : info.format === 'IT' && !itEventHasNote(next) ? false : trackerStoredNoteToPitch(info.format as TrackerRollFormat, next.note) > 0)) { end = index; break; }
    }
    return { row, channel, pitch, instrument: Math.max(1, event.instrument || activeInstrument), end };
  };
  const applyPatternRollEdits = (edits: Array<{ oldRow?: number; oldNote?: number; start: number; end: number; note: number; channel: number; instrument: number; patternIndex?: number }>, audition = true, effects: Array<{ row: number; channel: number; effect: number; parameter: number }> = []) => {
    if (commitCanonicalRollEdits(edits, edits[0]?.patternIndex ?? selectedPattern, audition)) return;
    if (!instrumentsAllowed(edits)) return;
    if (info.format === 'XM' || info.format === 'unknown') return;
    const targetPattern = edits[0]?.patternIndex ?? selectedPattern;
    const targetRows = targetPattern === selectedPattern ? gridRows
      : info.format === 'MOD' ? (mod?.patterns[targetPattern] ?? []).map(row => row.map(event => ({ note: event.period, instrument: event.sample, volume: 0, effect: event.effect, parameter: event.parameter })))
        : info.format === 'S3M' ? parseS3mPatternRows(moduleBytes!, targetPattern, 64)
          : parseItPatternRows(moduleBytes!, targetPattern, 256);
    const staged = new Map<string, TrackerPatternEventUpdate>();
    const workingRows = targetRows.map(row => row.map(event => ({ ...event })));
    // Clear all moving sources first so notes can swap or land on one another's
    // old rows without leaving stale notes behind or failing the occupancy check.
    for (const edit of edits) {
      if (edit.oldRow === undefined) continue;
      const old = patternRollNote(edit.oldRow, edit.channel);
      if (!old || old.pitch !== edit.oldNote) continue;
      const clear = { row: edit.oldRow, channel: edit.channel, patch: { note: 0, instrument: 0 } };
      staged.set(`${clear.row}:${clear.channel}`, clear);
      if (old.end < workingRows.length) {
        const release = workingRows[old.end]?.[edit.channel];
        if (info.format === 'MOD' && release?.effect === 14 && (release.parameter >> 4) === 12 || info.format !== 'MOD' && release?.note === 254) {
          const clearRelease: TrackerPatternEventUpdate = info.format === 'MOD'
            ? { row: old.end, channel: edit.channel, patch: { effect: 0, parameter: 0 } }
            : { row: old.end, channel: edit.channel, patch: { note: 0, instrument: 0 } };
          staged.set(`${clearRelease.row}:${clearRelease.channel}`, clearRelease);
        }
      }
    }
    for (const update of staged.values()) {
      const event = workingRows[update.row]?.[update.channel];
      if (event) Object.assign(event, update.patch);
    }
    for (const edit of edits) {
      const old = edit.oldRow === undefined ? null : patternRollNote(edit.oldRow, edit.channel);
      if (edit.oldRow !== undefined && (!old || old.pitch !== edit.oldNote)) continue;
      const result = buildTrackerPianoEdit(info.format as TrackerRollFormat, workingRows, edit.channel, null, edit.start, edit.end, edit.note, edit.instrument);
      if (result.warning) { message.warning(localizeTrackerWarning(result.warning)); return; }
      for (const update of result.updates) {
        staged.set(`${update.row}:${update.channel}`, update);
        const event = workingRows[update.row]?.[update.channel];
        if (event) Object.assign(event, update.patch);
      }
    }
    for (const { row, channel, effect, parameter } of effects) {
      const key = `${row}:${channel}`;
      staged.set(key, { row, channel, patch: { ...staged.get(key)?.patch, effect, parameter } });
    }
    const patternIndex = edits[0]?.patternIndex ?? selectedPattern;
    if (applyGridUpdates([...staged.values()], patternIndex)) {
      updateCanonicalNoteEdits(patternIndex, edits);
      const inserted = edits.find(edit => edit.oldRow === undefined);
      if (audition && inserted) void trackerPlayer.current.auditionNote(inserted.note, inserted.instrument, auditionSamples, info.format);
    }
  };
  const erasePatternRollNoteRanges = (ranges: Array<{ row: number; start: number; end: number; channel: number; patternIndex?: number }>) => {
    if (!ranges.length || !moduleBytes) return;
    const targetPattern = ranges[0].patternIndex ?? selectedPattern;
    if (projectPackage && musicComposition.current) {
      const composition = eraseMusicCompositionNoteRanges(musicComposition.current, targetPattern,
        ranges.map(range => ({ ...range, channelIndex: range.channel })));
      commitCanonicalRollEdits([], targetPattern, false, undefined, composition);
      return;
    }
    const targetRows: TrackerPatternEvent[][] = info.format === 'XM' ? parseXmPatternRows(moduleBytes, targetPattern, 256)
      : info.format === 'MOD' ? (mod?.patterns[targetPattern] ?? []).map(row => row.map(event => ({ note: event.period, instrument: event.sample, volume: 0, effect: event.effect, parameter: event.parameter })))
        : info.format === 'S3M' ? parseS3mPatternRows(moduleBytes, targetPattern, 64) : parseItPatternRows(moduleBytes, targetPattern, 256);
    const staged = new Map<string, TrackerPatternEventUpdate>();
    const stage = (row: number, channel: number, patch: Partial<TrackerPatternEvent>) => {
      const key = `${row}:${channel}`;
      staged.set(key, { row, channel, patch: { ...staged.get(key)?.patch, ...patch } });
    };
    const clearNote = { note: 0, instrument: 0, volume: 0, notePresent: false, instrumentPresent: false, volumePresent: false };
    for (const range of ranges) {
      const original = targetRows[range.row]?.[range.channel];
      if (!original || toRollDisplayNote(original) < 1 || toRollDisplayNote(original) > 96) continue;
      let originalEnd = targetRows.length;
      for (let row = range.row + 1; row < targetRows.length; row += 1) {
        const note = toRollDisplayNote(targetRows[row]?.[range.channel] ?? { note: 0, instrument: 0, volume: 0, effect: 0, parameter: 0 });
        if (note > 0) { originalEnd = row; break; }
      }
      const start = Math.max(range.row, Math.min(originalEnd, range.start));
      const end = Math.max(start, Math.min(originalEnd, range.end));
      if (end <= start) continue;
      const left = start > range.row;
      const right = end < originalEnd;
      stage(range.row, range.channel, clearNote);
      const release = targetRows[originalEnd]?.[range.channel];
      const releasePitch = release ? toRollDisplayNote(release) : 0;
      if (!right && releasePitch >= 97 && releasePitch <= 99) stage(originalEnd, range.channel,
        info.format === 'MOD' ? { effect: 0, parameter: 0 } : clearNote);
      if (left) {
        stage(range.row, range.channel, original);
        const boundary = targetRows[start]?.[range.channel];
        if (info.format === 'MOD' && boundary?.effect && !(boundary.effect === 14 && (boundary.parameter >> 4) === 12)) {
          message.warning(t('music.tracker.moveCollision'));
          return;
        }
        stage(start, range.channel, info.format === 'MOD' ? { effect: 14, parameter: 0xc0 }
          : { note: info.format === 'XM' ? 97 : info.format === 'IT' ? 255 : 254, instrument: 0, notePresent: true, instrumentPresent: false });
      }
      if (right) {
        let instrument = original.instrument;
        for (let row = range.row - 1; !instrument && row >= 0; row -= 1) instrument = targetRows[row]?.[range.channel]?.instrument ?? 0;
        stage(end, range.channel, { note: original.note, instrument: instrument || activeInstrument, volume: original.volume,
          notePresent: true, instrumentPresent: true, volumePresent: original.volumePresent });
      }
    }
    const updates = [...staged.values()];
    if (info.format === 'XM') commitXmEventUpdates(targetPattern, updates);
    else applyGridUpdates(updates, targetPattern);
  };
  const deletePatternRollNotes = (notes: Array<{ row: number; channel: number }>, targetPattern = selectedPattern) => {
    if (info.format === 'XM' || info.format === 'unknown') return;
    const updates: TrackerPatternEventUpdate[] = notes.map(({ row, channel }) => ({ row, channel, patch: { note: 0, instrument: 0 } }));
    const targetRows = targetPattern === selectedPattern ? gridRows
      : info.format === 'MOD' ? (mod?.patterns[targetPattern] ?? []).map(row => row.map(event => ({ note: event.period, instrument: event.sample, volume: 0, effect: event.effect, parameter: event.parameter })))
        : info.format === 'S3M' ? parseS3mPatternRows(moduleBytes!, targetPattern, 64) : parseItPatternRows(moduleBytes!, targetPattern, 256);
    for (const note of notes) {
      for (let row = note.row + 1; row < targetRows.length; row += 1) {
        const event = targetRows[row]?.[note.channel];
        if (!event) continue;
        const pitch = toRollDisplayNote(event);
        if (pitch >= 1 && pitch <= 96) break;
        if (pitch >= 97 && pitch <= 99) {
          updates.push({ row, channel: note.channel, patch: info.format === 'MOD' ? { effect: 0, parameter: 0 } : { note: 0, instrument: 0 } });
          break;
        }
      }
    }
    if (applyGridUpdates(updates, targetPattern)) deleteCanonicalNoteCells(targetPattern, notes);
  };
  const deleteKeyboardScoreNotes = (notes: Array<{ row: number; channel: number; patternIndex?: number }>) => {
    if (!notes.length) return;
    const targetPattern = notes[0].patternIndex ?? selectedPattern;
    const preceding = unifiedOrderTable.slice(0, selectedOrder).flatMap(pattern => patternRowsByIndex[pattern] ?? []);
    const initial = trackerScoreTiming(preceding, info.format, { bpm: info.tempo ?? 125, speed: info.speed ?? 6 }).state;
    const updates = trackerScoreDeletion(patternRowsByIndex[targetPattern] ?? [], info.format, notes, initial);
    if (!updates.length) return;
    const effects = updates.filter(update => update.patch.effect !== undefined).map(update => ({ row: update.row, channel: update.channel, effect: 0, parameter: 0 }));
    if (projectPackage && musicComposition.current) {
      let composition = deleteMusicCompositionNotes(musicComposition.current, targetPattern, notes.map(note => ({ row: note.row, channelIndex: note.channel })));
      for (const effect of effects) composition = setMusicCompositionPatternEffect(composition, targetPattern, effect.row, effect.channel, info.format as MusicExportTarget, 0, 0, true);
      commitCanonicalRollEdits([], targetPattern, false, undefined, composition);
    } else if (info.format === 'XM' ? commitXmEventUpdates(targetPattern, updates) : applyGridUpdates(updates, targetPattern)) {
      deleteCanonicalNoteCells(targetPattern, notes);
      if (effects.length) updateCanonicalPatternEffects(targetPattern, effects);
    }
  };
  if (moduleBytes && ['MOD', 'XM', 'S3M', 'IT'].includes(info.format)) return <GBABeatEditor
    externalWorkspacePanels={Boolean(musicWorkspace)}
    instrumentCount={projectPackage && musicComposition.current ? musicComposition.current.instruments.length : undefined}
    info={info} format={info.format} capabilities={getMusicEditorFormatCapabilities(info.format, Boolean(projectPackage))} filename={filename} rows={unifiedRows} pattern={selectedPattern} patternRowCount={info.format === 'XM' ? xmPatternLength : gridRows.length} patternCount={info.patterns} order={unifiedOrderTable}
    selectedOrder={selectedOrder} selectedChannel={selectedChannel} moduleBytes={moduleBytes} samples={unifiedSamples} patternRowsByIndex={patternRowsByIndex}
    patternNames={Array.from({ length: info.patterns }, (_, index) => musicSource?.patterns.find(item => item.index === index)?.name ?? musicComposition.current?.patterns.find(item => item.index === index)?.name ?? `Pattern ${index + 1}`)}
    orderIds={musicSource?.order.map(item => item.id) ?? musicComposition.current?.order.map(item => item.id)}
    instrumentColors={Object.fromEntries(Object.entries(instrumentConfigs).map(([type, ids]) => [type, Object.fromEntries(Object.entries(ids).map(([id, value]) => [id, value.color]))]))}
    instrumentCategories={projectPackage && musicComposition.current ? Object.fromEntries(musicComposition.current.instruments.flatMap(item => item.starterCategory ? [[String(item.index + 1), item.starterCategory]] : [])) : undefined}
    instrumentPresetColors={projectPackage && musicComposition.current ? Object.fromEntries(musicComposition.current.instruments.flatMap(item => item.starterColor ? [[String(item.index + 1), item.starterColor]] : [])) : undefined}
    channelInstrumentTypes={channelInstrumentTypes}
    channelSettings={channelSettings}
    onPatternChange={pattern => { setSelectedPattern(pattern); musicWorkspace?.selectEditorItem('pattern', pattern); }}
    onAddPattern={() => appendPattern()} onDuplicatePattern={() => appendPattern(selectedPattern)} onReorderOrder={reorderXmOrder}
    onOrderChange={index => { setSelectedOrder(index); const pattern = unifiedOrderTable[index]; if (pattern !== undefined && pattern < info.patterns) { setSelectedPattern(pattern); musicWorkspace?.selectEditorItem('pattern', pattern); } }}
    onChannelChange={setSelectedChannel}
    onEffectsChange={commitFxChanges}
    onEffectChange={(row, channel, patternIndex, effect, parameter) => {
      commitFxChanges([{ row, channel, patternIndex, effect, parameter }]);
      const rows = patternRowsByIndex[patternIndex] ?? [];
      let noteRow = row;
      while (noteRow >= 0 && !rows[noteRow]?.[channel]?.note) noteRow -= 1;
      const note = rows[noteRow]?.[channel]?.note ?? 0;
      if (note > 0 && note < 97) void previewExistingNote(noteRow, channel, patternIndex, { row, effect, parameter });
    }}
    onViewChange={setBeatEditorView}
    initialEditorSettings={initialEditorSettings}
    onEditorSettingsChange={settings => {
      if (JSON.stringify(editorSettingsRef.current) === JSON.stringify(settings)) return;
      editorSettingsRef.current = settings;
      if (projectPackage) markCurrentTrackDirty();
    }}
    onNote={(start, end, note, channel, instrument, patternIndex, audition = true) => info.format === 'XM' ? drawXmNote(start, end, note, channel, instrument, patternIndex, audition) : applyPatternRollEdits([{ start, end, note, channel, instrument, patternIndex }], audition)}
    onPreviewNote={(note, selectedInstrument, durationRows) => {
      stopSelectedNotePreview();
      const duration = durationRows === undefined ? undefined : durationRows * (info.speed ?? 6) * 2.5 / (info.tempo ?? 125);
      void trackerPlayer.current.auditionNote(note, selectedInstrument, auditionSamples, info.format, duration);
    }}
    onPreviewSample={previewEditorSample}
    onStopKeyboardPreview={() => trackerPlayer.current.releaseAudition()}
    onPreviewExistingNote={(row, channel, patternIndex) => { void previewExistingNote(row, channel, patternIndex); }}
    onCreateNotes={notes => info.format === 'XM' ? drawXmNotes(notes) : applyPatternRollEdits(notes)}
    onKeyboardGesture={result => {
      if (!result.notes.length || !instrumentsAllowed(result.notes)) return true;
      const targetPattern = result.notes[0].patternIndex ?? selectedPattern;
      if (projectPackage && musicComposition.current) {
        let composition = editMusicCompositionNotes(musicComposition.current, targetPattern, result.notes.map(note => ({
          start: note.start, end: note.end, pitch: note.note, channelIndex: note.channel, instrumentIndex: note.instrument,
        })));
        for (const effect of result.effects) composition = setMusicCompositionPatternEffect(composition, targetPattern, effect.row, effect.channel, info.format as MusicExportTarget, effect.effect, effect.parameter, true);
        commitCanonicalRollEdits([], targetPattern, false, undefined, composition);
      } else if (info.format === 'XM') drawXmNotes(result.notes, result.effects);
      else applyPatternRollEdits(result.notes, false, result.effects);
      return true;
    }}
    onEditNote={(oldRow, oldNote, start, end, note, channel, instrument, patternIndex) => info.format === 'XM' ? editXmNote(oldRow, oldNote, start, end, note, channel, instrument, patternIndex) : applyPatternRollEdits([{ oldRow, oldNote, start, end, note, channel, instrument, patternIndex }])}
    onEditNoteProperties={(notes, patch) => {
      const targetPattern = notes[0]?.patternIndex ?? selectedPattern;
      if (!notes.length || notes.some(note => note.patternIndex !== targetPattern)) return false;
      if (!instrumentsAllowed(notes.map(note => ({ channel: note.channel, instrument: patch.instrument ?? 0 })))) return false;
      if (projectPackage && musicComposition.current) {
        let composition = musicComposition.current;
        for (const note of notes) {
          if (patch.effect !== undefined) composition = setMusicCompositionPatternEffect(composition, targetPattern, note.row, note.channel,
            info.format as MusicExportTarget, patch.effect, patch.parameter ?? 0);
          if (patch.pan !== undefined) {
            const channelId = composition.channels.find(channel => channel.index === note.channel)?.id;
            const gridPan = composition.patterns.find(pattern => pattern.index === targetPattern)?.commands.some(command => command.gridEffect
              && command.row === note.row && command.channelId === channelId && command.command.startsWith(`${info.format}:effect-`)
              && isTrackerNotePanEffect(info.format as MusicExportTarget, Number.parseInt(command.command.split('effect-')[1], 16), command.parameter));
            if (gridPan) {
              const encoded = encodeTrackerNotePan(info.format as MusicExportTarget, patch.pan);
              composition = setMusicCompositionPatternEffect(composition, targetPattern, note.row, note.channel,
                info.format as MusicExportTarget, encoded.effect, encoded.parameter, true);
            }
          }
          const sourceNote = composition.patterns.find(pattern => pattern.index === targetPattern)?.notes.find(item => {
            const channelId = composition.channels.find(channel => channel.index === note.channel)?.id;
            return item.row === note.row && item.channelId === channelId;
          });
          const targetInstrument = patch.instrument === undefined
            ? composition.instruments.find(item => item.id === sourceNote?.instrumentId)
            : composition.instruments.find(item => item.index === patch.instrument! - 1);
          const pitch = Math.max(1, Math.min(96, note.note + (patch.transpose ?? 0)));
          const sampleId = targetInstrument?.noteMap.find(zone => pitch - 1 >= zone.low && pitch - 1 <= zone.high)?.sampleId
            ?? targetInstrument?.sampleIds[0];
          const sampleVolume = sampleId ? composition.samples.find(item => item.id === sampleId)?.volume ?? 1 : 1;
          composition = setMusicCompositionNoteProperties(composition, targetPattern, note.row, note.channel, {
            instrumentIndex: patch.instrument,
            volume: patch.volume === undefined ? undefined : sampleVolume > 0 ? Math.min(1, (patch.volume / 100) / sampleVolume) : 0,
            pan: patch.pan,
          });
        }
        if (patch.transpose) composition = { ...composition, patterns: composition.patterns.map(pattern => pattern.index !== targetPattern ? pattern : {
          ...pattern, notes: pattern.notes.map(note => notes.some(target => target.row === note.row && composition.channels.find(channel => channel.index === target.channel)?.id === note.channelId)
            ? { ...note, pitch: note.pitch + patch.transpose! } : note),
        }) };
        return commitCanonicalRollEdits([], targetPattern, false, undefined, composition);
      }
      // A raw module has one effect column; preserve unrelated effects atomically.
      if (notes.some(note => {
        const event = patternRowsByIndex[targetPattern]?.[note.row]?.[note.channel];
        if (!event || (!event.effect && !event.parameter)) return false;
        const panEffect = encodeTrackerNotePan(info.format, 0);
        const isPan = event.effect === panEffect.effect && (info.format === 'MOD' || info.format === 'S3M' ? (event.parameter >> 4) === 8 : true);
        return patch.pan !== undefined && !isPan || patch.volume !== undefined && info.format === 'MOD' && event.effect !== 12;
      })) return false;
      const updates = notes.map(note => {
        const sampleVolume = Math.max(0, Math.min(64, unifiedSamples.get(patch.instrument ?? note.instrument)?.volume ?? 64)) / 64;
        const relativeVolume = patch.volume === undefined ? undefined : sampleVolume > 0 ? Math.min(1, (patch.volume / 100) / sampleVolume) : 0;
        return { row: note.row, channel: note.channel, patch: {
        ...(patch.transpose ? { note: info.format === 'MOD' ? trackerPitchToPeriod(note.note + patch.transpose) : trackerPitchToStoredNote(info.format as TrackerRollFormat, note.note + patch.transpose) } : {}),
        ...(patch.instrument === undefined ? {} : { instrument: patch.instrument }),
        ...(relativeVolume === undefined ? {} : info.format === 'MOD' ? { effect: 12, parameter: Math.round(relativeVolume * 64) } : { volume: Math.round(relativeVolume * 64) + (info.format === 'XM' ? 16 : 0) }),
        ...(patch.pan === undefined ? {} : encodeTrackerNotePan(info.format, patch.pan)),
        ...(patch.effect === undefined ? {} : { effect: patch.effect, parameter: patch.parameter ?? 0 }),
      } };
      });
      return info.format === 'XM' ? !!commitXmEventUpdates(targetPattern, updates) : applyGridUpdates(updates, targetPattern);
    }}
    onEditNotes={edits => info.format === 'XM' ? editXmNotes(edits) : applyPatternRollEdits(edits)}
    onDelete={(row, channel) => info.format === 'XM' ? deleteXmNote(row, channel) : deletePatternRollNotes([{ row, channel }])}
    onDeleteNotes={(notes, noteEffects) => noteEffects ? deleteKeyboardScoreNotes(notes) : info.format === 'XM' ? deleteXmNotes(notes, notes[0]?.patternIndex ?? selectedPattern) : deletePatternRollNotes(notes, notes[0]?.patternIndex ?? selectedPattern)}
    onEraseNoteRanges={erasePatternRollNoteRanges}
    onInstrumentChange={(row, channel, instrument) => {
      if (info.format === 'XM') changeXmNoteInstrument(row, channel, instrument);
      else if (applyGridUpdates([{ row, channel, patch: { instrument } }])) updateCanonicalNoteProperties(row, channel, { instrumentIndex: instrument });
    }}
    onNoteVolumeChange={changeXmNoteVolume}
    onNotePanChange={(row, channel, pan) => {
      if (projectPackage && moduleBytes && musicComposition.current) {
        const currentBytes = mod?.bytes ?? new Uint8Array(moduleBytes);
        const currentBuffer = currentBytes.buffer.slice(currentBytes.byteOffset, currentBytes.byteOffset + currentBytes.byteLength) as ArrayBuffer;
        const existingComposition = musicComposition.current;
        const channelId = existingComposition.channels.find(item => item.index === channel)?.id;
        const hasCanonicalNote = existingComposition.patterns.some(pattern => pattern.index === selectedPattern
          && pattern.notes.some(note => note.row === row && note.channelId === channelId));
        if (!hasCanonicalNote) {
          musicComposition.current = importTrackerModuleComposition(
            currentBuffer, musicSource?.assetFileName ?? filename ?? 'untitled-module', originalModuleBytes.current ?? currentBuffer,
            existingComposition, { muted: [], volumes: channelVolumes, pans: channelPans },
          );
        }
        musicComposition.current = setMusicCompositionNoteProperties(musicComposition.current, selectedPattern, row, channel, { pan });
      }
      const patch = encodeTrackerNotePan(info.format, pan);
      if (info.format === 'XM') commitXmEventUpdates(selectedPattern, [{ row, channel, patch }]);
      else applyGridUpdates([{ row, channel, patch }]);
    }}
    onSampleChange={editUnifiedSample}
    onEditSamplePcm={editSamplePcm}
    onAddInstrument={projectPackage || musicSource?.origin === 'scratch' ? () => {
      if (projectPackage && musicSource?.origin !== 'scratch') addCanonicalInstrumentPreset();
      else {
        const result = commitXmCommand({ type: 'append-instrument', preset: 'sine-lead' });
        if (result) refreshCanonicalCompositionFromModule(result, 'sine-lead');
      }
    } : undefined}
    onActiveInstrumentChange={setActiveInstrument}
    onSelectionChange={setWorkspaceNoteSelection}
    onImportSample={projectPackage
      ? (file, instrument, zone, options) => void importCanonicalAudioSample(file, instrument, zone, options)
      : info.format === 'MOD'
        ? (file, instrument, zone, options) => void importModAudioSample(file, instrument, zone, options)
        : info.format === 'S3M'
          ? (file, instrument, zone, options) => void importS3mAudioSample(file, instrument, zone, options)
          : info.format === 'IT'
            ? (file, instrument, zone, options) => void importItAudioSample(file, instrument, zone, options)
            : info.format === 'XM' ? (file, instrument, zone, options) => void importScratchWavSample(file, instrument, zone, options)
              : musicSource?.origin === 'scratch' ? (file, instrument, zone, options) => void importScratchWavSample(file, instrument, zone, options) : undefined}
    onEstimateSampleModuleSize={(instrument, frames) => {
      if (info.format === 'unknown') return null;
      const currentSample = unifiedSamples.get(instrument);
      const replacedSampleBytes = info.format === 'MOD'
        ? currentSample?.samples.length ?? 0
        : info.format === 'XM'
          ? currentSample?.variants?.[0]?.encodedPcm?.length ?? currentSample?.encodedPcm?.length ?? 0
          : 0;
      return estimateTrackerSampleModuleSize(info.format, moduleBytes.byteLength, replacedSampleBytes, frames, info.format === 'IT' && info.instruments > 0);
    }}
    canAddSampleVariant={projectPackage
      ? (musicComposition.current?.instruments.find(item => item.index === activeInstrument - 1)?.sampleIds.length ?? 0)
        < ({ MOD: 31, XM: 16, S3M: 99, IT: 255 } as const)[info.format as MusicExportTarget]
      : musicSource?.origin === 'scratch'}
    muted={mutedChannels} volumes={channelVolumes} pans={channelPans} onToggleChannel={toggleChannel} onVolumeChange={updateChannelVolume} onPanChange={updateChannelPan}
    onSave={() => void saveEditedTrackerProject()}
    onTargetChange={projectPackage && isMusicCompositionDocument(musicComposition.current) ? switchMusicTarget : undefined}
    targetSwitching={switchingMusicTarget}
    diagnosticWarnings={previewDiagnostics?.warnings}
    onPlay={(mode, startRow, onRow) => {
      const rowCountForPattern = (patternIndex: number) => info.format === 'XM' && moduleBytes
        ? parseXmPatternRows(moduleBytes, patternIndex, 256).length
        : info.format === 'S3M' && moduleBytes
          ? parseS3mPatternRows(moduleBytes, patternIndex, 64).length
          : info.format === 'IT' && moduleBytes
            ? parseItPatternRows(moduleBytes, patternIndex, 256).length
            : mod?.patterns[patternIndex]?.length ?? 64;
      if (mode === 'pattern' && info.format === 'XM') {
        void toggleXmPatternPreview(Math.max(0, startRow), row => onRow(row));
        return;
      }
      const songStartRow = Math.max(0, startRow);
      void toggleTrackerPreview(songStartRow, (row, position) => {
        if (mode === 'pattern') { onRow(row); return; }
        if (position) {
          const orderStartRow = unifiedOrderTable.slice(0, position.order).reduce((sum, patternIndex) => sum + rowCountForPattern(patternIndex), 0);
          onRow(orderStartRow + position.row);
          setSelectedOrder(position.order);
          setSelectedPattern(position.pattern);
          return;
        }
        let offset = 0;
        for (let orderIndex = 0; orderIndex < unifiedOrderTable.length; orderIndex += 1) {
          const patternIndex = unifiedOrderTable[orderIndex];
          const length = rowCountForPattern(patternIndex);
          if (row < offset + length) {
            // The song preview callback already reports an absolute row in the
            // complete arrangement. Keep the roll playhead on that timeline;
            // converting it back to a pattern-local row makes it jump to the
            // beginning whenever playback enters the next order item.
            onRow(row);
            setSelectedOrder(orderIndex);
            if (patternIndex < info.patterns) setSelectedPattern(patternIndex);
            return;
          }
          offset += length;
        }
      }, mode === 'pattern' ? (info.format === 'S3M' ? s3mPatternRows : unifiedRows) : undefined);
    }} onPreviewLoopChange={enabled => { trackerPreviewLoop.current = enabled; }} playing={trackerPlaying}
    onPlayRom={playMaxmodRomPreview}
  />;

  return <Empty description={t("music.warning.inspectionFailed")} />;
};

export default TrackerModuleViewer;
