import useAppContexts from '@/providers/contexts/AppContexts';
import { IArgs, IScriptGraph, IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { useI18n } from '@/i18n/I18n';
import { DeleteOutlined, DisconnectOutlined, HomeFilled, HomeOutlined } from '@ant-design/icons';
import { addEdge, Background, Connection, Controls, Edge, Handle, MiniMap, Node, NodeProps, Position, ReactFlow, ReactFlowProvider, reconnectEdge, useEdgesState, useNodesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Drawer, Flex, Tag, Tooltip, Typography, theme } from 'antd';
import React, { ReactElement, ReactNode, cloneElement, useCallback, useEffect, useMemo, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getEventDepthColor } from './EventColors';
import PanelEvents from './PanelEvents';
import { graphToScripts, mergeNewScriptNodes, migrateScriptsToGraph, reachableNodeIds, validateScriptGraph, wouldCreateCycle } from './eventGraph';
import { EEvents, getEventLabel } from './interfaces/IEvents';

export type ScriptKey = 'script' | 'playerHit1Script' | 'playerHit2Script' | 'playerHit3Script' | 'events';
interface Props { open: boolean; onClose: () => void; scriptKey: ScriptKey; addEventControl: ReactNode }
interface EventNodeData extends Record<string, unknown> { event: IScriptsElement; reachable: boolean; entry: boolean; onArgsChange: (id: string, args: IArgs) => void; onDelete: (id: string) => void; onSetEntry: (id: string) => void }
type EventNode = Node<EventNodeData, 'event'>;
type EventEdge = Edge;


function EventFlowNode({ data }: NodeProps<EventNode>) {
  const { token } = theme.useToken();
  const { t } = useI18n();
  const event = data.event, color = getEventDepthColor(0);
  return <div style={{ width: 280, border: `1px solid ${data.reachable ? color : token.colorBorder}`, borderRadius: token.borderRadiusLG, background: event.args?.__comment ? token.colorSuccessBg : token.colorBgContainer, boxShadow: data.entry ? `0 0 0 2px ${token.colorPrimary}` : token.boxShadowSecondary, opacity: data.reachable ? 1 : .72, overflow: 'hidden' }}>
    <Handle id="input" type="target" position={Position.Left} isConnectable />
    <Flex align="center" justify="space-between" style={{ padding: '8px 10px', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
      <Flex align="center" gap={6}><Typography.Text strong style={{ color }}>{getEventLabel(event.command, t)}</Typography.Text>{!data.reachable && <Tag icon={<DisconnectOutlined />}>Draft</Tag>}{event.args?.__comment && <Tag color="success">{t('flow.disabled')}</Tag>}</Flex>
      <Flex><Tooltip title="Set as entry"><Button size="small" type="text" icon={data.entry ? <HomeFilled /> : <HomeOutlined />} onClick={() => data.onSetEntry(event.id)} /></Tooltip><Button aria-label={`Delete ${getEventLabel(event.command, t)}`} size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => data.onDelete(event.id)} /></Flex>
    </Flex>
    <div className="nodrag nopan" style={{ padding: 10, color }}><PanelEvents event={event} customTitle={() => undefined} onValueChange={(_, args) => data.onArgsChange(event.id, args)} /></div>
    {event.command === EEvents.IF ? <><Handle id="then" type="source" position={Position.Right} style={{ top: '35%', background: '#52c41a' }} isConnectable /><Handle id="else" type="source" position={Position.Right} style={{ top: '70%', background: '#ff4d4f' }} isConnectable /></> : <Handle id="next" type="source" position={Position.Right} isConnectable />}
  </div>;
}
const nodeTypes = { event: EventFlowNode };

function FlowCanvas({ scriptKey, addEventControl }: Pick<Props, 'scriptKey' | 'addEventControl'>) {
  const { token } = theme.useToken();
  const { elementSelected, setElementSelected, setScenes, setScripts } = useAppContexts();
  const scripts = (elementSelected?.[scriptKey] ?? []) as IScriptsElement[];
  // The drawer is destroyed when closed, so this snapshot is intentionally created once.
  // Listening to eventGraphs here caused a save -> context update -> graph rebuild loop.
  const initialGraph = useMemo(() => mergeNewScriptNodes(elementSelected?.eventGraphs?.[scriptKey] ?? migrateScriptsToGraph(scripts), scripts), [elementSelected?.id, scriptKey]);
  const reached = useMemo(() => reachableNodeIds(initialGraph), [initialGraph]);
  const selectedRef = useRef(elementSelected);
  const entryRef = useRef(initialGraph.entryNodeId);
  const actionsRef = useRef<{
    updateArgs: (id: string, args: IArgs) => void;
    removeNode: (id: string) => void;
    setEntry: (id: string) => void;
  }>({
    updateArgs: (_id: string, _args: IArgs) => void 0,
    removeNode: (_id: string) => void 0,
    setEntry: (_id: string) => void 0,
  });

  useEffect(() => { selectedRef.current = elementSelected; }, [elementSelected]);

  const persist = useCallback((graph: IScriptGraph) => {
    const selected = selectedRef.current;
    if (!selected) return;
    const graphScripts = graphToScripts(graph);
    const updated = { ...selected, eventGraphs: { ...(selected.eventGraphs ?? {}), [scriptKey]: graph }, [scriptKey]: graphScripts, ...(selected._resourceType === 'script' && scriptKey === 'script' ? { events: graphScripts } : {}), _saved: false };
    selectedRef.current = updated;
    setElementSelected(updated);
    if (selected._resourceType === 'script') setScripts(previous => ({ ...previous, scripts: previous.scripts.map(script => script.id === updated.id ? updated : script), _saved: false }));
    else setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
  }, [scriptKey, setElementSelected, setScenes, setScripts]);

  const makeNodes = useCallback((graph: IScriptGraph): EventNode[] => graph.nodes.map((event, index) => ({ id: event.id, type: 'event', position: event.position ?? { x: 80, y: 90 + index * 145 }, data: { event, reachable: reached.has(event.id), entry: graph.entryNodeId === event.id, onArgsChange: (id, args) => actionsRef.current.updateArgs(id, args), onDelete: id => actionsRef.current.removeNode(id), onSetEntry: id => actionsRef.current.setEntry(id) } })), [reached]);
  const makeEdges = useCallback((graph: IScriptGraph): EventEdge[] => graph.edges.map(edge => ({ ...edge, type: 'smoothstep', animated: reached.has(edge.source), style: { strokeWidth: reached.has(edge.source) ? 2 : 1 } })), [reached]);
  const [nodes, setNodes, onNodesChange] = useNodesState<EventNode>(makeNodes(initialGraph));
  const [edges, setEdges, onEdgesChange] = useEdgesState<EventEdge>(makeEdges(initialGraph));
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const graphFrom = useCallback((nodeState = nodesRef.current, edgeState = edgesRef.current): IScriptGraph => ({ version: 1, entryNodeId: entryRef.current, nodes: nodeState.map(node => ({ ...node.data.event, position: node.position })), edges: edgeState.map(edge => ({ id: edge.id, source: edge.source, sourceHandle: (edge.sourceHandle ?? 'next') as 'next' | 'then' | 'else', target: edge.target, targetHandle: 'input' })) }), []);
  const commit = useCallback((nextNodes: EventNode[], nextEdges: EventEdge[], nextEntry = entryRef.current) => {
    entryRef.current = nextEntry;
    const graph = { ...graphFrom(nextNodes, nextEdges), entryNodeId: nextEntry };
    if (validateScriptGraph(graph).length > 0) return;
    const reachable = reachableNodeIds(graph);
    const decorated = nextNodes.map(node => ({ ...node, data: { ...node.data, reachable: reachable.has(node.id), entry: nextEntry === node.id } }));
    nodesRef.current = decorated;
    edgesRef.current = nextEdges;
    setNodes(decorated);
    setEdges(nextEdges);
    persist({ ...graph, nodes: decorated.map(node => ({ ...node.data.event, position: node.position })) });
  }, [graphFrom, persist, setEdges, setNodes]);

  const updateArgs = useCallback((id: string, args: IArgs) => { const next = nodesRef.current.map(node => node.id === id ? { ...node, data: { ...node.data, event: { ...node.data.event, args: { ...node.data.event.args, ...args } } } } : node); commit(next, edgesRef.current); }, [commit]);
  const removeNode = useCallback((id: string) => { const nextNodes = nodesRef.current.filter(node => node.id !== id), nextEdges = edgesRef.current.filter(edge => edge.source !== id && edge.target !== id); commit(nextNodes, nextEdges, entryRef.current === id ? null : entryRef.current); }, [commit]);
  const setEntry = useCallback((id: string) => commit(nodesRef.current, edgesRef.current, id), [commit]);

  useEffect(() => {
    actionsRef.current = { updateArgs, removeNode, setEntry };
  }, [removeNode, setEntry, updateArgs]);

  const valid = useCallback((connection: Connection) => !!connection.source && !!connection.target && !!connection.sourceHandle && !edgesRef.current.some(edge => edge.source === connection.source && edge.sourceHandle === connection.sourceHandle) && !wouldCreateCycle(graphFrom(), connection.source, connection.target), [graphFrom]);
  const connect = useCallback((connection: Connection) => { if (!valid(connection)) return; const next = addEdge({ ...connection, id: uuidv4(), type: 'smoothstep' }, edgesRef.current); commit(nodesRef.current, next); }, [commit, valid]);
  const deleteEdges = useCallback((deleted: EventEdge[]) => { const ids = new Set(deleted.map(edge => edge.id)), next = edgesRef.current.filter(edge => !ids.has(edge.id)); commit(nodesRef.current, next); }, [commit]);
  const reconnect = useCallback((oldEdge: EventEdge, connection: Connection) => { const remaining = edgesRef.current.filter(edge => edge.id !== oldEdge.id), graph = graphFrom(nodesRef.current, remaining); if (!connection.source || !connection.target || wouldCreateCycle(graph, connection.source, connection.target)) return; commit(nodesRef.current, reconnectEdge(oldEdge, connection, edgesRef.current)); }, [commit, graphFrom]);
  const dragStop = useCallback((_: MouseEvent | TouchEvent, moved: EventNode) => { const next = nodesRef.current.map(node => node.id === moved.id ? { ...node, position: moved.position } : node); commit(next, edgesRef.current); }, [commit]);
  const addDisconnected = useCallback((event: IScriptsElement) => { const node: EventNode = { id: event.id, type: 'event', position: { x: 80, y: 100 + nodesRef.current.length * 60 }, data: { event, reachable: false, entry: false, onArgsChange: (id, args) => actionsRef.current.updateArgs(id, args), onDelete: id => actionsRef.current.removeNode(id), onSetEntry: id => actionsRef.current.setEntry(id) } }; commit([...nodesRef.current, node], edgesRef.current); }, [commit]);
  const addControl = React.isValidElement(addEventControl) ? cloneElement(addEventControl as ReactElement<any>, { onEventCreated: addDisconnected }) : addEventControl;

  return <div style={{ height: '100%', minHeight: 600, position: 'relative' }}><div style={{ position: 'absolute', zIndex: 5, top: 12, right: 12 }}>{addControl}</div><ReactFlow<EventNode, EventEdge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} onEdgesDelete={deleteEdges} onReconnect={reconnect} isValidConnection={valid as any} onNodeDragStop={dragStop} fitView minZoom={.2} snapToGrid snapGrid={[20, 20]} deleteKeyCode={['Backspace', 'Delete']} style={{ background: token.colorBgLayout }}><Background color={token.colorBorderSecondary} gap={20} /><Controls /><MiniMap maskColor={token.colorFillSecondary} nodeColor={getEventDepthColor(0)} style={{ background: token.colorBgContainer }} /></ReactFlow></div>;
}

export default function FlowEditorManager({ open, onClose, scriptKey, addEventControl }: Props) {
  const { t } = useI18n();
  return <Drawer destroyOnClose open={open} placement="right" title={t('flow.title')} width="100vw" onClose={onClose} styles={{ body: { padding: 0 } }}><ReactFlowProvider><FlowCanvas scriptKey={scriptKey} addEventControl={addEventControl} /></ReactFlowProvider></Drawer>;
}
