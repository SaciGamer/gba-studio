import { useNameHoverStyle } from './NameHover';
import { floatingPreviewTop } from '../utils/floatingPreviewPosition';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Button, Checkbox, Flex, Input, Space, Tag, Tooltip, Typography, theme } from 'antd';
import { CopyOutlined, DeleteOutlined, DownOutlined, EyeInvisibleOutlined, EyeOutlined, PictureOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { v4 as uuidv4 } from 'uuid';
import { ITileAnimation, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import { InputNumber } from './StepInputNumber';
import { useI18n } from '@/i18n/I18n';
import TileAnimationPicker, { type AnimationTileset } from './TileAnimationPicker';

interface TileAnimationEditorProps {
  scene: ISceneSettings;
  layerId: number;
  onChange: (animations: ITileAnimation[]) => void;
  onSceneChange?: (scene: ISceneSettings) => void;
  tileset?: { image: HTMLImageElement | HTMLCanvasElement; tileWidth: number; tileHeight: number; columns: number; rows: number; source?: string };
  tilesetAssets?: Array<{ id: string; name?: string; path: string }>;
  backgroundAssets?: Array<{ id: string; name?: string; path: string }>;
  loadedLayerTilesets?: AnimationTileset[];
  paletteOptions?: Array<{ id: string; name: string; colors: string[] }>;
  hiddenAnimationIds?: readonly string[];
  onToggleAnimation?: (id: string) => void;
}

const numericStyle: React.CSSProperties = { flex: 1, minWidth: 0 };
type PickTile = (value: number, title: string, onSelect: (tile: number, tilesetId: string) => void, tilesetId?: string) => void;
const NO_TILESET_ASSETS: Array<{ id: string; name?: string; path: string }> = [];
const NO_LAYER_TILESETS: AnimationTileset[] = [];

const replaceLayerAnimations = (all: ITileAnimation[], layerId: number, layerAnimations: ITileAnimation[]): ITileAnimation[] => {
  let nextIndex = 0;
  const result: ITileAnimation[] = [];
  for (const item of all) {
    if (item.layerId !== layerId) result.push(item);
    else if (nextIndex < layerAnimations.length) result.push(layerAnimations[nextIndex++]);
  }
  return [...result, ...layerAnimations.slice(nextIndex)];
};

const normalize = (animation: Partial<ITileAnimation>): ITileAnimation => {
  const frames = Array.isArray(animation.frameTileIndices) && animation.frameTileIndices.length
    ? animation.frameTileIndices.map(value => Math.max(0, Math.min(1023, Math.trunc(Number(value) || 0))))
    : [0];
  const initialFrame = Math.max(0, Math.min(frames.length - 1, Math.trunc(Number(animation.initialFrame) || 0)));
  return {
    id: animation.id,
    name: animation.name,
    layerId: Math.max(0, Math.min(3, Math.trunc(Number(animation.layerId) || 0))),
    targetTileIndex: Math.max(0, Math.min(1023, Math.trunc(Number(animation.targetTileIndex) || 0))),
    targetTilesetId: animation.targetTilesetId,
    frameTileIndices: frames.slice(0, 32),
    frameTilesetIds: Array.isArray(animation.frameTilesetIds) ? animation.frameTilesetIds.slice(0, frames.length) : undefined,
    collapsed: animation.collapsed === true,
    durationFrames: Math.max(1, Math.min(65535, Math.trunc(Number(animation.durationFrames) || 1))),
    loop: animation.loop !== false,
    initialFrame,
  };
};

const TileAnimationEditor: React.FC<TileAnimationEditorProps> = ({ scene, layerId, onChange, onSceneChange, tileset, tilesetAssets = NO_TILESET_ASSETS, backgroundAssets = NO_TILESET_ASSETS, loadedLayerTilesets = NO_LAYER_TILESETS, hiddenAnimationIds = [], onToggleAnimation }) => {
  const { t } = useI18n();
  const allAnimations = scene.tileAnimations ?? [];
  const animations = allAnimations.filter(animation => animation.layerId === layerId);
  const layer = scene.backgrounds?.find(item => item.layerId === layerId);
  const appliedTilesetIds = useMemo(() => {
    const ids = new Set<string>();
    const fallback = layer?.selectedTilesetId ?? scene.selectedTilesetId;
    if (fallback) ids.add(fallback);
    if (layer?.backgroundId) ids.add(layer.backgroundId);
    layer?.tileMap?.forEach((row, rowIndex) => row.forEach((tile, columnIndex) => {
      if (tile < 0) return;
      const id = layer.tileMapTilesetIds?.[rowIndex]?.[columnIndex] ?? fallback;
      if (id) ids.add(id);
    }));
    return [...ids];
  }, [layer, scene.selectedTilesetId]);
  const animationAssets = useMemo(() => [...tilesetAssets, ...backgroundAssets], [tilesetAssets, backgroundAssets]);
  const tilesetAssetSignature = animationAssets.map(asset => `${asset.id}:${asset.name ?? ''}:${asset.path}`).join('|');
  const appliedTilesetSignature = appliedTilesetIds.join('|');
  const [loadedAssets, setLoadedAssets] = useState<AnimationTileset[]>([]);
  const [picker, setPicker] = useState<{ value: number; title: string; tilesetId: string; onSelect: (tile: number, tilesetId: string) => void } | null>(null);
  useEffect(() => { setPicker(null); }, [scene.id]);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const files = animationAssets.filter(asset => appliedTilesetIds.includes(asset.id));
      const loaded = await Promise.all(files.map(async asset => {
        const image = new Image();
        image.src = asset.path;
        await new Promise<void>(resolve => {
          if (image.complete) resolve();
          else { image.onload = () => resolve(); image.onerror = () => resolve(); }
        });
        if (!image.naturalWidth || !image.naturalHeight) return null;
        const tileWidth = 8, tileHeight = 8;
        const preview = await loadPaletteTransparentImage(asset.path);
        return { id: asset.id, name: asset.name || asset.id, image: preview ?? image, tileWidth, tileHeight,
          columns: Math.floor(image.naturalWidth / tileWidth), rows: Math.floor(image.naturalHeight / tileHeight), source: asset.path } as AnimationTileset;
      }));
      if (!cancelled) setLoadedAssets(loaded.filter((item): item is AnimationTileset => Boolean(item)));
    };
    void load();
    return () => { cancelled = true; };
  // Depend on a value signature because callers may construct the asset array inline.
  }, [tilesetAssetSignature, appliedTilesetSignature]);
  const sourceTilesets = useMemo(() => {
    const map = new Map<string, AnimationTileset>();
    [...loadedLayerTilesets, ...loadedAssets].forEach(item => map.set(item.id, item));
    return appliedTilesetIds.map(id => map.get(id)).filter((item): item is AnimationTileset => Boolean(item));
  }, [loadedLayerTilesets, loadedAssets, appliedTilesetIds]);
  const hasTaggedTile = Boolean(layer?.tileMap?.some((row, rowIndex) => row.some((tile, columnIndex) =>
    tile >= 0 && Boolean(layer.tileMapTilesetIds?.[rowIndex]?.[columnIndex]))));
  const hasAutoTile = Boolean(layer?.autoTileMap?.some(row => row.some(tile => Number.isInteger(tile) && tile >= 0)));
  const canAddAnimation = Boolean(layer?.backgroundId) || hasTaggedTile || hasAutoTile;
  const defaultTilesetId = layer?.selectedTilesetId ?? layer?.backgroundId ?? scene.selectedTilesetId ?? sourceTilesets[0]?.id ?? '';
  const pickTile: PickTile = (value, title, onSelect, preferredTilesetId) => {
    if (!sourceTilesets.length) return;
    const initialTilesetId = preferredTilesetId ?? defaultTilesetId;
    setPicker({ value, title, tilesetId: sourceTilesets.some(item => item.id === initialTilesetId) ? initialTilesetId : sourceTilesets[0].id, onSelect });
  };

  const duplicateTargets = useMemo(() => {
    const seen = new Set<number>();
    return animations.map(item => item.targetTileIndex).filter(tile => seen.has(tile) || !seen.add(tile));
  }, [animations]);

  const update = (index: number, patch: Partial<ITileAnimation>) => {
    const updatedLayer = animations.map((item, itemIndex) => itemIndex === index ? normalize({ ...item, ...patch, layerId }) : item);
    onChange(replaceLayerAnimations(allAnimations, layerId, updatedLayer));
  };

  const add = () => {
    if (animations.length >= 32 || !canAddAnimation) return;
    const id = `tile-animation-${Date.now()}-${animations.length}`;
    onChange([...allAnimations, normalize({ id, layerId, targetTileIndex: 0, targetTilesetId: defaultTilesetId || undefined, frameTileIndices: [0, 1], frameTilesetIds: defaultTilesetId ? [defaultTilesetId, defaultTilesetId] : undefined, durationFrames: 8, loop: true, initialFrame: 0 })]);
  };

  const duplicate = (index: number) => {
    if (animations.length >= 32) return;
    const source = animations[index];
    if (!source) return;
    const copy = normalize({
      ...source,
      id: uuidv4(),
      name: undefined,
      frameTileIndices: [...source.frameTileIndices],
      frameTilesetIds: source.frameTilesetIds ? [...source.frameTilesetIds] : undefined,
    });
    const nextAnimations = animations.slice();
    nextAnimations.splice(index + 1, 0, copy);
    onChange(replaceLayerAnimations(allAnimations, layerId, nextAnimations));
  };

  return <Space direction="vertical" style={{ width: '100%' }}>
    <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
      <Typography.Text strong>{t('tileAnimations.title')}</Typography.Text>
      <Button size="small" icon={<PlusOutlined />} onClick={add} disabled={animations.length >= 32 || !canAddAnimation}>{t('tileAnimations.add')}</Button>
    </Space>
    <Typography.Text type="secondary">{t('tileAnimations.hint')}</Typography.Text>
    {duplicateTargets.length > 0 && <Alert type="warning" showIcon message={t('tileAnimations.duplicate')} description={t('tileAnimations.duplicateHint', { tiles: [...new Set(duplicateTargets)].join(', ') })} />}
    {animations.map((animation, index) => {
      const id = animation.id ?? `tile-animation-${index}`;
      return <TileAnimationCard key={`${scene.id}:${id}`} animation={animation} index={index} tileset={tileset}
        canDuplicate={animations.length < 32} onDuplicate={() => duplicate(index)}
        hidden={hiddenAnimationIds.includes(id)}
        onToggleVisibility={onToggleAnimation ? () => onToggleAnimation(id) : undefined}
        onRemove={() => onChange(replaceLayerAnimations(allAnimations, layerId, animations.filter((_, itemIndex) => itemIndex !== index)))}
        onUpdate={patch => update(index, patch)} onToggleCollapsed={() => update(index, { collapsed: !animation.collapsed })}
        onPick={pickTile} sourceTilesets={sourceTilesets} defaultTilesetId={defaultTilesetId} />;
    })}
    {!animations.length && <Typography.Text type="secondary">{t('tileAnimations.empty')}</Typography.Text>}
    {/* TODO: Resume Map cell attributes editor.
    <MapCellOverrideEditor scene={scene} layerId={layerId} onSceneChange={onSceneChange} tileset={tileset} onPick={pickTile} />
    */}
    {picker && sourceTilesets.length > 0 && <TileAnimationPicker tilesets={sourceTilesets} {...picker} onClose={() => setPicker(null)} />}
  </Space>;
};

