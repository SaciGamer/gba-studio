import NameInput from '../NameHover';
import { isModalOpen } from '@/utils/isModalOpen';
import { defaultSfxParameters, generateSfx, encodePcm16Wav } from '@/utils/sfxGenerator';
import { AudioOutlined, FolderOpenOutlined, PlayCircleOutlined, PlusOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import { App, Button, Card, ColorPicker, Divider, Dropdown, Empty, Flex, Image, Input, List, Space, Spin, Tag, theme, Tooltip, Typography } from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from '@/i18n/I18n';
import ResourceEditorShell from './ResourceEditorShell';
import useAppContexts from '@/providers/contexts/AppContexts';
import { defaultPalettes, getDefaultPalette, loadPaletteLibrary, PaletteDefinition, sortPalettesByCreation } from './paletteLibrary';
import { getNextZoomStep } from '@/utils/zoom';
import ResourceDropSurface from './ResourceDropSurface';
import TrackerModuleViewer from './TrackerModuleViewer';
import { createMusicEditorSourceDocument, isTrackerExtension } from '@/utils/trackerModule';
import { EditableTrackerFormat } from '@/utils/trackerModuleTemplate';
import { createTrackerProjectPackage } from '@/utils/trackerProjectPackage';
import { importTrackerModuleComposition } from '@/utils/trackerCompositionImport';
import { createMusicCompositionWithStarterBank } from '@/utils/trackerComposition';
import { exportMusicComposition } from '@/utils/trackerCompositionExport';
import { useOptionalMusicEditorWorkspace } from './MusicEditorWorkspace';
import SfxGenerator from './SfxGenerator';
import { TrackerPreviewPlayer } from '@/utils/trackerPreviewPlayer';
import { parseItSamples, parseS3mSamples, parseTrackerModule, parseTrackerPlaybackRows, parseXmSamples, TrackerPatternEvent, TrackerSample } from '@/utils/trackerModule';
import { parseModModule } from '@/utils/modPlayer';
import { trackerPeriodToPitch } from '@/utils/trackerPianoRollModel';

export type AssetEditorKind = 'images' | 'music' | 'sounds' | 'palettes';

const configs: Record<Exclude<AssetEditorKind, 'palettes'>, { titleKey: string; descriptionKey: string; folder: string; media: 'image' | 'audio' }> = {
  images: { titleKey: 'editor.images', descriptionKey: 'resources.images.description', folder: 'backgrounds', media: 'image' },
  music: { titleKey: 'editor.music', descriptionKey: 'resources.music.description', folder: 'musics', media: 'audio' },
  sounds: { titleKey: 'editor.sounds', descriptionKey: 'resources.sounds.description', folder: 'sounds', media: 'audio' },
};

interface AssetItem { id: string; name: string; url: string; extension: string; group?: 'Backgrounds' | 'Backgrounds HD' | 'Autotiles' | 'Avatars' | 'Tiles' | 'Emotes'; projectSource?: boolean; musicRole?: 'original' | 'project' }

const realAssetPath = (url: string) => url.replace(/^local:\/\/+/, '');
const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  return btoa(binary);
};

const emptyPalette = (): PaletteDefinition => ({
  id: uuidv4(),
  name: 'New Palette',
  createdAt: Date.now(),
  custom: true,
  colors: ['#000000', ...Array.from({ length: 15 }, (_, index) => `#${((index + 1) * 0x111111).toString(16).padStart(6, '0')}`)],
});

