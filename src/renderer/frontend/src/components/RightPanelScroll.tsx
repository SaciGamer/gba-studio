import React, { useLayoutEffect, useRef } from 'react';
import useAppContexts from '@/providers/contexts/AppContexts';

export default function RightPanelScroll({ children }: { children: React.ReactNode }) {
  const { scenes, elementSelected, settingUtils, userSettingsRef, setUserSettings } = useAppContexts();
  const sceneId = scenes.find(scene => scene.id === elementSelected?.id && !scene._deleted)?.id;
  const object = settingUtils.activeSceneObject;
  const scrollKey = sceneId ? object?.sceneId === sceneId ? `${sceneId}:${object.type}:${object.id}` : sceneId : null;
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const restoringRef = useRef(false);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const saved = scrollKey ? userSettingsRef.current.rightPanelScrollPositions?.[scrollKey] : 0;
    const target = typeof saved === 'number' && Number.isFinite(saved) ? Math.max(0, saved) : 0;
    restoringRef.current = true;
    const restore = () => {
      if (!restoringRef.current) return;
      viewport.scrollTop = target;
      restoringRef.current = Math.abs(viewport.scrollTop - target) > 1;
    };
    restore();
    // Images and expanded event forms can finish laying out after selection.
    const observer = new ResizeObserver(restore);
    observer.observe(content);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [scrollKey, settingUtils.projectPathFile, userSettingsRef]);

  const stopRestoring = () => { restoringRef.current = false; };
  return <div ref={viewportRef} data-testid="right-panel-scroll" style={{ height: '100%', overflow: 'auto' }}
    onWheel={stopRestoring} onPointerDown={stopRestoring} onKeyDown={stopRestoring}
    onScroll={event => {
      if (!scrollKey || restoringRef.current) return;
      const top = event.currentTarget.scrollTop;
      setUserSettings(previous => previous.rightPanelScrollPositions?.[scrollKey] === top ? previous : {
        ...previous, rightPanelScrollPositions: { ...previous.rightPanelScrollPositions, [scrollKey]: top }, _saved: false,
      });
    }}>
    <div ref={contentRef}>{children}</div>
  </div>;
}
