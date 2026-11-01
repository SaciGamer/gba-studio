/** Converts Maxmod's unsigned 8-bit channel pan to the Preview's linear pan range. */
export function trackerItPanByteToNormalized(parameter: number): number {
  const pan = Math.max(0, Math.min(255, Math.trunc(Number.isFinite(parameter) ? parameter : 128)));
  return (pan - 128) / 128;
}

/** IT/S3M S8x stores its four-bit value in the high four bits of Maxmod pan. */
export function trackerItExtendedPanToNormalized(nibble: number): number {
  return trackerItPanByteToNormalized((Math.trunc(Number.isFinite(nibble) ? nibble : 8) & 0x0f) << 4);
}
