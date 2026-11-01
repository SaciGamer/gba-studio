import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DeleteOutlined } from '@ant-design/icons';
import { Button, Flex, Input, Modal, Popconfirm, Select, Space, Tabs, Timeline, Tooltip, Typography, theme } from 'antd';
import { useI18n } from '@/i18n/I18n';
import { joinLocalAssetPath } from '@/utils/localAssetUrl';
import { loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import { BLOB47_HOLE_PREVIEW_PARTS, BLOB47_MASK_INDEX, BLOB47_MASKS, BLOB47_PART_GROUPS, getBlob47Mask } from '@/utils/blobAutoTile';

export interface AutoTileSlot {
  autoTileId?: string;
  name?: string;
  tileSize?: 8 | 16 | 32;
  parts: Array<number | null>;
}

interface TilesetAutoTileViewProps {
  slots: AutoTileSlot[];
  autoTiles: Array<{ id: string; name: string }>;
  defaultAutoTileId?: string;
  onChange: (slots: AutoTileSlot[]) => void;
  onRemoveSlot?: (slotIndex: number, slots: AutoTileSlot[]) => void;
  onConfigurationClose?: (slots: AutoTileSlot[], sourceImages: Record<string, AutoTileTilesetImage>) => void;
  selectedSlot?: number | null;
  sceneTileSize?: 8 | 16 | 32;
  onSelectSlot?: (slotIndex: number) => void;
  onHoverSlot?: (slotIndex: number | null) => void;
  zoom: number;
  tilesetViews: Record<string, { cellSize: 8 | 16 | 32; zoom: number; showGrid: boolean }>;
  onUpdateSourceView: (id: string, patch: Partial<{ cellSize: 8 | 16 | 32; zoom: number; showGrid: boolean }>) => void;
  openConfigurationSignal?: number;
  assetReloadVersion?: number;
  inlineConfiguration?: boolean;
}

export interface AutoTileTilesetImage {
  image: HTMLImageElement | HTMLCanvasElement;
  source: string;
  width: number;
  height: number;
}

const MASK_GUIDE_CELLS: Array<{ bit: number; row: number; column: number }> = [
  { bit: 128, row: 0, column: 0 }, { bit: 1, row: 0, column: 1 }, { bit: 2, row: 0, column: 2 },
  { bit: 64, row: 1, column: 0 }, { bit: 0, row: 1, column: 1 }, { bit: 4, row: 1, column: 2 },
  { bit: 32, row: 2, column: 0 }, { bit: 16, row: 2, column: 1 }, { bit: 8, row: 2, column: 2 },
];

const BlobMaskGuide: React.FC<{ mask: number; label: string; hint: string }> = ({ mask, label, hint }) => {
  const { token } = theme.useToken();
  return <div style={{ display: 'grid', gap: 6, minWidth: 140 }}>
    <Typography.Text strong>{label}</Typography.Text>
    <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 16px)', gap: 2, width: 'max-content' }}>
      {MASK_GUIDE_CELLS.map(({ bit }, index) => {
        const isCurrentTile = bit === 0;
        const isConnectedNeighbor = !isCurrentTile && (mask & bit) !== 0;
        return <span key={index} style={{
          width: 16,
          height: 16,
          boxSizing: 'border-box',
          background: isCurrentTile ? token.colorPrimary : isConnectedNeighbor ? token.colorPrimaryBg : token.colorBgContainer,
          opacity: isConnectedNeighbor ? 0.55 : 1,
          outline: `1px solid ${isCurrentTile ? token.colorPrimary : token.colorBorderSecondary}`,
        }} />;
      })}
    </div>
    <Typography.Text type="secondary">{hint}</Typography.Text>
  </div>;
};

const Tile16Preview: React.FC<{ image?: HTMLImageElement | HTMLCanvasElement; source?: string; imageWidth: number; imageHeight: number; tileIndex: number | null; tileSize?: 8 | 16 | 32; style?: React.CSSProperties }> = ({ image, source, imageWidth, imageHeight, tileIndex, tileSize = 16, style }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const columns = Math.max(1, Math.floor(imageWidth / tileSize));
  const tileColumn = tileIndex == null ? -1 : tileIndex % columns;
  const tileRow = tileIndex == null ? -1 : Math.floor(tileIndex / columns);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !image || tileIndex == null || tileColumn < 0 || tileRow < 0) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, tileSize, tileSize);
    context.drawImage(image, tileColumn * tileSize, tileRow * tileSize, tileSize, tileSize, 0, 0, tileSize, tileSize);
  }, [image, tileColumn, tileIndex, tileRow, tileSize]);
  return <span style={{ display: 'inline-grid', placeItems: 'center', width: tileSize, height: tileSize, imageRendering: 'pixelated', ...style }}>
    <canvas ref={canvasRef} width={tileSize} height={tileSize} data-testid="auto-tile-source-tile-preview" style={{ display: 'block', width: '100%', height: '100%', imageRendering: 'pixelated' }} />
  </span>;
};

