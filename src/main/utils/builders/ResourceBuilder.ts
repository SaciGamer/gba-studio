import { LOCAL_VARIABLES, isLocalVariable } from '../../../shared/localVariables';
import { textTemplateLiterals } from '../../../shared/textTemplate';
import { inputGroupMasks } from '../../../shared/inputGroups';
import { PHYSICS_SETTING_EVENTS, PHYSICS_EVENT_CODES } from '../../../shared/events/physicsEvents';
import { COORDINATE_EVENTS } from '../../../shared/events/coordinateUnits';
import { withDefaultInputMap, resolveSceneInputMap, validateSceneInputMaps } from '../../../shared/inputMap';
import { DEFAULT_PALETTES } from '../../../shared/defaultPalettes';
import { getMenuLayout, getMenuLayoutIssues } from '../../../shared/menuLayout';
import { normalizeSceneResource } from '../../../shared/sceneResource';
/**
 * Resource Builder - converts project resources (.gbasres) into C/C++ headers
 * Uses explicit resource fields and event payload contracts. Preparation data
 * is projected to runtime before final export; arbitrary JSON is never emitted.
 */

import { normalizeNumericValue, numericInstructions, numericCoordinateInstructions, validateNumericValue, type NumericValue } from '../../../shared/numericValues';
import { parseNumericFormula } from '../../../shared/numericFormula';
import { validateScriptParameters, isScriptParameter, SCRIPT_PARAMETER_LIMIT } from '../../../shared/scriptParameters';
import { NUMERIC_EVENT_FIELDS } from '../../../shared/numericEventFields';
import { EVENT_CATALOG_BY_CODE } from '../../../shared/events/eventCatalog';
import { generateEventSoundSamples, GENERATED_SOUND_SAMPLE_RATE, normalizeGeneratedSoundParameters } from '../../../shared/events/generatedEventSound';
import { SFX_LIMITS, LEGACY_SFX_MAX_FREQUENCY, isSfxWaveform, isSfxHarmonics, defaultSfxParameters, encodePcm16Wav, generateSfx, type SfxParameters } from '../../../shared/events/sfxGenerator';
import { EventDiagnosticIndex, withEventContext } from '../events/EventDiagnostics';
import { actorSpriteId } from '../../../shared/actorSprite';
import { musicAssetSymbol } from './TrackerProjectPackage';
import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { GameConfig, JsonResourceDefault, ResourceFile } from '../types/BuildTypes';
import { hasEventCompiler } from '../events/EventCompilerRegistry';
import { compileScriptGraphWithSourceMap } from '../events/ScriptGraphCompiler';
import { toRuntimeScripts } from '../types/RuntimeScript';
import type { RuntimeResource, RuntimeResourceFile } from '../types/RuntimeResources';

// Mirrors the catalog schema until the main workspace adopts src/shared as a
// configured project reference. Keeping this table local avoids violating the
// main tsconfig rootDir while preserving identical validation semantics.
const EVENT_VALIDATION_SCHEMA: Record<string, Record<string, { type: string; required?: boolean; min?: number; max?: number; options?: string[] }>> = {
  EVENT_VARIABLES_SAVE: EVENT_CATALOG_BY_CODE.EVENT_VARIABLES_SAVE.payload,
  EVENT_VARIABLES_LOAD: EVENT_CATALOG_BY_CODE.EVENT_VARIABLES_LOAD.payload,
  EVENT_RUN_BUTTON_ACTION: EVENT_CATALOG_BY_CODE.EVENT_RUN_BUTTON_ACTION.payload,
  EVENT_ACTOR_SET_TINT: EVENT_CATALOG_BY_CODE.EVENT_ACTOR_SET_TINT.payload,
  EVENT_ACTOR_SET_SATURATION: EVENT_CATALOG_BY_CODE.EVENT_ACTOR_SET_SATURATION.payload,
  EVENT_ACTOR_SET_BRIGHTNESS: EVENT_CATALOG_BY_CODE.EVENT_ACTOR_SET_BRIGHTNESS.payload,
  EVENT_ACTOR_SET_OPACITY: EVENT_CATALOG_BY_CODE.EVENT_ACTOR_SET_OPACITY.payload,
  EVENT_STOP_PHYSICS: EVENT_CATALOG_BY_CODE.EVENT_STOP_PHYSICS.payload,
  EVENT_CONFIGURE_MOVEMENT: EVENT_CATALOG_BY_CODE.EVENT_CONFIGURE_MOVEMENT.payload,
  EVENT_PHYSICS_SET_GRAVITY: EVENT_CATALOG_BY_CODE.EVENT_PHYSICS_SET_GRAVITY.payload,
  EVENT_PHYSICS_SET_JUMP_SPEED: EVENT_CATALOG_BY_CODE.EVENT_PHYSICS_SET_JUMP_SPEED.payload,
  EVENT_PHYSICS_SET_MAX_FALL_SPEED: EVENT_CATALOG_BY_CODE.EVENT_PHYSICS_SET_MAX_FALL_SPEED.payload,
  EVENT_PHYSICS_SET_AIR_JUMPS: EVENT_CATALOG_BY_CODE.EVENT_PHYSICS_SET_AIR_JUMPS.payload,
  EVENT_PHYSICS_SET_DIAGONAL: EVENT_CATALOG_BY_CODE.EVENT_PHYSICS_SET_DIAGONAL.payload,
  EVENT_PHYSICS_RESET: EVENT_CATALOG_BY_CODE.EVENT_PHYSICS_RESET.payload,

  EVENT_APPLY_VERTICAL_IMPULSE: EVENT_CATALOG_BY_CODE.EVENT_APPLY_VERTICAL_IMPULSE.payload,
  EVENT_ACTOR_SET_DIRECTION: EVENT_CATALOG_BY_CODE.EVENT_ACTOR_SET_DIRECTION.payload,
  EVENT_ACTOR_SET_STATE: { actorId: { type: 'string', required: true }, stateId: { type: 'string', required: true } },
  EVENT_SHOW_EMOTE: { emoteId: { type: 'string', required: true }, actorId: { type: 'string', required: true }, distance: { type: 'integer', min: 0, max: 256 } },
  EVENT_WAIT: { units: { type: 'enum', required: true }, frames: { type: 'integer', min: 0 }, time: { type: 'integer', min: 0 } },
  EVENT_FADE_IN: { speed: { type: 'integer', required: true, min: 1, max: 6 } },
  EVENT_FADE_OUT: { speed: { type: 'integer', required: true, min: 1, max: 6 } },
  EVENT_FADE_OPTIONS: { color: { type: 'enum', required: true } },
  EVENT_CHANGE_SCENE: { sceneId: { type: 'string', required: true }, x: { type: 'integer', min: 0 }, y: { type: 'integer', min: 0 }, fadeSpeed: { type: 'integer', min: 1, max: 6 } },
  EVENT_PAN_CAMERA: { animated: { type: 'boolean' }, speed: { type: 'number', min: 0.0625, max: 16 }, x: { type: 'integer', required: true }, y: { type: 'integer', required: true } },
  EVENT_CAMERA_MOVE_TO: { animated: { type: 'boolean' }, speed: { type: 'number', min: 0.0625, max: 16 }, x: { type: 'integer', required: true }, y: { type: 'integer', required: true } },
  EVENT_CAMERA_FOLLOW: { actorId: { type: 'string' }, clampToScene: { type: 'boolean' }, persistAcrossScenes: { type: 'boolean' }, lockX: { type: 'boolean' }, lockY: { type: 'boolean' }, deadZoneWidth: { type: 'integer', min: 0, max: 240 }, deadZoneHeight: { type: 'integer', min: 0, max: 160 } },
  EVENT_CAMERA_STOP_FOLLOW: {},
  EVENT_CAMERA_SHAKE: { frames: { type: 'integer', required: true, min: 1, max: 120 }, axis: { type: 'enum', options: ['both', 'horizontal', 'vertical'] }, customShake: { type: 'boolean' }, amplitude: { type: 'integer', required: true, min: 1, max: 16 } },
  EVENT_MOVE_ACTOR: { xUnit: { type: 'enum', options: ['pixels', 'tiles'] }, yUnit: { type: 'enum', options: ['pixels', 'tiles'] }, collideWalls: { type: 'boolean' }, collideActors: { type: 'boolean' }, lockDirection: { type: 'enum', options: ['none', 'horizontal', 'vertical'] }, movementType: { type: 'enum', options: ['horizontal-first', 'vertical-first', 'diagonal'] }, animated: { type: 'boolean' }, speed: { type: 'number', min: 0.0625, max: 16 }, animationSpeed: { type: 'integer', min: 0, max: 8 }, actorId: { type: 'string', required: true }, x: { type: 'integer', required: true }, y: { type: 'integer', required: true } },
  EVENT_ACTOR_MOVE_TO: { xUnit: { type: 'enum', options: ['pixels', 'tiles'] }, yUnit: { type: 'enum', options: ['pixels', 'tiles'] }, collideWalls: { type: 'boolean' }, collideActors: { type: 'boolean' }, lockDirection: { type: 'enum', options: ['none', 'horizontal', 'vertical'] }, movementType: { type: 'enum', options: ['horizontal-first', 'vertical-first', 'diagonal'] }, animated: { type: 'boolean' }, speed: { type: 'number', min: 0.0625, max: 16 }, animationSpeed: { type: 'integer', min: 0, max: 8 }, actorId: { type: 'string', required: true }, x: { type: 'integer', required: true }, y: { type: 'integer', required: true } },
  EVENT_ACTOR_SET_POSITION: { actorId: { type: 'string', required: true }, x: { type: 'integer', required: true }, y: { type: 'integer', required: true } },
  EVENT_SPAWN_ACTOR: { source: { type: 'enum', options: ['actor', 'prefab'] }, actorId: { type: 'string' }, prefabId: { type: 'string' }, x: { type: 'integer', required: true }, y: { type: 'integer', required: true } },
  EVENT_ACTOR_SPAWN: { source: { type: 'enum', options: ['actor', 'prefab'] }, actorId: { type: 'string' }, prefabId: { type: 'string' }, x: { type: 'integer', required: true }, y: { type: 'integer', required: true } },
  EVENT_REMOVE_ACTOR: { source: { type: 'enum', options: ['actor', 'prefab'] }, actorId: { type: 'string' }, prefabId: { type: 'string' } },
  EVENT_ACTOR_DESPAWN: { source: { type: 'enum', options: ['actor', 'prefab'] }, actorId: { type: 'string' }, prefabId: { type: 'string' } },
  EVENT_VISIBLE_ACTOR: { actorId: { type: 'string', required: true }, visible: { type: 'boolean', required: true } },
  EVENT_ACTOR_SET_VISIBLE: { actorId: { type: 'string', required: true }, visible: { type: 'boolean', required: true } },
  EVENT_HIDE_ACTOR: { actorId: { type: 'string', required: true } },
  EVENT_SHOW_ACTOR: { actorId: { type: 'string', required: true } },
  EVENT_HIDE_ALL_SPRITES: {},
  EVENT_SHOW_ALL_SPRITES: {},
  EVENT_SET_ANIMATION_SPEED: { actorId: { type: 'string', required: true }, speed: { type: 'integer', required: true, min: 0, max: 60 } },
  EVENT_ACTOR_SET_ANIMATION: { actorId: { type: 'string', required: true }, action: { type: 'enum', options: ['speed', 'loop', 'once', 'stop', 'frame'] }, stateId: { type: 'string' }, animationId: { type: 'string' }, speed: { type: 'integer', min: 0, max: 60 }, frame: { type: 'integer', min: 0, max: 255 }, reverse: { type: 'boolean' } },
  EVENT_SET_ACTOR_PRIORITY: { actorId: { type: 'string', required: true }, priority: { type: 'integer', required: true, min: 0, max: 3 } },
  EVENT_PLAY_MUSIC: { musicId: { type: 'string', required: true }, volume: { type: 'integer', min: 0, max: 100 }, loop: { type: 'boolean' } },
  EVENT_MUSIC_PLAY_JINGLE: { musicId: { type: 'string', required: true }, volume: { type: 'integer', min: 0, max: 100 } },
  EVENT_PLAY_SOUND: {  soundId: { type: 'string', required: true }, soundSource: { type: 'enum', options: ['asset', 'generated', 'project'] }, sfxParameters: { type: 'string' }, effect: { type: 'enum', options: ['tone', 'coin', 'laser', 'explosion', 'noise'] }, pitch: { type: 'integer', min: 24, max: 108 }, durationFrames: { type: 'integer', min: 1, max: 120 }, volume: { type: 'integer', min: 0, max: 100 }, speed: { type: 'integer', min: 25, max: 400 }, panning: { type: 'integer', min: -100, max: 100 }, priority: { type: 'integer', min: -32767, max: 32767 }, group: { type: 'string' } },
  EVENT_RUMBLE: { durationFrames: { type: 'integer', required: true, min: 1, max: 120 }, durationUnit: { type: 'enum', options: ['frames', 'seconds'] }, intensity: { type: 'integer', required: true, min: 0, max: 100 } },
  EVENT_SOUND_STOP: { group: { type: 'string' } },
  EVENT_MUSIC_STOP: {},
  EVENT_SET_MUSIC_VOLUME: { volume: { type: 'integer', required: true, min: 0, max: 100 } },
  EVENT_MUSIC_RESUME: {},
  EVENT_MUSIC_PAUSE: {},
  EVENT_MUSIC_FADE: { targetVolume: { type: 'integer', required: true, min: 0, max: 100 }, durationFrames: { type: 'integer', required: true, min: 1, max: 600 } },
  EVENT_HBE_EFFECT_ENABLE: { preset: { type: 'enum', required: true, options: ['mosaic_wave', 'mosaic_in', 'backdrop_gradient', 'palette_wave', 'green_swap'] }, intensity: { type: 'integer', required: true, min: 0, max: 16 }, layerId: { type: 'integer', min: 0, max: 3 } },
  EVENT_HBE_EFFECT_DISABLE: {},
  EVENT_BLEND_ALPHA: { alpha: { type: 'integer', required: true, min: 0, max: 100 } },
  EVENT_SHOOTER_START: { waveId: { type: 'string' } },
  EVENT_SHOOTER_SPAWN_WAVE: { waveId: { type: 'string' } },
  EVENT_SHOOTER_LOAD_STAGE: { waveId: { type: 'string' }, musicId: { type: 'string' }, musicVolume: { type: 'integer', min: 0, max: 100 }, backgroundId: { type: 'string' }, backgroundLayer: { type: 'integer', min: 0, max: 3 } },
  EVENT_SHOOTER_SET_BACKGROUND_MODE: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, visible: { type: 'boolean' }, scrollX: { type: 'integer', min: -2048, max: 2048 }, scrollY: { type: 'integer', min: -2048, max: 2048 }, parallaxX: { type: 'integer', min: -200, max: 200 }, parallaxY: { type: 'integer', min: -200, max: 200 } },
  EVENT_SHOOTER_PAUSE: { paused: { type: 'boolean', required: true } },
  EVENT_SHOOTER_STOP: {},
  EVENT_SHOOTER_CLEAR_ENEMIES: {},
  EVENT_SHOOTER_SPAWN_BOSS: { archetypeId: { type: 'string', required: true }, x: { type: 'integer', required: true }, y: { type: 'integer', required: true }, dropId: { type: 'string' } },
  EVENT_SHOOTER_SET_BOSS_PHASE: { phase: { type: 'integer', required: true, min: 0, max: 7 } },
  EVENT_SHOOTER_WAIT_SIGNAL: { signal: { type: 'enum', required: true, options: ['wave_cleared', 'boss_defeated', 'player_dead', 'stage_cleared'] }, timeoutFrames: { type: 'integer', min: 0 } },
  EVENT_SHOOTER_GRANT: { grant: { type: 'enum', required: true, options: ['weapon', 'bombs', 'shield', 'experience', 'score'] }, value: { type: 'integer', required: true, min: 0, max: 9999 } },
  EVENT_SHOOTER_SET_STAT: { stat: { type: 'enum', required: true, options: ['player_hit_points', 'default_damage', 'score', 'level', 'bombs', 'shield', 'experience', 'mode_flags'] }, value: { type: 'integer', required: true, min: 0, max: 9999 } },
  EVENT_SHOOTER_ADD_STAT: { stat: { type: 'enum', required: true, options: ['player_hit_points', 'default_damage', 'score', 'level', 'bombs', 'shield', 'experience', 'mode_flags'] }, value: { type: 'integer', required: true, min: -9999, max: 9999 } },
  EVENT_SHOOTER_SET_PLAYER_ENABLED: { enabled: { type: 'boolean', required: true } },
  EVENT_DISPLAY_DIALOGUE: { text: { type: 'string', required: true }, dialogueFont: { type: 'enum', options: ['fixed8x8', 'fixed8x16'] }, showFrame: { type: 'boolean' }, horizontalAlign: { type: 'enum', options: ['left', 'center', 'right'] }, verticalAlign: { type: 'enum', options: ['top', 'center', 'bottom'] }, animate: { type: 'boolean' }, animationSpeed: { type: 'enum', options: ['slow', 'medium', 'fast'] }, portraitEnabled: { type: 'boolean' }, avatarImage: { type: 'string' }, avatarSize: { type: 'enum', options: ['16', '32'] }, avatarPlacement: { type: 'enum', options: ['inside', 'frame-top', 'above', 'free'] }, avatarAnchor: { type: 'enum', options: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'center', 'right'] }, avatarX: { type: 'integer', min: 0, max: 240 }, avatarY: { type: 'integer', min: 0, max: 160 } },
  EVENT_DIALOGUE_SHOW: { text: { type: 'string', required: true }, dialogueFont: { type: 'enum', options: ['fixed8x8', 'fixed8x16'] }, showFrame: { type: 'boolean' }, horizontalAlign: { type: 'enum', options: ['left', 'center', 'right'] }, verticalAlign: { type: 'enum', options: ['top', 'center', 'bottom'] }, animate: { type: 'boolean' }, animationSpeed: { type: 'enum', options: ['slow', 'medium', 'fast'] }, portraitEnabled: { type: 'boolean' }, avatarImage: { type: 'string' }, avatarSize: { type: 'enum', options: ['16', '32'] }, avatarPlacement: { type: 'enum', options: ['inside', 'frame-top', 'above', 'free'] }, avatarAnchor: { type: 'enum', options: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'center', 'right'] }, avatarX: { type: 'integer', min: 0, max: 240 }, avatarY: { type: 'integer', min: 0, max: 160 } },
  EVENT_TEXT_SCROLL: { text: { type: 'string', required: true }, dialogueFont: { type: 'enum', options: ['fixed8x8', 'fixed8x16'] }, showFrame: { type: 'boolean' }, horizontalAlign: { type: 'enum', options: ['left', 'center', 'right'] }, verticalAlign: { type: 'enum', options: ['top', 'center', 'bottom'] }, animate: { type: 'boolean' }, animationSpeed: { type: 'enum', options: ['slow', 'medium', 'fast'] } },
  EVENT_SAVE_WRITE: { slot: { type: 'integer', required: true, min: 0, max: 7 } },
  EVENT_SAVE_LOAD: { slot: { type: 'integer', required: true, min: 0, max: 7 } },
  EVENT_SAVE_REMOVE: { slot: { type: 'integer', required: true, min: 0, max: 7 } },
  EVENT_SAVE_ON_LOAD: {},
  EVENT_DISPLAY_VARIABLE_TEXT: { variableId: { type: 'string', required: true }, x: { type: 'integer', required: true, min: 0, max: 240 }, y: { type: 'integer', required: true, min: 0, max: 160 }, font: { type: 'enum', options: ['variable8x8', 'variable8x16', 'variable16x16'] } },
  EVENT_DIALOGUE_CHOICE: { showTitle: { type: 'boolean' }, prompt: { type: 'string' }, optionA: { type: 'string', required: true }, optionB: { type: 'string', required: true }, initialSelection: { type: 'integer', min: 0, max: 1 }, resultVariable: { type: 'string', required: true }, dialogueFont: { type: 'enum', options: ['fixed8x8', 'fixed8x16'] }, showFrame: { type: 'boolean' }, horizontalAlign: { type: 'enum', options: ['left', 'center', 'right'] }, verticalAlign: { type: 'enum', options: ['top', 'center', 'bottom'] }, animate: { type: 'boolean' }, animationSpeed: { type: 'enum', options: ['slow', 'medium', 'fast'] }, allowCancel: { type: 'boolean' }, avatarImage: { type: 'string' }, avatarSize: { type: 'enum', options: ['16', '32'] }, avatarPlacement: { type: 'enum', options: ['inside', 'frame-top', 'above', 'free'] }, avatarAnchor: { type: 'enum', options: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'center', 'right'] }, avatarX: { type: 'integer', min: 0, max: 240 }, avatarY: { type: 'integer', min: 0, max: 160 } },
  EVENT_MENU_OPEN: { columns: { type: 'integer', min: 1, max: 4 }, optionOrder: { type: 'enum', options: ['rows', 'columns'] }, position: { type: 'enum', options: ['dialogue', 'full-screen', 'left', 'right'] }, initialSelection: { type: 'integer', min: 0, max: 31 }, showTitle: { type: 'boolean' }, prompt: { type: 'string' }, optionA: { type: 'string' }, optionB: { type: 'string' }, options: { type: 'array' }, resultVariable: { type: 'string', required: true }, dialogueFont: { type: 'enum', options: ['fixed8x8', 'fixed8x16'] }, showFrame: { type: 'boolean' }, horizontalAlign: { type: 'enum', options: ['left', 'center', 'right'] }, verticalAlign: { type: 'enum', options: ['top', 'center', 'bottom'] }, animate: { type: 'boolean' }, animationSpeed: { type: 'enum', options: ['slow', 'medium', 'fast'] }, allowCancel: { type: 'boolean' }, avatarImage: { type: 'string' }, avatarSize: { type: 'enum', options: ['16', '32'] }, avatarPlacement: { type: 'enum', options: ['inside', 'frame-top', 'above', 'free'] }, avatarAnchor: { type: 'enum', options: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'center', 'right'] }, avatarX: { type: 'integer', min: 0, max: 240 }, avatarY: { type: 'integer', min: 0, max: 160 } },
  EVENT_DIALOGUE_CLOSE: {},
  EVENT_UI_SET_TEXT: { text: { type: 'string', required: true }, x: { type: 'integer', min: 0, max: 240 }, y: { type: 'integer', min: 0, max: 160 }, font: { type: 'enum', options: ['fixed8x8', 'fixed8x16', 'variable8x8', 'variable8x16', 'variable16x16'] } },
  EVENT_UI_SET_VALUE: { label: { type: 'string' }, value: { type: 'integer', min: -99999999, max: 99999999, required: true }, x: { type: 'integer', min: -240, max: 240 }, y: { type: 'integer', min: -160, max: 160 }, font: { type: 'enum', options: ['fixed8x8', 'fixed8x16', 'variable8x8', 'variable8x16', 'variable16x16'] } },
  EVENT_UI_ANIMATE: { uiId: { type: 'string', required: true }, animation: { type: 'enum', options: ['move', 'blink'], required: true }, x: { type: 'integer', min: 0, max: 240 }, y: { type: 'integer', min: 0, max: 160 }, speed: { type: 'number', min: 0.0625, max: 10, required: true }, customSpeed: { type: 'boolean' }, durationFrames: { type: 'integer', min: 1, max: 600 } },
  EVENT_UI_ANIMATION_STOP: { uiId: { type: 'string', required: true } },
  EVENT_UI_DESTROY: { uiId: { type: 'string', required: true } },
  EVENT_UI_HIDE: { uiId: { type: 'string', required: true } },
  EVENT_UI_SHOW: { uiId: { type: 'string', required: true } },

  EVENT_ACTOR_SET_ROTATION: EVENT_CATALOG_BY_CODE.EVENT_ACTOR_SET_ROTATION.payload,
  EVENT_ACTOR_SET_SCALE: EVENT_CATALOG_BY_CODE.EVENT_ACTOR_SET_SCALE.payload,
  EVENT_SPRITE_EFFECT: { actorId: { type: 'string', required: true }, rotation: { type: 'integer', min: -180, max: 180 }, scale: { type: 'integer', min: 10, max: 400 }, visible: { type: 'boolean' }, fadeColor: { type: 'enum', options: ['none', 'black', 'white'] }, fadeIntensity: { type: 'integer', min: 0, max: 100 }, durationFrames: { type: 'integer', min: 1, max: 600 } },
  EVENT_CHANGE_LAYER: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, backgroundId: { type: 'string' } },
  EVENT_VISIBLE_BACKGROUND: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, visible: { type: 'boolean', required: true } },
  EVENT_BACKGROUND_ANIMATE: EVENT_CATALOG_BY_CODE.EVENT_BACKGROUND_ANIMATE.payload,
  EVENT_BACKGROUND_SCROLL: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, x: { type: 'integer', required: true }, y: { type: 'integer', required: true } },
  EVENT_BACKGROUND_SET_PARALLAX: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, x: { type: 'integer', required: true, min: -200, max: 200 }, y: { type: 'integer', required: true, min: -200, max: 200 } },
  EVENT_BACKGROUND_SET_SCALE: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, x: { type: 'integer', required: true, min: 10, max: 800 }, y: { type: 'integer', required: true, min: 10, max: 800 } },
  EVENT_BACKGROUND_SET_ROTATION: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, angle: { type: 'integer', required: true, min: -360, max: 360 } },
  EVENT_BACKGROUND_SET_SHEAR: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, x: { type: 'integer', required: true, min: -200, max: 200 }, y: { type: 'integer', required: true, min: -200, max: 200 } },
  EVENT_CHANGE_PALETTE_BACKGROUND: { layerId: { type: 'integer', required: true, min: 0, max: 3 }, restorePaletteLayerDefault: { type: 'boolean' } },
  EVENT_CHANGE_DEFAULT_PALETTES: EVENT_CATALOG_BY_CODE.EVENT_CHANGE_DEFAULT_PALETTES.payload,
  EVENT_VARIABLE: { variableId: { type: 'string', required: true } },
  EVENT_VARIABLE_RESET_ALL: {},
  EVENT_LOCAL_VARIABLE_RESET: {},
  EVENT_IF: { operator: { type: 'enum', required: true } },
  EVENT_SWITCH: { value: { type: 'value', required: true } },
  EVENT_WHILE: { operator: { type: 'enum', required: true } },
  EVENT_CALL_SCRIPT: { scriptId: { type: 'string', required: true } },
  EVENT_FOR: { variableId: { type: 'string', required: true }, start: { type: 'integer', required: true }, end: { type: 'integer', required: true }, step: { type: 'integer', required: true } },
  EVENT_BREAK: {},
  EVENT_CONTINUE: {},
  EVENT_WAIT_FOR_BUTTON: { button: { type: 'enum' }, buttons: { type: 'array' }, overrideButton: { type: 'boolean' } },
  EVENT_REMOVE_BUTTON_SCRIPT: { button: { type: 'enum' }, buttons: { type: 'array' } },
  EVENT_PAUSE_UNTIL_BUTTON_PRESSED: { button: { type: 'enum' }, buttons: { type: 'array' } },
  EVENT_WAIT_INPUT: { action: { type: 'string', required: true }, timeoutFrames: { type: 'integer', min: 0 } },
  EVENT_TRIGGER_SET_ENABLED: EVENT_CATALOG_BY_CODE.EVENT_TRIGGER_SET_ENABLED.payload,
  EVENT_IF_ACTOR_FACING: { lookX: { type: 'boolean' }, lookY: { type: 'boolean' }, distanceX: { type: 'integer', min: 0, max: 32767 }, distanceY: { type: 'integer', min: 0, max: 32767 }, distanceXUnit: { type: 'enum', options: ['pixels', 'tiles'] }, distanceYUnit: { type: 'enum', options: ['pixels', 'tiles'] }, actorId: { type: 'string', required: true }, targetActorId: { type: 'string', required: true } },
  EVENT_IF_BUTTON_HELD: { button: { type: 'enum', required: true }, buttons: { type: 'array' } },
  EVENT_INPUT_ENABLE: { group: { type: 'enum', required: true, options: ['gameplay', 'menu', 'interaction', 'all'] } },
  EVENT_INPUT_DISABLE: { group: { type: 'enum', required: true, options: ['gameplay', 'menu', 'interaction', 'all'] } },
};

