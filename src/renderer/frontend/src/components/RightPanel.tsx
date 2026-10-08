import useAppContexts from '@/providers/contexts/AppContexts';
import { EImageType, ETypeScene, IBackgroundElement, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { EVariableType, IVariableDefinition, VariableValue } from '@/providers/contexts/interfaces/IVariablesElement';
import { IScriptDefinition } from '@/providers/contexts/interfaces/IScriptElement';
import { BgColorsOutlined, CaretDownFilled, CaretLeftFilled, CaretRightFilled, CaretUpFilled, DeleteOutlined, PictureOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Divider, Flex, Form, Input, Layout, Radio, Segmented, Select, Space, Tabs, Tag, theme, Tooltip, Typography } from 'antd';
import StepInputNumber, { InputNumber } from './StepInputNumber';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BackgroundSelector } from './BackgroundSelector';
import CollapseEventManager from './events/CollapseEventManager';
import SelectNewEvent from './events/SelectNewEvent';
import FlowEditorManager from './events/FlowEditorManager';
import RightPanelGWSettings, { CombatConfigEditor, ShooterConfigEditor } from './RightPanelGWSettings';
import FadeEvent from './events/FadeEvent';
import { EEvents } from './events/interfaces/IEvents';
import { loadPaletteLibrary } from './resourceEditors/paletteLibrary';
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

const ReferenceList: React.FC<{ locations: ReferenceLocation[]; onSelect: (location: ReferenceLocation) => void }> = ({ locations, onSelect }) => (
  <Space direction="vertical" size={2} style={{ width: '100%', padding: '8px 10px' }}>
    <Typography.Text type="secondary">Usado em:</Typography.Text>
    {locations.length === 0 ? <Typography.Text type="secondary">Nenhuma referência encontrada.</Typography.Text> : locations.map((location, index) => (
      <Typography.Link key={`${location.scene ?? ''}-${location.script ?? ''}-${location.event ?? ''}-${index}`} onClick={() => onSelect(location)}>
        {[location.scene && `cena: ${location.scene}`, location.script && `script: ${location.script}`, location.event && `evento: ${location.event}`].filter(Boolean).join(', ')}
      </Typography.Link>
    ))}
  </Space>
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
      tileEditSceneId: object?.sceneId ?? null,
      tileEditLayerId: object ? 4 : null,
      activeSceneObject: object,
      activeTriggerId: object?.type === 'trigger' ? object.id : null,
      activeButton: 'select',
      activeSubButton: '',
    }));
    setElementSelected(scene ? { ...scene, _recenter: true }
      : referencedScript ? { ...referencedScript, script: referencedScript.events, _resourceType: 'script' } : null);
  };
};

