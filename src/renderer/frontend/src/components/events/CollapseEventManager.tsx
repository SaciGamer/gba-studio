import useAppContexts from "@/providers/contexts/AppContexts";
import { IArgs, ISceneSettings, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { HolderOutlined, RightOutlined } from "@ant-design/icons";
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, closestCenter, useDndContext, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Collapse, Flex, Layout } from "antd";
import { createRef, RefObject, useEffect, useRef, useState } from "react";
import { EEvents, EVENT_INFO } from "./interfaces/IEvents";
import MenuEventItem from "./MenuEventItem";
import PanelEvents from "./PanelEvents";

interface CollapseEventProps {
  scripts: IScriptsElement[] | undefined;
}

interface SortableEventHeaderProps {
  event: IScriptsElement;
  title: string;
  isExpanded: boolean;
  showDragHandle: boolean;
  index: number;
  scriptIds: string[];
  panelRef: RefObject<HTMLDivElement>;
  onHoverChange: (isHovering: boolean) => void;
}

function SortableEventHeader({
  event,
  title,
  isExpanded,
  showDragHandle,
  index,
  scriptIds,
  panelRef,
  onHoverChange,
}: SortableEventHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: event.id });
  const { active, over } = useDndContext();
  const reservedStyles = useRef<{
    panelBackgroundColor: string;
    panelMinHeight: string;
    contentDisplay: string;
    extraVisibility: string;
  }>();

  useEffect(() => {
    setNodeRef(panelRef.current);

    return () => setNodeRef(null);
  }, [panelRef, setNodeRef]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    panel.style.transform = isDragging ? "" : CSS.Transform.toString(transform) || "";
    panel.style.transition = transition || "";
  }, [isDragging, panelRef, transform, transition]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const content = panel.querySelector<HTMLElement>(".ant-collapse-content");
    const extra = panel.querySelector<HTMLElement>(".ant-collapse-extra");

    if (isDragging) {
      reservedStyles.current = {
        panelBackgroundColor: panel.style.backgroundColor,
        panelMinHeight: panel.style.minHeight,
        contentDisplay: content?.style.display || "",
        extraVisibility: extra?.style.visibility || "",
      };
      panel.style.backgroundColor = "transparent";
      panel.style.minHeight = "32px";
      if (content) content.style.display = "none";
      if (extra) extra.style.visibility = "hidden";
      return;
    }

    const original = reservedStyles.current;
    if (!original) return;
    panel.style.backgroundColor = original.panelBackgroundColor;
    panel.style.minHeight = original.panelMinHeight;
    if (content) content.style.display = original.contentDisplay;
    if (extra) extra.style.visibility = original.extraVisibility;
    reservedStyles.current = undefined;
  }, [isDragging, panelRef]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const activeId = active ? String(active.id) : null;
    const overId = over ? String(over.id) : null;
    const activeIndex = activeId ? scriptIds.indexOf(activeId) : -1;
    const isDropTarget = activeIndex >= 0 && overId === event.id && activeId !== overId;

    if (!isDropTarget) {
      panel.style.borderTop = "";
      panel.style.borderBottom = "";
      return;
    }

    const insertAfterTarget = activeIndex < index;
    panel.style.borderTop = insertAfterTarget ? "" : "32px solid #000000";
    panel.style.borderBottom = insertAfterTarget ? "32px solid #000000" : "";
  }, [active, event.id, index, over, panelRef, scriptIds]);

  if (isDragging) return <div style={{ minHeight: 16 }} />;

  return (
    <Flex
      align="center"
      gap={4}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      <Button
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${title}`}
        icon={<HolderOutlined />}
        size="small"
        type="text"
        onClick={(mouseEvent) => mouseEvent.stopPropagation()}
        style={{
          opacity: showDragHandle ? 1 : 0,
          pointerEvents: showDragHandle ? "auto" : "none",
          transition: "opacity 120ms ease-in-out",
        }}
      />
      <RightOutlined style={{ transform: isExpanded ? "rotate(90deg)" : undefined, fontSize: 10 }} />
      <span>{title}</span>
    </Flex>
  );
}

function EventDragPreview({ title }: { title: string }) {
  return (
    <Flex
      align="center"
      gap={8}
      style={{
        minWidth: 240,
        padding: "8px 12px",
        border: "1px solid #885512",
        borderRadius: 4,
        backgroundColor: "#a06023",
        boxShadow: "0 4px 12px rgb(0 0 0 / 18%)",
      }}
    >
      <HolderOutlined />
      <RightOutlined style={{ fontSize: 10 }} />
      <span>{title}</span>
    </Flex>
  );
}

function ActiveEventDragOverlay({
  scripts,
  headerPanel,
}: {
  scripts: IScriptsElement[] | undefined;
  headerPanel: Record<string, string>;
}) {
  const { active } = useDndContext();
  const activeScript = scripts?.find(script => script.id === active?.id);
  if (!activeScript) return null;

  const title = `${activeScript.args?.__comment ? "// " : ""}${headerPanel[activeScript.id] || getEventEnum(activeScript.command)}`;
  return <EventDragPreview title={title} />;
}

const getEventEnum = (command: string): string => {
  const eventEnum = Object.values(EEvents).find(eventId => eventId === command);
  
  return EVENT_INFO[eventEnum as keyof typeof EVENT_INFO].name;
}

export default function CollapseEventManager(parameters: CollapseEventProps) {
  // const {setScenes} = useSceneContext();
  // const {elementSelected, setElementSelected} = useElementContext();

  const { setScenes, elementSelected, setElementSelected } = useAppContexts();
  const [headerPanel, setHeaderPanel] = useState<Record<string, string>>({});
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const panelRefs = useRef(new Map<string, RefObject<HTMLDivElement>>());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const getPanelRef = (id: string) => {
    const existingRef = panelRefs.current.get(id);
    if (existingRef) return existingRef;

    const newRef = createRef<HTMLDivElement>();
    panelRefs.current.set(id, newRef);
    return newRef;
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id || !parameters.scripts) return;

    const oldIndex = parameters.scripts.findIndex(script => script.id === active.id);
    const newIndex = parameters.scripts.findIndex(script => script.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const updatedScripts = arrayMove(parameters.scripts, oldIndex, newIndex);
    const updatedElement = { ...elementSelected, script: updatedScripts };

    setElementSelected(updatedElement);
    setScenes(prevScenes =>
      prevScenes.map(scene =>
        scene.id === elementSelected.id
          ? { ...scene, script: updatedScripts, _saved: false }
          : scene
      )
    );
  };

  const onRemoveScriptEvent = (id: string) => {
    // Atualiza estado removendo o id
    const updatedElement = { 
      ...elementSelected,  
      script: elementSelected.script?.filter((s: any) => s.id !== id) || [],
      playerHit1Script: elementSelected.playerHit1Script?.filter((s: any) => s.id !== id) || [],
      playerHit2Script: elementSelected.playerHit2Script?.filter((s: any) => s.id !== id) || [],
      playerHit3Script: elementSelected.playerHit3Script?.filter((s: any) => s.id !== id) || [],
    };

    setElementSelected(updatedElement);

    setScenes(prevScenes =>
      prevScenes.map(scene =>
        scene.id === elementSelected.id
          ? { ...scene, ...updatedElement, _saved: false }
          : scene
      )
    );
  };

  const toggleDisableScript = (id: string) => {
    setElementSelected((prev: ISceneSettings) => ({
      ...prev,
      script: prev.script?.map((s: IScriptsElement) =>
        s.id === id
          ? { ...s, args: { ...s.args, __comment: !(s.args?.__comment), __collapse: false } }
          : s
      ),
    }));

    setScenes((prevScenes: any) =>
      prevScenes.map((scene: ISceneSettings) => {
        if (scene.id !== elementSelected.id) return scene;

        const updatedScripts = scene.script?.map(s =>
          s.id === id
            ? {
                ...s,
                args: { ...s.args, __comment: !(s.args?.__comment), __collapse: false },
              }
            : s
        );

        return { ...scene, script: updatedScripts, _saved: false };
      })
    );
    
  };

  const onCollapseChange = (keys: string[] | string) => {
    setElementSelected((prev: ISceneSettings) => ({
      ...prev,
      script: prev.script?.map(s => ({
        ...s,
        args: { 
          ...s.args, 
          __collapse: Array.isArray(keys) ? keys.includes(s.id) : keys === s.id 
        }
      })),
    }));

    setScenes(prevScenes =>
      prevScenes.map(scene => {
        if (scene.id !== elementSelected.id) return scene;

        const updatedScripts = scene.script?.map(s => ({
          ...s,
          args: { 
            ...s.args, 
            __collapse: Array.isArray(keys) ? keys.includes(s.id) : keys === s.id 
          }
        }));

        return { ...scene, script: updatedScripts, _saved: false };
      })
    );
  };

  const handleValueChange = (eventId: string, newArgs: IArgs) => {
    const updateElement = {
      ...elementSelected,
      script: elementSelected.script?.map((s: IScriptsElement) =>
        s.id === eventId
          ? { ...s, args: newArgs }
          : s
      ),
    };

    setElementSelected(updateElement);

    setScenes(prevScenes =>
      prevScenes.map(scene =>
        scene.id === elementSelected.id
          ? { ...scene, ...updateElement, _saved: false }
          : scene
        )
    );
  }

	return (
    <Layout>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        sensors={sensors}
      >
        <SortableContext
          items={parameters.scripts?.map(script => script.id) ?? []}
          strategy={verticalListSortingStrategy}
        >
          <Collapse 
            activeKey={parameters.scripts?.filter(s => s.args?.__collapse).map(s => s.id)} 
            onChange={onCollapseChange} 
            style={{ borderRadius: 0 }}
            size="small"
            items={parameters.scripts?.map((script, index, scripts) => {
              const isDisabled = script.args?.__comment === true;
              const baseHeader = getEventEnum(script.command);

          const handleValueTitle = (newTitle: string) => {
            setHeaderPanel(prev => ({
              ...prev,
              [script.id]: baseHeader + newTitle
            }));
          };

              const title = isDisabled
                ? `// ${headerPanel[script.id] || baseHeader}`
                : headerPanel[script.id] || baseHeader;

              return {
                key: script.id,
                ref: getPanelRef(script.id),
                label: (
                  <SortableEventHeader
                    event={script}
                    title={title}
                    isExpanded={Boolean(script.args?.__collapse)}
                    showDragHandle={hoveredEventId === script.id}
                    index={index}
                    scriptIds={scripts.map(item => item.id)}
                    panelRef={getPanelRef(script.id)}
                    onHoverChange={(isHovering) => setHoveredEventId(isHovering ? script.id : null)}
                  />
                ),
                extra: <MenuEventItem event={script} onRemove={onRemoveScriptEvent} onToggleDisable={toggleDisableScript}/>,
                collapsible: isDisabled ? "disabled" : "header",
                showArrow: false,
                style: {
                  borderRadius: 0,
                  backgroundColor: isDisabled ? "#74b54c" : "transparent",
                },
                children: <PanelEvents event={script} customTitle={handleValueTitle} onValueChange={handleValueChange}/>,
              };
            })}
          />
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          <ActiveEventDragOverlay scripts={parameters.scripts} headerPanel={headerPanel} />
        </DragOverlay>
      </DndContext>
    </Layout>
  );
}
