export interface ModSample {
  name: string;
  length: number;
  finetune: number;
  volume: number;
  loopStart: number;
  loopLength: number;
  dataOffset: number;
}

export interface ModEvent {
  period: number;
  sample: number;
  effect: number;
  parameter: number;
}

export interface ParsedMod {
  title: string;
  channels: number;
  orders: number;
  patternTable: number[];
  patterns: ModEvent[][][];
  samples: ModSample[];
  bytes: Uint8Array;
}

export function updateModEvent(module: ParsedMod, patternIndex: number, row: number, channel: number, patch: Partial<ModEvent>): ParsedMod {
  const current = module.patterns[patternIndex]?.[row]?.[channel];
  if (!current) return module;
  const next: ModEvent = {
    period: Math.max(0, Math.min(4095, Math.trunc(Number(patch.period ?? current.period)))),
    sample: Math.max(0, Math.min(31, Math.trunc(Number(patch.sample ?? current.sample)))),
    effect: Math.max(0, Math.min(15, Math.trunc(Number(patch.effect ?? current.effect)))),
    parameter: Math.max(0, Math.min(255, Math.trunc(Number(patch.parameter ?? current.parameter)))),
  };
  const bytes = new Uint8Array(module.bytes);
  const offset = 1084 + (patternIndex * 64 * module.channels + row * module.channels + channel) * 4;
  bytes[offset] = (next.sample & 0x10) | ((next.period >> 8) & 0x0f);
  bytes[offset + 1] = next.period & 0xff;
  bytes[offset + 2] = ((next.sample & 0x0f) << 4) | next.effect;
  bytes[offset + 3] = next.parameter;
  const patterns = module.patterns.map((pattern, patternNumber) => pattern.map((events, rowNumber) => events.map((event, channelNumber) => patternNumber === patternIndex && rowNumber === row && channelNumber === channel ? next : event)));
  return { ...module, bytes, patterns };
}

export function updateModSample(module: ParsedMod, sampleIndex: number, patch: { volume?: number; loopStart?: number; loopLength?: number }): ParsedMod {
  const current = module.samples[sampleIndex];
  if (!current) return module;
  const volume = Math.max(0, Math.min(64, Math.trunc(Number(patch.volume ?? current.volume))));
  const loopStart = Math.max(0, Math.min(current.length, Math.trunc(Number(patch.loopStart ?? current.loopStart)) / 2) * 2);
  const loopLength = Math.max(0, Math.min(current.length - loopStart, Math.trunc(Number(patch.loopLength ?? current.loopLength)) / 2) * 2);
  if (volume === current.volume && loopStart === current.loopStart && loopLength === current.loopLength) return module;
  const bytes = new Uint8Array(module.bytes);
  const header = 20 + sampleIndex * 30;
  bytes[20 + sampleIndex * 30 + 25] = volume;
  bytes[header + 26] = loopStart / 2 >> 8;
  bytes[header + 27] = loopStart / 2 & 0xff;
  bytes[header + 28] = loopLength / 2 >> 8;
  bytes[header + 29] = loopLength / 2 & 0xff;
  const samples = module.samples.map((sample, index) => index === sampleIndex ? { ...sample, volume, loopStart, loopLength } : sample);
  return { ...module, bytes, samples };
}

const readText = (bytes: Uint8Array, offset: number, length: number) => new TextDecoder('latin1').decode(bytes.slice(offset, offset + length)).replace(/\0/g, '').trim();
const readU16 = (bytes: Uint8Array, offset: number) => (bytes[offset] << 8) | bytes[offset + 1];

const channelsFromSignature = (signature: string): number => {
  if (/^[0-9]+CH$/.test(signature)) return Number(signature.slice(0, -2));
  if (/^FLT[0-9]$/.test(signature)) return Number(signature.slice(3));
  if (/^..CH$/.test(signature)) return Number(signature.slice(0, 2));
  if (signature === 'M.K.' || signature === 'M!K!' || signature === '4CHN') return 4;
  return 0;
};

