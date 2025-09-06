import React, { useState, useCallback, useEffect } from 'react';
import { DndContext } from '@dnd-kit/core';
import { v4 as uuidv4 } from 'uuid';
import DragAndDrop from './DragAndDrop'
import Grid from './Grid';
import GameElement from './GameElement';
import { Affix, App, Button, Layout, Row, Space } from 'antd';
import { AntdToken } from '../common/AntDToken';

import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import FloatButttonsGW from '../FloatButtonsGW';
import { Content } from 'antd/es/layout/layout';
import { CheckCircleFilled, IeCircleFilled, InfoCircleFilled, MinusCircleFilled, MinusCircleOutlined, SmileOutlined } from '@ant-design/icons';

import imgPlaceholder from '@/img/placeholder.png';
import { ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { useBackgroundContext, useElementContext, useSceneContext, useSettingsUtilsContext } from '@/providers/contexts/AppContexts';
import path from 'path';

let gridValue = 16;
const titleHeight = 82; // Altura do Titulo
const leftLimite = 106

interface IGameWorld {
  resetPanelSize: any;
  setShowFloatButton: any;
  showFloatButton: boolean;
}

const GameWorld: React.FC<IGameWorld> = ({ resetPanelSize, setShowFloatButton, showFloatButton }) => {
  const { token } = AntdToken();
  const { message, notification, modal } = App.useApp();
  const { scenes, setScenes } = useSceneContext();
  const { backgrounds, setBackgrounds } = useBackgroundContext();
  const { settingUtils, setSettingUtils, settingUtilsRef } = useSettingsUtilsContext();
  const { elementSelected, setElementSelected } = useElementContext();

  const [worldSize, setWorldSize] = useState({ width: 800, height: 800 });
  const [isMovedBackground, setIsMovedBackground] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  let isDeleting = false;

  // Deletar Elemento
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' && elementSelected != null && !isDeleting) {
        console.log("..: Confirme deletando elemento!!", isDeleting)
        isDeleting = true;
        showConfirm(elementSelected);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [elementSelected]);

  // Carregar Elementos do BE
  // useEffect(() => {
    // const startFetchElements = async () => {
    //   try {
    //     const response = await window.electronAPI.fetchSettings('scene');
    //     if (response.status === 'success') {
    //       console.log('..: Response fetchElements:', response.settings);
    //       // Atualize a interface com os elementos
    //       setScenes(response.settings as ISceneSettings[]);
    //     } else {
    //       console.error('Error fetchElements:', response.message);
    //     }
    //   } catch (error) {
    //     console.error('Error catch fetchElements:', error);
    //   }
    // };

    // startFetchElements();

    // Configurar listener para atualizações
    // window.electronAPI.updateSettings((updatedSettings: any) => {
    //   console.log('..: onUpdateSettings scenes chegando:', updatedSettings);
    //   setScenes(updatedSettings); // Atualizar lista de elementos
    // });
  // }, []);

  // Lógica para confirmação para deletar elemento
  const showConfirm = (elementDelete: ISceneSettings) => {
    console.log("..: Show modal elemento!!", isDeleting)
    modal.confirm({
      title: `Do you want to delete ${elementDelete.name} item?`,
      content: 'This action cannot be undone.',
      onOk() {
        console.log("..: Id do elemento deletado digitalmente: ", elementDelete.id);
        // let element = scenes.filter(el => el.id == elementDelete.id);
        // setScenes(prevElements => prevElements.filter(el => el.id !== elementDelete.id));
        // Marca como deletado digitalmente
        setScenes(prevElements =>
          prevElements.map(el =>
            el.id === elementDelete.id
              ? { ...el, _saved: false, _deleted: true }
              : el
          )
        );
        setElementSelected(null);
        
        // window.electronAPI.deleteSettings('scene', elementDelete.id);
        
        notification.success({ 
          message: 'Scene: ' + `${elementDelete.name}` + ' Deleted',
          showProgress: true,
        });
        isDeleting = false;
      },
      onCancel() {
        console.log('Cancel');
        isDeleting = false;
      },
    });
  };

  // Lógica para deselecionar quando clicar fora do elemento
  const handleClickOutside = (event: any) => {
    if (!event.target.closest('.game-element')) {
      setElementSelected(null);
    }
  };

  // Lógica selecionar Objeto
  const handleSelect = useCallback((scene: any) => {
    if (scene.id !== elementSelected?.id) {
      console.log("..: HandleSelect:", scene);
      setElementSelected(scene)
    }
  }, [elementSelected?.id]);

  // Movendo tela de trabalho
  const handleMoveBackStart = () => {
    setIsMovedBackground(true);
    console.log(isMovedBackground);
  };

  // Lógica arranste do elemento
  const handleDragEnd = useCallback((event: any) => {
    const { active, delta } = event;
    const draggedElement = scenes.find(el => el.id === active.id);
    if (draggedElement) {
      const newX = draggedElement.x + (delta.x / state.scale);
      const newY = draggedElement.y + (delta.y / state.scale);

      // Ajuste para a grade (assumindo uma grade)
      const gridSize = gridValue;
      const snappedX = Math.max(leftLimite, Math.round(newX / gridSize) * gridSize);
      const snappedY = Math.max(titleHeight, Math.round(newY / gridSize) * gridSize);

      // Verifica se há elementos além dos novos limites
      const elementsBeyondLimits = scenes.some(el =>
        el.id !== active.id && (
          el.x + el.width > snappedX ||
          el.y + el.height > snappedY
        )
      );

      // Ajusta o tamanho do mundo baseado na posição do elemento arrastado e se há elementos além dos limites
      const newWorldWidth = Math.max(800, snappedX + draggedElement.width + 100, ...scenes.filter(el => el.id !== active.id).map(el => el.x + el.width));
      const newWorldHeight = Math.max(800, snappedY + draggedElement.height + 100, ...scenes.filter(el => el.id !== active.id).map(el => el.y + el.height));

      // // Verifique se precisamos expandir o mundo
      // const newWorldWidth = Math.max(800, snappedX + draggedElement.width + 200);
      // const newWorldHeight = Math.max(800, snappedY + draggedElement.height + 200);

      // Ajusta a posição do elemento arrastado e pede atualização no BE
      setScenes(prev => prev.map(el => {
        if (el.id === active.id) {
          const elementUpdated = { ...el, x: snappedX, y: snappedY, _saved: false };
          // window.electronAPI.updateSettings('scene', elementUpdated);
          return { ...elementUpdated };
        }
        return el;
      }));

      if (newWorldWidth !== worldSize.width || newWorldHeight !== worldSize.height) {
        setWorldSize({ width: newWorldWidth, height: newWorldHeight });
      }

      setIsMovedBackground(false);
      console.log("..: teste quantas vezes entra isMovedBackRef: ", isMovedBackground);
    }
  }, [scenes, worldSize]);

  useEffect(() => {
    console.log('Scenes atualizado GameWorld.tsx:', scenes);
  }, [scenes]);

  // Lógica para mover barras de rolagem com botão esquerdo do mouse
  // const handleMouseDown = useCallback((event) => {
  //   // console.log("Mouse Down Event:", event);
  //   if (event.button === 1 || ((event.button === 0 || event.button === 2) && !event.target.closest('.game-element'))) {
  //     event.preventDefault();

  //     const gameWorld = event.currentTarget as HTMLElement;

  //     let startX = event.clientX;
  //     let startY = event.clientY;
  //     let scrollLeft = gameWorld.scrollLeft;
  //     let scrollTop = gameWorld.scrollTop;

  //     const onMouseMove = (e: MouseEvent) => {
  //       document.body.style.cursor = 'grabbing';
  //       setIsMovedBackground(true);
  //       // console.log("..: Entrou no Centrado MOVENDO");
  //       const deltaX = (e.clientX - startX); // Amplifica o movimento
  //       const deltaY = (e.clientY - startY); // Amplifica o movimento
  //       // console.log(`Grabbing: ${deltaX} ${deltaY}`); // Logs para ver os valores de deltaX e deltaY

  //       gameWorld.scrollTo({
  //         left: scrollLeft - deltaX,
  //         top: scrollTop - deltaY,
  //         behavior: 'instant' // Instantâneo para evitar suavidade indesejada
  //       });
  //       // console.log(`Grabbing GameWorld: ${gameWorld.scrollLeft} ${gameWorld.scrollTop}`)
  //     };

  //     const onMouseUp = () => {
  //       // console.log("..: SOLTOU o mouse");
  //       document.removeEventListener('mousemove', onMouseMove);
  //       document.removeEventListener('mouseup', onMouseUp);
  //       document.body.style.cursor = 'default';

  //       // console.log("..: isMovedBackRef:", isMovedBackRef)
  //       if (!isMovedBackRef) {
  //         handleClickOutside(event);
  //       }
  //       setIsMovedBackground(false);
  //     };

  //     // console.log("..: Lado de fora Centrado");
  //     document.addEventListener('mousemove', onMouseMove);
  //     document.addEventListener('mouseup', onMouseUp);
  //   } else if (event.button === 1) {
  //     event.preventDefault();
  //     console.log("..: Removendo função do Botão central no elemento :..");
  //   }
  // }, []);

  const handleImageUpload = async (file: File) => {
    const isImage = file.type.startsWith("image/");
    const fileName = file.name;

    if (isImage) {
      console.log("O arquivo é uma imagem.");
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          if (e.target && typeof e.target.result === 'string') {
            
            const data = e.target.result.split(',')[1]; // Remove o prefixo "data:image/..."
          
            console.log('..: Imagem fileName:', fileName);
            console.log('..: Imagem base64:', data);
            
            const response = await window.electronAPI.saveImage(null, fileName, data);
    
            if (response.status === 'success') {
              // alert(response.message);
              notification.success({
                message: `Saving image`,
                description:
                  `Image copied successfully: ${response.message}`,
                  // icon: <CheckCircleFilled style={{ color: token.colorSuccess }} />,
                showProgress: true,
                onClick: () => handleOpenProjectFolderWithPath(response.message),
              });
            } else {
              // alert(response.message);
              notification.error({
                message: `Saving image - ${response.message}`,
                description:
                  'Something went wrong',
                  // icon: <InfoCircleFilled style={{ color: token.colorError }} />,
                showProgress: true,
              });
            }
          }
        } catch (error) {
          console.error('Error trying to save image:', error);
          message.error(`Error trying to save image: ${fileName}`);
        }
      };
    
      reader.readAsDataURL(file);
    } else {
      console.log("Tipo de arquivo inválido:", file.type);
      message.error(`Invalid file type ${fileName}`);
    }
  };

  // Lógica para dropar imagem no projeto
  const handleDropOrCreate = (event: DragEvent, zoomScale: number) => {
    event.preventDefault(); // Previne o comportamento padrão de impedir o drop
    
    const { clientX, clientY } = event;
    // Calcula a posição relativa ao GameWorld
    const gameWorldRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    let relativeX = (clientX - gameWorldRect.left) / zoomScale;
    let relativeY = (clientY - gameWorldRect.top) / zoomScale;

    // Garante que as coordenadas fiquem dentro da grid
    relativeX = Math.max(leftLimite, relativeX - (240 / 2));
    relativeY = Math.max(titleHeight - 33, relativeY - (160 / 2));

    const files = event?.dataTransfer?.files != null ? Array.from(event.dataTransfer.files) : null;

    if(files && files.length > 0) {
      files?.forEach(file => {
        handleImageUpload(file);
        // TODO talvez fazer um drop de imagem criando cena
        // const reader = new FileReader();
        // reader.onload = (e) => {
        //   if (e.target && typeof e.target.result === 'string') {
        //     const newElement = {
        //       id: uuidv4(), // Gerar UUID para cada novo elemento
        //       title: 'SCENE ' + elements.length,
        //       background: e.target.result,
        //       x: relativeX, // Coordenada X do mouse
        //       y: relativeY, // Coordenada Y do mouse
        //       width: 0,
        //       height: 0
        //     };
        //     setElements(prev => [...prev, newElement]);
        //     message.success('SCENE ' + elements.length + ' adicionado!');
        //   }
        // };
        // reader.readAsDataURL(file);
      });
    } else {
      // Caso não seja drop criar nova scena
      const index = scenes.length === 0 ? 0 : scenes[scenes.length - 1]._index + 1;
      console.log('..: files images', settingUtils.images);
      console.log('..: path backgrounds', `${settingUtils.localImagePath?.replace(/\\/g, '/')}/${settingUtils.images?.[0]}`);
      const background = settingUtils.images?.length != 0 ? `${settingUtils.localImagePath?.replace(/\\/g, '/')}/${settingUtils.images?.[0]}` : imgPlaceholder;
      const nameImageDefault = settingUtils.images ? settingUtils.images[0] : imgPlaceholder;
      const newElement = {
        id: uuidv4(),
        _resourceType: 'scene',
        _index: index,
        _saved: false,
        _deleted: false,
        name: 'SCENE ' + index,
        backgroundId: backgrounds.filter(b => b.filename == nameImageDefault).map(response => response.id)[0],
        background: background, // caminho da imagem
        x: relativeX,
        y: relativeY,
        width: 0,
        height: 0,
      };

      setScenes((prev) => [...prev, newElement]);

      return newElement;
    }

  };

  // ZOOOM ------------------------------------------
  // const handleZoom = (zoom: boolean) => {
  //   setZoomLevel((prevZoom) => zoom ? Math.min(Math.max(0.5, prevZoom + 0.1), 8) : Math.min(Math.max(0.5, prevZoom - 0.1), 8));
  // };

  // const handleZoomDefault = () => {
  //   // console.log("..: Zoom Default", zoomLevel)
  //   setZoomLevel(1);
  // };

  // useEffect(() => {
  //   const handleKeyDown = (event: KeyboardEvent) => {
  //     if (event.ctrlKey) {
  //       event.preventDefault();
  //       if (event.key === '+' || event.key === '=') {
  //         handleZoom(true);
  //       } else if (event.key === '-') {
  //         handleZoom(false);
  //       } else if (event.key === '0') {
  //         handleZoomDefault();
  //       }
  //     }
  //   };

  //   const handleWheel = (event: WheelEvent) => {
  //     if (event.ctrlKey) {
  //       const delta = Math.sign(event.deltaY) * -0.1;
  //       setZoomLevel((prevZoom) => Math.min(Math.max(0.5, prevZoom + delta), 8));
  //     }
  //   };

  //   window.addEventListener('keydown', handleKeyDown);
  //   window.addEventListener('wheel', handleWheel);

  //   return () => {
  //     window.removeEventListener('keydown', handleKeyDown);
  //     window.removeEventListener('wheel', handleWheel);
  //   };
  // }, []);

  const [state, setState] = useState({ scale: 1, positionX: 0, positionY: 0 });

  const handleTransformed = (ref: any, { scale, positionX, positionY }: { scale: number, positionX: number, positionY: number }) => {
    // console.log("..: Mudanca da escala, scale: %.2f, positionX: %d, positionY: %d", scale, positionX, positionY);
    setState({ scale, positionX, positionY });
    if (scale <= 1) {
      // console.log("..: Entrou na escala!");
      setState({ scale, positionX: 0, positionY: 0 });
    }
  };

  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null
  );

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    // console.log('..: handleMouseMove activeSubButton:', activeSubButton);
    if (settingUtils.activeSubButton === "Scene") {
      // Calcula as coordenadas do retângulo
      const rectX = e.nativeEvent.offsetX - 120*1.5; // Centraliza o retângulo
      const rectY = e.nativeEvent.offsetY - 80*1.5;  // Centraliza o retângulo
      setMousePos({ x: rectX, y: rectY });

      // const contentRect = e.currentTarget.getBoundingClientRect();
      // setMousePos({
      //   x: e.clientX - contentRect.left * 2,
      //   y: e.clientY - contentRect.top * 2,
      // });
    }
  };

  const handleMouseClick = (event: any) => {
    if (mousePos && settingUtils.activeSubButton === "Scene") {
      event.stopPropagation();
      console.log("Scene criada em:", mousePos);

      const newScene = handleDropOrCreate(event, state.scale);

      notification.success({
        message: 'Create New Scene',
        description: `${newScene?.name} created!`,
        showProgress: true,
      });
    } else {
      handleClickOutside(event);
    }
  };

  const handleOpenProjectFolderWithPath = (path:string) => {
    console.log(`..: Open Project Folder: ${path}`);
    window.electronAPI.send('open-project-folder', path);
  }

  const handleMouseLeave = () => {
    setMousePos(null); // Remove a silhueta quando o mouse sai da área
  };

  // Primeiro useEffect - Gerencia atualizações dos backgrounds
  useEffect(() => {
    const createNewBackgrounds = () => {
      if (!settingUtils.images) {
        console.log('⚠️ Sem imagens para processar');
        return;
      }
      
      console.log('🔍 Verificando backgrounds para:', settingUtils.images);
      
      // Processa todos os backgrounds de uma vez
      const pendingBackgrounds = settingUtils.images.filter(image => {
        const name = image.split('.')[0];
        return !backgrounds.some(bg => bg.name === name);
      });

      if (pendingBackgrounds.length > 0) {
        console.log('✨ Criando novos backgrounds:', pendingBackgrounds);
        
        const newBackgrounds = pendingBackgrounds.map(image => ({
          _resourceType: 'background' as const,
          id: uuidv4(),
          autoColor: false,
          name: image.split('.')[0],
          filename: image,
          imageWidth: 0,
          imageHeight: 0,
          tileColors: '',
          _saved: false,
          _deleted: false,
        }));

        setBackgrounds(prev => [...prev, ...newBackgrounds]);
      }

      // Separa a extensão das imagens
      const validNames = settingUtils.images.map(image => image.split('.')[0]);

      // Marca digitalmente como deletados os backgrounds que não existem mais nas imagens
      const updatedBackgrounds = backgrounds.map(bg => {
        if (!validNames.includes(bg.name)) {
          return { ...bg, _deleted: true, _saved: false };
        }
        return bg;
      });

      // Se houve alguma alteração, atualiza o estado
      if (
        backgrounds.some(bg => !validNames.includes(bg.name) && !bg._deleted) ||
        backgrounds.length !== updatedBackgrounds.length
      ) {
        setBackgrounds(updatedBackgrounds);
      }
    };

    createNewBackgrounds();
  }, [settingUtils.images]);

  // Segundo useEffect - Gerencia fetch inicial e listener
  useEffect(() => {
    const startFetchBackgrounds = async () => {
      try {
        const response = await window.electronAPI.fetchImages('backgrounds');
        if (response.status === 'success') {
          console.log('📥 Recebido backgrounds:', response);
          setSettingUtils(prev => ({ 
            ...prev, 
            images: response.fileImages, 
            localImagePath: response.localPath 
          }));
        }
      } catch (error) {
        console.error('❌ Erro ao buscar backgrounds:', error);
      }
    };

    startFetchBackgrounds();

    // Listener para atualizações
    window.electronAPI.onUpdateImages((updatedImages: any) => {
      console.log('🔄 Novos backgrounds chegando:', updatedImages);
      setSettingUtils(prev => ({ 
        ...prev, 
        images: updatedImages.images, 
        localImagePath: updatedImages.localPath 
      }));
      console.log('📥 images setada:', settingUtilsRef.current.images);
    });

  }, []);

  // function getImageInfo(imagePath:) {
  //   return new Promise((resolve, reject) => {
  //       const img = new Image(); // Cria um objeto de imagem
  //       img.src = imagePath; // Define o caminho da imagem

  //       // Quando a imagem for carregada com sucesso
  //       img.onload = () => {
  //           resolve({
  //               filename: imagePath.split('/').pop(), // Extrai o nome do arquivo do caminho
  //               imageWidth: img.width, // Largura da imagem
  //               imageHeight: img.height, // Altura da imagem
  //           });
  //       };

  //       // Em caso de erro ao carregar a imagem
  //       img.onerror = (err) => reject(`Erro ao carregar a imagem: ${err}`);
  //   });
  // }

  return (
    <DndContext onDragStart={handleMoveBackStart} onDragEnd={handleDragEnd}>
      <Row >
        <Affix offsetTop={65} onChange={(affixed) => console.log('AFIXADO:: ' + affixed)} >
          <FloatButttonsGW 
            onResetPanelSize={resetPanelSize} 
            onShowFloatButton={setShowFloatButton} 
            showFloatButton={showFloatButton}
          />
        </Affix>
      </Row>

      <TransformWrapper
        initialScale={1}
        minScale={0.5} // Ajuste o nível mínimo de zoom out
        maxScale={10}   // Ajuste o nível máximo de zoom in
        zoomAnimation={{ disabled: true }}
        limitToBounds={true}
        // minPositionX={ 0 }
        // minPositionY={ 0 }
        // maxPositionX={ worldSize.width }
        // maxPositionY={ worldSize.height }
        onTransformed={handleTransformed}
        wheel={{ disabled: false, smoothStep: 0.005, step: 0.05, activationKeys: ['Control'] }}
        disabled={isMovedBackground}
        panning={{
          disabled: false,
          velocityDisabled: true,  // Desativar a animação de elástico
        }}
        pinch={{ disabled: false }}
      >
        <Content
          style={{
            width: "100%",
            height: "100%",
            position: "relative",
            backgroundColor: token.colorBgContainer,
            // overflow: "hidden",
            // pointerEvents: activeSubButton.activeSubButton === "Scene" ? "none" : "auto",
          }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={(event) => handleMouseClick(event)}
        >
          <Grid size={gridValue} marginTop={titleHeight - 33} marginLeft={leftLimite} />
          <DragAndDrop onDrop={(event) => handleDropOrCreate(event, state.scale)} /*height={worldSize.height + titleHeight} width={worldSize.width + leftLimite}*/ />

          {/* Retângulo que segue o mouse */}
          {mousePos && settingUtils.activeSubButton === "Scene" && (
            <Content
              style={{
                position: "absolute",
                width: 240*1.5+`px`,
                height: 160*1.5+"px",
                left: `${mousePos.x}px`,
                top: `${mousePos.y}px`,
                borderRadius: token.borderRadius,
                backgroundColor: `${token.colorBgMask}`, // Silhueta semitransparente
                border: `2px dashed ${token.colorPrimary}`, // Bordas destacadas
                pointerEvents: "none", // Ignora interação com o retângulo
                zIndex: 6,
              }}
            />
          )}

          <Content style={{ backgroundColor: 'red', pointerEvents: settingUtils.activeSubButton === "Scene" ? "none" : "auto", }}>
            {scenes.map((scene) => (
             scene._deleted ? '' : 
              <GameElement
                element={scene}
                isSelected={scene.id === elementSelected?.id}
                onSelect={() => handleSelect(scene)}
              />
            ))}
          </Content>

        </Content>
        <TransformComponent>
          <Space className="game-world" /*onMouseDown={handleMouseDown}*/
          //  onMouseMove={handleMouseMove}
          //  onMouseLeave={handleMouseLeave}
          //  onClick={handleMouseClick}
            style={{ background: token.colorBgContainer, overflow: 'scroll', width: worldSize.width, height: worldSize.height, }}
          >
            {/* TODO DragAndDrop para imagens */}
            {/* <DragAndDrop onDrop={(event) => handleDrop(event, state.scale)} height={worldSize.height + titleHeight} width={worldSize.width + leftLimite} />
            {elements.map((element) => (
              <GameElement
                key={element.id}
                {...element}
                isSelected={element.id === selectedElement}
                onSelect={handleSelect}
              />
            ))} */}
          </Space>
          {/* <Grid size={gridValue} width={worldSize.width} height={worldSize.height} marginTop={titleHeight - 33} marginLeft={leftLimite} /> */}
        </TransformComponent>
      </TransformWrapper>
    </DndContext>

  );
};

export default GameWorld;