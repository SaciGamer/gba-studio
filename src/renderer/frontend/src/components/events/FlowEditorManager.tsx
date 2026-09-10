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
import { getEventDepthColor } from "./EventColors";

export type ScriptKey = "script" | "playerHit1Script" | "playerHit2Script" | "playerHit3Script";

interface EventNodeData extends Record<string, unknown> {
  event: IScriptsElement;
  path: string;
  onArgsChange: (path: string, args: IArgs) => void;
  onDelete: (path: string) => void;
  branch?: "then" | "else";
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
  const eventColor = getEventDepthColor(0);

  return (
    <div
      className="flow-event-node"
      style={{
        width: 280,
        border: `1px solid ${eventColor}`,
        borderRadius: token.borderRadiusLG,
        background: isDisabled ? token.colorSuccessBg : token.colorBgContainer,
        boxShadow: token.boxShadowSecondary,
        overflow: "hidden",
      }}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Flex align="center" justify="space-between" style={{ padding: "8px 10px", borderBottom: `1px solid ${eventColor}` }}>
        <Typography.Text strong style={{ color: eventColor }}>{eventTitle(event)}</Typography.Text>
        <Flex align="center" gap={4}>
          {isDisabled && <Tag color="success">Disabled</Tag>}
          <Button
            aria-label={`Delete ${eventTitle(event)}`}
            className="nodrag"
            icon={<DeleteOutlined />}
            size="small"
            type="text"
            onClick={() => onDelete(data.path)}
          />
        </Flex>
      </Flex>
      <div className="nodrag nopan" style={{ padding: 10, color: eventColor }}>
        <PanelEvents
          event={event}
          customTitle={() => undefined}
          onValueChange={(_, args) => onArgsChange(data.path, args)}
        />
      </div>
      {event.command === EEvents.IF ? (
        <>
          <Handle id="then" type="source" position={Position.Right} style={{ top: "35%" }} isConnectable={false} />
          <Handle id="else" type="source" position={Position.Right} style={{ top: "65%" }} isConnectable={false} />
        </>
      ) : <Handle id="next" type="source" position={Position.Right} isConnectable={false} />}
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
    const updateNested = (items: IScriptsElement[], parts: string[]): IScriptsElement[] => {
      const index = Number(parts[0]);
      if (parts.length === 1) return items.map((item, itemIndex) => itemIndex === index
        ? { ...item, args: { ...item.args, ...args, __x: item.args?.__x, __y: item.args?.__y } }
        : item);
      const branch = parts[1] as "then" | "else";
      return items.map((item, itemIndex) => itemIndex === index && item.children ? {
        ...item,
        children: { ...item.children, [branch]: updateNested(item.children[branch] || [], parts.slice(2)) },
      } : item);
    };
    updateScripts(updateNested(scripts, id.split("/")));
  }, [scripts, updateScripts]);

  const deleteEvent = useCallback((path: string) => {
    const removeNested = (items: IScriptsElement[], parts: string[]): IScriptsElement[] => {
      const index = Number(parts[0]);
      if (parts.length === 1) return items.filter((_, itemIndex) => itemIndex !== index);
      const branch = parts[1] as "then" | "else";
      return items.map((item, itemIndex) => itemIndex === index && item.children ? {
        ...item,
        children: { ...item.children, [branch]: removeNested(item.children[branch] || [], parts.slice(2)) },
      } : item);
    };
    updateScripts(removeNested(scripts, path.split("/")));
  }, [scripts, updateScripts]);

  const { initialNodes, edges } = useMemo(() => {
    const nextNodes: EventNode[] = [];
    const nextEdges: Edge[] = [];
    const addNodes = (items: IScriptsElement[], prefix = "", depth = 0) => items.forEach((event, index) => {
      const path = prefix ? `${prefix}/${index}` : String(index);
      nextNodes.push({
        id: path,
        type: "event",
        position: typeof event.args?.__x === "number" && typeof event.args?.__y === "number"
          ? { x: event.args.__x, y: event.args.__y }
          : event.position || { x: 80 + depth * 380, y: 120 + index * 180 },
        data: { event, path, onArgsChange: updateArgs, onDelete: deleteEvent },
      });
      if (event.children) {
        addNodes(event.children.then, `${path}/then`, depth + 1);
        addNodes(event.children.else || [], `${path}/else`, depth + 1);
      }
    });
    const buildSequence = (items: IScriptsElement[], prefix: string, continuation?: string): string | undefined => {
      if (!items.length) return continuation;
      items.forEach((current, index) => {
        const currentPath = prefix ? `${prefix}/${index}` : String(index);
        const next = index < items.length - 1
          ? (prefix ? `${prefix}/${index + 1}` : String(index + 1))
          : continuation;
        if (current.command === EEvents.IF) {
          const thenEntry = buildSequence(current.children?.then || [], `${currentPath}/then`, next);
          const elseEntry = buildSequence(current.children?.else || [], `${currentPath}/else`, next);
          if (thenEntry) nextEdges.push({ id: `${currentPath}-then-${thenEntry}`, source: currentPath, sourceHandle: "then", target: thenEntry, type: "smoothstep" });
          if (elseEntry) nextEdges.push({ id: `${currentPath}-else-${elseEntry}`, source: currentPath, sourceHandle: "else", target: elseEntry, type: "smoothstep" });
          if (!thenEntry && next) nextEdges.push({ id: `${currentPath}-then-${next}`, source: currentPath, sourceHandle: "then", target: next, type: "smoothstep" });
          if (!elseEntry && next) nextEdges.push({ id: `${currentPath}-else-${next}`, source: currentPath, sourceHandle: "else", target: next, type: "smoothstep" });
        } else if (next) {
          nextEdges.push({ id: `${currentPath}-next-${next}`, source: currentPath, sourceHandle: "next", target: next, type: "smoothstep" });
        }
      });
      return prefix ? `${prefix}/0` : "0";
    };
    addNodes(scripts);
    buildSequence(scripts, "", undefined);
    return { initialNodes: nextNodes, edges: nextEdges };
  }, [deleteEvent, scripts, updateArgs]);

  const [nodes, setNodes, onNodesChange] = useNodesState<EventNode>(initialNodes);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  const onNodeDragStop = useCallback((_: MouseEvent | TouchEvent, node: EventNode) => {
    const updatePosition = (items: IScriptsElement[], parts: string[]): IScriptsElement[] => {
      const index = Number(parts[0]);
      if (parts.length === 1) return items.map((item, itemIndex) => itemIndex === index ? {
        ...item,
        args: { ...item.args, __x: node.position.x, __y: node.position.y },
      } : item);
      const branch = parts[1] as "then" | "else";
      return items.map((item, itemIndex) => itemIndex === index && item.children ? {
        ...item,
        children: { ...item.children, [branch]: updatePosition(item.children[branch] || [], parts.slice(2)) },
      } : item);
    };
    updateScripts(updatePosition(scripts, node.id.split("/")));
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
          nodeColor={getEventDepthColor(0)}
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
