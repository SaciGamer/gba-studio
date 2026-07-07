import useAppContexts from '@/providers/contexts/AppContexts';
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
  // const { scenes, setScenes } = useSceneContext();
  // const { backgrounds, setBackgrounds, backgroundsRef } = useBackgroundContext();
  // const { settingUtils } = useSettingsUtilsContext();
  const { scenes, setScenes, backgroundsRef, settingUtils } = useAppContexts();
  const elementSelected = scenes.find(s => s.id === selectedElementId);
  const isHDScene = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
  const backgroundsAvaible = backgroundsRef.current.filter(b => !b._deleted && b.hd === isHDScene);
  const [haveValueChange, setHaveValueChange] = useState(false);

  const updateSceneBackground = (newBackgroundId: string | null) => {
    let maxWidth = 240;
    let maxHeight = 160;

    if (elementSelected!= undefined && elementSelected?.backgrounds) {
      const elementBackgroundsId = elementSelected?.backgrounds?.map(bg => bg.backgroundId); 
      const sceneBackgrounds = backgroundsAvaible.filter(bg => elementBackgroundsId.includes(bg.id));

      if (sceneBackgrounds.length > 0) {
        const calcWidth = Math.max(...sceneBackgrounds.map(img => img.imageWidth));
        const calcHeight = Math.max(...sceneBackgrounds.map(img => img.imageHeight));

        maxWidth = calcWidth > 240 ? calcWidth : 240;
        maxHeight = calcHeight > 160 ? calcWidth : 160;
      } 
    }
    
    setScenes(prevScenes =>
      prevScenes.map((s) =>
        s.id === selectedElementId
          ? {
              ...s,
              width: maxWidth,
              height: maxHeight,
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
      suffixIcon={null}
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