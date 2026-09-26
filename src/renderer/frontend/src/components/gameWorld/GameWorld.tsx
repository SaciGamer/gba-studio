import { DndContext, DragEndEvent, DragMoveEvent } from '@dnd-kit/core';
import { App, FloatButton, Layout, Progress, Tooltip } from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AntdToken } from '../common/AntDToken';
import DragAndDrop from './DragAndDrop';
import GameElement from './GameElement';

import { AimOutlined, AppstoreAddOutlined, ArrowDownOutlined, ArrowLeftOutlined, ArrowRightOutlined, ArrowUpOutlined, AuditOutlined, BgColorsOutlined, BlockOutlined, BorderInnerOutlined, ClearOutlined, CloseSquareOutlined, EditOutlined, ExpandOutlined, ExperimentOutlined, FormatPainterFilled, FormatPainterOutlined, InsertRowAboveOutlined, LayoutOutlined, PicLeftOutlined, PictureFilled, PlusSquareFilled, SelectOutlined, VerticalAlignMiddleOutlined } from '@ant-design/icons';
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

enum SubMenuType {
  TOOLTIP = 'tooltip',
  POPOVER = 'popover',
  DROPDOWN = 'dropdown',
}

interface IActions {
  key: string;
  type?: SubMenuType,
  icon: React.ReactNode;
  iconSize?: number;
  tooltip?: string;
  active?: boolean;
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

let gridValue = 16;
const titleHeight = 82; // Altura do Titulo
const leftLimite = 106

interface ChangeScenePreview {
  id: string;
  targetSceneId: string;
  x: number;
  y: number;
  direction: string;
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

const calculateSceneVram = (scene: ISceneSettings, backgrounds: any[], distinctBackgroundTiles = new Map<string, number>()): number => {
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
    return Math.max(0, ...candidates.map(bitmapBytes)) + 512 + 512;
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
      map.forEach(line => line.forEach(tile => { if (Number.isInteger(tile) && tile >= 0) graphicTiles.add(`tileset:${layer.selectedTilesetId ?? scene.selectedTilesetId ?? 'default'}:${tile}`); }));
    } else if (layer.backgroundId || layer.selectedTilesetId) mapTiles += columns * rows;
  });
  if (!layers.length && scene.tileMap?.length) {
    mapTiles = scene.tileMap.reduce((total, line) => total + line.length, 0);
    scene.tileMap.forEach(line => line.forEach(tile => { if (Number.isInteger(tile) && tile >= 0) graphicTiles.add(`tileset:${scene.selectedTilesetId ?? 'default'}:${tile}`); }));
  }
  return graphicTiles.size * bytesPerTile + mapTiles * 2 + 512 + 512;
};

