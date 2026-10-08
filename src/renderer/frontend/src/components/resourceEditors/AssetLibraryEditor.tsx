import { DeleteOutlined, FolderOpenOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons';
import { App, Button, Card, ColorPicker, Divider, Empty, Flex, Image, Input, List, Popconfirm, Space, Spin, Tag, theme, Tooltip, Typography } from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useI18n } from '@/i18n/I18n';
import ResourceEditorShell from './ResourceEditorShell';
import useAppContexts from '@/providers/contexts/AppContexts';
import { defaultPalettes, getDefaultPalette, loadPaletteLibrary, PaletteDefinition, sortPalettesByCreation } from './paletteLibrary';
import { getNextZoomStep } from '@/utils/zoom';
import ResourceDropSurface from './ResourceDropSurface';
import TrackerModuleViewer from './TrackerModuleViewer';
import { isTrackerExtension } from '@/utils/trackerModule';

export type AssetEditorKind = 'images' | 'music' | 'sounds' | 'palettes';

const configs: Record<Exclude<AssetEditorKind, 'palettes'>, { titleKey: string; descriptionKey: string; folder: string; media: 'image' | 'audio' }> = {
  images: { titleKey: 'editor.images', descriptionKey: 'resources.images.description', folder: 'backgrounds', media: 'image' },
  music: { titleKey: 'editor.music', descriptionKey: 'resources.music.description', folder: 'musics', media: 'audio' },
  sounds: { titleKey: 'editor.sounds', descriptionKey: 'resources.sounds.description', folder: 'sounds', media: 'audio' },
};

interface AssetItem { id: string; name: string; url: string; extension: string; group?: 'Backgrounds' | 'Backgrounds HD' | 'Autotiles' }

const realAssetPath = (url: string) => url.replace(/^local:\/\/+/, '');

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
  const { message } = App.useApp();
  const { palettes: paletteResource, setPalettes: setPaletteResource } = useAppContexts();
  const [palettes, setPalettes] = useState<PaletteDefinition[]>(() => sortPalettesByCreation(paletteResource.palettes.length ? paletteResource.palettes : loadPaletteLibrary()));
  const [selectedId, setSelectedId] = useState(defaultPalettes[0].id);
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
  const visiblePalettes = palettes.filter(palette => palette.name.toLowerCase().includes(search.trim().toLowerCase()));
  const defaultPaletteName = draft.custom ? 'New Palette' : (getDefaultPalette(draft.id)?.name ?? 'Palette');

  const commitPaletteName = (value: string) => {
    updateDraft({ name: value.trim() || defaultPaletteName });
    setIsPaletteNameEditing(false);
  };

  return (
    <ResourceEditorShell
      title="Palettes"
      searchOpen={searchOpen}
      onToggleSearch={() => { setSearchOpen(previous => !previous); if (searchOpen) setSearch(''); }}
      libraryActions={<><Tooltip title="Create 16-color palette"><Button aria-label="Create 16-color palette" icon={<PlusOutlined />} size="small" type="text" onClick={createPalette} /></Tooltip><Tooltip title="Reset selected palette to default"><Button aria-label="Reset selected palette to default" disabled={draft.custom} icon={<UndoOutlined />} size="small" type="text" onClick={resetPalette} /></Tooltip></>}
      library={<>{searchOpen && <Input allowClear value={search} placeholder="Search..." onChange={event => setSearch(event.target.value)} style={{ marginBottom: 8, background: token.colorBgBase }} />}<List size="small" split={false} dataSource={visiblePalettes} renderItem={palette => <List.Item onClick={() => selectPalette(palette.id)} style={{ cursor: 'pointer', borderRadius: token.borderRadius, paddingInline: 8, background: palette.id === selectedId ? token.colorPrimaryBg : undefined }}><Flex align="center" justify="space-between" style={{ width: '100%', minWidth: 0 }}><Flex align="center" gap={8} style={{ minWidth: 0 }}><span aria-label={`${palette.name} palette preview`} style={{ width: 30, height: 30, flex: '0 0 30px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', overflow: 'hidden', border: '1px solid #888', borderRadius: 2 }}>{palette.colors.slice(0, 16).map((color, index) => <i key={index} style={{ background: color }} />)}</span><Typography.Text ellipsis>{palette.name}</Typography.Text></Flex>{palette.custom && <Popconfirm title={`Delete ${palette.name}?`} onConfirm={event => { event?.stopPropagation(); deletePalette(palette.id); }}><Button aria-label={`Delete ${palette.name}`} icon={<DeleteOutlined />} size="small" type="text" danger onClick={event => event.stopPropagation()} /></Popconfirm>}</Flex></List.Item>} /></>}
      inspector={<Space direction="vertical" style={{ width: '100%' }}><Typography.Text strong>Palette name</Typography.Text>{isPaletteNameEditing ? <Input autoFocus variant="borderless" value={draft.name} placeholder={defaultPaletteName} onChange={event => updateDraft({ name: event.target.value })} onBlur={event => commitPaletteName(event.target.value)} onPressEnter={event => event.currentTarget.blur()} /> : <Typography.Text onClick={() => setIsPaletteNameEditing(true)} style={{ cursor: 'text' }}>{draft.name?.trim() || defaultPaletteName}</Typography.Text>}<Tag color="blue">Color 0 is transparent</Tag></Space>}
    >
      <Flex vertical align="center" gap={20}>
        <Typography.Title level={4} style={{ margin: 0 }}>{draft.name?.trim() || defaultPaletteName}</Typography.Title>
        <Typography.Text type="secondary">The first color is reserved for transparency and cannot be moved.</Typography.Text>
        <PaletteGrid colors={draft.colors} editable onChange={(index, color) => updateDraft(current => ({ colors: current.colors.map((value, position) => position === index ? color : value) }))} />
      </Flex>
    </ResourceEditorShell>
  );
}

