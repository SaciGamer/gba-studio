import { coordinatePixels } from '../../../../../shared/events/coordinateUnits';
import { floatingPreviewTop } from '../../utils/floatingPreviewPosition';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import useAppContexts from '@/providers/contexts/AppContexts';
import { ETypeScene, type IScriptsElement } from '@/providers/contexts/interfaces/ISceneElement';
import { loadPaletteTransparentImage } from '@/utils/paletteTransparency';
import { loadTilesetAssets } from '@/utils/tilesetAssets';
import { loadAutoTileAssets, toAutoTileSourceKey } from '@/utils/autoTileAssets';
import { drawSceneBackground } from '@/utils/drawSceneBackground';
import { getPreviewPalettes, loadPaletteLibrary, normalizePalette } from '../resourceEditors/paletteLibrary';
import useEventPreviewArea from './useEventPreviewArea';

/** A temporary viewport beside the inspector; never writes preview values to the scene. */
export default function BackgroundTransformPreview({ event, layerId, children }: { event: IScriptsElement; layerId: number; children: ReactNode }) {
  const { elementSelected: scene, backgrounds, settingUtils, palettes, settings } = useAppContexts();
  const body = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const close = () => setAnchor(null);
  useEffect(() => {
    const opened = (e: Event) => { if ((e as CustomEvent).detail?.eventId !== event.id) close(); };
    window.addEventListener('gba-studio:event-preview-open', opened);
    return () => window.removeEventListener('gba-studio:event-preview-open', opened);
  }, [event.id]);
  useEffect(() => { close(); }, [event.id, event.args?.__collapse, scene?.id]);
  useEffect(() => {
    if (!anchor) return;
    const reposition = () => {
      const rect = previewArea.current?.getBoundingClientRect();
      setAnchor(current => current && rect && rect.bottom > 0 && rect.top < window.innerHeight ? rect : null);
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [Boolean(anchor)]);
  useEffect(() => {
    if (!anchor || !scene) return;
    let cancelled = false;
    const render = async () => {
      const layer = scene.backgrounds?.find((item: { layerId: number }) => item.layerId === layerId);
      const previous = (scene.script ?? []).slice(0, Math.max(0, (scene.script ?? []).findIndex((item: IScriptsElement) => item.id === event.id)))
        .filter((item: IScriptsElement) => item.args?.__comment !== true && Number(item.args?.layerId) === layerId);
      const change = previous.filter((item: IScriptsElement) => item.command === 'EVENT_CHANGE_LAYER').at(-1);
      const backgroundId = change?.args?.backgroundId ?? layer?.backgroundId;
      const background = backgrounds.find(item => item.id === backgroundId && !item._deleted);
      const image = background ? await loadPaletteTransparentImage(`${background.hd ? settingUtils.localImagePathHD : settingUtils.localImagePath}/${background.filename}`) : null;
      const composed = document.createElement('canvas');
      composed.width = Math.max(240, Number(scene.width) || 240);
      composed.height = Math.max(160, Number(scene.height) || 160);
      const ctx = composed.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      const bitmap = scene.sceneType === ETypeScene.LOGO || scene.sceneType === ETypeScene.POINTNCLICK;
      if (image) drawSceneBackground(ctx, image, Number(layer?.x) || 0, Number(layer?.y) || 0, composed.width, composed.height, !bitmap);
      if (!change && layer?.tileMap?.length) {
        const scope = settingUtils.projectPathFile ?? settingUtils.localImagePath;
        const [tiles, auto] = await Promise.all([loadTilesetAssets(scope), loadAutoTileAssets(scope)]);
        const paths = new Map([...tiles.map(item => [item.id, item.path] as const), ...auto.map(item => [toAutoTileSourceKey(item.id), item.path] as const)]);
        const sources = new Map<string, HTMLCanvasElement>();
        const available = getPreviewPalettes(palettes.palettes.length ? palettes.palettes : loadPaletteLibrary(), settings?.colorPaletteIds);
        const grid = scene.gridSize ?? 8;
        for (let row = 0; row < layer.tileMap.length; ++row) {
          for (let col = 0; col < layer.tileMap[row].length; ++col) {
            const index = layer.tileMap[row][col];
            if (index < 0) continue;
            const id = layer.tileMapTilesetIds?.[row]?.[col] ?? layer.selectedTilesetId ?? scene.selectedTilesetId ?? '';
            const path = paths.get(id);
            if (!path) continue;
            const paletteId = layer.tilePaletteIds?.[row]?.[col];
            const key = `${id}:${paletteId ?? ''}`;
            if (!sources.has(key)) {
              const palette = paletteId && paletteId !== '__original__' ? normalizePalette(available.find(item => item.id === paletteId) ?? {}) : null;
              const source = await loadPaletteTransparentImage(path, palette?.colors);
              if (source) sources.set(key, source);
            }
            const source = sources.get(key);
            if (!source) continue;
            const columns = Math.max(1, Math.floor(source.width / grid));
            ctx.drawImage(source, index % columns * grid, Math.floor(index / columns) * grid, grid, grid, (Number(layer.x) || 0) + col * grid, (Number(layer.y) || 0) + row * grid, grid, grid);
          }
        }
      }
      if (cancelled) return;
      const output = canvas.current?.getContext('2d');
      if (!output) return;
      output.clearRect(0, 0, 240, 160);
      output.imageSmoothingEnabled = false;
      const numeric = (value: unknown, fallback: number): number => {
        if (value && typeof value === 'object' && 'value' in value) return numeric(value.value, fallback);
        return Number.isFinite(Number(value)) ? Number(value) : fallback;
      };
      let sx = 1, sy = 1, angle = 0, hx = 0, hy = 0, x = 0, y = 0;
      for (const item of [...previous, event]) {
        const args = item.args ?? {};
        if (item.command === 'EVENT_BACKGROUND_SET_SCALE') { sx = numeric(args.x, 100) / 100; sy = numeric(args.y, 100) / 100; }
        if (item.command === 'EVENT_BACKGROUND_SET_ROTATION') angle = numeric(args.angle, 0);
        if (item.command === 'EVENT_BACKGROUND_SET_SHEAR') { hx = numeric(args.x, 0) / 100; hy = numeric(args.y, 0) / 100; }
        if (item.command === 'EVENT_BACKGROUND_SCROLL') { x += coordinatePixels(args, 'x'); y += coordinatePixels(args, 'y'); }
      }
      output.save();
      // Butano stores the screen-to-source matrix. Canvas needs its inverse;
      // shear is added to the off-diagonal entries rather than composed after rotation.
      const radians = angle * Math.PI / 180;
      const a = Math.cos(radians) / sx, b = Math.sin(radians) / sy + hy;
      const c = -Math.sin(radians) / sx + hx, d = Math.cos(radians) / sy;
      const determinant = a * d - b * c;
      if (Math.abs(determinant) < 0.000001) { output.restore(); return; }
      const centerX = (image?.width ?? composed.width) / 2 + (Number(layer?.x) || 0);
      const centerY = (image?.height ?? composed.height) / 2 + (Number(layer?.y) || 0);
      output.translate(centerX + x - (Number(scene.cameraPosition?.x) || 0), centerY + y - (Number(scene.cameraPosition?.y) || 0));
      output.transform(d / determinant, -b / determinant, -c / determinant, a / determinant, 0, 0);
      output.translate(-centerX, -centerY);
      if (bitmap) output.drawImage(composed, 0, 0);
      else {
        const pattern = output.createPattern(composed, 'repeat');
        if (pattern) { output.fillStyle = pattern; output.fillRect(-4096, -4096, 8192, 8192); }
      }
      output.restore();
    };
    void render().catch(() => { if (!cancelled) canvas.current?.getContext('2d')?.clearRect(0, 0, 240, 160); });
    return () => { cancelled = true; };
  }, [Boolean(anchor), event, layerId, scene, backgrounds, settingUtils.localImagePath, settingUtils.localImagePathHD, settingUtils.projectPathFile, palettes, settings?.colorPaletteIds]);
  const previewArea = useEventPreviewArea(body, event.id, area => {
    window.dispatchEvent(new CustomEvent('gba-studio:event-preview-open', { detail: { eventId: event.id } }));
    setAnchor(area.getBoundingClientRect());
  }, close, event.args?.__collapse);
  return <div ref={body}>
    {children}
    {anchor && createPortal(<canvas ref={canvas} width={240} height={160} aria-label="Background transform preview" style={{ position: 'fixed', left: Math.max(8, anchor.left - 252), top: floatingPreviewTop(anchor.top, 160), width: 240, height: 160, pointerEvents: 'none', zIndex: 2000, imageRendering: 'pixelated', background: '#222', boxShadow: '0 2px 12px #0008' }} />, document.body)}
  </div>;
}
