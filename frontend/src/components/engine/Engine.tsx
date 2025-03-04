import React, { useState, useEffect } from 'react';
import { Flex, Splitter, Typography, Layout, notification, Affix, Slider, App as AntDApp, FloatButton, Row, Spin } from 'antd';

// import Layout from './components/Layout.tsx';
import TopBar from '../TopBar.tsx';
import LeftPanel from '../LeftPanel.tsx';
import CentralEditor from '../CentralEditor.tsx';
import RightPanel from '../RightPanel.tsx';
import BottomPanel from '../BottomPanel.tsx';
import { ZoomProvider } from '../ZoomContext.tsx';
import { BlockProvider, useBlockContext } from '../BlockContext.tsx';
import EmulatorView from '../EmulatorView.tsx';

// import './Engine.css';
// import '.././styles.css';


import GameWorld from '../gameWorld/GameWorld.tsx';
import FloatButttonsGW from '../FloatButtonsGW.tsx';
// import { ipcRenderer } from 'electron';

// import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

import { AntdToken } from '../common/AntDToken.ts';
import { useLocation } from 'react-router-dom';
import ErrorBoundary from 'antd/es/alert/ErrorBoundary';
import { LayoutOutlined } from '@ant-design/icons';

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
            {/* <Header > */}
            <TopBar />
            <Layout style={{ flex: 1, overflow: 'hidden' }}>
              {/* </Header> */}
              {/* <Content> */}
              <BlockProvider>
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
                      <LeftPanelWrapper selectBlock={setSelectedBlockId} selectedBlockId={selectedBlockId} />
                    </div>
                  </Splitter.Panel>

                  {/* CENTRO */}
                  <Splitter.Panel /*size={panelSizes[1]}*/>
                    <Splitter layout="vertical">
                      <Content>
                        <GameWorld resetPanelSize={resetPanelSize} setShowFloatButton={setShowFloatButton} showFloatButton={showFloatButton} />
                      </Content>
                      {/* <Splitter.Panel>
                          <CentralEditor selectedBlockId={selectedBlockId} />
                        </Splitter.Panel> */}
                      <Splitter.Panel defaultSize="25%" min={40} max="90%">
                        {/* <Footer> */}
                        <BottomPanel />
                        {/* </Footer> */}
                      </Splitter.Panel>
                    </Splitter>
                  </Splitter.Panel>

                  {/* PAINEL DIREITO */}
                  <Splitter.Panel defaultSize="25%" min={250} size={panelSizes[2]} >
                    <RightPanel selectedBlockId={selectedBlockId} />
                  </Splitter.Panel>
                </Splitter>
              </BlockProvider>
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