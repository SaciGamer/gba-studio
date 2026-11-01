import { isActiveProjectEntry } from '../../../../shared/projectCollectionEntries';
import { usePanelResizeHandlers } from '@/utils/panelResize';
import { trackerInstrumentHierarchyColor, trackerInstrumentHierarchyNumber } from '@/utils/trackerInstrumentOptions';
import { cacheLeftNavigation, cachedWorkspaceLayout, loadWorkspaceLayout, restoreLeftNavigation, workspaceLayoutKey } from '@/utils/workspaceLayout';
import useAppContexts from '@/providers/contexts/AppContexts';
import { matchesSceneSearch, sceneSearchAfterSelection } from '@/utils/sceneSearch';
import { ETypeScene, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { AudioMutedOutlined, EyeOutlined, EyeInvisibleOutlined, SoundOutlined, BuildOutlined, CaretRightFilled, CaretRightOutlined, CopyOutlined, CustomerServiceOutlined, FileFilled, FolderOutlined, GatewayOutlined, PlusOutlined, SearchOutlined, SettingOutlined, SwapOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Collapse, Divider, Dropdown, Flex, Input, Layout, List, message, Space, Splitter, Tooltip, Tree, TreeDataNode, Typography } from 'antd';
import React, { Key, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AntdToken } from '../components/common/AntDToken';
import { IVariableDefinition } from '@/providers/contexts/interfaces/IVariablesElement';
import { IScriptDefinition } from '@/providers/contexts/interfaces/IScriptElement';
import { PREFAB_ACTORS_FOLDER_ID, PREFAB_TRIGGERS_FOLDER_ID } from '@/providers/contexts/interfaces/IPrefabElement';
import type { IPrefabDefinition } from '@/providers/contexts/interfaces/IPrefabElement';
import { useI18n } from '@/i18n/I18n';
import { useMusicEditorWorkspace } from './resourceEditors/MusicEditorWorkspace';
import { canCreateScratchInstrument, canImportWavSample } from './resourceEditors/musicEditorCapabilities';
import { TRACKER_INSTRUMENT_PRESETS } from '@/utils/trackerModule';
import { MAX_MUSIC_COMPOSITION_INSTRUMENTS } from '@/utils/trackerComposition';
import { encodePcm16Wav, generateSfx, type SfxParameters } from '@/utils/sfxGenerator';
import { WarningOutlined } from '@ant-design/icons';
import { countObjectAttention, countPrefabAttention, countSceneAttention, countScriptAttention } from '../../../../shared/events/eventAttention';

const { Content } = Layout;
const { Panel } = Collapse;
const { Text } = Typography;

const getVariableDefaultName = (symbol: string): string => {
  const readableName = symbol.replace(/^variable_?/i, '').replace(/_/g, ' ').trim();
  if (!readableName) return symbol;

  return `Variable ${readableName}`;
};

const SceneLeftPanel: React.FC<{ showScriptsAndVariables?: boolean }> = ({ showScriptsAndVariables = true }) => {
  // const { scenes } = useSceneContext();
  // const { settingUtils, setSettingUtils } = useSettingsUtilsContext();
  // const { elementSelected, setElementSelected } = useElementContext();

  const { scenes, settings, variables, setVariables, scripts, setScripts, prefabs, setPrefabs, settingUtils, setSettingUtils, elementSelected, setElementSelected } = useAppContexts();

  const leftNavigationProjectId = workspaceLayoutKey(settingUtils.projectPathFile);
  const initialNavigation = restoreLeftNavigation(cachedWorkspaceLayout(settingUtils.projectPathFile)?.leftNavigation);
  const [navigationReady, setNavigationReady] = useState(() => Boolean(cachedWorkspaceLayout(settingUtils.projectPathFile)));
  const [isScenesOpen, setIsScenesOpen] = useState(initialNavigation.sections.scenes);
  const [isScriptsOpen, setIsScriptsOpen] = useState(initialNavigation.sections.scripts);
  const [isPrefabsOpen, setIsPrefabsOpen] = useState(initialNavigation.sections.prefabs);
  const [isVariablesOpen, setIsVariablesOpen] = useState(initialNavigation.sections.variables);
  const [expandedTrees, setExpandedTrees] = useState<Record<'scenes' | 'prefabs' | 'scripts' | 'variables', Array<string | number> | undefined>>(initialNavigation.expandedKeys);
  const loadedNavigationProjectRef = useRef<string | null>(null);
  const navigationDirtyRef = useRef(false);
  const resizingNavigationRef = useRef(false);

  const [searchOpen, setSearchOpen] = useState({ scenes: false, prefabs: false, scripts: false, variables: false });
  const searchInputRef = useRef<any>(null);
  const { token } = AntdToken();
  const { t } = useI18n();

  const HEADER_HEIGHT = 40; // Altura fixa do header
  const [panelSizes, setPanelSizes] = useState(initialNavigation.sizes);

  const [treeHeightScenes, setTreeHeightScenes] = useState(window.innerHeight);
  const [treeHeightScripts, setTreeHeightScripts] = useState(window.innerHeight);
  const [treeHeightPrefabs, setTreeHeightPrefabs] = useState(window.innerHeight);
  const [treeHeightVariables, setTreeHeightVariables] = useState(window.innerHeight);
  const navigationRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panels = navigationRef.current?.querySelectorAll<HTMLElement>('.ant-splitter-panel');
    if (!panels) return;

    const updateTreeHeights = () => {
      setTreeHeightScenes(Math.max(0, (panels[0]?.clientHeight ?? 0) - 60));
      setTreeHeightPrefabs(Math.max(0, (panels[1]?.clientHeight ?? 0) - 60));
      setTreeHeightScripts(Math.max(0, (panels[2]?.clientHeight ?? 0) - 60));
      setTreeHeightVariables(Math.max(0, (panels[3]?.clientHeight ?? 0) - 60));
    };
    const observer = new ResizeObserver(updateTreeHeights);
    panels.forEach(panel => observer.observe(panel));
    updateTreeHeights();
    return () => observer.disconnect();
  }, [showScriptsAndVariables]);
  useLayoutEffect(() => {
    let cancelled = false;
    loadedNavigationProjectRef.current = null;
    navigationDirtyRef.current = false;
    const restore = (saved: ReturnType<typeof cachedWorkspaceLayout>) => {
      if (cancelled) return;
      const restored = restoreLeftNavigation(saved?.leftNavigation, navigationRef.current?.clientHeight || window.innerHeight);
      setExpandedTrees(restored.expandedKeys);
      setIsScenesOpen(restored.sections.scenes);
      setIsScriptsOpen(restored.sections.scripts);
      setIsPrefabsOpen(restored.sections.prefabs);
      setIsVariablesOpen(restored.sections.variables);
      setPanelSizes(restored.sizes);
      loadedNavigationProjectRef.current = leftNavigationProjectId;
      setNavigationReady(true);
    };
    const cached = cachedWorkspaceLayout(settingUtils.projectPathFile);
    if (cached) restore(cached);
    else {
      setNavigationReady(false);
      void loadWorkspaceLayout(settingUtils.projectPathFile).then(restore);
    }
    return () => { cancelled = true; };
  }, [leftNavigationProjectId]);

  // Adicione esse novo estado no início do componente
  const [globalSelectedKey, setGlobalSelectedKey] = useState<string | null>(null);

  // Keep the three trees mutually exclusive even when selection is cleared
  // from another component (for example, by clicking the empty game world).
  useEffect(() => {
    if (!elementSelected) {
      setGlobalSelectedKey(null);
      return;
    }
    if (elementSelected._resourceType === 'script') setGlobalSelectedKey(`scripts-${elementSelected.id}`);
    else if (elementSelected._resourceType === 'variables') setGlobalSelectedKey(`variables-${elementSelected.id}`);
    else if (elementSelected._resourceType === 'prefab') setGlobalSelectedKey(`prefabs-prefab:${elementSelected.id}`);
    else setGlobalSelectedKey(null);
  }, [elementSelected]);

  useEffect(() => {
    if (!elementSelected || !['script', 'variables', 'prefab'].includes(elementSelected._resourceType)) {
      setGlobalSelectedKey(null);
    }
  }, [elementSelected]);

  const toggleSection = (section: 'scenes' | 'prefabs' | 'scripts' | 'variables') => {
    navigationDirtyRef.current = true;
    const next = getNextSectionState(section);
    setIsScenesOpen(next.scenes);
    setIsPrefabsOpen(next.prefabs);
    setIsScriptsOpen(next.scripts);
    setIsVariablesOpen(next.variables);
    if (!showScriptsAndVariables) return;
    const totalHeight = navigationRef.current?.clientHeight ?? window.innerHeight;
    setPanelSizes(restoreLeftNavigation({ sections: next }, totalHeight).sizes);
  };

  const [searchTerms, setSearchTerms] = useState({ scenes: '', prefabs: '', scripts: '', variables: '' });
  const searchTerm = searchTerms.scenes;
  const filteredScenes = useMemo(() => {

    return Object.values(scenes).filter(scene => {
      // sempre excluir deletados
      if (scene._deleted) return false;

      // se tiver termo de busca, aplica filtro de nome
      if (!matchesSceneSearch(scene, searchTerm)) {
        return false;
      }

      // se não mostrar scripts/variáveis, também exclui LOGO
      if (!showScriptsAndVariables && !(scene.sceneType === ETypeScene.LOGO || scene.sceneType === ETypeScene.POINTNCLICK)) {
        return false;
      }

      return true;
    });
  }, [scenes, searchTerm, showScriptsAndVariables]);

  const handleSearchClick = (section: 'scenes' | 'prefabs' | 'scripts' | 'variables') => {
    setSearchOpen(previous => ({ ...previous, [section]: !previous[section] }));
    if (searchOpen[section]) setSearchTerms(previous => ({ ...previous, [section]: '' }));
  };

  useEffect(() => {
    if (Object.values(searchOpen).some(Boolean) && searchInputRef.current) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  const treeDataScenes: TreeDataNode[] = filteredScenes.map((scene) => ({
    key: scene.id,
    title: (
      <Flex align='center' style={{ width: '100%', paddingRight: 4 }}>
        <BuildOutlined />
        <Text ellipsis style={{ marginLeft: 5, flex: 1, minWidth: 0 }}>{scene.name}</Text>
        {attentionIndicator(countSceneAttention(scene, settings), `scene-${scene.id}`)}
      </Flex>
    ),
    isLeaf: false,
    children: [
      ...(scene.actors ?? []).map(actor => ({ key: `actor:${scene.id}:${actor.id}`, title: <Flex align="center" style={{ width: '100%', paddingRight: 4 }}><GatewayOutlined /><Text ellipsis style={{ marginLeft: 5, flex: 1, minWidth: 0 }}>{actor.name || 'Actor'}</Text>{attentionIndicator(countObjectAttention(actor), `actor-${scene.id}-${actor.id}`)}</Flex> })),
      ...(scene.triggers ?? []).map(trigger => ({ key: `trigger:${scene.id}:${trigger.id}`, title: <Flex align="center" style={{ width: '100%', paddingRight: 4 }}><ThunderboltOutlined /><Text ellipsis style={{ marginLeft: 5, flex: 1, minWidth: 0 }}>{trigger.name || 'Trigger'}</Text>{attentionIndicator(countObjectAttention(trigger), `trigger-${scene.id}-${trigger.id}`)}</Flex> })),
    ],
  }));

  const updateVariables = (nextVariables: IVariableDefinition[]) => {
    setVariables(prev => ({ ...prev, variables: nextVariables, _saved: false }));
  };

  const openVariableEditor = (variable: IVariableDefinition) => {
    setSettingUtils(previous => ({ ...previous, selectedSceneIds: [], tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null }));
    setElementSelected({ ...variable, _resourceType: 'variables' });
    setGlobalSelectedKey(`variables-${variable.id}`);
  };

  const handleAddVariable = () => {
    let index = variables.variables.length;
    while (variables.variables.some(variable => variable.symbol === `variable_${index}`)) index += 1;
    const variable: IVariableDefinition = {
      id: uuidv4(),
      name: `Variable ${index}`,
      symbol: `variable_${index}`,
      type: 'number',
      initialValue: 0,
    };
    updateVariables([...variables.variables, variable]);
    openVariableEditor(variable);
  };

  const treeDataVariables: TreeDataNode[] = variables.variables.filter(variable => isActiveProjectEntry(variable) && (!searchTerms.variables || (variable.name || getVariableDefaultName(variable.symbol)).toLowerCase().includes(searchTerms.variables.toLowerCase()))).map(variable => ({
    key: variable.id,
    title: (
      <Flex align="center" style={{ paddingRight: 4 }}>
        <Text style={{ marginLeft: 5 }}>$  {variable.name || getVariableDefaultName(variable.symbol)}</Text>
      </Flex>
    ),
  }));

  const updateScripts = (nextScripts: IScriptDefinition[]) => setScripts(prev => ({ ...prev, scripts: nextScripts, _saved: false }));
  const handleAddScript = () => {
    const script: IScriptDefinition = { id: uuidv4(), name: `Script ${scripts.scripts.length}`, events: [] };
    updateScripts([...scripts.scripts, script]);
    setSettingUtils(previous => ({ ...previous, selectedSceneIds: [], tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null }));
    setElementSelected({ ...script, _resourceType: 'script' });
    setGlobalSelectedKey(`scripts-${script.id}`);
  };
  function attentionIndicator(count: number, id: string) { return count > 0 ? (
    <Tooltip title={t('events.hierarchyWarning')} trigger={['hover', 'focus']} zIndex={10000} getPopupContainer={() => document.body}>
      <span className="gba-hierarchy-warning" role="img" tabIndex={0} aria-label={t('events.hierarchyWarning')} data-testid={`event-attention-${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 6, flexShrink: 0, color: token.colorWarning }}>
        <WarningOutlined />{count}
      </span>
    </Tooltip>
  ) : null; }
  const treeDataScripts: TreeDataNode[] = scripts.scripts.filter(script => isActiveProjectEntry(script) && (!searchTerms.scripts || (script.name || '').toLowerCase().includes(searchTerms.scripts.toLowerCase()))).map(script => ({
    key: script.id,
    title: <Flex align="center" style={{ width: '100%', paddingRight: 4 }}><Text ellipsis style={{ marginLeft: 5, flex: 1, minWidth: 0 }}><FileFilled /> {script.name}</Text>{attentionIndicator(countScriptAttention(script), `script-${script.id}`)}</Flex>,
  }));

  const genExtra = () => (
    <SettingOutlined
      onClick={(event) => {
        // If you don't want click extra trigger collapse, you can prevent this:
        console.log(event.detail);
        if (event.detail > 10)
          console.log("Abriu a config após 10 clicks");
        event.stopPropagation();
      }}
    />
  );

  const functionSearch = (section: 'scenes' | 'prefabs' | 'scripts' | 'variables') => (
    <Tooltip placement="right" title={section === 'prefabs' ? t('prefabs.search') : t('common.search')} color={token.colorBorder}>
      <SearchOutlined style={{ marginLeft: 8, padding: 4, borderRadius: token.borderRadius, backgroundColor: searchOpen[section] ? token.colorPrimary : 'transparent', cursor: 'pointer' }} onPointerDown={e => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleSearchClick(section); }} />
    </Tooltip>
  );

  const handleCallNewScene = () => {
    setElementSelected(null);
    setSettingUtils(prev => ({
      ...prev,
      activeButton: 'add',
      activeSubButton: 'Scene',
      tileEditSceneId: null,
      tileEditLayerId: null,
      activeSceneObject: null,
      activeTriggerId: null,
    }))
  }

  const functionAdd = () => (
    <Tooltip placement="bottom" title={"Add Scene"} color={token.colorBorder} >
      <span role="button" aria-label="Add Scene" style={{ display: 'inline-flex' }}>
        <PlusOutlined style={{ marginLeft: 8, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleCallNewScene() }} />
      </span>
    </Tooltip>
  );

  const selectPrefabForEdit = (prefab: IPrefabDefinition) => {
    setElementSelected({ ...prefab, _resourceType: 'prefab' });
    setSettingUtils(previous => ({ ...previous, selectedSceneIds: previous.selectedSceneIds?.slice(-1) ?? [], tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null, pendingPrefabPlacement: null }));
    setGlobalSelectedKey(`prefabs-prefab:${prefab.id}`);
  };
  const addPrefab = (type: 'actor' | 'trigger') => {
    const count = prefabs.prefabs.filter(item => item.type === type).length + 1;
    const id = uuidv4();
    const name = `${type === 'actor' ? t('prefabs.addActor') : t('prefabs.addTrigger')} ${count}`;
    const prefab = (type === 'actor'
      ? { id, name, type, folderId: PREFAB_ACTORS_FOLDER_ID, actor: { name, x: 8, y: 4, width: 16, height: 8, anchor: 'center', moveSpeed: 1, animationSpeed: 6, onInteractScript: [], onInitScript: [], onUpdateScript: [] } }
      : { id, name, type, folderId: PREFAB_TRIGGERS_FOLDER_ID, trigger: { name, x: 0, y: 0, width: 32, height: 32, activation: 'enter', enabled: true, once: false, cooldownFrames: 0, onEnterScript: [], onLeaveScript: [], onInteractScript: [], onInitScript: [], onUpdateScript: [] } }) as IPrefabDefinition;
    setPrefabs(previous => ({ ...previous, prefabs: [...previous.prefabs, prefab], _saved: false }));
    selectPrefabForEdit(prefab);
  };
  const startPrefabPlacement = (prefab: IPrefabDefinition) => {
    const sceneId = settingUtils.activeSceneObject?.sceneId ?? settingUtils.selectedSceneIds?.at(-1) ?? (elementSelected?._resourceType === 'scene' ? elementSelected.id : null);
    const scene = scenes.find(item => item.id === sceneId && !item._deleted);
    if (!scene) { message.warning(t('prefabs.selectSceneWarning')); return; }
    setElementSelected({ ...scene, _recenter: true });
    setSettingUtils(previous => ({ ...previous, worldSceneSearch: sceneSearchAfterSelection(previous.worldSceneSearch, scene), selectedSceneIds: [scene.id], tileEditSceneId: scene.id, tileEditLayerId: 4, activeSceneObject: null, activeTriggerId: null, activeButton: 'add', activeSubButton: 'Prefab', pendingPrefabPlacement: prefab.id }));
  };
  const prefabAddMenu = { items: [
    { key: 'actor', label: t('prefabs.addActor'), onClick: () => addPrefab('actor') },
    { key: 'trigger', label: t('prefabs.addTrigger'), onClick: () => addPrefab('trigger') },
  ] };
  const prefabNodes = (): TreeDataNode[] => [
      { key: `prefab-folder:${PREFAB_ACTORS_FOLDER_ID}`, title: <Flex align="center"><FolderOutlined /><Text style={{ marginLeft: 5 }}>{t('prefabs.actorsFolder')}</Text></Flex>, children: prefabs.prefabs.filter(prefab => prefab.type === 'actor' && (!searchTerms.prefabs || prefab.name.toLowerCase().includes(searchTerms.prefabs.toLowerCase()))).map(prefab => ({
        key: `prefab:${prefab.id}`,
        title: <Flex align="center" style={{ width: '100%', paddingRight: 4 }}><GatewayOutlined /><Text ellipsis style={{ marginLeft: 5, flex: 1 }}>{prefab.name}</Text><Tooltip title={t('prefabs.addToScene')}><PlusOutlined aria-label={`${t('prefabs.add')} ${prefab.name}`} onClick={event => { event.stopPropagation(); startPrefabPlacement(prefab); }} /></Tooltip>{attentionIndicator(countPrefabAttention(prefab), 'prefab-' + prefab.id)}</Flex>,
        isLeaf: true,
      })) },
      { key: `prefab-folder:${PREFAB_TRIGGERS_FOLDER_ID}`, title: <Flex align="center"><FolderOutlined /><Text style={{ marginLeft: 5 }}>{t('prefabs.triggersFolder')}</Text></Flex>, children: prefabs.prefabs.filter(prefab => prefab.type === 'trigger' && (!searchTerms.prefabs || prefab.name.toLowerCase().includes(searchTerms.prefabs.toLowerCase()))).map(prefab => ({
        key: `prefab:${prefab.id}`,
        title: <Flex align="center" style={{ width: '100%', paddingRight: 4 }}><GatewayOutlined /><Text ellipsis style={{ marginLeft: 5, flex: 1 }}>{prefab.name}</Text><Tooltip title={t('prefabs.addToScene')}><PlusOutlined aria-label={`${t('prefabs.add')} ${prefab.name}`} onClick={event => { event.stopPropagation(); startPrefabPlacement(prefab); }} /></Tooltip>{attentionIndicator(countPrefabAttention(prefab), 'prefab-' + prefab.id)}</Flex>,
        isLeaf: true,
      })) },
    ];
  const treeDataPrefabs = prefabNodes();

  const panelStyle: React.CSSProperties = {
    backgroundColor: token.colorBorder,
    borderRadius: 0,
    height: HEADER_HEIGHT
  };

  const getSelectedKeyFromGlobal = (prefix: string): Key[] => {
    if (!globalSelectedKey?.startsWith(`${prefix}-`)) return [];
    const key = globalSelectedKey.replace(`${prefix}-`, '');
    return [key];
  };

  const onSelectTree = (selectedKeys: Key[], info: any, source: /*'scenes' |*/ 'scripts' | 'variables' | 'prefabs') => {
    const newKey = selectedKeys[0]?.toString() || null;
    setGlobalSelectedKey(newKey ? `${source}-${newKey}` : null);
    if (source === 'variables' && newKey) {
      const variable = variables.variables.find(item => item.id === newKey);
      if (variable) {
        setSettingUtils(previous => ({ ...previous, selectedSceneIds: [], tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null }));
        setElementSelected({ ...variable, _resourceType: 'variables' });
      }
    }
    if (source === 'scripts' && newKey) {
      const script = scripts.scripts.find(item => item.id === newKey);
      if (script) {
        setSettingUtils(previous => ({ ...previous, selectedSceneIds: [], tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null }));
        setElementSelected({ ...script, _resourceType: 'script' });
      }
    }
    if (source === 'prefabs' && newKey) {
      const prefabId = newKey.startsWith('prefab:') ? newKey.slice('prefab:'.length) : newKey;
      const prefab = prefabs.prefabs.find(item => item.id === prefabId);
      if (prefab) selectPrefabForEdit(prefab);
    }
  };

  const panelResize = usePanelResizeHandlers();
  const handleResizeStart = (sizes:Array<number>) => {
    panelResize.start();
    resizingNavigationRef.current = true;
    // Ajuste o tamanho da barra de arrastar aqui
    console.log('.: Resize LeftPanel start :. ');
    console.log('.: Resize LeftPanel Tela 1: ', sizes[0]);
    console.log('.: Resize LeftPanel Tela 2: ', sizes[1]);
    console.log('.: Resize LeftPanel Tela 3: ', sizes[2]);
    console.log('.: ---------------------- :. ');
  };

  const getNextSectionState = (section: 'scenes' | 'prefabs' | 'scripts' | 'variables') => {
    const next = { scenes: isScenesOpen, prefabs: isPrefabsOpen, scripts: isScriptsOpen, variables: isVariablesOpen };
    next[section] = !next[section];
    if (!showScriptsAndVariables) return next;
    if (!next.scenes && !next.prefabs && !next.scripts && !next.variables) {
      if (section === 'scenes') next.prefabs = true;
      else if (section === 'prefabs') next.scripts = true;
      else if (section === 'scripts') next.variables = true;
      else next.scenes = true;
    }
    return next;
  };

  useEffect(() => {
    if (loadedNavigationProjectRef.current !== leftNavigationProjectId || !navigationDirtyRef.current) return;
    navigationDirtyRef.current = false;
    const leftNavigation = {
      sizes: panelSizes.map(Math.round),
      sections: { scenes: isScenesOpen, prefabs: isPrefabsOpen, scripts: isScriptsOpen, variables: isVariablesOpen },
      expandedKeys: expandedTrees,
    };
    cacheLeftNavigation(settingUtils.projectPathFile, leftNavigation);
    window.electronAPI.saveLastPositionSplitters({ projectId: leftNavigationProjectId, leftNavigation }).catch((error: unknown) => console.error('Failed to save navigation state:', error));
  }, [leftNavigationProjectId, panelSizes, isScenesOpen, isPrefabsOpen, isScriptsOpen, isVariablesOpen, expandedTrees]);

  const handleTreeExpand = (section: 'scenes' | 'prefabs' | 'scripts' | 'variables', keys: Key[]) => {
    navigationDirtyRef.current = true;
    const nextExpandedTrees = { ...expandedTrees, [section]: keys.filter((key): key is string | number => typeof key === 'string' || typeof key === 'number') };
    setExpandedTrees(nextExpandedTrees);
  };

  const handleResizeEnd = (sizes:Array<number>) => {
    panelResize.end();
    navigationDirtyRef.current = true;
    // Ajuste o tamanho da barra de arrastar aqui
    console.log('.: Resize LeftPanel end :. ');
    console.log('.: Resize LeftPanel Tela 1: ', sizes[0]);
    console.log('.: Resize LeftPanel Tela 2: ', sizes[1]);
    console.log('.: Resize LeftPanel Tela 3: ', sizes[2]);
    console.log('.: ---------------------- :. ');
    handleResize(sizes);
    resizingNavigationRef.current = false;
  };

  const handleResize = (sizes:Array<number>) => {
    if (resizingNavigationRef.current) navigationDirtyRef.current = true;
    const newSizes = [...sizes];

    // Verifica se o painel 3 atingiu o tamanho 
    if (newSizes[0] <= HEADER_HEIGHT) {
      // console.log(".: Fixar tela 1");
      newSizes[0] = HEADER_HEIGHT;
      setIsScenesOpen(false);
    } else {
      setIsScenesOpen(true);
    }

    if (newSizes[1] <= HEADER_HEIGHT) {
      newSizes[1] = HEADER_HEIGHT;
      setIsPrefabsOpen(false);
    } else {
      setIsPrefabsOpen(true);
    }

    if (newSizes[2] <= HEADER_HEIGHT) {
      // console.log(".: Fixar tela 2");
      newSizes[2] = HEADER_HEIGHT;
      setIsScriptsOpen(false);
    } else {
      setIsScriptsOpen(true);
    }

    if (newSizes[3] <= HEADER_HEIGHT) {
      // console.log(".: Fixar tela 3: ", sizes[2]);
      newSizes[3] = HEADER_HEIGHT;
      setIsVariablesOpen(false);
    } else {
      setIsVariablesOpen(true);
    }

    setPanelSizes(newSizes);
  };

  const handleSelectElement = (elementId: Key | undefined, shiftKey = false) => {
    const key = elementId?.toString();
    if (!key) return;
    if (key.startsWith('prefab-folder:')) {
      setElementSelected(null);
      setSettingUtils(previous => ({ ...previous, tileEditSceneId: null, tileEditLayerId: null, activeSceneObject: null, activeTriggerId: null, pendingPrefabPlacement: null }));
      setGlobalSelectedKey(null);
      return;
    }
    if (key.startsWith('prefab:')) {
      const prefab = prefabs.prefabs.find(item => item.id === key.slice('prefab:'.length));
      if (prefab) selectPrefabForEdit(prefab);
      return;
    }
    const objectMatch = /^(actor|trigger):([^:]+):(.+)$/.exec(key);
    if (objectMatch) {
      const [, type, sceneId, id] = objectMatch;
      const scene = scenes.find(item => item.id === sceneId);
      if (!scene) return;
      const currentSceneIds = settingUtils.selectedSceneIds ?? (elementSelected?.id ? [elementSelected.id] : []);
      const sceneAlreadySelected = elementSelected?.id === scene.id || currentSceneIds.includes(scene.id);
      setElementSelected({ ...scene, _recenter: sceneAlreadySelected ? undefined : true, _recenterTarget: { type, id } });
      setSettingUtils(previous => ({ ...previous, worldSceneSearch: sceneSearchAfterSelection(previous.worldSceneSearch, scene), selectedSceneIds: [sceneId], tileEditSceneId: sceneId, tileEditLayerId: 4, activeSceneObject: { sceneId, type: type as 'actor' | 'trigger', id }, activeTriggerId: type === 'trigger' ? id : null }));
      return;
    }
    const element = filteredScenes.filter(s => s.id === key).map(scene => scene).at(0);
    if (!element) return;

    const currentSceneIds = settingUtils.selectedSceneIds ?? (elementSelected?.id ? [elementSelected.id] : []);
    const shouldRecenter = !currentSceneIds.includes(element.id);
    const sceneIds = shiftKey
      ? currentSceneIds.includes(element.id)
        ? currentSceneIds.filter(id => id !== element.id)
        : [...currentSceneIds, element.id]
      : [element.id];
    const activeId = shiftKey && currentSceneIds.includes(element.id) ? sceneIds.at(-1) : element.id;
    const activeScene = activeId ? scenes.find(scene => scene.id === activeId) : null;

    setGlobalSelectedKey(null);
    setSettingUtils(previous => ({
      ...previous,
      tileEditSceneId: previous.activeButton === 'add' && (previous.activeSubButton === 'Actor' || previous.activeSubButton === 'Trigger') ? element.id : previous.tileEditSceneId,
      activeSceneObject: null,
      activeTriggerId: null,
      selectedSceneIds: sceneIds,
      worldSceneSearch: sceneSearchAfterSelection(previous.worldSceneSearch, activeScene),
    }));
    setElementSelected(activeScene ? { ...activeScene, _recenter: shouldRecenter || undefined } : null);
  }

  return (
    <div className="project-hierarchy" ref={navigationRef} data-testid="left-panel" style={{ height: '100%', minHeight: 0, visibility: navigationReady ? 'visible' : 'hidden' }}>
    <Splitter layout="vertical"
      onResize={handleResize}
      onResizeStart={handleResizeStart}
      onResizeEnd={handleResizeEnd}
    >
      {/* PAINEL 1 */}
      <Splitter.Panel size={panelSizes[0]} min={HEADER_HEIGHT} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Collapse
          className="left-navigation-section"
          defaultActiveKey={['1']}
          activeKey={isScenesOpen ? 1 : 0}
          onChange={() => toggleSection('scenes')}
          expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} style={{ fontSize: token.fontSize, }} />}
          style={{ height: 40, border: 'none' }}
          items={[
            {
              key: '1',
              label: 'SCENES',
              extra: <Flex gap={4}>{functionAdd()}{functionSearch('scenes')}</Flex>,
              style: panelStyle,
              children: (
                <Content style={{ height: '100vh', flex: 1 }}>
                  {searchOpen.scenes && (
                    <Input
                      ref={searchInputRef}
                      placeholder="Search..."
                      value={searchTerms.scenes}
                      onChange={(e) => setSearchTerms(previous => ({ ...previous, scenes: e.target.value }))}
                      style={{
                        marginBottom: 5,
                        height: 25,
                        border: 'none',
                        backgroundColor: searchTerms.scenes === '' ? token.colorBgBase : token.colorBorder,
                      }}
                    />
                  )}
                  <Tree
                    key={`scenes-${leftNavigationProjectId}`}
                    className="custom-tree event-attention-tree"
                    showIcon
                    showLine={{ showLeafIcon: false }}
                    switcherIcon={({ expanded }) => <CaretRightOutlined className="left-panel-switcher" rotate={expanded ? 90 : 0} />}
                    multiple
                    height={Math.max(0, treeHeightScenes - (searchOpen.scenes ? 30 : 0))}
                    treeData={treeDataScenes}
                    defaultExpandAll
                    {...(expandedTrees.scenes === undefined ? {} : { expandedKeys: expandedTrees.scenes })}
                    onExpand={keys => handleTreeExpand('scenes', keys)}
                    blockNode
                    selectedKeys={settingUtils.activeSceneObject
                      ? [settingUtils.activeSceneObject.sceneId, `${settingUtils.activeSceneObject.type}:${settingUtils.activeSceneObject.sceneId}:${settingUtils.activeSceneObject.id}`]
                      : settingUtils.selectedSceneIds ?? (elementSelected ? [elementSelected.id] : [])}
                    onSelect={(_, info) => handleSelectElement(info.node.key, info.nativeEvent.shiftKey)}
                    style={{ background: token.colorBgBase }}
                  />
                </Content>
              ),
            },
          ]}
        />
       
      </Splitter.Panel>
      {showScriptsAndVariables && (
        <>
          <Splitter.Panel size={panelSizes[1]} min={HEADER_HEIGHT} style={{ overflow: 'hidden' }}>
            <Collapse className="left-navigation-section" defaultActiveKey={['1']} activeKey={isPrefabsOpen ? 1 : 0}
              onChange={() => toggleSection('prefabs')} expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} style={{ fontSize: token.fontSize }} />}
              style={{ height: 40, border: 'none' }} items={[{ key: '1', label: t('prefabs.section').toUpperCase(), extra: <Flex gap={4} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
                <Dropdown menu={prefabAddMenu} trigger={['click']}><PlusOutlined aria-label={t('prefabs.add')} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()} /></Dropdown>{functionSearch('prefabs')}
              </Flex>, style: panelStyle, children: <Content style={{ height: '100vh', flex: 1 }}>
                {searchOpen.prefabs && <Input ref={searchInputRef} placeholder="Search..." value={searchTerms.prefabs} onChange={event => setSearchTerms(previous => ({ ...previous, prefabs: event.target.value }))} style={{ marginBottom: 5, height: 25, border: 'none', backgroundColor: searchTerms.prefabs ? token.colorBorder : token.colorBgBase }} />}
                <Tree key={`prefabs-${leftNavigationProjectId}`} className="custom-tree event-attention-tree" showIcon showLine={{ showLeafIcon: false }} switcherIcon={({ expanded }) => <CaretRightOutlined className="left-panel-switcher" rotate={expanded ? 90 : 0} />}
                  height={Math.max(0, treeHeightPrefabs - (searchOpen.prefabs ? 30 : 0))} treeData={treeDataPrefabs} defaultExpandAll
                  {...(expandedTrees.prefabs === undefined ? {} : { expandedKeys: expandedTrees.prefabs })} onExpand={keys => handleTreeExpand('prefabs', keys)} blockNode
                  selectedKeys={getSelectedKeyFromGlobal('prefabs')} onSelect={(_, info) => handleSelectElement(info.node.key)} style={{ background: token.colorBgBase }} />
              </Content> }]} />
          </Splitter.Panel>
          {/* PAINEL 2 */}
          <Splitter.Panel size={panelSizes[2]} min={HEADER_HEIGHT} style={{ overflow: 'hidden' }}>
            <Collapse
              className="left-navigation-section"
              defaultActiveKey={['1']}
              activeKey={isScriptsOpen ? 1 : 0}
              onChange={() => toggleSection('scripts')}
              expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} style={{ fontSize: token.fontSize, }} />}
              style={{ height: 40, border: 'none' }}
              items={[
                {
                  key: '1',
                  label: 'SCRIPTS',
                  extra: <Flex gap={4}><Tooltip title="Add script"><PlusOutlined onClick={event => { event.stopPropagation(); handleAddScript(); }} /></Tooltip>{functionSearch('scripts')}</Flex>,
                  style: panelStyle,
                  children: (
                    <Content style={{ height: '100vh', flex: 1 }}>
                    {searchOpen.scripts && <Input ref={searchInputRef} placeholder="Search..." value={searchTerms.scripts} onChange={event => setSearchTerms(previous => ({ ...previous, scripts: event.target.value }))} style={{ marginBottom: 5, height: 25, border: 'none', backgroundColor: searchTerms.scripts === '' ? token.colorBgBase : token.colorBorder }} />}
                    <Tree
                      key={`scripts-${leftNavigationProjectId}`}
                      className="custom-tree event-attention-tree"
                      showIcon
                      showLine={{ showLeafIcon: false }}
                      switcherIcon={({ expanded }) => <CaretRightOutlined className="left-panel-switcher" rotate={expanded ? 90 : 0} />}
                      // icon={<FileFilled />}
                      height={Math.max(0, treeHeightScripts - (searchOpen.scripts ? 30 : 0))}
                      treeData={treeDataScripts}
                      defaultExpandAll
                      {...(expandedTrees.scripts === undefined ? {} : { expandedKeys: expandedTrees.scripts })}
                      onExpand={keys => handleTreeExpand('scripts', keys)}
                      blockNode
                      selectedKeys={getSelectedKeyFromGlobal('scripts')}
                      onSelect={(selectedKeys, info) =>
                        onSelectTree(selectedKeys, info, 'scripts')
                      }
                      style={{ background: token.colorBgBase }}
                    /></Content>
                  )
                },
              ]}
            />
              
          </Splitter.Panel>
          {/* PAINEL 3 */}
          <Splitter.Panel size={panelSizes[3]} min={HEADER_HEIGHT} style={{ overflow: 'hidden', }}>
            <Collapse
              className="left-navigation-section"
              defaultActiveKey={['1']}
              activeKey={isVariablesOpen ? 1 : 0}
              onChange={() => toggleSection('variables')}
              expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} style={{ fontSize: token.fontSize, }} />}
              style={{ height: 40, border: 'none' }}
              items={[
                {
                  key: '1',
                  label: 'VARIABLES',
                  extra: (
                    <Flex gap={4}>
                      <Tooltip title="Add variable">
                        <PlusOutlined style={{ marginRight: 8 }} onClick={(event) => { event.stopPropagation(); handleAddVariable(); }} />
                      </Tooltip>
                      {functionSearch('variables')}
                    </Flex>
                  ),
                  style: panelStyle,
                  children: (
                    <Content style={{ height: '100vh', flex: 1 }}>
                    {searchOpen.variables && <Input ref={searchInputRef} placeholder="Search..." value={searchTerms.variables} onChange={event => setSearchTerms(previous => ({ ...previous, variables: event.target.value }))} style={{ marginBottom: 5, height: 25, border: 'none', backgroundColor: searchTerms.variables === '' ? token.colorBgBase : token.colorBorder }} />}
                    <Tree
                      key={`variables-${leftNavigationProjectId}`}
                      className="custom-tree"
                      showIcon
                      showLine={{ showLeafIcon: false }}
                      switcherIcon={({ expanded }) => <CaretRightOutlined className="left-panel-switcher" rotate={expanded ? 90 : 0} />}
                      // icon={<div>$</div>}
                      height={Math.max(0, treeHeightVariables - (searchOpen.variables ? 30 : 0))}
                      treeData={treeDataVariables}
                      defaultExpandAll
                      {...(expandedTrees.variables === undefined ? {} : { expandedKeys: expandedTrees.variables })}
                      onExpand={keys => handleTreeExpand('variables', keys)}
                      blockNode
                      selectedKeys={getSelectedKeyFromGlobal('variables')}
                      onSelect={(selectedKeys, info) =>
                        onSelectTree(selectedKeys, info, 'variables')
                      }
                      style={{ backgroundColor: token.colorBgBase }}
                    /></Content>
                  )
                },
              ]}
            />
          </Splitter.Panel>
        </>
      )}
    </Splitter>
    </div>
  );
};

function MusicEditorLeftPanel() {
  const { token } = AntdToken();
  const { t } = useI18n();
  const { settingUtils } = useAppContexts();
  const { assets, selectedAssetId, editorInfo, dirtyAssetIds, selectEditorItem, selectAsset, deselectAsset } = useMusicEditorWorkspace();
  const projectSelected = assets.some(asset => asset.id === selectedAssetId && asset.musicRole === 'project');
  type MusicPanel = 'files' | 'channels' | 'instruments';
  const panels = ['files', 'channels', 'instruments'] as const;
  const [searches, setSearches] = useState<Record<MusicPanel, string>>({ files: '', channels: '', instruments: '' });
  const [searchOpen, setSearchOpen] = useState<Record<MusicPanel, boolean>>({ files: false, channels: false, instruments: false });
  const [sidebarSizes, setSidebarSizes] = useState<Array<number | string>>(['50%', '25%', '25%']);
  const [sidebarSections, setSidebarSections] = useState<Record<MusicPanel, boolean>>({ files: true, channels: true, instruments: true });
  const sidebarRef = useRef<HTMLDivElement>(null);
  const expandedWeightsRef = useRef([0.50, 0.25, 0.25]);
  const sampleInput = useRef<HTMLInputElement>(null);
  const sampleImportAsVariant = useRef(false);
  const [projectSfxFiles, setProjectSfxFiles] = useState<string[]>([]);
  const projectId = encodeURIComponent((settingUtils?.projectPathFile || 'unsaved-project').replace(/\\/g, '/').toLowerCase());
  const visibleAssets = assets.filter(asset => asset.name.toLowerCase().includes(searches.files.trim().toLowerCase()));
  const toggleSearch = (panel: MusicPanel) => setSearchOpen(previous => {
    const next = !previous[panel];
    if (!next) setSearches(value => ({ ...value, [panel]: '' }));
    return { ...previous, [panel]: next };
  });
  const setSearch = (panel: MusicPanel, value: string) => setSearches(previous => ({ ...previous, [panel]: value }));
  const loadProjectSfxFiles = async () => {
    const response = await window.electronAPI.listProjectSfx();
    setProjectSfxFiles(response?.status === 'success' ? response.files ?? [] : []);
  };
  const importProjectSfx = async (filename: string) => {
    const response = await window.electronAPI.loadProjectSfx(filename);
    if (response?.status !== 'success') {
      message.error(response?.message ?? t('music.instruments.sfxLoadFailed'));
      return;
    }
    const generated = generateSfx(response.document.parameters as SfxParameters);
    const wav = encodePcm16Wav(generated.pcm, generated.parameters.sampleRate);
    const file = new File([wav], `${response.document.name}.wav`, { type: 'audio/wav' });
    window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'import-sample', file, replaceSelected: true } }));
  };
  const instrumentLimit = editorInfo?.capabilities.maxInstruments ?? (editorInfo?.canonicalProject ? MAX_MUSIC_COMPOSITION_INSTRUMENTS : 16);
  const addInstrumentEnabled = Boolean(editorInfo && (editorInfo.canonicalProject || canCreateScratchInstrument(editorInfo.format, editorInfo.scratch))
    && editorInfo.instruments < instrumentLimit);
  const sampleImportEnabled = Boolean(editorInfo && canImportWavSample(editorInfo.format, editorInfo.scratch));
  const instrumentHeaderButtonStyle: React.CSSProperties = { padding: 4, borderRadius: token.borderRadius, color: '#fff', background: 'transparent' };
  const instrumentHeaderActions = editorInfo ? <>
    <Tooltip title={!addInstrumentEnabled ? editorInfo.instruments >= instrumentLimit ? t('music.capabilities.maxInstruments') : t('music.capabilities.unsupportedFormat', { format: editorInfo.format }) : t('music.instruments.add')}>
      <span><Dropdown trigger={['click']} menu={{ items: TRACKER_INSTRUMENT_PRESETS.map(preset => ({ key: preset.id, label: t(`music.instruments.preset.${preset.id}`) })), onClick: ({ key }) => {
        if (TRACKER_INSTRUMENT_PRESETS.some(preset => preset.id === key)) window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'add-instrument', preset: key } }));
      } }}><Button type="text" size="small" style={instrumentHeaderButtonStyle} aria-label={t('music.instruments.add')} icon={<PlusOutlined />} disabled={!addInstrumentEnabled} /></Dropdown></span>
    </Tooltip>
    <Tooltip title={!editorInfo.canonicalProject ? t('music.capabilities.canonicalOnly') : editorInfo.instruments >= instrumentLimit ? t('music.capabilities.maxInstruments') : t('music.instruments.duplicate')}>
      <span><Button type="text" size="small" style={instrumentHeaderButtonStyle} icon={<CopyOutlined />} aria-label={t('music.instruments.duplicate')} disabled={!editorInfo.canonicalProject || editorInfo.instruments >= instrumentLimit} onClick={() => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'duplicate-instrument' } }))} /></span>
    </Tooltip>
    <Tooltip title={t('music.instruments.sampleActions')}>
      <span><Dropdown trigger={['click']} onOpenChange={open => { if (open) void loadProjectSfxFiles(); }} menu={{ items: [
        { key: 'replace-sample', label: t('music.instruments.replaceSampleAudio'), disabled: !sampleImportEnabled },
        { key: 'add-sample-zone', label: t('music.instruments.addAudio'), disabled: !sampleImportEnabled },
        { key: 'record-microphone', label: t('music.instruments.recordMicrophone'), disabled: !sampleImportEnabled },
        { type: 'divider' },
        { key: 'project-sfx', label: t('music.instruments.useSfxProject'), children: projectSfxFiles.length
          ? projectSfxFiles.map(filename => ({ key: `sfx:${filename}`, label: filename.replace(/\\.gbasfx$/i, '') }))
          : [{ key: 'no-sfx-projects', label: t('music.instruments.noSfxProjects'), disabled: true }] },
      ], onClick: ({ key }) => {
        if (key === 'replace-sample' || key === 'add-sample-zone') {
          sampleImportAsVariant.current = key === 'add-sample-zone';
          sampleInput.current?.click();
        }
        else if (key === 'record-microphone') window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'record-microphone' } }));
        else if (key.startsWith('sfx:')) void importProjectSfx(key.slice(4));
      } }}><Button type="text" size="small" style={instrumentHeaderButtonStyle} aria-label={t('music.instruments.sampleActions')} icon={<SwapOutlined />} disabled={!sampleImportEnabled && projectSfxFiles.length === 0} /></Dropdown></span>
    </Tooltip>
    <input ref={sampleInput} type="file" accept="audio/*,.wav" aria-label={t('music.instruments.replaceSampleAudio')} hidden onChange={event => { const file = event.target.files?.[0]; if (file) window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'import-sample', file, asVariant: sampleImportAsVariant.current, replaceSelected: !sampleImportAsVariant.current } })); event.target.value = ''; }} />
  </> : null;
  useEffect(() => {
    let cancelled = false;
    void window.electronAPI.loadLastPositionSplitters(projectId).then((saved: any) => {
      if (cancelled) return;
      if (Array.isArray(saved?.musicNavigation?.sizes) && saved.musicNavigation.sizes.length === 3) setSidebarSizes(saved.musicNavigation.sizes);
      else if (Array.isArray(saved?.musicNavigation?.sizes) && saved.musicNavigation.sizes.length === 4) {
        const [files, , channels, instruments] = saved.musicNavigation.sizes;
        setSidebarSizes([files, channels, instruments]);
      }
      if (saved?.musicNavigation?.sections) setSidebarSections({
        files: saved.musicNavigation.sections.files ?? true,
        channels: saved.musicNavigation.sections.channels ?? true,
        instruments: saved.musicNavigation.sections.instruments ?? true,
      });
    }).catch((error: unknown) => console.error('Failed to load music navigation splitter:', error));
    return () => { cancelled = true; };
  }, [projectId]);
  const updateExpandedWeights = (sizes: number[], sections: Record<MusicPanel, boolean>) => {
    if (sizes.length !== panels.length) return;
    const openTotal = sizes.reduce((sum, size, index) => sum + (sections[panels[index]] ? Number(size) : 0), 0);
    if (openTotal <= 0) return;
    expandedWeightsRef.current = sizes.map((size, index) => sections[panels[index]]
      ? Number(size) / openTotal
      : expandedWeightsRef.current[index]);
  };
  const persistSidebar = (sizes: number[], sections = sidebarSections) => {
    updateExpandedWeights(sizes, sections);
    setSidebarSizes(sizes);
    window.electronAPI.saveLastPositionSplitters({ projectId, musicNavigation: { sizes, sections } });
  };
  const toggleSection = (panel: MusicPanel) => {
    if (!projectSelected && panel === 'files') return;
    const next = { ...sidebarSections, [panel]: !sidebarSections[panel] };
    if (!Object.values(next).some(Boolean)) next[panels[(panels.indexOf(panel) + 1) % panels.length]] = true;
    const height = sidebarRef.current?.clientHeight ?? 400;
    const collapsedCount = Object.values(next).filter(open => !open).length;
    const available = Math.max(0, height - collapsedCount * 40);
    const weights = expandedWeightsRef.current;
    const totalWeight = panels.reduce((sum, name, index) => sum + (next[name] ? weights[index] : 0), 0) || 1;
    const sizes = panels.map((name, index) => next[name] ? available * weights[index] / totalWeight : 40);
    setSidebarSections(next);
    persistSidebar(sizes, next);
  };
  const handleMusicResize = (sizes: number[], save = false) => {
    if (sizes.length !== panels.length) return;
    const next = Object.fromEntries(panels.map((panel, index) => [panel, sizes[index] > 40])) as Record<MusicPanel, boolean>;
    const normalized = sizes.map(size => Math.max(40, size));
    if (!Object.values(next).some(Boolean)) {
      const lastOpen = panels.findIndex(panel => sidebarSections[panel]);
      const nextIndex = (Math.max(0, lastOpen) + 1) % panels.length;
      next[panels[nextIndex]] = true;
      normalized[nextIndex] = Math.max(40, sizes.reduce((sum, size) => sum + size, 0) - 120);
    }
    setSidebarSections(next);
    setSidebarSizes(normalized);
    if (save) persistSidebar(normalized, next);
  };
  const sectionHeader = (panel: MusicPanel, title: string, actions?: React.ReactNode) => <Flex align="center" justify="space-between" style={{ height: 40, flex: '0 0 40px', padding: panel === 'files' ? '0 12px' : '0 8px', background: token.colorBorder, color: '#fff' }}>
    <Flex align="center" role="button" tabIndex={0} aria-label={title} aria-expanded={sidebarSections[panel]} onClick={() => toggleSection(panel)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleSection(panel); } }} style={{ minWidth: 0, cursor: !editorInfo && panel === 'files' ? 'default' : 'pointer' }}><CaretRightOutlined rotate={sidebarSections[panel] ? 90 : 0} style={{ marginRight: 8, color: '#fff' }} /><Typography.Text strong style={{ color: '#fff', whiteSpace: 'nowrap' }}>{title}</Typography.Text></Flex>
    <Flex gap={4} align="center" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      {actions}
      <Tooltip title={t('common.search')} color={token.colorBorder}><Button type="text" size="small" aria-label={`${t('common.search')} ${title.toLowerCase()}`} aria-pressed={searchOpen[panel]} icon={<SearchOutlined />} style={{ padding: 4, borderRadius: token.borderRadius, color: '#fff', background: searchOpen[panel] ? token.colorPrimary : 'transparent' }} onClick={() => toggleSearch(panel)} /></Tooltip>
    </Flex>
  </Flex>;
  const searchInput = (panel: MusicPanel, label: string) => sidebarSections[panel] && searchOpen[panel] ? <Input autoFocus allowClear aria-label={`${t('common.search')} ${label}`} placeholder={`${t('common.search')} ${label}`} value={searches[panel]} onChange={event => setSearch(panel, event.target.value)} style={{ margin: '8px 16px', width: 'calc(100% - 32px)', background: token.colorBgBase, border: `1px solid ${token.colorBorder}` }} /> : null;
  const itemButton = (label: string, active: boolean, onClick: () => void, key: number) => <button key={key} type="button" onClick={onClick} style={{ width: '100%', border: `1px solid ${active ? token.colorPrimaryBorder : 'transparent'}`, borderRadius: token.borderRadius, background: active ? token.colorPrimaryBg : 'transparent', color: token.colorText, textAlign: 'left', padding: '5px 8px', cursor: 'pointer' }}>{label}</button>;
  const sectionItems = (panel: 'channels' | 'instruments') => {
    const kind = panel === 'channels' ? 'channel' : 'instrument';
    const count = editorInfo?.[panel] ?? 0;
    const query = searches[panel].trim().toLowerCase();
    const indices = Array.from({ length: count }, (_, index) => index).filter(index => {
      const id = String(index + 1);
      const label = panel === 'channels' ? (editorInfo?.channelSettings?.[String(index)]?.name || t('music.channels.defaultName', { number: index + 1 })) : `${editorInfo?.instrumentNames?.[id] ?? ''} Instrument ${String(index + 1).padStart(2, '0')}`;
      const channelType = editorInfo?.channelInstrumentTypes?.[String(editorInfo.selectedChannel)] ?? 'Duty';
      return `${label} ${channelType}`.toLowerCase().includes(query);
    });
    return <>
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 12px 8px' }}>
        {indices.length ? (panel === 'instruments' && (editorInfo?.canonicalProject || editorInfo?.format === 'MOD') ? <div>
            {editorInfo.instrumentCategories
              ? <Collapse ghost size="small" defaultActiveKey={['Duty', 'Wave', 'Noise', 'Other']} items={(['Duty', 'Wave', 'Noise', 'Other'] as const).map(category => ({
                key: category,
                label: <Flex align="center" justify="space-between" style={{ width: '100%', paddingRight: 8 }}>
                  <Typography.Text>{category === 'Other' ? t('music.instruments.other') : category}</Typography.Text>
                </Flex>,
                children: indices.filter(index => category === 'Other' ? !editorInfo.instrumentCategories?.[String(index + 1)] : editorInfo.instrumentCategories?.[String(index + 1)] === category).map(renderInstrumentButton),
              })).filter(item => item.children.length > 0)} />
              : <>
            {editorInfo.format === 'MOD' && <Typography.Text type="secondary" style={{ display: 'block', fontSize: 10, padding: '6px 8px 2px' }}>{editorInfo.channelInstrumentTypes?.[String(editorInfo.selectedChannel)] ?? 'Duty'}</Typography.Text>}
            {indices.map(renderInstrumentButton)}
              </>}
          </div> : indices.map(index => {
          const label = panel === 'channels' ? (editorInfo?.channelSettings?.[String(index)]?.name || t('music.channels.defaultName', { number: index + 1 })) : `Instrument ${String(index + 1).padStart(2, '0')}`;
          const active = panel === 'channels' ? editorInfo?.selectedChannel === index : editorInfo?.selectedInstrument === index + 1;
          if (panel === 'channels') {
            const muted = editorInfo?.channelMuteStates?.[index] ?? false;
            const hidden = editorInfo?.channelSettings?.[String(index)]?.hidden ?? false;
            return <Flex key={index} align="center" gap={2} style={{ border: `1px solid ${active ? token.colorPrimaryBorder : 'transparent'}`, borderRadius: token.borderRadius, background: active ? token.colorPrimaryBg : 'transparent', paddingRight: 3 }}>
              <button type="button" aria-pressed={active} onClick={() => selectEditorItem(kind, index)} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', color: token.colorText, textAlign: 'left', padding: '5px 8px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</button>
              <Tooltip title={t(muted ? 'music.channels.unmute' : 'music.channels.mute')}><Button size="small" type="text" aria-label={`${t(muted ? 'music.channels.unmute' : 'music.channels.mute')}: ${label}`} aria-pressed={muted} icon={muted ? <AudioMutedOutlined /> : <SoundOutlined />} style={{ color: muted ? token.colorError : token.colorTextSecondary }} onClick={() => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-channel', { detail: { kind: 'toggle-mute', channel: index } }))} /></Tooltip>
              <Tooltip title={t(hidden ? 'music.channels.showNotes' : 'music.channels.hideNotes')}><Button size="small" type="text" aria-label={`${t(hidden ? 'music.channels.showNotes' : 'music.channels.hideNotes')}: ${label}`} aria-pressed={hidden} icon={hidden ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={() => window.dispatchEvent(new CustomEvent('gba-studio:music-editor-set-channel-settings', { detail: { channel: index, hidden: !hidden } }))} /></Tooltip>
            </Flex>;
          }
          return itemButton(label, active, () => selectEditorItem(kind, index), index);
        })) : <Typography.Text type="secondary">{panel === 'instruments' && count === 0 ? t('music.instruments.none') : t('common.noItems')}</Typography.Text>}
      </div>
    </>;
  };
  const renderInstrumentButton = (index: number) => {
    const id = String(index + 1);
    const displayNumber = trackerInstrumentHierarchyNumber(index + 1, editorInfo?.instrumentCategories ?? {});
    const number = String(displayNumber).padStart(2, '0');
    const name = editorInfo?.instrumentNames?.[id]?.trim();
    const label = name ? `${number}: ${name}` : `Instrument ${number}`;
    const active = editorInfo?.selectedInstrument === index + 1;
    const color = trackerInstrumentHierarchyColor(index + 1, editorInfo?.instrumentCategories ?? {}, editorInfo?.channelInstrumentTypes?.[String(editorInfo?.selectedChannel)], editorInfo?.instrumentConfigs ?? {}, editorInfo?.instrumentPresetColors ?? {});
    return <button key={index} type="button" onClick={() => selectEditorItem('instrument', index)} style={{ width: '100%', border: `1px solid ${active ? token.colorPrimaryBorder : 'transparent'}`, borderRadius: token.borderRadius, background: active ? token.colorPrimaryBg : 'transparent', color: token.colorText, textAlign: 'left', padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}><i aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', background: color, flex: 'none' }} />{label}</button>;
  };
  const musicHeaderActions = <Flex gap={4} align="center" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
        <Tooltip title={t('music.create.title')}><Dropdown trigger={['click']} menu={{ items: [
          { type: 'group', label: t('music.create.musicTypes'), children: [
            { key: 'mod', label: t('music.create.mod'), title: t('music.create.moduleHelp') },
            { key: 'xm', label: t('music.create.xm'), title: t('music.create.xmHelp') },
            { key: 's3m', label: t('music.create.s3m'), title: t('music.create.moduleHelp') },
            { key: 'it', label: t('music.create.it'), title: t('music.create.moduleHelp') },
          ] },
          { type: 'divider' },
          { type: 'group', label: t('music.create.soundTypes'), children: [
            { key: 'wav', label: t('music.create.wav'), disabled: true, title: t('music.create.wavHelp') },
          ] },
        ], onClick: ({ key }) => { if (['mod', 'xm', 's3m', 'it'].includes(key)) window.dispatchEvent(new CustomEvent('gba-studio:music-editor-action', { detail: { kind: 'create-beat', format: key.toUpperCase() } })); } }}><Button type="text" size="small" aria-label={t('music.create.title')} icon={<PlusOutlined />} /></Dropdown></Tooltip>
      </Flex>;
  return <Flex ref={sidebarRef} vertical style={{ width: '100%', height: '100%', borderRight: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgBase, overflow: 'hidden' }}>
    <Splitter layout="vertical" style={{ height: '100%', minHeight: 0, background: token.colorBgBase }} onResize={sizes => handleMusicResize(sizes)} onResizeEnd={sizes => handleMusicResize(sizes, true)}>
      <Splitter.Panel size={!projectSelected ? '100%' : sidebarSections.files ? sidebarSizes[0] : 40} min={40} style={{ overflow: 'hidden' }}>
        <Flex vertical style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
          {sectionHeader('files', t('editor.music').toUpperCase(), musicHeaderActions)}
          {searchInput('files', t('editor.music').toLowerCase())}
          {sidebarSections.files && <div onClick={event => {
            const target = event.target as HTMLElement;
            if (target.closest('.ant-list-item, input, button, [role="button"], .ant-input-affix-wrapper')) return;
            deselectAsset();
          }} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '4px 12px 8px' }}>
            {visibleAssets.length ? <List size="small" split={false} dataSource={visibleAssets} renderItem={(asset, index) => {
              const groupChanged = asset.musicRole !== visibleAssets[index - 1]?.musicRole;
              return <React.Fragment key={asset.id}>
                {groupChanged && asset.musicRole && <Divider orientation="left" plain style={{ margin: '8px 0' }}>{t(`music.library.${asset.musicRole}`)}</Divider>}
                <List.Item onClick={() => selectAsset(asset.id)} style={{ cursor: 'pointer', borderRadius: token.borderRadius, padding: '4px 8px', background: selectedAssetId === asset.id ? token.colorPrimaryBg : undefined }}><Flex align="center" gap={8} style={{ minWidth: 0, width: '100%' }}><CustomerServiceOutlined aria-hidden style={{ color: token.colorTextSecondary, flex: 'none' }} /><Typography.Text ellipsis style={{ color: token.colorText }}>{asset.name.split(/[\\/]/).pop()}{dirtyAssetIds.includes(asset.id) ? ' *' : ''}</Typography.Text></Flex></List.Item>
              </React.Fragment>;
            }} /> : <Typography.Text type="secondary">{t('common.noItems')}</Typography.Text>}
          </div>}
        </Flex>
      </Splitter.Panel>
      {projectSelected && (['channels', 'instruments'] as const).map((panel, index) => <Splitter.Panel key={panel} size={sidebarSections[panel] ? sidebarSizes[index + 1] : 40} min={40} style={{ overflow: 'hidden' }}>
        <Flex vertical style={{ height: '100%', minHeight: 0, overflow: 'hidden' }}>
          {sectionHeader(panel, panel.toUpperCase(), panel === 'instruments' ? instrumentHeaderActions : undefined)}
          {searchInput(panel, panel)}
          {sidebarSections[panel] && sectionItems(panel)}
        </Flex>
      </Splitter.Panel>)}
    </Splitter>
  </Flex>;
}

const LeftPanel: React.FC<{ showScriptsAndVariables?: boolean; musicEditorMode?: boolean }> = ({ musicEditorMode = false, ...props }) =>
  musicEditorMode ? <MusicEditorLeftPanel /> : <SceneLeftPanel {...props} />;

export default LeftPanel;
