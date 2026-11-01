export type TrackerMaxmodGbaVolumeState = {
  sampleGlobalVolume: number;
  instrumentGlobalVolume: number;
  channelVolume: number;
  channelBaseVolume: number;
  volumeCommandDelta?: number;
  moduleGlobalVolume: number;
  xmGlobalVolume: boolean;
  fade: number;
  moduleVolume: number;
};

const integer = (value: number) => Number.isFinite(value) ? Math.trunc(value) : 0;

/** Mirrors Maxmod GBA's integer volume path from mas_arm.c and mas.c. */
export function trackerMaxmodGbaMixerVolume(state: TrackerMaxmodGbaVolumeState): number {
  let channelVolume = (integer(state.channelBaseVolume) * integer(state.channelVolume)) >> 5;
  channelVolume += integer(state.volumeCommandDelta ?? 0) << 3;
  channelVolume = Math.max(0, Math.min(128, channelVolume));

  let globalVolume = integer(state.moduleGlobalVolume);
  if (state.xmGlobalVolume) globalVolume <<= 1;

  let volume = integer(state.sampleGlobalVolume) * integer(state.instrumentGlobalVolume);
  volume *= channelVolume;
  volume = (volume * globalVolume) >> 10;
  volume = (volume * integer(state.fade)) >> 10;
  volume *= integer(state.moduleVolume);

  return Math.max(0, Math.min(255, volume >> 19));
}

/** Normalizes Maxmod's per-format mixer volume to a Web Audio gain. */
export function trackerMaxmodGbaOutputGain(volume: number, format: 'MOD' | 'XM' | 'S3M' | 'IT'): number {
  const maximum = format === 'MOD' ? 128 : 255;
  return Math.max(0, Math.min(maximum, integer(volume))) / maximum;
}
