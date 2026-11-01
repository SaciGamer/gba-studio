import { BACKGROUND_ANIMATE, backgroundSheetGeometry } from './backgroundSheetAnimation';
export const AFFINE_TRANSFORM_EVENTS = new Set(['EVENT_BACKGROUND_SET_SCALE', 'EVENT_BACKGROUND_SET_ROTATION', 'EVENT_BACKGROUND_SET_SHEAR']);
export type BackgroundIssue = { code: 'tiles' | 'missing' | 'unreadable' | 'layers' | 'geometry' | 'regularTiles' | 'dimensions'; scene: string; layer: number; image?: string; count?: number };
export type BackgroundCompatibility = { issues: BackgroundIssue[]; affine?: boolean; count?: number; image?: string };

export function getBackgroundCompatibility(args?: Record<string, any>): BackgroundCompatibility | undefined {
  const value = args?.__backgroundCompatibility;
  return value && typeof value === 'object' && Array.isArray(value.issues) ? value : undefined;
}

/** Follow the same scene-wide conversion policy as the compiler, including replacements and script calls. */
export function collectBackgroundManipulations(scene: any, definitions: ReadonlyMap<string, any>) {
  const events = new Map<string, any>(), visited = new Set<string>();
  const visit = (value: any): void => {
    if (!value || typeof value !== 'object' || value._deleted) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value.command) {
      if (value.args?.__comment || value.disabled === true || value.enabled === false) return;
      if (AFFINE_TRANSFORM_EVENTS.has(value.command) || (value.command === 'EVENT_CHANGE_LAYER' || value.command === BACKGROUND_ANIMATE)) events.set(value.id, value);
      if (value.command === 'EVENT_CALL_SCRIPT' && !visited.has(value.args?.scriptId)) {
        visited.add(value.args?.scriptId);
        const definition = definitions.get(value.args?.scriptId);
        if (definition && !definition._deleted) visit(definition.events ?? definition.script);
      }
      visit(value.children);
    } else for (const [key, child] of Object.entries(value))
      if (key !== 'args' && key !== 'backgrounds' && !key.toLowerCase().includes('tile')) visit(child);
  };
  visit(scene);
  return [...events.values()];
}

/** Structural sharing is important: validation must not itself trigger another edit/scan. */
export function applyBackgroundCompatibility<T>(value: T, results: ReadonlyMap<string, BackgroundCompatibility>): T {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    const next = value.map(item => applyBackgroundCompatibility(item, results));
    return next.some((item, index) => item !== value[index]) ? next as T : value;
  }
  const source = value as Record<string, any>;
  let next = source;
  for (const [key, child] of Object.entries(source)) {
    if (key === 'args') continue;
    const updated = applyBackgroundCompatibility(child, results);
    if (updated !== child) { if (next === source) next = { ...source }; next[key] = updated; }
  }
  if (source.command) {
    const result = results.get(source.id);
    if (JSON.stringify(result) !== JSON.stringify(source.args?.__backgroundCompatibility)) {
      if (next === source) next = { ...source };
      next.args = { ...source.args };
      if (result) next.args.__backgroundCompatibility = result;
      else delete next.args.__backgroundCompatibility;
    }
  }
  return next as T;
}

