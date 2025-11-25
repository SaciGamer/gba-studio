import React, { useState, useEffect, useCallback } from 'react';
import { Flex, Splitter, Typography, Layout, App as AntDApp, Skeleton, Spin } from 'antd';

// import Layout from './components/Layout.tsx';
import TopBar from '../../TopBar';
import LeftPanel from '../../LeftPanel';
import CentralEditor from '../../CentralEditor';
import RightPanel from '../../RightPanel';
import BottomPanel from '../../BottomPanel';
import { ZoomProvider } from '../../ZoomContext';
import EmulatorView from '../../EmulatorView';

// import './Engine.css';
// import '.././styles.css';

import GameWorld from '../../gameWorld/GameWorld';
// import { ipcRenderer } from 'electron';

// import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

import { useLocation } from 'react-router-dom';
import ErrorBoundary from 'antd/es/alert/ErrorBoundary';
import { AntdToken } from '../../common/AntDToken';
import { ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { useBackgroundContext, useProjectContext, useSceneContext, useSettingsContext, useSettingsUtilsContext } from '@/providers/contexts/AppContexts';
import { IBackgroundSettings } from '@/providers/contexts/interfaces/IBackgroundElement';
import { IProjectSettings } from '@/providers/contexts/interfaces/IProjectElement';
import { IMainSettings } from '@/providers/contexts/interfaces/ISettingElement';
import { ISettingUtils } from '@/providers/contexts/interfaces/ISettingUtils';
import { LayoutOutlined } from '@ant-design/icons';

const { Content } = Layout;

const Engine: React.FC = () => {
  const { token } = AntdToken();
  const location = useLocation();
  const [contentView, setContentView] = useState<number>(1);
  const [loading, setLoading] = useState(true);

  const { scenes, setScenes, scenesRef, ignoredFields: ignoredFieldsScenes} = useSceneContext();
  const { project, setProject, projectRef, ignoredFields: ignoredFieldsProject } = useProjectContext();
  const { settings, setSettings, settingsRef, ignoredFields: ignoredFieldsSettings } = useSettingsContext();
  const { backgrounds, setBackgrounds, backgroundsRef, ignoredFields: ignoredFieldsBackgrounds } = useBackgroundContext();
  const { settingUtils, setSettingUtils, settingUtilsRef } = useSettingsUtilsContext();

  // Update settings utils initialization
  const initializeSettingUtils = useCallback((projectFilePath: string) => {
    const defaultSettingUtils: ISettingUtils = {
      _resourceType: 'setting-utils',
      _saved: true,
      _deleted: false,
      projectPathFile: projectFilePath,
      projectDirectory: projectFilePath ? projectFilePath.substring(0, projectFilePath.lastIndexOf('\\')) : '',
      baseTitle: 'GBA Studio',
      activeButton: 'select',
      activeSubButton: '',
      localImagePath: '',
      images: null
    };

    setSettingUtils(prev => ({ ...prev, ...defaultSettingUtils }));
  }, []);

  // const handleCompile = () => {
  //   console.log('Solicitando compilação...');
  //   ipcRenderer.send('compile-project');
  // };

  // const handleLaunchEmulator = () => {
  //   console.log('Solicitando inicialização do emulador...');
  //   ipcRenderer.send('launch-emulator', 'caminho/para/sua/rom.gba');
  // };

  // const handleRunProject = () => {
  //   console.log('Solicitando execução do projeto...');
  //   ipcRenderer.send('run-project');
  // };

  const Desc: React.FC<Readonly<{ text?: string | number }>> = (props) => (
    <Flex justify="center" align="center" style={{ height: '100%' }}>
      <Typography.Title type="secondary" level={5} style={{ whiteSpace: 'nowrap' }}>
        {props.text}
      </Typography.Title>
    </Flex>
  );


  const [panelSizes, setPanelSizes] = useState<number[]>([]); // Tamanho inicial do painel
  const [showFloatButton, setShowFloatButton] = useState<boolean>(false);
  // const [isResizing, setIsResizing] = useState<boolean>(false);

  // const handleResizeStart = () => {
  //   setIsResizing(true);
  // };

  const handleResizePanel = (sizes: number[]) => {
    setPanelSizes(sizes);
  };

  const handleResizeEnd = (sizes: number[]) => {
    // setIsResizing(false);
    const newSizes = sizes;

    // console.log('Tamanhos 1 janela:', sizes[0])
    // console.log('Tamanhos 2 janela:', sizes[1])
    // console.log('Tamanhos 3 janela:', sizes[2])
    // console.log('-------------------------------------------')
    // setPanelSize(size);
    if (newSizes[0] > 140 && newSizes[0] < 250) {
      setShowFloatButton(false);
      newSizes[0] = 250
      setPanelSizes(newSizes);
    } else if (newSizes[0] <= 140) {
      setShowFloatButton(true);
      newSizes[0] = 0;
      setPanelSizes(newSizes);
    } else {
      setShowFloatButton(false);
    }

    // Arredondar os numeros
    let newSizesRound = newSizes.map(Math.round);

    setPanelSizes(newSizesRound);

    // Salva preferencia dos paineis Splitter
    window.electronAPI.saveLastPositionSplitters(newSizesRound);
  };

  const resetPanelSize = () => {
    const newSizes = [...panelSizes];
    newSizes[0] = 250;
    handleResizeEnd(newSizes);
  };

  useEffect(() => {
    if (!window.electronAPI) {
      console.error('window.electronAPI is undefined');
      return;
    }

    const loadSizesSplitters = async () => {
      const newSizesSplitter = await window.electronAPI.loadLastPositionSplitters();
      console.log('>> Splitters: ', newSizesSplitter);
      if (newSizesSplitter)
        handleResizeEnd(newSizesSplitter)
      else
        setPanelSizes([250, window.innerWidth - 500, 250]);
    };

    loadSizesSplitters();
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    console.log("..: Engine - query:", query);

    const projectFilePath = query.get('path');

    const loadFile = async (projectFilePath: string | null) => {
      if (!projectFilePath) return;
      
      // Initialize settings utils first
      console.log("..: Engine - File Path:", projectFilePath);
      initializeSettingUtils(projectFilePath);
      console.log('..: useEffect settingUtils default ', settingUtils);
    
      try {
        const file = await window.electronAPI.loadSettings(projectFilePath);
        console.log("..: Engine - Response BE:", file);
        if (!file || !Array.isArray(file)) {
          console.error('Invalid file data:', file);
          return;
        }

        const scenesFromFile: ISceneSettings[] = [];
        const backgroundsFromFile: IBackgroundSettings[] = [];
        let projectFromFile: IProjectSettings | null = null;
        let settingsFromFile: IMainSettings | null = null;

        file.forEach((obj) => {
          const objectJson = JSON.parse(obj);
          switch (objectJson._resourceType) {
            case 'scene':
              scenesFromFile.push({ ...objectJson as ISceneSettings, _saved: true });
              break;
            case 'background':
              backgroundsFromFile.push({ ...objectJson as IBackgroundSettings, _saved: true });
              break;
            case 'project':
              projectFromFile = { ...objectJson as IProjectSettings, _saved: true };
              break;
            case 'settings':
              settingsFromFile = { ...objectJson as IMainSettings, _saved: true };
              break;
            default:
              console.log("..: Engine - Unknown Object:", objectJson);
              break;
          }
        });

        // Atualize os estados de uma vez só:
        if (scenesFromFile.length > 0) {
          setScenes(prev => {
            const prevIds = prev.map(s => s.id);
            const novos = scenesFromFile.filter(s => !prevIds.includes(s.id));
            return [...prev, ...novos];
          });
        }

        if (backgroundsFromFile.length > 0) {
          setBackgrounds(prev => {
            const prevIds = prev.map(b => b.id);
            const novos = backgroundsFromFile.filter(b => !prevIds.includes(b.id));
            return [...prev, ...novos];
          });
        }

        if (projectFromFile) {
          setProject(projectFromFile);
        }

        if (settingsFromFile) {
          setSettings(settingsFromFile);
        }

        setTimeout(() => {
          setLoading(false); // Finaliza o estado de carregamento
        }, 500); // Aguarde 500ms para garantir a consistência

      } catch (error) {
        console.error('Error parsing file data:', error);
        setLoading(false);
      }
    }

    loadFile(projectFilePath);
  }, [location.search]);

  // Expose serialized project helper for fallback run-live (main may call window.__getSerializedProject())
  useEffect(() => {
    (window as any).__getSerializedProject = async () => {
      try {
        // Collect project files from providers refs
        const projectDir = settingUtilsRef.current?.projectDirectory || '';
        const files: any[] = [];
        const assets: any[] = [];

        // Scenes
        const scenes = scenesRef.current || [];
        scenes.forEach((s: any) => files.push({ path: `project/scenes/${s.name.toLowerCase().replace(/ /g,'_')}.gbasres`, content: s }));

        // Backgrounds
        const bgs = backgroundsRef.current || [];
        bgs.forEach((b: any) => files.push({ path: `project/backgrounds/${b.name.toLowerCase().replace(/ /g,'_')}.gbasres`, content: b }));

        // Project
        if (projectRef.current) {
          const projPathFile = settingUtilsRef.current && (settingUtilsRef.current as any).projectPathFile ? (settingUtilsRef.current as any).projectPathFile : null;
          const projFileName = projPathFile ? projPathFile.split('\\').pop()?.split('/').pop() : 'project.gbaproj';
          files.push({ path: `project/${projFileName}`, content: projectRef.current });
        }

        // Settings
        if (settingsRef.current) files.push({ path: `project/settings.gbasres`, content: settingsRef.current });

        // Collect assets from settingUtils localImagePath (scan assets folder)
        try {
          const fs = (window as any).fs || null; // window fs not available; fallback to asking main is not possible here
        } catch (e) {}

        return { projectFiles: files, assets };
      } catch (err) {
        console.error('Error building serialized project', err);
        return null;
      }
    };

    return () => { try { delete (window as any).__getSerializedProject; } catch (e) {} };
  }, []);

  // TODO pegar requisição para save
  useEffect(() => {
    const prepareForBackend = (fields: any, ignoredFields: string[]) => {
      if (Array.isArray(fields)) {
        console.log("..: IsArray:", fields);
        if (fields.length > 0) {
          return fields.map((field: any) =>
            Object.fromEntries(
                Object.entries(field).filter(([key]) => !ignoredFields.includes(key))
            )
          );;
        }
        return null;
      }
      console.log("..: IsNOTArray:", fields);
      return  Object.fromEntries(
        Object.entries(fields).filter(([key]) => !ignoredFields.includes(key))
      );
    };

    const callback = (requestToSave: string) => {
      console.log('..: BE requisitou FE para saves:', requestToSave);

      // Use refs para garantir dados atualizados
      console.log('..: all data to save scenes:', scenesRef.current);
      console.log('..: all data to save project:', projectRef.current);
      console.log('..: all data to save backgrounds:', backgroundsRef.current);
      console.log('..: all data to save setting:', settingsRef.current);
      console.log('..: all data to save settingUtils:', settingUtilsRef.current);

      // Preparar os dados para salvar
      const allToSave = [
        prepareForBackend(scenesRef.current.filter(s => s._saved === false), ignoredFieldsScenes!),
        projectRef.current?._saved === false ? prepareForBackend(projectRef.current, ignoredFieldsProject!) : null,
        settingsRef.current._saved === false ? prepareForBackend(settingsRef.current, ignoredFieldsSettings!) : null,
        prepareForBackend(backgroundsRef.current.filter(s => s._saved === false), ignoredFieldsBackgrounds!),
        settingUtilsRef.current,
      ].filter(item => item != null && (!(Array.isArray(item)) || item.length > 0));

      console.log('..: Infos to save:', allToSave);
      // Enviar dados para o Backend
      window.electronAPI.responseProjectToSave(allToSave);

      // Marcar todos os elementos como salvos
      setScenes(() => scenesRef.current.map(s => ({ ...s, _saved: true })));
      setProject(() => ({ ...projectRef.current!, _saved: true }));
      setSettings(() => ({ ...settingsRef.current, _saved: true }));
      setBackgrounds(() => backgroundsRef.current.map(b => ({ ...b, _saved: true })));
      // setSettingUtils(settingUtils => ({ ...settingUtils, _saved: true }));

      console.log('..: Todos os itens agora estão com _saved = true.');
    };

    window.electronAPI.onRequestProjectToSave(callback);

    // Remover o listener ao desmontar o componente
    return () => {
      window.electronAPI.onRequestProjectToSave(() => {});
    };
  }, []);

  // Listener para mudança de view pelo menu (atalhos e itens de menu View)
  useEffect(() => {
    const handleChangeContentView = (event: any, viewId: number) => {
      console.log('..: Mudando view para:', viewId);
      setContentView(viewId);
    };

    if (window.electronAPI && window.electronAPI.on) {
      window.electronAPI.on('change-content-view', handleChangeContentView);
    }

    return () => {
      if (window.electronAPI && window.electronAPI.removeListener) {
        window.electronAPI.removeListener('change-content-view', handleChangeContentView);
      }
    };
  }, []);

  useEffect(() => {
    // Helper to check if any item in array has _saved === false
    const hasUnsaved = (arr: any[]) => Array.isArray(arr) && arr.some(item => item && item._saved === false);

    // Check todos para ver se tem algum com alteração para salvar
    const unsaved =
      hasUnsaved(scenes) || hasUnsaved(backgrounds) || (project && project._saved === false) || (settings && settings._saved === false) || (settingUtils && settingUtils._saved === false);

    // Call Electron API to update title - isSaved: true se não tem nada para salvar
    window.electronAPI.updateTitle('GBA Studio', project?.name || '', !unsaved);

    if (unsaved) {
      console.log('..: Engine.tsx tem alguma atualização!');
    }
  }, [scenes, project, settings, backgrounds, settingUtils]);

  // useEffect(() => {
  //   const handleResize = () => {
  //     console.log('..: A janela foi redimensionada com splitters: ', panelSizes);
  //     const newSizes = panelSizes;
  //     newSizes[1] = window.innerWidth - panelSizes[0] - panelSizes[2];
  //     handleResizeEnd(newSizes);
  //   };

  //   // Adiciona o listener para o evento de redimensionamento
  //   window.addEventListener('resize', handleResize);

  //   // Chama a função de redimensionamento uma vez para definir o estado inicial
  //   handleResize();

  //   // Limpa o listener ao desmontar o componente
  //   return () => {
  //     window.removeEventListener('resize', handleResize);
  //   };
  // }, []);

  // useEffect(() => {
  //   const handleResize = () => {
  //     console.log('..: A janela foi redimensionada com splitters: ', panelSizes);
  //     const leftPanelWidth = panelSizes[0];
  //     const rightPanelWidth = panelSizes[2];
  //     const totalWidth = window.innerWidth;
  //     const centerPanelWidth = totalWidth - leftPanelWidth - rightPanelWidth;

  //     handleResizeEnd([leftPanelWidth, centerPanelWidth, rightPanelWidth]);
  //   };

  //   window.addEventListener('resize', handleResize);
  //   handleResize();

  //   return () => {
  //     window.removeEventListener('resize', handleResize);
  //   };
  // }, []);

  if (loading) {
    return (
      <Layout style={{
        width: '100vw',
        height: '100vh',
      }}>
        <Spin fullscreen size="large" percent={50} indicator={<LayoutOutlined spin />} />
      </Layout>
    )
  }

  return (
    <ErrorBoundary>
      <AntDApp>
        <ZoomProvider>
          <Layout style={{
            width: '100vw',
            height: '100vh',
            overflow: 'hidden' // Previne scroll indesejado
          }}>
            {/* <div> */}
            {/* <button style={{ width: '150px', display: 'flex', justifyContent: 'space-between' }} onClick={handleCompile}>
                Compilar Projeto
              </button> */}
            {/* <button onClick={handleLaunchEmulator}>Iniciar Emulador</button> */}
            {/* <button onClick={handleRunProject}>Executar Projeto</button> */}
            {/* </div> */}
            <TopBar contenView={contentView} setContentView={setContentView} />
            {contentView == 1 && (<Layout style={{ display: 'block', flex: 1, overflow: 'hidden' }}>
              {/* <Content> */}
              <Splitter
                // onResizeStart={handleResizeStart}
                onResizeEnd={handleResizeEnd}
                onResize={handleResizePanel}
              >
                {/* PAINEL ESQUERDO */}
                <Splitter.Panel
                  defaultSize="25%"
                  min={130}
                  // max="80%"
                  size={panelSizes[0]}
                  style={{
                    display: panelSizes[0] <= 140 ? 'grid' : 'flex',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                    {panelSizes[0] <= 140 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          zIndex: 10,
                          pointerEvents: 'none', // permite clicar através do overlay
                        }}
                      />
                    )}
                    <LeftPanel />
                  </div>
                </Splitter.Panel>

                {/* CENTRO */}
                <Splitter.Panel /*size={panelSizes[1]}*/>
                  <Splitter layout="vertical">
                    <Content>
                      <GameWorld resetPanelSize={resetPanelSize} setShowFloatButton={setShowFloatButton} showFloatButton={showFloatButton} />
                    </Content>
                    {/* <Splitter.Panel>
                          <CentralEditor />
                        </Splitter.Panel> */}
                    <Splitter.Panel defaultSize="25%" min={40} max="90%">
                      {/* <Footer> */}
                      <BottomPanel />
                      {/* </Footer> */}
                    </Splitter.Panel>
                  </Splitter>
                </Splitter.Panel>

                {/* PAINEL DIREITO */}
                <Splitter.Panel defaultSize="35%" min={350} size={panelSizes[2]} >
                  <RightPanel controllerView={setContentView} />
                </Splitter.Panel>
              </Splitter>
              {/* </Content> */}
              {/* <EmulatorView /> */}
              {/* {showFloatButton && (
              <FloatButton 
                shape="square"
                style={{ position: 'absolute', bottom: 50, right: 900 }}
                icon={<LayoutOutlined />}
                onClick={() => { setPanelSize(250); setShowFloatButton(false); }} // Voltar ao tamanho original
              />
            )} */}
            </Layout>
            )}
            {contentView == 2 && (
              <Content style={{ margin: 50 }}>
                <Skeleton.Node active style={{ height: 150, width: 250 }} />
                <Skeleton active />
                <Skeleton.Image active style={{ height: 150, width: 250 }} />
              </Content>
            )}
            {contentView == 3 && (
              <Content style={{ display: 'flex', flex: 'grid', margin: 50 }}>
                <Skeleton.Image active style={{ height: 150, width: 250 }} />
                <Skeleton active style={{ paddingInline: 20 }} />
                <Skeleton.Image active style={{ height: 150, width: 250 }} />
              </Content>
            )}
            {contentView == 4 && (
              <Content style={{ margin: 50 }}>
                <Skeleton active />
                <Skeleton.Node active style={{ height: 150, width: 250 }} />
              </Content>
            )}
            {contentView == 5 && (
              <Content style={{ margin: 50 }}>
                <Skeleton active />
                <Skeleton.Node active style={{ height: 150, width: 250 }} />
                <Skeleton active />
              </Content>
            )}
            {contentView == 6 && (
              <Content style={{ margin: 50 }}>
                <Skeleton active />
              </Content>
            )}
            {contentView == 7 && (
              <Content style={{ margin: 50 }}>
                <Skeleton.Node active style={{ height: 150, width: 250 }} />
                <Skeleton active />
              </Content>
            )}
            {contentView == 8 && (
              <Content style={{ margin: 50 }}>
                <Skeleton.Node active style={{ height: 600, width: 350 }} />
              </Content>
            )}
          </Layout>
        </ZoomProvider>
      </AntDApp>
    </ErrorBoundary>
  );
};

export default Engine;