const VariableSettingsForm: React.FC<{ variable: IVariableDefinition }> = ({ variable }) => {
  const { variables, scripts, scenes, setVariables, setElementSelected, setSettingUtils } = useAppContexts();
  const [isEditingName, setIsEditingName] = useState(false);
  const defaultName = getVariableDefaultName(variable.symbol);
  const displayedName = variable.name || defaultName;

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
    <Space direction="vertical" style={{ width: '100%' }}>
      {isEditingName ? (
        <Input
          autoFocus
          variant="borderless"
          aria-label="Variable name"
          placeholder={defaultName}
          value={variable.name}
          onChange={(event) => updateVariable({ name: event.target.value })}
          onBlur={() => {
            if (!variable.name.trim()) updateVariable({ name: defaultName });
            setIsEditingName(false);
          }}
          onPressEnter={() => {
            if (!variable.name.trim()) updateVariable({ name: defaultName });
            setIsEditingName(false);
          }}
        />
      ) : (
        <Typography.Title
          level={5}
          onClick={() => setIsEditingName(true)}
          style={{ margin: 0, cursor: 'pointer', padding: 10 }}
        >
          {displayedName}
        </Typography.Title>
      )}
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
  const [isEditingName, setIsEditingName] = useState(false);
  const scriptIndex = scripts.scripts.findIndex(item => item.id === script.id);
  const defaultName = `Script ${Math.max(0, scriptIndex)}`;
  const displayedName = script.name || defaultName;
  const updateScript = (patch: Partial<IScriptDefinition>) => {
    const updated = { ...script, ...patch, ...(patch.events ? { script: patch.events } : {}), _saved: false };
    setScripts(previous => ({ ...previous, scripts: previous.scripts.map(item => item.id === script.id ? updated : item), _saved: false }));
    setElementSelected({ ...updated, script: updated.events, _resourceType: 'script' });
  };
  const locations = collectReferenceLocations(scenes, scripts.scripts, script.id, 'script');
  const selectReference = useReferenceNavigation();
  return <Content><Space direction="vertical" style={{ width: '100%' }}>{isEditingName ? <Input autoFocus variant="borderless" placeholder={defaultName} value={script.name || ''} onChange={event => updateScript({ name: event.target.value })} onBlur={() => { if (!(script.name || '').trim()) updateScript({ name: defaultName }); setIsEditingName(false); }} onPressEnter={event => event.currentTarget.blur()} style={{ margin: 10, width: 'calc(100% - 20px)' }} /> : <Typography.Title level={5} onClick={() => setIsEditingName(true)} style={{ margin: 0, cursor: 'pointer', padding: 10 }}>{displayedName}</Typography.Title>}<Divider style={{ margin: 0 }} /><Space direction="vertical" size={4} style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box' }}>
    <Typography.Text type="secondary">{t('scripts.description')}</Typography.Text>
    <Input.TextArea aria-label={t('scripts.description')} placeholder={t('scripts.descriptionPlaceholder')} value={script.description ?? ''} autoSize={{ minRows: 2, maxRows: 6 }} onChange={event => updateScript({ description: event.target.value })} />
  </Space><ReferenceList locations={locations} onSelect={selectReference} /><Tabs style={{ padding: 10 }} items={[{ key: 'script', label: 'Script', children: <Space direction="vertical" style={{ width: '100%' }}><CollapseEventManager scripts={script.events} onScriptsChange={events => updateScript({ events })} /><SelectNewEvent tabIndex="1" onEventCreated={event => updateScript({ events: [...script.events, event] })} /></Space> }]} /></Space></Content>;
};

