import { EVENT_COMPILER_REGISTRY, type EventCompilerStrategy } from '../events/EventCompilerRegistry';
import { validateRuntimeReferences, type RuntimeResource } from '../types/RuntimeResources';
import type { RuntimeScript } from '../types/RuntimeScript';

export type RuntimeModule = 'core' | 'graphics' | 'input' | 'camera' | 'startup' | 'audio-backend' | 'audio'
  | 'scripts' | 'variables' | 'numeric' | 'triggers' | 'actors' | 'physics' | 'motion' | 'pathfinding'
  | 'fade' | 'scene-change' | 'layers' | 'wait' | 'wait-input' | 'wait-signal' | 'dialogue' | 'ui' | 'ui-animation'
  | 'background-animation' | 'background-transform' | 'sprite-effects' | 'choices' | 'combat' | 'shooter' | 'spawner' | 'save' | 'rumble' | 'hbe' | 'script-inputs';

interface ModuleDefinition { dependencies: readonly RuntimeModule[]; sources: readonly string[]; headers: readonly string[] }
const module = (dependencies: readonly RuntimeModule[], sources: readonly string[], headers: readonly string[]): ModuleDefinition => ({ dependencies, sources, headers });

/** Source ownership and dependency closure, independent of event display labels. */
export const RUNTIME_MODULES: Readonly<Record<RuntimeModule, ModuleDefinition>> = {
  core: module(['graphics', 'input', 'camera', 'startup'], ['main.cpp', 'game.cpp', 'resource_registry.cpp', 'runtime_monitor.cpp'],
    ['game.h', 'resource_registry.h', 'resource_types.h', 'local_variables.h', 'runtime_capacity.h', 'player_physics.h', 'runtime_monitor.h', 'utils.h', 'numeric_values.h', 'combat_config.h', 'shooter_config.h', 'spawner_timeline.h', 'event_change_layer.h', 'gba_studio_features.h']),
  graphics: module([], ['graphics_manager.cpp'], ['graphics_manager.h', 'actor_motion_physics.h']),
  input: module([], ['input_manager.cpp'], ['input_manager.h', 'runtime_name.h']),
  camera: module(['graphics'], ['camera_manager.cpp'], ['camera_manager.h']),
  startup: module(['graphics', 'fade', 'audio-backend'], ['startup.cpp'], ['startup.h', 'startup_intro_frames.h']),
  'audio-backend': module([], [], []),
  audio: module(['audio-backend'], ['audio_manager.cpp'], ['audio_manager.h']),
  scripts: module(['input'], ['script_command_manager.cpp', 'script_event_handlers.cpp'], ['script_command_manager.h', 'script_event_handlers.h', 'event_registry.h', 'event_motion.h']),
  'script-inputs': module(['scripts', 'numeric'], [], []),
  variables: module([], ['variable_manager.cpp', 'config_variables.cpp'], ['variable_manager.h', 'config_variables.h', 'local_variables.h', 'runtime_capacity.h']),
  numeric: module(['variables', 'graphics', 'camera'], ['numeric_values.cpp'], ['numeric_values.h']),
  triggers: module(['scripts', 'graphics'], ['script_trigger_manager.cpp'], ['script_trigger_manager.h']),
  actors: module(['graphics'], ['actor_manager.cpp'], ['actor_manager.h']),
  physics: module(['graphics'], [], ['actor_motion_physics.h']),
  motion: module(['graphics', 'camera', 'physics'], ['actor_motion_manager.cpp'], ['actor_motion_manager.h', 'actor_motion_physics.h', 'actor_motion_path.h', 'event_motion.h']),
  pathfinding: module(['motion'], [], ['actor_motion_path.h']),
  fade: module([], ['event_fade.cpp'], ['event_fade.h']),
  'scene-change': module(['graphics', 'scripts', 'fade'], ['event_change_scene.cpp'], ['event_change_scene.h']),
  layers: module(['graphics'], ['event_change_layer.cpp'], ['event_change_layer.h']),
  'background-transform': module(['layers'], [], []),
  'background-animation': module(['layers'], [], ['background_animation_clock.h', 'background_animation_bitmap.h']),
  wait: module([], ['event_wait.cpp'], ['event_wait.h']),
  'wait-input': module(['input'], ['event_wait_input.cpp'], ['event_wait_input.h']),
  'wait-signal': module(['shooter'], ['event_wait_signal.cpp'], ['event_wait_signal.h']),
  dialogue: module(['input', 'graphics', 'variables'], ['dialogue_manager.cpp'], ['dialogue_manager.h', 'menu_layout.h']),
  ui: module(['dialogue'], [], []),
  'ui-animation': module(['ui'], [], []),
  choices: module(['dialogue', 'input', 'variables'], [], []),
  'sprite-effects': module(['graphics'], [], ['actor_visual_colors.h']),
  combat: module([], ['combat_manager.cpp'], ['combat_manager.h', 'combat_config.h']),
  shooter: module(['combat', 'spawner', 'actors', 'graphics'], ['shooter_kit.cpp'], ['shooter_kit.h', 'shooter_config.h']),
  spawner: module(['actors'], ['spawner_timeline_manager.cpp'], ['spawner_timeline_manager.h', 'spawner_timeline.h']),
  save: module(['variables', 'actors'], ['save_manager.cpp', 'save_game.cpp'], ['save_manager.h', 'game_save_state.h']),
  rumble: module([], ['rumble_manager.cpp'], ['rumble_manager.h']),
  hbe: module(['graphics'], ['hbe_manager.cpp'], ['hbe_manager.h']),
};

