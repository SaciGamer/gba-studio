import { isModalOpen } from '@/utils/isModalOpen';
import useAppContexts from '@/providers/contexts/AppContexts';
import { ISceneSettings, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { useI18n } from '@/i18n/I18n';
import {
  AimOutlined,
  AppstoreAddOutlined,
  AuditOutlined,
  BorderOutlined,
  DeleteOutlined,
  LinkOutlined,
  PictureFilled,
  PlusSquareFilled,
  TableOutlined,
} from '@ant-design/icons';
import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowInstance,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { App, Badge, Card, Flex, Tag, theme, Typography } from 'antd';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import FloatButtons, { IActions, SubMenuType } from '../FloatButtons';
import { joinLocalAssetPath, toLocalAssetUrl } from '@/utils/localAssetUrl';
import { EEvents } from '../events/interfaces/IEvents';
import { createSceneFadeIn } from '@/utils/createSceneFadeIn';
import { clearDeletedSceneReferences } from '../../../../../shared/events/sceneReferenceCleanup';

interface SceneNodeData extends Record<string, unknown> {
  scene: ISceneSettings;
  previewUrl?: string;
  transitions: number;
  imageWidth: number;
  imageHeight: number;
  selectionRole?: 'primary' | 'secondary';
}

type SceneFlowNode = Node<SceneNodeData, 'scene'>;

interface TransitionData extends Record<string, unknown> {
  sourceSceneId: string;
  targetSceneId: string;
  eventId: string;
  owner: string;
  invalid: boolean;
}

type TransitionEdge = Edge<TransitionData>;

interface SceneWorldGraphProps {
  resetPanelSize: () => void;
  setShowFloatButton: (show: boolean) => void;
  showFloatButton: boolean;
  onOpenSceneEditor: (tool?: string) => void;
  onOpenPalettes: () => void;
}

function SceneNodeCard({ data, selected }: NodeProps<SceneFlowNode>) {
  const { token } = theme.useToken();
  const { scene, previewUrl, transitions, imageWidth, imageHeight, selectionRole } = data;
  const secondarySelected = selectionRole === 'secondary';
  const cardWidth = Math.max(270, Math.min(imageWidth + 32, 640));
  const previewHeight = Math.max(170, Math.min(
    Math.round((imageHeight / Math.max(imageWidth, 1)) * (cardWidth - 32)),
    420,
  ));
  return (
    <Card
      size="small"
      title={<Typography.Text ellipsis style={{ maxWidth: 175 }}>{scene.name}</Typography.Text>}
      extra={<Badge count={transitions} showZero={false} color={token.colorPrimary} />}
      styles={{ body: { padding: 0 } }}
      style={{
        width: cardWidth,
        overflow: 'hidden',
        borderColor: selected ? (secondarySelected ? token.colorPrimaryBorder : token.colorPrimary) : token.colorBorder,
        boxShadow: selected ? `0 0 0 ${secondarySelected ? 1 : 2}px ${token.colorPrimaryBorder}` : token.boxShadowTertiary,
        background: secondarySelected ? token.colorFillSecondary : token.colorBgContainer,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ width: 10, height: 10 }} />
      <div style={{ position: 'relative', height: previewHeight, overflow: 'hidden', background: token.colorFillQuaternary }}>
        {previewUrl ? (
          <img src={previewUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' }} />
        ) : (
          <Flex align="center" justify="center" style={{ height: '100%' }}><PictureFilled style={{ fontSize: 42, color: token.colorTextQuaternary }} /></Flex>
        )}
        <Flex gap={4} style={{ position: 'absolute', left: 6, bottom: 6 }}>
          <Tag bordered={false}>{scene.sceneType ?? 'Scene'}</Tag>
          {!!scene.triggers?.length && <Tag color="green" bordered={false}>{scene.triggers.length} triggers</Tag>}
        </Flex>
      </div>
      <Handle type="source" position={Position.Right} style={{ width: 10, height: 10 }} />
    </Card>
  );
}

const nodeTypes = { scene: SceneNodeCard };

function walkTransitions(items: IScriptsElement[] | undefined, visit: (event: IScriptsElement) => void) {
  (items ?? []).forEach(event => {
    if (event.args?.__comment !== true) visit(event);
    walkTransitions(event.children?.then, visit);
    walkTransitions(event.children?.else, visit);
  });
}

function deriveTransitions(scenes: ISceneSettings[]): TransitionEdge[] {
  const validIds = new Set(scenes.filter(scene => !scene._deleted).map(scene => scene.id));
  const edges: TransitionEdge[] = [];
  scenes.filter(scene => !scene._deleted).forEach(scene => {
    const collect = (items: IScriptsElement[] | undefined, owner: string) => walkTransitions(items, event => {
      if (event.command !== 'EVENT_CHANGE_SCENE') return;
      const targetSceneId = String((event.args as { sceneId?: string } | undefined)?.sceneId ?? '');
      const invalid = !targetSceneId || !validIds.has(targetSceneId);
      edges.push({
        id: `${scene.id}:${owner}:${event.id}`,
        source: scene.id,
        target: invalid ? scene.id : targetSceneId,
        type: 'smoothstep',
        animated: !invalid,
        selectable: true,
        markerEnd: { type: 'arrowclosed' as never },
        label: owner,
        style: { stroke: invalid ? '#ff4d4f' : undefined, strokeDasharray: invalid ? '7 5' : undefined, strokeWidth: 2 },
        labelStyle: { fontSize: 11 },
        data: { sourceSceneId: scene.id, targetSceneId, eventId: event.id, owner, invalid },
      });
    });
    collect(scene.script, 'Scene');
    collect(scene.playerHit1Script, 'Hit 1');
    collect(scene.playerHit2Script, 'Hit 2');
    collect(scene.playerHit3Script, 'Hit 3');
    scene.triggers?.forEach((trigger, index) => collect(trigger.script, trigger.name || `Trigger ${index + 1}`));
  });
  return edges;
}

function WorldGraphCanvas({ resetPanelSize, setShowFloatButton, showFloatButton, onOpenSceneEditor, onOpenPalettes }: SceneWorldGraphProps) {
  const { token } = theme.useToken();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const { scenes, setScenes, scripts, setScripts, backgrounds, settingUtils, setSettingUtils, elementSelected, setElementSelected, userSettings, setUserSettings } = useAppContexts();
  const [instance, setInstance] = useState<ReactFlowInstance<SceneFlowNode, TransitionEdge> | null>(null);
  const [showConnections, setShowConnections] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const derivedEdges = useMemo(() => deriveTransitions(scenes), [scenes]);
  const selectedSceneIds = settingUtils.selectedSceneIds ?? (elementSelected?.id ? [elementSelected.id] : []);
  const transitionCounts = useMemo(() => derivedEdges.reduce<Record<string, number>>((counts, edge) => {
    counts[edge.source] = (counts[edge.source] ?? 0) + 1;
    return counts;
  }, {}), [derivedEdges]);

  const initialNodes = useMemo<SceneFlowNode[]>(() => scenes.filter(scene => !scene._deleted).map(scene => {
    const sceneBackgrounds = (scene.backgrounds ?? [])
      .map(layer => backgrounds.find(background => !background._deleted && background.id === layer.backgroundId))
      .filter((background): background is NonNullable<typeof background> => Boolean(background));
    const backgroundRef = sceneBackgrounds.reduce((largest, current) => {
      const largestArea = (largest?.imageWidth ?? 0) * (largest?.imageHeight ?? 0);
      const currentArea = (current.imageWidth ?? 0) * (current.imageHeight ?? 0);
      return currentArea > largestArea ? current : largest;
    }, sceneBackgrounds[0]);
    const previewUrl = backgroundRef
      ? joinLocalAssetPath(
        backgroundRef.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath,
        backgroundRef.filename,
      )
      : toLocalAssetUrl(scene.background);
    const imageWidth = Math.max(
      scene.width || 0,
      ...sceneBackgrounds.map(background => background.imageWidth || 0),
      240,
    );
    const imageHeight = Math.max(
      scene.height || 0,
      ...sceneBackgrounds.map(background => background.imageHeight || 0),
      160,
    );
    return {
      id: scene.id,
      type: 'scene',
      position: scene.editorPosition ?? { x: scene.x || 0, y: scene.y || 0 },
      data: {
        scene,
        previewUrl,
        transitions: transitionCounts[scene.id] ?? 0,
        imageWidth,
        imageHeight,
        selectionRole: scene.id === elementSelected?.id ? 'primary' : selectedSceneIds.includes(scene.id) ? 'secondary' : undefined,
      },
      selected: selectedSceneIds.includes(scene.id),
    };
  }), [backgrounds, elementSelected?.id, scenes, selectedSceneIds, settingUtils.localImagePath, settingUtils.localImagePathHD, transitionCounts]);

  const [nodes, setNodes, onNodesChange] = useNodesState<SceneFlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<TransitionEdge>(showConnections ? derivedEdges : []);
  useEffect(() => setNodes(initialNodes), [initialNodes, setNodes]);
  useEffect(() => setEdges(showConnections ? derivedEdges : []), [derivedEdges, setEdges, showConnections]);

  const selectScene = useCallback((sceneId: string, append = false) => {
    const current = settingUtils.selectedSceneIds ?? (elementSelected?.id ? [elementSelected.id] : []);
    const ids = append
      ? (current.includes(sceneId) ? current.filter(id => id !== sceneId) : [...current, sceneId])
      : [sceneId];
    const activeId = append && current.includes(sceneId) ? ids.at(-1) : sceneId;
    setSettingUtils(previous => ({ ...previous, selectedSceneIds: ids }));
    setElementSelected(scenes.find(item => item.id === activeId) ?? null);
  }, [elementSelected?.id, scenes, setElementSelected, setSettingUtils, settingUtils.selectedSceneIds]);

  const createSceneAt = useCallback((position: { x: number; y: number }) => {
    const index = scenes.reduce((max, scene) => Math.max(max, scene._index ?? 0), -1) + 1;
    const snapped = snapToGrid ? { x: Math.round(position.x / 16) * 16, y: Math.round(position.y / 16) * 16 } : position;
    const scene: ISceneSettings = {
      id: uuidv4(),
      _resourceType: 'scene',
      _index: index,
      _saved: false,
      _deleted: false,
      name: `SCENE ${index}`,
      x: snapped.x,
      y: snapped.y,
      editorPosition: snapped,
      width: 240,
      height: 160,
      cameraPosition: { x: 0, y: 0 },
      gridSize: 8,
      renderMode: 'regular_tilemap',
      backgrounds: [],
      collisions: [],
      triggers: [],
      actors: [],
      spawnPoints: [{ id: uuidv4(), name: 'Default', x: 0, y: 0, direction: 'right' }],
      // A scene begins with a black screen in Butano until it fades in.
      // Keep this as the first event so newly-created scenes are immediately visible.
      script: [createSceneFadeIn()],
    };
    setScenes(previous => [...previous, scene]);
    setElementSelected(scene);
    setSettingUtils(previous => ({ ...previous, activeButton: 'select', activeSubButton: '', selectedSceneIds: [scene.id] }));
    message.success(t('world.sceneCreated', { name: scene.name }));
  }, [message, scenes, setElementSelected, setScenes, setSettingUtils, snapToGrid, t]);

  const addTrigger = useCallback(() => {
    if (!elementSelected) return;
    const trigger = { id: uuidv4(), sceneId: elementSelected.id, name: `Trigger ${(elementSelected.triggers?.length ?? 0) + 1}`, x: 16, y: 16, width: 32, height: 32, activation: 'enter' as const, enabled: true, once: false, cooldownFrames: 0, script: [], onEnterScript: [], onLeaveScript: [] };
    const updated = { ...elementSelected, triggers: [...(elementSelected.triggers ?? []), trigger], _saved: false };
    setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
    setElementSelected(updated);
    setSettingUtils(previous => ({ ...previous, activeButton: 'trigger', activeSubButton: '' }));
    onOpenSceneEditor('trigger');
  }, [elementSelected, onOpenSceneEditor, setElementSelected, setScenes, setSettingUtils]);

  const addActor = useCallback(() => {
    if (!elementSelected) return;
    const actorId = uuidv4();
    const actor = { id: actorId, actorId, name: `Actor ${(elementSelected.actors?.length ?? 0) + 1}`, x: 16, y: 16, width: 16, height: 16, direction: 'right' };
    const updated = { ...elementSelected, actors: [...(elementSelected.actors ?? []), actor], _saved: false };
    setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
    setElementSelected(updated);
    setSettingUtils(previous => ({ ...previous, activeButton: 'actor', activeSubButton: '' }));
    onOpenSceneEditor('actor');
  }, [elementSelected, onOpenSceneEditor, setElementSelected, setScenes, setSettingUtils]);

  const deleteSelected = useCallback(() => {
    if (!elementSelected) return;
    modal.confirm({
      title: t('world.confirmDelete', { name: elementSelected.name }),
      content: t('world.deleteWarning'),
      okButtonProps: { danger: true },
      okText: t('common.delete'),
      cancelText: t('common.cancel'),
      onOk: () => {
        const deletedIds = new Set([elementSelected.id]);
        setScenes(previous => previous.map(scene => {
          const cleared = clearDeletedSceneReferences(scene, deletedIds);
          if (scene.id === elementSelected.id) return { ...cleared.value, _saved: false, _deleted: true };
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
        setElementSelected(null);
        setSettingUtils(previous => ({ ...previous, selectedSceneIds: [] }));
        message.success(t('world.sceneDeleted', { name: elementSelected.name }));
      },
    });
  }, [elementSelected, message, modal, setElementSelected, setScenes, setScripts, setSettingUtils, t]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isModalOpen()) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key.toLowerCase() === 'v') setSettingUtils(previous => ({ ...previous, activeButton: 'select', activeSubButton: '' }));
      if (event.key.toLowerCase() === 's') setSettingUtils(previous => ({ ...previous, activeButton: 'add', activeSubButton: 'Scene' }));
      if (event.key.toLowerCase() === 't' && elementSelected) addTrigger();
      if (event.key.toLowerCase() === 'a' && elementSelected) addActor();
      if (event.key === 'Delete' && elementSelected) deleteSelected();
      if (event.key === 'Escape') setSettingUtils(previous => ({ ...previous, activeButton: 'select', activeSubButton: '' }));
    };
    document.addEventListener('keydown', onKeyDown);
    window.electronAPI?.on?.('scene-delete', deleteSelected);
    window.addEventListener('gba-studio:scene-delete', deleteSelected);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.electronAPI?.removeListener?.('scene-delete', deleteSelected);
      window.removeEventListener('gba-studio:scene-delete', deleteSelected);
    };
  }, [addActor, addTrigger, deleteSelected, elementSelected, setSettingUtils]);

  const actions: IActions[] = [
    { key: 'select', icon: <AimOutlined />, tooltip: `${t('world.select')} (V)`, active: settingUtils.activeButton === 'select' },
    { key: 'add', type: SubMenuType.DROPDOWN, icon: <AppstoreAddOutlined />, active: settingUtils.activeButton === 'add', subMenu: { items: [
      { key: 'Scene', icon: <PictureFilled />, tooltip: `${t('world.addScene')} (S)`, active: settingUtils.activeSubButton === 'Scene', onClick: () => undefined },
      { key: 'Actor', icon: <AuditOutlined />, tooltip: `${t('world.addActor')} (A)`, active: false, disabled: !elementSelected, onClick: addActor },
      { key: 'Trigger', icon: <PlusSquareFilled />, tooltip: `${t('world.addTrigger')} (T)`, active: false, disabled: !elementSelected, onClick: addTrigger },
    ] } },
    { key: 'connections', icon: <LinkOutlined />, tooltip: t('world.connections'), active: showConnections, onClick: () => setShowConnections(value => !value) },
    { key: 'grid', icon: <TableOutlined />, tooltip: t('world.grid'), active: snapToGrid, onClick: () => setSnapToGrid(value => !value) },
    { key: 'collision', icon: <BorderOutlined />, tooltip: 'Collision', disabled: !elementSelected, onClick: () => { setSettingUtils(previous => ({ ...previous, activeButton: 'collision', activeSubButton: '' })); onOpenSceneEditor('collision'); } },
    { key: 'delete', icon: <DeleteOutlined />, tooltip: t('common.delete'), disabled: !elementSelected, onClick: deleteSelected },
  ];

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    if (settingUtils.activeSubButton === 'Scene' && instance) {
      createSceneAt(instance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    } else {
      setElementSelected(null);
      setSettingUtils(previous => ({ ...previous, selectedSceneIds: [] }));
    }
  }, [createSceneAt, instance, setElementSelected, settingUtils.activeSubButton]);

  const onNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: SceneFlowNode) => {
    const dragged = scenes.find(scene => scene.id === node.id);
    if (!dragged) return;
    const original = dragged.editorPosition ?? { x: dragged.x, y: dragged.y };
    const delta = { x: node.position.x - original.x, y: node.position.y - original.y };
    const ids = selectedSceneIds.includes(node.id) ? selectedSceneIds : [node.id];
    let active: ISceneSettings | null = null;
    setScenes(previous => previous.map(scene => {
      if (!ids.includes(scene.id)) return scene;
      const position = scene.editorPosition ?? { x: scene.x, y: scene.y };
      const updated = { ...scene, x: position.x + delta.x, y: position.y + delta.y, editorPosition: { x: position.x + delta.x, y: position.y + delta.y }, _saved: false };
      if (scene.id === elementSelected?.id) active = updated;
      return updated;
    }));
    if (active) setElementSelected(active);
  }, [elementSelected?.id, scenes, selectedSceneIds, setElementSelected, setScenes]);

  const onMoveEnd = useCallback((_: unknown, viewport: { x: number; y: number; zoom: number }) => {
    setUserSettings(previous => ({ ...previous, worldScrollX: viewport.x, worldScrollY: viewport.y, zoom: Math.round(viewport.zoom * 100), _saved: false }));
  }, [setUserSettings]);

  return (
    <div ref={wrapperRef} style={{ width: '100%', height: '100%', minHeight: 400, position: 'relative' }} onMouseMove={event => setPointer({ x: event.clientX, y: event.clientY })} onMouseLeave={() => setPointer(null)}>
      <FloatButtons actions={actions} onResetPanelSize={resetPanelSize} onShowFloatButton={setShowFloatButton} showFloatButton={showFloatButton} />
      {settingUtils.activeSubButton === 'Scene' && pointer && createPortal(
        <div style={{ position: 'fixed', left: pointer.x, top: pointer.y, width: 135, height: 90, border: `2px dashed ${token.colorPrimary}`, background: token.colorPrimaryBg, borderRadius: token.borderRadius, pointerEvents: 'none', zIndex: 2000 }} />,
        document.body,
      )}
      <ReactFlow<SceneFlowNode, TransitionEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onInit={setInstance}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(event, node) => selectScene(node.id, event.shiftKey)}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onEdgeDoubleClick={(_, edge) => { selectScene(edge.source); message.info(`${edge.data?.owner}: ${edge.data?.targetSceneId || 'invalid target'}`); }}
        onMoveEnd={onMoveEnd}
        defaultViewport={{ x: userSettings.worldScrollX ?? 0, y: userSettings.worldScrollY ?? 0, zoom: (userSettings.zoom ?? 100) / 100 }}
        minZoom={0.1}
        maxZoom={4}
        snapToGrid={snapToGrid}
        snapGrid={[16, 16]}
        panOnDrag={[1, 2]}
        selectionOnDrag
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
        fitView={scenes.length > 0 && !userSettings.worldScrollX && !userSettings.worldScrollY}
        style={{ background: token.colorBgLayout, cursor: settingUtils.activeSubButton === 'Scene' ? 'crosshair' : undefined }}
      >
        <Background variant={BackgroundVariant.Lines} gap={16} size={1} color={token.colorBorderSecondary} />
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap pannable zoomable maskColor={token.colorFillSecondary} nodeColor={token.colorPrimary} style={{ background: token.colorBgContainer }} />
      </ReactFlow>
    </div>
  );
}

export default function SceneWorldGraph(props: SceneWorldGraphProps) {
  return <ReactFlowProvider><WorldGraphCanvas {...props} /></ReactFlowProvider>;
}
