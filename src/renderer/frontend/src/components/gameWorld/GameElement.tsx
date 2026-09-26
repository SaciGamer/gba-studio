import { useDraggable } from '@dnd-kit/core';
import React, { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';

import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { EditOutlined, EyeInvisibleOutlined, PlaySquareTwoTone } from '@ant-design/icons';
import { Button, Tooltip, message } from 'antd';
import { Content } from 'antd/es/layout/layout';
import { AntdToken } from '../common/AntDToken';
import { elementStyle, titleStyle } from './GameElement.styles';
import { joinLocalAssetPath } from '@/utils/localAssetUrl';
import { addCanvasTiles } from '@/utils/tileCount';
import { loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import { loadPaletteLibrary, normalizePalette } from '../resourceEditors/paletteLibrary';
import { clearImageCache, loadCachedImage } from '@/utils/imageCache';
import { clearPaletteTransparentImageCache } from '@/utils/paletteTransparency';
import { fontCharacterWidth, fontGlyphIndex, PREVIEW_FONTS, type PreviewFontId } from '@/utils/fontMetrics';

function drawCamera(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, sceneElement: any) {
  const screenBaseX = 240;
  const screenBaseY = 160;
  
  // Butano treats camera_x/camera_y as the world-space top-left of the
  // 240x160 viewport. Keep the preview in the same coordinate system instead
  // of adding an editor-only center offset.
  const x = Number.isFinite(sceneElement?.cameraPosition?.x)
    ? Number(sceneElement.cameraPosition.x)
    : 0;
  const y = Number.isFinite(sceneElement?.cameraPosition?.y)
    ? Number(sceneElement.cameraPosition.y)
    : 0;

  drawWrappedCamera(ctx, canvas, x, y, screenBaseX, screenBaseY);
  return;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(149, 149, 149, 0.7)";   // cor da borda
  ctx.strokeRect(x, y, screenBaseX, screenBaseY);   // caixa da câmera
  ctx.fillStyle = "rgba(130, 133, 130, 0.3)";     // espessura da linha
  ctx.fillRect(x, y, screenBaseX, screenBaseY);

  // desenhar X dentro da câmera
  ctx.beginPath();
  ctx.moveTo(x, y);                                 // canto superior esquerdo
  ctx.lineTo(screenBaseX + x, screenBaseY + y);     // canto inferior direito
  ctx.moveTo(screenBaseX + x, y);                   // canto superior direito
  ctx.lineTo(x, screenBaseY + y);                   // canto inferior esquerdo
  ctx.stroke();
}

function drawWrappedCamera(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, x: number, y: number, cameraWidth: number, cameraHeight: number) {
  const sceneWidth = canvas.width;
  const sceneHeight = canvas.height;
  if (sceneWidth <= 0 || sceneHeight <= 0) return;
  const wrap = (value: number, size: number) => ((value % size) + size) % size;
  const splitAxis = (start: number, size: number, viewportSize: number) => {
    const parts: Array<{ offset: number; size: number }> = [];
    let offset = wrap(start, size);
    let remaining = viewportSize;
    while (remaining > 0) {
      const partSize = Math.min(remaining, size - offset);
      parts.push({ offset, size: partSize });
      remaining -= partSize;
      offset = 0;
    }
    return parts;
  };
  const horizontal = splitAxis(x, sceneWidth, cameraWidth);
  const vertical = splitAxis(y, sceneHeight, cameraHeight);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(149, 149, 149, 0.7)";
  ctx.fillStyle = "rgba(130, 133, 130, 0.3)";
  vertical.forEach(row => horizontal.forEach(column => {
    const rectX = column.offset;
    const rectY = row.offset;
    ctx.strokeRect(rectX, rectY, column.size, row.size);
    ctx.fillRect(rectX, rectY, column.size, row.size);
  }));
}

function actorBounds(actor: any, grid: number) {
  const width = Math.max(16, actor.width ?? 16);
  const height = Math.max(8, actor.height ?? grid);
  const centered = actor.anchor === 'center';
  return {
    width,
    height,
    left: centered ? actor.x - width / 2 : actor.x,
    top: centered ? actor.y - height / 2 : actor.y,
  };
}

// Actors are 16 px wide by default, so their horizontal anchor advances in
// 16 px columns. Their vertical anchor, triggers, and all dimensions keep the
// native 8×8 tile cadence.
function snapActorX(value: number) {
  return Math.round((value - 8) / 16) * 16 + 8;
}

function snapActorY(value: number) {
  return Math.round((value - 4) / 8) * 8 + 4;
}


interface CameraPreviewRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const getWrappedCameraPreviewRects = (x: number, y: number, sceneWidth: number, sceneHeight: number): CameraPreviewRect[] => {
  const cameraWidth = 240;
  const cameraHeight = 160;
  if (sceneWidth <= 0 || sceneHeight <= 0) return [];

  const wrap = (value: number, size: number) => ((value % size) + size) % size;
  const splitAxis = (start: number, size: number, viewportSize: number) => {
    const parts: Array<{ offset: number; size: number }> = [];
    let offset = wrap(start, size);
    let remaining = viewportSize;
    while (remaining > 0) {
      const partSize = Math.min(remaining, size - offset);
      parts.push({ offset, size: partSize });
      remaining -= partSize;
      offset = 0;
    }
    return parts;
  };

  const horizontal = splitAxis(x, sceneWidth, cameraWidth);
  const vertical = splitAxis(y, sceneHeight, cameraHeight);
  return vertical.flatMap(row => horizontal.map(column => ({
    left: column.offset,
    top: row.offset,
    width: column.size,
    height: row.size,
  })));
};

function collectVariableTextEvents(scripts: any[] = []): any[] {
  return scripts.flatMap(script => [
    ...(script?.command === 'EVENT_DISPLAY_VARIABLE_TEXT' && script?.args?.__comment !== true ? [script] : []),
    ...collectVariableTextEvents(script?.children?.then ?? []),
    ...collectVariableTextEvents(script?.children?.else ?? []),
  ]);
}

interface GameElementProps {
  sceneElement: ISceneSettings;
  isSelected: boolean;
  isSecondarySelected?: boolean;
  isClipboardSource?: boolean;
  onSelect: (scene: ISceneSettings, event?: React.MouseEvent) => void;
  changeScenePreviews?: Array<{ id: string; x: number; y: number; direction: string }>;
  changeScenePreviewLayer?: HTMLElement | null;
  changeScenePreviewOffset?: { x: number; y: number };
  sceneDragOffset?: { x: number; y: number };
  cameraPreviews?: Array<{ id: string; x: number; y: number }>;
  onMoveChangeScenePreview: (eventId: string, targetSceneId: string, x: number, y: number) => void;
  onEditTiles?: (scene: ISceneSettings) => void;
  isDimmed?: boolean;
  selectedObject?: { type: 'actor' | 'trigger'; id: string } | null;
  onSelectObject?: (type: 'actor' | 'trigger', id: string) => void;
  onSceneMouseMove?: (scene: ISceneSettings, col: number, row: number) => void;
  onSceneMouseLeave?: () => void;
  // onElementHovered: (elementHovered: boolean) => void;
}

const GameElement: React.FC<GameElementProps> = ({ sceneElement, isSelected, isSecondarySelected = false, isClipboardSource = false, onSelect, changeScenePreviews = [], changeScenePreviewLayer, changeScenePreviewOffset, sceneDragOffset, cameraPreviews = [], onMoveChangeScenePreview, onEditTiles, isDimmed = false, selectedObject, onSelectObject, onSceneMouseMove, onSceneMouseLeave/*, onElementHovered*/ }) => {
  if (!sceneElement) return null;

  const { token } = AntdToken();
  // State para mouse sobre o elemento
  const [isHovered, setIsHovered] = useState(false);
  const [isEditButtonHovered, setIsEditButtonHovered] = useState(false);
  const [isEditButtonVisible, setIsEditButtonVisible] = useState(false);
  const [triggerStart, setTriggerStart] = useState<{ col: number; row: number } | null>(null);
  const [triggerEnd, setTriggerEnd] = useState<{ col: number; row: number } | null>(null);
  const [areaTool, setAreaTool] = useState<'trigger' | 'collision' | 'erase' | null>(null);
  const [renderedTileCount, setRenderedTileCount] = useState<number | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  // Pointer capture can finish before React publishes the state update from
  // pointerdown. Keep the authoritative drag values in refs so a quick drag
  // always creates its trigger/collision area.
  const triggerStartRef = useRef<{ col: number; row: number } | null>(null);
  const triggerEndRef = useRef<{ col: number; row: number } | null>(null);
  const areaToolRef = useRef<'trigger' | 'collision' | 'erase' | null>(null);
  const collisionSideRef = useRef<'solid' | 'top' | 'down' | 'left' | 'right'>('solid');
  const [draggingObject, setDraggingObject] = useState<{ type: 'actor' | 'trigger'; id: string; offsetX: number; offsetY: number } | null>(null);
  const [dragPreviewPosition, setDragPreviewPosition] = useState<{ x: number; y: number } | null>(null);
  const [resizingTrigger, setResizingTrigger] = useState<{ id: string; edges: string; x: number; y: number; width: number; height: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const tileStrokeRef = useRef<{ tool: 'pencil' | 'square' | 'same'; start: { col: number; row: number }; last: { col: number; row: number }; map: number[][]; initialMap: number[][] } | null>(null);
  const colorizeStrokeRef = useRef<{ last: { col: number; row: number }; paletteMap: Array<Array<string | null>> } | null>(null);
  const [tileStrokePreview, setTileStrokePreview] = useState<{ tool: 'pencil' | 'square'; start: { col: number; row: number }; last: { col: number; row: number } } | null>(null);
  const [tileHover, setTileHover] = useState<{ col: number; row: number } | null>(null);
  const { backgrounds, settingUtils, setSettingUtils, settings, setSettings, setScenes, setElementSelected, userSettings, palettes, spriteResources, variables } = useAppContexts();
  
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(null);
  const [actorSpritePreviews, setActorSpritePreviews] = useState<Record<string, { url: string; width: number; height: number }>>({});
  const [spriteAssetPaths, setSpriteAssetPaths] = useState<Record<string, string>>({});
  const [assetReloadVersion, setAssetReloadVersion] = useState(0);
  const [commonFontImages, setCommonFontImages] = useState<Record<string, string>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingInitialPosition, setDraggingInitialPosition] = useState(false);
  const variableTextEvents = useMemo(() => [
    ...collectVariableTextEvents(sceneElement.script ?? []),
    ...Object.values(sceneElement.eventGraphs ?? {}).flatMap((graph: any) => collectVariableTextEvents(graph?.nodes ?? [])),
  ], [sceneElement.script, sceneElement.eventGraphs]);
  useEffect(() => {
    void Promise.all([window.electronAPI.getCommonFontImages(), window.electronAPI.fetchImages('fonts')]).then(async ([images, fontsResponse]: [Record<string, string>, any]) => {
      const sources = { ...(images ?? {}) };
      const customByFont: Array<[PreviewFontId, string | null | undefined]> = [
        ['fixed8x8', settings?.font8x8Image],
        ['fixed8x16', settings?.font8x16Image],
        ['variable8x8', settings?.font8x8VariablesImage],
        ['variable8x16', settings?.font8x16VariablesImage],
        ['variable16x16', settings?.font16x16VariablesImage],
      ];
      if (fontsResponse?.status === 'success') {
        customByFont.forEach(([font, filename]) => {
          if (filename) sources[PREVIEW_FONTS[font].image] = `${fontsResponse.localPath}/${filename}`;
        });
      }
      const processed = await Promise.all(
        Object.entries(sources).map(async ([name, source]) => {
          const canvas = await loadPaletteTransparentImage(source);
          return [name, canvas?.toDataURL('image/png') ?? source] as const;
        }),
      );

      setCommonFontImages(Object.fromEntries(processed));
    }).catch(() => undefined);
  }, [settings?.font8x8Image, settings?.font8x16Image, settings?.font8x8VariablesImage, settings?.font8x16VariablesImage, settings?.font16x16VariablesImage]);
  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.fetchImages?.('sprites').then((data: any) => {
      if (cancelled || data?.status !== 'success') return;
      const paths = Object.fromEntries((data.fileImages ?? []).map((filename: string) => [filename.replace(/\.[^/.]+$/, ''), joinLocalAssetPath(data.localPath, filename)]));
      setSpriteAssetPaths(paths);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const previews: Record<string, { url: string; width: number; height: number }> = {};
    const jobs = (sceneElement.actors ?? []).map(async (actor: any) => {
      const sprite = spriteResources.find((item: any) => item.id === actor.spriteId) as any;
      if (!sprite) return;
      const direction = actor.direction ?? 'right';
      const state = (sprite.playerAnimationStates ?? []).find((item: any) => item.id === actor.animationStateId)
        ?? (sprite.playerAnimationStates ?? [])[0];
      const animations = state?.animations ?? [];
      const directionalIdle = animations.find((item: any) => item.id === `idle-${direction}` && item.canvasFrames?.length);
      const directionalMovement = animations.find((item: any) => item.id === `moving-${direction}` && item.canvasFrames?.length);
      const fallback = animations.find((item: any) => item.id === 'idle' && item.canvasFrames?.length)
        ?? animations.find((item: any) => item.canvasFrames?.length)
        ?? animations[0];
      const animation = directionalIdle ?? directionalMovement ?? fallback;
      const frame = animation?.canvasFrames?.[0];
      const spriteFilename = sprite.filename ?? sprite.name;
      const sourceUrl = spriteAssetPaths[actor.spriteId ?? ''] ?? (spriteFilename ? joinLocalAssetPath(settingUtils.localImagePath, spriteFilename) : undefined);
      if (!sourceUrl || !frame) return;
      const sourceCanvas = await loadPaletteTransparentImage(sourceUrl);
      if (!sourceCanvas) return;
      const canvas = document.createElement('canvas');
      canvas.width = frame.width;
      canvas.height = frame.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = false;
      const shouldFlip = direction === 'left' && animation?.id === 'idle-right' && state?.flipRightToCreateLeftFacingFrames;
      if (shouldFlip) {
        context.save();
        context.translate(canvas.width, 0);
        context.scale(-1, 1);
      }
      (frame.pieces ?? []).forEach((piece: any) => context.drawImage(sourceCanvas, piece.sourceX, piece.sourceY, piece.width, piece.height, piece.x, piece.y, piece.width, piece.height));
      if (shouldFlip) context.restore();
      previews[actor.id] = { url: canvas.toDataURL('image/png'), width: frame.width, height: frame.height };
    });
    Promise.all(jobs).then(() => { if (!cancelled) setActorSpritePreviews(previews); });
    return () => { cancelled = true; };
  }, [sceneElement.actors, settingUtils.localImagePath, spriteAssetPaths, spriteResources]);
// Layer 4 is editor-only: it holds the scene's interactive components rather
// than tile data. Tile layers remain 0–3.
const EVENTS_LAYER_ID = 4;
const editingLayerId = settingUtils.tileEditSceneId === sceneElement.id ? (settingUtils.tileEditLayerId ?? 2) : (settingUtils.tileEditLayerId ?? sceneElement.backgrounds?.[0]?.layerId ?? 0);
  const isEventsLayer = settingUtils.tileEditSceneId === sceneElement.id && editingLayerId === EVENTS_LAYER_ID;
  const isTileEditingScene = settingUtils.tileEditSceneId === sceneElement.id;
  const shouldDimInactiveLayers = isTileEditingScene && !isEventsLayer;
  const editingLayer = sceneElement.backgrounds?.find(layer => layer.layerId === editingLayerId);
  // Legacy scene tile maps are still read so existing projects remain editable,
  // while all newly-painted data is persisted on the selected background layer.
  const editingTileMap = isEventsLayer ? undefined : editingLayer?.tileMap ?? sceneElement.tileMap;
  // A shared background contributes its tile data once, not once per layer.
  // Tile maps also reuse the same tileset entry across every placement.
  const uniqueTileKeys = new Set<string>();
  (sceneElement.backgrounds ?? []).forEach(layer => {
    const background = backgrounds.find(item => !item._deleted && item.id === layer.backgroundId);
    if (background?.id) {
      const columns = Math.ceil((background.imageWidth ?? 0) / 8);
      const rows = Math.ceil((background.imageHeight ?? 0) / 8);
      for (let index = 0; index < columns * rows; index += 1) uniqueTileKeys.add(`background:${background.id}:${index}`);
    }
    layer.tileMap?.forEach(row => row.forEach(tile => {
      if (Number.isInteger(tile) && tile >= 0) uniqueTileKeys.add(`tileset:${layer.selectedTilesetId ?? sceneElement.selectedTilesetId ?? 'none'}:${tile}`);
    }));
  });
  const layerTileCount = renderedTileCount ?? uniqueTileKeys.size;
  const hasInitialPlayer = settings?.startSceneId === sceneElement.id && Boolean(settings?.playerSpriteId);
  const actorCount = (sceneElement.actors?.length ?? 0) + (hasInitialPlayer ? 1 : 0);
  const triggerCount = sceneElement.triggers?.length ?? 0;
  const counterStyle = (value: number, limit: number): CSSProperties => ({
    padding: '1px 5px',
    borderRadius: token.borderRadiusSM,
    background: value > limit ? token.colorErrorBg : value === limit ? token.colorWarningBg : 'transparent',
    color: value > limit ? token.colorErrorText : undefined,
  });
  const limitMessage = (label: string, value: number, limit: number) => {
    if (value > limit) return `${label}: ${value} de ${limit}. O limite foi ultrapassado; remova recursos antes de preparar o build.`;
    if (value === limit) return `${label}: ${value} de ${limit}. Limite atingido; não é possível adicionar mais recursos.`;
    return `${label}: ${value} de ${limit}.`;
  };
  const [draggingChangeScenePreviewId, setDraggingChangeScenePreviewId] = useState<string | null>(null);

  // The scene title fades to its selected color over 300ms. Keep the edit
  // tab out of view until that transition has completed so it does not flash
  // ahead of the selection feedback.
  useEffect(() => {
    if (!isSelected) {
      setIsEditButtonVisible(false);
      setIsEditButtonHovered(false);
      return;
    }
    const timer = window.setTimeout(() => setIsEditButtonVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, [isSelected]);

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: sceneElement.id,
    data: sceneElement,
  });

  // Load tileset image when tileset is selected
  useEffect(() => {
    const reloadAssets = () => {
      clearImageCache();
      clearPaletteTransparentImageCache();
      setTilesetImage(null);
      setAssetReloadVersion(version => version + 1);
    };
    window.electronAPI?.on?.('reload-assets', reloadAssets);
    return () => window.electronAPI?.removeListener?.('reload-assets', reloadAssets);
  }, []);

  useEffect(() => {
    const loadTilesetImage = async () => {
      const selectedTilesetId = editingLayer?.selectedTilesetId ?? sceneElement.selectedTilesetId;
      if (selectedTilesetId) {
        try {
          const tilesetData = await window.electronAPI.fetchImages('tilesets');
          if (tilesetData.status === 'success' && tilesetData.fileImages) {
            const selectedTilesetFile = tilesetData.fileImages.find((filename: string) =>
              filename.replace(/\.[^/.]+$/, '') === selectedTilesetId
            );
            if (selectedTilesetFile) {
              const imagePath = joinLocalAssetPath(tilesetData.localPath, selectedTilesetFile);
              loadCachedImage(imagePath).then(setTilesetImage);
            }
          }
        } catch (error) {
          console.error('Error loading tileset image:', error);
          setTilesetImage(null);
        }
      } else {
        setTilesetImage(null);
      }
    };

    loadTilesetImage();
  }, [editingLayer?.selectedTilesetId, sceneElement.selectedTilesetId, assetReloadVersion]);

  // Render elementos
  useEffect(() => {
    setImageLoading(true);
    // Image decoding and palette conversion are asynchronous. If the layer or
    // its palette changes meanwhile, an older request must not redraw the
    // canvas over the newer palette preview.
    let cancelled = false;
    // CANVAS
    let canvas = canvasRef.current;

    if (!canvas) {
      // cria um novo canvas se não existir
      canvas = document.createElement("canvas");
      canvas.width = 0;
      canvas.height = 0;
      // opcional: anexar ao DOM se precisar visualizar
      document.body.appendChild(canvas);
    }

    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    // limpa a cena
    // pega a maior largura e altura entre todas as imagens
    let maxWidth = sceneElement.width;
    let maxHeight = sceneElement.height;

    canvas.width = maxWidth;
    canvas.height = maxHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Desliga o filtro de suavização
    ctx.imageSmoothingEnabled = false;
    // CANVAS END
    
    // TILES Variaveis para calcular tiles
    if ((sceneElement.sceneType === ETypeScene.LOGO || sceneElement.sceneType === ETypeScene.POINTNCLICK) && sceneElement.tileMap && tilesetImage) {
      const tileWidth = 16;
      const tileHeight = 16;
      const tilesPerRow = Math.floor(tilesetImage.naturalWidth / tileWidth);

      // canvas.width = sceneElement.tileMap[0]?.length * tileWidth || 240;
      // canvas.height = sceneElement.tileMap.length * tileHeight || 160;

      // Render each tile
      sceneElement.tileMap.forEach((row: number[], rowIndex: number) => {
        row.forEach((tileIndex: number, colIndex: number) => {
          if (tileIndex >= 0) {
            const sourceX = (tileIndex % tilesPerRow) * tileWidth;
            const sourceY = Math.floor(tileIndex / tilesPerRow) * tileHeight;
            const destX = colIndex * tileWidth;
            const destY = rowIndex * tileHeight;

            ctx.drawImage(
              tilesetImage,
              sourceX, sourceY, tileWidth, tileHeight,
              destX, destY, tileWidth, tileHeight
            );
          }
        });
      });
    } 
    // TILES END

    // BACKGROUNDS desenha: pré-carregar todas
    // sceneElement.backgrounds?.sort((a, b) => a.layerId - b.layerId).forEach(lbg => {
    //   const bgData = backgrounds.find(b => !b._deleted && b.id === lbg.backgroundId);
    //   if (bgData) {
    //     const img = new Image();
    //     img.src = `${bgData.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath}/${bgData.filename}`;
    //     img.onload = () => {
    //       // centralizar
    //       const x = (canvas.width - img.width) / 2;
    //       const y = (canvas.height - img.height) / 2;
    //       ctx.drawImage(img, x, y);
    //     };
    //   }
    // });
    const bgPromises = (sceneElement.backgrounds || []).sort((a, b) => a.layerId - b.layerId).map(lbg => {
      const bgData = backgrounds.find(b => !b._deleted && b.id === lbg.backgroundId);
      if (!bgData) return null;

      const availablePalettes = palettes.palettes.length ? palettes.palettes : loadPaletteLibrary();
      // normalizePalette always provides the 16 GBA entries. Only picker thumbnails
      // deliberately use a slice of eight colors.
      const paletteColors = normalizePalette(availablePalettes.find(palette => palette.id === lbg.paletteId) ?? {})?.colors;
      const sourcePath = joinLocalAssetPath(
        bgData.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath,
        bgData.filename,
      );
      return Promise.all([
        loadPaletteTransparentImage(sourcePath, paletteColors),
        // Tile memory stores palette indexes, not their displayed RGB values.
        // Keep a palette-neutral image exclusively for the distinct-tile count.
        loadPaletteTransparentImage(sourcePath),
      ]).then(([image, counterImage]) => ({
        image,
        counterImage: counterImage ?? image,
        layerId: lbg.layerId,
        x: Number(lbg.x) || 0,
        y: Number(lbg.y) || 0,
        sourcePath,
        visible: !userSettings.hiddenBackgroundLayers?.includes(`${sceneElement.id}:${lbg.layerId}`),
      }));
    }).filter((image): image is Promise<{ image: HTMLCanvasElement | null; counterImage: HTMLCanvasElement | null; layerId: number; x: number; y: number; sourcePath: string; visible: boolean }> => image !== null);

    // BACKGROUNDS END

    Promise.all(bgPromises).then(async images => {
      if (cancelled) return;
      const renderedTileKeys = new Set<string>();
      let editedLayerTileCanvas: HTMLCanvasElement | null = null;
      const availablePalettes = palettes.palettes.length ? palettes.palettes : loadPaletteLibrary();
      // Colorize is also valid for a source background with no TileSet. Build
      // a temporary overlay from palette-remapped copies of that source; the
      // original asset remains untouched and the same recipe is materialized
      // into a derived image by AssetBuilder during the build.
      const colorizedBackgroundOverlays = new Map<number, HTMLCanvasElement>();
      await Promise.all(images.map(async imageData => {
        const layer = sceneElement.backgrounds?.find(item => item.layerId === imageData.layerId);
        const paletteIds = new Set((layer?.tilePaletteIds ?? []).flat().filter((id): id is string => Boolean(id) && id !== '__original__'));
        if (!layer || !paletteIds.size || !imageData.image) return;
        const paletteImages = new Map<string, HTMLCanvasElement>();
        await Promise.all([...paletteIds].map(async paletteId => {
          const palette = normalizePalette(availablePalettes.find(item => item.id === paletteId) ?? {});
          const paletteImage = palette ? await loadPaletteTransparentImage(imageData.sourcePath, palette.colors) : null;
          if (paletteImage) paletteImages.set(paletteId, paletteImage);
        }));
        if (cancelled) return;
        const overlay = document.createElement('canvas');
        overlay.width = canvas.width;
        overlay.height = canvas.height;
        const overlayContext = overlay.getContext('2d');
        if (!overlayContext) return;
        const grid = sceneElement.gridSize ?? 8;
        const offsetX = imageData.x;
        const offsetY = imageData.y;
        layer.tilePaletteIds?.forEach((row, rowIndex) => row.forEach((paletteId, colIndex) => {
          if (!paletteId || paletteId === '__original__') return;
          const paletteImage = paletteImages.get(paletteId);
          if (!paletteImage) return;
          overlayContext.drawImage(paletteImage, colIndex * grid, rowIndex * grid, grid, grid, imageData.x + colIndex * grid, imageData.y + rowIndex * grid, grid, grid);
        }));
        colorizedBackgroundOverlays.set(layer.layerId, overlay);
      }));
      // Count the palette banks still required by the original pixels. This
      // is the same `unique colors / 16` rule used by Change Palette, but it
      // excludes cells fully replaced by Colorize. Thus recoloring an entire
      // layer with one palette genuinely releases its original banks.
      const grid = sceneElement.gridSize ?? 8;
      let originalSlots = 0;
      images.forEach(imageData => {
        const layer = sceneElement.backgrounds?.find(item => item.layerId === imageData.layerId);
        const source = imageData.counterImage;
        if (!layer || !source) return;
        const context = source.getContext('2d');
        if (!context) return;
        const colors = new Set<string>();
        const offsetX = imageData.x;
        const offsetY = imageData.y;
        const pixels = context.getImageData(0, 0, source.width, source.height).data;
        for (let pixel = 0; pixel < pixels.length; pixel += 4) {
          if (pixels[pixel + 3] === 0) continue;
          const sourcePixel = pixel / 4;
          const sourceX = sourcePixel % source.width;
          const sourceY = Math.floor(sourcePixel / source.width);
          const row = Math.floor((sourceY + offsetY) / grid);
          const col = Math.floor((sourceX + offsetX) / grid);
          const paletteId = layer.tilePaletteIds?.[row]?.[col];
          if (paletteId && paletteId !== '__original__') continue;
          colors.add(`${pixels[pixel]},${pixels[pixel + 1]},${pixels[pixel + 2]}`);
        }
        originalSlots += Math.ceil(colors.size / 16);
      });
      const colorizePaletteIds = [...new Set((sceneElement.backgrounds ?? [])
        .flatMap(layer => layer.tilePaletteIds ?? [])
        .flat()
        .filter((paletteId): paletteId is string => Boolean(paletteId) && paletteId !== '__original__'))];
      const usedSlots = originalSlots + colorizePaletteIds.length;
      if (settingUtils.tileEditSceneId === sceneElement.id) {
        setSettingUtils(previous => {
          const current = previous.colorizePaletteUsage;
          if (current?.sceneId === sceneElement.id && current.originalSlots === originalSlots && current.usedSlots === usedSlots && current.colorizePaletteIds.join('|') === colorizePaletteIds.join('|')) return previous;
          return { ...previous, colorizePaletteUsage: { sceneId: sceneElement.id, originalSlots, colorizePaletteIds, usedSlots } };
        });
      }
      const nonEditingTileLayers = (sceneElement.backgrounds ?? [])
        .filter(layer => layer.layerId !== editingLayerId && layer.tileMap?.some(row => row.some(tile => tile >= 0)))
        .sort((left, right) => left.layerId - right.layerId);
      const nonEditingMapLayerIds = new Set(nonEditingTileLayers.map(layer => layer.layerId));
      images.forEach(({ image, counterImage, layerId, x, y, visible }) => {
        if (!image) return;
        // The selected layer's map overwrites pixels in its source image. Count
        // that composed result below instead of adding the source and paint
        // tiles separately (which would over-count a replaced tile).
        if(layerId === editingLayerId && editingTileMap) {
          editedLayerTileCanvas = document.createElement('canvas');
          editedLayerTileCanvas.width = canvas.width;
          editedLayerTileCanvas.height = canvas.height;
          const counterContext = editedLayerTileCanvas.getContext('2d');
          if(counterImage) counterContext?.drawImage(counterImage, x, y);
        } else if(!nonEditingMapLayerIds.has(layerId)) {
          addCanvasTiles(counterImage ?? image, renderedTileKeys);
        }
        if (!visible) return;
        const drawX = x;
        const drawY = y;
        // Keep the active layer crisp and retain the other layers as a muted
        // context instead of constantly hiding/reloading them during editing.
        ctx.save();
        ctx.globalAlpha = shouldDimInactiveLayers && layerId !== editingLayerId ? .26 : 1;
        ctx.drawImage(image, drawX, drawY);
        const colorizedOverlay = colorizedBackgroundOverlays.get(layerId);
        if (colorizedOverlay) ctx.drawImage(colorizedOverlay, 0, 0);
        ctx.restore();
        if (shouldDimInactiveLayers && layerId !== editingLayerId) {
          ctx.fillStyle = 'rgba(0, 0, 0, .18)';
          ctx.fillRect(drawX, drawY, image.width, image.height);
        }
      });

      // Every layer keeps its own tile-map recipe. Render the maps that are
      // not being edited as dimmed overlays too, so changing layers never
      // makes the previous paint disappear from the World canvas.
      if(nonEditingTileLayers.length > 0) {
        try {
          const tilesetData = await window.electronAPI.fetchImages('tilesets');
          const tilePaths = new Map<string, string>();
          for(const filename of tilesetData?.fileImages ?? []) {
            tilePaths.set(filename.replace(/\.[^/.]+$/, ''), joinLocalAssetPath(tilesetData.localPath, filename));
          }
          const loadedTilesets = new Map<string, HTMLImageElement>();
          await Promise.all(nonEditingTileLayers.map(async layer => {
            const id = layer.selectedTilesetId ?? sceneElement.selectedTilesetId;
            if(!id || loadedTilesets.has(id) || !tilePaths.get(id)) return;
            const image = await loadCachedImage(tilePaths.get(id)!);
            if (image) loadedTilesets.set(id, image);
          }));
          const grid = sceneElement.gridSize ?? 8;
          const availablePalettes = palettes.palettes.length ? palettes.palettes : loadPaletteLibrary();
          for (const layer of nonEditingTileLayers) {
            const tileset = loadedTilesets.get(layer.selectedTilesetId ?? sceneElement.selectedTilesetId ?? '');
            const source = images.find(image => image.layerId === layer.layerId)?.counterImage;
            if(!tileset) {
              if(source) addCanvasTiles(source, renderedTileKeys);
              return;
            }
            const overlay = document.createElement('canvas');
            overlay.width = canvas.width;
            overlay.height = canvas.height;
            const overlayContext = overlay.getContext('2d');
            if(!overlayContext) return;
            const tilesPerRow = Math.max(1, Math.floor(tileset.naturalWidth / grid));
            const layerPosition = images.find(image => image.layerId === layer.layerId);
            const layerX = layerPosition?.x ?? (Number(layer.x) || 0);
            const layerY = layerPosition?.y ?? (Number(layer.y) || 0);
            const paletteImages = new Map<string, HTMLCanvasElement>();
            const paletteIds = new Set((layer.tilePaletteIds ?? []).flat().filter((id): id is string => Boolean(id) && id !== '__original__'));
            // Palette transforms are generated per layer, so the combined
            // scene preview shows colorized inactive layers as well.
            await Promise.all([...paletteIds].map(async paletteId => {
              const palette = normalizePalette(availablePalettes.find(item => item.id === paletteId) ?? {});
              const image = palette ? await loadPaletteTransparentImage(tileset.src, palette.colors) : null;
              if (image) paletteImages.set(paletteId, image);
            }));
            layer.tileMap?.forEach((row, rowIndex) => row.forEach((tileIndex, colIndex) => {
              if(tileIndex < 0) return;
              const storedPaletteId = layer.tilePaletteIds?.[rowIndex]?.[colIndex];
              const sourceTileset = storedPaletteId && storedPaletteId !== '__original__' ? (paletteImages.get(storedPaletteId) ?? tileset) : tileset;
              overlayContext.drawImage(sourceTileset, (tileIndex % tilesPerRow) * grid, Math.floor(tileIndex / tilesPerRow) * grid, grid, grid, layerX + colIndex * grid, layerY + rowIndex * grid, grid, grid);
            }));
            // Count the same composition that the build pipeline receives,
            // before the dimming-only preview treatment is applied.
            const composedLayer = document.createElement('canvas');
            composedLayer.width = canvas.width;
            composedLayer.height = canvas.height;
            const composedContext = composedLayer.getContext('2d');
            if(source) {
              const sourceImage = images.find(image => image.layerId === layer.layerId);
              composedContext?.drawImage(source, sourceImage?.x ?? 0, sourceImage?.y ?? 0);
            }
            composedContext?.drawImage(overlay, 0, 0);
            addCanvasTiles(composedLayer, renderedTileKeys);
            if (shouldDimInactiveLayers) {
              overlayContext.globalCompositeOperation = 'source-atop';
              overlayContext.fillStyle = 'rgba(0, 0, 0, .18)';
              overlayContext.fillRect(0, 0, overlay.width, overlay.height);
            }
            ctx.save();
            ctx.globalAlpha = shouldDimInactiveLayers ? .26 : 1;
            ctx.drawImage(overlay, 0, 0);
            ctx.restore();
          }
        } catch (error) {
          images.forEach(({ image, counterImage, layerId }) => {
            if(image && nonEditingMapLayerIds.has(layerId)) addCanvasTiles(counterImage ?? image, renderedTileKeys);
          });
          console.warn('Unable to render inactive layer tile maps:', error);
        }
      }

      // A layer tile map is an edit recipe, not a saved image. The same recipe
      // is replayed here and later by the build pipeline.
      if (editingTileMap && tilesetImage) {
        const grid = sceneElement.gridSize ?? 8;
        const tilesPerRow = Math.max(1, Math.floor(tilesetImage.naturalWidth / grid));
        const availablePalettes = palettes.palettes.length ? palettes.palettes : loadPaletteLibrary();
        const defaultPaletteId = Array.isArray(settings?.paletteIds)
          ? settings.paletteIds.find((paletteId): paletteId is string => typeof paletteId === 'string')
          : undefined;
        const paletteIds = new Set<string>();
        if (defaultPaletteId) paletteIds.add(defaultPaletteId);
        editingLayer?.tilePaletteIds?.forEach(mapRow => mapRow.forEach(paletteId => {
          if (paletteId && paletteId !== '__original__') paletteIds.add(paletteId);
        }));
        const paletteTilesets = new Map<string, HTMLCanvasElement>();
        await Promise.all([...paletteIds].map(async paletteId => {
          const palette = normalizePalette(availablePalettes.find(item => item.id === paletteId) ?? {});
          if (!palette) return;
          const image = await loadPaletteTransparentImage(tilesetImage.src, palette.colors);
          if (image) paletteTilesets.set(paletteId, image);
        }));
        if (cancelled) return;
        editingTileMap.forEach((mapRow, row) => mapRow.forEach((tileIndex, col) => {
          if (tileIndex < 0) return;
          // Colorize's special erase brush stores an explicit marker so the
          // cell returns to the source tileset palette instead of inheriting
          // the project's default palette.
          const storedPaletteId = editingLayer?.tilePaletteIds?.[row]?.[col];
          const paletteId = storedPaletteId === '__original__' ? undefined : (storedPaletteId ?? defaultPaletteId);
          const tileSource = paletteId ? paletteTilesets.get(paletteId) ?? tilesetImage : tilesetImage;
          if(!editedLayerTileCanvas) {
            editedLayerTileCanvas = document.createElement('canvas');
            editedLayerTileCanvas.width = canvas.width;
            editedLayerTileCanvas.height = canvas.height;
          }
          const layerX = editingLayer?.x ?? 0;
          const layerY = editingLayer?.y ?? 0;
          editedLayerTileCanvas.getContext('2d')?.drawImage(tilesetImage, (tileIndex % tilesPerRow) * grid, Math.floor(tileIndex / tilesPerRow) * grid, grid, grid, layerX + col * grid, layerY + row * grid, grid, grid);
          ctx.drawImage(tileSource, (tileIndex % tilesPerRow) * grid, Math.floor(tileIndex / tilesPerRow) * grid, grid, grid, layerX + col * grid, layerY + row * grid, grid, grid);
        }));
      }
      if(editedLayerTileCanvas) addCanvasTiles(editedLayerTileCanvas, renderedTileKeys);
      if(!cancelled) setRenderedTileCount(renderedTileKeys.size);

      if (settingUtils.tileEditSceneId === sceneElement.id && !userSettings.hiddenTileGridSceneIds?.includes(sceneElement.id)) {
        const grid = sceneElement.gridSize ?? 8;
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, .42)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= canvas.width; x += grid) {
          ctx.moveTo(x + .5, 0);
          ctx.lineTo(x + .5, canvas.height);
        }
        for (let y = 0; y <= canvas.height; y += grid) {
          ctx.moveTo(0, y + .5);
          ctx.lineTo(canvas.width, y + .5);
        }
        ctx.stroke();
      }
    
      // Scene events are an editor-only layer and must not cover tile layers.
      if (isEventsLayer) {
        sceneElement.collisions?.forEach(c => {
          ctx.fillStyle = "rgba(255,0,0,0.3)";
          ctx.fillRect(c.x, c.y, c.width, c.height);
        });
        sceneElement.triggers?.forEach(t => {
          ctx.strokeStyle = "rgba(0,255,0,0.5)";
          ctx.strokeRect(t.x, t.y, t.width, t.height);
        });
      }
      // TRIGGERS END

      // CAMERA desenhar por cima de todas as camadas
      if (sceneElement?.showCamera && !isTileEditingScene) {
        drawCamera(ctx, canvas, sceneElement);
      }
      // CAMERA END
      if (!cancelled) setImageLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sceneElement.showCamera, sceneElement.sceneType, sceneElement.cameraPosition?.x, sceneElement.cameraPosition?.y, editingTileMap, editingLayerId, isEventsLayer, sceneElement.gridSize, sceneElement.triggers, sceneElement.actors, sceneElement.collisions, tilesetImage, assetReloadVersion, sceneElement.width, sceneElement.height, sceneElement.backgrounds, backgrounds, palettes.palettes, settings?.paletteIds, settingUtils.tileEditSceneId, settingUtils.localImagePath, settingUtils.localImagePathHD, userSettings.hiddenBackgroundLayers, userSettings.hiddenTileGridSceneIds]);

  const computedElementStyle: CSSProperties = elementStyle(
    transform,
    sceneElement.x,
    sceneElement.y,
    isSelected
  );

  const computedTitleStyle: CSSProperties = titleStyle(isSelected, isHovered, token);
  const hiddenLayerCount = (sceneElement.backgrounds ?? []).filter((layer: any) => userSettings.hiddenBackgroundLayers?.includes(`${sceneElement.id}:${layer.layerId}`)).length;
  const displayedElementStyle: CSSProperties = {
    ...computedElementStyle,
    // Scene movement is snapped in GameWorld coordinates. Prefer that shared
    // preview over DnD's raw viewport-pixel transform so the card, arrival
    // marker and trace all use exactly the same position at every zoom.
    transform: sceneDragOffset ? `translate3d(${sceneDragOffset.x}px, ${sceneDragOffset.y}px, 0)` : computedElementStyle.transform,
  };

  const handleMoveInitialPlayerPosition = (e:any) => {
    if (!draggingInitialPosition) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scale = userSettings.zoom / 100 || 1;

    let x = Math.floor(((e.clientX - rect.left) / scale) / 16); // tile X
    let y = Math.floor(((e.clientY - rect.top) / scale) / 16);  // tile Y

    // limita dentro do grid
    const maxX = Math.floor((rect.width / scale) / 16) - 2;
    const maxY = Math.floor((rect.height / scale) / 16) - 2;

    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));

    // dispara atualização para settings
    setSettings(prev => ({...prev, startX: x, startY: y }));
  };

  const getRotation = (direction: string): number => {
    switch (direction) {
      case 'up': return -90;
      case 'down': return 90;
      case 'left': return 180;
      case 'right': return 0;
      default: return 0;
    }
  };

  useEffect(() => {
    if (!draggingInitialPosition) return;

    const handleMouseMove = (event: MouseEvent) => {
      const canvas = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLCanvasElement>('canvas[data-scene-id]');
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const maxX = Math.max(0, Math.floor(canvas.width / 16) - 2);
      const maxY = Math.max(0, Math.floor(canvas.height / 16) - 2);
      const x = Math.max(0, Math.min(Math.floor(((event.clientX - rect.left) / rect.width * canvas.width) / 16), maxX));
      const y = Math.max(0, Math.min(Math.floor(((event.clientY - rect.top) / rect.height * canvas.height) / 16), maxY));
      setSettings(previous => ({ ...previous, startSceneId: canvas.dataset.sceneId || previous.startSceneId, startX: x, startY: y, _saved: false }));
    };
    const stopDragging = () => setDraggingInitialPosition(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDragging);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDragging);
    };
  }, [draggingInitialPosition]);

  useEffect(() => {
    if(!draggingChangeScenePreviewId) return;

    const handleMouseMove = (event: MouseEvent) => {
      const canvas = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLCanvasElement>('canvas[data-scene-id]');
      if(!canvas) return;

      const rect = canvas.getBoundingClientRect();
      if(!rect.width || !rect.height) return;
      const maxX = Math.max(0, Math.floor(canvas.width / 16) - 2);
      const maxY = Math.max(0, Math.floor(canvas.height / 16) - 2);
      const x = Math.max(0, Math.min(Math.floor(((event.clientX - rect.left) / rect.width * canvas.width) / 16), maxX));
      const y = Math.max(0, Math.min(Math.floor(((event.clientY - rect.top) / rect.height * canvas.height) / 16), maxY));
      onMoveChangeScenePreview(draggingChangeScenePreviewId, canvas.dataset.sceneId || sceneElement.id, x, y);
    };
    const stopDragging = () => setDraggingChangeScenePreviewId(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopDragging);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopDragging);
    };
  }, [draggingChangeScenePreviewId, onMoveChangeScenePreview, sceneElement.id]);

  const handleHovered = (isHovered: boolean) => {
    setIsHovered(isHovered)
    // onElementHovered(isHovered)
  }

  const paintTiles = (col: number, row: number) => {
    const stroke = tileStrokeRef.current;
    if (!stroke) return;
    const grid = sceneElement.gridSize ?? 8;
    const columns = Math.max(1, Math.ceil(sceneElement.width / grid));
    const rows = Math.max(1, Math.ceil(sceneElement.height / grid));
    if (stroke.last.col === col && stroke.last.row === row) return;
    const selectedTiles = editingLayer?.selectedTiles ?? sceneElement.selectedTiles ?? [];
    if (!selectedTiles.length) return;
    const tilesPerRow = Math.max(1, Math.floor((tilesetImage?.naturalWidth ?? grid) / grid));
    const selectedPositions = selectedTiles.map(tile => ({ tile, col: tile % tilesPerRow, row: Math.floor(tile / tilesPerRow) }));
    const minSelectedCol = Math.min(...selectedPositions.map(tile => tile.col));
    const maxSelectedCol = Math.max(...selectedPositions.map(tile => tile.col));
    const minSelectedRow = Math.min(...selectedPositions.map(tile => tile.row));
    const maxSelectedRow = Math.max(...selectedPositions.map(tile => tile.row));
    const selection = new Map(selectedPositions.map(tile => [`${tile.col - minSelectedCol}:${tile.row - minSelectedRow}`, tile.tile]));
    const selectionWidth = maxSelectedCol - minSelectedCol + 1;
    const selectionHeight = maxSelectedRow - minSelectedRow + 1;
    // Pencil stamps the complete tile-picker selection at the cursor. Square
    // keeps tiling that same selection over its dragged rectangle.
    const left = stroke.tool === 'square' ? Math.min(stroke.start.col, col) : col;
    const right = stroke.tool === 'square' ? Math.max(stroke.start.col, col) : Math.min(columns - 1, col + selectionWidth - 1);
    const top = stroke.tool === 'square' ? Math.min(stroke.start.row, row) : row;
    const bottom = stroke.tool === 'square' ? Math.max(stroke.start.row, row) : Math.min(rows - 1, row + selectionHeight - 1);
    const source = stroke.tool === 'square' ? stroke.initialMap : stroke.map;
    const map = source.map(line => [...line]);
    for (let targetRow = top; targetRow <= bottom; targetRow += 1) {
      for (let targetCol = left; targetCol <= right; targetCol += 1) {
        const tile = selection.get(`${(targetCol - left) % selectionWidth}:${(targetRow - top) % selectionHeight}`);
        if (tile !== undefined && targetRow < rows && targetCol < columns) map[targetRow][targetCol] = tile;
      }
    }
    stroke.map = map;
    stroke.last = { col, row };
    setTileStrokePreview({ tool: stroke.tool === 'square' ? 'square' : 'pencil', start: stroke.start, last: stroke.last });
  };

  const matchingCells = (col: number, row: number) => {
    const grid = sceneElement.gridSize ?? 8;
    const columns = Math.max(1, Math.ceil(sceneElement.width / grid));
    const rows = Math.max(1, Math.ceil(sceneElement.height / grid));
    const targetTile = editingTileMap?.[row]?.[col];
    if (typeof targetTile === 'number' && targetTile >= 0) {
      const matches: Array<{ col: number; row: number }> = [];
      editingTileMap?.forEach((mapRow, mapRowIndex) => mapRow.forEach((tile, mapColIndex) => {
        if (tile === targetTile) matches.push({ col: mapColIndex, row: mapRowIndex });
      }));
      return matches;
    }

    // Without a TileSet, compare the rendered 8×8 source-image regions. It
    // also covers layers whose reference comes from an already painted tile.
    const context = canvasRef.current?.getContext('2d');
    if (!context) return [{ col, row }];
    const target = context.getImageData(col * grid, row * grid, grid, grid).data;
    const equalsTarget = (candidate: Uint8ClampedArray) => {
      for (let index = 0; index < target.length; index += 1) {
        if (target[index] !== candidate[index]) return false;
      }
      return true;
    };
    const matches: Array<{ col: number; row: number }> = [];
    for (let mapRow = 0; mapRow < rows; mapRow += 1) {
      for (let mapCol = 0; mapCol < columns; mapCol += 1) {
        if (equalsTarget(context.getImageData(mapCol * grid, mapRow * grid, grid, grid).data)) matches.push({ col: mapCol, row: mapRow });
      }
    }
    return matches;
  };

  const paintMatchingTiles = (col: number, row: number) => {
    const stroke = tileStrokeRef.current;
    if (!stroke) return;
    const selectedTile = (editingLayer?.selectedTiles ?? sceneElement.selectedTiles ?? [])[0];
    if (!Number.isInteger(selectedTile)) {
      message.warning('Selecione um tile para pintar todas as ocorrências iguais.');
      return;
    }
    matchingCells(col, row).forEach(cell => { stroke.map[cell.row][cell.col] = selectedTile; });
    stroke.last = { col, row };
  };

  const commitTileStroke = () => {
    const stroke = tileStrokeRef.current;
    if (!stroke) return;
    const grid = sceneElement.gridSize ?? 8;
    const columns = Math.max(1, Math.ceil(sceneElement.width / grid));
    const rows = Math.max(1, Math.ceil(sceneElement.height / grid));
    const tilePaletteIds = Array.from({ length: rows }, (_, mapRow) => Array.from({ length: columns }, (_, mapCol) => editingLayer?.tilePaletteIds?.[mapRow]?.[mapCol] ?? null));
    const layerMap = sceneElement.backgrounds?.some(layer => layer.layerId === editingLayerId)
      ? sceneElement.backgrounds.map(layer => layer.layerId === editingLayerId ? { ...layer, tileMap: stroke.map, tilePaletteIds } : layer)
      : [...(sceneElement.backgrounds ?? []), { layerId: editingLayerId, tileMap: stroke.map, tilePaletteIds }];
    const updated = { ...sceneElement, backgrounds: layerMap, tileMap: undefined, _saved: false };
    setElementSelected(updated);
    setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
  };

  const commitColorizeStroke = () => {
    const stroke = colorizeStrokeRef.current;
    if (!stroke) return;
    const layerMap = sceneElement.backgrounds?.some(item => item.layerId === editingLayerId)
      ? sceneElement.backgrounds.map(item => item.layerId === editingLayerId ? { ...item, tilePaletteIds: stroke.paletteMap } : item)
      : [...(sceneElement.backgrounds ?? []), { layerId: editingLayerId, tilePaletteIds: stroke.paletteMap }];
    const updated = { ...sceneElement, backgrounds: layerMap, _saved: false };
    setElementSelected(updated);
    setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
  };

  const paintColorize = (col: number, row: number) => {
    const stroke = colorizeStrokeRef.current;
    if (!stroke || (stroke.last.col === col && stroke.last.row === row)) return;
    const next = stroke.paletteMap.map(line => [...line]);
    const paletteId = editingLayer?.paintPaletteId ?? null;
    if (settingUtils.activeSubButton !== 'subAction2' && !paletteId) {
      message.warning('Selecione uma paleta antes de usar o Colorize.');
      return;
    }
    if (settingUtils.activeSubButton !== 'subAction2' && paletteId) {
      // Regular backgrounds share the GBA's 16 palette banks. A palette used
      // in any layer occupies one shared slot, rather than granting 16 slots
      // to every individual layer.
      const usedPalettes = new Set((sceneElement.backgrounds ?? [])
        .flatMap(layer => layer.tilePaletteIds ?? [])
        .flat()
        .filter(id => id && id !== '__original__'));
      const slotUsage = settingUtils.colorizePaletteUsage?.sceneId === sceneElement.id
        ? settingUtils.colorizePaletteUsage.usedSlots
        : usedPalettes.size;
      if (!usedPalettes.has(paletteId) && slotUsage >= 16) {
        message.warning('O limite compartilhado de 16 paletas desta cena foi atingido.');
        return;
      }
    }
    next[row][col] = settingUtils.activeSubButton === 'subAction2' ? '__original__' : paletteId;
    stroke.paletteMap = next;
    stroke.last = { col, row };
  };

  const editCanvas = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isSelected || settingUtils.tileEditSceneId !== sceneElement.id) return;
    if (event.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const grid = sceneElement.gridSize ?? 8;
    const columns = Math.max(1, Math.ceil(sceneElement.width / grid));
    const rows = Math.max(1, Math.ceil(sceneElement.height / grid));
    const col = Math.max(0, Math.min(columns - 1, Math.floor((event.clientX - rect.left) / rect.width * columns)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor((event.clientY - rect.top) / rect.height * rows)));
    const x = col * grid;
    const y = row * grid;
    const update = (changes: Partial<ISceneSettings>) => {
      const updated = { ...sceneElement, ...changes, _saved: false };
      setElementSelected(updated);
      setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
    };
    const tool = settingUtils.activeButton;
    const subTool = settingUtils.activeSubButton;
    if (tool === 'add' && subTool === 'Actor') {
      if (actorCount >= 128) {
        message.warning('Esta cena já atingiu o limite de 128 sprites, incluindo o Player inicial.');
        return;
      }
      // Actors are anchored at their centre. A 16×8 actor therefore expands
      // evenly around the grid origin rather than drifting right/down.
      const actorId = uuidv4();
      const actor = { id: actorId, actorId, name: `Actor ${(sceneElement.actors?.length ?? 0) + 1}`, x: Math.floor(x / 16) * 16 + 8, y: y + 4, width: 16, height: 8, anchor: 'center', direction: 'right', spriteId: spriteResources[0]?.id };
      update({ actors: [...(sceneElement.actors ?? []), actor] });
      setSettingUtils(previous => ({ ...previous, activeSceneObject: { sceneId: sceneElement.id, type: 'actor', id: actor.id }, activeTriggerId: null }));
      return;
    }
    if (tool === 'add' && subTool === 'Trigger') {
      event.currentTarget.setPointerCapture(event.pointerId);
      triggerStartRef.current = { col, row };
      triggerEndRef.current = { col, row };
      areaToolRef.current = 'trigger';
      setTriggerStart({ col, row });
      setTriggerEnd({ col, row });
      setAreaTool('trigger');
      return;
    }
    const collisionSide = settingUtils.collisionSide ?? 'solid';
    if (isEventsLayer && tool === 'collision' && settingUtils.collisionBrushSize === 'bucket') {
      const third = grid / 3;
      const makeCollision = (targetCol: number, targetRow: number, index: number) => {
        const cellX = targetCol * grid;
        const cellY = targetRow * grid;
        const bounds = collisionSide === 'top' ? { x: cellX, y: cellY, width: grid, height: third }
          : collisionSide === 'down' ? { x: cellX, y: cellY + grid - third, width: grid, height: third }
          : collisionSide === 'left' ? { x: cellX, y: cellY, width: third, height: grid }
          : collisionSide === 'right' ? { x: cellX + grid - third, y: cellY, width: third, height: grid }
          : { x: cellX, y: cellY, width: grid, height: grid };
        return { id: uuidv4(), name: `Collision ${(sceneElement.collisions?.length ?? 0) + index + 1}`, collisionSide, ...bounds };
      };
      const existing = sceneElement.collisions ?? [];
      const cellKey = (targetCol: number, targetRow: number) => `${targetCol}:${targetRow}`;
      const occupied = new Set<string>();
      existing.forEach(collision => {
        const firstCol = Math.max(0, Math.floor(collision.x / grid));
        const lastCol = Math.min(columns - 1, Math.floor((collision.x + collision.width - .001) / grid));
        const firstRow = Math.max(0, Math.floor(collision.y / grid));
        const lastRow = Math.min(rows - 1, Math.floor((collision.y + collision.height - .001) / grid));
        for (let targetRow = firstRow; targetRow <= lastRow; targetRow += 1) {
          for (let targetCol = firstCol; targetCol <= lastCol; targetCol += 1) occupied.add(cellKey(targetCol, targetRow));
        }
      });
      const clickedKey = cellKey(col, row);
      const filled = new Set<string>();
      if (occupied.has(clickedKey)) {
        const pending = [{ col, row }];
        while (pending.length) {
          const current = pending.pop()!;
          const currentKey = cellKey(current.col, current.row);
          if (filled.has(currentKey) || !occupied.has(currentKey)) continue;
          filled.add(currentKey);
          [[current.col - 1, current.row], [current.col + 1, current.row], [current.col, current.row - 1], [current.col, current.row + 1]].forEach(([nextCol, nextRow]) => {
            if (nextCol >= 0 && nextCol < columns && nextRow >= 0 && nextRow < rows) pending.push({ col: nextCol, row: nextRow });
          });
        }
      } else {
        for (let targetRow = 0; targetRow < rows; targetRow += 1) {
          for (let targetCol = 0; targetCol < columns; targetCol += 1) filled.add(cellKey(targetCol, targetRow));
        }
      }
      const intersectsFilledCell = (collision: { x: number; y: number; width: number; height: number }) => {
        const firstCol = Math.max(0, Math.floor(collision.x / grid));
        const lastCol = Math.min(columns - 1, Math.floor((collision.x + collision.width - .001) / grid));
        const firstRow = Math.max(0, Math.floor(collision.y / grid));
        const lastRow = Math.min(rows - 1, Math.floor((collision.y + collision.height - .001) / grid));
        for (let targetRow = firstRow; targetRow <= lastRow; targetRow += 1) {
          for (let targetCol = firstCol; targetCol <= lastCol; targetCol += 1) if (filled.has(cellKey(targetCol, targetRow))) return true;
        }
        return false;
      };
      const filledCells = [...filled].map(key => {
        const [targetCol, targetRow] = key.split(':').map(Number);
        return { col: targetCol, row: targetRow };
      });
      update({ collisions: [...existing.filter(collision => !intersectsFilledCell(collision)), ...filledCells.map((cell, index) => makeCollision(cell.col, cell.row, index))] });
      return;
    }
    if (isEventsLayer && tool === 'collision' && settingUtils.collisionBrushSize !== 'bucket') {
      event.currentTarget.setPointerCapture(event.pointerId);
      triggerStartRef.current = { col, row };
      triggerEndRef.current = { col, row };
      areaToolRef.current = 'collision';
      collisionSideRef.current = collisionSide;
      setTriggerStart({ col, row });
      setTriggerEnd({ col, row });
      setAreaTool('collision');
      return;
    }
    const isPaintTool = !isEventsLayer && tool === 'tiles' && (subTool === 'pencil' || subTool === 'square' || subTool === 'same');
    const isColorizeTool = !isEventsLayer && tool === 'colorize' && (subTool === 'subAction1' || subTool === 'subAction2' || subTool === 'subAction3');
    if (isColorizeTool) {
      if (!tilesetImage && !editingLayer?.backgroundId) {
        message.warning('Selecione um TileSet ou um background nesta layer antes de usar o Colorize.');
        return;
      }
      const paletteMap = Array.from({ length: rows }, (_, mapRow) => Array.from({ length: columns }, (_, mapCol) => editingLayer?.tilePaletteIds?.[mapRow]?.[mapCol] ?? null));
      colorizeStrokeRef.current = { last: { col: -1, row: -1 }, paletteMap };
      if (subTool === 'subAction3') {
        if (!editingLayer?.paintPaletteId) {
          message.warning('Selecione uma paleta antes de usar o Colorize.');
        } else {
          matchingCells(col, row).forEach(cell => paintColorize(cell.col, cell.row));
          commitColorizeStroke();
        }
        colorizeStrokeRef.current = null;
      } else {
        event.currentTarget.setPointerCapture(event.pointerId);
        paintColorize(col, row);
      }
      return;
    }
    if (!isPaintTool && !(tool === 'erase' && subTool === '8px')) return;
    if (isPaintTool) {
      const map = Array.from({ length: rows }, (_, mapRow) => Array.from({ length: columns }, (_, mapCol) => editingTileMap?.[mapRow]?.[mapCol] ?? -1));
      tileStrokeRef.current = { tool: subTool as 'pencil' | 'square' | 'same', start: { col, row }, last: { col: -1, row: -1 }, map, initialMap: map.map(line => [...line]) };
      if (subTool === 'same') {
        paintMatchingTiles(col, row);
        commitTileStroke();
        tileStrokeRef.current = null;
      } else {
        event.currentTarget.setPointerCapture(event.pointerId);
        paintTiles(col, row);
      }
      return;
    }
    // Erase is an area selector. Deletion happens on pointer-up, so every
    // tile and scene component touched by the rectangle is handled together.
    event.currentTarget.setPointerCapture(event.pointerId);
    triggerStartRef.current = { col, row };
    triggerEndRef.current = { col, row };
    areaToolRef.current = 'erase';
    setTriggerStart({ col, row });
    setTriggerEnd({ col, row });
    setAreaTool('erase');
  };

  const updateTriggerDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const grid = sceneElement.gridSize ?? 8;
    const columns = Math.max(1, Math.ceil(sceneElement.width / grid));
    const rows = Math.max(1, Math.ceil(sceneElement.height / grid));
    const col = Math.max(0, Math.min(columns - 1, Math.floor((event.clientX - rect.left) / rect.width * columns)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor((event.clientY - rect.top) / rect.height * rows)));
    onSceneMouseMove?.(sceneElement, col, row);
    if (triggerStartRef.current) {
      triggerEndRef.current = { col, row };
      setTriggerEnd({ col, row });
    }
    setTileHover({ col, row });
    if (tileStrokeRef.current) paintTiles(col, row);
    if (colorizeStrokeRef.current) paintColorize(col, row);
  };

  const finishTriggerDrag = () => {
    if (tileStrokeRef.current) {
      commitTileStroke();
      tileStrokeRef.current = null;
      setTileStrokePreview(null);
      return;
    }
    if (colorizeStrokeRef.current) {
      commitColorizeStroke();
      colorizeStrokeRef.current = null;
      return;
    }
    const start = triggerStartRef.current;
    const end = triggerEndRef.current;
    const tool = areaToolRef.current;
    if (!start || !end || !tool) return;
    const grid = sceneElement.gridSize ?? 8;
    const x = Math.min(start.col, end.col) * grid;
    const y = Math.min(start.row, end.row) * grid;
    const width = (Math.abs(end.col - start.col) + 1) * grid;
    const height = (Math.abs(end.row - start.row) + 1) * grid;
    const intersects = (item: { x: number; y: number; width?: number; height?: number }) =>
      item.x < x + width && item.x + (item.width ?? grid) > x && item.y < y + height && item.y + (item.height ?? grid) > y;
    if (tool === 'erase') {
      const columns = Math.max(1, Math.ceil(sceneElement.width / grid));
      const rows = Math.max(1, Math.ceil(sceneElement.height / grid));
      const map = Array.from({ length: rows }, (_, mapRow) => Array.from({ length: columns }, (_, mapCol) => editingTileMap?.[mapRow]?.[mapCol] ?? -1));
      const tilePaletteIds = Array.from({ length: rows }, (_, mapRow) => Array.from({ length: columns }, (_, mapCol) => editingLayer?.tilePaletteIds?.[mapRow]?.[mapCol] ?? null));
      if (!isEventsLayer) {
        for (let mapRow = Math.min(start.row, end.row); mapRow <= Math.max(start.row, end.row); mapRow += 1) {
          for (let mapCol = Math.min(start.col, end.col); mapCol <= Math.max(start.col, end.col); mapCol += 1) {
            map[mapRow][mapCol] = -1;
            tilePaletteIds[mapRow][mapCol] = null;
          }
        }
      }
      const erasedActorIds = new Set((sceneElement.actors ?? []).filter(actor => {
        const bounds = actorBounds(actor, grid);
        return intersects({ x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height });
      }).map(actor => actor.id));
      const erasedTriggerIds = new Set((sceneElement.triggers ?? []).filter(intersects).map(trigger => trigger.id));
      const layerMap = sceneElement.backgrounds?.some(layer => layer.layerId === editingLayerId)
        ? sceneElement.backgrounds.map(layer => layer.layerId === editingLayerId ? { ...layer, tileMap: map, tilePaletteIds } : layer)
        : [...(sceneElement.backgrounds ?? []), { layerId: editingLayerId, tileMap: map, tilePaletteIds }];
      const updated = {
        ...sceneElement,
        ...(isEventsLayer ? {
          collisions: (sceneElement.collisions ?? []).filter(collision => !intersects(collision)),
          actors: (sceneElement.actors ?? []).filter(actor => !erasedActorIds.has(actor.id)),
          triggers: (sceneElement.triggers ?? []).filter(trigger => !erasedTriggerIds.has(trigger.id)),
          spawnPoints: (sceneElement.spawnPoints ?? []).filter(point => !intersects(point)),
        } : { backgrounds: layerMap, tileMap: undefined }),
        _saved: false,
      };
      setElementSelected(updated);
      setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
      if (isEventsLayer && ((settingUtils.activeSceneObject?.type === 'actor' && erasedActorIds.has(settingUtils.activeSceneObject.id)) ||
          (settingUtils.activeSceneObject?.type === 'trigger' && erasedTriggerIds.has(settingUtils.activeSceneObject.id)))) {
        setSettingUtils(previous => ({ ...previous, activeSceneObject: null, activeTriggerId: null }));
      }
      triggerStartRef.current = null;
      triggerEndRef.current = null;
      areaToolRef.current = null;
      setTriggerStart(null);
      setTriggerEnd(null);
      setAreaTool(null);
      return;
    }
    const trigger = tool === 'trigger'
      ? { id: uuidv4(), sceneId: sceneElement.id, name: `Trigger ${(sceneElement.triggers?.length ?? 0) + 1}`, x, y, width, height, activation: 'enter' as const, enabled: true, once: false, cooldownFrames: 0, script: [], onEnterScript: [], onLeaveScript: [] }
      : null;
    const collisionSide = collisionSideRef.current;
    const third = grid / 3;
    const collisionBounds = collisionSide === 'top' ? { x, y, width, height: third }
      : collisionSide === 'down' ? { x, y: y + height - third, width, height: third }
      : collisionSide === 'left' ? { x, y, width: third, height }
      : collisionSide === 'right' ? { x: x + width - third, y, width: third, height }
      : { x, y, width, height };
    const collision = tool === 'collision'
      ? { id: uuidv4(), name: `Collision ${(sceneElement.collisions?.length ?? 0) + 1}`, collisionSide, ...collisionBounds }
      : null;
    const updated = trigger
      ? { ...sceneElement, triggers: [...(sceneElement.triggers ?? []), trigger], _saved: false }
      : {
        ...sceneElement,
        // A newly painted area owns its space. Remove every previous shape
        // intersecting it before storing the new area.
        collisions: collision
          ? [...(sceneElement.collisions ?? []).filter(existing => !intersects(existing)), collision]
          : sceneElement.collisions,
        _saved: false,
      };
    setElementSelected(updated);
    setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
    if (trigger) {
      setSettingUtils(previous => ({ ...previous, activeSceneObject: { sceneId: sceneElement.id, type: 'trigger', id: trigger.id }, activeTriggerId: trigger.id }));
      onSelectObject?.('trigger', trigger.id);
    }
    triggerStartRef.current = null;
    triggerEndRef.current = null;
    areaToolRef.current = null;
    setTriggerStart(null);
    setTriggerEnd(null);
    setAreaTool(null);
  };

  const startObjectDrag = (type: 'actor' | 'trigger', object: { id?: string; x: number; y: number }, event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    onSelectObject?.(type, object.id!);
    if (settingUtils.activeButton !== 'select') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingObject({ type, id: object.id!, offsetX: (event.clientX - rect.left) * scaleX - object.x, offsetY: (event.clientY - rect.top) * scaleY - object.y });
    setDragPreviewPosition({ x: object.x, y: object.y });
  };

  const moveSceneObject = (event: React.PointerEvent<HTMLElement>) => {
    if (!draggingObject) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const grid = sceneElement.gridSize ?? 8;
    const current = draggingObject.type === 'actor'
      ? sceneElement.actors?.find(item => item.id === draggingObject.id)
      : sceneElement.triggers?.find(item => item.id === draggingObject.id);
    if (!current) return;
    const bounds = draggingObject.type === 'actor' ? actorBounds(current, grid) : { width: current.width || grid, height: current.height || grid };
    const width = bounds.width;
    const height = bounds.height;
    const rawX = (event.clientX - rect.left) * canvas.width / rect.width - draggingObject.offsetX;
    const rawY = (event.clientY - rect.top) * canvas.height / rect.height - draggingObject.offsetY;
    const centeredActor = draggingObject.type === 'actor' && (current as any).anchor === 'center';
    const x = centeredActor
      ? Math.max(width / 2, Math.min(sceneElement.width - width / 2, snapActorX(rawX)))
      : Math.max(0, Math.min(sceneElement.width - width, Math.round(rawX / grid) * grid));
    const y = centeredActor
      ? Math.max(height / 2, Math.min(sceneElement.height - height / 2, snapActorY(rawY)))
      : Math.max(0, Math.min(sceneElement.height - height, Math.round(rawY / grid) * grid));
    // Persist only on release. Rebuilding the canvas on every pointer move
    // caused asynchronous background/grid redraws to flash during a drag.
    setDragPreviewPosition({ x, y });
  };

  const finishObjectDrag = () => {
    if (!draggingObject || !dragPreviewPosition) {
      setDraggingObject(null);
      setDragPreviewPosition(null);
      return;
    }
    const key = draggingObject.type === 'actor' ? 'actors' : 'triggers';
    const values = (draggingObject.type === 'actor' ? sceneElement.actors : sceneElement.triggers)
      ?.map(item => item.id === draggingObject.id ? { ...item, ...dragPreviewPosition } : item);
    const updated = { ...sceneElement, [key]: values, _saved: false };
    setElementSelected(updated);
    setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
    setDraggingObject(null);
    setDragPreviewPosition(null);
  };

  const startTriggerResize = (trigger: { id: string; x: number; y: number; width: number; height: number }, edges: string, event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || settingUtils.activeButton !== 'select') return;
    event.preventDefault();
    event.stopPropagation();
    onSelectObject?.('trigger', trigger.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    const initial = { id: trigger.id, edges, x: trigger.x, y: trigger.y, width: trigger.width, height: trigger.height };
    setResizingTrigger(initial);
    setResizePreview({ x: trigger.x, y: trigger.y, width: trigger.width, height: trigger.height });
  };

  const resizeTrigger = (event: React.PointerEvent<HTMLElement>) => {
    if (!resizingTrigger) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const grid = sceneElement.gridSize ?? 8;
    const rawX = (event.clientX - rect.left) * canvas.width / rect.width;
    const rawY = (event.clientY - rect.top) * canvas.height / rect.height;
    const snap = (value: number) => Math.round(value / grid) * grid;
    const right = resizingTrigger.x + resizingTrigger.width;
    const bottom = resizingTrigger.y + resizingTrigger.height;
    let x = resizingTrigger.x;
    let y = resizingTrigger.y;
    let width = resizingTrigger.width;
    let height = resizingTrigger.height;
    if (resizingTrigger.edges.includes('w')) {
      x = Math.max(0, Math.min(right - grid, snap(rawX)));
      width = right - x;
    }
    if (resizingTrigger.edges.includes('e')) {
      width = Math.max(grid, Math.min(sceneElement.width - resizingTrigger.x, snap(rawX) - resizingTrigger.x));
    }
    if (resizingTrigger.edges.includes('n')) {
      y = Math.max(0, Math.min(bottom - grid, snap(rawY)));
      height = bottom - y;
    }
    if (resizingTrigger.edges.includes('s')) {
      height = Math.max(grid, Math.min(sceneElement.height - resizingTrigger.y, snap(rawY) - resizingTrigger.y));
    }
    setResizePreview({ x, y, width, height });
  };

  const finishTriggerResize = () => {
    if (!resizingTrigger || !resizePreview) {
      setResizingTrigger(null);
      setResizePreview(null);
      return;
    }
    const updated = {
      ...sceneElement,
      triggers: (sceneElement.triggers ?? []).map(trigger => trigger.id === resizingTrigger.id ? { ...trigger, ...resizePreview } : trigger),
      _saved: false,
    };
    setElementSelected(updated);
    setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
    setResizingTrigger(null);
    setResizePreview(null);
  };

  return (
    <Content
      id={sceneElement?.id}
      ref={setNodeRef}
      className="game-element"
      style={{...displayedElementStyle, width: canvasRef.current?.width, height: canvasRef.current?.height, opacity: isDimmed ? .35 : isSecondarySelected ? .72 : 1, filter: isSecondarySelected ? 'brightness(.82)' : undefined, pointerEvents: isDimmed ? 'none' : undefined, outline: isClipboardSource ? `2px dashed ${token.colorPrimary}` : displayedElementStyle.outline, outlineOffset: isClipboardSource ? 3 : undefined}}
      {...attributes}
      onClick={event => onSelect(sceneElement, event)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect(sceneElement, e);
      }}
      onMouseEnter={() => handleHovered(true) }
      onMouseLeave={() => handleHovered(false) }
    >
      {/* PLAYER INITIAL POSITION */}
      <Content style={{position: "relative"}} 
        onMouseUp={() => setDraggingInitialPosition(false)}
        onMouseMove={(e) => handleMoveInitialPlayerPosition(e)}
      >
        {imageLoading && (
          <div aria-label="Carregando imagem da cena" style={{ position: 'absolute', left: 0, top: 0, width: sceneElement.width, height: sceneElement.height, background: `linear-gradient(110deg, ${token.colorFillSecondary} 30%, ${token.colorFillTertiary} 45%, ${token.colorFillSecondary} 60%)`, backgroundSize: '200% 100%', animation: 'gba-scene-skeleton 1.4s ease-in-out infinite', zIndex: 20, pointerEvents: 'none' }} />
        )}
        {/* Renderiza tileMap se disponivel */}
        <canvas ref={canvasRef} data-scene-id={sceneElement.id} data-edit-tool={`${settingUtils.activeButton}:${settingUtils.activeSubButton}`} data-tile-editing={settingUtils.tileEditSceneId === sceneElement.id ? 'true' : 'false'} data-tile-grid={settingUtils.tileEditSceneId === sceneElement.id && !userSettings.hiddenTileGridSceneIds?.includes(sceneElement.id) ? 'visible' : 'hidden'} data-selected={isSelected ? 'true' : 'false'} data-active-object={settingUtils.activeSceneObject?.id ?? ''} onPointerDown={editCanvas} onPointerMove={updateTriggerDrag} onPointerUp={finishTriggerDrag} onPointerLeave={() => { setTileHover(null); onSceneMouseLeave?.(); }} onClick={event => {
          // A tile edit updates the scene synchronously. Do not let the
          // scene-container click immediately select its stale pre-edit copy.
          // Tile editing owns normal clicks, but Shift+click is deliberately
          // reserved for world multi-selection and must reach the scene card.
          if (settingUtils.tileEditSceneId === sceneElement.id && !event.shiftKey) event.stopPropagation();
        }}/>
        {isTileEditingScene && tileHover && settingUtils.activeButton === 'tiles' && (settingUtils.activeSubButton === 'pencil' || settingUtils.activeSubButton === 'square') && (() => {
          const grid = sceneElement.gridSize ?? 8;
          const selectedTiles = editingLayer?.selectedTiles ?? sceneElement.selectedTiles ?? [];
          if (!selectedTiles.length || !tilesetImage) return null;
          const sourceColumns = Math.max(1, Math.floor(tilesetImage.naturalWidth / grid));
          const sources = selectedTiles.map(tile => ({ tile, col: tile % sourceColumns, row: Math.floor(tile / sourceColumns) }));
          const minCol = Math.min(...sources.map(tile => tile.col));
          const minRow = Math.min(...sources.map(tile => tile.row));
          const maxCol = Math.max(...sources.map(tile => tile.col));
          const maxRow = Math.max(...sources.map(tile => tile.row));
          const isSquare = settingUtils.activeSubButton === 'square';
          const stroke = isSquare && tileStrokePreview?.tool === 'square' ? tileStrokePreview : null;
          const left = (stroke ? Math.min(stroke.start.col, stroke.last.col) : tileHover.col) * grid;
          const top = (stroke ? Math.min(stroke.start.row, stroke.last.row) : tileHover.row) * grid;
          const widthCells = stroke ? Math.abs(stroke.last.col - stroke.start.col) + 1 : (isSquare ? 1 : maxCol - minCol + 1);
          const heightCells = stroke ? Math.abs(stroke.last.row - stroke.start.row) + 1 : (isSquare ? 1 : maxRow - minRow + 1);
          const selectedByOffset = new Map(sources.map(source => [`${source.col - minCol}:${source.row - minRow}`, source]));
          const selectionWidth = maxCol - minCol + 1;
          const selectionHeight = maxRow - minRow + 1;
          return <span data-testid="tile-stamp-preview" style={{ position: 'absolute', left, top, width: widthCells * grid, height: heightCells * grid, display: 'block', boxSizing: 'border-box', border: '1px dashed #faad14', background: stroke ? 'rgba(250,173,20,.1)' : undefined, pointerEvents: 'none', zIndex: 6 }}>
            {isSquare && !stroke ? null : Array.from({ length: widthCells * heightCells }, (_, index) => {
              const col = index % widthCells;
              const row = Math.floor(index / widthCells);
              const source = selectedByOffset.get(`${col % selectionWidth}:${row % selectionHeight}`);
              if (!source) return null;
              return <span key={`${col}:${row}`} style={{ position: 'absolute', left: col * grid, top: row * grid, width: grid, height: grid, opacity: .7, backgroundImage: `url(${tilesetImage.src})`, backgroundPosition: `-${source.col * grid}px -${source.row * grid}px`, pointerEvents: 'none' }} />;
            })}
          </span>;
        })()}
        {isTileEditingScene && tileHover && !triggerStart && !tileStrokeRef.current && !colorizeStrokeRef.current && (() => {
          const grid = sceneElement.gridSize ?? 8;
          const tool = settingUtils.activeButton;
          const subTool = settingUtils.activeSubButton;
          const isMatchingTiles = tool === 'tiles' && subTool === 'same';
          const isColorizeBrush = tool === 'colorize' && (subTool === 'subAction1' || subTool === 'subAction2' || subTool === 'subAction3');
          const isEraseBrush = tool === 'erase' && subTool === '8px';
          const collisionSide = settingUtils.collisionSide ?? 'solid';
          const isCollisionBrush = tool === 'collision' && settingUtils.collisionBrushSize !== 'bucket';
          const isCollisionBucket = tool === 'collision' && settingUtils.collisionBrushSize === 'bucket';
          const isTriggerBrush = tool === 'add' && subTool === 'Trigger';
          const isActorBrush = tool === 'add' && subTool === 'Actor';
          if (!isMatchingTiles && !isColorizeBrush && !isEraseBrush && !isCollisionBrush && !isCollisionBucket && !isTriggerBrush && !isActorBrush) return null;
          const color = isActorBrush ? '#1677ff' : isEraseBrush || isCollisionBrush || isCollisionBucket ? '#ff4d4f' : isTriggerBrush ? '#52c41a' : isColorizeBrush ? '#722ed1' : '#faad14';
          const fill = isActorBrush ? 'rgba(22,119,255,.18)' : isEraseBrush || isCollisionBrush || isCollisionBucket ? 'rgba(255,77,79,.18)' : isTriggerBrush ? 'rgba(82,196,26,.18)' : isColorizeBrush ? 'rgba(114,46,209,.18)' : 'rgba(250,173,20,.18)';
          const third = grid / 3;
          const collisionBounds = collisionSide === 'top' ? { left: 0, top: 0, width: grid, height: third }
            : collisionSide === 'down' ? { left: 0, top: grid - third, width: grid, height: third }
            : collisionSide === 'left' ? { left: 0, top: 0, width: third, height: grid }
            : collisionSide === 'right' ? { left: grid - third, top: 0, width: third, height: grid }
            : { left: 0, top: 0, width: grid, height: grid };
          return <span data-testid="brush-hover-preview" style={{ position: 'absolute', left: isActorBrush ? Math.floor(tileHover.col * grid / 16) * 16 : tileHover.col * grid + (isCollisionBrush ? collisionBounds.left : 0), top: tileHover.row * grid + (isCollisionBrush ? collisionBounds.top : 0), width: isActorBrush ? 16 : isCollisionBrush ? collisionBounds.width : grid, height: isActorBrush ? 8 : isCollisionBrush ? collisionBounds.height : grid, boxSizing: 'border-box', border: `2px dashed ${color}`, background: fill, pointerEvents: 'none', zIndex: 7 }} />;
        })()}
        {triggerStart && triggerEnd && (() => {
          const grid = sceneElement.gridSize ?? 8;
          const left = Math.min(triggerStart.col, triggerEnd.col) * grid;
          const top = Math.min(triggerStart.row, triggerEnd.row) * grid;
          const isDestructive = areaTool === 'collision' || areaTool === 'erase';
          return <span data-testid={areaTool === 'erase' ? 'erase-area-preview' : undefined} style={{ position: 'absolute', left, top, width: (Math.abs(triggerEnd.col - triggerStart.col) + 1) * grid, height: (Math.abs(triggerEnd.row - triggerStart.row) + 1) * grid, boxSizing: 'border-box', border: `2px dashed ${isDestructive ? '#ff4d4f' : '#faad14'}`, background: isDestructive ? 'rgba(255,77,79,.2)' : 'rgba(250,173,20,.2)', pointerEvents: 'none', zIndex: 5 }} />;
        })()}
        {isEventsLayer && sceneElement.triggers?.map(trigger => {
          const preview = draggingObject?.type === 'trigger' && draggingObject.id === trigger.id ? dragPreviewPosition : null;
          const resized = resizingTrigger?.id === trigger.id ? resizePreview : null;
          const bounds = resized ?? { x: preview?.x ?? trigger.x, y: preview?.y ?? trigger.y, width: trigger.width, height: trigger.height };
          const handleStyle = (cursor: string, style: CSSProperties): CSSProperties => ({ position: 'absolute', ...style, zIndex: 2, cursor, pointerEvents: settingUtils.activeButton === 'select' ? 'auto' : 'none' });
          const beginResize = (edges: string) => (event: React.PointerEvent<HTMLElement>) => startTriggerResize(trigger, edges, event);
          return <span key={trigger.id} title={trigger.name || 'Trigger'} onPointerDown={event => { if (settingUtils.activeButton !== 'select') return; event.stopPropagation(); startObjectDrag('trigger', trigger, event); }} onPointerMove={resizingTrigger ? undefined : moveSceneObject} onPointerUp={resizingTrigger ? undefined : finishObjectDrag} onClick={event => { if (settingUtils.activeButton !== 'select') return; event.stopPropagation(); onSelectObject?.('trigger', trigger.id!); }} style={{ position: 'absolute', left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, boxSizing: 'border-box', border: `2px solid ${selectedObject?.type === 'trigger' && selectedObject.id === trigger.id ? '#faad14' : '#52c41a'}`, background: 'rgba(82,196,26,.16)', cursor: settingUtils.activeButton === 'select' ? 'move' : 'crosshair', pointerEvents: settingUtils.activeButton === 'select' ? 'auto' : 'none', zIndex: 2 }}>
            <span aria-label="Resize trigger top" onPointerDown={beginResize('n')} onPointerMove={resizeTrigger} onPointerUp={finishTriggerResize} style={handleStyle('ns-resize', { left: 0, right: 0, top: -4, height: 8 })} />
            <span aria-label="Resize trigger bottom" onPointerDown={beginResize('s')} onPointerMove={resizeTrigger} onPointerUp={finishTriggerResize} style={handleStyle('ns-resize', { left: 0, right: 0, bottom: -4, height: 8 })} />
            <span aria-label="Resize trigger left" onPointerDown={beginResize('w')} onPointerMove={resizeTrigger} onPointerUp={finishTriggerResize} style={handleStyle('ew-resize', { top: 0, bottom: 0, left: -4, width: 8 })} />
            <span aria-label="Resize trigger right" onPointerDown={beginResize('e')} onPointerMove={resizeTrigger} onPointerUp={finishTriggerResize} style={handleStyle('ew-resize', { top: 0, bottom: 0, right: -4, width: 8 })} />
          </span>;
        })}
        {isEventsLayer && sceneElement.actors?.map(actor => {
          const preview = draggingObject?.type === 'actor' && draggingObject.id === actor.id ? dragPreviewPosition : null;
          const bounds = actorBounds(preview ? { ...actor, ...preview } : actor, sceneElement.gridSize ?? 8);
          const sprite = spriteResources.find(item => item.id === (actor as any).spriteId) as any;
          const directionRow = ({ down: 0, left: 1, right: 2, up: 3 } as Record<string, number>)[(actor as any).direction ?? 'right'] ?? 2;
          const spriteFilename = sprite?.filename ?? sprite?.name;
          const spriteUrl = spriteAssetPaths[(actor as any).spriteId ?? ''] ?? (spriteFilename ? joinLocalAssetPath(settingUtils.localImagePath, spriteFilename) : undefined);
          const actorKey = actor.id ?? actor.actorId ?? `${actor.x}:${actor.y}`;
          const canvasPreview = actorSpritePreviews[actorKey];
          const canvasOriginX = Number(sprite?.playerCanvasOriginX ?? 0);
          const canvasOriginY = Number(sprite?.playerCanvasOriginY ?? (sprite?.playerFrameHeight ?? 16) / 2);
          return <span key={actorKey} title={actor.name || 'Actor'} onPointerDown={event => { if (settingUtils.activeButton !== 'select') return; event.stopPropagation(); startObjectDrag('actor', actor, event); }} onPointerMove={moveSceneObject} onPointerUp={finishObjectDrag} onClick={event => { if (settingUtils.activeButton !== 'select') return; event.stopPropagation(); if (actor.id) onSelectObject?.('actor', actor.id); }} style={{ position: 'absolute', left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, boxSizing: 'border-box', cursor: settingUtils.activeButton === 'select' ? 'move' : 'pointer', pointerEvents: settingUtils.activeButton === 'select' ? 'auto' : 'none', zIndex: 3, overflow: 'visible' }}>
            {(canvasPreview || spriteUrl) && <span aria-label={`${actor.name || 'Actor'} sprite preview`} style={{ position: 'absolute', left: bounds.width / 2 - canvasOriginX, top: bounds.height / 2 - canvasOriginY, width: canvasPreview?.width ?? sprite?.playerFrameWidth ?? 16, height: canvasPreview?.height ?? sprite?.playerFrameHeight ?? 16, backgroundImage: `url("${canvasPreview?.url ?? spriteUrl}")`, backgroundPosition: canvasPreview ? undefined : `0 ${directionRow * 33.333}%`, backgroundSize: canvasPreview ? '100% 100%' : `${((sprite?.imageWidth ?? 64) / (sprite?.playerFrameWidth ?? 16)) * 100}% ${((sprite?.imageHeight ?? 64) / (sprite?.playerFrameHeight ?? 16)) * 100}%`, backgroundRepeat: 'no-repeat', imageRendering: 'pixelated', pointerEvents: 'none', zIndex: 0 }} />}
            <span aria-hidden="true" style={{ position: 'absolute', inset: 0, boxSizing: 'border-box', border: `2px solid ${selectedObject?.type === 'actor' && selectedObject.id === actor.id ? 'rgba(250,173,20,.78)' : 'rgba(22,119,255,.62)'}`, background: 'rgba(22,119,255,.18)', pointerEvents: 'none', zIndex: 1 }} />
          </span>;
        })}
        {variableTextEvents.map(event => {
          const args = event.args ?? {};
          const variable = variables.variables.find((item: any) => item.id === args.variableId);
          const font = (PREVIEW_FONTS[args.font as PreviewFontId] ? args.font : 'variable8x16') as PreviewFontId;
          const metrics = PREVIEW_FONTS[font];
          const value = String(variable?.initialValue ?? '');
          const source = commonFontImages[metrics.image] ?? '/common_variable_8x16_font.png';
          return <span key={`variable-text-${event.id}`} aria-label="Variable text preview" style={{ position: 'absolute', left: Number(args.x ?? 0), top: Number(args.y ?? 0), display: 'block', whiteSpace: 'nowrap', height: metrics.glyphHeight, background: 'transparent', pointerEvents: 'none', zIndex: 4 }}>
            {Array.from(value).map((character: string, index: number) => {
              const glyph = fontGlyphIndex(character);
              if (glyph < 0) return null;
              const width = fontCharacterWidth(font, character);
              return <span key={`${character}-${index}`} style={{ display: 'inline-block', verticalAlign: 'top', width, height: metrics.glyphHeight, backgroundImage: `url(${source})`, backgroundRepeat: 'no-repeat', backgroundSize: `${metrics.glyphWidth}px auto`, backgroundPosition: `0 -${glyph * metrics.glyphHeight}px`, imageRendering: 'pixelated' }} />;
            })}
          </span>;
        })}
        {!isTileEditingScene && cameraPreviews.flatMap(camera => {
          const sceneWidth = canvasRef.current?.width ?? sceneElement.width;
          const sceneHeight = canvasRef.current?.height ?? sceneElement.height;
          // Camera coordinates use the scene image's upper-left corner as
          // their origin. This is also the origin used by Show Camera and by
          // the Butano background after it is positioned from the image edge.
          const startX = camera.x;
          const startY = camera.y;
          return getWrappedCameraPreviewRects(startX, startY, sceneWidth, sceneHeight).map((rect, index) => (
          <span key={`${camera.id}-${index}`} title={`Camera preview at ${camera.x}, ${camera.y}`} style={{
            position: 'absolute', left: rect.left, top: rect.top, width: rect.width, height: rect.height,
            boxSizing: 'border-box', border: '2px solid rgba(22, 119, 255, .9)',
            background: 'rgba(22, 119, 255, .14)', pointerEvents: 'none', zIndex: 1,
          }} />
          ));
        })}
        {/* Ícone do player sobreposto */}
        {settings?.startSceneId === sceneElement?.id && !isTileEditingScene && (
            <PlaySquareTwoTone twoToneColor={[draggingInitialPosition ? "orange" : "gray", "red"]} 
              rotate={getRotation(settings.startDirection)} 
              style={{
                position: "absolute", 
                left: settings.startX * 16, 
                top: settings.startY * 16, 
                fontSize: 16, 
                color: "red", 
                cursor: draggingInitialPosition ? "grabbing" : "grab" }} 
                onMouseDown={(e) => {
                  e.preventDefault();
                  setDraggingInitialPosition(true);
              }}
            />
        )}
        {changeScenePreviewLayer && createPortal(changeScenePreviews.map((preview, index) => (
          <PlaySquareTwoTone
            key={preview.id}
            twoToneColor={["#1677ff", "#91caff"]}
            rotate={getRotation(preview.direction)}
            title={`Change Scene arrival at ${preview.x}, ${preview.y}`}
            style={{
              position: "absolute",
              left: sceneElement.x + preview.x * 16 + (changeScenePreviewOffset?.x ?? 0),
              top: sceneElement.y + preview.y * 16 + (changeScenePreviewOffset?.y ?? 0),
              fontSize: 16,
              color: "#1677ff",
              pointerEvents: "auto",
              cursor: draggingChangeScenePreviewId === preview.id ? "grabbing" : "grab",
              zIndex: 11,
              // Slightly separate arrivals deliberately configured at the
              // same tile, while keeping their tile position recognisable.
              transform: `translate(${index * 3}px, ${index * 3}px)`,
            }}
            onMouseDown={event => {
              event.preventDefault();
              event.stopPropagation();
              setDraggingChangeScenePreviewId(preview.id);
            }}
          />
        )), changeScenePreviewLayer)}
      </Content>

      {/* The edit control remains behind the title until it is intentionally hovered. */}
      {onEditTiles && isSelected && isEditButtonVisible && (
        <Button
          aria-label="Edit tiles"
          title="Edit tiles"
          size="small"
          type="text"
          icon={<EditOutlined />}
          onMouseEnter={() => setIsEditButtonHovered(true)}
          onMouseLeave={() => setIsEditButtonHovered(false)}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); onEditTiles(sceneElement); }}
          style={{
            position: 'absolute',
            // Six pixels remain exposed on the right so the hidden tab can
            // always receive a pointer hover.
            right: -6,
            bottom: '100%',
            zIndex: 3,
            width: 36,
            height: 30,
            borderRadius: `0 ${token.borderRadius}px ${token.borderRadius}px 0`,
            background: token.colorBgElevated,
            boxShadow: token.boxShadowSecondary,
            transform: isEditButtonHovered ? 'translateX(28px)' : 'translateX(0)',
            transition: 'transform 160ms ease-out',
          }}
        />
      )}
      {/* TITLE */}
      <Content {...listeners} style={{ ...computedTitleStyle, zIndex: 4 }}>
        {sceneElement.name}
        {hiddenLayerCount > 0 && <Tooltip title={`${hiddenLayerCount} layer${hiddenLayerCount === 1 ? '' : 's'} hidden in editor preview`}>
          <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            <EyeInvisibleOutlined />
            <span>{hiddenLayerCount}</span>
          </span>
        </Tooltip>}
      </Content>

      {/* BASE INFO */}
      {isSelected &&
        <Content
          style={{
            ...computedTitleStyle,
            bottom: -32,
            borderTopLeftRadius: '0px',
            borderTopRightRadius: '0px',
            borderBottomLeftRadius: token.borderRadius,
            borderBottomRightRadius: token.borderRadius
          }}
        >
          <Tooltip title={`${limitMessage('Tiles nas layers da cena', layerTileCount, 4096)} Cada background usa blocos de 8×8.`}>
            <span style={counterStyle(layerTileCount, 4096)}>S: {layerTileCount}/4096</span>
          </Tooltip>
          <Tooltip title={`${limitMessage(`Actors nesta cena${hasInitialPlayer ? ' (inclui o Player inicial)' : ''}`, actorCount, 128)}`}>
            <span style={counterStyle(actorCount, 128)}>Actors: {actorCount}/128</span>
          </Tooltip>
          <Tooltip title={`Triggers nesta cena: ${triggerCount}`}>
            <span style={counterStyle(triggerCount, 128)}>T: {triggerCount}</span>
          </Tooltip>
        </Content>
      }
    </Content>
  );
};

export default GameElement;
