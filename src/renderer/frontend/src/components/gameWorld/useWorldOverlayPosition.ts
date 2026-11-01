import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { getWorldHudLayout } from './worldHudLayout';

const unmeasured = { left: 12, top: 15, right: 12, bottom: 12, width: 0, height: 0, measured: false };

/** Fixed HUDs must use the committed center viewport before the first paint. */
export default function useWorldOverlayPosition(viewportRef: RefObject<HTMLElement>, loading: boolean, selectedScene = false) {
  const [position, setPosition] = useState(unmeasured);
  const overlayRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (loading || !viewport) return;
    const update = () => {
      const rect = viewport.getBoundingClientRect();
      const next = {
        left: Math.round(rect.left + 12), top: Math.round(rect.top + 15),
        right: Math.max(12, Math.round(window.innerWidth - rect.right + 12)),
        bottom: Math.max(12, Math.round(window.innerHeight - rect.bottom + 12)),
        width: Math.round(rect.width), height: Math.round(rect.height),
        measured: rect.width > 0 && rect.height > 0,
      };
      // ResizeObserver runs before paint. Move the HUD now, independently of
      // React scheduling the more expensive world/layout render.
      const overlay = overlayRef.current;
      if (overlay) {
        overlay.style.setProperty('--gba-world-left', `${next.left}px`);
        overlay.style.setProperty('--gba-world-top', `${next.top}px`);
        overlay.style.setProperty('--gba-world-right', `${next.right}px`);
        overlay.style.setProperty('--gba-world-bottom', `${next.bottom}px`);
        const hud = getWorldHudLayout(next.width, next.height, selectedScene);
        overlay.style.setProperty('--gba-hud-info-display', hud.infoVisible ? 'block' : 'none');
        overlay.style.setProperty('--gba-hud-info-width', `${hud.infoWidth}px`);
        overlay.style.setProperty('--gba-hud-minimap-display', hud.minimapVisible ? 'block' : 'none');
        overlay.style.setProperty('--gba-hud-minimap-width', `${hud.minimapWidth}px`);
        overlay.style.setProperty('--gba-hud-minimap-height', `${hud.minimapHeight}px`);
        overlay.style.setProperty('--gba-hud-minimap-bottom', `${hud.minimapBottom}px`);
        overlay.style.setProperty('--gba-hud-usage-display', hud.usageVisible ? 'flex' : 'none');
      }
      setPosition(previous => Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    update();
    const observer = new ResizeObserver(update);
    // Splitters can move the viewport as well as resize it.
    let ancestor: HTMLElement | null = viewport;
    while (ancestor) { observer.observe(ancestor); ancestor = ancestor.parentElement; }
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [viewportRef, loading, selectedScene]);
  return { ...position, overlayRef };
}
