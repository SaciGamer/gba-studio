import { actorSpriteId } from './actorSprite';

const shapes = [[8, 8], [16, 8], [8, 16], [16, 16], [32, 8], [8, 32], [32, 16], [16, 32], [32, 32], [64, 32], [32, 64], [64, 64]];
export function spriteHardwareShape(width: number, height: number): number[] {
  const containing = shapes.filter(([w, h]) => w >= width && h >= height);
  return containing.sort((a, b) => a[0] * a[1] - b[0] * b[1])[0] ?? shapes.slice().sort((a, b) => {
    const ac = Math.ceil(width / a[0]), ar = Math.ceil(height / a[1]), bc = Math.ceil(width / b[0]), br = Math.ceil(height / b[1]);
    return ac * ar * a[0] * a[1] - bc * br * b[0] * b[1] || ac * ar - bc * br || b[0] * b[1] - a[0] * a[1];
  })[0];
}

/** Animation frames share OAM; only the largest composed canvas contributes. */
export function spriteObjectCount(sprite: any): number {
  if (!sprite) return 1;
  if (sprite.compositeColumns || sprite.compositeRows) return Math.max(1, sprite.compositeColumns ?? 1) * Math.max(1, sprite.compositeRows ?? 1);
  const dimensions: number[][] = [];
  const base = [Number(sprite.playerFrameWidth) || 16, Number(sprite.playerFrameHeight) || 16];
  const states = sprite.playerAnimationStates?.length ? sprite.playerAnimationStates : [{ animations: sprite.playerAnimations ?? [] }];
  for (const state of states) for (const animation of state.animations ?? []) {
    if (animation.frames?.length) dimensions.push(base);
    for (const frame of animation.canvasFrames ?? []) dimensions.push([Number(frame.width) || base[0], Number(frame.height) || base[1]]);
  }
  if (!dimensions.length) dimensions.push(base);
  const width = Math.max(...dimensions.map(size => size[0])), height = Math.max(...dimensions.map(size => size[1]));
  const shape = spriteHardwareShape(width, height);
  return Math.ceil(width / shape[0]) * Math.ceil(height / shape[1]);
}

export interface SceneSpriteBudget {
  initialSprites: number;
  peakSprites: number;
  unbounded: boolean;
  prefabCapacities: Record<string, number>;
}
interface State { actors: Set<string>; prefabs: Map<string, number>; player: boolean; stopped: boolean; flow?: 'break' | 'continue' }

/** Conservative simultaneous object demand, including script-created actors.
 * Hidden objects still occupy OAM. Mutually exclusive branches are alternatives;
 * despawn releases demand, while repeated persistent spawns reach the warning.
 */
