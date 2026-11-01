const s3mPeriods = [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 907];
const maxmodPeriodMultiplier = 133_808;
const maxmodPalPeriodDivider = 56_750_314;
const gbaMixerRate = 15_768;
const gbaMixerStepScale = Math.floor((4096 * 65_536) / gbaMixerRate);

export const trackerS3mMaxmodMixerStepQ12 = (sampleRate: number, pitch: number) => {
  if (!Number.isFinite(sampleRate) || sampleRate < 4 || !Number.isFinite(pitch)) return 0;
  const maxmodNote = Math.trunc(pitch) + 11;
  if (maxmodNote < 0 || maxmodNote > 119) return 0;
  const tuning = Math.floor(sampleRate / 4) * 4;
  if (!tuning) return 0;
  const periodBase = (s3mPeriods[maxmodNote % 12] * 8 * maxmodPeriodMultiplier) >> Math.floor(maxmodNote / 12);
  const period = Math.floor(periodBase / tuning);
  if (!period) return 0;
  const mixerValue = Math.floor(maxmodPalPeriodDivider / period);
  return Math.floor((gbaMixerStepScale * mixerValue) / 65_536);
};

/** GBA mixer step after an S3M period slide has changed the MAS period. */
export const trackerS3mMaxmodMixerStepQ12FromPeriod = (period: number) => {
  if (!Number.isFinite(period) || period <= 0) return 0;
  const mixerValue = Math.floor(maxmodPalPeriodDivider / period);
  return Math.floor((gbaMixerStepScale * mixerValue) / 65_536);
};

/** MAS's integer Amiga period for the note and sample tuning used by Maxmod. */
export const trackerS3mMaxmodAmigaPeriod = (sampleRate: number, pitch: number) => {
  if (!Number.isFinite(sampleRate) || sampleRate < 4 || !Number.isFinite(pitch)) return 0;
  const maxmodNote = Math.trunc(pitch) + 11;
  if (maxmodNote < 0 || maxmodNote > 119) return 0;
  const tuning = Math.floor(sampleRate / 4) * 4;
  if (!tuning) return 0;
  const periodBase = (s3mPeriods[maxmodNote % 12] * 8 * maxmodPeriodMultiplier) >> Math.floor(maxmodNote / 12);
  return Math.floor(periodBase / tuning);
};

/** One MAS S3M E/F slide update, matching mppe_Portamento in mas.c. */
export const trackerS3mMaxmodSlidePeriod = (period: number, effect: number, parameter: number) => {
  if (!Number.isFinite(period) || period <= 0 || (effect !== 5 && effect !== 6)) return period;
  const slideType = (parameter >> 4) & 0x0f;
  const fine = slideType === 0x0e || slideType === 0x0f;
  const slideValue = fine ? parameter & 0x0f : parameter & 0xff;
  const amount = slideValue << (fine ? 2 : 4);
  if (!amount) return period;
  return effect === 5
    ? Math.min(1 << 21, period + amount)
    : Math.max(0, period - amount);
};

/** MAS tick sequence: regular slides skip tick 0; Ex/Fx slides update only on tick 0. */
export const trackerS3mMaxmodSlidePeriods = (period: number, effect: number, parameter: number, ticks: number) => {
  const tickCount = Math.max(0, Math.trunc(ticks));
  const slideType = (parameter >> 4) & 0x0f;
  const fine = slideType === 0x0e || slideType === 0x0f;
  let currentPeriod = period;
  return Array.from({ length: tickCount }, (_, tick) => {
    if (fine ? tick === 0 : tick > 0) currentPeriod = trackerS3mMaxmodSlidePeriod(currentPeriod, effect, parameter);
    return currentPeriod;
  });
};

/**
 * Returns the playback-rate multiplier needed for Web Audio to follow the
 * project's Maxmod GBA path for an S3M sample/note pair.
 *
 * mmutil stores S3M C2SPD / 4 in MAS, and Maxmod restores it in mmGetPeriod.
 * Maxmod then uses the ST3 period table and MOD_FREQ_DIVIDER_PAL before the
 * 15,768 Hz GBA mixer. The browser preview must reproduce that quantized rate.
 */
export const trackerS3mMaxmodPlaybackRateScale = (sampleRate: number, pitch: number, rootNote = 49) => {
  if (!Number.isFinite(sampleRate) || sampleRate < 4 || !Number.isFinite(pitch) || !Number.isFinite(rootNote)) return 1;
  const fixedPointStep = trackerS3mMaxmodMixerStepQ12(sampleRate, pitch);
  if (!fixedPointStep) return 1;
  const maxmodSampleRate = (fixedPointStep * gbaMixerRate) / 4096;
  const webAudioSampleRate = sampleRate * 2 ** ((pitch - rootNote) / 12);
  return maxmodSampleRate / Math.max(1, webAudioSampleRate);
};
