import { CSS, Transform } from '@dnd-kit/utilities';
import { CSSProperties } from 'react';
import { AntdToken } from '../common/AntDToken';

export const elementStyle = (transform: Transform | null, /*width: number, height: number, */ x: number, y: number, isSelected: boolean): CSSProperties => {
  const { token } = AntdToken();

  return {
    position: 'absolute',
    left: `${x}px`,
    top: `${y}px`,
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition: 'background-color 0.3s, box-shadow 0.3s',
    backgroundColor: 'black', // Cor padrão do fundo da imagem
    // backgroundSize: 'contain',      // ajusta para caber sem cortar
    // backgroundRepeat: 'no-repeat', // Evitar repetir a imagem
    // width: width < 240 ? 256 : `${width}px`,
    // height: height < 160 ? 256 : `${height}px`,
    // boxShadow: isSelected ? `0 0 0 6px ${tokenAntD.colorPrimary}` : `0 0 0 2px ${tokenAntD.colorTextBase}`,
    // border: isSelected ? `6px solid ${tokenAntD.colorPrimary}` : `2px solid ${tokenAntD.colorBorder}`,
    outline: isSelected ? `4px solid ${token.colorPrimary}` : `1px solid ${token.colorBorder}`,
    zIndex: isSelected ? 5 : 1,
    imageRendering: 'pixelated',
    borderRadius: '0px',
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
