import { TRACKER_MAXMOD_GBA_MIX_RATE } from './trackerMaxmodGbaSample';

const amigaPeriods = [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 907];
const maxmodPeriodMultiplier = 133_808;
const maxmodPalPeriodDivider = 56_750_314;
const mixerStepScaleQ16 = Math.floor((4096 * 65_536) / TRACKER_MAXMOD_GBA_MIX_RATE);

/** Returns Maxmod's GBA Q12 read step for a MOD note and sample fine tune. */
export const trackerModMaxmodMixerStepQ12 = (sampleRate: number, pitch: number, fineTune = 0) => {
  if (!Number.isFinite(sampleRate) || sampleRate < 4 || !Number.isFinite(pitch) || !Number.isFinite(fineTune)) return 0;

  // mmutil stores MOD note C5 speed as an integer, in quarter-Hz units.
  const tunedSampleRate = Math.trunc(sampleRate * 2 ** (fineTune / 192));
  const tuning = Math.floor(tunedSampleRate / 4) * 4;
  const maxmodNote = Math.trunc(pitch) + 11;
  if (!tuning || maxmodNote < 0 || maxmodNote > 119) return 0;

  // mmutil's MOD period-to-note conversion maps editor pitch 49 (A-3) to
  // Maxmod note 60. Maxmod then uses its shared ST3/Amiga table and PAL divider.
  const periodBase = (amigaPeriods[maxmodNote % 12] * 8 * maxmodPeriodMultiplier) >> Math.floor(maxmodNote / 12);
  const period = Math.floor(periodBase / tuning);
  if (!period) return 0;

  const mixerValue = Math.floor(maxmodPalPeriodDivider / period);
  return Math.floor((mixerStepScaleQ16 * mixerValue) / 65_536);
};

/** Ratio to apply to a sample buffer quantized at rootPitch. */
export const trackerModMaxmodPlaybackRateScale = (sampleRate: number, pitch: number, rootPitch = 49, fineTune = 0) => {
  if (!Number.isFinite(rootPitch)) return 1;
  const rootStep = trackerModMaxmodMixerStepQ12(sampleRate, rootPitch, fineTune);
  const targetStep = trackerModMaxmodMixerStepQ12(sampleRate, pitch, fineTune);
  return rootStep > 0 && targetStep > 0 ? targetStep / rootStep : 1;
};

/** Quantized sample rate at the MOD sample's root pitch. */
export const trackerModMaxmodBasePlaybackScale = (sampleRate: number, rootPitch = 49, fineTune = 0) => {
  const step = trackerModMaxmodMixerStepQ12(sampleRate, rootPitch, fineTune);
  return step > 0 ? (step * TRACKER_MAXMOD_GBA_MIX_RATE) / (4096 * sampleRate) : 1;
};
