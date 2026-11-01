export type GeneratedSoundEffect = 'tone' | 'coin' | 'laser' | 'explosion' | 'noise';

export interface GeneratedSoundParameters {
  effect: GeneratedSoundEffect;
  pitch: number;
  durationFrames: number;
  sfxParameters?: string;
}

export const GENERATED_SOUND_SAMPLE_RATE = 11025;

export function normalizeGeneratedSoundParameters(args: Record<string, unknown> = {}): GeneratedSoundParameters {
  if (args.sfxParameters !== undefined) {
    if (typeof args.sfxParameters !== 'string') throw new Error('Invalid event SFX parameters.');
    let input: SfxParameters;
    try { input = JSON.parse(args.sfxParameters); } catch { throw new Error('Invalid event SFX parameters.'); }
    if (!input || typeof input !== 'object' || !isSfxWaveform(input.waveform) || !isSfxHarmonics(input.harmonics)
      || !Object.keys(defaultSfxParameters).filter(key => key !== 'waveform').every(key => typeof input[key as keyof SfxParameters] === 'number' && Number.isFinite(input[key as keyof SfxParameters]))) {
      throw new Error('Invalid event SFX parameters.');
    }
    const normalized = generateSfx(input).parameters;
    return { effect: 'tone', pitch: 60, durationFrames: 12, sfxParameters: JSON.stringify(normalized) };
  }
  const effects: GeneratedSoundEffect[] = ['tone', 'coin', 'laser', 'explosion', 'noise'];
  const requestedPitch = Number(args.pitch ?? 60);
  const requestedDuration = Number(args.durationFrames ?? 12);
  return {
    effect: effects.includes(args.effect as GeneratedSoundEffect) ? args.effect as GeneratedSoundEffect : 'tone',
    pitch: Number.isFinite(requestedPitch) ? Math.max(24, Math.min(108, Math.trunc(requestedPitch))) : 60,
    durationFrames: Number.isFinite(requestedDuration) ? Math.max(1, Math.min(120, Math.trunc(requestedDuration))) : 12,
  };
}

/** Returns the exact mono PCM samples used for editor preview and WAV export. */
export function generateEventSoundSamples(args: Record<string, unknown> = {}, sampleRate = args.sfxParameters !== undefined ? 22050 : GENERATED_SOUND_SAMPLE_RATE): Float32Array {
  const normalized = normalizeGeneratedSoundParameters(args);
  if (normalized.sfxParameters) {
    const generated = generateSfx(JSON.parse(normalized.sfxParameters));
    const length = Math.max(1, Math.round(generated.pcm.length * sampleRate / generated.parameters.sampleRate));
    return Float32Array.from({ length }, (_, index) => generated.pcm[Math.min(generated.pcm.length - 1, Math.floor(index * generated.parameters.sampleRate / sampleRate))]);
  }
  const { effect, pitch, durationFrames } = normalizeGeneratedSoundParameters(args);
  const safeSampleRate = Math.max(8000, Math.min(48000, Math.trunc(sampleRate)));
  const frameCount = Math.max(1, Math.round(durationFrames * safeSampleRate / 60));
  const samples = new Float32Array(frameCount);
  const baseFrequency = 440 * Math.pow(2, (pitch - 69) / 12);
  let noiseState = ((pitch + 1) * 2654435761 + durationFrames * 40503 + effect.length * 7919) >>> 0;
  let phase = 0;
  for (let index = 0; index < frameCount; index += 1) {
    const progress = frameCount === 1 ? 1 : index / (frameCount - 1);
    const time = index / safeSampleRate;
    const frequency = Math.min(safeSampleRate * 0.48, effect === 'laser'
      ? baseFrequency * Math.pow(0.25, progress)
      : effect === 'coin'
        ? baseFrequency * (progress < 0.42 ? 1.5 : 2)
        : effect === 'explosion'
          ? baseFrequency * Math.pow(0.18, progress)
          : baseFrequency);
    phase += 2 * Math.PI * frequency / safeSampleRate;
    noiseState ^= noiseState << 13;
    noiseState ^= noiseState >>> 17;
    noiseState ^= noiseState << 5;
    noiseState >>>= 0;
    const noise = (noiseState / 0x80000000) - 1;
    let value: number;
    if (effect === 'noise') value = noise;
    else if (effect === 'explosion') value = noise * 0.72 + Math.sin(phase) * 0.28;
    else value = Math.sin(phase);

    const attack = effect === 'tone' ? Math.min(1, time / 0.004) : Math.min(1, time / 0.0015);
    const tail = effect === 'tone' ? Math.min(1, (1 - progress) / 0.08) : Math.min(1, (1 - progress) / 0.18);
    const transient = effect === 'coin' ? Math.min(1, (1 - progress) * 3 + 0.15) : 1;
    samples[index] = Math.max(-1, Math.min(1, value * attack * tail * transient * 0.72));
  }
  return samples;
}
import { isSfxWaveform, isSfxHarmonics, defaultSfxParameters, generateSfx, type SfxParameters } from './sfxGenerator';
