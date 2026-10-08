/** Repeat a regular BG without changing its image position or source pixels. */
export function drawSceneBackground(context: CanvasRenderingContext2D, image: HTMLCanvasElement, x: number, y: number, width: number, height: number, repeat: boolean, highlightOriginal = false) {
  if (!repeat) { context.drawImage(image, x, y); return; }
  const pattern = context.createPattern(image, 'repeat');
  if (!pattern) return;
  context.save();
  if (highlightOriginal) context.filter = 'grayscale(1)';
  context.translate(x, y);
  context.fillStyle = pattern;
  context.fillRect(-x, -y, width, height);
  context.restore();
  if (highlightOriginal) context.drawImage(image, x, y);
}
