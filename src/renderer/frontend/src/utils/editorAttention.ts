import { countObjectAttention, countPrefabAttention, countSceneAttention, countScriptAttention } from '../../../../shared/events/eventAttention';
import { countAssetReferenceAttention } from '../../../../shared/events/sceneReferenceCleanup';

export function getSettingsSectionAttention(settings: any, library: Array<{ id: string }>): Record<string, number> {
  const paletteIds = new Set(library.map(palette => palette.id));
  return {
    'color-options': (settings?.colorPaletteIds ?? []).slice(0, 16)
      .filter((id: unknown) => typeof id === 'string' && id && !paletteIds.has(id)).length,
  };
}

/** Data-based summaries remain available while an editor is closed. */
export function getEditorAttention(context: any, library: Array<{ id: string }>): Record<number, number> {
  const active = (items: any[] = []) => items.filter(item => !item._deleted && !item._delete);
  const scenes = active(context.scenes);
  const settings = context.settings;
  const settingsAttention = Object.values(getSettingsSectionAttention(settings, library)).reduce((total, count) => total + count, 0);
  return {
    1: scenes.reduce((count, scene) => count + countSceneAttention(scene, settings), 0)
      + active(context.scripts?.scripts).reduce((count, script) => count + countScriptAttention(script), 0)
      + active(context.prefabs?.prefabs).reduce((count, prefab) => count + countPrefabAttention(prefab), 0),
    3: active(context.spriteResources).reduce((count, sprite) => count + countObjectAttention(sprite), 0),
    4: active(context.backgrounds).reduce((count, background) => count + countAssetReferenceAttention(background), 0),
    9: settingsAttention,
  };
}
