/** One PCM sample used by a FastTracker II XM instrument. */
export interface XmBeatTemplateSample {
  deltaEncodedPcm: Uint8Array;
  sixteenBit?: boolean;
  loopType?: number;
  loopStart?: number;
  loopEnd?: number;
  rootNote?: number;
  fineTune?: number;
  panning?: number;
  name?: string;
  volume?: number;
}

export interface XmBeatTemplateInstrument {
  name?: string;
  samples: Array<XmBeatTemplateSample | undefined>;
  /** Zero-based XM sample index for each of the instrument's 96 keyed notes. */
  noteMap?: number[];
  volumeEnvelope?: { points: Array<{ tick: number; value: number }>; sustain: number; loopStart: number; loopEnd: number; enabled: boolean; sustainEnabled?: boolean; loopEnabled?: boolean };
  panningEnvelope?: { points: Array<{ tick: number; value: number }>; sustain: number; loopStart: number; loopEnd: number; enabled: boolean; sustainEnabled?: boolean; loopEnabled?: boolean };
  fadeout?: number;
}

const instrumentHeaderSize = 263;
const sampleHeaderSize = 40;
const patternHeaderSize = 9;
const defaultSampleLength = 2048;
const patternOffset = 336;

/** A small FastTracker II XM seed with one sine sample for each instrument. */
export function createXmBeatTemplate(title = 'New Beat', input?: XmBeatTemplateSample | XmBeatTemplateSample[], channelCount = 4): ArrayBuffer {
  const samples = input === undefined ? [undefined] : Array.isArray(input) ? input : [input];
  return createXmBeatTemplateWithInstruments(title, samples.map(sample => ({ samples: [sample] })), channelCount);
}

