/** Maxmod's S3M H effect changes the Amiga period by a tick-stepped sine. */
export function s3mVibratoPeriodOffset(phase: number, depth: number): number {
  const wrappedPhase = ((Math.trunc(phase) % 256) + 256) % 256;
  const sine = Math.round(Math.sin((wrappedPhase * Math.PI * 2) / 256) * 64);
  // Maxmod's `value * depth >> 8` is an arithmetic shift, including negatives.
  return Math.floor((sine * Math.max(0, Math.trunc(depth))) / 256);
}

/** Converts Maxmod's period delta to the semitone offset used by Web Audio. */
export function s3mVibratoSemitoneOffset(note: number, sampleRate: number, phase: number, depth: number): number {
  const basePeriod = 1712 * (8363 / Math.max(1, sampleRate)) * Math.pow(2, (49 - note) / 12);
  const slide = s3mVibratoPeriodOffset(phase, depth);
  const period = slide < 0 ? basePeriod + (-slide * 16) : Math.max(1, basePeriod - slide * 16);
  return 12 * Math.log2(basePeriod / period);
}
