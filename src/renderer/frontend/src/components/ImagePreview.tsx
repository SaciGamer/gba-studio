import React from 'react';
import { Typography } from 'antd';
import { theme } from 'antd';

const { useToken } = theme;
const { Text } = Typography;

interface ImagePreviewProps {
  imageInfo: {
    preview: string;
    file: File;
    width: number;
    height: number;
    tiles: number;
  };
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ imageInfo }) => {
  const { token } = useToken();

  return (
    <div 
      style={{ 
        marginTop: token.marginXS,
        width: '100%',
        height: 80,
        borderRadius: token.borderRadiusSM,
        border: `1px solid ${token.colorBorder}`,
        padding: token.paddingXS,
        display: 'flex',
        alignItems: 'center',
        gap: token.padding
      }}
    >
      <div
        style={{
          width: 80,
          height: '100%',
          flexShrink: 0,
          borderRadius: token.borderRadiusSM,
          overflow: 'hidden',
          backgroundColor: token.colorFillTertiary
        }}
      >
        <img 
          src={imageInfo.preview} 
          alt="Background preview"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />
      </div>

      <div style={{ flex: 1 }}>
        <Text style={{ 
          display: 'block', 
          color: token.colorTextSecondary,
          fontSize: token.fontSizeSM 
        }}>
          {imageInfo.file.name}
        </Text>
        <Text style={{ 
          display: 'block',
          fontSize: token.fontSizeSM,
          color: token.colorTextSecondary 
        }}>
          {imageInfo.width}x{imageInfo.height}px
        </Text>
        <Text style={{ 
          display: 'block',
          fontSize: token.fontSizeSM,
          color: token.colorTextSecondary 
        }}>
          {imageInfo.tiles} tiles (32x32)
        </Text>
      </div>
    </div>
  );
};