export function calculateSceneSpriteBudget(scene: any, options: { sprites?: any[]; prefabs?: any[]; scripts?: any[]; playerSpriteId?: string; hasPlayer?: boolean } = {}): SceneSpriteBudget {
  const sprites = new Map((options.sprites ?? []).filter(value => !value._deleted).map(value => [value.id, value]));
  const prefabs = new Map((options.prefabs ?? []).filter(value => !value._deleted && value.type === 'actor').map(value => [value.id, value]));
  const scripts = new Map((options.scripts ?? []).filter(value => !value._deleted).map(value => [value.id, value]));
  const actors = new Map<string, any>((scene.actors ?? []).filter((value: any) => !value._deleted && !value.spawnPrefabId && actorSpriteId(value)).map((value: any) => [value.id, value]));
  const parts = (id: string) => spriteObjectCount(sprites.get(id));
  const initial: State = { actors: new Set(actors.keys()), prefabs: new Map(), player: Boolean(options.hasPlayer), stopped: false };
  const count = (state: State) => [...state.actors].reduce((sum, id) => sum + parts(actorSpriteId(actors.get(id))), state.player ? parts(options.playerSpriteId ?? '') : 0)
    + [...state.prefabs].reduce((sum, [id, amount]) => sum + amount * parts(actorSpriteId(prefabs.get(id)?.actor ?? {})), 0);
  const result: SceneSpriteBudget = { initialSprites: count(initial), peakSprites: count(initial), unbounded: false, prefabCapacities: {} };
  const clone = (state: State): State => ({ actors: new Set(state.actors), prefabs: new Map(state.prefabs), player: state.player, stopped: state.stopped, flow: state.flow });
  const observe = (states: State[]) => {
    for (const state of states) {
      result.peakSprites = Math.max(result.peakSprites, count(state));
      for (const [id, amount] of state.prefabs) result.prefabCapacities[id] = Math.max(result.prefabCapacities[id] ?? 0, Math.min(128, amount));
    }
    return states;
  };
  const signature = (state: State) => JSON.stringify([[...state.actors].sort(), [...state.prefabs].sort(), state.player, state.stopped, state.flow]);
  const compact = (states: State[]) => {
    const unique = [...new Map(states.map(state => [signature(state), state])).values()];
    if (unique.length <= 32) return unique;
    // Unresolved path explosion must warn rather than silently undercount.
    result.unbounded = true; result.peakSprites = Math.max(129, result.peakSprites);
    for (const state of unique) for (const id of state.prefabs.keys()) result.prefabCapacities[id] = 128;
    return unique.sort((a, b) => count(b) - count(a)).slice(0, 32);
  };
  const literal = (value: any): number | null => typeof value === 'number' ? value
    : value && ['number', 'literal'].includes(value.kind) && typeof value.value === 'number' ? value.value : null;
  const spawned = new Set<string>();
  const buttons = new Map<any, { events: any[]; self?: string }>();
  const condition = (args: any): boolean | null => {
    const value = (input: any): any => ['number','boolean','string'].includes(typeof input) ? input
      : input && ['literal','number','boolean','string'].includes(input.kind) ? input.value : undefined;
    const left = value(args.left), right = value(args.right);
    if(left === undefined || right === undefined) return null;
    switch(args.operator) {
      case '==': return left === right; case '!=': return left !== right;
      case '<': return left < right; case '>': return left > right;
      case '<=': return left <= right; case '>=': return left >= right;
      default: return null;
    }
  };
  let operations = 0;
  const run = (events: any[], input: State[], calls: Map<string, number> = new Map(), self?: string): State[] => {
    let states = input;
    for (const event of events ?? []) {
      if (!event || event._deleted || event.args?.__comment) continue;
      if (++operations > 30000) { result.unbounded = true; result.peakSprites = Math.max(129, result.peakSprites); for(const id of spawned) result.prefabCapacities[id] = 128; return states; }
      const args = event.args ?? {}, command = event.command;
      const next: State[] = [];
      for (const state of states) {
        if (state.stopped || state.flow) { next.push(state); continue; }
        const sourceSelf = self?.startsWith('prefab:') ? prefabs.get(self.slice(7))?.actor?.id : self;
        const id = args.actorId === '__SELF__' || (sourceSelf && args.actorId === sourceSelf) ? self : args.actorId;
        if (['EVENT_SPAWN_ACTOR', 'EVENT_ACTOR_SPAWN'].includes(command)) {
          if (args.source === 'prefab' && prefabs.has(args.prefabId)) {
            const amount = (state.prefabs.get(args.prefabId) ?? 0) + 1;
            state.prefabs.set(args.prefabId, amount); spawned.add(args.prefabId); observe([state]);
            const key = `prefab:${args.prefabId}`;
            if (!calls.has(key)) { const nested = new Map(calls); nested.set(key, count(state)); next.push(...run(prefabs.get(args.prefabId).actor?.onInitScript, [state], nested, key)); continue; }
            if(count(state) > calls.get(key)!) { result.unbounded = true; result.peakSprites = Math.max(129, result.peakSprites); result.prefabCapacities[args.prefabId] = 128; }
          } else if (actors.has(id)) state.actors.add(id);
        } else if (['EVENT_REMOVE_ACTOR', 'EVENT_ACTOR_DESPAWN'].includes(command)) {
          if (args.source === 'prefab') state.prefabs.delete(args.prefabId);
          else if (typeof id === 'string' && id.startsWith('prefab:')) { const key = id.slice(7); state.prefabs.set(key, Math.max(0, (state.prefabs.get(key) ?? 0) - 1)); }
          else if (id === '__PLAYER__') state.player = false;
          else state.actors.delete(id);
        } else if (command === 'EVENT_WAIT_FOR_BUTTON') {
          buttons.set(event, { events: event.children?.then ?? [], self });
        } else if (command === 'EVENT_CALL_SCRIPT') {
          if(!calls.has(args.scriptId)) {
            const nested = new Map(calls); nested.set(args.scriptId, count(state));
            next.push(...run(scripts.get(args.scriptId)?.events, [state], nested, self)); continue;
          }
          if(count(state) > calls.get(args.scriptId)!) { result.unbounded = true; result.peakSprites = Math.max(129, result.peakSprites); for(const id of spawned) result.prefabCapacities[id] = 128; }
        } else if (command === 'EVENT_BREAK') state.flow = 'break';
        else if (command === 'EVENT_CONTINUE') state.flow = 'continue';
        else if (['EVENT_CHANGE_SCENE', 'EVENT_SCENE_CHANGE'].includes(command)) state.stopped = true;
        else if (['EVENT_FOR', 'EVENT_WHILE'].includes(command)) {
          const start = literal(args.start), end = literal(args.end), step = literal(args.step);
          const known = command === 'EVENT_FOR' && start !== null && end !== null && step !== null && step !== 0;
          const iterations = known ? Math.max(0, Math.floor((end! - start!) / step!) + 1) : condition(args) === false ? 0 : 129;
          const limit = known ? Math.min(iterations, 4096) : iterations;
          let loop = [state];
          const exits: State[] = [];
          for (let i = 0; i < limit; ++i) {
            const before = loop.map(signature).sort().join('|');
            loop = run(event.children?.then ?? event.children?.true, loop, calls, self);
            loop = loop.filter(value => { if(value.flow === 'break') { value.flow = undefined; exits.push(value); return false; } value.flow = undefined; return true; });
            if(!loop.length) break;
            if (loop.map(signature).sort().join('|') === before || loop.every(value => value.stopped)) break;
            if (i === limit - 1 && (!known || iterations > limit)) { result.unbounded = true; result.peakSprites = Math.max(129, result.peakSprites); }
          }
          next.push(...exits, ...loop); continue;
        } else if (event.children) {
          const resolved = command === 'EVENT_IF' ? condition(args) : null;
          if(resolved !== null) { next.push(...run(resolved ? event.children.then : event.children.else, [state], calls, self)); continue; }
          const branches = Object.values(event.children).filter(Array.isArray) as any[][];
          if (!('else' in event.children)) branches.push([]);
          for (const branch of branches) next.push(...run(branch, [clone(state)], calls, self));
          continue;
        }
        next.push(state);
      }
      states = compact(observe(next));
    }
    return states;
  };
  let states = run(scene.script ?? [], [initial]);
  for (const [id, actor] of actors) {
    states = compact(states.flatMap(state => state.actors.has(id) ? run(actor.onInitScript, [state], new Map(), id) : [state]));
  }
  // Update, interact and repeatable triggers can create an accumulating pool.
  const repeated: Array<{ events: any[]; self?: string; actor?: string }> = [];
  for (const [id, actor] of actors) for (const events of [actor.onUpdateScript, actor.onInteractScript]) if (events?.length) repeated.push({ events, self: id, actor: id });
  for (const trigger of scene.triggers ?? []) if (!trigger._deleted && trigger.enabled !== false) {
    const events = [...(trigger.onEnterScript ?? []), ...(trigger.onLeaveScript ?? [])];
    if (trigger.once) states = compact([...states.map(clone), ...run(events, states.map(clone))]);
    else if (events.length) repeated.push({ events });
  }
  for (let iteration = 0; iteration < 129; ++iteration) {
    const before = states.map(signature).sort().join('|');
    for (const job of repeated) states = compact(states.flatMap(state => !job.actor || state.actors.has(job.actor) ? run(job.events, [state], new Map(), job.self) : [state]));
    for (const job of buttons.values()) states = compact(states.flatMap(state => !job.self || state.actors.has(job.self) || (job.self.startsWith('prefab:') && state.prefabs.get(job.self.slice(7))) ? run(job.events, [state], new Map(), job.self) : [state]));
    for (const id of spawned) {
      const actor = prefabs.get(id)?.actor;
      for (const events of [actor?.onUpdateScript, actor?.onInteractScript]) if (events?.length) states = compact(states.flatMap(state => state.prefabs.get(id) ? run(events, [state], new Map(), `prefab:${id}`) : [state]));
    }
    if (states.map(signature).sort().join('|') === before || states.every(state => state.stopped)) break;
    if (iteration === 128) { result.unbounded = true; result.peakSprites = Math.max(129, result.peakSprites); }
    // Pools need at most 128 native objects, even when scripts demand more.
    for (const state of states) for (const [id, amount] of state.prefabs) if (amount > 128) { state.prefabs.set(id, 128); result.unbounded = true; }
  }
  return result;
}