const getChangeSceneTracePath = (source: ISceneSettings, target: ISceneSettings, preview: ChangeScenePreview): string => {
  const startX = source.x;
  const startY = source.y;
  const targetMarkerSize = 16;
  const endX = target.x + preview.x * 16 + targetMarkerSize / 2;
  const endY = target.y + preview.y * 16 + targetMarkerSize / 2;
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

const collectChangeScenePreviews = (scene: ISceneSettings): ChangeScenePreview[] => {
  const previews: ChangeScenePreview[] = [];
  const visited = new Set<string>();
  const walk = (events: IScriptsElement[] | undefined) => {
    events?.forEach(event => {
      if(visited.has(event.id)) return;
      visited.add(event.id);
      if(event.command === 'EVENT_CHANGE_SCENE' && !event.args?.__comment)
      {
        const args = event.args as { sceneId?: string; x?: unknown; y?: unknown; direction?: string };
        if(args.sceneId)
        {
          previews.push({
            id: event.id,
            targetSceneId: args.sceneId,
            x: getTileCoordinate(args.x),
            y: getTileCoordinate(args.y),
            direction: args.direction ?? 'right',
          });
        }
      }
      walk(event.children?.then);
      walk(event.children?.else);
    });
  };

  walk(scene.script);
  scene.triggers?.forEach(trigger => walk(trigger.script));
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
    if(event.command === 'EVENT_PAN_CAMERA' && event.id === activePreview.eventId)
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
    ? { ...event.args, sceneId: targetSceneId, x: { type: 'number', value: x }, y: { type: 'number', value: y } } as IScriptsElement['args']
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
  triggers: scene.triggers?.map(trigger => ({
    ...trigger,
    script: updateChangeSceneEvent(trigger.script, eventId, targetSceneId, x, y),
  })),
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
  const { token } = AntdToken();
  const { message, notification, modal } = App.useApp();
  const { 
    scenes, setScenes, scenesRef, scripts, spriteResources, setScripts, setVariables,
    backgrounds, setBackgrounds, 
    settings, setSettings,
    settingUtils, setSettingUtils, settingUtilsRef,
    elementSelected, setElementSelected, elementSelectedRef,
    userSettings, setUserSettings
  } = useAppContexts();

  const [worldSize, setWorldSize] = useState({ width: 1920, height: 1080 });
  const [isMovedBackground, setIsMovedBackground] = useState(false);
  const zoomLevel = userSettings.zoom / 100;

  const [updatedImages, setUpdatedImages] = useState<any>();
  const [changeScenePreviewLayer, setChangeScenePreviewLayer] = useState<HTMLDivElement | null>(null);
  const [draggingSceneOffset, setDraggingSceneOffset] = useState<{ id: string; x: number; y: number } | null>(null);
  const [activeCameraPreview, setActiveCameraPreview] = useState<CameraPreview | null>(null);
  const [sceneMousePosition, setSceneMousePosition] = useState<{ scene: string; col: number; row: number } | null>(null);
  const [worldOverlayPosition, setWorldOverlayPosition] = useState({ left: 12, top: 12, right: 12, bottom: 12, width: 0, measured: false });
  const [romUsage, setRomUsage] = useState<ResourceUsage>({ binary: 0, engine: 0, graphics: 0, audio: 0, scripts: 0, total: 0, source: 'assets' });
  const [loading, setLoading] = useState(true);
  const selectedScene = scenes.find(scene => !scene._deleted && scene.id === elementSelected?.id);
  const selectedSceneIds = settingUtils.selectedSceneIds ?? (selectedScene ? [selectedScene.id] : []);
  const tileEditSceneId = settingUtils.tileEditSceneId;
  const selectedScenePreviews = selectedScene ? collectChangeScenePreviews(selectedScene) : [];
  const selectedCameraPreviews = selectedScene ? collectCameraPreviews(selectedScene, activeCameraPreview) : [];
  const [selectedSceneVram, setSelectedSceneVram] = useState(0);
  const [pendingScenePlacement, setPendingScenePlacement] = useState<{ id: string; mode: 'copy' | 'cut' } | null>(null);
  const [clipboardSceneId, setClipboardSceneId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const updateSceneVram = async () => {
      if (!selectedScene) {
        setSelectedSceneVram(0);
        return;
      }
      const isBitmapScene = selectedScene.renderMode === 'direct_bitmap' || selectedScene.sceneType === ETypeScene.LOGO || selectedScene.sceneType === ETypeScene.POINTNCLICK;
      if (isBitmapScene) {
        setSelectedSceneVram(calculateSceneVram(selectedScene, backgrounds));
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
      if (!cancelled) setSelectedSceneVram(calculateSceneVram(selectedScene, backgrounds, tileCounts));
    };
    void updateSceneVram();
    return () => { cancelled = true; };
  }, [backgrounds, selectedScene, settingUtils.localImagePath, settingUtils.localImagePathHD]);

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
  const changeSceneTraces = selectedScenePreviews.reduce<ChangeSceneTrace[]>((traces, preview) => {
    if (!selectedScene) return traces;
    const targetScene = scenes.find(scene => !scene._deleted && scene.id === preview.targetSceneId);
    if (!targetScene) return traces;
    // The destination may be dragged while the source scene remains selected.
    // Arrival markers and traces live in the shared overlay, so they need the
    // live offset for the actively dragged scene even when it is not selected.
    const isMovingInPreview = (sceneId: string) => Boolean(draggingSceneOffset && (
      draggingSceneOffset.id === sceneId || selectedSceneIds.includes(sceneId)
    ));
    const liveOffset = draggingSceneOffset;
    const withDraggingOffset = (scene: ISceneSettings) => isMovingInPreview(scene.id) && liveOffset
      ? { ...scene, x: scene.x + liveOffset.x, y: scene.y + liveOffset.y }
      : scene;
    return [...traces, {
      id: preview.id,
      path: getChangeSceneTracePath(withDraggingOffset(selectedScene), withDraggingOffset(targetScene), preview),
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
  }, [selectedScene, setScenes, setElementSelected]);

  const wrapperRef = useRef<ReactZoomPanPinchRef | null>(null);;

  useEffect(() => {
    const updateOverlayPosition = () => {
      const viewport = document.querySelector<HTMLElement>('.react-transform-wrapper');
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      setWorldOverlayPosition({
        left: Math.round(rect.left + 12),
        top: Math.round(rect.top + 15),
        right: Math.max(12, Math.round(window.innerWidth - rect.right + 12)),
        bottom: Math.max(12, Math.round(window.innerHeight - rect.bottom + 12)),
        width: Math.round(rect.width),
        measured: true,
      });
    };
    // The game viewport is created after the initial loading screen.  Reading
    // it only on mount leaves fixed overlays at the old window coordinates
    // after maximize/restore, so wait for the committed layout as well.
    const frame = requestAnimationFrame(updateOverlayPosition);
    const timer = window.setTimeout(updateOverlayPosition, 100);
    const settledTimer = window.setTimeout(updateOverlayPosition, 300);
    const observer = new ResizeObserver(updateOverlayPosition);
    const viewport = document.querySelector<HTMLElement>('.react-transform-wrapper');
    if (viewport) observer.observe(viewport);
    window.addEventListener('resize', updateOverlayPosition);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.clearTimeout(settledTimer);
      observer.disconnect();
      window.removeEventListener('resize', updateOverlayPosition);
    };
  }, [loading]);

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
    if (!tileEditSceneId) return;
    setUserSettings(previous => {
      const hidden = previous.hiddenTileGridSceneIds ?? [];
      const isHidden = hidden.includes(tileEditSceneId);
      return { ...previous, hiddenTileGridSceneIds: isHidden ? hidden.filter(id => id !== tileEditSceneId) : [...hidden, tileEditSceneId], _saved: false };
    });
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
          { key: '16px', icon: <ExpandOutlined />, iconSize: 24, tooltip: 'Pincel 16 px (em breve)', disabled: true, active: settingUtils.activeSubButton == '16px', onClick: () => <></> },
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
          { key: 'same', icon: <SelectOutlined />, tooltip: 'Paint matching tiles', active: settingUtils.activeSubButton == 'same', onClick: () => undefined },
          { key: 'grid', icon: <BorderInnerOutlined />, tooltip: `${userSettings.hiddenTileGridSceneIds?.includes(tileEditSceneId) ? 'Show' : 'Hide'} grid (g)`, active: false, onClick: toggleTileGrid },
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
      const target = event.target as HTMLElement | null;
      const activeElement = document.activeElement as HTMLElement | null;
      const isEditingField = (element: HTMLElement | null) => Boolean(element?.closest('input, textarea, [contenteditable="true"]'));

      if (isEditingField(target) || isEditingField(activeElement)) return;

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
  }, [elementSelected, scenes, settings, settingUtils.activeButton, settingUtils.activeSceneObject, settingUtils.activeSubButton, settingUtils.selectedSceneIds]);

  const showConfirmSceneObject = (selectedObject: { sceneId: string; type: 'actor' | 'trigger'; id: string }) => {
    const scene = scenes.find(item => item.id === selectedObject.sceneId);
    const collection = selectedObject.type === 'actor' ? scene?.actors : scene?.triggers;
    const object = collection?.find(item => item.id === selectedObject.id);
    if (!scene || !object) { isDeleting.current = false; return; }
    setScenes(previous => previous.map(item => item.id !== scene.id ? item : {
      ...item,
      [selectedObject.type === 'actor' ? 'actors' : 'triggers']: (selectedObject.type === 'actor' ? item.actors : item.triggers)?.filter(entry => entry.id !== selectedObject.id),
      _saved: false,
    }));
    // Object deletion must not leave the parent scene selected implicitly.
    // Otherwise the next Delete key can remove the scene as a side effect of
    // deleting an actor or trigger.
    setElementSelected(null);
    setSettingUtils(previous => ({ ...previous, activeSceneObject: null, activeTriggerId: null, selectedSceneIds: [] }));
    isDeleting.current = false;
  };

  // Scene, Script and Variable deletes are immediate; history provides Undo.
  const showConfirm = (elementDelete: any, sceneIds?: string[]) => {
    const idsToDelete = sceneIds?.length ? sceneIds : [elementDelete.id];
    const resourceType = elementDelete._resourceType;
    if (resourceType === 'script') {
      setScripts(previous => ({ ...previous, scripts: previous.scripts.map(script => script.id === elementDelete.id ? { ...script, _saved: false, _deleted: true } : script), _saved: false }));
    } else if (resourceType === 'variables') {
      setVariables(previous => ({ ...previous, variables: previous.variables.map(variable => variable.id === elementDelete.id ? { ...variable, _saved: false, _deleted: true } : variable), _saved: false }));
    } else {
      setScenes(previous => previous.map(scene => idsToDelete.includes(scene.id) ? { ...scene, _saved: false, _deleted: true } : scene));
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
    const ids = event?.shiftKey
      ? (current.includes(scene.id) ? current.filter(id => id !== scene.id) : [...current, scene.id])
      : [scene.id];
    const activeId = event?.shiftKey && current.includes(scene.id) ? ids.at(-1) : scene.id;
    setSettingUtils(previous => ({ ...previous, selectedSceneIds: ids }));
    setElementSelected(scenes.find(item => item.id === activeId) ?? null);
  }, [elementSelected?.id, scenes, setElementSelected, setSettingUtils, settingUtils.selectedSceneIds]);

  const selectAllScenes = useCallback(() => {
    const activeScenes = scenes.filter(scene => !scene._deleted);
    if (activeScenes.length === 0) return;
    const primaryScene = activeScenes.find(scene => scene.id === elementSelected?.id) ?? activeScenes[0];
    setSettingUtils(previous => ({ ...previous, selectedSceneIds: activeScenes.map(scene => scene.id) }));
    setElementSelected(primaryScene);
  }, [elementSelected?.id, scenes, setElementSelected, setSettingUtils]);

  useEffect(() => {
    window.electronAPI?.on?.('scene-select-all', selectAllScenes);
    return () => window.electronAPI?.removeListener?.('scene-select-all', selectAllScenes);
  }, [selectAllScenes]);

   // função utilitária para calcular o tamanho do mundo
  const calculateWorldSize = (scenes: ISceneSettings[]) => {
    const maxWidth = Math.max(1920, ...scenes.map(el => el.x + el.width));
    const maxHeight = Math.max(1080, ...scenes.map(el => el.y + el.height));
    return { width: maxWidth, height: maxHeight };
  };

  // useEffect para inicialização
  useEffect(() => {
    if (scenes.length > 0) {
      setWorldSize(calculateWorldSize(scenes));
    }
    setLoading(false);
  }, [scenes]);

  // Movendo tela de trabalho
  const handleMoveBackStart = () => {
    setIsMovedBackground(true);
    // console.log(isMovedBackground);
  };

  const getWorldScale = () => {
    const scale = wrapperRef.current?.instance?.transformState?.scale;
    return typeof scale === 'number' && Number.isFinite(scale) && scale > 0 ? scale : zoomLevel;
  };
  const snapWorldCoordinate = (coordinate: number) => Math.round(coordinate / gridValue) * gridValue;
  const getSnappedSceneMovement = (scene: ISceneSettings, delta: { x: number; y: number }) => {
    const scale = getWorldScale();
    const x = snapWorldCoordinate(scene.x + delta.x / scale);
    const y = snapWorldCoordinate(scene.y + delta.y / scale);
    return { x: x - scene.x, y: y - scene.y };
  };

  const handleDragMove = (event: DragMoveEvent) => {
    // Keep the SVG trace aligned with the same zoom-adjusted transform used
    // by the draggable scene while it is still being moved.
    const scene = scenesRef.current.find(item => item.id === String(event.active.id));
    if (!scene) return;
    const movement = getSnappedSceneMovement(scene, event.delta);
    setDraggingSceneOffset({
      id: String(event.active.id),
      ...movement,
    });
  };

  // Lógica arranste do elemento
  const handleDragEnd = (event: DragEndEvent) =>{
    const { active, delta } = event;
    const draggedElement = scenes.find(el => el.id === active.id);
    if (draggedElement) {
      // Persist the exact same world-space delta that is used for the live
      // dnd transform. Raw pointer pixels are incorrect whenever the world
      // is zoomed, and left the Change Scene arrival preview behind.
      // event.delta is the pointer movement in viewport pixels. Recompute the
      // same world-space snap used by the live preview instead of reusing a
      // potentially stale state update from the final pointer event.
      const movement = { id: String(active.id), ...getSnappedSceneMovement(draggedElement, delta) };
      const newX = draggedElement.x + movement.x;
      const newY = draggedElement.y + movement.y;

      // Calcula com limite
      const snappedX = Math.max(leftLimite, newX);
      const snappedY = Math.max(titleHeight, newY);

      // Ajusta a posição do elemento arrastado
      const ids = selectedSceneIds.includes(String(active.id)) ? selectedSceneIds : [String(active.id)];
      setScenes(prev => prev.map(el => {
        if (!ids.includes(el.id)) return el;
        const x = el.id === active.id ? snappedX : Math.max(leftLimite, el.x + movement.x);
        const y = el.id === active.id ? snappedY : Math.max(titleHeight, el.y + movement.y);
        return { ...el, x, y, editorPosition: { x, y }, _saved: false };
      }));

      const newWorld = calculateWorldSize([
        ...scenes.map(el => {
          if (!ids.includes(el.id)) return el;
          const x = el.id === active.id ? snappedX : Math.max(leftLimite, el.x + movement.x);
          const y = el.id === active.id ? snappedY : Math.max(titleHeight, el.y + movement.y);
          return { ...el, x, y };
        })
      ]);

      if (newWorld.width !== worldSize.width || newWorld.height !== worldSize.height) {
        setWorldSize(newWorld);
      }

      setIsMovedBackground(false);
    }
    setDraggingSceneOffset(null);
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
  const handleDropOrCreate = (event: DragEvent, zoomScale: number) => {
    event.preventDefault(); // Previne o comportamento padrão de impedir o drop
    
    const { clientX, clientY } = event;
    // Calcula a posição relativa ao GameWorld
    const gameWorldRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    let relativeX = (clientX - gameWorldRect.left) / zoomScale;
    let relativeY = (clientY - gameWorldRect.top) / zoomScale;

    // Garante que as coordenadas fiquem dentro da grid
    relativeX = Math.max(leftLimite, relativeX - (240 / 2));
    relativeY = Math.max(titleHeight - 33, relativeY - (160 / 2));

    const files = event?.dataTransfer?.files != null ? Array.from(event.dataTransfer.files) : null;

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
        backgroundId: defaultBackground?.id,
        background: background, // caminho da imagem
        backgrounds: [{
          layerId: 2,
          backgroundId: defaultBackground?.id
        }],
        x: relativeX,
        y: relativeY,
        width: initialWidth,
        height: initialHeight,
        cameraPosition: { x: 0, y: 0 },
        sceneType: ETypeScene.TOPDOWN,
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
  const [scaleGradientPixel, setScaleGradientPixel] = useState("1px, transparent 1px");
  const [scaleBorderPixel, setScaleBorderPixel] = useState("16px 16px, 16px 16px, 80px 80px, 80px 80px");

  const handleZoomButtonEffect = () => {
    const current = wrapperRef.current?.instance.transformState;
    if (!current) return;

    const { positionX, positionY, scale } = current;

    const newScale = zoomLevel;
    const ratio = newScale / scale;

    // pega tamanho da viewport
    const viewportWidth = wrapperRef.current?.instance.wrapperComponent?.offsetWidth ?? 0;
    const viewportHeight = wrapperRef.current?.instance.wrapperComponent?.offsetHeight ?? 0;

    // ajusta pan proporcionalmente
    const newX = positionX * ratio + (viewportWidth / 2) * (1 - ratio);
    const newY = positionY * ratio + (viewportHeight / 2) * (1 - ratio);

    wrapperRef.current?.setTransform(newX, newY, newScale);
  };

  const handleChangeTransform = (transform: any) => {
    console.log("transform: ", transform)
    const zoomLevel = Math.trunc(transform.zoom * 100);
    setUserSettings(prev => ({ ...prev, worldScrollX: transform.x, worldScrollY: transform.y, zoom: zoomLevel, _saved: false }));
  }

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
    // console.log("Grid -- level:", zoomLevel);
    setScaleGradientPixel(`${zoomLevel > 10 ? "0.3px" : zoomLevel > 5 ? "0.5px" : "1px"}, transparent ${zoomLevel > 10 ? "0.3px" : zoomLevel > 5 ? "0.5px" : "1px"}`);
    setScaleBorderPixel(`${zoomLevel > 10 ? "4px 4px, 4px 4px, 40px 40px, 40px 40px" : zoomLevel > 5 ? "8px 8px, 8px 8px, 80px 80px, 80px 80px" : "16px 16px, 16px 16px, 80px 80px, 80px 80px"}`);
  }, [zoomLevel]);

  useEffect(() => {
    if (elementSelected && elementSelected._recenter) {
      const el = document.getElementById(elementSelected.id);
      if (el && wrapperRef.current) {
        // centraliza o elemento na viewport
        wrapperRef.current.zoomToElement(el, userSettings.zoom / 100);
        setTimeout(() => {
          const { positionX, positionY, scale } = wrapperRef.current?.instance.transformState!;
          handleChangeTransform({ x: positionX, y: positionY, zoom: scale });
        }, 600); // tempo da animação
      }
    }
  }, [elementSelected?.id, elementSelected?._recenter]);
  // ZOOOM END ------------------------------------------

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null
  );

  // MOUSE ---------------------------------------------
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // console.log('..: handleMouseMove activeSubButton:', activeSubButton);
    if (settingUtils.activeSubButton === "Scene") {
      // Calcula as coordenadas do retângulo
      const rectX = e.nativeEvent.offsetX - 120*1.5; // Centraliza o retângulo
      const rectY = e.nativeEvent.offsetY - 80*1.5;  // Centraliza o retângulo
      setMousePos({ x: rectX, y: rectY });
    }
  };

  const handleMouseClick = (event: any) => {
    if (mousePos && settingUtils.activeSubButton === "Scene") {
      event.stopPropagation();
      console.log("Scene criada em:", mousePos);

      if (pendingScenePlacement) {
        const gameWorldRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const x = Math.max(leftLimite, (event.clientX - gameWorldRect.left) / zoomLevel - (240 / 2));
        const y = Math.max(titleHeight - 33, (event.clientY - gameWorldRect.top) / zoomLevel - (160 / 2));
        window.dispatchEvent(new CustomEvent('gba-studio:commit-scene-placement', { detail: { ...pendingScenePlacement, x, y } }));
        notification.success({ message: pendingScenePlacement.mode === 'cut' ? 'Scene Restored' : 'Scene Copied', showProgress: true });
        setPendingScenePlacement(null);
        return;
      }

      const newScene = handleDropOrCreate(event, zoomLevel);

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
  }, []);

  // UseEffect - Gerencia pastas que foram feitas fetch para inserir novas imagens de background
  useEffect(() => {
    const handlerUpdateBackgrounds = (images: ISettingUtils) => {
      console.log('🔄 Novos backgrounds chegando:', images);
      setUpdatedImages(images);
    };

    window.electronAPI.onUpdateImages(handlerUpdateBackgrounds);
    return () => window.electronAPI.removeListener('updateImages', handlerUpdateBackgrounds);
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
      onDragStart={handleMoveBackStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={() => { setDraggingSceneOffset(null); setIsMovedBackground(false); }}
    >
      <div style={{ display: worldOverlayPosition.measured && worldOverlayPosition.width < 180 ? 'none' : undefined }}>
          <FloatButttons 
            actions={actions} 
            onResetPanelSize={resetPanelSize} 
            onShowFloatButton={setShowFloatButton} 
            showFloatButton={showFloatButton}
            floatingPosition={{ left: worldOverlayPosition.left, top: worldOverlayPosition.top }}
          />
      </div>
      {sceneMousePosition && <FloatButton.Group shape="square" style={{ position: 'fixed', left: worldOverlayPosition.left, right: 'auto', bottom: worldOverlayPosition.bottom, zIndex: 100, pointerEvents: 'none', width: 'max-content', minWidth: 126, maxWidth: 'calc(100vw - 24px)', height: 'auto', minHeight: 16, maxHeight: 'none', padding: 0, overflow: 'visible', display: 'block' }}>
          <Content data-testid="scene-tile-position" style={{ width: 'max-content', minWidth: '100%', height: 'auto', minHeight: 16, padding: '0 7px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', borderRadius: token.borderRadius, background: token.colorBgElevated, color: token.colorTextSecondary, boxShadow: token.boxShadowSecondary, fontSize: 11, lineHeight: '16px', whiteSpace: 'nowrap' }}>
            {sceneMousePosition.scene} · X: {sceneMousePosition.col}, Y: {sceneMousePosition.row}
          </Content>
        </FloatButton.Group>}
      <div data-testid="resource-usage-bars" style={{
        position: 'fixed',
        right: worldOverlayPosition.right,
        bottom: worldOverlayPosition.bottom,
        zIndex: 100,
        // Keep the global ROM indicator available during the first layout
        // frame; only hide it when a measured viewport is genuinely too small.
        display: worldOverlayPosition.measured && worldOverlayPosition.width < 220 ? 'none' : 'flex',
        flexDirection: worldOverlayPosition.width < 390 ? 'column-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 10,
        pointerEvents: 'none',
      }}>
        <Tooltip title={`ROM estimada: ${formatBytes(romUsage.total)} de 32 MB (${romUsage.source === 'build' ? 'recursos do build' : 'estimativa pelos assets'}). Engine: ${formatBytes(romUsage.engine)}, gráficos: ${formatBytes(romUsage.graphics)}, áudio: ${formatBytes(romUsage.audio)}, scripts: ${formatBytes(romUsage.scripts)}.${romUsage.binary ? ` ROM confirmada no último Build: ${formatBytes(romUsage.binary)}.` : ' Execute Build para confirmar com o .gba.'}`}>
          <div style={{ order: 2, width: Math.max(110, Math.min(168, worldOverlayPosition.width - 92)), padding: '4px 8px', borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadowSecondary }}>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 2 }}>ROM estimada</div>
            <Progress percent={Math.min(100, Number((romUsage.total / ROM_LIMIT_BYTES * 100).toFixed(1)))} size="small" status={romUsage.total > ROM_LIMIT_BYTES ? 'exception' : 'normal'} format={percent => `${percent}%`} />
          </div>
        </Tooltip>
        {selectedScene && <Tooltip title={`VRAM cena: ${formatBytes(selectedSceneVram)} de 96 KB.`}>
          <div data-testid="scene-vram-usage" style={{ order: 1, width: Math.max(110, Math.min(168, worldOverlayPosition.width - 92)), padding: '4px 8px', borderRadius: token.borderRadius, background: token.colorBgElevated, boxShadow: token.boxShadowSecondary }}>
            <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 2 }}>VRAM cena</div>
            <Progress percent={Math.min(100, Number((selectedSceneVram / VRAM_LIMIT_BYTES * 100).toFixed(1)))} size="small" status={selectedSceneVram > VRAM_LIMIT_BYTES ? 'exception' : 'normal'} format={percent => `${percent}%`} />
          </div>
        </Tooltip>}
      </div>

      <TransformWrapper
        ref={wrapperRef}
        initialScale={userSettings.zoom / 100}
        initialPositionX={userSettings.worldScrollX}
        initialPositionY={userSettings.worldScrollY}
        
        minScale={0.25} // Ajuste o nível mínimo de zoom out
        maxScale={16}   // Ajuste o nível máximo de zoom in
        zoomAnimation={{ disabled: true }}

        // limitToBounds={true}
        // minPositionX={ 0 }
        // minPositionY={ 0 }
        // maxPositionX={ worldSize.width }
        // maxPositionY={ worldSize.height }
        // onTransformed={e => handleChangeTransform({ x: e.state.positionX, y: e.state.positionY, zoom: e.state.scale })}
        wheel={{ disabled: false, smoothStep: 0.005, step: 1, activationKeys: ['Control'] }}
        onWheelStop={e => handleChangeTransform({ x: e.state.positionX, y: e.state.positionY, zoom: e.state.scale })}
        disabled={isMovedBackground}
        panning={{
          disabled: false,
          velocityDisabled: false,  // Desativar a animação de elástico
          allowLeftClickPan: false,
          allowMiddleClickPan: true,
          allowRightClickPan: false,
        }}
        onPanningStop={e => handleChangeTransform({ x: e.state.positionX, y: e.state.positionY, zoom: e.state.scale })}
        pinch={{ disabled: true }}
      >
        <TransformComponent wrapperStyle={{ width: "100%", height: "100%", overflow: "hidden" }} 
          contentStyle={{
            position: "relative",
            width: worldSize.width + 100, 
            height: worldSize.height + 50,
            background: token.colorBgContainer, 
          }}>
          <Content 
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={(event) => handleMouseClick(event)}
          >
            {/* Grid */}
            <Content 
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                top: `${titleHeight - 33}px`,
                left: `${leftLimite}px`,
                right: 0,
                bottom: 0,
                backgroundImage: `
                  linear-gradient(to right, rgba(0,0,0,0.1) ${scaleGradientPixel}),
                  linear-gradient(to bottom, rgba(0,0,0,0.1) ${scaleGradientPixel}),
                  linear-gradient(to right, rgba(0,0,0,0.2) ${scaleGradientPixel}),
                  linear-gradient(to bottom, rgba(0,0,0,0.2) ${scaleGradientPixel})
                `,
                backgroundSize: `${scaleBorderPixel}`,
                backgroundAttachment: "local"
              }}
            />
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
              <DragAndDrop onDrop={(event) => handleDropOrCreate(event, zoomLevel)} /*height={worldSize.height + titleHeight} width={worldSize.width + leftLimite}*/ />
              
              {/* Retângulo que segue o mouse */}
              {mousePos && settingUtils.activeSubButton === "Scene" && (
                <Content
                  style={{
                    position: "absolute",
                    width: 240*1.5+`px`,
                    height: 160*1.5+"px",
                    left: `${mousePos.x}px`,
                    top: `${mousePos.y}px`,
                    borderRadius: token.borderRadius,
                    backgroundColor: `${token.colorBgMask}`, // Silhueta semitransparente
                    border: `2px dashed ${token.colorPrimary}`, // Bordas destacadas
                    pointerEvents: "none", // Ignora interação com o retângulo
                    zIndex: 6,
                  }}
                />
              )}

              <Content
                style={{ pointerEvents: settingUtils.activeSubButton === "Scene" ? "none" : "auto", }}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('.game-element')) return;
                  setElementSelected(null);
                  setSettingUtils(previous => ({ ...previous, tileEditSceneId: tileEditSceneId ? null : previous.tileEditSceneId, selectedSceneIds: [], activeButton: 'select', activeSubButton: '' }));
                }}
              >
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
                {scenesRef.current.map(scene => (
                  !scene._deleted ? 
                    <GameElement
                      sceneElement={scene}
                      isClipboardSource={clipboardSceneId === scene.id}
                    isSelected={selectedSceneIds.includes(scene.id)}
                    isSecondarySelected={selectedSceneIds.includes(scene.id) && scene.id !== elementSelected?.id}
                      changeScenePreviews={selectedScenePreviews
                        .filter(preview => preview.targetSceneId === scene.id)
                        .map(({ id, x, y, direction }) => ({ id, x, y, direction }))}
                      changeScenePreviewLayer={changeScenePreviewLayer}
                      changeScenePreviewOffset={draggingSceneOffset && (draggingSceneOffset.id === scene.id || selectedSceneIds.includes(scene.id))
                        ? { x: draggingSceneOffset.x, y: draggingSceneOffset.y }
                        : undefined}
                      sceneDragOffset={draggingSceneOffset && (draggingSceneOffset.id === scene.id || selectedSceneIds.includes(scene.id))
                        ? { x: draggingSceneOffset.x, y: draggingSceneOffset.y }
                        : undefined}
                      cameraPreviews={scene.id === selectedScene?.id ? selectedCameraPreviews : []}
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
                        setSettingUtils(previous => ({ ...previous, tileEditSceneId: target.id, tileEditLayerId: 2, activeButton: 'tiles', activeSubButton: previous.activeSubButton || 'pencil' }));
                      }}
                      selectedObject={settingUtils.activeSceneObject?.sceneId === scene.id ? settingUtils.activeSceneObject : null}
                      onSelectObject={(type, id) => {
                        setElementSelected(scene);
                        setSettingUtils(previous => ({ ...previous, tileEditSceneId: scene.id, tileEditLayerId: 4, activeSceneObject: { sceneId: scene.id, type, id }, activeTriggerId: type === 'trigger' ? id : null }));
                      }}
                      onSceneMouseMove={(target, col, row) => setSceneMousePosition({ scene: target.name, col, row })}
                      onSceneMouseLeave={() => setSceneMousePosition(null)}
                      isDimmed={Boolean(tileEditSceneId && tileEditSceneId !== scene.id)}
                      // onElementHovered={(isHovered: boolean) => handleElementHovered(isHovered)}
                    /> 
                  : null
                ))}
              </Content>
            </Content>
            
          </Content>
        </TransformComponent>
      </TransformWrapper>
    </DndContext>

  );
};

export default GameWorld;
