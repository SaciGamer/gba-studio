/** Keep inspector hover previews from competing with a world scene drag. */
export function suspendInspectorHover(): () => void {
  const stopHover = (event: Event) => {
    const related = (event as MouseEvent).relatedTarget;
    if ((event.target instanceof Element && event.target.closest('[data-testid="right-panel-scroll"]'))
      || (related instanceof Element && related.closest('[data-testid="right-panel-scroll"]'))) {
      event.stopImmediatePropagation();
    }
  };
  const events = ['mouseover', 'mouseout', 'mouseenter', 'pointerover', 'pointerout', 'pointerenter'];
  for (const type of events) document.addEventListener(type, stopHover, true);
  window.dispatchEvent(new CustomEvent('gba-studio:event-preview-open', { detail: { eventId: '__scene_drag__' } }));
  return () => { for (const type of events) document.removeEventListener(type, stopHover, true); };
}
