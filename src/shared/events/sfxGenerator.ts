export const SFX_WAVEFORMS = ['square', 'sine', 'triangle', 'sawtooth', 'noise', 'custom'] as const;
export type SfxWaveform = typeof SFX_WAVEFORMS[number];
export const DEFAULT_SFX_HARMONICS = [100, 0, 0, 0, 0, 0];
// The project's Maxmod 16 kHz mode uses timer period 1064: ~15768 Hz.
// Keep authored tones below its ~7884 Hz Nyquist limit without raising CPU cost.
export const SFX_LIMITS = { minFrequency: 40, maxFrequency: 7800, minDurationMs: 10, maxDurationMs: 3000 } as const;
export const LEGACY_SFX_MAX_FREQUENCY = 8000;
export const isSfxWaveform = (value: unknown): value is SfxWaveform => SFX_WAVEFORMS.includes(value as SfxWaveform);
export const isSfxHarmonics = (value: unknown): boolean => value === undefined || Array.isArray(value)
  && value.length === DEFAULT_SFX_HARMONICS.length && value.every(level => typeof level === 'number' && Number.isFinite(level) && level >= 0 && level <= 100);

export interface SfxParameters {
  waveform: SfxWaveform;
  frequency: number;
  durationMs: number;
  fadeInMs: number;
  fadeOutMs: number;
  volume: number;
  sampleRate: number;
  seed: number;
  harmonics?: number[];
}

export interface GeneratedSfx { parameters: SfxParameters; pcm: Float32Array; peak: number; rms: number }

export const defaultSfxParameters: SfxParameters = {
  waveform: 'square', frequency: 440, durationMs: 300, fadeInMs: 8, fadeOutMs: 120, volume: 100, sampleRate: 22050, seed: 0x4a4241,
};

function periodicWaveTable(waveform: SfxWaveform, frequency: number): Float64Array | null {
  if (!['square', 'sawtooth', 'triangle'].includes(waveform)) return null;
  const size = 2048;
  const table = new Float64Array(size);
  const maxHarmonic = Math.floor(SFX_LIMITS.maxFrequency / frequency);
  for (let harmonic = 1; harmonic <= maxHarmonic; harmonic++) {
    if (waveform !== 'sawtooth' && harmonic % 2 === 0) continue;
    const amplitude = waveform === 'triangle' ? -8 / (Math.PI ** 2 * harmonic ** 2)
      : waveform === 'square' ? 4 / (Math.PI * harmonic) : -2 / (Math.PI * harmonic);
    for (let index = 0; index < size; index++) {
      const phase = 2 * Math.PI * harmonic * index / size;
      table[index] += amplitude * (waveform === 'triangle' ? Math.cos(phase) : Math.sin(phase));
    }
  }
  let peak = 0;
  for (const value of table) peak = Math.max(peak, Math.abs(value));
  if (peak > 0) for (let index = 0; index < size; index++) table[index] /= peak;
  return table;
}

export function generateSfx(parameters: SfxParameters): GeneratedSfx {
  const finite = (value: number, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const durationMs = Math.max(SFX_LIMITS.minDurationMs, Math.min(SFX_LIMITS.maxDurationMs, Math.round(finite(parameters.durationMs, defaultSfxParameters.durationMs))));
  const sampleRate = defaultSfxParameters.sampleRate;
  const frequency = Math.max(SFX_LIMITS.minFrequency, Math.min(SFX_LIMITS.maxFrequency, Math.round(finite(parameters.frequency, defaultSfxParameters.frequency))));
  const waveform = isSfxWaveform(parameters.waveform) ? parameters.waveform : 'square';
  const harmonics = DEFAULT_SFX_HARMONICS.map((fallback, index) => Math.max(0, Math.min(100, finite(parameters.harmonics?.[index] ?? fallback, fallback))));
  // The GBA mixer has a lower bandwidth than the exported 22050 Hz WAV.
  const partials = harmonics.map((level, index) => frequency * (index + 1) <= SFX_LIMITS.maxFrequency ? level / 100 : 0);
  const harmonicScale = Math.max(1, partials.reduce((sum, level) => sum + level, 0));
  const waveTable = periodicWaveTable(waveform, frequency);
  const fadeInMs = Math.max(0, Math.min(durationMs, Math.round(finite(parameters.fadeInMs, defaultSfxParameters.fadeInMs))));
  const fadeOutMs = Math.max(0, Math.min(durationMs, Math.round(finite(parameters.fadeOutMs, defaultSfxParameters.fadeOutMs))));
  const volume = Math.max(0, Math.min(100, Math.round(finite(parameters.volume, defaultSfxParameters.volume))));
  const count = Math.max(1, Math.round(durationMs * sampleRate / 1000));
  const pcm = new Float32Array(count);
  const seed = Math.trunc(finite(parameters.seed, defaultSfxParameters.seed)) >>> 0 || 1;
  let state = seed;
  let sumSquares = 0;
  let peak = 0;
  const fadeInSamples = Math.round(fadeInMs * sampleRate / 1000);
  const fadeSamples = Math.round(fadeOutMs * sampleRate / 1000);
  for (let index = 0; index < count; index += 1) {
    const time = index / sampleRate;
    const phase = time * frequency % 1;
    let value: number;
    if (waveTable) {
      const position = phase * waveTable.length;
      const left = Math.floor(position);
      const weight = position - left;
      value = waveTable[left] * (1 - weight) + waveTable[(left + 1) % waveTable.length] * weight;
    } else switch (waveform) {
      case 'sine': value = Math.sin(phase * Math.PI * 2); break;
      case 'triangle': value = 1 - 4 * Math.abs(phase - 0.5); break;
      case 'custom': value = partials.reduce((sum, level, harmonic) => sum + level * Math.sin(phase * Math.PI * 2 * (harmonic + 1)), 0) / harmonicScale; break;
      case 'sawtooth': value = phase * 2 - 1; break;
      case 'noise': state ^= state << 13; state ^= state >>> 17; state ^= state << 5; value = ((state >>> 0) / 0x7fffffff) - 1; break;
      default: value = phase < 0.5 ? 1 : -1;
    }
    const remaining = count - index;
    const fadeInEnvelope = fadeInSamples > 0 && index < fadeInSamples ? index / Math.max(1, fadeInSamples - 1) : 1;
    const fadeOutEnvelope = fadeSamples > 0 && remaining <= fadeSamples ? (fadeSamples === 1 ? 0 : (remaining - 1) / (fadeSamples - 1)) : 1;
    value = Math.trunc(value * fadeInEnvelope * fadeOutEnvelope * (volume / 100) * 0.85 * 32767) / 32767;
    if (value === 0) value = 0;
    pcm[index] = value;
    peak = Math.max(peak, Math.abs(value));
    sumSquares += value * value;
  }
  return { parameters: { ...parameters, waveform, ...(parameters.harmonics || waveform === 'custom' ? { harmonics } : {}), seed, durationMs, sampleRate, frequency, fadeInMs, fadeOutMs, volume }, pcm, peak, rms: Math.sqrt(sumSquares / count) };
}

export function encodePcm16Wav(pcm: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const ascii = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  ascii(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, pcm.length * 2, true);
  for (let index = 0; index < pcm.length; index += 1) view.setInt16(44 + index * 2, Math.max(-32768, Math.min(32767, Math.round(pcm[index] * 32767))), true);
  return buffer;
}
