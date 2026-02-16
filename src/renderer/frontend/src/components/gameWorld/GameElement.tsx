import React, { CSSProperties, useState, useEffect, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';

import { AntdToken } from '../common/AntDToken';
import { elementStyle, titleStyle } from './GameElement.styles';
import { Content } from 'antd/es/layout/layout';
import { ETypeScene, ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { useBackgroundContext, useSceneContext, useSettingsUtilsContext } from '@/providers/contexts/AppContexts';
import imgPlaceholder from '@/img/placeholder.png';

interface GameElementProps {
  sceneElement: ISceneSettings;
  isSelected: boolean;
  onSelect: (scene: ISceneSettings) => void;
  // onResize?: (width: number, height: number) => void;
}

interface imgProps {
  src: string;
  width: number;
  height: number;
};

const GameElement: React.FC<GameElementProps> = ({ sceneElement, isSelected, onSelect/*, onResize*/ }) => {
  if (!sceneElement) return null;

  const { token } = AntdToken();
  // State para mouse sobre o elemento
  const [isHovered, setIsHovered] = useState(false);
  // State para armazenar o tamanho da imagem
  // const [elementSize, setElementSize] = useState({ width: 0, height: 0 });
  const { backgrounds, setBackgrounds } = useBackgroundContext();
  const { settingUtils, setSettingUtils } = useSettingsUtilsContext();
  // const [imgDefault, setImgDefault] = useState<imgProps>({ src: '', width: 0, height: 0 });
  const [tilesetImage, setTilesetImage] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    // ctx.clearRect(0, 0, sceneElement.width, sceneElement.height);
    canvas.width = sceneElement.width || 240;
    canvas.height = sceneElement.height || 160;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Desliga o filtro de suavização
    ctx.imageSmoothingEnabled = false;
    
    // Variaveis para calcular tiles
    if ((sceneElement.sceneType === ETypeScene.LOGO || sceneElement.sceneType === ETypeScene.POINTNCLICK) && sceneElement.tileMap && tilesetImage ) {
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

    // desenha backgrounds
    sceneElement.backgrounds?.sort((a, b) => a.layerId - b.layerId).forEach(lbg => {
      const bgData = backgrounds.find(b => b.id === lbg.backgroundId);
      if (bgData) {
        const img = new Image();
        img.src = `${bgData.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath}/${bgData.filename}`;
        img.onload = () => {
          // centralizar
          const x = (sceneElement.width - img.width) / 2;
          const y = (sceneElement.height - img.height) / 2;
          ctx.drawImage(img, x, y);
        };
      }
    });

    // desenha colisões (exemplo)
    sceneElement.collisions?.forEach(c => {
      ctx.fillStyle = "rgba(255,0,0,0.3)";
      ctx.fillRect(c.x, c.y, c.width, c.height);
    });

    // desenha triggers (exemplo)
    sceneElement.triggers?.forEach(t => {
      ctx.strokeStyle = "rgba(0,255,0,0.5)";
      ctx.strokeRect(t.x, t.y, t.width, t.height);
    });

  }, [sceneElement.sceneType, sceneElement.tileMap, tilesetImage, sceneElement.backgrounds, backgrounds, settingUtils.localImagePath]);

  const computedElementStyle: CSSProperties = elementStyle(
    transform,
    sceneElement.x,
    sceneElement.y,
    isSelected,
    token
  );

  const computedTitleStyle: CSSProperties = titleStyle(isSelected, isHovered, token);

  return (
    <Content
      ref={setNodeRef}
      className="game-element"
      style={{...computedElementStyle, width: canvasRef.current?.width, height: canvasRef.current?.height}}
      {...attributes}
      onClick={() => onSelect(sceneElement)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect(sceneElement);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >    
      {/* Renderiza tileMap se disponivel */}
      <canvas ref={canvasRef}/>

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