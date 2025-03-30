import React, { useEffect } from 'react';

interface IGrid {
  size: number;
  width?: number | string;
  height?: number | string;
  marginTop: number;
  marginLeft: number;
}

const Grid: React.FC<IGrid> = ({ size, width, height, marginTop, marginLeft }) => {
    const subGridSize = size / 2;
    width = width || `calc(100% - ${marginLeft}px)`;
    height = height || `calc(100% - ${marginTop}px)`;

    useEffect(() => {

    }, [width, height]);

    return (
      <svg width={width} height={height} style={{ position: 'absolute', top: marginTop, left: marginLeft, pointerEvents: 'none' }}>
        <defs>
          <pattern id="smallGrid" width={size} height={size} patternUnits="userSpaceOnUse">
            <path d={`M ${size} 0 L 0 0 0 ${size}`} fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />
          </pattern>
          <pattern id="grid" width={size * subGridSize} height={size * subGridSize} patternUnits="userSpaceOnUse">
            <rect width={size * subGridSize} height={size * subGridSize} fill="url(#smallGrid)" />
            <path d={`M ${size * subGridSize} 0 L 0 0 0 ${size * subGridSize}`} fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100vw" height="100vh" fill="url(#grid)" />
      </svg>
    );
  };

export default Grid;