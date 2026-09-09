import useAppContexts from "@/providers/contexts/AppContexts";
import { IArgs, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { DeleteOutlined } from "@ant-design/icons";
import {
  Background,
  Controls,
  Edge,
  Handle,
  MiniMap,
  Node,
  NodeProps,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button, Drawer, Flex, Tag, Typography, theme } from "antd";
import { ReactNode, useCallback, useEffect, useMemo } from "react";
import PanelEvents from "./PanelEvents";
import { EEvents, EVENT_INFO } from "./interfaces/IEvents";

export type ScriptKey = "script" | "playerHit1Script" | "playerHit2Script" | "playerHit3Script";

interface EventNodeData extends Record<string, unknown> {
  event: IScriptsElement;
  onArgsChange: (id: string, args: IArgs) => void;
  onDelete: (id: string) => void;
}

type EventNode = Node<EventNodeData, "event">;

interface FlowEditorManagerProps {
  open: boolean;
  onClose: () => void;
  scriptKey: ScriptKey;
  addEventControl: ReactNode;
}

const eventTitle = (event: IScriptsElement) =>
  EVENT_INFO[event.command as EEvents]?.name || event.command;

function EventFlowNode({ data }: NodeProps<EventNode>) {
  const { token } = theme.useToken();
  const { event, onArgsChange, onDelete } = data;
  const isDisabled = event.args?.__comment === true;

  return (
    <div
      className="nodrag"
      style={{
        width: 280,
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadiusLG,
        background: isDisabled ? token.colorSuccessBg : token.colorBgContainer,
        boxShadow: token.boxShadowSecondary,
        overflow: "hidden",
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Flex align="center" justify="space-between" style={{ padding: "8px 10px", borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Typography.Text strong>{eventTitle(event)}</Typography.Text>
        <Flex align="center" gap={4}>
          {isDisabled && <Tag color="success">Disabled</Tag>}
          <Button
            aria-label={`Delete ${eventTitle(event)}`}
            icon={<DeleteOutlined />}
            size="small"
            type="text"
            onClick={() => onDelete(event.id)}
          />
        </Flex>
      </Flex>
      <div className="nodrag nopan" style={{ padding: 10 }}>
        <PanelEvents
          event={event}
          customTitle={() => undefined}
          onValueChange={(id, args) => onArgsChange(id, args)}
        />
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

const nodeTypes = { event: EventFlowNode };

function FlowCanvas({ scriptKey, addEventControl }: Pick<FlowEditorManagerProps, "scriptKey" | "addEventControl">) {
  const { elementSelected, setElementSelected, setScenes } = useAppContexts();
  const { token } = theme.useToken();
  const scripts = (elementSelected?.[scriptKey] || []) as IScriptsElement[];

  const updateScripts = useCallback((nextScripts: IScriptsElement[]) => {
    if (!elementSelected) return;

    const updatedElement = { ...elementSelected, [scriptKey]: nextScripts };
    setElementSelected(updatedElement);
    setScenes(prevScenes => prevScenes.map(scene =>
      scene.id === elementSelected.id
        ? { ...scene, [scriptKey]: nextScripts, _saved: false }
        : scene
    ));
  }, [elementSelected, scriptKey, setElementSelected, setScenes]);

  const updateArgs = useCallback((id: string, args: IArgs) => {
    updateScripts(scripts.map(script => script.id === id ? { ...script, args } : script));
  }, [scripts, updateScripts]);

  const deleteEvent = useCallback((id: string) => {
    updateScripts(scripts.filter(script => script.id !== id));
  }, [scripts, updateScripts]);

  const initialNodes = useMemo<EventNode[]>(() => scripts.map((event, index) => ({
    id: event.id,
    type: "event",
    position: event.position || { x: 80 + index * 340, y: 140 },
    data: { event, onArgsChange: updateArgs, onDelete: deleteEvent },
  })), [deleteEvent, scripts, updateArgs]);

  const edges = useMemo<Edge[]>(() => scripts.slice(0, -1).map((script, index) => ({
    id: `${script.id}-${scripts[index + 1].id}`,
    source: script.id,
    target: scripts[index + 1].id,
    type: "smoothstep",
    animated: false,
  })), [scripts]);

  const [nodes, setNodes, onNodesChange] = useNodesState<EventNode>(initialNodes);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  const onNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: EventNode) => {
    updateScripts(scripts.map(script => script.id === node.id
      ? { ...script, position: node.position }
      : script
    ));
  }, [scripts, updateScripts]);

  return (
    <div style={{ height: "100%", minHeight: 600, position: "relative" }}>
      <div style={{ position: "absolute", zIndex: 5, top: 12, right: 12 }}>
        {addEventControl}
      </div>
      <ReactFlow<EventNode, Edge>
        edges={edges}
        fitView
        minZoom={0.2}
        nodes={nodes}
        nodeTypes={nodeTypes}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
        nodesDraggable
        nodesConnectable={false}
        edgesFocusable={false}
        elementsSelectable
        style={{ background: token.colorBgLayout }}
      >
        <Background color={token.colorBorderSecondary} gap={20} />
        <Controls style={{ background: token.colorBgContainer, border: `1px solid ${token.colorBorder}` }} />
        <MiniMap
          maskColor={token.colorFillSecondary}
          nodeColor={token.colorPrimaryBg}
          style={{ background: token.colorBgContainer, border: `1px solid ${token.colorBorder}` }}
        />
      </ReactFlow>
    </div>
  );
}

export default function FlowEditorManager({ open, onClose, scriptKey, addEventControl }: FlowEditorManagerProps) {
  return (
    <Drawer
      destroyOnClose
      open={open}
      placement="right"
      title="Flow Editor"
      width="100vw"
      onClose={onClose}
      styles={{ body: { padding: 0 } }}
    >
      <ReactFlowProvider>
        <FlowCanvas scriptKey={scriptKey} addEventControl={addEventControl} />
      </ReactFlowProvider>
    </Drawer>
  );
}
