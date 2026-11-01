/** Mirrors mmutil's GBA sample conversion from unsigned XM/IT data to signed PCM8. */
export const convertTrackerSampleToMaxmodGbaPcm = (samples: Float32Array, sixteenBit: boolean): Float32Array => {
  const pcm = new Float32Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Number.isFinite(samples[index]) ? samples[index] : 0;
    let signed8: number;
    if (sixteenBit) {
      // The parsed float is the signed XM/IT PCM16 value divided by 32768.
      // mmutil reconstructs unsigned PCM16, takes its high byte, then restores signedness.
      const signed16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32768)));
      signed8 = Math.floor((signed16 + 32768) / 256) - 128;
    } else {
      signed8 = Math.round(sample * 128);
    }
    // mmutil's Sample_Sign clamps the asymmetric PCM8 minimum to -127 on GBA.
    pcm[index] = Math.max(-127, Math.min(127, signed8)) / 128;
  }
  return pcm;
};
