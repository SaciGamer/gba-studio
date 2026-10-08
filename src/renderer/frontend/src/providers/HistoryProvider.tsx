import React, { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BackgroundContext, ElementContext, PalettesContext, ProjectContext, SceneContext, ScriptsContext, SettingsContext, SettingsUtilsContext, SpriteContext, VariablesContext } from './Providers';

type Snapshot = {
  project: unknown;
  settings: unknown;
  scenes: unknown;
  backgrounds: unknown;
  sprites: unknown;
  scripts: unknown;
  palettes: unknown;
  variables: unknown;
  selected: unknown;
  selectedSceneIds: unknown;
};

type HistoryContextValue = {
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
  limit: number;
};

export const HistoryContext = createContext<HistoryContextValue | undefined>(undefined);

const clone = <T,>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;

const withoutTransientFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutTransientFields);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== '_saved')
      .map(([key, item]) => [key, withoutTransientFields(item)]));
  }
  return value;
};

const nextId = () => crypto.randomUUID();

const duplicateEvents = (events: any[] | undefined): any[] | undefined => events?.map(event => ({
  ...clone(event),
  id: nextId(),
  children: event.children ? Object.fromEntries(Object.entries(event.children).map(([key, items]) => [key, duplicateEvents(items as any[])])) : undefined,
}));

const duplicateEventGraphs = (graphs: Record<string, any> | undefined): Record<string, any> | undefined => {
  if (!graphs) return graphs;
  return Object.fromEntries(Object.entries(graphs).map(([key, graph]) => {
    const ids = new Map<string, string>();
    (graph.nodes ?? []).forEach((node: any) => ids.set(node.id, nextId()));
    return [key, {
      ...clone(graph),
      entryNodeId: graph.entryNodeId ? ids.get(graph.entryNodeId) ?? null : null,
      nodes: (graph.nodes ?? []).map((node: any) => ({ ...clone(node), id: ids.get(node.id) ?? nextId(), children: node.children ? Object.fromEntries(Object.entries(node.children).map(([childKey, items]) => [childKey, duplicateEvents(items as any[])])) : undefined })),
      edges: (graph.edges ?? []).map((edge: any) => ({ ...clone(edge), id: nextId(), source: ids.get(edge.source) ?? edge.source, target: ids.get(edge.target) ?? edge.target })),
    }];
  }));
};

const duplicateScene = (source: any, scenes: any[]) => {
  const copied = clone(source) as any;
  const index = scenes.reduce((highest, scene) => Math.max(highest, Number(scene._index) || 0), -1) + 1;
  const sceneId = nextId();
  return {
    ...copied,
    id: sceneId,
    _index: index,
    _saved: false,
    _deleted: false,
    name: `${source.name || `SCENE ${index}`} Copy`,
    editorPosition: source.editorPosition ? { x: source.editorPosition.x + 16, y: source.editorPosition.y + 16 } : source.editorPosition,
    x: typeof source.x === 'number' ? source.x + 16 : source.x,
    y: typeof source.y === 'number' ? source.y + 16 : source.y,
    collisions: source.collisions?.map((item: any) => ({ ...clone(item), id: nextId(), sceneId })),
    triggers: source.triggers?.map((item: any) => ({ ...clone(item), id: nextId(), sceneId, script: duplicateEvents(item.script), onEnterScript: duplicateEvents(item.onEnterScript), onLeaveScript: duplicateEvents(item.onLeaveScript) })),
    actors: source.actors?.map((item: any) => ({ ...clone(item), id: nextId(), sceneId })),
    spawnPoints: source.spawnPoints?.map((item: any) => ({ ...clone(item), id: nextId() })),
    script: duplicateEvents(source.script),
    playerHit1Script: duplicateEvents(source.playerHit1Script),
    playerHit2Script: duplicateEvents(source.playerHit2Script),
    playerHit3Script: duplicateEvents(source.playerHit3Script),
    eventGraphs: duplicateEventGraphs(source.eventGraphs),
  };
};

