import { AttentionLabel } from '../WarningIndicator';
import { reconcileSceneFadeIn } from '@/utils/createSceneFadeIn';
import { countEventAttention } from '../../../../../shared/events/eventAttention';
import useAppContexts from "@/providers/contexts/AppContexts";
import './eventHeaders.css';
import { IArgs, IScriptsElement } from "@/providers/contexts/interfaces/ISceneElement";
import { HolderOutlined, RightOutlined } from "@ant-design/icons";
import { DndContext, DragEndEvent, DragOverlay, PointerSensor, MeasuringStrategy, closestCenter, pointerWithin, useDndContext, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import type { CollisionDetection, Modifier } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Collapse, Empty, Flex, Input, Layout, Tabs, Tooltip } from "antd";
import { createContext, createRef, RefObject, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { v4 as uuidv4 } from "uuid";
import { useI18n } from '@/i18n/I18n';
import useActorSelf from './useActorSelf';
import { EEvents, getEventLabel } from "./interfaces/IEvents";
import MenuEventItem from "./MenuEventItem";
import PanelEvents from "./PanelEvents";
import SelectNewEvent from "./SelectNewEvent";
import { getEventDepthColor } from "./EventColors";
import { motionEventTitle } from './motionEventTitle';
import { useEventClipboard } from './eventClipboard';
import { useScriptParameterVariables } from './ScriptParameterContext';
import { EVENT_BRANCHES, cloneEventTree, eventInsertionError, findEventLocation, insertEvent, type EventDestination } from './eventTree';
import { clearMissingEventReferences, repairCallScriptArguments, mergeEventArgs } from '../../../../../shared/events/sceneReferenceCleanup';

const COLLAPSED_EVENT_ROW_HEIGHT = 48;

// DragOverlay is positioned against the source's initial rectangle. Keep that
// same origin when the live placeholder moves or changes nesting level.
const createEventPreviewAnchor = (): Modifier => {
  let origin: { left: number; top: number } | undefined;
  return ({ activatorEvent, activeNodeRect, transform }) => {
    if (!activeNodeRect || !activatorEvent || !("clientX" in activatorEvent)) return transform;
    origin ??= { left: activeNodeRect.left, top: activeNodeRect.top };
    const pointer = activatorEvent as PointerEvent;
    return {
      ...transform,
      x: transform.x + pointer.clientX - origin.left - 16,
      y: transform.y + pointer.clientY - origin.top - 16,
      scaleX: 1,
      scaleY: 1,
    };
  };
};

const EventDragContext = createContext<{ id: string; height: number; width: number } | null>(null);

function EventHeaderTitle({ title, color }: { title: string; color: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const dragging = useContext(EventDragContext);
  const measure = () => setTruncated(Boolean(ref.current && ref.current.scrollWidth > ref.current.clientWidth));
  return <Tooltip mouseEnterDelay={0.6} title={truncated && !dragging ? title : undefined}>
    <span ref={ref} className="gba-event-title" style={{ color }} tabIndex={0} onMouseEnter={measure} onFocus={measure}>{title}</span>
  </Tooltip>;
}

function destinationForId(id: string): EventDestination {
  if (id === 'list:root') return {};
  const branch = id.match(/^list:(.+):(then|else)$/);
  return branch ? { parentId: branch[1], branch: branch[2] as 'then' | 'else' } : { siblingId: id };
}

interface CollapseEventProps {
  storageKey?: string;
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
  panelRef: RefObject<HTMLDivElement>;
  onHoverChange: (isHovering: boolean) => void;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
}

function NestedEventDragHandle({ event, title, color, isExpanded, isRenaming, renameValue, onRenameChange, onRenameCommit }: { event: IScriptsElement; title: string; color: string; isExpanded: boolean; isRenaming: boolean; renameValue: string; onRenameChange: (value: string) => void; onRenameCommit: () => void }) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: event.id });
  const activeDrag = useContext(EventDragContext);
  const handleRef = useRef<HTMLElement | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    setNodeRef(handleRef.current?.closest<HTMLElement>('.ant-collapse-item') ?? null);
    return () => setNodeRef(null);
  }, [setNodeRef]);

  useEffect(() => {
    if (!isDragging) return;
    const panel = handleRef.current?.closest<HTMLElement>('.ant-collapse-item');
    const content = panel?.querySelector<HTMLElement>(':scope > .ant-collapse-content');
    if (!content) return;
    const originalDisplay = content.style.display;
    content.style.display = 'none';
    return () => { content.style.display = originalDisplay; };
  }, [isDragging]);

  useEffect(() => {
    const panel = handleRef.current?.closest<HTMLElement>('.ant-collapse-item');
    if (!panel) return;

    panel.style.transform = activeDrag ? '' : CSS.Transform.toString(transform) || '';
    panel.style.transition = transition || '';
    panel.style.visibility = isDragging ? 'hidden' : '';
    panel.style.height = isDragging ? `${activeDrag?.height ?? COLLAPSED_EVENT_ROW_HEIGHT}px` : '';
    panel.style.boxSizing = isDragging ? 'border-box' : '';
    panel.style.overflow = isDragging ? 'hidden' : '';
    if (isDragging) panel.dataset.eventDragPlaceholder = event.id;
    else delete panel.dataset.eventDragPlaceholder;

    return () => {
      panel.style.transform = '';
      panel.style.transition = '';
      panel.style.visibility = '';
      panel.style.boxShadow = '';
      panel.style.height = '';
      panel.style.boxSizing = '';
      panel.style.overflow = '';
      delete panel.dataset.eventDragPlaceholder;
    };
  }, [activeDrag, event.id, isDragging, transform, transition]);

  return (
    <Flex
      className="gba-event-header"
      ref={(node) => {
        handleRef.current = node;
      }}
      {...attributes}
      {...listeners}
      align="center"
      gap={4}
      onMouseEnter={() => { if (!activeDrag) setIsHovered(true); }}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        opacity: isDragging ? 0.45 : 1,
        cursor: 'grab',
        touchAction: 'none',
        width: '100%',
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
          opacity: !activeDrag && isHovered ? 1 : 0,
          pointerEvents: !activeDrag && isHovered ? 'auto' : 'none',
          transition: 'opacity 120ms ease-in-out',
        }}
      />
      <RightOutlined style={{ transform: isExpanded ? 'rotate(90deg)' : undefined, fontSize: 10 }} />
      {isRenaming ? <Input style={{ minWidth: 0, flex: 1 }} size="small" variant="borderless" autoFocus value={renameValue} placeholder={getEventLabel(event.command, t)} onChange={e => onRenameChange(e.target.value)} onBlur={onRenameCommit} onPressEnter={onRenameCommit} onClick={e => e.stopPropagation()} /> : <EventHeaderTitle color={color} title={title} />}
    </Flex>
  );
}

