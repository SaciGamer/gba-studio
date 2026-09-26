import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { BuildOutlined, CaretRightFilled, CaretRightOutlined, FileFilled, GatewayOutlined, PlusOutlined, SearchOutlined, SettingOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Collapse, Flex, Input, Layout, Space, Splitter, Tooltip, Tree, TreeDataNode, Typography } from 'antd';
import React, { Key, useEffect, useMemo, useRef, useState } from 'react';
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

  const [searchOpen, setSearchOpen] = useState({ scenes: false, scripts: false, variables: false });
  const searchInputRef = useRef<any>(null);
  const { token } = AntdToken();

  const HEADER_HEIGHT = 40; // Altura fixa do header
  const [panelSizes, setPanelSizes] = useState([33, 33, 33]); // Tamanhos iniciais dos painéis em porcentagem

  const [treeHeightScenes, setTreeHeightScenes] = useState(window.innerHeight);
  const [treeHeightScripts, setTreeHeightScripts] = useState(window.innerHeight);
  const [treeHeightVariables, setTreeHeightVariables] = useState(window.innerHeight);

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

  const toggleSection = (section: string) => {
    if (!showScriptsAndVariables) {
      // Se não mostrar Scripts/Variables, apenas alternar scenes
      setIsScenesOpen(!isScenesOpen);
      return;
    }
    
    setPanelSizes(prevSizes => {
      const newSizes = [...prevSizes];
      const collapsedSize = 40;
      const totalHeight = window.innerHeight;

      const calculateExpandedSize = (openPanels: number) => {
        return (totalHeight - (collapsedSize * (3 - openPanels))) / openPanels;
      };

      switch (section) {
        case 'scenes':
          if (isScenesOpen) {
            // Fechando scenes
            newSizes[0] = collapsedSize;

            // Redistribui o espaço entre os painéis abertos
            const openPanels = [isScriptsOpen, isVariablesOpen].filter(Boolean).length;
            if (openPanels > 0) {
              const expandedSize = calculateExpandedSize(openPanels);
              if (isScriptsOpen) newSizes[1] = expandedSize;
              if (isVariablesOpen) newSizes[2] = expandedSize;
            } else {
              // Se não há painéis abertos, abre o próximo
              newSizes[1] = totalHeight - (2 * collapsedSize);
              setIsScriptsOpen(true);
            }
          } else {
            // Abrindo scenes
            const openPanels = [true, isScriptsOpen, isVariablesOpen].filter(Boolean).length;
            const expandedSize = calculateExpandedSize(openPanels);

            newSizes[0] = expandedSize;
            if (isScriptsOpen) newSizes[1] = expandedSize;
            if (isVariablesOpen) newSizes[2] = expandedSize;
            if (!isScriptsOpen) newSizes[1] = collapsedSize;
            if (!isVariablesOpen) newSizes[2] = collapsedSize;
          }
          setIsScenesOpen(!isScenesOpen);
          break;

        case 'scripts':
          if (isScriptsOpen) {
            // Fechando scripts
            newSizes[1] = collapsedSize;

            const openPanels = [isScenesOpen, isVariablesOpen].filter(Boolean).length;
            if (openPanels > 0) {
              const expandedSize = calculateExpandedSize(openPanels);
              if (isScenesOpen) newSizes[0] = expandedSize;
              if (isVariablesOpen) newSizes[2] = expandedSize;
            } else {
              newSizes[2] = totalHeight - (2 * collapsedSize);
              setIsVariablesOpen(true);
            }
          } else {
            // Abrindo scripts
            const openPanels = [isScenesOpen, true, isVariablesOpen].filter(Boolean).length;
            const expandedSize = calculateExpandedSize(openPanels);

            if (isScenesOpen) newSizes[0] = expandedSize;
            newSizes[1] = expandedSize;
            if (isVariablesOpen) newSizes[2] = expandedSize;
            if (!isScenesOpen) newSizes[0] = collapsedSize;
            if (!isVariablesOpen) newSizes[2] = collapsedSize;
          }
          setIsScriptsOpen(!isScriptsOpen);
          break;

        case 'variables':
          if (isVariablesOpen) {
            // Fechando variables
            newSizes[2] = collapsedSize;

            const openPanels = [isScenesOpen, isScriptsOpen].filter(Boolean).length;
            if (openPanels > 0) {
              const expandedSize = calculateExpandedSize(openPanels);
              if (isScenesOpen) newSizes[0] = expandedSize;
              if (isScriptsOpen) newSizes[1] = expandedSize;
            } else {
              newSizes[0] = totalHeight - (2 * collapsedSize);
              setIsScenesOpen(true);
            }
          } else {
            // Abrindo variables
            const openPanels = [isScenesOpen, isScriptsOpen, true].filter(Boolean).length;
            const expandedSize = calculateExpandedSize(openPanels);

            if (isScenesOpen) newSizes[0] = expandedSize;
            if (isScriptsOpen) newSizes[1] = expandedSize;
            newSizes[2] = expandedSize;
            if (!isScenesOpen) newSizes[0] = collapsedSize;
            if (!isScriptsOpen) newSizes[1] = collapsedSize;
          }
          setIsVariablesOpen(!isVariablesOpen);
          break;
      }

      setTreeHeightScenes(newSizes[0] - 60);
      setTreeHeightScripts(newSizes[1] - 60);
      setTreeHeightVariables(newSizes[2] - 60);
      return newSizes;
    });
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
    height: 40
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

  const handleResizeEnd = (sizes:Array<number>) => {
    // Ajuste o tamanho da barra de arrastar aqui
    console.log('.: Resize LeftPanel end :. ');
    console.log('.: Resize LeftPanel Tela 1: ', sizes[0]);
    console.log('.: Resize LeftPanel Tela 2: ', sizes[1]);
    console.log('.: Resize LeftPanel Tela 3: ', sizes[2]);
    console.log('.: ---------------------- :. ');
  };

  const handleResize = (sizes:Array<number>) => {
    const newSizes = [...sizes];

    // Verifica se o painel 3 atingiu o tamanho 
    if (newSizes[0] <= 50) {
      // console.log(".: Fixar tela 1");
      newSizes[0] = 40;
      setIsScenesOpen(false);
    } else {
      setIsScenesOpen(true);
    }

    if (newSizes[1] <= 50) {
      // console.log(".: Fixar tela 2");
      newSizes[1] = 40;
      setIsScriptsOpen(false);
    } else {
      setIsScriptsOpen(true);
    }

    if (newSizes[2] <= 50) {
      // console.log(".: Fixar tela 3: ", sizes[2]);
      newSizes[2] = 40;
      setIsVariablesOpen(false);
    } else {
      setIsVariablesOpen(true);
    }

    setPanelSizes(newSizes);
    setTreeHeightScenes(newSizes[0] - 60);
    setTreeHeightScripts(newSizes[1] - 60);
    setTreeHeightVariables(newSizes[2] - 60);
  };

  const handleSelectElement = (elementId: Key | undefined, selectedKeys: Key[] = []) => {
    const key = elementId?.toString();
    if (!key) return;
    const objectMatch = /^(actor|trigger):([^:]+):(.+)$/.exec(key);
    if (objectMatch) {
      const [, type, sceneId, id] = objectMatch;
      const scene = scenes.find(item => item.id === sceneId);
      if (!scene) return;
      setElementSelected({ ...scene, _recenter: true });
      setSettingUtils(previous => ({ ...previous, tileEditSceneId: sceneId, tileEditLayerId: 4, activeSceneObject: { sceneId, type: type as 'actor' | 'trigger', id }, activeTriggerId: type === 'trigger' ? id : null }));
      return;
    }
    const element = filteredScenes.filter(s => s.id === key).map(scene => scene).at(0);
    if (!element) return;

    const sceneIds = selectedKeys.map(item => String(item)).filter(id => scenes.some(scene => scene.id === id));
    const activeId = sceneIds.at(-1) ?? element.id;
    const activeScene = scenes.find(scene => scene.id === activeId) ?? element;

    setGlobalSelectedKey(null);
    setSettingUtils(previous => ({
      ...previous,
      tileEditSceneId: previous.activeButton === 'add' && (previous.activeSubButton === 'Actor' || previous.activeSubButton === 'Trigger') ? element.id : previous.tileEditSceneId,
      activeSceneObject: null,
      activeTriggerId: null,
      selectedSceneIds: sceneIds.length ? sceneIds : [element.id],
    }));
    setElementSelected({ ...activeScene, _recenter: true });
  }

  return (
    <Splitter data-testid="left-panel" layout="vertical"
      onResize={handleResize}
      onResizeStart={handleResizeStart}
      onResizeEnd={handleResizeEnd}
    >
      {/* PAINEL 1 */}
      <Splitter.Panel size={panelSizes[0]} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Collapse
          defaultActiveKey={['1']}
          activeKey={isScenesOpen ? 1 : 0}
          onChange={(keys) => { toggleSection('scenes'); console.log("..: Leftpanel scene key: ", keys); }}
          expandIcon={({ isActive }) => <CaretRightOutlined rotate={isActive ? 90 : 0} style={{ fontSize: token.fontSize, }} />}
          style={{ height: 40, border: 'none' }}
          items={[
            {
              key: '1',
              label: 'SCENES',
              extra: [functionAdd(), functionSearch('scenes')],
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
                    className="custom-tree"
                    showIcon
                    multiple
                    height={searchOpen.scenes ? treeHeightScenes - 25 : treeHeightScenes }
                    treeData={treeDataScenes}
                    defaultExpandAll
                    blockNode
                    selectedKeys={settingUtils.activeSceneObject
                      ? [settingUtils.activeSceneObject.sceneId, `${settingUtils.activeSceneObject.type}:${settingUtils.activeSceneObject.sceneId}:${settingUtils.activeSceneObject.id}`]
                      : settingUtils.selectedSceneIds ?? (elementSelected ? [elementSelected.id] : [])}
                    onSelect={(keys, info) => handleSelectElement(info.node.key, keys)}
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
          <Splitter.Panel size={panelSizes[1]} style={{ overflow: 'hidden' }}>
            <Collapse
              defaultActiveKey={['1']}
              activeKey={isScriptsOpen ? 1 : 0}
              onChange={(keys) => { toggleSection('scripts'); console.log("novo teste: ", keys); }}
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
                      className="custom-tree"
                      showIcon
                      // icon={<FileFilled />}
                      height={searchOpen.scripts ? treeHeightScripts - 25 : treeHeightScripts}
                      treeData={treeDataScripts}
                      defaultExpandAll
                      blockNode
                      selectedKeys={getSelectedKeyFromGlobal('scripts')}
                      onSelect={(selectedKeys, info) =>
                        onSelectTree(selectedKeys, info, 'scripts')
                      }
                      style={{ height: treeHeightScripts, background: token.colorBgBase }}
                    /></Content>
                  )
                },
              ]}
            />
              
          </Splitter.Panel>
          {/* PAINEL 3 */}
          <Splitter.Panel size={panelSizes[2]} style={{ overflow: 'hidden', }}>
            <Collapse
              defaultActiveKey={['1']}
              activeKey={isVariablesOpen ? 1 : 0}
              onChange={(keys) => { toggleSection('variables'); console.log("novo teste: ", keys); }}
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
                      className="custom-tree"
                      showIcon
                      // icon={<div>$</div>}
                      height={searchOpen.variables ? treeHeightVariables - 25 : treeHeightVariables}
                      treeData={treeDataVariables}
                      defaultExpandAll
                      blockNode
                      selectedKeys={getSelectedKeyFromGlobal('variables')}
                      onSelect={(selectedKeys, info) =>
                        onSelectTree(selectedKeys, info, 'variables')
                      }
                      style={{ height: treeHeightVariables, backgroundColor: token.colorBgBase }}
                    /></Content>
                  )
                },
              ]}
            />
          </Splitter.Panel>
        </>
      )}
    </Splitter>
  );
};

export default LeftPanel;
