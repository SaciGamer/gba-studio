import { TrackerPatternEvent, TrackerSample } from './trackerModule';

/**
 * Lightweight structural tracker preview. It deliberately synthesizes notes
 * instead of pretending that browser audio reproduces tracker samples/effects;
 * the runtime/ROM remains the fidelity reference.
 */
export class TrackerPreviewPlayer {
  private context: AudioContext | null = null;
  private sources: OscillatorNode[] = [];
  private gainNodes: GainNode[] = [];

  async play(rows: TrackerPatternEvent[][], channels: number, speed = 6, tempo = 125, muted: boolean[] = [], samples = new Map<number, TrackerSample>(), format: 'XM' | 'S3M' | 'IT' = 'XM', channelVolumes: number[] = [], initialPans: number[] = []): Promise<number> {
    this.stop();
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return 0;
    this.context = new AudioContextCtor();
    await this.context.resume();
    const start = this.context.currentTime + 0.025;
    let currentSpeed = Math.max(1, speed);
    let currentTempo = Math.max(32, tempo);
    let globalVolume = 64;
    let elapsed = 0;
    const channelGains: Array<GainNode | undefined> = [];
    const channelPans = Array.from({ length: channels }, (_, channel) => Math.max(-1, Math.min(1, Number(initialPans[channel]) || 0)));
    rows.slice(0, 128).forEach(row => {
      const rowDuration = Math.max(0.025, (2.5 * currentSpeed) / Math.max(32, currentTempo));
      for (let channel = 0; channel < channels; channel += 1) {
        if (muted[channel]) continue;
        const event = row[channel];
        if (!event) continue;
        const when = start + elapsed;
        const duration = Math.max(0.03, rowDuration * 0.9);
        const effect = event.effect & 0xff;
        const parameter = event.parameter & 0xff;
        if (format !== 'XM' && effect === 22 && parameter <= 64) globalVolume = parameter;
        const sampleOffsetCommand = format === 'XM' ? effect === 0x09 : effect === 0x0f; // 9xx / Oxx
        const sampleOffsetFrames = sampleOffsetCommand ? parameter * 256 : 0;
        const extendedEffect = format === 'XM' ? effect === 0x0e : effect === 19;
        const extendedCommand = extendedEffect ? parameter >> 4 : 0;
        const extendedValue = extendedEffect ? parameter & 0x0f : 0;
        const noteDelay = extendedCommand === 0x0d ? Math.min(rowDuration * 0.9, (extendedValue / Math.max(1, currentSpeed)) * rowDuration) : 0;
        const noteCut = extendedCommand === 0x0c ? Math.min(duration, (extendedValue / Math.max(1, currentSpeed)) * rowDuration) : duration;
        // XM E9x retriggers the current note every x ticks.  The browser
        // preview models this by scheduling fresh voices; the ROM remains the
        // final reference for tracker-specific phase/envelope details.
        const retriggerValue = format === 'XM'
          ? (extendedCommand === 0x09 ? extendedValue : 0)
          : (effect === 0x11 ? parameter & 0x0f : 0); // Qxy in S3M/IT
        const retriggerInterval = retriggerValue > 0
          ? Math.max(0.005, (retriggerValue / Math.max(1, currentSpeed)) * rowDuration)
          : 0;
        const retriggerCount = retriggerInterval > 0
          ? Math.max(1, Math.floor(noteCut / retriggerInterval))
          : 0;
        const keyOff = format === 'XM' ? event.note === 97 : event.note >= 254;
        if (event.note <= 0 || keyOff) {
          if (extendedCommand === 0x0c && channelGains[channel]) {
            const previous = channelGains[channel]!;
            previous.gain.cancelScheduledValues(when);
            previous.gain.setValueAtTime(Math.max(0.0001, previous.gain.value), when);
            previous.gain.exponentialRampToValueAtTime(0.0001, when + Math.max(0.005, noteCut));
          } else if (keyOff && channelGains[channel]) {
            const previous = channelGains[channel]!;
            previous.gain.cancelScheduledValues(when + noteDelay);
            previous.gain.setValueAtTime(Math.max(0.0001, previous.gain.value), when + noteDelay);
            previous.gain.exponentialRampToValueAtTime(0.0001, when + noteDelay + 0.01);
          }
          continue;
        }
        const instrumentSample = samples.get(event.instrument);
        const noteMapLength = instrumentSample?.noteMap?.length ?? 96;
        const mappedNote = Math.max(0, Math.min(noteMapLength - 1, event.note - 1));
        const mappedSampleIndex = instrumentSample?.noteMap?.[mappedNote] ?? 0;
        const noteTranspose = instrumentSample?.noteTranspose?.[mappedNote] ?? 0;
        const sample = instrumentSample?.variants?.[mappedSampleIndex] ?? instrumentSample;
        const arpeggioEffect = format === 'XM' ? effect === 0 : effect === 10; // J in S3M/IT
        const arpeggioOffset = arpeggioEffect && parameter ? ((parameter >> 4) || 0) : 0;
        const vibratoEffect = format === 'XM' ? effect === 4 : effect === 8 || effect === 11 || effect === 21; // H/K/U in S3M/IT
        const fineVibratoEffect = format !== 'XM' && effect === 21;
        const vibratoOffset = vibratoEffect ? ((parameter & 0x0f) / (fineVibratoEffect ? 128 : 64)) : 0;
        // XM 1xx/2xx and S3M/IT E/F are directional pitch slides.
        const portamentoEffect = format === 'XM' ? effect === 1 || effect === 2 : effect === 5 || effect === 6;
        const portamentoOffset = portamentoEffect
          ? (format === 'XM'
            ? (effect === 1 ? (parameter & 0xff) : -(parameter & 0xff)) / 8
            : (effect === 6 ? (parameter & 0xff) : -(parameter & 0xff)) / 8)
          : 0;
        // XM E1x/E2x are fine portamento slides applied on the first tick.
        const finePortamentoOffset = format === 'XM' && effect === 0x0e && (extendedCommand === 0x01 || extendedCommand === 0x02)
          ? (extendedCommand === 0x02 ? extendedValue : -extendedValue) / 16
          : 0;
        const fineTuneOffset = format === 'XM' && effect === 0x0e && extendedCommand === 0x05
          ? ((extendedValue >= 8 ? extendedValue - 16 : extendedValue) / 8)
          : 0;
        const tickDuration = rowDuration / Math.max(1, currentSpeed);
        const portamentoProgress = (offset: number): number => portamentoEffect
          ? Math.max(0, Math.min(1, offset / Math.max(tickDuration, duration)))
          : 0;
        const arpeggioHigh = arpeggioEffect ? ((parameter >> 4) & 0x0f) : 0;
        const arpeggioLow = arpeggioEffect ? (parameter & 0x0f) : 0;
        const vibratoSpeed = vibratoEffect ? ((parameter >> 4) & 0x0f) : 0;
        const vibratoDepth = vibratoEffect ? (parameter & 0x0f) / (fineVibratoEffect ? 2 : 1) : 0;
        const pitchAt = (offset: number): number => {
          let semitones = event.note + noteTranspose + fineTuneOffset + finePortamentoOffset + portamentoOffset * portamentoProgress(offset);
          if (arpeggioEffect) {
            const phase = Math.floor(Math.max(0, offset) / Math.max(0.0001, tickDuration)) % 3;
            semitones += phase === 1 ? arpeggioHigh : phase === 2 ? arpeggioLow : 0;
          }
          if (vibratoEffect && vibratoDepth > 0 && vibratoSpeed > 0) {
            semitones += Math.sin((Math.max(0, offset) / Math.max(0.0001, tickDuration)) * vibratoSpeed * Math.PI / 2) * (vibratoDepth / 16);
          }
          const volumeVibrato = format === 'XM' && volumeColumn >= 0xb0 && volumeColumn <= 0xbf;
          if (volumeVibrato) {
            const volumeVibratoSpeed = (volumeColumn >> 4) & 0x0f;
            const volumeVibratoDepth = volumeColumn & 0x0f;
            if (volumeVibratoSpeed > 0 && volumeVibratoDepth > 0) {
              semitones += Math.sin((Math.max(0, offset) / Math.max(0.0001, tickDuration)) * volumeVibratoSpeed * Math.PI / 2) * (volumeVibratoDepth / 16);
            }
          }
          return semitones;
        };
        const schedulePitch = (pitchParam: AudioParam, baseFrequency: number, when: number, length: number) => {
          const steps = Math.max(1, Math.min(64, Math.ceil(length / Math.max(0.005, tickDuration / 2))));
          pitchParam.setValueAtTime(Math.pow(2, (pitchAt(0) - (sample?.rootNote ?? 49)) / 12), when);
          for (let step = 1; step <= steps; step += 1) {
            const offset = (length * step) / steps;
            const target = baseFrequency * Math.pow(2, (pitchAt(offset) - (sample?.rootNote ?? 49)) / 12);
            pitchParam.linearRampToValueAtTime(target / baseFrequency, when + offset);
          }
        };
        const volumeSlideEffect = format === 'XM' ? effect === 0x0a : effect === 4 || effect === 11 || effect === 12; // D/K/L in S3M/IT
        const volumeSlide = volumeSlideEffect ? ((parameter >> 4) - (parameter & 0x0f)) : 0;
        // XM EAx/EBx are fine volume slides applied once on the row's first tick.
        const fineVolumeSlide = format === 'XM' && effect === 0x0e && (extendedCommand === 0x0a || extendedCommand === 0x0b)
          ? (extendedCommand === 0x0a ? -extendedValue : extendedValue)
          : 0;
        const tremoloEffect = format === 'XM' ? effect === 0x07 : effect === 13;
        const tremoloDepth = tremoloEffect ? Math.min(1, (parameter & 0x0f) / 15) * 0.5 : 0;
        const tremoloSpeed = tremoloEffect ? ((parameter >> 4) & 0x0f) : 0;
        const tremorEffect = format !== 'XM' && effect === 9;
        const tremorOnTicks = tremorEffect ? (parameter >> 4) & 0x0f : 0;
        const tremorOffTicks = tremorEffect ? parameter & 0x0f : 0;
        const volumeColumn = event.volume & 0xff;
        const volumeColumnSlide = format === 'XM' && volumeColumn >= 0x60 && volumeColumn <= 0x7f
          ? (volumeColumn >= 0x70 ? (volumeColumn & 0x0f) : -(volumeColumn & 0x0f))
          : 0;
        const volumeColumnFineSlide = format === 'XM' && volumeColumn >= 0x80 && volumeColumn <= 0x9f
          ? (volumeColumn >= 0x90 ? (volumeColumn & 0x0f) / 4 : -(volumeColumn & 0x0f) / 4)
          : 0;
        const panSlide = format === 'XM' && volumeColumn >= 0xd0 && volumeColumn <= 0xef
          ? (volumeColumn >= 0xe0 ? (volumeColumn & 0x0f) / 15 : -(volumeColumn & 0x0f) / 15)
          : format !== 'XM' && effect === 0x10
            ? (((parameter >> 4) & 0x0f) - (parameter & 0x0f)) / 15
            : 0;
        const eventVolume = format === 'XM'
          ? (effect === 0x0c ? parameter : volumeColumn >= 0x10 && volumeColumn <= 0x50
            ? volumeColumn - 0x10
            : Math.min(0x40, Math.max(0, 0x40 + volumeSlide + fineVolumeSlide + volumeColumnSlide + volumeColumnFineSlide)))
          : (effect === 0x0c || effect === 0x10 ? parameter : event.volume > 0 ? Math.min(64, Math.max(0, event.volume + volumeSlide)) : 64);
        const channelVolume = channelVolumes[channel] === undefined
          ? 1
          : Math.max(0, Math.min(1, Number(channelVolumes[channel]) || 0));
        const volume = Math.max(0, Math.min(1, (eventVolume / 64) * (globalVolume / 64) * ((sample?.volume ?? 64) / 64) * (1 - tremoloDepth) * channelVolume));
        const gain = this.context!.createGain();
        const noteWhen = when + noteDelay;
        const previous = channelGains[channel];
        if (previous) {
          previous.gain.cancelScheduledValues(noteWhen);
          previous.gain.setValueAtTime(Math.max(0.0001, previous.gain.value), noteWhen);
          previous.gain.exponentialRampToValueAtTime(0.0001, noteWhen + 0.005);
        }
        channelGains[channel] = gain;
        gain.gain.setValueAtTime(0.0001, noteWhen);
        const peakGain = Math.max(0.0001, 0.06 * volume / Math.max(1, channels / 4));
        gain.gain.exponentialRampToValueAtTime(peakGain, noteWhen + 0.005);
        if (volumeSlideEffect && volumeSlide !== 0) {
          const slideSteps = Math.max(1, Math.min(64, Math.floor(noteCut / Math.max(0.005, tickDuration))));
          for (let step = 1; step <= slideSteps; step += 1) {
            const offset = Math.min(noteCut, step * tickDuration);
            const slidVolume = Math.max(0, Math.min(64, eventVolume + volumeSlide * step));
            const slidGain = Math.max(0.0001, 0.06 * (slidVolume / 64) * (globalVolume / 64) * ((sample?.volume ?? 64) / 64) / Math.max(1, channels / 4));
            gain.gain.linearRampToValueAtTime(slidGain, noteWhen + offset);
          }
        }
        if (tremoloEffect && tremoloSpeed > 0 && tremoloDepth > 0) {
          const tremoloSteps = Math.max(8, Math.min(64, Math.ceil(noteCut / 0.02)));
          for (let step = 1; step <= tremoloSteps; step += 1) {
            const offset = (noteCut * step) / tremoloSteps;
            const phase = (offset / Math.max(0.0001, tickDuration)) * tremoloSpeed * Math.PI / 2;
            const modulation = 1 - tremoloDepth * (0.5 + 0.5 * Math.sin(phase));
            gain.gain.linearRampToValueAtTime(Math.max(0.0001, peakGain * modulation), noteWhen + offset);
            }
        }
        if (tremorEffect && (tremorOnTicks > 0 || tremorOffTicks > 0)) {
          const cycle = Math.max(1, tremorOnTicks + tremorOffTicks);
          const tremorSteps = Math.max(1, Math.min(64, Math.ceil(noteCut / Math.max(0.005, tickDuration))));
          for (let step = 1; step <= tremorSteps; step += 1) {
            const offset = (noteCut * step) / tremorSteps;
            const tick = Math.floor(offset / Math.max(0.0001, tickDuration)) % cycle;
            const audible = tremorOnTicks === 0 || tick < tremorOnTicks;
            gain.gain.linearRampToValueAtTime(audible ? peakGain : 0.0001, noteWhen + offset);
          }
        }
        const envelope = instrumentSample?.volumeEnvelope;
        if (envelope?.enabled && envelope.points.length > 0) {
          const lastTick = Math.max(1, envelope.points[envelope.points.length - 1].tick);
          const sustainPoint = envelope.points[envelope.sustain];
          const loopStartPoint = envelope.points[envelope.loopStart];
          const loopEndPoint = envelope.points[envelope.loopEnd];
          const sustainTick = sustainPoint?.tick ?? -1;
          const loopStartTick = loopStartPoint?.tick ?? -1;
          const loopEndTick = loopEndPoint?.tick ?? -1;
          const released = noteCut < duration || keyOff;
          const valueAt = (tick: number) => {
            let effectiveTick = Math.max(0, Math.min(lastTick, tick));
            if (!released && sustainTick >= 0 && effectiveTick >= sustainTick) effectiveTick = sustainTick;
            if (!released && loopEndTick > loopStartTick && effectiveTick > loopEndTick) {
              effectiveTick = loopStartTick + ((effectiveTick - loopStartTick) % (loopEndTick - loopStartTick));
            }
            let previous = envelope.points[0];
            for (const point of envelope.points) {
              if (point.tick >= effectiveTick) {
                if (point.tick === previous.tick) return point.value;
                const ratio = (effectiveTick - previous.tick) / (point.tick - previous.tick);
                return previous.value + (point.value - previous.value) * Math.max(0, Math.min(1, ratio));
              }
              previous = point;
            }
            return previous.value;
          };
          for (let step = 1; step <= 32; step += 1) {
            const progress = step / 32;
            const pointTime = noteWhen + progress * noteCut;
            gain.gain.linearRampToValueAtTime(Math.max(0.0001, peakGain * (valueAt(progress * lastTick) / 64)), pointTime);
          }
        }
        gain.gain.exponentialRampToValueAtTime(0.0001, noteWhen + noteCut);
        const panAmount = format === 'XM' && effect === 0x08
          ? Math.max(-1, Math.min(1, (parameter - 128) / 128))
          : format === 'XM' && volumeColumn >= 0xc0 && volumeColumn <= 0xcf
            ? (volumeColumn & 0x0f) / 7.5 - 1
          : format === 'XM' && volumeColumn >= 0xd0 && volumeColumn <= 0xef
            ? channelPans[channel]
          : (format !== 'XM' && effect === 0x18 ? Math.max(-1, Math.min(1, (parameter - 128) / 128)) : channelPans[channel]);
        const panner = typeof this.context.createStereoPanner === 'function' ? this.context.createStereoPanner() : null;
        if (panner) {
          panner.pan.value = panAmount;
          if (panSlide !== 0) {
            const panSteps = Math.max(1, Math.min(64, Math.floor(noteCut / Math.max(0.005, tickDuration))));
            for (let step = 1; step <= panSteps; step += 1) {
              const offset = Math.min(noteCut, step * tickDuration);
              panner.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, panAmount + panSlide * step)), noteWhen + offset);
            }
            channelPans[channel] = Math.max(-1, Math.min(1, panAmount + panSlide * panSteps));
          } else {
            channelPans[channel] = panAmount;
          }
          const panningEnvelope = instrumentSample?.panningEnvelope;
          if (panningEnvelope?.enabled && panningEnvelope.points.length > 0) {
            panner.pan.setValueAtTime(panAmount, noteWhen);
            const lastTick = Math.max(1, panningEnvelope.points[panningEnvelope.points.length - 1].tick);
            const sustainPoint = panningEnvelope.points[panningEnvelope.sustain];
            const loopStartPoint = panningEnvelope.points[panningEnvelope.loopStart];
            const loopEndPoint = panningEnvelope.points[panningEnvelope.loopEnd];
            const sustainTick = sustainPoint?.tick ?? -1;
            const loopStartTick = loopStartPoint?.tick ?? -1;
            const loopEndTick = loopEndPoint?.tick ?? -1;
            const released = noteCut < duration || keyOff;
            const valueAt = (tick: number) => {
              let effectiveTick = Math.max(0, Math.min(lastTick, tick));
              if (!released && sustainTick >= 0 && effectiveTick >= sustainTick) effectiveTick = sustainTick;
              if (!released && loopEndTick > loopStartTick && effectiveTick > loopEndTick) {
                effectiveTick = loopStartTick + ((effectiveTick - loopStartTick) % (loopEndTick - loopStartTick));
              }
              let previous = panningEnvelope.points[0];
              for (const point of panningEnvelope.points) {
                if (point.tick >= effectiveTick) {
                  if (point.tick === previous.tick) return point.value;
                  const ratio = (effectiveTick - previous.tick) / (point.tick - previous.tick);
                  return previous.value + (point.value - previous.value) * Math.max(0, Math.min(1, ratio));
                }
                previous = point;
              }
              return previous.value;
            };
            for (let step = 1; step <= 32; step += 1) {
              const progress = step / 32;
              const envelopePan = (valueAt(progress * lastTick) - 32) / 32;
              panner.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, panAmount + envelopePan)), noteWhen + progress * noteCut);
            }
          }
          gain.connect(panner).connect(this.context.destination);
        } else {
          gain.connect(this.context.destination);
        }
        if (sample?.samples.length) {
          const sampleRate = Math.max(1, sample.sampleRate || 8363);
          const audioBuffer = this.context.createBuffer(1, sample.samples.length, sampleRate);
          audioBuffer.copyToChannel(sample.samples, 0);
          const voiceCount = retriggerCount > 0 ? retriggerCount + 1 : 1;
          for (let voiceIndex = 0; voiceIndex < voiceCount; voiceIndex += 1) {
            const voiceWhen = noteWhen + (voiceIndex * retriggerInterval);
            if (voiceWhen >= noteWhen + noteCut) break;
            const source = this.context.createBufferSource();
            source.buffer = audioBuffer;
            source.playbackRate.value = 1;
            if (sample.loopEnd > sample.loopStart && retriggerCount === 0) {
              source.loop = true;
              source.loopStart = sample.loopStart / sampleRate;
              source.loopEnd = sample.loopEnd / sampleRate;
            }
            source.connect(gain);
            const voiceDuration = retriggerCount > 0 ? Math.min(retriggerInterval, noteCut - (voiceWhen - noteWhen)) : noteCut;
            const sourceOffset = Math.min(sample.samples.length / sampleRate, sampleOffsetFrames / sampleRate);
            schedulePitch(source.playbackRate, sampleRate, voiceWhen, Math.max(0.005, voiceDuration));
            source.start(voiceWhen, sourceOffset);
            source.stop(voiceWhen + Math.max(0.005, voiceDuration) + 0.01);
            this.sources.push(source);
          }
        } else {
          const voiceCount = retriggerCount > 0 ? retriggerCount + 1 : 1;
          for (let voiceIndex = 0; voiceIndex < voiceCount; voiceIndex += 1) {
            const voiceWhen = noteWhen + (voiceIndex * retriggerInterval);
            if (voiceWhen >= noteWhen + noteCut) break;
            const oscillator = this.context!.createOscillator();
            oscillator.type = 'square';
            const baseFrequency = 440 * Math.pow(2, (49 - 49) / 12);
            oscillator.frequency.value = baseFrequency;
            oscillator.connect(gain);
            oscillator.start(voiceWhen);
            const voiceDuration = retriggerCount > 0 ? Math.min(retriggerInterval, noteCut - (voiceWhen - noteWhen)) : noteCut;
            schedulePitch(oscillator.frequency, baseFrequency, voiceWhen, Math.max(0.005, voiceDuration));
            oscillator.stop(voiceWhen + Math.max(0.005, voiceDuration) + 0.01);
            this.sources.push(oscillator);
          }
        }
        this.gainNodes.push(gain);
      }
      // Apply global tracker timing commands after scheduling this row. XM
      // uses Fxx; S3M/IT use Axx for speed and Txx for tempo.
      row.forEach(event => {
        const effect = event?.effect & 0xff;
        const parameter = event?.parameter & 0xff;
        if (format === 'XM' && effect === 0x0f && parameter > 0) {
          if (parameter < 0x20) currentSpeed = parameter;
          else currentTempo = Math.max(32, parameter);
        } else if (format !== 'XM' && effect === 0x01 && parameter > 0) {
          currentSpeed = parameter;
        } else if (format !== 'XM' && effect === 0x14 && parameter > 0) {
          currentTempo = Math.max(32, parameter);
        }
      });
      elapsed += rowDuration;
    });
    return Math.min(elapsed * 1000 + 100, 60000);
  }

  stop(): void {
    this.sources.forEach(source => {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    });
    this.gainNodes.forEach(gain => gain.disconnect());
    this.sources = [];
    this.gainNodes = [];
    void this.context?.close();
    this.context = null;
  }
}
