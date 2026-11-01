import { trackerModMaxmodBasePlaybackScale } from './trackerModMaxmodPitch';
import { trackerS3mMaxmodPlaybackRateScale } from './trackerS3mMaxmodPitch';

// Compensate the PAL/ST3 period clock when exporting relative-tuned factory
// samples. Imported native samples keep their original tuning and clock.
export const factoryModFineTuneCorrection = Math.round(192 * Math.log2(1 / trackerModMaxmodBasePlaybackScale(8363, 49)));
export const factoryS3mRateCorrection = 1 / trackerS3mMaxmodPlaybackRateScale(8363, 49);

/** Same metadata as the materialized format, for canonical instrument auditions. */
export function factorySamplePreviewTuning(sample: {sampleRate: number; rootNote: number; fineTune: number}, format: string) {
  if (format === 'MOD') return {sampleRate: 8363, rootNote: 49,
    fineTune: Math.max(-8, Math.min(7, Math.round(sample.fineTune / 8 + factoryModFineTuneCorrection)))};
  if (format === 'S3M') return {sampleRate: Math.max(1, Math.min(65535, Math.round(sample.sampleRate
    * 2 ** ((sample.rootNote - 48 + sample.fineTune / 128) / 12) * factoryS3mRateCorrection))), rootNote: 49, fineTune: 0};
  if (format === 'IT') return {sampleRate: Math.round(sample.sampleRate * 2 ** ((12 + sample.rootNote - 48 + sample.fineTune / 128) / 12)), rootNote: 61, fineTune: 0};
  const offset = sample.rootNote - 48 + sample.fineTune / 128 + 12 * Math.log2(sample.sampleRate / 8363);
  const relativeNote = Math.max(-96, Math.min(95, Math.round(offset)));
  return {sampleRate: 8363, rootNote: 48 + relativeNote, fineTune: Math.max(-128, Math.min(127, Math.round((offset - relativeNote) * 128)))};
}

/** Convert a displayed native tuning edit back to relative factory metadata. */
export function factorySampleTuningEdit(sample: {sampleRate: number; rootNote: number; fineTune: number}, format: string, patch: {rootNote?: number; fineTune?: number}) {
  if (format === 'MOD' && Number.isFinite(patch.fineTune)) return {fineTune: (patch.fineTune! - factoryModFineTuneCorrection) * 8};
  if (format !== 'XM' || !Number.isFinite(patch.rootNote) && !Number.isFinite(patch.fineTune)) return {};
  const native = factorySamplePreviewTuning(sample, format);
  const offset = (patch.rootNote ?? native.rootNote) - 48 + (patch.fineTune ?? native.fineTune) / 128 - 12 * Math.log2(sample.sampleRate / 8363);
  const relative = Math.round(offset);
  return {rootNote: 48 + relative, fineTune: Math.round((offset - relative) * 128)};
}
