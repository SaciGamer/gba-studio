import useAppContexts from "@/providers/contexts/AppContexts";
import { IArgs, ISceneSettings, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { HolderOutlined, RightOutlined } from "@ant-design/icons";
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, closestCenter, useDndContext, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Collapse, Flex, Layout } from "antd";
import { createRef, RefObject, useEffect, useRef, useState } from "react";
import { EEvents, EVENT_INFO } from "./interfaces/IEvents";
import MenuEventItem from "./MenuEventItem";
import PanelEvents from "./PanelEvents";
import SelectNewEvent from "./SelectNewEvent";
import { getEventDepthColor } from "./EventColors";

interface CollapseEventProps {
  scripts: IScriptsElement[] | undefined;
}

interface SortableEventHeaderProps {
  event: IScriptsElement;
  title: string;
  titleColor: string;
  isExpanded: boolean;
  showDragHandle: boolean;
  index: number;
  scriptIds: string[];
  panelRef: RefObject<HTMLDivElement>;
  onHoverChange: (isHovering: boolean) => void;
}

function NestedEventDragHandle({ event, title, color, isExpanded, index, scriptIds }: { event: IScriptsElement; title: string; color: string; isExpanded: boolean; index: number; scriptIds: string[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: event.id });
  const { active, over } = useDndContext();
  const handleRef = useRef<HTMLElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const panel = handleRef.current?.closest<HTMLElement>('.ant-collapse-item');
    if (!panel) return;

    const activeId = String(active?.id || '');
    const overId = String(over?.id || '');
    const activeIndex = scriptIds.indexOf(activeId);
    const isDropTarget = activeId !== event.id && overId === event.id && activeIndex >= 0;
    panel.style.visibility = isDragging ? 'hidden' : '';
    panel.style.borderTop = isDropTarget && activeIndex > index ? '32px solid #000000' : '';
    panel.style.borderBottom = isDropTarget && activeIndex <= index ? '32px solid #000000' : '';

    return () => {
      panel.style.visibility = '';
      panel.style.borderTop = '';
      panel.style.borderBottom = '';
    };
  }, [active, event.id, index, isDragging, over, scriptIds]);

  return (
    <Flex
      ref={(node) => {
        handleRef.current = node;
        setNodeRef(node);
      }}
      {...attributes}
      {...listeners}
      align="center"
      gap={4}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        opacity: isDragging ? 0.45 : 1,
        cursor: 'grab',
        width: '100%',
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <Button
        aria-label={`Reorder ${title}`}
        icon={<HolderOutlined />}
        size="small"
        type="text"
        onClick={(mouseEvent) => mouseEvent.stopPropagation()}
        style={{
          color,
          opacity: isHovered || isDragging ? 1 : 0,
          pointerEvents: isHovered || isDragging ? 'auto' : 'none',
          transition: 'opacity 120ms ease-in-out',
        }}
      />
      <RightOutlined style={{ transform: isExpanded ? 'rotate(90deg)' : undefined, fontSize: 10 }} />
      <span style={{ color }}>{title}</span>
    </Flex>
  );
}

function BranchDropZone({ id, color }: { id: string; color: string }) {
  const { active, isOver, setNodeRef } = useDroppable({ id });
  const isDragging = Boolean(active);

  return (
    <div
      ref={setNodeRef}
      style={{
        height: isDragging ? 32 : 0,
        boxSizing: 'border-box',
        border: isDragging ? `1px dashed ${color}` : '0 solid transparent',
        background: isOver ? '#333' : 'transparent',
        opacity: isDragging && isOver ? 1 : 0,
        pointerEvents: isDragging ? 'auto' : 'none',
        transition: 'background 120ms ease-in-out',
      }}
    />
  );
}

