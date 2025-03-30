import { CSSProperties } from 'react';
import { CSS, Transform } from '@dnd-kit/utilities';

export const elementStyle = (transform: Transform | null, background: string, width: number, height: number, x: number, y: number, isSelected: boolean, tokenAntD: any): CSSProperties => {
  return {
    transform: CSS.Transform.toString(transform),
    transition: 'background-color 0.3s, box-shadow 0.3s',
    backgroundImage: `url(${background})`,
    backgroundColor: 'black', // Cor padrão do fundo da imagem
    // backgroundSize: 'cover', // Extende a imagem para caber
    backgroundRepeat: 'no-repeat', // Evitar repetir a imagem
    width: width < 240 ? 240 : `${width}px`,
    height: height < 160 ? 160 : `${height}px`,
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    borderRadius: '0px',
    // boxShadow: isSelected ? `0 0 0 6px ${tokenAntD.colorPrimary}` : `0 0 0 2px ${tokenAntD.colorTextBase}`,
    // border: isSelected ? `6px solid ${tokenAntD.colorPrimary}` : `2px solid ${tokenAntD.colorBorder}`,
    outline: isSelected ? `4px solid ${tokenAntD.colorPrimary}` : `1px solid ${tokenAntD.colorBorder}`,
    zIndex: isSelected ? 5 : 1,
    imageRendering: 'pixelated',
  };
};

export const titleStyle: (isSelected: boolean, isHovered: boolean, tokenAntD: any) => CSSProperties = (isSelected, isHovered, tokenAntD) => {
  const HOVER_OPACITY = 'B3'; // 70% Opacidade em Hexadecimal
  const NO_HOVER_OPACITY = '00'; // 20% Opacidade em Hexadecimal

  return {
    position: 'absolute',
    bottom: '100%',
    width: '100%',
    // marginLeft: '-24px',
    padding: '5px',
    borderTopLeftRadius: tokenAntD.borderRadius,
    borderTopRightRadius: tokenAntD.borderRadius,
    backgroundColor: isSelected ? tokenAntD.colorPrimaryActive : isHovered ? `${tokenAntD.colorPrimaryHover}${HOVER_OPACITY}` : `${tokenAntD.colorBorder}${NO_HOVER_OPACITY}`,
    transition: 'background-color 0.3s',
    color: `${tokenAntD.colorTextBase}`,
    textAlign: 'center',
    zIndex: -20,
  };
};
