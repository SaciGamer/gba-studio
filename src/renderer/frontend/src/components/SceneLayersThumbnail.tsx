import { useEffect, useState } from 'react';
import useAppContexts from '@/providers/contexts/AppContexts';
import type { ISceneSettings } from '@/providers/contexts/interfaces/ISceneElement';
import { ETypeScene } from '@/providers/contexts/interfaces/ISceneElement';
import imgPlaceholder from '@/img/placeholder.png';
import { joinLocalAssetPath } from '@/utils/localAssetUrl';
import { loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import { loadTilesetAssets } from '@/utils/tilesetAssets';
import { loadAutoTileAssets, toAutoTileSourceKey } from '@/utils/autoTileAssets';
import { drawSceneBackground } from '@/utils/drawSceneBackground';
import { createSceneLayerComposition } from '@/utils/sceneLayerComposition';
import { getPreviewPalettes, loadPaletteLibrary, normalizePalette } from './resourceEditors/paletteLibrary';

/** Starting-scene previews are independent of whether Game World was rendered. */
export default function SceneLayersThumbnail({ scene, alt }: { scene: ISceneSettings; alt: string }) {
  const { backgrounds, palettes, settings, settingUtils } = useAppContexts();
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      const width = 240, height = 160;
      const composition = createSceneLayerComposition(width, height);
      const cropX = Number.isFinite(scene.cameraPosition?.x) ? Number(scene.cameraPosition!.x) : 0;
      const cropY = Number.isFinite(scene.cameraPosition?.y) ? Number(scene.cameraPosition!.y) : 0;
      const grid = scene.gridSize ?? 8;
      const layers = scene.backgrounds ?? [];
      const hasTiles = layers.some(layer => layer.tileMap?.some(row => row.some(tile => tile >= 0)));
      const scope = settingUtils.projectPathFile ?? settingUtils.localImagePath;
      const [tilesets, autoTiles] = hasTiles ? await Promise.all([loadTilesetAssets(scope), loadAutoTileAssets(scope)]) : [[], []];
      const paths = new Map([...tilesets.map(asset => [asset.id, asset.path] as const), ...autoTiles.map(asset => [toAutoTileSourceKey(asset.id), asset.path] as const)]);
      const availablePalettes = getPreviewPalettes(palettes?.palettes?.length ? palettes.palettes : loadPaletteLibrary(), settings?.colorPaletteIds);
      const images = new Map<string, Promise<HTMLCanvasElement | null>>();
      const imageFor = (path: string, paletteId?: string | null) => {
        const key = `${path}:${paletteId ?? ''}`;
        if (!images.has(key)) {
          const palette = paletteId && paletteId !== '__original__' ? normalizePalette(availablePalettes.find(item => item.id === paletteId) ?? {}) : null;
          images.set(key, loadPaletteTransparentImage(path, palette?.colors));
        }
        return images.get(key)!;
      };
      let rendered = false;
      for (const layer of layers) {
        const context = composition.context(layer.layerId);
        const x = (Number(layer.x) || 0) - cropX, y = (Number(layer.y) || 0) - cropY;
        const background = backgrounds.find(item => !item._deleted && item.id === layer.backgroundId);
        if (background) {
          const path = joinLocalAssetPath(background.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath, background.filename);
          const image = await imageFor(path, layer.paletteId);
          if (image) {
            const repeat = scene.sceneType !== ETypeScene.LOGO && scene.sceneType !== ETypeScene.POINTNCLICK;
            drawSceneBackground(context, image, x, y, width, height, repeat);
            rendered = true;
          }
        }
        for (const [row, cells] of (layer.tileMap ?? []).entries()) {
          for (const [col, tile] of cells.entries()) {
            const dx = x + col * grid, dy = y + row * grid;
            if (tile < 0 || dx >= width || dy >= height || dx + grid <= 0 || dy + grid <= 0) continue;
            const id = layer.tileMapTilesetIds?.[row]?.[col] ?? layer.selectedTilesetId ?? scene.selectedTilesetId;
            const path = id ? paths.get(id) : undefined;
            if (!path) continue;
            const image = await imageFor(path, layer.tilePaletteIds?.[row]?.[col]);
            if (!image) continue;
            const columns = Math.max(1, Math.floor(image.width / grid));
            const override = layer.tileMapCellOverrides?.find(item => item.index === row * Math.ceil(scene.width / grid) + col);
            const flipX = override?.horizontalFlip === true, flipY = override?.verticalFlip === true;
            context.save();
            context.translate(dx + (flipX ? grid : 0), dy + (flipY ? grid : 0));
            context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
            context.drawImage(image, (tile % columns) * grid, Math.floor(tile / columns) * grid, grid, grid, 0, 0, grid, grid);
            context.restore();
            rendered = true;
          }
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext('2d');
      if (context) composition.draw(context);
      if (!cancelled) setSource(rendered ? canvas.toDataURL() : undefined);
    };
    render().catch(error => { if (!cancelled) { setSource(undefined); console.warn('Unable to render starting scene thumbnail:', error); } });
    return () => { cancelled = true; };
  }, [scene, backgrounds, palettes?.palettes, settings?.colorPaletteIds, settingUtils.projectPathFile, settingUtils.localImagePath, settingUtils.localImagePathHD]);
  return <span role="img" aria-label={alt} style={{ display: 'block', width: 36, height: 24, flex: '0 0 36px', overflow: 'hidden', background: '#111' }}>
    <img src={source ?? imgPlaceholder} alt="" style={{ display: 'block', width: 36, height: 24, imageRendering: 'pixelated' }} />
  </span>;
}
