export const trackerS3mVolumeForEvent = (
  explicitVolume: number | undefined,
  note: number,
  instrument: number,
  sampleDefaultVolume: number | undefined,
  currentVolume: number,
) => {
  if (explicitVolume !== undefined && explicitVolume >= 0 && explicitVolume <= 64) return explicitVolume;
  if (note > 0) return sampleDefaultVolume ?? currentVolume;
  if (instrument > 0) return sampleDefaultVolume ?? 64;
  return currentVolume;
};
