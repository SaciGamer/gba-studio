export type PhysicsSettingEvent = {
  field: 'gravity' | 'jumpSpeed' | 'maxFallSpeed' | 'airJumps' | 'allowDiagonal';
  native: string;
  label: string;
  defaultValue: number | boolean;
  playerOnly: boolean;
};
export const PHYSICS_SETTING_EVENTS: Record<string, PhysicsSettingEvent> = {
  EVENT_PHYSICS_SET_GRAVITY: { field: 'gravity', native: 'gravity', label: 'Set Gravity', defaultValue: 0.25, playerOnly: false },
  EVENT_PHYSICS_SET_JUMP_SPEED: { field: 'jumpSpeed', native: 'jump_speed', label: 'Set Jump Speed', defaultValue: 5, playerOnly: true },
  EVENT_PHYSICS_SET_MAX_FALL_SPEED: { field: 'maxFallSpeed', native: 'max_fall_speed', label: 'Set Maximum Fall Speed', defaultValue: 6, playerOnly: false },
  EVENT_PHYSICS_SET_AIR_JUMPS: { field: 'airJumps', native: 'air_jumps', label: 'Set Air Jumps', defaultValue: 0, playerOnly: true },
  EVENT_PHYSICS_SET_DIAGONAL: { field: 'allowDiagonal', native: 'allow_diagonal', label: 'Set Diagonal Movement', defaultValue: true, playerOnly: true },
};
export const PHYSICS_EVENT_CODES = ['EVENT_STOP_PHYSICS', 'EVENT_CONFIGURE_MOVEMENT', 'EVENT_APPLY_VERTICAL_IMPULSE', 'EVENT_PHYSICS_RESET', ...Object.keys(PHYSICS_SETTING_EVENTS)];
