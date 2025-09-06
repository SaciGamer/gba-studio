import React, { useEffect, useState } from 'react';
import { Form, Upload, Input, message, Select } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { theme } from 'antd';
import { ImagePreview } from './ImagePreview';
import type { UploadProps } from 'antd';
import type { RcFile } from 'antd/es/upload/interface';
import { useBackgroundContext, useSceneContext, useSettingsUtilsContext } from '@/providers/contexts/AppContexts';

const { useToken } = theme;

interface BackgroundSelectorProps {
  selectedBackgroundId?: string;
  selectedElementId: string;
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
  selectedElementId,
  selectedBackgroundId,
  onBackgroundChange
}) => {
  const { token } = useToken();
  const [form] = Form.useForm();
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);

  const { scenes, setScenes } = useSceneContext();
  const { backgrounds, setBackgrounds, backgroundsRef } = useBackgroundContext();
  const { settingUtils, setSettingUtils } = useSettingsUtilsContext();

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

  useEffect(() => {
    form.setFieldsValue({ Background: selectedBackgroundId });
  }, [selectedBackgroundId, selectedElementId]);

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{ Background: selectedBackgroundId }}
    >
      <Form.Item label="Background" name="Background" style={{ marginBottom: token.marginLG }}>
        <Select
          showSearch
          optionFilterProp="label"
          value={form.getFieldValue("Background")}
          onChange={(newBackgroundId) => {
            setScenes(prevScenes =>
              prevScenes.map((s) =>
                s.id === selectedElementId ? { ...s, backgroundId: newBackgroundId, _saved: false } : s
              )
            );
            form.setFieldsValue({ Background: newBackgroundId });
          }}
        >
          {[...backgroundsRef.current]
            .filter(b => !b._deleted)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((background) => (
              <Select.Option key={background.id} value={background.id} label={background.name}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <img
                    src={`${settingUtils.localImagePath}/${background?.filename}`}
                    alt={background.name}
                    style={{ width: 24, height: 24, marginRight: 8 }}
                  />
                  {background.name}
                </div>
              </Select.Option>
            ))}
        </Select>
        {/* <div style={{ display: 'flex', gap: token.paddingXS }}>
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

        {imageInfo && <ImagePreview imageInfo={imageInfo} />} */}
      </Form.Item>

    </Form>
    
  );
};