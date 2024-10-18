import React, { useState, useEffect } from 'react';
import { Flex, Splitter, Typography, Layout, notification, Affix } from 'antd';

// import Layout from './components/Layout.tsx';
import TopBar from './components/TopBar.tsx';
import LeftPanel from './components/LeftPanel.tsx';
import CentralEditor from './components/CentralEditor.tsx';
import RightPanel from './components/RightPanel.tsx';
import BottomPanel from './components/BottomPanel.tsx';
import { ZoomProvider } from './components/ZoomContext.tsx';
import { BlockProvider, useBlockContext } from './components/BlockContext.tsx';
import EmulatorView from './components/EmulatorView.tsx';
import Themes from './components/themes/Themes.tsx';
import { App as AntDApp, ConfigProvider} from 'antd';

// import './App.css';
// import './styles.css';
import './components/themes/globalStyles.css';  // Importe o arquivo CSS global

import GameWorld from './components/GameWorld/GameWorld.tsx';
import FloatButttonsGW from './components/FloatButtonsGW.tsx';
// import { ipcRenderer } from 'electron';

// import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

const { Header, Sider, Content, Footer } = Layout;

const App: React.FC = () => {
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
  const [theme, setTheme] = useState(Themes.light);

  useEffect(() => {
    if (window.electronAPI) {  // Verifica se electronAPI está definido
        window.electronAPI.on('change-theme', (event, newTheme) => {
        console.log("..: mudando tema: data-theme=%s", newTheme);
        // document.body.className = `theme-${newTheme}`;
        setTheme(Themes[newTheme]);
        document.documentElement.setAttribute(`data-theme`, newTheme);
      });

      return () => {
          window.electronAPI.removeListener('change-theme', (event, newTheme) => {
          // document.body.className = `theme-${theme}`;
          document.documentElement.setAttribute('data-theme', newTheme);
        });
      };
    } else { 
      console.error('window.electronAPI is undefined');  // Mensagem de erro se não definido
    }
  }, []);
  // ------------------------------------------------------------

  const [top, setTop] = React.useState<number>(80);

  return (
    <ConfigProvider theme={theme}>
      <AntDApp>
        <ZoomProvider>
          <div>
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
                          <Content>
                              <GameWorld />
                          </Content>
                          {/* <CentralEditor selectedBlockId={selectedBlockId} /> */}
                        </Splitter.Panel>
                        <Splitter.Panel defaultSize="25%" min="25%" max="60%">
                          {/* <Footer> */}
                            <BottomPanel />
                          {/* </Footer> */}
                        </Splitter.Panel>
                      </Splitter>
                    </Splitter.Panel>
                    <Splitter.Panel defaultSize="16%" min="16%" max="40%">
                      <Sider>
                        <RightPanel selectedBlockId={selectedBlockId} />
                      </Sider>
                    </Splitter.Panel>
                  </Splitter>
                </Layout>
              </BlockProvider>
              {/* <EmulatorView /> */}
            </div>
          </div>
        </ZoomProvider>
        {/* </TransformWrapper> */}
      </AntDApp>
     </ConfigProvider>
  );
};

const LeftPanelWrapper: React.FC<{ selectBlock: (id: number) => void; selectedBlockId: number | null }> = ({ selectBlock, selectedBlockId }) => {
  return <LeftPanel selectBlock={selectBlock} selectedBlockId={selectedBlockId} />;
};

export default App;