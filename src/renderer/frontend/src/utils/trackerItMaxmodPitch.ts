import { TRACKER_MAXMOD_GBA_MIX_RATE } from './trackerMaxmodGbaSample';

const maxmodGbaMixerScale = Math.floor((4096 * 65_536) / TRACKER_MAXMOD_GBA_MIX_RATE);
const maxmodAmigaPeriods = [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 907];

/** Maxmod's 256-step FineSineData table, reconstructed from the checked-in core. */
export const trackerItMaxmodFineSineAt = (position: number) => {
  const wrapped = Math.trunc(position) & 0xff;
  return Math.round(Math.sin((wrapped * 2 * Math.PI) / 256) * 64);
};

/** Returns Maxmod's clamped IT tremolo mixer volume (0..128) for one tick. */
export const trackerItMaxmodTremoloVolumeAt = (baseVolume: number, position: number, depth: number) => {
  const sine = trackerItMaxmodFineSineAt(position);
  const maxmodDepth = Math.max(0, Math.min(15, Math.trunc(depth)));
  const volumeAddition = Math.floor((sine * maxmodDepth) / 64);
  return Math.max(0, Math.min(128, Math.trunc(baseVolume) + (volumeAddition << 3)));
};

/** Returns the Maxmod IT sample-mode Amiga period used by E/F pitch slides. */
export const trackerItMaxmodAmigaPeriod = (sampleRate: number, pitch: number, rootNote = 61) => {
  if (!Number.isFinite(sampleRate) || sampleRate < 2 || sampleRate > 131_070 || !Number.isFinite(pitch) || !Number.isFinite(rootNote)) return 0;
  const itNote = Math.max(0, Math.min(119, Math.floor(pitch - 1)));
  const c5Speed = Math.max(1, Math.min(9_999_999, Math.round(sampleRate * 2 ** ((61 - rootNote) / 12))));
  const maxmodTuning = Math.floor(c5Speed / 4) * 4;
  if (!maxmodTuning) return 0;
  const noteOctave = Math.floor(itNote / 12);
  const periodNumerator = Math.floor((maxmodAmigaPeriods[itNote % 12] * 8 * 133_808) / (2 ** noteOctave));
  return Math.floor(periodNumerator / maxmodTuning);
};

/**
 * Returns IT Uxy's pitch offset using Maxmod's Amiga-period slide units.
 * `phase` is radians, `depth` is Uxy's low nibble, and the default IT mode
 * does not enable Maxmod's legacy doubled-depth flag.
 */
export const trackerItMaxmodFineVibratoPitch = (sampleRate: number, pitch: number, rootNote: number, phase: number, depth: number) => {
  const basePeriod = trackerItMaxmodAmigaPeriod(sampleRate, pitch, rootNote);
  if (!basePeriod || basePeriod > 32_768 || !Number.isFinite(phase) || !Number.isFinite(depth)) return pitch;
  const position = Math.round((phase * 256) / (2 * Math.PI)) & 0xff;
  const sine = trackerItMaxmodFineSineAt(position);
  const maxmodDepth = Math.max(0, Math.min(15, Math.trunc(depth))) * 4;
  // C's signed right shift rounds negative values down toward -infinity.
  const slideValue = Math.floor((sine * maxmodDepth) / 256);
  const period = slideValue > 0
    ? Math.max(1, basePeriod - (slideValue << 4))
    : Math.min(32_768, basePeriod + ((-slideValue) << 4));
  return pitch + 12 * Math.log2(basePeriod / period);
};

/** Returns Maxmod GBA's Q12 sample step for an IT one-based preview pitch. */
export const trackerItMaxmodMixerStepQ12 = (sampleRate: number, pitch: number) => {
  if (!Number.isFinite(sampleRate) || sampleRate < 2 || sampleRate > 131_070 || !Number.isFinite(pitch)) return 0;
  const itNote = Math.max(0, Math.min(119, pitch - 1));
  const itPitchTableValue = Math.round(2_048 * 2 ** (itNote / 12));
  // mmutil stores IT C5Speed / 4 in MAS; Maxmod multiplies it by 4 in mmGetPeriod.
  const masSampleFrequency = Math.floor(sampleRate / 4);
  const maxmodFrequency = Math.imul(Math.floor(itPitchTableValue / 256), masSampleFrequency * 4) >>> 8;
  return Math.imul(maxmodGbaMixerScale, maxmodFrequency) >>> 16;
};

/** Matches the rate correction between Maxmod's quantized sample and Web Audio. */
export const trackerItMaxmodPlaybackRateScale = (sampleRate: number, pitch: number, rootNote = 61) => {
  if (!Number.isFinite(sampleRate) || sampleRate < 2 || !Number.isFinite(pitch) || !Number.isFinite(rootNote)) return 1;
  const stepQ12 = trackerItMaxmodMixerStepQ12(sampleRate, pitch);
  if (!stepQ12) return 1;
  const maxmodSampleRate = (stepQ12 * TRACKER_MAXMOD_GBA_MIX_RATE) / 4_096;
  const webAudioSampleRate = sampleRate * 2 ** ((pitch - rootNote) / 12);
  return maxmodSampleRate / Math.max(1, webAudioSampleRate);
};
