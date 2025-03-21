import { CSSProperties } from 'react';
import { CSS, Transform } from '@dnd-kit/utilities';

export const elementStyle = (transform: Transform | null, background: string, width: number, height: number, x: number, y: number, isSelected: boolean, tokenAntD: any): CSSProperties => {
  return {
    transform: CSS.Transform.toString(transform),
    transition: 'background-color 0.3s, box-shadow 0.3s',
    backgroundImage: `url(${background})`,
    // backgroundColor: 'black', // Cor padrão do fundo da imagem!  //token.colorBgContainer, // Usar o valor do token para background
    backgroundSize: 'cover',
    width: `${width}px`,
    height: `${height}px`,
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    borderRadius: '0px',
    // boxShadow: isSelected ? `0 0 0 6px ${token.colorPrimary}` : `0 0 0 2px ${token.colorTextBase}`,
    // border: isSelected ? `6px solid ${token.colorPrimary}` : `2px solid ${token.colorBorder}`,
    outline: isSelected ? `6px solid ${tokenAntD.colorPrimary}` : `2px solid ${tokenAntD.colorBorder}`,
    // outline: isSelected ? `6px solid ${token.colorPrimary}` : '2px solid black',
    zIndex: isSelected ? 1000 : 1,
    imageRendering: 'pixelated',
  };
};

export const titleStyle: (isSelected: boolean, isHovered: boolean, tokenAntD: any) => CSSProperties = (isSelected, isHovered, tokenAntD) => {
  const HOVER_OPACITY = 'B3'; // 70% Opacidade em Hexadecimal
  const NO_HOVER_OPACITY = '33'; // 20% Opacidade em Hexadecimal

  return {
    position: 'absolute',
    bottom: '100%',
    width: '100%',
    // marginLeft: '-24px',
    padding: '5px',
    borderTopLeftRadius: '5px',
    borderTopRightRadius: '5px',
    backgroundColor: isSelected ? tokenAntD.colorPrimaryActive : isHovered ? `${tokenAntD.colorPrimaryHover}` : `${tokenAntD.colorPrimaryBgHover}`,
    transition: 'background-color 0.3s',
    color: `${tokenAntD.colorTextBase}`,
    textAlign: 'center',
    zIndex: -20,
  };
};
