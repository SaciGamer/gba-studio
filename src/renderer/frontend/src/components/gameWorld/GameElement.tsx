import { useDraggable } from '@dnd-kit/core';
import React, { CSSProperties, useEffect, useRef, useState } from 'react';

import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { PlaySquareTwoTone } from '@ant-design/icons';
import { Content } from 'antd/es/layout/layout';
import { AntdToken } from '../common/AntDToken';
import { elementStyle, titleStyle } from './GameElement.styles';

function drawCamera(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, sceneElement: any) {
  const screenBaseX = 240;
  const screenBaseY = 160;
  
  let x = sceneElement?.cameraPosition?.x || ((canvas.width / 2) - (screenBaseX / 2));
  let y = sceneElement?.cameraPosition?.y || ((canvas.height / 2) - (screenBaseY / 2));

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(149, 149, 149, 0.7)";   // cor da borda
  ctx.strokeRect(x, y, screenBaseX, screenBaseY);   // caixa da câmera
  ctx.fillStyle = "rgba(130, 133, 130, 0.3)";     // espessura da linha
  ctx.fillRect(x, y, screenBaseX, screenBaseY);

  // desenhar X dentro da câmera
  ctx.beginPath();
  ctx.moveTo(x, y);                                 // canto superior esquerdo
  ctx.lineTo(screenBaseX + x, screenBaseY + y);     // canto inferior direito
  ctx.moveTo(screenBaseX + x, y);                   // canto superior direito
  ctx.lineTo(x, screenBaseY + y);                   // canto inferior esquerdo
  ctx.stroke();
}

interface GameElementProps {
  sceneElement: ISceneSettings;
  isSelected: boolean;
  onSelect: (scene: ISceneSettings) => void;
  // onElementHovered: (elementHovered: boolean) => void;
}

