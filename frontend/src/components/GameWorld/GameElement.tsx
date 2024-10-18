import React, { CSSProperties, useState, useEffect } from 'react';
import { useDraggable } from '@dnd-kit/core';

import { AntdToken } from '../common/AntDToken.ts';
import { elementStyle, titleStyle } from './GameElement.styles.ts';

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

    return (
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
      </div>
    );
  };

  export default GameElement;