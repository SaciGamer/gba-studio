import { isModalOpen } from '@/utils/isModalOpen';
import { createHistorySnapshotCache } from './historySnapshot';
import React, { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { BackgroundContext, ElementContext, PalettesContext, PrefabsContext, ProjectContext, SceneContext, ScriptsContext, SettingsContext, SettingsUtilsContext, SpriteContext, VariablesContext } from './Providers';

type Snapshot = {
  project: unknown;
  settings: unknown;
  scenes: unknown;
  backgrounds: unknown;
  sprites: unknown;
  scripts: unknown;
  palettes: unknown;
  prefabs: unknown;
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
  const prefabs = useContext(PrefabsContext)!;
  const variables = useContext(VariablesContext)!;
  const element = useContext(ElementContext)!;
  const settingsUtils = useContext(SettingsUtilsContext)!;
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<Snapshot[]>([]);
  const [limit, setLimit] = useState(50);
  const previousRef = useRef<Snapshot | null>(null);
  const [snapshotCache] = useState(createHistorySnapshotCache);
  const restoringRef = useRef(false);

  const snapshot = useMemo<Snapshot>(() => snapshotCache.capture({
    project: project.project,
    settings: settings.settings,
    scenes: scene.scenes,
    backgrounds: backgrounds.backgrounds,
    sprites: sprites.spriteResources,
    scripts: scripts.scripts,
    palettes: palettes.palettes,
    prefabs: prefabs.prefabs,
    variables: variables.variables,
    selected: element.elementSelected,
    selectedSceneIds: settingsUtils.settingUtils.selectedSceneIds ?? [],
  }), [snapshotCache, project.project, settings.settings, scene.scenes, backgrounds.backgrounds, sprites.spriteResources, scripts.scripts, palettes.palettes, prefabs.prefabs, variables.variables, element.elementSelected, settingsUtils.settingUtils.selectedSceneIds]);
  // Navigation remains undoable, but unchanged resource trees are shared.

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
      previousRef.current = snapshot;
      return;
    }
    if (restoringRef.current) {
      restoringRef.current = false;
      previousRef.current = snapshot;
      return;
    }
    // Resource loading starts from empty providers. It is the initial baseline,
    // not a user edit that should undo to an empty project.
    if (!previousRef.current.project && snapshot.project) {
      setUndoStack([]);
      setRedoStack([]);
      previousRef.current = snapshot;
      return;
    }
    if (snapshot === previousRef.current) {
      previousRef.current = snapshot;
      return;
    }
    const previous = previousRef.current;
    setUndoStack(stack => [...stack, previous].slice(-limit));
    setRedoStack([]);
    previousRef.current = snapshot;
  }, [limit, snapshot]);

  const restore = useCallback((next: Snapshot) => {
    restoringRef.current = true;
    const current = previousRef.current ?? snapshot;
    const restoreField = <K extends keyof Snapshot>(key: K, setter: (value: any) => void) => {
      if (next[key] !== current[key]) setter((value: any) => snapshotCache.restore(next[key], value));
    };
    restoreField('project', project.setProject);
    restoreField('settings', settings.setSettings);
    restoreField('scenes', scene.setScenes);
    restoreField('backgrounds', backgrounds.setBackgrounds);
    restoreField('sprites', sprites.setSpriteResources);
    restoreField('scripts', scripts.setScripts);
    restoreField('palettes', palettes.setPalettes);
    restoreField('prefabs', prefabs.setPrefabs);
    if (next.variables !== current.variables) variables.setVariables(previous => {
      const restored = next.variables as any;
      const variableList = Array.isArray(restored) ? restored : restored?.variables ?? [];
      return { ...previous, variables: snapshotCache.restore(variableList, previous.variables), _saved: false } as any;
    });
    restoreField('selected', element.setElementSelected);
    if (next.selectedSceneIds !== current.selectedSceneIds) settingsUtils.setSettingUtils(previous => ({
      ...previous,
      selectedSceneIds: snapshotCache.restore(next.selectedSceneIds, previous.selectedSceneIds) as string[],
    }));
  }, [snapshot, snapshotCache, backgrounds, element, palettes, prefabs, project, scene, scripts, settings, settingsUtils, sprites, variables]);

  const undo = useCallback(() => {
    const previous = undoStack.at(-1);
    if (!previous) return;
    setUndoStack(stack => stack.slice(0, -1));
    setRedoStack(stack => [...stack, snapshot].slice(-limit));
    restore(previous);
  }, [limit, restore, snapshot, undoStack]);

  const redo = useCallback(() => {
    const next = redoStack.at(-1);
    if (!next) return;
    setRedoStack(stack => stack.slice(0, -1));
    setUndoStack(stack => [...stack, snapshot].slice(-limit));
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
      if (isModalOpen()) return;
      if (event.key === 'Escape') {
        clearSceneClipboard();
        return;
      }
      if (event.key === 'Delete' && document.querySelector('[data-asset-kind="palettes"]')) {
        const target = event.target as HTMLElement | null;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable
          || target?.closest('[role="slider"], [role="combobox"], [role="spinbutton"]')) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('gba-studio:palette-delete-request'));
        return;
      }
      if (event.key === 'Delete' && document.querySelector('[data-asset-kind="sounds"]')) {
        const target = event.target as HTMLElement | null;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable
          || target?.closest('[role="slider"], [role="combobox"], [role="spinbutton"]')) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('gba-studio:sound-delete-request'));
        return;
      }
      if (event.key === 'Delete' && document.querySelector('[data-editor-history="music"], [data-music-workspace="true"]')) {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target as HTMLElement | null)?.isContentEditable) return;
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('gba-studio:music-delete-request'));
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const targetInput = target instanceof HTMLInputElement ? target : target?.closest('input');
      const isTextInput = targetInput instanceof HTMLInputElement
        && !targetInput.closest('[role="spinbutton"], [role="combobox"]')
        && ['text', 'search', 'email', 'url', 'tel', 'password'].includes(targetInput.type);
      const inMusicFxEditor = Boolean(target?.closest('.gba-music-fx-config'));
      if (isTextInput || target instanceof HTMLTextAreaElement || target?.isContentEditable
        || !inMusicFxEditor && target?.closest('[contenteditable="true"], [role="textbox"], [role="combobox"]')) return;
      if (document.querySelector('[data-editor-history="music"]')
        || (event.target as HTMLElement | null)?.closest?.('[data-editor-history="music"]')
        || document.querySelector('.gba-sample-editor-modal [data-editor-history="music"]')) {
        const key = event.key.toLowerCase();
        const action = key === 'z' && event.shiftKey
          ? 'gba-studio:editor-redo'
          : key === 'z' ? 'gba-studio:editor-undo'
            : ({ c: 'copy', x: 'cut', v: 'paste', d: 'duplicate' } as Record<string, string>)[key];
        if (action) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          if (action.startsWith('gba-studio:')) window.dispatchEvent(new CustomEvent(action));
          else window.dispatchEvent(new CustomEvent('gba-studio:music-edit-command', { detail: { command: action } }));
          return;
        }
      }
      // Tile editing owns its own clipboard. Let the scene canvas handle
      // Ctrl+C/X/V so these shortcuts copy tile selections instead of scenes.
      if (settingsUtils.settingUtils.tileEditSceneId && ['c', 'x', 'v'].includes(event.key.toLowerCase())) return;
      const key = event.key.toLowerCase();
      if (key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (key === 'c') { event.preventDefault(); copySelectedScene(); }
      else if (key === 'v') { event.preventDefault(); pasteScene(); }
      else if (key === 'x') { event.preventDefault(); cutSelectedScene(); }
    };
    const onUndo = () => undo();
    const onRedo = () => redo();
    const routeMusicCommand = (command: string, fallback: () => void) => {
      if (document.querySelector('[data-editor-history="music"]')) {
        window.dispatchEvent(new CustomEvent('gba-studio:music-edit-command', { detail: { command } }));
      } else fallback();
    };
    const onCopy = () => routeMusicCommand('copy', copySelectedScene);
    const onPaste = () => routeMusicCommand('paste', pasteScene);
    const onCut = () => routeMusicCommand('cut', cutSelectedScene);
    const onDuplicate = () => routeMusicCommand('duplicate', () => { copySelectedScene(); pasteScene(); });
    const onDelete = () => {
      if (isModalOpen()) return;
      if (document.querySelector('[data-asset-kind="palettes"]')) window.dispatchEvent(new CustomEvent('gba-studio:palette-delete-request'));
      else if (document.querySelector('[data-asset-kind="sounds"]')) window.dispatchEvent(new CustomEvent('gba-studio:sound-delete-request'));
      else if (document.querySelector('[data-editor-history="music"], [data-music-workspace="true"]')) window.dispatchEvent(new CustomEvent('gba-studio:music-delete-request'));
      else window.dispatchEvent(new CustomEvent('gba-studio:scene-delete'));
    };
    const onClearClipboard = () => clearSceneClipboard();
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('gba-studio:undo', onUndo);
    window.addEventListener('gba-studio:redo', onRedo);
    window.addEventListener('gba-studio:scene-copy', onCopy);
    window.addEventListener('gba-studio:scene-paste', onPaste);
    window.addEventListener('gba-studio:scene-cut', onCut);
    window.addEventListener('gba-studio:scene-duplicate', onDuplicate);
    window.addEventListener('gba-studio:clear-scene-clipboard', onClearClipboard);
    const unsubscribe = [
      window.electronAPI?.subscribe?.('history-undo', onUndo),
      window.electronAPI?.subscribe?.('history-redo', onRedo),
      window.electronAPI?.subscribe?.('scene-copy', onCopy),
      window.electronAPI?.subscribe?.('scene-paste', onPaste),
      window.electronAPI?.subscribe?.('scene-cut', onCut),
      window.electronAPI?.subscribe?.('scene-duplicate', onDuplicate),
      window.electronAPI?.subscribe?.('editor-delete', onDelete),
    ].filter((cancel): cancel is () => void => typeof cancel === 'function');
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('gba-studio:undo', onUndo);
      window.removeEventListener('gba-studio:redo', onRedo);
      window.removeEventListener('gba-studio:scene-copy', onCopy);
      window.removeEventListener('gba-studio:scene-paste', onPaste);
      window.removeEventListener('gba-studio:scene-cut', onCut);
      window.removeEventListener('gba-studio:scene-duplicate', onDuplicate);
      window.removeEventListener('gba-studio:clear-scene-clipboard', onClearClipboard);
      unsubscribe.forEach(cancel => cancel());
    };
  }, [clearSceneClipboard, copySelectedScene, cutSelectedScene, pasteScene, redo, settingsUtils.settingUtils.tileEditSceneId, undo]);

  return <HistoryContext.Provider value={{ undo, redo, clearHistory, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, limit }}>{children}</HistoryContext.Provider>;
};

export const useHistory = () => {
  const context = useContext(HistoryContext);
  if (!context) throw new Error('useHistory must be used within HistoryProvider');
  return context;
};