function SortableEventHeader({
  event,
  title,
  titleColor,
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
      <span style={{ color: titleColor }}>{title}</span>
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
  const findScript = (items: IScriptsElement[] | undefined): IScriptsElement | undefined => {
    if (!items) return undefined;
    for (const script of items) {
      if (script.id === active?.id) return script;
      const nested = findScript([
        ...(script.children?.then || []),
        ...(script.children?.else || []),
      ]);
      if (nested) return nested;
    }
    return undefined;
  };
  const activeScript = findScript(scripts);
  if (!activeScript) return null;

  const title = `${activeScript.args?.__comment ? "// " : ""}${headerPanel[activeScript.id] || getEventEnum(activeScript.command)}`;
  return (
    <div style={{ border: `1px solid ${getEventDepthColor(1)}`, background: '#303030', padding: '6px 10px', minWidth: 240 }}>
      <Flex align="center" gap={6}>
        <HolderOutlined style={{ color: getEventDepthColor(1) }} />
        <RightOutlined style={{ fontSize: 10, color: getEventDepthColor(1) }} />
        <span style={{ color: getEventDepthColor(1) }}>{title}</span>
      </Flex>
    </div>
  );
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

    const activeId = String(active.id);
    const overId = String(over.id);
    const rootScripts = parameters.scripts;
    const containsEvent = (event: IScriptsElement, id: string): boolean =>
      event.id === id
      || Boolean(event.children?.then.some(child => containsEvent(child, id)))
      || Boolean(event.children?.else?.some(child => containsEvent(child, id)));

    const findEvent = (scripts: IScriptsElement[]): IScriptsElement | undefined => {
      for (const script of scripts) {
        if (script.id === activeId) return script;
        const nested = script.children && findEvent([
          ...script.children.then,
          ...(script.children.else || []),
        ]);
        if (nested) return nested;
      }
      return undefined;
    };

    const findEventById = (scripts: IScriptsElement[], id: string): IScriptsElement | undefined => {
      for (const script of scripts) {
        if (script.id === id) return script;
        const nested = script.children && findEventById([
          ...script.children.then,
          ...(script.children.else || []),
        ], id);
        if (nested) return nested;
      }
      return undefined;
    };

    const oldIndex = rootScripts.findIndex(script => script.id === activeId);
    const newIndex = rootScripts.findIndex(script => script.id === overId);

    if (oldIndex >= 0 && newIndex >= 0) {
      const updatedScripts = arrayMove(rootScripts, oldIndex, newIndex);
      const updatedElement = { ...elementSelected, script: updatedScripts };
      setElementSelected(updatedElement);
      setScenes(prevScenes => prevScenes.map(scene =>
        scene.id === elementSelected.id ? { ...scene, script: updatedScripts, _saved: false } : scene
      ));
      return;
    }

    const branchDropMatch = overId.match(/^list:([^:]+):(then|else)$/);
    const targetIsBranch = Boolean(branchDropMatch);
    const targetEvent = targetIsBranch ? undefined : findEventById(rootScripts, overId);
    if (!targetIsBranch && !targetEvent) return;
    const targetIfId = branchDropMatch?.[1] || '';
    const targetBranch = branchDropMatch?.[2] as 'then' | 'else' | undefined;
    let movedEvent: IScriptsElement | undefined;

    const sourceEvent = findEvent(rootScripts);
    if (sourceEvent && ((targetIsBranch && containsEvent(sourceEvent, targetIfId)) || (!targetIsBranch && containsEvent(sourceEvent, overId)))) return;

    const removeEvent = (scripts: IScriptsElement[]): IScriptsElement[] => scripts
      .filter(script => {
        if (script.id === activeId) {
          movedEvent = script;
          return false;
        }
        return true;
      })
      .map(script => script.children ? {
        ...script,
        children: {
          ...script.children,
          then: removeEvent(script.children.then),
          else: script.children.else ? removeEvent(script.children.else) : undefined,
        },
      } : script);

    const insertEvent = (scripts: IScriptsElement[]): IScriptsElement[] => scripts.map(script => {
      if (targetIsBranch && targetBranch && script.id === targetIfId) {
        const children = script.children || { then: [] };
        return { ...script, children: { ...children, [targetBranch]: [...(children[targetBranch] || []), movedEvent!] } };
      }
      if (!script.children) return script;
      return {
        ...script,
        children: {
          ...script.children,
          then: insertEvent(script.children.then),
          else: script.children.else ? insertEvent(script.children.else) : undefined,
        },
      };
    });

    const withoutEvent = removeEvent(rootScripts);
    if (!movedEvent) return;
    const insertSibling = (scripts: IScriptsElement[]): IScriptsElement[] => {
      const nextScripts: IScriptsElement[] = [];
      for (const script of scripts) {
        if (script.id === overId) {
          nextScripts.push(movedEvent!);
          nextScripts.push(script);
          continue;
        }
        nextScripts.push(script.children ? {
          ...script,
          children: {
            ...script.children,
            then: insertSibling(script.children.then),
            else: script.children.else ? insertSibling(script.children.else) : undefined,
          },
        } : script);
      }
      return nextScripts;
    };
    const updatedScripts = targetIsBranch ? insertEvent(withoutEvent) : insertSibling(withoutEvent);
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
          ? { ...s, args: { ...s.args, ...newArgs } }
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

  const updateIfBranch = (ifId: string, branch: 'then' | 'else', update: (events: IScriptsElement[]) => IScriptsElement[]) => {
    const updateScripts = (scripts: IScriptsElement[] | undefined): IScriptsElement[] | undefined => scripts?.map(script => {
      if (script.id === ifId) {
        const children = script.children || { then: [] };
        return { ...script, children: { ...children, [branch]: update(children[branch] || []) } };
      }

      if (!script.children) return script;
      return {
        ...script,
        children: {
          then: updateScripts(script.children.then) || [],
          else: script.children.else ? updateScripts(script.children.else) : undefined,
        },
      };
    });
    const updatedElement = { ...elementSelected, script: updateScripts(elementSelected.script) };
    setElementSelected(updatedElement);
    setScenes(prevScenes => prevScenes.map(scene =>
      scene.id === elementSelected.id ? { ...scene, ...updatedElement, _saved: false } : scene
    ));
  };

  const updateIfBranchCollapse = (ifId: string, branch: 'then' | 'else', collapsed: boolean) => {
    const updateScripts = (scripts: IScriptsElement[] | undefined): IScriptsElement[] | undefined => scripts?.map(script => {
      if (script.id === ifId) {
        const children = script.children || { then: [] };
        return { ...script, children: { ...children, [`${branch}Collapsed`]: collapsed } };
      }
      if (!script.children) return script;
      return {
        ...script,
        children: {
          then: updateScripts(script.children.then) || [],
          else: script.children.else ? updateScripts(script.children.else) : undefined,
          thenCollapsed: script.children.thenCollapsed,
          elseCollapsed: script.children.elseCollapsed,
        },
      };
    });
    const updatedElement = { ...elementSelected, script: updateScripts(elementSelected.script) };
    setElementSelected(updatedElement);
    setScenes(prevScenes => prevScenes.map(scene =>
      scene.id === elementSelected.id ? { ...scene, ...updatedElement, _saved: false } : scene
    ));
  };

  const renderIfBranch = (script: IScriptsElement, branch: 'then' | 'else', label: string, depth: number) => {
    const events = script.children?.[branch] || [];
    const childColor = getEventDepthColor(depth + 1);
    const branchKeys = events.filter(item => item.args?.__collapse && !item.args?.__comment).map(item => item.id);
    const branchKey = `${script.id}-${branch}-content`;
    const branchCollapsed = script.children?.[`${branch}Collapsed` as 'thenCollapsed' | 'elseCollapsed'] ?? false;
    return (
      <Collapse
        key={branchKey}
        size="small"
        activeKey={branchCollapsed ? [] : [branchKey]}
        onChange={(keys) => updateIfBranchCollapse(script.id, branch, !(Array.isArray(keys) ? keys.includes(branchKey) : keys === branchKey))}
        style={{ borderRadius: 0 }}
        items={[{
          key: branchKey,
          label: <span style={{ color: childColor }}>{label}</span>,
          children: (
            <Flex vertical gap={4}>
              <SortableContext items={events.map(child => child.id)} strategy={verticalListSortingStrategy}>
                <Collapse
                  size="small"
                  activeKey={branchKeys}
                  items={events.map((child, index) => ({
                  key: child.id,
                  label: <NestedEventDragHandle event={child} color={childColor} index={index} scriptIds={events.map(item => item.id)} isExpanded={branchKeys.includes(child.id)} title={`${child.args?.__comment ? '// ' : ''}${getEventEnum(child.command)}`} />,
                  collapsible: child.args?.__comment ? 'disabled' : 'header',
                  showArrow: false,
                  style: {
                    border: `1px solid ${childColor}`,
                    borderRadius: 0,
                    marginBottom: 4,
                    background: child.args?.__comment ? '#74b54c' : 'transparent',
                    color: childColor,
                  },
                  extra: <MenuEventItem event={child} onRemove={(id) => updateIfBranch(script.id, branch, current => current.filter(item => item.id !== id))} onToggleDisable={(id) => updateIfBranch(script.id, branch, current => current.map(item => item.id === id ? { ...item, args: { ...item.args, __comment: !item.args?.__comment } } : item))} />,
                  children: (
                    <Flex vertical gap={6} style={{ padding: '6px 8px' }}>
                      <PanelEvents event={child} customTitle={() => undefined} onValueChange={(id, args) => updateIfBranch(script.id, branch, current => current.map(item => item.id === id ? { ...item, args: { ...item.args, ...args } } : item))} />
                      {child.command === EEvents.IF && renderIfBranch(child, 'then', 'TRUE', depth + 1)}
                      {child.command === EEvents.IF && renderIfBranch(child, 'else', 'FALSE', depth + 1)}
                    </Flex>
                  ),
                  }))}
                  onChange={(keys) => updateIfBranch(script.id, branch, current => current.map(item => ({
                    ...item,
                    args: { ...item.args, __collapse: Array.isArray(keys) ? keys.includes(item.id) : keys === item.id },
                  })))}
                />
              </SortableContext>
              <BranchDropZone id={`list:${script.id}:${branch}`} color={childColor} />
              <SelectNewEvent compact showFlowButton={false} onEventCreated={(event) => updateIfBranch(script.id, branch, current => [...current, event])} />
            </Flex>
          ),
        }]}
      />
    );
  };

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
            activeKey={parameters.scripts?.filter(s => s.args?.__collapse && !s.args?.__comment).map(s => s.id)} 
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
                    titleColor={getEventDepthColor(0)}
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
                children: (
                  <Flex vertical gap={6} style={{ color: getEventDepthColor(0) }}>
                    <PanelEvents event={script} customTitle={handleValueTitle} onValueChange={handleValueChange}/>
                    {script.command === EEvents.IF && renderIfBranch(script, 'then', 'TRUE', 0)}
                    {script.command === EEvents.IF && renderIfBranch(script, 'else', 'FALSE', 0)}
                  </Flex>
                ),
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