export function parseModModule(buffer: ArrayBuffer): ParsedMod | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 1084) return null;
  const channels = channelsFromSignature(readText(bytes, 1080, 4));
  if (!channels) return null;
  const orders = bytes[950];
  const patternTable = Array.from(bytes.slice(952, 952 + 128));
  const patternCount = Math.max(0, ...patternTable.slice(0, Math.max(1, orders))) + 1;
  const patternSize = 64 * channels * 4;
  const patterns: ModEvent[][][] = [];
  let patternOffset = 1084;
  for (let patternIndex = 0; patternIndex < patternCount; patternIndex += 1) {
    const rows: ModEvent[][] = [];
    for (let row = 0; row < 64; row += 1) {
      const events: ModEvent[] = [];
      for (let channel = 0; channel < channels; channel += 1) {
        const offset = patternOffset + (row * channels + channel) * 4;
        const a = bytes[offset] ?? 0;
        const b = bytes[offset + 1] ?? 0;
        const c = bytes[offset + 2] ?? 0;
        const d = bytes[offset + 3] ?? 0;
        events.push({ period: ((a & 0x0f) << 8) | b, sample: (a & 0xf0) | (c >> 4), effect: c & 0x0f, parameter: d });
      }
      rows.push(events);
    }
    patterns.push(rows);
    patternOffset += patternSize;
  }

  const samples: ModSample[] = [];
  let sampleOffset = patternOffset;
  for (let index = 0; index < 31; index += 1) {
    const header = 20 + index * 30;
    const length = readU16(bytes, header + 22) * 2;
    const loopStart = readU16(bytes, header + 26) * 2;
    const loopLength = readU16(bytes, header + 28) * 2;
    samples.push({
      name: readText(bytes, header, 22),
      length,
      finetune: (bytes[header + 24] & 0x0f) << 4,
      volume: Math.min(64, bytes[header + 25] ?? 0),
      loopStart,
      loopLength,
      dataOffset: sampleOffset,
    });
    sampleOffset += length;
  }
  return { title: readText(bytes, 0, 20), channels, orders, patternTable, patterns, samples, bytes };
}

export class ModPlayer {
  private context: AudioContext | null = null;
  private module: ParsedMod | null = null;
  private timer: number | null = null;
  private order = 0;
  private row = 0;
  private tempo = 125;
  private speed = 6;
  private pendingOrder: number | null = null;
  private pendingRow: number | null = null;
  private nextTime = 0;
  private sampleBuffers = new Map<number, AudioBuffer>();
  private mutedChannels = new Set<number>();
  private channelVolumes = new Map<number, number>();
  private channelPans = new Map<number, number>();

  load(module: ParsedMod): void {
    this.stop();
    this.module = module;
    this.order = 0;
    this.row = 0;
    this.tempo = 125;
    this.speed = 6;
    this.pendingOrder = null;
    this.pendingRow = null;
    this.sampleBuffers.clear();
    this.mutedChannels.clear();
  }

  get playing(): boolean { return this.timer !== null; }

  setChannelMuted(channel: number, muted: boolean): void {
    if (muted) this.mutedChannels.add(channel);
    else this.mutedChannels.delete(channel);
  }

  setChannelVolume(channel: number, volume: number): void {
    this.channelVolumes.set(channel, Math.max(0, Math.min(1, Number(volume) || 0)));
  }

  setChannelPan(channel: number, pan: number): void {
    this.channelPans.set(channel, Math.max(-1, Math.min(1, Number(pan) || 0)));
  }

  async play(): Promise<void> {
    if (!this.module) return;
    if (!this.context) this.context = new AudioContext();
    await this.context.resume();
    this.nextTime = this.context.currentTime + 0.05;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.context?.suspend();
  }

  dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
  }

  private schedule(): void {
    if (!this.context || !this.module) return;
    const horizon = this.context.currentTime + 0.12;
    while (this.nextTime < horizon && this.timer !== null) {
      this.scheduleRow(this.nextTime);
      this.nextTime += (2.5 / Math.max(32, this.tempo)) * Math.max(1, this.speed);
      this.advanceRow();
    }
  }

  private advanceRow(): void {
    if (!this.module) return;
    if (this.pendingOrder !== null) {
      this.order = this.pendingOrder % Math.max(1, this.module.orders);
      this.row = this.pendingRow ?? 0;
      this.pendingOrder = null;
      this.pendingRow = null;
      return;
    }
    this.row += 1;
    if (this.row < 64) return;
    this.row = 0;
    this.order += 1;
    if (this.order >= Math.max(1, this.module.orders)) this.order = 0;
  }

  private scheduleRow(time: number): void {
    if (!this.module || !this.context) return;
    const patternIndex = this.module.patternTable[this.order] ?? 0;
    const events = this.module.patterns[patternIndex]?.[this.row] ?? [];
    for (const event of events) {
      if (event.effect === 0x0f && event.parameter > 0) {
        if (event.parameter < 32) this.speed = event.parameter;
        else this.tempo = event.parameter;
      }
      if (event.effect === 0x0b) this.pendingOrder = event.parameter;
      if (event.effect === 0x0d) {
        if (this.pendingOrder === null) this.pendingOrder = this.order + 1;
        this.pendingRow = ((event.parameter >> 4) * 10) + (event.parameter & 0x0f);
      }
    }
    events.forEach((event, channel) => {
      if (this.mutedChannels.has(channel)) return;
      if (!event.period || !event.sample) return;
      const sample = this.module!.samples[event.sample - 1];
      if (!sample || sample.length < 2) return;
      const buffer = this.getSampleBuffer(event.sample - 1);
      if (!buffer) return;
      const source = this.context!.createBufferSource();
      const gain = this.context!.createGain();
      source.buffer = buffer;
      // MOD finetune is expressed in eighths of a semitone (-8..7).
      const basePlaybackRate = (428 / event.period) * Math.pow(2, sample.finetune / 96);
      source.playbackRate.setValueAtTime(basePlaybackRate, time);
      if (sample.loopLength > 2 && sample.loopStart < sample.length) {
        source.loop = true;
        source.loopStart = sample.loopStart / 8363;
        source.loopEnd = Math.min(sample.length, sample.loopStart + sample.loopLength) / 8363;
      }
      const eventVolume = event.effect === 0x0c ? event.parameter : sample.volume;
      const channelMix = (this.channelVolumes.get(channel) ?? 1) / Math.max(1, this.module!.channels / 4);
      const volumeSlide = event.effect === 0x0a
        ? ((event.parameter >> 4) ? event.parameter >> 4 : -(event.parameter & 0x0f))
        : 0;
      const rowDuration = Math.max(0.05, (2.5 / Math.max(32, this.tempo)) * Math.max(1, this.speed));
      const tickDuration = rowDuration / Math.max(1, this.speed);
      const extendedCommand = event.effect === 0x0e ? (event.parameter >> 4) & 0x0f : 0;
      const extendedValue = event.parameter & 0x0f;
      const voiceTime = extendedCommand === 0x0d ? time + Math.min(rowDuration, extendedValue * tickDuration) : time;
      if (event.effect === 0x00 && event.parameter) {
        const arpeggio = [0, (event.parameter >> 4) & 0x0f, event.parameter & 0x0f];
        for (let tick = 1; tick <= this.speed; tick += 1) {
          const semitoneOffset = arpeggio[tick % 3];
          source.playbackRate.linearRampToValueAtTime(basePlaybackRate * Math.pow(2, semitoneOffset / 12), voiceTime + tick * tickDuration);
        }
      }
      if ((event.effect === 0x01 || event.effect === 0x02) && event.parameter) {
        const periodDirection = event.effect === 0x01 ? -1 : 1;
        for (let tick = 1; tick <= this.speed; tick += 1) {
          const period = Math.max(1, event.period + periodDirection * event.parameter * tick);
          source.playbackRate.linearRampToValueAtTime((428 / period) * Math.pow(2, sample.finetune / 96), voiceTime + tick * tickDuration);
        }
      }
      if (event.effect === 0x04 && event.parameter) {
        const vibratoSpeed = (event.parameter >> 4) & 0x0f;
        const vibratoDepth = event.parameter & 0x0f;
        for (let tick = 1; tick <= this.speed; tick += 1) {
          const phase = (tick * vibratoSpeed * Math.PI) / 2;
          const semitoneOffset = Math.sin(phase) * (vibratoDepth / 16);
          source.playbackRate.linearRampToValueAtTime(basePlaybackRate * Math.pow(2, semitoneOffset / 12), voiceTime + tick * tickDuration);
        }
      }
      const volumeAtTick = (tick: number) => Math.max(0, Math.min(64, eventVolume + volumeSlide * tick));
      const tremoloSpeed = event.effect === 0x07 ? (event.parameter >> 4) & 0x0f : 0;
      const tremoloDepth = event.effect === 0x07 ? event.parameter & 0x0f : 0;
      gain.gain.setValueAtTime(Math.min(1, volumeAtTick(0) / 64) * channelMix, voiceTime);
      if (volumeSlide || tremoloDepth) {
        for (let tick = 1; tick <= this.speed; tick += 1) {
          const tremolo = tremoloDepth ? 1 - (0.5 * (1 + Math.sin((tick * tremoloSpeed * Math.PI) / 2)) * tremoloDepth / 15) : 1;
          gain.gain.linearRampToValueAtTime(Math.min(1, volumeAtTick(tick) / 64) * tremolo * channelMix, voiceTime + tick * tickDuration);
        }
      }
      const panner = typeof this.context!.createStereoPanner === 'function' ? this.context!.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = this.channelPans.get(channel) ?? 0;
        source.connect(gain).connect(panner).connect(this.context!.destination);
      } else {
        source.connect(gain).connect(this.context!.destination);
      }
      const duration = rowDuration;
      const sampleOffset = event.effect === 0x09 ? Math.min(sample.length - 1, event.parameter * 256) / 8363 : 0;
      const playbackDuration = extendedCommand === 0x0c
        ? Math.min(duration, Math.max(0, extendedValue) * tickDuration)
        : duration * (channel === 0 ? 2 : 1);
      source.start(voiceTime, sampleOffset);
      source.stop(voiceTime + playbackDuration);
    });
  }

  private getSampleBuffer(index: number): AudioBuffer | null {
    if (!this.context || !this.module) return null;
    const cached = this.sampleBuffers.get(index);
    if (cached) return cached;
    const sample = this.module.samples[index];
    if (!sample || sample.length < 2) return null;
    const buffer = this.context.createBuffer(1, sample.length, 8363);
    const channel = buffer.getChannelData(0);
    for (let offset = 0; offset < sample.length; offset += 1) channel[offset] = ((this.module.bytes[sample.dataOffset + offset] ?? 128) - 128) / 128;
    this.sampleBuffers.set(index, buffer);
    return buffer;
  }
}
