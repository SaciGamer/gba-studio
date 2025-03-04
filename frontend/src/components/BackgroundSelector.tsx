import React, { useState } from 'react';
import { Form, Upload, Input, message } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { theme } from 'antd';
import { ImagePreview } from './ImagePreview.tsx';
import type { UploadProps } from 'antd';
import type { RcFile } from 'antd/es/upload/interface';

const { useToken } = theme;

interface BackgroundSelectorProps {
  initialBackground?: string;
  onBackgroundChange: (data: { preview: string, file: File }) => void;
}

interface ImageInfo {
  file: RcFile;
  width: number;
  height: number;
  tiles: number;
  preview: string;
}

export const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({
  initialBackground,
  onBackgroundChange
}) => {
  const { token } = useToken();
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);

  const validateImage = (file: RcFile): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      
      reader.onload = () => {
        const img = new Image();
        img.src = reader.result as string;
        
        img.onload = () => {
          if (img.width % 32 !== 0 || img.height % 32 !== 0) {
            message.error('A imagem deve ter dimensões múltiplas de 32px');
            reject(false);
            return;
          }

          const tilesX = img.width / 32;
          const tilesY = img.height / 32;
          const totalTiles = tilesX * tilesY;

          const imageData = {
            file,
            width: img.width,
            height: img.height,
            tiles: totalTiles,
            preview: reader.result as string
          };

          setImageInfo(imageData);
          onBackgroundChange({ preview: imageData.preview, file });
          resolve(true);
        };

        img.onerror = () => {
          message.error('Erro ao carregar a imagem');
          reject(false);
        };
      };
    });
  };

  const uploadProps: UploadProps = {
    accept: '.png,.jpg,.jpeg',
    showUploadList: false,
    beforeUpload: async (file) => {
      try {
        await validateImage(file);
        return false; // Não faz upload automático
      } catch {
        return Upload.LIST_IGNORE;
      }
    },
  };

  return (
    <Form.Item label="Background" style={{ marginBottom: token.marginLG }}>
      <div style={{ display: 'flex', gap: token.paddingXS }}>
        <Input
          style={{ flex: 1, cursor: 'default' }}
          placeholder="Selecione uma imagem"
          value={imageInfo?.file.name || ''}
          readOnly
        />
        
        <Upload {...uploadProps}>
          <Input
            style={{ 
              width: 40, 
              padding: 0, 
              textAlign: 'center',
              cursor: 'pointer'
            }}
            suffix={<UploadOutlined />}
            type="button"
          />
        </Upload>
      </div>

      {imageInfo && <ImagePreview imageInfo={imageInfo} />}
    </Form.Item>
  );
};