const STRATEGY_MODULES: Readonly<Record<EventCompilerStrategy, readonly RuntimeModule[]>> = {
  'button-action': ['input', 'scripts'], physics: ['graphics', 'physics', 'actors'], 'trigger-state': ['triggers'], 'actor-facing': ['actors', 'scripts'], 'actor-state': ['actors'], wait: ['wait'], fade: ['fade'], 'fade-options': ['fade'], 'scene-change': ['scene-change'], camera: ['camera'],
  layer: ['layers'], visibility: ['layers'], 'background-scroll': ['layers'], 'background-parallax': ['layers'], 'background-transform': ['background-transform'], 'background-animation': ['background-animation'], palette: ['layers'],
  variable: ['variables'], if: ['variables'], 'call-script': ['scripts'], while: ['variables'], for: ['variables'], break: [], continue: [],
  'actor-move': ['actors', 'graphics'], 'actor-spawn': ['actors'], 'actor-remove': ['actors'], 'actor-visible': ['actors'], 'actor-hide': ['actors'], 'actor-show': ['actors'], 'show-emote': ['graphics'],
  'actor-hide-all': ['graphics'], 'actor-show-all': ['graphics'], 'actor-animation-speed': ['actors'], 'actor-animation': ['actors', 'graphics'], 'actor-priority': ['actors'], 'sprite-effect': ['sprite-effects'],
  'audio-play': ['audio'], 'audio-sound': ['audio'], 'audio-sound-stop': ['audio'], 'audio-stop': ['audio'], 'audio-volume': ['audio'], 'audio-resume': ['audio'], 'audio-pause': ['audio'], 'audio-fade': ['audio'], rumble: ['rumble'],
  dialogue: ['dialogue'], 'dialogue-hide': ['dialogue'], 'dialogue-choice': ['choices'], 'variable-text': ['dialogue', 'variables'],
  'ui-text': ['ui'], 'ui-value': ['ui'], 'ui-animate': ['ui-animation'], 'ui-lifecycle': ['ui'], save: ['save'],
  'wait-button': ['input'], 'wait-input': ['wait-input'], 'attach-button': ['input'], 'remove-button-script': ['input'], 'pause-until-button-pressed': ['input'], 'if-button-held': ['input'], 'input-group': ['input'],
  'shooter-start': ['shooter'], 'shooter-load-stage': ['shooter'], 'shooter-background-mode': ['shooter'], 'shooter-pause': ['shooter'], 'shooter-stop': ['shooter'],
  'shooter-player-enabled': ['shooter'], 'shooter-clear': ['shooter'], 'shooter-boss': ['shooter'], 'shooter-boss-phase': ['shooter'], 'shooter-wait-signal': ['wait-signal'], 'shooter-stat': ['shooter'], 'shooter-grant': ['shooter'],
  hbe: ['hbe'], 'blend-alpha': ['graphics'],
};