function BranchDropZone({ id, color }: { id: string; color: string }) {
  const { active, isOver, setNodeRef } = useDroppable({ id });
  const isDragging = Boolean(active);
  const { t } = useI18n();

  return (
    <Tooltip title={isDragging ? t(id === 'list:root' ? 'events.organize.dropRoot' : 'events.organize.dropInside') : undefined}><div
      ref={setNodeRef}
      data-event-drop-zone={id}
      style={{
        height: COLLAPSED_EVENT_ROW_HEIGHT,
        boxSizing: 'border-box',
        border: isDragging ? `1px dashed ${color}` : '0 solid transparent',
        background: isOver ? '#333' : 'transparent',
        opacity: isDragging ? 1 : 0,
        pointerEvents: isDragging ? 'auto' : 'none',
        transition: 'background 120ms ease-in-out',
      }}
    /></Tooltip>
  );
}

function SortableEventHeader({
  event,
  title,
  titleColor,
  isExpanded,
  showDragHandle,
  panelRef,
  onHoverChange,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
}: SortableEventHeaderProps) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: event.id });
  const activeDrag = useContext(EventDragContext);
  const resolvedPanelRef = useRef<HTMLDivElement | null>(null);
  const reservedStyles = useRef<{
    panelBackgroundColor: string;
    panelMinHeight: string;
    contentDisplay: string;
    extraVisibility: string;
  }>();

  useEffect(() => {
    setNodeRef(panelRef.current ?? resolvedPanelRef.current);

    return () => setNodeRef(null);
  }, [panelRef, setNodeRef]);

  useEffect(() => {
    const panel = panelRef.current ?? resolvedPanelRef.current;
    if (!panel) return;

    panel.style.transform = activeDrag ? "" : CSS.Transform.toString(transform) || "";
    panel.style.transition = transition || "";
  }, [activeDrag, panelRef, transform, transition]);

  useEffect(() => {
    const panel = panelRef.current ?? resolvedPanelRef.current;
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
      panel.style.minHeight = `${COLLAPSED_EVENT_ROW_HEIGHT}px`;
      panel.style.height = `${activeDrag?.height ?? COLLAPSED_EVENT_ROW_HEIGHT}px`;
      panel.style.boxSizing = 'border-box';
      panel.style.overflow = 'hidden';
      panel.style.visibility = 'hidden';
      panel.dataset.eventDragPlaceholder = event.id;
      if (content) content.style.display = "none";
      if (extra) extra.style.visibility = "hidden";
      return;
    }

    const original = reservedStyles.current;
    if (!original) return;
    panel.style.backgroundColor = original.panelBackgroundColor;
    panel.style.minHeight = original.panelMinHeight;
    panel.style.height = '';
    panel.style.boxSizing = '';
    panel.style.overflow = '';
    panel.style.visibility = '';
    delete panel.dataset.eventDragPlaceholder;
    if (content) content.style.display = original.contentDisplay;
    if (extra) extra.style.visibility = original.extraVisibility;
    reservedStyles.current = undefined;
  }, [activeDrag, event.id, isDragging, panelRef]);

  const resolvePanel = (node: HTMLDivElement | null) => {
    if (node) resolvedPanelRef.current = node.closest<HTMLDivElement>('.ant-collapse-item');
  };
  if (isDragging) return <div ref={resolvePanel} style={{ minHeight: COLLAPSED_EVENT_ROW_HEIGHT }} />;

  return (
    <Flex
      className="gba-event-header"
      ref={resolvePanel}
      align="center"
      gap={4}
      onMouseEnter={() => { if (!activeDrag) onHoverChange(true); }}
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
          opacity: !activeDrag && showDragHandle ? 1 : 0,
          pointerEvents: !activeDrag && showDragHandle ? "auto" : "none",
          transition: "opacity 120ms ease-in-out",
          touchAction: 'none',
        }}
      />
      <RightOutlined style={{ transform: isExpanded ? "rotate(90deg)" : undefined, fontSize: 10 }} />
      {isRenaming ? <Input style={{ minWidth: 0, flex: 1 }} size="small" variant="borderless" autoFocus value={renameValue} placeholder={getEventLabel(event.command, t)} onChange={e => onRenameChange(e.target.value)} onBlur={onRenameCommit} onPressEnter={onRenameCommit} onClick={e => e.stopPropagation()} /> : <EventHeaderTitle color={titleColor} title={title} />}
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
  const activeDrag = useContext(EventDragContext);
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

  const automaticSuffix = activeScript.command === EEvents.FADE_IN && scripts.find(script => script.command === EEvents.FADE_IN)?.id === activeScript.id ? ' (Automatic)' : '';
  const title = `${activeScript.args?.__comment ? "// " : ""}${activeScript.args?.__name || headerPanel[activeScript.id] || getEventLabel(activeScript.command, t)}${automaticSuffix}`;
  return (
    <div data-event-drag-preview style={{ border: `1px solid ${getEventDepthColor(1)}`, background: '#303030', padding: '6px 10px', boxSizing: 'border-box', width: activeDrag?.width ?? 240, height: activeDrag?.height ?? COLLAPSED_EVENT_ROW_HEIGHT, display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
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

  const { setScenes, scenes, scripts: scriptResources, variables, elementSelected, setElementSelected, settingUtils, userSettings, setUserSettings } = useAppContexts();
  const parametersInScope = useScriptParameterVariables();
  const clipboard = useEventClipboard();
  const [addDestination, setAddDestination] = useState<EventDestination | null>(null);
  useEffect(() => { setAddDestination(null); }, [elementSelected?.id, settingUtils.activeSceneObject?.id]);
  const [dragDestination, setDragDestination] = useState<EventDestination | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ id: string; height: number; width: number } | null>(null);
  const anchorEventPreview = useMemo(createEventPreviewAnchor, [activeDrag?.id]);
  const collisionDestination = useRef<EventDestination | null>(null);
  const self = useActorSelf();
  const actorNameForTitle = (id: string) => {
    if (typeof id !== 'string' || !id.trim()) return '?';
    if (id === '__SELF__') return self.options[0]?.label ?? 'Self';
    if (id === '__PLAYER__') return t('values.player');
    const sceneActors = (elementSelected as { actors?: Array<{ id?: string; name?: string }> } | null)?.actors ?? [];
    const actor = sceneActors.find(candidate => candidate.id === id);
    return actor?.name || id.slice(0, 8);
  };
  const eventTitle = (event: IScriptsElement) => motionEventTitle(event, command => getEventLabel(command as EEvents, t), actorNameForTitle,
    actorId => t('events.actorAnimation.title', { name: actorId === '__SELF__' ? self.actor?.name || 'Self' : actorNameForTitle(actorId) }));
  const displayEventTitle = (event: IScriptsElement) => event.command === 'EVENT_SWITCH_CASE'
    ? `${t('events.switch.case')} ${event.args?.value?.value ?? 0}` : eventTitle(event);
  const [headerPanel, setHeaderPanel] = useState<Record<string, string>>({});
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [renamingEventId, setRenamingEventId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const panelRefs = useRef(new Map<string, RefObject<HTMLDivElement>>());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );
  const rootScripts = Array.isArray(parameters.scripts)
    ? parameters.scripts.filter((script): script is IScriptsElement => Boolean(script && typeof script === 'object'))
    : [];
  const focusKey = `${elementSelected?.id ?? 'resource'}:${settingUtils.activeSceneObject?.id ?? ''}:${parameters.storageKey ?? 'script'}`;
  const savedFocus = userSettings?.eventEditorFocus?.[focusKey];
  const focusedEvent = savedFocus ? findEventLocation(rootScripts, savedFocus)?.event : undefined;
  const focusedId = focusedEvent && EVENT_BRANCHES[focusedEvent.command] ? focusedEvent.id : undefined;
  useEffect(() => {
    if (savedFocus && !focusedId) setUserSettings(previous => ({ ...previous, eventEditorFocus: { ...previous.eventEditorFocus, [focusKey]: undefined }, _saved: false }));
  }, [savedFocus, focusedId, focusKey, setUserSettings]);
  const toggleMaximize = (id: string) => {
    setUserSettings(previous => ({ ...previous, eventEditorFocus: { ...previous.eventEditorFocus, [focusKey]: focusedId === id ? undefined : id }, _saved: false }));
  };
  // Apply edits to the original sibling list even when a nested event is displayed as the root.
  const updateEventList = (id: string, update: (list: IScriptsElement[]) => IScriptsElement[]) => {
    const visit = (list: IScriptsElement[]): IScriptsElement[] => list.some(event => event.id === id) ? update(list) : list.map(event => event.children ? {
      ...event, children: { ...event.children, then: visit(event.children.then ?? []), else: event.children.else ? visit(event.children.else) : undefined },
    } : event);
    persistScripts(visit(rootScripts));
  };
  const [dismissedReferenceRequest, setDismissedReferenceRequest] = useState<number>();
  const referenceEventId = settingUtils.referenceTarget?.requestId === dismissedReferenceRequest ? undefined : settingUtils.referenceTarget?.eventId;
  const containsReference = (event: IScriptsElement): boolean => Boolean(referenceEventId && (event.id === referenceEventId
    || event.children?.then?.some(containsReference) || event.children?.else?.some(containsReference)));
  const previewScripts = useMemo(() => {
    if (!activeDrag || !dragDestination) return rootScripts;
    const source = findEventLocation(rootScripts, activeDrag.id)?.event;
    return source ? insertEvent(rootScripts, source, dragDestination, true) : rootScripts;
  }, [rootScripts, activeDrag, dragDestination]);
  const focusedPreview = focusedId ? findEventLocation(previewScripts, focusedId)?.event : undefined;
  const renderedScripts = focusedPreview ? [focusedPreview] : previewScripts;
  useEffect(() => {
    if (focusedId && referenceEventId && !findEventLocation([focusedEvent!], referenceEventId) && findEventLocation(rootScripts, referenceEventId)) {
      setUserSettings(previous => ({ ...previous, eventEditorFocus: { ...previous.eventEditorFocus, [focusKey]: undefined }, _saved: false }));
    }
  }, [settingUtils.referenceTarget?.requestId]);
  const rootCollapsedKeys = renderedScripts.filter(script => (script.id === focusedId || script.args?.__collapse || containsReference(script)) && !script.args?.__comment).map(script => script.id);
  useEffect(() => {
    if (!referenceEventId || !rootScripts.some(containsReference)) return;
    const timer = window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(`[data-reference-event="${window.CSS.escape(referenceEventId)}"]`);
      target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [settingUtils.referenceTarget?.requestId, rootScripts]);
  const persistScripts = (updatedScripts: IScriptsElement[]) => {
    if (parameters.onScriptsChange) {
      parameters.onScriptsChange(updatedScripts);
      return;
    }

    if (elementSelected?._resourceType === 'scene') updatedScripts = reconcileSceneFadeIn(rootScripts, updatedScripts);

    const updatedElement = { ...elementSelected, script: updatedScripts };
    setElementSelected(updatedElement);
    setScenes(prevScenes => prevScenes.map(scene =>
      scene.id === elementSelected.id ? { ...scene, ...updatedElement, _saved: false } : scene
    ));
  };

  // Duplicate an event as a new tree, assigning fresh IDs to the event and
  // every nested event so no drag/drop or collapse state references collide.
  const cloneEventWithNewIds = (event: IScriptsElement) => cloneEventTree(event, uuidv4);

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

  const collisionDetection: CollisionDetection = args => {
    const source = findEventLocation(rootScripts, String(args.active.id))?.event;
    if (!source) return [];
    // The preview changes the layout before dnd-kit's next measurement frame.
    // Resolve collisions against that visible layout, including nested lists.
    const liveRects = new Map(args.droppableRects);
    for (const container of args.droppableContainers) {
      if (container.node.current) liveRects.set(container.id, container.node.current.getBoundingClientRect());
    }
    args = { ...args, droppableRects: liveRects };
    // Keep the current destination while the pointer is inside the reserved
    // slot. Moving the DOM preview must not make the target oscillate.
    const slot = document.querySelector(`[data-event-drag-placeholder="${window.CSS.escape(String(args.active.id))}"]`)?.getBoundingClientRect();
    const pointer = args.pointerCoordinates;
    const previous = collisionDestination.current ?? dragDestination;
    if (previous && slot && pointer && pointer.x >= slot.left && pointer.x <= slot.right && pointer.y >= slot.top && pointer.y <= slot.bottom) {
      collisionDestination.current = previous;
      return [{ id: previous.siblingId ?? (previous.parentId ? `list:${previous.parentId}:${previous.branch}` : 'list:root') }];
    }
    const destinations = new Map<string | number, EventDestination>();
    const containers = args.droppableContainers.filter(container => {
      if (container.id === args.active.id) return false;
      const destination = destinationForId(String(container.id));
      const rect = args.droppableRects.get(container.id);
      if (destination.siblingId) destination.position = args.pointerCoordinates && rect
        && args.pointerCoordinates.y > rect.top + Math.min(rect.height, 40) / 2 ? 'after' : 'before';
      destinations.set(container.id, destination);
      return !eventInsertionError(rootScripts, source, destination);
    });
    const filtered = { ...args, droppableContainers: containers };
    const hits = pointerWithin(filtered).sort((a, b) => {
      const first = args.droppableRects.get(a.id), second = args.droppableRects.get(b.id);
      return (first ? first.width * first.height : Infinity) - (second ? second.width * second.height : Infinity);
    });
    // Pointer drops outside valid targets must not jump to a distant legal
    // branch (for example when trying to drag Break outside its loop).
    const result = hits.length || args.pointerCoordinates ? hits : closestCenter(filtered);
    if (previous?.parentId && result[0]?.id === previous.parentId && pointer) {
      const branchId = `list:${previous.parentId}:${previous.branch}`;
      const region = args.droppableContainers.find(container => container.id === branchId)?.node.current?.parentElement?.getBoundingClientRect();
      if (region && pointer.x >= region.left && pointer.x <= region.right && pointer.y >= region.top && pointer.y <= region.bottom) {
        collisionDestination.current = previous;
        return [{ id: branchId }];
      }
    }
    collisionDestination.current = result[0] ? destinations.get(result[0].id) ?? null : null;
    return result;
  };

  const updateDragDestination = () => {
    const next = collisionDestination.current;
    if (!next) return;
    setDragDestination(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const destination = collisionDestination.current;
    collisionDestination.current = null;
    setDragDestination(null);
    setActiveDrag(null);
    if (!over || !destination) return;
    const source = findEventLocation(rootScripts, String(active.id))?.event;
    if (source) persistScripts(insertEvent(rootScripts, source, destination, true));
  };

  // Resolve a copy against the receiving scene/actor/trigger and script inputs.
  // The existing reference repair keeps unavailable fields visible as pending.
  const preparedClipboard = useMemo(() => {
    if (!clipboard) return null;
    const actorIds = (elementSelected?.actors ?? []).map((actor: { id: string }) => actor.id);
    if (self.actor) actorIds.push('__SELF__');
    actorIds.push('__PLAYER__');
    const triggerIds = (elementSelected?.triggers ?? []).map((trigger: { id: string }) => trigger.id);
    const scopeVariables = [...(variables.variables ?? []), ...parametersInScope];
    const copy = cloneEventTree(clipboard, uuidv4);
    const repaired = clearMissingEventReferences(copy, {
      scenes: new Set(scenes.map(scene => scene.id)), actors: new Set(actorIds), triggers: new Set(triggerIds),
      scripts: new Set(scriptResources.scripts.map(script => script.id)),
      variables: new Set(scopeVariables.map(variable => variable.id)),
      parameterIds: new Set(parametersInScope.map(parameter => parameter.id)), selfAllowed: Boolean(self.actor),
    }).value;
    return repairCallScriptArguments(repaired,
      new Map(scriptResources.scripts.map(script => [script.id, script.parameters ?? []])), {
        actors: actorIds, triggers: triggerIds, scene: elementSelected?._resourceType !== 'script',
        variables: new Map(scopeVariables.map(variable => [variable.id, variable.type])),
      }).value;
  }, [clipboard, elementSelected, scenes, scriptResources, variables, JSON.stringify(parametersInScope), self.actor?.id]);

  const pasteError = (id: string) => preparedClipboard
    ? eventInsertionError(rootScripts, preparedClipboard, { siblingId: id }) : undefined;
  const pasteEvent = (id: string, position: 'before' | 'after') => {
    if (!preparedClipboard || pasteError(id)) return;
    persistScripts(insertEvent(rootScripts, cloneEventTree(preparedClipboard, uuidv4), { siblingId: id, position }));
  };

  const addEventAt = (id: string, position: 'before' | 'after') => setAddDestination({ siblingId: id, position });
  const addTarget = addDestination?.siblingId ? findEventLocation(rootScripts, addDestination.siblingId) : undefined;
  const addCaseType = addTarget?.event.command === 'EVENT_SWITCH_CASE'
    ? (addTarget.ancestors.at(-1)?.event.args?.value?.kind === 'button' ? 'boolean'
      : addTarget.ancestors.at(-1)?.event.args?.value?.type ?? 'number') as 'number' | 'string' | 'boolean' : undefined;
  const isEventAllowedAtDestination = (command: string) => Boolean(addDestination) && !eventInsertionError(rootScripts, {
    id: '__new_event__', command,
    ...(command === 'EVENT_SWITCH_CASE' ? { args: { value: { kind: 'literal', type: addCaseType ?? 'number', value: 0 } } } : {}),
  }, addDestination!);

  const onRemoveScriptEvent = (id: string) => {
    // Atualiza estado removendo o id
    updateEventList(id, list => list.filter(script => script.id !== id));
  };

  const onDuplicateScriptEvent = (id: string) => {
    updateEventList(id, list => duplicateInList(list, id));
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
    updateEventList(id, list => list.map(script => script.id === id
      ? { ...script, args: { ...script.args, __comment: !script.args?.__comment, __collapse: false } }
      : script));
  };

  const onCollapseChange = (keys: string[] | string) => {
    if (focusedId) return;
    persistScripts(rootScripts.map(script => ({
      ...script,
      args: { ...script.args, __collapse: Array.isArray(keys) ? keys.includes(script.id) : keys === script.id },
    })));
  };

  const handleValueChange = (eventId: string, newArgs: IArgs) => {
    updateEventList(eventId, list => list.map((s: IScriptsElement) =>
        s.id === eventId
          ? { ...s, args: mergeEventArgs(s.args ?? {}, newArgs) }
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
          ...script.children,
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
          ...script.children,
          then: updateScripts(script.children.then) || [],
          else: script.children.else ? updateScripts(script.children.else) : undefined,
          thenCollapsed: script.children.thenCollapsed,
          elseCollapsed: script.children.elseCollapsed,
        },
      };
    });
    persistScripts(updateScripts(rootScripts) ?? []);
  };

  const renderIfBranch = (script: IScriptsElement, branch: 'then' | 'else', label: string, depth: number, allowAdd = true, switchValueType?: 'number' | 'string' | 'boolean') => {
    const branchEvents = script.children?.[branch];
    const events = Array.isArray(branchEvents)
      ? branchEvents.filter((event): event is IScriptsElement => Boolean(event && typeof event === 'object'))
      : [];
    const childColor = getEventDepthColor(depth + 1);
    const branchKeys = events.filter(item => (item.args?.__collapse || containsReference(item)) && !item.args?.__comment).map(item => item.id);
    const branchKey = `${script.id}-${branch}-content`;
    const branchCollapsed = !events.some(containsReference) && (script.children?.[`${branch}Collapsed` as 'thenCollapsed' | 'elseCollapsed'] ?? false);
    return (
      <Collapse
        key={branchKey}
        size="small"
        activeKey={branchCollapsed ? [] : [branchKey]}
        onChange={(keys) => updateIfBranchCollapse(script.id, branch, !(Array.isArray(keys) ? keys.includes(branchKey) : keys === branchKey))}
        style={{ borderRadius: 0 }}
        items={[{
          key: branchKey,
          label: <AttentionLabel count={countEventAttention(events)} label={<span style={{ color: childColor }}>{label}</span>} />,
          children: (
            <Flex vertical gap={4}>
              <SortableContext items={events.map(child => child.id)} strategy={verticalListSortingStrategy}>
                <Collapse
                  size="small"
                  activeKey={branchKeys}
                  items={events.map(child => ({
                  key: child.id,
                  label: <div data-reference-event={child.id}><NestedEventDragHandle event={child} color={childColor} isExpanded={branchKeys.includes(child.id)} title={`${child.args?.__comment ? '// ' : ''}${child.args?.__name || displayEventTitle(child)}`} isRenaming={renamingEventId === child.id} renameValue={renameDraft} onRenameChange={setRenameDraft} onRenameCommit={commitRename} /></div>,
                  collapsible: child.args?.__comment ? 'disabled' : 'header',
                  showArrow: false,
                  style: {
                    border: `1px solid ${childColor}`,
                    borderRadius: 0,
                    marginBottom: 4,
                    background: child.args?.__comment ? '#74b54c' : 'transparent',
                    color: childColor,
                  },
                  extra: <MenuEventItem maximized={focusedId === child.id} onToggleMaximize={EVENT_BRANCHES[child.command] ? toggleMaximize : undefined} events={events} hasClipboard={Boolean(preparedClipboard)} pasteError={pasteError(child.id)} onPaste={pasteEvent} onAdd={addEventAt} event={child} onRemove={(id) => updateIfBranch(script.id, branch, current => current.filter(item => item.id !== id))} onDuplicate={(id) => updateIfBranch(script.id, branch, current => duplicateInList(current, id))} onRename={startRename} onToggleDisable={(id) => updateIfBranch(script.id, branch, current => current.map(item => item.id === id ? { ...item, args: { ...item.args, __comment: !item.args?.__comment } } : item))} />,
                  children: (
                    <Flex vertical gap={6} style={{ padding: '6px 8px' }}>
                      <PanelEvents event={child} customTitle={() => undefined} switchValueType={switchValueType} onValueChange={(id, args) => updateIfBranch(script.id, branch, current => current.map(item => item.id === id ? { ...item, args: mergeEventArgs(item.args ?? {}, args) } : item))} />
                      {(child.command === EEvents.SAVE_WRITE || child.command === EEvents.SAVE_LOAD) && <Tabs size="small" items={[
                        { key: 'actions', label: t(child.command === EEvents.SAVE_WRITE ? 'events.save.onSave' : 'events.save.onLoad'), children: renderIfBranch(child, 'then', t(child.command === EEvents.SAVE_WRITE ? 'events.save.onSave' : 'events.save.onLoad'), depth + 1) },
                      ]} />}
                      {(child.command === EEvents.IF || child.command === EEvents.WHILE || child.command === EEvents.FOR || child.command === EEvents.WAIT_FOR_BUTTON || child.command === EEvents.IF_ACTOR_FACING || child.command === EEvents.IF_BUTTON_HELD) && renderIfBranch(child, 'then', child.command === EEvents.IF || child.command === EEvents.WHILE || child.command === EEvents.FOR ? 'BODY' : child.command === EEvents.WAIT_FOR_BUTTON ? 'ON PRESS' : 'TRUE', depth + 1)}
                      {child.command === 'EVENT_SWITCH_CASE' && renderIfBranch(child, 'then', t('events.switch.caseBody'), depth + 1)}
                      {child.command === EEvents.SWITCH && renderSwitchBranches(child, depth + 1)}
                      {(child.command === EEvents.IF || child.command === EEvents.IF_ACTOR_FACING || child.command === EEvents.IF_BUTTON_HELD) && renderIfBranch(child, 'else', 'FALSE', depth + 1)}
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
              {allowAdd && <SelectNewEvent compact showFlowButton={false} onEventCreated={(event) => updateIfBranch(script.id, branch, current => [...current, event])} />}
            </Flex>
          ),
        }]}
      />
    );
  };

  const addSwitchCase = (script: IScriptsElement) => updateIfBranch(script.id, 'then', current => [...current, {
    id: uuidv4(), command: 'EVENT_SWITCH_CASE', args: { value: { kind: 'literal', type: switchValueType(script), value: switchValueType(script) === 'number' ? 0 : switchValueType(script) === 'boolean' ? false : '' } }, children: { then: [] },
  }]);
  const switchValueType = (script: IScriptsElement): 'number' | 'string' | 'boolean' => {
    const value = script.args?.value;
    if (value?.kind === 'variable') return value.type ?? 'number';
    if (value?.kind === 'button') return 'boolean';
    if (value?.type === 'string' || value?.type === 'boolean') return value.type;
    return 'number';
  };
  const renderSwitchBranches = (script: IScriptsElement, depth: number) => <Flex vertical gap={6}>
    <Button size="small" onClick={() => addSwitchCase(script)}>{t('events.switch.addCase')}</Button>
    {renderIfBranch(script, 'then', t('events.switch.cases'), depth, false, switchValueType(script))}
    {renderIfBranch(script, 'else', t('events.switch.default'), depth)}
  </Flex>;

	return (
		<Layout className="gba-event-list" style={{ minWidth: 0, pointerEvents: activeDrag ? 'none' : undefined }}>
      <DndContext
        collisionDetection={collisionDetection}
        onDragStart={({ active }) => {
          const header = document.querySelector(`[data-reference-event="${window.CSS.escape(String(active.id))}"]`)?.closest<HTMLElement>('.ant-collapse-header');
          setActiveDrag({ id: String(active.id), height: header?.offsetHeight ?? COLLAPSED_EVENT_ROW_HEIGHT, width: header?.offsetWidth ?? 240 });
          setHoveredEventId(null);
        }}
        onDragMove={updateDragDestination}
        onDragOver={updateDragDestination}
        onDragCancel={() => { collisionDestination.current = null; setDragDestination(null); setActiveDrag(null); }}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragEnd={onDragEnd}
        sensors={sensors}
      >
        <EventDragContext.Provider value={activeDrag}>
        {(parameters.showEmptyState || parameters.onScriptsChange) && renderedScripts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : <SortableContext
          items={renderedScripts.map(script => script.id)}
          strategy={verticalListSortingStrategy}
        >
          <Collapse 
            activeKey={rootCollapsedKeys}
            onChange={keys => { setDismissedReferenceRequest(settingUtils.referenceTarget?.requestId); onCollapseChange(keys); }}
            style={{ borderRadius: 0 }}
            size="small"
          items={renderedScripts.map(script => {
              const isDisabled = script.args?.__comment === true;
              const baseHeader = `${eventTitle(script)}${script.command === EEvents.FADE_IN && rootScripts.find(event => event.command === EEvents.FADE_IN)?.id === script.id ? ' (Automatic)' : ''}`;

          const handleValueTitle = (newTitle: string) => {
            setHeaderPanel(prev => ({
              ...prev,
              [script.id]: script.command === EEvents.WAIT_FOR_BUTTON || script.command === EEvents.SHOW_EMOTE ? newTitle : baseHeader + newTitle
            }));
          };

              const title = isDisabled
                ? `// ${script.args?.__name || headerPanel[script.id] || baseHeader}`
                : script.args?.__name || headerPanel[script.id] || baseHeader;

              return {
                key: script.id,
                ref: getPanelRef(script.id),
                label: (
                  <div data-reference-event={script.id}>
                  <SortableEventHeader
                    event={script}
                    title={title}
                    titleColor={getEventDepthColor(0)}
                    isExpanded={rootCollapsedKeys.includes(script.id)}
                    showDragHandle={hoveredEventId === script.id}
                    panelRef={getPanelRef(script.id)}
                    onHoverChange={(isHovering) => setHoveredEventId(isHovering ? script.id : null)}
                    isRenaming={renamingEventId === script.id}
                    renameValue={renameDraft}
                    onRenameChange={setRenameDraft}
                    onRenameCommit={commitRename}
                  />
                  </div>
                ),
                extra: <MenuEventItem maximized={focusedId === script.id} onToggleMaximize={EVENT_BRANCHES[script.command] ? toggleMaximize : undefined} events={rootScripts} hasClipboard={Boolean(preparedClipboard)} pasteError={pasteError(script.id)} onPaste={pasteEvent} onAdd={addEventAt} event={script} onRemove={onRemoveScriptEvent} onDuplicate={onDuplicateScriptEvent} onRename={startRename} onToggleDisable={toggleDisableScript}/>,
                collapsible: isDisabled ? "disabled" : "header",
                showArrow: false,
                style: {
                  borderRadius: 0,
                  backgroundColor: isDisabled ? "#74b54c" : "transparent",
                },
                children: (
                  <Flex vertical gap={6} style={{ color: getEventDepthColor(0) }}>
                    <PanelEvents event={script} switchValueType={focusedId ? switchValueType(findEventLocation(rootScripts, script.id)?.ancestors.at(-1)?.event ?? script) : undefined} customTitle={handleValueTitle} onValueChange={handleValueChange}/>
                    {(script.command === EEvents.SAVE_WRITE || script.command === EEvents.SAVE_LOAD) && <Tabs size="small" items={[
                        { key: 'actions', label: t(script.command === EEvents.SAVE_WRITE ? 'events.save.onSave' : 'events.save.onLoad'), children: renderIfBranch(script, 'then', t(script.command === EEvents.SAVE_WRITE ? 'events.save.onSave' : 'events.save.onLoad'), 0) },
                      ]} />}
                    {(script.command === EEvents.IF || script.command === EEvents.WHILE || script.command === EEvents.FOR || script.command === EEvents.WAIT_FOR_BUTTON || script.command === EEvents.IF_ACTOR_FACING || script.command === EEvents.IF_BUTTON_HELD) && renderIfBranch(script, 'then', script.command === EEvents.IF || script.command === EEvents.WHILE || script.command === EEvents.FOR ? 'BODY' : script.command === EEvents.WAIT_FOR_BUTTON ? 'ON PRESS' : 'TRUE', 0)}
                    {script.command === EEvents.SWITCH && renderSwitchBranches(script, 0)}
                    {script.command === 'EVENT_SWITCH_CASE' && renderIfBranch(script, 'then', t('events.switch.caseBody'), 0)}
                    {(script.command === EEvents.IF || script.command === EEvents.IF_ACTOR_FACING || script.command === EEvents.IF_BUTTON_HELD) && renderIfBranch(script, 'else', 'FALSE', 0)}
                  </Flex>
                ),
              };
            })}
          />
        </SortableContext>}
        {!focusedId && <BranchDropZone id="list:root" color={getEventDepthColor(0)} />}
        {addDestination && <SelectNewEvent
          compact hideTrigger showFlowButton={false} open
          onOpenChange={open => { if (!open) setAddDestination(null); }}
          isEventAllowed={isEventAllowedAtDestination}
          caseValueType={addCaseType}
          onEventCreated={event => {
            if (!eventInsertionError(rootScripts, event, addDestination)) persistScripts(insertEvent(rootScripts, event, addDestination));
            setAddDestination(null);
          }}
        />}
        {createPortal(<DragOverlay dropAnimation={null} adjustScale={false} modifiers={[anchorEventPreview]}>
          <ActiveEventDragOverlay scripts={rootScripts} headerPanel={headerPanel} />
        </DragOverlay>, document.body)}
        </EventDragContext.Provider>
      </DndContext>
    </Layout>
  );
}
