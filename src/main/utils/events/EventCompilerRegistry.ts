/** Explicit binding between enabled event codes and compiler strategies. */
export type EventCompilerStrategy =
  | 'actor-state'
  | 'wait' | 'fade' | 'fade-options' | 'scene-change' | 'camera'
  | 'layer' | 'visibility' | 'background-scroll' | 'background-parallax' | 'palette' | 'variable' | 'if' | 'call-script'
  | 'actor-move' | 'actor-spawn' | 'actor-remove' | 'actor-visible' | 'actor-hide' | 'actor-show'
  | 'actor-hide-all' | 'actor-show-all' | 'actor-animation-speed' | 'actor-priority' | 'sprite-effect' | 'audio-play' | 'audio-sound' | 'audio-sound-stop' | 'audio-stop' | 'audio-volume' | 'audio-resume' | 'audio-pause' | 'audio-fade' | 'rumble'
  | 'dialogue' | 'dialogue-hide' | 'dialogue-choice' | 'variable-text' | 'ui-text' | 'ui-value' | 'ui-animate' | 'ui-lifecycle' | 'save' | 'for' | 'break' | 'continue' | 'while' | 'wait-button' | 'wait-input' | 'attach-button' | 'if-button-held' | 'input-group'
  | 'shooter-start' | 'shooter-load-stage' | 'shooter-background-mode' | 'shooter-pause' | 'shooter-stop' | 'shooter-player-enabled' | 'shooter-clear' | 'shooter-boss' | 'shooter-boss-phase' | 'shooter-wait-signal' | 'shooter-stat' | 'shooter-grant' | 'hbe' | 'blend-alpha';

