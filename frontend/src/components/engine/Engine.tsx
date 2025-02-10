import React, { useState, useEffect } from 'react';
import { Flex, Splitter, Typography, Layout, notification, Affix, Slider, App as AntDApp } from 'antd';

// import Layout from './components/Layout.tsx';
import TopBar from '../TopBar.tsx';
import LeftPanel from '../LeftPanel.tsx';
import CentralEditor from '../CentralEditor.tsx';
import RightPanel from '../RightPanel.tsx';
import BottomPanel from '../BottomPanel.tsx';
import { ZoomProvider } from '../ZoomContext.tsx';
import { BlockProvider, useBlockContext } from '../BlockContext.tsx';
import EmulatorView from '../EmulatorView.tsx';
import Themes from '../themes/Themes.tsx';

// import './Engine.css';
// import '.././styles.css';


import GameWorld from '../GameWorld/GameWorld.tsx';
import FloatButttonsGW from '../FloatButtonsGW.tsx';
// import { ipcRenderer } from 'electron';

// import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

import { AntdToken } from '../common/AntDToken.ts';
import { useLocation } from 'react-router-dom';
import ErrorBoundary from 'antd/es/alert/ErrorBoundary';

const { Header, Sider, Content, Footer } = Layout;

const Engine: React.FC = () => {
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);

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

  // ------------------ THEME ---------------------------------
  // const [theme, setTheme] = useState(Themes[``]);

  // useEffect(() => {
  //   if (window.electronAPI) {  // Verifica se electronAPI está definido
  //       window.electronAPI.on('change-theme', (event, newTheme) => {
  //       console.log("..: mudando tema: data-theme=%s", newTheme);
  //       setTheme(Themes[newTheme]);
  //       document.documentElement.setAttribute(`data-theme`, newTheme);
  //     });

  //     return () => {
  //         window.electronAPI.removeListener('change-theme', (event, newTheme) => {
  //         document.documentElement.setAttribute('data-theme', newTheme);
  //       });
  //     };
  //   } else { 
  //     console.error('window.electronAPI is undefined');  // Mensagem de erro se não definido
  //   }
  // }, []);
  // ------------------------------------------------------------

  const [top, setTop] = React.useState<number>(80);

  const { token } = AntdToken();

  const location = useLocation();
  const [filePath, setFilePath] = useState<string | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    console.log("..: Engine - query:", query);
    
    const file = query.get('file');

    if (file) {
      console.log("..: Engine - file:", file);
      setFilePath(prevFilePath => {
        console.log('Arquivo carregado no Engine (callback):', file);
        return file;
      });
      console.log("..: Engine - Arquivo carregado no Engine:", filePath);
      // TODO Lógica para carregar e processar o arquivo .gbaproj
    }
  }, [location.search]);

  return (
    <ErrorBoundary>
    <AntDApp>
      <ZoomProvider>
        <Layout style={{ minHeight: '100vh', minWidth:'100vw' }}>
            <div>
              {/* <button style={{ width: '150px', display: 'flex', justifyContent: 'space-between' }} onClick={handleCompile}>
                Compilar Projeto
              </button> */}
              {/* <button onClick={handleLaunchEmulator}>Iniciar Emulador</button> */}
              {/* <button onClick={handleRunProject}>Executar Projeto</button> */}
            </div>
            <div className="flex flex-col h-screen">
              <TopBar />
              <BlockProvider>
                <Layout style={{ height: '100%', boxShadow: '0 0 10px rgba(0, 0, 0, 0.1)' }}>
                {/* <Sider  style={{ background: token.colorBgContainer }}>
                  
                </Sider> */}
                  <Splitter style={{ height: '100%' }}>
                    <Splitter.Panel defaultSize="25%" min="15%" max="40%">
                      <LeftPanelWrapper selectBlock={setSelectedBlockId} selectedBlockId={selectedBlockId} />
                    </Splitter.Panel>
                    <Splitter.Panel>
                      <Splitter layout="vertical">
                        <Splitter.Panel>
                          <Sider>
                            <Affix offsetTop={top}>
                              <FloatButttonsGW />
                            </Affix>
                          </Sider>
                          {/* <Layout style={{ padding: '0 24px 24px' }}> */}
                          <Content>
                              <GameWorld />
                          </Content>
                          {/* </Layout> */}
                          
                          <CentralEditor selectedBlockId={selectedBlockId} />
                        </Splitter.Panel>
                        <Splitter.Panel defaultSize="25%" min="25%" max="60%">
                          {/* <Footer> */}
                            <BottomPanel />
                          {/* </Footer> */}
                        </Splitter.Panel>
                      </Splitter>
                    </Splitter.Panel>
                    <Splitter.Panel defaultSize="16%" min="16%" max="40%">
                      <RightPanel selectedBlockId={selectedBlockId} />
                    </Splitter.Panel>
                  </Splitter>
                </Layout>
              </BlockProvider>
              {/* <EmulatorView /> */}
            </div>
        </Layout>
      </ZoomProvider>
    </AntDApp>
    </ErrorBoundary>
  );
};

const LeftPanelWrapper: React.FC<{ selectBlock: (id: number) => void; selectedBlockId: number | null }> = ({ selectBlock, selectedBlockId }) => {
  return <LeftPanel selectBlock={selectBlock} selectedBlockId={selectedBlockId} />;
};

export default Engine;