// Maxmod's default Butano GBA mixer uses 15,768 Hz. For MM_MIX_16KHZ,
// mas.c computes floor(39,420 / BPM) samples per tick and rounds down to an
// even count. Model that integer timer step instead of an idealized 2.5/BPM.
export const maxmodGbaMixRateHz = 15_768;
export const maxmodGbaBpmDivisor16Khz = 39_420;

export function maxmodGbaTickSamples16Khz(tempo: number): number {
  const bpm = Math.max(32, Math.min(255, Math.trunc(Number.isFinite(tempo) ? tempo : 125)));
  const samples = Math.floor(maxmodGbaBpmDivisor16Khz / bpm) & ~1;
  return Math.max(2, samples);
}

export function maxmodGbaTickDurationSeconds(tempo: number): number {
  return maxmodGbaTickSamples16Khz(tempo) / maxmodGbaMixRateHz;
}
