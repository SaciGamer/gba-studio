import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene } from '@/providers/contexts/interfaces/ISceneElement';
import { Select, theme } from 'antd';
import React, { useState } from 'react';

const { useToken } = theme;

interface BackgroundSelectorProps {
  selectedElementId: string;
  layerKey: number;
  backgroundId?: string | null | undefined;
  onUpdateBackground?: (layerId: number, backgroundId: string | null) => void;
}

export const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({
  selectedElementId,
  layerKey,
  backgroundId,
  onUpdateBackground
}) => {
  const { token } = useToken();
  const { scenes, setScenes, backgroundsRef, settingUtils, setElementSelected } = useAppContexts();
  const elementSelected = scenes.find(s => s.id === selectedElementId);
  const isHDScene = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
  const backgroundsAvaible = backgroundsRef.current.filter(b => !b._deleted && b.hd === isHDScene);
  const [haveValueChange, setHaveValueChange] = useState(false);

  const updateSceneBackground = (newBackgroundId: string | null) => {
    let maxWidth = 240;
    let maxHeight = 160;

    if(onUpdateBackground) {
      onUpdateBackground(layerKey, newBackgroundId);
      return newBackgroundId;
    }

    // Calcula tamanho mínimo com projeção de troca de background
    if (elementSelected && elementSelected.backgrounds) {
      // Copia os backgrounds atuais
      let projectedBackgrounds = [...elementSelected.backgrounds];

      // Substitui o background do layer escolhido pelo novo
      projectedBackgrounds = projectedBackgrounds.map(bg =>
        bg.layerId === layerKey
          ? { ...bg, backgroundId: newBackgroundId }
          : bg
      );

      // Lista de IDs após projeção
      const elementBackgroundsId = projectedBackgrounds.map(bg => bg.backgroundId);

      // Filtra backgrounds disponíveis que correspondem aos IDs
      const sceneBackgrounds = backgroundsAvaible.filter(bg =>
        elementBackgroundsId.includes(bg.id)
      );

      if (sceneBackgrounds.length > 0) {
        const calcWidth = Math.max(...sceneBackgrounds.map(img => img.imageWidth));
        const calcHeight = Math.max(...sceneBackgrounds.map(img => img.imageHeight));

        // GBA: mínimo 240x160
        maxWidth = calcWidth > 240 ? calcWidth : 240;
        maxHeight = calcHeight > 160 ? calcHeight : 160;
      }
    }

    // Atualiza o elementSelected com width, height e backgrounds projetados
    const updatedElement = {
      ...elementSelected,
      width: maxWidth,
      height: maxHeight,
      backgrounds: (() => {
        const exists = elementSelected?.backgrounds?.some(bg => bg.layerId === layerKey);
        if (exists) {
          // Atualiza a camada existente
          return elementSelected?.backgrounds?.map(bg =>
            bg.layerId === layerKey
              ? { ...bg, backgroundId: newBackgroundId, name: "", path: "" }
              : bg
          );
        } else {
          // Cria a camada se não existir
          return [
            ...(elementSelected?.backgrounds ?? []),
            { layerId: layerKey, backgroundId: newBackgroundId, name: "", path: "" }
          ];
        }
      })(),
      _saved: false
    };

    // Atualiza estado local
    setElementSelected(updatedElement);
    // Atualiza lista de cenas
    setScenes(prevScenes =>
      prevScenes.map(scene =>
        scene.id === selectedElementId ? { ...scene, ...updatedElement } : scene
      )
    );
  };

  const initialValue = (): string | null | undefined => {
    // Se não veio nenhum backgroundId (undefined)
    if (backgroundId === undefined) {
      // tenta achar o background atual do layer na cena
      const currentBgId = elementSelected?.backgrounds?.find(bg => bg.layerId === layerKey)?.backgroundId;
      return backgroundsAvaible.find(ba => ba.id === currentBgId)?.id ?? null;
    }

    // Se veio backgroundId explícito (pode ser string ou null)
    if (backgroundId !== null) {
      return backgroundsAvaible.find(ba => ba.id === backgroundId)?.id ?? null;
    }

    // Se veio null, devolve null
    return null;
  }

  return (
    <Select
      showSearch
      optionFilterProp="label"
      suffixIcon={null}
      placeholder={'No background'}
      value={ initialValue() }
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
            <Select.Option title={'Background Options'} key={background.id} value={background.id} label={background.name}>
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