const AutoTilePreview: React.FC<{ image?: HTMLImageElement | HTMLCanvasElement; imageWidth: number; imageHeight: number; parts: Array<number | null>; tileSize?: 8 | 16 | 32; size?: number; background?: string }> = ({ image, imageWidth, imageHeight, parts, tileSize = 16, size = 16, background = '#555' }) => {
  const isolatedTileIndex = parts[BLOB47_MASK_INDEX.get(0) ?? -1] ?? null;
  const tileIndex = isolatedTileIndex ?? parts.find(part => part != null) ?? null;
  return <span data-testid="blob-autotile-preview" style={{ display: 'block', width: size, height: size, imageRendering: 'pixelated', backgroundColor: background }}>
    {tileIndex == null ? null : <Tile16Preview image={image} imageWidth={imageWidth} imageHeight={imageHeight} tileIndex={tileIndex} tileSize={tileSize} style={{ width: size, height: size }} />}
  </span>;
};

const PROGRESS_PREVIEW_CELLS: Array<Array<[number, number]>> = [
  [[2, 2]],
  [[1, 1], [2, 1], [1, 2], [2, 2]],
  Array.from({ length: 9 }, (_, index) => [index % 3 + 1, Math.floor(index / 3) + 1] as [number, number]),
  Array.from({ length: 25 }, (_, index) => [index % 5, Math.floor(index / 5)] as [number, number]).filter(([x, y]) => x !== 2 || y !== 2),
  Array.from({ length: 9 }, (_, index) => [index % 3 + 1, Math.floor(index / 3) + 1] as [number, number]).filter(([x, y]) => x !== 2 || y !== 2),
  [
    ...Array.from({ length: 5 }, (_, x) => [x, 0] as [number, number]),
    ...[0, 2, 3, 4].map(x => [x, 1] as [number, number]),
    ...[0, 1, 4].map(x => [x, 2] as [number, number]),
    ...[0, 1, 3, 4].map(x => [x, 3] as [number, number]),
    ...[0, 2, 4].map(x => [x, 4] as [number, number]),
  ],
];
const AutoTileProgressMask: React.FC<{ stage: number; label: string }> = ({ stage, label }) => {
  const { token } = theme.useToken();
  const cells = PROGRESS_PREVIEW_CELLS[Math.max(0, Math.min(PROGRESS_PREVIEW_CELLS.length - 1, stage))];
  const filledCells = new Set(cells.map(([x, y]) => `${x}:${y}`));
  return <div role="img" aria-label={label} data-testid="auto-tile-progress-mask" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 14px)', gap: 2, width: 'max-content' }}>
    {Array.from({ length: 25 }, (_, index) => {
      const x = index % 5;
      const y = Math.floor(index / 5);
      const filled = filledCells.has(`${x}:${y}`);
      return <span key={`${x}:${y}`} aria-hidden="true" style={{
        width: 14,
        height: 14,
        boxSizing: 'border-box',
        background: filled ? token.colorPrimary : token.colorBgContainer,
        opacity: filled ? 0.8 : 1,
        outline: `1px solid ${filled ? token.colorPrimary : token.colorBorderSecondary}`,
      }} />;
    })}
  </div>;
};