function TileAnimationCard({ animation, index, tileset, hidden, canDuplicate, onDuplicate, onToggleVisibility, onRemove, onUpdate, onToggleCollapsed, onPick, sourceTilesets, defaultTilesetId }: {
  animation: ITileAnimation; index: number; tileset?: NonNullable<TileAnimationEditorProps['tileset']>;
  sourceTilesets: AnimationTileset[]; defaultTilesetId: string;
  hidden: boolean; canDuplicate: boolean; onDuplicate: () => void;
  onToggleVisibility?: () => void; onRemove: () => void;
  onToggleCollapsed: () => void;
  onUpdate: (patch: Partial<ITileAnimation>) => void; onPick: PickTile;
}) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const collapsed = animation.collapsed === true;
  const [editingName, setEditingName] = useState(false);
  const nameHoverStyle = useNameHoverStyle();
  const [hoveredFrame, setHoveredFrame] = useState<number | null>(null);
  const [draggedFrame, setDraggedFrame] = useState<number | null>(null);
  const [frameDragOrder, setFrameDragOrder] = useState<number[] | null>(null);
  const frameDragOrderRef = useRef<number[] | null>(null);
  const clearFrameDrag = () => {
    setDraggedFrame(null);
    setFrameDragOrder(null);
    frameDragOrderRef.current = null;
  };
  const previewFrameOrder = (targetIndex: number) => {
    if (draggedFrame === null || draggedFrame === targetIndex) return;
    const order = [...(frameDragOrderRef.current ?? animation.frameTileIndices.map((_, i) => i))];
    const source = order.indexOf(draggedFrame);
    const target = order.indexOf(targetIndex);
    if (source < 0 || target < 0) return;
    order.splice(source, 1);
    order.splice(target, 0, draggedFrame);
    frameDragOrderRef.current = order;
    setFrameDragOrder(order);
  };
  const name = t('tileAnimations.animation', { number: index + 1 });
  const displayName = animation.name?.trim() || name;
  const destinationTileset = animation.targetTilesetId
    ? sourceTilesets.find(item => item.id === animation.targetTilesetId)
    : sourceTilesets.find(item => item.id === defaultTilesetId) ?? tileset;
  return <div data-testid={`tile-animation-${index}`} style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: `1px solid ${token.colorBorder}`, borderRadius: token.borderRadius }}>
    <Flex align="center" gap={4}>
      <Button type="text" size="small" style={{ flex: '0 0 28px', paddingInline: 4 }} aria-expanded={!collapsed} aria-label={displayName}
        icon={collapsed ? <RightOutlined /> : <DownOutlined />} onClick={onToggleCollapsed} />
      {editingName
        ? <Input autoFocus size="small" aria-label={t('tileAnimations.rename', { name: displayName })} value={animation.name ?? ''}
            placeholder={name} onChange={event => onUpdate({ name: event.target.value })}
            onBlur={() => { if (!animation.name?.trim()) onUpdate({ name: undefined }); setEditingName(false); }}
            onPressEnter={event => event.currentTarget.blur()} style={{ flex: 1, minWidth: 0 }} />
        : <Typography.Text className="editable-name-title" data-testid="tile-animation-title" role="button" tabIndex={0} strong ellipsis
            aria-label={t('tileAnimations.rename', { name: displayName })}
            title={t('tileAnimations.rename', { name: displayName })}
            onClick={() => setEditingName(true)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setEditingName(true); } }}
            style={{ ...nameHoverStyle, flex: 1, minWidth: 0, cursor: 'text' }}>{displayName}</Typography.Text>}
      <Button type="text" size="small" icon={hidden ? <EyeInvisibleOutlined /> : <EyeOutlined />} disabled={!onToggleVisibility}
        aria-label={t(hidden ? 'tileAnimations.showInScene' : 'tileAnimations.hideInScene', { name: displayName })} title={t(hidden ? 'tileAnimations.showInScene' : 'tileAnimations.hideInScene', { name: displayName })} onClick={onToggleVisibility} />
      <Button type="text" size="small" icon={<CopyOutlined />} disabled={!canDuplicate} aria-label={t('tileAnimations.copyAnimation', { name: displayName })} title={t('tileAnimations.copyAnimation', { name: displayName })} onClick={onDuplicate} />
      <Button type="text" danger size="small" icon={<DeleteOutlined />} aria-label={t('tileAnimations.removeAnimation', { name: displayName })} title={t('tileAnimations.removeAnimation', { name: displayName })} onClick={onRemove} />
    </Flex>
    {!collapsed && <Space direction="vertical" size={8} style={{ width: '100%', marginTop: 8 }}>
      <Flex gap={8} style={{ width: '100%' }}>
        <TileIndexField label={t('tileAnimations.destination')} value={animation.targetTileIndex}
          tileset={destinationTileset}
          onChange={targetTileIndex => onUpdate({ targetTileIndex })}
          onPick={(value, title) => onPick(value, title, (targetTileIndex, targetTilesetId) => onUpdate({ targetTileIndex, targetTilesetId }), animation.targetTilesetId ?? defaultTilesetId)} />
        <InputNumber aria-label={t('tileAnimations.duration')} min={1} max={65535} value={animation.durationFrames} onChange={value => onUpdate({ durationFrames: Number(value ?? 1) })} style={numericStyle} addonBefore={<Tooltip title={t('tileAnimations.duration')}><span>Ticks</span></Tooltip>} />
      </Flex>
      <Flex gap={4} wrap>
        {(frameDragOrder ?? animation.frameTileIndices.map((_, i) => i)).map(frameIndex => { const tile = animation.frameTileIndices[frameIndex]; return <div key={frameIndex} draggable onMouseEnter={() => { if (draggedFrame === null) setHoveredFrame(frameIndex); }} onMouseLeave={() => setHoveredFrame(null)}
          onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-gba-studio-tile-animation-frame', String(frameIndex)); setDraggedFrame(frameIndex); setHoveredFrame(null); const order = animation.frameTileIndices.map((_, i) => i); frameDragOrderRef.current = order; setFrameDragOrder(order); }}
          onDragEnd={clearFrameDrag} onDragOver={event => { event.preventDefault(); previewFrameOrder(frameIndex); }}
          onDrop={event => {
            event.preventDefault(); event.stopPropagation();
            if (draggedFrame === null) return;
            const order = frameDragOrderRef.current ?? animation.frameTileIndices.map((_, i) => i);
            onUpdate({
              frameTileIndices: order.map(i => animation.frameTileIndices[i]),
              frameTilesetIds: animation.frameTilesetIds?.length ? order.map(i => animation.frameTilesetIds![i]) : undefined,
              initialFrame: Math.max(0, order.indexOf(animation.initialFrame)),
            });
            clearFrameDrag();
          }}
          data-frame-index={frameIndex} data-drag-placeholder={draggedFrame === frameIndex || undefined}
          style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto', width: 'max-content', overflow: 'visible', cursor: 'grab', opacity: draggedFrame === frameIndex ? 0 : 1 }}><Button size="small" disabled={!sourceTilesets.length} style={{ height: 40, paddingInline: 4, pointerEvents: draggedFrame === null ? undefined : 'none' }}
          aria-label={t('tileAnimations.frameTile', { frame: frameIndex + 1, tile })} title={t('tileAnimations.frameTile', { frame: frameIndex + 1, tile })}
          onClick={() => onPick(tile, t('tileAnimations.selectFrame', { frame: frameIndex + 1 }), (nextTile, sourceTilesetId) => {
            const frameTilesetIds = animation.frameTilesetIds?.slice() ?? animation.frameTileIndices.map(() => defaultTilesetId);
            frameTilesetIds[frameIndex] = sourceTilesetId;
            onUpdate({ frameTileIndices: animation.frameTileIndices.map((previous, i) => i === frameIndex ? nextTile : previous), frameTilesetIds });
          }, animation.frameTilesetIds?.[frameIndex] ?? defaultTilesetId)}>
          {(sourceTilesets.find(item => item.id === (animation.frameTilesetIds?.[frameIndex] ?? defaultTilesetId)) ?? tileset) && <TilePreview {...(sourceTilesets.find(item => item.id === (animation.frameTilesetIds?.[frameIndex] ?? defaultTilesetId)) ?? tileset!)} tileIndex={tile} size={24} />}
        </Button><Button shape="circle" size="small" icon={<CopyOutlined />} aria-label={t('tileAnimations.copyFrame', { frame: frameIndex + 1 })} disabled={animation.frameTileIndices.length >= 32} onClick={() => {
          const frameTileIndices = animation.frameTileIndices.slice();
          frameTileIndices.splice(frameIndex + 1, 0, tile);
          const frameTilesetIds = animation.frameTilesetIds?.slice();
          frameTilesetIds?.splice(frameIndex + 1, 0, frameTilesetIds[frameIndex]);
          onUpdate({ frameTileIndices, frameTilesetIds, initialFrame: animation.initialFrame > frameIndex ? animation.initialFrame + 1 : animation.initialFrame });
        }} style={{ position: 'absolute', left: -8, top: -8, zIndex: 2, margin: 0, opacity: hoveredFrame === frameIndex ? 1 : 0, pointerEvents: hoveredFrame === frameIndex ? 'auto' : 'none', transition: 'opacity 120ms' }} /><Button danger shape="circle" size="small" icon={<DeleteOutlined />} aria-label={t('tileAnimations.removeFrame', { frame: frameIndex + 1 })} disabled={animation.frameTileIndices.length <= 1} onClick={() => {
          const frameTileIndices = animation.frameTileIndices.filter((_, i) => i !== frameIndex);
          const frameTilesetIds = animation.frameTilesetIds?.filter((_, i) => i !== frameIndex);
          onUpdate({ frameTileIndices, frameTilesetIds, initialFrame: Math.min(animation.initialFrame, frameTileIndices.length - 1) });
        }} style={{ position: 'absolute', right: -8, top: -8, zIndex: 2, margin: 0, opacity: hoveredFrame === frameIndex ? 1 : 0, pointerEvents: hoveredFrame === frameIndex ? 'auto' : 'none', transition: 'opacity 120ms' }} /></div>; })}
        <Button aria-label={t('tileAnimations.addFrame')} disabled={!sourceTilesets.length || animation.frameTileIndices.length >= 32} style={{ height: 40 }} icon={<PlusOutlined />}
          onClick={() => onPick(0, t('tileAnimations.addFrame'), (tile, sourceTilesetId) => onUpdate({
            frameTileIndices: [...animation.frameTileIndices, tile],
            frameTilesetIds: [...(animation.frameTilesetIds ?? animation.frameTileIndices.map(() => defaultTilesetId)), sourceTilesetId],
          }))} />
      </Flex>
      <Flex gap={8} align="center">
        <InputNumber aria-label={t('tileAnimations.initial')} min={0} max={Math.max(0, animation.frameTileIndices.length - 1)} value={animation.initialFrame} onChange={value => onUpdate({ initialFrame: Number(value ?? 0) })} style={numericStyle} addonBefore={<Tooltip title={t('tileAnimations.initial')}><span>Start</span></Tooltip>} />
        <Checkbox checked={animation.loop} onChange={event => onUpdate({ loop: event.target.checked })}>{t('tileAnimations.loop')}</Checkbox>
      </Flex>
    </Space>}
  </div>;
}

