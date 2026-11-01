/** Coordinates use 16-pixel tiles. Omitted units preserve each event's legacy meaning. */
export const COORDINATE_EVENTS = [
  'EVENT_CHANGE_SCENE', 'EVENT_PAN_CAMERA', 'EVENT_CAMERA_MOVE_TO',
  'EVENT_MOVE_ACTOR', 'EVENT_ACTOR_MOVE_TO', 'EVENT_ACTOR_SET_POSITION',
  'EVENT_SPAWN_ACTOR', 'EVENT_ACTOR_SPAWN', 'EVENT_SHOOTER_SPAWN_BOSS',
  'EVENT_DISPLAY_VARIABLE_TEXT', 'EVENT_UI_SET_TEXT', 'EVENT_UI_SET_VALUE',
  'EVENT_UI_ANIMATE', 'EVENT_BACKGROUND_SCROLL',
] as const;

export function coordinateScale(args: Record<string, any>, field: string, defaultUnit = 'pixels'): number {
  return (args[field + 'Unit'] ?? defaultUnit) === 'tiles' ? 16 : 1;
}

export function coordinatePixels(args: Record<string, any>, field: string, fallback = 0): number {
  const raw = args[field] ?? fallback;
  const value = Number(raw && typeof raw === 'object' ? raw.value : raw);
  return (Number.isFinite(value) ? value : fallback) * coordinateScale(args, field);
}
