/** Maps Maxmod's unsigned 8-bit balance byte to its exact normalized mixer ratio. */
export function trackerPreviewPanByteToNormalized(value: number): number {
  const pan = Math.max(0, Math.min(255, Math.trunc(Number.isFinite(value) ? value : 128)));
  return (pan - 128) / 128;
}

/** Converts a linear tracker balance into the Web Audio equal-power angle. */
export function trackerPreviewPanPosition(pan: number): number {
  const right = (Math.max(-1, Math.min(127 / 128, pan)) + 1) / 2;
  const left = 1 - right;
  return (4 * Math.atan2(right, left)) / Math.PI - 1;
}

/** Restores Maxmod's linear per-side gain after StereoPannerNode's equal-power law. */
export function trackerPreviewPanCompensationGain(pan: number): number {
  const right = (Math.max(-1, Math.min(127 / 128, pan)) + 1) / 2;
  const left = 1 - right;
  return Math.hypot(left, right);
}
