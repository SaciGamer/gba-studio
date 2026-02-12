import React, { useState, useCallback, useEffect } from 'react';
import { DndContext } from '@dnd-kit/core';
import { v4 as uuidv4 } from 'uuid';
import DragAndDrop from './DragAndDrop'
import Grid from './Grid';
import GameElement from './GameElement';
import { Affix, App, Button, Layout, Row, Space } from 'antd';
import { AntdToken } from '../common/AntDToken';

import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import FloatButttons from '../FloatButtons';
import { Content } from 'antd/es/layout/layout';
import { AimOutlined, AppstoreAddOutlined, AuditOutlined, BgColorsOutlined, BlockOutlined, BorderInnerOutlined, BorderlessTableOutlined, CheckCircleFilled, ClearOutlined, CloseSquareOutlined, DeleteOutlined, EditOutlined, ExpandOutlined, ExperimentOutlined, FormatPainterFilled, FormatPainterOutlined, IeCircleFilled, InfoCircleFilled, InsertRowAboveOutlined, MinusCircleFilled, MinusCircleOutlined, PicLeftOutlined, PictureFilled, PlusSquareFilled, ReloadOutlined, SelectOutlined, SmileOutlined, VerticalAlignMiddleOutlined, ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons';

import imgPlaceholder from '@/img/placeholder.png';
import { ETypeScene, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { useBackgroundContext, useElementContext, useSceneContext, useSettingsUtilsContext } from '@/providers/contexts/AppContexts';
import path from 'path';

enum SubMenuType {
  TOOLTIP = 'tooltip',
  POPOVER = 'popover',
  DROPDOWN = 'dropdown',
}

interface IActions {
  key: string;
  type?: SubMenuType,
  icon: React.ReactNode;
  iconSize?: number;
  tooltip?: string;
  active?: boolean;
  onClick?: () => void;
  subMenu?: {
    type?: SubMenuType;
    items: {
      key: string;
      icon: React.ReactNode;
      iconSize?: number;
      active?: boolean;
      tooltip?: string;
      separator?: boolean;
      onClick: () => void;
    }[];
  };
}

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

  // Actions to FloatButtons
  const actions: IActions[] = [
    {
      key: 'select',
      icon: <AimOutlined />,
      tooltip: 'Select (v)',
      active: settingUtils.activeButton == 'select',
    },
    {
      key: 'add',
      type: SubMenuType.DROPDOWN,
      icon: <AppstoreAddOutlined />,
      active: settingUtils.activeButton == 'add',
      subMenu: {
        items: [
          { key: 'Actor', icon: <AuditOutlined />, tooltip: 'Add Actor(a)', active: settingUtils.activeSubButton == 'Actor', onClick: () => <></> },
          { key: 'Trigger', icon: <PlusSquareFilled />, tooltip: 'Add Trigger(t)', active: settingUtils.activeSubButton == 'Trigger', onClick: () => <></> },
          { key: 'Scene', icon: <PictureFilled />, tooltip: 'Add Scene(s)', active: settingUtils.activeSubButton == 'Scene', onClick: () => <></>},
        ],
      },
    },
    {
      key: 'erase',
      icon: <ClearOutlined />,
      tooltip: 'Eraser (e)',
      active: settingUtils.activeButton == 'erase',
      // onClick: () => setPaintMode('erase')
      subMenu: {
        type: SubMenuType.POPOVER,
        items: [
          { key: '8px', icon: <ExpandOutlined />, iconSize: 16, tooltip: 'Pincel 8 px', active: settingUtils.activeSubButton == '8px', onClick: () => <></> },
          { key: '16px', icon: <ExpandOutlined />, iconSize: 24, tooltip: 'Pincel 16 px', active: settingUtils.activeSubButton == '16px', onClick: () => <></> },
          { key: 'subAction1', icon: <ExperimentOutlined />,  tooltip: 'Add Scene(s)', separator: true, active: settingUtils.activeSubButton == 'subAction1', onClick: () => <></>},
          { key: 'subAction2', icon: <CloseSquareOutlined />, tooltip: 'Add Scene(s)', active: settingUtils.activeSubButton == 'subAction2', onClick: () => <></>},
        ],
      }
    },
    {
      key: 'collision',
      icon: <InsertRowAboveOutlined />,
      tooltip: 'Collisions (c)',
      active: settingUtils.activeButton == 'collision',
      // onClick: () => setPaintMode('erase')
      subMenu: {
        type: SubMenuType.POPOVER,
        items: [
          { key: 'subAction1', icon: <ExpandOutlined />, iconSize: 16, tooltip: 'Pincel 8 px', active: settingUtils.activeSubButton == 'subAction1', onClick: () => <></> },
          { key: 'subAction2', icon: <ExpandOutlined />, iconSize: 24, tooltip: 'Pincel 16 px', active: settingUtils.activeSubButton == 'subAction2', onClick: () => <></> },
          { key: 'subAction3', icon: <VerticalAlignMiddleOutlined />, tooltip: 'Add Scene(s)', separator: true, active: settingUtils.activeSubButton == 'subAction3', onClick: () => <></>},
          { key: 'subAction4', icon: <PicLeftOutlined />, tooltip: 'Add Scene(s)', active: settingUtils.activeSubButton == 'subAction4', onClick: () => <></>},
          { key: 'subAction5', icon: <BlockOutlined />, tooltip: 'Add Scene(s)', active: settingUtils.activeSubButton == 'subAction5', onClick: () => <></>},
        ],
      }
    },
    {
      key: 'colorize',
      icon: <FormatPainterFilled />,
      tooltip: 'Colorize (z)',
      active: settingUtils.activeButton == 'colorize',
      // onClick: () => setPaintMode('erase')
      subMenu: {
        type: SubMenuType.POPOVER,
        items: [
          { key: 'subAction1', icon: <ExpandOutlined />, iconSize: 16, tooltip: 'Sub Action 1', active: settingUtils.activeSubButton == 'subAction1', onClick: () => <></> },
          { key: 'subAction2', icon: <ExpandOutlined />, iconSize: 24, tooltip: 'Sub Action 2', active: settingUtils.activeSubButton == 'subAction2', onClick: () => <></> },
          { key: 'subAction3', icon: <BgColorsOutlined />, tooltip: 'Sub Action 3', active: settingUtils.activeSubButton == 'subAction3', onClick: () => <></>},
          { key: 'subAction4', icon: <FormatPainterOutlined />, tooltip: 'Sub Action 4', separator: true, active: settingUtils.activeSubButton == 'subAction4', onClick: () => <></>},
          { key: 'subAction5', icon: <SelectOutlined />, tooltip: 'Sub Action 5', active: settingUtils.activeSubButton == 'subAction5', onClick: () => <></>},
          { key: 'subAction6', icon: <PicLeftOutlined />, tooltip: 'Sub Action 6', active: settingUtils.activeSubButton == 'subAction6', onClick: () => <></>},
          { key: 'subAction7', icon: <BorderInnerOutlined />, tooltip: 'Sub Action 7', active: settingUtils.activeSubButton == 'subAction7', onClick: () => <></>},
        ],
      }
    }
  ];
  
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
      // const elementsBeyondLimits = scenes.some(el =>
      //   el.id !== active.id && (
      //     el.x + el.width > snappedX ||
      //     el.y + el.height > snappedY
      //   )
      // );

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
    const filename = file.name;

    if (isImage) {
      console.log("O arquivo é uma imagem.");
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          if (e.target && typeof e.target.result === 'string') {
            
            const data = e.target.result.split(',')[1]; // Remove o prefixo "data:image/..."
          
            console.log('..: Imagem filename:', filename);
            console.log('..: Imagem base64:', data);
            
            const response = await window.electronAPI.saveImage(null, filename, data);
    
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
          message.error(`Error trying to save image: ${filename}`);
        }
      };
    
      reader.readAsDataURL(file);
    } else {
      console.log("Tipo de arquivo inválido:", file.type);
      message.error(`Invalid file type ${filename}`);
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
        backgrounds: [{
          layerId: 2,
          backgroundId: backgrounds.filter(b => b.filename == nameImageDefault).map(response => response.id)[0]
        }],
        x: relativeX,
        y: relativeY,
        width: 0,
        height: 0,
        sceneType: ETypeScene.TOPDOWN,
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

  const updateSceneSize = (id: string, width: number, height: number) => {
    setScenes(prev =>
      prev.map(scene =>
        scene.id === id
          ? { ...scene, width, height }
          : scene
      )
    );
  };

  const getImageSize = (src: string): Promise<{width: number, height: number}> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = reject;
      img.src = src;
    });
  };

  // Primeiro useEffect - Gerencia atualizações dos backgrounds
  useEffect(() => {
    const createNewBackgrounds = async () => {
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
        
        const newBackgrounds = await Promise.all(
          pendingBackgrounds.map(async image => {
            const { width, height } = await getImageSize(`${settingUtils.localImagePath}/${image}`);
            return {
              _resourceType: 'background' as const,
              id: uuidv4(),
              autoColor: false,
              name: image.split('.')[0],
              filename: image,
              imageWidth: width,
              imageHeight: height,
              hd: false,
              tileColors: '',
              _saved: false,
              _deleted: false,
            };
          })
        );

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

  // Segundo useEffect - Gerencia fetch inicial e listener para backgrounds
  useEffect(() => {
    const startFetchBackgrounds = async () => {
      try {
        const response = await window.electronAPI.fetchImages('backgrounds');
        if (response.status === 'success') {
          console.log('📥 Recebido backgrounds:', response);
          setSettingUtils(prev => ({ 
            ...prev, 
             images: [ 
              ...(prev.images ?? []),
              ...(response.fileImages ?? [])
            ], 
            localImagePath: response.localPath ?? prev.localImagePath
          }));
        }
      } catch (error) {
        console.error('❌ Erro ao buscar backgrounds:', error);
      }
    };

    const startFetchBackgroundsHD = async () => {
      try {
        const response = await window.electronAPI.fetchImages('backgrounds-hd');
        if (response.status === 'success') {
          console.log('📥 Recebido backgrounds HD:', response);
          setSettingUtils(prev => ({ 
            ...prev, 
            images: [ 
              ...(prev.images ?? []),
              ...(response.fileImages ?? [])
            ], 
            // localImagePath: response.localPath
          }));
        }
      } catch (error) {
        console.error('❌ Erro ao buscar backgrounds HD:', error);
      }
    };

    startFetchBackgrounds();
    startFetchBackgroundsHD();

    // Listener para atualizações
    window.electronAPI.onUpdateImages((updatedImages: any) => {
      console.log('🔄 Novos backgrounds chegando:', updatedImages);
      if (updatedImages.localPath.length > 0 && updatedImages.localPath.includes('backgrounds-hd')) {
         setSettingUtils(prev => ({ 
          ...prev, 
          images: updatedImages.images, 
          localImagePath: updatedImages.localPath
        }));
        console.log('📥 images HD setada:', settingUtilsRef.current.imagesHD);
      } else if (updatedImages.localPath.length > 0 && updatedImages.localPath.includes('backgrounds')) {
         setSettingUtils(prev => ({ 
          ...prev, 
          images: updatedImages.images, 
          localImagePath: updatedImages.localPath 
        }));
        console.log('📥 images setada:', settingUtilsRef.current.images);
      } else  console.log(`❌ images: ${updatedImages.images} não setada na settingsUtils:`, settingUtilsRef.current.images);
      }

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
          <FloatButttons 
            actions={actions} 
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
             !scene._deleted ? 
              <GameElement
                sceneElement={scene}
                isSelected={scene.id === elementSelected?.id}
                onSelect={() => handleSelect(scene)}
                // onResize={(width, height) => updateSceneSize(scene.id, width, height)}
              /> : null
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