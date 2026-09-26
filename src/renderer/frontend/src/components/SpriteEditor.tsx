import useAppContexts from '@/providers/contexts/AppContexts';
import { useI18n } from '@/i18n/I18n';
import { IMainSettings, ISpriteAnimation, ISpriteAnimationState, ISpriteCanvasFrame, ISpriteFramePiece } from '@/providers/contexts/interfaces/ISettingElement';
import { ISpriteSettings } from '@/providers/contexts/interfaces/ISpriteElement';
import { CaretRightOutlined, CopyOutlined, DeleteOutlined, PlusOutlined, SearchOutlined, TableOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, Collapse, Divider, Empty, Flex, Input, List, Popconfirm, Select, Slider, Space, Spin, Splitter, theme, Tooltip, Typography } from 'antd';
import StepInputNumber, { InputNumber } from './StepInputNumber';
import { PauseOutlined, PlaySquareOutlined, StepBackwardOutlined, StepForwardOutlined } from '@ant-design/icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getNextZoomStep } from '@/utils/zoom';
import ResourceDropSurface from './resourceEditors/ResourceDropSurface';
import ResourceEditorShell from './resourceEditors/ResourceEditorShell';

const ANIMATION_SPEED_OPTIONS = [
  { value: 0, label: 'None', fps: 0 },
  { value: 1, label: 'Speed 1', fps: 0.47 },
  { value: 2, label: 'Speed 2', fps: 0.94 },
  { value: 3, label: 'Speed 3', fps: 1.88 },
  { value: 4, label: 'Speed 4', fps: 3.75 },
  { value: 5, label: 'Speed 5', fps: 7.5 },
  { value: 6, label: 'Speed 6', fps: 15 },
  { value: 7, label: 'Speed 7', fps: 30 },
  { value: 8, label: 'Speed 8', fps: 60 },
] as const;

interface SpriteAsset {
  id: string;
  name: string;
  path: string;
}

interface SpriteSourceSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

type SpriteDirection = IMainSettings['startDirection'];

const directionRows: Record<SpriteDirection, number> = {
  down: 0,
  left: 1,
  right: 2,
  up: 3,
};

const emptyCanvasFrames: ISpriteCanvasFrame[] = [];

const animationsByType: Record<string, Array<{ id: string; name: string; type: string }>> = {
  'fixed-direction': [
    { id: 'idle', name: 'Idle', type: 'idle' },
  ],
  'fixed-direction-movement': [
    { id: 'idle', name: 'Idle', type: 'idle' },
    { id: 'moving', name: 'Moving', type: 'movement' },
  ],
  'horizontal-directions': [
    { id: 'idle-right', name: 'Idle Right', type: 'idle' },
  ],
  'horizontal-directions-movement': [
    { id: 'idle-right', name: 'Idle Right', type: 'idle' },
    { id: 'moving-right', name: 'Moving Right', type: 'movement' },
  ],
  'four-directions': [
    { id: 'idle-right', name: 'Idle Right', type: 'idle' },
    { id: 'idle-up', name: 'Idle Up', type: 'idle' },
    { id: 'idle-down', name: 'Idle Down', type: 'idle' },
  ],
  'four-directions-movement': [
    { id: 'idle-right', name: 'Idle Right', type: 'idle' },
    { id: 'idle-up', name: 'Idle Up', type: 'idle' },
    { id: 'idle-down', name: 'Idle Down', type: 'idle' },
    { id: 'moving-right', name: 'Moving Right', type: 'movement' },
    { id: 'moving-up', name: 'Moving Up', type: 'movement' },
    { id: 'moving-down', name: 'Moving Down', type: 'movement' },
  ],
  'platformer-player': [
    { id: 'idle', name: 'Idle', type: 'idle' },
    { id: 'running', name: 'Running', type: 'movement' },
    { id: 'jumping', name: 'Jumping', type: 'jump' },
    { id: 'climbing', name: 'Climbing', type: 'climb' },
  ],
  cursor: [
    { id: 'idle', name: 'Idle', type: 'idle' },
    { id: 'hover', name: 'Hover', type: 'hover' },
  ],
};

const animationsForType = (type: string, existing: ISpriteAnimation[] = [], flipRightToCreateLeftFacingFrames = true): ISpriteAnimation[] => {
  const definitions = (animationsByType[type] ?? animationsByType['four-directions-movement']).flatMap(definition => [
    definition,
    ...(!flipRightToCreateLeftFacingFrames && (definition.id === 'idle-right' || definition.id === 'moving-right')
      ? [{
        id: definition.id.replace('-right', '-left'),
        name: definition.name.replace('Right', 'Left'),
        type: definition.type,
      }]
      : []),
  ]);
  return definitions.map(definition => {
    const current = existing.find(animation => animation.id === definition.id);
    return current
      ? { ...current, name: definition.name, type: definition.type }
      // Every generated animation starts with one editable frame slot. This
      // keeps a newly created state usable immediately, including after
      // changing its animation preset.
      : { ...definition, frames: [0] };
  });
};

