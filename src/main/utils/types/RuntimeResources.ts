import { LOCAL_VARIABLES, isLocalVariable } from '../../../shared/localVariables';
import { SceneInputMaps, validateSceneInputMaps } from '../../../shared/inputMap';
import { resolveInputGroups, InputGroups } from '../../../shared/inputGroups';
import type { CanvasAnimationPlan } from '../builders/spriteCanvasPlan';
import type { JsonResourceDefault, ResourceFile } from './BuildTypes';
import { toRuntimeScripts, type RuntimeScript } from './RuntimeScript';
import { withEventContext } from '../events/EventDiagnostics';
import { actorSpriteId } from '../../../shared/actorSprite';
import { validateScriptParameters, validateScriptArgument, validateScriptArgumentDomain, isScriptParameter, type ScriptParameter, type ScriptArgument, type ScriptArgumentDomain } from '../../../shared/scriptParameters';
import { parseNumericFormula } from '../../../shared/numericFormula';
import { compileScriptGraphWithSourceMap } from '../events/ScriptGraphCompiler';

/** Materialized output: no source rectangles, editable frames or pieces. */
export type PreparedSpriteAsset = NonNullable<JsonResourceDefault['__spriteCanvas']>;

export interface RuntimeBackground {
  _resourceType: 'background'; id: string; graphicsName: string;
  imageWidth: number; imageHeight: number;
  slotPaletteBindings?: Array<{ marker: number; slot: number; color: number }>;
}
export interface RuntimeSprite {
  _resourceType: 'sprite'; id: string; name: string;
  graphicsName: string;
  playerFrameWidth: number; playerFrameHeight: number; playerAnimSpeed: number; playerIdleFrame: number;
  playerCanvasWidth: number; playerCanvasHeight: number; compositeColumns: number; compositeRows: number;
  playerCanvasOriginX: number; playerCanvasOriginY: number;
  playerCollisionX: number; playerCollisionY: number; playerCollisionWidth: number; playerCollisionHeight: number;
  animations: Array<Omit<CanvasAnimationPlan, 'stateType'>>;
}
export interface RuntimeLayer {
  affine?: boolean; affineGraphicsName?: string;
  layerId: number; backgroundId: string; x: number; y: number; zOrder: number;
  paletteId?: string;
  tileMapCellOverrides: Array<{ index: number; tileIndex: number; horizontalFlip: boolean; verticalFlip: boolean; paletteId: number }>;
}
export interface RuntimeActor {
  keepRunningWhileOffscreen: boolean;
  spawnPrefabId?: string;
  id: string; spriteId: string; x: number; y: number; direction: string;
  anchor: 'center'; animationSpeed: number; onInitScript: RuntimeScript[]; onInteractScript: RuntimeScript[]; onUpdateScript: RuntimeScript[];
}
export interface RuntimeCollision { x: number; y: number; width: number; height: number; collisionSide: string }
export interface RuntimeTrigger {
  id: string; x: number; y: number; width: number; height: number; activation: string;
  enabled: boolean; once: boolean; cooldownFrames: number;
  onEnterScript: RuntimeScript[]; onLeaveScript: RuntimeScript[];
}
export interface RuntimeScene {
  _resourceType: 'scene'; id: string; name: string; width: number; height: number; sceneType: string;
  cameraPosition: { x: number; y: number }; backgrounds: RuntimeLayer[];
  script: RuntimeScript[]; actors: RuntimeActor[]; triggers: RuntimeTrigger[]; collisions: RuntimeCollision[];
  tileAnimations: Array<{ layerId: number; targetTileIndex: number; frameTileIndices: number[]; durationFrames: number; loop: boolean; initialFrame: number }>;
  spawnerTimelines: Array<{ id: string; entries: Array<{ frame: number; archetypeId: string; x: number; y: number; patternId: string; dropId: string }> }>;
}
export interface RuntimeSettings {
  _resourceType: 'settings'; id?: string;
  startSceneId: string; startX: number; startY: number; startMoveSpeed: number; startAnimSpeed: number;
  startDirection: string; fadeDirection: 0 | 1;
  playerSpriteId?: string; uiCursorImage: string;
  inputMap: Record<string, string[]>;
  inputMapsBySceneType?: SceneInputMaps;
  inputGroups?: InputGroups;
  colorPaletteIds?: Array<string | null>;
  combatConfig?: NonNullable<JsonResourceDefault['combatConfig']>;
  shooterConfig?: Omit<NonNullable<JsonResourceDefault['shooterConfig']>, 'playerHitPoints'>;
}
export interface RuntimeVariables {
  _resourceType: 'variables'; id?: string;
  variables: Array<{ id: string; symbol: string; type: 'number' | 'boolean' | 'string'; initialValue: number | boolean | string }>;
}
export interface RuntimeScriptDefinitions {
  _resourceType: 'scripts'; id?: string; scripts: Array<{ id: string; events: RuntimeScript[]; parameters?: import('../../../shared/scriptParameters').ScriptParameter[] }>;
}
export interface RuntimePalette { _resourceType: 'palette'; id: string; colors: string[] }
export type RuntimeResource = RuntimeBackground | RuntimeSprite | RuntimeScene | RuntimeSettings | RuntimeVariables | RuntimeScriptDefinitions | RuntimePalette;
/** An emitted artifact, distinct from a file read for asset preparation. */
export interface RuntimeResourceFile extends ResourceFile { readonly runtimeResource: RuntimeResource }
export interface RomBuildConfig { romTitle: string; romCode: string }