// Explicit C++ fields. Editor additions never change this iteration order.
const RESOURCE_HEADER_FIELDS: Readonly<Record<string, readonly string[]>> = {
  background: ['id', 'name', 'imageWidth', 'imageHeight'],
  scene: ['id', 'name', 'width', 'height', 'sceneType', 'backgrounds', 'script', 'triggers', 'actors', 'collisions', 'tileAnimations', 'spawnerTimelines'],
  settings: ['startSceneId', 'startX', 'startY', 'startMoveSpeed', 'startAnimSpeed', 'startDirection', 'playerSpriteId', 'inputMap', 'inputMapsBySceneType', 'inputGroups', 'combatConfig', 'shooterConfig'],
  // Numeric sprite/settings fields are already embedded in typed registry
  // initializers. Do not emit a second, unreferenced constant for each field.
  sprite: ['id', 'name'],
  palette: [],
};

export class ResourceBuilder {
  private gameSaveHash(id: string): number {
    let hash = 2166136261;
    for(const byte of Buffer.from(id, 'utf8')) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    return hash;
  }
  private readonly eventDiagnostics = new EventDiagnosticIndex();
  public describeEventFailure(error: unknown): string { return this.eventDiagnostics.format(error); }
  private readonly scriptSourceMaps: Record<string, Array<{ index: number; id: string; command: string; nextIndex: number; falseIndex: number; loopIndex: number }>> = {};
  public async writeScriptSourceMap(): Promise<void> {
    const programs = Object.fromEntries(Object.entries(this.scriptSourceMaps).sort(([left], [right]) => left.localeCompare(right, 'en')));
    fs.writeFileSync(path.join(this.srcDir, '..', 'runtime-script-source-map.json'), JSON.stringify({ schemaVersion: 1, programs }, null, 2) + '\n');
  }
  private srcDir: string;
  private includeDir: string;
  private templateDir: string;

  constructor(buildDir: string, templateDir: string) {
    this.srcDir = path.join(buildDir, 'src');
    this.includeDir = path.join(buildDir, 'include');
    this.templateDir = templateDir;
  }

