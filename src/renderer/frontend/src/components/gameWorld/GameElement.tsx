import React, { CSSProperties, useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';

import { AntdToken } from '../common/AntDToken';
import { elementStyle, titleStyle } from './GameElement.styles';
import { Content } from 'antd/es/layout/layout';
import { ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { useBackgroundContext, useSettingsUtilsContext } from '@/providers/contexts/AppContexts';
import imgPlaceholder from '@/img/placeholder.png';

interface GameElementProps {
  element: ISceneSettings;
  isSelected: boolean;
  onSelect: (scene: ISceneSettings) => void;
}

interface imgProps {
  src: string;
  width: number;
  height: number;
};

const GameElement: React.FC<GameElementProps> = ({ element: scene, isSelected, onSelect }) => {
  if (!scene) return null;

  const { token } = AntdToken();
  // State para mouse sobre o elemento
  const [isHovered, setIsHovered] = useState(false);
  // State para armazenar o tamanho da imagem
  // const [elementSize, setElementSize] = useState({ width: 0, height: 0 });
  const { backgrounds, setBackgrounds } = useBackgroundContext();
  const { settingUtils, setSettingUtils } = useSettingsUtilsContext();
  const [imgDefault, setImgDefault] = useState<imgProps>({ src: '', width: 0, height: 0 });

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: scene.id,
    data: scene,
  });

  // Pegando informacoes da imagem
  useEffect(() => {
    if (!backgrounds) return;
    console.log(`..: GameElement backgroundId: ${scene.backgroundId} and all itens:`, backgrounds);
    const backgroundByScene = backgrounds.find(b => b.id === scene.backgroundId);
    console.log('..: GameElement backgroundFileName existe on backgrounds:', backgroundByScene);
    const pathBackground = backgroundByScene?.filename != null && !backgroundByScene._deleted ? `${settingUtils.localImagePath}/${backgrounds.find(b => b.id == scene.backgroundId)?.filename}` : imgPlaceholder;
    console.log('..: GameElement pathBackground:', pathBackground);
    
    const img = new Image();
    img.src = pathBackground;

    img.onload = () => {
      const { src: iSrc, width: iWidth, height: iHeight } = img;
      setImgDefault({ src: iSrc, width: iWidth, height: iHeight });
      console.info(`..: GameElement Imagem carregada:`, { src: pathBackground, width: iWidth, height: iHeight });
    };

    img.onerror = () => {
      setImgDefault({ src: pathBackground, width: 240, height: 160 });
      console.error(`ERROR: GameElement ao carregar a imagem:`, pathBackground);
    };

  }, [scene.backgroundId, backgrounds, settingUtils.localImagePath]);

  const computedElementStyle: CSSProperties = elementStyle(
    transform,
    imgDefault,
    scene.width || imgDefault.width,
    scene.height || imgDefault.height,
    scene.x,
    scene.y,
    isSelected,
    token
  );

  const computedTitleStyle: CSSProperties = titleStyle(isSelected, isHovered, token);

  const contentListNoTitle: Record<string, React.ReactNode> = {
    article: <p>article content</p>,
    app: <p>app content</p>,
    project: <p>project content</p>,
  };

  return (
    // CARD funcionando
    // <Card
    //   ref={setNodeRef}
    //   className="game-element"
    //   bordered={false}
    //   style={computedElementStyle}
    //   onClick={() => onSelect(id)}
    //   onContextMenu={() => onSelect(id)}
    //   onMouseEnter={() => setIsHovered(true)}
    //   onMouseLeave={() => setIsHovered(false)}
    //   cover={<img alt={title} src={background} style={{borderRadius: '0px'}} />}
    //   hoverable
    // >
    //   {/* <Card.Meta 
    //     title={title} 
    //     style={titleStyle(isSelected, isHovered, token)}
    //     {...listeners}
    //     {...attributes}
    //   /> */}
    //   <Meta
    //     // avatar={<Avatar  src={background} />}
    //     title={title} 
    //     // description="This is the description"
    //     {...listeners}
    //     {...attributes}
    //   />
    // </Card>

    <Content
      ref={setNodeRef}
      className="game-element"
      style={computedElementStyle}
      {...attributes}
      onClick={() => onSelect(scene)}
      onContextMenu={(e) => {
        e.preventDefault();
        onSelect(scene);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Content {...listeners} className="handle-game-element" style={computedTitleStyle}>
        {scene.name}
      </Content>
      {isSelected &&
        <Content
          style={{
            ...computedTitleStyle,
            bottom: scene.height - 32,
            borderTopLeftRadius: '0px',
            borderTopRightRadius: '0px',
            borderBottomLeftRadius: token.borderRadius,
            borderBottomRightRadius: token.borderRadius
          }}
        >
          A: X/10
          S: XX/96
          T: X/30
        </Content>
      }
    </Content>
  );
};

export default GameElement;