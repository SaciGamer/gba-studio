/** Physical buttons blocked by each runtime Enable/Disable Input group. */
export const INPUT_GROUP_PHYSICAL_BUTTONS = ['A', 'B', 'L', 'R', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT'] as const;
export const INPUT_GROUP_BUTTONS: Record<string, readonly string[]> = {
  gameplay: ['A', 'B', 'L', 'R', 'UP', 'DOWN', 'LEFT', 'RIGHT'],
  menu: ['A', 'B', 'START', 'SELECT', 'UP', 'DOWN', 'LEFT', 'RIGHT'],
  interaction: ['A'],
  all: INPUT_GROUP_PHYSICAL_BUTTONS,
};

export type InputGroups = Partial<Record<'gameplay' | 'menu' | 'interaction', string[]>>;
export function resolveInputGroups(value?: InputGroups): Record<string, readonly string[]> {
  if (value !== undefined) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid inputGroups: expected an object');
    for (const [group, buttons] of Object.entries(value)) {
      if (group === 'all') continue;
      if (!['gameplay', 'menu', 'interaction'].includes(group) || !Array.isArray(buttons) || buttons.some(button => !INPUT_GROUP_PHYSICAL_BUTTONS.includes(button as typeof INPUT_GROUP_PHYSICAL_BUTTONS[number]))) throw new Error(`Invalid inputGroups.${group}: expected supported physical buttons`);
    }
  }
  return Object.fromEntries(Object.entries(INPUT_GROUP_BUTTONS).map(([group, fallback]) => [group,
    group !== 'all' && Array.isArray(value?.[group as keyof InputGroups])
      ? INPUT_GROUP_PHYSICAL_BUTTONS.filter(button => value![group as keyof InputGroups]!.includes(button)) : fallback]));
}
export function inputGroupMasks(value?: InputGroups): number[] {
  const groups = resolveInputGroups(value);
  return ['gameplay', 'menu', 'interaction'].map(group => INPUT_GROUP_PHYSICAL_BUTTONS.reduce((mask, button, index) => mask | (groups[group].includes(button) ? 1 << index : 0), 0));
}