  /**
   * Process all .gbasres files in a directory and generate header files
   */
  public async processResourceFiles(resourceDir: string): Promise<ResourceFile[]> {
    const resourceFiles: ResourceFile[] = [];
    // Index editor names before validation, including references to later files.
    const rememberNames = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) rememberNames(fullPath);
        else if (entry.isFile() && entry.name.endsWith('.gbasres')) {
          try { this.eventDiagnostics.remember(JSON.parse(fs.readFileSync(fullPath, 'utf8'))); }
          catch { /* The regular reader reports malformed resources below. */ }
        }
      }
    };
    rememberNames(resourceDir);

    const walk = async (dir: string) => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.gbasres')) {
          try {
            const resourceFile = await this.processResource(fullPath);

            if (resourceFile.resourceType === 'deleted') {
              console.log('..: Skipping deleted or empty resource:', fullPath);
              continue;
            }

            resourceFiles.push(resourceFile);
          } catch (err) {
            console.warn('..: Failed to process resource:', fullPath, err);
            throw new Error(`Failed to read resource ${fullPath}: ${(err as Error).message}`);
          }
        }
      }
    };

    await walk(resourceDir);
    return resourceFiles;
  }

  /**
   * Internal adapter for explicit runtime models. Preparation objects must
   * enter through processResourceFiles, which never emits game headers.
   */
  private processResourceObject(resource: JsonResourceDefault): ResourceFile {
    const jsonObj = JSON.parse(JSON.stringify(resource)) as JsonResourceDefault;
    const extension = '_res.h';
    const idPart = jsonObj.id ? `_${jsonObj.id}` : '';
    const headerFilename = `${jsonObj._resourceType}${idPart}`.replaceAll('-', '_');
    const newFilename = `${headerFilename}${extension}`;

    if (jsonObj.name !== undefined) jsonObj.name = jsonObj.name.toLowerCase().replace(/ /g, '_').replaceAll('-', '_');
    if (jsonObj.filename !== undefined) jsonObj.filename = jsonObj.filename.toLowerCase().replace(/ /g, '_').replaceAll('-', '_');
    this.applySettingsDefaults(jsonObj);
    this.validateInputMapResource(jsonObj, `resource ${jsonObj.id ?? jsonObj._resourceType}`);
    this.validateCombatConfigResource(jsonObj, `resource ${jsonObj.id ?? jsonObj._resourceType}`);
    this.validateShooterConfigResource(jsonObj, `resource ${jsonObj.id ?? jsonObj._resourceType}`);

    const headerContent = this.generateHeaderFromJson(headerFilename, jsonObj);
    fs.writeFileSync(path.join(this.includeDir, newFilename), headerContent, 'utf8');
    console.log('..: Generated in-memory resource header:', newFilename);
    return { resourceName: newFilename, resourceType: 'gbasres', headerContent: Buffer.from(headerContent, 'utf8'), jsonContent: jsonObj };
  }

  /**
   * Read a .gbasres file into an independent preparation copy.
   */
  private async processResource(resourcePath: string): Promise<ResourceFile> {
    const fileContent = fs.readFileSync(resourcePath, 'utf8');
    // const baseFilename = path.basename(resourcePath, '.gbasres').toLowerCase().replace(/ /g, '_');
    let headerFilename;
    let newFilename;
    const extension = '_res.h';

    // Parse JSON to extract variables
    let jsonObj: JsonResourceDefault | null = null;
    try {
      jsonObj = normalizeSceneResource(JSON.parse(fileContent));
    } catch (e) {
      throw new Error(`Invalid resource JSON in ${resourcePath}: ${(e as Error).message}`);
    }

    if (!jsonObj || jsonObj?._deleted) {
      return {
        resourceName: '',
        resourceType: 'deleted',
        headerContent: Buffer.from('', 'utf8'),
      };
    } else {
      this.eventDiagnostics.remember(jsonObj);
      if (jsonObj._resourceType === 'variables') {
        this.validateVariablesResource(jsonObj, resourcePath);
      }
      const idPart = jsonObj?.id ? `_${jsonObj.id}` : "";
      headerFilename = `${jsonObj._resourceType}${idPart}`.replaceAll('-', '_');
      newFilename = `${headerFilename}${extension}`;

      if (jsonObj?.name !== undefined) {
        jsonObj.name = jsonObj?.name?.toLowerCase().replace(/ /g, '_').replaceAll('-', '_');
      }

      if(jsonObj?.filename !== undefined) {
        jsonObj.filename = jsonObj?.filename?.toLowerCase().replace(/ /g, '_').replaceAll('-', '_');
      }
      this.applySettingsDefaults(jsonObj);
      this.validateInputMapResource(jsonObj, resourcePath);
      this.validateCombatConfigResource(jsonObj, resourcePath);
      this.validateShooterConfigResource(jsonObj, resourcePath);
    }

    return { resourceName: newFilename, resourceType: 'gbasres', headerContent: Buffer.alloc(0), jsonContent: jsonObj };
  }

  /**
   * Resolve normal input defaults on the independent preparation copy.
   */
  private applySettingsDefaults(resource: any): void {
    if (!resource || resource._resourceType !== 'settings') return;
    inputGroupMasks(resource.inputGroups);
    validateSceneInputMaps(resource.inputMapsBySceneType);
    if (resource.inputMap === undefined) resource.inputMap = {};
    if (!resource.inputMap || typeof resource.inputMap !== 'object' || Array.isArray(resource.inputMap)) return;
    resource.inputMap = withDefaultInputMap(resource.inputMap);
  }

  private validateVariablesResource(resource: any, resourcePath: string): void {
    if (!Array.isArray(resource.variables)) {
      throw new Error(`Invalid variables resource ${resourcePath}: variables must be an array`);
    }

    const ids = new Set<string>();
    const symbols = new Set<string>();
    const supportedTypes = new Set(['number', 'boolean', 'string']);

    for (const variable of resource.variables) {
      if (!variable || typeof variable.id !== 'string' || !variable.id) {
        throw new Error(`Invalid variables resource ${resourcePath}: every variable needs an id`);
      }
      if (ids.has(variable.id)) {
        throw new Error(`Invalid variables resource ${resourcePath}: duplicate variable id ${variable.id}`);
      }
      ids.add(variable.id);

      if (typeof variable.symbol !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.symbol)) {
        throw new Error(`Invalid variables resource ${resourcePath}: invalid C++ symbol ${variable.symbol}`);
      }
      if (symbols.has(variable.symbol)) {
        throw new Error(`Invalid variables resource ${resourcePath}: duplicate variable symbol ${variable.symbol}`);
      }
      symbols.add(variable.symbol);

      if (!supportedTypes.has(variable.type)) {
        throw new Error(`Invalid variables resource ${resourcePath}: unsupported type ${variable.type}`);
      }
      if ((variable.type === 'number' && typeof variable.initialValue !== 'number') ||
          (variable.type === 'boolean' && typeof variable.initialValue !== 'boolean') ||
          (variable.type === 'string' && typeof variable.initialValue !== 'string')) {
        throw new Error(`Invalid variables resource ${resourcePath}: initial value type mismatch for ${variable.id}`);
      }
    }
  }

  private emitVariableEventArgs(name: string, script: any): string {
    const args = script.args || {};
    const value = args.value;
    const command = script.command;
    const variableId = typeof args.variableId === 'string' ? args.variableId : '';

    if (!variableId || command === 'EVENT_VARIABLE_RESET_ALL') {
      return `static const void* ${name} = nullptr;\n`;
    }

    const type = value?.type;
    if (type !== 'number' && type !== 'boolean' && type !== 'string') {
      throw new Error(`Invalid variable event ${script.id}: unsupported value type`);
    }

    const sourceVariableId = value?.kind === 'variable' && typeof value.variableId === 'string'
      ? value.variableId
      : '';
    const numberValue = type === 'number' ? Number(value?.value ?? 0) : 0;
    const booleanValue = type === 'boolean' && Boolean(value?.value ?? false);
    const stringValue = type === 'string' && value?.kind !== 'variable' ? String(value?.value ?? '') : '';
    const escapedString = stringValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    return `static const VariableSetValueData ${name}_VALUE = { "${variableId}", VariableType::${type}, ${numberValue}, ${booleanValue}, "${escapedString}", ${sourceVariableId ? `"${sourceVariableId}"` : 'nullptr'} };\n` +
      `static const void* ${name} = &${name}_VALUE;\n`;
  }

  private getRuntimeArgs(args: any): any {
    if (!args || typeof args !== 'object' || Array.isArray(args)) return args;
    return Object.fromEntries(Object.entries(args).filter(([key]) => !key.startsWith('__')));
  }

  /**
   * Wait has a fixed ABI in the Butano runtime. Seconds and frames are both
   * integer values, but the runtime handles seconds independently from frame
   * waits by converting them to video updates.
   */
  private emitWaitArgs(name: string, args: any): string {
    const rawTime = Number(args?.time ?? 0);
    const seconds = Number.isFinite(rawTime) ? Math.max(0, Math.trunc(rawTime)) : 0;
    const rawFrames = Number(args?.frames ?? 0);
    const frames = Number.isFinite(rawFrames) ? Math.max(0, Math.trunc(rawFrames)) : 0;
    const units = args?.units === 'frames' ? 'frames' : args?.units === 'ticks' ? 'ticks' : 'time';

    return `static const WaitEventData ${name} = { ${seconds}, ${frames}, "${units}" };\n`;
  }

  /**
   * Change Scene has a fixed runtime ABI. Position fields in the editor are
   * CustomField objects, so emit their numeric values rather than serializing
   * the editor metadata as a generic pointer array. prepareNumericArgs has
   * already converted each axis from its selected unit to runtime pixels.
   */
  private emitChangeSceneArgs(name: string, args: any): string {
    const numberValue = (value: any): number => {
      const candidate = typeof value === 'object' && value !== null ? value.value : value;
      const parsed = Number(candidate ?? 0);
      return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
    };
    const sceneId = typeof args?.sceneId === 'string' ? args.sceneId : '';
    const direction = ['left', 'right', 'up', 'down'].includes(args?.direction) ? args.direction : 'right';
    const fadeSpeed = Math.max(1, Math.min(6, numberValue(args?.fadeSpeed ?? 2)));
    const escapedSceneId = sceneId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `static const SceneChangeEventData ${name} = { "${escapedSceneId}", ${numberValue(args?.x)}, ${numberValue(args?.y)}, "${direction}", ${fadeSpeed} };\n`;
  }

  private emitCameraArgs(name: string, args: any, command = 'EVENT_PAN_CAMERA'): string {
    const value = (field: any) => {
      const raw = typeof field === 'object' && field !== null ? field.value : field;
      const number = Number(raw ?? 0);
      return Number.isFinite(number) ? Math.trunc(number) : 0;
    };
    const animated = args?.animated ?? command === 'EVENT_CAMERA_MOVE_TO';
    const motion = animated ? `, true, ${Math.round(Math.max(0.0625, Math.min(16, Number(args?.speed ?? 1))) * 256)}` : '';
    return `static const CameraEventData ${name} = { ${value(args?.x)}, ${value(args?.y)}${motion} };\n`;
  }

  private emitPhysicsArgs(name: string, args: any, command: string): string {
    if (command === 'EVENT_STOP_PHYSICS') return `static const StopPhysicsEventData ${name} = { ${JSON.stringify(String(args?.actorId ?? '__PLAYER__'))} };\n`;
    const setting = PHYSICS_SETTING_EVENTS[command];
    if (setting) {
      const raw = args?.[setting.field] ?? setting.defaultValue;
      const value = setting.field === 'allowDiagonal' ? (raw ? 1 : 0) : Math.round(Number(raw) * (setting.field === 'airJumps' ? 1 : 256));
      return `static const PhysicsSettingEventData ${name} = { ${JSON.stringify(String(args?.actorId ?? '__PLAYER__'))}, PhysicsSetting::${setting.native}, ${value} };\n`;
    }
    if (command === 'EVENT_PHYSICS_RESET') args = { ...args, reset: true };
    const q8 = (field: string, fallback: number) => Math.round(Number(args?.[field] ?? fallback) * 256);
    if (command === 'EVENT_APPLY_VERTICAL_IMPULSE') {
      return `static const VerticalImpulseEventData ${name} = { ${JSON.stringify(String(args?.actorId ?? '__PLAYER__'))}, ${q8('impulse', -5)}, ${args?.mode === 'add' ? 'true' : 'false'} };\n`;
    }
    return `static const MovementEventData ${name} = { ${JSON.stringify(String(args?.actorId ?? '__PLAYER__'))}, ${args?.reset === true ? 'true' : 'false'}, ${args?.allowDiagonal !== false ? 'true' : 'false'}, ${q8('gravity', 0.25)}, ${q8('jumpSpeed', 5)}, ${q8('maxFallSpeed', 6)}, ${args?.airJumps ?? 0} };\n`;
  }

  private emitCameraFollowArgs(name: string, args: any): string {
    return `static const CameraFollowEventData ${name} = { true, ${JSON.stringify(args?.actorId ?? '__PLAYER__')}, ${args?.clampToScene === true ? 'true' : 'false'}, ${Math.max(0, Math.min(240, Math.trunc(Number(args?.deadZoneWidth ?? 0))))}, ${Math.max(0, Math.min(160, Math.trunc(Number(args?.deadZoneHeight ?? 0))))}, ${args?.lockX === true ? 'true' : 'false'}, ${args?.lockY === true ? 'true' : 'false'}, ${args?.persistAcrossScenes === true ? 'true' : 'false'} };\n`;
  }

  private emitCameraShakeArgs(name: string, args: any): string {
    const frames = Math.max(1, Math.min(120, Math.trunc(Number(args?.frames ?? 8) || 8)));
    const amplitude = Math.max(1, Math.min(8, Math.trunc(Number(args?.amplitude ?? 2) || 2)));
    const axis = args?.axis === 'horizontal' ? 1 : args?.axis === 'vertical' ? 2 : 0;
    return `static const CameraShakeEventData ${name} = { ${frames}, ${amplitude}, ${axis} };\n`;
  }

  private emitFadeArgs(name: string, args: any): string {
    const speedValue = Number(args?.speed ?? 2);
    const speed = Number.isFinite(speedValue) ? Math.max(1, Math.min(6, Math.trunc(speedValue))) : 2;
    return `static const FadeEventData ${name} = { ${speed} };\n`;
  }

  private emitActorMoveArgs(name: string, args: any, command = 'EVENT_MOVE_ACTOR'): string {
    const actorId = JSON.stringify(String(args?.actorId ?? args?.actor_id ?? ''));
    const x = Number(args?.x ?? 0);
    const y = Number(args?.y ?? 0);
    const animated = command !== 'EVENT_ACTOR_SET_POSITION' && (args?.animated ?? command === 'EVENT_ACTOR_MOVE_TO');
    const hasOptions = ['collideWalls', 'collideActors', 'lockDirection', 'movementType'].some(key => args?.[key] !== undefined);
    const motion = animated || hasOptions ? `, ${animated ? 'true' : 'false'}, ${Math.round(Math.max(0.0625, Math.min(16, Number(args?.speed ?? 1))) * 256)}, ${Math.trunc(Number(args?.animationSpeed ?? -1))}, ${args?.collideWalls !== false}, ${args?.collideActors === true}, ${['none', 'horizontal', 'vertical'].indexOf(args?.lockDirection ?? 'none')}, ${['horizontal-first', 'vertical-first', 'diagonal'].indexOf(args?.movementType ?? 'horizontal-first')}, ${hasOptions}` : '';
    return `static const ActorMoveEventData ${name} = { ${actorId}, ${Number.isFinite(x) ? x : 0}, ${Number.isFinite(y) ? y : 0}${motion} };\n`;
  }

  private emitActorArgs(name: string, command: string, args: any): string {
    const actorId = JSON.stringify(String(args?.actorId ?? args?.actor_id ?? ''));
    if (command === 'EVENT_SHOW_EMOTE') return `static const ShowEmoteEventData ${name} = { ${actorId}, ${JSON.stringify(String(args?.emoteId ?? ''))}, ${args?.distance ?? 12} };\n`;
    if (command === 'EVENT_ACTOR_SET_DIRECTION') {
      const directions: Record<string, number> = { up: 0, right: 1, down: 2, left: 3 };
      const direction = args?.direction ?? 'down';
      if(!Object.prototype.hasOwnProperty.call(directions, direction)) throw new Error('Invalid actor direction');
      return `static const ActorDirectionEventData ${name} = { ${actorId}, ${directions[direction]} };\n`;
    }
    if (command === 'EVENT_ACTOR_SET_STATE') return `static const ActorStateEventData ${name} = { ${actorId}, ${JSON.stringify(String(args?.stateId ?? ''))} };\n`;
    if (command === 'EVENT_ACTOR_SET_ANIMATION') {
      const action = ['speed', 'loop', 'once', 'stop', 'frame'].includes(args?.action) ? args.action : 'speed';
      return `static const ActorAnimationControlEventData ${name} = { ${actorId}, ${JSON.stringify(action)}, ${JSON.stringify(String(args?.stateId ?? ''))}, ${JSON.stringify(String(args?.animationId ?? ''))}, ${Math.max(0, Math.min(60, Math.trunc(Number(args?.speed ?? 6) || 0)))}, ${Math.max(0, Math.min(255, Math.trunc(Number(args?.frame ?? 0) || 0)))}, ${args?.reverse === true ? 'true' : 'false'} };\n`;
    }
    if (command === 'EVENT_SPAWN_ACTOR' || command === 'EVENT_ACTOR_SPAWN') return `static const ActorSpawnEventData ${name} = { ${args?.source === 'prefab' ? JSON.stringify(args.prefabId) : actorId}, ${Number(args?.x ?? 0)}, ${Number(args?.y ?? 0)}, ${args?.source === 'prefab'} };\n`;
    if (command === 'EVENT_REMOVE_ACTOR' || command === 'EVENT_ACTOR_DESPAWN') return `static const ActorRemoveEventData ${name} = { ${args?.source === 'prefab' ? JSON.stringify(args.prefabId) : actorId}, ${args?.source === 'prefab'} };\n`;
    if (command === 'EVENT_SET_ANIMATION_SPEED') return `static const ActorAnimationSpeedEventData ${name} = { ${actorId}, ${Number(args?.speed ?? 0)} };\n`;
    if (command === 'EVENT_SET_ACTOR_PRIORITY') return `static const ActorPriorityEventData ${name} = { ${actorId}, ${Math.max(0, Math.min(3, Number(args?.priority ?? 2)))} };\n`;
    const visible = command === 'EVENT_SHOW_ACTOR' || (command !== 'EVENT_HIDE_ACTOR' && args?.visible !== false);
    return `static const ActorVisibilityEventData ${name} = { ${actorId}, ${visible ? 'true' : 'false'} };\n`;
  }

  private emitPlayMusicArgs(name: string, args: any, jingle = false): string {
    const musicId = JSON.stringify(String(args?.musicId ?? args?.music_id ?? ''));
    const volume = Number(args?.volume ?? 100);
    const type = jingle ? 'PlayJingleEventData' : 'PlayMusicEventData';
    const volumeValue = Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.trunc(volume))) : 100;
    if (jingle) return `static const ${type} ${name} = { ${musicId}, ${volumeValue} };\n`;
    return `static const ${type} ${name} = { ${musicId}, ${volumeValue}, ${args?.loop !== false ? 'true' : 'false'} };\n`;
  }

  private emitPlaySoundArgs(name: string, args: any): string {
    const soundIdValue = args?.soundSource === 'generated' ? this.generatedEventSoundId(args)
      : args?.soundSource === 'project' ? this.projectSfxSoundId(String(args?.soundId ?? args?.sound_id ?? ''))
      : String(args?.soundId ?? args?.sound_id ?? '');
    const soundId = JSON.stringify(soundIdValue);
    const volume = Number(args?.volume);
    const speed = Number(args?.speed);
    const panning = Number(args?.panning);
    const priority = Number(args?.priority);
    const safeVolume = Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.trunc(volume))) : 100;
    const safeSpeed = Number.isFinite(speed) ? Math.max(25, Math.min(400, Math.trunc(speed))) : 100;
    const safePanning = Number.isFinite(panning) ? Math.max(-100, Math.min(100, Math.trunc(panning))) : 0;
    const safePriority = Number.isFinite(priority) ? Math.max(-32767, Math.min(32767, Math.trunc(priority))) : 0;
    const group = JSON.stringify(String(args?.group ?? ''));
    return `static const PlaySoundEventData ${name} = { ${soundId}, ${safeVolume}, ${safeSpeed}, ${safePanning}, ${safePriority}, ${group} };\n`;
  }

  private generatedEventSoundId(args: Record<string, unknown>): string {
    const parameters = normalizeGeneratedSoundParameters(args);
    const digest = crypto.createHash('sha256').update(JSON.stringify(parameters)).digest('hex').slice(0, 16);
    return `gba_event_sfx_${digest}`;
  }

  private projectSfxSoundId(sourceName: string): string {
    return `gba_sfx_${crypto.createHash('sha256').update(sourceName).digest('hex').slice(0, 16)}`;
  }

  /** Materialize referenced .gbasfx source documents as build-only WAV assets. */
  public prepareProjectSfxSounds(resourceFiles: ResourceFile[], projectSfxDir: string, audioDir: string): number {
    const sources = new Set<string>();
    const collect = (events: any[]) => {
      for (const event of Array.isArray(events) ? events : []) {
        if (event?.args?.__comment === true || event?.disabled === true || event?.enabled === false) continue;
        if (event?.command === 'EVENT_PLAY_SOUND' && event.args?.soundSource === 'project') {
          const name = String(event.args?.soundId ?? '');
          if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) throw new Error(`Invalid GBA SFX project reference: ${name || '(empty)'}.`);
          sources.add(name);
        }
        collect(event?.children?.then); collect(event?.children?.else);
      }
    };
    for (const events of this.resourcePrograms(resourceFiles)) collect(events);
    fs.mkdirSync(audioDir, { recursive: true });
    for (const filename of fs.readdirSync(audioDir)) {
      if (/^gba_sfx_[a-f0-9]{16}\.wav$/i.test(filename)) fs.rmSync(path.join(audioDir, filename), { force: true });
    }
    for (const name of sources) {
      const filename = `${name}.gbasfx`;
      const sourcePath = path.join(projectSfxDir, filename);
      if (!fs.existsSync(sourcePath)) throw new Error(`GBA SFX project ${filename} referenced by an event was not found in project/sounds.`);
      let document: any;
      try { document = JSON.parse(fs.readFileSync(sourcePath, 'utf8')); }
      catch { throw new Error(`GBA SFX project ${filename} is not valid JSON.`); }
      // Version 1 files saved before fade-in and volume controls omit these
      // fields. Match the editor defaults while still rejecting invalid values.
      const storedParameters = document?.parameters;
      const parameters = storedParameters && typeof storedParameters === 'object' && !Array.isArray(storedParameters)
        ? { fadeInMs: defaultSfxParameters.fadeInMs, volume: defaultSfxParameters.volume, ...storedParameters }
        : null;
      if (document?.schema !== 'gba-studio/sfx' || document.version !== 1 || document.name !== name
        || !parameters || !isSfxWaveform(parameters.waveform) || !isSfxHarmonics(parameters.harmonics)
        || !Number.isFinite(parameters.frequency) || parameters.frequency < SFX_LIMITS.minFrequency || parameters.frequency > LEGACY_SFX_MAX_FREQUENCY
        || !Number.isFinite(parameters.durationMs) || parameters.durationMs < SFX_LIMITS.minDurationMs || parameters.durationMs > SFX_LIMITS.maxDurationMs
        || !Number.isFinite(parameters.fadeInMs) || parameters.fadeInMs < 0 || parameters.fadeInMs > parameters.durationMs
        || !Number.isFinite(parameters.fadeOutMs) || parameters.fadeOutMs < 0 || parameters.fadeOutMs > parameters.durationMs
        || !Number.isFinite(parameters.volume) || parameters.volume < 0 || parameters.volume > 100
        || parameters.sampleRate !== 22050 || !Number.isInteger(parameters.seed) || parameters.seed < 0 || parameters.seed > 0xffffffff) {
        throw new Error(`GBA SFX project ${filename} has invalid parameters.`);
      }
      const generated = generateSfx(parameters as SfxParameters);
      const id = this.projectSfxSoundId(name);
      fs.writeFileSync(path.join(audioDir, `${id}.wav`), Buffer.from(encodePcm16Wav(generated.pcm, generated.parameters.sampleRate)));
    }
    return sources.size;
  }

  /** Materialize event-generated effects as static WAV assets for Maxmod. */
  public prepareGeneratedEventSounds(resourceFiles: ResourceFile[], audioDir: string): number {
    const sounds = new Map<string, Record<string, unknown>>();
    const collect = (events: any[]) => {
      for (const event of Array.isArray(events) ? events : []) {
        if (event?.args?.__comment === true || event?.disabled === true || event?.enabled === false) continue;
        if (event?.command === 'EVENT_PLAY_SOUND' && event.args?.soundSource === 'generated') {
          const args = event.args as Record<string, unknown>;
          sounds.set(this.generatedEventSoundId(args), args);
        }
        collect(event?.children?.then);
        collect(event?.children?.else);
      }
    };
    for (const events of this.resourcePrograms(resourceFiles)) collect(events);
    fs.mkdirSync(audioDir, { recursive: true });
    for (const filename of fs.readdirSync(audioDir)) {
      if (/^gba_event_sfx_[a-f0-9]{16}\.wav$/i.test(filename)) fs.rmSync(path.join(audioDir, filename), { force: true });
    }
    if (!sounds.size) return 0;
    for (const [id, args] of sounds) {
      const sampleRate = args.sfxParameters !== undefined ? 22050 : GENERATED_SOUND_SAMPLE_RATE;
      const samples = generateEventSoundSamples(args, sampleRate);
      const data = Buffer.alloc(samples.length * 2);
      for (let index = 0; index < samples.length; index += 1) data.writeInt16LE(Math.round(samples[index] * 32767), index * 2);
      const header = Buffer.alloc(44);
      header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
      header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22); header.writeUInt32LE(sampleRate, 24);
      header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
      fs.writeFileSync(path.join(audioDir, `${id}.wav`), Buffer.concat([header, data]));
    }
    return sounds.size;
  }

  private emitMusicVolumeArgs(name: string, args: any): string {
    const volume = Number(args?.volume ?? 100);
    return `static const MusicVolumeEventData ${name} = { ${Number.isFinite(volume) ? Math.max(0, Math.min(100, volume)) : 100} };\n`;
  }

  private emitMusicFadeArgs(name: string, args: any): string {
    const target = Math.max(0, Math.min(100, Math.trunc(Number(args?.targetVolume ?? 0) || 0)));
    const duration = Math.max(1, Math.min(600, Math.trunc(Number(args?.durationFrames ?? 30) || 30)));
    return `static const MusicFadeEventData ${name} = { ${target}, ${duration} };\n`;
  }

  private emitDialogueArgs(name: string, args: any, supportsPortrait = false): string {
    const value = JSON.stringify(String(args?.text ?? args?.dialogue ?? ''));
    const horizontal = ['left', 'center', 'right'].includes(args?.horizontalAlign) ? args.horizontalAlign : 'center';
    const vertical = ['top', 'center', 'bottom'].includes(args?.verticalAlign) ? args.verticalAlign : 'bottom';
    const showFrame = args?.showFrame !== false ? 'true' : 'false';
    const animate = args?.animate !== false ? 'true' : 'false';
    const animationSpeed = ['slow', 'medium', 'fast'].includes(args?.animationSpeed) ? args.animationSpeed : 'medium';
    const dialogueFont = ['fixed8x8', 'fixed8x16'].includes(args?.dialogueFont) ? args.dialogueFont : 'fixed8x16';
    const avatar = !supportsPortrait || args?.portraitEnabled !== true ? '' : String(args?.avatarImage ?? '').split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().replace(/_+/g, '_') ?? '';
    const avatarName = avatar ? `avatar_${avatar && !/^[a-z]/.test(avatar) ? `a_${avatar}` : avatar}` : '';
    const avatarSize = Number(args?.avatarSize) === 32 ? 32 : 16;
    const avatarPlacement = ['inside', 'frame-top', 'above', 'free'].includes(args?.avatarPlacement) ? args.avatarPlacement : 'inside';
    const avatarAnchor = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'center', 'right'].includes(args?.avatarAnchor) ? args.avatarAnchor : 'top-left';
    const avatarX = Math.max(0, Math.min(240 - avatarSize, Math.trunc(Number(args?.avatarX) || 0)));
    const avatarY = Math.max(0, Math.min(160 - avatarSize, Math.trunc(Number(args?.avatarY) || 0)));
    return `static const DialogueEventData ${name} = { ${value}, ${JSON.stringify(dialogueFont)}, ${showFrame}, ${JSON.stringify(horizontal)}, ${JSON.stringify(vertical)}, ${animate}, ${JSON.stringify(animationSpeed)}, ${JSON.stringify(avatarName)}, ${avatarSize}, ${JSON.stringify(avatarPlacement)}, ${JSON.stringify(avatarAnchor)}, ${avatarX}, ${avatarY} };\n`;
  }

  private emitVariableTextArgs(name: string, args: any): string {
    const variableId = JSON.stringify(String(args?.variableId ?? ''));
    const x = Math.max(0, Math.min(240, Math.trunc(Number(args?.x ?? 0))));
    const y = Math.max(0, Math.min(160, Math.trunc(Number(args?.y ?? 0))));
    const font = ['variable8x8', 'variable8x16', 'variable16x16'].includes(args?.font) ? args.font : 'variable8x16';
    return `static const VariableTextEventData ${name} = { ${variableId}, ${x}, ${y}, ${JSON.stringify(font)} };\n`;
  }

  private emitDialogueChoiceArgs(name: string, args: any, isMenu: boolean): string {
    const value = (key: string) => JSON.stringify(String(args?.[key] ?? ''));
    const layout = getMenuLayout(args ?? {}, isMenu);
    const issues = getMenuLayoutIssues(args ?? {}, isMenu);
    if (issues.length) throw new Error(`Menu layout: ${issues.map(issue => `${issue.code}${issue.index ? ` (option ${issue.index})` : ''}${issue.max ? `; maximum ${issue.max}` : ''}`).join(', ')}`);
    const optionText = layout.options.join('\n');
    const font = args?.dialogueFont === 'fixed8x8' ? 'fixed8x8' : 'fixed8x16';
    const horizontal = ['left', 'center', 'right'].includes(args?.horizontalAlign) ? args.horizontalAlign : 'left';
    const vertical = ['top', 'center', 'bottom'].includes(args?.verticalAlign) ? args.verticalAlign : 'bottom';
    const animationSpeed = ['slow', 'fast'].includes(args?.animationSpeed) ? args.animationSpeed : 'medium';
    const avatar = String(args?.avatarImage ?? '').split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().replace(/_+/g, '_') ?? '';
    const avatarName = avatar ? `avatar_${avatar && !/^[a-z]/.test(avatar) ? `a_${avatar}` : avatar}` : '';
    const avatarSize = Number(args?.avatarSize) === 32 ? 32 : 16;
    const avatarPlacement = ['inside', 'frame-top', 'above', 'free'].includes(args?.avatarPlacement) ? args.avatarPlacement : 'inside';
    const avatarAnchor = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'left', 'center', 'right'].includes(args?.avatarAnchor) ? args.avatarAnchor : 'top-left';
    const avatarX = Math.max(0, Math.min(240 - avatarSize, Math.trunc(Number(args?.avatarX) || 0)));
    const avatarY = Math.max(0, Math.min(160 - avatarSize, Math.trunc(Number(args?.avatarY) || 0)));
    const position = isMenu ? ({ 'full-screen': 1, left: 2, right: 3 } as Record<string, number>)[args?.position] ?? 0 : 0;
    const initialSelection = Math.max(0, Math.min(layout.options.length - 1, Math.trunc(Number(args?.initialSelection) || 0)));
    return `static const DialogueChoiceEventData ${name} = { ${JSON.stringify(layout.prompt)}, ${value('optionA')}, ${value('optionB')}, ${value('resultVariable')}, ${JSON.stringify(optionText)}, ${JSON.stringify(font)}, ${args?.showFrame !== false ? 'true' : 'false'}, ${JSON.stringify(horizontal)}, ${JSON.stringify(vertical)}, ${args?.animate !== false ? 'true' : 'false'}, ${JSON.stringify(animationSpeed)}, ${args?.allowCancel !== false ? 'true' : 'false'}, ${JSON.stringify(avatarName)}, ${avatarSize}, ${JSON.stringify(avatarPlacement)}, ${JSON.stringify(avatarAnchor)}, ${avatarX}, ${avatarY}, ${layout.columns}, ${layout.columnMajor ? 'true' : 'false'}, ${initialSelection}, ${position} };\n`;
  }

  /**
   * Background layer events have a stable runtime ABI.  Keeping this separate
   * from the generic object emitter is important because an absent background
   * otherwise becomes a pointer-to-pointer while a selected background is a
   * character array.  The C++ handler must receive the same two slots in both
   * cases (layer/background or layer/visibility).
   */
  private emitBackgroundLayerArgs(name: string, args: any, event: 'change' | 'visibility'): string {
    const rawLayer = Number(args?.layerId ?? 0);
    const layerId = Number.isFinite(rawLayer) ? Math.max(0, Math.min(3, Math.trunc(rawLayer))) : 0;
    const backgroundId = typeof args?.backgroundId === 'string' ? args.backgroundId : '';
    const escapedBackgroundId = backgroundId.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    if(event === 'change') {
      return `static const LayerChangeEventData ${name} = { ${layerId}, "${escapedBackgroundId}" };\n`;
    }
    return `static const LayerVisibilityEventData ${name} = { ${layerId}, ${args?.visible !== false} };\n`;
  }

  private emitBackgroundAnimationArgs(name: string, args: any): string {
    const regular = args?.regularBackgroundId ?? '', bitmap = args?.bitmapBackgroundId ?? '';
    if (typeof regular !== 'string' || typeof bitmap !== 'string' || !(regular || bitmap)) throw new Error('Background animation sheet has not been prepared');
    const count = args?.resolvedFrameCount, start = args?.sourceStartFrame, delta = args?.frameDelta, x = args?.stepX, y = args?.stepY;
    if (!Number.isInteger(count) || count < 1 || count > 512 || !Number.isInteger(start) || start < 0 || ![-1, 1].includes(delta)
      || start + (count - 1) * delta < 0 || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 16384 || y > 16384 || !(x > 0 && y === 0 || y > 0 && x === 0)) throw new Error('Invalid prepared background animation range or displacement');
    return `static const BackgroundAnimationEventData ${name} = { ${args?.layerId ?? 0}, ${regular ? JSON.stringify(regular) : 'nullptr'}, ${bitmap ? JSON.stringify(bitmap) : 'nullptr'}, ${count}, ${start}, ${delta}, ${x}, ${y}, ${args?.durationFrames ?? 6}, ${args?.loop !== false ? 'true' : 'false'} };\n`;
  }

  private emitBackgroundScrollArgs(name: string, args: any): string {
    const layer = Math.max(0, Math.min(3, Math.trunc(Number(args?.layerId ?? 0) || 0)));
    const x = Number(args?.x ?? 0);
    const y = Number(args?.y ?? 0);
    return `static const BackgroundScrollEventData ${name} = { ${layer}, ${Number.isFinite(x) ? Math.trunc(x) : 0}, ${Number.isFinite(y) ? Math.trunc(y) : 0} };\n`;
  }

  private emitBackgroundParallaxArgs(name: string, args: any): string {
    const layer = Math.max(0, Math.min(3, Math.trunc(Number(args?.layerId ?? 0) || 0)));
    const factor = (value: unknown, fallback: number) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.max(-200, Math.min(200, Math.trunc(number))) : fallback;
    };
    return `static const BackgroundParallaxEventData ${name} = { ${layer}, ${factor(args?.x, 100)}, ${factor(args?.y, 100)} };\n`;
  }

  private emitPaletteLayerArgs(name: string, args: any): string {
    const rawLayer = Number(args?.layerId ?? 0);
    const layerId = Number.isFinite(rawLayer) ? Math.max(0, Math.min(3, Math.trunc(rawLayer))) : 0;
    const restore = args?.restorePaletteLayerDefault === true;
    const paletteIds = Array.isArray(args?.paletteIds) ? args.paletteIds : [];
    const definitions = Array.from({ length: 16 }, (_, index) => {
      const value = typeof paletteIds[index] === 'string' ? paletteIds[index] : '';
      const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `static const char ${name}_PALETTE_${index}[] = "${escaped}";`;
    }).join('\n');
    const pointers = Array.from({ length: 16 }, (_, index) => `${name}_PALETTE_${index}`).join(', ');
    return `${definitions}\n` +
      `static const char* ${name}_PALETTE_IDS[16] = { ${pointers} };\n` +
      `static const PaletteLayerEventData ${name} = { ${layerId}, ${restore}, ${name}_PALETTE_IDS };\n`;
  }

  private emitFadeOptionsArgs(name: string, args: any): string {
    const color = args?.color === 'white' ? 'white' : 'black';
    return `static const char ${name}_COLOR[] = "${color}";\n` +
      `static const void* ${name}[] = { ${name}_COLOR };\n`;
  }

  private emitConditionValue(name: string, value: any): string {
    const type = value?.type === 'boolean' || value?.type === 'string' ? value.type : 'number';
    const isVariable = value?.kind === 'variable' && typeof value.variableId === 'string';
    const variableId = isVariable ? JSON.stringify(value.variableId) : 'nullptr';
    const numberValue = type === 'number' && !isVariable ? Number(value?.value ?? 0) : 0;
    const booleanValue = type === 'boolean' && !isVariable ? Boolean(value?.value ?? false) : false;
    const stringValue = type === 'string' && !isVariable ? JSON.stringify(String(value?.value ?? '')) : 'nullptr';
    const button = value?.kind === 'button' && typeof value.button === 'string' ? JSON.stringify(value.button) : 'nullptr';

    return `static const ScriptValueData ${name} = { VariableType::${type}, ${isVariable}, ${variableId}, ${numberValue}, ${booleanValue}, ${stringValue}, ${button} };\n`;
  }

  private emitScriptCondition(name: string, args: any): string {
    const leftName = `${name}_LEFT`;
    const rightName = `${name}_RIGHT`;
    const operator = ['==', '!=', '>', '>=', '<', '<='].includes(args?.operator) ? args.operator : '==';

    return this.emitConditionValue(leftName, args?.left) +
      this.emitConditionValue(rightName, args?.right) +
      `static const ScriptConditionData ${name}_VALUE = { ${leftName}, ${rightName}, ${JSON.stringify(operator)} };\n` +
      `static const void* ${name} = &${name}_VALUE;\n`;
  }

  private isNumericValue(value: any): value is NumericValue {
    return value && typeof value === 'object' && ['number', 'constant', 'property', 'trigger', 'engine', 'direction', 'expression', 'formula'].includes(value.kind)
      || value && typeof value === 'object' && value.kind === 'variable' && value.type === undefined;
  }

  private prepareNumericArgs(command: string, source: any, name: string) {
    const args = { ...(source ?? {}) };
    if (['EVENT_DISPLAY_DIALOGUE', 'EVENT_DIALOGUE_SHOW', 'EVENT_DIALOGUE_CHOICE', 'EVENT_MENU_OPEN'].includes(command)) {
      for (const field of ['avatarX', 'avatarY']) {
        if (args[field + 'Unit'] === 'tiles') {
          const raw = args[field];
          args[field] = Number(raw && typeof raw === 'object' ? raw.value : raw ?? 0) * 16;
        }
      }
    }
    const coordinateEvent = (COORDINATE_EVENTS as readonly string[]).includes(command) || command === 'EVENT_IF_ACTOR_FACING';
    const coordinateFields = command === 'EVENT_IF_ACTOR_FACING' ? ['distanceX', 'distanceY'] : ['x', 'y'];
    if (command === 'EVENT_CHANGE_SCENE') { args.xUnit ??= 'tiles'; args.yUnit ??= 'tiles'; }
    if (coordinateEvent) {
      for (const axis of coordinateFields) {
        const coordinate = args[axis];
        if (coordinate && typeof coordinate === 'object' && (coordinate.type === 'number' || coordinate.kind === 'literal')) {
          args[axis] = { kind: 'number', value: Number(coordinate.value) };
        }
      }
    }
    const tileScale = (key: string) => coordinateEvent && coordinateFields.includes(key) && args[key + 'Unit'] === 'tiles' ? 16 : 1;
    for (const axis of coordinateFields) {
      if (tileScale(axis) === 16 && !this.isNumericValue(args[axis])) {
        const value = Number(args[axis] && typeof args[axis] === 'object' && args[axis].type === 'number' ? args[axis].value : args[axis] ?? 0);
        if (!Number.isFinite(value) || !Number.isInteger(value)) throw new Error(`Invalid actor coordinate ${axis}`);
        args[axis] = Math.max(-2147483648, Math.min(2147483647, value * 16));
      }
    }
    const bindings: string[] = [];
    let code = '', payload = '';
    for (const [key, value] of Object.entries(args)) {
      if (!this.isNumericValue(value)) continue;
      const field = NUMERIC_EVENT_FIELDS[command]?.[key];
      if (!field) throw new Error(`Numeric values are not supported for ${command}.${key}`);
      validateNumericValue(value);
      if (value.kind === 'number') {
        args[key] = ['EVENT_VARIABLE', 'EVENT_IF', 'EVENT_WHILE'].includes(command) ? { kind: 'literal', type: 'number', value: value.value } : Math.max(-2147483648, Math.min(2147483647, value.value * tileScale(key)));
        continue;
      }
      payload = field.payload;
      const program = `${name}_NUMERIC_${bindings.length}`;
      const instructions = coordinateEvent && coordinateFields.includes(key)
        ? numericCoordinateInstructions(value, tileScale(key)) : numericInstructions(value);
      code += `static const NumericInstruction ${program}_INSTRUCTIONS[] = {\n` + instructions.map(instruction =>
        `    { NumericOperation::op_${instruction.operation}, ${instruction.value ?? 0}, ${instruction.reference ? JSON.stringify(instruction.reference) : 'nullptr'}, ${instruction.argument ?? 0} },\n`).join('') + `};\n`;
      code += `static const NumericProgram ${program} = { ${program}_INSTRUCTIONS, ${instructions.length} };\n`;
      const schema = EVENT_VALIDATION_SCHEMA[command]?.[key];
      bindings.push(`    { offsetof(${field.payload}, ${field.member}), &${program}, ${schema?.min ?? field.minimum ?? '-2147483647 - 1'}, ${schema?.max ?? field.maximum ?? 2147483647} }`);
      args[key] = ['EVENT_VARIABLE', 'EVENT_IF', 'EVENT_WHILE'].includes(command) ? { kind: 'literal', type: 'number', value: 0 } : 0;
    }
    const metadata = bindings.length ? `${name}_NUMERIC_VALUES` : null;
    if (metadata) code += `static_assert(sizeof(${payload}) <= 256, "Numeric event payload exceeds scratch capacity");\nstatic const NumericEventField ${metadata}_FIELDS[] = {\n${bindings.join(',\n')}\n};\nstatic const NumericEventValues ${metadata} = { ${metadata}_FIELDS, ${bindings.length}, sizeof(${payload}) };\n`;
    return { args, code, metadata };
  }

  private emitSceneScripts(baseName: string, scripts: any[]): string {
    scripts = toRuntimeScripts(scripts);
    type FlatScript = {
      script: any;
      argsName: string;
      nextIndex: number;
      falseIndex: number;
      loopIndex: number;
    };

    const flatScripts: FlatScript[] = [];
    type LoopContext = { breakTarget: number; continueTarget: number; loopIndex: number };
    const compileSequence = (events: any[], continuation: number, loopContext?: LoopContext): number => {
      let nextIndex = continuation;

      for (let eventIndex = events.length - 1; eventIndex >= 0; eventIndex--) {
        const sourceScript = events[eventIndex];
        const script = sourceScript?.command === 'EVENT_IF_ACTOR_FACING'
          ? { ...sourceScript, args: { actorId: '__SELF__', targetActorId: '__PLAYER__', ...sourceScript.args } }
          : sourceScript;
        if (script?.args?.__comment) continue;
        try { this.validateCatalogEvent(script); } catch (error) { throw withEventContext(script, error); }

        if (script.command === 'EVENT_IF' || script.command === 'EVENT_IF_ACTOR_FACING' || script.command === 'EVENT_IF_BUTTON_HELD' || script.command === 'EVENT_WAIT_FOR_BUTTON' || script.command === 'EVENT_SAVE_WRITE' || script.command === 'EVENT_SAVE_LOAD') {
          const commandIndex = flatScripts.length;
          flatScripts.push({
            script,
            argsName: `${baseName}_ARGS_${commandIndex}`,
            nextIndex,
            falseIndex: -1,
            loopIndex: -1,
          });
          const thenStart = compileSequence(script.children?.then || [], nextIndex, loopContext);
          const falseStart = script.command === 'EVENT_WAIT_FOR_BUTTON'
            ? thenStart
            : script.command === 'EVENT_SAVE_WRITE' ? compileSequence(script.children?.else || [], -1, undefined)
            : script.command === 'EVENT_IF' || script.command === 'EVENT_IF_ACTOR_FACING' || script.command === 'EVENT_IF_BUTTON_HELD'
            ? compileSequence(script.children?.else || [], nextIndex, loopContext)
            : -1;
          flatScripts[commandIndex].nextIndex = script.command === 'EVENT_WAIT_FOR_BUTTON' ? nextIndex : thenStart;
          flatScripts[commandIndex].falseIndex = falseStart;
          if(script.command === 'EVENT_SAVE_WRITE' || script.command === 'EVENT_SAVE_LOAD') flatScripts[commandIndex].loopIndex = nextIndex;
          nextIndex = commandIndex;
        } else if (script.command === 'EVENT_WHILE' || script.command === 'EVENT_FOR') {
          const commandIndex = flatScripts.length;
          // nextIndex already points to the next statement in this sequence;
          // continuation is the exit of the enclosing sequence, not this loop.
          flatScripts.push({ script, argsName: `${baseName}_ARGS_${commandIndex}`, nextIndex, falseIndex: nextIndex, loopIndex: commandIndex });
          const bodyStart = compileSequence(script.children?.then || [], commandIndex, { breakTarget: nextIndex, continueTarget: commandIndex, loopIndex: commandIndex });
          flatScripts[commandIndex].nextIndex = bodyStart;
          nextIndex = commandIndex;
        } else if (script.command === 'EVENT_BREAK' || script.command === 'EVENT_CONTINUE') {
          const commandIndex = flatScripts.length;
          flatScripts.push({
            script,
            argsName: `${baseName}_ARGS_${commandIndex}`,
            nextIndex: loopContext ? (script.command === 'EVENT_BREAK' ? loopContext.breakTarget : loopContext.continueTarget) : continuation,
            falseIndex: -1,
            loopIndex: loopContext?.loopIndex ?? -1,
          });
          nextIndex = commandIndex;
        } else {
          const commandIndex = flatScripts.length;
          flatScripts.push({
            script,
            argsName: `${baseName}_ARGS_${commandIndex}`,
            nextIndex,
            falseIndex: -1,
            loopIndex: -1,
          });
          nextIndex = commandIndex;
        }
      }

      return nextIndex;
    };

    const compiledStartIndex = compileSequence(scripts, -1);
    const orderedScripts: FlatScript[] = [];
    const indexMap = new Map<number, number>();
    const visit = (index: number): void => {
      if (index < 0 || indexMap.has(index)) return;
      indexMap.set(index, orderedScripts.length);
      orderedScripts.push(flatScripts[index]);
      visit(flatScripts[index].nextIndex);
      visit(flatScripts[index].falseIndex);
    };
    visit(compiledStartIndex);

    // Runtime loop state has 16 slots per program. Instruction positions are
    // jump addresses, not slots: a single FOR after 20 commands still uses 0.
    const loopSlots = new Map<number, number>();
    for (const flatScript of orderedScripts) {
      if (flatScript.script.command === 'EVENT_FOR') {
        if (loopSlots.size >= 16) throw new Error(`Script ${baseName} exceeds the runtime limit of 16 FOR loops`);
        loopSlots.set(flatScript.loopIndex, loopSlots.size);
      }
    }
    for (const flatScript of orderedScripts) {
      const nextIndex = flatScript.nextIndex;
      const falseIndex = flatScript.falseIndex;
      flatScript.nextIndex = nextIndex < 0 ? -1 : indexMap.get(nextIndex)!;
      flatScript.falseIndex = falseIndex < 0 ? -1 : indexMap.get(falseIndex)!;
      flatScript.loopIndex = ['EVENT_SAVE_WRITE', 'EVENT_SAVE_LOAD'].includes(flatScript.script.command)
        ? flatScript.loopIndex < 0 ? -1 : indexMap.get(flatScript.loopIndex) ?? -1
        : loopSlots.get(flatScript.loopIndex) ?? -1;
    }

    let response = '';
    const numericMetadata = new Map<FlatScript, string>();

    for (const flatScript of orderedScripts) {
      try {
      const prepared = this.prepareNumericArgs(flatScript.script.command, flatScript.script.args, flatScript.argsName);
      response += prepared.code;
      if (prepared.metadata) numericMetadata.set(flatScript, prepared.metadata);
      const args = prepared.args;
      response += ['EVENT_IF', 'EVENT_WHILE'].includes(flatScript.script.command)
        ? this.emitScriptCondition(flatScript.argsName, args)
        : flatScript.script.command === 'EVENT_TRIGGER_SET_ENABLED'
          ? (() => { const trigger = this.getRuntimeArgs(args) ?? {}; if(typeof trigger.triggerId !== 'string' || !trigger.triggerId.trim()) throw new Error('Select a trigger'); return `static const TriggerEnabledEventData ${flatScript.argsName} = { ${JSON.stringify(trigger.triggerId)}, ${trigger.enabled === false ? 'false' : 'true'} };\n`; })()
        : flatScript.script.command === 'EVENT_IF_ACTOR_FACING'
          ? this.emitActorFacingArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_IF_BUTTON_HELD'
          ? this.emitButtonHeldArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : ['EVENT_FADE_IN', 'EVENT_FADE_OUT'].includes(flatScript.script.command)
          ? this.emitFadeArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_FADE_OPTIONS'
          ? this.emitFadeOptionsArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_WAIT'
          ? this.emitWaitArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_CHANGE_SCENE'
          ? this.emitChangeSceneArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : ['EVENT_PAN_CAMERA', 'EVENT_CAMERA_MOVE_TO'].includes(flatScript.script.command)
          ? this.emitCameraArgs(flatScript.argsName, this.getRuntimeArgs(args), flatScript.script.command)
        : PHYSICS_EVENT_CODES.includes(flatScript.script.command)
          ? this.emitPhysicsArgs(flatScript.argsName, this.getRuntimeArgs(args), flatScript.script.command)
        : flatScript.script.command === 'EVENT_CAMERA_FOLLOW'
          ? this.emitCameraFollowArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_CAMERA_SHAKE'
          ? this.emitCameraShakeArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : ['EVENT_MOVE_ACTOR', 'EVENT_ACTOR_MOVE_TO', 'EVENT_ACTOR_SET_POSITION'].includes(flatScript.script.command)
          ? this.emitActorMoveArgs(flatScript.argsName, this.getRuntimeArgs(args), flatScript.script.command)
        : ['EVENT_ACTOR_SET_DIRECTION', 'EVENT_SHOW_EMOTE', 'EVENT_ACTOR_SET_STATE', 'EVENT_SPAWN_ACTOR', 'EVENT_ACTOR_SPAWN', 'EVENT_REMOVE_ACTOR', 'EVENT_ACTOR_DESPAWN', 'EVENT_VISIBLE_ACTOR', 'EVENT_ACTOR_SET_VISIBLE', 'EVENT_HIDE_ACTOR', 'EVENT_SHOW_ACTOR', 'EVENT_SET_ANIMATION_SPEED', 'EVENT_ACTOR_SET_ANIMATION', 'EVENT_SET_ACTOR_PRIORITY'].includes(flatScript.script.command)
          ? this.emitActorArgs(flatScript.argsName, flatScript.script.command, this.getRuntimeArgs(args))
        : ['EVENT_PLAY_MUSIC', 'EVENT_MUSIC_PLAY_JINGLE'].includes(flatScript.script.command)
          ? this.emitPlayMusicArgs(flatScript.argsName, this.getRuntimeArgs(args), flatScript.script.command === 'EVENT_MUSIC_PLAY_JINGLE')
        : flatScript.script.command === 'EVENT_PLAY_SOUND'
          ? this.emitPlaySoundArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_RUMBLE'
          ? `static const RumbleEventData ${flatScript.argsName} = { ${Math.max(1, Math.min(120, Math.trunc(Number(this.getRuntimeArgs(args)?.durationFrames ?? 8) || 8)))}, ${Math.max(0, Math.min(100, Math.trunc(Number(this.getRuntimeArgs(args)?.intensity ?? 100) || 0)))} };\n`
        : ['EVENT_STOP_MUSIC', 'EVENT_MUSIC_STOP', 'EVENT_MUSIC_RESUME', 'EVENT_MUSIC_PAUSE'].includes(flatScript.script.command)
          ? `static const void* ${flatScript.argsName} = nullptr;\n`
        : flatScript.script.command === 'EVENT_SOUND_STOP'
          ? `static const SoundStopEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.group ?? ''))} };\n`
        : flatScript.script.command === 'EVENT_SET_MUSIC_VOLUME'
          ? this.emitMusicVolumeArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_MUSIC_FADE'
          ? this.emitMusicFadeArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_BLEND_ALPHA'
          ? `static const BlendAlphaEventData ${flatScript.argsName} = { ${Math.max(0, Math.min(100, Math.trunc(Number(this.getRuntimeArgs(args)?.alpha ?? 100) || 0)))} };
`
        : ['EVENT_HBE_EFFECT_ENABLE', 'EVENT_HBE_EFFECT_DISABLE'].includes(flatScript.script.command)
          ? `static const HbeEffectEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.preset ?? 'mosaic_wave'))}, ${Math.max(0, Math.min(16, Math.trunc(Number(this.getRuntimeArgs(args)?.intensity ?? 8) || 0)))}, ${Math.max(0, Math.min(3, Math.trunc(Number(this.getRuntimeArgs(args)?.layerId ?? 0) || 0)))}, ${flatScript.script.command === 'EVENT_HBE_EFFECT_ENABLE' ? 'true' : 'false'} };\n`
        : ['EVENT_SHOOTER_START', 'EVENT_SHOOTER_SPAWN_WAVE'].includes(flatScript.script.command)
          ? `static const ShooterStartEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.waveId ?? ''))} };\n`
        : flatScript.script.command === 'EVENT_SHOOTER_LOAD_STAGE'
          ? (() => { const stage = this.getRuntimeArgs(args) ?? {}; return `static const ShooterLoadStageEventData ${flatScript.argsName} = { ${JSON.stringify(String(stage.waveId ?? ''))}, ${JSON.stringify(String(stage.musicId ?? ''))}, ${Math.max(0, Math.min(100, Math.trunc(Number(stage.musicVolume ?? 100) || 0)))}, ${JSON.stringify(String(stage.backgroundId ?? ''))}, ${Math.max(0, Math.min(3, Math.trunc(Number(stage.backgroundLayer ?? 0) || 0)))} };\n`; })()
        : flatScript.script.command === 'EVENT_SHOOTER_SET_BACKGROUND_MODE'
          ? (() => { const mode = this.getRuntimeArgs(args) ?? {}; return `static const ShooterBackgroundModeEventData ${flatScript.argsName} = { ${Math.max(0, Math.min(3, Math.trunc(Number(mode.layerId ?? 0) || 0)))}, ${mode.visible !== false ? 'true' : 'false'}, ${Math.max(-2048, Math.min(2048, Math.trunc(Number(mode.scrollX ?? 0) || 0)))}, ${Math.max(-2048, Math.min(2048, Math.trunc(Number(mode.scrollY ?? 0) || 0)))}, ${Math.max(-200, Math.min(200, Math.trunc(Number(mode.parallaxX ?? 100) || 0)))}, ${Math.max(-200, Math.min(200, Math.trunc(Number(mode.parallaxY ?? 100) || 0)))} };\n`; })()
        : flatScript.script.command === 'EVENT_SHOOTER_PAUSE'
          ? `static const ShooterPauseEventData ${flatScript.argsName} = { ${this.getRuntimeArgs(args)?.paused === true ? 'true' : 'false'} };\n`
        : ['EVENT_SHOOTER_STOP', 'EVENT_SHOOTER_CLEAR_ENEMIES'].includes(flatScript.script.command)
          ? `static const void* ${flatScript.argsName} = nullptr;\n`
        : flatScript.script.command === 'EVENT_SHOOTER_SPAWN_BOSS'
          ? `static const ShooterBossSpawnEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.archetypeId ?? ''))}, ${Math.trunc(Number(this.getRuntimeArgs(args)?.x ?? 120))}, ${Math.trunc(Number(this.getRuntimeArgs(args)?.y ?? 32))}, ${JSON.stringify(String(this.getRuntimeArgs(args)?.dropId ?? ''))} };\n`
        : flatScript.script.command === 'EVENT_SHOOTER_SET_BOSS_PHASE'
          ? `static const ShooterBossPhaseEventData ${flatScript.argsName} = { ${Math.max(0, Math.min(7, Math.trunc(Number(this.getRuntimeArgs(args)?.phase ?? 0) || 0)))} };\n`
        : flatScript.script.command === 'EVENT_SHOOTER_WAIT_SIGNAL'
          ? `static const ShooterWaitSignalEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.signal ?? 'wave_cleared'))}, ${Math.max(0, Math.min(65535, Math.trunc(Number(this.getRuntimeArgs(args)?.timeoutFrames ?? 0) || 0)))} };\n`
        : flatScript.script.command === 'EVENT_SHOOTER_GRANT'
          ? `static const ShooterGrantEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.grant ?? 'score'))}, ${Math.max(0, Math.min(9999, Math.trunc(Number(this.getRuntimeArgs(args)?.value ?? 0) || 0)))} };\n`
        : ['EVENT_SHOOTER_SET_STAT', 'EVENT_SHOOTER_ADD_STAT'].includes(flatScript.script.command)
          ? `static const ShooterStatEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.stat ?? 'player_hit_points'))}, ${Math.max(-9999, Math.min(9999, Math.trunc(Number(this.getRuntimeArgs(args)?.value ?? 0) || 0)))}, ${flatScript.script.command === 'EVENT_SHOOTER_ADD_STAT' ? 'true' : 'false'} };\n`
        : flatScript.script.command === 'EVENT_SHOOTER_SET_PLAYER_ENABLED'
          ? `static const ShooterPlayerEnabledEventData ${flatScript.argsName} = { ${this.getRuntimeArgs(args)?.enabled === true ? 'true' : 'false'} };\n`
        : ['EVENT_DISPLAY_DIALOGUE', 'EVENT_DIALOGUE_SHOW', 'EVENT_TEXT_SCROLL'].includes(flatScript.script.command)
          ? this.emitDialogueArgs(flatScript.argsName, this.getRuntimeArgs(args), ['EVENT_DISPLAY_DIALOGUE', 'EVENT_DIALOGUE_SHOW'].includes(flatScript.script.command))
        : flatScript.script.command === 'EVENT_UI_SET_TEXT'
          ? (() => { const ui = this.getRuntimeArgs(args) ?? {}; return `static const UiSetTextEventData ${flatScript.argsName} = { ${JSON.stringify(String(flatScript.script.id))}, ${JSON.stringify(String(ui.text ?? ''))}, ${Math.max(0, Math.min(240, Math.trunc(Number(ui.x ?? 0) || 0)))}, ${Math.max(0, Math.min(160, Math.trunc(Number(ui.y ?? 0) || 0)))}, ${JSON.stringify(String(ui.font ?? 'fixed8x16'))} };\n`; })()
        : flatScript.script.command === 'EVENT_UI_SET_VALUE'
          ? (() => { const ui = this.getRuntimeArgs(args) ?? {}; return `static const UiSetValueEventData ${flatScript.argsName} = { ${JSON.stringify(String(flatScript.script.id))}, ${JSON.stringify(String(ui.label ?? ''))}, ${Math.max(-99999999, Math.min(99999999, Math.trunc(Number(ui.value ?? 0) || 0)))}, ${Math.max(-240, Math.min(240, Math.trunc(Number(ui.x ?? 0) || 0)))}, ${Math.max(-160, Math.min(160, Math.trunc(Number(ui.y ?? 0) || 0)))}, ${JSON.stringify(String(ui.font ?? 'fixed8x16'))} };\n`; })()
        : flatScript.script.command === 'EVENT_UI_ANIMATE'
          ? (() => { const ui = this.getRuntimeArgs(args) ?? {}; const duration = ui.animation !== 'blink' || ui.durationFrames == null ? 0 : Math.max(1, Math.min(600, Math.trunc(Number(ui.durationFrames) || 1))); const speedUnits = Math.max(1, Math.min(160, Math.round(Number(ui.speed ?? 2) * 16))); return `static const UiAnimateEventData ${flatScript.argsName} = { ${JSON.stringify(String(ui.uiId ?? ''))}, ${JSON.stringify(String(ui.animation ?? 'move'))}, ${Math.max(0, Math.min(240, Math.trunc(Number(ui.x ?? 0) || 0)))}, ${Math.max(0, Math.min(160, Math.trunc(Number(ui.y ?? 0) || 0)))}, ${speedUnits}, ${duration} };\n`; })()
        : ['EVENT_UI_DESTROY', 'EVENT_UI_HIDE', 'EVENT_UI_SHOW'].includes(flatScript.script.command)
          ? `static const UiTargetEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.uiId ?? ''))} };\n`
        : flatScript.script.command === 'EVENT_UI_ANIMATION_STOP'
          ? `static const UiAnimationStopEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.uiId ?? ''))} };\n`
        : ['EVENT_ACTOR_SET_ROTATION', 'EVENT_ACTOR_SET_SCALE'].includes(flatScript.script.command)
          ? (() => { const effect = this.getRuntimeArgs(args) ?? {}; const rotation = flatScript.script.command === 'EVENT_ACTOR_SET_ROTATION'; return `static const ActorTransformEventData ${flatScript.argsName} = { ${JSON.stringify(String(effect.actorId ?? '__PLAYER__'))}, ${Number(rotation ? effect.angle ?? 0 : effect.scale ?? 100)}, ${Number(effect.durationFrames ?? 1)} };\n`; })()
        : flatScript.script.command === 'EVENT_SPRITE_EFFECT'
          ? (() => { const effect = this.getRuntimeArgs(args) ?? {}; return `static const SpriteEffectEventData ${flatScript.argsName} = { ${JSON.stringify(String(effect.actorId ?? ''))}, ${Math.max(-180, Math.min(180, Math.trunc(Number(effect.rotation ?? 0) || 0)))}, ${Math.max(10, Math.min(400, Math.trunc(Number(effect.scale ?? 100) || 100)))}, ${effect.visible !== false ? 'true' : 'false'}, ${JSON.stringify(String(effect.fadeColor ?? 'none'))}, ${Math.max(0, Math.min(100, Math.trunc(Number(effect.fadeIntensity ?? 0) || 0)))}, ${Math.max(1, Math.min(600, Math.trunc(Number(effect.durationFrames ?? 1) || 1)))} };\n`; })()
        : ['EVENT_ACTOR_SET_TINT', 'EVENT_ACTOR_SET_SATURATION', 'EVENT_ACTOR_SET_BRIGHTNESS', 'EVENT_ACTOR_SET_OPACITY'].includes(flatScript.script.command)
          ? (() => {
              const effect = this.getRuntimeArgs(args) ?? {};
              const color = String(effect.color ?? '#ffffff');
              if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Actor Color Overlay requires a color in #RRGGBB format');
              return `static const ActorVisualEventData ${flatScript.argsName} = { ${JSON.stringify(String(effect.actorId ?? '__PLAYER__'))}, ${Number(effect.value ?? 0)}, ${parseInt(color.slice(1), 16)}, ${Number(effect.durationFrames ?? 1)} };\n`;
            })()
        : ['EVENT_VARIABLES_SAVE', 'EVENT_VARIABLES_LOAD'].includes(flatScript.script.command)
          ? (() => {
            const ids = args.allVariables === true ? [] : args.variableIds ?? [];
            const symbol = `${flatScript.argsName}_VARIABLE_IDS`;
            return (ids.length ? `static const char* const ${symbol}[] = { ${ids.map((id: string) => JSON.stringify(id)).join(', ')} };\n` : '')
              + `static const VariablesSaveEventData ${flatScript.argsName} = { ${Number(args.slot ?? 7)}, ${args.allVariables === true ? 'true' : 'false'}, ${ids.length ? symbol : 'nullptr'}, ${ids.length} };\n`;
          })()
        : ['EVENT_SAVE_WRITE', 'EVENT_SAVE_LOAD', 'EVENT_SAVE_REMOVE', 'EVENT_SAVE_ON_LOAD'].includes(flatScript.script.command)
          ? (() => {
            const saveArgs = this.getRuntimeArgs(args) ?? {};
            return `static const GameDataEventData ${flatScript.argsName} = { ${Number(saveArgs.slot ?? 0)}, ${this.gameSaveHash(flatScript.script.id)}u, ${flatScript.script.command === 'EVENT_SAVE_LOAD' && flatScript.script.children ? 'true' : 'false'} };\n`;
          })()
        : flatScript.script.command === 'EVENT_DISPLAY_VARIABLE_TEXT'
          ? this.emitVariableTextArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : ['EVENT_DIALOGUE_CHOICE', 'EVENT_MENU_OPEN'].includes(flatScript.script.command)
          ? this.emitDialogueChoiceArgs(flatScript.argsName, this.getRuntimeArgs(args), flatScript.script.command === 'EVENT_MENU_OPEN')
        : flatScript.script.command === 'EVENT_FOR'
          ? `static const ForEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.variableId ?? ''))}, ${Math.trunc(Number(this.getRuntimeArgs(args)?.start ?? 0))}, ${Math.trunc(Number(this.getRuntimeArgs(args)?.end ?? 0))}, ${Math.trunc(Number(this.getRuntimeArgs(args)?.step ?? 1)) || 1} };\n`
        : ['EVENT_BREAK', 'EVENT_CONTINUE'].includes(flatScript.script.command)
          ? `static const void* ${flatScript.argsName} = nullptr;\n`
        : flatScript.script.command === 'EVENT_RUN_BUTTON_ACTION'
          ? `static const ButtonActionEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.button ?? 'B'))}, ${this.getRuntimeArgs(args)?.mode === 'custom' ? 'true' : 'false'} };\n`
        : flatScript.script.command === 'EVENT_WAIT_FOR_BUTTON'
          ? (() => {
              const selected = Array.isArray(this.getRuntimeArgs(args)?.buttons)
                ? this.getRuntimeArgs(args).buttons.filter((button: unknown): button is string => typeof button === 'string' && button.length > 0)
                : [];
              const buttons = selected.length > 0 ? selected : [String(this.getRuntimeArgs(args)?.button ?? 'A')];
              const values = buttons.map((button: string) => JSON.stringify(button)).join(', ');
              const overrideButton = this.getRuntimeArgs(args)?.overrideButton === true ? 'true' : 'false';
              return `static const char* const ${flatScript.argsName}_BUTTONS[] = { ${values} };\nstatic const ButtonWaitEventData ${flatScript.argsName} = { ${flatScript.argsName}_BUTTONS, ${buttons.length}, ${overrideButton} };\n`;
            })()
        : flatScript.script.command === 'EVENT_REMOVE_BUTTON_SCRIPT'
          ? (() => {
              const selected = Array.isArray(this.getRuntimeArgs(args)?.buttons)
                ? this.getRuntimeArgs(args).buttons.filter((button: unknown): button is string => typeof button === 'string' && button.length > 0)
                : [];
              const buttons = selected.length > 0 ? selected : [String(this.getRuntimeArgs(args)?.button ?? 'A')];
              const values = buttons.map((button: string) => JSON.stringify(button)).join(', ');
              return `static const char* const ${flatScript.argsName}_BUTTONS[] = { ${values} };\nstatic const ButtonScriptRemoveEventData ${flatScript.argsName} = { ${flatScript.argsName}_BUTTONS, ${buttons.length} };\n`;
            })()
        : flatScript.script.command === 'EVENT_PAUSE_UNTIL_BUTTON_PRESSED'
          ? (() => {
              const selected = Array.isArray(this.getRuntimeArgs(args)?.buttons)
                ? this.getRuntimeArgs(args).buttons.filter((button: unknown): button is string => typeof button === 'string' && button.length > 0)
                : [];
              const buttons = selected.length > 0 ? selected : [String(this.getRuntimeArgs(args)?.button ?? 'A')];
              const values = buttons.map((button: string) => JSON.stringify(button)).join(', ');
              return `static const char* const ${flatScript.argsName}_BUTTONS[] = { ${values} };\nstatic const ButtonPressWaitEventData ${flatScript.argsName} = { ${flatScript.argsName}_BUTTONS, ${buttons.length} };\n`;
            })()
        : flatScript.script.command === 'EVENT_WAIT_INPUT'
          ? (() => {
              const action = String(this.getRuntimeArgs(args)?.action ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
              const timeout = Math.max(0, Math.trunc(Number(this.getRuntimeArgs(args)?.timeoutFrames ?? 0)) || 0);
              return `static const WaitInputEventData ${flatScript.argsName} = { "${action}", ${timeout} };\n`;
            })()
        : ['EVENT_INPUT_ENABLE', 'EVENT_INPUT_DISABLE'].includes(flatScript.script.command)
          ? `static const InputGroupEventData ${flatScript.argsName} = { ${JSON.stringify(String(this.getRuntimeArgs(args)?.group ?? 'gameplay'))}, ${flatScript.script.command === 'EVENT_INPUT_ENABLE' ? 'true' : 'false'} };\n`
        : ['EVENT_HIDE_DIALOGUE', 'EVENT_DIALOGUE_CLOSE'].includes(flatScript.script.command)
          ? `static const void* ${flatScript.argsName} = nullptr;\n`
        : flatScript.script.command === 'EVENT_CHANGE_LAYER'
          ? this.emitBackgroundLayerArgs(flatScript.argsName, this.getRuntimeArgs(args), 'change')
        : flatScript.script.command === 'EVENT_VISIBLE_BACKGROUND'
          ? this.emitBackgroundLayerArgs(flatScript.argsName, this.getRuntimeArgs(args), 'visibility')
        : flatScript.script.command === 'EVENT_BACKGROUND_ANIMATE'
          ? this.emitBackgroundAnimationArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_BACKGROUND_SCROLL'
          ? this.emitBackgroundScrollArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : flatScript.script.command === 'EVENT_BACKGROUND_SET_PARALLAX'
          ? this.emitBackgroundParallaxArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : ['EVENT_BACKGROUND_SET_SCALE', 'EVENT_BACKGROUND_SET_ROTATION', 'EVENT_BACKGROUND_SET_SHEAR'].includes(flatScript.script.command)
          ? `static const BackgroundTransformEventData ${flatScript.argsName} = { ${Number(this.getRuntimeArgs(args)?.layerId ?? 0)}, ${Number(this.getRuntimeArgs(args)?.[flatScript.script.command === 'EVENT_BACKGROUND_SET_ROTATION' ? 'angle' : 'x'] ?? 0)}, ${Number(this.getRuntimeArgs(args)?.y ?? 0)} };\n`
        : flatScript.script.command === 'EVENT_CHANGE_DEFAULT_PALETTES'
          ? `static const char* const ${flatScript.argsName}_IDS[16] = { ${Array.from({ length: 16 }, (_, index) => JSON.stringify(this.getRuntimeArgs(args)?.paletteIds?.[index] ?? '')).join(', ')} };\nstatic const DefaultPalettesEventData ${flatScript.argsName} = { ${flatScript.argsName}_IDS };\n`
        : flatScript.script.command === 'EVENT_CHANGE_PALETTE_BACKGROUND'
          ? this.emitPaletteLayerArgs(flatScript.argsName, this.getRuntimeArgs(args))
        : ['EVENT_VARIABLE', 'EVENT_VARIABLE_RESET_ALL', 'EVENT_LOCAL_VARIABLE_RESET'].includes(flatScript.script.command)
          ? this.emitVariableEventArgs(flatScript.argsName, { ...flatScript.script, args })
          : this.emitRemainingEventArgs(flatScript.argsName, flatScript.script.command, args);
      } catch (error) { throw withEventContext(flatScript.script, error); }
    }

    // GCC rejects zero-sized arrays. A scene containing only commented
    // commands still needs a valid pointer because the scene registry is
    // generated from the original script list; its count remains zero.
    if (orderedScripts.length === 0) {
      this.scriptSourceMaps[`${baseName}_SCRIPTS`] = [];
      return response +
        `static const ScriptCommandData ${baseName}_SCRIPTS[1] = {};\n` +
        `static const int ${baseName}_SCRIPTS_COUNT = 0;\n`;
    }

    response += `static const ScriptCommandData ${baseName}_SCRIPTS[] = {\n`;
    const typedPayloadCommands = new Set([
      'EVENT_TRIGGER_SET_ENABLED',
      'EVENT_BACKGROUND_ANIMATE',
      'EVENT_ACTOR_SET_TINT', 'EVENT_ACTOR_SET_SATURATION', 'EVENT_ACTOR_SET_BRIGHTNESS', 'EVENT_ACTOR_SET_OPACITY',
      'EVENT_BACKGROUND_SET_SCALE', 'EVENT_BACKGROUND_SET_ROTATION', 'EVENT_BACKGROUND_SET_SHEAR',
      ...PHYSICS_EVENT_CODES,
      'EVENT_ACTOR_SET_DIRECTION', 'EVENT_ACTOR_SET_STATE',
      'EVENT_SHOW_EMOTE',
      'EVENT_WAIT', 'EVENT_FADE_IN', 'EVENT_FADE_OUT', 'EVENT_CHANGE_SCENE',
      'EVENT_CAMERA_FOLLOW', 'EVENT_CAMERA_SHAKE', 'EVENT_MUSIC_FADE',
      'EVENT_PAN_CAMERA', 'EVENT_CAMERA_MOVE_TO', 'EVENT_MOVE_ACTOR', 'EVENT_ACTOR_MOVE_TO', 'EVENT_ACTOR_SET_POSITION', 'EVENT_SPAWN_ACTOR', 'EVENT_ACTOR_SPAWN',
      'EVENT_REMOVE_ACTOR', 'EVENT_ACTOR_DESPAWN', 'EVENT_VISIBLE_ACTOR', 'EVENT_ACTOR_SET_VISIBLE', 'EVENT_HIDE_ACTOR', 'EVENT_SHOW_ACTOR', 'EVENT_SET_ANIMATION_SPEED', 'EVENT_ACTOR_SET_ANIMATION', 'EVENT_SET_ACTOR_PRIORITY',
      'EVENT_PLAY_MUSIC', 'EVENT_MUSIC_PLAY_JINGLE', 'EVENT_SET_MUSIC_VOLUME', 'EVENT_HBE_EFFECT_ENABLE', 'EVENT_HBE_EFFECT_DISABLE', 'EVENT_BLEND_ALPHA', 'EVENT_DISPLAY_DIALOGUE', 'EVENT_DIALOGUE_SHOW', 'EVENT_TEXT_SCROLL', 'EVENT_SAVE_WRITE', 'EVENT_SAVE_LOAD', 'EVENT_SAVE_REMOVE', 'EVENT_SAVE_ON_LOAD', 'EVENT_DISPLAY_VARIABLE_TEXT',
      'EVENT_PLAY_SOUND',
      'EVENT_RUMBLE',
      'EVENT_SHOOTER_START', 'EVENT_SHOOTER_SPAWN_WAVE', 'EVENT_SHOOTER_LOAD_STAGE', 'EVENT_SHOOTER_SET_BACKGROUND_MODE', 'EVENT_SHOOTER_PAUSE', 'EVENT_SHOOTER_SET_PLAYER_ENABLED', 'EVENT_SHOOTER_SPAWN_BOSS', 'EVENT_SHOOTER_SET_BOSS_PHASE', 'EVENT_SHOOTER_WAIT_SIGNAL', 'EVENT_SHOOTER_GRANT', 'EVENT_SHOOTER_SET_STAT', 'EVENT_SHOOTER_ADD_STAT',
      'EVENT_DIALOGUE_CHOICE', 'EVENT_MENU_OPEN',
      'EVENT_RUN_BUTTON_ACTION', 'EVENT_CALL_SCRIPT', 'EVENT_FOR', 'EVENT_WAIT_FOR_BUTTON', 'EVENT_REMOVE_BUTTON_SCRIPT', 'EVENT_PAUSE_UNTIL_BUTTON_PRESSED', 'EVENT_WAIT_INPUT',
      'EVENT_CHANGE_LAYER', 'EVENT_VISIBLE_BACKGROUND', 'EVENT_BACKGROUND_SCROLL', 'EVENT_BACKGROUND_SET_PARALLAX', 'EVENT_UI_SET_TEXT', 'EVENT_UI_SET_VALUE', 'EVENT_UI_ANIMATE', 'EVENT_UI_ANIMATION_STOP', 'EVENT_UI_DESTROY', 'EVENT_UI_HIDE', 'EVENT_UI_SHOW', 'EVENT_SPRITE_EFFECT', 'EVENT_ACTOR_SET_ROTATION', 'EVENT_ACTOR_SET_SCALE',
      'EVENT_CHANGE_PALETTE_BACKGROUND', 'EVENT_CHANGE_DEFAULT_PALETTES',
      'EVENT_LOCAL_VARIABLE_RESET', 'EVENT_INPUT_ENABLE', 'EVENT_INPUT_DISABLE', 'EVENT_VARIABLES_SAVE', 'EVENT_VARIABLES_LOAD',
    ]);
    this.scriptSourceMaps[`${baseName}_SCRIPTS`] = [];
    for (const flatScript of orderedScripts) {
      const falseIndex = ['EVENT_IF', 'EVENT_WHILE', 'EVENT_FOR', 'EVENT_IF_ACTOR_FACING', 'EVENT_IF_BUTTON_HELD', 'EVENT_WAIT_FOR_BUTTON'].includes(flatScript.script.command) ? flatScript.falseIndex : -1;
      const nextIndex = flatScript.nextIndex < 0 ? orderedScripts.length : flatScript.nextIndex;
      const safeFalseIndex = falseIndex < 0 ? orderedScripts.length : falseIndex;
      this.scriptSourceMaps[`${baseName}_SCRIPTS`].push({ index: this.scriptSourceMaps[`${baseName}_SCRIPTS`].length,
        id: flatScript.script.id, command: flatScript.script.command, nextIndex, falseIndex: safeFalseIndex, loopIndex: flatScript.loopIndex });
      const argsReference = typedPayloadCommands.has(flatScript.script.command)
        ? `&${flatScript.argsName}`
        : flatScript.argsName;
      response += `    { ${JSON.stringify(flatScript.script.command)}, ${argsReference}, ${nextIndex}, ${safeFalseIndex}, ${flatScript.loopIndex}${numericMetadata.has(flatScript) ? `, &${numericMetadata.get(flatScript)}` : ''} },\n`;
    }
    response += `};\nstatic const int ${baseName}_SCRIPTS_COUNT = ${orderedScripts.length};\n`;
    const savePoints = orderedScripts.filter(item => item.script.command === 'EVENT_SAVE_WRITE');
    if(savePoints.length) response += `static const GameSavePoint ${baseName}_SAVE_POINTS[] = {\n` + savePoints.map(item =>
      `    { ${this.gameSaveHash(item.script.id)}u, ${baseName}_SCRIPTS, ${orderedScripts.length}, ${item.falseIndex} },\n`).join('') +
      `};\nstatic const int ${baseName}_SAVE_POINTS_COUNT = ${savePoints.length};\n`;
    return response;
  }

  private emitActorFacingArgs(name: string, args: any): string {
    for (const field of ['actorId', 'targetActorId']) {
      if (typeof args?.[field] !== 'string' || !args[field].trim()) throw new Error(`Actor facing requires ${field}`);
    }
    return `static const ActorFacingEventData ${name}_VALUE = { ${JSON.stringify(args.actorId)}, ${JSON.stringify(args.targetActorId)}, ${args.lookX !== false}, ${args.lookY !== false}, ${Math.max(0, Math.trunc(Number(args.distanceX) || 0))}, ${Math.max(0, Math.trunc(Number(args.distanceY) || 0))} };\nstatic const void* ${name} = &${name}_VALUE;\n`;
  }

  private emitButtonHeldArgs(name: string, args: any): string {
    const selected = Array.isArray(args?.buttons) ? args.buttons.filter((button: unknown): button is string => typeof button === 'string' && button.length > 0) : [];
    const buttons = selected.length > 0 ? selected : [String(args?.button ?? 'A')];
    const values = buttons.map((button: string) => JSON.stringify(button)).join(', ');
    return `static const char* const ${name}_BUTTONS[] = { ${values} };\nstatic const ButtonHeldEventData ${name}_VALUE = { ${name}_BUTTONS, ${buttons.length} };\nstatic const void* ${name} = &${name}_VALUE;\n`;
  }

  /** Final export accepts only explicit models, never the preparation copy. */
  public processRuntimeResource(resource: RuntimeResource): RuntimeResourceFile {
    const fields: Record<RuntimeResource['_resourceType'], readonly string[]> = {
      background: ['id', 'graphicsName', 'imageWidth', 'imageHeight', 'slotPaletteBindings'],
      scene: ['id', 'name', 'width', 'height', 'sceneType', 'cameraPosition', 'backgrounds', 'script', 'actors', 'triggers', 'collisions', 'tileAnimations', 'spawnerTimelines'],
      settings: ['id', 'startSceneId', 'startX', 'startY', 'startMoveSpeed', 'startAnimSpeed', 'startDirection', 'fadeDirection', 'playerSpriteId', 'uiCursorImage', 'inputMap', 'inputMapsBySceneType', 'inputGroups', 'combatConfig', 'shooterConfig', 'colorPaletteIds'],
      sprite: ['id', 'name', 'graphicsName', 'playerFrameWidth', 'playerFrameHeight', 'playerCanvasWidth', 'playerCanvasHeight', 'compositeColumns', 'compositeRows', 'playerAnimSpeed', 'playerIdleFrame', 'playerCanvasOriginX', 'playerCanvasOriginY', 'playerCollisionX', 'playerCollisionY', 'playerCollisionWidth', 'playerCollisionHeight', 'animations'],
      palette: ['id', 'colors'], variables: ['id', 'variables'], scripts: ['id', 'scripts'],
    };
    const allowed = fields[resource._resourceType];
    if (!allowed) throw new Error(`Unsupported runtime resource type ${(resource as any)._resourceType}`);
    for (const field of Object.keys(resource)) {
      if (field !== '_resourceType' && !allowed.includes(field)) throw new Error(`Unexpected runtime field ${resource._resourceType}.${field}`);
    }
    const data: Record<string, any> = { _resourceType: resource._resourceType };
    for (const field of allowed) if ((resource as any)[field] !== undefined) data[field] = (resource as any)[field];
    if (resource._resourceType === 'background') { data.name = resource.graphicsName; delete data.graphicsName; }
    if (resource._resourceType === 'sprite') {
      data.__spriteCanvas = { graphicsName: resource.graphicsName,
        frameWidth: resource.playerFrameWidth, frameHeight: resource.playerFrameHeight,
        canvasWidth: resource.playerCanvasWidth, canvasHeight: resource.playerCanvasHeight,
        partsColumns: resource.compositeColumns, partsRows: resource.compositeRows,
        idleFrame: resource.playerIdleFrame, animations: resource.animations };
      delete data.graphicsName;
      delete data.animations;
    }
    return { ...this.processResourceObject(data as JsonResourceDefault), runtimeResource: resource };
  }

  private emitRemainingEventArgs(name: string, command: string, args: any): string {
    if (command === 'EVENT_CALL_SCRIPT') {
      if (typeof args.scriptId !== 'string' || !args.scriptId) throw new Error('EVENT_CALL_SCRIPT requires scriptId');
      const argumentsList = args.arguments ?? [];
      if (!Array.isArray(argumentsList) || argumentsList.length > SCRIPT_PARAMETER_LIMIT) throw new Error('Call Script accepts at most 20 parameters');
      let code = '';
      const rows = argumentsList.map((argument: any, index: number) => {
        const value = argument.value;
        const prefix = `${name}_INPUT_${index}`;
        const text = value?.type === 'string';
        let instructions = text ? [] : numericInstructions(normalizeNumericValue(value));
        const reference = value?.kind === 'variable' ? `{ NumericOperation::op_variable, 0, ${JSON.stringify(value.variableId)}, 0 }`
          : instructions.length === 1 && ['property', 'engine'].includes(instructions[0].operation)
            ? `{ NumericOperation::op_${instructions[0].operation}, 0, ${instructions[0].reference ? JSON.stringify(instructions[0].reference) : 'nullptr'}, ${instructions[0].argument ?? 0} }` : '{}';
        if (!text) {
          code += `static const NumericInstruction ${prefix}_CODE[] = {\n` + instructions.map(instruction =>
            `    { NumericOperation::op_${instruction.operation}, ${instruction.value ?? 0}, ${instruction.reference ? JSON.stringify(instruction.reference) : 'nullptr'}, ${instruction.argument ?? 0} },\n`).join('') + `};\nstatic const NumericProgram ${prefix} = { ${prefix}_CODE, ${instructions.length} };\n`;
        }
        return `    { ${JSON.stringify(argument.parameterId)}, ${text ? 'nullptr' : '&' + prefix}, ${text && value.kind === 'literal' ? JSON.stringify(value.value) : 'nullptr'}, ${text && value.kind === 'variable' ? JSON.stringify(value.variableId) : 'nullptr'}, ${reference}, ${reference !== '{}'} }`;
      });
      if (rows.length) code += `static const ScriptCallArgument ${name}_INPUTS[] = {\n${rows.join(',\n')}\n};\n`;
      return code + `static const CallScriptEventData ${name} = { ${JSON.stringify(args.scriptId)}, ${rows.length ? name + '_INPUTS' : 'nullptr'}, ${rows.length} };\n`;
    }
    const contract = EVENT_CATALOG_BY_CODE[command];
    if (contract && Object.keys(contract.payload).length === 0) return `static const void* ${name} = nullptr;\n`;
    throw new Error(`Missing explicit payload emitter for ${command}`);
  }

  private validateCatalogEvent(script: any): void {
    const schemaDefinition = EVENT_VALIDATION_SCHEMA[script?.command];
    if (!schemaDefinition) return;
    if (!hasEventCompiler(script.command)) {
      throw new Error(`Event ${script.command} has a schema but no compiler registry entry`);
    }
    if (script.version !== undefined && (!Number.isInteger(script.version) || script.version < 1 ||
        script.version > (EVENT_CATALOG_BY_CODE[script.command]?.version ?? 1))) {
      throw new Error(`Invalid ${script.command} ${script.id ?? '<unknown>'}: unsupported schema version ${script.version}`);
    }
    const args = script?.args && typeof script.args === 'object' ? script.args : {};
    if (['EVENT_ACTOR_SET_DIRECTION', 'EVENT_ACTOR_SET_ROTATION', 'EVENT_ACTOR_SET_SCALE', 'EVENT_ACTOR_SET_TINT', 'EVENT_ACTOR_SET_SATURATION', 'EVENT_ACTOR_SET_BRIGHTNESS', 'EVENT_ACTOR_SET_OPACITY'].includes(script.command) &&
        (typeof args.actorId !== 'string' || !args.actorId.trim())) throw new Error(`Invalid ${script.command} ${script.id}: actorId must select an actor`);
    if (['EVENT_SPAWN_ACTOR', 'EVENT_ACTOR_SPAWN', 'EVENT_REMOVE_ACTOR', 'EVENT_ACTOR_DESPAWN'].includes(script.command)) {
      const field = args.source === 'prefab' ? 'prefabId' : 'actorId';
      if (typeof args[field] !== 'string' || !args[field].trim()) throw new Error(`Invalid ${script.command} ${script.id}: ${field} is required`);
    }
    if (PHYSICS_SETTING_EVENTS[script.command]?.playerOnly && args.actorId != null && args.actorId !== '__PLAYER__') throw new Error(`Invalid ${script.command}: this setting only applies to the player`);
    if (PHYSICS_EVENT_CODES.includes(script.command) &&
        args.actorId !== undefined && (typeof args.actorId !== 'string' || !args.actorId.trim())) {
      throw new Error(`Invalid ${script.command} ${script.id}: actorId must select an actor`);
    }
    if(script.command === 'EVENT_ACTOR_SET_STATE' && ['actorId', 'stateId'].some(field => typeof args[field] !== 'string' || !args[field].trim())) {
      throw new Error(`Invalid ${script.command} ${script.id}: actorId and stateId must select an actor and state`);
    }
    if(script.command === 'EVENT_ACTOR_SET_ANIMATION') {
      const action = args.action ?? 'speed';
      if(typeof args.actorId !== 'string' || !args.actorId.trim()) throw new Error(`Invalid ${script.command} ${script.id}: actorId must select an actor`);
      if(['loop', 'once', 'frame'].includes(action) && ['stateId', 'animationId'].some(field => typeof args[field] !== 'string' || !args[field].trim())) {
        throw new Error(`Invalid ${script.command} ${script.id}: select a state and animation for ${action}`);
      }
      if(action === 'frame' && !Number.isInteger(args.frame)) throw new Error(`Invalid ${script.command} ${script.id}: frame must be an integer`);
    }
    if (['EVENT_UI_DESTROY', 'EVENT_UI_HIDE', 'EVENT_UI_SHOW'].includes(script.command) &&
        (typeof args.uiId !== 'string' || !args.uiId.trim())) {
      throw new Error(`Invalid ${script.command} ${script.id}: uiId must select a UI`);
    }
    if (['EVENT_VARIABLES_SAVE', 'EVENT_VARIABLES_LOAD'].includes(script.command)) {
      const ids = args.variableIds;
      if (args.allVariables !== true && (!Array.isArray(ids) || !ids.length || ids.some((id: unknown) => typeof id !== 'string' || !id || isScriptParameter(id) || isLocalVariable(id)) || new Set(ids).size !== ids.length))
        throw new Error(`Invalid ${script.command}: select one or more distinct global variables`);
    }
    for (const [field, schema] of Object.entries(schemaDefinition)) {
      const value = args[field];
      if (value === null && ['EVENT_ACTOR_SET_ROTATION', 'EVENT_ACTOR_SET_SCALE', 'EVENT_ACTOR_SET_TINT', ...PHYSICS_EVENT_CODES].includes(script.command)) {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} cannot be null`);
      }
      if (value === undefined || value === null) {
        if (schema.required) throw new Error(`Invalid ${script.command} ${script.id}: ${field} is required`);
        continue;
      }
      if (this.isNumericValue(value)) {
        if (!NUMERIC_EVENT_FIELDS[script.command]?.[field]) throw new Error(`Numeric values are not supported for ${script.command}.${field}`);
        validateNumericValue(value);
        if (value.kind !== 'number') continue;
      }
      if (schema.type === 'integer' && (!Number.isInteger(typeof value === 'object' ? value.value : value))) {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} must be an integer`);
      }
      if (schema.type === 'number' && (typeof (typeof value === 'object' ? value.value : value) !== 'number' || !Number.isFinite(typeof value === 'object' ? value.value : value))) {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} must be a finite number`);
      }
      if (schema.type === 'boolean' && typeof value !== 'boolean') {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} must be boolean`);
      }
      if (schema.type === 'string' && typeof value !== 'string') {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} must be string`);
      }
      if (schema.type === 'string' && typeof value === 'string' && Buffer.byteLength(field === 'text' && ['EVENT_DISPLAY_DIALOGUE', 'EVENT_DIALOGUE_SHOW', 'EVENT_UI_SET_TEXT'].includes(script.command) ? textTemplateLiterals(value) : value, 'utf8') > 255) {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} exceeds 255 UTF-8 bytes`);
      }
      const numeric = typeof value === 'object' ? value.value : value;
      if (schema.options && !schema.options.includes(String(numeric))) {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} must be one of ${schema.options.join(', ')}`);
      }
      if (typeof numeric === 'number' && schema.min !== undefined && numeric < schema.min) {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} is below ${schema.min}`);
      }
      if (typeof numeric === 'number' && schema.max !== undefined && numeric > schema.max) {
        throw new Error(`Invalid ${script.command} ${script.id}: ${field} is above ${schema.max}`);
      }
    }
  }

  private validateInputMapResource(resource: any, source: string): void {
    if (!resource || resource._resourceType !== 'settings' || resource.inputMap === undefined) return;
    if (!resource.inputMap || typeof resource.inputMap !== 'object' || Array.isArray(resource.inputMap)) {
      throw new Error(`Invalid inputMap in ${source}: expected an object of action names to button arrays`);
    }
    const allowedButtons = new Set(['A', 'B', 'L', 'R', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    const actions = Object.entries(resource.inputMap);
    if (actions.length > 32) throw new Error(`Invalid inputMap in ${source}: maximum 32 actions`);
    for (const [action, buttons] of actions) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(action)) throw new Error(`Invalid inputMap action '${action}' in ${source}`);
      if (!Array.isArray(buttons) || buttons.length < 1 || buttons.length > 8 || buttons.some(button => typeof button !== 'string' || !allowedButtons.has(button))) {
        throw new Error(`Invalid inputMap action '${action}' in ${source}: buttons must contain 1..8 supported buttons`);
      }
    }
  }

  private validateCombatConfigResource(resource: any, source: string): void {
    if (!resource || resource._resourceType !== 'settings' || resource.combatConfig === undefined) return;
    const config = resource.combatConfig;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Invalid combatConfig in ${source}: expected an object`);
    }
    const limits: Record<string, number> = {
      maxProjectiles: 128,
      maxEnemies: 64,
      maxPickups: 32,
      playerHitPoints: 255,
      defaultDamage: 255,
    };
    for (const [field, maximum] of Object.entries(limits)) {
      if (config[field] === undefined) continue;
      const value = Number(config[field]);
      if (!Number.isInteger(value) || value < 0 || value > maximum) {
        throw new Error(`Invalid combatConfig.${field} in ${source}: expected an integer between 0 and ${maximum}`);
      }
    }
    if (config.collisionRules !== undefined) {
      if (!Array.isArray(config.collisionRules) || config.collisionRules.length > 32) {
        throw new Error(`Invalid combatConfig.collisionRules in ${source}: expected at most 32 rules`);
      }
      for (const [index, rule] of config.collisionRules.entries()) {
        if (!rule || typeof rule.sourceGroup !== 'string' || typeof rule.targetGroup !== 'string' ||
            !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(rule.sourceGroup) ||
            !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(rule.targetGroup)) {
          throw new Error(`Invalid combatConfig.collisionRules[${index}] in ${source}: groups must be valid identifiers`);
        }
      }
    }
  }

  private validateShooterConfigResource(resource: any, source: string): void {
    if (!resource || resource._resourceType !== 'settings' || resource.shooterConfig === undefined) return;
    const config = resource.shooterConfig;
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      throw new Error(`Invalid shooterConfig in ${source}: expected an object`);
    }
    if (config.defaultWaveId !== undefined && (typeof config.defaultWaveId !== 'string' || config.defaultWaveId.length > 63)) {
      throw new Error(`Invalid shooterConfig.defaultWaveId in ${source}: expected a string of at most 63 characters`);
    }
    if (config.projectileSpriteId !== undefined && (typeof config.projectileSpriteId !== 'string' || config.projectileSpriteId.length > 63)) {
      throw new Error(`Invalid shooterConfig.projectileSpriteId in ${source}: expected a string of at most 63 characters`);
    }
    const limits: Record<string, number> = { playerHitPoints: 255, defaultDamage: 255, bossHitPoints: 65535 };
    for (const [field, maximum] of Object.entries(limits)) {
      if (config[field] === undefined) continue;
      const value = Number(config[field]);
      if (!Number.isInteger(value) || value < 0 || value > maximum) {
        throw new Error(`Invalid shooterConfig.${field} in ${source}: expected an integer between 0 and ${maximum}`);
      }
    }
  }

  private generateScriptDefinitionsHeader(baseName: string, resource: any): string {
    const scripts = Array.isArray(resource.scripts) ? resource.scripts : [];
    const symbol = baseName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    let header = '';
    const definitions: Array<{ id: string; symbol: string; parameterCount: number }> = [];

    scripts.forEach((script: any, index: number) => {
      if (!script || typeof script.id !== 'string') return;
      const scriptSymbol = `${symbol}_SCRIPT_${index}`;
      // Reusable script editors persist events; script is a legacy/editor alias.
      // An empty canonical list also overrides any stale legacy events.
      const events = Array.isArray(script.events) ? script.events
        : Array.isArray(script.script) ? script.script : [];
      const parameters = script.parameters ?? [];
      validateScriptParameters(parameters);
      if (parameters.length) header += `static const ScriptParameterDefinition ${scriptSymbol}_PARAMETERS[] = {\n` + parameters.map((parameter: any) =>
        `    { { ${JSON.stringify(parameter.id)}, VariableType::${parameter.type}, 0, false, "" }, ${parameter.mode === 'reference'} },\n`).join('') + `};\n`;
      header += this.emitSceneScripts(scriptSymbol, events);
      definitions.push({ id: script.id, symbol: scriptSymbol, parameterCount: parameters.length });
    });

    if (definitions.length === 0) {
      return `${header}static const ScriptDefinition SCRIPT_DEFINITIONS[1] = {};\nstatic const int SCRIPT_DEFINITIONS_COUNT = 0;\n`;
    }

    header += `static const ScriptDefinition SCRIPT_DEFINITIONS[] = {\n`;
    header += definitions.map(definition =>
      `    { ${JSON.stringify(definition.id)}, ${definition.symbol}_SCRIPTS, ${definition.symbol}_SCRIPTS_COUNT, ${definition.parameterCount ? definition.symbol + '_PARAMETERS' : 'nullptr'}, ${definition.parameterCount} }`
    ).join(',\n');
    header += `\n};\nstatic const int SCRIPT_DEFINITIONS_COUNT = ${definitions.length};\n`;
    return header;
  }

  private createStructureFromJson(baseName: string, key: string, val: any, resourceType: string, resource?: any): string {
    let response = "";
    if (Array.isArray(val) && val.length === 0) {
      return resourceType === 'scene' && key === 'backgrounds'
        ? `static const SceneLayer ${baseName}_LAYERS[1] = {};\n` : '';
    }

    switch(resourceType) {
      // case "background":
      //   response += "" + "\n";
      //   break;
      case "scene":
        // Backgrounds layers
        if (key === 'backgrounds' && val && Array.isArray(val)) {
          let sceneBackgroundsLayerTemplate = `static const SceneLayer {{SCENE_NAME}}_LAYERS[] = {{{BACKGROUNDS_LAYERS_CONTENT}}};\n`;
          sceneBackgroundsLayerTemplate = sceneBackgroundsLayerTemplate.replace("{{SCENE_NAME}}", baseName);
          let mapOverrideDeclarations = '';

          val.forEach((bg: any, backgroundIndex: number) => {
            const paletteId = typeof bg.paletteId === 'string' && bg.paletteId ? JSON.stringify(bg.paletteId) : 'nullptr';
            const x = Number.isFinite(Number(bg.x)) ? Math.trunc(Number(bg.x)) : 0;
            const y = Number.isFinite(Number(bg.y)) ? Math.trunc(Number(bg.y)) : 0;
            const layerId = Number.isFinite(Number(bg.layerId)) ? Math.max(0, Math.min(3, Math.trunc(Number(bg.layerId)))) : 0;
            const zOrder = Number.isFinite(Number(bg.zOrder)) ? Math.max(-32767, Math.min(32767, Math.trunc(Number(bg.zOrder)))) : layerId;
            const overrides = Array.isArray(bg.tileMapCellOverrides) ? bg.tileMapCellOverrides : [];
            const overrideSymbol = `${baseName}_LAYER_${backgroundIndex}_MAP_OVERRIDES`;
            const seenOverrideCells = new Set<number>();
            const overrideValues = overrides.map((override: any, overrideIndex: number) => {
              const cellIndex = Number(override?.index);
              const tileIndex = Number(override?.tileIndex);
              const paletteIndex = Number(override?.paletteId ?? 0);
              if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 65535) {
                throw new Error(`Invalid tile map override ${bg.backgroundId ?? backgroundIndex}:${overrideIndex}: index must be between 0 and 65535`);
              }
              if (seenOverrideCells.has(cellIndex)) {
                throw new Error(`Invalid tile map override ${bg.backgroundId ?? backgroundIndex}:${overrideIndex}: duplicate cell index ${cellIndex}`);
              }
              seenOverrideCells.add(cellIndex);
              if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex > 1023) {
                throw new Error(`Invalid tile map override ${bg.backgroundId ?? backgroundIndex}:${overrideIndex}: tileIndex must be between 0 and 1023`);
              }
              if (!Number.isInteger(paletteIndex) || paletteIndex < 0 || paletteIndex > 15) {
                throw new Error(`Invalid tile map override ${bg.backgroundId ?? backgroundIndex}:${overrideIndex}: paletteId must be between 0 and 15`);
              }
              const cell = tileIndex | (override?.horizontalFlip === true ? 1 << 10 : 0) |
                (override?.verticalFlip === true ? 1 << 11 : 0) | (paletteIndex << 12);
              return `{ ${cellIndex}, ${cell} }`;
            });
            if (overrideValues.length) {
              mapOverrideDeclarations += `static const RegularBgMapCellOverride ${overrideSymbol}[] = { ${overrideValues.join(', ')} };\n`;
            }
            const overridePointer = overrideValues.length ? overrideSymbol : 'nullptr';
            sceneBackgroundsLayerTemplate = sceneBackgroundsLayerTemplate.replace("{{BACKGROUNDS_LAYERS_CONTENT}}", `\n    { ${layerId}, "${bg.backgroundId ?? ''}", ${paletteId}, ${x}, ${y}, ${zOrder}, ${overridePointer}, ${overrideValues.length}, ${bg.affine === true ? 'true' : 'false'}, ${bg.affineGraphicsName ? JSON.stringify(bg.affineGraphicsName) : 'nullptr'} },{{BACKGROUNDS_LAYERS_CONTENT}}`);
          });

          response += mapOverrideDeclarations + sceneBackgroundsLayerTemplate.replaceAll("{{BACKGROUNDS_LAYERS_CONTENT}}", '\n');
        }
        if (key === 'tileAnimations' && val && Array.isArray(val)) {
          if (val.length > 32) throw new Error(`Scene ${baseName} exceeds the runtime limit of 32 tile animations`);
          const animationBase = baseName.replace(/_TILEANIMATIONS$/, '');
          const targetTiles = new Map<string, number>();
          const declarations = val.map((animation: any, index: number) => {
            const layerId = Number.isFinite(Number(animation?.layerId)) ? Math.max(0, Math.min(3, Math.trunc(Number(animation.layerId)))) : 0;
            const target = Number(animation?.targetTileIndex);
            if (!Number.isInteger(target) || target < 0 || target > 1023) {
              throw new Error(`Invalid tile animation ${animation?.id ?? index}: targetTileIndex must be between 0 and 1023`);
            }
            const targetKey = `${layerId}:${animation?.targetTilesetId ?? ''}:${target}`;
            const previousTarget = targetTiles.get(targetKey);
            if (previousTarget !== undefined) {
              throw new Error(`Invalid tile animation ${animation?.id ?? index}: targetTileIndex ${target} is already animated by entry ${previousTarget}`);
            }
            targetTiles.set(targetKey, index);
            const frames = Array.isArray(animation?.frameTileIndices) ? animation.frameTileIndices : [];
            if (frames.length < 1 || frames.length > 32 || frames.some((frame: unknown) => !Number.isInteger(Number(frame)) || Number(frame) < 0 || Number(frame) > 1023)) {
              throw new Error(`Invalid tile animation ${animation?.id ?? index}: frameTileIndices must contain 1..32 tile indices between 0 and 1023`);
            }
            const duration = Number(animation?.durationFrames ?? 1);
            if (!Number.isInteger(duration) || duration < 1) throw new Error(`Invalid tile animation ${animation?.id ?? index}: durationFrames must be a positive integer`);
            const initial = Number(animation?.initialFrame ?? 0);
            if (!Number.isInteger(initial) || initial < 0 || initial >= frames.length) throw new Error(`Invalid tile animation ${animation?.id ?? index}: initialFrame is outside the frame list`);
            const symbol = `${animationBase}_TILE_ANIMATION_${index}`;
            return `static const int ${symbol}_FRAMES[] = { ${frames.map((frame: unknown) => Math.trunc(Number(frame))).join(', ')} };\n` +
              `static const TileAnimation ${symbol} = { ${layerId}, ${target}, ${symbol}_FRAMES, ${frames.length}, ${duration}, ${animation?.loop !== false ? 'true' : 'false'}, ${initial} };\n`;
          }).join('');
          response += `${declarations}static const TileAnimation ${animationBase}_TILE_ANIMATIONS[] = {\n` +
            val.map((_animation: any, index: number) => `    ${animationBase}_TILE_ANIMATION_${index},\n`).join('') +
            `};\nstatic const int ${animationBase}_TILE_ANIMATIONS_COUNT = ${val.length};\n`;
        }
        if (key === 'spawnerTimelines' && val && Array.isArray(val)) {
          if (val.length > 16) throw new Error(`Scene ${baseName} exceeds the runtime limit of 16 spawner timelines`);
          const sceneBase = baseName.replace(/_SPAWNERTIMELINES$/, '');
          let declarations = '';
          for (const [timelineIndex, timeline] of val.entries()) {
            const entries = Array.isArray(timeline?.entries) ? timeline.entries : [];
            if (entries.length > 64) throw new Error(`Spawner timeline ${timeline?.id ?? timelineIndex} exceeds the runtime limit of 64 entries`);
            const entrySymbol = `${sceneBase}_SPAWNER_${timelineIndex}_ENTRIES`;
            declarations += `static const SpawnerTimelineEntry ${entrySymbol}[] = {\n`;
            declarations += entries.map((entry: any, entryIndex: number) => {
              const frame = Number(entry?.frame);
              if (!Number.isInteger(frame) || frame < 0 || frame > 0x7fffffff) throw new Error(`Invalid spawner timeline entry ${timeline?.id ?? timelineIndex}:${entryIndex}: frame must be a non-negative integer`);
              const archetype = JSON.stringify(String(entry?.archetypeId ?? entry?.archetype_id ?? ''));
              const pattern = JSON.stringify(String(entry?.patternId ?? entry?.pattern_id ?? ''));
              const drop = JSON.stringify(String(entry?.dropId ?? entry?.drop_id ?? ''));
              if (drop.length > 65) throw new Error(`Invalid spawner timeline entry ${timeline?.id ?? timelineIndex}:${entryIndex}: dropId must be a string of at most 63 characters`);
              return `    { ${frame}, ${archetype}, ${Math.trunc(Number(entry?.x) || 0)}, ${Math.trunc(Number(entry?.y) || 0)}, ${pattern}, ${drop} },\n`;
            }).join('');
            declarations += `};\n`;
          }
          declarations += `static const SpawnerTimeline ${sceneBase}_SPAWNER_TIMELINES[] = {\n`;
          declarations += val.map((timeline: any, index: number) => {
            const entries = Array.isArray(timeline?.entries) ? timeline.entries : [];
            return `    { ${JSON.stringify(String(timeline?.id ?? index))}, ${sceneBase}_SPAWNER_${index}_ENTRIES, ${entries.length} },\n`;
          }).join('');
          declarations += `};\nstatic const int ${sceneBase}_SPAWNER_TIMELINES_COUNT = ${val.length};\n`;
          response += declarations;
        }
        // Scripts
        if (key === 'script' && val && Array.isArray(val)) {
          const sceneBaseName = baseName.replace(/_SCRIPT$/, '');
          response += this.emitSceneScripts(sceneBaseName, val);
        }

        // Scene triggers keep their own entry/leave programs and runtime
        // policy, so they are emitted as typed records instead of generic JSON.
        if (key === 'triggers' && val && Array.isArray(val)) {
          const triggerBase = baseName.replace(/_TRIGGERS$/, '');
          const activation = (value: unknown) => {
            const allowed = ['enter', 'exit', 'stay', 'interact', 'touch', 'input', 'timer'];
            return allowed.includes(String(value)) ? `TriggerActivation::${String(value)}` : 'TriggerActivation::enter';
          };
          let declarations = '';
          const records = val.map((trigger: any, index: number) => {
            const enter = Array.isArray(trigger.onEnterScript) ? trigger.onEnterScript : [];
            const leave = Array.isArray(trigger.onLeaveScript) ? trigger.onLeaveScript : [];
            const enterSymbol = `${triggerBase}_TRIGGER_${index}_ENTER`;
            const leaveSymbol = `${triggerBase}_TRIGGER_${index}_LEAVE`;
            const enterCode = enter.length ? this.emitSceneScripts(enterSymbol, enter) : '';
            const leaveCode = leave.length ? this.emitSceneScripts(leaveSymbol, leave) : '';
            declarations += enterCode + leaveCode;
            const enterPtr = enter.length ? `${enterSymbol}_SCRIPTS` : 'nullptr';
            const leavePtr = leave.length ? `${leaveSymbol}_SCRIPTS` : 'nullptr';
            const enterCount = enter.length ? `${enterSymbol}_SCRIPTS_COUNT` : '0';
            const leaveCount = leave.length ? `${leaveSymbol}_SCRIPTS_COUNT` : '0';
            return `    { ${Number(trigger.x) || 0}, ${Number(trigger.y) || 0}, ${Number(trigger.width) || 0}, ${Number(trigger.height) || 0}, ${activation(trigger.activation)}, ${trigger.enabled !== false ? 'true' : 'false'}, ${trigger.once === true ? 'true' : 'false'}, ${Math.max(0, Number(trigger.cooldownFrames) || 0)}, ${enterPtr}, ${enterCount}, ${leavePtr}, ${leaveCount}, ${JSON.stringify(String(trigger.id ?? index))} },\n`;
          }).join('');
          response += `${declarations}${records ? `static const ScriptTrigger ${triggerBase}_TRIGGERS[] = {\n${records}};\n` : ''}static const int ${triggerBase}_TRIGGERS_COUNT = ${val.length};\n`;
        }

        if (key === 'actors' && val && Array.isArray(val)) {
          const actorBase = baseName.replace(/_ACTORS$/, '');
          let declarations = '';
          const records = val.map((actor: any, index: number) => {
            const id = JSON.stringify(String(actor?.id ?? actor?.actorId ?? index));
            const spriteId = JSON.stringify(actorSpriteId(actor));
            const direction = ['left', 'right', 'up', 'down'].includes(actor?.direction) ? actor.direction : 'right';
            // The scene editor stores actors by their canvas anchor. Legacy
            // actors without an explicit anchor were stored by their box's
            // top-left corner, so normalize those to the anchor position.
            const actorWidth = Math.max(1, Number(actor?.width) || 16);
            const actorHeight = Math.max(1, Number(actor?.height) || 16);
            const actorX = Number(actor?.x) || 0;
            const actorY = Number(actor?.y) || 0;
            const runtimeX = actor?.anchor === 'center' ? actorX : actorX + actorWidth / 2;
            const runtimeY = actor?.anchor === 'center' ? actorY : actorY + actorHeight / 2;
            const interact = Array.isArray(actor?.onInteractScript) ? actor.onInteractScript : [];
            const onInit = Array.isArray(actor?.onInitScript) ? actor.onInitScript : [];
            const onUpdate = Array.isArray(actor?.onUpdateScript) ? actor.onUpdateScript : [];
            const updateSymbol = `${actorBase}_ACTOR_${index}_UPDATE`;
            const initSymbol = `${actorBase}_ACTOR_${index}_INIT`;
            const interactSymbol = `${actorBase}_ACTOR_${index}_INTERACT`;
            declarations += onInit.length ? this.emitSceneScripts(initSymbol, onInit) : '';
            declarations += interact.length ? this.emitSceneScripts(interactSymbol, interact) : '';
            declarations += onUpdate.length ? this.emitSceneScripts(updateSymbol, onUpdate) : '';
            const updatePtr = onUpdate.length ? `${updateSymbol}_SCRIPTS` : 'nullptr';
            const updateCount = onUpdate.length ? `${updateSymbol}_SCRIPTS_COUNT` : '0';
            const initPtr = onInit.length ? `${initSymbol}_SCRIPTS` : 'nullptr';
            const initCount = onInit.length ? `${initSymbol}_SCRIPTS_COUNT` : '0';
            const interactPtr = interact.length ? `${interactSymbol}_SCRIPTS` : 'nullptr';
            const interactCount = interact.length ? `${interactSymbol}_SCRIPTS_COUNT` : '0';
            const animationSpeed = Math.max(0, Math.min(7, Math.trunc(Number(actor?.animationSpeed ?? 6))));
            return `    { ${id}, ${spriteId}, ${Math.round(runtimeX)}, ${Math.round(runtimeY)}, ${JSON.stringify(direction)}, ${animationSpeed}, ${initPtr}, ${initCount}, ${interactPtr}, ${interactCount}, ${updatePtr}, ${updateCount}, ${actor.spawnPrefabId ? JSON.stringify(actor.spawnPrefabId) : 'nullptr'}, ${actor.keepRunningWhileOffscreen === true ? 'true' : 'false'} },\n`;
          }).join('');
          response += `${declarations}static const SceneActor ${actorBase}_ACTORS[] = {\n${records}};\nstatic const int ${actorBase}_ACTORS_COUNT = ${val.length};\n`;
        }

        if (key === 'collisions' && val && Array.isArray(val)) {
          const collisionBase = baseName.replace(/_COLLISIONS$/, '');
          const records = val.map((collision: any) => {
            const side = ['solid', 'top', 'down', 'left', 'right', 'ladder'].includes(collision?.collisionSide)
              ? collision.collisionSide : 'solid';
            // SceneCollision is integer pixel geometry in the Butano runtime.
            // Round editor values so generated aggregate initializers cannot
            // fail with C++ narrowing errors when a fractional tile size leaks in.
            const pixel = (value: unknown, minimum = 0) => Math.max(minimum, Math.round(Number(value) || 0));
            return `    { ${pixel(collision?.x)}, ${pixel(collision?.y)}, ${pixel(collision?.width)}, ${pixel(collision?.height)}, ${JSON.stringify(side)} },\n`;
          }).join('');
          response += `static const SceneCollision ${collisionBase}_COLLISIONS[] = {\n${records}};\nstatic const int ${collisionBase}_COLLISIONS_COUNT = ${val.length};\n`;
        }

        break;
      case "settings":
        if (key === 'inputMapsBySceneType' && val && Object.keys(val).length) {
          const maps = Object.entries(val).map(([type, map], index) => {
            const symbol = `${baseName}_SCENE_${index}`;
            const bindings = Object.entries(resolveSceneInputMap(type, { [type]: map } as any, resource.inputMap));
            const declarations = bindings.map(([action, buttons], actionIndex) => `static const char* const ${symbol}_BUTTONS_${actionIndex}[] = { ${buttons.map(button => JSON.stringify(button)).join(', ')} };\n`).join('');
            const records = bindings.map(([action], actionIndex) => `    { ${JSON.stringify(action)}, ${symbol}_BUTTONS_${actionIndex}, sizeof(${symbol}_BUTTONS_${actionIndex}) / sizeof(${symbol}_BUTTONS_${actionIndex}[0]) },`).join('\n');
            response += `${declarations}static const InputBinding ${symbol}_BINDINGS[] = {\n${records}\n};\n`;
            return `    { ${JSON.stringify(type)}, ${symbol}_BINDINGS, ${bindings.length} },`;
          });
          response += `static const SceneInputMap ${baseName}_MAPS[] = {\n${maps.join('\n')}\n};\n`;
        }
        if (key === 'inputMap' && val && typeof val === 'object' && !Array.isArray(val)) {
          const entries = Object.entries(val as Record<string, unknown>);
          const declarations = entries.map(([action, buttons]) => {
            const actionSymbol = action.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
            const buttonSymbol = `${baseName}_${actionSymbol}_BUTTONS`;
            const values = (buttons as string[]).map(button => JSON.stringify(button)).join(', ');
            return `static const char* const ${buttonSymbol}[] = { ${values} };\n`;
          }).join('');
          const records = entries.map(([action]) => {
            const actionSymbol = action.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
            const buttonSymbol = `${baseName}_${actionSymbol}_BUTTONS`;
            return `    { ${JSON.stringify(action)}, ${buttonSymbol}, sizeof(${buttonSymbol}) / sizeof(${buttonSymbol}[0]) },`;
          }).join('\n');
          response += `${declarations}static const InputBinding ${baseName}_BINDINGS[] = {\n${records}\n};\nstatic const int ${baseName}_BINDINGS_COUNT = ${entries.length};\n`;
        }
        if (key === 'combatConfig' && val && typeof val === 'object' && !Array.isArray(val)) {
          const integer = (field: string, fallback: number) => {
            const value = Number(val[field]);
            return Number.isInteger(value) ? value : fallback;
          };
          const rules = Array.isArray(val.collisionRules) ? val.collisionRules : [];
          const rulesSymbol = `${baseName}_COLLISION_RULES`;
          if (rules.length > 0) {
            response += `static const CombatCollisionRule ${rulesSymbol}[] = {\n${rules.map((rule: any) => `    { ${JSON.stringify(rule.sourceGroup)}, ${JSON.stringify(rule.targetGroup)} },\n`).join('')}};\n`;
          }
          response += `static const CombatConfig ${baseName}_COMBAT_CONFIG = { ${integer('maxProjectiles', 64)}, ${integer('maxEnemies', 32)}, ${integer('maxPickups', 16)}, ${integer('playerHitPoints', 3)}, ${integer('defaultDamage', 1)}, ${rules.length > 0 ? rulesSymbol : 'nullptr'}, ${rules.length} };\n`;
        }
        if (key === 'shooterConfig' && val && typeof val === 'object' && !Array.isArray(val)) {
          const integer = (field: string, fallback: number) => {
            const value = Number(val[field]);
            return Number.isInteger(value) ? value : fallback;
          };
          response += `static const ShooterConfig ${baseName}_SHOOTER_CONFIG = { ${JSON.stringify(String(val.defaultWaveId ?? ''))}, ${JSON.stringify(String(val.projectileSpriteId ?? ''))}, ${integer('defaultDamage', 1)}, ${integer('bossHitPoints', 32)} };\n`;
        }
        break;
      default:
        break;
    }

    return response;
  }

  /**
   * Generate a header file from parsed JSON or raw JSON string
   */
  private generateHeaderFromJson(baseName: string, jsonObj: any): string {
    const guardName = `${baseName.toUpperCase()}_RES_H`;
    let header = `#ifndef ${guardName}\n#define ${guardName}\n\n`;
    header += `#include "resource_types.h"\n\n`;
    header += `/* Auto-generated resource header for: ${baseName} */\n\n`;
    // Resource headers are included by the registry translation unit. Large
    // pointer-bearing tables otherwise land in IWRAM and can overflow the
    // GBA's 32 KiB region before the linker can place the registry itself.
    // The editable template defines this section macro; the generated data
    // remains read-only while its relocations live in EWRAM.
    const finalizeHeader = (content: string) => content
      .replace(/\bstatic const ScriptCommandData\s+([A-Za-z0-9_]+)/g,
        (_match, symbol: string) => `__attribute__((section(".ewram_script_data_${symbol}"))) static const ScriptCommandData ${symbol}`)
      .replace(/\bstatic const ScriptDefinition\s+([A-Za-z0-9_]+)/g,
        (_match, symbol: string) => `__attribute__((section(".ewram_script_data_${symbol}"))) static const ScriptDefinition ${symbol}`);

    if (jsonObj?.eventGraphs && typeof jsonObj.eventGraphs === 'object') {
      for (const [key, graph] of Object.entries(jsonObj.eventGraphs)) {
        if (graph && typeof graph === 'object') {
          try {
            compileScriptGraphWithSourceMap(graph as any);
          } catch (error) {
            throw new Error(`Invalid event graph '${key}' in ${baseName}: ${(error as Error).message}`);
          }
        }
      }
    }

    if (jsonObj?._resourceType === 'variables') {
      header += this.generateVariablesHeader(jsonObj);
      header += `\n#endif // ${guardName}\n`;
      return finalizeHeader(header);
    }

    if (jsonObj?._resourceType === 'scripts') {
      header += this.generateScriptDefinitionsHeader(baseName, jsonObj);
      header += `\n#endif // ${guardName}\n`;
      return finalizeHeader(header);
    }

    if (jsonObj?._resourceType === 'settings' || jsonObj?._resourceType === 'sprite') {
      header += this.generateSpriteAnimationsHeader(baseName, jsonObj);
    }

    if (jsonObj && typeof jsonObj === 'object') {
      // Emit primitive keys as defines or constants
      for (const key of RESOURCE_HEADER_FIELDS[jsonObj._resourceType] ?? []) {
        const val = jsonObj[key];
        const cleanKey = `${baseName}_${key}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        if (key === '__spriteCanvas' || ((jsonObj._resourceType === 'settings' || jsonObj._resourceType === 'sprite') && (key === 'playerAnimationStates' || key === 'playerAnimations'))) {
          continue;
        }
        if (typeof val === 'string') {
          const escaped = val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
          header += `static const char ${cleanKey}[] = \"${escaped}\";\n`;
        } else if (typeof val === 'number') {
          // Project start positions are in 16px tiles, including fractions.
          // Convert before emitting an int so sub-tile positions survive C++ conversion.
          const emittedValue = jsonObj._resourceType === 'settings' && (key === 'startX' || key === 'startY')
            ? Math.round(val * 16) : val;
          const integerType = Number.isInteger(emittedValue) && (emittedValue < -2147483648 || emittedValue > 2147483647) ? 'long long' : 'int';
          header += `static const ${integerType} ${cleanKey} = ${emittedValue};\n`;
        } else if (typeof val === 'boolean') {
          header += `static const int ${cleanKey} = ${val ? 1 : 0};\n`;
        } else if (Array.isArray(val) && val.length > 0 && val.every(v => typeof v === 'number')) {
          if (val.length > 0) {
            // Array 1D de nÃƒÆ’Ã‚Âºmeros -> gera como int[]
            const values = val.join(', ');
            header += `static const int ${cleanKey}[] = { ${values} };\n`;
            header += `static const int ${cleanKey}_SIZE = sizeof(${cleanKey}) / sizeof(int);\n`;
          } 
          // else {
          //   // lista vazia -> define como NULL
          //   header += `static const int* ${cleanKey} = nullptr;\n`;
          //   header += `static const int ${cleanKey}_SIZE = 0;\n`;
          // }
        } else {
          // Para objetos complexos ou arrays de objetos
          header += this.createStructureFromJson(cleanKey, key, val, jsonObj._resourceType, jsonObj);
        }
      }
    } else throw new Error(`Invalid runtime resource ${baseName}`);

    header += `\n#endif // ${guardName}\n`;
    return finalizeHeader(header);
  }

  private generateSpriteAnimationsHeader(baseName: string, resource: any): string {
    const states = Array.isArray(resource.playerAnimationStates) ? resource.playerAnimationStates : [];
    const animations: Array<{ stateId: string; stateType: string; id: string; type: string; frames: number[]; flipRightToCreateLeftFrames: boolean }> = [];
    const frameWidth = Number(resource.playerFrameWidth) || 16;
    const frameHeight = Number(resource.playerFrameHeight) || 16;
    const sheetColumns = Math.max(1, Math.floor((Number(resource.imageWidth) || frameWidth) / frameWidth));

    if (resource.__spriteCanvas) animations.push(...resource.__spriteCanvas.animations.map((animation: any) => ({ ...animation })));
    for (const state of resource.__spriteCanvas ? [] : states) {
      for (const animation of Array.isArray(state.animations) ? state.animations : []) {
        const indexedFrames = Array.isArray(animation.frames)
          ? animation.frames.filter((frame: unknown): frame is number =>
            typeof frame === 'number' && Number.isInteger(frame) && frame >= 0)
          : [];
        const canvasFrames = Array.isArray(animation.canvasFrames) ? animation.canvasFrames : [];
        const frames = indexedFrames.length > 0
          ? indexedFrames
          : canvasFrames.flatMap((frame: any) => {
            const piece = Array.isArray(frame?.pieces) ? frame.pieces[0] : null;
            if (!piece || !Number.isFinite(piece.sourceX) || !Number.isFinite(piece.sourceY)) return [];
            return [Math.floor(piece.sourceY / frameHeight) * sheetColumns + Math.floor(piece.sourceX / frameWidth)];
          });
        if (frames.length > 0) {
          animations.push({ stateId: String(state.id ?? ''), stateType: String(state.type ?? ''),
            id: String(animation.id ?? ''), type: String(animation.type ?? ''), frames,
            flipRightToCreateLeftFrames: state.flipRightToCreateLeftFacingFrames !== false });
        }
      }
    }

    if (animations.length === 0) return '';

    const symbol = baseName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const escape = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    let header = '';
    animations.forEach((animation, index) => {
      header += `static const int ${symbol}_ANIMATION_${index}_FRAMES[] = { ${animation.frames.join(', ')} };\n`;
    });
    header += `static const SpriteAnimationDefinition ${symbol}_ANIMATIONS[] = {\n`;
    header += animations.map((animation, index) =>
      `    { "${escape(animation.stateId)}", "${escape(animation.id)}", "${escape(animation.type)}", ${symbol}_ANIMATION_${index}_FRAMES, ${animation.frames.length}, ${animation.flipRightToCreateLeftFrames} }`
    ).join(',\n');
    header += `\n};\nstatic const int ${symbol}_ANIMATIONS_COUNT = ${animations.length};\n\n`;
    return header;
  }

  private generateVariablesHeader(resource: any): string {
    let header = '';

    for (const variable of resource.variables) {
      const symbol = variable.symbol;
      if (variable.type === 'number') {
        header += `static const int ${symbol}_INITIAL = ${variable.initialValue};\n`;
      } else if (variable.type === 'boolean') {
        header += `static const bool ${symbol}_INITIAL = ${variable.initialValue ? 'true' : 'false'};\n`;
      } else {
        const escaped = variable.initialValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        header += `static const char ${symbol}_INITIAL[] = "${escaped}";\n`;
      }
    }

    header += '\nstatic const VariableDefinition VARIABLES_DEFINITIONS[] = {\n';
    for (const variable of resource.variables) {
      const symbol = variable.symbol;
      const value = variable.type === 'number'
        ? `{ "${variable.id}", VariableType::number, ${symbol}_INITIAL, false, nullptr, ${JSON.stringify(symbol)} }`
        : variable.type === 'boolean'
          ? `{ "${variable.id}", VariableType::boolean, 0, ${symbol}_INITIAL, nullptr, ${JSON.stringify(symbol)} }`
          : `{ "${variable.id}", VariableType::string, 0, false, ${symbol}_INITIAL, ${JSON.stringify(symbol)} }`;
      header += `    ${value},\n`;
    }
    header += '};\n';
    header += `static const int VARIABLES_DEFINITIONS_COUNT = ${resource.variables.length};\n`;
    return header;
  }

  /**
   * Generate a header file for resource declarations
   */
  public async generateResourceHeader(resourceFiles: RuntimeResourceFile[]): Promise<string> {
    const guardName = 'GENERATED_RESOURCES_H';
    let header = `#ifndef ${guardName}\n#define ${guardName}\n\n`;
    header += `/* Master include for generated resource headers */\n\n`;

    for (const file of resourceFiles) {
      const includeName = file.resourceName; // e.g. base_res.h
      header += `#include \"${includeName}\"\n`;
    }

    if (!resourceFiles.some(file => file.jsonContent?._resourceType === 'scripts')) {
      header += `\nstatic const ScriptDefinition SCRIPT_DEFINITIONS[1] = {};\n`;
      header += `static const int SCRIPT_DEFINITIONS_COUNT = 0;\n`;
    }

    header += `\n#endif // ${guardName}\n`;
    return header;
  }

  /**
   * Generate a header file for graphics build/bn_regular_bg_items_*
   */
  public async generateGraphicsHeader(buildDir: string): Promise<{headerFileContent: string, headersIncluded: string[]}> {
    let graphicHeaderGeneratedByButano = [];

    const guardName = 'GENERATED_GRAPHICS_H';
    let headerFileContent = `#ifndef ${guardName}\n#define ${guardName}\n\n`;
    headerFileContent += `/* Master include for generated graphics headers */\n\n`;

    const entries = fs.readdirSync(buildDir, { withFileTypes: true });

    const prefixes = [
      "bn_affine_bg_items_",
      "bn_regular_bg_items_",
      "bn_sprite_items_",
      "bn_palette_bitmap_items_",
      "bn_direct_bitmap_items_"
    ];
    
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".h")) continue;

      if (prefixes.some(prefix => entry.name.startsWith(prefix))) {
        headerFileContent += `#include "${entry.name}"\n`;
        graphicHeaderGeneratedByButano.push(entry.name);
      }
    }

    headerFileContent += `\n#endif // ${guardName}\n`;
    return {
      headerFileContent,
      headersIncluded: graphicHeaderGeneratedByButano
    };
  }

  /**
   * Write resource header file
   */
  public async writeResourceHeader(resourceFiles: RuntimeResourceFile[]): Promise<void> {
    this.requireExportedRuntimeFiles(resourceFiles);
    const headerContent = await this.generateResourceHeader(resourceFiles);
    const headerPath = path.join(this.includeDir, 'resources.h');
    const current = new Set(resourceFiles.map(file => file.resourceName));
    if (fs.existsSync(headerPath)) {
      const previous = fs.readFileSync(headerPath, 'utf8');
      if (previous.includes('Master include for generated resource headers')) {
        for (const match of previous.matchAll(/#include\s+"([^"\r\n]+_res\.h)"/g)) {
          const filename = match[1];
          if (path.basename(filename) !== filename || current.has(filename)) continue;
          // Ownership comes from the previous generated registry, never a glob.
          fs.rmSync(path.join(this.includeDir, filename), { force: true });
        }
      }
    }
    fs.writeFileSync(headerPath, headerContent, 'utf8');
    console.log('..: Generated resources header:', headerPath);
  }

   /**
   * Write graphics header file
   */
  public async writeGraphicsHeader(buildDir: string): Promise<string[]> {
    const {headerFileContent, headersIncluded} = await this.generateGraphicsHeader(buildDir);
    const headerPath = path.join(this.includeDir, 'graphics_items.h');
    fs.writeFileSync(headerPath, headerFileContent, 'utf8');
    console.log('..: Generated graphics items header:', headerPath);
    return headersIncluded;
  }

  private resourcePrograms(resourceFiles: ResourceFile[]): any[][] {
    const programs: any[][] = [];
    const add = (events: unknown) => { if (Array.isArray(events)) programs.push(events); };
    for (const file of resourceFiles) {
      const resource = file.jsonContent as any;
      add(resource?.script);
      for (const actor of resource?.actors ?? []) { add(actor.onInitScript); add(actor.onInteractScript); add(actor.onUpdateScript); }
      for (const trigger of resource?.triggers ?? []) { add(trigger.onEnterScript); add(trigger.onLeaveScript); }
      for (const definition of resource?.scripts ?? []) add(Array.isArray(definition.events) ? definition.events : definition.script);
    }
    return programs;
  }

  /** Validate script music IDs against the concrete Butano music registry. */
  public validateMusicReferences(resourceFiles: ResourceFile[], buildDir: string): void {
    const ids = new Set<string>();
    const collect = (events: any[]) => {
      for (const event of Array.isArray(events) ? events : []) {
        if (['EVENT_PLAY_MUSIC', 'EVENT_MUSIC_PLAY_JINGLE', 'EVENT_SHOOTER_LOAD_STAGE'].includes(event?.command) && typeof event.args?.musicId === 'string' && event.args.musicId) {
          ids.add(event.args.musicId);
        }
        collect(event?.children?.then);
        collect(event?.children?.else);
      }
    };
    for (const events of this.resourcePrograms(resourceFiles)) collect(events);
    if (!ids.size) return;
    const headerPath = path.join(buildDir, 'bn_music_items.h');
    if (!fs.existsSync(headerPath)) {
      throw new Error(`Music assets missing: music events reference ${[...ids].join(', ')}`);
    }
    const header = fs.readFileSync(headerPath, 'utf8');
    const symbol = musicAssetSymbol;
    const missing = [...ids].filter(id => !new RegExp(`\\b${symbol(id)}\\s*\\(`).test(header));
    if (missing.length) {
      throw new Error(`Music assets not found for music events: ${missing.join(', ')}`);
    }
  }

  /**
   * Validate tile-animation indices against the actual regular BG item emitted
   * by Butano. The logical tile count differs for 8 bpp assets because each
   * graphic tile occupies two `bn::tile` objects; reading the generated public
   * header keeps this diagnostic aligned with the converter without changing
   * the third-party library.
   */
  public validateTileAnimationReferences(resourceFiles: ResourceFile[], buildDir: string): void {
    const symbol = (id: string) => {
      const normalized = id.normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().replace(/_+/g, '_');
      return /^[a-z]/.test(normalized) ? normalized : `a_${normalized}`;
    };
    // Scene layers store the stable resource UUID, while Butano names the
    // generated item after the source asset stem (for example `castle`).
    // Resolve both forms here so validation exercises real project assets and
    // remains compatible with legacy fixtures that only expose an ID.
    const backgroundSymbols = new Map<string, string[]>();
    for (const resource of resourceFiles) {
      const data = resource.jsonContent as any;
      if (data?._resourceType !== 'background' || typeof data.id !== 'string') continue;
      const candidates = [
        typeof data.filename === 'string' ? path.basename(data.filename, path.extname(data.filename)) : '',
        typeof data.name === 'string' ? data.name : '',
        data.id,
      ].filter(Boolean).map(symbol);
      backgroundSymbols.set(data.id, [...new Set(candidates)]);
    }
    const headerCache = new Map<string, { logicalTiles: number; bpp: string; tileCompression: string; mapCompression: string }>();
    const readHeader = (backgroundId: string, affineName?: string) => {
      const cacheKey = `${backgroundId}:${affineName ?? ''}`;
      const cached = headerCache.get(cacheKey);
      if (cached) return cached;
      if (affineName) {
        const header = fs.readFileSync(path.join(buildDir, `bn_affine_bg_items_${affineName}.h`), 'utf8');
        const match = header.match(/affine_bg_tiles_item\(span<const tile>\([^,]+,\s*(\d+)\)/);
        if (!match) throw new Error(`Tile animation affine metadata unavailable: ${affineName}`);
        const metadata = { logicalTiles: Number(match[1]) / 2, bpp: 'BPP_8', tileCompression: 'NONE', mapCompression: 'NONE' };
        headerCache.set(cacheKey, metadata);
        return metadata;
      }
      const itemSymbols = backgroundSymbols.get(backgroundId) ?? [symbol(backgroundId)];
      const itemSymbol = itemSymbols.find(candidate => fs.existsSync(path.join(buildDir, `bn_regular_bg_items_${candidate}.h`))) ?? itemSymbols[0];
      const headerPath = path.join(buildDir, `bn_regular_bg_items_${itemSymbol}.h`);
      if (!fs.existsSync(headerPath)) {
        throw new Error(`Tile animation background asset missing: ${backgroundId} (expected ${path.basename(headerPath)})`);
      }
      const header = fs.readFileSync(headerPath, 'utf8');
      const tilesMatch = header.match(new RegExp(`regular_bg_tiles_item\\(span<const tile>\\(${itemSymbol}_bn_gfxTiles,\\s*(\\d+)\\),\\s*bpp_mode::(BPP_[48]),\\s*compression_type::([A-Z_]+)`));
      if (!tilesMatch) throw new Error(`Tile animation background metadata unavailable: ${backgroundId}`);
      const mapMatch = header.match(/regular_bg_map_item\([\s\S]*?compression_type::([A-Z_]+)/);
      const bpp = tilesMatch[2];
      const metadata = {
        logicalTiles: Math.floor(Number(tilesMatch[1]) / (bpp === 'BPP_8' ? 2 : 1)),
        bpp,
        tileCompression: tilesMatch[3],
        mapCompression: mapMatch?.[1] ?? 'UNKNOWN',
      };
      headerCache.set(cacheKey, metadata);
      return metadata;
    };

    for (const file of resourceFiles) {
      const scene = file.jsonContent as any;
      if (scene?._resourceType !== 'scene' || !Array.isArray(scene.tileAnimations) || scene.tileAnimations.length === 0) continue;
      for (const [index, animation] of scene.tileAnimations.entries()) {
        const layerId = Number.isInteger(Number(animation?.layerId)) ? Math.max(0, Math.min(3, Math.trunc(Number(animation.layerId)))) : 0;
        const layer = (Array.isArray(scene.backgrounds) ? scene.backgrounds : []).find((candidate: any) => Number(candidate?.layerId) === layerId);
        const backgroundId = typeof layer?.backgroundId === 'string' ? layer.backgroundId : '';
        if (!backgroundId) throw new Error(`Invalid tile animation ${scene.id ?? '<scene>'}:${index}: layer ${layerId} has no regular background`);
        const metadata = readHeader(backgroundId, layer.affineGraphicsName);
        const indices = [animation?.targetTileIndex, ...(Array.isArray(animation?.frameTileIndices) ? animation.frameTileIndices : [])];
        const invalid = indices.find(value => !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) >= metadata.logicalTiles);
        if (invalid !== undefined) {
          throw new Error(`Invalid tile animation ${scene.id ?? '<scene>'}:${index}: tile index ${invalid} exceeds ${metadata.logicalTiles - 1} logical tiles in ${backgroundId} (${metadata.bpp}, tiles ${metadata.tileCompression}, map ${metadata.mapCompression})`);
        }
      }
    }
  }

  /**
   * Generate resource registry C++ class
   */
  private validateNumericReferences(resourceFiles: ResourceFile[]): void {
    const variableTypes = new Map<string, string>(LOCAL_VARIABLES.map(variable => [variable.id, variable.type]));
    const actorIds = new Set<string>(['__PLAYER__']);
    const triggerIds = new Set<string>();
    for (const file of resourceFiles) {
      const resource: any = file.jsonContent;
      if (resource?._resourceType === 'variables' && Array.isArray(resource.variables))
        for (const variable of resource.variables) variableTypes.set(String(variable.id), String(variable.type));
      if (resource?._resourceType === 'scripts') for (const script of resource.scripts ?? []) for (const parameter of script.parameters ?? []) variableTypes.set(parameter.id, parameter.type);
      if (resource?._resourceType === 'scene') for (const trigger of resource.triggers ?? []) triggerIds.add(String(trigger.id));
      if (resource?._resourceType === 'scene' && Array.isArray(resource.actors))
        resource.actors.forEach((actor: any, index: number) => actorIds.add(String(actor.id ?? actor.actorId ?? index)));
    }
    const walk = (value: any): void => {
      if (!value || typeof value !== 'object' || (value.command && value.args?.__comment === true)) return;
      try {
      if (this.isNumericValue(value)) {
        validateNumericValue(value);
        const check = (node: NumericValue): void => {
          if (node.kind === 'formula') { check(parseNumericFormula(node.source, node.variables ?? {})); return; }
          if (node.kind === 'variable' && !(isScriptParameter(node.variableId) && variableTypes.has(node.variableId)) && !['number', 'boolean'].includes(variableTypes.get(node.variableId) ?? ''))
            throw new Error(`Numeric value references a missing or string variable: ${node.variableId}`);
          if (node.kind === 'property' && !actorIds.has(node.actorId))
            throw new Error(`Numeric value references a missing actor: ${node.actorId}`);
          if (node.kind === 'trigger' && !triggerIds.has(node.triggerId)) throw new Error(`Numeric value references a missing trigger: ${node.triggerId}`);
          if (node.kind === 'expression') { check(node.left); if (node.right) check(node.right); }
        };
        check(value);
        return;
      }
      if (value.command === 'EVENT_VARIABLE' && this.isNumericValue(value.args?.value) &&
        !(isScriptParameter(value.args.variableId) && variableTypes.has(value.args.variableId)) &&
        !['number', 'boolean'].includes(variableTypes.get(value.args.variableId) ?? ''))
        throw new Error(`Numeric assignment requires a number or boolean target: ${value.args.variableId}`);
      for (const [key, child] of Object.entries(value)) if (!key.startsWith('__')) walk(child);
      } catch (error) {
        throw value.command ? withEventContext(value, error) : error;
      }
    };
    for (const file of resourceFiles) if (!file.jsonContent?._deleted) walk(file.jsonContent);
  }

  private requireExportedRuntimeFiles(resourceFiles: ResourceFile[]): void {
    const pending = resourceFiles.find(file => file.headerContent.length === 0);
    if (pending) throw new Error(`Resource ${pending.resourceName}: preparation data requires processRuntimeResource before final C++ generation`);
  }

  public async generateResourceRegistryClass(resourceFiles: RuntimeResourceFile[], config: GameConfig ): Promise<void> {
    // Reserve only the project's largest scene, including event-created pools.
    // Definitions may exceed OAM: offscreen residents need no native sprite.
    const definitions = Math.max(1, ...resourceFiles.filter(file => file.jsonContent?._resourceType === 'scene')
      .map(file => ((file.jsonContent as any).actors ?? []).filter((actor: any) => actorSpriteId(actor)).length));
    fs.writeFileSync(path.join(this.includeDir, 'runtime_capacity.h'),
      `#ifndef GBA_STUDIO_RUNTIME_CAPACITY_H\n#define GBA_STUDIO_RUNTIME_CAPACITY_H\n#define GBA_STUDIO_MAX_ACTORS ${Math.min(128, definitions)}\n#define GBA_STUDIO_MAX_ACTOR_DEFINITIONS ${definitions}\n#endif\n`);
    this.requireExportedRuntimeFiles(resourceFiles);
    this.validateNumericReferences(resourceFiles);
    const tplPath = path.join(this.templateDir, 'src', 'resource_registry.cpp');

    if (fs.existsSync(tplPath)) {
      this.validateSceneReferences(resourceFiles);
      let registry_template = fs.readFileSync(tplPath, 'utf8');
      // let objects = "";
      let backgrounds = "";
      let scenes = "";
      let sprites = "";
      // Projects created before the settings resource was introduced may not
      // provide a settings file. Keep the generated aggregate valid C++ so
      // those projects can still be played with default-initialized settings.
      let settings = "";
      let backgroundsCount = 0;
      let scenesCount = 0;
      let spritesCount = 0;
      let variablesInitialization = '    VariableManager::instance().initialize(nullptr, 0);';
      const paletteDefinitions = new Map<string, string[]>(DEFAULT_PALETTES.map(palette => [palette.id, palette.colors]));

      for (const file of resourceFiles) {
        switch(file.jsonContent?._resourceType) {
          case "background":
            backgrounds += parseResourceFile(file) + "\n";
            backgroundsCount++;
            break;
          case "scene":
            scenes += parseResourceFile(file) + "\n";
            scenesCount++;
            break;
          case "sprite":
            sprites += parseResourceFile(file) + "\n";
            spritesCount++;
            break;
          case "settings":
            settings += parseResourceFile(file) + "\n";
            break;
          case "variables":
            variablesInitialization = '    VariableManager::instance().initialize(VARIABLES_DEFINITIONS, VARIABLES_DEFINITIONS_COUNT);';
            break;
          case "palette": {
            const palette = file.jsonContent as any;
            if (typeof palette.id === 'string' && Array.isArray(palette.colors)) {
              paletteDefinitions.set(palette.id, palette.colors.filter((color: unknown) => typeof color === 'string').slice(0, 16));
            }
            break;
          }
        }

        // objects += parseResourceFile(file) + "\n";
      }

      const toButanoColor = (value: string) => {
        const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
        if (!match) return 'bn::color(0, 0, 0)';
        const channel = (part: string) => Math.round(parseInt(part, 16) * 31 / 255);
        return `bn::color(${channel(match[1])}, ${channel(match[2])}, ${channel(match[3])})`;
      };
      const paletteConstants = [...paletteDefinitions.entries()].map(([id, colors], index) => {
        const symbol = `BACKGROUND_PALETTE_${index}_COLORS`;
        const normalized = [...colors];
        while (normalized.length < 16) normalized.push('#000000');
        return { id, symbol, colors: normalized.slice(0, 16) };
      });
      const paletteSource = paletteConstants.map(palette =>
        `static const bn::color ${palette.symbol}[] = { ${palette.colors.map(toButanoColor).join(', ')} };`
      ).join('\n');
      const paletteEntries = paletteConstants.map(palette =>
        `    { ${JSON.stringify(palette.id)}, ${palette.symbol}, 16 },`
      ).join('\n');
      const defaults = resourceFiles.map(file => file.runtimeResource).find(resource => resource?._resourceType === 'settings') as import('../types/RuntimeResources').RuntimeSettings | undefined;
      const defaultIds = Array.from({ length: 16 }, (_, index) => defaults?.colorPaletteIds?.[index] ?? '');
      for (const id of defaultIds) if (id && !paletteDefinitions.has(id)) throw new Error(`Unknown default palette '${id}'`);
      const bindingLookups = resourceFiles.flatMap(file => {
        const resource = file.runtimeResource;
        if (resource?._resourceType !== 'background' || !resource.slotPaletteBindings?.length) return [];
        return [`    if(name == ${JSON.stringify(resource.graphicsName)}) {\n${resource.slotPaletteBindings.map(binding => `        if(marker == ${binding.marker}) return ${binding.slot * 16 + binding.color};`).join('\n')}\n    }`];
      }).join('\n');
      const slotFunctions = `\nstatic const char* const DEFAULT_PALETTE_IDS[16] = { ${defaultIds.map(id => JSON.stringify(id)).join(', ')} };\nconst char* get_default_palette_id(int slot) { return slot >= 0 && slot < 16 ? DEFAULT_PALETTE_IDS[slot] : nullptr; }\nint get_slot_palette_binding(const bn::string<64>& name, int marker) {\n${bindingLookups}\n    (void) name; (void) marker; return -1;\n}\n`;

      // Emit a bounded resolver for string music IDs used by script events.
      // Butano generates the concrete `bn::music_items::*` symbols only when
      // music assets exist, so the header remains compilable for audio-less
      // projects through __has_include.
      const musicIds = new Set<string>();
      const collectMusicIds = (events: any[]) => {
        for (const event of Array.isArray(events) ? events : []) {
          if (['EVENT_PLAY_MUSIC', 'EVENT_MUSIC_PLAY_JINGLE', 'EVENT_SHOOTER_LOAD_STAGE'].includes(event?.command) && typeof event.args?.musicId === 'string' && event.args.musicId) {
            musicIds.add(event.args.musicId);
          }
          collectMusicIds(event?.children?.then);
          collectMusicIds(event?.children?.else);
        }
      };
      for (const events of this.resourcePrograms(resourceFiles)) collectMusicIds(events);

      // Keep valid value-initialization only when a project truly has no
      // settings resource. A real settings initializer must not be appended
      // to the fallback "{}" value.
      if (!settings.trim()) settings = "{}";
      const musicSymbol = musicAssetSymbol;
      const resolverBranches = [...musicIds].map(id =>
        `    if (bn::string<64>(id) == ${JSON.stringify(id)}) return bn::music_items::${musicSymbol(id)};`
      ).join('\n') || '    (void) id;';
      const soundIds = new Set<string>();
      const collectSoundIds = (events: any[]) => {
        for (const event of Array.isArray(events) ? events : []) {
          if (event?.command === 'EVENT_PLAY_SOUND') {
            const id = event.args?.soundSource === 'generated'
              ? this.generatedEventSoundId(event.args)
              : event.args?.soundSource === 'project'
                ? this.projectSfxSoundId(String(event.args?.soundId ?? ''))
                : event.args?.soundId;
            if (typeof id === 'string' && id) soundIds.add(id);
          }
          collectSoundIds(event?.children?.then);
          collectSoundIds(event?.children?.else);
        }
      };
      for (const events of this.resourcePrograms(resourceFiles)) collectSoundIds(events);
      const soundBranches = [...soundIds].map(id =>
        `    if (bn::string<64>(id) == ${JSON.stringify(id)}) return bn::sound_items::${musicSymbol(id)};`
      ).join('\n') || '    (void) id;';
      const audioRegistry = `#ifndef GENERATED_AUDIO_REGISTRY_H\n#define GENERATED_AUDIO_REGISTRY_H\n#include "bn_optional.h"\n#include "bn_string.h"\n#include "bn_music_item.h"\n#include "bn_sound_item.h"\n#if __has_include("bn_music_items.h")\n#include "bn_music_items.h"\n#endif\n#if __has_include("bn_sound_items.h")\n#include "bn_sound_items.h"\n#endif\ninline bn::optional<bn::music_item> resolve_music_item(const bn::string<64>& id)\n{\n#if __has_include("bn_music_items.h")\n${resolverBranches}\n#else\n    (void) id;\n#endif\n    return bn::nullopt;\n}\ninline bn::optional<bn::sound_item> resolve_sound_item(const bn::string<64>& id)\n{\n#if __has_include("bn_sound_items.h")\n${soundBranches}\n#else\n    (void) id;\n#endif\n    return bn::nullopt;\n}\n#endif\n`;
      fs.writeFileSync(path.join(this.includeDir, 'audio_registry.h'), audioRegistry, 'utf8');

      registry_template = registry_template.replace("{{PROJECT_NAME}}", config.projectName);
      registry_template = registry_template.replace("{{AUTHOR}}", config.authorName || '');
      registry_template = registry_template.replace("{{VERSION}}", config.version || '1.0.0');
      // registry_template = registry_template.replace("{{OBJECT_CONSTANTS}}", objects);
      registry_template = registry_template.replace("{{BACKGROUNDS_CONSTANTS}}", backgrounds);
      registry_template = registry_template.replace("{{SCENES_CONSTANTS}}", scenes);
      registry_template = registry_template.replace("{{SPRITES_CONSTANTS}}", sprites);
      registry_template = registry_template.replace("{{BACKGROUNDS_COUNT}}", String(backgroundsCount));
      registry_template = registry_template.replace("{{SCENES_COUNT}}", String(scenesCount));
      registry_template = registry_template.replace("{{SPRITES_COUNT}}", String(spritesCount));
      registry_template = registry_template.replace("{{BACKGROUNDS_ARRAY_SIZE}}", String(Math.max(1, backgroundsCount)));
      registry_template = registry_template.replace("{{BACKGROUND_PALETTES_CONSTANTS}}", paletteSource + slotFunctions);
      registry_template = registry_template.replace("{{BACKGROUND_PALETTES_COUNT}}", String(paletteConstants.length));
      registry_template = registry_template.replace("{{BACKGROUND_PALETTES_ARRAY_SIZE}}", String(Math.max(1, paletteConstants.length)));
      registry_template = registry_template.replace("{{BACKGROUND_PALETTES_ENTRIES}}", paletteEntries || '    { nullptr, nullptr, 0 },');
      registry_template = registry_template.replace("{{SCENES_ARRAY_SIZE}}", String(Math.max(1, scenesCount)));
      registry_template = registry_template.replace("{{SPRITES_ARRAY_SIZE}}", String(Math.max(1, spritesCount)));
      registry_template = registry_template.replace("{{SETTINGS_CONSTANTS}}", settings);
      registry_template = registry_template.replace("{{VARIABLES_INITIALIZATION}}", variablesInitialization);
      const saveLookups: string[] = [];
      for(const file of resourceFiles) for(const match of file.headerContent.toString().matchAll(/static const GameSavePoint ([A-Za-z0-9_]+)_SAVE_POINTS\[\]/g)) {
        const symbol = match[1];
        saveLookups.push(`    for(int index = 0; index < ${symbol}_SAVE_POINTS_COUNT; ++index) if(${symbol}_SAVE_POINTS[index].key == key) return &${symbol}_SAVE_POINTS[index];`);
      }
      registry_template = registry_template.replace('{{GAME_SAVE_LOOKUPS}}', saveLookups.join('\n'));

      const registryPath = path.join(this.srcDir, 'resource_registry.cpp');
      fs.writeFileSync(registryPath, registry_template, 'utf8');
      console.log('..: Tempalte resource registry completed:', registryPath);
    }
  }

  private validateSceneReferences(resourceFiles: ResourceFile[]): void {
    const resourceIds = new Set<string>();
    for (const file of resourceFiles) {
      const id = file.jsonContent?.id;
      if (typeof id !== 'string' || !id) continue;
      if (resourceIds.has(id)) throw new Error(`Duplicate resource id '${id}'`);
      resourceIds.add(id);
    }
    const sceneIds = new Set(resourceFiles
      .filter(file => file.jsonContent?._resourceType === 'scene')
      .map(file => file.jsonContent?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0));
    const scenesById = new Map(resourceFiles
      .filter(file => file.jsonContent?._resourceType === 'scene' && typeof file.jsonContent?.id === 'string')
      .map(file => [file.jsonContent!.id as string, file.jsonContent!]));
    const backgrounds = new Set(resourceFiles
      .filter(file => file.jsonContent?._resourceType === 'background')
      .map(file => file.jsonContent?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0));
    const visit = (events: any[], owner: string): void => {
      for (const event of events) {
        if (!event || typeof event !== 'object') continue;
        const args = event.args ?? {};
        if(event.command === 'EVENT_TRIGGER_SET_ENABLED' && !((scenesById.get(owner) as any)?.triggers ?? []).some((trigger: any) => trigger.id === args.triggerId)) {
          throw new Error(`Invalid EVENT_TRIGGER_SET_ENABLED ${event.id ?? '<unknown>'}: trigger '${args.triggerId}' does not exist in scene '${owner}'`);
        }
        if (event.command === 'EVENT_CHANGE_SCENE' && typeof args.sceneId === 'string' && args.sceneId && !sceneIds.has(args.sceneId)) {
          throw new Error(`Invalid EVENT_CHANGE_SCENE ${event.id ?? '<unknown>'}: scene '${args.sceneId}' does not exist`);
        }
        if (event.command === 'EVENT_CHANGE_SCENE' && typeof args.sceneId === 'string' && scenesById.has(args.sceneId)) {
          const destination = scenesById.get(args.sceneId) as any;
          const readCoordinate = (value: unknown) => typeof value === 'object' && value !== null && 'value' in value ? (value as any).value : value;
          const x = Number(readCoordinate(args.x));
          const y = Number(readCoordinate(args.y));
          if (Number.isFinite(x) && (x < 0 || x >= Number(destination.width ?? 256))) {
            throw new Error(`Invalid EVENT_CHANGE_SCENE ${event.id ?? '<unknown>'}: x ${x} is outside destination scene '${args.sceneId}'`);
          }
          if (Number.isFinite(y) && (y < 0 || y >= Number(destination.height ?? 256))) {
            throw new Error(`Invalid EVENT_CHANGE_SCENE ${event.id ?? '<unknown>'}: y ${y} is outside destination scene '${args.sceneId}'`);
          }
        }
        if (event.command === 'EVENT_CHANGE_LAYER' && typeof args.backgroundId === 'string' && args.backgroundId && !backgrounds.has(args.backgroundId)) {
          throw new Error(`Invalid EVENT_CHANGE_LAYER ${event.id ?? '<unknown>'}: background '${args.backgroundId}' does not exist`);
        }
        visit(Array.isArray(event.children?.then) ? event.children.then : [], owner);
        visit(Array.isArray(event.children?.else) ? event.children.else : [], owner);
      }
    };
    for (const file of resourceFiles) {
      if (file.jsonContent?._resourceType !== 'scene') continue;
      const scene = file.jsonContent as any;
      const nestedIds = new Set<string>();
      const registerNested = (items: any[], kind: string) => {
        for (const item of Array.isArray(items) ? items : []) {
          if (typeof item?.id !== 'string' || !item.id) continue;
          if (nestedIds.has(item.id)) throw new Error(`Duplicate ${kind} id '${item.id}' in scene '${scene.id ?? ''}'`);
          nestedIds.add(item.id);
        }
      };
      registerNested(scene.actors, 'scene object');
      registerNested(scene.triggers, 'scene object');
      registerNested(scene.collisions, 'collision');
      visit(Array.isArray(scene.script) ? scene.script : [], String(scene.id ?? 'scene'));
      for (const trigger of Array.isArray(scene.triggers) ? scene.triggers : []) {
        visit(Array.isArray(trigger?.onEnterScript) ? trigger.onEnterScript : [], String(scene.id ?? 'scene'));
        visit(Array.isArray(trigger?.onLeaveScript) ? trigger.onLeaveScript : [], String(scene.id ?? 'scene'));
      }
      for (const actor of Array.isArray(scene.actors) ? scene.actors : []) {
        visit(Array.isArray(actor?.onInitScript) ? actor.onInitScript : [], String(scene.id ?? 'scene'));
        visit(Array.isArray(actor?.onInteractScript) ? actor.onInteractScript : [], String(scene.id ?? 'scene'));
        visit(Array.isArray(actor?.onUpdateScript) ? actor.onUpdateScript : [], String(scene.id ?? 'scene'));
      }
    }
  }
}

// FunÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o auxiliar para analisar o conteÃƒÆ’Ã‚Âºdo do arquivo de recurso e gerar a linha apropriada
function parseResourceFile(file: ResourceFile): string {
  const baseName = file.resourceName.replace('_res.h', '');
  const baseNameUpper = baseName.toUpperCase();
  const headerContent = file.headerContent.toString('utf8');

  // Detecta tipo de recurso no jsonContent se disponÃƒÆ’Ã‚Â­vel
  let type = "unknown";
  let name;
  if(file.jsonContent?._resourceType) {
    type = file.jsonContent._resourceType;
    name = type;
  }

  if(file.jsonContent?.name !== undefined) {
    name = file.jsonContent.name;
  }

  // Helper: verifica existÃƒÆ’Ã‚Âªncia de sÃƒÆ’Ã‚Â­mbolo (escapa metacaracteres para regex)
  const escapeForRegExp = (s: string) => s.replace(/[-\\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const hasSymbol = (sym: string) => new RegExp(`\\b${escapeForRegExp(sym)}\\b`).test(headerContent);
  const toButanoGraphicsName = (filename: string): string => {
    const base = filename.replace(/\.[^/.]+$/, '')
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[^A-Za-z0-9_]/g, '_').toLowerCase().replace(/_+/g, '_');
    return /^[a-z]/.test(base) ? base : `a_${base}`;
  };

  if (type === "settings") {
    // Settings are emitted with the canonical SETTINGS_* symbols even when
    // the source resource filename has a different display-oriented name.
    const settingsSymbolBase = hasSymbol(`${baseNameUpper}_STARTSCENEID`) ? baseNameUpper : 'SETTINGS';
    const required = [
      `${settingsSymbolBase}_STARTSCENEID`,
      `${settingsSymbolBase}_STARTX`,
      `${settingsSymbolBase}_STARTY`,
      `${settingsSymbolBase}_STARTMOVESPEED`,
      `${settingsSymbolBase}_STARTANIMSPEED`,
      `${settingsSymbolBase}_STARTDIRECTION`,
    ];
    const fadeDirection = Number(file.jsonContent?.fadeDirection) === 1 ? 1 : 0;
    const playerSpriteId = file.jsonContent?.playerSpriteId ? `${settingsSymbolBase}_PLAYERSPRITEID` : 'nullptr';
    const uiCursorImage = JSON.stringify(toButanoGraphicsName(String(file.jsonContent?.uiCursorImage || 'cursor.png')));
    // The source frame is converted to a full-width regular background during
    // transcoding, preserving its 8px border without sprite scaling.
    const uiFrameImage = JSON.stringify('dialogue_frame_sprite');
    const inputBindings = hasSymbol(`${settingsSymbolBase}_INPUTMAP_BINDINGS`) ? `${settingsSymbolBase}_INPUTMAP_BINDINGS` : 'nullptr';
    const sceneMapsSymbol = `${settingsSymbolBase}_INPUTMAPSBYSCENETYPE_MAPS`;
    const sceneMaps = hasSymbol(sceneMapsSymbol) ? sceneMapsSymbol : 'nullptr';
    const sceneMapsCount = Object.keys(file.jsonContent?.inputMapsBySceneType ?? {}).length;
    const inputBindingsCount = hasSymbol(`${settingsSymbolBase}_INPUTMAP_BINDINGS_COUNT`) ? `${settingsSymbolBase}_INPUTMAP_BINDINGS_COUNT` : '0';
    const combatConfigSymbol = `${baseNameUpper}_COMBATCONFIG_COMBAT_CONFIG`;
    const combatConfig = hasSymbol(combatConfigSymbol) ? `&${combatConfigSymbol}` : 'nullptr';
    const shooterConfigSymbol = `${baseNameUpper}_SHOOTERCONFIG_SHOOTER_CONFIG`;
    const shooterConfig = hasSymbol(shooterConfigSymbol) ? `&${shooterConfigSymbol}` : 'nullptr';

    if (required.every(hasSymbol)) {
      return ` { ${settingsSymbolBase}_STARTSCENEID, ${settingsSymbolBase}_STARTX, ${settingsSymbolBase}_STARTY, ${settingsSymbolBase}_STARTMOVESPEED, ${settingsSymbolBase}_STARTANIMSPEED, ${settingsSymbolBase}_STARTDIRECTION, ${fadeDirection}, ${playerSpriteId}, ${uiCursorImage}, ${uiFrameImage}, ${inputBindings}, ${inputBindingsCount}, ${combatConfig}, ${shooterConfig}, { ${inputGroupMasks(file.jsonContent?.inputGroups).join(", ")} }, ${sceneMaps}, ${sceneMapsCount} }`;
    }
  } else if (type === "sprite") {
    const required = [
      `${baseNameUpper}_ID`,
      `${baseNameUpper}_NAME`,
    ];
    const animations = Array.isArray(file.jsonContent?.playerAnimationStates)
      ? file.jsonContent.playerAnimationStates.flatMap((state: any) => Array.isArray(state.animations) ? state.animations : [])
      : [];
    const hasAnimations = file.jsonContent?.__spriteCanvas ? file.jsonContent.__spriteCanvas.animations.length > 0 : animations.some((animation: any) =>
      (Array.isArray(animation.frames) && animation.frames.length > 0) ||
      (Array.isArray(animation.canvasFrames) && animation.canvasFrames.some((frame: any) => Array.isArray(frame?.pieces) && frame.pieces.length > 0)));
    const animationDefinitions = hasAnimations ? `${baseNameUpper}_ANIMATIONS` : 'nullptr';
    const animationDefinitionsCount = hasAnimations ? `${baseNameUpper}_ANIMATIONS_COUNT` : '0';
    const baked = file.jsonContent?.__spriteCanvas;
    const graphicsName = baked?.graphicsName ?? toButanoGraphicsName(String(file.jsonContent?.filename ?? file.jsonContent?.name ?? 'sprite'));

    if (required.every(hasSymbol)) {
      const frameWidth = baked?.frameWidth ?? file.jsonContent?.playerFrameWidth ?? 16;
      const frameHeight = baked?.frameHeight ?? file.jsonContent?.playerFrameHeight ?? 16;
      return `    { ${baseNameUpper}_ID, ${baseNameUpper}_NAME, "${graphicsName}", ${frameWidth}, ${frameHeight}, ${file.jsonContent?.playerAnimSpeed ?? 6}, ${baked?.idleFrame ?? file.jsonContent?.playerIdleFrame ?? 0}, ${file.jsonContent?.playerCanvasOriginX ?? 0}, ${file.jsonContent?.playerCanvasOriginY ?? 8}, ${file.jsonContent?.playerCollisionX ?? 0}, ${file.jsonContent?.playerCollisionY ?? 0}, ${file.jsonContent?.playerCollisionWidth ?? 16}, ${file.jsonContent?.playerCollisionHeight ?? 8}, ${animationDefinitions}, ${animationDefinitionsCount}, ${baked?.canvasWidth ?? frameWidth}, ${baked?.canvasHeight ?? frameHeight}, ${baked?.partsColumns ?? 1}, ${baked?.partsRows ?? 1} },`;
    }
  } else if (type === "background") {
    const required = [
      `${baseNameUpper}_ID`,
      `${baseNameUpper}_NAME`,
      `${baseNameUpper}_IMAGEWIDTH`,
      `${baseNameUpper}_IMAGEHEIGHT`,
    ];
    if (required.every(hasSymbol)) {
      return `    { ${baseNameUpper}_ID, ${baseNameUpper}_NAME, ${baseNameUpper}_IMAGEWIDTH, ${baseNameUpper}_IMAGEHEIGHT },`;
    }
  } else if (type === "scene") {
    const sceneConfig: any = file.jsonContent || {};
    const required = [
      `${baseNameUpper}_ID`,
      `${baseNameUpper}_BACKGROUNDS_LAYERS`,
    ];
    if (required.every(hasSymbol)) {
      const backgroundLayerCount = file.jsonContent?.backgrounds ? file.jsonContent.backgrounds.length : 0;
      const sceneWidth = Number(sceneConfig.width) || 240;
      const sceneHeight = Number(sceneConfig.height) || 160;
      const cameraX = Number.isFinite(sceneConfig.cameraPosition?.x)
        ? Number(sceneConfig.cameraPosition?.x)
        : 0;
      const cameraY = Number.isFinite(sceneConfig.cameraPosition?.y)
        ? Number(sceneConfig.cameraPosition?.y)
        : 0;
      const script = file.jsonContent?.script && file.jsonContent.script.length > 0 ? `${baseNameUpper}_SCRIPTS` : `nullptr`;
      const scriptCount = file.jsonContent?.script && file.jsonContent.script.length > 0 ? `${baseNameUpper}_SCRIPTS_COUNT` : '0';
      const triggerCount = Array.isArray(sceneConfig.triggers) ? sceneConfig.triggers.length : 0;
      const triggers = triggerCount > 0 ? `${baseNameUpper}_TRIGGERS` : 'nullptr';
      const triggersCount = triggerCount > 0 ? `${baseNameUpper}_TRIGGERS_COUNT` : '0';
      const actorCount = Array.isArray(sceneConfig.actors) ? sceneConfig.actors.length : 0;
      const actors = actorCount > 0 ? `${baseNameUpper}_ACTORS` : 'nullptr';
      const actorsCount = actorCount > 0 ? `${baseNameUpper}_ACTORS_COUNT` : '0';
      const collisionCount = Array.isArray(sceneConfig.collisions) ? sceneConfig.collisions.length : 0;
      const collisions = collisionCount > 0 ? `${baseNameUpper}_COLLISIONS` : 'nullptr';
      const collisionsCount = collisionCount > 0 ? `${baseNameUpper}_COLLISIONS_COUNT` : '0';
      const tileAnimationCount = Array.isArray(sceneConfig.tileAnimations) ? sceneConfig.tileAnimations.length : 0;
      const tileAnimations = tileAnimationCount > 0 ? `${baseNameUpper}_TILE_ANIMATIONS` : 'nullptr';
      const tileAnimationsCount = tileAnimationCount > 0 ? `${baseNameUpper}_TILE_ANIMATIONS_COUNT` : '0';
      const spawnerTimelineCount = Array.isArray(sceneConfig.spawnerTimelines) ? sceneConfig.spawnerTimelines.length : 0;
      const spawnerTimelines = spawnerTimelineCount > 0 ? `${baseNameUpper}_SPAWNER_TIMELINES` : 'nullptr';
      const spawnerTimelinesCount = spawnerTimelineCount > 0 ? `${baseNameUpper}_SPAWNER_TIMELINES_COUNT` : '0';
      return `    { ResourceType::${type}, ${baseNameUpper}_ID, ${baseNameUpper}_NAME, ${script}, ${scriptCount}, ${baseNameUpper}_BACKGROUNDS_LAYERS, ${backgroundLayerCount}, ${baseNameUpper}_WIDTH, ${baseNameUpper}_HEIGHT, ${cameraX}, ${cameraY}, ${baseNameUpper}_SCENETYPE, ${triggers}, ${triggersCount}, ${actors}, ${actorsCount}, ${collisions}, ${collisionsCount}, ${tileAnimations}, ${tileAnimationsCount}, ${spawnerTimelines}, ${spawnerTimelinesCount} },`;
    } else {
      const backgroundLayerCount = file.jsonContent?.backgrounds ? file.jsonContent.backgrounds.length : 0;
      const triggerCount = Array.isArray(sceneConfig.triggers) ? sceneConfig.triggers.length : 0;
      const triggers = triggerCount > 0 ? `${baseNameUpper}_TRIGGERS` : 'nullptr';
      const triggersCount = triggerCount > 0 ? `${baseNameUpper}_TRIGGERS_COUNT` : '0';

      const collisionCount = Array.isArray(sceneConfig.collisions) ? sceneConfig.collisions.length : 0;
      const collisions = collisionCount > 0 ? `${baseNameUpper}_COLLISIONS` : 'nullptr';
      const collisionsCount = collisionCount > 0 ? `${baseNameUpper}_COLLISIONS_COUNT` : '0';
      const tileAnimationCount = Array.isArray(sceneConfig.tileAnimations) ? sceneConfig.tileAnimations.length : 0;
      const tileAnimations = tileAnimationCount > 0 ? `${baseNameUpper}_TILE_ANIMATIONS` : 'nullptr';
      const tileAnimationsCount = tileAnimationCount > 0 ? `${baseNameUpper}_TILE_ANIMATIONS_COUNT` : '0';
      const spawnerTimelineCount = Array.isArray(sceneConfig.spawnerTimelines) ? sceneConfig.spawnerTimelines.length : 0;
      const spawnerTimelines = spawnerTimelineCount > 0 ? `${baseNameUpper}_SPAWNER_TIMELINES` : 'nullptr';
      const spawnerTimelinesCount = spawnerTimelineCount > 0 ? `${baseNameUpper}_SPAWNER_TIMELINES_COUNT` : '0';
      return `    { ResourceType::${type}, ${baseNameUpper}_ID, "${name}", nullptr, 0, nullptr, ${backgroundLayerCount}, 0, 0, 0, 0, ${baseNameUpper}_SCENETYPE, ${triggers}, ${triggersCount}, nullptr, 0, ${collisions}, ${collisionsCount}, ${tileAnimations}, ${tileAnimationsCount}, ${spawnerTimelines}, ${spawnerTimelinesCount} },`;
    }
  }

  // Fallback genÃƒÆ’Ã‚Â©rico
  return ``;
}

export default ResourceBuilder;
