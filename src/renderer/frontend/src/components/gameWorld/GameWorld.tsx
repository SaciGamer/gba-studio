import { DndContext, DragEndEvent, Modifier } from '@dnd-kit/core';
import { Transform } from '@dnd-kit/utilities';
import { Affix, App, Layout, Row } from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { AntdToken } from '../common/AntDToken';
import DragAndDrop from './DragAndDrop';
import GameElement from './GameElement';

import { AimOutlined, AppstoreAddOutlined, AuditOutlined, BgColorsOutlined, BlockOutlined, BorderInnerOutlined, ClearOutlined, CloseSquareOutlined, ExpandOutlined, ExperimentOutlined, FormatPainterFilled, FormatPainterOutlined, InsertRowAboveOutlined, LayoutOutlined, PicLeftOutlined, PictureFilled, PlusSquareFilled, SelectOutlined, VerticalAlignMiddleOutlined } from '@ant-design/icons';
import { Content } from 'antd/es/layout/layout';
import { ReactZoomPanPinchRef, TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import FloatButttons from '../FloatButtons';

import imgPlaceholder from '@/img/placeholder.png';
import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { ISettingUtils } from '@/providers/contexts/interfaces/ISettingUtils';
import { Spin } from 'antd/lib';

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
  const { 
    scenes, setScenes, scenesRef, 
    backgrounds, setBackgrounds, 
    settingUtils, setSettingUtils,
    elementSelected, setElementSelected, 
    userSettings, setUserSettings
  } = useAppContexts();

  const [worldSize, setWorldSize] = useState({ width: 1920, height: 1080 });
  const [isMovedBackground, setIsMovedBackground] = useState(false);
  const zoomLevel = userSettings.zoom / 100;

  const [updatedImages, setUpdatedImages] = useState<any>();

  const wrapperRef = useRef<ReactZoomPanPinchRef | null>(null);;

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

  const [loading, setLoading] = useState(true);
  
   // função utilitária para calcular o tamanho do mundo
  const calculateWorldSize = (scenes: ISceneSettings[]) => {
    const maxWidth = Math.max(1920, ...scenes.map(el => el.x + el.width));
    const maxHeight = Math.max(1080, ...scenes.map(el => el.y + el.height));
    return { width: maxWidth, height: maxHeight };
  };

  // useEffect para inicialização
  useEffect(() => {
    if (scenes.length > 0) {
      setWorldSize(calculateWorldSize(scenes));
      setLoading(false);
    }
  }, [scenes]);

  // Movendo tela de trabalho
  const handleMoveBackStart = () => {
    setIsMovedBackground(true);
    // console.log(isMovedBackground);
  };

  const zoomModifier: Modifier = ({ transform }: { transform: Transform }) => {
    return {
      ...transform,
      x: Math.round(transform.x / gridValue) * (gridValue / zoomLevel),
      y: Math.round(transform.y / gridValue) * (gridValue / zoomLevel),
    };
  };

  // Lógica arranste do elemento
  const handleDragEnd = (event: DragEndEvent) =>{
    const { active, delta } = event;
    const draggedElement = scenes.find(el => el.id === active.id);
    if (draggedElement) {
      const newX = draggedElement.x + delta.x;
      const newY = draggedElement.y + delta.y;

      // Calcula com limite
      const snappedX = Math.max(leftLimite, newX);
      const snappedY = Math.max(titleHeight, newY);

      // Ajusta a posição do elemento arrastado
      setScenes(prev => prev.map(el => 
        el.id === active.id ? { ...el, x: snappedX, y: snappedY, _saved: false } : el
      ));

      const newWorld = calculateWorldSize([
        ...scenes.filter(el => el.id !== active.id),
        { ...draggedElement, x: snappedX, y: snappedY }
      ]);

      if (newWorld.width !== worldSize.width || newWorld.height !== worldSize.height) {
        setWorldSize(newWorld);
      }

      setIsMovedBackground(false);
    }
  };

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
        width: 240,
        height: 160,
        sceneType: ETypeScene.TOPDOWN,
      };

      setScenes((prev) => [...prev, newElement]);

      return newElement;
    }

  };

  // ZOOOM ------------------------------------------
  const [scaleGradientPixel, setScaleGradientPixel] = useState("1px, transparent 1px");
  const [scaleBorderPixel, setScaleBorderPixel] = useState("16px 16px, 16px 16px, 80px 80px, 80px 80px");

  const handleZoomButtonEffect = () => {
    const current = wrapperRef.current?.instance.transformState;
    if (!current) return;

    const { positionX, positionY, scale } = current;

    const newScale = zoomLevel;
    const ratio = newScale / scale;

    // pega tamanho da viewport
    const viewportWidth = wrapperRef.current?.instance.wrapperComponent?.offsetWidth ?? 0;
    const viewportHeight = wrapperRef.current?.instance.wrapperComponent?.offsetHeight ?? 0;

    // ajusta pan proporcionalmente
    const newX = positionX * ratio + (viewportWidth / 2) * (1 - ratio);
    const newY = positionY * ratio + (viewportHeight / 2) * (1 - ratio);

    wrapperRef.current?.setTransform(newX, newY, newScale);
  };

  const handleChangeTransform = (transform: any) => {
    console.log("transform: ", transform)
    const zoomLevel = Math.trunc(transform.zoom * 100);
    setUserSettings(prev => ({ ...prev, worldScrollX: transform.x, worldScrollY: transform.y, zoom: zoomLevel, _saved: false }));
  }

  useEffect(() => {
    // console.log("Zoom -- level:", zoomLevel);
    handleZoomButtonEffect();
    setSettingUtils(prev => ({...prev, buttonZoomPressed: false}));
  }, [settingUtils.buttonZoomPressed]);

  useEffect(() => {
    // console.log("Grid -- level:", zoomLevel);
    setScaleGradientPixel(`${zoomLevel > 10 ? "0.3px" : zoomLevel > 5 ? "0.5px" : "1px"}, transparent ${zoomLevel > 10 ? "0.3px" : zoomLevel > 5 ? "0.5px" : "1px"}`);
    setScaleBorderPixel(`${zoomLevel > 10 ? "4px 4px, 4px 4px, 40px 40px, 40px 40px" : zoomLevel > 5 ? "8px 8px, 8px 8px, 80px 80px, 80px 80px" : "16px 16px, 16px 16px, 80px 80px, 80px 80px"}`);
  }, [zoomLevel]);

  useEffect(() => {
    if (elementSelected && elementSelected._recenter) {
      const el = document.getElementById(elementSelected.id);
      if (el && wrapperRef.current) {
        // centraliza o elemento na viewport
        wrapperRef.current.zoomToElement(el, userSettings.zoom / 100);
        setTimeout(() => {
          const { positionX, positionY, scale } = wrapperRef.current?.instance.transformState!;
          handleChangeTransform({ x: positionX, y: positionY, zoom: scale });
        }, 600); // tempo da animação
      }
    }
  }, [elementSelected?.id, elementSelected?._recenter]);
  // ZOOOM END ------------------------------------------

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
    }
  };

  const handleMouseClick = (event: any) => {
    if (mousePos && settingUtils.activeSubButton === "Scene") {
      event.stopPropagation();
      console.log("Scene criada em:", mousePos);

      const newScene = handleDropOrCreate(event, zoomLevel);

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

  const getImageSize = (src: string): Promise<{width: number, height: number}> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.width, height: img.height });
      img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
      img.src = src;
    });
  };

  // Função - validação e criação de backgrounds
  const validateAndAddBackgrounds = async (images: string[] | null, localPath: string, hd: boolean) => {
    if (!images) {
      console.log('⚠️ Sem imagens para processar HD: ', hd);
      return [];
    }

    const pending = images.filter(image => {
      const name = image.split('.')[0];
      return !backgrounds.some(bg => bg.name === name && bg.hd === hd);
    });

    if (pending.length === 0) return [];

    console.log('✨ Criando novos backgrounds:', pending);
    const newBackgrounds = await Promise.all(
      pending.map(async image => {
        const { width, height } = await getImageSize(`${localPath}/${image}`);
        return {
          _resourceType: 'background' as const,
          id: uuidv4(),
          autoColor: false,
          name: image.split('.')[0],
          filename: image,
          imageWidth: width,
          imageHeight: height,
          hd,
          tileColors: '',
          _saved: false,
          _deleted: false,
        };
      })
    );

    return newBackgrounds;
  };

  // UseEffect - Valida, cria backgrounds e exclui algumas imagens
  useEffect(() => {
    const updateBackgrounds = async () => {
      const [newNormal, newHD] = await Promise.all([
        validateAndAddBackgrounds(settingUtils.images, settingUtils.localImagePath, false),
        validateAndAddBackgrounds(settingUtils.imagesHD, settingUtils.localImagePathHD, true),
      ]);

      const allImages = [
        ...(settingUtils.images ?? []).map(img => ({ name: img.split('.')[0], hd: false })),
        ...(settingUtils.imagesHD ?? []).map(img => ({ name: img.split('.')[0], hd: true }))
      ];

      setBackgrounds(prev => {
        // marca que precisam ser deletados ou retorna vazio se não há imagens
        const updated = allImages && allImages.length > 0 ? prev.map(bg => {
          const exists = allImages.some(i =>
            i.name.trim().toLowerCase() === bg.name.trim().toLowerCase() &&
            Boolean(i.hd) === Boolean(bg.hd)
          );
          return exists ? bg : { ...bg, _deleted: true, _saved: false };
        }) : [...prev];

        // adiciona novos (se não houver, já retornam [])
        return [...updated, ...newNormal, ...newHD];
      });
    }

    updateBackgrounds();
    
  }, [settingUtils.images, settingUtils.imagesHD]);

  // UseEffect - Gerencia fetch inicial
  useEffect(() => {
    const fetchBackgrounds = async () => {
      try {
        const responseNormal = await window.electronAPI.fetchImages('backgrounds');
        const responseHD = await window.electronAPI.fetchImages('backgrounds-hd');

        setSettingUtils(prev => {
          let next = { ...prev };
          if (responseNormal.status === 'success') {
            next.images = responseNormal.fileImages;
            next.localImagePath = responseNormal.localPath;
          }
          if (responseHD.status === 'success') {
            next.imagesHD = responseHD.fileImages;
            next.localImagePathHD = responseHD.localPath;
          }
          return next;
        });
      } catch (err) {
        console.error("❌ Erro ao buscar backgrounds:", err);
      }
    };

    fetchBackgrounds();
  }, []);

  // UseEffect - Gerencia pastas que foram feitas fetch para inserir novas imagens de background
  useEffect(() => {
    const handlerUpdateBackgrounds = (images: ISettingUtils) => {
      console.log('🔄 Novos backgrounds chegando:', images);
      setUpdatedImages(images);
    };

    window.electronAPI.onUpdateImages(handlerUpdateBackgrounds);
    return () => window.electronAPI.removeListener('updateImages', handlerUpdateBackgrounds);
  }, []);

  useEffect(() => {
    if (!updatedImages) return;

    setSettingUtils(prev => {
      let next = { ...prev };
      if (updatedImages.localPath.endsWith('backgrounds-hd')) {
        next.imagesHD = updatedImages.images ?? prev.imagesHD;
        next.localImagePathHD = updatedImages.localPath || prev.localImagePathHD;
        console.log('📥 images HD setada:', next.imagesHD);
      } else if (updatedImages.localPath.endsWith('backgrounds')) {
        next.images = updatedImages.images ?? prev.images;
        next.localImagePath = updatedImages.localPath || prev.localImagePath;
        console.log('📥 images setada:', next.images);
      }
      return next;
    });
  }, [updatedImages]);

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

  if (loading) {
    return (
      <Layout style={{
        width: '100%',
        height: '100%',
      }}>
        <Spin fullscreen size="large" percent={50} indicator={<LayoutOutlined spin />} />
      </Layout>
    )
  }

  return (
    <DndContext modifiers={[zoomModifier]} onDragStart={handleMoveBackStart} onDragEnd={handleDragEnd}>
      <Row>
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
        ref={wrapperRef}
        initialScale={userSettings.zoom / 100}
        initialPositionX={userSettings.worldScrollX}
        initialPositionY={userSettings.worldScrollY}
        
        minScale={0.25} // Ajuste o nível mínimo de zoom out
        maxScale={16}   // Ajuste o nível máximo de zoom in
        zoomAnimation={{ disabled: true }}

        // limitToBounds={true}
        // minPositionX={ 0 }
        // minPositionY={ 0 }
        // maxPositionX={ worldSize.width }
        // maxPositionY={ worldSize.height }
        // onTransformed={e => handleChangeTransform({ x: e.state.positionX, y: e.state.positionY, zoom: e.state.scale })}
        wheel={{ disabled: false, smoothStep: 0.005, step: 1, activationKeys: ['Control'] }}
        onWheelStop={e => handleChangeTransform({ x: e.state.positionX, y: e.state.positionY, zoom: e.state.scale })}
        disabled={isMovedBackground}
        panning={{
          disabled: false,
          velocityDisabled: false,  // Desativar a animação de elástico
          allowLeftClickPan: false,
          allowMiddleClickPan: true,
          allowRightClickPan: false,
        }}
        onPanningStop={e => handleChangeTransform({ x: e.state.positionX, y: e.state.positionY, zoom: e.state.scale })}
        pinch={{ disabled: true }}
      >
        <TransformComponent wrapperStyle={{ width: "100%", height: "100%", overflow: "hidden" }} 
          contentStyle={{
            position: "relative",
            width: worldSize.width + 100, 
            height: worldSize.height + 50,
            background: token.colorBgContainer, 
          }}>
          <Content 
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={(event) => handleMouseClick(event)}
          >
            {/* Grid */}
            <Content 
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                top: `${titleHeight - 33}px`,
                left: `${leftLimite}px`,
                right: 0,
                bottom: 0,
                backgroundImage: `
                  linear-gradient(to right, rgba(0,0,0,0.1) ${scaleGradientPixel}),
                  linear-gradient(to bottom, rgba(0,0,0,0.1) ${scaleGradientPixel}),
                  linear-gradient(to right, rgba(0,0,0,0.2) ${scaleGradientPixel}),
                  linear-gradient(to bottom, rgba(0,0,0,0.2) ${scaleGradientPixel})
                `,
                backgroundSize: `${scaleBorderPixel}`,
                backgroundAttachment: "local"
              }}
            />
            {/* Content */}
            <Content 
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.currentTarget.style.cursor = "grabbing";
                }
              }}
              onMouseUp={(e) => {
                if (e.button === 1) {
                  e.currentTarget.style.cursor = "default";
                }
              }}
            >
              <DragAndDrop onDrop={(event) => handleDropOrCreate(event, zoomLevel)} /*height={worldSize.height + titleHeight} width={worldSize.width + leftLimite}*/ />
              
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

              <Content style={{ pointerEvents: settingUtils.activeSubButton === "Scene" ? "none" : "auto", }}>
                {scenesRef.current.map(scene => (
                  !scene._deleted ? 
                    <GameElement
                      sceneElement={scene}
                      isSelected={scene.id === elementSelected?.id}
                      onSelect={() => handleSelect(scene)}
                      // onElementHovered={(isHovered: boolean) => handleElementHovered(isHovered)}
                    /> 
                  : null
                ))}
              </Content>
            </Content>
            
          </Content>
        </TransformComponent>
      </TransformWrapper>
    </DndContext>

  );
};

export default GameWorld;