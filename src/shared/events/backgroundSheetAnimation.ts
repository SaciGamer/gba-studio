export const BACKGROUND_ANIMATE = 'EVENT_BACKGROUND_ANIMATE';
export const BACKGROUND_ANIMATION_DEFAULTS = { layerId: 0, backgroundId: '', direction: 'horizontal', frameWidth: 0, frameHeight: 0, step: 0, frameCount: 0, startFrame: 1, endFrame: 0, reverse: false, durationFrames: 10, speedUnit: 'frames', customSpeed: false, loop: true };

export function backgroundAnimationTicks(value: number, unit: 'frames' | 'ticks' | 'seconds'): number {
  return Math.max(1, Math.min(600, Math.round(value * (unit === 'seconds' ? 60 : 1))));
}

export function backgroundSheetGeometry(args: Record<string, any>, image: { imageWidth: number; imageHeight: number; hd?: boolean }) {
  const integer = (value: any, fallback: number, min: number, max: number, field: string) => {
    const result = value ?? fallback;
    if (typeof result !== 'number' || !Number.isInteger(result) || result < min || result > max) throw new Error(`Invalid background animation ${field}`);
    return result;
  };
  const direction = args.direction ?? 'horizontal';
  if (!['horizontal', 'vertical'].includes(direction)) throw new Error('Invalid background animation direction');
  const frameWidth = integer(args.frameWidth, 0, 0, 512, 'frameWidth') || (image.hd ? 240 : 256);
  const frameHeight = integer(args.frameHeight, 0, 0, 512, 'frameHeight') || (image.hd ? 160 : 256);
  const step = integer(args.step, 0, 0, 16384, 'step') || (direction === 'horizontal' ? frameWidth : frameHeight);
  const durationFrames = integer(args.durationFrames, 10, 1, 600, 'durationFrames');
  if (args.speedUnit !== undefined && !['frames', 'ticks', 'seconds'].includes(args.speedUnit)) throw new Error('Invalid background animation speedUnit');
  if (args.customSpeed !== undefined && typeof args.customSpeed !== 'boolean') throw new Error('Invalid background animation customSpeed');
  if (args.loop !== undefined && typeof args.loop !== 'boolean') throw new Error('Invalid background animation loop');
  if (args.reverse !== undefined && typeof args.reverse !== 'boolean') throw new Error('Invalid background animation reverse');
  // Keep partially filled frames: the build completes missing pixels using
  // transparent padding for regular BGs and black for direct bitmaps.
  const axisSize = direction === 'horizontal' ? image.imageWidth : image.imageHeight;
  const frameSize = direction === 'horizontal' ? frameWidth : frameHeight;
  const available = Math.max(1, Math.min(Math.ceil(Math.max(0, axisSize - frameSize) / step) + 1, Math.ceil(axisSize / step)));
  const paddedImageWidth = direction === 'horizontal' ? Math.max(image.imageWidth, (available - 1) * step + frameWidth) : Math.max(image.imageWidth, frameWidth);
  const paddedImageHeight = direction === 'vertical' ? Math.max(image.imageHeight, (available - 1) * step + frameHeight) : Math.max(image.imageHeight, frameHeight);
  // Keep the old first-N-frames setting readable without changing saved events.
  const legacyCount = integer(args.frameCount, 0, 0, 512, 'frameCount');
  const startFrame = integer(args.startFrame, 1, 1, 512, 'startFrame');
  const endFrame = integer(args.endFrame, 0, 0, 512, 'endFrame') || legacyCount || available;
  const frameCount = endFrame - startFrame + 1;
  if (frameCount < 1 || endFrame > available || frameCount > 512) throw new Error(`Background animation frame range must fit the image (1-${Math.min(available, 512)})`);
  const frameIndices = Array.from({ length: frameCount }, (_, index) => args.reverse === true ? endFrame - 1 - index : startFrame - 1 + index);
  return { direction, frameWidth, frameHeight, step, frameCount, frameIndices, startFrame, endFrame, paddedImageWidth, paddedImageHeight, reverse: args.reverse === true, durationFrames, loop: args.loop !== false };
}
