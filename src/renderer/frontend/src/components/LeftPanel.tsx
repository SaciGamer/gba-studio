import { BuildOutlined, CaretRightFilled, CaretRightOutlined, EditOutlined, FileFilled, PlusOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import {  Collapse, Input, Layout, Splitter, Tooltip, Tree, TreeDataNode, Typography } from 'antd';
import React, { Key, useEffect, useMemo, useRef, useState } from 'react';
import { AntdToken } from '../components/common/AntDToken';
import { useElementContext, useSceneContext, useSettingsUtilsContext } from '@/providers/contexts/AppContexts';
import { ETypeScene, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';

const { Content } = Layout;
const { Panel } = Collapse;
const { Text } = Typography;

const LeftPanel: React.FC<{ showScriptsAndVariables?: boolean }> = ({ showScriptsAndVariables = true }) => {
  const { scenes } = useSceneContext();
  const { settingUtils, setSettingUtils } = useSettingsUtilsContext();
  const { elementSelected, setElementSelected } = useElementContext();

  const [isScenesOpen, setIsScenesOpen] = useState(true);
  const [isScriptsOpen, setIsScriptsOpen] = useState(true);
  const [isVariablesOpen, setIsVariablesOpen] = useState(true);

  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const searchInputRef = useRef<any>(null);
  const { token } = AntdToken();

  const HEADER_HEIGHT = 40; // Altura fixa do header
  const [panelSizes, setPanelSizes] = useState([33, 33, 33]); // Tamanhos iniciais dos painéis em porcentagem

  const [treeHeightScenes, setTreeHeightScenes] = useState(window.innerHeight);
  const [treeHeightScripts, setTreeHeightScripts] = useState(window.innerHeight);
  const [treeHeightVariables, setTreeHeightVariables] = useState(window.innerHeight);

  // Adicione esse novo estado no início do componente
  const [globalSelectedKey, setGlobalSelectedKey] = useState<string | null>(null);

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

      setTreeHeightScenes(newSizes[0] - 40);
      setTreeHeightScripts(newSizes[1] - 40);
      setTreeHeightVariables(newSizes[2] - 40);
      return newSizes;
    });
  };

  const [searchTerm, setSearchTerm] = useState('');
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

  const handleSearchClick = () => {
    setIsSearchVisible(!isSearchVisible);
    if (isSearchVisible) {
      setSearchTerm('');
    }
  };

  useEffect(() => {
    if (isSearchVisible && searchInputRef.current) {
      searchInputRef.current?.focus();
    }
  }, [isSearchVisible]);

  const treeDataVariables: TreeDataNode[] = Array.from({ length: 101 }, (_, index) => ({
    key: index,
    title: <Text style={{ marginLeft: 5 }}>Variable {index}</Text>,
  }));

  const treeDataScripts: TreeDataNode[] = Array.from({ length: 11 }, (_, index) => ({
    key: index + 1,
    title: <Text style={{ marginLeft: 5 }}>Script {index}</Text>,
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

  const functionSearch = () => (
    <Tooltip placement="right" title={"Search"} color={token.colorBorder}>
      <SearchOutlined style={{ marginLeft: 8, padding: 4, borderRadius: token.borderRadius, backgroundColor: isSearchVisible ? token.colorPrimary : 'transparent', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleSearchClick(); }} />
    </Tooltip>
  );

  const handleCallNewScene = () => {
    setSettingUtils(prev => ({
      ...prev,
      activeButton: 'add',
      activeSubButton: 'Scene'
    }))
  }

  const functionAdd = () => (
    <Tooltip placement="bottom" title={"Add Scene"} color={token.colorBorder} >
      <PlusOutlined style={{ marginLeft: 8, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleCallNewScene() }} />
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
    return [parseInt(key)]; // Converte para número pois as keys são numéricas
  };

  const onSelectTree = (selectedKeys: Key[], info: any, source: 'scripts' | 'variables' | 'scenes') => {
    const newKey = selectedKeys[0]?.toString() || null;
    setGlobalSelectedKey(newKey ? `${source}-${newKey}` : null);
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
    const threshold = (HEADER_HEIGHT / window.innerHeight) * 100; // Converter HEADER_HEIGHT para porcentagem


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
    setTreeHeightScenes(newSizes[0]);
    setTreeHeightScripts(newSizes[1]);
    setTreeHeightVariables(newSizes[2] - 50);
  };

  const handleSelectElement = (element: ISceneSettings | null) => {
    // setGlobalSelectedKey(elementId? `scenes-${elementId}` : null);
    // setSelectBlockId(elementId? elementId : null);
    setElementSelected(element);
  }

  return (
    <Splitter layout="vertical"
      onResize={handleResize}
      onResizeStart={handleResizeStart}
      onResizeEnd={handleResizeEnd}
      style={{}}
    >
      {/* PAINEL 1 */}
      <Splitter.Panel size={panelSizes[0]} style={{ overflow: 'hidden' }}>
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
              extra: [functionAdd(), functionSearch()],
              style: panelStyle,
              children: isScenesOpen && (
                <Content style={{ backgroundColor: token.colorBgBase }}>
                  {isSearchVisible && (
                    <Input
                      ref={searchInputRef}
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{
                        marginBottom: 5,
                        height: 25,
                        border: 'none',
                        backgroundColor:
                          searchTerm === '' ? token.colorBgBase : token.colorBorder,
                      }}
                    />
                  )}
                  {filteredScenes.map((scene) => (
                    <Content
                      key={scene.id}
                      onClick={() => {
                        handleSelectElement(scene);
                      }}
                      hidden={false}
                      style={{
                        backgroundColor:
                          elementSelected?.id === scene.id
                            ? token.colorPrimary
                            : 'transparent',
                        borderRadius: token.borderRadius,
                        margin: 2,
                      }}
                    >
                      <CaretRightFilled />
                      <BuildOutlined />
                      <Text style={{ marginLeft: 5 }}>{scene.name}</Text>
                    </Content>
                  ))}
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
                  extra: genExtra(),
                  children: (
                    <Tree
                      className="custom-tree"
                      showIcon
                      icon={<FileFilled />}
                      height={treeHeightScripts}
                      treeData={treeDataScripts}
                      defaultExpandAll
                      blockNode
                      selectedKeys={getSelectedKeyFromGlobal('scripts')}
                      onSelect={(selectedKeys, info) =>
                        onSelectTree(selectedKeys, info, 'scripts')
                      }
                      style={{ background: token.colorBgBase }}
                    />
                  ),
                  style: panelStyle,
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
                  extra: genExtra(),
                  children: (
                    <Tree
                      className="custom-tree"
                      showIcon
                      icon={<div>$</div>}
                      height={treeHeightVariables}
                      treeData={treeDataVariables}
                      defaultExpandAll
                      blockNode
                      selectedKeys={getSelectedKeyFromGlobal('variables')}
                      onSelect={(selectedKeys, info) =>
                        onSelectTree(selectedKeys, info, 'variables')
                      }
                      style={{ backgroundColor: token.colorBgBase }}
                    />
                  ),
                  style: panelStyle,
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
