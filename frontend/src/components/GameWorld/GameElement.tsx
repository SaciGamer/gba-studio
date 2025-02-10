import React, { CSSProperties, useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';

import { AntdToken } from '../common/AntDToken.ts';
import { elementStyle, titleStyle } from './GameElement.styles.ts';
import { Card, Divider } from 'antd';
import Meta from 'antd/es/card/Meta';
import Avatar from 'antd/es/avatar/avatar';
import { EditOutlined, EllipsisOutlined, SettingOutlined } from '@ant-design/icons';

const GameElement = ({ id, title, background, x, y, width, height, isSelected, onSelect }) => {
    // State para mouse sobre o elemento
    const [isHovered, setIsHovered] = useState(false);
    const { attributes, listeners, setNodeRef, transform } = useDraggable({ id });
    // State para armazenar o tamanho da imagem
    const [elementSize, setElementSize] = useState({ width: 0, height: 0 });
    const { token } = AntdToken();

    const computedElementStyle: CSSProperties = elementStyle(transform, background, elementSize.width || width, elementSize.height || height, x, y, isSelected, token);
    const computedTitleStyle: CSSProperties = titleStyle(isSelected, isHovered, token);

    // Pegando informacoes da imagem
    useEffect(() => {
        const img = new Image();
        img.src = background;
        img.onload = () => {
          const { width, height } = img;
          setElementSize({ width, height });
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
      
      <div 
        ref={setNodeRef} 
        className="game-element"
        style={computedElementStyle} 
        {...attributes} 
        onClick={() => onSelect(id)}
        onContextMenu={() => onSelect(id)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div {...listeners} className="handle" style={computedTitleStyle}>
          {title}
        </div>
        <div style={{...computedTitleStyle, bottom: '-4.5vh', borderTopLeftRadius: '0px', borderTopRightRadius: '0px', borderBottomLeftRadius: '15px', borderBottomRightRadius: '15px'}}>
          <p>A: X/10 S: XX/96 T: X/30</p>
        </div>
      </div>
    );
  };

  export default GameElement;