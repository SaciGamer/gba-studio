import useAppContexts from "@/providers/contexts/AppContexts";
import { IArgs, ISceneSettings, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { HolderOutlined, RightOutlined } from "@ant-design/icons";
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, closestCenter, useDndContext, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Collapse, Empty, Flex, Input, Layout } from "antd";
import { createRef, RefObject, useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useI18n } from '@/i18n/I18n';
import { EEvents, getEventLabel } from "./interfaces/IEvents";
import MenuEventItem from "./MenuEventItem";
import PanelEvents from "./PanelEvents";
import SelectNewEvent from "./SelectNewEvent";
import { getEventDepthColor } from "./EventColors";
import { motionEventTitle } from './motionEventTitle';

interface CollapseEventProps {
  scripts: IScriptsElement[] | undefined;
  showEmptyState?: boolean;
  /**
   * Lets the event UI edit scripts owned by another resource (for example a
   * trigger) without pretending that resource is the currently selected scene.
   */
  onScriptsChange?: (scripts: IScriptsElement[]) => void;
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
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
}

function NestedEventDragHandle({ event, title, color, isExpanded, index, scriptIds, isRenaming, renameValue, onRenameChange, onRenameCommit }: { event: IScriptsElement; title: string; color: string; isExpanded: boolean; index: number; scriptIds: string[]; isRenaming: boolean; renameValue: string; onRenameChange: (value: string) => void; onRenameCommit: () => void }) {
  const { t } = useI18n();
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
      {isRenaming ? <Input size="small" variant="borderless" autoFocus value={renameValue} placeholder={getEventLabel(event.command, t)} onChange={e => onRenameChange(e.target.value)} onBlur={onRenameCommit} onPressEnter={onRenameCommit} onClick={e => e.stopPropagation()} /> : <span style={{ color }}>{title}</span>}
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
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
}: SortableEventHeaderProps) {
  const { t } = useI18n();
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
      {isRenaming ? <Input size="small" variant="borderless" autoFocus value={renameValue} placeholder={getEventLabel(event.command, t)} onChange={e => onRenameChange(e.target.value)} onBlur={onRenameCommit} onPressEnter={onRenameCommit} onClick={e => e.stopPropagation()} /> : <span style={{ color: titleColor }}>{title}</span>}
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
  const { t } = useI18n();
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

  const automaticSuffix = activeScript.command === EEvents.FADE_IN && activeScript.args?.__automatic ? ' (Automatic)' : '';
  const title = `${activeScript.args?.__comment ? "// " : ""}${activeScript.args?.__name || headerPanel[activeScript.id] || getEventLabel(activeScript.command, t)}${automaticSuffix}`;
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


export default function CollapseEventManager(parameters: CollapseEventProps) {
  const { t } = useI18n();
  // const {setScenes} = useSceneContext();
  // const {elementSelected, setElementSelected} = useElementContext();

  const { setScenes, elementSelected, setElementSelected } = useAppContexts();
  const [headerPanel, setHeaderPanel] = useState<Record<string, string>>({});
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [renamingEventId, setRenamingEventId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const panelRefs = useRef(new Map<string, RefObject<HTMLDivElement>>());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const rootScripts = parameters.scripts ?? [];
  const persistScripts = (updatedScripts: IScriptsElement[]) => {
    if (parameters.onScriptsChange) {
      parameters.onScriptsChange(updatedScripts);
      return;
    }

    const updatedElement = { ...elementSelected, script: updatedScripts };
    setElementSelected(updatedElement);
    setScenes(prevScenes => prevScenes.map(scene =>
      scene.id === elementSelected.id ? { ...scene, ...updatedElement, _saved: false } : scene
    ));
  };

  // Duplicate an event as a new tree, assigning fresh IDs to the event and
  // every nested event so no drag/drop or collapse state references collide.
  const cloneEventWithNewIds = (event: IScriptsElement): IScriptsElement => ({
    ...event,
    id: uuidv4(),
    args: event.args ? { ...event.args } : event.args,
    children: event.children ? {
      ...event.children,
      then: event.children.then.map(cloneEventWithNewIds),
      else: event.children.else?.map(cloneEventWithNewIds),
    } : undefined,
  });

  const duplicateInList = (events: IScriptsElement[], id: string): IScriptsElement[] => {
    const result: IScriptsElement[] = [];
    for (const event of events) {
      result.push(event);
      if (event.id === id) {
        result.push(cloneEventWithNewIds(event));
      }
    }
    return result;
  };

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
      persistScripts(updatedScripts);
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
    persistScripts(updatedScripts);
  };

  const onRemoveScriptEvent = (id: string) => {
    // Atualiza estado removendo o id
    persistScripts(rootScripts.filter(script => script.id !== id));
  };

  const onDuplicateScriptEvent = (id: string) => {
    persistScripts(duplicateInList(rootScripts, id));
  };

  const renameInList = (events: IScriptsElement[], id: string, name: string): IScriptsElement[] => events.map(event => {
    if (event.id === id) return { ...event, args: { ...event.args, __name: name } };
    if (!event.children) return event;
    return {
      ...event,
      children: {
        ...event.children,
        then: renameInList(event.children.then, id, name),
        else: event.children.else ? renameInList(event.children.else, id, name) : undefined,
      },
    };
  });

  const onRenameScriptEvent = (id: string, name: string) => {
    persistScripts(renameInList(rootScripts, id, name));
  };

  const startRename = (id: string) => {
    const find = (events: IScriptsElement[]): IScriptsElement | undefined => {
      for (const event of events) {
        if (event.id === id) return event;
        const nested = event.children && find([...event.children.then, ...(event.children.else || [])]);
        if (nested) return nested;
      }
      return undefined;
    };
    setRenameDraft(find(rootScripts)?.args?.__name || '');
    setRenamingEventId(id);
  };

  const commitRename = () => {
    if (!renamingEventId) return;
    onRenameScriptEvent(renamingEventId, renameDraft.trim());
    setRenamingEventId(null);
  };

  const toggleDisableScript = (id: string) => {
    persistScripts(rootScripts.map(script => script.id === id
      ? { ...script, args: { ...script.args, __comment: !script.args?.__comment, __collapse: false } }
      : script));
  };

  const onCollapseChange = (keys: string[] | string) => {
    persistScripts(rootScripts.map(script => ({
      ...script,
      args: { ...script.args, __collapse: Array.isArray(keys) ? keys.includes(script.id) : keys === script.id },
    })));
  };

  const handleValueChange = (eventId: string, newArgs: IArgs) => {
    persistScripts(rootScripts.map((s: IScriptsElement) =>
        s.id === eventId
          ? { ...s, args: { ...s.args, ...newArgs } }
          : s
      ));
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
    persistScripts(updateScripts(rootScripts) ?? []);
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
    persistScripts(updateScripts(rootScripts) ?? []);
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
                  label: <NestedEventDragHandle event={child} color={childColor} index={index} scriptIds={events.map(item => item.id)} isExpanded={branchKeys.includes(child.id)} title={`${child.args?.__comment ? '// ' : ''}${child.args?.__name || motionEventTitle(child, command => getEventLabel(command as EEvents, t))}`} isRenaming={renamingEventId === child.id} renameValue={renameDraft} onRenameChange={setRenameDraft} onRenameCommit={commitRename} />,
                  collapsible: child.args?.__comment ? 'disabled' : 'header',
                  showArrow: false,
                  style: {
                    border: `1px solid ${childColor}`,
                    borderRadius: 0,
                    marginBottom: 4,
                    background: child.args?.__comment ? '#74b54c' : 'transparent',
                    color: childColor,
                  },
                  extra: <MenuEventItem event={child} onRemove={(id) => updateIfBranch(script.id, branch, current => current.filter(item => item.id !== id))} onDuplicate={(id) => updateIfBranch(script.id, branch, current => duplicateInList(current, id))} onRename={startRename} onToggleDisable={(id) => updateIfBranch(script.id, branch, current => current.map(item => item.id === id ? { ...item, args: { ...item.args, __comment: !item.args?.__comment } } : item))} />,
                  children: (
                    <Flex vertical gap={6} style={{ padding: '6px 8px' }}>
                      <PanelEvents event={child} customTitle={() => undefined} onValueChange={(id, args) => updateIfBranch(script.id, branch, current => current.map(item => item.id === id ? { ...item, args: { ...item.args, ...args } } : item))} />
                      {(child.command === EEvents.IF || child.command === EEvents.WHILE || child.command === EEvents.FOR || child.command === EEvents.WAIT_FOR_BUTTON || child.command === EEvents.IF_BUTTON_HELD) && renderIfBranch(child, 'then', child.command === EEvents.IF || child.command === EEvents.WHILE || child.command === EEvents.FOR ? 'BODY' : child.command === EEvents.WAIT_FOR_BUTTON ? 'ON PRESS' : 'TRUE', depth + 1)}
                      {(child.command === EEvents.IF || child.command === EEvents.IF_BUTTON_HELD) && renderIfBranch(child, 'else', 'FALSE', depth + 1)}
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
        {(parameters.showEmptyState || parameters.onScriptsChange) && rootScripts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : <SortableContext
          items={parameters.scripts?.map(script => script.id) ?? []}
          strategy={verticalListSortingStrategy}
        >
          <Collapse 
            activeKey={parameters.scripts?.filter(s => s.args?.__collapse && !s.args?.__comment).map(s => s.id)} 
            onChange={onCollapseChange} 
            style={{ borderRadius: 0 }}
            size="small"
          items={rootScripts.map((script, index, scripts) => {
              const isDisabled = script.args?.__comment === true;
              const baseHeader = `${motionEventTitle(script, command => getEventLabel(command as EEvents, t))}${script.command === EEvents.FADE_IN && script.args?.__automatic ? ' (Automatic)' : ''}`;

          const handleValueTitle = (newTitle: string) => {
            setHeaderPanel(prev => ({
              ...prev,
              [script.id]: script.command === EEvents.WAIT_FOR_BUTTON ? newTitle : baseHeader + newTitle
            }));
          };

              const title = isDisabled
                ? `// ${script.args?.__name || headerPanel[script.id] || baseHeader}`
                : script.args?.__name || headerPanel[script.id] || baseHeader;

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
                    isRenaming={renamingEventId === script.id}
                    renameValue={renameDraft}
                    onRenameChange={setRenameDraft}
                    onRenameCommit={commitRename}
                  />
                ),
                extra: <MenuEventItem event={script} onRemove={onRemoveScriptEvent} onDuplicate={onDuplicateScriptEvent} onRename={startRename} onToggleDisable={toggleDisableScript}/>,
                collapsible: isDisabled ? "disabled" : "header",
                showArrow: false,
                style: {
                  borderRadius: 0,
                  backgroundColor: isDisabled ? "#74b54c" : "transparent",
                },
                children: (
                  <Flex vertical gap={6} style={{ color: getEventDepthColor(0) }}>
                    <PanelEvents event={script} customTitle={handleValueTitle} onValueChange={handleValueChange}/>
                    {(script.command === EEvents.IF || script.command === EEvents.WHILE || script.command === EEvents.FOR || script.command === EEvents.WAIT_FOR_BUTTON || script.command === EEvents.IF_BUTTON_HELD) && renderIfBranch(script, 'then', script.command === EEvents.IF || script.command === EEvents.WHILE || script.command === EEvents.FOR ? 'BODY' : script.command === EEvents.WAIT_FOR_BUTTON ? 'ON PRESS' : 'TRUE', 0)}
                    {(script.command === EEvents.IF || script.command === EEvents.IF_BUTTON_HELD) && renderIfBranch(script, 'else', 'FALSE', 0)}
                  </Flex>
                ),
              };
            })}
          />
        </SortableContext>}
        <DragOverlay dropAnimation={null}>
          <ActiveEventDragOverlay scripts={parameters.scripts} headerPanel={headerPanel} />
        </DragOverlay>
      </DndContext>
    </Layout>
  );
}