function PaletteGrid({ colors, editable, onChange }: { colors: string[]; editable?: boolean; onChange?: (index: number, color: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(42px, 1fr))', gap: 8, width: '100%', maxWidth: 560 }}>
      {colors.map((color, index) => (
        <div key={index} title={index === 0 ? 'Transparent color (index 0)' : `Color ${index}`}>
          {editable ? (
            <ColorPicker
              value={color}
              disabledAlpha
              rootClassName="gba-palette-color-picker"
              onChange={value => onChange?.(index, value.toHexString())}
            >
              <button
                type="button"
                aria-label={index === 0 ? 'Choose transparent palette color' : `Choose palette color ${index}`}
                style={{
                  display: 'block',
                  width: '100%',
                  height: 48,
                  padding: 0,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  borderRadius: 4,
                  border: '1px solid rgba(127,127,127,.45)',
                  backgroundImage: index === 0 ? 'linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)' : undefined,
                  backgroundSize: index === 0 ? '12px 12px' : undefined,
                  backgroundPosition: index === 0 ? '0 0, 0 6px, 6px -6px, -6px 0' : undefined,
                }}
              >
                <span style={{ display: 'block', width: '100%', height: '100%', background: color }} />
              </button>
            </ColorPicker>
          ) : (
            <div style={{ height: 48, borderRadius: 6, border: '1px solid rgba(127,127,127,.45)', background: color }} />
          )}
          <Typography.Text type="secondary" style={{ display: 'block', textAlign: 'center', fontSize: 11 }}>
            {index === 0 ? 'T' : index}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

function PaletteEditor() {
  const { token } = theme.useToken();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const { palettes: paletteResource, setPalettes: setPaletteResource } = useAppContexts();
  const [palettes, setPalettes] = useState<PaletteDefinition[]>(() => sortPalettesByCreation(paletteResource.palettes.length ? paletteResource.palettes : loadPaletteLibrary()));
  const [selectedId, setSelectedId] = useState<string | null>(defaultPalettes[0].id);
  const [draft, setDraft] = useState<PaletteDefinition>(() => sortPalettesByCreation(paletteResource.palettes.length ? paletteResource.palettes : loadPaletteLibrary())[0] ?? defaultPalettes[0]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isPaletteNameEditing, setIsPaletteNameEditing] = useState(false);
  const palettesRef = useRef(palettes);
  const draftRef = useRef(draft);

  useEffect(() => {
    const loaded = sortPalettesByCreation(paletteResource.palettes.length ? paletteResource.palettes : loadPaletteLibrary());
    palettesRef.current = loaded;
    setPalettes(loaded);
    const selected = loaded.find(palette => palette.id === selectedId) ?? loaded[0];
    if (selected) {
      const nextDraft = { ...selected, colors: [...selected.colors] };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
    }
  }, []);

  const commitPalettes = (next: PaletteDefinition[]) => {
    palettesRef.current = next;
    setPalettes(next);
    setPaletteResource(previous => ({ ...previous, palettes: next, _saved: false }));
  };

  const selectPalette = (id: string) => {
    const palette = palettesRef.current.find(item => item.id === id);
    if (palette) {
      setSelectedId(id);
      setIsPaletteNameEditing(false);
      const nextDraft = { ...palette, colors: [...palette.colors] };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
    }
  };
  const createPalette = () => {
    const palette = emptyPalette();
    commitPalettes([...palettesRef.current, palette]);
    setSelectedId(palette.id);
    setIsPaletteNameEditing(false);
    draftRef.current = palette;
    setDraft(palette);
  };
  const updateDraft = (changes: Partial<PaletteDefinition> | ((current: PaletteDefinition) => Partial<PaletteDefinition>)) => {
    const current = draftRef.current;
    const patch = typeof changes === 'function' ? changes(current) : changes;
    const updated = { ...current, ...patch };
    draftRef.current = updated;
    setDraft(updated);
    commitPalettes(palettesRef.current.map(item => item.id === updated.id ? updated : item));
  };
  const deletePalette = (id: string) => {
    const palette = palettesRef.current.find(item => item.id === id);
    if (!palette?.custom) return;
    const next = palettesRef.current.filter(item => item.id !== id);
    commitPalettes(next);
    if (draftRef.current.id !== id) return;
    const first = next[0] ?? defaultPalettes[0];
    setSelectedId(first.id);
    setIsPaletteNameEditing(false);
    const nextDraft = { ...first, colors: [...first.colors] };
    draftRef.current = nextDraft;
    setDraft(nextDraft);
  };
  useEffect(() => {
    const requestDelete = () => {
      if (isModalOpen() || !selectedId) return;
      const palette = palettesRef.current.find(item => item.id === selectedId);
      if (!palette) return;
      if (!palette.custom) {
        message.info({ key: 'palette-delete-protected', content: t('resources.paletteDeleteProtected') });
        return;
      }
      modal.confirm({
        title: t('resources.paletteDeleteTitle', { name: palette.name }),
        content: t('resources.paletteDeleteConfirm', { name: palette.name }),
        okText: t('common.delete'), cancelText: t('common.cancel'), okButtonProps: { danger: true },
        onOk: () => deletePalette(palette.id),
      });
    };
    window.addEventListener('gba-studio:palette-delete-request', requestDelete);
    return () => window.removeEventListener('gba-studio:palette-delete-request', requestDelete);
  }, [selectedId, modal, message, t]);
  const resetPalette = () => {
    const original = getDefaultPalette(draftRef.current.id);
    if (!original) return;
    const next = palettesRef.current.map(item => item.id === original.id ? original : item);
    commitPalettes(next);
    draftRef.current = original;
    setDraft(original);
    setIsPaletteNameEditing(false);
    message.success('Palette restored to default');
  };
  const visiblePalettes = palettes.filter(palette => palette.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((left, right) => Number(Boolean(left.custom)) - Number(Boolean(right.custom)));
  const defaultPaletteName = draft.custom ? 'New Palette' : (getDefaultPalette(draft.id)?.name ?? 'Palette');

  const commitPaletteName = (value: string) => {
    updateDraft({ name: value.trim() || defaultPaletteName });
    setIsPaletteNameEditing(false);
  };
  const deselectPaletteOnBlank = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('.ant-list-item, input, button, [role="button"], .ant-input-affix-wrapper')) return;
    setSelectedId(null);
    setIsPaletteNameEditing(false);
  };

  return (
    <ResourceEditorShell
      assetKind="palettes"
      title="Palettes"
      onLibraryBackgroundClick={deselectPaletteOnBlank}
      searchOpen={searchOpen}
      onToggleSearch={() => { setSearchOpen(previous => !previous); if (searchOpen) setSearch(''); }}
      libraryActions={<><Tooltip title="Create 16-color palette"><Button aria-label="Create 16-color palette" icon={<PlusOutlined />} size="small" type="text" onClick={createPalette} /></Tooltip><Tooltip title="Reset selected palette to default"><Button aria-label="Reset selected palette to default" disabled={draft.custom} icon={<UndoOutlined />} size="small" type="text" onClick={resetPalette} /></Tooltip></>}
      library={<>{searchOpen && <Input allowClear value={search} placeholder="Search..." onChange={event => setSearch(event.target.value)} style={{ marginBottom: 8, background: token.colorBgBase }} />}<List size="small" split={false} dataSource={visiblePalettes} renderItem={(palette, index) => <React.Fragment key={palette.id}>
        {(index === 0 || Boolean(palette.custom) !== Boolean(visiblePalettes[index - 1].custom)) && <Divider orientation="left" plain style={{ margin: '8px 0' }}>{t(palette.custom ? 'resources.paletteGroupCustom' : 'resources.paletteGroupDefault')}</Divider>}
        <List.Item onClick={() => selectPalette(palette.id)} style={{ cursor: 'pointer', borderRadius: token.borderRadius, paddingInline: 8, background: palette.id === selectedId ? token.colorPrimaryBg : undefined }}><Flex align="center" justify="space-between" style={{ width: '100%', minWidth: 0 }}><Flex align="center" gap={8} style={{ minWidth: 0 }}><span aria-label={`${palette.name} palette preview`} style={{ width: 30, height: 30, flex: '0 0 30px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', overflow: 'hidden', border: '1px solid #888', borderRadius: 2 }}>{palette.colors.slice(0, 16).map((color, index) => <i key={index} style={{ background: color }} />)}</span><Typography.Text ellipsis>{palette.name}</Typography.Text></Flex></Flex></List.Item></React.Fragment>} /></>}
      inspector={selectedId ? <Space direction="vertical" style={{ width: '100%' }}><NameInput aria-label={t('resources.paletteName')} value={draft.name} placeholder={defaultPaletteName} onChange={event => updateDraft({ name: event.target.value })} onFocus={() => setIsPaletteNameEditing(true)} onBlur={event => commitPaletteName(event.target.value)} onPressEnter={event => event.currentTarget.blur()} style={{ border: `1px solid ${isPaletteNameEditing ? token.colorPrimary : 'transparent'}`, background: isPaletteNameEditing ? token.colorBgContainer : 'transparent', boxShadow: 'none', marginBottom: 6, fontWeight: 600 }} /><Tag color="blue">Color 0 is transparent</Tag></Space> : undefined}
    >
      {selectedId ? <Flex vertical align="center" gap={20}>
        <Typography.Title level={4} style={{ margin: 0 }}>{draft.name?.trim() || defaultPaletteName}</Typography.Title>
        <Typography.Text type="secondary">The first color is reserved for transparency and cannot be moved.</Typography.Text>
        <PaletteGrid colors={draft.colors} editable onChange={(index, color) => updateDraft(current => ({ colors: current.colors.map((value, position) => position === index ? color : value) }))} />
      </Flex> : <Flex align="center" justify="center" style={{ width: '100%', height: '100%' }}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('resources.selectPalette')} /></Flex>}
    </ResourceEditorShell>
  );
}

function AssetLibraryAssetsEditor({ kind, musicWorkspaceMode = false }: { kind: Exclude<AssetEditorKind, 'palettes'>; musicWorkspaceMode?: boolean }) {
  const { token } = theme.useToken();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const { userSettings, setUserSettings, setSettingUtils, settingUtils } = useAppContexts();
  const musicWorkspace = useOptionalMusicEditorWorkspace();
  const config = configs[kind];
  const [items, setItems] = useState<AssetItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [trackerTargetSwitchRevision, setTrackerTargetSwitchRevision] = useState(0);
  const [sfxGeneratorOpen, setSfxGeneratorOpen] = useState(false);
  const [sfxEditorRevision, setSfxEditorRevision] = useState(0);
  const [sfxSourceDocument, setSfxSourceDocument] = useState<any>(null);
  const [sfxSourceFilename, setSfxSourceFilename] = useState<string | undefined>();
  const [sfxDirty, setSfxDirty] = useState(false);
  const sfxDirtyRef = useRef(false);
  const sfxSaveRef = useRef<(() => Promise<boolean>) | null>(null);
  const sfxTransitionPending = useRef(false);
  const onSfxDirtyChange = useCallback((dirty: boolean) => { sfxDirtyRef.current = dirty; setSfxDirty(dirty); }, []);
  const withSfxNavigation = async (action: () => void | Promise<void>) => {
    if (sfxTransitionPending.current) return;
    sfxTransitionPending.current = true;
    try {
      if (sfxDirtyRef.current) {
        const proceed = await new Promise<boolean>(resolve => {
          let saving = false;
          const dialog = modal.confirm({
            title: t('sfx.unsavedTitle'),
            content: t('sfx.unsavedPrompt', { name: sfxSourceFilename ?? 'SFX' }),
            okText: t('common.save'), cancelText: t('common.cancel'),
            onCancel: () => resolve(false),
            footer: (_, { CancelBtn }) => <Flex justify="end" gap={8}>
              <CancelBtn />
              <Button onClick={() => { if (saving) return; dialog.destroy(); resolve(true); }}>{t('music.unsaved.discard')}</Button>
              <Button type="primary" onClick={async () => {
                if (saving) return;
                saving = true;
                try {
                  if (await sfxSaveRef.current?.()) { dialog.destroy(); resolve(true); }
                } catch { message.error(t('sfx.saveFailed')); }
                finally { saving = false; }
              }}>{t('common.save')}</Button>
            </Flex>,
          });
        });
        if (!proceed) return;
      }
      await action();
    } finally { sfxTransitionPending.current = false; }
  };
  const deletingSound = useRef(false);
  const openingProjectSfx = useRef<string | null>(null);
  const [originalPreviewing, setOriginalPreviewing] = useState(false);
  const [originalPreviewLoading, setOriginalPreviewLoading] = useState(false);
  const originalPreviewPlayer = useRef(new TrackerPreviewPlayer());
  const originalPreviewTimer = useRef<number | null>(null);
  const originalPreviewGeneration = useRef(0);
  const assetSelectionExplicit = useRef(false);
  const deselectAssetOnBlank = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('.ant-list-item, input, button, [role="button"], .ant-input-affix-wrapper')) return;
    const deselect = () => {
      assetSelectionExplicit.current = true;
      setSelected(null);
      if (musicWorkspaceMode && kind === 'music') musicWorkspace?.deselectAsset();
      if (kind === 'music') void stopOriginalPreview();
    };
    if (kind === 'sounds') void withSfxNavigation(deselect);
    else deselect();
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const responses = kind === 'images'
        ? await Promise.all(['backgrounds', 'backgrounds-hd', 'auto-tiles', 'avatars', 'tilesets', 'emotes'].map(folder => window.electronAPI.fetchImages(folder)))
        : kind === 'music'
          ? [await window.electronAPI.fetchImages('musics')]
        : [await window.electronAPI.fetchImages(config.folder)];
      const nextItems = responses.flatMap((response: any, responseIndex) => response?.status === 'success' && Array.isArray(response.fileImages)
        ? response.fileImages.map((name: string) => ({
            id: `${responseIndex}:${name}`,
            name,
            url: `${response.localPath}/${name}`,
            extension: name.includes('.') ? name.split('.').pop()!.toUpperCase() : '',
            group: kind === 'images' ? (['Backgrounds', 'Backgrounds HD', 'Autotiles', 'Avatars', 'Tiles', 'Emotes'][responseIndex] as AssetItem['group']) : undefined,
            musicRole: kind === 'music' ? 'original' as const : undefined,
          })) : []);
      const sourceResponse = kind === 'sounds' ? await window.electronAPI.listProjectSfx() : kind === 'music' ? await window.electronAPI.listTrackerProjects() : null;
      const musicAssets = nextItems;
      const projectSources: AssetItem[] = sourceResponse?.status === 'success' && Array.isArray(sourceResponse.files)
        ? sourceResponse.files.map((name: string) => ({ id: `project:${name}`, name, url: kind === 'music' ? `tracker-project://${name}` : '', extension: kind === 'music' ? 'GBATRACKER' : 'GBASFX', projectSource: true, musicRole: kind === 'music' ? 'project' : undefined })) : [];
      const combinedItems = kind === 'music'
        ? [...musicAssets, ...projectSources]
        : kind === 'sounds'
          ? [...musicAssets, ...projectSources]
          : [...projectSources, ...musicAssets];
      setItems(combinedItems);
      setSelected(current => {
        // A library refresh after Save must not briefly mount the first beat.
        if (current && combinedItems.some((item: AssetItem) => item.id === current)) return current;
        if (assetSelectionExplicit.current) return null;
        return (kind === 'music' ? combinedItems.find((item: AssetItem) => item.musicRole === 'project') : projectSources[0])?.id ?? combinedItems[0]?.id ?? null;
      });
    } catch (error) {
      console.error(`Failed to load ${config.folder}:`, error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [config.folder]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!musicWorkspaceMode || kind !== 'music' || !musicWorkspace || loading) return;
    musicWorkspace.setAssets(items);
    const selectedExists = items.some(item => item.id === musicWorkspace.selectedAssetId);
    const nextSelected = musicWorkspace.selectedAssetExplicit
      ? musicWorkspace.selectedAssetId
      : selectedExists ? musicWorkspace.selectedAssetId : items[0]?.id ?? null;
    if (nextSelected !== musicWorkspace.selectedAssetId) musicWorkspace.setSelectedAssetId(nextSelected);
  }, [items, kind, loading, musicWorkspaceMode, musicWorkspace?.selectedAssetExplicit, musicWorkspace?.selectedAssetId]);

  useEffect(() => {
    if (!musicWorkspaceMode || kind !== 'music' || !musicWorkspace) return;
    if (musicWorkspace.selectedAssetId && items.some(item => item.id === musicWorkspace.selectedAssetId)) setSelected(musicWorkspace.selectedAssetId);
    else if (musicWorkspace.selectedAssetExplicit && !musicWorkspace.selectedAssetId) setSelected(null);
  }, [items, kind, musicWorkspaceMode, musicWorkspace?.selectedAssetExplicit, musicWorkspace?.selectedAssetId]);

  useEffect(() => {
    const reload = () => { void load(); };
    window.addEventListener('gba-studio:assets-reloaded', reload);
    return () => window.removeEventListener('gba-studio:assets-reloaded', reload);
  }, [load]);

  const importDropped = async (folder: string, files: string[]) => {
    const response = await window.electronAPI.importDroppedAssets(folder, files);
    if (response?.status === 'success' && response.files?.length > 0) {
      message.success(kind === 'music' ? t('music.assets.imported', { count: response.files.length }) : `${response.files.length} asset(s) imported`);
      window.dispatchEvent(new CustomEvent('gba-studio:assets-reloaded'));
      await load();
    } else if (response?.status === 'success') {
      message.error('No files were imported. Check that the dropped files are accessible and supported.');
    } else if (response?.status === 'error') {
      message.error(kind === 'music' ? t('music.assets.importFailed') : response.message);
    }
  };

  const createBeatQueue = useRef<Promise<void>>(Promise.resolve());
  const createNewBeat = useCallback((format: EditableTrackerFormat = 'XM') => {
    const create = async () => {
      if (!['MOD', 'XM', 'S3M', 'IT'].includes(format)) {
        message.error(t('music.create.unsupportedFormat', { format: String(format) }));
        return;
      }
      const existingProjects = await window.electronAPI.listTrackerProjects();
      if (existingProjects?.status !== 'success' || !Array.isArray(existingProjects.files)) {
        message.error(t('music.create.failed'));
        return;
      }
      const beatNumber = existingProjects.files.reduce((highest: number, name: string) => {
        const leaf = name.replace(/\\/g, '/').split('/').pop() ?? '';
        const match = /^new-beat-(\d+)\.gbatracker$/i.exec(leaf);
        const number = match ? Number(match[1]) : 0;
        return Number.isSafeInteger(number) ? Math.max(highest, number) : highest;
      }, 0) + 1;
      const sourceFilename = `new-beat-${beatNumber}.${format.toLowerCase()}`;
      const filename = `${sourceFilename.replace(/\.[^/.]+$/, '')}.gbatracker`;
      const composition = createMusicCompositionWithStarterBank(format);
      const bytes = new Uint8Array(exportMusicComposition(composition, format).moduleData);
      const sourceDocument = format === 'XM' ? { ...createMusicEditorSourceDocument(bytes.buffer, sourceFilename), origin: 'scratch' as const } : null;
      const packageBytes = createTrackerProjectPackage({
        id: uuidv4(),
        schema: 'gba-studio/music-project',
        version: 1,
        origin: 'scratch',
        sourceFilename,
        sourceDocument,
        composition,
        importedAudioSources: [],
      });
      let packageBinary = '';
      for (let offset = 0; offset < packageBytes.length; offset += 0x8000) packageBinary += String.fromCharCode(...packageBytes.subarray(offset, Math.min(packageBytes.length, offset + 0x8000)));
      const result = await window.electronAPI.saveTrackerProject(filename, btoa(packageBinary));
      if (result?.status !== 'success') {
        message.error(t('music.create.failed'));
        return;
      }
      const savedFilename = result.filename ?? filename;
      await load();
      assetSelectionExplicit.current = true;
      setSelected(`project:${savedFilename}`);
      if (musicWorkspaceMode && musicWorkspace) musicWorkspace.selectAsset(`project:${savedFilename}`);
      message.success(format === 'XM' ? t('music.create.createdXm') : t('music.create.createdModule', { format }));
    };
    const queued = createBeatQueue.current.then(create).catch(error => {
      console.error('Unable to create music composition:', error);
      message.error(t('music.create.failed'));
    });
    createBeatQueue.current = queued;
    return queued;
  }, [load, musicWorkspace, musicWorkspaceMode, t]);

  useEffect(() => {
    if (!musicWorkspaceMode || kind !== 'music') return;
    const handleMusicAction = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; format?: EditableTrackerFormat }>).detail;
      if (detail?.kind === 'create-beat' && (!detail.format || ['MOD', 'XM', 'S3M', 'IT'].includes(detail.format))) void createNewBeat(detail.format ?? 'XM');
    };
    window.addEventListener('gba-studio:music-editor-action', handleMusicAction);
    return () => window.removeEventListener('gba-studio:music-editor-action', handleMusicAction);
  }, [kind, musicWorkspaceMode, createNewBeat]);

  useEffect(() => {
    if (!musicWorkspaceMode || kind !== 'music' || !musicWorkspace) return;
    const handleDelete = () => {
      if (musicWorkspace.selectedEditorItem || !musicWorkspace.selectedAssetExplicit) return;
      const asset = musicWorkspace.assets.find(item => item.id === musicWorkspace.selectedAssetId);
      if (!asset) return;
      modal.confirm({
        title: t('music.delete.title', { item: asset.name }),
        content: t('music.delete.confirm', { item: asset.name }),
        okText: t('common.delete'), cancelText: t('common.cancel'), okButtonProps: { danger: true },
        onOk: async () => {
          const result = asset.musicRole === 'project'
            ? await window.electronAPI.deleteTrackerProject(asset.name)
            : await window.electronAPI.deleteProjectMusicAsset(asset.name);
          if (result?.status !== 'success') { message.error(t('music.delete.failed')); return; }
          musicWorkspace.clearSelectedEditorItem();
          musicWorkspace.clearExplicitAssetSelection();
          await load();
          window.dispatchEvent(new CustomEvent('gba-studio:assets-reloaded'));
          message.success(t('music.delete.done', { item: asset.name }));
        },
      });
    };
    window.addEventListener('gba-studio:music-delete-request', handleDelete);
    return () => window.removeEventListener('gba-studio:music-delete-request', handleDelete);
  }, [kind, load, message, modal, musicWorkspace, musicWorkspaceMode, t]);

  const handleFiles = (filePaths: string[], targetId?: string) => {
    const allowed = kind === 'images' ? /\.(png|jpg|jpeg|gif|bmp)$/i : kind === 'music' ? /\.(mp3|wav|mod|xm|s3m|it|mid|midi)$/i : /\.(wav|raw|mp3|ogg)$/i;
    const compatible = filePaths.filter(filePath => allowed.test(filePath));
    if (compatible.length === 0) {
      message.warning(kind === 'music' ? t('music.assets.noCompatibleFiles') : 'No compatible files were dropped.');
      return;
    }
    if (compatible.length !== filePaths.length) message.warning(kind === 'music' ? t('music.assets.someFilesIgnored') : 'Some incompatible files were ignored.');
    const imageFolders = new Set(['backgrounds', 'backgrounds-hd', 'auto-tiles', 'avatars', 'tilesets', 'emotes']);
    const destinationFolder = kind === 'images' && targetId && imageFolders.has(targetId) ? targetId : config.folder;
    void importDropped(destinationFolder, compatible);
  };

  const filtered = useMemo(() => items.filter(item => item.name.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const selectedItem = items.find(item => item.id === selected) ?? null;
  const selectedItemPath = selectedItem ? realAssetPath(selectedItem.url) : '';
  const openProjectSfx = async (item: AssetItem) => {
    if (openingProjectSfx.current === item.id) return;
    openingProjectSfx.current = item.id;
    const result = await window.electronAPI.loadProjectSfx(item.name);
    if (openingProjectSfx.current !== item.id) return;
    if (result?.status !== 'success') {
      openingProjectSfx.current = null;
      message.error(result?.message ?? t('sfx.openFailed'));
      return;
    }
    setSfxSourceDocument(result.document);
    setSfxSourceFilename(item.name);
    setSfxGeneratorOpen(true);
    openingProjectSfx.current = null;
  };
  useEffect(() => {
    if (kind === 'sounds' && selectedItem?.projectSource) void openProjectSfx(selectedItem);
    else {
      openingProjectSfx.current = null;
      if (kind === 'sounds') {
        onSfxDirtyChange(false);
        setSfxGeneratorOpen(false);
        setSfxSourceDocument(null);
        setSfxSourceFilename(undefined);
      }
    }
  }, [kind, selectedItem?.id, selectedItem?.projectSource]);
  const createNewSfx = () => withSfxNavigation(async () => {
    const generated = generateSfx(defaultSfxParameters);
    const wav = bytesToBase64(new Uint8Array(encodePcm16Wav(generated.pcm, generated.parameters.sampleRate)));
    for (let suffix = 0; ; suffix++) {
      const name = `new_effect${suffix ? `_${suffix}` : ''}`;
      const filename = `${name}.gbasfx`;
      const document = { schema: 'gba-studio/sfx', version: 1, name, parameters: generated.parameters };
      const result = await window.electronAPI.saveGeneratedSfx(filename, JSON.stringify(document), `${name}.wav`, wav, 'source', false);
      if (result?.status === 'conflict') continue;
      if (result?.status !== 'success') { message.error(result?.message ?? t('sfx.saveFailed')); return; }
      assetSelectionExplicit.current = true;
      await load();
      setSelected(`project:${filename}`);
      setSfxSourceDocument(document);
      setSfxSourceFilename(filename);
      onSfxDirtyChange(false);
      setSfxEditorRevision(revision => revision + 1);
      setSfxGeneratorOpen(true);
      return;
    }
  });
  const requestDeleteSound = (asset: AssetItem) => {
    if (kind !== 'sounds' || deletingSound.current || isModalOpen()) return;
    deletingSound.current = true;
    modal.confirm({
      title: t('sfx.deleteItem', { name: asset.name }),
      content: t(asset.id === selected && sfxDirtyRef.current ? 'sfx.deleteDirtyConfirm' : 'sfx.deleteConfirm', { name: asset.name }),
      okText: t('common.delete'), cancelText: t('common.cancel'), okButtonProps: { danger: true },
      afterClose: () => { deletingSound.current = false; },
      onOk: async () => {
        try {
          const result = await window.electronAPI.deleteProjectSound(asset.name, Boolean(asset.projectSource));
          if (result?.status !== 'success') { message.error(t('sfx.deleteFailed')); return; }
          if (asset.id === selected) {
            openingProjectSfx.current = null;
            assetSelectionExplicit.current = true;
            setSelected(null);
            setSfxGeneratorOpen(false);
            setSfxSourceDocument(null);
            setSfxSourceFilename(undefined);
            onSfxDirtyChange(false);
          }
          await load();
          window.dispatchEvent(new CustomEvent('gba-studio:assets-reloaded'));
          message.success(t('sfx.deleted', { name: asset.name }));
        } catch { message.error(t('sfx.deleteFailed')); }
      },
    });
  };
  useEffect(() => {
    if (kind !== 'sounds') return;
    const removeSelected = () => {
      if (selectedItem && assetSelectionExplicit.current) requestDeleteSound(selectedItem);
    };
    window.addEventListener('gba-studio:sound-delete-request', removeSelected);
    return () => window.removeEventListener('gba-studio:sound-delete-request', removeSelected);
  }, [kind, selectedItem, load, modal, message, t]);
  const previewOriginalMusic = async () => {
    if (!selectedItem || selectedItem.projectSource) return;
    if (!isTrackerExtension(selectedItem.extension)) return;
    setOriginalPreviewLoading(true);
    try {
      const bytes = new Uint8Array(await window.electronAPI.readImageBytes(selectedItem.url));
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const format = selectedItem.extension.toUpperCase() as 'MOD' | 'XM' | 'S3M' | 'IT';
      const info = parseTrackerModule(buffer, format);
      const mod = format === 'MOD' ? parseModModule(buffer) : null;
      if (!mod && format === 'MOD') throw new Error('The MOD module could not be parsed.');
      let rows: TrackerPatternEvent[][];
      let samples: Map<number, TrackerSample>;
      if (mod) {
        rows = mod.patternTable.slice(0, mod.orders).flatMap(patternIndex => (mod.patterns[patternIndex] ?? []).map(row => row.map(event => ({
          note: event.period ? trackerPeriodToPitch(event.period) : event.effect === 14 && (event.parameter >> 4) === 12 ? 97 : 0,
          period: event.period || undefined,
          instrument: event.sample,
          volume: 0,
          effect: event.effect,
          parameter: event.parameter,
        }))));
        samples = new Map<number, TrackerSample>(mod.samples.map((sample, index) => {
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
        }));
      } else {
        rows = parseTrackerPlaybackRows(buffer, info.format, 65536);
        samples = format === 'XM' ? parseXmSamples(buffer) : format === 'S3M' ? parseS3mSamples(buffer) : parseItSamples(buffer);
      }
      if (!rows.length) throw new Error('No playable rows were found in this module.');
      originalPreviewGeneration.current += 1;
      const generation = originalPreviewGeneration.current;
      const durationMs = await originalPreviewPlayer.current.play(
        rows, info.channels, info.speed, info.tempo, [], samples, format, [],
        format === 'MOD' || format === 'S3M' ? info.channelPans ?? [] : [], undefined, false,
        info.globalVolume, false, format === 'IT' && Boolean(bytes[0x2c] & 0x08), info.maxmodChannelVolumes,
      );
      if (generation !== originalPreviewGeneration.current) return;
      if (!durationMs) throw new Error('The audio preview could not be started.');
      setOriginalPreviewing(true);
      originalPreviewTimer.current = window.setTimeout(() => {
        originalPreviewTimer.current = null;
        if (generation !== originalPreviewGeneration.current) return;
        originalPreviewPlayer.current.stop();
        setOriginalPreviewing(false);
      }, durationMs);
    } catch {
      message.error(t('music.original.previewFailed'));
    } finally {
      setOriginalPreviewLoading(false);
    }
  };
  const stopOriginalPreview = async () => {
    originalPreviewGeneration.current += 1;
    if (originalPreviewTimer.current !== null) window.clearTimeout(originalPreviewTimer.current);
    originalPreviewTimer.current = null;
    originalPreviewPlayer.current.stop();
    setOriginalPreviewing(false);
  };
  useEffect(() => {
    setOriginalPreviewing(false);
    return () => {
      originalPreviewGeneration.current += 1;
      if (originalPreviewTimer.current !== null) window.clearTimeout(originalPreviewTimer.current);
      originalPreviewTimer.current = null;
      originalPreviewPlayer.current.stop();
    };
  }, [selectedItem?.id, settingUtils.projectPathFile]);
  const importOriginalMusicForEditing = async () => {
    if (!selectedItem || selectedItem.projectSource || !isTrackerExtension(selectedItem.extension)) return;
    try {
      if (originalPreviewing) await stopOriginalPreview();
      const format = selectedItem.extension.toUpperCase() as EditableTrackerFormat;
      const moduleBytes = new Uint8Array(await window.electronAPI.readImageBytes(selectedItem.url));
      const sourceDocument = format === 'XM'
        ? { ...createMusicEditorSourceDocument(moduleBytes.buffer.slice(moduleBytes.byteOffset, moduleBytes.byteOffset + moduleBytes.byteLength) as ArrayBuffer, selectedItem.name), origin: 'imported' as const }
        : null;
      const sourceName = selectedItem.name.replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]/gi, '_');
      const baseName = `${sourceName}.gbatracker`;
      const packageName = baseName;
      const packageBytes = createTrackerProjectPackage({
        id: uuidv4(),
        schema: 'gba-studio/music-project',
        version: 1,
        origin: 'imported',
        sourceFilename: selectedItem.name,
        sourceDocument,
        composition: importTrackerModuleComposition(moduleBytes.buffer.slice(moduleBytes.byteOffset, moduleBytes.byteOffset + moduleBytes.byteLength) as ArrayBuffer, selectedItem.name),
        importedAudioSources: [],
      });
      const result = await window.electronAPI.saveTrackerProject(packageName, bytesToBase64(packageBytes));
      if (result?.status !== 'success') {
        message.error(result?.message ?? t('music.original.importFailed'));
        return;
      }
      const savedFilename = result.filename ?? packageName;
      setOriginalPreviewing(false);
      await load();
      const projectId = `project:${savedFilename}`;
      assetSelectionExplicit.current = true;
      setSelected(projectId);
      if (musicWorkspaceMode && musicWorkspace) musicWorkspace.selectAsset(projectId);
      message.success(t('music.original.imported'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('music.original.importFailed'));
    }
  };
  const [assetNameDraft, setAssetNameDraft] = useState('');
  const [assetNameFocused, setAssetNameFocused] = useState(false);
  const [imagePan, setImagePan] = useState({ x: 0, y: 0 });
  const [imageFileSize, setImageFileSize] = useState<number | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const imagePanDrag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  useEffect(() => {
    setAssetNameDraft(selectedItem?.name.replace(/\.[^/.]+$/, '') ?? '');
    setImageDimensions(null);
    setImageFileSize(null);
  }, [selectedItem?.id, selectedItem?.name]);

  useEffect(() => {
    if (kind !== 'images' || !selectedItem) return;
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      if (!cancelled && image.naturalWidth > 0 && image.naturalHeight > 0) {
        setImageDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      }
    };
    image.src = selectedItem.url;
    return () => { cancelled = true; };
  }, [kind, selectedItem?.id, selectedItem?.url]);

  useEffect(() => {
    if (kind !== 'images' || !selectedItem) return;
    let cancelled = false;
    void window.electronAPI.readImageBytes(selectedItem.url).then((bytes: ArrayBuffer) => {
      if (!cancelled) setImageFileSize(bytes.byteLength);
    }).catch(() => { if (!cancelled) setImageFileSize(null); });
    return () => { cancelled = true; };
  }, [kind, selectedItem?.id, selectedItem?.name, selectedItem?.url]);

  const commitAssetName = async () => {
    if (!selectedItem || !assetNameDraft.trim()) return;
    const folder = selectedItem.group === 'Backgrounds HD' ? 'backgrounds-hd' : selectedItem.group === 'Autotiles' ? 'auto-tiles' : selectedItem.group === 'Avatars' ? 'avatars' : selectedItem.group === 'Tiles' ? 'tilesets' : selectedItem.group === 'Emotes' ? 'emotes' : config.folder;
    const nextName = `${assetNameDraft.trim()}${selectedItem.name.match(/\.[^/.]+$/)?.[0] ?? ''}`;
    if (nextName === selectedItem.name) return;
    const result = await window.electronAPI.renameAsset(folder, selectedItem.name, nextName);
    if (result?.status !== 'success') {
      message.error(result?.message ?? 'Could not rename image.');
      setAssetNameDraft(selectedItem.name.replace(/\.[^/.]+$/, ''));
      return;
    }
    await load();
    const groupIndex = selectedItem.group === 'Backgrounds HD' ? 1 : selectedItem.group === 'Autotiles' ? 2 : selectedItem.group === 'Avatars' ? 3 : selectedItem.group === 'Tiles' ? 4 : selectedItem.group === 'Emotes' ? 5 : 0;
    setSelected(`${groupIndex}:${nextName}`);
  };

  const inspector = selectedItem ? (
    <Space direction="vertical" style={{ width: '100%' }}>
      <NameInput aria-label="Image file name" value={assetNameDraft} onChange={event => setAssetNameDraft(event.target.value)} onFocus={() => setAssetNameFocused(true)} onBlur={() => { setAssetNameFocused(false); void commitAssetName(); }} onPressEnter={event => event.currentTarget.blur()} style={{ border: `1px solid ${assetNameFocused ? token.colorPrimary : 'transparent'}`, background: assetNameFocused ? token.colorBgContainer : 'transparent', boxShadow: 'none', paddingInline: 0, fontWeight: 600 }} />
      <Divider style={{ margin: '8px 0' }} />
      <Typography.Text type="secondary">Properties</Typography.Text>
      <Space direction="vertical" size={4} style={{ width: '100%' }}>
        <Flex justify="space-between" gap={8}><Typography.Text type="secondary">Format</Typography.Text><Typography.Text>{selectedItem.extension || 'Unknown'}</Typography.Text></Flex>
        <Flex justify="space-between" gap={8}><Typography.Text type="secondary">Dimensions</Typography.Text><Typography.Text>{imageDimensions ? `${imageDimensions.width} × ${imageDimensions.height} px` : '—'}</Typography.Text></Flex>
        <Flex justify="space-between" gap={8}><Typography.Text type="secondary">File size</Typography.Text><Typography.Text>{imageFileSize === null ? '—' : imageFileSize < 1024 ? `${imageFileSize} B` : imageFileSize < 1024 * 1024 ? `${(imageFileSize / 1024).toFixed(1)} KB` : `${(imageFileSize / (1024 * 1024)).toFixed(2)} MB`}</Typography.Text></Flex>
        {selectedItem.group && <Flex justify="space-between" gap={8}><Typography.Text type="secondary">Folder</Typography.Text><Typography.Text>{selectedItem.group}</Typography.Text></Flex>}
        <Typography.Text type="secondary">Path</Typography.Text>
        <Typography.Text type="secondary" copyable={{ text: selectedItemPath }} style={{ overflowWrap: 'anywhere' }}>{selectedItemPath}</Typography.Text>
      </Space>
      {selectedItem.projectSource ? <Tag color="purple">{t('sfx.projectSource')}</Tag> : <Button block icon={<FolderOpenOutlined />} onClick={() => window.electronAPI.send('open-project-folder', selectedItemPath.slice(0, Math.max(selectedItemPath.lastIndexOf('/'), selectedItemPath.lastIndexOf('\\'))))}>Open image folder</Button>}
    </Space>
  ) : null;
  const originalMusicView = selectedItem ? (
    <Flex align="center" justify="center" style={{ height: '100%', padding: 24, overflow: 'auto' }}>
      <Card
        title={<Typography.Text strong style={{ color: '#fff' }}>{selectedItem.name}</Typography.Text>}
        headStyle={{ minHeight: 40, paddingInline: 12, background: token.colorBorder, borderBottomColor: token.colorBorderSecondary }}
        bodyStyle={{ background: token.colorBgBase }}
        style={{ width: 'min(560px, 100%)', borderColor: token.colorBorderSecondary }}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Typography.Text type="secondary">{t('music.original.description')}</Typography.Text>
          {isTrackerExtension(selectedItem.extension) ? (
            <Flex gap={8} wrap>
              <Button icon={originalPreviewing ? <StopOutlined /> : <PlayCircleOutlined />} loading={originalPreviewLoading} onClick={() => originalPreviewing ? void stopOriginalPreview() : void previewOriginalMusic()}>
                {t(originalPreviewing ? 'music.original.stopPreview' : 'music.original.preview')}
              </Button>
              <Button type="primary" onClick={() => void importOriginalMusicForEditing()}>{t('music.original.importForEditing')}</Button>
            </Flex>
          ) : (
            <audio controls src={selectedItem.url} style={{ width: '100%' }} aria-label={t('music.original.preview')} />
          )}
          {!isTrackerExtension(selectedItem.extension) && <Typography.Text type="secondary">{t('music.original.importUnsupported')}</Typography.Text>}
        </Space>
      </Card>
    </Flex>
  ) : null;

  return (
    <ResourceEditorShell
      assetKind={kind}
      title={t(config.titleKey)}
      onLibraryBackgroundClick={deselectAssetOnBlank}
      searchOpen={searchOpen}
      onToggleSearch={musicWorkspaceMode ? undefined : () => { setSearchOpen(previous => !previous); if (searchOpen) setSearch(''); }}
      libraryActions={!musicWorkspaceMode && kind === 'music' ? <Dropdown menu={{ items: [
        { key: 'MOD', label: t('music.create.mod'), title: t('music.create.moduleHelp') },
        { key: 'XM', label: t('music.create.xm'), title: t('music.create.xmHelp') },
        { key: 'S3M', label: t('music.create.s3m'), title: t('music.create.moduleHelp') },
        { key: 'IT', label: t('music.create.it'), title: t('music.create.moduleHelp') },
      ], onClick: ({ key }) => { if (['MOD', 'XM', 'S3M', 'IT'].includes(key)) void createNewBeat(key as EditableTrackerFormat); } }}><Button size="small" type="primary" icon={<PlusOutlined />}>New music</Button></Dropdown> : !musicWorkspaceMode && kind === 'sounds' ? <Tooltip title={t('sfx.generate')} color={token.colorBorder}><Button size="small" type="text" aria-label={t('sfx.generate')} icon={<PlusOutlined />} style={{ padding: 4, borderRadius: token.borderRadius, color: '#fff' }} onClick={() => { void createNewSfx(); }} /></Tooltip> : undefined}
      hideLibrary={musicWorkspaceMode}
      hideHeader={musicWorkspaceMode}
      library={musicWorkspaceMode ? null : <>{searchOpen && <Input allowClear value={search} placeholder={t('common.search')} onChange={event => setSearch(event.target.value)} style={{ marginBottom: 8, background: token.colorBgBase }} />}{loading ? <Flex justify="center" style={{ padding: 24 }}><Spin /></Flex> : <List size="small" split={false} dataSource={filtered} locale={{ emptyText: t('common.noItems') }} renderItem={(item, index) => {
        const previous = filtered[index - 1];
        const musicGroupChanged = kind === 'music' && item.musicRole !== previous?.musicRole;
        return <React.Fragment key={item.id}>
          {kind === 'images' && (index === 0 || item.group !== previous?.group) && <Divider orientation="left" plain style={{ margin: '8px 0' }}>{item.group}</Divider>}
          {kind === 'sounds' && (index === 0 || item.projectSource !== previous?.projectSource) && <Divider orientation="left" plain style={{ margin: '8px 0' }}>{t(item.projectSource ? 'sfx.projectGroup' : 'sfx.assetsGroup')}</Divider>}
          {musicGroupChanged && <Divider orientation="left" plain style={{ margin: '8px 0' }}>{t(`music.library.${item.musicRole}`)}</Divider>}
          <List.Item draggable={kind === 'images'} onDragStart={event => { event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData('application/x-gba-studio-asset-path', realAssetPath(item.url)); }} onClick={() => {
        assetSelectionExplicit.current = true;
        if (item.id === selected) return;
        const select = () => { assetSelectionExplicit.current = true; setSelected(item.id); if (musicWorkspaceMode && musicWorkspace) musicWorkspace.selectAsset(item.id); };
        if (kind === 'sounds') void withSfxNavigation(select); else select();
      }} style={{ cursor: kind === 'images' ? 'grab' : 'pointer', borderRadius: token.borderRadius, padding: '4px 8px', background: item.id === selected ? token.colorPrimaryBg : undefined }}><Flex justify="space-between" align="center" style={{ width: '100%' }}><Typography.Text ellipsis>{item.name.replace(/\.[^/.]+$/, '')}{kind === 'sounds' && item.projectSource && item.name === sfxSourceFilename && sfxDirty ? ' *' : ''}</Typography.Text>{kind === 'music' && item.projectSource && <Tag color="purple">PROJECT</Tag>}</Flex></List.Item>
        </React.Fragment>;
      }} />}</>}
      inspector={musicWorkspaceMode || sfxGeneratorOpen || !selectedItem ? undefined : inspector}
    >
      <ResourceDropSurface
        musicWorkspace={musicWorkspaceMode && kind === 'music'}
        onFiles={handleFiles}
        hint={t('common.dropFiles')}
        dropTargets={kind === 'images' ? [
          { id: 'backgrounds', label: t('images.background') },
          { id: 'backgrounds-hd', label: t('images.backgroundHd') },
          { id: 'auto-tiles', label: t('images.autoTiles') },
          { id: 'avatars', label: t('images.avatars') },
          { id: 'tilesets', label: t('images.tiles') },
          { id: 'emotes', label: t('images.emotes') },
        ] : undefined}
      >
      {kind === 'sounds' && sfxGeneratorOpen ? <SfxGenerator key={sfxEditorRevision} sourceDocument={sfxSourceDocument} sourceFilename={sfxSourceFilename} saveRef={sfxSaveRef} onDirtyChange={onSfxDirtyChange} onSaved={(filename, document) => {
        if (filename && document) { setSfxSourceFilename(filename); setSfxSourceDocument(document); setSelected(`project:${filename}`); }
        void load();
      }} /> : (musicWorkspaceMode && kind === 'music' ? !selectedItem ? (
        <Flex align="center" justify="center" style={{ width: '100%', height: '100%' }}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('resources.emptyHint')} /></Flex>
      ) : selectedItem.projectSource && selectedItem.extension === 'GBATRACKER' ? (
        <TrackerModuleViewer key={`${selectedItem.id}:${trackerTargetSwitchRevision}`} url={selectedItem.url} extension={selectedItem.extension} filename={selectedItem.name} projectPackage={selectedItem.extension === 'GBATRACKER'} onTargetSwitched={() => setTrackerTargetSwitchRevision(revision => revision + 1)} onSaved={() => { message.success(t('music.saved')); void load(); }} />
      ) : originalMusicView : !selectedItem ? (
        <Flex align="center" justify="center" style={{ width: '100%', height: '100%' }}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('resources.emptyHint')} /></Flex>
      ) : config.media === 'image' ? (
        <Flex align="center" justify="center" style={{ height: '100%', overflow: 'auto', padding: 24 }} onWheel={event => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          setUserSettings(previous => ({ ...previous, zoom: getNextZoomStep(previous.zoom, event.deltaY < 0 ? 1 : -1), _saved: false }));
          setSettingUtils(previous => ({ ...previous, buttonZoomPressed: true }));
        }} onPointerDown={event => {
          if (event.button !== 1) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          imagePanDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: imagePan.x, originY: imagePan.y };
        }} onPointerMove={event => {
          const drag = imagePanDrag.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          setImagePan({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y });
        }} onPointerUp={event => {
          if (imagePanDrag.current?.pointerId === event.pointerId) imagePanDrag.current = null;
        }} onPointerCancel={() => { imagePanDrag.current = null; }} onDoubleClick={() => {
          setUserSettings(previous => ({ ...previous, zoom: 100, _saved: false }));
          setSettingUtils(previous => ({ ...previous, buttonZoomPressed: true }));
          setImagePan({ x: 0, y: 0 });
        }}>
          <Image preview={false} src={selectedItem.url} draggable={false} style={{ maxHeight: '70vh', imageRendering: 'pixelated', transform: `translate(${imagePan.x}px, ${imagePan.y}px) scale(${(userSettings.zoom ?? 100) / 100})`, transformOrigin: 'center', cursor: 'grab' }} />
        </Flex>
      ) : kind === 'music' && selectedItem.projectSource && selectedItem.extension === 'GBATRACKER' ? (
        <Flex align="center" justify="center" style={{ height: '100%', padding: 24, overflow: 'auto' }}>
          <TrackerModuleViewer
            key={`${selectedItem.id}:${trackerTargetSwitchRevision}`}
            url={selectedItem.url}
            extension={selectedItem.extension}
            filename={selectedItem.name}
            projectPackage={selectedItem.extension === 'GBATRACKER'}
            onTargetSwitched={() => setTrackerTargetSwitchRevision(revision => revision + 1)}
            onSaved={() => { message.success(t('music.saved')); void load(); }}
          />
        </Flex>
      ) : kind === 'music' && !selectedItem.projectSource ? originalMusicView : kind === 'sounds' && selectedItem.projectSource ? (
        <Flex align="center" justify="center" style={{ height: '100%' }}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noItems')} /></Flex>
      ) : (
        <Flex align="center" justify="center" style={{ height: '100%' }}>
          <Card title={selectedItem.name} style={{ width: 'min(560px, 100%)' }}><audio controls src={selectedItem.url} style={{ width: '100%' }} /></Card>
        </Flex>
      ))}
      </ResourceDropSurface>
    </ResourceEditorShell>
  );
}

export default function AssetLibraryEditor({ kind, musicWorkspaceMode = false }: { kind: AssetEditorKind; musicWorkspaceMode?: boolean }) {
  return kind === 'palettes'
    ? <PaletteEditor />
    : <AssetLibraryAssetsEditor kind={kind} musicWorkspaceMode={musicWorkspaceMode} />;
}