/** Builds an XM seed where each instrument can map its 96 notes to up to 16 samples. */
export function createXmBeatTemplateWithInstruments(title: string, instruments: XmBeatTemplateInstrument[], channelCount = 4): ArrayBuffer {
  if (instruments.length < 1 || instruments.length > 128) throw new Error('XM beat templates support between one and 128 instruments.');
  if (!Number.isInteger(channelCount) || channelCount < 1 || channelCount > 32) throw new Error('XM beat templates support between one and 32 channels.');
  const prepared = instruments.map(instrument => {
    if (instrument.samples.length < 1 || instrument.samples.length > 16) throw new Error('XM instruments support between one and 16 samples.');
    const samples = instrument.samples.map(sample => {
      const bytes = sample?.deltaEncodedPcm.slice() ?? new Uint8Array(defaultSampleLength);
      const sampleUnit = sample?.sixteenBit ? 2 : 1;
      if (bytes.length === 0 || bytes.length % sampleUnit !== 0) throw new Error('XM beat samples must contain aligned PCM data.');
      return { sample, bytes, sampleUnit };
    });
    const noteMap = Array.from({ length: 96 }, (_, note) => Math.max(0, Math.min(samples.length - 1, Math.trunc(instrument.noteMap?.[note] ?? 0))));
    return { ...instrument, samples, noteMap };
  });

  const instrumentOffset = patternOffset + patternHeaderSize;
  const instrumentOffsets: number[] = [];
  const sampleHeaderOffsets: number[][] = [];
  const sampleDataOffsets: number[][] = [];
  let totalLength = instrumentOffset;
  for (const instrument of prepared) {
    instrumentOffsets.push(totalLength);
    const headersOffset = totalLength + instrumentHeaderSize;
    sampleHeaderOffsets.push(instrument.samples.map((_, sampleIndex) => headersOffset + sampleIndex * sampleHeaderSize));
    let dataOffset = headersOffset + instrument.samples.length * sampleHeaderSize;
    sampleDataOffsets.push(instrument.samples.map(sample => {
      const current = dataOffset;
      dataOffset += sample.bytes.length;
      return current;
    }));
    totalLength = dataOffset;
  }

  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string, length: number) => {
    for (let index = 0; index < Math.min(value.length, length); index += 1) bytes[offset + index] = value.charCodeAt(index) & 0xff;
  };
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);

  ascii(0, 'Extended Module: ', 17);
  ascii(17, title, 20);
  bytes[37] = 0x1a;
  ascii(38, 'GBA Studio Beat Editor', 20);
  u16(58, 0x0104);
  u32(60, 276);
  u16(64, 1);
  u16(66, 0);
  u16(68, channelCount);
  u16(70, 1);
  u16(72, prepared.length);
  u16(74, 1);
  u16(76, 6);
  u16(78, 125);
  bytes.fill(0, 80, patternOffset);

  u32(patternOffset, patternHeaderSize);
  bytes[patternOffset + 4] = 0;
  u16(patternOffset + 5, 64);
  u16(patternOffset + 7, 0);

  prepared.forEach((instrument, instrumentIndex) => {
    const instrumentOffsetForItem = instrumentOffsets[instrumentIndex];
    u32(instrumentOffsetForItem, instrumentHeaderSize);
    ascii(instrumentOffsetForItem + 4, instrument.name ?? 'Beat Instrument', 22);
    bytes[instrumentOffsetForItem + 26] = 0;
    u16(instrumentOffsetForItem + 27, instrument.samples.length);
    u32(instrumentOffsetForItem + 29, sampleHeaderSize);
    instrument.noteMap.forEach((sampleIndex, note) => { bytes[instrumentOffsetForItem + 33 + note] = sampleIndex; });
    const writeEnvelope = (envelope: NonNullable<XmBeatTemplateInstrument['volumeEnvelope']>, pointOffset: number, countOffset: number, sustainOffset: number, loopStartOffset: number, loopEndOffset: number, flagsOffset: number) => {
      const points = envelope.points.slice(0, 12);
      points.forEach((point, index) => {
        u16(instrumentOffsetForItem + pointOffset + index * 4, Math.max(0, Math.min(65535, Math.trunc(point.tick))));
        u16(instrumentOffsetForItem + pointOffset + index * 4 + 2, Math.max(0, Math.min(64, Math.round(point.value))));
      });
      bytes[instrumentOffsetForItem + countOffset] = points.length;
      bytes[instrumentOffsetForItem + sustainOffset] = Math.max(0, Math.min(Math.max(0, points.length - 1), Math.trunc(envelope.sustain)));
      bytes[instrumentOffsetForItem + loopStartOffset] = Math.max(0, Math.min(Math.max(0, points.length - 1), Math.trunc(envelope.loopStart)));
      bytes[instrumentOffsetForItem + loopEndOffset] = Math.max(0, Math.min(Math.max(0, points.length - 1), Math.trunc(envelope.loopEnd)));
      bytes[instrumentOffsetForItem + flagsOffset] = (envelope.enabled && points.length ? 1 : 0) | (envelope.sustainEnabled ? 2 : 0) | (envelope.loopEnabled ? 4 : 0);
    };
    writeEnvelope(instrument.volumeEnvelope ?? { points: [], sustain: 0, loopStart: 0, loopEnd: 0, enabled: false }, 129, 225, 227, 228, 229, 233);
    writeEnvelope(instrument.panningEnvelope ?? { points: [], sustain: 0, loopStart: 0, loopEnd: 0, enabled: false }, 177, 226, 230, 231, 232, 234);
    u16(instrumentOffsetForItem + 239, Math.max(0, Math.min(65535, Math.trunc(instrument.fadeout ?? 0))));

    instrument.samples.forEach(({ sample, bytes: sampleBytes, sampleUnit }, sampleIndex) => {
      const header = sampleHeaderOffsets[instrumentIndex][sampleIndex];
      const data = sampleDataOffsets[instrumentIndex][sampleIndex];
      const sampleLength = sampleBytes.length;
      const sampleCount = sampleLength / sampleUnit;
      const loopStart = Math.max(0, Math.min(sampleCount, Math.trunc(sample?.loopStart ?? 0)));
      const loopEnd = Math.max(loopStart, Math.min(sampleCount, Math.trunc(sample?.loopEnd ?? sampleCount)));
      u32(header, sampleLength);
      u32(header + 4, loopStart * sampleUnit);
      u32(header + 8, (loopEnd - loopStart) * sampleUnit);
      bytes[header + 12] = Math.max(0, Math.min(64, Math.trunc(sample?.volume ?? 64)));
      const loopType = loopEnd - loopStart >= 2 ? sample?.loopType ?? (sample ? 0 : 1) : 0;
      bytes[header + 14] = (loopType & 0x03) | (sampleUnit === 2 ? 0x10 : 0);
      bytes[header + 13] = Math.max(-128, Math.min(127, Math.trunc(sample?.fineTune ?? 0))) & 0xff;
      bytes[header + 15] = Math.max(0, Math.min(255, Math.trunc(sample?.panning ?? 128)));
      bytes[header + 16] = Math.max(-96, Math.min(95, Math.trunc((sample?.rootNote ?? 48) - 48))) & 0xff;
      ascii(header + 18, sample?.name ?? 'Sine', 22);
      if (sample) bytes.set(sampleBytes, data);
      else {
        let previous = 0;
        for (let index = 0; index < sampleLength; index += 1) {
          const value = Math.round(Math.sin((index / sampleLength) * Math.PI * 2 * 8) * 92);
          bytes[data + index] = (value - previous + 256) & 0xff;
          previous = value;
        }
      }
    });
  });
  return bytes.buffer;
}
