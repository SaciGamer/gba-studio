export type SceneCollisionSide = 'solid' | 'top' | 'down' | 'left' | 'right' | 'ladder';

// Opposite faces use complementary pairs: top/down are blue/orange and
// left/right are violet/yellow. Solid remains the familiar red.
export const SCENE_COLLISION_COLORS: Record<SceneCollisionSide, string> = {
  solid: '#ff4d4f',
  top: '#1677ff',
  down: '#fa8c16',
  left: '#722ed1',
  right: '#fadb14',
  ladder: '#13c2c2',
};

export function getSceneCollisionColor(side?: string): string {
  return SCENE_COLLISION_COLORS[(side as SceneCollisionSide) in SCENE_COLLISION_COLORS
    ? side as SceneCollisionSide
    : 'solid'];
}

export function getSceneCollisionFill(side: string | undefined, opacity: number): string {
  const color = getSceneCollisionColor(side);
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${opacity})`;
}

export function getCollisionSideForScene(side: SceneCollisionSide | undefined, sceneType?: string): SceneCollisionSide {
  return side === 'ladder' && sceneType !== 'Platformer' && sceneType !== 'Platform' ? 'solid' : side ?? 'solid';
}
export function drawLadderCollisionIcon(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  context.save();
  context.strokeStyle = '#fff';
  context.lineWidth = 1;
  const left = x + width * 0.3, right = x + width * 0.7;
  context.beginPath();
  context.moveTo(left, y + 1); context.lineTo(left, y + height - 1);
  context.moveTo(right, y + 1); context.lineTo(right, y + height - 1);
  for (let row = y + 3; row < y + height - 1; row += 4) { context.moveTo(left, row); context.lineTo(right, row); }
  context.stroke();
  context.restore();
}