export interface RuntimeFeatureManifest {
  schemaVersion: 1;
  generatorVersion: 1;
  mode: 'selective' | 'full';
  selectionApplied: boolean;
  selectionPhase: 'analysis' | 'partial' | 'complete';
  selectiveModules?: RuntimeModule[];
  desiredSourceFiles?: string[];
  desiredHeaderFiles?: string[];
  eventCodes: string[];
  modules: RuntimeModule[];
  sourceFiles: string[];
  headerFiles: string[];
  reasons: Record<string, string[]>;
  scriptIds: string[];
}

/** Analyze all emitted entry points. Registered scripts remain dynamic lookup targets. */
export function createRuntimeFeatureManifest(resources: readonly RuntimeResource[], mode: 'selective' | 'full' = 'selective'): RuntimeFeatureManifest {
  if (mode !== 'selective' && mode !== 'full') throw new Error(`Unsupported runtime selection mode: ${mode}`);
  validateRuntimeReferences(resources);
  const modules = new Set<RuntimeModule>();
  const reasons = new Map<string, Set<string>>();
  const events = new Set<string>();
  const scriptIds = new Set<string>();
  const scriptParameters = new Map(resources.filter((resource): resource is Extract<RuntimeResource, { _resourceType: 'scripts' }> => resource._resourceType === 'scripts')
    .flatMap(resource => resource.scripts.map(script => [script.id, script.parameters ?? []] as const)));
  const requireModule = (name: RuntimeModule, reason: string) => {
    if (!RUNTIME_MODULES[name]) throw new Error(`Missing runtime module definition: ${name}`);
    modules.add(name);
    const entries = reasons.get(name) ?? new Set<string>(); entries.add(reason); reasons.set(name, entries);
  };
  requireModule('core', 'runtime: game loop, registry and monitor');
  const numeric = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return value.some(numeric);
    const node = value as Record<string, unknown>;
    // Literal numbers become scalar payload fields; they emit no program.
    return ['constant', 'engine', 'property', 'trigger', 'direction', 'expression', 'formula'].includes(String(node.kind))
      || node.kind === 'variable' && node.type === undefined || Object.values(node).some(numeric);
  };
  const visit = (commands: RuntimeScript[], owner: string) => {
    for (const command of commands) {
      const strategy = EVENT_COMPILER_REGISTRY[command.command];
      if (!strategy || !STRATEGY_MODULES[strategy]) throw new Error(`Missing module contract for ${command.command}`);
      events.add(command.command);
      const reason = `event:${command.command}:${owner}:${command.id}`;
      requireModule('scripts', reason);
      for (const dependency of STRATEGY_MODULES[strategy]) requireModule(dependency, reason);
      if (numeric(command.args)) requireModule('numeric', reason);
      if (command.command === 'EVENT_CALL_SCRIPT' && (command.args.arguments as any[])?.length) requireModule('script-inputs', reason);
      if (command.command === 'EVENT_CALL_SCRIPT') {
        const parameters = scriptParameters.get(String(command.args.scriptId)) ?? [];
        for (const argument of (command.args.arguments ?? []) as any[]) {
          if (argument.value?.kind === 'property' && parameters.some(parameter => parameter.id === argument.parameterId && parameter.mode === 'reference')) requireModule('actors', reason);
        }
      }
      // Camera interpolation lives in CameraManager/the handler, not the large
      // actor path-search singleton. Instant actor placement also needs no job.
      if (['EVENT_MOVE_ACTOR', 'EVENT_ACTOR_MOVE_TO'].includes(command.command) && (command.args.animated ?? command.command === 'EVENT_ACTOR_MOVE_TO')) requireModule('pathfinding', reason);
      if (command.command === 'EVENT_SHOOTER_LOAD_STAGE' && command.args.musicId) requireModule('audio', reason);
      if (command.children) { visit(command.children.then, owner); visit(command.children.else, owner); }
    }
  };
  for (const resource of resources) {
    if (resource._resourceType === 'settings') {
      if (resource.playerSpriteId) requireModule('physics', `settings:player:${resource.playerSpriteId}`);
      if (resource.combatConfig) requireModule('combat', 'settings:combatConfig');
      if (resource.shooterConfig) requireModule('shooter', 'settings:shooterConfig');
    }
    if (resource._resourceType === 'variables' && resource.variables.length) requireModule('variables', 'resource:variables');
    if (resource._resourceType === 'scene') {
      if (['SHOOTER', 'SHMUP', "Shoot Em'Up"].includes(resource.sceneType)) requireModule('shooter', `scene:${resource.id}:${resource.sceneType}`);
      if (resource.actors.length) requireModule('actors', `scene:${resource.id}:actors`);
      if (resource.collisions.length) requireModule('physics', `scene:${resource.id}:collisions`);
      if (resource.spawnerTimelines.length) requireModule('spawner', `scene:${resource.id}:spawnerTimelines`);
      if (resource.triggers.length) requireModule('triggers', `scene:${resource.id}:triggers`);
      visit(resource.script, `scene:${resource.id}:init`);
      for (const actor of resource.actors) {
        visit(actor.onInitScript, `scene:${resource.id}:actor:${actor.id}:init`);
        visit(actor.onInteractScript, `scene:${resource.id}:actor:${actor.id}:interact`);
        visit(actor.onUpdateScript, `scene:${resource.id}:actor:${actor.id}:update`);
      }
      for (const trigger of resource.triggers) { visit(trigger.onEnterScript, `scene:${resource.id}:trigger:${trigger.id}:enter`); visit(trigger.onLeaveScript, `scene:${resource.id}:trigger:${trigger.id}:leave`); }
    }
    if (resource._resourceType === 'scripts') for (const script of resource.scripts) {
      scriptIds.add(script.id);
      if (script.parameters?.length) requireModule('script-inputs', `script-inputs:${script.id}`);
      // Preserve every registered script: lookup is public and may be dynamic.
      requireModule('scripts', `registered-script:${script.id}`);
      visit(script.events, `script:${script.id}`);
    }
  }
  if (mode === 'full') for (const name of Object.keys(RUNTIME_MODULES) as RuntimeModule[]) requireModule(name, 'mode:full (explicit diagnostic build)');
  let previousSize = -1;
  while (previousSize !== modules.size) {
    previousSize = modules.size;
    for (const name of [...modules]) for (const dependency of RUNTIME_MODULES[name].dependencies) requireModule(dependency, `dependency:${name}`);
  }
  const ordered = [...modules].sort();
  return {
    schemaVersion: 1, generatorVersion: 1, mode, selectionApplied: false, selectionPhase: 'analysis',
    eventCodes: [...events].sort(), modules: ordered,
    sourceFiles: [...new Set(ordered.flatMap(name => RUNTIME_MODULES[name].sources.map(file => `src/${file}`)))].sort(),
    headerFiles: [...new Set(ordered.flatMap(name => RUNTIME_MODULES[name].headers.map(file => `include/${file}`)))].sort(),
    reasons: Object.fromEntries(ordered.map(name => [name, [...reasons.get(name)!].sort()])), scriptIds: [...scriptIds].sort(),
  };
}

