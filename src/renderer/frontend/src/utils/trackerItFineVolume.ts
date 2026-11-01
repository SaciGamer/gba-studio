export function applyTrackerItFineVolume(volume: number, parameter: number): number {
  const current = Math.max(0, Math.min(64, Math.trunc(Number.isFinite(volume) ? volume : 0)));
  const command = (parameter >> 4) & 0x0f;
  const amount = parameter & 0x0f;
  if (command === 0) return Math.min(64, current + amount);
  if (command === 1) return Math.max(0, current - amount);
  return current;
}

/** Applies one IT volume-slide tick using Maxmod's shared mpph_VolumeSlide rules. */
export function applyTrackerItVolumeSlideTick(volume: number, parameter: number, tick: number, maximum = 64): number {
  const maxVolume = Math.max(0, Math.trunc(Number.isFinite(maximum) ? maximum : 64));
  const current = Math.max(0, Math.min(maxVolume, Math.trunc(Number.isFinite(volume) ? volume : 0)));
  const command = parameter & 0xff;
  const currentTick = Math.max(0, Math.trunc(Number.isFinite(tick) ? tick : 0));
  if (command === 0x0f) return Math.max(0, current - 0x0f);
  if (command === 0xf0) return currentTick === 0 ? Math.min(maxVolume, current + 0x0f) : current;
  if ((command & 0x0f) === 0) return currentTick === 0 ? current : Math.min(maxVolume, current + (command >> 4));
  if ((command >> 4) === 0) return currentTick === 0 ? current : Math.max(0, current - (command & 0x0f));
  if (currentTick !== 0) return current;
  if ((command & 0x0f) === 0x0f) return Math.min(maxVolume, current + (command >> 4));
  if ((command >> 4) === 0x0f) return Math.max(0, current - (command & 0x0f));
  return current;
}

/** IT Mxx sets channel volume only for the values Maxmod accepts. */
export function trackerItChannelVolumeSet(parameter: number): number | null {
  if (!Number.isFinite(parameter)) return null;
  const value = Math.trunc(parameter);
  return value >= 0 && value <= 64 ? value : null;
}

/** IT Vxx clamps its parameter to Maxmod's 128-step global-volume range. */
export function trackerItGlobalVolumeSet(parameter: number, maximum = 128): number {
  const maxVolume = Math.max(0, Math.trunc(Number.isFinite(maximum) ? maximum : 128));
  return Math.max(0, Math.min(maxVolume, Math.trunc(Number.isFinite(parameter) ? parameter : 0)));
}