function TileIndexField({ label, value, tileset, onChange, onPick }: { label: string; value: number; tileset?: AnimationTileset; onChange: (tile: number) => void; onPick: PickTile }) {
  const { t } = useI18n();
  return <Flex gap={4} style={{ flex: 1, minWidth: 0 }}>
    <InputNumber aria-label={label} min={0} max={1023} value={value} onChange={next => onChange(Number(next ?? 0))} addonBefore={<Tooltip title={label}><span>Tile</span></Tooltip>} style={numericStyle} />
    <Tooltip title={label}><Button aria-label={t('tileAnimations.selectTile', { label })} disabled={!tileset?.columns || !tileset.rows} style={{ width: 32, height: 32, padding: 2 }}
      onClick={() => onPick(value, label, onChange)}>{tileset?.columns ? <TilePreview {...tileset} tileIndex={value} size={24} /> : <PictureOutlined />}</Button></Tooltip>
  </Flex>;
}

function FloatingAnimationPreview({ anchorRef, children }: { anchorRef: React.RefObject<HTMLDivElement | null>; children: React.ReactNode }) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const previewRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const update = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      if(!rect || rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) { setPosition(null); return; }
      const width = Math.min(280, window.innerWidth - 16);
      const height = previewRef.current?.getBoundingClientRect().height ?? 280;
      const left = rect.left >= width + 20 ? rect.left - width - 12 : Math.min(rect.right + 12, window.innerWidth - width - 8);
      setPosition({ left: Math.max(8, left), top: floatingPreviewTop(rect.top, height) });
    };
    update();
    const observer = new ResizeObserver(update);
    if(anchorRef.current) observer.observe(anchorRef.current);
    if(previewRef.current) observer.observe(previewRef.current);
    window.addEventListener('scroll', update, true); window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [anchorRef]);
  return createPortal(<div ref={previewRef} role="region" aria-label={t('tileAnimations.floatingPreview')} style={{ position: 'fixed', ...position, visibility: position ? 'visible' : 'hidden', width: 'min(280px, calc(100vw - 16px))', maxHeight: 'calc(100vh - 16px)', overflow: 'hidden', boxSizing: 'border-box', padding: 12, borderRadius: token.borderRadius, background: token.colorBgElevated, border: `1px solid ${token.colorBorder}`, boxShadow: token.boxShadowSecondary, pointerEvents: 'none', zIndex: 2000 }}>{children}</div>, document.body);
}

