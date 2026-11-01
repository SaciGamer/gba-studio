import { useCallback, useEffect, useRef } from 'react';

const sources = new Set<symbol>();
export const isPanelResizing = () => sources.size > 0;

export function setPanelResizeActive(source: symbol, active: boolean) {
  const wasActive = isPanelResizing();
  if (active) sources.add(source); else sources.delete(source);
  if (wasActive !== isPanelResizing()) window.dispatchEvent(new CustomEvent('gba-studio:panel-resize', { detail: { paused: isPanelResizing() } }));
}

/** Release on cancellation/unmount too, so an interrupted drag cannot freeze previews. */
export function usePanelResizeHandlers() {
  const source = useRef(Symbol('panel-resize'));
  const start = useCallback(() => setPanelResizeActive(source.current, true), []);
  const end = useCallback(() => setPanelResizeActive(source.current, false), []);
  useEffect(() => {
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    window.addEventListener('blur', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('blur', end);
      end();
    };
  }, [end]);
  return { start, end };
}
