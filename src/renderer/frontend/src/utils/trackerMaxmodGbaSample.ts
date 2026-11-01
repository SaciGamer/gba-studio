export const TRACKER_MAXMOD_GBA_MIX_RATE = 15_768;
const sampleFractionBits = 12;
const sampleFractionScale = 1 << sampleFractionBits;

/** Renders one quantized sample with Maxmod GBA's nearest-neighbor fixed-point reader. */
export const createTrackerMaxmodGbaSample = (samples: Float32Array, stepQ12: number) => {
  if (!(samples instanceof Float32Array) || samples.length === 0 || !Number.isInteger(stepQ12) || stepQ12 <= 0) {
    return { sampleRate: TRACKER_MAXMOD_GBA_MIX_RATE, stepQ12: 0, samples: new Float32Array() };
  }
  const outputFrames = Math.ceil((samples.length * sampleFractionScale) / stepQ12);
  const output = new Float32Array(outputFrames);
  for (let frame = 0; frame < outputFrames; frame += 1) {
    const sourceIndex = (frame * stepQ12) >>> sampleFractionBits;
    if (sourceIndex >= samples.length) break;
    output[frame] = samples[sourceIndex];
  }
  return { sampleRate: TRACKER_MAXMOD_GBA_MIX_RATE, stepQ12, samples: output };
};
