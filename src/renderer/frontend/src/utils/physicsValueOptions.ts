export type PhysicsValueField = 'gravity' | 'jumpSpeed' | 'maxFallSpeed' | 'impulse' | 'airJumps';
const option = (value: number, name: string) => ({ value, labelKey: `events.physics.preset.${name}` });

export const PHYSICS_VALUE_OPTIONS = {
  gravity: [option(0, 'zero'), option(0.125, 'low'), option(0.25, 'normal'), option(0.5, 'high'), option(1, 'veryHigh')],
  jumpSpeed: [option(0, 'zero'), option(3, 'low'), option(5, 'normal'), option(7, 'high'), option(10, 'veryHigh')],
  maxFallSpeed: [option(0, 'zero'), option(3, 'low'), option(6, 'normal'), option(10, 'high'), option(16, 'veryHigh')],
  impulse: [option(0, 'zero'), option(-3, 'upLow'), option(-5, 'upNormal'), option(-8, 'upHigh'), option(3, 'downLow'), option(5, 'downNormal'), option(8, 'downHigh')],
  airJumps: [option(0, 'none'), option(1, 'double'), option(2, 'triple'), option(-1, 'unlimited')],
} as const;