export const EVENT_COMPILER_REGISTRY: Readonly<Record<string, EventCompilerStrategy>> = {
  EVENT_ACTOR_SET_STATE: 'actor-state',
  EVENT_WAIT: 'wait', EVENT_FADE_IN: 'fade', EVENT_FADE_OUT: 'fade',
  EVENT_FADE_OPTIONS: 'fade-options', EVENT_CHANGE_SCENE: 'scene-change',
  EVENT_PAN_CAMERA: 'camera', EVENT_CAMERA_MOVE_TO: 'camera', EVENT_CAMERA_FOLLOW: 'camera', EVENT_CAMERA_SHAKE: 'camera', EVENT_PLAY_MUSIC: 'audio-play', EVENT_MUSIC_PLAY_JINGLE: 'audio-play',
  EVENT_STOP_MUSIC: 'audio-stop', EVENT_MUSIC_STOP: 'audio-stop', EVENT_SET_MUSIC_VOLUME: 'audio-volume', EVENT_MUSIC_RESUME: 'audio-resume', EVENT_MUSIC_PAUSE: 'audio-pause', EVENT_MUSIC_FADE: 'audio-fade',
  EVENT_PLAY_SOUND: 'audio-sound', EVENT_RUMBLE: 'rumble', EVENT_SOUND_STOP: 'audio-sound-stop',
  EVENT_HBE_EFFECT_ENABLE: 'hbe', EVENT_HBE_EFFECT_DISABLE: 'hbe',
  EVENT_BLEND_ALPHA: 'blend-alpha',
  EVENT_SHOOTER_START: 'shooter-start', EVENT_SHOOTER_SPAWN_WAVE: 'shooter-start', EVENT_SHOOTER_LOAD_STAGE: 'shooter-load-stage', EVENT_SHOOTER_SET_BACKGROUND_MODE: 'shooter-background-mode', EVENT_SHOOTER_PAUSE: 'shooter-pause', EVENT_SHOOTER_STOP: 'shooter-stop', EVENT_SHOOTER_CLEAR_ENEMIES: 'shooter-clear', EVENT_SHOOTER_SPAWN_BOSS: 'shooter-boss', EVENT_SHOOTER_SET_BOSS_PHASE: 'shooter-boss-phase', EVENT_SHOOTER_WAIT_SIGNAL: 'shooter-wait-signal', EVENT_SHOOTER_SET_STAT: 'shooter-stat', EVENT_SHOOTER_ADD_STAT: 'shooter-stat', EVENT_SHOOTER_GRANT: 'shooter-grant',
  EVENT_SHOOTER_SET_PLAYER_ENABLED: 'shooter-player-enabled',
  EVENT_DISPLAY_DIALOGUE: 'dialogue', EVENT_DIALOGUE_SHOW: 'dialogue', EVENT_TEXT_SCROLL: 'dialogue', EVENT_CREDITS_PLAY: 'dialogue', EVENT_HIDE_DIALOGUE: 'dialogue-hide', EVENT_DIALOGUE_CLOSE: 'dialogue-hide', EVENT_SAVE_WRITE: 'save', EVENT_SAVE_LOAD: 'save',
  EVENT_DISPLAY_VARIABLE_TEXT: 'variable-text',
  EVENT_UI_SET_TEXT: 'ui-text',
  EVENT_UI_SET_VALUE: 'ui-value',
  EVENT_UI_ANIMATE: 'ui-animate',
  EVENT_UI_ANIMATION_STOP: 'ui-animate',
  EVENT_UI_DESTROY: 'ui-lifecycle',
  EVENT_UI_HIDE: 'ui-lifecycle',
  EVENT_UI_SHOW: 'ui-lifecycle',

  EVENT_DIALOGUE_CHOICE: 'dialogue-choice', EVENT_MENU_OPEN: 'dialogue-choice', EVENT_MOVE_ACTOR: 'actor-move', EVENT_ACTOR_MOVE_TO: 'actor-move', EVENT_ACTOR_SET_POSITION: 'actor-move',
  EVENT_SPAWN_ACTOR: 'actor-spawn', EVENT_ACTOR_SPAWN: 'actor-spawn', EVENT_REMOVE_ACTOR: 'actor-remove', EVENT_ACTOR_DESPAWN: 'actor-remove',
  EVENT_VISIBLE_ACTOR: 'actor-visible', EVENT_ACTOR_SET_VISIBLE: 'actor-visible', EVENT_HIDE_ACTOR: 'actor-hide', EVENT_SHOW_ACTOR: 'actor-show',
  EVENT_HIDE_ALL_SPRITES: 'actor-hide-all', EVENT_SHOW_ALL_SPRITES: 'actor-show-all',
  EVENT_SET_ANIMATION_SPEED: 'actor-animation-speed',
  EVENT_ACTOR_SET_ANIMATION: 'actor-animation-speed',
  EVENT_SET_ACTOR_PRIORITY: 'actor-priority',
  EVENT_SPRITE_EFFECT: 'sprite-effect',
  EVENT_CHANGE_LAYER: 'layer', EVENT_VISIBLE_BACKGROUND: 'visibility', EVENT_BACKGROUND_SCROLL: 'background-scroll', EVENT_BACKGROUND_SET_PARALLAX: 'background-parallax',
  EVENT_CHANGE_PALETTE_BACKGROUND: 'palette', EVENT_VARIABLE: 'variable',
  EVENT_VARIABLE_RESET_ALL: 'variable', EVENT_IF: 'if', EVENT_WHILE: 'while',
  EVENT_CALL_SCRIPT: 'call-script', EVENT_FOR: 'for', EVENT_BREAK: 'break', EVENT_CONTINUE: 'continue',
  EVENT_WAIT_FOR_BUTTON: 'attach-button', EVENT_IF_BUTTON_HELD: 'if-button-held',
  EVENT_WAIT_INPUT: 'wait-input',
  EVENT_INPUT_ENABLE: 'input-group', EVENT_INPUT_DISABLE: 'input-group',
};

export function hasEventCompiler(command: unknown): command is keyof typeof EVENT_COMPILER_REGISTRY {
  return typeof command === 'string' && Object.prototype.hasOwnProperty.call(EVENT_COMPILER_REGISTRY, command);
}
