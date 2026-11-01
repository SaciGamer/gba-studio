import type { TrackerModuleInfo } from '@/utils/trackerModule';

export type TrackerSampleTargetFormat = Exclude<TrackerModuleInfo['format'], 'unknown'>;

export type TrackerSampleConversionEstimate = {
  frames: number;
  payloadBytes: number;
  maxFrames: number;
  encodingKey: string;
};

export type TrackerSampleModuleSizeEstimate = {
  beforeBytes: number;
  afterBytes: number;
  deltaBytes: number;
};

/** Describes the exact mono 8-bit payload produced by the current sample import path. */
export const estimateTrackerSampleConversion = (
  format: TrackerSampleTargetFormat,
  frames: number,
): TrackerSampleConversionEstimate => {
  const safeFrames = Math.max(0, Math.floor(Number.isFinite(frames) ? frames : 0));
  const maxFrames = format === 'MOD' ? 131_070 : 131_072;
  const encodingKey = {
    MOD: 'music.sample.encoding.mod',
    XM: 'music.sample.encoding.xm',
    S3M: 'music.sample.encoding.s3m',
    IT: 'music.sample.encoding.it',
  }[format];
  return { frames: safeFrames, payloadBytes: safeFrames, maxFrames, encodingKey };
};

/** Predicts the exact file length produced by the current sample replacement writers. */
export const estimateTrackerSampleModuleSize = (
  format: TrackerSampleTargetFormat,
  moduleBytes: number,
  replacedSampleBytes: number,
  frames: number,
  itInstrumentMode = false,
): TrackerSampleModuleSizeEstimate | null => {
  const safeModuleBytes = Math.floor(moduleBytes);
  const safeOldSampleBytes = Math.floor(replacedSampleBytes);
  const safeFrames = Math.floor(Number.isFinite(frames) ? frames : 0);
  const { maxFrames } = estimateTrackerSampleConversion(format, safeFrames);
  if (!Number.isSafeInteger(safeModuleBytes) || safeModuleBytes < 0 || !Number.isSafeInteger(safeOldSampleBytes) || safeOldSampleBytes < 0 || !Number.isSafeInteger(safeFrames) || safeFrames <= 0 || safeFrames > maxFrames) return null;

  let afterBytes: number;
  switch (format) {
    case 'MOD':
      if (safeOldSampleBytes > safeModuleBytes) return null;
      afterBytes = safeModuleBytes - safeOldSampleBytes + Math.ceil(safeFrames / 2) * 2;
      break;
    case 'XM':
      if (safeOldSampleBytes > safeModuleBytes) return null;
      afterBytes = safeModuleBytes - safeOldSampleBytes + safeFrames;
      break;
    case 'S3M':
      afterBytes = Math.ceil(safeModuleBytes / 16) * 16 + safeFrames;
      break;
    case 'IT':
      afterBytes = (itInstrumentMode
        ? Math.ceil((safeModuleBytes + 4) / 4) * 4 + 0x50
        : Math.ceil(safeModuleBytes / 4) * 4) + safeFrames;
      break;
  }
  if (!Number.isSafeInteger(afterBytes)) return null;
  return { beforeBytes: safeModuleBytes, afterBytes, deltaBytes: afterBytes - safeModuleBytes };
};