const SceneObjectSettingsForm: React.FC<{ sceneId: string; type: 'actor' | 'trigger'; objectId: string; availableSprites?: any[] }> = ({ sceneId, type, objectId, availableSprites = [] }) => {
const { scenes, setScenes, setElementSelected, spriteResources, settingUtils } = useAppContexts();
  const [isEditingName, setIsEditingName] = useState(false);
  const scene = scenes.find(item => item.id === sceneId);
  const object = type === 'actor' ? scene?.actors?.find(item => item.id === objectId) : scene?.triggers?.find(item => item.id === objectId);
  if (!scene || !object) return null;
  const update = (changes: Record<string, unknown>) => {
    const key = type === 'actor' ? 'actors' : 'triggers';
    const values = (scene[key] ?? []).map((item: any) => item.id === objectId ? { ...item, ...changes } : item);
    const updated = { ...scene, [key]: values, _saved: false };
    setScenes(previous => previous.map(item => item.id === sceneId ? updated : item));
    setElementSelected(updated);
  };
  const label = type === 'actor' ? 'Actor' : 'Trigger';
  const snap = (value: number, step: number, offset = 0) => Math.round((value - offset) / step) * step + offset;
  const positionX = (value: number | null) => {
    const raw = Math.max(0, value ?? 0);
    if (type === 'actor') return Math.max(8, snap(raw, 16, 8));
    const max = Math.max(0, scene.width - (object.width ?? 8));
    return Math.min(max, snap(raw, 8));
  };
  const positionY = (value: number | null) => {
    const raw = Math.max(0, value ?? 0);
    if (type === 'actor') return Math.max(4, snap(raw, 8, 4));
    const max = Math.max(0, scene.height - (object.height ?? 8));
    return Math.min(max, snap(raw, 8));
  };
  const dimension = (value: number | null, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, snap(Math.max(minimum, value ?? minimum), 8)));
  const triggerMaxWidth = Math.max(8, Math.floor(Math.max(0, scene.width - object.x) / 8) * 8);
  const triggerMaxHeight = Math.max(8, Math.floor(Math.max(0, scene.height - object.y) / 8) * 8);
  const actorMoveSpeed = Number((object as any).moveSpeed ?? 2);
  const actorMoveSpeedIsCustom = !actorMoveSpeedOptions.some(option => option.value === actorMoveSpeed);
  const defaultName = `${label} ${(scene[type === 'actor' ? 'actors' : 'triggers']?.findIndex((item: any) => item.id === objectId) ?? 0) + 1}`;
  const restoreDefaultName = () => {
    if (!(object.name ?? '').trim()) update({ name: defaultName });
    setIsEditingName(false);
  };
  return <Content style={{ padding: 10 }}>
    {isEditingName ? <Input autoFocus variant="borderless" value={object.name ?? ''} placeholder={defaultName} onChange={event => update({ name: event.target.value })} onBlur={restoreDefaultName} onPressEnter={restoreDefaultName} /> : <Typography.Title level={5} onClick={() => setIsEditingName(true)} style={{ marginTop: 0, cursor: 'text' }}>{object.name || defaultName}</Typography.Title>}
    <Divider style={{ margin: '8px 0' }} />
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Paragraph style={{ marginBottom: 8 }}>{type === 'actor' ? 'Start Position' : 'Position'}</Typography.Paragraph>
      <Flex gap={8}>
        <InputNumber addonBefore="X" min={type === 'actor' ? 8 : 0} step={type === 'actor' ? 16 : 8} value={object.x} onChange={value => update({ x: positionX(value) })} style={{ flex: 1, minWidth: 0 }} />
        <InputNumber addonBefore="Y" min={type === 'actor' ? 4 : 0} step={8} value={object.y} onChange={value => update({ y: positionY(value) })} style={{ flex: 1, minWidth: 0 }} />
      </Flex>
      {type === 'actor' && <>
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Typography.Text>Direction</Typography.Text>
              <Radio.Group buttonStyle="solid" style={{ width: '100%', display: 'flex' }} value={(object as any).direction ?? 'right'} onChange={event => update({ direction: event.target.value })}>
            <Radio.Button value="left" style={{ flex: 1, textAlign: 'center' }}><CaretLeftFilled /></Radio.Button>
            <Radio.Button value="up" style={{ flex: 1, textAlign: 'center' }}><CaretUpFilled /></Radio.Button>
            <Radio.Button value="down" style={{ flex: 1, textAlign: 'center' }}><CaretDownFilled /></Radio.Button>
            <Radio.Button value="right" style={{ flex: 1, textAlign: 'center' }}><CaretRightFilled /></Radio.Button>
          </Radio.Group>
        </Space>
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
          <Typography.Text>Sprite Sheet</Typography.Text>
          <Select title="Select actor sprite sheet" placeholder="Select sprite" allowClear showSearch optionFilterProp="title" filterOption={(input, option) => {
            const data = (option as any)?.data ?? option;
            const searchableText = data?.title ?? data?.value ?? '';
            return String(searchableText).toLowerCase().includes(input.trim().toLowerCase());
          }} style={{ width: '100%' }} value={(object as any).spriteId} onChange={spriteId => update({ spriteId })}>
            {spriteResources.map(sprite => {
              const file = availableSprites.find(item => item.id === sprite.id);
              const filename = sprite.filename ?? file?.name;
              const imagePath = file?.path ?? '';
              const searchText = `${sprite.name} ${sprite.id} ${filename ?? ''}`;
              return <Select.Option key={sprite.id} value={sprite.id} title={searchText} label={searchText}>
                <PlayerSpriteOption name={sprite.name} path={imagePath} />
              </Select.Option>;
            })}
          </Select>
        </Content>
      </>}
      {type === 'actor' ? (
        <Typography.Text type="secondary">Size: 16 × 8 px</Typography.Text>
      ) : (
        <>
          <Typography.Paragraph style={{ margin: '8px 0' }}>Size</Typography.Paragraph>
          <Flex gap={8}>
            <InputNumber addonBefore="W" min={8} max={triggerMaxWidth} step={8} value={object.width} onChange={value => update({ width: dimension(value, 8, triggerMaxWidth) })} style={{ flex: 1, minWidth: 0 }} />
            <InputNumber addonBefore="H" min={8} max={triggerMaxHeight} step={8} value={object.height} onChange={value => update({ height: dimension(value, 8, triggerMaxHeight) })} style={{ flex: 1, minWidth: 0 }} />
          </Flex>
        </>
      )}
      {type === 'actor' && <Tabs size="small" items={[
        { key: 'interact', label: 'On Interact', children: <><CollapseEventManager scripts={(object as any).onInteractScript ?? []} onScriptsChange={events => update({ onInteractScript: events })} /><SelectNewEvent compact showFlowButton={false} onEventCreated={event => update({ onInteractScript: [...((object as any).onInteractScript ?? []), event] })} /></> },
        { key: 'init', label: 'On Init', children: <><CollapseEventManager scripts={(object as any).onInitScript ?? []} onScriptsChange={events => update({ onInitScript: events })} /><SelectNewEvent compact showFlowButton={false} onEventCreated={event => update({ onInitScript: [...((object as any).onInitScript ?? []), event] })} /></> },
        { key: 'update', label: 'On Update', children: <><CollapseEventManager scripts={(object as any).onUpdateScript ?? []} onScriptsChange={events => update({ onUpdateScript: events })} /><SelectNewEvent compact showFlowButton={false} onEventCreated={event => update({ onUpdateScript: [...((object as any).onUpdateScript ?? []), event] })} /></> },
      ]} />}
      {type === 'trigger' && <><Checkbox checked={object.enabled !== false} onChange={event => update({ enabled: event.target.checked })}>Enabled</Checkbox><Tabs size="small" items={[
        { key: 'enter', label: 'On Enter', children: <Space direction="vertical" size="small" style={{ width: '100%' }}><CollapseEventManager scripts={object.onEnterScript} onScriptsChange={events => update({ onEnterScript: events })} /><div style={{ paddingTop: 8 }}><SelectNewEvent compact showFlowButton={false} onEventCreated={event => update({ onEnterScript: [...(object.onEnterScript ?? []), event] })} /></div></Space> },
        { key: 'leave', label: 'On Leave', children: <Space direction="vertical" size="small" style={{ width: '100%' }}><CollapseEventManager scripts={object.onLeaveScript} onScriptsChange={events => update({ onLeaveScript: events })} /><div style={{ paddingTop: 8 }}><SelectNewEvent compact showFlowButton={false} onEventCreated={event => update({ onLeaveScript: [...(object.onLeaveScript ?? []), event] })} /></div></Space> },
      ]} /></>}
    </Space>
  </Content>;
};

