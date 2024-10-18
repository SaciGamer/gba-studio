import React from 'react';

const Grid = ({ size, width, height, marginTop, marginLeft }) => {
    return (
      <svg width={width} height={height} style={{ position: 'absolute', top: marginTop, left: marginLeft, pointerEvents: 'none' }}>
        <defs>
          <pattern id="smallGrid" width={size} height={size} patternUnits="userSpaceOnUse">
            <path d={`M ${size} 0 L 0 0 0 ${size}`} fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="0.5" />
          </pattern>
          <pattern id="grid" width={size * 5} height={size * 5} patternUnits="userSpaceOnUse">
            <rect width={size * 5} height={size * 5} fill="url(#smallGrid)" />
            <path d={`M ${size * 5} 0 L 0 0 0 ${size * 5}`} fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    );
  };

export default Grid;