import useWorldOverlayPosition from './useWorldOverlayPosition';
import { createSceneFadeIn } from '@/utils/createSceneFadeIn';
import { suspendInspectorHover } from '../../utils/sceneDragInteraction';
import { getChangeSceneMarkerPosition } from './changeScenePreviewGeometry';
import { isModalOpen } from '@/utils/isModalOpen';
import { DndContext, DragEndEvent, DragMoveEvent } from '@dnd-kit/core';
import { App, Button, FloatButton, Layout, Progress, Tooltip } from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AntdToken } from '../common/AntDToken';
import GameElement from './GameElement';

import { AimOutlined, AppstoreAddOutlined, ArrowDownOutlined, ArrowLeftOutlined, ArrowRightOutlined, ArrowUpOutlined, AuditOutlined, BgColorsOutlined, BlockOutlined, BorderInnerOutlined, ClearOutlined, CloseSquareOutlined, EditOutlined, EyeInvisibleOutlined, EyeOutlined, ExpandOutlined, ExperimentOutlined, FormatPainterFilled, FormatPainterOutlined, InsertRowAboveOutlined, LayoutOutlined, PicLeftOutlined, PictureFilled, PlusSquareFilled, SelectOutlined, SwapOutlined, VerticalAlignMiddleOutlined } from '@ant-design/icons';
import { Content } from 'antd/es/layout/layout';
import { ReactZoomPanPinchRef, TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import FloatButttons from '../FloatButtons';

import imgPlaceholder from '@/img/placeholder.png';
import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { ISettingUtils } from '@/providers/contexts/interfaces/ISettingUtils';
import { IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { Spin } from 'antd/lib';
import { joinLocalAssetPath } from '@/utils/localAssetUrl';
import { countDistinctImageTiles } from '@/utils/tileCount';
import { useI18n } from '@/i18n/I18n';
import { matchesSceneSearch, sceneSearchAfterSelection } from '@/utils/sceneSearch';
import { deleteCachedSceneCanvas } from '@/utils/sceneRenderCache';
import { clearDeletedEventReferences, clearDeletedSceneReferences, disableDeletedActorReferences } from '../../../../../shared/events/sceneReferenceCleanup';

enum SubMenuType {
  TOOLTIP = 'tooltip',
  POPOVER = 'popover',
  DROPDOWN = 'dropdown',
}

type SceneObjectClipboard = { type: 'actor' | 'trigger'; object: any };
let sceneObjectClipboard: SceneObjectClipboard | null = null;

function cloneScriptEvents(events: IScriptsElement[] | undefined): IScriptsElement[] | undefined {
  return events?.map(event => ({
    ...event,
    id: uuidv4(),
    children: event.children ? {
      ...event.children,
      then: cloneScriptEvents(event.children.then) ?? [],
      else: cloneScriptEvents(event.children.else),
    } : undefined,
  }));
}

interface IActions {
  key: string;
  type?: SubMenuType,
  icon: React.ReactNode;
  iconSize?: number;
  tooltip?: string;
  active?: boolean;
  preserveActiveTool?: boolean;
  selectOnly?: boolean;
  onClick?: () => void;
  subMenu?: {
    type?: SubMenuType;
    items: {
      key: string;
      icon: React.ReactNode;
      iconSize?: number;
      active?: boolean;
      disabled?: boolean;
      tooltip?: string;
      separator?: boolean;
      onClick: () => void;
    }[];
  };
}

const titleHeight = 82; // Altura do Titulo
const leftLimite = 106

interface ChangeScenePreview {
  id: string;
  targetSceneId: string;
  x: number;
  y: number;
  direction: string;
  xUnit?: 'tiles' | 'pixels';
  yUnit?: 'tiles' | 'pixels';
}

interface ChangeSceneTrace {
  id: string;
  path: string;
}

interface CameraPreview {
  eventId: string;
  x: number;
  y: number;
}

const ROM_LIMIT_BYTES = 32 * 1024 * 1024;
const VRAM_LIMIT_BYTES = 96 * 1024;

interface ResourceUsage {
  binary: number;
  engine: number;
  graphics: number;
  audio: number;
  scripts: number;
  total: number;
  source: 'build' | 'assets';
}

const formatBytes = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : `${(bytes / 1024).toFixed(1)} KB`;

const calculateSceneVram = (scene: ISceneSettings, backgrounds: any[], sprites: any[], playerSpriteId?: string | null, distinctBackgroundTiles = new Map<string, number>()): number => {
  // A sprite instance keeps one frame's tiles in VRAM. Count every actor and
  // the configured player, rounded to 8x8 GBA tiles (4bpp = 32 bytes/tile).
  const spriteIds = (scene.actors ?? []).map(actor => actor.spriteId ?? actor.actorId).filter((id): id is string => Boolean(id));
  if (playerSpriteId) spriteIds.push(playerSpriteId);
  const spriteBytes = spriteIds.reduce((total, id) => {
    const sprite = sprites.find(item => !item._deleted && item.id === id);
    if (!sprite) return total;
    const frameWidth = Number(sprite.playerFrameWidth) || 16;
    const frameHeight = Number(sprite.playerFrameHeight) || 16;
    return total + Math.ceil(frameWidth / 8) * Math.ceil(frameHeight / 8) * 32;
  }, 0);
  const isBitmapScene = scene.renderMode === 'direct_bitmap' || scene.sceneType === ETypeScene.LOGO || scene.sceneType === ETypeScene.POINTNCLICK;
  if (isBitmapScene) {
    // The template owns a single `current_bitmap_bgs` pointer. Change Layer
    // releases/reuses that allocation before painting the next bitmap, so the
    // correct editor warning is the peak bitmap size, never their sum.
    const bitmapBytes = (backgroundId?: string | null) => {
      const background = backgrounds.find(item => !item._deleted && item.id === backgroundId);
      if (!background?.imageWidth || !background?.imageHeight) return 0;
      return Math.ceil(background.imageWidth / 8) * Math.ceil(background.imageHeight / 8) * 64;
    };
    const candidates = [scene.backgrounds?.find(layer => layer.layerId === 2)?.backgroundId];
    const visited = new Set<string>();
    const walk = (events: IScriptsElement[] | undefined) => events?.forEach(event => {
      if (visited.has(event.id)) return;
      visited.add(event.id);
      if (event.command === 'EVENT_CHANGE_LAYER' && (event.args as { layerId?: number })?.layerId === 2) candidates.push((event.args as { backgroundId?: string | null }).backgroundId);
      walk(event.children?.then);
      walk(event.children?.else);
    });
    walk(scene.script);
    scene.triggers?.forEach(trigger => { const item = trigger as typeof trigger & { script?: IScriptsElement[]; onEnterScript?: IScriptsElement[]; onLeaveScript?: IScriptsElement[] }; walk(item.script); walk(item.onEnterScript); walk(item.onLeaveScript); });
    walk(scene.playerHit1Script);
    walk(scene.playerHit2Script);
    walk(scene.playerHit3Script);
    Object.values(scene.eventGraphs ?? {}).forEach(graph => walk(graph.nodes));
    return Math.max(0, ...candidates.map(bitmapBytes)) + spriteBytes + 512 + 512;
  }
  const grid = scene.gridSize ?? 8;
  const columns = Math.max(1, Math.ceil(scene.width / grid));
  const rows = Math.max(1, Math.ceil(scene.height / grid));
  const layers = scene.backgrounds ?? [];
  const bytesPerTile = 32;
  const graphicTiles = new Set<string>();
  let mapTiles = 0;
  layers.forEach(layer => {
    const background = backgrounds.find(item => !item._deleted && item.id === layer.backgroundId);
    // A background resource only allocates one copy of each distinct 8×8
    // graphic. Repeated pixels/tiles inside the same image do not consume
    // additional character blocks.
    const imageTiles = background
      ? distinctBackgroundTiles.get(background.id) ?? (background.imageWidth && background.imageHeight ? Math.ceil(background.imageWidth / 8) * Math.ceil(background.imageHeight / 8) : 0)
      : 0;
    for (let index = 0; index < imageTiles; index += 1) graphicTiles.add(`background:${layer.backgroundId}:${index}`);
    const map = layer.tileMap;
    if (map?.length) {
      mapTiles += map.reduce((total, line) => total + line.length, 0);
      map.forEach((line, rowIndex) => line.forEach((tile, colIndex) => { if (Number.isInteger(tile) && tile >= 0) graphicTiles.add(`tileset:${layer.tileMapTilesetIds?.[rowIndex]?.[colIndex] ?? layer.selectedTilesetId ?? scene.selectedTilesetId ?? 'default'}:${tile}`); }));
    } else if (layer.backgroundId || layer.selectedTilesetId) mapTiles += columns * rows;
  });
  if (!layers.length && scene.tileMap?.length) {
    mapTiles = scene.tileMap.reduce((total, line) => total + line.length, 0);
    scene.tileMap.forEach(line => line.forEach(tile => { if (Number.isInteger(tile) && tile >= 0) graphicTiles.add(`tileset:${scene.selectedTilesetId ?? 'default'}:${tile}`); }));
  }
  return graphicTiles.size * bytesPerTile + mapTiles * 2 + spriteBytes + 512 + 512;
};

const getChangeSceneTracePath = (source: ISceneSettings, target: ISceneSettings, preview: ChangeScenePreview, marker = getChangeSceneMarkerPosition(target, preview)): string => {
  const startX = source.x;
  const startY = source.y;
  const endX = marker.centerX;
  const endY = marker.centerY;
  const distance = Math.hypot(endX - startX, endY - startY);
  const arc = Math.max(48, Math.min(160, distance * 0.3));
  const direction = endX >= startX ? 1 : -1;

  // A loop stays visible when a Change Scene arrives in its own scene.
  if (distance < 1) {
    return `M ${startX} ${startY} C ${startX + 96} ${startY - 120}, ${endX - 96} ${endY - 120}, ${endX} ${endY}`;
  }

  return `M ${startX} ${startY} C ${startX + arc * direction} ${startY - arc}, ${endX - arc * direction} ${endY - arc}, ${endX} ${endY}`;
};

const getTileCoordinate = (value: unknown, allowNegative = false): number => {
  const rawValue = typeof value === 'object' && value !== null && 'value' in value
    ? (value as { value?: unknown }).value
    : value;
  const numberValue = Number(rawValue ?? 0);
  if(!Number.isFinite(numberValue)) return 0;
  const coordinate = Math.trunc(numberValue);
  return allowNegative ? coordinate : Math.max(0, coordinate);
};

const triggerPreviewScriptKeys = ['script', 'onEnterScript', 'onLeaveScript', 'onInteractScript', 'onInitScript', 'onUpdateScript'] as const;

const collectChangeScenePreviews = (scene: ISceneSettings): ChangeScenePreview[] => {
  const previews: ChangeScenePreview[] = [];
  const visited = new Set<string>();
  const walk = (events: IScriptsElement[] | undefined) => {
    events?.forEach(event => {
      if(event.args?.__comment || visited.has(event.id)) return;
      visited.add(event.id);
      if(event.command === 'EVENT_CHANGE_SCENE' && !event.args?.__comment)
      {
        const args = event.args as { sceneId?: string; x?: unknown; y?: unknown; direction?: string; xUnit?: 'tiles' | 'pixels'; yUnit?: 'tiles' | 'pixels' };
        if(args.sceneId)
        {
          previews.push({
            id: event.id,
            targetSceneId: args.sceneId,
            x: getTileCoordinate(args.x) / (args.xUnit === 'pixels' ? 16 : 1),
            y: getTileCoordinate(args.y) / (args.yUnit === 'pixels' ? 16 : 1),
            xUnit: args.xUnit,
            yUnit: args.yUnit,
            direction: args.direction ?? 'right',
          });
        }
      }
      walk(event.children?.then);
      walk(event.children?.else);
    });
  };

  walk(scene.script);
  scene.triggers?.forEach(trigger => triggerPreviewScriptKeys.forEach(key => walk(trigger[key])));
  walk(scene.playerHit1Script);
  walk(scene.playerHit2Script);
  walk(scene.playerHit3Script);
  Object.values(scene.eventGraphs ?? {}).forEach(graph => walk(graph.nodes));
  return previews;
};

const collectCameraPreviews = (scene: ISceneSettings, activePreview: CameraPreview | null) => {
  const previews: Array<{ id: string; x: number; y: number }> = [];
  if (!activePreview) return previews;
  const visited = new Set<string>();
  const walk = (events: IScriptsElement[] | undefined) => events?.forEach(event => {
    if(visited.has(event.id)) return;
    visited.add(event.id);
    if(['EVENT_PAN_CAMERA', 'EVENT_CAMERA_MOVE_TO'].includes(event.command) && event.id === activePreview.eventId)
    {
      previews.push({ id: event.id, x: activePreview.x, y: activePreview.y });
    }
    walk(event.children?.then);
    walk(event.children?.else);
  });
  walk(scene.script);
  scene.triggers?.forEach(trigger => walk(trigger.script));
  walk(scene.playerHit1Script);
  walk(scene.playerHit2Script);
  walk(scene.playerHit3Script);
  Object.values(scene.eventGraphs ?? {}).forEach(graph => walk(graph.nodes));
  return previews;
};

const updateChangeSceneEvent = (
  events: IScriptsElement[] | undefined,
  eventId: string,
  targetSceneId: string,
  x: number,
  y: number,
): IScriptsElement[] | undefined => events?.map(event => ({
  ...event,
  args: event.id === eventId
    ? { ...event.args, sceneId: targetSceneId,
        xUnit: (event.args as any)?.xUnit === 'pixels' || !Number.isInteger(x) ? 'pixels' : 'tiles',
        yUnit: (event.args as any)?.yUnit === 'pixels' || !Number.isInteger(y) ? 'pixels' : 'tiles',
        x: { type: 'number', value: Math.round(x * ((event.args as any)?.xUnit === 'pixels' || !Number.isInteger(x) ? 16 : 1)) },
        y: { type: 'number', value: Math.round(y * ((event.args as any)?.yUnit === 'pixels' || !Number.isInteger(y) ? 16 : 1)) },
      } as IScriptsElement['args']
    : event.args,
  children: event.children
    ? {
      ...event.children,
      then: updateChangeSceneEvent(event.children.then, eventId, targetSceneId, x, y) ?? [],
      else: updateChangeSceneEvent(event.children.else, eventId, targetSceneId, x, y),
    }
    : event.children,
}));

const moveChangeScenePreview = (
  scene: ISceneSettings,
  eventId: string,
  targetSceneId: string,
  x: number,
  y: number,
): ISceneSettings => ({
  ...scene,
  _saved: false,
  script: updateChangeSceneEvent(scene.script, eventId, targetSceneId, x, y),
  triggers: scene.triggers?.map(trigger => {
    const updated = { ...trigger };
    triggerPreviewScriptKeys.forEach(key => {
      updated[key] = updateChangeSceneEvent(trigger[key], eventId, targetSceneId, x, y);
    });
    return updated;
  }),
  playerHit1Script: updateChangeSceneEvent(scene.playerHit1Script, eventId, targetSceneId, x, y),
  playerHit2Script: updateChangeSceneEvent(scene.playerHit2Script, eventId, targetSceneId, x, y),
  playerHit3Script: updateChangeSceneEvent(scene.playerHit3Script, eventId, targetSceneId, x, y),
  eventGraphs: Object.fromEntries(Object.entries(scene.eventGraphs ?? {}).map(([graphId, graph]) => [
    graphId,
    { ...graph, nodes: updateChangeSceneEvent(graph.nodes, eventId, targetSceneId, x, y) ?? [] },
  ])),
});

interface IGameWorld {
  resetPanelSize: any;
  setShowFloatButton: any;
  showFloatButton: boolean;
}

const GameWorld: React.FC<IGameWorld> = ({ resetPanelSize, setShowFloatButton, showFloatButton }) => {
  const { t } = useI18n();
  const { token } = AntdToken();
  const { message, notification, modal } = App.useApp();
  const { 
    scenes, setScenes, scenesRef, scripts, spriteResources, setSpriteResources, setScripts, setVariables,
    backgrounds, setBackgrounds, 
    settings, setSettings,
    settingUtils, setSettingUtils, settingUtilsRef,
    elementSelected, setElementSelected, elementSelectedRef,
    userSettings, setUserSettings
  } = useAppContexts();

  const [worldSize, setWorldSize] = useState({ width: 1920, height: 1080 });
  const [isMovedBackground, setIsMovedBackground] = useState(false);
  const finiteNumber = (value: unknown, fallback: number) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  const zoomLevel = Math.max(0.25, Math.min(16, finiteNumber(userSettings.zoom, 100) / 100));
  const [panInertia, setPanInertia] = useState(true);
  const [sceneMovementMode, setSceneMovementMode] = useState<'free' | 'grid'>('grid');
  const [sceneObjectSnapSize, setSceneObjectSnapSize] = useState<8 | 16>(8);
  const worldScrollX = finiteNumber(userSettings.worldScrollX, 0);
  const worldScrollY = finiteNumber(userSettings.worldScrollY, 0);
  const [gridTransform, setGridTransform] = useState({ x: worldScrollX, y: worldScrollY, scale: zoomLevel });
  const worldPanningRef = useRef(false);
  const worldViewportRef = useRef<HTMLDivElement | null>(null);
  const [worldCursorPosition, setWorldCursorPosition] = useState<{ x: number; y: number } | null>(null);

  const [updatedImages, setUpdatedImages] = useState<any>();
  const [changeScenePreviewLayer, setChangeScenePreviewLayer] = useState<HTMLDivElement | null>(null);
  const [draggingSceneOffset, setDraggingSceneOffset] = useState<{ id: string; x: number; y: number } | null>(null);
  const [activeCameraPreview, setActiveCameraPreview] = useState<CameraPreview | null>(null);
  const [actorPositionPreview, setActorPositionPreview] = useState<{ eventId: string; sceneId: string; actorId: string; x: number; y: number } | null>(null);
  const [sceneMousePosition, setSceneMousePosition] = useState<{ sceneId: string; scene: string; x: number; y: number } | null>(null);
  const sceneMousePositionRef = useRef<{ sceneId: string; scene: string; x: number; y: number } | null>(null);
  const [isMiniMapDragging, setIsMiniMapDragging] = useState(false);
  const miniMapRef = useRef<SVGSVGElement | null>(null);
  const miniMapDragBoundsRef = useRef<{ minX: number; minY: number; width: number; height: number } | null>(null);
  const [romUsage, setRomUsage] = useState<ResourceUsage>({ binary: 0, engine: 0, graphics: 0, audio: 0, scripts: 0, total: 0, source: 'assets' });
  const [loading, setLoading] = useState(true);
  const selectedScene = scenes.find(scene => !scene._deleted && scene.id === elementSelected?.id);
  const worldOverlayPosition = useWorldOverlayPosition(worldViewportRef, loading, Boolean(selectedScene));
  const previousSelectedSceneId = useRef(selectedScene?.id);
  useEffect(() => {
    if (previousSelectedSceneId.current === selectedScene?.id) return;
    previousSelectedSceneId.current = selectedScene?.id;
    if (!selectedScene) return;
    setSettingUtils(previous => {
      const search = sceneSearchAfterSelection(previous.worldSceneSearch, selectedScene);
      return search === (previous.worldSceneSearch ?? '') ? previous : { ...previous, worldSceneSearch: search };
    });
  }, [selectedScene?.id, setSettingUtils]);
  const selectedSceneIds = useMemo(() => settingUtils.selectedSceneIds ?? (selectedScene ? [selectedScene.id] : []), [settingUtils.selectedSceneIds, selectedScene?.id]);
  const movingSceneIds = useMemo(() => draggingSceneOffset
    ? new Set(selectedSceneIds.includes(draggingSceneOffset.id) ? selectedSceneIds : [draggingSceneOffset.id])
    : null, [draggingSceneOffset, selectedSceneIds]);
  const tileEditSceneId = settingUtils.tileEditSceneId;
  const selectedScenePreviews = useMemo(() => selectedScene ? collectChangeScenePreviews(selectedScene) : [], [selectedScene]);
  const selectedCameraPreviews = useMemo(() => selectedScene ? collectCameraPreviews(selectedScene, activeCameraPreview) : [], [selectedScene, activeCameraPreview]);
  const [selectedSceneVram, setSelectedSceneVram] = useState(0);
  const [pendingScenePlacement, setPendingScenePlacement] = useState<{ id: string; mode: 'copy' | 'cut' } | null>(null);
  const [clipboardSceneId, setClipboardSceneId] = useState<string | null>(null);
  const [availableSpriteFileIds, setAvailableSpriteFileIds] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAvailableSpriteFileIds(null);
    const refreshSpriteFiles = async () => {
      try {
        const response = await window.electronAPI.fetchImages('sprites');
        if (cancelled || response?.status !== 'success' || !Array.isArray(response.fileImages)) return;
        setAvailableSpriteFileIds(response.fileImages
          .filter((filename: string) => /\.(png|bmp|gif|jpe?g)$/i.test(filename))
          .map((filename: string) => filename.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[ -]/g, '_')));
      } catch (error) {
        console.warn('Unable to refresh sprite sheets:', error);
      }
    };
    void refreshSpriteFiles();
    window.addEventListener('gba-studio:assets-reloaded', refreshSpriteFiles);
    return () => {
      cancelled = true;
      window.removeEventListener('gba-studio:assets-reloaded', refreshSpriteFiles);
    };
  }, [settingUtils.projectPathFile, settingUtils.localImagePath]);

  useEffect(() => {
    if (!availableSpriteFileIds) return;
    const available = new Set(availableSpriteFileIds);
    const spriteKeys = (sprite: any) => [
      String(sprite.id ?? '').split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[ -]/g, '_') ?? '',
      String(sprite.filename ?? '').split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[ -]/g, '_') ?? '',
    ];
    const hasFile = (sprite: any) => spriteKeys(sprite).some(key => key && available.has(key));
    const missing = spriteResources.filter(sprite => !sprite._deleted && !sprite._pendingAssetRefresh && !hasFile(sprite));
    const missingIds = new Set(missing.map(sprite => sprite.id));
    const deletedResourceIds = new Set(spriteResources.filter(sprite => sprite._deleted).map(sprite => sprite.id));
    const availableResourceIds = new Set(spriteResources.filter(sprite => !sprite._deleted && hasFile(sprite)).map(sprite => sprite.id));
    const pendingAssetResourceIds = new Set(spriteResources.filter(sprite => !sprite._deleted && sprite._pendingAssetRefresh).map(sprite => sprite.id));
    const hasSpriteSheet = (spriteId: string) => !deletedResourceIds.has(spriteId)
      && (available.has(spriteId.toLowerCase().replace(/[ -]/g, '_')) || availableResourceIds.has(spriteId) || pendingAssetResourceIds.has(spriteId));
    const confirmedPendingIds = new Set(spriteResources.filter(sprite => sprite._pendingAssetRefresh && hasFile(sprite)).map(sprite => sprite.id));
    if (missing.length || confirmedPendingIds.size) setSpriteResources(previous => previous.map(sprite => {
      if (missingIds.has(sprite.id)) return { ...sprite, _deleted: true, _saved: false };
      if (confirmedPendingIds.has(sprite.id)) {
        const { _pendingAssetRefresh: _pending, ...confirmedSprite } = sprite;
        return confirmedSprite;
      }
      return sprite;
    }));
    if (settings?.playerSpriteId && !hasSpriteSheet(settings.playerSpriteId)) {
      setSettings(previous => ({ ...previous, playerSpriteId: '', _saved: false }));
    }
    setScenes(previous => {
      let scenesChanged = false;
      const next = previous.map(scene => {
        let changed = false;
        const actors = (scene.actors ?? []).map(actor => {
          const referencedSpriteId = actor.spriteId;
          if (!referencedSpriteId || hasSpriteSheet(referencedSpriteId)) return actor;
          changed = true;
          return { ...actor, spriteId: '' };
        });
        scenesChanged ||= changed;
        return changed ? { ...scene, actors, _saved: false } : scene;
      });
      return scenesChanged ? next : previous;
    });
  }, [availableSpriteFileIds, scenes, setScenes, setSettings, setSpriteResources, settings?.playerSpriteId, spriteResources]);

  useEffect(() => {
    let cancelled = false;
    const updateSceneVram = async () => {
      if (!selectedScene) {
        setSelectedSceneVram(0);
        return;
      }
      const isBitmapScene = selectedScene.renderMode === 'direct_bitmap' || selectedScene.sceneType === ETypeScene.LOGO || selectedScene.sceneType === ETypeScene.POINTNCLICK;
      if (isBitmapScene) {
        setSelectedSceneVram(calculateSceneVram(selectedScene, backgrounds, spriteResources, settings?.playerSpriteId));
        return;
      }
      const usedBackgroundIds = [...new Set((selectedScene.backgrounds ?? []).map(layer => layer.backgroundId).filter((id): id is string => Boolean(id)))];
      const tileCounts = new Map<string, number>();
      await Promise.all(usedBackgroundIds.map(async backgroundId => {
        const background = backgrounds.find(item => !item._deleted && item.id === backgroundId);
        if (!background?.filename) return;
        const source = joinLocalAssetPath(background.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath, background.filename);
        try {
          // Count separately per resource: duplicate tiles within one image
          // are shared, while independent image assets keep their own VRAM.
          tileCounts.set(backgroundId, await countDistinctImageTiles([source]));
        } catch {
          if (background.imageWidth && background.imageHeight) tileCounts.set(backgroundId, Math.ceil(background.imageWidth / 8) * Math.ceil(background.imageHeight / 8));
        }
      }));
      if (!cancelled) setSelectedSceneVram(calculateSceneVram(selectedScene, backgrounds, spriteResources, settings?.playerSpriteId, tileCounts));
    };
    void updateSceneVram();
    return () => { cancelled = true; };
  }, [backgrounds, selectedScene, settingUtils.localImagePath, settingUtils.localImagePathHD, settings?.playerSpriteId, spriteResources]);

  useEffect(() => {
    let cancelled = false;
    const refreshUsage = async () => {
      try {
        const response = await window.electronAPI.getProjectResourceUsage?.();
        if (!cancelled && response?.status === 'success' && response.usage) setRomUsage(response.usage);
      } catch (error) {
        console.warn('Unable to calculate project ROM usage:', error);
      }
    };
    const timer = window.setTimeout(refreshUsage, 80);
    // Files can also change through import/removal operations outside the
    // current React resource collection (notably music and sound assets).
    const interval = window.setInterval(refreshUsage, 2_000);
    return () => { cancelled = true; window.clearTimeout(timer); window.clearInterval(interval); };
  }, [backgrounds, scenes, scripts, spriteResources, updatedImages]);

  // Tile editing belongs to the selected scene only. This also covers every
  // deselect route (clicking the empty world, deleting a scene, etc.).
  useEffect(() => {
    const isCreatingScene = settingUtils.activeButton === 'add' && settingUtils.activeSubButton === 'Scene';
    if (!elementSelected && !isCreatingScene && (settingUtils.activeButton !== 'select' || settingUtils.activeSubButton)) {
      setSettingUtils(previous => ({ ...previous, activeButton: 'select', activeSubButton: '' }));
      return;
    }
    if (tileEditSceneId && elementSelected?.id !== tileEditSceneId) {
      setSettingUtils(previous => previous.tileEditSceneId
        ? { ...previous, tileEditSceneId: null }
        : previous);
    }
  }, [elementSelected?.id, setSettingUtils, settingUtils.activeButton, settingUtils.activeSubButton, tileEditSceneId]);

  useEffect(() => {
    const handleCameraPreview = (event: Event) => {
      setActiveCameraPreview((event as CustomEvent<CameraPreview | null>).detail ?? null);
    };
    window.addEventListener('gba-studio:camera-preview', handleCameraPreview);
    return () => window.removeEventListener('gba-studio:camera-preview', handleCameraPreview);
  }, []);
  useEffect(() => {
    const handlePreview = (event: Event) => setActorPositionPreview((event as CustomEvent).detail ?? null);
    window.addEventListener('gba-studio:actor-position-preview', handlePreview);
    return () => window.removeEventListener('gba-studio:actor-position-preview', handlePreview);
  }, []);
  const changeSceneTraces = selectedScenePreviews.reduce<ChangeSceneTrace[]>((traces, preview) => {
    if (!selectedScene) return traces;
    const targetScene = scenes.find(scene => !scene._deleted && scene.id === preview.targetSceneId);
    if (!targetScene) return traces;
    // The live preview must match the exact drag group committed on release.
    const isMovingInPreview = (sceneId: string) => Boolean(movingSceneIds?.has(sceneId));
    const liveOffset = draggingSceneOffset;
    const withDraggingOffset = (scene: ISceneSettings) => isMovingInPreview(scene.id) && liveOffset
      ? { ...scene, x: scene.x + liveOffset.x, y: scene.y + liveOffset.y }
      : scene;
    const marker = getChangeSceneMarkerPosition(withDraggingOffset(targetScene), preview, spriteResources.find(item => item.id === settings?.playerSpriteId));
    return [...traces, {
      id: preview.id,
      path: getChangeSceneTracePath(withDraggingOffset(selectedScene), withDraggingOffset(targetScene), preview, marker),
    }];
  }, []);

  const handleMoveChangeScenePreview = useCallback((eventId: string, targetSceneId: string, x: number, y: number) => {
    if(!selectedScene) return;
    setScenes(previous => {
      const sourceScene = previous.find(scene => scene.id === selectedScene.id);
      if(!sourceScene) return previous;

      const updatedSourceScene = moveChangeScenePreview(sourceScene, eventId, targetSceneId, x, y);
      // The properties panel keeps its own selected object. Keep it in sync
      // with the scene state so X/Y and target refresh while dragging.
      setElementSelected((current: ISceneSettings | null) => current?.id === selectedScene.id ? updatedSourceScene : current);
      return previous.map(scene => scene.id === selectedScene.id ? updatedSourceScene : scene);
    });
  }, [selectedScene?.id, setScenes, setElementSelected]);

  const wrapperRef = useRef<ReactZoomPanPinchRef | null>(null);
  const sceneDragScaleRef = useRef<number | null>(null);
  const inspectorHoverCleanup = useRef<(() => void) | null>(null);
  const restoreInspectorHover = () => {
    inspectorHoverCleanup.current?.();
    inspectorHoverCleanup.current = null;
  };
  useEffect(() => () => inspectorHoverCleanup.current?.(), []);
  const previousTileEditSceneIdRef = useRef(settingUtils.tileEditSceneId);
  const recenterPreferencesRef = useRef({ enabled: true, scenes: true, actors: true, triggers: true });
  const [canvasPreferencesLoaded, setCanvasPreferencesLoaded] = useState(false);

  useEffect(() => {
    const applyPreferences = (preferences: { gameWorldPanInertia?: boolean; gameWorldMovementMode?: 'free' | 'grid'; sceneObjectSnapSize?: 8 | 16; gameWorldRecenterEnabled?: boolean; gameWorldRecenterScenes?: boolean; gameWorldRecenterActors?: boolean; gameWorldRecenterTriggers?: boolean } | null | undefined) => {
      setPanInertia(preferences?.gameWorldPanInertia !== false);
      setSceneMovementMode(preferences?.gameWorldMovementMode === 'free' ? 'free' : 'grid');
      setSceneObjectSnapSize(preferences?.sceneObjectSnapSize === 16 ? 16 : 8);
      recenterPreferencesRef.current = {
        enabled: preferences?.gameWorldRecenterEnabled !== false,
        scenes: preferences?.gameWorldRecenterScenes !== false,
        actors: preferences?.gameWorldRecenterActors !== false,
        triggers: preferences?.gameWorldRecenterTriggers !== false,
      };
      setCanvasPreferencesLoaded(true);
    };
    let cancelled = false;
    void window.electronAPI.loadPreferences?.().then((preferences: any) => {
      if (!cancelled) applyPreferences(preferences);
    }).catch((error: unknown) => { console.warn('Unable to load Game World preferences:', error); if (!cancelled) applyPreferences(undefined); });
    const onPreferencesChanged = (event: Event) => applyPreferences((event as CustomEvent).detail);
    window.addEventListener('gba-studio:game-world-preferences', onPreferencesChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('gba-studio:game-world-preferences', onPreferencesChanged);
    };
  }, []);

  const isDeleting = useRef(false);
  const enterObjectPlacementMode = (kind: 'Actor' | 'Trigger') => {
    setSettingUtils(previous => ({
      ...previous,
      activeButton: 'add',
      activeSubButton: kind,
      tileEditSceneId: elementSelected?._resourceType === 'scene' ? elementSelected.id : previous.tileEditSceneId,
      tileEditLayerId: 4,
    }));
  };
  const beginSceneCreation = () => {
    setElementSelected(null);
    // Creating scenes is a world-level tool. It must leave tile editing, but
    // it must not clear the Add Scene tool that the next world click needs.
    setSettingUtils(previous => ({
      ...previous,
      activeButton: 'add',
      activeSubButton: 'Scene',
      tileEditSceneId: null,
      tileEditLayerId: null,
      activeSceneObject: null,
      activeTriggerId: null,
      selectedSceneIds: [],
    }));
  };

  useEffect(() => {
    const prepareScenePlacement = (event: Event) => {
      const placement = (event as CustomEvent<{ id: string; mode: 'copy' | 'cut' }>).detail;
      if (!placement?.id) return;
      setPendingScenePlacement(placement);
      beginSceneCreation();
    };
    const updateClipboard = (event: Event) => setClipboardSceneId((event as CustomEvent<{ id: string } | null>).detail?.id ?? null);
    window.addEventListener('gba-studio:start-scene-placement', prepareScenePlacement);
    window.addEventListener('gba-studio:scene-clipboard-changed', updateClipboard);
    return () => {
      window.removeEventListener('gba-studio:start-scene-placement', prepareScenePlacement);
      window.removeEventListener('gba-studio:scene-clipboard-changed', updateClipboard);
    };
  }, []);
  const toggleTileGrid = () => {
    setUserSettings(previous => ({ ...previous, showTileEditorGrid: !(previous.showTileEditorGrid ?? true), _saved: false }));
  };
  const setTileGridSize = (gridSize: 8 | 16) => {
    if (userSettings.tileEditorGridSize === gridSize) return;
    setUserSettings(previous => ({
      ...previous,
      tileEditorGridSize: gridSize,
      _saved: false,
    }));
  };

  useEffect(() => {
    if (tileEditSceneId && settingUtils.tileEditLayerId === 4 && (settingUtils.activeButton === 'tiles' || settingUtils.activeButton === 'colorize')) {
      setSettingUtils(previous => ({ ...previous, activeButton: 'select', activeSubButton: '' }));
    }
  }, [setSettingUtils, settingUtils.activeButton, settingUtils.tileEditLayerId, tileEditSceneId]);

  // Actions to FloatButtons
  const actions: IActions[] = [
    {
      key: 'select',
      icon: <AimOutlined />,
      tooltip: 'Select (v)',
      active: settingUtils.activeButton == 'select',
    },
    {
      key: 'add',
      type: SubMenuType.DROPDOWN,
      icon: <AppstoreAddOutlined />,
      active: settingUtils.activeButton == 'add',
      subMenu: {
        items: [
          ...(selectedScene ? [
            { key: 'Actor', icon: <AuditOutlined />, tooltip: 'Add Actor(a)', active: settingUtils.activeSubButton == 'Actor', onClick: () => enterObjectPlacementMode('Actor') },
            { key: 'Trigger', icon: <PlusSquareFilled />, tooltip: 'Add Trigger(t)', active: settingUtils.activeSubButton == 'Trigger', onClick: () => enterObjectPlacementMode('Trigger') },
          ] : []),
          { key: 'Scene', icon: <PictureFilled />, tooltip: 'Add Scene(s)', active: settingUtils.activeSubButton == 'Scene', onClick: beginSceneCreation},
        ],
      },
    },
    ...(tileEditSceneId ? [{
      key: 'erase',
      icon: <ClearOutlined />,
      tooltip: 'Eraser (e)',
      active: settingUtils.activeButton == 'erase',
      // onClick: () => setPaintMode('erase')
      subMenu: {
        type: SubMenuType.POPOVER,
        items: [
          { key: '8px', icon: <ExpandOutlined />, iconSize: 16, tooltip: 'Pincel 8 px', active: settingUtils.activeSubButton == '8px', onClick: () => <></> },
          { key: '16px', icon: <ExpandOutlined />, iconSize: 24, tooltip: 'Pincel 16 px', active: settingUtils.activeSubButton == '16px', onClick: () => undefined },
          { key: 'subAction1', icon: <ExperimentOutlined />,  tooltip: 'New Command (em breve)', disabled: true, separator: true, active: settingUtils.activeSubButton == 'subAction1', onClick: () => <></>},
          { key: 'subAction2', icon: <CloseSquareOutlined />, tooltip: 'New Command (em breve)', disabled: true, active: settingUtils.activeSubButton == 'subAction2', onClick: () => <></>},
        ],
      }
    }] : []),
    ...(tileEditSceneId && Number(settingUtils.tileEditLayerId) === 4 ? [{
      key: 'collision',
      icon: <InsertRowAboveOutlined />,
      tooltip: 'Collisions (c)',
      active: settingUtils.activeButton == 'collision',
      onClick: () => setSettingUtils(previous => ({ ...previous, activeButton: 'collision', activeSubButton: previous.activeSubButton || 'subAction1' })),
      subMenu: {
        type: SubMenuType.POPOVER,
        items: [
          { key: 'subAction1', icon: <ExpandOutlined />, iconSize: 16, tooltip: 'Pincel 8 px', active: settingUtils.collisionBrushSize !== 'bucket', onClick: () => setSettingUtils(previous => ({ ...previous, collisionBrushSize: '8px' })) },
          { key: 'bucket', icon: <BgColorsOutlined />, tooltip: 'Balde de tinta', separator: true, active: settingUtils.collisionBrushSize === 'bucket', onClick: () => setSettingUtils(previous => ({ ...previous, collisionBrushSize: 'bucket' })) },
          { key: 'collision-solid-8', icon: <BlockOutlined />, iconSize: 16, tooltip: 'Sólido (padrão)', active: (settingUtils.collisionSide ?? 'solid') === 'solid', onClick: () => setSettingUtils(previous => ({ ...previous, collisionSide: 'solid' })) },
          { key: 'collision-top-8', icon: <ArrowUpOutlined />, tooltip: 'Colisão no topo', active: settingUtils.collisionSide === 'top', onClick: () => setSettingUtils(previous => ({ ...previous, collisionSide: 'top' })) },
          { key: 'collision-down-8', icon: <ArrowDownOutlined />, tooltip: 'Colisão embaixo', active: settingUtils.collisionSide === 'down', onClick: () => setSettingUtils(previous => ({ ...previous, collisionSide: 'down' })) },
          { key: 'collision-left-8', icon: <ArrowLeftOutlined />, tooltip: 'Colisão à esquerda', active: settingUtils.collisionSide === 'left', onClick: () => setSettingUtils(previous => ({ ...previous, collisionSide: 'left' })) },
          { key: 'collision-right-8', icon: <ArrowRightOutlined />, tooltip: 'Colisão à direita', active: settingUtils.collisionSide === 'right', onClick: () => setSettingUtils(previous => ({ ...previous, collisionSide: 'right' })) },
          ...(['Platformer', 'Platform'].includes(String((scenes.find(scene => scene.id === tileEditSceneId) ?? selectedScene)?.sceneType)) ? [{
            key: 'collision-ladder',
            icon: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1v14M12 1v14M4 4h8M4 8h8M4 12h8" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>,
            tooltip: t('collisions.ladderHint'),
            active: settingUtils.collisionSide === 'ladder',
            onClick: () => setSettingUtils(previous => ({ ...previous, collisionSide: 'ladder' })),
          }] : []),
        ],
      }
    }] : []),
    ...(tileEditSceneId && settingUtils.tileEditLayerId !== 4 ? [{
      key: 'colorize',
      icon: <FormatPainterFilled />,
      tooltip: 'Colorize (z)',
      active: settingUtils.activeButton == 'colorize',
      // onClick: () => setPaintMode('erase')
      subMenu: {
        type: SubMenuType.POPOVER,
        items: [
          { key: 'subAction1', icon: <FormatPainterOutlined />, iconSize: 16, tooltip: 'Colorize palette', active: settingUtils.activeSubButton == 'subAction1', onClick: () => <></> },
          { key: 'subAction2', icon: <ClearOutlined />, iconSize: 16, tooltip: 'Erase colorize palette', active: settingUtils.activeSubButton == 'subAction2', onClick: () => <></> },
          { key: 'subAction3', icon: <BgColorsOutlined />, tooltip: 'Colorize matching tiles', active: settingUtils.activeSubButton == 'subAction3', onClick: () => <></>},
          { key: 'subAction4', icon: <FormatPainterOutlined />, tooltip: 'Em breve', disabled: true, separator: true, active: settingUtils.activeSubButton == 'subAction4', onClick: () => <></>},
          { key: 'subAction5', icon: <SelectOutlined />, tooltip: 'Em breve', disabled: true, active: settingUtils.activeSubButton == 'subAction5', onClick: () => <></>},
          { key: 'subAction6', icon: <PicLeftOutlined />, tooltip: 'Em breve', disabled: true, active: settingUtils.activeSubButton == 'subAction6', onClick: () => <></>},
          { key: 'subAction7', icon: <BorderInnerOutlined />, tooltip: 'Em breve', disabled: true, active: settingUtils.activeSubButton == 'subAction7', onClick: () => <></>},
        ],
      }
    }] : []),
    ...(tileEditSceneId && settingUtils.tileEditLayerId !== 4 ? [{
      key: 'tiles',
      icon: <FormatPainterOutlined />,
      tooltip: 'Tiles (l)',
      active: settingUtils.activeButton == 'tiles',
      subMenu: {
        type: SubMenuType.POPOVER,
        items: [
          { key: 'pencil', icon: <EditOutlined />, tooltip: 'Tile pencil (p)', active: settingUtils.activeSubButton == 'pencil', onClick: () => undefined },
          { key: 'square', icon: <BorderInnerOutlined />, tooltip: 'Tile square (q)', active: settingUtils.activeSubButton == 'square', onClick: () => undefined },
          { key: 'same', icon: <SelectOutlined />, tooltip: 'Paint matching tiles', active: settingUtils.activeSubButton == 'same', separator: true, onClick: () => undefined },
          { key: 'flip-horizontal', icon: <SwapOutlined />, tooltip: 'Flip tiles horizontally', active: settingUtils.tileFlipHorizontal === true, onClick: () => setSettingUtils(previous => ({ ...previous, tileFlipHorizontal: !previous.tileFlipHorizontal })) },
          { key: 'flip-vertical', icon: <SwapOutlined style={{ transform: 'rotate(90deg)' }} />, tooltip: 'Flip tiles vertically', active: settingUtils.tileFlipVertical === true, onClick: () => setSettingUtils(previous => ({ ...previous, tileFlipVertical: !previous.tileFlipVertical })) },
        ],
      },
    }] : []),
    ...(tileEditSceneId ? [{
      key: 'grid',
      icon: <BorderInnerOutlined />,
      tooltip: t('world.tileGrid'),
      active: settingUtils.activeButton === 'grid',
      selectOnly: true,
      subMenu: {
        type: SubMenuType.POPOVER,
        items: [
          { key: 'grid-visible', icon: (userSettings.showTileEditorGrid ?? true) ? <EyeOutlined /> : <EyeInvisibleOutlined />, tooltip: `${t((userSettings.showTileEditorGrid ?? true) ? 'world.hideTileGrid' : 'world.showTileGrid')} (g)`, active: userSettings.showTileEditorGrid ?? true, separator: true, onClick: toggleTileGrid },
          { key: 'grid-8', icon: <span>8</span>, iconSize: 16, tooltip: t('world.tileGrid8'), active: (userSettings.tileEditorGridSize ?? 8) === 8, onClick: () => setTileGridSize(8) },
          { key: 'grid-16', icon: <span>16</span>, iconSize: 16, tooltip: t('world.tileGrid16'), active: userSettings.tileEditorGridSize === 16, onClick: () => setTileGridSize(16) },
        ],
      },
    }] : []),
    ...(settingUtils.activeSceneObject ? [{
      key: 'deselect-scene-object',
      icon: <CloseSquareOutlined />,
      tooltip: `Deselect ${settingUtils.activeSceneObject.type === 'actor' ? 'Actor' : 'Trigger'}`,
      onClick: () => setSettingUtils(previous => ({ ...previous, activeButton: 'select', activeSubButton: '', activeSceneObject: null, activeTriggerId: null })),
    }] : []),
  ];
  
  // Carregar Elementos do BE
  // useEffect(() => {
    // const startFetchElements = async () => {
    //   try {
    //     const response = await window.electronAPI.fetchSettings('scene');
    //     if (response.status === 'success') {
    //       console.log('..: Response fetchElements:', response.settings);
    //       // Atualize a interface com os elementos
    //       setScenes(response.settings as ISceneSettings[]);
    //     } else {
    //       console.error('Error fetchElements:', response.message);
    //     }
    //   } catch (error) {
    //     console.error('Error catch fetchElements:', error);
    //   }
    // };

    // startFetchElements();

    // Configurar listener para atualizações
    // window.electronAPI.updateSettings((updatedSettings: any) => {
    //   console.log('..: onUpdateSettings scenes chegando:', updatedSettings);
    //   setScenes(updatedSettings); // Atualizar lista de elementos
    // });
  // }, []);

  // Deletar Elemento
  useEffect(() => {
    const deleteSelection = () => {
      const currentSelection = elementSelectedRef.current;
      const currentUtils = settingUtilsRef.current;
      if (currentUtils.activeSceneObject && !isDeleting.current) {
        isDeleting.current = true;
        showConfirmSceneObject(currentUtils.activeSceneObject);
        return;
      }

      // In scene edit mode, Delete targets objects, never the parent scene.
      if (currentUtils.tileEditSceneId) return;

      if (currentSelection != null && !isDeleting.current) {
        console.log("..: Confirme deletando elemento!!", isDeleting.current)
        isDeleting.current = true;
        const selectedSceneIds = currentSelection._resourceType === 'script' || currentSelection._resourceType === 'variables'
          ? undefined
          : (currentUtils.selectedSceneIds ?? []).filter(id => scenesRef.current.some(scene => scene.id === id && !scene._deleted));
        showConfirm(currentSelection, selectedSceneIds?.length ? selectedSceneIds : undefined);
      }
    };

    const deleteSceneById = (event: Event) => {
      const sceneId = (event as CustomEvent<string>).detail;
      const scene = scenes.find(item => item.id === sceneId && !item._deleted);
      if (!scene || isDeleting.current) return;
      isDeleting.current = true;
      showConfirm(scene, [scene.id]);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isModalOpen()) return;
      const target = event.target as HTMLElement | null;
      const activeElement = document.activeElement as HTMLElement | null;
      const isEditingField = (element: HTMLElement | null) => Boolean(element?.closest('input, textarea, [contenteditable="true"]'));

      if (isEditingField(target) || isEditingField(activeElement)) return;

      const hasClipboardModifier = (event.ctrlKey || event.metaKey) && !event.altKey;
      const clipboardKey = event.key.toLowerCase();
      const selectedObject = settingUtils.activeSceneObject;
      if (event.key === 'Escape' && selectedObject) {
        event.preventDefault();
        const ownerScene = scenes.find(scene => scene.id === selectedObject.sceneId && !scene._deleted);
        if (ownerScene) setElementSelected(ownerScene);
        setSettingUtils(previous => ({
          ...previous,
          activeButton: 'select',
          activeSubButton: '',
          activeSceneObject: null,
          activeTriggerId: null,
          ...(ownerScene ? { selectedSceneIds: [ownerScene.id] } : {}),
        }));
        return;
      }
      if (hasClipboardModifier && (clipboardKey === 'c' || clipboardKey === 'x') && selectedObject) {
        const sourceScene = scenes.find(scene => scene.id === selectedObject.sceneId && !scene._deleted);
        const sourceCollection = selectedObject.type === 'actor' ? sourceScene?.actors : sourceScene?.triggers;
        const object = sourceCollection?.find(item => item.id === selectedObject.id);
        if (sourceScene && object) {
          event.preventDefault();
          event.stopImmediatePropagation();
          sceneObjectClipboard = { type: selectedObject.type, object: JSON.parse(JSON.stringify(object)) };
          if (clipboardKey === 'x') {
            const collectionKey = selectedObject.type === 'actor' ? 'actors' : 'triggers';
            const updated = { ...sourceScene, [collectionKey]: sourceCollection?.filter(item => item.id !== selectedObject.id), _saved: false };
            setScenes(previous => previous.map(scene => scene.id === sourceScene.id ? updated : scene));
            if (elementSelected?.id === sourceScene.id) setElementSelected(updated);
            setSettingUtils(previous => ({ ...previous, activeSceneObject: null, activeTriggerId: null }));
          }
          return;
        }
      }
      if (hasClipboardModifier && clipboardKey === 'v' && sceneObjectClipboard && selectedScene) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const { type, object } = sceneObjectClipboard;
        const id = uuidv4();
        const mousePosition = sceneMousePositionRef.current?.sceneId === selectedScene.id ? sceneMousePositionRef.current : null;
        const positioned = mousePosition ? {
          x: Math.max(0, Math.round(mousePosition.x / 8) * 8),
          y: Math.max(0, Math.round(mousePosition.y / 8) * 8),
        } : { x: object.x, y: object.y };
        const clone = type === 'actor'
          ? { ...object, ...positioned, id, actorId: id, onInteractScript: cloneScriptEvents(object.onInteractScript), onInitScript: cloneScriptEvents(object.onInitScript), onUpdateScript: cloneScriptEvents(object.onUpdateScript) }
          : { ...object, ...positioned, id, sceneId: selectedScene.id, script: cloneScriptEvents(object.script), onEnterScript: cloneScriptEvents(object.onEnterScript), onLeaveScript: cloneScriptEvents(object.onLeaveScript), onInteractScript: cloneScriptEvents(object.onInteractScript), onInitScript: cloneScriptEvents(object.onInitScript), onUpdateScript: cloneScriptEvents(object.onUpdateScript) };
        const collectionKey = type === 'actor' ? 'actors' : 'triggers';
        const updated = { ...selectedScene, [collectionKey]: [...((selectedScene as any)[collectionKey] ?? []), clone], _saved: false };
        setScenes(previous => previous.map(scene => scene.id === selectedScene.id ? updated : scene));
        setElementSelected(updated);
        setSettingUtils(previous => ({ ...previous, tileEditSceneId: selectedScene.id, tileEditLayerId: 4, activeSceneObject: { sceneId: selectedScene.id, type, id }, activeTriggerId: type === 'trigger' ? id : null }));
        return;
      }

      if (settingUtils.tileEditSceneId && ['1', '2', '3', '4', '5'].includes(event.key)) {
        const editingScene = scenes.find(scene => scene.id === settingUtils.tileEditSceneId);
        const isSingleLayerScene = editingScene?.sceneType === ETypeScene.LOGO || editingScene?.sceneType === ETypeScene.POINTNCLICK;
        const keyIndex = Number(event.key);
        const layerId = isSingleLayerScene
          ? keyIndex === 2 ? 4 : null
          : keyIndex === 5 ? 4 : keyIndex - 1;
        if (layerId !== null) {
          event.preventDefault();
          setSettingUtils(previous => ({
            ...previous,
            tileEditLayerId: layerId,
            ...(layerId === 4 && (previous.activeButton === 'tiles' || previous.activeButton === 'colorize')
              ? { activeButton: 'select', activeSubButton: '' }
              : {}),
          }));
          return;
        }
      }

      if (event.key === 'Escape' && settingUtils.activeButton === 'add' && settingUtils.activeSubButton === 'Scene') {
        event.preventDefault();
        setPendingScenePlacement(null);
        setSettingUtils(previous => ({
          ...previous,
          activeButton: 'select',
          activeSubButton: '',
          tileEditSceneId: null,
          tileEditLayerId: null,
        }));
        return;
      }

      if (event.key === 'Delete') deleteSelection();
    };

    document.addEventListener('keydown', handleKeyDown);
    window.electronAPI?.on?.('scene-delete', deleteSelection);
    window.addEventListener('gba-studio:scene-delete', deleteSceneById);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.electronAPI?.removeListener?.('scene-delete', deleteSelection);
      window.removeEventListener('gba-studio:scene-delete', deleteSceneById);
    };
  }, [elementSelected, scenes, selectedScene, settings, settingUtils.activeButton, settingUtils.activeSceneObject, settingUtils.activeSubButton, settingUtils.selectedSceneIds, settingUtils.tileEditSceneId]);

  const showConfirmSceneObject = (selectedObject: { sceneId: string; type: 'actor' | 'trigger'; id: string }) => {
    const scene = scenes.find(item => item.id === selectedObject.sceneId);
    const collection = selectedObject.type === 'actor' ? scene?.actors : scene?.triggers;
    const object = collection?.find(item => item.id === selectedObject.id);
    if (!scene || !object) { isDeleting.current = false; return; }
    const removedName = object.name || selectedObject.id;
    const nextScenes = scenes.map(item => {
      const withoutObject = item.id !== scene.id ? item : {
        ...item,
        [selectedObject.type === 'actor' ? 'actors' : 'triggers']: collection?.filter(entry => entry.id !== selectedObject.id),
      };
      if (selectedObject.type !== 'actor') return item.id === scene.id ? { ...withoutObject, _saved: false } : item;
      const cleaned = disableDeletedActorReferences(withoutObject, selectedObject.id, removedName);
      return cleaned.changed || item.id === scene.id ? { ...cleaned.value, _saved: false } : item;
    });
    setScenes(nextScenes);
    const updatedScene = nextScenes.find(item => item.id === scene.id) ?? scene;
    setElementSelected(updatedScene);
    if (selectedObject.type === 'actor') {
      let globalScriptsChanged = false;
      const nextGlobalScripts = scripts.scripts.map(script => {
        const cleaned = disableDeletedActorReferences(script, selectedObject.id, removedName);
        if (!cleaned.changed) return script;
        globalScriptsChanged = true;
        return { ...cleaned.value, _saved: false };
      });
      if (globalScriptsChanged) setScripts({ ...scripts, scripts: nextGlobalScripts, _saved: false });
    }
    setSettingUtils(previous => ({ ...previous, activeSceneObject: null, activeTriggerId: null, selectedSceneIds: [scene.id] }));
    isDeleting.current = false;
  };

  // Scene, Script and Variable deletes are immediate; history provides Undo.
  const showConfirm = (elementDelete: any, sceneIds?: string[]) => {
    const idsToDelete = sceneIds?.length ? sceneIds : [elementDelete.id];
    const resourceType = elementDelete._resourceType;
    if (resourceType === 'script') {
      const deletedId = String(elementDelete.id);
      setScenes(previous => previous.map(scene => {
        const cleaned = clearDeletedEventReferences(scene, 'scriptId', deletedId, 'Script');
        return cleaned.changed ? { ...cleaned.value, _saved: false } : scene;
      }));
      setScripts(previous => {
        let changed = false;
        const nextScripts = previous.scripts.map(script => {
        const cleaned = clearDeletedEventReferences(script, 'scriptId', deletedId, 'Script');
        const isDeleted = script.id === elementDelete.id;
        changed ||= cleaned.changed || isDeleted;
        return cleaned.changed || isDeleted ? { ...cleaned.value, ...(isDeleted ? { _deleted: true } : {}), _saved: false } : script;
        });
        return changed ? { ...previous, scripts: nextScripts, _saved: false } : previous;
      });
    } else if (resourceType === 'variables') {
      const deletedId = String(elementDelete.id);
      setScenes(previous => previous.map(scene => {
        const cleaned = clearDeletedEventReferences(scene, 'variableId', deletedId, 'Variable');
        return cleaned.changed ? { ...cleaned.value, _saved: false } : scene;
      }));
      setScripts(previous => {
        let changed = false;
        const nextScripts = previous.scripts.map(script => {
          const cleaned = clearDeletedEventReferences(script, 'variableId', deletedId, 'Variable');
          changed ||= cleaned.changed;
          return cleaned.changed ? { ...cleaned.value, _saved: false } : script;
        });
        return changed ? { ...previous, scripts: nextScripts, _saved: false } : previous;
      });
      setVariables(previous => ({ ...previous, variables: previous.variables.map(variable => variable.id === elementDelete.id ? { ...variable, _saved: false, _deleted: true } : variable), _saved: false }));
    } else {
      idsToDelete.forEach(deleteCachedSceneCanvas);
      const deletedIds = new Set(idsToDelete);
      setScenes(previous => previous.map(scene => {
        const cleared = clearDeletedSceneReferences(scene, deletedIds);
        if (idsToDelete.includes(scene.id)) return { ...cleared.value, _saved: false, _deleted: true };
        return cleared.changed ? { ...cleared.value, _saved: false } : scene;
      }));
      setScripts(previous => {
        let changed = false;
        const nextScripts = previous.scripts.map(script => {
          const cleared = clearDeletedSceneReferences(script, deletedIds);
          if (!cleared.changed) return script;
          changed = true;
          return { ...cleared.value, _saved: false };
        });
        return changed ? { ...previous, scripts: nextScripts, _saved: false } : previous;
      });
      if (idsToDelete.includes(settings.startSceneId)) {
        const nextStartSceneId = scenes.find(scene => !scene._deleted && !idsToDelete.includes(scene.id))?.id ?? '';
        setSettings(previous => ({ ...previous, startSceneId: nextStartSceneId, _saved: false }));
      }
      setSettingUtils(previous => ({ ...previous, selectedSceneIds: [] }));
    }
    setElementSelected(null);
    isDeleting.current = false;
  };

  // Lógica para deselecionar quando clicar fora do elemento
  const handleClickOutside = (event: any) => {
    if (!event.target.closest('.game-element')) {
      setElementSelected(null);
      setSettingUtils(previous => ({ ...previous, tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null, selectedSceneIds: [], activeButton: 'select', activeSubButton: '' }));
    }
  };

  // Lógica selecionar Objeto
  const handleSelect = useCallback((scene: ISceneSettings, event?: React.MouseEvent) => {
    const current = settingUtils.selectedSceneIds ?? (elementSelected?.id ? [elementSelected.id] : []);
    // Canvas tools (Erase, Collision, painting, etc.) bubble their final click
    // to the scene container. Keep the current viewport when that happens
    // inside the scene already being edited, even if the multi-selection list
    // has temporarily fallen out of sync with the selected scene.
    const isEditingThisScene = settingUtils.tileEditSceneId === scene.id;
    const shouldRecenter = !isEditingThisScene && !current.includes(scene.id);
    const ids = event?.shiftKey
      ? (current.includes(scene.id) ? current.filter(id => id !== scene.id) : [...current, scene.id])
      : [scene.id];
    const activeId = event?.shiftKey && current.includes(scene.id) ? ids.at(-1) : scene.id;
    const activeScene = scenes.find(item => item.id === activeId);
    setSettingUtils(previous => ({ ...previous, selectedSceneIds: ids, worldSceneSearch: sceneSearchAfterSelection(previous.worldSceneSearch, activeScene) }));
    setElementSelected(activeScene ? { ...activeScene, _recenter: shouldRecenter || undefined } : null);
  }, [elementSelected?.id, scenes, setElementSelected, setSettingUtils, settingUtils.selectedSceneIds, settingUtils.tileEditSceneId]);

  const selectAllScenes = useCallback(() => {
    const activeScenes = scenes.filter(scene => !scene._deleted);
    if (activeScenes.length === 0) return;
    const primaryScene = activeScenes.find(scene => scene.id === elementSelected?.id) ?? activeScenes[0];
    setSettingUtils(previous => ({ ...previous, selectedSceneIds: activeScenes.map(scene => scene.id) }));
    setElementSelected(primaryScene);
  }, [elementSelected?.id, scenes, setElementSelected, setSettingUtils]);

  const selectAllScenesRef = useRef(selectAllScenes);
  useEffect(() => {
    selectAllScenesRef.current = selectAllScenes;
  }, [selectAllScenes]);

  useEffect(() => {
    return window.electronAPI?.subscribe?.('scene-select-all', () => selectAllScenesRef.current());
  }, []);

   // função utilitária para calcular o tamanho do mundo
  const calculateWorldSize = (scenes: ISceneSettings[]) => {
    const activeScenes = scenes.filter(scene => !scene._deleted);
    const maxWidth = Math.max(1920, ...activeScenes.map(el => el.x + el.width + 512));
    const maxHeight = Math.max(1080, ...activeScenes.map(el => el.y + el.height + 512));
    return { width: maxWidth, height: maxHeight };
  };

  // useEffect para inicialização
  useEffect(() => {
    setWorldSize(calculateWorldSize(scenes));
    setLoading(false);
  }, [scenes]);

  // Movendo tela de trabalho
  const handleMoveBackStart = () => {
    restoreInspectorHover();
    inspectorHoverCleanup.current = suspendInspectorHover();
    sceneDragScaleRef.current = getWorldScale();
    setDraggingSceneOffset(null);
    setIsMovedBackground(true);
    // console.log(isMovedBackground);
  };

  const getWorldScale = () => {
    const scale = wrapperRef.current?.instance?.transformState?.scale;
    return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : zoomLevel;
  };
  const getWorldPositionFromClient = (clientX: number, clientY: number) => {
    const instance = wrapperRef.current?.instance;
    const viewport = instance?.wrapperComponent ?? worldViewportRef.current;
    const rect = viewport?.getBoundingClientRect();
    const transform = instance?.transformState;
    const scale = typeof transform?.scale === 'number' && transform.scale > 0 ? transform.scale : zoomLevel;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - finiteNumber(transform?.positionX, worldScrollX)) / scale,
      y: (clientY - rect.top - finiteNumber(transform?.positionY, worldScrollY)) / scale,
    };
  };
  const snapSceneCoordinate = (coordinate: number, origin: number) => origin + Math.round((coordinate - origin) / 16) * 16;
  const getScenePlacement = (worldX: number, worldY: number) => ({
    x: snapSceneCoordinate(worldX - 120, leftLimite),
    y: snapSceneCoordinate(worldY - 80, titleHeight),
  });
  const getSceneWorldMovement = (delta: { x: number; y: number }) => {
    const scale = sceneDragScaleRef.current ?? getWorldScale();
    const snapMovement = (pixels: number) => sceneMovementMode === 'grid'
      ? Math.round(pixels / scale / 16) * 16
      : Math.round(pixels / scale);
    const movement = {
      x: snapMovement(delta.x),
      y: snapMovement(delta.y),
    };
    return movement;
  };

  const handleDragMove = (event: DragMoveEvent) => {
    // Keep the SVG trace aligned with the same zoom-adjusted transform used
    // by the draggable scene while it is still being moved.
    const scene = scenesRef.current.find(item => item.id === String(event.active.id));
    if (!scene) return;
    const movement = getSceneWorldMovement(event.delta);
    setDraggingSceneOffset({
      id: String(event.active.id),
      ...movement,
    });
  };

  // Lógica arranste do elemento
  const handleDragEnd = (event: DragEndEvent) =>{
    const { active, delta } = event;
    const draggedElement = scenesRef.current.find(el => el.id === active.id);
    if (draggedElement) {
      // Persist the exact same world-space delta that is used for the live
      // dnd transform. Raw pointer pixels are incorrect whenever the world
      // is zoomed, and left the Change Scene arrival preview behind.
      // event.delta is the pointer movement in viewport pixels. Recompute the
      // same world-space movement used by the live preview instead of
      // reusing a potentially stale state update from the final pointer event.
      // Commit the exact offset rendered by the last drag preview. Pointer-up
      // may arrive with a newer delta than the final onDragMove frame, which
      // otherwise makes the card jump as soon as the preview is removed.
      const latestPreview = draggingSceneOffset;
      const movement = latestPreview?.id === String(active.id)
        ? { id: String(active.id), x: latestPreview.x, y: latestPreview.y }
        : { id: String(active.id), ...getSceneWorldMovement(delta) };
      const newX = draggedElement.x + movement.x;
      const newY = draggedElement.y + movement.y;

      const clampedX = newX;
      const clampedY = newY;

      // Ajusta a posição do elemento arrastado
      const ids = selectedSceneIds.includes(String(active.id)) ? selectedSceneIds : [String(active.id)];
      const movedPositions = new Map(scenesRef.current.filter(scene => ids.includes(scene.id)).map(scene => [scene.id, {
        x: scene.id === active.id ? clampedX : scene.x + movement.x,
        y: scene.id === active.id ? clampedY : scene.y + movement.y,
      }]));
      setScenes(prev => prev.map(el => {
        if (!ids.includes(el.id)) return el;
        const x = el.id === active.id ? clampedX : el.x + movement.x;
        const y = el.id === active.id ? clampedY : el.y + movement.y;
        return { ...el, x, y, editorPosition: { x, y }, _saved: false };
      }));
      // The inspector edits the selection snapshot. Keep its world position
      // in sync so a later field edit cannot write the pre-drag position back.
      setElementSelected(current => {
        if (!current || !ids.includes(current.id)) return current;
        const position = movedPositions.get(current.id);
        if (!position) return current;
        const { x, y } = position;
        return { ...current, x, y, editorPosition: { x, y }, _saved: false };
      });

      const newWorld = calculateWorldSize([
        ...scenes.map(el => {
          if (!ids.includes(el.id)) return el;
          const x = el.id === active.id ? clampedX : el.x + movement.x;
          const y = el.id === active.id ? clampedY : el.y + movement.y;
          return { ...el, x, y };
        })
      ]);

      if (newWorld.width !== worldSize.width || newWorld.height !== worldSize.height) {
        setWorldSize(newWorld);
      }

      setIsMovedBackground(false);
    }
    setDraggingSceneOffset(null);
    sceneDragScaleRef.current = null;
    restoreInspectorHover();
  };

  const handleImageUpload = async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const filename = file.name;

    if (isImage) {
      console.log("O arquivo é uma imagem.");
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          if (e.target && typeof e.target.result === 'string') {
            
            const data = e.target.result.split(',')[1]; // Remove o prefixo "data:image/..."
          
            console.log('..: Imagem filename:', filename);
            console.log('..: Imagem base64:', data);
            
            const response = await window.electronAPI.saveImage(null, filename, data);
    
            if (response.status === 'success') {
              // alert(response.message);
              notification.success({
                message: `Saving image`,
                description:
                  `Image copied successfully: ${response.message}`,
                  // icon: <CheckCircleFilled style={{ color: token.colorSuccess }} />,
                showProgress: true,
                onClick: () => handleOpenProjectFolderWithPath(response.message),
              });
            } else {
              // alert(response.message);
              notification.error({
                message: `Saving image - ${response.message}`,
                description:
                  'Something went wrong',
                  // icon: <InfoCircleFilled style={{ color: token.colorError }} />,
                showProgress: true,
              });
            }
          }
        } catch (error) {
          console.error('Error trying to save image:', error);
          message.error(`Error trying to save image: ${filename}`);
        }
      };
    
      reader.readAsDataURL(file);
    } else {
      console.log("Tipo de arquivo inválido:", file.type);
      message.error(`Invalid file type ${filename}`);
    }
  };

  // Lógica para dropar imagem no projeto
  const handleDropOrCreate = (event: React.MouseEvent<HTMLDivElement> | React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Previne o comportamento padrão de impedir o drop
    
    const { clientX, clientY } = event;
    // Calcula a posição relativa ao GameWorld
    const worldPosition = getWorldPositionFromClient(clientX, clientY);
    const { x: relativeX, y: relativeY } = getScenePlacement(worldPosition.x, worldPosition.y);

    // Garante que as coordenadas fiquem dentro da grid
    const files = 'dataTransfer' in event && event.dataTransfer?.files != null ? Array.from(event.dataTransfer.files) : null;

    if(files && files.length > 0) {
      files?.forEach(file => {
        handleImageUpload(file);
      });
    } else {
      // Caso não seja drop criar nova scena
      const index = scenes.length === 0 ? 0 : scenes[scenes.length - 1]._index + 1;
      console.log('..: files images', settingUtils.images);
      console.log('..: path backgrounds', joinLocalAssetPath(settingUtils.localImagePath, settingUtils.images?.[0]));
      const background = settingUtils.images?.length != 0
        ? joinLocalAssetPath(settingUtils.localImagePath, settingUtils.images?.[0])
        : imgPlaceholder;
      const nameImageDefault = settingUtils.images ? settingUtils.images[0] : imgPlaceholder;
      const defaultBackground = backgrounds.find(item => item.filename === nameImageDefault && !item._deleted);
      const initialWidth = Math.max(240, defaultBackground?.imageWidth ?? 0);
      const initialHeight = Math.max(160, defaultBackground?.imageHeight ?? 0);
      const newElement = {
        id: uuidv4(),
        _resourceType: 'scene',
        _index: index,
        _saved: false,
        _deleted: false,
        name: 'SCENE ' + index,
        background: background, // caminho da imagem
        backgrounds: [{
          // Start behind actors; layers 2 and 3 are foreground layers.
          layerId: 0,
          backgroundId: defaultBackground?.id
        }],
        x: relativeX,
        y: relativeY,
        width: initialWidth,
        height: initialHeight,
        cameraPosition: { x: 0, y: 0 },
        sceneType: ETypeScene.TOPDOWN,
        script: [createSceneFadeIn()],
      };

      setScenes((prev) => [...prev, newElement]);

      if (defaultBackground) return newElement;

      const image = new Image();
      image.onload = () => {
        setScenes(prev => prev.map(scene => scene.id === newElement.id ? {
          ...scene,
          width: Math.max(240, image.naturalWidth),
          height: Math.max(160, image.naturalHeight),
        } : scene));
      };
      image.src = background;

      return newElement;
    }

  };

  // ZOOOM ------------------------------------------
  const handleZoomButtonEffect = () => {
    const current = wrapperRef.current?.instance.transformState;
    if (!current) return;

    const positionX = finiteNumber(current.positionX, worldScrollX);
    const positionY = finiteNumber(current.positionY, worldScrollY);
    const scale = Math.max(0.25, Math.min(16, finiteNumber(current.scale, zoomLevel)));

    const newScale = zoomLevel;
    const ratio = newScale / scale;

    // pega tamanho da viewport
    const viewportWidth = wrapperRef.current?.instance.wrapperComponent?.offsetWidth ?? 0;
    const viewportHeight = wrapperRef.current?.instance.wrapperComponent?.offsetHeight ?? 0;

    // ajusta pan proporcionalmente
    const newX = positionX * ratio + (viewportWidth / 2) * (1 - ratio);
    const newY = positionY * ratio + (viewportHeight / 2) * (1 - ratio);

    if (Number.isFinite(newX) && Number.isFinite(newY) && Number.isFinite(newScale)) {
      wrapperRef.current?.setTransform(newX, newY, newScale);
      handleChangeTransform({ x: newX, y: newY, zoom: newScale });
    }
  };

  const handleChangeTransform = (transform: any) => {
    const x = finiteNumber(transform?.x, worldScrollX);
    const y = finiteNumber(transform?.y, worldScrollY);
    const scale = Math.max(0.25, Math.min(16, finiteNumber(transform?.zoom, zoomLevel)));
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale)) return;
    setGridTransform({ x, y, scale });
    setUserSettings(prev => ({ ...prev, worldScrollX: x, worldScrollY: y, zoom: Math.trunc(scale * 100), _saved: false }));
  };

  const handleWorldTransformed = (_ref: ReactZoomPanPinchRef, state: { positionX: number; positionY: number; scale: number }) => {
    const next = {
      x: finiteNumber(state?.positionX, gridTransform.x),
      y: finiteNumber(state?.positionY, gridTransform.y),
      scale: Math.max(0.25, Math.min(16, finiteNumber(state?.scale, gridTransform.scale || zoomLevel))),
    };
    setGridTransform(previous => previous.x === next.x && previous.y === next.y && previous.scale === next.scale ? previous : next);
  };

  const miniMapWorldBounds = (() => {
    const scale = Math.max(0.25, finiteNumber(gridTransform.scale, zoomLevel));
    const viewWidth = Math.max(1, worldOverlayPosition.width) / scale;
    const viewHeight = Math.max(1, worldOverlayPosition.height) / scale;
    const viewX = -gridTransform.x / scale;
    const viewY = -gridTransform.y / scale;
    const activeScenes = scenes.filter(scene => !scene._deleted).map(scene => {
      const previewOffset = draggingSceneOffset && movingSceneIds?.has(scene.id) ? draggingSceneOffset : null;
      return {
        ...scene,
        x: scene.x + (previewOffset?.x ?? 0),
        y: scene.y + (previewOffset?.y ?? 0),
      };
    });
    const minSceneX = Math.min(viewX, ...activeScenes.map(scene => scene.x));
    const minSceneY = Math.min(viewY, ...activeScenes.map(scene => scene.y));
    const maxSceneX = Math.max(viewX + viewWidth, ...activeScenes.map(scene => scene.x + scene.width));
    const maxSceneY = Math.max(viewY + viewHeight, ...activeScenes.map(scene => scene.y + scene.height));
    const padding = Math.max(64, Math.max(maxSceneX - minSceneX, maxSceneY - minSceneY) * 0.04);
    let minX = minSceneX - padding;
    let minY = minSceneY - padding;
    let width = Math.max(128, maxSceneX - minSceneX + padding * 2);
    let height = Math.max(128, maxSceneY - minSceneY + padding * 2);
    const aspect = 176 / 94;
    if (width / height < aspect) {
      const expandedWidth = height * aspect;
      minX -= (expandedWidth - width) / 2;
      width = expandedWidth;
    } else {
      const expandedHeight = width / aspect;
      minY -= (expandedHeight - height) / 2;
      height = expandedHeight;
    }
    return { minX, minY, width, height };
  })();

  const moveCameraFromMiniMap = (clientX: number, clientY: number) => {
    const svg = miniMapRef.current;
    const wrapper = wrapperRef.current?.instance.wrapperComponent;
    if (!svg || !wrapper) return;
    const bounds = miniMapDragBoundsRef.current ?? miniMapWorldBounds;
    const rect = svg.getBoundingClientRect();
    const worldX = bounds.minX + Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * bounds.width;
    const worldY = bounds.minY + Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) * bounds.height;
    const scale = getWorldScale();
    const positionX = wrapper.offsetWidth / 2 - worldX * scale;
    const positionY = wrapper.offsetHeight / 2 - worldY * scale;
    wrapperRef.current?.setTransform(positionX, positionY, scale, 0);
  };

  const finishMiniMapNavigation = () => {
    miniMapDragBoundsRef.current = null;
    const transform = wrapperRef.current?.instance.transformState;
    if (transform) handleChangeTransform({ x: transform.positionX, y: transform.positionY, zoom: transform.scale });
  };

  const recenterWorldView = () => {
    const wrapper = wrapperRef.current?.instance.wrapperComponent;
    if (!wrapper) return;
    const activeScenes = scenes.filter(scene => !scene._deleted);
    const minX = activeScenes.length ? Math.min(...activeScenes.map(scene => scene.x)) : leftLimite;
    const minY = activeScenes.length ? Math.min(...activeScenes.map(scene => scene.y)) : titleHeight;
    const maxX = activeScenes.length ? Math.max(...activeScenes.map(scene => scene.x + scene.width)) : leftLimite + 1920;
    const maxY = activeScenes.length ? Math.max(...activeScenes.map(scene => scene.y + scene.height)) : titleHeight + 1080;
    const padding = Math.max(64, Math.max(maxX - minX, maxY - minY) * 0.08);
    const worldWidth = maxX - minX + padding * 2;
    const worldHeight = maxY - minY + padding * 2;
    const scale = Math.max(0.25, Math.min(16, (wrapper.offsetWidth - 96) / worldWidth, (wrapper.offsetHeight - 96) / worldHeight));
    const positionX = (wrapper.offsetWidth - worldWidth * scale) / 2 - (minX - padding) * scale;
    const positionY = (wrapper.offsetHeight - worldHeight * scale) / 2 - (minY - padding) * scale;
    wrapperRef.current?.setTransform(positionX, positionY, scale, 180);
    handleChangeTransform({ x: positionX, y: positionY, zoom: scale });
  };

  const handleMiniMapKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    const wrapper = wrapperRef.current?.instance.wrapperComponent;
    const transform = wrapperRef.current?.instance.transformState;
    if (!wrapper || !transform) return;
    const panStep = Math.max(32, Math.round(Math.min(wrapper.offsetWidth, wrapper.offsetHeight) * 0.12));
    const offsets: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: panStep, y: 0 },
      ArrowRight: { x: -panStep, y: 0 },
      ArrowUp: { x: 0, y: panStep },
      ArrowDown: { x: 0, y: -panStep },
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const x = transform.positionX + offset.x;
    const y = transform.positionY + offset.y;
    wrapperRef.current?.setTransform(x, y, transform.scale, 0);
    handleChangeTransform({ x, y, zoom: transform.scale });
  };

  const handleWorldWheelCapture = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY) || !Number.isFinite(event.deltaY)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  useEffect(() => {
    if (!settingUtils.buttonZoomPressed) return;

    // The TopBar changes the persisted zoom and raises this flag in separate
    // contexts. Wait for the committed zoom value before changing the
    // transform, otherwise the button applies the previous scale.
    const frame = requestAnimationFrame(() => {
      handleZoomButtonEffect();
      setSettingUtils(prev => prev.buttonZoomPressed
        ? { ...prev, buttonZoomPressed: false }
        : prev);
    });

    return () => cancelAnimationFrame(frame);
  }, [settingUtils.buttonZoomPressed, zoomLevel, setSettingUtils]);

  useEffect(() => {
    const instance = wrapperRef.current?.instance;
    const state = instance?.transformState;
    if (!instance || !state) return;
    if (!Number.isFinite(state.positionX) || !Number.isFinite(state.positionY) || !Number.isFinite(state.scale))
      wrapperRef.current?.setTransform(worldScrollX, worldScrollY, zoomLevel);
  }, [worldScrollX, worldScrollY, zoomLevel]);

  useEffect(() => {
    const recenterTarget = elementSelected?._recenterTarget;
    // Scene edits commit through setElementSelected on pointer-up. Never let
    // a pending scene-level selection request move the viewport while the
    // selected scene is actively being edited.
    if (!elementSelected || !elementSelected._recenter || recenterTarget
      || settingUtils.tileEditSceneId === elementSelected.id) return;
    if (!canvasPreferencesLoaded || !recenterPreferencesRef.current.enabled || !recenterPreferencesRef.current.scenes) return;
    const el = document.getElementById(elementSelected.id);
    if (el && wrapperRef.current) {
      // centraliza o elemento na viewport
      wrapperRef.current.zoomToElement(el, zoomLevel);
      setTimeout(() => {
        const transformState = wrapperRef.current?.instance.transformState;
        if (!transformState) return;
        handleChangeTransform({ x: transformState.positionX, y: transformState.positionY, zoom: transformState.scale });
      }, 600); // tempo da animação
    }
  // Recenter only when the selected scene/target changes. Zoom changes update
  // zoomLevel too, but should preserve the current viewport center instead of
  // replaying the selection animation and jumping back to the scene.
  }, [elementSelected?.id, elementSelected?._recenter, settingUtils.tileEditSceneId, canvasPreferencesLoaded]);

  useEffect(() => {
    const recenterTarget = elementSelected?._recenterTarget;
    if (!elementSelected || !recenterTarget) return;
    const preferences = recenterPreferencesRef.current;
    if (!canvasPreferencesLoaded || !preferences.enabled
      || (recenterTarget.type === 'actor' ? !preferences.actors : !preferences.triggers)) return;
    const target = document.getElementById(`scene-edit-target-${elementSelected.id}-${recenterTarget.id}`);
    if (!target || !wrapperRef.current) return;
    const enteringObjectEdit = previousTileEditSceneIdRef.current !== elementSelected.id;
    const animationDuration = enteringObjectEdit ? 900 : 600;
    wrapperRef.current.zoomToElement(target, zoomLevel, animationDuration, 'easeOut');
    window.setTimeout(() => {
      const transform = wrapperRef.current?.instance.transformState;
      if (transform) handleChangeTransform({ x: transform.positionX, y: transform.positionY, zoom: transform.scale });
    }, animationDuration + 50);
  }, [elementSelected?.id, elementSelected?._recenterTarget?.type, elementSelected?._recenterTarget?.id, settingUtils.tileEditSceneId, canvasPreferencesLoaded]);
  useEffect(() => {
    previousTileEditSceneIdRef.current = settingUtils.tileEditSceneId;
  }, [settingUtils.tileEditSceneId]);
  // ZOOOM END ------------------------------------------

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null
  );

  // MOUSE ---------------------------------------------
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (worldPanningRef.current || (e.buttons & 4)) return;
    const worldPosition = getWorldPositionFromClient(e.clientX, e.clientY);
    setWorldCursorPosition({ x: Math.round(worldPosition.x), y: Math.round(worldPosition.y) });
    // console.log('..: handleMouseMove activeSubButton:', activeSubButton);
    if (settingUtils.activeSubButton === "Scene") {
      // Calcula as coordenadas do retângulo
      const rectX = e.nativeEvent.offsetX - 120*1.5; // Centraliza o retângulo
      const rectY = e.nativeEvent.offsetY - 80*1.5;  // Centraliza o retângulo
      setMousePos(getScenePlacement(worldPosition.x, worldPosition.y));
    }
  };

  const handleMouseClick = (event: any) => {
    if ((event.target as HTMLElement).closest?.('.game-element')) return;
    if (mousePos && settingUtils.activeSubButton === "Scene") {
      event.stopPropagation();
      console.log("Scene criada em:", mousePos);

      if (pendingScenePlacement) {
        const worldPosition = getWorldPositionFromClient(event.clientX, event.clientY);
        const position = getScenePlacement(worldPosition.x, worldPosition.y);
        window.dispatchEvent(new CustomEvent('gba-studio:commit-scene-placement', { detail: { ...pendingScenePlacement, ...position } }));
        notification.success({ message: pendingScenePlacement.mode === 'cut' ? 'Scene Restored' : 'Scene Copied', showProgress: true });
        setPendingScenePlacement(null);
        return;
      }

      const newScene = handleDropOrCreate(event);

      notification.success({
        message: 'Create New Scene',
        description: `${newScene?.name} created!`,
        showProgress: true,
      });
    } else {
      handleClickOutside(event);
    }
  };

  const handleMouseLeave = () => {
    setWorldCursorPosition(null);
    setMousePos(null); // Remove a silhueta quando o mouse sai da área
  };
  // MOUSE END -----------------------------------------

  const handleOpenProjectFolderWithPath = (path:string) => {
    console.log(`..: Open Project Folder: ${path}`);
    window.electronAPI.send('open-project-folder', path);
  }

  const getImageSize = (src: string): Promise<{width: number, height: number}> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
      img.src = src;
    });
  };

  // Função - validação e criação de backgrounds
  const validateAndAddBackgrounds = async (images: string[] | null, localPath: string, hd: boolean) => {
    if (!images) {
      console.log('⚠️ Sem imagens para processar HD: ', hd);
      return [];
    }

    const pending = images.filter(image => {
      const name = image.split('.')[0];
      return !backgrounds.some(bg => bg.name === name && bg.hd === hd);
    });

    if (pending.length === 0) return [];

    console.log('✨ Criando novos backgrounds:', pending);
    const newBackgrounds = await Promise.all(
      pending.map(async image => {
        const { width, height } = await getImageSize(joinLocalAssetPath(localPath, image));
        return {
          _resourceType: 'background' as const,
          id: uuidv4(),
          autoColor: false,
          name: image.split('.')[0],
          filename: image,
          imageWidth: width,
          imageHeight: height,
          hd,
          tileColors: '',
          _saved: false,
          _deleted: false,
        };
      })
    );

    return newBackgrounds;
  };

  // UseEffect - Valida, cria backgrounds e exclui algumas imagens
  useEffect(() => {
    const updateBackgrounds = async () => {
      const [newNormal, newHD] = await Promise.all([
        validateAndAddBackgrounds(settingUtils.images, settingUtils.localImagePath, false),
        validateAndAddBackgrounds(settingUtils.imagesHD, settingUtils.localImagePathHD, true),
      ]);

      const allImages = [
        ...(settingUtils.images ?? []).map(img => ({ name: img.split('.')[0], hd: false })),
        ...(settingUtils.imagesHD ?? []).map(img => ({ name: img.split('.')[0], hd: true }))
      ];

      setBackgrounds(prev => {
        // marca que precisam ser deletados ou retorna vazio se não há imagens
        const updated = allImages && allImages.length > 0 ? prev.map(bg => {
          const exists = allImages.some(i =>
            i.name.trim().toLowerCase() === bg.name.trim().toLowerCase() &&
            Boolean(i.hd) === Boolean(bg.hd)
          );
          return exists ? bg : { ...bg, _deleted: true, _saved: false };
        }) : [...prev];

        // adiciona novos (se não houver, já retornam [])
        return [...updated, ...newNormal, ...newHD];
      });
    }

    updateBackgrounds();
    
  }, [settingUtils.images, settingUtils.imagesHD]);

  // UseEffect - Gerencia fetch inicial
  useEffect(() => {
    if (settingUtils.images !== null && settingUtils.imagesHD !== null) return;
    const fetchBackgrounds = async () => {
      try {
        const responseNormal = await window.electronAPI.fetchImages('backgrounds');
        const responseHD = await window.electronAPI.fetchImages('backgrounds-hd');

        setSettingUtils(prev => {
          let next = { ...prev };
          if (responseNormal.status === 'success') {
            next.images = responseNormal.fileImages;
            next.localImagePath = responseNormal.localPath;
          }
          if (responseHD.status === 'success') {
            next.imagesHD = responseHD.fileImages;
            next.localImagePathHD = responseHD.localPath;
          }
          return next;
        });
      } catch (err) {
        console.error("❌ Erro ao buscar backgrounds:", err);
      }
    };

    fetchBackgrounds();
  }, [settingUtils.images, settingUtils.imagesHD]);

  // UseEffect - Gerencia pastas que foram feitas fetch para inserir novas imagens de background
  useEffect(() => {
    const handlerUpdateBackgrounds = (images: ISettingUtils) => {
      console.log('🔄 Novos backgrounds chegando:', images);
      setUpdatedImages(images);
    };

    const listener = window.electronAPI.onUpdateImages(handlerUpdateBackgrounds);
    return () => window.electronAPI.removeListener('update-images', listener);
  }, []);

  useEffect(() => {
    if (!updatedImages) return;

    setSettingUtils(prev => {
      let next = { ...prev };
      if (updatedImages.localPath.endsWith('backgrounds-hd')) {
        next.imagesHD = updatedImages.images ?? prev.imagesHD;
        next.localImagePathHD = updatedImages.localPath || prev.localImagePathHD;
        console.log('📥 images HD setada:', next.imagesHD);
      } else if (updatedImages.localPath.endsWith('backgrounds')) {
        next.images = updatedImages.images ?? prev.images;
        next.localImagePath = updatedImages.localPath || prev.localImagePath;
        console.log('📥 images setada:', next.images);
      }
      return next;
    });
  }, [updatedImages]);

  // function getImageInfo(imagePath:) {
  //   return new Promise((resolve, reject) => {
  //       const img = new Image(); // Cria um objeto de imagem
  //       img.src = imagePath; // Define o caminho da imagem

  //       // Quando a imagem for carregada com sucesso
  //       img.onload = () => {
  //           resolve({
  //               filename: imagePath.split('/').pop(), // Extrai o nome do arquivo do caminho
  //               imageWidth: img.width, // Largura da imagem
  //               imageHeight: img.height, // Altura da imagem
  //           });
  //       };

  //       // Em caso de erro ao carregar a imagem
  //       img.onerror = (err) => reject(`Erro ao carregar a imagem: ${err}`);
  //   });
  // }

  // Pan/zoom and cursor HUD updates must not rerender the scene canvases and event previews.
  const sceneElements = useMemo(() => scenes.map(scene => (
                  !scene._deleted ?
                    <GameElement
                      key={scene.id}
                      sceneElement={scene}
                      sceneObjectSnapSize={sceneObjectSnapSize}
                      matchesSearch={matchesSceneSearch(scene, settingUtils.worldSceneSearch)}
                      isClipboardSource={clipboardSceneId === scene.id}
                    isSelected={selectedSceneIds.includes(scene.id)}
                    isSecondarySelected={selectedSceneIds.includes(scene.id) && scene.id !== elementSelected?.id}
                      changeScenePreviews={selectedScenePreviews
                        .filter(preview => preview.targetSceneId === scene.id)
                        .map(({ id, x, y, direction, xUnit, yUnit }) => ({ id, x, y, direction, xUnit, yUnit }))}
                      changeScenePreviewLayer={changeScenePreviewLayer}
                      changeScenePreviewOffset={draggingSceneOffset && movingSceneIds?.has(scene.id)
                        ? { x: draggingSceneOffset.x, y: draggingSceneOffset.y }
                        : undefined}
                      sceneDragOffset={draggingSceneOffset && movingSceneIds?.has(scene.id)
                        ? { x: draggingSceneOffset.x, y: draggingSceneOffset.y }
                        : undefined}
                      cameraPreviews={scene.id === selectedScene?.id ? selectedCameraPreviews : []}
                      actorPositionPreview={scene.id === selectedScene?.id && scene.id === actorPositionPreview?.sceneId ? actorPositionPreview : null}
                      onMoveChangeScenePreview={handleMoveChangeScenePreview}
                      onSelect={(_, event) => {
                        const isObjectPlacement = settingUtils.activeButton === 'add' && (settingUtils.activeSubButton === 'Actor' || settingUtils.activeSubButton === 'Trigger');
                        // Placement tools always take ownership of the scene
                        // clicked, even when another scene was being edited.
                        if (!tileEditSceneId || tileEditSceneId === scene.id || isObjectPlacement || event?.shiftKey) handleSelect(scene, event);
                        if (isObjectPlacement) {
                          setSettingUtils(previous => ({ ...previous, tileEditSceneId: scene.id, tileEditLayerId: 4 }));
                        }
                      }}
                      onEditTiles={(target) => {
                        setElementSelected(target);
                        setSettingUtils(previous => ({
                          ...previous,
                          worldSceneSearch: sceneSearchAfterSelection(previous.worldSceneSearch, target),
                          tileEditSceneId: target.id,
                          tileEditLayerId: 4,
                          activeButton: 'select',
                          activeSubButton: '',
                        }));
                      }}
                      selectedObject={settingUtils.activeSceneObject?.sceneId === scene.id ? settingUtils.activeSceneObject : null}
                      onSelectObject={(type, id) => {
                        setElementSelected(scene);
                        setSettingUtils(previous => ({ ...previous, worldSceneSearch: sceneSearchAfterSelection(previous.worldSceneSearch, scene), tileEditSceneId: scene.id, tileEditLayerId: 4, activeSceneObject: { sceneId: scene.id, type, id }, activeTriggerId: type === 'trigger' ? id : null }));
                      }}
                      onSceneMouseMove={(target, x, y) => {
                        if (worldPanningRef.current) return;
                        const current = sceneMousePositionRef.current;
                        if (current?.sceneId === target.id && current.x === x && current.y === y) return;
                        const position = { sceneId: target.id, scene: target.name, x, y };
                        sceneMousePositionRef.current = position;
                        setSceneMousePosition(position);
                      }}
                      onSceneMouseLeave={() => {
                        sceneMousePositionRef.current = null;
                        setSceneMousePosition(null);
                      }}
                      isDimmed={Boolean(tileEditSceneId && tileEditSceneId !== scene.id)}
                      // onElementHovered={(isHovered: boolean) => handleElementHovered(isHovered)}
                    />
                  : null
                )), [scenes, sceneObjectSnapSize, settingUtils.worldSceneSearch, clipboardSceneId, selectedSceneIds, elementSelected?.id, selectedScenePreviews, changeScenePreviewLayer, draggingSceneOffset, movingSceneIds, selectedScene?.id, selectedCameraPreviews, actorPositionPreview, handleMoveChangeScenePreview, settingUtils.activeButton, settingUtils.activeSubButton, tileEditSceneId, handleSelect, setSettingUtils, setElementSelected, settingUtils.activeSceneObject]);

  if (loading) {
    return (
      <Layout style={{
        width: '100%',
        height: '100%',
      }}>
        <Spin fullscreen size="large" percent={50} tip="Carregando imagens..." indicator={<PictureFilled spin />} />
      </Layout>
    )
  }

  return (
    <DndContext
      autoScroll={false}
      onDragStart={handleMoveBackStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setDraggingSceneOffset(null); sceneDragScaleRef.current = null; setIsMovedBackground(false); restoreInspectorHover(); }}
    >
      <div ref={worldOverlayPosition.overlayRef} data-testid="game-world-overlays" style={{ visibility: worldOverlayPosition.measured ? 'visible' : 'hidden' }}>
      <div style={{ display: worldOverlayPosition.measured && worldOverlayPosition.width < 180 ? 'none' : undefined }}>
          <FloatButttons 
            actions={actions} 
            onResetPanelSize={resetPanelSize} 
            onShowFloatButton={setShowFloatButton} 
            showFloatButton={showFloatButton}
            floatingPosition={{ left: worldOverlayPosition.left, top: worldOverlayPosition.top }}
          />
      </div>
        <FloatButton.Group shape="square" style={{ position: 'fixed', left: `var(--gba-world-left, ${worldOverlayPosition.left}px)`, right: 'auto', bottom: `var(--gba-world-bottom, ${worldOverlayPosition.bottom}px)`, zIndex: 100, pointerEvents: 'none', width: 'max-content', minWidth: 0, maxWidth: 'var(--gba-hud-info-width, 0px)', height: 'auto', minHeight: 16, maxHeight: 'none', padding: 0, overflow: 'visible', display: 'var(--gba-hud-info-display, none)' }}>
          <Content data-testid="scene-tile-position" style={{ width: '100%', minWidth: 0, maxWidth: 'var(--gba-hud-info-width, 0px)', overflow: 'hidden', textOverflow: 'ellipsis', height: 'auto', minHeight: 16, padding: '0 7px', boxSizing: 'border-box', display: 'block', borderRadius: token.borderRadius, background: token.colorBgElevated, color: token.colorTextSecondary, boxShadow: token.boxShadowSecondary, fontSize: 11, lineHeight: '16px', whiteSpace: 'nowrap' }}>
            {`${sceneMousePosition ? `${sceneMousePosition.scene} · Tile X: ${Math.floor(sceneMousePosition.x / (userSettings.tileEditorGridSize ?? 8))}, Y: ${Math.floor(sceneMousePosition.y / (userSettings.tileEditorGridSize ?? 8))}` : worldCursorPosition ? `World X: ${worldCursorPosition.x}, Y: ${worldCursorPosition.y}` : 'Game World'} · ${Math.round(gridTransform.scale * 100)}% · ${sceneMousePosition ? `Snap ${sceneObjectSnapSize}×${sceneObjectSnapSize}` : sceneMovementMode === 'grid' ? 'Snap 16×16' : 'Snap Free'}`}
          </Content>
        </FloatButton.Group>
      <div
        data-testid="game-world-minimap-panel"
        role="group"
        aria-label={t('world.minimap')}
        style={{
          position: 'fixed',
          right: `var(--gba-world-right, ${worldOverlayPosition.right}px)`,
          bottom: `calc(var(--gba-world-bottom, ${worldOverlayPosition.bottom}px) + var(--gba-hud-minimap-bottom, 0px))`,
          zIndex: 101,
          display: 'var(--gba-hud-minimap-display, none)',
          width: 'var(--gba-hud-minimap-width, 192px)',
          boxSizing: 'border-box',
          padding: 8,
          borderRadius: token.borderRadius,
          background: token.colorBgElevated,
          boxShadow: token.boxShadowSecondary,
        }}
      >
        <Button
          size="small"
          icon={<AimOutlined />}
          data-testid="game-world-recenter"
          aria-label={t('world.recenter')}
          onClick={recenterWorldView}
          style={{ width: '100%', marginBottom: 6 }}
        >
          {t('world.recenter')}
        </Button>
        <svg
          ref={miniMapRef}
          data-testid="game-world-minimap"
          role="group"
          tabIndex={0}
          aria-label={t('world.minimapDescription')}
          viewBox={`${miniMapWorldBounds.minX} ${miniMapWorldBounds.minY} ${miniMapWorldBounds.width} ${miniMapWorldBounds.height}`}
          preserveAspectRatio="none"
          onKeyDown={handleMiniMapKeyDown}
          onPointerDown={event => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            miniMapDragBoundsRef.current = { ...miniMapWorldBounds };
            setIsMiniMapDragging(true);
            moveCameraFromMiniMap(event.clientX, event.clientY);
          }}
          onPointerMove={event => {
            if (isMiniMapDragging) moveCameraFromMiniMap(event.clientX, event.clientY);
          }}
          onPointerUp={event => {
            moveCameraFromMiniMap(event.clientX, event.clientY);
            setIsMiniMapDragging(false);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            finishMiniMapNavigation();
          }}
          onPointerCancel={() => { setIsMiniMapDragging(false); finishMiniMapNavigation(); }}
          style={{
            display: 'block',
            width: '100%',
            height: 'var(--gba-hud-minimap-height, 94px)',
            boxSizing: 'border-box',
            borderRadius: Math.max(0, token.borderRadius - 2),
            background: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            cursor: isMiniMapDragging ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
        >
          {scenes.filter(scene => !scene._deleted).map(scene => {
            const isPrimarySelected = scene.id === elementSelected?.id;
            const isSecondarySelected = !isPrimarySelected && selectedSceneIds.includes(scene.id);
            const matchesSearch = matchesSceneSearch(scene, settingUtils.worldSceneSearch);
            const previewOffset = draggingSceneOffset && movingSceneIds?.has(scene.id) ? draggingSceneOffset : null;
            return <rect
              key={scene.id}
              data-testid={`game-world-minimap-scene-${scene.id}`}
              data-selection={isPrimarySelected ? 'primary' : isSecondarySelected ? 'secondary' : 'none'}
              data-search-match={matchesSearch ? 'true' : 'false'}
              style={{ opacity: matchesSearch ? 1 : .72, filter: matchesSearch ? undefined : 'brightness(.82)' }}
              x={scene.x + (previewOffset?.x ?? 0)}
              y={scene.y + (previewOffset?.y ?? 0)}
              width={Math.max(1, scene.width)}
              height={Math.max(1, scene.height)}
              fill={isPrimarySelected || isSecondarySelected ? token.colorPrimary : token.colorTextSecondary}
              fillOpacity={isPrimarySelected ? 0.9 : isSecondarySelected ? 0.4 : 0.55}
              stroke={token.colorText}
              strokeWidth={Math.max(miniMapWorldBounds.width / 220, miniMapWorldBounds.height / 118)}
            />;
          })}
          <rect
            data-testid="game-world-minimap-viewport"
            x={-gridTransform.x / gridTransform.scale}
            y={-gridTransform.y / gridTransform.scale}
            width={worldOverlayPosition.width / gridTransform.scale}
            height={worldOverlayPosition.height / gridTransform.scale}
            fill={token.colorPrimary}
            fillOpacity={0.12}
            stroke={token.colorPrimary}
            strokeWidth={1.25}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>
      <div data-testid="resource-usage-bars" style={{
        position: 'fixed',
        right: `var(--gba-world-right, ${worldOverlayPosition.right}px)`,
        bottom: `var(--gba-world-bottom, ${worldOverlayPosition.bottom}px)`,
        zIndex: 100,
        display: 'var(--gba-hud-usage-display, none)',
        flexDirection: worldOverlayPosition.width < 390 ? 'column-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 10,
        pointerEvents: 'none',
      }}>
        <Tooltip title={`ROM estimada: ${formatBytes(romUsage.total)} de 32 MB (${romUsage.source === 'build' ? 'recursos do build' : 'estimativa pelos assets'}). Engine: ${formatBytes(romUsage.engine)}, gráficos: ${formatBytes(romUsage.graphics)}, áudio: ${formatBytes(romUsage.audio)}, scripts: ${formatBytes(romUsage.scripts)}.${romUsage.binary ? ` ROM confirmada no último Build: ${formatBytes(romUsage.binary)}.` : ' Execute Build para confirmar com o .gba.'}`}>
          <div style={{ order: 2, width: Math.max(110, Math.min(168, worldOverlayPosition.width - 92)), boxSizing: 'border-box', padding: '4px 8px', borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadowSecondary }}>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 2 }}>ROM estimada</div>
            <Progress percent={Math.min(100, Number((romUsage.total / ROM_LIMIT_BYTES * 100).toFixed(1)))} size="small" status={romUsage.total > ROM_LIMIT_BYTES ? 'exception' : 'normal'} format={percent => `${percent}%`} />
          </div>
        </Tooltip>
        {selectedScene && <Tooltip title={`Estimativa de VRAM da cena, incluindo fundos, mapas, player e sprites dos actors: ${formatBytes(selectedSceneVram)} de 96 KB.`}>
          <div data-testid="scene-vram-usage" style={{ order: 1, width: Math.max(110, Math.min(168, worldOverlayPosition.width - 92)), boxSizing: 'border-box', padding: '4px 8px', borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadowSecondary }}>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 2 }}>VRAM cena</div>
            <Progress percent={Math.min(100, Number((selectedSceneVram / VRAM_LIMIT_BYTES * 100).toFixed(1)))} size="small" status={selectedSceneVram > VRAM_LIMIT_BYTES ? 'exception' : 'normal'} format={percent => `${percent}%`} />
          </div>
        </Tooltip>}
      </div>

      </div>
      <div data-testid="game-world-viewport" data-world-x={gridTransform.x} data-world-y={gridTransform.y} data-world-scale={gridTransform.scale} data-scene-movement-mode={sceneMovementMode} data-pan-inertia={panInertia} ref={worldViewportRef} onWheelCapture={handleWorldWheelCapture} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onClick={handleMouseClick} onDragOver={event => event.preventDefault()} onDrop={handleDropOrCreate} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {(() => {
        const scale = gridTransform.scale;
        const minorPitch = 16 * scale;
        const majorPitch = 80 * scale;
        const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
        const originX = gridTransform.x + leftLimite * scale;
        const originY = gridTransform.y + titleHeight * scale;
        return <div data-testid="game-world-grid" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundColor: token.colorBgContainer,
          backgroundImage: `${minorPitch >= 8 ? `linear-gradient(to right, ${token.colorFillSecondary} 1px, transparent 1px), linear-gradient(to bottom, ${token.colorFillSecondary} 1px, transparent 1px), ` : ''}linear-gradient(to right, ${token.colorBorderSecondary} 1px, transparent 1px), linear-gradient(to bottom, ${token.colorBorderSecondary} 1px, transparent 1px)`,
          backgroundSize: `${minorPitch >= 8 ? `${minorPitch}px ${minorPitch}px, ${minorPitch}px ${minorPitch}px, ` : ''}${majorPitch}px ${majorPitch}px, ${majorPitch}px ${majorPitch}px`,
          backgroundPosition: `${minorPitch >= 8 ? `${mod(originX, minorPitch)}px ${mod(originY, minorPitch)}px, ${mod(originX, minorPitch)}px ${mod(originY, minorPitch)}px, ` : ''}${mod(originX, majorPitch)}px ${mod(originY, majorPitch)}px, ${mod(originX, majorPitch)}px ${mod(originY, majorPitch)}px`,
        }} />;
      })()}
      <TransformWrapper
        ref={wrapperRef}
        initialScale={zoomLevel}
        initialPositionX={worldScrollX}
        initialPositionY={worldScrollY}
        
        minScale={0.25} // Ajuste o nível mínimo de zoom out
        maxScale={16}   // Ajuste o nível máximo de zoom in
        // The viewport grid is infinite; camera movement must not stop at the
        // finite DOM surface used to size scene content and SVG overlays.
        limitToBounds={false}
        zoomAnimation={{ disabled: true }}
        doubleClick={{ disabled: true }}

        // limitToBounds={true}
        // minPositionX={ 0 }
        // minPositionY={ 0 }
        // maxPositionX={ worldSize.width }
        // maxPositionY={ worldSize.height }
        onTransformed={handleWorldTransformed}
        wheel={{ disabled: false, smoothStep: 0.005, step: 1, activationKeys: ['Control'] }}
        onWheelStop={e => handleChangeTransform({ x: e.state.positionX, y: e.state.positionY, zoom: e.state.scale })}
        disabled={isMovedBackground}
        panning={{
          disabled: false,
          velocityDisabled: !panInertia,
          allowLeftClickPan: false,
          allowMiddleClickPan: true,
          allowRightClickPan: false,
        }}
        onPanningStart={() => {
          worldPanningRef.current = true;
          window.dispatchEvent(new CustomEvent('gba-studio:world-pan', { detail: { paused: true } }));
        }}
        onPanningStop={e => {
          worldPanningRef.current = false;
          window.dispatchEvent(new CustomEvent('gba-studio:world-pan', { detail: { paused: false } }));
          handleChangeTransform({ x: e.state.positionX, y: e.state.positionY, zoom: e.state.scale });
        }}
        pinch={{ disabled: true }}
      >
        <TransformComponent wrapperStyle={{ width: "100%", height: "100%", overflow: "hidden" }} 
          contentStyle={{
            position: "relative",
            width: worldSize.width + 100, 
            height: worldSize.height + 50,
            background: 'transparent',
          }}>
          <Content>
            {/* Content */}
            <Content 
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.currentTarget.style.cursor = "grabbing";
                }
              }}
              onMouseUp={(e) => {
                if (e.button === 1) {
                  e.currentTarget.style.cursor = "default";
                }
              }}
            >
              
              {/* Retângulo que segue o mouse */}
              {mousePos && settingUtils.activeSubButton === "Scene" && (
                <Content
                  style={{
                    position: "absolute",
                    width: "240px",
                    height: "160px",
                    left: `${mousePos.x}px`,
                    top: `${mousePos.y}px`,
                    borderRadius: token.borderRadius,
                    backgroundColor: `${token.colorBgMask}`, // Silhueta semitransparente
                    pointerEvents: "none", // Ignora interação com o retângulo
                    zIndex: 6,
                  }}
                ><svg aria-hidden="true" width="240" height="160" viewBox="0 0 240 160" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}><rect x="0.5" y="0.5" width="239" height="159" fill="none" stroke={token.colorPrimary} strokeWidth={1} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" shapeRendering="crispEdges" /></svg></Content>
              )}

              <Content style={{ pointerEvents: settingUtils.activeSubButton === "Scene" ? "none" : "auto" }}>
                {changeSceneTraces.length > 0 && (
                  <svg
                    aria-hidden="true"
                    width={worldSize.width + 100}
                    height={worldSize.height + 50}
                    viewBox={`0 0 ${worldSize.width + 100} ${worldSize.height + 50}`}
                    style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', zIndex: 10 }}
                  >
                    {changeSceneTraces.map(trace => (
                      <path
                        key={trace.id}
                        d={trace.path}
                        fill="none"
                        stroke="#91caff"
                        strokeWidth={2}
                        strokeDasharray="8 6"
                        strokeLinecap="round"
                        opacity={0.8}
                      />
                    ))}
                  </svg>
                )}
                <div ref={setChangeScenePreviewLayer} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 11 }} />
                {sceneElements}
              </Content>
            </Content>
            
          </Content>
        </TransformComponent>
      </TransformWrapper>
      </div>
    </DndContext>

  );
};

export default GameWorld;
