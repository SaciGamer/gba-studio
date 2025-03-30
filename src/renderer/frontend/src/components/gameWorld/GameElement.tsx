import React, { CSSProperties, useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';

import { AntdToken } from '../common/AntDToken';
import { elementStyle, titleStyle } from './GameElement.styles';
import { Content } from 'antd/es/layout/layout';

const GameElement = ({ id, title, background, x, y, width, height, isSelected, onSelect }: {
  id: any;
  title: any;
  background: any;
  x: any;
  y: any;
  width?: any;
  height?: any;
  isSelected: any;
  onSelect: any;
}) => {
    const { token } = AntdToken();
    // State para mouse sobre o elemento
    const [isHovered, setIsHovered] = useState(false);
    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
    // State para armazenar o tamanho da imagem
    const [elementSize, setElementSize] = useState({ width: 0, height: 0 });

    const computedElementStyle: CSSProperties = elementStyle(transform, background, width || elementSize.width, height || elementSize.height, x, y, isSelected, token);
    const computedTitleStyle: CSSProperties = titleStyle(isSelected, isHovered, token);

    // Pegando informacoes da imagem
    useEffect(() => {
      const img = new Image();
      console.log('..: GameElement criando image:', background);

      img.src = background;
      img.onload = () => {
        const { width, height } = img;
        setElementSize({ width, height });
      };

      img.onerror = () => {
        setElementSize({ width: 240, height: 160 });
        console.error(`Erro ao carregar a imagem: ${background}`);
      };
    
    }, [background]);

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
        onClick={() => onSelect(id)}
        onContextMenu={() => onSelect(id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <Content {...listeners} className="handle-game-element" style={computedTitleStyle}>
          {title}
        </Content>
        {isSelected &&
          <Content style={{...computedTitleStyle, bottom: height - 32, borderTopLeftRadius: '0px', borderTopRightRadius: '0px', borderBottomLeftRadius: token.borderRadius, borderBottomRightRadius: token.borderRadius}}>
            A: X/10
            S: XX/96 
            T: X/30
          </Content>
        }
      </Content>
    );
  };

  export default GameElement;