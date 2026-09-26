import useAppContexts from '@/providers/contexts/AppContexts';
import { EImageType, ETypeScene, IBackgroundElement, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { EVariableType, IVariableDefinition, VariableValue } from '@/providers/contexts/interfaces/IVariablesElement';
import { IScriptDefinition } from '@/providers/contexts/interfaces/IScriptElement';
import { BgColorsOutlined, CaretDownFilled, CaretLeftFilled, CaretRightFilled, CaretUpFilled, PictureOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Divider, Flex, Form, Input, Layout, Radio, Segmented, Select, Space, Tabs, theme, Tooltip, Typography } from 'antd';
import StepInputNumber, { InputNumber } from './StepInputNumber';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { BackgroundSelector } from './BackgroundSelector';
import CollapseEventManager from './events/CollapseEventManager';
import SelectNewEvent from './events/SelectNewEvent';
import FlowEditorManager from './events/FlowEditorManager';
import RightPanelGWSettings from './RightPanelGWSettings';
import FadeEvent from './events/FadeEvent';
import { EEvents } from './events/interfaces/IEvents';
import { loadPaletteLibrary } from './resourceEditors/paletteLibrary';
import imgPlaceholder from '@/img/placeholder.png';
import { joinLocalAssetPath } from '@/utils/localAssetUrl';
import { collectReferenceLocations, ReferenceLocation } from '@/utils/referenceLocations';

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
  const selectReference = (location: ReferenceLocation) => {
    const scene = location.scene && scenes.find(item => (item.name || item.id) === location.scene);
    const referencedScript = !scene && location.script && scripts.scripts.find(item => (item.name || item.id) === location.script);
    setSettingUtils(previous => ({ ...previous, selectedSceneIds: scene ? [scene.id] : [], tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null }));
    setElementSelected(scene || (referencedScript ? { ...referencedScript, script: referencedScript.events, _resourceType: 'script' } : null));
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {isEditingName ? (
        <Input
          autoFocus
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
  const { scripts, scenes, setScripts, setElementSelected, setSettingUtils, elementSelected } = useAppContexts();
  const [isEditingName, setIsEditingName] = useState(false);
  const scriptIndex = scripts.scripts.findIndex(item => item.id === script.id);
  const defaultName = `Script ${Math.max(0, scriptIndex)}`;
  const displayedName = script.name || defaultName;
  const updateScript = (patch: Partial<IScriptDefinition>) => {
    const updated = { ...script, ...patch, _saved: false };
    setScripts(previous => ({ ...previous, scripts: previous.scripts.map(item => item.id === script.id ? updated : item), _saved: false }));
    setElementSelected({ ...updated, script: updated.events, _resourceType: 'script' });
  };
  useEffect(() => {
    if (elementSelected?.id === script.id && elementSelected.script !== script.events) {
      setElementSelected({ ...script, script: script.events, _resourceType: 'script' });
    }
  }, [elementSelected?.id, script, setElementSelected]);
  useEffect(() => {
    if (elementSelected?._resourceType !== 'script' || elementSelected.id !== script.id || !Array.isArray(elementSelected.script) || elementSelected.script === script.events) return;
    updateScript({ events: elementSelected.script });
  }, [elementSelected, script]);
  const locations = collectReferenceLocations(scenes, scripts.scripts, script.id, 'script');
  const selectReference = (location: ReferenceLocation) => {
    const scene = location.scene && scenes.find(item => (item.name || item.id) === location.scene);
    setSettingUtils(previous => ({ ...previous, selectedSceneIds: scene ? [scene.id] : [], tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null }));
    setElementSelected(scene || null);
  };
  return <Content><Space direction="vertical" style={{ width: '100%' }}>{isEditingName ? <Input autoFocus placeholder={defaultName} value={script.name || ''} onChange={event => updateScript({ name: event.target.value })} onBlur={() => { if (!(script.name || '').trim()) updateScript({ name: defaultName }); setIsEditingName(false); }} onPressEnter={event => event.currentTarget.blur()} style={{ margin: 10, width: 'calc(100% - 20px)' }} /> : <Typography.Title level={5} onClick={() => setIsEditingName(true)} style={{ margin: 0, cursor: 'pointer', padding: 10 }}>{displayedName}</Typography.Title>}<Divider style={{ margin: 0 }} /><ReferenceList locations={locations} onSelect={selectReference} /><Tabs style={{ padding: 10 }} items={[{ key: 'script', label: 'Script', children: <Space direction="vertical" style={{ width: '100%' }}><CollapseEventManager scripts={script.events} /><SelectNewEvent tabIndex="1" /></Space> }]} /></Space></Content>;
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
    {isEditingName ? <Input autoFocus value={object.name ?? ''} placeholder={defaultName} onChange={event => update({ name: event.target.value })} onBlur={restoreDefaultName} onPressEnter={restoreDefaultName} /> : <Typography.Title level={5} onClick={() => setIsEditingName(true)} style={{ marginTop: 0, cursor: 'text' }}>{object.name || defaultName}</Typography.Title>}
    <Divider style={{ margin: '8px 0' }} />
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Paragraph style={{ marginBottom: 8 }}>{type === 'actor' ? 'Start Position' : 'Position'}</Typography.Paragraph>
      <Flex gap={8}>
        <InputNumber addonBefore="X" min={type === 'actor' ? 8 : 0} step={type === 'actor' ? 16 : 8} value={object.x} onChange={value => update({ x: positionX(value) })} style={{ width: '50%' }} />
        <InputNumber addonBefore="Y" min={type === 'actor' ? 4 : 0} step={8} value={object.y} onChange={value => update({ y: positionY(value) })} style={{ width: '50%' }} />
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
        <Space.Compact block style={{ width: '100%', gap: 10 }}>
          <Space direction="vertical" size={2} style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text>Movement Speed</Typography.Text>
            {actorMoveSpeedIsCustom ? <InputNumber min={0.01} max={10} step={0.0625} value={actorMoveSpeed} onChange={value => update({ moveSpeed: value ?? 1 })} style={{ width: '100%' }} /> : <Select showSearch optionFilterProp="label" value={actorMoveSpeed} onChange={value => update({ moveSpeed: value === -1 ? 1 : value })} style={{ width: '100%' }}>{actorMoveSpeedOptions.map(option => <Select.Option key={option.value} value={option.value} label={`${option.label} ${option.ppf}`}><span style={{ display: 'flex', justifyContent: 'space-between' }}>{option.label}<span style={{ opacity: 0.6, marginLeft: 8 }}>{option.ppf}</span></span></Select.Option>)}<Select.Option value={-1} label="Custom Speed">Custom Speed</Select.Option></Select>}
          </Space>
          <Space direction="vertical" size={2} style={{ flex: 1, minWidth: 0 }}>
            <Typography.Text>Animation Speed</Typography.Text>
            <Select showSearch optionFilterProp="label" value={(object as any).animationSpeed ?? 6} onChange={animationSpeed => update({ animationSpeed })} style={{ width: '100%' }}>{actorAnimationSpeedOptions.map(option => <Select.Option key={option.value} value={option.value} label={`${option.label} ${option.fps}`}><span style={{ display: 'flex', justifyContent: 'space-between' }}>{option.label}<span style={{ opacity: 0.6, marginLeft: 8 }}>{option.fps}</span></span></Select.Option>)}</Select>
          </Space>
        </Space.Compact>
        <Content>
          <Typography.Text>Sprite Sheet</Typography.Text>
          <Select title="Select actor sprite sheet" placeholder="Select sprite" allowClear showSearch optionFilterProp="label" filterOption={(input, option) => String((option as any)?.searchText ?? '').toLowerCase().includes(input.toLowerCase())} style={{ width: '100%' }} value={(object as any).spriteId} options={spriteResources.map(sprite => { const file = availableSprites.find(item => item.id === sprite.id); const filename = sprite.filename ?? file?.name; const path = file?.path ?? joinLocalAssetPath(settingUtils.localImagePath, filename); return { value: sprite.id, label: <PlayerSpriteOption name={sprite.name} path={path} />, searchText: `${sprite.name} ${sprite.id} ${filename ?? ''}` }; })} onChange={spriteId => update({ spriteId })} />
        </Content>
      </>}
      {type === 'actor' ? (
        <Typography.Text type="secondary">Size: 16 × 8 px</Typography.Text>
      ) : (
        <>
          <Typography.Paragraph style={{ margin: '8px 0' }}>Size</Typography.Paragraph>
          <Flex gap={8}>
            <InputNumber addonBefore="W" min={8} max={triggerMaxWidth} step={8} value={object.width} onChange={value => update({ width: dimension(value, 8, triggerMaxWidth) })} style={{ width: '50%' }} />
            <InputNumber addonBefore="H" min={8} max={triggerMaxHeight} step={8} value={object.height} onChange={value => update({ height: dimension(value, 8, triggerMaxHeight) })} style={{ width: '50%' }} />
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
  const { token } = useToken();
  const { scenes, setScenes, elementSelected, setElementSelected, settings, setSettings, settingUtils, setSettingUtils, palettes } = useAppContexts();
  const isEditingTiles = Boolean(settingUtils.tileEditSceneId);

  const [isEditingTitle, setIsEditingTitle ] = useState(false);
  const [availableTilesets, setAvailableTilesets] = useState<any[]>([]);
  const [availablePlayerSprites, setAvailablePlayerSprites] = useState<any[]>([]);
  const [selectedTiles, setSelectedTiles] = useState<number[]>(elementSelected?.selectedTiles || []);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState({ x: 0, y: 0 });
  const [selectionEnd, setSelectionEnd] = useState({ x: 0, y: 0 });
  const [tilesetZoom, setTilesetZoom] = useState(100);
  const [showTilesetGrid, setShowTilesetGrid] = useState(true);

  const TILE_SIZE = 8;
  const [tileset, setTileset] = useState({
    image: new Image(),
    tileWidth: TILE_SIZE,
    tileHeight: TILE_SIZE,
    columns: 0,
    rows: 0
  });
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

  useEffect(() => {
    if (!elementSelected) return;
    setMapWidth(Math.ceil((elementSelected.width || 240) / TILE_SIZE));
    setMapHeight(Math.ceil((elementSelected.height || 160) / TILE_SIZE));
    if (isSingleLayerScene) {
      setActiveLayerKey('2');
      setSettingUtils(previous => previous.tileEditLayerId === 2 ? previous : { ...previous, tileEditLayerId: 2 });
    }
  }, [elementSelected?.id, elementSelected?.width, elementSelected?.height, isSingleLayerScene, setSettingUtils]);


  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load available tilesets
  useEffect(() => {
    const loadTilesets = async () => {
      try {
        if (window.electronAPI && window.electronAPI.fetchImages) {
          const tilesetsData = await window.electronAPI.fetchImages('tilesets');
          if (tilesetsData.status === 'success') {
            // Convert file names to tileset objects
            const tilesets = tilesetsData.fileImages?.map((filename: string, index: number) => ({
              id: filename.replace(/\.[^/.]+$/, ''), // Remove extension for id
              name: filename,
              path: `${tilesetsData.localPath}/${filename}`
            })) || [];
            setAvailableTilesets(tilesets);
          }
        }
      } catch (error) {
        console.error('Error loading tilesets:', error);
        // A missing asset must remain an empty tileset. Do not invent tiles
        // here: painting without a real tileset is intentionally disabled.
        setAvailableTilesets([]);
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
            path: `${spritesData.localPath}/${filename}`,
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
    loadPlayerSprites();
  }, []);

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
    { label: 'Shoot Em\'Up', value: ETypeScene.SHMUP },
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
      const backgrounds = isEditingTiles
        ? (elementSelected.backgrounds?.some(layer => layer.layerId === editingLayerId)
          ? elementSelected.backgrounds.map(layer => layer.layerId === editingLayerId ? { ...layer, selectedTilesetId: value } : layer)
          : [...(elementSelected.backgrounds ?? []), { layerId: editingLayerId, selectedTilesetId: value }])
        : elementSelected.backgrounds;
      const updatedElement = { ...elementSelected, selectedTilesetId: value, backgrounds };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
    }
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
    const loadTilesetImage = async () => {
      if (selectedTilesetId) {
        try {
          // Load tileset image from project assets
          const tilesetData = await window.electronAPI.fetchImages('tilesets');
          if (tilesetData.status === 'success' && tilesetData.fileImages) {
            const selectedTilesetFile = tilesetData.fileImages.find((filename: string) =>
              filename.replace(/\.[^/.]+$/, '') === selectedTilesetId
            );
            if (selectedTilesetFile) {
              const imagePath = `${tilesetData.localPath}/${selectedTilesetFile}`;
              const img = new Image();
              img.onload = () => {
                // Calculate tileset dimensions based on actual image size
                const tileWidth = 8;
                const tileHeight = 8;
                const columns = Math.floor(img.naturalWidth / tileWidth);
                const rows = Math.floor(img.naturalHeight / tileHeight);
                
                setTileset({
                  image: img,
                  tileWidth,
                  tileHeight,
                  columns,
                  rows
                });
                // drawTileset();
              };
              img.onerror = () => setTileset({ image: new Image(), tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, columns: 0, rows: 0 });
              img.src = imagePath;
            } else {
              setTileset({ image: new Image(), tileWidth: TILE_SIZE, tileHeight: TILE_SIZE, columns: 0, rows: 0 });
            }
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
  }, [elementSelected?.backgrounds, elementSelected?.selectedTilesetId, settingUtils.tileEditLayerId]);

  const drawTileset = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Desliga o filtro de suavização
    ctx.imageSmoothingEnabled = false;

    if (!tileset.columns || !tileset.rows) return;

    // Set canvas size based on tileset
    canvas.width = tileset.columns * tileset.tileWidth;
    canvas.height = tileset.rows * tileset.tileHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // If tileset image is loaded, draw it
    if (tileset.image.complete && tileset.image.naturalWidth > 0) {
      ctx.drawImage(tileset.image, 0, 0);
    }

    if (showTilesetGrid) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= canvas.width; x += tileset.tileWidth) {
        ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, canvas.height); ctx.stroke();
      }
      for (let y = 0; y <= canvas.height; y += tileset.tileHeight) {
        ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(canvas.width, y + 0.5); ctx.stroke();
      }
    }

    // Highlight selected tiles
    if (elementSelected?.selectedTiles && elementSelected.selectedTiles.length > 0) {
      const cols = elementSelected.selectedTiles.map(
        (tileIndex: number) => tileIndex % tileset.columns
      );
      const rows = elementSelected.selectedTiles.map(
        (tileIndex: number) => Math.floor(tileIndex / tileset.columns)
      );

      const minCol = Math.min(...cols);
      const maxCol = Math.max(...cols);
      const minRow = Math.min(...rows);
      const maxRow = Math.max(...rows);

      const totalWidth = (maxCol - minCol + 1) * tileset.tileWidth;
      const totalHeight = (maxRow - minRow + 1) * tileset.tileHeight;

      // Overlay semi-transparente em cada tile (se quiser manter)
      elementSelected.selectedTiles.forEach((tileIndex: number) => {
        const col = tileIndex % tileset.columns;
        const row = Math.floor(tileIndex / tileset.columns);
        ctx.fillStyle = 'rgba(0, 123, 255, 0.2)';
        ctx.fillRect(
          col * tileset.tileWidth,
          row * tileset.tileHeight,
          tileset.tileWidth,
          tileset.tileHeight
        );
      });

      // Borda única em volta do bloco inteiro
      ctx.strokeStyle = '#007bff';
      ctx.lineWidth = 3;
      ctx.strokeRect(
        minCol * tileset.tileWidth,
        minRow * tileset.tileHeight,
        totalWidth,
        totalHeight
      );
    }

  }, [tileset, elementSelected?.selectedTiles, showTilesetGrid]);

  useEffect(() => {
    drawTileset();
  }, [drawTileset]);

  const handleTilesetMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (e.button !== 0) return;
    const scale = tilesetZoom / 100;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    // If Ctrl is pressed, do individual tile selection
    if (false) {
      const col = Math.floor(x / tileset.tileWidth);
      const row = Math.floor(y / tileset.tileHeight);
      const tileIndex = row * tileset.columns + col;
      
      if (tileIndex < tileset.columns * tileset.rows) {
        const currentSelected = elementSelected?.selectedTiles || [];
        let newSelectedTiles: number[];
        
        if (currentSelected.includes(tileIndex)) {
          // Remove tile from selection
          newSelectedTiles = currentSelected.filter((t: number) => t !== tileIndex);
        } else {
          // Add tile to selection
          newSelectedTiles = [...currentSelected, tileIndex];
        }
        
        setSelectedTiles(newSelectedTiles);
        
        // Update elementSelected with selected tiles
        if (elementSelected) {
          const layerId = settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0;
          const updatedElement = { ...elementSelected, selectedTiles: newSelectedTiles, backgrounds: elementSelected.backgrounds?.some(layer => layer.layerId === layerId) ? elementSelected.backgrounds.map(layer => layer.layerId === layerId ? { ...layer, selectedTiles: newSelectedTiles } : layer) : [...(elementSelected.backgrounds ?? []), { layerId, selectedTiles: newSelectedTiles }] };
          setElementSelected(updatedElement);
          setScenes(prevScenes => prevScenes.map(scene => 
            scene.id === updatedElement.id 
              ? { ...scene, ...updatedElement, _saved: false }
              : scene
          ));
        }
      }
      return;
    }

    // Normal rectangular selection
    setSelectionStart({ x, y });
    setSelectionEnd({ x, y });
    setIsSelecting(true);
  };

  const handleTilesetMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSelecting) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scale = tilesetZoom / 100;
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    // If Ctrl is pressed, handle individual tile selection during drag
    if (false) {
      const col = Math.floor(x / tileset.tileWidth);
      const row = Math.floor(y / tileset.tileHeight);
      const tileIndex = row * tileset.columns + col;
      
      if (tileIndex < tileset.columns * tileset.rows) {
        const currentSelected = elementSelected?.selectedTiles || [];
        if (!currentSelected.includes(tileIndex)) {
          // Add tile to selection
          const newSelectedTiles = [...currentSelected, tileIndex];
          setSelectedTiles(newSelectedTiles);
          
          // Update elementSelected with selected tiles
          if (elementSelected) {
            const layerId = settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0;
            const updatedElement = { ...elementSelected, selectedTiles: newSelectedTiles, backgrounds: elementSelected.backgrounds?.some(layer => layer.layerId === layerId) ? elementSelected.backgrounds.map(layer => layer.layerId === layerId ? { ...layer, selectedTiles: newSelectedTiles } : layer) : [...(elementSelected.backgrounds ?? []), { layerId, selectedTiles: newSelectedTiles }] };
            setElementSelected(updatedElement);
            setScenes(prevScenes => prevScenes.map(scene => 
              scene.id === updatedElement.id 
                ? { ...scene, ...updatedElement, _saved: false }
                : scene
            ));
          }
        }
      }
      return;
    }

    setSelectionEnd({ x, y });
  };

  const handleTilesetMouseUp = () => {
    if (!isSelecting) return;

    setIsSelecting(false);

    // Calculate selected tiles for rectangular selection (only if not using Ctrl)
    const startCol = Math.floor(Math.min(selectionStart.x, selectionEnd.x) / tileset.tileWidth);
    const endCol = Math.floor(Math.max(selectionStart.x, selectionEnd.x) / tileset.tileWidth);
    const startRow = Math.floor(Math.min(selectionStart.y, selectionEnd.y) / tileset.tileHeight);
    const endRow = Math.floor(Math.max(selectionStart.y, selectionEnd.y) / tileset.tileHeight);

    const newSelectedTiles: number[] = [];
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const tileIndex = row * tileset.columns + col;
        if (tileIndex < tileset.columns * tileset.rows) {
          newSelectedTiles.push(tileIndex);
        }
      }
    }

    setSelectedTiles(newSelectedTiles);

    // Update elementSelected with selected tiles
    if (elementSelected) {
      const layerId = settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0;
      const updatedElement = { ...elementSelected, selectedTiles: newSelectedTiles, backgrounds: elementSelected.backgrounds?.some(layer => layer.layerId === layerId) ? elementSelected.backgrounds.map(layer => layer.layerId === layerId ? { ...layer, selectedTiles: newSelectedTiles } : layer) : [...(elementSelected.backgrounds ?? []), { layerId, selectedTiles: newSelectedTiles }] };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene => 
        scene.id === updatedElement.id 
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      ));
    }
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
            <Segmented
              block
              value={settingUtils.tileEditLayerId ?? elementSelected.backgrounds?.[0]?.layerId ?? 0}
              options={[...editableLayerIds.map(layerId => ({ value: layerId, label: `Layer ${layerId}` })), { value: EVENTS_LAYER_ID, label: 'Events' }]}
              onChange={layerId => setSettingUtils(previous => ({
                ...previous,
                tileEditLayerId: layerId as number,
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
                  <span>Selected tiles: {selectedTiles.length}</span>
                  <span>Map size: {mapWidth * TILE_SIZE} x {mapHeight * TILE_SIZE} px</span>
                </Space>
                <Space direction="vertical" size="small">
                  <span><strong>Map Size (in tiles):</strong></span>
                  <Space>
                    <div>
                      <span>Width: </span>
                      <InputNumber
                        min={30}
                        max={128}
                        value={mapWidth}
                        onChange={(value) => handleMapSizeChange('width', (value || 30) * TILE_SIZE, elementSelected.id)}
                        formatter={(value) => `${value} tiles`}
                        parser={(value) => parseInt(value?.replace(' tiles', '') || '30')}
                      />
                    </div>
                    <div>
                      <span>Height: </span>
                      <InputNumber
                        min={20}
                        max={128}
                        value={mapHeight}
                        onChange={(value) => handleMapSizeChange('height', (value || 20) * TILE_SIZE, elementSelected.id)}
                        formatter={(value) => `${value} tiles`}
                        parser={(value) => parseInt(value?.replace(' tiles', '') || '20')}
                      />
                    </div>
                    <Checkbox checked={showTilesetGrid} onChange={event => setShowTilesetGrid(event.target.checked)}>Grid</Checkbox>
                  </Space>
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    Minimum: 240x160px (30x20 tiles) | Maximum: 1024x1024px (128x128 tiles)
                  </span>
                </Space>
              </Space>
            </Content>
            <Content style={{ 
              width: '100%', 
              height: '100%',
              border: '4px solid #ccc', 
              backgroundColor: '#f5f5f5',
              overflow: 'auto',
              position: 'relative'
            }}>
              {tileset.columns > 0 && tileset.rows > 0 ? <canvas
                  ref={canvasRef}
                  width={tileset.columns * tileset.tileWidth}
                  height={tileset.rows * tileset.tileHeight}
                  onMouseDown={handleTilesetMouseDown}
                  onMouseMove={handleTilesetMouseMove}
                  onMouseUp={handleTilesetMouseUp}
                  onWheel={event => { if (!event.ctrlKey) return; event.preventDefault(); setTilesetZoom(value => Math.max(50, Math.min(400, value + (event.deltaY < 0 ? 25 : -25)))); }}
                  style={{ cursor: 'crosshair', display: 'block', width: `${tileset.columns * tileset.tileWidth * tilesetZoom / 100}px`, height: `${tileset.rows * tileset.tileHeight * tilesetZoom / 100}px` }}
                /> : <div
                  role="img"
                  aria-label="No Data"
                  style={{ minHeight: 160, minWidth: 240, display: 'grid', placeItems: 'center', color: '#999', fontSize: 16, userSelect: 'none' }}
                ><img src={imgPlaceholder} alt="No Data" style={{ width: 96, height: 96, objectFit: 'contain', opacity: .7 }} /></div>}
              {/* Selection overlay */}
              {isSelecting && (
                <div
                  style={{
                    position: 'absolute',
                    // Selection coordinates are stored in native tileset
                    // pixels; scale the overlay to match the zoomed canvas.
                    left: Math.min(selectionStart.x, selectionEnd.x) * tilesetZoom / 100,
                    top: Math.min(selectionStart.y, selectionEnd.y) * tilesetZoom / 100,
                    width: Math.abs(selectionEnd.x - selectionStart.x) * tilesetZoom / 100,
                    height: Math.abs(selectionEnd.y - selectionStart.y) * tilesetZoom / 100,
                    backgroundColor: 'rgba(0, 123, 255, 0.3)',
                    border: '2px solid #007bff',
                    boxSizing: 'border-box',
                    pointerEvents: 'none'
                  }}
                />
              )}
            </Content>
            <Select
              placeholder="Select Tileset"
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
            <Divider style={{ margin: `${token.margin}px 0` }} />
            <Space direction="vertical" style={{ width: '100%' }}>
              <Typography.Text strong>Instructions:</Typography.Text>
              <Typography.Text>1. Click and drag on tileset to select tiles</Typography.Text>
              <Typography.Text>2. Click and drag on map to paint tiles</Typography.Text>
              <Typography.Text>3. Selected tiles</Typography.Text>
            </Space>
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
              <Typography.Text>Camera View</Typography.Text>
              <Checkbox 
                defaultChecked={elementSelected.showCamera} 
                onChange={check => handleChangeCameraView(check.target.checked)}
              >
                Show Camera on View
              </Checkbox>
              <Space.Compact block>
                <InputNumber
                  addonBefore="X"
                  step={8}
                  value={elementSelected.cameraPosition?.x ?? 0}
                  onChange={value => handleChangeCameraPosition('x', value)}
                  style={{ width: '50%' }}
                />
                <InputNumber
                  addonBefore="Y"
                  step={8}
                  value={elementSelected.cameraPosition?.y ?? 0}
                  onChange={value => handleChangeCameraPosition('y', value)}
                  style={{ width: '50%' }}
                />
              </Space.Compact>
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
