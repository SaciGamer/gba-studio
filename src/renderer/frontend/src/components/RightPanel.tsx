import NameInput, { useNameHoverStyle } from './NameHover';
import useSceneObjectSnapSize from '@/utils/useSceneObjectSnapSize';
import { sceneObjectAxisBounds, sceneObjectAxisPosition } from '@/utils/sceneObjectPosition';
import ActorOffscreenControl from './ActorOffscreenControl';
import { AttentionLabel, WarningField } from './WarningIndicator';
import AdditionalEventWarnings from './events/AdditionalEventWarnings';
import { hasAssetReferenceWarning } from '../../../../shared/events/sceneReferenceCleanup';
import { trackerInstrumentOptions, trackerInstrumentHierarchyColor, trackerInstrumentHierarchyNumber } from '@/utils/trackerInstrumentOptions';
import DirectionRadioGroup from './DirectionRadioGroup';
import ResourceNameInput from './ResourceNameInput';
import useAppContexts from '@/providers/contexts/AppContexts';
import { sceneSearchAfterSelection } from '@/utils/sceneSearch';
import { EImageType, ETypeScene, IBackgroundElement, ISceneActor, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { EVariableType, IVariableDefinition, VariableValue } from '@/providers/contexts/interfaces/IVariablesElement';
import { IScriptDefinition } from '@/providers/contexts/interfaces/IScriptElement';
import { exposeScriptInputs, scriptUsesParameter } from '../../../../shared/scriptParameters';
import { ScriptParameterContext } from './events/ScriptParameterContext';
import ScriptInputs from './events/ScriptInputs';
import { AudioMutedOutlined, SoundOutlined, ArrowRightOutlined, AudioOutlined, BgColorsOutlined, CaretDownFilled, CaretLeftFilled, CaretRightFilled, CaretUpFilled, CopyOutlined, DeleteOutlined, PictureOutlined, SettingOutlined } from '@ant-design/icons';
import { Alert, App, Button, Checkbox, ColorPicker, Descriptions, Divider, Dropdown, Flex, Form, Input, Layout, Modal, Radio, Segmented, Select, Slider, Space, Tabs, Tag, theme, Tooltip, Typography } from 'antd';
import { countEventAttention, countObjectAttention } from '../../../../shared/events/eventAttention';
import StepInputNumber, { InputNumber } from './StepInputNumber';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BackgroundSelector } from './BackgroundSelector';
import CollapseEventManager from './events/CollapseEventManager';
import SelectNewEvent from './events/SelectNewEvent';
import FlowEditorManager from './events/FlowEditorManager';
import RightPanelGWSettings from './RightPanelGWSettings';
// TODO(restore-shooter-game): re-import CombatConfigEditor and ShooterConfigEditor when restoring Shooter scene configuration.
import { EEvents } from './events/interfaces/IEvents';
import { getPaletteSlotOptions, getPreviewPalettes, loadPaletteLibrary } from './resourceEditors/paletteLibrary';
import imgPlaceholder from '@/img/placeholder.png';
import { joinLocalAssetPath } from '@/utils/localAssetUrl';
import { loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import { collectReferenceLocations, ReferenceLocation } from '@/utils/referenceLocations';
import TileAnimationEditor from './TileAnimationEditor';
import { useI18n } from '@/i18n/I18n';
import TilesetAutoTileView, { AutoTileSlot, AutoTileTilesetImage } from './TilesetAutoTileView';
import { loadTilesetAssets } from '@/utils/tilesetAssets';
import { AUTO_TILE_VIEW_KEY, loadAutoTileAssets, toAutoTileSourceKey } from '@/utils/autoTileAssets';
import { BLOB47_MASK_INDEX, BLOB47_MASKS, getBlob47Mask } from '@/utils/blobAutoTile';
import { getEventDepthColor } from './events/EventColors';
import { ISpriteSettings } from '@/providers/contexts/interfaces/ISpriteElement';
import { useMusicEditorWorkspace } from './resourceEditors/MusicEditorWorkspace';
import MusicDial from './resourceEditors/MusicDial';
import MusicInstrumentEnvelopeEditor from './resourceEditors/MusicInstrumentEnvelopeEditor';
import MusicInstrumentZoneEditor from './resourceEditors/MusicInstrumentZoneEditor';
import { quantizeTrackerNotePan } from '@/utils/trackerNotePan';
import { sanitizeMusicAssetName } from '@/utils/musicAssetName';
import type { IPrefabDefinition } from '@/providers/contexts/interfaces/IPrefabElement';

const { useToken } = theme;
const { Content } = Layout;

const actorMoveSpeedOptions = [
  { value: 0.25, label: 'Speed ¼ (Slower)', ppf: '0.25 PPF' },
  { value: 0.5, label: 'Speed ½', ppf: '0.5 PPF' },
  { value: 1, label: 'Speed 1', ppf: '1 PPF' },
  { value: 2, label: 'Speed 2', ppf: '2 PPF' },
  { value: 3, label: 'Speed 3', ppf: '3 PPF' },
  { value: 4, label: 'Speed 4 (Faster)', ppf: '4 PPF' },
];
const actorAnimationSpeedOptions = [
  { value: 0, label: 'None', fps: '0' },
  { value: 1, label: 'Speed 1 (Slower)', fps: '0.47 FPS' },
  { value: 2, label: 'Speed 2', fps: '0.94 FPS' },
  { value: 3, label: 'Speed 3', fps: '1.88 FPS' },
  { value: 4, label: 'Speed 4', fps: '3.75 FPS' },
  { value: 5, label: 'Speed 5', fps: '7.5 FPS' },
  { value: 6, label: 'Speed 6', fps: '15 FPS' },
  { value: 7, label: 'Speed 7', fps: '30 FPS' },
];

const PlayerSpriteOption: React.FC<{ name: string; path: string }> = ({ name, path }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
    <span
      aria-hidden="true"
      style={{
        width: 16,
        height: 16,
        overflow: 'hidden',
        flex: '0 0 16px',
        lineHeight: 0,
      }}
    >
      <img
        src={path}
        alt=""
        style={{ display: 'block', imageRendering: 'pixelated' }}
      />
    </span>
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
  </span>
);

const getVariableDefaultName = (symbol: string): string => {
  const readableName = symbol.replace(/^variable_?/i, '').replace(/_/g, ' ').trim();
  if (!readableName) return symbol;

  return `Variable ${readableName}`;
};

const ReferenceList: React.FC<{ locations: ReferenceLocation[]; onSelect: (location: ReferenceLocation) => void; sceneNameOnly?: boolean }> = ({ locations, onSelect, sceneNameOnly }) => (
  <div style={{ width: '100%', padding: sceneNameOnly ? '2px 10px' : '8px 10px', boxSizing: 'border-box', lineHeight: '22px' }}>
    <Typography.Text type="secondary" style={{ display: 'block' }}>Usado em:</Typography.Text>
    {locations.length === 0 ? <Typography.Text type="secondary">Nenhuma referência encontrada.</Typography.Text> : locations.map((location, index) => (
      <span key={`${location.scene ?? ''}-${location.script ?? ''}-${location.event ?? ''}-${index}`} style={{ display: sceneNameOnly ? 'inline' : 'block' }}><Typography.Link onClick={() => onSelect(location)}>
        {sceneNameOnly ? location.scene || location.script : [location.scene && `cena: ${location.scene}`, location.script && `script: ${location.script}`, location.event && `evento: ${location.event}`].filter(Boolean).join(', ')}
        {sceneNameOnly && index < locations.length - 1 ? ';' : ''}
      </Typography.Link>{sceneNameOnly && index < locations.length - 1 ? ' ' : ''}</span>
    ))}
  </div>
);

const useReferenceNavigation = () => {
  const { scenes, scripts, setSettingUtils, setElementSelected } = useAppContexts();
  return (location: ReferenceLocation) => {
    const scene = scenes.find(item => !item._deleted && (location.sceneId
      ? item.id === location.sceneId : (item.name || item.id) === location.scene));
    const referencedScript = !scene && scripts.scripts.find(item => location.scriptId
      ? item.id === location.scriptId : (item.name || item.id) === location.script);
    const object = scene && location.sceneObject ? { sceneId: scene.id, ...location.sceneObject } : null;
    setSettingUtils(previous => ({
      ...previous,
      selectedSceneIds: scene ? [scene.id] : [],
      worldSceneSearch: sceneSearchAfterSelection(previous.worldSceneSearch, scene),
      tileEditSceneId: object?.sceneId ?? null,
      tileEditLayerId: object ? 4 : null,
      activeSceneObject: object,
      activeTriggerId: object?.type === 'trigger' ? object.id : null,
      activeButton: 'select',
      activeSubButton: '',
      referenceTarget: { eventId: location.eventId, tab: location.tab, requestId: Date.now() },
    }));
    setElementSelected(scene ? { ...scene, _recenter: true, _recenterTarget: object ? { type: object.type, id: object.id } : undefined }
      : referencedScript ? { ...referencedScript, script: referencedScript.events, _resourceType: 'script' } : null);
  };
};

const VariableSettingsForm: React.FC<{ variable: IVariableDefinition }> = ({ variable }) => {
  const { variables, scripts, scenes, setVariables, setElementSelected, setSettingUtils } = useAppContexts();
  const defaultName = getVariableDefaultName(variable.symbol);

  const updateVariable = (patch: Partial<IVariableDefinition>) => {
    const updatedVariable = { ...variable, ...patch };
    setVariables(prev => ({
      ...prev,
      variables: prev.variables.map(item => item.id === variable.id ? updatedVariable : item),
      _saved: false,
    }));
    setElementSelected({ ...updatedVariable, _resourceType: 'variables' });
  };

  const changeType = (type: EVariableType) => {
    const initialValue: VariableValue = type === 'number' ? 0 : type === 'boolean' ? false : '';
    updateVariable({ type, initialValue });
  };

  const locations = collectReferenceLocations(scenes, scripts.scripts, variable.id, 'variable');
  const selectReference = useReferenceNavigation();

  return (
    <Space direction="vertical" style={{ width: '100%', minWidth: 0, alignItems: 'stretch' }}>
      <ResourceNameInput name={variable.name || ''} defaultName={defaultName} label="Variable name" onChange={name => updateVariable({ name })} />
      <Divider style={{ margin: 0 }} />
      <ReferenceList locations={locations} onSelect={selectReference} />
      <Space direction="vertical" style={{ width: '100%', padding: 10 }}>
        <Typography.Text strong>Variable settings</Typography.Text>
      <Select<EVariableType>
        aria-label="Variable type"
        style={{ width: '100%' }}
        value={variable.type}
        options={[
          { value: 'number', label: 'Number' },
          { value: 'boolean', label: 'Boolean' },
          { value: 'string', label: 'String' },
        ]}
        onChange={changeType}
      />
      {variable.type === 'number' && (
        <StepInputNumber
          aria-label="Variable initial value"
          addonBefore="Initial value"
          style={{ width: '100%' }}
          value={variable.initialValue as number}
          onChange={(value) => updateVariable({ initialValue: value ?? 0 })}
        />
      )}
      {variable.type === 'boolean' && (
        <Select<string>
          aria-label="Variable initial value"
          style={{ width: '100%' }}
          value={String(variable.initialValue as boolean)}
          options={[{ value: 'true', label: 'True' }, { value: 'false', label: 'False' }]}
          onChange={(value) => updateVariable({ initialValue: value === 'true' })}
        />
      )}
      {variable.type === 'string' && (
        <Input
          aria-label="Variable initial value"
          addonBefore="Initial value"
          value={variable.initialValue as string}
          onChange={(event) => updateVariable({ initialValue: event.target.value })}
        />
      )}
      </Space>
    </Space>
  );
};

const ScriptSettingsForm: React.FC<{ script: IScriptDefinition }> = ({ script }) => {
  const { t } = useI18n();
  const { scripts, scenes, setScripts, setElementSelected, setSettingUtils } = useAppContexts();
  const scriptIndex = scripts.scripts.findIndex(item => item.id === script.id);
  const defaultName = `Script ${Math.max(0, scriptIndex)}`;
  const updateScript = (patch: Partial<IScriptDefinition>) => {
    if (patch.events || patch.parameters) patch = { ...patch, ...exposeScriptInputs(patch.events ?? script.events, patch.parameters ?? script.parameters) };
    const updated = { ...script, ...patch, ...(patch.events ? { script: patch.events } : {}), _saved: false };
    setScripts(previous => ({ ...previous, scripts: previous.scripts.map(item => item.id === script.id ? updated : item), _saved: false }));
    setElementSelected({ ...updated, script: updated.events, _resourceType: 'script' });
  };
  const locations = collectReferenceLocations(scenes, scripts.scripts, script.id, 'script');
  const selectReference = useReferenceNavigation();
  return <Content><ScriptParameterContext.Provider value={script.parameters ?? []}><Space direction="vertical" size={0} style={{ width: '100%', minWidth: 0, alignItems: 'stretch' }}><ResourceNameInput name={script.name || ''} defaultName={defaultName} label={defaultName} onChange={name => updateScript({ name })} /><Divider style={{ margin: 0 }} /><Space direction="vertical" size={4} style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box' }}>
    <Typography.Text type="secondary">{t('scripts.description')}</Typography.Text>
    <Input.TextArea aria-label={t('scripts.description')} placeholder={t('scripts.descriptionPlaceholder')} value={script.description ?? ''} autoSize={{ minRows: 2, maxRows: 6 }} onChange={event => updateScript({ description: event.target.value })} />
    <ScriptInputs parameters={script.parameters ?? []} onChange={parameters => updateScript({ parameters })} canRemove={id => !scriptUsesParameter([script.events, ...Object.values(script.eventGraphs ?? {}).map(graph => graph.nodes)], id)} />
  </Space><AdditionalEventWarnings visibleFields={['events']} value={script} onChange={updateScript} /><ReferenceList sceneNameOnly locations={locations} onSelect={selectReference} /><Tabs style={{ padding: '0 10px 10px' }} items={[{ key: 'script', label: 'Script', children: <Space direction="vertical" style={{ width: '100%' }}><CollapseEventManager scripts={script.events} onScriptsChange={events => updateScript({ events })} /><SelectNewEvent tabIndex="1" onEventCreated={event => updateScript({ events: [...script.events, event] })} /></Space> }]} /></Space></ScriptParameterContext.Provider></Content>;
};

const ActorSpriteSheetPicker: React.FC<{ tilesets: any[]; spriteFiles: any[]; spriteId?: string; warning?: boolean; onSpriteSelected: (spriteId?: string) => void }> = ({ tilesets, spriteFiles, spriteId, warning, onSpriteSelected }) => {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { spriteResources, setSpriteResources } = useAppContexts();
  const [tilesetId, setTilesetId] = useState<string>();
  const [open, setOpen] = useState(false);
  const [tileSize, setTileSize] = useState<8 | 16 | 32>(16);
  const [zoom, setZoom] = useState(100);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pickerViewportRef = useRef<HTMLDivElement | null>(null);
  const pickerPanStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const cropDragRef = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [isPanningPicker, setIsPanningPicker] = useState(false);
  const tileset = tilesets.find(item => item.id === tilesetId);
  const displayScale = zoom / 100;
  const selectedCompositeParts = crop ? (() => {
    const shapes = [[8, 8], [16, 8], [8, 16], [16, 16], [32, 8], [8, 32], [32, 16], [16, 32], [32, 32], [64, 32], [32, 64], [64, 64]];
    const shape = shapes.slice().sort((a, b) => {
      const ac = Math.ceil(crop.width / a[0]) * Math.ceil(crop.height / a[1]);
      const bc = Math.ceil(crop.width / b[0]) * Math.ceil(crop.height / b[1]);
      return ac * a[0] * a[1] - bc * b[0] * b[1] || ac - bc || b[0] * b[1] - a[0] * a[1];
    })[0];
    return Math.ceil(crop.width / shape[0]) * Math.ceil(crop.height / shape[1]);
  })() : 0;
  const selectedCompositePixels = crop ? (() => {
    const shapes = [[8, 8], [16, 8], [8, 16], [16, 16], [32, 8], [8, 32], [32, 16], [16, 32], [32, 32], [64, 32], [32, 64], [64, 64]];
    const shape = shapes.slice().sort((a, b) => {
      const ac = Math.ceil(crop.width / a[0]) * Math.ceil(crop.height / a[1]);
      const bc = Math.ceil(crop.width / b[0]) * Math.ceil(crop.height / b[1]);
      return ac * a[0] * a[1] - bc * b[0] * b[1] || ac - bc || b[0] * b[1] - a[0] * a[1];
    })[0];
    return Math.ceil(crop.width / shape[0]) * Math.ceil(crop.height / shape[1]) * shape[0] * shape[1];
  })() : 0;
  const displayWidth = imageSize.width * displayScale;

  useEffect(() => {
    setImageSize({ width: 0, height: 0 });
    setCrop(null);
    setZoom(100);
    if (pickerViewportRef.current) {
      pickerViewportRef.current.scrollLeft = 0;
      pickerViewportRef.current.scrollTop = 0;
    }
  }, [tilesetId]);

  const setPickerTileSize = (size: 8 | 16 | 32) => {
    setTileSize(size);
    setCrop(null);
  };

  const handlePickerWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    setZoom(previous => Math.max(50, Math.min(400, previous + (event.deltaY < 0 ? 25 : -25))));
  };

  const handlePickerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    const viewport = pickerViewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    pickerPanStartRef.current = { x: event.clientX, y: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
    setIsPanningPicker(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePickerPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pickerPanStartRef.current;
    const viewport = pickerViewportRef.current;
    if (!start || !viewport) return;
    viewport.scrollLeft = start.scrollLeft - (event.clientX - start.x);
    viewport.scrollTop = start.scrollTop - (event.clientY - start.y);
  };

  const stopPickerPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pickerPanStartRef.current) return;
    pickerPanStartRef.current = null;
    setIsPanningPicker(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const cropCellAt = (clientX: number, clientY: number) => {
    if (!imageRef.current || imageSize.width < tileSize || imageSize.height < tileSize) return;
    const bounds = imageRef.current.getBoundingClientRect();
    const x = (clientX - bounds.left) * imageSize.width / bounds.width;
    const y = (clientY - bounds.top) * imageSize.height / bounds.height;
    return {
      x: Math.max(0, Math.min(Math.ceil(imageSize.width / tileSize) - 1, Math.floor(x / tileSize))),
      y: Math.max(0, Math.min(Math.ceil(imageSize.height / tileSize) - 1, Math.floor(y / tileSize))),
    };
  };

  const updateCropFromDrag = (endX: number, endY: number) => {
    const start = cropDragRef.current;
    if (!start) return;
    const left = Math.min(start.startX, endX) * tileSize;
    const top = Math.min(start.startY, endY) * tileSize;
    const right = Math.min(imageSize.width, (Math.max(start.startX, endX) + 1) * tileSize);
    const bottom = Math.min(imageSize.height, (Math.max(start.startY, endY) + 1) * tileSize);
    setCrop({ x: left, y: top, width: right - left, height: bottom - top });
  };

  const handleCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const cell = cropCellAt(event.clientX, event.clientY);
    if (!cell) return;
    event.preventDefault();
    cropDragRef.current = { startX: cell.x, startY: cell.y, endX: cell.x, endY: cell.y };
    updateCropFromDrag(cell.x, cell.y);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropDragRef.current) return;
    const cell = cropCellAt(event.clientX, event.clientY);
    if (!cell) return;
    cropDragRef.current.endX = cell.x;
    cropDragRef.current.endY = cell.y;
    updateCropFromDrag(cell.x, cell.y);
  };

  const handleCropPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    cropDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const createSpriteFromCrop = async () => {
    const image = imageRef.current;
    if (!tileset || !image || !crop) return;
    setSaving(true);
    try {
      const canvasWidth = crop.width === 8 && crop.height === 8 && tileSize === 8 ? 8 : crop.width;
      const canvasHeight = crop.width === 8 && crop.height === 8 && tileSize === 8 ? 16 : crop.height;
      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to create sprite image.');
      context.clearRect(0, 0, canvasWidth, canvasHeight);
      const destinationY = canvasHeight === 16 && crop.width === 8 && crop.height === 8 ? 4 : 0;
      context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, destinationY, crop.width, crop.height);
      const baseName = tileset.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_') || 'tileset';
      const filename = `${baseName}_actor_${canvasWidth}x${canvasHeight}_${crop.x}_${crop.y}_${uuidv4().slice(0, 8)}.png`;
      const result = await window.electronAPI.saveGeneratedSpriteImage(filename, canvas.toDataURL('image/png').split(',')[1]);
      if (result?.status !== 'success') throw new Error(result?.message ?? 'Unable to save sprite image.');

      const frameId = uuidv4();
      const pieceId = uuidv4();
      const animation = {
        id: 'idle', name: 'Idle', type: 'idle', frames: [],
        canvasFrames: [{ id: frameId, width: canvasWidth, height: canvasHeight, pieces: [{ id: pieceId, sourceX: 0, sourceY: 0, width: canvasWidth, height: canvasHeight, x: 0, y: 0 }] }],
      };
      const spriteId = filename.replace(/\.[^/.]+$/, '');
      const resource: ISpriteSettings = {
        id: spriteId, name: `${tileset.name.replace(/\.[^/.]+$/, '')} ${tileSize}x${tileSize}`, filename,
        _resourceType: 'sprite', _saved: false, _deleted: false, _pendingAssetRefresh: true,
        imageWidth: canvasWidth, imageHeight: canvasHeight,
        playerAnimationStripOrientation: 'horizontal', playerFrameWidth: canvasWidth, playerFrameHeight: canvasHeight,
        playerFramesPerDirection: 1, playerAnimSpeed: 6, playerIdleFrame: 0,
        playerCanvasOriginX: Math.floor(canvasWidth / 2), playerCanvasOriginY: Math.floor(canvasHeight / 2),
        playerCollisionX: 0, playerCollisionY: 0, playerCollisionWidth: 16, playerCollisionHeight: 8,
        playerAnimations: [animation],
        playerAnimationStates: [{ id: 'idle', name: 'Idle', type: 'fixed-direction', flipRightToCreateLeftFacingFrames: false, animations: [animation] }],
      };
      setSpriteResources(previous => [...previous.filter(sprite => sprite.id !== spriteId), resource]);
      onSpriteSelected(spriteId);
      window.dispatchEvent(new Event('gba-studio:assets-reloaded'));
      setOpen(false);
    } catch (error) {
      console.error('Unable to create actor sprite from tileset:', error);
      message.error(t('actor.sprite.createFailed'));
    } finally {
      setSaving(false);
    }
  };

  return <>
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      <Typography.Text>Sprite Sheet</Typography.Text>
      <WarningField warning={!!warning} message={t('events.missingReference')}>
      <Select
        aria-label="Sprite Sheet"
        status={warning ? 'warning' : undefined}
        style={{ width: '100%' }}
        value={spriteId}
        placeholder={t('actor.sprite.selectSprite')}
        allowClear
        showSearch
        optionFilterProp="label"
        onChange={value => {
          if (value === '__CREATE_SPRITE_FROM_TILESET__') {
            setOpen(true);
            return;
          }
          onSpriteSelected(value);
        }}
      >
        <Select.Option key="create-from-tileset" value="__CREATE_SPRITE_FROM_TILESET__" label={t('actor.sprite.chooseTileset')}>
          <span style={{ color: token.colorPrimary }}>{t('actor.sprite.chooseTileset')}</span>
        </Select.Option>
        {spriteResources.filter(sprite => !sprite._deleted && spriteFiles.some(file => file.id.toLowerCase() === sprite.id.toLowerCase() || file.name.toLowerCase() === String(sprite.filename ?? '').toLowerCase())).map(sprite => {
          const file = spriteFiles.find(item => item.id === sprite.id);
          const filename = sprite.filename ?? file?.name;
          const searchable = `${sprite.name} ${sprite.id} ${filename ?? ''}`;
          return <Select.Option key={sprite.id} value={sprite.id} label={searchable}>
            <PlayerSpriteOption name={sprite.name} path={file?.path ?? ''} />
          </Select.Option>;
        })}
      </Select>
      </WarningField>
    </Space>
    <Modal title={t('actor.sprite.createTitle')} open={open} width={760} onCancel={() => setOpen(false)} onOk={() => void createSpriteFromCrop()} okText={t('actor.sprite.create')} confirmLoading={saving} okButtonProps={{ disabled: !tileset || !crop || selectedCompositeParts > 16 || selectedCompositePixels > 32 * 1024 }}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Select aria-label={t('actor.sprite.tileset')} placeholder={t('actor.sprite.selectTileset')} showSearch optionFilterProp="label" value={tilesetId} onChange={setTilesetId} options={tilesets.map(item => ({ value: item.id, label: item.name }))} />
        <Flex align="center" gap={12}>
          <Typography.Text>{t('actor.sprite.selectionSize')}</Typography.Text>
          <Segmented size="small" value={tileSize} options={[8, 16, 32].map(size => ({ value: size, label: `${size}×${size}` }))} onChange={value => setPickerTileSize(value as 8 | 16 | 32)} />
        </Flex>
        <div ref={pickerViewportRef} onWheel={handlePickerWheel} onAuxClick={event => { if (event.button === 1) event.preventDefault(); }} style={{ height: 280, minHeight: 280, maxHeight: 280, flex: '0 0 280px', boxSizing: 'border-box', overflow: 'auto', padding: 4, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, background: token.colorBgContainer, cursor: isPanningPicker ? 'grabbing' : 'default', touchAction: 'none' }}>
          {tileset ? <div onPointerDown={event => event.button === 1 ? handlePickerPointerDown(event) : handleCropPointerDown(event)} onPointerMove={event => { handlePickerPointerMove(event); handleCropPointerMove(event); }} onPointerUp={event => { stopPickerPan(event); handleCropPointerUp(event); }} onPointerCancel={event => { stopPickerPan(event); handleCropPointerUp(event); }} onContextMenu={event => event.preventDefault()} title={t('actor.sprite.pickerTooltip')} style={{ position: 'relative', display: 'block', width: displayWidth || undefined, height: imageSize.height ? imageSize.height * displayScale : undefined, cursor: isPanningPicker ? 'grabbing' : 'crosshair', lineHeight: 0, touchAction: 'none', userSelect: 'none' }}>
            <img ref={imageRef} src={tileset.path} alt={tileset.name} onLoad={event => { const image = event.currentTarget; setImageSize({ width: image.naturalWidth, height: image.naturalHeight }); }} style={{ display: 'block', width: displayWidth || 'auto', imageRendering: 'pixelated' }} />
            {imageSize.width > 0 && <svg aria-hidden="true" viewBox={`0 0 ${imageSize.width} ${imageSize.height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {Array.from({ length: Math.floor(imageSize.width / tileSize) }, (_, index) => <line key={`v-${index}`} x1={(index + 1) * tileSize} y1="0" x2={(index + 1) * tileSize} y2={imageSize.height} stroke={token.colorBgContainer} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
              {Array.from({ length: Math.floor(imageSize.height / tileSize) }, (_, index) => <line key={`h-${index}`} x1="0" y1={(index + 1) * tileSize} x2={imageSize.width} y2={(index + 1) * tileSize} stroke={token.colorBgContainer} strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
            </svg>}
            {crop && <span style={{ position: 'absolute', left: crop.x * displayScale, top: crop.y * displayScale, width: crop.width * displayScale, height: crop.height * displayScale, outline: `2px solid ${token.colorPrimary}`, background: 'rgba(22,119,255,.15)', pointerEvents: 'none' }} />}
          </div> : <Flex style={{ width: '100%', height: '100%' }} align="center" justify="center"><Typography.Text type="secondary">{t('actor.sprite.selectTileset')}</Typography.Text></Flex>}
        </div>
        {tileset && imageSize.width > 0 && (imageSize.width < tileSize || imageSize.height < tileSize) && <Typography.Text type="danger">{t('actor.sprite.tilesetTooSmall')}</Typography.Text>}
        {selectedCompositeParts > 16 && <Typography.Text type="danger">{t('actor.sprite.compositeLimit', { count: selectedCompositeParts })}</Typography.Text>}
        {selectedCompositePixels > 32 * 1024 && <Typography.Text type="danger">{t('actor.sprite.vramLimit', { size: Math.ceil(selectedCompositePixels / 1024) })}</Typography.Text>}
        <Typography.Text type="secondary">{tileSize === 8 ? t('actor.sprite.smallCanvasHint') : t('actor.sprite.selectCropHint')}</Typography.Text>
      </Space>
    </Modal>
  </>;
};

const attentionLabel = (label: React.ReactNode, count: number) => <AttentionLabel label={label} count={count} />;

const SceneObjectSettingsForm: React.FC<{ sceneId: string; type: 'actor' | 'trigger'; objectId: string; availableSprites?: any[]; availableTilesets?: any[] }> = ({ sceneId, type, objectId, availableSprites = [], availableTilesets = [] }) => {
const { scenes, setScenes, prefabs, setPrefabs, setElementSelected, settingUtils, setSettingUtils } = useAppContexts();
  const nameHoverStyle = useNameHoverStyle();
  const { modal } = App.useApp();
  const { t } = useI18n();
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const cancelNameOnBlur = useRef(false);
  const positionGrid = useSceneObjectSnapSize();
  const scene = scenes.find(item => item.id === sceneId);
  const object = type === 'actor' ? scene?.actors?.find(item => item.id === objectId) : scene?.triggers?.find(item => item.id === objectId);
  if (!scene || !object) return null;
  const label = type === 'actor' ? 'Actor' : 'Trigger';
  const linkedPrefab = object.prefabId ? prefabs.prefabs.find(item => item.id === object.prefabId && item.type === type) : undefined;
  const prefabData: any = linkedPrefab ? type === 'actor' ? linkedPrefab.actor : linkedPrefab.trigger : {};
  const eventKeys = type === 'actor' ? ['onInteractScript', 'onInitScript', 'onUpdateScript'] : ['onEnterScript', 'onLeaveScript', 'onInteractScript', 'onInitScript', 'onUpdateScript'];
  const effectiveObject: any = linkedPrefab ? { ...object, ...(type === 'actor' && !object.prefabEventsDetached ? { spriteId: prefabData.spriteId, keepRunningWhileOffscreen: prefabData.keepRunningWhileOffscreen === true } : {}), ...(!object.prefabEventsDetached ? Object.fromEntries(eventKeys.map(key => [key, prefabData[key] ?? []])) : {}) } : object;
  const prefabEventsLocked = !!linkedPrefab && object.prefabEditable !== true && object.prefabEventsDetached !== true;
  const scriptTabLabel = (label: string, events: IScriptsElement[] | undefined) => attentionLabel(label, countEventAttention(events ?? []));
  const update = (changes: Record<string, unknown>) => {
    const key = type === 'actor' ? 'actors' : 'triggers';
    const sharedKeys = type === 'actor' ? ['spriteId', 'keepRunningWhileOffscreen', ...eventKeys] : eventKeys;
    if (linkedPrefab && object.prefabEditable !== true) {
      changes = Object.fromEntries(Object.entries(changes).filter(([field]) =>
        !sharedKeys.includes(field) || (object.prefabEventsDetached === true && (field.endsWith('Script') || field === 'keepRunningWhileOffscreen'))));
      if (!Object.keys(changes).length) return;
    }
    const sharedChanges = Object.fromEntries(Object.entries(changes).filter(([field]) => sharedKeys.includes(field)));
    const prefabChanges = Object.fromEntries(Object.entries(sharedChanges).filter(([field]) => !(object.prefabEventsDetached && field.endsWith('Script'))));
    const canEditPrefab = !!linkedPrefab && object.prefabEditable === true && Object.keys(prefabChanges).length > 0;
    if (canEditPrefab) {
      const prefabField = type === 'actor' ? 'actor' : 'trigger';
      setPrefabs(previous => ({ ...previous, prefabs: previous.prefabs.map(item => item.id === linkedPrefab!.id ? { ...item, [prefabField]: { ...item[prefabField], ...prefabChanges } } : item), _saved: false }));
    }
    let updated: any;
    setScenes(previous => previous.map(currentScene => {
      if (currentScene.id !== sceneId && !canEditPrefab) return currentScene;
      const values = ((currentScene as any)[key] ?? []).map((item: any) => {
        const isCurrent = currentScene.id === sceneId && item.id === objectId;
        const isLinkedInstance = canEditPrefab && item.prefabId === linkedPrefab!.id && item.type !== 'other';
        if (!isCurrent && !isLinkedInstance) return item;
        const next = { ...item, ...(isCurrent ? changes : {}), ...(isLinkedInstance ? Object.fromEntries(Object.entries(prefabChanges).filter(([field]) => field === 'spriteId' || !field.endsWith('Script') || !item.prefabEventsDetached)) : {}) };
        if (isCurrent) updated = { ...currentScene, [key]: (currentScene as any)[key].map((entry: any) => entry.id === objectId ? next : entry), _saved: false };
        return next;
      });
      if (!canEditPrefab || currentScene.id === sceneId) return { ...currentScene, [key]: values, _saved: false };
      const sceneHasUpdatedPrefabInstance = values.some((item: any, index: number) => item !== ((currentScene as any)[key] ?? [])[index]);
      return sceneHasUpdatedPrefabInstance ? { ...currentScene, [key]: values, _saved: false } : currentScene;
    }));
    if (!updated) updated = { ...scene, [key]: (scene[key] ?? []).map((item: any) => item.id === objectId ? { ...item, ...changes } : item), _saved: false };
    setElementSelected(updated);
  };
  const getEventList = (value: unknown): any[] => Array.isArray(value) ? value : [];
  const cloneEventList = (events: any[]): any[] => events.map(event => ({ ...event, id: uuidv4(), args: event.args ? { ...event.args } : event.args, ...(event.children ? { children: { ...event.children, then: cloneEventList(event.children.then ?? []), ...(event.children.else ? { else: cloneEventList(event.children.else) } : {}) } } : {}) }));
  const unlinkPrefabEvents = () => {
    const key = type === 'actor' ? 'actors' : 'triggers';
    const changes = { prefabEventsDetached: true, ...Object.fromEntries(eventKeys.map(field => [field, cloneEventList(effectiveObject[field] ?? [])])) };
    const updated = { ...scene, [key]: (scene[key] ?? []).map((item: any) => item.id === objectId ? { ...item, ...changes } : item), _saved: false };
    setScenes(previous => previous.map(item => item.id === sceneId ? updated : item));
    setElementSelected(updated);
  };
  const convertToPrefab = () => {
    if (linkedPrefab) return;
    const id = uuidv4();
    const name = object.name || `${type === 'actor' ? t('prefabs.addActor') : t('prefabs.addTrigger')} ${prefabs.prefabs.filter(item => item.type === type).length + 1}`;
    const prefab: IPrefabDefinition = type === 'actor'
      ? { id, name, type, folderId: 'prefab-folder-actors', actor: { keepRunningWhileOffscreen: (object as any).keepRunningWhileOffscreen === true, spriteId: (object as any).spriteId, moveSpeed: (object as any).moveSpeed, animationSpeed: (object as any).animationSpeed, onInteractScript: (object as any).onInteractScript ?? [], onInitScript: (object as any).onInitScript ?? [], onUpdateScript: (object as any).onUpdateScript ?? [] } }
      : { id, name, type, folderId: 'prefab-folder-triggers', trigger: { onEnterScript: (object as any).onEnterScript ?? [], onLeaveScript: (object as any).onLeaveScript ?? [], onInteractScript: (object as any).onInteractScript ?? [], onInitScript: (object as any).onInitScript ?? [], onUpdateScript: (object as any).onUpdateScript ?? [] } };
    const key = type === 'actor' ? 'actors' : 'triggers';
    const updated = { ...scene, [key]: (scene[key] ?? []).map((item: any) => item.id === objectId ? { ...item, prefabId: id } : item), _saved: false };
    setPrefabs(previous => ({ ...previous, prefabs: [...previous.prefabs, prefab], _saved: false }));
    setScenes(previous => previous.map(item => item.id === sceneId ? updated : item));
    setElementSelected(updated);
  };
  const copyComponent = () => {
    const id = uuidv4();
    const eventFields = type === 'actor' ? ['onInteractScript', 'onInitScript', 'onUpdateScript'] : ['onEnterScript', 'onLeaveScript', 'onInteractScript', 'onInitScript', 'onUpdateScript'];
    const copy: any = { ...object, id, ...(type === 'actor' ? { actorId: id } : {}), name: `${object.name || label} Copy`, ...Object.fromEntries(eventFields.map(field => [field, cloneEventList(getEventList((object as any)[field] ?? []))])) };
    const key = type === 'actor' ? 'actors' : 'triggers';
    const updated = { ...scene, [key]: [...(scene[key] ?? []), copy], _saved: false };
    setScenes(previous => previous.map(item => item.id === sceneId ? updated : item));
    setElementSelected(updated);
    setSettingUtils(previous => ({ ...previous, activeSceneObject: { sceneId, type, id }, activeTriggerId: type === 'trigger' ? id : null }));
  };
  const deleteComponent = () => modal.confirm({ title: t('prefabs.deleteComponent'), content: t('prefabs.deleteComponentConfirm', { name: object.name || label }), okText: t('common.delete'), okButtonProps: { danger: true }, onOk: () => {
    const key = type === 'actor' ? 'actors' : 'triggers';
    const updated = { ...scene, [key]: (scene[key] ?? []).filter((item: any) => item.id !== objectId), _saved: false };
    setScenes(previous => previous.map(item => item.id === sceneId ? updated : item));
    setSettingUtils(previous => previous.activeSceneObject?.sceneId === sceneId && previous.activeSceneObject?.id === objectId ? { ...previous, activeSceneObject: null, activeTriggerId: null } : previous);
    setElementSelected(updated);
  } });
  const componentMenu = { items: [
    linkedPrefab ? { key: 'editable', label: <Checkbox checked={object.prefabEditable === true} onClick={event => event.stopPropagation()} onChange={event => update({ prefabEditable: event.target.checked })}>{t('prefabs.editableFromScene')}</Checkbox> } : { key: 'convert', label: t('prefabs.convertToPrefab') },
    { key: 'copy', icon: <CopyOutlined />, label: t('prefabs.copyComponent') },
    { key: 'delete', danger: true, icon: <DeleteOutlined />, label: t('prefabs.deleteComponent') },
  ], onClick: ({ key }: { key: string }) => { if (key === 'convert') convertToPrefab(); else if (key === 'copy') copyComponent(); else if (key === 'delete') deleteComponent(); } };
  const snap = (value: number, step: number, offset = 0) => Math.round((value - offset) / step) * step + offset;
  const positionWidth = type === 'actor' ? Math.max(16, object.width ?? 16) : object.width ?? 8;
  const positionHeight = type === 'actor' ? Math.max(8, object.height ?? scene.gridSize ?? 8) : object.height ?? 8;
  const centeredPosition = type === 'actor' && object.anchor === 'center';
  const xBounds = sceneObjectAxisBounds(scene.width, positionWidth, centeredPosition);
  const yBounds = sceneObjectAxisBounds(scene.height, positionHeight, centeredPosition);
  const positionX = (value: number | null) => sceneObjectAxisPosition(value ?? xBounds.min, scene.width, positionWidth, centeredPosition, positionGrid);
  const positionY = (value: number | null) => sceneObjectAxisPosition(value ?? yBounds.min, scene.height, positionHeight, centeredPosition, positionGrid);
  const dimension = (value: number | null, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, snap(Math.max(minimum, typeof value === 'number' ? value : minimum), 8)));
  const triggerMaxWidth = Math.max(8, Math.floor(Math.max(0, scene.width - object.x) / 8) * 8);
  const triggerMaxHeight = Math.max(8, Math.floor(Math.max(0, scene.height - object.y) / 8) * 8);
  const actorMoveSpeed = Number((object as any).moveSpeed ?? 2);
  const actorMoveSpeedIsCustom = !actorMoveSpeedOptions.some(option => option.value === actorMoveSpeed);
  const defaultName = `${label} ${(scene[type === 'actor' ? 'actors' : 'triggers']?.findIndex((item: any) => item.id === objectId) ?? 0) + 1}`;
  const restoreDefaultName = () => {
    if (cancelNameOnBlur.current) { cancelNameOnBlur.current = false; setNameDraft(object.name ?? ''); setIsEditingName(false); return; }
    const name = nameDraft.trim() ? nameDraft : defaultName;
    if (name !== object.name) update({ name });
    setIsEditingName(false);
  };
  return <Content style={{ padding: 10 }}>
    {isEditingName ? <Input autoFocus variant="borderless" value={nameDraft} placeholder={defaultName} onChange={event => setNameDraft(event.target.value)} onBlur={restoreDefaultName} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelNameOnBlur.current = true; event.currentTarget.blur(); } }} onPressEnter={event => event.currentTarget.blur()} /> : <Flex align="center" justify="space-between" gap={8}><Typography.Title className="editable-name-title" level={5} onClick={() => { setNameDraft(object.name ?? ''); setIsEditingName(true); }} style={{ ...nameHoverStyle, marginTop: 0, marginBottom: 0, cursor: 'text', flex: 1 }}>{object.name || defaultName}</Typography.Title><Dropdown menu={componentMenu} trigger={['click']}><Button type="text" aria-label={t('prefabs.componentActions')} icon={<SettingOutlined />} onClick={event => event.stopPropagation()} /></Dropdown></Flex>}
    <Divider style={{ margin: '8px 0' }} />
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Paragraph style={{ marginBottom: 8 }}>{type === 'actor' ? 'Start Position' : 'Position'}</Typography.Paragraph>
      <Flex gap={8}>
        <InputNumber addonBefore="X" min={xBounds.min} max={xBounds.max} step={positionGrid} value={object.x} onChange={value => update({ x: positionX(typeof value === 'number' ? value : null) })} style={{ flex: 1, minWidth: 0 }} />
        <InputNumber addonBefore="Y" min={yBounds.min} max={yBounds.max} step={positionGrid} value={object.y} onChange={value => update({ y: positionY(typeof value === 'number' ? value : null) })} style={{ flex: 1, minWidth: 0 }} />
      </Flex>
      {type === 'actor' && <>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Typography.Text>Direction</Typography.Text>
              <DirectionRadioGroup buttonStyle="solid" style={{ width: '100%', display: 'flex' }} value={(object as any).direction ?? 'right'} onChange={event => update({ direction: event.target.value })}>
            <Radio.Button value="left" style={{ flex: 1, textAlign: 'center' }}><CaretLeftFilled /></Radio.Button>
            <Radio.Button value="up" style={{ flex: 1, textAlign: 'center' }}><CaretUpFilled /></Radio.Button>
            <Radio.Button value="down" style={{ flex: 1, textAlign: 'center' }}><CaretDownFilled /></Radio.Button>
            <Radio.Button value="right" style={{ flex: 1, textAlign: 'center' }}><CaretRightFilled /></Radio.Button>
          </DirectionRadioGroup>
        </Space>
        {linkedPrefab && <Flex align="center" gap={6} wrap="wrap"><Tag color="purple">{t('prefabs.linkedTo', { name: linkedPrefab.name })}</Tag>{!object.prefabEventsDetached && <Tooltip title={t('prefabs.unlinkEvents')}><Button size="small" type="text" icon={<ArrowRightOutlined />} aria-label={t('prefabs.unlinkEvents')} onClick={unlinkPrefabEvents} /></Tooltip>}</Flex>}
        <Divider style={{ margin: '12px 0' }} />
        <Flex gap={8} style={{ width: '100%' }}>
          <Space direction="vertical" size={2} style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text>Movement Speed</Typography.Text>
            {actorMoveSpeedIsCustom ? <InputNumber min={0.01} max={10} step={0.0625} value={actorMoveSpeed} onChange={value => update({ moveSpeed: value ?? 1 })} style={{ width: '100%' }} /> : <Select showSearch optionFilterProp="label" value={actorMoveSpeed} onChange={value => update({ moveSpeed: value === -1 ? 1 : value })} style={{ width: '100%' }}>{actorMoveSpeedOptions.map(option => <Select.Option key={option.value} value={option.value} label={`${option.label} ${option.ppf}`}><span style={{ display: 'flex', justifyContent: 'space-between' }}>{option.label}<span style={{ opacity: 0.6, marginLeft: 8 }}>{option.ppf}</span></span></Select.Option>)}<Select.Option value={-1} label="Custom Speed">Custom Speed</Select.Option></Select>}
          </Space>
          <Space direction="vertical" size={2} style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text>Animation Speed</Typography.Text>
            <Select showSearch optionFilterProp="label" value={(object as any).animationSpeed ?? 6} onChange={animationSpeed => update({ animationSpeed })} style={{ width: '100%' }}>{actorAnimationSpeedOptions.map(option => <Select.Option key={option.value} value={option.value} label={`${option.label} ${option.fps}`}><span style={{ display: 'flex', justifyContent: 'space-between' }}>{option.label}<span style={{ opacity: 0.6, marginLeft: 8 }}>{option.fps}</span></span></Select.Option>)}</Select>
          </Space>
        </Flex>
        <Content>
          <fieldset disabled={!!linkedPrefab && object.prefabEditable !== true} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><ActorSpriteSheetPicker tilesets={availableTilesets} spriteFiles={availableSprites} warning={hasAssetReferenceWarning(effectiveObject, 'spriteId')} spriteId={effectiveObject.spriteId} onSpriteSelected={spriteId => update({ spriteId })} /></fieldset>
        </Content>
      </>}
      {type === 'actor' ? (
        <Checkbox checked={(object as ISceneActor).showCollider === true} onChange={event => update({ showCollider: event.target.checked })}>{t('events.actor.showColliders')}</Checkbox>
      ) : (
        <>
          <Typography.Paragraph style={{ margin: '8px 0' }}>Size</Typography.Paragraph>
          <Flex gap={8}>
            <InputNumber addonBefore="W" min={8} max={triggerMaxWidth} step={8} value={object.width} onChange={value => update({ width: dimension(typeof value === 'number' ? value : null, 8, triggerMaxWidth) })} style={{ flex: 1, minWidth: 0 }} />
            <InputNumber addonBefore="H" min={8} max={triggerMaxHeight} step={8} value={object.height} onChange={value => update({ height: dimension(typeof value === 'number' ? value : null, 8, triggerMaxHeight) })} style={{ flex: 1, minWidth: 0 }} />
          </Flex>
        </>
      )}
      {type === 'actor' && <fieldset {...{ inert: prefabEventsLocked ? '' : undefined }} aria-disabled={prefabEventsLocked} disabled={prefabEventsLocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><Tabs key={settingUtils.referenceTarget?.requestId ?? objectId} defaultActiveKey={settingUtils.referenceTarget?.tab ?? 'interact'} size="small" items={[
        { key: 'interact', label: scriptTabLabel('On Interact', getEventList(effectiveObject.onInteractScript)), children: <><CollapseEventManager storageKey="onInteractScript" scripts={getEventList(effectiveObject.onInteractScript)} onScriptsChange={events => update({ onInteractScript: events })} /><SelectNewEvent compact showFlowButton={false} onEventCreated={event => update({ onInteractScript: [...getEventList(effectiveObject.onInteractScript), event] })} /></> },
        { key: 'init', label: scriptTabLabel('On Init', getEventList(effectiveObject.onInitScript)), children: <><CollapseEventManager storageKey="onInitScript" scripts={getEventList(effectiveObject.onInitScript)} onScriptsChange={events => update({ onInitScript: events })} /><SelectNewEvent compact showFlowButton={false} onEventCreated={event => update({ onInitScript: [...getEventList(effectiveObject.onInitScript), event] })} /></> },
        { key: 'update', label: scriptTabLabel('On Update', getEventList(effectiveObject.onUpdateScript)), children: <><ActorOffscreenControl value={effectiveObject.keepRunningWhileOffscreen} onChange={keepRunningWhileOffscreen => update({ keepRunningWhileOffscreen })} /><CollapseEventManager storageKey="onUpdateScript" scripts={getEventList(effectiveObject.onUpdateScript)} onScriptsChange={events => update({ onUpdateScript: events })} /><SelectNewEvent compact showFlowButton={false} onEventCreated={event => update({ onUpdateScript: [...getEventList(effectiveObject.onUpdateScript), event] })} /></> },
      ]} /></fieldset>}
      {type === 'trigger' && <><Checkbox checked={object.enabled !== false} onChange={event => update({ enabled: event.target.checked })}>{t('prefabs.enabled')}</Checkbox>{linkedPrefab && <Flex align="center" gap={6}><Tag color="purple">{t('prefabs.linkedTo', { name: linkedPrefab.name })}</Tag>{!object.prefabEventsDetached && <Button size="small" type="text" icon={<ArrowRightOutlined />} aria-label={t('prefabs.unlinkEvents')} title={t('prefabs.unlinkEvents')} onClick={unlinkPrefabEvents} />}</Flex>}<fieldset {...{ inert: prefabEventsLocked ? '' : undefined }} aria-disabled={prefabEventsLocked} disabled={prefabEventsLocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><Tabs key={settingUtils.referenceTarget?.requestId ?? objectId} defaultActiveKey={settingUtils.referenceTarget?.tab ?? 'enter'} size="small" items={[
        { key: 'enter', label: scriptTabLabel('On Enter', getEventList(effectiveObject.onEnterScript)), children: <Space direction="vertical" size="small" style={{ width: '100%' }}><CollapseEventManager storageKey="onEnterScript" scripts={getEventList(effectiveObject.onEnterScript)} onScriptsChange={events => update({ onEnterScript: events })} /><div style={{ paddingTop: 8 }}><SelectNewEvent compact showFlowButton={false} onEventCreated={event => update({ onEnterScript: [...getEventList(effectiveObject.onEnterScript), event] })} /></div></Space> },
        { key: 'leave', label: scriptTabLabel('On Leave', getEventList(effectiveObject.onLeaveScript)), children: <Space direction="vertical" size="small" style={{ width: '100%' }}><CollapseEventManager storageKey="onLeaveScript" scripts={getEventList(effectiveObject.onLeaveScript)} onScriptsChange={events => update({ onLeaveScript: events })} /><div style={{ paddingTop: 8 }}><SelectNewEvent compact showFlowButton={false} onEventCreated={event => update({ onLeaveScript: [...getEventList(effectiveObject.onLeaveScript), event] })} /></div></Space> },
      ]} /></fieldset></>}
      <AdditionalEventWarnings visibleFields={type === 'actor' ? ['onInteractScript', 'onInitScript', 'onUpdateScript'] : ['onEnterScript', 'onLeaveScript']} value={effectiveObject} onChange={update} />
    </Space>
  </Content>;
};

const PrefabSettingsForm: React.FC<{ prefab: IPrefabDefinition; availableSprites: any[]; availableTilesets: any[] }> = ({ prefab, availableSprites, availableTilesets }) => {
  const [prefabNameDraft, setPrefabNameDraft] = useState<string | null>(null);
  const cancelPrefabNameOnBlur = useRef(false);
  const { prefabs, setPrefabs, scenes, setScenes, setElementSelected } = useAppContexts();
  const { t } = useI18n();
  const { modal } = App.useApp();
  const data: any = (prefab.type === 'actor' ? prefab.actor : prefab.trigger) ?? {};
  const update = (changes: Record<string, unknown>) => {
    const { name, folderId, ...dataChanges } = changes;
    const next = { ...prefab, name: typeof name === 'string' ? name : prefab.name,
      ...(folderId !== undefined ? { folderId: folderId as string | null } : {}),
      ...(prefab.type === 'actor' ? { actor: { ...prefab.actor, ...dataChanges } } : { trigger: { ...prefab.trigger, ...dataChanges } }) };
    setPrefabs(previous => ({ ...previous, prefabs: previous.prefabs.map(item => item.id === prefab.id ? next : item), _saved: false }));
    const sharedKeys = prefab.type === 'actor' ? ['spriteId', 'keepRunningWhileOffscreen', 'onInteractScript', 'onInitScript', 'onUpdateScript'] : ['onEnterScript', 'onLeaveScript', 'onInteractScript', 'onInitScript', 'onUpdateScript'];
    const sharedChanges = Object.fromEntries(Object.entries(dataChanges).filter(([key]) => sharedKeys.includes(key)));
    if (Object.keys(sharedChanges).length) setScenes(previous => {
      const collection = prefab.type === 'actor' ? 'actors' : 'triggers';
      let changed = false;
      const nextScenes = previous.map(scene => {
        const instances = (scene as any)[collection] ?? [];
        if (!instances.some((instance: any) => instance.prefabId === prefab.id)) return scene;
        let sceneChanged = false;
        const values = instances.map((instance: any) => {
          if (instance.prefabId !== prefab.id) return instance;
          const instanceChanges = Object.fromEntries(Object.entries(sharedChanges).filter(([key]) => !key.endsWith('Script') || !instance.prefabEventsDetached));
          if (!Object.keys(instanceChanges).some(key => !Object.is(instance[key], instanceChanges[key]))) return instance;
          sceneChanged = true;
          return { ...instance, ...instanceChanges };
        });
        if (!sceneChanged) return scene;
        changed = true;
        return { ...scene, [collection]: values, _saved: false };
      });
      return changed ? nextScenes : previous;
    });
    setElementSelected({ ...next, _resourceType: 'prefab' });
  };
  const deletePrefab = () => modal.confirm({ title: t('prefabs.deleteTitle'), content: t('prefabs.deleteConfirm', { name: prefab.name }), okText: t('common.delete'), okButtonProps: { danger: true }, onOk: () => {
    const sharedKeys = prefab.type === 'actor' ? ['spriteId', 'keepRunningWhileOffscreen', 'onInteractScript', 'onInitScript', 'onUpdateScript'] : ['onEnterScript', 'onLeaveScript', 'onInteractScript', 'onInitScript', 'onUpdateScript'];
    setScenes(previous => previous.map(scene => {
      const collection = prefab.type === 'actor' ? 'actors' : 'triggers';
      const values = ((scene as any)[collection] ?? []).map((instance: any) => {
        if (instance.prefabId !== prefab.id) return instance;
        const detached = { ...instance, ...Object.fromEntries(sharedKeys.filter(key => key === 'spriteId' || !instance.prefabEventsDetached).filter(key => (data as any)[key] !== undefined).map(key => [key, (data as any)[key]])) };
        delete detached.prefabId; delete detached.prefabEditable; delete detached.prefabEventsDetached;
        return detached;
      });
      return { ...scene, [collection]: values, _saved: false };
    }));
    setPrefabs(previous => ({ ...previous, prefabs: previous.prefabs.filter(item => item.id !== prefab.id), _saved: false }));
    setElementSelected(null);
  } });
  const events = (key: string) => Array.isArray((data as any)[key]) ? (data as any)[key] as IScriptsElement[] : [];
  const eventTab = (key: string, label: string) => ({ key, label: attentionLabel(label, countEventAttention(events(key))), children: <>{prefab.type === 'actor' && key === 'onUpdateScript' && <ActorOffscreenControl value={data.keepRunningWhileOffscreen} onChange={keepRunningWhileOffscreen => update({ keepRunningWhileOffscreen })} />}<CollapseEventManager storageKey={key} scripts={events(key)} onScriptsChange={items => update({ [key]: items })} /><div style={{ paddingTop: 8 }}><SelectNewEvent compact showFlowButton={false} onEventCreated={item => update({ [key]: [...events(key), item] })} /></div></> });
  return <Content style={{ padding: 10 }}>
    <Flex align="center" justify="space-between"><Typography.Title level={5} style={{ marginTop: 0 }}>{prefab.type === 'actor' ? t('prefabs.actorTitle') : t('prefabs.triggerTitle')}</Typography.Title><Tooltip title={t('prefabs.delete')}><Button type="text" danger aria-label={t('prefabs.delete')} icon={<DeleteOutlined />} onClick={deletePrefab} /></Tooltip></Flex>
    <Input aria-label={t('prefabs.name')} value={prefabNameDraft ?? prefab.name} onFocus={() => setPrefabNameDraft(prefab.name)} onChange={event => setPrefabNameDraft(event.target.value)} onBlur={() => { if (cancelPrefabNameOnBlur.current) { cancelPrefabNameOnBlur.current = false; setPrefabNameDraft(null); return; } if (prefabNameDraft !== null && prefabNameDraft !== prefab.name) update({ name: prefabNameDraft }); setPrefabNameDraft(null); }} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelPrefabNameOnBlur.current = true; setPrefabNameDraft(null); event.currentTarget.blur(); } }} onPressEnter={event => event.currentTarget.blur()} />
    <Divider style={{ margin: '12px 0' }} />
    {prefab.type === 'actor' ? <>
      <Typography.Text>{t('prefabs.sprite')}</Typography.Text>
      <ActorSpriteSheetPicker tilesets={availableTilesets} spriteFiles={availableSprites} warning={hasAssetReferenceWarning(data, 'spriteId')} spriteId={data.spriteId} onSpriteSelected={spriteId => update({ spriteId })} />
      <Tabs size="small" items={[eventTab('onInteractScript', 'On Interact'), eventTab('onInitScript', 'On Init'), eventTab('onUpdateScript', 'On Update')]} />
    </> : <>
      <Checkbox checked={data.enabled !== false} onChange={event => update({ enabled: event.target.checked })}>{t('prefabs.enabled')}</Checkbox>
      <Typography.Text>{t('prefabs.size')}</Typography.Text>
      <Flex gap={8}><InputNumber addonBefore="W" min={8} step={8} value={data.width ?? 32} onChange={width => update({ width: width ?? 32 })} /><InputNumber addonBefore="H" min={8} step={8} value={data.height ?? 32} onChange={height => update({ height: height ?? 32 })} /></Flex>
      <Tabs size="small" items={[eventTab('onEnterScript', 'On Enter'), eventTab('onLeaveScript', 'On Leave'), eventTab('onInteractScript', 'On Interact')]} />
    </>}
    <AdditionalEventWarnings visibleFields={prefab.type === 'actor' ? ['onInteractScript', 'onInitScript', 'onUpdateScript'] : ['onEnterScript', 'onLeaveScript', 'onInteractScript']} value={data} onChange={update} />
  </Content>;
};

interface IRightPanelProps {
  controllerView: any;
}

const SceneRightPanel: React.FC<IRightPanelProps> = ({ controllerView }) => {
  const { t } = useI18n();
  const { token } = useToken();
  const { scenes, setScenes, elementSelected, setElementSelected, settings, setSettings, settingUtils, setSettingUtils, palettes, backgrounds, userSettings, setUserSettings } = useAppContexts();
  const isEditingTiles = Boolean(settingUtils.tileEditSceneId);

  const [availableTilesets, setAvailableTilesets] = useState<any[]>([]);
  const [availableAutoTiles, setAvailableAutoTiles] = useState<any[]>([]);
  const [availablePlayerSprites, setAvailablePlayerSprites] = useState<any[]>([]);
  const [selectedTiles, setSelectedTiles] = useState<number[]>(elementSelected?.selectedTiles || []);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isPanningTileset, setIsPanningTileset] = useState(false);
  const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 });
  const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 });
  const tilesetSelectionRef = useRef({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, extend: false });
  const tilesetViewportRef = useRef<HTMLDivElement>(null);
  const tilesetPanStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const [tilesetViewMode, setTilesetViewMode] = useState<'tileset' | 'autoTiles'>('tileset');
  const [autoTileConfigSignal, setAutoTileConfigSignal] = useState(0);
  const modifiedAutoTileSlotsRef = useRef(new Set<number>());
  // TODO(restore-shooter-game): restore these state declarations and reset effect with the Shooter config controls below.
  // const [showSceneCombatConfig, setShowSceneCombatConfig] = useState(false);
  // const [showSceneShooterConfig, setShowSceneShooterConfig] = useState(false);
  // useEffect(() => {
  //   setShowSceneCombatConfig(false);
  //   setShowSceneShooterConfig(false);
  // }, [elementSelected?.id, elementSelected?.sceneType]);

  const TILE_SIZE = 8;
  const editingTilesetLayerId = settingUtils.tileEditLayerId ?? elementSelected?.backgrounds?.[0]?.layerId ?? 0;
  const hoveredAutoTileSceneId = elementSelected?.id;
  const hoverSettingsSetterRef = useRef(setSettingUtils);
  hoverSettingsSetterRef.current = setSettingUtils;
  const handleHoverAutoTileSlot = useCallback((slotIndex: number | null) => {
    hoverSettingsSetterRef.current(previous => {
      if (slotIndex === null) return previous.autoTileSlotHover?.sceneId === hoveredAutoTileSceneId
        ? { ...previous, autoTileSlotHover: null } : previous;
      if (!hoveredAutoTileSceneId) return previous;
      return { ...previous, autoTileSlotHover: { sceneId: hoveredAutoTileSceneId, layerId: editingTilesetLayerId, slotIndex } };
    });
  }, [hoveredAutoTileSceneId, editingTilesetLayerId]);
  const activeTilesetLayer = elementSelected?.backgrounds?.find(layer => layer.layerId === editingTilesetLayerId);
  const activeTilesetId = activeTilesetLayer?.selectedTilesetId ?? elementSelected?.selectedTilesetId ?? '';
  const activeLayerTileMap = activeTilesetLayer?.tileMap ?? (editingTilesetLayerId === 0 ? elementSelected?.tileMap : undefined);
  const usedTilesetIds = Array.from(new Set((activeLayerTileMap ?? []).flatMap((row: number[], rowIndex: number) => row.flatMap((tile: number, colIndex: number) => {
    if (tile < 0) return [];
    const tilesetId = activeTilesetLayer?.tileMapTilesetIds?.[rowIndex]?.[colIndex] ?? activeTilesetLayer?.selectedTilesetId ?? elementSelected?.selectedTilesetId;
    return tilesetId && !tilesetId.startsWith('auto-tile:') ? [tilesetId] : [];
  }))));
  const tilesetViewById = userSettings.tilesetViews ?? {};
  const activePickerViewId = tilesetViewMode === 'autoTiles' ? AUTO_TILE_VIEW_KEY : activeTilesetId;
  const activeTilesetView = tilesetViewById[activePickerViewId] ?? { cellSize: tilesetViewMode === 'autoTiles' ? 16 as const : 8 as const, zoom: 100, showGrid: true };
  const tilesetZoom = activeTilesetView.zoom;
  const tilesetCellSize = activeTilesetView.cellSize;
  const autoTileSlots = (settings?.autoTileSlots ?? []).map(slot => typeof slot.autoTileId === 'string'
    ? slot
    : { ...slot, parts: Array.from({ length: 47 }, () => null) });
  const updateTilesetViewForId = (tilesetId: string, patch: Partial<{ cellSize: 8 | 16 | 32; zoom: number; showGrid: boolean }>) => {
    if (!tilesetId) return;
    setUserSettings(previous => ({
      ...previous,
      _saved: false,
      tilesetViews: {
        ...previous.tilesetViews,
        [tilesetId]: { ...(previous.tilesetViews?.[tilesetId] ?? { cellSize: 8, zoom: 100, showGrid: true }), ...patch },
      },
    }));
  };
  const updateTilesetView = (patch: Partial<{ cellSize: 8 | 16 | 32; zoom: number; showGrid: boolean }>) => updateTilesetViewForId(activePickerViewId, patch);
  const [tileset, setTileset] = useState<{
    image: HTMLImageElement | HTMLCanvasElement;
    tileWidth: number;
    tileHeight: number;
    columns: number;
    rows: number;
    source?: string;
  }>({
    image: new Image(),
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    columns: 0,
    rows: 0,
  });
  const tilesPerCell = tilesetCellSize / TILE_SIZE;
  const tilesetDisplayColumns = Math.ceil(tileset.columns / tilesPerCell);
  const tilesetDisplayRows = Math.ceil(tileset.rows / tilesPerCell);
  const tilesetCanvasWidth = tileset.columns * TILE_SIZE;
  const tilesetCanvasHeight = tileset.rows * TILE_SIZE;
  const selectedTileIndexes = (elementSelected?.selectedTiles ?? []).filter((tileIndex: number) => tileIndex >= 0 && tileIndex < tileset.columns * tileset.rows);
  const selectedTileBounds = selectedTileIndexes.length > 0 ? selectedTileIndexes.reduce((bounds: { minCol: number; minRow: number; maxCol: number; maxRow: number }, tileIndex: number) => {
    const col = tileIndex % tileset.columns;
    const row = Math.floor(tileIndex / tileset.columns);
    return { minCol: Math.min(bounds.minCol, col), minRow: Math.min(bounds.minRow, row), maxCol: Math.max(bounds.maxCol, col), maxRow: Math.max(bounds.maxRow, row) };
  }, { minCol: tileset.columns, minRow: tileset.rows, maxCol: 0, maxRow: 0 }) : null;
  const [mapWidth, setMapWidth] = useState(Math.ceil((elementSelected?.width || 240) / TILE_SIZE));
  const [mapHeight, setMapHeight] = useState(Math.ceil((elementSelected?.height || 160) / TILE_SIZE));
  const [imageType, setImageType] = useState<EImageType>(EImageType.PALETTE_BITMAP_BG);
  const EVENTS_LAYER_ID = 4;
  const backgroundLayers = [0, 1, 2, 3];
  const isSingleLayerScene = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
  const editableLayerIds = isSingleLayerScene ? [2] : backgroundLayers;
  const backgroundPanelLayerIds = [...new Set([...editableLayerIds, ...(elementSelected?.backgrounds ?? []).filter(layer => hasAssetReferenceWarning(layer, 'backgroundId')).map(layer => layer.layerId)])];
  const isEventsLayer = settingUtils.tileEditLayerId === EVENTS_LAYER_ID;
  const sceneForEventsLayer = scenes.find(scene => scene.id === elementSelected?.id) ?? elementSelected;
  const eventsLayerAttentionCount = [...(sceneForEventsLayer?.actors ?? []), ...(sceneForEventsLayer?.triggers ?? [])]
    .reduce((total, object) => total + countObjectAttention(object), 0);
  const selectedSceneIds = settingUtils.selectedSceneIds ?? (elementSelected?.id ? [elementSelected.id] : []);
  const selectedScenes = scenes.filter(scene => selectedSceneIds.includes(scene.id) && !scene._deleted);
  const moveSelectedScenes = (deltaX: number, deltaY: number) => {
    let activeScene: typeof elementSelected = null;
    setScenes(previous => previous.map(scene => {
      if (!selectedSceneIds.includes(scene.id)) return scene;
      const position = scene.editorPosition ?? { x: scene.x, y: scene.y };
      const updated = { ...scene, x: position.x + deltaX, y: position.y + deltaY, editorPosition: { x: position.x + deltaX, y: position.y + deltaY }, _saved: false };
      if (scene.id === elementSelected?.id) activeScene = updated;
      return updated;
    }));
    if (activeScene) setElementSelected(activeScene);
  };

  useEffect(() => {
    if (selectedSceneIds.length < 2) return;

    const handleGroupMoveKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest('input, textarea, select, [contenteditable="true"]')) return;

      const direction: Record<string, [number, number]> = {
        ArrowUp: [0, -16],
        ArrowDown: [0, 16],
        ArrowLeft: [-16, 0],
        ArrowRight: [16, 0],
      };
      const movement = direction[event.key];
      if (!movement) return;

      event.preventDefault();
      moveSelectedScenes(...movement);
    };

    window.addEventListener('keydown', handleGroupMoveKeyDown);
    return () => window.removeEventListener('keydown', handleGroupMoveKeyDown);
  }, [selectedSceneIds, moveSelectedScenes]);
  const groupEvents = [
    {
      key: 'playerHit1Script',
      label: 'Group 1'
    },
    {
      key: 'playerHit2Script',
      label: 'Group 2'
    },
    {
      key: 'playerHit3Script',
      label: 'Group 3'
    },
  ];
  const [activeLayerKey, setActiveLayerKey] = useState("2");
  const [assetReloadVersion, setAssetReloadVersion] = useState(0);

  useEffect(() => {
    const reload = () => setAssetReloadVersion(version => version + 1);
    window.addEventListener('gba-studio:assets-reloaded', reload);
    return () => window.removeEventListener('gba-studio:assets-reloaded', reload);
  }, []);

  useEffect(() => {
    if (!elementSelected) return;
    setMapWidth(Math.ceil((elementSelected.width || 240) / TILE_SIZE));
    setMapHeight(Math.ceil((elementSelected.height || 160) / TILE_SIZE));
    if (isSingleLayerScene) {
      setActiveLayerKey('2');
    }
  }, [elementSelected?.id, elementSelected?.width, elementSelected?.height, isSingleLayerScene, setSettingUtils]);

  useEffect(() => {
    if (!isSingleLayerScene || !elementSelected?.id || settingUtils.tileEditSceneId !== elementSelected.id
      || settingUtils.tileEditLayerId === EVENTS_LAYER_ID) return;
    setSettingUtils(previous => ({
      ...previous,
      tileEditLayerId: EVENTS_LAYER_ID,
      ...(previous.activeButton === 'tiles' || previous.activeButton === 'colorize'
        ? { activeButton: 'select', activeSubButton: '' } : {}),
    }));
  }, [elementSelected?.id, isSingleLayerScene, settingUtils.tileEditSceneId, settingUtils.tileEditLayerId, setSettingUtils]);


  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const viewport = tilesetViewportRef.current;
    if (!viewport || tilesetViewMode !== 'tileset') return;

    const handleTilesetWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !viewport.contains(event.target as Node) || !activeTilesetId) return;
      event.preventDefault();
      event.stopPropagation();
      setUserSettings(previous => {
        const currentView = previous.tilesetViews?.[activeTilesetId] ?? { cellSize: 8 as const, zoom: 100, showGrid: true };
        const zoom = Math.max(50, Math.min(400, currentView.zoom + (event.deltaY < 0 ? 25 : -25)));
        return { ...previous, _saved: false, tilesetViews: { ...previous.tilesetViews, [activeTilesetId]: { ...currentView, zoom } } };
      });
    };

    viewport.addEventListener('wheel', handleTilesetWheel, { capture: true, passive: false });
    return () => viewport.removeEventListener('wheel', handleTilesetWheel, true);
  }, [activeTilesetId, setUserSettings, tilesetViewMode]);

  // Load available tilesets
  useEffect(() => {
    const loadTilesets = async () => {
      try {
        if (window.electronAPI && window.electronAPI.fetchImages) {
          setAvailableTilesets(await loadTilesetAssets(settingUtils.projectPathFile ?? settingUtils.localImagePath));
        }
      } catch (error) {
        console.error('Error loading tilesets:', error);
        // A missing asset must remain an empty tileset. Do not invent tiles
        // here: painting without a real tileset is intentionally disabled.
        setAvailableTilesets([]);
      }
    };

    const loadAutoTiles = async () => {
      try {
        setAvailableAutoTiles(await loadAutoTileAssets(settingUtils.projectPathFile ?? settingUtils.localImagePath));
      } catch (error) {
        console.error('Error loading autotile images:', error);
        setAvailableAutoTiles([]);
      }
    };

    const loadPlayerSprites = async () => {
      try {
        if (!window.electronAPI || !window.electronAPI.fetchImages) {
          setAvailablePlayerSprites([]);
          return;
        }

        const spritesData = await window.electronAPI.fetchImages('sprites');
        if (spritesData.status === 'success') {
          const sprites = spritesData.fileImages?.filter((filename: string) => /\.(png|jpg|jpeg|gif|bmp)$/i.test(filename)).map((filename: string) => ({
            id: filename.replace(/\.[^/.]+$/, ''),
            name: filename,
            path: joinLocalAssetPath(spritesData.localPath, filename),
          })) || [];
          setAvailablePlayerSprites(sprites);
        } else {
          setAvailablePlayerSprites([]);
        }
      } catch (error) {
        console.error('Error loading player sprites:', error);
        setAvailablePlayerSprites([]);
      }
    };

    loadTilesets();
    loadAutoTiles();
    loadPlayerSprites();
  }, [assetReloadVersion, settingUtils.localImagePath, settingUtils.projectPathFile]);

  useEffect(() => {
    if (elementSelected?.height && elementSelected?.width) {
      setMapWidth((elementSelected.width) / tileset.tileWidth);
      setMapHeight((elementSelected.height) / tileset.tileHeight);
    } 

    if (elementSelected?.selectedTiles) {
      setSelectedTiles(elementSelected.selectedTiles);
    }
  }, [elementSelected, tileset.tileWidth, tileset.tileHeight, elementSelected?.width, elementSelected?.height, elementSelected?.selectedTiles]);

  // const handleBackgroundChange = (backgroundData: { preview: string, file: File }) => {
  //   if (elementSelected) {
  //     elementSelected.background = backgroundData.preview;
  //     console.log(`..: RightPanel background file ${backgroundData.file}`);
  //   }
  // };

  const handleChangeCameraView = (value: boolean) => {
    if (elementSelected) {
      const updatedElement = { ...elementSelected, showCamera: value };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
    }
  };

  const handleChangeCameraPosition = (axis: 'x' | 'y', value: number | null) => {
    if (!elementSelected) return;

    const cameraPosition = {
      x: Number(elementSelected.cameraPosition?.x) || 0,
      y: Number(elementSelected.cameraPosition?.y) || 0,
      [axis]: Number(value) || 0,
    };
    const updatedElement = { ...elementSelected, cameraPosition };
    setElementSelected(updatedElement);
    setScenes(prevScenes => prevScenes.map(scene =>
      scene.id === updatedElement.id
        ? { ...scene, ...updatedElement, _saved: false }
        : scene
    ));
  };

  const handleSceneNameChange = (name: string) => {
    const scene = scenes.find(item => item.id === elementSelected.id);
    if (!scene) return;
    setElementSelected({ ...scene, name, _saved: false });
    setScenes(previous => previous.map(item => item.id === scene.id ? { ...item, name, _saved: false } : item));
  };

  const handleMapSizeChange = (dimension: 'width' | 'height', value: number, elementId: string) => {
    // World tile editing uses 8×8 GBA tiles. Persist those exact dimensions
    // so reopening a scene does not grow its map by treating them as 16×16.
    const minTiles = dimension === 'width' ? 30 : 20;
    const maxTiles = 128;
    const tileSize = TILE_SIZE;
    
    // Ensure value is multiple of tile size and within bounds
    const clampedValue = Math.max(minTiles, Math.min(maxTiles, Math.floor(value / tileSize)));
    const pixelValue = clampedValue * tileSize;
    
    const latestScene = scenes.find(scene => scene.id === elementId) ?? elementSelected;
    if (!latestScene) return;
    if (dimension === 'width') {
      setMapWidth(clampedValue);
      const updatedElement = { ...latestScene, width: pixelValue };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => {
        if (scene.id === elementId) {
          return { ...scene, width: pixelValue, _saved: false };
        }
          return scene;
        })
      );
    } else {
      setMapHeight(clampedValue);
      const updatedElement = { ...latestScene, height: pixelValue };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => {
        if (scene.id === elementId) {
          return { ...scene, height: pixelValue, _saved: false };
        }
          return scene;
        })
      );
    }

  };

  const sceneTypes = [
    { label: 'Top Down', value: ETypeScene.TOPDOWN },
    { label: 'Platformer', value: ETypeScene.PLATFORM },
    { label: 'Adventure', value: ETypeScene.ADVENTURE },
    // TODO(restore-shooter-game): uncomment to let users create/edit Shooter scenes.
    // { label: 'Shooter', value: ETypeScene.SHOOTER },
    { label: 'Point Click', value: ETypeScene.POINTNCLICK },
    { label: 'Logo', value: ETypeScene.LOGO }
  ];

  const imageTypes = [
    { icon: <BgColorsOutlined />, label: 'Palette Bitmap BG', value: EImageType.PALETTE_BITMAP_BG },
    { icon: <PictureOutlined />, label: 'DP Direct Bitmap BG', value: EImageType.DP_DIRECT_BITMAP_BG }
  ];

  const tilesets = availableTilesets;
  const paletteLibrary = palettes.palettes.length ? palettes.palettes : loadPaletteLibrary();
  const paletteOptions = getPreviewPalettes(paletteLibrary, settings?.colorPaletteIds);
  const selectablePaletteSlots = getPaletteSlotOptions(paletteLibrary, settings?.colorPaletteIds);
  const fallbackColorizePaletteIds = [...new Set(
    (elementSelected?.backgrounds ?? [])
      .flatMap(layer => layer.tilePaletteIds ?? [])
      .flat()
      .filter((paletteId): paletteId is string => Boolean(paletteId) && paletteId !== '__original__'),
  )].slice(0, 16);
  const colorizeUsage = settingUtils.colorizePaletteUsage?.sceneId === elementSelected?.id ? settingUtils.colorizePaletteUsage : undefined;
  const colorizePaletteIds = colorizeUsage?.colorizePaletteIds ?? fallbackColorizePaletteIds;
  const originalColorizeSlots = Math.min(16, colorizeUsage?.originalSlots ?? 0);
  const colorizeUsedSlots = Math.min(16, colorizeUsage?.usedSlots ?? colorizePaletteIds.length);

  const handleImageTypeChange = (value: EImageType) => {
    if (elementSelected) {
      const updatedElement = { ...elementSelected, imageType: value };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
    }
  };

  const handleRenderModeChange = (value: 'regular_tilemap' | 'palette_bitmap' | 'direct_bitmap') => {
    if (!elementSelected) return;
    const requiredMode = isSingleLayerScene ? 'direct_bitmap' : 'regular_tilemap';
    const renderMode = requiredMode;
    const imageType = renderMode === 'direct_bitmap'
      ? EImageType.DP_DIRECT_BITMAP_BG
      : renderMode === 'palette_bitmap'
        ? EImageType.PALETTE_BITMAP_BG
        : undefined;
    const updatedElement = { ...elementSelected, renderMode, imageType, _saved: false };
    setElementSelected(updatedElement);
    setScenes(prevScenes => prevScenes.map(scene => scene.id === updatedElement.id ? updatedElement : scene));
  };

  const handleTilesetChange = (value: string) => {
    if (elementSelected) {
      const editingLayerId = settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0;
      const currentLayer = elementSelected.backgrounds?.find(layer => layer.layerId === editingLayerId);
      const currentMap = currentLayer?.tileMap ?? (editingLayerId === 0 ? elementSelected.tileMap : undefined);
      const previousTilesetId = currentLayer?.selectedTilesetId ?? elementSelected.selectedTilesetId ?? null;
      const currentTilesetIds = currentMap?.map((row, rowIndex) => row.map((tile, colIndex) => currentLayer?.tileMapTilesetIds?.[rowIndex]?.[colIndex] ?? (tile >= 0 ? previousTilesetId : null)));
      const layerChanges = {
        selectedTilesetId: value,
        selectedTiles: [],
        ...(currentMap ? { tileMap: currentMap, tileMapTilesetIds: currentTilesetIds } : {}),
      };
      const backgrounds = isEditingTiles
        ? (elementSelected.backgrounds?.some(layer => layer.layerId === editingLayerId)
          ? elementSelected.backgrounds.map(layer => layer.layerId === editingLayerId ? { ...layer, ...layerChanges } : layer)
          : [...(elementSelected.backgrounds ?? []), { layerId: editingLayerId, ...layerChanges }])
        : elementSelected.backgrounds;
      const updatedElement = { ...elementSelected, selectedTilesetId: value, selectedTiles: [], ...(isEditingTiles && currentMap ? { tileMap: undefined } : {}), backgrounds };
      setSelectedTiles([]);
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
    }
  };

  const handleRemoveLayerTileset = (tilesetId: string) => {
    if (!elementSelected) return;
    const layer = activeTilesetLayer ?? { layerId: editingTilesetLayerId, selectedTilesetId: elementSelected.selectedTilesetId };
    const map = (layer.tileMap ?? (editingTilesetLayerId === 0 ? elementSelected.tileMap : undefined) ?? []).map(row => [...row]);
    const tilesetIds = map.map((row, rowIndex) => row.map((tile, colIndex) => layer.tileMapTilesetIds?.[rowIndex]?.[colIndex] ?? (tile >= 0 ? layer.selectedTilesetId ?? elementSelected.selectedTilesetId ?? null : null)));
    const paletteIds = map.map((row, rowIndex) => row.map((_, colIndex) => layer.tilePaletteIds?.[rowIndex]?.[colIndex] ?? null));
    const removedIndices = new Set<number>();
    const columns = map[0]?.length ?? 0;
    map.forEach((row, rowIndex) => row.forEach((tile, colIndex) => {
      if (tile < 0 || tilesetIds[rowIndex][colIndex] !== tilesetId) return;
      row[colIndex] = -1;
      tilesetIds[rowIndex][colIndex] = null;
      paletteIds[rowIndex][colIndex] = null;
      removedIndices.add(rowIndex * columns + colIndex);
    }));
    const remainingTilesetIds = usedTilesetIds.filter(id => id !== tilesetId);
    const backgrounds = (elementSelected.backgrounds?.some(item => item.layerId === editingTilesetLayerId)
      ? elementSelected.backgrounds.map(item => item.layerId === editingTilesetLayerId ? {
      ...item,
      ...layer,
      tileMap: map,
      tileMapTilesetIds: tilesetIds,
      tilePaletteIds: paletteIds,
      tileMapCellOverrides: (item.tileMapCellOverrides ?? []).filter(override => !removedIndices.has(override.index)),
      selectedTilesetId: item.selectedTilesetId === tilesetId ? remainingTilesetIds[0] : item.selectedTilesetId,
      ...(item.selectedTilesetId === tilesetId ? { selectedTiles: [] } : {}),
    } : item)
      : [...(elementSelected.backgrounds ?? []), { ...layer, tileMap: map, tileMapTilesetIds: tilesetIds, tilePaletteIds: paletteIds }]);
    const updatedElement = {
      ...elementSelected,
      selectedTilesetId: elementSelected.selectedTilesetId === tilesetId ? remainingTilesetIds[0] : elementSelected.selectedTilesetId,
      ...(elementSelected.selectedTilesetId === tilesetId ? { selectedTiles: [] } : {}),
      backgrounds,
      _saved: false,
    };
    setElementSelected(updatedElement);
    setScenes(previous => previous.map(scene => scene.id === updatedElement.id ? updatedElement : scene));
    setSettingUtils(previous => previous.tileSourceHover?.tilesetId === tilesetId ? { ...previous, tileSourceHover: null } : previous);
  };

  const handleAutoTileSlotsChange = (slots: AutoTileSlot[]) => {
    slots.forEach((slot, index) => {
      const previous = settings?.autoTileSlots?.[index];
      if (slot.autoTileId !== previous?.autoTileId || slot.tileSize !== (previous?.tileSize ?? 16) || slot.parts.some((part, partIndex) => part !== previous?.parts?.[partIndex])) {
        modifiedAutoTileSlotsRef.current.add(index);
      }
    });
    setSettings(previous => ({ ...previous, autoTileSlots: slots, _saved: false }));
  };

  const handleAutoTileConfigurationClose = (slots: AutoTileSlot[], sourceImages: Record<string, AutoTileTilesetImage>) => {
    const changedSlots = new Set(modifiedAutoTileSlotsRef.current);
    modifiedAutoTileSlotsRef.current.clear();
    if (!changedSlots.size) return;

    const recomposeScenes = (images: Record<string, AutoTileTilesetImage>) => {
      const updatedScenes = scenes.map(scene => {
        let sceneChanged = false;
        const backgrounds = scene.backgrounds?.map(layer => {
          if (!layer.autoTileMap?.some(row => row.some(slotIndex => changedSlots.has(slotIndex)))) return layer;
          const columns = Math.max(layer.tileMap?.[0]?.length ?? 0, Math.ceil(scene.width / 8));
          const rows = Math.max(layer.tileMap?.length ?? 0, Math.ceil(scene.height / 8));
          const tileMap = Array.from({ length: rows }, (_, rowIndex) => Array.from({ length: columns }, (_, colIndex) => layer.tileMap?.[rowIndex]?.[colIndex] ?? -1));
          const tilesetIds = Array.from({ length: rows }, (_, rowIndex) => Array.from({ length: columns }, (_, colIndex) => layer.tileMapTilesetIds?.[rowIndex]?.[colIndex] ?? null));
          const autoTileMap = layer.autoTileMap.map(row => [...row]);
          const updatedIndices = new Set<number>();

          autoTileMap.forEach((row, autoRow) => row.forEach((slotIndex, autoCol) => {
            if (!changedSlots.has(slotIndex)) return;
            const slot = slots[slotIndex];
            const parts = slot?.parts ?? [];
            const tileIndexFallback = parts.find(part => part != null) ?? null;
            const imageData = slot?.autoTileId ? images[slot.autoTileId] : undefined;
            const image = imageData?.image;
            const imageWidth = image && 'naturalWidth' in image ? image.naturalWidth : image?.width ?? 0;
            const factor = Math.max(1, (slot?.tileSize ?? 16) / 8);
            const sourceColumns = Math.floor(imageWidth / (factor * 8));
            const mapCol = autoCol;
            const mapRow = autoRow;
            for (let dy = 0; dy < factor; dy += 1) for (let dx = 0; dx < factor; dx += 1) {
              const col = mapCol + dx;
              const r = mapRow + dy;
              if (col < columns && r < rows) updatedIndices.add(r * columns + col);
            }
            if (!parts.some(part => part != null) || !image || sourceColumns < 1) {
              autoTileMap[autoRow][autoCol] = -1;
              for (let dy = 0; dy < factor; dy += 1) for (let dx = 0; dx < factor; dx += 1) {
                const col = mapCol + dx;
                const r = mapRow + dy;
                if (col < columns && r < rows) {
                  tileMap[r][col] = -1;
                  tilesetIds[r][col] = null;
                }
              }
              return;
            }
            const mask = getBlob47Mask((dx, dy) => autoTileMap[autoRow + dy * factor]?.[autoCol + dx * factor] === slotIndex);
            const partIndex = BLOB47_MASK_INDEX.get(mask) ?? BLOB47_MASKS.length - 1;
            const tileIndex = parts[partIndex] ?? tileIndexFallback;
            if (tileIndex == null) return;
            const sourceCol = tileIndex % sourceColumns;
            const sourceRow = Math.floor(tileIndex / sourceColumns);
            const sourceKey = toAutoTileSourceKey(slot.autoTileId!);
            for (let dy = 0; dy < factor; dy += 1) for (let dx = 0; dx < factor; dx += 1) {
              const col = mapCol + dx;
              const r = mapRow + dy;
              if (col >= columns || r >= rows) continue;
              tileMap[r][col] = (sourceRow * factor + dy) * Math.floor(imageWidth / 8) + sourceCol * factor + dx;
              tilesetIds[r][col] = sourceKey;
            }
          }));

          sceneChanged = true;
          return {
            ...layer,
            tileMap,
            tileMapTilesetIds: tilesetIds,
            autoTileMap,
            autoTileMapVersion: 1 as const,
            tileMapCellOverrides: (layer.tileMapCellOverrides ?? []).filter(override => !updatedIndices.has(override.index)),
          };
        });
        return sceneChanged ? { ...scene, backgrounds, _saved: false } : scene;
      });
      setScenes(updatedScenes);
      const updatedSelection = elementSelected && updatedScenes.find(scene => scene.id === elementSelected.id);
      if (updatedSelection && updatedSelection !== elementSelected) setElementSelected(updatedSelection);
    };

    const missingIds = [...changedSlots]
      .map(index => slots[index]?.autoTileId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0 && !sourceImages[id]);
    if (!missingIds.length) {
      recomposeScenes(sourceImages);
      return;
    }
    const scope = settingUtils.projectPathFile ?? settingUtils.localImagePath;
    void loadAutoTileAssets(scope).then(async assets => {
      const loaded = { ...sourceImages };
      await Promise.all([...new Set(missingIds)].map(async id => {
        const asset = assets.find(item => item.id === id);
        if (!asset) return;
        const image = new Image();
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`Unable to load autotile image ${id}`));
          image.src = asset.path;
        });
        loaded[id] = { image, source: asset.path, width: image.naturalWidth, height: image.naturalHeight };
      }));
      recomposeScenes(loaded);
    }).catch(error => console.error('Unable to refresh autotile cells after configuration:', error));
  };

  const handleAutoTileSlotRemoval = (removedIndex: number, slots: AutoTileSlot[]) => {
    setSettings(previous => ({ ...previous, autoTileSlots: slots, _saved: false }));
    setScenes(previous => previous.map(scene => {
      if (!scene.backgrounds?.some(layer => layer.autoTileMap)) return scene;
      return {
        ...scene,
        backgrounds: scene.backgrounds.map(layer => layer.autoTileMap
          ? { ...layer, autoTileMap: layer.autoTileMap.map(row => row.map(slotIndex => slotIndex === removedIndex ? -1 : slotIndex > removedIndex ? slotIndex - 1 : slotIndex)) }
          : layer),
        _saved: false,
      };
    }));
    setSettingUtils(previous => {
      const selection = previous.selectedAutoTileSlot;
      if (!selection) return previous;
      if (selection.slotIndex === removedIndex) return { ...previous, selectedAutoTileSlot: null };
      return selection.slotIndex > removedIndex
        ? { ...previous, selectedAutoTileSlot: { ...selection, slotIndex: selection.slotIndex - 1 } }
        : previous;
    });
  };

  const handleSelectAutoTileSlot = (slotIndex: number) => {
    if (!elementSelected) return;
    setSelectedTiles([]);
    const backgrounds = elementSelected.backgrounds?.map(layer =>
      layer.layerId === editingTilesetLayerId ? { ...layer, selectedTiles: [] } : layer,
    );
    const updatedElement = { ...elementSelected, selectedTiles: [], backgrounds, _saved: false };
    setElementSelected(updatedElement);
    setScenes(previous => previous.map(scene => scene.id === updatedElement.id ? updatedElement : scene));
    setSettingUtils(previous => ({
      ...previous,
      selectedAutoTileSlot: { sceneId: elementSelected.id, slotIndex },
      activeButton: 'tiles',
      activeSubButton: 'pencil',
    }));
  };

  const handleTilesetCellSizeChange = (size: 8 | 16 | 32) => {
    updateTilesetView({ cellSize: size });
    if (tilesetViewMode !== 'autoTiles' || !elementSelected) return;
    const currentIndex = settingUtils.selectedAutoTileSlot?.sceneId === elementSelected.id
      ? settingUtils.selectedAutoTileSlot?.slotIndex : undefined;
    const available = (slot: AutoTileSlot | undefined) => Boolean(slot && (slot.tileSize ?? 16) === size && slot.parts.some(part => part != null));
    const nextIndex = currentIndex !== undefined && available(autoTileSlots[currentIndex])
      ? currentIndex : autoTileSlots.findIndex(available);
    if (nextIndex >= 0) handleSelectAutoTileSlot(nextIndex);
    else setSettingUtils(previous => ({ ...previous, selectedAutoTileSlot: null }));
  };

  const handleSceneTypeChange = (value: string) => {
    if (!elementSelected) 
      return;

    // função auxiliar para validar backgrounds
    const validChangeBackgrounds = (): IBackgroundElement[] | undefined => {
      const isHDScene = value === ETypeScene.LOGO || value === ETypeScene.POINTNCLICK;
      const elementSelectIsHD = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;

      if (elementSelectIsHD != isHDScene) {
        // zera todos os backgrounds
        return elementSelected.backgrounds?.map((bg: IBackgroundElement) => ({
          ...bg,
          backgroundId: null,
          name: "",
          path: ""
        }));
      }
      // mantém os backgrounds atuais
      return elementSelected.backgrounds;
    };

    const updatedElement = { 
      ...elementSelected, 
      sceneType: value,
      renderMode: value === ETypeScene.LOGO || value === ETypeScene.POINTNCLICK ? 'direct_bitmap' : 'regular_tilemap',
      imageType: value === ETypeScene.LOGO || value === ETypeScene.POINTNCLICK ? EImageType.DP_DIRECT_BITMAP_BG : undefined,
      backgrounds: validChangeBackgrounds(),
      _saved: false
    };

    setElementSelected(updatedElement);
    setScenes(prevScenes => prevScenes.map(scene => 
      scene.id === updatedElement.id 
        ? { ...scene, ...updatedElement } 
        : scene
    ));
  }

  // Initialize tileset image
  useEffect(() => {
    const layerId = settingUtils.tileEditLayerId ?? elementSelected?.backgrounds?.[0]?.layerId ?? 0;
    const selectedTilesetId = elementSelected?.backgrounds?.find(layer => layer.layerId === layerId)?.selectedTilesetId ?? elementSelected?.selectedTilesetId;
    let cancelled = false;
    const loadTilesetImage = async () => {
      if (selectedTilesetId) {
        try {
          // Load tileset image from project assets
          const selectedTilesetFile = (await loadTilesetAssets(settingUtils.projectPathFile ?? settingUtils.localImagePath)).find(asset => asset.id === selectedTilesetId);
          if (selectedTilesetFile) {
              const imagePath = selectedTilesetFile.path;
              const img = new Image();
              img.onload = async () => {
                // Calculate tileset dimensions based on actual image size
                const tileWidth = 8;
                const tileHeight = 8;
                const columns = Math.floor(img.naturalWidth / tileWidth);
                const rows = Math.floor(img.naturalHeight / tileHeight);
                const previewImage = await loadPaletteTransparentImage(imagePath);
                if (cancelled) return;
                setTileset({
                  image: previewImage ?? img,
                  tileWidth,
                  tileHeight,
                  columns,
                  rows,
                  source: imagePath,
                });
                // drawTileset();
              };
              img.onerror = () => setTileset({ image: new Image(), tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, columns: 0, rows: 0, source: imagePath });
              img.src = imagePath;
          } else {
            setTileset({ image: new Image(), tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, columns: 0, rows: 0 });
          }
        } catch (error) {
          console.error('Error loading tileset:', error);
          setTileset({ image: new Image(), tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, columns: 0, rows: 0 });
        }
      }
    };

    if (!selectedTilesetId) {
      setTileset({ image: new Image(), tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, columns: 0, rows: 0 });
    }
    loadTilesetImage();
    return () => { cancelled = true; };
  }, [elementSelected?.backgrounds, elementSelected?.selectedTilesetId, settingUtils.localImagePath, settingUtils.tileEditLayerId, assetReloadVersion]);

  const drawTileset = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Desliga o filtro de suavização
    ctx.imageSmoothingEnabled = false;

    if (!tileset.columns || !tileset.rows) return;

    canvas.width = tilesetCanvasWidth;
    canvas.height = tilesetCanvasHeight;

    ctx.fillStyle = token.colorBgContainer;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // If tileset image is loaded, draw it
    const imageWidth = 'naturalWidth' in tileset.image ? tileset.image.naturalWidth : tileset.image.width;
    const imageHeight = 'naturalHeight' in tileset.image ? tileset.image.naturalHeight : tileset.image.height;
    const imageLoaded = !('complete' in tileset.image) || tileset.image.complete;
    if (imageLoaded && imageWidth > 0) {
      for (let cellRow = 0; cellRow < tilesetDisplayRows; cellRow++) {
        for (let cellColumn = 0; cellColumn < tilesetDisplayColumns; cellColumn++) {
          const sourceX = cellColumn * tilesetCellSize;
          const sourceY = cellRow * tilesetCellSize;
          const sourceWidth = Math.min(tilesetCellSize, imageWidth - sourceX);
          const sourceHeight = Math.min(tilesetCellSize, imageHeight - sourceY);
          if (sourceWidth <= 0 || sourceHeight <= 0) continue;
          const destinationX = cellColumn * tilesetCellSize;
          const destinationY = cellRow * tilesetCellSize;
          ctx.drawImage(tileset.image, sourceX, sourceY, sourceWidth, sourceHeight, destinationX, destinationY, sourceWidth, sourceHeight);
        }
      }
    }

  }, [tileset, tilesetCellSize, tilesetDisplayColumns, tilesetDisplayRows, tilesetCanvasWidth, tilesetCanvasHeight, token.colorBgContainer]);

  useEffect(() => {
    if (tilesetViewMode === 'tileset') drawTileset();
  }, [drawTileset, tilesetViewMode]);

  const handleTilesetPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button === 1) {
      const viewport = tilesetViewportRef.current;
      if (!viewport) return;
      e.preventDefault();
      tilesetPanStartRef.current = { x: e.clientX, y: e.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop };
      setIsPanningTileset(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const scale = tilesetZoom / 100;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    const col = Math.max(0, Math.min(tilesetDisplayColumns - 1, Math.floor(x / tilesetCellSize)));
    const row = Math.max(0, Math.min(tilesetDisplayRows - 1, Math.floor(y / tilesetCellSize)));

    tilesetSelectionRef.current = { start: { x: col, y: row }, end: { x: col, y: row }, extend: e.shiftKey };
    setSelectionStart({ x: col, y: row });
    setSelectionEnd({ x: col, y: row });
    setIsSelecting(true);
  };

  const handleTilesetPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tilesetPanStartRef.current) {
      const viewport = tilesetViewportRef.current;
      if (!viewport) return;
      viewport.scrollLeft = tilesetPanStartRef.current.scrollLeft - (e.clientX - tilesetPanStartRef.current.x);
      viewport.scrollTop = tilesetPanStartRef.current.scrollTop - (e.clientY - tilesetPanStartRef.current.y);
      return;
    }
    if (!isSelecting) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scale = tilesetZoom / 100;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    const col = Math.max(0, Math.min(tilesetDisplayColumns - 1, Math.floor(x / tilesetCellSize)));
    const row = Math.max(0, Math.min(tilesetDisplayRows - 1, Math.floor(y / tilesetCellSize)));

    tilesetSelectionRef.current.end = { x: col, y: row };
    setSelectionEnd({ x: col, y: row });
  };

  const handleTilesetPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (tilesetPanStartRef.current) {
      tilesetPanStartRef.current = null;
      setIsPanningTileset(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (!isSelecting) return;

    setIsSelecting(false);

    const layerId = editingTilesetLayerId;
    const layerSelectedTiles = elementSelected?.backgrounds?.find(layer => layer.layerId === layerId)?.selectedTiles ?? elementSelected?.selectedTiles ?? [];
    const gesture = tilesetSelectionRef.current;
    const anchorTile = gesture.extend ? layerSelectedTiles[0] : undefined;
    const anchorCell = anchorTile === undefined ? gesture.start : {
      x: Math.floor((anchorTile % tileset.columns) / tilesPerCell),
      y: Math.floor(Math.floor(anchorTile / tileset.columns) / tilesPerCell),
    };
    const startCol = Math.min(anchorCell.x, gesture.end.x);
    const endCol = Math.max(anchorCell.x, gesture.end.x);
    const startRow = Math.min(anchorCell.y, gesture.end.y);
    const endRow = Math.max(anchorCell.y, gesture.end.y);

    const newlySelectedTiles: number[] = [];
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        for (let tileRow = 0; tileRow < tilesPerCell; tileRow++) {
          const baseRow = row * tilesPerCell + tileRow;
          if (baseRow >= tileset.rows) continue;
          for (let tileColumn = 0; tileColumn < tilesPerCell; tileColumn++) {
            const baseCol = col * tilesPerCell + tileColumn;
            if (baseCol >= tileset.columns) continue;
            newlySelectedTiles.push(baseRow * tileset.columns + baseCol);
          }
        }
      }
    }

    const newSelectedTiles = gesture.extend
      ? Array.from(new Set([...layerSelectedTiles, ...newlySelectedTiles]))
      : newlySelectedTiles;
    setSelectedTiles(newSelectedTiles);
    setSettingUtils(previous => ({ ...previous, selectedAutoTileSlot: null, activeButton: 'tiles', activeSubButton: 'pencil' }));

    // Update elementSelected with selected tiles
    if (elementSelected) {
      const updatedElement = { ...elementSelected, selectedTiles: newSelectedTiles, backgrounds: elementSelected.backgrounds?.some(layer => layer.layerId === layerId) ? elementSelected.backgrounds.map(layer => layer.layerId === layerId ? { ...layer, selectedTiles: newSelectedTiles } : layer) : [...(elementSelected.backgrounds ?? []), { layerId, selectedTiles: newSelectedTiles }] };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
    }
  };

  const handleTilesetPointerCancel = () => {
    tilesetPanStartRef.current = null;
    setIsPanningTileset(false);
    setIsSelecting(false);
  };
  
  useEffect(() => {
    if (!backgroundPanelLayerIds.includes(Number(activeLayerKey))) setActiveLayerKey(String(backgroundPanelLayerIds[0] ?? 2));
  }, [activeLayerKey, elementSelected?.sceneType, elementSelected?.backgrounds]);

  if (!elementSelected) {
    return (
      <Content style={{ padding: token.padding }}>
        <RightPanelGWSettings controllerView={controllerView}/>
      </Content>
    );
  }

  if (selectedScenes.length > 1) {
    return (
      <Content style={{ padding: token.padding }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Typography.Text strong>Group movement</Typography.Text>
          <Typography.Text type="secondary">{selectedScenes.length} scenes selected. The last selected scene ({elementSelected.name}) is active.</Typography.Text>
          <Flex justify="center" gap={8}><Button onClick={() => moveSelectedScenes(0, -16)}>↑</Button></Flex>
          <Flex justify="center" gap={8}><Button onClick={() => moveSelectedScenes(-16, 0)}>←</Button><Button onClick={() => moveSelectedScenes(16, 0)}>→</Button></Flex>
          <Flex justify="center" gap={8}><Button onClick={() => moveSelectedScenes(0, 16)}>↓</Button></Flex>
          <Typography.Text type="secondary">Each command moves the selected scenes 16 px.</Typography.Text>
        </Space>
      </Content>
    );
  }

  if (elementSelected._resourceType === 'variables') {
    const variable = elementSelected as IVariableDefinition;
    return (
      <Content>
        <VariableSettingsForm variable={variable} />
      </Content>
    );
  }

  if (elementSelected._resourceType === 'script') {
    return <ScriptSettingsForm script={elementSelected as IScriptDefinition} />;
  }

  if (elementSelected._resourceType === 'prefab') {
    return <PrefabSettingsForm prefab={elementSelected as IPrefabDefinition} availableSprites={availablePlayerSprites} availableTilesets={availableTilesets} />;
  }

  if (settingUtils.activeSceneObject) {
    return <SceneObjectSettingsForm
      sceneId={settingUtils.activeSceneObject.sceneId}
      type={settingUtils.activeSceneObject.type}
      objectId={settingUtils.activeSceneObject.id}
      availableSprites={availablePlayerSprites}
      availableTilesets={availableTilesets}
    />;
  }

  const getSceneScripts = scenes.find(scene => scene.id === elementSelected.id)?.script?.map((script) => script);
  const getPlayerHitScripts = (groupKey: string): IScriptsElement[] | undefined => {
    const scene = scenes.find(s => s.id === elementSelected.id);
    if (!scene) return;

    switch (groupKey) {
      case "playerHit1Script":
        return scene.playerHit1Script?.map(s => s);
      case "playerHit2Script":
        return scene.playerHit2Script?.map(s => s);
      case "playerHit3Script":
        return scene.playerHit3Script?.map(s => s);
      default:
        return [];
    }
  };  

  return (
    <Content>
      <Space direction="vertical" size={0} style={{ width: '100%', minWidth: 0, alignItems: 'stretch' }}>
        <ResourceNameInput name={elementSelected.name || ''} defaultName={`SCENE_${elementSelected._index}`} label={t('scene.name')} onChange={handleSceneNameChange} />
        <Divider style={{ margin: 0 }} />
      </Space>
      <Space direction="vertical" style={{ width: '100%' }}>
        {isEditingTiles ? (
          // Tiles Editor Mode - Scene properties + tileset selector
          <Space direction="vertical" style={{ width: '100%', padding: 10 }}>
            <Tabs
              className="gba-background-tabs"
              type="card"
              size="small"
              animated={false}
              activeKey={String(settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0)}
              items={[...editableLayerIds.map(layerId => ({ key: String(layerId), label: `Layer ${layerId}`, disabled: isSingleLayerScene })), { key: String(EVENTS_LAYER_ID), label: attentionLabel('Events', eventsLayerAttentionCount) }]}
              onChange={layerId => setSettingUtils(previous => ({
                ...previous,
                tileEditLayerId: Number(layerId),
                ...(Number(layerId) === EVENTS_LAYER_ID && (previous.activeButton === 'tiles' || previous.activeButton === 'colorize')
                  ? { activeButton: 'select', activeSubButton: '' }
                  : {}),
              }))}
            />
            {isEventsLayer ? (
              <Alert
                type="info"
                showIcon
                message="Events layer"
                description="Use this layer to create, select, or erase scene events. Erase removes collisions, actors, triggers, and spawn points here; it does not change tiles."
              />
            ) : <>
            <Typography.Title level={5}>Tileset</Typography.Title>
            <Content style={{ width: '100%', height: '100%' }}>
              <Space direction="vertical" >
                <Space>
                  <span>{t('tiles.selectedCount', { count: selectedTiles.length })}</span>
                  <span>Map size: {mapWidth * TILE_SIZE} x {mapHeight * TILE_SIZE} px</span>
                </Space>
                <Space direction="vertical" size="small">
                  <span><strong>Map Size (in tiles):</strong></span>
                  <Space>
                    <div>
                      <InputNumber
                        addonBefore="W"
                        min={30}
                        max={128}
                        value={mapWidth}
                        onChange={(value) => handleMapSizeChange('width', (value || 30) * TILE_SIZE, elementSelected.id)}
                        formatter={(value) => `${value} tiles`}
                        parser={(value) => parseInt(value?.replace(' tiles', '') || '30')}
                      />
                    </div>
                    <div>
                      <InputNumber
                        addonBefore="H"
                        min={20}
                        max={128}
                        value={mapHeight}
                        onChange={(value) => handleMapSizeChange('height', (value || 20) * TILE_SIZE, elementSelected.id)}
                        formatter={(value) => `${value} tiles`}
                        parser={(value) => parseInt(value?.replace(' tiles', '') || '20')}
                      />
                    </div>
                    <Checkbox checked={tilesetViewById[activeTilesetId]?.showGrid ?? true} onChange={event => updateTilesetViewForId(activeTilesetId, { showGrid: event.target.checked })}>{t('tiles.grid')}</Checkbox>
                  </Space>
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    Minimum: 240x160px (30x20 tiles) | Maximum: 1024x1024px (128x128 tiles)
                  </span>
                </Space>
              </Space>
            </Content>
            <div style={{ position: 'relative', width: '100%' }}>
              <Segmented
                block
                size="small"
                value={tilesetViewMode}
                options={[{ value: 'tileset', label: t('tiles.viewTileset') }, { value: 'autoTiles', label: <span style={{ display: 'inline-block', paddingRight: 22 }}>{t('tiles.viewAutoTiles')}</span> }]}
                onChange={value => setTilesetViewMode(value as 'tileset' | 'autoTiles')}
              />
              {tilesetViewMode === 'autoTiles' && <Tooltip title={t('tiles.autoTileSettings')}>
                <Button
                  type="text"
                  size="small"
                  aria-label={t('tiles.autoTileSettings')}
                  icon={<SettingOutlined />}
                  onPointerDown={event => event.stopPropagation()}
                  onClick={event => { event.stopPropagation(); setAutoTileConfigSignal(signal => signal + 1); }}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', zIndex: 2, paddingInline: 5, height: 22 }}
                />
              </Tooltip>}
            </div>
            <Content ref={tilesetViewportRef} style={{
              width: '100%', 
              height: 280,
              minHeight: 280,
              maxHeight: 280,
              flex: '0 0 280px',
              boxSizing: 'border-box',
              backgroundColor: token.colorBgContainer,
              overflow: 'auto',
              position: 'relative'
            }}>
              {tilesetViewMode === 'tileset' ? <>
              {tileset.columns > 0 && tileset.rows > 0 ? <canvas
                  ref={canvasRef}
                  width={tilesetCanvasWidth}
                  height={tilesetCanvasHeight}
                  onPointerDown={handleTilesetPointerDown}
                  onPointerMove={handleTilesetPointerMove}
                  onPointerUp={handleTilesetPointerUp}
                  onPointerCancel={handleTilesetPointerCancel}
                  onContextMenu={event => event.preventDefault()}
                  title="Segure o botão do meio e arraste para mover a visualização"
                  style={{ cursor: isPanningTileset ? 'grabbing' : 'crosshair', display: 'block', imageRendering: 'pixelated', touchAction: 'none', width: `${tilesetCanvasWidth * tilesetZoom / 100}px`, height: `${tilesetCanvasHeight * tilesetZoom / 100}px` }}
                /> : <div
                  role="img"
                  aria-label="No Data"
                  style={{ minHeight: 160, minWidth: 240, display: 'grid', placeItems: 'center', color: '#999', fontSize: 16, userSelect: 'none' }}
                ><img src={imgPlaceholder} alt="No Data" style={{ width: 96, height: 96, objectFit: 'contain', opacity: .7 }} /></div>}
              {tileset.columns > 0 && tileset.rows > 0 && (
                <svg
                  aria-hidden="true"
                  viewBox={`0 0 ${tilesetCanvasWidth} ${tilesetCanvasHeight}`}
                  style={{ position: 'absolute', left: 0, top: 0, width: `${tilesetCanvasWidth * tilesetZoom / 100}px`, height: `${tilesetCanvasHeight * tilesetZoom / 100}px`, pointerEvents: 'none', overflow: 'visible' }}
                >
                  {activeTilesetView.showGrid && Array.from({ length: tilesetDisplayColumns - 1 }, (_, index) => {
                    const x = (index + 1) * tilesetCellSize;
                    return <line key={`v-${x}`} x1={x} y1={0} x2={x} y2={tilesetCanvasHeight} stroke={token.colorBgContainer} strokeWidth={1} vectorEffect="non-scaling-stroke" />;
                  })}
                  {activeTilesetView.showGrid && Array.from({ length: tilesetDisplayRows - 1 }, (_, index) => {
                    const y = (index + 1) * tilesetCellSize;
                    return <line key={`h-${y}`} x1={0} y1={y} x2={tilesetCanvasWidth} y2={y} stroke={token.colorBgContainer} strokeWidth={1} vectorEffect="non-scaling-stroke" />;
                  })}
                  {selectedTileIndexes.map(tileIndex => {
                    const col = tileIndex % tileset.columns;
                    const row = Math.floor(tileIndex / tileset.columns);
                    return <rect key={`selected-${tileIndex}`} x={col * TILE_SIZE} y={row * TILE_SIZE} width={TILE_SIZE} height={TILE_SIZE} fill={token.colorPrimary} fillOpacity={0.2} />;
                  })}
                  {selectedTileBounds && <rect
                    x={selectedTileBounds.minCol * TILE_SIZE}
                    y={selectedTileBounds.minRow * TILE_SIZE}
                    width={(selectedTileBounds.maxCol - selectedTileBounds.minCol + 1) * TILE_SIZE}
                    height={(selectedTileBounds.maxRow - selectedTileBounds.minRow + 1) * TILE_SIZE}
                    fill="none"
                    stroke={token.colorPrimary}
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />}
                </svg>
              )}
              {/* Selection overlay */}
              {isSelecting && (
                <div
                  style={{
                    position: 'absolute',
                    // Selection coordinates refer to the configured tile groups.
                    left: Math.min(selectionStart.x, selectionEnd.x) * tilesetCellSize * tilesetZoom / 100,
                    top: Math.min(selectionStart.y, selectionEnd.y) * tilesetCellSize * tilesetZoom / 100,
                    width: (Math.abs(selectionEnd.x - selectionStart.x) * tilesetCellSize + Math.min(tilesetCellSize, (tileset.columns - Math.max(selectionStart.x, selectionEnd.x) * tilesPerCell) * TILE_SIZE)) * tilesetZoom / 100,
                    height: (Math.abs(selectionEnd.y - selectionStart.y) * tilesetCellSize + Math.min(tilesetCellSize, (tileset.rows - Math.max(selectionStart.y, selectionEnd.y) * tilesPerCell) * TILE_SIZE)) * tilesetZoom / 100,
                    backgroundColor: `color-mix(in srgb, ${token.colorPrimary} 12%, transparent)`,
                    border: `1px solid ${token.colorPrimary}`,
                    boxSizing: 'border-box',
                    pointerEvents: 'none'
                  }}
                />
              )}
              </> : <TilesetAutoTileView
                slots={autoTileSlots}
                autoTiles={availableAutoTiles.map((asset: any) => ({ id: asset.id, name: asset.name }))}
                defaultAutoTileId={availableAutoTiles[0]?.id}
                onChange={handleAutoTileSlotsChange}
                onRemoveSlot={handleAutoTileSlotRemoval}
                onConfigurationClose={handleAutoTileConfigurationClose}
                selectedSlot={settingUtils.selectedAutoTileSlot?.sceneId === elementSelected.id ? settingUtils.selectedAutoTileSlot.slotIndex : null}
                sceneTileSize={tilesetCellSize}
                onSelectSlot={handleSelectAutoTileSlot}
                onHoverSlot={handleHoverAutoTileSlot}
                zoom={tilesetZoom}
                tilesetViews={tilesetViewById}
                onUpdateSourceView={updateTilesetViewForId}
                assetReloadVersion={assetReloadVersion}
                openConfigurationSignal={autoTileConfigSignal}
              />}
            </Content>
            {tilesetViewMode === 'tileset' && <Space direction="vertical" size={2} style={{ width: '100%', paddingInline: 4 }}>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>{t('tiles.viewInstructionSelect')}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>{t('tiles.viewInstructionExtend')}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>{t('tiles.viewInstructionZoom')}</Typography.Text>
            </Space>}
            <Space align="center">
              <span>{t('tiles.tileSize')}</span>
              <Segmented
                size="small"
                value={tilesetCellSize}
                options={[8, 16, 32].map(size => ({ value: size, label: `${size}×${size}` }))}
                onChange={value => handleTilesetCellSizeChange(value as 8 | 16 | 32)}
              />
            </Space>
            {usedTilesetIds.length > 0 && <Flex gap={6} wrap="wrap" aria-label={t('tiles.tilesetsUsed')}>
              {usedTilesetIds.map((tilesetId, index) => {
                const color = getEventDepthColor(index);
                return <Tag
                key={tilesetId}
                style={{ backgroundColor: `color-mix(in srgb, ${color} 22%, ${token.colorBgContainer})`, borderColor: color, color: token.colorText }}
                closable
                onClick={event => {
                  if ((event.target as HTMLElement).closest('.ant-tag-close-icon')) return;
                  handleTilesetChange(tilesetId);
                }}
                onClose={event => { event.preventDefault(); event.stopPropagation(); handleRemoveLayerTileset(tilesetId); }}
                onMouseEnter={() => setSettingUtils(previous => ({ ...previous, tileSourceHover: { sceneId: elementSelected.id, layerId: editingTilesetLayerId, tilesetId, color } }))}
                onMouseLeave={() => setSettingUtils(previous => previous.tileSourceHover?.tilesetId === tilesetId ? { ...previous, tileSourceHover: null } : previous)}
              >{availableTilesets.find(tileset => tileset.id === tilesetId)?.name ?? tilesetId}</Tag>;
              })}
            </Flex>}
            <Select
              placeholder={t('tiles.selectTileset')}
              value={elementSelected.backgrounds?.find(layer => layer.layerId === (settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0))?.selectedTilesetId ?? elementSelected.selectedTilesetId}
              onChange={handleTilesetChange}
              style={{ width: '100%' }}
              options={tilesets.map(ts => ({ label: ts.name, value: ts.id }))}
            />
            <Select
              placeholder="Palette for tile painting"
              value={(() => {
                const id = elementSelected.backgrounds?.find(layer => layer.layerId === (settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0))?.paintPaletteId;
                const slotId = id?.startsWith('__slot__:') ? id : selectablePaletteSlots.find(palette => settings?.colorPaletteIds?.[Number(palette.id.slice(9))] === id)?.id;
                return id ? (selectablePaletteSlots.some(palette => palette.id === slotId) ? slotId : undefined) : '__default__';
              })()}
              onChange={paletteId => {
                const layerId = settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0;
                const backgrounds = elementSelected.backgrounds?.some(layer => layer.layerId === layerId)
                  ? elementSelected.backgrounds.map(layer => layer.layerId === layerId ? { ...layer, paintPaletteId: paletteId === '__default__' ? null : paletteId ?? null } : layer)
                  : [...(elementSelected.backgrounds ?? []), { layerId, paintPaletteId: paletteId === '__default__' ? null : paletteId ?? null }];
                const updated = { ...elementSelected, backgrounds, _saved: false };
                setElementSelected(updated);
                setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
              }}
              options={[{ value: '__default__', label: 'Default (Settings)' }, ...selectablePaletteSlots.map(palette => ({ value: palette.id, label: palette.name }))]}
            />
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <Typography.Text type="secondary">Scene Colorize palette slots ({colorizeUsedSlots}/16)</Typography.Text>
              <Flex gap={6} wrap="wrap" aria-label="Colorize palette slots">
                {Array.from({ length: 16 }, (_, index) => {
                  const isOriginalReservation = index < originalColorizeSlots;
                  const paletteId = isOriginalReservation ? undefined : colorizePaletteIds[index - originalColorizeSlots];
                  const palette = paletteOptions.find(item => item.id === paletteId);
                  return <Tooltip key={String(paletteId ?? `reserved-${index}`)} title={isOriginalReservation ? 'Reserved by original layer colors' : (palette?.name ?? 'Empty slot')} placement="left">
                    <span aria-label={palette ? `Colorize slot ${index + 1}: ${palette.name}` : isOriginalReservation ? `Colorize slot ${index + 1}: reserved by original colors` : `Empty colorize slot ${index + 1}`} style={{ width: 26, height: 26, border: '1px solid #777', borderRadius: 2, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridTemplateRows: 'repeat(4, 1fr)', overflow: 'hidden', opacity: palette || isOriginalReservation ? 1 : .35, background: palette ? undefined : '#222' }}>
                      {palette?.colors?.slice(0, 16).map((color, colorIndex) => <i key={colorIndex} style={{ background: color }} />) ?? (isOriginalReservation && Array.from({ length: 16 }, (_, colorIndex) => <i key={colorIndex} style={{ background: colorIndex % 2 ? '#555' : '#333' }} />))}
                    </span>
                  </Tooltip>;
                })}
              </Flex>
            </Space>
            <Select
              placeholder="Select Render Mode"
              value={isSingleLayerScene ? 'direct_bitmap' : 'regular_tilemap'}
              onChange={handleRenderModeChange}
              disabled
              style={{ width: '100%' }}
              options={isSingleLayerScene
                ? [{ label: 'Direct Bitmap BG', value: 'direct_bitmap' }]
                : [{ label: 'Native Tile Map (Regular BG)', value: 'regular_tilemap' }]}
            >
              
            </Select>
            </>}
          </Space>
        ) : (
          // Game World Mode - Basic scene properties + Tiles Editor button
          <Content>
            <Space direction="vertical" style={{ width: '100%', padding: 10 }}>
              <Typography.Text>Scene type</Typography.Text>
              <Select
                title="Select scene type"
                placeholder="Select scene type"
                value={elementSelected.sceneType || sceneTypes[0].value}
                onChange={handleSceneTypeChange}
                style={{ width: '100%' }}
                options={sceneTypes.map(ts => ({ label: ts.label, value: ts.value }))}
              />
              {/* TODO(restore-shooter-game): restore this Shooter/Combat configuration block when Shooter scenes are re-enabled.
              {(elementSelected.sceneType === ETypeScene.SHOOTER || (settings?.startSceneId === elementSelected.id && hasAssetReferenceWarning(settings?.shooterConfig, 'projectileSpriteId'))) && (
                <>
                  <Button block onClick={() => setShowSceneCombatConfig(value => !value)}>
                    {showSceneCombatConfig ? 'Hide Combat Config' : 'Combat Config'}
                  </Button>
                  {showSceneCombatConfig && <CombatConfigEditor settings={settings} setSettings={setSettings} />}
                  <Button block onClick={() => setShowSceneShooterConfig(value => !value)}>
                    {showSceneShooterConfig ? 'Hide Shooter Config' : 'Shooter Config'}
                  </Button>
                  {(showSceneShooterConfig || (settings?.startSceneId === elementSelected.id && hasAssetReferenceWarning(settings?.shooterConfig, 'projectileSpriteId'))) && <ShooterConfigEditor settings={settings} setSettings={setSettings} />}
                </>
              )}
              */}
              <Typography.Text>Camera View</Typography.Text>
              <Checkbox 
                defaultChecked={elementSelected.showCamera} 
                onChange={check => handleChangeCameraView(check.target.checked)}
              >
                Show Camera on View
              </Checkbox>
              <Flex gap={8} style={{ width: '100%' }}>
                <InputNumber
                  addonBefore="X"
                  step={1}
                  value={elementSelected.cameraPosition?.x ?? 0}
                  onChange={value => handleChangeCameraPosition('x', value)}
                  style={{ flex: 1, minWidth: 0 }}
                />
                <InputNumber
                  addonBefore="Y"
                  step={1}
                  value={elementSelected.cameraPosition?.y ?? 0}
                  onChange={value => handleChangeCameraPosition('y', value)}
                  style={{ flex: 1, minWidth: 0 }}
                />
              </Flex>
              <Divider style={{ margin: `${token.margin}px 0` }} />
              <Typography.Text>Backgrounds</Typography.Text>
              <Tabs 
                className="gba-background-tabs"
                activeKey={activeLayerKey}
                onChange={setActiveLayerKey}
                type="card"
                size={'small'}
                items={backgroundPanelLayerIds.map(key => {
                  const layerId = Number(key);
                  const layer = elementSelected.backgrounds?.find(item => item.layerId === layerId);
                  const layerBackground = backgrounds.find(item => !item._deleted && item.id === layer?.backgroundId);
                  const backgroundAnimationAssets = layerBackground ? [{
                    id: layerBackground.id,
                    name: layerBackground.name,
                    path: joinLocalAssetPath(layerBackground.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath, layerBackground.filename),
                  }] : [];
                  const tileMap = layer?.tileMap ?? (layerId === 0 ? elementSelected.tileMap : undefined) ?? [];
                  const tilesetIds = new Set<string>();
                  tileMap.forEach((row, rowIndex) => row.forEach((tile, colIndex) => {
                    if (tile < 0) return;
                    const tilesetId = layer?.tileMapTilesetIds?.[rowIndex]?.[colIndex] ?? layer?.selectedTilesetId ?? elementSelected.selectedTilesetId;
                    if (tilesetId && !tilesetId.startsWith('auto-tile:')) tilesetIds.add(tilesetId);
                  }));
                  return {
                  key: String(key),
                  label: attentionLabel(`Layer ${key}`, hasAssetReferenceWarning(layer, 'backgroundId') ? 1 : 0),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <BackgroundSelector
                        selectedElementId={elementSelected.id}
                        layerKey={layerId}
                        showPreviewVisibilityToggle
                        tilesetAssets={[...availableTilesets, ...availableAutoTiles.map((asset: any) => ({ id: toAutoTileSourceKey(asset.id), name: asset.name, path: asset.path }))]}
                        hasTilesetTag={tilesetIds.size > 0}
                      />
                      <TileAnimationEditor
                        scene={elementSelected}
                        layerId={layerId}
                        tileset={tileset}
                        tilesetAssets={availableTilesets}
                        backgroundAssets={backgroundAnimationAssets}
                        paletteOptions={paletteOptions}
                        hiddenAnimationIds={(userSettings.hiddenTileAnimations ?? []).filter(key => key.startsWith(`${elementSelected.id}:`)).map(key => key.slice(`${elementSelected.id}:`.length))}
                        onToggleAnimation={id => setUserSettings(previous => {
                          const key = `${elementSelected.id}:${id}`;
                          const hidden = previous.hiddenTileAnimations ?? [];
                          return { ...previous, hiddenTileAnimations: hidden.includes(key) ? hidden.filter(item => item !== key) : [...hidden, key] };
                        })}
                        onSceneChange={updated => {
                          setElementSelected(updated);
                          setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
                        }}
                        onChange={tileAnimations => {
                          const updated = { ...elementSelected, tileAnimations, _saved: false };
                          setElementSelected(updated);
                          setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
                        }}
                      />
                    </Space>
                  ),
                  };
                  })
                }
              />
              <Divider variant="solid" style={{ margin: `${token.margin}px 0` }} />

              { (elementSelected.sceneType !== ETypeScene.LOGO || hasAssetReferenceWarning(settings, 'playerSpriteId')) && (
                <Content>
                <Typography.Text>Player Sprite Sheet</Typography.Text>
                <WarningField warning={hasAssetReferenceWarning(settings, 'playerSpriteId')} message={t('events.missingReference')}>
                <Select
                  title="Select player sprite sheet"
                  placeholder="Select player sprite"
                  allowClear
                  status={hasAssetReferenceWarning(settings, 'playerSpriteId') ? 'warning' : undefined}
                  value={settings?.playerSpriteId ?? undefined}
                  options={availablePlayerSprites.map(sprite => ({
                    value: sprite.id,
                    label: <PlayerSpriteOption name={sprite.id} path={sprite.path} />,
                  }))}
                  onChange={(value) => setSettings(prev => ({ ...prev, playerSpriteId: value ?? null, _saved: false }))}
                  style={{ width: '100%' }}
                />
                </WarningField>
                </Content>
              )}
              
            </Space>

            <AdditionalEventWarnings visibleFields={['script', 'playerHit1Script', 'playerHit2Script', 'playerHit3Script']} value={scenes.find(scene => scene.id === elementSelected.id) ?? elementSelected} onChange={patch => {
              const updated = { ...(scenes.find(scene => scene.id === elementSelected.id) ?? elementSelected), ...patch, _saved: false };
              setElementSelected(updated);
              setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
            }} />
            <Tabs 
              key={settingUtils.referenceTarget?.requestId ?? elementSelected?.id}
              // activeKey={'oninit'}
              // onChange={setActiveLayerKey}
              defaultActiveKey="1"
              type="line"
              size={'small'}
              items={
                [
                  {
                    key: '1',
                    label: attentionLabel(<span style={{ paddingLeft: 8 }}>On Init</span>, countEventAttention(getSceneScripts ?? [])),
                    children: (
                      <Content>
                        <CollapseEventManager scripts={getSceneScripts} />
                        <SelectNewEvent tabIndex={'1'}/>
                      </Content>
                    )
                  },
                  {
                    key: '2',
                    label: attentionLabel('On Player Hit', groupEvents.reduce((total, group) => total + countEventAttention(getPlayerHitScripts(group.key) ?? []), 0)),
                    disabled: true,
                    children: (
                      <Tabs
                        defaultActiveKey={settingUtils.referenceTarget?.tab?.startsWith('hit') ? settingUtils.referenceTarget.tab.slice(-1) : '1'}
                        type="card"
                        size={'small'}
                        items={ groupEvents.map((groupEvent) => (
                          {
                            key: groupEvent.key,
                            label: attentionLabel(groupEvent.label, countEventAttention(getPlayerHitScripts(groupEvent.key) ?? [])),
                            children: (
                              <Content>
                                <CollapseEventManager storageKey={`hit:${groupEvent.key}`} scripts={getPlayerHitScripts(groupEvent.key)} onScriptsChange={events => {
                                  const updatedScene = { ...elementSelected, [groupEvent.key]: events, _saved: false };
                                  setElementSelected(updatedScene);
                                  setScenes(previous => previous.map(scene => scene.id === updatedScene.id ? { ...scene, [groupEvent.key]: events, _saved: false } : scene));
                                }} />
                                <SelectNewEvent subTabIndex={groupEvent.key}/>
                              </Content>
                            )
                          }))
                        }
                      />
                    )
                  }
                ]
              }
            />
          </Content>
        )}
      </Space>
    </Content>
  );
};

function MusicEditorRightPanel() {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { t } = useI18n();
  const { assets, selectedAssetId, setSelectedAssetId, editorInfo, noteSelection, selectedEditorItem } = useMusicEditorWorkspace();
  const selectedAsset = assets.find(asset => asset.id === selectedAssetId);
  const selectionKind = selectedEditorItem?.kind ?? (noteSelection ? 'note' : 'file');
  const [patternNameDraft, setPatternNameDraft] = useState(editorInfo?.patternName ?? '');
  const [patternRowsDraft, setPatternRowsDraft] = useState(editorInfo?.patternRows ?? 64);
  const [assetNameDraft, setAssetNameDraft] = useState((selectedAsset?.projectSource ? selectedAsset.name.split(/[\\/]/).pop() : selectedAsset?.name)?.replace(/\.[^/.]+$/, '') ?? '');
  const [assetNameFocused, setAssetNameFocused] = useState(false);
  const [artistFocused, setArtistFocused] = useState(false);
  const [instrumentColorOpen, setInstrumentColorOpen] = useState(false);
  const sampleAudioInputRef = useRef<HTMLInputElement>(null);
  const [artistDraft, setArtistDraft] = useState('');
  const [instrumentNameDraft, setInstrumentNameDraft] = useState('');
  const renderInstrumentChoice = (id: number, label: React.ReactNode) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, maxWidth: '100%' }}>
    <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', flex: 'none', background: trackerInstrumentHierarchyColor(id, editorInfo?.instrumentCategories ?? {}, editorInfo?.channelInstrumentTypes?.[String(editorInfo?.selectedChannel)], editorInfo?.instrumentConfigs ?? {}, editorInfo?.instrumentPresetColors ?? {}) }} />
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
  </span>;
  const [channelNameDraft, setChannelNameDraft] = useState('');
  useEffect(() => { setChannelNameDraft(editorInfo?.channelSettings?.[String(editorInfo.selectedChannel)]?.name ?? ''); }, [editorInfo?.selectedChannel, editorInfo?.channelSettings]);
  const [instrumentTab, setInstrumentTab] = useState('settings');
  const [notePanDraft, setNotePanDraft] = useState(0);
  const [noteVolumeDraft, setNoteVolumeDraft] = useState(100);
  const [notePitchDraft, setNotePitchDraft] = useState(noteSelection?.note ?? 49);
  const [noteLengthDraft, setNoteLengthDraft] = useState(noteSelection?.length ?? 1);
  const [tempoDraft, setTempoDraft] = useState(editorInfo?.tempo ?? 125);
  const [ticksDraft, setTicksDraft] = useState(editorInfo?.speed ?? 6);
  useEffect(() => { setTempoDraft(editorInfo?.tempo ?? 125); }, [editorInfo?.tempo, selectedAsset?.id]);
  useEffect(() => { setTicksDraft(editorInfo?.speed ?? 6); }, [editorInfo?.speed, selectedAsset?.id]);

  useEffect(() => setAssetNameDraft((selectedAsset?.projectSource ? selectedAsset.name.split(/[\\/]/).pop() : selectedAsset?.name)?.replace(/\.[^/.]+$/, '') ?? ''), [selectedAsset?.id, selectedAsset?.name]);
  useEffect(() => setArtistDraft(editorInfo?.artist ?? ''), [editorInfo?.artist, selectedAsset?.id]);
  useEffect(() => { setInstrumentNameDraft(editorInfo?.instrumentNames?.[String(editorInfo.selectedInstrument)] ?? editorInfo?.instrumentSample?.name ?? ''); }, [editorInfo?.selectedInstrument, editorInfo?.instrumentSample?.name, editorInfo?.instrumentNames?.[String(editorInfo?.selectedInstrument ?? 0)]]);
  useEffect(() => { setInstrumentTab('settings'); }, [editorInfo?.format]);
  useEffect(() => { setNotePanDraft(quantizeTrackerNotePan(noteSelection?.pan ?? 0)); }, [noteSelection?.row, noteSelection?.note, noteSelection?.pan]);
  useEffect(() => { setNoteVolumeDraft(noteSelection?.volume ?? 100); }, [noteSelection?.row, noteSelection?.note, noteSelection?.volume]);
  useEffect(() => { setNotePitchDraft(noteSelection?.note ?? 49); }, [noteSelection?.row, noteSelection?.note]);
  useEffect(() => { setNoteLengthDraft(noteSelection?.length ?? 1); }, [noteSelection?.row, noteSelection?.note, noteSelection?.length]);
  const defaultMusicAssetName = sanitizeMusicAssetName((selectedAsset?.name.split(/[\\/]/).pop() ?? '').replace(/\.[^/.]+$/, '')) || 'new-beat';
  const commitAssetName = async () => {
    if (!selectedAsset) return;
    const extensionSource = selectedAsset.projectSource ? selectedAsset.name.split(/[\\/]/).pop() ?? selectedAsset.name : selectedAsset.name;
    const baseName = sanitizeMusicAssetName(assetNameDraft.trim()) || defaultMusicAssetName;
    setAssetNameDraft(baseName);
    const nextLeaf = `${baseName}${extensionSource.match(/\.[^/.]+$/)?.[0] ?? ''}`;
    const parent = selectedAsset.projectSource ? selectedAsset.name.split(/[\\/]/).slice(0, -1).join('/') : '';
    const nextName = parent ? `${parent}/${nextLeaf}` : nextLeaf;
    if (nextName === selectedAsset.name) return;
    const result = selectedAsset.projectSource
      ? await window.electronAPI.renameTrackerProject(selectedAsset.name, nextName)
      : await window.electronAPI.renameAsset('musics', selectedAsset.name, nextName);
    if (result?.status !== 'success') { message.error(t('music.rename.failed')); setAssetNameDraft(extensionSource.replace(/\.[^/.]+$/, '')); return; }
    const savedName = result.filename ?? nextName;
    setSelectedAssetId(selectedAsset.projectSource ? `project:${savedName}` : `0:${savedName}`);
    setAssetNameDraft(nextLeaf.replace(/\.[^/.]+$/, ''));
    window.dispatchEvent(new CustomEvent('gba-studio:assets-reloaded'));
  };
  const commitArtist = () => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-artist', { detail: { artist: artistDraft } }));
  useEffect(() => setPatternNameDraft(editorInfo?.patternName ?? ''), [editorInfo?.patternName, editorInfo?.selectedPattern]);
  useEffect(() => setPatternRowsDraft(editorInfo?.patternRows ?? 64), [editorInfo?.patternRows, editorInfo?.selectedPattern]);
  const editNote = (detail: { row?: number; transpose?: number; note?: number; length?: number; instrument?: number; volume?: number; pan?: number; effect?: number; parameter?: number }) =>
    window.dispatchEvent(new CustomEvent('gba-studio:music-editor-edit-note', { detail }));
  const editSample = (detail: { name?: string; volume?: number; loopStart?: number; loopEnd?: number; rootNote?: number; fineTune?: number; panning?: number }) =>
    window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-sample', { detail }));
  const commitPatternName = () => {
    if (editorInfo?.patternNameEditable && patternNameDraft !== editorInfo.patternName) {
      window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-pattern', { detail: { name: patternNameDraft } }));
    }
  };
  const commitPatternRows = () => {
    if (editorInfo?.patternNameEditable && patternRowsDraft !== editorInfo.patternRows) {
      window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-pattern', { detail: { rows: patternRowsDraft } }));
    }
  };
  const transposeNote = (amount: number) => {
    if (noteSelection) editNote({ transpose: amount });
  };
  const instrumentCategory = editorInfo?.instrumentCategories?.[String(editorInfo.selectedInstrument)]
    ?? (editorInfo?.format === 'MOD' ? editorInfo.channelInstrumentTypes?.[String(editorInfo.selectedChannel)] ?? 'Duty' : '');
  const instrumentHierarchyNumber = trackerInstrumentHierarchyNumber(editorInfo?.selectedInstrument ?? 1, editorInfo?.instrumentCategories ?? {});
  const pitchName = noteSelection ? `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][(noteSelection.note - 1) % 12]}${Math.floor((noteSelection.note - 1) / 12) + 1}` : '';
  const instrumentSamplePan = editorInfo?.instrumentSample
    ? editorInfo.instrumentSample.panning <= 128
      ? (editorInfo.instrumentSample.panning - 128) / 128
      : (editorInfo.instrumentSample.panning - 128) / 127
    : 0;
  return <div style={{ height: '100%', minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', padding: 12, background: token.colorBgBase, color: token.colorText }}>
    {selectedAsset && <>
      <NameInput className="music-file-name-input" aria-label={t('music.inspector.fileName')} placeholder={defaultMusicAssetName} value={assetNameDraft} onChange={event => setAssetNameDraft(sanitizeMusicAssetName(event.target.value))} onFocus={() => setAssetNameFocused(true)} onBlur={() => { setAssetNameFocused(false); void commitAssetName(); }} onPressEnter={event => event.currentTarget.blur()} style={{ border: `1px solid ${assetNameFocused ? token.colorPrimary : 'transparent'}`, background: assetNameFocused ? token.colorBgContainer : 'transparent', boxShadow: 'none', marginBottom: 6, fontWeight: 600 }} />
      <NameInput aria-label={t('music.inspector.artist')} placeholder={t('music.inspector.artist')} value={artistDraft} onChange={event => setArtistDraft(event.target.value)} onFocus={() => setArtistFocused(true)} onBlur={() => { setArtistFocused(false); commitArtist(); }} onPressEnter={event => event.currentTarget.blur()} maxLength={120} style={{ border: `1px solid ${artistFocused ? token.colorPrimary : 'transparent'}`, background: artistFocused ? token.colorBgContainer : 'transparent', boxShadow: 'none', marginBottom: 10, fontWeight: 600 }} />
    </>}
    {editorInfo ? <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', flex: 1, minHeight: 0 }}>
      <Typography.Text type="secondary" style={{ display: 'block', width: '100%', paddingBottom: 6, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>{t('music.inspector.properties')}</Typography.Text>
      <Descriptions size="small" column={1}>
        <Descriptions.Item label={t('music.inspector.format')}>{editorInfo.format}</Descriptions.Item>
        <Descriptions.Item>
          <Flex gap={24} justify="center" style={{ width: '100%' }}>
            <Flex vertical align="center" gap={6} style={{ flex: 1, minWidth: 0 }}>
              <Typography.Text>{t('music.inspector.tempo')}</Typography.Text>
              <Flex align="center" justify="center" style={{ height: 80 }}><MusicDial label={t('music.inspector.tempo')} min={32} max={255} step={1} value={tempoDraft} valueText={`${tempoDraft} BPM`} disabled={!editorInfo.capabilities.tempo} onChange={setTempoDraft} onChangeComplete={value => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-tempo', { detail: { value } }))} /></Flex>
              <Typography.Text type="secondary">{tempoDraft} BPM</Typography.Text>
            </Flex>
            <Flex vertical align="center" gap={6} style={{ flex: 1, minWidth: 0 }}>
              <Typography.Text>{t('music.inspector.ticksPerRow')}</Typography.Text>
              <Flex align="center" justify="center" style={{ height: 80 }}><MusicDial label={t('music.inspector.ticksPerRow')} min={1} max={31} step={1} value={ticksDraft} valueText={`${ticksDraft} ${t('music.inspector.ticks')}`} disabled={!editorInfo.speedEditable} onChange={setTicksDraft} onChangeComplete={value => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-speed', { detail: { value } }))} /></Flex>
              <Typography.Text type="secondary">{ticksDraft} {t('music.inspector.ticks')}</Typography.Text>
            </Flex>
          </Flex>
        </Descriptions.Item>
        <Descriptions.Item label={t('music.inspector.channels')}>{editorInfo.channels}</Descriptions.Item>
        <Descriptions.Item label={t('music.inspector.patterns')}>{editorInfo.patterns}</Descriptions.Item>
        <Descriptions.Item label={t('music.inspector.instruments')}>{editorInfo.instruments}</Descriptions.Item>
      </Descriptions>
      {selectionKind === 'pattern' && <section style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 10 }}>
        <Typography.Text type="secondary">{t('music.inspector.pattern')}</Typography.Text>
        <Descriptions size="small" column={1} style={{ marginTop: 6 }}>
          <Descriptions.Item label={t('music.inspector.patternName')}>
            <Tooltip title={editorInfo.patternNameEditable ? '' : t('music.inspector.readOnlyFormat', { format: editorInfo.format })}>
              <span style={{ display: 'block' }}><Input aria-label={t('music.inspector.patternName')} maxLength={48} value={patternNameDraft} disabled={!editorInfo.patternNameEditable} onChange={event => setPatternNameDraft(event.target.value)} onBlur={commitPatternName} onPressEnter={event => event.currentTarget.blur()} /></span>
            </Tooltip>
          </Descriptions.Item>
          <Descriptions.Item label={t('music.inspector.patternRows')}>
            <Tooltip title={editorInfo.patternLengthEditable ? '' : t('music.inspector.readOnlyFormat', { format: editorInfo.format })}>
              <span style={{ display: 'block' }}><InputNumber aria-label={t('music.inspector.patternRows')} min={editorInfo.patternMinimumRows} max={256} value={patternRowsDraft} disabled={!editorInfo.patternLengthEditable} onChange={value => value !== null && value !== undefined && setPatternRowsDraft(Number(value))} onBlur={commitPatternRows} onPressEnter={event => event.currentTarget.blur()} /></span>
            </Tooltip>
          </Descriptions.Item>
          <Descriptions.Item label={t('music.inspector.patternEvents')}>{editorInfo.patternEvents}</Descriptions.Item>
        </Descriptions>
      </section>}
      {noteSelection && selectionKind === 'note' && <section style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 10, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Typography.Text type="secondary">{t('music.inspector.note')}</Typography.Text>
        {noteSelection.count > 1 && <Typography.Text style={{ display: 'block', margin: '5px 0 8px' }}>{t('music.inspector.notesSelected', { count: noteSelection.count })}</Typography.Text>}
        {noteSelection.count > 1 && <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{t('music.inspector.focusedNoteHint')}</Typography.Text>}
        <Flex vertical gap={10}>
          <Divider orientation="left" plain style={{ margin: '8px 0' }}>{t('music.inspector.instrument')}</Divider>
          <label><Select aria-label={t('music.inspector.instrument')} showSearch optionFilterProp="label" optionRender={option => renderInstrumentChoice(Number(option.value), option.label)} labelRender={option => renderInstrumentChoice(Number(option.value), option.label)} value={noteSelection.instrument} style={{ width: '100%' }} options={trackerInstrumentOptions(editorInfo.instrumentNames && Object.keys(editorInfo.instrumentNames).length ? editorInfo.instrumentNames : Object.fromEntries(Array.from({ length: editorInfo.instruments }, (_, index) => [String(index + 1), ''])), editorInfo.instrumentCategories ?? {}, editorInfo.channelSettings ?? {}, editorInfo.selectedChannel, t)} onChange={value => editNote({ instrument: value })} /></label>
          <Divider orientation="left" plain style={{ margin: '8px 0' }}>{t('music.inspector.position')}</Divider>
          {noteSelection.count === 1 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Typography.Text>{`${pitchName} · ${t('music.inspector.row', { row: noteSelection.row + 1 })}`}</Typography.Text>
            <Flex justify="space-between" align="center"><Typography.Text>{t('music.inspector.rowLabel')}</Typography.Text><Typography.Text type="secondary">{noteSelection.row + 1}</Typography.Text></Flex>
            <Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('music.inspector.rowLabel')} min={1} max={editorInfo.patternRows} step={1} value={noteSelection.row + 1} onChange={value => editNote({ row: Number(value) - 1 })} style={{ width: '100%', margin: 0, '--music-accent': token.colorPrimary } as React.CSSProperties} />
          </div>}
          <Flex gap={12} align="stretch">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <Typography.Text>{t('music.inspector.pitch')}</Typography.Text>
              <Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('music.inspector.pitch')} vertical min={1} max={96} step={1} value={notePitchDraft} onChange={value => {
                const note = Number(value); setNotePitchDraft(note);
                window.dispatchEvent(new CustomEvent('gba-studio:music-editor-preview-note-pitch', { detail: { note } }));
              }} onChangeComplete={value => {
                const note = Number(value); setNotePitchDraft(note); editNote({ note });
                window.dispatchEvent(new CustomEvent('gba-studio:music-editor-preview-note-pitch', { detail: { clear: true } }));
              }} style={{ height: 112, margin: 0, '--music-accent': token.colorPrimary } as React.CSSProperties} />
              <Typography.Text type="secondary">{pitchName}</Typography.Text>
            </div>
            <Flex vertical justify="center" align="center" gap={12} style={{ flex: 1, minWidth: 0 }}>
              <Flex vertical align="center" gap={4} style={{ width: '100%' }}><Typography.Text>{t('music.inspector.semitone')}</Typography.Text><Space.Compact><Tooltip title={t('music.inspector.lowerSemitone')}><Button aria-label={t('music.inspector.lowerSemitone')} style={{ width: 40 }} disabled={(noteSelection.minNote ?? noteSelection.note) <= 1} onClick={() => transposeNote(-1)}>-</Button></Tooltip><Tooltip title={t('music.inspector.raiseSemitone')}><Button aria-label={t('music.inspector.raiseSemitone')} style={{ width: 40 }} disabled={(noteSelection.maxNote ?? noteSelection.note) >= 96} onClick={() => transposeNote(1)}>+</Button></Tooltip></Space.Compact></Flex>
              <Flex vertical align="center" gap={4} style={{ width: '100%' }}><Typography.Text>{t('music.inspector.octave')}</Typography.Text><Space.Compact><Tooltip title={t('music.inspector.lowerOctave')}><Button aria-label={t('music.inspector.lowerOctave')} style={{ width: 40 }} disabled={(noteSelection.minNote ?? noteSelection.note) <= 12} onClick={() => transposeNote(-12)}>-</Button></Tooltip><Tooltip title={t('music.inspector.raiseOctave')}><Button aria-label={t('music.inspector.raiseOctave')} style={{ width: 40 }} disabled={(noteSelection.maxNote ?? noteSelection.note) >= 85} onClick={() => transposeNote(12)}>+</Button></Tooltip></Space.Compact></Flex>
            </Flex>
          </Flex>
          {noteSelection.count === 1 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Flex justify="space-between" align="center"><Typography.Text>{t('music.inspector.length')}</Typography.Text><Typography.Text type="secondary">{noteLengthDraft}</Typography.Text></Flex><Slider className="gba-music-fader gba-sample-volume-fader" aria-label={t('music.inspector.length')} min={1} max={Math.max(1, editorInfo.patternRows - noteSelection.row)} step={1} value={Math.min(noteLengthDraft, Math.max(1, editorInfo.patternRows - noteSelection.row))} onChange={value => { const length = Number(value); setNoteLengthDraft(length); window.dispatchEvent(new CustomEvent('gba-studio:music-editor-preview-note-length', { detail: { length } })); }} onChangeComplete={value => { const length = Number(value); setNoteLengthDraft(length); editNote({ length }); window.dispatchEvent(new CustomEvent('gba-studio:music-editor-preview-note-length', { detail: { clear: true } })); }} style={{ width: '100%', margin: 0, '--music-accent': token.colorPrimary } as React.CSSProperties} /></div>}
          <Divider orientation="left" plain style={{ margin: '8px 0' }}>{t('music.inspector.sound')}</Divider>
          <Flex gap={24} justify="center">
            <Flex vertical align="center" gap={8} style={{ flex: 1 }}>
              <Typography.Text>{t('music.inspector.volume')}</Typography.Text>
              <Tooltip title={noteSelection.volumeEditable === false ? t('music.inspector.readOnlyFormat', { format: editorInfo.format }) : ''}>
                <Flex align="center" justify="center" style={{ height: 80 }}><MusicDial label={t('music.inspector.noteVolumeAria')} min={0} max={100} step={1} value={noteVolumeDraft} valueText={`${noteVolumeDraft}%`} disabled={noteSelection.volumeEditable === false} onChange={setNoteVolumeDraft} onChangeComplete={volume => editNote({ volume })} /></Flex>
              </Tooltip>
              <Typography.Text type="secondary">{noteVolumeDraft}%</Typography.Text>
            </Flex>
            <Flex vertical align="center" gap={8} style={{ flex: 1 }}>
              <Typography.Text>Pan</Typography.Text>
              <Tooltip title={noteSelection.panEditable === false ? t('music.inspector.panConflict') : t('music.inspector.panSnap')}>
                <span><MusicDial panScale label={t('music.inspector.panAria')} min={-1} max={1} step={0.25} value={notePanDraft} disabled={noteSelection.panEditable === false} onChange={value => setNotePanDraft(quantizeTrackerNotePan(value))} onChangeComplete={value => editNote({ pan: quantizeTrackerNotePan(value) })} /></span>
              </Tooltip>
              <Typography.Text type="secondary">{notePanDraft === 0 ? t('music.inspector.center') : `${notePanDraft < 0 ? 'L' : 'R'} ${Math.abs(Math.round(notePanDraft * 100))}%`}</Typography.Text>
            </Flex>
          </Flex>
        </Flex>
      </section>}
      {selectionKind === 'channel' && <section style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 10 }}>
        <Space direction="vertical" style={{ display: 'flex', marginBottom: 10 }}>
          <label>{t('music.channels.name')}<Input aria-label={t('music.channels.name')} value={channelNameDraft} maxLength={64} placeholder={t('music.channels.defaultName', { number: editorInfo.selectedChannel + 1 })} onChange={event => setChannelNameDraft(event.target.value)} onBlur={() => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-channel-settings', { detail: { channel: editorInfo.selectedChannel, name: channelNameDraft } }))} onPressEnter={event => event.currentTarget.blur()} /></label>
          <label>{t('music.channels.allowedType')}<Select aria-label={t('music.channels.allowedType')} value={editorInfo.channelSettings?.[String(editorInfo.selectedChannel)]?.instrumentType ?? 'Any'} options={['Any', 'Duty', 'Wave', 'Noise', 'Other'].map(value => ({ value, label: value === 'Any' ? t('music.channels.anyType') : value === 'Other' ? t('music.instruments.other') : value }))} onChange={instrumentType => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-channel-settings', { detail: { channel: editorInfo.selectedChannel, instrumentType } }))} style={{ width: '100%' }} /></label>
        </Space>
        <Typography.Text type="secondary">CHANNEL {editorInfo.selectedChannel + 1} MIXER</Typography.Text>
        <Space direction="vertical" style={{ display: 'flex', marginTop: 8 }}>
          <Flex gap={12} align="center" justify="center">
            <Flex vertical align="center" gap={8} style={{ flex: 1 }}>
              <Typography.Text>{t('music.inspector.volume')}</Typography.Text>
              <Flex align="center" justify="center" style={{ height: 80 }}><MusicDial label="Music channel volume dial" min={0} max={100} step={1} value={Math.round(editorInfo.channelVolume * 100)} valueText={`${Math.round(editorInfo.channelVolume * 100)}%`} onChange={value => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-channel', { detail: { kind: 'volume', value: Number(value) / 100 } }))} /></Flex>
              <Typography.Text type="secondary">{Math.round(editorInfo.channelVolume * 100)}%</Typography.Text>
            </Flex>
            <Tooltip title={t(editorInfo.channelMuted ? 'music.channels.unmute' : 'music.channels.mute')}><Button type="default" danger={editorInfo.channelMuted} aria-label={t(editorInfo.channelMuted ? 'music.channels.unmute' : 'music.channels.mute')} aria-pressed={editorInfo.channelMuted} icon={editorInfo.channelMuted ? <AudioMutedOutlined /> : <SoundOutlined />} onClick={() => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-channel', { detail: { kind: 'toggle-mute' } }))} /></Tooltip>
            <Flex vertical align="center" gap={8} style={{ flex: 1 }}>
              <Typography.Text>Pan</Typography.Text>
              <MusicDial panScale step={0.25} label="Music channel pan dial" value={editorInfo.channelPan} valueText={`${editorInfo.channelPan < 0 ? 'L' : editorInfo.channelPan > 0 ? 'R' : 'C'} ${Math.round(Math.abs(editorInfo.channelPan) * 100)}%`} onChange={value => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-channel', { detail: { kind: 'pan', value: quantizeTrackerNotePan(value) } }))} />
              <Typography.Text type="secondary">{editorInfo.channelPan === 0 ? t('music.inspector.center') : `${editorInfo.channelPan < 0 ? 'L' : 'R'} ${Math.round(Math.abs(editorInfo.channelPan) * 100)}%`}</Typography.Text>
            </Flex>
          </Flex>
        </Space>
      </section>}
      {selectionKind === 'instrument' && <section style={{ borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 10 }}>
        <Typography.Text type="secondary">{t('music.instruments.instrumentNumber', { number: String(instrumentHierarchyNumber).padStart(2, '0') })}{instrumentCategory ? ` · ${instrumentCategory}` : ''}</Typography.Text>
        {editorInfo.instrumentSample && <Space direction="vertical" size={8} style={{ display: 'flex', marginTop: 8 }}>
          <Space.Compact block>
            <ColorPicker onOpenChange={setInstrumentColorOpen} disabledAlpha rootClassName="gba-palette-color-picker" value={editorInfo.instrumentConfig?.color?.startsWith('#') ? editorInfo.instrumentConfig.color : editorInfo.instrumentPresetColors?.[String(editorInfo.selectedInstrument)] ?? ['#68c9b4', '#74a9ff', '#d995ff', '#ffbd68', '#fb8295', '#a9d275'][(editorInfo.selectedInstrument - 1) % 6]} onChange={value => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-instrument', { detail: { index: editorInfo.selectedInstrument - 1, type: editorInfo.instrumentCategories?.[String(editorInfo.selectedInstrument)] ?? editorInfo.channelInstrumentTypes?.[String(editorInfo.selectedChannel)] ?? 'Duty', color: value.toHexString() } }))}>
              <Button className="gba-instrument-color-trigger" aria-label={t('music.instruments.color')} data-picker-open={instrumentColorOpen} style={{ width: 32, minWidth: 32, height: 32, padding: 0, border: `1px solid ${token.colorBorder}`, '--input-focus-border': token.colorPrimary, '--input-focus-shadow': `0 0 0 ${token.controlOutlineWidth}px ${token.controlOutline}`, background: editorInfo.instrumentConfig?.color ?? editorInfo.instrumentPresetColors?.[String(editorInfo.selectedInstrument)] ?? ['#68c9b4', '#74a9ff', '#d995ff', '#ffbd68', '#fb8295', '#a9d275'][(editorInfo.selectedInstrument - 1) % 6] } as React.CSSProperties} />
            </ColorPicker>
            <Input aria-label={t('music.instruments.name')} placeholder={t('music.instruments.namePlaceholder')} value={instrumentNameDraft} maxLength={editorInfo.canonicalProject ? 64 : editorInfo.format === 'MOD' ? 22 : undefined} disabled={!editorInfo.canonicalProject && editorInfo.format !== 'MOD'} onChange={event => setInstrumentNameDraft(event.target.value)} onBlur={() => { if (editorInfo.canonicalProject && instrumentNameDraft !== editorInfo.instrumentNames?.[String(editorInfo.selectedInstrument)]) window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'set-instrument-name', name: instrumentNameDraft } })); else if (editorInfo.format === 'MOD' && instrumentNameDraft !== editorInfo.instrumentSample?.name) editSample({ name: instrumentNameDraft }); }} onPressEnter={event => event.currentTarget.blur()} style={{ minWidth: 0 }} />
          </Space.Compact>
          <Tabs key={editorInfo.format} size="small" activeKey={instrumentTab} onChange={setInstrumentTab} items={[
            { key: 'settings', label: t('music.instruments.settings'), children: <><Descriptions size="small" column={2}>
          <Descriptions.Item label="Sample" span={2}>{editorInfo.instrumentSample.name || 'Unnamed sample'}</Descriptions.Item>
          <Descriptions.Item>
            <Tooltip title={!editorInfo.instrumentSampleEditable ? t('music.inspector.readOnlyFormat', { format: editorInfo.format }) : editorInfo.format === 'XM' ? t('music.inspector.xmSampleVolumeGbaPreview') : ''}>
              <Flex vertical align="center" gap={6} style={{ width: '100%' }}>
                <Typography.Text>{t('music.inspector.sampleVolume')}</Typography.Text>
              <Flex align="center" justify="center" style={{ height: 80 }}><MusicDial label={t('music.inspector.sampleVolume')} min={0} max={100} step={1} value={Math.round((editorInfo.instrumentSample.volume ?? 64) / 64 * 100)} valueText={`${Math.round((editorInfo.instrumentSample.volume ?? 64) / 64 * 100)}%`} disabled={!editorInfo.instrumentSampleEditable} onChange={value => editSample({ volume: Math.round(value / 100 * 64) })} /></Flex>
              <Typography.Text type="secondary">{Math.round((editorInfo.instrumentSample.volume ?? 64) / 64 * 100)}%</Typography.Text>
              </Flex>
            </Tooltip>
          </Descriptions.Item>
          {editorInfo.instrumentSampleTuningEditable && <Descriptions.Item>
            <Flex vertical align="center" gap={6} style={{ width: '100%' }}>
              <Typography.Text>{t('music.inspector.samplePan')}</Typography.Text>
              <Tooltip title={t('music.inspector.panSnap')}>
                <span><MusicDial panScale label={t('music.inspector.samplePan')} min={-1} max={1} step={0.25} value={instrumentSamplePan} valueText={instrumentSamplePan === 0 ? t('music.inspector.center') : `${instrumentSamplePan < 0 ? 'L' : 'R'} ${Math.abs(Math.round(instrumentSamplePan * 100))}%`} onChange={value => {
                  const pan = quantizeTrackerNotePan(value);
                  editSample({ panning: pan < 0 ? Math.round(128 + pan * 128) : Math.round(128 + pan * 127) });
                }} /></span>
              </Tooltip>
              <Typography.Text type="secondary">{instrumentSamplePan === 0 ? t('music.inspector.center') : `${instrumentSamplePan < 0 ? 'L' : 'R'} ${Math.abs(Math.round(instrumentSamplePan * 100))}%`}</Typography.Text>
            </Flex>
          </Descriptions.Item>}
          {editorInfo.instrumentSampleEditable ? <>
            <Descriptions.Item label={t('music.inspector.loopStart')}>
              <InputNumber aria-label={t('music.inspector.loopStart')} min={0} max={editorInfo.instrumentSample.length} step={editorInfo.format === 'MOD' ? 2 : 1} value={editorInfo.instrumentSample.loopStart} onChange={value => value !== null && value !== undefined && editSample({ loopStart: Number(value) })} />
            </Descriptions.Item>
            <Descriptions.Item label={t('music.inspector.loopEnd')}>
              <InputNumber aria-label={t('music.inspector.loopEnd')} min={editorInfo.instrumentSample.loopStart} max={editorInfo.instrumentSample.length} step={editorInfo.format === 'MOD' ? 2 : 1} value={editorInfo.instrumentSample.loopEnd} onChange={value => value !== null && value !== undefined && editSample({ loopEnd: Number(value) })} />
            </Descriptions.Item>
          </> : <>
            <Descriptions.Item label={t('music.inspector.loopStart')}>
              <Tooltip title={t('music.inspector.readOnlyFormat', { format: editorInfo.format })}>
                <span style={{ display: 'inline-block' }}><InputNumber aria-label={t('music.inspector.loopStart')} min={0} max={editorInfo.instrumentSample.length} value={editorInfo.instrumentSample.loopStart} disabled /></span>
              </Tooltip>
            </Descriptions.Item>
            <Descriptions.Item label={t('music.inspector.loopEnd')}>
              <Tooltip title={t('music.inspector.readOnlyFormat', { format: editorInfo.format })}>
                <span style={{ display: 'inline-block' }}><InputNumber aria-label={t('music.inspector.loopEnd')} min={0} max={editorInfo.instrumentSample.length} value={editorInfo.instrumentSample.loopEnd} disabled /></span>
              </Tooltip>
            </Descriptions.Item>
          </>}
          {editorInfo.instrumentSampleTuningEditable && <>
            <Descriptions.Item label={t('music.inspector.rootNote')}>
              <InputNumber aria-label={t('music.inspector.rootNote')} min={-80} max={175} value={editorInfo.instrumentSample.rootNote} onChange={value => value !== null && value !== undefined && editSample({ rootNote: Number(value) })} />
            </Descriptions.Item>
          </>}
          <Descriptions.Item label={t(editorInfo.format === 'MOD' ? 'music.inspector.fineTuneMod' : 'music.inspector.fineTune')}>
            <Tooltip title={editorInfo.instrumentSampleFineTuneEditable ? '' : t('music.inspector.readOnlyFormat', { format: editorInfo.format })}>
              <span style={{ display: 'inline-block' }}><InputNumber aria-label={t(editorInfo.format === 'MOD' ? 'music.inspector.fineTuneMod' : 'music.inspector.fineTune')} min={editorInfo.format === 'MOD' ? -8 : -128} max={editorInfo.format === 'MOD' ? 7 : 127} step={1} value={editorInfo.instrumentSample.fineTune} disabled={!editorInfo.instrumentSampleFineTuneEditable} onChange={value => value !== null && value !== undefined && editSample({ fineTune: Number(value) })} /></span>
            </Tooltip>
          </Descriptions.Item>
          {!editorInfo.instrumentSampleTuningEditable && <Descriptions.Item label={t('music.inspector.sampleTuning')}><Typography.Text type="secondary">{t('music.inspector.sampleTuningReadOnly', { format: editorInfo.format })}</Typography.Text></Descriptions.Item>}
            </Descriptions>
            <Divider style={{ margin: '12px 0' }} />
            <Typography.Text strong>{t('music.instruments.testInstrument')}</Typography.Text>
            <Space.Compact block style={{ marginTop: 8 }}>
              {Array.from({ length: 7 }, (_, index) => index + 2).map(octave => {
                const testNote = () => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-test-instrument', { detail: { note: (octave - 1) * 12 + 1 } }));
                return <Button key={octave} size="middle" style={{ flex: 1, minWidth: 0, height: 32, minHeight: 32, maxHeight: 32, paddingInline: 4 }} aria-label={t('music.instruments.testNote', { note: `C${octave}` })} onPointerDown={event => { if (event.button === 0) testNote(); }} onClick={event => { if (event.detail === 0) testNote(); }}>{`C${octave}`}</Button>;
              })}
            </Space.Compact></> },
            { key: 'sample', label: t('music.instruments.sample'), children: <Space direction="vertical" size={8} style={{ display: 'flex' }}>
              {editorInfo.capabilities.importWavSample && <Flex gap={6} wrap="wrap">
                <Button size="small" onClick={() => sampleAudioInputRef.current?.click()}>{t('music.instruments.replaceSampleAudio')}</Button>
                <Button size="small" icon={<AudioOutlined />} onClick={() => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'record-microphone' } }))}>{t('music.instruments.recordMicrophone')}</Button>
                <input ref={sampleAudioInputRef} type="file" accept="audio/*,.wav" aria-label="Music sample audio file" hidden onChange={event => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'import-sample', file, replaceSelected: true } }));
                }} />
              </Flex>}
              {editorInfo.instrumentSample.pcmEditable && <Button size="small" onClick={() => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'open-sample-editor' } }))}>{t('music.sample.editorOpen')}</Button>}
              {editorInfo.instrumentSample.waveform && <button type="button" aria-label={t('music.sample.editorOpen')} disabled={!editorInfo.instrumentSample.pcmEditable} onClick={() => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'open-sample-editor' } }))} style={{ display: 'block', width: '100%', padding: 0, border: 0, borderRadius: 5, background: 'transparent', cursor: editorInfo.instrumentSample.pcmEditable ? 'pointer' : 'default' }}><svg role="img" aria-label={t('music.sample.editorWaveform')} viewBox="0 0 640 64" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 56, background: token.colorFillTertiary, borderRadius: 5 }}>
                <line x1="0" y1="32" x2="640" y2="32" stroke={token.colorBorderSecondary} strokeWidth="1" />
                <polyline points={editorInfo.instrumentSample.waveform.map((value, index) => `${index * 5},${32 - value * 28}`).join(' ')} fill="none" stroke={token.colorPrimary} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
              </svg></button>}
              {editorInfo.instrumentSample.pcmEditable && <>
                <Typography.Text type="secondary">{t('music.sample.edit.warning')}</Typography.Text>
                <Flex gap={4} wrap="wrap">
                  {(['normalize', 'remove-dc', 'reverse', 'fade-out'] as const).map(operation => <Button key={operation} size="small" onClick={() => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-edit-sample-pcm', { detail: { operation } }))}>{t(`music.sample.edit.${operation === 'remove-dc' ? 'removeDc' : operation === 'fade-out' ? 'fadeOut' : operation}`)}</Button>)}
                </Flex>
              </>}
              <Descriptions size="small" column={1}>
              <Descriptions.Item label={t('music.instruments.sampleLength')}>{editorInfo.instrumentSample.length} bytes</Descriptions.Item>
              <Descriptions.Item label={t('music.instruments.sampleFormat')}>{editorInfo.format}{editorInfo.format === 'MOD' ? ' · 8-bit signed PCM' : ''}</Descriptions.Item>
              <Descriptions.Item label={t('music.instruments.sampleLoop')}>{editorInfo.instrumentSample.loopEnd > editorInfo.instrumentSample.loopStart ? `${editorInfo.instrumentSample.loopStart}–${editorInfo.instrumentSample.loopEnd}` : t('music.inspector.noEffect')}</Descriptions.Item>
              </Descriptions>
            </Space> },
            { key: 'envelopes', label: t('music.envelope.title'), disabled: !editorInfo.canonicalProject, children: <MusicInstrumentEnvelopeEditor
              volume={editorInfo.instrumentEnvelopes?.volume ?? { points: [{ tick: 0, value: 1 }], sustainStart: 0, sustainEnd: 0, loopStart: 0, loopEnd: 0, enabled: false, sustainEnabled: false, loopEnabled: false }}
              panning={editorInfo.instrumentEnvelopes?.panning ?? { points: [{ tick: 0, value: 0.5 }], sustainStart: 0, sustainEnd: 0, loopStart: 0, loopEnd: 0, enabled: false, sustainEnabled: false, loopEnabled: false }}
              fadeout={editorInfo.instrumentEnvelopes?.fadeout ?? 0}
              enabled={editorInfo.canonicalProject}
              editable={editorInfo.canonicalProject && editorInfo.format === 'XM'}
              onChange={(envelopeType, envelope, nextFadeout) => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'set-instrument-envelope', envelopeType, envelope, fadeout: nextFadeout } }))}
            /> },
            { key: 'zones', label: t('music.zones.title'), disabled: !editorInfo.canonicalProject, children: <MusicInstrumentZoneEditor
              zones={editorInfo.instrumentZones?.zones ?? []}
              samples={editorInfo.instrumentZones?.samples ?? []}
              editable={editorInfo.canonicalProject}
              onChange={zones => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'set-instrument-zones', zones } }))}
            /> },
          ]} />
        </Space>}
        {!editorInfo.instrumentSample && <Typography.Text type="secondary" style={{ display: 'block', marginTop: 6 }}>No sample data available.</Typography.Text>}
        {editorInfo.instrumentSample?.zones.map(zone => <Typography.Text key={zone} type="secondary" style={{ display: 'block', fontSize: 11 }}>{zone}</Typography.Text>)}
      </section>}
    </div> : selectedAsset ? <Space direction="vertical" style={{ width: '100%' }}>
      <Tag>{selectedAsset.extension}</Tag>
      <Typography.Text type="secondary">{t('music.inspector.fileInfo')}</Typography.Text>
    </Space> : <Typography.Text type="secondary">{t('music.inspector.selectFile')}</Typography.Text>}
  </div>;
}

const RightPanel: React.FC<IRightPanelProps & { musicEditorMode?: boolean }> = ({ musicEditorMode = false, ...props }) =>
  musicEditorMode ? <MusicEditorRightPanel /> : <SceneRightPanel {...props} />;

export default RightPanel;