const SpriteEditor: React.FC = () => {
  const { message } = App.useApp();
  const { t } = useI18n();
  const { settings, setSettings, spriteResources, setSpriteResources, userSettings, setUserSettings, setSettingUtils } = useAppContexts();
  const [sprites, setSprites] = useState<SpriteAsset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(settings?.playerSpriteId ?? null);
  const [preview, setPreview] = useState<string | null>(null);
  const [framePreviews, setFramePreviews] = useState<string[]>([]);
  const [tilePreviews, setTilePreviews] = useState<string[]>([]);
  const minimumSelectionHeight = 16;
  const [sourceSelection, setSourceSelection] = useState<SpriteSourceSelection | null>(null);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [canvasFramePreviews, setCanvasFramePreviews] = useState<Record<string, string>>({});
  const [selectedCanvasFrameId, setSelectedCanvasFrameId] = useState<string | null>(null);
  const [draggedCanvasFrameId, setDraggedCanvasFrameId] = useState<string | null>(null);
  const [canvasDragOrder, setCanvasDragOrder] = useState<string[] | null>(null);
  const [draggedIndexedFramePosition, setDraggedIndexedFramePosition] = useState<number | null>(null);
  const [hoveredFrameKey, setHoveredFrameKey] = useState<string | null>(null);
  const [animationCanvasPreview, setAnimationCanvasPreview] = useState<string | null>(null);
  const [sourceSelectionPreview, setSourceSelectionPreview] = useState<string | null>(null);
  const [canvasHoverPosition, setCanvasHoverPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewAnimationSpeed, setPreviewAnimationSpeed] = useState(6);
  const [selectedStateId, setSelectedStateId] = useState('player');
  const [selectedAnimationId, setSelectedAnimationId] = useState('idle-right');
  const [animationPreset, setAnimationPreset] = useState('four-directions-movement');
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [sourceZoom, setSourceZoom] = useState(200);
  const [showGrid, setShowGrid] = useState(true);
  const [spriteSearch, setSpriteSearch] = useState('');
  const [spriteSearchOpen, setSpriteSearchOpen] = useState(false);
  const [spriteNameInput, setSpriteNameInput] = useState('');
  const [isSpriteNameEditing, setIsSpriteNameEditing] = useState(false);
  const [isStateNameEditing, setIsStateNameEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isCollisionSettingsHovered, setIsCollisionSettingsHovered] = useState(false);
  const { token } = theme.useToken();
  const previewZoom = userSettings.zoom ?? 100;

  const selectedSpriteResource = spriteResources.find(sprite => sprite.id === selectedId) ?? null;
  const frameWidth = selectedSpriteResource?.playerFrameWidth ?? settings?.playerFrameWidth ?? 16;
  const frameHeight = selectedSpriteResource?.playerFrameHeight ?? settings?.playerFrameHeight ?? 16;
  const framesPerDirection = selectedSpriteResource?.playerFramesPerDirection ?? settings?.playerFramesPerDirection ?? 4;
  const direction = settings?.startDirection ?? 'right';
  const canvasOriginX = selectedSpriteResource?.playerCanvasOriginX ?? settings?.playerCanvasOriginX ?? 0;
  const canvasOriginY = selectedSpriteResource?.playerCanvasOriginY ?? settings?.playerCanvasOriginY ?? Math.floor(frameHeight / 2);
  const collisionX = selectedSpriteResource?.playerCollisionX ?? settings?.playerCollisionX ?? 0;
  const collisionY = selectedSpriteResource?.playerCollisionY ?? settings?.playerCollisionY ?? 0;
  const collisionWidth = selectedSpriteResource?.playerCollisionWidth ?? settings?.playerCollisionWidth ?? frameWidth;
  const collisionHeight = selectedSpriteResource?.playerCollisionHeight ?? settings?.playerCollisionHeight ?? Math.max(1, Math.floor(frameHeight / 2));
  const defaultAnimations: ISpriteAnimation[] = [
    { id: 'idle-right', name: 'Idle Right', type: 'idle', frames: [0] },
    { id: 'idle-up', name: 'Idle Up', type: 'idle', frames: [0] },
    { id: 'idle-down', name: 'Idle Down', type: 'idle', frames: [0] },
    { id: 'moving-right', name: 'Moving Right', type: 'movement', frames: [0, 1] },
    { id: 'moving-up', name: 'Moving Up', type: 'movement', frames: [0, 1] },
    { id: 'moving-down', name: 'Moving Down', type: 'movement', frames: [0, 1] },
  ];
  const animationStates: ISpriteAnimationState[] = selectedSpriteResource?.playerAnimationStates ?? settings?.playerAnimationStates ?? [{
    id: 'player',
    name: 'Player',
    type: animationPreset,
    animations: selectedSpriteResource?.playerAnimations ?? settings?.playerAnimations ?? defaultAnimations,
  }];
  const selectedState = animationStates.find(state => state.id === selectedStateId) ?? animationStates[0];
  const flipRightToCreateLeftFacingFrames = selectedState?.flipRightToCreateLeftFacingFrames ?? true;
  const animations = selectedState?.animations ?? [];
  const selectedAnimation = animations.find(animation => animation.id === selectedAnimationId) ?? animations[0];
  const canvasFrames = selectedAnimation?.canvasFrames ?? emptyCanvasFrames;
  const frameCount = (selectedAnimation?.frames.length ?? 0) + canvasFrames.length;
  const selectedCanvasFrame = canvasFrames.find(frame => frame.id === selectedCanvasFrameId) ?? null;

  const selectedSprite = useMemo(
    () => sprites.find(sprite => sprite.id === selectedId) ?? null,
    [selectedId, sprites]
  );
  const filteredSprites = useMemo(
    () => sprites.filter(sprite => sprite.name.toLowerCase().includes(spriteSearch.trim().toLowerCase())),
    [spriteSearch, sprites],
  );
  const displayedPreview = selectedCanvasFrame
    ? canvasFramePreviews[selectedCanvasFrame.id] ?? null
    : preview;
  const displayedFrameWidth = selectedCanvasFrame?.width ?? frameWidth;
  const displayedFrameHeight = selectedCanvasFrame?.height ?? frameHeight;

  useEffect(() => {
    if (!selectedSprite || selectedSpriteResource) return;
    const legacyAnimations = settings?.playerAnimations ?? defaultAnimations;
    const legacyStates = settings?.playerAnimationStates ?? [{
      id: 'player',
      name: 'Player',
      type: 'four-directions-movement',
      animations: legacyAnimations,
    }];
    const resource: ISpriteSettings = {
      _resourceType: 'sprite',
      _saved: false,
      _deleted: false,
      id: selectedSprite.id,
      name: selectedSprite.id,
      filename: selectedSprite.name,
      imageWidth: imageSize.width,
      imageHeight: imageSize.height,
      playerFrameWidth: settings?.playerFrameWidth ?? 16,
      playerFrameHeight: settings?.playerFrameHeight ?? 16,
      playerFramesPerDirection: settings?.playerFramesPerDirection ?? 4,
      playerAnimSpeed: settings?.playerAnimSpeed ?? 6,
      playerIdleFrame: settings?.playerIdleFrame ?? 0,
      playerCanvasOriginX: settings?.playerCanvasOriginX ?? 0,
      playerCanvasOriginY: settings?.playerCanvasOriginY ?? 8,
      playerCollisionX: settings?.playerCollisionX ?? 0,
      playerCollisionY: settings?.playerCollisionY ?? 0,
      playerCollisionWidth: settings?.playerCollisionWidth ?? 16,
      playerCollisionHeight: settings?.playerCollisionHeight ?? 8,
      playerAnimations: legacyAnimations,
      playerAnimationStates: legacyStates,
    };
    setSpriteResources(previous => previous.some(sprite => sprite.id === resource.id)
      ? previous
      : [...previous, resource]);
  }, [selectedSprite, selectedSpriteResource, setSpriteResources]);

  const loadSprites = useCallback(async () => {
      setLoading(true);
      try {
        const response = await window.electronAPI.fetchImages('sprites');
        if (response.status !== 'success' || !Array.isArray(response.fileImages)) {
          setSprites([]);
          return;
        }

        setSprites(response.fileImages
          .filter((filename: string) => /\.(png|jpg|jpeg|gif|bmp)$/i.test(filename))
          .map((filename: string) => ({
            id: filename.replace(/\.[^/.]+$/, ''),
            name: filename,
            path: `${response.localPath}/${filename}`,
          })));
      } catch (error) {
        console.error('Error loading sprites:', error);
        setSprites([]);
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => { void loadSprites(); }, [loadSprites]);
  useEffect(() => {
    const reload = () => { void loadSprites(); };
    window.addEventListener('gba-studio:assets-reloaded', reload);
    return () => window.removeEventListener('gba-studio:assets-reloaded', reload);
  }, [loadSprites]);

  const handleDroppedSprites = async (filePaths: string[]) => {
    const compatible = filePaths.filter(filePath => /\.(png|jpg|jpeg|gif|bmp)$/i.test(filePath));
    if (compatible.length === 0) {
      message.warning('No compatible sprite images were dropped.');
      return;
    }
    const response = await window.electronAPI.importDroppedAssets('sprites', compatible);
    if (response?.status === 'success') {
      message.success(`${response.files.length} sprite(s) imported`);
      await loadSprites();
    } else if (response?.status === 'error') message.error(response.message);
  };

  useEffect(() => {
    setSelectedId(settings?.playerSpriteId ?? null);
  }, [settings?.playerSpriteId]);

  useEffect(() => {
    setSpriteNameInput(selectedSprite?.name.replace(/\.[^/.]+$/, '') ?? '');
  }, [selectedSprite]);

  useEffect(() => {
    if (!isPlaying || (framePreviews.length === 0 && canvasFrames.length === 0)) return;
    const previewFps = ANIMATION_SPEED_OPTIONS[previewAnimationSpeed]?.fps ?? 0;
    if (previewFps <= 0) return;
    const timer = window.setInterval(() => {
      if (canvasFrames.length > 0) {
        const currentIndex = Math.max(0, canvasFrames.findIndex(frame => frame.id === selectedCanvasFrameId));
        setSelectedCanvasFrameId(canvasFrames[(currentIndex + 1) % canvasFrames.length].id);
        return;
      }
      const animationFrames = selectedAnimation?.frames ?? framePreviews.map((_, index) => index);
      if (animationFrames.length === 0) return;
      const currentIndex = Math.max(0, animationFrames.indexOf(selectedFrame));
      setSelectedFrame(animationFrames[(currentIndex + 1) % animationFrames.length] ?? 0);
    }, Math.max(16, Math.round(1000 / previewFps)));
    return () => window.clearInterval(timer);
  }, [canvasFrames, framePreviews.length, isPlaying, previewAnimationSpeed, selectedAnimation, selectedCanvasFrameId, selectedFrame]);

  useEffect(() => {
    if (!selectedSprite) {
      setPreview(null);
      setSourceSelection(null);
      setImageSize({ width: 0, height: 0 });
      return;
    }

    const image = new window.Image();
    image.onload = () => {
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      setSpriteResources(previous => previous.map(sprite => sprite.id === selectedSprite.id && (
        sprite.imageWidth !== image.naturalWidth || sprite.imageHeight !== image.naturalHeight
      ) ? {
        ...sprite,
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        _saved: false,
      } : sprite));
      const columns = Math.max(1, Math.floor(image.naturalWidth / frameWidth));
      const rows = Math.max(1, Math.floor(image.naturalHeight / frameHeight));
      const tiles = Array.from({ length: columns * rows }, (_, tileIndex) => {
        const canvas = document.createElement('canvas');
        canvas.width = frameWidth;
        canvas.height = frameHeight;
        const context = canvas.getContext('2d');
        if (!context) return '';
        context.imageSmoothingEnabled = false;
        const tileX = tileIndex % columns;
        const tileY = Math.floor(tileIndex / columns);
        context.drawImage(image, tileX * frameWidth, tileY * frameHeight, frameWidth, frameHeight, 0, 0, frameWidth, frameHeight);
        return canvas.toDataURL('image/png');
      });
      const directionFrames = Array.from({ length: Math.min(framesPerDirection, columns) }, (_, frame) => directionRows[direction] * columns + frame);
      setTilePreviews(tiles);
      setFramePreviews(directionFrames.map(tileIndex => tiles[tileIndex] ?? ''));
      setPreview(tiles[selectedFrame] ?? tiles[directionFrames[0]] ?? null);
    };
    image.onerror = () => setPreview(null);
    image.src = selectedSprite.path;
  }, [direction, frameHeight, frameWidth, framesPerDirection, selectedFrame, selectedSprite]);

  useEffect(() => {
    setPreview(tilePreviews[selectedFrame] ?? null);
  }, [selectedFrame, tilePreviews]);

  useEffect(() => {
    const frames = selectedAnimation?.frames ?? [];
    if (frames.length === 0 || tilePreviews.length === 0) {
      setAnimationCanvasPreview(null);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = frameWidth * frames.length;
    canvas.height = frameHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.imageSmoothingEnabled = false;

    const images = frames.map(frame => {
      const image = new window.Image();
      image.src = tilePreviews[frame] ?? '';
      return image;
    });
    Promise.all(images.map(image => new Promise<void>(resolve => {
      if (image.complete) resolve();
      else image.onload = () => resolve();
    }))).then(() => {
      images.forEach((image, index) => context.drawImage(image, index * frameWidth, 0, frameWidth, frameHeight));
      setAnimationCanvasPreview(canvas.toDataURL('image/png'));
    });
  }, [frameHeight, frameWidth, selectedAnimation, tilePreviews]);

  useEffect(() => {
    if (!selectedSprite || canvasFrames.length === 0) {
      setCanvasFramePreviews({});
      return;
    }

    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      const previews = canvasFrames.reduce<Record<string, string>>((result, frame) => {
        const canvas = document.createElement('canvas');
        canvas.width = frame.width;
        canvas.height = frame.height;
        const context = canvas.getContext('2d');
        if (!context) return result;
        context.imageSmoothingEnabled = false;
        frame.pieces.forEach(piece => {
          context.drawImage(
            image,
            piece.sourceX,
            piece.sourceY,
            piece.width,
            piece.height,
            piece.x,
            piece.y,
            piece.width,
            piece.height,
          );
        });
        result[frame.id] = canvas.toDataURL('image/png');
        return result;
      }, {});
      if (!cancelled) setCanvasFramePreviews(previews);
    };
    image.src = selectedSprite.path;
    return () => { cancelled = true; };
  }, [canvasFrames, selectedSprite]);

  useEffect(() => {
    if (!selectedSprite || !sourceSelection) {
      setSourceSelectionPreview(null);
      return;
    }
    let cancelled = false;
    const image = new window.Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = sourceSelection.width;
      canvas.height = sourceSelection.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.drawImage(
        image,
        sourceSelection.x,
        sourceSelection.y,
        sourceSelection.width,
        sourceSelection.height,
        0,
        0,
        sourceSelection.width,
        sourceSelection.height,
      );
      if (!cancelled) setSourceSelectionPreview(canvas.toDataURL('image/png'));
    };
    image.src = selectedSprite.path;
    return () => { cancelled = true; };
  }, [selectedSprite, sourceSelection]);

  const updateSettings = (changes: Partial<ISpriteSettings>) => {
    if (!selectedId) return;
    setSpriteResources(previous => previous.map(sprite => sprite.id === selectedId
      ? { ...sprite, ...changes, _saved: false }
      : sprite));
  };

  const updateAnimations = (nextAnimations: ISpriteAnimation[]) => {
    const nextStates = animationStates.map(state => state.id === selectedState?.id
      ? { ...state, animations: nextAnimations }
      : state);
    updateSettings({ playerAnimationStates: nextStates, playerAnimations: nextAnimations });
  };

  // Selecting a state must also reset the preview selection. Without this,
  // the frame index from the previously selected state remains highlighted,
  // which can point at a different animation (or an empty slot).
  const selectState = (state: ISpriteAnimationState | undefined) => {
    if (!state) return;
    const firstAnimation = state.animations[0];
    setSelectedStateId(state.id);
    setSelectedAnimationId(firstAnimation?.id ?? '');
    setSelectedFrame(firstAnimation?.frames[0] ?? 0);
    setSelectedCanvasFrameId(firstAnimation?.canvasFrames?.[0]?.id ?? null);
    setIsPlaying(false);
  };

  const addState = () => {
    const id = `state-${Date.now()}`;
    const type = 'four-directions-movement';
    const stateFlipRightToCreateLeftFacingFrames = selectedState?.flipRightToCreateLeftFacingFrames ?? true;
    const stateAnimations = animationsForType(type, [], stateFlipRightToCreateLeftFacingFrames).map((animation, index) => index === 0
      ? { ...animation, frames: [], canvasFrames: [{ id: `canvas-frame-${Date.now()}`, width: Math.max(8, frameWidth), height: Math.max(16, frameHeight), pieces: [] }] }
      : animation);
    const nextState: ISpriteAnimationState = {
      id,
      name: 'New State',
      type,
      flipRightToCreateLeftFacingFrames: stateFlipRightToCreateLeftFacingFrames,
      animations: stateAnimations,
    };
    updateSettings({ playerAnimationStates: [...animationStates, nextState] });
    setSelectedStateId(id);
    setSelectedAnimationId(stateAnimations[0].id);
  };

  const changeAnimationType = (type: string) => {
    if (!selectedState) return;
    const nextAnimations = animationsForType(type, selectedState.animations, flipRightToCreateLeftFacingFrames);
    updateSettings({
      playerAnimationStates: animationStates.map(state => state.id === selectedState.id
        ? { ...state, type, animations: nextAnimations }
        : state),
      playerAnimations: nextAnimations,
    });
    setAnimationPreset(type);
    setSelectedAnimationId(nextAnimations[0]?.id ?? '');
    setSelectedCanvasFrameId(null);
  };

  const changeFlipRightToCreateLeftFacingFrames = (checked: boolean) => {
    if (!selectedState) return;
    const nextAnimations = animationsForType(selectedState.type, selectedState.animations, checked);
    const nextStates = animationStates.map(state => state.id === selectedState.id
      ? { ...state, flipRightToCreateLeftFacingFrames: checked, animations: nextAnimations }
      : state);
    updateSettings({
      playerAnimationStates: nextStates,
      playerAnimations: nextAnimations,
    });
  };

  const deleteState = (stateId: string) => {
    const nextStates = animationStates.filter(state => state.id !== stateId);
    updateSettings({ playerAnimationStates: nextStates });
    if (selectedStateId === stateId) {
      const nextState = nextStates[0];
      setSelectedStateId(nextState?.id ?? '');
      setSelectedAnimationId(nextState?.animations[0]?.id ?? '');
      setSelectedCanvasFrameId(null);
    }
  };

  const removeFrame = (framePosition: number) => {
    if (!selectedAnimation || frameCount <= 1) return;
    const nextFrames = selectedAnimation.frames.filter((_, index) => index !== framePosition);
    updateAnimations(animations.map(animation => animation.id === selectedAnimation.id ? { ...animation, frames: nextFrames } : animation));
    if (!nextFrames.includes(selectedFrame)) setSelectedFrame(nextFrames[0] ?? 0);
  };

  const updateCanvasFrames = (nextCanvasFrames: ISpriteCanvasFrame[]) => {
    if (!selectedAnimation) return;
    updateAnimations(animations.map(animation => animation.id === selectedAnimation.id
      ? { ...animation, canvasFrames: nextCanvasFrames }
      : animation));
  };

  const updateCanvasDimension = (dimension: 'width' | 'height', value: number) => {
    const normalizedValue = Math.max(dimension === 'height' ? 16 : 8, Math.ceil(value / 8) * 8);
    updateSettings(dimension === 'width'
      ? { playerFrameWidth: normalizedValue }
      : { playerFrameHeight: normalizedValue });
    if (canvasFrames.length > 0) {
      updateCanvasFrames(canvasFrames.map(frame => ({ ...frame, [dimension]: normalizedValue })));
    }
  };

  const addBlankFrame = () => {
    if (!selectedAnimation) return;
    const id = `canvas-frame-${Date.now()}`;
    const frame: ISpriteCanvasFrame = {
      id,
      width: Math.max(8, frameWidth),
      height: Math.max(16, frameHeight),
      pieces: [],
    };
    updateCanvasFrames([...canvasFrames, frame]);
    setSelectedCanvasFrameId(id);
    setIsPlaying(false);
  };

  const removeCanvasFrame = (frameId: string) => {
    if (frameCount <= 1) return;
    const nextFrames = canvasFrames.filter(frame => frame.id !== frameId);
    updateCanvasFrames(nextFrames);
    if (selectedCanvasFrameId === frameId) setSelectedCanvasFrameId(nextFrames[0]?.id ?? null);
  };

  const cloneCanvasFrame = (frame: ISpriteCanvasFrame) => {
    const id = `canvas-frame-${Date.now()}`;
    const clone: ISpriteCanvasFrame = {
      ...frame,
      id,
      pieces: frame.pieces.map((piece, index) => ({ ...piece, id: `piece-${Date.now()}-${index}` })),
    };
    const index = canvasFrames.findIndex(item => item.id === frame.id);
    const nextFrames = [...canvasFrames];
    nextFrames.splice(index + 1, 0, clone);
    updateCanvasFrames(nextFrames);
    setSelectedCanvasFrameId(id);
    setIsPlaying(false);
  };

  const previewCanvasFrameOrder = (targetId: string) => {
    if (!draggedCanvasFrameId || draggedCanvasFrameId === targetId) return;
    setCanvasDragOrder(previous => {
      const order = previous ?? canvasFrames.map(frame => frame.id);
      const sourceIndex = order.indexOf(draggedCanvasFrameId);
      const targetIndex = order.indexOf(targetId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return order;
      const nextOrder = [...order];
      nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, draggedCanvasFrameId);
      return nextOrder;
    });
  };

  const commitCanvasFrameOrder = () => {
    if (!canvasDragOrder) return;
    const framesById = new Map(canvasFrames.map(frame => [frame.id, frame]));
    const orderedFrames = canvasDragOrder.map(id => framesById.get(id)).filter((frame): frame is ISpriteCanvasFrame => Boolean(frame));
    if (orderedFrames.length === canvasFrames.length) updateCanvasFrames(orderedFrames);
  };

  const setFrameDragImage = (event: React.DragEvent<HTMLDivElement>) => {
    // Use a detached copy of the complete card so the browser doesn't use
    // only the inner image/button as the drag preview.
    const dragImage = event.currentTarget.cloneNode(true) as HTMLDivElement;
    dragImage.style.position = 'fixed';
    dragImage.style.left = '-1000px';
    dragImage.style.top = '-1000px';
    dragImage.style.opacity = '1';
    dragImage.style.pointerEvents = 'none';
    dragImage.querySelectorAll<HTMLElement>('[aria-label]').forEach(element => {
      const label = element.getAttribute('aria-label') || '';
      if (label.startsWith('Clone ') || label.startsWith('Remove ') || label.startsWith('Frame ')) {
        element.style.display = 'none';
      }
    });
    document.body.appendChild(dragImage);
    event.dataTransfer.setDragImage(dragImage, 36, 36);
    window.setTimeout(() => dragImage.remove(), 0);
  };

  const cloneIndexedFrame = (framePosition: number) => {
    if (!selectedAnimation) return;
    const nextFrames = [...selectedAnimation.frames];
    nextFrames.splice(framePosition + 1, 0, selectedAnimation.frames[framePosition]);
    updateAnimations(animations.map(animation => animation.id === selectedAnimation.id ? { ...animation, frames: nextFrames } : animation));
    setIsPlaying(false);
  };

  const reorderIndexedFrames = (sourcePosition: number, targetPosition: number) => {
    if (!selectedAnimation || sourcePosition === targetPosition) return;
    const nextFrames = [...selectedAnimation.frames];
    const [moved] = nextFrames.splice(sourcePosition, 1);
    nextFrames.splice(targetPosition, 0, moved);
    updateAnimations(animations.map(animation => animation.id === selectedAnimation.id ? { ...animation, frames: nextFrames } : animation));
  };

  const placeSelection = (anchorX = 0, anchorY = 0) => {
    if (!selectedCanvasFrame || !sourceSelection) return;
    const piece: ISpriteFramePiece = {
      id: `piece-${Date.now()}`,
      sourceX: sourceSelection.x,
      sourceY: sourceSelection.y,
      width: sourceSelection.width,
      height: sourceSelection.height,
      x: Math.min(Math.max(0, selectedCanvasFrame.width - sourceSelection.width), anchorX),
      y: Math.min(Math.max(0, selectedCanvasFrame.height - sourceSelection.height), anchorY),
    };
    updateCanvasFrames(canvasFrames.map(frame => frame.id === selectedCanvasFrame.id
      ? { ...frame, pieces: [...frame.pieces, piece] }
      : frame));
  };

  const placeSelectionAtCanvasPosition = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedCanvasFrame || !sourceSelection) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - bounds.left) * 100 / previewZoom) / 8) * 8;
    const y = Math.floor(((event.clientY - bounds.top) * 100 / previewZoom) / 8) * 8;
    placeSelection(x, y);
  };

  const updateCanvasHoverPosition = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedCanvasFrame || !sourceSelection) {
      setCanvasHoverPosition(null);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const rawX = Math.floor(((event.clientX - bounds.left) * 100 / previewZoom) / 8) * 8;
    const rawY = Math.floor(((event.clientY - bounds.top) * 100 / previewZoom) / 8) * 8;
    setCanvasHoverPosition({
      x: Math.min(Math.max(0, selectedCanvasFrame.width - sourceSelection.width), Math.max(0, rawX)),
      y: Math.min(Math.max(0, selectedCanvasFrame.height - sourceSelection.height), Math.max(0, rawY)),
    });
  };

  const decreaseTilesZoom = () => {
    setSourceZoom(value => getNextZoomStep(value, -1));
  };

  const increaseTilesZoom = () => {
    setSourceZoom(value => getNextZoomStep(value, 1));
  };

  const changePreviewZoom = (change: number) => {
    setUserSettings(previous => ({ ...previous, zoom: getNextZoomStep(previous.zoom, change), _saved: false }));
    setSettingUtils(previous => ({ ...previous, buttonZoomPressed: true }));
  };

  const sourcePointFromEvent = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(Math.max(0, imageSize.width - 8), Math.floor(((event.clientX - bounds.left) / bounds.width * imageSize.width) / 8) * 8),
      y: Math.min(Math.max(0, imageSize.height - 8), Math.floor(((event.clientY - bounds.top) / bounds.height * imageSize.height) / 8) * 8),
    };
  };

  const beginSourceSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selectedSprite || imageSize.width === 0 || imageSize.height === 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = sourcePointFromEvent(event);
    const height = Math.min(minimumSelectionHeight, imageSize.height - point.y);
    setSelectionStart(point);
    setSourceSelection({ x: point.x, y: point.y, width: Math.min(8, imageSize.width - point.x), height });
  };

  const resizeSourceSelection = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!selectionStart) return;
    const point = sourcePointFromEvent(event);
    const x = Math.min(selectionStart.x, point.x);
    const y = Math.min(selectionStart.y, point.y);
    const width = Math.min(imageSize.width - x, Math.max(8, Math.abs(point.x - selectionStart.x) + 8));
    const height = Math.min(imageSize.height - y, Math.max(minimumSelectionHeight, Math.abs(point.y - selectionStart.y) + 8));
    setSourceSelection({ x, y, width, height });
  };

  const selectSprite = (id: string) => {
    setSelectedId(id);
  };

  const renameSelectedSprite = async () => {
    if (!selectedSprite) return;
    const nextBaseName = spriteNameInput.trim();
    const extension = selectedSprite.name.match(/\.[^/.]+$/)?.[0] ?? '';
    const currentBaseName = selectedSprite.name.slice(0, selectedSprite.name.length - extension.length);
    if (!nextBaseName || nextBaseName === currentBaseName) {
      setSpriteNameInput(currentBaseName);
      return;
    }

    const nextFilename = `${nextBaseName}${extension}`;
    const response = await window.electronAPI.renameAsset('sprites', selectedSprite.name, nextFilename);
    if (response?.status !== 'success') {
      console.error('Unable to rename sprite:', response?.message);
      setSpriteNameInput(currentBaseName);
      return;
    }

    const nextId = nextFilename.replace(/\.[^/.]+$/, '');
    const previousId = selectedSprite.id;
    const nextPath = `${selectedSprite.path.slice(0, selectedSprite.path.lastIndexOf('/') + 1)}${nextFilename}`;
    setSprites(previous => previous.map(sprite => sprite.id === previousId
      ? { ...sprite, id: nextId, name: nextFilename, path: nextPath }
      : sprite));
    setSpriteResources(previous => previous.map(sprite => sprite.id === previousId
      ? { ...sprite, id: nextId, name: nextId, filename: nextFilename, _saved: false }
      : sprite));
    setSelectedId(nextId);
    if (settings?.playerSpriteId === previousId) {
      setSettings(previous => ({ ...previous, playerSpriteId: nextId, _saved: false }));
    }
  };

  const chooseFrame = (frame: number) => {
    setSelectedCanvasFrameId(null);
    setSelectedFrame(frame);
  };

  const stepFrame = (offset: -1 | 1) => {
    if (selectedCanvasFrame && canvasFrames.length > 0) {
      const currentIndex = Math.max(0, canvasFrames.findIndex(frame => frame.id === selectedCanvasFrame.id));
      const nextIndex = (currentIndex + offset + canvasFrames.length) % canvasFrames.length;
      setSelectedCanvasFrameId(canvasFrames[nextIndex].id);
      return;
    }
    chooseFrame(Math.min(tilePreviews.length - 1, Math.max(0, selectedFrame + offset)));
  };

  if (loading) {
    return <Flex align="center" justify="center" style={{ height: '100%' }}><Spin size="large" /></Flex>;
  }

  return (
    <ResourceEditorShell title="Sprites" library={null} customPanels>
      <Splitter.Panel defaultSize={260} min={220} collapsible={false}>
      <Flex vertical style={{ width: '100%', height: '100%', borderRight: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgBase, overflow: 'hidden' }}>
        <Splitter layout="vertical">
          <Splitter.Panel defaultSize={selectedSprite ? '48%' : '100%'} min={90} collapsible>
          <Flex vertical style={{ height: '100%', overflow: 'auto' }}>
        <Flex align="center" justify="space-between" style={{ height: 40, padding: '0 12px', background: token.colorBorder, color: '#fff' }}>
          <Flex align="center">
          <CaretRightOutlined rotate={90} style={{ marginRight: 8 }} />
          <Typography.Text strong style={{ color: '#fff' }}>SPRITES</Typography.Text>
          </Flex>
          <Tooltip placement="right" title="Search" color={token.colorBorder}><SearchOutlined style={{ padding: 4, borderRadius: token.borderRadius, backgroundColor: spriteSearchOpen ? token.colorPrimary : 'transparent', cursor: 'pointer' }} onClick={() => { setSpriteSearchOpen(previous => !previous); if (spriteSearchOpen) setSpriteSearch(''); }} /></Tooltip>
        </Flex>
        {spriteSearchOpen && <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search sprites"
          value={spriteSearch}
          onChange={event => setSpriteSearch(event.target.value)}
          style={{ margin: '8px 8px 8px', width: 'calc(100% - 16px)' }}
        />}
        {sprites.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No sprites found" />
        ) : (
          <List
            size="small"
            dataSource={filteredSprites}
            renderItem={sprite => (
              <List.Item
                onClick={() => selectSprite(sprite.id)}
                style={{
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: token.borderRadius,
                  background: sprite.id === selectedId ? token.colorPrimaryBg : undefined,
                }}
              >
                <Space>
                  <Typography.Text ellipsis style={{ maxWidth: 180, color: token.colorText }}>{sprite.name}</Typography.Text>
                </Space>
              </List.Item>
            )}
          />
        )}
          </Flex>
          </Splitter.Panel>
          {selectedSprite && (
          <Splitter.Panel defaultSize="52%" min={90} collapsible>
          <Flex vertical style={{ height: '100%', overflow: 'auto' }}>
        <Flex align="center" justify="space-between" style={{ height: 40, padding: '0 8px', background: token.colorBorder }}>
          <Flex align="center">
            <CaretRightOutlined rotate={90} style={{ marginRight: 8, color: '#fff' }} />
            <Typography.Text strong style={{ color: '#fff' }}>ANIMATION STATES</Typography.Text>
          </Flex>
          <Button type="text" size="small" onClick={addState}>+</Button>
        </Flex>
        <Collapse
          ghost
          accordion
          activeKey={selectedStateId}
          onChange={key => {
            const stateId = String(key);
            const state = animationStates.find(item => item.id === stateId);
            selectState(state);
          }}
          items={animationStates.map(state => ({
            key: state.id,
            label: (
              <Flex align="center" justify="space-between" gap={6}>
                <Typography.Text ellipsis>{state.name}</Typography.Text>
                <Popconfirm
                  title="Delete animation state?"
                  description="All frames in this state will be removed."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => deleteState(state.id)}
                >
                  <Button
                    aria-label={`Delete state ${state.name}`}
                    danger
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    onClick={event => event.stopPropagation()}
                  />
                </Popconfirm>
              </Flex>
            ),
            children: (
              <Flex vertical gap={6}>
                {state.animations.map(animation => (
                  <Flex key={animation.id} align="center">
                <Button
                  block
                  type={animation.id === selectedAnimationId ? 'primary' : 'text'}
                  size="small"
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => {
                    setSelectedStateId(state.id);
                    setSelectedAnimationId(animation.id);
                    setSelectedFrame(animation.frames[0] ?? 0);
                    setSelectedCanvasFrameId(animation.canvasFrames?.[0]?.id ?? null);
                    setIsPlaying(false);
                  }}
                >
                      {animation.name}
                    </Button>
                  </Flex>
                ))}
              </Flex>
            ),
          }))}
        />
          </Flex>
          </Splitter.Panel>
          )}
        </Splitter>
      </Flex>
      </Splitter.Panel>

      {selectedSprite && (
      <Splitter.Panel min={360}>
      <ResourceDropSurface onFiles={handleDroppedSprites} hint="Drop a sprite image here">
      <Flex vertical style={{ width: '100%', height: '100%', minWidth: 0, background: token.colorBgContainer, overflow: 'hidden' }}>
        <Flex gap={8} align="center" justify="space-between" wrap="wrap" style={{ padding: 8, background: token.colorBorder, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
          <Flex gap={8} align="center" style={{ flex: 1, minWidth: 300 }}>
            <Typography.Text strong style={{ color: '#fff', whiteSpace: 'nowrap' }}>PREVIEW</Typography.Text>
            <Tooltip title="Previous frame"><Button size="small" icon={<StepBackwardOutlined />} onClick={() => stepFrame(-1)} /></Tooltip>
            <Tooltip title={isPlaying ? 'Pause' : 'Play'}><Button size="small" icon={isPlaying ? <PauseOutlined /> : <PlaySquareOutlined />} onClick={() => setIsPlaying(value => !value)} /></Tooltip>
            <Tooltip title="Next frame"><Button size="small" icon={<StepForwardOutlined />} onClick={() => stepFrame(1)} /></Tooltip>
            <Typography.Text style={{ color: '#fff', whiteSpace: 'nowrap' }}>Speed</Typography.Text>
            <Tooltip title="Preview speed uses the same animation speed levels as actors and settings.">
              <Slider
                min={0}
                max={ANIMATION_SPEED_OPTIONS.length - 1}
                step={1}
                value={previewAnimationSpeed}
                onChange={setPreviewAnimationSpeed}
                style={{ flex: 1, minWidth: 160, maxWidth: 260, margin: '0 8px' }}
              />
            </Tooltip>
            <Typography.Text style={{ color: '#fff', width: 108, whiteSpace: 'nowrap' }}>
              {ANIMATION_SPEED_OPTIONS[previewAnimationSpeed]?.label} · {ANIMATION_SPEED_OPTIONS[previewAnimationSpeed]?.fps || 0} FPS
            </Typography.Text>
          </Flex>
          <Flex gap={6} align="center">
            <Typography.Text style={{ color: '#fff' }}>Tiles {tilePreviews.length} · Unique {new Set(tilePreviews).size}</Typography.Text>
            <Tooltip title="Toggle grid"><Button size="small" type={showGrid ? 'primary' : 'default'} icon={<TableOutlined />} onClick={() => setShowGrid(value => !value)} /></Tooltip>
          </Flex>
        </Flex>

        <Splitter layout="vertical" style={{ flex: 1, minHeight: 0 }}>
        <Splitter.Panel defaultSize="55%" min={180} collapsible>
        <Flex
          align="center"
          justify="center"
          onWheel={event => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            changePreviewZoom(event.deltaY < 0 ? 1 : -1);
          }}
          style={{ width: '100%', height: '100%', minHeight: 180, overflow: 'auto' }}
        >
          {displayedPreview ? (
            <Flex vertical align="center" gap={12}>
              <div style={{ display: 'inline-block', lineHeight: 0, background: 'repeating-conic-gradient(#d9d9d9 0% 25%, #fff 0% 50%) 50% / 16px 16px' }}>
                <div
                  onClick={placeSelectionAtCanvasPosition}
                  onMouseEnter={updateCanvasHoverPosition}
                  onMouseMove={updateCanvasHoverPosition}
                  onMouseLeave={() => setCanvasHoverPosition(null)}
                  title={selectedCanvasFrame && sourceSelection ? 'Click to place the selected source region' : undefined}
                  style={{
                    position: 'relative',
                    width: displayedFrameWidth * previewZoom / 100,
                    height: displayedFrameHeight * previewZoom / 100,
                    cursor: selectedCanvasFrame && sourceSelection ? 'crosshair' : 'default',
                    overflow: 'hidden',
                  }}
                >
                  <img src={displayedPreview} alt="Selected sprite frame" width={displayedFrameWidth * previewZoom / 100} height={displayedFrameHeight * previewZoom / 100} style={{ imageRendering: 'pixelated', display: 'block' }} />
                  {selectedCanvasFrame && sourceSelection && sourceSelectionPreview && canvasHoverPosition && (
                    <img
                      src={sourceSelectionPreview}
                      alt="Selected region placement preview"
                      width={sourceSelection.width * previewZoom / 100}
                      height={sourceSelection.height * previewZoom / 100}
                      style={{
                        position: 'absolute',
                        left: canvasHoverPosition.x * previewZoom / 100,
                        top: canvasHoverPosition.y * previewZoom / 100,
                        imageRendering: 'pixelated',
                        opacity: 0.58,
                        pointerEvents: 'none',
                        zIndex: 2,
                      }}
                    />
                  )}
                  {showGrid && (
                    <span style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      zIndex: 3,
                      backgroundImage: 'linear-gradient(to right, rgba(0,0,0,.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,.4) 1px, transparent 1px)',
                      backgroundSize: `${8 * previewZoom / 100}px ${8 * previewZoom / 100}px`,
                    }} />
                  )}
                  {isCollisionSettingsHovered && (
                    <span style={{ position: 'absolute', pointerEvents: 'none', zIndex: 4, left: (canvasOriginX + collisionX) * previewZoom / 100, top: (canvasOriginY + collisionY) * previewZoom / 100, width: collisionWidth * previewZoom / 100, height: collisionHeight * previewZoom / 100, border: `1px solid ${token.colorInfo}`, background: token.colorInfoBg, opacity: 0.55 }} />
                  )}
                  <span
                    aria-label="Canvas origin 16x8 preview"
                    style={{
                      position: 'absolute',
                      pointerEvents: 'none',
                      zIndex: 4,
                      left: (canvasOriginX - 8) * previewZoom / 100,
                      top: (canvasOriginY - 4) * previewZoom / 100,
                      width: 16 * previewZoom / 100,
                      height: 8 * previewZoom / 100,
                      border: `1px dashed ${token.colorWarning}`,
                      background: token.colorWarningBg,
                      opacity: 0.45,
                      boxSizing: 'border-box',
                    }}
                  />
                  <span style={{ position: 'absolute', pointerEvents: 'none', zIndex: 4, left: canvasOriginX * previewZoom / 100 - 5, top: canvasOriginY * previewZoom / 100 - 1, width: 10, height: 2, background: token.colorError }} />
                  <span style={{ position: 'absolute', pointerEvents: 'none', zIndex: 4, left: canvasOriginX * previewZoom / 100 - 1, top: canvasOriginY * previewZoom / 100 - 5, width: 2, height: 10, background: token.colorError }} />
                </div>
              </div>
              <Typography.Text type="secondary">
                {selectedCanvasFrame
                  ? `Editable frame · ${selectedCanvasFrame.width}×${selectedCanvasFrame.height} · ${selectedCanvasFrame.pieces.length} placed region(s)`
                  : `Tile ${selectedFrame + 1} of ${tilePreviews.length}, row ${Math.floor(selectedFrame / Math.max(1, Math.floor(imageSize.width / frameWidth))) + 1}`}
              </Typography.Text>
              {animationCanvasPreview && (
                <Flex vertical align="center" gap={4}>
                  <Typography.Text type="secondary">Animation canvas</Typography.Text>
                  <img src={animationCanvasPreview} alt="Temporary animation canvas" style={{ imageRendering: 'pixelated', width: frameWidth * Math.max(1, selectedAnimation?.frames.length ?? 1) * 2, height: frameHeight * 2 }} />
                </Flex>
              )}
            </Flex>
          ) : (
            <Empty description={selectedSprite ? 'Unable to read sprite frame' : 'Select a sprite sheet'} />
          )}
        </Flex>
        </Splitter.Panel>

        <Splitter.Panel defaultSize={190} min={90} collapsible>
        <Flex vertical style={{ height: '100%', background: token.colorBgBase, overflow: 'hidden' }}>
          <Flex align="center" justify="space-between" style={{ height: 40, padding: '0 12px', background: token.colorBorder, color: '#fff' }}>
            <Space size={8}>
              <Typography.Text strong style={{ color: '#fff' }}>TILES</Typography.Text>
            </Space>
            <Space size={4}>
              <Tooltip title="Zoom out tiles">
                <Button size="small" icon={<ZoomOutOutlined />} onClick={decreaseTilesZoom} />
              </Tooltip>
              <Typography.Text onClick={() => setSourceZoom(100)} style={{ width: 44, textAlign: 'center', cursor: 'pointer' }} title="Reset tiles zoom to 100%">{sourceZoom}%</Typography.Text>
              <Tooltip title="Zoom in tiles">
                <Button size="small" icon={<ZoomInOutlined />} onClick={increaseTilesZoom} />
              </Tooltip>
              <Button size="small" onClick={() => placeSelection()} disabled={!selectedCanvasFrame || !sourceSelection}>Place at 0,0</Button>
            </Space>
          </Flex>
          <Typography.Text type="secondary" style={{ padding: '0 12px 8px' }}>
            Drag a box over the original image, then click the editable canvas to place that referenced region.
          </Typography.Text>
          <div
            onWheel={event => {
              if (!event.ctrlKey) return;
              event.preventDefault();
              setSourceZoom(value => getNextZoomStep(value, event.deltaY < 0 ? 1 : -1));
            }}
            style={{ flex: 1, minHeight: 0, padding: '0 12px 12px', overflow: 'auto' }}
          >
            <Flex vertical align="center" style={{ minWidth: '100%', width: 'max-content' }}>
            {selectedSprite && imageSize.width > 0 ? (
              <div
                role="application"
                aria-label="Sprite source selection"
                onPointerDown={beginSourceSelection}
                onPointerMove={resizeSourceSelection}
                onPointerUp={() => setSelectionStart(null)}
                onPointerCancel={() => setSelectionStart(null)}
                style={{
                  position: 'relative',
                  width: imageSize.width * sourceZoom / 100,
                  height: imageSize.height * sourceZoom / 100,
                  cursor: 'crosshair',
                  touchAction: 'none',
                  userSelect: 'none',
                }}
              >
                <img
                  src={selectedSprite.path}
                  alt="Original sprite sheet"
                  draggable={false}
                  width={imageSize.width * sourceZoom / 100}
                  height={imageSize.height * sourceZoom / 100}
                  style={{ imageRendering: 'pixelated', display: 'block', pointerEvents: 'none' }}
                />
                {showGrid && (
                  <span style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    backgroundImage: 'linear-gradient(to right, rgba(255,255,255,.24) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.24) 1px, transparent 1px)',
                    backgroundSize: `${8 * sourceZoom / 100}px ${8 * sourceZoom / 100}px`,
                  }} />
                )}
                {sourceSelection && (
                  <span style={{
                    position: 'absolute',
                    left: sourceSelection.x * sourceZoom / 100,
                    top: sourceSelection.y * sourceZoom / 100,
                    width: sourceSelection.width * sourceZoom / 100,
                    height: sourceSelection.height * sourceZoom / 100,
                    border: `2px solid ${token.colorPrimary}`,
                    background: token.colorPrimaryBg,
                    opacity: 0.55,
                    pointerEvents: 'none',
                    boxSizing: 'border-box',
                  }} />
                )}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Select a sprite sheet" />
            )}
            </Flex>
          </div>
          <Flex align="center" justify="space-between" gap={8} style={{ flex: 'none', padding: '6px 12px', borderTop: `1px solid ${token.colorBorderSecondary}` }}>
            <Typography.Text type="secondary" ellipsis>
              {sourceSelection ? `Source X ${sourceSelection.x}, Y ${sourceSelection.y}, W ${sourceSelection.width}, H ${sourceSelection.height}` : 'Source: none'}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
              Sheet: {imageSize.width} × {imageSize.height}
            </Typography.Text>
          </Flex>
        </Flex>
        </Splitter.Panel>

        <Splitter.Panel defaultSize={170} min={90} collapsible>
        <Flex vertical style={{ height: '100%', background: token.colorBgBase, overflow: 'auto' }}>
          <Flex align="center" justify="space-between" style={{ height: 40, padding: '0 12px', background: token.colorBorder, color: '#fff' }}>
            <Typography.Text strong style={{ color: '#fff' }}>FRAMES: {selectedAnimation?.name ?? direction.toUpperCase()}</Typography.Text>
          </Flex>
          <Flex gap={8} wrap="wrap" style={{ padding: '12px 12px 12px' }}>
            {(selectedAnimation?.frames ?? []).map((frameIndex, index) => {
              const frame = tilePreviews[frameIndex];
              if (!frame) return null;
              return (
              <div
                key={`${frameIndex}-${index}`}
                draggable
                onMouseEnter={() => setHoveredFrameKey(`indexed-${index}`)}
                onMouseLeave={() => setHoveredFrameKey(null)}
                onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-gba-studio-frame', 'indexed'); setFrameDragImage(event); setDraggedIndexedFramePosition(index); }}
                onDragEnd={() => setDraggedIndexedFramePosition(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); event.stopPropagation(); if (draggedIndexedFramePosition !== null) reorderIndexedFrames(draggedIndexedFramePosition, index); setDraggedIndexedFramePosition(null); }}
                style={{ position: 'relative', cursor: 'grab', opacity: draggedIndexedFramePosition === index ? 0.55 : 1 }}
              >
                <Button type={frameIndex === selectedFrame ? 'primary' : 'default'} onClick={() => chooseFrame(frameIndex)} style={{ width: 72, height: 72, boxSizing: 'border-box', padding: 4, background: '#fff', borderWidth: 3, borderColor: frameIndex === selectedFrame ? token.colorPrimary : 'transparent' }}>
                  <img
                    src={frame}
                    alt={`Frame ${frameIndex + 1}`}
                    style={{ display: 'block', width: 64, height: 64, objectFit: 'contain', imageRendering: 'pixelated' }}
                  />
                </Button>
                <Button aria-label={`Clone frame ${index + 1}`} shape="circle" size="small" icon={<CopyOutlined />} onClick={() => cloneIndexedFrame(index)} style={{ position: 'absolute', left: -6, top: -6, opacity: hoveredFrameKey === `indexed-${index}` ? 1 : 0, pointerEvents: hoveredFrameKey === `indexed-${index}` ? 'auto' : 'none', transition: 'opacity 120ms' }} />
                <Button aria-label={`Remove frame ${index + 1}`} danger disabled={frameCount <= 1} shape="circle" size="small" icon={<DeleteOutlined />} onClick={() => removeFrame(index)} style={{ position: 'absolute', right: -6, top: -6, opacity: hoveredFrameKey === `indexed-${index}` ? 1 : 0, pointerEvents: hoveredFrameKey === `indexed-${index}` ? 'auto' : 'none', transition: 'opacity 120ms' }} />
                <Typography.Text aria-label={`Frame ${index}`} style={{ position: 'absolute', right: -6, bottom: -6, minWidth: 20, height: 20, padding: '0 4px', borderRadius: 10, background: token.colorBgElevated, border: `1px solid ${token.colorBorder}`, color: token.colorText, fontSize: 11, lineHeight: '18px', textAlign: 'center', pointerEvents: 'none' }}>
                  {index}
                </Typography.Text>
              </div>
              );
            })}
            {(canvasDragOrder
              ? canvasDragOrder.map(id => canvasFrames.find(frame => frame.id === id)).filter((frame): frame is ISpriteCanvasFrame => Boolean(frame))
              : canvasFrames
            ).map((frame, index) => (
              <div
                key={frame.id}
                draggable
                onMouseEnter={() => setHoveredFrameKey(`canvas-${frame.id}`)}
                onMouseLeave={() => setHoveredFrameKey(null)}
                onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-gba-studio-frame', 'canvas'); setFrameDragImage(event); setDraggedCanvasFrameId(frame.id); setCanvasDragOrder(canvasFrames.map(item => item.id)); }}
                onDragEnd={() => { setDraggedCanvasFrameId(null); setCanvasDragOrder(null); }}
                onDragOver={(event) => { event.preventDefault(); previewCanvasFrameOrder(frame.id); }}
                onDrop={(event) => { event.preventDefault(); event.stopPropagation(); commitCanvasFrameOrder(); setDraggedCanvasFrameId(null); setCanvasDragOrder(null); }}
                style={{ position: 'relative', cursor: 'grab', opacity: draggedCanvasFrameId === frame.id ? 0 : 1 }}
              >
                <Button
                  type={frame.id === selectedCanvasFrameId ? 'primary' : 'default'}
                  onClick={() => { setSelectedCanvasFrameId(frame.id); setIsPlaying(false); }}
                  style={{ width: 72, height: 72, minWidth: 72, maxWidth: 72, boxSizing: 'border-box', padding: 4, background: '#fff', borderWidth: 3, borderColor: frame.id === selectedCanvasFrameId ? token.colorPrimary : 'transparent' }}
                >
                  {canvasFramePreviews[frame.id] && (
                    <img
                      src={canvasFramePreviews[frame.id]}
                      alt={`Editable frame ${index + 1}`}
                      style={{ display: 'block', width: 64, height: 64, objectFit: 'contain', imageRendering: 'pixelated' }}
                    />
                  )}
                </Button>
                <Button aria-label={`Clone editable frame ${index + 1}`} shape="circle" size="small" icon={<CopyOutlined />} onClick={() => cloneCanvasFrame(frame)} style={{ position: 'absolute', left: -6, top: -6, opacity: hoveredFrameKey === `canvas-${frame.id}` ? 1 : 0, pointerEvents: hoveredFrameKey === `canvas-${frame.id}` ? 'auto' : 'none', transition: 'opacity 120ms' }} />
                <Button aria-label={`Remove editable frame ${index + 1}`} danger disabled={frameCount <= 1} shape="circle" size="small" icon={<DeleteOutlined />} onClick={() => removeCanvasFrame(frame.id)} style={{ position: 'absolute', right: -6, top: -6, opacity: hoveredFrameKey === `canvas-${frame.id}` ? 1 : 0, pointerEvents: hoveredFrameKey === `canvas-${frame.id}` ? 'auto' : 'none', transition: 'opacity 120ms' }} />
                <Typography.Text aria-label={`Frame ${(selectedAnimation?.frames.length ?? 0) + index}`} style={{ position: 'absolute', right: -6, bottom: -6, minWidth: 20, height: 20, padding: '0 4px', borderRadius: 10, background: token.colorBgElevated, border: `1px solid ${token.colorBorder}`, color: token.colorText, fontSize: 11, lineHeight: '18px', textAlign: 'center', pointerEvents: 'none' }}>
                  {(selectedAnimation?.frames.length ?? 0) + index}
                </Typography.Text>
              </div>
            ))}
            <Tooltip title="Create an empty editable frame">
              <Button
                aria-label="Create an empty editable frame"
                type="text"
                icon={<PlusOutlined />}
                onClick={addBlankFrame}
                style={{ width: 72, height: 72, border: 'none', fontSize: 24, fontWeight: 700 }}
              />
            </Tooltip>
          </Flex>
        </Flex>
        </Splitter.Panel>
        </Splitter>
      </Flex>
      </ResourceDropSurface>
      </Splitter.Panel>
      )}
      {!selectedSprite && (
        <Splitter.Panel min={360}>
          <Flex align="center" justify="center" style={{ width: '100%', height: '100%', background: token.colorBgContainer }}>
            <Empty description="Select a sprite sheet to preview its tiles and frames" />
          </Flex>
        </Splitter.Panel>
      )}

      {selectedSprite && (
      <Splitter.Panel defaultSize={330} min={260} collapsible={false}>
      <Flex vertical gap={12} style={{ width: '100%', height: '100%', padding: 12, background: token.colorBgBase, overflow: 'auto' }}>
        <Flex vertical gap={4}>
          <Typography.Text type="secondary">Tile Name</Typography.Text>
          <Input
            variant={isSpriteNameEditing ? 'outlined' : 'borderless'}
            value={spriteNameInput}
            onFocus={() => setIsSpriteNameEditing(true)}
            onChange={event => setSpriteNameInput(event.target.value)}
            onBlur={() => {
              setIsSpriteNameEditing(false);
              renameSelectedSprite();
            }}
            onPressEnter={event => event.currentTarget.blur()}
            style={{ paddingInline: isSpriteNameEditing ? 11 : 0 }}
          />
          <Typography.Text type="secondary" style={{ marginTop: 4 }}>State Name</Typography.Text>
          <Input
            variant={isStateNameEditing ? 'outlined' : 'borderless'}
            value={selectedState?.name ?? ''}
            onFocus={() => setIsStateNameEditing(true)}
            onBlur={() => setIsStateNameEditing(false)}
            onChange={event => updateSettings({
              playerAnimationStates: animationStates.map(state => state.id === selectedState?.id ? { ...state, name: event.target.value } : state),
            })}
            style={{ paddingInline: isStateNameEditing ? 11 : 0 }}
          />
        </Flex>
        <Divider style={{ margin: '0' }} />
        <Typography.Text strong>SPRITE SETTINGS</Typography.Text>
        <Typography.Text type="secondary">Canvas / Frame Size</Typography.Text>
        <Flex gap={8}>
          <InputNumber addonBefore="W" min={8} step={8} value={displayedFrameWidth} onChange={value => value && updateCanvasDimension('width', value)} style={{ width: '50%' }} />
          <InputNumber addonBefore="H" min={16} step={8} value={displayedFrameHeight} onChange={value => value && updateCanvasDimension('height', value)} style={{ width: '50%' }} />
        </Flex>
        <Typography.Text type="secondary">Canvas Origin</Typography.Text>
        <Flex gap={8}>
          <InputNumber addonBefore="X" value={canvasOriginX} onChange={value => updateSettings({ playerCanvasOriginX: value ?? 0 })} style={{ width: '50%' }} />
          <InputNumber addonBefore="Y" value={canvasOriginY} onChange={value => updateSettings({ playerCanvasOriginY: value ?? 0 })} style={{ width: '50%' }} />
        </Flex>
        <Divider style={{ margin: '2px 0' }} />
        <Flex
          vertical
          gap={8}
          onMouseEnter={() => setIsCollisionSettingsHovered(true)}
          onMouseLeave={() => setIsCollisionSettingsHovered(false)}
        >
          <Typography.Text type="secondary">Collision Bounding Box</Typography.Text>
          <Flex gap={8}>
            <InputNumber addonBefore="X" value={collisionX} onChange={value => updateSettings({ playerCollisionX: value ?? 0 })} style={{ width: '50%' }} />
            <InputNumber addonBefore="Y" value={collisionY} onChange={value => updateSettings({ playerCollisionY: value ?? 0 })} style={{ width: '50%' }} />
          </Flex>
          <Flex gap={8}>
            <InputNumber addonBefore="W" min={1} value={collisionWidth} onChange={value => updateSettings({ playerCollisionWidth: value ?? 1 })} style={{ width: '50%' }} />
            <InputNumber addonBefore="H" min={1} value={collisionHeight} onChange={value => updateSettings({ playerCollisionHeight: value ?? 1 })} style={{ width: '50%' }} />
          </Flex>
        </Flex>
        <Divider style={{ margin: '2px 0' }} />
        <Typography.Text strong>ANIMATION SETTINGS</Typography.Text>
        <Checkbox
          checked={flipRightToCreateLeftFacingFrames}
          onChange={event => changeFlipRightToCreateLeftFacingFrames(event.target.checked)}
        >
          Flip 'Right' To Create 'Left' Facing Frames
        </Checkbox>
        <Typography.Text type="secondary">Animation Type</Typography.Text>
        <Select
          value={selectedState?.type ?? animationPreset}
          options={[
            { value: 'fixed-direction', label: 'Fixed Direction' },
            { value: 'fixed-direction-movement', label: 'Fixed Direction + Movement' },
            { value: 'horizontal-directions', label: 'Horizontal Directions' },
            { value: 'horizontal-directions-movement', label: 'Horizontal Directions + Movement' },
            { value: 'four-directions', label: 'Four Directions' },
            { value: 'four-directions-movement', label: 'Four Directions + Movement' },
            { value: 'platformer-player', label: 'Platformer Player' },
            { value: 'cursor', label: 'Cursor' },
          ]}
          onChange={changeAnimationType}
        />
        {imageSize.width > 0 && (imageSize.width % frameWidth !== 0 || imageSize.height < frameHeight * 4) && (
          <Typography.Text type="danger">The sheet dimensions do not match the configured frame grid.</Typography.Text>
        )}
      </Flex>
      </Splitter.Panel>
      )}
    </ResourceEditorShell>
  );
};

export default SpriteEditor;