const AutoTileProgressCanvas: React.FC<{
  image?: HTMLImageElement | HTMLCanvasElement;
  imageWidth: number;
  imageHeight: number;
  parts: Array<number | null>;
  stage: number;
  tileSize?: 8 | 16 | 32;
  displaySize: number;
  fitToPreview?: boolean;
}> = ({ image, imageWidth, imageHeight, parts, stage, tileSize = 16, displaySize, fitToPreview = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!image || imageWidth < tileSize || imageHeight < tileSize) return;

    const cells = PROGRESS_PREVIEW_CELLS[Math.max(0, Math.min(PROGRESS_PREVIEW_CELLS.length - 1, stage))];
    const cellSet = new Set(cells.map(([x, y]) => `${x}:${y}`));
    const columns = Math.floor(imageWidth / tileSize);
    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const extent = Math.max(Math.max(...cells.map(([x]) => x)) - minX + 1, Math.max(...cells.map(([, y]) => y)) - minY + 1);
    const destinationCellSize = fitToPreview ? canvas.width / extent : tileSize;
    const fallbackTile = parts.find(part => part != null) ?? null;
    context.imageSmoothingEnabled = false;
    for (const [x, y] of cells) {
      const mask = getBlob47Mask((dx, dy) => cellSet.has(`${x + dx}:${y + dy}`));
      const partIndex = BLOB47_MASK_INDEX.get(mask) ?? BLOB47_MASKS.length - 1;
      const tileIndex = parts[partIndex] ?? fallbackTile;
      if (tileIndex == null) continue;
      context.drawImage(image, (tileIndex % columns) * tileSize, Math.floor(tileIndex / columns) * tileSize, tileSize, tileSize, (x - minX) * destinationCellSize, (y - minY) * destinationCellSize, destinationCellSize, destinationCellSize);
    }
  }, [fitToPreview, image, imageHeight, imageWidth, parts, stage, tileSize]);

  return <canvas
    ref={canvasRef}
    width={80}
    height={80}
    data-testid="auto-tile-progress-preview-canvas"
    style={{ display: 'block', width: displaySize, height: displaySize, imageRendering: 'pixelated' }}
  />;
};

const AutoTileConfigurationFrame: React.FC<{
  inline: boolean;
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ inline, open, title, onClose, children }) => inline
  ? <div data-testid="project-auto-tile-configuration">{children}</div>
  : <Modal title={title} open={open} footer={null} onCancel={onClose} width={720}>{children}</Modal>;

