import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene } from '@/providers/contexts/interfaces/ISceneElement';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { Button, Flex, message, Select, Space, theme, Typography } from 'antd';
import StepInputNumber from './StepInputNumber';
import React, { useEffect, useState } from 'react';
import { joinLocalAssetPath } from '@/utils/localAssetUrl';
import { countDistinctImageTiles } from '@/utils/tileCount';

const { useToken } = theme;

interface BackgroundSelectorProps {
  selectedElementId: string;
  layerKey: number;
  backgroundId?: string | null | undefined;
  onUpdateBackground?: (layerId: number, backgroundId: string | null) => void;
  showPreviewVisibilityToggle?: boolean;
}

export const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({
  selectedElementId,
  layerKey,
  backgroundId,
  onUpdateBackground,
  showPreviewVisibilityToggle = false,
}) => {
  const { token } = useToken();
  const { scenes, setScenes, backgroundsRef, settingUtils, setElementSelected, userSettings, setUserSettings } = useAppContexts();
  const elementSelected = scenes.find(s => s.id === selectedElementId);
  const isHDScene = elementSelected?.sceneType === ETypeScene.LOGO || elementSelected?.sceneType === ETypeScene.POINTNCLICK;
  const backgroundsAvaible = backgroundsRef.current.filter(b => !b._deleted && b.hd === isHDScene);
  const [haveValueChange, setHaveValueChange] = useState(false);
  const [previewHovered, setPreviewHovered] = useState(false);
  const [positionFocused, setPositionFocused] = useState(false);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('gba-studio:background-original-preview', {
      detail: { sceneId: selectedElementId, layerId: layerKey, active: !isHDScene && (previewHovered || positionFocused) },
    }));
  }, [selectedElementId, layerKey, isHDScene, previewHovered, positionFocused]);
  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('gba-studio:background-original-preview', {
      detail: { sceneId: selectedElementId, layerId: layerKey, active: false },
    }));
  }, [selectedElementId, layerKey]);

  const updateSceneBackground = async (newBackgroundId: string | null) => {
    let maxWidth = 240;
    let maxHeight = 160;

    if(onUpdateBackground) {
      onUpdateBackground(layerKey, newBackgroundId);
      return newBackgroundId;
    }

    // Calcula tamanho mínimo com projeção de troca de background
    const projectedBackgrounds = (() => {
      const current = [...(elementSelected?.backgrounds ?? [])];
      if (current.some(bg => bg.layerId === layerKey)) {
        return current.map(bg =>
        bg.layerId === layerKey
          ? { ...bg, backgroundId: newBackgroundId }
          : bg);
      }
      return [...current, { layerId: layerKey, backgroundId: newBackgroundId }];
    })();
    const sceneBackgrounds = projectedBackgrounds
      .map(layer => backgroundsRef.current.find(background => !background._deleted && background.id === layer.backgroundId))
      .filter((background): background is NonNullable<typeof background> => Boolean(background));
    try {
      const projectedTileCount = await countDistinctImageTiles(sceneBackgrounds.map(background => joinLocalAssetPath(
        background.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath,
        background.filename,
      )));
      if (projectedTileCount > 4096) {
        message.error(`A cena ultrapassa o limite de 4096 tiles distintos (${projectedTileCount}/4096).`);
        return;
      }
    } catch {
      // The live scene counter recalculates once its images finish loading.
      // Do not reject a selection from only width/height metadata: repeated
      // art is valid and must not be counted as a different tile.
    }
    if (sceneBackgrounds.length > 0) {
      const calcWidth = Math.max(...sceneBackgrounds.map(img => img.imageWidth));
      const calcHeight = Math.max(...sceneBackgrounds.map(img => img.imageHeight));
      maxWidth = Math.max(calcWidth, 240);
      maxHeight = Math.max(calcHeight, 160);
    }

    const hasPaintedTiles = elementSelected?.tileMap?.some(row => row.some(tile => Number.isInteger(tile) && tile >= 0)) || (elementSelected?.backgrounds ?? []).some(layer =>
      layer.tileMap?.some(row => row.some(tile => Number.isInteger(tile) && tile >= 0)),
    );
    if (hasPaintedTiles) {
      maxWidth = Math.max(maxWidth, Number(elementSelected?.width) || 240);
      maxHeight = Math.max(maxHeight, Number(elementSelected?.height) || 160);
    }

    // Atualiza o elementSelected com width, height e backgrounds projetados
    const updatedElement = {
      ...elementSelected,
      width: maxWidth,
      height: maxHeight,
      backgrounds: projectedBackgrounds.map(bg => bg.layerId === layerKey ? { ...bg, name: "", path: "" } : bg),
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

  const previewVisibilityKey = `${selectedElementId}:${layerKey}`;
  const isPreviewVisible = !userSettings.hiddenBackgroundLayers?.includes(previewVisibilityKey);
  const togglePreviewVisibility = () => setUserSettings(previous => {
    const hidden = previous.hiddenBackgroundLayers ?? [];
    return {
      ...previous,
      hiddenBackgroundLayers: hidden.includes(previewVisibilityKey)
        ? hidden.filter(key => key !== previewVisibilityKey)
        : [...hidden, previewVisibilityKey],
    };
  });

  const layer = elementSelected?.backgrounds?.find(item => item.layerId === layerKey);
  const updateLayerPosition = (axis: 'x' | 'y', value: number | null) => {
    if (!elementSelected) return;
    const backgrounds = (elementSelected.backgrounds ?? []).some(item => item.layerId === layerKey)
      ? (elementSelected.backgrounds ?? []).map(item => item.layerId === layerKey ? { ...item, [axis]: Number(value) || 0 } : item)
      : [...(elementSelected.backgrounds ?? []), { layerId: layerKey, backgroundId: null, x: axis === 'x' ? Number(value) || 0 : 0, y: axis === 'y' ? Number(value) || 0 : 0 }];
    const updated = { ...elementSelected, backgrounds, _saved: false };
    setElementSelected(updated);
    setScenes(previous => previous.map(scene => scene.id === updated.id ? updated : scene));
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
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
    <Space.Compact block>
    <Select
      onMouseEnter={() => setPreviewHovered(true)}
      onMouseLeave={() => setPreviewHovered(false)}
      showSearch
      optionFilterProp="title"
      filterOption={(input, option) => {
        const data = (option as any)?.data ?? option;
        const searchableText = data?.title ?? data?.value ?? '';
        return String(searchableText).toLowerCase().includes(input.trim().toLowerCase());
      }}
      suffixIcon={null}
      placeholder={'No background'}
      value={ initialValue() }
      onChange={(newBackgroundId) => updateSceneBackground(newBackgroundId)}
      style={{ width: '100%', height: 40 }}
    >
      <Select.Option value={null} key="none">
        <em>No background</em>
      </Select.Option>

      {[...backgroundsAvaible]
        .map(background => {
          const path = isHDScene ? settingUtils.localImagePathHD : settingUtils.localImagePath;

          const optionLabel = <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 36, lineHeight: 1 }}>
                <img
                  src={`${path}/${background.filename}`}
                  alt=""
                  style={{ display: 'block', flex: '0 0 36px', width: 36, height: 24, objectFit: 'cover', imageRendering: 'pixelated' }}
                />
                <span>{background.name}</span>
              </span>;

          return (
            <Select.Option title={background.name} key={background.id} value={background.id} label={optionLabel}>
              {optionLabel}
            </Select.Option>
          );
        })
      }
    </Select>
    {showPreviewVisibilityToggle && <Button
      title={isPreviewVisible ? 'Hide layer in editor preview' : 'Show layer in editor preview'}
      aria-label={isPreviewVisible ? 'Hide layer in editor preview' : 'Show layer in editor preview'}
      icon={isPreviewVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
      onClick={togglePreviewVisibility}
      style={{ width: 40, height: 40 }}
    />}
    </Space.Compact>
    <Typography.Text type="secondary">Image position</Typography.Text>
    <Flex gap={8} style={{ width: '100%' }}
      onMouseEnter={() => setPreviewHovered(true)} onMouseLeave={() => setPreviewHovered(false)}
      onFocusCapture={() => setPositionFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPositionFocused(false); }}>
      <StepInputNumber addonBefore="X" value={layer?.x ?? 0} onChange={value => updateLayerPosition('x', value)} style={{ flex: 1, minWidth: 0 }} />
      <StepInputNumber addonBefore="Y" value={layer?.y ?? 0} onChange={value => updateLayerPosition('y', value)} style={{ flex: 1, minWidth: 0 }} />
    </Flex>
    </Space>
  );
};
