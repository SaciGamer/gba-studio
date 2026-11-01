import { useEffect, useRef, type RefObject } from 'react';

const previewRoots = new Map<HTMLElement, number>();
const recheckEvent = 'gba-studio:event-preview-recheck';
function nearestPreviewRoot(target: Element | null): HTMLElement | null {
  for (let element = target; element; element = element.parentElement) {
    if (previewRoots.has(element as HTMLElement)) return element as HTMLElement;
  }
  return null;
}

/** Include the event header, warnings and padding in the preview hover area. */
export default function useEventPreviewArea(body: RefObject<HTMLElement | null>, eventId: string, open: (area: HTMLElement) => void, close: () => void, expanded?: boolean, kind?: string) {
  const area = useRef<HTMLElement | null>(null);
  const callbacks = useRef({ open, close });
  callbacks.current = { open, close };
  useEffect(() => {
    const root = body.current?.closest<HTMLElement>('.ant-collapse-item, [data-event-preview-area]') ?? body.current;
    if (!root) return;
    area.current = root;
    if (root.classList.contains('ant-collapse-item') && expanded === false) {
      callbacks.current.close();
      return;
    }
    previewRoots.set(root, (previewRoots.get(root) ?? 0) + 1);
    let leaveTimer: ReturnType<typeof setTimeout> | undefined;
    let hoveredTooltip: Element | null = null;
    let active = false;
    let pointer = { x: -1, y: -1 };
    const owns = (target: Element | null) => nearestPreviewRoot(target) === root &&
      !Array.from(previewRoots.keys()).some(child => child !== root && root.contains(child) && child.matches(':hover'));
    const containsPointer = (element: Element | null | undefined) => {
      const rect = element?.getBoundingClientRect();
      return !!rect && rect.width > 0 && rect.height > 0 && pointer.x >= rect.left && pointer.x <= rect.right && pointer.y >= rect.top && pointer.y <= rect.bottom;
    };
    const activate = () => {
      if (active) return;
      active = true;
      clearTimeout(leaveTimer);
      callbacks.current.open(root);
    };
    const enter = (event: MouseEvent | FocusEvent) => {
      const target = event instanceof MouseEvent ? document.elementFromPoint(event.clientX, event.clientY) : event.target as Element | null;
      if (event instanceof MouseEvent) pointer = { x: event.clientX, y: event.clientY };
      if (owns(target)) activate();
    };
    const overOwnTooltip = () => Array.from(root.querySelectorAll('[aria-describedby]')).filter(trigger => nearestPreviewRoot(trigger) === root).some(trigger =>
      trigger.getAttribute('aria-describedby')?.split(/\s+/).some(id => containsPointer(document.getElementById(id)?.closest('.ant-tooltip'))));
    const ownsPointer = () => containsPointer(root) && owns(document.elementFromPoint(pointer.x, pointer.y));
    const leave = (event?: MouseEvent) => {
      if (active && event?.relatedTarget instanceof Element) hoveredTooltip = event.relatedTarget.closest('.ant-tooltip');
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => {
        if (ownsPointer() || containsPointer(hoveredTooltip) || overOwnTooltip() || owns(document.activeElement)) return;
        active = false;
        callbacks.current.close();
      }, 100);
    };
    const tooltipLeave = (event: MouseEvent) => {
      if (active && (event.target as Element)?.closest?.('.ant-tooltip')) leave(event);
    };
    const move = (event: MouseEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (ownsPointer()) activate();
      else if (active) leave();
    };
    const blur = (event: FocusEvent) => {
      if (!root.contains(event.relatedTarget as Node | null) && !root.matches(':hover')) leave();
    };
    const opened = (event: Event) => {
      if ((event as CustomEvent).detail?.eventId === eventId) return;
      active = false;
      hoveredTooltip = null;
      clearTimeout(leaveTimer);
      callbacks.current.close();
    };
    const recheck = () => {
      const owner = nearestPreviewRoot(document.elementFromPoint(pointer.x, pointer.y));
      // Scrolling changes the element under a stationary pointer. Its owner
      // takes precedence over focus retained by a parent input.
      if (owner) {
        if (owner === root) activate();
        else if (active) {
          active = false;
          clearTimeout(leaveTimer);
          callbacks.current.close();
        }
      } else if (containsPointer(hoveredTooltip) || overOwnTooltip()) return;
      else if (owns(document.activeElement)) activate();
      else if (active) leave();
    };
    let layoutFrame: number | undefined;
    const layoutChanged = () => {
      recheck();
      if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame);
      layoutFrame = requestAnimationFrame(() => { layoutFrame = undefined; recheck(); });
    };
    root.addEventListener('mouseenter', enter);
    root.addEventListener('mouseleave', leave);
    root.addEventListener('focusin', enter);
    root.addEventListener('focusout', blur);
    document.addEventListener('mouseout', tooltipLeave);
    document.addEventListener('mousemove', move);
    window.addEventListener('gba-studio:event-preview-open', opened);
    window.addEventListener(recheckEvent, recheck);
    window.addEventListener('scroll', layoutChanged, true);
    window.addEventListener('resize', layoutChanged);
    if (root.matches(':hover') && !Array.from(previewRoots.keys()).some(child => child !== root && root.contains(child) && child.matches(':hover'))) activate();
    window.dispatchEvent(new Event(recheckEvent));
    return () => {
      root.removeEventListener('mouseenter', enter);
      root.removeEventListener('mouseleave', leave);
      root.removeEventListener('focusin', enter);
      root.removeEventListener('focusout', blur);
      document.removeEventListener('mouseout', tooltipLeave);
      document.removeEventListener('mousemove', move);
      window.removeEventListener('gba-studio:event-preview-open', opened);
      window.removeEventListener(recheckEvent, recheck);
      window.removeEventListener('scroll', layoutChanged, true);
      window.removeEventListener('resize', layoutChanged);
      if (layoutFrame !== undefined) cancelAnimationFrame(layoutFrame);
      clearTimeout(leaveTimer);
      const remaining = (previewRoots.get(root) ?? 1) - 1;
      if (remaining) previewRoots.set(root, remaining); else previewRoots.delete(root);
      callbacks.current.close();
      area.current = null;
      window.dispatchEvent(new Event(recheckEvent));
    };
  }, [body, eventId, expanded, kind]);
  return area;
}
