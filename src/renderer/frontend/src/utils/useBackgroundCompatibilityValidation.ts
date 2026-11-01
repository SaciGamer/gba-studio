import { useEffect, useMemo, useRef, useState } from 'react';
import useAppContexts from '@/providers/contexts/AppContexts';
import { applyBackgroundCompatibility, validateBackgroundCompatibility } from '../../../../shared/events/backgroundCompatibility';
import { inspectAffineLayer, inspectBackgroundAnimation } from './backgroundCompatibility';
import { getPreviewPalettes, loadPaletteLibrary } from '../components/resourceEditors/paletteLibrary';

export default function useBackgroundCompatibilityValidation(loading: boolean) {
  const { scenes, scripts, backgrounds, palettes, settings, settingUtils, setScenes, setScripts, setElementSelected } = useAppContexts();
  const [revision, setRevision] = useState(0);
  const cache = useRef(new Map<string, Promise<number>>());
  useEffect(() => {
    const reload = () => { cache.current.clear(); setRevision(value => value + 1); };
    window.addEventListener('gba-studio:assets-reloaded', reload);
    return () => window.removeEventListener('gba-studio:assets-reloaded', reload);
  }, []);
  const signature = useMemo(() => JSON.stringify([scenes, scripts.scripts, backgrounds, palettes.palettes, settings?.colorPaletteIds, settingUtils.projectPathFile, settingUtils.localImagePath, settingUtils.localImagePathHD], (key, value) =>
    key === '__backgroundCompatibility' || key === '_saved' || key === '__collapse' || key === 'editorPosition' ? undefined : value),
    [scenes, scripts.scripts, backgrounds, palettes.palettes, settings?.colorPaletteIds, settingUtils.projectPathFile, settingUtils.localImagePath, settingUtils.localImagePathHD]);
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const result = await validateBackgroundCompatibility(scenes, scripts.scripts, backgrounds, (scene, layer, image, replacement, animation, affine) => {
        const context = { settingUtils, palettes: getPreviewPalettes(palettes.palettes.length ? palettes.palettes : loadPaletteLibrary(), settings?.colorPaletteIds) };
        const bitmap = ['logo', 'pointclick', 'pointnclick'].includes(String(scene.sceneType).toLowerCase().replace(/[^a-z]/g, ''));
        const animationGeometry = animation ? [animation.backgroundId, animation.direction, animation.frameWidth, animation.frameHeight, animation.step, animation.frameCount, animation.startFrame, animation.endFrame, animation.reverse, affine, bitmap] : undefined;
        const key = JSON.stringify([revision, settingUtils.projectPathFile, settingUtils.localImagePath, settingUtils.localImagePathHD, scene.width, scene.height, scene.gridSize, layer, image, replacement, scene.tileAnimations, context.palettes, animationGeometry]);
        let pending = cache.current.get(key);
        if (!pending) {
          pending = animation ? inspectBackgroundAnimation(image, context, animation, affine === true, bitmap) : inspectAffineLayer(scene, layer, image, context, replacement);
          cache.current.set(key, pending);
          if (cache.current.size > 128) cache.current.delete(cache.current.keys().next().value!);
          void pending.catch(() => cache.current.delete(key));
        }
        return pending;
      });
      if (cancelled) return;
      setScenes(previous => applyBackgroundCompatibility(previous, result));
      setScripts(previous => applyBackgroundCompatibility(previous, result));
      setElementSelected((previous: any) => applyBackgroundCompatibility(previous, result));
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [loading, signature, revision]);
}
