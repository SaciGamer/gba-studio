import React, { useCallback, useLayoutEffect, useRef } from 'react';
import useAppContexts from '@/providers/contexts/AppContexts';

export default function RightPanelScroll({ children }: { children: React.ReactNode }) {
  const { scenes, elementSelected, settingUtils, userSettings, userSettingsRef, setUserSettings } = useAppContexts();
  const sceneId = scenes.find(scene => scene.id === elementSelected?.id && !scene._deleted)?.id;
  const object = settingUtils.activeSceneObject;
  const baseScrollKey = sceneId ? object?.sceneId === sceneId ? `${sceneId}:${object.type}:${object.id}` : sceneId : null;
  const ownerPrefix = `${elementSelected?.id ?? 'resource'}:${object?.id ?? ''}:`;
  const focusIds = Object.entries(userSettings?.eventEditorFocus ?? {}).filter(([key, id]) => key.startsWith(ownerPrefix) && id).sort(([a], [b]) => a.localeCompare(b)).map(([, id]) => id);
  const scrollKey = baseScrollKey && focusIds.length ? `${baseScrollKey}:focus:${focusIds.join(':')}` : baseScrollKey;
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const restoringRef = useRef(false);
  const pendingScrollRef = useRef<{ key: string; top: number; project: typeof settingUtils.projectPathFile } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const projectRef = useRef(settingUtils.projectPathFile);
  projectRef.current = settingUtils.projectPathFile;
  const flushScroll = useCallback(() => {
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    const pending = pendingScrollRef.current;
    pendingScrollRef.current = null;
    if (!pending || pending.project !== projectRef.current) return;
    // Selection/remount layout effects must see the final position immediately,
    // before React applies the settings update queued by the previous panel.
    const current = userSettingsRef.current;
    if (current.rightPanelScrollPositions?.[pending.key] !== pending.top) {
      userSettingsRef.current = { ...current, rightPanelScrollPositions: { ...current.rightPanelScrollPositions, [pending.key]: pending.top }, _saved: false };
    }
    setUserSettings(previous => previous.rightPanelScrollPositions?.[pending.key] === pending.top ? previous : {
      ...previous, rightPanelScrollPositions: { ...previous.rightPanelScrollPositions, [pending.key]: pending.top }, _saved: false,
    });
  }, [setUserSettings, userSettingsRef]);

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
    return () => { observer.disconnect(); flushScroll(); };
  }, [scrollKey, settingUtils.projectPathFile, userSettingsRef, flushScroll]);

  const stopRestoring = () => { restoringRef.current = false; };
  return <div ref={viewportRef} data-testid="right-panel-scroll" style={{ height: '100%', overflow: 'auto' }}
    onWheel={stopRestoring} onPointerDown={stopRestoring} onKeyDown={stopRestoring}
    onScroll={event => {
      if (!scrollKey || restoringRef.current) return;
      const top = event.currentTarget.scrollTop;
      pendingScrollRef.current = { key: scrollKey, top, project: settingUtils.projectPathFile };
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushScroll, 180);
    }}>
    <div ref={contentRef} style={{ minHeight: '100%' }}>{children}</div>
  </div>;
}
