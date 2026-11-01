type ItEvent = {
  note: number;
  instrument: number;
  volume: number;
  volumePresent: boolean;
  effect: number;
  parameter: number;
  effectPresent: boolean;
};

const text = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
const u16le = (bytes: Uint8Array, offset: number) => offset >= 0 && offset + 2 <= bytes.length ? bytes[offset] | (bytes[offset + 1] << 8) : -1;
const u32le = (bytes: Uint8Array, offset: number) => offset >= 0 && offset + 4 <= bytes.length
  ? (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
  : -1;
const writeU32le = (bytes: Uint8Array, offset: number, value: number) => {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
  bytes[offset + 3] = (value >>> 24) & 0xff;
};

/** Converts IT instrument maps to explicit sample references for the GBA audio build. */
export function flattenItInstrumentModeForBuild(buffer: ArrayBuffer): ArrayBuffer | null {
  const bytes = new Uint8Array(buffer);
  if (text(bytes, 0, 4) !== 'IMPM' || bytes.length < 192) return null;
  const orders = u16le(bytes, 0x20);
  const instruments = u16le(bytes, 0x22);
  const samples = u16le(bytes, 0x24);
  const patterns = u16le(bytes, 0x26);
  if (!instruments) return buffer;
  if (!samples) return null;
  const instrumentTable = 192 + orders;
  const sampleTable = instrumentTable + instruments * 4;
  const patternTable = sampleTable + samples * 4;
  if (patternTable + patterns * 4 > bytes.length) return null;

  const maps: Array<{ notes: Uint8Array; samples: Uint8Array; fallback: number }> = [];
  for (let instrument = 0; instrument < instruments; instrument += 1) {
    const header = u32le(bytes, instrumentTable + instrument * 4);
    if (header < 0 || header + 304 > bytes.length || text(bytes, header, 4) !== 'IMPI') return null;
    const notes = new Uint8Array(120);
    const mappedSamples = new Uint8Array(120);
    for (let note = 0; note < 120; note += 1) {
      notes[note] = bytes[header + 64 + note * 2];
      mappedSamples[note] = bytes[header + 65 + note * 2];
    }
    const fallback = mappedSamples.find(sample => sample > 0 && sample <= samples) ?? 0;
    maps.push({ notes, samples: mappedSamples, fallback });
  }

  const samplePointers = Array.from({ length: samples }, (_, sample) => u32le(bytes, sampleTable + sample * 4));
  if (samplePointers.some(pointer => pointer < 0 || pointer + 0x50 > bytes.length || text(bytes, pointer, 4) !== 'IMPS')) return null;
  const convertedPatterns: Uint8Array[] = [];
  const currentInstrument = new Uint8Array(64);
  const currentSample = new Uint8Array(64);

  for (let pattern = 0; pattern < patterns; pattern += 1) {
    const patternOffset = u32le(bytes, patternTable + pattern * 4);
    if (patternOffset < 0 || patternOffset + 8 > bytes.length) return null;
    const packedLength = u16le(bytes, patternOffset);
    const rowCount = u16le(bytes, patternOffset + 2);
    if (packedLength < 0 || !rowCount || rowCount > 256 || patternOffset + 8 + packedLength > bytes.length) return null;
    const end = patternOffset + 8 + packedLength;
    let cursor = patternOffset + 8;
    let row = 0;
    const previousMask = new Uint8Array(64);
    const previous = Array.from({ length: 64 }, (): ItEvent => ({ note: 0, instrument: 0, volume: 0, volumePresent: false, effect: 0, parameter: 0, effectPresent: false }));
    const output: number[] = [];
    while (row < rowCount && cursor < end) {
      const channelByte = bytes[cursor++];
      if (channelByte === 0) { output.push(0); row += 1; continue; }
      const channel = ((channelByte & 0x7f) - 1) & 0x3f;
      const mask = channelByte & 0x80 ? (cursor < end ? bytes[cursor++] : -1) : previousMask[channel];
      if (mask < 0) return null;
      previousMask[channel] = mask;
      const event: ItEvent = { note: 0, instrument: 0, volume: 0, volumePresent: false, effect: 0, parameter: 0, effectPresent: false };
      if (mask & 1) { if (cursor >= end) return null; event.note = bytes[cursor++]; }
      else if (mask & 16) event.note = previous[channel].note;
      if (mask & 2) { if (cursor >= end) return null; event.instrument = bytes[cursor++]; }
      else if (mask & 32) event.instrument = previous[channel].instrument;
      if (mask & 4) { if (cursor >= end) return null; event.volume = bytes[cursor++]; event.volumePresent = true; }
      else if (mask & 64) { event.volume = previous[channel].volume; event.volumePresent = previous[channel].volumePresent; }
      if (mask & 8) { if (cursor + 2 > end) return null; event.effect = bytes[cursor++]; event.parameter = bytes[cursor++]; event.effectPresent = true; }
      else if (mask & 128) { event.effect = previous[channel].effect; event.parameter = previous[channel].parameter; event.effectPresent = previous[channel].effectPresent; }
      previous[channel] = event;

      if (event.instrument > 0 && event.instrument <= instruments) currentInstrument[channel] = event.instrument;
      if (event.note > 0 && event.note < 120) {
        const mapping = maps[currentInstrument[channel] - 1];
        if (mapping) {
          const noteIndex = Math.min(119, event.note);
          event.note = mapping.notes[noteIndex];
          event.instrument = mapping.samples[noteIndex] <= samples ? mapping.samples[noteIndex] : 0;
          if (event.instrument) currentSample[channel] = event.instrument;
        } else event.instrument = 0;
      } else if (event.instrument > 0) {
        event.instrument = maps[currentInstrument[channel] - 1]?.fallback ?? 0;
        if (event.instrument) currentSample[channel] = event.instrument;
      } else if (event.note >= 0xfd && currentSample[channel]) event.instrument = currentSample[channel];

      const hasNote = event.note !== 0;
      const hasInstrument = event.instrument !== 0;
      const hasVolume = event.volumePresent;
      const hasEffect = event.effectPresent;
      if (!hasNote && !hasInstrument && !hasVolume && !hasEffect) continue;
      let eventMask = 0;
      if (hasNote) eventMask |= 1;
      if (hasInstrument) eventMask |= 2;
      if (hasVolume) eventMask |= 4;
      if (hasEffect) eventMask |= 8;
      output.push((channel + 1) | 0x80, eventMask);
      if (hasNote) output.push(event.note & 0xff);
      if (hasInstrument) output.push(event.instrument & 0xff);
      if (hasVolume) output.push(event.volume & 0xff);
      if (hasEffect) output.push(event.effect & 0xff, event.parameter & 0xff);
    }
    if (row !== rowCount || cursor > end || output.length > 0xffff) return null;
    convertedPatterns.push(Uint8Array.from(output));
  }

  const result = new Uint8Array(bytes.length + (bytes.length & 1) + convertedPatterns.reduce((total, pattern) => total + 8 + pattern.length + (pattern.length & 1), 0));
  result.set(bytes);
  result[0x22] = 0;
  result[0x23] = 0;
  const flags = u16le(bytes, 0x2c) & ~0x04;
  result[0x2c] = flags & 0xff;
  result[0x2d] = flags >>> 8;
  samplePointers.forEach((header, sample) => writeU32le(result, instrumentTable + sample * 4, header));
  const flattenedPatternTable = instrumentTable + samples * 4;
  let appendOffset = bytes.length;
  for (let pattern = 0; pattern < patterns; pattern += 1) {
    if (appendOffset & 1) appendOffset += 1;
    if (appendOffset + 8 + convertedPatterns[pattern].length > result.length) return null;
    writeU32le(result, flattenedPatternTable + pattern * 4, appendOffset);
    const oldPatternOffset = u32le(bytes, patternTable + pattern * 4);
    result.set(bytes.subarray(oldPatternOffset, oldPatternOffset + 8), appendOffset);
    result[appendOffset] = convertedPatterns[pattern].length & 0xff;
    result[appendOffset + 1] = (convertedPatterns[pattern].length >>> 8) & 0xff;
    result.set(convertedPatterns[pattern], appendOffset + 8);
    appendOffset += 8 + convertedPatterns[pattern].length;
  }
  return result.slice(0, appendOffset).buffer;
}
