import { createHash } from 'node:crypto';
import type { ResourceFile } from '../types/BuildTypes';
import { actorSpriteId } from '../../../shared/actorSprite';
import { calculateSceneSpriteBudget } from '../../../shared/sceneSpriteBudget';

export const PREFAB_SPAWN_CAPACITY = 128;

/** Build-only actor definitions: saved editor scenes and prefab assets stay intact. */
export function preparePrefabSpawns(files: ResourceFile[]): void {
  const prefabs = new Map<string, any>();
  for (const file of files) if (file.jsonContent?._resourceType === 'prefabs') {
    for (const prefab of (file.jsonContent as any).prefabs ?? []) if (!prefab._deleted) prefabs.set(prefab.id, prefab);
  }
  const scripts = new Map(files.filter(file => file.jsonContent?._resourceType === 'scripts').flatMap(file => ((file.jsonContent as any).scripts ?? []).map((script: any) => [script.id, script] as const)));
  const visit = (value: any, required: Set<string>, called: Set<string>): void => {
    if (!value || typeof value !== 'object' || value.args?.__comment) return;
    if (['EVENT_SPAWN_ACTOR', 'EVENT_ACTOR_SPAWN'].includes(value.command) && value.args?.source === 'prefab') {
      const id = value.args.prefabId;
      const prefab = prefabs.get(id);
      if (!prefab || prefab.type !== 'actor' || !prefab.actor) throw new Error(`Spawn Actor ${value.id}: missing actor prefab '${id ?? ''}'`);
      if (!actorSpriteId(prefab.actor)) throw new Error(`Spawn Actor ${value.id}: prefab '${prefab.name ?? id}' has no sprite`);
      if (!required.has(id)) { required.add(id); visit(prefab.actor, required, called); }
    }
    if (value.command === 'EVENT_CALL_SCRIPT' && !called.has(value.args?.scriptId)) {
      called.add(value.args?.scriptId);
      visit(scripts.get(value.args?.scriptId), required, called);
    }
    for (const child of Object.values(value)) visit(child, required, called);
  };
  // Validate reusable scripts too, but only reserve pools in scenes that can
  // actually execute them. Inactive pools must not multiply across the project.
  for (const script of scripts.values()) visit(script, new Set(), new Set());
  for (const file of files) {
    if (file.jsonContent?._resourceType !== 'scene') continue;
    const scene = file.jsonContent as any;
    const actors = [...(scene.actors ?? []).filter((actor: any) => !actor.spawnPrefabId)];
    const required = new Set<string>();
    visit({ ...scene, actors }, required, new Set());
    const budget = calculateSceneSpriteBudget({ ...scene, actors }, { prefabs: [...prefabs.values()], scripts: [...scripts.values()] });
    for (const id of required) {
      const prefab = prefabs.get(id)!;
      const prefix = `__prefab_${createHash('sha256').update(id).digest('hex').slice(0, 24)}`;
      const capacity = Math.min(PREFAB_SPAWN_CAPACITY, Math.max(1, budget.prefabCapacities[id] ?? (budget.unbounded ? 128 : 1)));
      for (let slot = 0; slot < capacity; slot++) {
        const instanceId = `${prefix}_${slot}`;
        const actor = structuredClone(prefab.actor);
        const rewrite = (value: any): void => {
          if (!value || typeof value !== 'object') return;
          if (typeof value.command === 'string' && value.id) value.id = `${instanceId}:${value.id}`;
          for (const [key, child] of Object.entries(value)) {
            if (key === 'actorId' && child === prefab.actor.id) value[key] = '__SELF__';
            else rewrite(child);
          }
        };
        rewrite(actor);
        actors.push({ ...actor, id: instanceId, actorId: instanceId, spriteId: actorSpriteId(prefab.actor),
          spawnPrefabId: id, name: prefab.name, direction: 'right', x: 0, y: 0, anchor: 'center' });
      }
    }
    if (required.size || actors.length !== (scene.actors ?? []).length) file.jsonContent = { ...scene, actors };
  }
}