/** Activate only module boundaries already guarded and covered by native tests. */
export function selectNativeRuntime(manifest: RuntimeFeatureManifest): { manifest: RuntimeFeatureManifest; featureHeader: string } {
  const selectiveModules: RuntimeModule[] = ['background-animation', 'background-transform', 'actors', 'audio', 'choices', 'combat', 'dialogue', 'hbe', 'layers', 'motion', 'numeric', 'pathfinding', 'rumble', 'save', 'scene-change', 'scripts', 'script-inputs', 'shooter', 'spawner', 'sprite-effects', 'triggers', 'ui', 'ui-animation', 'variables', 'wait', 'wait-input', 'wait-signal'];
  const requested = new Set(manifest.modules);
  const compiled = [...manifest.modules];
  const selected: RuntimeFeatureManifest = {
    ...manifest, selectionApplied: true, selectionPhase: 'complete', selectiveModules,
    desiredSourceFiles: manifest.sourceFiles, desiredHeaderFiles: manifest.headerFiles,
    sourceFiles: [...new Set(compiled.flatMap(name => RUNTIME_MODULES[name].sources.map(file => `src/${file}`)))].sort(),
    headerFiles: [...new Set(compiled.flatMap(name => RUNTIME_MODULES[name].headers.map(file => `include/${file}`)))].sort(),
  };
  const flags = selectiveModules.map(name => `#define GBA_STUDIO_FEATURE_${name.toUpperCase().replaceAll('-', '_')} ${requested.has(name) ? 1 : 0}`).join('\n');
  return { manifest: selected, featureHeader: `#ifndef GBA_STUDIO_FEATURES_H\n#define GBA_STUDIO_FEATURES_H\n// Generated from runtime-feature-manifest.json\n${flags}\n#endif\n` };
}
