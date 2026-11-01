import { WarningField } from './WarningIndicator';
import { hasAssetReferenceWarning } from '../../../../shared/events/sceneReferenceCleanup';
import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene } from '@/providers/contexts/interfaces/ISceneElement';
import { EditOutlined, EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { Button, Flex, message, Select, Space, Tag, theme, Tooltip, Typography } from 'antd';
import StepInputNumber from './StepInputNumber';
import React, { useEffect, useState } from 'react';
import { joinLocalAssetPath } from '@/utils/localAssetUrl';
import { countDistinctImageTiles } from '@/utils/tileCount';
import type { IBackgroundElement } from '@/providers/contexts/interfaces/ISceneElement';
import { useI18n } from '@/i18n/I18n';

const { useToken } = theme;

interface BackgroundSelectorProps {
  selectedElementId: string;
  layerKey: number;
  backgroundId?: string | null | undefined;
  onUpdateBackground?: (layerId: number, backgroundId: string | null) => void;
  showPreviewVisibilityToggle?: boolean;
  tilesetAssets?: Array<{ id: string; name?: string; path: string }>;
  hasTilesetTag?: boolean;
}

export const BackgroundSelector: React.FC<BackgroundSelectorProps> = ({
  selectedElementId,
  layerKey,
  backgroundId,
  onUpdateBackground,
  showPreviewVisibilityToggle = false,
  tilesetAssets = [],
  hasTilesetTag = false,
}) => {
  const { token } = useToken();
  const { t } = useI18n();
  const { scenes, setScenes, backgroundsRef, settingUtils, setElementSelected, setSettingUtils, userSettings, setUserSettings } = useAppContexts();
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
  const hasLayerAutoTiles = Boolean(layer?.autoTileMap?.some(row => row.some(tile => Number.isInteger(tile) && tile >= 0)));
  const hasCustomContent = hasTilesetTag || hasLayerAutoTiles;
  const enterCustomLayerEdit = () => setSettingUtils(previous => ({
    ...previous,
    tileEditSceneId: selectedElementId,
    tileEditLayerId: layerKey,
    activeButton: 'tiles',
    activeSubButton: 'pencil',
    activeSceneObject: null,
    activeTriggerId: null,
    selectedSceneIds: [selectedElementId],
  }));
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
    <WarningField warning={hasAssetReferenceWarning(layer, 'backgroundId')} message={t('events.missingReference')} style={{ flex: 1, minWidth: 0, width: 0 }}>
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
      status={hasAssetReferenceWarning(layer, 'backgroundId') ? 'warning' : undefined}
      suffixIcon={null}
      placeholder={'No background'}
      value={ initialValue() }
      onChange={(newBackgroundId) => updateSceneBackground(newBackgroundId)}
      dropdownRender={menu => hasCustomContent ? <Flex gap={0} align="stretch" style={{ width: 600, maxWidth: 'calc(100vw - 64px)', maxHeight: 420 }}>
        <div style={{ flex: '1 1 50%', width: '50%', minWidth: 0, boxSizing: 'border-box', overflow: 'auto' }}>{menu}</div>
        <div style={{ flex: '1 1 50%', width: '50%', minWidth: 0, boxSizing: 'border-box', paddingLeft: 12, borderLeft: `1px solid ${token.colorBorder}`, overflow: 'auto' }}>
          <Flex align="center" justify="space-between" gap={8}>
            <Typography.Text strong>{t('backgrounds.customSelected')}</Typography.Text>
            <Tag color="blue" style={{ margin: 0 }}>{t('backgrounds.selected')}</Tag>
          </Flex>
          <CustomLayerPreview layer={layer} tilesetAssets={tilesetAssets} selectedBackground={backgroundsAvaible.find(item => item.id === layer?.backgroundId)} localImagePath={settingUtils.localImagePath} fallbackTilesetId={layer?.selectedTilesetId ?? elementSelected?.selectedTilesetId} />
        </div>
      </Flex> : menu}
      style={{ width: '100%', minWidth: 0, height: 40 }}
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
    </WarningField>
    {showPreviewVisibilityToggle && hasCustomContent && <div style={{ flex: '0 1 calc((100% - 80px) / 2)', width: 'calc((100% - 80px) / 2)', minWidth: 0, height: 38, alignSelf: 'center', display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', boxSizing: 'border-box', border: 'none', borderLeft: `1px solid ${token.colorBorder}`, borderRadius: 0, background: token.colorBgContainer }}>
      <CustomLayerPreview compact layer={layer} tilesetAssets={tilesetAssets} selectedBackground={backgroundsAvaible.find(item => item.id === layer?.backgroundId)} localImagePath={settingUtils.localImagePath} fallbackTilesetId={layer?.selectedTilesetId ?? elementSelected?.selectedTilesetId} />
      <Tooltip title={t('backgrounds.customSelected')}><Typography.Text ellipsis style={{ flex: 1, minWidth: 0 }}>{t('backgrounds.custom')}</Typography.Text></Tooltip>
    </div>}
    {showPreviewVisibilityToggle && hasCustomContent && <Tooltip title={t('backgrounds.editLayer')}>
      <Button
        aria-label={t('backgrounds.editLayer')}
        icon={<EditOutlined />}
        onClick={enterCustomLayerEdit}
        style={{ width: 40, height: 40 }}
      />
    </Tooltip>}
    {showPreviewVisibilityToggle && <Tooltip title={t(isPreviewVisible ? 'backgrounds.hideLayerPreview' : 'backgrounds.showLayerPreview')}>
      <Button
        aria-label={t(isPreviewVisible ? 'backgrounds.hideLayerPreview' : 'backgrounds.showLayerPreview')}
        icon={isPreviewVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
        onClick={togglePreviewVisibility}
        style={{ width: 40, height: 40 }}
      />
    </Tooltip>}
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

function CustomLayerPreview({ layer, tilesetAssets, selectedBackground, localImagePath, fallbackTilesetId, compact = false }: {
  layer?: IBackgroundElement;
  tilesetAssets: Array<{ id: string; name?: string; path: string }>;
  selectedBackground?: { filename: string };
  localImagePath: string;
  fallbackTilesetId?: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const { token } = theme.useToken();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const tileMap = layer?.tileMap ?? [];
  const tilemapSignature = JSON.stringify([tileMap, layer?.tileMapTilesetIds, layer?.selectedTilesetId, fallbackTilesetId]);
  const assetSignature = tilesetAssets.map(asset => `${asset.id}:${asset.path}`).join('|');
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || !tileMap.length || !tileMap.some(row => row.some(tile => tile >= 0))) return;
    const ids = new Set<string>();
    tileMap.forEach((row, rowIndex) => row.forEach((tile, columnIndex) => {
      if (tile < 0) return;
      const id = layer?.tileMapTilesetIds?.[rowIndex]?.[columnIndex] ?? layer?.selectedTilesetId ?? fallbackTilesetId;
      if (id) ids.add(id);
    }));
    const defaultId = layer?.selectedTilesetId ?? fallbackTilesetId;
    if (defaultId) ids.add(defaultId);
    const columns = Math.max(1, ...tileMap.map(row => row.length));
    const rows = tileMap.length;
    canvas.width = columns * 8;
    canvas.height = rows * 8;
    context.clearRect(0, 0, canvas.width, canvas.height);
    void Promise.all([...ids].map(async id => {
      const asset = tilesetAssets.find(item => item.id === id);
      if (!asset) return null;
      const image = new Image();
      image.src = asset.path;
      await new Promise<void>(resolve => {
        if (image.complete) resolve();
        else { image.onload = () => resolve(); image.onerror = () => resolve(); }
      });
      return image.naturalWidth ? [id, image] as const : null;
    })).then(entries => {
      if (cancelled) return;
      const images = new Map(entries.filter((entry): entry is readonly [string, HTMLImageElement] => Boolean(entry)));
      tileMap.forEach((row, rowIndex) => row.forEach((tile, columnIndex) => {
        if (tile < 0) return;
        const id = layer?.tileMapTilesetIds?.[rowIndex]?.[columnIndex] ?? layer?.selectedTilesetId ?? fallbackTilesetId;
        const image = id ? images.get(id) : undefined;
        if (!image) return;
        const tileColumns = Math.floor(image.naturalWidth / 8);
        if (!tileColumns) return;
        context.drawImage(image, (tile % tileColumns) * 8, Math.floor(tile / tileColumns) * 8, 8, 8, columnIndex * 8, rowIndex * 8, 8, 8);
      }));
    });
    return () => { cancelled = true; };
  }, [tilemapSignature, assetSignature, fallbackTilesetId]);

  if (tileMap.length && tileMap.some(row => row.some(tile => tile >= 0))) return <canvas ref={canvasRef} aria-label={t('backgrounds.customPreview')} style={{ display: 'block', flex: '0 0 36px', width: 36, height: 24, marginTop: compact ? 0 : 8, imageRendering: 'pixelated', objectFit: 'cover', background: token.colorFillTertiary }} />;
  const asset = tilesetAssets.find(item => item.id === (layer?.selectedTilesetId ?? fallbackTilesetId));
  const src = asset?.path ?? (selectedBackground ? joinLocalAssetPath(localImagePath, selectedBackground.filename) : null);
  return src
    ? <img src={src} alt={t('backgrounds.customPreview')} style={{ display: 'block', flex: '0 0 36px', width: 36, height: 24, marginTop: compact ? 0 : 8, objectFit: 'cover', imageRendering: 'pixelated' }} />
    : <Typography.Text type="secondary">{t('backgrounds.customPreviewEmpty')}</Typography.Text>;
}