const TilesetAutoTileView: React.FC<TilesetAutoTileViewProps> = ({ slots, autoTiles, defaultAutoTileId, onChange, onRemoveSlot, onConfigurationClose, selectedSlot, sceneTileSize = 8, onSelectSlot, onHoverSlot, zoom, tilesetViews, onUpdateSourceView, openConfigurationSignal, assetReloadVersion = 0, inlineConfiguration = false }) => {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const centerPartIndex = BLOB47_MASK_INDEX.get(255) ?? 46;
  const [configuring, setConfiguring] = useState(false);
  useEffect(() => {
    if (configuring) onHoverSlot?.(null);
    return () => onHoverSlot?.(null);
  }, [configuring, onHoverSlot]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [slotNameDraft, setSlotNameDraft] = useState('');
  const [slotCountCustomized, setSlotCountCustomized] = useState(slots.length > 0);
  const [activePart, setActivePart] = useState(centerPartIndex);
  const [sourceImages, setSourceImages] = useState<Record<string, AutoTileTilesetImage>>({});
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const sourceViewportRef = useRef<HTMLDivElement>(null);
  const sourcePanStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [isPanningSource, setIsPanningSource] = useState(false);
  const imageLoadCache = useRef(new Map<string, Promise<AutoTileTilesetImage | null>>());
  const slotNameSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastConfigurationSignal = useRef(openConfigurationSignal ?? 0);
  useEffect(() => {
    imageLoadCache.current.clear();
    setSourceImages({});
  }, [assetReloadVersion]);
  useEffect(() => {
    if (openConfigurationSignal !== lastConfigurationSignal.current) {
      lastConfigurationSignal.current = openConfigurationSignal ?? 0;
      setActivePart(centerPartIndex);
      setConfiguring(true);
    }
  }, [openConfigurationSignal, centerPartIndex]);
  const normalizedSlots = Array.from({ length: Math.max(slotCountCustomized ? 1 : 8, slots.length) }, (_, index) => ({
    autoTileId: slots[index]?.autoTileId ?? defaultAutoTileId,
    name: slots[index]?.name,
    tileSize: slots[index]?.tileSize ?? 16,
    parts: Array.from({ length: 47 }, (_, partIndex) => slots[index]?.parts?.[partIndex] ?? null),
  }));
  const normalizedSlotsRef = useRef(normalizedSlots);
  normalizedSlotsRef.current = normalizedSlots;
  useEffect(() => {
    setSlotNameDraft(normalizedSlots[activeSlot]?.name ?? '');
  }, [activeSlot, normalizedSlots[activeSlot]?.name]);
  useEffect(() => () => {
    if (slotNameSaveTimer.current) clearTimeout(slotNameSaveTimer.current);
  }, []);
  const activeAutoTileId = normalizedSlots[activeSlot]?.autoTileId ?? defaultAutoTileId ?? '';
  const activeSourceImage = sourceImages[activeAutoTileId];
  const sourceView = tilesetViews[activeAutoTileId] ?? { cellSize: 8 as const, zoom: 100, showGrid: true };
  const sourceScale = sourceView.zoom / 50;
  const imageWidth = activeSourceImage?.width ?? 0;
  const imageHeight = activeSourceImage?.height ?? 0;
  const sourceCanvasWidth = imageWidth * 2;
  const sourceCanvasHeight = imageHeight * 2;
  const activeTileSize = normalizedSlots[activeSlot].tileSize ?? 16;
  const sourceColumns = Math.floor(imageWidth / activeTileSize);
  const sourceRows = Math.floor(imageHeight / activeTileSize);
  const tileCount = sourceColumns * sourceRows;
  const handleSourceWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey || !activeAutoTileId) return;
    event.preventDefault();
    event.stopPropagation();
    onUpdateSourceView(activeAutoTileId, { zoom: Math.max(50, Math.min(400, sourceView.zoom + (event.deltaY < 0 ? 25 : -25))) });
  };
  const handleSourcePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    const viewport = sourceViewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    sourcePanStartRef.current = { x: event.clientX, y: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
    setIsPanningSource(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const handleSourcePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const panStart = sourcePanStartRef.current;
    const viewport = sourceViewportRef.current;
    if (!panStart || !viewport) return;
    viewport.scrollLeft = panStart.scrollLeft - (event.clientX - panStart.x);
    viewport.scrollTop = panStart.scrollTop - (event.clientY - panStart.y);
  };
  const stopSourcePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!sourcePanStartRef.current) return;
    sourcePanStartRef.current = null;
    setIsPanningSource(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const activeParts = normalizedSlots[activeSlot].parts;
  const firstIncompleteGroupIndex = BLOB47_PART_GROUPS.findIndex(
    group => !group.every(partIndex => activeParts[partIndex] != null),
  );
  const progressPreviewStage = (() => {
    let stage = 0;
    for (let groupIndex = 1; groupIndex < BLOB47_PART_GROUPS.length; groupIndex += 1) {
      const previousGroupComplete = BLOB47_PART_GROUPS[groupIndex - 1].every(partIndex => activeParts[partIndex] != null);
      const currentGroupStarted = BLOB47_PART_GROUPS[groupIndex].some(partIndex => activeParts[partIndex] != null);
      if (!previousGroupComplete || !currentGroupStarted) break;
      stage = groupIndex >= 3 ? groupIndex + 1 : groupIndex;
    }
    const outerCornersComplete = BLOB47_PART_GROUPS[1].every(partIndex => activeParts[partIndex] != null);
    if (outerCornersComplete && BLOB47_HOLE_PREVIEW_PARTS.some(partIndex => partIndex != null && activeParts[partIndex] != null)) {
      stage = Math.max(stage, 3);
    }
    const innerCornerAndHoleGroupStarted = BLOB47_PART_GROUPS[3].some(partIndex => activeParts[partIndex] != null);
    if (innerCornerAndHoleGroupStarted) stage = Math.max(stage, 4);
    return stage;
  })();
  const isPartLocked = (partIndex: number) => {
    const groupIndex = BLOB47_PART_GROUPS.findIndex(group => group.includes(partIndex));
    return firstIncompleteGroupIndex >= 0 && groupIndex > firstIncompleteGroupIndex;
  };
  const compositionSteps = [
    t('tiles.autoTileCompositionCenter'),
    t('tiles.autoTileCompositionOuterCorners'),
    t('tiles.autoTileCompositionStraightEdges'),
    t('tiles.autoTileCompositionInnerCorners'),
    t('tiles.autoTileCompositionVariations'),
  ];
  const setPart = (partIndex: number, value: number | null) => {
    const updated = normalizedSlots.map(slot => ({ ...slot, parts: [...slot.parts] }));
    updated[activeSlot].parts[partIndex] = value;
    onChange(updated);
  };
  const setSlotAutoTile = (autoTileId: string) => {
    const updated = normalizedSlots.map(slot => ({ ...slot, parts: [...slot.parts] }));
    updated[activeSlot] = { ...updated[activeSlot], autoTileId };
    onChange(updated);
  };
  const clearActiveSlot = () => {
    const updated = normalizedSlots.map(slot => ({ ...slot, parts: [...slot.parts] }));
    updated[activeSlot] = { autoTileId: undefined, name: undefined, tileSize: normalizedSlots[activeSlot].tileSize ?? 16, parts: Array.from({ length: 47 }, () => null) };
    setActivePart(centerPartIndex);
    onChange(updated);
  };
  const saveSlotName = (slotIndex: number, name: string) => {
    const updated = normalizedSlotsRef.current.map(slot => ({ ...slot, parts: [...slot.parts] }));
    if (!updated[slotIndex]) return;
    updated[slotIndex].name = name;
    onChange(updated);
  };
  const handleSlotNameChange = (name: string) => {
    setSlotNameDraft(name);
    if (slotNameSaveTimer.current) clearTimeout(slotNameSaveTimer.current);
    const slotIndex = activeSlot;
    slotNameSaveTimer.current = setTimeout(() => {
      saveSlotName(slotIndex, name);
      slotNameSaveTimer.current = null;
    }, 500);
  };
  const flushSlotName = () => {
    if (slotNameSaveTimer.current) {
      clearTimeout(slotNameSaveTimer.current);
      slotNameSaveTimer.current = null;
      saveSlotName(activeSlot, slotNameDraft);
    }
  };
  const closeConfiguration = () => {
    setConfiguring(false);
    onConfigurationClose?.(normalizedSlots, sourceImages);
  };
  const handleSlotTabChange = (key: string) => {
    setActiveSlot(Number(key));
  };
  const addSlot = () => {
    const newSlotIndex = normalizedSlots.length;
    onChange([...normalizedSlots, { parts: Array.from({ length: 47 }, () => null) }]);
    setSlotCountCustomized(true);
    setActiveSlot(newSlotIndex);
    setActivePart(centerPartIndex);
  };
  const removeSlot = (slotIndex: number) => {
    if (normalizedSlots.length <= 1) return;
    const updated = normalizedSlots.filter((_, index) => index !== slotIndex);
    setSlotCountCustomized(true);
    if (onRemoveSlot) onRemoveSlot(slotIndex, updated);
    else onChange(updated);
    setActiveSlot(current => current === slotIndex ? Math.min(slotIndex, updated.length - 1) : current > slotIndex ? current - 1 : current);
  };

  const loadAutoTileImage = useCallback((autoTileId: string): Promise<AutoTileTilesetImage | null> => {
    const cached = imageLoadCache.current.get(autoTileId);
    if (cached) return cached;
    const task = (async () => {
      const autoTileData = await window.electronAPI.fetchImages('auto-tiles');
      if (autoTileData.status !== 'success' || !autoTileData.fileImages) return null;
      const filename = autoTileData.fileImages.find((file: string) => file.replace(/\.[^/.]+$/, '') === autoTileId);
      if (!filename) return null;
      const source = joinLocalAssetPath(autoTileData.localPath, filename);
      const imageElement = new Image();
      await new Promise<void>((resolve, reject) => {
        imageElement.onload = () => resolve();
        imageElement.onerror = () => reject(new Error(`Failed to load autotile image: ${autoTileId}`));
        imageElement.src = source;
      });
      const image = await loadPaletteTransparentImage(source) ?? imageElement;
      const width = 'naturalWidth' in image ? image.naturalWidth : image.width;
      const height = 'naturalHeight' in image ? image.naturalHeight : image.height;
      return { image, source, width, height };
    })();
    imageLoadCache.current.set(autoTileId, task);
    return task;
  }, []);

  const slotSourceIds = Array.from(new Set(normalizedSlots.map(slot => slot.autoTileId).filter((id): id is string => Boolean(id))));
  const slotSourceIdsKey = slotSourceIds.join('|');
  useEffect(() => {
    let cancelled = false;
    Promise.all(slotSourceIds.map(async id => [id, await loadAutoTileImage(id)] as const)).then(entries => {
      if (cancelled) return;
      setSourceImages(previous => ({
        ...previous,
        ...Object.fromEntries(entries.filter((entry): entry is readonly [string, AutoTileTilesetImage] => Boolean(entry[1])).map(([id, image]) => [id, image!])),
      }));
    }).catch(error => console.error('Error loading autotile source image:', error));
    return () => { cancelled = true; };
  }, [slotSourceIdsKey, loadAutoTileImage]);

  useEffect(() => {
    const canvas = sourceCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !tileCount || !activeSourceImage) return;
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(activeSourceImage.image, 0, 0, canvas.width, canvas.height);
  }, [activeSourceImage, activeSlot, configuring, imageHeight, imageWidth, tileCount]);

  return <>
    {!inlineConfiguration && <div data-testid="auto-tile-slots-view" style={{ width: '100%', padding: 10, boxSizing: 'border-box' }}>
      <Flex gap={0} wrap="wrap" align="flex-start">
        {normalizedSlots.map((slot, index) => {
          if (!slot.parts.some(part => part != null)) return null;
          const image = sourceImages[slot.autoTileId ?? ''];
          const size = (slot.tileSize ?? 16) * 2;
          const sizeMatchesScene = (slot.tileSize ?? 16) === sceneTileSize;
          const gap = 2;
          return <span key={index} onMouseEnter={() => onHoverSlot?.(index)} onMouseLeave={() => onHoverSlot?.(null)}>
          <button type="button" aria-pressed={selectedSlot === index} aria-disabled={!sizeMatchesScene} disabled={!sizeMatchesScene} onClick={() => { if (!sizeMatchesScene) return; setActiveSlot(index); onSelectSlot?.(index); }} style={{ position: 'relative', display: 'block', width: size, height: size, padding: 0, border: 0, marginRight: gap, marginBottom: gap, background: 'transparent', cursor: sizeMatchesScene ? 'pointer' : 'not-allowed', lineHeight: 0, opacity: sizeMatchesScene ? 1 : 0.35 }} aria-label={`${slot.name?.trim() || t('tiles.autoTileSlot', { index: index + 1 })} ${slot.tileSize ?? 16}×${slot.tileSize ?? 16}`}>
          <AutoTilePreview image={image?.image} imageWidth={image?.width ?? 0} imageHeight={image?.height ?? 0} parts={slot.parts} tileSize={slot.tileSize ?? 16} size={size} background={token.colorBgContainer} />
            {selectedSlot === index && <svg aria-hidden="true" viewBox="0 0 16 16" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <rect x="0.5" y="0.5" width="15" height="15" fill="none" stroke={token.colorPrimary} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            </svg>}
          </button></span>;
        })}
      </Flex>
    </div>}
    <AutoTileConfigurationFrame inline={inlineConfiguration} open={configuring} title={t('tiles.autoTileConfigureTitle')} onClose={closeConfiguration}>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Tabs
          type="editable-card"
          size="small"
          tabBarGutter={2}
          animated={false}
          activeKey={String(activeSlot)}
          onChange={handleSlotTabChange}
          onEdit={(targetKey, action) => {
            if (action === 'add') addSlot();
            else if (typeof targetKey === 'string') removeSlot(Number(targetKey));
          }}
          items={[
            ...normalizedSlots.map((slot, index) => ({
              key: String(index),
              label: slot.name?.trim() || t('tiles.autoTileSlot', { index: index + 1 }),
              children: null,
              closable: normalizedSlots.length > 1
                && !slot.parts.some(part => part != null),
            })),
          ]}
        />
        <Typography.Text type="secondary">{t('tiles.autoTileChooseParts')}</Typography.Text>
        <Flex data-testid="auto-tile-configuration-layout" align="flex-start" justify="flex-start" gap={16}>
          <Flex align="center" gap={16} style={{ flex: '0 0 auto' }}>
          <Tooltip title={<div style={{ padding: 1, background: token.colorBgContainer }}>
            <AutoTileProgressMask stage={progressPreviewStage} label={t('tiles.autoTilePreview')} />
          </div>}>
            <div data-testid="auto-tile-preview" aria-label={t('tiles.autoTilePreview')} style={{ width: 88, height: 88, display: 'grid', placeItems: 'center', background: token.colorBgContainer, flex: '0 0 88px' }}>
              <AutoTileProgressCanvas image={activeSourceImage?.image} imageWidth={imageWidth} imageHeight={imageHeight} parts={activeParts} stage={progressPreviewStage} tileSize={activeTileSize} displaySize={72} fitToPreview />
            </div>
          </Tooltip>
          <div data-testid="auto-tile-part-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 42px)', gridTemplateRows: 'repeat(6, 42px)', gap: 2 }}>
            {BLOB47_MASKS.map((_, partIndex) => {
              const mask = BLOB47_MASKS[partIndex];
              const selectedTile = activeParts[partIndex];
              const locked = isPartLocked(partIndex);
              const partBackground = locked ? token.colorFillSecondary : activePart === partIndex ? token.colorPrimaryBg : token.colorBgContainer;
              const positionName = t('tiles.autoTilePosition', { index: partIndex + 1 });
              return <Tooltip key={mask} open={locked ? false : undefined} mouseEnterDelay={1} placement="top" title={<BlobMaskGuide mask={mask} label={`${positionName} (${mask})`} hint={t('tiles.autoTileMaskHint')} />}>
                <Button
                  aria-label={`${positionName}: ${selectedTile == null ? t('tiles.autoTileChooseTile') : t('tiles.autoTileSourceTile', { index: selectedTile + 1 })}`}
                  aria-pressed={activePart === partIndex}
                  disabled={locked}
                  onClick={() => setActivePart(partIndex)}
                  style={{ position: 'relative', width: 42, height: 42, padding: 2, display: 'grid', placeItems: 'center', border: 0, outline: 'none', background: partBackground, opacity: locked ? 0.55 : 1, boxShadow: 'none' }}
                >
                  {selectedTile == null
                    ? <span aria-hidden="true" style={{ width: 36, height: 36, background: token.colorBgContainer }} />
                    : <Tile16Preview image={activeSourceImage?.image} imageWidth={imageWidth} imageHeight={imageHeight} tileIndex={selectedTile} tileSize={activeTileSize} style={{ width: 36, height: 36, backgroundColor: token.colorBgContainer }} />}
                </Button>
              </Tooltip>;
            })}
            <Popconfirm
              key="clear-slot"
              title={t('tiles.autoTileClearConfirmTitle')}
              description={t('tiles.autoTileClearConfirmDescription', { index: activeSlot + 1 })}
              okText={t('common.delete')}
              cancelText={t('common.cancel')}
              okButtonProps={{ danger: true }}
              onConfirm={clearActiveSlot}
            >
              <Button
                type="primary"
                danger
                icon={<DeleteOutlined />}
                aria-label={t('tiles.autoTileClearSlot')}
                title={t('tiles.autoTileClearSlot')}
                disabled={!activeParts.some(part => part != null)}
                style={{ width: 42, height: 42, padding: 2, display: 'grid', placeItems: 'center', boxShadow: 'none' }}
              />
            </Popconfirm>
          </div>
          </Flex>
          <Timeline
            mode="left"
            items={compositionSteps.map((title, groupIndex) => {
              const complete = BLOB47_PART_GROUPS[groupIndex].every(partIndex => activeParts[partIndex] != null);
              const current = groupIndex === firstIncompleteGroupIndex;
              return {
                color: complete ? token.colorSuccess : current ? token.colorPrimary : token.colorTextTertiary,
                children: <Typography.Text type={complete || current ? undefined : 'secondary'} strong={complete || current}>{title}</Typography.Text>,
              };
            })}
            style={{ flex: '1 1 220px', margin: '4px 0 0', paddingInlineStart: 4 }}
          />
        </Flex>
        <Flex gap={8} wrap="wrap" style={{ width: '100%' }}>
          <Tooltip title={t('tiles.autoTileSourceHint')} trigger={['hover', 'focus']}>
          <Select
            aria-label={t('tiles.autoTileSourceImage')}
            placeholder={t('tiles.selectAutoTileImage')}
            value={activeAutoTileId || undefined}
            options={autoTiles.map(asset => ({ value: asset.id, label: asset.name }))}
            onChange={setSlotAutoTile}
            style={{ width: 220 }}
          />
          </Tooltip>
          <Tooltip title={t('tiles.autoTileRenameHint')} trigger={['hover', 'focus']}>
          <Input
            aria-label={t('tiles.autoTileSlotName')}
            placeholder={normalizedSlots[activeSlot]?.name?.trim() || t('tiles.autoTileSlot', { index: activeSlot + 1 })}
            maxLength={32}
            value={slotNameDraft}
            onChange={event => handleSlotNameChange(event.target.value)}
            onBlur={flushSlotName}
            style={{ width: 180 }}
          />
          </Tooltip>
          <Tooltip title={t('tiles.autoTileSizeHint')} trigger={['hover', 'focus']}>
          <Select
            aria-label={t('tiles.autoTileTileSize')}
            value={activeTileSize}
            options={[8, 16, 32].map(size => ({ value: size, label: `${size}×${size}` }))}
            onChange={value => {
              const updated = normalizedSlots.map(slot => ({ ...slot, parts: [...slot.parts] }));
              updated[activeSlot].tileSize = value as 8 | 16 | 32;
              onChange(updated);
            }}
            style={{ width: 100 }}
          />
          </Tooltip>
        </Flex>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {tileCount > 0 ? <div
            ref={sourceViewportRef}
            role="group"
            aria-label={t('tiles.viewAutoTileImage')}
            title={t('tiles.viewInstructionZoom')}
            data-testid="auto-tile-source-view"
            onWheel={handleSourceWheel}
            onPointerDown={handleSourcePointerDown}
            onPointerMove={handleSourcePointerMove}
            onPointerUp={stopSourcePan}
            onPointerCancel={stopSourcePan}
            onAuxClick={event => { if (event.button === 1) event.preventDefault(); }}
            onContextMenu={event => event.preventDefault()}
            style={{ height: 240, minHeight: 240, maxHeight: 240, flex: '0 0 240px', boxSizing: 'border-box', overflow: 'auto', padding: 4, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, background: token.colorBgContainer, cursor: isPanningSource ? 'grabbing' : 'default', touchAction: 'none' }}
          >
            <div style={{ position: 'relative', width: sourceCanvasWidth * sourceScale / 2, height: sourceCanvasHeight * sourceScale / 2 }}>
              <canvas ref={sourceCanvasRef} data-testid="auto-tile-source-image" width={sourceCanvasWidth} height={sourceCanvasHeight} style={{ display: 'block', width: sourceCanvasWidth * sourceScale / 2, height: sourceCanvasHeight * sourceScale / 2, imageRendering: 'pixelated', background: token.colorBgContainer }} />
              {sourceView.showGrid && <svg aria-hidden="true" data-testid="auto-tile-source-grid" viewBox={`0 0 ${sourceCanvasWidth} ${sourceCanvasHeight}`} style={{ position: 'absolute', inset: 0, width: sourceCanvasWidth * sourceScale / 2, height: sourceCanvasHeight * sourceScale / 2, pointerEvents: 'none' }}>
                {Array.from({ length: Math.ceil(sourceCanvasWidth / (activeTileSize * 2)) - 1 }, (_, index) => {
                  const position = (index + 1) * activeTileSize * 2;
                  return <line key={`v-${position}`} x1={position} y1={0} x2={position} y2={sourceCanvasHeight} stroke={token.colorBgContainer} strokeWidth={1} vectorEffect="non-scaling-stroke" />;
                })}
                {Array.from({ length: Math.ceil(sourceCanvasHeight / (activeTileSize * 2)) - 1 }, (_, index) => {
                  const position = (index + 1) * activeTileSize * 2;
                  return <line key={`h-${position}`} x1={0} y1={position} x2={sourceCanvasWidth} y2={position} stroke={token.colorBgContainer} strokeWidth={1} vectorEffect="non-scaling-stroke" />;
                })}
              </svg>}
              <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: `repeat(${sourceColumns}, ${activeTileSize * 2 * sourceView.zoom / 100}px)`, gridTemplateRows: `repeat(${sourceRows}, ${activeTileSize * 2 * sourceView.zoom / 100}px)`, width: 'max-content' }}>
              {Array.from({ length: tileCount }, (_, tileIndex) => {
                const selected = normalizedSlots[activeSlot].parts[activePart] === tileIndex;
                return <button
                  key={tileIndex}
                  type="button"
                  aria-label={t('tiles.autoTileSourceTile', { index: tileIndex + 1 })}
                  aria-pressed={selected}
                  onClick={() => setPart(activePart, selected ? null : tileIndex)}
                  style={{
                    width: activeTileSize * 2 * sourceView.zoom / 100,
                    height: activeTileSize * 2 * sourceView.zoom / 100,
                    padding: 0,
                    border: `1px solid ${selected ? token.colorPrimary : token.colorBgContainer}`,
                    outline: selected ? `2px solid ${token.colorPrimary}` : 'none',
                    outlineOffset: -2,
                    background: selected ? `${token.colorPrimary}33` : 'transparent',
                    cursor: 'pointer',
                  }}
                />;
              })}
              </div>
            </div>
          </div> : <Typography.Text type="secondary">{t('tiles.autoTileNoTiles')}</Typography.Text>}
        </Space>
      </Space>
    </AutoTileConfigurationFrame>
  </>;
};

export default TilesetAutoTileView;
