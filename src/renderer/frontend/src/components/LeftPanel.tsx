import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { BuildOutlined, CaretRightFilled, CaretRightOutlined, FileFilled, GatewayOutlined, PlusOutlined, SearchOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Collapse, Flex, Input, Layout, Space, Splitter, Tooltip, Tree, TreeDataNode, Typography } from 'antd';
import React, { Key, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AntdToken } from '../components/common/AntDToken';
import { IVariableDefinition } from '@/providers/contexts/interfaces/IVariablesElement';
import { IScriptDefinition } from '@/providers/contexts/interfaces/IScriptElement';

const { Content } = Layout;
const { Panel } = Collapse;
const { Text } = Typography;

const getVariableDefaultName = (symbol: string): string => {
  const readableName = symbol.replace(/^variable_?/i, '').replace(/_/g, ' ').trim();
  if (!readableName) return symbol;

  return `Variable ${readableName}`;
};

const LeftPanel: React.FC<{ showScriptsAndVariables?: boolean }> = ({ showScriptsAndVariables = true }) => {
  // const { scenes } = useSceneContext();
  // const { settingUtils, setSettingUtils } = useSettingsUtilsContext();
  // const { elementSelected, setElementSelected } = useElementContext();

  const { scenes, variables, setVariables, scripts, setScripts, settingUtils, setSettingUtils, elementSelected, setElementSelected } = useAppContexts();

  const [isScenesOpen, setIsScenesOpen] = useState(true);
  const [isScriptsOpen, setIsScriptsOpen] = useState(true);
  const [isVariablesOpen, setIsVariablesOpen] = useState(true);
  const [expandedTrees, setExpandedTrees] = useState<Record<'scenes' | 'scripts' | 'variables', Key[] | undefined>>({ scenes: undefined, scripts: undefined, variables: undefined });
  const loadedNavigationProjectRef = useRef<string | null>(null);

  const [searchOpen, setSearchOpen] = useState({ scenes: false, scripts: false, variables: false });
  const searchInputRef = useRef<any>(null);
  const { token } = AntdToken();

  const HEADER_HEIGHT = 40; // Altura fixa do header
  const [panelSizes, setPanelSizes] = useState([33, 33, 33]); // Tamanhos iniciais dos painéis em porcentagem

  const [treeHeightScenes, setTreeHeightScenes] = useState(window.innerHeight);
  const [treeHeightScripts, setTreeHeightScripts] = useState(window.innerHeight);
  const [treeHeightVariables, setTreeHeightVariables] = useState(window.innerHeight);
  const navigationRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const panels = navigationRef.current?.querySelectorAll<HTMLElement>('.ant-splitter-panel');
    if (!panels) return;

    const updateTreeHeights = () => {
      setTreeHeightScenes(Math.max(0, (panels[0]?.clientHeight ?? 0) - 60));
      setTreeHeightScripts(Math.max(0, (panels[1]?.clientHeight ?? 0) - 60));
      setTreeHeightVariables(Math.max(0, (panels[2]?.clientHeight ?? 0) - 60));
    };
    const observer = new ResizeObserver(updateTreeHeights);
    panels.forEach(panel => observer.observe(panel));
    updateTreeHeights();
    return () => observer.disconnect();
  }, [showScriptsAndVariables]);
  const leftNavigationProjectId = encodeURIComponent((settingUtils.projectPathFile || 'unsaved-project').replace(/\\/g, '/').toLowerCase());

  useEffect(() => {
    let cancelled = false;
    loadedNavigationProjectRef.current = null;
    setExpandedTrees({ scenes: undefined, scripts: undefined, variables: undefined });
    window.electronAPI.loadLastPositionSplitters(leftNavigationProjectId).then((saved: any) => {
      if (cancelled) return;
      loadedNavigationProjectRef.current = leftNavigationProjectId;
      const expandedKeys = saved?.leftNavigation?.expandedKeys;
      const restoreKeys = (keys: unknown): Key[] | undefined => Array.isArray(keys)
        ? keys.filter((key): key is Key => typeof key === 'string' || typeof key === 'number')
        : undefined;
      setExpandedTrees({ scenes: restoreKeys(expandedKeys?.scenes), scripts: restoreKeys(expandedKeys?.scripts), variables: restoreKeys(expandedKeys?.variables) });
      if (!saved?.leftNavigation) {
        setIsScenesOpen(true);
        setIsScriptsOpen(true);
        setIsVariablesOpen(true);
        const defaultSize = (navigationRef.current?.clientHeight ?? window.innerHeight) / 3;
        setPanelSizes([defaultSize, defaultSize, defaultSize]);
        return;
      }
      const navigation = saved.leftNavigation;
      const sections = navigation.sections ?? { scenes: true, scripts: true, variables: true };
      setIsScenesOpen(sections.scenes !== false);
      setIsScriptsOpen(sections.scripts !== false);
      setIsVariablesOpen(sections.variables !== false);
      const open = [sections.scenes !== false, sections.scripts !== false, sections.variables !== false];
      const closedSize = HEADER_HEIGHT;
      const closedCount = open.filter(isOpen => !isOpen).length;
      const availableSize = Math.max(120, (navigationRef.current?.clientHeight ?? window.innerHeight) - closedCount * closedSize);
      const savedSizes = Array.isArray(navigation.sizes) && navigation.sizes.length === 3 ? navigation.sizes : [1, 1, 1];
      const openSavedTotal = savedSizes.reduce((total: number, size: number, index: number) => total + (open[index] ? Math.max(1, size) : 0), 0);
      const openCount = open.filter(Boolean).length;
      const restoredSizes = open.map((isOpen, index) => isOpen
        ? openSavedTotal > 0 ? availableSize * Math.max(1, savedSizes[index]) / openSavedTotal : availableSize / Math.max(1, openCount)
        : closedSize);
      setPanelSizes(restoredSizes);
    }).catch(error => console.error('Failed to load navigation splitter sizes:', error));
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
    else setGlobalSelectedKey(null);
  }, [elementSelected]);

  useEffect(() => {
    if (!elementSelected || (elementSelected._resourceType !== 'script' && elementSelected._resourceType !== 'variables')) {
      setGlobalSelectedKey(null);
    }
  }, [elementSelected]);

  const toggleSection = (section: 'scenes' | 'scripts' | 'variables') => {
    const next = getNextSectionState(section);
    setIsScenesOpen(next.scenes);
    setIsScriptsOpen(next.scripts);
    setIsVariablesOpen(next.variables);
    if (!showScriptsAndVariables) return;
    const totalHeight = navigationRef.current?.clientHeight ?? window.innerHeight;
    const open = [next.scenes, next.scripts, next.variables];
    const openCount = open.filter(Boolean).length;
    const expandedSize = Math.max(0, totalHeight - HEADER_HEIGHT * (3 - openCount)) / openCount;
    setPanelSizes(open.map(isOpen => isOpen ? expandedSize : HEADER_HEIGHT));
  };

  const [searchTerms, setSearchTerms] = useState({ scenes: '', scripts: '', variables: '' });
  const searchTerm = searchTerms.scenes;
  const filteredScenes = useMemo(() => {
    const term = searchTerm.toLowerCase();

    return Object.values(scenes).filter(scene => {
      // sempre excluir deletados
      if (scene._deleted) return false;

      // se tiver termo de busca, aplica filtro de nome
      if (searchTerm && !scene.name?.toLowerCase().includes(term)) {
        return false;
      }

      // se não mostrar scripts/variáveis, também exclui LOGO
      if (!showScriptsAndVariables && !(scene.sceneType === ETypeScene.LOGO || scene.sceneType === ETypeScene.POINTNCLICK)) {
        return false;
      }

      return true;
    });
  }, [scenes, searchTerm, showScriptsAndVariables]);

  const handleSearchClick = (section: 'scenes' | 'scripts' | 'variables') => {
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
      <Flex align='center'>
        <BuildOutlined />
        <Text style={{ marginLeft: 5 }}>{scene.name}</Text>
      </Flex>
    ),
    isLeaf: false,
    children: [
      ...(scene.actors ?? []).map(actor => ({ key: `actor:${scene.id}:${actor.id}`, title: <Flex align="center"><GatewayOutlined /><Text style={{ marginLeft: 5 }}>{actor.name || 'Actor'}</Text></Flex> })),
      ...(scene.triggers ?? []).map(trigger => ({ key: `trigger:${scene.id}:${trigger.id}`, title: <Flex align="center"><ThunderboltOutlined /><Text style={{ marginLeft: 5 }}>{trigger.name || 'Trigger'}</Text></Flex> })),
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

  const treeDataVariables: TreeDataNode[] = variables.variables.filter(variable => !(variable as any)._deleted && (!searchTerms.variables || (variable.name || getVariableDefaultName(variable.symbol)).toLowerCase().includes(searchTerms.variables.toLowerCase()))).map(variable => ({
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
  const treeDataScripts: TreeDataNode[] = scripts.scripts.filter(script => !(script as any)._deleted && (!searchTerms.scripts || (script.name || '').toLowerCase().includes(searchTerms.scripts.toLowerCase()))).map(script => ({
    key: script.id,
    title: <Flex align="center" style={{ paddingRight: 4 }}><Text style={{ marginLeft: 5 }}><FileFilled /> {script.name}</Text></Flex>,
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

  const functionSearch = (section: 'scenes' | 'scripts' | 'variables') => (
    <Tooltip placement="right" title={"Search"} color={token.colorBorder}>
      <SearchOutlined style={{ marginLeft: 8, padding: 4, borderRadius: token.borderRadius, backgroundColor: searchOpen[section] ? token.colorPrimary : 'transparent', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleSearchClick(section); }} />
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

  const onSelectTree = (selectedKeys: Key[], info: any, source: /*'scenes' |*/ 'scripts' | 'variables') => {
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
  };

  const handleResizeStart = (sizes:Array<number>) => {
    // Ajuste o tamanho da barra de arrastar aqui
    console.log('.: Resize LeftPanel start :. ');
    console.log('.: Resize LeftPanel Tela 1: ', sizes[0]);
    console.log('.: Resize LeftPanel Tela 2: ', sizes[1]);
    console.log('.: Resize LeftPanel Tela 3: ', sizes[2]);
    console.log('.: ---------------------- :. ');
  };

  const getNextSectionState = (section: 'scenes' | 'scripts' | 'variables') => {
    const next = { scenes: isScenesOpen, scripts: isScriptsOpen, variables: isVariablesOpen };
    next[section] = !next[section];
    if (!showScriptsAndVariables) return next;
    if (!next.scenes && !next.scripts && !next.variables) {
      if (section === 'scenes') next.scripts = true;
      else if (section === 'scripts') next.variables = true;
      else next.scenes = true;
    }
    return next;
  };

  useEffect(() => {
    if (loadedNavigationProjectRef.current !== leftNavigationProjectId) return;
    window.electronAPI.saveLastPositionSplitters({
      projectId: leftNavigationProjectId,
      leftNavigation: {
        sizes: panelSizes.map(Math.round),
        sections: { scenes: isScenesOpen, scripts: isScriptsOpen, variables: isVariablesOpen },
        expandedKeys: expandedTrees,
      },
    }).catch(error => console.error('Failed to save navigation state:', error));
  }, [leftNavigationProjectId, panelSizes, isScenesOpen, isScriptsOpen, isVariablesOpen, expandedTrees]);

  const handleTreeExpand = (section: 'scenes' | 'scripts' | 'variables', keys: Key[]) => {
    const nextExpandedTrees = { ...expandedTrees, [section]: keys };
    setExpandedTrees(nextExpandedTrees);
  };

  const handleResizeEnd = (sizes:Array<number>) => {
    // Ajuste o tamanho da barra de arrastar aqui
    console.log('.: Resize LeftPanel end :. ');
    console.log('.: Resize LeftPanel Tela 1: ', sizes[0]);
    console.log('.: Resize LeftPanel Tela 2: ', sizes[1]);
    console.log('.: Resize LeftPanel Tela 3: ', sizes[2]);
    console.log('.: ---------------------- :. ');
    handleResize(sizes);
  };

  const handleResize = (sizes:Array<number>) => {
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
      // console.log(".: Fixar tela 2");
      newSizes[1] = HEADER_HEIGHT;
      setIsScriptsOpen(false);
    } else {
      setIsScriptsOpen(true);
    }

    if (newSizes[2] <= HEADER_HEIGHT) {
      // console.log(".: Fixar tela 3: ", sizes[2]);
      newSizes[2] = HEADER_HEIGHT;
      setIsVariablesOpen(false);
    } else {
      setIsVariablesOpen(true);
    }

    setPanelSizes(newSizes);
  };

  const handleSelectElement = (elementId: Key | undefined, shiftKey = false) => {
    const key = elementId?.toString();
    if (!key) return;
    const objectMatch = /^(actor|trigger):([^:]+):(.+)$/.exec(key);
    if (objectMatch) {
      const [, type, sceneId, id] = objectMatch;
      const scene = scenes.find(item => item.id === sceneId);
      if (!scene) return;
      const currentSceneIds = settingUtils.selectedSceneIds ?? (elementSelected?.id ? [elementSelected.id] : []);
      setElementSelected({ ...scene, _recenter: currentSceneIds.includes(scene.id) ? undefined : true });
      setSettingUtils(previous => ({ ...previous, tileEditSceneId: sceneId, tileEditLayerId: 4, activeSceneObject: { sceneId, type: type as 'actor' | 'trigger', id }, activeTriggerId: type === 'trigger' ? id : null }));
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
    }));
    setElementSelected(activeScene ? { ...activeScene, _recenter: shouldRecenter || undefined } : null);
  }

  return (
    <div ref={navigationRef} style={{ height: '100%', minHeight: 0 }}>
    <Splitter data-testid="left-panel" layout="vertical"
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
                    className="custom-tree"
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
          {/* PAINEL 2 */}
          <Splitter.Panel size={panelSizes[1]} min={HEADER_HEIGHT} style={{ overflow: 'hidden' }}>
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
                      className="custom-tree"
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
          <Splitter.Panel size={panelSizes[2]} min={HEADER_HEIGHT} style={{ overflow: 'hidden', }}>
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

export default LeftPanel;
