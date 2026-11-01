/** Standard project actions. Physical button names remain the GBA ABI. */
export const DEFAULT_INPUT_MAP: Readonly<Record<string, readonly string[]>> = {
  move_left: ['LEFT'], move_right: ['RIGHT'], move_up: ['UP'], move_down: ['DOWN'],
  confirm: ['A'], cancel: ['B'], jump: ['B'], start: ['START'], select: ['SELECT'],
  left_button: ['L'], right_button: ['R'],
  // TODO: Restore a configurable Shooter action when its Controls UI resumes.
  // shoot: ['B'],
};

/** Fill missing standard actions and retain saved bindings from older projects. */
export function withDefaultInputMap(source?: Record<string, string[]>): Record<string, string[]> {
  const result = { ...source };
  if (result.select === undefined && result.menu !== undefined) result.select = result.menu;
  delete result.menu;
  if (result.start === undefined && result.pause !== undefined) result.start = result.pause;
  delete result.pause;
  for (const [action, buttons] of Object.entries(DEFAULT_INPUT_MAP)) {
    if (result[action] === undefined) result[action] = [...buttons];
  }
  return result;
}

export const INPUT_MAP_SCENE_TYPES = ['Top Down', 'Platformer', 'Adventure', 'Point Click', 'Logo'] as const;
export type SceneInputMaps = Partial<Record<typeof INPUT_MAP_SCENE_TYPES[number], Record<string, string[]>>>;
export function sceneInputActions(sceneType: string): string[] {
  return Object.keys(DEFAULT_INPUT_MAP).filter(action => action !== 'jump' || sceneType === 'Platformer');
}
export function resolveSceneInputMap(sceneType: string, maps?: SceneInputMaps, legacy?: Record<string, string[]>): Record<string, string[]> {
  const defaults = withDefaultInputMap(legacy);
  return { ...defaults, ...maps?.[sceneType as keyof SceneInputMaps] };
}
export function validateSceneInputMaps(value?: SceneInputMaps): void {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid scene input maps');
  const buttons = ['A', 'B', 'L', 'R', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT'];
  for (const [type, map] of Object.entries(value)) {
    if (!(INPUT_MAP_SCENE_TYPES as readonly string[]).includes(type) || !map || typeof map !== 'object' || Array.isArray(map)) throw new Error(`Invalid scene input map: ${type}`);
    for (const [action, binding] of Object.entries(map)) {
      if (!sceneInputActions(type).includes(action) || !Array.isArray(binding) || binding.length < 1 || binding.length > 8 || binding.some(button => !buttons.includes(button))) throw new Error(`Invalid scene input binding: ${type}.${action}`);
    }
  }
}