// TODO: Resume Map cell attributes editor after its behavior and workflow are finalized.
// const MapCellOverrideEditor: React.FC<{
//   scene: ISceneSettings;
//   layerId: number;
//   onSceneChange?: (scene: ISceneSettings) => void;
//   tileset?: AnimationTileset;
//   onPick: PickTile;
// }> = ({ scene, layerId, onSceneChange, tileset, onPick }) => {
//   const { t } = useI18n();
//   const layer = scene.backgrounds?.find(item => item.layerId === layerId);
//   const overrides = layer?.tileMapCellOverrides ?? [];
//   const [cellIndex, setCellIndex] = useState(0);
//   const [tileIndex, setTileIndex] = useState(0);
//   const [paletteId, setPaletteId] = useState(0);
//   const [horizontalFlip, setHorizontalFlip] = useState(false);
//   const [verticalFlip, setVerticalFlip] = useState(false);
//
//   const commit = (nextOverrides: NonNullable<typeof layer>['tileMapCellOverrides']) => {
//     if (!onSceneChange) return;
//     const backgrounds = scene.backgrounds?.some(item => item.layerId === layerId)
//       ? scene.backgrounds.map(item => item.layerId === layerId ? { ...item, tileMapCellOverrides: nextOverrides } : item)
//       : [...(scene.backgrounds ?? []), { layerId, tileMapCellOverrides: nextOverrides }];
//     onSceneChange({ ...scene, backgrounds, _saved: false });
//   };
//
//   if (!onSceneChange) return null;
//   return <Space direction="vertical" size={4} style={{ width: '100%', marginTop: 4 }}>
//     <Typography.Text type="secondary">{t('tileAnimations.cellAttributes')}</Typography.Text>
//     <Flex gap={8} style={{ width: '100%' }}>
//       <InputNumber aria-label={t('tileAnimations.cellIndex')} min={0} max={65535} value={cellIndex} onChange={value => setCellIndex(Math.max(0, Math.trunc(Number(value ?? 0))))} style={numericStyle} addonBefore={<Tooltip title={t('tileAnimations.cellIndex')}><span>Cell</span></Tooltip>} />
//       <TileIndexField label={t('tileAnimations.cellTile')} value={tileIndex} onChange={setTileIndex} tileset={tileset} onPick={onPick} />
//     </Flex>
//     <Flex gap={8} style={{ width: '100%' }}>
//       <InputNumber aria-label={t('tileAnimations.cellPalette')} min={0} max={15} value={paletteId} onChange={value => setPaletteId(Math.max(0, Math.min(15, Math.trunc(Number(value ?? 0)))))} style={numericStyle} addonBefore={<Tooltip title={t('tileAnimations.cellPalette')}><span>Pal</span></Tooltip>} />
//       <Button size="small" onClick={() => commit([
//         ...overrides.filter(item => item.index !== cellIndex),
//         { index: cellIndex, tileIndex, paletteId, horizontalFlip, verticalFlip },
//       ].sort((left, right) => left.index - right.index))}>{t('tileAnimations.apply')}</Button>
//     </Flex>
//     <Space size={8} wrap>
//       <Checkbox checked={horizontalFlip} onChange={event => setHorizontalFlip(event.target.checked)}>Flip X</Checkbox>
//       <Checkbox checked={verticalFlip} onChange={event => setVerticalFlip(event.target.checked)}>Flip Y</Checkbox>
//     </Space>
//     {overrides.map(override => <Space key={override.index} size={4}>
//       <Tag>Cell {override.index}: tile {override.tileIndex}{override.horizontalFlip ? ' â†”' : ''}{override.verticalFlip ? ' â†•' : ''}, pal {override.paletteId ?? 0}</Tag>
//       <Button size="small" danger onClick={() => commit(overrides.filter(item => item.index !== override.index))}>{t('tileAnimations.remove')}</Button>
//     </Space>)}
//   </Space>;
// };
//
const TileMapPreview: React.FC<{
  scene: ISceneSettings;
  layerId: number;
  targetTileIndex: number;
  frameTileIndex: number;
  tileset: { image: HTMLImageElement | HTMLCanvasElement; tileWidth: number; tileHeight: number; columns: number; rows: number; source?: string };
  paletteOptions: Array<{ id: string; name: string; colors: string[] }>;
}> = ({ scene, layerId, targetTileIndex, frameTileIndex, tileset, paletteOptions }) => {
  const { t } = useI18n();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const layer = scene.backgrounds?.find(item => item.layerId === layerId);
  const tileMap = layer?.tileMap ?? (layerId === 0 ? scene.tileMap : undefined);
  const tilePaletteIds = layer?.tilePaletteIds;
  const tileMapCellOverrides = layer?.tileMapCellOverrides ?? [];
  const paletteIds = [...new Set((layer?.tilePaletteIds ?? []).flat().filter((id): id is string => Boolean(id && id !== '__original__')))].slice(0, 16);
  const paletteSignature = paletteIds.map(id => {
    const palette = paletteOptions.find(item => item.id === id);
    return `${id}:${palette?.colors.join(',') ?? ''}`;
  }).join('|');
  const [paletteImages, setPaletteImages] = useState<Record<string, HTMLCanvasElement>>({});

  useEffect(() => {
    let cancelled = false;
    if (!tileset.source || !paletteIds.length) {
      setPaletteImages({});
      return () => { cancelled = true; };
    }
    const load = async () => {
      const entries = await Promise.all(paletteIds.map(async id => {
        const palette = paletteOptions.find(item => item.id === id);
        if (!palette) return null;
        const image = await loadPaletteTransparentImage(tileset.source!, palette.colors);
        return image ? [id, image] as const : null;
      }));
      if (!cancelled) setPaletteImages(Object.fromEntries(entries.filter((entry): entry is readonly [string, HTMLCanvasElement] => Boolean(entry))));
    };
    void load();
    return () => { cancelled = true; };
  }, [paletteSignature, tileset.source]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !tileMap?.length) return;
    const sourceWidth = Math.max(1, tileMap[0]?.length ?? 1) * tileset.tileWidth;
    const sourceHeight = Math.max(1, tileMap.length) * tileset.tileHeight;
    const scale = Math.min(1, 256 / sourceWidth, 160 / sourceHeight);
    canvas.width = Math.max(1, Math.floor(sourceWidth * scale));
    canvas.height = Math.max(1, Math.floor(sourceHeight * scale));
    context.imageSmoothingEnabled = false;
    context.fillStyle = '#333';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const perRow = Math.max(1, tileset.columns);
    tileMap.forEach((row, rowIndex) => row.forEach((tile, columnIndex) => {
      if (!Number.isFinite(tile) || tile < 0) return;
      const cellIndex = rowIndex * (tileMap[0]?.length ?? 0) + columnIndex;
      const cellOverride = tileMapCellOverrides.find(override => override.index === cellIndex);
      const authoredTile = cellOverride?.tileIndex ?? tile;
      const effectiveTile = authoredTile === targetTileIndex ? frameTileIndex : authoredTile;
      const sourceColumn = effectiveTile % perRow;
      const sourceRow = Math.floor(effectiveTile / perRow);
      const paletteId = tilePaletteIds?.[rowIndex]?.[columnIndex];
      const paletteImage = paletteId && paletteId !== '__original__' ? paletteImages[paletteId] : undefined;
      const destinationX = columnIndex * tileset.tileWidth * scale;
      const destinationY = rowIndex * tileset.tileHeight * scale;
      const destinationWidth = tileset.tileWidth * scale;
      const destinationHeight = tileset.tileHeight * scale;
      const horizontalFlip = cellOverride?.horizontalFlip === true;
      const verticalFlip = cellOverride?.verticalFlip === true;
      context.save();
      context.translate(
        horizontalFlip ? destinationX + destinationWidth : destinationX,
        verticalFlip ? destinationY + destinationHeight : destinationY,
      );
      context.scale(horizontalFlip ? -1 : 1, verticalFlip ? -1 : 1);
      context.drawImage(
        paletteImage ?? tileset.image,
        sourceColumn * tileset.tileWidth,
        sourceRow * tileset.tileHeight,
        tileset.tileWidth,
        tileset.tileHeight,
        0,
        0,
        destinationWidth,
        destinationHeight,
      );
      context.restore();
    }));
  }, [frameTileIndex, targetTileIndex, tileMap, tilePaletteIds, tileMapCellOverrides, tileset, paletteImages]);

  if (!tileMap?.length) return <Typography.Text type="secondary">{t('tileAnimations.noMap')}</Typography.Text>;
  return <div style={{ marginTop: 6 }}>
    <Typography.Text type="secondary">{t('tileAnimations.mapPreview', { tile: targetTileIndex })}</Typography.Text>
    <canvas ref={canvasRef} aria-label={t('tileAnimations.mapLayerPreview', { layer: layerId })} style={{ display: 'block', marginTop: 4, maxWidth: '100%', imageRendering: 'pixelated', background: '#333' }} />
    {paletteIds.length > 0 && <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }} aria-label={t('tileAnimations.paletteMetadata')}>
      {paletteIds.map(id => {
        const palette = paletteOptions.find(item => item.id === id);
        return <Tag key={id} color="default" style={{ margin: 0 }}>
          <span style={{ display: 'inline-flex', width: 12, height: 12, marginRight: 4, verticalAlign: '-2px', background: palette?.colors?.[0] ?? '#666' }} />
          {palette?.name ?? id}
        </Tag>;
      })}
    </div>}
  </div>;
};

const TilePreview: React.FC<{ image: HTMLImageElement | HTMLCanvasElement; tileIndex: number; tileWidth: number; tileHeight: number; columns: number; size?: number }> = ({ image, tileIndex, tileWidth, tileHeight, columns, size = 64 }) => {
  const { t } = useI18n();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || columns <= 0 || (!(image instanceof HTMLCanvasElement) && !image.complete)) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const column = Math.max(0, tileIndex % columns);
    const row = Math.max(0, Math.floor(tileIndex / columns));
    context.drawImage(image, column * tileWidth, row * tileHeight, tileWidth, tileHeight, 0, 0, canvas.width, canvas.height);
  }, [image, tileIndex, tileWidth, tileHeight, columns]);
  return <canvas ref={canvasRef} width={64} height={64} aria-label={t('tileAnimations.tilePreview', { tile: tileIndex })} style={{ display: 'block', width: size, height: size, imageRendering: 'pixelated' }} />;
};

export default TileAnimationEditor;