interface IRightPanelProps {
  controllerView: any;
}

const RightPanel: React.FC<IRightPanelProps> = ({ controllerView }) => {
  const { t } = useI18n();
  const { token } = useToken();
  const { scenes, setScenes, elementSelected, setElementSelected, settings, setSettings, settingUtils, setSettingUtils, palettes, userSettings, setUserSettings } = useAppContexts();
  const isEditingTiles = Boolean(settingUtils.tileEditSceneId);

  const [isEditingTitle, setIsEditingTitle ] = useState(false);
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
  const [showSceneCombatConfig, setShowSceneCombatConfig] = useState(false);
  const [showSceneShooterConfig, setShowSceneShooterConfig] = useState(false);

  useEffect(() => {
    setShowSceneCombatConfig(false);
    setShowSceneShooterConfig(false);
  }, [elementSelected?.id, elementSelected?.sceneType]);

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
  const isEventsLayer = settingUtils.tileEditLayerId === EVENTS_LAYER_ID;
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

    document.addEventListener('wheel', handleTilesetWheel, { capture: true, passive: false });
    return () => document.removeEventListener('wheel', handleTilesetWheel, true);
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

  const handleTitleClick = () => {
    setIsEditingTitle(true);
    // setNewTitle(elementSelected?.name || '');

  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (elementSelected) {
      const sceneToUpdate = scenes.find(scene => scene.id === elementSelected.id);
      console.log('..: RightPanel sceneToUpdate:', sceneToUpdate);

      const updatedElement = { ...sceneToUpdate, name: e.target.value? e.target.value : `SCENE_${sceneToUpdate?._index}` };
      setElementSelected(updatedElement);
      console.log('..: RightPanel updated element:', elementSelected);

      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
      console.log('..: RightPanel updated array:', scenes)
      // window.electronAPI.updateSettings('scene', updatedElement);
    }
  };

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
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
    
    if (dimension === 'width') {
      setMapWidth(clampedValue);
      const updatedElement = { ...elementSelected, width: pixelValue };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => {
        if (scene.id === updatedElement.id) {
          return { ...scene, ...updatedElement, _saved: false };
        }
          return scene;
        })
      );
    } else {
      setMapHeight(clampedValue);
      const updatedElement = { ...elementSelected, height: pixelValue };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => {
        if (scene.id === updatedElement.id) {
          return { ...scene, ...updatedElement, _saved: false };
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
    { label: 'Shooter', value: ETypeScene.SHOOTER },
    { label: 'Point Click', value: ETypeScene.POINTNCLICK },
    { label: 'Logo', value: ETypeScene.LOGO }
  ];

  const imageTypes = [
    { icon: <BgColorsOutlined />, label: 'Palette Bitmap BG', value: EImageType.PALETTE_BITMAP_BG },
    { icon: <PictureOutlined />, label: 'DP Direct Bitmap BG', value: EImageType.DP_DIRECT_BITMAP_BG }
  ];

  const tilesets = availableTilesets;
  const paletteOptions = palettes.palettes.length ? palettes.palettes : loadPaletteLibrary();
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
    // Se a aba atual ficar desabilitada, volta para a default
    const isDisabled =
      (activeLayerKey !== "2" && elementSelected?.sceneType == ETypeScene.LOGO) || elementSelected?.sceneType == ETypeScene.POINTNCLICK;

    if (isDisabled) {
      setActiveLayerKey("2");
    }
  }, [activeLayerKey, elementSelected?.sceneType]);

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

  if (settingUtils.activeSceneObject) {
    return <SceneObjectSettingsForm
      sceneId={settingUtils.activeSceneObject.sceneId}
      type={settingUtils.activeSceneObject.type}
      objectId={settingUtils.activeSceneObject.id}
      availableSprites={availablePlayerSprites}
    />;
  }

  const getSceneScripts = scenes.find(scene => scene.id === elementSelected.id)?.script?.map((script) => script);
  const fadeInEvent = getSceneScripts?.find(script => script.command === EEvents.FADE_IN);
  const hasEnabledFadeIn = Boolean(fadeInEvent && !fadeInEvent.args?.__comment);

  const enableFadeIn = () => {
    const scene = scenes.find(item => item.id === elementSelected.id);
    if (!scene) return;

    const currentScript = [...(scene.script ?? [])];
    const existingFadeIndex = currentScript.findIndex(script => script.command === EEvents.FADE_IN);
    if (existingFadeIndex >= 0) {
      const existingFade = currentScript[existingFadeIndex];
      currentScript[existingFadeIndex] = {
        ...existingFade,
        args: { ...existingFade.args, __comment: false },
      };
    } else {
      currentScript.unshift({ id: uuidv4(), command: EEvents.FADE_IN, args: { ...FadeEvent.defaultValue(), __automatic: true } });
    }

    const updatedScene = { ...scene, script: currentScript, _saved: false };
    setScenes(previous => previous.map(item => item.id === updatedScene.id ? updatedScene : item));
    setElementSelected(updatedScene);
  };

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
      <Space direction="vertical" style={{ width: '100%', zIndex: 50, padding: 10 }}>
        {isEditingTitle ? (
          <Input
            autoFocus
            variant="borderless"
            value={elementSelected.name}
            onChange={handleTitleChange}
            onBlur={handleTitleBlur}
            onPressEnter={handleTitleBlur}
          />
        ) : (
          <Typography.Title level={5} onClick={handleTitleClick} style={{ margin: 0, cursor: 'pointer' }}>
            {elementSelected.name}
          </Typography.Title>
        )}
        <Divider style={{ margin: `${token.margin}px 0` }} />
        {/* <Form.Item name="startSceneId" label="Starting Scene" style={{ flex: 1, textAlign: 'center' }}> */}
        {/* TODO lista de imagens para escolher */}
        {/* </Form.Item> */}
      </Space>
      <Space direction="vertical" style={{ width: '100%' }}>
        {isEditingTiles ? (
          // Tiles Editor Mode - Scene properties + tileset selector
          <Space direction="vertical" style={{ width: '100%', padding: 10 }}>
            <Tabs
              type="card"
              size="small"
              animated={false}
              activeKey={String(settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0)}
              items={[...editableLayerIds.map(layerId => ({ key: String(layerId), label: `Layer ${layerId}`, disabled: isSingleLayerScene })), { key: String(EVENTS_LAYER_ID), label: 'Events' }]}
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
              value={elementSelected.backgrounds?.find(layer => layer.layerId === (settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0))?.paintPaletteId ?? '__default__'}
              onChange={paletteId => {
                const layerId = settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0;
                const backgrounds = elementSelected.backgrounds?.some(layer => layer.layerId === layerId)
                  ? elementSelected.backgrounds.map(layer => layer.layerId === layerId ? { ...layer, paintPaletteId: paletteId === '__default__' ? null : paletteId ?? null } : layer)
                  : [...(elementSelected.backgrounds ?? []), { layerId, paintPaletteId: paletteId === '__default__' ? null : paletteId ?? null }];
                const updated = { ...elementSelected, backgrounds, _saved: false };
                setElementSelected(updated);
                setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
              }}
              options={[{ value: '__default__', label: 'Default (Settings)' }, ...paletteOptions.map(palette => ({ value: palette.id, label: palette.name }))]}
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
                      {palette?.colors.slice(0, 16).map((color, colorIndex) => <i key={colorIndex} style={{ background: color }} />) ?? (isOriginalReservation && Array.from({ length: 16 }, (_, colorIndex) => <i key={colorIndex} style={{ background: colorIndex % 2 ? '#555' : '#333' }} />))}
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
              {elementSelected.sceneType === ETypeScene.SHOOTER && (
                <>
                  <Button block onClick={() => setShowSceneCombatConfig(value => !value)}>
                    {showSceneCombatConfig ? 'Hide Combat Config' : 'Combat Config'}
                  </Button>
                  {showSceneCombatConfig && <CombatConfigEditor settings={settings} setSettings={setSettings} />}
                  <Button block onClick={() => setShowSceneShooterConfig(value => !value)}>
                    {showSceneShooterConfig ? 'Hide Shooter Config' : 'Shooter Config'}
                  </Button>
                  {showSceneShooterConfig && <ShooterConfigEditor settings={settings} setSettings={setSettings} />}
                </>
              )}
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
                activeKey={activeLayerKey}
                onChange={setActiveLayerKey}
                type="card"
                size={'small'}
                items={editableLayerIds.map(key => ({
                  key: String(key),
                  label: `Layer ${key}`,
                  children: (
                    <BackgroundSelector
                      selectedElementId={elementSelected.id}
                      layerKey={key}
                      showPreviewVisibilityToggle
                    />
                  ),
                  }))
                }
              />
              <Divider variant="solid" style={{ margin: `${token.margin}px 0` }} />

              <TileAnimationEditor
                scene={elementSelected}
                tileset={tileset}
                paletteOptions={paletteOptions}
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

              { (elementSelected.sceneType !== ETypeScene.LOGO) && (
                <Content>
                <Typography.Text>Player Sprite Sheet</Typography.Text>
                <Select
                  title="Select player sprite sheet"
                  placeholder="Select player sprite"
                  allowClear
                  value={settings?.playerSpriteId ?? undefined}
                  options={availablePlayerSprites.map(sprite => ({
                    value: sprite.id,
                    label: <PlayerSpriteOption name={sprite.id} path={sprite.path} />,
                  }))}
                  onChange={(value) => setSettings(prev => ({ ...prev, playerSpriteId: value ?? null, _saved: false }))}
                  style={{ width: '100%' }}
                />
                </Content>
              )}
              
            </Space>

            <Tabs 
              // activeKey={'oninit'}
              // onChange={setActiveLayerKey}
              defaultActiveKey='1'
              type="line"
              size={'small'}
              items={
                [
                  {
                    key: '1',
                    label: '  On Init  ',
                    children: (
                      <Content>
                        {!hasEnabledFadeIn && (
                          <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 10 }}
                            message="Fade In necessário"
                            description={fadeInEvent
                              ? 'O Fade In está comentado. Sem ele, a cena não aparecerá na tela.'
                              : 'Esta cena não possui Fade In. Sem ele, a cena não aparecerá na tela.'}
                            action={<Button size="small" type="primary" onClick={enableFadeIn}>{fadeInEvent ? 'Habilitar Fade In' : 'Inserir Fade In'}</Button>}
                          />
                        )}
                        <CollapseEventManager scripts={getSceneScripts} />
                        <SelectNewEvent tabIndex={'1'}/>
                      </Content>
                    )
                  },
                  {
                    key: '2',
                    label: 'On Player Hit',
                    disabled: true,
                    children: (
                      <Tabs
                        defaultActiveKey='1'
                        type="card"
                        size={'small'}
                        items={ groupEvents.map((groupEvent) => (
                          {
                            key: groupEvent.key,
                            label: groupEvent.label,
                            children: (
                              <Content>
                                <CollapseEventManager scripts={getPlayerHitScripts(groupEvent.key)} />
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

export default RightPanel;