export const HistoryProvider = ({ children }: { children: ReactNode }) => {
  const scene = useContext(SceneContext)!;
  const project = useContext(ProjectContext)!;
  const settings = useContext(SettingsContext)!;
  const backgrounds = useContext(BackgroundContext)!;
  const sprites = useContext(SpriteContext)!;
  const scripts = useContext(ScriptsContext)!;
  const palettes = useContext(PalettesContext)!;
  const variables = useContext(VariablesContext)!;
  const element = useContext(ElementContext)!;
  const settingsUtils = useContext(SettingsUtilsContext)!;
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const [limit, setLimit] = useState(50);
  const previousRef = useRef<Snapshot | null>(null);
  const previousSignatureRef = useRef('');
  const restoringRef = useRef(false);

  const snapshot = useMemo<Snapshot>(() => ({
    project: project.project,
    settings: settings.settings,
    scenes: scene.scenes,
    backgrounds: backgrounds.backgrounds,
    sprites: sprites.spriteResources,
    scripts: scripts.scripts,
    palettes: palettes.palettes,
    variables: variables.variables,
    selected: element.elementSelected,
    selectedSceneIds: settingsUtils.settingUtils.selectedSceneIds ?? [],
  }), [project.project, settings.settings, scene.scenes, backgrounds.backgrounds, sprites.spriteResources, scripts.scripts, palettes.palettes, variables.variables, element.elementSelected, settingsUtils.settingUtils.selectedSceneIds]);
  // Selection is part of navigation history too, so undo always restores the
  // exact editing context as well as the changed resource.
  const signature = useMemo(() => JSON.stringify(withoutTransientFields({
    project: snapshot.project,
    settings: snapshot.settings,
    scenes: snapshot.scenes,
    backgrounds: snapshot.backgrounds,
    sprites: snapshot.sprites,
    scripts: snapshot.scripts,
    palettes: snapshot.palettes,
    variables: snapshot.variables,
    selected: snapshot.selected,
    selectedSceneIds: snapshot.selectedSceneIds,
  })), [snapshot]);

  useEffect(() => {
    void window.electronAPI.loadPreferences?.().then((preferences: { historyLimit?: number }) => {
      const next = Math.max(1, Math.min(500, Math.floor(Number(preferences?.historyLimit) || 50)));
      setLimit(next);
    });
  }, []);

  useEffect(() => {
    const onLimitChange = (event: Event) => {
      const value = Number((event as CustomEvent<number>).detail);
      const next = Math.max(1, Math.min(500, Math.floor(value || 50)));
      setLimit(next);
      setUndoStack(stack => stack.slice(-next));
      setRedoStack(stack => stack.slice(-next));
    };
    window.addEventListener('gba-studio:history-limit', onLimitChange);
    return () => window.removeEventListener('gba-studio:history-limit', onLimitChange);
  }, []);

  useEffect(() => {
    if (!previousRef.current) {
      previousRef.current = clone(snapshot);
      previousSignatureRef.current = signature;
      return;
    }
    if (restoringRef.current) {
      restoringRef.current = false;
      previousRef.current = clone(snapshot);
      previousSignatureRef.current = signature;
      return;
    }
    // Resource loading starts from empty providers. It is the initial baseline,
    // not a user edit that should undo to an empty project.
    if (!previousRef.current.project && snapshot.project) {
      setUndoStack([]);
      setRedoStack([]);
      previousRef.current = clone(snapshot);
      previousSignatureRef.current = signature;
      return;
    }
    if (signature === previousSignatureRef.current) {
      previousRef.current = clone(snapshot);
      return;
    }
    const previous = previousRef.current;
    setUndoStack(stack => [...stack, previous].slice(-limit));
    setRedoStack([]);
    previousRef.current = clone(snapshot);
    previousSignatureRef.current = signature;
  }, [limit, signature, snapshot]);

  const restore = useCallback((next: Snapshot) => {
    restoringRef.current = true;
    project.setProject(clone(next.project) as any);
    settings.setSettings(clone(next.settings) as any);
    scene.setScenes(clone(next.scenes) as any);
    backgrounds.setBackgrounds(clone(next.backgrounds) as any);
    sprites.setSpriteResources(clone(next.sprites) as any);
    scripts.setScripts(clone(next.scripts) as any);
    palettes.setPalettes(clone(next.palettes) as any);
    variables.setVariables(previous => {
      const restored = clone(next.variables) as any;
      const variableList = Array.isArray(restored)
        ? restored
        : Array.isArray(restored?.variables)
          ? restored.variables
          : [];
      // Older snapshots stored the complete variables resource, whereas new
      // snapshots store its list. Normalize both forms before restoring.
      return {
        ...(Array.isArray(previous) ? { _resourceType: 'variables', _version: '1.0', _saved: false, _deleted: false } : previous),
        variables: variableList,
      } as any;
    });
    element.setElementSelected(clone(next.selected) as any);
    settingsUtils.setSettingUtils(previous => ({ ...previous, selectedSceneIds: clone(next.selectedSceneIds) as string[] }));
  }, [backgrounds, element, palettes, project, scene, scripts, settings, settingsUtils, sprites, variables]);

  const undo = useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack(stack => stack.slice(0, -1));
    setRedoStack(stack => [...stack, clone(snapshot)].slice(-limit));
    restore(previous);
  }, [limit, restore, snapshot, undoStack]);

  const redo = useCallback(() => {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack(stack => stack.slice(0, -1));
    setUndoStack(stack => [...stack, clone(snapshot)].slice(-limit));
    restore(next);
  }, [limit, redoStack, restore, snapshot]);

  const clearHistory = useCallback(() => { setUndoStack([]); setRedoStack([]); }, []);
  const copiedSceneRef = useRef<any | null>(null);
  const cutSceneIdRef = useRef<string | null>(null);
  const copiedObjectRef = useRef<{ type: 'actor' | 'trigger'; value: any } | null>(null);
  const copiedResourceRef = useRef<{ type: string; value: any } | null>(null);

  const updateSceneClipboard = (detail: { id: string; mode: 'copy' | 'cut' } | null) => {
    window.dispatchEvent(new CustomEvent('gba-studio:scene-clipboard-changed', { detail }));
  };

  const clearSceneClipboard = useCallback(() => {
    copiedSceneRef.current = null;
    cutSceneIdRef.current = null;
    copiedObjectRef.current = null;
    copiedResourceRef.current = null;
    updateSceneClipboard(null);
  }, []);

  const copySelectedScene = useCallback(() => {
    const activeObject = settingsUtils.settingUtils.activeSceneObject;
    if (activeObject) {
      copiedResourceRef.current = null;
      copiedSceneRef.current = null;
      const sourceScene = scene.scenes.find(item => item.id === activeObject.sceneId);
      const value = (sourceScene?.[activeObject.type === 'actor' ? 'actors' : 'triggers'] as any[] | undefined)?.find(item => item.id === activeObject.id);
      if (value) copiedObjectRef.current = { type: activeObject.type, value: clone(value) };
      return;
    }
    const selected = element.elementSelected as any;
    if (selected?._resourceType && selected._resourceType !== 'scene') {
      copiedSceneRef.current = null;
      copiedObjectRef.current = null;
      const type = String(selected._resourceType);
      const source = type === 'scripts'
        ? scripts.scripts.find(item => item.id === selected.id)
        : type === 'variables'
          ? variables.variables.find(item => item.id === selected.id)
          : type === 'palettes'
            ? palettes.palettes.find(item => item.id === selected.id)
            : type === 'sprites'
              ? sprites.spriteResources.find(item => item.id === selected.id)
              : type === 'backgrounds'
                ? backgrounds.backgrounds.find(item => item.id === selected.id)
                : selected;
      if (source) copiedResourceRef.current = { type, value: clone(source) };
      return;
    }
    const source = scene.scenes.find(item => item.id === selected?.id && !item._deleted);
    if (source) {
      copiedResourceRef.current = null;
      copiedObjectRef.current = null;
      cutSceneIdRef.current = null;
      copiedSceneRef.current = clone(source);
      updateSceneClipboard({ id: source.id, mode: 'copy' });
    }
  }, [backgrounds.backgrounds, element.elementSelected, palettes.palettes, scene.scenes, scripts.scripts, sprites.spriteResources, variables.variables]);

  const pasteScene = useCallback(() => {
    if (copiedResourceRef.current) {
      const { type, value } = copiedResourceRef.current;
      const duplicated = { ...clone(value), id: nextId(), _saved: false, name: `${value.name ?? value.symbol ?? type} Copy` };
      if (type === 'scripts') scripts.setScripts(previous => ({ ...previous, scripts: [...previous.scripts, duplicated], _saved: false }));
      else if (type === 'variables') variables.setVariables(previous => ({ ...previous, variables: [...previous.variables, duplicated], _saved: false }));
      else if (type === 'palettes') palettes.setPalettes(previous => ({ ...previous, palettes: [...previous.palettes, duplicated], _saved: false }));
      else if (type === 'sprites') sprites.setSpriteResources(previous => [...previous, duplicated]);
      else if (type === 'backgrounds') backgrounds.setBackgrounds(previous => [...previous, duplicated]);
      return;
    }
    if (copiedObjectRef.current) {
      const target = element.elementSelected as any;
      const targetScene = scene.scenes.find(item => item.id === target?.id && !item._deleted);
      if (!targetScene) return;
      const { type, value } = copiedObjectRef.current;
      const duplicated = { ...clone(value), id: nextId(), sceneId: targetScene.id };
      const key = type === 'actor' ? 'actors' : 'triggers';
      scene.setScenes(previous => previous.map(item => item.id === targetScene.id ? { ...item, [key]: [...(item[key] ?? []), duplicated], _saved: false } : item));
      return;
    }
    const cutSceneId = cutSceneIdRef.current;
    if (cutSceneId) {
      // A cut is a move, not a duplicate: placement is handled by the world
      // Add Scene tool and this one-use cache is immediately consumed.
      cutSceneIdRef.current = null;
      window.dispatchEvent(new CustomEvent('gba-studio:start-scene-placement', { detail: { id: cutSceneId, mode: 'cut' } }));
      return;
    }
    if (copiedSceneRef.current) window.dispatchEvent(new CustomEvent('gba-studio:start-scene-placement', { detail: { id: copiedSceneRef.current.id, mode: 'copy' } }));
  }, [backgrounds, palettes, scripts, sprites, variables]);

  const cutSelectedScene = useCallback(() => {
    const activeObject = settingsUtils.settingUtils.activeSceneObject;
    if (activeObject) {
      copiedResourceRef.current = null;
      copiedSceneRef.current = null;
      const sourceScene = scene.scenes.find(item => item.id === activeObject.sceneId);
      const key = activeObject.type === 'actor' ? 'actors' : 'triggers';
      const value = (sourceScene?.[key] as any[] | undefined)?.find(item => item.id === activeObject.id);
      if (!value) return;
      copiedObjectRef.current = { type: activeObject.type, value: clone(value) };
      scene.setScenes(previous => previous.map(item => item.id === activeObject.sceneId ? { ...item, [key]: (item[key] ?? []).filter((entry: any) => entry.id !== activeObject.id), _saved: false } : item));
      element.setElementSelected(null);
      settingsUtils.setSettingUtils(previous => ({ ...previous, activeSceneObject: null, activeTriggerId: null }));
      return;
    }
    const selected = element.elementSelected as any;
    if (selected?._resourceType && selected._resourceType !== 'scene') {
      copiedSceneRef.current = null;
      copiedObjectRef.current = null;
      const type = String(selected._resourceType);
      copiedResourceRef.current = { type, value: clone(selected) };
      if (type === 'scripts') scripts.setScripts(previous => ({ ...previous, scripts: previous.scripts.filter(item => item.id !== selected.id), _saved: false }));
      else if (type === 'variables') variables.setVariables(previous => ({ ...previous, variables: previous.variables.filter(item => item.id !== selected.id), _saved: false }));
      else if (type === 'palettes') palettes.setPalettes(previous => ({ ...previous, palettes: previous.palettes.filter(item => item.id !== selected.id), _saved: false }));
      else if (type === 'sprites') sprites.setSpriteResources(previous => previous.filter(item => item.id !== selected.id));
      else if (type === 'backgrounds') backgrounds.setBackgrounds(previous => previous.filter(item => item.id !== selected.id));
      element.setElementSelected(null);
      return;
    }
    const source = scene.scenes.find(item => item.id === selected?.id && !item._deleted);
    if (!source) return;
    copiedResourceRef.current = null;
    copiedObjectRef.current = null;
    copiedSceneRef.current = null;
    cutSceneIdRef.current = source.id;
    updateSceneClipboard({ id: source.id, mode: 'cut' });
    scene.setScenes(previous => previous.map(item => item.id === source.id ? { ...item, _saved: false, _deleted: true } : item));
    element.setElementSelected(null);
    settingsUtils.setSettingUtils(previous => ({ ...previous, selectedSceneIds: [], tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null }));
  }, [backgrounds, element, palettes, scene, settingsUtils, scripts, sprites, variables]);

  useEffect(() => {
    const commitScenePlacement = (event: Event) => {
      const { id, mode, x, y } = (event as CustomEvent<{ id: string; mode: 'copy' | 'cut'; x: number; y: number }>).detail;
      if (mode === 'cut') {
        scene.setScenes(previous => previous.map(item => item.id === id ? { ...item, x, y, editorPosition: { x, y }, _saved: false, _deleted: false } : item));
        const restored = scene.scenes.find(item => item.id === id);
        if (restored) element.setElementSelected({ ...restored, x, y, editorPosition: { x, y }, _saved: false, _deleted: false });
        settingsUtils.setSettingUtils(previous => ({ ...previous, activeButton: 'select', activeSubButton: '', selectedSceneIds: [id] }));
        updateSceneClipboard(null);
        return;
      }
      if (!copiedSceneRef.current) return;
      const duplicated = { ...duplicateScene(copiedSceneRef.current, scene.scenes), x, y, editorPosition: { x, y } };
      scene.setScenes(previous => [...previous, duplicated]);
      element.setElementSelected(duplicated);
      settingsUtils.setSettingUtils(previous => ({ ...previous, activeButton: 'select', activeSubButton: '', selectedSceneIds: [duplicated.id] }));
    };
    window.addEventListener('gba-studio:commit-scene-placement', commitScenePlacement);
    return () => window.removeEventListener('gba-studio:commit-scene-placement', commitScenePlacement);
  }, [element, scene, settingsUtils]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearSceneClipboard();
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target as HTMLElement | null)?.isContentEditable) return;
      const key = event.key.toLowerCase();
      if (key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (key === 'y') { event.preventDefault(); redo(); }
      else if (key === 'c') { event.preventDefault(); copySelectedScene(); }
      else if (key === 'v') { event.preventDefault(); pasteScene(); }
      else if (key === 'x') { event.preventDefault(); cutSelectedScene(); }
    };
    const onUndo = () => undo();
    const onRedo = () => redo();
    const onCopy = () => copySelectedScene();
    const onPaste = () => pasteScene();
    const onCut = () => cutSelectedScene();
    const onClearClipboard = () => clearSceneClipboard();
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('gba-studio:undo', onUndo);
    window.addEventListener('gba-studio:redo', onRedo);
    window.addEventListener('gba-studio:scene-copy', onCopy);
    window.addEventListener('gba-studio:scene-paste', onPaste);
    window.addEventListener('gba-studio:scene-cut', onCut);
    window.addEventListener('gba-studio:clear-scene-clipboard', onClearClipboard);
    const unsubscribe = [
      window.electronAPI?.subscribe?.('history-undo', onUndo),
      window.electronAPI?.subscribe?.('history-redo', onRedo),
      window.electronAPI?.subscribe?.('scene-copy', onCopy),
      window.electronAPI?.subscribe?.('scene-paste', onPaste),
      window.electronAPI?.subscribe?.('scene-cut', onCut),
    ].filter((cancel): cancel is () => void => typeof cancel === 'function');
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('gba-studio:undo', onUndo);
      window.removeEventListener('gba-studio:redo', onRedo);
      window.removeEventListener('gba-studio:scene-copy', onCopy);
      window.removeEventListener('gba-studio:scene-paste', onPaste);
      window.removeEventListener('gba-studio:scene-cut', onCut);
      window.removeEventListener('gba-studio:clear-scene-clipboard', onClearClipboard);
      unsubscribe.forEach(cancel => cancel());
    };
  }, [clearSceneClipboard, copySelectedScene, cutSelectedScene, pasteScene, redo, undo]);

  return <HistoryContext.Provider value={{ undo, redo, clearHistory, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, limit }}>{children}</HistoryContext.Provider>;
};

export const useHistory = () => {
  const context = useContext(HistoryContext);
  if (!context) throw new Error('useHistory must be used within HistoryProvider');
  return context;
};
