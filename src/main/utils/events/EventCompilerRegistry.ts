/** Explicit binding between enabled event codes and compiler strategies. */
export type EventCompilerStrategy =
  | 'wait' | 'fade' | 'fade-options' | 'scene-change' | 'camera'
  | 'layer' | 'visibility' | 'palette' | 'variable' | 'if' | 'call-script'
  | 'actor-move' | 'actor-spawn' | 'actor-remove' | 'actor-visible' | 'actor-hide' | 'actor-show'
  | 'actor-hide-all' | 'actor-show-all' | 'actor-animation-speed' | 'actor-priority' | 'audio-play' | 'audio-sound' | 'audio-stop' | 'audio-volume'
  | 'dialogue' | 'dialogue-hide' | 'dialogue-choice' | 'variable-text' | 'for' | 'break' | 'continue' | 'while' | 'wait-button' | 'attach-button' | 'if-button-held';

export const EVENT_COMPILER_REGISTRY: Readonly<Record<string, EventCompilerStrategy>> = {
  EVENT_WAIT: 'wait', EVENT_FADE_IN: 'fade', EVENT_FADE_OUT: 'fade',
  EVENT_FADE_OPTIONS: 'fade-options', EVENT_CHANGE_SCENE: 'scene-change',
  EVENT_PAN_CAMERA: 'camera', EVENT_PLAY_MUSIC: 'audio-play',
  EVENT_STOP_MUSIC: 'audio-stop', EVENT_SET_MUSIC_VOLUME: 'audio-volume',
  EVENT_PLAY_SOUND: 'audio-sound',
  EVENT_DISPLAY_DIALOGUE: 'dialogue', EVENT_HIDE_DIALOGUE: 'dialogue-hide',
  EVENT_DISPLAY_VARIABLE_TEXT: 'variable-text',
  EVENT_DIALOGUE_CHOICE: 'dialogue-choice', EVENT_MOVE_ACTOR: 'actor-move',
  EVENT_SPAWN_ACTOR: 'actor-spawn', EVENT_REMOVE_ACTOR: 'actor-remove',
  EVENT_VISIBLE_ACTOR: 'actor-visible', EVENT_HIDE_ACTOR: 'actor-hide', EVENT_SHOW_ACTOR: 'actor-show',
  EVENT_HIDE_ALL_SPRITES: 'actor-hide-all', EVENT_SHOW_ALL_SPRITES: 'actor-show-all',
  EVENT_SET_ANIMATION_SPEED: 'actor-animation-speed',
  EVENT_SET_ACTOR_PRIORITY: 'actor-priority',
  EVENT_CHANGE_LAYER: 'layer', EVENT_VISIBLE_BACKGROUND: 'visibility',
  EVENT_CHANGE_PALETTE_BACKGROUND: 'palette', EVENT_VARIABLE: 'variable',
  EVENT_VARIABLE_RESET_ALL: 'variable', EVENT_IF: 'if', EVENT_WHILE: 'while',
  EVENT_CALL_SCRIPT: 'call-script', EVENT_FOR: 'for', EVENT_BREAK: 'break', EVENT_CONTINUE: 'continue',
  EVENT_WAIT_FOR_BUTTON: 'attach-button', EVENT_IF_BUTTON_HELD: 'if-button-held',
};

export function hasEventCompiler(command: unknown): command is keyof typeof EVENT_COMPILER_REGISTRY {
  return typeof command === 'string' && Object.prototype.hasOwnProperty.call(EVENT_COMPILER_REGISTRY, command);
}