export async function validateBackgroundCompatibility(scenes: readonly any[], scripts: readonly any[], backgrounds: readonly any[], inspect: (scene: any, layer: any, background: any, replacement: boolean, animation?: any, affine?: boolean) => Promise<number>) {
  const definitions = new Map(scripts.filter(script => !script._deleted).map(script => [script.id, script]));
  const images = new Map(backgrounds.filter(image => !image._deleted).map(image => [image.id, image]));
  const results = new Map<string, BackgroundCompatibility>();
  const add = (event: any, result: BackgroundCompatibility) => {
    const previous = results.get(event.id);
    if (previous) result.issues = [...previous.issues, ...result.issues].filter((issue, index, all) => all.findIndex(other => JSON.stringify(other) === JSON.stringify(issue)) === index);
    results.set(event.id, result);
  };
  for (const scene of scenes) {
    if (scene._deleted) continue;
    const events = collectBackgroundManipulations(scene, definitions);
    const transforms = events.filter(event => AFFINE_TRANSFORM_EVENTS.has(event.command));
    const bitmap = ['logo', 'pointclick', 'pointnclick'].includes(String(scene.sceneType).toLowerCase().replace(/[^a-z]/g, ''));
    const layerIds = new Set<number>(transforms.map(event => Number(event.args?.layerId ?? 0)));
    for (const event of events.filter(event => event.command === BACKGROUND_ANIMATE)) {
      const layerId = bitmap ? 2 : Number(event.args?.layerId ?? 0);
      const image = images.get(event.args?.backgroundId);
      const base = { scene: scene.name, layer: layerId, image: image?.name ?? event.args?.backgroundId };
      const issues: BackgroundIssue[] = [];
      let count: number | undefined;
      if (!image) issues.push({ ...base, code: 'missing' });
      else {
        try {
          const sheet = backgroundSheetGeometry(event.args ?? {}, image);
          if (bitmap) {
            // Direct bitmaps do not have the affine/regular tile limit, but
            // their source file and selected range still need validation.
            await inspect(scene, { layerId }, image, true, event.args, false);
          } else {
            if (sheet.paddedImageWidth > 16384 || sheet.paddedImageHeight > 16384) issues.push({ ...base, code: 'dimensions' });
            else {
              count = await inspect(scene, { layerId }, image, true, event.args, layerIds.has(layerId));
              if (count > (layerIds.has(layerId) ? 256 : 1024)) issues.push({ ...base, code: layerIds.has(layerId) ? 'tiles' : 'regularTiles', count });
            }
          }
        } catch { issues.push({ ...base, code: 'geometry' }); }
      }
      add(event, { issues, affine: !bitmap && layerIds.has(layerId), image: base.image, count });
    }
    if (bitmap) { for (const event of events) if (event.command !== BACKGROUND_ANIMATE) add(event, { issues: [], affine: false }); continue; }
    const active = new Set<number>((scene.backgrounds ?? []).filter((layer: any) => layer.backgroundId || layer.tileMap?.some((row: number[]) => row.some(tile => tile >= 0))).map((layer: any) => Number(layer.layerId)));
    const changes = events.filter(event => event.command === 'EVENT_CHANGE_LAYER' || event.command === BACKGROUND_ANIMATE);
    changes.filter(event => event.args?.backgroundId).forEach(event => active.add(Number(event.args?.layerId ?? 0)));
    const affine = [...active].filter(layer => layerIds.has(layer)).length, regular = active.size - affine;
    const crowded = affine > 2 || affine === 2 && regular > 0 || affine === 1 && regular > 2;
    if (crowded) for (const event of changes) {
      const layer = Number(event.args?.layerId ?? 0);
      const previous = results.get(event.id);
      add(event, { ...previous, affine: layerIds.has(layer), issues: [...(previous?.issues ?? []), { code: 'layers', scene: scene.name, layer }] });
    }
    for (const id of layerIds) {
      const layer = scene.backgrounds?.find((item: any) => Number(item.layerId) === id) ?? { layerId: id };
      const replacements = changes.filter(event => Number(event.args?.layerId ?? 0) === id);
      const targets = [{ backgroundId: layer.backgroundId, replacement: false, event: undefined as any }, ...replacements.filter(event => event.args?.backgroundId).map(event => ({ backgroundId: event.args.backgroundId, replacement: true, event }))];
      const allIssues: BackgroundIssue[] = [];
      if (crowded) allIssues.push({ code: 'layers', scene: scene.name, layer: id });
      for (const target of targets) {
        if (target.event?.command === BACKGROUND_ANIMATE) {
          const status = results.get(target.event.id)!;
          allIssues.push(...status.issues);
          if (crowded) add(target.event, { ...status, issues: [...status.issues, { code: 'layers', scene: scene.name, layer: id }] });
          continue;
        }
        const image = images.get(target.backgroundId);
        const issues: BackgroundIssue[] = [];
        const base = { scene: scene.name, layer: id, image: image?.name ?? image?.filename ?? target.backgroundId };
        let count: number | undefined;
        const painted = !target.replacement && layer.tileMap?.some((row: number[]) => row.some(tile => tile >= 0));
        if (!image && !painted) {
          // Empty layers are accepted by preparation and can be populated later.
          // Only a non-empty reference to an unavailable asset is an error.
          if (target.backgroundId) issues.push({ ...base, code: 'missing' });
        } else {
          try { count = await inspect(scene, layer, image, target.replacement); if (count > 256) issues.push({ ...base, code: 'tiles', count }); }
          catch { issues.push({ ...base, code: 'unreadable' }); }
        }
        allIssues.push(...issues);
        if (target.event) add(target.event, { affine: true, count, image: base.image, issues: [...issues, ...(crowded ? [{ ...base, code: 'layers' as const }] : [])] });
      }
      for (const event of transforms.filter(event => Number(event.args?.layerId ?? 0) === id)) add(event, { affine: true, issues: allIssues });
    }
  }
  return results;
}