function AssetLibraryAssetsEditor({ kind }: { kind: Exclude<AssetEditorKind, 'palettes'> }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { t } = useI18n();
  const { userSettings, setUserSettings, setSettingUtils } = useAppContexts();
  const config = configs[kind];
  const [items, setItems] = useState<AssetItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const responses = kind === 'images'
        ? await Promise.all([window.electronAPI.fetchImages('backgrounds'), window.electronAPI.fetchImages('backgrounds-hd'), window.electronAPI.fetchImages('auto-tiles')])
        : [await window.electronAPI.fetchImages(config.folder)];
      const nextItems = responses.flatMap((response: any, responseIndex) => response?.status === 'success' && Array.isArray(response.fileImages)
        ? response.fileImages.map((name: string) => ({
            id: `${responseIndex}:${name}`,
            name,
            url: `${response.localPath}/${name}`,
            extension: name.includes('.') ? name.split('.').pop()!.toUpperCase() : '',
            group: kind === 'images' ? (responseIndex === 0 ? 'Backgrounds' : responseIndex === 1 ? 'Backgrounds HD' : 'Autotiles') : undefined,
          })) : []);
      setItems(nextItems);
      setSelected(current => nextItems.some((item: AssetItem) => item.id === current) ? current : nextItems[0]?.id ?? null);
    } catch (error) {
      console.error(`Failed to load ${config.folder}:`, error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [config.folder]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const reload = () => { void load(); };
    window.addEventListener('gba-studio:assets-reloaded', reload);
    return () => window.removeEventListener('gba-studio:assets-reloaded', reload);
  }, [load]);

  const importDropped = async (folder: string, files: string[]) => {
    const response = await window.electronAPI.importDroppedAssets(folder, files);
    if (response?.status === 'success') {
      message.success(`${response.files.length} asset(s) imported`);
      await load();
    } else if (response?.status === 'error') {
      message.error(response.message);
    }
  };

  const handleFiles = (filePaths: string[], targetId?: string) => {
    const allowed = kind === 'images' ? /\.(png|jpg|jpeg|gif|bmp)$/i : kind === 'music' ? /\.(mp3|wav|mod|xm|s3m|it|mid|midi)$/i : /\.(wav|raw|mp3|ogg)$/i;
    const compatible = filePaths.filter(filePath => allowed.test(filePath));
    if (compatible.length === 0) {
      message.warning('No compatible files were dropped.');
      return;
    }
    if (compatible.length !== filePaths.length) message.warning('Some incompatible files were ignored.');
    const destinationFolder = kind === 'images' && (targetId === 'backgrounds-hd' || targetId === 'auto-tiles') ? targetId : config.folder;
    void importDropped(destinationFolder, compatible);
  };

  const filtered = useMemo(() => items.filter(item => item.name.toLowerCase().includes(search.toLowerCase())), [items, search]);
  const selectedItem = items.find(item => item.id === selected) ?? null;
  const selectedItemPath = selectedItem ? realAssetPath(selectedItem.url) : '';

  const inspector = selectedItem ? (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Title level={5}>{selectedItem.name.replace(/\.[^/.]+$/, '')}</Typography.Title>
      <Tag>{selectedItem.extension || 'FILE'}</Tag>
      <Typography.Text type="secondary" copyable>{selectedItemPath}</Typography.Text>
      <Button block icon={<FolderOpenOutlined />} onClick={() => window.electronAPI.send('open-project-folder', selectedItemPath.slice(0, Math.max(selectedItemPath.lastIndexOf('/'), selectedItemPath.lastIndexOf('\\'))))}>Open image folder</Button>
    </Space>
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('common.noItems')} />;

  return (
    <ResourceEditorShell
      title={t(config.titleKey)}
      searchOpen={searchOpen}
      onToggleSearch={() => { setSearchOpen(previous => !previous); if (searchOpen) setSearch(''); }}
      library={<>{searchOpen && <Input allowClear value={search} placeholder={t('common.search')} onChange={event => setSearch(event.target.value)} style={{ marginBottom: 8, background: token.colorBgBase }} />}{loading ? <Flex justify="center" style={{ padding: 24 }}><Spin /></Flex> : <List size="small" split={false} dataSource={filtered} locale={{ emptyText: t('common.noItems') }} renderItem={(item, index) => <React.Fragment key={item.id}>{kind === 'images' && (index === 0 || item.group !== filtered[index - 1]?.group) && <Divider orientation="left" plain style={{ margin: '8px 0' }}>{item.group}</Divider>}<List.Item onClick={() => setSelected(item.id)} style={{ cursor: 'pointer', borderRadius: token.borderRadius, padding: '4px 8px', background: item.id === selected ? token.colorPrimaryBg : undefined }}><Typography.Text ellipsis>{item.name.replace(/\.[^/.]+$/, '')}</Typography.Text></List.Item></React.Fragment>} />}</>}
      inspector={inspector}
    >
      <ResourceDropSurface
        onFiles={handleFiles}
        hint={t('common.dropFiles')}
        dropTargets={kind === 'images' ? [
          { id: 'backgrounds', label: t('images.background') },
          { id: 'backgrounds-hd', label: t('images.backgroundHd') },
          { id: 'auto-tiles', label: t('images.autoTiles') },
        ] : undefined}
      >
      {!selectedItem ? (
        <Empty description={<><div>{t('common.noItems')}</div><Typography.Text type="secondary">{t('resources.emptyHint')}</Typography.Text></>} />
      ) : config.media === 'image' ? (
        <Flex align="center" justify="center" style={{ height: '100%', overflow: 'auto', padding: 24 }} onWheel={event => {
          if (!event.ctrlKey) return;
          event.preventDefault();
          setUserSettings(previous => ({ ...previous, zoom: getNextZoomStep(previous.zoom, event.deltaY < 0 ? 1 : -1), _saved: false }));
          setSettingUtils(previous => ({ ...previous, buttonZoomPressed: true }));
        }} onDoubleClick={() => {
          setUserSettings(previous => ({ ...previous, zoom: 100, _saved: false }));
          setSettingUtils(previous => ({ ...previous, buttonZoomPressed: true }));
        }}>
          <Image preview={false} src={selectedItem.url} draggable={false} style={{ maxHeight: '70vh', imageRendering: 'pixelated', transform: `scale(${(userSettings.zoom ?? 100) / 100})`, transformOrigin: 'center' }} />
        </Flex>
      ) : kind === 'music' && isTrackerExtension(selectedItem.extension) ? (
        <Flex align="center" justify="center" style={{ height: '100%', padding: 24, overflow: 'auto' }}>
          <TrackerModuleViewer
            url={selectedItem.url}
            extension={selectedItem.extension}
            filename={selectedItem.name}
            onSaved={() => { message.success('Edited tracker copy saved to the project.'); void load(); }}
          />
        </Flex>
      ) : (
        <Flex align="center" justify="center" style={{ height: '100%' }}>
          <Card title={selectedItem.name} style={{ width: 'min(560px, 100%)' }}><audio controls src={selectedItem.url} style={{ width: '100%' }} /></Card>
        </Flex>
      )}
      </ResourceDropSurface>
    </ResourceEditorShell>
  );
}

export default function AssetLibraryEditor({ kind }: { kind: AssetEditorKind }) {
  return kind === 'palettes'
    ? <PaletteEditor />
    : <AssetLibraryAssetsEditor kind={kind} />;
}