const GameElement: React.FC<GameElementProps> = ({ sceneElement, isSelected, onSelect/*, onElementHovered*/ }) => {
  if (!sceneElement) return null;

  const { token } = AntdToken();
  // State para mouse sobre o elemento
  const [isHovered, setIsHovered] = useState(false);
  const { backgrounds, settingUtils, settings, setSettings, userSettings } = useAppContexts();
  
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [draggingInitialPosition, setDraggingInitialPosition] = useState(false);

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: sceneElement.id,
    data: sceneElement,
  });

  // Load tileset image when tileset is selected
  useEffect(() => {
    const loadTilesetImage = async () => {
      if (sceneElement.selectedTilesetId) {
        try {
          const tilesetData = await window.electronAPI.fetchImages('tilesets');
          if (tilesetData.status === 'success' && tilesetData.fileImages) {
            const selectedTilesetFile = tilesetData.fileImages.find((filename: string) =>
              filename.replace(/\.[^/.]+$/, '') === sceneElement.selectedTilesetId
            );
            if (selectedTilesetFile) {
              const imagePath = `${tilesetData.localPath}/${selectedTilesetFile}`;
              const img = new Image();
              img.onload = () => {
                setTilesetImage(img);
              };
              img.src = imagePath;
            }
          }
        } catch (error) {
          console.error('Error loading tileset image:', error);
          setTilesetImage(null);
        }
      } else {
        setTilesetImage(null);
      }
    };

    loadTilesetImage();
  }, [sceneElement.selectedTilesetId]);

  // Render elementos
  useEffect(() => {
    // CANVAS
    let canvas = canvasRef.current;

    if (!canvas) {
      // cria um novo canvas se não existir
      canvas = document.createElement("canvas");
      canvas.width = 0;
      canvas.height = 0;
      // opcional: anexar ao DOM se precisar visualizar
      document.body.appendChild(canvas);
    }

    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    // limpa a cena
    // pega a maior largura e altura entre todas as imagens
    let maxWidth = sceneElement.width;
    let maxHeight = sceneElement.height;

    canvas.width = maxWidth;
    canvas.height = maxHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Desliga o filtro de suavização
    ctx.imageSmoothingEnabled = false;
    // CANVAS END
    
    // TILES Variaveis para calcular tiles
    if ((sceneElement.sceneType === ETypeScene.LOGO || sceneElement.sceneType === ETypeScene.POINTNCLICK) && sceneElement.tileMap && tilesetImage) {
      const tileWidth = 16;
      const tileHeight = 16;
      const tilesPerRow = Math.floor(tilesetImage.naturalWidth / tileWidth);

      // canvas.width = sceneElement.tileMap[0]?.length * tileWidth || 240;
      // canvas.height = sceneElement.tileMap.length * tileHeight || 160;

      // Render each tile
      sceneElement.tileMap.forEach((row: number[], rowIndex: number) => {
        row.forEach((tileIndex: number, colIndex: number) => {
          if (tileIndex >= 0) {
            const sourceX = (tileIndex % tilesPerRow) * tileWidth;
            const sourceY = Math.floor(tileIndex / tilesPerRow) * tileHeight;
            const destX = colIndex * tileWidth;
            const destY = rowIndex * tileHeight;

            ctx.drawImage(
              tilesetImage,
              sourceX, sourceY, tileWidth, tileHeight,
              destX, destY, tileWidth, tileHeight
            );
          }
        });
      });
    } 
    // TILES END

    // BACKGROUNDS desenha: pré-carregar todas
    // sceneElement.backgrounds?.sort((a, b) => a.layerId - b.layerId).forEach(lbg => {
    //   const bgData = backgrounds.find(b => !b._deleted && b.id === lbg.backgroundId);
    //   if (bgData) {
    //     const img = new Image();
    //     img.src = `${bgData.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath}/${bgData.filename}`;
    //     img.onload = () => {
    //       // centralizar
    //       const x = (canvas.width - img.width) / 2;
    //       const y = (canvas.height - img.height) / 2;
    //       ctx.drawImage(img, x, y);
    //     };
    //   }
    // });
    const bgPromises = (sceneElement.backgrounds || []).sort((a, b) => a.layerId - b.layerId).map(lbg => {
      const bgData = backgrounds.find(b => !b._deleted && b.id === lbg.backgroundId);
      if (!bgData) return null;

      return new Promise<HTMLImageElement>(resolve => {
        const img = new Image();
        img.src = `${bgData.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath}/${bgData.filename}`;
        img.onload = () => resolve(img);
      });
    }).filter(Boolean);

    // BACKGROUNDS END

    Promise.all(bgPromises).then(images => {
      images.forEach(img => {
        const x = (canvas.width - img!.width) / 2;
        const y = (canvas.height - img!.height) / 2;
        ctx.drawImage(img!, x, y);
      });
    
      // COLLISIONS desenha
      sceneElement.collisions?.forEach(c => {
        ctx.fillStyle = "rgba(255,0,0,0.3)";
        ctx.fillRect(c.x, c.y, c.width, c.height);
      });
      // COLLISIONS END

      // TRIGGERS desenha triggers
      sceneElement.triggers?.forEach(t => {
        ctx.strokeStyle = "rgba(0,255,0,0.5)";
        ctx.strokeRect(t.x, t.y, t.width, t.height);
      });
      // TRIGGERS END

      // CAMERA desenhar por cima de todas as camadas
      if (sceneElement?.showCamera) {
        drawCamera(ctx, canvas, sceneElement);
      }
      // CAMERA END
    });
  }, [sceneElement.showCamera, sceneElement.sceneType, sceneElement.tileMap, tilesetImage, sceneElement.width, sceneElement.height, sceneElement.backgrounds, backgrounds, settingUtils.localImagePath]);

  const computedElementStyle: CSSProperties = elementStyle(
    transform,
    sceneElement.x,
    sceneElement.y,
    isSelected
  );

  const computedTitleStyle: CSSProperties = titleStyle(isSelected, isHovered, token);

  const handleMoveInitialPlayerPosition = (e:any) => {
    if (!draggingInitialPosition) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const scale = userSettings.zoom / 100 || 1;

    let x = Math.floor(((e.clientX - rect.left) / scale) / 16); // tile X
    let y = Math.floor(((e.clientY - rect.top) / scale) / 16);  // tile Y

    // limita dentro do grid
    const maxX = Math.floor((rect.width / scale) / 16) - 2;
    const maxY = Math.floor((rect.height / scale) / 16) - 2;

    x = Math.max(0, Math.min(x, maxX));
    y = Math.max(0, Math.min(y, maxY));

    // dispara atualização para settings
    setSettings(prev => ({...prev, startX: x, startY: y }));
  };

  const getRotation = (direction: string): number => {
    switch (direction) {
      case 'up': return -90;
      case 'down': return 90;
      case 'left': return 180;
      case 'right': return 0;
      default: return 0;
    }
  };

  const handleHovered = (isHovered: boolean) => {
    setIsHovered(isHovered)
    // onElementHovered(isHovered)
  }

  return (
    <Content
      id={sceneElement?.id}
      ref={setNodeRef}
      className="game-element"
      style={{...computedElementStyle, width: canvasRef.current?.width, height: canvasRef.current?.height}}
      {...attributes}
      onClick={() => onSelect(sceneElement)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect(sceneElement);
      }}
      onMouseEnter={() => handleHovered(true) }
      onMouseLeave={() => handleHovered(false) }
    >
      {/* PLAYER INITIAL POSITION */}
      <Content style={{position: "relative"}} 
        onMouseUp={() => setDraggingInitialPosition(false)}
        onMouseMove={(e) => handleMoveInitialPlayerPosition(e)}
        onMouseLeave={() => setDraggingInitialPosition(false)}
      >
        {/* Renderiza tileMap se disponivel */}
        <canvas ref={canvasRef}/>
        {/* Ícone do player sobreposto */}
        {settings?.startSceneId === sceneElement?.id && (
          <PlaySquareTwoTone twoToneColor={[draggingInitialPosition ? "orange" : "gray", "red"]} 
            rotate={getRotation(settings.startDirection)} 
            style={{
              position: "absolute", 
              left: settings.startX * 16, 
              top: settings.startY * 16, 
              fontSize: 32, 
              color: "red", 
              cursor: draggingInitialPosition ? "grabbing" : "grab" }} 
              onMouseDown={(e) => {
                e.preventDefault();
                setDraggingInitialPosition(true);
            }}
          />
        )}
      </Content>

      {/* TITLE */}
      <Content {...listeners} style={computedTitleStyle}>
        {sceneElement.name}
      </Content>

      {/* BASE INFO */}
      {isSelected &&
        <Content
          style={{
            ...computedTitleStyle,
            bottom: -32,
            borderTopLeftRadius: '0px',
            borderTopRightRadius: '0px',
            borderBottomLeftRadius: token.borderRadius,
            borderBottomRightRadius: token.borderRadius
          }}
        >
          A: X/10
          S: XX/128
          {/* T: X/30 */}
        </Content>
      }
    </Content>
  );
};

export default GameElement;