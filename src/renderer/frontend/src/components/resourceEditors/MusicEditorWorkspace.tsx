import type { TrackerChannelSettings } from '@/utils/trackerChannelSettings';
import { App } from 'antd';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18n';
import { MusicEditorFormatCapabilities } from './musicEditorCapabilities';
import { MusicCompositionEnvelope } from '@/utils/trackerComposition';

export interface MusicWorkspaceAsset {
  id: string;
  name: string;
  url: string;
  extension: string;
  projectSource?: boolean;
  musicRole?: 'original' | 'project';
}

export interface MusicWorkspaceInfo {
  title: string;
  artist: string;
  format: string;
  capabilities: MusicEditorFormatCapabilities;
  channels: number;
  patterns: number;
  instruments: number;
  tempo: number;
  speed: number;
  speedEditable: boolean;
  selectedChannel: number;
  selectedPattern: number;
  patternName: string;
  patternRows: number;
  patternMinimumRows: number;
  patternEvents: number;
  patternNameEditable: boolean;
  patternLengthEditable: boolean;
  patternOrderEditable: boolean;
  selectedInstrument: number;
  instrumentConfig?: { color: string };
  instrumentConfigs?: Record<string, Record<string, { color: string }>>;
  channelInstrumentTypes?: Record<string, 'Duty' | 'Wave' | 'Noise'>;
  instrumentCategories?: Record<string, 'Duty' | 'Wave' | 'Noise'>;
  instrumentPresetColors?: Record<string, string>;
  instrumentNames?: Record<string, string>;
  instrumentEnvelopes?: { volume: MusicCompositionEnvelope; panning: MusicCompositionEnvelope; fadeout: number };
  instrumentZones?: { zones: Array<{ low: number; high: number; sampleId: string }>; samples: Array<{ id: string; name: string }> };
  scratch: boolean;
  canonicalProject: boolean;
  channelSettings?: TrackerChannelSettings;
  channelMuteStates?: boolean[];
  channelMuted: boolean;
  channelVolume: number;
  channelPan: number;
  instrumentSample?: { name?: string; volume?: number; loopStart: number; loopEnd: number; rootNote: number; fineTune: number; panning: number; length: number; zones: string[]; waveform?: number[]; pcmEditable?: boolean };
  instrumentSampleEditable?: boolean;
  instrumentSampleTuningEditable?: boolean;
  instrumentSampleFineTuneEditable?: boolean;
}

export interface MusicNoteSelection {
  row: number;
  note: number;
  length: number;
  instrument: number;
  volume: number;
  pan: number;
  effect?: number;
  parameter?: number;
  count: number;
  minNote?: number;
  maxNote?: number;
  volumeEditable?: boolean;
  panEditable?: boolean;
}

interface MusicEditorWorkspaceValue {
  assets: MusicWorkspaceAsset[];
  setAssets: (assets: MusicWorkspaceAsset[]) => void;
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;
  editorInfo: MusicWorkspaceInfo | null;
  setEditorInfo: (info: MusicWorkspaceInfo | null) => void;
  noteSelection: MusicNoteSelection | null;
  setNoteSelection: (selection: MusicNoteSelection | null) => void;
  selectEditorItem: (kind: 'channel' | 'pattern' | 'instrument', index: number) => void;
  selectedEditorItem: { kind: 'channel' | 'pattern' | 'instrument'; index: number } | null;
  clearSelectedEditorItem: () => void;
  selectedAssetExplicit: boolean;
  dirtyAssetIds: string[];
  setAssetDirty: (id: string, dirty: boolean) => void;
  registerAssetSaveHandler: (id: string, handler: (() => Promise<boolean>) | null) => void;
  selectAsset: (id: string) => void;
  deselectAsset: () => void;
  clearExplicitAssetSelection: () => void;
}

const MusicEditorWorkspaceContext = createContext<MusicEditorWorkspaceValue | null>(null);