type Source = Record<string, any>;
function object(value: unknown, owner: string): Source {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${owner}: expected an object`);
  return value as Source;
}
function list(value: unknown, owner: string): any[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${owner}: expected an array`);
  return value;
}
function id(value: unknown, owner: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${owner}: missing id`);
  return value;
}
function number(value: unknown, fallback: number, owner: string): number {
  if (value === undefined || value === null) return fallback;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${owner}: expected a finite number`);
  return result;
}
const name = (value: unknown) => String(value ?? '').toLowerCase().replace(/ /g, '_').replaceAll('-', '_');
const graphicsName = (filename: string) => {
  const stem = filename.replace(/\.[^/.]+$/, '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().replace(/_+/g, '_');
  return /^[a-z]/.test(stem) ? stem : `a_${stem}`;
};
const scripts = (value: unknown, owner: string, selfActorId?: string) => toRuntimeScripts(list(value, owner), selfActorId);

export function toRuntimeBackground(input: unknown): RuntimeBackground {
  const source = object(input, 'background');
  if (typeof source.filename !== 'string' || !source.filename) throw new Error(`Background ${source.id ?? '<unknown>'}: missing asset filename`);
  return { _resourceType: 'background', id: id(source.id, 'background'), graphicsName: graphicsName(source.filename),
    imageWidth: number(source.imageWidth, 0, 'background width'), imageHeight: number(source.imageHeight, 0, 'background height'),
    ...(source.__slotPaletteBindings?.length ? { slotPaletteBindings: source.__slotPaletteBindings.map((binding: any) => ({ marker: binding.marker, slot: binding.slot, color: binding.color })) } : {}) };
}

export function toRuntimeSprite(input: unknown, prepared: PreparedSpriteAsset): RuntimeSprite {
  const source = object(input, 'sprite');
  if (!prepared || !prepared.graphicsName) throw new Error(`Sprite ${source.id ?? '<unknown>'}: materialized asset required`);
  return { _resourceType: 'sprite', id: id(source.id, 'sprite'), name: name(source.name),
    graphicsName: prepared.graphicsName,
    playerFrameWidth: prepared.frameWidth, playerFrameHeight: prepared.frameHeight, playerIdleFrame: prepared.idleFrame,
    playerCanvasWidth: prepared.canvasWidth, playerCanvasHeight: prepared.canvasHeight,
    compositeColumns: prepared.partsColumns, compositeRows: prepared.partsRows,
    playerAnimSpeed: number(source.playerAnimSpeed, 6, 'sprite animation speed'),
    playerCanvasOriginX: number(source.playerCanvasOriginX, 0, 'sprite origin x'), playerCanvasOriginY: number(source.playerCanvasOriginY, 8, 'sprite origin y'),
    playerCollisionX: number(source.playerCollisionX, 0, 'sprite collision x'), playerCollisionY: number(source.playerCollisionY, 0, 'sprite collision y'),
    playerCollisionWidth: number(source.playerCollisionWidth, 16, 'sprite collision width'), playerCollisionHeight: number(source.playerCollisionHeight, 8, 'sprite collision height'),
    animations: prepared.animations.map(animation => ({ stateId: animation.stateId, id: animation.id, type: animation.type,
      frames: [...animation.frames], flipRightToCreateLeftFrames: animation.flipRightToCreateLeftFrames })),
  };
}

export function toRuntimeScene(input: unknown): RuntimeScene {
  const source = object(input, 'scene');
  const sceneId = id(source.id, 'scene');
  const runtimeBackgrounds = list(source.backgrounds, 'scene backgrounds').map(layer => {
    const layerId = Math.max(0, Math.min(3, Math.trunc(number(layer.layerId, 0, 'layer id'))));
    const background: RuntimeLayer = { layerId, backgroundId: String(layer.backgroundId ?? ''),
      x: number(layer.x, 0, 'layer x'), y: number(layer.y, 0, 'layer y'), zOrder: Math.max(-32767, Math.min(32767, Math.trunc(number(layer.zOrder, layerId, 'layer z order')))),
      tileMapCellOverrides: list(layer.tileMapCellOverrides, 'map overrides').map(cell => ({ index: cell.index, tileIndex: cell.tileIndex, horizontalFlip: cell.horizontalFlip === true, verticalFlip: cell.verticalFlip === true, paletteId: cell.paletteId ?? 0 })) };
    if (typeof layer.paletteId === 'string') background.paletteId = layer.paletteId;
    if (layer.__affine === true) { background.affine = true; background.affineGraphicsName = layer.__affineGraphicsName; }
    return background;
  });
  const result: RuntimeScene = {
    _resourceType: 'scene', id: sceneId, name: name(source.name), width: number(source.width, 240, 'scene width'), height: number(source.height, 160, 'scene height'), sceneType: String(source.sceneType ?? 'Top Down'),
    cameraPosition: { x: number(source.cameraPosition?.x, 0, 'camera x'), y: number(source.cameraPosition?.y, 0, 'camera y') },
    backgrounds: runtimeBackgrounds,
    script: scripts(source.script, 'scene script'),
    actors: list(source.actors, 'scene actors').map((actor, index) => ({ id: String(actor.id ?? actor.actorId ?? index), spriteId: actorSpriteId(actor), ...(actor.spawnPrefabId ? { spawnPrefabId: String(actor.spawnPrefabId) } : {}),
      x: number(actor.x, 0, 'actor x') + (actor.anchor === 'center' ? 0 : Math.max(1, number(actor.width, 16, 'actor width')) / 2),
      y: number(actor.y, 0, 'actor y') + (actor.anchor === 'center' ? 0 : Math.max(1, number(actor.height, 16, 'actor height')) / 2),
      keepRunningWhileOffscreen: actor.keepRunningWhileOffscreen === true, anchor: 'center', direction: String(actor.direction ?? 'right'), animationSpeed: number(actor.animationSpeed, 6, 'actor animation speed'), onInitScript: scripts(actor.onInitScript, 'actor initialization', String(actor.id ?? actor.actorId ?? index)), onInteractScript: scripts(actor.onInteractScript, 'actor interaction', String(actor.id ?? actor.actorId ?? index)), onUpdateScript: scripts(actor.onUpdateScript, 'actor update', String(actor.id ?? actor.actorId ?? index)) })),
    triggers: list(source.triggers, 'scene triggers').map((trigger, index) => ({ id: String(trigger.id ?? index), x: number(trigger.x, 0, 'trigger x'), y: number(trigger.y, 0, 'trigger y'),
      width: number(trigger.width, 0, 'trigger width'), height: number(trigger.height, 0, 'trigger height'), activation: String(trigger.activation ?? 'enter'), enabled: trigger.enabled !== false,
      once: trigger.once === true, cooldownFrames: number(trigger.cooldownFrames, 0, 'trigger cooldown'), onEnterScript: scripts(trigger.onEnterScript, 'trigger enter'), onLeaveScript: scripts(trigger.onLeaveScript, 'trigger leave') })),
    collisions: list(source.collisions, 'scene collisions').map(collision => ({ x: number(collision.x, 0, 'collision x'), y: number(collision.y, 0, 'collision y'),
      width: number(collision.width, 0, 'collision width'), height: number(collision.height, 0, 'collision height'), collisionSide: String(collision.collisionSide ?? 'solid') })),
    tileAnimations: list(source.tileAnimations, 'tile animations').filter(animation => {
      const layerId = Math.max(0, Math.min(3, Math.trunc(number(animation.layerId, 0, 'tile animation layer'))));
      return runtimeBackgrounds.some(layer => layer.layerId === layerId && layer.backgroundId.length > 0);
    }).map(animation => ({ layerId: animation.layerId, targetTileIndex: animation.targetTileIndex, frameTileIndices: [...list(animation.frameTileIndices, 'tile frames')],
      durationFrames: animation.durationFrames, loop: animation.loop !== false, initialFrame: animation.initialFrame ?? 0 })),
    spawnerTimelines: list(source.spawnerTimelines, 'spawner timelines').map((timeline, index) => ({ id: String(timeline.id ?? index), entries: list(timeline.entries, 'spawner entries').map(entry => ({ frame: entry.frame,
      archetypeId: String(entry.archetypeId ?? entry.archetype_id ?? ''), x: number(entry.x, 0, 'spawn x'), y: number(entry.y, 0, 'spawn y'), patternId: String(entry.patternId ?? entry.pattern_id ?? ''), dropId: String(entry.dropId ?? entry.drop_id ?? '') })) })),
  };
  return result;
}

export function toRuntimeSettings(input: unknown): RuntimeSettings {
  const source = object(input, 'settings');
  validateSceneInputMaps(source.inputMapsBySceneType);
  const inputMap: Record<string, string[]> = {};
  for (const [action, buttons] of Object.entries(source.inputMap ?? {})) inputMap[action] = list(buttons, `input ${action}`).map(button => String(button));
  const result: RuntimeSettings = { _resourceType: 'settings', startSceneId: String(source.startSceneId ?? ''), startX: number(source.startX, 0, 'start x'), startY: number(source.startY, 0, 'start y'),
    startMoveSpeed: number(source.startMoveSpeed ?? source.moveSpeed, 1, 'move speed'), startAnimSpeed: number(source.startAnimSpeed ?? source.animSpeed, 4, 'animation speed'),
    startDirection: String(source.startDirection ?? source.direction ?? 'down'), fadeDirection: Number(source.fadeDirection) === 1 ? 1 : 0,
    uiCursorImage: String(source.uiCursorImage ?? 'cursor.png'), inputMap, inputMapsBySceneType: source.inputMapsBySceneType, inputGroups: (({ all, ...groups }) => groups)(resolveInputGroups(source.inputGroups)) as InputGroups };
  if (typeof source.id === 'string') result.id = source.id;
  if (Array.isArray(source.colorPaletteIds)) result.colorPaletteIds = Array.from({ length: 16 }, (_, index) => typeof source.colorPaletteIds[index] === 'string' ? source.colorPaletteIds[index] : null);
  if (typeof source.playerSpriteId === 'string') result.playerSpriteId = source.playerSpriteId;
  if (source.combatConfig) {
    const c = object(source.combatConfig, 'combat');
    result.combatConfig = { maxProjectiles: number(c.maxProjectiles, 64, 'max projectiles'), maxEnemies: number(c.maxEnemies, 32, 'max enemies'), maxPickups: number(c.maxPickups, 16, 'max pickups'),
      playerHitPoints: number(c.playerHitPoints, 3, 'player hp'), defaultDamage: number(c.defaultDamage, 1, 'damage'), collisionRules: list(c.collisionRules, 'collision rules').map(rule => ({ sourceGroup: rule.sourceGroup, targetGroup: rule.targetGroup })) };
  }
  if (source.shooterConfig) {
    const c = object(source.shooterConfig, 'shooter');
    result.shooterConfig = { defaultWaveId: String(c.defaultWaveId ?? ''), projectileSpriteId: String(c.projectileSpriteId ?? ''), defaultDamage: number(c.defaultDamage, 1, 'shooter damage'), bossHitPoints: number(c.bossHitPoints, 32, 'boss hp') };
  }
  return result;
}

/** Unknown resource categories remain preparation/editor data, never JSON constants. */
export function toRuntimeResource(input: unknown): RuntimeResource | null {
  const source = object(input, 'resource');
  if (source._deleted) return null;
  for (const [key, graph] of Object.entries(source.eventGraphs ?? {})) {
    try { compileScriptGraphWithSourceMap(graph as any); } catch (error) { throw new Error(`Invalid event graph '${key}': ${(error as Error).message}`); }
  }
  switch (source._resourceType) {
    case 'background': return source.__backgroundAnimationSheetOnly ? null : toRuntimeBackground(source);
    case 'sprite': return toRuntimeSprite(source, source.__spriteCanvas);
    case 'scene': return toRuntimeScene(source);
    case 'settings': return toRuntimeSettings(source);
    case 'palette': return { _resourceType: 'palette', id: id(source.id, 'palette'), colors: list(source.colors, 'palette colors').map(color => String(color)) };
    case 'variables': return { _resourceType: 'variables', ...(typeof source.id === 'string' ? { id: source.id } : {}), variables: list(source.variables, 'variables').map(variable => ({ id: id(variable.id, 'variable'), symbol: variable.symbol, type: variable.type, initialValue: variable.initialValue })) };
    case 'scripts': return { _resourceType: 'scripts', ...(typeof source.id === 'string' ? { id: source.id } : {}), scripts: list(source.scripts, 'scripts').map(script => {
      const sourceParameters = list(script.parameters, 'script parameters');
      validateScriptParameters(sourceParameters);
      // Aliases are editor metadata; runtime identity stays fixed.
      const parameters = sourceParameters.map(parameter => ({ id: parameter.id, name: parameter.name, type: parameter.type, mode: parameter.mode }));
      validateScriptParameters(parameters);
      return { id: id(script.id, 'script'), events: scripts(Array.isArray(script.events) ? script.events : script.script, 'reusable script'), ...(parameters.length ? { parameters } : {}) };
    }) };
    case 'user_settings': case 'project': case 'prefabs': case 'palettes': case 'tileset': case 'auto-tile': return null;
    default: throw new Error(`Unsupported resource type ${source._resourceType}`);
  }
}

/** Validate the complete resource set before any final game file is written. */
export function validateRuntimeReferences(resources: readonly RuntimeResource[]): void {
  const byId = new Map<string, RuntimeResource>();
  const symbols = new Set<string>();
  for (const resource of resources) {
    const symbol = `${resource._resourceType}${resource.id ? '_' + resource.id : ''}`.replaceAll('-', '_').toUpperCase();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(symbol)) throw new Error(`Invalid generated resource symbol '${symbol}'`);
    if (symbols.has(symbol)) throw new Error(`Duplicate generated resource symbol '${symbol}'`);
    symbols.add(symbol);
    if (!resource.id) continue;
    if (byId.has(resource.id)) throw new Error(`Duplicate runtime resource id '${resource.id}'`);
    byId.set(resource.id, resource);
  }
  const requireResource = (resourceId: string | undefined, type: RuntimeResource['_resourceType'], owner: string) => {
    if (resourceId && byId.get(resourceId)?._resourceType !== type) throw new Error(`${owner}: missing ${type} '${resourceId}'`);
  };
  const definitions = new Set<string>();
  const parameterDefinitions = new Map<string, ScriptParameter[]>();
  const globalVariables = new Map<string, string>();
  for (const resource of resources) if (resource._resourceType === 'variables') for (const variable of resource.variables) globalVariables.set(variable.id, variable.type);
  for (const resource of resources) if (resource._resourceType === 'scripts') {
    for (const script of resource.scripts) {
      if (definitions.has(script.id)) throw new Error(`Duplicate script id '${script.id}'`);
      validateScriptParameters(script.parameters ?? []);
      definitions.add(script.id);
      parameterDefinitions.set(script.id, script.parameters ?? []);
    }
  }
  const visit = (commands: RuntimeScript[], domain: ScriptArgumentDomain = { actors: [], triggers: [], scene: false, variables: globalVariables }) => {
    for (const command of commands) {
      try {
      const owner = `${command.command} ${command.id}`;
      if (command.command === 'EVENT_LOCAL_VARIABLE_RESET' && !domain.variables.has(LOCAL_VARIABLES[0].id)) throw new Error(`${owner}: local variables require an actor or trigger`);
      if (['EVENT_VARIABLES_SAVE', 'EVENT_VARIABLES_LOAD'].includes(command.command) && command.args.allVariables !== true) {
        const ids = command.args.variableIds;
        if (!Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string' || !globalVariables.has(id)) || new Set(ids).size !== ids.length)
          throw new Error(`${owner}: select existing global variables`);
      }

      if (command.command === 'EVENT_CALL_SCRIPT' && !definitions.has(String(command.args.scriptId ?? ''))) throw new Error(`${owner}: missing script '${command.args.scriptId ?? ''}'`);
      if (command.command === 'EVENT_CALL_SCRIPT') {
        const parameters = parameterDefinitions.get(String(command.args.scriptId))!;
        const argumentsList = (command.args.arguments ?? []) as ScriptArgument[];
        if (argumentsList.length !== parameters.length || new Set(argumentsList.map(argument => argument.parameterId)).size !== argumentsList.length) throw new Error(`${owner}: input list does not match the called script`);
        for (const parameter of parameters) {
          const argument = argumentsList.find(argument => argument.parameterId === parameter.id);
          validateScriptArgument(parameter, argument!);
          validateScriptArgumentDomain(argument!.value, domain, parameter);
        }
      }
      const checkParameterScope = (value: any): void => {
        if (typeof value === 'string' && (isScriptParameter(value) || isLocalVariable(value)) && !domain.variables.has(value)) throw new Error(`${owner}: input is outside its script scope`);
        if (value?.kind === 'variable' && (isScriptParameter(value.variableId) || isLocalVariable(value.variableId))) {
          const type = domain.variables.get(value.variableId);
          if (value.type ? value.type !== type : !['number', 'boolean'].includes(type ?? '')) throw new Error(`${owner}: incompatible script input type`);
        }
        if (value?.kind === 'formula') checkParameterScope(parseNumericFormula(value.source, value.variables ?? {}));
        if (value && typeof value === 'object') Object.values(value).forEach(checkParameterScope);
      };
      // Call parameter IDs name the callee, while their values belong to the caller.
      if (command.command === 'EVENT_CALL_SCRIPT') for (const argument of (command.args.arguments ?? []) as ScriptArgument[]) checkParameterScope(argument.value);
      else checkParameterScope(command.args);
      if (command.command === 'EVENT_VARIABLE' && isScriptParameter(command.args.variableId)
        && domain.variables.get(command.args.variableId) === 'string' && (command.args.value as any)?.type !== 'string') throw new Error(`${owner}: text input requires text assignment`);
      if (command.command === 'EVENT_FOR' && isScriptParameter(command.args.variableId)
        && domain.variables.get(command.args.variableId) !== 'number') throw new Error(`${owner}: FOR inputs require a number target`);
      if (command.command === 'EVENT_CHANGE_SCENE') requireResource(String(command.args.sceneId ?? ''), 'scene', owner);
      if (command.command === 'EVENT_BACKGROUND_ANIMATE') {
        requireResource(String(command.args.regularBackgroundId ?? ''), 'background', owner);
        requireResource(String(command.args.bitmapBackgroundId ?? ''), 'background', owner);
        if (!(command.args.regularBackgroundId || command.args.bitmapBackgroundId)) throw new Error(`${owner}: animation sheet has not been prepared`);
      }
      if (['EVENT_CHANGE_LAYER', 'EVENT_SHOOTER_LOAD_STAGE'].includes(command.command)) requireResource(String(command.args.backgroundId ?? ''), 'background', owner);
      if (command.children) {
        // Attached button programs execute later in their own scheduler slot;
        // the originating call frame is no longer available to them.
        const childDomain = command.command === 'EVENT_WAIT_FOR_BUTTON'
          ? { ...domain, variables: new Map([...domain.variables].filter(([id]) => !isScriptParameter(id))) } : domain;
        visit(command.children.then, childDomain); visit(command.children.else, childDomain);
      }
      } catch (error) { throw withEventContext(command, error); }
    }
  };
  for (const resource of resources) {
    if (resource._resourceType === 'settings') {
      requireResource(resource.startSceneId, 'scene', 'Starting scene');
      requireResource(resource.playerSpriteId, 'sprite', 'Player sprite');
      requireResource(resource.shooterConfig?.projectileSpriteId, 'sprite', 'Shooter projectile');
    }
    if (resource._resourceType === 'scene') {
      const sceneName = resource.name?.trim() || resource.id;
      if (![resource.width, resource.height].every(value => Number.isInteger(value) && value > 0 && value <= 16384)) throw new Error(`Scene ${sceneName}: invalid logical dimensions`);
      for (const layer of resource.backgrounds) requireResource(layer.backgroundId, 'background', `Scene ${sceneName} layer ${layer.layerId}`);
      for (const actor of resource.actors) {
        requireResource(actor.spriteId, 'sprite', `Actor ${actor.id}`);
        const domain = { actors: [actor.id], triggers: [], scene: false, variables: new Map([...globalVariables, ...LOCAL_VARIABLES.map(variable => [variable.id, variable.type] as [string, string])]) };
        visit(actor.onInitScript, domain); visit(actor.onInteractScript, domain); visit(actor.onUpdateScript, domain);
      }
      for (const trigger of resource.triggers) {
        const domain = { actors: [], triggers: [trigger.id], scene: false, variables: new Map([...globalVariables, ...LOCAL_VARIABLES.map(variable => [variable.id, variable.type] as [string, string])]) };
        visit(trigger.onEnterScript, domain); visit(trigger.onLeaveScript, domain);
      }
      visit(resource.script, { actors: ['__PLAYER__', ...resource.actors.map(actor => actor.id)], triggers: resource.triggers.map(trigger => trigger.id), scene: true, variables: globalVariables });
    }
    if (resource._resourceType === 'scripts') for (const script of resource.scripts) visit(script.events, {
      actors: [], triggers: [], scene: false, variables: new Map([...globalVariables, ...(script.parameters ?? []).map(parameter => [parameter.id, parameter.type] as [string, string])]) });
  }
}
