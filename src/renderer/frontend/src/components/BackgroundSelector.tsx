import { useBackgroundContext, useSceneContext, useSettingsUtilsContext } from '@/providers/contexts/AppContexts';
import { ETypeScene } from '@/providers/contexts/interfaces/ISceneElement';
import { Select, theme } from 'antd';
import React, { useState } from 'react';

const { useToken } = theme;

interface BackgroundSelectorProps {
  selectedElementId: string;
  layerKey: number;
}

export const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({
  selectedElementId,
  layerKey,
}) => {
  const { token } = useToken();
  const { scenes, setScenes } = useSceneContext();
  const { backgrounds, setBackgrounds, backgroundsRef } = useBackgroundContext();
  const { settingUtils, setSettingUtils } = useSettingsUtilsContext();
  const elementSelected = scenes.find(s => s.id === selectedElementId);
  const isHDScene = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
  const backgroundsAvaible = backgroundsRef.current.filter(b => !b._deleted && b.hd === isHDScene);
  const [haveValueChange, setHaveValueChange] = useState(false);

  // const [listBackgrounds, setListBackgrounds] = useState<IBackgroundSettings[]>([]);
  
  const updateSceneBackground = (newBackgroundId: string | null) => {
    setScenes(prevScenes =>
      prevScenes.map((s) =>
        s.id === selectedElementId
          ? {
              ...s,
              backgrounds: (() => {
                const exists = s.backgrounds?.some(bg => bg.layerId === layerKey);
                if (exists) {
                  // Atualiza a camada existente
                  return s.backgrounds?.map(bg =>
                    bg.layerId === layerKey
                      ? { ...bg, backgroundId: newBackgroundId, name: "", path: "" }
                      : bg
                  );
                } else {
                  // Cria a camada se não existir
                  return [
                    ...(s.backgrounds ?? []),
                    { layerId: layerKey, backgroundId: newBackgroundId, name: "", path: "" }
                  ];
                }
              })(),
              _saved: false
            }
          : s
      )
    );
  };

  return (
    <Select
      showSearch
      optionFilterProp="label"
      value={backgroundsAvaible.find(ba => ba.id === elementSelected?.backgrounds?.find(bg => bg.layerId === layerKey)?.backgroundId)?.id ?? null}
      onChange={(newBackgroundId) => updateSceneBackground(newBackgroundId)}
      style={{ width: '100%' }}
    >
      <Select.Option value={null} key="none">
        <em>No background</em>
      </Select.Option>

      {[...backgroundsAvaible]
        .map(background => {
          const path = isHDScene ? settingUtils.localImagePathHD : settingUtils.localImagePath;

          return (
            <Select.Option key={background.id} value={background.id} label={background.name}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <img
                  src={`${path}/${background.filename}`}
                  alt={background.name}
                  style={{ width: 24, height: 24, marginRight: 8 }}
                />
                {background.name}
              </div>
            </Select.Option>
          );
        })
      }
    </Select>
  );
};