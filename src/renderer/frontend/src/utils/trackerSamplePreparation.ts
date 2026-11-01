export type TrackerSamplePreparationOptions = {
  trimStart: number;
  trimEnd: number;
  gain: number;
  removeDc: boolean;
  fadeInMs: number;
  fadeOutMs: number;
};

export const TRACKER_SAMPLE_RATE = 8363;

/** Converts decoded source audio to the same mono, signed 8-bit PCM used by the XM scratch importer. */
export const prepareTrackerSamplePcm = (
  channels: readonly Float32Array[],
  sourceSampleRate: number,
  options: TrackerSamplePreparationOptions,
  targetSampleRate = TRACKER_SAMPLE_RATE,
): Int8Array => {
  if (!channels.length || !Number.isFinite(sourceSampleRate) || sourceSampleRate <= 0) return new Int8Array();
  const sourceLength = Math.min(...channels.map(channel => channel.length));
  const start = Math.max(0, Math.min(sourceLength / sourceSampleRate, options.trimStart));
  const end = Math.max(start, Math.min(sourceLength / sourceSampleRate, options.trimEnd));
  const length = Math.round((end - start) * targetSampleRate);
  if (!length || length > 131_072) throw new RangeError('The prepared sample must contain between 1 and 131072 frames.');
  const values = new Float32Array(length);
  const startFrame = start * sourceSampleRate;
  for (let frame = 0; frame < length; frame += 1) {
    const position = startFrame + frame * sourceSampleRate / targetSampleRate;
    const left = Math.min(sourceLength - 1, Math.floor(position));
    const right = Math.min(sourceLength - 1, left + 1);
    const fraction = position - left;
    let value = 0;
    for (const channel of channels) value += (channel[left] + (channel[right] - channel[left]) * fraction) / channels.length;
    values[frame] = value;
  }
  if (options.removeDc) {
    let mean = 0;
    for (const value of values) mean += value;
    mean /= values.length;
    for (let frame = 0; frame < values.length; frame += 1) values[frame] -= mean;
  }
  const gain = Math.max(0, Math.min(2, options.gain));
  const fadeInFrames = Math.min(length, Math.round(Math.max(0, Math.min(5000, options.fadeInMs)) * targetSampleRate / 1000));
  const fadeOutFrames = Math.min(length, Math.round(Math.max(0, Math.min(5000, options.fadeOutMs)) * targetSampleRate / 1000));
  const pcm = new Int8Array(length);
  for (let frame = 0; frame < length; frame += 1) {
    let envelope = 1;
    if (fadeInFrames) envelope *= Math.min(1, frame / fadeInFrames);
    if (fadeOutFrames) envelope *= Math.min(1, (length - 1 - frame) / fadeOutFrames);
    pcm[frame] = Math.max(-128, Math.min(127, Math.round(Math.max(-1, Math.min(1, values[frame] * gain * envelope)) * 127)));
  }
  return pcm;
};

export const encodeTrackerDeltaPcm = (pcm: Int8Array): Uint8Array => {
  const delta = new Uint8Array(pcm.length);
  let previous = 0;
  for (let index = 0; index < pcm.length; index += 1) {
    const value = pcm[index];
    delta[index] = (value - previous + 256) & 0xff;
    previous = value;
  }
  return delta;
};

/** Makes a WAV preview from quantized PCM so the player hears the exact sample data that will be exported. */
export const createTrackerSamplePreviewWav = (pcm: Int8Array, sampleRate = TRACKER_SAMPLE_RATE): Blob => {
  const bytes = new ArrayBuffer(44 + pcm.length);
  const view = new DataView(bytes);
  const writeText = (offset: number, value: string) => { for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index)); };
  writeText(0, 'RIFF'); view.setUint32(4, 36 + pcm.length, true); writeText(8, 'WAVE');
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  writeText(36, 'data'); view.setUint32(40, pcm.length, true);
  for (let index = 0; index < pcm.length; index += 1) view.setUint8(44 + index, pcm[index] + 128);
  return new Blob([bytes], { type: 'audio/wav' });
};

/** Wraps decoded microphone channels as a standard PCM16 WAV for the sample importer. */
export const createTrackerSourceWav = (channels: readonly Float32Array[], sampleRate: number): Blob => {
  const channelCount = channels.length;
  const frameCount = channels.length ? Math.min(...channels.map(channel => channel.length)) : 0;
  if (!channelCount || !frameCount || !Number.isInteger(sampleRate) || sampleRate <= 0) throw new RangeError('The microphone recording contains no audio.');
  const blockAlign = channelCount * 2;
  const dataBytes = frameCount * blockAlign;
  if (dataBytes > 0xffffffff - 36) throw new RangeError('The microphone recording is too large for a WAV file.');
  const bytes = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(bytes);
  const writeText = (offset: number, value: string) => { for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index)); };
  writeText(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); writeText(8, 'WAVE');
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  writeText(36, 'data'); view.setUint32(40, dataBytes, true);
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const value = Math.max(-1, Math.min(1, channels[channel][frame]));
      view.setInt16(44 + (frame * channelCount + channel) * 2, Math.round(value < 0 ? value * 32768 : value * 32767), true);
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
};