export function MusicEditorWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { modal } = App.useApp();
  const { t } = useI18n();
  const [assets, setAssets] = useState<MusicWorkspaceAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [editorInfo, setEditorInfo] = useState<MusicWorkspaceInfo | null>(null);
  const [noteSelection, setNoteSelectionState] = useState<MusicNoteSelection | null>(null);
  const [selectedEditorItem, setSelectedEditorItem] = useState<MusicEditorWorkspaceValue['selectedEditorItem']>(null);
  const [selectedAssetExplicit, setSelectedAssetExplicit] = useState(false);
  const [dirtyAssetIds, setDirtyAssetIds] = useState<string[]>([]);
  const saveHandlers = useRef(new Map<string, () => Promise<boolean>>());
  const setAssetDirty = useCallback((id: string, dirty: boolean) => {
    setDirtyAssetIds(current => dirty
      ? current.includes(id) ? current : [...current, id]
      : current.filter(item => item !== id));
  }, []);
  const registerAssetSaveHandler = useCallback((id: string, handler: (() => Promise<boolean>) | null) => {
    if (handler) saveHandlers.current.set(id, handler);
    else saveHandlers.current.delete(id);
  }, []);
  const commitAssetSelection = useCallback((id: string | null) => {
    setSelectedEditorItem(null);
    setNoteSelectionState(null);
    setSelectedAssetId(id);
    setSelectedAssetExplicit(true);
  }, []);
  const setNoteSelection = useCallback((selection: MusicNoteSelection | null) => {
    setNoteSelectionState(selection);
    if (selection) { setSelectedEditorItem(null); setSelectedAssetExplicit(false); }
  }, []);
  const selectAsset = useCallback((id: string | null) => {
    if (id === selectedAssetId) { commitAssetSelection(id); return; }
    if (!selectedAssetId || !dirtyAssetIds.includes(selectedAssetId)) { commitAssetSelection(id); return; }
    const previousId = selectedAssetId;
    const previousName = assets.find(asset => asset.id === previousId)?.name ?? previousId;
    modal.confirm({
      title: t('music.unsaved.title'),
      content: t('music.unsaved.prompt', { name: previousName }),
      okText: t('music.unsaved.save'),
      cancelText: t('music.unsaved.discard'),
      closable: false,
      maskClosable: false,
      keyboard: false,
      onOk: async () => {
        const save = saveHandlers.current.get(previousId);
        if (!save) return;
        if (await save()) { setAssetDirty(previousId, false); commitAssetSelection(id); }
      },
      onCancel: () => {
        setAssetDirty(previousId, false);
        commitAssetSelection(id);
      },
    });
  }, [assets, commitAssetSelection, dirtyAssetIds, modal, selectedAssetId, setAssetDirty, t]);
  const selectEditorItem = useCallback((kind: 'channel' | 'pattern' | 'instrument', index: number) => {
    setSelectedEditorItem({ kind, index });
    setNoteSelectionState(null);
    setSelectedAssetExplicit(false);
    window.dispatchEvent(new CustomEvent('gba-studio:music-select-item', { detail: { kind, index } }));
  }, []);
  const value = useMemo(() => ({
    assets, setAssets, selectedAssetId, setSelectedAssetId, editorInfo, setEditorInfo, noteSelection, selectedEditorItem,
    clearSelectedEditorItem: () => setSelectedEditorItem(null),
    selectedAssetExplicit,
    dirtyAssetIds, setAssetDirty, registerAssetSaveHandler,
    setNoteSelection,
    selectAsset,
    clearExplicitAssetSelection: () => setSelectedAssetExplicit(false),
    deselectAsset: () => selectAsset(null),
    selectEditorItem,
  }), [assets, dirtyAssetIds, editorInfo, noteSelection, registerAssetSaveHandler, selectedAssetId, selectedEditorItem, selectedAssetExplicit, setAssetDirty, setNoteSelection, selectAsset, selectEditorItem]);
  return <MusicEditorWorkspaceContext.Provider value={value}>{children}</MusicEditorWorkspaceContext.Provider>;
}

export function useMusicEditorWorkspace() {
  const value = useContext(MusicEditorWorkspaceContext);
  if (!value) throw new Error('Music editor workspace is not available.');
  return value;
}

export function useOptionalMusicEditorWorkspace() {
  return useContext(MusicEditorWorkspaceContext);
}
