import { useEffect, useMemo, useState } from 'react';
import type { ITileAnimation } from '@/providers/contexts/interfaces/ISceneElement';
import { isPanelResizing } from './panelResize';
import { isPlayerTargetDragging } from './playerTargetDrag';

export type TileAnimationFrame = { layer: number; target: number; frame: number; tilesetId?: string; targetTilesetId?: string };

export function resolveTileAnimationFrames(animations: readonly ITileAnimation[], elapsedTicks: number, sceneId: string, hidden: readonly string[], layerTilesetIds: Readonly<Record<number, string>> = {}): TileAnimationFrame[] {
  return animations.flatMap((animation, index) => {
    const id = animation.id ?? `tile-animation-${index}`;
    if(hidden.includes(`${sceneId}:${id}`) || !animation.frameTileIndices.length) return [];
    const count = animation.frameTileIndices.length;
    const start = Math.max(0, Math.min(count - 1, animation.initialFrame ?? 0));
    const advance = Math.floor(elapsedTicks / Math.max(1, animation.durationFrames));
    const frame = animation.loop ? (start + advance) % count : Math.min(count - 1, start + advance);
    return [{
      layer: animation.layerId,
      target: animation.targetTileIndex,
      frame: animation.frameTileIndices[frame],
      tilesetId: animation.frameTilesetIds?.[frame] ?? layerTilesetIds[animation.layerId],
      targetTilesetId: animation.targetTilesetId,
    }];
  });
}

export function useSceneTileAnimationFrames(sceneId: string, animations: readonly ITileAnimation[] | undefined, hidden: readonly string[] | undefined, playing: boolean, layerTilesetIds: Readonly<Record<number, string>> = {}) {
  const signature = JSON.stringify([animations ?? [], hidden ?? [], layerTilesetIds]);
  const initial = useMemo(() => resolveTileAnimationFrames(animations ?? [], 0, sceneId, hidden ?? [], layerTilesetIds), [sceneId, signature]);
  const [frames, setFrames] = useState(initial);
  useEffect(() => {
    setFrames(initial);
    if(!playing || !initial.length) return;
    let started = performance.now();
    const pauseReasons = new Set<string>([...(isPanelResizing() ? ['resize'] : []), ...(isPlayerTargetDragging() ? ['target'] : [])]);
    let pausedAt: number | null = pauseReasons.size ? started : null;
    let pausedDuration = 0;
    let request = 0;
    let previous = JSON.stringify(initial);
    const setPaused = (event: Event) => {
      const reason = event.type === 'gba-studio:panel-resize' ? 'resize' : event.type === 'gba-studio:player-target-drag' ? 'target' : 'pan';
      const paused = (event as CustomEvent<{ paused?: boolean }>).detail?.paused === true;
      if (paused) pauseReasons.add(reason); else pauseReasons.delete(reason);
      if(pauseReasons.size && pausedAt === null) {
        pausedAt = performance.now();
        cancelAnimationFrame(request);
      } else if(!pauseReasons.size && pausedAt !== null) {
        const now = performance.now();
        pausedDuration += now - pausedAt;
        pausedAt = null;
        request = requestAnimationFrame(update);
      }
    };
    const update = () => {
      if(pausedAt !== null) return;
      const next = resolveTileAnimationFrames(animations ?? [], Math.floor((performance.now() - started - pausedDuration) * 60 / 1000), sceneId, hidden ?? [], layerTilesetIds);
      const value = JSON.stringify(next);
      if(value !== previous) { previous = value; setFrames(next); }
      request = requestAnimationFrame(update);
    };
    window.addEventListener('gba-studio:world-pan', setPaused);
    window.addEventListener('gba-studio:panel-resize', setPaused);
    window.addEventListener('gba-studio:player-target-drag', setPaused);
    if (!pauseReasons.size) request = requestAnimationFrame(update);
    return () => {
      window.removeEventListener('gba-studio:world-pan', setPaused);
      window.removeEventListener('gba-studio:panel-resize', setPaused);
      window.removeEventListener('gba-studio:player-target-drag', setPaused);
      cancelAnimationFrame(request);
    };
  }, [initial, playing]);
  return frames;
}

/** Replace 8×8 source tiles before composing the scene, preserving alpha and palette. */
export function paintAnimatedTileset(source: HTMLImageElement | HTMLCanvasElement, layer: number, frames: readonly TileAnimationFrame[], tilesetId?: string, sourceTilesets: Readonly<Record<string, HTMLImageElement | HTMLCanvasElement>> = {}): HTMLImageElement | HTMLCanvasElement {
  const selected = frames.filter(frame => frame.layer === layer && (frame.targetTilesetId ? frame.targetTilesetId === tilesetId : (!frame.tilesetId || frame.tilesetId === tilesetId)));
  if(!selected.length) return source;
  const width = source instanceof HTMLCanvasElement ? source.width : source.naturalWidth;
  const height = source instanceof HTMLCanvasElement ? source.height : source.naturalHeight;
  const columns = Math.floor(width / 8), count = columns * Math.floor(height / 8);
  if(!columns) return source;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  if(!context) return source;
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0);
  for(const { target, frame, tilesetId: frameTilesetId } of selected) {
    const frameImage = !frameTilesetId || frameTilesetId === tilesetId ? source : sourceTilesets[frameTilesetId];
    if(!frameImage) continue;
    const frameWidth = frameImage instanceof HTMLCanvasElement ? frameImage.width : frameImage.naturalWidth;
    const frameHeight = frameImage instanceof HTMLCanvasElement ? frameImage.height : frameImage.naturalHeight;
    const frameColumns = Math.floor(frameWidth / 8);
    const frameCount = frameColumns * Math.floor(frameHeight / 8);
    if(target < 0 || target >= count || frame < 0 || frame >= frameCount || frameColumns <= 0) continue;
    const x = target % columns * 8, y = Math.floor(target / columns) * 8;
    context.clearRect(x, y, 8, 8);
    // Always read original pixels; two animations may refer to each other's tiles.
    context.drawImage(frameImage, frame % frameColumns * 8, Math.floor(frame / frameColumns) * 8, 8, 8, x, y, 8, 8);
  }
  return canvas;
}
