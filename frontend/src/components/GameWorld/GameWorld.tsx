import React, { useState, useCallback, useRef, useEffect  } from 'react';
import { DndContext } from '@dnd-kit/core';
import { v4 as uuidv4 } from 'uuid';
import { IElement } from './interfaces/IElements.tsx';
import DragAndDrop from './DragAndDrop.tsx'
import Grid from './Grid.tsx';
import GameElement from './GameElement.tsx';
import { Affix, App, Button, Row, Space } from 'antd';
import { AntdToken } from '../common/AntDToken.ts';

import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import Sider from 'antd/es/layout/Sider';
import FloatButttonsGW from '../FloatButtonsGW.tsx';

let gridValue = 15;
const titleHeight = 82; // Altura do Titulo
const leftLimite = 106

const GameWorld: React.FC<{ resetPanelSize, setShowFloatButton, showFloatButton}> = ({ resetPanelSize, setShowFloatButton, showFloatButton }) => {
  const { token } = AntdToken();

  const [elements, setElements] = useState<IElement[]>([]);
  const [selectedElement, setSelectedElement] = useState(null);
  const [worldSize, setWorldSize] = useState({ width: 800, height: 800 });
  const { message, notification, modal } = App.useApp();
  const [isMovedBackground, setIsMovedBackground] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  
  // Efeito deletar Elemento
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Delete' && selectedElement != null) {
        console.log("..: Confirme deletando elemento!!")
        showConfirm(selectedElement);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedElement]);

  // Lógica para confirmação para deletar elemento
  const showConfirm = (id: string) => {
    modal.confirm({
      title: 'Do you want to delete this item?',
      content: 'This action cannot be undone.',
      onOk() {
        console.log("..: Id do elemento deletado: " + id);
        let element = elements.filter(el => el.id == id);
        // console.log("..: Elemento " + element[0].title);
        notification.success({ message: 'Scene: '+ `${element[0].title}` + ' Deleted' });
        setElements(prevElements => prevElements.filter(el => el.id !== id));
        setSelectedElement(null);
      },
      onCancel() {
        console.log('Cancel');
      },
    });
  };

  // Lógica para deselecionar quando clicar fora do elemento
  const handleClickOutside = (event) => {
    if (!event.target.closest('.game-element')) {
      setSelectedElement(null);
    }
  };

  // Lógica selecionar Objeto
  const handleSelect = useCallback((id) => {
    if (id !== selectedElement) {
      setSelectedElement(id);
    }
  }, [selectedElement]);

  // Movendo tela de trabalho
  const handleMoveBackStart = () => {
    setIsMovedBackground(true);
    console.log(isMovedBackground);
  };

  // Lógica arranste do elemento
  const handleDragEnd = useCallback((event) => {
    const { active, delta } = event;
    const draggedElement = elements.find(el => el.id === active.id);
    if (draggedElement) {
      const newX = draggedElement.x + (delta.x / state.scale);
      const newY = draggedElement.y + (delta.y / state.scale);

      // Ajuste para a grade (assumindo uma grade)
      const gridSize = gridValue;
      const snappedX = Math.max(leftLimite, Math.round(newX / gridSize) * gridSize);
      const snappedY = Math.max(titleHeight, Math.round(newY / gridSize) * gridSize);

      // Verifica se há elementos além dos novos limites
      const elementsBeyondLimits = elements.some(el => 
        el.id !== active.id && (
          el.x + el.width > snappedX || 
          el.y + el.height > snappedY
        )
      );

      // Ajusta o tamanho do mundo baseado na posição do elemento arrastado e se há elementos além dos limites
      const newWorldWidth = Math.max(800, snappedX + draggedElement.width + 100, ...elements.filter(el => el.id !== active.id).map(el => el.x + el.width));
      const newWorldHeight = Math.max(800, snappedY + draggedElement.height + 100, ...elements.filter(el => el.id !== active.id).map(el => el.y + el.height));

      // // Verifique se precisamos expandir o mundo
      // const newWorldWidth = Math.max(800, snappedX + draggedElement.width + 200);
      // const newWorldHeight = Math.max(800, snappedY + draggedElement.height + 200);

      setElements(prev => prev.map(el => 
        el.id === active.id ? { ...el, x: snappedX, y: snappedY } : el
      ));

      if (newWorldWidth !== worldSize.width || newWorldHeight !== worldSize.height) {
        setWorldSize({ width: newWorldWidth, height: newWorldHeight });
      }

      setIsMovedBackground(false);
      console.log("..: teste quantas vezes entra isMovedBackRef: ", isMovedBackground);
    }
  }, [elements, worldSize]);

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

  // Lógica para dropar imagem no projeto
  const handleDrop = (event: DragEvent, zoomScale: number) => {
    event.preventDefault(); // Previne o comportamento padrão de impedir o drop
    const { clientX, clientY } = event;
    // Calcula a posição relativa ao GameWorld
    const gameWorldRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const relativeX = (clientX - gameWorldRect.left) / zoomScale;
    const relativeY = (clientY - gameWorldRect.top) / zoomScale;

    const files = event?.dataTransfer?.files != null ? Array.from(event.dataTransfer.files) : null;

    files?.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target && typeof e.target.result === 'string') {
          const newElement = {
            id: uuidv4(), // Gerar UUID para cada novo elemento
            title: 'SCENE ' + elements.length,
            background: e.target.result,
            x: relativeX, // Coordenada X do mouse
            y: relativeY, // Coordenada Y do mouse
            width: 0,
            height: 0
          };
          setElements(prev => [...prev, newElement]);
          message.success('SCENE ' + elements.length + ' adicionado!');
        }
      };
      reader.readAsDataURL(file);
    });
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

  const handleTransformed = (ref, { scale, positionX, positionY }) => {
    // console.log("..: Mudanca da escala, scale: %.2f, positionX: %d, positionY: %d", scale, positionX, positionY);
    setState({ scale, positionX, positionY });
    if (scale <= 1) {
      // console.log("..: Entrou na escala!");
      setState({ scale, positionX: 0, positionY: 0 });
    }
  };

  return (  
    <DndContext onDragStart={handleMoveBackStart} onDragEnd={handleDragEnd}>
      <Row >
        <Affix offsetTop={65} onChange={(affixed) => console.log('AFIXADO:: ' + affixed)} >
          <FloatButttonsGW onResetPanelSize={resetPanelSize} onShowFloatButton={setShowFloatButton} showFloatButton={showFloatButton}/>
        </Affix>
      </Row>
        
      <TransformWrapper
        initialScale={ 1 }
        minScale={ 0.5 } // Ajuste o nível mínimo de zoom out
        maxScale={ 10 }   // Ajuste o nível máximo de zoom in
        zoomAnimation={{ disabled: true }}
        limitToBounds={ true }
        // minPositionX={ 0 }
        // minPositionY={ 0 }
        // maxPositionX={ worldSize.width }
        // maxPositionY={ worldSize.height }
        onTransformed={handleTransformed}
        wheel={{ disabled: false, smoothStep: 0.005, step: 0.05, activationKeys: ['Control'] }}
        disabled= { isMovedBackground }
        panning={{ 
          disabled: false,
          velocityDisabled: true,  // Desativar a animação de elástico
        }}
        pinch={{ disabled: false }}
      >
        <TransformComponent>
          <div  className="game-world" /*onMouseDown={handleMouseDown}*/ 
            style={{background: token.colorBgContainer, overflow: 'scroll', width: worldSize.width, height: worldSize.height, }}
          >
              <DragAndDrop onDrop={(event) => handleDrop(event, state.scale)} height={worldSize.height + titleHeight} width={worldSize.width + leftLimite} />
              {elements.map((element) => (
                <GameElement 
                  key={element.id}
                  {...element}
                  isSelected={element.id === selectedElement}
                  onSelect={handleSelect}
                />
              ))}
          </div>
          <Grid size={gridValue} width={worldSize.width} height={worldSize.height} marginTop={titleHeight - 33} marginLeft={leftLimite} />
        </TransformComponent>
      </TransformWrapper>
    </DndContext>

  );
};

export default GameWorld;